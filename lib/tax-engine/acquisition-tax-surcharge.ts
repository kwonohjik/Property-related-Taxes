/**
 * 취득세 중과세 판정 모듈 (Phase 1 리팩터 — 하위 호환 래퍼)
 *
 * Phase 1 이후: 실제 로직은 acquisition-surcharge/ 디렉터리에 분산.
 * 본 파일은 기존 API 호환성 유지를 위한 재수출 래퍼.
 *
 * 내부 구현은 다음 모듈에 있음:
 * - acquisition-surcharge/index.ts      — assessSurcharge (통합 오케스트레이터)
 * - acquisition-surcharge/exclusion.ts  — isExemptFromSurcharge_LowValue, validateInputConsistency
 * - acquisition-surcharge/luxury.ts     — calcLuxurySurchargeRate (사치성 3분기)
 * - acquisition-surcharge/multi-house.ts — assessMultiHouseSurcharge, assessGiftSurcharge
 * - acquisition-surcharge/corp-house.ts — isBurdenedGiftExcluded, assessCorpHouseSurcharge
 */

// ── 메인 함수 재수출 ──
export {
  assessSurcharge,
  resolveFinalRate,
  isExemptFromSurcharge_LowValueLegacy as isExemptFromSurcharge_LowValue,
  type SurchargeCheckInput,
  type ExtendedSurchargeDecision,
} from "./acquisition-surcharge/index";

// ── 서브모듈 재수출 (직접 접근이 필요한 경우) ──
export {
  validateInputConsistency,
  isExemptFromSurcharge_LowValue as isExemptFromSurcharge_LowValueV2,
  isPreRegulationContractProtected,
  resolveRegulatedAreaStatus,
} from "./acquisition-surcharge/exclusion";

export {
  calcLuxurySurchargeRate,
  isVillaLuxurySurchargeApplicable,
  SURCHARGE_RATES as LUXURY_SURCHARGE_RATES,
  type LuxuryPropertyType,
} from "./acquisition-surcharge/luxury";

export {
  assessMultiHouseSurcharge,
  assessGiftSurcharge,
  getDisposalDeadlineYears,
  getDisposalDeadlineDate,
  assessTemporaryTwoHouse,
  SURCHARGE_RATES,
} from "./acquisition-surcharge/multi-house";

export {
  isBurdenedGiftExcluded,
  resolveEffectiveCause,
  assessCorpHouseSurcharge,
} from "./acquisition-surcharge/corp-house";

// ── 생애최초 감면은 index.ts 내부에서만 사용 (외부 노출 최소화) ──
