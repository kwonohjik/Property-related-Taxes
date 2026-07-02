/**
 * 전환사채 등의 평가 (상증법 §63①2호·상증령 §58의2)
 *   A. 거래소 거래: §58①1호 준용 — Max(2개월 종가평균, 최근일 최종시세) / 실적無 매입가+미수이자 or 처분예상
 *   B. 비거래소: §58의2②
 *     - 전환불가: 신주인수권증권 = Max(0, PV(R)−PV(r)) / 그 외 = PV(min(R,r)) + 발생이자
 *     - 전환가능: 전환사채 = Max(1호나, 전환주식가액−배당차액)
 *                신주인수권부사채 = Max(a, a−b+c)
 *                신주인수권증권 = Max(b, 인수주식가액−배당차액−신주인수가액)
 *                신주인수권증서 = 권리락전가액−배당차액−신주인수가액 (상장단서) / 거래소=종가평균
 *
 * PV(R) = 발행가액(cbPrincipal). R은 발행수익률(par=표시이자율, 할증=유효이자율)이라 PV(R)=발행가액(직접계산 금지).
 * PV(r) = receivablePV round-half-up. 배당차액·발생이자 = floor. 적정할인율 = receivable 시대표 재사용.
 * property-valuation.ts에서 분리 (800줄 정책). evaluateEstateItem dispatch가 호출.
 * 설계: docs/02-design/features/inheritance-gift-cb-valuation.engine.design.md
 */

import { differenceInDays, parseISO, format } from "date-fns";
import { VALUATION } from "./legal-codes";
import { TaxCalculationError, TaxErrorCode } from "./tax-errors";
import { resolveReceivableDiscountRate } from "./data/gift-deemed-rates";
import { receivablePV } from "./property-valuation-receivable";
import type {
  EstateItem,
  PropertyValuationResult,
  CalculationStep,
} from "./types/inheritance-gift.types";

/** Date|string → Date 정규화 (JSON 경유 string 대응, new Date 직접호출 금지) */
function asDate(v: Date | string): Date {
  return v instanceof Date ? v : parseISO(v);
}

/** 발행가액 현금흐름 PV(적정할인율 r) — 이자(연금) + (원금+상환할증) 단일항, round-half-up */
function pvBond(
  maturityAmt: number,
  principal: number,
  couponRatePercent: number,
  rate: { numer: number; denom: number },
  n: number,
): number {
  const base = rate.denom; // (1+r) 분모
  const step = rate.denom + rate.numer; // (1+r) 분자
  const couponAmt = Math.floor((principal * couponRatePercent) / 100);
  let sum = 0;
  for (let t = 1; t <= n; t++) {
    sum += receivablePV(couponAmt, base, step, t);
  }
  sum += receivablePV(maturityAmt, base, step, n);
  return sum;
}

/** BigInt floor(∏parts / div) — 2^53 초과 안전 (대형주 주식수×액면×일수 등). 양수 BigInt 나눗셈=floor */
function floorMulDiv(parts: number[], div: number): number {
  let num = 1n;
  for (const p of parts) num *= BigInt(Math.round(p));
  return Number(num / BigInt(div));
}

/** 평가기준일까지 발생이자상당액 — floor(원금 × 이자율 × 일수/365), 직전 이자지급일 기준 */
function deriveAccruedInterest(item: EstateItem, valDate: Date): number {
  if (item.cbAccruedInterestOverride !== undefined) {
    return Math.max(0, item.cbAccruedInterestOverride);
  }
  if (!item.cbInterestBaseDate || !item.cbPrincipal || !item.cbCouponRate) return 0;
  const days = differenceInDays(valDate, asDate(item.cbInterestBaseDate));
  if (days <= 0) return 0;
  // 율%는 소수(2.5·1.75 등) — floorMulDiv 내부 정수화(round)로 통째 반올림되지 않도록 1e4 스케일로 소수부 보존
  return floorMulDiv([item.cbPrincipal, item.cbCouponRate * 10_000, days], 100 * 10_000 * 365);
}

/** 배당차액 §57③ — floor(1주당액면 × 배당률 × 주식수 × 일수/365), 사업연도개시~배당기산일 전일 */
function computeDividendDifference(item: EstateItem): number {
  if (item.cbDividendDifferenceOverride !== undefined) {
    return Math.max(0, item.cbDividendDifferenceOverride);
  }
  const face = item.cbFaceValuePerShare ?? 0;
  const rate = item.cbPriorDividendRate ?? 0;
  const shares = item.cbShareCount ?? 0;
  if (face <= 0 || rate <= 0 || shares <= 0 || !item.cbDividendBaseDate) return 0;
  // 사업연도개시일 = 배당기산일이 속한 회계연도 1.1 (배당기산일 연도 기준)
  const dividendBase = asDate(item.cbDividendBaseDate);
  const fyStart = parseISO(`${dividendBase.getFullYear()}-01-01`);
  const days = differenceInDays(dividendBase, fyStart);
  if (days <= 0) return 0;
  // 배당률%는 소수 — 1e4 스케일로 floorMulDiv 내부 반올림에 의한 소수부 소실 방지
  return floorMulDiv([face, rate * 10_000, shares, days], 100 * 10_000 * 365);
}

/**
 * 전환사채등 평가 (§58의2). 평가기준일은 lib/calc에서 cbValuationDate로 주입.
 */
export function evaluateConvertibleBond(item: EstateItem): PropertyValuationResult {
  if (item.category !== "convertible_bond") {
    throw new TaxCalculationError(
      TaxErrorCode.INVALID_INPUT,
      "evaluateConvertibleBond: 전환사채등 자산이 아닙니다.",
    );
  }

  const securityType = item.cbSecurityType ?? "convertible_bond";
  const valDate = item.cbValuationDate ? asDate(item.cbValuationDate) : null;
  const warnings: string[] = [];

  // ── A. 거래소 거래 (신주인수권증서 라목은 라목1 경로 우선 → A skip) ──
  if (item.cbTradedOnExchange && securityType !== "preemptive_right") {
    if (item.cbHasTradeRecord) {
      const avg = item.cbExchange2mAvg ?? 0;
      const latest = item.cbExchangeLatestPrice ?? 0;
      const v = Math.max(avg, latest);
      return {
        estateItemId: item.id,
        method: "standard_price",
        valuatedAmount: v,
        breakdown: [
          { label: "평가기준일 이전 2개월 종가평균", amount: avg, lawRef: VALUATION.CB_VALUATION },
          { label: "평가기준일 이전 최근일 최종시세", amount: latest, lawRef: VALUATION.CB_VALUATION },
          { label: "전환사채등 평가액 (큰 가액)", amount: v, lawRef: VALUATION.CB_VALUATION },
        ],
        warnings,
      };
    }
    const v =
      item.cbExchangeSubMode === "disposal"
        ? item.cbDisposalExpected ?? 0
        : (item.cbPurchasePrice ?? 0) + (item.cbAccruedInterestToBase ?? 0);
    return {
      estateItemId: item.id,
      method: "standard_price",
      valuatedAmount: v,
      breakdown: [
        {
          label:
            item.cbExchangeSubMode === "disposal"
              ? "처분예상금액 (§58①2호나)"
              : "매입가액 + 미수이자상당액 (§58①2호가)",
          amount: v,
          lawRef: VALUATION.CB_VALUATION,
        },
      ],
      warnings,
    };
  }

  // ── B. 비거래소 (§58의2②) ──
  const rFrac = resolveReceivableDiscountRate(
    valDate ? format(valDate, "yyyy-MM-dd") : "2999-12-31",
  );
  const rPercent = (rFrac.numer * 100) / rFrac.denom;
  const issuePrice = Math.max(0, item.cbPrincipal ?? 0); // 발행가액(par) = PV(R)
  const maturityAmt = issuePrice + Math.max(0, item.cbRedemptionPremium ?? 0);
  const R = item.cbHasRedemptionPremium ? item.cbIssueRate ?? 0 : item.cbCouponRate ?? 0;
  const n = Math.floor(item.cbMaturityYears ?? 0); // 비정수 만기 → BigInt RangeError 방지
  const couponRate = item.cbCouponRate ?? 0;
  const subscription = item.cbSubscriptionPrice ?? 0;
  const div = computeDividendDifference(item); // 배당기산일 자체로 일수 산정 (valDate 불요)

  if (!valDate) warnings.push("평가기준일 미주입 — 적정할인율·발생이자 산정 불가(현행율 적용).");

  const lawRef = VALUATION.CB_VALUATION;
  const finish = (v: number, steps: CalculationStep[]): PropertyValuationResult => ({
    estateItemId: item.id,
    method: "standard_price",
    valuatedAmount: v,
    breakdown: steps,
    warnings,
  });

  // ── 신주인수권증서(라목) — 전환 개념 없음, 항상 §58의2②2호라목 ──
  if (securityType === "preemptive_right") {
    if (item.cbTradedOnExchange) {
      const v = item.cbExchange2mAvg ?? 0;
      return finish(v, [
        { label: "신주인수권증서 평가액 (라목1, 전체거래일 종가평균)", amount: v, lawRef },
      ]);
    }
    const prior = item.cbExRightsPriorPrice ?? 0;
    // 라목2 상장단서: 권리락후 < 권리락전−배당차액 → 권리락후 − 신주인수가액
    if (item.cbExRightsPostPrice !== undefined && item.cbExRightsPostPrice < prior - div) {
      const v = Math.max(0, item.cbExRightsPostPrice - subscription);
      return finish(v, [
        { label: "권리락 후 주식가액", amount: item.cbExRightsPostPrice, lawRef },
        { label: "(−) 신주인수가액", amount: -subscription, lawRef },
        { label: "신주인수권증서 평가액 (라목2 상장단서, 음수→0)", amount: v, lawRef },
      ]);
    }
    const v = Math.max(0, prior - div - subscription);
    return finish(v, [
      { label: "권리락 전 주식가액", amount: prior, lawRef },
      { label: "(−) 배당차액", amount: -div, lawRef: VALUATION.CB_DIVIDEND_DIFF },
      { label: "(−) 신주인수가액", amount: -subscription, lawRef },
      { label: "신주인수권증서 평가액 (라목2, 음수→0)", amount: v, lawRef },
    ]);
  }

  const pvR = pvBond(maturityAmt, issuePrice, couponRate, rFrac, n); // PV(적정할인율)
  const accrued = valDate ? deriveAccruedInterest(item, valDate) : 0;
  // 1호나목: 발행일가치(min(R,r)=R→발행가액 / min=r→PV_r) + 발생이자
  const base1b = (rPercent >= R ? issuePrice : pvR) + accrued;
  // 1호가목 신주인수권증권: Max(0, PV(R)−PV(r)) = 발행가액 − PV_r
  const warrant1a = Math.max(0, issuePrice - pvR);

  // ── 전환 불가능 기간 (1호) ──
  if (!item.cbConvertible) {
    if (securityType === "warrant_certificate") {
      return finish(warrant1a, [
        { label: "발행가액 (PV at 사채발행이율)", amount: issuePrice, lawRef },
        { label: "(−) PV at 적정할인율", amount: -pvR, lawRef },
        { label: "신주인수권증권 평가액 (1호가목, 음수→0)", amount: warrant1a, lawRef },
      ]);
    }
    return finish(base1b, [
      { label: "발행일 현재가치", amount: rPercent >= R ? issuePrice : pvR, lawRef },
      { label: "(+) 평가기준일까지 발생이자상당액", amount: accrued, lawRef },
      { label: "전환사채등 평가액 (1호나목)", amount: base1b, lawRef },
    ]);
  }

  // ── 전환 가능 기간 (2호) — 전환사채·신주인수권부사채·신주인수권증권 ──
  const shareValue = item.cbConvertibleShareValue ?? 0;
  switch (securityType) {
    case "convertible_bond": {
      const alt = shareValue - div;
      const v = Math.max(base1b, alt);
      return finish(v, [
        { label: "전환사채 평가액 (1호나목)", amount: base1b, lawRef },
        { label: "전환가능 주식가액 − 배당차액", amount: alt, lawRef: VALUATION.CB_DIVIDEND_DIFF },
        { label: "전환사채 평가액 (2호가목, 큰 가액)", amount: v, lawRef },
      ]);
    }
    case "warrant_certificate": {
      const alt = shareValue - div - subscription;
      const v = Math.max(warrant1a, alt);
      return finish(v, [
        { label: "신주인수권증권 평가액 (1호가목)", amount: warrant1a, lawRef },
        { label: "인수가능 주식가액 − 배당차액 − 신주인수가액", amount: alt, lawRef: VALUATION.CB_DIVIDEND_DIFF },
        { label: "신주인수권증권 평가액 (2호다목, 큰 가액)", amount: v, lawRef },
      ]);
    }
    case "bond_with_warrant": {
      const a = base1b;
      const b = warrant1a;
      const c = Math.max(b, shareValue - div - subscription);
      const v = Math.max(a, a - b + c);
      return finish(v, [
        { label: "전환금지 신주인수권부사채 평가액 a (1호나목)", amount: a, lawRef },
        { label: "전환금지 신주인수권증권 평가액 b (1호가목)", amount: b, lawRef },
        { label: "전환가능 신주인수권증권 평가액 c (2호다목)", amount: c, lawRef },
        { label: "신주인수권부사채 평가액 (2호나목, Max(a, a−b+c))", amount: v, lawRef },
      ]);
    }
    default:
      throw new TaxCalculationError(
        TaxErrorCode.INVALID_INPUT,
        `evaluateConvertibleBond: 지원하지 않는 증권 종류(${securityType}).`,
      );
  }
}
