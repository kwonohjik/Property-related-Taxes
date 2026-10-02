/**
 * §167조의3①2호 목별 판정 상수·룩업 — §155⑳·다주택 중과 단일 소스 (Phase 2 C1).
 *
 * cap·의무기간·경계일을 두 feature가 각자 하드코딩하던 것을 본 파일로 단일화.
 * (이전: rental-housing-exception/eligibility.ts + multi-house-surcharge-count.ts 이중 정의 → F5 divergence 원인.)
 */

import type { SharedRentalArticle } from "./types";
import { isOnOrBeforeDeadline, periodEndFrom } from "../civil-period";

/** 목별 판정 경계일 (getTime() 캐시) */
export const RA_CUT = {
  Y2003_10_29: new Date("2003-10-29").getTime(), // 나목 기존사업자 등록 상한(사업자등록일 기준)
  Y2008_06_11: new Date("2008-06-11").getTime(), // 라목 미분양 최초 분양계약일 하한
  Y2009_06_30: new Date("2009-06-30").getTime(), // 라목 미분양 최초 분양계약일 상한
  Y2018_04_02: new Date("2018-04-02").getTime(), // 가·다목 등록 상한(다주택 checkRentalType_A/C — §155⑳ derive는 2020.7.11 경계라 공용 predicate 미적용)
  Y2019_02_12: new Date("2019-02-12").getTime(), // 가·다·마·바 5% 문언 시행 — 대통령령 제29523호 부칙 제6조(계약)·제2조②(양도)
  Y2020_07_11: new Date("2020-07-11").getTime(), // 매입 장기 아파트 제한 개시
  Y2020_08_18: new Date("2020-08-18").getTime(), // 마·바 의무기간 8→10년 / 사목 말소일 하한
  Y2025_02_28: new Date("2025-02-28").getTime(), // 바목 cap 6억→9억 (다주택 tested·MCP amendment_track 미확인 — 확인 필요)
  Y2025_06_04: new Date("2025-06-04").getTime(), // 아·자 단기 6년 신설(등록기준일 하한)
} as const;

/**
 * 목·지역·등록기준일별 기준시가 상한(원).
 * @param isCapital 수도권 여부
 * @param effRegTs  등록기준일 getTime() = max(세무서, 지자체). 바목 6억/9억 경계 판정용.
 *
 * 가/마/구법: 6억(수도권)·3억 | 나/라: 취득당시 3억(지역무관) | 다/자: 6억 | 바: 6억(→2025.2.28↑ 9억) | 아: 4억(수도권)·2억.
 */
export function rentalStdPriceCap(
  article: SharedRentalArticle,
  isCapital: boolean,
  effRegTs: number,
): number {
  switch (article) {
    case "가":
    case "마":
    case "구법":
      return isCapital ? 600_000_000 : 300_000_000;
    case "나":
    case "라":
      return 300_000_000; // 취득당시 3억 (지역무관)
    case "다":
    case "자":
      return 600_000_000;
    case "바":
      // F5: 2025.2.28 이후 등록분 9억, 이전 6억 (다주택 checkRentalType_F 정합)
      return effRegTs >= RA_CUT.Y2025_02_28 ? 900_000_000 : 600_000_000;
    case "아":
      return isCapital ? 400_000_000 : 200_000_000;
    default:
      return 600_000_000;
  }
}

/**
 * 목·등록기준일별 의무임대기간(년).
 * 가/나/다/라/구법: 5 | 마/바: ≤2020.8.17 준용 8·이후 10 | 아/자: 6.
 */
export function rentalRequiredYears(article: SharedRentalArticle, effRegTs: number): number {
  switch (article) {
    case "가":
    case "나":
    case "다":
    case "라":
    case "구법":
      return 5;
    case "아":
    case "자":
      return 6;
    case "마":
    case "바":
      return effRegTs < RA_CUT.Y2020_08_18 ? 8 : 10;
    default:
      return 10;
  }
}

// ============================================================
// §167조의3⑪ — 가목2)·나목2)·라목8)·마목4) 「제11항에 따른 기한」 (대통령령 제36737호,
// 2026.9.30. 공포·2026.10.1. 시행 신설). 아파트인 매입장기(가·마)·기존사업자(나)·미분양매입(라)는
// 이 기한까지 양도해야 §167조의3①2호 해당 목으로 인정된다(사목에 해당하면 사목 자체 양도기한 적용 — 단서).
// ============================================================

/** 가목2)·나목2)·라목8)·마목4) 게이트 대상 목. 다·바·아·자·구법·사는 대상 아님. */
export const APT_DEADLINE_GATED_ARTICLES: readonly SharedRentalArticle[] = ["가", "나", "라", "마"];

/** ⑪ 바닥 — 「제11항에 따른 기한은 2027년 12월 31일로 한다」. */
export const APT_TRANSFER_DEADLINE_FLOOR = new Date("2027-12-31").getTime();

const Y2027_01_01 = new Date("2027-01-01").getTime();

/** ⑪ 각 호가 바닥을 밀어 올리는 기산일. 그 호의 사실이 없으면(미제공) 해당 호는 적용하지 않는다. */
export type AptTransferDeadlineExtension = {
  /** ⑪1호 — 민특법§43 임대의무기간이 2027.1.1 이후 종료되는 주택의 등록말소일(같은 법 §6⑤) */
  dutyPeriodEndCancellationDate?: Date;
  /** ⑪2호 — 2027.1.1 이후 조정대상지역 신규 지정(2026.12.31 현재 지정지역은 제외) 공고일 */
  newRegulatedAreaAnnouncementDate?: Date;
  /** ⑪3호 — 재건축 조합설립인가·재개발 관리처분계획인가·소규모정비 조합설립인가에 따른 이전고시일 */
  relocationAnnouncementDate?: Date;
  /**
   * ⑪ 각 호 어디에도 해당하지 않음을 **사용자가 확인했다** — 기한은 바닥(2027.12.31.)으로 확정된다.
   * 날짜 미제공(「모름」 → 판정 보류)과 가르기 위한 명시 신호다. 날짜와 함께 오지 않는다(⑫ refine).
   */
  confirmedNone?: boolean;
};

/**
 * 「~부터 1년이 되는 날」(⑪ 각 호) — 초일불산입(민법 §157)·역에 의한 계산(§160). §155의3① 「~1년이 되는 날」과
 * 같은 헬퍼(`periodEndFrom`)를 쓴다(국세기본법 §4 → 민법).
 */
function oneYearDayFrom(ts: number): number {
  return periodEndFrom(new Date(ts), 1).getTime();
}

/**
 * §167조의3⑪ 「제11항에 따른 기한」 = 2027.12.31과 해당 호에서 정하는 날 중 가장 늦은 날(역상 날짜).
 * 1·2호는 기산일이 2027.1.1 이후일 때만 호가 성립(「2027년 1월 1일 이후 종료」·「신규 지정」)
 * — 그 전 기산일은 이미 바닥(2027.12.31)보다 이르므로 적용하지 않는다. 3호는 기산일(이전고시일) 자체에
 * 그런 하한이 없다(3호 본문의 인가 시점요건은 바닥보다 느슨해 보수적으로 생략 — 확인 필요).
 * 양도일 비교는 `isWithinAptTransferDeadline`(민법 §161 말일 연장 포함)을 쓴다.
 */
export function resolveAptTransferDeadline(ext?: AptTransferDeadlineExtension): number {
  let deadline = APT_TRANSFER_DEADLINE_FLOOR;
  const d1 = ext?.dutyPeriodEndCancellationDate?.getTime();
  if (d1 != null && !Number.isNaN(d1) && d1 >= Y2027_01_01) deadline = Math.max(deadline, oneYearDayFrom(d1));
  const d2 = ext?.newRegulatedAreaAnnouncementDate?.getTime();
  if (d2 != null && !Number.isNaN(d2) && d2 >= Y2027_01_01) deadline = Math.max(deadline, oneYearDayFrom(d2));
  const d3 = ext?.relocationAnnouncementDate?.getTime();
  if (d3 != null && !Number.isNaN(d3)) deadline = Math.max(deadline, oneYearDayFrom(d3));
  return deadline;
}

/**
 * 양도일이 ⑪ 기한 **당일까지**인가 — 기한 말일이 토요일·공휴일이면 익일까지(민법 §161 · §155의3① 선례
 * `isOnOrBeforeDeadline`과 같은 처리. ⑪ 신설 문언에 대한 직접 해석례는 없다 — 확인 필요).
 */
export function isWithinAptTransferDeadline(transferDate: Date, ext?: AptTransferDeadlineExtension): boolean {
  return isOnOrBeforeDeadline(transferDate, new Date(resolveAptTransferDeadline(ext)));
}

/**
 * ⑪ 연장 사실을 「안다」고 볼 수 있는가 — 세 호 중 유효한 날짜가 하나라도 있거나, 「연장 사유 없음」을
 * 확인했으면(`confirmedNone`) 참. 둘 다 아니면 「날짜 미제공」과 「연장 사실 없음(실제로 바닥만 적용)」을
 * 구별하지 못하므로, 법 근거 없이 불리 적용(2027.12.31 바닥만 적용해 중과)하지 않도록 호출부가 판정 보류한다
 * (`resolveAptTransferDeadline`과 쌍).
 */
export function hasAnyAptDeadlineExtensionFact(ext?: AptTransferDeadlineExtension): boolean {
  if (!ext) return false;
  if (ext.confirmedNone === true) return true;
  const valid = (d?: Date) => d instanceof Date && !Number.isNaN(d.getTime());
  return (
    valid(ext.dutyPeriodEndCancellationDate) ||
    valid(ext.newRegulatedAreaAnnouncementDate) ||
    valid(ext.relocationAnnouncementDate)
  );
}
