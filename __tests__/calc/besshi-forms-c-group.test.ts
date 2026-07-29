/**
 * Anchor — C그룹 별지 서식 dual-truth (M-11·M-12·M-13)
 *
 * pdf_table_row_one_to_one_mapping: 서식 각 칸 = 엔진 단일진실. 자기산식이 성립해야 한다.
 *
 * - M-11 별지10호: 조특법 §71 영농자녀 농지 감면세액이 finalTax에서만 차감(㊺)되고 어느 행에도
 *     없어 ㊲(세액공제 합계) 산식과 ㊺가 어긋남 → ㊶·㊲에 farmlandReduction 합산.
 * - M-12/M-13 별지6호의2: ⑩ 공제대상액이 §23의2 시기별 공제율(2016~ 80%·2009~ 40%) 미반영이라
 *     rate<1 상속에서 ⑫=min(⑩,⑪) 자체모순 → ⑩ = rawDeduction(base×rate)로 정합.
 */
import { describe, it, expect } from "vitest";
import { calcGiftTax } from "@/lib/tax-engine/gift-tax";
import { buildBesshi6_2Data } from "@/lib/calc/cohabit-besshi-data";
import type {
  GiftTaxInput,
  InheritanceTaxResult,
  Heir,
} from "@/lib/tax-engine/types/inheritance-gift.types";

// ─────────────────────────────────────────────────────────────
// M-11 별지10호 §71 농지 감면세액 행 반영
// ─────────────────────────────────────────────────────────────
const farmlandB: GiftTaxInput = {
  giftDate: "2021-04-19",
  donorRelation: "lineal_ascendant_adult",
  donor: "father",
  giftItems: [
    { id: "B", category: "cash", name: "농지B", marketValue: 813_066_000, isFarmlandGiftReduction: true },
  ],
  priorGiftsWithin10Years: [
    { giftDate: "2015-01-19", giftAmount: 50_000_000, donor: "father", giftTaxPaid: 0, giftTaxBase: 0, computedTax: 0, isHeir: false },
    { giftDate: "2019-05-03", giftAmount: 153_754_000, donor: "father", giftTaxPaid: 0, giftTaxBase: 153_754_000, computedTax: 20_750_800, isHeir: false, farmlandReductionApplied: true, farmlandReductionAmount: 20_750_800 },
  ],
  isGenerationSkip: false,
  isMinorDonee: false,
  deductionInput: { donorRelation: "lineal_ascendant_adult" },
  creditInput: { isFiledOnTime: true },
} as GiftTaxInput;

describe("M-11 별지10호 §71 농지 감면세액 행 정합", () => {
  const r = calcGiftTax(farmlandB);
  const rows = r.besshi10Rows ?? [];
  const amt = (n: string) => rows.find((x) => x.number === n)?.amount ?? 0;

  it("[M11] ㊶ 그 밖의 공제·감면 = specialTreatment + §71 감면(79,249,200), ㊲ = totalTaxCredit + 감면", () => {
    const farmland = r.farmlandReductionDetail?.reductionAmount ?? 0;
    expect(farmland).toBe(79_249_200);
    expect(amt("㊶")).toBe((r.creditDetail.specialTreatmentCredit ?? 0) + farmland); // 79,249,200
    expect(amt("㊲")).toBe(r.totalTaxCredit + farmland); // 103,901,380
  });

  it("[M11] ㊺ 자진납부세액 = finalTax = ㉞ − ㊲ (농지감면 반영 후 자기정합)", () => {
    expect(amt("㊺")).toBe(r.finalTax); // 126,144,620
    expect(amt("㉞") - amt("㊲")).toBe(r.finalTax);
  });
});

// ─────────────────────────────────────────────────────────────
// M-12/M-13 별지6호의2 ⑩ 시기별 공제율 반영
// ─────────────────────────────────────────────────────────────
function makeResult(rate: number, cap: number, base: number): InheritanceTaxResult {
  const rawDeduction = Math.floor(base * rate);
  const cappedDeduction = Math.min(rawDeduction, cap);
  return {
    deductionDetail: {
      cohabitDeductionDetail: {
        housingValue: base,
        securedDebt: 0,
        base,
        rate,
        rawDeduction,
        cap,
        cappedDeduction,
      },
    },
  } as unknown as InheritanceTaxResult;
}

const cohabitHeir: Heir = { id: "c1", relation: "child", name: "동거자녀", isCohabitant: true };

describe("M-12/M-13 별지6호의2 ⑩ 공제대상액 시기별율 반영", () => {
  it("[M12/13-PRE2020] 2016~2019 상속(80%·5억): 평가 4억 → ⑩ = 320,000,000(=base×0.8), ⑫ = min(⑩,⑪)", () => {
    const result = makeResult(0.8, 500_000_000, 400_000_000);
    const data = buildBesshi6_2Data(result, [cohabitHeir], "피상속인", undefined, "2018-05-01")!;
    // ⑩ 공제대상액 = rawDeduction(base×0.8) = 320,000,000 (종전 base×지분=400,000,000)
    expect(data.deductionBase).toBe(320_000_000);
    // ⑫ 공제액 = cappedDeduction, 그리고 ⑫ = min(⑩, ⑪) 자기정합
    expect(data.deductionAmount).toBe(320_000_000);
    expect(Math.min(data.deductionBase!, data.cap!)).toBe(data.deductionAmount);
  });

  it("[M12/13-2020] 2020+ 상속(100%·6억): 평가 4억 → ⑩ = 400,000,000 (rate 1.0, 기존 동작 불변)", () => {
    const result = makeResult(1.0, 600_000_000, 400_000_000);
    const data = buildBesshi6_2Data(result, [cohabitHeir], "피상속인", undefined, "2024-05-01")!;
    expect(data.deductionBase).toBe(400_000_000);
    expect(data.deductionAmount).toBe(400_000_000);
    expect(Math.min(data.deductionBase!, data.cap!)).toBe(data.deductionAmount);
  });
});
