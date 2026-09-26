/**
 * §53 증여재산공제 — 「기타(타인)」 비친족 증여자 축 anchor (리뷰 7단계 7-A)
 *
 * 「상속세 및 증여세법」 제53조 본문 — "거주자가 **다음 각 호의 어느 하나에 해당하는
 * 사람으로부터** 증여를 받은 경우에는 다음 각 호의 **구분에 따른** 금액을 증여세
 * 과세가액에서 공제한다." ⇒ **한정 열거이며 잔여조항이 없다.**
 * 같은 조 제4호 — "제2호 및 제3호의 경우 외에 **4촌 이내의 혈족, 3촌 이내의 인척**으로부터
 * 증여를 받은 경우: 1천만원"
 *
 * 종전에는 `deriveDonorRelation`이 증여자 축의 「기타」(= 비친족·타인)를 §53 제4호의
 * `other_relative`(기타친족)로 접어 **열거에 없는 자에게 1천만원 공제**를 붙였다.
 * `DonorRelation` union에 「공제 없음」을 표현할 값이 아예 없었던 것이 구조적 원인이다.
 *
 * §39①1호 가·나목의 증여자는 「해당 법인의 주주등」이고, 나목의 특수관계인
 * (「상증령」§2의2①2호 사용인·3호 기업집단 임원·6~8호 출자법인)은 비친족을 다수 포함하므로
 * 비친족 증여자는 §39에서 **제도상 정상 범주**다.
 */

import { describe, it, expect } from "vitest";
import { deriveDonorRelation } from "@/lib/calc/prior-gift-donee-derive";
import { toGiftDeductionDonorRelation } from "@/lib/calc/prior-gift-deduction-perspective";
import { GIFT_DEDUCTION_LIMIT } from "@/lib/tax-engine/deductions/gift-deductions";
import { calcGiftTax } from "@/lib/tax-engine/gift-tax";
import type {
  GiftTaxInput,
  GiftDonorRelation,
  DonorRelation,
} from "@/lib/tax-engine/types/inheritance-gift.types";

function giftInput(donor: GiftDonorRelation, amount: number): GiftTaxInput {
  const relation = deriveDonorRelation(donor, false);
  return {
    giftDate: "2025-01-01",
    donorRelation: relation,
    donor,
    giftItems: [
      { id: "g1", category: "other", name: "증자에 따른 이익 증여이익", marketValue: amount },
    ],
    priorGiftsWithin10Years: [],
    isGenerationSkip: false,
    isMinorDonee: false,
    deductionInput: { donorRelation: relation },
    creditInput: { isFiledOnTime: true },
  };
}

describe("[DR] deriveDonorRelation — 증여자 8값 전수 매핑", () => {
  it("[DR-1] 「기타」(비친족·타인) → none — §53 열거 밖이므로 공제 대상이 아니다", () => {
    expect(deriveDonorRelation("other", false)).toBe("none");
  });

  // 긍정 짝 — 「기타」만 갈라내고 §53 제4호 대상 2값은 그대로여야 한다.
  // 이 짝이 없으면 `other_relative`까지 `none`으로 밀어버리는 과잉 수정이 통과한다.
  it("[DR-2] 「기타친족」 → other_relative (§53 제4호 1천만원 유지)", () => {
    expect(deriveDonorRelation("other_relative", false)).toBe("other_relative");
  });
  it("[DR-3] 「형제자매」(2촌 혈족) → other_relative (§53 제4호 유지)", () => {
    expect(deriveDonorRelation("sibling", false)).toBe("other_relative");
  });

  it("[DR-4] 나머지 5값 전수 — 미성년 수증자 축 포함", () => {
    const table: Array<[GiftDonorRelation, boolean, DonorRelation]> = [
      ["father", false, "lineal_ascendant_adult"],
      ["father", true, "lineal_ascendant_minor"],
      ["mother", false, "lineal_ascendant_adult"],
      ["grandparent", true, "lineal_ascendant_minor"],
      ["spouse", false, "spouse"],
      ["lineal_descendant", false, "lineal_descendant"],
    ];
    for (const [donor, minor, expected] of table) {
      expect(deriveDonorRelation(donor, minor)).toBe(expected);
    }
  });

  it("[DR-5] 「기타」는 미성년 수증자여도 none — 미성년 2천만원은 §53 제2호 단서(직계존속) 한정", () => {
    expect(deriveDonorRelation("other", true)).toBe("none");
  });
});

describe("[DR] §53 한도표", () => {
  it("[DR-6] none의 한도는 0이다", () => {
    expect(GIFT_DEDUCTION_LIMIT.none).toBe(0);
  });
  it("[DR-7] 긍정 짝 — 기존 5관계의 한도는 불변", () => {
    expect(GIFT_DEDUCTION_LIMIT.spouse).toBe(600_000_000);
    expect(GIFT_DEDUCTION_LIMIT.lineal_ascendant_adult).toBe(50_000_000);
    expect(GIFT_DEDUCTION_LIMIT.lineal_ascendant_minor).toBe(20_000_000);
    expect(GIFT_DEDUCTION_LIMIT.lineal_descendant).toBe(50_000_000);
    expect(GIFT_DEDUCTION_LIMIT.other_relative).toBe(10_000_000);
  });
});

describe("[DR] 세액 — 비친족 증여자에게 공제가 붙지 않는다", () => {
  // 리뷰 실측표(증여일 2025-01-01·기한 내 신고). 종전 값은 각각
  // 8,730,000 / 85,360,000 / 229,890,000 으로 1천만원 공제가 붙어 있었다.
  it("[DR-8] 100,000,000 → 과세표준 100,000,000 · 결정세액 9,700,000", () => {
    const r = calcGiftTax(giftInput("other", 100_000_000));
    expect(r.taxBase).toBe(100_000_000);
    expect(r.finalTax).toBe(9_700_000);
  });
  it("[DR-9] 500,000,000 → 과세표준 500,000,000 · 결정세액 87,300,000", () => {
    const r = calcGiftTax(giftInput("other", 500_000_000));
    expect(r.taxBase).toBe(500_000_000);
    expect(r.finalTax).toBe(87_300_000);
  });
  it("[DR-10] 1,000,000,000 → 과세표준 1,000,000,000 · 결정세액 232,800,000", () => {
    const r = calcGiftTax(giftInput("other", 1_000_000_000));
    expect(r.taxBase).toBe(1_000_000_000);
    expect(r.finalTax).toBe(232_800_000);
  });

  // 긍정 짝 — 진짜 §53 제4호 대상은 종전 값 그대로여야 한다.
  it("[DR-11] 긍정 짝: 「기타친족」 100,000,000 → 과세표준 90,000,000 · 결정세액 8,730,000", () => {
    const r = calcGiftTax(giftInput("other_relative", 100_000_000));
    expect(r.taxBase).toBe(90_000_000);
    expect(r.finalTax).toBe(8_730_000);
  });

  it("[DR-12] breakdown이 비친족을 「기타친족」으로 적지 않는다", () => {
    const r = calcGiftTax(giftInput("other", 100_000_000));
    const labels = r.deductionDetail.breakdown.map((b) => b.label).join(" | ");
    expect(labels).not.toContain("기타친족");
    expect(labels).toContain("증여재산공제 없음");
  });
});

describe("[DR] §53의2 혼인·출산공제는 비친족에 적용되지 않는다", () => {
  // §53의2① — 「거주자가 그 **직계존속**으로부터 혼인일 전후 2년 이내에 …」
  it("[DR-13] none + 혼인공제 1억 요청 → 공제 0", () => {
    const base = giftInput("other", 500_000_000);
    const r = calcGiftTax({
      ...base,
      deductionInput: { ...base.deductionInput, marriageExemption: 100_000_000 },
    });
    expect(r.taxBase).toBe(500_000_000);
  });
});

describe("[DR] 상속세 사전증여 관점 변환", () => {
  it("[DR-14] none은 관점을 뒤집어도 none이다 — 비친족은 양방향 비친족", () => {
    expect(toGiftDeductionDonorRelation("none", false)).toBe("none");
    expect(toGiftDeductionDonorRelation("none", true)).toBe("none");
  });
});
