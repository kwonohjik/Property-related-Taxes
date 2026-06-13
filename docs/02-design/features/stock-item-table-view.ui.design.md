# UI Design — 주식·지분 목록 카드 → 요약 테이블 + 편집 모달

> 계획서: `stock-item-table-view.plan.md`. **순수 UI(⑤ 단독)** — 엔진·타입·API·validate 무변경.
> 선례 `estate-asset-table-view.ui.design.md`(같은 `EstateItem`, 같은 Dialog 패턴) 차용 + 주식 고유(상장/비상장·간편/정식·키움 자동조회·갑지·V2).
> 오케스트레이션은 `PropertyValuationForm.tsx:117-237` 1:1 미러.

---

## 1. 설계 원칙

1. **이중 뷰**: 평소 요약 테이블(1행=1주식), 행 클릭 → shadcn `Dialog` 모달에 기존 에디터 body 그대로. 라디오 컬럼 없음 — `<tr role="button" tabIndex={0}>` + Enter/Space.
2. **모달은 닫기/삭제만**: 실시간 `onUpdate` 반영 → 저장/취소·폐기확인 불필요([[feedback_dialog_data_discard_confirm]] 예외 아님).
3. **단일출처 재사용**: 평가액=`computeEffectiveValuation(item, valuationDate)`, 배지=`resolveChips`, 최대주주 노출=`shouldShowMajorShareholderChip`, 모드=`resolveUnlistedDisplayMode`. UI 재구현 0([[feedback_ui_engine_dual_truth_avoidance]]).
4. **선택 상태 로컬 useState**: `selectedItemId: string|null` (id 보유 — PriorGift `selectedIndex` 불요). zustand 금지([[feedback_zustand_selector]]).
5. **public props 무변경**: `StockValuationForm` 시그니처 유지 → `Step1Estate:121`·`gift-tax-form-shared:519` diff 0.

---

## 2. 데이터 파생 매핑 (engine.design 대체 — 읽기 전용 매핑)

### 2.1 StockItemTableView 행 (신규 필드 0 — 전부 파생)

| 셀 | 값 | 출처 (실측) |
|---|---|---|
| 종류 아이콘 | `STOCK_CATEGORY_ICONS[category]` (📈/📊) | `stock-category-meta`(신설, `EstateCommonAttributesSection:54`서 추출) |
| 종류 라벨 | `STOCK_CATEGORY_LABELS[category]` (상장주식/비상장주식) | 동상 |
| 평가방식 배지 | `resolveUnlistedDisplayMode(item)` → 간편/정식 (비상장만) | `resolve-estate-item-value.ts:47` |
| 자산명 | `item.name?.trim() \|\| item.companyName \|\| STOCK_CATEGORY_LABELS[category]` | 3중 fallback([[feedback_store_default_vs_ui_display_fallback]]). 비상장=`item.name`이 회사명(`UnlistedStockSimpleFields:367`), 상장=`item.name` 별명·`companyName` 갑지①법인명 |
| 평가액 | `computeEffectiveValuation(item, valuationDate)` | `estate-item-valuation.ts:23,40` (★ valuationDate 전달) |
| 분류·옵션 | `resolveChips({item, mode, heirsCount, showMajorShareholderChip}).filter(c=>c.isActiveData===true)` | `chip-config.ts:121` |
| ⚙️ 카운트 | `countNonDefaultOptions(item, mode)` | `chip-config.ts` |
| 특례 귀속 | `item.isSpecialTreatmentAsset === true` | item 필드 |

- `showMajorShareholderChip` = `shouldShowMajorShareholderChip(item)`(신설 헬퍼, `lib/calc/stock-valuation.ts`): `listed_stock || (unlisted_stock && resolveUnlistedDisplayMode==="simple")`. `EstateCommonAttributesSection:143` 술어 추출 — 양쪽 import.
- ★ **`StockItemTableViewProps`는 `valuationDate?: string` 포함**(EstateItemTableView엔 없음, `:144`): 평가액 컬럼 `computeEffectiveValuation(item, valuationDate)` + 행이 `showMajorShareholderChip` 계산. `StockValuationForm`이 prop 전달(상속=deathDate·증여=giftDate).

### 2.2 모달(StockItemEditor) — 기존 body 그대로

| category | 렌더 | 출처 |
|---|---|---|
| `listed_stock` | `ListedStockEditor` body (자동조회·갑지13·평가조서·종가평균·§63②3호·미리보기·부담부증여·공통속성) | StockValuationForm:152-310 이동 |
| `unlisted_stock` | `UnlistedStockCard` body (평가방식 라디오·simple `UnlistedStockSimpleFields`/formal `UnlistedStockV2Card`·부담부증여·공통속성) | StockValuationForm:343-471 이동 |

- 두 body는 `hideHeader` 시 자체 헤더(이모지+번호+삭제) 미렌더 → DialogTitle·푸터로 대체.

---

## 3. 테이블 레이아웃 (StockItemTableView)

### 3.1 컬럼 폭·정렬

| 컬럼 | 정렬 | 비고 |
|---|---|---|
| 종류 | left | 아이콘 + 라벨 + (비상장)평가방식 배지 |
| 자산명 | left | `font-medium` + 특례 귀속 배지 |
| 평가액 | **right** | `font-mono tabular-nums whitespace-nowrap` ([[amount-column-align]]) |
| 분류·옵션 | left | 배지 wrap (**상속세 모드만**) |
| 편집 | right | `⚙️ N` + `✎`, `w-16` |

### 3.2 ASCII (상속세 모드)

```
주식·지분 목록                                    [+ 주식·지분 추가] [▲ 접기]
상장주식과 비상장주식을 구분하여 입력하세요

 종류              자산명         평가액        분류·옵션              편집
─────────────────────────────────────────────────────────────────────────
 📈 상장주식       삼성전자      1,200,000,000  ✓금융재산공제 협의분할   ⚙️2 ✎
 📊 비상장주식 정식 (주)가나다    3,000,000,000  ✓최대주주 가업 §15⑤      ⚙️2 ✎
 📊 비상장주식 간편 (주)라마      미입력                                    ✎
─────────────────────────────────────────────────────────────────────────
 주식 합계 (예상)                3,000,000,000
```

- 평가방식 배지: `간편`(sky)·`정식`(emerald), `text-[10px] px-1.5 py-0.5 rounded-full`, 종류 라벨 우측.
- 합계 = 기존 `TotalStockValue`(StockValuationForm:481) 테이블 하단 유지.

### 3.3 증여세 모드 (4컬럼 자동 축소)

`resolveChips`가 `mode!=="inheritance"`서 평가액 칩만 반환(`chip-config.ts:136`) → 분류·옵션 컬럼 미렌더(`showOptionCol=false`, `EstateItemTableView:164` 동형).

```
 종류              자산명         평가액         편집
──────────────────────────────────────────────────────
 📈 상장주식       삼성전자      1,200,000,000   ✎
 📊 비상장주식 간편 (주)가나다    3,000,000,000   ✎
```

---

## 4. 행 상호작용 + testid

| 요소 | 구현 | testid |
|---|---|---|
| 행 | `<tr role="button" tabIndex={0} onClick onKeyDown(Enter/Space)>` | `stock-table-row-${item.id}` (동적 → E2E 정규식/role) |
| 선택 강조 | `bg-violet-50/70` (`EstateItemTableView:88` 동형) | — |
| aria-label | `${nameDisplay} 편집` | — |

- 행 `data-testid`는 동적 id → E2E는 `locator('tr[role="button"]')` 또는 `/stock-table-row-/` 정규식([[project_heir_composition_table_modal_view]] TV-1 함정).

---

## 5. 편집 모달 레이아웃 (Dialog)

### 5.1 Dialog ASCII

```
┌─────────────────────────────────────────────┐
│ 상장주식 편집                                  │  ← DialogTitle
├─────────────────────────────────────────────┤
│ (max-h-[85vh] overflow-y-auto)                │
│  ℹ️ 평가기준일 전후 2개월… §63①1가             │
│  [종목정보 + 🔍 키움 자동조회]                  │
│  [갑지 13필드 3 collapsible]                   │
│  [평가조서 미리보기 + PDF]                      │
│  전후 2개월 종가 단순평균 [____]               │
│  §63②3호 증자신주 토글                          │
│  [평가액 미리보기]                              │
│  [§47① 부담부증여(증여 모드만)]                 │
│  [공통속성 4블록 (상속 모드만)]                 │
├─────────────────────────────────────────────┤
│              [🗑 삭제]          [닫기]          │  ← 푸터
└─────────────────────────────────────────────┘
```

비상장 모달: DialogTitle "비상장주식 편집" + body = 평가방식 라디오(간편/정식) → 선택 모드 입력 + 부담부증여 + 공통속성.

### 5.2 Dialog props (PropertyValuationForm:197-237 동형)

```tsx
<Dialog open={selectedItemId !== null} onOpenChange={(o)=>{ if(!o) setSelectedItemId(null); }}>
  <DialogContent className="sm:max-w-2xl w-full p-0" showCloseButton={false}>
    <DialogHeader className="px-4 pt-4 pb-0">
      <DialogTitle>{selectedItem ? `${STOCK_CATEGORY_LABELS[selectedItem.category]} 편집` : "주식 편집"}</DialogTitle>
    </DialogHeader>
    <div className="max-h-[85vh] overflow-y-auto px-4 pb-4 pt-3" data-testid="stock-edit-dialog">
      {selectedItem && <StockItemEditor item={selectedItem} index={selectedIndex} mode={mode}
        heirs={heirs} valuationDate={valuationDate}
        onUpdate={(u)=>handleUpdate(selectedIndex,u)} onRemove={()=>handleRemove(selectedIndex)} />}
    </div>
    <div className="border-t px-4 py-3 flex justify-between">
      <button onClick={()=>handleRemove(selectedIndex)} className="… text-rose-600">🗑 삭제</button>
      <button onClick={()=>setSelectedItemId(null)} className="…">닫기</button>
    </div>
  </DialogContent>
</Dialog>
```

- ★ `sm:max-w-2xl` — 자산(`sm:max-w-lg`)보다 넓게(갑지13필드·V2 표 폭). 실측 후 조정.
- ★ **삭제 푸터 노출**: 자산은 EstateItemHeader(hideTitle도 삭제 유지)서 삭제 → 주식은 `hideHeader`로 헤더 전체 숨김 → **푸터 좌측 삭제(rose-600)** 추가([[feedback_dialog_data_discard_confirm]] 파괴 액션 rose). 자산 모달과 다른 점.
- ★ **Do 환류 — `EstateItemHeader.hideRemove` 신설**: 모달 body의 `EstateCommonAttributesSection`→`EstateStockChipsHeader`→`EstateItemHeader`가 **noop "자산 삭제" 버튼**을 렌더(기존 카드에도 있던 dead UI). 모달서 푸터 "🗑 삭제"와 중복·혼란 + E2E strict 위반(삭제 2개) → `EstateItemHeader`에 `hideRemove?:boolean`(기본 false, estate 자산 모달 영향 0) 추가 + `EstateStockChipsHeader`가 `hideRemove` 전달로 제거.

### 5.3 StockItemEditor — hideHeader 분기

```tsx
export function StockItemEditor({ item, index, onUpdate, onRemove, mode, heirs, valuationDate }) {
  switch (item.category) {
    case "listed_stock":   return <ListedStockEditor  ... hideHeader />;
    case "unlisted_stock": return <UnlistedStockCard ... hideHeader />;
  }
}
```

- `ListedStockEditor`/`UnlistedStockCard`에 `hideHeader?: boolean` 추가 → `true` 시 `<div className="border rounded-lg p-4">` 외곽 + 헤더(이모지/번호/삭제) 미렌더, `space-y-3` 본문만(모달이 곧 카드 외곽).
- `onRemove`는 푸터가 호출(헤더 삭제 숨김) — 에디터 내부 `onRemove`는 hideHeader 시 미사용(시그니처 유지).

### 5.4 삭제 흐름 (E-2)

푸터 🗑 → `handleRemove(selectedIndex)` → `onChange(filter)` + `if(selectedItemId===removedId) setSelectedItemId(null)`(PropertyValuationForm:160-163 동형) → 모달 자동 닫힘.

---

## 6. 추가 흐름 (E-1 자동 오픈)

- 추가 패널(상장/비상장 2버튼, 현행 StockValuationForm:661-701 보존) → `handleAdd(category)` → `generateStockId()` id 발급 → `onChange([...items, newItem])` + **`setSelectedItemId(newItem.id)`** + `setShowAddPanel(false)` → 모달 자동 오픈.
- 비상장 추가 시 현행 기본값(`unlistedValuationMode:"simple"` + `unlistedStockData` 초기값, StockValuationForm:575-586) 유지.
- controlled add panel(`addPanelOpen`/`onAddPanelOpenChange`, 상속 헤더 버튼)·uncontrolled(증여 하단 버튼) 분기 보존.

---

## 7. 상장/비상장 분기 상세 (선례 PresumedInheritance 자리)

| 구분 | 상장(listed) | 비상장 simple(V1) | 비상장 formal(V2) |
|---|---|---|---|
| 평가액 | `computeStockValuation`(평균×주식수, §63②3호 차감) | `calcUnlistedStockPerShareValue`×주식수 | `evaluateUnlistedStockV2` |
| valuationDate 의존 | anchor shift(자동조회 시) | 없음 | ★ evaluationDate 미입력 시 fallback |
| §22 최대주주 칩 | ✓ 노출 | ✓ 노출 | ✗ (카드 내부 토글) |
| 평가방식 배지 | 없음 | `간편` | `정식` |

- **모달 폭은 전체 `sm:max-w-2xl` 단일**(DialogContent className 단일 — V2 표·갑지13필드 최대폭 기준, §5.2 일치). category별 가변 아님. Do 단계서 실측 후 미세 조정.

---

## 8. testid 표 (보존 / 신규 / 소멸) — ★ E2E 34 spec 핵심

| testid | 상태 | 비고 |
|---|---|---|
| `ls-avg-price`·`ls-inline-auto-fetch-button`·`ls-security-info-shares`·`unlisted-*`·V2 필드 testid | **보존** | 모달 안으로 이동 — **add 자동오픈 시 즉시 접근 가능** |
| `stock-card` (`StockValuationForm:631`) | **변경/검토** | 카드 wrapper div 소멸 → 행 대체. ★ **완화 옵션**: 행 `<tr>`에 `data-testid="stock-card" data-category={category}` 병기 시 `stock-input-order-bottom-add.spec.ts:46` `getByTestId("stock-card")` count 무수정 통과(의미만 카드→행). 채택 시 행 testid 2개 병기. Do 단계서 결정 |
| `stock-add-bottom`·추가패널 버튼 | **보존** | 오케스트레이터에 유지 |
| `estate-stock-chips-header-${id}` | 보존 | 모달 안(EstateCommonAttributesSection) 유지 |
| `stock-table-row-${id}` | **신규** | 행 (동적) |
| `stock-edit-dialog` | **신규** | 모달 컨테이너 |

- **마이그레이션 헬퍼**(신설, `e2e/utils`): `openStockCard(page, index)`(행 클릭) · `closeStockModal(page)`(role=dialog "닫기" — 계산/다음 전 backdrop 해제, [[project_prior_gift_table_modal]] `closePriorGiftModal` 동형).
- **baseline 대조 필수**: 34 spec 중 다수는 add→fill 직후라 자동오픈으로 무수정 통과 기대. 신규 실패만 회귀 판정([[feedback_e2e_preexisting_failures]]·[[project_inheritance_stale_e2e_specs]]).

---

## 9. 접근성

- 행 `role="button" tabIndex={0}` + `aria-label` + Enter/Space + `focus-visible:ring-violet-400`.
- 테이블 `role="group" aria-label="주식·지분 목록"`.
- Dialog `showCloseButton={false}` + 푸터 명시 닫기(EstateItemTableView·PropertyValuationForm 동형).

---

## 10. 케이스 시각 표 (카테고리 × 모드 × 평가방식)

| category | mode | 평가방식 | 종류 셀 | 분류·옵션 컬럼 | 최대주주 칩 |
|---|---|---|---|---|---|
| listed_stock | 상속 | — | 📈 상장주식 | 노출 | 노출 가능 |
| listed_stock | 증여 | — | 📈 상장주식 | 미렌더 | — |
| unlisted_stock | 상속 | simple | 📊 비상장주식 `간편` | 노출 | 노출 가능 |
| unlisted_stock | 상속 | formal | 📊 비상장주식 `정식` | 노출 | ✗(내부 토글) |
| unlisted_stock | 증여 | simple/formal | 📊 비상장주식 `간편/정식` | 미렌더 | — |

---

## 11. UI 8지점 매핑

| # | 지점 | 변경 |
|---|---|---|
| ① 폼 상태 | `stockItems: EstateItem[]` | 무변경 |
| ② initial | — | 무변경 |
| ③ normalize | — | 무변경 |
| ④ API 변환 | — | 무변경 |
| ⑤ **UI 위젯** | StockItemTableView·StockItemEditor·stock-category-meta 신설 + StockValuationForm·두 에디터·EstateCommonAttributesSection·stock-valuation.ts 수정 | **← 전부** |
| ⑥ 사이드바 | `sumEstateItemsValuation`/`evaluateAllEstateItems`/`TotalStockValue` | 무변경(items 합산) |
| ⑦ 결과 카드 | 별지 부표3 등 | 무변경 |
| ⑧ validation | — | 무변경 |

→ ⑤ 단독. 단 ⑤ 내부에 **dual-truth 회피 재배선**(EstateCommonAttributesSection·stock-valuation.ts) 포함 — 회귀 anchor 필수.

---

## 12. 신규 컴포넌트 anchor (Pre-Do 우선)

`__tests__/components/stock-item-table-view.test.tsx`:
- ST-A1 상장 행 평가액 = 평균×주식수
- ST-A2 비상장 V2 행 평가액 (valuationDate fallback 주입) > 0
- ST-A3 분류·옵션 배지 `isActiveData===true`만 (기본 안내칩 제외)
- ST-A4 증여세 모드 분류·옵션 컬럼 미렌더
- ST-A5 행 클릭 → `onSelect(id)` 호출
- ST-A6 `shouldShowMajorShareholderChip`: 상장 true·V1 true·V2 false
- ST-A7 평가방식 배지: V1=간편·V2=정식 렌더

E2E `e2e/stock-item-table-view.spec.ts`: ST-1 행 렌더 · ST-2 행클릭 모달편집 · ST-3 추가 자동오픈+삭제 자동닫힘 · ST-4 증여 4컬럼.
