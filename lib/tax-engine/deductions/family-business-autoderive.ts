/**
 * 가업상속공제 요건 자동판정 (상증법 §67 + 상증령 §15③2호) — Phase 1
 *
 * KoreanLaw MCP 검증: 상증령 §15 mst=283637 (시행 2026-02-27) / 상증법 §67 신고기한.
 *
 * 설계: docs/02-design/features/inheritance-family-business-deduction/eligibility-autoderive.engine.design.md
 *
 * 정책:
 *   - 18세 ≠ 19세: §15③2호가는 만 18세. resolveMinorBeneficiary(민법§4 19세) 재사용 금지.
 *   - Date<string 혼합 비교 금지(CLAUDE.md date-coerce): date-fns는 parseISO 후 Date, 비교는 동일 타입.
 *   - 자동 안분 fallback 금지: 미입력 시 false(미충족), 자동 충족 채움 금지.
 *   - store=기초데이터, 엔진=resolve(미러링 없음).
 */

import {
  addMonths,
  addYears,
  differenceInDays,
  differenceInYears,
  endOfMonth,
  format,
  parseISO,
  subYears,
} from "date-fns";

import type { FamilyBusinessInheritanceInput } from "../types/inheritance-gift.types";
import type { Heir } from "../types/inheritance-gift.types";

/** 자동판정 출처 (UI 표시·source 메타) */
export type FamilyBusinessRequirementSource = "auto" | "override" | "legacy";

/**
 * 상속세 신고기한 (상증법 §67①) — 상속개시일이 속하는 달의 말일부터 6개월 이내.
 * 국세기본법 §4 → 민법 준용. 산식: endOfMonth(사망일) + 6개월 (세무행정 실무 표준).
 * deriveDueDates(filing-form-9-data.ts)와 동일 산식. YYYY-MM-DD 보장 → 후속 문자열 비교 가능.
 * 외국 거주 시 9개월(§67④)은 본 함수 미적용 — 호출처에서 별도 처리.
 */
export function calcInheritanceFilingDeadline(deathDate: string): string {
  return format(addMonths(endOfMonth(parseISO(deathDate)), 6), "yyyy-MM-dd");
}

/**
 * §15③2호가 — 상속개시일 현재 만 18세 이상.
 * differenceInYears: 생일이 기준일 이후면 −1 → 정확한 만 나이. 미입력 시 false(보수적).
 */
export function deriveFBHeirIsAdult(
  birthDate: string | undefined,
  deathDate: string,
): boolean {
  if (!birthDate) return false;
  return differenceInYears(parseISO(deathDate), parseISO(birthDate)) >= 18;
}

/**
 * §15③2호다 — 신고기한까지 임원 취임. 둘 다 YYYY-MM-DD → 사전순 비교(동일 타입).
 */
export function deriveFBHeirOfficerByDeadline(
  appointDate: string | undefined,
  filingDeadline: string,
): boolean {
  if (!appointDate) return false;
  return appointDate <= filingDeadline;
}

/**
 * §15③2호라 — 신고기한부터 2년 이내 대표이사 취임. limit = 신고기한 + 2년(YYYY-MM-DD).
 * Date<string 혼합 금지 → addYears 결과를 format 후 문자열끼리 비교.
 */
export function deriveFBHeirCEOWithinTwoYears(
  ceoAppointDate: string | undefined,
  filingDeadline: string,
): boolean {
  if (!ceoAppointDate) return false;
  const limit = format(addYears(parseISO(filingDeadline), 2), "yyyy-MM-dd");
  return ceoAppointDate <= limit;
}

/**
 * §15③2호나 — 상속개시 전 2년 이상 직접 가업 종사. 단서(피상속인 65세 이전·천재지변 사망) 면제.
 * Phase 1 단순화: 단일 연속구간(종사시작~상속개시). "영위기간 중 교차"·다구간은 Phase 2.
 */
export function deriveFBHeirEngagement(
  startDate: string | undefined,
  deathDate: string,
  earlyDeath: boolean,
): boolean {
  if (earlyDeath) return true;
  if (!startDate) return false;
  return differenceInYears(parseISO(deathDate), parseISO(startDate)) >= 2;
}

/**
 * 영위연수 제안값 (§18의2① 한도 구동) — 개업일~상속개시일 만 연수.
 * 자동 덮어쓰기 아님: UI가 operatingYears 빈칸일 때 채움 제안용. 캡은 familyBusinessCap 단일소스.
 */
export function suggestFBOperatingYears(openingDate: string, deathDate: string): number {
  return differenceInYears(parseISO(deathDate), parseISO(openingDate));
}

// ─ Phase 2 — 피상속인 요건 자동판정 (상증령 §15③1호, corporate) ─

/**
 * 구간[ps,pe]과 윈도우[lo,hi]의 교집합 일수 (비중첩 구간 가정 — 중첩=사용자 오류).
 * YYYY-MM-DD 사전순 max/min, differenceInDays는 parseISO 후.
 */
function clipDays(ps: string, pe: string, lo: string, hi: string): number {
  const s = ps > lo ? ps : lo;
  const e = pe < hi ? pe : hi;
  if (s >= e) return 0;
  return Math.max(0, differenceInDays(parseISO(e), parseISO(s)));
}

/**
 * §15③1호가 지분 임계 — 상속개시일 시기별 (개정연혁, 계획서 §5-6 / PDF 382p).
 *   2023.1.1.~ : 비상장 40% / 상장 20%
 *   2011.1.1.~2022.12.31 : 비상장 50% / 상장 30%
 *   2010.12.31 이전 : 비상장 50% / 상장 40%
 * deathDate YYYY-MM-DD 사전순 비교.
 */
export function getShareThresholdByDate(deathDate: string, isListed: boolean): number {
  if (deathDate >= "2023-01-01") return isListed ? 0.2 : 0.4;
  if (deathDate >= "2011-01-01") return isListed ? 0.3 : 0.5;
  return isListed ? 0.4 : 0.5; // 2010.12.31 이전
}

/**
 * §15③1호가 — 최대주주등 지분 40%(상장 20%) 이상 × 10년 이상 계속 보유 (corporate).
 * 임계는 상속개시일 시기별(getShareThresholdByDate, 계획 §5-6).
 * ⚠️ "계속 보유"(매도·재취득 없음)는 자동 불가 → UI 경고 + override. 미입력 시 false(보수적).
 */
export function deriveFBDecedentShareholding(
  shareRatioNum: number | undefined,
  acquiredDate: string | undefined,
  deathDate: string,
  isListed: boolean,
): boolean {
  if (shareRatioNum == null || !acquiredDate) return false;
  const threshold = getShareThresholdByDate(deathDate, isListed);
  return (
    shareRatioNum >= threshold &&
    differenceInYears(parseISO(deathDate), parseISO(acquiredDate)) >= 10
  );
}

/** deriveFBDecedentCEO 결과 */
export interface DecedentCEOResult {
  met: boolean;
  /** 충족 대안 (1호 50% / 3호 소급10년중5년 / 미충족 null). 2호(승계)는 자동 제외 → override. */
  satisfiedAlternative: 1 | 3 | null;
  /** 영위기간 내 대표이사 재직 비율(%) — 표시용 */
  ratioPercent: number;
}

/**
 * §15③1호나 — 가업 영위기간 중 대표이사 재직 요건 자동판정 (1호·3호만, 2호 승계는 override).
 *   1호: 영위기간(개업~상속개시)의 50% 이상 재직 — 정수 비교(윤년 artifact 회피).
 *   3호: 상속개시일 소급 10년 중 5년 이상 재직.
 */
export function deriveFBDecedentCEO(
  periods: Array<{ startDate: string; endDate: string }> | undefined,
  openingDate: string | undefined,
  deathDate: string,
): DecedentCEOResult {
  if (!periods?.length || !openingDate) {
    return { met: false, satisfiedAlternative: null, ratioPercent: 0 };
  }
  const operatingDays = differenceInDays(parseISO(deathDate), parseISO(openingDate));
  if (operatingDays <= 0) return { met: false, satisfiedAlternative: null, ratioPercent: 0 };

  // 1호 — 영위기간 내 재직일 합 (정수 비교: ceoDays*2 >= operatingDays)
  const ceoDaysOp = periods.reduce(
    (sum, p) => sum + clipDays(p.startDate, p.endDate, openingDate, deathDate),
    0,
  );
  const alt1 = ceoDaysOp * 2 >= operatingDays;

  // 3호 — 소급 10년 [death−10y, death] 내 재직일 합 >= 5년치 일수
  const windowStart = format(subYears(parseISO(deathDate), 10), "yyyy-MM-dd");
  const fiveYearDays = differenceInDays(parseISO(deathDate), subYears(parseISO(deathDate), 5));
  const ceoDaysWin = periods.reduce(
    (sum, p) => sum + clipDays(p.startDate, p.endDate, windowStart, deathDate),
    0,
  );
  const alt3 = ceoDaysWin >= fiveYearDays;

  return {
    met: alt1 || alt3,
    satisfiedAlternative: alt1 ? 1 : alt3 ? 3 : null,
    ratioPercent: (ceoDaysOp / operatingDays) * 100,
  };
}

/**
 * 가업상속인 heirId 결정 헬퍼 — UI display fallback과 동일 규칙을 API 변환·엔진 조립·validate에서 공유.
 *
 * 규칙:
 *   1. explicitHeirId 있으면 그대로 반환
 *   2. naturalHeirs(relation !== "corporate") 가 정확히 1명이면 자동선택
 *   3. 그 외 undefined (미선택)
 *
 * 정책: feedback_useeffect_store_mirror_forbidden — store 미러링 금지. 조립 시점에 fallback 적용.
 *
 * @param heirs          InheritanceTaxInput.heirs 전체 (corporate 포함)
 * @param explicitHeirId FamilyBusinessInheritanceInput.heirId (store 값, undefined 가능)
 */
export function resolveFamilyBusinessHeirId(
  heirs: Pick<Heir, "id" | "relation">[],
  explicitHeirId: string | undefined,
): string | undefined {
  if (explicitHeirId) return explicitHeirId;
  const naturalHeirs = heirs.filter((h) => h.relation !== "corporate");
  if (naturalHeirs.length === 1) return naturalHeirs[0].id;
  return undefined;
}

/** resolveFamilyBusinessRequirements 반환 */
export interface ResolvedFamilyBusinessRequirements {
  /** 6개 요건(heir 4 + decedent 2)을 resolved boolean으로 덮어쓴 사본 (spouse·OFZ는 미변경) */
  resolvedInput: FamilyBusinessInheritanceInput;
  /** §67 신고기한 (다목·라목 근거 — 결과 표시) */
  filingDeadline: string;
  /** 요건별 판정 출처 (heir 4종 + decedent 2종) */
  source: Record<
    | "heirIsAdult"
    | "heirTwoYearEngagement"
    | "heirOfficerByFilingDeadline"
    | "heirCEOWithinTwoYears"
    | "decedentMajorShareholdingMet"
    | "decedentCEORequirementMet",
    FamilyBusinessRequirementSource
  >;
}

/**
 * 요건 4종 resolve — override > 자동도출(기초데이터) > legacy boolean > false.
 *
 * Phase 1 덮어쓰기 범위 = 상속인 요건 4종만. 피상속인 요건(가·나목)·spouseFulfillsRequirements·OFZ는
 * 미변경(legacy 통과) → evaluateFamilyBusinessEligibility의 spouse-skip·ofzExempted 정상 동작.
 *
 * @param input         FamilyBusinessInheritanceInput (신·구 필드)
 * @param heirBirthDate 가업상속인 생년월일 (orchestrator가 heirs[heirId].birthDate에서 도출). 없으면 input.heirBirthDate fallback.
 * @param deathDate     상속개시일 (orchestrator baseDate)
 */
export function resolveFamilyBusinessRequirements(
  input: FamilyBusinessInheritanceInput,
  heirBirthDate: string | undefined,
  deathDate: string,
): ResolvedFamilyBusinessRequirements {
  const filingDeadline = calcInheritanceFilingDeadline(deathDate);
  const effectiveBirthDate = heirBirthDate ?? input.heirBirthDate;
  const earlyDeath = input.decedentEarlyDeath === true;

  // 가목 — 18세
  let heirIsAdult: boolean;
  let srcAdult: FamilyBusinessRequirementSource;
  if (input.heirIsAdultOverride != null) {
    heirIsAdult = input.heirIsAdultOverride;
    srcAdult = "override";
  } else if (effectiveBirthDate) {
    heirIsAdult = deriveFBHeirIsAdult(effectiveBirthDate, deathDate);
    srcAdult = "auto";
  } else {
    heirIsAdult = input.heirIsAdult;
    srcAdult = "legacy";
  }

  // 나목 — 2년 종사 (decedentEarlyDeath 면제 포함)
  let heirTwoYearEngagement: boolean;
  let srcEngagement: FamilyBusinessRequirementSource;
  if (input.heirTwoYearEngagementOverride != null) {
    heirTwoYearEngagement = input.heirTwoYearEngagementOverride;
    srcEngagement = "override";
  } else if (input.heirEngagementStartDate || earlyDeath) {
    heirTwoYearEngagement = deriveFBHeirEngagement(
      input.heirEngagementStartDate,
      deathDate,
      earlyDeath,
    );
    srcEngagement = "auto";
  } else {
    heirTwoYearEngagement = input.heirTwoYearEngagement;
    srcEngagement = "legacy";
  }

  // 다목 — 신고기한 임원취임
  let heirOfficerByFilingDeadline: boolean;
  let srcOfficer: FamilyBusinessRequirementSource;
  if (input.heirOfficerByFilingDeadlineOverride != null) {
    heirOfficerByFilingDeadline = input.heirOfficerByFilingDeadlineOverride;
    srcOfficer = "override";
  } else if (input.heirOfficerAppointDate) {
    heirOfficerByFilingDeadline = deriveFBHeirOfficerByDeadline(
      input.heirOfficerAppointDate,
      filingDeadline,
    );
    srcOfficer = "auto";
  } else {
    heirOfficerByFilingDeadline = input.heirOfficerByFilingDeadline;
    srcOfficer = "legacy";
  }

  // 라목 — 2년내 대표이사
  let heirCEOWithinTwoYears: boolean;
  let srcCEO: FamilyBusinessRequirementSource;
  if (input.heirCEOWithinTwoYearsOverride != null) {
    heirCEOWithinTwoYears = input.heirCEOWithinTwoYearsOverride;
    srcCEO = "override";
  } else if (input.heirCEOAppointDate) {
    heirCEOWithinTwoYears = deriveFBHeirCEOWithinTwoYears(
      input.heirCEOAppointDate,
      filingDeadline,
    );
    srcCEO = "auto";
  } else {
    heirCEOWithinTwoYears = input.heirCEOWithinTwoYears;
    srcCEO = "legacy";
  }

  // ─ Phase 2 피상속인 요건 (corporate) ─
  // 가목 — 최대주주 지분 40%(상장20%)×10년 보유
  let decedentMajorShareholdingMet: boolean;
  let srcShare: FamilyBusinessRequirementSource;
  if (input.decedentMajorShareholdingMetOverride != null) {
    decedentMajorShareholdingMet = input.decedentMajorShareholdingMetOverride;
    srcShare = "override";
  } else if (input.decedentShareRatioNum != null && input.decedentShareAcquiredDate) {
    decedentMajorShareholdingMet = deriveFBDecedentShareholding(
      input.decedentShareRatioNum,
      input.decedentShareAcquiredDate,
      deathDate,
      input.isListedOnExchange === true,
    );
    srcShare = "auto";
  } else {
    decedentMajorShareholdingMet = input.decedentMajorShareholdingMet ?? false;
    srcShare = "legacy";
  }

  // 나목 — 대표이사 종사 (1호·3호 자동, 2호 승계 override)
  let decedentCEORequirementMet: boolean;
  let srcDecedentCEO: FamilyBusinessRequirementSource;
  if (input.decedentCEORequirementMetOverride != null) {
    decedentCEORequirementMet = input.decedentCEORequirementMetOverride;
    srcDecedentCEO = "override";
  } else if (input.decedentCEOPeriods?.length && input.openingDate) {
    decedentCEORequirementMet = deriveFBDecedentCEO(
      input.decedentCEOPeriods,
      input.openingDate,
      deathDate,
    ).met;
    srcDecedentCEO = "auto";
  } else {
    decedentCEORequirementMet = input.decedentCEORequirementMet;
    srcDecedentCEO = "legacy";
  }

  return {
    resolvedInput: {
      ...input,
      // 상속개시일 단일 소스 — 한도 개정연혁(familyBusinessCap)·신고기한 일관성 (계획서 §5-6)
      deathDate: input.deathDate ?? deathDate,
      heirIsAdult,
      heirTwoYearEngagement,
      heirOfficerByFilingDeadline,
      heirCEOWithinTwoYears,
      decedentMajorShareholdingMet,
      decedentCEORequirementMet,
    },
    filingDeadline,
    source: {
      heirIsAdult: srcAdult,
      heirTwoYearEngagement: srcEngagement,
      heirOfficerByFilingDeadline: srcOfficer,
      heirCEOWithinTwoYears: srcCEO,
      decedentMajorShareholdingMet: srcShare,
      decedentCEORequirementMet: srcDecedentCEO,
    },
  };
}
