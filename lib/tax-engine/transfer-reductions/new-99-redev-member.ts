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
 *   취득 원인 게이트(`new-99-acquisition-cause.ts`)가 먼저 막는다.
 * - 5년 기산 「취득일」 = 사용검사필증 교부일(사용 검사 전 사실상 사용·임시사용승인이면 그중 빠른 날) — 서면인터넷방문상담4팀-2145
 *   (2005.11.11.: 「조합원이 취득하는 주택을 포함」한 자기건설 신축주택의 「취득당시」·「취득일」은 소득세법 시행령 §162①4호에 따라
 *   사용검사필증교부일).
 * - 주택을 출자한 원조합원의 신축주택은 「종전주택을 재개발·재건축하여 취득한 법 §98조의3② 각 호에 따른 신축주택」이라 안분 분모가
 *   종전주택 취득 당시 기준시가다(조특령 §99①·§99의3②1호 단서·2호 괄호). 토지만 출자했으면 종전주택이 없어 해당하지 않는다.
 *
 * 입력 축: 엔진 `redevelopment`(subject `"apt"`, 청산금 수령 단독신고 제외)와 그 `completionDate`(준공일).
 */
import { NEW_HOUSING_ACQUISITION_ARTICLE as ART } from "../legal-codes/transfer-house";
import type { TriStateAnswer } from "./new-99-luxury-house";
import type { RedevelopmentInfo } from "../types/transfer-redevelopment.types";

export interface RedevMemberNewHouse {
  /** 신축주택 사용승인·사용검사일(준공일). 없으면 판정할 수 없다 — 불성립 사유로 낸다. */
  completionDate?: Date;
  /** 주택을 출자한 원조합원 — 재개발·재건축 변형(분모 = 종전주택 취득 당시 기준시가)이 자산 사실에서 정해진다 */
  houseContributed: boolean;
}

/** 엔진 재개발 정보 → 조합원 갈래. 완공 아파트 양도(청산금 수령 단독신고 제외)만 해당한다. */
export function redevMemberNewHouseOf(
  redev: Pick<RedevelopmentInfo, "subject" | "isSuccessorMember" | "originalAssetType" | "completionDate" | "receiveOnlyMode"> | undefined,
): RedevMemberNewHouse | undefined {
  if (!redev || redev.subject !== "apt" || redev.receiveOnlyMode === true) return undefined;
  return {
    completionDate: redev.completionDate,
    houseContributed: redev.isSuccessorMember !== true && redev.originalAssetType !== "land",
  };
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
