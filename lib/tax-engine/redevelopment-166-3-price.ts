/**
 * 재개발·재건축 종전자산의 §166③ 환산취득가액 — 의제취득일 전 상속·증여 3자 max의 ③.
 *
 * 「소득세법 시행령」 §166③은 §166①②를 적용할 때 종전자산의 취득가액을 확인할 수 없으면 쓰는
 * 취득가액 대체 규정이다. 의제취득일(1985.1.1.) 전 상속·증여 종전자산은 취득가액을
 * max(① 상증법 평가액, ② §164④~⑦ 기준시가, ③ 환산취득가액)으로 정하는데(계획서
 * inheritance-pre-deemed-clause-b-revisit.plan.md §12 · Q-8 a), 재개발 종전자산의 ③은 §176조의2④가
 * 아니라 이 §166③ 금액이다 — 재개발 분기가 실제로 적용하는 산식과 같은 값을 비교해야 한다.
 *
 * ⚠️ 분기는 `runRedevelopment`(`redevelopment.ts`)를 따른다(환산 모드 기준). 그쪽 분기를 바꾸면
 *    여기도 바꿀 것 — `__tests__/tax-engine/transfer-tax/redevelopment/pre-deemed-166-3-max.anchor.test.ts`가
 *    분기마다 「이 값 = 재개발 엔진 환산 모드 실행의 종전자산 취득가액」을 대조한다.
 */

import { isHousingContribEstimatedAxes } from "./redevelopment-branch-gate";
import { computeRedevelopmentValuation } from "./redevelopment-valuation";
import { safeMultiplyThenDivide } from "./tax-utils";
import type { RedevelopmentInfo } from "./types/transfer-redevelopment.types";

/** §166③ 금액 — 산출에 필요한 칸이 비었거나 §166③이 없는 분기(승계조합원)면 null. */
export function resolveRedevelopment166_3AcquisitionPrice(
  info: RedevelopmentInfo,
  acquisitionDate: Date,
): number | null {
  // 승계조합원 — §166③ 환산 대상이 아니다(`runSuccessorMember`).
  if (info.isSuccessorMember === true) return null;

  // 주택 출자 · 입주권 · 청산금 수령 — 개별주택가격 2-point(`runHousingContribReceiveEstimated`).
  const phdAcq = info.housingStdPriceAtAcq ?? 0;
  const phdApproval = info.housingStdPriceAtApproval ?? 0;
  if (
    isHousingContribEstimatedAxes({
      originalAssetType: info.originalAssetType,
      subject: info.subject,
      settlementDirection: info.settlementDirection,
      useEstimatedAcquisition: true,
    }) &&
    phdAcq > 0 &&
    phdApproval > 0
  ) {
    return safeMultiplyThenDivide(info.rightsValue, phdAcq, phdApproval);
  }

  // 그 밖 — `runOriginalMember` → `computeRedevelopmentSplit` → `computeRedevelopmentValuation`.
  // 토지 출자 입주권(`runLandContribEstimated`)도 같은 함수의 토지 경로와 산식이 같다(권리가액 × 취득당시 ÷ 인가당시 개별공시지가).
  return computeRedevelopmentValuation(info, acquisitionDate)?.acquisitionPrice ?? null;
}
