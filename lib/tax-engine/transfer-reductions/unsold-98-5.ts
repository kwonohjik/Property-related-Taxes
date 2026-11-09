/**
 * P3 하이브리드 감면 — 조특법 §98의5 (2026-06-12)
 *
 * - §98의5: 2010.2.11 현재 수도권 밖 미분양 — ~2011.4.30 최초 매매계약. 감면율 = 분양가 인하율별
 *   (≤10% 60% / ≤20% 80% / >20% 100% — 법 ①각호). 위임령 = 조번호 어긋난 령 §98의4 (원문 확정).
 *   농특세 비과세.
 *
 * `unsold-hybrid-p3.ts`(747줄)에서 조문별로 분리 (동작 변경 없음 — 순수 이동). §98의5 상수·
 * `Unsold985Input`·`resolve985Rate`·`evaluateUnsold985`가 여기 있고, `unsold-hybrid-p3.ts`가 같은 이름으로 재수출한다.
 *
 * 공통 특칙 (법 §98의3④·§98의5③·§98의6③): 장특 표1(§95②단서 시 표2) + 세율 §104①1호 강제 —
 * suppressShortTermRate 주입 (transfer-tax.ts STEP 7). 중과 배제 = 소령 §167의3①5호.
 * 특칙 대상 ID 목록(RATE_SPECIAL_REDUCTION_IDS)과 통합 dispatcher(evaluateAnyHybridFromReduction ·
 * evaluateAnyHybridTaxAmount)는 `unsold-hybrid-p3.ts`에 남아 있다.
 */

import { TRANSFER_REDUCTION_ARTICLE } from "../legal-codes/transfer";
import { UNSOLD_98_5_DECREE } from "../legal-codes/transfer-house";
import { computeHybridEffect } from "./unsold-hybrid";
import { ineligibleHybrid } from "./unsold-hybrid";
import type { UnsoldHybridIneligibleReason } from "./unsold-hybrid";
import type { UnsoldHybridResult } from "./unsold-hybrid";
import { UNSOLD_98_5_CONTRACT_FROM } from "./unsold-98-period-gates";

// UTC 자정 파싱 (T suffix 금지)
export const UNSOLD_98_5_CONTRACT_TO = new Date("2011-04-30");
/** 시작 경계 — 법률 제10285호 부칙 제2조(2010.5.14. 이후 최초 계약). 상수 정본은 `unsold-98-period-gates.ts`(US-05·US-57) */
export { UNSOLD_98_5_CONTRACT_FROM };

// ─────────────────────────────────────────────────────────────────
// §98의5
// ─────────────────────────────────────────────────────────────────

export interface Unsold985Input {
  transferDate: Date;
  acquisitionDate: Date;
  /** 최초 매매계약일 (~2011.4.30 + 계약금) */
  contractDate?: Date;
  /**
   * 입주자 모집공고안에 공시된 분양가격(원) — 령 §98의4④ 산식의 분자·분모.
   * 공시 분양가·매매가 두 금액이 있으면 인하율은 엔진이 정수 교차곱으로 계산한다(반올림 없음).
   * 기준 공고(변경·재공고)·선납할인 포함 여부는 해석례 원문 미확인 — 확인 필요.
   */
  announcedPrice?: number;
  /** 매매계약서상의 매매가격(원) — 령 §98의4④ */
  contractPrice?: number;
  /**
   * [직접 API 호환] 분양가격 인하율(%) — 화면은 보내지 않는다. 두 금액이 하나라도 있으면 무시한다.
   * 0~100만 허용(매매가 ≥ 0이면 인하율은 100을 넘을 수 없다).
   */
  priceReductionRatePct?: number;
  /** 2010.2.11 현재 수도권 밖 미분양 확인 (령 §98의4①) */
  isNonCapitalUnsoldAtCutoff?: boolean;
  /** 사업주체등과 최초 매매계약 */
  isFirstContract?: boolean;
  /** 매매계약일 현재 입주사실 없음 (령②1호) */
  isNotOccupiedAtContract?: boolean;
  /** 해제 후 재계약·대체취득 아님 (령②2·3호) */
  isNotRecontract?: boolean;
  /** 거주자 또는 국내사업장 없는 비거주자(법 ① — US-42). false면 적용 주체 아님. 미제공은 true(D11-05와 같은 기본값) */
  isEligibleSubject?: boolean;
  transferIncome: number;
  standardPriceAtAcquisition?: number;
  standardPriceAt5Years?: number;
  standardPriceAtTransfer?: number;
}

/** 법 §98의5①각호 — 인하율별 감면율 (≤10% 60% / ≤20% 80% / >20% 100%) */
export function resolve985Rate(priceReductionRatePct: number): number {
  if (priceReductionRatePct <= 10) return 0.6;
  if (priceReductionRatePct <= 20) return 0.8;
  return 1.0;
}

/** 인하율 구간 문구 (법 §98의5①각호) */
function tierLabel985(rate: number): string {
  if (rate === 0.6) return "10% 이하";
  if (rate === 0.8) return "10% 초과 20% 이하";
  return "20% 초과";
}

/** 소수 6자리까지 절사한 % 문자열 (끝의 0 제거) — 반올림하면 10.0000004가 「10」으로 보여 구간과 어긋난다 */
function formatPct985(diff: bigint, announced: bigint): string {
  const scaled = (diff * 100_000_000n) / announced; // 10^-6 % 단위, 0 방향 절사
  const neg = scaled < 0n;
  const abs = neg ? -scaled : scaled;
  const int = abs / 1_000_000n;
  const frac = (abs % 1_000_000n).toString().padStart(6, "0").replace(/0+$/, "");
  return `${neg ? "-" : ""}${int}${frac ? "." + frac : ""}`;
}

export type Resolved985Reduction =
  | { kind: "missing"; reason: "announced_invalid" | "contract_invalid" | "rate_invalid" | "none" }
  | { kind: "negative" }
  | { kind: "over_100" }
  | { kind: "ok"; rate: number; label: string };

/**
 * 령 §98의4④ 「분양가격 인하율 = (공시된 분양가격 − 매매계약서상의 매매가격) ÷ 공시된 분양가격 × 100」로
 * 법 §98의5①각호 감면율을 정한다. 구간은 정수 교차곱으로 판정한다(부동소수·사용자 반올림 배제):
 * (공시 − 매매) × 10 ≤ 공시 → 60% / (공시 − 매매) × 5 ≤ 공시 → 80% / 그 밖 → 100%.
 * 매매가 > 공시 분양가(음수)는 정책 결정(Q-5, 2026-11-06)으로 감면율 0%(감면 없음) — `negative`.
 * 반대 근거: 법 §98의5①1호에 하한 문언이 없고, 부동산거래관리과-1295(2010.10.26)가 인하율 0에 60%를 적용했다.
 */
export function resolve985Reduction(input: {
  announcedPrice?: number;
  contractPrice?: number;
  priceReductionRatePct?: number;
}): Resolved985Reduction {
  const { announcedPrice: a, contractPrice: c, priceReductionRatePct: pct } = input;
  if (a !== undefined || c !== undefined) {
    if (a === undefined || !Number.isSafeInteger(a) || a <= 0) return { kind: "missing", reason: "announced_invalid" };
    if (c === undefined || !Number.isSafeInteger(c) || c < 0) return { kind: "missing", reason: "contract_invalid" };
    const A = BigInt(a);
    const diff = A - BigInt(c);
    if (diff < 0n) return { kind: "negative" };
    const rate = diff * 10n <= A ? 0.6 : diff * 5n <= A ? 0.8 : 1.0;
    return {
      kind: "ok",
      rate,
      label: `분양가격 인하율 = (입주자 모집공고안에 공시된 분양가격 ${a.toLocaleString()}원 − 매매계약서상의 매매가격 ${c.toLocaleString()}원) ÷ (공시된 분양가격) × 100 = ${formatPct985(diff, A)}% (${tierLabel985(rate)}) → 감면율 ${Math.round(rate * 100)}%`,
    };
  }
  if (pct === undefined) return { kind: "missing", reason: "none" };
  if (!Number.isFinite(pct)) return { kind: "missing", reason: "rate_invalid" };
  if (pct < 0) return { kind: "negative" };
  if (pct > 100) return { kind: "over_100" };
  const rate = resolve985Rate(pct);
  return { kind: "ok", rate, label: `분양가격 인하율 ${pct}% (${tierLabel985(rate)}) → 감면율 ${Math.round(rate * 100)}%` };
}

export function evaluateUnsold985(input: Unsold985Input): UnsoldHybridResult {
  const legalBasis = TRANSFER_REDUCTION_ARTICLE.UNSOLD_98_5;
  const reasons: UnsoldHybridIneligibleReason[] = [];
  if (input.isEligibleSubject === false) {
    reasons.push({
      code: "NOT_ELIGIBLE_SUBJECT",
      message: "국내사업장이 있는 비거주자는 적용되지 않습니다 — 적용 주체는 거주자 또는 「소득세법」 제120조에 따른 국내사업장이 없는 비거주자입니다 (법 §98의5①).",
      legalBasis,
    });
  }
  /**
   * D5-02 — 인하율 **0%도 감면 대상**이다(법 §98의5①1호 「100분의 10 이하」에 하한 문언 없음).
   * D2(US-58·US-59) — 인하율은 공시 분양가·매매가 두 금액으로 받아 `resolve985Reduction`이 계산한다.
   */
  const resolved = resolve985Reduction(input);
  const rate = resolved.kind === "ok" ? resolved.rate : 0.6;

  if (!input.contractDate) {
    reasons.push({
      code: "MISSING_CONTRACT_DATE",
      message: "최초 매매계약일이 입력되지 않았습니다 (2011.4.30까지 — 2010.2.11 현재 미분양 주택).",
      legalBasis,
    });
  } else if (
    input.contractDate.getTime() < UNSOLD_98_5_CONTRACT_FROM.getTime() ||
    input.contractDate.getTime() > UNSOLD_98_5_CONTRACT_TO.getTime()
  ) {
    reasons.push({
      code: "OUT_OF_CONTRACT_PERIOD",
      message: "최초 매매계약일이 적용기간(2010.5.14.~2011.4.30. 최초 계약 — 2010.2.11 현재 미분양) 외입니다 (법 §98의5①, 법률 제10285호 부칙 제2조).",
      legalBasis,
    });
  }
  if (resolved.kind === "missing") {
    reasons.push({
      code: "MISSING_PRICE_REDUCTION_RATE",
      message: "분양가격 인하율을 계산할 금액이 입력되지 않았습니다 — 입주자 모집공고안에 공시된 분양가격과 매매계약서상의 매매가격을 입력하세요 (분양가격 인하율 = (공시된 분양가격 − 매매계약서상의 매매가격) ÷ 공시된 분양가격 × 100, 조특령 §98의4④).",
      legalBasis: UNSOLD_98_5_DECREE.PRICE_REDUCTION_RATE,
    });
  } else if (resolved.kind === "negative") {
    // 정책 결정(Q-5, 2026-11-06): 매매가 > 공시 분양가(인하율 음수)는 감면율 0%(감면 없음)로 처리한다.
    // 법 §98의5①1호에 하한 문언이 없고 부동산거래관리과-1295가 인하율 0에 60%를 준 점은 반대 근거다(조문상 배제 규정은 없음).
    reasons.push({
      code: "NEGATIVE_PRICE_REDUCTION_RATE",
      message: "매매계약서상의 매매가격이 공시된 분양가격을 초과해 분양가격 인하율이 음수입니다 — 감면율 0%(감면 없음)로 처리합니다 (정책 결정: 법 §98의5①1호에 하한 문언은 없으나 부동산거래관리과-1295는 인하율 0에 60%를 적용 — 확인 필요).",
      legalBasis: UNSOLD_98_5_DECREE.PRICE_REDUCTION_RATE,
    });
  } else if (resolved.kind === "over_100") {
    reasons.push({
      code: "PRICE_REDUCTION_RATE_OVER_100",
      message: "분양가격 인하율은 100%를 넘을 수 없습니다 (매매계약서상의 매매가격이 0 이상이면 100% 이하).",
      legalBasis: UNSOLD_98_5_DECREE.PRICE_REDUCTION_RATE,
    });
  }
  if (input.transferDate.getTime() <= input.acquisitionDate.getTime()) {
    reasons.push({
      code: "TRANSFER_BEFORE_ACQUISITION",
      message: "미분양주택을 취득한 후에 양도하는 경우에만 적용됩니다 (법 §98의5①).",
      legalBasis,
    });
  }
  if (input.isNonCapitalUnsoldAtCutoff !== true) {
    reasons.push({
      code: "NOT_NONCAPITAL_UNSOLD",
      message: "2010.2.11 현재 수도권 밖의 지역에 있는 미분양주택(입주자 계약일 경과 단지 선착순 공급 등) 요건이 확인되지 않았습니다 (법 §98의5① · 령 §98의4①).",
      legalBasis: "조특령 §98의4①",
    });
  }
  if (input.isFirstContract !== true) {
    reasons.push({
      code: "NOT_FIRST_CONTRACT",
      message: "사업주체등과 최초로 매매계약을 체결하고 계약금을 납부한 요건이 확인되지 않았습니다 (법 §98의5①).",
      legalBasis,
    });
  }
  if (input.isNotOccupiedAtContract !== true) {
    reasons.push({
      code: "OCCUPIED_AT_CONTRACT",
      message: "매매계약일 현재 입주한 사실이 없는 주택임이 확인되지 않았습니다 (조특령 §98의4②1호).",
      legalBasis: "조특령 §98의4②1호",
    });
  }
  if (input.isNotRecontract !== true) {
    reasons.push({
      code: "RECONTRACT_EXCLUDED",
      message: "계약 해제 후 본인·배우자(직계존비속·형제자매 포함) 재계약 또는 대체취득 주택이 아님이 확인되지 않았습니다 (조특령 §98의4②2·3호).",
      legalBasis: "조특령 §98의4②2·3호",
    });
  }

  if (reasons.length > 0) return ineligibleHybrid("unsold_98_5", reasons, legalBasis, rate, true);

  return computeHybridEffect({
    id: "unsold_98_5",
    legalBasis,
    articleLabel: `조특법 §98의5① (${(resolved as Extract<Resolved985Reduction, { kind: "ok" }>).label})`,
    transferDate: input.transferDate,
    acquisitionDate: input.acquisitionDate,
    transferIncome: input.transferIncome,
    standardPriceAtAcquisition: input.standardPriceAtAcquisition,
    standardPriceAt5Years: input.standardPriceAt5Years,
    standardPriceAtTransfer: input.standardPriceAtTransfer,
    allocationLegalBasis: "조특령 §98의4③",
    rate,
    ruralSurtaxExempt: true, // 농특세령 §4⑦1호
  });
}
