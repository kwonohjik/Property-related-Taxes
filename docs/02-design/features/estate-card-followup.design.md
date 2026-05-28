# estate-card-followup — 설계 문서 (3 PR 통합)

> **Feature ID**: `estate-card-followup`
> **작성일**: 2026-05-28
> **선행 Plan**: [`estate-card-followup.plan.md`](../../01-plan/estate-card-followup.plan.md) (v3)
> **레이어**: ⑤ UI 위젯 단일 + 일부 lib 모듈 분리. 엔진/스토어/Zod/API/Validation 변경 0

## 0. 정정 이력

| # | 일시 | 사유 |
|---|---|---|
| v1 | 2026-05-28 | 최초 작성 |
| v2 | 2026-05-28 | **1차 자가 검토 (D1~D8·D-O1~O8·D-X1~X3)** — pickBodyVariant 위치 분리·PANEL Record 위치·EstateItemCardShell props 명확화·SSR rehydration·getCategoryGroup 명시 |
| v3 | 2026-05-28 | **2차 자가 검토 (D2-1~5·D2-O1~O6·D2-X1~X2)** — types.ts 위치 일관·hydration warning anchor·pickPreservedFields deemedCategory 처리·testid hyphen/underscore·Shell vs ItemEditor 호출 명확화 |
| v4 | 2026-05-28 | **Plan↔Design 통합 비교 (INT-1~9)** — Plan과 정합 확정. PR 의존성·collapse 자동 해제·DEEMED 분리·§22 override 모두 Plan에 반영 |

---

## 1. 케이스 인벤토리 (Mandatory · 비면 Do 진입 금지)

### 1.1 FU-1 variant × 카테고리 매트릭스

| variant | 카테고리 | 본체 필드 | 추가 토글 |
|---|---|---|---|
| SIMPLE | cash | 자산명칭 + 시가("현금 금액") | – |
| SIMPLE | financial | 자산명칭 + 시가("잔액 또는 시가") | – |
| SIMPLE | other | 자산명칭 + 시가 + 감정평가액 | – |
| REAL_ESTATE | real_estate_land | AddressSearch(지번 + 좌표) + 별칭 + 시가 + 감정가 + StandardPriceInput(개별공시지가) + 저당권 + §14 토글 | fishing 분기(farmingCategory) |
| REAL_ESTATE | real_estate_building | + 임대보증금 + 기준시가 | – |
| REAL_ESTATE | real_estate_apartment | + 임대보증금 + 공동주택 기준시가 | – |
| DEPOSIT | deposit | 별칭 + 임대보증금(자산본체) + §14 토글(조건부) | – |

### 1.2 FU-2 주식 카드 × 모드 매트릭스

| 진입점 | mode | §22 칩 | 최대주주 칩 | 분류·분할·영농·가업 |
|---|---|---|---|---|
| ListedStockEditor | inheritance | 미노출 (visibility=hidden_permanent) | 노출 (rose) | 노출 |
| ListedStockEditor | gift | – | – | – |
| UnlistedStockCard (V1 simple) | inheritance | 미노출 | 노출 (rose) | 노출 |
| UnlistedStockCard (V2 formal) | inheritance | 미노출 | **showMajorShareholderChip=false** (V2 카드 내부 자체 토글로 처리 — 중복 방지) | 노출 |

### 1.3 FU-3 collapse × 자산 수 매트릭스

| 자산 수 | 카드 collapse 버튼 | 자동 트리거 |
|---|---|---|
| 1~4 | 미노출 | – |
| 5+ | 노출 (헤더 우측) | 사용자 클릭만 (Q3 권장) |
| collapse 상태 | 본체 `hidden print:block` (mount 유지 → local state 보존) | – |

### 1.4 FU-6 카테고리 변경 × 호환 매트릭스

| 현재 → 대상 | 동작 | 손실 필드 |
|---|---|---|
| real_estate_land → real_estate_apartment | 그룹 내 자동 변경 | 없음 (전 필드 보존) |
| cash → financial | 그룹 내 자동 변경 | 없음 |
| real_estate_apartment → financial | 그룹 간 변경 (경고 Dialog) | estateAddress·estateLatLng·standardPrice·leaseDeposit·mortgageAmount·§14 토글·deemedCategory(insurance 외 불가) |
| deposit → cash | 그룹 간 변경 (경고 Dialog) | leaseDeposit (marketValue 매핑 옵션 검토) |
| other → financial | 그룹 간 변경 | appraisedValue (other 전용) |

---

## 2. 컴포넌트 트리

### 2.1 PR-A (FU-1·4·5)

```
PropertyValuationForm.tsx (~376줄)
├── computeEffectiveValuation re-export (← lib/calc/estate-item-valuation.ts)
├── ItemEditor (~60줄 wrapper)
│   ├── EstateItemHeader (선행 PR)
│   ├── EstateChipInlineExpand (선행 PR)
│   ├── pickBodyVariant(cat) ─ 신규 helper
│   ├── Variant Body (SIMPLE | REAL_ESTATE | DEPOSIT)
│   └── EstateItemAdvancedPanel (선행 PR)
├── CategoryButton
└── PropertyValuationForm (export)

components/calc/inheritance/estate-card/variants/
├── EstateBodySimple.tsx (~150줄)
├── EstateBodyRealEstate.tsx (~280줄)  ← AddressSearch · StandardPriceInput · 저당 · §14
├── EstateBodyDeposit.tsx (~80줄)
└── EstateBodyHelpers.ts (~80줄)       ← set · propertyKind · fishing 분기

lib/calc/estate-item-valuation.ts (~30줄)  ← computeEffectiveValuation 분리

__tests__/inheritance/
└── estate-card-variant-split.test.tsx (~150줄)  ← pickBodyVariant · variant 렌더

e2e/
├── estate-card-a11y.spec.ts (FU-4)
└── estate-card-chip-advanced-sync.spec.ts (FU-5)
```

### 2.2 PR-B (FU-2·7)

```
EstateCommonAttributesSection.tsx (재구성 — 193 → ~120줄)
├── EstateItemHeader (선행 PR)
├── EstateChipInlineExpand (선행 PR)
└── EstateItemAdvancedPanel (선행 PR)
    └── (주식 전용) MajorShareholderStockToggle 위치 유지

chip-config.ts (256 → ~300줄)
├── ChipKey union 확장: "major-shareholder"
├── PANEL_TITLE · PANEL_TONE Record 갱신
└── resolveChips({ showMajorShareholderChip })

__tests__/inheritance/
└── estate-card-stock-chips.test.tsx (~100줄)
└── estate-card-print.test.tsx (~80줄, FU-7)

e2e (갱신)
├── inheritance-stock-financial-chip-absent.spec.ts (셀렉터 보존 검증)
└── inheritance-unlisted-v1-section22-toggle.spec.ts (V1/V2 분기 검증)
```

### 2.3 PR-C (FU-3·6)

```
EstateItemCardShell.tsx (신규 ~100줄)  ← collapse 외곽 컨테이너
├── localStorage hook (useCollapseState)
└── 헤더 collapse 버튼 (자산 5+ 시)

CategoryChangeDialog.tsx (신규 ~150줄)
├── 호환 매트릭스 표 표시
├── 손실 필드 경고
└── 확인 후 onUpdate

PropertyValuationForm.tsx 헤더 ⋮ 메뉴 추가
```

---

## 3. lib/calc/estate-item-valuation.ts 명세 (FU-1 사전 분리)

```ts
/**
 * estate-item-valuation — EstateItem 평가액 도출 헬퍼
 * PropertyValuationForm·chip-config 등 다수 모듈이 공유.
 * 순환 의존 회피 + single-source-engine-helper 정책.
 */

import type { EstateItem } from "@/lib/tax-engine/types/inheritance-gift.types";

/**
 * 자산 카드별 "효과 평가액" 우선순위 — 시가 > 감정가 > 기준시가 > 보증금(deposit).
 * TotalEstimatedValue·HeirAllocationToggleSection·chip-config 공통 사용.
 */
export function computeEffectiveValuation(item: EstateItem): number {
  if (item.category === "deposit") {
    return item.leaseDeposit ?? 0;
  }
  return item.marketValue ?? item.appraisedValue ?? item.standardPrice ?? 0;
}
```

**Backwards-compat**: PropertyValuationForm.tsx에서 다음 re-export 유지:
```ts
export { computeEffectiveValuation } from "@/lib/calc/estate-item-valuation";
```

---

## 4. variant 본체 컴포넌트 명세

### 4.1 공통 props [D2-1 정정]

`components/calc/inheritance/estate-card/variants/types.ts`에 정의 (단일 위치):

```ts
import type { EstateItem } from "@/lib/tax-engine/types/inheritance-gift.types";

export interface VariantBodyProps {
  item: EstateItem;
  onUpdate: (updated: EstateItem) => void;
  valuationDate?: string;
  showCollateralDeductToggle: boolean;
  mode: "inheritance" | "gift";
}
```

variants/index.ts·EstateBody*.tsx·PropertyValuationForm.tsx 모두 본 types.ts에서 import.

### 4.2 pickBodyVariant 분기 함수 [D1·D-X1·D-O8 정정]

**위치**: 별도 `variants/index.ts` (barrel) — variant 컴포넌트 import + pickBodyVariant export.
EstateBodyHelpers.ts에는 **컴포넌트 import 없음** (set·propertyKind·fishing 분기 유틸만) → 순환 의존 차단.

```ts
// components/calc/inheritance/estate-card/variants/index.ts
import type { ComponentType } from "react";
import type { AssetCategory } from "@/lib/tax-engine/types/inheritance-gift.types";
import { EstateBodySimple } from "./EstateBodySimple";
import { EstateBodyRealEstate } from "./EstateBodyRealEstate";
import { EstateBodyDeposit } from "./EstateBodyDeposit";
import type { VariantBodyProps } from "./types";  // VariantBodyProps도 별도 types 모듈

export { EstateBodySimple, EstateBodyRealEstate, EstateBodyDeposit };
export type { VariantBodyProps };

export function pickBodyVariant(
  category: AssetCategory,
): ComponentType<VariantBodyProps> {
  if (category === "deposit") return EstateBodyDeposit;
  if (
    category === "real_estate_land" ||
    category === "real_estate_building" ||
    category === "real_estate_apartment"
  ) return EstateBodyRealEstate;
  // cash · financial · other · listed_stock · unlisted_stock는 SIMPLE
  // (주식은 별도 폼 — PropertyValuationForm 처리 안 함)
  return EstateBodySimple;
}
```

PropertyValuationForm.tsx의 ItemEditor:
```tsx
import { pickBodyVariant } from "./inheritance/estate-card/variants";
const Variant = pickBodyVariant(item.category);
<Variant item={item} onUpdate={onUpdate} ... />
```

**파일 구조 [D-O8 정정]**:
```
components/calc/inheritance/estate-card/
├── variants/
│   ├── index.ts                  ← pickBodyVariant + re-export
│   ├── types.ts                  ← VariantBodyProps 타입 (순환 회피)
│   ├── EstateBodySimple.tsx
│   ├── EstateBodyRealEstate.tsx
│   ├── EstateBodyDeposit.tsx
│   └── EstateBodyHelpers.ts      ← set·propertyKind·isFishing 유틸 (컴포넌트 import 없음)
```

### 4.3 EstateBodyRealEstate 내부 구조 [D7 정정]

기존 ItemEditor의 다음 영역을 그대로 추출 (실제 라인 — 선행 PR 후 재확인 필요, Pre-Do AN-A0 신설):

- 소재지 검색: 자산명 분기 if(`isRealEstate || isFishing`) 부분
- StandardPriceInput·임대보증금·저당권·§14 ToggleCard 영역

→ **Pre-Do AN-A0 신설**: variant 추출 전 PropertyValuationForm.tsx 라인 매핑 표 작성 (선행 PR 변경 반영).

1. **소재지 검색** (AddressSearch + 별칭 input + fishing 분기 라벨)
2. **평가 우선순위 안내** (sky 박스 hint)
3. **시가·감정가 입력**
4. **StandardPriceInput** (자동조회 위젯 + standardPricePerSqm local state)
5. **임대보증금** (building·apartment만)
6. **저당권 채권액**
7. **§14 자동공제 ToggleCard** (`showCollateralDeductToggle` true 시)

local state 유지:
- `addrValue` (AddressSearch state)
- `standardPricePerSqm` (단가 표시용)

→ unmount 시 손실되므로 본 컴포넌트는 **항상 마운트** (⚙️/collapse는 외곽만 toggle).

### 4.4 EstateBodySimple 내부 구조

기존 ItemEditor :324~344의 자유 입력 + :362~390의 시가·감정가만:

1. **자산 명칭** 입력 (placeholder 카테고리별)
2. **시가** 입력 (카테고리별 라벨)
3. **감정가** 입력 (other만)

### 4.5 EstateBodyDeposit 내부 구조

1. **별칭** 입력
2. **임대보증금** (자산본체 + 환산가액 hint)
3. **§14 자동공제 ToggleCard** (조건부)

---

## 5. EstateItemCardShell 명세 (FU-3)

### 5.1 컴포넌트 구조 [D2·D-O4 정정]

`children`을 단일 prop으로 받지 않고 `header`·`body` slot 분리:

```tsx
export interface EstateItemCardShellProps {
  itemId: string;
  collapseEnabled: boolean;          // totalAssetCount >= 5
  /** 항상 노출 (헤더 + 칩 + collapse 토글 자체) */
  header: React.ReactNode;
  /** collapse 시 hidden — 본체 + 인라인 펼침 + ⚙️ 모두 포함 */
  body: React.ReactNode;
}

export function EstateItemCardShell({ itemId, collapseEnabled, header, body }: EstateItemCardShellProps) {
  const [collapsed, setCollapsed] = useCollapseState(itemId);

  return (
    <div
      data-testid={`estate-card-shell-${itemId}`}
      data-collapsed={collapsed}
      className="border rounded-lg p-4 space-y-3 bg-white dark:bg-gray-900"
    >
      {header}
      {collapseEnabled && (
        <button
          data-testid={`estate-card-collapse-toggle-${itemId}`}
          onClick={() => setCollapsed(v => !v)}
          aria-label={collapsed ? "카드 펼치기" : "카드 접기"}
          aria-expanded={!collapsed}
          className="text-xs text-slate-500 hover:text-indigo-600 print:hidden"
        >
          {collapsed ? "⬇️ 펼치기" : "⬆️ 접기"}
        </button>
      )}
      {/* 본체 + 인라인 펼침 + ⚙️ = collapse 시 hidden, 인쇄 시 print:block [D-O4 정정] */}
      <div className={collapsed ? "hidden print:block" : "block"}>
        {body}
      </div>
    </div>
  );
}
```

→ `header` slot에는 EstateItemHeader만, `body` slot에는 자산명·본체·EstateChipInlineExpand·EstateItemAdvancedPanel 전부 포함.

### 5.2 useCollapseState 훅 [D6 정정 — SSR rehydration]

```ts
// hooks/useCollapseState.ts
export function useCollapseState(itemId: string): [boolean, (v: boolean | ((p: boolean) => boolean)) => void] {
  const key = `estate-card-collapsed-${itemId}`;
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    try {
      return localStorage.getItem(key) === "true";
    } catch {
      return false;
    }
  });

  // localStorage 동기화 — useEffect 1회만 (사용자 액션에 의한 변경만)
  // setCollapsed 호출 시 localStorage 즉시 갱신 (이벤트 기반, 미러링 아님)
  const set = useCallback((v: boolean | ((p: boolean) => boolean)) => {
    setCollapsed((prev) => {
      const next = typeof v === "function" ? v(prev) : v;
      try { localStorage.setItem(key, String(next)); } catch { /* silent */ }
      return next;
    });
  }, [key]);

  return [collapsed, set];
}
```

→ useEffect → store 미러링 0건 ([[feedback_useeffect_store_mirror_forbidden]]). 초기값만 useState lazy initializer로 localStorage 읽음.

**[D6 정정] SSR rehydration mismatch 회피**:
- 서버 렌더링 시: `typeof window === "undefined"` → 항상 `false` (collapse OFF) 반환
- 클라이언트 hydration 후 첫 effect에서 localStorage 읽어 갱신:

```ts
const [collapsed, setCollapsedState] = useState<boolean>(false);  // SSR/hydration: 항상 false
const [hydrated, setHydrated] = useState(false);

// 클라이언트 hydration 1회 — useEffect는 hydration 미스매치 회피 목적 (미러링 아님)
useEffect(() => {
  if (typeof window === "undefined") return;
  try {
    const stored = localStorage.getItem(key);
    if (stored === "true") setCollapsedState(true);
  } catch { /* silent */ }
  setHydrated(true);
}, [key]);

const set = useCallback((v: boolean | ((p: boolean) => boolean)) => {
  setCollapsedState((prev) => {
    const next = typeof v === "function" ? v(prev) : v;
    try { localStorage.setItem(key, String(next)); } catch { /* silent */ }
    return next;
  });
}, [key]);
```

이 useEffect는 [[feedback_useeffect_store_mirror_forbidden]] 예외:
- "store에 쓰지 않음" — local useState만 갱신
- "hydration 미스매치 회피 목적" — Next.js 공식 패턴 (one-time read)
- 이후 모든 갱신은 사용자 액션(`set` 콜백) 경유 → 미러링 아님

---

## 6. CategoryChangeDialog 명세 (FU-6)

### 6.1 동작

```tsx
<CategoryChangeDialog
  open={open}
  item={item}
  onConfirm={(newCategory, preservedFields) => onUpdate({ ...preservedFields, id: item.id, category: newCategory })}
  onCancel={() => setOpen(false)}
/>
```

### 6.2 호환 매트릭스 — 표 표시

Plan §6.2 매트릭스를 Dialog 안에 표 형태로 노출:

| 변경 후 카테고리 | 손실 필드 |
|---|---|
| real_estate_apartment (그룹 내) | 없음 |
| financial (그룹 간) | estateAddress·StandardPrice·leaseDeposit·mortgage·§14·deemedCategory |

사용자가 "변경" 버튼 클릭 시 손실 필드 명시 후 확인 1회 (rose 버튼).

### 6.3 보존 필드 결정 로직 [D3·D-O5 정정]

```ts
// lib/calc/category-change-policy.ts (신규)
import type { AssetCategory, EstateItem } from "@/lib/tax-engine/types/inheritance-gift.types";

export type CategoryGroup = "real_estate" | "financial" | "deposit" | "other";

export function getCategoryGroup(category: AssetCategory): CategoryGroup {
  if (
    category === "real_estate_land" ||
    category === "real_estate_building" ||
    category === "real_estate_apartment"
  ) return "real_estate";
  if (category === "cash" || category === "financial") return "financial";
  if (category === "deposit") return "deposit";
  return "other";
}

/**
 * 카테고리 변경 시 보존할 필드 결정.
 * id는 항상 유지 (협의분할 heirAllocations 매핑 보존 — D-O5 정정).
 */
export function pickPreservedFields(
  item: EstateItem,
  newCategory: AssetCategory,
): Partial<EstateItem> {
  const oldGroup = getCategoryGroup(item.category);
  const newGroup = getCategoryGroup(newCategory);
  // id·name·heirAllocations는 항상 보존
  const base: Partial<EstateItem> = {
    id: item.id,                       // [D-O5] id 유지 — heirAllocations 매핑 보존
    name: item.name,
    heirAllocations: item.heirAllocations,
  };
  if (oldGroup === newGroup) {
    // 그룹 내: 전 필드 보존
    return { ...item };
  }
  // 그룹 간: 카테고리별 호환 필드 분기
  if (newGroup === "financial" || newGroup === "deposit") {
    // 금액 필드 — leaseDeposit ↔ marketValue 매핑 검토
    if (item.category === "deposit" && newCategory !== "deposit") {
      base.marketValue = item.leaseDeposit;
    } else if (newCategory === "deposit") {
      base.leaseDeposit = item.marketValue;
    } else {
      base.marketValue = item.marketValue;
    }
  }
  if (oldGroup === "real_estate" && newGroup === "real_estate") {
    // 같은 그룹이지만 명시 — estateAddress·estateLatLng 보존
    Object.assign(base, {
      estateAddress: item.estateAddress,
      estateLatLng: item.estateLatLng,
      estateSigunguCode: item.estateSigunguCode,
    });
  }
  // deemedCategory 호환성 — DEEMED_ALLOWED_CATEGORIES 참조 (PropertyValuationForm.tsx :118~126)
  // [D4 정정] 변경 후 카테고리가 deemedCategory와 호환되지 않으면 자동 undefined
  // (이미 정책상 자동 제외 — 별도 anchor)
  return base;
}
```

---

## 7. testid 매트릭스

### 7.1 신규 testid (PR-A·B·C) [D2-5·D2-O4 정정]

| testid | 위치 | PR |
|---|---|---|
| `estate-body-variant-simple-{itemId}` | EstateBodySimple 루트 | PR-A |
| `estate-body-variant-realestate-{itemId}` | EstateBodyRealEstate 루트 (hyphen 제거 — `real-estate`의 `_`/`-` 혼용 차단) | PR-A |
| `estate-body-variant-deposit-{itemId}` | EstateBodyDeposit 루트 | PR-A |
| `estate-chip-major-shareholder-{itemId}` | EstateItemHeaderChips | PR-B |
| `estate-card-collapse-toggle-{itemId}` | EstateItemCardShell | PR-C |
| `estate-card-actions-menu-{itemId}` | 헤더 ⋮ 메뉴 버튼 (FU-6) | PR-C |
| `estate-card-category-change-{itemId}` | ⋮ 메뉴 항목 "카테고리 변경" | PR-C |
| `category-change-dialog-{itemId}` | Dialog | PR-C |
| `category-change-confirm-{itemId}` | Dialog 확인 버튼 | PR-C |

### 7.2 기존 testid 동결 (회귀 0)

- 선행 PR의 모든 `estate-chip-*`·`estate-advanced-panel-*` 보존
- e2e 직접 참조 셀렉터(MajorShareholderStockToggle 텍스트): PR-B에서 위치 이동 후 텍스트 보존 → spec 무수정

---

## 8. 회귀 매트릭스 (PR별)

| PR | 신규 anchor | 갱신 e2e | 전체 회귀 목표 |
|---|---|---|---|
| PR-A | variant-split (~15건) + a11y e2e + chip-sync e2e | 없음 | 5440 + 15 = 5455 PASS |
| PR-B | stock-chips (~10건) + print (~5건) | inheritance-stock-financial-chip-absent · inheritance-unlisted-v1-section22-toggle (셀렉터 보존 검증) | 5455 + 15 = 5470 PASS |
| PR-C | collapse (~8건) + category-change (~10건) | 없음 | 5470 + 18 = 5488 PASS |

---

## 8.5 추가 정책 (D-O1·O2·O3·O6·O7 정정)

### D-O1 — PANEL_TITLE/PANEL_TONE Record 위치

`EstateChipInlineExpand.tsx` 안에 정의. FU-2 ChipKey 확장 시 동시 갱신 필요. chip-config.ts에는 ChipKey union만 두고 PANEL Record는 표시 컴포넌트(`EstateChipInlineExpand.tsx`) 내부 유지 — 표시 의존성 분리.

### D-O2 — FU-2 mode=gift 처리

`EstateCommonAttributesSection`은 mode=gift 시 전체 비노출 (현재 코드 :80). FU-2 wrapper 재구성 후에도 동일 — 호출처 `StockValuationForm` 변경 없음.

### D-O3 — stock §22 사용자 지정 토글 노출 경로

stock visibility.financialDeduction=hidden_permanent → §22 칩 미노출. **그러나** 사용자가 `isFinancialAssetForDeduction` 명시 override 가능:
- ⚙️ 패널 내부에 별도 "고급 §22 override" 섹션 신설 (visibility=hidden_permanent인 경우 노출)
- 기본은 접힌 상태, 사용자 명시 override 후 펼친 상태 유지
- `FinancialDeductionChip` 컴포넌트 재사용

### D-O6 — collapse 자동 트리거 hint

자산 추가 5번째 시 toast 알림 (Plan Q3=수동 권장 + UX hint):
- "자산 5개 이상 — 카드 우측 ⬆️ 접기 버튼으로 압축 가능합니다"
- 알림 표시 후 localStorage `estate-card-collapse-hint-shown=true` 저장 (1회만)

### D2-O1 — totalAssetCount 전달 경로

`EstateItemCardShell.collapseEnabled = items.length >= 5`. PropertyValuationForm → ItemEditor props에 `totalAssetCount?: number` 추가 → Shell에 전달.

### D2-O2 — 카테고리 변경 후 pendingDeemed 재처리

카테고리 변경은 자산-수준이며, 사용자가 폼-전역 `pendingDeemed`로 새 카드 추가 시 사용하는 사전선택과 무관. → 카테고리 변경 시 `pendingDeemed` 변경 없음. 별도 처리 불필요.

### D2-O3 — collapse 상태에서 ⚙️ 버튼 클릭

collapse 상태(`collapsed=true`)에서는 헤더는 항상 노출. body 안의 ⚙️ 패널은 `hidden`이지만 ⚙️ 버튼 클릭 → `advancedOpen=true` 변경 — 사용자는 변화를 못 봄.

**정책**: collapse 상태에서 ⚙️ 버튼 클릭 → **collapse 자동 해제** + ⚙️ 펼침.

```tsx
function onToggleAdvanced() {
  setCollapsed(false);  // collapse 해제 (UX 일관성)
  setAdvancedOpen(v => !v);
}
```

### D2-O4 — 헤더 ⋮ 메뉴 testid 추가 (§7.1 반영)

### D2-O5 — PR 의존성 명시

```
PR-A (FU-1·4·5)
   ├── computeEffectiveValuation 분리 → lib/calc/estate-item-valuation.ts
   ├── variant 본체 파일 분리
   └── 잔여 e2e 2건
        ↓ 의존: estate-item-valuation 모듈
PR-B (FU-2·7)
   ├── chip-config.ts ChipKey 확장
   ├── EstateCommonAttributesSection wrapper 재구성
   └── e2e 셀렉터 보존 검증
        ↓ 의존: PR-A의 variant 분리 (없으면 800줄 위반)
PR-C (FU-3·6)
   ├── EstateItemCardShell 신규
   ├── CategoryChangeDialog 신규
   └── pickPreservedFields 모듈
```

PR-A 머지 전까지 PR-B·C 진행 차단. PR-B·C는 병렬 가능.

### D2-O6 — 다크 모드 collapse 토글 색상

```tsx
className="text-xs text-slate-500 hover:text-indigo-600 dark:text-slate-400 dark:hover:text-indigo-300 print:hidden"
```

### D2-X1 — Shell vs ItemEditor 호출 구조

확정 구조:
```
ItemEditor (PropertyValuationForm.tsx 내부)
  ↓ 호출
EstateItemCardShell (외곽 + collapse)
  ├── header: <EstateItemHeader ... />
  └── body:
       ├── <자산명 입력 + variant 안내>
       ├── <EstateChipInlineExpand />
       ├── <Variant ... />  ← pickBodyVariant(category)
       └── <EstateItemAdvancedPanel />
```

→ ItemEditor가 Shell을 호출. Shell이 children 안에 ItemEditor를 감싸지 않음.

### D2-X2 — 위험 표 정리

§9 위험 표에서 취소선 항목 2개 제거 후 §8.6 신설 "재분류된 위험 — 작업 결과로 해소":
- computeEffectiveValuation re-export (작업 결과로 자동 해소)
- collapse mount 유지 (정책 결정으로 위험 자체 없음)

### D2-2 — Hydration warning anchor

`__tests__/inheritance/estate-card-collapse-hydration.test.tsx`:
- 서버 렌더링 시 collapse=false 가정
- localStorage="true" 상태에서 hydration 후 useEffect 1회만 실행
- React hydration warning 0건 검증

### D2-3 — pickPreservedFields deemedCategory 처리

DEEMED_ALLOWED_CATEGORIES 참조 후 호환성 검증:

```ts
import { DEEMED_ALLOWED_CATEGORIES } from "@/components/calc/PropertyValuationForm";

// pickPreservedFields 내부:
if (item.deemedCategory) {
  const allowed = DEEMED_ALLOWED_CATEGORIES[item.deemedCategory] ?? [];
  if (!allowed.includes(newCategory as any)) {
    // 호환되지 않음 → 자동 undefined (보존하지 않음)
  } else {
    base.deemedCategory = item.deemedCategory;
  }
}
```

DEEMED_ALLOWED_CATEGORIES도 PropertyValuationForm.tsx 내부에서 export — FU-6에서 `lib/calc/deemed-category-policy.ts` 분리 검토.

### D2-4 — stock ⚙️ §22 override 패널 조건

`EstateItemAdvancedPanel` 안에서 `visibility.financialDeduction === "hidden_permanent"`인 경우에도 `item.isFinancialAssetForDeduction !== undefined`이면 FinancialDeductionChip 노출. 신규 조건:

```ts
const showSection22Override =
  visibility.financialDeduction === "default" || // 기존
  (visibility.financialDeduction === "hidden_permanent" && item.isFinancialAssetForDeduction !== undefined);  // 신규 (stock)
```

### D-O7 — lib/calc/estate-item-valuation.ts anchor

`__tests__/lib/calc/estate-item-valuation.test.ts` 신규:
- deposit → leaseDeposit 반환
- 시가 우선
- 시가 없으면 감정가
- 감정가 없으면 기준시가
- 모두 없으면 0

## 9. 위험 매트릭스

| 위험 | 영향 | 완화 |
|---|---|---|
| variant 추출 시 closure 의존 깨짐 (`set` 헬퍼 등) | TypeScript 컴파일 실패 또는 런타임 에러 | EstateBodyHelpers.ts에 명시 export + props로 전달 |
| addrValue·standardPricePerSqm local state 손실 | 사용자 입력 휘발 | EstateBodyRealEstate 내부 useState — 항상 마운트 |
| ~~computeEffectiveValuation re-export 누락~~ [D-X2 정정 — 작업 결과로 해소, 위험 분류 X] | – | – |
| chip-major-shareholder 추가 시 PANEL Record 누락 | TS exhaustive check 실패 | PANEL_TITLE/PANEL_TONE 동시 갱신 강제 |
| MajorShareholderStockToggle e2e 셀렉터 깨짐 | 회귀 2건 | 토글은 ⚙️ 안에 유지 (위치만 변경) → 텍스트 셀렉터 유지 |
| ~~collapse 시 본체 unmount 위험~~ [D-X3 정정 — `hidden` 클래스로 mount 유지하므로 위험 자체 없음] | 사실상 위험 없음 | – |
| localStorage 접근 SSR 에러 | 빌드 실패 | useState lazy initializer + window typeof guard |
| 카테고리 변경 시 협의분할 합계 불일치 | 사용자 혼란 | onChange 후 HeirAllocationInput 합계 검증 자동 노출 |
| 카테고리 변경 시 visibility 변경 안 됨 | 칩 stale | resolveAssetToggleVisibility 재호출 보장 (useMemo deps에 item.category) |

---

## 10. Pre-Do Anchor (PR별)

### PR-A
- AN-A1: pickBodyVariant 매핑 매트릭스 (7 카테고리 × 3 variant)
- AN-A2: EstateBodyRealEstate 마운트 시 AddressSearch·StandardPriceInput 렌더 확인
- AN-A3: computeEffectiveValuation re-export 호환 (기존 import 사이트 5건 grep)
- AN-A4: PropertyValuationForm.tsx ≤ 400줄

### PR-B
- AN-B1: ChipKey에 "major-shareholder" 추가 후 PANEL_TITLE·PANEL_TONE Record 컴파일 통과
- AN-B2: ListedStockEditor에서 chip-major-shareholder 노출, UnlistedStockV2Card 자식에서 미노출
- AN-B3: e2e 2건 셀렉터 보존 (텍스트 검색 grep)

### PR-C
- AN-C1: useCollapseState localStorage 동기 (mount 시 읽기 / 토글 시 쓰기)
- AN-C2: 자산 1~4개 시 collapse 토글 미노출, 5개 시 노출
- AN-C3: collapse 시 본체 hidden 클래스 적용, local state(addrValue) 보존
- AN-C4: CategoryChangeDialog 그룹 내/간 변경 필드 보존 매트릭스

---

## 11. Definition of Done (PR별)

선행 Plan §10 공통 기준 + 각 PR별:

- [ ] PR-A: PropertyValuationForm ≤ 400줄, variant 3 파일 합 ≤ 600줄, computeEffectiveValuation 분리 + re-export 확인, 회귀 5455 PASS
- [ ] PR-B: chip-major-shareholder 추가, EstateCommonAttributesSection wrapper 재구성, e2e 2건 텍스트 셀렉터 보존, 회귀 5470 PASS
- [ ] PR-C: collapse + 카테고리 변경 Dialog, localStorage 동기, 회귀 5488 PASS

---

## 12. 참조

- 선행 Plan v3
- 선행 PR `8d18f15`
- 선행 코드: `PropertyValuationForm.tsx:148~568` (ItemEditor), `chip-config.ts:96` (resolveChips)
- e2e 영향: `e2e/inheritance-stock-financial-chip-absent.spec.ts`, `e2e/inheritance-unlisted-v1-section22-toggle.spec.ts`
