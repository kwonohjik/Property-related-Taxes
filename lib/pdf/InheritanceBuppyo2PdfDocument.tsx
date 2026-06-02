"use client";

/**
 * InheritanceBuppyo2PdfDocument — 별지 제9호서식 부표 2 react-pdf Document (A4 가로/landscape).
 *
 * 단일 출처: 화면(BesshiBuppyo2Section)과 동일 buildBuppyo2Data 결과(Buppyo2HeirData[]) 소비.
 * 상속인별 2페이지: 1쪽(가 ①~⑧ + 나 "별첨" + 계 ⑰~㉘) / 2쪽(「상속인별 상속재산명세」 ⑨~⑯ + 계 행).
 * 폰트 per-glyph fallback(BESSHI_FONT_STACK). react-pdf는 colgroup·rowSpan 미지원 →
 * flex row + flexGrow 비례폭, 계 그룹은 flex wrapper(그룹 라벨 View + 멤버 컨테이너)로 구성.
 *
 * Design: docs/00-pm/inheritance-buppyo-2-image1-parity-page-split.plan.md
 */

import React from "react";
import { Document, Page, View, Text, StyleSheet } from "@react-pdf/renderer";
import { registerFonts, BESSHI_FONT_STACK } from "./fonts";
import type {
  Buppyo2HeirData,
  Buppyo2ItemRow,
  Buppyo2SectionTotal,
} from "@/lib/calc/besshi-buppyo-2-data";
import {
  BP2_FORM_TITLE,
  BP2_FORM_SUBTITLE,
  BP2_NA_SECTION_TITLE,
  BP2_CONTINUATION_MARK,
  BP2_PAGE1_NA_ROWS,
  splitBuppyo2NaRows,
  BP2_GA_LABELS as G,
  BP2_NA_LABELS as N,
  BP2_KYE_ROWS,
  BP2_PROPERTY_TYPE_LABEL,
  type Buppyo2KyeKey,
} from "@/components/calc/inheritance/besshi-buppyo-2/besshi-buppyo-2-constants";

registerFonts();

const fmt = (n: number) => n.toLocaleString("ko-KR");
const pct = (r: number) => `${parseFloat((r * 100).toFixed(2))}%`;
const MIN_ROWS = 8;
const OVERSEAS_CHK = "[ ]여 [ ]부";
const CIRCLED = ["①", "②", "③", "④", "⑤", "⑥", "⑦", "⑧", "⑨", "⑩"];

const bp = StyleSheet.create({
  page: {
    fontFamily: [...BESSHI_FONT_STACK],
    fontSize: 7,
    color: "#000000",
    padding: 15,
    backgroundColor: "#ffffff",
  },
  subtitle: { fontSize: 7, textAlign: "right", marginBottom: 2 },
  title: { fontSize: 12, fontWeight: 700, textAlign: "center", marginBottom: 6 },
  sheetTitle: { fontSize: 9, fontWeight: 700, marginBottom: 3 },
  sectionLabel: { fontSize: 8, fontWeight: 700, marginTop: 5, marginBottom: 2 },
  row: { flexDirection: "row" },
  col: { flexBasis: 0 },
  cell: {
    borderWidth: 0.5,
    borderColor: "#000000",
    borderStyle: "solid",
    padding: 2,
    fontSize: 7,
    flexBasis: 0,
  },
  head: { backgroundColor: "#f3f4f6", fontWeight: 700, textAlign: "center" },
  footer: { fontSize: 6, color: "#6b7280", marginTop: 8 },
});

function Cell({
  w,
  children,
  align = "left",
  head = false,
}: {
  w: number;
  children?: React.ReactNode;
  align?: "left" | "center" | "right";
  head?: boolean;
}) {
  return (
    <Text
      style={[
        bp.cell,
        { flexGrow: w },
        head ? bp.head : {},
        align === "right" ? { textAlign: "right" } : {},
        align === "center" ? { textAlign: "center" } : {},
      ]}
    >
      {children ?? " "}
    </Text>
  );
}

// 가 8칼럼 / 나 10칼럼 비례폭
const GA_W = [1.2, 1, 1.3, 1.5, 1, 1.5, 1, 1.5];
const NA_W = [0.9, 1.3, 0.8, 1, 2, 1.4, 1, 1.2, 1.4, 0.9];

function GaBlock({ a }: { a: Buppyo2HeirData["sectionA"] }) {
  return (
    <View>
      <Text style={bp.sectionLabel}>가. 상속인별 상속현황</Text>
      <View style={bp.row}>
        <Cell w={GA_W[0]} head align="center">{G.relation}</Cell>
        <Cell w={GA_W[1]} head align="center">{G.name}</Cell>
        <Cell w={GA_W[2]} head align="center">{G.rrn}</Cell>
        <Cell w={GA_W[3]} head align="center">{G.address}</Cell>
        <Cell w={GA_W[4]} head align="center">{G.legalRatio}</Cell>
        <Cell w={GA_W[5]} head align="center">{G.legalValue}</Cell>
        <Cell w={GA_W[6]} head align="center">{G.actualRatio}</Cell>
        <Cell w={GA_W[7]} head align="center">{G.actualValue}</Cell>
      </View>
      <View style={bp.row}>
        <Cell w={GA_W[0]} align="center">{a.relation}</Cell>
        <Cell w={GA_W[1]} align="center">{a.name}</Cell>
        <Cell w={GA_W[2]} align="center">{a.residentId}</Cell>
        <Cell w={GA_W[3]} align="center">{a.address}</Cell>
        <Cell w={GA_W[4]} align="center">{a.legalShareLabel ?? " "}</Cell>
        <Cell w={GA_W[5]} align="right">{a.legalShareAmount != null ? fmt(a.legalShareAmount) : " "}</Cell>
        <Cell w={GA_W[6]} align="center">{pct(a.actualShareRatio)}</Cell>
        <Cell w={GA_W[7]} align="right">{fmt(a.actualShareAmount)}</Cell>
      </View>
    </View>
  );
}

const NA_LABELS = [
  N.kindCode, N.typeCode, N.overseas, N.country, N.location,
  N.bizNo, N.quantity, N.unitPrice, N.amount, N.methodCode,
];

function NaHeadRow() {
  return (
    <View style={bp.row}>
      {NA_LABELS.map((l, i) => (
        <Cell key={i} w={NA_W[i]} head align="center">{l}</Cell>
      ))}
    </View>
  );
}

function NaRow({ r }: { r: Buppyo2ItemRow }) {
  return (
    <View style={bp.row}>
      <Cell w={NA_W[0]} align="center">{r.kindCode}</Cell>
      <Cell w={NA_W[1]} align="center">{r.typeCode} {BP2_PROPERTY_TYPE_LABEL[r.typeCode] ?? ""}</Cell>
      <Cell w={NA_W[2]} align="center">{OVERSEAS_CHK}</Cell>
      <Cell w={NA_W[3]} align="center">{r.overseasCountry ?? " "}</Cell>
      <Cell w={NA_W[4]}>{r.locationOrName}</Cell>
      <Cell w={NA_W[5]} align="center">{r.ownershipShareLabel ?? " "}</Cell>
      <Cell w={NA_W[6]} align="right">{r.quantityOrArea != null ? fmt(r.quantityOrArea) : " "}</Cell>
      <Cell w={NA_W[7]} align="right">{r.unitPrice != null ? fmt(r.unitPrice) : " "}</Cell>
      <Cell w={NA_W[8]} align="right">{fmt(r.valuatedAmount)}</Cell>
      <Cell w={NA_W[9]} align="center">{r.valuationMethodCode}</Cell>
    </View>
  );
}

function NaEmptyRow() {
  return (
    <View style={bp.row}>
      {NA_W.map((w, c) => (
        <Cell key={c} w={w} align="center">{c === 2 ? OVERSEAS_CHK : " "}</Cell>
      ))}
    </View>
  );
}

/** 1쪽 나 — 데이터 page1Rows + (오버플로 시) "별지 계속" + 빈행 패딩 = 5행 */
function NaPage1Block({
  rows,
  needsContinuation,
}: {
  rows: Buppyo2ItemRow[];
  needsContinuation: boolean;
}) {
  const pad = Math.max(
    0,
    BP2_PAGE1_NA_ROWS - rows.length - (needsContinuation ? 1 : 0),
  );
  return (
    <View>
      <Text style={bp.sectionLabel}>나. 상속인별 상속재산명세</Text>
      <NaHeadRow />
      {rows.map((r, i) => <NaRow key={i} r={r} />)}
      {needsContinuation && (
        <View style={bp.row}>
          <Cell w={NA_W[0]}> </Cell>
          <Cell w={NA_W[1]}> </Cell>
          <Cell w={NA_W[2]} align="center">{OVERSEAS_CHK}</Cell>
          <Cell w={NA_W[3]}> </Cell>
          <Cell w={NA_W[4]}>{BP2_CONTINUATION_MARK}</Cell>
          <Cell w={NA_W[5]}> </Cell>
          <Cell w={NA_W[6]}> </Cell>
          <Cell w={NA_W[7]}> </Cell>
          <Cell w={NA_W[8]}> </Cell>
          <Cell w={NA_W[9]}> </Cell>
        </View>
      )}
      {Array.from({ length: pad }).map((_, i) => <NaEmptyRow key={i} />)}
    </View>
  );
}

/** 2쪽 본체 — 실제 명세 + 계 행(⑮평가가액 합계) */
function NaBlock({ rows, total }: { rows: Buppyo2ItemRow[]; total: number }) {
  const pad = Math.max(0, MIN_ROWS - rows.length);
  const totalLabelW = NA_W.slice(0, 8).reduce((s, w) => s + w, 0);
  return (
    <View>
      <NaHeadRow />
      {rows.map((r, i) => <NaRow key={i} r={r} />)}
      {Array.from({ length: pad }).map((_, i) => <NaEmptyRow key={`e${i}`} />)}
      <View style={bp.row}>
        <Cell w={totalLabelW} align="center">계</Cell>
        <Cell w={NA_W[8]} align="right">{fmt(total)}</Cell>
        <Cell w={NA_W[9]}> </Cell>
      </View>
    </View>
  );
}

function kyeValue(key: Buppyo2KyeKey, t: Buppyo2SectionTotal): number | null {
  switch (key) {
    case "estate_total": return t.grossEstateValue;
    case "presumed": return t.presumedAmount;
    case "prior_gift_13": return t.priorGift13;
    case "prior_gift_30_5": return t.priorGift30_5;
    case "prior_gift_30_6": return t.priorGift30_6;
    case "total": return t.total;
    default: return null;
  }
}

type KyeRowMeta = {
  no: string;
  key: Buppyo2KyeKey;
  label: string;
  group?: string;
  groupSize?: number;
};

function KyeRowPdf({ no, label, v, labelW }: { no: string; label: string; v: number | null; labelW: number }) {
  return (
    <View style={bp.row}>
      <Cell w={labelW}>{no} {label}</Cell>
      <Cell w={2} align="right">{v != null ? fmt(v) : " "}</Cell>
    </View>
  );
}

/** 계 ⑰~㉘ — 좌측 "계" + 비과세/불산입/가산증여 그룹 wrapper */
function KyeBlock({ t }: { t: Buppyo2SectionTotal }) {
  const UNGROUPED_LABEL_W = 8; // 그룹열 자리까지 차지
  const GROUPED_LABEL_W = 6;
  const rows = BP2_KYE_ROWS as readonly KyeRowMeta[];
  const elements: React.ReactNode[] = [];
  let i = 0;
  while (i < rows.length) {
    const row = rows[i];
    if (row.group && row.groupSize) {
      const members = rows.slice(i, i + row.groupSize);
      elements.push(
        <View style={bp.row} key={row.key}>
          <Cell w={2} align="center">{row.group}</Cell>
          <View style={[bp.col, { flexGrow: GROUPED_LABEL_W + 2 }]}>
            {members.map((m) => (
              <KyeRowPdf key={m.key} no={m.no} label={m.label} v={kyeValue(m.key, t)} labelW={GROUPED_LABEL_W} />
            ))}
          </View>
        </View>,
      );
      i += row.groupSize;
    } else {
      elements.push(
        <KyeRowPdf key={row.key} no={row.no} label={row.label} v={kyeValue(row.key, t)} labelW={UNGROUPED_LABEL_W} />,
      );
      i += 1;
    }
  }
  return (
    <View>
      <Text style={bp.sectionLabel}>계</Text>
      <View style={bp.row}>
        <Cell w={0.6} align="center">계</Cell>
        <View style={[bp.col, { flexGrow: 10 }]}>{elements}</View>
      </View>
    </View>
  );
}

function FallbackNote() {
  return (
    <Text style={{ fontSize: 7, color: "#b45309", marginBottom: 2 }}>
      ※ 협의분할 미입력 자산은 명세(나)에서 생략되며, 계 합계에는 법정상속분 기준으로 포함됩니다.
    </Text>
  );
}

const FOOTER_NOTE =
  "※ 주민등록번호·주소·단가 등 미수집 칸과 비과세·과세가액불산입 세부는 인쇄 후 수기 작성.";

export function InheritanceBuppyo2PdfDocument({
  data,
}: {
  data: Buppyo2HeirData[];
}) {
  return (
    <Document>
      {data.map((d, idx) => {
        const who = `상속인 ${CIRCLED[idx] ?? `${idx + 1}`} ${d.sectionA.name || d.sectionA.relation}`;
        const { page1Rows, page2Rows, needsContinuation, needsPage2 } =
          splitBuppyo2NaRows(d.itemRows);
        return (
          <React.Fragment key={d.heirId}>
            {/* 1쪽: 가 · 나(데이터/별지계속) · 계 */}
            <Page size="A4" orientation="landscape" style={bp.page}>
              <Text style={bp.subtitle}>{BP2_FORM_SUBTITLE}</Text>
              <Text style={bp.title}>{BP2_FORM_TITLE}</Text>
              <Text style={bp.sheetTitle}>{who}</Text>
              {d.usedLegalShareFallback && <FallbackNote />}
              <GaBlock a={d.sectionA} />
              <NaPage1Block rows={page1Rows} needsContinuation={needsContinuation} />
              <KyeBlock t={d.sectionTotal} />
              <Text style={bp.footer}>{FOOTER_NOTE}</Text>
            </Page>
            {/* 2쪽: 상속인별 상속재산명세 — 오버플로분(중복 없음) + 계. N>5일 때만 */}
            {needsPage2 && (
              <Page size="A4" orientation="landscape" style={bp.page}>
                <Text style={bp.title}>{BP2_NA_SECTION_TITLE}</Text>
                <Text style={bp.sheetTitle}>{who} (1쪽에서 계속)</Text>
                <NaBlock rows={page2Rows} total={d.itemRowsTotal} />
                <Text style={bp.footer}>{FOOTER_NOTE}</Text>
              </Page>
            )}
          </React.Fragment>
        );
      })}
    </Document>
  );
}

export function generateBuppyo2PdfFilename(deathDate?: string): string {
  return `상속인별상속재산_부표2_${deathDate || "미상"}.pdf`;
}
