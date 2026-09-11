/**
 * statement-enter-nav — Enter = «열 단위 세로 이동».
 *
 * 계획서: docs/00-pm/post-listing-statement-table-layout.plan.md §4.4
 *
 * 🔴 **행 기반 표에서 DOM 순서를 그대로 따라가면 안 된다.**
 * 표의 DOM은 「행1-좌, 행1-우, 행2-좌, …」 순이라 Enter가 **좌우 지그재그**로 튄다.
 * 사용자는 한 사업연도 결산서를 보며 **한 열을 세로로 완주**하므로 그 순서를 지켜야 한다.
 * (전환 전 `YearColumn`은 컬럼 `<div>` 안을 순회해 자연히 세로였다 — 그 동작을 보존한다.)
 *
 * 형제 경로가 같은 방식을 쓴다 — 상속·증여 v2 `FiscalYearAdjustmentTable.tsx`의
 * `data-fy-col`/`data-fy-row` + `handleFiscalEnter`.
 * [[feedback_sibling_path_already_implements_rule]]
 */

/** 입력 셀에 부여하는 좌표 속성명 — 셀렉터 축(`data-testid`)과 목적을 섞지 않는다(계획서 §4.5) */
export const NAV_COL_ATTR = "data-stmt-col";
export const NAV_ROW_ATTR = "data-stmt-row";

/**
 * 같은 열의 «다음 행» 입력으로 포커스를 옮긴다. 열의 마지막이면 아무 것도 하지 않는다.
 *
 * @param e 표 컨테이너의 keydown 이벤트 (컨테이너에 `data-enter-nav="off"` 필요 —
 *          전역 가로 Enter 네비게이션과 이중 처리되지 않게 한다)
 */
export function handleStatementEnter(e: React.KeyboardEvent<HTMLElement>): void {
  if (e.key !== "Enter") return;
  const target = e.target as HTMLElement;
  if (target.tagName !== "INPUT") return;

  const cell = target.closest<HTMLElement>(`[${NAV_COL_ATTR}]`);
  if (!cell) return;
  const col = cell.getAttribute(NAV_COL_ATTR);
  const row = Number(cell.getAttribute(NAV_ROW_ATTR));
  if (col === null || Number.isNaN(row)) return;

  e.preventDefault();

  // 같은 열의 셀을 행 번호 오름차순으로 모아 «현재 행보다 큰 첫 번째»로 간다.
  // 행 번호는 연속이 아니다 — 계산 행이 사이에 끼면 입력 셀 번호가 건너뛴다.
  const container = e.currentTarget;
  const sameCol = Array.from(
    container.querySelectorAll<HTMLElement>(`[${NAV_COL_ATTR}="${col}"]`),
  )
    .map((el) => ({ el, row: Number(el.getAttribute(NAV_ROW_ATTR)) }))
    .filter((x) => !Number.isNaN(x.row) && x.row > row)
    .sort((a, b) => a.row - b.row);

  for (const { el } of sameCol) {
    const input = el.querySelector<HTMLInputElement>("input:not([disabled])");
    if (input) {
      input.focus();
      return;
    }
  }
}
