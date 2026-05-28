# 상속·증여 상장주식 종목명 typeahead — UI 디자인

> Plan: `docs/00-pm/listed-stock-name-autocomplete.plan.md` v3
> Engine Design: `docs/02-design/features/listed-stock-name-typeahead.design.md`

- **작성일**: 2026-05-28
- **담당 UI 시니어**: `inheritance-gift-tax-ui-senior` (간접)
- **변경 범위**: 단일 컴포넌트 신설 + 단일 호출부 교체 — 마법사 단계/사이드바/결과 카드 무변경

---

## 1. 사용자 시나리오 (UX flow)

### 시나리오 A — 종목코드를 모르는 사용자 (본 PR 주된 동선)
1. 상속세 마법사 → 자산 추가 → "상장주식" 선택
2. "종목 정보 입력" 카드 노출 (sky 톤)
3. 사용자가 **종목명 input**에 "삼" 입력
4. 300ms 후 dropdown 펼침: "삼성전자 (005930) [KOSPI]", "삼성SDI ...", ... Top 10
5. 마우스 클릭 또는 ↓+Enter로 선택
6. **자동 채움**: 종목명 "삼성전자" + 종목코드 "005930" 동시 입력
7. 종목코드 FieldCard의 ⚠️ warning 사라지고 "🔍 키움 자동조회" 버튼 활성화
8. 사용자가 자동조회 클릭 → 평가기준일 전후 2개월 평균 자동 조회

### 시나리오 B — 종목코드를 아는 사용자 (reorder 기존 동선, 본 PR 미관여)
1. 종목코드 6자리 직접 입력 (예: "005930")
2. 자동조회 버튼 활성화 → 클릭
3. 자동조회 응답에서 종목명 "삼성전자" 자동 채움
4. (변화 없음, reorder 결과 그대로)

### 시나리오 C — 거래정지 종목 선택
1. 종목명 "테스트" 입력 → dropdown에 매치 노출
2. tradingHalt=true인 종목은 우측에 **rose 배지 "거래정지"** 표시
3. 사용자가 인지 후 선택 가능 (차단 없음)
4. 자동조회 시 거래정지 안내는 reorder 자동조회 카드에서 처리 (양도세 검증 UX 표준)

### 시나리오 D — 매치 결과 없음
1. 사용자가 임의 문자 입력 (예: "qwer")
2. 300ms debounce 후 fetch → matches=[]
3. dropdown 미표시 (loading 상태 아님)
4. 사용자는 native input과 동일하게 직접 텍스트 입력 후 종목코드 별도 입력으로 fallback

---

## 2. UI 명세

### 2-1. 종목명 FieldCard (변경 후)

```
┌──────────────────────────────────────────────────────────────────────┐
│ 종목명     ┌────────────────────────────────────────────────────┐   │
│            │ [종목명 검색 또는 자동조회 시 자동 입력 (예: 삼성전자)] │   │
│            └────────────────────────────────────────────────────┘   │
│            회사명 입력 시 매치 목록 표시 → 선택 시 종목코드 자동      │
│            채움. 종목코드 입력 후 자동조회 시에도 자동 채움 — 직접    │
│            수정 가능                                                 │
└──────────────────────────────────────────────────────────────────────┘
```

- 라벨: "종목명" (필수 표시 없음 — 자동 채움 가능)
- placeholder: "종목명 검색 또는 자동조회 시 자동 입력 (예: 삼성전자)"
- hint: "회사명 입력 시 매치 목록 표시 → 선택 시 종목코드 자동 채움. 종목코드 입력 후 자동조회 시에도 자동 채움 — 직접 수정 가능"

### 2-2. Dropdown (포커스 + 매치 보유 시)

```
┌──────────────────────────────────────────────────────────┐
│ 삼성전자   005930                       [KOSPI]          │  ← activeIdx 0 (sky-100 highlight)
├──────────────────────────────────────────────────────────┤
│ 삼성SDI    006400                       [KOSPI]          │
├──────────────────────────────────────────────────────────┤
│ 삼성생명   032830                       [KOSPI]          │
├──────────────────────────────────────────────────────────┤
│ 삼성출판사 068290                       [KOSDAQ] [거래정지]│  ← rose 배지
└──────────────────────────────────────────────────────────┘
```

- 컨테이너: `absolute z-50 mt-1 w-full max-h-72 overflow-y-auto rounded-md border border-sky-200 bg-white shadow-lg text-sm`
- 항목 layout: `flex justify-between items-center px-3 py-2`
- 종목명: `font-semibold` (좌측)
- 종목코드: `ml-2 text-xs text-muted-foreground`
- 시장 배지: `text-xs text-sky-700 bg-sky-50 px-1.5 py-0.5 rounded`
- 거래정지 배지: `ml-1 text-xs text-rose-700 bg-rose-50 px-1.5 py-0.5 rounded`
- 활성 항목 hover/key: `bg-sky-100` / 비활성 hover: `hover:bg-sky-50`

### 2-3. Loading 상태 (debounce → fetch 진행 중)

```
┌──────────────────────────────────────────────────────────┐
│ 🔄 검색 중...                                            │
└──────────────────────────────────────────────────────────┘
```
- `loading && matches.length === 0` 시에만 노출. 매치가 이미 있을 때는 기존 매치 유지 (UX 깜박임 방지)

### 2-4. 매치 0건 상태
- dropdown 미표시. 사용자는 native input과 동일하게 입력만 가능
- 별도 "결과 없음" 메시지 없음 (silent fallback 정책)

### 2-5. 컬러 토큰 (sky 카드 정합)
- 본 컴포넌트는 reorder의 sky 카드 안에 위치 — 모든 강조는 sky 톤
- 거래정지 경고만 rose 톤 사용 (정보 노출 목적, 차단 아님)

---

## 3. 호출부 변경 (ListedStockSecurityInfoSection)

### 3-1. Before (현재)
```tsx
<FieldCard label="종목명" hint="키움 자동조회 시 자동 입력 — 직접 수정도 가능">
  <input
    type="text"
    value={item.name}
    onChange={(e) => set({ name: e.target.value })}
    placeholder="키움 자동조회 시 자동 입력"
    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
    data-testid="ls-security-info-name"
  />
</FieldCard>
```

### 3-2. After (본 PR)
```tsx
<FieldCard
  label="종목명"
  hint="회사명 입력 시 매치 목록 표시 → 선택 시 종목코드 자동 채움. 종목코드 입력 후 자동조회 시에도 자동 채움 — 직접 수정 가능"
>
  <InheritanceStockNameAutocomplete
    value={item.name}
    onSelect={(m) => set({ name: m.stockName, listedStockCode: m.stockCode })}
    onNameChange={(name) => set({ name })}
    placeholder="종목명 검색 또는 자동조회 시 자동 입력 (예: 삼성전자)"
    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
    testId="ls-security-info-name"
  />
</FieldCard>
```

- testid `ls-security-info-name` → root `<div>`에 부여
- 내부 input은 `ls-security-info-name-input`으로 자동 부여 (e2e 호환)

---

## 4. 키보드/마우스 인터랙션 정리

| 동작 | 키/이벤트 | 효과 |
|---|---|---|
| 검색 | input typing | 300ms debounce 후 fetch |
| 다음 매치 활성 | ArrowDown | activeIdx +1 (max=length-1) |
| 이전 매치 활성 | ArrowUp | activeIdx -1 (min=-1) |
| 선택 (키보드) | Enter (activeIdx>=0) | selectMatch → mirror + dropdown 닫힘 |
| 선택 (마우스) | `onMouseDown` (preventDefault) | selectMatch — `onClick` 사용 금지(blur로 dropdown 먼저 닫힘) |
| 닫기 | Esc | setOpen(false) |
| 닫기 (외부) | 외부 mousedown | setOpen(false) |
| 포커스 복귀 | onFocus + matches 보유 | 기존 dropdown 재노출 |
| 다음 필드 이동 | Tab | 브라우저 기본, dropdown은 외부 클릭으로 자연 닫힘 |
| 전역 Enter 네비 | (옵트아웃) | `data-enter-nav="off"`로 차단 — Enter는 typeahead 전용 |

---

## 5. 접근성 (a11y)

| 속성 | 위치 | 값 |
|---|---|---|
| `role="combobox"` | input | 콤보박스 의미 |
| `aria-expanded` | input | open 상태 boolean |
| `aria-autocomplete="list"` | input | 사용자 입력이 list 후보 생성 |
| `aria-controls` | input | listbox id |
| `aria-activedescendant` | input | 활성 option id (activeIdx 동기화) |
| `role="listbox"` | ul | listbox 의미 |
| `id={listboxId}` | ul | useId() 생성 — 다중 자산 충돌 방지 |
| `role="option"` | li | option 의미 |
| `id={listboxId-opt-N}` | li | activedescendant 타깃 |
| `aria-selected` | li | i === activeIdx |

---

## 6. 7개 동기화 지점 (UI 한정)

| # | 지점 | 본 PR 변경 |
|---|---|---|
| ① 폼 상태 | `EstateItem.name`, `EstateItem.listedStockCode` | 기존, 무변경 |
| ② initial | EstateItem factory | 무변경 |
| ③ normalize | normalizeEstateItem | 무변경 |
| ④ API 변환 | `lib/calc/inheritance-tax-api.ts` / `gift-tax-api.ts` | 무변경 |
| ⑤ UI 위젯 | **§3 호출부 교체 + 신규 컴포넌트** | ⭐ 본 PR 변경 지점 |
| ⑥ 사이드바 합계 | `computeInheritanceSummary` | 무변경 |
| ⑦ 결과 카드 | 별지 부표3 + 결과뷰 | 무변경 (기존 필드) |

---

## 7. 테스트 매트릭스 (UI 한정 anchor)

엔진 디자인 §7 T-01~T-15 전부 본 컴포넌트 단위 테스트로 커버. 추가 UI e2e 1건:

| # | 테스트 | 검증 |
|---|---|---|
| UI-E2E-1 | `e2e/inheritance-listed-stock-name-typeahead.spec.ts` | (1) 상속세 마법사 진입 → (2) 자산 추가 "상장주식" → (3) 종목명 input에 "삼성전자" → (4) dropdown 매치 노출 → (5) 첫 항목 클릭 → (6) 종목코드 input "005930" 자동 채움 확인 → (7) 자동조회 버튼 활성화 → (8) (선택) 자동조회 실행 후 평가 결과 카드 노출 |

---

## 8. 회귀 보호

- testid `ls-security-info-name`: root `<div>`에 부여 → 기존 e2e/anchor 호환
- testid `ls-security-info-name-input`: input element 식별용 신설 (값 입력 시뮬 필요한 anchor 대응)
- 종목코드 input(`ls-security-info-code`)·자동조회 버튼(`autoFetchSlot`)·warning(`autoFetchWarning`)·shares input(`ls-security-info-shares`) 모두 무변경
- 별지 부표3 anchor (`besshi-*`) 무변경
- 양도세 `KiwoomStockNameAutocomplete` 무수정 → 양도세 anchor 무변경

---

## 9. 단계별 작업 순서 (Do 단계 가이드)

> Plan §4 Phase B 구현 시 다음 순서로 진행. **단일 응답 내 완주 강제** — 각 단계 완료 후 다음 단계로 즉시 진행, 중간 보고 후 종료 금지.

1. `InheritanceStockNameAutocomplete.tsx` 신설 (디자인 §3 시그니처·§3-4 attribute 그대로)
2. `ListedStockSecurityInfoSection.tsx` 종목명 FieldCard 내부 교체 (UI 디자인 §3-2)
3. anchor 테스트 작성 (디자인 §7 T-01~T-15)
4. `npm test` 통과 확인
5. `npx tsc --noEmit` 0건
6. `npm run lint` 0건
7. e2e `e2e/inheritance-listed-stock-name-typeahead.spec.ts` 작성·통과
8. Memory `project_listed_stock_name_typeahead.md` 신설 + MEMORY.md index 한 줄 추가
9. reorder 계획서에 본 PR 완료 cross-link 추가

---

## 10. 미결정 / 후속 작업

- 시장구분(marketType) 자동 채움 → `EstateItem` 스키마 확장 필요. 별도 PR
- 거래정지 종목 선택 후 자동조회 카드의 강화 안내 → 양도세 검증 UX 표준 패턴 차용. 별도 PR
- 종목명 typeahead의 양도세·상속세 공용 컴포넌트 추출(Option A) → 3번째 사용처 등장 시 검토
