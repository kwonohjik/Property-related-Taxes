/**
 * anchor: 지정지역 선언(`isDesignatedArea`)이 폼 → ④ 변환 → ⑫ Zod → ⑭ 라우트 → 엔진까지 **끝까지 닿는다**.
 *
 * 계획서: `docs/02-design/features/transfer-104-5-adjacent-era-gates.review.md` §5 (A3 ①)
 * ⑫⑬⑭는 TypeScript가 못 잡는다 — 한 층에서 빠지면 값이 조용히 사라지고 유예가 «절대 켜지지 않는다».
 * 그래서 층마다 따로 고정한다: R-1 단건 ④ · R-2 다건 ④ · R-3 컴패니언 ④ · R-4 ⑫⑭ 라우트(엔진 도달).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
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
import { callTransferTaxAPI } from "@/lib/calc/transfer-tax-api";
import { buildPropertyPayload } from "@/lib/calc/multi-transfer-tax-api";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import { createDefaultTransferFormData, type TransferFormData } from "@/lib/stores/calc-wizard-store";

const TRANSFER_DATE = "2012-06-01";

function landAsset(id: number, over: Partial<AssetForm> = {}): AssetForm {
  return {
    ...makeDefaultAsset(id),
    assetKind: "land",
    acquisitionDate: "2000-01-01",
    actualSalePrice: "800000000",
    fixedAcquisitionPrice: "200000000",
    isNonBusinessLand: true,
    ...over,
  } as AssetForm;
}
function makeForm(assets: AssetForm[]): TransferFormData {
  return {
    ...createDefaultTransferFormData(),
    transferDate: TRANSFER_DATE,
    assets,
    houses: [],
    presaleRights: [],
    contractTotalPrice: "800000000",
    totalTransferExpense: "0",
  } as unknown as TransferFormData;
}

/** ④ 변환이 실제로 fetch에 실은 body를 그대로 잡는다 — 재구성하지 않는다. */
async function buildBody(form: TransferFormData): Promise<Record<string, unknown>> {
  const captured: { body?: Record<string, unknown> } = {};
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init?: RequestInit) => {
      captured.body = JSON.parse(String(init?.body));
      return { ok: true, json: async () => ({ mode: "single", result: {} }) } as unknown as Response;
    }),
  );
  await callTransferTaxAPI(form);
  vi.unstubAllGlobals();
  return captured.body!;
}

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates());
});
afterEach(() => vi.unstubAllGlobals());

describe("R-1: 단건 ④ — 토지 자산의 선언이 body에 실린다", () => {
  it("지정지역 «아님» 선언은 false로 실린다", async () => {
    const body = await buildBody(makeForm([landAsset(1, { isDesignatedArea: false })]));
    expect(body.isNonBusinessLand).toBe(true);
    expect(body.isDesignatedArea).toBe(false);
  });
  it("지정지역은 true", async () => {
    const body = await buildBody(makeForm([landAsset(1, { isDesignatedArea: true })]));
    expect(body.isDesignatedArea).toBe(true);
  });
  it("미선언은 undefined — 모름을 false로 바꿔 싣지 않는다(바꾸면 유예가 켜진다)", async () => {
    const body = await buildBody(makeForm([landAsset(1)]));
    expect(body.isDesignatedArea).toBeUndefined();
  });
  it("토지·주택이 아닌 자산에 남은 잔존 선언은 싣지 않는다(화면에 없는 값이 세액을 바꾸지 않도록)", async () => {
    const body = await buildBody(makeForm([landAsset(1, { assetKind: "presale_right", isDesignatedArea: false })]));
    expect(body.isNonBusinessLand).toBe(false);
    expect(body.isDesignatedArea).toBeUndefined();
  });
  it("주택의 선언은 실린다 — 배율 초과 부수토지 파트(`nonBusinessLandPart`)가 부모 주택 입력을 펼쳐 쓰므로 닿아야 한다 · 비사업용 플래그는 꺼진 채다", async () => {
    const body = await buildBody(makeForm([landAsset(1, { assetKind: "housing", isNonBusinessLand: false, isDesignatedArea: false })]));
    expect(body.isNonBusinessLand).toBe(false);
    expect(body.isDesignatedArea).toBe(false);
  });
});

describe("R-2: 다건 ④ — 같은 게이트·같은 값", () => {
  it("토지 · false → false / 미선언 → undefined / 주택 → 같은 값 / 그 밖의 종류 → undefined", () => {
    const f = (a: AssetForm) => buildPropertyPayload(makeForm([a])) as unknown as Record<string, unknown>;
    expect(f(landAsset(1, { isDesignatedArea: false })).isDesignatedArea).toBe(false);
    expect(f(landAsset(1, { isDesignatedArea: true })).isDesignatedArea).toBe(true);
    expect(f(landAsset(1)).isDesignatedArea).toBeUndefined();
    expect(f(landAsset(1, { assetKind: "housing", isDesignatedArea: false })).isDesignatedArea).toBe(false);
    expect(f(landAsset(1, { assetKind: "presale_right", isDesignatedArea: false })).isDesignatedArea).toBeUndefined();
  });
});

describe("R-3: 컴패니언 ④ — 자기 카드의 선언이 컴패니언 payload에 실린다", () => {
  it("자산 2(컴패니언 토지)의 false가 실린다 · 자산 1과 섞이지 않는다", async () => {
    const body = await buildBody(
      makeForm([landAsset(1, { isDesignatedArea: true }), landAsset(2, { isDesignatedArea: false })]),
    );
    expect(body.isDesignatedArea).toBe(true); // primary
    const companions = (body.companionAssets ?? body.companions ?? []) as Record<string, unknown>[];
    expect(companions.length).toBeGreaterThan(0);
    expect(companions[0].isDesignatedArea).toBe(false);
  });
});

// ── R-4: ⑫ Zod → ⑭ route → 엔진 ─────────────────────────────────────
// ⚠️ 라우트는 양도일 기준 연혁 §55① 표를 로드한다(2012 양도 → 폴백 표). 엔진 직접 호출 anchor(mock 2022 표)와 절대값이 다르고
//    중과분 차이(59,750,000)만 같다 — 그래서 여기 수치는 라우트 실측값이다.
const ROUTE_BASE = {
  propertyType: "land",
  transferPrice: 800_000_000,
  transferDate: TRANSFER_DATE,
  acquisitionPrice: 200_000_000,
  acquisitionDate: "2000-01-01",
  expenses: 0,
  useEstimatedAcquisition: false,
  householdHousingCount: 0,
  isRegulatedArea: false,
  wasRegulatedAtAcquisition: false,
  isUnregistered: false,
  isNonBusinessLand: true,
  isOneHousehold: false,
  reductions: [],
  annualBasicDeductionUsed: 0,
  residencePeriodMonths: 0,
};
async function post(over: Record<string, unknown>) {
  const res = await POST(
    new NextRequest("http://localhost/api/calc/transfer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...ROUTE_BASE, ...over }),
    }),
  );
  const json = (await res.json()) as { data?: { result: Record<string, unknown> }; error?: unknown };
  expect(res.status, JSON.stringify(json.error)).toBe(200);
  return json.data!.result;
}

describe("R-4: ⑫ Zod 통과 → ⑭ 라우트 매핑 → 엔진 도달", () => {
  it("선언 없음(모름) — 중과 유지 273,350,000 + «확인 필요» 고지가 응답에 실린다", async () => {
    const r = await post({});
    expect(r.calculatedTax).toBe(273_350_000);
    expect(((r.warnings ?? []) as string[]).some((w) => /지정지역/.test(w) && /확인 필요/.test(w))).toBe(true);
  });
  it("⭐ 지정지역 «아님» — ⑫가 strip하지 않고 ⑭가 엔진까지 넘겨 213,600,000", async () => {
    const r = await post({ isDesignatedArea: false });
    expect(r.calculatedTax).toBe(213_600_000);
    expect(r.nblSurchargeExcludedBy).toBe("transfer_deferral");
  });
  it("지정지역 — 중과 유지", async () => {
    const r = await post({ isDesignatedArea: true });
    expect(r.calculatedTax).toBe(273_350_000);
  });
  it("양도일이 유예 기간 밖이면 «아님» 선언도 효과가 없다(2016-01-01)", async () => {
    const r = await post({ isDesignatedArea: false, transferDate: "2016-01-01" });
    expect(r.calculatedTax).toBe(273_350_000);
  });
});

// ── R-5·R-6: 다건 route · 일괄(컴패니언) route — ⑭ 매핑이 층마다 따로 있다 ─────────────
import { POST as MULTI_POST } from "@/app/api/calc/transfer/multi/route";

describe("R-5: 다건 route(⑫·⑭) — 선언이 엔진까지 간다", () => {
  async function multi(over: Partial<AssetForm>) {
    const payload = buildPropertyPayload(makeForm([landAsset(1, over)])) as Record<string, unknown>;
    const res = await MULTI_POST(
      new NextRequest("http://localhost/api/calc/transfer/multi", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ taxYear: 2012, properties: [{ propertyId: "p1", propertyLabel: "건1", ...payload }] }),
      }),
    );
    const json = await res.json();
    expect(res.status, JSON.stringify(json).slice(0, 300)).toBe(200);
    const data = json.data.result ?? json.data;
    return data as { calculatedTax: number; properties: { rateClause?: string; nblSurchargeExcludedBy?: string }[] };
  }
  it("지정지역 «아님» → 1호 · 유예 사유 · 중과분 59,750,000 감소", async () => {
    const off = await multi({});
    const on = await multi({ isDesignatedArea: false });
    expect(off.properties[0].rateClause).toBe("104-1-8");
    expect(on.properties[0].rateClause).toBe("104-1-1");
    expect(on.properties[0].nblSurchargeExcludedBy).toBe("transfer_deferral");
    expect(off.calculatedTax - on.calculatedTax).toBe(59_750_000);
  });
  it("지정지역 · 미선언은 중과 유지", async () => {
    expect((await multi({ isDesignatedArea: true })).properties[0].rateClause).toBe("104-1-8");
    expect((await multi({})).properties[0].rateClause).toBe("104-1-8");
  });
});

describe("R-6: 일괄(컴패니언) route — 컴패니언 토지의 선언이 자기 카드에만 닿는다", () => {
  async function bundled(companionOver: Partial<AssetForm>) {
    // 일괄양도(apportioned) — 양도시 기준시가·취득가액을 자산마다 싣는다(⑫ 요구).
    const bundledFields: Partial<AssetForm> = {
      fixedAcquisitionPrice: "200000000",
      actualSalePrice: "400000000",
      standardPriceAtTransfer: "300000000",
      standardPriceAtAcq: "150000000",
    };
    const form = makeForm([
      landAsset(1, { ...bundledFields, isDesignatedArea: true, addressJibun: "서울 강남구 테스트동 1-1" }),
      landAsset(2, { ...bundledFields, addressJibun: "서울 강남구 테스트동 2-1", ...companionOver }),
    ]);
    form.contractTotalPrice = "800000000";
    let captured: unknown = null;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_u: unknown, init: { body?: string }) => {
        captured = JSON.parse(init?.body ?? "{}");
        return { ok: true, status: 200, json: async () => ({ success: true, data: {} }) } as unknown as Response;
      }),
    );
    try {
      await callTransferTaxAPI(form);
    } catch {
      /* body만 필요하다 */
    }
    vi.unstubAllGlobals();
    const res = await POST(
      new NextRequest("http://localhost/api/calc/transfer", {
        method: "POST",
        body: JSON.stringify(captured),
        headers: { "content-type": "application/json" },
      }),
    );
    const json = (await res.json()) as {
      data?: { aggregated?: { properties?: { propertyId: string; rateClause?: string; nblSurchargeExcludedBy?: string }[] } };
      error?: unknown;
    };
    expect(res.status, JSON.stringify(json.error ?? json).slice(0, 400)).toBe(200);
    return json.data?.aggregated?.properties ?? [];
  }
  it("자산 1은 지정지역(중과 유지), 자산 2는 «아님»(유예) — 서로 섞이지 않는다", async () => {
    const props = await bundled({ isDesignatedArea: false });
    expect(props).toHaveLength(2);
    expect(props[0].rateClause).toBe("104-1-8");
    expect(props[1].rateClause).toBe("104-1-1");
    expect(props[1].nblSurchargeExcludedBy).toBe("transfer_deferral");
  });
  it("자산 2 미선언이면 둘 다 중과 유지", async () => {
    const props = await bundled({});
    expect(props.map((p) => p.rateClause)).toEqual(["104-1-8", "104-1-8"]);
  });
});

// ── R-7: 부담부증여(증여세 마법사) ④ ──────────────────────────────────────
import { buildGiftBurdenedTransferBody } from "@/lib/calc/gift-burdened-transfer-api";
import { INITIAL_FORM, type FormState } from "@/components/calc/gift-tax-form-shared";
import type { EstateItem } from "@/lib/tax-engine/types/inheritance-gift.types";

describe("R-7: 부담부증여 ④ — 토지의 선언이 body에 실린다", () => {
  const bgLand = (bgt: Record<string, unknown>): EstateItem =>
    ({
      id: "land-1",
      category: "real_estate_land",
      name: "테스트 토지",
      standardPrice: 320_000_000,
      marketValue: 400_000_000,
      leaseDeposit: 0,
      mortgageAmount: 80_000_000,
      assumedDebtForGift: 80_000_000,
      monthlyRent: 0,
      burdenedGiftTransferTax: { acquisitionDate: new Date("2005-10-20"), standardPriceAtAcquisition: 180_000_000, isNonBusinessLand: true, ...bgt },
    }) as EstateItem;
  const form = (item: EstateItem): FormState => ({ ...INITIAL_FORM, giftDate: "2012-06-01", donor: "father", giftItems: [item] }) as FormState;
  const body = (bgt: Record<string, unknown>) => buildGiftBurdenedTransferBody(bgLand(bgt), form(bgLand(bgt)));

  it("false → false · true → true · 미선언 → undefined", () => {
    expect(body({ isDesignatedArea: false }).isDesignatedArea).toBe(false);
    expect(body({ isDesignatedArea: true }).isDesignatedArea).toBe(true);
    expect(body({}).isDesignatedArea).toBeUndefined();
  });
  it("토지가 아닌 부담부증여(주택)는 선언이 남아 있어도 싣지 않는다", () => {
    const apt = {
      ...bgLand({ isDesignatedArea: false, isHousing: true, householdHousingCount: 2, isRegulatedArea: false, wasRegulatedAtAcquisition: false, residencePeriodMonths: 0, isOneHousehold: false }),
      category: "real_estate_apartment",
    } as EstateItem;
    expect(buildGiftBurdenedTransferBody(apt, form(apt)).isDesignatedArea).toBeUndefined();
  });
});
