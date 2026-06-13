# 주식·지분 목록 카드 → 요약 테이블 + 편집 모달 전환 계획

> 상속재산 목록(`EstateItemTableView`, 이미지2)과 동일한 **행=요약 / 행 클릭→Dialog 모달 편집** 패턴으로
> `StockValuationForm`(상장·비상장주식)을 전환한다.
> **5번째 동형 전환** — [[estate-asset-table-view]]·[[debt-item-table-view]]·[[prior-gift-table-view]]·
> [[inheritance-heir-table-view]] 패턴 차용. 자산 카드 전환 때 "평가조서 갑지·V2 복잡"으로 **명시적 제외**됐던
> 바로 그 부분이라 5건 중 난이도·E2E 표면이 가장 크다.

---

## 1. 목표 / 범위

상속세 Step1 / 증여세 Step1의 "주식·지분 목록"을 세로 카드 나열에서 요약 테이블 + 행 클릭 모달 편집으로 전환.
**엔진·타입·API·Validation 무변경** (순수 UI — 8 동기화 지점 중 ⑤만).

### 범위 (In)

- `StockValuationForm`(`components/calc/StockValuationForm.tsx:554`) — **상속세·증여세 공유 컴포넌트**.
  - 상속세: `Step1Estate.tsx:121` (`CollapsibleEstateGroup groupKey="stock"`, emerald, `hideHeader` + controlled add panel)
  - 증여세: `gift-tax-form-shared.tsx:519` (구분선 + 기본 헤더 + uncontrolled add panel)
- 상장주식(`listed_stock`, 📈) + 비상장주식(`unlisted_stock`, 📊) 두 카테고리 모두.
- 비상장 간편평가(V1, `UnlistedStockSimpleFields`) + 정식평가(V2, `UnlistedStockV2Card`) 두 모드 모두 모달 안으로.

### 범위 (Out)

- **엔진·타입·API·validate 무변경**. `EstateItem` 형상 동일 — 렌더 방식만 카드→테이블.
- 별지 부표3 결과 화면(`UnlistedStockBesshiResultSection`·`ListedStockBesshiResultView`) — **입력 UI 무관, 변경 없음**.
- 키움 자동조회(`useKiwoomValuationFetch`)·평가조서 미리보기·PDF 다운로드 — 모달 안에서 **그대로 동작** (로직 무변경).
- 자산↔주식 카테고리 상호 변경 미지원(현행과 동일). 주식은 listed↔unlisted 변경도 미지원 → `CategoryChangeDialog` 불필요(자산 전환과 다른 점).
- `UnlistedStockEditor.tsx`(legacy 75줄) — 모달 경로 무관(`UnlistedStockCard`가 실사용). `UnlistedStockSimpleFields`가 util만 re-export. **무변경**.

---

## 2. 현황 분석 (실측)

### 2.1 현재 구조 (`StockValuationForm.tsx`, 722줄)

| 구역 | line | 역할 |
|---|---|---|
| `ListedStockAutoFetchIntegration` | 59–139 | 키움 자동조회 + 종목정보 섹션 |
| `ListedStockEditor` | 152–310 | 📈 상장주식 카드 (헤더·자동조회·갑지13필드·평가조서·종가평균·§63②3호·미리보기·부담부증여·공통속성) |
| `UnlistedStockCard` | 343–471 | 📋 비상장주식 카드 (헤더·평가방식 라디오·simple/formal 분기·부담부증여·공통속성) |
| `TotalStockValue` | 481–523 | 주식 합계 (예상) |
| `StockValuationForm` | 554–722 | 오케스트레이터 (`handleAdd`/`handleUpdate`/`handleRemove`·`items.map` 카드·추가패널·합계) |

- 각 카드 외곽 = `<div className="border rounded-lg p-4 ...">` + 자체 헤더(이모지 + "상장주식 N"/"비상장주식 N" + 우상단 빨강 "삭제").
- 카드 wrapper: `<div data-testid="stock-card" data-category={item.category}>` (`:629`).
- `items.map`에서 `listedItems.indexOf(item)` / `unlistedItems.indexOf(item)`로 카테고리별 번호 부여(`:637`,`:647`).

### 2.2 핵심 우위 — **주식에 행 식별자 `id`가 있다** ★★★

`StockValuationForm.handleAdd`(`:570`)가 `generateStockId()` = `stock-${Date.now()}-${n}`로 `id` 발급. 주식은 `EstateItem`이므로 자산·채무·상속인과 같이 **id 기반 선택**(`selectedItemId: string | null`) 사용.
→ PriorGift처럼 `selectedIndex` 우회 불필요. `EstateItemTableView`의 `selectedItemId`/`onSelect(id)` 시그니처 그대로 차용.

### 2.3 평가액·배지 단일출처 — **이미 주식 대응 완료** (재사용 가능)

- **평가액**: `computeEffectiveValuation(item, valuationDate?)`(`lib/calc/estate-item-valuation.ts:23`)가 `listed_stock||unlisted_stock` 분기로 `computeStockValuation(item, valuationDate)` 위임(`:40`). 행 평가액 컬럼 = 이 단일출처 그대로. ★ **단, `valuationDate` 전달 필수** — V2 비상장은 `evaluationDate` 미입력 시 `valuationDate`(상속개시일·증여일) fallback으로만 평가됨(`resolve-estate-item-value.ts:98`). `EstateItemTableView`(`:62`)는 미전달이나 주식 테이블은 반드시 전달.
- **분류·옵션 배지**: `resolveChips({item, mode, heirsCount, showMajorShareholderChip})`(`chip-config.ts:121`) — 카테고리 게이팅 없이 generic 필드 기반. 주식 전용 `showMajorShareholderChip`(§22② 최대주주, `:112`) 파라미터 보유. `isActiveData===true` 필터로 실제 설정 옵션만 표시(자산 테이블 동형).
  - ★ `resolveChips` 내부 `estimated-value` 칩은 `computeEffectiveValuation(item)`을 valuationDate 없이 호출(`chip-config.ts:125`) → V2 비상장은 칩 평가액이 0일 수 있으나 이 칩은 `isActiveData` 미부여라 **테이블서 필터아웃**(영향 없음). 평가액 **컬럼**은 별도로 valuationDate 전달해 정합 유지.

### 2.4 결정적 제약 — **`SupportedCategory`는 주식을 제외** ★★★

`SupportedCategory = Exclude<AssetCategory, "listed_stock" | "unlisted_stock">`(`deemed-category-policy.ts:20`).
→ `estate-category-meta.ts`의 `CATEGORY_LABELS`/`CATEGORY_ICONS`는 `Record<SupportedCategory, string>` — **주식 키 부재**.
→ `EstateItemTableView`를 **그대로는 주식 행 렌더 불가**(라벨·아이콘 undefined). **주식 전용 `StockItemTableView` 신설**이 정답(선례 4건 모두 parallel TableView). 주식 라벨·아이콘은 `EstateCommonAttributesSection.tsx:54`에 이미 존재(`listed_stock:"📈 상장주식"`, `unlisted_stock:"📊 비상장주식"`) → 단일출처로 추출.

### 2.5 `mode` 2분기 — 컬럼/배지가 모드별로 다름

- **상속세**(`mode==="inheritance"`): 분류·옵션 컬럼 노출. `resolveChips`가 분류·§22·협의분할·영농·가업·최대주주 배지 반환.
- **증여세**(`mode==="gift"`): `resolveChips`가 `mode!=="inheritance"`이면 평가액 칩만 반환(`:136`) → 분류·옵션 컬럼 자동 생략. `EstateCommonAttributesSection`도 gift 시 전체 비노출. 자산 테이블과 동일 자동 단순화.

---

## 3. 설계

### 3.1 테이블 컬럼 (이미지2 상속재산 [종류·자산명·평가액·분류·옵션·편집] 대응)

| 컬럼 | 내용 | 출처 |
|---|---|---|
| 종류 | 📈 상장주식 / 📊 비상장주식 + (비상장만) `간편`/`정식` 작은 배지 **[확정 노출]** | `stock-category-meta` + `resolveUnlistedDisplayMode(item)` |
| 자산명 | `item.name?.trim() \|\| item.companyName \|\| CATEGORY_LABEL` | item 필드 |
| 평가액 | `computeEffectiveValuation(item, valuationDate)` 우정렬(`font-mono tabular-nums`), 0이면 "미입력" | 단일출처(§2.3) |
| 분류·옵션 | `resolveChips(...).filter(isActiveData===true)` 읽기전용 배지 (**상속세 모드만**) | `resolveChips` + `showMajorShareholderChip` derive |
| 편집 | `⚙️ {optionCount}` + `✎` | `countNonDefaultOptions(item, mode)` |

- `showMajorShareholderChip` per-item derive — **단일출처 술어 재사용**: `EstateCommonAttributesSection.tsx:143`의 `item.category === "listed_stock" || (item.category === "unlisted_stock" && resolveUnlistedDisplayMode(item) === "simple")`. V2(formal)=false(카드 내부 자체 토글, 중복 방지). UI 재구현 금지([[feedback_ui_engine_dual_truth_avoidance]]) — 동일 술어를 `stock-category-meta` 또는 공용 헬퍼로 추출해 행·`EstateCommonAttributesSection` 양쪽 import.
- 행 = `<tr role="button" tabIndex={0}>` 클릭 + Enter/Space (라디오 컬럼 없음). `data-testid="stock-table-row-${item.id}"`(동적 — E2E는 정규식/role 매칭).
- **비상장 `간편/정식` 부가 배지 [확정 노출]** — `resolveUnlistedDisplayMode(item)`(`resolve-estate-item-value.ts:47`, `(item)=>"simple"|"formal"`) 결과를 종류 셀 내 작은 배지로(`간편`=sky/`정식`=emerald, `text-[10px] px-1.5 rounded-full`). 상장주식·자산 행엔 없는 주식 고유 보조 신호.

### 3.2 편집 모달 (Dialog)

- shadcn `Dialog`. `open = selectedItemId !== null`, `onOpenChange(false) → setSelectedItemId(null)`.
- 모달 내용물 = `StockItemEditor` (신설) — `item.category` switch:
  - `listed_stock` → `ListedStockEditor` body
  - `unlisted_stock` → `UnlistedStockCard` body
- 두 body는 현재 자체 헤더(이모지+"상장주식 N"+삭제버튼)를 가짐 → **`hideHeader` prop 추가**로 외곽 카드·헤더·삭제 숨김(`DialogTitle`과 중복 제거). 삭제는 모달 푸터/DialogTitle 영역에서 단일 노출. 패턴: `EstateItemEditor`의 `hideTitle`(`:147`)·`GiftRowEditor`의 `hideHeader`.
- **모달은 "닫기"만** — 실시간 `onUpdate` 반영이라 저장/취소·폐기확인 불필요(닫아도 데이터 유지, [[feedback_dialog_data_discard_confirm]] 예외 아님). 긴 입력(V2·갑지13필드) → `max-h-[85vh] overflow-y-auto`.
- 키움 자동조회·평가조서 미리보기·PDF·부담부증여·공통속성 — body 그대로라 **무변경 동작**.

### 3.3 선택 상태 — id 기반 useState

- `const [selectedItemId, setSelectedItemId] = useState<string|null>(null)` (zustand 금지 — UI ephemeral, [[feedback_zustand_selector]]).
- **추가**(E-1): `handleAdd` 끝에 `setSelectedItemId(newItem.id)` → 모달 자동 오픈(자산·채무·상속인 동형).
- **삭제**(E-2): `handleRemove`에서 해당 id면 `setSelectedItemId(null)` → 모달 자동 닫힘.

### 3.4 신설 / 수정 파일

**신설 3**
- `components/calc/inheritance/stock/stock-category-meta.ts` — `STOCK_CATEGORY_LABELS`/`STOCK_CATEGORY_ICONS`(📈/📊) + `newStockId()` 단일출처(`EstateCommonAttributesSection.tsx:54`·`StockValuationForm.generateStockId:550` 중복 추출).
- `components/calc/inheritance/stock/StockItemTableView.tsx` — 테이블(종류·평가방식배지·자산명·평가액·분류옵션·편집). `resolveChips`·`computeEffectiveValuation`·`CHIP_TONE_CLASSES`·`ReadonlyChipBadge`·`shouldShowMajorShareholderChip` 재사용. ~180줄.
- `components/calc/inheritance/stock/StockItemEditor.tsx` — 모달 내용물. `ListedStockEditor`·`UnlistedStockCard`·`ListedStockAutoFetchIntegration`·`VALUATION_MODE_OPTIONS`를 **이 파일로 이동** + `hideHeader` 분기. switch 래퍼. ~410줄(<800).

**수정 3**
- `StockValuationForm.tsx` — 카드 `items.map` 제거 → `StockItemTableView` + `Dialog(StockItemEditor)` 오케스트레이션. 추가패널(`showAddPanel`)·합계(`TotalStockValue`)·`hideHeader`/controlled add panel props·헤더 **보존**. public props 무변경 → `Step1Estate`/`gift-tax-form-shared` diff 0. ListedStockEditor/UnlistedStockCard 이동으로 722→~280줄(800 정책 개선).
- `ListedStockEditor`·`UnlistedStockCard` — `hideHeader?: boolean` prop 추가(헤더부·외곽 카드 조건부). ★ **이름 주의**: 이 prop은 두 에디터 컴포넌트 전용 — 기존 `StockValuationForm.hideHeader`(form-level 섹션 헤더, `:540`/`:560`/`:607`)와 **다른 컴포넌트의 별개 prop**(충돌 아님). EstateItemEditor는 동일 목적에 `hideTitle`(`:147`) 사용 — 명명 일관성 위해 에디터에도 `hideHeader` 채택(외곽 카드까지 숨기므로 Title보다 Header가 정확). (이동 후 StockItemEditor 내부 함수로.)
- **`EstateCommonAttributesSection.tsx` — 단일출처 재배선(★ dual-truth 회피, [[single-source-engine-helper]])**: ① 라벨·아이콘(`:54`)을 신설 `stock-category-meta` import로 교체. ② `showMajorShareholderChip` 술어(`:143`)를 신설 공용 헬퍼 import로 교체.
- **`lib/calc/stock-valuation.ts` — `shouldShowMajorShareholderChip(item)` 헬퍼 추가**: `item.category === "listed_stock" || (item.category === "unlisted_stock" && resolveUnlistedDisplayMode(item) === "simple")`. `resolveUnlistedDisplayMode`·`computeStockValuation`와 동거(주식 calc mediator 단일출처). `StockItemTableView`·`EstateCommonAttributesSection` 양쪽 import.

### 3.5 EstateStockChipsHeader 중복 관계 (유지 판단)

현재 카드 내부 `EstateCommonAttributesSection`(`:151`)이 `EstateStockChipsHeader`(헤더칩: 분류·§22·최대주주)를 렌더. 전환 후:
- **테이블 행** = read-only 배지(클릭 비활성).
- **모달 안** = `EstateCommonAttributesSection`(→`EstateStockChipsHeader`) 그대로 = **상호작용 배지**(클릭→토글·펼침).
→ 자산 테이블 전환과 동일(행=readonly / 모달=interactive). 역할 분리로 **중복 아님, EstateStockChipsHeader 유지**.

---

## 4. 8개 동기화 지점 영향

| # | 지점 | 영향 |
|---|---|---|
| ① 폼 상태 | `FormState.stockItems: EstateItem[]` | 무변경 |
| ② initial | — | 무변경 |
| ③ normalize | — | 무변경 |
| ④ API 변환 | `inheritance-api`/`gift-api` | 무변경(EstateItem[] 형상 동일) |
| ⑤ **UI 위젯** | `StockValuationForm` 외 3 신설 | **← 본 작업 전부** |
| ⑥ 사이드바 | 상속 `sumEstateItemsValuation(stockItems, deathDate)`(Step1Estate:52) · 증여 `evaluateAllEstateItems` 경유(gift-tax-form-shared:282) · 카드 내 `TotalStockValue`(StockValuationForm:481) | 무변경(items 합산) |
| ⑦ 결과 카드 | 별지 부표3 등 | 무변경 |
| ⑧ validation | `*-validate.ts` | 무변경 |

→ **⑤ 단독**. 선례 4건과 동일.

---

## 5. 리스크 / 함정

- ★★★ **E2E 34개 spec 영향 — 5건 중 최대 표면**. `stock-card`·`stock-add-bottom`·`ls-avg-price`·`ls-inline-auto-fetch-button`·`ls-security-info-shares`·`unlisted-*` 등 카드 내부 testid가 전부 모달 안으로 이동.
  - **완화**: 추가 시 모달 자동 오픈(E-1) → `addStock` 직후 `fill(ls-avg-price)` 류는 **모달 열린 채 그대로 접근 가능**(다수 spec 무수정 통과 기대).
  - **필요 마이그레이션**: ① 계산/"다음" 전 모달 닫기(backdrop 차단) → `e2e/utils`에 공용 `closeStockModal(page)` 추가. ② 기존 카드 재편집은 행 클릭(`stock-table-row-*` 정규식/role)으로 모달 오픈. ③ `stock-input-order-bottom-add.spec.ts`(`stock-card` count·`stock-add-bottom`) 직접 재작성.
  - **baseline 대조 필수**([[feedback_e2e_preexisting_failures]]): 변경 전 `git stash`/master에서 동일 spec 실행해 사전존재 실패 분리. 신규 실패만 회귀 판정. 사전존재 stale 목록 참고([[project_inheritance_stale_e2e_specs]]).
  - worktree 시 `E2E_PORT=3100`([[feedback_e2e_worktree_port_isolation]]).
- ★★ **평가액 valuationDate 전달**: `StockItemTableView`는 `computeEffectiveValuation(item, valuationDate)` — V2 비상장 evaluationDate fallback. 미전달 시 V2 행 평가액 0 → 침묵 누락. Pre-Do anchor로 V2 행 평가액 검증.
- ★★ **showMajorShareholderChip per-item derive**: 상장·V1=true, V2=false. 단일출처 헬퍼 재사용(재구현 금지). 잘못 고정 시 V2에 중복 §22 칩.
- ★ **분할 추정 낙관 금지**([[feedback_800line_split_export_preservation]]): 테이블 신설은 별도 파일이라 본체 자동 축소 아님. 단, ListedStockEditor·UnlistedStockCard를 StockItemEditor로 **이동**하므로 StockValuationForm은 실제 축소(722→~280). StockItemEditor ~410 확인.
- ★ **자산명 fallback 3중 일치**([[feedback_store_default_vs_ui_display_fallback]]): 행 `name||companyName||라벨`, 모달 헤더, 결과 동일 fallback. 빈 이름 행이 "상장주식" 라벨로 표시되도록.
- ★ **결과 화면 내부 id 비노출**([[feedback_no_internal_id_in_result]]): `stock-` id 출력 금지 — testid에만.
- ★ **카테고리 변경 없음**: 주식은 listed↔unlisted 변경 미지원 → `CategoryChangeDialog` 미사용(자산 전환과 다른 단순화). 잘못 종류 추가 시 삭제 후 재추가.

---

## 6. 작업 순서 (Phase)

> Do는 단일 응답 완주([[single-response-do-execution]]). Plan·Design 완료 후 Pre-Do anchor 우선([[pre-do-anchor-verification]]).

0. **Pre-Do anchor**(`__tests__/components/stock-item-table-view.test.tsx`, ui.design §12 = ST-A1~A7): ① 상장 행 평가액(평균×주식수) ② 비상장 V2 행 평가액(valuationDate fallback) ③ 분류·옵션 배지 isActiveData 필터 ④ 증여세 모드 분류컬럼 생략 ⑤ 행 클릭→`onSelect(id)` ⑥ `shouldShowMajorShareholderChip`(상장·V1=true, V2=false) ⑦ 평가방식 배지(V1=간편·V2=정식). 실패 확보 후 디자인 환류.
1. **단일출처 추출·재배선**: `stock-category-meta.ts`(라벨·아이콘·`newStockId`) + `lib/calc/stock-valuation.ts`에 `shouldShowMajorShareholderChip` 헬퍼. `EstateCommonAttributesSection.tsx:54·143`를 신설 출처 import로 교체(dual-truth 회피) → 회귀 0 확인(기존 stock 칩 E2E).
2. `StockItemTableView.tsx` 신설.
3. `StockItemEditor.tsx` 신설 — ListedStockEditor·UnlistedStockCard 이동 + `hideHeader`.
4. `StockValuationForm.tsx` 리팩터 — 테이블+Dialog 오케스트레이션, E-1/E-2 자동선택, 추가패널·합계·props 보존.
5. anchor green 확인 + `npx tsc --noEmit` 0 + `npx vitest run __tests__/components/` 회귀 0. ★ anchor 추가 후 tsc 재실행 필수(optional 필드 strict, [[project_prior_gift_table_modal]] T-trap).
6. **E2E 마이그레이션**: 공용 `closeStockModal`/`openStockCard` 헬퍼 + 34 spec baseline 대조 + 신규 `stock-item-table-view.spec.ts`(ST-1 행 렌더·ST-2 행클릭 모달편집·ST-3 추가 자동오픈·삭제 자동닫힘).
7. 브라우저 수동 확인(상속·증여 양쪽: 추가→모달→입력→닫기→행 배지·합계 갱신).

---

## 7. 검증 기준 / DoD

- [ ] `npx tsc --noEmit` 0건 (anchor 추가 후 재실행 포함).
- [ ] `npm test` 전체 회귀 0 ([[feedback_per_tax_test_scripts]] — PR 전 전체).
- [ ] 컴포넌트 anchor: 행 렌더(상장·V1·V2)·평가액·배지 필터·증여 컬럼 생략·행클릭 모달.
- [ ] 신규 `stock-item-table-view.spec.ts` 통과 + **기존 34 spec baseline 대조**로 신규 실패 0 확인([[feedback_browser_verify_with_playwright]] — 직접 실행, UI시니어 "통과" 보고 불신뢰).
- [ ] 800줄: StockItemEditor·StockItemTableView·StockValuationForm 전부 ≤800.
- [ ] 8 동기화 ⑤ 단독, ①~④⑥~⑧ diff 0 grep 확인.
- [ ] 브라우저 수동: 상속세 Step1 + 증여세 Step1 양쪽 추가/편집/삭제/합계.

---

## 8. 결정 사항 (사용자 확정 2026-06-13)

1. **브랜치 전략**: ✅ **격리 worktree** — `wt-new.sh`로 per-worktree index 격리([[feedback_external_concurrent_edit_stale_read]]). 동시 세션 활성 시 공유 워킹트리 commit/reset 금지. E2E는 `E2E_PORT=3100`([[feedback_e2e_worktree_port_isolation]]).
2. **종류 컬럼 평가방식 배지**: ✅ **노출** — 비상장 행에 `간편`/`정식` 보조 배지(주식 고유, 모드 식별 도움). §3.1 확정.
3. **UI 디자인 문서**: ✅ **생성** — `stock-item-table-view.ui.design.md`를 13단계 자가검토 루프([[plan-design-self-review-loop]])로 작성. 본 계획 승인 후 진행.
