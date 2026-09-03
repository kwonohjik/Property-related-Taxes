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
import { deriveCollateralDebts } from "@/lib/tax-engine/inheritance-collateral-debt";
import { validateSubstituteHeirs } from "@/lib/calc/inheritance-validate-substitute";
import { validateVacancyPortion } from "@/lib/calc/estate-item-vacancy-validate";
import { resolveEngineValuatedAmount, injectSavingsAccrualIfAuto } from "@/lib/tax-engine/property-valuation";
import { checkCorporateGiftRule } from "@/lib/calc/prior-gift-corporate-rule";
import { checkMarriageBirthGiftRule } from "@/lib/calc/prior-gift-marriage-birth-rule";
import { checkDeceasedDonorRule } from "@/lib/calc/prior-gift-deceased-rule";
import { toOptionalDate } from "@/lib/api/date-coerce";
import { validateUnlistedStockV2 } from "./inheritance-validate-unlisted";
export { validateUnlistedStockV2 };
import {
  parseResidentNumber,
  isCompleteResidentNumber,
} from "@/lib/calc/resident-number";
import { endOfMonth, addMonths, format } from "date-fns";
import { validateAllExemptionInputs } from "./inheritance-validate-exemption";
// 800줄 분리 — 외부 import 호환 보존 (feedback_800line_split_export_preservation)
export {
  validateExemptionAreaInput,
  validateExemptionItemAllocations,
  validateRelatedStockInput,
  validateAllExemptionInputs,
} from "./inheritance-validate-exemption";

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

  // ⑧ 장례비 음수 가드 (상증령 §9②) — Zod min(0) 통과 후에도 방어적 검증
  if (input.funeralExpense < 0) return "일반 장례비는 0원 이상이어야 합니다.";
  if (input.funeralBonganExpense !== undefined && input.funeralBonganExpense < 0) {
    return "봉안시설·자연장지 비용은 0원 이상이어야 합니다.";
  }
  if (input.heirs.length === 0)
    return "상속인·수유자를 1명 이상 등록하세요. (협의분할·법정상속분 안분의 기준)";

  // ⑧ 주민등록번호 필수 (자연인 전 관계, 법인 제외) — 앞 6자리에서 생년월일·성별 도출
  //    (계획서 의견1: 13자리 입력 받되 앞 7자리만 파싱, 뒷자리 체크섬 미검증)
  for (const heir of input.heirs) {
    if (heir.relation === "corporate") continue;
    const who = heir.name?.trim() || "상속인";
    if (!heir.residentNumber) {
      // 외국인 등록번호 등으로 주민번호가 없으면 생년월일 직접입력을 허용 (fallback)
      if (!heir.birthDate) {
        return `${who}의 주민등록번호를 입력하세요. (생년월일·성별 자동 도출 — 미입력 시 생년월일 직접 입력)`;
      }
    } else if (!isCompleteResidentNumber(heir.residentNumber)) {
      return `${who}의 주민등록번호 형식이 올바르지 않습니다. (13자리 숫자)`;
    } else if (!parseResidentNumber(heir.residentNumber) && !heir.birthDate) {
      return `${who}의 주민등록번호 앞자리에서 생년월일을 도출할 수 없습니다. 앞 7자리를 확인하거나 생년월일을 직접 입력하세요.`;
    }
  }

  // ⑧ 장애인공제(§20①4호)는 성별·연령별 기대여명 필요 → 장애인 heir 성별 필수 (자동추정 금지)
  for (const heir of input.heirs) {
    if (heir.isDisabled === true && !heir.gender) {
      const who = heir.name?.trim() || "장애인 상속인";
      return `${who}의 성별을 입력하세요. (장애인공제 §20①4호 — 성별·연령별 기대여명 기준)`;
    }

    // ⑧ Phase 4: §23의2② 부득이사유 날짜 정합성 검증 (비차단 경고 사유는 엔진 처리)
    if (heir.cohabitReasons && heir.cohabitReasons.length > 0) {
      const who = heir.name?.trim() || "동거 상속인";
      for (const reason of heir.cohabitReasons) {
        if (reason.startDate >= reason.endDate) {
          return `${who}의 부득이사유 종료일(${reason.endDate})은 시작일(${reason.startDate})보다 늦어야 합니다.`;
        }
        // endDate가 deathDate보다 늦으면 경고 (비차단 — clamp 처리되므로 validation 차단 안 함)
        // overseas_grad·medical 1년 미만 경고는 엔진이 hasMedicalUnder1YWarning 등으로 처리
      }
    }
  }

  // ⑧ 동거가족(§20 P1, 시령 §18①) 장애인도 동일 — 성별 필수 (자동추정 금지)
  for (const dep of input.deductionInput?.cohabitantDependents ?? []) {
    if (dep.isDisabled === true && !dep.gender) {
      const who = dep.name?.trim() || "동거가족";
      return `${who}의 성별을 입력하세요. (장애인공제 §20①4호 — 성별·연령별 기대여명 기준)`;
    }
  }

  // 비과세·불산입 입력 검증 (면적 §8③ + 특수관계법인 주식 §16② + 협의분할) — 단일 집계
  const exemptionErr = validateAllExemptionInputs(input.exemptions);
  if (exemptionErr) return exemptionErr;

  // §63④ 예금 auto 모드 pre-inject (H-1 패턴): 협의분할 합계 검증에 정확한 평가액 반영
  const deathDateObj = input.deathDate ? new Date(input.deathDate) : undefined;
  for (const rawItem of input.estateItems) {
    // §63④ 자동 계산 필수 필드 검증 (⑧ 동기화 지점)
    const sf = validateFinancialSavingsFields(rawItem);
    if (sf) return sf;
    // §60② 가상자산 필수 필드 검증 (⑧ 동기화 지점)
    const cf = validateCryptoFields(rawItem);
    if (cf) return cf;
    // auto 모드 pre-inject — 미수이자·원천징수세액 주입 후 협의분할 검증
    const item = deathDateObj ? injectSavingsAccrualIfAuto(rawItem, deathDateObj) : rawItem;
    const e = validateEstateItemAllocations(item);
    if (e) return e;
    // 가업상속공제 배타성·정합성 (2026-05-21, 상증법 §18의2)
    const fbe = validateFamilyBusinessEstateItem(item, input.deductionInput?.familyBusiness);
    if (fbe) return fbe;
    // 담보채무 §14 자동공제 opt-in 검증 (B8, 설계 §3-5)
    const cde = validateCollateralDebtOptIn(item);
    if (cde) return cde;
    // §61⑤ 미임대(공실) 부분 입력 정합 (rental-vacancy-portion)
    const ve = validateVacancyPortion(item);
    if (ve) return ve;
  }
  // 가업상속공제 요건 날짜 정합성 (Phase 1, 2026-06-02)
  const fbDateErr = validateFamilyBusinessDates(
    input.deductionInput?.familyBusiness,
    input.deathDate,
  );
  if (fbDateErr) return fbDateErr;
  // 복수가업 추가 가업 입력 정합성 (PR-4, 상증령 §15④)
  const fbMultiErr = validateAdditionalFamilyBusinesses(input.deductionInput?.familyBusiness);
  if (fbMultiErr) return fbMultiErr;
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
  // 비상장주식 V2 입력 검증 (Phase 5-A)
  // ctx.evaluationDateFallback = deathDate — UI display fallback과 동일 fallback 인식 (CLAUDE.md ⑧)
  const evalCtx = { evaluationDateFallback: input.deathDate };
  for (const item of input.estateItems) {
    const e = validateUnlistedStockV2(item, evalCtx);
    if (e) return e;
    const lsErr = validateListedStockBesshi(item);
    if (lsErr) return lsErr;
  }
  const refErrs = validateHeirReferences(
    input.heirs,
    input.preGiftsWithin10Years,
    input.estateItems,
    input.debtItems ?? [],
    input.presumedItems ?? [],
  );
  if (refErrs.length > 0) return refErrs[0];

  // §30 단기재상속 교차검증 — 자동 안분 fallback 금지 (feedback_no_silent_apportion_fallback)
  // 신규 재산별 배열 모델 + legacy 단일 분수 모델 모두 처리.
  // ⑧ 체크리스트 "shortTermReinherit" 비활성 시 buildInput에서 필드 전부 undefined 전달.
  //    → shortTermCreditInput.shortTermReinheritAssets == null → hasArrayAssets = false
  //    → 아래 검증 블록 완전 통과 (UI 통과 ↔ validate 차단 모순 없음, CLAUDE.md ⑧).
  const shortTermCreditInput = input.creditInput;
  if (shortTermCreditInput) {
    const assets = shortTermCreditInput.shortTermReinheritAssets;
    const priorDeath = shortTermCreditInput.shortTermReinheritPriorDeathDate;
    const priorEstate = shortTermCreditInput.shortTermReinheritPriorEstateValue;
    const hasArrayAssets = assets != null && assets.length > 0;
    const hasLegacyAsset =
      shortTermCreditInput.shortTermReinheritAssetValue != null &&
      shortTermCreditInput.shortTermReinheritAssetValue > 0;
    const hasPrior = priorEstate != null && priorEstate > 0;

    // 1차(전의) 상속개시일 ≤ 2차 상속개시일
    if (priorDeath && input.deathDate && priorDeath > input.deathDate) {
      return "단기재상속 §30: 1차(전의) 상속개시일은 상속개시일보다 이후일 수 없습니다.";
    }

    if (hasArrayAssets) {
      // ── 재산별 배열 모델 (집행 30-22-1②) ──
      if (!hasPrior) {
        return "단기재상속 §30: 재상속분 재산을 입력한 경우 전의 상속재산가액(분모)을 입력해야 합니다.";
      }
      if (
        shortTermCreditInput.shortTermReinheritTaxPaid == null ||
        shortTermCreditInput.shortTermReinheritTaxPaid <= 0
      ) {
        return "단기재상속 §30: 재상속분 재산을 입력한 경우 전의 상속세 산출세액을 입력해야 합니다.";
      }
      let sum = 0;
      for (const a of assets!) {
        // 각 재산 priorValue ≤ 전의 상속재산가액 (비율≤1, 집행 30-22-1③)
        if (a.priorValue > priorEstate!) {
          return `단기재상속 §30: 재상속분 재산 "${a.name ?? ""}" 가액이 전의 상속재산가액을 초과할 수 없습니다.`;
        }
        sum += a.priorValue;
      }
      // Σ priorValue ≤ 전의 상속재산가액 (재상속분 합 ≤ 전상속재산)
      if (sum > priorEstate!) {
        return "단기재상속 §30: 재상속분 재산가액 합계가 전의 상속재산가액을 초과할 수 없습니다.";
      }
    } else if (hasLegacyAsset || hasPrior) {
      // ── legacy 단일 분수 모델 (§30②1호) — 분자·분모 동반 입력 강제 ──
      if (hasLegacyAsset && !hasPrior) {
        return "단기재상속 §30②1호 안분: 재상속분 재산가액을 입력한 경우 전의 상속재산가액도 함께 입력해야 합니다.";
      }
      if (!hasLegacyAsset && hasPrior) {
        return "단기재상속 §30②1호 안분: 전의 상속재산가액을 입력한 경우 재상속분 재산가액도 함께 입력해야 합니다.";
      }
      if (hasLegacyAsset && hasPrior) {
        const numerator = shortTermCreditInput.shortTermReinheritAssetValue!;
        if (numerator > priorEstate!) {
          return "단기재상속 §30②1호: 재상속분 재산가액(분자)이 전의 상속재산가액(분모)을 초과할 수 없습니다.";
        }
      }
    }
  }

  // §29 외국납부세액공제 교차검증 (상증령 §21①)
  // ⑧ 체크리스트 "foreignTax" 비활성 시 buildInput에서 foreignTaxPaid·foreignInheritanceTaxBase
  //    모두 undefined 전달 → 아래 if(base != null) / if(paid == null) 분기 전부 미진입.
  //    UI 통과 ↔ validate 차단 모순 없음 (CLAUDE.md ⑧).
  const foreignCreditInput = input.creditInput;
  if (foreignCreditInput) {
    const base = foreignCreditInput.foreignInheritanceTaxBase;
    const paid = foreignCreditInput.foreignTaxPaid;
    // V-29-2: 음수 차단 (Zod nonnegative 동기화)
    if (base != null && base < 0) {
      return "외국납부세액공제 §29: 국외 상속재산 과세표준은 0 이상이어야 합니다.";
    }
    // V-29-3: 과세표준만 입력 + 외국납부세액 미입력 → 무의미 입력 차단
    // (역방향 — 외국세액만 입력·과표 미입력 → 한도 0으로 공제 0, UI hint 안내. 차단 안 함)
    if (base != null && base > 0 && (paid == null || paid <= 0)) {
      return "외국납부세액공제 §29: 국외 상속재산 과세표준을 입력하려면 외국에서 납부한 상속세액도 입력해야 합니다.";
    }
  }

  // ⑧ §23 재해손실공제 검증 (2026-06-07)
  // 3중 패턴: API max(0,loss−comp) fallback ↔ validate 동일 fallback (UI 통과 ↔ validate 차단 모순 금지)
  const casualtyLoss = input.deductionInput?.casualtyLoss;
  if (casualtyLoss !== undefined) {
    // 1. 재해손실재산가액 필수, 0 초과
    if (!casualtyLoss.lossValue || casualtyLoss.lossValue <= 0) {
      return "재해손실재산가액을 입력하세요. (§23 재해손실공제)";
    }
    // 2. 재난 발생일 필수
    if (!casualtyLoss.disasterDate) {
      return "재난 발생일을 입력하세요. (§23 재해손실공제)";
    }
    // 3. 재난 발생일 ≥ 상속개시일 (하한 — §23: 상속개시 후 재해)
    if (input.deathDate && casualtyLoss.disasterDate < input.deathDate) {
      return "재난은 상속개시일 이후 발생해야 합니다. (§23 — 상속개시 후 신고기한 이내)";
    }
    // 4. 재난 발생일 ≤ 신고기한(상속개시월 말일 + 6개월) (상한)
    if (input.deathDate) {
      const deathDateObj = toOptionalDate(input.deathDate);
      if (deathDateObj) {
        const filingDeadline = format(addMonths(endOfMonth(deathDateObj), 6), "yyyy-MM-dd");
        if (casualtyLoss.disasterDate > filingDeadline) {
          return `§23 요건: 신고기한(${filingDeadline}) 이내 발생한 재난이어야 합니다.`;
        }
      }
    }
    // 5. 보전가능금액 > 손실재산가액 차단 (전액보전=0은 허용 — max(0,…) fallback과 동기화)
    const compensated = casualtyLoss.compensatedValue ?? 0;
    if (compensated > casualtyLoss.lossValue) {
      return "보전가능금액이 재해손실재산가액을 초과합니다. 보전가능금액은 손실액 이하여야 합니다.";
    }
  }

  // ⑧ G4 §23의2① 주택부수토지 면적한도 — 4필드 partial 입력 차단 (전부 또는 전무)
  // 자동 안분 fallback 금지: 미입력=차감 없음이므로, 일부만 입력 시 의도 불명확 → 오류 차단
  {
    const di = input.deductionInput;
    const hasArea = di?.ancillaryLandArea !== undefined;
    const hasFootprint = di?.buildingFootprintArea !== undefined;
    const hasRegion = di?.ancillaryLandRegion !== undefined;
    const hasLandPrice = di?.ancillaryLandStdPrice !== undefined;
    const filledCount = [hasArea, hasFootprint, hasRegion, hasLandPrice].filter(Boolean).length;
    if (filledCount > 0 && filledCount < 4) {
      return "주택부수토지 면적한도(§23의2①): 부수토지 면적·건물 정착 면적·지역 구분·부수토지 공시가격 네 항목을 모두 입력하거나 모두 비워야 합니다.";
    }
  }

  /**
   * ⑧ 🔴 G-07 B1 — 신고불성실가산세 축 필수 입력 (「국세기본법」 §47의2·§47의3).
   *
   * 미입력을 통과시키면 엔진이 **조용히 납세자에게 불리한 값**을 낸다 —
   * 기한후신고일이 없으면 §48②2호 감면 구간을 가를 수 없어 감면율 0(가산세 전액)이 되고,
   * 당초 신고세액이 없으면 §47의3① base 가 결정세액 전액이 되어 과대 산출된다.
   * 「자동 안분 fallback 금지 — 미입력은 검증 오류로 차단」과 같은 층위다.
   */
  {
    const fp = input.filingPenalty;
    if (fp?.filingStatus === "late" && !fp.actualFilingDate) {
      return "기한후신고일을 입력하세요. (국세기본법 §48②2호 감면 구간 판정에 필요)";
    }
    if (fp?.filingStatus === "on_time" && fp.isUnderReported) {
      if (fp.originalFiledTax === undefined) {
        return "당초 신고세액을 입력하세요. (국세기본법 §47의3① 「과소신고한 납부세액」 산정에 필요)";
      }
      if (fp.originalFiledTax < 0) {
        return "당초 신고세액은 0원 이상이어야 합니다.";
      }
    }
  }

  return null;
}

// ────────────────────────────────────────────────────
// 상장주식 평가조서(갑·을) 입력 검증 — §63②3호·§63③ 분기
// Plan: docs/00-pm/listed-stock-besshi-form-replica.plan.md
// 정책: 자동 fallback 금지 ([[feedback_no_silent_apportion_fallback]])
// ────────────────────────────────────────────────────

export function validateListedStockBesshi(item: EstateItem): string | null {
  if (item.category !== "listed_stock") return null;

  // §63②3호 분기 활성 시 액면가·배당률·배당기산일 필수
  if (item.isCapitalIncreaseUnlistedShare) {
    if (!item.faceValuePerShare || item.faceValuePerShare <= 0) {
      return `자산 "${item.name}" §63②3호 — 1주당 액면가 입력 필요`;
    }
    if (item.priorDividendRate == null || item.priorDividendRate < 0) {
      return `자산 "${item.name}" §63②3호 — 직전기 배당률 입력 필요 (0 허용)`;
    }
    if (!item.dividendBaseDate && !item.dividendBaseDateSameAsListed) {
      return `자산 "${item.name}" §63②3호 — 배당기산일 또는 '상장일자 동일' 토글 필요`;
    }
  }

  // §63③ 최대주주 토글 시 기업규모 필수
  if (item.isMaxShareholder && !item.companySize) {
    return `자산 "${item.name}" §63③ — 기업 규모 (중소·중견·대기업) 입력 필요`;
  }

  // §53⑧2호 전부매각 — 선택 시 매매계약일 필수 (게이트 missing_input 차단).
  // isMaxShareholder 가드: 엔진(resolveListedPremiumRate)이 최대주주 아니면 2호를 읽지 않음 — 정합.
  // allSharesSold·meetsArticle49_1_1 미체크는 차단 아님(요건 불충족=할증 적용).
  if (
    item.isMaxShareholder &&
    item.premiumExclusionReason === "all_sold_within_6m" &&
    !item.section53_8_2?.saleContractDate
  ) {
    return `자산 "${item.name}" §53⑧2호 — 매매계약일 입력 필요`;
  }

  return null;
}

// ────────────────────────────────────────────────────
// 비상장주식 V2 평가 입력 검증 (Phase 5-A)
// Plan: docs/00-pm/inheritance-unlisted-stock-valuation-besshi-4-buppyo-3.plan.md
// KoreanLaw 검증 2026-05-22: §54④ 4호 삭제 / 조특법 §101 삭제
// ────────────────────────────────────────────────────


// ────────────────────────────────────────────────────
// CV-1·CV-3 동거주택 자산 유형 경고 (비차단)
// ────────────────────────────────────────────────────

/**
 * CV-1: isCohabitantHouse=true 자산에 cohabitHouseRightType 미선택 → 경고(차단 아님).
 * CV-3: cohabitHouseRightType ∈ {one_plus_one_right, sale_right} + 공제 금액 입력 → 경고.
 * 설계 §23의2 EN-3(B): fallback 없음, 미선택=경고·undefined → 엔진 적용(house 동일 처리).
 */
export function warnCohabitHouseRightType(
  estateItems: EstateItem[],
  cohabitHouseStdPrice: string | undefined,
  cohabitDirectAmount: string | undefined,
): string[] {
  const warnings: string[] = [];

  const cohabitItems = estateItems.filter((i) => i.isCohabitantHouse === true);
  for (const item of cohabitItems) {
    const rightType = item.cohabitHouseRightType;
    const name = item.name?.trim() || "동거주택 자산";

    // CV-1: 유형 미선택
    if (!rightType) {
      warnings.push(
        `"${name}"의 §23의2 자산 유형(일반주택·입주권·분양권)을 선택하지 않았습니다. ` +
          `미선택 시 일반주택(공제 적용)으로 계산됩니다.`,
      );
    }

    // CV-3: 미적용 유형인데 공제 금액 입력
    if (
      (rightType === "one_plus_one_right" || rightType === "sale_right") &&
      (Number(cohabitHouseStdPrice) > 0 || Number(cohabitDirectAmount) > 0)
    ) {
      warnings.push(
        `"${name}"은 §23의2 미적용 자산이므로 동거주택공제는 0으로 처리됩니다. ` +
          `공제 금액 입력란은 무시됩니다.`,
      );
    }
  }

  return warnings;
}
