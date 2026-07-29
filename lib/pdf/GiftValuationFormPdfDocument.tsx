"use client";

/**
 * GiftValuationFormPdfDocument — 증여재산 및 평가명세서(별지 제10호서식 부표 1) react-pdf.
 *
 * 단일 출처: 화면(`GiftTaxValuationFormTable`)과 동일 입력(valuationResults·grossGiftValue 등)
 *   + 동일 헬퍼(toEstateItemTypeCode·toEstateItemValuationMethodCode·toPriorGiftPropertyTypeCode)
 *   + 동일 산식(computeRow10·computeRow14, gift-valuation-besshi) → dual-truth 0.
 * A4 가로(landscape) — 본문 10컬럼 + 계 영역 ⑨~⑮.
 *
 * 설계: docs/02-design/features/selective-print-6tax.ui.design.md §4
 */

import React from "react";
import { Document, Page, View, Text, StyleSheet } from "@react-pdf/renderer";
import { registerFonts, BESSHI_FONT_STACK } from "./fonts";
import {
  toPriorGiftPropertyTypeCode,
  toEstateItemTypeCode,
  toEstateItemValuationMethodCode,
} from "@/components/calc/results/inheritance-filing-form-helpers";
import {
  PROPERTY_TYPE_LABEL,
  computeRow10,
  computeRow14,
} from "@/lib/calc/gift-valuation-besshi";
import type {
  EstateItem,
  PropertyValuationResult,
  PriorGift,
} from "@/lib/tax-engine/types/inheritance-gift.types";

registerFonts();

const ROWS_FIXED = 10; // 부표 1 본문 빈 행 포함 고정 행 수 (화면과 동일)

function fmt(n: number): string {
  return n.toLocaleString("ko-KR");
}

function propertyTypeText(code: string): string {
  return `${PROPERTY_TYPE_LABEL[code] ?? "기타재산"} (${code})`;
}

/** ③ 칸 텍스트 — 화면 describePriorGift와 동일 우선순위(소재지>명칭>fallback)의 PDF 텍스트 버전. */
function describePriorGiftText(pg: PriorGift): string {
  const loc = pg.propertyLocation?.trim();
  const name = pg.propertyName?.trim();
  if (loc) return name ? `${loc} (${name} · 사전증여 ${pg.giftDate})` : `${loc} (사전증여 ${pg.giftDate})`;
  if (name) return `${name} (사전증여 ${pg.giftDate})`;
  return `사전증여 (${pg.giftDate})`;
}

type Align = "center" | "left" | "right";
const COLS: { label: string; flex: number; align: Align }[] = [
  { label: "① 재산구분코드", flex: 3.2, align: "center" },
  { label: "② 재산종류코드", flex: 3.0, align: "center" },
  { label: "국외자산 여부", flex: 2.2, align: "center" },
  { label: "국외재산 국가명", flex: 2.5, align: "center" },
  { label: "③ 소재지ㆍ법인명 등", flex: 5.5, align: "left" },
  { label: "④ 사업자등록번호(지분율)", flex: 3.5, align: "center" },
  { label: "⑤ 수량(면적)", flex: 2.2, align: "right" },
  { label: "⑥ 단가", flex: 2.7, align: "right" },
  { label: "⑦ 평가가액", flex: 3.2, align: "right" },
  { label: "⑧ 평가기준코드", flex: 2.2, align: "center" },
];

const t = StyleSheet.create({
  page: {
    fontFamily: [...BESSHI_FONT_STACK],
    fontSize: 7,
    color: "#000000",
    padding: 18,
    backgroundColor: "#ffffff",
  },
  formHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    fontSize: 7,
    marginBottom: 2,
  },
  title: { fontSize: 13, fontWeight: 700, textAlign: "center", marginBottom: 2 },
  note: { fontSize: 7, marginBottom: 4 },
  table: { borderWidth: 0.5, borderColor: "#000000", borderStyle: "solid" },
  thead: {
    flexDirection: "row",
    backgroundColor: "#f3f4f6",
    borderBottomWidth: 0.5,
    borderColor: "#000000",
    borderStyle: "solid",
  },
  row: {
    flexDirection: "row",
    borderBottomWidth: 0.5,
    borderColor: "#000000",
    borderStyle: "solid",
    minHeight: 14,
  },
  sumTable: {
    marginTop: 6,
    borderWidth: 0.5,
    borderColor: "#000000",
    borderStyle: "solid",
    width: "55%",
  },
  sumRow: {
    flexDirection: "row",
    borderBottomWidth: 0.5,
    borderColor: "#000000",
    borderStyle: "solid",
  },
  sumLabel: {
    flex: 1,
    padding: 3,
    fontSize: 7,
    borderRightWidth: 0.5,
    borderColor: "#000000",
    borderStyle: "solid",
  },
  sumAmt: { width: 120, padding: 3, fontSize: 7, textAlign: "right" },
  sumTotal: { fontWeight: 700, backgroundColor: "#f3f4f6" },
  attach: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 6,
    borderWidth: 0.5,
    borderColor: "#000000",
    borderStyle: "solid",
    padding: 4,
    fontSize: 7,
  },
  footer: { fontSize: 6.5, textAlign: "right", marginTop: 3, color: "#374151" },
});

function HeadCell({ col, last }: { col: (typeof COLS)[number]; last: boolean }) {
  return (
    <Text
      style={{
        flex: col.flex,
        padding: 2,
        fontSize: 6.5,
        fontWeight: 700,
        textAlign: "center",
        borderRightWidth: last ? 0 : 0.5,
        borderColor: "#000000",
        borderStyle: "solid",
      }}
    >
      {col.label}
    </Text>
  );
}

function DataRow({ cells }: { cells: string[] }) {
  return (
    <View style={t.row}>
      {COLS.map((c, i) => (
        <Text
          key={i}
          style={{
            flex: c.flex,
            padding: 2,
            fontSize: 6.5,
            textAlign: c.align,
            borderRightWidth: i === COLS.length - 1 ? 0 : 0.5,
            borderColor: "#000000",
            borderStyle: "solid",
          }}
        >
          {cells[i]}
        </Text>
      ))}
    </View>
  );
}

function SumRow({
  label,
  amount,
  total = false,
}: {
  label: string;
  amount: number;
  total?: boolean;
}) {
  return (
    <View style={[t.sumRow, total ? t.sumTotal : {}]}>
      <Text style={[t.sumLabel, total ? t.sumTotal : {}]}>{label}</Text>
      <Text style={[t.sumAmt, total ? t.sumTotal : {}]}>{fmt(amount)}</Text>
    </View>
  );
}

export interface GiftValuationFormPdfProps {
  valuationResults: PropertyValuationResult[];
  estateItems: EstateItem[];
  grossGiftValue: number;
  exemptAmount: number;
  aggregatedGiftValue: number;
  /** §47① 채무인수·§36 대납가산 — ⑭ 역산 시 반영 (별지10호 ㉓ 정합, H-48) */
  debtAssumed?: number;
  donorPaidTax?: number;
  publicInterestExclusion?: number;
  publicTrustExclusion?: number;
  disabledTrustExclusion?: number;
  priorGifts?: PriorGift[];
}

/**
 * 부표1 단일 Page — 통합 결과 PDF(ResultPdfDocument)에서 재사용 가능하도록 분리.
 */
export function GiftValuationFormPdfPage({
  valuationResults,
  estateItems,
  grossGiftValue,
  exemptAmount,
  aggregatedGiftValue,
  debtAssumed = 0,
  donorPaidTax = 0,
  publicInterestExclusion = 0,
  publicTrustExclusion = 0,
  disabledTrustExclusion = 0,
  priorGifts = [],
}: GiftValuationFormPdfProps) {
  const itemMap = new Map(estateItems.map((it) => [it.id, it]));
  const dataRowCount = valuationResults.length + priorGifts.length;
  const emptyRowCount = Math.max(0, ROWS_FIXED - dataRowCount);

  const row10 = computeRow10(
    exemptAmount,
    publicInterestExclusion,
    publicTrustExclusion,
    disabledTrustExclusion,
  );
  const row14 = computeRow14(aggregatedGiftValue, grossGiftValue, exemptAmount, debtAssumed, donorPaidTax);

  const valuationRows: string[][] = valuationResults.map((vr) => {
    const item = itemMap.get(vr.estateItemId);
    const propertyCode = item ? toEstateItemTypeCode(item.category) : "12";
    const methodCode = item ? toEstateItemValuationMethodCode(item, vr) : "08";
    const shares = item?.listedStockShares;
    const unitPrice = item?.listedStockAvgPrice;
    return [
      "A11",
      propertyTypeText(propertyCode),
      "[ ]여 [ ]부",
      "",
      item?.name ?? "—",
      "",
      shares ? shares.toLocaleString("ko-KR") : "",
      unitPrice ? fmt(unitPrice) : "",
      fmt(vr.valuatedAmount),
      methodCode,
    ];
  });

  const priorRows: string[][] = priorGifts.map((pg) => [
    "A24",
    propertyTypeText(toPriorGiftPropertyTypeCode(pg)),
    "[ ]여 [ ]부",
    "",
    describePriorGiftText(pg),
    "",
    "",
    "",
    fmt(pg.giftAmount),
    "08",
  ]);

  const emptyCells: string[] = ["", "", "[ ]여 [ ]부", "", "", "", "", "", "", ""];

  return (
    <Page size="A4" orientation="landscape" style={t.page}>
      <View style={t.formHeaderRow}>
        <Text>■ 상속세 및 증여세법 시행규칙 [별지 제10호서식 부표 1] 〈개정 2026. 3. 20.〉</Text>
        <Text>(앞쪽)</Text>
      </View>
      <Text style={t.title}>증여재산 및 평가명세서</Text>
      <Text style={t.note}>※ 뒤쪽의 작성방법을 읽고 작성하시기 바랍니다.</Text>

      {/* 본문 표 */}
      <View style={t.table}>
        <View style={t.thead}>
          {COLS.map((c, i) => (
            <HeadCell key={i} col={c} last={i === COLS.length - 1} />
          ))}
        </View>
        {valuationRows.map((cells, i) => (
          <DataRow key={`v-${i}`} cells={cells} />
        ))}
        {priorRows.map((cells, i) => (
          <DataRow key={`p-${i}`} cells={cells} />
        ))}
        {Array.from({ length: emptyRowCount }).map((_, i) => (
          <DataRow key={`e-${i}`} cells={emptyCells} />
        ))}
      </View>

      {/* 계 영역 ⑨~⑮ */}
      <View style={t.sumTable}>
        <SumRow label="⑨ 증여재산가액" amount={grossGiftValue} />
        <SumRow label="⑩ 비과세재산가액" amount={row10} />
        <SumRow label="⑪ 공익법인 출연재산가액 (과세가액 불산입)" amount={publicInterestExclusion} />
        <SumRow label="⑫ 공익신탁 재산가액" amount={publicTrustExclusion} />
        <SumRow label="⑬ 장애인 신탁재산가액" amount={disabledTrustExclusion} />
        <SumRow label="⑭ 증여재산가산액" amount={row14} />
        <SumRow label="⑮ 합계" amount={aggregatedGiftValue} total />
      </View>

      <View style={t.attach}>
        <Text>첨부서류: 증여재산 증명서류 (예: 잔고증명서, 예금통장 사본 등)</Text>
        <Text>수수료 없음</Text>
      </View>
      <Text style={t.footer}>297mm×210mm[백상지 80g/㎡]</Text>
    </Page>
  );
}

export function GiftValuationFormPdfDocument(props: GiftValuationFormPdfProps) {
  return (
    <Document>
      <GiftValuationFormPdfPage {...props} />
    </Document>
  );
}
