# Plan — 자산 카드 → 요약 테이블 + 편집 모달 전환

> 작성일: 2026-06-10
> 범위: UI 전용 (엔진·타입·API·Validation 무변경)
> 선행 사례: 상속인·수유자 구성 테이블 전환 (PR #68 — 커밋 `43244bb` + `abd83d9`,
>   `docs/02-design/features/inheritance-heir-table-view.plan.md`)
> 사용자 확정 (2026-06-10):
>   - 전환 대상 그룹: **상속재산 목록(PropertyValuationForm) + 추정상속재산 §15(PresumedInheritanceInput)**
>   - 주식·지분(StockValuationForm) **제외**
>   - 증여세: **상속세만 우선, 증여는 공유 컴포넌트라 자동 따라감**
>
> 참조 파일 (실측 — file:line):
> - `components/calc/PropertyValuationForm.tsx` (494줄: `ItemEditor` 135-279, 메인 329-494, `VariantBody` 30-44, `handleAdd/Update/Remove` 343-374)
> - `components/calc/inheritance/estate-card/EstateItemCardShell.tsx` (104줄: collapse 44·73-94, `forceExpand` 48-56, body hidden 95-101)
> - `components/calc/inheritance/estate-card/EstateItemHeader.tsx` (104줄: 칩+옵션 버튼 69-88+삭제 89-100)
> - `components/calc/inheritance/estate-card/chip-config.ts` (`resolveChips` 113-259, `countNonDefaultOptions` 265-282, `cycleSection22` 288-294)
> - `components/calc/inheritance/Step1Estate.tsx` (101줄: 3그룹 — Property 55, Stock 73, Presumed 92)
> - `components/calc/inheritance/PresumedInheritanceInput.tsx` (269줄: 카테고리당 1건 103-104, 카드 168-255)
> - `components/calc/gift-tax-form-shared.tsx:397` (`PropertyValuationForm` mode="gift" 사용처)
> - `components/calc/HeirTableView.tsx` (286줄) · `components/calc/HeirComposition.tsx` (350줄) — 선행 사례 구현체

---

## 1. 배경 및 목표

현재 상속재산·추정상속재산은 **세로 카드 나열**이다 (첨부 이미지: 주택1, 예금·펀드·채권·공제금2 …). 자산이 5건 이상이면 `collapseEnabled`(EstateItemCardShell:73 `totalAssetCount >= 5`)로 접기가 들어가지만, 펼친 카드는 소재지·시가·감정가·기준시가·임대보증금·저당권·고급옵션까지 길어 전체 구성을 한눈에 파악하기 어렵다.

**목표**: 상속인 구성과 동일하게 **조회(전체 파악)와 편집(상세 수정)을 분리**한 테이블 + Dialog 모달 구조로 전환:
- 전체 자산을 요약 테이블로 즉시 파악 (종류·자산명·평가액·분류·옵션 배지)
- 행 클릭 → Dialog 모달 오픈 → 기존 카드 본체(`ItemEditor` body) 그대로 편집
- 자산이 많아도 스크롤 폭주 없음 (행 1줄 = 자산 1건)

**선행 사례와의 동질성**: HeirComposition은 `HeirTableView`(요약 행) + `Dialog`(편집 모달) + 2단계 추가 picker로 구성된다. 본 작업은 **동일 3-요소 구조**를 자산에 적용한다.

**의도적 trade-off — 주식 그룹 비대칭**: 사용자 확정으로 주식·지분(StockValuationForm) 그룹은 카드 나열을 유지한다. 결과적으로 Step1 한 화면에 상속재산·추정상속재산(테이블) ↔ 주식(카드)이 혼재해 **시각적 비대칭**이 발생한다. 이는 주식 평가가 평가조서 갑지·V2 정식평가로 본체가 훨씬 복잡해 테이블 요약 행으로 압축하기 어렵기 때문이며, 의도된 단계적 도입이다(주식은 후속 별도 검토 대상). 세 그룹은 이미 `CollapsibleEstateGroup`(Step1Estate)으로 시각 구획되어 있어 혼재 위화감은 완화된다.

---

## 2. 자산 카드 ≠ 상속인 — 본질적 차이 5가지 (설계 난이도의 핵심)

선행 상속인 전환과 달리, 자산 카드는 다음 5가지가 추가로 복잡하다. 본 계획의 설계 결정은 모두 이 차이를 흡수하기 위한 것이다.

| # | 차이 | 상속인 | 자산 카드 | 본 계획의 처리 |
|---|---|---|---|---|
| D-1 | 본체 입력 분기 | 단일 `HeirEditor` 폼 | 카테고리별 `VariantBody` 3종 (`EstateBodyRealEstate`/`Deposit`/`Simple`, PropertyValuationForm:30-44) | 모달 안에서 기존 `VariantBody` 그대로 재사용 (§5) |
| D-2 | 인터랙티브 헤더 칩 | 없음 (배지는 read-only) | 칩 클릭 → 인라인 펼침(분류·분할·영농·가업) 또는 토글(§22·담보·최대주주) (`resolveChips` 113-259) | 칩 인터랙션은 **모달 안에서만** 유지. 테이블 행은 칩 **상태를 read-only 배지**로 재표시 (§3·§4) |
| D-3 | 고급옵션 패널 | 없음 | `EstateItemAdvancedPanel` + ⚙️ 배지 카운트 (`countNonDefaultOptions` 265-282) | 모달 안에서 기존대로 재사용 (§5) |
| D-4 | 카테고리 변경 Dialog | 없음 | `CategoryChangeDialog` (이미 Dialog 사용 중, PropertyValuationForm:266-276) | 모달 안에서 중첩 Dialog 또는 모달 헤더 ⋮ 메뉴로 유지 (§5·리스크 R-4) |
| D-5 | 상속·증여 공유 | 별도 컴포넌트(증여 무영향) | `PropertyValuationForm` mode prop 공유 (gift-tax-form-shared.tsx:397) | 증여 **자동 따라감**. 증여는 `resolveChips`가 평가액 칩만 반환(chip-config.ts:128) → 행 컬럼 자동 단순화 (§7) |

> **추가 차이 D-6 (E2E 회귀 — §8 별도):** 상속인은 기존 spec이 없어 신규 spec만 추가했으나, 자산 카드는 기존 E2E 8개가 `estate-card-*` testid에 직접 의존한다. 이것이 본 작업 **최대 작업량·리스크**다.

---

## 3. 범위 — 엔진 무변경 명시

본 작업은 **순수 UI 표시 레이어 작업**이다. 아래는 변경하지 않는다.

| 구분 | 변경 여부 | 근거 |
|---|---|---|
| `lib/tax-engine/types/inheritance-gift.types.ts` (`EstateItem`·`PresumedInheritanceItem`) | **무변경** | 기존 필드로 모든 표시값 파생 |
| `lib/tax-engine/inheritance-gift-common.ts`, `presumed-inheritance.ts` | **무변경** | `evaluatePresumedItem` 등 그대로 import |
| `lib/calc/inheritance-tax-api.ts`, `gift-tax-api.ts` | **무변경** | API 변환 불영향 |
| `lib/calc/inheritance-validate.ts`, `gift-validate.ts` | **무변경** | 검증 로직 불영향 |
| `lib/calc/estate-item-valuation.ts` (`computeEffectiveValuation`) | **무변경** | 행 평가액 컬럼에 그대로 재사용 |
| `lib/calc/financial-deduction-resolver.ts`, `asset-toggle-visibility.ts` | **무변경** | `resolveChips`가 호출 — 행 배지에도 동일 재사용 |
| `components/calc/inheritance/Step1Estate.tsx` | **무변경 (선행 사례 정정 #16 동형)** | `PropertyValuationForm`·`PresumedInheritanceInput` public props 유지 → 내부만 교체. 호출부(55·92) 그대로 |
| `components/calc/gift-tax-form-shared.tsx` | **무변경** | `PropertyValuationForm` props 동일 → 증여 자동 따라감 |
| `components/calc/inheritance/estate-card/variants/*` (`EstateBodyRealEstate`/`Deposit`/`Simple`) | **무변경** | 모달 안에서 그대로 재사용 |
| `components/calc/inheritance/EstateChipInlineExpand.tsx`, `EstateItemAdvancedPanel.tsx`, `CategoryChangeDialog.tsx` | **무변경(내부)** | 모달 안에서 재사용. 호출 위치만 카드→모달로 이동 |
| `StockValuationForm.tsx` (주식·지분) | **무변경 — 범위 외** | 사용자 확정 제외. Step1Estate의 주식 그룹은 기존 카드 나열 유지 |

**변경/신설 대상 파일**:

| 파일 | 변경 | 내용 |
|---|---|---|
| `components/calc/PropertyValuationForm.tsx` | 내부 리팩터 | 카드 나열 → 테이블 + Dialog 모달 + 추가 패널. public props 유지 |
| `components/calc/EstateItemTableView.tsx` | **신설** | 요약 테이블 — 행 렌더 + 컬럼 배지 derive (`resolveChips` read-only 재사용) |
| `components/calc/EstateItemEditor.tsx` | **신설(분리)** | 기존 `ItemEditor` body 로직(칩 헤더 + VariantBody + ChipInlineExpand + AdvancedPanel + CategoryChangeDialog) 추출 — 모달 내용물 |
| `components/calc/PresumedInheritanceInput.tsx` | 내부 리팩터 | 카드 나열 → 테이블 + Dialog 모달 + 추가 버튼. public props 유지 |
| `components/calc/PresumedInheritanceTableView.tsx` | **신설(택1)** | 추정상속재산 요약 행 (또는 PresumedInheritanceInput 내부 inline — §9에서 줄 수로 결정) |
| `components/calc/inheritance/estate-card/EstateItemHeader.tsx` | **prop 추가** | `hideTitle?: boolean` — 모달 안에서 카테고리+번호 타이틀(:50-55) 숨김(DialogTitle 중복 제거). 기본값 false. index prop은 hideTitle 시 미사용(:53 단일 사용처) |
| `components/calc/inheritance/estate-card/EstateItemCardShell.tsx` · `useCollapseState.ts` | **삭제** | 전환 후 미참조(R-3). EstateItemHeader는 모달 재사용 → 유지 |

---

## 4. 테이블 행 컬럼 설계 — 행 배지는 `resolveChips` 단일 출처 재사용

상속인 테이블(HeirTableView)은 6컬럼(종류·관계·이름·생년월일·특이사항·편집). 자산은 데이터 성격이 달라 다음 컬럼으로 한다.

### 4.1 PropertyValuationForm 테이블 컬럼

| 컬럼 | 표시값 | 파생 출처 (single-source) | 정렬 |
|---|---|---|---|
| 종류 | 아이콘 + 카테고리 라벨 (예: 🏠 주택) | `CATEGORY_ICONS`/`CATEGORY_LABELS` (PropertyValuationForm:70-88) | 좌 |
| 자산명 | `name.trim() || CATEGORY_LABELS[cat]` (id 노출 금지 — `feedback_no_internal_id_in_result`) | item.name | 좌 |
| 평가액 | `computeEffectiveValuation(item)` (0이면 "미입력") | `lib/calc/estate-item-valuation.ts` | **우 (`text-right font-mono tabular-nums`)** — `amount-column-align` 스킬 |
| 분류·옵션 | resolveChips 결과 중 `estimated-value` 제외한 칩(분류·금융공제·분할·영농·가업·담보·세대생략 등)을 **read-only 배지**로 표시 | `resolveChips({item, mode, heirsCount})` (chip-config.ts:113) — label·mark·tone만 사용, isExpandable/isToggle 무시 | 좌 (flex-wrap) |
| 편집 | ✎ 힌트 + ⚙️ 옵션 배지 카운트(`countNonDefaultOptions > 0` 시) | countNonDefaultOptions (265) | 우 |

**핵심 원칙 (UI 이중 진실 회피 — `feedback_ui_engine_dual_truth_avoidance`)**: 행의 분류·옵션 배지는 별도 derive 함수를 만들지 않고 **기존 `resolveChips`를 그대로 호출**해 평가액 칩만 제외(또는 평가액은 전용 컬럼으로, 나머지는 배지 컬럼으로 분리)한다. 모달 안 칩과 테이블 행 배지가 **동일 함수에서 도출**되므로 표시 불일치가 원천 차단된다. 행에서는 `onChipClick` 미연결(read-only), 모달에서는 인터랙티브.

> 증여세(mode="gift")는 `resolveChips`가 평가액 칩만 반환(chip-config.ts:128) → 분류·옵션 배지 컬럼이 자동으로 비고, 행이 종류·자산명·평가액·편집 4컬럼으로 단순화된다. 별도 분기 코드 불필요.

### 4.2 PresumedInheritanceInput 테이블 컬럼 (4종 카테고리, 카테고리당 1건)

추정상속재산은 최대 4건(real_estate·deposit·other_asset·financial_debt, PresumedInheritanceInput:103-104 카테고리당 1건)이라 테이블 이점이 작다. 단 사용자가 범위에 포함했으므로 동일 패턴 적용하되 더 단순하게 한다.

| 컬럼 | 표시값 | 파생 출처 |
|---|---|---|
| 종류 | 카테고리 라벨 (예: 부동산 및 부동산권리 처분) | `CATEGORY_META[cat].label` (PresumedInheritanceInput:38-91) |
| 임계 | "임계 발동"/"미발동" 배지 | `evaluatePresumedItem(it).thresholdTriggered` (166) |
| 가산액 | `evaluatePresumedItem(it).addedAmount` | presumed-inheritance 엔진 | **우 정렬** |
| 분할 | 협의분할 입력 여부 배지 | `it.heirAllocations` 유무 |
| 편집 | ✎ | — |

모달 안에는 기존 카드 본체(3입력 그리드 + 결과 미리보기 + HeirAllocationInput, PresumedInheritanceInput:200-253) 그대로.

---

## 5. 편집 모달 구조 — 기존 `ItemEditor` body 재사용 + collapse 제거

### 5.1 PropertyValuationForm 모달

선행 사례(HeirComposition:308-345)와 동형:

```tsx
<Dialog open={selectedItemId !== null} onOpenChange={(open) => { if (!open) setSelectedItemId(null); }}>
  <DialogContent className="sm:max-w-lg w-full p-0" showCloseButton={false}>
    <DialogHeader className="px-4 pt-4 pb-0">
      <DialogTitle>{CATEGORY_LABELS[selectedItem.category]} 편집</DialogTitle>
    </DialogHeader>
    <div className="max-h-[80vh] overflow-y-auto px-4 pb-4 pt-3">
      {selectedItem && (
        <EstateItemEditor
          item={selectedItem} index={selectedIndex}
          mode={mode} heirs={heirs} valuationDate={valuationDate}
          onUpdate={(updated) => handleUpdate(selectedIndex, updated)}
          onRemove={() => handleRemove(selectedIndex)}
        />
      )}
    </div>
    <div className="border-t px-4 py-3 flex justify-end">
      <button onClick={() => setSelectedItemId(null)}>닫기</button>
    </div>
  </DialogContent>
</Dialog>
```

### 5.2 `EstateItemEditor` = 기존 `ItemEditor` body 발췌

신설 `EstateItemEditor`는 기존 `ItemEditor`(PropertyValuationForm:135-279)에서 **카드 외곽(`EstateItemCardShell`)만 벗기고** 내용물을 그대로 옮긴다:

| 옮길 요소 | 기존 위치 | 모달 안 처리 |
|---|---|---|
| 헤더 칩 (인터랙티브) | `EstateItemHeader` chips (204-217) | **유지** — 모달 안에서 칩 클릭 → 인라인 펼침/토글 그대로. ⚙️ 옵션 버튼·삭제 버튼도 모달 헤더 영역에 유지. **단 `EstateItemHeader`의 `categoryLabel {index+1}` 타이틀부(EstateItemHeader.tsx:52-54)는 DialogTitle("{카테고리} 편집")과 중복 → 모달에서는 헤더의 타이틀부를 숨기거나(prop 추가) DialogTitle 하나로 일원화. 칩·⚙️·삭제만 노출** |
| VariantBody | 221-228 | 그대로 |
| CorporateNonBusinessAssetsSection | 231-233 | 그대로 |
| EstateChipInlineExpand | 239-247 | 그대로 (칩 펼침 패널) |
| EstateItemAdvancedPanel | 253-261 | 그대로 (⚙️ 고급옵션) |
| CategoryChangeDialog | 266-276 | 중첩 Dialog 또는 ⋮ 메뉴 (리스크 R-4) |
| `EstateItemCardShell` (collapse) | 199-264 | **제거** — 모달이 곧 펼침 상태. `collapseEnabled`·`forceExpand`·`useCollapseState` 로컬 상태 불필요 |
| local state (`inlineExpandedKey`·`advancedOpen`·`forceExpandKey`·`categoryDialogOpen`) | 139-144 | `forceExpandKey` 제거(collapse 연동 신호였음, RM-6), 나머지 모달 내부 유지 |

**collapse 제거 영향**: `EstateItemCardShell`/`useCollapseState`/`forceExpand` 메커니즘(RM-6)은 카드 접힘 전용이므로 모달 구조에서는 전부 불필요해진다. 단 **PropertyValuationForm이 더 이상 EstateItemCardShell을 호출하지 않으면 estate-card-shell·estate-card-collapse-toggle testid가 사라짐** → E2E 회귀(§8 직결).

### 5.3 모달 자동 오픈 (선행 E-1 동형)
- `handleAdd` 완료 후 신규 item id를 `selectedItemId`에 set → Dialog 자동 오픈 → 사용자가 빈 자산을 바로 채움 (추가→선택→입력 반복 비용 완화)
- 삭제 시 선택 중이던 행이면 `setSelectedItemId(null)` → 모달 자동 닫힘 (E-2 동형)

---

## 6. 케이스 매트릭스 — 카테고리 × 컬럼 표시 × edge

### 6.1 PropertyValuationForm 카테고리별 행 표시

| # | category | 종류 컬럼 | 본체(모달) | 평가액 출처 | 비고 |
|---|---|---|---|---|---|
| 1 | real_estate_land (토지) | 🏔 토지 | EstateBodyRealEstate | 개별공시지가/감정/시가 | §14 담보 토글 가능 |
| 2 | real_estate_building (상업용 건물) | 🏢 상업용 건물 | EstateBodyRealEstate | 기준시가/감정/시가 | 임대보증금·저당권 |
| 3 | real_estate_apartment (주택) | 🏠 주택 | EstateBodyRealEstate | 주택공시가격/감정/시가 | 동거주택 §23의2 |
| 4 | cash (현금) | 💵 현금 | EstateBodySimple | marketValue | — |
| 5 | financial (예금·펀드·채권·공제금) | 🏦 … | EstateBodySimple | marketValue | §22 금융재산공제 |
| 6 | deposit (전세보증금 반환채권) | 🔑 … | EstateBodyDeposit | 보증금 | 상속세 전용(증여 미노출) |
| 7 | other (기타 재산) | 📦 기타 재산 | EstateBodySimple | marketValue | — |

### 6.2 Edge 케이스

| # | 시나리오 | 처리 |
|---|---|---|
| E-1 | 추가 직후 신규 행 자동 선택 | `handleAdd` 후 신규 id를 `selectedItemId`에 set → Dialog 자동 오픈 (간주분류 prefilled는 PropertyValuationForm:349-351 유지) |
| E-2 | 삭제 후 selectedItemId | 삭제 행이 선택 중이면 `setSelectedItemId(null)` → 모달 닫힘. 인접 자동선택 없음. **§23의2 동거주택 단일선택 자동해제(PropertyValuationForm:362-368)는 `handleUpdate`에 보존** |
| E-3 | items 0개 | 테이블 미표시, "+ 상속재산 추가" 버튼만 (기존 479-488 동형) |
| E-4 | 자산명 미입력 | `name.trim() || CATEGORY_LABELS[cat]` — prop-id 노출 금지(`feedback_no_internal_id_in_result`, grep 자가점검) |
| E-5 | 평가액 미입력 | 평가액 컬럼 "미입력"(muted) — `resolveChips`의 `평가액 미입력`(chip-config.ts:120) 라벨과 일치 |
| E-6 | 한 번에 하나의 행만 편집 | `selectedItemId: string \| null` 단일 상태 (복수 편집 없음) |
| E-7 | collapse 5건 임계 | **제거** — 테이블은 항상 전체 행 표시, `totalAssetCount >= 5` collapse 개념 폐기. `estate-step-collapsible-groups`의 **그룹 단위** collapse(CollapsibleEstateGroup, Step1Estate)는 무관·유지 |
| E-8 | 증여세 모드 | `resolveChips`가 평가액만 반환 → 행이 4컬럼으로 자동 단순화. deposit 카테고리 추가 버튼 미노출(GIFT_CATEGORIES, PropertyValuationForm:93-100) 그대로 |
| E-9 | 협의분할/금융공제/영농/가업 칩 클릭 | 테이블 행에서는 **비활성(read-only 배지)**. 변경하려면 행 클릭 → 모달 안 칩에서 인터랙션 |
| E-10 | 카테고리 변경(CategoryChangeDialog) | 모달 안에서 수행. 중첩 Dialog 동작 검증 필요(R-4) |

---

## 7. 증여세 자동 따라감 — 분기 코드 0

`PropertyValuationForm`은 `gift-tax-form-shared.tsx:397`에서 `mode="gift"`로 호출된다. 내부를 테이블로 교체하면 증여세도 동일 컴포넌트라 **자동 전환**된다. 추가 작업 없음. 단 검증은 필요:
- 증여 행 컬럼: 종류·자산명·평가액·편집 (분류/옵션 배지 컬럼 비어 자동 단순화)
- 증여 모달: 칩 헤더에 평가액 칩만, 고급옵션 패널(mode==="inheritance" 가드, PropertyValuationForm:253) 미렌더 → 모달 내용이 VariantBody 중심으로 단순
- E2E: `selective-print-gift.spec.ts` 등 증여 경로 회귀 확인 (§8)

---

## 8. E2E 영향 — 최대 리스크 (상속인 전환에 없던 작업)

기존 E2E **8개**가 `estate-card-*` testid·카드 헤더/칩/collapse 구조에 직접 의존한다(+ 증여 회귀용 `selective-print-gift` 1개 = 영향 spec 총 9개). 테이블 전환 시 이 testid들이 **카드→모달 안으로 이동**하거나 **사라진다(collapse)**. 각 spec을 "행 클릭 → 모달 오픈 → 동일 testid 접근"으로 마이그레이션해야 한다.

실측(grep `estate-card-shell|estate-card-collapse`):

| spec | 의존 구조 | shell/collapse 직접 의존 | 마이그레이션 |
|---|---|---|---|
| `estate-card-chip-advanced-sync.spec.ts` | 칩 ↔ ⚙️ 고급옵션 동기화 + shell | **2건** | 행 클릭 → 모달 안 칩·패널. shell→모달 컨테이너 |
| `estate-chip-ux-fixes.spec.ts` | 칩 인라인 펼침 + shell | **1건** | 행 클릭 → 모달 안 칩 |
| `asset-toggle-visibility-precision.spec.ts` | 칩 가시성(default/hidden) + shell | **1건** | 행 클릭 → 모달 안 칩 노출 |
| `deemed-category-toggle-visibility.spec.ts` | 간주분류 칩 + shell | **1건** | 행 클릭 → 모달 |
| `estate-card-category-change.spec.ts` | ⋮ 메뉴·CategoryChangeDialog (shell 0) | 0건 | 행 클릭 → 모달 → ⋮ 메뉴 |
| `inheritance-valuation-display-name.spec.ts` | 자산명·평가액 표시 (shell 0) | 0건 | **테이블 행에서 직접 검증** (모달 불필요) |
| `estate-asset-input-fieldcard.spec.ts` | 자산 본체 입력 필드 (shell 0) | 0건 | 행 클릭 → 모달 안 입력 |
| `estate-step-collapsible-groups.spec.ts` | **그룹** collapse(CollapsibleEstateGroup) (shell 0) | 0건 | 자산-카드 collapse와 무관·유지. 그룹 내부가 테이블이 되므로 행 수 검증부만 확인 |
| `selective-print-gift.spec.ts` | 증여 자산 입력 → 결과 출력 | 0건 | 증여 입력 경로를 모달로 |

> **shell/collapse testid(`estate-card-shell-*`·`estate-card-collapse-toggle-*`) 직접 의존 = 4 spec**(chip-advanced-sync·chip-ux-fixes·asset-toggle-visibility·deemed-category). collapse 폐기로 이 testid가 소멸하므로 이 4개는 셀렉터 재작성 필수. 나머지 5개는 헤더 칩·자산명·입력 필드 의존이라 행 클릭→모달로 경로만 추가하면 testid 보존 가능.

**전략**:
1. testid 보존 정책 — 모달 안으로 옮겨도 `estate-card-header-${id}`·`estate-card-remove-${id}`·`estate-advanced-panel-toggle-${id}` 등 **기존 testid를 그대로 유지**해 spec 변경 최소화. 신규는 `estate-table-row-${id}`(행)·`estate-edit-dialog`(모달) 추가.
2. 사라지는 testid — `estate-card-shell-${id}`·`estate-card-collapse-toggle-${id}`는 collapse 폐기로 소멸. 이를 참조하는 spec은 행/모달 검증으로 재작성.
3. **회귀 판정 기준** (`feedback_e2e_preexisting_failures`): baseline 대조 — 전환 전 전체 E2E 결과를 먼저 기록하고, 전환 후 신규 실패만 카운트. 사전 존재 실패(~23건)와 구분.
4. 신규 spec `estate-asset-table-view.spec.ts` — 행 클릭→모달, 추가→자동오픈, 삭제, 증여 회귀(상속인 TV-1~4 패턴 차용).

> 차단 validation은 추가하지 않으므로 `feedback_blocking_validation_full_e2e_regression`(전 세목 회귀)는 비해당. UI 표시 레이어만 변경.

---

## 9. 파일 분할 계획 (800줄 정책)

`PropertyValuationForm.tsx` 현재 494줄. 테이블 + 모달 + 추가 패널 + 기존 ItemEditor 분리 후:

```
components/calc/
├── PropertyValuationForm.tsx     # 오케스트레이터 — items 상태·handleAdd/Update/Remove·
│                                  # 테이블 + Dialog 모달 + 추가 패널 조립. selectedItemId 상태.
│                                  # 예상 ~280줄 (494 − ItemEditor body ~145 + 테이블/모달 조립 ~100)
│                                  # computeEffectiveValuation·DEEMED_ALLOWED_CATEGORIES re-export 보존
├── EstateItemEditor.tsx          # [신설] 기존 ItemEditor body — 칩 헤더+VariantBody+ChipInlineExpand+
│                                  # AdvancedPanel+CategoryChangeDialog. 예상 ~200줄
├── EstateItemTableView.tsx       # [신설] 요약 테이블 — 행 렌더+컬럼 배지(resolveChips read-only).
│                                  # 예상 ~180줄
└── (삭제) inheritance/estate-card/EstateItemCardShell.tsx · useCollapseState.ts
                                   # R-3: 전환 후 미참조(StockValuationForm 미사용). grep 0 확인 후 삭제.
                                   # EstateItemHeader.tsx는 모달서 재사용 → 유지
```

`PresumedInheritanceInput.tsx` 현재 269줄. 테이블+모달 추가해도 카드 본체가 단순(3입력)하므로:
- 옵션 A: 내부 inline 테이블+모달 (파일 1개 유지, ~350줄 예상 — 800줄 내)
- 옵션 B: `PresumedInheritanceTableView.tsx` 분리
- → Do 단계에서 줄 수 실측 후 결정. 350줄 예상이면 옵션 A.

**export re-export 패턴**(`feedback_800line_split_export_preservation`): `computeEffectiveValuation`·`DEEMED_ALLOWED_CATEGORIES`·`DEEMED_FILTER_NOTE`는 PropertyValuationForm에서 re-export 중(59·114) → 분리 후에도 100% 보존해 import 무변경. unused import는 `--fix` 함정(CLAUDE.md) 회피 위해 수동 정리.

---

## 10. 완료 정의 — UI 8지점 (대부분 무변경)

| # | 지점 | 위치 | 본 작업 |
|---|---|---|---|
| ① | 폼 상태 타입 | `EstateItem`·`PresumedInheritanceItem` | **무변경** |
| ② | initial value | — | **무변경** |
| ③ | normalize fallback | — | **무변경** |
| ④ | API 변환 | `inheritance-tax-api.ts`·`gift-tax-api.ts` | **무변경** |
| ⑤ | UI 입력 위젯 | PropertyValuationForm·PresumedInheritanceInput 리팩터 + 신설 2~3 파일 | **변경** — 본 작업 핵심 |
| ⑥ | 사이드바 합계 | `computeInheritanceSummary`/`sumEstateItemsValuation` | **무변경** (값 동일, 입력 방식만 변경) |
| ⑦ | 결과 카드 | `InheritanceResultView`·별지 부표 | **무변경** (EstateItem 데이터 구조·필드 불변 → 결과 산식·표시 불변. 논리적 자명) |
| ⑧ | Validation | `inheritance-validate.ts`·`gift-validate.ts` | **무변경** (필드 불변 → 검증 불영향) |

추가 DoD:
- [ ] `npx tsc --noEmit` 0건
- [ ] `npx vitest run __tests__/tax-engine/inheritance-gift/` 통과 (엔진 무변경 → 0 회귀 예상)
- [ ] **전환 전 전체 E2E baseline 기록** → 전환 후 신규 실패만 판정 (§8)
- [ ] estate-card-* 기존 8 spec 마이그레이션 (testid 보존 우선)
- [ ] 신규 `estate-asset-table-view.spec.ts` (행 클릭→모달·추가→자동오픈·삭제·증여 회귀)
- [ ] 800줄 정책: 분리 후 각 파일 ≤800줄
- [ ] prop-id·presumed-id 결과/테이블 미노출 (grep 자가점검)
- [ ] 금액 컬럼 정렬: 평가액·가산액 `text-right font-mono tabular-nums` (`amount-column-align`)

---

## 11. 비범위

- 엔진·타입·API·Validation 변경
- 주식·지분(StockValuationForm) 테이블 전환 — 사용자 확정 제외 (평가조서 갑지·V2 정식평가 복잡)
- `EstateItem`·`PresumedInheritanceItem` 필드 추가·제거
- `VariantBody`·`EstateChipInlineExpand`·`EstateItemAdvancedPanel`·`CategoryChangeDialog` **내부 로직** 변경 (재사용만)
- 그룹 단위 collapse(`CollapsibleEstateGroup`, Step1Estate) 변경 — 자산-카드 collapse와 무관, 유지
- 증여세 마법사 별도 분기 코드 (공유 컴포넌트 자동 따라감)

**죽은 코드 처리 (R-3)**: 전환 후 `EstateItemCardShell.tsx`·`useCollapseState.ts`는 미참조(StockValuationForm 미사용 실측 확인). Do 단계에서 **삭제**한다 — 보존 시 죽은 코드 잔존. `EstateItemHeader.tsx`는 모달 안에서 재사용하므로 **유지**. 삭제 직전 `grep EstateItemCardShell|useCollapseState`로 잔여 import 0 재확인.

---

## 12. 리스크

| ID | 리스크 | 가능성 | 대응 |
|---|---|---|---|
| R-1 | 기존 estate-card-* E2E 8개 회귀 | **높음** | testid 보존(§8 전략 1) + baseline 대조 판정. 본 작업 최대 공수 |
| R-2 | 칩 인터랙션을 행에서 read-only로 옮길 때 dual-truth 발생 | 중 | `resolveChips` 단일 호출, 행은 onChipClick 미연결. 별도 derive 함수 금지(`feedback_ui_engine_dual_truth_avoidance`) |
| R-3 | collapse(EstateItemCardShell·useCollapseState·forceExpand RM-6) 제거 후 죽은 코드 | 중 | **실측(grep): `EstateItemCardShell` 사용처는 PropertyValuationForm 단독** — StockValuationForm·기타 0건. 전환 후 `EstateItemCardShell`·`useCollapseState`는 미참조 죽은 코드가 됨 → Do 단계에서 삭제 안전(StockValuationForm 영향 0 확인됨). `EstateItemHeader`는 모달 안에서 재사용하므로 보존. 삭제 전 grep으로 잔여 import 0 재확인 |
| R-4 | 편집 모달(Dialog) 안 CategoryChangeDialog = **Dialog 2중 중첩 확정** | 중 | **실측: CategoryChangeDialog.tsx:18-23·99 `@/components/ui/dialog` Dialog 사용** → 모달 안에서 열면 Base UI Dialog 중첩. 포커스 트랩·z-index 충돌 가능. Pre-Do anchor에서 중첩 동작 실측. 충돌 시 카테고리 변경을 편집 모달 헤더 ⋮ 메뉴 **인라인 패널**로 대체 |
| R-5 | 증여세 자동 따라감이 의도치 않게 증여 UX 변경 | 중 | 증여 경로 E2E(selective-print-gift) 회귀 + 브라우저 수동 확인 |
| R-6 | PropertyValuationForm 분리 시 re-export 누락 → import 깨짐 | 중 | computeEffectiveValuation·DEEMED_* re-export 100% 보존. tsc 0건으로 검증 |
| R-7 | 800줄 초과 | 중 | 처음부터 3파일 분리(§9). Do 전 줄 수 추정 |

---

## 13. 롤백 계획

`PropertyValuationForm`·`PresumedInheritanceInput`의 public props를 유지하고 **내부만 교체**하므로 `Step1Estate.tsx`·`gift-tax-form-shared.tsx`는 무변경. 롤백은 **커밋 단위 `git revert`**:
1. 테이블 전환 커밋(들) revert → 카드 나열 복원
2. 신설 `EstateItemTableView`·`EstateItemEditor`(·`PresumedInheritanceTableView`) 함께 revert
3. `EstateItem[]`·`PresumedInheritanceItem[]` 데이터는 `FormState` 스토어에 보존 → UI 롤백 후 데이터 손실 없음

worktree(`feat/asset-card-table-modal`)에서 작업 → master 영향 없음. (다른 세션이 master 작업 중)

---

## 14. 일정 (PDCA)

| 단계 | 내용 | 선행 |
|---|---|---|
| Plan | 본 문서 + 13단계 자가검증 루프 | — |
| Design | `estate-asset-table-view.ui.design.md` — 컬럼 픽셀 명세·모달 레이아웃·testid 표 | Plan 확정 |
| Pre-Do anchor | E2E baseline 기록 + CategoryChangeDialog 중첩 실측(R-4) | Design |
| Do | 3파일 분리 + 테이블/모달 + PresumedInheritanceInput 전환 (시퀀셜) | Pre-Do |
| Check | tsc + vitest + estate-card-* spec 마이그레이션 + 신규 spec + 브라우저 | Do |
| Act | 회귀·누락 환류 | Check |

---

## 15. Do 단계 실행 결과 + 계획 대비 deviation (2026-06-10)

### 15.1 구현 산출물
- 신설: `EstateItemEditor.tsx`(모달 내용물), `EstateItemTableView.tsx`(요약 테이블), `estate-card/estate-category-meta.ts`(CATEGORY 라벨·아이콘·GIFT_CATEGORIES 단일출처 — **계획엔 module-private였으나 행+모달 공유 위해 추출**, deviation #2)
- 변경: `PropertyValuationForm.tsx`(테이블+모달 오케스트레이터), `PresumedInheritanceInput.tsx`(테이블+모달), `EstateItemHeader.tsx`(`hideTitle` prop)
- 삭제: `EstateItemCardShell.tsx`, `useCollapseState.ts` (R-3), **+ `__tests__/inheritance/estate-card-shell-collapse.test.tsx`**(collapse 폐기 → 테스트 폐기. 계획 §9·§11은 컴포넌트 2개만 명시 — deviation #1)

### 15.2 검증 결과
- `npx tsc --noEmit`: **0 error**
- `npx eslint`(변경 7파일): **0**
- vitest 엔진+핸들러(`__tests__/tax-engine/inheritance-gift/` + handle-chip-click): **158/158 통과** (엔진 0 회귀)
- 컴포넌트 단위 `property-valuation-form-heir-allocation.test.tsx`: 행 클릭→모달 패턴으로 마이그레이션, **3/3 통과**
- **신규 E2E `estate-asset-table-view.spec.ts`: 3/3 통과** (AT-1 모달 생애주기·AT-2 증여 4컬럼·AT-3 추정상속재산)
- estate-card-* 마이그레이션 배치: **18/19 통과** (전환 전 baseline 16 실패 → 1)

### 15.3 deviation #3 — 공유 E2E 헬퍼 (계획 §8 미반영) + PR #68 heir-modal 사전 존재 충돌
실측 결과 **PR #68(상속인 테이블+모달, 본 브랜치 이전 머지)이 `addHeir` 후 상속인 편집 모달을 자동 오픈(E-1)**. 이로 인해:
- 다수 spec의 "다음" 클릭이 모달 오버레이에 막힘(사전 존재 실패).
- 단 **상속인 주민번호(RRN)는 그 편집 모달 안에서 입력**해야 하고, 상속세 calc은 RRN 필수(`inheritance-validate.ts:341`). → `addHeir`가 모달을 닫으면 RRN 입력 spec이 깨지고, 안 닫으면 "다음"이 막히는 딜레마.

해결(공유 헬퍼 `e2e/_helpers/tax-flow.ts`):
- `addHeir`: **모달 닫기 안 함**(RRN 입력 spec 보호 — master 동작 보존). 2단계 picker만 유지.
- `closeHeirEditModal(page)`: **신규** — 모달 닫고 진행할 때 명시 호출(자산 spec은 addHeir 직후, RRN spec은 RRN 입력 후 호출).
- `addLandAsset`: 자산 추가 후 편집 모달 자동 오픈 → 입력 후 자산 모달 닫기(+`keepModalOpen` 옵션). `fillAndVerify`로 보충평가 값 커밋 보장.

### 15.4 E2E 검증 결과 (자산 관련 spec)
**23/24 통과** (전환 전 baseline 16 실패 → 1):

| spec | 결과 |
|---|---|
| `estate-asset-table-view`(신규) | **3/3** (AT-1 모달 생애주기·AT-2 증여 4컬럼·AT-3 추정상속재산) |
| `estate-card-chip-advanced-sync` | 3/3 |
| `estate-card-category-change` | 4/4 (중첩 Dialog R-4 정상 — ⋮→카테고리 변경 Dialog) |
| `estate-chip-ux-fixes` | 2/3 (항목2 잔존) |
| `asset-toggle-visibility-precision` | 3/3 |
| `deemed-category-toggle-visibility` | 3/3 |
| `estate-asset-input-fieldcard` | 2/2 |
| `estate-step-collapsible-groups` | 2/2 |
| `inheritance-valuation-display-name` | **1/1** (RRN→calc까지 정상 — 모달 통한 계산 검증) |

### 15.5 PR #68 heir-modal E2E 마이그레이션 (RRN sweep) — 완료
PR #68(상속인 테이블+모달, 본 브랜치 이전 머지)이 전체 상속 E2E의 heir-interaction을 깨뜨린 것을 본 작업에서 함께 정리:
- **`addHeir` 중앙화**: 모달 안 주민번호 자동 입력(상속세 calc 필수) + 모달 닫기. `residentNumber`(생년월일·성별 의존 케이스)·`keepModalOpen`(영리법인 토글·대습·관계변경 등 모달 안 속성 편집) 옵션.
- **heir RRN fill 44개 전부 이전**: 기본값 39개 삭제(addHeir 자동) + 비기본값 5개(exemption-heir-allocation·decedent-info·decedent-address) addHeir 인자로.
- **모달 안 속성 편집 spec 수정**: change-heir-relation·corporate-shareholder-heir-dropdown(이름)·heir-allocation-nonprofit(영리법인 토글)·section27-substitute(대습 토글) → keepModalOpen + closeHeirEditModal. prior-gift-corporate-tax inline 자산 → shared addLandAsset.

**검증 결과**:
- **전체 상속 E2E: 89 passed, 1 skipped, 0 failed** (20.5분)
- **전체 vitest: 6,887 passed, 14 skipped, 1 todo, 0 failed** (478 파일)
- 자산 E2E 23/24 · tsc 0 · lint 0

### 15.6 잔존 1건 (본 작업 무관)
- **`estate-chip-ux-fixes` 항목2**(협의분할 첫 상속인 전액 자동배분): 이름 없는 상속인에 `buildInitialHeirAllocations` 빈 배분 → 분배금액 미렌더. 자동배분 로직(`createChipClickHandler`·`buildInitialHeirAllocations`·`HeirAllocationInput`)은 **본 작업 무변경**(모달로 위치만 이동, AT-1이 valuation 300M 정상 입증). baseline에서는 heir 단계에서 실패해 본 assertion 도달조차 못 함. 항목1·항목3은 복구(0/3→2/3).

→ 회귀 판정(`feedback_e2e_preexisting_failures`): **신규 기능 spec 3/3 + 상속 E2E 89/89 + vitest 6,887/6,887**. 잔존 항목2는 자동배분 데이터 흐름 사전 존재 엣지(자산 카드·RRN 무관).
