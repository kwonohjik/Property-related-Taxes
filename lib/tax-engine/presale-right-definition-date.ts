/**
 * 분양권의 「§88 10호 정의 적용례」 기준 취득일 — §89② 배제와 §104⑦ 주택 수가 **같이** 쓰는 leaf.
 *
 * 법률 제17477호(2020-08-18) 부칙 제4조: 「제89조제2항 본문, 제104조제7항제2호 및 제4호의 개정규정은
 * 2021년 1월 1일 이후 공급계약, 매매 또는 증여 등의 방법으로 취득한 분양권부터 적용한다.」 — 두 축이 한
 * 문장이라 한 날짜로 본다(`isClause2Right` · `isPresaleRightCounted`).
 *
 * ## 상속받은 분양권
 *
 * 행의 `acquisitionDate`는 상속개시일이다. 상속개시 당시 피상속인과 **동일세대**였으면 피상속인이 분양권을
 * 취득한 날로 본다 — 2020.12.31. 이전 취득분을 동일세대원(배우자)이 2021.1.1. 이후 상속받아 종전주택을
 * 양도하면 분양권을 주택 수에 넣지 않고 §155①을 적용한다(기획재정부 재산세제과-1033, 2023.9.4.).
 *
 * 별도세대 상속은 상속개시일 그대로다. 그 경우를 정면으로 다룬 해석을 확보하지 못했다 — 서면-2026-법규재산-0795
 * (2026.6.15.)는 같은 사실관계지만 분양권이 주택으로 완공된 뒤의 §155② 질의다. 피상속인 취득일이 2021.1.1. 전이면
 * 확인 필요로 밝힌다(`inheritedPresaleRightSeparateHouseholdUnverified` — 사용자 결정 2026-10-09).
 *
 * ## §156의3②·③ 기한도 같은 날부터
 *
 * 동일세대 상속 분양권은 「종전주택 취득 후 1년」·「분양권 취득일부터 3년」도 피상속인 취득일부터 센다
 * (`resolveAcquiredRightTiming` · 3년 경과 예외 칸 노출 `rightThreeYearExceptionVisible`). 동일세대 안의 상속은 새로운
 * 취득이 아니라 상속개시일을 신규주택 취득일로 볼 수 없다고 한 사전-2023-법규재산-0464(2023.8.23. — 입주권 · §155①)와
 * 1033의 논리를 분양권에 옮긴 것이다(사용자 결정 2026-10-09). 분양권을 직접 다룬 해석은 미확보라, 상속개시일로 세면
 * 예외가 성립하는 경우에만 확인 필요를 얹는다(`INHERITED_PRESALE_RIGHT_TIMING_START_NOTE`).
 */
import type { PresaleRight } from "./types/multi-house-surcharge.types";

type Row = Pick<
  PresaleRight,
  "type" | "acquisitionDate" | "isInherited" | "decedentSameHouseholdAtInheritance" | "decedentAcquisitionDate"
>;

export function presaleRightDefinitionAcquisitionDate(right: Row): Date {
  if (
    right.type === "presale_right" &&
    right.isInherited === true &&
    right.decedentSameHouseholdAtInheritance === true &&
    right.decedentAcquisitionDate
  ) {
    return right.decedentAcquisitionDate;
  }
  return right.acquisitionDate;
}

/**
 * 별도세대에서 상속받은 분양권 중 피상속인 취득일이 정의 시행일 전인데 상속개시일은 그 뒤라 §89②·§104⑦에
 * 들어간 행 — 해석 미확보라 상속개시일로 판정하고 확인 필요를 밝힌다.
 */
export function inheritedPresaleRightSeparateHouseholdUnverified(right: Row, presaleStartDate: Date): boolean {
  return (
    right.type === "presale_right" &&
    right.isInherited === true &&
    right.decedentSameHouseholdAtInheritance !== true &&
    right.decedentAcquisitionDate !== undefined &&
    right.decedentAcquisitionDate < presaleStartDate &&
    right.acquisitionDate >= presaleStartDate
  );
}

/** 위 경우의 확인 필요 문구 — 판정 메뉴(§89②)·계산기 중과(§104⑦)가 같은 문장을 쓴다. */
export const INHERITED_PRESALE_RIGHT_SEPARATE_HOUSEHOLD_NOTICE =
  "별도세대인 피상속인이 2020년 12월 31일 이전에 취득한 분양권을 2021년 1월 1일 이후 상속받았습니다. " +
  "상속개시일에 분양권을 취득한 것으로 보아 주택 수에 넣어 판정했습니다(법률 제17477호 부칙 제4조). " +
  "동일세대원이 상속받은 경우는 피상속인 취득일로 보아 주택 수에서 빼지만(기획재정부 재산세제과-1033), " +
  "별도세대 상속을 다룬 해석은 확인되지 않았으니 확인이 필요합니다.";
