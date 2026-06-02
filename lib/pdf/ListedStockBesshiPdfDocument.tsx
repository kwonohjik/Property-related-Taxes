"use client";

/**
 * ListedStockBesshiPdfDocument — 상장주식 평가조서(갑·을) 2장 react-pdf Document.
 *
 * Page 1 (갑지): 18칸 표 (이미지 4 정합)
 * Page 2 (을지): 좌5×31 + 우5×31 + 소계·일수·합계·평균 4행 (이미지 5 정합)
 *
 * 단일 출처:
 *   - 화면 ↔ PDF: components/calc/inheritance/listed-stock/besshi/listed-besshi-constants.ts
 *   - data: result.besshiData (evaluateListedStock echo) — UI 재계산 0건
 *
 * 정책:
 *   - 라벨 dual-truth 차단 ([[ui_engine_dual_truth_avoidance]])
 *   - 폰트 fallback per-glyph (NanumGothic + IBM Plex Sans KR)
 *   - 800줄 가드 (현재 ~430줄)
 *
 * Plan: docs/00-pm/listed-stock-besshi-form-replica.plan.md §8 Phase E
 */

import React from "react";
import { Document, Page, View, Text, StyleSheet } from "@react-pdf/renderer";
import { registerFonts } from "./fonts";
import { C, s as besshiStyles } from "./besshi-pdf-styles";
import {
  LS_P1_LABELS,
  LS_P1_STOCK_CLASS_LABEL,
  LS_P2_HEADERS,
  stripTradingExclusionSuffix,
} from "@/components/calc/inheritance/listed-stock/besshi/listed-besshi-constants";
import type {
  ListedStockBesshiData,
  ListedStockDailyRow,
} from "@/lib/tax-engine/types/listed-stock-valuation.types";

registerFonts();

const lsStyles = StyleSheet.create({
  page: {
    ...besshiStyles.page,
  },
  formTitle: {
    fontSize: 18,
    fontWeight: 700,
    textAlign: "center",
    letterSpacing: 4,
    marginBottom: 12,
  },
  sectionHeader: {
    borderWidth: 1,
    borderColor: C.black,
    backgroundColor: C.gray100,
    paddingVertical: 3,
    paddingHorizontal: 4,
    fontSize: 9,
    fontWeight: 700,
  },
  sectionBox: {
    borderWidth: 1,
    borderColor: C.black,
    marginBottom: 4,
  },
  row: {
    flexDirection: "row",
  },
  cell: {
    borderWidth: 0.5,
    borderColor: C.black,
    paddingVertical: 4,
    paddingHorizontal: 4,
    fontSize: 8,
  },
  cellLabel: {
    backgroundColor: C.gray50,
    fontWeight: 700,
  },
  cellValue: {
    textAlign: "right",
  },
  // 갑지 그리드 — 4열
  cellLabel4: { width: "12.5%" },
  cellValue4: { width: "12.5%" },
  cellLabel4Wide: { width: "12.5%" },
  cellValue4Wide: { width: "37.5%" },
  // 갑지 6열 (3섹션)
  cellLabel6: { width: "8.3%" },
  cellValue6: { width: "8.3%" },
  cellValue6Wide: { width: "75%" },
  // 을지 표
  p2Table: {
    borderWidth: 1,
    borderColor: C.black,
  },
  p2HeaderRow: {
    flexDirection: "row",
    backgroundColor: C.gray100,
  },
  p2HeaderCell: {
    borderWidth: 0.5,
    borderColor: C.black,
    paddingVertical: 2,
    fontSize: 8,
    fontWeight: 700,
    textAlign: "center",
  },
  // 좌·우 5열 각각 균등 분배
  p2ColNo: { width: "5%" },
  p2ColDate: { width: "10%" },
  p2ColClosing: { width: "10%", textAlign: "right", paddingRight: 4 },
  p2Cell: {
    borderWidth: 0.5,
    borderColor: C.black,
    paddingVertical: 1,
    paddingHorizontal: 2,
    fontSize: 7,
  },
  p2BgGray: { backgroundColor: C.gray50 },
  footer: {
    marginTop: 16,
    fontSize: 9,
    textAlign: "right",
  },
});

interface Props {
  besshi: ListedStockBesshiData;
}

function fmt(n: number): string {
  if (n == null || isNaN(n)) return "";
  return n.toLocaleString();
}

function fmtDate(iso?: string): string {
  if (!iso) return "-";
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? `${m[1]}.${m[2]}.${m[3]}` : iso;
}

function fmtPct(v?: number): string {
  if (v == null) return "-";
  return `${(v * 100).toFixed(2)}%`;
}

// ============================================================
// Page 1 — 갑지
// ============================================================

function P1Cell({
  label,
  value,
  labelWidth = "12.5%",
  valueWidth = "12.5%",
}: {
  label: string;
  value: string;
  labelWidth?: string;
  valueWidth?: string;
}) {
  return (
    <>
      <View style={{ ...lsStyles.cell, ...lsStyles.cellLabel, width: labelWidth }}>
        <Text>{label}</Text>
      </View>
      <View style={{ ...lsStyles.cell, ...lsStyles.cellValue, width: valueWidth }}>
        <Text>{value}</Text>
      </View>
    </>
  );
}

function Page1(props: Props) {
  const { page1, page1Values } = props.besshi;
  return (
    <Page size="A4" style={lsStyles.page}>
      <Text style={lsStyles.formTitle}>{LS_P1_LABELS.formTitle}</Text>

      {/* 1.평가대상 상장법인 */}
      <View style={lsStyles.sectionBox}>
        <Text style={lsStyles.sectionHeader}>{LS_P1_LABELS.section1Title}</Text>
        <View style={lsStyles.row}>
          <P1Cell label={`① ${LS_P1_LABELS["①"].replace(/\n/g, " ")}`} value={page1.companyName ?? "-"} />
          <P1Cell label={`② ${LS_P1_LABELS["②"].replace(/\n/g, " ")}`} value={page1.representative ?? "-"} />
          <P1Cell label={`③ ${LS_P1_LABELS["③"].replace(/\n/g, " ")}`} value={page1.companyAddress ?? "-"} />
          <P1Cell label={`④ ${LS_P1_LABELS["④"].replace(/\n/g, " ")}`} value={fmtDate(page1.valuationDate)} />
        </View>
        <View style={lsStyles.row}>
          <P1Cell label={`⑤ ${LS_P1_LABELS["⑤"].replace(/\n/g, " ")}`} value={LS_P1_STOCK_CLASS_LABEL[page1.stockClass]} />
          <P1Cell label={`⑥ ${LS_P1_LABELS["⑥"].replace(/\n/g, " ")}`} value={fmtDate(page1.listingDate)} />
          <P1Cell label={`⑦ ${LS_P1_LABELS["⑦"].replace(/\n/g, " ")}`} value={fmtDate(page1.capitalIncreaseDate)} />
          <P1Cell label={`⑧ ${LS_P1_LABELS["⑧"].replace(/\n/g, " ")}`} value={fmtDate(page1.mergerDate)} />
        </View>
      </View>

      {/* 2.1주당 가액 평가 */}
      <View style={lsStyles.sectionBox}>
        <Text style={lsStyles.sectionHeader}>{LS_P1_LABELS.section2Title}</Text>
        <View style={lsStyles.row}>
          <P1Cell
            label={`⑨ ${LS_P1_LABELS["⑨"].replace(/\n/g, " ")}`}
            value={fmt(page1Values.closingAvg)}
            labelWidth="75%"
            valueWidth="25%"
          />
        </View>
        <View style={lsStyles.row}>
          <P1Cell
            label={`⑩ ${LS_P1_LABELS["⑩"]}`}
            value={fmt(page1Values.perShareMajorShareholder)}
            labelWidth="75%"
            valueWidth="25%"
          />
        </View>
      </View>

      {/* 3.미상장주식의 1주당가액 평가 */}
      <View style={lsStyles.sectionBox}>
        <Text style={lsStyles.sectionHeader}>{LS_P1_LABELS.section3Title}</Text>
        <View style={lsStyles.row}>
          <P1Cell label={`⑪ ${LS_P1_LABELS["⑪"].replace(/\n/g, " ")}`} value={fmtPct(page1Values.priorDividendRate)} labelWidth="16.6%" valueWidth="16.6%" />
          <P1Cell label={`⑫ ${LS_P1_LABELS["⑫"].replace(/\n/g, " ")}`} value={page1Values.priorDividendAmount != null ? fmt(page1Values.priorDividendAmount) : "-"} labelWidth="16.6%" valueWidth="16.6%" />
          <P1Cell label={`⑬ ${LS_P1_LABELS["⑬"].replace(/\n/g, " ")}`} value={fmtDate(page1Values.dividendBaseDate)} labelWidth="16.6%" valueWidth="16.6%" />
        </View>
        <View style={lsStyles.row}>
          <P1Cell label={`⑭ ${LS_P1_LABELS["⑭"].replace(/\n/g, " ")}`} value={page1Values.daysUntilDividendBase != null ? `${page1Values.daysUntilDividendBase}/365` : "( /365)"} labelWidth="16.6%" valueWidth="16.6%" />
          <P1Cell label={`⑮ ${LS_P1_LABELS["⑮"].replace(/\n/g, " ")}`} value={page1Values.dividendDifference != null ? fmt(page1Values.dividendDifference) : "-"} labelWidth="16.6%" valueWidth="16.6%" />
          <P1Cell label={`⑯ ${LS_P1_LABELS["⑯"].replace(/\n/g, " ")}`} value={page1Values.perShareValue != null ? fmt(page1Values.perShareValue) : "-"} labelWidth="16.6%" valueWidth="16.6%" />
        </View>
        <View style={lsStyles.row}>
          <P1Cell
            label={`⑰ ${LS_P1_LABELS["⑰"]}`}
            value={page1Values.perShareMajorShareholderUnlisted != null ? fmt(page1Values.perShareMajorShareholderUnlisted) : "-"}
            labelWidth="75%"
            valueWidth="25%"
          />
        </View>
      </View>

      {/* §53⑧ 배제 사유 — 있을 때만 */}
      {page1Values.premiumExclusionLabel && (
        <Text style={{ fontSize: 8, marginTop: 4 }}>
          ※ 할증 배제 사유: {page1Values.premiumExclusionLabel}
        </Text>
      )}

      <Text style={lsStyles.footer}>
        {page1.valuationDate
          ? `${page1.valuationDate.slice(0, 4)}년 ${parseInt(page1.valuationDate.slice(5, 7), 10)}월     일`
          : ""}
      </Text>
      <Text style={lsStyles.footer}>성  명 :              (서명 또는 인)</Text>
    </Page>
  );
}

// ============================================================
// Page 2 — 을지
// ============================================================

function P2DateClosingPair({
  row,
}: {
  row: ListedStockDailyRow | undefined;
}) {
  return (
    <>
      <View style={[lsStyles.p2Cell, lsStyles.p2ColDate]}>
        <Text style={{ textAlign: "center" }}>{row?.monthDay ?? ""}</Text>
      </View>
      <View style={[lsStyles.p2Cell, lsStyles.p2ColClosing]}>
        <Text>
          {row?.closing != null ? fmt(row.closing) : stripTradingExclusionSuffix(row?.label)}
        </Text>
      </View>
    </>
  );
}

function Page2(props: Props) {
  const { page2 } = props.besshi;
  const rowsCount = Math.max(
    page2.beforeM1.length,
    page2.beforeM2.length,
    page2.afterM1.length,
    page2.afterM2.length,
  );
  return (
    <Page size="A4" style={lsStyles.page} orientation="portrait">
      <Text style={{ ...lsStyles.formTitle, fontSize: 14, letterSpacing: 2 }}>
        {LS_P2_HEADERS.formTitle}
      </Text>

      <View style={lsStyles.p2Table}>
        {/* 그룹 헤더 (좌·우) */}
        <View style={lsStyles.p2HeaderRow}>
          <View style={[lsStyles.p2HeaderCell, { width: "50%" }]}>
            <Text>{LS_P2_HEADERS.leftGroupHeader}</Text>
          </View>
          <View style={[lsStyles.p2HeaderCell, { width: "50%" }]}>
            <Text>{LS_P2_HEADERS.rightGroupHeader}</Text>
          </View>
        </View>
        {/* 컬럼 헤더 */}
        <View style={lsStyles.p2HeaderRow}>
          {[...LS_P2_HEADERS.columns, ...LS_P2_HEADERS.columns].map((c, i) => {
            const width = i % 5 === 0 ? "5%" : "10%";
            return (
              <View key={i} style={[lsStyles.p2HeaderCell, { width }]}>
                <Text>{c}</Text>
              </View>
            );
          })}
        </View>
        {/* 본문 31행 */}
        {Array.from({ length: rowsCount }).map((_, idx) => {
          const no = idx + 1;
          return (
            <View key={no} style={lsStyles.row}>
              <View style={[lsStyles.p2Cell, lsStyles.p2ColNo, lsStyles.p2BgGray]}>
                <Text style={{ textAlign: "center" }}>{no}</Text>
              </View>
              <P2DateClosingPair row={page2.beforeM1[idx]} />
              <P2DateClosingPair row={page2.beforeM2[idx]} />
              <View style={[lsStyles.p2Cell, lsStyles.p2ColNo, lsStyles.p2BgGray]}>
                <Text style={{ textAlign: "center" }}>{no}</Text>
              </View>
              <P2DateClosingPair row={page2.afterM1[idx]} />
              <P2DateClosingPair row={page2.afterM2[idx]} />
            </View>
          );
        })}
        {/* 소계 행 */}
        <View style={lsStyles.row}>
          <View style={[lsStyles.p2Cell, lsStyles.p2BgGray, { width: "15%", textAlign: "center", fontWeight: 700 }]}>
            <Text>{LS_P2_HEADERS.subtotalLabel}</Text>
          </View>
          <View style={[lsStyles.p2Cell, { width: "35%", textAlign: "right" }]}>
            <Text>{fmt(page2.beforeSubtotal)}</Text>
          </View>
          <View style={[lsStyles.p2Cell, lsStyles.p2BgGray, { width: "15%", textAlign: "center", fontWeight: 700 }]}>
            <Text>{LS_P2_HEADERS.subtotalLabel}</Text>
          </View>
          <View style={[lsStyles.p2Cell, { width: "35%", textAlign: "right" }]}>
            <Text>{fmt(page2.afterSubtotal)}</Text>
          </View>
        </View>
        {/* 일수 */}
        <View style={lsStyles.row}>
          <View style={[lsStyles.p2Cell, lsStyles.p2BgGray, { width: "15%", textAlign: "center", fontWeight: 700 }]}>
            <Text>{LS_P2_HEADERS.tradingDaysLabel}</Text>
          </View>
          <View style={[lsStyles.p2Cell, { width: "85%", textAlign: "center" }]}>
            <Text>{page2.tradingDays}</Text>
          </View>
        </View>
        {/* 종가합계 */}
        <View style={lsStyles.row}>
          <View style={[lsStyles.p2Cell, lsStyles.p2BgGray, { width: "15%", textAlign: "center", fontWeight: 700 }]}>
            <Text>{LS_P2_HEADERS.closingSumLabel}</Text>
          </View>
          <View style={[lsStyles.p2Cell, { width: "85%", textAlign: "right" }]}>
            <Text>{fmt(page2.closingSum)}</Text>
          </View>
        </View>
        {/* 종가평균 */}
        <View style={lsStyles.row}>
          <View style={[lsStyles.p2Cell, lsStyles.p2BgGray, { width: "15%", textAlign: "center", fontWeight: 700 }]}>
            <Text>{LS_P2_HEADERS.closingAverageLabel}</Text>
          </View>
          <View style={[lsStyles.p2Cell, { width: "85%", textAlign: "right", fontWeight: 700 }]}>
            <Text>{fmt(page2.closingAverage)}</Text>
          </View>
        </View>
      </View>
    </Page>
  );
}

// ============================================================
// Document
// ============================================================

/** 상장주식 평가조서(갑·을) Page 배열 — 통합 결과 PDF에서 재사용 (종목 1건) */
export function ListedStockBesshiPages({ besshi }: Props) {
  return (
    <>
      <Page1 besshi={besshi} />
      <Page2 besshi={besshi} />
    </>
  );
}

export function ListedStockBesshiPdfDocument({ besshi }: Props) {
  return (
    <Document>
      <ListedStockBesshiPages besshi={besshi} />
    </Document>
  );
}

/**
 * 다운로드 파일명 생성 헬퍼.
 * 우선순위: companyName > listedStockCode > name > "상장주식"
 * 평가기준일은 YYYYMMDD (미입력 시 "no-date")
 */
export function generateListedStockBesshiPdfFilename(
  item: {
    companyName?: string;
    listedStockCode?: string;
    name?: string;
  },
  valuationDate?: Date | string,
): string {
  const id =
    (item.companyName && item.companyName.trim()) ||
    item.listedStockCode ||
    (item.name && item.name.trim()) ||
    "상장주식";
  const iso =
    valuationDate instanceof Date
      ? valuationDate.toISOString().slice(0, 10)
      : (valuationDate as string | undefined);
  const ymd = iso ? iso.replace(/-/g, "") : "no-date";
  return `상장주식평가조서_${id}_${ymd}.pdf`;
}
