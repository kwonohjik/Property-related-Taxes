"use client";

/**
 * StatementTable — 순손익·순자산 계산서 «행 기반 표» 골격.
 *
 * 계획서: docs/00-pm/post-listing-statement-table-layout.plan.md §4.3
 *
 * 이미지 7(원본 PDF 화면)의 양식:
 *   ┌──────────┬─────────────────┬─────────────────┐
 *   │  구 분   │ 상장일 직전 …   │ 취득일 직전 …   │   ← 열 수는 1 또는 2 (§4.2.2)
 *   │          │      2008       │      2003       │
 *   ├──┬───────┼─────────────────┼─────────────────┤
 *   │소│ 2. …  │      [입력]     │      [입력]     │   ← 좌측 rowSpan 그룹 라벨
 *   │득│ 3. …  │      [입력]     │      [입력]     │
 *   ├──┴───────┼─────────────────┼─────────────────┤
 *   │(A) 합계  │      12,345     │      67,890     │   ← 계산 행(회색)
 *
 * 🔑 **`gray/neutral` 계열을 쓴다** — `components/calc/CLAUDE.md` 톤 규약의 명시 예외
 *    (「공식 서식 replica 표는 gray/neutral/zinc 유지 — 원본 재현, 변경 금지」).
 */

import type { ReactNode } from "react";
import { HorizontalScrollContainer } from "@/components/calc/shared/HorizontalScrollContainer";
import { handleStatementEnter } from "./statement-enter-nav";
import type { StatementColumnSpec } from "./statement-table-types";

/**
 * 🔑 **다크 짝을 반드시 함께 준다.** 배경만 바꾸고 하드코딩 전경색을 두면 다크에서 글자가
 *    배경에 묻힌다([[feedback_codemod_flips_one_property_of_a_pair]]). 흰 배경 토큰에 짝이
 *    없으면 `__tests__/components/dark-mode-bg-policy.test.ts` 래칫 게이트가 막는다.
 *    형제 경로 `components/calc/results/shared/BesshiRow.tsx`가 같은 쌍을 쓴다.
 *
 * ⚠️ 그 게이트는 **주석 안의 클래스 문자열도 잡는다** — 설명에 그 토큰을 그대로 적지 말 것.
 */
const TH =
  "border border-gray-300 dark:border-gray-600 px-2 py-1 text-center text-xs font-semibold text-gray-800 dark:text-gray-100";

export interface StatementTableProps {
  cols: readonly StatementColumnSpec[];
  /** 좌측 `rowSpan` 그룹 열이 있는가 — 있으면 「구 분」 헤더가 2열을 덮는다 */
  hasGroupColumn: boolean;
  /** `<tbody>` 내용 — StatementRow / StatementCalcRow */
  children: ReactNode;
  /** 표 캡션(스크린리더용 · 시각적으로는 상단 제목이 따로 있다) */
  caption: string;
  /** 사업연도 입력의 셀렉터 prefix */
  testIdPrefix: string;
}

export function StatementTable({
  cols,
  hasGroupColumn,
  children,
  caption,
  testIdPrefix,
}: StatementTableProps) {
  return (
    <HorizontalScrollContainer fadeColor="#fafafa" contentPadding="p-0">
      {/* data-enter-nav="off" — 전역 가로 Enter 네비게이션을 끄고 열 단위 세로 이동을 전담한다 */}
      <div data-enter-nav="off" onKeyDown={handleStatementEnter}>
        {/*
          🔑 **`<caption>`이 아니라 `aria-label`이다.** caption은 DOM에 «텍스트»로 남아,
          카드 제목과 같은 문구면 `getByText(/순손익 계산서/)`가 2건을 잡아 기존 테스트가
          strict-mode 위반으로 깨진다(2026-09-11 실측 3건). aria-label은 접근성 이름만 준다.
        */}
        <table
          aria-label={caption}
          className="w-full min-w-[40rem] border-collapse border border-gray-300 bg-white dark:border-gray-600 dark:bg-gray-900"
        >
          <colgroup>
            {hasGroupColumn && <col className="w-10" />}
            <col className="w-[18rem]" />
            {cols.map((c) => (
              <col key={c.col} />
            ))}
          </colgroup>
          <thead>
            <tr className="bg-gray-100 dark:bg-gray-800">
              <th scope="col" colSpan={hasGroupColumn ? 2 : 1} className={TH}>
                구 분
              </th>
              {cols.map((c) => (
                <th key={c.col} scope="col" className={TH}>
                  <span className="block">{c.label}</span>
                  {c.onFiscalYearChange ? (
                    <input
                      type="text"
                      inputMode="numeric"
                      maxLength={4}
                      value={c.fiscalYear ?? ""}
                      onChange={(e) => c.onFiscalYearChange?.(e.target.value.replace(/\D/g, ""))}
                      aria-label={`${c.label} 사업연도`}
                      data-testid={`${testIdPrefix}-fy-${c.col}`}
                      className="mt-0.5 w-20 rounded border border-gray-300 bg-white px-1 py-0.5 text-center font-mono text-xs tabular-nums dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
                    />
                  ) : (
                    c.fiscalYear && (
                      <span className="mt-0.5 block font-mono text-xs tabular-nums">
                        {c.fiscalYear}
                      </span>
                    )
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>{children}</tbody>
        </table>
      </div>
    </HorizontalScrollContainer>
  );
}
