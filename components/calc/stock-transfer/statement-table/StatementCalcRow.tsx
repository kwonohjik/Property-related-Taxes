"use client";

/**
 * StatementCalcRow — 계산(읽기 전용) 행. 이미지 7의 회색 배경 행.
 *
 * 계획서: docs/00-pm/post-listing-statement-table-layout.plan.md §4.3 · §6
 *
 * 🔑 **값은 엔진 echo에서만 온다.** 이 컴포넌트는 더하지도 나누지도 않는다 —
 *    UI가 합계를 따로 계산하면 엔진과 이중 진실이 된다.
 *    [[feedback_ui_engine_dual_truth_avoidance]]
 */

import { AMOUNT_CELL_CLASS } from "./statement-table-types";
import type { StatementCalcRowSpec, StatementColumnSpec } from "./statement-table-types";

const TD = "border border-gray-300 px-2 py-1 align-middle";

export interface StatementCalcRowProps {
  row: StatementCalcRowSpec;
  cols: readonly StatementColumnSpec[];
  /** 셀렉터 축 prefix */
  testIdPrefix: string;
  /** 그룹 열 유무 — 그룹 밖 행은 라벨 셀이 2열을 덮는다 (`StatementRow`와 같은 규칙) */
  hasGroupColumn: boolean;
}

export function StatementCalcRow({
  row,
  cols,
  testIdPrefix,
  hasGroupColumn,
}: StatementCalcRowProps) {
  const labelColSpan = hasGroupColumn && !row.groupCell && !row.inGroup ? 2 : 1;
  const tone = row.emphasis ? "bg-gray-200/70 dark:bg-gray-700/70 font-bold" : "bg-gray-100/70 dark:bg-gray-800/70 font-semibold";
  return (
    <tr className={tone}>
      {row.groupCell && (
        <th
          scope="rowgroup"
          rowSpan={row.groupCell.rowSpan}
          className={`${TD} w-10 bg-gray-50 dark:bg-gray-800 text-center align-middle text-xs font-semibold text-gray-700 dark:text-gray-200`}
        >
          <span className="[writing-mode:vertical-rl] inline-block leading-tight">
            {row.groupCell.label}
          </span>
        </th>
      )}
      <th scope="row" colSpan={labelColSpan} className={`${TD} text-left text-xs text-gray-900 dark:text-gray-100`}>
        {row.num && <span className="font-mono tabular-nums mr-1">{row.num}</span>}
        {row.label}
        {row.description && (
          <span className="block text-caption font-normal text-gray-500 dark:text-gray-400">{row.description}</span>
        )}
      </th>
      {cols.map((c) => {
        const v = row.values[c.col];
        return (
          <td
            key={c.col}
            className={`${TD} ${AMOUNT_CELL_CLASS} text-xs`}
            data-testid={`${testIdPrefix}-calc-${c.col}`}
          >
            {v === undefined ? "" : v.toLocaleString()}
            {v !== undefined && row.unit ? <span className="ml-0.5">{row.unit}</span> : null}
          </td>
        );
      })}
    </tr>
  );
}
