/**
 * Pre-Do anchor — 물납 국채·공채 분류 (§74②1호 · §73⑤ 금융재산 제외)
 *
 * ## 법령 근거 (KoreanLaw 실측 — 상증령 MST 283637, 시행일 2026-02-27)
 *
 * 상증령 §73⑤ (법 §73①3호 위임) — **금융재산은 열거주의**:
 *   "금전과 금융회사등이 취급하는 예금·적금·부금·계금·출자금·특정금전신탁·보험금·공제금 및 어음"
 *   → **국채·공채는 열거에 없다** (어음은 있으나 채권은 없음).
 *
 * 상증령 §74①2호 — 물납 충당 가능 유가증권:
 *   "국채·공채·주권 및 내국법인이 발행한 채권 또는 증권 …"
 * 상증령 §74②1호 — 충당 순서 **1순위**: "국채 및 공채"
 *
 * → 국채·공채는 §74① 충당 자산이면서 §73⑤ 금융재산이 **아니다**. 이중계상 우려 없음
 *   (`inheritance-gift-estate.types.ts` 보류 주석의 검증 완료 — 2026-07-30).
 *
 * ## 고정하는 결함 (현행 = 납세자 불리)
 *
 * `AssetCategory: "financial"`은 "예금·펀드·**채권** (§22 금융재산공제 대상)"로 정의되어
 * `classifyForPaymentInKind`가 `grossFinancialValue`로 보낸다. 그러나 §22 금융재산상속공제의
 * "금융재산"(금융실명법 기준·채권 포함)과 §73⑤ 물납 요건의 "금융재산"(열거·채권 제외)은
 * **정의가 다르다**. 같은 카테고리를 재사용해 물납 쪽에서 과대계상된다.
 *
 * 영향(둘 다 납세자 불리):
 *   - 요건3 `납부세액 > 금융재산` → 금융재산 과대 → **물납 부적격 오판정**
 *   - 한도2 `납부세액 − 순금융재산 − 상장유가증권` → 과대 차감 → **허용한도 과소**
 *
 * A-GB-1은 **Do 전 실패**한다(현행에 `isGovernmentBond` 없음). 구현 후 통과로 전환.
 */
import { describe, it, expect } from "vitest";
import { calcPaymentInKindAssessment } from "@/lib/tax-engine/credits/payment-in-kind";
import { derivePaymentInKindAssets } from "@/lib/tax-engine/credits/payment-in-kind";
import { estateItemSchema } from "@/lib/validators/estate-item-schema";
import type { PaymentInKindInput } from "@/lib/tax-engine/types/inheritance-payment-in-kind.types";
import type { EstateItem } from "@/lib/tax-engine/types/inheritance-gift-estate.types";

// ─── 사안: 상속재산 30억 (부동산 16억 · 예금 4억 · 국채 5억 · 기타 5억), 납부세액 6억 ───
const FINAL_TAX = 600_000_000;
const GROSS_ESTATE = 3_000_000_000;
const REAL_ESTATE = 1_600_000_000;
const DEPOSIT = 400_000_000;
const GOV_BOND = 500_000_000;

function mkInput(over: Partial<PaymentInKindInput["assets"]>): PaymentInKindInput {
  return {
    finalTax: FINAL_TAX,
    grossEstateValue: GROSS_ESTATE,
    exemptAmount: 0,
    priorGiftToHeirTotal: 0,
    taxableEstateValue: GROSS_ESTATE,
    requestedAmount: 0,
    assets: {
      realEstateValue: REAL_ESTATE,
      eligibleSecuritiesValue: 0,
      governmentBondValue: 0,
      unlistedStockValue: 0,
      tradableListedValue: 0,
      grossFinancialValue: DEPOSIT,
      financialInstitutionDebt: 0,
      heirResidenceValue: 0,
      ineligibleManagementValue: 0,
      ...over,
    },
  } as PaymentInKindInput;
}

// ══════════════════════════════════════════════════════════
describe("A-GB-0 — 분류에 따른 세액 영향 (수치 고정)", () => {
  it("오분류(국채를 §73⑤ 금융재산에 합산): 물납 부적격·한도 0", () => {
    const r = calcPaymentInKindAssessment(
      mkInput({ grossFinancialValue: DEPOSIT + GOV_BOND }),
    );
    // 요건3: 600,000,000 > 900,000,000 실패 → 부적격
    expect(r.eligible).toBe(false);
    expect(r.allowedLimit).toBe(0);
  });

  it("법령 분류(국채를 §74① 충당 유가증권): 적격·한도 2억", () => {
    const r = calcPaymentInKindAssessment(
      mkInput({ eligibleSecuritiesValue: GOV_BOND }),
    );
    // 요건3: 600,000,000 > 400,000,000 충족.
    // 한도2 = 600,000,000 − 400,000,000 − 0 = 200,000,000 → allowedLimit
    expect(r.eligible).toBe(true);
    expect(r.allowedLimit).toBe(200_000_000);
  });

  it("두 분류의 차이는 2억원 + 적격 판정 자체가 뒤집힌다", () => {
    const wrong = calcPaymentInKindAssessment(
      mkInput({ grossFinancialValue: DEPOSIT + GOV_BOND }),
    );
    const right = calcPaymentInKindAssessment(
      mkInput({ eligibleSecuritiesValue: GOV_BOND }),
    );
    expect(right.allowedLimit - wrong.allowedLimit).toBe(200_000_000);
    expect(wrong.eligible).toBe(false);
    expect(right.eligible).toBe(true);
  });
});

// ══════════════════════════════════════════════════════════
describe("A-GB-1 [Do 전 실패] — isGovernmentBond flag 자동도출", () => {
  const estateItems = [
    { id: "re1", category: "real_estate_land", name: "토지", marketValue: REAL_ESTATE },
    { id: "fin1", category: "financial", name: "예금", marketValue: DEPOSIT },
    // 국채 — financial 카테고리로 입력하되 §73⑤ 열거 외임을 flag로 표시
    {
      id: "gb1",
      category: "financial",
      name: "국고채권",
      marketValue: GOV_BOND,
      isGovernmentBond: true,
    },
  ] as unknown as EstateItem[];

  const result = {
    valuationResults: [
      { estateItemId: "re1", valuatedAmount: REAL_ESTATE },
      { estateItemId: "fin1", valuatedAmount: DEPOSIT },
      { estateItemId: "gb1", valuatedAmount: GOV_BOND },
    ],
    collateralDebtDetail: [],
  } as unknown as Parameters<typeof derivePaymentInKindAssets>[1];

  it("국채는 grossFinancialValue에서 제외된다 (§73⑤ 열거 외)", () => {
    const a = derivePaymentInKindAssets(estateItems, result, 0);
    expect(a.grossFinancialValue).toBe(DEPOSIT);
  });

  it("국채는 governmentBondValue로 분리 집계된다 (§74②1호 1순위)", () => {
    const a = derivePaymentInKindAssets(estateItems, result, 0);
    expect(a.governmentBondValue).toBe(GOV_BOND);
  });

  it("flag 없는 예금은 종전대로 금융재산이다 (회귀 가드)", () => {
    const onlyDeposit = derivePaymentInKindAssets(
      [estateItems[1]],
      {
        valuationResults: [{ estateItemId: "fin1", valuatedAmount: DEPOSIT }],
        collateralDebtDetail: [],
      } as unknown as Parameters<typeof derivePaymentInKindAssets>[1],
      0,
    );
    expect(onlyDeposit.grossFinancialValue).toBe(DEPOSIT);
    expect(onlyDeposit.governmentBondValue).toBe(0);
  });

  it("자동도출 결과로 계산하면 적격·한도 2억 (법령 분류와 일치)", () => {
    const a = derivePaymentInKindAssets(estateItems, result, 0);
    const r = calcPaymentInKindAssessment({
      finalTax: FINAL_TAX,
      grossEstateValue: GROSS_ESTATE,
      exemptAmount: 0,
      priorGiftToHeirTotal: 0,
      taxableEstateValue: GROSS_ESTATE,
      requestedAmount: 0,
      assets: a,
    } as PaymentInKindInput);
    expect(r.eligible).toBe(true);
    expect(r.allowedLimit).toBe(200_000_000);
  });

  it("충당순서 1호(국채·공채)에 실제 가액이 표시된다 (§74②1호)", () => {
    const a = derivePaymentInKindAssets(estateItems, result, 0);
    const r = calcPaymentInKindAssessment({
      finalTax: FINAL_TAX,
      grossEstateValue: GROSS_ESTATE,
      exemptAmount: 0,
      priorGiftToHeirTotal: 0,
      taxableEstateValue: GROSS_ESTATE,
      requestedAmount: 0,
      assets: a,
    } as PaymentInKindInput);
    const first = r.fillOrder.find((s) => s.order === 1);
    expect(first?.availableValue).toBe(GOV_BOND);
  });
});

// ══════════════════════════════════════════════════════════
describe("⑫ Zod 침묵 strip 가드 — isGovernmentBond 통과", () => {
  // z.object는 정의되지 않은 키를 **에러 없이 제거**한다. 스키마 누락 시 엔진에 도달하지 않고
  // 테스트도 통과해버리므로(침묵 오답), 통과 여부를 명시적으로 고정한다.
  const govBondItem = {
    id: "gb1",
    category: "financial",
    name: "국고채권",
    marketValue: GOV_BOND,
    isGovernmentBond: true,
  };

  it("financial 카테고리에서 isGovernmentBond가 파싱 결과에 살아남는다", () => {
    const parsed = estateItemSchema.parse(govBondItem);
    expect((parsed as { isGovernmentBond?: boolean }).isGovernmentBond).toBe(true);
  });

  it("미지정 시 undefined (optional — 기존 데이터 호환)", () => {
    const parsed = estateItemSchema.parse({
      id: "fin1",
      category: "financial",
      name: "예금",
      marketValue: DEPOSIT,
    });
    expect((parsed as { isGovernmentBond?: boolean }).isGovernmentBond).toBeUndefined();
  });
});
