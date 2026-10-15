/**
 * 증여세 마법사 부담부증여 — 취득가액 산정방식 「매매사례가액·감정가액」(K-6/K-7) ④·⑧ anchor (PR-4)
 *
 * 양도세 화면(PR-1/2)과 같은 엔진·Zod를 쓰지만 입력 모델이 다르다 — 증여 category에는 `general_building`이 없어
 * 금액은 **한 칸**(`presumedAcquisitionTotal`)이고, 토지는 `presumedLandAcquisitionPrice`로 싣는다.
 * 계획서: docs/00-pm/burdened-gift-appraisal-gift-wizard.plan.md
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { validateStep } from "@/components/calc/gift-tax-form-validate";
import { buildGiftBurdenedTransferBody } from "@/lib/calc/gift-burdened-transfer-api";
import { INITIAL_FORM, type FormState } from "@/components/calc/gift-tax-form-shared";
import type { EstateItem } from "@/lib/tax-engine/types/inheritance-gift.types";
import { makeMockRates } from "../tax-engine/_helpers/mock-rates";

vi.mock("@/lib/db/tax-rates", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/tax-rates")>();
  return { ...actual, preloadTaxRates: vi.fn() };
});
vi.mock("@/lib/api/rate-limit", () => ({
  checkRateLimit: vi
    .fn()
    .mockReturnValue({ allowed: true, limit: 30, remaining: 29, resetAt: Date.now() + 60_000 }),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
  shouldBypassRateLimit: vi.fn().mockReturnValue(false),
}));
import { POST } from "@/app/api/calc/transfer/route";
import { preloadTaxRates } from "@/lib/db/tax-rates";

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates());
});

const GIFT_DATE = "2024-03-01";
const form = (item: EstateItem): FormState =>
  ({ ...INITIAL_FORM, giftDate: GIFT_DATE, donor: "father", giftItems: [item] }) as FormState;
const v = (item: EstateItem) => validateStep(1, form(item));
const bgi = (body: Record<string, unknown>) => body.burdenedGiftInfo as Record<string, unknown>;

/** 주택(아파트) — 시가 5억 · 채무 2억(B/C 40%) · 취득시 기준시가 1억 · 양도시 기준시가 4억. */
function apt(bgt: Record<string, unknown> = {}, item: Record<string, unknown> = {}): EstateItem {
  return {
    id: "apt-1",
    category: "real_estate_apartment",
    name: "테스트 아파트",
    standardPrice: 400_000_000,
    marketValue: 500_000_000,
    leaseDeposit: 0,
    mortgageAmount: 200_000_000, // 채무인수액 = 담보채권액(⑧ C-4b: 두 축 일치)
    assumedDebtForGift: 200_000_000,
    monthlyRent: 0,
    burdenedGiftTransferTax: {
      acquisitionDate: new Date("2021-01-01"),
      standardPriceAtAcquisition: 100_000_000,
      isOneHousehold: false,
      householdHousingCount: 2,
      isRegulatedArea: false,
      wasRegulatedAtAcquisition: false,
      residencePeriodMonths: 0,
      ...bgt,
    },
    ...item,
  } as EstateItem;
}

function land(bgt: Record<string, unknown> = {}): EstateItem {
  return {
    id: "land-1",
    category: "real_estate_land",
    name: "테스트 토지",
    standardPrice: 320_000_000,
    marketValue: 400_000_000,
    leaseDeposit: 0,
    mortgageAmount: 80_000_000,
    assumedDebtForGift: 80_000_000,
    monthlyRent: 0,
    burdenedGiftTransferTax: {
      acquisitionDate: new Date("2018-10-20"),
      standardPriceAtAcquisition: 180_000_000,
      ...bgt,
    },
  } as EstateItem;
}

describe("④ 증여세 마법사 → 양도세 body", () => {
  it("D-1 감정가액 — 방식·총액이 burdenedGiftInfo에 실리고 실지취득가액은 안 실린다", () => {
    const body = buildGiftBurdenedTransferBody(
      apt({ acquisitionMethod: "appraisal", presumedAcquisitionTotal: 150_000_000, actualAcquisitionTotal: 999 }),
      form(apt()),
    );
    expect(bgi(body).acquisitionMethod).toBe("appraisal");
    expect(bgi(body).presumedAcquisitionTotal).toBe(150_000_000);
    expect(bgi(body).presumedLandAcquisitionPrice).toBeUndefined();
    expect(bgi(body).actualAcquisitionTotal).toBeUndefined();
  });

  it("D-1 매매사례가액 — 같은 칸", () => {
    const body = buildGiftBurdenedTransferBody(
      apt({ acquisitionMethod: "salesCase", presumedAcquisitionTotal: 150_000_000 }),
      form(apt()),
    );
    expect(bgi(body).acquisitionMethod).toBe("salesCase");
    expect(bgi(body).presumedAcquisitionTotal).toBe(150_000_000);
  });

  it("D-2 토지는 presumedLandAcquisitionPrice로 싣는다(엔진이 총액을 토지·건물로 나누지 않게)", () => {
    const body = buildGiftBurdenedTransferBody(
      land({ acquisitionMethod: "appraisal", presumedAcquisitionTotal: 250_000_000 }),
      form(land()),
    );
    expect(bgi(body).presumedLandAcquisitionPrice).toBe(250_000_000);
    expect(bgi(body).presumedBuildingAcquisitionPrice).toBe(0);
    expect(bgi(body).presumedAcquisitionTotal).toBeUndefined();
  });

  it("D-5 새 방식은 stale 자본적지출·양도비를 body에 싣지 않는다", () => {
    const body = buildGiftBurdenedTransferBody(
      apt({ acquisitionMethod: "appraisal", presumedAcquisitionTotal: 150_000_000, capitalExpenditure: 5_000_000, transferExpense: 1_000_000 }),
      form(apt()),
    );
    expect(body.capitalExpenditure).toBe(0);
    expect(body.transferExpense).toBe(0);
  });

  it("D-4 감정가액 + 신축 → 신축 필드가 body 최상위로 실린다 / 매매사례가액이면 실리지 않는다", () => {
    const selfBuilt = { isSelfBuilt: true, buildingType: "new", constructionDate: new Date("2021-01-01") };
    const appraisal = buildGiftBurdenedTransferBody(
      apt({ acquisitionMethod: "appraisal", presumedAcquisitionTotal: 150_000_000, ...selfBuilt }),
      form(apt()),
    );
    expect(appraisal.isSelfBuilt).toBe(true);
    expect(appraisal.buildingType).toBe("new");
    expect(appraisal.constructionDate).toBe("2021-01-01");
    const sales = buildGiftBurdenedTransferBody(
      apt({ acquisitionMethod: "salesCase", presumedAcquisitionTotal: 150_000_000, ...selfBuilt }),
      form(apt()),
    );
    expect(sales.isSelfBuilt).toBeUndefined();
  });

  it("D-4 토지는 감정가액이어도 신축 필드를 싣지 않는다(건물 행위)", () => {
    const body = buildGiftBurdenedTransferBody(
      land({ acquisitionMethod: "appraisal", presumedAcquisitionTotal: 250_000_000, isSelfBuilt: true, buildingType: "new", constructionDate: new Date("2021-01-01") }),
      form(land()),
    );
    expect(body.isSelfBuilt).toBeUndefined();
  });

  describe("D-6 증축한 부분의 감정가액 (§114조의2① 증축 base)", () => {
    const ext = { isSelfBuilt: true, buildingType: "extension", constructionDate: new Date("2021-01-01"), extensionFloorArea: 120, extensionStdPriceAtAcquisition: 10_000_000 };
    const withExt = (over: Record<string, unknown> = {}) =>
      apt({ acquisitionMethod: "appraisal", presumedAcquisitionTotal: 150_000_000, presumedExtensionAppraisal: 60_000_000, ...ext, ...over });
    it("감정가액 × 증축이면 burdenedGiftInfo에 싣는다", () => {
      expect(bgi(buildGiftBurdenedTransferBody(withExt(), form(apt()))).presumedExtensionAppraisalValue).toBe(60_000_000);
    });
    it("🔴 구별력 — 신축이면 stale 값이 있어도 싣지 않는다", () => {
      expect(bgi(buildGiftBurdenedTransferBody(withExt({ buildingType: "new" }), form(apt()))).presumedExtensionAppraisalValue).toBeUndefined();
    });
    it("🔴 구별력 — 매매사례가액이면 싣지 않는다", () => {
      expect(bgi(buildGiftBurdenedTransferBody(withExt({ acquisitionMethod: "salesCase" }), form(apt()))).presumedExtensionAppraisalValue).toBeUndefined();
    });
    it("🔴 구별력 — 신축·증축 토글이 꺼져 있으면(stale) 싣지 않는다", () => {
      expect(bgi(buildGiftBurdenedTransferBody(withExt({ isSelfBuilt: undefined }), form(apt()))).presumedExtensionAppraisalValue).toBeUndefined();
    });
    it("토지는 건물 행위가 아니라 싣지 않는다", () => {
      const body = buildGiftBurdenedTransferBody(
        land({ acquisitionMethod: "appraisal", presumedAcquisitionTotal: 250_000_000, presumedExtensionAppraisal: 1, ...ext }),
        form(land()),
      );
      expect(bgi(body).presumedExtensionAppraisalValue).toBeUndefined();
    });
    it("0·미입력은 싣지 않는다", () => {
      expect(bgi(buildGiftBurdenedTransferBody(withExt({ presumedExtensionAppraisal: undefined }), form(apt()))).presumedExtensionAppraisalValue).toBeUndefined();
    });
  });

  it("환산(K-5)·실지(K-4)는 종전과 같다(회귀) — 새 필드를 싣지 않는다", () => {
    const k5 = buildGiftBurdenedTransferBody(apt({ acquisitionMethod: "converted", presumedAcquisitionTotal: 150_000_000 }), form(apt()));
    expect(bgi(k5).acquisitionMethod).toBe("converted");
    expect(bgi(k5).presumedAcquisitionTotal).toBeUndefined();
    const k4 = buildGiftBurdenedTransferBody(apt({ acquisitionMethod: "actual", actualAcquisitionTotal: 80_000_000 }), form(apt()));
    expect(bgi(k4).actualAcquisitionTotal).toBe(80_000_000);
    expect(bgi(k4).presumedAcquisitionTotal).toBeUndefined();
  });
});

describe("④ → /api/calc/transfer 통합", () => {
  async function send(body: unknown) {
    const res = await POST(
      new NextRequest("http://localhost/api/calc/transfer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
    );
    return { status: res.status, json: (await res.json()) as { data?: { result?: Record<string, unknown> }; error?: unknown } };
  }

  it("문제 20 상황 1(토지) — 감정가액 250M → 양도차익 28,920,000", async () => {
    const body = buildGiftBurdenedTransferBody(
      land({ acquisitionMethod: "appraisal", presumedAcquisitionTotal: 250_000_000 }),
      { ...form(land()), giftDate: "2026-10-20" } as FormState,
    );
    const r = await send(body);
    expect(r.status, JSON.stringify(r.json.error)).toBe(200);
    expect(r.json.data!.result!.transferGain).toBe(28_920_000);
  });

  it("신축 5년 이내 아파트 × 감정가액 150M — 가산세 3,000,000 (PR-3 연결)", async () => {
    const body = buildGiftBurdenedTransferBody(
      apt({
        acquisitionMethod: "appraisal",
        presumedAcquisitionTotal: 150_000_000,
        isSelfBuilt: true,
        buildingType: "new",
        constructionDate: new Date("2021-01-01"),
      }),
      form(apt()),
    );
    const r = await send(body);
    expect(r.status, JSON.stringify(r.json.error)).toBe(200);
    expect(r.json.data!.result!.penaltyBase).toBe(60_000_000);
    expect(r.json.data!.result!.penaltyTax).toBe(3_000_000);
  });

  it("증축 5년 이내 아파트 × 감정가액 150M · 증축한 부분 60M — 가산세 1,200,000 (건물 전체 3,000,000이 아니다)", async () => {
    const body = buildGiftBurdenedTransferBody(
      apt({
        acquisitionMethod: "appraisal",
        presumedAcquisitionTotal: 150_000_000,
        presumedExtensionAppraisal: 60_000_000,
        isSelfBuilt: true,
        buildingType: "extension",
        constructionDate: new Date("2021-01-01"),
        extensionFloorArea: 120,
        extensionStdPriceAtAcquisition: 10_000_000,
      }),
      form(apt()),
    );
    const r = await send(body);
    expect(r.status, JSON.stringify(r.json.error)).toBe(200);
    expect(r.json.data!.result!.penaltyBase).toBe(24_000_000);
    expect(r.json.data!.result!.penaltyTax).toBe(1_200_000);
  });

  it("증축한 부분의 감정가액이 없으면 엔진이 건물 전체로 대신하지 않고 거절한다 (④가 칸을 못 실으면 조용히 틀리지 않는다)", async () => {
    const body = buildGiftBurdenedTransferBody(
      apt({
        acquisitionMethod: "appraisal",
        presumedAcquisitionTotal: 150_000_000,
        isSelfBuilt: true,
        buildingType: "extension",
        constructionDate: new Date("2021-01-01"),
        extensionFloorArea: 120,
        extensionStdPriceAtAcquisition: 10_000_000,
      }),
      form(apt()),
    );
    const r = await send(body);
    expect(r.status).toBeGreaterThanOrEqual(400);
    expect(JSON.stringify(r.json.error)).toMatch(/증축한 부분의 감정가액을 입력해야/);
  });
});

describe("⑧ 검증", () => {
  const ok = { acquisitionMethod: "appraisal", presumedAcquisitionTotal: 150_000_000 };
  it("V-1 감정가액·매매사례가액 + 금액 입력 → 통과", () => {
    expect(v(apt(ok))).toBeNull();
    expect(v(apt({ ...ok, acquisitionMethod: "salesCase" }))).toBeNull();
  });
  it("V-2 금액 미입력 → 차단 (자동 안분 fallback 금지)", () => {
    expect(v(apt({ acquisitionMethod: "appraisal" }))).toMatch(/감정가액을 입력하세요/);
    expect(v(apt({ acquisitionMethod: "salesCase" }))).toMatch(/매매사례가액을 입력하세요/);
  });
  it("V-3 방식 미선택 문구가 4방식을 안내한다", () => {
    expect(v(apt({}))).toMatch(/매매사례가액·감정가액/);
  });
  it("V-4 상속받은 자산 × 새 방식 → 차단(§163⑨), 환산 차단과 같은 술어", () => {
    const inherited = { acquisitionCause: "inheritance", decedentAcquisitionDate: "2010-01-01" };
    expect(v(apt({ ...ok, ...inherited }))).toMatch(/163/);
    expect(v(apt({ ...ok, acquisitionMethod: "salesCase", ...inherited }))).toMatch(/163/);
  });
  it("V-5 감정가액 + 신축 → 신축일 필수", () => {
    expect(v(apt({ ...ok, isSelfBuilt: true, buildingType: "new" }))).toMatch(/신축일/);
    expect(v(apt({ ...ok, isSelfBuilt: true, buildingType: "new", constructionDate: new Date("2021-01-01") }))).toBeNull();
  });
  it("V-6 감정가액 + 증축(85㎡ 초과) 5년 이내 → 증축한 부분의 감정가액 필수 / 매매사례가액 · 85㎡ 이하는 칸 없이 통과", () => {
    const ext = { isSelfBuilt: true, buildingType: "extension", constructionDate: new Date("2021-01-01"), extensionStdPriceAtAcquisition: 10_000_000 };
    expect(v(apt({ ...ok, ...ext, extensionFloorArea: 120 }))).toMatch(/증축한 부분의 감정가액을 입력하세요/);
    expect(v(apt({ ...ok, ...ext, extensionFloorArea: 120, presumedExtensionAppraisal: 60_000_000 }))).toBeNull();
    expect(v(apt({ ...ok, ...ext, extensionFloorArea: 120, acquisitionMethod: "salesCase" }))).toBeNull();
    expect(v(apt({ ...ok, ...ext, extensionFloorArea: 60 }))).toBeNull();
  });
  it("V-6b 증축한 부분의 감정가액이 감정가액 총액보다 크면 차단(엔진과 같은 상한), 같으면 통과", () => {
    const ext = { isSelfBuilt: true, buildingType: "extension", constructionDate: new Date("2021-01-01"), extensionStdPriceAtAcquisition: 10_000_000, extensionFloorArea: 120 };
    expect(v(apt({ ...ok, ...ext, presumedExtensionAppraisal: 150_000_001 }))).toMatch(/증축한 부분의 감정가액이 감정가액 총액\(150,000,000원\)보다 클 수 없습니다/);
    expect(v(apt({ ...ok, ...ext, presumedExtensionAppraisal: 150_000_000 }))).toBeNull();
  });
  it("V-7 새 방식도 취득시 기준시가는 필수(개산공제 base · 총액 분배)", () => {
    expect(v(apt({ ...ok, standardPriceAtAcquisition: 0 }))).toMatch(/취득시 기준시가/);
  });
});
