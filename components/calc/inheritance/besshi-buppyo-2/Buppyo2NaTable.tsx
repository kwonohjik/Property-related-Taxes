"use client";

/**
 * Buppyo2NaTable — 부표 2 「나. 상속인별 상속재산명세」 (10칼럼).
 * A4 가로 양식 — colgroup mm 고정폭(총 277mm)으로 표를 넓혀 부모 HorizontalScrollContainer가 가로 스크롤.
 * 빈 행 정책: 데이터행 8행 미만 시 빈 행 padding(원본 양식 데이터행 수). 8행 초과 허용(출력 전용).
 */

import type { Buppyo2ItemRow } from "@/lib/calc/besshi-buppyo-2-data";
import {
  BP2_NA_LABELS as N,
  BP2_PROPERTY_TYPE_LABEL,
} from "./besshi-buppyo-2-constants";

const MIN_ROWS = 8;
const NBSP = " ";
const fmt = (n: number) => n.toLocaleString("ko-KR");

const HEAD =
  "border border-black p-1 bg-gray-100 dark:bg-gray-800 text-[9px] font-medium text-center align-middle";
const C = "border border-black p-1 text-[10px] text-center align-middle";
const L = "border border-black p-1 text-[10px] text-left align-middle";
const AMT =
  "border border-black p-1 text-[10px] text-right font-mono tabular-nums whitespace-nowrap align-middle";

export function Buppyo2NaTable({
  rows,
  idx,
}: {
  rows: Buppyo2ItemRow[];
  idx: number;
}) {
  const pad = Math.max(0, MIN_ROWS - rows.length);
  return (
    <table
      data-testid={`buppyo2-na-table-${idx}`}
      className="border-collapse"
      style={{ width: "277mm" }}
    >
      <colgroup>
        <col style={{ width: "22mm" }} />
        <col style={{ width: "28mm" }} />
        <col style={{ width: "18mm" }} />
        <col style={{ width: "22mm" }} />
        <col />
        <col style={{ width: "34mm" }} />
        <col style={{ width: "22mm" }} />
        <col style={{ width: "26mm" }} />
        <col style={{ width: "30mm" }} />
        <col style={{ width: "20mm" }} />
      </colgroup>
      <thead>
        <tr>
          <th className={HEAD}>{N.kindCode}</th>
          <th className={HEAD}>{N.typeCode}</th>
          <th className={HEAD}>{N.overseas}</th>
          <th className={HEAD}>{N.country}</th>
          <th className={HEAD}>{N.location}</th>
          <th className={HEAD}>{N.bizNo}</th>
          <th className={HEAD}>{N.quantity}</th>
          <th className={HEAD}>{N.unitPrice}</th>
          <th className={HEAD}>{N.amount}</th>
          <th className={HEAD}>{N.methodCode}</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i} data-testid={`buppyo2-na-row-${idx}-${i}`}>
            <td className={C} data-testid={`buppyo2-na-row-${idx}-${i}-code1`}>
              {r.kindCode}
            </td>
            <td className={C}>
              {r.typeCode} {BP2_PROPERTY_TYPE_LABEL[r.typeCode] ?? ""}
            </td>
            <td className={C}>[ ]여 [ ]부</td>
            <td className={C}>{r.overseasCountry || NBSP}</td>
            <td className={L}>{r.locationOrName}</td>
            <td className={C}>{r.ownershipShareLabel || NBSP}</td>
            <td className={AMT}>
              {r.quantityOrArea != null ? fmt(r.quantityOrArea) : NBSP}
            </td>
            <td className={AMT}>
              {r.unitPrice != null ? fmt(r.unitPrice) : NBSP}
            </td>
            <td className={AMT} data-testid={`buppyo2-na-row-${idx}-${i}-amount`}>
              {fmt(r.valuatedAmount)}
            </td>
            <td className={C} data-testid={`buppyo2-na-row-${idx}-${i}-method`}>
              {r.valuationMethodCode}
            </td>
          </tr>
        ))}
        {Array.from({ length: pad }).map((_, i) => (
          <tr
            key={`empty-${i}`}
            data-testid={`buppyo2-na-row-${idx}-empty-${i}`}
          >
            {Array.from({ length: 10 }).map((__, c) => (
              <td key={c} className={C}>
                {NBSP}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
