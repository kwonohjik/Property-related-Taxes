/**
 * 환산주식수 산정 (별지 부표3 6쪽 바. 산출) — §17의3⑤ 충실 재구현
 *
 * 법령: 상증령 §56③ 단서 + 상증규 §17의3⑤ (KoreanLaw 검증 2026-05-22·2026-05-25)
 *
 * §56③ 본문: "각 사업연도의 주식수는 각 사업연도 종료일 현재의 발행주식총수에 의한다."
 * §56③ 단서: "다만, 평가기준일이 속하는 사업연도 이전 3년 이내에 증자 또는 감자를 한
 *            사실이 있는 경우에는 증자 또는 감자전의 각 사업연도 종료일 현재의 발행주식총수는
 *            재정경제부령으로 정하는 바에 따른다." → §17의3⑤
 *
 * §17의3⑤ 환산식:
 *   1호 증자: 환산주식수 = 증자 전 각 사업연도말 주식수
 *           × (증자 직전 사업연도말 주식수 + 증자 주식수) / 증자 직전 사업연도말 주식수
 *   2호 감자: 환산주식수 = 감자 전 각 사업연도말 주식수
 *           × (감자 직전 사업연도말 주식수 − 감자 주식수) / 감자 직전 사업연도말 주식수
 *
 * 구현 특성 (계획서 §0 telescoping 항등식):
 *   - 평가기간(3년) 내 모든 증자·감자가 입력되면(체인 완결) 3개 연도 환산주식수는
 *     항상 평가기준일 발행주식총수(totalShares)로 수렴. 본 함수는 그 일반해를
 *     연도별 누적 환산으로 충실히 산출(no-op 단순화 제거).
 *   - 윈도우(3년) 밖 변동은 §56③ 단서에 따라 환산 제외 + 경고.
 *   - 입력 모순(prior ≤ 0 등)은 자동 보정 없이 actual 유지 + 경고 (throw 금지).
 *
 * Plan: docs/00-pm/inheritance-unlisted-stock-share-conversion-robustness.plan.md
 * Design: docs/02-design/features/inheritance-unlisted-stock-share-conversion.engine.design.md
 *
 * ─────────────────────────────────────────────────────────────────────
 * PR-I 단주 처리 정책 (KoreanLaw MCP 검증 2026-05-24)
 *   상증법령에 1주 미만 단주 처리 명시 규정 없음 → 우리 엔진 일관 정책 Math.floor 절사
 *   (safeMultiplyThenDivide 가 내부적으로 floor). 상법 단위주 원칙과 정합.
 * ─────────────────────────────────────────────────────────────────────
 */

import { safeMultiplyThenDivide } from "@/lib/tax-engine/tax-utils";
import type { UnlistedCapitalChange } from "@/lib/tax-engine/types/unlisted-stock-valuation.types";

/** 증자(paid_in·free_issue) +sharesIssued / 감자(capital_reduction·free_reduction) −sharesIssued */
function signedDelta(ch: UnlistedCapitalChange): number {
  return ch.changeType === "capital_reduction" || ch.changeType === "free_reduction"
    ? -ch.sharesIssued
    : ch.sharesIssued;
}

function fmtDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export interface CalcConvertedSharesArgs {
  /** 평가기준일 현재 발행주식총수 */
  totalShares: number;
  /** 3개 사업연도 종료일 [1년전, 2년전, 3년전] (내림차순 날짜) */
  fiscalYearEndDates: [Date, Date, Date];
  /** 평가기준일 */
  evaluationDate: Date;
  /** 자본금 변동 (유상증자·무상증자·감자) */
  capitalChanges: UnlistedCapitalChange[];
}

export interface CalcConvertedSharesResult {
  /** 환산주식수 [1년전, 2년전, 3년전] */
  convertedShares: [number, number, number];
  warnings: string[];
  /** 환산에 반영된(윈도우 내) 변동 건수 */
  windowChangeCount: number;
}

/**
 * 사업연도별 환산주식수 산정 (§17의3⑤ 충실 — 연도별 누적 환산)
 *
 * @example SC-2 다년도 분산 증자
 *   total 180,000 / 2020 +50,000 · 2021 +30,000 (평가 2022.6.30)
 *   → [180,000, 180,000, 180,000] (telescoping 균등)
 */
export function calcConvertedShares(args: CalcConvertedSharesArgs): CalcConvertedSharesResult {
  const { totalShares, fiscalYearEndDates, evaluationDate, capitalChanges } = args;
  const warnings: string[] = [];

  // STEP 1: 윈도우 필터 (§56③ 단서 — 평가기준일이 속하는 사업연도 이전 3년 이내)
  //   windowStart = 3년전 사업연도 개시일 (= 3년전 종료일 − 1년 + 1일, 12개월 가정 — §9 한계 공유)
  const thirdYearEnd = fiscalYearEndDates[2];
  const windowStart = new Date(thirdYearEnd);
  windowStart.setFullYear(windowStart.getFullYear() - 1);
  windowStart.setDate(windowStart.getDate() + 1);

  // 변동일 미입력(undefined) 행은 §56③ 단서 환산 대상에서 제외 (validate가 차단하므로 defensive)
  const W = capitalChanges
    .filter((c): c is typeof c & { changeDate: Date } =>
      c.changeDate != null && c.changeDate instanceof Date && !isNaN(c.changeDate.getTime()) &&
      c.changeDate >= windowStart && c.changeDate <= evaluationDate
    )
    .sort((a, b) => a.changeDate.getTime() - b.changeDate.getTime());
  const excludedCount = capitalChanges.length - W.length;
  if (excludedCount > 0) {
    warnings.push(
      `평가기간(3년) 밖 자본변동 ${excludedCount}건은 §56③ 단서에 따라 환산주식수 산정에서 제외했습니다.`,
    );
  }

  // STEP 2: 각 사업연도말 실제주식수 역산 (totalShares − 해당 종료일 이후 발생 변동)
  const actual: [number, number, number] = [0, 0, 0];
  for (let i = 0; i < 3; i++) {
    const after = W.filter((c) => c.changeDate > fiscalYearEndDates[i]).reduce((s, c) => s + signedDelta(c), 0);
    actual[i] = totalShares - after;
  }
  if (actual.some((v) => v < 0)) {
    warnings.push(
      "입력한 자본변동 합계가 발행주식총수와 모순됩니다(일부 사업연도 추정 주식수 음수). 자본변동 이력을 확인하세요.",
    );
  }

  // STEP 3: 환산주식수 초기화 = 실제주식수
  const conv: [number, number, number] = [actual[0], actual[1], actual[2]];

  // STEP 4: 각 변동의 §17의3⑤ 비율 = (변동 후 잔고 / 변동 직전 잔고)를 "변동 이전 각 사업연도"에 누적 곱.
  //   분모는 변동 직전 **실제 잔고(running)** — 동일 사업연도 복수 변동도 순차 적용되어 telescoping 정합.
  //   (FY말 고정 분모를 쓰면 동일 연도 2건째에서 비율이 어긋남 — 계획서 §8-4 Q4 / 사례 SC-10)
  let countBefore = totalShares - W.reduce((s, c) => s + signedDelta(c), 0); // 첫 변동 직전 잔고
  for (const ch of W) {
    const delta = signedDelta(ch);
    const countAfter = countBefore + delta;
    if (countBefore <= 0 || countAfter <= 0) {
      warnings.push(
        `${fmtDate(ch.changeDate)} 자본변동: 직전 주식수가 0 이하로 환산식 적용 불가 — 해당 변동 환산 미반영(자동 보정하지 않음).`,
      );
      countBefore = countAfter;
      continue;
    }
    for (let i = 0; i < 3; i++) {
      if (fiscalYearEndDates[i] < ch.changeDate) {
        // conv[i] × countAfter / countBefore — safeMultiplyThenDivide 로 대용량 정밀도 보장(2^53 초과 BigInt)
        conv[i] = safeMultiplyThenDivide(conv[i], countAfter, countBefore);
      }
    }
    countBefore = countAfter;
  }

  return { convertedShares: conv, warnings, windowChangeCount: W.length };
}

/**
 * 단일 환산 헬퍼 (하위호환 export 유지) — priorEndShares × (priorEndShares + Δ) / priorEndShares
 *
 * 산식상 결과는 priorEndShares + Δ. safeMultiplyThenDivide 로 대용량(>2^53) 정밀도 보장.
 * (구 구현은 `floor(p × (p+d) / p)` 부동소수 곱셈으로 1억주 부근 홀수곱에서 ±1주 오차 — SC-6b 회귀.)
 */
export function applyShareConversion(priorEndShares: number, capitalDelta: number): number {
  if (priorEndShares <= 0) return 0;
  return safeMultiplyThenDivide(priorEndShares, priorEndShares + capitalDelta, priorEndShares);
}
