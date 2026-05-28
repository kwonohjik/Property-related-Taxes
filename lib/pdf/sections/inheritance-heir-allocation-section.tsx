/**
 * react-pdf 섹션 — 상속인별 상속세부담액 집계 표 (이미지 8)
 *
 * UI Design: docs/02-design/features/heir-allocation-summary-table.ui.design.md
 * 화면 컴포넌트와 동일 `buildSummaryTable` 헬퍼 재사용 (단일 진실).
 */

import React from "react";
import { Text, View, StyleSheet } from "@react-pdf/renderer";
import type {
  Heir,
  InheritanceTaxResult,
} from "@/lib/tax-engine/types/inheritance-gift.types";
import {
  buildSummaryTable,
  fmt,
  labelOf,
} from "@/lib/calc/heir-allocation-summary";

const s = StyleSheet.create({
  section: { marginTop: 12, fontFamily: "Korean" as "Helvetica" },
  title: { fontSize: 11, fontWeight: 700, marginBottom: 6, color: "#5b21b6" },
  table: { borderTop: 0.5, borderColor: "#c4b5fd", marginTop: 4 },
  row: {
    flexDirection: "row",
    borderBottom: 0.5,
    borderColor: "#ddd6fe",
    minHeight: 14,
  },
  headerRow: { backgroundColor: "#ede9fe", fontWeight: 700 },
  headerGroupRow: { backgroundColor: "#f5f3ff", fontWeight: 700 },
  finalRow: { backgroundColor: "#ede9fe", fontWeight: 700 },
  cellLabel: {
    flexGrow: 0,
    flexShrink: 0,
    paddingLeft: 4,
    paddingRight: 4,
    paddingTop: 2,
    paddingBottom: 2,
    fontSize: 7,
    textAlign: "left",
  },
  cellNum: {
    flexGrow: 0,
    flexShrink: 0,
    paddingLeft: 4,
    paddingRight: 4,
    paddingTop: 2,
    paddingBottom: 2,
    fontSize: 7,
    textAlign: "right",
  },
  footer: { fontSize: 6.5, color: "#6b7280", marginTop: 4 },
});

interface Props {
  result: InheritanceTaxResult;
  heirs: Heir[];
}

const LABEL_WIDTH = "32%"; // 좌측 라벨열
const TOTAL_WIDTH = "11%"; // 합계
// 나머지 = 57%를 heirOrder 갯수로 분할

export function InheritanceHeirAllocationSection({ result, heirs }: Props) {
  if (!result.heirAllocationResult || heirs.length === 0) return null;
  const data = buildSummaryTable(result, heirs);
  const heirColWidth = `${57 / Math.max(data.heirOrder.length, 1)}%`;

  const formatRow = (value: number | null, rowId: string): string => {
    if (rowId === "row-s5-burdenRatio") {
      return value != null ? value.toFixed(4) : "—";
    }
    return fmt(value);
  };

  return (
    <View style={s.section}>
      <Text style={s.title}>상속인별 상속세부담액 집계</Text>

      {data.usedLegalShareFallback && (
        <Text style={{ fontSize: 7, color: "#7c3aed", marginBottom: 3 }}>
          ⓘ 협의분할 미입력 항목은 법정상속분(민법 §1009) 자동 안분 — 영리법인·수유자(자연인) 제외
        </Text>
      )}

      <View style={s.table}>
        {/* 헤더 */}
        <View style={[s.row, s.headerRow]}>
          <Text style={[s.cellLabel, { width: LABEL_WIDTH }]}>구분</Text>
          <Text style={[s.cellNum, { width: TOTAL_WIDTH }]}>합계</Text>
          {data.heirOrder.map((id) => (
            <Text
              key={id}
              style={[s.cellNum, { width: heirColWidth }]}
            >
              {labelOf(id, heirs)}
            </Text>
          ))}
        </View>

        {data.rows.map((row) => (
          <View
            key={row.rowId}
            style={[
              s.row,
              row.isHeaderGroup ? s.headerGroupRow : {},
              row.isBoldFinal ? s.finalRow : {},
            ]}
          >
            <Text style={[s.cellLabel, { width: LABEL_WIDTH }]}>
              {row.rowNo ? `${row.rowNo} ${row.label}` : row.label}
            </Text>
            <Text style={[s.cellNum, { width: TOTAL_WIDTH }]}>
              {formatRow(row.total, row.rowId)}
            </Text>
            {data.heirOrder.map((id) => (
              <Text
                key={id}
                style={[s.cellNum, { width: heirColWidth }]}
              >
                {formatRow(row.perHeir[id], row.rowId)}
              </Text>
            ))}
          </View>
        ))}
      </View>

      <Text style={s.footer}>
        산출 근거: 상증법 §3의2②·§27·§28·집행기준 19-17-1
      </Text>
    </View>
  );
}
