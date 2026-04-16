/**
 * 취득세 중과세 판정 모듈
 *
 * 지방세법 §13 — 중과세율 (다주택·사치성 재산)
 * 지방세법 §13의2 — 법인 주택 중과
 * 지방세특례제한법 §36의3 — 생애최초 주택 구매 감면
 */

import { ACQUISITION, ACQUISITION_CONST } from "./legal-codes";
import type {
  AcquisitionTaxInput,
  SurchargeDecision,
  PropertyObjectType,
  AcquirerType,
} from "./types/acquisition.types";

// ============================================================
// 중과세 판정 메인 함수
// ============================================================

interface SurchargeCheckInput {
  propertyType: PropertyObjectType;
  acquisitionCause: string;
  acquisitionValue: number;    // 과세표준 (천원 미만 절사 완료)
  acquiredBy: AcquirerType;
  /** 취득 후 주택 수 (취득 대상 포함) */
  houseCountAfter?: number;
  /** 조정대상지역 여부 (취득일 기준) */
  isRegulatedArea?: boolean;
  /** 사치성 재산 여부 (골프장·별장·고급주택·고급오락장·고급선박) */
  isLuxuryProperty?: boolean;
  /** 기본세율 (사치성 재산 중과세율 계산용) */
  basicRate?: number;
  /** 생애최초 주택 구매 여부 */
  isFirstHome?: boolean;
  /** 수도권 여부 (생애최초 감면 한도 구분) */
  isMetropolitan?: boolean;
  /** 취득세 본세 (감면액 계산용) */
  acquisitionTax?: number;
}

/**
 * 취득세 중과세 종합 판정 (지방세법 §13, §13의2)
 *
 * 판단 순서 (§13①이 §13의2보다 우선 적용 — 사치성 중과는 별도 세율 체계):
 * 1. 사치성 재산 중과 (§13①) — 기본세율 × 5배, 가장 높은 세율로 즉시 확정
 * 2. 법인 주택 중과 (§13의2) — 유상취득 12%, 사치성보다 낮으므로 2순위
 * 3. 다주택 중과 (§13의2) — 조정대상지역 2주택 8%, 3주택+ 12%, 유상취득만 해당
 * 4. 생애최초 주택 감면 (지방세특례제한법 §36의3) — 중과 미적용 시에만 가능
 */
export function assessSurcharge(input: SurchargeCheckInput): SurchargeDecision {
  const warnings: string[] = [];
  const exceptions: string[] = [];

  // 주택이 아니면 중과 관련 항목 대부분 미적용
  const isHousing = input.propertyType === "housing";

  // ── 사치성 재산 중과 (§13①) ──
  if (input.isLuxuryProperty) {
    const luxuryRate = getSurchargeRateForLuxury(input.basicRate ?? ACQUISITION_CONST.LUXURY_BASE_RATE);
    return {
      isSurcharged: true,
      surchargeRate: luxuryRate,
      surchargeReason: `사치성 재산 중과 (${ACQUISITION.LUXURY_SURCHARGE_PROVISION})`,
      exceptions,
      warnings: [
        `사치성 재산(골프장·별장·고급주택·고급오락장·고급선박)으로 기본세율(${((input.basicRate ?? ACQUISITION_CONST.LUXURY_BASE_RATE) * 100).toFixed(1)}%) × 5배 = ${(luxuryRate * 100).toFixed(1)}% 중과세율 적용 (${ACQUISITION.LUXURY_SURCHARGE_PROVISION})`,
      ],
      legalBasis: [ACQUISITION.SURCHARGE],
    };
  }

  // ── 법인 주택 중과 (§13의2) ──
  if (isHousing && input.acquiredBy === "corporation") {
    const isOnerousAcquisition = [
      "purchase", "exchange", "auction", "in_kind_investment", "new_construction",
    ].includes(input.acquisitionCause);

    if (isOnerousAcquisition) {
      return {
        isSurcharged: true,
        surchargeRate: ACQUISITION_CONST.SURCHARGE_CORPORATE,
        surchargeReason: `법인 주택 유상취득 중과 (${ACQUISITION.CORP_SURCHARGE})`,
        exceptions,
        warnings: ["법인의 주택 유상취득에는 12% 중과세율이 적용됩니다."],
        legalBasis: [ACQUISITION.CORP_SURCHARGE],
      };
    }
  }

  // ── 다주택 중과 (§13의2 — 조정대상지역, 유상취득만 적용) ──
  // 지방세법 §13의2: 상속·증여 등 무상취득은 다주택 중과 배제
  const isOnerousForMultiHouse = [
    "purchase", "exchange", "auction", "in_kind_investment",
  ].includes(input.acquisitionCause);

  if (isHousing && input.isRegulatedArea && isOnerousForMultiHouse) {
    const houseCount = input.houseCountAfter ?? 1;

    if (houseCount >= 3) {
      // 3주택 이상: 12%
      return {
        isSurcharged: true,
        surchargeRate: ACQUISITION_CONST.SURCHARGE_3HOUSE_PLUS,
        surchargeReason: `조정대상지역 내 ${houseCount}주택 취득 중과 (${ACQUISITION.CORP_SURCHARGE})`,
        firstHomeReduction: calcFirstHomeReduction(input, ACQUISITION_CONST.SURCHARGE_3HOUSE_PLUS),
        exceptions,
        warnings: [
          `취득 후 주택 수 ${houseCount}채 (조정대상지역 내 3주택 이상) — 12% 중과`,
        ],
        legalBasis: [ACQUISITION.SURCHARGE],
      };
    }

    if (houseCount === 2) {
      // 2주택: 8%
      return {
        isSurcharged: true,
        surchargeRate: ACQUISITION_CONST.SURCHARGE_2HOUSE,
        surchargeReason: `조정대상지역 내 2주택 취득 중과 (${ACQUISITION.CORP_SURCHARGE})`,
        firstHomeReduction: calcFirstHomeReduction(input, ACQUISITION_CONST.SURCHARGE_2HOUSE),
        exceptions,
        warnings: [
          "취득 후 주택 수 2채 (조정대상지역 내 2주택) — 8% 중과",
        ],
        legalBasis: [ACQUISITION.SURCHARGE],
      };
    }

    // 조정대상지역 1주택 → 중과 없음
    exceptions.push("조정대상지역 내 1주택 취득 — 기본세율 적용");
  }

  // 비조정지역 or 비주택 → 중과 없음
  if (isHousing && !input.isRegulatedArea) {
    exceptions.push("비조정대상지역 주택 취득 — 기본세율 적용 (주택 수 무관)");
  }

  // 생애최초 감면 (중과 대상 아닌 경우에도 적용 가능)
  const firstHomeReduction = isHousing ? calcFirstHomeReduction(input, undefined) : undefined;

  return {
    isSurcharged: false,
    firstHomeReduction: firstHomeReduction ?? undefined,
    exceptions,
    warnings,
    legalBasis: [ACQUISITION.SURCHARGE],
  };
}

// ============================================================
// 사치성 재산 중과세율 결정 (지방세법 §13①)
// ============================================================

/**
 * 사치성 재산 중과세율 (지방세법 §13① — "해당 세율의 100분의 500")
 * = 기본세율 × 5
 *
 * 예) 매매 토지 기본세율 4% → 4% × 5 = 20%
 *     매매 주택 9억 이상 3% → 3% × 5 = 15%
 *     매매 주택 7.5억(선형보간 2%) → 2% × 5 = 10%
 *     매매 주택 6억 이하 1% → 1% × 5 = 5%
 */
function getSurchargeRateForLuxury(basicRate: number): number {
  return basicRate * 5;
}

// ============================================================
// 생애최초 주택 구매 감면 (지방세특례제한법 §36의3)
// ============================================================

/**
 * 생애최초 주택 감면 계산
 *
 * - 감면 한도: 200만원
 * - 추징 주의: 3년 내 처분·임대·주거 미사용 시 추징
 */
function calcFirstHomeReduction(
  input: SurchargeCheckInput,
  surchargeRate: number | undefined
): SurchargeDecision["firstHomeReduction"] {
  if (!input.isFirstHome) return undefined;

  // 생애최초 감면은 유상취득 주택에만 적용
  const isOnerousHousing =
    input.propertyType === "housing" &&
    ["purchase", "auction", "exchange"].includes(input.acquisitionCause);

  if (!isOnerousHousing) return undefined;

  // 취득가액 한도 확인 (지방세특례제한법 §36의3①: 12억원 이하 단일 기준, 수도권/비수도권 구분 없음)
  const priceLimit = ACQUISITION_CONST.FIRST_HOME_PRICE_LIMIT; // 12억

  if (input.acquisitionValue > priceLimit) {
    return {
      isEligible: false,
      reductionAmount: 0,
      maxReductionAmount: ACQUISITION_CONST.FIRST_HOME_MAX_REDUCTION,
      warnings: [
        `생애최초 감면 불가 — 취득가액(${input.acquisitionValue.toLocaleString()}원)이 한도(${priceLimit.toLocaleString()}원) 초과`,
      ],
    };
  }

  // 중과세가 적용되면 감면 불가 (중과 후 전액 납부)
  if (surchargeRate && surchargeRate > 0.03) {
    return {
      isEligible: false,
      reductionAmount: 0,
      maxReductionAmount: ACQUISITION_CONST.FIRST_HOME_MAX_REDUCTION,
      warnings: [
        `생애최초 감면 불가 — 중과세율 적용 대상 (${ACQUISITION.FIRST_HOME_REDUCTION} 제외 사유)`,
      ],
    };
  }

  // 취득세 본세 기준 감면 (최대 200만원)
  const acquisitionTax = input.acquisitionTax ?? 0;
  const reductionAmount = Math.min(acquisitionTax, ACQUISITION_CONST.FIRST_HOME_MAX_REDUCTION);

  return {
    isEligible: true,
    reductionAmount,
    maxReductionAmount: ACQUISITION_CONST.FIRST_HOME_MAX_REDUCTION,
    warnings: [
      `생애최초 주택 취득 감면 적용 — 취득일로부터 3개월 내 전입신고 의무가 있습니다 (${ACQUISITION.FIRST_HOME_REDUCTION}②).`,
      "취득일로부터 3년 내 처분·임대·주거 외 사용 시 감면세액이 추징됩니다.",
    ],
  };
}

// ============================================================
// 중과 배제 확인 유틸
// ============================================================

/**
 * 공시가격 1억 이하 주택 중과 배제 여부 (지방세법 시행령 §28조의3)
 *
 * 단, 도시지역 내 정비구역 주택은 중과 배제 불가
 */
export function isExemptFromSurcharge_LowValue(
  standardValue: number,
  isInUrbanRegenerationArea = false
): boolean {
  const THRESHOLD = 100_000_000; // 1억 원
  if (isInUrbanRegenerationArea) return false;
  return standardValue <= THRESHOLD;
}

/**
 * 최종 적용 세율 결정 (기본세율 + 중과 통합)
 *
 * surchargeDecision의 isSurcharged가 true이면 surchargeRate 사용,
 * 아니면 basicRate 사용
 */
export function resolveFinalRate(
  basicRate: number,
  surchargeDecision: SurchargeDecision
): number {
  if (surchargeDecision.isSurcharged && surchargeDecision.surchargeRate !== undefined) {
    return surchargeDecision.surchargeRate;
  }
  return basicRate;
}
