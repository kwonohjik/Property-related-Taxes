/**
 * FilingFormTable 다자산 합산(aggregate) 모드 행 빌더 — 800줄 분리 정책에 따라 분리.
 *
 * 단건 buildRows(`FilingFormTableHelpers.ts`)의 32행 rowOrder와 동일 구조를 유지하면서
 * 합계 열 + 자산별 열로 enumerate. 자산별 산정이 어려운 합산-only 행
 * (과세표준·기본공제·지방세 등)은 합계만 채우고 자산 셀은 null.
 */

import type { TransferTaxResult } from "@/lib/tax-engine/transfer-tax";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import {
  type AggregateMeta,
  type ColumnKey,
  type RowDef,
  splitLtDeduction,
  holdingMonthsFromDates,
  holdingPeriodFromDates,
  fmtDate,
  fmtPeriod,
} from "./FilingFormTableHelpers";

export function buildAggregateRows(
  _result: TransferTaxResult,
  aggregate: AggregateMeta,
  formData: TransferFormData | undefined,
  acquisitionDateLabel?: string,
): RowDef[] {
  const { properties, aggregated } = aggregate;
  const transferDate = formData?.transferDate ?? "";
  const v: Record<string, Record<ColumnKey, number | string | null>> = {};

  function setNum(rowKey: string, col: ColumnKey, n: number | null) {
    if (!v[rowKey]) v[rowKey] = {};
    v[rowKey][col] = n;
  }
  function setStr(rowKey: string, col: ColumnKey, s: string) {
    if (!v[rowKey]) v[rowKey] = {};
    v[rowKey][col] = s;
  }

  // propertyId → AssetForm 매핑 (TransferTaxCalculator의 ownershipMap 패턴과 동일):
  //   assets[0] → "primary", assets[i>0] → assetId 그대로
  //   G-2 한도 초과 split: "{assetId}__appurtenant" / "{assetId}__excess" suffix 제거 후 재조회
  //   GB(일반건물 토지+건물 일괄): 단일 자산이 엔진 내부에서 "land"/"building" 2장으로 분해됨 → assets[0]로 fallback
  function findAssetByPropertyId(pid: string): AssetForm | undefined {
    // NOTE: 이 함수 결과로 반환된 AssetForm의 landNature로
    // 컬럼 라벨 suffix "(부수토지)" / "(독립 나대지)"를 표시할 수 있음 — buildAggregateRows 호출부에서 사용.
    if (!formData) return undefined;
    if (pid === "primary") return formData.assets[0];
    // 일반건물(토지+건물 일괄) — 토지·건물 분해된 카드는 모두 assets[0]에서 취득일·필요경비 메타 가져옴
    if (
      formData.assets[0]?.assetKind === "general_building" &&
      (pid === "land" || pid === "land_business" || pid === "land_nbl" || pid === "building")
    ) {
      return formData.assets[0];
    }
    const direct = formData.assets.find((a) => a.assetId === pid);
    if (direct) return direct;
    // split suffix 제거 fallback — 부수토지 한도 초과 분리 시 원본 assetId로 재조회
    const basePid = pid.replace(/__(appurtenant|excess)$/, "");
    if (basePid !== pid) return formData.assets.find((a) => a.assetId === basePid);
    return undefined;
  }

  // 합계 열 — 머리 정보 (자산별이라 합계는 양도일자만 채움)
  setStr("transferDate", "total", fmtDate(transferDate));
  setStr("acquisitionDate", "total", "-");
  setStr("holdingPeriod", "total", "-");
  setStr("moveOut", "total", "-");
  setStr("moveIn", "total", "-");
  setStr("residencePeriod", "total", "-");

  let sumTransferPrice = 0;
  let sumAcqPrice = 0;
  let sumExpenses = 0;
  let sumTransferGain = 0;
  let sumTaxableGain = 0;
  let sumExemptGain = 0;
  let sumLtDeduction = 0;
  let sumLtHolding = 0;
  let sumLtResidence = 0;
  // 산출세액 행 주석: 자산별 shortTermNote (부수토지 일체과세 등 특수 세율)
  const taxNotes: Record<string, string> = {};

  for (const p of properties) {
    const col = p.propertyId;
    const a = findAssetByPropertyId(col);
    const acqDate = a?.acquisitionDate ?? "";

    // 머리 정보
    setStr("transferDate", col, fmtDate(transferDate));
    setStr("acquisitionDate", col, fmtDate(acqDate));
    setStr("holdingPeriod", col, holdingPeriodFromDates(acqDate, transferDate));

    const periods = a?.residenceInputMode === "interval" ? a.residencePeriods ?? [] : [];
    const firstMoveIn = periods.length > 0 ? periods[0].moveInDate : "";
    const lastMoveOut = periods.length > 0
      ? (periods[periods.length - 1].moveOutDate || transferDate)
      : "";
    const residenceMs = (() => {
      if (a?.residenceInputMode === "interval" && periods.length > 0) {
        return periods.reduce((sum, pp) => {
          const end = pp.moveOutDate || transferDate;
          return sum + holdingMonthsFromDates(pp.moveInDate, end);
        }, 0);
      }
      return parseInt(a?.residencePeriodMonthsAsset || "0") || 0;
    })();
    setStr("moveOut", col, lastMoveOut ? fmtDate(lastMoveOut) : "-");
    setStr("moveIn", col, firstMoveIn ? fmtDate(firstMoveIn) : "-");
    setStr("residencePeriod", col, fmtPeriod(residenceMs));

    // 가격 — 신고서 양식 표시 관행: 자본적지출은 취득가액에 합산, 필요경비는 양도비만
    const displayAcq = p.acquisitionPrice + p.capitalExpenditureForDisplay;
    const displayExp = Math.max(0, p.necessaryExpense - p.capitalExpenditureForDisplay);
    setNum("transferPrice", col, p.transferPrice);
    setNum("acquisitionPrice", col, displayAcq);
    setNum("expenses", col, displayExp);

    // 양도차익 / 비과세 / 과세대상 (자산별 역산)
    // assetTaxableGain = max(0, income) + 장특공제 (income = taxableGain - 장특)
    const transferGain = p.transferGain;
    const longTermDed = p.longTermHoldingDeduction;
    const assetTaxableGain = transferGain > 0
      ? Math.min(transferGain, Math.max(0, p.income) + longTermDed)
      : transferGain;
    const assetExemptGain = Math.max(0, transferGain - assetTaxableGain);
    setNum("transferGain", col, transferGain);
    setNum("exemptGain", col, assetExemptGain);
    setNum("taxableGain", col, assetTaxableGain);

    // 장기보유공제 (계 + 보유분/거주분 분리)
    const holdingMs = holdingMonthsFromDates(acqDate, transferDate);
    // useTable2: 거주 ≥ 24개월 휴리스틱 (단건과 동일)
    const useTable2 = residenceMs >= 24;
    const split = splitLtDeduction(longTermDed, holdingMs, residenceMs, useTable2);
    setNum("ltDeduction", col, longTermDed);
    setNum("ltHoldingPart", col, split.holdingAmount);
    setNum("ltResidencePart", col, split.residenceAmount);

    // 양도소득금액
    setNum("incomeAmount", col, p.income);
    setNum("nontaxableIncome", col, 0);
    setNum("reductionTargetIncome", col, p.reducibleIncome ?? 0);
    setNum("reductionTargetIncome2", col, 0);
    setNum("incomeAmountAfter", col, p.incomeAfterOffset);
    setNum("priorIncomeAmount", col, 0);

    // 합산-only 행 — 자산 셀 null
    setNum("basicDeduction", col, null);
    setNum("taxBase", col, null);

    // 자산별 세액 (참고)
    setNum("calculatedTax", col, p.refCalculatedTax);
    setNum("reductionTax", col, p.reductionAggregated > 0 ? p.reductionAggregated : 0);
    setNum("determinedTax", col, p.refDeterminedTax);
    const assetPenalty = (p.penaltyTax ?? 0) + (p.filingDelayedPenaltyTax ?? 0);
    setNum("penaltyTax", col, assetPenalty);
    setNum("totalDeterminedTax", col, p.refDeterminedTax + assetPenalty);

    // shortTermNote — 부수토지 일체과세 등 특수 세율 주석. 자산 열에 개별 저장.
    if (p.shortTermNote) {
      taxNotes[col] = p.shortTermNote;
    }

    // 농어촌특별세·지방세 — 합산-only
    setNum("ruralSurtax", col, null);
    setNum("localCalculatedTax", col, null);
    setNum("localReduction", col, null);
    setNum("localDeterminedTax", col, null);

    // 합계 누적
    sumTransferPrice += p.transferPrice;
    sumAcqPrice += displayAcq;
    sumExpenses += displayExp;
    sumTransferGain += transferGain;
    sumTaxableGain += assetTaxableGain;
    sumExemptGain += assetExemptGain;
    sumLtDeduction += longTermDed;
    sumLtHolding += split.holdingAmount;
    sumLtResidence += split.residenceAmount;
  }

  // 합계 열
  setNum("transferPrice", "total", sumTransferPrice);
  setNum("acquisitionPrice", "total", sumAcqPrice);
  setNum("expenses", "total", sumExpenses);
  setNum("transferGain", "total", sumTransferGain);
  setNum("exemptGain", "total", sumExemptGain);
  setNum("taxableGain", "total", sumTaxableGain);
  setNum("ltDeduction", "total", sumLtDeduction);
  setNum("ltHoldingPart", "total", sumLtHolding);
  setNum("ltResidencePart", "total", sumLtResidence);
  setNum("incomeAmount", "total", aggregated.totalIncomeAfterOffset);
  setNum("nontaxableIncome", "total", 0);
  setNum(
    "reductionTargetIncome",
    "total",
    properties.reduce((s, p) => s + (p.reducibleIncome ?? 0), 0),
  );
  setNum("reductionTargetIncome2", "total", 0);
  setNum("incomeAmountAfter", "total", aggregated.totalIncomeAfterOffset);
  setNum("priorIncomeAmount", "total", 0);
  setNum("basicDeduction", "total", aggregated.basicDeduction);
  setNum("taxBase", "total", aggregated.taxBase);
  setNum("calculatedTax", "total", aggregated.calculatedTax);
  setNum("reductionTax", "total", aggregated.reductionAmount);
  setNum("determinedTax", "total", aggregated.determinedTax);
  setNum("penaltyTax", "total", aggregated.penaltyTax);
  setNum("totalDeterminedTax", "total", aggregated.determinedTax + aggregated.penaltyTax);
  setNum("ruralSurtax", "total", 0);
  const localCalcTotal = Math.floor((aggregated.determinedTax + aggregated.penaltyTax) * 0.1);
  setNum("localCalculatedTax", "total", localCalcTotal);
  setNum("localReduction", "total", 0);
  setNum("localDeterminedTax", "total", aggregated.localIncomeTax);

  const acqDateRowLabel = acquisitionDateLabel
    ? `취득일자 ${acquisitionDateLabel}`
    : "취득일자";
  const rowOrder: Array<[string, string, Partial<RowDef>?]> = [
    ["transferDate", "양도일자"],
    ["acquisitionDate", acqDateRowLabel],
    ["holdingPeriod", "보유기간"],
    ["moveOut", "퇴거일"],
    ["moveIn", "입주일"],
    ["residencePeriod", "거주기간", { separatorAfter: true }],
    ["transferPrice", "양도가액"],
    ["acquisitionPrice", "취득가액"],
    ["expenses", "필요경비", { separatorAfter: true }],
    ["transferGain", "전체 양도차익"],
    ["exemptGain", "비과세 양도차익"],
    ["taxableGain", "과세대상 양도차익", { separatorAfter: true }],
    ["ltDeduction", "장기보유특별공제"],
    ["ltHoldingPart", " 보유 기간분 장특", { indent: true }],
    ["ltResidencePart", " 거주 기간분 장특", { indent: true, separatorAfter: true }],
    ["incomeAmount", "양도소득금액"],
    ["nontaxableIncome", "비과세 양도소득금액 (소령 §161①)", { indent: true }],
    ["reductionTargetIncome", "세액감면대상금액"],
    ["reductionTargetIncome2", "소득금액 감면대상"],
    ["incomeAmountAfter", "감면후 소득금액"],
    ["priorIncomeAmount", "기신고 양도소득금액"],
    ["basicDeduction", "기본공제", { separatorAfter: true }],
    ["taxBase", "과세표준", { highlight: true }],
    ["calculatedTax", "산출세액", Object.keys(taxNotes).length > 0 ? { notes: taxNotes } : undefined],
    ["reductionTax", "감면세액"],
    ["determinedTax", "결정세액", { highlight: true }],
    ["penaltyTax", "가산세액"],
    ["totalDeterminedTax", "총결정세액", { highlight: true, separatorAfter: true }],
    ["ruralSurtax", "농어촌특별세 (§99의3 등)"],
    ["localCalculatedTax", "지방소득세 산출세액"],
    ["localReduction", "지방세 감면세액"],
    ["localDeterminedTax", "지방세 결정세액", { highlight: true }],
  ];

  return rowOrder.map(([key, label, opts]) => ({
    label,
    values: v[key] ?? {},
    ...(opts ?? {}),
  }));
}
