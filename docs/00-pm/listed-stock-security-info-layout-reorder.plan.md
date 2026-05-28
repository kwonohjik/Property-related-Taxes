# 상장주식 입력 폼 — 종목 정보 카드 순서·종목명 자동조회 재구성 계획서

> **요구사항 (이미지 17·18)**:
>
> 1. **종목 정보 입력** sky 카드 내부 순서·필드 재구성:
>    ```
>    종목코드 (필수)   [입력]   [🔍 키움 자동조회]    ← 한 줄 (현재 별도 카드)
>    종목명           [자동 조회]
>    보유 주식 수     [입력]
>    ```
> 2. `종목코드 (선택)` → `종목코드 (필수)` 라벨 변경.
> 3. 종목명은 **키움 응답의 stockName 자동 채움** (현재 사용자 직접 입력).
> 4. 자동조회 **결과 카드(이미지 18)** = 평가구간·거래일·평균·일자별 토글 영역은 **현재 위치 그대로 고정**.

---

## 1. 현재 구조 실측

### 1-1. 컴포넌트 구성

- `components/calc/inheritance/listed-stock/ListedStockSecurityInfoSection.tsx`
  - sky 카드 "종목 정보 입력" — FieldCard 3개 (`종목명` → `종목코드 (선택)` → `보유 주식 수`).
- `components/calc/KiwoomValuationAutoFetchButton.tsx:164-236`
  - **단일 컴포넌트가 (a) 헤더+버튼 카드 + (b) 결과 카드** 두 영역을 한 sky 박스 안에서 렌더.
  - 라인 165-192: 헤더("키움증권 자동조회 (전후 2개월 평균)") + 설명 + 🔍 버튼.
  - 라인 193-280+: 결과 영역 (`info && !error`) — anchor shift 안내, ✓ 종목명·평가구간·평균 산식, 일자별 토글.
- `components/calc/StockValuationForm.tsx:105-135`
  - 부모 — `ListedStockSecurityInfoSection` → `KiwoomValuationAutoFetchButton` 순서로 배치.

### 1-2. 종목명 자동 채움 경로 (현재 동작)

`KiwoomValuationAutoFetchButton.tsx:119`:
```ts
if (syncName && data.stockName) patch.stockName = data.stockName;
```
그러나 **`StockValuationForm.tsx onResponse` 가 활성 → onFill 호출 안 됨**.
대신 onResponse 내부:
```ts
...(adapter.companyName ? { companyName: adapter.companyName } : {}),
```
→ `EstateItem.companyName` 만 채움. `EstateItem.name` (= 자산 카드 헤더용 종목명) **미동기화**.

이미지 17의 종목명 input(`item.name`) 이 비어 있는 이유 = onResponse가 `name` 을 set하지 않기 때문.

---

## 2. 목표 디자인

### 2-1. 카드 1 — "종목 정보 입력" (sky) 재구성

```
┌─ 종목 정보 입력 ──────────────────────────────────────────────┐
│  종목코드 (필수)   [005930]              [🔍 키움 자동조회]    │  ← 한 줄
│  종목명           [삼성전자]   ← 자동 채움                      │
│  보유 주식 수      [30,000]                                    │
└──────────────────────────────────────────────────────────────┘
```

- 종목코드 input 우측에 키움 자동조회 버튼 인라인 배치.
- 종목코드 비활성 시 버튼 disabled + hover 사유 노출 (현행 `disabledReason` 재사용).
- 종목명 자동 채움 — 자동조회 성공 응답의 `stockName` 이 `item.name` 에 동시 mirror.

### 2-2. 카드 2 — 결과 카드 (emerald, 이미지 18)

- 헤더("키움증권 자동조회 (전후 2개월 평균)") + 설명 + 버튼 = **제거** (카드 1로 이동).
- 결과 영역만 잔존 — anchor shift 안내, ✓ 종목명·평가구간·평균 산식, 일자별 토글.
- **위치 고정** — `ListedStockBesshiAttributesSection` 직전 (현재 위치).

### 2-3. 종목명 자동 채움 — 옵션 비교

| 옵션 | 트리거 | 종목명 input 편집 가능성 | 본 PR 범위 |
|---|---|---|---|
| (a) **★권장 — 자동조회 클릭 시 mirror** | 키움 자동조회 버튼 1회 클릭 | **편집 가능** (자동조회 실패·미사용 시 수동 입력 허용) | 최소 — onResponse에 `name: stockName` 추가 |
| (b) 종목코드 onBlur/debounce 자동 조회 | 종목코드 6자리 완성 시 자동 ka10001 또는 마스터 lookup | read-only | 신규 lookup API/마스터 hook 필요 |
| (c) typeahead 컴포넌트 채택 (`KiwoomStockNameAutocomplete`) | 종목명 검색 → 코드 자동 채움 | typeahead | 양도세 도메인과 중복, UI 패턴 변경 큼 |

**(a) 채택** — onResponse 에 `name: adapter.companyName ?? adapter.stockName` 1줄 추가로 즉시 정합. 자동조회 실패 시 사용자가 직접 종목명 입력 가능(현재와 동일). 본 PR 범위 최소.

> **후속 PR(2026-05-28 완료)**: 옵션 (c) typeahead 채택 → `docs/00-pm/listed-stock-name-autocomplete.plan.md` 분리. 본 reorder 결과(layout·trailing·warning) 100% 보존, 종목명 input만 typeahead로 교체. `InheritanceStockNameAutocomplete` 단독 wrapper(Option B) 채택. 5410 PASS.

---

## 3. 작업 분해

### Step 1 — Pre-Do anchor (RED 확보)

- [ ] **A-1** `__tests__/components/calc/inheritance/listed-stock-security-info-section.test.tsx` 신규 또는 확장:
  - 입력: `ListedStockSecurityInfoSection` + props로 자동조회 버튼 slot 전달.
  - 기대:
    - DOM 순서: 종목코드 → 종목명 → 보유 주식 수.
    - 종목코드 FieldCard 가 `required` 속성으로 *(별표) 표시.
    - 종목코드 input 의 같은 행 우측 슬롯(FieldCard `trailing`)에 `🔍 키움 자동조회` 버튼 존재.
- [ ] **A-1.5** variant `"inline"` 단독 렌더 anchor (`KiwoomValuationAutoFetchButton.test.tsx` 확장):
  - `<KiwoomValuationAutoFetchButton variant="inline" ... />` 단독 렌더 시 헤더 텍스트("키움증권 자동조회 (전후 2개월 평균)") **렌더되지 않음** 검증.
  - 카드 테두리(`bg-sky-50/60` 박스) 미렌더 — 버튼만 노출.
  - disabled 사유는 FieldCard `warning` 슬롯으로 위임(본 컴포넌트 미표시).
- [ ] **A-1.6** 결과 카드 위치 분리 anchor:
  - `info` 상태 시 `KiwoomValuationResultCard` 가 별도 위치에 렌더되고 inline 버튼 영역에는 결과 텍스트("평가구간"·"종가합계" 등) 미노출.
- [ ] **A-2** 자동 채움 anchor — `__tests__/components/calc/inheritance/listed-stock-channel-fill.test.tsx` 확장:
  - 키움 응답 mock `stockName: "삼성전자"` → onUpdate patch 에 **`name: "삼성전자"` + `companyName: "삼성전자"` 둘 다 포함** 검증.
  - 기존 `companyName` patch 회귀 0 ([[feedback_explicit_prop_mapping_strip]] 정합).

### Step 2 — 컴포넌트 시그니처 확장

- [ ] **B-1** `ListedStockSecurityInfoSection` props 확장:
  - 신규 prop: `autoFetchSlot?: React.ReactNode` — 종목코드 FieldCard 의 **기존 `trailing` 슬롯**(FieldCard.tsx:12,63 — 이미 존재)에 그대로 전달. 신규 FieldCard prop 도입 0건.
  - 종목코드 FieldCard 호출 패턴 (C-1 참조):
    ```tsx
    <FieldCard
      label="종목코드"
      required
      trailing={autoFetchSlot}
      hint="6자리 종목코드 (예: 005930)"
    >
      <input ... />
    </FieldCard>
    ```
- [ ] **B-2** `KiwoomValuationAutoFetchButton` 에 **inline variant** 추가:
  - 신규 prop: `variant?: "card" | "inline"` (기본 `"card"` — 현행 동작 그대로 유지하여 T-1/T-2/T-3 회귀 0 보장).
  - `inline` 시:
    - 헤더("키움증권 자동조회 (전후 2개월 평균)") · 설명 텍스트 · sky 박스 테두리 모두 제거 → **버튼 단독 렌더**.
    - disabled 사유 `disabledReason` 은 본 컴포넌트에서 노출하지 않고 부모(`ListedStockSecurityInfoSection`)가 FieldCard `warning` 슬롯으로 노출 → **새 prop `onDisabledReasonChange?: (reason: string | null) => void`** 콜백 또는 hook 반환값으로 위로 전달.
    - error(`!res.ok`) 도 inline 시에는 hook 반환값으로 노출, 부모가 위치 결정.
- [ ] **B-3** **결과 카드 분리 (필수)** — `KiwoomValuationAutoFetchButton` 의 결과 표시 영역(line 193-273)을 `KiwoomValuationResultCard` 컴포넌트로 추출:
  - props 시그니처:
    ```ts
    interface KiwoomValuationResultCardProps {
      info: {
        average: number; tradingDays: number; sum: number; stockName: string;
        slotDates: string[]; closingPrices: (number | null)[]; weekendLabels: string[];
        resolvedAnchor?: string; anchorShifted?: boolean; anchorShiftReason?: string;
        valuationPeriodStart?: string; valuationPeriodEnd?: string;
      } | null;
      valuationDate: string;
      error?: string | null;
      showDetail: boolean;
      onToggleDetail: () => void;
    }
    ```
  - 부모에서 버튼은 카드 1 (sky, 종목 정보 카드 내부) 에 inline, 결과 카드는 별도 위치(이미지 18 — 종목 정보 카드 직후) 에 렌더.
  - state(`info`, `error`, `loading`, `showDetail`) 는 hook으로 끌어올림 — 버튼·결과 카드가 같은 state를 공유해야 함.
- [ ] **B-4** state 끌어올림 패턴 — `useKiwoomValuationFetch(stockCode, valuationDate, onResponse, onFill, startOverrideDate, syncName)` hook 신규:
  - 반환: `{ loading, error, info, fetch, canFetch, disabledReason, showDetail, setShowDetail }`.
  - 기존 `KiwoomValuationAutoFetchButton` 컴포넌트는 hook을 내부에서 호출하는 thin wrapper 로 변경 — **외부 시그니처(stockCode·valuationDate·onResponse·onFill·startOverrideDate·syncName)는 동일 유지** → T-1/T-2/T-3 회귀 0.
  - 부모(`StockValuationForm`)가 inline+결과 카드 분리 케이스에서 hook 직접 호출 또는 두 자식에 분배.

### Step 3 — UI 정정

- [ ] **C-1** `ListedStockSecurityInfoSection.tsx`:
  - 필드 DOM 순서: 종목코드 → 종목명 → 보유 주식 수 (현재 `종목명 → 종목코드 → 주식수`).
  - 종목코드 라벨: 기존 `"종목코드 (선택)"` 텍스트 라벨 → **FieldCard `required` prop 으로 *(별표) 자동 표시**. 라벨 자체는 `"종목코드"` (디자인 시스템 정합 — FieldCard.tsx:51-54 별표 자동 렌더).
  - 종목코드 FieldCard 의 **기존 `trailing` 슬롯**에 `props.autoFetchSlot` 그대로 전달 (FieldCard 신규 API 도입 0).
  - inline 자동조회 버튼의 disabled 사유는 FieldCard `warning` 슬롯으로 노출 (예: `warning={canFetch ? undefined : disabledReason}`).
  - 종목명 FieldCard hint: "키움 자동조회 시 자동 입력 — 직접 수정도 가능".
  - 종목명 input은 **read-only 아님** (사용자 결정 D-1 — 수정 가능 채택).
- [ ] **C-2** `StockValuationForm.tsx:105-135`:
  - `useKiwoomValuationFetch` hook 1회 호출.
  - `ListedStockSecurityInfoSection` 에 `autoFetchSlot=<KiwoomValuationAutoFetchButton variant="inline" hook 결과 분배 ... />` 전달.
  - `KiwoomValuationResultCard` 를 종목 정보 카드 직후 위치에 렌더 (이미지 18 위치 그대로).
  - `onResponse` 핸들러에 **`name` + `companyName` 둘 다 mirror**:
    ```ts
    set({
      listedStockAvgPrice: adapter.listedStockAvgPrice,
      listedStockDailyGroupsInput: adapter.listedStockDailyGroupsInput,
      name: response.stockName,                       // ★ 자산 카드 헤더용 (신규)
      companyName: adapter.companyName ?? response.stockName, // 갑지 ① 정합 (기존)
      resolvedValuationAnchor: adapter.resolvedValuationAnchor,
      ...
    });
    ```
  - `companyName` vs `name` 의미 차이 주석으로 명시 — `companyName`=갑지 ① 정식 법인명 / `name`=자산 카드 헤더용 별명. 키움 stockName 은 정식 법인명이므로 둘 다 mirror 정합.
- [ ] **C-3** Validator (⑧) — **변경 없음** (사용자 결정 D-2 — Soft 채택):
  - 라벨만 `required` 표시. validator 강제 검증 추가하지 않음.
  - 종목코드 미입력 시 자동조회 버튼 disabled (현행 `disabledReason="종목코드 6자리 입력 필요"`) + FieldCard `warning` 슬롯 노출 — 사용자 발견성으로 충족.
  - 기존 사용자 데이터(종목코드 없이 평균가만 직접 입력) 호환 보존.

### Step 4 — 회귀·E2E

- [ ] **D-1** `npx vitest run __tests__/components/calc/inheritance/ __tests__/components/calc/KiwoomValuationAutoFetchButton.test.tsx` 통과.
  - 기존 anchor **T-1·T-2·T-3** 회귀 0 명시 (hook 추출 후에도 onResponse·onFill 분기 동작 동일 — variant 기본 `"card"` 유지).
  - 기존 `listed-stock-channel-fill.test.tsx` anchor 회귀 0 + A-2 신규 anchor(`name` mirror) 추가 PASS.
- [ ] **D-2** `npm test` 전체 회귀 0건.
- [ ] **D-3** `npx tsc --noEmit` 0건.
- [ ] **D-4** `e2e/listed-stock-besshi.spec.ts` — 종목코드 입력 → 자동조회 클릭 → 종목명 input 에 "삼성전자" 자동 표시 검증 anchor 1건 추가.

---

## 4. 8개 동기화 지점 점검

| # | 지점 | 변경 |
|---|---|---|
| ① | 폼 상태 | EstateItem 변경 없음 — `name`·`listedStockCode` 기존 필드. |
| ② | initial | 변경 없음 |
| ③ | normalize | 변경 없음 |
| ④ | API 변환 | 변경 없음 |
| ⑤ | UI 위젯 | ★ ListedStockSecurityInfoSection 순서·슬롯, KiwoomValuationAutoFetchButton 분리, KiwoomValuationResultCard 신규 |
| ⑥ | 사이드바 합계 | 변경 없음 |
| ⑦ | 결과 카드 | 변경 없음 (갑지 ⑨·⑩ 동일) |
| ⑧ | Validation | ★ listedStockCode 필수 규칙 추가 (라벨 변경 정합) |

---

## 5. 위험·회귀

- **R-1** **결과 카드 위치 변경 없음** — 현재 `KiwoomValuationAutoFetchButton` 가 결과를 같은 sky 박스 내부에 표시 (이미지 17). 분리 후에도 동일 위치(종목 정보 카드 직후)에 렌더되도록 부모에서 명시. 사용자 요구 "이미지 18 위치 고정" 보존.
- **R-2** **`onFill` 경로 호환** — onFill 경로는 onResponse 미사용 시(현재 일부 호출처가 있을 수 있음) 활성화. variant `inline` 모드에서도 onFill·onResponse 둘 다 지원.
- **R-3** **종목명 사용자 직접 입력 보존** — 자동조회 실패·종목코드 미입력 시 사용자가 종목명을 직접 적을 수 있어야 함. read-only 처리 금지 — placeholder/hint 로 유도만.
- **R-4** **listedStockCode 검증 강화의 회귀** — 기존에 종목코드 없이 평균가만 직접 입력한 케이스가 있을 수 있음. 본 PR이 필수 라벨화하면서 검증도 필수로 두면 기존 사용자 입력이 거부됨. **결정 필요**: (a) 라벨만 (필수) 으로 변경하고 validation은 soft warning (b) 라벨 + 강제 검증 둘 다.
  - 권장 (a) — 라벨만 변경, validation 은 자동조회 동작에만 영향(종목코드 없으면 버튼 disabled — 현행). 수동 입력 모드 보존.
- **R-5** **800줄 정책** — `KiwoomValuationAutoFetchButton.tsx` 280줄대. 결과 카드 분리 시 본 파일은 ~150줄, 신규 `KiwoomValuationResultCard` ~130줄. 정책 준수.

---

## 6. Acceptance Criteria

- [ ] **AC-1** 카드 1 DOM 순서: 종목코드(필수) → 종목명 → 보유 주식 수.
- [ ] **AC-2** 종목코드 input 같은 행 우측에 🔍 키움 자동조회 버튼 표시 (인라인 variant).
- [ ] **AC-3** 자동조회 성공 → **`item.name` + `item.companyName` 둘 다 자동 채움** (예: "삼성전자"). 이미지 17 상태(종목명 input 비어 있음) 재현 시 본 PR 후 자동 채움 확인. 갑지 ① 법인명도 정합.
- [ ] **AC-4** 종목코드 FieldCard 가 `required` 속성으로 *(별표) 표시 (라벨 텍스트 자체는 `"종목코드"`).
- [ ] **AC-5** 자동조회 결과 카드(이미지 18 — anchor shift·평가구간·평균 산식·일자별 토글)는 종목 정보 카드 직후 위치에 그대로 렌더.
- [ ] **AC-6** 자동조회 실패 시 사용자가 종목명을 직접 입력 가능 (read-only 금지).
- [ ] **AC-7** 전체 회귀 0건, tsc 0건, lint error 0.
- [ ] **AC-8** e2e — 종목코드 005930 + 평가기준일 → 자동조회 → 종목명 input 에 "삼성전자" 표시 + 결과 카드 위치 유지.

---

## 7. 결정 완료 항목 (사용자 확정)

- [x] **D-1** 종목명 input — **수정 가능** (read-only 아님). 자동 채움 후에도 사용자 편집 허용. C-1에 반영.
- [x] **D-2** listedStockCode 검증 — **Soft (라벨만 *(별표), validator 강제 안 함)**. C-3에 반영.

---

## 8. 참고

- 디자인: `docs/02-design/features/listed-stock-besshi-form-replica.engine.design.md` §2
- 인접 정정: `docs/00-pm/listed-stock-besshi-form-ux-refinement.plan.md` (종목 정보 sky 카드 도입 PR), `docs/00-pm/listed-stock-besshi-page2-empty-bug-fix.plan.md` (onFill/onResponse 정리 이력)
- 메모리: [[feedback_ui_engine_dual_truth_avoidance]] · [[feedback_select_on_focus]] · [[feedback_pre_anchor_verification]] · [[project_listed_stock_besshi_form_replica]] · [[feedback_no_silent_apportion_fallback]]
