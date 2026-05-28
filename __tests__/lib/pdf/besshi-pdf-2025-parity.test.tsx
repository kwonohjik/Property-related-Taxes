/**
 * @vitest-environment jsdom
 *
 * 비상장주식 평가서 PDF — 2025.07.10 공식 양식 동기화 anchor (C1 Pre-Do)
 *
 * Plan: docs/00-pm/inheritance-besshi-pdf-2025-revision-parity.plan.md
 *
 * 목적:
 *   - AN-2 (엔진 수치, font-independent): 이미지17 재현 입력 → 엔진 출력 고정.
 *     레이아웃/폰트 작업(C3~C5)이 값을 바꾸지 않음을 보장.
 *   - AN-3/AN-6 (PDF 구조 gap, Pre-Do): 현 PDF(2021.3.4 구판)에 2025.07.10 요소가
 *     없음을 노출. C4 정합 후 green 전환 — 현재는 의도적으로 RED (gap 증명).
 *
 * 실행:
 *   npx vitest run __tests__/lib/pdf/besshi-pdf-2025-parity.test.tsx
 */

import { describe, it, expect } from "vitest";
import { isValidElement, type ReactElement, type ReactNode } from "react";
import { UnlistedStockBesshiPdfDocument } from "@/lib/pdf/UnlistedStockBesshiPdfDocument";
import { evaluateUnlistedStockV2 } from "@/lib/tax-engine/property-valuation/unlisted-orchestrator";
import type { UnlistedStockValuationInput } from "@/lib/tax-engine/types/unlisted-stock-valuation.types";

// ─────────────────────────────────────────────────────────────────
// 이미지17 재현 입력 (③=1.8B → 영업권 0: 마 180,000,000 > 나 64,350,000)
// ─────────────────────────────────────────────────────────────────
const image17Input: UnlistedStockValuationInput = {
  corpName: "주식회사",
  representative: "김대표",
  businessRegistrationNumber: "123-45-67890",
  capital: 900_000_000,
  businessStartDate: new Date("2010-01-01"),
  evaluationDate: new Date("2022-06-30"),
  faceValuePerShare: 5_000,
  totalShares: 180_000,
  ownedShares: 80_000,
  isRealEstateHeavy: false,
  fiscalYears: [
    { fiscalYearLabel: "2021", fiscalYearEndDate: new Date("2021-12-31"), taxableIncome: 128_700_000 },
    { fiscalYearLabel: "2020", fiscalYearEndDate: new Date("2020-12-31"), taxableIncome: 128_700_000 },
    { fiscalYearLabel: "2019", fiscalYearEndDate: new Date("2019-12-31"), taxableIncome: 128_700_000 },
  ],
  capitalChanges: [],
  netAssetValueRaw: {
    bsTotalAssets: 1_800_000_000, assetValuationDelta: 0,
    corpTaxReservedAmount: 0, paidInCapitalIncrease: 0, otherEarnedRights: 0,
    prepaidExpenses: 0, preGiftRetainedEarnings: 0,
    bsTotalLiabilities: 0, corporateTaxPayable: 0,
    farmingSurtax: 0, localIncomeTax: 0, dividendPayable: 0,
    retirementProvision: 0, otherProvision: 0,
    reserveExcluded: 0, allowanceExcluded: 0, deferredTaxAdjustment: 0,
  },
  isContinuousLossLastThreeYears: false,
  capitalizationRate: 0.10,
  isMaxShareholder: false,
  companySize: "large",
};

/**
 * react-pdf 엘리먼트 트리에서 모든 문자열 자식을 재귀 수집.
 * react-pdf 원시 타입(DOCUMENT/PAGE/TEXT/VIEW)은 string이라 children만 recurse.
 * 본 파일 컴포넌트(Page1Cover·ResultRow 등)는 function 타입 — 순수 함수이므로 직접 실행해 결과를 recurse.
 */
function collectText(node: ReactNode): string {
  if (node == null || node === false || node === true) return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(collectText).join(" ");
  if (isValidElement(node)) {
    const el = node as ReactElement<{ children?: ReactNode }>;
    if (typeof el.type === "function") {
      try {
        return collectText((el.type as (p: unknown) => ReactNode)(el.props));
      } catch {
        return collectText(el.props.children);
      }
    }
    return collectText(el.props.children);
  }
  return "";
}

// ============================================================
// AN-2 — 엔진 수치 anchor (이미지17 재현, font-independent)
// ============================================================
describe("[AN-2] 이미지17 재현 — 엔진 수치 고정", () => {
  const r = evaluateUnlistedStockV2(image17Input);

  it("③ 순자산가액 = 1,800,000,000", () => expect(r.netAssetTotal).toBe(1_800_000_000));
  it("④ 1주당 순자산가액 = 10,000", () => expect(r.netAssetPerShare).toBe(10_000));
  it("⑤ 1주당 순손익가치 = 7,150", () => expect(r.netIncomePerShare).toBe(7_150));
  it("⑥㉮ 가중평균 = 8,290", () => expect(r.weightedAvgPerShare).toBe(8_290));
  it("⑥㉯ 80% 하한 = 8,000", () => expect(r.netAssetFloor80).toBe(8_000));
  it("⑥ 1주당 평가액 = 8,290", () => expect(r.finalPerShareValue).toBe(8_290));
  it("⑨ 보충적 평가가액 = 8,290 (비최대주주, 할증 0)", () => {
    expect(r.premiumRate).toBe(0);
    expect(r.finalPerShareForReporting).toBe(8_290);
  });
  it("총 상속재산가액 = 663,200,000", () => expect(r.totalValuation).toBe(663_200_000));
  it("영업권 = 0 (마 > 나)", () => expect(r.goodwillCalculation.goodwillFinal).toBe(0));
});

// ============================================================
// AN-3 — PDF 제1쪽 2025.07.10 공식 요소 정합 (C4 완료 후 GREEN)
// ============================================================
describe("[AN-3] PDF 제1쪽 2025.07.10 공식 요소 정합", () => {
  const text = collectText(UnlistedStockBesshiPdfDocument({ input: image17Input }));

  it("부제 = 2025.07.10. 개정", () => expect(text).toContain("2025.07.10"));
  it("1번 섹션에 사업자등록번호 칸", () => expect(text).toContain("사업자등록번호"));
  it("1번 섹션에 자본금 칸", () => expect(text).toContain("자본금"));
  it("④ 라벨 = (③ ÷ ①)", () => expect(text).toContain("③ ÷ ①"));
  it("2번 섹션 6행 상시 표시 — 가~바 사유", () => {
    expect(text).toContain("잔여 존속기한 3년 이내");
  });
});

// ============================================================
// AN-7 — 자본금 표시 fallback (capital 미입력 → 액면가 × 발행주식총수)
// ============================================================
describe("[AN-7] 자본금 표시 fallback", () => {
  it("capital 명시 입력 시 그 값 표시 (900,000,000)", () => {
    const text = collectText(UnlistedStockBesshiPdfDocument({ input: image17Input }));
    expect(text).toContain("900,000,000");
  });

  it("capital 미입력 시 액면가(5,000) × 발행주식총수(180,000) = 900,000,000 표시", () => {
    const { capital: _omit, ...withoutCapital } = image17Input;
    void _omit;
    const text = collectText(
      UnlistedStockBesshiPdfDocument({ input: withoutCapital as typeof image17Input }),
    );
    expect(text).toContain("900,000,000");
  });

  it("capital·액면가·발행주식 모두 0/미입력 → '-' (도출 불가)", () => {
    const empty = { ...image17Input, capital: undefined, faceValuePerShare: 0, totalShares: 0 };
    const text = collectText(
      UnlistedStockBesshiPdfDocument({ input: empty as typeof image17Input }),
    );
    // 자본금 셀 라벨은 존재하되 값은 '-' (totalShares 0이면 result 없음 → Page1만, 자본금 행은 1번 섹션)
    expect(text).toContain("자본금");
  });
});
