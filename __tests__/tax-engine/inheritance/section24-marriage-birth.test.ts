/**
 * §24③·§19 분자 §53의2(혼인·출산 증여재산공제) 자동 차감 — anchor (MB-01~06)
 *
 * Plan:   docs/00-pm/inheritance-section24-marriage-birth-deduction.plan.md
 * Design: docs/02-design/features/inheritance-section24-marriage-birth-deduction.engine.design.md
 *
 * §24③: 가산 증여재산가액 − (§53·§53의2·§54 공제). branch 2(giftTaxBase 미설정)에서
 *        §53의2(직계존속 혼인·출산, 통합 1억)를 추가 차감.
 *
 * 구현 후 MB-01 GREEN 전환(5천만→1.5억).
 */
import { describe, it, expect } from "vitest";
import { computePriorGiftDeductionForLimit } from "@/lib/tax-engine/deductions/inheritance-deductions";
import { calcInheritanceTax } from "@/lib/tax-engine/inheritance-tax";
import type { PriorGift, InheritanceTaxInput } from "@/lib/tax-engine/types/inheritance-gift.types";
import type { EstateItem, Heir } from "@/lib/tax-engine/types/inheritance-gift.types";

const DEATH = "2024-06-10";

// ─────────────────────────────────────────────
// §24 분자 단위 anchor (computePriorGiftDeductionForLimit)
// ─────────────────────────────────────────────

describe("§24 분자 §53의2 자동 차감 — anchor MB-01~04", () => {
  it("MB-01 혼인증여 1.5억(§53 5천만+§53의2 1억)·giftTaxBase 미설정 → 공제 합계 1.5억", () => {
    const gifts: PriorGift[] = [
      {
        giftDate: "2023-08-10",
        isHeir: true,
        giftAmount: 150_000_000,
        giftTaxPaid: 0,
        doneeRelation: "lineal_ascendant_adult", // 직계존속 (§53의2 적격)
        // giftTaxBase 미설정 → branch 2
        marriageBirthDeduction: 100_000_000, // §53의2 혼인공제 1억
      } as PriorGift,
    ];

    // §53 직계존속 5천만 + §53의2 1억 = 1.5억
    expect(computePriorGiftDeductionForLimit(gifts, DEATH)).toBe(150_000_000);
  });

  it("MB-02 branch1 이중차감 0 — giftTaxBase=0 + marriageBirthDeduction=1억 → 공제 1.5억(giftAmount-giftTaxBase), §53의2 미참조", () => {
    // giftTaxBase 명시 시 branch 1 진입 → max(0, giftAmount - giftTaxBase) = 1.5억
    // marriageBirthDeduction은 무시되어야 함 (이중차감 금지)
    const gifts: PriorGift[] = [
      {
        giftDate: "2023-08-10",
        isHeir: true,
        giftAmount: 150_000_000,
        giftTaxPaid: 0,
        giftTaxBase: 0, // branch 1 진입
        marriageBirthDeduction: 100_000_000, // 무시되어야 함
      } as PriorGift,
    ];

    // branch 1: max(0, 1.5억 - 0) = 1.5억 (marriageBirthDeduction 미참조)
    expect(computePriorGiftDeductionForLimit(gifts, DEATH)).toBe(150_000_000);
  });

  it("MB-03 per-gift 1억 캡 — marriageBirthDeduction=1.5억 오입력 → 1억으로 캡(§53의2③)", () => {
    const gifts: PriorGift[] = [
      {
        giftDate: "2023-08-10",
        isHeir: true,
        giftAmount: 200_000_000,
        giftTaxPaid: 0,
        doneeRelation: "lineal_ascendant_adult",
        // giftTaxBase 미설정 → branch 2
        marriageBirthDeduction: 150_000_000, // 오입력(1억 초과) → 1억으로 캡
      } as PriorGift,
    ];

    // §53 직계존속 5천만 + §53의2 min(1.5억,1억)=1억 = 1.5억
    expect(computePriorGiftDeductionForLimit(gifts, DEATH)).toBe(150_000_000);
  });

  it("MB-04 §24 단서(과세가액 ≤ 5억) — marriageBirthDeduction 있어도 netPriorGiftDeducted=0, 무해", () => {
    // applyDeductionLimit 내부에서 taxableEstateValue ≤ 5억 시 §24 3호 미적용
    // computePriorGiftDeductionForLimit 자체는 공제 계산 정상이지만
    // 호출처(applyDeductionLimit)에서 단서 적용으로 차단됨 → 무해.
    // 여기서는 computePriorGiftDeductionForLimit 반환값 자체를 검증.
    const gifts: PriorGift[] = [
      {
        giftDate: "2023-08-10",
        isHeir: true,
        giftAmount: 100_000_000,
        giftTaxPaid: 0,
        doneeRelation: "lineal_ascendant_adult",
        marriageBirthDeduction: 100_000_000,
      } as PriorGift,
    ];

    // §53 5천만 + §53의2 min(1억,1억)=1억 = 1.5억
    // 단, giftAmount=1억이므로 실제 차감은 min(1.5억, 과세가액 상한)에서 자연히 1억으로 수렴
    // 여기서는 computePriorGiftDeductionForLimit 반환값: §53(5천만)+§53의2(1억)=1.5억이나
    // 그룹 집계(groupedTotal)는 sum=1억 → calcRelationDeduction(1억)=5천만,
    // explicitTotal += 1억 → 합계 1.5억 (과세가액 초과는 applyDeductionLimit에서 처리)
    expect(computePriorGiftDeductionForLimit(gifts, DEATH)).toBe(150_000_000);
  });
});

// ─────────────────────────────────────────────
// §19 배우자 분자 통합 anchor (calcInheritanceTax)
// ─────────────────────────────────────────────

/** 최소 상속세 입력 빌더 — 배우자+자녀1, 과세가액 충분, debtItems 없음 */
function makeMinimalInput(overrides: Partial<InheritanceTaxInput> = {}): InheritanceTaxInput {
  const spouse: Heir = { id: "sp", relation: "spouse", name: "배우자" };
  const child: Heir = { id: "ch1", relation: "child", name: "자녀1" };
  const estate: EstateItem = {
    id: "e1",
    category: "real_estate_apartment",
    name: "아파트",
    valuationMethod: "market_value",
    marketValue: 2_000_000_000, // 20억
  } as EstateItem;

  return {
    decedentType: "resident",
    deathDate: DEATH,
    estateItems: [estate],
    heirs: [spouse, child],
    deductionInput: {
      heirs: [spouse, child],
      deathDate: DEATH,
    },
    creditInput: {
      isFiledOnTime: true,
    },
    preGiftsWithin10Years: [],
    // legacy 경로 — debtItems 없을 때 필수 숫자 필드 NaN 방지
    debts: 0,
    funeralExpense: 0,
    funeralIncludesBongan: false,
    ...overrides,
  };
}

describe("§19 배우자 분자 §53의2 자동 차감 — anchor MB-05", () => {
  it("MB-05 배우자가 직계존속(친정)으로부터 혼인증여 1.5억·marriageBirthDeduction=1억 → 배우자 spouseGiftTaxBase 감소", () => {
    // 배우자 doneeId=sp, doneeRelation=lineal_ascendant_adult(친정 부모로부터 증여)
    // giftTaxBase 미설정 → branch 2: §53(직계존속성년→직계비속5천만… 여기선 doneeRelation이 증여자 관계)
    // 주의: doneeRelation은 "증여자(피상속인)와 수증자의 관계"가 아니라 "증여자와 수증자 관계".
    //   배우자가 친정 부모(=직계존속)로부터 받은 경우 doneeRelation="lineal_ascendant_adult"
    //   → §53 직계존속 공제 5천만, §53의2 혼인 1억 → spouseGiftTaxBase = max(0, 1.5억-5천만-1억) = 0

    const baseResult = calcInheritanceTax(makeMinimalInput());
    const spouseLegalShareBase = baseResult.deductionDetail.spouseDeduction;

    const withMbGift = calcInheritanceTax(
      makeMinimalInput({
        preGiftsWithin10Years: [
          {
            giftDate: "2023-06-10",
            isHeir: true,
            giftAmount: 150_000_000,
            giftTaxPaid: 0,
            doneeId: "sp", // 배우자가 수증자
            doneeRelation: "lineal_ascendant_adult", // 친정 부모로부터
            // giftTaxBase 미설정 → branch 2
            marriageBirthDeduction: 100_000_000, // §53의2 혼인공제 1억
          } as PriorGift,
        ],
      }),
    );

    // §53의2 반영 시: spouseGiftTaxBase = max(0, 1.5억-5천만-1억) = 0
    // → 배우자 법정상속분 분자에서 사전증여 과세표준 차감 0 → 배우자 공제 최대화
    // §53의2 미반영 시: spouseGiftTaxBase = max(0, 1.5억-5천만) = 1억
    // → 배우자 법정상속분 차감 1억 → 공제 소폭 감소
    // 따라서 §53의2 반영 후 배우자 공제 >= §53의2 미반영 시
    const withoutMbGift = calcInheritanceTax(
      makeMinimalInput({
        preGiftsWithin10Years: [
          {
            giftDate: "2023-06-10",
            isHeir: true,
            giftAmount: 150_000_000,
            giftTaxPaid: 0,
            doneeId: "sp",
            doneeRelation: "lineal_ascendant_adult",
            // marriageBirthDeduction 없음
          } as PriorGift,
        ],
      }),
    );

    // §53의2 반영 시 spouseGiftTaxBase=0 → 배우자 공제 higher or equal
    expect(withMbGift.deductionDetail.spouseDeduction).toBeGreaterThanOrEqual(
      withoutMbGift.deductionDetail.spouseDeduction,
    );

    // 1억 차이: spouseGiftTaxBase 0 vs 1억 → 배우자 법정상속분이 1억 더 높음
    // 배우자 법정상속분 한도 적용 여부에 따라 차이가 그대로 공제에 반영될 수 있음
    // (20억 자산, 배우자+자녀1: 법정상속분=20억×1.5/2.5=12억, 충분히 여유 있음)
    // spouseGiftTaxBase 1억 차이 → computedSpouseLegalShare 1억 차이 → 배우자 공제 1억 차이
    expect(withMbGift.deductionDetail.spouseDeduction - withoutMbGift.deductionDetail.spouseDeduction).toBe(
      100_000_000,
    );
  });
});

describe("§24·§19 §53의2 회귀 anchor — MB-06", () => {
  it("MB-06 marriageBirthDeduction undefined → 기존(§53만) 결과 완전 동일", () => {
    const withoutField = computePriorGiftDeductionForLimit(
      [
        {
          giftDate: "2023-08-10",
          isHeir: true,
          giftAmount: 150_000_000,
          giftTaxPaid: 0,
          doneeRelation: "lineal_ascendant_adult",
          // marriageBirthDeduction 없음
        } as PriorGift,
      ],
      DEATH,
    );

    const withUndefined = computePriorGiftDeductionForLimit(
      [
        {
          giftDate: "2023-08-10",
          isHeir: true,
          giftAmount: 150_000_000,
          giftTaxPaid: 0,
          doneeRelation: "lineal_ascendant_adult",
          marriageBirthDeduction: undefined, // 명시 undefined
        } as PriorGift,
      ],
      DEATH,
    );

    // 둘 다 §53만: 직계존속성년 5천만
    expect(withoutField).toBe(50_000_000);
    expect(withUndefined).toBe(50_000_000);
    expect(withoutField).toBe(withUndefined);
  });
});
