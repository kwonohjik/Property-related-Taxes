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

  /**
   * **§97의2②3호 비교 결과 강제** — 다건 엔진이 「신고단위 결정세액」으로 비교하기 위한 채널.
   *
   * - `undefined`: 단건 엔진이 **스스로** ②3호를 판정한다(자산 1건 신고의 정본 동작).
   * - `"A"`/`"B"`: **Step 6의 세액 비교만** 이 값으로 대체한다. ②1호(수용)·②2호(1세대1주택)·
   *   ③ 기간초과·관계 부적격 등 **앞선 배제는 그대로 우선**한다(`finishScenarios`의 조기 반환).
   *
   * ## 왜 input이 아니라 options인가
   *
   * 이것은 **엔진 내부 제어값**이지 납세자가 신고하는 사실이 아니다. `TransferTaxInput`에 두면
   * 14 동기화 지점(⑫Zod·⑬body·⑭Route)을 타야 하고, 그 순간 **API로 채택 시나리오를 강제할 수
   * 있게 된다** — ②3호는 법이 정한 자동 비교라 사용자가 고를 수 있어서는 안 된다.
   *
   * @see lib/tax-engine/transfer-tax-aggregate-carryover-scope.ts (유일한 지정자)
   * @see docs/00-pm/transfer-n1-carryover-filing-unit.plan.md
   */
  carryoverScenarioOverride?: "A" | "B";
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
 * 감정가액 정책:
 *   acquisitionOverride 있을 때 acquisitionMethod="appraisal" 이면
 *   → acquisitionMethod="purchase" 로 재바인딩 (appraisalValue 경로 우회)
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
    // 감정가액·매매사례가액 모드 우회: 두 추계 경로 모두 실가로 강제.
    // 2026-07-29 정정(#591 감사 R7 — **세액 변경**): 종전에는 `appraisal`만 무력화하고
    //   동일 성격의 추계인 **매매사례가액(`salesCase`)은 그대로 뒀다**.
    //   `calcTransferGain`의 salesCase 분기가 `similarSalesValue ?? acquisitionPrice`를 쓰므로
    //   override로 강제한 취득가액이 **완전히 우회**됐다(양도가 7억·override 3억에서
    //   양도차익 400,000,000 → 300,000,000).
    //   override(§97의2④ 가업상속 의제취득가액 등)는 §176의2③ 추계보다 우선 강제돼야 하고,
    //   이 함수의 JSDoc 계약도 "STEP 2 결정 결과 무시하고 본 값 강제"다.
    acquisitionMethod:
      input.acquisitionMethod === "appraisal" || input.acquisitionMethod === "salesCase"
        ? "actual"
        : input.acquisitionMethod,
    // 매매사례가액 경로 차단 — acquisitionMethod만 바꾸면 값이 남아 재진입 여지가 생긴다.
    similarSalesValue: undefined,
    // 환산 모드에서 개산공제를 expenses로 적용하던 legacy 경로도 차단
    // (STEP 0.35 commercial building에서 cbStep이 override 적용 후 skip됨)
    appraisalValue: undefined,
    capitalExpenditure: input.capitalExpenditure,
    transferExpense: input.transferExpense,
  };
}
