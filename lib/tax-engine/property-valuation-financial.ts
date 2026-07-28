/**
 * 재산평가 — 현금·금융재산·가상자산 (상증법 §60·§63·§65, 시행령 §60)
 *
 * `property-valuation.ts`에서 분리(800줄 정책). **평가 로직 무변경 — 순수 이동**이다.
 *
 * 공개 API는 `property-valuation.ts`가 그대로 re-export한다 — 기존 import 경로는 유지된다
 * (memory `feedback_800line_split_export_preservation`).
 */

import { VALUATION } from "./legal-codes";
import { TaxCalculationError, TaxErrorCode } from "./tax-errors";
import { safeMultiply } from "./tax-utils";
import type {
  EstateItem,
  PropertyValuationResult,
  ValuationMethod,
  CalculationStep,
} from "./types/inheritance-gift.types";
import { computeCryptoUnitPrice } from "./property-valuation-crypto";

// ============================================================
// 현금 평가 (§60 — 시가 원칙: 현금 액면가 = 시가)
// §22 금융재산공제 대상 아님 (금융기관 취급 상품이 아님)
// ============================================================

export function evaluateCash(item: EstateItem): PropertyValuationResult {
  if (item.category !== "cash") {
    throw new TaxCalculationError(
      TaxErrorCode.INVALID_INPUT,
      "evaluateCash: 현금 자산이 아닙니다.",
    );
  }

  const amount = item.marketValue ?? 0;

  return {
    estateItemId: item.id,
    method: "market_value",
    valuatedAmount: amount,
    breakdown: [
      {
        label: "현금 (액면가)",
        amount,
        lawRef: VALUATION.PRINCIPLE,
        note: "현금은 액면가 = 시가 (§22 금융재산공제 대상 아님)",
      },
    ],
    warnings: amount <= 0 ? ["현금 금액이 0원 — 입력 확인 필요"] : [],
  };
}

// ============================================================
// 금융재산 평가 (§62·§63④ — 예금·채권·펀드)
// ============================================================

export function evaluateFinancial(item: EstateItem): PropertyValuationResult {
  if (item.category !== "financial") {
    throw new TaxCalculationError(
      TaxErrorCode.INVALID_INPUT,
      "evaluateFinancial: 금융재산 자산이 아닙니다.",
    );
  }

  const mode = item.savingsValuationMode ?? "balance";

  // ── 1순위: balance 모드 — 잔액·시가 (상증법 §62, 기본)
  if (mode === "balance") {
    const amount = item.marketValue ?? 0;
    return {
      estateItemId: item.id,
      method: "market_value",
      valuatedAmount: amount,
      breakdown: [
        {
          label: "금융재산 평가액 (잔액·시가)",
          amount,
          lawRef: VALUATION.PRINCIPLE,
        },
      ],
      warnings: amount <= 0 ? ["금융재산 금액이 0원 — 입력 확인 필요"] : [],
    };
  }

  // ── 2·3순위: auto·manual — §63④ 법정평가 (원금+미수이자−원천징수세액)
  // 엔진은 날짜 연산 미수행. auto 모드는 클라이언트가 injectSavingsAccrualIfAuto로 pre-inject 후 전달.
  const principal = item.savingsPrincipal ?? item.marketValue ?? 0;
  const accrued = item.savingsAccruedInterest ?? null;
  const wht = item.savingsWithholdingTax ?? null;

  // M-3: auto인데 클라이언트가 미주입 시 — 원금 fallback, method는 "deposit_statutory" 유지
  if (mode === "auto" && accrued == null) {
    return {
      estateItemId: item.id,
      method: "deposit_statutory",
      valuatedAmount: principal,
      breakdown: [
        {
          label: "예입원금 (미수이자 미산정·평가기준일 확인 필요)",
          amount: principal,
          lawRef: VALUATION.DEPOSIT,
        },
      ],
      warnings: ["미수이자 미주입 — 잔액으로 평가 (평가기준일 누락 가능)"],
    };
  }

  // 정상 auto(주입 완료) 또는 manual — ㉠+㉡-㉢
  const valuatedAmount = principal + (accrued ?? 0) - (wht ?? 0);
  return {
    estateItemId: item.id,
    method: "deposit_statutory",
    valuatedAmount,
    breakdown: [
      { label: "㉠ 예입금액", amount: principal, lawRef: VALUATION.DEPOSIT },
      { label: "㉡ 미수이자", amount: accrued ?? 0, lawRef: VALUATION.DEPOSIT },
      { label: "㉢ 원천징수세액", amount: -(wht ?? 0), lawRef: VALUATION.DEPOSIT },
    ],
    warnings: valuatedAmount <= 0 ? ["예금 평가액이 0원 이하 — 입력 확인"] : [],
  };
}

// re-export: 테스트·클라이언트는 property-valuation에서 import 가능
export { computeSavingsAccrual, injectSavingsAccrualIfAuto } from "./property-valuation-deposit";

// ============================================================
// 가상화폐(가상자산) 평가 (§65②·§60②)
// ============================================================

export function evaluateCryptoAsset(item: EstateItem): PropertyValuationResult {
  if (item.category !== "crypto_asset") {
    throw new TaxCalculationError(
      TaxErrorCode.INVALID_INPUT,
      "evaluateCryptoAsset: 가상자산이 아닙니다.",
    );
  }

  const qty = item.cryptoQuantity ?? 0;
  const mode = item.cryptoValuationMode ?? "direct";
  const isListed = item.cryptoIsListedProvider ?? true;

  // 1코인당 평가단가 도출 (timeseries: echo 우선, 미주입 시 배열 평균 산정 / direct: 단가 직접)
  let unitPrice: number;
  let method: ValuationMethod;
  let unitLabel: string;
  let unitLawRef: string;
  if (mode === "timeseries") {
    unitPrice =
      item.cryptoUnitPriceComputed ??
      computeCryptoUnitPrice(item.cryptoDailyPrices ?? []);
    // 1호(고시사업장) = §60②1호 법정평균 / 2호 = 합리적 가액(시가성)
    method = isListed ? "crypto_statutory" : "market_value";
    unitLabel = `거래일별 일평균가액의 평균액 (${item.cryptoDailyPrices?.length ?? 0}일)`;
    unitLawRef = isListed ? VALUATION.CRYPTO_LISTED : VALUATION.CRYPTO_OTHER;
  } else {
    unitPrice = item.cryptoUnitPrice ?? 0;
    method = "market_value";
    unitLabel = "1코인당 평가단가";
    unitLawRef = VALUATION.CRYPTO_OTHER;
  }

  // 평가액 = 단가(정수) × 수량(소수 8자리). 부동소수 곱 1원 절사오차·safeMultiply 소수부 소실 둘 다 회피:
  //   단가는 정수(computeCryptoUnitPrice=floor·direct=parseAmount), 수량을 satoshi(×1e8) 정수화 후 BigInt 분수연산.
  const unitInt = Math.trunc(unitPrice);
  const qtySatoshi = Math.round(qty * 1e8);
  const valuatedAmount = Number(
    (BigInt(unitInt) * BigInt(qtySatoshi)) / 100000000n,
  );

  return {
    estateItemId: item.id,
    method,
    valuatedAmount,
    breakdown: [
      { label: unitLabel, amount: unitPrice, lawRef: unitLawRef },
      {
        label: `1코인당 평가단가 × 보유수량 ${qty}`,
        amount: valuatedAmount,
        lawRef: unitLawRef,
      },
    ],
    warnings:
      valuatedAmount <= 0 ? ["가상자산 평가액이 0원 — 단가·수량 입력 확인"] : [],
  };
}

// re-export: 테스트·클라이언트 단일 import 소스
export { computeCryptoUnitPrice, injectCryptoUnitPriceIfTimeseries } from "./property-valuation-crypto";

