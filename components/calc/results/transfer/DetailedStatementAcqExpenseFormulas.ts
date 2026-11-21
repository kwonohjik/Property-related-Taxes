/**
 * 계산결과 상세명세서 — 취득가액·필요경비 산식 빌더 (`DetailedStatementFormulaBuilders.ts`에서 분리 · 800줄 정책)
 *
 * 단건은 실제 변수값, 다건은 자산별 합계 소제목(산정방식 집합 `AggHeadingMode`)을 적는다.
 * 원본이 재export하므로 종전 import 경로(`./DetailedStatementFormulaBuilders`)는 그대로 쓸 수 있다.
 */

import { separateAcqExpenseText, separateAcqFormulaText } from "@/components/calc/results/mixed-use/mixed-use-separate-acq-text";
import { createElement, Fragment, type ReactNode } from "react";
import { NECESSARY_EXPENSE } from "@/lib/tax-engine/legal-codes/transfer-necessary-expense";
import { Frac } from "@/components/calc/results/shared/FormulaParts";
import type { TransferTaxResult } from "@/lib/tax-engine/transfer-tax";
import type { AggHeadingMode } from "./split-acq-text";
import {
  aggregateAcqHeading,
  aggregateExpenseHeading,
  formatLumpRate,
  isOwnerSplitCarryoverA,
  splitAcqFormulaText,
  splitExpenseText,
} from "./split-acq-text";
import { fmt } from "./DetailedStatementGbFormulas";

/**
 * 취득가액 산식 — 단건은 실제 변수값(양도차익 항목과 동일 표기), 다건은 자산별 합계 요약.
 * 환산취득가 모드는 기준시가 비율식까지 풀어쓰되, 기준시가 echo가 없는
 * 감정가액·매매사례가액 모드는 추계 취득가액만 표시(비율식 부적용).
 */
export function buildAcquisitionPriceFormula(
  result: TransferTaxResult,
  isAggregate: boolean,
  totalTransferPrice: number,
  singleAcq: number,
  capEx: number,
  /** §97③ 엔진이 취득가액에서 실제로 공제한 감가상각비(swap이면 0). `singleAcq`는 이미 공제 **후** 값이다. */
  depreciation = 0,
  /**
   * 집계 자산들의 산정방식 집합(echo 파생 — `aggregateAcqModes`). 어댑터가 `usedEstimatedAcquisition`을 상수로 내려
   * 보내므로 집계 소제목은 이 집합이 정본이다. 미지정이면 종전 플래그로 후퇴한다.
   */
  aggModes?: Set<AggHeadingMode>,
): ReactNode {
  const capExStr = capEx > 0 ? ` + 자본적지출 ${capEx.toLocaleString()}` : "";
  const depStr = depreciation > 0 ? ` − 감가상각비 ${depreciation.toLocaleString()} (소득세법 §97③)` : "";
  // 환산취득가 = 양도가액 × (취득시 기준시가 ÷ 양도시 기준시가) — 분수를 Frac로 표기 (PR #746 표준).
  const estFrac = (prefix: string, stdAcq: number, stdTransfer: number, suffix: string): ReactNode =>
    createElement(
      Fragment,
      null,
      prefix,
      createElement(Frac, {
        top: `취득시 기준시가 ${stdAcq.toLocaleString()}`,
        bottom: `양도시 기준시가 ${stdTransfer.toLocaleString()}`,
      }),
      suffix,
    );
  if (isAggregate) {
    const heading = aggModes && aggregateAcqHeading(aggModes);
    if (heading) return heading;
    return result.usedEstimatedAcquisition
      ? "자산별 환산취득가 합계 — 시행령 §163·§176의2②"
      : "자산별 실제 거래가액 합계 (자본적지출은 필요경비 — §97① 2호)";
  }
  // B1 — 겸용 별개 취득 파트 모델: 파트별 산정방식·4부분 값을 echo로 그린다. **route·`usedEstimatedAcquisition`보다 먼저** 봐야 한다 —
  // 어댑터가 파트 모델을 「추계」 플래그로 내려 보내므로(값 정합용) 아래 분기로 가면 실거래가 파트도 「환산취득가」로 적힌다.
  const sepAcqText = separateAcqFormulaText(result.mixedUseDetail);
  if (sepAcqText) return sepAcqText;
  // 배우자등 이월과세 Scenario A 채택 — 증여자 취득 당시 취득가액 승계 (§97의2①).
  // 환산+증여세 경로에서는 엔진이 실가로 전환하므로 result.usedEstimatedAcquisition만으로는
  // 환산 여부를 알 수 없어 scenarioA echo를 사용한다.
  const coA = result.carryoverTaxationDetail;
  // 소유자 분리 — 본인 파트 분리 산식에 승계 근거를 덧붙인다(행 값이 분리 합이다 · V-4).
  if (coA && isOwnerSplitCarryoverA(result)) {
    const splitText = splitAcqFormulaText(result.splitDetail);
    if (splitText) {
      const basis = coA.scenarioA.acquisitionWasEstimated ? "증여자 취득 당시 기준시가로 본인 파트 환산(시행령 §163⑨)" : "증여자 취득가액 승계";
      return `${splitText} ※ 이월과세 §97의2① — ${basis}`;
    }
  }
  if (coA?.adoptedScenario === "A") {
    const a = coA.scenarioA;
    // 증여자 자본적지출(§97의2①2호)은 취득가액 칸이 아니라 **필요경비** 칸에 있다(필요경비 산식이 따로 밝힌다) — 여기서 「포함」이라 적으면 값(취득가액 칸)과 어긋난다.
    if (a.acquisitionWasEstimated) {
      const stdAcq = a.estimatedStdPriceAtAcquisition;
      const stdTransfer = a.estimatedStdPriceAtTransfer;
      return stdAcq != null && stdTransfer != null
        ? estFrac(
            `증여자 취득 당시 환산취득가 ${fmt(a.acquisitionPrice)} = 양도가액 ${totalTransferPrice.toLocaleString()} × `,
            stdAcq,
            stdTransfer,
            `${capExStr} — 이월과세 §97의2① (증여자 취득가액 승계·시행령 §163⑨)`,
          )
        : `증여자 취득 당시 환산취득가 ${fmt(a.acquisitionPrice)}${capExStr} — 이월과세 §97의2① (증여자 취득가액 승계·환산)`;
    }
    return `증여자 취득 당시 취득가액 ${fmt(a.acquisitionPrice)}${capExStr} — 이월과세 §97의2① (증여자 취득가액 승계)`;
  }
  // 토지·건물 별개 취득(split) — 파트별 산정방식·취득가액을 엔진 `splitDetail` echo로 그린다(H-1).
  // 겸용(B1)은 위에서 `mixedUseDetail` echo로 이미 처리됐고, 겸용 echo가 없는 구 이력은 여기로 오지 않게 막는다.
  // `result.usedEstimatedAcquisition`·`result.expenses`는 분리 조합에서 신호가 되지 못한다(항상 false·직접경비만).
  if (!result.mixedUseDetail) {
    const splitText = splitAcqFormulaText(result.splitDetail);
    if (splitText) return splitText;
  }
  /**
   * §97②2호 **단서**(swap) — 취득가액 칸은 **나목(자본적지출 + 양도비)** 이다.
   *
   * ## 🔴 2026-08-23 판단(N-5)을 뒤집는다
   *
   * 그때는 「환산 산식은 그대로 두고 **차감 제외 고지만** 덧붙인다」였다(근거: 환산취득가액은
   * 실재하는 값이고 §97②2호 **가목의 구성요소**다). 그 판단은 **`capEx = 0` fixture로만**
   * 검증됐다 — N5 전건이 `capEx` 인자에 0을 넘긴다.
   *
   * `capEx > 0`이면 행의 **값 자체**가 `estimatedBase + capEx`로 부풀어(`DetailedStatementHelpers`
   * 종전 :284) 고지 문구로 설명되지 않는 **제3의 수**가 된다 — 실측 2026-09-15(양도 400,000,000 ·
   * 환산 200,000,000 · 개산공제 4,500,000 · 자본적지출 230,000,000): 취득가액 **430,000,000**.
   * 산식이 그 수를 그대로 그려 **거짓 등식이 완성**됐고, 같은 화면 신고서(230,000,000)와
   * 200,000,000 어긋났다. 「이 금액은 차감되지 않습니다」가 가리키는 대상도 모호했다 —
   * 자본적지출 230,000,000은 **차감된다**(그것이 단서의 전부다).
   *
   * ⇒ 값과 산식을 **나목 축**으로 함께 내리고, 가목(환산취득가액 + 개산공제)은 **비교 근거**로만
   *   남긴다. 비교 수치는 전부 엔진 echo다(`swapComparison` · `estimatedBase` ·
   *   `estimatedDeduction`) — 표시층이 산식을 다시 계산하지 않는다.
   */
  if (result.swapApplied && result.usedEstimatedAcquisition) {
    const direct = capEx + Math.max(0, (result.expenses ?? 0) - capEx);
    const parts = [`자본적지출 ${capEx.toLocaleString()}`];
    const transferExp = Math.max(0, (result.expenses ?? 0) - capEx);
    if (transferExp > 0) parts.push(`양도비 ${transferExp.toLocaleString()}`);
    const head = `${parts.join(" + ")} = ${direct.toLocaleString()} — 「소득세법」 §97②2호 단서 적용`;
    const cmp = result.swapComparison;
    // `swapComparison`이 없는 경로(분리 입력이 아닌 legacy)에서는 비교 괄호를 생략한다 —
    // 없는 수를 지어내지 않는다.
    const basis =
      cmp != null
        ? ` (환산취득가액 ${(result.estimatedBase ?? 0).toLocaleString()} + 개산공제 ${(result.estimatedDeduction ?? 0).toLocaleString()} = ${cmp.estimatedSide.toLocaleString()} < ${cmp.directSide.toLocaleString()}이므로 자본적지출·양도비 합계를 필요경비로 적용 — 환산취득가액은 차감하지 않습니다)`
        : " (가목보다 커 나목을 필요경비로 적용 — 환산취득가액은 차감하지 않습니다)";
    return head + basis;
  }
  if (result.usedEstimatedAcquisition) {
    const estBase = (result.estimatedBase ?? 0).toLocaleString();
    const stdAcq = result.estimatedStdPriceAtAcquisition;
    const stdTransfer = result.estimatedStdPriceAtTransfer;
    /**
     * ⑦ §164⑧ 동일조정기간 환산 고지.
     *
     * 분모(양도당시 기준시가)가 **입력값이 아니라 환산값**일 때 그 사실을 밝힌다. 없으면
     * 사용자가 입력한 기준시가와 산식의 분모가 달라 보여 오류로 오해한다.
     *
     * 🔑 이 빌더는 상세 계산 명세서 카드가 쓰고, 그 카드는 **양도세 결과뷰 4개 전부**가
     *    렌더한다(TransferTaxResultView · BundledAllocationCard · MultiTransferTaxResultView ·
     *    MixedUseResultCard) — 여기 한 곳이면 네 경로 모두 도달한다.
     */
    const sapApplied = result.steps?.some(
      (s) => s.label.includes("동일조정기간") && !s.label.includes("미적용"),
    );
    const sapNote = sapApplied
      ? " ※ 분모의 양도당시 기준시가는 보유기간 중 새 기준시가가 고시되지 않아 시행령 §164⑧·시행규칙 §80①에 따라 환산한 값입니다"
      : "";
    return stdAcq != null && stdTransfer != null
      ? estFrac(
          `환산취득가 ${estBase} = 양도가액 ${totalTransferPrice.toLocaleString()} × `,
          stdAcq,
          stdTransfer,
          `${capExStr}${depStr} — 시행령 §163·§176의2②${sapNote}`,
        )
      : `취득가액(추계) ${estBase}${capExStr}${depStr} — 소득세법 §97 / 시행령 §163·§176의2`;
  }
  // 영 §176조의2④ ② 채택 — 입력 실가가 아니라 실가 + 생산자물가상승분이다(파트 비교는 위 파트 문구)
  if (result.preDeemedPurchaseDetail?.selected === "clause2" && !result.preDeemedPurchaseDetail.part) {
    return `취득가액 ${(singleAcq - capEx + depreciation).toLocaleString()}${capExStr} (취득 당시 실지거래가액 + 생산자물가상승분)${depStr}`;
  }
  // 실가 — 값은 공제 후이므로 산식은 「실지거래가액 − 감가상각비」로 적어 값이 자기를 만들게 한다.
  return depreciation > 0
    ? `취득가액 ${(singleAcq - capEx + depreciation).toLocaleString()}${capExStr} (실제 거래가액)${depStr}`
    : `취득가액 ${(singleAcq - capEx).toLocaleString()}${capExStr} (실제 거래가액)`;
}

/**
 * 필요경비 산식 — 단건은 실제 변수값. 환산모드 본문은 개산공제(취득시 기준시가 × 3%),
 * §97② 단서 swap 시 직접경비(양도비), 실거래는 양도비 합계.
 */
export function buildNecessaryExpenseFormula(
  result: TransferTaxResult,
  isAggregate: boolean,
  singleExp: number,
  /**
   * 엔진이 실제 적용한 개산공제율(시행령 §163⑥). 호출부가 **엔진 leaf**
   * (`estimatedDeductionRate`)로 산출해 넘긴다 — 표시층이 율을 다시 적으면 조문 분기가 갈린다.
   * 미지정이면 율 대신 「개산공제율」이라고만 적는다(거짓 등식을 만들지 않는다).
   */
  lumpRate?: number,
  /** 집계 자산들의 산정방식 집합 — `buildAcquisitionPriceFormula`의 같은 인자. */
  aggModes?: Set<AggHeadingMode>,
): string {
  if (isAggregate) {
    const heading = aggModes && aggregateExpenseHeading(aggModes);
    if (heading) return heading;
    return result.usedEstimatedAcquisition
      ? `자산별 개산공제·양도비 합계 — ${NECESSARY_EXPENSE.LUMP_DEDUCTION}·${NECESSARY_EXPENSE.TRANSFER_COST}`
      : `자산별 양도비 합계 (중개수수료·법무사 비용 등) — ${NECESSARY_EXPENSE.TRANSFER_COST}`;
  }
  // B1 — 겸용 별개 취득 파트 모델: 실거래가 파트는 실제 필요경비, 그 밖은 개산공제(echo `deemedDeduction`).
  const sepExpText = separateAcqExpenseText(result.mixedUseDetail, singleExp);
  if (sepExpText) return sepExpText;
  // 배우자등 이월과세 Scenario A 채택 — 필요경비 = 양도비 등 + 증여세 상당액(§163의2).
  // singleExp = result.expenses − capEx = (양도비 등) + 증여세 상당액 (실가 전환 후 directSide 반영).
  const coA = result.carryoverTaxationDetail;
  // 소유자 분리 — 증여세 상당액은 본인 파트 필요경비에 전액 들어 있다(영 §163의2② 「양도한 해당 자산가액」 · V-5).
  if (coA && isOwnerSplitCarryoverA(result)) {
    const a = coA.scenarioA;
    const splitText = splitExpenseText(result.splitDetail, lumpRate, a.giftTaxAddedToExpense);
    if (splitText) {
      const limitNote = a.giftTaxLimitApplied ? ` (증여세 상당액 한도 ${a.giftTaxLimitCap.toLocaleString()} = 증여세 가산 전 본인 파트 양도차익 적용)` : "";
      const giftNote = a.giftTaxAddedToExpense > 0 ? ` ※ 증여세 상당액 — 이월과세 §97의2①3호·시행령 §163의2②${limitNote}` : "";
      const guardNote = a.donorCapexGuardApplied ? " ※ 양도일 2024-01-01 전 — 증여자 자본적지출 불산입(§97의2①2호 시행일)" : "";
      return splitText + giftNote + guardNote;
    }
  }
  if (coA?.adoptedScenario === "A") {
    const a = coA.scenarioA;
    const gift = a.giftTaxAddedToExpense;
    const totalBaseExp = Math.max(0, singleExp - gift);
    // 증여자 자본적지출(§97의2①2호) — **증여자 취득이 실가일 때만** 필요경비 칸에서 따로 가른다. 실가 donor 는 칸이 (양도비 + 증여자 자본적지출 + 증여세)로 정확히 분해된다.
    //   환산 donor 는 본문(= 개산공제)이면 자본적지출이 필요경비에 들어가지 않고, 단서(나목)이면 칸이 「취득가액 = 환산취득가 · 필요경비 = 역산 나머지」라 자본적지출이 두 칸에 걸쳐
    //   분해되지 않는다(실측: 증여자 자본적지출 500,000,000 → 필요경비 칸 250,000,000) — 그 구간은 종전 문구를 둔다(별건).
    //   양도일 2024-01-01 전이면 에코가 0 이다(`carryoverDonorCapex`). 「양도비 등」에 섞어 적으면 중개수수료 같은 양도비로 읽힌다.
    const donorCapex = a.acquisitionWasEstimated === true ? 0 : Math.min(a.donorCapexAddedToExpense, totalBaseExp);
    const baseExp = totalBaseExp - donorCapex;
    // 증여자 취득이 환산(estimated) 모드면 본문 필요경비는 실제 양도비가 아니라
    // 개산공제(취득시 기준시가 × 3%, 시행령 §163⑥)다.
    //
    // ⚠️ 종전에는 **금액 자기일치**(`baseExp === floor(기준시가 × 3%)`)로 이를 역추론했다.
    //    UI가 §163⑥ 산식을 재구현하는 dual-truth였고, 공유지분 축소처럼 등식이 깨지는 변경이
    //    들어오면 개산공제를 "양도비 등"으로 **성격 자체를 오표시**한다.
    //    → 엔진 echo(`necessaryExpenseIsLumpDeduction`)로 판정하고, 산식 base도
    //      엔진이 실제로 쓴 값(`lumpDeductionBase` = 지분 기준시가)을 노출한다.
    const stdAcq = a.estimatedStdPriceAtAcquisition;
    const lumpBase = a.lumpDeductionBase ?? stdAcq;
    const isLumpDeduction = a.necessaryExpenseIsLumpDeduction === true && lumpBase != null;
    const baseLabel = isLumpDeduction
      ? `개산공제 ${baseExp.toLocaleString()} = 취득시 기준시가 ${lumpBase!.toLocaleString()} × ${formatLumpRate(lumpRate)} — 시행령 §163⑥`
      : `양도비 등 ${baseExp.toLocaleString()} (중개수수료·법무사 비용 등) — ${NECESSARY_EXPENSE.TRANSFER_COST}`;
    // 증여자 자본적지출만 있고 양도비 등이 0 이면 「양도비 등 0」 항을 적지 않는다.
    const parts: string[] = donorCapex > 0 && baseExp === 0 ? [] : [baseLabel];
    if (donorCapex > 0) {
      parts.push(`증여자 자본적지출 ${donorCapex.toLocaleString()} — 이월과세 §97의2①2호`);
    }
    if (gift > 0) {
      const limitNote = a.giftTaxLimitApplied
        ? ` (한도 ${a.giftTaxLimitCap.toLocaleString()} = 증여세 가산 전 양도차익 적용)`
        : "";
      parts.push(`증여세 상당액 ${gift.toLocaleString()}${limitNote} — 이월과세 §97의2①3호·시행령 §163의2②`);
    }
    const guardNote = a.donorCapexGuardApplied
      ? " ※ 양도일 2024-01-01 전 — 증여자 자본적지출 불산입(§97의2①2호 시행일)"
      : "";
    const body = parts.length > 1 ? `${parts.join(" + ")} = ${fmt(singleExp)}` : parts[0];
    return body + guardNote;
  }
  // 토지·건물 별개 취득(split) — 파트별 자본적지출·양도비 + 개산공제. 개산공제·swap 파트가 없으면(실거래가/실거래가)
  // 종전 문구를 그대로 쓴다. 겸용은 위 B1 분기가 먼저 처리한다.
  if (!result.mixedUseDetail) {
    const splitText = splitExpenseText(result.splitDetail, lumpRate);
    if (splitText) return splitText;
  }
  if (result.usedEstimatedAcquisition) {
    if (result.swapApplied) {
      // 취득가액 칸이 **나목**(자본적지출 + 양도비)이므로 이 칸은 양도비만 남는다.
      // 종전 문구(「자본적지출은 취득가액에 합산 표시」)는 취득가액 칸에 환산취득가액까지
      // 섞여 있던 동안 **사실이 아니었다** — 그 칸이 나목 축으로 내려와 이제 성립한다.
      return `양도비 ${singleExp.toLocaleString()} (「소득세법」 §97②2호 단서 적용 — 자본적지출은 취득가액 칸에 합산 표시)`;
    }
    const ded = (result.estimatedDeduction ?? 0).toLocaleString();
    const stdAcq = result.estimatedStdPriceAtAcquisition;
    const rateLabel = formatLumpRate(lumpRate);
    return stdAcq != null
      ? `개산공제 ${ded} = 취득시 기준시가 ${stdAcq.toLocaleString()} × ${rateLabel} — ${NECESSARY_EXPENSE.LUMP_DEDUCTION}`
      : `개산공제 ${ded} (취득시 기준시가 × ${rateLabel}) — ${NECESSARY_EXPENSE.LUMP_DEDUCTION}`;
  }
  // 실가 모드 — 자본적지출은 취득가액이 아니라 **필요경비**다(§97① 2호). 이 칸은 엔진이 차감한 전액이므로
  // 자본적지출과 양도비를 풀어 쓴다. (예외 축 swap·이월과세 A는 위 분기가 먼저 처리한다.)
  const capEx = result.capitalExpenditureForDisplay ?? 0;
  if (capEx > 0 && capEx <= singleExp) {
    const transferExp = singleExp - capEx;
    return transferExp > 0
      ? `자본적지출 ${capEx.toLocaleString()} + 양도비 ${transferExp.toLocaleString()} (중개수수료·법무사 비용 등) = ${singleExp.toLocaleString()} — §97① 2호·3호`
      : `자본적지출 ${capEx.toLocaleString()} — §97① 2호`;
  }
  return `양도비 ${singleExp.toLocaleString()} (중개수수료·법무사 비용 등) — ${NECESSARY_EXPENSE.TRANSFER_COST}`;
}
