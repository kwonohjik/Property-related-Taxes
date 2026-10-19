/**
 * 구주택 멸실·신축 통산(해석 (5)) 결과 고지 — 단건 일반 경로(`transfer-tax.ts`)와 §155⑳ 특례 경로(`transfer-tax-rental-housing-step.ts`)가 같은 함수를 부른다.
 *
 * 고지가 «적용했다»를 말하는지는 **엔진이 파트별 세율 판정을 거쳤는가**(`splitDetail.partRateBasisApplied === true`)가 정한다 — 결과 4뷰의 구간 표시 게이트
 * (`splitRebuildShown`, transfer-tax-split-display.ts)와 같은 플래그다. 세율 특칙·§155⑳ 특례처럼 자산 단위 세율로 후퇴하면
 * 통산은 세율에 닿지 않으므로 적용 고지 대신 대체 고지(숫자 구간 없음)를 낸다. 세액은 바꾸지 않는다.
 *
 * ⚠️ 호출 시점의 플래그를 읽는다 — 일반 경로는 `resolveSplitAwareTax` 직후, 특례 경로는 결과 조립 직전(`laterLand`가 플래그를 쓴 뒤)이다.
 *    다건은 자산별 단건 결과의 경고를 모으므로 그 판정을 따른다(최종 플래그와의 일치는 anchor로 고정).
 */
import { landRebuildRateNotice } from "./transfer-land-rebuild-rate";
import { resolveLandRebuildAggregation } from "./transfer-tax-appurtenant-land";
import type { SplitGainResult } from "./types/transfer-split-gain.types";
import type { TransferTaxInput } from "./types/transfer.types";

export function landRebuildNoticeOf(effectiveInput: TransferTaxInput, splitDetail: SplitGainResult | undefined): string | null {
  if (!splitDetail) return null;
  return landRebuildRateNotice(resolveLandRebuildAggregation(effectiveInput), splitDetail.partRateBasisApplied === true);
}
