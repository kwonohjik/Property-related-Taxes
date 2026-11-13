/**
 * 종부령 §3①6호 미분양매입임대주택 — 본문 괄호(미분양·계약 기간)·후단(5호 이상)·다목(수도권 밖)·라목(서류)·가목 단서 1)~3).
 * 면적(149㎡)·공시가격(3억)·5년은 `comprehensive-exclusion.ts`의 공통 판정이 유형별 상한으로 본다. 임대료 요건은 없다.
 * 계획서: docs/01-plan/features/comprehensive-rental-excl-6ho-unsold-purchase.plan.md (§4 매트릭스 행 번호를 주석에 단다).
 * 「모름」(값 없음)은 혜택 불성립 + 확인 필요(직접 해석 0건 — V-1).
 */
import { COMPREHENSIVE_EXCL } from "./legal-codes";
import type { RentalExclusionInput } from "./types/comprehensive.types";

/** 본문 괄호 — 「2008년 6월 11일부터 2009년 6월 30일까지 최초로 분양계약을 체결하고 계약금을 납부한 주택」 */
const CONTRACT_FROM = Date.UTC(2008, 5, 11);
const CONTRACT_TO = Date.UTC(2009, 5, 30);
/** 가목 단서 — 대통령령 제31085호(2020.10.7.) 신설 · 부칙 §2 → 2021 과세기준일부터 */
const ERA_GA_PROVISO = Date.UTC(2020, 9, 7);
const JULY_11_2020 = Date.UTC(2020, 6, 11);

function ms(d: Date | null | undefined): number | null {
  return d && !Number.isNaN(d.getTime()) ? d.getTime() : null;
}

/** 6-1 미분양주택 · 계약 기간 */
function unsoldIssue(input: RentalExclusionInput): string | null {
  const contract = ms(input.unsoldContractDate);
  if (input.isUnsoldFirstComeSupply === false) return COMPREHENSIVE_EXCL.UNSOLD_6HO_NOT_UNSOLD;
  if (contract !== null && (contract < CONTRACT_FROM || contract > CONTRACT_TO)) {
    return COMPREHENSIVE_EXCL.UNSOLD_6HO_NOT_UNSOLD;
  }
  if (input.isUnsoldFirstComeSupply == null || contract === null) return COMPREHENSIVE_EXCL.UNSOLD_6HO_UNSOLD_UNKNOWN;
  return null;
}

const n = (v: number | undefined) => (typeof v === "number" && Number.isFinite(v) && v > 0 ? v : 0);

/**
 * 6-6 후단 — 미분양매입임대 5호 이상, 또는 2호 ≥5·3호(같은 시·도) ≥2·5호 ≥5이면 그 유형과 합산해 5호 이상.
 * 유형별로 합산한다(문언 「제2호ㆍ제3호 또는 제5호」 — V-5). 2호·3호·5호 칸이 비면 0으로 보되, 그 때문에 못 넘으면 확인 필요.
 */
function unitIssue(input: RentalExclusionInput): string | null {
  const u = input.unsoldUnitCount;
  if (typeof u !== "number" || !Number.isFinite(u)) return COMPREHENSIVE_EXCL.UNSOLD_6HO_UNITS_UNKNOWN;
  const a = n(input.purchaseRental2hoCount);
  const b = n(input.existingRental3hoSameRegionCount);
  const c = n(input.reitRental5hoCount);
  const ok = u >= 5 || (a >= 5 && u + a >= 5) || (b >= 2 && u + b >= 5) || (c >= 5 && u + c >= 5);
  if (ok) return null;
  const blank = [input.purchaseRental2hoCount, input.existingRental3hoSameRegionCount, input.reitRental5hoCount].some(
    (v) => typeof v !== "number",
  );
  return blank ? COMPREHENSIVE_EXCL.UNSOLD_6HO_UNITS_UNKNOWN : COMPREHENSIVE_EXCL.UNSOLD_6HO_UNITS_UNDER_5;
}

/** 6-7 라목 */
function docsIssue(input: RentalExclusionInput): string | null {
  if (input.unsoldDocsSubmitted === true) return null;
  return input.unsoldDocsSubmitted === false
    ? COMPREHENSIVE_EXCL.UNSOLD_6HO_DOCS_NOT_SUBMITTED
    : COMPREHENSIVE_EXCL.UNSOLD_6HO_DOCS_UNKNOWN;
}

type AppStatus = "before" | "after" | "unknown";

/** 등록 신청일이 2020.7.11. 이후인가 — 신청일이 없으면 등록일이 7.11. 전일 때만 「전」(신청일 ≤ 등록일). */
function appliedAfterJuly11(input: RentalExclusionInput): AppStatus {
  const app = ms(input.rentalApplicationDate);
  if (app !== null) return app >= JULY_11_2020 ? "after" : "before";
  const reg = ms(input.rentalRegistrationDate);
  if (reg !== null && reg < JULY_11_2020) return "before";
  return "unknown";
}

/** 6-8~6-10 가목 단서 1)~3) */
function provisoIssues(input: RentalExclusionInput): string[] {
  if (input.assessmentDate.getTime() < ERA_GA_PROVISO) return [];
  const kind = input.rentalRegistrationKind;
  if (kind === undefined) return [COMPREHENSIVE_EXCL.UNSOLD_6HO_GA_UNKNOWN];
  if (kind === "other") return [];
  const out: string[] = [];
  let unknown = false;
  if (kind === "short_term") {
    // 1) 단기로 등록 신청(임대할 주택 추가 변경신고 포함)
    const s = appliedAfterJuly11(input);
    if (s === "after") out.push(COMPREHENSIVE_EXCL.UNSOLD_6HO_GA1_SHORT_AFTER_0711);
    else if (s === "unknown") unknown = true;
    return unknown ? [COMPREHENSIVE_EXCL.UNSOLD_6HO_GA_UNKNOWN] : out;
  }
  if (kind === "long_term_general") {
    // 2) 장기일반으로 등록 신청한 아파트
    const s = appliedAfterJuly11(input);
    if (s !== "before" && input.isApartment !== false) {
      if (s === "after" && input.isApartment === true) out.push(COMPREHENSIVE_EXCL.UNSOLD_6HO_GA2_APT_AFTER_0711);
      else unknown = true;
    }
  }
  // 3) 단기 → 장기일반·공공지원 변경신고
  if (input.convertedFromShortTerm !== false) {
    const changed = ms(input.shortTermConversionDate);
    if (input.convertedFromShortTerm === true && changed !== null) {
      if (changed >= JULY_11_2020) out.push(COMPREHENSIVE_EXCL.UNSOLD_6HO_GA3_CONVERTED_AFTER_0711);
    } else {
      unknown = true;
    }
  }
  if (unknown) out.push(COMPREHENSIVE_EXCL.UNSOLD_6HO_GA_UNKNOWN);
  return out;
}

/** 6호 고유 불성립 사유를 모두 돌려준다(6호가 아니면 빈 배열). */
export function unsoldPurchase6hoIssues(input: RentalExclusionInput): string[] {
  if (input.registrationType !== "unsold_purchase") return [];
  const issues = [unsoldIssue(input)];
  if (input.location === "metro") issues.push(COMPREHENSIVE_EXCL.UNSOLD_6HO_METRO); // 6-5 다목
  issues.push(unitIssue(input), docsIssue(input));
  return [...issues.filter((r): r is string => r !== null), ...provisoIssues(input)];
}
