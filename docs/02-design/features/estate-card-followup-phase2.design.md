# estate-card-followup Phase 2 — 설계 문서

> **Feature ID**: `estate-card-followup-phase2`
> **작성일**: 2026-05-28
> **참조 Plan**: [`estate-card-followup-phase2.plan.md`](../../01-plan/estate-card-followup-phase2.plan.md) (v3)
> **레이어**: ⑤ UI 위젯 + lib 모듈 분리. ① ~ ⑭ 중 13개 변경 0

## 0. 정정 이력

| # | 일시 | 사유 |
|---|---|---|
| v1 | 2026-05-28 | 최초 작성 |
| v2 | 2026-05-28 | **1차 자가 검토 (D-1~5·D-O1~6·D-X1~2)** — assertNever 위치·valuationDate·pickPreservedFields 분기 순서·handleChipClick 공통화 |
| v3 | 2026-05-28 | **2차 자가 검토 (D2-1~3·D2-O1~3·D2-X1)** — useCallback 추가·use client 검증·effectiveValuation prop 누적 영향·loss field 한국어 라벨 |

---

## 1. 케이스 인벤토리 (Mandatory)

### 1.1 PR-D variant × 7 카테고리 매트릭스

| # | category | variant | 본체 필드 |
|---|---|---|---|
| 1 | real_estate_land | REAL_ESTATE | AddressSearch + 시가 + 감정가 + StandardPriceInput(개별공시지가) + 저당권 + §14 |
| 2 | real_estate_building | REAL_ESTATE | + 임대보증금 + 기준시가 |
| 3 | real_estate_apartment | REAL_ESTATE | + 공동주택 기준시가 |
| 4 | cash | SIMPLE | 자산명 + 현금 금액 (감정가 미노출 — visibility 분기) |
| 5 | financial | SIMPLE | 자산명 + 잔액 또는 시가 (감정가 미노출) |
| 6 | other | SIMPLE | 자산명 + 시가 + 감정가 |
| 7 | deposit | DEPOSIT | 별칭 + 임대보증금(자산본체) + §14 |

stock 2종(listed_stock·unlisted_stock)은 PropertyValuationForm 미처리 → variant 미정의 (SupportedCategory exhaustive switch로 컴파일 차단).

### 1.2 PR-D RM-6 forceExpand 매트릭스

| 시나리오 | forceExpandKey | collapsed | advancedOpen |
|---|---|---|---|
| 초기 마운트 | 0 | (localStorage 복원) | false |
| collapse=true, ⚙️ 클릭 | 0 → 1 | true → **false** (자동 해제) | true |
| collapse=true, ⚙️ 다시 클릭 (펼친 상태에서) | 1 → 2 | false | false (토글) |
| collapse=false, ⚙️ 클릭 | 0 → 1 | false (변화 없음) | true |

### 1.3 PR-E EstateCommonAttributesSection × 모드·V1/V2 매트릭스

| 진입점 | mode | showMajorShareholderChip | 칩 노출 |
|---|---|---|---|
| EstateCommonAttributesSection (mode=gift) | gift | – | 미렌더 (return null) |
| ListedStockEditor (mode=inheritance) | inheritance | true | estimated·classification·heir-allocation·farming·family-business·major-shareholder |
| UnlistedStockCard V1 simple | inheritance | true | (상장과 동일) + visibility 따른 차이 |
| UnlistedStockCard V2 formal | inheritance | **false** | major-shareholder 칩 미노출 (카드 내부 자체 토글) |

### 1.4 PR-E §22 override 매트릭스 [INT-8]

| visibility.financialDeduction | isFinancialAssetForDeduction | ⚙️ 안 FinancialDeductionChip |
|---|---|---|
| default | undefined | 노출 (기본 동작) |
| default | true/false | 노출 + "기본값으로 되돌리기" 버튼 |
| hidden_expandable | – | hidden_expandable 펼침 안에 노출 (선행 동작) |
| **hidden_permanent (stock)** | undefined | 미노출 |
| **hidden_permanent (stock)** | **true/false** | **신규 노출** (override 표시) |

### 1.5 PR-F 카테고리 변경 매트릭스

| 현재 그룹 | 변경 가능 카테고리 | 손실 필드 |
|---|---|---|
| real_estate | real_estate 3종 그룹 내 | 없음 (전 필드 보존) |
| real_estate | 금융/단독/기타 그룹 간 | estateAddress·estateLatLng·standardPrice·leaseDeposit·mortgageAmount·§14 토글·deemedCategory(insurance·trust 외 비호환) |
| 금융 (cash/financial) | 그룹 내 | 없음 |
| 금융 | real_estate | 자동 필드 손실 0 (추가 입력만 필요) |
| 금융 | deposit | marketValue → leaseDeposit 매핑 (Q10 사용자 확인) |
| deposit | financial/cash | leaseDeposit → marketValue 매핑 |
| other | 모든 그룹 | appraisedValue 손실 (other 전용) |

---

## 2. 컴포넌트 트리

### 2.1 PR-D 컴포넌트 구조

```
PropertyValuationForm.tsx (≤ 400줄)
├── computeEffectiveValuation re-export (선행 PR)
├── ItemEditor (~80줄 wrapper)
│   ├── EstateItemCardShell (forceExpand 받음)
│   │   ├── header: EstateItemHeader
│   │   └── body:
│   │       ├── EstateChipInlineExpand
│   │       ├── Variant Body (pickBodyVariant)
│   │       │   ├── EstateBodySimple
│   │       │   ├── EstateBodyRealEstate (addrValue·standardPricePerSqm local state)
│   │       │   └── EstateBodyDeposit
│   │       └── EstateItemAdvancedPanel
│   └── CategoryButton (변경 없음)
└── PropertyValuationForm (export)

components/calc/inheritance/estate-card/variants/
├── index.ts (pickBodyVariant + re-export + assertNever)
├── types.ts (VariantBodyProps · SupportedCategory)
├── EstateBodyHelpers.ts (set·resolvePropertyKind·isFishingAsset · assertNever)
├── EstateBodySimple.tsx
├── EstateBodyRealEstate.tsx
└── EstateBodyDeposit.tsx
```

### 2.2 PR-E 컴포넌트 구조

```
EstateCommonAttributesSection.tsx (193 → ~120줄)
├── EstateItemHeader (선행 PR)
│   └── chips=resolveChips({...showMajorShareholderChip})
├── EstateChipInlineExpand (선행 PR)
└── EstateItemAdvancedPanel (선행 PR)
    └── showSection22Override?: boolean (신규 prop)

EstateItemAdvancedPanel.tsx (수정)
└── stock에서 isFinancialAssetForDeduction !== undefined 시 FinancialDeductionChip 노출 (INT-8)

__tests__/inheritance/
├── estate-card-print.test.tsx (신규)
└── estate-card-stock-integration.test.tsx (신규)

e2e (필요 시 갱신)
├── inheritance-stock-financial-chip-absent.spec.ts
└── inheritance-unlisted-v1-section22-toggle.spec.ts
```

### 2.3 PR-F 컴포넌트 구조

```
components/ui/dropdown-menu.tsx (shadcn 설치, 신규)

lib/calc/
├── category-change-policy.ts (신규)
│   ├── CategoryGroup type
│   ├── getCategoryGroup
│   └── pickPreservedFields
└── deemed-category-policy.ts (신규)
    ├── DEEMED_ALLOWED_CATEGORIES (PropertyValuationForm에서 분리)
    └── isDeemedCategoryCompatible

components/calc/inheritance/estate-card/
├── EstateItemActionsMenu.tsx (신규)
└── CategoryChangeDialog.tsx (신규)

EstateItemHeader.tsx (수정)
└── onChangeCategory?: () => void prop 추가
└── 헤더 액션 영역에 EstateItemActionsMenu 통합

__tests__/inheritance/
└── category-change-policy.test.ts (신규)
```

### 2.4 PR-G e2e 구조

```
e2e/
├── estate-card-a11y.spec.ts (신규)
└── estate-card-chip-advanced-sync.spec.ts (신규)
```

---

## 3. VariantBodyProps · pickBodyVariant 명세

### 3.1 types.ts

```ts
// components/calc/inheritance/estate-card/variants/types.ts
import type { AssetCategory, EstateItem } from "@/lib/tax-engine/types/inheritance-gift.types";

/** PropertyValuationForm에서 처리하는 카테고리 (stock 2종 제외) */
export type SupportedCategory = Exclude<
  AssetCategory,
  "listed_stock" | "unlisted_stock"
>;

export interface VariantBodyProps {
  item: EstateItem;
  onUpdate: (updated: EstateItem) => void;
  valuationDate?: string;
  showCollateralDeductToggle: boolean;
  mode: "inheritance" | "gift";
}
```

### 3.2 pickBodyVariant + assertNever

```ts
// components/calc/inheritance/estate-card/variants/index.ts
import type { ComponentType } from "react";
import { EstateBodySimple } from "./EstateBodySimple";
import { EstateBodyRealEstate } from "./EstateBodyRealEstate";
import { EstateBodyDeposit } from "./EstateBodyDeposit";
import type { SupportedCategory, VariantBodyProps } from "./types";

export { EstateBodySimple, EstateBodyRealEstate, EstateBodyDeposit };
export type { SupportedCategory, VariantBodyProps };

function assertNever(x: never): never {
  throw new Error(`Unhandled category: ${JSON.stringify(x)}`);
}

export function pickBodyVariant(
  category: SupportedCategory,
): ComponentType<VariantBodyProps> {
  // [D-X2 정정] exhaustive switch — 모든 case 처리 후 default 자체 불필요.
  // TypeScript는 모든 SupportedCategory 케이스가 return으로 종료되었음을 추론.
  // 신규 카테고리 추가 시 컴파일러가 "Function lacks ending return statement" 에러로 차단.
  switch (category) {
    case "real_estate_land":
    case "real_estate_building":
    case "real_estate_apartment":
      return EstateBodyRealEstate;
    case "deposit":
      return EstateBodyDeposit;
    case "cash":
    case "financial":
    case "other":
      return EstateBodySimple;
  }
  // 도달 불가 — TypeScript 추론을 위한 명시 (Plan I-P2-4 정합)
  return assertNever(category as never);
}
```

→ 신규 카테고리 추가 시 컴파일 에러로 매핑 누락 차단.

---

## 4. EstateBodyRealEstate 본체 명세

### 4.1 내부 구조

```tsx
export function EstateBodyRealEstate({
  item,
  onUpdate,
  valuationDate,
  showCollateralDeductToggle,
}: VariantBodyProps) {
  const set = makePatcher(item, onUpdate);
  const propertyKind = resolvePropertyKind(item.category);
  const isFishing = isFishingAsset(item);

  // local state는 본 컴포넌트 내부에 유지 (Shell collapse는 외곽 hidden — unmount 없음)
  const [addrValue, setAddrValue] = useState<AddressValue>(/* 초기화 */);
  const [standardPricePerSqm, setStandardPricePerSqm] = useState("");

  return (
    <div data-testid={`estate-body-variant-realestate-${item.id}`} className="space-y-3">
      <AddressSearch ... />
      <CurrencyInput label="별칭 (선택)" ... />
      <p className="text-xs text-indigo-600 ...">평가 우선순위 안내</p>
      <CurrencyInput label="시가 ..." ... />
      <CurrencyInput label="감정평가액" ... />
      <StandardPriceInput
        propertyKind={propertyKind}
        referenceDate={valuationDate}    // [D-2 정정] StandardPriceInput에 전달
        jibun={addrValue.jibun}
        ...
      />
      {/* apartment·building만 */}
      {(item.category === "real_estate_apartment" || item.category === "real_estate_building") && (
        <CurrencyInput label="임대보증금" ... />
      )}
      <CurrencyInput label="저당권 채권액" ... />
      {showCollateralDeductToggle && <ToggleCard tone="amber" ...>§14 자동공제</ToggleCard>}
    </div>
  );
}
```

### 4.2 fishing 분기 [Plan AN-FU1-3 정합]

```tsx
const isFishingLabel = isFishing
  ? "선적지·어장 연안 검색"
  : "소재지 검색";

const latLngKey = isFishing ? "fishingAnchorLatLng" : "estateLatLng";
const sigunguKey = isFishing ? "fishingAnchorSigunguCode" : "estateSigunguCode";
```

→ farmingCategory ∈ {fishing_vessel, fishing_right}이면 자동 분기.

---

## 5. EstateItemCardShell forceExpand 명세

### 5.1 props 확장

```tsx
export interface EstateItemCardShellProps {
  itemId: string;
  collapseEnabled: boolean;
  header: ReactNode;
  body: ReactNode;
  onCollapseChange?: (collapsed: boolean) => void;
  /** PR-D RM-6: incrementing key — 외부에서 collapse 자동 해제 신호 */
  forceExpand?: number;
}
```

### 5.2 useEffect 가드

```tsx
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

[[feedback_useeffect_store_mirror_forbidden]] 예외: 부모→자식 신호 전파 (store 미사용).

### 5.3 ItemEditor 통합

```tsx
function ItemEditor({...}) {
  const [forceExpandKey, setForceExpandKey] = useState(0);
  const [advancedOpen, setAdvancedOpen] = useState(false);

  function handleToggleAdvanced() {
    setForceExpandKey((k) => k + 1); // collapse 자동 해제 신호
    setAdvancedOpen((v) => !v);
  }

  return (
    <EstateItemCardShell
      itemId={item.id}
      collapseEnabled={totalAssetCount >= 5}
      forceExpand={forceExpandKey}
      header={<EstateItemHeader onToggleAdvanced={handleToggleAdvanced} ... />}
      body={...}
    />
  );
}
```

---

## 6. PR-E EstateCommonAttributesSection wrapper

### 6.1 재구성 후 구조

```tsx
export function EstateCommonAttributesSection({
  item, onUpdate, mode, heirs, effectiveValuation,
}: EstateCommonAttributesSectionProps) {
  if (mode !== "inheritance") return null;

  // V1 simple vs V2 formal 분기 (선행 코드 :116~118)
  const showMajorShareholderChip =
    item.category === "listed_stock" ||
    (item.category === "unlisted_stock" && resolveUnlistedDisplayMode(item) === "simple");

  const visibility = resolveAssetToggleVisibility(item);
  const heirsCount = heirs?.length ?? 0;

  const chips = useMemo(
    () => resolveChips({ item, mode, heirsCount, showMajorShareholderChip }),
    [item, mode, heirsCount, showMajorShareholderChip],
  );

  // 칩 핸들러 — PropertyValuationForm의 handleChipClick 동일
  const [inlineExpandedKey, setInlineExpandedKey] = useState<ChipKey | null>(null);
  const [advancedOpen, setAdvancedOpen] = useState(false);

  function handleChipClick(chip: ChipState) { /* major-shareholder + 기존 분기 */ }

  return (
    <>
      <EstateItemHeader chips={chips} ... />
      <EstateChipInlineExpand expandedKey={inlineExpandedKey} ... />
      {advancedOpen && (
        <EstateItemAdvancedPanel
          itemId={item.id}
          item={item}
          onUpdate={onUpdate}
          showSecuredClaimSubFields={false}
          showSection22Override={
            visibility.financialDeduction === "hidden_permanent" &&
            item.isFinancialAssetForDeduction !== undefined
          }
        />
      )}
    </>
  );
}
```

### 6.2 handleChipClick major-shareholder 분기

```ts
if (chip.key === "major-shareholder") {
  onUpdate({
    ...item,
    isSection22MajorShareholder: !item.isSection22MajorShareholder || undefined,
  });
  return;
}
```

### 6.3 EstateItemAdvancedPanel showSection22Override prop

```tsx
export interface EstateItemAdvancedPanelProps {
  itemId: string;
  item: EstateItem;
  onUpdate: (updated: EstateItem) => void;
  showSecuredClaimSubFields: boolean;
  /** PR-E INT-8: stock에서 사용자가 §22 override 설정 시 ⚙️에 FinancialDeductionChip 노출 */
  showSection22Override?: boolean;
}

// 내부 분기:
const showSection22Chip =
  (visibility.financialDeduction === "default" && item.isFinancialAssetForDeduction !== undefined) ||
  showSection22Override;
```

---

## 7. PR-F CategoryChangeDialog 명세

### 7.1 props

```tsx
export interface CategoryChangeDialogProps {
  open: boolean;
  item: EstateItem;
  onConfirm: (newCategory: SupportedCategory, preservedFields: Partial<EstateItem>) => void;
  onCancel: () => void;
}
```

### 7.2 내부 로직

```tsx
const [newCategory, setNewCategory] = useState<SupportedCategory>(item.category as SupportedCategory);

const oldGroup = getCategoryGroup(item.category);
const newGroup = getCategoryGroup(newCategory);
const isCrossGroup = oldGroup !== newGroup;

const preserved = useMemo(
  () => pickPreservedFields(item, newCategory),
  [item, newCategory],
);

const lossFields = isCrossGroup
  ? computeLossFields(item, preserved)
  : [];
```

### 7.3 시각 분기

| 영역 | 그룹 내 | 그룹 간 |
|---|---|---|
| 외곽 | shadcn Dialog | 동일 |
| 손실 필드 영역 | "전 필드 보존" 안내 | amber 박스 + 손실 필드 표 |
| confirm 버튼 | `bg-indigo-600` "변경 확인" | `bg-rose-600` "변경 확인 (필드 손실)" |
| 라디오 옵션 | 7 옵션 | 7 옵션 (현재 카테고리 표시) |

---

## 8. lib/calc/category-change-policy.ts 명세

```ts
import type { AssetCategory, EstateItem } from "@/lib/tax-engine/types/inheritance-gift.types";
import { isDeemedCategoryCompatible } from "./deemed-category-policy";
import type { SupportedCategory } from "@/components/calc/inheritance/estate-card/variants/types";

export type CategoryGroup = "real_estate" | "financial" | "deposit" | "other";

export function getCategoryGroup(category: AssetCategory): CategoryGroup {
  if (category.startsWith("real_estate_")) return "real_estate";
  if (category === "cash" || category === "financial") return "financial";
  if (category === "deposit") return "deposit";
  return "other"; // listed_stock·unlisted_stock는 변경 불가이지만 enum 완전성 위해 fallback
}

export interface PickPreservedFieldsParams {
  item: EstateItem;
  newCategory: SupportedCategory;
}

export function pickPreservedFields({ item, newCategory }: PickPreservedFieldsParams): Partial<EstateItem> {
  const oldGroup = getCategoryGroup(item.category);
  const newGroup = getCategoryGroup(newCategory);

  // [D-5 정정] 그룹 내 분기 먼저 (전 필드 보존)
  if (oldGroup === newGroup) {
    return { ...item, category: newCategory };
  }

  // 그룹 간 — 카테고리별 호환 필드만
  const base: Partial<EstateItem> = {
    id: item.id,
    name: item.name,
    heirAllocations: item.heirAllocations,
    category: newCategory,
  };

  // deemedCategory 호환성 (그룹 간 변경 시 검증)
  if (item.deemedCategory && isDeemedCategoryCompatible(item.deemedCategory, newCategory)) {
    base.deemedCategory = item.deemedCategory;
  }

  // 금액 매핑
  if (item.category === "deposit" && newGroup !== "deposit") {
    base.marketValue = item.leaseDeposit;
  } else if (newGroup === "deposit") {
    base.leaseDeposit = item.marketValue;
  } else {
    base.marketValue = item.marketValue;
  }

  // 그룹 간 변경 시 부동산 필드(estateAddress·estateLatLng·standardPrice·leaseDeposit·mortgage·§14)는 자동 손실
  // (base에 추가되지 않으므로 undefined로 처리됨)

  return base;
}

export function computeLossFields(
  item: EstateItem,
  preserved: Partial<EstateItem>,
): string[] {
  const lossKeys: Array<keyof EstateItem> = [
    "estateAddress",
    "estateLatLng",
    "estateSigunguCode",
    "standardPrice",
    "appraisedValue",
    "leaseDeposit",
    "mortgageAmount",
    "deductSecuredClaimAsDebt",
    "securedClaimIsFinancialDebt",
    "securedClaimCreditorName",
    "deemedCategory",
    "farmingCategory",
    "familyBusinessCategory",
  ];
  return lossKeys.filter(
    (k) => item[k] !== undefined && preserved[k] === undefined,
  ).map(String);
}
```

---

## 9. testid 매트릭스

| testid | PR | 노출 조건 |
|---|---|---|
| `estate-body-variant-simple-{itemId}` | PR-D | cash·financial·other |
| `estate-body-variant-realestate-{itemId}` | PR-D | real_estate 3종 |
| `estate-body-variant-deposit-{itemId}` | PR-D | deposit |
| `estate-card-actions-menu-{itemId}` | PR-F | 헤더 ⋮ 버튼 |
| `estate-card-category-change-{itemId}` | PR-F | ⋮ 메뉴 항목 "카테고리 변경" |
| `category-change-dialog-{itemId}` | PR-F | Dialog 펼침 시 |
| `category-change-confirm-{itemId}` | PR-F | Dialog confirm 버튼 |
| `category-change-radio-{newCategory}-{itemId}` | PR-F | Dialog 라디오 옵션 |

기존 selectid 모두 보존.

---

## 10. anchor 매트릭스 (PR별)

| PR | anchor 수 | 핵심 |
|---|---|---|
| PR-D | 6+ | pickBodyVariant 매핑 / variant 렌더 / fishing 라벨 / forceExpand 동작 / 800줄 |
| PR-E | 10+ | EstateCommonAttributesSection wrapper 5 + AdvancedPanel showSection22Override 2 + print 3 |
| PR-F | 14+ | getCategoryGroup 9 / pickPreservedFields 6 / Dialog 시각 분기 3 / a11y 키보드 |
| PR-G | 2 e2e | a11y + 칩↔⚙️ 동기 |

---

## 10.5 추가 정책 (D-O1~O6·D-X1 정정)

### D-O1·D-O5 — EstateCommonAttributesSection의 effectiveValuation·인덱스

기존 props `effectiveValuation`은 협의분할 인라인 펼침 패널에 전달:
```tsx
<EstateChipInlineExpand
  expandedKey={inlineExpandedKey}
  item={item}
  onUpdate={onUpdate}
  heirs={heirs}
  effectiveValuation={effectiveValuation}  // 신규 prop 전달
  onClose={() => setInlineExpandedKey(null)}
/>
```

`EstateChipInlineExpand`에 `effectiveValuation?: number` prop 추가 (선택). 미전달 시 `computeEffectiveValuation(item)` fallback.

호출자(`StockValuationForm`)는 stock 카드별 자체 평가액(평균가×주식수 등) 전달.

### D-O2 — fishing 헬퍼 타입

`EstateBodyHelpers.ts`에 명시:
```ts
type FishingFarmingCategory = "fishing_vessel" | "fishing_right";

export function isFishingAsset(item: EstateItem): item is EstateItem & { farmingCategory: FishingFarmingCategory } {
  return item.farmingCategory === "fishing_vessel" || item.farmingCategory === "fishing_right";
}
```

### D-O3 — PR-E anchor 10건 세부

1. EstateCommonAttributesSection mode=gift → null
2. ListedStockEditor → chip-major-shareholder 노출 (showMajorShareholderChip=true)
3. UnlistedStockV2 → chip-major-shareholder 미노출
4. handleChipClick major-shareholder → isSection22MajorShareholder 토글
5. visibility.financialDeduction=hidden_permanent + isFinancialAssetForDeduction=true → ⚙️에 FinancialDeductionChip 노출
6. AdvancedPanel showSection22Override 분기 (default 동작 무영향)
7~10. print: collapse hidden·⚙️ 자동 펼침·버튼 hidden·칩 외곽

### D-O4 — PR-G 위험

| 위험 | 완화 |
|---|---|
| Playwright 미설치 | `npm install -D @playwright/test` Pre-Do 작업 |
| Storybook 부재 | 직접 페이지 진입 시나리오 |

### D-O6 — deposit 카테고리 호환

deposit은 상속세 전용 → CategoryChangeDialog의 라디오 옵션에서 mode=gift이면 deposit 제외.

```tsx
const availableCategories: SupportedCategory[] = mode === "gift"
  ? ["real_estate_land", "real_estate_building", "real_estate_apartment", "cash", "financial", "other"]
  : ["real_estate_land", "real_estate_building", "real_estate_apartment", "cash", "financial", "deposit", "other"];
```

### D2-O1 — computeLossFields 한국어 라벨

```ts
const LOSS_FIELD_LABELS: Partial<Record<keyof EstateItem, string>> = {
  estateAddress: "소재지 주소",
  estateLatLng: "소재지 좌표",
  estateSigunguCode: "시·군·구 코드",
  standardPrice: "기준시가/공시지가",
  appraisedValue: "감정평가액",
  leaseDeposit: "임대보증금",
  mortgageAmount: "저당권 채권액",
  deductSecuredClaimAsDebt: "§14 담보채무 자동공제",
  securedClaimIsFinancialDebt: "금융회사 채무 여부",
  securedClaimCreditorName: "채권자명",
  deemedCategory: "간주상속재산 분류",
  farmingCategory: "영농상속 자산 분류",
  familyBusinessCategory: "가업상속 자산 분류",
};

// CategoryChangeDialog에서:
{lossFields.map((key) => (
  <li key={key} className="text-xs text-amber-800 dark:text-amber-200 flex items-center gap-2">
    <span aria-hidden>✗</span>
    {LOSS_FIELD_LABELS[key] ?? key}
  </li>
))}
```

### D2-O2 — category-change-policy.test 시나리오

`__tests__/lib/calc/category-change-policy.test.ts`:
- getCategoryGroup 9 카테고리 × 4 그룹 매트릭스
- pickPreservedFields:
  - real_estate_land → real_estate_apartment (전 필드 보존)
  - financial → cash (marketValue 보존)
  - real_estate_apartment → financial (estateAddress·standardPrice·leaseDeposit 손실)
  - deposit → cash (leaseDeposit → marketValue 매핑)
  - cash → deposit (marketValue → leaseDeposit 매핑)
- isDeemedCategoryCompatible:
  - insurance + cash → true
  - insurance + real_estate_land → false (DEEMED_ALLOWED_CATEGORIES.insurance에 없음)
- computeLossFields:
  - 손실된 필드만 반환, undefined 필드는 제외

### D2-O3 — ⋮ 메뉴 위치

`EstateItemHeader` 헤더 액션 영역 (우측):
```
[칩 wrap]    [⋮] [⚙️ 옵션 (N)] [삭제]
              ↑   ↑              ↑
        actions   advanced       remove
        menu      panel toggle
```

⋮ 메뉴는 ⚙️ 좌측에 배치 — 자주 사용되는 ⚙️·삭제는 우측 고정, 카테고리 변경은 부수 액션이므로 좌측.

### D-X1 — handleChipClick 공통 추출 [D2-1·D2-X1 정정]

`PropertyValuationForm.ItemEditor`와 `EstateCommonAttributesSection`이 같은 `handleChipClick` 로직 → 신규 helper 추출:

```ts
// components/calc/inheritance/estate-card/handleChipClick.ts
export function createChipClickHandler({
  item, onUpdate, setInlineExpandedKey,
}: { item: EstateItem; onUpdate: (i: EstateItem) => void; setInlineExpandedKey: (k: ChipKey | null | ((p: ChipKey | null) => ChipKey | null)) => void }) {
  return (chip: ChipState) => {
    if (chip.key === "estimated-value") return;
    if (chip.key === "section22") {
      onUpdate({ ...item, isFinancialAssetForDeduction: cycleSection22(item.isFinancialAssetForDeduction) });
      return;
    }
    if (chip.key === "secured-claim-14") {
      onUpdate({ ...item, deductSecuredClaimAsDebt: undefined, securedClaimIsFinancialDebt: undefined, securedClaimCreditorName: undefined });
      return;
    }
    if (chip.key === "major-shareholder") {
      onUpdate({ ...item, isSection22MajorShareholder: !item.isSection22MajorShareholder || undefined });
      return;
    }
    setInlineExpandedKey((prev) => (prev === chip.key ? null : chip.key));
  };
}
```

→ ItemEditor·EstateCommonAttributesSection 양쪽 사용.

**[D2-1 정정] useCallback 적용**:

```tsx
const handleChipClick = useCallback(
  createChipClickHandler({ item, onUpdate, setInlineExpandedKey }),
  [item, onUpdate],
);
```

setInlineExpandedKey는 안정 (useState setter) → deps 제외 가능.

**[D2-X1 정정] §6.2 코드 중복 제거** — handleChipClick 내부 분기 코드는 §10.5의 createChipClickHandler 단일 정의 참조.

**[D2-2 검증] use client**:
- `EstateCommonAttributesSection.tsx`는 이미 "use client" 첫 줄 (선행 코드 :1 확인)
- 신규 useState 2건 추가 영향 없음

**[D2-3 누적 영향] EstateChipInlineExpand effectiveValuation prop 추가**:
- 선행 PR 변경: EstateChipInlineExpand.tsx props 인터페이스에 `effectiveValuation?: number` 추가
- backwards-compat: optional, 미전달 시 `computeEffectiveValuation(item)` fallback (현재 동작)
- 호출자는 PropertyValuationForm.ItemEditor + EstateCommonAttributesSection 2건
- §10 anchor 매트릭스에 effectiveValuation 전달 anchor 1건 추가

## 11. 위험 매트릭스 (통합)

| 위험 | PR | 완화 |
|---|---|---|
| variant 추출 closure 의존 | PR-D | local state는 variant 내부, props 명시 전달 |
| forceExpand 첫 마운트 트리거 | PR-D | useRef 첫 마운트 가드 |
| EstateCommonAttributesSection 분리 시 e2e 깨짐 | PR-E | F-P2-5 정정: spec 갱신 1줄 또는 ⚙️ 기본 펼침 |
| pickPreservedFields 누락 필드 | PR-F | AN-F2 카테고리 × 7 × 7 매트릭스 anchor |
| shadcn dropdown-menu 설치 실패 | PR-F | npm install 후 build 검증 |
| DEEMED_ALLOWED_CATEGORIES 분리 시 import 깨짐 | PR-F | re-export 유지, grep 검증 |

---

## 12. Definition of Done (PR별)

각 PR 공통:
- [ ] 신규 anchor 100% 통과
- [ ] 회귀 누적 5462 → 5500+
- [ ] typecheck 0 / lint 0 error
- [ ] testid 동결 (기존) + 신규 추가

PR별:
- **PR-D**: PropertyValuationForm ≤ 400줄, variant 3 파일 합 ≤ 500줄
- **PR-E**: EstateCommonAttributesSection ≤ 150줄, e2e 2건 통과
- **PR-F**: shadcn 설치 + 5 신규 파일 + Dialog a11y 검증
- **PR-G**: e2e 2건 Playwright 통과

---

## 13. 참조

- Plan v3: `docs/01-plan/estate-card-followup-phase2.plan.md`
- 선행 Design: `docs/02-design/features/estate-card-followup.design.md` (v4)
- 선행 PR: `8d18f15`, `5e5bb0b`
