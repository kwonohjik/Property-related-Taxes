/**
 * 비사업용 토지 판정 숫자의 **기준일 축별 연혁 leaf** (NBL2611-V3-PR01 · V3-PR05 · V8-VL01, 리뷰 2026-11 §7.3 「연혁 leaf 표준」).
 *
 * 세 값은 「현행 숫자 리터럴 + 선택적 날짜 인자」로 박혀 있어 **양도일·고시일이 옛 시행본에 속하는 사건**을 현행값으로 계산했다.
 * 엔진 · 화면 어댑터(`lib/calc/nbl-unconditional-exemption-status.ts`)가 이 파일만 읽는다 — 숫자를 다른 곳에 두지 않는다.
 * 모든 판정은 `utc-date` UTC 자정 달력일끼리의 비교다(서버 시간대 무관).
 *
 * | 값 | 기준일 | 연혁 (KoreanLaw 시행본·부칙 원문 실독, 2026-11-19) |
 * |---|---|---|
 * | 공익수용 의제 「취득일이 사업인정고시일부터 N년 이전」 (영 §168의14③3호) | 양도일 → 고시일 | 양도 **2014.2.21. 전**: 5년 — 2014.1.1. 시행본(제24574호) 「취득일(…법 제97조제4항을 적용받는 경우에는 …)이 사업인정고시일부터 5년 이전인 토지」(2008.12.31. 시행본부터 5년 · 그 전 2008.10.7.~12.30.은 10년이었으나 2009.3.16. 전 양도분은 이 저장소 범위 밖).<br>양도 **2014.2.21. 이후**: 제25193호(2014.2.21.) 개정이 5년→**2년** — 부칙 제2조② 「양도소득에 관한 개정규정은 이 영 시행 후 최초로 양도하는 분부터」. 이 2년 문언은 2021.5.3. 시행본까지 유지.<br>**고시일 2021.5.4. 이후**: 제31659호(2021.5.4.)가 5년으로 되돌리며 가목(2006.12.31. 이전 고시)·나목(5년)으로 나눔 — 부칙 제4조 「부칙 제1조 단서의 시행일(공포일 2021.5.4.) 이후 사업인정고시되는 사업에 따라 협의매수 또는 수용되는 토지부터」. 즉 **그 전에 고시된 사업은 양도가 언제든 2년**(국세청 사전-2023-법규재산-0142). |
 * | 규칙 §83의5①9호 「건축물이 멸실·철거되거나 무너진 날부터 N년」 | 양도일 | 양도 **2025.3.21. 전**: **2년**(2009.4.14. 시행본 · 2025.3.20. 시행본 동일). 제1124호(2025.3.21.) 개정 5년 — 부칙 제4조 「이 규칙 시행 이후 토지를 양도하는 경우부터」. |
 * | 영 §168의13 2호 별장 농어촌주택 「기준시가 N원 이하」 | 양도일 | 양도 **2015.2.3. 전**: **1억원**(2009.2.4.·2010.2.18.·2011.1.1.·2015.1.1. 시행본). 제26067호(2015.2.3.) 개정 2억원 — 부칙 제2조② 「양도소득에 관한 개정규정은 이 영 시행 이후 최초로 양도하는 분부터」. |
 *
 * ⚠️ 한계(확인 필요)
 *   · 부칙의 「시행 후 최초로 양도하는 분」은 시행일 당일 양도를 포함하는 것으로 읽었다(`>=`). 당일 경계는 해석례를 확인하지 못했다.
 *   · 별장의 「조세특례제한법」 §99의4①1호가목 지역 열거는 연혁이 있다(2016.1.1. 4개 목 — 수도권·도시지역 및 허가구역·지정지역·그 밖 → 2023.12.21. 시행본 5개 목 — 조정대상지역·허가구역 분리·인구감소지역 예외).
 *     영 §168의13 3호 문언(「가목1)부터 4)까지」)은 그대로라 목 재편 시점을 거쳐 가리키는 지역이 바뀐다 — 사용자가 입력하는 「제외지역 해당」 선언이라 세액은 바꾸지 않고 고지만 한다(`VILLA_REGION_LIST_EVOLVED_NOTICE`).
 *   · 2008.1.1.~2009.3.15. 양도분(2008.10.7. 「10년」·2008.12.31. 소급 부칙)은 범위 밖(양도 2009.3.15. 이전 = 범위 밖)이라 모델링하지 않았다.
 */
import { isWithinPeriod } from "../civil-period";
import { addYears, isBefore, isValid, parseISO } from "../utc-date";
import { NBL } from "../legal-codes/transfer-nbl";

// UTC 자정 달력일 상수 — 입력 Date도 같은 규약(utc-date). Invalid Date(미입력)는 비교가 모두 false라 «가장 최근 시행본»으로 접힌다(조기 확정 방지 규약과 동일).
const FROM_2014_02_21 = parseISO("2014-02-21");
const FROM_2021_05_04 = parseISO("2021-05-04");
const FROM_2025_03_21 = parseISO("2025-03-21");
const FROM_2015_02_03 = parseISO("2015-02-03");
// 지방세법 시행령 §103의2 «철거ㆍ멸실된 건축물 또는 주택의 범위» — **적용 시작 과세기준일**(부칙 «납세의무가 성립하는 분부터» — 과세기준일 6.1.).
const FROM_2016_06_01 = parseISO("2016-06-01");
const FROM_2019_06_01 = parseISO("2019-06-01");
const FROM_2024_06_01 = parseISO("2024-06-01");
const FROM_2026_06_01 = parseISO("2026-06-01");

export type PublicNoticeLookbackEra = "five_year_pre_2014" | "two_year" | "five_year_2021";

export interface PublicNoticeLookback {
  /** 「취득일이 사업인정고시일부터 N년 이전」의 N */
  years: 2 | 5;
  era: PublicNoticeLookbackEra;
  /** 결과 카드·배지에 그대로 쓰는 법령 근거 (시행본별로 호·목 구조가 다르다) */
  legalBasis: string;
}

/**
 * 영 §168의14③3호 「취득일이 사업인정고시일부터 N년 이전」의 N.
 *
 * @param transferDate 양도일 — 2014.2.21. 전이면 5년(구 문언)
 * @param noticeDate   사업인정고시일 — 2021.5.4. 전이면 2년(부칙 제31659호 제4조)
 */
export function publicNoticeLookback(transferDate: Date, noticeDate: Date): PublicNoticeLookback {
  if (transferDate < FROM_2014_02_21) {
    return { years: 5, era: "five_year_pre_2014", legalBasis: NBL.UNCONDITIONAL_PUBLIC_ACQ_5Y_PRE_2014 };
  }
  if (noticeDate < FROM_2021_05_04) {
    return { years: 2, era: "two_year", legalBasis: NBL.UNCONDITIONAL_PUBLIC_ACQ_2Y };
  }
  return { years: 5, era: "five_year_2021", legalBasis: NBL.UNCONDITIONAL_PUBLIC_ACQ_5Y };
}

/** 규칙 §83의5①9호 건축물 멸실·철거·붕괴 유예 연수 — 양도일 2025.3.21. 전 2년, 이후 5년. */
export function demolitionGraceYears(transferDate: Date): 2 | 5 {
  return transferDate < FROM_2025_03_21 ? 2 : 5;
}

/** 영 §168의13 2호 별장 농어촌주택 기준시가 한도(원) — 양도일 2015.2.3. 전 1억원, 이후 2억원. */
export function villaRuralValueLimit(transferDate: Date): 100_000_000 | 200_000_000 {
  return transferDate < FROM_2015_02_03 ? 100_000_000 : 200_000_000;
}

/**
 * 영 §168의13 2호 기준시가 한도의 **입력 칸 안내 문구** — 화면이 「2억원 이하」를 고정으로 쓰지 않게 한다(NBL2611-V8-VL01 화면 잔여).
 * 양도일이 없으면 추정하지 않고 현행 한도와 연혁 사실을 함께 밝힌다.
 */
export function villaRuralValueLimitHint(transferDate: Date | undefined): string {
  if (!transferDate) return "2억원 이하 (양도일 2015.2.3. 전 양도분은 1억원 이하 — 양도일 미입력, 현행 기준)";
  return `${villaRuralValueLimit(transferDate) / 100_000_000}억원 이하`;
}

/** 별장 농어촌주택의 「제외지역」 선언이 읽는 조특법 §99의4①1호가목 열거 지역이 시기마다 달랐음을 알리는 고지(세액 불변). */
export const VILLA_REGION_LIST_EVOLVED_NOTICE =
  "「조세특례제한법」 §99의4①1호가목의 제외지역 열거(영 §168의13 3호가 가리킨다)는 시행본마다 달라졌습니다(2016.1.1. 시행본은 수도권·도시지역 및 허가구역·지정지역·그 밖 4개 목, " +
  "2023.12.21. 시행본은 수도권·도시지역·조정대상지역·허가구역·그 밖 5개 목). 입력하신 「제외지역 해당 여부」가 양도일 시행본 기준인지 확인이 필요합니다.";

// ─────────────────────────────────────────────────────────────────────────────
// 지방세법 시행령 §103의2 — 철거ㆍ멸실 후 재산세 한시 지위(별도합산) 시행본 연혁 (NBL-STATE-HISTORY-E3-⑤ E3f-1a · 계획서 §1.2~§1.3 · KoreanLaw 시행본·부칙 원문 실독 2026-11-24)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 시행본 연혁 — 한시 지위는 **과세기준일마다 그날의 시행본**으로 정해진다(법문 «과세기준일 현재» + 영 부칙 «납세의무가 성립하는 분부터»).
 *
 * | era | 적용 시작 과세기준일 | 시행본 본문 |
 * |---|---|---|
 * | `not_yet` | — (2016.6.1. 전) | 2016.1.1. 시행본(제26836호)의 §103의2는 «이 영 시행 이후 최초로 납세의무가 성립하는 분부터»(부칙 제2조) — 첫 과세기준일 2016.6.1. |
 * | `six_month` | 2016.6.1. | «6개월이 지나지 아니한 건축물 또는 주택의 부속토지» |
 * | `permit` | 2019.6.1. | + «허가 등을 받지 않은 …·사용승인(임시사용승인 포함)을 받지 않은» 건축물·주택 제외(제29437호 제2조) |
 * | `vacant_house` | 2024.6.1. | + 빈집정비사업 등 철거 빈집 **3년**(제34080호 제6조) · 2024.5.28. 호 구분(1호 6개월 + **건축 용도 외 사용 제외 + 종전 바닥면적 × §101② 배율** · 2호 빈집 3년 — 제34528호 제4조) |
 * | `one_year` | 2026.6.1. | 1호 6개월 → **1년**(제36043호 제13조) |
 *
 * ⚠️ 이 era는 **고지 문구 선택**용이다 — 양도일 ≥ 경계 비교. 판정(창·게이트)에는 쓰지 않는다(E3f-1b·2가 과세기준일별 W를 따로 계산한다 — 양도일·철거일 시행본으로 W를 정하면 틀린다: 계획서 §1.3).
 * 양도일 Invalid Date는 비교가 모두 false라 «가장 최근 시행본»(`one_year`)으로 접힌다 — 호출자(`demolishedStatusNotice`)가 미입력은 이 함수 앞에서 거른다.
 */
export type DemolishedStatusEra = "not_yet" | "six_month" | "permit" | "vacant_house" | "one_year";

export function demolishedStatusEra(transferDate: Date): DemolishedStatusEra {
  if (transferDate < FROM_2016_06_01) return "not_yet";
  if (transferDate < FROM_2019_06_01) return "six_month";
  if (transferDate < FROM_2024_06_01) return "permit";
  if (transferDate < FROM_2026_06_01) return "vacant_house";
  return "one_year";
}

/** 양도일이 입력됐는가 — 미입력(undefined)·Invalid Date는 연혁을 단정하지 않는다. */
export function hasDemolishedStatusEraDate(transferDate: Date | undefined): transferDate is Date {
  return transferDate !== undefined && isValid(transferDate);
}

/**
 * «빈집 3년 셀» — 철거ㆍ멸실일 `removedOn`이 [2021.6.1., 2022.6.1.]이고 양도일이 [2024.6.1., 2025.3.21.)인가.
 * 과세기준일 2024.6.1. 현재 빈집정비 3년 한시는 «철거ㆍ멸실된 날부터 3년이 지나지 아니한» 기간 안(만료일 당일까지 — 민법 §157·§160, `isWithinPeriod`: 철거 2021.6.1. → 만료일 2024.6.1. → 안)이면 성립 가능하고, 그날을 건축물 멸실 유예 9호(양도 2025.3.21. 전 2년 — `demolitionGraceYears`)
 * `[removedOn, removedOn + 2년)`이 덮지 못하는 것은 `removedOn + 2년 ≤ 2024.6.1.`일 때다. 이 셀의 판정 뒤집힘은 격자로 실측했다(E3f-0 Anchor 3 — 판정 뒤집힘 356행이 전부 이 셀 안).
 * 날짜 중 하나가 Invalid Date면 false.
 */
export function isVacantHouseThreeYearCell(removedOn: Date, transferDate: Date): boolean {
  return isWithinPeriod(removedOn, 3, FROM_2024_06_01) && removedOn <= addYears(FROM_2024_06_01, -2) && transferDate >= FROM_2024_06_01 && transferDate < FROM_2025_03_21;
}

// ─────────────────────────────────────────────────────────────────────────────
// E3f-1b — 꼬리 근거 «철거ㆍ멸실»의 «확실히 지남» 충분조건 · 면적 범위 문언 시행본 (계획서 §5.3 · Q-6 (가) · 사용자 결정 2026-11-24)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 양도일 이전(당일 포함) **마지막 과세기준일(매년 6.1.)** — 한시 지위는 과세기준일 현재로 정해지므로(법문 «과세기준일 현재») 꼬리 근거는 이 날의 지위를 본다.
 * 양도일이 Invalid Date면 `undefined`.
 */
export function lastPropertyTaxBaseDateOnOrBefore(transferDate: Date): Date | undefined {
  if (!isValid(transferDate)) return undefined;
  const y = transferDate.getUTCFullYear();
  const thisYear = parseISO(`${String(y).padStart(4, "0")}-06-01`);
  return isBefore(transferDate, thisYear) ? parseISO(`${String(y - 1).padStart(4, "0")}-06-01`) : thisYear;
}

/**
 * 과세기준일 `s` 시행본에서 한시 기간이 **가장 길 수 있는** 개월 수 — 꼬리 근거는 빈집정비 여부를 따로 받지 않아 보수적으로 잡는다(Q-6 (가)).
 * `0` = 그 과세기준일에는 한시 규정이 없다(2016.6.1. 전 — 시행령 §103의2 시행 전) · `6` = 2016.6.1.~2024.5.31. 시행본 · `36` = 2024.6.1.~ 시행본(빈집정비사업 철거 빈집 3년 — 일반 6개월·2026.6.1.~ 1년보다 길다).
 */
export function demolishedStatusMaxMonths(s: Date): 0 | 6 | 36 {
  if (isBefore(s, FROM_2016_06_01)) return 0;
  return isBefore(s, FROM_2024_06_01) ? 6 : 36;
}

/**
 * 영 §103의2 1호 후단 «철거ㆍ멸실되기 전 건축물의 바닥면적에 제101조제2항에 따른 용도지역별 적용배율을 곱하여 산정한 면적 범위의 토지» 문언이 **그 과세기준일 시행본에 있는가**.
 * 2024.5.28. 시행본(호 구분)에서 처음 생겼고 첫 과세기준일은 2024.6.1.이다(사용자 결정 2026-11-24 — 그 전 시행본에는 면적 제한이 없다 · 부속토지 범위 자체는 «확인 필요»).
 * 꼬리 근거는 양도일 이전 마지막 과세기준일의 시행본으로 본다(= 양도일 ≥ 2024.6.1.). 양도일이 없거나 해석 불가면 현행(= 문언 있음)으로 접는다 — 입력 누락이 면적 제한을 푸는 방향으로 작동하지 않게.
 */
export function demolishedAreaClauseApplies(transferDate: Date | undefined): boolean {
  if (!hasDemolishedStatusEraDate(transferDate)) return true;
  const s = lastPropertyTaxBaseDateOnOrBefore(transferDate);
  return s !== undefined && !isBefore(s, FROM_2024_06_01);
}
