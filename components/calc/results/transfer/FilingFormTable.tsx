"use client";

/**
 * 양도소득세 신고서 양식 표
 *
 * 엑셀 사례(주택일부 용도변경.xlsx) "1. 신고서 양식" 표 재현.
 * 합계 열 + 분할 모드별 동적 분할 열(검용 4-part / 검용 일반 / 토지건물 분리 / 단일).
 *
 * 입력측 값(양도가액·취득가액·날짜 등)은 formData에서, 결과측 값(공제·세액)은 result에서.
 * formData 없을 때는 합계 열만 결과측 값으로 채움(이력 상세 등).
 */

import type { TransferTaxResult } from "@/lib/tax-engine/transfer-tax";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import type {
  MixedUseHousingPart,
  MixedUseCommercialPart,
} from "@/lib/tax-engine/types/transfer-mixed-use.types";
import type { SplitPartResult } from "@/lib/tax-engine/types/transfer.types";
import { cn } from "@/lib/utils";
import { formatKRW } from "@/components/calc/inputs/CurrencyInput";

interface Props {
  result: TransferTaxResult;
  /** 단건 모드에서 폼 데이터 — 미제공 시 합계 열만 결과 기반으로 표시 */
  formData?: TransferFormData;
  /** 다건 모드에서 자산별 표 렌더 시 해당 자산 1개 */
  asset?: AssetForm;
  /** 단건 모드 자산 가액 (formData.contractTotalPrice 우선) */
  transferPriceOverride?: number;
}

type ColumnKey = string;
interface Column {
  key: ColumnKey;
  label: string;
}

interface RowDef {
  label: string;
  /** 열별 값 (number=금액, string=날짜·기간 등) */
  values: Record<ColumnKey, number | string | null>;
  /** 들여쓰기 (보유분/거주분 장특공제 등) */
  indent?: boolean;
  /** 강조 (결정세액·총결정세액·과세표준 등) */
  highlight?: boolean;
  /** 구분선 (섹션 구분) */
  separatorAfter?: boolean;
}

/**
 * 분할 모드 판정
 */
function deriveColumns(result: TransferTaxResult): {
  columns: Column[];
  mode: "fourpart" | "mixed-2col" | "split-2col" | "single";
} {
  const mu = result.mixedUseDetail;
  const sp = result.splitDetail;

  // 검용주택 Case A 4-part
  if (mu && mu.partialUsageChange?.phdScopeBranch === "case_a_whole_building") {
    return {
      mode: "fourpart",
      columns: [
        { key: "total", label: "합계" },
        { key: "housingLand", label: "토지(주택분)" },
        { key: "housingBuilding", label: "주택" },
        { key: "commercialLand", label: "토지(기타분)" },
        { key: "commercialBuilding", label: "기타건물" },
      ],
    };
  }
  // 검용주택 일반 (주택부분/상가부분)
  if (mu) {
    return {
      mode: "mixed-2col",
      columns: [
        { key: "total", label: "합계" },
        { key: "housing", label: "주택부분" },
        { key: "commercial", label: "상가부분" },
      ],
    };
  }
  // 토지/건물 분리 양도차익
  if (sp) {
    return {
      mode: "split-2col",
      columns: [
        { key: "total", label: "합계" },
        { key: "land", label: "토지" },
        { key: "building", label: "건물" },
      ],
    };
  }
  return {
    mode: "single",
    columns: [{ key: "total", label: "합계" }],
  };
}

function holdingMonthsFromDates(acq?: string, transfer?: string): number {
  if (!acq || !transfer) return 0;
  const a = new Date(acq);
  const t = new Date(transfer);
  if (isNaN(a.getTime()) || isNaN(t.getTime())) return 0;
  let m = (t.getFullYear() - a.getFullYear()) * 12 + (t.getMonth() - a.getMonth());
  if (t.getDate() < a.getDate()) m -= 1;
  return Math.max(0, m);
}

function fmtDate(s?: string): string {
  if (!s) return "-";
  return s; // YYYY-MM-DD
}

function fmtPeriod(months?: number): string {
  if (!months || months <= 0) return "-";
  const y = Math.floor(months / 12);
  const m = months % 12;
  return `${y}년 ${m}월`;
}

/**
 * 장기보유특별공제 보유/거주 분할 계산.
 * table2(거주 2년+, 4%+4% 최대 80%) 여부와 실제 연수로 금액 분할.
 */
function splitLtDeduction(
  totalAmount: number,
  holdingMonths: number,
  residenceMonths: number,
  useTable2: boolean,
): { holdingAmount: number; residenceAmount: number } {
  if (totalAmount <= 0) return { holdingAmount: 0, residenceAmount: 0 };
  if (!useTable2 || residenceMonths <= 0) {
    return { holdingAmount: totalAmount, residenceAmount: 0 };
  }
  const hY = holdingMonths / 12;
  const rY = residenceMonths / 12;
  const denom = hY + rY;
  if (denom <= 0) return { holdingAmount: totalAmount, residenceAmount: 0 };
  const holdingAmount = Math.floor(totalAmount * hY / denom);
  return { holdingAmount, residenceAmount: totalAmount - holdingAmount };
}

function holdingPeriodFromDates(acq?: string, transfer?: string): string {
  if (!acq || !transfer) return "-";
  const a = new Date(acq);
  const t = new Date(transfer);
  if (isNaN(a.getTime()) || isNaN(t.getTime())) return "-";
  let months =
    (t.getFullYear() - a.getFullYear()) * 12 + (t.getMonth() - a.getMonth());
  if (t.getDate() < a.getDate()) months -= 1;
  if (months < 0) return "-";
  return fmtPeriod(months);
}

/**
 * 행 정의 생성
 */
function buildRows(
  result: TransferTaxResult,
  mode: "fourpart" | "mixed-2col" | "split-2col" | "single",
  formData?: TransferFormData,
  asset?: AssetForm,
  transferPriceOverride?: number,
): RowDef[] {
  const primary = asset ?? formData?.assets[0];
  const transferDate = formData?.transferDate ?? "";
  const acquisitionDate = primary?.acquisitionDate ?? "";

  const totalTransferPrice =
    transferPriceOverride ??
    Number(formData?.contractTotalPrice || primary?.actualSalePrice || 0) ??
    0;
  const totalExpenses = Number(primary?.directExpenses || 0);

  const mu = result.mixedUseDetail;
  const sp = result.splitDetail;

  // ── 열별 양도가액·취득가액·필요경비·양도차익 추출 ──
  const v: Record<string, Record<ColumnKey, number | string | null>> = {};

  function setNum(rowKey: string, col: ColumnKey, n: number | null) {
    if (!v[rowKey]) v[rowKey] = {};
    v[rowKey][col] = n;
  }
  function setStr(rowKey: string, col: ColumnKey, s: string) {
    if (!v[rowKey]) v[rowKey] = {};
    v[rowKey][col] = s;
  }

  // 합계 열은 모든 모드 공통
  setStr("transferDate", "total", fmtDate(transferDate));
  setStr("acquisitionDate", "total", fmtDate(acquisitionDate));
  setStr(
    "holdingPeriod",
    "total",
    holdingPeriodFromDates(acquisitionDate, transferDate),
  );
  setStr("moveOut", "total", "-");
  setStr("moveIn", "total", "-");
  setStr(
    "residencePeriod",
    "total",
    fmtPeriod(Number(formData?.residencePeriodMonths || 0)),
  );

  // 모드별 분할 열 채우기
  if (mode === "fourpart" && mu) {
    const hp = mu.housingPart;
    const cp = mu.commercialPart;
    // 토지(주택분) = housingPart.landTransferPrice / landAcqPrice / landAppraisalDed
    // 주택건물 = housingPart.buildingTransferPrice / buildingAcqPrice / buildingAppraisalDed
    // 토지(기타분) = commercialPart.landTransferPrice / ...
    // 기타건물 = commercialPart.buildingTransferPrice / ...
    setStr("transferDate", "housingLand", fmtDate(transferDate));
    setStr("transferDate", "housingBuilding", fmtDate(transferDate));
    setStr("transferDate", "commercialLand", fmtDate(transferDate));
    setStr("transferDate", "commercialBuilding", fmtDate(transferDate));
    setStr("acquisitionDate", "housingLand", fmtDate(acquisitionDate));
    setStr("acquisitionDate", "housingBuilding", fmtDate(acquisitionDate));
    setStr("acquisitionDate", "commercialLand", fmtDate(acquisitionDate));
    setStr("acquisitionDate", "commercialBuilding", fmtDate(acquisitionDate));
    const hold = holdingPeriodFromDates(acquisitionDate, transferDate);
    for (const c of ["housingLand", "housingBuilding", "commercialLand", "commercialBuilding"]) {
      setStr("holdingPeriod", c, hold);
    }
    setStr("moveOut", "housingLand", fmtDate(transferDate));
    setStr("moveOut", "housingBuilding", fmtDate(transferDate));
    setStr("moveIn", "housingLand", fmtDate(acquisitionDate));
    setStr("moveIn", "housingBuilding", fmtDate(acquisitionDate));
    setStr("residencePeriod", "housingLand", hold);
    setStr("residencePeriod", "housingBuilding", hold);

    fourPartFinancials(hp, cp, setNum);
  } else if (mode === "mixed-2col" && mu) {
    setStr("transferDate", "housing", fmtDate(transferDate));
    setStr("transferDate", "commercial", fmtDate(transferDate));
    setStr("acquisitionDate", "housing", fmtDate(acquisitionDate));
    setStr("acquisitionDate", "commercial", fmtDate(acquisitionDate));
    const hold = holdingPeriodFromDates(acquisitionDate, transferDate);
    setStr("holdingPeriod", "housing", hold);
    setStr("holdingPeriod", "commercial", hold);
    setStr("moveOut", "housing", fmtDate(transferDate));
    setStr("moveIn", "housing", fmtDate(acquisitionDate));
    setStr("residencePeriod", "housing", hold);
    mixedTwoColFinancials(mu.housingPart, mu.commercialPart, setNum);
  } else if (mode === "split-2col" && sp) {
    setStr("transferDate", "land", fmtDate(transferDate));
    setStr("transferDate", "building", fmtDate(transferDate));
    setStr("acquisitionDate", "land", fmtDate(acquisitionDate));
    setStr("acquisitionDate", "building", fmtDate(acquisitionDate));
    setStr(
      "holdingPeriod",
      "land",
      fmtPeriod(Math.round(sp.land.holdingYears * 12)),
    );
    setStr(
      "holdingPeriod",
      "building",
      fmtPeriod(Math.round(sp.building.holdingYears * 12)),
    );
    splitTwoColFinancials(sp.land, sp.building, setNum);
  }

  // 합계 열 재무 항목 — 결과 기반
  const totalAcqPrice = totalTransferPrice - result.transferGain - totalExpenses;
  setNum("transferPrice", "total", totalTransferPrice || null);
  setNum("acquisitionPrice", "total", totalAcqPrice > 0 ? totalAcqPrice : null);
  setNum("expenses", "total", totalExpenses || null);
  setNum("transferGain", "total", result.transferGain);
  setNum(
    "exemptGain",
    "total",
    Math.max(0, result.transferGain - result.taxableGain),
  );
  setNum("taxableGain", "total", result.taxableGain);
  setNum("ltDeduction", "total", result.longTermHoldingDeduction);

  // 보유/거주 장특 분할
  const holdingMs = holdingMonthsFromDates(acquisitionDate, transferDate);
  const residenceMs = Number(formData?.residencePeriodMonths || 0);
  const useTable2 = mu ? mu.housingPart.longTermDeductionTable === 2 : residenceMs >= 24;

  if (mode === "fourpart" && mu) {
    // 주택부분(보유+거주), 상가부분(보유만) 각각 분리 후 합산
    const hpSplit = splitLtDeduction(mu.housingPart.longTermDeductionAmount, holdingMs, residenceMs, useTable2);
    const cpSplit = { holdingAmount: mu.commercialPart.longTermDeductionAmount, residenceAmount: 0 };
    const hpLandRatio = mu.housingPart.transferGain > 0 ? mu.housingPart.landTransferGain / mu.housingPart.transferGain : 0.5;
    const hpBuildRatio = 1 - hpLandRatio;
    const cpLandRatio = mu.commercialPart.transferGain > 0 ? mu.commercialPart.landTransferGain / mu.commercialPart.transferGain : 0.5;
    const cpBuildRatio = 1 - cpLandRatio;
    // 합계
    setNum("ltHoldingPart", "total", hpSplit.holdingAmount + cpSplit.holdingAmount);
    setNum("ltResidencePart", "total", hpSplit.residenceAmount);
    // 분할 열
    setNum("ltHoldingPart", "housingLand", Math.floor(hpSplit.holdingAmount * hpLandRatio));
    setNum("ltHoldingPart", "housingBuilding", Math.floor(hpSplit.holdingAmount * hpBuildRatio));
    setNum("ltHoldingPart", "commercialLand", Math.floor(cpSplit.holdingAmount * cpLandRatio));
    setNum("ltHoldingPart", "commercialBuilding", Math.floor(cpSplit.holdingAmount * cpBuildRatio));
    setNum("ltResidencePart", "housingLand", Math.floor(hpSplit.residenceAmount * hpLandRatio));
    setNum("ltResidencePart", "housingBuilding", Math.floor(hpSplit.residenceAmount * hpBuildRatio));
    setNum("ltResidencePart", "commercialLand", 0);
    setNum("ltResidencePart", "commercialBuilding", 0);
  } else if (mode === "mixed-2col" && mu) {
    const hpSplit = splitLtDeduction(mu.housingPart.longTermDeductionAmount, holdingMs, residenceMs, useTable2);
    const cpSplit = { holdingAmount: mu.commercialPart.longTermDeductionAmount, residenceAmount: 0 };
    setNum("ltHoldingPart", "total", hpSplit.holdingAmount + cpSplit.holdingAmount);
    setNum("ltResidencePart", "total", hpSplit.residenceAmount);
    setNum("ltHoldingPart", "housing", hpSplit.holdingAmount);
    setNum("ltResidencePart", "housing", hpSplit.residenceAmount);
    setNum("ltHoldingPart", "commercial", cpSplit.holdingAmount);
    setNum("ltResidencePart", "commercial", 0);
  } else if (mode === "split-2col" && sp) {
    const landSplit = splitLtDeduction(sp.land.longTermDeduction, Math.round(sp.land.holdingYears * 12), residenceMs, useTable2);
    const buildSplit = splitLtDeduction(sp.building.longTermDeduction, Math.round(sp.building.holdingYears * 12), residenceMs, useTable2);
    setNum("ltHoldingPart", "total", landSplit.holdingAmount + buildSplit.holdingAmount);
    setNum("ltResidencePart", "total", landSplit.residenceAmount + buildSplit.residenceAmount);
    setNum("ltHoldingPart", "land", landSplit.holdingAmount);
    setNum("ltResidencePart", "land", landSplit.residenceAmount);
    setNum("ltHoldingPart", "building", buildSplit.holdingAmount);
    setNum("ltResidencePart", "building", buildSplit.residenceAmount);
  } else {
    // 단일 자산
    const split = splitLtDeduction(result.longTermHoldingDeduction, holdingMs, residenceMs, useTable2);
    setNum("ltHoldingPart", "total", split.holdingAmount);
    setNum("ltResidencePart", "total", split.residenceAmount);
  }
  const incomeAmount = result.taxableGain - result.longTermHoldingDeduction;
  setNum("incomeAmount", "total", incomeAmount);
  setNum("reductionTargetIncome", "total", result.reducibleIncome ?? 0);
  setNum("reductionTargetIncome2", "total", result.reducibleIncome ?? 0);
  setNum("incomeAmountAfter", "total", incomeAmount);
  setNum("priorIncomeAmount", "total", 0);
  setNum("basicDeduction", "total", result.basicDeduction);
  setNum("taxBase", "total", result.taxBase);
  setNum("calculatedTax", "total", result.calculatedTax);
  setNum("reductionTax", "total", result.reductionAmount);
  setNum("determinedTax", "total", result.determinedTax);
  setNum("penaltyTax", "total", result.penaltyTax);
  setNum(
    "totalDeterminedTax",
    "total",
    result.determinedTax + result.penaltyTax,
  );
  // 지방소득세
  const localCalc = Math.floor((result.determinedTax + result.penaltyTax) * 0.1);
  setNum("localCalculatedTax", "total", localCalc);
  setNum("localReduction", "total", 0);
  setNum("localDeterminedTax", "total", result.localIncomeTax);

  // ── 행 순서 정의 (엑셀 1번 표) ──
  const rowOrder: Array<[string, string, Partial<RowDef>?]> = [
    ["transferDate", "양도일자"],
    ["acquisitionDate", "취득일자"],
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
    ["reductionTargetIncome", "세액감면대상금액"],
    ["reductionTargetIncome2", "소득금액 감면대상"],
    ["incomeAmountAfter", "양도소득금액"],
    ["priorIncomeAmount", "기신고 양도소득금액"],
    ["basicDeduction", "기본공제", { separatorAfter: true }],
    ["taxBase", "과세표준", { highlight: true }],
    ["calculatedTax", "산출세액"],
    ["reductionTax", "감면세액"],
    ["determinedTax", "결정세액", { highlight: true }],
    ["penaltyTax", "가산세액"],
    ["totalDeterminedTax", "총결정세액", { highlight: true, separatorAfter: true }],
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

function fourPartFinancials(
  hp: MixedUseHousingPart,
  cp: MixedUseCommercialPart,
  setNum: (rowKey: string, col: ColumnKey, n: number | null) => void,
) {
  // 양도가액
  setNum("transferPrice", "housingLand", hp.landTransferPrice);
  setNum("transferPrice", "housingBuilding", hp.buildingTransferPrice);
  setNum("transferPrice", "commercialLand", cp.landTransferPrice);
  setNum("transferPrice", "commercialBuilding", cp.buildingTransferPrice);
  // 취득가액 (환산취득가)
  setNum("acquisitionPrice", "housingLand", hp.landAcqPrice);
  setNum("acquisitionPrice", "housingBuilding", hp.buildingAcqPrice);
  setNum("acquisitionPrice", "commercialLand", cp.landAcqPrice);
  setNum("acquisitionPrice", "commercialBuilding", cp.buildingAcqPrice);
  // 필요경비 = 개산공제
  setNum("expenses", "housingLand", hp.landAppraisalDed);
  setNum("expenses", "housingBuilding", hp.buildingAppraisalDed);
  setNum("expenses", "commercialLand", cp.landAppraisalDed);
  setNum("expenses", "commercialBuilding", cp.buildingAppraisalDed);
  // 전체 양도차익
  setNum("transferGain", "housingLand", hp.landTransferGain);
  setNum("transferGain", "housingBuilding", hp.buildingTransferGain);
  setNum("transferGain", "commercialLand", cp.landTransferGain);
  setNum("transferGain", "commercialBuilding", cp.buildingTransferGain);
  // 과세대상 (12억 안분 비과세 후)
  const housingExemptRatio = hp.transferGain > 0 ? hp.proratedTaxableGain / hp.transferGain : 1;
  setNum(
    "taxableGain",
    "housingLand",
    Math.floor(hp.landTransferGain * housingExemptRatio),
  );
  setNum(
    "taxableGain",
    "housingBuilding",
    Math.floor(hp.buildingTransferGain * housingExemptRatio),
  );
  setNum("taxableGain", "commercialLand", cp.landTransferGain);
  setNum("taxableGain", "commercialBuilding", cp.buildingTransferGain);
  // 비과세 양도차익
  setNum(
    "exemptGain",
    "housingLand",
    hp.landTransferGain - Math.floor(hp.landTransferGain * housingExemptRatio),
  );
  setNum(
    "exemptGain",
    "housingBuilding",
    hp.buildingTransferGain - Math.floor(hp.buildingTransferGain * housingExemptRatio),
  );
  setNum("exemptGain", "commercialLand", 0);
  setNum("exemptGain", "commercialBuilding", 0);
  // 장특공제 (주택부분 합계만 — 토지/건물 분리 표시는 부분 안분)
  const hpLandRatio =
    hp.transferGain > 0 ? hp.landTransferGain / hp.transferGain : 0.5;
  const hpBuildRatio =
    hp.transferGain > 0 ? hp.buildingTransferGain / hp.transferGain : 0.5;
  const cpLandRatio =
    cp.transferGain > 0 ? cp.landTransferGain / cp.transferGain : 0.5;
  const cpBuildRatio =
    cp.transferGain > 0 ? cp.buildingTransferGain / cp.transferGain : 0.5;
  setNum(
    "ltDeduction",
    "housingLand",
    Math.floor(hp.longTermDeductionAmount * hpLandRatio),
  );
  setNum(
    "ltDeduction",
    "housingBuilding",
    Math.floor(hp.longTermDeductionAmount * hpBuildRatio),
  );
  setNum(
    "ltDeduction",
    "commercialLand",
    Math.floor(cp.longTermDeductionAmount * cpLandRatio),
  );
  setNum(
    "ltDeduction",
    "commercialBuilding",
    Math.floor(cp.longTermDeductionAmount * cpBuildRatio),
  );
  // 양도소득금액
  setNum(
    "incomeAmount",
    "housingLand",
    Math.floor(hp.incomeAmount * hpLandRatio),
  );
  setNum(
    "incomeAmount",
    "housingBuilding",
    Math.floor(hp.incomeAmount * hpBuildRatio),
  );
  setNum(
    "incomeAmount",
    "commercialLand",
    Math.floor(cp.incomeAmount * cpLandRatio),
  );
  setNum(
    "incomeAmount",
    "commercialBuilding",
    Math.floor(cp.incomeAmount * cpBuildRatio),
  );
  setNum(
    "incomeAmountAfter",
    "housingLand",
    Math.floor(hp.incomeAmount * hpLandRatio),
  );
  setNum(
    "incomeAmountAfter",
    "housingBuilding",
    Math.floor(hp.incomeAmount * hpBuildRatio),
  );
  setNum(
    "incomeAmountAfter",
    "commercialLand",
    Math.floor(cp.incomeAmount * cpLandRatio),
  );
  setNum(
    "incomeAmountAfter",
    "commercialBuilding",
    Math.floor(cp.incomeAmount * cpBuildRatio),
  );
}

function mixedTwoColFinancials(
  hp: MixedUseHousingPart,
  cp: MixedUseCommercialPart,
  setNum: (rowKey: string, col: ColumnKey, n: number | null) => void,
) {
  setNum("transferPrice", "housing", hp.landTransferPrice + hp.buildingTransferPrice);
  setNum("transferPrice", "commercial", cp.landTransferPrice + cp.buildingTransferPrice);
  setNum("acquisitionPrice", "housing", hp.estimatedAcquisitionPrice);
  setNum("acquisitionPrice", "commercial", cp.estimatedAcquisitionPrice);
  setNum("expenses", "housing", hp.landAppraisalDed + hp.buildingAppraisalDed);
  setNum("expenses", "commercial", cp.landAppraisalDed + cp.buildingAppraisalDed);
  setNum("transferGain", "housing", hp.transferGain);
  setNum("transferGain", "commercial", cp.transferGain);
  setNum("exemptGain", "housing", hp.transferGain - hp.proratedTaxableGain);
  setNum("exemptGain", "commercial", 0);
  setNum("taxableGain", "housing", hp.proratedTaxableGain);
  setNum("taxableGain", "commercial", cp.transferGain);
  setNum("ltDeduction", "housing", hp.longTermDeductionAmount);
  setNum("ltDeduction", "commercial", cp.longTermDeductionAmount);
  setNum("incomeAmount", "housing", hp.incomeAmount);
  setNum("incomeAmount", "commercial", cp.incomeAmount);
  setNum("incomeAmountAfter", "housing", hp.incomeAmount);
  setNum("incomeAmountAfter", "commercial", cp.incomeAmount);
}

function splitTwoColFinancials(
  land: SplitPartResult,
  building: SplitPartResult,
  setNum: (rowKey: string, col: ColumnKey, n: number | null) => void,
) {
  setNum("transferPrice", "land", land.transferPrice);
  setNum("transferPrice", "building", building.transferPrice);
  setNum("acquisitionPrice", "land", land.acquisitionPrice);
  setNum("acquisitionPrice", "building", building.acquisitionPrice);
  setNum(
    "expenses",
    "land",
    land.directExpenses + land.appraisalDeduction,
  );
  setNum(
    "expenses",
    "building",
    building.directExpenses + building.appraisalDeduction,
  );
  setNum("transferGain", "land", land.gain);
  setNum("transferGain", "building", building.gain);
  setNum("taxableGain", "land", land.gain);
  setNum("taxableGain", "building", building.gain);
  setNum("exemptGain", "land", 0);
  setNum("exemptGain", "building", 0);
  setNum("ltDeduction", "land", land.longTermDeduction);
  setNum("ltDeduction", "building", building.longTermDeduction);
  setNum("incomeAmount", "land", land.gain - land.longTermDeduction);
  setNum("incomeAmount", "building", building.gain - building.longTermDeduction);
  setNum(
    "incomeAmountAfter",
    "land",
    land.gain - land.longTermDeduction,
  );
  setNum(
    "incomeAmountAfter",
    "building",
    building.gain - building.longTermDeduction,
  );
}

function fmtCell(v: number | string | null | undefined): string {
  if (v === null || v === undefined || v === "") return "-";
  if (typeof v === "string") return v;
  if (v === 0) return "0";
  return formatKRW(v);
}

export function FilingFormTable({
  result,
  formData,
  asset,
  transferPriceOverride,
}: Props) {
  const { columns, mode } = deriveColumns(result);
  const rows = buildRows(result, mode, formData, asset, transferPriceOverride);

  return (
    <div
      data-print-section="form-table"
      className="rounded-xl border-2 border-slate-300 bg-white dark:bg-slate-900 overflow-hidden print:border print:border-black"
    >
      <div className="px-4 py-3 bg-slate-100 dark:bg-slate-800 border-b border-slate-300 print:bg-white">
        <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100">
          신고서 양식
        </h3>
        <p className="text-[11px] text-slate-500 mt-0.5">
          양도소득세 신고서 항목별 자산-분할 계산 내역
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs border-collapse">
          <thead className="bg-slate-50 dark:bg-slate-800/50">
            <tr>
              <th className="text-left px-3 py-2 border-b border-r border-slate-200 font-semibold sticky left-0 bg-slate-50 dark:bg-slate-800/50 print:static">
                항목
              </th>
              {columns.map((c) => (
                <th
                  key={c.key}
                  className={cn(
                    "text-right px-3 py-2 border-b border-r border-slate-200 font-semibold whitespace-nowrap",
                    c.key === "total" && "bg-slate-100 dark:bg-slate-800",
                  )}
                >
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr
                key={i}
                className={cn(
                  "border-b border-slate-100",
                  row.highlight && "bg-amber-50/60 dark:bg-amber-950/30 font-semibold",
                  row.separatorAfter && "border-b-2 border-slate-300",
                )}
              >
                <td
                  className={cn(
                    "px-3 py-1.5 border-r border-slate-200 sticky left-0 bg-white dark:bg-slate-900 print:static",
                    row.indent && "pl-7 text-slate-500",
                    row.highlight && "bg-amber-50/60 dark:bg-amber-950/30",
                  )}
                >
                  {row.label}
                </td>
                {columns.map((c) => (
                  <td
                    key={c.key}
                    className={cn(
                      "px-3 py-1.5 text-right border-r border-slate-200 font-mono whitespace-nowrap",
                      c.key === "total" && "bg-slate-50/60 dark:bg-slate-800/40",
                    )}
                  >
                    {fmtCell(row.values[c.key])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
