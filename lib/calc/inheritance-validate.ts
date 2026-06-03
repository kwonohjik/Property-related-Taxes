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
import { resolveEngineValuatedAmount } from "@/lib/tax-engine/property-valuation";
import { checkCorporateGiftRule } from "@/lib/calc/prior-gift-corporate-rule";
import { toOptionalDate } from "@/lib/api/date-coerce";

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
// 담보채무 §14 자동공제 검증 (B8, 설계 §3-5)
// ────────────────────────────────────────────────────

/**
 * 자산별 담보채무 opt-in 검증:
 *  - deductSecuredClaimAsDebt === true 인데 mortgageAmount + leaseDeposit === 0 → 오류
 */
export function validateCollateralDebtOptIn(item: EstateItem): string | null {
  if (item.deductSecuredClaimAsDebt !== true) return null;
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
  if (input.heirs.length === 0)
    return "상속인·수유자를 1명 이상 등록하세요. (협의분할·법정상속분 안분의 기준)";

  for (const item of input.estateItems) {
    const e = validateEstateItemAllocations(item);
    if (e) return e;
    // 가업상속공제 배타성·정합성 (2026-05-21, 상증법 §18의2)
    const fbe = validateFamilyBusinessEstateItem(item, input.deductionInput?.familyBusiness);
    if (fbe) return fbe;
    // 담보채무 §14 자동공제 opt-in 검증 (B8, 설계 §3-5)
    const cde = validateCollateralDebtOptIn(item);
    if (cde) return cde;
  }
  // 가업상속공제 요건 날짜 정합성 (Phase 1, 2026-06-02)
  const fbDateErr = validateFamilyBusinessDates(
    input.deductionInput?.familyBusiness,
    input.deathDate,
  );
  if (fbDateErr) return fbDateErr;
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

  return null;
}

// ────────────────────────────────────────────────────
// 비상장주식 V2 평가 입력 검증 (Phase 5-A)
// Plan: docs/00-pm/inheritance-unlisted-stock-valuation-besshi-4-buppyo-3.plan.md
// KoreanLaw 검증 2026-05-22: §54④ 4호 삭제 / 조특법 §101 삭제
// ────────────────────────────────────────────────────

/**
 * 비상장주식 V2 평가 입력 검증
 *
 * Zod 스키마(`unlistedStockValuationV2Schema`)와 동일 fallback·규칙 유지 (정합성 강제).
 * UI 통과 ↔ validate 차단 모순 금지.
 *
 * 검증 항목:
 *   1) V2·legacy 둘 중 하나 필수 (Zod superRefine와 동일)
 *   2) 사업연도 종료일 3개 각각 유효 Date 필수 (순서 비교 전 존재 확인)
 *   3) 사업연도 종료일 순서 (1년전 > 2년전 > 3년전)
 *   4) 소유주식수 ≤ 발행주식총수
 *   5) 평가기준일 ≥ 사업개시일
 *   6) 자본금 변동: 변동일 유효 Date 필수 / 주식수 > 0 필수 / 변동일 ≤ 평가기준일
 *   7) 유상증자(paid_in) — 1주당 납입금액 > 0 필수 (§56⑤)
 *   8) 유상감자(capital_reduction) — 1주당 지급금액 > 0 필수 (§56⑤ 준용)
 *   9) 무상증자(free_issue) — 주식수·변동일 필수, pricePerShare 검증 제외
 *
 * @param ctx.evaluationDateFallback — 상속개시일/증여일 (YYYY-MM-DD).
 *   evaluationDate 미입력 시 이 값으로 대체해 비교.
 *   UI display fallback과 동일 fallback 인식 — CLAUDE.md ⑧ 정책.
 */
export function validateUnlistedStockV2(
  item: EstateItem,
  ctx?: { evaluationDateFallback?: string },
): string | null {
  if (item.category !== "unlisted_stock") return null;

  // V1·V2 둘 중 하나 필수
  if (!item.unlistedStockData && !item.unlistedStockValuationV2) {
    return `비상장주식 "${item.name}" — legacy 입력 또는 V2 입력 중 하나는 필수입니다.`;
  }

  // V2 입력이 없으면 추가 검증 없음 (legacy 검증은 기존 Zod 의존)
  const v2 = item.unlistedStockValuationV2;
  if (!v2) return null;

  // evaluationDate fallback — 미입력 시 ctx.evaluationDateFallback(상속개시일/증여일) 사용
  // UI display fallback과 동일 fallback 인식: CLAUDE.md ⑧ 정책
  // toOptionalDate: string ISO → Date 정규화 (sessionStorage 복원 후 string 안전 처리, H-5)
  let effectiveEvaluationDate: Date | undefined = toOptionalDate(v2.evaluationDate);
  if (!effectiveEvaluationDate && ctx?.evaluationDateFallback) {
    effectiveEvaluationDate = toOptionalDate(ctx.evaluationDateFallback);
  }

  // ① 사업연도 종료일 3개 각각 유효 Date 필수 (순서 비교 전 존재 확인)
  // toOptionalDate: instanceof Date 대신 사용 — sessionStorage 복원 후 string ISO도 안전 처리 (H-5 2차 방어)
  const YEAR_LABEL = ["1년전", "2년전", "3년전"];
  const resolvedFiscalEndDates: Date[] = [];
  for (let i = 0; i < 3; i++) {
    const endDate = toOptionalDate(v2.fiscalYears[i]?.fiscalYearEndDate);
    if (!endDate) {
      return `비상장주식 "${item.name}" — ${YEAR_LABEL[i]} 사업연도 종료일을 입력해야 합니다. (§56⑤·환산주식수 계산에 필요)`;
    }
    resolvedFiscalEndDates.push(endDate);
  }

  // ② 사업연도 종료일 순서 (resolvedFiscalEndDates 사용 — Date 객체 보장)
  if (resolvedFiscalEndDates[0] <= resolvedFiscalEndDates[1]) {
    return `비상장주식 "${item.name}" — 2년전 사업연도 종료일은 1년전보다 이전이어야 합니다.`;
  }
  if (resolvedFiscalEndDates[1] <= resolvedFiscalEndDates[2]) {
    return `비상장주식 "${item.name}" — 3년전 사업연도 종료일은 2년전보다 이전이어야 합니다.`;
  }

  // ③ 소유주식수 > 발행주식총수
  if (v2.ownedShares > v2.totalShares) {
    return `비상장주식 "${item.name}" — 보유주식수(${v2.ownedShares})는 발행주식총수(${v2.totalShares})를 초과할 수 없습니다.`;
  }

  // ④ 평가기준일 < 사업개시일 (effectiveEvaluationDate: v2.evaluationDate || ctx fallback)
  // toOptionalDate: string ISO → Date 정규화 (H-5 2차 방어)
  const effectiveBusinessStartDate = toOptionalDate(v2.businessStartDate);
  if (effectiveEvaluationDate && effectiveBusinessStartDate && effectiveEvaluationDate < effectiveBusinessStartDate) {
    return `비상장주식 "${item.name}" — 평가기준일은 사업개시일 이후여야 합니다.`;
  }

  // ⑤ 자본금 변동 — 변동일·주식수·1주당 금액 검증
  for (let i = 0; i < v2.capitalChanges.length; i++) {
    const c = v2.capitalChanges[i];
    const typeLabel =
      c.changeType === "paid_in" ? "유상증자" :
      c.changeType === "free_issue" ? "무상증자" : "유상감자";

    // 변동일 미입력/invalid 차단
    // toOptionalDate: string ISO → Date 정규화 (H-5 2차 방어 — instanceof Date 대체)
    const resolvedChangeDate = toOptionalDate(c.changeDate);
    if (!resolvedChangeDate) {
      return `비상장주식 "${item.name}" — ${typeLabel}(${i + 1}번째) 변동일을 입력해야 합니다.`;
    }

    // 주식수 필수 (무상증자 포함)
    if (!c.sharesIssued || c.sharesIssued <= 0) {
      return `비상장주식 "${item.name}" — ${typeLabel}(${i + 1}번째) 주식수를 1 이상 입력해야 합니다.`;
    }

    // 변동일 > 평가기준일 차단 (effectiveEvaluationDate 사용)
    if (effectiveEvaluationDate && resolvedChangeDate > effectiveEvaluationDate) {
      return `비상장주식 "${item.name}" — 자본금 변동일(${i + 1}번째)은 평가기준일 이전이어야 합니다.`;
    }

    // 유상증자 — 1주당 납입금액 필수 (§56⑤)
    if (c.changeType === "paid_in" && (!c.pricePerShare || c.pricePerShare <= 0)) {
      return `비상장주식 "${item.name}" — 유상증자(${i + 1}번째)는 1주당 납입금액을 입력해야 합니다. (§56⑤)`;
    }
    // 유상감자 — 1주당 지급금액 필수 (§56⑤ 준용)
    if (c.changeType === "capital_reduction" && (!c.pricePerShare || c.pricePerShare <= 0)) {
      return `비상장주식 "${item.name}" — 유상감자(${i + 1}번째)는 1주당 지급금액을 입력해야 합니다. (§56⑤)`;
    }
  }

  // PR-E (UI 통합 v3): §22② 자동 모드 시 보유·발행 주식 수 필수 (사실상 기존 ownedShares/totalShares 검증)
  // 별도 추가 검증 없음 — ownedShares>0 / totalShares>0 보장은 Zod에서 처리.

  // PR-N (UI 통합 v3): 평가차액 행 단위 입력 시 각 행 accountName 필수 (silent omission 차단)
  const deltaRows = v2.netAssetValueRaw.evaluationDeltaRows;
  if (deltaRows && deltaRows.length > 0) {
    for (let i = 0; i < deltaRows.length; i++) {
      const row = deltaRows[i];
      if (!row.accountName || !row.accountName.trim()) {
        return `비상장주식 "${item.name}" — 평가차액 ${row.category === "asset" ? "자산" : "부채"} ${i + 1}번째 행의 계정과목이 비어 있습니다.`;
      }
    }
    // 행 수 max 제한 (Zod와 정합)
    const assetCount = deltaRows.filter((r) => r.category === "asset").length;
    const liabilityCount = deltaRows.filter((r) => r.category === "liability").length;
    if (assetCount > 50) {
      return `비상장주식 "${item.name}" — 자산 평가차액 행은 50개를 초과할 수 없습니다.`;
    }
    if (liabilityCount > 30) {
      return `비상장주식 "${item.name}" — 부채 평가차액 행은 30개를 초과할 수 없습니다.`;
    }
  }

  return null;
}
