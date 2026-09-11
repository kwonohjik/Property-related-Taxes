"use client";

/**
 * StatementRow — 순손익·순자산 계산서의 «입력 행» 하나.
 *
 * 계획서: docs/00-pm/post-listing-statement-table-layout.plan.md §4.3
 *
 * 구조(이미지 7):  [rowSpan 그룹] | 번호 + 라벨 (+ 보조 줄) | 값 셀 × cols.length
 */

import { CurrencyInput } from "@/components/calc/inputs/CurrencyInput";
import { DecimalInput } from "@/components/calc/inputs/DecimalInput";
import { NAV_COL_ATTR, NAV_ROW_ATTR } from "./statement-enter-nav";
import type { StatementColumnSpec, StatementInputRow } from "./statement-table-types";

/** 다크 짝 — 배경·테두리·전경을 함께 준다(`StatementTable.tsx` TH 주석 참조) */
const TD = "border border-gray-300 dark:border-gray-600 px-2 py-1 align-middle";

/**
 * 🔑 **표 셀의 placeholder는 «빈 문자열»이다.**
 *
 * `CurrencyInput`·`DecimalInput`은 기본값으로 「금액 입력」·「숫자 입력」을 렌더한다
 * (`CurrencyInput.tsx:67` · `DecimalInput.tsx:42`). 카드 한 장에 필드 하나일 때는 안내가 되지만,
 * **24행 × 2열 = 48칸이 같은 문구를 반복하면 값이 든 칸을 눈으로 찾을 수 없다**(2026-09-11 실측).
 * 원본 서식(이미지 7)도 빈 칸은 비어 있다.
 *
 * 단위·의미는 이미 **열 헤더와 행 라벨**이 말하므로 셀 안에 다시 적을 것이 없다.
 * anchor: `statement-table-layout.anchor.test.tsx` ST-8
 */
const CELL_PLACEHOLDER = "";

/**
 * 값 후보 칩 — 이미 입력된 값과 다른 후보만 보여 준다.
 *
 * 원본 화면(이미지 7)은 행 20에 드롭다운(▼)을 두어 이미 아는 주식수를 고르게 했다.
 * 여기서는 «클릭으로 옮기기»를 칩으로 제공한다 — 입력칸은 그대로 자유 입력이다.
 */
function CandidateChips({
  items,
  onPick,
  testId,
}: {
  items: { label: string; value: string }[];
  onPick: (v: string) => void;
  testId: string;
}) {
  if (items.length === 0) return null;
  return (
    <div className="mt-1 flex flex-wrap gap-1" data-testid={testId}>
      {items.map((it) => (
        <button
          key={`${it.label}:${it.value}`}
          type="button"
          onClick={() => onPick(it.value)}
          className="rounded border border-green-300 bg-green-100 px-1.5 py-0.5 text-micro text-green-700 hover:bg-green-200"
          title={`${it.label} 값을 이 칸에 넣습니다`}
        >
          {it.label} {Number(it.value).toLocaleString()}
        </button>
      ))}
    </div>
  );
}

export interface StatementRowProps {
  row: StatementInputRow;
  cols: readonly StatementColumnSpec[];
  /** 열별 현재 값 */
  value: (col: StatementColumnSpec["col"]) => string;
  onChange: (col: StatementColumnSpec["col"], v: string) => void;
  /** Enter 세로 이동용 행 좌표 — 표 전체에서 단조 증가 */
  rowIndex: number;
  /** 셀렉터 축 prefix — `${testIdPrefix}-${keyPrefix}-${col}` (계획서 §4.5) */
  testIdPrefix: string;
  /**
   * 표에 좌측 그룹 열이 있는가.
   *
   * 🔑 **그룹 열이 있는 표에서 그룹 «밖» 행(행 1·소계·결과 행)은 라벨 셀이 2열을 덮어야 한다** —
   *    덮지 않으면 그 행만 셀이 하나 모자라 값 열이 통째로 한 칸씩 밀린다.
   */
  hasGroupColumn: boolean;
  /**
   * 값 후보 — 클릭하면 그 값이 입력된다 (계획서 §4.7 · Q-1).
   *
   * 🔴 **자동 채움 금지.** 비어 있다고 알아서 채우지 않는다. `useEffect → store` 미러링으로
   *    구현하면 무한 루프 위험이 있다. 여기서 하는 일은 «클릭 한 번으로 옮기기»뿐이다.
   *    [[feedback_useeffect_store_mirror_forbidden]] · [[mirror-pattern]]
   */
  candidates?: (col: StatementColumnSpec["col"]) => { label: string; value: string }[];
}

export function StatementRow({
  row,
  cols,
  value,
  onChange,
  rowIndex,
  testIdPrefix,
  hasGroupColumn,
  candidates,
}: StatementRowProps) {
  const labelColSpan = hasGroupColumn && !row.groupCell && !row.inGroup ? 2 : 1;
  return (
    <tr className={row.disabled ? "bg-gray-100/70 dark:bg-gray-800/70" : undefined}>
      {row.groupCell && (
        <th
          scope="rowgroup"
          rowSpan={row.groupCell.rowSpan}
          className={`${TD} w-10 bg-gray-50 dark:bg-gray-800 text-center align-middle text-xs font-semibold text-gray-700 dark:text-gray-200`}
        >
          {/* 세로쓰기 — 이미지 7의 좌측 병합 라벨 */}
          <span className="[writing-mode:vertical-rl] inline-block leading-tight">
            {row.groupCell.label}
          </span>
        </th>
      )}
      <th
        scope="row"
        colSpan={labelColSpan}
        className={`${TD} text-left text-xs font-normal ${row.disabled ? "text-gray-500 dark:text-gray-400" : "text-gray-900 dark:text-gray-100"}`}
      >
        {row.num && <span className="font-mono tabular-nums mr-1">{row.num}</span>}
        {row.label}
        {row.description && (
          <span className="block text-caption text-gray-500 dark:text-gray-400">{row.description}</span>
        )}
      </th>
      {cols.map((c) => (
        <td
          key={c.col}
          className={TD}
          {...{ [NAV_COL_ATTR]: c.col, [NAV_ROW_ATTR]: rowIndex }}
        >
          {row.disabled ? (
            // 입력 불가 행 — 값도 받지 않는다(서식 행 구성 보존 목적)
            <span className="block text-center text-caption text-gray-400 dark:text-gray-500">—</span>
          ) : row.decimal ? (
            <DecimalInput
              value={value(c.col)}
              onChange={(v) => onChange(c.col, v)}
              unit={row.unit}
              placeholder={CELL_PLACEHOLDER}
              data-testid={`${testIdPrefix}-${row.keyPrefix}-${c.col}`}
            />
          ) : (
            <>
              <CurrencyInput
                label={row.label}
                hideLabel
                hideUnit
                allowNegative={row.signed}
                value={value(c.col)}
                onChange={(v) => onChange(c.col, v)}
                placeholder={CELL_PLACEHOLDER}
                data-testid={`${testIdPrefix}-${row.keyPrefix}-${c.col}`}
              />
              {candidates && (
                <CandidateChips
                  items={candidates(c.col).filter((x) => x.value && x.value !== value(c.col))}
                  onPick={(v) => onChange(c.col, v)}
                  testId={`${testIdPrefix}-${row.keyPrefix}-${c.col}-cand`}
                />
              )}
            </>
          )}
        </td>
      ))}
    </tr>
  );
}
