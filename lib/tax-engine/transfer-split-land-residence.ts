/**
 * 분리취득 부수토지 — **건물 증여 전 동일세대 거주**를 토지 파트의 표2 거주기간 공제율에 더하는 입력의 게이트·상한 (서면-2025-법규재산-4289)
 *
 * 계획서: docs/00-pm/split-land-residence-rate-4289.plan.md §5 Q-1·Q-4·Q-6·Q-7·Q-8 · §6
 *
 * 입력 둘(엔진 `TransferTaxInput` ↔ ⑫ 와이어 같은 이름):
 *   · `landPartDonorSameHousehold` — 건물 증여자와 증여일부터 양도일까지 계속 같은 세대인가(예 = `true`).
 *   · `landPartPriorHouseholdResidenceMonths` — 건물 증여 **전**, 토지를 보유한 동안 건물 소유자와 같은 세대로 이 집에 거주한 개월 수.
 *
 * 엔진(`calcSplitGain` 진입 게이트)·⑫(`refineSplitPartCause`)·⑧(`validateLandPartCause`)이 `collectSplitPartCauseIssues`를 거쳐 **이 함수 하나**를 공유한다.
 * 셋이 따로 판정하면 「⑧ 통과 ↔ ⑫ 400」 막다른 길이 생긴다. 이 파일은 사실(`SplitPartCauseFacts`)만 읽는 순수 함수다.
 *
 * 게이트(하나라도 어긋난 값이 오면 막는다 — 조용히 버리지 않는다):
 *   ① D2 **증여** 호스트(건물 증여 + 토지 매수) — 상속은 해석 근거가 달라 받지 않는다(Q-1 a)
 *   ② 본인이 토지·건물을 모두 소유(소유자 분리 제외) · 부담부증여 아님
 *   ③ 주 자산 — 함께 양도하는 두 번째 이후 자산은 받지 않는다(Q-6 a)
 *   ④ §155⑳ 거주주택 특례 미선언 — ⑳ 경로는 표2를 시나리오별로 따로 계산해 이 입력과 결합할 근거가 없다(Q-7 b)
 * 상한(Q-4 a): 「토지 취득일과 증여자의 건물 취득일(선택 칸 — 비면 토지 취득일만) 중 늦은 날」부터 건물 증여일까지의 개월 수.
 *   토지를 보유하지 않았거나 증여자가 건물을 취득하기 전에는 이 집에서 건물 소유자와 함께 거주한 기간이 있을 수 없다.
 *   토글 「예」에 개월 수가 비면 차단한다 — 빈칸을 0이나 상한으로 보정하지 않는다.
 */
import { differenceInMonths, parseISO } from "./utc-date";
import type { SplitPartCauseFacts, SplitPartCauseIssue } from "./transfer-split-part-cause";

/** ⑧·⑫ 필드 키 — 엔진·와이어·폼 칸 이름이 같다. */
export const LAND_PART_DONOR_SAME_HOUSEHOLD_FIELD = "landPartDonorSameHousehold" as const;
export const LAND_PART_PRIOR_RESIDENCE_MONTHS_FIELD = "landPartPriorHouseholdResidenceMonths" as const;

const BASIS = "서면-2025-법규재산-4289";

export const LAND_PART_RESIDENCE_GATE_MESSAGE =
  "건물 증여 전 같은 세대 거주기간(landPartDonorSameHousehold·landPartPriorHouseholdResidenceMonths)은 건물만 증여받고 토지는 매수한 주택에서만 입력할 수 있습니다 — "
  + `상속·이월과세·부담부증여·토지 또는 건물만 본인 소유인 자산에서는 입력할 수 없고 조용히 버려지지 않도록 막습니다 (${BASIS})`;

export const LAND_PART_RESIDENCE_COMPANION_MESSAGE =
  "함께 양도(일괄양도)하는 두 번째 이후 자산에서는 건물 증여 전 같은 세대 거주기간을 입력할 수 없습니다 — 첫 번째 자산에서만 받습니다";

export const LAND_PART_RESIDENCE_RENTAL_20_MESSAGE =
  "장기임대주택 보유자의 거주주택 비과세 특례를 선언한 자산에서는 건물 증여 전 같은 세대 거주기간을 입력할 수 없습니다 — "
  + "특례 경로는 장기보유특별공제 표2를 시나리오별로 따로 계산하고 이 입력과 결합한 근거가 없습니다";

export const LAND_PART_RESIDENCE_STRAY_MESSAGE =
  "건물 증여 전 같은 세대 거주 개월 수(landPartPriorHouseholdResidenceMonths)는 「건물 증여자와 증여일부터 양도일까지 계속 같은 세대」(landPartDonorSameHousehold)가 「예」일 때만 입력할 수 있습니다";

export const LAND_PART_RESIDENCE_MONTHS_REQUIRED_MESSAGE =
  "「건물 증여자와 증여일부터 양도일까지 계속 같은 세대」를 선택했다면 건물 증여 전 토지를 보유한 동안 건물 소유자와 같은 세대로 이 집에 거주한 개월 수를 입력하세요 — "
  + "비우면 거주기간이 계산에서 빠집니다(0개월이면 0을 입력)";

export const LAND_PART_RESIDENCE_MONTHS_INVALID_MESSAGE =
  "건물 증여 전 같은 세대 거주 개월 수는 0 이상의 정수여야 합니다";

export const LAND_PART_RESIDENCE_MONTHS_NOT_ELIGIBLE_MESSAGE =
  "건물 증여 전 같은 세대 거주기간을 입력할 수 없습니다 — 토지 취득일(또는 증여자의 건물 취득일)이 건물 증여일 이후이거나 날짜가 비어 있습니다";

/** 상한 초과 문구 — 상한(개월)과 그 시작일 종류를 적는다. */
export function landPartResidenceMonthsExceedsMessage(max: number, startedByDonor: boolean): string {
  return (
    `건물 증여 전 같은 세대 거주 개월 수는 ${startedByDonor ? "증여자의 건물 취득일" : "토지 취득일"}부터 건물 증여일까지(${max}개월)를 넘을 수 없습니다 — `
    + "토지를 보유하지 않았거나 증여자가 건물을 취득하기 전에는 이 집에서 건물 소유자와 함께 거주한 기간이 있을 수 없습니다"
  );
}

/**
 * 상한(개월)과 그 시작일 종류. 날짜가 비었거나 시작일이 증여일 이후이면 `undefined`(상한을 정할 수 없다 — 호출부가 막는다).
 * 시작일 = 토지 취득일과 증여자 건물 취득일(선택) 중 늦은 날 — 같은 날이면 토지 쪽으로 적는다.
 */
export function landPartResidenceMaxMonths(
  f: Pick<SplitPartCauseFacts, "landAcquisitionDate" | "buildingAcquisitionDate" | "donorAcquisitionDate">,
): { max: number; startedByDonor: boolean } | undefined {
  if (!f.landAcquisitionDate || !f.buildingAcquisitionDate) return undefined;
  const land = parseISO(f.landAcquisitionDate.slice(0, 10));
  const gift = parseISO(f.buildingAcquisitionDate.slice(0, 10));
  const donor = f.donorAcquisitionDate ? parseISO(f.donorAcquisitionDate.slice(0, 10)) : undefined;
  const startedByDonor = !!donor && donor.getTime() > land.getTime();
  const start = startedByDonor ? donor : land;
  if (start.getTime() >= gift.getTime()) return undefined;
  return { max: Math.max(differenceInMonths(gift, start), 0), startedByDonor };
}

/**
 * 규칙 본문. 두 입력이 모두 없으면 이 규칙은 걸리지 않는다(`false` 하나만 오는 값은 조용한 무입력).
 * 입력이 있으면 게이트 → 짝 → 값 → 상한 순으로 **첫 위반 하나**만 돌려준다(앞이 레버가 다른 항목을 가리지 않게).
 */
export function collectSplitLandResidenceIssues(f: SplitPartCauseFacts): SplitPartCauseIssue[] {
  const toggle = f.landPartDonorSameHousehold === true;
  const months = f.landPartPriorHouseholdResidenceMonths;
  if (!toggle && months === undefined) return [];

  const at = (field: typeof LAND_PART_DONOR_SAME_HOUSEHOLD_FIELD | typeof LAND_PART_PRIOR_RESIDENCE_MONTHS_FIELD, message: string): SplitPartCauseIssue[] => [
    { field, message },
  ];

  // ③ 주 자산 — 컴패니언은 다른 사유보다 먼저 짚는다(그 자리에는 칸 자체가 없다).
  if (f.partCarryoverSupported === false) return at(LAND_PART_DONOR_SAME_HOUSEHOLD_FIELD, LAND_PART_RESIDENCE_COMPANION_MESSAGE);
  // ① ② D2 증여 호스트 · 소유자 분리·부담부증여 아님
  const d2GiftHost =
    f.isSplitable && f.landAcquisitionCause === "purchase" && f.buildingAcquisitionCause === "gift"
    && (f.selfOwns === undefined || f.selfOwns === "both") && !f.isBurdenedGift;
  if (!d2GiftHost) return at(LAND_PART_DONOR_SAME_HOUSEHOLD_FIELD, LAND_PART_RESIDENCE_GATE_MESSAGE);
  // ④ §155⑳ 거주주택 특례 선언
  if (f.rentalHousingDeclared === true) return at(LAND_PART_DONOR_SAME_HOUSEHOLD_FIELD, LAND_PART_RESIDENCE_RENTAL_20_MESSAGE);

  if (!toggle) return at(LAND_PART_PRIOR_RESIDENCE_MONTHS_FIELD, LAND_PART_RESIDENCE_STRAY_MESSAGE);
  if (months === undefined) return at(LAND_PART_PRIOR_RESIDENCE_MONTHS_FIELD, LAND_PART_RESIDENCE_MONTHS_REQUIRED_MESSAGE);
  if (!Number.isInteger(months) || months < 0) return at(LAND_PART_PRIOR_RESIDENCE_MONTHS_FIELD, LAND_PART_RESIDENCE_MONTHS_INVALID_MESSAGE);

  // 상한 — 날짜가 비면 다른 규칙(토지 취득일 필수 등)이 먼저 짚는다. 그 규칙이 안 걸린 채 날짜만 비는 입력은 없지만, 비었을 때 상한 없이 통과시키지도 않는다.
  const cap = landPartResidenceMaxMonths(f);
  if (!cap) return at(LAND_PART_PRIOR_RESIDENCE_MONTHS_FIELD, LAND_PART_RESIDENCE_MONTHS_NOT_ELIGIBLE_MESSAGE);
  if (months > cap.max) return at(LAND_PART_PRIOR_RESIDENCE_MONTHS_FIELD, landPartResidenceMonthsExceedsMessage(cap.max, cap.startedByDonor));
  return [];
}

/**
 * 엔진이 토지 파트 거주기간 공제율에 **더하는** 개월 수. 토글이 「예」이고 개월 수가 있을 때만 양수다 — 그 밖은 0(종전 계산).
 * 게이트·상한은 `calcSplitGain` 진입의 leaf가 이미 막았으므로 여기서 다시 판정하지 않는다(이 함수는 값만 읽는다).
 */
export function landPartPriorResidenceMonths(
  input: { landPartDonorSameHousehold?: boolean; landPartPriorHouseholdResidenceMonths?: number },
): number {
  if (input.landPartDonorSameHousehold !== true) return 0;
  const m = input.landPartPriorHouseholdResidenceMonths;
  return m !== undefined && Number.isInteger(m) && m > 0 ? m : 0;
}
