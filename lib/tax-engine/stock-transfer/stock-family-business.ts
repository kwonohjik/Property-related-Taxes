/**
 * 주식 양도 — 가업상속공제 자산 취득가액 특례 (소득세법 §97의2④ · 계획서 fb-97-2-4-fixes §7)
 *
 * 취득가액 = ⌊(피상속인 1주당 취득가액 × 주식수 + 피상속인 자본적지출) × 적용률⌋
 *          + ⌊상속개시일 현재 평가액 × (1 − 적용률)⌋        — 부동산과 같은 leaf(`calcFamilyBusinessImputedAcquisitionPrice`)
 *
 * - §97의2④는 본문 강제다(비교·선택 아님). 의제 취득가액은 이월과세 해소(`resolveStockCarryover`) **앞**에서 확정한다.
 * - 상증법 §18의2⑩ 양도소득세 상당액(상증령 §15㉑) = §97의2④를 적용한 세액 − §97을 적용한 세액.
 *   비교 세액은 **결정세액**(가산세 전 · 계획서 Q-6)이고, 다종목이면 **신고 단위 합계**다 —
 *   기본공제(§103①)가 그룹 단위 연 1회라 종목 단독 차이와 다르다(계획서 §7.2 F1-11).
 *   공제액은 이 양도세에서 빼지 않는다(상속세 쪽 공제 — echo만).
 * - 상속개시일 = `acquisitionDate`, 상속개시일 현재 평가액 = 실가 취득가액 입력(`actualAcquisitionTotal`).
 * - G-1 부칙(법률 제12169호) §12 — 상속개시일 2014.1.1. 전이면 특례 미적용 + 안내(부동산과 같은 게이트).
 * - 적용률 법정량은 양도일로 갈린다(부칙 대통령령 제36129호 §10): 2026.2.26. 이전 구 ③(공제금액 ÷ 가업상속 재산가액),
 *   2026.2.27. 이후 ③2호(법인 총자산가액 중 사업무관자산 외 비율). 주식은 법인가업의 대상 자산(④2호)이라 신 ③1호는 오지 않는다.
 *
 * 단건 취득(종목 축 `familyBusinessInheritance`)과 취득 lot 단위(`AcquisitionLot.familyBusinessInheritance` — 계획서 §7.7)를 모두 받는다.
 * lot 단위의 sub-lot 취득원가 계산은 `stock-family-business-lot.ts`, lot 배정은 `lot-allocation.ts`가 맡고,
 * 여기서는 입력 불변식·G-1 게이트·「전부 되돌린」 일반 입력(`regularInput`)·§18의2⑩ 비교만 한다.
 */

import type { StockTransferInput, StockTransferResult } from "./types/stock-transfer.types";
import type { StockFamilyBusinessDetail, StockFamilyBusinessLotSummary } from "./types/stock-family-business.types";
import { isForeignStockItem, type AggregateStockItemInput } from "./foreign-stock-aggregate-adapter";
import { actualAcquisitionTotal } from "./stock-actual-acquisition";
import { calcFamilyBusinessImputedAcquisitionPrice } from "../family-business-imputed-acquisition";
import { basisToFraction } from "../family-business-applied-rate";
import { isFamilyBusinessCgtEra } from "../data/family-business-cgt-era";
import { calcFamilyBusinessCgtCredit } from "../credits/family-business-cgt-credit";
import { INH } from "../legal-codes";
import { STOCK_FAMILY_BUSINESS } from "../legal-codes/stock-family-business";
import { fbFail, isActiveFbLot } from "./stock-family-business-lot";
import { stockFamilyBusinessInputError } from "./stock-family-business-input-check";

/** G-1 탈락 안내 — 부동산(`transfer-tax-family-business.ts`)과 같은 문장 */
export const STOCK_FB_PRE_2014_NOTICE =
  `가업상속공제 ${STOCK_FAMILY_BUSINESS.IMPUTED_ACQUISITION_PRICE} 의제 취득가액 특례 미적용 — 상속개시일이 2014.1.1. 전이라 「소득세법」 부칙(법률 제12169호) §12의 적용 대상이 아닙니다. 일반 §97 산식으로 계산되었습니다.`;

/** lot 단위 입력인데 가업 lot이 이 양도에 한 주도 배정되지 않았을 때 — 특례가 걸릴 대상이 없다 */
export const STOCK_FB_LOT_UNALLOCATED_NOTICE =
  `가업상속공제 ${STOCK_FAMILY_BUSINESS.IMPUTED_ACQUISITION_PRICE} 의제 취득가액 특례 미적용 — 가업상속 lot이 이번 양도의 매도에 배정되지 않았습니다. 일반 §97 산식으로 계산되었습니다.`;

type DetailBase = Omit<
  StockFamilyBusinessDetail,
  "cgtUnderSection97_2_4" | "cgtUnderSection97" | "creditAmount" | "creditBreakdown" | "fbItemCount"
>;

export type StockFamilyBusinessPlan =
  | { kind: "skipped"; input: StockTransferInput; warning: string }
  | {
      kind: "apply";
      imputedInput: StockTransferInput;
      regularInput: StockTransferInput;
      /** 단건은 계획 시점에 확정된다. lot 단위는 배정 뒤에야 정해져 undefined — 의제 실행 결과의 `familyBusinessSummary`로 만든다 */
      detailBase?: DetailBase;
      /** 의제 실행 결과에 덧붙일 안내(lot 단위 G-1 탈락 lot) */
      warnings: string[];
    };

/**
 * 엔진 진입 불변식 — route는 ⑨⑩⑫가 먼저 막는다. 엔진 직접 호출에서 조용히 틀린 값을 내지 않도록 throw한다
 * (분모 0 가드 — 계획서 L-3). 규칙은 ⑩ refine·⑧ validate와 **같은 술어**(`stock-family-business-input-check.ts`) 하나다.
 */
function assertStockFamilyBusinessInput(input: StockTransferInput): void {
  const error = stockFamilyBusinessInputError(input);
  if (error) fbFail(error);
}

/**
 * lot 단위 계획(계획서 §7.7 L-a·L-b) — 가업 lot이 하나도 없으면 null.
 * 의제 취득가는 lot 배정(`allocateLots`) 안에서 sub-lot마다 만들어지므로 여기서는 입력을 그대로 의제 실행에 싣고,
 * 일반 실행은 **모든 lot**의 가업 입력을 지운다(Q-11 — 함께 되돌림). G-1 탈락 lot은 `isActiveFbLot`이 걸러 일반 상속 lot으로 남는다.
 */
function planStockFamilyBusinessLots(input: StockTransferInput): StockFamilyBusinessPlan | null {
  const lots = input.acquisitionLots ?? [];
  const fbLots = lots.filter((l) => l.familyBusinessInheritance !== undefined);
  if (fbLots.length === 0) return null;
  assertStockFamilyBusinessInput(input);

  const regularInput: StockTransferInput = {
    ...input,
    acquisitionLots: lots.map((l) => (l.familyBusinessInheritance ? { ...l, familyBusinessInheritance: undefined } : l)),
  };
  const inactive = fbLots.filter((l) => !isActiveFbLot(l));
  if (inactive.length === fbLots.length) return { kind: "skipped", input: regularInput, warning: STOCK_FB_PRE_2014_NOTICE };
  return { kind: "apply", imputedInput: input, regularInput, warnings: inactive.length > 0 ? [STOCK_FB_PRE_2014_NOTICE] : [] };
}

/** lot 배정 요약 → 결과 상세 기반. 상단 `appliedRate`·`appliedRateBasis`는 첫 가업 lot 값이고 둘 이상이면 `lots[]`에 모두 있다. */
function lotDetailBase(s: StockFamilyBusinessLotSummary): DetailBase {
  const first = s.lots[0];
  return {
    imputedAcquisitionPrice: s.buyCost,
    appliedRate: first.appliedRate,
    appliedRateBasis: first.appliedRateBasis,
    decedentAcquisitionPrice: s.decedentPart,
    decedentAcquisitionPricePerShare: Math.floor(s.decedentPart / s.shares),
    shareCount: s.shares,
    inheritanceMarketValue: s.valuationPart,
    ...(s.capex ? { decedentCapitalExpenditure: s.capex } : {}),
    ...(s.lots.length > 1 ? { lots: s.lots } : {}),
    ...(s.pooled ? { pooled: true } : {}),
  };
}

/** 의제 실행 결과에서 상세 기반을 얻는다 — lot 계획에서 가업 lot이 한 주도 배정되지 않았으면 undefined */
function detailBaseOf(plan: Extract<StockFamilyBusinessPlan, { kind: "apply" }>, r: StockTransferResult): DetailBase | undefined {
  if (plan.detailBase) return plan.detailBase;
  const summary = r.lotMatchingDetail?.familyBusinessSummary;
  return summary ? lotDetailBase(summary) : undefined;
}

/** 종목 1건의 §97의2④ 계획 — `familyBusinessInheritance`가 없으면 null(기존 경로 그대로). */
export function planStockFamilyBusiness(input: StockTransferInput): StockFamilyBusinessPlan | null {
  const lotPlan = planStockFamilyBusinessLots(input);
  if (lotPlan) return lotPlan;
  const fb = input.familyBusinessInheritance;
  if (!fb) return null;
  assertStockFamilyBusinessInput(input);

  // 하류 파이프라인에는 실리지 않는다 — 재계산이 다시 이 분기를 타지 않게 한다.
  const stripped: StockTransferInput = { ...input, familyBusinessInheritance: undefined };
  if (!isFamilyBusinessCgtEra(input.acquisitionDate)) {
    return { kind: "skipped", input: stripped, warning: STOCK_FB_PRE_2014_NOTICE };
  }

  const { numerator, denominator } = basisToFraction(fb.fbRateBasis);
  const decedentAcquisitionPrice = fb.decedentAcquisitionPricePerShare * input.shareCount;
  const inheritanceMarketValue = actualAcquisitionTotal(input);
  const imputedAcquisitionPrice = calcFamilyBusinessImputedAcquisitionPrice(
    decedentAcquisitionPrice,
    inheritanceMarketValue,
    numerator / denominator,
    fb.decedentCapitalExpenditure ?? 0,
    fb.fbRateBasis,
  );

  return {
    kind: "apply",
    // 합계 모드로 주입한다 — 1주당으로 나누면 절사가 생긴다(`stock-actual-acquisition.ts` AT-1).
    imputedInput: { ...stripped, acquisitionActualInputMode: "total", acquisitionTotalPrice: imputedAcquisitionPrice },
    regularInput: stripped,
    warnings: [],
    detailBase: {
      imputedAcquisitionPrice,
      appliedRate: numerator / denominator,
      appliedRateBasis: fb.fbRateBasis,
      decedentAcquisitionPrice,
      decedentAcquisitionPricePerShare: fb.decedentAcquisitionPricePerShare,
      shareCount: input.shareCount,
      inheritanceMarketValue,
      ...(fb.decedentCapitalExpenditure ? { decedentCapitalExpenditure: fb.decedentCapitalExpenditure } : {}),
    },
  };
}

function buildDetail(
  base: DetailBase,
  imputedTax: number,
  regularTax: number,
  fbItemCount: number,
): StockFamilyBusinessDetail {
  const credit = calcFamilyBusinessCgtCredit(
    { cgtUnderSection97_2_4: imputedTax, cgtUnderSection97: regularTax },
    INH.FAMILY_BUSINESS_CGT_CREDIT,
  );
  return {
    ...base,
    cgtUnderSection97_2_4: imputedTax,
    cgtUnderSection97: regularTax,
    creditAmount: credit.creditAmount,
    creditBreakdown: credit.breakdown,
    fbItemCount,
  };
}

/**
 * 단건 — `run`은 오케스트레이터의 「이월과세 해소 → 내부 파이프라인」이다.
 * `familyBusinessInheritance`가 없으면 null(호출부가 기존 경로를 탄다).
 */
export function calculateStockFamilyBusiness(
  input: StockTransferInput,
  run: (i: StockTransferInput) => StockTransferResult,
): StockTransferResult | null {
  const plan = planStockFamilyBusiness(input);
  if (!plan) return null;
  if (plan.kind === "skipped") {
    const r = run(plan.input);
    return { ...r, warnings: [...r.warnings, plan.warning] };
  }
  const imputedRaw = run(plan.imputedInput);
  const imputed = plan.warnings.length > 0 ? { ...imputedRaw, warnings: [...imputedRaw.warnings, ...plan.warnings] } : imputedRaw;
  const detailBase = detailBaseOf(plan, imputed);
  if (!detailBase) return { ...imputed, warnings: [...imputed.warnings, STOCK_FB_LOT_UNALLOCATED_NOTICE] };
  const regular = run(plan.regularInput);
  return {
    ...imputed,
    familyBusinessDetail: buildDetail(detailBase, imputed.determinedTax ?? 0, regular.determinedTax ?? 0, 1),
  };
}

/**
 * 다종목 — §18의2⑩ 비교는 **신고 단위 결정세액 합계**의 차이 1회다(사용자 결정 2026-11-26).
 * 가업 종목 **전부**를 함께 §97(상속개시일 평가액)로 되돌린 합산과 견준다 — 종목마다 그 종목만 되돌리면
 * 한계 기여의 합이 총차이를 넘는다(리뷰 실측: 공제 합 98,875,000 > 의제 세액 94,375,000).
 * 종목별로 나누지 않는다 — 가업 종목마다 같은 신고 단위 값과 `fbItemCount`를 싣는다(자동 안분 금지).
 * `run`은 「이월과세 해소 → 합산 본체」, 결과 `items`는 입력 순서다.
 */
export function resolveAggregateFamilyBusiness<
  R extends { items: StockTransferResult[]; totalDeterminedTax: number },
>(inputs: AggregateStockItemInput[], run: (list: AggregateStockItemInput[]) => R): R {
  const plans = inputs.map((v) => (isForeignStockItem(v) ? null : planStockFamilyBusiness(v)));
  if (plans.every((p) => p === null)) return run(inputs);

  const base = inputs.map((v, i) => {
    const p = plans[i];
    if (!p) return v;
    return p.kind === "apply" ? p.imputedInput : p.input;
  });
  const result = run(base);
  // lot 계획은 가업 lot이 매도에 배정된 종목만 센다(`detailBaseOf`) — 배정 없는 종목은 의제·일반이 같다
  const detailBases = plans.map((p, i) => (p?.kind === "apply" ? detailBaseOf(p, result.items[i]) : undefined));
  const fbItemCount = detailBases.filter((b) => b !== undefined).length;
  const regularTotal =
    fbItemCount > 0
      ? run(base.map((v, i) => {
          const p = plans[i];
          return p?.kind === "apply" ? p.regularInput : v;
        })).totalDeterminedTax
      : 0;
  const items = result.items.map((r, i) => {
    const p = plans[i];
    if (!p) return r;
    if (p.kind === "skipped") return { ...r, warnings: [...r.warnings, p.warning] };
    const detailBase = detailBases[i];
    const warnings = [...r.warnings, ...p.warnings, ...(detailBase ? [] : [STOCK_FB_LOT_UNALLOCATED_NOTICE])];
    if (!detailBase) return { ...r, warnings };
    return {
      ...r,
      warnings,
      familyBusinessDetail: buildDetail(detailBase, result.totalDeterminedTax, regularTotal, fbItemCount),
    };
  });
  return { ...result, items };
}
