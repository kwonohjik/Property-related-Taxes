/**
 * 결과 PDF — 신고서 머리 행(양도가액·취득일자·취득가액·필요경비).
 *
 * 값과 주석은 화면 신고서 표(`buildRows`)에서 그대로 가져온다 — PDF가 다시 계산하지 않는다.
 * 엔진 결과만으로는 폼 날짜·안분 echo를 알 수 없어 뷰가 만들어 `inputData.filingHeadRows`로 넘긴다.
 */
import type { TransferTaxResult } from "@/lib/tax-engine/transfer-tax";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import { buildRows, type AggregateMeta } from "./FilingFormTableHelpers";
import { deriveColumns } from "./FilingFormTableColumns";
import { fmtCell } from "./FilingFormTableRowDefs";

export interface FilingHeadPdfRow {
  label: string;
  value: string;
  note?: string;
}

const HEAD_LABELS = ["양도가액", "취득일자", "취득가액", "필요경비"];

export function buildFilingHeadPdfRows(p: {
  result: TransferTaxResult;
  formData?: TransferFormData;
  asset?: AssetForm;
  transferPriceOverride?: number;
  aggregate?: AggregateMeta;
  acquisitionDateLabel?: string;
  acquisitionDateOverride?: string;
  redevSubject?: "right" | "apt";
  redevSettlementDirection?: "pay" | "receive";
}): FilingHeadPdfRow[] {
  const { columns, mode } = deriveColumns(p.result, p.aggregate, p.redevSubject, p.redevSettlementDirection);
  const rows = buildRows(p.result, mode, p.formData, p.asset, p.transferPriceOverride, p.acquisitionDateLabel, p.acquisitionDateOverride, p.aggregate);
  const many = columns.length > 1;
  return HEAD_LABELS.flatMap((head) => {
    const row = rows.find((r) => r.label === head || r.label.startsWith(`${head} `));
    if (!row) return [];
    return columns.flatMap((col) => {
      const value = fmtCell(row.values[col.key]);
      // 여러 열이면 값 없는 칸은 줄을 만들지 않는다
      if (many && value === "-") return [];
      const note = row.notes?.[col.key];
      return [{ label: many ? `${row.label} — ${col.label}` : row.label, value, ...(note ? { note } : {}) }];
    });
  });
}

/** 단건 결과 뷰 — 화면 표와 같은 인자. 이월과세면 채택된 쪽 서식의 날짜다(`result`가 채택값이다). */
export function buildSingleFilingHeadPdfRows(p: {
  result: TransferTaxResult;
  formData?: TransferFormData;
  asset?: AssetForm;
  transferPriceOverride?: number;
}): FilingHeadPdfRow[] {
  const { result, asset } = p;
  const carryover = result.carryoverTaxationDetail;
  const adoptedA = carryover?.adoptedScenario === "A";
  return buildFilingHeadPdfRows({
    ...p,
    ...(carryover?.isEligible
      ? {
          acquisitionDateLabel: adoptedA ? "(증여자 취득일)" : "(증여 등기접수일)",
          acquisitionDateOverride: (adoptedA ? asset?.carryover?.donorAcquisitionDate : asset?.carryover?.giftRegistryDate) ?? "",
        }
      : {}),
    ...(result.redevelopmentDetail
      ? {
          redevSubject: (asset?.redevSubject || (asset?.assetKind === "right_to_move_in" ? "right" : "apt")) as "right" | "apt",
          redevSettlementDirection: (asset?.redevSettlementDirection || "pay") as "pay" | "receive",
        }
      : {}),
  });
}
