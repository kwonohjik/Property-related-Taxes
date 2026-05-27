# UI 개선 작업 계획서 — 평가차액 행 단위 입력 모드 ON 시 기본 자산1행·부채1행 자동 열기

작성일: 2026-05-27
대상: `components/calc/inheritance/unlisted-stock-v2/ValuationDeltaTable.tsx` (비상장 V2 정식평가 — 별지 3쪽 평가차액 §55②·§17의2)

## 개요

"행 단위 입력 모드" 토글을 **켜는 순간** 자산 평가차액 1행 + 부채 평가차액 1행이 자동으로 열려 사용자가 바로 입력할 수 있게 한다. 현재는 토글 ON 후에도 행이 0개라 빈 안내 문구만 보이고, "+ 자산 행 추가"·"+ 부채 행 추가"를 눌러야 입력란이 생긴다.

엔진·폼 데이터 타입 변경 없음(기존 `evaluationDeltaRows` 활용). UI 핸들러 1곳 수정.

## 현황 분석

`ValuationDeltaTable.tsx`
- 상태(L59~63):
  ```ts
  const hasRows = evaluationDeltaRows.length > 0;
  const [inputModeUserPreference, setInputModeUserPreference] = useState<boolean>(hasRows);
  const inputMode = inputModeUserPreference || hasRows;
  ```
- 토글 핸들러(L101~107):
  ```ts
  function toggleInputMode(next: boolean) {
    setInputModeUserPreference(next);
    if (!next && hasRows) {
      onRowsChange([]); // OFF + 기존 행 → 클리어(총액 fallback 복귀)
    }
  }
  ```
- 빈 행 팩토리(L40~51): `makeNewRow(category: "asset" | "liability")` → `{ rowId, category, accountName: "", evaluationAmount: 0, bookAmount: 0 }`.
- 행 추가(L90~95): `addRow(category)` → `onRowsChange([...evaluationDeltaRows, makeNewRow(category)])`, 자산 max 50 / 부채 max 30.
- 행 0개 시 안내 문구(L153~157, L232~236): "+ 자산 행 추가 버튼으로 계정과목을 입력하세요".
- 부모(`UnlistedStockV2Card`)는 `evaluationDeltaRows: rows.length > 0 ? rows : undefined`로 저장(빈배열=undefined).
- 엔진 `resolveEvaluationDelta`: 행이 1개라도 있으면 `source: "rows"`(자산Σ − 부채Σ), 0개면 `source: "total"`(`assetValuationDelta` fallback).

## 변경 설계

### 수정: `toggleInputMode` — ON 전환 + 행 0개일 때 기본 행 생성
```ts
function toggleInputMode(next: boolean) {
  setInputModeUserPreference(next);
  if (next && evaluationDeltaRows.length === 0) {
    // ON 전환 시 자산·부채 빈 행 1개씩 자동 생성 → 바로 입력 가능
    onRowsChange([makeNewRow("asset"), makeNewRow("liability")]);
  } else if (!next && hasRows) {
    onRowsChange([]); // 기존 OFF 동작 유지
  }
}
```

- **onChange 핸들러(사용자 토글 이벤트) 내에서만** 행 생성 → `useEffect → store` 미러링 정책 위반 없음(메모리 `feedback_useeffect_store_mirror_forbidden`). useEffect 자동 생성 방식은 채택하지 않음.
- 조건 `next && length === 0`: 이미 행이 있는 재진입/재토글에는 빈 행을 덧붙이지 않음(중복 방지).
- **ToggleCard `variant="card"` 동작(코드 검증)**: children(자산/부채 행 영역)은 `checked === true`일 때만 펼쳐 렌더된다(`ToggleCard.tsx` L9·L141). `toggleInputMode(true)`가 `setInputModeUserPreference(true)`(→ `inputMode=true`)와 `onRowsChange([2행])`를 동시에 일으키므로, ON 클릭 한 번에 ① 카드 펼침 + ② 자산 1행·부채 1행 노출이 함께 성립. 별도 처리 불필요.

### 부수 효과 (의도된 동작 — 계획서 명시)
- 빈 행 2개가 생기면 `evaluationDeltaRows.length === 2` → `hasRows = true` → `inputMode` 영속. 재마운트해도 ON 유지(현재 로컬 `inputModeUserPreference`만으로는 재마운트 시 OFF로 돌아가던 것이 개선됨). 3-state(`undefined`/`[]`/`[...]`) 의미상 "빈 행 데이터 존재"로 일관(메모리 `feedback_three_state_optional_mode_toggle`).
- **엔진 source 전환**: 빈 행 생성 순간 `resolveEvaluationDelta`가 `source: "rows"`로 전환되어 평가차액 = (0−0)−(0−0) = **0**. 즉 그 전 총액 모드에서 `assetValuationDelta`에 값이 있었다면 ON 순간 0으로 바뀐다. 이는 **행 단위 모드로 전환한다는 사용자 의도**이며, 기존에도 "+ 행 추가"를 1개라도 누르면 동일하게 source가 rows로 바뀌던 동작이다. 빈 행 자동 생성이 이를 토글 ON 시점으로 앞당길 뿐 — numeric 영향은 모드 전환의 정상 귀결(메모리 `feedback_numeric_impact_verify_before_bug_claim`: 트리거 anchor로 실증).

### 변경하지 않는 것
- `makeNewRow`·`addRow`·`onRowsChange`·부모 콜백·엔진·타입: 그대로.
- 행 0개 안내 문구: 유지(사용자가 행을 모두 삭제한 경우에만 노출).
- OFF→총액 fallback 복귀 로직: 유지.

## 영향 파일
- `components/calc/inheritance/unlisted-stock-v2/ValuationDeltaTable.tsx` (`toggleInputMode` 한 곳)

## 검증 (Definition of Done)
- [ ] `npx tsc --noEmit` 0건 / `npm run lint`
- [ ] **신규 e2e** `e2e/valuation-delta-default-rows.spec.ts` (robust locator — 카운트 숫자 부분매칭 `자산 평가차액`·`부채 평가차액`, 계정과목 `placeholder="계정과목"` input 개수로 판정):
  - 평가차액 "행 단위 입력 모드" 토글 ON → 헤더 "자산 평가차액 (1/50)" + "부채 평가차액 (1/30)" 및 계정과목 input이 즉시 노출 (`placeholder="계정과목"` 자산영역 1개 + 부채 1개)
  - ON 직후 자산 합계·부채 합계·평가차액이 0으로 표시(빈 행, `evaluationAmount/bookAmount=0`)
  - ON → OFF 토글 시 행 사라지고 총액 모드 복귀(기존 동작 회귀) — children 접힘(ToggleCard checked=false)
  - 이미 행이 있는 상태로 재진입 시 빈 행이 추가로 끼지 않음(중복 방지)
- [ ] **엔진 anchor**(있으면 보강): 빈 행 2개일 때 `resolveEvaluationDelta` → `source: "rows"`, `evaluationDelta === 0`
- [ ] 기존 회귀: `e2e/inheritance-unlisted-*.spec.ts` + `__tests__/.../evaluation-delta*`·`besshi-page4-official-layout` + `npm test` 전체 통과 (평가차액 흡수·별지 4쪽 표시 무영향 확인)

## 미결/후속
- ON 시 기본 행 개수: 요청대로 자산 1 + 부채 1 고정. (자산만/개수 옵션화는 범위 밖)
- 사용자가 행을 모두 삭제(0개)한 뒤에는 자동 재생성하지 않음(의도적 빈 상태 존중). 필요 시 후속 논의.
