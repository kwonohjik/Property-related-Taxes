"use client";

/**
 * InheritanceFilingForm9PdfDocument — 별지 제9호서식(앞쪽) react-pdf Document.
 *
 * 단일 출처: 화면(`FilingForm9CoverSection`)과 동일 `buildFilingForm9Data` 결과(data) 소비.
 * 라벨 상수·계산값 모두 화면과 공유 → dual-truth 0. 폰트 per-glyph fallback(besshi-pdf-styles).
 *
 * Design: docs/02-design/features/inheritance-filing-form-9-replica.ui.design.md §6
 */

import React from "react";
import { Document, Page, View, Text } from "@react-pdf/renderer";
import { registerFonts } from "./fonts";
import { s, C } from "./besshi-pdf-styles";
import type { FilingFormRow } from "@/lib/tax-engine/types/inheritance-gift.types";
import type { FilingForm9Data } from "@/lib/calc/filing-form-9-data";
import {
  FF9_FORM_TITLE,
  FF9_FORM_SUBTITLE,
  FF9_SUBMISSION_DOCS,
  FF9_OFFICER_CHECK_DOCS,
  FF9_CONSENT_TITLE,
  FF9_CONSENT_TEXT,
} from "@/components/calc/inheritance/filing-form-9/filing-form-9-constants";

registerFonts();

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
 * 별지9호 단일 Page — 통합 결과 PDF(ResultPdfDocument)에서 재사용 가능하도록 분리.
 * (Document 중첩 불가 → Page 단위로 추출)
 */
export function FilingForm9PdfPage({ data }: { data: FilingForm9Data }) {
  return (
      <Page size="A4" style={s.page}>
        <Text style={s.subtitle}>{FF9_FORM_SUBTITLE}</Text>
        <Text style={s.title}>{FF9_FORM_TITLE}</Text>

        {/* 식별정보 (도출분) */}
        <View style={s.metaRow}>
          <Text style={s.metaLabel}>① 신고인</Text>
          <Text style={s.metaValue}>{data.declarant?.name ?? ""}</Text>
          <Text style={s.metaLabel}>② 주민등록번호</Text>
          <Text style={s.metaValue}>{data.declarant?.residentNumber ?? ""}</Text>
        </View>
        <View style={s.metaRow}>
          <Text style={s.metaLabel}>⑤ 관계</Text>
          <Text style={s.metaValue}>{data.declarant?.relationLabel ?? ""}</Text>
          <Text style={s.metaLabel} />
          <Text style={s.metaValue} />
        </View>
        <View style={s.metaRow}>
          <Text style={s.metaLabel}>⑦ 피상속인</Text>
          <Text style={s.metaValue}>{data.decedentName}</Text>
          <Text style={s.metaLabel}>⑧ 주민등록번호</Text>
          <Text style={s.metaValue}>{data.decedentResidentNumber}</Text>
        </View>
        <View style={s.metaRow}>
          <Text style={s.metaLabel}>⑫ 상속개시일</Text>
          <Text style={s.metaValue}>{data.deathDate}</Text>
          <Text style={s.metaLabel}>신고기한</Text>
          <Text style={s.metaValue}>{data.filingDueDate}</Text>
        </View>

        {/* 세액 계산 (좌 ⑰~㉞ → 우 영리법인면제~㊷) */}
        <Text style={s.sectionTitle}>세액 계산</Text>
        <View style={s.tableHeader}>
          <Text style={s.cellNum}>번호</Text>
          <Text style={s.cellLabel}>구분</Text>
          <Text style={s.cellAmount}>금액</Text>
        </View>
        {data.leftRows.map((r, i) => (
          <CalcRow key={`l-${i}`} row={r} />
        ))}
        {data.rightRows.map((r, i) => (
          <CalcRow key={`r-${i}`} row={r} />
        ))}

        {/* 하단 제출서류·담당공무원 */}
        <Text style={s.sectionTitle}>신청(신고)인 제출서류</Text>
        {FF9_SUBMISSION_DOCS.map((d, i) => (
          <Text key={`sub-${i}`} style={{ fontSize: 7, marginBottom: 1 }}>
            {d}
          </Text>
        ))}
        <Text style={[s.sectionTitle, { marginTop: 6 }]}>담당공무원 확인사항</Text>
        {FF9_OFFICER_CHECK_DOCS.map((d, i) => (
          <Text key={`off-${i}`} style={{ fontSize: 7, marginBottom: 1 }}>
            {d}
          </Text>
        ))}

        {/* 행정정보 공동이용 동의서 */}
        <View
          style={{
            marginTop: 8,
            borderWidth: 0.5,
            borderColor: C.black,
            borderStyle: "solid",
            padding: 4,
          }}
        >
          <Text style={{ fontSize: 8, fontWeight: 700, textAlign: "center" }}>
            {FF9_CONSENT_TITLE}
          </Text>
          <Text style={{ fontSize: 7, marginTop: 2, lineHeight: 1.4 }}>{FF9_CONSENT_TEXT}</Text>
        </View>

        <Text style={s.footer}>
          ※ 식별정보(성명·주민등록번호·주소)·납부방법 금액은 자동 산출되지 않습니다 — 인쇄 후 수기 작성.
        </Text>
      </Page>
  );
}

export function InheritanceFilingForm9PdfDocument({ data }: { data: FilingForm9Data }) {
  return (
    <Document>
      <FilingForm9PdfPage data={data} />
    </Document>
  );
}

export function generateFilingForm9PdfFilename(deathDate?: string): string {
  return `상속세과세표준신고서_${deathDate ?? "별지9호"}.pdf`;
}
