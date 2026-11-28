"use client";

/**
 * InstallmentReceiptsMatrix — §178의5② 장기할부 분할 수령 입력 매트릭스 (FS-09)
 *
 * 법령: 소득세법 시행령 §178의5② (2026.4.21. 시행)
 *   "장기할부조건의 경우에는 양도일을 수령한 날로 본다"
 *   → 각 수령일의 기준환율로 개별 원화 환산 후 합산
 *
 * 행 입력 본체는 국외자산 공용 leaf `ForeignDatedAmountRows`다(부동산 지출 행과 공유).
 * 이 파일은 주식 수령 행의 필드명(`receiptDate`)과 문구만 입힌 얇은 어댑터다.
 */

import { ForeignDatedAmountRows } from "@/components/calc/foreign/ForeignDatedAmountRows";
import { krwOfExact } from "@/components/calc/foreign/krw-of";
import { LawArticleModal } from "@/components/ui/law-article-modal";

export type InstallmentReceiptRow = {
  receiptDate: string;
  amountForeign: string;
  exchangeRate: string;
};

interface InstallmentReceiptsMatrixProps {
  /** 수령 배열 */
  rows: InstallmentReceiptRow[];
  /** 통화코드 (표시용) */
  currencyCode: string;
  /** 변경 콜백 — onChange로 직접 store 갱신 (useEffect 금지) */
  onChange: (rows: InstallmentReceiptRow[]) => void;
}

/** 빈 행 팩토리 */
export function createEmptyInstallmentRow(): InstallmentReceiptRow {
  return { receiptDate: "", amountForeign: "", exchangeRate: "" };
}

const LABELS = {
  intro: (
    <>
      <LawArticleModal legalBasis="소득세법 시행령 §178의5 ②" label="§178의5②" /> 장기할부조건 양도: 각 수령일의 기준환율(외국환거래법)을
      수령액에 적용하여 원화 환산 후 합산합니다. 수령 건수는 2건 이상이어야 합니다.
    </>
  ),
  dateHeader: (
    <>수령일 (<LawArticleModal legalBasis="소득세법 시행령 §178의5 ②" label="§178의5②" />)</>
  ),
  amountHeader: "수령액",
  rowNoun: "수령",
  emptyText: "수령 내역을 추가하세요 (2건 이상 필수)",
  addText: "+ 수령 내역 추가",
  totalLabel: (
    <>
      <LawArticleModal legalBasis="소득세법 시행령 §178의5 ②" label="§178의5②" /> 원화 환산 합계
    </>
  ),
  singleRowNotice:
    "1건만 입력된 경우 단일 수령(single 모드) 사용을 권장합니다. §178의5② 분할 수령은 2건 이상이어야 합니다.",
};

export function InstallmentReceiptsMatrix({
  rows,
  currencyCode,
  onChange,
}: InstallmentReceiptsMatrixProps) {
  return (
    <ForeignDatedAmountRows
      rows={rows.map((r) => ({ date: r.receiptDate, amountForeign: r.amountForeign, exchangeRate: r.exchangeRate }))}
      currencyCode={currencyCode}
      onChange={(next) =>
        onChange(next.map((r) => ({ receiptDate: r.date, amountForeign: r.amountForeign, exchangeRate: r.exchangeRate })))
      }
      labels={LABELS}
      krwOf={krwOfExact}
    />
  );
}
