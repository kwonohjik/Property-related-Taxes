/**
 * 결과 PDF — **국외자산 부동산 양도소득세 섹션**(별지 제84호서식 신고서 표).
 *
 * 화면 신고서 표(`ForeignFilingFormTable`)와 **같은 행·열 값**을 그린다 — 값은 순수 매핑(`buildForeignFilingForm`)이 만들고
 * 결과뷰가 `inputData.foreignFilingForm`으로 넘긴다. PDF가 다시 계산하거나 칸을 추정하지 않는다.
 * 선택 출력 leaf `form-table`일 때만 그린다(`lib/print/transfer-foreign-print-sections.ts`).
 */
import { Text, View } from "@react-pdf/renderer";
import { C, s, fmt, type R } from "./ResultPdfPrimitives";
import type { ForeignFilingForm } from "@/components/calc/results/foreign-realestate/foreign-filing-form";

export const FOREIGN_FILING_FORM_PDF_KEY = "foreignFilingForm" as const;

const cell = (v: number | string | null | undefined): string => {
  if (v === null || v === undefined || v === "") return "-";
  return typeof v === "number" ? fmt(v) : v;
};

/** inputData → 신고서 표 데이터 — 모양이 어긋나면 null(아무것도 그리지 않는다) */
export function foreignFilingFormOf(inputData: R | undefined): ForeignFilingForm | null {
  const f = inputData?.[FOREIGN_FILING_FORM_PDF_KEY] as Partial<ForeignFilingForm> | undefined;
  if (!f || !Array.isArray(f.columns) || !Array.isArray(f.rows) || f.columns.length === 0) return null;
  return { columns: f.columns, rows: f.rows, notices: Array.isArray(f.notices) ? f.notices : [] };
}

export function ForeignTransferSection({ r, inputData, selectedSectionIds }: { r: R; inputData?: R; selectedSectionIds?: string[] }) {
  if (selectedSectionIds !== undefined && !selectedSectionIds.includes("form-table")) return null;
  const form = foreignFilingFormOf(inputData);
  if (!form || r.isLiable === false) return null;
  const dataCols = form.columns;
  return (
    <>
      <Text style={s.sectionTitle}>신고서 양식 — 국외자산 부동산 (별지 제84호서식)</Text>
      <View style={s.table}>
        <View style={s.rowBg}>
          <Text style={[s.lbl, { flex: 3, fontWeight: 700 }]}>항목</Text>
          {dataCols.map((c) => (
            <Text key={c.key} style={{ flex: 2, fontSize: 8, fontWeight: 700, textAlign: "right" }}>{c.label}</Text>
          ))}
        </View>
        {form.rows.map((row, i) => (
          <View key={i} wrap={false}>
            <View style={row.highlight ? s.rowBg : s.row}>
              <Text style={[row.indent ? s.lblSub : s.lbl, { flex: 3 }]}>{row.label}</Text>
              {dataCols.map((c) => (
                <Text key={c.key} style={{ flex: 2, fontSize: 8, textAlign: "right", fontWeight: row.highlight ? 700 : 400, color: row.highlight ? C.accent : C.primary }}>
                  {cell(row.values[c.key])}
                </Text>
              ))}
            </View>
            {row.notes && Object.values(row.notes).map((n, k) => (
              <Text key={k} style={{ fontSize: 7, color: C.muted, paddingLeft: 10, marginBottom: 2 }}>※ {n}</Text>
            ))}
          </View>
        ))}
      </View>
      {form.notices.map((n, i) => (
        <Text key={i} style={{ fontSize: 7, color: C.muted, marginBottom: 2 }}>※ {n}</Text>
      ))}
    </>
  );
}
