/**
 * L-5: 「소득세법」 §95④ **후단** — 가업상속공제가 적용된 **비율에 해당하는 자산**의 장기보유특별공제
 *
 * `transfer-tax-lthd.ts`에서 분리(800줄 정책 — 슬라이스 분기를 얹으면 ≈740줄이 된다). 분기 순서·게이트는 호출부가 정한다.
 * 계획서: docs/02-design/features/transfer-fb-lthd-portion-gain.engine.plan.md
 *
 * 자산을 적용률 r로 나눈 **부분**이 보유기간 기산 단위다(후단의 한정어 「비율에 해당하는 자산」):
 *   적용분 = 피상속인 취득일 기산 · 비적용분 = 상속개시일 기산(전단 — 취득일부터).
 *
 * 두 가지 분할이 있다.
 *   · `slice_gain` — **의제 §97의2④ 재귀**. 두 부분의 취득가액 base가 다르다(1호 피상속인 취득가액 · 2호 상속개시일 평가액).
 *     그래서 부분별 양도차익(`family-business-lthd-slices.ts`)으로 나눠 부분마다 제 공제율을 곱한다.
 *   · `proportional` — **일반 §97 재귀**(두 부분 base 동일 = 상속개시일 평가액, 영 §163⑨) · 부분별 양도차익을 만들 수 없는 경우.
 *     전체 양도차익을 r로 비례 안분한다 — 종전과 비트 동일(Q-4).
 *
 * ⚠️ **보유분만 부분별로 나눈다.** 표2 거주분 공제율은 상속개시일 이후 상속인 실거주 기준이고 **전체 과세 양도차익**에 곱한다 —
 *    후단은 「보유기간」만 규정하고 거주기간 승계 명문이 없다(사전-2025-법규재산-0506 질의2).
 *
 * 정수 연산: 공제율을 가중하지 않고 양도차익을 나눠 부분마다 floor한다(§97의3과 동일 패턴).
 */

import { applyFairMarketRatio, applyRateFraction, calculateHoldingPeriod } from "./tax-utils";
import { calcLongTermRate } from "./transfer-tax-mixed-use-inheritance";
import { resolveFamilyBusinessRateFraction } from "./family-business-applied-rate";
import { splitFbTaxableGains } from "./family-business-lthd-slices";
import { TRANSFER } from "./legal-codes";
import { TRANSFER_FB_LTHD } from "./legal-codes/transfer-fb-lthd";
import type { LongTermHoldingResult } from "./transfer-tax-lthd";
import type { TransferTaxInput } from "./types/transfer.types";
import type { FbLthdSlice, FbLthdSliceDetail } from "./types/fb-lthd.types";

/** 공제율 → 공제액 — `transfer-tax-lthd.ts`의 `applyLthdRate`와 같은 정본(D10-06). */
const applyLthdRate = applyFairMarketRatio;

/**
 * 한 부분이 양도차손일 때의 «확인 필요» 고지(사용자 결정 Q-2 (a) — 해석례 미확보).
 * 차손 부분은 공제하지 않고 양수 부분은 자기 몫 전액에 공제율을 곱하므로, 공제액이 자산 전체 양도차익에 대한 법정 공제율 상한을 넘을 수 있다.
 */
export const FB_LTHD_LOSS_SLICE_NOTICE =
  `${TRANSFER_FB_LTHD.LATTER_HOLDING_START}에 따라 가업상속공제 적용 비율분과 비적용분의 양도차익을 부분별로 나눴더니 한 부분이 양도차손입니다. ` +
  `차손 부분은 장기보유특별공제를 적용하지 않고, 양도차익이 있는 부분은 그 부분 양도차익 전액에 그 부분의 보유기간 공제율을 곱했습니다 ` +
  `(그래서 공제액이 자산 전체 양도차익에 대한 표 공제율 상한을 넘을 수 있습니다). ` +
  `${TRANSFER.CARRYOVER_FAMILY_BUSINESS}과 위 조문은 한 부분이 차손일 때의 처리를 정하지 않고 해석례도 확인되지 않아, 이 처리는 확인 필요합니다.`;

/**
 * 부분별 공제액 합이 과세 양도차익을 넘어 양도차익 범위로 제한했을 때의 «확인 필요» 고지 문장(사용자 결정 2026-11-26 M-1).
 * Q-2 (a)가 차손 부분을 공제하지 않고 양수 부분에 자기 몫 전액을 곱하므로 합이 양도차익을 넘을 수 있다 — 그대로 두면 양도차익보다 큰 공제가 나온다.
 */
export const FB_LTHD_GAIN_CAP_SENTENCE =
  "이 경우 부분별 장기보유특별공제의 합이 과세 양도차익을 넘어 공제액을 양도차익 범위로 제한했습니다(공제액이 양도차익을 넘지 않도록 한 처리 — 해석례가 확인되지 않아 확인 필요).";

const pct = (v: number): string => `${+(v * 100).toFixed(1)}`;

export function calcFbLatterLongTermHolding(a: {
  input: TransferTaxInput;
  fbl: NonNullable<TransferTaxInput["fbLthdLatter"]>;
  taxableGain: number;
  /** 상속개시일(취득일) 기산 보유기간 */
  holding: { years: number; months: number };
  /** 표1/표2 합산 공제율(상속개시일 기산 · 거주분 포함) */
  rate: number;
  residenceYears: number;
  useTable2: boolean;
}): LongTermHoldingResult {
  const { input, fbl, taxableGain, holding, rate, residenceYears, useTable2 } = a;
  const holdingPeriod = { years: holding.years, months: holding.months };
  const holdingFromDecedent = calculateHoldingPeriod(fbl.decedentAcquisitionDate, input.transferDate);
  const holdOnly = (years: number): number => calcLongTermRate(years, 0, useTable2, false, input.transferDate);
  const decedentHoldRate = holdOnly(holdingFromDecedent.years);
  const heirHoldRate = holdOnly(holding.years);
  const residencePart = rate - heirHoldRate; // 표2 거주분(표1이면 0)

  const positiveGain = Math.max(taxableGain, 0);
  const fbFrac = fbl.appliedRateFraction ?? resolveFamilyBusinessRateFraction(fbl.appliedRate);
  const sg = fbl.sliceGains;

  // 부분 양도차익 · 공제 기준액
  const sliceGain = positiveGain > 0 ? sg : undefined;
  let decedentBase: number;
  let heirBase: number;
  if (sliceGain) {
    ({ decedent: decedentBase, heir: heirBase } = splitFbTaxableGains(positiveGain, sliceGain.decedent, sliceGain.heir));
  } else {
    decedentBase = applyRateFraction(positiveGain, fbFrac.numerator, fbFrac.denominator);
    heirBase = positiveGain - decedentBase; // 잔액 흡수 — Σ = positiveGain
  }

  // F-1: `residencePart = rate − heirHoldRate`는 double 뺄셈이라 0.07999999999999999 같은 값이 나온다
  //   (표2 보유 4년 + 거주 2년 등 — 실측). 세 항 모두 정수 분수연산으로 적용한다.
  const decedentDeduction = applyLthdRate(decedentBase, decedentHoldRate);
  const heirDeduction = applyLthdRate(heirBase, heirHoldRate);
  const residenceDeduction = applyLthdRate(positiveGain, residencePart);
  const uncappedDeduction = decedentDeduction + heirDeduction + residenceDeduction;
  // M-1: 슬라이스 경로만 — 차손 부분을 0으로 두고 양수 부분에 전액을 곱하면 합이 양도차익을 넘을 수 있다. 과세 양도차익(12억 초과 안분 후)이 상한이다.
  const cappedToGain = !!sliceGain && uncappedDeduction > positiveGain;
  const deduction = cappedToGain ? positiveGain : uncappedDeduction;

  if (!sliceGain) {
    // 비례 안분(종전) — 공제율 = r × 적용분 율 + (1 − r) × 비적용분 율 + 거주분 (표시 전용). 산식 문구도 종전 그대로.
    const blendedRate =
      fbl.appliedRate * decedentHoldRate + (1 - fbl.appliedRate) * heirHoldRate + residencePart;
    // 산식 표시 — 한국어 풀어쓰기(변수 약어·floor() 금지). 공제율이 소수(25.6% 등)일 수 있어
    // 반올림하지 않고 소수 첫째 자리까지 보여준다.
    const heirSharePct = pct(1 - fbl.appliedRate);
    const fbLthdFormula =
      `가업상속공제적용률 ${pct(fbl.appliedRate)}% 분은 피상속인 취득일부터 ${holdingFromDecedent.years}년 → ${pct(decedentHoldRate)}%` +
      ` + 나머지 ${heirSharePct}% 분은 상속개시일부터 ${holding.years}년 → ${pct(heirHoldRate)}%` +
      (residencePart > 0 ? ` + 거주분 ${pct(residencePart)}%` : "") +
      ` = ${pct(blendedRate)}%`;
    return { deduction, rate: blendedRate, holdingPeriod, fbLthdFormula };
  }

  const slice = (
    gain: number,
    base: number,
    years: { years: number; months: number },
    holdingRate: number,
    dedn: number,
    netShare: number,
    term: number,
  ): FbLthdSlice => ({
    netTransferShare: netShare,
    acquisitionTerm: term,
    gain,
    taxableGain: base,
    holdingYears: years.years,
    holdingMonths: years.months,
    holdingRate,
    deduction: dedn,
  });
  const terms = fbl.imputedTerms!;
  const lossSlice = sliceGain.decedent < 0 ? "decedent" : sliceGain.heir < 0 ? "heir" : undefined;
  const effectiveRate = positiveGain > 0 ? deduction / positiveGain : 0;
  const fbLthdDetail: FbLthdSliceDetail = {
    basis: "slice_gain",
    appliedRateFraction: { numerator: fbFrac.numerator, denominator: fbFrac.denominator },
    decedentSlice: slice(sliceGain.decedent, decedentBase, holdingFromDecedent, decedentHoldRate, decedentDeduction, sliceGain.decedentNetShare, terms.decedentTerm),
    heirSlice: slice(sliceGain.heir, heirBase, holding, heirHoldRate, heirDeduction, sliceGain.heirNetShare, terms.heirTerm),
    residenceDeduction,
    ...(lossSlice ? { lossSlice } : {}),
    ...(cappedToGain ? { cappedToGain: true as const } : {}),
    effectiveRate,
  };

  // 산식 표시 — 부분별 양도차익 × 부분별 공제율. 차손 부분은 0%로 쓴다.
  const money = (v: number): string => v.toLocaleString();
  const part = (label: string, gain: number, base: number, holdRate: number, from: string, years: number): string =>
    gain < 0
      ? `${label} 양도차손 ${money(gain)} × 0% (차손 부분은 공제하지 않음)`
      : `${label} 양도차익 ${money(base)} × ${pct(holdRate)}% (${from} ${years}년)`;
  const fbLthdFormula =
    part(`적용분(가업상속공제적용률 ${pct(fbl.appliedRate)}%)`, sliceGain.decedent, decedentBase, decedentHoldRate, "피상속인 취득일부터", holdingFromDecedent.years) +
    ` + ${part("비적용분", sliceGain.heir, heirBase, heirHoldRate, "상속개시일부터", holding.years)}` +
    (residencePart > 0 ? ` + 거주분 ${money(positiveGain)} × ${pct(residencePart)}% (거주 ${residenceYears}년)` : "") +
    (cappedToGain ? ` = ${money(uncappedDeduction)} → 과세 양도차익 ${money(positiveGain)}을 넘어 양도차익 범위로 제한 = ${money(deduction)}` : ` = ${money(deduction)}`);

  return { deduction, rate: effectiveRate, holdingPeriod, fbLthdFormula, fbLthdDetail };
}
