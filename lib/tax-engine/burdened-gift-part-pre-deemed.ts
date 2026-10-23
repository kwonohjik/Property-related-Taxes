/**
 * 부담부증여 §159①1호 A — 의제취득일(1985.1.1.) 전 상속·증여 **파트**의 3자 max (일반건물 · PR-7b-6).
 *
 * 사용자 결정(계획서 `inheritance-pre-deemed-bg-pr7b.plan.md` §4):
 *  · Q-24 시가 평가 → max(① 상증법 평가액, ② 영 §164④·⑤ 가액, ③ 환산취득가액) × 채무비율. ③의 양도가액 = 증여가액 C(국심2007서2099).
 *  · Q-28 비교 단위는 **파트별**(토지·건물 각자 max × B/C) — 비부담부증여 일반건물(PR-4 `general-building-pre-deemed.ts`)과 같은 단위.
 *    한 파트만 의제취득일 전이면 그 파트만 3자 max이고, 다른 파트는 사용자가 고른 산정방식이다.
 *
 * ③ = 파트 증여가액 × 파트 취득시(의제취득일) 기준시가 ÷ 파트 양도시 기준시가. 파트 증여가액은 C를 양도시 기준시가 비율로 나눈 값이다 —
 *     STEP 3이 시가를 토지·건물로 나누는 축(`landSangjeungbeopValue`)과 같다. 일반건물의 취득시 기준시가 칸은 의제취득일 전 파트에서 의제취득일
 *     기준시가다(PR-7b-2 · ⑤ 라벨 「의제취득일(1985.1.1.) 기준」) — 단일 자산처럼 슬롯을 바꿔 넣을 필요가 없다.
 *
 * 필요경비: ①② 채택 파트는 실지거래가액 의제(영 §163⑨)라 실제 필요경비, ③ 채택 파트는 개산공제(영 §163⑥) + §97②2호 단서.
 * 실비는 자산 단위와 같은 성질별 시점 비율로 파트에 나눈다(`splitBgRealExpenseByNature`) — 실지 파트는 제 몫을 쓰고, 환산 파트는 제 몫과
 * 가목을 겨룬다. 두 파트가 모두 환산이면 자산 단위 비교 그대로다(종전 K-5와 같다).
 */
import { safeMultiplyThenDivide, calculateEstimatedAcquisitionPrice } from "./tax-utils";
import { TaxCalculationError, TaxErrorCode } from "./tax-errors";
import { REGISTERED_ESTIMATED_DEDUCTION_RATE, UNREGISTERED_ESTIMATED_DEDUCTION_RATE } from "./legal-codes/burdened-gift";
import { apportionAcquisitionPrice, estimatedDeductionForBurdenedGift } from "./burdened-gift-valuation";
import {
  resolveWholeBgAcquisition,
  splitBgRealExpenseByNature,
  type BgAcquisitionContext,
  type BgAcquisitionSlots,
} from "./burdened-gift-acquisition";
import type { BgPartPreDeemedEcho, TransferBurdenedGiftBreakdown } from "./types/transfer-burdened-gift.types";
import type { GbPreDeemedClauseA } from "./types/general-building.types";

type Part = "land" | "building";
type Method = TransferBurdenedGiftBreakdown["acquisitionMethodUsed"];

/** ④가 싣는 파트별 ①② — 일반건물 `generalBuildingValuation.{land,building}PreDeemedClauseA`(지분이면 지분 몫). */
export interface BgPreDeemedParts {
  land?: GbPreDeemedClauseA;
  building?: GbPreDeemedClauseA;
}

export const BG_PART_METHOD_REQUIRED_MESSAGE =
  "[burdened_gift] 의제취득일(1985.1.1.) 전에 상속·증여받지 않은 파트는 취득가액 산정방식(실지취득가액·매매사례가액·감정가액·환산취득가액)이 필요합니다 " +
  "(「소득세법」 제100조 제1항 · 같은 법 시행령 제159조 제1항 제1호).";

/** 동점은 ①② 쪽(Q-5) · 취득가액만 비교한다(Q-7 a) — 비부담부증여 일반건물(`general-building-pre-deemed.ts` `adoptedOf`)과 같은 규칙. */
function selectOf(c: GbPreDeemedClauseA, converted: number): BgPartPreDeemedEcho["selected"] {
  const clauseA = Math.max(c.reported, c.sec164);
  if (clauseA > 0 && clauseA >= converted) return c.reported >= c.sec164 ? "reported" : "sec164";
  return "converted";
}

export function resolvePartwiseBgAcquisition(
  ctx: BgAcquisitionContext,
  parts: BgPreDeemedParts,
): { slots: BgAcquisitionSlots; parts: { land?: BgPartPreDeemedEcho; building?: BgPartPreDeemedEcho } } {
  const { info, assumedDebtAmount, giftValuation, isUnregistered, params } = ctx;
  const std = {
    land: { acq: ctx.landStdPriceAtAcquisition, transfer: ctx.landStdPriceAtTransfer },
    building: { acq: ctx.buildingStdPriceAtAcquisition, transfer: ctx.buildingStdPriceAtTransfer },
  };

  // 의제취득일 전이 아닌 파트 — 사용자가 고른 산정방식의 STEP 4 값(실비 없이 불러 §97②2호 단서가 끼지 않게 한다 · 경비는 아래에서 파트별로)
  const userPart = !parts.land || !parts.building;
  if (userPart && !info.acquisitionMethod) {
    throw new TaxCalculationError(TaxErrorCode.INVALID_INPUT, BG_PART_METHOD_REQUIRED_MESSAGE);
  }
  const base = userPart ? resolveWholeBgAcquisition({ ...ctx, preDeemed: undefined, params: {} }) : undefined;

  // ③의 양도가액 = 증여가액 C(Q-24)를 양도시 기준시가 비율로 나눈 파트 몫
  const totalTransferStd = std.land.transfer + std.building.transfer;
  const giftLand = totalTransferStd > 0 ? safeMultiplyThenDivide(giftValuation.max, std.land.transfer, totalTransferStd) : 0;
  const giftOf: Record<Part, number> = { land: giftLand, building: giftValuation.max - giftLand };

  const echo: { land?: BgPartPreDeemedEcho; building?: BgPartPreDeemedEcho } = {};
  const out = {} as Record<Part, { method: Method; acquisition: number; actual?: number; presumed?: number }>;
  for (const p of ["land", "building"] as const) {
    const clauseA = parts[p];
    if (!clauseA) {
      out[p] = {
        method: base!.acquisitionMethodUsed,
        acquisition: p === "land" ? base!.landAcquisitionPrice : base!.buildingAcquisitionPrice,
        actual: p === "land" ? base!.landActualAcquisition : base!.buildingActualAcquisition,
        presumed: p === "land" ? base!.landPresumedAcquisition : base!.buildingPresumedAcquisition,
      };
      continue;
    }
    const converted = std[p].transfer > 0 ? calculateEstimatedAcquisitionPrice(giftOf[p], std[p].acq, std[p].transfer) : 0;
    const selected = selectOf(clauseA, converted);
    const whole = selected === "converted" ? converted : Math.max(clauseA.reported, clauseA.sec164);
    echo[p] = {
      stdAtDeemed: std[p].acq,
      reported: clauseA.reported > 0 ? clauseA.reported : null,
      sec164: clauseA.sec164 > 0 ? clauseA.sec164 : null,
      converted,
      selected,
      wholeAcquisition: whole,
    };
    out[p] = {
      method: selected === "converted" ? "converted" : "actual",
      acquisition: apportionAcquisitionPrice(whole, assumedDebtAmount, giftValuation.max),
      ...(selected === "converted" ? {} : { actual: whole }),
    };
  }

  // STEP 5 — 파트별 필요경비 슬롯
  const capitalExpenditureRaw = params.capitalExpenditure ?? 0;
  const realExpenseTotal = capitalExpenditureRaw + (params.transferExpense ?? 0);
  const necessaryExpenseDebtTotal = apportionAcquisitionPrice(realExpenseTotal, assumedDebtAmount, giftValuation.max);
  const realExpenseDeclared = params.capitalExpenditure !== undefined || params.transferExpense !== undefined;
  const realSplit = splitBgRealExpenseByNature(necessaryExpenseDebtTotal, capitalExpenditureRaw, realExpenseTotal, ctx);
  const rate = isUnregistered ? UNREGISTERED_ESTIMATED_DEDUCTION_RATE : REGISTERED_ESTIMATED_DEDUCTION_RATE;
  const deduction: Record<Part, number> = { land: 0, building: 0 };
  for (const p of ["land", "building"] as const) {
    deduction[p] =
      out[p].method === "actual"
        ? realSplit[p]
        : estimatedDeductionForBurdenedGift(apportionAcquisitionPrice(std[p].acq, assumedDebtAmount, giftValuation.max), isUnregistered);
  }

  // STEP 5.5 — §97②2호 단서(환산 한정). 두 파트가 다 환산이면 자산 단위 비교(종전 K-5와 같다), 한 파트만 환산이면 그 파트의 가목과 제 실비 몫을 겨룬다.
  const acquisition: Record<Part, number> = { land: out.land.acquisition, building: out.building.acquisition };
  let necessaryExpenseSwap: TransferBurdenedGiftBreakdown["necessaryExpenseSwap"];
  let convertedAcquisitionBeforeSwap: TransferBurdenedGiftBreakdown["convertedAcquisitionBeforeSwap"];
  const convertedParts = (["land", "building"] as const).filter((p) => out[p].method === "converted");
  if (realExpenseDeclared && convertedParts.length > 0) {
    const estimatedSide = convertedParts.reduce((s, p) => s + acquisition[p] + deduction[p], 0);
    const directSide = convertedParts.length === 2 ? necessaryExpenseDebtTotal : realSplit[convertedParts[0]];
    const chosen = directSide > estimatedSide ? "direct" : "estimated";
    necessaryExpenseSwap = { estimatedSide, directSide, chosen };
    if (chosen === "direct") {
      convertedAcquisitionBeforeSwap = { ...acquisition };
      for (const p of convertedParts) {
        acquisition[p] = 0;
        deduction[p] = realSplit[p];
      }
    }
  }

  const landRate = out.land.method === "actual" ? undefined : rate;
  const buildingRate = out.building.method === "actual" ? undefined : rate;
  return {
    slots: {
      // 자산 단위 값은 두 파트가 같으면 그 방식, 다르면 건물 파트의 방식이다 — 건물 카드 §114조의2 신호(`general-building-bg-penalty-signal.ts`)가
      // 이 값으로 「건물이 환산」을 판정한다. 파트별 값은 `perAsset.*.acquisitionMethod`·`preDeemed.parts`가 정본이다.
      acquisitionMethodUsed: out.building.method,
      landMethod: out.land.method,
      buildingMethod: out.building.method,
      landAcquisitionPrice: acquisition.land,
      buildingAcquisitionPrice: acquisition.building,
      landActualAcquisition: out.land.actual,
      buildingActualAcquisition: out.building.actual,
      landPresumedAcquisition: out.land.presumed,
      buildingPresumedAcquisition: out.building.presumed,
      landEstimatedDeduction: deduction.land,
      buildingEstimatedDeduction: deduction.building,
      appliedEstimatedDeductionRate: landRate ?? buildingRate,
      landEstimatedDeductionRate: landRate,
      buildingEstimatedDeductionRate: buildingRate,
      necessaryExpenseSwap,
      convertedAcquisitionBeforeSwap,
    },
    parts: echo,
  };
}
