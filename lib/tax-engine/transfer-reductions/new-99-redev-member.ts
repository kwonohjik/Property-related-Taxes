/**
 * §99·§99의3 **재개발·재건축 완공 아파트 조합원 갈래** — 공용 leaf (리뷰 NH-36 · NH-16 ③2호 · NH-27 · NH-63 · NH-32).
 *
 * 조합원이 정비사업조합에서 받은 신축주택은 법문상 「자기가 건설한 주택(조합원이 취득하는 주택을 포함)」 갈래다
 * (조세특례제한법 §99①1호 · §99의3①2호). 그 판정 축은 종전주택 취득일·매매계약일이 아니라 **신축주택의 사용승인·사용검사일**이다.
 *
 * - 기간 안 사용승인 — §99①1호 · §99의3①2호.
 * - 기간 경과 후 사용승인 — 조합이 조합원 외의 자와 **신축주택취득기간 안에 잔여주택 매매계약을 직접 체결하고 계약금을 받은 사실**이
 *   있을 때만 주택건설사업자 갈래로 본다(조세특례제한법 시행령 §99③2호 · §99의3③2호 단서). 이 사실은 3-state로 받는다 —
 *   「모름」·빈 값은 불성립 + 확인 필요(기존 정책).
 * - §99의3 조합원은 관리처분계획 인가일(사업계획 승인일) 현재의 조합원이다(조특령 §99의3③2호 괄호·⑤) — 인가일 뒤 승계는
 *   취득 원인 게이트(`new-99-acquisition-cause.ts`)가 먼저 막는다. 단 ③2호 괄호·⑤ 개정규정은 2002.1.1. 이후 **최초로 조합원의 지위를 취득하는
 *   분**부터 적용하므로(대통령령 제17458호 부칙 제11조) 2001.12.31.까지 조합원 지위를 승계취득한 분은 종전 규정 — 인가일 요건 없이 사용승인일
 *   현재 조합원이면 된다(`isPriorRuleSuccessor993`, L16).
 * - 5년 기산 「취득일」 = 사용검사필증 교부일(사용 검사 전 사실상 사용·임시사용승인이면 그중 빠른 날) — 서면인터넷방문상담4팀-2145
 *   (2005.11.11.: 「조합원이 취득하는 주택을 포함」한 자기건설 신축주택의 「취득당시」·「취득일」은 소득세법 시행령 §162①4호에 따라
 *   사용검사필증교부일).
 * - 주택을 출자한 원조합원의 신축주택은 「종전주택을 재개발·재건축하여 취득한 법 §98조의3② 각 호에 따른 신축주택」이라 안분 분모가
 *   종전주택 취득 당시 기준시가다(조특령 §99①·§99의3②1호 단서·2호 괄호). 토지만 출자했으면 종전주택이 없어 해당하지 않는다.
 *
 * - 조합원이 되는 **원인**(매매·상속·증여)을 한정하는 문언은 법·령 어디에도 없다. 종전주택(입주권)을 상속·증여로 취득해 조합원이 된 경우
 *   취득 원인 게이트(`new-99-acquisition-cause.ts`)가 읽는 «상속·증여»는 신축주택의 취득 원인인데, 조합원 갈래의 신축주택은 조합에서 받은
 *   것이다 — `redevMemberGateCause`가 그 경우 게이트에 넘기는 취득 원인을 비운다(사용자 결정 L14 Q-1 a · Q-2 a).
 *   정면 해석례는 확인하지 못했다(서면인터넷방문상담4팀-372·-785는 일반론 회신) — 적용 결과에 「확인 필요」 고지를 붙인다.
 *
 * 입력 축: 엔진 `redevelopment`(subject `"apt"`, 청산금 수령 단독신고 제외)와 그 `completionDate`(준공일).
 */
import { NEW_HOUSING_ACQUISITION_ARTICLE as ART, NEW_99_3_DECREE_ADDENDA_17458 } from "../legal-codes/transfer-house";
import type { TriStateAnswer } from "./new-99-luxury-house";
import type { New99AcquisitionCause } from "./new-99-acquisition-cause";
import type { RedevelopmentInfo } from "../types/transfer-redevelopment.types";

export interface RedevMemberNewHouse {
  /** 신축주택 사용승인·사용검사일(준공일). 없으면 판정할 수 없다 — 불성립 사유로 낸다. */
  completionDate?: Date;
  /** 주택을 출자한 원조합원 — 재개발·재건축 변형(분모 = 종전주택 취득 당시 기준시가)이 자산 사실에서 정해진다 */
  houseContributed: boolean;
  /** 관리처분계획 인가일 뒤 입주권을 승계한 조합원 */
  isSuccessorMember?: boolean;
  /** 종전주택(승계면 입주권)의 취득일 — 상속개시일·증여일·매매 취득일. 조합원 지위를 얻은 날이다 */
  rightAcquisitionDate?: Date;
  /** 관리처분계획 인가일(재건축은 사업시행인가일이 아니라 자산 입력의 인가일) */
  approvalDate?: Date;
}

/**
 * 엔진 재개발 정보 → 조합원 갈래. 완공 아파트 양도(청산금 수령 단독신고 제외)만 해당한다.
 * `acquisitionDate`는 입력의 취득일(종전주택·입주권 취득일) — 조합원 지위 취득 시점을 가르는 데만 쓴다.
 */
export function redevMemberNewHouseOf(
  redev: (Pick<RedevelopmentInfo, "subject" | "isSuccessorMember" | "originalAssetType" | "completionDate" | "receiveOnlyMode"> & Partial<Pick<RedevelopmentInfo, "approvalDate">>) | undefined,
  acquisitionDate?: Date,
): RedevMemberNewHouse | undefined {
  if (!redev || redev.subject !== "apt" || redev.receiveOnlyMode === true) return undefined;
  return {
    completionDate: redev.completionDate,
    houseContributed: redev.isSuccessorMember !== true && redev.originalAssetType !== "land",
    isSuccessorMember: redev.isSuccessorMember === true,
    rightAcquisitionDate: acquisitionDate,
    approvalDate: redev.approvalDate,
  };
}

/** 토지만 출자한 원조합원(승계 아님) — 재개발 변형 산식 대상이 아니고 고지 문구만 「종전 토지」로 바뀐다 */
export function isLandOnlyOriginalMember(member: RedevMemberNewHouse | undefined): boolean {
  return !!member && member.isSuccessorMember !== true && !member.houseContributed;
}

/** 서면인터넷방문상담4팀-372(2005.3.14.: 재건축 대상 주택을 처에게 증여) · -785(2005.5.20.: 부친에게 증여받은 재개발 조합원) — 일반론 회신 */
const MEMBER_BY_GIFT_RULINGS = "서면인터넷방문상담4팀-372 · 서면인터넷방문상담4팀-785";

export interface RedevMemberGateCause {
  /** 취득 원인 게이트에 넘길 취득 원인 — 조합원 갈래 면제면 비운다 */
  acquisitionCause: New99AcquisitionCause | undefined;
  /** 상속·증여 취득 원인 게이트를 조합원 갈래로 면제했는가 — 면제했으면 결과에 「확인 필요」 고지를 붙인다 */
  exempted: boolean;
  /** 승계조합원 면제인가(인가일 뒤 상속·증여 승계 — §99는 사용승인일 현재 조합원이면 적용, §99의3은 `priorRuleSuccessor`일 때만) */
  successor: boolean;
  /** §99의3 — 2001.12.31. 이전에 조합원 지위를 승계취득해 종전 규정(인가일 요건 없음)으로 판정하는 승계조합원인가 (L16) */
  priorRuleSuccessor: boolean;
}

/**
 * §99의3 「관리처분계획 인가일 현재의 조합원」 요건(조특령 §99의3③2호 괄호·⑤)의 적용 개시 직전 날 — 이 영 시행(2002.1.1.) 후 **최초로 조합원의
 * 지위를 취득하는 분**부터 적용한다(조특령 대통령령 제17458호 부칙 제11조). 서일46014-10612(2002.5.8.)·서면인터넷방문상담4팀-1532(2004.9.30.)가
 * 「2002.1.1. 이후 최초로 조합원의 지위를 취득하는 분」으로 읽는다. UTC 자정 날짜 — API 경유 입력(`new Date("YYYY-MM-DD")`)과 같은 기준.
 */
const PRIOR_RULE_LAST_DAY_993 = new Date("2001-12-31");

/**
 * 2001.12.31.까지 입주권(조합원 지위)을 승계취득한 승계조합원 — §99의3은 종전 규정이라 인가일 현재 조합원 요건을 두지 않고 신축주택의
 * 사용승인일 현재 조합원이면 된다(서일46014-10208 · 서면인터넷방문상담4팀-1532 · 서면인터넷방문상담4팀-1270 · 재산세과-4146).
 * 승계일(조합원 지위 취득일 = 입주권 취득일)이 비어 있으면 판정할 수 없다 — 해당하지 않는 것으로 본다(「모름」은 불성립).
 */
export function isPriorRuleSuccessor993(member: RedevMemberNewHouse | undefined): boolean {
  if (!member || member.isSuccessorMember !== true || !member.rightAcquisitionDate) return false;
  return member.rightAcquisitionDate.getTime() <= PRIOR_RULE_LAST_DAY_993.getTime();
}

/**
 * 조합원 갈래의 취득 원인 게이트 입력 — 종전주택(입주권)을 상속·증여로 취득해 조합원이 된 경우 면제 (L14 Q-1 a · Q-2 a · Q-3 b).
 *
 *  · 원조합원 — 종전주택(토지만 출자했으면 종전 토지) 취득일이 관리처분계획 인가일 이전이면 인가일(§99의3)·사용승인일(§99) 현재 조합원이다.
 *    인가일 뒤면 승계조합원이므로 이 분기가 아니다(⑧이 막는다). 토지만 출자한 원조합원도 면제한다 — 조합원 갈래의 법문 「조합원이 취득하는
 *    주택」(§99①1호·§99의3①2호)에 주택 출자를 요건으로 한 문언이 없고, 토지만 출자한 조합원은 재개발 변형 산식(`houseContributed`)에서만
 *    갈린다(L16).
 *  · 승계조합원 — 취득일이 준공일(사용승인일) 이전이면 §99의 «사용승인일 현재 조합원»이다(매매 승계와 같은 취급). §99의3은 인가일 현재
 *    조합원이 아니라 게이트가 `NOT_MEMBER_AT_APPROVAL`로 막는다 — 단 2001.12.31. 이전 승계(`priorRuleSuccessor`)는 종전 규정이라 막지 않는다(L16). 준공일 **뒤** 상속·증여는 완성된 신축주택을 받은 것이라 면제하지 않는다
 *    (서일46014-11107).
 *  · 지분별 판정(Q-3 b) — 판정 단위는 계산 입력 하나(자산·지분 하나)의 취득 원인이다. 공유 종전주택의 지분을 달리 취득했으면 지분마다
 *    자산 카드(축 B)가 따로 있어 각자 자기 취득 원인으로 판정한다.
 *  · 날짜가 비어 있으면 면제하지 않는다 — 「모름」은 불성립(기존 정책).
 */
export function redevMemberGateCause(args: {
  acquisitionCause: New99AcquisitionCause | undefined;
  member: RedevMemberNewHouse | undefined;
}): RedevMemberGateCause {
  const { acquisitionCause: cause, member } = args;
  const priorRuleSuccessor = isPriorRuleSuccessor993(member);
  const keep: RedevMemberGateCause = { acquisitionCause: cause, exempted: false, successor: false, priorRuleSuccessor };
  if (!member || (cause !== "inheritance" && cause !== "gift" && cause !== "carryover_gift")) return keep;
  const acquired = member.rightAcquisitionDate;
  if (!acquired) return keep;
  if (member.isSuccessorMember === true) {
    if (!member.completionDate || acquired.getTime() > member.completionDate.getTime()) return keep;
    return { acquisitionCause: undefined, exempted: true, successor: true, priorRuleSuccessor };
  }
  if (!member.approvalDate || acquired.getTime() > member.approvalDate.getTime()) return keep;
  return { acquisitionCause: undefined, exempted: true, successor: false, priorRuleSuccessor: false };
}

/** 2001.12.31. 이전 승계조합원의 §99의3 종전 규정 적용 안내 — 해석례가 명시적이라 「확인 필요」가 아닌 근거 고지다 */
const PRIOR_RULE_993_NOTICE =
  `2001.12.31. 이전에 조합원 지위를 승계취득한 조합원이라 «관리처분계획 인가일 현재의 조합원» 요건(${ART.NEW_99_3_MEMBER_AT_APPROVAL})을 적용하지 않고 ` +
  `종전 규정에 따라 신축주택의 사용승인일 현재 조합원으로 판정했습니다 (${NEW_99_3_DECREE_ADDENDA_17458.MEMBER_STATUS_APPLICATION} · ` +
  "서면인터넷방문상담4팀-1532 · 서면인터넷방문상담4팀-1270 · 재산세과-4146).";

/**
 * 결과 고지 — 적용된(적격) 결과에만 붙인다. 적용되지 않은 결과에는 근거 없는 고지가 된다.
 *  · 취득 원인 게이트를 면제했으면 「확인 필요」(정면 해석례 없음)
 *  · §99의3 2001.12.31. 이전 승계조합원이면 종전 규정 적용 근거
 */
export function withRedevMemberGateNotice<T extends { isEligible: boolean; warnings?: string[] }>(
  detail: T,
  gate: RedevMemberGateCause,
  article: "new_99" | "new_99_3",
  /** 종전 부동산이 토지뿐인 원조합원(주택 미출자) — 고지 문구의 「종전주택」을 「종전 토지」로 */
  landOnly = false,
): T {
  if (!detail.isEligible) return detail;
  const add: string[] = [];
  if (article === "new_99_3" && gate.priorRuleSuccessor) add.push(PRIOR_RULE_993_NOTICE);
  if (gate.exempted) {
    const provision = article === "new_99_3" ? ART.NEW_99_3_SELF_BUILT : ART.NEW_99_SELF_BUILT;
    let basis: string;
    if (gate.successor) {
      basis =
        article === "new_99_3"
          ? `2001.12.31. 이전에 입주권을 상속·증여로 승계했고 사용승인일 현재 조합원이므로(종전 규정 — ${NEW_99_3_DECREE_ADDENDA_17458.MEMBER_STATUS_APPLICATION})`
          : "인가일 뒤에 입주권을 상속·증여로 승계했으나 사용승인일 현재 조합원이므로(§99는 인가일 요건이 없음)";
    } else {
      basis =
        `${landOnly ? "종전 토지를" : "종전주택을"} 상속·증여로 취득했으나 관리처분계획 인가일 전부터 조합원이므로` +
        `${article === "new_99_3" ? ` (${ART.NEW_99_3_MEMBER_AT_APPROVAL})` : ""}`;
    }
    add.push(
      `확인 필요: ${basis} «조합원이 취득하는 주택»(${provision})으로 보아 적용했습니다. 조합원이 되는 원인(매매·상속·증여)을 한정한 문언은 없으나 ` +
        `이 경우를 정면으로 다룬 해석례는 확인하지 못했습니다(${MEMBER_BY_GIFT_RULINGS}은 증여 사실을 쟁점으로 삼지 않은 일반론 회신). 신고 전 관할 세무서 확인이 필요합니다.`,
    );
  }
  return add.length === 0 ? detail : { ...detail, warnings: [...(detail.warnings ?? []), ...add] };
}

export interface RedevMemberPeriodReason {
  code: "MISSING_REDEV_COMPLETION_DATE" | "OUT_OF_ACQUISITION_PERIOD" | "NO_REMAINDER_CONTRACT" | "REMAINDER_CONTRACT_UNCONFIRMED";
  message: string;
  legalBasis: string;
}

/**
 * 조합원 갈래의 기간 판정 — 통과면 undefined.
 * 기간 경과 후 사용승인이면 잔여주택 계약 사실(3-state)을 본다.
 */
export function judgeRedevMemberPeriod(args: {
  article: "new_99" | "new_99_3";
  completionDate?: Date;
  periodStart: Date;
  periodEnd: Date;
  /** 「1998.5.22.~1999.6.30.」 같은 화면 표기 */
  periodLabel: string;
  remainderContract?: TriStateAnswer;
}): RedevMemberPeriodReason | undefined {
  const is993 = args.article === "new_99_3";
  const selfBuilt = is993 ? ART.NEW_99_3_SELF_BUILT : ART.NEW_99_SELF_BUILT;
  const remainder = is993 ? ART.NEW_99_3_MEMBER_REMAINDER : ART.NEW_99_MEMBER_REMAINDER;
  const c = args.completionDate;
  if (!c) {
    return {
      code: "MISSING_REDEV_COMPLETION_DATE",
      message: `재개발·재건축 조합원이 받은 신축주택은 사용승인·사용검사일(준공일)로 신축주택취득기간을 판정합니다 — 준공일이 입력되지 않아 적용하지 않았습니다 (${selfBuilt}).`,
      legalBasis: selfBuilt,
    };
  }
  if (c < args.periodStart) {
    return {
      code: "OUT_OF_ACQUISITION_PERIOD",
      message: `신축주택취득기간(${args.periodLabel}) 전에 사용승인·사용검사를 받은 조합원 주택이라 적용되지 않습니다 (${selfBuilt}).`,
      legalBasis: selfBuilt,
    };
  }
  if (c <= args.periodEnd) return undefined;
  if (args.remainderContract === "yes") return undefined;
  if (args.remainderContract === "no") {
    return {
      code: "NO_REMAINDER_CONTRACT",
      message: `신축주택취득기간(${args.periodLabel}) 경과 후 사용승인·사용검사를 받은 조합원 주택은 조합이 그 기간 안에 조합원 외의 자와 잔여주택 매매계약을 직접 체결하고 계약금을 받은 경우에만 적용됩니다 — 그 사실이 없어 적용하지 않았습니다 (${remainder}).`,
      legalBasis: remainder,
    };
  }
  return {
    code: "REMAINDER_CONTRACT_UNCONFIRMED",
    message: `확인 필요: 신축주택취득기간(${args.periodLabel}) 경과 후 사용승인·사용검사를 받은 조합원 주택입니다. 조합이 그 기간 안에 조합원 외의 자와 잔여주택 매매계약을 직접 체결하고 계약금을 받았는지 확인되지 않아 적용하지 않았습니다 (${remainder}). 그 사실이 있으면 「예」로 선택하고 다시 계산하세요.`,
    legalBasis: remainder,
  };
}

/** 조합원 갈래 신축주택취득기간 종기(ISO) — 화면·⑧·④가 문자열 날짜로 같은 판정을 한다 */
const PERIOD_END_ISO = { new_99: "1999-06-30", new_99_national: "1999-12-31", new_99_3: "2003-06-30" } as const;

/**
 * 준공일이 신축주택취득기간 경과 후라 조합의 잔여주택 계약 사실(3-state)을 물어야 하는가 — ⑤·⑧·④ 공용 술어.
 * 준공일이 없으면 묻지 않는다(준공일 자체를 먼저 요구한다).
 */
export function redevMemberNeedsRemainderAnswerIso(
  article: "new_99" | "new_99_3",
  completionIso: string | undefined,
  isNationalHousing?: boolean,
): boolean {
  if (!completionIso) return false;
  const end = article === "new_99_3" ? PERIOD_END_ISO.new_99_3 : isNationalHousing ? PERIOD_END_ISO.new_99_national : PERIOD_END_ISO.new_99;
  return completionIso.slice(0, 10) > end;
}
