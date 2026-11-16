/**
 * anchor — 겸용주택 × 부담부증여 × 공유지분 단건(PR-A) — 미측정 경로 고정: 의제취득일 전 상속·증여(3자 비교·환산 후보) · §163⑨ 단서 구간(PHD) · 구분 감정평가 — **화면 경로**.
 *
 * 각 시료를 («지분 50% · 지분 인수 채무 3억») 대 («단독 100% · 채무 6억» = 오라클)로 돌려 비교한다: 평가액·취득가액·비교 후보·4부분 양도가액·개산공제가 오라클 ÷2(±1원)이다.
 * 세액은 지분분 양도차익 위의 누진이라 오라클 ÷2가 아니다 — 그래서 지분 쪽 세액은 값으로 고정한다.
 * 평가·취득 입력(평가액·감정가·PHD 칸)은 물건 전체 값을 같은 칸에 넣고(④가 상속·증여 평가액·필요경비만 지분분으로 줄인다), 채무만 지분 인수분이다.
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
import { makeMockRates } from "../tax-engine/_helpers/mock-rates";
import { allIssues } from "../calc/_helpers/redev-one-house-route";
import { captureBody } from "../calc/_helpers/redev-one-house-route";
import { postTransfer } from "../calc/_helpers/redev-one-house-route";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { createDefaultTransferFormData, type TransferFormData } from "@/lib/stores/calc-wizard-store";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates() as never);

type Loose = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const MIXED: Loose = {
  addressJibun: "서울 강남구 테스트동 8-8",
  assetKind: "housing",
  mixedAcqPerPartMode: false,
  isMixedUseHouse: true,
  residentialFloorArea: "100",
  nonResidentialFloorArea: "100",
  mixedUseTotalLandArea: "200",
  buildingFootprintArea: "100",
  mixedTransferHousingPrice: "600000000",
  mixedTransferLandPricePerSqm: "5000000",
  mixedTransferCommercialBuildingPrice: "100000000",
  mixedTransferHousingBuildingStdPrice: "100000000",
  mixedIsMetropolitanArea: true,
  acquisitionCause: "inheritance",
  transferType: "burdened_gift",
  bgValuationMode: "sangjeungbeop_market",
  bgMarketValueAtTransfer: "1500000000",
  bgMortgageDebtAmount: "600000000",
  bgLendingDepositTotal: "0",
  bgDonorRelation: "lineal_descendant",
  bgHousingAppraisalDeclared: "none",
  bgMortgageAttribution: "unallocated",
  bgAcquisitionMethod: "",
};
const RV = (h: string, c: string): Loose => ({ mixedHousingInheritedValueOverride: h, mixedCommercialInheritedValueOverride: c });

const form = (over: Loose = {}): TransferFormData =>
  Object.assign(createDefaultTransferFormData(), {
    transferDate: "2024-03-01",
    filingDate: "2024-05-31",
    totalTransferExpense: "0",
    householdHousingCount: "0",
    isOneHousehold: false,
    assets: [{ ...makeDefaultAsset(1), ...MIXED, ...over } as AssetForm],
  }) as TransferFormData;

const ownIssues = (f: TransferFormData) =>
  allIssues(f).filter((i: Loose) => !/다른 보유 주택이 없는지|분양권·입주권이 없는지/.test(i.message));

async function run(f: TransferFormData, patch?: (b: Loose) => void) {
  const issues = ownIssues(f);
  const body = (await captureBody(f)) as Loose;
  patch?.(body);
  const r = await postTransfer(body);
  const result = r.json?.data?.result;
  return {
    issues,
    body,
    status: r.status,
    fieldErrors: r.json?.error?.fieldErrors as Record<string, string[]> | undefined,
    tax: result?.total?.determinedTax as number | undefined,
    housingAcq: result?.housingPart?.estimatedAcquisitionPrice as number | undefined,
    commercialAcq: result?.commercialPart?.estimatedAcquisitionPrice as number | undefined,
    cmp: result?.sec163_9Comparison as Loose | undefined,
    bg: result?.burdenedGift as Loose | undefined,
  };
}

/** 1983 상속 · PHD(§164⑦ — 의제취득일 기준) */
const Y83: Loose = {
  acquisitionDate: "1983-03-15",
  inheritanceStartDate: "1983-03-15",
  decedentAcquisitionDate: "1970-01-01",
  usePreHousingDisclosure: true,
  phdFirstDisclosureDate: "2005-04-30",
  phdFirstDisclosureHousingPrice: "250000000",
  phdLandPricePerSqmAtFirst: "1600000",
  phdLandPricePerSqmAtAcq: "800000",
  phdBuildingStdPriceAtAcq: "25000000",
  phdBuildingStdPriceAtFirst: "45000000",
  phdBuildingStdPriceAtTransfer: "100000000",
  mixedAcqLandPricePerSqm: "800000",
  mixedAcqCommercialBuildingPrice: "30000000",
};
const GIFT: Loose = { acquisitionCause: "gift", inheritanceStartDate: "", decedentAcquisitionDate: "", donorAcquisitionDate: "1970-01-01", giftDonorRelation: "lineal_ascendant", giftSameHousehold: "no" };
const GV = (h: string, c: string): Loose => ({ mixedHousingGiftValueOverride: h, mixedCommercialGiftValueOverride: c });
const STD: Loose = { bgValuationMode: "sangjeungbeop_standard", bgMarketValueAtTransfer: "", bgHousingAppraisalDeclared: "" };


/** 1995 상속 · PHD 없음 · 취득시 개별주택가격 3억 직접 입력 — R-1(2026-10-24) 이후 단서 구간 비교에서는 막힌다(C-8). 상가 토지 2.5억 + 건물 5천만 */
const Y95: Loose = {
  acquisitionDate: "1995-03-15",
  inheritanceStartDate: "1995-03-15",
  decedentAcquisitionDate: "1980-01-01",
  mixedAcqHousingPrice: "300000000",
  mixedAcqLandPricePerSqm: "2500000",
  mixedAcqCommercialBuildingPrice: "50000000",
  mixedAcqHousingBuildingStdPrice: "50000000",
};
/** PHD(§164⑦) 입력 — 최초 고시일은 시료마다 덮어쓴다 */
const PHD_C: Loose = {
  usePreHousingDisclosure: true,
  phdFirstDisclosureDate: "2006-04-28",
  phdFirstDisclosureHousingPrice: "250000000",
  phdLandPricePerSqmAtFirst: "1600000",
  phdLandPricePerSqmAtAcq: "1500000",
  phdBuildingStdPriceAtAcq: "40000000",
  phdBuildingStdPriceAtFirst: "45000000",
  phdBuildingStdPriceAtTransfer: "100000000",
  mixedAcqLandPricePerSqm: "1500000",
  mixedAcqCommercialBuildingPrice: "50000000",
};
/** 2006.1.15. 상속 · 그 주택의 개별주택가격 최초 공시 2006.4.28.(단서 2호 대상 — 부동산거래관리과-364와 같은 모양) */
const Y06: Loose = { acquisitionDate: "2006-01-15", inheritanceStartDate: "2006-01-15", decedentAcquisitionDate: "1990-01-01" };
/** 1995 상속 · PHD — 최초 고시일 2005-04-30 · 취득시 공시지가 80만 · 건물 2,500만 · 상가건물 3천만 */
const Y95_PHD: Loose = {
  ...Y95,
  mixedAcqHousingPrice: "",
  phdFirstDisclosureDate: "2005-04-30",
  mixedAcqLandPricePerSqm: "800000",
  phdLandPricePerSqmAtAcq: "800000",
  mixedAcqCommercialBuildingPrice: "30000000",
  phdBuildingStdPriceAtAcq: "25000000",
};

const SH: Loose = { ownershipNumerator: "50", ownershipDenominator: "100", ownershipRemainderThirdParty: "yes", bgMortgageDebtAmount: "300000000" };
const MAT_BG: Loose = { acquisitionCause: "purchase", acquisitionDate: "2010-03-15", mixedAcqHousingPrice: "300000000", mixedAcqLandPricePerSqm: "2500000", mixedAcqCommercialBuildingPrice: "50000000", mixedAcqHousingBuildingStdPrice: "50000000", bgAcquisitionMethod: "actual", bgActualAcquisitionTotal: "700000000", fixedAcquisitionPrice: "700000000", inheritanceStartDate: "", decedentAcquisitionDate: "" };
const parts = (bg: Loose | undefined): number[] => Object.values((bg?.perPart ?? {}) as Record<string, Loose>).reduce((a: number[], p: Loose) => [a[0] + p.transferPrice, a[1] + p.acquisitionPrice, a[2] + p.estimatedDeduction], [0, 0, 0]);
const close = (a: number | undefined, b: number | undefined) => expect(Math.abs((a ?? 0) - (b ?? 0) / 2)).toBeLessThanOrEqual(1);

/** 같은 시료의 지분(50% · 채무 3억)과 오라클(100% · 채무 6억)을 돌려 오라클 ÷2 일치를 단언한다. 지분 쪽 결과를 돌려준다. */
async function pair(over: Loose) {
  const o = await run(form(over));
  const s = await run(form({ ...over, ...SH }));
  expect(s.issues).toEqual([]);
  expect(s.status).toBe(200);
  expect(o.status).toBe(200);
  close(s.housingAcq, o.housingAcq);
  close(s.commercialAcq, o.commercialAcq);
  parts(s.bg).forEach((v: number, i: number) => close(v, parts(o.bg)[i]));
  if (o.cmp) {
    expect(s.cmp?.selected).toBe(o.cmp.selected);
    for (const k of ["reported", "standard", "converted"] as const) if (o.cmp[k]) close(s.cmp?.[k]?.total, o.cmp[k].total);
  }
  expect(s.bg?.giftValuation.max).toBe((o.bg?.giftValuation.max as number) / 2);
  return s;
}

describe("겸용 × 부담부증여 × 공유지분 — 의제취득일(1985.1.1.) 전 상속·증여 (3자 비교 · 환산 후보)", () => {
  it("[P-1] 1983 상속 PHD · ① 3.5억씩 → ① 채택 · 비교 후보가 오라클÷2(② 119,024,390 · ③ 148,780,487) · 22,885,000", async () => {
    const s = await pair({ ...Y83, ...RV("350000000", "350000000") });
    expect(s.cmp).toMatchObject({ selected: "reported", standard: { total: 119_024_390 }, converted: { total: 148_780_487 } });
    expect(s.tax).toBe(22_885_000);
  });
  it("[P-2] ① 비움 → ③ 환산취득가액 채택(`converted_pre_deemed`) · 개산공제 · 42,699,831", async () => {
    const s = await pair({ ...Y83, ...RV("", "") });
    expect(s.bg?.acquisitionMethodUsed).toBe("converted");
    expect(s.tax).toBe(42_699_831);
  });
  it("[P-3] ① 작음(1억씩) < ③ → ③ 채택 · 42,699,831 (P-2와 같다)", async () => {
    const s = await pair({ ...Y83, ...RV("100000000", "100000000") });
    expect(s.cmp?.selected).toBe("converted");
    expect(s.tax).toBe(42_699_831);
  });
  it("[P-4] 1983 증여 취득(cause=gift) — 같은 비교 · 22,885,000", async () => {
    const s = await pair({ ...Y83, ...GIFT, ...GV("350000000", "350000000") });
    expect(s.tax).toBe(22_885_000);
  });
  it("[P-5] 기준시가 모드 × 의제취득일 전 — 취득 = 의제취득일 기준시가 × 채무비율 · 42,604,849", async () => {
    const s = await pair({ ...Y83, ...STD, ...RV("350000000", "350000000") });
    expect(s.bg?.acquisitionMethodUsed).toBe("standard_price");
    expect(s.tax).toBe(42_604_849);
  });
});

describe("겸용 × 부담부증여 × 공유지분 — §163⑨ 단서 구간(1985.1.1.~2005.4.29.) · PHD(§164⑦)", () => {
  it("[C-1] 1995 상속 PHD · ① 3.5억씩 → ① · 22,885,000", async () => {
    const s = await pair({ ...PHD_C, ...Y95_PHD, ...RV("350000000", "350000000") });
    expect(s.cmp?.selected).toBe("reported");
    expect(s.tax).toBe(22_885_000);
  });
  it("[C-2] ① 1억씩 < ②(§164⑦ 119,024,390 = 오라클 238,048,780 ÷ 2) → ② 채택 · 46,245,805", async () => {
    const s = await pair({ ...PHD_C, ...Y95_PHD, ...RV("100000000", "100000000") });
    expect(s.cmp).toMatchObject({ selected: "standard", standard: { total: 119_024_390 } });
    expect(s.tax).toBe(46_245_805);
  });
  it("[C-3] ① 비움 → ②만 · 46,245,805", async () => {
    const s = await pair({ ...PHD_C, ...Y95_PHD, ...RV("", "") });
    expect(s.cmp?.selected).toBe("standard");
    expect(s.tax).toBe(46_245_805);
  });
  it("[C-4] 2006.1.15. 상속 · 최초공시 2006.4.28.(PHD) · 주택분 max(1억, §164⑦) · 28,681,342", async () => {
    const s = await pair({ ...PHD_C, ...Y06, ...RV("100000000", "350000000") });
    expect(s.tax).toBe(28_681_342);
  });
});

describe("겸용 × 부담부증여 × 공유지분 — 구분 감정평가(시가 모드 · 부가세령 §64①1호 단서)", () => {
  it("[A-1] 주택 귀속 담보 + 주택분 감정평가 9억(물건 전체) → 주택 채무비율 2/3 · 12억 안분 분모 9억(물건 전체 주택분) · 오라클÷2 · 31,168,333", async () => {
    const s = await pair({ ...MAT_BG, bgMortgageAttribution: "housing", bgHousingAppraisalDeclared: "exists", bgHousingAppraisalValue: "900000000" });
    expect(s.bg?.debtAttribution.housingRatio).toBeCloseTo(2 / 3, 12);
    expect(s.bg?.highValue.prorationBase).toBe(900_000_000);
    expect(s.tax).toBe(31_168_333);
  });
  it("[A-2] 같은 시료에서 감정평가 «없음» → 주택 채무비율 0.8(기준시가 비례 7.5억) · 25,125,000 — 감정평가 선언이 결과를 가른다", async () => {
    const s = await pair({ ...MAT_BG, bgMortgageAttribution: "housing" });
    expect(s.bg?.debtAttribution.housingRatio).toBeCloseTo(0.8, 12);
    expect(s.tax).toBe(25_125_000);
  });
  it("[A-3] 주택분 감정평가가 지분 증여가액 이상(물건 전체 16억 → 지분분 8억 ≥ C 7.5억) → ⑧·⑫ 모두 막는다(오라클 100%도 16억 ≥ 15억으로 막힘)", async () => {
    const over = { ...MAT_BG, bgMortgageAttribution: "housing", bgHousingAppraisalDeclared: "exists", bgHousingAppraisalValue: "1600000000" };
    const s = await run(form({ ...over, ...SH }));
    expect(s.issues.length).toBeGreaterThan(0);
    expect(s.status).toBe(400);
  });
});
