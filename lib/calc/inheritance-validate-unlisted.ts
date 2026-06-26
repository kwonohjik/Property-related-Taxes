/**
 * 비상장주식 V2 평가 입력 검증 — inheritance-validate.ts에서 분리 (800줄 정책).
 * Zod 스키마(unlistedStockValuationV2Schema)와 동일 규칙 유지.
 */
import type { EstateItem } from "@/lib/tax-engine/types/inheritance-gift.types";
import { toOptionalDate } from "@/lib/api/date-coerce";

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

  // ③-1 자기주식 — 0 < shares < 발행주식총수 (Zod superRefine과 동일 규칙)
  if (v2.treasuryStock && (!v2.treasuryStock.shares || v2.treasuryStock.shares <= 0)) {
    return `비상장주식 "${item.name}" — 자기주식 보유 시 자기주식수를 1주 이상 입력해야 합니다.`;
  }
  if (v2.treasuryStock && v2.treasuryStock.shares >= v2.totalShares) {
    return `비상장주식 "${item.name}" — 자기주식수(${v2.treasuryStock.shares})는 발행주식총수(${v2.totalShares}) 미만이어야 합니다.`;
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

  // 합병 후 3년 미경과 순손익 합산 (§56③): mergerContext 입력 시 필수 필드 검증
  // 자동 안분 fallback 금지 — 미입력은 명확한 오류로 차단 (CLAUDE.md 정책)
  const mc = v2.mergerContext;
  if (mc) {
    const mergerRegDate = toOptionalDate(mc.mergerRegistrationDate);
    if (!mergerRegDate) {
      return `비상장주식 "${item.name}" — 합병등기일을 입력해야 합니다. (§56③)`;
    }
    if (effectiveEvaluationDate && mergerRegDate >= effectiveEvaluationDate) {
      return `비상장주식 "${item.name}" — 합병등기일은 평가기준일 이전이어야 합니다. (§56③)`;
    }
    if (!mc.postMergerShares || mc.postMergerShares <= 0) {
      return `비상장주식 "${item.name}" — 합병후 발행주식총수를 1주 이상 입력해야 합니다. (§56③)`;
    }
    for (let i = 0; i < 3; i++) {
      const yr = mc.acquirer[i];
      const startDate = toOptionalDate(yr.startDate);
      const endDate = toOptionalDate(yr.endDate);
      const label = ["전1년", "전2년", "전3년"][i];
      if (!startDate) {
        return `비상장주식 "${item.name}" — 합병법인 ${label} 사업연도 개시일을 입력해야 합니다.`;
      }
      if (!endDate) {
        return `비상장주식 "${item.name}" — 합병법인 ${label} 사업연도 종료일을 입력해야 합니다.`;
      }
      if (startDate > endDate) {
        return `비상장주식 "${item.name}" — 합병법인 ${label} 사업연도 개시일은 종료일 이전이어야 합니다.`;
      }
      if (!yr.shares || yr.shares <= 0) {
        return `비상장주식 "${item.name}" — 합병법인 ${label} 발행주식수를 1주 이상 입력해야 합니다.`;
      }
    }
    for (let i = 0; i < mc.targetFiscalYears.length; i++) {
      const yr = mc.targetFiscalYears[i];
      const startDate = toOptionalDate(yr.startDate);
      const endDate = toOptionalDate(yr.endDate);
      if (!startDate) {
        return `비상장주식 "${item.name}" — 피합병법인 #${i + 1} 사업연도 개시일을 입력해야 합니다.`;
      }
      if (!endDate) {
        return `비상장주식 "${item.name}" — 피합병법인 #${i + 1} 사업연도 종료일을 입력해야 합니다.`;
      }
      if (startDate > endDate) {
        return `비상장주식 "${item.name}" — 피합병법인 #${i + 1} 사업연도 개시일은 종료일 이전이어야 합니다.`;
      }
    }
  }

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
