/**
 * 비주택 → 주택 용도변경 (「소득세법」 §95⑤·⑥ · 시행령 §154⑤ 단서) 자산 검증
 *
 * `transfer-tax-validate-asset.ts`에서 분리 (800줄 정책, 2026-08-05 Phase F).
 * 형제: `transfer-tax-validate-mixed-use-asset.ts`(겸용주택) · `-bg.ts`(부담부증여).
 *
 * 계획서 케이스: C-8·C-9·C-14·C-16·C-18~C-21·C-24
 * (C-26 비-primary 자산은 validation이 아니라 **UI 미노출**로 처리한다.)
 */

import type { AssetForm } from "@/lib/stores/calc-wizard-store";

/**
 * 비주택 → 주택 용도변경 (「소득세법」 §95⑤·⑥ · 시행령 §154⑤ 단서) 전용 검증.
 *
 * 토글이 켜졌지만 계산할 수 없거나, 지원하지 않는 조합이면 차단한다.
 * 술어는 `isUsageConversionActive`(단일 소스) — UI·API 변환과 같은 판단을 쓴다.
 */
export function validateUsageConversion(
  asset: AssetForm,
  label: string,
  formTransferDate?: string,
): string | null {
  if (asset.hasNonHousingConversion !== true) return null;

  /** 지원하지 않는 조합의 공통 안내 — 사유 1줄 + 대안 */
  const unsupported = (reason: string) =>
    `${label}: ${reason} 이 조합은 현재 지원하지 않습니다 — 「비주택 → 주택 용도변경」 토글을 끄면 종전 방식으로 계산됩니다.`;

  // C-16 — 날짜가 없으면 기간을 나눌 수 없다.
  const start = asset.residentialUseStartDate ?? "";
  if (!start) {
    return `${label}: 사실상 주거용 사용 개시일을 입력하세요. (「소득세법」 제95조 제6항)`;
  }

  // C-8·C-9 — 취득일·양도일 사이여야 한다. 엔진도 같은 조건에서 오류를 던진다.
  if (asset.acquisitionDate && start <= asset.acquisitionDate) {
    return `${label}: 주거용 사용 개시일은 취득일 이후여야 합니다.`;
  }
  if (formTransferDate && start >= formTransferDate) {
    return `${label}: 주거용 사용 개시일은 양도일 이전이어야 합니다.`;
  }

  // C-14 — 건물 전부가 주택이 된 경우와 일부만 주택인 경우는 다른 규정이다.
  if (asset.isMixedUseHouse === true) {
    return unsupported(
      "겸용주택과 함께 사용할 수 없습니다 — 일부만 주택이 된 경우는 「겸용주택」의 보유 중 용도변경을 쓰세요.",
    );
  }

  // C-19 — 토지·건물 분리취득은 파트별 공제율을 따로 내므로 §95⑤ 혼합과 병용할 수 없다.
  if (asset.hasSeperateLandAcquisitionDate === true) {
    return unsupported("토지·건물을 서로 다른 시점에 취득한 자산입니다.");
  }

  // C-24 — 부담부증여는 채무 인수분 안분 축이 별도다.
  if (asset.transferType === "burdened_gift") {
    return unsupported("부담부증여 양도입니다.");
  }

  // C-21 — §154⑧3호 상속 통산·§97의2 이월과세와의 우선순위에 명문이 없다.
  if (
    asset.acquisitionCause === "inheritance" ||
    asset.acquisitionCause === "gift" ||
    asset.acquisitionCause === "carryover_gift"
  ) {
    return unsupported("상속·증여로 취득한 자산입니다.");
  }

  // C-18·C-20 — 장기임대(§97의3·§97의4)는 장특 특례율이, §98의2는 표2 강제가 §95⑤과 충돌한다.
  // ⚠️ 엔진 `rentalReductionDetails`는 폼에 없어 여기서 볼 수 없다 — 폼의 `reductions`로 판별한다.
  const conflicting = asset.reductions?.find(
    (r) => r.type === "rental_97_3" || r.type === "rental_97_4" || r.type === "unsold_98_2",
  );
  if (conflicting) {
    return unsupported("장기임대주택·미분양주택 과세특례가 선택돼 있습니다.");
  }

  return null;
}

