/**
 * 건물 기준시가 **N시점 일괄 계산(배치) 사용 가능 여부** 판정 — 단일 소스
 *
 * 계획서: docs/02-design/features/building-std-price-modal-multipoint.plan.md §4.2
 *
 * ## 왜 단일 소스인가
 *
 * 배치 모달(`computePhdThreePointStdPrice` 기반)은 범용 폼 모달이 지원하는 계산 경로 중
 * 일부를 지원하지 않는다. 그 조건을 호출부마다 다시 쓰면 UI·anchor·폴백 노출이 서로 어긋난다
 * (dual-truth). 판정은 이 파일 한 곳에서만 한다.
 *
 * ## ⚠️ 사전 판정 가능 조건과 불가능 조건은 다르다
 *
 * **사전 판정 가능**(호출부가 자산 폼에서 아는 정보) — 이 게이트가 다룬다:
 *   1. 취득연도 == 양도연도 → 「소득세법 시행령」 제164조 제8항 동일연도 환산.
 *      배치는 `transferYear = 2001` 고정으로 이 경로를 **회피**한다(`phd-building-std-batch.ts:161~162`).
 *   2. 양도연도 ≤ 2000 → 배치가 `unsupported`로 기록(`phd-building-std-batch.ts:225~227`).
 *   3. 상속·증여 평가 맥락 → 배치 입력에 조정률·특성(`specialFeatures`)이 없다.
 *
 * **사전 판정 불가**(모달을 연 뒤에야 드러남) — 이 게이트가 다루지 **않는다**:
 *   · 기계식주차전용빌딩 (`BuildingStdPriceFormState.isMechanicalParking` — 모달 내부 state)
 *   · 공동주택 고시 전 취득 환산 (`apartmentConversionMode` — 동상)
 *   `AssetForm`에 대응 필드가 없어(실측) 런처를 그리는 시점에는 알 수 없다.
 *   ⇒ 이 두 경로를 쓰는 사용자를 위해 **종전 1시점 런처를 보조로 상시 유지**한다.
 *      게이트 false만으로 폴백을 결정하면 그 사용자는 입력 경로를 잃는다(dead-end —
 *      memory `feedback_ui_gate_removes_sole_input_path`).
 */

import { BUILDING_STD_FIRST_YEAR } from "./phd-building-std-batch";

/** 배치를 쓸 수 없는 사유 — UI 폴백 안내 문구의 키. */
export type MultiPointBlockReason =
  | "tax_type_unsupported"
  | "same_year_164_8"
  | "transfer_year_pre_2001";

export interface MultiPointGateInput {
  /** 취득연도. 미상(undefined)이면 배치가 그 시점만 제외하므로 차단 사유가 아니다. */
  acquisitionYear?: number;
  /** 양도연도. 미상이면 동상. */
  transferYear?: number;
  /** 호출 맥락 세목. 미지정 = "transfer". */
  taxType?: "transfer" | "inheritance_gift";
}

/**
 * 차단 사유(첫 1건) 또는 `null`(배치 가능).
 * 여러 조건이 겹칠 때의 순서는 **결정적**이다 — 세목 → 동일연도 → 양도 ≤2000.
 */
export function multiPointBlockReason(
  input: MultiPointGateInput,
): MultiPointBlockReason | null {
  const { acquisitionYear, transferYear, taxType = "transfer" } = input;

  if (taxType !== "transfer") return "tax_type_unsupported";

  // §164⑧ — 두 연도를 **모두 알 때만** 판정한다(한쪽 미상이면 동일연도가 아님이 확정되지 않지만,
  // 배치는 미상 시점을 제외하고 계산하므로 차단할 근거도 없다).
  if (
    acquisitionYear !== undefined &&
    transferYear !== undefined &&
    acquisitionYear === transferYear
  ) {
    return "same_year_164_8";
  }

  if (transferYear !== undefined && transferYear < BUILDING_STD_FIRST_YEAR) {
    return "transfer_year_pre_2001";
  }

  return null;
}

/** 배치 런처를 노출해도 되는가. */
export function canUseMultiPointStdPrice(input: MultiPointGateInput): boolean {
  return multiPointBlockReason(input) === null;
}

/** 폴백 안내 문구 — 종전 1시점 런처만 노출할 때 사유를 사용자에게 설명한다. */
export const MULTI_POINT_BLOCK_MESSAGE: Record<MultiPointBlockReason, string> = {
  tax_type_unsupported:
    "상속·증여 평가는 조정률 산정이 필요해 일괄 계산을 지원하지 않습니다 — 시점별 계산기를 사용하세요.",
  same_year_164_8:
    "취득연도와 양도연도가 같아 양도당시 기준시가를 「소득세법 시행령」 제164조 제8항으로 환산해야 합니다 — 일괄 계산 대신 시점별 계산기를 사용하세요.",
  transfer_year_pre_2001:
    "양도연도가 국세청 건물 기준시가 고시(2001년~) 이전이라 일괄 계산을 지원하지 않습니다 — 시점별 계산기를 사용하세요.",
};
