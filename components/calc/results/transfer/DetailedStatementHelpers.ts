/**
 * 계산결과 상세명세서 — 32 항목 매핑 헬퍼
 *
 * 신고서 양식 표(FilingFormTable)와 동일한 32 항목을 5~7 그룹으로 묶어
 * 각 항목별 산식·실제 변수값·법령을 노출.
 *
 * 정책 준수:
 *  - 엔진 변경 0 — 기존 result.steps[]·result 필드·PerPropertyBreakdown만 가공
 *  - 800줄 정책 — Helpers / Groups / Card 3파일 분할
 */

import type { ReactNode } from "react";
import {
  effectiveGrossGain,
  inverseAcquisitionForDisplay,
} from "@/components/calc/results/transfer/exempt-gross-gain";
import type { TransferTaxResult } from "@/lib/tax-engine/transfer-tax";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import type { AggregateMeta } from "./FilingFormTableHelpers";
import {
  fmtDate,
  fmtPeriod,
  holdingPeriodFromDates,
  getAcqDateForCard,
} from "./FilingFormTableHelpers";
import {
  buildGbTransferFormula,
  buildGbAcquisitionFormula,
  buildGbExpenseFormula,
  buildSubGainFormula,
  buildAcquisitionPriceFormula,
  buildNecessaryExpenseFormula,
  buildTaxableGainFormula,
  buildIncomeFormula,
  buildIncomeDeductionReducibleFormula,
  prorationFormulaAsFrac,
} from "./DetailedStatementFormulaBuilders";
import { appendLateStageItems } from "./DetailedStatementLateStages";
import { setLongTermDeductionItems } from "./DetailedStatementLthdItems";
import {
  reductionEligibleIncome,
  incomeDeductionReducible,
  pickIncomeDeductionFormulaSource,
  eligibleIncomeBasisText,
} from "./reduction-eligible-income";
import { INCOME_DEDUCTION_5YEAR_FORMULA } from "./DetailedStatementFormulaNodes";

// 타입·그룹 정의는 DetailedStatementConfig.ts로 분리 (800줄 정책). 하위 호환 re-export.
// ⚠️ 자동 정리(eslint no-unused-vars)가 `PerAssetValue` 를 여기서 **두 번** 지웠다 —
//    `export type { … }` 는 「미사용」으로 보인다. 내 보호 규칙이 `export {` 만 봐서
//    타입 재export 를 놓쳤다([[feedback_800line_split_playbook]] · 소비처 2곳이 tsc 로 잡았다).
export type { PerAssetValue, StatementItem, GroupDef } from "./DetailedStatementConfig";
export { STATEMENT_GROUPS } from "./DetailedStatementConfig";
import type { PerAssetValue, StatementItem } from "./DetailedStatementConfig";
import { resolveReceiveOnlyDisplay } from "./receive-only-display";

// ── 헬퍼 ─────────────────────────────────────────────────────────

/**
 * 그 자산의 거주 개월수 — 구간 입력(`interval`)이면 구간 합, 아니면 직접 입력 월수.
 *
 * 자산별로 부를 수 있도록 함수로 뽑았다(종전에는 대표 자산 하나에 대해 인라인 IIFE였다).
 * 구간의 종료일이 비면 그 자산의 **양도일**로 마감한다 — 다건에서는 신고단위 양도일이 아니라
 * 그 양도건 자신의 양도일이어야 한다.
 */
export function residenceMonthsOfAsset(
  asset: AssetForm | undefined,
  transferDate: string,
): number {
  const ps = asset?.residenceInputMode === "interval" ? (asset.residencePeriods ?? []) : [];
  if (ps.length > 0) {
    return ps.reduce((sum, pp) => {
      const end = pp.moveOutDate || transferDate;
      const a = new Date(pp.moveInDate);
      const t = new Date(end);
      if (isNaN(a.getTime()) || isNaN(t.getTime())) return sum;
      let m = (t.getFullYear() - a.getFullYear()) * 12 + (t.getMonth() - a.getMonth());
      if (t.getDate() < a.getDate()) m -= 1;
      return sum + Math.max(0, m);
    }, 0);
  }
  return parseInt(asset?.residencePeriodMonthsAsset || "0") || 0;
}

// 800줄 분리 — 양쪽이 함께 쓰는 두 헬퍼는 `DetailedStatementLeaf.ts`(순환 차단 leaf)로 이동.
import { findStepByLabel, buildPerAssetWithFormula } from "./DetailedStatementLeaf";
export { findStepByLabel, buildPerAssetWithFormula };


// ── 32 항목 빌더 ──────────────────────────────────────────────────

/**
 * 32 항목 → StatementItem 매핑 생성.
 *
 * 단건 모드: aggregate 미전달 → 합계 행만 채움 (perAsset 없음)
 * 다건 모드: aggregate.properties 사용 → 자산별 분해 추가
 */
export function buildStatementItems(
  result: TransferTaxResult,
  formData: TransferFormData | undefined,
  asset: AssetForm | undefined,
  aggregate: AggregateMeta | undefined,
  transferPriceOverride: number | undefined,
  acquisitionDateLabel?: string,
  acquisitionDateOverride?: string,
): Map<string, StatementItem> {
  const items = new Map<string, StatementItem>();
  // receiveOnly(사례 46) — 신고단위 양도가액·양도일은 청산금 분 단독이다(§166①2호 가목).
  // ④ API 변환(`transfer-tax-api.ts:332`·`:341`)과 같은 규칙을 ⑦ 표시에 적용한다.
  const receiveOnly = resolveReceiveOnlyDisplay(
    result,
    transferPriceOverride ?? (formData?.contractTotalPrice ? Number(formData.contractTotalPrice) : 0),
    formData?.transferDate ?? "",
  );
  const transferDate = receiveOnly.transferDate;
  const primary = asset ?? formData?.assets[0];
  const isAggregate = !!aggregate && aggregate.properties.length > 0;
  const properties = aggregate?.properties ?? [];

  /**
   * 다건(multi)에서 **그 양도건 자신의** 자산·양도일을 돌려준다.
   *
   * 🔴 종전에는 자산별 날짜를 전부 `primary`(1번 양도건의 자산 하나)로 조회했다.
   *   `getAcqDateForCard`는 «일반건물 자산 안의 파트 카드»를 가르는 함수라 일반건물이 아니면
   *   pid를 무시하고 그 자산의 취득일을 그대로 돌려준다 — 그래서 2019년 아파트와 2005년 토지를
   *   다건으로 신고하면 명세서의 두 자산 취득일이 **둘 다 2019년**이 됐다. 양도일자는 아예
   *   자산 축이 없어 1번 건의 값 하나뿐이었다. 같은 화면 신고서 양식은 `propertyFormMap`으로
   *   정확히 표시하고 있었다 (결과탭 코드리뷰 #054·#093).
   */
  const assetOf = (pid: string) => aggregate?.propertyFormMap?.get(pid)?.assets[0] ?? primary;
  const transferDateOf = (pid: string) =>
    aggregate?.propertyFormMap?.get(pid)?.transferDate ?? transferDate;
  const acqDateOf = (pid: string) => getAcqDateForCard(assetOf(pid), pid);
  // 일반건물 일괄 모드(사례 31·33) — 자산별 산식 빌더에 전달할 분모/분자 변수.
  // 비-일반건물 모드에서는 undefined → formulaBuilder가 undefined 반환 → 산식 미표시.
  const gbDetail = result.generalBuildingValuationDetail;
  // 부담부증여 모드 — 자산별 §159 산식 빌더에 전달할 분모/분자 변수 (perAsset.{land,building}).
  // 비-부담부증여 모드에서는 undefined → 빌더가 일반건물·기본 분기로 진행.
  const burdenedGift = (result as unknown as {
    transferBurdenedGiftBreakdown?: import("@/lib/tax-engine/types/transfer-burdened-gift.types").TransferBurdenedGiftBreakdown;
  }).transferBurdenedGiftBreakdown;

  // 양도가액 우선순위: receiveOnly 보정 > override > result.steps의 amount > 0
  const totalTransferPrice = receiveOnly.transferPrice;

  // ── 1단계: 일자·기간 ────────────────────────────────────────
  items.set("transferDate", {
    label: "양도일자",
    value: fmtDate(transferDate),
    formula: "사용자 입력 (계약상 잔금청산일 또는 등기접수일 중 빠른 날)",
    legalBasis: "소득세법 §98",
    perAsset: isAggregate
      ? properties.map((p) => ({
          label: p.propertyLabel,
          value: fmtDate(transferDateOf(p.propertyId)),
        }))
      : undefined,
  });

  // 취득일자 — override 우선 (이월과세 Scenario A: 증여자 취득일)
  const displayAcqDate =
    acquisitionDateOverride && acquisitionDateOverride !== ""
      ? acquisitionDateOverride
      : primary?.acquisitionDate ?? "";
  items.set("acquisitionDate", {
    label: acquisitionDateLabel ? `취득일자 ${acquisitionDateLabel}` : "취득일자",
    value: fmtDate(displayAcqDate),
    formula: acquisitionDateOverride
      ? "이월과세 적용 시 증여자 취득일 기산 (소득세법 §97조의2 ①)"
      : "사용자 입력 (등기접수일 또는 잔금청산일 중 빠른 날)",
    legalBasis: acquisitionDateOverride ? "소득세법 §97조의2" : "소득세법 §98",
    perAsset: isAggregate
      ? properties.map((p) => ({
          label: p.propertyLabel,
          value: fmtDate(acqDateOf(p.propertyId)),
        }))
      : undefined,
  });

  items.set("holdingPeriod", {
    label: "보유기간",
    value: holdingPeriodFromDates(displayAcqDate, transferDate),
    formula: `양도일 ${fmtDate(transferDate)} − 취득일 ${fmtDate(displayAcqDate)} = ${holdingPeriodFromDates(displayAcqDate, transferDate)} (연·월 차이)`,
    legalBasis: "소득세법 §95②",
    perAsset: isAggregate
      ? properties.map((p) => ({
          label: p.propertyLabel,
          value: holdingPeriodFromDates(
            acqDateOf(p.propertyId),
            transferDateOf(p.propertyId),
          ),
        }))
      : undefined,
  });

  const periods = primary?.residenceInputMode === "interval"
    ? primary.residencePeriods ?? []
    : [];
  const firstMoveIn = periods.length > 0 ? periods[0].moveInDate : "";
  const lastMoveOut = periods.length > 0
    ? (periods[periods.length - 1].moveOutDate || transferDate)
    : "";
  const residenceMs = residenceMonthsOfAsset(primary, transferDate);
  /**
   * 다건 모드에서 **그 양도건 자신의** 거주 개월수. 종전에는 자산별 장특 분할에도
   * 1번 자산의 거주 개월수를 그대로 썼다 — 거주 사실이 없는 토지·상가에까지 「거주 기간분」이
   * 배정되고, 반대 배치에서는 실제 거주한 자산의 거주분이 0으로 눌렸다.
   */
  const residenceMsOf = (pid: string) =>
    residenceMonthsOfAsset(assetOf(pid), transferDateOf(pid));

  items.set("moveOut", {
    label: "퇴거일",
    value: lastMoveOut ? fmtDate(lastMoveOut) : "-",
    formula: "마지막 거주기간 종료일",
    legalBasis: "소득세법 시행령 §161",
  });
  items.set("moveIn", {
    label: "입주일",
    value: firstMoveIn ? fmtDate(firstMoveIn) : "-",
    formula: "최초 거주 시작일",
    legalBasis: "소득세법 시행령 §161",
  });
  items.set("residencePeriod", {
    label: "거주기간",
    value: fmtPeriod(residenceMs),
    formula: periods.length > 0 ? `${periods.map((pp) => `${fmtDate(pp.moveInDate)}~${fmtDate(pp.moveOutDate || transferDate)}`).join(" + ")} = ${fmtPeriod(residenceMs)}` : `${fmtPeriod(residenceMs)} (직접 입력 · 월 단위)`,
    legalBasis: "소득세법 §95②·시행령 §161",
  });

  // ── 2단계: 양도차익 산정 ─────────────────────────────────────
  const sumPropTransfer = isAggregate
    ? properties.reduce((s, p) => s + p.transferPrice, 0)
    : 0;

  items.set("transferPrice", {
    label: "양도가액",
    value: isAggregate ? sumPropTransfer : totalTransferPrice,
    formula: burdenedGift
      ? `양도가액 = 인수 채무액 (보증금 ${burdenedGift.assumedDebtAmount.toLocaleString()} 합계) = ${burdenedGift.assumedDebtAmount.toLocaleString()} (소령 §159 — 채무 인수분이 양도가액으로 의제, 자산별 §166⑥ 비율 안분)`
      : isAggregate
        ? "자산별 양도가액 합계 — §166⑥ 안분(토지·건물·증축건물 기준시가 비율) 후"
        : "사용자 입력 (실제 매매계약서상 거래금액)",
    legalBasis: burdenedGift
      ? "소득세법 시행령 §159·§166"
      : "소득세법 시행령 §166",
    perAsset: isAggregate
      ? buildPerAssetWithFormula(
          properties,
          (p) => p.transferPrice,
          (p) => buildGbTransferFormula(p, gbDetail, totalTransferPrice || sumPropTransfer, burdenedGift),
        )
      : undefined,
  });

  // 취득가액 — 신고서 양식 표시 관행: 자본적지출은 취득가액에 합산
  const sumAcq = isAggregate
    ? properties.reduce(
        (s, p) => s + p.acquisitionPrice + p.capitalExpenditureForDisplay,
        0,
      )
    : 0;
  const capEx = result.capitalExpenditureForDisplay ?? 0;
  /*
   * 🔴 종전에는 `result.transferGain`을 그대로 뺐다. 전액 비과세 자산은 그 값이 **0**이라
   *   취득가액이 「양도가액 − 0 − 경비」, 즉 사실상 **양도가액 전액**으로 표시됐다
   *   (실측: 취득가 400,000,000 입력 → 1,000,000,000 표시). 같은 화면의 신고서 양식은
   *   이미 gross echo로 보정하고 있어 두 카드가 정면으로 어긋났다.
   */
  const singleGrossGain = effectiveGrossGain(result);
  /**
   * 환산취득가(§97②2호 **본문**) — 엔진이 자본적지출·양도비를 차감하지 않고 필요경비개산공제
   * (§163⑥)로 갈음하는 구간. 신고서 양식의 `estimatedDisplay` 게이트와 **같은 조건**이다
   * (단서 swap은 실가 축으로 내려간다).
   */
  const estimatedNoSwap =
    result.usedEstimatedAcquisition === true && result.swapApplied !== true;
  const singleAcq = result.usedEstimatedAcquisition
    ? // 🔴 종전에는 여기서도 `+ capEx`를 했다. 엔진이 차감하지 않은 금액이라 그만큼
      //   「양도가액 − 취득가액 − 필요경비 = 양도차익」이 깨졌다(결과탭 코드리뷰 #069).
      (result.estimatedBase ?? 0) + (estimatedNoSwap ? 0 : capEx)
    : inverseAcquisitionForDisplay({
        transferPrice: totalTransferPrice,
        grossGain: singleGrossGain,
        expenses: result.expenses ?? 0,
        capEx,
      });
  // 단건: 실제 변수값을 풀어쓴 산식 (양도차익 항목과 동일 표기). 다건은 자산별 perAsset이 담당.
  const acqFormula = buildAcquisitionPriceFormula(
    result,
    isAggregate,
    totalTransferPrice,
    singleAcq,
    capEx,
  );

  items.set("acquisitionPrice", {
    label: "취득가액",
    value: isAggregate ? sumAcq : singleAcq,
    formula: acqFormula,
    legalBasis: "소득세법 §97 / 시행령 §163·§176의2",
    perAsset: isAggregate
      ? buildPerAssetWithFormula(
          properties,
          (p) => p.acquisitionPrice + p.capitalExpenditureForDisplay,
          (p) => buildGbAcquisitionFormula(p, gbDetail, primary, burdenedGift),
        )
      : undefined,
  });

  // 필요경비 — 신고서 양식 표시 관행: 양도비만 (자본적지출 분리)
  const sumExp = isAggregate
    ? properties.reduce(
        (s, p) => s + Math.max(0, p.necessaryExpense - p.capitalExpenditureForDisplay),
        0,
      )
    : 0;
  // 환산모드 본문에서 result.expenses 는 이미 개산공제(estimatedDeduction)만 담는다
  // (transfer-tax-helpers calcNecessaryExpense).
  // 🔴 그런데도 종전에는 거기서 `capEx`를 **또** 뺐다. 개산공제가 자본적지출보다 작으면 필요경비가
  //   0으로 눌려(실측 3,000,000 − 20,000,000 → 0) 「양도 − 취득 − 경비 = 차익」이 깨졌다.
  //   환산 본문은 자본적지출이 애초에 들어 있지 않으므로 뺄 것이 없다(결과탭 코드리뷰 #069).
  const singleExp = estimatedNoSwap
    ? (result.expenses ?? 0)
    : Math.max(0, (result.expenses ?? 0) - capEx);
  const expFormula = buildNecessaryExpenseFormula(result, isAggregate, singleExp);

  items.set("expenses", {
    label: "필요경비",
    value: isAggregate ? sumExp : singleExp,
    formula: expFormula,
    legalBasis: "소득세법 §97 / 시행령 §163⑥",
    perAsset: isAggregate
      ? buildPerAssetWithFormula(
          properties,
          (p) => Math.max(0, p.necessaryExpense - p.capitalExpenditureForDisplay),
          (p) => buildGbExpenseFormula(p, gbDetail, burdenedGift),
        )
      : undefined,
  });

  const gainStep = findStepByLabel(result.steps, "양도차익");
  // 비과세 자산은 `transferGain`이 0이므로 gross echo를 쓴다 — 신고서 양식과 같은 축.
  const totalTransferGainVal = isAggregate
    ? properties.reduce((s, p) => s + effectiveGrossGain(p), 0)
    : singleGrossGain;
  items.set("transferGain", {
    label: "전체 양도차익",
    value: totalTransferGainVal,
    formula: gainStep?.formula ?? "양도가액 − 취득가액 − 필요경비",
    legalBasis: gainStep?.legalBasis ?? "소득세법 §95①",
    perAsset: isAggregate
      ? // 🔴 비과세 자산은 `transferGain`이 0이라 자산별 행이 0을 찍고 합계와 어긋났다
        //   (합계는 :366에서 이미 `effectiveGrossGain`으로 고쳐져 있었다 — 같은 축으로 맞춘다).
        buildPerAssetWithFormula(properties, (p) => effectiveGrossGain(p), buildSubGainFormula)
      : undefined,
  });

  /**
   * §161(장기임대주택 보유자 거주주택 비과세) 경로인가 — **양도차익 축이 통째로 다르다**.
   *
   * 🔴 그 경로에서 `result.taxableGain`은 양도차익이 아니라 **장특공제·§161 안분이 끝난
   *   과세대상 양도소득금액**이다(`transfer-tax-rental-housing-step.ts:617`
   *   `taxableGain: totalTaxableIncome`). 그대로 「전체 양도차익 − taxableGain」을 하면
   *   「비과세 양도차익」이 **장특공제액만큼 부풀고**, 「과세대상 양도차익」 자리에는
   *   소득금액이 실린다.
   *
   * §161은 비과세를 **양도차익 단계가 아니라 양도소득금액 단계에서** 가른다. 그래서
   *   신고서 정본(`FilingFormTableHelpers.ts:531~532`)은 같은 상황에서
   *   `비과세 양도차익 = 0` · `과세대상 양도차익 = 전체 양도차익`으로 **명시 분기**한다.
   *   비과세분은 아래 「비과세 양도소득금액 (소령 §161①)」 행이 따로 보여 준다.
   *
   * ⚠️ 이 플래그는 4단계 「양도소득금액」에서도 쓴다 — 두 자리가 같은 사실을 봐야 한다.
   */
  const isRentalHousingException = result.rentalHousingExceptionDetail?.applied === true;

  // 비과세 자산은 `transferGain`이 0이라 「비과세 양도차익」까지 0이 됐다 — gross 축으로 맞춘다
  // (신고서 정본: `FilingFormTableHelpers.ts:644`).
  const exemptGainSingle = isRentalHousingException
    ? 0
    : Math.max(0, singleGrossGain - result.taxableGain);
  const exemptGainAgg = isAggregate
    ? properties.reduce((s, p) => {
        const gross = effectiveGrossGain(p);
        return (
          s +
          Math.max(
            0,
            gross -
              (gross > 0
                ? Math.min(gross, Math.max(0, p.income) + p.longTermHoldingDeduction)
                : gross),
          )
        );
      }, 0)
    : 0;
  const exemptVal = isAggregate ? exemptGainAgg : exemptGainSingle;
  const taxableGainVal = isAggregate
    ? properties.reduce(
        (s, p) =>
          s +
          (p.transferGain > 0
            ? Math.min(
                p.transferGain,
                Math.max(0, p.income) + p.longTermHoldingDeduction,
              )
            : p.transferGain),
        0,
      )
    : isRentalHousingException
      ? singleGrossGain
      : result.taxableGain;
  // 순환 참조 제거: 과세대상 양도차익을 독립 산식(엔진 §95③ 12억 초과 안분 STEP 재사용)으로,
  // 비과세 양도차익을 차감(전체 − 과세대상)으로 방향 고정. 전액 과세(비과세 0) 케이스는 별도 문구.
  const proratedStep = isAggregate
    ? undefined
    : findStepByLabel(result.steps, "과세 양도차익 (12억 초과분)");
  const taxableFormula: ReactNode = isAggregate
    ? "각 자산 과세대상 양도차익 합계"
    : isRentalHousingException
      ? `전체 양도차익 ${totalTransferGainVal.toLocaleString()} (§161①은 양도소득금액 단계에서 비과세분을 가른다)`
      : proratedStep
      ? prorationFormulaAsFrac(proratedStep.formula)
      : exemptVal <= 0
        ? `전체 양도차익 ${totalTransferGainVal.toLocaleString()} (전액 과세)`
        : `전체 양도차익 ${totalTransferGainVal.toLocaleString()} − 비과세 양도차익 ${exemptVal.toLocaleString()}`;
  const exemptFormula = isAggregate
    ? "각 자산 비과세 양도차익 합계 (§89 비과세 또는 §95 12억 초과 안분)"
    : isRentalHousingException
    ? "§161①은 양도차익이 아니라 양도소득금액 단계에서 비과세분을 가른다 — 아래 「비과세 양도소득금액 (소령 §161①)」 행 참조"
    : `전체 양도차익 ${totalTransferGainVal.toLocaleString()} − 과세대상 양도차익 ${taxableGainVal.toLocaleString()} (§89 비과세 또는 §95 12억 초과 안분)`;
  items.set("exemptGain", {
    label: "비과세 양도차익",
    value: exemptVal,
    formula: exemptFormula,
    legalBasis: "소득세법 §89·§95",
  });

  items.set("taxableGain", {
    label: "과세대상 양도차익",
    value: taxableGainVal,
    formula: taxableFormula,
    legalBasis: "소득세법 §92",
    perAsset: isAggregate
      ? properties.map((p) => ({
          label: p.propertyLabel,
          value:
            p.transferGain > 0
              ? Math.min(
                  p.transferGain,
                  Math.max(0, p.income) + p.longTermHoldingDeduction,
                )
              : p.transferGain,
          formula: buildTaxableGainFormula(p),
        }))
      : undefined,
  });

  // ── 3단계: 장기보유특별공제 ──────────────────────────────────
  // 빌더는 sibling 모듈로 분리 (800줄 정책 준수).
  setLongTermDeductionItems(items, {
    result,
    isAggregate,
    properties,
    primary,
    transferDate,
    residenceMs,
    residenceMsOf,
    acqDateOf,
    transferDateOf,
  });

  // ── 4단계: 양도소득금액·기본공제 ────────────────────────────
  /**
   * 🔴 **`findStepByLabel`은 부분일치라 「비과세 양도소득금액」을 잡는다** (2026-09-07 UI 리뷰).
   *
   * §161 경로의 steps에는 순수 「양도소득금액」 step이 없다 — 엔진이 STEP 4.5 앞에서
   * 즉시 반환하기 때문이다(`transfer-tax.ts:437~451`). 남는 것은
   * 「비과세 양도소득금액 (소령 §161①)」뿐이라, 그 산식(`§95① 양도소득금액 X −
   * 과세대상 양도소득금액 Y = Z`)과 법령이 **「양도소득금액」 행에** 붙어 바로 아래
   * 비과세 행과 같은 산식이 두 번 찍혔다. 비과세 라벨을 먼저 걸러낸다.
   */
  const incomeStep = findStepByLabel(
    result.steps?.filter((s) => !s.label?.includes("비과세")),
    "양도소득금액",
  );
  const sumIncome = isAggregate
    ? properties.reduce((s, p) => s + p.incomeAfterOffset, 0)
    : 0;
  /**
   * §161(장기임대주택 보유자 거주주택 비과세, `isRH`)만 **분기한다** (2026-09-06 · UI 리뷰
   * `rh161-income-double-deduct`).
   *
   * 🔴 그 경로에서 엔진은 `taxableGain` 슬롯에 **이미 장특공제·§161 안분이 끝난 양도소득금액**을
   *   담는다(`transfer-tax-rental-housing-step.ts:617` `taxableGain: totalTaxableIncome`).
   *   여기서 장특공제를 또 빼면 「양도소득금액」이 그만큼 과소 표시되고, 바로 아래
   *   「감면후 소득금액」은 isRH 분기를 타 `result.taxableGain`을 그대로 쓰므로
   *   **감면후가 감면 전보다 커지는** 자기모순이 표에 그대로 남는다.
   *
   * 🔑 신고서 카드(`FilingFormTableHelpers.ts:603`)는 이미 같은 분기를 쓴다 — 두 카드의
   *   「양도소득금액」이 갈리지 않도록 **같은 식**을 쓴다(비과세분은 아래 「비과세 양도소득금액
   *   (소령 §161①)」 행이 별도로 보여 준다 — 신고서와 같은 구조다).
   *
   * ⚠️ 이 값은 ⑲ 세액감면대상금액 산정에도 그대로 흘러간다(:515).
   */
  const singleIncome = isRentalHousingException
    ? result.transferGain - result.longTermHoldingDeduction
    : Math.max(0, result.taxableGain - result.longTermHoldingDeduction);
  items.set("incomeAmount", {
    label: "양도소득금액",
    value: isAggregate ? sumIncome : singleIncome,
    formula:
      incomeStep?.formula ?? "과세대상 양도차익 − 장기보유특별공제 (음수 시 0)",
    legalBasis: incomeStep?.legalBasis ?? "소득세법 §95①",
    note: isAggregate
      ? "다건 모드: §102② 차손통산(같은 그룹 우선·타군 안분) 후의 자산별 합계"
      : isRentalHousingException
        ? "§161 특례: 전체 양도차익 기준(비과세분 포함) — 비과세 부분은 아래 행에서 차감합니다"
        : undefined,
    perAsset: isAggregate
      ? buildPerAssetWithFormula(
          properties,
          (p) => p.incomeAfterOffset,
          buildIncomeFormula,
        )
      : undefined,
  });

  // 비과세 양도소득금액 — 엔진이 emit한 §161① step의 산식·법령 우선 사용 (정확한 변수값).
  const nontaxStep = findStepByLabel(result.steps, "비과세 양도소득금액");
  items.set("nontaxableIncome", {
    label: "비과세 양도소득금액 (소령 §161①)",
    value: result.nontaxableGainAmount ?? 0,
    formula:
      nontaxStep?.formula ??
      "§95① 양도소득금액 − 과세대상 양도소득금액 — §155⑳ + §161 안분 비과세 부분",
    legalBasis: nontaxStep?.legalBasis ?? "소득세법 시행령 §161·§155⑳",
    note: "장기임대주택 거주주택 비과세 특례 시만 표시",
  });

  // ⑲ 세액감면대상금액 = 감면대상 양도소득금액 (§90① — 감면율 前). §77 계열 reducibleIncome은 감면율 곱값이라 부적합.
  const eligibleIncomeOf = (p: (typeof properties)[number]) =>
    reductionEligibleIncome(
      p.reductionType,
      p.income,
      p.reducibleIncome ?? 0,
      p.replacementLandDetail?.eligibleTransferIncome,
    );
  const eligibleValue = isAggregate
    ? properties.reduce((s, p) => s + eligibleIncomeOf(p), 0)
    : reductionEligibleIncome(
        result.reductionTypeApplied,
        singleIncome,
        result.reducibleIncome ?? 0,
        result.replacementLandDetail?.eligibleTransferIncome,
      );
  items.set("reductionTargetIncome", {
    label: "세액감면대상금액",
    value: eligibleValue,
    // ⑲는 **감면율을 곱하기 前** 대상 소득금액이다(부표1 작성방법 14번 — 감면율은 16번 별도 칸).
    // 조문마다 기준이 달라(전액/대토보상분/임대기간 안분) 그 근거를 함께 보인다.
    formula: isAggregate
      ? `자산별 감면 적용 대상 양도소득금액 합계 = ${eligibleValue.toLocaleString()} (§90① 세액감면방식 — 감면율·기본공제 前)`
      : `${eligibleIncomeBasisText(result.reductionTypeApplied, eligibleValue)} — §90① 세액감면방식이라 감면율·기본공제를 곱하기 전 금액이며, 소득금액에서 차감하지 않습니다`,
    legalBasis: "소득세법 §90① · 조세특례제한법 §127",
    perAsset: isAggregate
      ? buildPerAssetWithFormula(
          properties,
          eligibleIncomeOf,
          (p) => (eligibleIncomeOf(p) > 0 ? `감면 대상 양도소득금액 = ${eligibleIncomeOf(p).toLocaleString()}` : "감면 대상 없음"),
        )
      : undefined,
  });

  // 소득금액차감방식(§90②) 5년 안분 감면대상 양도소득금액 — §99의3·§99·§98의8·하이브리드 공용.
  // 집계(다건)는 PerPropertyBreakdown의 incomeDeductionReducible 합산, 단건은 result detail 합산 헬퍼.
  const aggIncomeDeductionReducible = isAggregate
    ? properties.reduce((s, p) => s + (p.incomeDeductionReducible ?? 0), 0)
    : 0;
  const singleIncomeDeduction = incomeDeductionReducible(result);
  const incomeDeductionFormulaSource = pickIncomeDeductionFormulaSource(result);
  items.set("reductionTargetIncome2", {
    label: "소득금액 감면대상",
    value: isAggregate ? aggIncomeDeductionReducible : singleIncomeDeduction,
    formula:
      // 소득금액차감 8조문 공용 — 3시점 기준시가 echo가 있으면 값이 대입된 분수 산식을 쓴다.
      // 감면액이 0이어도 값과 사유를 함께 보인다(결과만 0이면 왜 0인지 알 수 없다).
      // echo가 없는 구 저장 이력·다건 집계는 종전 일반 문구로 fallback.
      !isAggregate && incomeDeductionFormulaSource
        ? buildIncomeDeductionReducibleFormula(incomeDeductionFormulaSource, singleIncome)
        : INCOME_DEDUCTION_5YEAR_FORMULA,
    legalBasis: "조세특례제한법 §99의3·§99·§98의8 등 · 소득세법 §90②",
    note: "신축·미분양 등 소득금액차감 감면 — 소득금액에서 직접 차감(세액감면방식 아님)",
  });

  // 감면후 소득금액 = 양도소득금액 − 소득금액 감면대상(§90② 소득금액차감). FilingFormTableHelpers와 동일.
  // §161(장기임대 거주주택 비과세, isRH)은 taxableGain이 이미 안분 후 값이므로 별도 분기.
  // 위 4단계에서 이미 판정했다 — 같은 술어를 두 번 쓰지 않는다(두 곳이 갈리면 표가 다시 모순된다).
  const isRH = isRentalHousingException;
  const incomeAfterValue = isAggregate
    ? properties.reduce((s, p) => s + Math.max(0, p.incomeAfterOffset - (p.incomeDeductionReducible ?? 0)), 0)
    : isRH
      ? result.taxableGain
      : Math.max(0, singleIncome - singleIncomeDeduction);
  items.set("incomeAmountAfter", {
    label: "감면후 소득금액",
    value: incomeAfterValue,
    formula: isAggregate
      ? `자산별 (양도소득금액 − 소득금액 감면대상) 합계 = ${incomeAfterValue.toLocaleString()}`
      : isRH
        ? `과세대상 양도소득금액 ${result.taxableGain.toLocaleString()} (§161 안분 후 — 세액감면방식 소득금액 미차감)`
        : `양도소득금액 ${singleIncome.toLocaleString()} − 소득금액 감면대상 ${singleIncomeDeduction.toLocaleString()} = ${incomeAfterValue.toLocaleString()}`,
    legalBasis: "소득세법 §95·§90②",
    note: "소득금액차감 감면 반영 후 소득금액 (세액감면방식은 소득금액 미차감)",
  });

  items.set("priorIncomeAmount", {
    label: "기신고 양도소득금액",
    value: 0,
    formula: "역년 내 이미 신고한 양도소득금액 합계 (예정신고분)",
    // 소득세법 시행령 §103은 **삭제**됐다(실측 — 본문이 「삭제」 두 글자다).
    // 예정신고분 정산의 정본은 §107②·§111③이고, 같은 결과탭의 신고서 양식이 이미
    // 「기납부세액 (예정신고, §111③)」으로 적고 있다 (결과탭 코드리뷰 #031).
    legalBasis: "소득세법 §107②·§111③",
    note: "본 계산기는 기신고분을 반영하지 않음 (필요 시 별도 차감)",
    summaryOnly: true,
  });

  const basicStep = findStepByLabel(result.steps, "기본공제");
  items.set("basicDeduction", {
    label: "기본공제",
    value: result.basicDeduction,
    formula: basicStep?.formula ?? "연 250만원 한도 (§103) — 자산별 배분 후 합계",
    legalBasis: basicStep?.legalBasis ?? "소득세법 §103",
    summaryOnly: true,
  });

  // 800줄 분리 — 4~7단계 + 재개발 overrides 는 `DetailedStatementLateStages.ts` 로 이동했다.
  //   그 구간은 **out 0**(뒤에 아무것도 없다)이라 `items` 에 append 만 한다.
  appendLateStageItems(items, {
    result, isAggregate, primary, properties, totalTransferPrice, formData, asset, aggregate,
  });

  return items;
}

// ── 포맷 헬퍼 ──────────────────────────────────────────────────

