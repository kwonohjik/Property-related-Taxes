# estate-card-followup Phase 2 — 후속 PR 계획서

> **Feature ID**: `estate-card-followup-phase2`
> **작성일**: 2026-05-28
> **선행 PR**:
>   - `8d18f15` — 자산 카드 압축 (헤더 칩 + ⚙️ 패널)
>   - `5e5bb0b` — 후속 작업 핵심 (valuation 분리 + chip-major-shareholder + collapse Shell)
> **선행 Plan**: [`estate-card-followup.plan.md`](./estate-card-followup.plan.md) (v5)
> **레이어**: UI 전용 + 일부 lib 모듈. 엔진/스토어/Zod/API/Validation 변경 0

## 0. 정정 이력

| # | 일시 | 사유 |
|---|---|---|
| v1 | 2026-05-28 | 최초 작성 |
| v2 | 2026-05-28 | **1차 자가 검토 (F-P2-1~5·O-P2-1~8·X-P2-1~4·I-P2-1~4)** — AssetCategory 9종 정정·ItemEditor 427줄·exhaustive switch·DEEMED 의존성·PR-D 분리 |
| v3 | 2026-05-28 | **2차 자가 검토 (F-P2v2-1~3·O-P2v2-1~3·X-P2v2-1)** — forceExpand incrementing key 패턴·variant 분할 트리거·stock 본체 처리 분리·자동 펼침 정책 정합 |
| v4 | 2026-05-28 | **Plan↔Design 통합 비교 (INT-1~8)** — handleChipClick 공통화·EstateChipInlineExpand effectiveValuation·loss 라벨·⋮ 위치·Playwright 설치·useState wrapper 영향 |
| v5 | 2026-05-28 | **UI Visual 검토 반영 (UV2-1~5·UV2-O1~7·UV2-X1~2·UV2-I1~2)** — RealEstate 임대보증금 분기·§22 override 라벨 분기·Dialog 라디오 ●·testid 매트릭스 완전화·a11y·chip 정렬 |

---

## 0. 잔여 작업 인벤토리

`5e5bb0b` 머지 후 남은 후속 작업 6건:

| RM# | 작업 | 우선순위 | 사유 |
|---|---|---|---|
| RM-1 | **variant 본체 분리** (EstateBodySimple/RealEstate/Deposit) | ★★ Critical | PropertyValuationForm.tsx 761줄 (800줄 정책 39줄 여유) |
| RM-2 | **EstateCommonAttributesSection wrapper 재구성** | ★ High | 주식 카드 UX 일관성 — 현재 직렬 5섹션 그대로 |
| RM-3 | **CategoryChangeDialog + ⋮ 메뉴** (DropdownMenu 설치 동반) | Mid | 사용자 워크플로 — 카테고리 변경 미지원 (삭제 후 재추가만) |
| RM-4 | **Playwright e2e 2건** (a11y + 칩↔⚙️ 동기) | ★ High | 선행 Plan §8 anchor #1·#2 잔여 |
| RM-5 | **print anchor + 화면 인쇄 검증** | Mid | 선행 Plan FU-7 잔여 |
| RM-6 | **collapse 자동 해제** (Shell.onCollapseChange → PropertyValuationForm 연결) | Mid | 선행 PR에 콜백 시그니처만, 호출자 미연결 |

### 0.0 AssetCategory 9종 매트릭스 [F-P2-1·O-P2-3 정정]

실측 `lib/tax-engine/types/inheritance-gift.types.ts:69~77`:

| # | category | PropertyValuationForm 처리 | variant 매핑 |
|---|---|---|---|
| 1 | `real_estate_land` | ✅ | REAL_ESTATE |
| 2 | `real_estate_building` | ✅ | REAL_ESTATE |
| 3 | `real_estate_apartment` | ✅ | REAL_ESTATE |
| 4 | `listed_stock` | ❌ (StockValuationForm 별도) | — (PropertyValuationForm 호출 시 미정의 동작) |
| 5 | `unlisted_stock` | ❌ (StockValuationForm 별도) | — |
| 6 | `cash` | ✅ | SIMPLE |
| 7 | `financial` | ✅ | SIMPLE |
| 8 | `deposit` | ✅ | DEPOSIT |
| 9 | `other` | ✅ | SIMPLE |

→ **9 카테고리** (Plan v1의 "8 카테고리" 오기 정정).
→ stock 2종은 PropertyValuationForm.SupportedCategory에서 제외되어 있음 (`type SupportedCategory = Exclude<AssetCategory, "listed_stock" | "unlisted_stock">`). pickBodyVariant은 SupportedCategory 7종만 받도록 시그니처 제한 — `assertNever`로 exhaustive 강제 [I-P2-4].

**[F-P2v2-3 정정] PR-E의 stock 본체 처리**:
- `EstateCommonAttributesSection`은 stock 카드의 **공통 속성만** 처리 (5섹션). 본체 입력(가격·수량 등)은 `StockValuationForm`의 ListedStockEditor·UnlistedStockCard·UnlistedStockV2Card 내부.
- 따라서 PR-E는 본체 입력은 그대로 두고 wrapper 부분만 칩+⚙️로 재구성.
- pickBodyVariant은 PropertyValuationForm 전용 — stock 카드와 무관.

### 0.1 코드베이스 실측 (Pre-Plan)

| 파일 | 줄수 | 800줄 여유 |
|---|---|---|
| `components/calc/PropertyValuationForm.tsx` | **761** | **39** |
| `components/calc/inheritance/estate-card/chip-config.ts` | 273 | 527 |
| `components/calc/inheritance/estate-card/EstateChipInlineExpand.tsx` | 124 | 676 |
| `components/calc/inheritance/EstateCommonAttributesSection.tsx` | 193 | 607 |
| `components/calc/inheritance/estate-card/EstateItemCardShell.tsx` | ~80 | 720 |
| `components/calc/inheritance/estate-card/useCollapseState.ts` | ~55 | 745 |

**→ PropertyValuationForm.tsx 39줄 여유** — variant 분리(RM-1) 우선 진행 필요.

### 0.2 시간 산정 (총 11.3h)

| PR | 작업 | 예상 시간 |
|---|---|---|
| **PR-D** | RM-1 + RM-6 (variant 분리 + collapse 자동 해제) | 4.5h |
| **PR-E** | RM-2 + RM-5 (주식 카드 통합 + print) | 4h |
| **PR-F** | RM-3 (CategoryChangeDialog + DropdownMenu 설치) | 4.3h |
| **PR-G** | RM-4 (Playwright e2e 2건) | 1.5h |

PR-D 우선. PR-E/F는 PR-D 머지 후 병렬 가능. PR-G는 어느 시점이든 가능 (선행 PR만 의존).

---

## 1. PR-D — variant 본체 분리 + collapse 자동 해제 (RM-1·RM-6)

### 1.1 배경 [F-P2-3 정정]

- PropertyValuationForm.tsx 761줄 → 800줄 정책 39줄 여유
- ItemEditor 함수 **141~568 = 427줄** (실측, 선행 PR 이후)을 3 variant + helpers로 분리
- 선행 PR의 `EstateItemCardShell.onCollapseChange` 콜백을 PropertyValuationForm에서 활용 (⚙️ 클릭 시 collapse 자동 해제)

### 1.2 신규 파일 (8건)

```
components/calc/inheritance/estate-card/variants/
├── index.ts                       # pickBodyVariant + re-export (~30줄)
├── types.ts                       # VariantBodyProps + SupportedCategory re-export (~20줄)
├── EstateBodySimple.tsx           # cash/financial/other (~70줄) [F-P2-4 정정]
├── EstateBodyRealEstate.tsx       # real_estate 3종 + fishing 분기 + AddressSearch + StandardPriceInput + §14 (~280줄)
├── EstateBodyDeposit.tsx          # deposit (~50줄) [F-P2-4 정정]
└── EstateBodyHelpers.ts           # set·propertyKind·isFishing + assertNever (~90줄)

__tests__/inheritance/
└── estate-card-variant-split.test.tsx  # pickBodyVariant + variant 렌더 anchor (~150줄)
```

총 신규 8 파일, 합 ~720줄 (선행 추정 900에서 정정).

### 1.3 분리 정책 [I-P2-4·O-P2-3 정정]

- **본체 입력 위젯 100% 보존** — AddressSearch / StandardPriceInput / Vworld 자동조회 / fishing 분기 / addrValue / standardPricePerSqm local state
- 각 variant props 동일 시그니처 (선행 Design §4.1 VariantBodyProps)
- pickBodyVariant은 `variants/index.ts`에 위치 — helpers와 순환 의존 회피
- PropertyValuationForm.tsx 761줄 → **≤ 400줄** 목표 (실측 ~376줄 가능)
- **pickBodyVariant 시그니처는 `SupportedCategory` 입력**(9종 중 stock 2 제외) — exhaustive switch + `assertNever` 강제로 신규 카테고리 추가 시 컴파일 에러
- 800줄 미달성 시 [X-P2-1·F-P2v2-2 정정]:
  - PropertyValuationForm ≤ 400 미달성 시 (예: 450줄) — `ItemEditor` 자체를 별도 파일 `estate-card/ItemEditorShell.tsx`로 분리
  - REAL_ESTATE variant 단일 파일 280줄 초과 시 (예: 350줄+) — `EstateBodyRealEstateAddress.tsx` + `EstateBodyRealEstateValuation.tsx` 분할
  - 분할 트리거 임계값: **300줄 초과 시 검토**

### 1.4 RM-6 collapse 자동 해제

`EstateItemCardShell.onCollapseChange` 콜백을 PropertyValuationForm의 ItemEditor에서 활용:

```tsx
// ItemEditor 내부
const [collapsedExternal, setCollapsedExternal] = useState(false);

function handleToggleAdvanced() {
  // collapse 상태이면 자동 해제 (Design D2-O3)
  if (collapsedExternal) {
    // Shell에 unhide 신호 — Shell의 setCollapsed(false)는 외부 노출 안 함
    // 대안: Shell의 collapsed 상태를 props로 받아 외부 컨트롤
  }
  setAdvancedOpen((v) => !v);
}
```

**문제**: 현재 Shell의 setCollapsed는 외부 노출 안 됨 (props로 받지 않음). 세 가지 옵션 [X-P2-4 정정]:

| 옵션 | 설명 |
|---|---|
| (a) Shell의 collapsed를 props로 외부 제어 (controlled) | 호환성 깨짐 — useCollapseState 호출자가 Shell 외부로 이동 |
| (b) Shell에 `imperativeHandle`로 setCollapsed 노출 | useRef로 외부 컨트롤. 본 PR 권장 |
| (c) Shell이 onCollapseChange 콜백만 받고 자동 해제 신호용 별도 prop `forceExpand` 추가 | 가장 단순 |

→ **권장 (c)**: `forceExpand?: number` prop 추가 (incrementing key) — 매번 변경 시 Shell의 useEffect로 collapsed=false 설정.

```tsx
// 코드 예시 [X-P2-4·F-P2v2-1 정정 — incrementing key + useRef 첫-마운트 가드]
// ItemEditor 내부
const [forceExpandKey, setForceExpandKey] = useState(0);

function handleToggleAdvanced() {
  // collapse 상태이면 자동 해제 — Shell에 신호 (incrementing key)
  setForceExpandKey((k) => k + 1);
  setAdvancedOpen((v) => !v);
}

<EstateItemCardShell forceExpand={forceExpandKey} ... />

// Shell.tsx — useRef로 첫 마운트 제외, forceExpand 변경 시만 트리거
const firstMountRef = useRef(true);
useEffect(() => {
  if (firstMountRef.current) {
    firstMountRef.current = false;
    return;
  }
  if (forceExpand !== undefined) {
    setCollapsed(false);
  }
}, [forceExpand]);
```

→ useEffect → store 미러링 0건 ([[feedback_useeffect_store_mirror_forbidden]]): 본 useEffect는 부모→자식 신호 전파용이지 store에 쓰지 않음. 정책 예외.

### 1.5 Pre-Do anchor (PR-D)

- AN-D1: pickBodyVariant 매핑 매트릭스 (8 카테고리 × variant)
- AN-D2: variant별 본체 입력 위젯 노출 (AddressSearch·StandardPriceInput·시가·감정가) [UV2-1 정정]:
  - REAL_ESTATE land: 임대보증금 input **미노출** 검증
  - REAL_ESTATE apartment·building: 임대보증금 input 노출
  - SIMPLE cash·financial: 감정가 input 미노출 (showAppraisedValue=false)
  - SIMPLE other: 감정가 input 노출 (showAppraisedValue=true)
- AN-D3: fishing 분기 (AddressSearch 라벨 "선적지·어장 연안 검색")
- AN-D4: PropertyValuationForm.tsx ≤ 400줄
- AN-D5: collapse 상태에서 ⚙️ 클릭 시 자동 해제 [O-P2v2-1 정정]
  - Pre: setCollapsed(true) → data-collapsed="true"
  - Act: ⚙️ 옵션 버튼 click → forceExpand 신호
  - Post: data-collapsed="false" 자동 전환 + advanced 패널 노출
- AN-D6: variant 추출 후 기존 anchor 32건 그대로 PASS (선행 PR 회귀 0)

### 1.6 위험 매트릭스

| 위험 | 완화 |
|---|---|
| variant 추출 시 closure 의존(set·addrValue·standardPricePerSqm) 깨짐 | local state는 variant 내부 useState로 이동, props로 item·onUpdate·valuationDate 전달 |
| AddressSearch onChange의 비동기 closure(resolveSigunguCode) | EstateBodyRealEstate 안에 그대로 보존 |
| StandardPriceInput pricePerSqm local state 손실 | EstateBodyRealEstate 항상 마운트 (collapse는 외곽만 hidden) |
| fishing 분기 누락 | `isFishingAsset(item)` 헬퍼 명시 사용 |
| 800줄 미달성 시 정책 위반 | 변종 추출 후 wc -l 검증 + 미달성 시 sub-component 추가 |
| collapse 자동 해제 정책 충돌 | 옵션 (c) forceExpand props로 단순화 |

### 1.7 Definition of Done (PR-D)

- [ ] 신규 8 파일 합 ≤ 900줄
- [ ] PropertyValuationForm.tsx ≤ 400줄
- [ ] AN-D1~D6 anchor 모두 통과
- [ ] 기존 회귀 5462 → 5470+ PASS (회귀 0)
- [ ] typecheck 0 / lint 0 error
- [ ] testid `estate-body-variant-{simple|realestate|deposit}-{itemId}` 추가

---

## 2. PR-E — 주식 카드 통합 + print anchor (RM-2·RM-5)

### 2.1 배경

- `EstateCommonAttributesSection`은 주식 카드(상장·V1·V2)에서 5섹션 직렬 노출 중 → 헤더 칩 + ⚙️ 패턴 미적용
- 선행 PR(`5e5bb0b`)에서 chip-major-shareholder는 추가했으나 EstateCommonAttributesSection에서 호출 안 함 → 사실상 사용 0건
- print anchor 미작성 (선행 Plan FU-7)

### 2.2 EstateCommonAttributesSection 재구성

기존 (193줄):
- 영농 / 가업 / 법인 사업무관 / §22 default + hidden_expandable 펼침 / 협의분할 / 최대주주 토글

신규 wrapper 구조:
```tsx
export function EstateCommonAttributesSection({ item, onUpdate, mode, heirs, effectiveValuation }) {
  if (mode !== "inheritance") return null;
  const isStockV1Simple = ...; // 상장 OR 비상장 V1 simple
  const isStockV2Formal = ...; // 비상장 V2 formal

  return (
    <>
      <EstateItemHeader
        chips={resolveChips({
          item, mode,
          heirsCount: heirs?.length ?? 0,
          showMajorShareholderChip: isStockV1Simple, // V2는 false
        })}
        ...
      />
      <EstateChipInlineExpand ... />
      <EstateItemAdvancedPanel
        item={item}
        onUpdate={onUpdate}
        showSecuredClaimSubFields={false}
        // 신규: stock §22 override 노출 분기 (선행 Plan INT-8)
        showSection22Override={visibility.financialDeduction === "hidden_permanent"
          && item.isFinancialAssetForDeduction !== undefined}
      />
    </>
  );
}
```

### 2.3 §22 사용자 지정 override 노출 분기 (INT-8 반영)

`EstateItemAdvancedPanel`에 새 prop `showSection22Override?: boolean` 추가:
- `visibility.financialDeduction === "default"` 시 기존 동작 유지
- `visibility.financialDeduction === "hidden_permanent"` AND `isFinancialAssetForDeduction !== undefined` 시 신규 노출

기존 코드 변경 (EstateItemAdvancedPanel 167줄 내):
```tsx
{(visibility.financialDeduction === "default" || showSection22Override)
  && item.isFinancialAssetForDeduction !== undefined && (
  <div className="border-t ...">
    <FinancialDeductionChip item={item} onUpdate={onUpdate} />
  </div>
)}
```

### 2.4 print anchor

`__tests__/inheritance/estate-card-print.test.tsx`:
- collapse 상태에서 print 미디어 query 시뮬레이션 → body slot `display: block` 강제
- ⚙️ 버튼·삭제·collapse 토글 모두 `print:hidden`
- 칩 외곽선 강화 (선행 Visual §10)

### 2.5 e2e 기존 spec 호환 검증 (G1 잔여) [F-P2-5 정정]

선행 Plan G1 정정에서 명시한 e2e 2건:
- `e2e/inheritance-stock-financial-chip-absent.spec.ts`
- `e2e/inheritance-unlisted-v1-section22-toggle.spec.ts`

이 두 spec이 `MajorShareholderStockToggle` 텍스트 셀렉터를 사용. 본 PR-E에서 토글이 ⚙️ 패널 안으로 이동 → 텍스트 셀렉터는 ⚙️ 패널 열린 상태에서만 접근 가능.

**선행 Plan G1 "spec 무수정" vs 본 PR-E 갱신 가능성 — 양립 정책**:
- ⚙️ 자동 펼침 정책으로 spec 무수정 가능: PR-E에서 stock 카드 진입 시 ⚙️를 기본 펼친 상태로 렌더 → 기존 텍스트 셀렉터 접근 가능
- 또는: spec 진입 시점에 ⚙️ 옵션 버튼 click 1줄 추가 (최소 변경)

**검증 시나리오**:
1. 두 spec을 그대로 실행 (먼저 시도)
2. 실패 시 옵션 (i) 또는 (ii):
   - (i) `EstateCommonAttributesSection`의 stock 카드는 ⚙️ 기본 펼침 상태로 (advancedOpen 초기값 true)
   - (ii) spec에 `await page.getByTestId("estate-advanced-panel-toggle-{id}").click()` 1줄 추가

### 2.6 신규 파일 (3건) · 수정 파일 (3건)

```
__tests__/inheritance/
├── estate-card-print.test.tsx           # 신규
└── estate-card-stock-integration.test.tsx  # 신규 (EstateCommonAttributesSection wrapper anchor)

수정:
├── components/calc/inheritance/EstateCommonAttributesSection.tsx  # 193 → ~120줄
├── components/calc/inheritance/estate-card/EstateItemAdvancedPanel.tsx  # showSection22Override 추가
└── e2e/inheritance-stock-financial-chip-absent.spec.ts (필요 시)
└── e2e/inheritance-unlisted-v1-section22-toggle.spec.ts (필요 시)
```

### 2.7 Pre-Do anchor (PR-E)

- AN-E1: EstateCommonAttributesSection 상장 카드에서 chip-major-shareholder 노출 (가정: showMajorShareholderChip=true 분기)
- AN-E2: UnlistedStockV2Card 안 EstateCommonAttributesSection → chip-major-shareholder 미노출
- AN-E3: stock에서 isFinancialAssetForDeduction 사용자 지정 시 ⚙️ 안 FinancialDeductionChip 노출 (INT-8)
- AN-E4: 기존 e2e 2건 통과 (필요 시 spec 갱신)
- AN-E5: print 미디어 query 시 body slot 노출, 버튼 hidden

### 2.8 Definition of Done (PR-E)

- [ ] EstateCommonAttributesSection 193 → ≤ 150줄
- [ ] 신규 anchor 5건 (print 5 + stock integration 5 = ~10건)
- [ ] e2e 2건 PASS (수정 필요 시 갱신)
- [ ] 회귀 5470+ PASS (PR-D 기준)
- [ ] typecheck 0 / lint 0 error

---

## 3. PR-F — 카테고리 변경 Dialog + DropdownMenu 설치 (RM-3)

### 3.1 배경

- 자산 추가 후 카테고리 변경 미지원 (현재는 삭제 후 재추가)
- shadcn DropdownMenu 미설치 (선행 Plan Q8=a 결정)

### 3.2 신규 의존성

```bash
npx shadcn@latest add dropdown-menu
```

→ `components/ui/dropdown-menu.tsx` 신규 생성

### 3.3 신규 파일 (5건)

```
lib/calc/
├── category-change-policy.ts       # getCategoryGroup · pickPreservedFields (선행 Design §6.3)
└── deemed-category-policy.ts       # DEEMED_ALLOWED_CATEGORIES 분리 (INT-4)

components/calc/inheritance/estate-card/
├── EstateItemActionsMenu.tsx       # 헤더 ⋮ 메뉴
└── CategoryChangeDialog.tsx        # 호환 매트릭스 표 + 손실 필드 경고 + 확인

__tests__/inheritance/
└── category-change-policy.test.ts  # pickPreservedFields 매트릭스
```

### 3.4 EstateItemHeader 통합

기존 EstateItemHeader에 `onChangeCategory?: () => void` props 추가:
```tsx
<EstateItemActionsMenu
  itemId={item.id}
  onChangeCategory={() => setCategoryDialogOpen(true)}
  // 향후 추가 액션 (예: 복제) 확장 가능
/>
```

### 3.5 CategoryChangeDialog 동작

선행 Visual §4.2/4.3 정합:
- 그룹 내 변경: confirm 버튼 indigo, 손실 필드 표시 안 함
- 그룹 간 변경: confirm 버튼 rose, 손실 필드 amber 박스 + 매트릭스 표시
- `pickPreservedFields(item, newCategory)` 호출 → preserved 객체로 onUpdate

### 3.6 Pre-Do anchor (PR-F)

- AN-F1: getCategoryGroup 매핑 매트릭스 (8 카테고리 → 4 그룹)
- AN-F2: pickPreservedFields 그룹 내/간 매트릭스
  - real_estate_land → real_estate_apartment: 전 필드 보존
  - financial → real_estate_apartment: estateAddress·standardPrice·leaseDeposit·mortgage 손실
  - deposit → cash: leaseDeposit → marketValue 매핑
- AN-F3: DEEMED_ALLOWED_CATEGORIES 호환 시 deemedCategory 보존, 비호환 시 undefined
- AN-F4: heirAllocations·id 항상 보존
- AN-F5: ⋮ 메뉴 키보드 a11y (Tab/Enter/↑↓/Esc)
- AN-F6: Dialog 그룹 내/간 시각 분기 (rose vs indigo confirm)

### 3.7 결정 필요

| Q | 항목 | 옵션 | 권장 |
|---|---|---|---|
| Q10 | leaseDeposit → marketValue 매핑 | (a) 자동 매핑 / (b) 사용자 확인 후 매핑 | **(b)** — Dialog에서 안내 |
| Q11 | 카테고리 변경 후 visibility 재평가 | (a) 즉시 / (b) onUpdate 후 자동 (useMemo deps) | **(b)** — 기존 패턴 유지 |

### 3.8 위험 매트릭스

| 위험 | 완화 |
|---|---|
| shadcn dropdown-menu 추가 시 의존성 충돌 | npm install 후 build 검증 |
| pickPreservedFields가 비호환 필드 누락 | AN-F2 카테고리 변경 × 8 매트릭스 anchor |
| Dialog 외부 클릭 후 데이터 손실 위험 | shadcn Dialog 기본 Esc/외부 클릭 = 취소 (변경 0) |
| ⋮ 메뉴 키보드 트래핑 | shadcn DropdownMenu 기본 a11y |

### 3.9 Definition of Done (PR-F)

- [ ] shadcn dropdown-menu 설치
- [ ] 신규 5 파일 + 수정 2 파일
- [ ] AN-F1~F6 anchor 통과 (15건 이상)
- [ ] 회귀 5475+ PASS
- [ ] typecheck 0 / lint 0 error

---

## 4. PR-G — Playwright e2e 2건 (RM-4)

### 4.1 배경

선행 Plan §8 Anchor #1·#2 잔여 — 단위 anchor만 충족, e2e 미수행.

### 4.2 e2e #1 — 헤더 칩 a11y

`e2e/estate-card-a11y.spec.ts`:

```
시나리오:
1. 상속세 모드 진입 → financial 자산 1개 추가
2. Tab 키로 헤더 칩까지 포커스 이동 → focus-visible ring 표시
3. 분류 칩 포커스 → Enter → 인라인 펼침 패널 (aria-expanded=true)
4. Tab으로 라디오 4개 순회 → 보험금 선택 (Space)
5. Esc 또는 외부 클릭 → 패널 닫힘
6. 분류 칩 라벨 `[보험금 §8]` + amber tone
7. §22 칩 Space 3회 → 3-state 순환 (ON→OFF→기본)
8. ⚙️ 버튼 → 패널 펼침 → focus trap
```

### 4.3 e2e #2 — 칩↔⚙️ 상태 동기

`e2e/estate-card-chip-advanced-sync.spec.ts`:

```
시나리오:
1. financial 자산 (mode=inheritance, heirs 2)
2. ⚙️ 패널 안 FinancialDeductionChip(§22) OFF
3. ⚙️ 닫기 → 헤더 §22 칩 [§22 ✗] + violet 외곽 (isUserOverride)
4. 헤더 §22 칩 클릭 → 3-state 순환 검증
5. 분류 칩 → 보험금 선택 → 헤더 즉시 갱신
6. 협의분할 칩 → 인라인 펼침 → 빈 분할
7. 배우자 선택 + 금액 → [협의분할 ✓] sky
8. ⚙️ 옵션 N 배지 = countNonDefaultOptions 일치
```

### 4.4 Definition of Done (PR-G)

- [ ] e2e 2건 통과
- [ ] 기존 e2e 회귀 0
- [ ] CI 통합 (`npm run test:e2e`)

---

## 5. PR 의존성·머지 순서

```
[선행 PR 5e5bb0b 머지 완료]
         ↓
  ┌──────────────┐
  │     PR-D     │  variant 분리 + collapse 자동 해제 (4.5h)
  │   (필수 선행) │
  └──────┬───────┘
         ↓
   ┌─────────┬─────────┐
   ↓                   ↓
 PR-E (4h)          PR-F (4.3h)
 주식 통합 + print  Dialog + DropdownMenu
   병렬 가능          병렬 가능

   PR-G (1.5h) — 선행 PR만 의존, 어느 시점이든 가능
```

PR-D 머지 전까지 PR-E·F는 진행 차단 (PropertyValuationForm 충돌 위험).
PR-G는 선행 PR(`5e5bb0b`)만 의존하므로 PR-D 머지 전에도 가능 (별도 트랙).

---

## 6. 통합 자가 검증 (12단계)

| # | 단계 | 점검 항목 |
|---|---|---|
| 1 | 케이스 매트릭스 | PR-D variant × 카테고리 × fishing + PR-F 호환 매트릭스 |
| 2 | a11y | PR-G e2e + PR-F ⋮ 메뉴 키보드 |
| 3 | 인쇄/PDF | PR-E print anchor |
| 4 | 회귀 | 누적 5462 → 5500+ |
| 5 | 800줄 정책 | PR-D 핵심 — PropertyValuationForm ≤ 400 |
| 6 | 정책 매트릭스 | mirror-pattern·useEffect 금지·tone-static 준수 |
| 7 | tone 매핑 | rose 신규(최대주주) 일관성 (PR-E 통합 후) |
| 8 | variant 분기 | PR-D Simple/RealEstate/Deposit |
| 9 | testid 동결 | 선행 PR testid + 신규 추가만 |
| 10 | local state 손실 | PR-D variant 추출 시 addrValue 보존 검증 |
| 11 | PDF 호환 | PR-E print + 기존 InheritanceFilingForm 무관 (Plan G4) |
| 12 | 사용자 확인 | Q10·Q11 결정 |

---

## 7. 누적 영향

| 영역 | 선행 PR 누적 | 본 Phase 2 추가 |
|---|---|---|
| 신규 파일 | 6 (estate-card 5 + lib 1) | +**18** (PR-D 8 + PR-E 3 + PR-F 5 + PR-G 2) [X-P2-2] |
| 수정 파일 | 4 | +4 (PropertyValuationForm·EstateCommonAttributesSection·EstateItemAdvancedPanel·EstateItemHeader) |
| 신규 anchor | 22 | +30 (PR-D 6 + PR-E 10 + PR-F 14) |
| e2e | 0 | +2 (PR-G) |
| 회귀 | 5462 | → 5494 + 2 e2e |
| 시간 | 14h (선행) | +14.3h (Phase 2) |
| LOC 추가 | ~3000 | ~2500 |

---

## 8. 의사결정 요약

| Q | 항목 | 권장 |
|---|---|---|
| Q1~Q9 | 선행 Plan 권장값 채택 | 그대로 |
| Q10 | leaseDeposit → marketValue 매핑 | (b) 사용자 확인 |
| Q11 | 카테고리 변경 후 visibility | (b) onUpdate 후 자동 |
| Q12 (신규) | RM-6 collapse 자동 해제 구현 옵션 | (c) `forceExpand` props 단순화 |

---

## 8.5 추가 정책 [O-P2-1·O-P2-4·O-P2-5·O-P2-6·O-P2-8 정정]

### O-P2-1 — chip-major-shareholder 호출자 명시

- `EstateCommonAttributesSection`이 `EstateItemHeader`를 호출하며 `chips={resolveChips({...showMajorShareholderChip: isStockV1Simple})}` 전달
- `StockValuationForm`은 직접 chip-config 호출하지 않음 (`EstateCommonAttributesSection`을 거침)
- 호출자 통합: PR-E 핵심 작업

### O-P2-2 — shadcn dropdown-menu 설치 영향

- `npx shadcn@latest add dropdown-menu`
- 추가 의존성: `@radix-ui/react-dropdown-menu` (node_modules)
- 신규 파일: `components/ui/dropdown-menu.tsx` (shadcn 표준 컴포넌트)
- `app/globals.css`·`tailwind.config` 영향: 없음 (Radix는 CSS-in-JS 불필요)
- PR-F Pre-Do 작업: 설치 후 import 가능 확인 (`import { DropdownMenu } from "@/components/ui/dropdown-menu"`)

### O-P2-4 — 자가 검증 매트릭스 보강

§6 자가 검증에 추가:
- fishing 분기 × 카테고리 × 모드 매트릭스
- deemedCategory × 호환 카테고리 매트릭스
- heirs 수 × 협의분할 칩 상태 매트릭스

### O-P2-5 — PR-G e2e 범위

PR-G e2e는 financial 카드(SIMPLE variant)만 검증. stock 카드는 PR-E 머지 후 별도 트랙 또는 후속 e2e.

### O-P2-6 — DEEMED_ALLOWED_CATEGORIES 의존성 그래프

```
lib/calc/deemed-category-policy.ts (신규)
  ├── export DEEMED_ALLOWED_CATEGORIES
  └── export isDeemedCategoryCompatible(deemed, newCategory)
       ↑
components/calc/PropertyValuationForm.tsx
  └── import { DEEMED_ALLOWED_CATEGORIES } (기존 내부 정의 → import로 교체)
       ↑
lib/calc/category-change-policy.ts (PR-F 신규)
  └── pickPreservedFields가 isDeemedCategoryCompatible 사용
```

PropertyValuationForm.tsx의 기존 `DEEMED_ALLOWED_CATEGORIES` 상수(:118~126)는 백워드 호환 re-export 유지.

### O-P2-8 — 카테고리 변경 시 자산 인덱스

- PropertyValuationForm.items 배열에서 카테고리 변경한 자산의 인덱스는 유지 (정렬 변경 없음)
- 헤더 라벨(`{CATEGORY_LABELS[cat]} {index + 1}`)만 새 카테고리 라벨로 갱신
- 카테고리별 카운트(예: "예금·펀드·채권·공제금 1·2·3")는 변경 후 자동 재산정 — 추가 작업 불필요

## 8.55 UI Visual 검토 반영 (UV2-1~7·X1·X2·I1·I2)

### UV2-1 — EstateBodyRealEstate 임대보증금 분기

`showLeaseDeposit = real_estate_apartment OR real_estate_building OR deposit` 정합:
- real_estate_land: 임대보증금 입력 **미노출** (토지 자체는 임대 대상 아님)
- real_estate_building·apartment: 임대보증금 노출
- deposit: 임대보증금 = 자산본체 (DEPOSIT variant)

PR-D AN-D2 anchor에 land 카테고리에서 임대보증금 input 미렌더 검증 추가.

### UV2-2 — §22 override 라벨 카테고리별 분기

`FinancialDeductionChip`의 라벨은 `defaultEligible` 기반:
- cash (default=false): "공제 대상 [기본 제외]"
- financial (default=true): "공제 대상 [기본 적용]"
- stock visibility=hidden_permanent (default=true 후처리로 hidden): override 시 "공제 대상 [기본 적용]"

→ FinancialDeductionChip 컴포넌트 자체 분기 (선행 코드 보존). UI Visual ASCII 일관성 보장.

### UV2-3 — CategoryChangeDialog 라디오 단일 선택 정책

- 현재 카테고리는 "( ○ ) (현재)" 표시 (회색 배지 + 미선택 라디오)
- 새 선택은 "( ● )" (검은 점 채움)
- 두 항목 동시 ● 표시 금지

### UV2-4·UV2-X1 — testid 매트릭스 완전화

PR-D·E·F·G 신규 + 선행 PR 보존:

| testid | 출처 | PR-D | PR-E | PR-F | PR-G |
|---|---|---|---|---|---|
| `estate-card-shell-{itemId}` | 선행 (`5e5bb0b`) | 보존 | 보존 | 보존 | 검증 |
| `estate-card-collapse-toggle-{itemId}` | 선행 | 보존 | 보존 | 보존 | 검증 |
| `estate-advanced-panel-toggle-{itemId}` | 선행 (`8d18f15`) | 보존 | 보존 | 보존 | 검증 |
| `estate-body-variant-{kind}-{itemId}` | 신규 | ✅ | – | – | 활용 |
| `estate-card-actions-menu-{itemId}` | 신규 | – | – | ✅ | – |
| `category-change-dialog-{itemId}` | 신규 | – | – | ✅ | – |

기존 testid 변경 0 — 회귀 회피.

### UV2-5 — fishing 분기 ASCII 통합

PR-D Visual에 fishing 분기 ASCII 사례 1건 추가 (§1.2 통합).

### UV2-O1 — 카테고리 변경 후 자동 undefined 시각 안내

CategoryChangeDialog 손실 필드 표에:
- `deemedCategory` (insurance·trust·retirement 비호환 시)
- `farmingCategory` (visibility=hidden_permanent 변경 시)
- `familyBusinessCategory` (visibility=hidden_permanent 변경 시)

이 3종은 isDeemedCategoryCompatible / resolveAssetToggleVisibility 자동 호출로 결정.

### UV2-O2 — ⋮ DropdownMenu trigger a11y

```tsx
<DropdownMenuTrigger asChild>
  <button
    type="button"
    aria-label="자산 카드 더보기 메뉴"
    aria-haspopup="menu"
    data-testid={`estate-card-actions-menu-${itemId}`}
    ...
  >
    <MoreVertical className="h-3.5 w-3.5" aria-hidden />
  </button>
</DropdownMenuTrigger>
```

### UV2-O3·UV2-I1 — chip 정렬 우선순위 (좌→우)

선행 Plan §3.6 정합 + chip-major-shareholder 위치:

```
1. chip-estimated-value (항상 1번째)
2. chip-classification
3. chip-section22
4. chip-major-shareholder  ← §22 인접 (관련성 그루핑 UV2-I1)
5. chip-heir-allocation
6. chip-farming
7. chip-family-business
8. chip-secured-claim-14
```

### UV2-O4 — Dialog confirm 버튼 disabled

- 새 카테고리가 현재 카테고리와 동일 → confirm 버튼 `disabled` (`bg-gray-300 cursor-not-allowed`)
- 또는 라디오에서 현재 카테고리 자체 disabled

### UV2-O5 — 인쇄 시 CategoryChangeDialog

- shadcn Dialog는 modal — 인쇄 시 자동 닫힘 (브라우저 기본)
- 명시: `@media print { [data-testid^="category-change-dialog-"] { display: none !important; } }`

### UV2-O6·UV2-O7 — forceExpand 시각 + loss 0건

- collapse 토글 라벨: `collapsed ? "⬇️ 펼치기" : "⬆️ 접기"` — 상태 의존
- computeLossFields 결과 0건 → "전 필드 보존" emerald hint:
  ```
  ┌── ✓ 그룹 내 변경 — 전 필드 보존 ────────────┐
  │  자산명·평가액·소재지·기준시가 등 모두 유지 │
  └──────────────────────────────────────────────┘
  ```

### UV2-I2 — ⋮·⚙️·삭제 그루핑

헤더 우측 액션 영역 (좌→우):
```
[⋮ 더보기] [⚙️ 옵션 (N)] [삭제]
   부수      자주 사용     파괴 액션
   액션      (펼침 토글)    (rose)
```

⋮·⚙️ 간격: `gap-1` (밀착) — 액션 그루핑.
⚙️·삭제 간격: `gap-1` (밀착).

## 8.6 통합 정정 사항 [INT-1~8]

### INT-1 — handleChipClick 공통 helper
- 신규 파일: `components/calc/inheritance/estate-card/handleChipClick.ts`
- `createChipClickHandler({ item, onUpdate, setInlineExpandedKey })` factory
- PropertyValuationForm.ItemEditor + EstateCommonAttributesSection 양쪽 사용
- 코드 중복 제거 + useCallback 적용

### INT-2 — EstateChipInlineExpand effectiveValuation prop
- 선행 PR(`5e5bb0b`)의 EstateChipInlineExpand에 `effectiveValuation?: number` optional prop 추가
- 미전달 시 fallback: `computeEffectiveValuation(item)` (현재 동작)
- 호출자: PropertyValuationForm.ItemEditor + EstateCommonAttributesSection
- 변경 파일 수: +1 (선행 컴포넌트 수정)

### INT-3 — computeLossFields 한국어 라벨
- `LOSS_FIELD_LABELS` Record (Design D2-O1)
- CategoryChangeDialog에서 손실 필드 표시용

### INT-4 — ⋮ 메뉴 위치 (Header)
- 헤더 우측 액션 영역에서 `[⋮] [⚙️ 옵션] [삭제]` 순
- ⋮는 부수 액션이므로 좌측 (자주 사용되는 ⚙️·삭제는 우측 고정)

### INT-5 — EstateBodyHelpers isFishingAsset type guard
- `item is EstateItem & { farmingCategory: FishingFarmingCategory }` 반환 → TypeScript narrow

### INT-6 — Playwright 이미 설치
- e2e 폴더 존재 (`enter-key-navigation.spec.ts` 등) → 추가 설치 불필요

### INT-7 — DEEMED_ALLOWED_CATEGORIES re-export 일관성
- types.ts에는 SupportedCategory만, DEEMED_ALLOWED_CATEGORIES는 `lib/calc/deemed-category-policy.ts`
- PropertyValuationForm은 deemed-category-policy에서 import 후 backwards-compat re-export

### INT-8 — EstateCommonAttributesSection wrapper 클라이언트 컴포넌트
- 기존 코드 :1 "use client" 확인 — 신규 useState 영향 없음
- useState 2건(inlineExpandedKey + advancedOpen) + useMemo 2건(chips + advancedBadgeCount) 추가

## 9. 참조

- 선행 Plan: `docs/01-plan/estate-card-followup.plan.md` (v5)
- 선행 Design: `docs/02-design/features/estate-card-followup.design.md` (v4)
- 선행 Visual: `docs/02-design/features/estate-card-followup.ui.visual.md`
- 선행 PR: `8d18f15`, `5e5bb0b`
- 정책 메모리: [[components/calc/CLAUDE.md]] (800줄·tone·hideUnit) · [[feedback_useeffect_store_mirror_forbidden]] · [[feedback_browser_verify_with_playwright]] · [[mirror-pattern]] · [[print-only-css-toggle]] · [[feedback_11step_self_review_workflow]] · [[single-source-engine-helper]]
- 코드 실측: PropertyValuationForm.tsx 761줄 · chip-config.ts 273줄 · EstateChipInlineExpand.tsx 124줄 · EstateCommonAttributesSection.tsx 193줄
