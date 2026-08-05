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
    `${label}: ${reason} 이 조합은 현재 지원하지 않습니다 — 「건물 전체를 주택으로 용도변경」 토글을 끄면 종전 방식으로 계산됩니다.`;

  // C-16 — 날짜가 없으면 기간을 나눌 수 없다.
  const start = asset.residentialUseStartDate ?? "";
  if (!start) {
    return `${label}: 사실상 주거용 사용 개시일을 입력하세요. (「소득세법」 제95조 제6항)`;
  }

  // C-8·C-9 — 취득일·양도일 사이여야 한다. 엔진도 같은 조건에서 오류를 던진다.
  //
  // ⚠️ **이월과세는 하한이 「증여 등기접수일」이다.** 엔진은 시나리오 A(이월과세 적용 —
  //    증여자 취득일 기산)와 B(미적용 — 등기접수일 기산)를 **둘 다** 계산해 세액을 비교하는데
  //    (§97의2②3호), B의 취득일이 항상 더 늦으므로 **B가 가장 엄격한 하한**이다.
  //    전환일이 그 사이에 있으면 A는 통과하고 **B만 기간 분해에 실패해 엔진이 throw**한다.
  //
  //    게다가 이월과세 자산은 `acquisitionDate`가 **비어 있을 수 있다** — 입력 UI가
  //    `carryover` 서브객체만 받고(`CarryoverGiftBlock.tsx`) API 변환이 fallback으로 채운다
  //    (`transfer-tax-api.ts` — `acquisitionDate || carryover.giftRegistryDate`).
  //    fallback 없이 그대로 두면 이 가드가 **통째로 단락**돼 검사 자체가 사라진다
  //    (⑧ 규칙 — API/UI fallback이 있는 필드는 validate도 같은 fallback을 써야 한다).
  const acqFloor =
    asset.acquisitionCause === "carryover_gift"
      ? asset.carryover?.giftRegistryDate || asset.acquisitionDate || ""
      : asset.acquisitionDate;
  if (acqFloor && start <= acqFloor) {
    return asset.acquisitionCause === "carryover_gift"
      ? `${label}: 주거용 사용 개시일은 증여 등기접수일 이후여야 합니다.`
      : `${label}: 주거용 사용 개시일은 취득일 이후여야 합니다.`;
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

  // ⛔ C-21(취득원인 차단)은 **폐지됐다** — 상속·증여·이월과세 셋 다 열려 있다.
  //
  // 종전 근거는 "§154⑧3호 통산·§97의2와의 우선순위에 명문이 없다"였으나, 조문을 읽으니
  // **셋 다 명문이 답을 정하거나 요건이 불성립**한다:
  //
  //   · **상속** — §154⑧3호는 "상속받은 **주택**으로서"가 전제인데, 위 C-8이 용도변경일 >
  //     취득일(=상속개시일)을 강제하므로 토글 ON인 상속은 언제나 「상속개시 당시 비주택」이다
  //     ⇒ 통산 요건 불성립. 거주 통산 배제는 엔진 `resolveExemptionResidenceMonths`가 맡는다.
  //   · **이월과세** — 「소득세법」 §95④ 단서가 **전체 보유기간**의 기산일을(증여자 취득일),
  //     §95⑥이 그중 **주택으로 보유한 기간**의 기산일을(주거용 사용일) 각각 정한다. 충돌이
  //     아니라 분담이며, 비주택 기간은 자연히 「증여자 취득일 ~ 주거용 사용일」이 된다.
  //     §97의2는 제목부터 「필요경비 계산 특례」로 보유기간 문언이 없다. 시나리오 B의 하한은
  //     위 C-8이 막는다.
  //   · **단순 증여** — §95④ 단서는 "제97조의2제1항의 경우"에만 미친다. 수증자 취득일 기산이고
  //     달리 취급하는 문언이 없다.
  //
  // 설계: `docs/02-design/features/non-housing-to-housing-conversion-carryover-c21.plan.md`
  //      (상속분은 `...-inheritance-c21.plan.md`)

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

