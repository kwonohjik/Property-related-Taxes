/**
 * 주택·건물 토지·건물 분리 계산에서 **토지 파트 취득원인**(`landAcquisitionCause`) 입력 규칙 — Phase D0.
 *
 * 계획서: docs/00-pm/transfer-acq-cause-mixed.plan.md §4 D0 (G-1·G-2·G-3)
 *
 * 엔진(`calcSplitGain` 진입)·⑫(`refineSplitPartCause`)·⑧(`validateSplitDirectInputs`)이 **이 함수 하나**를
 * 공유한다. 셋이 따로 판정하면 「⑧ 통과 ↔ ⑫ 400」 막다른 길이 생긴다.
 *
 * D0 규칙(G-1·G-2·G-3)은 토지 취득일이 있을 때만 본다 — 엔진이 토지 파트 원인을 읽는 조건과 같다
 * (`resolveLandStatutoryAcquisitionDate` — 토지 취득일이 없으면 원인을 쓰지 않는다).
 *
 * D1(계획서 §10 · 설계 `transfer-acq-cause-mixed-d1.engine.design.md` §3)은 **토지 상속·증여가 지정됐는데
 * 엔진이 그 원인을 읽지 않거나 틀리게 읽는** 결합을 막는다(실측: 소유자 분리·가업상속·건물 비매매는 원인이
 * 조용히 무시되고, 토지 취득일이 비면 토지 파트가 통째로 빠진다). 순서 = 첫 항목이 엔진 throw·⑧ 표시이므로
 * 결합 자체가 미지원인 구조 규칙을 먼저 둔다(「환산 못 함」이 먼저 뜨면 틀린 레버를 가리킨다 — PHD 실례).
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
  // ── D1 (전부 선택 — 생략 = 그 결합이 아니다) ──
  /** 토지 취득일(상속개시일·증여일) YYYY-MM-DD — §163⑨ 단서 1호 날짜 판정 */
  landAcquisitionDate?: string;
  /** 자산 단위 취득원인 = 주택 split 컨벤션상 **건물** 파트 원인 */
  buildingAcquisitionCause?: string;
  selfOwns?: string;
  isBurdenedGift?: boolean;
  hasPreHousingDisclosure?: boolean;
  hasFamilyBusinessInheritance?: boolean;
  // ── D1-4 (§163⑨ 단서 1호 max) ──
  /** 영 §164④ 가액(②) 총액 — 양수면 「있음」. 생략·0 = ② 없음 (엔진은 `landSec164Value`, ⑧은 ④가 실제로 보내는 값) */
  landSec164Value?: number;
  /** 면적 입력 방식 「일부 양도」 — 평가액이 취득 전체분인지 양도분인지 미확정이라 단서 구간에서 차단한다 */
  isPartialAreaTransfer?: boolean;
}

export type SplitPartCauseField =
  | "landAcquisitionCause"
  | "landAcqMode"
  | "landDecedentAcquisitionDate"
  | "landAcquisitionDate"
  | "landSec164Value"
  | "areaScenario";

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

/** 「소득세법 시행령」 §163⑨ 단서 1호 — 「1990년 8월 30일 개별공시지가가 고시되기 전에 상속 또는 증여받은 토지」. */
export const SEC_163_9_LAND_FIRST_DISCLOSURE = "1990-08-30";

export const LAND_CAUSE_BURDENED_GIFT_MESSAGE =
  "부담부증여로 양도하는 자산에는 토지 취득원인을 따로 지정할 수 없습니다 — 채무 인수분을 양도로 보는 안분"
  + "(소득세법 시행령 §159)이 토지·건물 취득가액 구분과 함께 계산되지 않습니다";

export const LAND_CAUSE_PHD_MESSAGE =
  "개별주택가격이 공시되기 전에 취득한 주택의 환산(소득세법 시행령 §164⑦)은 토지·건물을 모두 환산할 때만 쓰는데, "
  + "상속·증여로 취득한 토지는 환산할 수 없습니다(같은 법 시행령 §163⑨) — 「토지는 다른 원인으로 취득」을 끄거나 "
  + "개별주택가격 미공시 환산을 끄세요";

export const LAND_CAUSE_FAMILY_BUSINESS_MESSAGE =
  "가업상속공제가 적용된 자산(소득세법 §97의2④) 입력은 토지만 상속·증여받은 계산과 함께 쓸 수 없습니다";

export const LAND_CAUSE_OWNER_SPLIT_MESSAGE =
  "토지·건물 중 한쪽만 소유한 자산에는 토지 취득원인을 따로 지정할 수 없습니다 — 소유한 파트의 취득원인을 "
  + "자산 취득원인으로 입력하세요";

export const LAND_CAUSE_BUILDING_CAUSE_MESSAGE =
  "건물을 상속·증여·이월과세·부담부증여로 취득한 자산에서 토지 취득원인을 따로 지정하는 기능은 지원하지 않습니다";

export const LAND_CAUSE_DATE_REQUIRED_MESSAGE =
  "토지를 상속·증여로 취득했다면 토지 상속개시일(증여일)이 필요합니다 — 비우면 토지·건물을 나눠 계산하지 못해 "
  + "토지 취득원인과 토지 취득가액이 계산에서 빠집니다";

/**
 * 영 §163⑨ 단서 1호 구간인가 — 토지 상속·증여 ∧ 토지 취득일(상속개시일·증여일) < 1990-08-30(엄격 — 고시일 당일은 「고시되기 전」이 아니다).
 * 엔진·⑫·⑧·④·브리지가 이 술어 하나를 쓴다(단일 소스). 날짜는 `YYYY-MM-DD…` 문자열(시각 꼬리 허용).
 */
export function isSec163_9LandProviso(cause: string | undefined, landDate: string | undefined): boolean {
  return (cause === "inheritance" || cause === "gift") && !!landDate && landDate.slice(0, 10) < SEC_163_9_LAND_FIRST_DISCLOSURE;
}

export const LAND_SEC164_REQUIRED_MESSAGE =
  "1990.8.30. 개별공시지가 고시 전에 상속·증여받은 토지의 취득가액은 상속개시일(증여일) 현재 평가액과 소득세법 시행령 §164④ 가액 "
  + "중 많은 금액이므로 §164④ 가액(토지등급 환산, landSec164Value)이 필요합니다 (같은 법 시행령 §163⑨ 단서 1호)";

export const LAND_SEC164_PARTIAL_MESSAGE =
  "토지 일부만 양도하는 경우(면적 입력 방식 「일부 양도」)는 1990.8.30. 개별공시지가 고시 전에 상속·증여받은 토지의 영 §164④ 비교를 "
  + "지원하지 않습니다 — 평가액이 취득 전체분인지 양도분인지 정해지지 않았고 면적으로 자동 안분하지 않습니다 (같은 법 시행령 §163⑨ 단서 1호)";

/** 건물(자산 단위) 원인이 이 값이면 토지 파트 원인 혼합은 D2 범위다. 미지정은 매매로 본다(엔진 헬퍼 기본값). */
const BUILDING_CAUSE_UNSUPPORTED = new Set(["inheritance", "gift", "carryover_gift", "burdened_gift"]);

/** 위반 항목을 모두 돌려준다(엔진은 첫 항목으로 던지고, ⑫는 전부 기록하고, ⑧은 첫 항목을 칸에 붙인다). */
export function collectSplitPartCauseIssues(f: SplitPartCauseFacts): SplitPartCauseIssue[] {
  if (!f.isSplitable) return [];
  const issues: SplitPartCauseIssue[] = [];
  const cause = f.landAcquisitionCause;
  const mixed = cause === "inheritance" || cause === "gift";

  // D1 구조 규칙 — 토지 상속·증여가 지정됐을 때만(원인이 없거나 매매면 결합이 아니다).
  if (mixed) {
    const structural: [boolean, string][] = [
      [!!f.isBurdenedGift, LAND_CAUSE_BURDENED_GIFT_MESSAGE],
      [!!f.hasPreHousingDisclosure, LAND_CAUSE_PHD_MESSAGE],
      [!!f.hasFamilyBusinessInheritance, LAND_CAUSE_FAMILY_BUSINESS_MESSAGE],
      // 엔진은 소유자 분리에서 토지 원인을 읽지 않는다(land_only 실측 — 통산이 조용히 빠진다).
      [f.selfOwns !== undefined && f.selfOwns !== "both", LAND_CAUSE_OWNER_SPLIT_MESSAGE],
      [BUILDING_CAUSE_UNSUPPORTED.has(f.buildingAcquisitionCause ?? ""), LAND_CAUSE_BUILDING_CAUSE_MESSAGE],
    ];
    for (const [hit, message] of structural) if (hit) issues.push({ field: "landAcquisitionCause", message });
    // G-12 — 토지 취득일이 없으면 분리 계산이 성립하지 않아 토지 파트가 통째로 빠진다(⑫ 200 · splitDetail 없음).
    if (!f.hasLandAcquisitionDate) issues.push({ field: "landAcquisitionDate", message: LAND_CAUSE_DATE_REQUIRED_MESSAGE });
  }
  if (!f.hasLandAcquisitionDate) return issues;

  // G-1 — 엔진은 토지 파트 이월과세를 세율 기산(§104②2호)에만 반영하고 취득가액·장특 기산·비교과세는 하지 않는다.
  if (cause === "carryover_gift")
    issues.push({ field: "landAcquisitionCause", message: LAND_CARRYOVER_UNSUPPORTED_MESSAGE });

  // Q-7(D1-4) — §163⑨ 단서 1호: 평가액(①)과 영 §164④ 가액(②) 중 많은 금액. ②가 없으면 비교할 수 없어 차단한다.
  // 일부 양도는 ①의 기준 면적이 미확정이라 먼저 막는다(② 입력으로 풀리지 않는 사유가 앞).
  if (isSec163_9LandProviso(cause, f.landAcquisitionDate)) {
    if (f.isPartialAreaTransfer) issues.push({ field: "areaScenario", message: LAND_SEC164_PARTIAL_MESSAGE });
    else if (!((f.landSec164Value ?? 0) > 0))
      issues.push({ field: "landSec164Value", message: LAND_SEC164_REQUIRED_MESSAGE });
  }

  // G-2 — 일반건물 파트 규칙(`transfer-tax-validate-gb.ts` blockEstimation · `gbPartAllowedModes`)과 같다.
  if ((cause === "inheritance" || cause === "gift") && f.landMode !== "actual")
    issues.push({ field: "landAcqMode", message: LAND_INHERITED_ESTIMATION_MESSAGE });

  // G-3 — 비우면 통산이 조용히 빠져 단기세율이 된다. 일반건물 토지 상속도 필수다(`transfer-tax-schema-required-refines-gb.ts:80`).
  if (cause === "inheritance" && !f.hasLandDecedentAcquisitionDate)
    issues.push({ field: "landDecedentAcquisitionDate", message: LAND_DECEDENT_DATE_REQUIRED_MESSAGE });

  return issues;
}
