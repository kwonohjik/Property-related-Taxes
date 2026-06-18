/** (Phase 3) 명의신탁재산의 증여 의제 (§45의2) */
import { GIFT } from "../legal-codes";
import type { CalculationStep } from "../types/inheritance-gift.types";
import type { DeemedGiftResult, NomineeTrustInput } from "./types";

/**
 * §45의2①: 실제소유자 ≠ 명의자(등기등 필요 재산, 토지·건물 제외)이면 그 재산가액을 증여의제.
 * §45의2③: 타인명의 등기는 조세회피목적 추정. ①1·3·4호(조세회피목적 없음·신탁등기·비거주자
 * 법정대리인) 또는 조세회피목적 없으면 미적용.
 */
export function calcNomineeTrustGift(input: NomineeTrustInput): DeemedGiftResult {
  const { propertyValue, hasTaxAvoidancePurpose } = input;
  const isExcluded = input.isExcluded === true;
  const applied = hasTaxAvoidancePurpose && !isExcluded && propertyValue > 0;
  const value = applied ? propertyValue : 0;

  const breakdown: CalculationStep[] = [
    { label: "명의신탁 재산 가액", amount: propertyValue, lawRef: GIFT.NOMINEE_TRUST },
    { label: "증여의제가액", amount: value, lawRef: GIFT.NOMINEE_TRUST, note: "§45의2① 명의신탁재산 증여의제" },
  ];
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
  };
}
