/**
 * 일반건물 ⑧ — **양도 축 검증** (양도시 감정평가가액 · 구분양도 §100②)
 *
 * `transfer-tax-validate-gb.ts`에서 분리(2026-08-13, 800줄 정책). 로직 변경 없이 순수 추출.
 *
 * 이 두 검증은 `validateGeneralBuildingAsset`의 **마지막 관문**이고, 취득·보유 축의 앞선
 * 검증들과 달리 **양도 사실**만 본다 — 그것이 분리 이음매다.
 */

import { parseAmount } from "@/components/calc/inputs/CurrencyInput";
import type { AssetForm } from "@/lib/stores/calc-wizard-store";

/**
 * @param isBurdenedGiftGB 부담부증여 판정 — 호출부가 이미 도출한 값을 받는다.
 *   여기서 재기술하면 레거시 `acquisitionCause` fallback 조건이 갈릴 수 있다
 *   (`feedback_shared_predicate_argument_parity`).
 */
export function validateGbSaleAxis(
  asset: AssetForm,
  label: string,
  isBurdenedGiftGB: boolean,
): string | null {
  // ── 양도시 감정평가가액 — 3필드 all-or-nothing (부가령 §64①1호 단서) ────────────
  // ⚠️ 구분양도 블록 **밖**이다 — 감정가액은 일괄양도의 안분 basis이기도 하다. 안으로 넣으면
  //    일괄양도에서 불완전 입력이 그대로 통과해 조용히 기준시가로 후퇴한다.
  //    (split V8과 같은 규칙 — `transfer-tax-validate-split.ts`)
  const landApp = parseAmount(asset.landAppraisalAtTransfer) || 0;
  const buildingApp = parseAmount(asset.buildingAppraisalAtTransfer) || 0;
  const anyAppraisal = landApp > 0 || buildingApp > 0;
  /**
   * 🔴 **감정일자는 요구하지 않는다**(2026-08-06 · Q-9 확정 — 계획서 §21). 시기 요건 판정을
   * 폐지했으므로 일자는 선택 입력이다. 「양쪽 모두」는 비율 산출의 **산술적 필요조건**이라 유지한다.
   */
  if (anyAppraisal && (landApp <= 0 || buildingApp <= 0)) {
    return `${label}: 양도시 감정평가가액은 토지·건물 양쪽 모두 필요합니다 — 한쪽만 입력하면 그 파트를 평가하지 않은 것으로 보아 기준시가 비율로 안분합니다 (부가가치세법 시행령 §64①1호 단서).`;
  }

  // ── 구분양도(§100②) — Phase 2 ────────────────────────────────────────────────
  // 게이트는 API 전송(`transfer-tax-api-gb.ts` `saleSplitFields`)과 **같은 축**이다.
  // 여기서 조건을 재기술하면 「전송되는데 차단 안 함」 또는 그 반대가 된다.
  if (asset.saleSplitMode === "actual") {
    const landIn = parseAmount(asset.landTransferPrice) || 0;
    const buildingIn = parseAmount(asset.buildingTransferPrice) || 0;

    /**
     * ✅ **증축 조합 차단은 Q-4 확정으로 해제됐다**(2026-08-06) — 건물 구분값을 본체·증축에
     * **양도 당시 기준시가 비율**로 나눈다(그 외의 방법이 없다는 것이 사용자 확정 사항).
     *
     * ⚠️ 다만 **감정평가가액과는 함께 쓸 수 없다** — 감정은 토지·건물 2필드뿐이라 건물을 다시
     *    본체·증축으로 나눌 근거가 없다. 조용히 무시하면 사용자는 감정가액이 반영된 줄 안다.
     */
    if (asset.gbHasExtension && anyAppraisal) {
      return `${label}: 증축이 있는 건물에서는 감정평가가액으로 안분할 수 없습니다 — 감정평가가액은 토지·건물 두 값뿐이라 건물분을 본체와 증축분으로 다시 나눌 근거가 없습니다. 양도시 기준시가 비율로 안분됩니다.`;
    }

    // S-11 — 부담부증여는 §159가 채무비율로 자동 산정하므로 구분 기재가 성립하지 않는다.
    if (isBurdenedGiftGB && (landIn > 0 || buildingIn > 0)) {
      return `${label}: 부담부증여는 양도가액을 인수 채무액 기준으로 자동 산정하므로 토지·건물 구분 기재를 쓸 수 없습니다 (소득세법 시행령 §159).`;
    }

    /**
     * ⚠️ **합계(= 총 양도가액) 검증은 여기서 하지 않는다** — 이 함수는 자산 하나만 받는데,
     *    단건 일반건물의 총 양도가액은 **폼-전역 `contractTotalPrice`**에서 온다
     *    (`transfer-tax-api.ts:232-238` — `asset.actualSalePrice`가 아니다).
     *    자산 필드로 검증하면 **엉뚱한 값과 비교**하게 되므로 총액을 확실히 아는
     *    엔진(`allocateBundledTransferPrice`)이 담당한다.
     */

    // R-5 — §166⑧ 예외는 30% 의제를 면제해 **세액을 바꾼다**. 근거 없이 켤 수 있으면
    // 가드를 무력화하는 스위치가 된다(split V9와 같은 규칙).
    if (asset.saleSplitExemption && !asset.saleSplitExemptionNote?.trim()) {
      return `${label}: 「소득세법 시행령」 제166조 제8항 예외를 선택했으면 그 근거를 입력하세요 — 구분 기재한 가액을 그대로 인정받는 사유이므로 신고서에 기재해야 합니다.`;
    }
  }

  return null;
}
