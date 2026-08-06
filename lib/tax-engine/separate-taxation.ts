/**
 * 재산세 분리과세대상 판정 및 세액 계산 엔진 (P5-02~08)
 *
 * 지방세법 §106①3호    — 분리과세대상 (종합합산·별도합산 배제)
 * 지방세법 시행령 §102  — 분리과세 대상 범위 (저율·일반·중과)
 * 지방세법 §111①1호 다목 — 분리과세 세율 0.07%/0.2%/4%
 * 지방세법 §113①2호   — 과세표준: 시가표준액 × 70%, 천원 절사
 *
 * 분리과세 법적 성격:
 *   - 종합합산·별도합산과 배제: 소유자별 합산 없이 건별 단일세율 과세
 *   - 종합부동산세 배제: 분리과세 토지는 종부세 과세대상 아님 (종부세법 §11)
 *   - 누진세율 미적용: 단일세율 과세
 *
 * 판정 우선순위: 중과(4%) → 저율(0.07%) → 일반(0.2%) → 비해당
 */

import { applyRate, truncateToThousand } from "./tax-utils";
import { computeFactoryStandardArea } from "./factory-standard-area";
import { computeLivestockStandardArea } from "./livestock-standard-area";
import { TaxCalculationError, TaxErrorCode } from "./tax-errors";
import { PROPERTY } from "./legal-codes";
import { getCurrentPropertyRateSet } from "./data/property-rate-history";
import type { PropertyRateSet } from "./data/property-rate-history";

// ============================================================
// P5-02: 타입 정의
// ============================================================

/**
 * 분리과세 세율 구간
 * - low_rate : 0.07% — 자경 농지·목장용지·보전산지
 * - standard : 0.2%  — 공장용지·염전·터미널·공영주차장
 * - heavy    : 4%    — 회원제 골프장·고급오락장
 */
export type SeparateTaxationCategory = "low_rate" | "standard" | "heavy";

/**
 * 골프장 유형
 * - member : 회원제 → 중과(4%)
 * - public : 대중제 → 중과 배제
 * - simple : 간이   → 중과 배제
 */
export type GolfCourseType = "member" | "public" | "simple";

/**
 * 분리과세 판정 입력
 */
export interface SeparateTaxationInput {
  // ── 기본 정보 ──
  /** 시가표준액 (원) — 과세표준 계산 기초 */
  assessedValue: number;
  /** 지목 코드 (예: "전", "답", "과수원", "임야", "잡종지") */
  landCategory?: string;
  /** 실제 사용 현황 (판정 근거 기록용) */
  actualUsage?: string;

  // ── 저율(0.07%) 판정용 ──
  /** 농지 자경 요건 충족 (농지원부 등재 + 사실상 자경) */
  isFarmland?: boolean;
  /** 목장용지 + 축산용 사용 (기준면적 판정은 아래 3필드로 계산한다) */
  isLivestockFarm?: boolean;
  /** 목장용지 전체 면적 (㎡) — §102①3호 "…계산한 토지면적의 **범위에서** 소유하는 토지" */
  pastureTotalLandArea?: number;
  /** 축종 키 — `LIVESTOCK_STANDARD` (「지방세법 시행령」 §102①3호 [표] 9종) */
  pastureLivestockType?: string;
  /**
   * 가축 마릿수 — **과세기준일이 속하는 해의 직전 연도 · 연중 최고** 마릿수 (§102①3호 본문).
   * ⚠️ 양도세(별표1의3 2호)의 「과세기간 평균」과 **다른 기준**이다 — 재사용 금지.
   */
  pastureLivestockCount?: number;
  /**
   * §102⑨1호 — **도시지역** 목장용지는 1989.12.31 이전부터 소유한 것으로 한정
   * (1990.1.1 이후 상속·법인합병 취득 포함). 도시지역이면 이 값이 필요하다.
   */
  pastureIsUrbanArea?: boolean;
  /** §102⑨1호 요건 충족 여부 — `pastureIsUrbanArea`가 true일 때만 본다 */
  pastureOwnedBefore1990?: boolean;
  /** 공익용 보전산지·임업후계림 */
  isProtectedForest?: boolean;

  // ── 일반(0.2%) 판정용 ──
  /** 공장용지 (읍·면·산업단지·공업지역 내, 공장입지기준면적 이내) */
  isFactoryLand?: boolean;
  /** 공장 입지 유형 */
  factoryLocation?: "industrial_zone" | "urban" | "other";
  /**
   * 공장 전체 부속토지 면적 (㎡) — 「1구의 공장」 기준.
   * 「지방세법 시행령」 §102①1호가 "공장입지기준면적 **범위의** 토지"로 한정하므로 필수다.
   */
  factoryTotalLandArea?: number;
  /** 공장건축물 **연면적** (㎡) — 바닥면적이 아니다 (별표6 2호가) */
  factoryFloorArea?: number;
  /** 업종별 기준공장면적률 (%) — 「공장입지 기준고시」 별표1 */
  factoryAreaRatePercent?: number;
  /** 별표6 3호가1) 「산집법」 §20① 제한지역 — 추가 인정한도 10%(3,000㎡) / 그 밖 20% */
  factoryIsRestrictedZone?: boolean;
  /** 별표6 3호나·다·라·바 추가 인정면적 (㎡). **마목 제외** — 부속토지 면적 쪽에 넣는다. */
  factoryAdditionalRecognizedArea?: number;
  /** §102①1호 **단서** — 허가 미이행·사용승인 미이행 공장용 건축물 → 분리과세 전량 제외 */
  factoryIsUnpermitted?: boolean;
  /** 염전 (염화나트륨 생산에 직접 사용) */
  isSaltField?: boolean;
  /** 여객·화물터미널 또는 공영주차장 부속토지 */
  isTerminalOrParking?: boolean;

  // ── 중과(4%) 판정용 ──
  /** 골프장 부속토지 여부 */
  isGolfCourse?: boolean;
  /**
   * 골프장 유형 — 미입력 시 경고 후 보수적으로 중과 미적용
   * member: 회원제(중과) / public: 대중제(배제) / simple: 간이(배제)
   */
  golfCourseType?: GolfCourseType;
  /** 고급오락장 (카지노·유흥주점 등) 부속토지 */
  isHighClassEntertainment?: boolean;

  // ── 공통 ──
  /** 토지 면적 (㎡) — 기준면적 초과 여부 참고 */
  area?: number;
  /** 소유자 유형 */
  ownerType?: "individual" | "corporation";
}

/**
 * 분리과세 판정 결과
 */
export interface SeparateTaxationResult {
  /** 분리과세 대상 여부 */
  isApplicable: boolean;
  /** 분리과세 구간 */
  category?: SeparateTaxationCategory;
  /** 적용 세율 (0.0007 / 0.002 / 0.04) */
  appliedRate?: number;

  /** 과세표준 = 시가표준액 × 70%, 천원 절사 (calculateSeparateTaxationTax 호출 후 채워짐) */
  taxBase?: number;
  /** 공정시장가액비율 (0.70) */
  fairMarketRatio?: number;
  /** 산출세액 = 과세표준 × 단일세율, 원 미만 절사 */
  calculatedTax?: number;

  /** 판정 근거 */
  reasoning: {
    /** PROPERTY.SEPARATE.* 법령 상수 */
    legalBasis: string;
    /** 판정된 구체 조건 설명 */
    matchedCondition: string;
    /**
     * 배제된 합산 유형
     * - comprehensive      : 종합합산에서 배제
     * - special_aggregated : 별도합산에서 배제
     */
    excludedFrom: ("comprehensive" | "special_aggregated")[];
  };

  /** 감면 특례 (해당 시) */
  reduction?: {
    reductionRate: number;
    reducedTaxAmount: number;
    legalBasis: string;
  };

  /**
   * 면적 한도 판정 결과 — 한도가 조문에 명시된 두 subtype에만 붙는다.
   *
   *   `factoryAreaCheck` — 공장용지 (§102①1호 · 시행규칙 §50 [별표6])
   *   `pastureAreaCheck` — 목장용지 (§102①3호 [표] 가축별 기준면적)
   *
   * 초과분은 분리과세에서 빠져 **종합합산**으로 이관된다. 다만 종합합산은 인별 전국 합산이라
   * 단일 필지 계산기에서 세액을 낼 수 없다 — `excessAssessedValue`를 경고로 안내만 한다
   * (별도합산 `totalExcessOfficialValue`와 같은 취급).
   */
  pastureAreaCheck?: SeparateTaxationResult["factoryAreaCheck"];

  /** 공장용지 면적 한도 판정 — 위 주석 참조 */
  factoryAreaCheck?: {
    /** 별표6 공장입지기준면적 (㎡) */
    standardArea: number;
    /** 분리과세 인정면적 = min(부속토지, 기준면적) (㎡) */
    recognizedArea: number;
    /** 종합합산 이관 면적 (㎡) */
    excessArea: number;
    /** 인정 비율 (0~1) — 과세표준 안분에 쓰인다 */
    recognizedRatio: number;
    /** 분리과세분 시가표준액 (원) */
    recognizedAssessedValue: number;
    /** 종합합산 이관분 시가표준액 (원) */
    excessAssessedValue: number;
  };

  warnings: string[];
}

// ============================================================
// 내부 상수
// ============================================================

/** 분리과세 공정시장가액비율 (70%) */
const FAIR_MARKET_RATIO = 0.70;
// 분리 세율(저율 0.0007·일반 0.002·중과 0.04)은 역사표 PropertyRateSet.landSeparated*로 이관
// (§111①1호 다목, Track A). 미러 검증: property-rate-history-anchor·sep-rateset-anchor A-4.

// ============================================================
// P5-03: 저율(0.07%) 판정 — 농지·목장·보전산지
// ============================================================

type ClassifyPartial = {
  isApplicable: true;
  category: SeparateTaxationCategory;
  appliedRate: number;
  reasoning: SeparateTaxationResult["reasoning"];
  /** 공장용지만 — 면적 한도 판정 결과 (과세표준 안분 근거) */
  factoryAreaCheck?: SeparateTaxationResult["factoryAreaCheck"];
  /** 목장용지만 — 면적 한도 판정 결과 (과세표준 안분 근거) */
  pastureAreaCheck?: SeparateTaxationResult["factoryAreaCheck"];
} | null;

/**
 * 면적 한도 초과분을 시가표준액으로 안분한다 — 공장용지·목장용지 공통.
 *
 * 초과분은 분리과세에서 빠져 **종합합산**으로 이관되는데, 종합합산은 **인별 전국 합산**이라
 * 단일 필지 계산기가 세율을 정할 수 없다 ⇒ 별도합산 경로(`totalExcessOfficialValue`)와 동일하게
 * 세액에 반영하지 않고 **경고로 안내**만 한다. 분리과세 과세표준은 인정분에만 매긴다.
 *
 * 금액은 원 미만 절사(세법 floor)하고 **잔액은 초과분이 흡수**해 합을 보존한다.
 */
function apportionByArea(totalArea: number, standardArea: number, assessedValue: number) {
  const recognizedArea = Math.min(totalArea, standardArea);
  const excessArea = Math.max(0, totalArea - standardArea);
  const recognizedRatio = recognizedArea / totalArea;
  const recognizedAssessedValue = Math.floor(assessedValue * recognizedRatio);
  return {
    standardArea,
    recognizedArea,
    excessArea,
    recognizedRatio,
    recognizedAssessedValue,
    excessAssessedValue: assessedValue - recognizedAssessedValue,
  };
}

/**
 * 「지방세법 시행령」 §102①3호 목장용지 면적 한도 판정.
 *
 * 기준면적 = (축사 + 부대시설 + max(초지, 사료밭)) × 마릿수 ÷ 가축두수 단위
 *
 * ⚠️ **마릿수는 「직전 연도 연중 최고」다**(§102①3호 본문) — 양도세 별표1의3 2호의
 * 「과세기간 평균」과 다른 기준이므로 두 세목이 같은 값을 쓰면 안 된다.
 *
 * 미입력을 통과시키지 않는다: §102①3호는 대상을 "…계산한 토지면적의 **범위에서** 소유하는
 * 토지"로 한정하므로, 축종·마릿수가 없으면 범위를 알 수 없다. 모른 채 전량 분리과세(0.07%)를
 * 주면 종합합산 누진(0.2~0.5%)보다 훨씬 낮아 **납세자에게 유리한 추정**이 된다 ⇒ 던진다.
 */
function judgePastureAreaLimit(input: SeparateTaxationInput) {
  const totalArea = input.pastureTotalLandArea ?? 0;
  const type = input.pastureLivestockType ?? "";
  const count = input.pastureLivestockCount ?? 0;

  if (totalArea <= 0) {
    throw new TaxCalculationError(
      TaxErrorCode.INVALID_INPUT,
      "목장용지 분리과세 판정에는 목장용지 전체 면적(pastureTotalLandArea)이 필요합니다. " +
      "「지방세법 시행령」 §102①3호는 가축별 기준면적으로 계산한 토지면적의 범위로 한정합니다.",
    );
  }
  if (!type || count <= 0) {
    throw new TaxCalculationError(
      TaxErrorCode.INVALID_INPUT,
      "목장용지 분리과세 판정에는 축종(pastureLivestockType)과 가축 마릿수" +
      "(pastureLivestockCount)가 필요합니다. 마릿수는 과세기준일이 속하는 해의 " +
      "**직전 연도 연중 최고** 마릿수입니다(「지방세법 시행령」 §102①3호).",
    );
  }

  const standardArea = computeLivestockStandardArea(type, count);
  if (standardArea <= 0) {
    throw new TaxCalculationError(
      TaxErrorCode.INVALID_INPUT,
      `등재되지 않은 축종입니다(${type}). 「지방세법 시행령」 §102①3호 [표]의 9종` +
      "(한우 사육·한우 비육·젖소·양·사슴·토끼·돼지·가금·밍크) 중에서 선택하세요.",
    );
  }

  return { totalArea, ...apportionByArea(totalArea, standardArea, input.assessedValue) };
}

/**
 * 저율(0.07%) 분리과세 판정 (지방세법 §111①1호 다목(1), 시행령 §102①)
 *
 * 판정 순서:
 * 1. 농지 자경 (isFarmland)
 * 2. 목장용지 (isLivestockFarm) — §102⑨1호 도시지역 게이트 + 가축별 기준면적 한도
 * 3. 보전산지 (isProtectedForest)
 */
function classifyLowRate(
  input: SeparateTaxationInput,
  warnings: string[],
  rateSet: PropertyRateSet = getCurrentPropertyRateSet(),
): ClassifyPartial {
  if (input.isFarmland) {
    return {
      isApplicable: true,
      category: "low_rate",
      appliedRate: rateSet.landSeparatedLow,
      reasoning: {
        legalBasis: PROPERTY.SEPARATE.LOW_RATE_FARMLAND,
        matchedCondition: "농지원부 등재 + 사실상 자경 농지 (전·답·과수원)",
        excludedFrom: ["comprehensive", "special_aggregated"],
      },
    };
  }

  if (input.isLivestockFarm) {
    // §102⑨1호 — **도시지역** 목장용지는 1989.12.31 이전부터 소유한 것으로 한정한다
    // (1990.1.1 이후 상속·법인합병 취득 포함). 도시지역 밖은 이 제한을 받지 않는다.
    if (input.pastureIsUrbanArea && !input.pastureOwnedBefore1990) {
      warnings.push(
        "도시지역의 목장용지는 1989년 12월 31일 이전부터 소유한 것(1990년 1월 1일 이후 상속·" +
        "법인합병으로 취득한 경우 포함)으로 한정됩니다(「지방세법 시행령」 §102⑨1호). " +
        "해당하지 않아 분리과세 대상이 아닙니다.",
      );
      return null;
    }

    const areaCheck = judgePastureAreaLimit(input);
    if (areaCheck.recognizedArea <= 0) {
      warnings.push(
        `목장용지 ${areaCheck.totalArea}㎡가 가축별 기준면적 ` +
        `${areaCheck.standardArea.toFixed(2)}㎡를 전부 초과합니다 — 분리과세 대상이 없습니다.`,
      );
      return null;
    }
    if (areaCheck.excessArea > 0) {
      warnings.push(
        `목장용지 ${areaCheck.totalArea}㎡ 중 ${areaCheck.recognizedArea.toFixed(2)}㎡는 ` +
        `분리과세(가축별 기준면적 ${areaCheck.standardArea.toFixed(2)}㎡ 이내), ` +
        `${areaCheck.excessArea.toFixed(2)}㎡(시가표준액 ` +
        `${areaCheck.excessAssessedValue.toLocaleString()}원)는 기준면적 초과로 ` +
        "종합합산과세대상으로 이관됩니다. 인별 합산 계산 시 별도 처리가 필요합니다.",
      );
    }

    return {
      isApplicable: true,
      category: "low_rate",
      appliedRate: rateSet.landSeparatedLow,
      reasoning: {
        legalBasis: PROPERTY.SEPARATE.LOW_RATE_LIVESTOCK,
        matchedCondition: "축산용 목장용지 (가축별 기준면적 이내)",
        excludedFrom: ["comprehensive", "special_aggregated"],
      },
      pastureAreaCheck: {
        standardArea: areaCheck.standardArea,
        recognizedArea: areaCheck.recognizedArea,
        excessArea: areaCheck.excessArea,
        recognizedRatio: areaCheck.recognizedRatio,
        recognizedAssessedValue: areaCheck.recognizedAssessedValue,
        excessAssessedValue: areaCheck.excessAssessedValue,
      },
    };
  }

  if (input.isProtectedForest) {
    return {
      isApplicable: true,
      category: "low_rate",
      appliedRate: rateSet.landSeparatedLow,
      reasoning: {
        legalBasis: PROPERTY.SEPARATE.LOW_RATE_FOREST,
        matchedCondition: "공익용 보전산지 또는 임업후계림",
        excludedFrom: ["comprehensive", "special_aggregated"],
      },
    };
  }

  return null;
}

// ============================================================
// P5-04: 일반(0.2%) 판정 — 공장·염전·터미널·주차장
// ============================================================

/**
 * 일반(0.2%) 분리과세 판정 (지방세법 시행령 §102②)
 *
 * 판정 순서:
 * 1. 공장용지 (isFactoryLand) — 도시지역 공장 기준면적 초과 경고
 * 2. 염전 (isSaltField)
 * 3. 터미널·공영주차장 (isTerminalOrParking)
 */
/**
 * 「지방세법 시행령」 §102①1호 면적 한도 판정 — 시행규칙 §50 [별표6].
 *
 * ## 미입력을 통과시키지 않는다
 *
 * §102①1호는 분리과세 대상을 "공장입지기준면적 **범위의** 토지"로 한정한다. 연면적·면적률이
 * 없으면 그 범위를 알 수 없고, 모른 채 전량 분리과세(0.2%)를 주면 **납세자에게 유리한 방향**의
 * 추정이 된다(종합합산 누진세율보다 낮다). 근거 없는 유리 적용도 금지다 ⇒ **던진다**.
 *
 * ## 초과분은 세액에 반영하지 않는다
 *
 * 초과분은 종합합산으로 이관되는데, 종합합산은 **인별 전국 합산**이라 단일 필지 계산기가
 * 세율을 정할 수 없다. 별도합산 경로(`totalExcessOfficialValue`)와 동일하게 **경고로 안내**만 한다.
 */
function judgeFactoryAreaLimit(input: SeparateTaxationInput) {
  const totalArea = input.factoryTotalLandArea ?? 0;
  const floorArea = input.factoryFloorArea ?? 0;
  const ratePercent = input.factoryAreaRatePercent ?? 0;

  if (totalArea <= 0) {
    throw new TaxCalculationError(
      TaxErrorCode.INVALID_INPUT,
      "공장용지 분리과세 판정에는 공장 전체 부속토지 면적(factoryTotalLandArea)이 필요합니다. " +
      "「지방세법 시행령」 §102①1호는 공장입지기준면적 범위의 토지로 한정합니다.",
    );
  }
  if (floorArea <= 0 || ratePercent <= 0) {
    throw new TaxCalculationError(
      TaxErrorCode.INVALID_INPUT,
      "공장용지 분리과세 판정에는 공장건축물 연면적(factoryFloorArea)과 " +
      "업종별 기준공장면적률(factoryAreaRatePercent)이 필요합니다 " +
      "(「지방세법 시행규칙」 §50 [별표6] 1호). 연면적은 바닥면적과 다른 값입니다.",
    );
  }

  const std = computeFactoryStandardArea(
    [{ floorArea, ratePercent }],
    totalArea,
    {
      isRestrictedZone: input.factoryIsRestrictedZone,
      additionalRecognizedArea: input.factoryAdditionalRecognizedArea,
    },
  );

  return { totalArea, ...apportionByArea(totalArea, std.standardArea, input.assessedValue) };
}

function classifyStandard(
  input: SeparateTaxationInput,
  warnings: string[],
  rateSet: PropertyRateSet = getCurrentPropertyRateSet(),
): ClassifyPartial {
  if (input.isFactoryLand) {
    // 🔴 2026-08-06 정정 — 「도시지역 내 기타」는 분리과세가 **아니다**.
    //
    // 「지방세법 시행령」 §102①1호는 분리과세 공장용지를 §101①1호 **각 목**의 지역으로 한정한다:
    //   가. 읍ㆍ면지역  나. 산업단지  다. 공업지역
    // 그리고 §101①1호 **본문**은 "특별시ㆍ광역시(군 지역 제외)ㆍ특별자치시ㆍ특별자치도 및
    // 시지역(위 각 목 제외)"의 공장용지를 **별도합산**(바닥면적 × §101② 배율)으로 정한다.
    //
    // ⇒ 두 조문은 소재 지역으로 **배타 분기**한다. 시지역의 그 밖 공장용지가 분리과세로
    //   들어올 여지는 없다. 종전에는 경고만 띄우고 0.2% 분리과세를 그대로 줬다.
    if (input.factoryLocation === "urban") {
      warnings.push(
        "도시지역 내 그 밖의 지역(산업단지·공업지역 아님)에 있는 공장용지는 분리과세 대상이 " +
        "아닙니다 — 「지방세법 시행령」 §101①1호에 따라 별도합산과세대상입니다. " +
        "「토지 과세 유형」을 별도합산으로 바꾸어 공장용 건축물 바닥면적과 용도지역을 입력하세요.",
      );
      return null; // 폴스루 → 분리과세 비해당
    }

    // §102①1호 **단서** — 허가·사용승인 미이행 공장용 건축물의 부속토지는 제외한다.
    if (input.factoryIsUnpermitted) {
      warnings.push(
        "허가 또는 사용승인을 받지 않은 공장용 건축물의 부속토지는 분리과세 대상에서 " +
        "제외됩니다(「지방세법 시행령」 §102①1호 단서). 종합합산과세대상으로 판정하세요.",
      );
      return null;
    }

    const areaCheck = judgeFactoryAreaLimit(input);
    if (areaCheck.recognizedArea <= 0) {
      warnings.push(
        `공장 부속토지 ${areaCheck.totalArea}㎡가 공장입지기준면적 ` +
        `${areaCheck.standardArea.toFixed(2)}㎡를 전부 초과합니다 — 분리과세 대상이 없습니다. ` +
        "종합합산과세대상으로 판정하세요.",
      );
      return null;
    }
    if (areaCheck.excessArea > 0) {
      warnings.push(
        `공장 부속토지 ${areaCheck.totalArea}㎡ 중 ${areaCheck.recognizedArea.toFixed(2)}㎡는 ` +
        `분리과세(공장입지기준면적 ${areaCheck.standardArea.toFixed(2)}㎡ 이내), ` +
        `${areaCheck.excessArea.toFixed(2)}㎡(시가표준액 ` +
        `${areaCheck.excessAssessedValue.toLocaleString()}원)는 기준면적 초과로 ` +
        "종합합산과세대상으로 이관됩니다. 인별 합산 계산 시 별도 처리가 필요합니다.",
      );
    }

    return {
      isApplicable: true,
      category: "standard",
      appliedRate: rateSet.landSeparatedGeneral,
      reasoning: {
        legalBasis: PROPERTY.SEPARATE.STANDARD_FACTORY,
        matchedCondition: "읍ㆍ면지역ㆍ산업단지ㆍ공업지역 내 공장용지 (공장입지기준면적 이내)",
        excludedFrom: ["comprehensive", "special_aggregated"],
      },
      factoryAreaCheck: {
        standardArea: areaCheck.standardArea,
        recognizedArea: areaCheck.recognizedArea,
        excessArea: areaCheck.excessArea,
        recognizedRatio: areaCheck.recognizedRatio,
        recognizedAssessedValue: areaCheck.recognizedAssessedValue,
        excessAssessedValue: areaCheck.excessAssessedValue,
      },
    };
  }

  if (input.isSaltField) {
    return {
      isApplicable: true,
      category: "standard",
      appliedRate: rateSet.landSeparatedGeneral,
      reasoning: {
        legalBasis: PROPERTY.SEPARATE.STANDARD_SALT_FIELD,
        matchedCondition: "염화나트륨 생산에 직접 사용되는 염전",
        excludedFrom: ["comprehensive", "special_aggregated"],
      },
    };
  }

  if (input.isTerminalOrParking) {
    return {
      isApplicable: true,
      category: "standard",
      appliedRate: rateSet.landSeparatedGeneral,
      reasoning: {
        legalBasis: PROPERTY.SEPARATE.STANDARD_TERMINAL,
        matchedCondition: "여객·화물터미널 또는 공영주차장 부속토지",
        excludedFrom: ["comprehensive", "special_aggregated"],
      },
    };
  }

  return null;
}

// ============================================================
// P5-05: 중과(4%) 판정 — 회원제 골프장·고급오락장
// ============================================================

/**
 * 중과(4%) 분리과세 판정 (지방세법 §111①1호 다목(2))
 *
 * - 회원제 골프장: golfCourseType === "member" 시 중과 적용
 * - 대중제·간이 골프장: 중과 배제 + 경고
 * - golfCourseType 미입력: 경고 후 보수적으로 중과 미적용
 * - 고급오락장: isHighClassEntertainment === true 시 중과 적용
 */
function classifyHeavy(
  input: SeparateTaxationInput,
  warnings: string[],
  rateSet: PropertyRateSet = getCurrentPropertyRateSet(),
): ClassifyPartial {
  if (input.isGolfCourse) {
    if (!input.golfCourseType) {
      warnings.push(
        "골프장 유형(golfCourseType)이 입력되지 않았습니다. " +
        "회원제(4% 중과)·대중제(배제)·간이(배제)를 확인하여 입력하세요. " +
        "현재는 중과를 적용하지 않습니다.",
      );
      return null;
    }

    if (input.golfCourseType === "member") {
      return {
        isApplicable: true,
        category: "heavy",
        appliedRate: rateSet.landSeparatedHigh,
        reasoning: {
          legalBasis: PROPERTY.SEPARATE.HEAVY_GOLF_MEMBER,
          matchedCondition: "회원제 골프장 부속토지 (체육시설법상 회원제)",
          excludedFrom: ["comprehensive", "special_aggregated"],
        },
      };
    }

    // 대중제 또는 간이 → 중과 배제
    warnings.push(
      `${input.golfCourseType === "public" ? "대중제" : "간이"} 골프장은 중과(4%) 대상이 아닙니다. ` +
      "별도합산 또는 일반 분리과세(0.2%) 적용 여부를 별도 검토하세요.",
    );
    return null;
  }

  if (input.isHighClassEntertainment) {
    return {
      isApplicable: true,
      category: "heavy",
      appliedRate: rateSet.landSeparatedHigh,
      reasoning: {
        legalBasis: PROPERTY.SEPARATE.HEAVY_ENTERTAINMENT,
        matchedCondition: "고급오락장(카지노·유흥주점 등) 부속토지",
        excludedFrom: ["comprehensive", "special_aggregated"],
      },
    };
  }

  return null;
}

// ============================================================
// P5-06: classifySeparateTaxation — 통합 판정
// ============================================================

/**
 * 분리과세 통합 판정 (지방세법 §106①3호)
 *
 * 판정 우선순위 (엄수): 중과(4%) → 저율(0.07%) → 일반(0.2%) → 비해당
 *
 * 분리과세 해당 시 reasoning.excludedFrom에
 * ['comprehensive', 'special_aggregated'] 포함.
 *
 * @param input SeparateTaxationInput
 * @returns SeparateTaxationResult (taxBase·calculatedTax 미포함 — 세액 계산은 calculateSeparateTaxationTax)
 */
export function classifySeparateTaxation(
  input: SeparateTaxationInput,
  rateSet: PropertyRateSet = getCurrentPropertyRateSet(),
): SeparateTaxationResult {
  const warnings: string[] = [];

  // 1. 중과(4%) 우선
  const heavyResult = classifyHeavy(input, warnings, rateSet);
  if (heavyResult) return { ...heavyResult, warnings };

  // 2. 저율(0.07%)
  const lowRateResult = classifyLowRate(input, warnings, rateSet);
  if (lowRateResult) return { ...lowRateResult, warnings };

  // 3. 일반(0.2%)
  const standardResult = classifyStandard(input, warnings, rateSet);
  if (standardResult) return { ...standardResult, warnings };

  // 4. 분리과세 비해당
  return {
    isApplicable: false,
    reasoning: {
      legalBasis: "",
      matchedCondition: "분리과세 조건 미충족 — 종합합산 또는 별도합산 판정 필요",
      excludedFrom: [],
    },
    warnings,
  };
}

// ============================================================
// P5-07: calculateSeparateTaxationTax — 세액 계산
// ============================================================

/**
 * 분리과세 토지 세액 계산 (지방세법 §113①2호)
 *
 * 계산 순서:
 * 1. 과세표준 = 시가표준액(assessedValue) × 공정시장가액비율(70%)
 * 2. 과세표준 → 천원 절사
 * 3. 산출세액 = 과세표준 × 단일세율, 원 미만 절사
 *
 * 오차 보증:
 * - 천원 절사: Math.floor(x / 1000) × 1000
 * - 세액 절사: Math.floor(taxBase × rate)
 *
 * @param classification classifySeparateTaxation(input) 결과
 * @param assessedValue  시가표준액 (원) — input.assessedValue
 * @returns SeparateTaxationResult (taxBase·calculatedTax 포함)
 */
export function calculateSeparateTaxationTax(
  classification: SeparateTaxationResult,
  assessedValue: number,
): SeparateTaxationResult {
  if (!classification.isApplicable || classification.appliedRate === undefined) {
    return classification;
  }

  const fairMarketRatio = FAIR_MARKET_RATIO;

  // Step 1·2: 과세표준 = 시가표준액 × 70% (지방세법 §113 — 절사 규정 없음)
  const taxBase = applyRate(assessedValue, fairMarketRatio);

  // Step 3: 세액 = 과세표준 × 단일세율, 원 미만 절사 (P0-2: applyRate 사용)
  const calculatedTax = applyRate(taxBase, classification.appliedRate);

  return {
    ...classification,
    taxBase,
    fairMarketRatio,
    calculatedTax,
  };
}

// ============================================================
// P5-08: 종부세 배제 플래그
// ============================================================

/**
 * 분리과세 토지의 종합부동산세 배제 여부 판정
 *
 * 지방세법상 분리과세 토지(§106①3호)는 종합부동산세 과세대상 아님.
 * (종합부동산세법 §11 — 분리과세 토지는 합산 대상에서 제외)
 *
 * 호출자(comprehensive-tax.ts)에서 이 플래그를 확인하여
 * 분리과세 토지를 종부세 집계에서 제외해야 합니다.
 *
 * @param result classifySeparateTaxation() 또는 calculateSeparateTaxationTax() 결과
 * @returns true이면 종부세 과세 제외 대상
 *
 * @example
 * ```typescript
 * import { classifySeparateTaxation, isExcludedFromComprehensiveTax } from './separate-taxation';
 *
 * const classification = classifySeparateTaxation(input);
 * if (isExcludedFromComprehensiveTax(classification)) {
 *   // 이 토지는 종부세 합산에서 제외
 * }
 * ```
 */
export function isExcludedFromComprehensiveTax(
  result: SeparateTaxationResult,
): boolean {
  return (
    result.isApplicable &&
    result.reasoning.excludedFrom.includes("comprehensive")
  );
}

// ============================================================
// 편의 함수
// ============================================================

/**
 * 분리과세 판정 + 세액 계산 통합
 *
 * classifySeparateTaxation() + calculateSeparateTaxationTax() 순차 실행.
 * 단계 분리 불필요 시 사용.
 *
 * @param input SeparateTaxationInput
 * @returns SeparateTaxationResult (taxBase·calculatedTax 포함)
 */
export function calculateSeparateTax(
  input: SeparateTaxationInput,
  rateSet: PropertyRateSet = getCurrentPropertyRateSet(),
): SeparateTaxationResult {
  const classification = classifySeparateTaxation(input, rateSet);
  // 공장용지 기준면적 초과분은 분리과세에서 빠지므로 **인정분 시가표준액만** 과세표준이 된다
  // (「지방세법 시행령」 §102①1호 "…기준면적 범위의 토지"). 초과분은 종합합산 이관 — 경고로 안내.
  const base =
    classification.factoryAreaCheck?.recognizedAssessedValue ??
    classification.pastureAreaCheck?.recognizedAssessedValue ??
    input.assessedValue;
  return calculateSeparateTaxationTax(classification, base);
}
