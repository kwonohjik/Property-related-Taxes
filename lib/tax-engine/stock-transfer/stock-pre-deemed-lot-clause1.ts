/**
 * 분할·다건 lot — 의제취득일 전 «매수» lot 의 ① 비교 (영 §176의2④1호) — sub-lot 단위 `max(①, ②)` + 필요경비 정산
 *
 * 계획서: docs/00-pm/stock-lot-pre-deemed-clause1.plan.md
 *
 * ## 왜 sub-lot 단계인가
 * ② 「취득 당시 실가 + 생산자물가상승분」은 **취득 lot 하나**로 정해져 `applyPreDeemedToLots` 가 단가를 미리 바꾼다.
 * ① 「의제취득일 현재 ③1~3호 가액」은 환산이면 `매도 lot 의 양도가 × 의제취득일 기준시가 ÷ 매도 lot 양도 당시 기준시가`라
 * **매도 lot 에 의존**한다 → 매칭(취득 lot × 매도 lot)이 끝나는 sub-lot 에서야 정해진다.
 * 의제취득일은 모든 의제 lot 에 같아(주식 1986.1.1. · 기타자산 1985.1.1.) ①의 분자·매매사례가는 종목 단위 값 하나다.
 *
 *   sub-lot 1주당 취득가액 = max(① 1주당, ② 1주당) — 동액이면 ② (단건 Z1-7 동일)
 *
 * ## 필요경비 (법 §97②)
 * · ② 채택(또는 의제 대상 아님) → **실비**(§97②1호 · 자본적지출 + 양도비)
 * · ① 채택 → **개산공제** = 의제취득일 현재 기준시가 × 1%(영 §163⑥4 — §97②2호 본문, 실비 불산입)
 *   환산 ①이면 **단서** — (환산취득가액 + 개산공제) < 실비이면 실비를 필요경비로 한다(임의 규정을 단건 엔진과 같이 비교·채택).
 * · 한 종목에 두 방식이 섞이면 실비를 **양도 주식수 비례**로 ① 채택분 몫과 그 외 몫에 귀속한다(잔액은 그 외 몫이 흡수).
 *   ⚠️ 이 귀속 규칙은 법령 명문·해석례를 확보하지 못했다(확인 필요 — 사용자 결정 Q-4 A안 2026-10-06).
 *   ① 채택분 몫 실비는 단서 비교에만 쓰인다(본문이면 개산공제가 갈음).
 *
 * Layer 2 (Pure Engine): DB 직접 호출 없음.
 */

import { STOCK } from "@/lib/tax-engine/legal-codes/stock";
import { calcAcquisitionStdPerShareSupplementary } from "./stock-valuation-unlisted-single-side";
import { evaluateMarketSample, isMarketSampleAllowedMarket } from "./stock-valuation-market-sample";
import { resolveLotAcquisitionPrice } from "./stock-carryover";
import { stockDeemedAcquisitionDate } from "./stock-deemed-acquisition-date";
import type {
  AcquisitionLot,
  LotMatchingDetail,
  MatchedSubLot,
  StockTransferInput,
  TransferLot,
} from "./types/stock-transfer.types";

type Method = NonNullable<StockTransferInput["preDeemedLotClause1"]>;

/** ⑧·⑫ 공용 — 비상장·기타자산 ① 환산은 Phase 2 (양도 당시 보충평가가 매도 lot마다 달라 입력 단위가 별개) */
export const PRE_DEEMED_LOT_UNLISTED_ESTIMATED_MESSAGE =
  "비상장·기타자산의 ① 환산취득가액 비교는 아직 지원하지 않습니다 — 양도 당시 기준시가(§165④ 보충평가)가 매도 건마다 달라서입니다. " +
  `① 의제취득일 현재 매매사례가액을 고르거나 ② 취득 당시 실가 + 생산자물가상승분만 적용하세요 (${STOCK.ENFORCEMENT_DECREE_176_2_4_PRE_DEEMED}1호)`;

/** ⑧·⑫ 공용 — 상장주식은 매매사례가액을 쓸 수 없다 */
export const PRE_DEEMED_LOT_LISTED_SALE_CASE_MESSAGE =
  "상장주식은 ① 매매사례가액을 쓸 수 없습니다 — 주권상장법인의 주식등은 제외됩니다(소득세법 시행령 §176의2③1호). " +
  "① 환산취득가액을 고르거나 ②만 적용하세요";

/** ⑧·⑫ 공용 — 자본조정과 ① 환산 동반 차단 (사용자 결정 Q-6) */
export const PRE_DEEMED_LOT_CAPITAL_ADJUSTMENT_MESSAGE =
  "무상증자·감자(자본조정)와 함께 ① 환산취득가액을 견줄 수 없습니다 — 의제취득일 시점 1주당 기준시가와 양도 시점 1주당 값의 " +
  "주식수 단위가 달라집니다. ① 비교를 끄면 ② 취득 당시 실가 + 생산자물가상승분만 적용합니다";

export interface PreDeemedLotClause1Ctx {
  method: Method;
  /** 의제취득일 현재 1주당 기준시가 — 환산 분자 · 개산공제 base. sale_case 는 0 일 수 있다(개산공제 미적용 경고) */
  deemedStdPerShare: number;
  /** 이 매도 lot 기준 ① 1주당 — 산정 불가면 undefined */
  clause1PerShare: (trn: TransferLot) => number | undefined;
}

export interface SubLotPrice {
  perShare: number;
  selected?: "clause1" | "clause2";
  clause1PerShare?: number;
  clause2PerShare?: number;
}

/** ⑧⑫와 공유하는 술어 — 이 입력에서 ① 비교가 «켜질 수 있는» 시장·방식 조합인가 (자본조정 제외) */
export function isLotClause1MethodAllowed(
  marketType: string | undefined,
  method: Method | undefined,
): "ok" | "unlisted_estimated" | "listed_sale_case" | "off" {
  if (!method) return "off";
  const listed = marketType === "kospi" || marketType === "kosdaq" || marketType === "konex";
  if (method === "estimated") return listed ? "ok" : "unlisted_estimated";
  return isMarketSampleAllowedMarket(marketType as StockTransferInput["marketType"]) ? "ok" : "listed_sale_case";
}

/**
 * ① ctx 빌더 — 엔진·⑤⑥ 미리보기·비과세 echo 가 같은 함수를 부른다(single-source).
 * ctx 가 없으면 ② 만 적용된다(PR #2006 동작). 사유가 있으면 경고로 남긴다 — 침묵 무시 금지.
 */
export function buildPreDeemedLotClause1Context(
  input: StockTransferInput,
  is94_4: boolean,
): { ctx?: PreDeemedLotClause1Ctx; warnings: string[]; appliedRules: string[] } {
  const method = input.preDeemedLotClause1;
  if (!method) return { warnings: [], appliedRules: [] };
  const tag = `${STOCK.ENFORCEMENT_DECREE_176_2_4_PRE_DEEMED}1호`;
  const skip = (reason: string) => ({ warnings: [`${tag} ① 비교를 하지 않았습니다 — ${reason}. ②만 적용합니다.`], appliedRules: [] });

  if (input.capitalAdjustments && input.capitalAdjustments.length > 0) {
    return skip("무상증자·감자(자본조정)가 있어 의제취득일 시점과 양도 시점의 주식수 단위가 다릅니다");
  }
  const allowed = isLotClause1MethodAllowed(input.marketType, method);
  if (allowed === "unlisted_estimated") return skip("비상장·기타자산의 환산취득가액은 아직 지원하지 않습니다");
  if (allowed === "listed_sale_case") return skip("상장주식은 매매사례가액을 쓸 수 없습니다(영 §176의2③1호 괄호)");

  const warnings: string[] = [];
  const appliedRules: string[] = [];

  if (method === "estimated") {
    const deemedStd = Math.floor(input.acquisitionDatePriceAvg1Month ?? 0);
    if (!(deemedStd > 0)) return skip("의제취득일 이전 1개월 종가평균(1주당)이 없습니다");
    return {
      ctx: {
        method,
        deemedStdPerShare: deemedStd,
        clause1PerShare: (trn) => {
          const std = Math.floor(trn.transferStdPricePerShare ?? 0);
          if (!(std > 0)) return undefined;
          // 환산 = 양도가 × (의제취득일 기준시가 ÷ 양도 당시 기준시가) — 1주당 floor (②와 같은 한계, 계획서 Q-3)
          return Number((BigInt(trn.perShareTransferPrice) * BigInt(deemedStd)) / BigInt(std));
        },
      },
      warnings,
      appliedRules,
    };
  }

  // sale_case — 영 §176의2③1호 (상장 제외는 위에서 걸렀다)
  const sample = Math.floor(input.acquisitionMarketSamplePrice ?? 0);
  if (!(sample > 0)) return skip("의제취득일 현재 매매사례 1주당 가액이 없습니다");
  const sampleEval = evaluateMarketSample({
    shareCount: 1,
    acquisitionDate: new Date(stockDeemedAcquisitionDate(is94_4)),
    acquisitionDateLabel: "의제취득일",
    acquisitionMarketSamplePrice: sample,
    acquisitionMarketSampleDate: input.acquisitionMarketSampleDate,
  });
  warnings.push(...sampleEval.warnings);
  // 개산공제 base = 의제취득일 현재 §165④ 보충평가(취득측) — 단건 sale_case 경로와 같은 leaf
  const std = calcAcquisitionStdPerShareSupplementary(input);
  warnings.push(...std.warnings);
  for (const r of std.appliedRules) if (r !== STOCK.ENFORCEMENT_DECREE_165_3_TRADING_HALT) appliedRules.push(r);
  if (!(std.perShare > 0)) {
    warnings.push(
      `${tag} 매매사례 ① — 의제취득일 현재 기준시가가 0 이하라 개산공제(${STOCK.ENFORCEMENT_DECREE_163_6_4_ESTIMATED_EXPENSE})를 적용하지 않았습니다.`,
    );
  }
  return { ctx: { method, deemedStdPerShare: Math.max(0, std.perShare), clause1PerShare: () => sample }, warnings, appliedRules };
}

/**
 * sub-lot(취득 lot × 매도 lot) 1주당 취득가액 — 이월과세 seam(`resolveLotAcquisitionPrice`) 위에 얹는다.
 * ② 표지가 없는 lot(의제 대상 아님·이월과세·상속·증여·1965 이전 미적용)은 종전 그대로다.
 */
export function resolveSubLotBuyPrice(acq: AcquisitionLot, trn: TransferLot, ctx: PreDeemedLotClause1Ctx | undefined): SubLotPrice {
  const base = resolveLotAcquisitionPrice(acq, trn.transferDate);
  if (!ctx || acq.preDeemedClause2PerShare === undefined) return { perShare: base };
  const p2 = base;
  const p1 = ctx.clause1PerShare(trn);
  if (p1 === undefined) return { perShare: p2, selected: "clause2", clause2PerShare: p2 };
  // 동액이면 ② — 실가 방식 필요경비
  return p1 > p2
    ? { perShare: p1, selected: "clause1", clause1PerShare: p1, clause2PerShare: p2 }
    : { perShare: p2, selected: "clause2", clause1PerShare: p1, clause2PerShare: p2 };
}

/** 의제 lot sub-lot 일 때만 싣는 echo — 기존 anchor 의 matched 객체 동등 비교를 깨지 않는다 */
export function subLotEcho(acq: AcquisitionLot, trn: TransferLot, sp: SubLotPrice): Partial<MatchedSubLot> {
  if (!sp.selected) return {};
  return {
    ...(acq.id !== undefined ? { acquisitionLotId: acq.id } : {}),
    ...(trn.id !== undefined ? { transferLotId: trn.id } : {}),
    preDeemedSelected: sp.selected,
    ...(sp.clause1PerShare !== undefined ? { preDeemedClause1PerShare: sp.clause1PerShare } : {}),
    ...(sp.clause2PerShare !== undefined ? { preDeemedClause2PerShare: sp.clause2PerShare } : {}),
  };
}

/** ① 채택 누적기 — fifo·specific 은 정수, moving_avg 는 풀 비율 안분이라 소수 */
export interface Clause1Acc {
  clause1Shares: number;
  clause1Amount: number;
  /** ① 을 산정하지 못해 ②만 쓴 의제 lot 매도 주식수 — 엔진 직접 호출 방어 경고용(⑧·⑫가 막는 입력) */
  unresolvedShares: number;
  pooled: boolean;
}

export const newClause1Acc = (pooled: boolean): Clause1Acc => ({ clause1Shares: 0, clause1Amount: 0, unresolvedShares: 0, pooled });

/** fifo·specific — sub-lot 하나가 ① 채택이면 주식수·취득가액을 더한다 */
export function addClause1(acc: Clause1Acc | undefined, sp: SubLotPrice, shares: number): void {
  if (!acc) return;
  if (sp.selected === "clause2" && sp.clause1PerShare === undefined) acc.unresolvedShares += shares;
  if (sp.selected !== "clause1") return;
  acc.clause1Shares += shares;
  acc.clause1Amount += shares * sp.perShare;
}

/** moving_avg — 풀의 ① 채택 지분(f)만큼의 매도분이 ① 몫이다(평균 보존과 같은 비례) */
export function addClause1Pooled(acc: Clause1Acc | undefined, soldShares: number, clause1Fraction: number, clause1PerShare: number | undefined): void {
  if (!acc || !(clause1Fraction > 0) || clause1PerShare === undefined) return;
  acc.clause1Shares += soldShares * clause1Fraction;
  acc.clause1Amount += soldShares * clause1Fraction * clause1PerShare;
}

export function buildClause1Summary(
  ctx: PreDeemedLotClause1Ctx,
  acc: Clause1Acc,
  matched: MatchedSubLot[],
): NonNullable<LotMatchingDetail["preDeemedClause1Summary"]> {
  const soldShares = matched.reduce((s, m) => s + m.saleShares, 0);
  return {
    method: ctx.method,
    deemedStdPerShare: ctx.deemedStdPerShare,
    soldShares,
    clause1Shares: acc.clause1Shares,
    otherShares: soldShares - acc.clause1Shares,
    clause1Amount: Math.floor(acc.clause1Amount),
    ...(acc.unresolvedShares > 0 ? { unresolvedShares: acc.unresolvedShares } : {}),
    pooled: acc.pooled,
  };
}

export interface PreDeemedLotSettlement {
  totalActualExpenses: number;
  clause1SideActual: number;
  otherSideActual: number;
  estimatedBase: number;
  estimatedDeduction: number;
  swapApplied: boolean;
  swapComparison?: { estimatedSide: number; directSide: number; chosen: "direct" | "estimated" };
  swapRemovedAcquisition: number;
  expenses: number;
}

/** floor(a × b ÷ c) — 정수면 BigInt, 소수(moving_avg 풀 비율)면 float */
function mulDivFloor(a: number, b: number, c: number): number {
  if (c <= 0) return 0;
  if (Number.isInteger(a) && Number.isInteger(b) && Number.isInteger(c)) return Number((BigInt(a) * BigInt(b)) / BigInt(c));
  return Math.floor((a * b) / c);
}

/**
 * ① 채택 sub-lot 이 있을 때의 필요경비 정산. 없으면 undefined — 호출부는 종전 경로(실비 단일 합계) 그대로다.
 *
 * @param actualExpenses 입력 실비(자본적지출 + 양도비) — 종목 단위 합계
 * @param lotDonorCapex  증여자 자본적지출(이월과세 lot — 매도 몫 안분 완료분). 이월과세 lot 은 ① 대상이 아니라 그 외 몫에 전액 귀속
 */
export function settlePreDeemedLotExpenses(args: {
  summary: NonNullable<LotMatchingDetail["preDeemedClause1Summary"]>;
  actualExpenses: number;
  lotDonorCapex: number;
}): PreDeemedLotSettlement | undefined {
  const { summary, actualExpenses, lotDonorCapex } = args;
  if (!(summary.clause1Shares > 0)) return undefined;

  const clause1SideActual = mulDivFloor(actualExpenses, summary.clause1Shares, summary.soldShares);
  const otherSideActual = actualExpenses - clause1SideActual; // 잔액 흡수 — Σ = 입력 실비
  const estimatedBase = mulDivFloor(summary.deemedStdPerShare, summary.clause1Shares, 1);
  // 영 §163⑥4 — 취득당시 기준시가 × 1/100 (정수 나눗셈 — 부동소수 0.01 곱셈 오차 배제)
  const estimatedDeduction = Math.floor(estimatedBase / 100);

  let swapApplied = false;
  let swapComparison: PreDeemedLotSettlement["swapComparison"];
  // 법 §97②2호 단서 — 「환산취득가액으로 하는 경우」 한정(매매사례는 비대상)
  if (summary.method === "estimated") {
    const estimatedSide = summary.clause1Amount + estimatedDeduction;
    swapApplied = clause1SideActual > estimatedSide; // 동률은 본문 (단건과 같다)
    swapComparison = { estimatedSide, directSide: clause1SideActual, chosen: swapApplied ? "direct" : "estimated" };
  }

  return {
    totalActualExpenses: actualExpenses,
    clause1SideActual,
    otherSideActual,
    estimatedBase,
    estimatedDeduction,
    swapApplied,
    ...(swapComparison ? { swapComparison } : {}),
    swapRemovedAcquisition: swapApplied ? summary.clause1Amount : 0,
    expenses: otherSideActual + lotDonorCapex + (swapApplied ? clause1SideActual : estimatedDeduction),
  };
}

/**
 * 단기(가목 1)·장기(가목 2) 세율 안분용 그룹 순이익 — ① 정산이 있을 때만(`calcSplitModeTax`가 읽는다).
 *
 * 종전 안분 비율은 sub-lot 총이익(양도가 − 취득가)이라 정산이 그룹마다 다르게 깎는 필요경비를 보지 않았다:
 *   · ① 채택 몫 = 개산공제(영 §163⑥4) — swap 이면 ① 몫 실비이고, 빠진 ① 환산 취득가액은 되더한다(법 §97②2호 단서)
 *   · 그 외 몫  = 양도 주식수 비례 실비 + 증여자 자본적지출(사용자 결정 A안)
 * 몫은 sub-lot 의 ① 채택 주식수(c)와 그 외 주식수(o)로 나눈다. moving_avg(풀)는 sub-lot 선택이 없어 매도 주식수 비례로 근사한다.
 *
 * 단기 그룹은 종전과 같이 총이익이 양(+)인 단기 sub-lot 만 모은다. 분모는 전 sub-lot 순이익 합(= 양도소득금액).
 */
export function settledGroupGains(
  lotDetail: LotMatchingDetail,
  settlement: Pick<PreDeemedLotSettlement, "clause1SideActual" | "estimatedDeduction" | "swapApplied" | "swapRemovedAcquisition" | "expenses">,
): { shortGain: number; totalGain: number } | undefined {
  const summary = lotDetail.preDeemedClause1Summary;
  if (!summary || !(summary.clause1Shares > 0)) return undefined;
  const clause1Expense = settlement.swapApplied ? settlement.clause1SideActual : settlement.estimatedDeduction;
  const otherExpense = settlement.expenses - clause1Expense;
  const clause1Ratio = summary.soldShares > 0 ? summary.clause1Shares / summary.soldShares : 0;
  let shortGross = 0;
  let shortC = 0;
  let shortO = 0;
  for (const m of lotDetail.matched) {
    if (!(m.isShortTerm && m.perLotGain > 0)) continue;
    const c = summary.pooled ? m.saleShares * clause1Ratio : m.preDeemedSelected === "clause1" ? m.saleShares : 0;
    shortGross += m.perLotGain;
    shortC += c;
    shortO += m.saleShares - c;
  }
  const shortGain =
    shortGross -
    mulDivFloor(clause1Expense, shortC, summary.clause1Shares) -
    (summary.otherShares > 0 ? mulDivFloor(otherExpense, shortO, summary.otherShares) : 0) +
    mulDivFloor(settlement.swapRemovedAcquisition, shortC, summary.clause1Shares);
  return {
    shortGain,
    totalGain: lotDetail.totalGain - settlement.expenses + settlement.swapRemovedAcquisition,
  };
}
