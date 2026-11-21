/**
 * 결과뷰 리뷰 2026-11-21 MAJOR 묶음 m7 anchor — 신고서 ③ 세율구분 코드 (R-c10-03 · R-c10-04 · R-c10-05).
 *
 * 정본(KoreanLaw MCP `get_annexes` 「소득세법 시행규칙」 [별지 제84호서식] <개정 2026. 3. 20.> 작성방법 3~4쪽
 * «과세대상자산 및 세율» · 부표 1 작성방법 1호 표, 2026-11-21 본문 실측):
 *   · ① 1-10 «일반세율 적용 토지ㆍ건물 및 부동산에 관한 권리» · ② 1-15 «1년 이상 2년 미만 보유 토지ㆍ건물 및 부동산에 관한 권리(주택 및 조합원입주권 제외)» 40%
 *     · ③ 1-20 «1년 미만 보유 토지ㆍ건물 및 부동산에 관한 권리(주택 및 조합원입주권 제외)» 50% · ④ 1-40 «1년 미만 보유 주택 및 조합원입주권» 40%
 *     · ⑦ 1-23 «1년 이상 보유 분양권(’21.6.1.이후 양도분)» 60%  — 부표 1 자산종류표에서 분양권은 «부동산에 관한 권리 › 부동산을 취득할 수 있는 권리»다.
 *   · ㉑ 1-52 / ㉒ 1-54 / ㉕ 1-56 / ㉖ 1-58 — ’18.4.1.~’21.5.31. «1세대가 주택과 조합원입주권 또는 분양권(’21.1.1. 이후 취득)을 각각 1개씩 보유» /
 *     «… 보유한 경우로서 그 수의 합이 3이상» (일반 · 1년 미만)
 *   · ㉚ 1-48 / ㉛ 1-85 / ㉜ 1-83 · ㊱ 1-50 / ㊲ 1-89 / ㊳ 1-87 — 같은 취지(’21.6.1. 이후 양도분 · 일반 / 1년 미만 / 1년 이상 2년 미만)
 *
 * R-c10-03 — 분양권 ③ 코드가 정본에 행이 있는데도 비었다(’21.6.1. 이후 1~2년 1-23 · ’21.6.1. 전 1-10/1-15/1-20).
 * R-c10-04 — 주택 + 산입 조합원입주권·분양권 세대의 중과(와 중과 대상 단기) 코드를 «1세대N주택» 코드로 적었다.
 *            엔진 echo(`determineMultiHouseSurcharge`의 산입 권리 수)를 코드 판정에 넘긴다.
 * R-c10-05 — ’21.6.1. 전 양도 부수토지 카드가 주택 1년 미만 40%(§104①3호 괄호)를 받아도 토지 코드 1-20(50%)이 적혔다.
 *
 * 시료는 실제 엔진(`calculateTransferTax`)·다건 route(`POST /api/calc/transfer`) 경로로 만든다. 세율표는 mock(정본 세액 아님).
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
import { baseTransferInput, makeHouseInfo, makeMockRates, makeMockRatesWithHouseEngine } from "../tax-engine/_helpers/mock-rates";
import { postTransfer } from "../calc/_helpers/redev-one-house-route";
import { capResidenceToHolding } from "../calc/_helpers/held-residence";

vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates() as never);

type Loose = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const d = (s: string) => new Date(s);

/** 단건 신고서 «세율구분 코드»·«세율» 합계 열 */
function single(r: ReturnType<typeof calculateTransferTax>, trn: string, assetKind: string) {
  const f = { ...createDefaultTransferFormData(), transferDate: trn } as Loose;
  f.assets = [{ ...(f.assets?.[0] ?? {}), assetKind }];
  const rows = buildRows(r, "single", f as never);
  const pick = (label: string) => rows.find((x) => x.label === label)?.values["total"] ?? null;
  return { code: pick("세율구분 코드"), rate: pick("세율") };
}

// ───────────────────────── R-c10-03 분양권 ─────────────────────────

/** 비조정대상지역 분양권 — 양도가액 5억 · 취득가액 4억 */
function presale(acq: string, trn: string) {
  const r = calculateTransferTax(
    baseTransferInput({
      propertyType: "presale_right",
      transferPrice: 500_000_000,
      acquisitionPrice: 400_000_000,
      acquisitionDate: d(acq),
      transferDate: d(trn),
      householdHousingCount: 1,
      isRegulatedArea: false,
    }),
    makeMockRates(),
  );
  return { r, filing: single(r, trn, "presale_right") };
}

describe("R-c10-03 분양권 ③ 세율구분 코드", () => {
  it("전제: 엔진 호·세율 — ’22 1~2년 2호 60% · ’19 1년 미만 3호 50% · ’19 1~2년 2호 40% · ’19 2년 이상 1호 누진", () => {
    expect([presale("2021-01-01", "2022-07-01").r.rateClause, presale("2021-01-01", "2022-07-01").r.appliedRate]).toEqual(["104-1-2", 0.6]);
    expect([presale("2019-01-01", "2019-07-01").r.rateClause, presale("2019-01-01", "2019-07-01").r.appliedRate]).toEqual(["104-1-3", 0.5]);
    expect([presale("2018-01-01", "2019-07-01").r.rateClause, presale("2018-01-01", "2019-07-01").r.appliedRate]).toEqual(["104-1-2", 0.4]);
    expect(presale("2017-01-01", "2019-07-01").r.rateClause).toBe("104-1-1");
  });
  it("🔴 ⑦ ’21.6.1. 이후 1년 이상 2년 미만 분양권 → 1-23 · 60% (종전 「-」)", () => {
    expect(presale("2021-01-01", "2022-07-01").filing).toEqual({ code: "1-23", rate: "60%" });
  });
  it("🔴 ③ ’21.6.1. 전 1년 미만 분양권(비조정) → 1-20 · 50% (종전 「-」)", () => {
    expect(presale("2019-01-01", "2019-07-01").filing).toEqual({ code: "1-20", rate: "50%" });
  });
  it("🔴 ② ’21.6.1. 전 1년 이상 2년 미만 분양권(비조정) → 1-15 · 40% (종전 「-」)", () => {
    expect(presale("2018-01-01", "2019-07-01").filing).toEqual({ code: "1-15", rate: "40%" });
  });
  it("🔴 ① ’21.6.1. 전 2년 이상 분양권(비조정) → 1-10 (종전 「-」)", () => {
    expect(presale("2017-01-01", "2019-07-01").filing.code).toBe("1-10");
  });
  it("대조: ’21.6.1. 이후 1년 미만 ⑥ 1-46 · 2년 이상 ⑦ 1-23 · 조정대상지역 분양권 ⑱ 1-21은 그대로", () => {
    expect(presale("2021-01-01", "2021-11-01").filing).toEqual({ code: "1-46", rate: "70%" });
    expect(presale("2019-01-01", "2022-07-01").filing).toEqual({ code: "1-23", rate: "60%" });
    expect(resolveFilingRateCode({ rateClause: "104-1-4", assetKind: "presale_right", transferDate: "2020-06-01" })).toBe("1-21");
  });
});

// ───────────────────────── R-c10-04 주택 + 산입 권리 세대 ─────────────────────────

/** 조정대상지역(강남) 주택 h1 양도 · 명부 주택 `houses`채(양도 주택 포함) + 조합원입주권 `rights`개(2021-02-01 취득) */
function rightHousehold(houses: number, rights: number, acq: string, trn: string, gain = 400_000_000) {
  return calculateTransferTax(
    baseTransferInput({
      transferPrice: 900_000_000,
      acquisitionPrice: 900_000_000 - gain,
      acquisitionDate: d(acq),
      transferDate: d(trn),
      householdHousingCount: houses,
      isRegulatedArea: true,
      residencePeriodMonths: 0,
      houses: [
        makeHouseInfo("h1", { acquisitionDate: d(acq), regionCode: "11680" } as never),
        ...Array.from({ length: houses - 1 }, (_, i) => makeHouseInfo(`h${i + 2}`, { regionCode: "11680" } as never)),
      ],
      sellingHouseId: "h1",
      presaleRights: Array.from({ length: rights }, (_, i) => ({
        id: `r${i}`, type: "redevelopment_right" as const, acquisitionDate: d("2021-02-01"), region: "capital" as const,
      })),
    }),
    makeMockRatesWithHouseEngine(),
  );
}
const rightCode = (houses: number, rights: number, acq: string, trn: string, gain?: number) =>
  single(rightHousehold(houses, rights, acq, trn, gain), trn, "housing");

describe("R-c10-04 주택 + 조합원입주권·분양권 세대의 중과 코드", () => {
  it("전제: 권리가 주택 수에 산입돼 같은 호가 나온다(1+1 → 104-7-1 · 1+2 → 104-7-3)", () => {
    const a = rightHousehold(1, 1, "2015-01-01", "2022-03-01");
    expect([a.rateClause, a.multiHouseSurchargeEvaluation?.effectiveHouseCount]).toEqual(["104-7-1", 2]);
    const b = rightHousehold(1, 2, "2015-01-01", "2022-03-01");
    expect([b.rateClause, b.multiHouseSurchargeEvaluation?.effectiveHouseCount]).toEqual(["104-7-3", 3]);
  });
  it("🔴 ㉚ 주택1 + 입주권1(’21.6.1. 이후) → 1-48 (종전 1-47)", () => {
    expect(rightCode(1, 1, "2015-01-01", "2022-03-01").code).toBe("1-48");
  });
  it("🔴 ㊱ 주택1 + 입주권2 · 주택2 + 입주권1(’21.6.1. 이후) → 1-50 (종전 1-49)", () => {
    expect(rightCode(1, 2, "2015-01-01", "2022-03-01").code).toBe("1-50");
    expect(rightCode(2, 1, "2015-01-01", "2022-03-01").code).toBe("1-50");
  });
  it("🔴 ㉑ ㉕ ’18.4.1.~’21.5.31. 양도 → 1-52 · 1-56 (종전 1-51 · 1-55)", () => {
    expect(rightCode(1, 1, "2015-01-01", "2021-03-01").code).toBe("1-52");
    expect(rightCode(1, 2, "2015-01-01", "2021-03-01").code).toBe("1-56");
  });
  it("🔴 ㉛ ㉜ 단기세율이 이긴 주택1 + 입주권1(’21.6.1. 이후) → 1년 미만 1-85 · 1~2년 1-83 (종전 1-84 · 1-82)", () => {
    expect(rightCode(1, 1, "2021-12-01", "2022-06-01")).toEqual({ code: "1-85", rate: "70%" });
    expect(rightCode(1, 1, "2021-01-01", "2022-06-01")).toEqual({ code: "1-83", rate: "60%" });
  });
  it("🔴 ㉒ 단기세율이 이긴 주택1 + 입주권1 1년 미만(’18.4.1.~’21.5.31.) 과세표준 약 5천만 → 1-54 · 40% (종전 1-53)", () => {
    const r = rightHousehold(1, 1, "2020-06-01", "2021-03-01", 52_500_000);
    expect([r.rateClause, r.surchargeShortTermClause]).toEqual(["104-1-3", "104-7-1"]);
    expect(single(r, "2021-03-01", "housing")).toEqual({ code: "1-54", rate: "40%" });
  });
  it("대조: 권리 없는 2주택 · 3주택은 그대로 ㉗ 1-47 · ㉝ 1-49", () => {
    expect(rightCode(2, 0, "2015-01-01", "2022-03-01").code).toBe("1-47");
    expect(rightCode(3, 0, "2015-01-01", "2022-03-01").code).toBe("1-49");
  });
  it("대조: 2021.1.1. 전 취득 분양권은 주택 수에 들지 않아(§88 10호 적용례) 권리 코드로 바꾸지 않는다", () => {
    const r = calculateTransferTax(
      baseTransferInput({
        transferPrice: 900_000_000, acquisitionPrice: 500_000_000, acquisitionDate: d("2015-01-01"), transferDate: d("2022-03-01"),
        householdHousingCount: 2, isRegulatedArea: true, residencePeriodMonths: 0,
        houses: [makeHouseInfo("h1", { acquisitionDate: d("2015-01-01"), regionCode: "11680" } as never), makeHouseInfo("h2", { regionCode: "11680" } as never)],
        sellingHouseId: "h1",
        presaleRights: [{ id: "p0", type: "presale_right", acquisitionDate: d("2020-06-01"), region: "capital" }],
      }),
      makeMockRatesWithHouseEngine(),
    );
    expect([r.rateClause, single(r, "2022-03-01", "housing").code]).toEqual(["104-7-1", "1-47"]);
  });

  it("resolveFilingRateCode — 권리 산입 표지별 코드 전수", () => {
    const c = (clause: string, date: string, sur?: "104-7-1" | "104-7-3") =>
      resolveFilingRateCode({
        rateClause: clause as never, assetKind: "housing", transferDate: date, surchargeShortTermClause: sur, surchargeHouseholdHasCountedRight: true,
      });
    expect([c("104-7-1", "2022-03-01"), c("104-7-3", "2022-03-01"), c("104-7-1", "2021-05-31"), c("104-7-3", "2021-05-31")]).toEqual(["1-48", "1-50", "1-52", "1-56"]);
    expect([c("104-1-3", "2022-06-01", "104-7-1"), c("104-1-2", "2022-06-01", "104-7-1"), c("104-1-3", "2022-06-01", "104-7-3"), c("104-1-2", "2022-06-01", "104-7-3")])
      .toEqual(["1-85", "1-83", "1-89", "1-87"]);
    expect([c("104-1-3", "2020-06-01", "104-7-1"), c("104-1-3", "2020-06-01", "104-7-3"), c("104-1-2", "2020-06-01", "104-7-1")]).toEqual(["1-54", "1-58", undefined]);
  });
});

// ───────────────────────── R-c10-05 · R-c10-04 다건 부수토지 카드 ─────────────────────────

const ZONE = { buildingFootprintArea: 100, isUrbanArea: true, appurtenantLandZone: "metropolitan_residential" };
const bundle = (trn: string, acq: string, over: Loose = {}) => ({
  transferDate: trn, acquisitionCause: "purchase", expenses: 0, useEstimatedAcquisition: false, residencePeriodMonths: 60,
  isRegulatedArea: true, wasRegulatedAtAcquisition: true, isUnregistered: false, isNonBusinessLand: false, reductions: [], annualBasicDeductionUsed: 0,
  isOneHousehold: true, householdHousingCount: 2, ...ZONE, propertyType: "housing", acquisitionDate: acq,
  transferPrice: 1_600_000_000, acquisitionPrice: 800_000_000, acquisitionArea: 100, totalSalePrice: 2_000_000_000, standardPriceAtTransferForApportion: 1_600_000,
  companionAssets: [{
    assetId: "c1", assetLabel: "부수토지 c1", assetKind: "land", landNature: "appurtenant_to_housing", acquisitionCause: "purchase", acquisitionDate: acq,
    fixedAcquisitionPrice: 200_000_000, standardPriceAtTransfer: 400_000, directExpenses: 0, isOneHousehold: true, areaM2: 100, reductions: [],
  }],
  ...over,
});
async function aggregate(body: Loose) {
  const res = await postTransfer(capResidenceToHolding(body));
  expect(res.status, JSON.stringify((res.json as Loose).error)).toBe(200);
  const a = (res.json as Loose).data.aggregated;
  const f = createDefaultTransferFormData() as Loose;
  f.transferDate = body.transferDate;
  f.assets = [{ assetId: "primary", assetKind: "housing" }, { assetId: "c1", assetKind: "land", landNature: "appurtenant_to_housing" }];
  const rows = buildAggregateRows(aggregateToFilingResult(a), { properties: a.properties, aggregated: a } as never, f as never) as Loose[];
  const pick = (label: string) => (rows.find((r) => r.label === label)?.values ?? {}) as Record<string, string | undefined>;
  return { code: pick("세율구분 코드"), rate: pick("세율"), properties: a.properties as Loose[] };
}

describe("R-c10-05 ’21.6.1. 전 양도 부수토지 카드 — 주택 1년 미만 40%", () => {
  it("🔴 중과 짝 2주택 · 2020-06-15 양도 1년 미만: 카드 104-1-3 · 40% → ⑳ 1-53 (종전 1-20 · 코드 50%와 ⑨ 40% 불일치)", async () => {
    const r = await aggregate(bundle("2020-06-15", "2019-12-01"));
    const card = r.properties.find((p) => p.propertyId === "c1") ?? {};
    expect([card.rateClause, card.appliedRate, card.surchargeShortTermClause]).toEqual(["104-1-3", 0.4, "104-7-1"]);
    expect([r.code.c1, r.rate.c1]).toEqual(["1-53", "40%"]);
  });
  it("resolveFilingRateCode — ’21.6.1. 전 land · 104-1-3 · 40% → ④ 1-40 / 50%는 토지 ③ 1-20 / 104-1-2 40%는 토지 ② 1-15", () => {
    const c = (clause: string, rate: number) =>
      resolveFilingRateCode({ rateClause: clause as never, assetKind: "land", transferDate: "2020-06-15", appliedRate: rate });
    expect([c("104-1-3", 0.4), c("104-1-3", 0.5), c("104-1-2", 0.4)]).toEqual(["1-40", "1-20", "1-15"]);
  });
});

describe("R-c10-04 다건 — 부수토지 카드도 짝 주택의 권리 산입 표지를 따른다", () => {
  const ROSTER = {
    houses: [{ id: "selling", region: "capital", regionCode: "1168010100", acquisitionDate: "2015-01-01", officialPrice: 300_000_000, isInherited: false, isLongTermRental: false }],
    sellingHouseId: "selling",
    presaleRights: [{ id: "r0", type: "redevelopment_right", acquisitionDate: "2021-02-01", region: "capital" }],
    householdHousingCount: 1,
  };
  it("🔴 주택1 + 입주권1 · 2022-03-01 양도 · 2015 취득: 주택·카드 모두 ㉚ 1-48 (종전 1-47)", async () => {
    const r = await aggregate(bundle("2022-03-01", "2015-01-01", ROSTER));
    expect([r.properties[0].rateClause, r.properties.find((p) => p.propertyId === "c1")?.rateClause]).toEqual(["104-7-1", "104-7-1"]);
    expect([r.code.primary, r.code.c1]).toEqual(["1-48", "1-48"]);
  });
  it("대조: 권리 없는 2주택 중과 짝은 ㉗ 1-47 그대로", async () => {
    const r = await aggregate(bundle("2022-03-01", "2015-01-01"));
    expect([r.code.primary, r.code.c1]).toEqual(["1-47", "1-47"]);
  });
});
