/**
 * 승계조합원 조합원입주권 — ⑧ validate
 *
 * 계획서: docs/02-design/features/right-to-move-in-top-acq-axis-removal.plan.md §5 Phase 5
 *
 * ## 왜 §166 validate와 갈라지는가
 *
 * 「소득세법 시행령」 §166①은 「조합원이 **당해 조합에 기존건물과 그 부수토지를 제공하고 취득한**
 * 입주자로 선정된 지위를 양도하는 경우」로 요건을 한정한다 — 승계자는 제공한 사실이 없어 대상이
 * 아니다. 따라서 권리가액·청산금 방향·§166③ 환산 분자/분모를 요구하는 `validateRedevelopmentAsset`을
 * 그대로 태우면 **입력할 수 없는 값을 요구**하게 된다.
 *
 * 실제로 종전에는 그 상태였다(계획서 §2.4(3) 실측):
 *   `validateRedevelopmentAsset:155`가 「인가일은 취득일 이후여야 합니다. … "승계조합원 모드"를
 *   ON 하세요」로 막는데, 그 안내가 가리키는 토글(②-a)은 #1245에서 **입주권 화면에서 제거**됐다.
 *   ⇒ 승계조합원 입주권은 어느 경로로도 계산할 수 없었다.
 *
 * ## 무엇을 요구하나
 *
 * 취득가액은 §97①1호 가목 **실지거래가액**이고, 구성은 국세청 기준-2025-법규재산-0057
 * (법규과-1320, 2025-06-19)이 「종전주택 권리가액 + 취득 이후 납입한 추가분담금 + (입증되는)
 * 프리미엄」으로 밝혔다 ⇒ 승계취득가액 1칸 + 추가분담금 1칸.
 */

import { parseAmount } from "@/components/calc/inputs/CurrencyInput";
import type { AssetForm } from "@/lib/stores/calc-wizard-store";

/**
 * 승계조합원 입주권 자산 검증.
 *
 * 호출 조건은 `isSuccessorRightTransfer(asset) === true` — 호출부(`transfer-tax-validate-asset.ts`)가
 * 같은 술어로 분기한다(`transfer-successor-right.ts` 단일 소스).
 *
 * @returns 차단 사유 문자열, 통과 시 null
 */
export function validateSuccessorRightAsset(asset: AssetForm, label: string): string | null {
  // ── 취득일 ──
  if (!asset.acquisitionDate) {
    return `${label}: 조합원입주권 승계취득일을 입력하세요.`;
  }

  /**
   * 승계는 **관리처분계획 인가 후 취득**이 정의다. 인가일이 취득일보다 뒤라면 그 사람은
   * 조합에 종전 부동산을 제공한 원조합원이다 — 유형 선택이 잘못된 것이므로 지목해 준다.
   * (인가일 미입력은 통과시킨다 — 승계 경로의 계산에는 인가일이 쓰이지 않는다.)
   */
  if (
    asset.redevApprovalDate &&
    new Date(asset.redevApprovalDate) > new Date(asset.acquisitionDate)
  ) {
    return `${label}: 관리처분계획 인가일이 취득일보다 나중입니다. 인가 전에 종전 부동산을 보유하셨다면 ① 기본정보의 「조합원 유형」을 "원조합원"으로 바꾸세요. (시행령 §166①)`;
  }

  // ── 취득가액 (§97①1호 가목) ──
  const acqPrice = parseAmount(asset.successorRightAcqPrice);
  if (acqPrice <= 0) {
    return `${label}: 조합원입주권 승계취득가액을 입력하세요. (소득세법 §97①1호 가목 — 취득에 든 실지거래가액)`;
  }

  /**
   * 추가분담금은 **음수 입력만** 막는다. 미입력("")은 0으로 본다 — 승계 직후 양도라
   * 납입분이 없을 수 있다(자동 안분 fallback이 아니라 「없음」의 정상 표현).
   */
  if (parseAmount(asset.successorRightAddedContribution) < 0) {
    return `${label}: 취득 후 납입한 추가분담금은 0 이상이어야 합니다.`;
  }

  /**
   * 환산·감정·매매사례 추계는 **본 PR 미지원**이다.
   *
   * §166③ 환산은 「제1항 및 제2항을 적용할 때」의 규정이라 승계에는 적용되지 않고, §97①1호
   * 나목(§176의2③ 매매사례·감정·환산)을 쓰려면 조합원입주권의 §99①2호 기준시가(영 §165)가
   * 필요한데 그 산정 경로가 아직 없다. 근거 없이 숫자를 만들지 않는다.
   *
   * ⚠️ 정상 경로에서는 여기 도달하지 않는다 — 상단 축 A는 UI에서 제거됐고, 조합원 유형 토글이
   *    `useEstimatedAcquisition`을 false로 되돌린다. stale 저장값에 대한 마지막 안전망이다.
   */
  if (asset.useEstimatedAcquisition) {
    return `${label}: 승계취득한 조합원입주권은 환산취득가액을 지원하지 않습니다. 승계취득 당시 실지거래가액을 입력하세요. (소득세법 §97①1호 가목)`;
  }

  return null;
}
