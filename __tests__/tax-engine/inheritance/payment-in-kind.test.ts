/**
 * 상속세 물납 (상증법 §73 / 상증령 §73·§74) anchor — Pre-Do
 * 설계: docs/02-design/features/inheritance-payment-in-kind.engine.design.md §6
 *
 * 분모 확정(조심2016서3563·2024중4490):
 *   - 납부세액 = 산출세액 − 세액공제 = finalTax (산출세액 아님)
 *   - §73①1호 분모 estateBase = grossEstateValue − exemptAmount + priorGiftToHeirTotal (해당 상속재산가액)
 *   - §73④ 비상장 캡 기준 = taxableEstateValue (과세가액, ≠1호 분모)
 *
 * ⚠️ Pre-Do: calcPaymentInKindAssessment 미구현 → 본 파일은 실패(모듈 미존재) 확보가 목적.
 *   PIK-12(거주자 신고기한)는 엔진 input에 decedentType 없어 UI E2E로 이관.
 *   PIK-14(산출세액≠납부세액)는 input에 산출세액 필드 없어 PIK-05에 통합(finalTax 기준 확인).
 */
import { describe, it, expect } from "vitest";
import {
  calcPaymentInKindAssessment,
  isPaymentInKindEligible,
} from "@/lib/tax-engine/credits/payment-in-kind";
import type { PaymentInKindInput } from "@/lib/tax-engine/types/inheritance-gift.types";

// §4.3 예시: 상속재산 20억 · 납부세액 4억 · 충당가능 부동산·유가증권 15억(부동산14+처분제한상장1)
const base: PaymentInKindInput = {
  finalTax: 400_000_000,
  grossEstateValue: 2_000_000_000,
  exemptAmount: 0,
  priorGiftToHeirTotal: 0,
  taxableEstateValue: 2_000_000_000,
  assets: {
    realEstateValue: 1_400_000_000,
    eligibleSecuritiesValue: 100_000_000, // 처분제한 상장(충당가능)
    unlistedStockValue: 200_000_000,
    tradableListedValue: 50_000_000, // 처분제한 없는 상장(§73①2호 차감)
    netFinancialValue: 200_000_000,
    heirResidenceValue: 100_000_000,
    ineligibleManagementValue: 0,
  },
};

describe("물납 — 요건 판정 (§73①1~3호)", () => {
  it("PIK-01 납부세액 2천만원 이하 → 부적격(요건2)", () => {
    const input = { ...base, finalTax: 20_000_000 };
    expect(isPaymentInKindEligible(input)).toBe(false);
    expect(calcPaymentInKindAssessment(input).eligible).toBe(false);
  });

  it("PIK-02 경계 — 정확히 2천만원 부적격, 초과 충족(요건2)", () => {
    expect(
      calcPaymentInKindAssessment({ ...base, finalTax: 20_000_000 }).requirement
        .meetsTaxOver20M,
    ).toBe(false);
    expect(
      calcPaymentInKindAssessment({ ...base, finalTax: 20_000_001 }).requirement
        .meetsTaxOver20M,
    ).toBe(true);
  });

  it("PIK-03 부동산·유가증권 ≤ 상속재산 1/2 → 부적격(요건1)", () => {
    // 충당가능 = 8억+1억 = 9억 ≤ estateBase/2 = 10억
    const r = calcPaymentInKindAssessment({
      ...base,
      assets: { ...base.assets, realEstateValue: 800_000_000 },
    });
    expect(r.requirement.realEstateSecuritiesValue).toBe(900_000_000);
    expect(r.requirement.halfThreshold).toBe(1_000_000_000);
    expect(r.requirement.meetsOverHalf).toBe(false);
    expect(r.eligible).toBe(false);
  });

  it("PIK-04 납부세액 ≤ 금융재산 → 부적격(요건3)", () => {
    // finalTax 1.5억 ≤ netFinancial 2억
    const r = calcPaymentInKindAssessment({ ...base, finalTax: 150_000_000 });
    expect(r.requirement.meetsTaxOverFinancial).toBe(false);
    expect(r.eligible).toBe(false);
  });
});

describe("물납 — 허용한도 min 산식 (상증령 §73①)", () => {
  it("PIK-05 적격 + allowed = min(1호 안분, 2호 차감) = 1.5억", () => {
    const r = calcPaymentInKindAssessment(base);
    expect(r.eligible).toBe(true);
    expect(r.estateBase).toBe(2_000_000_000); // gross − 비과세 + 사전증여
    // 1호: 4억 × 15억 / 20억 = 3억
    expect(r.limit1).toBe(300_000_000);
    // 2호: 4억 − 2억(순금융) − 0.5억(처분제한없는 상장) = 1.5억
    expect(r.limit2).toBe(150_000_000);
    expect(r.allowedLimit).toBe(150_000_000);
    // PIK-14 통합: limit은 finalTax(결정세액) 기준 — 산출세액 아님
  });

  it("PIK-06 1호 < 2호 → allowed = limit1", () => {
    // 충당가능 11억(부동산10+상장1, >10억 요건1 충족), 순금융 1억·상장차감 0
    const r = calcPaymentInKindAssessment({
      ...base,
      assets: {
        ...base.assets,
        realEstateValue: 1_000_000_000,
        netFinancialValue: 100_000_000,
        tradableListedValue: 0,
      },
    });
    expect(r.limit1).toBe(220_000_000); // 4억 × 11억 / 20억
    expect(r.limit2).toBe(300_000_000); // 4억 − 1억 − 0
    expect(r.allowedLimit).toBe(220_000_000);
  });

  it("PIK-13 분모 보정 — 사전증여·비과세 반영 estateBase", () => {
    // gross 18억 − 비과세 1억 + 사전증여(상속인) 3억 = 20억
    const r = calcPaymentInKindAssessment({
      ...base,
      grossEstateValue: 1_800_000_000,
      exemptAmount: 100_000_000,
      priorGiftToHeirTotal: 300_000_000,
    });
    expect(r.estateBase).toBe(2_000_000_000);
    expect(r.limit1).toBe(300_000_000); // 4억 × 15억 / 20억
    expect(r.requirement.halfThreshold).toBe(1_000_000_000);
  });
});

describe("물납 — 비상장 별도 캡 (§73④, 기준=과세가액)", () => {
  it("PIK-07 비상장 캡 = max(0, finalTax − (과세가액 − 비상장 − 거주주택))", () => {
    // 과세가액 5억 − 비상장 3억 − 거주주택 1억 = 1억 → cap = 4억 − 1억 = 3억
    const r = calcPaymentInKindAssessment({
      ...base,
      taxableEstateValue: 500_000_000,
      assets: {
        ...base.assets,
        unlistedStockValue: 300_000_000,
        heirResidenceValue: 100_000_000,
      },
    });
    expect(r.unlistedStockCap).toBe(300_000_000);
  });

  it("PIK-07b 다른 재산으로 충당 가능 시 캡 = 0", () => {
    const r = calcPaymentInKindAssessment(base);
    // max(0, 4억 − (20억 − 2억 − 1억)) = max(0, 4억 − 17억) = 0
    expect(r.unlistedStockCap).toBe(0);
  });
});

describe("물납 — 충당순서 (상증령 §74②)", () => {
  it("PIK-08 6단계 — 비상장 5위·상속인 거주주택 6위", () => {
    const r = calcPaymentInKindAssessment(base);
    expect(r.fillOrder).toHaveLength(6);
    expect(r.fillOrder.map((s) => s.order)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(r.fillOrder[4].order).toBe(5); // 비상장주식
    expect(r.fillOrder[5].order).toBe(6); // 상속인 거주 주택·부수토지
  });
});

describe("물납 — 보정·경고·희망액", () => {
  it("PIK-09 관리·처분 부적당 제외 → 분자·요건1 차감(§73③)", () => {
    const r = calcPaymentInKindAssessment({
      ...base,
      assets: { ...base.assets, ineligibleManagementValue: 500_000_000 },
    });
    // 충당가능 = 15억 − 5억 = 10억
    expect(r.requirement.realEstateSecuritiesValue).toBe(1_000_000_000);
    expect(r.requirement.meetsOverHalf).toBe(false); // 10억 > 10억 거짓(경계)
  });

  it("PIK-10 비상장 보유 → 충당순서 최후순위·관리처분 경고(§74②5호·§71)", () => {
    const r = calcPaymentInKindAssessment(base);
    expect(r.warnings.length).toBeGreaterThan(0);
  });

  it("PIK-11 희망액 > 허용한도 → acceptedRequest = 허용한도", () => {
    const r = calcPaymentInKindAssessment({
      ...base,
      requestedAmount: 300_000_000,
    });
    expect(r.allowedLimit).toBe(150_000_000);
    expect(r.acceptedRequest).toBe(150_000_000); // 별지9호 ㊵
  });
});

// PIK-12 신청기한(거주자 6개월 / 비거주자 9개월): 엔진 input에 decedentType 없음
//   → UI E2E(e2e/inheritance-payment-in-kind.spec.ts PIK-UI)로 이관. 엔진 anchor 제외.
