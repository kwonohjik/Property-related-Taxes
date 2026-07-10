/**
 * calculateTransferTax 취득가액 매개변수화 — STEP 0.46 헬퍼
 *
 * 목적: 가업상속공제 §97의2④ 의제 취득가액 등 외부에서 취득가액을 강제(override)해야 하는
 *       케이스를 지원하기 위한 순수 함수 헬퍼.
 *
 * 정책:
 *   - [[feedback_no_silent_apportion_fallback]]: override=undefined 시 기존 input 그대로 (fallback 없음)
 *   - [[single-source-engine-helper]]: resolveAcquisitionOverride 단일 진입점
 *   - [[file-size-policy]]: transfer-tax.ts (800줄) 800줄 초과 방지를 위해 sibling 파일로 격리
 */

import type { TransferTaxInput } from "./types/transfer.types";

// ============================================================
// 공개 타입
// ============================================================

/**
 * calculateTransferTax 3번째 인자 — 취득가액 override 옵션.
 *
 * undefined: 기존 동작 유지 (input 그대로 사용) — 회귀 0건 보장.
 */
export interface TransferTaxAcquisitionOptions {
  /**
   * 단건 양도 시 취득가액 강제 (override).
   * - undefined: 기존 동작 (input.acquisitionPrice 그대로) — 회귀 0건 보장
   * - number: STEP 2 결정 결과 무시하고 본 값 강제
   *
   * 환산취득가 모드 (useEstimatedAcquisition=true) 에서 override 설정 시:
   *   환산 계산 우회 + override 값 직접 사용.
   *   의제 취득가액과 환산취득가 동시 적용 차단.
   */
  acquisitionOverride?: number;

  /**
   * 다자산 모드 — 자산 ID별 취득가액 강제.
   * key: ParcelInput.id
   * value: 해당 자산 취득가액 override
   * key가 없는 자산: 기존 acquisitionPrice 그대로 (명시 override만 적용)
   */
  acquisitionOverridesByAssetId?: Record<string, number>;
}

// ============================================================
// STEP 0.46 헬퍼: resolveAcquisitionOverride
// ============================================================

/**
 * STEP 0.46 취득가액 override 적용.
 *
 * 우선순위:
 *   1. options.acquisitionOverride (명시적 override)
 *   2. 기존 input 결정 로직 그대로 (override 없으면 변경 없음)
 *
 * 환산 우회 정책:
 *   acquisitionOverride 있을 때 useEstimatedAcquisition=true 이면
 *   → useEstimatedAcquisition=false 로 재바인딩 (calcTransferGain 환산 경로 우회)
 *   → acquisitionPrice=acquisitionOverride 로 강제
 *
 * 감정가액·매매사례가액 정책:
 *   acquisitionOverride 있을 때 acquisitionMethod="appraisal" 또는 "salesCase" 이면
 *   → acquisitionMethod="actual" 로 재바인딩 (appraisalValue·similarSalesValue 추계 경로 우회)
 *   → acquisitionPrice=acquisitionOverride 로 강제
 *
 * @param input 현재 처리 중인 TransferTaxInput (STEP 0.45 상속 의제 완료 후)
 * @param options 호출자가 전달한 override 옵션
 * @returns override 적용 후 TransferTaxInput (불변 스프레드). override 없으면 input 그대로.
 */
export function resolveAcquisitionOverride(
  input: TransferTaxInput,
  options: TransferTaxAcquisitionOptions | undefined,
): TransferTaxInput {
  // override 없음 → 기존 동작 그대로 (회귀 0건 보장)
  if (options === undefined || options.acquisitionOverride === undefined) {
    return input;
  }

  const { acquisitionOverride } = options;

  // override 적용 — 환산·감정가액 모드도 실가 경로로 전환
  return {
    ...input,
    acquisitionPrice: acquisitionOverride,
    // 환산취득가 모드 우회: override 시 실가 경로로 강제 (의제·환산 동시 적용 차단)
    useEstimatedAcquisition: false,
    // 감정가액·매매사례가액 모드 우회: appraisalValue·similarSalesValue 추계 경로 차단
    acquisitionMethod:
      input.acquisitionMethod === "appraisal" || input.acquisitionMethod === "salesCase"
        ? "actual"
        : input.acquisitionMethod,
    // 환산 모드에서 개산공제를 expenses로 적용하던 legacy 경로도 차단
    // (STEP 0.35 commercial building에서 cbStep이 override 적용 후 skip됨)
    appraisalValue: undefined,
    // 매매사례가액(§176의2③1호) 추계 경로 차단 — override.acquisitionPrice가 우선
    similarSalesValue: undefined,
    capitalExpenditure: input.capitalExpenditure,
    transferExpense: input.transferExpense,
  };
}
