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

import { parseAmount } from "@/lib/calc/number-parse";
import type { AssetForm } from "@/lib/stores/calc-wizard-store";
import { fieldError } from "./transfer-tax-validate-field";
// 술어·합산은 `transfer-successor-right.ts` 단일 소스 — ④ 변환·⑤ UI와 같은 함수를 쓴다.
import { successorRightEstimationMode, successorTypeToggleSectionLabel } from "./transfer-successor-right";
import { successorRightStdPriceAtAcq } from "./transfer-successor-right";
import { bgSuccessorRightStdForced } from "./bg-rtmi-std-acq";
import { successorRightStdPriceAtTransfer } from "./transfer-successor-right";
import { isCarryoverSuccessorRight } from "./transfer-successor-right";
import { isDeemedValueSuccessorRight } from "./transfer-successor-right";
import { deemedSuccessorRightValueField } from "./transfer-successor-right";
import { primaryAcquisitionDateOf } from "./transfer-tax-api-carryover";

/**
 * 승계조합원 입주권 자산 검증.
 *
 * 호출 조건은 `isSuccessorRightTransfer(asset) === true` — 호출부(`transfer-tax-validate-asset.ts`)가
 * 같은 술어로 분기한다(`transfer-successor-right.ts` 단일 소스).
 *
 * @returns 차단 사유 문자열, 통과 시 null
 */
export function validateSuccessorRightAsset(
  asset: AssetForm,
  label: string,
  /** 「조합원 유형」 질문이 있는 섹션 — 축 B 둘째 이후 지분 카드는 ③ 취득정보(`successorTypeToggleSectionLabel`). */
  typeToggleSection: string = successorTypeToggleSectionLabel(false),
  /** 양도일 — 부담부증여 담보·임대 승(괄호 열거 시기)이면 승계취득가액이 쓰이지 않는다(`bgSuccessorRightStdForced`). */
  formTransferDate?: string,
): string | null {
  // ── 취득일 ── 이월과세는 취득일 칸이 화면에 없다 — ④와 같은 leaf(원값 → 증여 등기일)로 읽는다(계획서 `successor-right-carryover-validation.plan.md` Q-1 a).
  const acqDate = primaryAcquisitionDateOf(asset);
  if (!acqDate) {
    return fieldError("acquisitionDate", `${label}: 조합원입주권 승계취득일을 입력하세요.`);
  }

  /**
   * 승계는 **관리처분계획 인가 후 취득**이 정의다. 인가일이 취득일보다 뒤라면 그 사람은
   * 조합에 종전 부동산을 제공한 원조합원이다 — 유형 선택이 잘못된 것이므로 지목해 준다.
   * (인가일 미입력은 통과시킨다 — 승계 경로의 계산에는 인가일이 쓰이지 않는다.)
   */
  if (
    asset.redevApprovalDate &&
    new Date(asset.redevApprovalDate) > new Date(acqDate)
  ) {
    return fieldError("isSuccessorRightToMoveIn", `${label}: 관리처분계획 인가일이 취득일보다 나중입니다. 인가 전에 종전 부동산을 보유하셨다면 ${typeToggleSection}의 「조합원 유형」을 "원조합원"으로 바꾸세요. (시행령 §166①)`);
  }

  /**
   * ── 취득가액 산정 방식 (§97①1호) ────────────────────────────────────────────
   *
   * R-12(2026-08-23)로 추계 3종이 열렸다. 근거는 조사에서 확정됐다:
   *   · 조합원입주권 = 법 §94①2호 **가목**(부동산을 취득할 수 있는 권리)
   *   · 기준시가 = §99①2호 가목 → 영 **§165①**(납입액 + 프리미엄) — **명문**
   *   · 환산 산식 = 영 §176의2②**2호**가 「제2호가목 … 부동산을 취득할 수 있는 권리」를 명시 대상
   *   · 추계 순서 = 영 §176의2③ (매매사례 → 감정 → 환산 → 기준시가)
   *
   * ⛔ **원조합원에는 열리지 않는다** — §166③ 환산이 전속이다(R-9). 게이트는 ④ 변환의
   *    `blocksEstimation`이 담당하고, 여기는 승계 자산만 들어온다.
   */
  // 이월과세 — 취득가액은 이월과세 블록이 정한다(호출부가 `validateCarryoverAsset`를 건다 · Q-2 a). 승계 산정 방식·승계취득가액은 보지 않는다(Q-4 a).
  if (isCarryoverSuccessorRight(asset)) return null;

  // 상속·증여 — 취득가액은 §163⑨ 평가액이다(④ 페이로드와 같은 칸). 승계 산정 방식·승계취득가액은 보지 않는다(⑤가 숨긴다).
  //   종전엔 평가액이 비면 승계취득가액이 취득가액이 됐고(상속 100,000,000 → 472,935,000), 추가분담금은 조용히 빠졌다
  //   (계획서 `successor-right-carryover-contribution.plan.md` F-1·F-3 · Q-2 a — 추가분담금은 근거 확인 전이라 계산을 거절한다).
  if (isDeemedValueSuccessorRight(asset)) {
    const valueField = deemedSuccessorRightValueField(asset);
    if (parseAmount(asset[valueField]) <= 0) {
      return fieldError(
        valueField,
        valueField === "fixedAcquisitionPrice"
          ? `${label}: 증여 신고가액(증여일 현재 평가액)을 입력하세요. (소득세법 시행령 §163⑨ — 그 평가액을 취득가액으로 봅니다)`
          : `${label}: 상속개시일 평가액(상속세 신고가액)을 입력하세요. (소득세법 시행령 §163⑨ — 그 평가액을 취득가액으로 봅니다)`,
      );
    }
    if (parseAmount(asset.successorRightAddedContribution) > 0) {
      return fieldError("successorRightAddedContribution", `${label}: 상속·증여로 받은 조합원입주권은 취득 후 납입한 추가분담금을 현재 버전에서 계산에 반영하지 못합니다. 칸을 비우거나 세무사에게 수동 계산을 의뢰하세요.`);
    }
    return null;
  }

  const mode = successorRightEstimationMode(asset);

  if (mode === "actual") {
    // 부담부증여 담보·임대 승(괄호 열거 시기) — 취득가액이 입주권 기준시가(취득일 2칸)라 승계취득가액·추가분담금은 쓰이지 않는다. 기준시가 2칸은 부담부증여 검증(5-c‴)이 요구한다.
    if (bgSuccessorRightStdForced(asset, formTransferDate)) return null;
    const acqPrice = parseAmount(asset.successorRightAcqPrice);
    if (acqPrice <= 0) {
      return fieldError("successorRightAcqPrice", `${label}: 조합원입주권 승계취득가액을 입력하세요. (소득세법 §97①1호 가목 — 취득에 든 실지거래가액)`);
    }

    /**
     * 추가분담금은 **음수 입력만** 막는다. 미입력("")은 0으로 본다 — 승계 직후 양도라
     * 납입분이 없을 수 있다(자동 안분 fallback이 아니라 「없음」의 정상 표현).
     */
    if (parseAmount(asset.successorRightAddedContribution) < 0) {
      return fieldError("successorRightAddedContribution", `${label}: 취득 후 납입한 추가분담금은 0 이상이어야 합니다.`);
    }

    return null;
  }

  /**
   * ── 추계 3종 공통 — §165① **취득당시** 기준시가 필수 ──────────────────────────
   *
   * 세 모드 모두 §163⑥(개산공제) base로 취득당시 기준시가를 쓴다. 미입력이면 개산공제가
   * 0이 되고, 환산에서는 **분자가 0이라 취득가액 자체가 0**이 된다.
   * 🔴 실측(P-8 ⑤): 기준시가를 비운 채 환산을 돌리면 양도차익이 **양도가액 전액**(8억)이 됐다.
   *   오류 없이 조용히 과대과세되므로 여기서 반드시 막는다.
   *
   * 두 칸(납입액·프리미엄) 중 **하나만** 채워도 합계가 양수면 통과시킨다 — 프리미엄 없이
   * 취득했거나(=0) 납입 전 단계일 수 있어 각 칸을 개별 필수로 만들 근거가 없다.
   */
  if (successorRightStdPriceAtAcq(asset) <= 0) {
    return fieldError("successorRightStdPaidAtAcq", `${label}: 추계 취득가액을 쓰려면 취득당시 기준시가(취득일까지 납입한 금액 + 취득일 현재 프리미엄)를 입력하세요. (소득세법 시행령 §165① — 조합원입주권의 §99①2호 가목 기준시가)`);
  }

  if (mode === "estimated") {
    // 환산 분모 — §176의2②2호의 「양도당시 기준시가」. 0이면 0으로 나눠 환산이 성립하지 않는다.
    if (successorRightStdPriceAtTransfer(asset) <= 0) {
      return fieldError("successorRightStdPaidAtTransfer", `${label}: 환산취득가액을 쓰려면 양도당시 기준시가(양도일까지 납입한 금액 + 양도일 현재 프리미엄)를 입력하세요. (소득세법 시행령 §165① · §176의2②2호)`);
    }
    return null;
  }

  if (mode === "appraisal") {
    // 감정가액은 기존 실가 입력 루틴과 같은 칸을 쓴다(`fixedAcquisitionPrice`) — ④ 변환과 동일 소스.
    if (parseAmount(asset.fixedAcquisitionPrice) <= 0) {
      return fieldError("fixedAcquisitionPrice", `${label}: 감정가액을 입력하세요. (소득세법 시행령 §176의2③2호 — 취득일 전후 3개월 이내 2 이상의 감정평가법인등이 평가한 가액의 평균액)`);
    }
    return null;
  }

  // salesCase
  if (parseAmount(asset.similarSalesValue) <= 0) {
    return fieldError("similarSalesValue", `${label}: 매매사례가액을 입력하세요. (소득세법 시행령 §176의2③1호 — 취득일 전후 3개월 이내 동일·유사 자산의 매매사례가액)`);
  }

  return null;
}
