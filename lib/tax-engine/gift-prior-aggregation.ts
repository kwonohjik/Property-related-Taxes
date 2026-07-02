/**
 * 증여세 사전증여 합산 헬퍼 (상증법 §47 ② 동일인 그룹화)
 *
 * Phase A — donor 식별자 도입 + §58 안분 한도 + §57 한도 산식 분자 산정.
 *
 * 그룹 매핑:
 *   A: father, mother           — 부모 (§47 ② 동일인)
 *   B: grandparent              — 조부모 (§47 ② 동일인, §57 세대생략 대상)
 *   C: spouse
 *   D: lineal_descendant
 *   E: sibling
 *   F: other_relative
 *   G: other
 *
 * Pure function. DB 호출 없음. UI display 책임 없음.
 */

import { isBefore, parseISO, subYears } from "date-fns";
import { GIFT } from "./legal-codes";
import { safeMultiplyThenDivide } from "./tax-utils";
import type {
  GiftDonorRelation,
  DonorGroup,
  PriorGift,
  CalculationStep,
} from "./types/inheritance-gift.types";

// ============================================================
// 그룹 매핑
// ============================================================

export function getDonorGroup(donor: GiftDonorRelation): DonorGroup {
  switch (donor) {
    case "father":
    case "mother":
      return "A";
    case "grandparent":
      return "B";
    case "spouse":
      return "C";
    case "lineal_descendant":
      return "D";
    case "sibling":
      return "E";
    case "other_relative":
      return "F";
    case "other":
      return "G";
  }
}

export function isSameDonorGroup(
  a: GiftDonorRelation,
  b: GiftDonorRelation,
): boolean {
  return getDonorGroup(a) === getDonorGroup(b);
}

/**
 * §71⑥ — §47② 합산 가액. 감면농지 회차(farmlandReductionApplied)이고 과세부분(㉯)이 설정되면
 * giftAmount(전액) 대신 ㉯(farmlandTaxablePortion)로 합산 (감면부분 ㉮ 제외, 조특법 §71⑥).
 * 미설정/비감면이면 giftAmount 전액 (2차 = 재재산-1454 불변). 예규 재산세과-2450·법규재산-2314.
 */
function priorAggregatedValue(p: PriorGift): number {
  return p.farmlandReductionApplied && p.farmlandTaxablePortion != null
    ? p.farmlandTaxablePortion
    : p.giftAmount;
}

// ============================================================
// 합산 결과 타입
// ============================================================

export interface PriorAggregationResult {
  /** 그룹 일치 + 10년 이내 사전증여 (giftDate 내림차순) */
  matchedPriorGifts: PriorGift[];
  /** §47 합산 ① 누계 (= 신고서 ③) */
  totalAmount: number;
  /** 합산 회차들의 giftTaxPaid 합 (정보용) */
  totalTaxPaid: number;
  /**
   * 가장 최근 합산 회차의 ⑦ (§58 ⑭/⑧ 분자용).
   * 합산 대상 없으면 0.
   */
  totalComputedTax: number;
  /**
   * R-6 재차증여 체인 drop-out: 직전회차(matched[0])가 그 자신의 사전증여를 합산했고,
   * 그 사전증여가 금번 증여의 §47② cutoff(10년)에서 탈락한 경우 true.
   * (예: 1차 2013·2차 2020·3차 2024 → 1차는 3차 10년 밖·2차 10년 내. 재재산-610.)
   */
  priorRoundHadDropout: boolean;
  /**
   * drop-out 시 가산재산 산출세액 ⑭ = matched[0].computedTax − 탈락한 직전 사전증여 computedTax.
   * 직전회차 전체값(totalComputedTax)이 아닌 그 회차의 순증 산출세액 (§58 ⑭ 정합).
   * drop-out 없으면 totalComputedTax와 동일.
   */
  marginalPriorComputedTax: number;
  /**
   * 증여자 사망 합산제외 (서일46014-11750): 사망으로 §47② 합산에서 빠진 prior가
   * 직전회차(matched[0])에 함께 합산됐던 경우 true → ⑧을 곱셈 안분으로 보정.
   * R-6 drop-out(뺄셈)과 배타 — gift-tax STEP 6.5에서 `if(deceased) else if(dropout)`.
   */
  priorRoundHadDeceasedExclusion: boolean;
  /**
   * 사망 안분 시 가산재산 산출세액 ⑧ = 직전회차 ⑦ × 생존(모)분 가액 / (생존분 + 사망제외분) gross.
   * 사망 제외 없으면 totalComputedTax와 동일.
   */
  deceasedMarginalComputedTax: number;
  /** 사망 안분 분자 = 생존 증여자(모)분 증여재산가액 (결과 echo). */
  deceasedSurvivingPriorAmount: number;
  /** 사망 안분 분모 = 부·모 합산 증여재산가액(gross) (결과 echo). */
  deceasedAggregationDenominator: number;
  /**
   * 가장 최근 합산 회차의 ⑤ = giftTaxBase (§58·§57 한도 산식 분자).
   * 합산 대상 없으면 0.
   */
  priorAddedTaxBase: number;
  /** 사전증여 회차들의 ⑫ 누계 = Σ⑫_prior (§57 ⑨용) */
  totalAdditionalSurcharge: number;
  /**
   * 부모 제외 직계존속 ① 누계.
   * 그룹 B (조부모) 합산 시 totalAmount와 동일, 그 외 0.
   */
  nonParentLinealAmount: number;
  breakdown: CalculationStep[];
  /** 다른 그룹 priorGifts 무시 안내 등 */
  warnings: string[];
}

// ============================================================
// 합산 함수
// ============================================================

/**
 * 동일인 §47 ② 합산 + §58·§57 한도 산식용 데이터 추출.
 *
 * @param priorGifts 사용자가 입력한 사전증여 전체
 * @param giftDate 금번 증여일 (10년 경과 필터링 기준)
 * @param currentDonor 금번 증여자 (그룹 일치 필터링 기준)
 */
export function aggregatePriorGiftsForGift(
  priorGifts: PriorGift[],
  giftDate: string,
  currentDonor: GiftDonorRelation,
): PriorAggregationResult {
  // 날짜 비교 전부 parseISO(local 자정)로 통일 — new Date(UTC 자정)와 혼용 시
  // 사망 당일 경계가 타임존(KST)에서 오작동. CLAUDE.md "new Date 직접 호출 금지" 정책 부합.
  const current = parseISO(giftDate);
  // §47②: "해당 증여일 전 10년 이내에 동일인으로부터 받은 증여재산가액"
  // boundary = subYears(증여일, 10). 경계일 당일 포함, 전일 제외 (민법 §160②).
  // 수정: differenceInYears(만 연수 절사 버그) → isBefore(일 단위, 경계일 전일 제외).
  const boundary47 = subYears(current, 10);
  const matched: PriorGift[] = [];
  const warnings: string[] = [];

  for (const gift of priorGifts) {
    // §30의5⑪·§30의6⑤: 조특법 특례 prior (specialTreatmentType 설정)는
    // §47② 일반 합산에서 제외 — 특례 스트림에서 기간무관 별도 합산됨.
    if (gift.specialTreatmentType !== undefined) {
      warnings.push(
        `사전증여 ${gift.giftDate} — 조특법 특례(${gift.specialTreatmentType}) 적용 prior → §47② 일반 합산 제외, 특례 스트림에서 기간무관 합산됨 (§30의5⑪)`,
      );
      continue;
    }

    // 사전증여일이 boundary보다 이전이면 도과(10년 초과) → 제외
    if (isBefore(parseISO(gift.giftDate), boundary47)) continue;

    if (!gift.donor) {
      warnings.push(
        `사전증여 ${gift.giftDate} — donor 미입력으로 §47 합산 제외`,
      );
      continue;
    }

    if (!isSameDonorGroup(gift.donor, currentDonor)) {
      warnings.push(
        `사전증여 ${gift.giftDate} (증여자=${gift.donor})는 현 증여자(${currentDonor})와 다른 동일인 그룹 — §47 합산 제외, 별개 신고 대상`,
      );
      continue;
    }

    // 증여자 사망 합산제외 (재산-58·재삼46014-1228): 금번 증여일 전에 그 회차 증여자가
    // 사망하면 사망자 생전 증여재산은 §47② 합산 제외 (동일그룹이라도 사망분만 선별).
    // 사망일 ≥ 금번 증여일(증여 후 사망)은 무효 → 합산 유지.
    if (
      gift.donorDeceasedDate &&
      isBefore(parseISO(gift.donorDeceasedDate), current)
    ) {
      warnings.push(
        `사전증여 ${gift.giftDate} (증여자=${gift.donor}) — 증여자가 금번 증여일 전 사망(${gift.donorDeceasedDate}) → §47② 합산 제외 (재산-58·재삼46014-1228)`,
      );
      continue;
    }

    matched.push(gift);
  }

  // giftDate 내림차순: 첫 번째가 가장 최근
  matched.sort((a, b) => b.giftDate.localeCompare(a.giftDate));

  const totalAmount = matched.reduce((s, p) => s + priorAggregatedValue(p), 0);
  const totalTaxPaid = matched.reduce((s, p) => s + p.giftTaxPaid, 0);
  const totalComputedTax = matched[0]?.computedTax ?? 0;
  const priorAddedTaxBase = matched[0]?.giftTaxBase ?? 0;

  // R-6: 재차증여 체인 drop-out 감지 (재재산-610)
  //   직전회차(matched[0])가 그 자신의 사전증여를 합산했고, 그 사전증여가 금번 cutoff(boundary47)에서
  //   탈락한 경우 → matched[0].computedTax는 그 사전증여분을 포함 → 가산재산 산출세액 ⑭은 순증분으로 축소.
  let priorRoundHadDropout = false;
  let marginalPriorComputedTax = totalComputedTax;
  const mostRecent = matched[0];
  if (mostRecent) {
    const subBoundary47 = subYears(parseISO(mostRecent.giftDate), 10); // 직전회차의 10년 창
    // 금번 cutoff 탈락(boundary47 이전) + 직전회차 10년 내 + 직전회차보다 이전 + 동일 그룹
    const droppedSubPrior = priorGifts
      .filter((g) => {
        if (g.specialTreatmentType !== undefined) return false;
        if (!g.donor || !isSameDonorGroup(g.donor, currentDonor)) return false;
        const d = parseISO(g.giftDate);
        return (
          isBefore(d, boundary47) && // 금번 10년 밖 (matched에서 탈락)
          !isBefore(d, subBoundary47) && // 직전회차 10년 내 (직전 합산에 포함됐던 회차)
          g.giftDate < mostRecent.giftDate // 직전회차보다 이전
        );
      })
      .sort((a, b) => b.giftDate.localeCompare(a.giftDate))[0]; // 가장 최근
    if (droppedSubPrior) {
      priorRoundHadDropout = true;
      marginalPriorComputedTax = Math.max(
        0,
        (mostRecent.computedTax ?? 0) - (droppedSubPrior.computedTax ?? 0),
      );
    }
  }

  // 증여자 사망 합산제외 — 곱셈 안분 marginal (서일46014-11750)
  //   사망으로 §47② 합산에서 빠진 prior가 직전회차(matched[0])에 함께 합산됐던 경우,
  //   ⑧ = 직전회차 ⑦ × 생존(모)분 가액 / (생존분 + 사망제외분) gross 가액.
  //   분모 = 부·모 합산 증여재산가액(gross) — 서일46014-11750 동결. R-6 뺄셈과 별개(STEP 6.5 배타).
  //   C4a 가드: 직전회차 본인이 사망자면 matched에서 제외돼 mostRecent 부재 → 분기 미진입.
  let priorRoundHadDeceasedExclusion = false;
  let deceasedMarginalComputedTax = totalComputedTax;
  let deceasedSurvivingPriorAmount = 0;
  let deceasedAggregationDenominator = 0;
  if (mostRecent) {
    const subBoundaryDeceased = subYears(parseISO(mostRecent.giftDate), 10); // 직전회차 합산창
    const deceasedDropped = priorGifts.filter((g) => {
      if (g.specialTreatmentType !== undefined) return false;
      if (!g.donor || !isSameDonorGroup(g.donor, currentDonor)) return false;
      if (!g.donorDeceasedDate) return false;
      if (!isBefore(parseISO(g.donorDeceasedDate), current)) return false; // 금번 전 사망
      // 직전회차 증여일 당시 생존해야 그 회차 ⑦(부·모 합산)에 포함됨 — 그 전 사망이면 이미 제외돼
      // 곱셈안분 분모(gross)에 넣으면 ⑧ 과소 산정(서일46014-11750 '직전회차=합산' 전제 불성립).
      if (isBefore(parseISO(g.donorDeceasedDate), parseISO(mostRecent.giftDate))) return false;
      const d = parseISO(g.giftDate);
      return (
        !isBefore(d, subBoundaryDeceased) && // 직전회차 10년 내 (직전 합산에 포함됐던 회차)
        g.giftDate < mostRecent.giftDate // 직전회차보다 이전
      );
    });
    if (deceasedDropped.length > 0) {
      priorRoundHadDeceasedExclusion = true;
      // 서일46014-11750 분모는 "부·모 합산 gross 증여재산가액" — 분자(생존분)도 동일 gross 기준으로
      // 통일해야 안분비 정합 (생존자가 감면농지 회차일 때 ㉯ 치환으로 분자만 축소되는 비대칭 방지).
      deceasedSurvivingPriorAmount = mostRecent.giftAmount; // 생존(모)분 gross 가액
      const deceasedSum = deceasedDropped.reduce((s, g) => s + g.giftAmount, 0);
      deceasedAggregationDenominator = deceasedSurvivingPriorAmount + deceasedSum;
      deceasedMarginalComputedTax =
        deceasedAggregationDenominator > 0
          ? safeMultiplyThenDivide(
              mostRecent.computedTax ?? 0,
              deceasedSurvivingPriorAmount,
              deceasedAggregationDenominator,
            )
          : (mostRecent.computedTax ?? 0);
    }
  }

  const totalAdditionalSurcharge = matched.reduce(
    (s, p) => s + (p.additionalGenerationSkipSurcharge ?? 0),
    0,
  );
  const nonParentLinealAmount =
    getDonorGroup(currentDonor) === "B" ? totalAmount : 0;

  const breakdown: CalculationStep[] = matched.map((p) => ({
    label:
      p.farmlandReductionApplied && p.farmlandTaxablePortion != null
        ? `§47 합산 (${p.giftDate}, 증여자=${p.donor}, §71⑥ 농지 과세부분 ㉯)`
        : `§47 합산 (${p.giftDate}, 증여자=${p.donor})`,
    amount: priorAggregatedValue(p),
    lawRef: GIFT.AGGREGATION_SAME_PERSON,
  }));

  return {
    matchedPriorGifts: matched,
    totalAmount,
    totalTaxPaid,
    totalComputedTax,
    priorRoundHadDropout,
    marginalPriorComputedTax,
    priorRoundHadDeceasedExclusion,
    deceasedMarginalComputedTax,
    deceasedSurvivingPriorAmount,
    deceasedAggregationDenominator,
    priorAddedTaxBase,
    totalAdditionalSurcharge,
    nonParentLinealAmount,
    breakdown,
    warnings,
  };
}

// ============================================================
// 도출 헬퍼 — wasGenerationSkip 자동 도출 (PriorGift.wasGenerationSkip 미입력 시)
// ============================================================

export function resolveWasGenerationSkip(
  donor: GiftDonorRelation | undefined,
  explicit: boolean | undefined,
): boolean {
  if (explicit !== undefined) return explicit;
  return donor === "grandparent";
}
