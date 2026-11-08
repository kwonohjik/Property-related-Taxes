/**
 * P3 하이브리드 감면 — §98의3 · §98의5 · §98의6 (2026-06-12)
 *
 * P2 코어(unsold-hybrid.ts computeHybridEffect)에 rate 일반화로 합류:
 * - §98의3: 서울 밖(지정지역 제외) 미분양 — 100% (수도권과밀억제권역 60%, 대지 660·연면적(전용)
 *   149 이내 한정 — 령 §98의3①단서, 과밀 판정 = 매매계약일 현재 령④). 거주자 2009.2.12~2010.2.11 /
 *   국내사업장 없는 비거주자 2009.3.16~2010.2.11. ② 자기건설(동기간 착공+사용승인, 조합원·멸실 제외).
 *   농특세 비과세 (농특세령 §4⑦1호).
 * - §98의5: 2010.2.11 현재 수도권 밖 미분양 — ~2011.4.30 최초 매매계약. 감면율 = 분양가 인하율별
 *   (≤10% 60% / ≤20% 80% / >20% 100% — 법 ①각호). 위임령 = 조번호 어긋난 령 §98의4 (원문 확정).
 *   농특세 비과세.
 * - §98의6: 준공후미분양 (사용검사·승인 후 2011.3.29 현재 미계약+선착순 — 령 §98의5②) — 50%.
 *   1호: 사업주체등이 ~2011.12.31 임대계약+2년 임대 후 최초 매매계약 취득 (5년 내 50% 세액감면 가능)
 *   2호: 최초 매매계약 취득 후 5년 임대 (등록 후 기산 령⑤ — 5년 내 세액감면 없음, 법 ① "제1호 한정")
 *   제외: 기준시가 합계 6억 초과 또는 연면적(전용) 149 초과 (취득/최초 임대개시 당시 — 령② 단서).
 *   농특세 과세.
 * - 공통 특칙 (법 §98의3④·§98의5③·§98의6③): 장특 표1(§95②단서 시 표2) + 세율 §104①1호 강제 —
 *   suppressShortTermRate 주입 (transfer-tax.ts STEP 7). 중과 배제 = 소령 §167의3①5호.
 *
 * ── 조문별 분리 (동작 변경 없음 — 순수 이동, 747줄 → 조문별 파일) ──
 * - §98의3 상수·`Unsold983Input`·`evaluateUnsold983` → `unsold-98-3.ts`
 * - §98의5 상수·`Unsold985Input`·`resolve985Rate`·`evaluateUnsold985` → `unsold-98-5.ts`
 * - §98의6 상수·`Unsold986Input`·`evaluateUnsold986` → `unsold-98-6.ts`
 * - 이 파일에 남은 것: 공용 ID 목록(LTHD_SPECIAL_REDUCTION_IDS·RATE_SPECIAL_REDUCTION_IDS·ALL_HYBRID_IDS)과
 *   통합 dispatcher(evaluateAnyHybridTaxAmount·evaluateAnyHybridFromReduction).
 *   옮긴 이름은 아래에서 같은 이름으로 재수출하므로 기존 import 경로(`./unsold-hybrid-p3`)는 그대로 쓴다.
 */

import { applyRate as applyHybridRate } from "../tax-utils";
import { evaluateP4FromReduction } from "./unsold-hybrid-p4";
import { evaluateP5FromReduction } from "./unsold-hybrid-p5";
import {
  evaluateHybridFromReduction as evaluateP2HybridFromReduction,
  toHybridDate,
  type HybridEvalContext,
  type ReductionLike,
  type UnsoldHybridResult,
} from "./unsold-hybrid";
import { evaluateUnsold983 } from "./unsold-98-3";
import type { Unsold983Input } from "./unsold-98-3";
import { evaluateUnsold985 } from "./unsold-98-5";
import { evaluateUnsold986 } from "./unsold-98-6";
import type { Unsold986Input } from "./unsold-98-6";

// ── 조문별 파일로 옮긴 이름 재수출 (기존 import 경로 유지) ──
export {
  UNSOLD_98_3_PERIOD_FROM_RESIDENT,
  UNSOLD_98_3_PERIOD_FROM_NONRESIDENT,
  UNSOLD_98_3_PERIOD_TO,
  UNSOLD_98_3_OVERCON_LAND_LIMIT,
  UNSOLD_98_3_OVERCON_FLOOR_LIMIT,
  UNSOLD_98_3_OVERCON_RATE,
  evaluateUnsold983,
  type Unsold983Input,
} from "./unsold-98-3";
export {
  UNSOLD_98_5_CONTRACT_TO,
  UNSOLD_98_5_CONTRACT_FROM,
  resolve985Rate,
  evaluateUnsold985,
  type Unsold985Input,
} from "./unsold-98-5";
export {
  UNSOLD_98_6_RENTAL_CONTRACT_TO,
  UNSOLD_98_6_RATE,
  UNSOLD_98_6_STD_SUM_LIMIT,
  UNSOLD_98_6_FLOOR_LIMIT,
  UNSOLD_98_6_RENTAL_MONTHS,
  evaluateUnsold986,
  type Unsold986Input,
} from "./unsold-98-6";

/**
 * **장기보유특별공제 계열 특례** — 감면세액이 아니라 **LTHD 공제율 자체**를 바꾸는 조문 (CB-02·D5-05).
 *
 * 감면 효과는 실제로 3종이다 — 차감형(소득금액 차감) · 세액감면형(산출세액 차감) · **LTHD 계열**.
 * 그런데 겸용주택·§155⑳ 경로는 `!ALL_INCOME_DEDUCTION_IDS.has(type)`라는 **이분법**으로만
 * 갈라서, 세 번째가 자리를 못 찾고 세액감면형 버킷으로 흘러 `calcReductions`에서 **조용히
 * 사라진다**. 재개발 경로는 아예 `calcLongTermHoldingDeduction`을 부르지 않는다
 * (`transfer-tax.ts`의 유일한 호출부에 도달하지 못함 — 조기반환).
 *
 * ⚠️ **세액 반영은 아직 하지 않는다.** §97의3⑤(임대기간분 안분)·§98의2①1호(표2)를 소령 §166⑤의
 *   3분기 LTHD 구조(인가전·인가후 기존건물·청산금)와 어떻게 결합할지는 **별도 법적 판단**이
 *   필요하다 — 전체 양도차익 기준인지 파트별인지가 조문에서 곧바로 나오지 않는다.
 *   그때까지는 **침묵을 없애는 것**이 최소 조치다: 세 경로가 이 집합을 보고 경고를 남긴다.
 */
export const LTHD_SPECIAL_REDUCTION_IDS: ReadonlyArray<string> = [
  "rental_97_3", // 조특법 §97의3① — 임대기간분 70%(8년) / 조특령 §97의3② 후단이 재개발 임대의제를 명문화
  "rental_97_4", // 조특법 §97의4① — 6년 이상 임대 시 표1에 2~10%p 가산
  "unsold_98_2", // 조특법 §98의2①1호 — 양도차익 × 소득세법 §95② **표2** 공제율
];

/** 특칙 — 단기세율(§104①2·3호) 배제 대상 (법 §98의2①·§98의3④·§98의5③·§98의6③ 각 2호) */
export const RATE_SPECIAL_REDUCTION_IDS: ReadonlyArray<string> = [
  "unsold_98_3",
  "unsold_98_5",
  "unsold_98_6",
  "unsold_98_2",
];

// ─────────────────────────────────────────────────────────────────
// 통합 dispatcher — P2 + P3 (router·calcReductions 진입점)
// ─────────────────────────────────────────────────────────────────

export const ALL_HYBRID_IDS: ReadonlyArray<string> = [
  "unsold_98_7",
  "unsold_99_2",
  "unsold_98_3",
  "unsold_98_5",
  "unsold_98_6",
  "unsold_98_2",
  "unsold_98_4",
  "unsold_98",
];

/**
 * calcReductions 진입점 (P2+P3 통합) — 5년 내 세액감면 후보 (§127⑦ max 패턴).
 * eligible && tax_amount일 때만 reductionAmount = 산출세액 × rate 채움.
 */
/**
 * ⚠️ `calcReductions`의 **유일한** 하이브리드 세액감면 진입점이다 (D5-07).
 * 종전에는 `unsold-hybrid.ts`에 §98의7·§99의2 2조문만 찾는 동명이형 래퍼
 * `evaluateHybridTaxAmountFromReductions`가 남아 자신도 「calcReductions 진입점」이라고
 * 주석으로 단언했다 — 배럴에서 그쪽을 import하면 나머지 6조문이 조용히 감면 0이 됐다.
 * 그 래퍼는 삭제했다. 새 계산 경로를 배선할 때는 반드시 이 함수를 쓸 것.
 */
export function evaluateAnyHybridTaxAmount(
  reductions: ReadonlyArray<{ type: string }> | undefined,
  ctx: {
    transferDate: Date;
    acquisitionDate?: Date;
    assetContractDate?: Date;
    calculatedTax: number;
  },
): UnsoldHybridResult | undefined {
  if (!reductions || !ctx.acquisitionDate) return undefined;
  const r = reductions.find((x) => ALL_HYBRID_IDS.includes(x.type)) as ReductionLike | undefined;
  if (!r) return undefined;
  const detail = evaluateAnyHybridFromReduction(r, {
    transferDate: ctx.transferDate,
    acquisitionDate: ctx.acquisitionDate,
    assetContractDate: ctx.assetContractDate,
    transferIncome: 0, // tax_amount 판정에는 소득금액 불요 (5년 후 경로는 router가 담당)
  });
  if (!detail) return undefined;
  if (detail.isEligible && detail.effectCategory === "tax_amount") {
    return { ...detail, reductionAmount: applyHybridRate(ctx.calculatedTax, detail.taxReductionRate) };
  }
  return detail;
}

export function evaluateAnyHybridFromReduction(
  r: ReductionLike,
  ctx: HybridEvalContext,
): UnsoldHybridResult | undefined {
  if (r.type === "unsold_98_3") {
    return evaluateUnsold983({
      transferDate: ctx.transferDate,
      acquisitionDate: ctx.acquisitionDate,
      residencyType: r.residencyType983 as Unsold983Input["residencyType"],
      houseType: r.houseType983 as Unsold983Input["houseType"],
      contractDate: toHybridDate(r.contractDate983) ?? ctx.assetContractDate,
      downPaymentCompletedDate: toHybridDate(r.downPaymentCompletedDate983),
      constructionStartDate: toHybridDate(r.constructionStartDate983),
      usageApprovalDate: toHybridDate(r.usageApprovalDate983),
      isOutsideSeoulNotDesignated: r.isOutsideSeoulNotDesignated983 as boolean | undefined,
      isOverconcentration: r.isOverconcentration983 as boolean | undefined,
      landAreaSqm: r.landAreaSqm983 as number | undefined,
      floorAreaSqm: r.floorAreaSqm983 as number | undefined,
      isUnsoldConfirmed: r.isUnsoldConfirmed983 as boolean | undefined,
      isFirstContract: r.isFirstContract983 as boolean | undefined,
      isNotOccupiedAtContract: r.isNotOccupiedAtContract983 as boolean | undefined,
      isNotRecontract: r.isNotRecontract983 as boolean | undefined,
      isNotExcludedSelfBuilt: r.isNotExcludedSelfBuilt983 as boolean | undefined,
      transferIncome: ctx.transferIncome,
      standardPriceAtAcquisition: r.standardPriceAtAcquisition983 as number | undefined,
      standardPriceAt5Years: r.standardPriceAt5Years983 as number | undefined,
      standardPriceAtTransfer:
        (r.standardPriceAtTransfer983 as number | undefined) ?? ctx.standardPriceAtTransfer,
    });
  }
  if (r.type === "unsold_98_5") {
    return evaluateUnsold985({
      transferDate: ctx.transferDate,
      acquisitionDate: ctx.acquisitionDate,
      contractDate: toHybridDate(r.contractDate985) ?? ctx.assetContractDate,
      priceReductionRatePct: r.priceReductionRatePct985 as number | undefined,
      isNonCapitalUnsoldAtCutoff: r.isNonCapitalUnsoldAtCutoff985 as boolean | undefined,
      isFirstContract: r.isFirstContract985 as boolean | undefined,
      isEligibleSubject: (r.isEligibleSubject985 as boolean | undefined) ?? true,
      isNotOccupiedAtContract: r.isNotOccupiedAtContract985 as boolean | undefined,
      isNotRecontract: r.isNotRecontract985 as boolean | undefined,
      transferIncome: ctx.transferIncome,
      standardPriceAtAcquisition: r.standardPriceAtAcquisition985 as number | undefined,
      standardPriceAt5Years: r.standardPriceAt5Years985 as number | undefined,
      standardPriceAtTransfer:
        (r.standardPriceAtTransfer985 as number | undefined) ?? ctx.standardPriceAtTransfer,
    });
  }
  if (r.type === "unsold_98_6") {
    return evaluateUnsold986({
      transferDate: ctx.transferDate,
      acquisitionDate: ctx.acquisitionDate,
      hoType: r.hoType986 as Unsold986Input["hoType"],
      isEligibleSubject: (r.isEligibleSubject986 as boolean | undefined) ?? true,
      stdPriceSumAtBase: r.stdPriceSumAtBase986 as number | undefined,
      floorAreaSqm: r.floorAreaSqm986 as number | undefined,
      isUnsoldAfterCompletion: r.isUnsoldAfterCompletion986 as boolean | undefined,
      isFirstContract: r.isFirstContract986 as boolean | undefined,
      isNotOccupiedAfterCompletion: r.isNotOccupiedAfterCompletion986 as boolean | undefined,
      isNotRecontract: r.isNotRecontract986 as boolean | undefined,
      sellerRented2Years: r.sellerRented2Years986 as boolean | undefined,
      rentalContractDate: toHybridDate(r.rentalContractDate986),
      rentalStartDate: toHybridDate(r.rentalStartDate986),
      rentalEndDate: toHybridDate(r.rentalEndDate986),
      inheritedRentalMonths: r.inheritedRentalMonths986 as number | undefined,
      transferIncome: ctx.transferIncome,
      standardPriceAtAcquisition: r.standardPriceAtAcquisition986 as number | undefined,
      standardPriceAt5Years: r.standardPriceAt5Years986 as number | undefined,
      standardPriceAtTransfer:
        (r.standardPriceAtTransfer986 as number | undefined) ?? ctx.standardPriceAtTransfer,
    });
  }
  // P5 (§98) → P4 (§98의2·§98의4) → P2 (§98의7·§99의2) 순 위임
  return (
    evaluateP5FromReduction(r, ctx) ??
    evaluateP4FromReduction(r, ctx) ??
    evaluateP2HybridFromReduction(r, ctx)
  );
}
