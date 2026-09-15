/**
 * **추계 취득가액의 개산공제 base 게이트** — ⑤·⑧이 공유하는 leaf.
 *
 * 계획서: docs/00-pm/transfer-appraisal-salescase-lump-sum-deduction.plan.md §7.5
 *
 * `transfer-tax-validate-acquisition.ts`가 800줄 정책의 위험구간(≥750)에 들어가지 않도록
 * 분리했다. 술어를 한 곳에 두는 편익이 더 크다 — 호출부가 늘어도 경계가 갈라지지 않는다.
 */
import type { AssetForm } from "@/lib/stores/calc-wizard-store";
import { phdToggleReachable } from "./phd-toggle-scope";
import { isSeparateAcquisition } from "./transfer-tax-split-acq-mode";
import { hasPre1990LandEstimation } from "./transfer-pre1990-land-gate";

/**
 * PHD(§164⑤ 개별주택가격 미공시 환산) 게이트 — ⑤ 토글 렌더 조건과 **같은 술어**.
 *
 * 자산 종류를 바꾸면 토글이 사라진 채 플래그만 남아 「화면에 없는 11칸」을 요구하던 문제를
 * `phdToggleReachable`이 막는다. 두 호출부(PHD 11필드 · 추계 개산공제 base)가 같은 값을 보도록
 * 한 곳에 둔다 — 각자 재기술하면 같은 자산이 한쪽에서만 면제되는 dual-truth가 된다.
 */
export function usesPhdGate(asset: AssetForm, isNonPrimaryAsset: boolean): boolean {
  return asset.usePreHousingDisclosure === true && !isNonPrimaryAsset && phdToggleReachable(asset);
}

/**
 * 추계(감정가액·매매사례가액) 모드에서 **취득시 기준시가(개산공제 base)를 요구하는가**.
 *
 * 「소득세법」 제97조 제2항 제2호 본문이 제1항제1호 나목의 금액에 개산공제(시행령 §163⑥)를
 * **더하도록 정하므로**, 미입력을 0으로 두면 납세자에게 **불리한** 방향으로 조용히 과대과세된다
 * (등기 3% / 미등기 3/1000 / §163⑥4호 1%). 사용자 확정 2026-09-15 — 계획서 Q-1.
 *
 * 분리(split) 축은 `requiresAcqStdPricePart`가 `mode !== "actual"`로 **이미 같은 규칙**을 적용하고
 * 있었다(그 1절의 근거가 「② 개산공제 base」다). 비-분리 단일 자산 경로만 규칙 밖이었다.
 *
 * ## 되돌린 과거 결정
 * `aa810766`(2026-06-15 RTMS 매매사례가액 자동조회 확대)이 「아예 검증 차단보다는 사용자 확인
 * 유도 힌트만 제공 (추계는 기준시가 불확실 케이스가 많음)」이라는 주석과 함께 차단을 두지 않았다.
 * 그러나 개별공시지가·주택공시가격은 공시자료라 「불확실」 전제가 성립하지 않고, 그 결과가
 * 과대과세 방향이라 뒤집는다.
 *
 * ## ⚠️ 경계는 ⑤가 입력칸을 렌더하는 범위다
 * 넓히면 **화면에 없는 칸을 채우라고 막는** dead-end가 된다(같은 파일 하단 `fixedAcquisitionPrice`
 * 요구가 `isSeparateAcquisition`으로 면제되는 것과 같은 규칙).
 *   - 별개 취득 → 파트별 필수를 `validateSplitDirectInputs`가 담당한다(이중 차단 금지)
 *   - pre1990 토지등급 환산 · PHD → ④가 `standardPriceAtAcquisition`을 **undefined로 보내는**
 *     경로다(`transfer-tax-api.ts:323`). 쓰이지 않는 값을 요구하는 것은 거짓 요구다
 *   - 일반건물·재개발·입주권·겸용주택은 이 함수에 **도달하지 않는다**(각 early return)
 */
export function lumpSumBaseRequired(asset: AssetForm, isNonPrimaryAsset: boolean): boolean {
  if (isSeparateAcquisition(asset)) return false;
  if (hasPre1990LandEstimation(asset)) return false;
  if (usesPhdGate(asset, isNonPrimaryAsset)) return false;
  return true;
}
