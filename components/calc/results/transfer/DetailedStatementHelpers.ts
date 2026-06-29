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

import type { TransferTaxResult, CalculationStep } from "@/lib/tax-engine/transfer-tax";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import type { PerPropertyBreakdown } from "@/lib/tax-engine/types/transfer-aggregate.types";
import type { AggregateMeta } from "./FilingFormTableHelpers";
import {
  fmtDate,
  fmtPeriod,
  holdingPeriodFromDates,
  holdingMonthsFromDates,
  splitLtDeduction,
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
  buildLthFormula,
  buildIncomeFormula,
  buildCalculatedTaxFormula,
  buildDeterminedTaxFormula,
  buildPenaltyFormula,
  setAggregateProcedureItems,
} from "./DetailedStatementFormulaBuilders";
import { applyRedevelopmentOverrides } from "./DetailedStatementRedevelopmentBuilders";

// ── 자산별 분해 ──────────────────────────────────────────────────

export interface PerAssetValue {
  /** 자산 라벨 (예: "토지(1001)", "건물(3001)") */
  label: string;
  /** 표시할 값 (숫자=금액, 문자열=날짜·기간 등) */
  value: number | string;
  /** 자산별 산식·메모 (선택) */
  formula?: string;
}

// ── 항목 단위 ────────────────────────────────────────────────────

export interface StatementItem {
  /** 신고서 양식 표의 항목 라벨과 일치 */
  label: string;
  /** 산식·계산 과정 설명 (예: "양도가액 - 취득가액 - 필요경비") */
  formula?: string;
  /** 실제 계산 결과 값 — 숫자=금액(formatKRW), 문자열=날짜/기간 */
  value: number | string | null;
  /** 법령 근거 (LawArticleModal에 전달) */
  legalBasis?: string;
  /** 추가 설명 (산식만으로 부족한 경우) */
  note?: string;
  /** 다건 모드 자산별 분해 (있는 경우만 disclosure로 펼침) */
  perAsset?: PerAssetValue[];
  /** 합계만 표시 가능 항목 (자산별 산정 의미 없음) */
  summaryOnly?: boolean;
}

export interface GroupDef {
  id: string;
  /** 그룹 헤더 라벨 (예: "1단계: 양도차익 산정") */
  title: string;
  /** 색조 — UI 색상 카드 패턴 (sky·emerald·amber·violet·rose) */
  tone: "sky" | "emerald" | "amber" | "violet" | "rose" | "slate";
  /** 그룹에 포함할 itemKey 순서 */
  itemKeys: string[];
}

// ── 그룹 정의 ────────────────────────────────────────────────────

export const STATEMENT_GROUPS: GroupDef[] = [
  // 일자·기간 그룹은 신고서 양식 표 헤더에 이미 표시되므로 명세서에서는 생략 (사용자 요청 2026-05-12).
  {
    id: "gain",
    title: "1단계 — 양도차익 산정",
    tone: "emerald",
    itemKeys: [
      "transferPrice",
      "acquisitionPrice",
      "expenses",
      "transferGain",
      "exemptGain",
      "taxableGain",
    ],
  },
  {
    id: "ltDeduction",
    title: "2단계 — 장기보유특별공제 (§95②)",
    tone: "amber",
    itemKeys: ["ltDeduction", "ltHoldingPart", "ltResidencePart"],
  },
  {
    id: "income",
    title: "3단계 — 양도소득금액·기본공제",
    tone: "violet",
    itemKeys: [
      "incomeAmount",
      "nontaxableIncome",
      "reductionTargetIncome",
      "incomeAmountAfter",
      "priorIncomeAmount",
      "basicDeduction",
    ],
  },
  // 다건 합산 절차 — 다건 모드에서만 활성 항목이 있음 (단건 모드는 빈 그룹으로 자동 미렌더).
  // §102② 차손통산·§103 기본공제 배분·§104⑤ 비교과세 등 다건 전용 합산 step 노출.
  {
    id: "aggregate",
    title: "4단계 — 다건 합산 절차 (§102②·§103·§104⑤)",
    tone: "violet",
    itemKeys: ["lossOffset", "basicDeductionAggregate", "comparedTaxation"],
  },
  {
    id: "tax",
    title: "5단계 — 세액 산정",
    tone: "rose",
    itemKeys: [
      "taxBase",
      "calculatedTax",
      "reductionTax",
      "determinedTax",
    ],
  },
  {
    id: "penalty",
    title: "6단계 — 가산세·총결정세액",
    tone: "slate",
    itemKeys: ["penaltyTax", "totalDeterminedTax"],
  },
  {
    id: "local",
    title: "7단계 — 부가세·지방세",
    tone: "sky",
    itemKeys: [
      "ruralSurtax",
      "localCalculatedTax",
      "localReduction",
      "localDeterminedTax",
    ],
  },
];

// ── 헬퍼 ─────────────────────────────────────────────────────────

/**
 * result.steps[] 에서 label 부분일치로 step 찾기.
 * 엔진이 emit한 산식·법령을 그대로 재사용하기 위함.
 */
export function findStepByLabel(
  steps: CalculationStep[] | undefined,
  ...keywords: string[]
): CalculationStep | undefined {
  if (!steps) return undefined;
  for (const kw of keywords) {
    const found = steps.find((s) => s.label.includes(kw));
    if (found) return found;
  }
  return undefined;
}

/**
 * 자산별 PerAssetValue[] 생성.
 *
 * 일반건물 일괄 모드는 단일 AssetForm이 토지/건물/증축건물 카드로 분해되므로
 * propertyId별로 별도 매핑이 필요. 그 외는 propertyId === assetId.
 */
/**
 * 자산별 PerAssetValue[] 생성 — formula 빌더 포함.
 *
 * 산식이 있는 항목(양도가액·취득가액·필요경비 등)에서 사용.
 * formulaBuilder가 undefined를 반환하면 formula 미설정 (라벨+값만 표시).
 */
function buildPerAssetWithFormula(
  properties: PerPropertyBreakdown[],
  picker: (p: PerPropertyBreakdown) => number | string,
  formulaBuilder: (p: PerPropertyBreakdown) => string | undefined,
): PerAssetValue[] {
  return properties.map((p) => ({
    label: p.propertyLabel,
    value: picker(p),
    formula: formulaBuilder(p),
  }));
}

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
  const transferDate = formData?.transferDate ?? "";
  const primary = asset ?? formData?.assets[0];
  const isAggregate = !!aggregate && aggregate.properties.length > 0;
  const properties = aggregate?.properties ?? [];
  // 일반건물 일괄 모드(사례 31·33) — 자산별 산식 빌더에 전달할 분모/분자 변수.
  // 비-일반건물 모드에서는 undefined → formulaBuilder가 undefined 반환 → 산식 미표시.
  const gbDetail = result.generalBuildingValuationDetail;
  // 부담부증여 모드 — 자산별 §159 산식 빌더에 전달할 분모/분자 변수 (perAsset.{land,building}).
  // 비-부담부증여 모드에서는 undefined → 빌더가 일반건물·기본 분기로 진행.
  const burdenedGift = (result as unknown as {
    transferBurdenedGiftBreakdown?: import("@/lib/tax-engine/types/transfer-burdened-gift.types").TransferBurdenedGiftBreakdown;
  }).transferBurdenedGiftBreakdown;

  // 양도가액 우선순위: override > result.steps의 amount > 0
  const totalTransferPrice =
    transferPriceOverride ??
    (formData?.contractTotalPrice ? Number(formData.contractTotalPrice) : 0);

  // ── 1단계: 일자·기간 ────────────────────────────────────────
  items.set("transferDate", {
    label: "양도일자",
    value: fmtDate(transferDate),
    formula: "사용자 입력 (계약상 잔금청산일 또는 등기접수일 중 빠른 날)",
    legalBasis: "소득세법 §98",
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
          value: fmtDate(getAcqDateForCard(primary, p.propertyId)),
        }))
      : undefined,
  });

  items.set("holdingPeriod", {
    label: "보유기간",
    value: holdingPeriodFromDates(displayAcqDate, transferDate),
    formula: "양도일 − 취득일 (월 단위 절사)",
    legalBasis: "소득세법 §95②",
    perAsset: isAggregate
      ? properties.map((p) => ({
          label: p.propertyLabel,
          value: holdingPeriodFromDates(
            getAcqDateForCard(primary, p.propertyId),
            transferDate,
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
  const residenceMs = (() => {
    if (primary?.residenceInputMode === "interval" && periods.length > 0) {
      return periods.reduce((sum, pp) => {
        const end = pp.moveOutDate || transferDate;
        const a = new Date(pp.moveInDate);
        const t = new Date(end);
        if (isNaN(a.getTime()) || isNaN(t.getTime())) return sum;
        let m = (t.getFullYear() - a.getFullYear()) * 12 + (t.getMonth() - a.getMonth());
        if (t.getDate() < a.getDate()) m -= 1;
        return sum + Math.max(0, m);
      }, 0);
    }
    return parseInt(primary?.residencePeriodMonthsAsset || "0") || 0;
  })();

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
    formula: "거주 기간 합산 (월 단위)",
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
      ? `양도가액 = 인수 채무액 (보증금 ${burdenedGift.assumedDebtAmount.toLocaleString()}원 합계) = ${burdenedGift.assumedDebtAmount.toLocaleString()}원 (소령 §159 — 채무 인수분이 양도가액으로 의제, 자산별 §166⑥ 비율 안분)`
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
  const singleAcq = result.usedEstimatedAcquisition
    ? (result.estimatedBase ?? 0) + capEx
    : totalTransferPrice - result.transferGain - (result.expenses ?? 0) + capEx;
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
  // (transfer-tax-helpers calcNecessaryExpense). 개산공제를 별도로 다시 더하면 이중 계산이므로
  // 신고서 양식 표시는 자본적지출만 분리: 필요경비 = expenses − capitalExpenditureForDisplay.
  const singleExp = Math.max(0, (result.expenses ?? 0) - capEx);
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
  items.set("transferGain", {
    label: "전체 양도차익",
    value: isAggregate
      ? properties.reduce((s, p) => s + p.transferGain, 0)
      : result.transferGain,
    formula: gainStep?.formula ?? "양도가액 − 취득가액 − 필요경비",
    legalBasis: gainStep?.legalBasis ?? "소득세법 §95①",
    perAsset: isAggregate
      ? buildPerAssetWithFormula(properties, (p) => p.transferGain, buildSubGainFormula)
      : undefined,
  });

  const exemptGainSingle = Math.max(0, result.transferGain - result.taxableGain);
  const exemptGainAgg = isAggregate
    ? properties.reduce(
        (s, p) =>
          s +
          Math.max(
            0,
            p.transferGain -
              (p.transferGain > 0
                ? Math.min(
                    p.transferGain,
                    Math.max(0, p.income) + p.longTermHoldingDeduction,
                  )
                : p.transferGain),
          ),
        0,
      )
    : 0;
  items.set("exemptGain", {
    label: "비과세 양도차익",
    value: isAggregate ? exemptGainAgg : exemptGainSingle,
    formula: "전체 양도차익 − 과세대상 양도차익 (§89 비과세 또는 §95 12억 초과 안분)",
    legalBasis: "소득세법 §89·§95",
  });

  items.set("taxableGain", {
    label: "과세대상 양도차익",
    value: isAggregate
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
      : result.taxableGain,
    formula: "전체 양도차익 − 비과세 양도차익",
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
  const lthStep = findStepByLabel(result.steps, "장기보유");
  items.set("ltDeduction", {
    label: "장기보유특별공제",
    value: isAggregate
      ? properties.reduce((s, p) => s + p.longTermHoldingDeduction, 0)
      : result.longTermHoldingDeduction,
    formula:
      lthStep?.formula ??
      `과세대상 양도차익 × ${(result.longTermHoldingRate * 100).toFixed(0)}% (보유 + 거주)`,
    legalBasis: lthStep?.legalBasis ?? "소득세법 §95②·별표 표1·표2",
    perAsset: isAggregate
      ? buildPerAssetWithFormula(
          properties,
          (p) => p.longTermHoldingDeduction,
          buildLthFormula,
        )
      : undefined,
  });

  // 보유분/거주분 분리 — splitLtDeduction 정확 산식 사용 (§95② 별표 표2)
  // useTable2 휴리스틱: 거주 ≥ 24개월 (1세대1주택 고가주택 표2 적용 신호)
  // FilingFormTable·BundledAllocationCard와 동일 정책 (DRY 핵심 로직 재사용)
  const totalHoldingMs = holdingMonthsFromDates(primary?.acquisitionDate, transferDate);
  const useTable2 = residenceMs >= 24;
  const totalLth = isAggregate
    ? properties.reduce((s, p) => s + p.longTermHoldingDeduction, 0)
    : result.longTermHoldingDeduction;
  const lthSplit = splitLtDeduction(totalLth, totalHoldingMs, residenceMs, useTable2);

  // 다건 모드 자산별 보유/거주분 (자산별 holdingMs 기준)
  const ltHoldingPerAsset = isAggregate
    ? properties.map((p) => {
        const acqDateForAsset = getAcqDateForCard(primary, p.propertyId);
        const ms = holdingMonthsFromDates(acqDateForAsset, transferDate);
        const sp = splitLtDeduction(p.longTermHoldingDeduction, ms, residenceMs, useTable2);
        return { label: p.propertyLabel, value: sp.holdingAmount };
      })
    : undefined;
  const ltResidencePerAsset = isAggregate
    ? properties.map((p) => {
        const acqDateForAsset = getAcqDateForCard(primary, p.propertyId);
        const ms = holdingMonthsFromDates(acqDateForAsset, transferDate);
        const sp = splitLtDeduction(p.longTermHoldingDeduction, ms, residenceMs, useTable2);
        return { label: p.propertyLabel, value: sp.residenceAmount };
      })
    : undefined;

  // 보유분/거주분 — 엔진이 정식 emit한 sub-step의 산식 우선 (정확한 안분율·금액 노출).
  // sub-step 미발생 케이스(표1·차손 자산 등)는 splitLtDeduction 가공값 fallback.
  const lthHoldingStep = findStepByLabel(result.steps, "보유 기간분 장특");
  const lthResidenceStep = findStepByLabel(result.steps, "거주 기간분 장특");

  items.set("ltHoldingPart", {
    label: " 보유 기간분 장특",
    value: lthHoldingStep?.amount ?? lthSplit.holdingAmount,
    formula:
      lthHoldingStep?.formula ??
      "총 장특공제 × (보유연수 × 4% ÷ (보유연수 × 4% + 거주연수 × 4%)) — §95② 별표 표2 비율 안분",
    legalBasis: lthHoldingStep?.legalBasis ?? "소득세법 §95② 별표 표2",
    note: useTable2
      ? "1세대1주택 고가주택 표2 적용 (거주 ≥ 24개월)"
      : "표1 적용 — 거주분 0 (거주 미충족 또는 일반 자산)",
    perAsset: ltHoldingPerAsset,
  });
  items.set("ltResidencePart", {
    label: " 거주 기간분 장특",
    value: lthResidenceStep?.amount ?? lthSplit.residenceAmount,
    formula:
      lthResidenceStep?.formula ??
      "총 장특공제 − 보유 기간분 = 거주 기간분 (잔액 보정, §95② 별표 표2)",
    legalBasis: lthResidenceStep?.legalBasis ?? "소득세법 §95② 별표 표2",
    perAsset: ltResidencePerAsset,
  });

  // ── 4단계: 양도소득금액·기본공제 ────────────────────────────
  const incomeStep = findStepByLabel(result.steps, "양도소득금액");
  const sumIncome = isAggregate
    ? properties.reduce((s, p) => s + p.incomeAfterOffset, 0)
    : 0;
  const singleIncome = Math.max(0, result.taxableGain - result.longTermHoldingDeduction);
  items.set("incomeAmount", {
    label: "양도소득금액",
    value: isAggregate ? sumIncome : singleIncome,
    formula:
      incomeStep?.formula ?? "과세대상 양도차익 − 장기보유특별공제 (음수 시 0)",
    legalBasis: incomeStep?.legalBasis ?? "소득세법 §95①",
    note: isAggregate
      ? "다건 모드: §102② 차손통산(같은 그룹 우선·타군 안분) 후의 자산별 합계"
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

  items.set("reductionTargetIncome", {
    label: "세액감면대상금액",
    value: isAggregate
      ? properties.reduce((s, p) => s + (p.reducibleIncome ?? 0), 0)
      : (result.reducibleIncome ?? 0),
    formula:
      "감면 적용 대상 양도소득금액 (자경농지·신축주택 등 조세특례제한법 §69·§77·§99의3 등)",
    legalBasis: "조세특례제한법 §127·시행령 §66",
    perAsset: isAggregate
      ? buildPerAssetWithFormula(
          properties,
          (p) => p.reducibleIncome ?? 0,
          (p) => (p.reducibleIncome ?? 0) > 0 ? `감면 대상 양도소득금액 = ${(p.reducibleIncome ?? 0).toLocaleString()}` : "감면 대상 없음",
        )
      : undefined,
  });

  items.set("incomeAmountAfter", {
    label: "감면후 소득금액",
    value: isAggregate
      ? properties.reduce((s, p) => s + p.incomeAfterOffset, 0)
      : Math.max(
          0,
          singleIncome - (result.reductionAmount > 0 ? 0 : 0),
        ),
    formula: "양도소득금액 − 감면 적용 금액 (감면세액 차감 전 소득금액 그대로)",
    legalBasis: "소득세법 §95",
    note: "감면은 산출세액 단계에서 차감 — 본 행은 §102② 통산 후 소득금액과 동일",
  });

  items.set("priorIncomeAmount", {
    label: "기신고 양도소득금액",
    value: 0,
    formula: "역년 내 이미 신고한 양도소득금액 합계 (예정신고분)",
    legalBasis: "소득세법 §103·시행령 §103",
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

  // ── 4단계: 다건 합산 절차 (다건 모드 전용) ─────────────────────────
  // 단건 모드에서는 result.steps에 해당 step이 없으므로 Map.set 자체를 건너뜀
  // → STATEMENT_GROUPS의 'aggregate' 그룹이 빈 itemKeys로 자동 미렌더.
  // 빌더는 sibling 모듈로 분리 (800줄 정책 준수).
  if (isAggregate) {
    setAggregateProcedureItems(items, result);
  }

  // ── 5단계: 세액 산정 ────────────────────────────────────────
  const taxBaseStep = findStepByLabel(result.steps, "과세표준");
  items.set("taxBase", {
    label: "과세표준",
    value: result.taxBase,
    formula: taxBaseStep?.formula ?? "양도소득금액 − 기본공제",
    legalBasis: taxBaseStep?.legalBasis ?? "소득세법 §92",
    summaryOnly: true,
  });

  const calcStep = findStepByLabel(result.steps, "산출세액");
  items.set("calculatedTax", {
    label: "산출세액",
    value: result.calculatedTax,
    formula:
      calcStep?.formula ??
      `과세표준 × 세율(${formatRatePct(result.appliedRate, result.surchargeRate)}) − 누진공제 ${result.progressiveDeduction.toLocaleString()}`,
    legalBasis: calcStep?.legalBasis ?? "소득세법 §104·§55",
    note: result.shortTermNote,
    perAsset: isAggregate
      ? buildPerAssetWithFormula(
          properties,
          (p) => p.refCalculatedTax,
          buildCalculatedTaxFormula,
        )
      : undefined,
  });

  const reductionStep = findStepByLabel(result.steps, "감면세액");
  items.set("reductionTax", {
    label: "감면세액",
    value: result.reductionAmount,
    formula:
      reductionStep?.formula ??
      "감면 적용 양도소득금액 비율 × 산출세액 (조특법 §127⑦ 중복배제)",
    legalBasis: reductionStep?.legalBasis ?? "조세특례제한법 §127⑦",
    perAsset: isAggregate
      ? buildPerAssetWithFormula(
          properties,
          (p) => p.reductionAggregated,
          (p) => p.reductionAggregated > 0
            ? `합산 재계산 후 ${p.reductionType ?? "감면"} 배분 = ${p.reductionAggregated.toLocaleString()}`
            : "감면 없음",
        )
      : undefined,
  });

  const determinedStep = findStepByLabel(result.steps, "결정세액");
  items.set("determinedTax", {
    label: "결정세액",
    value: result.determinedTax,
    formula: determinedStep?.formula ?? "산출세액 − 감면세액 (원 미만 절사)",
    legalBasis: determinedStep?.legalBasis ?? "소득세법 §116",
    perAsset: isAggregate
      ? buildPerAssetWithFormula(
          properties,
          (p) => p.refDeterminedTax,
          buildDeterminedTaxFormula,
        )
      : undefined,
  });

  // ── 6단계: 가산세·총결정세액 ────────────────────────────────
  const totalPenalty =
    result.penaltyTax + (result.penaltyDetail?.totalPenalty ?? 0);
  const penaltyParts: string[] = [];
  if (result.penaltyTax > 0) {
    penaltyParts.push(
      `§114조의2 환산취득가액 가산세 ${result.penaltyTax.toLocaleString()} (= ${result.penaltyBase.toLocaleString()} × 5%)`,
    );
  }
  if (result.penaltyDetail?.totalPenalty) {
    penaltyParts.push(
      `신고불성실·납부지연 가산세 ${result.penaltyDetail.totalPenalty.toLocaleString()} (국세기본법 §47·§48)`,
    );
  }
  items.set("penaltyTax", {
    label: "가산세액",
    value: totalPenalty,
    formula:
      penaltyParts.length > 0 ? penaltyParts.join(" + ") : "가산세 없음",
    legalBasis: "소득세법 §114조의2 / 국세기본법 §47·§48",
    perAsset: isAggregate
      ? buildPerAssetWithFormula(
          properties,
          (p) => p.penaltyTax + p.filingDelayedPenaltyTax,
          buildPenaltyFormula,
        )
      : undefined,
  });

  items.set("totalDeterminedTax", {
    label: "총결정세액",
    value: result.determinedTax + totalPenalty,
    formula: "결정세액 + 가산세액",
    legalBasis: "소득세법 §116",
  });

  // ── 7단계: 부가세·지방세 ───────────────────────────────────
  items.set("ruralSurtax", {
    label: "농어촌특별세",
    value: result.new993Detail?.ruralSurtax ?? 0,
    formula:
      "(감면 전 산출세액 − 감면 후 산출세액) × 20% — §99의3 등 감면 적용 시만",
    legalBasis: "농어촌특별세법 §3·§5",
    summaryOnly: true,
  });

  const localCalc = Math.floor((result.determinedTax + totalPenalty) * 0.1);
  items.set("localCalculatedTax", {
    label: "지방소득세 산출세액",
    value: localCalc,
    formula: `(결정세액 ${result.determinedTax.toLocaleString()} + 가산세 ${totalPenalty.toLocaleString()}) × 10%`,
    legalBasis: "지방세법 §103의3",
    summaryOnly: true,
  });
  items.set("localReduction", {
    label: "지방세 감면세액",
    value: 0,
    formula: "현재 미구현 (지방세 감면 정책 미반영)",
    legalBasis: "지방세법 §92~§103",
    summaryOnly: true,
  });
  items.set("localDeterminedTax", {
    label: "지방세 결정세액",
    value: result.localIncomeTax,
    formula: "지방소득세 산출세액 − 지방세 감면세액 (원 미만 절사)",
    legalBasis: "지방세법 §103",
    summaryOnly: true,
  });

  // ── 재개발 3분할 overrides (단건·환산 모드, isAggregate와 mutually exclusive) ──
  // result.redevelopmentDetail 존재 시 1단계 양도차익 산정 그룹 항목에 perAsset[] 3분할 부착.
  // 합계값은 기존 단건 합계 그대로 유지 → 32-항목 합계 anchor 회귀 0.
  if (!isAggregate && result.redevelopmentDetail) {
    // subject 도출: assetKind="right_to_move_in" 또는 redevSubject="right" → "right"
    const redevSubject: "apt" | "right" =
      primary?.assetKind === "right_to_move_in" || primary?.redevSubject === "right"
        ? "right"
        : "apt";
    // settlementDirection 도출 (R-5 right+receive 분기 라벨 분기용)
    const redevSettlementDir: "pay" | "receive" | undefined =
      primary?.redevSettlementDirection === "pay" || primary?.redevSettlementDirection === "receive"
        ? primary.redevSettlementDirection
        : undefined;
    applyRedevelopmentOverrides(items, result.redevelopmentDetail, totalTransferPrice, redevSubject, redevSettlementDir);
  }

  return items;
}

// ── 포맷 헬퍼 ──────────────────────────────────────────────────

function formatRatePct(rate: number, surcharge?: number): string {
  const total = rate + (surcharge ?? 0);
  if (total === 0) return "0%";
  return `${(total * 100).toFixed(1).replace(/\.0$/, "")}%`;
}
