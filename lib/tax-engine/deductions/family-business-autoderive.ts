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

import { addMonths, addYears, differenceInYears, endOfMonth, format, parseISO } from "date-fns";

import type { FamilyBusinessInheritanceInput } from "../types/inheritance-gift.types";

/** 자동판정 출처 (UI 표시·source 메타) */
export type FamilyBusinessRequirementSource = "auto" | "override" | "legacy";

/**
 * 상속세 신고기한 (상증법 §67①) — 상속개시일이 속하는 달의 말일부터 6개월.
 * 검증된 deriveDueDates(filing-form-9-data.ts)와 동일 산식. YYYY-MM-DD 보장 → 후속 문자열 비교 가능.
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

/** resolveFamilyBusinessRequirements 반환 */
export interface ResolvedFamilyBusinessRequirements {
  /** 4개 heir 요건만 resolved boolean으로 덮어쓴 사본 (decedent·spouse·OFZ는 미변경) */
  resolvedInput: FamilyBusinessInheritanceInput;
  /** §67 신고기한 (다목·라목 근거 — 결과 표시) */
  filingDeadline: string;
  /** 4개 heir 요건별 판정 출처 */
  source: Record<
    | "heirIsAdult"
    | "heirTwoYearEngagement"
    | "heirOfficerByFilingDeadline"
    | "heirCEOWithinTwoYears",
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

  return {
    resolvedInput: {
      ...input,
      heirIsAdult,
      heirTwoYearEngagement,
      heirOfficerByFilingDeadline,
      heirCEOWithinTwoYears,
    },
    filingDeadline,
    source: {
      heirIsAdult: srcAdult,
      heirTwoYearEngagement: srcEngagement,
      heirOfficerByFilingDeadline: srcOfficer,
      heirCEOWithinTwoYears: srcCEO,
    },
  };
}
