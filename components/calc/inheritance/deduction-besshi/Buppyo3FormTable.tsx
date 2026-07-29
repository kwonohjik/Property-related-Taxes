"use client";

/**
 * Buppyo3FormTable — 별지 제9호서식 부표 3 「채무·공과금·장례비용 및 상속공제명세서」 화면 재현.
 * 출력 전용. `buildBuppyo3Data` 결과만 소비. 빈 행 padding + 금액 우측정렬(amount-column-align).
 */

import type { Buppyo3Data } from "@/lib/calc/deduction-besshi-data";
import { formatKRW } from "@/components/calc/inputs/CurrencyInput";
import { BP3, BP3_COLS, BP3_DEDUCTION_ROWS, PAPER_FOOTER, HANDWRITE_NOTE } from "./deduction-besshi-constants";

const HEAD = "border border-black p-1 bg-gray-100 text-micro font-medium text-center align-middle";
const VAL = "border border-black p-1 text-micro align-middle";
const AMT = "border border-black p-1 text-micro text-right font-mono tabular-nums whitespace-nowrap align-middle";

function pad(dataLen: number, fixed: number): number[] {
  return Array.from({ length: Math.max(0, fixed - dataLen) }, (_, i) => i);
}
/** colgroup — 값 셀이 비어도 폭 확보(table-fixed). 화면·PDF 동일 비율(BP3_COLS). */
function ColGroup({ widths }: { widths: readonly string[] }) {
  return (
    <colgroup>
      {widths.map((w, i) => (
        <col key={i} style={{ width: w }} />
      ))}
    </colgroup>
  );
}
function dval(v: number | null, force = false): string {
  if (v == null) return "—";
  if (v === 0 && !force) return "—";
  return formatKRW(v);
}

export function Buppyo3FormTable({ data }: { data: Buppyo3Data }) {
  return (
    <div className="bg-white p-3 text-black print:bg-white print:text-black" data-testid="bp3-root">
      <p className="text-micro text-gray-600">{BP3.subtitle}</p>
      <h3 className="my-1 text-center text-base font-bold">{BP3.title}</h3>

      {/* 가. 채무 */}
      <p className="mb-1 mt-2 text-caption font-bold">가. 채무</p>
      <table className="w-full table-fixed border-collapse">
        <ColGroup widths={BP3_COLS.debt} />
        <thead>
          <tr>
            <th className={HEAD}>① 채무종류</th>
            <th className={HEAD}>발생연월일</th>
            <th className={HEAD}>종료(예정)연월일</th>
            <th className={HEAD}>③ 성명(상호)</th>
            <th className={HEAD}>주민(사업자)번호</th>
            <th className={HEAD}>⑤ 주소(소재지)</th>
            <th className={HEAD}>⑥ 금액</th>
          </tr>
        </thead>
        <tbody>
          {data.debtRows.map((r, i) => (
            <tr key={`d-${i}`}>
              <td className={VAL} data-testid={`bp3-가-row-${i}-kind`}>{r.kindLabel}</td>
              <td className={VAL} data-testid={`bp3-가-row-${i}-incurred`}>{r.incurredDate ?? ""}</td>
              <td className={VAL}>&nbsp;</td>
              <td className={VAL}>&nbsp;</td>
              <td className={VAL}>&nbsp;</td>
              <td className={VAL} data-testid={`bp3-가-row-${i}-caddr`}>{r.creditorAddress ?? ""}</td>
              <td className={AMT} data-testid={`bp3-가-row-${i}-amount`}>{formatKRW(r.amount)}</td>
            </tr>
          ))}
          {pad(data.debtRows.length, BP3.rowsDebt).map((i) => (
            <tr key={`de-${i}`}>{Array.from({ length: 7 }).map((_, c) => <td key={c} className={c === 6 ? AMT : VAL}>&nbsp;</td>)}</tr>
          ))}
          <tr>
            <td className={HEAD} colSpan={6}>⑦ 계</td>
            <td className={AMT} data-testid="bp3-가-total">{formatKRW(data.debtTotal)}</td>
          </tr>
        </tbody>
      </table>

      {/* 나. 공과금 */}
      <p className="mb-1 mt-3 text-caption font-bold">나. 공과금</p>
      <table className="w-full table-fixed border-collapse">
        <ColGroup widths={BP3_COLS.utility} />
        <thead>
          <tr>
            <th className={HEAD}>⑧ 공과금종류코드</th>
            <th className={HEAD}>⑨ 연도별</th>
            <th className={HEAD}>⑩ 분기별</th>
            <th className={HEAD}>⑪ 금액</th>
          </tr>
        </thead>
        <tbody>
          {data.utilityRows.map((r, i) => (
            <tr key={`u-${i}`}>
              <td className={VAL} data-testid={`bp3-나-row-${i}-code`}>{r.detailName ?? ""}</td>
              <td className={VAL}>&nbsp;</td>
              <td className={VAL}>&nbsp;</td>
              <td className={AMT} data-testid={`bp3-나-row-${i}-amount`}>{formatKRW(r.amount)}</td>
            </tr>
          ))}
          {pad(data.utilityRows.length, BP3.rowsUtility).map((i) => (
            <tr key={`ue-${i}`}>{Array.from({ length: 4 }).map((_, c) => <td key={c} className={c === 3 ? AMT : VAL}>&nbsp;</td>)}</tr>
          ))}
          <tr>
            <td className={HEAD} colSpan={3}>⑫ 계</td>
            <td className={AMT} data-testid="bp3-나-total">{formatKRW(data.utilityTotal)}</td>
          </tr>
        </tbody>
      </table>

      {/* 다. 장례비용 */}
      <p className="mb-1 mt-3 text-caption font-bold">다. 장례비용</p>
      <table className="w-full table-fixed border-collapse">
        <ColGroup widths={BP3_COLS.funeral} />
        <thead>
          <tr>
            <th className={HEAD}>⑬ 주민(사업자)번호</th>
            <th className={HEAD}>⑭ 성명(상호)</th>
            <th className={HEAD}>⑮ 지급내역</th>
            <th className={HEAD}>⑯ 금액</th>
          </tr>
        </thead>
        <tbody>
          {data.funeralRows.map((r, i) => (
            <tr key={`f-${i}`}>
              <td className={VAL}>&nbsp;</td>
              <td className={VAL}>&nbsp;</td>
              <td className={VAL} data-testid={`bp3-다-row-${i}-detail`}>{r.detail}</td>
              <td className={AMT} data-testid={`bp3-다-row-${i}-amount`}>{formatKRW(r.amount)}</td>
            </tr>
          ))}
          {pad(data.funeralRows.length, BP3.rowsFuneral).map((i) => (
            <tr key={`fe-${i}`}>{Array.from({ length: 4 }).map((_, c) => <td key={c} className={c === 3 ? AMT : VAL}>&nbsp;</td>)}</tr>
          ))}
          <tr>
            <td className={HEAD} colSpan={3}>⑰ 계</td>
            <td className={AMT} data-testid="bp3-다-total">{formatKRW(data.funeralTotal)}</td>
          </tr>
        </tbody>
      </table>

      {/* 라. 상속공제 */}
      <p className="mb-1 mt-3 text-caption font-bold">라. 상속공제</p>
      <table className="w-full table-fixed border-collapse">
        <ColGroup widths={BP3_COLS.deduction} />
        <tbody>
          {BP3_DEDUCTION_ROWS.map((row) => {
            const v = data.deduction[row.key] as number | null;
            const txt = row.key === "total" ? formatKRW(data.deduction.total) : dval(v);
            const grp = "group" in row ? (row as { group?: string }).group : undefined;
            return (
              <tr key={row.key}>
                <td className={VAL}>
                  {grp ? <span className="mr-1 text-micro text-gray-500">[{grp}]</span> : null}
                  {row.no} {row.label}
                </td>
                <td className={AMT} data-testid={`bp3-${row.no}`}>{txt}</td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <p className="mt-2 text-micro text-gray-500">{HANDWRITE_NOTE}</p>
      <p className="mt-1 text-right text-micro text-gray-500">{PAPER_FOOTER}</p>
    </div>
  );
}
