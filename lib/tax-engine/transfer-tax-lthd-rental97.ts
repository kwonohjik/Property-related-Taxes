/**
 * 장기보유특별공제 L-2' — 조특법 §97의3(특례 공제율 대체)·§97의4(추가 공제율 가산) 적용 leaf.
 *
 * `transfer-tax-lthd.ts`(723줄)에서 분리했다 — 「임대 특례 효과 적용」이라는 자연 이음매.
 * 일반 경로(`calcLongTermHoldingDeduction`)가 호출하고, 재개발 경로는 같은 비교 술어
 * (`shouldApplyRental973Special`)만 공유한다(`transfer-tax-redevelopment-steps.ts`).
 *
 * ## #1 — §97의3은 특례 적용 공제액과 일반 공제액 중 큰 쪽 (PR-B, 계획서 §3.3)
 * 조특법 §97의3③ 「제1항에 따라 과세특례를 적용받으려는 자는 … 과세특례 적용의 **신청을 하여야 한다**」.
 * 일반 공제율(표2 80% 등)이 특례율(70%·경과 50%)보다 높아 특례가 공제액을 줄이면 납세자는 신청하지
 * 않는다 ⇒ 두 공제액을 비교해 큰 쪽을 쓴다(사용자 결정 Q-1 (a) — 2026-11-02).
 * 종전에는 비교 없이 대체해, 1세대1주택 표2 80% 사안에서 장특 480,000,000 → 428,571,427(세액
 * 25,685,000 → 44,252,857)으로 줄었다(실측).
 *
 * - 동률이면 특례를 채택한다(기존 경로 유지). 표2는 4%의 배수라 실제 동률은 임대분 차익 0일 때뿐이다.
 * - 미채택이어도 `isEligible`은 true로 둔다 — 요건 불충족이 아니라 선택 결과다(`specialApplied: false`).
 * - §97의4는 가산형이라 항상 일반 이상이므로 비교하지 않는다.
 */
import { applyFairMarketRatio } from "./tax-utils";
import { applyRentalGainShare } from "./transfer-reductions/rental-97-shared-helpers";
import type { Rental97Result } from "./transfer-reductions/types";

/** 공제율 → 공제액 — `transfer-tax-lthd.ts`의 `applyLthdRate`와 같은 정본(D10-06). */
const applyLthdRate = applyFairMarketRatio;

/**
 * §97의3 특례 채택 여부 — 특례 적용 공제액 ≥ 미적용 공제액이면 채택(동률 포함).
 * 일반·재개발 경로가 같은 술어를 쓴다(memory `feedback_shared_predicate_argument_parity`).
 */
export function shouldApplyRental973Special(deductionWithSpecial: number, deductionWithoutSpecial: number): boolean {
  return deductionWithSpecial >= deductionWithoutSpecial;
}

export type Rental97LthdOutcome =
  /** 이 leaf가 공제액을 확정했다 — 호출자는 그대로 반환한다. */
  | { kind: "applied"; deduction: number; rate: number; rental97LthdDetail: Rental97Result }
  /** 특례를 적용하지 않는다 — 호출자는 일반 공제(폴스루)를 계산하고 이 echo를 싣는다. */
  | { kind: "fallthrough"; rental97LthdDetail: Rental97Result | undefined };

export function applyRental97Lthd(args: {
  rental97Eval: Rental97Result | undefined;
  /** 장기보유특별공제 대상 양도차익(음수 가능 — §97의3은 0 clamp 후 안분) */
  taxableGain: number;
  /** 일반 공제율(§95② 표1·표2 — 호출자가 이미 판정) */
  rate: number;
  /** §95② 단서(표2) 적용 여부 — §97의4① 단서 판정용 */
  useTable2: boolean;
}): Rental97LthdOutcome {
  const { rental97Eval, taxableGain, rate, useTable2 } = args;

  if (
    rental97Eval?.isEligible &&
    rental97Eval.effectCategory === "long_term_holding_special" &&
    rental97Eval.overrideRate !== undefined
  ) {
    // §97의3: 임대기간 분 양도차익 × 70% + 비임대분 × 일반율 (ratio=1이면 전액 70%)
    const positiveGain = Math.max(taxableGain, 0);
    const rentalGain = applyRentalGainShare(positiveGain, rental97Eval);
    const nonRentalGain = positiveGain - rentalGain;
    // F-1: 공제율(임대분 0.7·0.5, 비임대분 `rate`)은 정수 % 상수라 정수 분수연산을 쓴다 — `applyRate(g, 0.7)`은
    //   g=700에서 489(정확 490)다. 임대기간 분 비율은 기준시가 비율(임의 소수)이라 `applyLthdRate`(소수 4자리 반올림)가 아니라
    //   **기준시가 정수 분수**(`applyRentalGainShare`)로 곱한다 — 종전 `applyRate(g, 비율)`의 1원 과소 해소(2026-10-11).
    const deductionWithSpecial =
      applyLthdRate(rentalGain, rental97Eval.overrideRate) + applyLthdRate(nonRentalGain, rate);
    // 미적용 공제액 — 호출자 폴스루(`calcLongTermHoldingDeduction` 끝)와 같은 식
    const deductionWithoutSpecial = rate > 0 ? applyLthdRate(positiveGain, rate) : 0;
    const specialApplied = shouldApplyRental973Special(deductionWithSpecial, deductionWithoutSpecial);

    // [echo] 결과 카드 산식·비교 표시용 — 계산에는 관여하지 않는다(위 값 그대로 실어 보낸다)
    const echo = {
      ...rental97Eval,
      baseLthdRate: rate,
      gainApplied: positiveGain,
      rentalGainApplied: rentalGain,
      nonRentalGainApplied: nonRentalGain,
      specialApplied,
      deductionWithSpecial,
      deductionWithoutSpecial,
      deductionApplied: specialApplied ? deductionWithSpecial : deductionWithoutSpecial,
    };
    if (!specialApplied) return { kind: "fallthrough", rental97LthdDetail: echo };
    const blendedRate =
      rental97Eval.overrideRate * rental97Eval.rentalGainRatio + rate * (1 - rental97Eval.rentalGainRatio);
    return { kind: "applied", deduction: deductionWithSpecial, rate: blendedRate, rental97LthdDetail: echo };
  }

  if (
    rental97Eval?.isEligible &&
    rental97Eval.effectCategory === "long_term_holding_additional" &&
    rental97Eval.additionalRate !== undefined
  ) {
    // §97의4① **단서** — 「다만, 같은 항 단서에 해당하는 경우에는 그러하지 아니하다」 (D2-01)
    //
    // 직전 지시어가 「같은 조 **제2항**」이므로 「같은 항」 = 소득세법 §95②이고,
    // §95② 단서는 「다만, 대통령령으로 정하는 **1세대 1주택**…의 경우에는 … **표 2**…」다.
    // ⇒ 표2가 적용되는 1세대1주택 고가주택에는 추가공제율을 **가산하지 않는다**.
    //
    // 🔑 판정 술어를 새로 만들지 않는다 — 호출자의 `useTable2`가 이미 §95② 단서 해당 여부다.
    //    (같은 사실을 두 술어로 판정하면 드리프트한다 — memory `feedback_shared_predicate_argument_parity`)
    //
    // ⚠️ 배제해도 `rental97LthdDetail`은 남긴다. 사용자가 §97의4를 선택했는데 결과 화면에서
    //    통째로 사라지면 「왜 반영이 안 됐는지」를 알 길이 없다.
    if (useTable2) {
      return {
        kind: "applied",
        deduction: applyLthdRate(taxableGain, rate),
        rate,
        rental97LthdDetail: {
          ...rental97Eval,
          isEligible: false,
          ineligibleReasons: [
            {
              code: "TABLE2_PROVISO_EXCLUDED",
              message:
                "1세대1주택 장기보유특별공제 표2(소득세법 §95② 단서) 적용 대상이므로 " +
                "§97의4 추가공제율을 가산하지 않습니다 (조특법 §97의4① 단서).",
              legalBasis: "조특법 §97의4① 단서 · 소득세법 §95② 단서",
            },
          ],
          baseLthdRate: rate,
          gainApplied: taxableGain,
          deductionApplied: applyLthdRate(taxableGain, rate),
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any,
      };
    }

    // §97의4: 보유기간별 공제율(§95② 표1)에 추가율 가산 — 기본 공제율이 0(보유 3년 미만)이면 가산 불가
    if (rate > 0) {
      const combined = rate + rental97Eval.additionalRate;
      const combinedDeduction = applyLthdRate(taxableGain, combined);
      return {
        kind: "applied",
        deduction: combinedDeduction,
        rate: combined,
        // [echo] 산식 표시용 — 계산 무관
        rental97LthdDetail: {
          ...rental97Eval,
          baseLthdRate: rate,
          gainApplied: taxableGain,
          deductionApplied: combinedDeduction,
        },
      };
    }
    return { kind: "applied", deduction: 0, rate: 0, rental97LthdDetail: rental97Eval };
  }

  return { kind: "fallthrough", rental97LthdDetail: rental97Eval };
}
