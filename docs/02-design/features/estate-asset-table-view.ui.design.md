# UI Design — 자산 카드 → 요약 테이블 + 편집 모달

> 작성일: 2026-06-10
> 계획서: `docs/02-design/features/estate-asset-table-view.plan.md`
> 선행 사례 UI 설계: `docs/02-design/features/inheritance-heir-table-view.ui.design.md`
> 범위: UI 전용. **엔진·타입·API·Validation 무변경** → `engine.design.md` 비생성
>   (변경할 input/result 타입·알고리즘이 없음. 본 문서가 유일 설계 산출물.)
> 대상 그룹: 상속재산(PropertyValuationForm) + 추정상속재산 §15(PresumedInheritanceInput).
>   증여세 자동 따라감. 주식·지분 제외.

---

## 1. 설계 원칙

| 원칙 | 적용 |
|---|---|
| 조회·편집 분리 | 테이블(조회) + Dialog 모달(편집) — 선행 HeirComposition 동형 |
| 단일 진실 (dual-truth 회피) | 행 배지·평가액은 `resolveChips`·`computeEffectiveValuation` **기존 함수 그대로 호출**. 별도 derive 금지 (`feedback_ui_engine_dual_truth_avoidance`) |
| 데이터 불변 | `EstateItem`·`PresumedInheritanceItem` 필드 추가·제거 0. 표시값 전부 기존 필드 파생 |
| 내부 id 비노출 | 자산명 `name.trim() || 카테고리라벨` (`feedback_no_internal_id_in_result`) |
| 금액 정렬 | 평가액·가산액 셀 `text-right font-mono tabular-nums whitespace-nowrap` (`amount-column-align`) |
| 정적 tone 매핑 | `CHIP_TONE_CLASSES` 재사용 (Tailwind JIT — `feedback_tailwind_static_tone_mapping`) |
| 토글 가시성 | 추가 picker·옵션은 기존 ToggleCard/배지 패턴 유지 |

---

## 2. 데이터 파생 매핑 (engine.design 대체 — 읽기 전용 매핑)

엔진 변경이 없으므로 "설계"는 **기존 데이터 → 표시 위치 매핑**이다. 모든 화살표는 읽기(read-only).

### 2.1 PropertyValuationForm 행

```
EstateItem (기존 필드)                         테이블 행 위치
─────────────────────────────────────────────────────────────
item.category ──────────────────────────────→ [종류] CATEGORY_ICONS + CATEGORY_LABELS
item.name (|| CATEGORY_LABELS[cat]) ─────────→ [자산명]
computeEffectiveValuation(item) ─────────────→ [평가액] (우정렬, 0이면 "미입력") ※직접 호출
resolveChips({item,mode,heirsCount})         → [분류·옵션] 배지
  └ estimated-value 칩은 행에서 제외             (평가액은 위 전용 컬럼에서 직접 계산.
                                                  resolveChips 내부도 동일 computeEffectiveValuation
                                                  호출이라 결과 일치 — dual-truth 아님, 순수함수 안전)
  └ 나머지 칩: label·mark·tone만 사용 (클릭 비활성, isExpandable/isToggle 무시)
  └ classification / section22 / heir-allocation
    / farming / family-business / secured-claim-14
countNonDefaultOptions(item,mode) > 0 ───────→ [편집] ⚙️(n) 배지
```

### 2.2 모달(EstateItemEditor) — 기존 ItemEditor body 그대로

```
resolveChips(...) ──→ EstateItemHeader chips (인터랙티브: 클릭→펼침/토글)
item.category ──────→ VariantBody 분기 (RealEstate/Deposit/Simple)
inlineExpandedKey ──→ EstateChipInlineExpand (분류·분할·영농·가업 펼침)
advancedOpen ───────→ EstateItemAdvancedPanel (⚙️ 고급옵션, mode==="inheritance")
categoryDialogOpen ─→ CategoryChangeDialog (중첩 Dialog — R-4)
(forceExpandKey ────→ 제거 — collapse 자동해제 신호였음. 모달엔 collapse 없음)
```

### 2.3 PresumedInheritanceInput 행

```
PresumedInheritanceItem                        테이블 행 위치
─────────────────────────────────────────────────────────────
CATEGORY_META[it.category].label ────────────→ [종류]
evaluatePresumedItem(it).thresholdTriggered ─→ [임계] 발동/미발동 배지
evaluatePresumedItem(it).addedAmount ────────→ [가산액] (우정렬)
it.heirAllocations (유무) ───────────────────→ [분할] 배지
```

---

## 3. 테이블 레이아웃 (PropertyValuationForm)

### 3.1 컬럼 폭·정렬

| 컬럼 | 정렬 | Tailwind (th/td) | 비고 |
|---|---|---|---|
| 종류 | 좌 | `pl-3 py-1.5 whitespace-nowrap text-xs` | 아이콘 + 라벨 |
| 자산명 | 좌 | `pl-2 py-1.5 text-xs font-medium` | name fallback |
| 평가액 | **우** | `pr-2 py-1.5 text-xs text-right font-mono tabular-nums whitespace-nowrap` | 0 → muted "미입력" |
| 분류·옵션 | 좌 | `pl-2 py-1.5` → `<div className="flex flex-wrap gap-1">` | read-only 배지 |
| 편집 | 우 | `pr-3 py-1.5 text-right text-xs select-none` | ✎ + ⚙️(n) |

### 3.2 ASCII (상속세 모드, 첨부 이미지 데이터)

```
┌────────────────────────────────────────────────────────────────────────────┐
│ 상속재산 목록                                          2개 입력됨  [+ 추가]   │
├──────────┬──────────┬───────────────┬───────────────────────────┬──────────┤
│ 종류     │ 자산명   │        평가액  │ 분류·옵션                 │   편집   │
├──────────┼──────────┼───────────────┼───────────────────────────┼──────────┤
│ 🏠 주택  │ 단독주택 │ 1,500,000,000 │ [일반]                    │  ✎       │
│ 🏦 예금… │ 예금     │   500,000,000 │ [일반][금융재산 공제 ✓]   │  ✎       │
└──────────┴──────────┴───────────────┴───────────────────────────┴──────────┘
                 평가액 합계 (우정렬 tabular-nums) ────────→  2,000,000,000
```

> 평가액 콤마가 `font-mono tabular-nums` + 우정렬로 세로 정렬됨. 합계 행은 기존 `TotalEstimatedValue`(PropertyValuationForm:491) 재사용 — **단 실측(property-valuation-preview.tsx:115)상 `formatKRW` span으로 우정렬/tabular-nums 미적용**. 테이블 평가액 컬럼과 합계의 콤마 세로 정렬을 맞추려면 합계 숫자에 `text-right font-mono tabular-nums` wrapper 추가(또는 합계를 테이블 `<tfoot>` 우정렬 셀로). Do 단계 처리.

### 3.3 증여세 모드 (4컬럼 자동 축소)

```
┌──────────┬──────────┬───────────────┬──────────┐
│ 종류     │ 자산명   │        평가액  │   편집   │   ← 분류·옵션 컬럼 비어 자동 생략
├──────────┼──────────┼───────────────┼──────────┤
│ 🏠 주택  │ 아파트   │   900,000,000 │  ✎       │
└──────────┴──────────┴───────────────┴──────────┘
```

`resolveChips`가 mode!=="inheritance"에서 estimated-value만 반환(chip-config.ts:128) → 분류·옵션 배지 0개. 컬럼 헤더는 조건부(`mode==="inheritance"`)로 렌더해 빈 컬럼 제거.

---

## 4. 행 상호작용 + testid

선행 HeirTableRow(HeirTableView.tsx:201-241) 패턴 차용:

```tsx
<tr
  role="button" tabIndex={0}
  onClick={() => onSelect(item.id)}
  onKeyDown={(e) => { if (e.key==="Enter"||e.key===" ") { e.preventDefault(); onSelect(item.id); } }}
  aria-label={`${nameDisplay} 편집`}
  className={isSelected ? "bg-violet-50/70 …" : "hover:bg-gray-50 …"}
  data-testid={`estate-table-row-${item.id}`}
>
```

| 동작 | 결과 |
|---|---|
| 행 클릭 / Enter / Space | `onSelect(item.id)` → `selectedItemId` set → Dialog 오픈 |
| 키보드 포커스 | `focus-visible:ring-2 focus-visible:ring-violet-400` |
| 선택 행 | `bg-violet-50/70` 강조 |

---

## 5. 편집 모달 레이아웃

### 5.1 Dialog ASCII

```
        ╔════════════════════════════════════════════════╗
        ║ 주택 편집                                      ║  ← DialogTitle (카테고리+편집)
        ╟────────────────────────────────────────────────╢
        ║ [일반 ▾][금융재산 공제 ✓][협의분할 ▾]  ⚙️옵션 🗑║  ← EstateItemHeader 칩+액션 (타이틀부 숨김)
        ║ ┌────────────────────────────────────────────┐ ║
        ║ │ 평가액 입력 (VariantBody — 카테고리별)     │ ║  max-h-[80vh]
        ║ │  · 시가/감정/매매사례/보충 토글            │ ║  overflow-y-auto
        ║ │  · 소재지·임대보증금·저당권 …              │ ║
        ║ └────────────────────────────────────────────┘ ║
        ║ (칩 펼침 시) EstateChipInlineExpand 패널        ║
        ║ (⚙️ 시) EstateItemAdvancedPanel                ║
        ╟────────────────────────────────────────────────╢
        ║                                        [ 닫기 ] ║
        ╚════════════════════════════════════════════════╝
```

### 5.2 Dialog props (HeirComposition:308-345 동형)

```tsx
<Dialog open={selectedItemId !== null} onOpenChange={(o)=>{ if(!o) setSelectedItemId(null); }}>
  <DialogContent className="sm:max-w-lg w-full p-0" showCloseButton={false}>
    <DialogHeader className="px-4 pt-4 pb-0">
      <DialogTitle>{CATEGORY_LABELS[selectedItem.category]} 편집</DialogTitle>
    </DialogHeader>
    <div className="max-h-[80vh] overflow-y-auto px-4 pb-4 pt-3" data-testid="estate-edit-dialog">
      {selectedItem && <EstateItemEditor item={selectedItem} index={selectedIndex} … />}
    </div>
    <div className="border-t px-4 py-3 flex justify-end">
      <button onClick={()=>setSelectedItemId(null)}>닫기</button>
    </div>
  </DialogContent>
</Dialog>
```

### 5.3 EstateItemEditor 내부 — 헤더 타이틀 중복 제거

`EstateItemHeader`에 `hideTitle?: boolean` prop 추가(또는 모달용 래퍼). 모달 안에서는 카테고리+번호 타이틀(EstateItemHeader.tsx:50-55)을 숨기고 칩·⚙️·삭제만 노출. DialogTitle이 카테고리를 표시하므로 중복 제거. **이는 EstateItemHeader의 유일한 인터페이스 변경** (optional prop, 기본값 false로 카드뷰 무영향 — 단 카드뷰는 폐기되므로 사실상 모달 전용).

### 5.3a 삭제 흐름 (E-2)

모달 헤더의 삭제 버튼(`estate-card-remove-${id}`, EstateItemHeader:89-100) 클릭 → `onRemove` → `handleRemove(index)` → 선택 행이 삭제 대상이면 `setSelectedItemId(null)` → **모달 자동 닫힘**. 인접 자동선택 없음. §23의2 동거주택 단일선택 자동해제(handleUpdate, PropertyValuationForm:362-368)는 삭제와 무관·보존.

### 5.4 R-4 중첩 Dialog (Pre-Do anchor 실측 대상)

CategoryChangeDialog(`@/components/ui/dialog` Dialog, CategoryChangeDialog.tsx:99)를 편집 모달 안에서 열면 Base UI Dialog 2중 중첩. Pre-Do anchor에서 포커스 트랩·z-index·esc 닫힘 우선순위 실측. **충돌 시 대안**: 카테고리 변경을 편집 모달 내 인라인 패널(별도 Dialog 아님)로 전환.

---

## 6. 추가 흐름 (간주분류 prefill 보존)

기존 PropertyValuationForm 추가 패널(416-488)을 유지하되, 추가 완료 후 모달 자동 오픈을 더한다.

```
[+ 상속재산 추가] 클릭
   → 추가 패널 펼침
   → (상속세) 간주분류 4종 선택 (none/보험§8/신탁§9/퇴직금§10) — pendingDeemed
   → 재산 종류 선택 (DEEMED_ALLOWED_CATEGORIES[pendingDeemed] 또는 GIFT_CATEGORIES)
   → handleAdd(category):
        newItem = { id, category, name:"", ...(deemed prefill) }
        onChange([...items, newItem])
        setSelectedItemId(newItem.id)   ← E-1: 추가 직후 자동 모달 오픈
```

추가 picker는 기존 그대로(상속인의 2단계 picker와 달리 자산은 1단계 카테고리 선택). 간주분류 prefill 로직(PropertyValuationForm:349-351) 보존.

---

## 7. PresumedInheritanceInput 테이블·모달

추정상속재산은 최대 4건(카테고리당 1건). 더 단순:

```
┌────────────────────┬──────────┬──────────────┬──────────┬────────┐
│ 종류               │ 임계     │      가산액  │ 분할     │  편집  │
├────────────────────┼──────────┼──────────────┼──────────┼────────┤
│ 부동산…처분        │ 임계 발동│  108,000,000 │ [협의]   │  ✎     │
│ 예금 인출액        │ 임계 발동│  100,000,000 │ —        │  ✎     │
└────────────────────┴──────────┴──────────────┴──────────┴────────┘
                 추정상속재산 합계 가산액 ──────→  208,000,000
```

- 추가 버튼: 기존 4종 버튼(PresumedInheritanceInput:133-154) 유지 — 이미 있는 카테고리는 disabled(`✓`). picker 불필요.
- 모달 안: 기존 카드 본체(3입력 그리드 200-232 + 결과 미리보기 235-243 + HeirAllocationInput 246-253) 그대로.
- 행 클릭 → 모달, 추가 직후 모달 자동 오픈.

---

## 8. testid 표 (보존 / 신규 / 소멸)

| testid | 현재 위치 | 전환 후 | 의존 E2E |
|---|---|---|---|
| `estate-card-header-${id}` | EstateItemHeader:46 | **보존** (모달 안) | chip-advanced-sync 등 |
| `estate-card-remove-${id}` | EstateItemHeader:92 | **보존** (모달 안) | category-change |
| `estate-advanced-panel-toggle-${id}` | EstateItemHeader:74 | **보존** (모달 안) | chip-advanced-sync |
| `estate-card-shell-${id}` | EstateItemCardShell:68 | **소멸** (collapse 폐기) | chip-advanced-sync·chip-ux-fixes·asset-toggle-visibility·deemed-category (재작성) |
| `estate-card-collapse-toggle-${id}` | EstateItemCardShell:79 | **소멸** | (위 4 spec) |
| `estate-table-row-${id}` | — | **신규** (행) | 신규 spec |
| `estate-edit-dialog` | — | **신규** (모달 컨테이너) | 신규 spec |
| `presumed-table-row-${id}` | — | **신규** | 신규 spec |

**원칙**: 칩·고급옵션·삭제 testid는 모달 안으로 옮겨도 **그대로 보존** → 해당 spec은 "행 클릭→모달 오픈" 1줄만 추가. shell/collapse testid 의존 4 spec만 셀렉터 재작성.

---

## 9. 접근성

| 요소 | 처리 |
|---|---|
| 테이블 컨테이너 | `role="group" aria-label="상속재산 목록"` (HeirTableView:259 동형) |
| 행 | `role="button" tabIndex={0}` + Enter/Space 핸들러 + `aria-label="{자산명} 편집"` |
| 모달 | Base UI Dialog 기본 포커스 트랩·esc 닫힘. DialogTitle로 `aria-labelledby` 자동 |
| 평가액 미입력 | muted 텍스트 + 행은 클릭 가능 유지 |
| 다크모드 | 기존 dark: 클래스 패턴 유지 |

---

## 10. 케이스 시각 표 (카테고리 × 행 표시)

| category | 종류 셀 | 본체(모달) | 분류·옵션 배지 예 |
|---|---|---|---|
| real_estate_land | 🏔 토지 | RealEstate | 일반 · (담보 ON 시)§14 |
| real_estate_building | 🏢 상업용 건물 | RealEstate | 일반 |
| real_estate_apartment | 🏠 주택 | RealEstate | 일반 · 동거주택 |
| cash | 💵 현금 | Simple | 일반 |
| financial | 🏦 예금·펀드·채권·공제금 | Simple | 일반 · 금융재산 공제✓ |
| deposit (상속 전용) | 🔑 전세보증금 반환채권 | Deposit | 일반 |
| other | 📦 기타 재산 | Simple | 일반 |

> 협의분할·영농·가업 배지는 상속인 존재·해당 분류 입력 시 추가(resolveChips 4~6번 칩). 증여 모드는 분류·옵션 배지 전부 미표시.

---

## 11. UI 8지점 매핑

| # | 지점 | 변경 |
|---|---|---|
| ① 폼 타입 | 무변경 |
| ② initial | 무변경 |
| ③ normalize | 무변경 |
| ④ API 변환 | 무변경 |
| ⑤ UI 위젯 | **변경** — 테이블·모달·신설 2~3파일·EstateItemHeader hideTitle prop |
| ⑥ 사이드바 합계 | 무변경 (값 동일) |
| ⑦ 결과 카드 | 무변경 (데이터 구조 불변) |
| ⑧ Validation | 무변경 |
