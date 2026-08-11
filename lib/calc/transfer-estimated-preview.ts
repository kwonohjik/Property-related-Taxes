/**
 * 일반건물·상가 **환산취득가액 계산 전 프리뷰** — 사이드바 표시용.
 *
 * ## 왜 별도 모듈인가
 *
 * 공통 §176의2② 환산(양도가액 × 취득시 기준시가 ÷ 양도시 기준시가)은 자산 종류를 가리지 않아
 * 사이드바가 한 줄로 미리 계산할 수 있다(`transfer-per-asset-summary.ts` `canPreviewEstimated`).
 * 그러나 두 자산 종류는 **전용 산식**을 쓴다:
 *
 *   · 일반건물(`general_building`) — 토지·건물(·증축) 파트별 환산 + §104의3 비사업용 분할 +
 *     §97②2호 swap 판정 (`general-building-valuation.ts`)
 *   · 상가·오피스텔(`commercial_building`) — §164⑥ 최초고시 역환산 / §164⑧ 기준시가 조정
 *     (`commercial-building-valuation.ts`)
 *
 * 공통 식으로 미리 계산하면 **실제 세액과 다른 값**을 보여주게 된다. 그래서 종전에는 두 종류를
 * 프리뷰에서 제외하고 «계산 후 표시»로 두었다.
 *
 * ## 재구현하지 않는다
 *
 * 이 모듈은 산식을 **한 줄도 다시 쓰지 않는다**. 폼 → payload 변환도, 환산 계산도 route가 쓰는
 * 것과 **같은 함수**를 부른다. UI가 자기 산식을 세우는 순간 표시값과 계산값이 갈린다
 * (memory `feedback_ui_engine_dual_truth_avoidance`).
 *
 * | 단계 | 재사용 함수 | 정본 위치 |
 * |---|---|---|
 * | 폼 → payload | `buildCommercialBuildingValuation` / `buildGeneralBuildingValuation` | `lib/calc/` (API 변환과 동일) |
 * | payload → 엔진 input | `coerceGeneralBuildingPayload` | route가 쓰는 그 함수 |
 * | 환산 계산 | `applyCommercialBuildingStep` / `buildEstimatedGeneralBuildingCards` | 엔진 |
 *
 * 세율(`TaxRatesMap`)이 필요한 지점은 **aggregate 이후**(세율·감면·누진)라, 취득가액·필요경비만
 * 뽑는 여기까지는 세율 없이 순수하게 돈다 — 그래서 클라이언트에서 계산할 수 있다.
 *
 * ## 프리뷰가 나오지 않는 경우
 *
 * 입력이 덜 찼으면(`build*Valuation`이 `undefined`) `null`을 돌려 «계산 후 표시»를 유지한다 —
 * 부분 입력으로 만든 반쪽 값을 보여주지 않는다.
 */

import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";
import type { TransferTaxInput } from "@/lib/tax-engine/types/transfer.types";
import { buildCommercialBuildingValuation } from "@/lib/calc/transfer-tax-api-helpers";
import { buildGeneralBuildingValuation } from "@/lib/calc/transfer-tax-api-gb";
import { applyCommercialBuildingStep } from "@/lib/tax-engine/transfer-tax-commercial-step";
import {
  coerceGeneralBuildingPayload,
  buildEstimatedGeneralBuildingCards,
  type GeneralBuildingValuationPayload,
} from "@/lib/tax-engine/general-building-entry";

/** 프리뷰 산출 — 계산 후 사이드바가 결과에서 읽는 값과 같은 의미의 두 항목. */
export interface EstimatedPreview {
  /** 취득가액 (§97②2호 swap이 나목을 택하면 0 — 엔진과 동일) */
  acqPrice: number;
  /** 필요경비 (개산공제 §163⑥ 또는 swap 시 실제 경비) */
  expense: number;
}

function parseRaw(v: string | undefined): number {
  return parseInt((v ?? "").replace(/[^0-9]/g, "") || "0", 10);
}

/** `YYYY-MM-DD` → Date. 빈 값·파싱 실패는 null (프리뷰 포기). */
function toDateOrNull(v: string | undefined): Date | null {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * 상가·오피스텔 환산 프리뷰 (§164⑥·§164⑧).
 *
 * `applyCommercialBuildingStep`은 엔진이 STEP 0.35에서 부르는 바로 그 함수다 — 환산취득가액과
 * 개산공제를 산출한 뒤 **§97②2호 swap까지 판정**해 `effectiveInput`에 확정값을 싣는다.
 * 그 확정값을 그대로 읽으므로 swap 발동 여부가 자동으로 반영된다.
 *
 * ⚠️ 상속 취득은 환산이 아니라 상속개시일 평가액이 취득가액이다(§163⑨) — 그 경로는
 *    `applyCommercialBuildingStep`이 `cbStep: undefined`로 건너뛰므로 여기서도 `null`이다
 *    (사이드바의 상속 fallback 체인이 담당한다).
 */
export function previewCommercialBuildingEstimated(
  asset: AssetForm,
  form: TransferFormData,
): EstimatedPreview | null {
  if (asset.assetKind !== "commercial_building" || !asset.useEstimatedAcquisition) return null;

  const cbv = buildCommercialBuildingValuation(asset, form.transferDate);
  if (!cbv) return null; // 입력 미완 — «계산 후 표시» 유지

  const transferPrice = parseRaw(asset.actualSalePrice) || parseRaw(form.contractTotalPrice);
  const transferDate = toDateOrNull(form.transferDate);
  const acquisitionDate = toDateOrNull(asset.acquisitionDate);
  if (!transferPrice || !transferDate || !acquisitionDate) return null;

  // 엔진 input 중 CB STEP이 읽는 필드만 채운다 — 나머지는 이 단계에서 소비되지 않는다.
  // (`runCommercialBuildingStep`은 propertyType·useEstimatedAcquisition·commercialBuildingValuation·
  //  transferPrice·transferCause·isUnregistered 계열만 본다. swap 판정은 capitalExpenditure·transferExpense.)
  //
  // ⚠️ **읽는 필드가 늘면 여기도 함께 늘려야 한다.** 이 객체는 화이트리스트라 빠뜨려도 타입이
  //    잡아주지 않고, 프리뷰만 조용히 다른 값을 낸다(계산 전 ≠ 계산 후).
  const input = {
    propertyType: "commercial_building",
    transferPrice,
    transferDate,
    acquisitionDate,
    acquisitionPrice: 0,
    expenses: 0,
    capitalExpenditure: parseRaw(asset.capitalExpenditure) || undefined,
    transferExpense: parseRaw(asset.transferExpense) || undefined,
    useEstimatedAcquisition: true,
    acquisitionCause: asset.acquisitionCause || undefined,
    // §104③ 미등기 → 개산공제율 0.3%(§163⑥1호 단서). 폼-전역 값이 그대로 엔진에 가므로
    // 프리뷰도 같은 값을 봐야 한다 — 빠뜨리면 사이드바 3% vs 결과 0.3%로 10배 어긋난다.
    isUnregistered: form.isUnregistered,
    commercialBuildingValuation: cbv,
  } as unknown as TransferTaxInput;

  const { effectiveInput, cbStep } = applyCommercialBuildingStep(input);
  if (!cbStep) return null; // 상속 등 — 환산 경로 미진입

  return { acqPrice: effectiveInput.acquisitionPrice, expense: effectiveInput.expenses };
}

/**
 * 일반건물(토지+건물 일괄) 환산 프리뷰 (§176의2② · §163⑥ · §104의3).
 *
 * `buildEstimatedGeneralBuildingCards`는 route가 aggregate **직전**에 부르는 함수다 — 토지·건물
 * (·증축) 카드와 §97②2호 swap 판정이 이미 끝난 상태를 준다. 카드의 취득가액·필요경비를 합하면
 * 그 자산의 값이 되고, 이는 계산 후 사이드바가 `apportioned` 카드 합계로 읽는 값과 같은 것이다.
 *
 * swap이 발동한 카드는 환산취득가액을 차감하지 않으므로(`allocatedAcquisitionPrice: 0` —
 * `general-building-route-cards.ts:204`) 같은 규칙을 여기서도 적용한다.
 */
export function previewGeneralBuildingEstimated(
  asset: AssetForm,
  form: TransferFormData,
): EstimatedPreview | null {
  if (asset.assetKind !== "general_building" || !asset.useEstimatedAcquisition) return null;

  const raw = buildGeneralBuildingValuation(asset, form.transferDate);
  if (!raw) return null; // 입력 미완 — «계산 후 표시» 유지

  const totalTransferPrice = parseRaw(asset.actualSalePrice) || parseRaw(form.contractTotalPrice);
  const transferDate = toDateOrNull(form.transferDate);
  const acquisitionDate = toDateOrNull(asset.acquisitionDate);
  if (!totalTransferPrice || !transferDate || !acquisitionDate) return null;

  // route와 같은 Date 변환(`toOptionalDate`) — 미변환 문자열이 엔진에 닿으면
  // `monthsBetween`에서 TypeError가 난다(route-helper:179-181).
  const coerced = coerceGeneralBuildingPayload(raw as Record<string, unknown>);

  const payload = {
    ...coerced,
    totalTransferPrice,
    transferDate,
    acquisitionDate,
  } as unknown as GeneralBuildingValuationPayload;

  let gbOut: ReturnType<typeof buildEstimatedGeneralBuildingCards>["gbOut"];
  let swap: ReturnType<typeof buildEstimatedGeneralBuildingCards>["swap"];
  try {
    ({ gbOut, swap } = buildEstimatedGeneralBuildingCards(payload));
  } catch {
    // 입력 조합이 엔진 가드에 걸리는 단계 — 아직 프리뷰할 수 없다(«계산 후 표시» 유지).
    return null;
  }

  /**
   * 카드 → 자산 합계. **`buildApportionment`(`general-building-route-cards.ts:200-206`)와
   * 같은 규칙**이다 — 계산 후 사이드바가 읽는 `apportioned` 값이 그 함수에서 나오므로,
   * 여기서 규칙이 어긋나면 「계산 전 ≠ 계산 후」가 되어 프리뷰가 거짓말이 된다.
   *
   *   · swap 카드(§97②2호 나목 채택): 환산취득가액 미차감(0) · 필요경비 = 배분된 나목
   *   · 그 외: 환산취득가액 · 필요경비 = 개산공제 + 실가 파트 가산분(§97②1호)
   */
  let acqPrice = 0;
  let expense = 0;
  for (const card of gbOut.assetCards) {
    const swapNabok = swap?.allocation.get(card.propertyId);
    const isSwapCard = swapNabok !== undefined;
    const directAddition = swap?.addition.get(card.propertyId) ?? 0;
    acqPrice += isSwapCard ? 0 : card.acquisitionPrice;
    expense += isSwapCard ? swapNabok : card.expenses + directAddition;
  }
  return { acqPrice, expense };
}
