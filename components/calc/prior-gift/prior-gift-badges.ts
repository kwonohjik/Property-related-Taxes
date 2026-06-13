/**
 * prior-gift-badges — 사전증여 행 배지 derive (읽기 전용 테이블용).
 *
 * prior-gift-table-view.plan.md §3.5.
 * resolveChips(estate)·resolveDebtBadges(debt) 동형 — 실제 입력된 비기본 값만 표시.
 * tone 클래스는 CHIP_TONE_CLASSES(estate-card/chip-config) 재사용 (신규 색 매핑 금지,
 * feedback_tailwind_static_tone_mapping).
 *
 * 모드 분기:
 *   - 상속세(inheritance): 직접입력 ⑤·§53의2 노출. 영리법인·§30 특례 공통.
 *   - 증여세(gift): 세대생략 §57 노출. 영리법인·§30 특례 공통.
 */

import type { ChipTone } from "@/components/calc/inheritance/estate-card/chip-config";
import type { PriorGift } from "@/lib/tax-engine/types/inheritance-gift.types";

export interface PriorGiftBadge {
  key: string;
  label: string;
  tone: ChipTone;
}

/**
 * 사전증여 행 배지 — 실제 적용된 비기본 옵션만 (isActiveData 정책 동형).
 * heirs는 불필요 — 수증자 라벨은 별도 컬럼(donorSummaryLabel)에서 처리.
 */
export function resolvePriorGiftBadges(
  gift: PriorGift,
  mode: "inheritance" | "gift",
): PriorGiftBadge[] {
  const badges: PriorGiftBadge[] = [];

  // 이력 기반 자동 입력
  if (gift.sourceCalculationId) {
    badges.push({ key: "history", label: "📋 이력 기반", tone: "violet" });
  }

  // 영리법인 사전증여 (§13①2호 · §3의2②)
  if (gift.beneficiaryType === "corporate") {
    badges.push({ key: "corporate", label: "🏢 영리법인", tone: "violet" });
  }

  // §30 조특법 과세특례 (창업자금 §30의5 / 가업승계 §30의6)
  if (gift.specialTreatmentType === "startup") {
    badges.push({ key: "startup", label: "창업자금 §30의5", tone: "emerald" });
  }
  if (gift.specialTreatmentType === "family_business") {
    badges.push({ key: "family_business", label: "가업승계 §30의6", tone: "emerald" });
  }

  // 과세표준 직접입력 ⑤ (상속세 모드 전용 — 신고서 과세표준 수기)
  if (mode === "inheritance" && gift.priorGiftTaxBaseInputMode === "manual") {
    badges.push({ key: "manualBase", label: "과세표준 직접입력", tone: "amber" });
  }

  // §53의2 혼인·출산 증여재산공제 (상속세 모드 전용)
  if (mode === "inheritance" && (gift.marriageBirthDeduction ?? 0) > 0) {
    badges.push({ key: "marriageBirth", label: "§53의2", tone: "sky" });
  }

  // §57 세대생략 할증 (증여세 모드 전용)
  if (mode === "gift" && gift.wasGenerationSkip === true) {
    badges.push({ key: "genSkip", label: "세대생략 §57", tone: "rose" });
  }

  // 부표 1 부수토지 토글 (03 토지II)
  if (
    gift.propertyCategory === "real_estate_land" &&
    gift.isAttachedLandToBuilding === true
  ) {
    badges.push({ key: "attachedLand", label: "부수토지(03)", tone: "sky" });
  }

  return badges;
}

/** 옵션 카운트 — 편집 힌트 ⚙️ 표시용 (배지 수와 동일 술어, 단일 진실) */
export function countPriorGiftOptions(
  gift: PriorGift,
  mode: "inheritance" | "gift",
): number {
  return resolvePriorGiftBadges(gift, mode).length;
}
