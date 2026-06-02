"use client";

/**
 * GiftFilingForm10PdfDocument — 증여세 별지 제10호서식 react-pdf Document.
 *
 * "증여세과세표준신고 및 자진납부계산서 (기본세율 적용 증여재산 신고용)"
 * 단일 출처: 화면(`GiftTaxFilingFormTable`)과 동일 `result.besshi10Rows`(FilingFormRow[]) 소비.
 *   계산값(좌 ⑰~㊱ · 우 ㊲~㊼)은 엔진 산출 → dual-truth 0. 폰트 per-glyph fallback.
 * CalcRow 렌더러는 별지9호(InheritanceFilingForm9PdfDocument)와 동일 패턴 (데이터는 단일).
 *
 * 설계: docs/02-design/features/selective-print-6tax.ui.design.md §4
 */

import React from "react";
import { Document, Page, View, Text } from "@react-pdf/renderer";
import { registerFonts } from "./fonts";
import { s } from "./besshi-pdf-styles";
import type { FilingFormRow } from "@/lib/tax-engine/types/inheritance-gift.types";

registerFonts();

const FF10_TITLE = "증여세과세표준신고 및 자진납부계산서";
const FF10_SUBTITLE =
  "[별지 제10호서식] 기본세율 적용 증여재산 신고용 — 상속세 및 증여세법 시행규칙";

function fmtAmt(n: number): string {
  return n.toLocaleString("ko-KR");
}

function CalcRow({ row }: { row: FilingFormRow }) {
  if (row.display === "header") {
    return (
      <View style={[s.tableRow, s.groupRow]}>
        <Text style={{ flex: 1, padding: 3, fontSize: 8, textAlign: "center", fontWeight: 700 }}>
          {row.label}
        </Text>
      </View>
    );
  }
  const amtText =
    row.display === "rate"
      ? row.formula ?? ""
      : row.display === "dash"
        ? "—"
        : fmtAmt(row.amount);
  const label =
    row.formula && row.display !== "rate" ? `${row.label} (${row.formula})` : row.label;
  return (
    <View style={s.tableRow}>
      <Text style={s.cellNum}>{row.number}</Text>
      <Text style={s.cellLabel}>{label}</Text>
      <Text style={s.cellAmount}>{amtText}</Text>
    </View>
  );
}

/**
 * 별지10호 단일 Page — 통합 결과 PDF(ResultPdfDocument)에서 재사용 가능하도록 분리.
 * (Document 중첩 불가 → Page 단위로 추출)
 */
export function FilingForm10PdfPage({ rows }: { rows: FilingFormRow[] }) {
  const leftRows = rows.filter((r) => r.column === "left");
  const rightRows = rows.filter((r) => r.column === "right");
  return (
    <Page size="A4" style={s.page}>
      <Text style={s.subtitle}>{FF10_SUBTITLE}</Text>
      <Text style={s.title}>{FF10_TITLE}</Text>

      {/* 세액 계산 (좌 ⑰~㊱ → 우 ㊲~㊼ 순차) */}
      <Text style={s.sectionTitle}>세액 계산</Text>
      <View style={s.tableHeader}>
        <Text style={s.cellNum}>번호</Text>
        <Text style={s.cellLabel}>구분</Text>
        <Text style={s.cellAmount}>금액</Text>
      </View>
      {leftRows.map((r, i) => (
        <CalcRow key={`l-${i}`} row={r} />
      ))}
      {rightRows.map((r, i) => (
        <CalcRow key={`r-${i}`} row={r} />
      ))}

      <Text style={s.footer}>
        ※ 식별정보(성명·주민등록번호·주소)·납부방법 금액은 자동 산출되지 않습니다 — 인쇄 후 수기 작성.
      </Text>
    </Page>
  );
}

export function GiftFilingForm10PdfDocument({ rows }: { rows: FilingFormRow[] }) {
  return (
    <Document>
      <FilingForm10PdfPage rows={rows} />
    </Document>
  );
}
