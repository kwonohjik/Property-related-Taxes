/**
 * 상속세 ⑧ — **항목 단위** 검증자 (800줄 분리, 2026-09-11)
 *
 * `inheritance-validate.ts` 가 803줄로 정책(트리거 800 · 착지 ≤700)을 넘겨 분리했다.
 * 이음매는 **함수 단위 이동**이다 — 이 파일의 함수들은 오케스트레이터
 * (`validateInheritanceTaxInput`)를 **한 개도 참조하지 않는다**(단방향 확인 후 이동).
 *
 * 정책 (CLAUDE.md ⑧):
 *   - API/UI fallback이 있는 필드는 validate도 동일 fallback 인식
 *   - UI 통과 ↔ validate 차단 모순 금지
 *   - 자동 안분 fallback 금지 — 미입력은 검증 오류
 *
 * ⚠️ 원본이 이 파일을 **재export** 한다(import 사이트 무변경 —
 *    [[feedback_800line_split_export_preservation]]).
 */

import type {
  EstateItem,
  PriorGift,
  PresumedInheritanceItem,
  DebtItem,
  Heir,
} from "@/lib/tax-engine/types/inheritance-gift.types";
import { deriveCollateralDebts } from "@/lib/tax-engine/inheritance-collateral-debt";
import { validateSubstituteHeirs } from "@/lib/calc/inheritance-validate-substitute";
import { resolveEngineValuatedAmount } from "@/lib/tax-engine/property-valuation";
import { checkCorporateGiftRule } from "@/lib/calc/prior-gift-corporate-rule";
import { checkMarriageBirthGiftRule } from "@/lib/calc/prior-gift-marriage-birth-rule";
import { checkDeceasedDonorRule } from "@/lib/calc/prior-gift-deceased-rule";
import {
} from "@/lib/calc/resident-number";

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
 * ⑧ 가업상속공제 요건 자동판정 기초데이터 날짜 정합성 검증 (Phase 1, 2026-06-02).
 *
 * 입력오류·기간계산오류 차단(사용자 핵심 요구). 날짜는 전부 optional — 입력된 경우에만 모순 검사
 * (자동 안분 fallback 금지: 미입력은 차단하지 않고 요건 자동판정에서 false 처리). 비교는 YYYY-MM-DD 사전순.
 */
export function validateFamilyBusinessDates(
  fb:
    | {
        heirBirthDate?: string;
        heirEngagementStartDate?: string;
        heirCEOAppointDate?: string;
        decedentShareAcquiredDate?: string;
        decedentCEOPeriods?: Array<{ startDate: string; endDate: string }>;
      }
    | undefined,
  deathDate: string,
): string | null {
  if (!fb) return null;
  if (fb.heirBirthDate && fb.heirBirthDate > deathDate) {
    return "가업상속인 생년월일이 상속개시일보다 늦습니다. 날짜를 확인하세요.";
  }
  if (fb.heirEngagementStartDate && fb.heirEngagementStartDate > deathDate) {
    return "가업종사 시작일이 상속개시일보다 늦습니다 (§15③2호나는 상속개시일 전 종사). 날짜를 확인하세요.";
  }
  if (fb.heirCEOAppointDate && fb.heirCEOAppointDate < deathDate) {
    return "대표이사 취임(예정)일이 상속개시일보다 이릅니다 (§15③2호라는 신고기한 후 2년 이내). 날짜를 확인하세요.";
  }
  // Phase 2 — 피상속인 요건 날짜 정합성 (상증령 §15③1호)
  if (fb.decedentShareAcquiredDate && fb.decedentShareAcquiredDate > deathDate) {
    return "지분 취득일이 상속개시일보다 늦습니다 (§15③1호가는 10년 이상 계속 보유). 날짜를 확인하세요.";
  }
  if (fb.decedentCEOPeriods) {
    for (const p of fb.decedentCEOPeriods) {
      if (p.startDate && p.endDate && p.startDate > p.endDate) {
        return "피상속인 대표이사 재직기간의 시작일이 종료일보다 늦습니다. 날짜를 확인하세요.";
      }
    }
  }
  return null;
}

/**
 * ⑧ 기업 규모 요건(상증령 §15①3호·§15②3호) 필수 입력 검증 — IG-035.
 *
 * 🔴 화면 hint는 「미입력 시 기준 미충족으로 처리」라고 안내했지만 엔진은 정반대다:
 * `(input.totalAssets ?? 0) >= 5천억`이라 **미입력(undefined)은 0으로 읽혀 규모 요건을 통과**한다
 * (중견기업의 `averageRevenue3Y`도 같다). 즉 안내를 믿고 비워 둔 사용자는 「미충족되겠지」라고
 * 생각하지만 실제로는 가업상속공제가 적용되어, 세액이 **조용히** 갈린다.
 *
 * 이 파일의 FB 날짜 검증이 쓰는 「미입력은 차단하지 않고 요건 자동판정에서 false 처리」 관례는
 * 여기 적용되지 않는다 — 그 관례의 전제(엔진이 미입력을 false로 본다)가 **이 필드에서는 거짓**이다.
 * ⇒ 저장소 기본 원칙(「자동 안분 fallback 금지 — 미입력은 검증 오류로 차단」)대로 차단한다.
 */
export function validateFamilyBusinessEnterpriseSize(
  fb: { enterpriseSize?: "sme" | "medium"; totalAssets?: number; averageRevenue3Y?: number } | undefined,
): string | null {
  if (!fb) return null;
  if (fb.enterpriseSize === "sme" && fb.totalAssets == null) {
    return "자산총액을 입력하세요. (상증령 §15①3호 — 중소기업 규모 요건: 자산총액 5천억원 미만)";
  }
  if (fb.enterpriseSize === "medium" && fb.averageRevenue3Y == null) {
    return "직전 3년 평균 매출액을 입력하세요. (상증령 §15②3호 — 중견기업 규모 요건)";
  }
  return null;
}

/**
 * ⑧ 복수가업 순차공제 추가 가업 입력 정합성 검증 (상증령 §15④ + 상증칙 §5 — PR-4).
 *
 * 자동 안분 fallback 금지 — 추가 가업을 등록했으면 영위연수·가업가액을 명시 입력해야 함.
 * - 가업가액 입력 + 영위 10년 미만 → 가업 아님 (상증법 §18의2① 가업 정의) → 차단
 * - 영위연수 입력 + 가업가액 0 → 미입력 항목 (계산 0 기여) → 차단
 */
export function validateAdditionalFamilyBusinesses(
  fb:
    | {
        additionalFamilyBusinesses?: Array<{
          operatingYears: number;
          businessValue: number;
          label?: string;
        }>;
      }
    | undefined,
): string | null {
  if (!fb?.additionalFamilyBusinesses) return null;
  for (const [i, b] of fb.additionalFamilyBusinesses.entries()) {
    const name = b.label?.trim() || `추가 가업 ${i + 1}`;
    if (b.businessValue > 0 && b.operatingYears < 10) {
      return `${name} — 영위 10년 미만은 가업이 아닙니다 (상증법 §18의2① 가업 정의). 영위연수를 확인하세요.`;
    }
    if (b.operatingYears >= 10 && b.businessValue <= 0) {
      return `${name} — 가업상속재산가액을 입력하세요. (미사용 시 추가 가업 항목을 삭제)`;
    }
  }
  return null;
}

/**
 * 자산의 heirAllocations 합이 평가액과 일치하는지 검증.
 * 자동 안분 fallback 금지 — 사용자 명시 입력 강제.
 *
 * T2 수정: expected를 엔진 권위 평가 resolveEngineValuatedAmount에 위임(§66 하한·주식 라우팅 포함).
 * 1-B(이전): expected를 §60 단일 진실 resolveEstateItemValue에 위임.
 *   - 수정 전: max(marketValue, standardPrice, appraisedValue, computeStockValuation)
 *     → 명시값<csv 케이스에서 expected=csv, 엔진(1-A 후)=명시값 → 합계열<인별열 역방향 갭
 *   - 수정 후: resolveEstateItemValue(explicit-first) = 엔진과 동일 → 4경로 단일 진실 통일
 *     → explicit-first: marketValue > appraisedValue > standardPrice > computeStockValuation
 *
 * ⑧ 동기화 지점: API/UI fallback과 validate가 동일 함수 사용 → UI 통과 ↔ validate 차단 모순 제거.
 */

/**
 * §63④ 예금 자동 계산 모드 필수 필드 검증 (⑧ 동기화 지점).
 * UI/API fallback과 동일 조건 적용 — 자동 안분 fallback 금지.
 */
export function validateFinancialSavingsFields(item: EstateItem): string | null {
  if (item.category !== "financial") return null;
  const mode = item.savingsValuationMode ?? "balance";
  if (mode === "auto") {
    if (!item.savingsPrincipal || item.savingsPrincipal <= 0) {
      return `자산 "${item.name}" §63④ 자동 계산: 예입원금을 입력하세요.`;
    }
    if (!item.savingsStartDate) {
      return `자산 "${item.name}" §63④ 자동 계산: 예입일(최초 납입일)을 입력하세요.`;
    }
    const rate = item.savingsAnnualRate ?? 0;
    if (rate < 0 || rate > 100) {
      return `자산 "${item.name}" §63④ 자동 계산: 연이율은 0~100% 사이여야 합니다.`;
    }
  }
  if (mode === "manual") {
    if (!item.savingsPrincipal || item.savingsPrincipal <= 0) {
      return `자산 "${item.name}" §63④ 직접 입력: 예입원금을 입력하세요.`;
    }
  }
  return null;
}

/**
 * 가상화폐(가상자산) §60② 필수 필드 검증 (⑧ 동기화 지점).
 * cryptoAssetItemSchema superRefine과 동일 조건 — UI 통과 ↔ Zod 차단 모순 제거. 자동 안분 fallback 금지.
 */
export function validateCryptoFields(item: EstateItem): string | null {
  if (item.category !== "crypto_asset") return null;
  const mode = item.cryptoValuationMode ?? "direct";
  if (!item.cryptoQuantity || item.cryptoQuantity <= 0) {
    return `자산 "${item.name}" 가상자산: 보유 수량을 입력하세요.`;
  }
  if (mode === "direct") {
    if (!item.cryptoUnitPrice || item.cryptoUnitPrice <= 0) {
      return `자산 "${item.name}" 가상자산: 1코인당 평가단가를 입력하세요.`;
    }
  } else if (!item.cryptoDailyPrices || item.cryptoDailyPrices.length === 0) {
    return `자산 "${item.name}" 가상자산: 거래일별 일평균가액을 1건 이상 입력하세요.`;
  } else if (item.cryptoDailyPrices.some((p) => !(p > 0))) {
    // 0원·빈 행이 단순평균에 포함되면 평가단가 과소산정 → 차단 (Zod superRefine과 동일)
    return `자산 "${item.name}" 가상자산: 각 거래일의 일평균가액은 0보다 커야 합니다.`;
  }
  return null;
}

export function validateEstateItemAllocations(item: EstateItem): string | null {
  if (!item.heirAllocations || item.heirAllocations.length === 0) {
    return null; // 분배 미입력은 허용 (총액-단위 계산 모드)
  }
  // T2 (R1): 엔진 권위 평가액 단일 진실 — §66 담보 하한·주식 라우팅 포함.
  //   resolveEstateItemValue(§60 우선순위만)는 §66 하한 미적용 → 엔진(categoryTotals)과
  //   괴리하여 협의분할 합(650)이 엔진 평가(550 vs 담보 650)와 다른 기준으로 통과되던 dual-truth 제거.
  const expected = resolveEngineValuatedAmount(item);
  if (expected === 0) return null;
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

/**
 * 사전증여 개별 항목 검증.
 *
 * 영리법인 규칙은 checkCorporateGiftRule (prior-gift-corporate-rule.ts) 단일진실.
 * Zod superRefine(⑨)도 동일 헬퍼를 사용하므로 client/API 경로가 동일하게 차단된다.
 */
export function validatePriorGift(gift: PriorGift): string | null {
  // 영리법인 필수요건 — 공유 헬퍼 위임 (§13①2호 · §4의2③ · §3의2②)
  const corpError = checkCorporateGiftRule(gift);
  if (corpError !== null) return corpError;

  // §53의2 혼인·출산 — 단일진실 헬퍼 (Zod priorGiftSchema와 공용)
  const mbError = checkMarriageBirthGiftRule(gift);
  if (mbError !== null) return mbError;

  // [B] 직접 입력 모드 — giftTaxBase 미입력 차단 (자동 안분 fallback 금지 정책)
  if (
    gift.priorGiftTaxBaseInputMode === "manual" &&
    (gift.giftTaxBase == null || gift.giftTaxBase < 0)
  ) {
    return "직접 입력 모드: 증여 과세표준을 입력하세요 (증여세 신고서 과세표준 ⑤).";
  }

  // 증여자 사망 합산제외 (재산-58) — 단일진실 헬퍼 (Zod priorGiftSchema와 공용 ⑫)
  const deceasedError = checkDeceasedDonorRule(gift);
  if (deceasedError !== null) return deceasedError;

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

  // 대습상속(민법 §1001) 입력 검증 (2026-06-09, 결정-C) — sibling 파일 위임(800줄 정책)
  errors.push(...validateSubstituteHeirs(heirs));

  return errors;
}

// ────────────────────────────────────────────────────
// 담보채무 §14 자동공제 검증 (B8, 설계 §3-5)
// ────────────────────────────────────────────────────

/**
 * 자산별 담보채무 opt-in 검증:
 *  - deductSecuredClaimAsDebt === true 인데 mortgageAmount + leaseDeposit === 0 → 오류
 */
export function validateCollateralDebtOptIn(item: EstateItem): string | null {
  if (item.deductSecuredClaimAsDebt !== true) return null;
  // deposit(전세보증금 반환채권=자산)은 §14 담보채무 대상 아님 — 엔진이 파생을 무시하므로
  // stale store로 토글이 ON이라도 validate가 차단하지 않도록 정합(deriveCollateralDebts와 동일 가드).
  if (item.category === "deposit") return null;
  const total = (item.mortgageAmount ?? 0) + (item.leaseDeposit ?? 0);
  if (total <= 0) {
    return `자산 "${item.name}" — §14 자동공제 토글이 ON이지만 담보채권액(저당 + 임대보증금)이 0입니다. 담보채권액을 입력하거나 토글을 OFF 해주세요.`;
  }
  return null;
}

/**
 * debtItems에 파생 담보채무와 금액이 일치하는 항목이 있으면 이중 공제 의심 warning 반환.
 * 차단이 아닌 경고(명칭 자유입력이라 금액 기준만 비교 — E-2).
 * 반환값: warning 문자열 배열 (빈 배열이면 이상 없음)
 */
export function warnCollateralDebtDuplication(
  estateItems: EstateItem[],
  debtItems: DebtItem[] | undefined,
): string[] {
  if (!debtItems || debtItems.length === 0) return [];
  const derived = deriveCollateralDebts(estateItems);
  if (derived.length === 0) return [];

  const warnings: string[] = [];
  for (const d of derived) {
    // §22 금융채무 우선 비교, 없으면 전체 amount 비교
    const matchAmount =
      d.financialDebtAmount > 0 ? d.financialDebtAmount : d.amount;
    const duplicate = debtItems.find(
      (di) => di.category !== "funeral" && di.amount === matchAmount,
    );
    if (duplicate) {
      warnings.push(
        `채무 "${duplicate.name}"(${matchAmount.toLocaleString()}원)이 자산 평가 담보채무와 금액 일치 — 이중 공제 위험. 재산평가에서 §14 자동공제 ON 시 채무 명세에 중복 입력하지 마세요.`,
      );
    }
  }
  return warnings;
}

