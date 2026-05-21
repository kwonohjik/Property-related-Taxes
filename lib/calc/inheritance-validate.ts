/**
 * 상속세 클라이언트 측 validation (Phase G ⑧ 동기화 지점)
 *
 * UI 마법사에서 단계별 호출. API/Zod 검증 전 1차 차단으로 사용자 즉시 피드백.
 *
 * 정책 (CLAUDE.md ⑧):
 *   - API/UI fallback이 있는 필드는 validate도 동일 fallback 인식
 *   - UI 통과 ↔ validate 차단 모순 금지
 *   - 자동 안분 fallback 금지 — 미입력은 검증 오류
 */

import type {
  InheritanceTaxInput,
  EstateItem,
  PriorGift,
  PresumedInheritanceItem,
  DebtItem,
  Heir,
} from "@/lib/tax-engine/types/inheritance-gift.types";

// ────────────────────────────────────────────────────
// 단일 자산 — heirAllocations 합계 검증
// ────────────────────────────────────────────────────

/**
 * 가업상속공제 EstateItem 배타성·정합성 검증 (상증법 §18의2 + 상증령 §15).
 * - 영농↔가업 분류 동시 선택 금지 (`asset_dual_category_conflict`)
 * - businessType="individual"인데 EstateItem에 corporate_stock 분류 사용 금지 (`business_type_mismatch`)
 */
export function validateFamilyBusinessEstateItem(
  item: EstateItem,
  fb?: { businessType?: "individual" | "corporate" } | undefined,
): string | null {
  if (item.farmingCategory && item.familyBusinessCategory) {
    return `자산 "${item.name}" — 영농·가업 분류 동시 선택 불가 (asset_dual_category_conflict).`;
  }
  if (item.familyBusinessCategory === "corporate_stock" && fb?.businessType === "individual") {
    return `자산 "${item.name}" — 가업 유형 "개인사업자"에 법인주식 분류 불가 (business_type_mismatch).`;
  }
  return null;
}

/**
 * 자산의 heirAllocations 합이 평가액과 일치하는지 검증.
 * 자동 안분 fallback 금지 — 사용자 명시 입력 강제.
 */
export function validateEstateItemAllocations(item: EstateItem): string | null {
  if (!item.heirAllocations || item.heirAllocations.length === 0) {
    return null; // 분배 미입력은 허용 (총액-단위 계산 모드)
  }
  // 평가액 추정 — marketValue / standardPrice / appraisedValue / listed*Shares 중 가장 큰 값
  const candidates = [
    item.marketValue,
    item.standardPrice,
    item.appraisedValue,
    item.listedStockAvgPrice && item.listedStockShares
      ? item.listedStockAvgPrice * item.listedStockShares
      : undefined,
  ].filter((v): v is number => typeof v === "number" && v > 0);
  if (candidates.length === 0) return null;
  const expected = Math.max(...candidates);
  const sum = item.heirAllocations.reduce((s, a) => s + a.amount, 0);
  if (sum !== expected) {
    return `자산 "${item.name}" 협의분할 합계 ${sum.toLocaleString()}원 ≠ 평가액 ${expected.toLocaleString()}원`;
  }
  return null;
}

// ────────────────────────────────────────────────────
// DebtItem — heirAllocations 합계 검증
// ────────────────────────────────────────────────────

export function validateDebtItemAllocations(item: DebtItem): string | null {
  if (!item.heirAllocations || item.heirAllocations.length === 0) return null;
  // 장례비는 한도 적용 후 금액과 비교가 모호하므로 검증 생략 (사용자가 한도 내 금액 입력 가정)
  if (item.category === "funeral") return null;
  const sum = item.heirAllocations.reduce((s, a) => s + a.amount, 0);
  if (sum !== item.amount) {
    return `채무 "${item.name}" 협의분할 합계 ${sum.toLocaleString()}원 ≠ 금액 ${item.amount.toLocaleString()}원`;
  }
  return null;
}

// ────────────────────────────────────────────────────
// PresumedInheritanceItem — verifiedUseAmount 검증
// ────────────────────────────────────────────────────

export function validatePresumedItem(
  item: PresumedInheritanceItem,
): string | null {
  const total = item.amountWithin1Y + item.amountWithin2Y;
  if (item.verifiedUseAmount > total) {
    return `추정상속 "${item.id}" 사용처 확인 금액 ${item.verifiedUseAmount.toLocaleString()}원이 처분·인출 합계 ${total.toLocaleString()}원을 초과`;
  }
  if (
    item.amountWithin1Y < 0 ||
    item.amountWithin2Y < 0 ||
    item.verifiedUseAmount < 0
  ) {
    return `추정상속 "${item.id}" 금액은 0 이상이어야 합니다.`;
  }
  return null;
}

// ────────────────────────────────────────────────────
// PriorGift — 영리법인 corporateGiftComputedTax 필수
// ────────────────────────────────────────────────────

export function validatePriorGift(gift: PriorGift): string | null {
  if (gift.beneficiaryType === "corporate") {
    // 상증법 §13①2호 — 영리법인은 상속인 아닌 자에 해당. isHeir=true 동시 입력 차단.
    // UI 상태머신이 corporate ON 시 isHeir=false 강제하지만, API 직접 호출 차단용 정책 강화.
    if (gift.isHeir) {
      return `영리법인 사전증여 ${gift.giftDate} — beneficiaryType="corporate"는 isHeir=false여야 합니다 (§13①2호: 상속인 아닌 자 5년).`;
    }
    if (!gift.corporateGiftComputedTax || gift.corporateGiftComputedTax <= 0) {
      return `영리법인 사전증여 ${gift.giftDate} — corporateGiftComputedTax(증여세 산출세액)는 필수입니다.`;
    }
    // §28 증여세액공제 중복 방지 — 영리법인은 §4의2③ 비과세이므로 giftTaxPaid는 0이어야 함.
    if (gift.giftTaxPaid > 0) {
      return `영리법인 사전증여 ${gift.giftDate} — giftTaxPaid는 0이어야 합니다 (§4의2③ 비과세, §3의2②로 별도 공제).`;
    }
    if (!gift.doneeId) {
      return `영리법인 사전증여 ${gift.giftDate} — doneeId(수증자 Heir.id) 필수.`;
    }
  }
  // beneficiaryType 미설정 시 legacy isHeir 사용 (자동 추론)
  return null;
}

// ────────────────────────────────────────────────────
// Heir 배열 — doneeId 참조 정합성
// ────────────────────────────────────────────────────

export function validateHeirReferences(
  heirs: Heir[],
  priorGifts: PriorGift[],
  estateItems: EstateItem[],
  debtItems: DebtItem[],
  presumedItems: PresumedInheritanceItem[],
): string[] {
  const heirIds = new Set(heirs.map((h) => h.id));
  const errors: string[] = [];

  for (const gift of priorGifts) {
    if (gift.doneeId && !heirIds.has(gift.doneeId)) {
      errors.push(
        `사전증여 ${gift.giftDate} — doneeId "${gift.doneeId}"가 Heir 배열에 없음`,
      );
    }
  }
  const checkAllocs = (
    label: string,
    items: Array<{ id: string; heirAllocations?: { heirId: string }[] }>,
  ) => {
    for (const it of items) {
      if (!it.heirAllocations) continue;
      for (const a of it.heirAllocations) {
        if (!heirIds.has(a.heirId)) {
          errors.push(`${label} "${it.id}" heirId "${a.heirId}"가 Heir에 없음`);
        }
      }
    }
  };
  checkAllocs("자산", estateItems);
  checkAllocs("채무", debtItems);
  checkAllocs("추정상속재산", presumedItems);

  return errors;
}

// ────────────────────────────────────────────────────
// 통합 validation (마법사 마지막 단계 또는 API 호출 전)
// ────────────────────────────────────────────────────

/**
 * 전체 InheritanceTaxInput validation. 첫 오류 발견 시 그 메시지 반환.
 * 다중 오류 수집은 별도 호출자 책임 (필요 시 추후 확장).
 */
export function validateInheritanceTaxInput(
  input: InheritanceTaxInput,
): string | null {
  if (!input.deathDate) return "상속개시일을 입력하세요.";
  if (input.estateItems.length === 0) return "상속재산을 1개 이상 입력하세요.";
  if (input.heirs.length === 0)
    return "상속인·수유자를 1명 이상 등록하세요. (협의분할·법정상속분 안분의 기준)";

  for (const item of input.estateItems) {
    const e = validateEstateItemAllocations(item);
    if (e) return e;
    // 가업상속공제 배타성·정합성 (2026-05-21, 상증법 §18의2)
    const fbe = validateFamilyBusinessEstateItem(item, input.deductionInput?.familyBusiness);
    if (fbe) return fbe;
  }
  if (input.debtItems) {
    for (const di of input.debtItems) {
      const e = validateDebtItemAllocations(di);
      if (e) return e;
    }
  }
  if (input.presumedItems) {
    for (const pi of input.presumedItems) {
      const e = validatePresumedItem(pi);
      if (e) return e;
    }
  }
  for (const gift of input.preGiftsWithin10Years) {
    const e = validatePriorGift(gift);
    if (e) return e;
  }
  const refErrs = validateHeirReferences(
    input.heirs,
    input.preGiftsWithin10Years,
    input.estateItems,
    input.debtItems ?? [],
    input.presumedItems ?? [],
  );
  if (refErrs.length > 0) return refErrs[0];

  return null;
}
