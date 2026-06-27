/**
 * 채권가액 평가 (상증령 §58②·상증칙 §18의2②·§18의3)
 *   기타채권(회수기간 5년 이내): 원본 + 평가기준일까지 미수이자상당액
 *   장기·변경채권(5년 초과·회사정리 등): Σ 회수금액(원본+이자) ÷ (1+적정할인율)ⁿ, round-half-up
 *   회수불가능(§58② 단서): 산입 제외
 *
 * property-valuation.ts에서 분리 (800줄 정책). evaluateEstateItem dispatch가 evaluateReceivable 호출.
 */

import { differenceInYears, parseISO } from "date-fns";
import { VALUATION } from "./legal-codes";
import { TaxCalculationError, TaxErrorCode } from "./tax-errors";
import { resolveReceivableDiscountRate } from "./data/gift-deemed-rates";
import type {
  EstateItem,
  PropertyValuationResult,
  CalculationStep,
  ReceivableInstallment,
} from "./types/inheritance-gift.types";

/** Date|string → Date 정규화 (JSON 경유 string 대응, new Date 직접호출 금지) */
function asDate(v: Date | string): Date {
  return v instanceof Date ? v : parseISO(v);
}

/**
 * 회수기간(년) — 스케줄 최종 회수일 − 평가기준일. UI 임계안내·엔진 공용 단일 export(dual-truth 금지).
 * differenceInYears(date-fns): 정수 연수(1년 미만 버림).
 * ⚠️ 비정수 잔여월 처리: 상증칙 §18의2②1호는 "각 연도에 회수할 금액을 현재가치 할인"만 규정,
 * 연수 산정 방식(절상/절사/실수) 명문 없음(KoreanLaw 검증 2026-06-27). 교재 anchor는 정수년만 — floor(버림) 잠정.
 */
export function resolveReceivableRecoveryYears(
  schedule: ReceivableInstallment[],
  valuationDate: Date,
): number {
  let max = 0;
  for (const s of schedule) {
    const n = differenceInYears(asDate(s.recoverDate), valuationDate);
    if (n > max) max = n;
  }
  return max;
}

/**
 * 현가 round-half-up — amount × baseⁿ / stepⁿ (BigInt, 부동소수 금지).
 * 8% → (1+r)=1080/1000 → base=1000, step=1080. 교재 정리채권 anchor는 floor가 아닌 round로 일치.
 * (상증칙 §18의2②1가목 현가환산. trustIncomePV는 floor — 채권은 round, 메모리 bigint-round-half-up)
 */
export function receivablePV(amount: number, base: number, step: number, n: number): number {
  if (amount <= 0) return 0;
  const num = BigInt(Math.round(amount)) * BigInt(base) ** BigInt(n);
  const den = BigInt(step) ** BigInt(n);
  const q = num / den;
  const r = num - q * den;
  return Number(r * 2n >= den ? q + 1n : q); // round-half-up
}

/**
 * 채권가액 평가 (§58②). simple(원본+미수이자) / discounted(연도별 현가할인) 분기.
 * 평가기준일은 lib/calc에서 receivableValuationDate로 주입(엔진 dispatch가 평가기준일 미수신).
 */
export function evaluateReceivable(item: EstateItem): PropertyValuationResult {
  if (item.category !== "receivable") {
    throw new TaxCalculationError(
      TaxErrorCode.INVALID_INPUT,
      "evaluateReceivable: 채권 자산이 아닙니다.",
    );
  }

  const mode = item.receivableMode ?? "simple";

  // ── discounted: 장기·변경채권 현가할인 ──
  if (mode === "discounted") {
    const schedule = item.receivableSchedule ?? [];
    const rate =
      item.receivableDiscountRateOverride ??
      (item.receivableValuationDate
        ? resolveReceivableDiscountRate(
            asDate(item.receivableValuationDate).toISOString().slice(0, 10),
          )
        : { numer: 80, denom: 1000 }); // 평가기준일 미주입 시 현행 8% (UI는 항상 주입)
    const base = rate.denom; // (1+r) 분모 = 1000
    const step = rate.denom + rate.numer; // (1+r) 분자 = 1080
    const valDate = item.receivableValuationDate
      ? asDate(item.receivableValuationDate)
      : null;

    const lines: CalculationStep[] = [];
    let total = 0;
    for (const s of schedule) {
      const n = valDate ? differenceInYears(asDate(s.recoverDate), valDate) : 0;
      const pv = receivablePV(s.amount, base, step, n);
      total += pv;
      const ratePct = (rate.numer * 100) / rate.denom;
      lines.push({
        label: `${asDate(s.recoverDate).toISOString().slice(0, 10)} 회수 ${s.amount.toLocaleString()} ÷ (1+${ratePct}%)^${n}`,
        amount: pv,
        lawRef: VALUATION.RECEIVABLE_DISCOUNT,
      });
    }
    return {
      estateItemId: item.id,
      method: "standard_price",
      valuatedAmount: total,
      breakdown: [
        ...lines,
        { label: "현재가치 합계 (각 연도 회수금액 할인)", amount: total, lawRef: VALUATION.RECEIVABLE_DISCOUNT },
      ],
      warnings: [
        "장기·변경 채권 현가할인 — 회수불가능분은 회수금액에서 미리 차감해 입력하세요.",
      ],
    };
  }

  // ── simple: 기타채권 원본 + 미수이자상당액 ──
  const principal = Math.max(0, item.receivablePrincipal ?? 0);
  const uncollectible = Math.max(0, item.receivableUncollectible ?? 0);
  const usablePrincipal = Math.max(0, principal - uncollectible); // §58② 단서
  const interest = Math.max(0, item.receivableAccruedInterest ?? 0);
  const valuatedAmount = usablePrincipal + interest;

  const breakdown: CalculationStep[] = [
    { label: "원본(원금) 가액", amount: principal, lawRef: VALUATION.RECEIVABLE },
  ];
  if (uncollectible > 0) {
    breakdown.push({ label: "(−) 회수불가능 차감 (§58② 단서)", amount: -uncollectible, lawRef: VALUATION.RECEIVABLE });
  }
  if (interest > 0) {
    breakdown.push({ label: "(+) 평가기준일까지 미수이자상당액", amount: interest, lawRef: VALUATION.RECEIVABLE });
  }
  breakdown.push({ label: "채권 평가액", amount: valuatedAmount, lawRef: VALUATION.RECEIVABLE });

  return {
    estateItemId: item.id,
    method: "standard_price",
    valuatedAmount,
    warnings:
      uncollectible >= principal && principal > 0
        ? ["전액 회수불가능으로 평가 — 회수불가능 사유·근거 확인 권장"]
        : [],
    breakdown,
  };
}
