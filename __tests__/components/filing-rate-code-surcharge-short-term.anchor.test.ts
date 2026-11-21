/**
 * R-c10-01 anchor — 신고서 ③ 세율구분: 조정대상지역 다주택 중과 대상 주택인데 §104⑦ 후단 비교에서 **단기세율이 이기면**
 * 일반 단기 주택 코드(1-46·1-39·1-40)가 아니라 «중과 대상 단기» 코드를 적는다.
 *
 * 정본(KoreanLaw MCP `get_annexes` 「소득세법 시행규칙」 [별지 제84호서식] <개정 2026. 3. 20.> 작성방법 3~4쪽
 * «과세대상자산 및 세율», 2026-11-21 본문 실측):
 *   · ⑳ 1-53 «1년 미만 보유 조정대상지역 내 주택으로서 1세대2주택에 해당하는 주택(’18.4.1.~’21.5.31. 양도분)» 40%
 *   · ㉔ 1-57 «1년 미만 보유 조정대상지역 내 주택으로서 1세대3주택에 해당하는 주택(’18.4.1.~’21.5.31. 양도분)» 40%
 *   · ㉘ 1-84 «1년 미만 보유 조정대상지역 내 주택으로서 1세대2주택에 해당하는 주택(’21.6.1. 이후 양도분)» 70%
 *   · ㉙ 1-82 «1년 이상 2년 미만 보유 조정대상지역 내 주택으로서 1세대2주택에 해당하는 주택(’21.6.1. 이후 양도분)» 60%
 *   · ㉞ 1-88 «1년 미만 보유 조정대상지역 내 주택으로서 1세대3주택에 해당하는 주택(’21.6.1. 이후 양도분)» 70%
 *   · ㉟ 1-86 «1년 이상 2년 미만 보유 조정대상지역 내 주택으로서 1세대3주택에 해당하는 주택(’21.6.1. 이후 양도분)» 60%
 * 부표 1 작성방법 1호 표도 같은 코드다(’18.4.1.~’21.5.31. 1세대2주택 1년미만 53 · 1세대3주택 1년미만 57 /
 * ’21.6.1. 이후 1세대2주택 2년 미만 82 · 1년 미만 84 · 1세대3주택 이상 2년 미만 86 · 1년 미만 88).
 *
 * 엔진은 §104⑦ 후단 비교에서 단기세율이 이기면 `rateClause`를 단기 호(104-1-2·104-1-3)로 돌려주고 중과 호는 후보에만 남긴다
 * (`transfer-tax-rate-calc.ts` 단기 분기). 종전 표시부는 호만 봐서 일반 단기 주택 코드를 적었다.
 * ⇒ 엔진 echo `surchargeShortTermClause`(이긴 단기 호와 함께 후보였던 §104⑦ 호)를 실어 코드를 가른다.
 *
 * 시료는 실제 엔진 경로(`calculateTransferTax`)·다건 route(`POST /api/calc/transfer`)로 만든다 — 픽스처 기본값이 결함을 가리지 않게.
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db/tax-rates", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/tax-rates")>();
  return { ...actual, preloadTaxRates: vi.fn() };
});
vi.mock("@/lib/api/rate-limit", () => ({
  checkRateLimit: vi.fn().mockReturnValue({ allowed: true, limit: 30, remaining: 29, resetAt: Date.now() + 60_000 }),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
  shouldBypassRateLimit: vi.fn().mockReturnValue(true),
}));

import { preloadTaxRates } from "@/lib/db/tax-rates";
import { buildRows } from "@/components/calc/results/transfer/FilingFormTableHelpers";
import { buildAggregateRows } from "@/components/calc/results/transfer/FilingFormTableAggregateHelpers";
import { aggregateToFilingResult } from "@/components/calc/results/BundledAllocationCard";
import { resolveFilingRateCode } from "@/components/calc/results/transfer/filing-rate-code";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import { baseTransferInput, makeMockRates } from "../tax-engine/_helpers/mock-rates";
import { postTransfer } from "../calc/_helpers/redev-one-house-route";
import { capResidenceToHolding } from "../calc/_helpers/held-residence";

vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates() as never);

type Loose = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const d = (s: string) => new Date(s);

/** 조정대상지역 다주택 — 양도가액 6억 고정, 취득가액으로 과세표준(양도차익 − 기본공제 250만)을 맞춘다 */
function surchargeHouse(count: number, acq: string, trn: string, taxBase: number) {
  return calculateTransferTax(
    baseTransferInput({
      householdHousingCount: count,
      isRegulatedArea: true,
      wasRegulatedAtAcquisition: true,
      residencePeriodMonths: 0,
      acquisitionDate: d(acq),
      transferDate: d(trn),
      transferPrice: 600_000_000,
      acquisitionPrice: 600_000_000 - taxBase - 2_500_000,
    }),
    makeMockRates(),
  );
}

/** 단건 신고서 «세율구분 코드»·«세율» 합계 열 */
function single(r: ReturnType<typeof calculateTransferTax>, trn: string) {
  const rows = buildRows(r, "single", { ...createDefaultTransferFormData(), transferDate: trn } as never);
  const pick = (label: string) => rows.find((x) => x.label === label)?.values["total"] ?? null;
  return { code: pick("세율구분 코드"), rate: pick("세율") };
}

describe("엔진 전제 — 중과 후보가 있는데 단기세율이 이긴다(세율·세액은 맞다)", () => {
  it("2주택 1년 미만 ’22.6.1. 과세표준 3억: 호 104-1-3 · 70% · 중과 echo 적용", () => {
    const r = surchargeHouse(2, "2021-12-01", "2022-06-01", 300_000_000);
    expect([r.taxBase, r.rateClause, r.appliedRate]).toEqual([300_000_000, "104-1-3", 0.7]);
    expect(r.surchargeEcho?.isRateSurchargeApplied).toBe(true);
    expect(r.surchargeEcho?.isSuspended).toBe(false);
  });
});

describe("[정본 ㉘㉙㉞㉟ ⑳㉔] 단건 신고서 — 중과 대상 주택 단기세율 채택", () => {
  it("🔴 ㉘ 2주택 1년 미만(’21.6.1. 이후) → 1-84 · 70% (종전 1-46)", () => {
    expect(single(surchargeHouse(2, "2021-12-01", "2022-06-01", 300_000_000), "2022-06-01")).toEqual({ code: "1-84", rate: "70%" });
  });
  it("🔴 ㉙ 2주택 1~2년(’21.6.1. 이후) → 1-82 · 60% (종전 1-39)", () => {
    expect(single(surchargeHouse(2, "2021-01-01", "2022-06-01", 300_000_000), "2022-06-01")).toEqual({ code: "1-82", rate: "60%" });
  });
  it("🔴 ㉞ 3주택 1년 미만(’21.6.1. 이후) → 1-88 · 70% (종전 1-46)", () => {
    expect(single(surchargeHouse(3, "2021-12-01", "2022-06-01", 300_000_000), "2022-06-01")).toEqual({ code: "1-88", rate: "70%" });
  });
  it("🔴 ㉟ 3주택 1~2년(’21.6.1. 이후) 과세표준 1억 → 1-86 · 60% (종전 1-39)", () => {
    const r = surchargeHouse(3, "2021-01-01", "2022-06-01", 100_000_000);
    expect(r.rateClause).toBe("104-1-2");
    expect(single(r, "2022-06-01")).toEqual({ code: "1-86", rate: "60%" });
  });
  it("🔴 ⑳ 2주택 1년 미만(’18.4.1.~’21.5.31.) 과세표준 2.45억 → 1-53 · 40% (종전 1-40)", () => {
    const r = surchargeHouse(2, "2019-12-01", "2020-06-01", 245_000_000);
    expect(r.rateClause).toBe("104-1-3");
    expect(single(r, "2020-06-01")).toEqual({ code: "1-53", rate: "40%" });
  });
  it("🔴 ㉔ 3주택 1년 미만(’18.4.1.~’21.5.31.) 과세표준 5천만 → 1-57 · 40% (종전 1-40)", () => {
    const r = surchargeHouse(3, "2019-12-01", "2020-06-01", 50_000_000);
    expect(r.rateClause).toBe("104-1-3");
    expect(single(r, "2020-06-01")).toEqual({ code: "1-57", rate: "40%" });
  });

  it("대조: 중과가 이기면 그대로 ㉝ 1-49 · ㉓ 1-55 (3주택 1~2년 과세표준 3억 · 1년 미만 ’20.6.1.)", () => {
    expect(single(surchargeHouse(3, "2021-01-01", "2022-06-01", 300_000_000), "2022-06-01").code).toBe("1-49");
    expect(single(surchargeHouse(3, "2019-12-01", "2020-06-01", 300_000_000), "2020-06-01").code).toBe("1-55");
  });
  it("대조: 중과 대상이 아닌 1주택 단기는 그대로 ⑥ 1-46 · ⑤ 1-39", () => {
    expect(single(surchargeHouse(1, "2021-12-01", "2022-06-01", 300_000_000), "2022-06-01").code).toBe("1-46");
    expect(single(surchargeHouse(1, "2021-01-01", "2022-06-01", 300_000_000), "2022-06-01").code).toBe("1-39");
  });
});

/** 조정대상지역 다주택 양도차손 — 양도가액 6억 · 취득가액 7억(차손 1억). 차손 조기 반환 경로(`transfer-tax-loss-return.ts`)를 탄다 */
function surchargeHouseLoss(count: number, acq: string, trn: string) {
  return calculateTransferTax(
    baseTransferInput({
      householdHousingCount: count,
      isRegulatedArea: true,
      wasRegulatedAtAcquisition: true,
      residencePeriodMonths: 0,
      acquisitionDate: d(acq),
      transferDate: d(trn),
      transferPrice: 600_000_000,
      acquisitionPrice: 700_000_000,
    }),
    makeMockRates(),
  );
}

describe("[정본 ㉘㉙㉞ ⑳] 단건 신고서 — 양도차손 자산도 같은 코드(차손 조기 반환 경로)", () => {
  it("전제: 차손이라 과세표준·세액 0, 호는 단기(104-1-3) — 세액은 바뀌지 않는다", () => {
    const r = surchargeHouseLoss(2, "2021-12-01", "2022-06-01");
    expect([r.transferGain < 0, r.taxBase, r.calculatedTax, r.rateClause]).toEqual([true, 0, 0, "104-1-3"]);
  });
  it("🔴 ㉘ 2주택 1년 미만 차손 → 1-84 (종전 1-46 · 같은 자산의 소액 차익은 1-84)", () => {
    expect(single(surchargeHouseLoss(2, "2021-12-01", "2022-06-01"), "2022-06-01").code).toBe("1-84");
  });
  it("🔴 ㉙ 2주택 1~2년 차손 → 1-82 (종전 1-39)", () => {
    expect(single(surchargeHouseLoss(2, "2021-01-01", "2022-06-01"), "2022-06-01").code).toBe("1-82");
  });
  it("🔴 ㉞ 3주택 1년 미만 차손 → 1-88 (종전 1-46)", () => {
    expect(single(surchargeHouseLoss(3, "2021-12-01", "2022-06-01"), "2022-06-01").code).toBe("1-88");
  });
  it("🔴 ⑳ 2주택 1년 미만(’18.4.1.~’21.5.31.) 차손 → 1-53 (종전 1-40)", () => {
    expect(single(surchargeHouseLoss(2, "2020-06-01", "2021-03-01"), "2021-03-01").code).toBe("1-53");
  });
  it("대조: 같은 세대 2년 이상 보유 차손은 중과 호(104-7-1)가 이겨 ㉗ 1-51 그대로", () => {
    const r = surchargeHouseLoss(2, "2018-01-01", "2021-03-01");
    expect(r.rateClause).toBe("104-7-1");
    expect(r.surchargeShortTermClause).toBeUndefined();
  });
});

describe("다건(부수토지 카드 일괄) 신고서 — 자산 열도 같은 규칙", () => {
  const ZONE = { buildingFootprintArea: 100, isUrbanArea: true, appurtenantLandZone: "metropolitan_residential" };
  const body = (acq: string, cardAcqPrice = 200_000_000) => ({
    transferDate: "2026-06-15", acquisitionCause: "purchase", expenses: 0, useEstimatedAcquisition: false, residencePeriodMonths: 60,
    isRegulatedArea: true, wasRegulatedAtAcquisition: true, isUnregistered: false, isNonBusinessLand: false, reductions: [], annualBasicDeductionUsed: 0,
    isOneHousehold: true, householdHousingCount: 2, ...ZONE, propertyType: "housing", acquisitionDate: acq,
    transferPrice: 1_600_000_000, acquisitionPrice: 800_000_000, acquisitionArea: 100, totalSalePrice: 2_000_000_000, standardPriceAtTransferForApportion: 1_600_000,
    companionAssets: [{
      assetId: "c1", assetLabel: "부수토지 c1", assetKind: "land", landNature: "appurtenant_to_housing", acquisitionCause: "purchase", acquisitionDate: acq,
      fixedAcquisitionPrice: cardAcqPrice, standardPriceAtTransfer: 400_000, directExpenses: 0, isOneHousehold: true, areaM2: 100, reductions: [],
    }],
  });
  async function aggregate(acq: string, cardAcqPrice?: number) {
    const res = await postTransfer(capResidenceToHolding(body(acq, cardAcqPrice)));
    expect(res.status, JSON.stringify((res.json as Loose).error)).toBe(200);
    const a = (res.json as Loose).data.aggregated;
    const f = createDefaultTransferFormData() as Loose;
    f.transferDate = "2026-06-15";
    f.assets = [{ assetId: "primary", assetKind: "housing" }, { assetId: "c1", assetKind: "land", landNature: "appurtenant_to_housing" }];
    const rows = buildAggregateRows(aggregateToFilingResult(a), { properties: a.properties, aggregated: a } as never, f as never) as Loose[];
    const pick = (label: string) => (rows.find((r) => r.label === label)?.values ?? {}) as Record<string, string | undefined>;
    return { code: pick("세율구분 코드"), rate: pick("세율"), properties: a.properties as Loose[] };
  }
  it("🔴 2주택 1~2년: 주택·카드 모두 1-82 · 60% (종전 1-39)", async () => {
    const r = await aggregate("2025-01-01");
    expect([r.code.primary, r.code.c1, r.rate.primary, r.rate.c1]).toEqual(["1-82", "1-82", "60%", "60%"]);
  });
  it("🔴 2주택 1년 미만: 주택·카드 모두 1-84 · 70% (종전 1-46)", async () => {
    const r = await aggregate("2025-12-01");
    expect([r.code.primary, r.code.c1, r.rate.primary, r.rate.c1]).toEqual(["1-84", "1-84", "70%", "70%"]);
  });
  it("🔴 카드가 양도차손(취득가액 5억)이어도 카드 열 1-84 — 차손 자산의 breakdown도 echo를 싣는다(종전 1-46)", async () => {
    const r = await aggregate("2025-12-01", 500_000_000);
    const card = r.properties.find((p) => p.propertyId === "c1") ?? {};
    expect([card.transferGain < 0, card.determinedTax, card.rateClause]).toEqual([true, 0, "104-1-3"]);
    expect([r.code.primary, r.code.c1]).toEqual(["1-84", "1-84"]);
  });
});

describe("resolveFilingRateCode — 중과 후보 echo", () => {
  const code = (clause: string, kind: string, date: string, sur?: "104-7-1" | "104-7-3") =>
    resolveFilingRateCode({ rateClause: clause as never, assetKind: kind as never, transferDate: date, surchargeShortTermClause: sur });
  it("’21.6.1. 이후: 2주택 1-84/1-82 · 3주택 1-88/1-86", () => {
    expect(code("104-1-3", "housing", "2022-06-01", "104-7-1")).toBe("1-84");
    expect(code("104-1-2", "housing", "2022-06-01", "104-7-1")).toBe("1-82");
    expect(code("104-1-3", "housing", "2022-06-01", "104-7-3")).toBe("1-88");
    expect(code("104-1-2", "housing", "2022-06-01", "104-7-3")).toBe("1-86");
  });
  it("’18.4.1.~’21.5.31.: 1년 미만 2주택 1-53 · 3주택 1-57 / 1~2년은 정본에 코드가 없어 비운다", () => {
    expect(code("104-1-3", "housing", "2021-05-31", "104-7-1")).toBe("1-53");
    expect(code("104-1-3", "housing", "2021-06-01", "104-7-1")).toBe("1-84"); // 경계 짝 — ’21.6.1. 당일부터 ㉘
    expect(code("104-1-3", "housing", "2018-04-01", "104-7-3")).toBe("1-57");
    expect(code("104-1-2", "housing", "2020-06-01", "104-7-1")).toBeUndefined();
  });
  it("’18.4.1. 전에는 조정대상지역 중과 코드가 없다 → 비운다", () => {
    expect(code("104-1-3", "housing", "2018-03-31", "104-7-1")).toBeUndefined();
  });
  it("echo가 없으면 종전대로(1-46 · 1-39 · 1-40)", () => {
    expect(code("104-1-3", "housing", "2022-06-01")).toBe("1-46");
    expect(code("104-1-2", "housing", "2022-06-01")).toBe("1-39");
    expect(code("104-1-3", "housing", "2020-06-01")).toBe("1-40");
  });
  it("echo가 있어도 호가 단기가 아니면 영향이 없다(104-7-1 → 1-47)", () => {
    expect(code("104-7-1", "housing", "2022-06-01", "104-7-1")).toBe("1-47");
  });
});
