/**
 * anchor — 겸용주택 × 부담부증여 (소령 §159 · 4부분 안분 · 채무 귀속 · 12억 판정=증여가액 C).
 *
 * 설계: docs/02-design/features/transfer-burdened-gift-mixed-use.engine.design.md (R4) §4.
 * 기대값은 설계서 §4 프로토타입 실측(스크래치 p3·p6)에서 **먼저** 고정했고, 구현 후 정식 진입점
 * `calcMixedUseTransferTax` 호출값과 대조했다(차이는 구현 보고에 기록).
 *
 * 픽스처 F1: 주택 100㎡·상가 100㎡(§154③ 단서) / F2: 주택 150㎡·상가 50㎡(본문).
 * 양도(증여)일 2024-03-01 · 증여자의 토지·건물 취득일 2010-03-15 · 서울 수도권 주거지역(배율 3).
 */
import { describe, it, expect } from "vitest";
import { calcMixedUseTransferTax } from "@/lib/tax-engine/transfer-tax-mixed-use";
import type { MixedUseAssetInput } from "@/lib/tax-engine/types/transfer-mixed-use.types";
import type { BurdenedGiftInfo } from "@/lib/tax-engine/types/transfer-burdened-gift.types";
import { makeMockRates } from "../_helpers/mock-rates";

const RATES = makeMockRates() as never;
const TD = new Date("2024-03-01");
const ACQ = new Date("2010-03-15");

type Fx = {
  res: number;
  non: number;
  T: { H: number; hb: number; cb: number };
  A: { H: number; hb: number; cb: number };
  /** 양도시 4부분 기준시가 합 = H_T + 5,000,000×상가토지면적 + 상가건물 */
  sigmaT: number;
};
const F1: Fx = { res: 100, non: 100, T: { H: 600e6, hb: 100e6, cb: 100e6 }, A: { H: 300e6, hb: 50e6, cb: 50e6 }, sigmaT: 1_200_000_000 };
const F2: Fx = { res: 150, non: 50, T: { H: 900e6, hb: 150e6, cb: 50e6 }, A: { H: 450e6, hb: 75e6, cb: 25e6 }, sigmaT: 1_200_000_000 };

function asset(fx: Fx, over: Partial<MixedUseAssetInput> = {}): MixedUseAssetInput {
  return {
    isMixedUseHouse: true,
    residentialFloorArea: fx.res,
    nonResidentialFloorArea: fx.non,
    buildingFootprintArea: 100,
    totalLandArea: 200,
    landAcquisitionDate: ACQ,
    buildingAcquisitionDate: ACQ,
    transferStandardPrice: { housingPrice: fx.T.H, commercialBuildingPrice: fx.T.cb, landPricePerSqm: 5_000_000, housingBuildingPrice: fx.T.hb },
    acquisitionStandardPrice: { housingPrice: fx.A.H, commercialBuildingPrice: fx.A.cb, landPricePerSqm: 2_500_000, housingBuildingPrice: fx.A.hb },
    residencePeriodYears: 0,
    isMetropolitanArea: true,
    zoneType: "residential",
    isOneHouseExempt: false,
    acquisitionCause: "purchase",
    ...over,
  } as MixedUseAssetInput;
}

/** 시가 모드 · K-4 실지 기본형. 채무는 담보차입금 하나(attr 로 귀속). */
function bg(fx: Fx, over: Partial<BurdenedGiftInfo> = {}): BurdenedGiftInfo {
  return {
    valuationMode: "sangjeungbeop_market",
    lendingDepositTotal: 0,
    mortgageDebtAmount: 600e6,
    annualRentTotal: 0,
    marketValueAtTransfer: 1_500_000_000,
    acquisitionMethod: "actual",
    actualAcquisitionTotal: 700e6,
    landStdPriceAtTransfer: 0,
    buildingStdPriceAtTransfer: fx.sigmaT,
    landStdPriceAtAcquisition: 0,
    buildingStdPriceAtAcquisition: fx.A.H + 2_500_000 * 100 + fx.A.cb,
    donorRelation: "lineal_descendant",
    debtAttribution: { housing: 0, commercial: 0, unallocated: 600e6 },
    housingAppraisal: { exists: false },
    ...over,
  } as BurdenedGiftInfo;
}

function run(a: MixedUseAssetInput, info: BurdenedGiftInfo, placeholder?: number) {
  return calcMixedUseTransferTax(placeholder ?? 1, TD, { ...a, burdenedGift: info }, RATES);
}
const det = (r: ReturnType<typeof calcMixedUseTransferTax>) => r.total.determinedTax;

describe("겸용 × 부담부증여 — 세액 anchor (설계서 §4 프로토타입 실측)", () => {
  it("[M-0] 비1세대1주택 · 시가15억 · 채무6억 전부 불분명 · K-4 7억 → 69,094,001 (일반 양도 15억은 211,650,000)", () => {
    const r = run(asset(F1), bg(F1));
    expect(det(r)).toBe(69_094_001);
    expect(r.total.taxBase).toBe(234_300_004);
    // 양도가액 4부분(채무 6억의 체인 안분) · 취득가액(7억 분해 후 ×0.4, 부분별 절사)
    expect(r.housingPart.landTransferPrice).toBe(250_000_000);
    expect(r.housingPart.buildingTransferPrice).toBe(50_000_000);
    expect(r.housingPart.landAcqPrice).toBe(116_666_666);
    expect(r.housingPart.buildingAcqPrice).toBe(23_333_333);
    expect(r.burdenedGift?.assumedDebtAmount).toBe(600_000_000);
    expect(r.burdenedGift?.gratuitousPortion).toBe(900_000_000);
  });

  it("[M-1] 1세대1주택 · 주택=상가(단서) → 주택분 비과세(C_h 7.5억 ≤ 12억), 상가분 과세 25,125,000", () => {
    const r = run(asset(F1, { isOneHouseExempt: true, residencePeriodYears: 10 }), bg(F1));
    expect(det(r)).toBe(25_125_000);
    expect(r.housingPart.isExempt).toBe(true);
    expect(r.total.taxBase).toBe(115_900_002);
  });

  it("[M-3] 고가 겸용(시가18억 · 채무9억) 해석 B(증여가액 C) → 15,447,500, 주택분 안분 1/9", () => {
    const info = bg(F2, { marketValueAtTransfer: 1.8e9, mortgageDebtAmount: 900e6, actualAcquisitionTotal: 900e6, debtAttribution: { housing: 0, commercial: 0, unallocated: 900e6 } });
    const r = run(asset(F2, { isOneHouseExempt: true, residencePeriodYears: 10 }), info);
    expect(det(r)).toBe(15_447_500);
    expect(r.housingPart.isExempt).toBe(false);
    expect(r.housingPart.longTermDeductionTable).toBe(2);
    expect(r.burdenedGift?.highValue.judgmentBase).toBe(1_800_000_000);
    expect(r.burdenedGift?.highValue.prorationBase).toBe(1_350_000_000);
  });

  it("[M-3′] 대조 — 해석 A(채무 상당액으로 판정)는 기각됐다: 같은 입력이 0원이 아니다", () => {
    const info = bg(F2, { marketValueAtTransfer: 1.8e9, mortgageDebtAmount: 900e6, actualAcquisitionTotal: 900e6, debtAttribution: { housing: 0, commercial: 0, unallocated: 900e6 } });
    const r = run(asset(F2, { isOneHouseExempt: true, residencePeriodYears: 10 }), info);
    expect(det(r)).toBeGreaterThan(0);
  });

  it("[M-5] 기준시가 모드(보충적 12억) · 채무6억 · K-1~3 → 60,939,200", () => {
    const info = bg(F1, { valuationMode: "sangjeungbeop_standard", marketValueAtTransfer: undefined, acquisitionMethod: undefined, actualAcquisitionTotal: undefined, housingAppraisal: undefined });
    const r = run(asset(F1), info);
    expect(det(r)).toBe(60_939_200);
    expect(r.housingPart.landAcqPrice).toBe(125_000_000);
    expect(r.housingPart.landAppraisalDed).toBe(3_750_000);
    expect(r.burdenedGift?.acquisitionMethodUsed).toBe("standard_price");
  });

  it("[M-7] 시가 + K-5 환산 → 61,445,360 (개산공제 = 취득시 기준시가 × B/C × 3%)", () => {
    const info = bg(F1, { acquisitionMethod: "converted", actualAcquisitionTotal: undefined });
    const r = run(asset(F1), info);
    expect(det(r)).toBe(61_445_360);
    expect(r.housingPart.landAcqPrice).toBe(125_000_000);
    expect(r.housingPart.landAppraisalDed).toBe(3_000_000);
    expect(r.housingPart.buildingAppraisalDed).toBe(600_000);
  });
});

describe("겸용 × 부담부증여 — 절사 순서 · 필요경비 · §97②2호 단서 anchor (손계산 대조)", () => {
  it("[M-0t] 취득가액은 4부분 분해 후 부분마다 ×B/C 절사(split-first, G-12): 총액 654,321,987", () => {
    // 손계산: hl = floor(654,321,987×250/600) = 272,634,161 → ×0.4 = 109,053,664.4 → 109,053,664 (scale-first면 …663)
    const r = run(asset(F1), bg(F1, { actualAcquisitionTotal: 654_321_987 }));
    expect(r.housingPart.landAcqPrice).toBe(109_053_664);
    expect(r.housingPart.buildingAcqPrice).toBe(21_810_733);
    expect(r.commercialPart.landAcqPrice).toBe(109_053_664);
    expect(det(r)).toBe(74_231_863);
  });

  it("[M-0x] K-4 실지 + 공통 자본적지출 40M·양도비 10M: 실비도 부분별 ×B/C (개산공제 아님)", () => {
    // 손계산: 자본적지출은 취득시 기준시가(250:50:250:50), 양도비는 양도시 기준시가(500:100:500:100)로 4부분 분해 → 주택토지 16,666,666+4,166,666 = 20,833,332 × 0.4 → 8,333,332
    const r = run(asset(F1, { capitalExpenditure: 40_000_000, transferExpense: 10_000_000 } as never), bg(F1));
    expect(r.housingPart.landAppraisalDed).toBe(8_333_332);
    expect(r.housingPart.buildingAppraisalDed).toBe(1_666_667);
    expect(r.commercialPart.landAppraisalDed).toBe(8_333_332);
    expect(det(r)).toBe(63_470_001);
  });

  it("[M-7a] K-5 환산 + 공통 자본적지출 800M: 나목(실비×B/C 319,999,998) > 가목(환산+개산공제 307,200,000) → 나목", () => {
    const r = run(asset(F1, { capitalExpenditure: 800_000_000 } as never), bg(F1, { acquisitionMethod: "converted", actualAcquisitionTotal: undefined }));
    expect(r.necessaryExpenseProviso).toEqual({ estimatedSide: 307_200_000, directSide: 319_999_998, chosen: "direct" });
    expect(r.housingPart.landAcqPrice).toBe(0);
    expect(r.housingPart.landAppraisalDed).toBe(133_333_333);
    expect(r.housingPart.buildingAppraisalDed).toBe(26_666_666);
    expect(r.burdenedGift?.perPart.housingLand.acquisitionBeforeSwap).toBe(125_000_000);
    expect(det(r)).toBe(57_846_001);
  });

  it("[M-7b] 동률(768M: 가목 = 나목 = 307,200,000)은 본문 — «적은 경우»만 나목", () => {
    const r = run(asset(F1, { capitalExpenditure: 768_000_000 } as never), bg(F1, { acquisitionMethod: "converted", actualAcquisitionTotal: undefined }));
    expect(r.necessaryExpenseProviso).toEqual({ estimatedSide: 307_200_000, directSide: 307_200_000, chosen: "estimated" });
    expect(det(r)).toBe(61_445_360);
  });
});

describe("겸용 × 부담부증여 — K-6/K-7 · 미등기 개산공제 · 귀속 편중 anchor (손계산 대조)", () => {
  const std = { valuationMode: "sangjeungbeop_standard" as const, marketValueAtTransfer: undefined, acquisitionMethod: undefined, actualAcquisitionTotal: undefined, housingAppraisal: undefined };
  const k67 = (method: "salesCase" | "appraisal", over: Partial<BurdenedGiftInfo> = {}) =>
    bg(F1, { acquisitionMethod: method, actualAcquisitionTotal: undefined, presumedAcquisitionTotal: 700e6, ...over });

  it.each(["salesCase", "appraisal"] as const)("[M-6a] K-6/K-7(%s) 총액 7억 → 4부분 분해 ×B/C, 개산공제 3% — 67,069,361", (m) => {
    // 손계산: 주택토지 취득 floor(7억×250/600=291,666,666)×0.4 = 116,666,666 · 개산공제 3%×(취득시 기준시가 2.5억×0.4=1억) = 3,000,000
    const r = run(asset(F1), k67(m));
    expect(det(r)).toBe(67_069_361);
    expect(r.housingPart.landAcqPrice).toBe(116_666_666);
    expect(r.housingPart.buildingAcqPrice).toBe(23_333_333);
    expect(r.housingPart.landAppraisalDed).toBe(3_000_000);
    expect(r.housingPart.buildingAppraisalDed).toBe(600_000);
    expect(r.burdenedGift?.acquisitionMethodUsed).toBe(m);
  });

  it("[M-6b] 미등기 개산공제는 0.3%(소령 §163⑥ 괄호 3/1000)이고 세율 70%·기본공제 0 — 223,496,001", () => {
    // 손계산: 양도 6억 − 취득(116,666,666+23,333,333)×2 − 개산공제(300,000+60,000)×2 = 319,280,002 × 70% = 223,496,001.4 → 223,496,001
    const r = run(asset(F1, { isUnregistered: true } as never), k67("salesCase"));
    expect(r.housingPart.landAppraisalDed).toBe(300_000);
    expect(r.housingPart.buildingAppraisalDed).toBe(60_000);
    expect(r.total.taxBase).toBe(319_280_002);
    expect(det(r)).toBe(223_496_001);
  });

  it.each([
    ["상가만", { housing: 0, commercial: 600e6, unallocated: 0 }],
    ["주택만", { housing: 600e6, commercial: 0, unallocated: 0 }],
  ] as const)("[M-5b] 기준시가 모드(K-1~3) × 귀속 편중(%s, B'=C_part 경계) → 60,939,200, 양도 없는 쪽 0", (tag, attr) => {
    // 손계산: 양도 6억 − 취득시 기준시가 3억(×B/C=1) − 개산공제 9백만 = 291,000,000 → 장특 13년 26% → 215,340,000 − 2,500,000 = 212,840,000 → 38%−19,940,000 = 60,939,200
    const r = run(asset(F1), bg(F1, { ...std, debtAttribution: attr }));
    expect(r.total.taxBase).toBe(212_840_000);
    expect(det(r)).toBe(60_939_200);
    const none = tag === "상가만" ? r.housingPart : r.commercialPart;
    expect([none.landTransferPrice, none.buildingTransferPrice, none.landAcqPrice, none.buildingAcqPrice, none.landAppraisalDed, none.buildingAppraisalDed]).toEqual([0, 0, 0, 0, 0, 0]);
    expect(r.burdenedGift?.perPart[tag === "상가만" ? "housingLand" : "commercialLand"].transferred).toBe(false);
  });

  it.each([
    ["상가만", { housing: 0, commercial: 600e6, unallocated: 0 }],
    ["주택만", { housing: 600e6, commercial: 0, unallocated: 0 }],
  ] as const)("[M-7c] K-5 환산 × 귀속 편중(%s) → 61,445,360, 양도 없는 쪽 0·개산공제 = 3% × 취득시 기준시가 × B'/C_part", (tag, attr) => {
    // 손계산: C_part = 15억×6/12 = 7.5억 → B'/C = 0.8. 환산취득 = 양도(5억)×(2.5억/5억)=2.5억(토지)·5천만(건물), 개산공제 3%×(2.5억×0.8=2억)=6,000,000·3%×(5천만×0.8=4천만)=1,200,000
    // 양도 6억 − 취득 3억 − 개산공제 7,200,000 = 292,800,000 → 26% 장특 → 216,672,000 − 2,500,000 = 214,172,000 → 38%−19,940,000 = 61,445,360
    const r = run(asset(F1), bg(F1, { acquisitionMethod: "converted", actualAcquisitionTotal: undefined, debtAttribution: attr }));
    expect(r.total.taxBase).toBe(214_172_000);
    expect(det(r)).toBe(61_445_360);
    const on = tag === "상가만" ? r.commercialPart : r.housingPart;
    const off = tag === "상가만" ? r.housingPart : r.commercialPart;
    expect([on.landAcqPrice, on.buildingAcqPrice, on.landAppraisalDed, on.buildingAppraisalDed]).toEqual([250_000_000, 50_000_000, 6_000_000, 1_200_000]);
    expect([off.landTransferPrice, off.buildingTransferPrice, off.landAcqPrice, off.buildingAcqPrice, off.landAppraisalDed, off.buildingAppraisalDed]).toEqual([0, 0, 0, 0, 0, 0]);
  });
});

describe("겸용 × 부담부증여 — 채무 귀속 anchor (설계서 §4.3)", () => {
  const one = { isOneHouseExempt: true, residencePeriodYears: 10 };

  it("[M-10′] 전부 불분명 = 균일 B/C → M-1과 1원까지 같다", () => {
    const a = det(run(asset(F1, one), bg(F1, { debtAttribution: { housing: 0, commercial: 0, unallocated: 600e6 } })));
    expect(a).toBe(25_125_000);
  });

  it("[M-8] 상가 귀속만 6억 → 주택분 양도 없음(transferred:false), 상가 과세 69,094,000", () => {
    const r = run(asset(F1, one), bg(F1, { debtAttribution: { housing: 0, commercial: 600e6, unallocated: 0 } }));
    expect(det(r)).toBe(69_094_000);
    expect(r.housingPart.landTransferPrice).toBe(0);
    expect(r.housingPart.buildingTransferPrice).toBe(0);
    expect(r.commercialPart.landTransferPrice).toBe(500_000_000);
    expect(r.commercialPart.landAcqPrice).toBe(233_333_332);
    expect(r.commercialPart.buildingAcqPrice).toBe(46_666_667);
    expect(r.burdenedGift?.perPart.housingLand.transferred).toBe(false);
    expect(r.burdenedGift?.perPart.commercialLand.transferred).toBe(true);
    expect(r.burdenedGift?.highValue.applicable).toBe(false);
  });

  it("[M-9] 주택 귀속만 6억 · 1세대1주택 → C_h 7.5억 ≤ 12억 전액 비과세 0", () => {
    const r = run(asset(F1, one), bg(F1, { debtAttribution: { housing: 600e6, commercial: 0, unallocated: 0 } }));
    expect(det(r)).toBe(0);
    expect(r.burdenedGift?.perPart.housingLand.transferred).toBe(true);
    expect(r.burdenedGift?.perPart.commercialLand.transferred).toBe(false);
  });

  it("[M-9′] 같은 입력 · 비1세대1주택 → 69,094,000 (M-8과 대칭)", () => {
    const r = run(asset(F1), bg(F1, { debtAttribution: { housing: 600e6, commercial: 0, unallocated: 0 } }));
    expect(det(r)).toBe(69_094_000);
  });

  it("[M-10] 상가 귀속 3억 + 불분명 3억(C_h:C_c 안분) · 1세대1주택 → 46,598,000", () => {
    const r = run(asset(F1, one), bg(F1, { debtAttribution: { housing: 0, commercial: 300e6, unallocated: 300e6 } }));
    expect(det(r)).toBe(46_598_000);
    expect(r.burdenedGift?.debtAttribution.housingDebt).toBe(150_000_000);
    expect(r.burdenedGift?.debtAttribution.commercialDebt).toBe(450_000_000);
  });

  it("[M-10b] 같은 입력 · 비1세대1주택(양쪽 과세) → 69,094,001", () => {
    const r = run(asset(F1), bg(F1, { debtAttribution: { housing: 0, commercial: 300e6, unallocated: 300e6 } }));
    expect(det(r)).toBe(69_094_001);
  });

  it("[M-12] 고가 겸용(시가18억) · 주택 귀속만 9억 → 450,000", () => {
    const info = bg(F2, { marketValueAtTransfer: 1.8e9, mortgageDebtAmount: 900e6, actualAcquisitionTotal: 900e6, debtAttribution: { housing: 900e6, commercial: 0, unallocated: 0 } });
    const r = run(asset(F2, one), info);
    expect(det(r)).toBe(450_000);
    expect(r.burdenedGift?.perPart.commercialLand.transferred).toBe(false);
  });

  it("[M-12b] 고가 겸용 · 상가 귀속만 4억 → 상가분 일반과세 35,485,000", () => {
    const info = bg(F2, { marketValueAtTransfer: 1.8e9, mortgageDebtAmount: 400e6, actualAcquisitionTotal: 900e6, debtAttribution: { housing: 0, commercial: 400e6, unallocated: 0 } });
    const r = run(asset(F2, one), info);
    expect(det(r)).toBe(35_485_000);
  });

  it("[M-6] 증여자 상속 취득(deemed) · 주택분·상가분 평가액 3.5억씩 → 69,094,001 (K-4 실지 7억 분해와 같은 세액)", () => {
    const a = asset(F1, { acquisitionCause: "inheritance", housingInheritedValue: 350e6, commercialInheritedValue: 350e6 } as Partial<MixedUseAssetInput>);
    const r = run(a, bg(F1, { actualAcquisitionTotal: undefined }));
    expect(det(r)).toBe(69_094_001);
    expect(r.housingPart.landAcqPrice).toBe(116_666_666);
    expect(r.burdenedGift?.acquisitionMethodUsed).toBe("actual");
  });

  it("[M-14] 부분 초과부담부: 상가 귀속 5억 > C_c 2.5억 → MB-14", () => {
    const info = bg(F2, { marketValueAtTransfer: 1.0e9, mortgageDebtAmount: 500e6, actualAcquisitionTotal: 500e6, debtAttribution: { housing: 0, commercial: 500e6, unallocated: 0 } });
    expect(() => run(asset(F2, one), info)).toThrow(/상가/);
  });

  it("[M-15] 불분명 안분 후 초과: 주택 귀속 749,999,999 + 불분명 1억 → MB-14(자동 재배분 없음)", () => {
    const info = bg(F2, { marketValueAtTransfer: 1.0e9, mortgageDebtAmount: 849_999_999, actualAcquisitionTotal: 500e6, debtAttribution: { housing: 749_999_999, commercial: 0, unallocated: 100e6 } });
    expect(() => run(asset(F2, one), info)).toThrow(/주택/);
  });
});

describe("겸용 × 부담부증여 — 차단 가드 MB-1~MB-18", () => {
  type Mod = typeof import("@/lib/tax-engine/mixed-use-burdened-gift-prepare");
  const load = async (): Promise<Mod> => import("@/lib/tax-engine/mixed-use-burdened-gift-prepare");
  const issuesOf = async (a: MixedUseAssetInput, info: BurdenedGiftInfo, transferDate: Date = TD) => {
    const m = await load();
    return m.collectMixedBurdenedGiftIssues({ ...a, burdenedGift: info, transferDate }).map((i) => i.code);
  };
  const base = () => ({ a: asset(F1), i: bg(F1) });

  it("기준: 정상 입력은 이슈 0건", async () => {
    const { a, i } = base();
    expect(await issuesOf(a, i)).toEqual([]);
  });
  it("MB-1 증여일 < 2022-01-01", async () => {
    const { a, i } = base();
    expect(await issuesOf(a, i, new Date("2021-12-31"))).toContain("MB-1");
    expect(() => calcMixedUseTransferTax(1, new Date("2021-12-31"), { ...a, burdenedGift: i }, RATES)).toThrow(/2022/);
  });
  it("MB-2 PHD", async () => {
    const { a, i } = base();
    expect(await issuesOf({ ...a, usePreHousingDisclosure: true }, i)).toContain("MB-2");
  });
  it("MB-3 별개 취득 파트 모델", async () => {
    const { a, i } = base();
    expect(await issuesOf({ ...a, separateAcquisition: { landMode: "estimated", buildingMode: "estimated" } } as MixedUseAssetInput, i)).toContain("MB-3");
  });
  it("MB-4 보유 중 일부 용도변경", async () => {
    const { a, i } = base();
    expect(await issuesOf({ ...a, partialUsageChange: { direction: "house_to_commercial" } }, i)).toContain("MB-4");
  });
  it("MB-5 공익수용", async () => {
    const { a, i } = base();
    expect(await issuesOf({ ...a, transferCause: "public_expropriation" }, i)).toContain("MB-5");
  });
  it("MB-6 지분 < 1", async () => {
    const { a, i } = base();
    expect(await issuesOf({ ...a, ownershipRatio: 0.5 }, i)).toContain("MB-6");
  });
  it("MB-7 담보·임대 평가가 보충적평가를 이김", async () => {
    const { a } = base();
    const i = bg(F1, { valuationMode: "sangjeungbeop_standard", marketValueAtTransfer: undefined, acquisitionMethod: undefined, actualAcquisitionTotal: undefined, housingAppraisal: undefined, annualRentTotal: 600e6 });
    expect(await issuesOf(a, i)).toContain("MB-7");
  });
  it("MB-8 증여자 상속 취득 × K-5/K-6/K-7", async () => {
    const { a } = base();
    expect(await issuesOf({ ...a, acquisitionCause: "inheritance" }, bg(F1, { acquisitionMethod: "converted", actualAcquisitionTotal: undefined }))).toContain("MB-8");
  });
  it("MB-9 이월과세", async () => {
    const { a, i } = base();
    expect(await issuesOf({ ...a, acquisitionCause: "carryover_gift" }, i)).toContain("MB-9");
  });
  it("MB-10 합계 B > C", async () => {
    const { a } = base();
    const i = bg(F1, { mortgageDebtAmount: 1.6e9, mortgageSetAmount: 100e6, debtAttribution: { housing: 0, commercial: 0, unallocated: 1.6e9 } });
    expect(await issuesOf(a, i)).toContain("MB-10");
  });
  it("MB-11 필수 입력 누락 (시가 총액 / K-4 실지 총액 / 취득시 공시지가)", async () => {
    const { a } = base();
    expect(await issuesOf(a, bg(F1, { marketValueAtTransfer: undefined }))).toContain("MB-11");
    expect(await issuesOf(a, bg(F1, { actualAcquisitionTotal: undefined }))).toContain("MB-11");
    expect(await issuesOf({ ...a, acquisitionStandardPrice: { ...a.acquisitionStandardPrice, landPricePerSqm: 0 } }, bg(F1))).toContain("MB-11");
  });
  it("MB-12 양도시 기준시가 합 불일치 · 4부분 모델에 없는 필드", async () => {
    const { a } = base();
    expect(await issuesOf(a, bg(F1, { buildingStdPriceAtTransfer: 1 }))).toContain("MB-12");
    expect(await issuesOf(a, bg(F1, { giftBuildingStdPriceAtTransfer: 1 }))).toContain("MB-12");
    expect(await issuesOf(a, bg(F1, { actualLandAcquisitionPrice: 1 }))).toContain("MB-12");
  });
  it("MB-13 귀속 미입력 · 합 불일치", async () => {
    const { a } = base();
    expect(await issuesOf(a, bg(F1, { debtAttribution: undefined }))).toContain("MB-13");
    expect(await issuesOf(a, bg(F1, { debtAttribution: { housing: 0, commercial: 0, unallocated: 599_999_999 } }))).toContain("MB-13");
  });
  it("MB-14 부분 초과부담부", async () => {
    const { a } = base();
    const i = bg(F1, { mortgageDebtAmount: 800e6, debtAttribution: { housing: 0, commercial: 800e6, unallocated: 0 } });
    expect(await issuesOf(a, i)).toContain("MB-14");
  });
  it("MB-15 신축 취득", async () => {
    const { a, i } = base();
    expect(await issuesOf({ ...a, acquisitionCause: "newConstruction" }, i)).toContain("MB-15");
  });
  it("MB-16 의제취득일(1985.1.1.) 전 취득", async () => {
    const { a, i } = base();
    expect(await issuesOf({ ...a, landAcquisitionDate: new Date("1984-12-31") }, i)).toContain("MB-16");
  });
  it("MB-18 (§163⑨ 단서 1·2호) 상속·증여 취득 + 토지 또는 건물 취득일 < 2005-04-30 — deemed 경로만", async () => {
    const { a } = base();
    const inh = (d: string, over: Partial<MixedUseAssetInput> = {}) =>
      ({ ...a, acquisitionCause: "inheritance", housingInheritedValue: 350e6, commercialInheritedValue: 350e6, landAcquisitionDate: new Date(d), buildingAcquisitionDate: new Date(d), ...over }) as MixedUseAssetInput;
    const info = bg(F1, { actualAcquisitionTotal: undefined });
    // 경계: 2005-04-29는 «전» → 차단, 2005-04-30(최초 공시일)부터 통과
    expect(await issuesOf(inh("2005-04-29"), info)).toContain("MB-18");
    expect(await issuesOf(inh("2005-04-30"), info)).not.toContain("MB-18");
    // 토지·건물 중 하나만 전이어도 차단
    expect(await issuesOf(inh("2010-03-15", { landAcquisitionDate: new Date("2000-01-01") }), info)).toContain("MB-18");
    expect(await issuesOf(inh("2010-03-15", { buildingAcquisitionDate: new Date("2000-01-01") }), info)).toContain("MB-18");
    // 증여 취득도 같다
    expect(await issuesOf(inh("2000-01-01", { acquisitionCause: "gift" }), info)).toContain("MB-18");
    // 1985 전은 MB-16이 맡는다(중복 없음)
    const pre85 = await issuesOf(inh("1984-12-31"), info);
    expect(pre85).toContain("MB-16");
    expect(pre85).not.toContain("MB-18");
    // 대조: 매매 취득(deemed 경로 아님) · 기준시가 모드(§163⑨ 미사용)는 막지 않는다
    expect(await issuesOf({ ...a, landAcquisitionDate: new Date("2000-01-01"), buildingAcquisitionDate: new Date("2000-01-01") }, bg(F1))).not.toContain("MB-18");
    const stdInfo = bg(F1, { valuationMode: "sangjeungbeop_standard", marketValueAtTransfer: undefined, acquisitionMethod: undefined, actualAcquisitionTotal: undefined, housingAppraisal: undefined });
    expect(await issuesOf(inh("2000-01-01"), stdInfo)).not.toContain("MB-18");
    // 엔진 throw도 같은 판정
    expect(() => run(inh("2000-01-01"), info)).toThrow(/2005\.4\.30/);
  });
  it("MB-17 (G-13) 구분 감정평가 선언 누락 · 있음인데 주택분 시가 누락", async () => {
    const { a } = base();
    expect(await issuesOf(a, bg(F1, { housingAppraisal: undefined }))).toContain("MB-17");
    expect(await issuesOf(a, bg(F1, { housingAppraisal: { exists: true } }))).toContain("MB-17");
    expect(await issuesOf(a, bg(F1, { housingAppraisal: { exists: true, housingValue: 1.6e9 } }))).toContain("MB-17");
  });
});

describe("겸용 × 부담부증여 — 구분 감정평가(G-13) · 12억 문턱", () => {
  it("M-12 입력에서 감정평가 주택분 11.5억(≤12억)이면 안분 분모가 12억 미만 → 주택분 과세 0 (판정은 여전히 전체 18억 고가)", () => {
    const info = bg(F2, {
      marketValueAtTransfer: 1.8e9, mortgageDebtAmount: 900e6, actualAcquisitionTotal: 900e6,
      debtAttribution: { housing: 900e6, commercial: 0, unallocated: 0 },
      housingAppraisal: { exists: true, housingValue: 1_150_000_000 },
    });
    const r = run(asset(F2, { isOneHouseExempt: true, residencePeriodYears: 10 }), info);
    expect(r.burdenedGift?.highValue.prorationBase).toBe(1_150_000_000);
    expect(r.housingPart.proratedTaxableGain).toBe(0);
  });

  it("구분 감정평가 «있음»이면 부가세령 §64①1호 단서의 평가 기간 요건(공급시기 → 증여일 대응)을 확인 필요로 고지한다 · «없음»이면 내지 않는다", () => {
    const period = "직전 과세기간 개시일부터";
    const withAppraisal = run(asset(F1), bg(F1, { housingAppraisal: { exists: true, housingValue: 750e6 } }));
    const notice = withAppraisal.warnings.find((w) => w.includes(period));
    expect(notice).toContain("단서");
    expect(notice).toContain("증여일");
    expect(notice).toContain("확인이 필요합니다");
    const without = run(asset(F1), bg(F1));
    expect(without.warnings.some((w) => w.includes(period))).toBe(false);
  });
});
