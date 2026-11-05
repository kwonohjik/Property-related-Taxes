/**
 * 조특법 §99의3 — 시기 축 leaf (법률 제6762호 부칙 §29 · 리뷰 NH-01 · NH-04)
 *
 * 2003.1.1. 시행본(법률 제6762호)부터 §99의3①에 «대통령령으로 정하는 지역 외의 지역» 요건과 «고가주택» 단서가
 * 들어왔다. 종전 규정(2002.11.27. 시행본, MST 58080)에는 지역 제외가 없고 단서는 «고급주택»이었다.
 *
 * - 부칙 §29① — 2003.1.1. 전에 계약금을 납부(1호)했거나 사용승인(2호)을 받은 신축주택 → 종전의 규정,
 *   그 계약·승인일 당시의 고급주택 기준.
 * - 부칙 §29② — 2호로서 2003.1.1. 전에 공사에 착수하여 2003.6.30. 이전에 사용승인을 받은 신축주택 → 종전의 규정.
 *   해석: 재정경제부 재산세제과-96(2007.1.6.) — 이 경우 과세특례가 배제되는 고가(고급)주택 판정 기준도 종전 규정.
 * - 그 밖(개정규정 적용분)의 고가주택은 양도 당시 소득세법 §89①3호 기준 — 재산세과-3466(2008.10.24.).
 *   (2008.10.7.~ 9억 · 2021.12.8.~ 12억. 소득세법 시행령 §156 2003.1.1. 시행본은 6억)
 *
 * 착공 여부(§29② 요건)는 3-state — «모름»·미입력은 §29② 불성립(개정규정 적용) + 확인 필요(자동으로 종전 규정을 적용하지 않는다).
 */

import { NEW_99_DECREE_ADDENDA_26959 } from "../legal-codes/transfer-house";

/** UTC 자정 파싱 — API 경유 입력(new Date("YYYY-MM-DD") = UTC midnight)과 같은 기준. */
const D = (s: string) => new Date(s);

/** 법률 제6762호 시행일 — 이 날 이후 계약·승인분은 원칙적으로 개정규정(지역 제외·고가주택 단서). */
const AMENDED_EFFECTIVE_ISO = "2003-01-01";
/** 부칙 §29② 사용승인 상한 */
const ADDENDA_29_2_APPROVAL_END_ISO = "2003-06-30";
const AMENDED_EFFECTIVE = D(AMENDED_EFFECTIVE_ISO);
const ADDENDA_29_2_APPROVAL_END = D(ADDENDA_29_2_APPROVAL_END_ISO);
/**
 * §29② 해당분의 «종전 고급주택 기준» 기준일 — 소득세법 시행령 §156(2002.10.1. 시행본: 공동주택 149㎡ 이상 + 6억 초과)의
 * 마지막 시행일. 2003.1.1.부터는 «고가주택 6억 초과»로 바뀐다(대통령령 제17825호).
 */
export const PRIOR_ADVANCED_HOUSE_STANDARD_DATE = D("2002-12-31");

const HV_2008_10_05 = D("2008-10-05");
const HV_2021_12_07 = D("2021-12-07");

export type New993PriorRuleBasis = "addenda_29_1" | "addenda_29_2";
export type ConstructionStartAnswer = "yes" | "no" | "unknown";

export interface New993Era {
  /** 종전 규정 적용 근거 — 없으면 개정규정 적용 */
  priorRuleBasis?: New993PriorRuleBasis;
  /** §29② 범위(2호 · 사용승인 2003.1.1.~6.30.)인데 착공 «예»가 확인되지 않음(모름·미입력) */
  needsConstructionStartConfirmation: boolean;
}

/** 2호 사용승인이 §29② 범위(2003.1.1.~2003.6.30.)인가 — 착공 여부를 묻는 범위(UI·validate·Zod 공용). */
export function isAddenda29_2Window(
  acquisitionType: "from_builder" | "self_built",
  baseDate: Date,
): boolean {
  return acquisitionType === "self_built" && baseDate >= AMENDED_EFFECTIVE && baseDate <= ADDENDA_29_2_APPROVAL_END;
}

/**
 * 착공 여부를 묻는 범위인가 — 폼 문자열(YYYY-MM-DD) 판. UI·validate(⑧)·Zod(⑫)가 같은 술어를 쓴다.
 * 2호(자기건설)이고 사용승인일이 2003.1.1.~2003.6.30.일 때만 참이다(Date 판 `isAddenda29_2Window`와 같은 경계).
 */
export function isAddenda29_2WindowIso(
  acquisitionType: string | undefined,
  usageApprovalDateIso: string | undefined,
): boolean {
  return (
    acquisitionType === "self_built" &&
    !!usageApprovalDateIso &&
    usageApprovalDateIso >= AMENDED_EFFECTIVE_ISO &&
    usageApprovalDateIso <= ADDENDA_29_2_APPROVAL_END_ISO
  );
}

/**
 * 종전 규정/개정규정 판정. `baseDate`는 `resolveNew99BaseDate`(1호 계약일 · 2호 사용승인일).
 * 시한 외(2003.6.30. 초과)는 여기서 가르지 않는다 — 신축주택취득기간 게이트가 따로 막는다.
 */
export function resolveNew993Era(
  baseDate: Date,
  acquisitionType: "from_builder" | "self_built",
  constructionStartedBefore2003: ConstructionStartAnswer | undefined,
): New993Era {
  if (baseDate < AMENDED_EFFECTIVE) {
    return { priorRuleBasis: "addenda_29_1", needsConstructionStartConfirmation: false };
  }
  if (isAddenda29_2Window(acquisitionType, baseDate)) {
    if (constructionStartedBefore2003 === "yes") {
      return { priorRuleBasis: "addenda_29_2", needsConstructionStartConfirmation: false };
    }
    return { needsConstructionStartConfirmation: constructionStartedBefore2003 !== "no" };
  }
  return { needsConstructionStartConfirmation: false };
}

/**
 * 양도 당시 소득세법 §89①3호 고가주택 — 양도가액(물건 전체) 기준 금액만 본다(면적 요건 없음).
 * 시행령 §156①: 2008.10.7. 전 6억 · 2008.10.7.~2021.12.7. 9억 · 2021.12.8.~ 12억.
 * 경계 상수는 기존 기준일 축 헬퍼(`isHighValueHouseUnder993`)와 같은 값(≤2008-10-05 = 6억)을 그대로 쓴다 — 이 함수가 단일 소스다
 * (2008-10-06 하루 경계는 계산 범위(2009.3.16. 이후 양도) 밖이라 실익이 없다 — 리뷰 NH-04).
 */
export function isHighValueHouseAtDate(date: Date, wholePropertyTransferPrice: number): boolean {
  if (date <= HV_2008_10_05) return wholePropertyTransferPrice > 600_000_000;
  if (date <= HV_2021_12_07) return wholePropertyTransferPrice > 900_000_000;
  return wholePropertyTransferPrice > 1_200_000_000;
}

/**
 * §99의3 종전 규정 기준일(ISO 판) — 고급주택 종전 기준(소득세법 시행령 §156 당시 시행본)을 쓰는 계산인가 (리뷰 NH-02).
 * `resolveNew993Era`가 종전 규정(부칙 §29①·②)을 고르는 조건과 같다. UI·validate(⑧)·Zod(⑫)가 같은 술어를 쓴다.
 * 기준일: 1호 = 매매계약일(비면 취득일) · 2호 = 사용승인일(비면 취득일). 일자가 모두 비면 false(일자 칸이 먼저 막는다).
 */
export function isNew993PriorRuleEraIso(
  acquisitionType: string | undefined,
  contractDateIso: string | undefined,
  usageApprovalDateIso: string | undefined,
  acquisitionDateIso: string | undefined,
  constructionStartedBefore2003: string | undefined,
): boolean {
  const base =
    acquisitionType === "self_built"
      ? usageApprovalDateIso || acquisitionDateIso
      : contractDateIso || acquisitionDateIso;
  if (!base) return false;
  if (base < AMENDED_EFFECTIVE_ISO) return true;
  return isAddenda29_2WindowIso(acquisitionType, usageApprovalDateIso) && constructionStartedBefore2003 === "yes";
}

/** 법률 제13560호(2016.1.1. 시행) 시행 전 마지막 양도일 — 대통령령 제26959호 부칙 §16·§35의 경계 */
const PRE_2016_RULE_LAST = D("2015-12-31");

/**
 * 2015.12.31.까지 양도한 §99·§99의3 — 종전 규정 적용 대상 고지 (리뷰 NH-49 · 사용자 결정 「현행 계산 + 확인 필요 고지」).
 *
 * 대통령령 제26959호 부칙 §35: 법률 제13560호 시행 전에 양도한 경우 조특령 §99① · §99의3②의 개정규정에도 불구하고 종전의 규정에 따른다.
 * 종전 법률(2015.12.31. 시행본, MST 177204)은 5년 이내 양도분을 §99는 «양도소득세의 100분의 100에 상당하는 세액을 감면», §99의3은 «양도소득세를 면제»하는 세액 구조였다.
 * 계산은 현행 산식(양도소득금액 차감) 그대로 하고, 고지만 단다 — 세액은 바뀌지 않는다.
 */
export function pre2016RuleNotice(transferDate: Date, article: "new_99" | "new_99_3"): string | undefined {
  if (transferDate > PRE_2016_RULE_LAST) return undefined;
  const label = article === "new_99_3" ? "§99의3" : "§99";
  const priorEffect = article === "new_99_3" ? "«양도소득세 면제»" : "«양도소득세의 100분의 100에 상당하는 세액 감면»";
  return (
    `확인 필요: 2015.12.31. 이전 양도분이라 ${label}는 종전 규정 적용 대상입니다(${NEW_99_DECREE_ADDENDA_26959.TRANSITION} — 종전 법은 5년 이내 양도를 ${priorEffect}으로 정했습니다). ` +
    "이 계산은 현행 산식(양도소득금액 차감)으로 했으므로 실제 신고·경정 세액과 다를 수 있습니다."
  );
}
