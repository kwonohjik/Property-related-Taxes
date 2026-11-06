/**
 * route anchor — §99의3 시기 축 (리뷰 NH-01 · NH-04, 법률 제6762호 부칙 §29) · 14지점 ④⑧⑫⑭ 격자
 *
 * 폼 → ④ 변환 → fetch body → ⑫ Zod → ⑭ route → 엔진까지 한 번에 돈다(단건·다건 route).
 * 기대값은 «법령상 적용될 사실로 바꾼 대조 시료»(같은 사실에서 종전 구간 기준일·지역 외로 둔 세액)와 맞춘 실측이다.
 * 세율표는 mock(정본 세액 아님).
 *
 * ⑧↔⑫ 격자: 2호 사용승인 2003.1.1.~6.30. 안이면 착공 여부 미응답을 validate가 막고 Zod도 400으로 막는다.
 * 범위 밖(2002.12.31. 이전·2003.7.1. 이후)·1호는 묻지 않으므로 둘 다 막지 않는다.
 */
import { it, describe, expect, vi, beforeEach } from "vitest";
import { makeMockRates } from "../tax-engine/_helpers/mock-rates";
import { preloadTaxRates } from "@/lib/db/tax-rates";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { getReductionDefault } from "@/components/calc/transfer/UnifiedReductionPanel-defaults";
import { collectStepIssues } from "@/lib/calc/transfer-tax-validate";
import { runSingle, runMulti } from "../calc/_helpers/single-multi-route-parity";
import type { TransferFormData } from "@/lib/stores/calc-wizard-form.types";
import { createHouseEntry } from "@/lib/stores/house-entry-factory";

vi.mock("@/lib/db/tax-rates", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/tax-rates")>();
  return { ...actual, preloadTaxRates: vi.fn() };
});
vi.mock("@/lib/api/rate-limit", () => ({
  checkRateLimit: vi.fn().mockReturnValue({ allowed: true, limit: 30, remaining: 29, resetAt: Date.now() + 60_000 }),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
  shouldBypassRateLimit: vi.fn().mockReturnValue(false),
}));
beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates());
});

const red993 = (over: Record<string, unknown> = {}) => ({
  ...getReductionDefault("new_99_3"),
  acquisitionType993: "from_builder", firstContract993: "yes" as const,
  standardPriceAtAcquisition993: "100,000,000",
  standardPriceAt5Years: "200,000,000",
  standardPriceAtTransfer993: "400,000,000",
  exclusiveAreaSqm993: "84",
  region993: "outside_speculation",
  ...over,
});

function form(p: {
  contract: string;
  transfer: string;
  price: string;
  acq?: string;
  fixedAcq?: string;
  redOver?: Record<string, unknown>;
}): TransferFormData {
  const base = createDefaultTransferFormData() as unknown as Record<string, unknown>;
  const asset = {
    ...makeDefaultAsset(1),
    assetKind: "housing",
    addressJibun: "경기도 수원시 팔달구 인계동 1-1",
    acquisitionCause: "purchase",
    acquisitionDate: p.acq ?? "2005-06-01",
    assetContractDate: p.contract,
    actualSalePrice: p.price,
    fixedAcquisitionPrice: p.fixedAcq ?? "300,000,000",
    standardPriceAtTransfer: "400,000,000",
    reductions: [red993(p.redOver)],
    residenceInputMode: "direct",
    residencePeriods: [],
    residencePeriodMonthsAsset: "0",
  };
  return {
    ...base,
    transferDate: p.transfer,
    contractTotalPrice: p.price,
    assets: [asset],
    houses: [
      {
        ...createHouseEntry("h1"),
        acquisitionDate: "1990-01-01",
        officialPrice: "300,000,000",
        acquisitionPrice: "300,000,000",
        exclusiveArea: "84",
        isApartment: true,
      },
    ],
    presaleRights: [],
    householdNoPresaleRightsConfirmed: true,
    isOneHousehold: true,
    householdHousingCount: "2",
    isRegulatedArea: false,
    wasRegulatedAtAcquisition: false,
  } as unknown as TransferFormData;
}

const issues = (f: TransferFormData) => {
  const out: string[] = [];
  for (let s = 0; s <= 4; s++) for (const i of collectStepIssues(s, f)) out.push(i.message);
  return out;
};
const CSB_ISSUE = (m: string) => m.includes("공사에 착수");
const d993 = (r: Record<string, unknown>) =>
  r.new993Detail as
    | {
        isEligible: boolean;
        ineligibleReasons: Array<{ code: string }>;
        priorRuleBasis?: string;
        needsConstructionStartConfirmation?: boolean;
      }
    | undefined;

describe("NH-04 route — 2003.1.1. 이후 계약분 고가주택은 양도 당시 §89①3호 (대조 시료 = 계약 2002-12-01 종전 구간)", () => {
  it("A: 계약 2003-03-15 · 양도 2024-07-01 · 8억 → 적용, 대조 시료와 같은 세액", async () => {
    const r = await runSingle(form({ contract: "2003-03-15", transfer: "2024-07-01", price: "800,000,000" }));
    const proxy = await runSingle(form({ contract: "2002-12-01", transfer: "2024-07-01", price: "800,000,000" }));
    expect(r.status).toBe(200);
    expect(d993(r.r)?.isEligible).toBe(true);
    expect(r.totalTax).toBe(83_610_998);
    expect(r.totalTax).toBe(proxy.totalTax);
  });

  it("B: 양도 2019-08-01 · 8억 → 9억 이하라 적용, 대조 시료와 같은 세액", async () => {
    const r = await runSingle(form({ contract: "2003-03-15", transfer: "2019-08-01", price: "800,000,000" }));
    const proxy = await runSingle(form({ contract: "2002-12-01", transfer: "2019-08-01", price: "800,000,000" }));
    expect(d993(r.r)?.isEligible).toBe(true);
    expect(r.totalTax).toBe(87_285_000);
    expect(r.totalTax).toBe(proxy.totalTax);
  });

  it("C: 13억 (양도 2024) → 12억 초과라 법령상도 배제 (대조군)", async () => {
    const r = await runSingle(form({ contract: "2003-03-15", transfer: "2024-07-01", price: "1,300,000,000" }));
    expect(d993(r.r)?.isEligible).toBe(false);
    expect(d993(r.r)?.ineligibleReasons.map((x) => x.code)).toEqual(["HIGH_VALUE_HOUSE"]);
    expect(r.totalTax).toBe(282_711_000);
  });

  it("D: 2호 사용승인 2003-05-01 · 착공 아니오 · 8억 (양도 2024) → 적용", async () => {
    const r = await runSingle(
      form({
        contract: "",
        transfer: "2024-07-01",
        price: "800,000,000",
        acq: "2003-05-01",
        redOver: { acquisitionType993: "self_built", usageApprovalDate993: "2003-05-01", constructionStartedBefore2003_993: "no" },
      }),
    );
    const proxy = await runSingle(
      form({
        contract: "",
        transfer: "2024-07-01",
        price: "800,000,000",
        acq: "2003-05-01",
        redOver: { acquisitionType993: "self_built", usageApprovalDate993: "2002-12-01" },
      }),
    );
    expect(d993(r.r)?.isEligible).toBe(true);
    expect(r.totalTax).toBe(proxy.totalTax);
  });

  it("E: 6억 정확 / 6억+1 (양도 2023-02) → 둘 다 12억 이하라 적용 (종전엔 6억+1이 배제)", async () => {
    const e = await runSingle(form({ contract: "2003-03-15", transfer: "2023-02-01", price: "600,000,000" }));
    const e2 = await runSingle(form({ contract: "2003-03-15", transfer: "2023-02-01", price: "600,000,001" }));
    expect(d993(e.r)?.isEligible).toBe(true);
    expect(e.totalTax).toBe(41_198_500);
    expect(d993(e2.r)?.isEligible).toBe(true);
  });
});

describe("NH-01 route — 부칙 §29① 지역 제외 없음", () => {
  const s1 = (over: Record<string, unknown>) =>
    form({ contract: "2002-05-01", transfer: "2023-08-01", price: "800,000,000", acq: "2004-09-01", redOver: over });

  it("1호 계약 2002-05-01 × 가격 급등 지역 → 83,610,998 (outside 대조와 같다)", async () => {
    const spec = await runSingle(s1({ region993: "speculation" }));
    const out = await runSingle(s1({ region993: "outside_speculation" }));
    expect(spec.status).toBe(200);
    expect(d993(spec.r)?.isEligible).toBe(true);
    expect(d993(spec.r)?.priorRuleBasis).toBe("addenda_29_1");
    expect(spec.totalTax).toBe(83_610_998);
    expect(out.totalTax).toBe(83_610_998);
  });

  it("대조군 — 계약 2003-03-01 × 가격 급등 지역 → 지역 제외, 세액 124,366,000", async () => {
    const f = form({ contract: "2003-03-01", transfer: "2023-08-01", price: "800,000,000", acq: "2004-09-01", redOver: { region993: "speculation" } });
    const r = await runSingle(f);
    expect(d993(r.r)?.ineligibleReasons.map((x) => x.code)).toEqual(["SPECULATION_AREA"]);
    expect(r.totalTax).toBe(124_366_000);
  });
});

describe("NH-01 route — 부칙 §29② 착공 3-state · ⑧↔⑫ 격자", () => {
  const s2 = (approval: string, csb: string | undefined, region = "speculation") =>
    form({
      contract: "",
      transfer: "2023-08-01",
      price: "500,000,000",
      fixedAcq: "200,000,000",
      acq: "2003-05-01",
      redOver: {
        acquisitionType993: "self_built",
        usageApprovalDate993: approval,
        region993: region,
        ...(csb === undefined ? {} : { constructionStartedBefore2003_993: csb }),
      },
    });

  it("착공 예 → 종전 규정 → 41,198,500 (outside 대조와 같다), 다건 route는 §99의3 단건 전용 차단 유지", async () => {
    const f = s2("2003-05-01", "yes");
    expect(issues(f).filter(CSB_ISSUE)).toEqual([]);
    const r = await runSingle(f);
    expect(r.status).toBe(200);
    expect(d993(r.r)?.priorRuleBasis).toBe("addenda_29_2");
    expect(r.totalTax).toBe(41_198_500);
    const out = await runSingle(s2("2003-05-01", "yes", "outside_speculation"));
    expect(out.totalTax).toBe(41_198_500);
    // 다건(합산) route는 §99의3을 단건 전용으로 차단한다(세율 특칙을 반영하지 못함) — 이 필드의 다건 경로는 없다.
    const multi = await runMulti([f]);
    expect(multi.status).toBe(400);
  });

  it("착공 아니오 → 개정규정 → 지역 제외 64,801,000", async () => {
    const r = await runSingle(s2("2003-05-01", "no"));
    expect(d993(r.r)?.ineligibleReasons.map((x) => x.code)).toEqual(["SPECULATION_AREA"]);
    expect(r.totalTax).toBe(64_801_000);
    expect(d993(r.r)?.needsConstructionStartConfirmation).toBeFalsy();
  });

  it("모름 → 개정규정 + 확인 필요 (64,801,000)", async () => {
    const r = await runSingle(s2("2003-05-01", "unknown"));
    expect(r.totalTax).toBe(64_801_000);
    expect(d993(r.r)?.needsConstructionStartConfirmation).toBe(true);
    expect(d993(r.r)?.priorRuleBasis).toBeUndefined();
  });

  it("⑧↔⑫ — 미응답(\"\")은 범위 안(2003-01-01 · 2003-06-30)에서 validate와 Zod가 함께 막는다", async () => {
    for (const approval of ["2003-01-01", "2003-05-01", "2003-06-30"]) {
      const f = s2(approval, "");
      expect(issues(f).filter(CSB_ISSUE).length, `validate ${approval}`).toBeGreaterThan(0);
      const r = await runSingle(f);
      expect(r.status, `Zod ${approval}`).toBe(400);
    }
  });

  it("⑧↔⑫ — 범위 밖(2002-12-31 · 2003-07-01)·1호는 묻지 않는다: validate도 Zod도 막지 않는다", async () => {
    for (const approval of ["2002-12-31", "2003-07-01"]) {
      const f = s2(approval, "");
      expect(issues(f).filter(CSB_ISSUE), `validate ${approval}`).toEqual([]);
      const r = await runSingle(f);
      expect(r.status, `Zod ${approval}`).toBe(200);
    }
    const one = form({
      contract: "2003-03-01",
      transfer: "2023-08-01",
      price: "800,000,000",
      acq: "2004-09-01",
      redOver: { region993: "speculation" },
    });
    expect(issues(one).filter(CSB_ISSUE)).toEqual([]);
    expect((await runSingle(one)).status).toBe(200);
  });

  it("사용승인 2002-12-31 · 착공 미응답 → §29①이라 종전 규정 (83,610,998 계열 아님 — 5억 시료는 41,198,500)", async () => {
    const r = await runSingle(s2("2002-12-31", ""));
    expect(d993(r.r)?.priorRuleBasis).toBe("addenda_29_1");
    expect(r.totalTax).toBe(41_198_500);
  });
});
