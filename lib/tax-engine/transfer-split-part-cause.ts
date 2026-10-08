/**
 * 주택·건물 토지·건물 분리 계산에서 **토지 파트 취득원인**(`landAcquisitionCause`) 입력 규칙 — Phase D0.
 *
 * 계획서: docs/00-pm/transfer-acq-cause-mixed.plan.md §4 D0 (G-1·G-2·G-3)
 *
 * 엔진(`calcSplitGain` 진입)·⑫(`refineSplitPartCause`)·⑧(`validateSplitDirectInputs`)이 **이 함수 하나**를
 * 공유한다. 셋이 따로 판정하면 「⑧ 통과 ↔ ⑫ 400」 막다른 길이 생긴다.
 *
 * 규칙은 토지 취득일이 있을 때만 본다 — 엔진이 토지 파트 원인을 읽는 조건과 같다
 * (`resolveLandStatutoryAcquisitionDate` — 토지 취득일이 없으면 원인을 쓰지 않는다).
 */
import type { PartAcqMode } from "./transfer-tax-split-acq-price";

export interface SplitPartCauseFacts {
  /** 주택·건물(토지 포함) 자산인가 — 분리 계산 대상(`calcSplitGain`과 같은 범위) */
  isSplitable: boolean;
  hasLandAcquisitionDate: boolean;
  landAcquisitionCause?: string;
  hasLandDecedentAcquisitionDate: boolean;
  /** 토지 파트 **유효** 산정방식 — 명시값이 없으면 호출부가 자산 단위 플래그에서 파생해 넘긴다 */
  landMode: PartAcqMode;
}

export type SplitPartCauseField = "landAcquisitionCause" | "landAcqMode" | "landDecedentAcquisitionDate";

export interface SplitPartCauseIssue {
  field: SplitPartCauseField;
  message: string;
}

export const LAND_CARRYOVER_UNSUPPORTED_MESSAGE =
  "토지·건물을 따로 취득한 주택·건물에서 토지 파트만 배우자·직계존비속 이월과세로 계산하는 기능은 지원하지 않습니다 — "
  + "이월과세는 취득가액(증여자의 취득 당시 금액)·장기보유특별공제 기산일(증여자 취득일)·증여세 상당액이 함께 바뀝니다 "
  + "(소득세법 §97의2①·§95④ 단서)";

export const LAND_INHERITED_ESTIMATION_MESSAGE =
  "상속·증여로 취득한 토지는 취득가액을 환산취득가·감정가액·매매사례가액으로 산정할 수 없습니다 — "
  + "상속개시일·증여일 현재 평가액이 취득당시 실지거래가액입니다 (소득세법 §97①1호·같은 법 시행령 §163⑨)";

export const LAND_DECEDENT_DATE_REQUIRED_MESSAGE =
  "상속으로 취득한 토지는 피상속인 취득일이 필요합니다 — 세율 판정 보유기간을 피상속인이 취득한 날부터 통산합니다 (소득세법 §104②1호)";

/** 위반 항목을 모두 돌려준다(엔진은 첫 항목으로 던지고, ⑫는 전부 기록하고, ⑧은 첫 항목을 칸에 붙인다). */
export function collectSplitPartCauseIssues(f: SplitPartCauseFacts): SplitPartCauseIssue[] {
  if (!f.isSplitable || !f.hasLandAcquisitionDate) return [];
  const issues: SplitPartCauseIssue[] = [];
  const cause = f.landAcquisitionCause;

  // G-1 — 엔진은 토지 파트 이월과세를 세율 기산(§104②2호)에만 반영하고 취득가액·장특 기산·비교과세는 하지 않는다.
  if (cause === "carryover_gift")
    issues.push({ field: "landAcquisitionCause", message: LAND_CARRYOVER_UNSUPPORTED_MESSAGE });

  // G-2 — 일반건물 파트 규칙(`transfer-tax-validate-gb.ts` blockEstimation · `gbPartAllowedModes`)과 같다.
  if ((cause === "inheritance" || cause === "gift") && f.landMode !== "actual")
    issues.push({ field: "landAcqMode", message: LAND_INHERITED_ESTIMATION_MESSAGE });

  // G-3 — 비우면 통산이 조용히 빠져 단기세율이 된다. 일반건물 토지 상속도 필수다(`transfer-tax-schema-required-refines-gb.ts:80`).
  if (cause === "inheritance" && !f.hasLandDecedentAcquisitionDate)
    issues.push({ field: "landDecedentAcquisitionDate", message: LAND_DECEDENT_DATE_REQUIRED_MESSAGE });

  return issues;
}
