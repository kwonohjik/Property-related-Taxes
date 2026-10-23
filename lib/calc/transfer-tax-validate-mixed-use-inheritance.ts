/**
 * 상속 취득 겸용주택 — §163⑨ 취득가액 직접 산정 검증 (⑧, 엔진 정합).
 *
 * 800줄 정책에 따라 `transfer-tax-validate-asset.ts`에서 분리
 * (`transfer-tax-validate-expropriation.ts` 등 기존 관심사별 분리 컨벤션과 동일).
 *
 * 자동 안분 fallback 금지 정책 — override·기존 필드 어느 쪽도 없으면 명확한 오류로 차단
 * (엔진에 0/undefined가 도달해 침묵 계산되는 것을 방지). 엔진 throw와 동시점 조합 차단도 포함
 * (transfer-tax-mixed-use-helpers.ts:281-285 · transfer-tax-mixed-use-commercial.ts:66-69).
 *
 * 설계: docs/02-design/features/transfer-mixed-use-inheritance-acquisition.ui.design.md §7
 */
import { parseAmount } from "@/lib/calc/number-parse";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import { fieldError } from "./transfer-tax-validate-field";
import { mixedSec163_9CompareOf } from "./mixed-use-sec163-9";

/**
 * 상속·증여 취득 겸용주택 §163⑨ 검증. `acquisitionCause`가 inheritance·gift가 아니면 즉시 null.
 * 증여(D1=옵션B)는 상속 로직을 그대로 미러 — reported 필드만 gift 전용(mixed*GiftValueOverride),
 * 메시지·라벨은 "증여일"로 분기.
 */
export function validateMixedUseInheritanceAsset(
  asset: AssetForm,
  label: string,
): string | null {
  const isInheritance = asset.acquisitionCause === "inheritance";
  const isGift = asset.acquisitionCause === "gift";
  if (!isInheritance && !isGift) return null;

  const acqLabel = isGift ? "증여일" : "상속개시일";
  const kindLabel = isGift ? "증여" : "상속";

  // 엔진 throw와 동시점 차단 (Phase 2 범위 밖 조합).
  if (asset.hasPartialUsageChange) {
    return `${label}: ${kindLabel} 취득 + 보유 중 일부 용도변경 조합은 아직 지원하지 않습니다.`;
  }
  const cmp = mixedSec163_9CompareOf(asset);
  // 의제취득일 전은 지원한다(Q-17 — ③은 특례 분모, ①②는 환산이 아니라 특례가 닿을 곳이 없다 · 엔진 `calcMixedSec163_9Compare`).
  if (asset.transferCause === "public_expropriation" && cmp?.era !== "pre_deemed") {
    return `${label}: ${kindLabel} 취득 + 공익수용 특례 조합은 아직 지원하지 않습니다.`;
  }

  // 주택분 신고가액 override — 현재 취득원인 종속 선택(상속 XOR 증여). blind || 금지(전환 시 stale 필드 우선 방지).
  const housingOverride = isGift
    ? parseAmount(asset.mixedHousingGiftValueOverride)
    : parseAmount(asset.mixedHousingInheritedValueOverride);

  // §163⑨ 단서 자산 합계 비교 구간(PR-6) — ①은 두 칸 모두 넣거나 모두 비운다(Q-19) · 의제취득일 전 증여는 ① 필수(Q-16). ⑫ 거울.
  if (cmp) {
    const commercialReported = isGift
      ? parseAmount(asset.mixedCommercialGiftValueOverride)
      : parseAmount(asset.mixedCommercialInheritedValueOverride);
    const h = housingOverride > 0;
    const c = commercialReported > 0;
    const housingField = isGift ? "mixedHousingGiftValueOverride" : "mixedHousingInheritedValueOverride";
    const commercialField = isGift ? "mixedCommercialGiftValueOverride" : "mixedCommercialInheritedValueOverride";
    if (h !== c) {
      return fieldError(h ? commercialField : housingField, `${label}: ${kindLabel}세 신고가액은 주택분·상가분을 모두 입력하거나 모두 비워 두세요 — 두 칸의 합계로 §164 가액·환산취득가액과 비교합니다 (소득세법 시행령 §163⑨).`);
    }
    if (!h && isGift && cmp.era === "pre_deemed") {
      return fieldError(housingField, `${label}: 의제취득일(1985.1.1.) 전 증여 겸용주택은 주택분·상가분 증여 신고가액을 입력하세요 (소득세법 시행령 §163⑨).`);
    }
  }

  // 주택분 — PHD ON이면 PHD 자체 필수 검증이 이미 개별주택가격을 커버 → override는 항상 optional.
  // PHD OFF일 때만 override||기존필드 필수.
  if (!asset.usePreHousingDisclosure) {
    const housingValue = housingOverride || parseAmount(asset.mixedAcqHousingPrice);
    if (housingValue <= 0) {
      return fieldError(isGift ? "mixedHousingGiftValueOverride" : "mixedHousingInheritedValueOverride", `${label}: ${acqLabel} 주택분 평가액을 입력하세요. (신고가액 override 또는 개별주택공시가격)`);
    }
  }

  // 상가분 — PHD는 주택 전용(§164⑤ 준용은 건물분만), 상가는 항상 직접 입력 축.
  const commercialOverride = isGift
    ? parseAmount(asset.mixedCommercialGiftValueOverride)
    : parseAmount(asset.mixedCommercialInheritedValueOverride);
  const commercialValue =
    commercialOverride ||
    (parseAmount(asset.mixedAcqCommercialBuildingPrice) > 0 &&
    parseAmount(asset.mixedAcqLandPricePerSqm) > 0
      ? 1 // 존재 플래그 — 실제 합계는 엔진이 재계산 (dual-truth 회피, feedback_ui_engine_dual_truth_avoidance)
      : 0);
  if (commercialValue <= 0) {
    return fieldError(isGift ? "mixedCommercialGiftValueOverride" : "mixedCommercialInheritedValueOverride", `${label}: ${acqLabel} 상가분 평가액을 입력하세요. (신고가액 override 또는 상가건물 기준시가+개별공시지가)`);
  }

  return null;
}
