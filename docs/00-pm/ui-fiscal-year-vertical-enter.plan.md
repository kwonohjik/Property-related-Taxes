# UI 개선 작업 계획서 — 사업연도 표 Enter 세로(열 단위) 이동

작성일: 2026-05-27
대상: `components/calc/inheritance/unlisted-stock-v2/FiscalYearAdjustmentTable.tsx` (비상장 V2 정식평가 — 별지 6쪽 ①~㉒)

## 개요

현재 전역 `EnterKeyNavigationProvider`는 DOM 순서(row-major)대로 Enter 이동 → 사업연도 표에서 **가로**(같은 항목의 1년전→2년전→3년전)로 흐른다. 사용자는 **한 사업연도(열) 단위로 세로 입력**을 원한다.

요청 동작 (인터뷰 확정):
1. 같은 사업연도 열에서 Enter → 아래 항목으로(①→②→③→…→㉒).
2. 한 열의 맨 아래 ㉒(그 밖의 차감액)에서 Enter → **다음 사업연도 열의 ① 각 사업연도 소득금액**으로.
3. 마지막 열(3년전 ×1)의 ㉒에서 Enter → **표 밖 다음 입력란**으로 복귀(전역 흐름 합류).
4. **하단 ①~㉒ 22항목만** 세로. 상단 연도 라벨·개시일·종료일은 현행 전역 가로 이동 유지.

엔진·폼 데이터 변경 없음(UI 핸들러 + DOM data 속성만).

---

## 현황 분석

- 하단 입력 표: `ROWS(22개, ①~㉒)`.map(행) × `fiscalYears(3열)`.map → **row-major DOM**. (`FiscalYearAdjustmentTable.tsx` L199~230, 2026-05-27 grid 전환 후)
  - 컨테이너: `<div className="overflow-x-auto text-[11px]"><div role="table">…<div role="row" className="grid grid-cols-[13rem_repeat(3,minmax(0,1fr))]">`
  - 각 데이터 행 = 라벨 셀 + `fiscalYears.map((fy,idx)=> <div><CurrencyInput …/></div>)` 3개.
- 전역 `EnterKeyNavigationProvider`(`components/providers/EnterKeyNavigationProvider.tsx`): bubble phase, DOM 순서 다음 input으로 focus, `[data-enter-nav="off"]` 하위는 제외.
- 기존 패턴 참고: `PostListingNetIncomeStatement.tsx` 등은 **한 컬럼=한 컴포넌트**라 `querySelectorAll("input")` 순서가 곧 세로 → 단순. 본 표는 **3열이 한 표에 혼재**(row-major)라 위치(col/row) 계산이 추가로 필요.

---

## 구현 설계

### 1. 전역 Provider — 다음 입력 탐색 헬퍼 분리·export
`EnterKeyNavigationProvider.tsx`에서 "다음 포커스 대상 찾기"를 순수 헬퍼로 분리해 재사용 가능하게 한다.

- `export function getNextFocusableInput(fromEl: HTMLElement): HTMLInputElement | null`
  - eligible input(현 `isEligible` 기준: text 계열, disabled/readonly/hidden/tabindex=-1 제외, `[data-enter-nav="off"]` 하위 제외) 수집.
  - **`compareDocumentPosition`으로 `fromEl`보다 DOM상 뒤에 있는 첫 eligible** 반환. → `fromEl`이 옵트아웃 영역 안(표 내부)이라 후보에 없어도 위치 비교만 하므로 동작.
  - 스코프(form/dialog/`[data-enter-nav-scope]`) 한정 로직은 헬퍼 내부에 유지(현 동작과 동일 결과).
  - **회귀 보존 원칙**: 기존 전역 핸들러를 이 헬퍼로 교체하되, `fromEl`이 후보에 있는 일반 케이스에서 `compareDocumentPosition` 결과 = 기존 `candidates[indexOf+1]`와 **동일**(둘 다 "DOM상 fromEl 다음 첫 eligible"). `e2e/enter-key-navigation.spec.ts`로 회귀 확인. 동일 보장이 불확실하면 기존 핸들러 로직은 그대로 두고 헬퍼만 신규 추가(중복 허용, 안전 우선).

### 2. FiscalYearAdjustmentTable — 자체 세로 Enter 핸들러
- 하단 입력 컨테이너(`<div role="table">`)에 **`data-enter-nav="off"`**(전역 가로 비활성) + **`onKeyDown={handleFiscalEnter}`** 부여. (상단 헤더 div는 옵트아웃하지 않음 → 전역 가로 유지)
- 각 입력 셀 div에 위치 식별 속성: `data-fy-col={idx}`(0~2), `data-fy-row={rowIdx}`(0~21). (rowIdx = `ROWS.map`의 index)
- `handleFiscalEnter(e)`:
  ```
  if (e.key !== "Enter" || e.shiftKey) return;
  if (e.nativeEvent.isComposing || e.keyCode === 229) return; // IME 가드
  const cell = (e.target as HTMLElement).closest("[data-fy-col]");
  if (!cell) return;
  const col = Number(cell.dataset.fyCol), row = Number(cell.dataset.fyRow);
  e.preventDefault();
  let nc = col, nr = row + 1;
  if (nr > LAST_ROW) { nc = col + 1; nr = 0; }       // 열 끝 → 다음 사업연도 ①
  if (nc > LAST_COL) {                                // 마지막 열 끝 → 표 밖
    const next = getNextFocusableInput(e.target as HTMLElement);
    next?.focus();
    return;
  }
  const target = container.querySelector(`[data-fy-col="${nc}"][data-fy-row="${nr}"] input`);
  (target as HTMLInputElement | null)?.focus();
  ```
  - `LAST_ROW = ROWS.length - 1` (21), `LAST_COL = fiscalYears.length - 1` (2) — 하드코딩 금지, 배열 길이에서 도출.
  - focus 후 전체 선택은 전역 `SelectOnFocusProvider`(RAF)가 처리.
- bubble phase(React onKeyDown)라 IME/조합은 `nativeEvent.isComposing` 확인.

### 3. 상단 헤더
- 변경 없음. 옵트아웃하지 않으므로 연도/개시일/종료일은 기존 전역 가로 이동 유지.

---

## 영향 파일

- `components/providers/EnterKeyNavigationProvider.tsx` — `getNextFocusableInput` 분리·export (동작 동일 리팩터)
- `components/calc/inheritance/unlisted-stock-v2/FiscalYearAdjustmentTable.tsx` — 컨테이너 `data-enter-nav="off"` + `onKeyDown`, 입력 셀 `data-fy-col/row`, 세로 핸들러

## 검증 (Definition of Done)

- [ ] `npx tsc --noEmit` 0건 / `npm run lint`
- [ ] **신규 e2e** `e2e/fiscal-year-vertical-enter.spec.ts`:
  - ① 1년전 입력 → Enter → ② 1년전 input focus (세로)
  - ㉒ 1년전 → Enter → ① 2년전 input focus (열 넘김)
  - ㉒ 3년전 → Enter → 표 밖 첫 입력(예: 순자산가액 섹션 등 다음 eligible) focus
  - 상단 연도 라벨에서 Enter → **전역 DOM 순서대로 동작**(같은 열 개시일 input 등으로 이동) + 표 하단 22항목 세로 핸들러의 영향을 받지 않음 (상단은 옵트아웃 미적용). ※ 상단은 "다음 열 가로"가 아니라 DOM상 같은 열 아래(연도→개시일) 흐름임 — 동작 단정 대신 "표 세로 핸들러 비간섭 + 전역 유지"만 검증
- [ ] 전역 Enter 회귀: `e2e/enter-key-navigation.spec.ts`(법인명→사업자번호→대표자 가로) 통과 — `getNextFocusableInput` 리팩터가 기존 전역 이동을 깨지 않는지
- [ ] 기존 회귀: `e2e/inheritance-unlisted-*.spec.ts`(6개) + `npm test` 전체 — section56-5는 `fill`만 쓰고 Enter 미사용이라 무관하나 재실행 확인
- [ ] 브라우저 boundingBox/focus 검증은 위 e2e로 충족(메모리 규칙: claude-in-chrome·수동 금지)

## 미결/후속

- `getNextFocusableInput` 스코프(form/dialog 한정) 적용 여부 — 표 밖 복귀 시 같은 카드 내로 한정할지(현재 마법사는 `<form>` 미사용이라 document 전체). Do 단계에서 표 다음 input이 자연스러운지 확인 후 결정.
- 향후 다른 다열 표(증여세 동일 폼 등)에도 같은 세로 패턴이 필요하면 `data-fy-col/row` + 핸들러를 공용 훅(`useGridVerticalEnter`)으로 추출 검토.
