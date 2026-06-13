/**
 * useInheritanceResultDerived — InheritanceTaxResultView 파생 계산 로직 (순수 props 의존).
 * 800줄 정책에 따라 InheritanceTaxResultView.tsx에서 분리 (2026-06-09).
 * 컴포넌트 로컬 state에 의존하지 않으므로 훅으로 추출 가능.
 */
import { useMemo } from "react";
import { addMonths, endOfMonth, format } from "date-fns";
import type { PrintSectionId } from "@/lib/print/inheritance-print-sections";
import type {
  InheritanceTaxResult,
  Heir,
  EstateItem,
  DebtItem,
  PriorGift,
} from "@/lib/tax-engine/types/inheritance-gift.types";
import { toCollateralDebtItems } from "@/lib/tax-engine/inheritance-collateral-debt";
import { isSimpleModeUnlisted } from "@/lib/calc/unlisted-valuation-mode";
import { isInstallmentEligible } from "@/lib/tax-engine/credits/installment-payment";
import { isInstallmentSplitEligible } from "@/lib/tax-engine/credits/installment-split";
import {
  calcPaymentInKindAssessment,
  derivePaymentInKindAssets,
} from "@/lib/tax-engine/credits/payment-in-kind";
import { parseAmount } from "@/components/calc/inputs/CurrencyInput";
import { ASSET_CATEGORY_LABELS } from "./InheritanceTaxResultView.types";

interface DerivedArgs {
  result: InheritanceTaxResult;
  heirs?: Heir[];
  debtItems?: DebtItem[];
  estateItems?: EstateItem[];
  priorGifts?: PriorGift[];
  deathDate?: string;
  installmentEnabled: boolean;
  paymentInKindEnabled: boolean;
  paymentInKindIneligibleAmount: string;
  paymentInKindRequestedAmount: string;
}

export function useInheritanceResultDerived({
  result,
  heirs,
  debtItems,
  estateItems,
  priorGifts,
  deathDate,
  installmentEnabled,
  paymentInKindEnabled,
  paymentInKindIneligibleAmount,
  paymentInKindRequestedAmount,
}: DerivedArgs) {
  // 채무 표시(협의분할 카드·인쇄 선택)는 수동 debtItems 또는 §14 담보채무 자동도출분 중 하나만 있어도 노출
  const hasDebtOrCollateral =
    (debtItems?.length ?? 0) > 0 || (result.collateralDebtDetail?.length ?? 0) > 0;

  // 현재 결과뷰에 실제 렌더되는 leaf id (각 섹션 렌더 가드와 1:1 — 설계 §1)
  const availablePrintIds = useMemo<Set<PrintSectionId>>(() => {
    const s = new Set<PrintSectionId>();
    const hasHeirs = !!heirs && heirs.length > 0;
    const hasAlloc = !!result.heirAllocationResult && hasHeirs;
    const items = estateItems ?? [];
    s.add("tax-summary");
    if (result.exemptionDetail && result.exemptionDetail.itemResults.length > 0)
      s.add("exemption-detail");
    if (hasAlloc) s.add("heir-allocation-summary");
    s.add("deduction-breakdown");
    if (hasAlloc) s.add("allocation-breakdown");
    if (hasHeirs) s.add("source-data");
    if (priorGifts && priorGifts.length > 0 && deathDate) s.add("prior-gift-filing");
    if (result.corporateExemption && result.corporateExemption.amount > 0)
      s.add("corporate-exemption");
    if (hasAlloc && hasDebtOrCollateral) s.add("debt-allocation");
    if (hasAlloc) s.add("filing-form-9");
    if (hasAlloc && (items.length > 0 || (priorGifts?.length ?? 0) > 0))
      s.add("besshi-buppyo-2");
    if (result.deductionDetail) s.add("deduction-besshi");
    s.add("valuation-detail");
    if (items.some((it) => it.unlistedStockValuationV2)) s.add("unlisted-stock-besshi");
    if (items.some(isSimpleModeUnlisted)) s.add("unlisted-stock-simple");
    if (
      items.some(
        (it) =>
          it.category === "listed_stock" &&
          (it.listedStockAvgPrice ?? 0) > 0 &&
          (it.listedStockShares ?? 0) > 0
      )
    )
      s.add("listed-stock-besshi");
    if (isInstallmentEligible(result.finalTax)) s.add("installment-guide");
    if (isInstallmentSplitEligible(result.finalTax) && !installmentEnabled)
      s.add("split-payment");
    if (paymentInKindEnabled) s.add("payment-in-kind");
    // 주의 사항(warnings) 섹션 삭제 — 인쇄 선택 집합에서도 제외
    return s;
  }, [result, heirs, estateItems, priorGifts, deathDate, installmentEnabled, paymentInKindEnabled, hasDebtOrCollateral]);

  // 협의분할 표(3) 전용 — debtItems + §14 담보채무 merge (부표3·④카드 전달 금지: 이중 표시 방지)
  const debtItemsWithCollateral = useMemo(
    () => [...(debtItems ?? []), ...toCollateralDebtItems(result.collateralDebtDetail ?? [])],
    [debtItems, result.collateralDebtDetail],
  );

  // 별지9호 ㊵ 물납액 (§73) — min(희망액, 허용한도). 화면 카드와 동일 엔진(단일 진실)
  const paymentInKindFilingAmount = useMemo(() => {
    if (!paymentInKindEnabled) return undefined;
    const assets = derivePaymentInKindAssets(
      estateItems ?? [],
      result,
      parseAmount(paymentInKindIneligibleAmount),
    );
    const d = calcPaymentInKindAssessment({
      finalTax: result.finalTax,
      grossEstateValue: result.grossEstateValue,
      exemptAmount: result.exemptAmount,
      priorGiftToHeirTotal: result.priorGiftToHeirTotal ?? 0,
      taxableEstateValue: result.taxableEstateValue,
      assets,
      requestedAmount: paymentInKindRequestedAmount
        ? parseAmount(paymentInKindRequestedAmount)
        : undefined,
    });
    return d.acceptedRequest ?? d.allowedLimit;
  }, [
    paymentInKindEnabled,
    estateItems,
    result,
    paymentInKindIneligibleAmount,
    paymentInKindRequestedAmount,
  ]);

  // 분납기한 (§70② — 신고기한 §67① 말일+6개월 + 2개월). deathDate 없으면 undefined.
  const splitDueDates = useMemo(() => {
    if (!deathDate) return undefined;
    const base = new Date(deathDate);
    if (isNaN(base.getTime())) return undefined;
    const filing = addMonths(endOfMonth(base), 6);
    const installment = addMonths(filing, 2);
    return {
      filing: format(filing, "yyyy-MM-dd"),
      installment: format(installment, "yyyy-MM-dd"),
    };
  }, [deathDate]);

  // 재산 평가 내역 표시명 — 자산 id → name(있으면) 또는 카테고리 한글 라벨 (내부 id 노출 방지)
  const assetNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const it of estateItems ?? []) {
      map.set(it.id, it.name?.trim() || ASSET_CATEGORY_LABELS[it.category] || "재산");
    }
    return map;
  }, [estateItems]);

  return {
    hasDebtOrCollateral,
    availablePrintIds,
    debtItemsWithCollateral,
    paymentInKindFilingAmount,
    splitDueDates,
    assetNameById,
  };
}
