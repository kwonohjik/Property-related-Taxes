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
import { fmtCell, FILING_CODE_ROW_LABEL } from "./FilingFormTableRowDefs";

export interface FilingHeadPdfRow {
  label: string;
  value: string;
  note?: string;
}

const HEAD_LABELS = ["양도가액", "취득일자", "취득가액", "필요경비"];

/**
 * 신고서 코드 칸 — ③ 세율구분 코드 · 부표1 ⑯ 장기보유특별공제 코드 · ㉑ 감면종류·감면율 · 농특세 납부계산서 ㉒ 소득세 감면세액.
 * 화면 신고서 표 행과 **같은 라벨·같은 값**(코드 산정은 `filing-form-codes.ts` 단일 소스). 값이 없는 칸(「-」)은 PDF에 싣지 않는다.
 */
export const FILING_CODE_PDF_LABELS = ["세율구분 코드", ...Object.values(FILING_CODE_ROW_LABEL)] as const;

export function buildFilingHeadPdfRows(p: Parameters<typeof buildFilingPdfRowsByLabels>[0]): FilingHeadPdfRow[] {
  return buildFilingPdfRowsByLabels(p, HEAD_LABELS);
}

export function buildFilingCodePdfRows(p: Parameters<typeof buildFilingPdfRowsByLabels>[0]): FilingHeadPdfRow[] {
  return buildFilingPdfRowsByLabels(p, FILING_CODE_PDF_LABELS, true);
}

function buildFilingPdfRowsByLabels(p: {
  result: TransferTaxResult;
  formData?: TransferFormData;
  asset?: AssetForm;
  transferPriceOverride?: number;
  aggregate?: AggregateMeta;
  acquisitionDateLabel?: string;
  acquisitionDateOverride?: string;
  redevSubject?: "right" | "apt";
  redevSettlementDirection?: "pay" | "receive";
}, labels: readonly string[], skipEmpty = false): FilingHeadPdfRow[] {
  const { columns, mode } = deriveColumns(p.result, p.aggregate, p.redevSubject, p.redevSettlementDirection);
  const rows = buildRows(p.result, mode, p.formData, p.asset, p.transferPriceOverride, p.acquisitionDateLabel, p.acquisitionDateOverride, p.aggregate);
  const many = columns.length > 1;
  return labels.flatMap((head) => {
    const row = rows.find((r) => r.label === head || r.label.startsWith(`${head} `));
    if (!row) return [];
    return columns.flatMap((col) => {
      const value = fmtCell(row.values[col.key]);
      // 여러 열이면 값 없는 칸은 줄을 만들지 않는다
      if ((many || skipEmpty) && value === "-") return [];
      const note = row.notes?.[col.key];
      return [{ label: many ? `${row.label} — ${col.label}` : row.label, value, ...(note ? { note } : {}) }];
    });
  });
}

export interface SingleFilingPdfArgs {
  result: TransferTaxResult;
  formData?: TransferFormData;
  asset?: AssetForm;
  transferPriceOverride?: number;
}

/** 단건 결과 뷰 — 화면 표와 같은 인자. 이월과세면 채택된 쪽 서식의 날짜다(`result`가 채택값이다). */
export function buildSingleFilingHeadPdfRows(p: SingleFilingPdfArgs, kind: "head" | "code" = "head"): FilingHeadPdfRow[] {
  const { result, asset } = p;
  const carryover = result.carryoverTaxationDetail;
  const adoptedA = carryover?.adoptedScenario === "A";
  return (kind === "code" ? buildFilingCodePdfRows : buildFilingHeadPdfRows)({
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
