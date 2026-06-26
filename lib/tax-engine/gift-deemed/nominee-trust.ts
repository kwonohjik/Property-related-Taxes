/** (Phase 3) 명의신탁재산의 증여 의제 (§45의2) */
import { GIFT } from "../legal-codes";
import { safeMultiply } from "../tax-utils";
import type { CalculationStep } from "../types/inheritance-gift.types";
import type { DeemedGiftResult, NomineeTrustInput } from "./types";

/**
 * §45의2①: 실제소유자 ≠ 명의자(등기등 필요 재산, 토지·건물 제외)이면 그 재산가액을 증여의제.
 * §45의2③: 타인명의 등기는 조세회피목적 추정. ①1·3·4호(조세회피목적 없음·신탁등기·비거주자
 * 법정대리인) 또는 조세회피목적 없으면 미적용.
 *
 * 평가 모드(valuationMode):
 * - "total"(기본): 명의신탁 재산가액 총액(propertyValue) 직접.
 * - "per_share": 유상증자 신주 명의신탁 — 증여재산가액 = 증여일(명의개서일) 현재 §60·§63 평가
 *   1주당 가액 × 명의신탁 신주수. 신주인수가액·이론적 권리락가가 아닌 §63 평가액(희석효과 반영).
 *   조심2012중3707·2013.02.27 재결·조심2019서2129. 곱은 엔진에서 단일 도출(dual-truth 금지).
 */
export function calcNomineeTrustGift(input: NomineeTrustInput): DeemedGiftResult {
  const { hasTaxAvoidancePurpose, valuationMode, perSharePrice, nomineeShares } = input;
  const isExcluded = input.isExcluded === true;
  const isPerShare = valuationMode === "per_share";

  // per_share: 명의개서일 §63 평가 1주당 가액 × 명의신탁 신주수 (정수 연산 — safeMultiply, Math.round 금지)
  const resolvedValue = isPerShare ? safeMultiply(perSharePrice ?? 0, nomineeShares ?? 0) : (input.propertyValue ?? 0);

  const applied = hasTaxAvoidancePurpose && !isExcluded && resolvedValue > 0;
  const value = applied ? resolvedValue : 0;

  const breakdown: CalculationStep[] = [];
  if (isPerShare) {
    breakdown.push({
      label: "증여의제가액 (명의개서일 §63 평가액 × 명의신탁 신주수)",
      amount: value,
      lawRef: GIFT.NOMINEE_TRUST,
      note:
        `1주당 평가액 ${(perSharePrice ?? 0).toLocaleString("ko-KR")} × 신주 ${(nomineeShares ?? 0).toLocaleString("ko-KR")}주. ` +
        `평가는 ${GIFT.NOMINEE_TRUST_VALUATION}(증여일 현재) — 신주인수가액·이론적 권리락가 미적용(희석효과는 평가액에 반영). ` +
        `납세의무자=실제소유자(${GIFT.NOMINEE_TRUST_TAXPAYER}), 합산배제증여재산(${GIFT.NOMINEE_TRUST_AGGREGATION_EXCLUSION}).`,
    });
  } else {
    breakdown.push({ label: "명의신탁 재산 가액", amount: resolvedValue, lawRef: GIFT.NOMINEE_TRUST });
    breakdown.push({ label: "증여의제가액", amount: value, lawRef: GIFT.NOMINEE_TRUST, note: "§45의2① 명의신탁재산 증여의제" });
  }

  return {
    type: "nominee_trust",
    applied,
    deemedGiftValue: value,
    breakdown,
    exclusionReason: applied
      ? undefined
      : isExcluded
        ? "신탁등기·비거주자 법정대리인 등 배제사유 (§45의2①)"
        : "조세회피목적 없음 — 증여의제 제외 (§45의2①1호)",
    legalBasis: GIFT.NOMINEE_TRUST,
    thresholdEcho: { taxAvoidance: hasTaxAvoidancePurpose, excluded: isExcluded },
    nomineeCapitalIncrease: isPerShare
      ? {
          perSharePrice: perSharePrice ?? 0,
          nomineeShares: nomineeShares ?? 0,
          subscriptionPrice: input.subscriptionPrice,
          theoreticalExRightsPrice: input.theoreticalExRightsPrice,
          preIncreasePerShare: input.preIncreasePerShare,
        }
      : undefined,
  };
}
