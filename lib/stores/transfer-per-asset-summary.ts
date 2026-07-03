/**
 * 양도세 사이드바 — 자산별 요약 순수 함수.
 *
 * 마법사 좌측 사이드바에 자산 1·2·… 별로 「양도가액·취득가액·필요경비·공제·감면」을
 * 분리 표시하기 위한 계산. `computeTransferSummary`(aggregate)와 별개 — 이 함수는
 * 자산 단위로 분해하며, 안분(§166⑥) 모드의 양도가액을 엔진 함수로 산출한다.
 *
 * 정책:
 *   - 안분 계산은 엔진 `apportionBundledSale` 재사용 (재구현 금지, single-source).
 *   - 기준시가 미입력 시 자동 안분 금지 → salePending(«계산 후 표시»). silent fallback 금지.
 *   - 무한 루프 방지: 소비처(TransferTaxCalculator)에서 useMemo로 래핑.
 *   - 결과(bundled) 매칭은 위치 인덱스가 아니라 assetId로 (payload primary/companion 별도 조립).
 *
 * 근거: 소득세법 시행령 §166⑥ (양도가액 기준시가 비율 안분).
 */

import type { TransferFormData } from "./calc-wizard-store";
import type { AssetForm } from "./calc-wizard-asset";
import type { ReductionType } from "./calc-wizard-asset-reduction";
import type { TransferAPIResult } from "@/lib/calc/transfer-tax-api";
import type { BundledAssetInput, BundledAssetKind } from "@/lib/tax-engine/types/bundled-sale.types";
import { apportionBundledSale } from "@/lib/tax-engine/bundled-sale-apportionment";
import { calculateEstimatedAcquisitionPrice, applyRate } from "@/lib/tax-engine/tax-utils";

export interface TransferAssetSummaryRow {
  assetId: string;
  /** 1-based 순번 — "자산 N" 헤더용 */
  index: number;
  assetLabel: string;
  assetKind: AssetForm["assetKind"];
  salePrice: number;
  acqPrice: number;
  expense: number;
  reductionTypes: ReductionType[];
  /** «계산 후 표시» 플래그 (환산/안분 미충족 등) */
  salePending: boolean;
  acqPending: boolean;
  expensePending: boolean;
  /** 양도가액이 기준시가 비율 안분값이면 true → «기준시가 안분» 라벨 */
  saleIsApportioned: boolean;
  /** < 1 이면 지분 단계취득 → «지분 N%» 라벨 */
  ownershipRatio: number;
}

export interface TransferPerAssetSummary {
  rows: TransferAssetSummaryRow[];
  /** Σ rows.salePrice — 사이드바 합계 양도가액 푸터용 */
  totalSalePrice: number;
}

function parseRaw(v: string | undefined): number {
  return parseInt((v ?? "").replace(/[^0-9]/g, "") || "0", 10);
}

/** 지분율 (단독 소유는 1.0). computeTransferSummary·API 어댑터와 동일 규칙(inline). */
function ownershipRatioOf(a: AssetForm): number {
  const n = parseFloat(a.ownershipNumerator || "100");
  const d = parseFloat(a.ownershipDenominator || "100");
  if (!isFinite(n) || !isFinite(d) || d <= 0 || n <= 0 || n >= d) return 1;
  return n / d;
}

/** AssetForm.assetKind → BundledAssetKind (안분 산식엔 미사용, 타입 충족용). */
function toBundledKind(kind: AssetForm["assetKind"]): BundledAssetKind {
  if (kind === "land") return "land";
  if (kind === "housing" || kind === "right_to_move_in" || kind === "presale_right" || kind === "redevelopment_apt") {
    return "housing";
  }
  return "building";
}

/** 자산별 직접 취득가액 base (지분 ratio 적용 전 raw). */
function directAcqRaw(a: AssetForm): number {
  return a.isSalesCaseAcquisition ? parseRaw(a.similarSalesValue) : parseRaw(a.fixedAcquisitionPrice);
}

/** 자산별 직접 필요경비 base (지분 ratio 적용 전 raw). */
function directExpenseRaw(a: AssetForm): number {
  const split = parseRaw(a.capitalExpenditure) + parseRaw(a.transferExpense);
  return split > 0 ? split : parseRaw(a.directExpenses);
}

/**
 * 안분 모드에서 자산별 양도가액을 산출 가능한지 판정.
 * 조건: 안분 모드 · 자산 2건 이상 · 총액 > 0 · **비지분(variable) 자산**의 양도시 기준시가 > 0.
 * (지분 자산은 총액×지분을 §166⑥ 본문 구분 기재로 넘겨 안분 대상에서 제외되므로 기준시가 불요.)
 */
function canApportion(formData: TransferFormData): boolean {
  if (formData.bundledSaleMode !== "apportioned") return false;
  if (formData.assets.length < 2) return false;
  if (parseRaw(formData.contractTotalPrice) <= 0) return false;
  return formData.assets.every(
    (a) => ownershipRatioOf(a) < 1 || parseRaw(a.standardPriceAtTransfer) > 0,
  );
}

/**
 * 안분 결과를 assetId → allocatedSalePrice 맵으로 (계산 전 프리뷰).
 * 엔진 `buildAssetPayload`(transfer-tax-api-helpers:489-495)와 동일하게 지분 자산은
 * `fixedSalePrice = 총액 × 지분`으로 넘겨 §166⑥ 본문 안분 제외 → 잔여만 비지분 자산에 안분.
 * (미러링 누락 시 형제 자산이 잔여 아닌 전체총액 기준으로 안분되어 합계가 어긋남 — 이중계상.)
 */
function computeApportionedSaleMap(formData: TransferFormData): Map<string, number> | null {
  const total = parseRaw(formData.contractTotalPrice);
  const assets: BundledAssetInput[] = formData.assets.map((a) => {
    const ratio = ownershipRatioOf(a);
    return {
      assetId: a.assetId,
      assetLabel: a.assetLabel,
      assetKind: toBundledKind(a.assetKind),
      standardPriceAtTransfer: parseRaw(a.standardPriceAtTransfer),
      fixedSalePrice: ratio < 1 ? Math.floor(total * ratio) : undefined,
    };
  });
  try {
    const res = apportionBundledSale({ totalSalePrice: total, assets });
    return new Map(res.apportioned.map((p) => [p.assetId, p.allocatedSalePrice]));
  } catch {
    return null;
  }
}

export function computeTransferPerAssetSummary(
  formData: TransferFormData,
  result: TransferAPIResult | null,
): TransferPerAssetSummary {
  const isSingle = formData.assets.length === 1;
  const bundledResult = result?.mode === "bundled" ? result : null;
  const singleResult = result?.mode === "single" ? result.result : null;

  // 계산 전 안분 프리뷰 맵 (bundled 결과가 없을 때만 사용)
  const apportionedMap =
    !bundledResult && canApportion(formData) ? computeApportionedSaleMap(formData) : null;

  // 단건 환산 프리뷰 게이트 — 현행 TransferTaxCalculator canPreviewEstimated와 동일.
  const primary = formData.assets[0];
  const canPreviewEstimated =
    isSingle &&
    !!primary &&
    primary.useEstimatedAcquisition &&
    !primary.parcelMode &&
    !primary.isMixedUseHouse &&
    !primary.hasSeperateLandAcquisitionDate &&
    primary.transferType !== "burdened_gift" &&
    (primary.assetKind === "land" || primary.assetKind === "housing");

  const rows: TransferAssetSummaryRow[] = formData.assets.map((a, i) => {
    const ratio = ownershipRatioOf(a);
    const fractional = ratio < 1;
    const bundledMatch = bundledResult?.apportionment.apportioned.find((p) => p.assetId === a.assetId);

    // ── 양도가액 ──
    let salePrice = 0;
    let salePending = false;
    let saleIsApportioned = false;
    if (bundledMatch) {
      salePrice = bundledMatch.allocatedSalePrice;
      saleIsApportioned = bundledMatch.saleMode === "apportioned";
    } else if (apportionedMap && apportionedMap.has(a.assetId)) {
      // 안분 프리뷰 (지분 자산 포함 — 엔진과 동일하게 fixedSalePrice 제외·잔여흡수 반영).
      // 지분 자산은 고정값(«지분 N%»), 비지분 자산은 기준시가 안분값(«기준시가 안분»).
      salePrice = apportionedMap.get(a.assetId)!;
      saleIsApportioned = !fractional;
    } else if (fractional) {
      // 지분 단계취득 (안분 프리뷰 불가 시) — 총액 × 지분 (API :493-495와 일치)
      salePrice = Math.floor(parseRaw(formData.contractTotalPrice) * ratio);
    } else if (formData.bundledSaleMode === "apportioned" && !isSingle) {
      salePending = true; // 기준시가 미입력 등 — «계산 후 표시»
    } else {
      // 실가 모드 · 단일 자산
      salePrice = parseRaw(a.actualSalePrice);
    }

    // ── 취득가액 ──
    const acqBase = directAcqRaw(a);
    let acqPrice = fractional ? Math.floor(acqBase * ratio) : acqBase;
    let acqPending = false;
    if (bundledMatch) {
      acqPrice = bundledMatch.allocatedAcquisitionPrice;
    } else if (acqPrice === 0 && isSingle) {
      // 단건 fallback 체인 (상속의제 → 계산 결과 환산 → 환산 프리뷰)
      if (a.inheritanceMode === "post-deemed" && a.inheritanceStartDate) {
        acqPrice = parseRaw(a.inheritanceReportedValue);
      } else if (
        a.inheritanceMode === "pre-deemed" &&
        a.inheritanceStartDate &&
        singleResult?.inheritedAcquisitionDetail
      ) {
        acqPrice = singleResult.inheritedAcquisitionDetail.acquisitionPrice || 0;
      } else if (singleResult?.usedEstimatedAcquisition) {
        acqPrice = singleResult.estimatedBase ?? 0;
      } else if (canPreviewEstimated) {
        const stdAcq = parseRaw(a.standardPriceAtAcq);
        const stdTransfer = parseRaw(a.standardPriceAtTransfer);
        const sale = parseRaw(a.actualSalePrice);
        acqPrice =
          stdAcq > 0 && stdTransfer > 0 && sale > 0
            ? calculateEstimatedAcquisitionPrice(sale, stdAcq, stdTransfer)
            : 0;
      }
      if (acqPrice === 0 && !result && a.useEstimatedAcquisition) acqPending = true;
    } else if (acqPrice === 0 && !result && a.useEstimatedAcquisition) {
      // 멀티 환산 — 프리뷰 미지원
      acqPending = true;
    }

    // ── 필요경비 ──
    const expBase = directExpenseRaw(a);
    let expense = fractional ? Math.floor(expBase * ratio) : expBase;
    let expensePending = false;
    if (bundledMatch) {
      expense = bundledMatch.allocatedExpenses;
    } else if (expense === 0 && isSingle) {
      if (singleResult) {
        expense = singleResult.expenses ?? 0;
      } else if (canPreviewEstimated) {
        const stdAcq = parseRaw(a.standardPriceAtAcq);
        const stdTransfer = parseRaw(a.standardPriceAtTransfer);
        const sale = parseRaw(a.actualSalePrice);
        const est =
          stdAcq > 0 && stdTransfer > 0 && sale > 0
            ? calculateEstimatedAcquisitionPrice(sale, stdAcq, stdTransfer)
            : 0;
        expense = est > 0 ? applyRate(stdAcq, 0.03) : 0;
      }
      if (
        expense === 0 &&
        !result &&
        (a.useEstimatedAcquisition || a.isAppraisalAcquisition)
      ) {
        expensePending = true;
      }
    } else if (
      expense === 0 &&
      !result &&
      (a.useEstimatedAcquisition || a.isAppraisalAcquisition)
    ) {
      expensePending = true;
    }

    return {
      assetId: a.assetId,
      index: i + 1,
      assetLabel: a.assetLabel,
      assetKind: a.assetKind,
      salePrice,
      acqPrice,
      expense,
      reductionTypes: (a.reductions ?? []).map((r) => r.type),
      salePending,
      acqPending,
      expensePending,
      saleIsApportioned,
      ownershipRatio: ratio,
    };
  });

  const totalSalePrice = rows.reduce((acc, r) => acc + r.salePrice, 0);
  return { rows, totalSalePrice };
}
