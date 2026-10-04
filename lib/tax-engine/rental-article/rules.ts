/**
 * §167조의3①2호 목별 판정 상수·룩업 — §155⑳·다주택 중과 단일 소스 (Phase 2 C1).
 *
 * cap·의무기간·경계일을 두 feature가 각자 하드코딩하던 것을 본 파일로 단일화.
 * (이전: rental-housing-exception/eligibility.ts + multi-house-surcharge-count.ts 이중 정의 → F5 divergence 원인.)
 */

import type { SharedRentalArticle } from "./types";
import { isOnOrBeforeDeadline, periodEndFrom } from "../civil-period";
import { TRANSFER_RENTAL_HOUSING } from "../legal-codes";

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
   * ⑪3호 — 그 사업의 「인가 또는 지정」일(가목 재건축 조합설립인가·사업시행자 지정 / 재개발 관리처분계획인가 ·
   * 나목 소규모정비 조합설립인가·사업시행자 지정). 3호는 이 날이 「2027년 12월 31일 이전 또는 제1호나 제2호에
   * 따른 기한 이전」이어야 성립한다. 미제공 = 모름 → 3호 불성립(납세자 불리 · 사용자 결정 2026-10-04 — 모르는 채
   * 유리하게 적용하면 가산세 부담) + 결론을 가를 때 확인 필요 고지.
   */
  relocationAuthorizationDate?: Date;
  /** ⑪3호 — 인가·지정은 있었으나 **양도일 현재 이전고시가 없다** — 이전고시일+1년은 양도일 뒤라 기한 안이다. */
  relocationNotYetAnnounced?: boolean;
  /**
   * ⑪3호 단서 — 도정법 §73·빈집법 §36에 따른 협의·수용재결·매도청구소송으로 양도 → 3호 기한 내 양도로 본다.
   * true 예 · false 아니오 · undefined 모름(기한 경과면 종전 결과 유지 + 확인 필요 고지).
   */
  relocationExpropriationTransfer?: boolean;
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

const validTs = (d?: Date): number | null => {
  const t = d instanceof Date ? d.getTime() : NaN;
  return Number.isNaN(t) ? null : t;
};

/**
 * ⑪ 1·2호까지만 반영한 기한 = max(2027.12.31, 1호 날, 2호 날). 1·2호는 기산일이 2027.1.1 이후일 때만 호가
 * 성립(「2027년 1월 1일 이후 종료」·「신규 지정」) — 그 전 기산일은 이미 바닥보다 이르므로 적용하지 않는다.
 *
 * 3호 「2027년 12월 31일 이전 또는 제1호나 제2호에 따른 기한 이전에 … 인가 또는 지정이 있는 경우」의 비교 기준이
 * 이 값이다 — 세 기준 중 어느 하나 이전이면 되므로(「또는」) 가장 늦은 것과 비교하면 같다. 3호는 이 값에
 * 의존하지만 이 값은 3호에 의존하지 않는다(순환 없음).
 */
function resolveDeadlineBy1And2(ext?: AptTransferDeadlineExtension): number {
  let deadline = APT_TRANSFER_DEADLINE_FLOOR;
  const d1 = validTs(ext?.dutyPeriodEndCancellationDate);
  if (d1 != null && d1 >= Y2027_01_01) deadline = Math.max(deadline, oneYearDayFrom(d1));
  const d2 = validTs(ext?.newRegulatedAreaAnnouncementDate);
  if (d2 != null && d2 >= Y2027_01_01) deadline = Math.max(deadline, oneYearDayFrom(d2));
  return deadline;
}

/** ⑪3호 사업 사실이 있는가 — 인가·지정일 · 이전고시일 · 「이전고시 전」 중 하나 */
export function hasRelocationFact(ext?: AptTransferDeadlineExtension): boolean {
  return (
    validTs(ext?.relocationAuthorizationDate) != null ||
    validTs(ext?.relocationAnnouncementDate) != null ||
    ext?.relocationNotYetAnnounced === true
  );
}

/**
 * ⑪3호 인가·지정 시점 조건 — 인가·지정일이 1·2호까지의 기한 **이전**(그날 포함)인가. 모르면 null.
 * 「이전」은 기준일을 포함한다(법령 용어 관례 — 1·2호 「2027년 1월 1일 이후」를 `>=`로 읽는 이 파일의 처리와 같다).
 * 인가·지정은 납세자의 행위 기한이 아니라 시점 요건이라 민법 §161(말일 연장)은 적용하지 않는다.
 */
function relocationAuthorizationTimely(ext: AptTransferDeadlineExtension | undefined, by12: number): boolean | null {
  const auth = validTs(ext?.relocationAuthorizationDate);
  return auth == null ? null : auth <= by12;
}

/**
 * ⑪ 판정 보류 사유.
 * - NO_FACT: 바닥 초과인데 연장 사실도 「연장 사유 없음」 확인도 없다(#1910) — 종전 기준(기한 내) 유지
 * - AUTH_DATE_UNKNOWN: 인가·지정일을 몰라 3호를 적용하지 않았는데(기한 경과), 3호가 성립했다면 기한 안이었다
 * - EXPROPRIATION_UNKNOWN: 3호 기한마저 지났는데 단서(협의·수용재결·매도청구소송) 해당 여부를 모른다 — 기한 경과 유지
 *
 * 3호의 「모름」은 납세자 불리로 적용한다(사용자 결정 2026-10-04 — 모르는 채 유리하게 적용하면 가산세 부담).
 * NO_FACT(#1910)는 이 결정의 범위 밖이라 종전대로 둔다.
 */
export type AptDeadlinePendingReason = "NO_FACT" | "AUTH_DATE_UNKNOWN" | "EXPROPRIATION_UNKNOWN";

export interface AptDeadlineVerdict {
  /** 기한 내 양도로 판정(NO_FACT 판정 보류로 기한 내 유지 포함) */
  within: boolean;
  /** 결론을 가른 미확인 사실 — 비어 있으면 확정 판정 */
  pending: AptDeadlinePendingReason[];
}

/**
 * 3호가 성립한다고 보고(인가·지정 시점 충족) 1·2호 기한(`by12`)을 이미 넘긴 양도를 판정한다.
 * 이전고시일도 「이전고시 전」도 없으면 3호 기한을 정할 수 없어 3호 불성립으로 본다 — ⑧·⑫가 둘 중 하나를
 * 필수로 받으므로 route 경유로는 오지 않는다(엔진 직접 호출 방어 · 모름 = 불리 원칙과 같은 방향).
 */
function judgeWithRelocation(transferDate: Date, ext: AptTransferDeadlineExtension, by12: number): AptDeadlineVerdict {
  if (ext.relocationExpropriationTransfer === true) return { within: true, pending: [] };
  if (ext.relocationNotYetAnnounced === true) return { within: true, pending: [] };
  const d3 = validTs(ext.relocationAnnouncementDate);
  if (d3 == null) return { within: false, pending: [] };
  if (isOnOrBeforeDeadline(transferDate, new Date(Math.max(by12, oneYearDayFrom(d3))))) {
    return { within: true, pending: [] };
  }
  return {
    within: false,
    pending: ext.relocationExpropriationTransfer === undefined ? ["EXPROPRIATION_UNKNOWN"] : [],
  };
}

/**
 * ⑪ 기한 판정 — 2호 가·나·라·마목 · 3호 후단 · §155⑳ 공용 단일 함수.
 *
 * 1. 연장 사실·「없음」 확인이 전무 → 바닥 초과면 NO_FACT(기한 내 유지 · #1910 종전 그대로).
 * 2. 1·2호까지의 기한 안(민법 §161 포함) → 기한 내 · 고지 없음(3호 사실은 결론과 무관).
 * 3. 3호 사업 사실 없음 · 인가·지정이 그 기한 뒤 → 기한 경과(3호 주택이 아니므로 단서도 없다).
 * 4. 인가·지정 시점 충족 → 단서 「예」·「이전고시 전」·이전고시일+1년 안이면 기한 내, 아니면 경과(단서 모름이면 고지).
 * 5. 인가·지정일 모름 → 3호 불성립(기한 경과). 3호가 성립했다면 결론이 달라졌을 때만 AUTH_DATE_UNKNOWN
 *    (단서 모름까지 겹치면 둘 다).
 *
 * 기한 = 2027.12.31과 해당 호에서 정하는 날 중 가장 늦은 날(역상 날짜). 양도일은 기한 **당일까지** — 기한 말일이
 * 토요일·공휴일이면 익일까지(민법 §161 · §155의3① 선례 `isOnOrBeforeDeadline`과 같은 처리. ⑪ 신설 문언에 대한
 * 직접 해석례는 없다 — 확인 필요).
 */
export function judgeAptTransferDeadline(transferDate: Date, ext?: AptTransferDeadlineExtension): AptDeadlineVerdict {
  if (!ext || !hasAnyAptDeadlineExtensionFact(ext)) {
    return { within: true, pending: transferDate.getTime() > APT_TRANSFER_DEADLINE_FLOOR ? ["NO_FACT"] : [] };
  }
  const by12 = resolveDeadlineBy1And2(ext);
  if (isOnOrBeforeDeadline(transferDate, new Date(by12))) return { within: true, pending: [] };

  if (!hasRelocationFact(ext)) return { within: false, pending: [] };
  const timely = relocationAuthorizationTimely(ext, by12);
  if (timely === false) return { within: false, pending: [] };
  const if3 = judgeWithRelocation(transferDate, ext, by12);
  if (timely === true) return if3;
  // 인가·지정일 모름 — 3호 불성립. 성립했다면 기한 안이었거나(또는 단서까지 확인되면 그랬을 수) 있으면 고지.
  if (if3.within) return { within: false, pending: ["AUTH_DATE_UNKNOWN"] };
  return { within: false, pending: if3.pending.length ? [...if3.pending, "AUTH_DATE_UNKNOWN"] : [] };
}

const ART_11_3 = `${TRANSFER_RENTAL_HOUSING.PIT_RD_167_3_11}3호`;

/**
 * ⑪3호 판정 보류 고지 문구(NO_FACT 외) — 2호 다주택 `warnings` · 3호 후단 `warnings` · §155⑳ `notices` 공용.
 * NO_FACT 문구는 경로마다 종전 문구를 그대로 쓴다(#1910).
 */
export function aptDeadlineConfirmNotice(reason: Exclude<AptDeadlinePendingReason, "NO_FACT">): string {
  switch (reason) {
    case "AUTH_DATE_UNKNOWN":
      return (
        `${ART_11_3} — 재건축사업 조합설립인가·재개발사업 관리처분계획인가 등 인가 또는 지정이 2027.12.31. 또는 ` +
        "1호·2호에 따른 기한 이전에 있었다면 기한이 이전고시일부터 1년이 되는 날까지 늘어납니다. 인가·지정일을 몰라 " +
        "3호 연장 없이 계산했습니다 — 확인 필요."
      );
    case "EXPROPRIATION_UNKNOWN":
      return (
        `${ART_11_3} 단서 — 해당 사업의 대상 주택을 ${TRANSFER_RENTAL_HOUSING.URBAN_RENOVATION_ART_73} 또는 ` +
        `${TRANSFER_RENTAL_HOUSING.SMALL_HOUSING_ART_36}에 따른 협의, 수용재결 또는 매도청구소송으로 양도했다면 ` +
        "기한 내에 양도한 것으로 봅니다. 해당 여부를 몰라 기한이 지난 것으로 계산했습니다 — 확인 필요."
      );
  }
}

/**
 * ⑪ 연장 사실을 「안다」고 볼 수 있는가 — 세 호 중 유효한 사실(날짜 · 3호 인가·지정일 · 「이전고시 전」)이 하나라도 있거나, 「연장 사유 없음」을
 * 확인했으면(`confirmedNone`) 참. 둘 다 아니면 「날짜 미제공」과 「연장 사실 없음(실제로 바닥만 적용)」을
 * 구별하지 못하므로, 법 근거 없이 불리 적용(2027.12.31 바닥만 적용해 중과)하지 않도록 호출부가 판정 보류한다
 * (`judgeAptTransferDeadline`과 쌍).
 */
export function hasAnyAptDeadlineExtensionFact(ext?: AptTransferDeadlineExtension): boolean {
  if (!ext) return false;
  if (ext.confirmedNone === true) return true;
  return (
    validTs(ext.dutyPeriodEndCancellationDate) != null ||
    validTs(ext.newRegulatedAreaAnnouncementDate) != null ||
    hasRelocationFact(ext)
  );
}
