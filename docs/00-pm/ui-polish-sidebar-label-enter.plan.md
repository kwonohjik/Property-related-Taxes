# UI 개선 작업 계획서 — 사이드바 축소 · 중복 라벨 제거 · Enter 네비게이션

작성일: 2026-05-27
대상: 세금 계산 마법사 UI (상속세 폼 기준 + 공용 입력 인프라)

## 개요

사용자 요청 3건의 UI 개선 작업. 인터뷰로 다음 2가지 결정 확정:

- **작업 1**: 합계 미리보기 사이드바 폭 `300px → 180px` (40% 축소). 페이지 max-w·내부 폰트는 변경하지 않음.
- **작업 3**: Enter → 다음 입력란 이동은 **텍스트·숫자 입력 계열만** 대상. Select·라디오·체크박스·textarea는 제외.

세 작업은 서로 독립적이므로 병렬 적용 가능. 한 PR로 묶되 커밋은 작업별 분리 권장.

> **검토 이력** (작성 후 코드 검증 2회):
> - **1차** — CurrencyInput 실제 구조 확인: `label`은 `id`/`htmlFor` 미연결 시각 전용 라벨 → 숨겨도 안전, aria-label로 접근성 보존 가능. `app/layout.tsx`는 `SelectOnFocusProvider`만 래핑(`AuthMigrationListener`는 형제) → 신규 Provider는 그 안쪽에 중첩. 작업1 사이드바 숫자는 `formatKRW`(toLocaleString) 9~12자리 → `Row` 가로배치 줄바꿈 실측 항목 추가.
> - **2차** — ① 다열 구조: `FiscalYearAdjustmentTable`는 **연도 3개 열**(L214–227) 각각 `label={row.label}` → 좌측 1 + 입력 위 3 = 화면상 **4회 반복**(2회 아님). ② 마법사에 `<form>`/`type="submit"` 없음(버튼 onClick) → Enter 자동제출 위험 낮음. ③ `KiwoomStockNameAutocomplete` 등 **stock-transfer 6개 파일이 자체 `onKeyDown`으로 Enter 사용** → 전역 핸들러와 충돌, 옵트아웃 필수(작업3에 반영).

---

## 작업 1 — 합계 미리보기 사이드바 폭 축소 (300px → 180px)

### 현황
- `components/calc/InheritanceTaxForm.tsx:410`
  ```tsx
  <div className="grid grid-cols-1 lg:grid-cols-[300px_1fr] gap-6 items-start print:block">
  ```
- 데스크톱(`lg≥1024px`)에서 사이드바 고정 300px + 우측 입력 `1fr`. 모바일은 단일 열 스택.

### 변경
- L410의 `lg:grid-cols-[300px_1fr]` → `lg:grid-cols-[180px_1fr]` 단일 토큰 수정.
- 우측 입력 영역(`1fr`)은 자동으로 120px만큼 넓어짐. 별도 수정 불필요.
- `gap-6`·`print:block`·사이드바 `sticky/top-36`·`max-h` 등은 유지.

### 검토 포인트
- `InheritanceSidebar.tsx:51` 카드 내부 패딩 `p-4` + 숫자(`658,000,000`)가 180px에서 줄바꿈/오버플로 없는지 확인. `formatKRW`(`toLocaleString`)는 9~12자리 콤마 포함 약 11~15자 → 180px(p-4 제외 ≈148px)에서 위험 구간. 특히 `Row`가 라벨+값을 `flex justify-between` 한 줄에 두면 좁아져 **줄바꿈/말줄임 발생 가능** → `Row` 컴포넌트(L58 이하) 레이아웃을 실측 확인하고, 넘칠 경우 값만 `text-[13px]`/`tabular-nums`/우측정렬 또는 라벨-값 세로 스택으로 미세 조정(이번 범위 내 허용). `+ 추정상속재산 §15`·`§3의2②` 같은 `sub` 보조 문구는 180px에서 2줄 wrap 정상.
- 다른 세목 폼(양도세 `WizardSidebar` 256px 등)은 **이번 범위 제외** — 사용자 요청이 상속세 화면 기준. 일관성 요구 시 후속 처리.

### 영향 파일
- `components/calc/InheritanceTaxForm.tsx` (1줄)

---

## 작업 2 — 입력란 상단 중복 라벨 제거

### 현황 (중복 원인)
- 비상장주식 정식평가(V2) 폼의 테이블/FieldCard는 **좌측에 이미 라벨**을 두는데, 그 안의 `CurrencyInput`이 **입력란 위에 라벨을 또 렌더링**해 중복 발생.
- 근본 위치: `components/calc/inputs/CurrencyInput.tsx:88-92`
  ```tsx
  {label && (
    <label className="block text-sm font-medium">
      {label} {required && <span className="text-destructive">*</span>}
    </label>
  )}
  ```
- 중복 노출 호출처:
  | 파일 | CurrencyInput `label` 라인 | 좌측 라벨 출처 | 중복 노출 |
  |---|---|---|---|
  | `unlisted-stock-v2/FiscalYearAdjustmentTable.tsx` | L217 (`fiscalYears.map` **연도 3열 각각**) | 행 좌측 `<td>` `row.label` (L209) | **좌측 1 + 입력 위 3 = 화면상 4회** |
  | `unlisted-stock-v2/NetAssetCalculationTable.tsx` | **L185**(자산행) · **L216**(부채행) · **L249·262·275**(보험 준비금 3종) | 각 행 좌측 `<div>` `row.label`/고정 라벨 | 각 좌측 1 + 입력 위 1 = 2회 (총 **5개소**) |
  | `unlisted-stock-v2/CapitalChangeTable.tsx` | **L151**(주식수) · **L168**(1주당 금액) | `<FieldCard label="증가·감소 주식수">` (L145) · `<FieldCard label="1주당 …금액">` (L161) | FieldCard 1 + 입력 위 1 = 2회 (2개소) |

  > **정정(3차 검증)**:
  > - `FiscalYearAdjustmentTable`은 `fiscalYears.map`(L214)으로 **연도 3개 열**을 렌더하며 각 열 CurrencyInput(L217)에 동일 `row.label`을 넘긴다. 이미지 4의 "각 사업연도 소득금액"이 1·2·3년차 칸 위마다 반복되는 증상의 직접 원인 → `hideLabel`을 **3개 열 전부** 적용, 좌측 `<td>` 라벨(L209)만 유지.
  > - `NetAssetCalculationTable`의 중복은 **5개소**(자산행 L185, 부채행 L216, 보험 책임/비상위험/해약환급 준비금 L249·262·275). 보험 3종은 `ToggleCard`(L231) ON 시에만 노출되나 동일하게 좌측 라벨이 있어 중복 → 5곳 모두 `hideLabel`.
  > - `CapitalChangeTable`의 "변동일"(L131)은 `FieldCard` 내부가 **`DateInput`**(L135)으로 자체 라벨을 그리지 않으므로 **중복 아님 → 대상 제외**. 실제 CurrencyInput 중복은 L151·L168 2곳만.

### 변경 방식 — `CurrencyInput`에 `hideLabel` prop 추가
호출처에서 `label=""` 빈문자 전달은 의도가 불명확하고 접근성(aria) 정보까지 사라지므로, **명시적 `hideLabel` prop**을 추가한다. (검증: `CurrencyInput`의 `label`은 `id`/`htmlFor` 미연결 시각 전용 `<label>`이라 제거해도 폼 동작 영향 없음 — `CurrencyInput.tsx:89-93`.)

1. `CurrencyInput.tsx`
   - `CurrencyInputProps`에 `hideLabel?: boolean` 추가 + 구조분해 기본값 `hideLabel = false`.
   - 시각 라벨 조건을 L89 `{label && (...)}` → `{label && !hideLabel && (...)}`로 변경.
   - 접근성 보존: 라벨을 숨길 때 `<input>`에 `aria-label={label}` 부여(스크린리더 유지). 현재 input에 aria-label 없음(L95-109) → 추가.
2. 호출처 3파일에서 중복 케이스에 `hideLabel` 전달(`label`은 그대로 두고 `hideLabel`만 추가 → aria-label로 의미 보존, 시각 중복만 제거):
   - `FiscalYearAdjustmentTable.tsx` L217 — **연도 3개 열 모두**
   - `NetAssetCalculationTable.tsx` L185·216·249·262·275 — **5개소**
   - `CapitalChangeTable.tsx` L151·168 — **2개소** (변동일 L131은 DateInput이므로 제외)

### 검토 포인트
- `CurrencyInput`을 **FieldCard 없이 단독**으로 쓰는 다른 화면(상속재산 추가 카드 등)은 `hideLabel` 미전달 → 기존처럼 라벨 노출, 회귀 없음. (전역으로 라벨을 끄지 않는 이유)
- **`DecimalInput`은 대상 아님(확정)**: grep 결과 DecimalInput은 내부 시각 라벨을 렌더하지 않으며 V2 정식평가 폼에서 사용 0건. CurrencyInput만 수정.
- `required` 별표(`*`)는 좌측 라벨/FieldCard 쪽에 남으므로 입력 위 별표 사라져도 무방.
- **회귀 anchor (중요)**: 이 폼은 `besshi-*.test.tsx` 단위 anchor + **`e2e/inheritance-unlisted-*.spec.ts` 6개**(fiscal-year-annualize/autofill, capital-change-relocation/date-empty, capital-increase-section56-5, v2-convenience-fields)가 이미 존재. 이 중 입력을 **라벨 텍스트로 쿼리(`getByLabel`/label 기준 locator)**하는 케이스가 있으면 라벨 제거 시 깨진다. → Do 진입 전 6개 spec의 입력 선택 방식을 grep(`getByLabel`/`getByRole.*name`)으로 확인하고, 라벨 의존 쿼리는 `data-testid`/`aria-label` 기준으로 선회하거나 spec 보정.

### 영향 파일
- `components/calc/inputs/CurrencyInput.tsx` (prop + 조건)
- `components/calc/inheritance/unlisted-stock-v2/FiscalYearAdjustmentTable.tsx`
- `components/calc/inheritance/unlisted-stock-v2/NetAssetCalculationTable.tsx`
- `components/calc/inheritance/unlisted-stock-v2/CapitalChangeTable.tsx`
- (조건부) `components/calc/inputs/DecimalInput.tsx`

---

## 작업 3 — Enter 키 → 다음 입력란 포커스 이동 (전역)

### 설계 — `EnterKeyNavigationProvider` 신규 (SelectOnFocusProvider 패턴 차용)
기존 `components/providers/SelectOnFocusProvider.tsx`가 `document` capture-phase 리스너로 전역 적용하는 검증된 패턴이 있으므로 동일 구조로 신규 Provider 작성.

- 신규 `components/providers/EnterKeyNavigationProvider.tsx`
  - **bubble phase**로 등록: `document.addEventListener("keydown", handler)` (capture 아님). 이유: capture로 등록하면 컴포넌트 자체 onKeyDown보다 **먼저** 실행돼 autocomplete 항목 선택 등을 가로챈다. bubble로 두면 자체 핸들러가 먼저 처리할 기회를 가짐(아래 옵트아웃과 병행).
  - 처리 조건(모두 충족 시에만 동작):
    1. `e.key === "Enter"` 그리고 `e.shiftKey === false`(Shift+Enter 제외).
    2. **IME 조합 가드**: `e.isComposing === true || e.keyCode === 229`이면 무시 (한글 조합 확정 Enter 보호 — `isComposing` 미설정 브라우저 대비 `keyCode 229` 병행).
    3. `target.tagName === "INPUT"`이고 `type ∈ {text, number, email, tel, password, search, url, ""}`.
       - **textarea 제외**(Enter=줄바꿈 보존). Select/라디오/체크박스/버튼 제외.
    4. **옵트아웃 가드**: `target.closest('[data-enter-nav="off"]')`이면 무시. → autocomplete/표 자체 Enter 핸들러를 가진 컴포넌트는 이 속성으로 전역 이동을 비활성화.
  - 동작:
    - `e.preventDefault()`(폼 제출·기본 동작 차단).
    - `focusNextInput(target)`: **스코프 컨테이너 내**에서 포커스 가능한 대상 input을 **DOM 순서**로 수집 → 현재 요소 index+1로 포커스.
      - **스코프**: `target.closest('form, [role="dialog"], [data-enter-nav-scope]')`가 있으면 그 안에서만, 없으면 `document` 전체. → Dialog 입력이 배경 폼으로 점프하는 것 방지. 마법사 step 컨테이너에 `data-enter-nav-scope`를 부여할지는 Do 단계에서 결정(현재 마법사는 `<form>` 미사용 확인됨).
      - 수집 셀렉터: 위 type 화이트리스트 input만 후보.
      - 제외: `disabled`, `readonly`, `type=hidden`, `offsetParent === null`(숨김), `tabindex="-1"`, `[data-enter-nav="off"]` 하위.
    - 다음 요소 포커스 후 기존 `SelectOnFocusProvider`(RAF select)가 자동 전체선택 → 즉시 덮어쓰기 UX 무료 확보.
    - 마지막 입력이면 포커스 유지(아무 동작 없음).
- 등록: `app/layout.tsx`에서 `SelectOnFocusProvider` **안쪽**에 중첩(검증: layout은 `ThemeProvider > SelectOnFocusProvider`만 래핑, `AuthMigrationListener`는 그 안의 형제 — L63-85).
  ```tsx
  <SelectOnFocusProvider>
    <EnterKeyNavigationProvider />  {/* 리스너만 부착, children 래핑 불필요 (SelectOnFocusProvider와 동일 패턴) */}
    <AuthMigrationListener />
    <header>…</header>
    {children}
  </SelectOnFocusProvider>
  ```
  > Provider가 children을 감싸지 않고 형제 리스너로 동작해도 `document` 전역 리스너이므로 전체에 적용됨(SelectOnFocusProvider와 동일).

### DateInput 상호작용
- `DateInput`(연/월/일 3분할 `type="text"`)은 내부에서 4자리·2자리 입력 시 **자동 포커스 이동**. Enter는 평소 불필요.
- Enter를 누르면 화이트리스트에 걸려 다음 input(같은 DateInput의 연→월→일, 마지막 일에서 다음 필드)으로 이동 → 자연스러움. 별도 분기 불필요.

### 검토 포인트 / 리스크
- **Form submit 차단 부작용**: 검증 결과 `InheritanceTaxForm`에 `<form>`/`type="submit"` 없음 → "계산하기"는 버튼 onClick(L451)이라 Enter 자동제출 경로 없음. 다만 Do 단계에서 **다른 세목 폼이 `<form>`을 쓰는지 grep 재확인**(`grep -rn "<form" components/calc app/calc`). 쓰는 곳이 있으면 `preventDefault`로 Enter 제출이 막히는 게 의도와 맞는지 확인.
- **자체 Enter 핸들러 충돌 (확인됨)**: 다음 6개 파일이 이미 `onKeyDown`/Enter를 사용 → 해당 입력에 `data-enter-nav="off"`를 부여하거나, 자체 핸들러에서 `e.nativeEvent.stopImmediatePropagation()` 호출로 전역 도달 차단:
  - `components/calc/stock-transfer/KiwoomStockNameAutocomplete.tsx` (종목명 typeahead — Enter=항목 선택)
  - `components/calc/stock-transfer/TransferDate1MonthClosingPriceTable.tsx`
  - `components/calc/stock-transfer/PostListingClosingPriceTable.tsx`
  - `components/calc/stock-transfer/PostListingNetIncomeStatement.tsx`
  - `components/calc/stock-transfer/PostListingNetAssetStatement.tsx`
  - `components/calc/stock-transfer/PostListingValuationCard.tsx`
  - → 권장: 컨테이너에 `data-enter-nav="off"` 1개만 부여(하위 input 일괄 제외)하는 방식이 수정량 최소.
- **모달/Dialog 내부 입력**: 스코프 한정(`closest('[role="dialog"]')`)으로 Dialog 내부에서만 순환, 배경 폼으로 점프 방지.

### 영향 파일
- `components/providers/EnterKeyNavigationProvider.tsx` (신규)
- `app/layout.tsx` (Provider 등록)
- (옵트아웃 부여) stock-transfer 6개 컴포넌트의 자체 Enter 핸들러 보유 입력 컨테이너 — `data-enter-nav="off"`

---

## 작업 순서 (권장)

1. **작업 2** (중복 라벨) — 가장 국소적, 회귀 위험 낮음.
2. **작업 1** (사이드바 폭) — 1줄 + 브라우저 실측.
3. **작업 3** (Enter 네비게이션) — 전역 영향, 마지막에 충분한 검증.

## 검증 (Definition of Done)

- [ ] `npx tsc --noEmit` 0건
- [ ] `npm run lint`
- [ ] **작업 1**: 데스크톱에서 사이드바 180px, 숫자 오버플로 없음, 우측 입력 영역 확장 확인 (브라우저 실측)
- [ ] **작업 2**: V2 정식평가 폼 — `FiscalYearAdjustmentTable` 3개 연도 열 모두(L217), `NetAssetCalculationTable` 5개소(L185·216·249·262·275), `CapitalChangeTable` 2개소(L151·168) 입력 위 라벨 제거(좌측/FieldCard 라벨만 유지). CurrencyInput 단독 사용 화면(상속재산 등) 라벨 정상 노출 회귀 확인
- [ ] **작업 2 회귀**: `e2e/inheritance-unlisted-*.spec.ts` 6개 + `besshi-*.test.tsx` 통과 — 라벨 텍스트 쿼리(`getByLabel`) 의존 spec 사전 grep 후 보정
- [ ] **작업 3**: Playwright e2e(`e2e/*.spec.ts`) — ① 텍스트/숫자 input 연속 Enter 이동 ② textarea/Select 미동작 ③ IME 조합 중 미동작(가능 시) ④ `data-enter-nav="off"` 컨테이너(키움 종목명 autocomplete)에서 Enter는 항목 선택 유지·전역 이동 안 함 ⑤ Dialog 내부 Enter가 배경 폼으로 점프하지 않음 (메모리 규칙: 브라우저 확인은 claude-in-chrome·수동 안내가 아닌 e2e spec으로 충족)
- [ ] 다른 세목 폼 `<form>` 사용 여부 grep 재확인 후 Enter 제출 차단 영향 점검
- [ ] 회귀 `npm test` 전체 통과

## 미결/후속 (이번 범위 밖)

- 다른 세목 폼(양도·취득·재산·종부·증여) 사이드바 폭 일관 적용 여부 (이번엔 상속세 `InheritanceTaxForm`만)
- 사이드바 180px에서 숫자 오버플로 심할 시 폰트 추가 축소(작업 내 1차 미세조정으로 부족할 경우)
- 마법사 step 컨테이너에 `data-enter-nav-scope` 부여 여부 — Do 1차 구현(스코프 없이 document 전역) 후 점프 위화감 있으면 적용
