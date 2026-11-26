/**
 * 주식 양도소득세 STEP 4 — 필요경비 결정 (오케스트레이터 `stock-transfer-tax.ts`에서 분리 · 800줄 정책)
 *
 *   환산취득가 모드 본문: 시행령 §163⑥4 개산공제(취득기준시가×1%) (§97②2호 본문)
 *   [B-2] 단서: (환산취득가+개산공제) < (자본적지출+양도비) → 후자를 필요경비 전체로 대체 (§97②2호 단서)
 *     소령 §163⑫ → §176의2②1호(주식 환산 명시) → §97①1나목 "환산취득가액으로 하는 경우" 해당.
 *     sale_case는 usedEstimatedAcquisition 미설정이라 본 게이트 미진입 (구조적 배제).
 *
 * 순수 함수 — 분리 전 본문을 그대로 옮겼다. `appliedRulesDelta`·`warningsDelta`는 분리 전 push 순서 그대로다.
 */

import type { StockTransferInput, StockTransferResult, LotMatchingDetail } from "./types/stock-transfer.types";
import {
  settlePreDeemedLotExpenses,
  type PreDeemedLotSettlement,
} from "./stock-pre-deemed-lot-clause1";
import { buildPreDeemedLotsDetail } from "./stock-pre-deemed-lots-detail";
import type { SplitPrepared } from "./stock-transfer-split-prepare";

export interface StockExpensesArgs {
  input: StockTransferInput;
  is94_4: boolean;
  transferPrice: number;
  /** STEP 3 취득가액 (기신고분 합산 전 · 당회차) */
  acquisitionPrice: number;
  /** STEP 3 의제취득일 전 매수 ② 채택 시 바뀐 모드 — 없으면 입력값 */
  acquisitionMode: StockTransferInput["acquisitionMode"];
  expenseMode: StockTransferInput["expenseMode"];
  usedEstimatedAcquisition: boolean | undefined;
  estimatedDeduction: number | undefined;
  lotMatchingDetail: LotMatchingDetail | undefined;
  preDeemedLotDetails: SplitPrepared["preDeemedLotDetails"];
}

export interface StockExpensesResolved {
  /** §97의2①3호 증여세 상당액까지 더한 당회차 필요경비 */
  expenses: number;
  swapApplied: boolean;
  swapComparison: StockTransferResult["swapComparison"];
  /** 부분 swap(§97②2호 단서)으로 취득가액 차감에서 빠진 ① 환산 취득가액 */
  lotSwapRemoved: number;
  /** split 모드 증여자 자본적지출(§97의2①2호) */
  lotDonorCapex: number;
  singleGiftTax: number;
  lotGiftTax: number;
  lotClause1Settlement: PreDeemedLotSettlement | undefined;
  preDeemedLotsDetail: ReturnType<typeof buildPreDeemedLotsDetail>["detail"];
  appliedRulesDelta: StockTransferResult["appliedRules"];
  warningsDelta: string[];
}

export function resolveStockExpenses(args: StockExpensesArgs): StockExpensesResolved {
  const {
    input,
    is94_4,
    transferPrice,
    acquisitionPrice,
    acquisitionMode,
    expenseMode,
    usedEstimatedAcquisition,
    estimatedDeduction,
    lotMatchingDetail,
    preDeemedLotDetails,
  } = args;
  const appliedRules: StockTransferResult["appliedRules"] = [];
  const warnings: string[] = [];

  let expenses = 0;
  let swapApplied = false;
  let swapComparison: StockTransferResult["swapComparison"];

  /**
   * §97의2①**2호** — split 모드의 증여자 자본적지출. lot마다 「매도된 몫」만 안분해
   * `allocateLots`가 합산해 둔 값이다. 단건 모드의 종목 축 `donorCapitalExpenditure`는
   * `stock-carryover.ts`가 이미 `actualExpenses`에 더해 넣었으므로 여기서 겹치지 않는다
   * (split은 종목 축 취득원인이 `carryover_gift`가 아니라 그 경로를 타지 않는다).
   *
   * 🔑 **자본적지출은 §97②2호 단서의 「나목」이라 비교에 참여해야 한다** — 그래서
   * 증여세(③호, 비교 대상 밖)와 달리 `directSide`에 먼저 합친다.
   */
  const lotDonorCapex = lotMatchingDetail?.carryoverDonorCapex ?? 0;
  const directExpenses = (input.actualExpenses ?? 0) + lotDonorCapex;
  /** 부분 swap(§97②2호 단서) 으로 취득가액 차감에서 빠진 ① 환산 취득가액 — 아래 정산이 채운다 */
  let lotSwapRemoved = 0;

  // 의제취득일 전 매수 lot ① 채택분이 있으면 필요경비를 방식별로 가른다(법 §97②1호 나목 / ②2호 + 단서) — 없으면 undefined
  const lotClause1Settlement: PreDeemedLotSettlement | undefined = lotMatchingDetail?.preDeemedClause1Summary
    ? settlePreDeemedLotExpenses({
        summary: lotMatchingDetail.preDeemedClause1Summary,
        actualExpenses: input.actualExpenses ?? 0,
        lotDonorCapex,
      })
    : undefined;

  const preDeemedLots = buildPreDeemedLotsDetail({
    is94_4,
    lots: preDeemedLotDetails,
    summary: lotMatchingDetail?.preDeemedClause1Summary,
    settlement: lotClause1Settlement,
  });
  warnings.push(...preDeemedLots.warnings);

  if (lotClause1Settlement) {
    expenses = lotClause1Settlement.expenses;
    lotSwapRemoved = lotClause1Settlement.swapRemovedAcquisition;
    if (lotClause1Settlement.swapApplied) appliedRules.push("§97②단서swap");
  } else if (usedEstimatedAcquisition && estimatedDeduction !== undefined && estimatedDeduction > 0) {
    const directSide = directExpenses; // 자본적지출 + 양도비 합계 (expenseMode 무관)
    const estimatedSide = acquisitionPrice + estimatedDeduction; // 가목 = 환산취득가 + 개산공제
    if (directSide > estimatedSide) {
      // 단서 발동 — "적은 경우" 문리상 동률(==)은 본문
      swapApplied = true;
      expenses = directSide;
      swapComparison = { estimatedSide, directSide, chosen: "direct" };
      appliedRules.push("§97②단서swap");
      warnings.push(
        "§97②2호 단서 적용 — (환산취득가+개산공제)보다 실제 필요경비(자본적지출+양도비)가 커 후자를 필요경비로 합니다. 양도차익 계산에서 환산취득가는 차감되지 않습니다."
      );
    } else {
      expenses = estimatedDeduction;
      if (directSide > 0) {
        swapComparison = { estimatedSide, directSide, chosen: "estimated" };
        warnings.push(
          "환산취득가 모드 — §97②2호 단서 비교 결과 (환산취득가+개산공제)가 입력 실비 이상이므로 본문(개산공제)을 적용합니다."
        );
      }
    }
  } else if (expenseMode === "actual" && acquisitionMode !== "sale_case") {
    // sale_case는 expenseMode와 무관하게 아래 개산공제 — §97②2호 본문(취득가액 + 개산공제). 실비로 갈아타는
    // 단서는 「환산취득가액으로 하는 경우」 한정이라 매매사례가액에는 없다(엔진 직접 호출 방어).
    expenses = directExpenses;
  } else {
    /**
     * 개산공제 모드 — ①2호를 **더하지 않는다**. §97②2호 본문은 「취득가액 + 개산공제」이고
     * 자본적지출은 **단서(나목)로 갈아탈 때만** 산입되는 택일 항목이라, 여기 더하면
     * 개산공제와 실비를 동시에 받는 **이중 공제**가 된다. 단건 경로도 증여자 자본적지출을
     * `actualExpenses`에만 실어 같은 규약을 지킨다(`stock-carryover.ts` 시나리오 A).
     */
    expenses = estimatedDeduction ?? 0;
  }

  /**
   * §97의2①**3호** — 증여세 상당액은 필요경비가 **확정된 뒤** 가산한다.
   *
   * 🔑 **§97②2호 단서 비교 대상 밖**이다. 단서는 「가목(환산취득가 + 개산공제)」과
   * 「나목(자본적지출 + 양도비)」만 견주는데, 증여세는 §97①2호도 3호도 아니기 때문이다.
   * 그래서 위 swap 판정이 **끝난 다음** 더한다 — `actualExpenses`에 섞으면
   * ⓐ 단서 비교가 오염되고 ⓑ 본문(개산공제) 채택 시 **차감되지 않고 사라진다**
   * (부동산이 같은 함정에 두 번 걸렸다 — `transfer-tax-carryover.ts:368-417`).
   *
   * 값은 `stock-carryover.ts`가 영 §163의2②(안분 → 한도)까지 마쳐 넣어 준다.
   *
   * split 모드는 lot마다 증여 건이 다를 수 있어 `allocateLots`가 lot별로 안분해 합산한다.
   * **한도는 종목 단위**(영 §163의2② 후단 「양도가액에서 §97①·②의 금액을 공제한 잔액」)이므로
   * 여기서 건다 — 필요경비가 확정된 지금이 그 잔액을 알 수 있는 첫 지점이다.
   */
  const singleGiftTax = input.carryoverGiftTaxExpense ?? 0;
  const lotGiftTaxRaw = lotMatchingDetail?.carryoverGiftTaxApportioned ?? 0;
  let lotGiftTax = 0;
  if (lotGiftTaxRaw > 0) {
    const preGiftIncome = swapApplied
      ? transferPrice - expenses
      : transferPrice - (acquisitionPrice - lotSwapRemoved) - expenses;
    lotGiftTax = Math.min(lotGiftTaxRaw, Math.max(0, preGiftIncome - singleGiftTax));
  }
  expenses += singleGiftTax + lotGiftTax;

  return {
    expenses,
    swapApplied,
    swapComparison,
    lotSwapRemoved,
    lotDonorCapex,
    singleGiftTax,
    lotGiftTax,
    lotClause1Settlement,
    preDeemedLotsDetail: preDeemedLots.detail,
    appliedRulesDelta: appliedRules,
    warningsDelta: warnings,
  };
}
