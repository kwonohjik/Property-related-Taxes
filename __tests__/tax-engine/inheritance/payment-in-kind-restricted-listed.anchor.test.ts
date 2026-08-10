/**
 * Pre-Do anchor — 물납 **처분제한 상장 유가증권** (상증령 §74①2호가목 **단서** · §74②2호)
 *
 * ## 법령 근거 (KoreanLaw 실측 — 상증령 MST 283637)
 *
 * **§74①2호가목**(법제처 XML `<목내용>`):
 * > "가. 거래소에 상장된 것. **다만, 최초로 거래소에 상장되어 물납허가통지서 발송일 전일 현재
 * >  「자본시장과 금융투자업에 관한 법률」에 따라 처분이 제한된 경우에는 그러하지 아니하다.**"
 *
 * ⇒ 상장 유가증권은 원칙적으로 충당 대상에서 **빠지지만**, **최초 상장 + 처분제한**이면
 *   단서로 되살아나 **충당 대상**이 된다(IPO 보호예수 주식이 전형).
 *
 * **§74②2호** — 충당 순서 **2순위**:
 * > "제1항제2호가목 **단서**에 해당하는 유가증권(제1호의 재산을 제외한다)으로서 거래소에 상장된 것"
 *
 * **§73①2호** — 한도2에서 차감할 대상:
 * > "…거래소에 상장된 유가증권(**법령에 따라 처분이 제한된 것은 제외한다**)의 가액을 차감한 금액"
 *
 * ⇒ 처분제한 상장분은 **한도2에서 차감하지 않는다**. 차감 제외 문구와 가목 단서가 같은 축이다.
 *
 * ## 고정하는 결함 (현행 = **납세자 불리**)
 *
 * 현행 `classifyForPaymentInKind`는 상장 주권을 **처분제한 여부와 무관하게** `tradableListed`로
 * 보낸다. 그 결과 처분제한 상장주식이:
 *   1. 요건1 분자(§73①1호 부동산·유가증권)에서 **빠지고** → 「1/2 초과」 판정이 불리해진다
 *   2. 한도2에서 **차감되어**(§73①2호) → 허용한도가 과소해진다
 *   3. 충당순서 **2순위**가 비어 표에 나타나지 않는다
 *
 * 기존 타입 주석이 이 갭을 정확히 지목하고 있었다(`inheritance-gift-estate.types.ts`):
 * > "※ 가목 **단서**(최초상장 + 자본시장법 처분제한)는 국채에서 사실상 성립하지 않아 별도
 * >  입력을 두지 않았다. **주권·증권의 처분제한 상장은 별건으로 남아 있다.**"
 *
 * ## ⚠️ 충당순서 배열도 함께 틀어져 있다
 *
 * `availableByOrder`가 **2순위에 `eligibleSecuritiesValue`**(= §74②**4호** 「그 밖의 유가증권」)를
 * 넣고 **4순위를 `0`으로 하드코딩**한다. 법령 매핑이 한 칸씩 밀려 있다.
 *
 * A-RL-2·A-RL-3은 **Do 전 실패**한다. 구현 후 통과로 전환.
 */
import { describe, it, expect } from "vitest";
import {
  calcPaymentInKindAssessment,
  derivePaymentInKindAssets,
} from "@/lib/tax-engine/credits/payment-in-kind";
import type { PaymentInKindInput } from "@/lib/tax-engine/types/inheritance-payment-in-kind.types";
import type { EstateItem } from "@/lib/tax-engine/types/inheritance-gift-estate.types";
import type { InheritanceTaxResult } from "@/lib/tax-engine/types/inheritance-gift.types";

// ─── 사안: 상속재산 30억 (부동산 16억 · 예금 4억 · 상장주식 5억 · 기타 5억), 납부세액 6억 ───
const FINAL_TAX = 600_000_000;
const GROSS_ESTATE = 3_000_000_000;
const REAL_ESTATE = 1_600_000_000;
const DEPOSIT = 400_000_000;
const LISTED_STOCK = 500_000_000;

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
      restrictedListedValue: 0,
      grossFinancialValue: DEPOSIT,
      financialInstitutionDebt: 0,
      heirResidenceValue: 0,
      ineligibleManagementValue: 0,
      ...over,
    },
  } as PaymentInKindInput;
}

const VAL = (items: EstateItem[]) =>
  ({
    valuationResults: items.map((i) => ({
      estateItemId: i.id,
      valuatedAmount: i.marketValue ?? 0,
    })),
    collateralDebtDetail: [],
  }) as unknown as Pick<InheritanceTaxResult, "valuationResults" | "collateralDebtDetail">;

// ══════════════════════════════════════════════════════════
describe("A-RL-1 — 분류가 세액에 미치는 영향 (수치 고정)", () => {
  it("처분제한 상장을 일반 상장으로 오분류: 한도2에서 차감되어 허용한도가 줄어든다", () => {
    const wrong = calcPaymentInKindAssessment(
      mkInput({ tradableListedValue: LISTED_STOCK }),
    );
    // 한도2 = 600,000,000 − 400,000,000(금융) − 500,000,000(상장) < 0 → 0
    expect(wrong.allowedLimit).toBe(0);
  });

  it("법령 분류(가목 단서 → 충당 대상): 한도2 미차감 + 요건1 분자 포함", () => {
    const right = calcPaymentInKindAssessment(
      mkInput({ restrictedListedValue: LISTED_STOCK }),
    );
    // 한도2 = 600,000,000 − 400,000,000 − 0(처분제한분은 차감 제외) = 200,000,000
    expect(right.allowedLimit).toBe(200_000_000);
    expect(right.eligible).toBe(true);
    // 요건1 분자에 포함된다(부동산 16억 + 처분제한 상장 5억 = 21억 > 15억).
    expect(right.requirement.realEstateSecuritiesValue).toBe(
      REAL_ESTATE + LISTED_STOCK,
    );
  });

  it("두 분류의 차이는 2억원 (납세자 불리 방향의 결함이었다)", () => {
    const wrong = calcPaymentInKindAssessment(mkInput({ tradableListedValue: LISTED_STOCK }));
    const right = calcPaymentInKindAssessment(mkInput({ restrictedListedValue: LISTED_STOCK }));
    expect(right.allowedLimit - wrong.allowedLimit).toBe(200_000_000);
  });
});

// ══════════════════════════════════════════════════════════
describe("A-RL-2 [Do 전 실패] — isNewlyListedDisposalRestricted flag 자동도출", () => {
  const items = [
    { id: "re1", category: "real_estate_land", name: "토지", marketValue: REAL_ESTATE },
    { id: "fin1", category: "financial", name: "예금", marketValue: DEPOSIT },
    {
      id: "st1",
      category: "listed_stock",
      name: "최초상장 보호예수 주식",
      marketValue: LISTED_STOCK,
      isNewlyListedDisposalRestricted: true,
    },
  ] as unknown as EstateItem[];

  it("처분제한 상장주식은 tradableListed가 아니라 restrictedListed로 간다", () => {
    const assets = derivePaymentInKindAssets(items, VAL(items), 0);
    expect(assets.restrictedListedValue).toBe(LISTED_STOCK);
    expect(assets.tradableListedValue).toBe(0);
  });

  it("flag가 없으면 종전대로 tradableListed다 (회귀 0 · 양성 대조군)", () => {
    const plain = items.map((i) =>
      i.id === "st1" ? { ...i, isNewlyListedDisposalRestricted: undefined } : i,
    ) as EstateItem[];
    const assets = derivePaymentInKindAssets(plain, VAL(plain), 0);
    expect(assets.tradableListedValue).toBe(LISTED_STOCK);
    expect(assets.restrictedListedValue).toBe(0);
  });
});

// ══════════════════════════════════════════════════════════
describe("A-RL-3 [Do 전 실패] — 충당순서 배열이 §74②와 한 칸씩 어긋나 있었다", () => {
  it("2순위는 처분제한 상장, 4순위는 그 밖의 유가증권이다", () => {
    const r = calcPaymentInKindAssessment(
      mkInput({
        restrictedListedValue: LISTED_STOCK,
        eligibleSecuritiesValue: 300_000_000,
      }),
    );
    const byOrder = Object.fromEntries(r.fillOrder.map((f) => [f.order, f.availableValue]));
    // §74②2호 — 가목 단서 유가증권으로서 거래소 상장된 것
    expect(byOrder[2]).toBe(LISTED_STOCK);
    // §74②4호 — ①2호 유가증권 중 1·2·5호를 제외한 나머지
    expect(byOrder[4]).toBe(300_000_000);
  });

  it("라벨도 조문 순서와 일치한다", () => {
    const r = calcPaymentInKindAssessment(mkInput({ restrictedListedValue: LISTED_STOCK }));
    expect(r.fillOrder[1].label).toMatch(/처분제한/);
    expect(r.fillOrder[3].label).toMatch(/그 밖의 유가증권/);
  });
});
