/**
 * anchor — 겸용주택 × 부담부증여 「이 부분 몫」 금액 echo (NIT R-c02-09 · 세액 불변).
 *
 * 결과 산식 「… 중 이 부분 몫 × 채무비율」에 금액이 없어 검산할 수 없었다. 엔진 중간값(채무비율을 곱하기 전 취득가액·필요경비)을
 * `perPart.*.acquisitionBeforeRatio`·`expenseBeforeRatio`로 싣는다. 산식·세액은 바뀌지 않는다 —
 * 세액은 기존 anchor(`mixed-use-burdened-gift.anchor.test.ts`)의 값과 같은 숫자를 여기서도 고정한다(전·후 totalTax 동일).
 *
 * 픽스처는 기존 anchor와 같다: 주택 100㎡·상가 100㎡, 양도(증여)일 2024-03-01, 증여자 취득일 2010-03-15, 시가 15억·채무 6억 전부 구분 불분명.
 */
import { describe, it, expect } from "vitest";
import { calcMixedUseTransferTax } from "@/lib/tax-engine/transfer-tax-mixed-use";
import type { MixedUseAssetInput } from "@/lib/tax-engine/types/transfer-mixed-use.types";
import type { BurdenedGiftInfo } from "@/lib/tax-engine/types/transfer-burdened-gift.types";
import type { MixedUsePartKey } from "@/lib/tax-engine/types/mixed-use-burdened-gift.types";
import { makeMockRates } from "../_helpers/mock-rates";

const RATES = makeMockRates() as never;
const TD = new Date("2024-03-01");
const ACQ = new Date("2010-03-15");
const KEYS: MixedUsePartKey[] = ["housingLand", "housingBuilding", "commercialLand", "commercialBuilding"];

function asset(over: Partial<MixedUseAssetInput> = {}): MixedUseAssetInput {
  return {
    isMixedUseHouse: true, residentialFloorArea: 100, nonResidentialFloorArea: 100, buildingFootprintArea: 100, totalLandArea: 200,
    landAcquisitionDate: ACQ, buildingAcquisitionDate: ACQ,
    transferStandardPrice: { housingPrice: 600e6, commercialBuildingPrice: 100e6, landPricePerSqm: 5_000_000, housingBuildingPrice: 100e6 },
    acquisitionStandardPrice: { housingPrice: 300e6, commercialBuildingPrice: 50e6, landPricePerSqm: 2_500_000, housingBuildingPrice: 50e6 },
    residencePeriodYears: 0, isMetropolitanArea: true, zoneType: "residential", isOneHouseExempt: false, acquisitionCause: "purchase",
    ...over,
  } as MixedUseAssetInput;
}
function bg(over: Partial<BurdenedGiftInfo> = {}): BurdenedGiftInfo {
  return {
    valuationMode: "sangjeungbeop_market", lendingDepositTotal: 0, mortgageDebtAmount: 600e6, annualRentTotal: 0, marketValueAtTransfer: 1_500_000_000,
    acquisitionMethod: "actual", actualAcquisitionTotal: 700e6, landStdPriceAtTransfer: 0, buildingStdPriceAtTransfer: 1_200_000_000,
    landStdPriceAtAcquisition: 0, buildingStdPriceAtAcquisition: 600e6, donorRelation: "lineal_descendant",
    debtAttribution: { housing: 0, commercial: 0, unallocated: 600e6 }, housingAppraisal: { exists: false }, ...over,
  } as BurdenedGiftInfo;
}
const run = (a: MixedUseAssetInput, info: BurdenedGiftInfo) => calcMixedUseTransferTax(1, TD, { ...a, burdenedGift: info }, RATES);
const det = (r: ReturnType<typeof run>) => r.total.determinedTax;
/** 엔진과 같은 부분별 채무비율 적용 — 주택·상가 모두 B'/C = 300,000,000/750,000,000. */
const scale = (x: number) => Math.floor((x * 300_000_000) / 750_000_000);

describe("취득가액 「이 부분 몫」 echo — 채무비율을 곱하기 전 값", () => {
  it("[E-1] K-4 실지 7억: 부분 몫 = 7억을 4부분 분해한 값, ×B'/C = 적용 취득가액, 세액 69,094,001(M-0과 동일)", () => {
    const r = run(asset(), bg());
    const pp = r.burdenedGift!.perPart;
    // 손계산: 주택토지 floor(7억×250/600) = 291,666,666 · 주택건물 = 주택분 350,000,000 − 291,666,666 = 58,333,334 (상가도 같다)
    expect(KEYS.map((k) => pp[k].acquisitionBeforeRatio)).toEqual([291_666_666, 58_333_334, 291_666_666, 58_333_334]);
    for (const k of KEYS) expect(scale(pp[k].acquisitionBeforeRatio!)).toBe(pp[k].acquisitionPrice);
    expect(pp.housingLand.acquisitionPrice).toBe(116_666_666);
    expect(det(r)).toBe(69_094_001); // 세액 불변 — 변경 전 값(기존 M-0 anchor)
  });

  it("[E-2] K-6/K-7 추계(매매사례가액·감정가액): 추계가액 몫이 실리고 세액 67,069,361(M-6a와 동일)", () => {
    for (const m of ["salesCase", "appraisal"] as const) {
      const r = run(asset(), bg({ acquisitionMethod: m, actualAcquisitionTotal: undefined, presumedAcquisitionTotal: 700e6 }));
      const pp = r.burdenedGift!.perPart;
      expect(pp.housingLand.acquisitionBeforeRatio).toBe(291_666_666);
      for (const k of KEYS) expect(scale(pp[k].acquisitionBeforeRatio!)).toBe(pp[k].acquisitionPrice);
      expect(pp.housingLand.expenseBeforeRatio).toBeUndefined(); // 개산공제 경로 — 실비 몫 없음
      expect(det(r)).toBe(67_069_361);
    }
  });

  it("[E-3] 기준시가(K-1~3)·K-5 환산에는 없다 — 그 산식에 「이 부분 몫」 문구가 없다. 세액 60,939,200 · 61,445,360 불변", () => {
    const std = bg({ valuationMode: "sangjeungbeop_standard", marketValueAtTransfer: undefined, acquisitionMethod: undefined, actualAcquisitionTotal: undefined, housingAppraisal: undefined });
    const rs = run(asset(), std);
    expect(KEYS.map((k) => rs.burdenedGift!.perPart[k].acquisitionBeforeRatio)).toEqual([undefined, undefined, undefined, undefined]);
    expect(det(rs)).toBe(60_939_200);
    const rc = run(asset(), bg({ acquisitionMethod: "converted", actualAcquisitionTotal: undefined }));
    expect(KEYS.map((k) => rc.burdenedGift!.perPart[k].acquisitionBeforeRatio)).toEqual([undefined, undefined, undefined, undefined]);
    expect(KEYS.map((k) => rc.burdenedGift!.perPart[k].expenseBeforeRatio)).toEqual([undefined, undefined, undefined, undefined]);
    expect(det(rc)).toBe(61_445_360);
  });
});

describe("필요경비 「이 부분 몫」 echo — 실제 필요경비 경로", () => {
  it("[E-4] K-4 + 자본적지출 40M·양도비 10M: 부분 몫 20,833,332 · ×B'/C = 8,333,332, 세액 63,470,001(M-0x와 동일)", () => {
    const r = run(asset({ capitalExpenditure: 40_000_000, transferExpense: 10_000_000 } as never), bg());
    const pp = r.burdenedGift!.perPart;
    // 손계산(M-0x 주석): 주택토지 16,666,666(자본적지출) + 4,166,666(양도비) = 20,833,332 → ×0.4 = 8,333,332
    expect(pp.housingLand.expenseBeforeRatio).toBe(20_833_332);
    for (const k of KEYS) expect(scale(pp[k].expenseBeforeRatio!)).toBe(pp[k].estimatedDeduction);
    expect(pp.housingLand.estimatedDeduction).toBe(8_333_332);
    expect(det(r)).toBe(63_470_001);
  });

  it("[E-5] 실비가 없으면 0이 실린다(엔진이 정한 값 — undefined 아님) · 개산공제 경로(estimatedDeductionRate 있음)에는 없다", () => {
    const r0 = run(asset(), bg());
    expect(r0.burdenedGift!.perPart.housingLand.expenseBeforeRatio).toBe(0);
    const r1 = run(asset(), bg({ acquisitionMethod: "salesCase", actualAcquisitionTotal: undefined, presumedAcquisitionTotal: 700e6 }));
    expect(r1.burdenedGift!.perPart.housingLand.estimatedDeductionRate).toBeDefined();
    expect(r1.burdenedGift!.perPart.housingLand.expenseBeforeRatio).toBeUndefined();
  });

  it("[E-6] §97②2호 단서 나목 채택(K-5 + 자본적지출 800M): 실비 몫 = 800M의 부분 분해값, ×B'/C = 적용 필요경비, 세액 57,846,001(M-7a와 동일)", () => {
    const r = run(asset({ capitalExpenditure: 800_000_000 } as never), bg({ acquisitionMethod: "converted", actualAcquisitionTotal: undefined }));
    expect(r.necessaryExpenseProviso?.chosen).toBe("direct");
    const pp = r.burdenedGift!.perPart;
    for (const k of KEYS) {
      expect(pp[k].expenseBeforeRatio).toBeDefined();
      expect(scale(pp[k].expenseBeforeRatio!)).toBe(pp[k].estimatedDeduction);
    }
    expect(pp.housingLand.estimatedDeduction).toBe(133_333_333);
    // 취득가액은 0으로 대체됐으니 「몫」 echo도 없다(환산 경로 — 위 E-3)
    expect(pp.housingLand.acquisitionBeforeRatio).toBeUndefined();
    expect(det(r)).toBe(57_846_001);
  });

  it("[E-7] 단서 동률(768M)은 본문(개산공제) — 실비 몫 echo 없음, 세액 61,445,360 불변", () => {
    const r = run(asset({ capitalExpenditure: 768_000_000 } as never), bg({ acquisitionMethod: "converted", actualAcquisitionTotal: undefined }));
    expect(r.burdenedGift!.perPart.housingLand.expenseBeforeRatio).toBeUndefined();
    expect(det(r)).toBe(61_445_360);
  });
});
