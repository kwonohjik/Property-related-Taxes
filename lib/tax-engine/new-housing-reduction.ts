/**
 * 신축주택·미분양주택 양도소득세 감면·과세특례 순수 판정 엔진
 *
 * 조세특례제한법:
 *   §98의2  신축주택 과세특례 (1998.5.22~2001.12.31 취득)
 *   §99 ①  신축주택 감면    (2001.5.23~2003.6.30 취득)
 *   §99 ②  신축·미분양 감면 (2009.2.12~2010.2.11 취득)
 *   §99 ③  미분양주택 감면  (2010.2.12~2011.4.30 취득)
 *   §99 ④  전국 미분양      (2012.9.24~2013.4.1 취득)
 *   §99 ⑤  신축·미분양 감면 (2013.4.1~2013.12.31 취득)
 *   §99 ⑥  신축·미분양 감면 (2014.1.1~2014.12.31 취득)
 *
 * 2-레이어 원칙: DB 직접 호출 금지.
 * P0-2 원칙: 모든 세율×금액 곱셈은 Math.floor 적용.
 */

import { addYears, differenceInDays, isWithinInterval } from "date-fns";
import { safeMultiplyThenDivide } from "./tax-utils";
import type { NewHousingMatrixData } from "./schemas/rate-table.schema";

// ============================================================
// 타입 정의
// ============================================================

/** 감면 범위 유형 */
export type ReductionScope = "tax_amount" | "capital_gain";

/** 지역 유형 */
export type NewHousingRegion =
  | "nationwide"                 // 전국
  | "metropolitan"               // 수도권
  | "non_metropolitan"           // 비수도권
  | "outside_overconcentration"; // 수도권 과밀억제권역 외

export interface NewHousingReductionInput {
  /** 취득일 */
  acquisitionDate: Date;
  /** 양도일 */
  transferDate: Date;
  /** 지역 */
  region: NewHousingRegion;
  /** 취득가액 (원) */
  acquisitionPrice: number;
  /** 전용면적 (㎡) — 85㎡ 국민주택규모 기준 사용 */
  exclusiveAreaSquareMeters: number;
  /** 최초 분양(사업주체로부터 직접 취득) 여부 */
  isFirstSale: boolean;
  /** 미분양 확인서 보유 여부 */
  hasUnsoldCertificate: boolean;
  /** 전체 양도차익 (capital_gain 방식 감면 계산에 사용) */
  totalCapitalGain: number;
  /** 산출세액 (tax_amount 방식 감면 계산에 사용) */
  calculatedTax: number;
}

export interface IneligibleReason {
  code: string;
  message: string;
  field: string;
}

export interface NewHousingReductionResult {
  isEligible: boolean;
  ineligibleReasons: IneligibleReason[];

  /** 매칭된 조문 코드 (예: "99-1", "99-5") */
  matchedArticleCode?: string;
  /** 조문 표시명 (예: "§99 ①") */
  matchedArticle?: string;
  /** 감면 범위 유형 */
  reductionScope?: ReductionScope;
  /** 적용 감면율 */
  reductionRate: number;
  /** 감면세액 (원) */
  reductionAmount: number;

  /** 5년 이내 양도 여부 */
  isWithinFiveYearWindow: boolean;
  /** 감면 대상 양도차익 (capital_gain 방식) */
  reducibleGain: number;
  /** 5년 안분 비율 */
  fiveYearRatio: number;

  /** 다주택 산정에서 제외 여부 */
  isExcludedFromHouseCount: boolean;
  /** 다주택 중과세 배제 여부 */
  isExcludedFromMultiHouseSurcharge: boolean;

  warnings: string[];
}

// ============================================================
// 5년간 양도차익 안분 계산
// ============================================================

/**
 * capital_gain 방식: 취득 후 5년간 발생 양도차익 안분
 * 5년 이내 양도 시 → 전액 감면 대상
 * 5년 초과 양도 시 → 5년분만 감면 대상
 */
function calculateReducibleGain(
  totalCapitalGain: number,
  acquisitionDate: Date,
  disposalDate: Date,
  reductionYears = 5,
): { reducibleGain: number; taxableGain: number; ratio: number; isWithinWindow: boolean } {
  const totalDays = differenceInDays(disposalDate, acquisitionDate);
  if (totalDays <= 0) {
    return { reducibleGain: 0, taxableGain: totalCapitalGain, ratio: 0, isWithinWindow: false };
  }

  // 윤년을 고려하여 만 N년 날짜 계산 (addYears 사용)
  const reductionEndDate = addYears(acquisitionDate, reductionYears);
  const reductionDays = Math.min(
    differenceInDays(reductionEndDate, acquisitionDate),
    totalDays,
  );

  const isWithinWindow = totalDays <= differenceInDays(reductionEndDate, acquisitionDate);
  const ratio = reductionDays / totalDays;
  // P0-2 준수: safeMultiplyThenDivide로 정수 연산 유지, reductionDays 음수 방어
  const clampedDays = Math.max(0, reductionDays);
  const reducibleGain = Math.floor(safeMultiplyThenDivide(totalCapitalGain, clampedDays, totalDays));

  return {
    reducibleGain,
    taxableGain: totalCapitalGain - reducibleGain,
    ratio,
    isWithinWindow,
  };
}

// ============================================================
// 요건 검사 함수들
// ============================================================

/**
 * 취득일이 해당 조문의 취득 기간에 포함되는지 확인
 */
function isInAcquisitionPeriod(
  acquisitionDate: Date,
  start: string,
  end: string,
): boolean {
  const startDate = new Date(start);
  const endDate = new Date(end);
  // 양 끝 날짜 포함
  return acquisitionDate >= startDate && acquisitionDate <= endDate;
}

/**
 * 지역 요건 충족 여부 확인
 * - nationwide: 모든 지역 허용
 * - metropolitan: 수도권만 허용
 * - non_metropolitan: 비수도권만 허용
 * - outside_overconcentration: 수도권 과밀억제권역 외 허용 (수도권 과밀 외 + 비수도권)
 */
function checkRegionalRequirement(
  inputRegion: NewHousingRegion,
  articleRegion: string,
): boolean {
  if (articleRegion === "nationwide") return true;
  if (articleRegion === "metropolitan") {
    return inputRegion === "metropolitan" || inputRegion === "outside_overconcentration";
  }
  if (articleRegion === "non_metropolitan") {
    return inputRegion === "non_metropolitan";
  }
  if (articleRegion === "outside_overconcentration") {
    // 수도권 과밀억제권역 외 = 수도권 중 과밀억제권역 외 + 비수도권
    return inputRegion === "outside_overconcentration" || inputRegion === "non_metropolitan";
  }
  return false;
}

/**
 * 취득가액 요건 충족 여부 확인
 * maxAcquisitionPrice === null → 제한 없음
 */
function checkPriceRequirement(
  acquisitionPrice: number,
  maxAcquisitionPrice: number | null,
): boolean {
  if (maxAcquisitionPrice === null) return true;
  return acquisitionPrice <= maxAcquisitionPrice;
}

/**
 * 전용면적 요건 충족 여부 확인
 * maxArea === null → 제한 없음
 */
function checkAreaRequirement(
  exclusiveArea: number,
  maxArea: number | null,
): boolean {
  if (maxArea === null) return true;
  return exclusiveArea <= maxArea;
}

// ============================================================
// 취득가액별 감면율 결정 (§99②: 6억/9억 구간)
// ============================================================

/**
 * §99② 취득가액별 감면율 매트릭스
 * - 6억 이하: 100%
 * - 6억 초과 9억 이하: 80%
 * - 9억 초과: 60%
 */
function getRateByAcquisitionPrice(acquisitionPrice: number): number {
  if (acquisitionPrice <= 600_000_000) return 1.0;
  if (acquisitionPrice <= 900_000_000) return 0.8;
  return 0.6;
}

// ============================================================
// 메인 함수: determineNewHousingReduction
// ============================================================

/**
 * 신축주택·미분양주택 감면 자격 판단 + 감면액 계산
 *
 * @param input  신축주택 감면 입력 데이터
 * @param rules  DB에서 로드한 신축주택 감면 매트릭스 (선택적)
 */
export function determineNewHousingReduction(
  input: NewHousingReductionInput,
  rules: NewHousingMatrixData | undefined,
): NewHousingReductionResult {
  const ineligibleReasons: IneligibleReason[] = [];
  const warnings: string[] = [];

  // rules 없으면 감면 불가
  if (!rules || rules.articles.length === 0) {
    return {
      isEligible: false,
      ineligibleReasons: [{ code: "NO_RULES", message: "신축주택 감면 규칙 데이터 없음", field: "rules" }],
      reductionRate: 0,
      reductionAmount: 0,
      isWithinFiveYearWindow: false,
      reducibleGain: 0,
      fiveYearRatio: 0,
      isExcludedFromHouseCount: false,
      isExcludedFromMultiHouseSurcharge: false,
      warnings,
    };
  }

  // ── Step 1: 취득 기간으로 매칭 후보 찾기 ──
  const candidates = rules.articles.filter((a) =>
    isInAcquisitionPeriod(input.acquisitionDate, a.acquisitionPeriod.start, a.acquisitionPeriod.end),
  );

  if (candidates.length === 0) {
    ineligibleReasons.push({
      code: "ACQUISITION_PERIOD_NOT_MATCHED",
      message: `취득일 ${input.acquisitionDate.toISOString().slice(0, 10)}이 감면 대상 기간에 해당하지 않음`,
      field: "acquisitionDate",
    });
    return {
      isEligible: false,
      ineligibleReasons,
      reductionRate: 0,
      reductionAmount: 0,
      isWithinFiveYearWindow: false,
      reducibleGain: 0,
      fiveYearRatio: 0,
      isExcludedFromHouseCount: false,
      isExcludedFromMultiHouseSurcharge: false,
      warnings,
    };
  }

  // ── Step 2: 지역·가액·면적·미분양 요건으로 최종 1개 매칭 ──
  const matchedArticle = candidates.find((a) => {
    // 지역 요건
    if (!checkRegionalRequirement(input.region, a.region)) return false;
    // 가액 요건
    if (!checkPriceRequirement(input.acquisitionPrice, a.maxAcquisitionPrice)) return false;
    // 면적 요건
    if (!checkAreaRequirement(input.exclusiveAreaSquareMeters, a.maxArea)) return false;
    // 최초 분양 요건
    if (a.requiresFirstSale && !input.isFirstSale) return false;
    // 미분양 확인서 요건
    if (a.requiresUnsoldCertificate && !input.hasUnsoldCertificate) return false;
    return true;
  });

  if (!matchedArticle) {
    // 어떤 요건에서 실패했는지 상세 사유 수집
    const candidate = candidates[0]; // 대표 후보 기준
    if (!checkRegionalRequirement(input.region, candidate.region)) {
      ineligibleReasons.push({
        code: "REGION_NOT_ELIGIBLE",
        message: `지역 요건 미충족: 이 조문은 ${candidate.region} 지역만 허용`,
        field: "region",
      });
    }
    if (!checkPriceRequirement(input.acquisitionPrice, candidate.maxAcquisitionPrice)) {
      ineligibleReasons.push({
        code: "PRICE_EXCEEDED",
        message: `취득가액 ${input.acquisitionPrice.toLocaleString()}원이 한도 ${candidate.maxAcquisitionPrice?.toLocaleString()}원 초과`,
        field: "acquisitionPrice",
      });
    }
    if (!checkAreaRequirement(input.exclusiveAreaSquareMeters, candidate.maxArea)) {
      ineligibleReasons.push({
        code: "AREA_EXCEEDED",
        message: `전용면적 ${input.exclusiveAreaSquareMeters}㎡이 국민주택규모 ${candidate.maxArea}㎡ 초과`,
        field: "exclusiveAreaSquareMeters",
      });
    }
    if (candidate.requiresFirstSale && !input.isFirstSale) {
      ineligibleReasons.push({
        code: "NOT_FIRST_SALE",
        message: "사업주체로부터 최초 취득(최초 분양) 요건 미충족",
        field: "isFirstSale",
      });
    }
    if (candidate.requiresUnsoldCertificate && !input.hasUnsoldCertificate) {
      ineligibleReasons.push({
        code: "NO_UNSOLD_CERTIFICATE",
        message: "미분양 확인서 미보유 — 미분양주택 과세특례 적용 불가",
        field: "hasUnsoldCertificate",
      });
    }
    if (ineligibleReasons.length === 0) {
      ineligibleReasons.push({
        code: "NO_MATCHING_ARTICLE",
        message: "모든 요건을 충족하는 감면 조문이 없음",
        field: "acquisitionDate",
      });
    }
    return {
      isEligible: false,
      ineligibleReasons,
      reductionRate: 0,
      reductionAmount: 0,
      isWithinFiveYearWindow: false,
      reducibleGain: 0,
      fiveYearRatio: 0,
      isExcludedFromHouseCount: false,
      isExcludedFromMultiHouseSurcharge: false,
      warnings,
    };
  }

  // ── Step 3: 5년 이내 양도 여부 (fiveYearWindowRule 적용 조문만) ──
  const { reducibleGain, taxableGain: _taxableGain, ratio, isWithinWindow } =
    calculateReducibleGain(input.totalCapitalGain, input.acquisitionDate, input.transferDate, 5);

  // ── Step 4: 감면율 결정 ──
  // §99② 취득가액별 차등 감면율 (code에 "99-2" 포함)
  let reductionRate = matchedArticle.reductionRate;
  if (matchedArticle.code.startsWith("99-2") || matchedArticle.code.startsWith("99-3")) {
    // 취득가액 구간별 차등이 DB에 저장되지 않은 경우 재계산
    // (DB에 reductionRate를 가격별로 저장하지 않고, 엔진에서 계산하는 경우)
    // 현재 구현: DB의 reductionRate 그대로 사용 (DB에 구간별 article을 별도 저장)
    reductionRate = matchedArticle.reductionRate;
  }

  // ── Step 5: 감면액 계산 ──
  let reductionAmount = 0;

  if (matchedArticle.reductionScope === "tax_amount") {
    // 산출세액 감면 방식
    reductionAmount = Math.floor(input.calculatedTax * reductionRate);
  } else {
    // capital_gain 방식: 감면 대상 양도차익 × 감면율
    // 5년 이내 양도: 전액, 5년 초과: 5년분만
    if (matchedArticle.fiveYearWindowRule) {
      // 5년분 양도차익에 대한 세액을 산출세액으로부터 안분 계산
      // 간략화: 산출세액을 양도차익 비율로 안분
      const fiveYearTaxAmount = Math.floor(input.calculatedTax * ratio);
      reductionAmount = Math.floor(fiveYearTaxAmount * reductionRate);
    } else {
      reductionAmount = Math.floor(input.calculatedTax * reductionRate);
    }
  }

  // 감면액 상한: 산출세액 초과 방지
  reductionAmount = Math.min(reductionAmount, input.calculatedTax);

  // ── Step 6: 주택 수 제외 / 중과 배제 ──
  const isExcludedFromHouseCount = matchedArticle.isExcludedFromHouseCount;
  const isExcludedFromMultiHouseSurcharge = matchedArticle.isExcludedFromMultiHouseSurcharge;

  // ── 경고 ──
  if (!isWithinWindow) {
    warnings.push(
      `취득 후 5년 초과 양도 — 5년간 양도차익(${Math.round(ratio * 100)}%)에 대해서만 감면 적용`,
    );
  }

  return {
    isEligible: true,
    ineligibleReasons: [],
    matchedArticleCode: matchedArticle.code,
    matchedArticle: matchedArticle.article,
    reductionScope: matchedArticle.reductionScope as ReductionScope,
    reductionRate,
    reductionAmount,
    isWithinFiveYearWindow: isWithinWindow,
    reducibleGain,
    fiveYearRatio: ratio,
    isExcludedFromHouseCount,
    isExcludedFromMultiHouseSurcharge,
    warnings,
  };
}
