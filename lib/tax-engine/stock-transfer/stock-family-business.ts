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
 * 이 PR은 단건 취득만 받는다. lot 단위는 PR-1b′.
 */

import type { StockTransferInput, StockTransferResult } from "./types/stock-transfer.types";
import type { StockFamilyBusinessDetail } from "./types/stock-family-business.types";
import { isForeignStockItem, type AggregateStockItemInput } from "./foreign-stock-aggregate-adapter";
import { actualAcquisitionTotal } from "./stock-actual-acquisition";
import { isSplitMode } from "./stock-transfer-helpers";
import { calcFamilyBusinessImputedAcquisitionPrice } from "../family-business-imputed-acquisition";
import { basisToFraction, familyBusinessRateBasisError } from "../family-business-applied-rate";
import { isFamilyBusinessCgtEra, isFamilyBusinessAssetScopeDecreeEra } from "../data/family-business-cgt-era";
import { calcFamilyBusinessCgtCredit } from "../credits/family-business-cgt-credit";
import { INH } from "../legal-codes";
import { STOCK_FAMILY_BUSINESS } from "../legal-codes/stock-family-business";

/** G-1 탈락 안내 — 부동산(`transfer-tax-family-business.ts`)과 같은 문장 */
export const STOCK_FB_PRE_2014_NOTICE =
  `가업상속공제 ${STOCK_FAMILY_BUSINESS.IMPUTED_ACQUISITION_PRICE} 의제 취득가액 특례 미적용 — 상속개시일이 2014.1.1. 전이라 「소득세법」 부칙(법률 제12169호) §12의 적용 대상이 아닙니다. 일반 §97 산식으로 계산되었습니다.`;

type DetailBase = Omit<
  StockFamilyBusinessDetail,
  "cgtUnderSection97_2_4" | "cgtUnderSection97" | "creditAmount" | "creditBreakdown" | "fbItemCount"
>;

export type StockFamilyBusinessPlan =
  | { kind: "skipped"; input: StockTransferInput; warning: string }
  | { kind: "apply"; imputedInput: StockTransferInput; regularInput: StockTransferInput; detailBase: DetailBase };

const isPosInt = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v) && v > 0;
const isNonNegInt = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v) && v >= 0;

/**
 * 엔진 진입 불변식 — route는 ⑨⑩⑫가 먼저 막는다. 엔진 직접 호출에서 조용히 틀린 값을 내지 않도록 throw한다
 * (분모 0 가드 — 계획서 L-3).
 */
function assertStockFamilyBusinessInput(input: StockTransferInput): void {
  const fb = input.familyBusinessInheritance!;
  const fail = (msg: string): never => {
    throw new Error(`가업상속공제(${STOCK_FAMILY_BUSINESS.IMPUTED_ACQUISITION_PRICE}) — ${msg}`);
  };
  if (input.acquisitionCause !== "inheritance") fail("취득원인이 상속인 주식에만 적용합니다.");
  if (input.acquisitionMode !== "actual") fail("취득가액을 실지거래가액(상속개시일 현재 평가액)으로 입력한 경우에만 적용합니다.");
  if (isSplitMode(input)) fail("취득 lot 단위 입력은 아직 지원하지 않습니다.");
  if (!isPosInt(fb.decedentAcquisitionPricePerShare)) fail("피상속인의 1주당 취득가액은 0보다 큰 원 단위 금액이어야 합니다.");
  if (fb.decedentCapitalExpenditure !== undefined && !isNonNegInt(fb.decedentCapitalExpenditure))
    fail("피상속인 자본적지출은 0 이상의 원 단위 금액이어야 합니다.");
  const basisError = familyBusinessRateBasisError(fb.fbRateBasis, undefined);
  if (basisError) fail(basisError);
  const newDecree = isFamilyBusinessAssetScopeDecreeEra(input.transferDate);
  if (newDecree !== (fb.fbRateBasis.kind === "corporate_business_assets")) {
    fail(
      newDecree
        ? `양도일이 2026.2.27. 이후이면 적용률은 법인 총자산가액과 사업무관자산가액으로 계산합니다(${STOCK_FAMILY_BUSINESS.APPLIED_RATE_CORPORATE_ASSETS}).`
        : "양도일이 2026.2.26. 이전이면 적용률은 가업상속공제금액과 가업상속 재산가액으로 계산합니다(구 소득세법 시행령 §163의2③).",
    );
  }
}

/** 종목 1건의 §97의2④ 계획 — `familyBusinessInheritance`가 없으면 null(기존 경로 그대로). */
export function planStockFamilyBusiness(input: StockTransferInput): StockFamilyBusinessPlan | null {
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
  const imputed = run(plan.imputedInput);
  const regular = run(plan.regularInput);
  return {
    ...imputed,
    familyBusinessDetail: buildDetail(plan.detailBase, imputed.determinedTax ?? 0, regular.determinedTax ?? 0, 1),
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
  const fbItemCount = plans.filter((p) => p?.kind === "apply").length;
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
    return {
      ...r,
      familyBusinessDetail: buildDetail(p.detailBase, result.totalDeterminedTax, regularTotal, fbItemCount),
    };
  });
  return { ...result, items };
}
