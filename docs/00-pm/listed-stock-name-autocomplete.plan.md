# 상속·증여 상장주식 — 종목명 typeahead(회사명 → 종목코드) 자동완성 계획

> **목적**: 회사명만 입력해도 4,384 종목 마스터에서 매치를 찾아 종목코드를 자동 채워, 사용자가 종목코드 6자리를 외울 필요가 없게 만든다.

- **작성일**: 2026-05-28
- **개정 이력**: 2026-05-28 reorder 정합 → 2026-05-28 v3 (현재 production UI 검증 후 재작성)
- **작성자**: kwonohjik / Claude
- **대상 컴포넌트**: `components/calc/inheritance/listed-stock/ListedStockSecurityInfoSection.tsx`

---

## 0. 현재 production UI 상태 (검증 완료 — 본 계획의 전제)

스크린샷 + 파일(`ListedStockSecurityInfoSection.tsx` 1~109줄) 실측 확인:

```
┌─ 종목 정보 입력 (sky 카드) ──────────────────────────────────────────┐
│ * 종목코드     [6자리 종목코드 (예: 005930)]   [🔍 키움 자동조회]    │
│               ⚠️ 종목코드 6자리 입력 필요                            │
│               6자리 종목코드 (예: 005930)                            │
│                                                                      │
│   종목명       [키움 자동조회 시 자동 입력]                          │
│               키움 자동조회 시 자동 입력 — 직접 수정도 가능          │
│                                                                      │
│   보유 주식 수 (주)  [주식 수 입력]                                  │
└──────────────────────────────────────────────────────────────────────┘
```

- 컴포넌트 props: `item`, `onUpdate`, `autoFetchSlot?`, `autoFetchWarning?` (4개)
- DOM 순서: 종목코드(필수 *) → 종목명 → 보유 주식 수 — **reorder 완료**
- 종목코드 FieldCard `trailing` 슬롯에 `autoFetchSlot`(키움 자동조회 inline 버튼), `warning` 슬롯에 `autoFetchWarning`("종목코드 6자리 입력 필요")
- 종목명 input: native `<input>`, `value={item.name}`, placeholder "키움 자동조회 시 자동 입력", hint "키움 자동조회 시 자동 입력 — 직접 수정도 가능"

**확인된 한계**: 종목명 input은 **수동 텍스트 입력** + **자동조회 응답 stockName 자동 채움**만 지원. 회사명으로 종목코드를 검색하는 reverse path 부재.

---

## 1. 선행 계획서와의 관계

| 계획서 | 동선 | 상태 |
|---|---|---|
| `listed-stock-security-info-layout-reorder.plan.md` | **종목코드 → 종목명**: 코드 입력 → 자동조회 → 응답에서 stockName을 `item.name` 자동 채움 | ✅ 적용 완료 (스크린샷·파일 확인) |
| **본 계획서** | **종목명 → 종목코드**: 회사명 typeahead → 매치 선택 시 `listedStockCode` 자동 mirror | 🆕 본 PR에서 진행 |

- reorder 계획 §2-3은 옵션 (c) typeahead를 "본 PR 범위 최소"라는 이유로 후속으로 분리 → 본 PR이 그 후속
- 두 동선은 독립 보완: reorder = 코드를 아는 사용자 / 본 PR = 코드를 모르는 사용자
- 본 PR은 **종목명 input만 typeahead로 교체**, 종목코드 input·자동조회 버튼·warning·layout은 reorder 결과 100% 보존

---

## 2. 작업 범위

### 2-1. In Scope
- 종목명 input(`ls-security-info-name`)을 typeahead 입력으로 교체
- 매치 선택 시 단일 onUpdate: `{ name: stockName, listedStockCode: stockCode }`
- 키보드 네비 (↑/↓/Enter/Esc), 외부 클릭 닫힘, 300ms debounce
- 직접 텍스트 입력도 보존 (매치 미선택 시 `name`만 업데이트 — 사용자 override 정책)
- 양도세 `KiwoomStockNameAutocomplete` 회귀 0건 (Option B로 양도세 컴포넌트 미수정)

### 2-2. Out of Scope
- 종목코드 → 종목명 자동 채움 (reorder 계획 범위, 이미 적용됨)
- 자동조회 버튼 위치·동작 (reorder 결과 유지)
- 시장구분/거래정지 자동 채움 (`EstateItem` 스키마 미정의 — A-1에서 확정 후 별도 PR)
- 비상장 주식 검색
- placeholder/hint 텍스트 정밀 카피라이팅 (B-3에서 1차 갱신만)

---

## 3. 설계 결정

### 3-1. 옵션 비교 (재확인)

| 옵션 | 방식 | 결정 |
|---|---|---|
| A. 공용 컴포넌트 추출 | `components/kiwoom/StockNameAutocomplete.tsx` 신설 + 양도세 wrapper 재작성 | ❌ reorder 진행 중 양도세 회귀 위험. 3번째 사용처 등장 시 재고 |
| B. 상속용 wrapper 단독 신설 | `components/calc/inheritance/listed-stock/InheritanceStockNameAutocomplete.tsx` | ✅ **채택** — 양도세 미수정, 회귀 위험 0 |

### 3-2. 신규 컴포넌트 시그니처

```ts
interface Match {
  stockCode: string;       // 6자리, KONEX 영문 포함
  stockName: string;
  marketName: string;      // dropdown 배지 표시 (예: "KOSPI", "KOSDAQ", "KONEX")
  tradingHalt: boolean;    // dropdown rose 배지 표시
  // API 응답에는 marketCode/marketTypeStore/adminIssue도 포함되나, 본 PR은 위 4필드만 사용
}

interface Props {
  value: string;                                                          // item.name
  onSelect: (match: Match) => void;                                       // 매치 선택 시
  onNameChange: (name: string) => void;                                   // 직접 텍스트 입력 시 name만 업데이트
  placeholder?: string;
  className?: string;
  testId?: string;                                                        // root <div>의 data-testid (input은 `${testId}-input`)
}
```

- `onSelect`와 `onNameChange` 분리 이유: 매치 선택 = 양쪽 mirror / 직접 입력 = name만 — 부모가 책임 분리하여 자동 fallback 채움 정책 정합
- **dropdown 시각 항목**: 매치별로 `stockName(굵게)` + `stockCode(회색 작게)` + `marketName(sky 배지)` + (tradingHalt 시 `거래정지(rose 배지)`) — 양도세 패턴 차용

### 3-3. mirror 매핑 (단일 onUpdate 호출)

```ts
<InheritanceStockNameAutocomplete
  value={item.name}
  onSelect={(m) => onUpdate({ name: m.stockName, listedStockCode: m.stockCode })}
  onNameChange={(name) => onUpdate({ name })}
  testId="ls-security-info-name"
/>
```

### 3-4. 필수 attribute (양도세 ref 패턴 차용)

- root `<div>`에 `data-enter-nav="off"` — `EnterKeyNavigationProvider` 전역 Enter 이동 옵트아웃 (memory `project_ui_enter_nav_hidelabel_sidebar` 정책: 자체 Enter 핸들러 컴포넌트는 옵트아웃 필수)
- `<input>`에 `autoComplete="off"` — 브라우저 자동완성과 충돌 회피
- dropdown `<li>`에 `onMouseDown={(e) => { e.preventDefault(); selectMatch(m); }}` — `onClick` 사용 시 input blur가 먼저 발화하여 dropdown이 닫혀 click이 unmount → 선택 실패 방지
- `<input>`의 `onFocus={() => matches.length > 0 && setOpen(true)}` — 재포커스 시 기존 매치 재노출
- 외부 클릭 닫힘: containerRef + document mousedown listener (양도세 패턴 그대로)
- 포커스 시 전체 선택: `SelectOnFocusProvider` 전역 적용으로 자동(별도 onFocus select 불필요)

---

## 4. TODO 체크리스트

> **단일 응답 내 완주 강제**. Phase별 보고 후 종료 금지. 미완료 0건 도달까지 tool call 연속 발생. 종료 허용 조건은 (a) 미완료 0 + 자가 점검 출력 완료 / (b) 진짜 블로커("BLOCKER: <사유>" 명시) 둘 뿐.

### Phase A — 사전 조사
- [ ] A-1. `EstateItem` 타입에서 종목 관련 필드 전수 grep (`name`, `listedStockCode`, 시장구분·거래정지 후보 필드 유무 확정)
- [ ] A-2. `/api/kiwoom/search-by-name` route 응답 `Match` 스키마 재확인 + 본 컴포넌트가 쓸 최소 필드 확정(stockCode·stockName)
- [ ] A-3. `ListedStockSecurityInfoSection` 호출 사이트 grep (상속·증여 양쪽 사용처)
- [ ] A-4. reorder onResponse `name` 자동 채움과 typeahead 선택 mirror **충돌 시나리오** 점검
  - 시나리오: typeahead로 A주식 선택 → 자동조회 실행 → 응답 stockName = A → 동값 덮어쓰기 무해
  - 시나리오: typeahead로 A 선택 → 종목코드를 B로 수동 변경 → 자동조회 → 응답 stockName = B → 의도된 덮어쓰기 (사용자 행동에 따른 결과)

### Phase B — 신규 컴포넌트 + 적용
- [ ] B-1. `components/calc/inheritance/listed-stock/InheritanceStockNameAutocomplete.tsx` 신설
  - 300ms debounce, `/api/kiwoom/search-by-name` POST `{query, limit: 10}`
  - dropdown Top 10, 키보드 ↑/↓/Enter/Esc, 외부 클릭 닫힘
  - **dropdown 시각**: stockName(굵게) + stockCode(회색) + marketName(sky 배지) + tradingHalt(rose 배지)
  - **필수 attribute** (§3-4): root `<div data-enter-nav="off">`, `<input autoComplete="off">`, `<li onMouseDown={preventDefault+select}>`, loading "🔄 검색 중..." 노출
  - 정책 준수: `useEffect → store mirror` 없음(검색 fetch는 로컬 state) / 네트워크 실패 silent (매치 빈 배열, 수동 입력 유지) / KONEX 영문 코드 보존
- [ ] B-2. `ListedStockSecurityInfoSection`의 종목명 FieldCard 내부 native `<input>`을 `InheritanceStockNameAutocomplete`로 교체
  - testid `ls-security-info-name` 보존 (회귀 호환)
  - FieldCard 라벨·hint는 그대로
- [ ] B-3. placeholder 갱신: "종목명 검색 또는 자동조회 시 자동 입력 (예: 삼성전자)" — 두 동선(typeahead·자동조회) 모두 안내
- [ ] B-4. hint 갱신: "회사명 입력 시 매치 목록 표시 → 선택 시 종목코드 자동 채움. 종목코드 입력 후 자동조회 시에도 자동 채움 — 직접 수정 가능"
- [ ] B-5. shares input 무변경 확인 (회귀 방지)

### Phase C — 테스트 / 회귀
> 디자인 §7 anchor 매트릭스(T-01~T-15)와 1:1 매핑. C-N anchor는 디자인의 T-NN을 구현.
- [ ] C-1. T-01 (C1): "삼" 입력 → debounce(300ms) 후 매치 노출 → 첫 항목 선택 시 `name` + `listedStockCode` 동시 mirror
  - **mock 전략**: `vi.mock("@/lib/kiwoom/stock-master", () => ({ searchStockMaster: vi.fn().mockResolvedValue([...]) }))` 또는 fetch 직접 mock (MSW 미사용 프로젝트). prefetch warm-up 불필요
- [ ] C-2. T-07·T-08·T-10 (C8·C10): ArrowDown/ArrowUp/Enter 키보드 네비 + Esc 닫힘 + 외부 클릭 닫힘
- [ ] C-3. T-05·T-14 (C6): 네트워크 실패(`fetch` reject 또는 4xx/5xx) silent + AbortController 5s timeout silent
- [ ] C-4. T-02 (C2): 매치 미선택 + 직접 텍스트 입력 시 `name`만 변경, `listedStockCode` 유지 (자동 fallback 금지 정합)
- [ ] C-5. T-03 (C3): 매치 선택 후 종목코드 input에 직접 수정 시 `listedStockCode`만 변경, `name` 유지 (reorder 정책 정합)
- [ ] C-6. T-13 (C14): 외부 value 변경(reorder 자동조회 응답 시뮬) → lastFetchedQ 가드로 fetch skip
- [ ] C-7. T-15 (C8): a11y role(combobox/listbox/option) + aria-expanded/aria-activedescendant 정합
- [ ] C-8. T-06·T-09·T-11·T-12 (C7·C9·C11·C12): KONEX 영문 코드 / 거래정지 배지 / debounce / 자본증가 토글 회귀
- [ ] C-9. 양도세 회귀: `npx vitest run __tests__/kiwoom/` 통과 (양도세 컴포넌트 미수정이라 0건 변화 기대)
- [ ] C-10. 상속 결과 화면 회귀: `npx vitest run __tests__/lib/kiwoom/` + besshi anchor 통과
- [ ] C-11. 전체 회귀 `npm test` 통과

### Phase D — 검증 / 마무리
- [ ] D-1. `npx tsc --noEmit` 0건
- [ ] D-2. `npm run lint` 0건
- [ ] D-3. Playwright e2e 1건 (`e2e/inheritance-listed-stock-name-typeahead.spec.ts`, memory `feedback_browser_verify_with_playwright` 정책): 상속 상장주식 폼에서 (1) 종목명 typeahead 검색 → (2) 매치 선택 → (3) 종목코드 자동입력 → (4) 키움 자동조회 버튼 활성화 → (5) 자동조회 카드 노출
- [ ] D-4. 14 동기화 지점 self-grep — 디자인 §4 매트릭스를 단일 진실로 참조 (본 PR은 ⑤만 실질 변경, 나머지 13지점 무변경)
- [ ] D-5. Memory 신설: `project_listed_stock_name_typeahead.md` + `MEMORY.md` index 한 줄 추가 (상속·증여 그룹 아래)
- [ ] D-6. reorder 계획서에 본 PR 완료 cross-link 추가 (옵션 c를 후속 PR로 분리 완료 명시)

---

## 5. 자가 점검 보고 형식 (완료 보고 전 반드시 출력)

```
전체 작업: <N>개
완료: <M>개
미완료: <N-M>개
미완료 항목:
  - <Phase X-Y. 작업명>
  - ...
```

**미완료 > 0 인 동안 완료 선언 금지**. 단일 응답 내 tool call 연속 발생으로 0이 될 때까지 진행.

---

## 6. 리스크 / 대응

| 리스크 | 대응 |
|---|---|
| reorder onResponse `name` 자동 채움과 typeahead 선택값 덮어쓰기 | A-4 시나리오 점검에서 무해/의도 행동임을 검증 |
| 키움 마스터 prefetch 미수행 환경(개발 API key 없음) | `/api/kiwoom/search-by-name` graceful empty 응답 → 매치 0건 → 사용자 수동 입력 fallback |
| KONEX 영문 종목코드(예: 0070X0) | 양도세에서 검증된 `^[0-9A-Z]{6}$` 정책 — 종목코드 input의 `toUpperCase().replace(/[^0-9A-Z]/g, '')` reorder 결과 그대로 유지 |
| 양도세 컴포넌트와 코드 중복 | Option B 채택 (향후 3번째 사용처 등장 시 Option A로 리팩토링) |
| 직접 입력 + 매치 미선택으로 코드/명 불일치 | 의도된 동작 (자동 fallback 금지). 종목코드 별도 입력 시 자동조회에서 검증 |
| testid `ls-security-info-name` 회귀 | B-2에서 typeahead 컴포넌트 root `<div>`에 `data-testid="ls-security-info-name"`, 내부 `<input>`에 `data-testid="ls-security-info-name-input"` propagate (e2e/anchor 호환) |
| stock-master 첫 호출 시 24h prefetch 트리거로 첫 검색 1~3초 지연 | C-1 anchor에 prefetch warm-up 단계 포함. UI는 dropdown loading "🔄 검색 중..." 텍스트로 사용자 인지 보장 (양도세 패턴 차용) |
| `EnterKeyNavigationProvider` 전역 Enter 이동이 dropdown 키보드 네비와 충돌 | root `<div data-enter-nav="off">`로 옵트아웃 (§3-4) |

---

## 7. 참고 문서·메모리

- 본 디자인: `docs/02-design/features/listed-stock-name-typeahead.design.md` (케이스 인벤토리 C1~C14, anchor T-01~T-15)
- UI 디자인: `docs/02-design/features/listed-stock-name-typeahead.ui.design.md`
- 선행: `docs/00-pm/listed-stock-security-info-layout-reorder.plan.md` §2-3 (옵션 c 기각 결정)
- 인프라: `project_kiwoom_openapi_integration.md`
- 정책: `feedback_useeffect_store_mirror_forbidden.md` · `feedback_no_silent_apportion_fallback.md` · `feedback_api_zod_schema_sync.md`
- 양도세 참조 구현(미수정): `components/calc/stock-transfer/KiwoomStockNameAutocomplete.tsx`
- UI 규약: `components/calc/CLAUDE.md` "8개 동기화 지점" §
