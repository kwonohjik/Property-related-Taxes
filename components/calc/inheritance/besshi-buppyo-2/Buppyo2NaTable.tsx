"use client";

/**
 * Buppyo2NaPage1 / Buppyo2NaTable — 부표 2 「상속인별 상속재산명세」 (10칼럼 ⑨~⑯).
 *
 * - Buppyo2NaPage1: 1쪽 나 — 데이터 page1Rows(≤5 전부 / ≥6 앞 4행) + (오버플로 시) "별지 계속" + 빈행 패딩 = 5행.
 * - Buppyo2NaTable: 2쪽 — 오버플로 명세(page2Rows) + 계 행(⑮ 전체 합계 itemRowsTotal).
 * 페이지 분할은 splitBuppyo2NaRows(constants) 단일 진실. 데이터 행은 NaDataRow 공통.
 *
 * A4 가로 양식 — colgroup mm 고정폭(총 277mm). 빈 행 패딩: page1=5행, page2=MIN_ROWS=8행.
 */

import type { Buppyo2ItemRow } from "@/lib/calc/besshi-buppyo-2-data";
import {
  BP2_NA_LABELS as N,
  BP2_PROPERTY_TYPE_LABEL,
  BP2_CONTINUATION_MARK,
  BP2_PAGE1_NA_ROWS,
} from "./besshi-buppyo-2-constants";

const MIN_ROWS = 8;
const NBSP = " ";
const OVERSEAS_CHK = "[ ]여 [ ]부";
const fmt = (n: number) => n.toLocaleString("ko-KR");

const HEAD =
  "border border-black p-1 bg-gray-100 dark:bg-gray-800 text-[9px] font-medium text-center align-middle";
const C = "border border-black p-1 text-[10px] text-center align-middle";
const L = "border border-black p-1 text-[10px] text-left align-middle";
const AMT =
  "border border-black p-1 text-[10px] text-right font-mono tabular-nums whitespace-nowrap align-middle";

function NaColgroup() {
  return (
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
  );
}

function NaHead() {
  return (
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
  );
}

/** 데이터 행 — 1쪽·2쪽 공통. baseId로 testid 네임스페이스 분리(페이지 간 중복 방지) */
function NaDataRow({
  r,
  baseId,
  i,
}: {
  r: Buppyo2ItemRow;
  baseId: string;
  i: number;
}) {
  return (
    <tr data-testid={`${baseId}-${i}`}>
      <td className={C} data-testid={`${baseId}-${i}-code1`}>
        {r.kindCode}
      </td>
      <td className={C}>
        {r.typeCode} {BP2_PROPERTY_TYPE_LABEL[r.typeCode] ?? ""}
      </td>
      <td className={C}>{OVERSEAS_CHK}</td>
      <td className={C}>{r.overseasCountry || NBSP}</td>
      <td className={L}>{r.locationOrName}</td>
      <td className={C}>{r.ownershipShareLabel || NBSP}</td>
      <td className={AMT}>
        {r.quantityOrArea != null ? fmt(r.quantityOrArea) : NBSP}
      </td>
      <td className={AMT}>{r.unitPrice != null ? fmt(r.unitPrice) : NBSP}</td>
      <td className={AMT} data-testid={`${baseId}-${i}-amount`}>
        {fmt(r.valuatedAmount)}
      </td>
      <td className={C} data-testid={`${baseId}-${i}-method`}>
        {r.valuationMethodCode}
      </td>
    </tr>
  );
}

/** 빈 행 — 국외자산여부 칸([ ]여 [ ]부)은 양식 인쇄 유지, 나머지 공란 */
function EmptyRow({ idx, i }: { idx: number; i: number }) {
  return (
    <tr data-testid={`buppyo2-na-row-${idx}-empty-${i}`}>
      {Array.from({ length: 10 }).map((__, c) => (
        <td key={c} className={C}>
          {c === 2 ? OVERSEAS_CHK : NBSP}
        </td>
      ))}
    </tr>
  );
}

/** 별지 계속 마커 행 (1쪽 5번째) — ⑪ 소재지 칸에 마커, 그 외 공란 */
function ContinuationRow({ idx }: { idx: number }) {
  return (
    <tr
      data-testid={`buppyo2-na-continuation-${idx}`}
      className="font-semibold"
    >
      {Array.from({ length: 10 }).map((__, c) => (
        <td key={c} className={c === 4 ? L : C}>
          {c === 4 ? BP2_CONTINUATION_MARK : c === 2 ? OVERSEAS_CHK : NBSP}
        </td>
      ))}
    </tr>
  );
}

/** 1쪽 나 — 데이터 + (오버플로 시) "별지 계속" + 빈행 패딩 = 항상 5행 */
export function Buppyo2NaPage1({
  rows,
  idx,
  needsContinuation,
}: {
  rows: Buppyo2ItemRow[];
  idx: number;
  needsContinuation: boolean;
}) {
  const pad = Math.max(
    0,
    BP2_PAGE1_NA_ROWS - rows.length - (needsContinuation ? 1 : 0),
  );
  return (
    <table
      data-testid={`buppyo2-na-page1-${idx}`}
      className="border-collapse"
      style={{ width: "277mm" }}
    >
      <NaColgroup />
      <NaHead />
      <tbody>
        {rows.map((r, i) => (
          <NaDataRow key={i} r={r} baseId={`buppyo2-na-p1-row-${idx}`} i={i} />
        ))}
        {needsContinuation && <ContinuationRow idx={idx} />}
        {Array.from({ length: pad }).map((_, i) => (
          <EmptyRow key={`empty-${i}`} idx={idx} i={i} />
        ))}
      </tbody>
    </table>
  );
}

/** 2쪽 「상속인별 상속재산명세」 — 오버플로 데이터 + 계 행(⑮ 전체 합계) */
export function Buppyo2NaTable({
  rows,
  idx,
  total,
}: {
  rows: Buppyo2ItemRow[];
  idx: number;
  total: number;
}) {
  const pad = Math.max(0, MIN_ROWS - rows.length);
  return (
    <table
      data-testid={`buppyo2-na-table-${idx}`}
      className="border-collapse"
      style={{ width: "277mm" }}
    >
      <NaColgroup />
      <NaHead />
      <tbody>
        {rows.map((r, i) => (
          <NaDataRow key={i} r={r} baseId={`buppyo2-na-row-${idx}`} i={i} />
        ))}
        {Array.from({ length: pad }).map((_, i) => (
          <EmptyRow key={`empty-${i}`} idx={idx} i={i} />
        ))}
        <tr data-testid={`buppyo2-na-total-row-${idx}`} className="font-semibold">
          <td className={C} colSpan={8}>
            계
          </td>
          <td className={AMT} data-testid={`buppyo2-na-total-${idx}`}>
            {fmt(total)}
          </td>
          <td className={C}>{NBSP}</td>
        </tr>
      </tbody>
    </table>
  );
}
