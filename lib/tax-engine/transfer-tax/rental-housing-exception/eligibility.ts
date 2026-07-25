/**
 * 장기임대주택 거주주택 비과세 특례 — §155⑳ 3요건 자동 판정
 *
 * 판정 순서:
 * 1. 거주주택 요건 (보유 2년 + 거주 2년)
 * 2. 임대주택 호별 요건:
 *    (a) 사업자등록등 완비 (세무서 §168 + 지자체 민특법§5 둘 다)
 *    (b) 등록기준일(둘 중 늦은 날)·취득방법에서 도출한 목별 의무임대기간
 *    (c) 도출 목·지역별 임대개시일 기준시가 상한
 *    (d) 아파트 등록 제한 / 단기 조정대상지역 / 건설 규모·호수
 *    (e) 기타 요건 자기확인
 * 3. 1호라도 통과하면 PASS
 *
 * 파생 함수(deriveEffectiveRegDate·deriveRentalArticle·deriveRequiredYears·deriveStdPriceCap)는
 * UI(⑤)·validate(⑧)가 그대로 import 재사용 — 판정 규칙 단일 소스(dual-truth 회피).
 *
 * 법령 근거: 소득세법 시행령 §155⑳ + §167조의3①2호
 */

import { TRANSFER_RENTAL_HOUSING } from "../../legal-codes/transfer";
import { rentalStdPriceCap, rentalRequiredYears } from "../../rental-article/rules";
import {
  checkRentalArticle,
  isConstructionArticle,
  isApartmentRestrictedForArticle,
  type NormalizedRentalUnit,
  type ArticleFailCode,
} from "../../rental-article/check";
import type {
  RentalUnitInput,
  RentalCategory,
  RentalArticle,
  RegionType,
  EligibilityResult,
  RentalUnitFailReason,
  RentalUnitVerdict,
} from "./types";

// ============================================================
// 날짜 경계 상수 (§167조의3①2호·§155⑳)
// ============================================================

const CUT_2020_07_11 = new Date("2020-07-11").getTime();

// ============================================================
// 파생 함수 (단일 소스 — UI·validate 재사용)
// ============================================================

/**
 * 등록기준일 = max(세무서 §168, 지자체 민특법§5) — 둘 중 늦은 날.
 * 두 등록이 모두 완료된 날 = "사업자등록등" 완비일 = 임대개시 가능 시점.
 * 하나라도 미입력(Invalid Date)이면 null 반환 → 상위에서 BOTH_REG_REQUIRED로 배제.
 */
export function deriveEffectiveRegDate(
  unit: Pick<RentalUnitInput, "businessRegistrationDate" | "rentalRegistrationDate">,
): Date | null {
  const bTs = unit.businessRegistrationDate?.getTime?.();
  const rTs = unit.rentalRegistrationDate?.getTime?.();
  if (bTs == null || rTs == null || Number.isNaN(bTs) || Number.isNaN(rTs)) return null;
  return new Date(Math.max(bTs, rTs));
}

/**
 * 도출 엔진 목 (§167조의3①2호 가~자).
 * long_general은 취득방법 × 등록기준일 경계로 가/마(매입)·다/바(건설).
 */
export function deriveRentalArticle(
  rentalCategory: RentalCategory,
  acqType: "purchase" | "construction",
  effectiveRegDate: Date | null,
): RentalArticle {
  if (rentalCategory === "pre_2018") return "구법";
  if (rentalCategory === "short_6y") return acqType === "construction" ? "자" : "아";
  // long_general
  const regTs = effectiveRegDate?.getTime() ?? 0;
  if (acqType === "construction") {
    return regTs < CUT_2020_07_11 ? "다" : "바";
  }
  return regTs < CUT_2020_07_11 ? "가" : "마";
}

/**
 * 도출 목·등록기준일에 따른 의무임대기간(년). 공용 `rental-article/rules.ts` 위임(단일 소스).
 */
export function deriveRequiredYears(
  article: RentalArticle,
  effectiveRegDate: Date | null,
): number {
  return rentalRequiredYears(article, effectiveRegDate?.getTime() ?? 0);
}

/**
 * 도출 목·지역·등록기준일별 기준시가 상한(원). 공용 `rental-article/rules.ts` 위임(단일 소스).
 * F5: 바목은 등록기준일 2025.2.28 경계로 6억/9억 분기(다주택 정합).
 */
export function deriveStdPriceCap(
  article: RentalArticle,
  region: RegionType,
  effectiveRegDate: Date | null,
): number {
  return rentalStdPriceCap(article, region === "seoul-metro", effectiveRegDate?.getTime() ?? 0);
}

/**
 * 아파트 등록 제한 — 공용 `rental-article/check.ts` 위임 재수출(UI·validate 하위호환).
 * 로직 단일 소스는 `isApartmentRestrictedForArticle`(check.ts).
 */
export const isApartmentRestricted = isApartmentRestrictedForArticle;

// ============================================================
// 호별 미충족 메시지 빌더 (checkRentalArticle failCode → §155⑳ 한국어 메시지)
// ============================================================

function buildFailMessage(
  code: ArticleFailCode,
  i: number,
  article: RentalArticle,
  requiredYears: number,
  stdPriceCap: number,
  unit: RentalUnitInput,
): string {
  const n = i + 1;
  switch (code) {
    case "BOTH_REG_REQUIRED":
      return `${n}호: 세무서 사업자등록일과 지자체 임대사업자등록신청일을 모두 입력해야 합니다(사업자등록등).`;
    case "RENTAL_PERIOD_SHORT":
      return `${n}호 의무임대기간 ${requiredYears}년 미충족 (현재: ${Math.floor(unit.rentalMonths / 12)}년 ${unit.rentalMonths % 12}개월)`;
    case "STANDARD_PRICE_EXCEEDED":
      return `${n}호 임대개시일 기준시가 ${(stdPriceCap / 100_000_000).toFixed(0)}억원 초과 (입력값: ${(unit.standardPriceAtRentalStart / 100_000_000).toFixed(2)}억원)`;
    case "APARTMENT_RESTRICTED":
      return `${n}호: 해당 유형(${article}목)에서 아파트는 §155⑳ 특례 대상이 아닙니다.`;
    case "SHORT_TERM_REGULATED":
      return `${n}호: 조정대상지역에 신규취득한 단기임대(아목)는 §155⑳ 특례 불가.`;
    case "SIZE_REQUIRED":
      return `${n}호: 건설임대는 대지면적·연면적을 입력해야 규모요건(대지 298㎡·연면적 149㎡ 이하)을 판정할 수 있습니다.`;
    case "SIZE_EXCEEDED":
      return `${n}호: 건설임대 규모요건 초과 (대지 ${unit.landAreaM2}㎡·연면적 ${unit.totalFloorAreaM2}㎡ — 각 298㎡·149㎡ 이하 필요).`;
    case "MIN_UNITS_NOT_MET":
      return `${n}호: 건설임대는 2호 이상 임대 요건을 충족해야 합니다.`;
    case "REQUIREMENTS_NOT_CONFIRMED":
      return `${n}호: 기타 요건(임대료 5% 이내 증액·임대사업자 등록·임대료 지급 등) 확인 필요`;
    default:
      return `${n}호: 임대주택 요건 미충족`;
  }
}

// ============================================================
// 메인 판정 함수
// ============================================================

/**
 * §155⑳ 3요건 자동 판정
 *
 * @param rentalUnits 임대주택 배열 (최소 1호)
 * @param residenceHoldYears 거주주택 보유연수
 * @param residenceLiveYears 거주주택 거주연수
 */
export function checkEligibility(
  rentalUnits: RentalUnitInput[],
  residenceHoldYears: number,
  residenceLiveYears: number,
): EligibilityResult {
  const residenceFailReasons: string[] = [];

  // ── 1. 거주주택 요건 ──
  if (residenceHoldYears < 2) {
    residenceFailReasons.push(
      `거주주택 보유기간 2년 미충족 (현재: ${residenceHoldYears}년)`,
    );
  }
  if (residenceLiveYears < 2) {
    residenceFailReasons.push(
      `거주주택 거주기간 2년 미충족 (현재: ${residenceLiveYears}년)`,
    );
  }

  // ── 2. 임대주택 호별 요건 ──
  const unitFailReasons: RentalUnitFailReason[] = [];
  const perUnitVerdict: RentalUnitVerdict[] = [];
  let anyUnitPassed = false;

  for (let i = 0; i < rentalUnits.length; i++) {
    const unit = rentalUnits[i];

    // 목 도출 + 공용 canonical predicate(check.ts)에 위임 — 판정 로직 단일 소스.
    const effectiveRegDate = deriveEffectiveRegDate(unit);
    const article = deriveRentalArticle(unit.rentalCategory, unit.rentalAcquisitionType, effectiveRegDate);
    const normalized: NormalizedRentalUnit = {
      effectiveRegDate,
      isCapitalArea: unit.region === "seoul-metro",
      isApartment: unit.isApartment,
      rentalStartOfficialPrice: unit.standardPriceAtRentalStart,
      rentalYears: unit.rentalMonths / 12,
      landAreaM2: unit.landAreaM2,
      totalFloorAreaM2: unit.totalFloorAreaM2,
      hasMinimum2Units: unit.hasMinimum2Units,
      isRegulatedAreaNewAcq: unit.isRegulatedAreaNewAcq,
      rentIncreaseUnder5Pct: unit.requirementsConfirmed, // §155⑳ 묶음 확인 → 5%룰 매핑
    };
    const result = checkRentalArticle(article, normalized);

    perUnitVerdict.push({
      unitIndex: i,
      derivedArticle: article,
      requiredYears: result.requiredYears,
      stdPriceCap: result.stdPriceCap,
      effectiveRegDate: effectiveRegDate ? effectiveRegDate.toISOString().slice(0, 10) : "",
      sizeRequired: isConstructionArticle(article),
    });

    if (result.passed) {
      anyUnitPassed = true;
    } else {
      for (const code of result.failCodes) {
        unitFailReasons.push({
          unitIndex: i,
          code,
          message: buildFailMessage(code, i, article, result.requiredYears, result.stdPriceCap, unit),
        });
      }
    }
  }

  const passed = residenceFailReasons.length === 0 && anyUnitPassed;

  return {
    passed,
    failReasons: unitFailReasons,
    residenceFailReasons,
    laws: [TRANSFER_RENTAL_HOUSING.PIT_RD_155_20],
    perUnitVerdict,
  };
}
