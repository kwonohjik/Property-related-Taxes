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
 * 3. 입력한 임대주택이 **전 호** 통과해야 PASS (OH-14)
 *    §155⑳ 본문은 「장기임대주택 … 과 **그 밖의 1주택**을 국내에 소유하고 있는 1세대」다 — 요건을 못 갖춘
 *    임대주택은 장기임대주택이 아니라 일반 주택이므로, 한 호라도 탈락하면 거주주택은 「그 밖의 1주택」이
 *    아니다(조심 2023서7289 — 미등록 임대주택을 주택 수에서 빼고 1세대1주택 비과세를 적용할 수 없다).
 *    ㉑이 구제하는 것은 임대기간요건 미충족뿐이다.
 *    (의무임대기간만 못 채운 호는 §155㉑로 통과 — ㉒ 사후 추징 안내용으로 호 번호를 남긴다)
 *
 * 파생 함수(deriveEffectiveRegDate·deriveRentalArticle·deriveRequiredYears·deriveStdPriceCap)는
 * UI(⑤)·validate(⑧)가 그대로 import 재사용 — 판정 규칙 단일 소스(dual-truth 회피).
 *
 * 법령 근거: 소득세법 시행령 §155⑳·㉑·㉓ + §167조의3①2호
 * 연혁(마목 1) 포함·생애 1회·PHRP 1주택 한정): `../../data/rental-155-20-era.ts`
 */

import { TRANSFER_RENTAL_HOUSING } from "../../legal-codes/transfer";
import {
  isMa1IncludedIn15520,
  isLifetimeLimitEra155_20,
  needsPre2019ArticleScopeNotice,
} from "../../data/rental-155-20-era";
import { rentalStdPriceCap, rentalRequiredYears, RA_CUT } from "../../rental-article/rules";
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
  RentalHousingExceptionInput,
} from "./types";

/**
 * 호별 판정 외에 §155⑳이 요구하는 **거주주택·양도 시점 사실** (OH-15 · OH-16 · OH-40).
 * 계산기·판정 메뉴가 공유하는 `judgeRentalHousingEligibility`·`runRentalHousingExceptionStep`이 넘긴다.
 * 없으면(직접 호출 단위 테스트) 연혁 게이트를 판정하지 않는다 — 종전 동작.
 */
export type EligibilityContext = {
  scenario: RentalHousingExceptionInput["scenario"];
  /** 양도일 — 마목 1) 포함(OH-16)·생애 1회 구간(OH-40) 판정 */
  transferDate: Date;
  /** 양도하는 거주주택(B는 직전거주주택보유주택)의 취득일 — OH-40 부칙 제7조① 기준축 */
  residenceAcquisitionDate: Date;
} & Pick<
  RentalHousingExceptionInput,
  "postRegistrationResidenceMonths" | "priorRentalExemptionHistory" | "residenceTransitionUnderAddendum"
>;

/**
 * 종전 「민간임대주택에 관한 특별법」 임대의무기간(년) — §43①이 가리키는 §2 5호(장기일반 「8년 이상」)·
 * 6호(단기 「4년 이상」) (법률 제17482호 개정 전, MST 211593). §155㉓1호 1/2 판정 전용(OH-39).
 */
const TERMINATED_DUTY_YEARS: Record<NonNullable<RentalUnitInput["terminatedRegistrationType"]>, number> = {
  short_term: 4,
  long_term_general: 8,
};

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

/** 임대 구분(rentalCategory)별 등록시기 활성 판정 결과 (UI disabled·사유 표시용). */
export type CategoryAvailability = { available: boolean; reason?: string };

/**
 * 등록일 2필드로 **결정적으로 배제**되는 임대 구분 유형을 disabled 처리하기 위한 판정.
 * 배제 기준은 `rental-article/check.ts` checkArticleGates의 REG_DATE_GATE와 1:1(단일 소스, RA_CUT 재사용).
 *   - existing_business(나): 세무서 등록일 > 2003.10.29 이면 배제 (bizRegDateMax, check.ts:189)
 *   - short_6y(아·자): 등록기준일 max < 2025.6.4 이면 배제 (regDateMin, check.ts:186)
 * long_general·unsold_08_09(라)·pre_2018(구법)은 등록일 단독 배제 게이트가 없어 항상 활성.
 * 판정 불가(날짜 미입력)면 available=true — 조기 차단 금지(엔진 `?? 0` fail보다 관대·불리 미적용).
 */
export function deriveCategoryAvailability(
  businessRegistrationDate: Date | null,
  rentalRegistrationDate: Date | null,
): Record<RentalCategory, CategoryAvailability> {
  const bizTs = businessRegistrationDate?.getTime();
  const bizValid = bizTs != null && !Number.isNaN(bizTs);
  // 가드-내로잉: deriveEffectiveRegDate는 non-null Date 2개(types.ts:43,45)를 받으므로
  // Date|null을 직접 넘기면 TS2322. ternary 내부에서 두 값이 Date로 좁혀진다.
  const effRegDate =
    businessRegistrationDate && rentalRegistrationDate
      ? deriveEffectiveRegDate({ businessRegistrationDate, rentalRegistrationDate })
      : null;
  const effTs = effRegDate?.getTime() ?? null;

  const existingBusiness: CategoryAvailability =
    bizValid && bizTs > RA_CUT.Y2003_10_29
      ? { available: false, reason: "기존사업자(나목)는 세무서 사업자등록 2003.10.29 이전 등록분만 해당합니다." }
      : { available: true };

  const short6y: CategoryAvailability =
    effTs != null && effTs < RA_CUT.Y2025_06_04
      ? { available: false, reason: "단기 6년(아·자목)은 2025.6.4 이후 등록분만 해당합니다." }
      : { available: true };

  return {
    long_general: { available: true },
    short_6y: short6y,
    existing_business: existingBusiness,
    unsold_08_09: { available: true },
    pre_2018: { available: true },
  };
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
  if (rentalCategory === "existing_business") return "나"; // 기존사업자 매입임대(취득방법 매입 고정)
  if (rentalCategory === "unsold_08_09") return "라"; // 미분양 매입임대(취득방법 매입 고정)
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
    case "REG_DATE_GATE":
      return `${n}호: 해당 유형(${article}목)의 등록기준일 요건을 충족하지 않습니다(단기 6년 유형은 2025.6.4 이후 등록).`;
    case "SHORT_TO_LONG_CHANGE":
      return `${n}호: 단기임대에서 장기일반으로 변경신고한 주택은 §155⑳ 특례 대상이 아닙니다.`;
    case "NATIONAL_SIZE_REQUIRED":
      return `${n}호: 국민주택규모(전용 85㎡·수도권 도시지역 60㎡ 이하) 요건을 충족해야 합니다.`;
    case "REGION_RESTRICTED":
      return `${n}호: 해당 유형은 비수도권 소재 주택만 대상입니다.`;
    case "RENTAL_TERMINATION_RESTRICTED": {
      // ⑳ 경로에서는 ㉓(말소 후 5년 내 거주주택 양도)만 이 코드를 쓴다 — 사목은 ⑳에서 도출되지 않는다.
      const t = unit.terminatedRegistrationType;
      if (!t) {
        return `${n}호: 말소된 임대주택의 민간임대주택 등록 유형(단기 4년·장기일반 8년)을 선택해야 ${TRANSFER_RENTAL_HOUSING.PIT_RD_155_23} 1호(임대의무기간 1/2 이상)를 판정할 수 있습니다.`;
      }
      const duty = TERMINATED_DUTY_YEARS[t];
      return `${n}호: 자진말소는 「민간임대주택에 관한 특별법」 제43조 임대의무기간(${duty}년)의 1/2(${duty * 6}개월) 이상 임대해야 합니다 (현재: ${unit.rentalMonths}개월, ${TRANSFER_RENTAL_HOUSING.PIT_RD_155_23} 1호).`;
    }
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
  /**
   * §155의3① — 상생임대주택은 「**제155조제20항제1호** … 를 적용할 때 거주기간의 제한을 받지
   * 않는다」. 거주주택이 상생임대 요건을 갖춘 경우 호출부가 true를 넘긴다.
   * ⚠️ **보유 2년은 면제되지 않는다** — 법문이 면제하는 것은 거주기간뿐이다.
   */
  winWinResidenceExempt = false,
  ctx?: EligibilityContext,
): EligibilityResult {
  const residenceFailReasons: string[] = [];
  const notices: string[] = [];

  // ── 1. 거주주택 요건 ──
  if (residenceHoldYears < 2) {
    residenceFailReasons.push(
      `거주주택 보유기간 2년 미충족 (현재: ${residenceHoldYears}년)`,
    );
  }
  if (ctx?.scenario === "B") {
    /**
     * OH-15 — §155⑳1호 괄호: 직전거주주택보유주택의 거주기간은 「법 제168조에 따른 사업자등록과
     * 「민간임대주택에 관한 특별법」 제5조에 따른 임대사업자 등록을 한 날 … **이후의 거주기간**」이다
     * (MST 202148·207800·262425·286211 모두 같은 괄호). 전체 거주기간으로 판정하지 않는다.
     */
    const m = ctx.postRegistrationResidenceMonths;
    if (!winWinResidenceExempt) {
      if (m == null) {
        residenceFailReasons.push(
          "직전거주주택보유주택 — 사업자등록·임대사업자 등록 이후 거주기간을 입력하지 않아 거주요건(2년)을 판정할 수 없습니다 (소령 §155⑳1호)",
        );
      } else if (Math.floor(m / 12) < 2) {
        residenceFailReasons.push(
          `거주주택 거주기간(사업자등록·임대사업자 등록 이후) 2년 미충족 (현재: ${Math.floor(m / 12)}년 ${m % 12}개월)`,
        );
      }
    }
  } else if (residenceLiveYears < 2 && !winWinResidenceExempt) {
    residenceFailReasons.push(
      `거주주택 거주기간 2년 미충족 (현재: ${residenceLiveYears}년)`,
    );
  }

  /**
   * OH-40 — 대통령령 제29523호 부칙 제7조①(2019-02-12 이후 취득 거주주택)·제35349호 부칙 제14조
   * (2025-02-28 이후 양도분 삭제) 사이 구간의 두 괄호.
   */
  if (ctx) {
    const transition = ctx.residenceTransitionUnderAddendum === true;
    if (isLifetimeLimitEra155_20(ctx.residenceAcquisitionDate, ctx.transferDate, transition)) {
      if (ctx.scenario === "B") {
        // 「민간임대주택으로 등록한 사실이 있는 주택인 경우에는 1주택 외의 주택을 모두 양도한 후
        //   1주택을 보유하게 된 경우로 한정」 — 임대주택을 계속 보유 중이면 직전거주주택보유주택이 아니다.
        if (rentalUnits.length > 0) {
          residenceFailReasons.push(
            "2019.2.12 이후 취득한 직전거주주택보유주택을 2025.2.27 이전에 양도하는 경우, 1주택 외의 주택을 모두 양도한 후 1주택을 보유하게 된 경우에만 특례가 적용됩니다 — 임대주택을 계속 보유하고 있어 적용되지 않습니다 (소령 §155⑳ 후단 괄호, 대통령령 제29523호 부칙 제7조①)",
          );
        }
      } else if (ctx.priorRentalExemptionHistory === "used") {
        residenceFailReasons.push(
          "2019.2.12 이후 취득한 거주주택을 2025.2.27 이전에 양도하는 경우 장기임대주택 보유 중 생애 한 차례만 거주주택을 최초로 양도하는 경우에 한정됩니다 — 이미 거주주택을 양도해 특례를 적용받은 이력이 있어 적용되지 않습니다 (소령 §155⑳ 괄호, 대통령령 제29523호 부칙 제7조①)",
        );
      } else if (ctx.priorRentalExemptionHistory == null) {
        notices.push(
          "생애 한 차례 제한(2019.2.12 이후 취득 거주주택 · 2025.2.27 이전 양도 — 소령 §155⑳ 괄호, 대통령령 제29523호 부칙 제7조①)은 판정하지 않았습니다. 장기임대주택을 보유한 채 이미 거주주택을 양도해 이 특례를 적용받은 적이 있다면 적용되지 않습니다 — 판정 메뉴에서 이력을 입력하세요.",
        );
      }
    }
  }

  // ── 2. 임대주택 호별 요건 ──
  const unitFailReasons: RentalUnitFailReason[] = [];
  const perUnitVerdict: RentalUnitVerdict[] = [];
  let allUnitsPassed = rentalUnits.length > 0;
  const periodPendingUnitIndexes: number[] = [];
  const derivedArticles: RentalArticle[] = [];

  for (let i = 0; i < rentalUnits.length; i++) {
    const unit = rentalUnits[i];

    // 목 도출 + 공용 canonical predicate(check.ts)에 위임 — 판정 로직 단일 소스.
    const effectiveRegDate = deriveEffectiveRegDate(unit);
    const article = deriveRentalArticle(unit.rentalCategory, unit.rentalAcquisitionType, effectiveRegDate);
    derivedArticles.push(article);
    /**
     * OH-16 — 양도일 2021-02-17 이후 ⑳은 「같은 호 마목에 해당하는 주택의 경우에는 같은 목 1)에 따른
     * 주택[같은 목 2) 및 3)에 해당하지 않는 경우로 한정한다]을 **포함**한다」(대통령령 제31442호, 부칙
     * 제2조② 양도분). 공용 predicate의 마목 918 hard 배제(다주택 §167의3 축)를 이 경로에서만 끈다.
     * 2)(아파트)·3)(단기→장기 변경)은 APARTMENT_RESTRICTED·SHORT_TO_LONG_CHANGE로 그대로 남는다.
     * 양도일이 없으면(직접 호출) 종전대로 배제한다.
     */
    const ma1Included = article === "마" && ctx != null && isMa1IncludedIn15520(ctx.transferDate);
    const normalized: NormalizedRentalUnit = {
      businessRegistrationDate: unit.businessRegistrationDate,
      rentalRegistrationDate: unit.rentalRegistrationDate,
      isCapitalArea: unit.region === "seoul-metro",
      isApartment: unit.isApartment,
      rentalStartOfficialPrice: unit.standardPriceAtRentalStart,
      acquisitionOfficialPrice: unit.acquisitionOfficialPrice ?? 0, // 나목 cap 측정시점(취득당시)
      rentalYears: unit.rentalMonths / 12,
      landAreaM2: unit.landAreaM2,
      totalFloorAreaM2: unit.totalFloorAreaM2,
      hasMinimum2Units: unit.hasMinimum2Units,
      hasMinimum5UnitsInCity: unit.hasMinimum5UnitsInCity, // 라목
      firstSaleContractDate: unit.firstSaleContractDate, // 라목
      isNationalSizeHousing: unit.isNationalSizeHousing, // 나목
      isExcluded918Rule: ma1Included ? false : unit.isExcluded918Rule, // 마 hard·아 carve-out
      hasContractDepositProof: unit.hasContractDepositProof, // 아 carve-out
      isExcludedShortToLongChange: unit.isExcludedShortToLongChange, // 마·바
      rentIncreaseUnder5Pct: unit.requirementsConfirmed, // §155⑳ 묶음 확인 → 5%룰 매핑
    };
    const result = checkRentalArticle(article, normalized);

    /**
     * OH-41 — §155⑳2호(「양도일 현재 법 제168조에 따른 사업자등록을 하고, 장기임대주택을 … 민간임대주택으로
     * 등록하여 임대하고 있으며, 임대료등의 증가율이 100분의 5를 초과하지 않을 것」)는 목을 가리지 않는 ⑳ 고유
     * 요건이다. 공용 predicate의 `fivePct`는 §167의3 목별 문언(나·라목엔 5% 문언 없음)이라 나·라목에서
     * 이 요건이 통째로 빠졌다 — ⑳ 경로에서는 전 목에 자기확인을 요구한다.
     */
    if (!unit.requirementsConfirmed && !result.failCodes.includes("REQUIREMENTS_NOT_CONFIRMED")) {
      result.failCodes.push("REQUIREMENTS_NOT_CONFIRMED");
      result.passed = false;
    }

    /**
     * §155㉓ 말소 특례 — 가·다·라·마목 임대주택이 자진말소·자동말소되고 말소 이후 5년 이내 거주주택
     * 양도 시 임대기간요건 간주 충족(RENTAL_PERIOD_SHORT 억제).
     *
     * OH-39 — ㉓1호 자진말소의 「2분의 1」은 「같은 법(민특법) 제43조에 따른 **임대의무기간**」 기준이다
     * (단기 4년 → 24개월 · 장기일반 8년 → 48개월). 종전에는 소득세법 목별 임대기간요건(`requiredYears`,
     * 가목 5년 → 30개월)을 썼다. 자동말소(㉓2호)는 임대의무기간 종료일 말소라 이 1/2을 언제나 넘는다.
     * 등록 유형을 모르면 판정하지 않는다(간주 충족을 주지 않는다).
     */
    const dutyYears = unit.terminatedRegistrationType
      ? TERMINATED_DUTY_YEARS[unit.terminatedRegistrationType]
      : null;
    const terminationEligibleArticle =
      article === "가" || article === "다" || article === "라" || article === "마";
    const terminationRelief =
      unit.rentalAutoTermination &&
      terminationEligibleArticle &&
      dutyYears != null &&
      unit.rentalMonths >= dutyYears * 6;
    if (
      unit.rentalAutoTermination &&
      terminationEligibleArticle &&
      !terminationRelief &&
      result.failCodes.includes("RENTAL_PERIOD_SHORT")
    ) {
      // 기간 미달의 실제 사유는 ㉓1호 불충족이다 — 「의무임대기간 5년 미충족」이 아니라 그 사유를 낸다.
      result.failCodes = result.failCodes.map((c) =>
        c === "RENTAL_PERIOD_SHORT" ? "RENTAL_TERMINATION_RESTRICTED" : c,
      );
    }
    // §155㉑ — 임대기간요건을 **충족하기 전에** 거주주택을 양도해도 장기임대주택으로 보아 ⑳을 적용한다.
    // 면제되는 것은 기간 요건뿐이다(다른 실패 코드는 그대로). 말소된 주택은 양도일 현재 임대 중이
    // 아니므로(⑳2호) ㉓으로만 풀린다. ㉑로 통과한 호는 ㉒ 사후 추징 대상이라 따로 남긴다.
    const periodPending = !unit.rentalAutoTermination && result.failCodes.includes("RENTAL_PERIOD_SHORT");
    if ((terminationRelief || periodPending) && result.failCodes.includes("RENTAL_PERIOD_SHORT")) {
      result.failCodes = result.failCodes.filter((c) => c !== "RENTAL_PERIOD_SHORT");
      result.passed = result.failCodes.length === 0;
    }
    if (periodPending && result.passed) periodPendingUnitIndexes.push(i);

    perUnitVerdict.push({
      unitIndex: i,
      derivedArticle: article,
      requiredYears: result.requiredYears,
      stdPriceCap: result.stdPriceCap,
      effectiveRegDate: effectiveRegDate ? effectiveRegDate.toISOString().slice(0, 10) : "",
      sizeRequired: isConstructionArticle(article),
    });

    if (!result.passed) {
      allUnitsPassed = false;
      for (const code of result.failCodes) {
        unitFailReasons.push({
          unitIndex: i,
          code,
          message: buildFailMessage(code, i, article, result.requiredYears, result.stdPriceCap, unit),
        });
      }
    }
  }

  const passed = residenceFailReasons.length === 0 && allUnitsPassed;

  if (
    ctx &&
    needsPre2019ArticleScopeNotice(
      ctx.residenceAcquisitionDate,
      ctx.residenceTransitionUnderAddendum === true,
      derivedArticles,
    )
  ) {
    notices.push(
      "2019.2.12 이전에 취득한 거주주택(또는 부칙 경과조치 해당)과 함께 마목·바목 임대주택을 보유하고 있습니다. 대통령령 제29523호 부칙 제7조①은 2019.2.12 개정(장기임대주택 범위를 가~라목에서 가~바목으로 확대)을 「시행 이후 취득하는 주택부터」 적용한다고 정하고 있어, 이 거주주택에 마목·바목 임대주택이 장기임대주택으로 인정되는지 확인이 필요합니다. 이 계산은 현행 문언대로 인정했습니다.",
    );
  }

  return {
    passed,
    failReasons: unitFailReasons,
    residenceFailReasons,
    laws: [TRANSFER_RENTAL_HOUSING.PIT_RD_155_20],
    perUnitVerdict,
    periodPendingUnitIndexes,
    ...(notices.length > 0 ? { notices } : {}),
  };
}
