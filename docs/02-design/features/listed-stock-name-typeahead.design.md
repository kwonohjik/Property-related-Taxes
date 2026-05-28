# 상속·증여 상장주식 종목명 typeahead — 엔진/UI 통합 디자인

> Plan: `docs/00-pm/listed-stock-name-autocomplete.plan.md` v3

- **작성일**: 2026-05-28
- **범위**: UI/클라이언트 only — 엔진(input/result) 변경 0건
- **세목**: 상속세·증여세 (상장주식 평가, 상증법 §63①1가목)

---

## 1. 케이스 인벤토리 (Definition of Done 입력)

| # | 케이스 | trigger | 결과 mirror | 비고 |
|---|---|---|---|---|
| C1 | 신규 입력 — 종목명 검색 → 매치 선택 | input "삼" → 300ms → dropdown → 클릭/Enter | `name` ← stockName, `listedStockCode` ← stockCode | 본 PR 주된 동선 |
| C2 | 기존 코드 보유 → 종목명만 변경(수동) | name input 타이핑 (매치 미선택) | `name`만 업데이트, `listedStockCode` 유지 | 자동 fallback 금지 정합 |
| C3 | typeahead 선택 → 종목코드 수동 수정 | code input 6자리 재입력 | `listedStockCode`만, `name` 유지 | reorder 정책 정합 |
| C4 | 종목코드 입력 → 자동조회 (reorder 동선) | 코드 6자리 → "키움 자동조회" 클릭 → response.stockName 반영 | `name` ← response stockName (덮어쓰기) | 본 PR 미관여 (reorder가 이미 처리) |
| C5 | C1 선택 후 C4 자동조회 (동일 종목) | typeahead 삼성전자 → 자동조회 | `name` 동값 덮어쓰기, 무해 | 검증만, 코드 변경 0 |
| C6 | 매치 0건 (검색 결과 없음 / 네트워크 실패) | input → fetch reject 또는 빈 응답 | dropdown 미표시, 수동 입력 유지 | silent fallback |
| C7 | KONEX 영문 종목코드(예: 0070X0) 매치 선택 | 매치 stockCode 영문 포함 | `listedStockCode` ← "0070X0" (uppercase 보존) | 기존 양도세 검증된 패턴 |
| C8 | dropdown 키보드 네비 + Enter | ↑/↓ → activeIdx 이동 → Enter | activeIdx 매치 선택 (C1) | `EnterKeyNavigationProvider` 옵트아웃 필수 |
| C9 | 거래정지 종목 표시 | match.tradingHalt=true | dropdown rose 배지 "거래정지", 선택 가능 | 정보 노출만, 차단 없음 |
| C10 | dropdown 외부 클릭 | mousedown outside container | dropdown 닫힘, value 유지 | |
| C11 | 빠른 연속 입력 | "삼" → 100ms → "삼성" → 100ms → ... | debounce 마지막 입력만 fetch | 300ms timer reset |
| C12 | 자본증가 신주(미상장) 토글 ON | isCapitalIncreaseUnlistedShare=true | sharesLabel만 변경, typeahead 동작 무변경 | 회귀 검증. 미상장이라 stock-master 매치는 통상 0건 — 사용자가 수동 입력으로 fallback(C2 경로) |
| C13 | Tab 키 | dropdown 열린 상태에서 Tab | dropdown 닫힘, selectMatch 미발화, 포커스 다음 필드 이동 | 양도세 ref는 Tab 미처리 → 본 PR도 동일(브라우저 기본 동작) |
| C14 | value 외부 변경 → fetch 재트리거 (C4 자동조회 응답 후 등) | reorder 자동조회 응답 stockName → value 변경 → useEffect 발화 | `q === lastFetchedQ` 가드로 중복 fetch skip | 회귀 anchor T-13에서 검증 |

---

## 2. 모듈/파일 구성

### 2-1. 신규 파일
- `components/calc/inheritance/listed-stock/InheritanceStockNameAutocomplete.tsx` (~180줄 예상, 양도세 ref 컴포넌트 173줄 기준 추정)
- a11y role 6종 + lastFetchedQ ref + AbortController 추가분 약 +15줄

### 2-2. 수정 파일
- `components/calc/inheritance/listed-stock/ListedStockSecurityInfoSection.tsx` — 종목명 FieldCard 내부 input 교체 (3~5줄)

### 2-3. 신규 테스트
- `__tests__/components/inheritance/InheritanceStockNameAutocomplete.test.tsx` (C1~C11 anchor)
- `e2e/inheritance-listed-stock-name-typeahead.spec.ts` (D-3 e2e)

### 2-4. 미수정 (회귀 보호 대상)
- `lib/kiwoom/stock-master.ts`, `app/api/kiwoom/search-by-name/route.ts`, `components/calc/stock-transfer/KiwoomStockNameAutocomplete.tsx`

---

## 3. 컴포넌트 명세

### 3-1. Props

```ts
interface Match {
  stockCode: string;        // 6자리, KONEX 영문 포함 (^[0-9A-Z]{6}$)
  stockName: string;
  marketName: string;       // "KOSPI" | "KOSDAQ" | "KONEX"
  tradingHalt: boolean;
  // API 응답에는 marketCode/marketTypeStore/adminIssue도 포함되나, 본 PR은 위 4필드만 사용
  // 향후 시장구분 자동 채움(EstateItem 스키마 확장) 시 marketTypeStore 추가 예정
}

interface InheritanceStockNameAutocompleteProps {
  value: string;
  onSelect: (match: Match) => void;
  onNameChange: (name: string) => void;
  placeholder?: string;
  className?: string;
  testId?: string;          // root <div>의 data-testid; input은 `${testId}-input`
}
```

### 3-2. State (로컬)
- `open: boolean` — dropdown 열림 여부
- `matches: Match[]` — 검색 결과 (Top 10)
- `loading: boolean` — fetch 진행 중
- `activeIdx: number` — 키보드 네비 활성 인덱스 (-1 = 미선택)
- `lastFetchedQ: string` (ref) — 중복 fetch skip 가드 (C14 대응). 사용자 input onChange 경로에서는 `lastFetchedQ` 무시하고 항상 fetch (typing 시 동일 query 재입력 시도 보장). 외부 setState로 value만 변경된 경우(onChange 미경유) `lastFetchedQ === q` 시 skip — 구현: onChange 핸들러에서 `lastFetchedQ.current = ""` 리셋
- `listboxId: string` — `useId()` 훅으로 생성. listbox·option ID 충돌 방지 (동일 화면 다중 자산 시 필수)

### 3-3. 동작 (state 전이)

| trigger | 효과 |
|---|---|
| `value` 변경 | 300ms debounce → `q.length >= 1` 시 fetch POST `/api/kiwoom/search-by-name` |
| fetch 성공 | `matches = data.matches`, `activeIdx = -1`, `open = true` |
| fetch 실패/`!ok` | `matches = []`, dropdown 미표시 (silent) |
| `<li onMouseDown>` | `preventDefault()` + `selectMatch(m)` → `onSelect(m)` + `setOpen(false)` + `setMatches([])` |
| `<input onChange>` | `onNameChange(e.target.value)` + `setOpen(true)` |
| `<input onFocus>` | `matches.length > 0 && setOpen(true)` |
| `<input onKeyDown>` | ArrowDown/Up → activeIdx 이동 / Enter (activeIdx>=0) → selectMatch / Esc → close / Tab → 브라우저 기본 동작(다음 필드), dropdown은 외부 클릭 핸들러로 자연 닫힘 |
| 외부 mousedown | containerRef 외부 시 `setOpen(false)` |
| value 변경 (외부 setState 포함) | `q === lastFetchedQ`면 fetch skip (C14 가드, reorder 자동조회 응답 후 무한 fetch 방지) |
| fetch timeout | AbortController + 5000ms — `aborted` 시 silent(매치 빈 배열) |

### 3-4. JSX 구조 (요약)

```tsx
<div ref={containerRef} className="relative" data-enter-nav="off" data-testid={testId}>
  <input
    type="text"
    role="combobox"
    aria-expanded={open}
    aria-autocomplete="list"
    aria-controls={listboxId}
    aria-activedescendant={activeIdx >= 0 ? `${listboxId}-opt-${activeIdx}` : undefined}
    value={value}
    onChange={(e) => { onNameChange(e.target.value); setOpen(true); }}
    onFocus={() => matches.length > 0 && setOpen(true)}
    onKeyDown={handleKeyDown}
    placeholder={placeholder}
    className={className}
    autoComplete="off"
    data-testid={testId ? `${testId}-input` : undefined}
  />
  {open && (loading || matches.length > 0) && (
    <ul
      id={listboxId}
      role="listbox"
      className="absolute z-50 mt-1 w-full max-h-72 overflow-y-auto rounded-md border border-sky-200 bg-white shadow-lg text-sm"
    >
      {loading && matches.length === 0 && (
        <li className="px-3 py-2 text-xs text-muted-foreground">🔄 검색 중...</li>
      )}
      {matches.map((m, i) => (
        <li
          key={m.stockCode}
          id={`${listboxId}-opt-${i}`}
          role="option"
          aria-selected={i === activeIdx}
          onMouseDown={(e) => { e.preventDefault(); selectMatch(m); }}
          onMouseEnter={() => setActiveIdx(i)}
          className={`px-3 py-2 cursor-pointer flex justify-between items-center ${i === activeIdx ? "bg-sky-100" : "hover:bg-sky-50"}`}
        >
          <span className="flex-1">
            <span className="font-semibold">{m.stockName}</span>
            <span className="ml-2 text-xs text-muted-foreground">{m.stockCode}</span>
          </span>
          <span className="text-xs text-sky-700 bg-sky-50 px-1.5 py-0.5 rounded">{m.marketName}</span>
          {m.tradingHalt && (
            <span className="ml-1 text-xs text-rose-700 bg-rose-50 px-1.5 py-0.5 rounded">거래정지</span>
          )}
        </li>
      ))}
    </ul>
  )}
</div>
```

---

## 4. 14 동기화 지점 매핑

| # | 지점 | 본 PR 영향 |
|---|---|---|
| ① | 폼 상태(FormData/AssetForm) | **무변경** — `EstateItem.name`, `EstateItem.listedStockCode` 기존 필드 그대로 |
| ② | initial value | 무변경 |
| ③ | normalize fallback | 무변경 |
| ④ | API 변환 | 무변경 — name·listedStockCode 기존 매핑 |
| ⑤ | UI 위젯 | **변경** — `ListedStockSecurityInfoSection` 종목명 FieldCard 내부 native input → `InheritanceStockNameAutocomplete` |
| ⑥ | 사이드바 합계 | 무변경 |
| ⑦ | 결과 카드 | 무변경 — 별지 부표3는 기존 필드 그대로 |
| ⑧ | Validation | 무변경 |
| ⑨ | Zod enum 메인 | 무영향 (엔진 input 무변경) |
| ⑩ | Zod enum 컴패니언 | 무영향 |
| ⑪ | acquisitionDate fallback | 무영향 (상속·증여 N/A) |
| ⑫ | Zod 입력 객체 정의 | 무영향 |
| ⑬ | callAPI body spread | 무영향 |
| ⑭ | Route handler 매핑 | 무영향 |

→ **순수 UI PR**. 엔진/API 회귀 anchor는 회귀 보증 목적만.

---

## 5. UI mirror 매핑 표

| trigger | `EstateItem.name` | `EstateItem.listedStockCode` |
|---|---|---|
| C1 매치 선택 | ← `match.stockName` | ← `match.stockCode` |
| C2 직접 텍스트 입력 | ← `e.target.value` | 유지 |
| C3 코드 input 수정 (reorder) | 유지 | ← 정규화된 코드 |
| C4 자동조회 응답 (reorder) | ← `response.stockName` | 유지 (요청한 코드 그대로) |
| C14 외부 value 변경 (C4 부산물 등) | 외부에서 결정 | 외부에서 결정 / typeahead는 fetch만 skip |

---

## 6. 정책·규약 정합

| 정책 | 적용 |
|---|---|
| `useEffect → store mirror` 금지 | ✅ debounce는 로컬 state, 매치 선택은 onSelect 직접 호출 |
| 자동 fallback 채움 금지 | ✅ 네트워크 실패 silent, 수동 입력 유지 |
| placeholder 숫자 예시 금지 | ✅ "예: 삼성전자" 텍스트만 |
| `EnterKeyNavigationProvider` 옵트아웃 | ✅ root `data-enter-nav="off"` |
| `SelectOnFocusProvider` 전역 | ✅ 별도 onFocus select 불필요 |
| 800줄 정책 | ✅ ~180줄 예상 |
| KONEX 영문 종목코드 | ✅ Match.stockCode 그대로 mirror |
| ToggleCard/RadioCardGroup | N/A (typeahead는 별도 UX) |
| testid 보존 | ✅ `ls-security-info-name` root에 propagate |

---

## 7. 테스트 매트릭스 (anchor)

| anchor | C# | 검증 |
|---|---|---|
| `T-01 match-select-mirror` | C1 | "삼" 입력 → 300ms → 매치 노출 → 첫 항목 mouseDown → onSelect 호출 + name·code 양쪽 mirror |
| `T-02 direct-input-name-only` | C2 | 매치 미선택 + 직접 입력 → onNameChange만 호출 |
| `T-03 code-manual-edit-keeps-name` | C3 | 매치 선택 후 코드 input 수정 → name 유지 |
| `T-04 typeahead-then-fetch-same` | C5 | typeahead 선택 후 자동조회 같은 종목 → 동값 무해 |
| `T-05 empty-result-silent` | C6 | fetch reject → matches=[], dropdown 미표시 |
| `T-06 konex-uppercase-preserved` | C7 | KONEX 영문 코드 매치 선택 시 그대로 mirror |
| `T-07 keyboard-arrow-enter` | C8 | ArrowDown → Enter → 첫 매치 selectMatch |
| `T-08 keyboard-escape` | C8 | Esc → setOpen(false) |
| `T-09 trading-halt-badge` | C9 | dropdown에 "거래정지" rose 배지 노출 |
| `T-10 outside-click-close` | C10 | 외부 mousedown → dropdown 닫힘 |
| `T-11 debounce-rapid-input` | C11 | 100ms 간격 연속 입력 → 마지막 입력만 fetch (1회) |
| `T-12 capital-increase-toggle-regression` | C12 | isCapitalIncreaseUnlistedShare=true → sharesLabel만 변경, typeahead 동작 무변경 |
| `T-13 value-external-update-no-refetch` | C14 | reorder 자동조회 응답 stockName으로 value 변경 → lastFetchedQ 가드로 fetch skip |
| `T-14 fetch-timeout-silent` | C6 변형 | AbortController 5s timeout → silent, 매치 빈 배열 |
| `T-15 a11y-roles` | C8 | combobox·listbox·option role + aria-expanded·aria-activedescendant 정합 |

---

## 8. 리스크 / 미결정 사항

| 항목 | 대응 |
|---|---|
| `value` 변경 시마다 fetch (외부 setState 시도 검색) | 호출부가 `value={item.name}` 직접 전달 — name 변경(C4 자동조회 응답)도 fetch 트리거. 대응: fetch 직전 `q === lastFetchedQ` skip 가드 (선택적 최적화, Phase B 범위 외) |
| dropdown z-index 50이 결과 카드와 충돌 | sky 배지·shadow-lg로 시각 분리. e2e D-3에서 확인 |
| 매치 선택 후 종목명 재편집 트리거 | C2 — name만 변경. `listedStockCode` 유지 (의도된 동작) |
| tradingHalt 매치 선택 시 자동 경고 | 본 PR 범위 외. dropdown 배지로 시각 인지만 보장. 후속 작업으로 상속·증여 자동조회 카드에서 거래정지 안내 강화 가능 (양도세 검증 UX 표준 패턴) |
| 호출부 testId 미전달 시 회귀 | B-2에서 `testId="ls-security-info-name"` 명시 전달 — 호출부 review 체크리스트 강제 |
