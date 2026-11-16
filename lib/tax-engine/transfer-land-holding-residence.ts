/**
 * 토지를 건물보다 **나중에** 취득한 분리취득 주택 — 토지 파트 거주기간별 공제율의 거주기간 = **토지 보유기간 중 본인 거주** (역방향 · 계획서 §8).
 *
 * 계획서: docs/00-pm/split-land-residence-rate-4289.plan.md §8 (Q-5 b · Q-5-1 b)
 * 근거: 대법원 2025두34935(2026.1.15.) 「양도자산인 주택의 취득일부터 양도일까지의 보유기간 중 해당 주택에서 거주한 기간」 + 소득세법 §95④(자산별 보유기간).
 *       정면 해석은 확인하지 못했다 — 그래서 직접 입력으로 상한을 적용했을 때는 결과에 확인 필요를 고지한다.
 *
 * 입력 하나(엔진 `TransferTaxInput` ↔ ⑫ 와이어 같은 이름):
 *   · `landHoldingResidenceMonths` — 구간 입력(`residenceInputMode: "interval"`)에서 ④가 각 구간과 [토지 취득일, 양도일]의 **겹침 개월**을 합해 싣는다.
 *     직접 개월 입력은 시점을 알 수 없어 이 값이 없다 → 엔진이 `min(거주 개월, 토지 보유 개월)`로 상한한다(Q-5-1 b).
 *
 * 적용 범위 — **토지 파트 공제율만**. 표2 **대상 판정**(거주 2년)은 자산(주택) 단위 「보유기간 중 거주」라 건물 기준 그대로다(이 파일은 대상 판정을 건드리지 않는다).
 *   · 토지가 건물보다 같은 날이거나 먼저 취득됐으면 이 규칙은 걸리지 않는다(종전 그대로 · 4289 개월만 더한다).
 *   · 소유자 분리(토지만·건물만 본인)는 범위 밖이다(그 축의 거주는 별도 — 계획서 V-4).
 *
 * 엔진(`calcLongTermHoldingDeduction`)·⑫(`refineSplitPartCause`)·⑧이 `collectSplitPartCauseIssues`를 거쳐 **같은 게이트 술어**(`landAcquiredAfterBuilding`)를 공유한다.
 */
import { completedMonthsInclusive } from "./civil-period";
import { parseISO } from "./utc-date";
import type { SplitPartCauseFacts, SplitPartCauseIssue } from "./transfer-split-part-cause";
import { TaxCalculationError, TaxErrorCode } from "./tax-errors";

export const LAND_HOLDING_RESIDENCE_MONTHS_FIELD = "landHoldingResidenceMonths" as const;

export const LAND_HOLDING_RESIDENCE_GATE_MESSAGE =
  "토지 보유기간 중 거주 개월 수(landHoldingResidenceMonths)는 토지를 건물보다 나중에 취득한 분리취득 주택(본인이 토지·건물을 모두 소유)에서만 입력할 수 있습니다 — "
  + "조용히 버려지지 않도록 막습니다";

export const LAND_HOLDING_RESIDENCE_INVALID_MESSAGE =
  "토지 보유기간 중 거주 개월 수는 0 이상의 정수여야 합니다";

export const LAND_HOLDING_RESIDENCE_EXCEEDS_MESSAGE =
  "토지 보유기간 중 거주 개월 수는 거주기간 합계(residencePeriodMonths)를 넘을 수 없습니다";

/** YYYY-MM-DD 키 — Date·문자열 모두(④ payload를 Route 변환 없이 엔진에 넣는 호출부가 있다). */
function dayOf(d: Date | string | undefined): string | undefined {
  if (!d) return undefined;
  return d instanceof Date ? d.toISOString().slice(0, 10) : d.slice(0, 10);
}

/**
 * 토지가 건물보다 **나중에** 취득됐는가(날짜 엄격 비교) — 소유자 분리는 제외한다. ④·⑫·엔진이 같은 술어를 쓴다.
 * 날짜가 하나라도 비면 판정하지 않는다(false — 다른 규칙이 날짜 누락을 짚는다).
 */
export function landAcquiredAfterBuilding(a: {
  landAcquisitionDate?: Date | string;
  buildingAcquisitionDate?: Date | string;
  selfOwns?: string;
}): boolean {
  if (a.selfOwns !== undefined && a.selfOwns !== "both") return false;
  const land = dayOf(a.landAcquisitionDate);
  const building = dayOf(a.buildingAcquisitionDate);
  return !!land && !!building && land > building;
}

/** 토지 보유 개월 — 취득일부터 양도일까지 §95④ 초일 산입(`calculateHoldingPeriod`·거주 구간과 같은 `completedMonthsInclusive`). */
export function landHoldingMonthsOf(landAcquisitionDate: Date | string, transferDate: Date | string): number {
  const land = dayOf(landAcquisitionDate);
  const transfer = dayOf(transferDate);
  if (!land || !transfer) return 0;
  return completedMonthsInclusive(parseISO(land), parseISO(transfer));
}

export interface LandHoldingResidence {
  /** 이 규칙이 걸리는가(토지가 건물보다 나중 취득 · 본인이 둘 다 소유) */
  applies: boolean;
  /** 토지 파트 공제율에 쓰는 본인 거주 개월 — 걸리지 않으면 입력 거주 개월 그대로 */
  months: number;
  /** 직접 입력에 보유기간 상한을 적용해 입력보다 줄었는가(구간 입력은 겹침을 ④가 계산하므로 false) */
  capped: boolean;
  /** 상한 계산에 쓴 토지 보유 개월(걸릴 때만) */
  landHoldingMonths?: number;
}

export function resolveLandHoldingResidence(
  input: {
    residencePeriodMonths: number;
    landHoldingResidenceMonths?: number;
    landAcquisitionDate?: Date | string;
    acquisitionDate?: Date | string;
    transferDate: Date | string;
    /** 파트 이월과세 시나리오 입력 — 이 규칙을 걸지 않는다(`TransferTaxInput.landHoldingResidenceSkip`) */
    landHoldingResidenceSkip?: boolean;
  },
  selfOwns: string | undefined,
): LandHoldingResidence {
  if (input.landHoldingResidenceSkip) return { applies: false, months: input.residencePeriodMonths, capped: false };
  const applies = landAcquiredAfterBuilding({
    landAcquisitionDate: input.landAcquisitionDate,
    buildingAcquisitionDate: input.acquisitionDate,
    selfOwns,
  });
  if (!applies) return { applies: false, months: input.residencePeriodMonths, capped: false };
  const holding = landHoldingMonthsOf(input.landAcquisitionDate!, input.transferDate);
  if (input.landHoldingResidenceMonths !== undefined) {
    return { applies: true, months: input.landHoldingResidenceMonths, capped: false, landHoldingMonths: holding };
  }
  const months = Math.min(input.residencePeriodMonths, holding);
  return { applies: true, months, capped: months < input.residencePeriodMonths, landHoldingMonths: holding };
}

/**
 * 규칙 본문(⑧·⑫·엔진 입구). 값이 없으면 걸리지 않는다. 값이 있으면 게이트 → 정수 → 합계 이하 순으로 **첫 위반 하나**만 돌려준다.
 * 합계 이하 검사는 거주 합계가 함께 올 때만 한다(⑫·엔진은 둘 다 온다 — 생략된 호출부는 확인하지 않는다).
 */
export function collectLandHoldingResidenceIssues(f: SplitPartCauseFacts): SplitPartCauseIssue[] {
  const months = f.landHoldingResidenceMonths;
  if (months === undefined) return [];
  const at = (message: string): SplitPartCauseIssue[] => [{ field: LAND_HOLDING_RESIDENCE_MONTHS_FIELD, message }];
  if (!f.isSplitable || !landAcquiredAfterBuilding({ landAcquisitionDate: f.landAcquisitionDate, buildingAcquisitionDate: f.buildingAcquisitionDate, selfOwns: f.selfOwns }))
    return at(LAND_HOLDING_RESIDENCE_GATE_MESSAGE);
  if (!Number.isInteger(months) || months < 0) return at(LAND_HOLDING_RESIDENCE_INVALID_MESSAGE);
  if (f.residencePeriodMonths !== undefined && months > f.residencePeriodMonths) return at(LAND_HOLDING_RESIDENCE_EXCEEDS_MESSAGE);
  return [];
}

export const LAND_HOLDING_RESIDENCE_CARD_GATE_MESSAGE =
  "토지 보유기간 중 거주 개월 수(landHoldingResidenceMonths)는 함께 양도하는 주택 부수토지 카드를 첫 번째 주택(주 자산)보다 나중에 취득한 경우에만 입력할 수 있습니다 — "
  + "조용히 버려지지 않도록 막습니다";

/**
 * 함께 양도 **주택 부수토지 카드**(L-1b) — 구간 입력의 카드 보유기간 중 거주 개월(④가 주 자산 거주 구간 ∩ [카드 취득일, 양도일]).
 * 카드는 거주를 주 자산에서 승계하므로(`bundled-split-helpers.ts`) 값은 승계할 거주 합계 이하여야 한다.
 * 게이트: 주 자산이 주택 · 카드가 주택 부수토지 · 카드 취득일 > 주 주택 취득일. ⑫가 컴패니언 모양에서 이 함수를 부른다(분리취득 leaf와 모양이 달라 따로 둔다).
 */
export function collectAppurtenantCardHoldingResidenceIssues(f: {
  landHoldingResidenceMonths?: number;
  /** 카드가 승계할 거주 합계 — 카드 자신의 값이 없으면 주 자산 값. 모르면 상한 검사를 건너뛴다 */
  residencePeriodMonths?: number;
  isAppurtenantLandCard: boolean;
  primaryIsHousing: boolean;
  cardAcquisitionDate?: Date | string;
  primaryAcquisitionDate?: Date | string;
}): SplitPartCauseIssue[] {
  const months = f.landHoldingResidenceMonths;
  if (months === undefined) return [];
  const at = (message: string): SplitPartCauseIssue[] => [{ field: LAND_HOLDING_RESIDENCE_MONTHS_FIELD, message }];
  if (!f.isAppurtenantLandCard || !f.primaryIsHousing || !landAcquiredAfterBuilding({ landAcquisitionDate: f.cardAcquisitionDate, buildingAcquisitionDate: f.primaryAcquisitionDate }))
    return at(LAND_HOLDING_RESIDENCE_CARD_GATE_MESSAGE);
  if (!Number.isInteger(months) || months < 0) return at(LAND_HOLDING_RESIDENCE_INVALID_MESSAGE);
  if (f.residencePeriodMonths !== undefined && months > f.residencePeriodMonths) return at(LAND_HOLDING_RESIDENCE_EXCEEDS_MESSAGE);
  return [];
}

export const LAND_HOLDING_RESIDENCE_MIXED_GATE_MESSAGE =
  "토지 보유기간 중 거주 연수(mixedUse.landHoldingResidencePeriodYears)는 겸용주택의 토지를 건물보다 나중에 취득한 경우에만 입력할 수 있습니다 — 조용히 버려지지 않도록 막습니다";
export const LAND_HOLDING_RESIDENCE_MIXED_EXCEEDS_MESSAGE =
  "토지 보유기간 중 거주 연수(mixedUse.landHoldingResidencePeriodYears)는 거주 연수 합계(residencePeriodYears)를 넘을 수 없습니다";

/**
 * 겸용주택 — 거주를 정수 **연수**로만 받는 서브객체용 검증(⑫·엔진 공유). 값은 ④가 구간 겹침 개월을 `floor(÷12)`한 연수다.
 * 게이트(토지가 건물보다 나중) → 0 이상 정수 → 거주 연수 합계 이하 순으로 첫 위반 하나.
 */
export function mixedLandHoldingResidenceIssue(a: {
  landHoldingResidencePeriodYears?: number;
  residencePeriodYears?: number;
  landAcquisitionDate?: Date | string;
  buildingAcquisitionDate?: Date | string;
}): string | undefined {
  const y = a.landHoldingResidencePeriodYears;
  if (y === undefined) return undefined;
  if (!landAcquiredAfterBuilding({ landAcquisitionDate: a.landAcquisitionDate, buildingAcquisitionDate: a.buildingAcquisitionDate })) return LAND_HOLDING_RESIDENCE_MIXED_GATE_MESSAGE;
  if (!Number.isInteger(y) || y < 0) return LAND_HOLDING_RESIDENCE_INVALID_MESSAGE;
  if (a.residencePeriodYears !== undefined && y > a.residencePeriodYears) return LAND_HOLDING_RESIDENCE_MIXED_EXCEEDS_MESSAGE;
  return undefined;
}

/**
 * 겸용주택 주택분 토지의 거주 연수(공제율의 거주분 기준) — 분리취득과 같은 `resolveLandHoldingResidence`를 연수×12로 부른다
 * (floor(min(연수×12, 보유 개월) ÷ 12) = min(연수, 보유 연수)라 직접 입력은 연수 단위로 같은 값이다). 검증 위반이면 throw(엔진 입구).
 * `cap`: 직접 입력 상한이 걸렸을 때의 사실 — 공제율이 실제로 바뀌었는지는 호출부(공제율 함수)가 가린다.
 */
export function resolveMixedLandHoldingResidence(
  asset: {
    residencePeriodYears: number;
    landHoldingResidencePeriodYears?: number;
    landAcquisitionDate: Date | string;
    buildingAcquisitionDate: Date | string;
  },
  transferDate: Date | string,
): { years: number; cap?: { directMonths: number; cappedMonths: number; landHoldingMonths: number } } {
  const issue = mixedLandHoldingResidenceIssue(asset);
  if (issue) throw new TaxCalculationError(TaxErrorCode.INVALID_INPUT, issue, { field: "landHoldingResidencePeriodYears" });
  const res = resolveLandHoldingResidence(
    {
      residencePeriodMonths: asset.residencePeriodYears * 12,
      landHoldingResidenceMonths: asset.landHoldingResidencePeriodYears === undefined ? undefined : asset.landHoldingResidencePeriodYears * 12,
      landAcquisitionDate: asset.landAcquisitionDate,
      acquisitionDate: asset.buildingAcquisitionDate,
      transferDate,
    },
    "both",
  );
  return {
    years: Math.floor(res.months / 12),
    ...(res.capped ? { cap: { directMonths: asset.residencePeriodYears * 12, cappedMonths: res.months, landHoldingMonths: res.landHoldingMonths! } } : {}),
  };
}
