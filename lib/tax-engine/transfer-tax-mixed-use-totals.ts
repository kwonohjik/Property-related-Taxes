/**
 * 겸용주택 비사업용토지 부분 + 합산 세액 조립 헬퍼.
 * transfer-tax-mixed-use-helpers.ts에서 분리 (800줄 정책).
 */

import { applyRate, calculateProgressiveTax } from "./tax-utils";
import { calcReductions } from "./transfer-tax-reductions-calc";
import { applyReductionStatutoryCap } from "./transfer-tax-reduction-cap";
import { resolveTaxCreditRuralSurtax } from "./transfer-tax-rural-surtax";
import {
  calculateTransferTaxPenalty,
  type TransferTaxPenaltyResult,
} from "./transfer-tax-penalty";
import { ALL_INCOME_DEDUCTION_IDS } from "./transfer-reductions/income-deduction-router";
import { LTHD_SPECIAL_REDUCTION_IDS } from "./transfer-reductions/unsold-hybrid-p3";
import type { TransferReduction, TransferTaxInput } from "./types/transfer.types";
import type { ParsedRates } from "./transfer-tax-helpers";
import type { TransferReductionDetailSource } from "./types/transfer-result.types";
import { compareWithClause1 } from "./transfer-tax-rate-calc";
import { calcLongTermRate, type ExcessLandResult } from "./transfer-tax-mixed-use-helpers";
import type {
  MixedUseHousingPart,
  MixedUseNonBusinessLandPart,
  MixedUseTotalTax,
} from "./types/transfer-mixed-use.types";
import type { TaxBracket } from "./types";

/** 비사업용토지 부분 조립 */
export function buildNonBusinessPart(
  housingPart: MixedUseHousingPart,
  excessResult: ExcessLandResult,
  landHoldingYears: number,
  /** §95② 미등기양도자산 장기보유특별공제 배제. */
  isUnregistered = false,
): MixedUseNonBusinessLandPart | null {
  if (excessResult.excessArea <= 0) return null;

  const transferredGain = housingPart.nonBusinessTransferredGain;
  const deductionRate = calcLongTermRate(landHoldingYears, 0, false, isUnregistered);
  const longTermDeductionAmount = applyRate(Math.max(transferredGain, 0), deductionRate);

  return {
    excessArea: excessResult.excessArea,
    appliedMultiplier: excessResult.multiplier,
    transferGain: transferredGain,
    longTermDeductionRate: deductionRate,
    longTermDeductionAmount,
    incomeAmount: Math.max(0, transferredGain - longTermDeductionAmount),
    additionalRate: 0.10,
  };
}

/**
 * 단기보유 세율 (「소득세법」 제104조 제1항 제2·3호).
 * 3호(1년 미만) 50% — **주택**(이에 딸린 토지 포함)은 70%.
 * 2호(1~2년)   40% — 주택은 60%.
 * 2년 이상이면 null(§55① 누진).
 */
function shortTermRate(holdingYears: number, isHousing: boolean): number | null {
  if (holdingYears < 1) return isHousing ? 0.7 : 0.5;
  if (holdingYears < 2) return isHousing ? 0.6 : 0.4;
  return null;
}

/**
 * §104⑤ 비교과세용 파트 — 겸용주택의 주택분·상가토지분·상가건물분.
 * 세율 기산 연수는 caller가 산정해 넣는다(재도출 금지).
 */
export interface MixedUseRatePart {
  /**
   * `non_business_land` = 주택 부수토지 배율 초과분(「소득세법」 §104의3①5호).
   * §104⑤ 본문 **후단**이 "한 필지의 토지가 §104의3에 따른 비사업용 토지와 그 외의 토지로
   * 구분되는 경우에는 **각각을 별개의 자산으로 보아** 양도소득 산출세액을 계산한다"고 정한다
   * (2018.4.1. 이후 양도분 — 대법원 2014.10.30. 2012두15371 취지 반영).
   */
  kind: "housing" | "commercial_land" | "commercial_building" | "non_business_land";
  income: number;
  holdingYears: number;
  /**
   * 「소득세법」 제104조 제7항 다주택 중과 가산율(0.20 = 1·2호 / 0.30 = 3·4호).
   * **주택분 전용** — 대상이 「주택(이에 딸린 토지를 포함한다)」이라 상가 파트에는 붙지 않는다.
   * 미적용(비조정·유예·2008위기취득·2018-04-01 이전 양도) 시 undefined.
   */
  surchargeAddon?: number;
}

/** 합산 세액 조립 */
export function buildTotalTax(
  housingIncome: number,
  commercialIncome: number,
  nonBizIncome: number,
  brackets: TaxBracket[],
  /** 기본공제 연간 한도 (DB 세율 basicDeductionRules.annualLimit). 미전달 시 250만원 fallback. */
  basicDeductionLimit = 2_500_000,
  /**
   * 단기보유 세율 판정용 파트. **미전달 또는 `nonBizIncome > 0`이면 종전 경로**
   * (합산 누진 + 비사업용 10%p 가산)를 그대로 쓴다 — 계획서 §4.2 · P3b 범위.
   */
  rateParts?: MixedUseRatePart[],
  /**
   * 미등기양도자산(「소득세법」 제104조 제3항). 세율·공제가 통째로 갈린다:
   *   §103①1호 **단서** — 양도소득기본공제 **배제**
   *   §104①10호        — 양도소득 과세표준의 **70%** 단일세율
   * (§95② 장특 배제·§91① 비과세 배제는 각 part 조립 단계에서 이미 반영된다.)
   */
  isUnregistered = false,
  /**
   * 산출세액 **이후** 단계 — 조특법 감면 · 농어촌특별세 · 가산세 (F17-B, 2026-08-23).
   *
   * 미전달이면 종전과 완전히 같은 값을 낸다(감면 0 · 가산세 0 · 지방소득세 base = 산출세액).
   */
  postTax?: MixedUsePostTaxInput,
): MixedUseTotalTax {
  const BASIC_DEDUCTION = isUnregistered ? 0 : basicDeductionLimit;

  const aggregateIncome = housingIncome + commercialIncome + nonBizIncome;
  const taxBase = Math.max(0, aggregateIncome - BASIC_DEDUCTION);
  const taxByBasicRate = calculateProgressiveTax(taxBase, brackets);

  // ── §104①2·3호 단기세율 + §104⑦ 중과 + §104⑤ 비교과세 ──────────────────────
  // 「소득세법」 제104조 제5항: MAX(1호 합산누진, 2호 자산별 산출세액 합).
  // 2호 **단서**(동일 호·동일세율 합산)는 P1(`transfer-tax-split-rate.ts`)과 같은 규칙 —
  // 세율이 갈리면 본문인 자산별 합계다.
  //
  // 배율 초과 비사업용 토지(`kind: "non_business_land"`)도 **2호 안에서** 계산한다 —
  // §104⑤ 본문 **후단**이 "한 필지의 토지가 §104의3에 따른 비사업용 토지와 그 외의 토지로
  // 구분되는 경우에는 **각각을 별개의 자산으로 보아**" 산출세액을 계산하도록 정한다
  // (2018.4.1. 이후 양도분 · 대법원 2014.10.30. 2012두15371 취지). 계획서 D-8 · P6.
  //   종전 모델 A(`누진(합산 과세표준) + 10%p × 비사토분`)는 §104⑤ 1호도 2호도 아니었고
  //   항상 MAX를 초과했다(과다과세 4,750,000~59,865,000 실측).
  //
  // ⚠️ `rateParts` 미전달(상가 파트 분해 실패 등)이면 여전히 종전 모델로 후퇴한다 — 안전측.
  const clause2 = (() => {
    if (!rateParts || rateParts.length === 0 || taxBase <= 0) return null;
    const rates = rateParts.map((p) => shortTermRate(p.holdingYears, p.kind === "housing"));
    const addonOf = (i: number) => rateParts[i].surchargeAddon ?? 0;
    // 전 파트가 2년 이상이고 중과도 없으면 §55① 누진 하나뿐 — 1호와 같아지므로 진입 의미가 없다.
    if (rates.every((r) => r === null) && rateParts.every((_, i) => addonOf(i) === 0)) return null;

    // 기본공제는 세율이 가장 높은 파트에 전액 귀속(납세자 유리 — §103② 취지).
    // 누진 파트의 한계세율은 최고 45%이고, 중과 파트는 거기에 가산율이 더해진다.
    const TOP = brackets[brackets.length - 1].rate;
    const effRate = (i: number) =>
      addonOf(i) > 0 ? Math.max(TOP + addonOf(i), rates[i] ?? 0) : rates[i] ?? TOP;
    const order = rateParts.map((_, i) => i).sort((a, b) => effRate(b) - effRate(a));
    let remaining = Math.min(BASIC_DEDUCTION, aggregateIncome);
    const bases = new Array<number>(rateParts.length).fill(0);
    for (const i of order) {
      const used = Math.min(remaining, rateParts[i].income);
      bases[i] = Math.max(0, rateParts[i].income - used);
      remaining -= used;
    }

    // 2호 — 누진 호(§104①1호)만 과세표준을 합산해 1회 계산하고, 단기 호는 **자산별**로 계산한다.
    //   중과 파트(§104⑦1·3호)는 §104①1호와 **다른 호**라 누진 그룹에 합류하지 않는다.
    //   겸용의 주택 파트는 하나뿐이라 중과 그룹은 항상 단독이다.
    //
    // 🔴 **§104① 후단은 파트(=자산)마다 건다** — 2026-08-13 F20.
    //   후단은 "하나의 자산이 … 둘 이상에 **해당**할 때에는 … 산출세액 중 **큰 것**"이고,
    //   보유 1~2년 상가토지·상가건물은 §94①1호 자산이라 §104①1호(§55① 누진)와 2호(40%)에
    //   **동시에 해당**한다. §104⑤2호 본문도 "제1항부터 제4항까지 및 제7항의 **규정에 따라**
    //   계산한 자산별 양도소득 산출세액 합계액"이라 파트 세액에 후단이 **내장**되어야 한다.
    //
    //   ⚠️ 종전에는 같은 세율 파트를 한 버킷으로 묶어 `applyRate(합계, r)` 한 줄로 끝내
    //      비교 자체를 하지 않았다(실측 34,060,000 과소).
    //   ⚠️ **버킷 합계에 MAX를 씌우면 안 된다** — 후단의 단위는 「하나의 자산」이고 누진세액은
    //      볼록(P(Σbᵢ) ≥ ΣP(bᵢ))이라, 합계 기준 비교는 조문이 허용하지 않는 합산 효과를 만들어
    //      **과다과세**가 된다. 비교는 반드시 파트 단위다.
    //   ⚠️ 규칙을 손으로 다시 쓰지 않는다 — 단건 정본 `compareWithClause1`에 위임한다.
    let progressiveBase = 0;
    let sum = 0;
    rateParts.forEach((part, i) => {
      const addon = addonOf(i);
      if (addon > 0) {
        // §104⑦ 본문 — §55① 누진세율 + 가산율.
        // 가산율 ≥ 0이라 항상 §104①1호(누진) 이상 → 후단에서 1호가 이길 수 없다(비교 생략).
        const surcharged = calculateProgressiveTax(bases[i], brackets) + applyRate(bases[i], addon);
        const st = rates[i];
        // §104⑦ **후단** — 보유 2년 미만이면 §104①2·3호 세액과 MAX
        sum += st === null ? surcharged : Math.max(surcharged, applyRate(bases[i], st));
        return;
      }
      const r = rates[i];
      if (r === null) {
        progressiveBase += bases[i]; // 누진 호(§104①1호)는 과세표준 합산 후 1회
        return;
      }
      const shortTermTax = applyRate(bases[i], r);
      const clause1 = compareWithClause1(
        bases[i],
        brackets,
        shortTermTax,
        undefined,
        `${part.kind} 단기세율 ${(r * 100).toFixed(0)}%`,
      );
      sum += clause1 ? clause1.calculatedTax : shortTermTax;
    });
    if (progressiveBase > 0) sum += calculateProgressiveTax(progressiveBase, brackets);
    return { tax: sum, maxRate: Math.max(...rateParts.map((_, i) => effRate(i))) };
  })();
  // 적용된 누진세율 구간 추출 (UI 산식 표시용)
  const applicable = brackets.find((b) => taxBase <= (b.max ?? Infinity)) ?? brackets[brackets.length - 1];
  const appliedRate = taxBase > 0 ? applicable.rate : 0;
  const progressiveDeduction = taxBase > 0 ? applicable.deduction : 0;
  // §104①8호 비사업용 토지 +10%p 중과는 **과세표준**(=양도소득금액−기본공제)에 적용된다(단건 엔진
  // transfer-tax-rate-calc.ts:307-311와 동일 원리). 양도소득기본공제는 세율이 가장 높은 부분(비사업용
  // +10%p)에 전액 귀속(납세자 유리 원칙) → 중과 base = nonBiz의 과세표준 귀속분 = max(0, nonBiz − 적용공제).
  // 적용공제 = aggregateIncome − taxBase (= min(aggregate, 기본공제); nonBiz < 공제면 base 0으로 흡수).
  const appliedDeduction = aggregateIncome - taxBase;
  const nonBizSurchargeBase = Math.max(0, nonBizIncome - appliedDeduction);
  // 비사토가 §104⑤2호 파트로 들어갔으면 가산은 **그 파트 세액 안에서** 계산된다 —
  // 총액에 별도로 얹지 않는다(얹으면 이중 가산이고, 그것이 곧 폐기된 모델 A다).
  // `rateParts` 미전달 fallback 경로에서만 종전 모델을 유지한다.
  const nonBizInRateParts = rateParts?.some((p) => p.kind === "non_business_land") ?? false;
  const nonBusinessSurcharge = nonBizInRateParts ? 0 : applyRate(nonBizSurchargeBase, 0.10);
  // §104⑤1호 — 해당 과세기간의 양도소득과세표준 **합계액**에 §55①에 따른 세율을 적용한
  // 산출세액. **가산 항이 없다.**
  const clause1 = taxByBasicRate + nonBusinessSurcharge;
  // §104⑦ 표시용 가산율 — **주택 파트 전용**이다. 비사토 파트도 `surchargeAddon`(0.10)을
  // 갖지만 그것은 §104①8호로 근거 조문이 달라, 섞으면 결과 카드가 「다주택 중과 10%p」로
  // 오표시한다.
  const housingSurchargeAddon = rateParts?.find(
    (p) => p.kind === "housing" && (p.surchargeAddon ?? 0) > 0,
  )?.surchargeAddon;
  // §104①10호 70% 단일세율 — 보유기간·비사업용 여부와 무관한 **최우선** 분기다.
  const unregisteredTax = isUnregistered ? applyRate(taxBase, 0.7) : null;
  const usesClause2 = unregisteredTax === null && clause2 !== null && clause2.tax > clause1;
  const transferTax = unregisteredTax ?? (usesClause2 ? clause2.tax : clause1);

  // ── 산출세액 이후 — 감면 · 농특세 · 가산세 (F17-B) ────────────────────────
  const post = computeMixedUsePostTax(transferTax, aggregateIncome, BASIC_DEDUCTION, taxBase, postTax);
  const determinedTax = Math.max(0, transferTax - post.reductionAmount);
  // 지방소득세 base는 **결정세액**이다(지방세법 §103② 과세표준 × §103의3 세율 − §103의4 감면).
  // 국세기본법 §47의2~§47의4 가산세는 §103의2 3호 열거에 없어 대상이 아니다.
  // (겸용에는 §114조의2가 없으므로 §103의9② 가산분도 없다.)
  const localTax = applyRate(determinedTax, 0.10);

  return {
    aggregateIncome,
    basicDeduction: BASIC_DEDUCTION,
    taxBase,
    taxByBasicRate,
    // 2호(자산별 합)가 채택되면 대표세율은 파트 최고세율이고 누진공제는 표시할 수 없다.
    appliedRate: isUnregistered ? 0.7 : usesClause2 ? clause2.maxRate : appliedRate,
    progressiveDeduction: usesClause2 ? 0 : progressiveDeduction,
    rateBasis: isUnregistered ? "unregistered" : usesClause2 ? "clause2" : "progressive",
    ...(housingSurchargeAddon !== undefined ? { surchargeAddon: housingSurchargeAddon } : {}),
    nonBusinessSurcharge,
    transferTax,
    reductionAmount: post.reductionAmount,
    ...(post.reductionType ? { reductionType: post.reductionType } : {}),
    reductionTypeApplied: post.reductionTypeApplied,
    reducibleIncome: post.reducibleIncome,
    aggregateReductionRate: post.aggregateReductionRate,
    reductionDetails: post.reductionDetails,
    determinedTax,
    penaltyTax: post.penaltyTax,
    // 🔴 G-43: 산출근거 echo — 어댑터가 결과뷰의 `penaltyDetail` 슬롯으로 승계한다.
    ...(post.penaltyDetail ? { penaltyDetail: post.penaltyDetail } : {}),
    ruralSurtax: post.ruralSurtax,
    localTax,
    totalPayable: determinedTax + localTax + post.penaltyTax + post.ruralSurtax,
  };
}

// ── 산출세액 이후 단계 — 감면 · 농어촌특별세 · 가산세 (F17-B, 2026-08-23) ──────────

/**
 * 겸용주택 산출세액 이후 단계의 입력.
 *
 * ## 종전 결함 (리뷰 F17)
 *
 * 겸용 분기(`route.ts`)는 `calcMixedUseTransferTax(...)`만 부르고 `MixedUseAssetInput`에
 * 감면 필드가 **0건**이었다. 그런데 `UnifiedReductionPanel`은 자산 종류 게이트 없이 §77 등을
 * 렌더하고 ⑧·⑫도 통과시킨다 ⇒ **침묵 무시**. 실측: §77 공익수용(현금 8억)을 골라도
 * `totalPayable` 60,853,408 → **60,853,408**(Δ 0). 무신고 가산세도 Δ 0이었다.
 *
 * ## 법령
 *
 * · 조특법 §77①의 「토지등」은 공익사업법 §2 1호 → §3 2호로 위임되어 **건물을 명문에 담는다**.
 *   조특령 §72에 자산 종류를 좁히는 문언이 없다 ⇒ 겸용주택도 대상이다.
 *   (선례: 조심 2009광2620은 **주상겸용 건축물 수용** 사안이다.)
 * · 국세기본법 §47의3④의 부적용 사유는 **한정 열거**이고 겸용주택을 담고 있지 않다 ⇒
 *   자산 종류를 이유로 가산세를 0으로 두는 근거 조문이 **부존재**한다.
 */
export interface MixedUsePostTaxInput {
  /** 자산-수준 조특법 감면 (⑭ Date 변환 완료본) */
  reductions?: TransferReduction[];
  /** DB 세율 — 자경농지 감면 규칙 */
  selfFarmingRules?: ParsedRates["selfFarmingRules"];
  transferDate: Date;
  acquisitionDate?: Date;
  /** §97 시리즈 시한 판정 기준일 — 미전달 시 `period-check`가 취득일로 후퇴한다 (CB-05) */
  assetContractDate?: Date;
  /** 조특법 §133 5년 누적 한도 판정용 과거 이력 */
  priorReductionUsage?: { year: number; type: string; amount: number }[];
  filingPenaltyDetails?: TransferTaxInput["filingPenaltyDetails"];
  delayedPaymentDetails?: TransferTaxInput["delayedPaymentDetails"];
  /** §77 농특세 비과세 — 「직접 경작한 토지」(농특세령 §4①1호) */
  isSelfCultivatedExpropriatedLand?: boolean;
  /** 부수효과 — 차감형 감면을 계산하지 않았다는 사실을 여기 담는다(침묵 금지). */
  warnings?: string[];
}

interface MixedUsePostTaxResult {
  reductionAmount: number;
  reductionType?: string;
  /**
   * 채택된 감면의 **식별자**(표시용 라벨이 아니다) — 별지84호 ⑲ 세액감면대상금액 라우팅과
   * §127⑦ 중복배제 표시가 이 값을 본다. 종전에는 버려져 겸용 신고서 ⑲가 감면과 무관하게
   * 0으로 찍혔고 명세서 산식은 「감면 대상 없음」이라 **자기모순**이었다(결과탭 코드리뷰 #049).
   */
  reductionTypeApplied?: string;
  /** 감면대상 소득금액(⑲의 default 경로 값). */
  reducibleIncome?: number;
  /** D8-01: M-8이 곱할 잔여 감면율(미설정=1). 여기서 빠뜨리면 다건 합산이 감면율을 잃는다. */
  aggregateReductionRate?: number;
  /** 감면 산출근거 카드가 읽는 detail 묶음 — 종전에는 여기서 통째로 버려졌다. */
  reductionDetails?: MixedUseReductionDetails;
  ruralSurtax: number;
  penaltyTax: number;
  /**
   * 🔴 G-43: 신고불성실·납부지연 가산세 **산출근거**.
   *
   * 종전에는 `calculateTransferTaxPenalty`의 결과에서 합계(`totalPenalty`)만 꺼내고
   * 상세를 버려, 결과 화면에 금액만 남고 세율·산정일수·기준금액 행이 사라졌다.
   * 세액은 이미 `penaltyTax`에 들어 있으므로 이것은 **표시 전용 echo**다 — 산식은 바뀌지 않는다.
   * 형제 경로는 모두 싣는다(`transfer-tax-loss-return.ts:158` · `-normal-return.ts:120·204` ·
   * `-multi-parcel-branch.ts:309` · `-redevelopment.ts:901`).
   */
  penaltyDetail?: TransferTaxPenaltyResult;
}

/**
 * 겸용 결과뷰의 감면 산출근거 카드(`ReductionDetailCards`)가 읽는 detail 부분집합.
 * 세액감면형만 겸용 경로를 타므로(차감형은 고지 후 미계산) 그 범위만 싣는다.
 */
export type MixedUseReductionDetails = Pick<
  TransferReductionDetailSource,
  | "publicExpropriationDetail"
  | "gbDesignatedLandDetail"
  | "replacementLandDetail"
  | "selfFarmingReductionDetail"
  | "rental97TaxDetail"
  | "newHousingReductionDetail"
  | "rentalReductionDetail"
>;

const EMPTY_POST: MixedUsePostTaxResult = { reductionAmount: 0, ruralSurtax: 0, penaltyTax: 0 };

function computeMixedUsePostTax(
  calculatedTax: number,
  aggregateIncome: number,
  basicDeduction: number,
  taxBase: number,
  input: MixedUsePostTaxInput | undefined,
): MixedUsePostTaxResult {
  if (!input) return EMPTY_POST;

  const all = input.reductions ?? [];
  const incomeDeductionIds = new Set<string>(ALL_INCOME_DEDUCTION_IDS);
  /**
   * 🔑 **차감형은 계산하지 않고 고지한다** — §155⑳ 경로(F08)와 **같은 판단**이다.
   *
   * 차감형은 **양도소득금액을 차감**하는데 겸용은 소득금액이 주택분·상가분·비사토분으로
   * 갈려 있어 **어느 파트에서 빼는지 정한 명문이 없다**. 추정으로 자리를 정하면 조용히 틀린다.
   */
  const deferred = all.filter((r) => incomeDeductionIds.has(r.type));
  const taxCredit = all.filter((r) => !incomeDeductionIds.has(r.type));
  /**
   * **LTHD 계열 특례 고지** (CB-02·D5-05) — 감면 효과는 3종인데 위 이분법은 2종만 가른다.
   *
   * §97의3①(임대기간분 70%)·§97의4①(표1 가산)·§98의2①1호(표2)는 **감면세액이 아니라
   * 장기보유특별공제율 자체**를 바꾸는 조문이라 `calcReductions`에서 계산되지 않는다.
   * 세액 반영은 §166⑤ 3분기 구조와의 결합 판단이 남아 있어 **아직 하지 않는다** —
   * 그때까지 「선택은 되는데 계산엔 없다」는 침묵만은 없앤다.
   */
  const lthdSpecial = all.filter((r) => LTHD_SPECIAL_REDUCTION_IDS.includes(r.type));
  if (lthdSpecial.length > 0 && input.warnings) {
    input.warnings.push(
      `선택하신 감면 ${lthdSpecial.length}건(장기보유특별공제 특례 — 조특법 §97의3①·§97의4①·§98의2①1호)은 ` +
        "이 계산에 반영되지 않았습니다. 겸용주택은 장기보유특별공제를 주택분·상가분·비사업용토지분으로 " +
        "나누어 산정하는데, 특례 공제율을 어느 부분에 어떻게 적용할지 정한 명문 규정이 없습니다.",
    );
  }
  if (deferred.length > 0 && input.warnings) {
    input.warnings.push(
      `선택하신 감면 ${deferred.length}건(소득금액 차감형)은 이 계산에 반영되지 않았습니다 — ` +
        "겸용주택은 양도소득금액이 주택분·상가분·비사업용토지분으로 나뉘는데, " +
        "차감형 감면을 어느 부분에서 차감할지 정한 명문 규정이 없습니다.",
    );
  }

  const result =
    taxCredit.length > 0
      ? calcReductions(
          calculatedTax,
          taxCredit,
          input.selfFarmingRules,
          undefined,
          undefined,
          undefined,
          undefined,
          input.transferDate,
          Math.max(0, aggregateIncome),
          basicDeduction,
          taxBase,
          input.acquisitionDate,
          /**
           * 13·14번(취득시·양도시 기준시가)은 **겸용에 입력 경로 자체가 없다** —
           * `CompanionAcqPurchaseBlock`이 겸용에서는 그 위젯을 숨기고 3분할 구조로 대체한다.
           * 인자만 채워도 undefined라 no-op이므로 의도적으로 비운다(조특령 §97의5② 안분
           * 차단은 호출부 문제가 아니라 겸용 입력 축 부재 — 별건).
           */
          undefined,
          undefined,
          // 15번 — 시한 기준일. 이것 하나가 실제로 세액을 가른다 (CB-05).
          input.assetContractDate,
        )
      : { reductionAmount: 0, reductionType: undefined, reductionTypeApplied: undefined };

  // 조특법 §133 한도 — 단건 finalize·§155⑳ 경로와 **같은 헬퍼**를 쓴다(복사하면 갈린다).
  const cap = applyReductionStatutoryCap({
    reductionAmount: result.reductionAmount,
    reductionTypeApplied: result.reductionTypeApplied,
    transferYear: input.transferDate.getFullYear(),
    priorUsage: input.priorReductionUsage ?? [],
  });
  const reductionAmount = Math.min(cap.cappedAmount, calculatedTax);

  // 농어촌특별세 — 세 경로 공용 판정표(농특세법 §5①1호 · 비과세는 시행령 §4 열거).
  const surtax = resolveTaxCreditRuralSurtax({
    reductionTypeApplied: result.reductionTypeApplied,
    reductionAmount,
    isSelfCultivatedExpropriatedLand: input.isSelfCultivatedExpropriatedLand,
  });

  // 가산세 — base(결정세액·미납세액)는 **여기서 주입**한다(호출부가 미리 알 수 없는 값이다).
  const determinedTax = Math.max(0, calculatedTax - reductionAmount);
  const penalty =
    input.filingPenaltyDetails || input.delayedPaymentDetails
      ? calculateTransferTaxPenalty({
          filing: input.filingPenaltyDetails
            ? { ...input.filingPenaltyDetails, determinedTax, reductionAmount }
            : undefined,
          delayedPayment: input.delayedPaymentDetails
            ? {
                ...input.delayedPaymentDetails,
                unpaidTax:
                  input.delayedPaymentDetails.unpaidTax === 0
                    ? determinedTax
                    : input.delayedPaymentDetails.unpaidTax,
              }
            : undefined,
        })
      : undefined;

  return {
    reductionAmount,
    ...(result.reductionType ? { reductionType: result.reductionType } : {}),
    reductionTypeApplied: result.reductionTypeApplied,
    reducibleIncome: result.reducibleIncome,
    aggregateReductionRate: result.aggregateReductionRate,
    reductionDetails: {
      publicExpropriationDetail: result.publicExpropriationDetail,
      gbDesignatedLandDetail: result.gbDesignatedLandDetail,
      replacementLandDetail: result.replacementLandDetail,
      selfFarmingReductionDetail: result.selfFarmingReductionDetail,
      rental97TaxDetail: result.rental97TaxDetail,
      newHousingReductionDetail: result.newHousingReductionDetail,
      rentalReductionDetail: result.rentalReductionDetail,
    },
    ruralSurtax: surtax.surtax,
    penaltyTax: penalty?.totalPenalty ?? 0,
    // 🔴 G-43: 산출근거 echo — 세액은 penaltyTax가 정본이고 여기서 다시 더하지 않는다.
    ...(penalty ? { penaltyDetail: penalty } : {}),
  };
}
