# 채무·공과금·장례비 협의분할 입력 기능 — 엔진·UI 통합 디자인 (v2)

> 계획서: [`docs/00-pm/inheritance-debt-allocation-feature.plan.md`](../../../00-pm/inheritance-debt-allocation-feature.plan.md) v4와 통합 동기화
>
> v1 → v2 변경: §1.4 엔진 진입 조건 확장 명시 · §2 매트릭스 ⓪ 추가 · §3.1 Step 2 코드 예시에 AlertDialog 본체·useState 통합 · §3.2 AlertDialog 상태 보장 정책 · §4.3 안내 카드 sky 톤 차별화 · §5 모든 카드 "원" 단위 미표기·HorizontalScrollContainer · §5.2 한도 적용 전/후 두 합계 명시 · §5.5 표 분할 옵션 A/B · §5.6 통합 위치 grep 게이트 · §6 빈 입력 vs 의도 0 구분 · §8.1 IDA-ENGINE-1~3 추가 · §10 게이트 5분류 재구성
>
> 본 디자인은 **엔진 1줄 수정 + UI/Form/Validation/Result 변경 중심**. 계획서 §1 grep + Step 6 추가 발견:
> `inheritance-tax.ts:422-425` `hasHeirAllocations`가 `estateItems.heirAllocations` OR `priorGifts.doneeId`만 트리거 — **`debtItems.heirAllocations`는 미트리거**. 결과 카드 ⑦ 진입을 위해 1줄 추가 필요(§1.4 참조).

---

## §1. 도메인 모델

### 1.1 엔진 타입 (변경 없음 — 확인만)

`lib/tax-engine/types/inheritance-gift.types.ts`:

```ts
export type DebtCategory = "financial" | "tax" | "personal" | "funeral";

export interface DebtItem {
  id: string;
  category: DebtCategory;
  name: string;                          // 채권자명·내용
  amount: number;                        // 원 (한도 적용 전)
  isBongan?: boolean;                    // funeral 카테고리 전용
  heirAllocations?: HeirAllocation[];    // 협의분할 — 상속인별 변제 분담
}

export interface HeirAllocation {
  heirId: string;
  amount: number;
}

export interface InheritanceTaxInput {
  // ...
  debtItems?: DebtItem[];                // 우선 적용. 미입력 시 legacy debts·funeralExpense
  debts?: number;                        // legacy
  funeralExpense?: number;               // legacy
  funeralIncludesBongan?: boolean;       // legacy
}
```

### 1.2 폼 상태 (방안 C — 3-state Optional)

`components/calc/inheritance/shared.ts`:

```ts
export interface FormState {
  // ...
  debtItems: DebtItem[] | undefined;     // ★ 변경 — undefined / [] / [...]
  // legacy (OFF 모드에서만 유효)
  funeralExpense: string;
  funeralIncludesBongan: boolean;
  debts: string;
}

export const INITIAL_FORM: FormState = {
  // ...
  debtItems: undefined,                  // ★ 변경 (현재 [])
  funeralExpense: "",
  funeralIncludesBongan: false,
  debts: "",
};
```

### 1.3a 엔진 input legacy 타입 (grep 실측)

`lib/tax-engine/types/inheritance-gift.types.ts:692,698`:
```ts
funeralExpense: number;       // line 692 — required (legacy fallback)
debts: number;                // line 698 — required (legacy fallback)
debtItems?: DebtItem[];       // line 700 — optional, 우선 적용
heirAllocationResult?: HeirAllocationResult;  // line 760 — optional 결과
```

Route ⑭ 매핑(`route.ts:73-76`)이 `?? 0` 폴백으로 required ↔ optional 변환.

### 1.4 엔진 진입 조건 확장 (1줄 수정)

`lib/tax-engine/inheritance-tax.ts:422-425` 현재:
```ts
const hasHeirAllocations =
  input.heirs.length > 0 &&
  (input.estateItems.some((e) => e.heirAllocations) ||
    input.preGiftsWithin10Years.some((g) => g.doneeId));
```

채무 협의분할만 입력된 경우에도 `calcHeirAllocation` 호출되어 상속인별 채무 분담·산출세액 배부가 결과에 노출되도록 1줄 추가:

```ts
const hasHeirAllocations =
  input.heirs.length > 0 &&
  (input.estateItems.some((e) => e.heirAllocations) ||
    input.preGiftsWithin10Years.some((g) => g.doneeId) ||
    (input.debtItems?.some((d) => d.heirAllocations && d.heirAllocations.length > 0) ?? false));
```

**회귀 영향 분석**:
- 기존 `debtItems` 없는 케이스: 영향 없음 (조건 변동 없음)
- 기존 `debtItems` 있지만 `heirAllocations` 없는 케이스: 영향 없음 (false 유지)
- 신규 `debtItems.heirAllocations` 있는 케이스: `heirAllocationResult` 신규 생성 — 의도된 동작
- 회귀 anchor: 기존 `__tests__/tax-engine/inheritance/` 모든 케이스 통과 확인 필요

### 1.3 상태 의미

| 상태 | 의미 | UI |
|---|---|---|
| `undefined` | OFF 모드 (legacy) | `funeralExpense`+`debts` 단일금액 입력 |
| `[]` | ON 모드 진입, 빈 상태 | DebtAllocationInput (안내 + 카테고리 추가 버튼만) |
| `[{...}]` | ON 모드 데이터 있음 | DebtAllocationInput (항목 카드 목록 + 합계) |

---

## §2. 14 동기화 지점 매트릭스

| # | 위치 | 작업 | 줄 수 |
|---|---|---|---|
| ⓪ | `inheritance-tax.ts:422-425` 엔진 진입 조건 | `hasHeirAllocations`에 `debtItems.some(d => d.heirAllocations?.length > 0)` OR 추가 | 1 |
| ① | `shared.ts:27` FormState 타입 | `DebtItem[] | undefined` | 1 |
| ② | `shared.ts:66` INITIAL_FORM | `undefined` | 1 |
| ③ | `shared.ts` normalize 또는 `calc-wizard-store.ts merge` | legacy `[]` → `undefined` 강등 | 5 |
| ④ | `lib/calc/inheritance-tax-api.ts` | 변경 없음 (optional 그대로) | 0 |
| ⑤ | `steps.tsx:140-220` | 토글 재작성 + 데드 코드 제거 + AlertDialog | +60 / -10 |
| ⑤' | `DebtAllocationInput.tsx` | 봉안 ToggleCard + 정적 색조 매핑 + 안내 카드 | +30 |
| ⑥ | `inheritance-summary.ts:32,106` | 타입 1줄 + 가드 1줄 | 2 |
| ⑦ | `components/calc/results/inheritance/DebtAllocationResultCard/` 신규 | 부모 + Sub 3종 | +400 |
| ⑦' | `InheritanceTaxResultView` | 조건부 import + 렌더 | +5 |
| ⑧ | `inheritance-validate.ts` | `undefined` 분기 + ON 빈 항목 차단 | +15 |
| ⑨~⑭ | Zod·Route | 정합 (확인만) | 0 |

---

## §3. Step 2 UI 상세 디자인

### 3.1 레이아웃

```
┌──────────────────────────────────────────────────┐
│ Step 2 — 비과세·장례비·채무                       │
├──────────────────────────────────────────────────┤
│ [ExemptionChecklist]                              │
│                                                  │
│ ╔══════════════════════════════════════════════╗ │
│ ║ amber ToggleCard                             ║ │
│ ║ "채무·공과·장례비 협의분할 입력"             ║ │
│ ║ ON: 항목별 채권자명·상속인별 변제 분담       ║ │
│ ║ OFF: 합계 단일 금액 입력           [ ●━━━ ] ║ │
│ ╚══════════════════════════════════════════════╝ │
│                                                  │
│ ┌── ON 분기 ───────────────────────────────────┐ │
│ │ [sky 안내 박스] (amber ToggleCard와 차별화)  │ │
│ │ "협의분할 모드에서는 모든 채무·공과·장례비를 │ │
│ │  항목으로 입력해야 합니다. 단일금액만 있으면 │ │
│ │  토글을 끄세요."                             │ │
│ │                                              │ │
│ │ [+금융채무] [+공과금] [+사적채무] [+장례비]  │ │
│ │                                              │ │
│ │ ┌─ rose card (P1858-Row1) ─────────────────┐ │ │
│ │ │ [금융채무] K은행      [400,000,000] [✕]  │ │ │
│ │ │ HeirAllocation: 장남 400M (검증 ✓)       │ │ │
│ │ └──────────────────────────────────────────┘ │ │
│ │ ┌─ rose card (P1858-Row2) ─────────────────┐ │ │
│ │ │ [금융채무] S저축      [745,000,000] [✕]  │ │ │
│ │ │ HeirAllocation: 배우자 500M + 차남 245M  │ │ │
│ │ └──────────────────────────────────────────┘ │ │
│ │ ┌─ amber card (P1858-Row3) ────────────────┐ │ │
│ │ │ [공과금] 종합소득세    [55,000,000] [✕]  │ │ │
│ │ │ HeirAllocation: 차남 55M                 │ │ │
│ │ └──────────────────────────────────────────┘ │ │
│ │ ┌─ emerald card (P1858-Row4) ──────────────┐ │ │
│ │ │ [장례비] 식대          [18,000,000] [✕]  │ │ │
│ │ │ [chip] 봉안시설 사용료 OFF (식대 한도)   │ │ │
│ │ └──────────────────────────────────────────┘ │ │
│ │ ┌─ emerald card (P1858-Row5) ──────────────┐ │ │
│ │ │ [장례비] 봉안          [15,000,000] [✕]  │ │ │
│ │ │ [chip] 봉안시설 사용료 ON (봉안 한도)    │ │ │
│ │ └──────────────────────────────────────────┘ │ │
│ │ ─────────────────────────────────────────    │ │
│ │ 금융채무 1,145M · 공과금 55M                 │ │
│ │ 장례비 식대 18M → 한도 10M · 봉안 15M → 한도 │ │
│ │ 5M  합계 15M                                 │ │
│ └──────────────────────────────────────────────┘ │
│                                                  │
│ ┌── OFF 분기 (기존 유지, hint 동적) ──────────┐ │
│ │ 장례비 (§14①3호)                             │ │
│ │ [장례비용]              [          ]         │ │
│ │  hint: form.funeralIncludesBongan ?          │ │
│ │    "최대 1,500만원 한도 (식대 1,000만 +      │ │
│ │     봉안 500만)" :                           │ │
│ │    "최대 1,000만원 한도 (식대만)"            │ │
│ │ [violet ToggleCard 봉안시설 이용 +500만원]   │ │
│ │ ─────────────────────────────────────────    │ │
│ │ 공과금 + 채무 합계 (§14①1·2호)               │ │
│ │ [          ]                                 │ │
│ └──────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────┘
```

### 3.2 AlertDialog (데이터 폐기 확인)

```
┌─ AlertDialog (open: pendingDiscardConfirm) ────┐
│ 협의분할 입력 모드를 끄시겠습니까?              │
│                                                │
│ 입력한 채무·공과·장례비 {N}개 항목이 모두     │
│ 삭제되고 단일 금액 입력 모드로 전환됩니다.    │
│ 이 동작은 되돌릴 수 없습니다.                  │
│                                                │
│                       [취소] [삭제하고 끄기]   │
└────────────────────────────────────────────────┘
```

발현 조건: `isAllocationMode === true` && `form.debtItems.length > 0` && 사용자가 토글 OFF 클릭.

**상태 보장 정책**:
- AlertDialog가 열린 동안 `ToggleCard.checked`는 여전히 `true` (실제 모드 전환은 "삭제하고 끄기" 확정 시에만)
- ESC / 외부 클릭 / 취소 버튼 → `pendingDiscardConfirm = false`만 변경, `debtItems`·토글 상태 불변
- "삭제하고 끄기" → `set({ debtItems: undefined })` + `pendingDiscardConfirm = false`
- 사용자가 다이얼로그를 닫고 다시 OFF 클릭 시 동일 흐름 재진입

### 3.3 컴포넌트 의존성

- 기존: `@/components/ui/dialog` 존재 / `@/components/ui/alert-dialog` **부재**
- 조치: `npx shadcn@latest add alert-dialog` 추가 (Phase B 진입 전)
- 대안: `Dialog` 기반 자체 ConfirmDialog 컴포넌트 작성 (`components/calc/shared/ConfirmDialog.tsx`)

### 3.4 ToggleCard 사양

| 속성 | 값 |
|---|---|
| tone | `amber` |
| title | `채무·공과·장례비 협의분할 입력` (내부 코드명 "Phase A0" 제거) |
| description | `ON: 항목별 채권자명·상속인별 변제 분담 / OFF: 합계 단일 금액` |
| variant | `card` (기본) |
| checked | `isAllocationMode` |
| onCheckedChange | `handleToggle` |

---

## §4. DebtAllocationInput 상세 디자인

### 4.1 카테고리 정적 색조 매핑 (Tailwind purge 차단)

```ts
const CATEGORY_STYLES: Record<DebtCategory, {
  label: string;
  buttonClass: string;
  cardBorderClass: string;
  chipClass: string;
}> = {
  financial: {
    label: "금융채무",
    buttonClass: "border-rose-300 bg-rose-50/60 text-rose-700 hover:bg-rose-100 dark:bg-rose-950/30 dark:text-rose-300 dark:hover:bg-rose-900/40",
    cardBorderClass: "border-rose-200 dark:border-rose-900",
    chipClass: "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300",
  },
  tax: {
    label: "공과금",
    buttonClass: "border-amber-300 bg-amber-50/60 text-amber-700 hover:bg-amber-100 dark:bg-amber-950/30 dark:text-amber-300 dark:hover:bg-amber-900/40",
    cardBorderClass: "border-amber-200 dark:border-amber-900",
    chipClass: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  },
  personal: {
    label: "사적채무",
    buttonClass: "border-violet-300 bg-violet-50/60 text-violet-700 hover:bg-violet-100 dark:bg-violet-950/30 dark:text-violet-300 dark:hover:bg-violet-900/40",
    cardBorderClass: "border-violet-200 dark:border-violet-900",
    chipClass: "bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300",
  },
  funeral: {
    label: "장례비",
    buttonClass: "border-emerald-300 bg-emerald-50/60 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-950/30 dark:text-emerald-300 dark:hover:bg-emerald-900/40",
    cardBorderClass: "border-emerald-200 dark:border-emerald-900",
    chipClass: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
  },
};
```

### 4.2 봉안 토글 ToggleCard 치환

현재 `:154-160` native checkbox:
```tsx
<label>
  <input type="checkbox" checked={!!it.isBongan} onChange={...} />
  <span>봉안시설 사용료 (체크 시 한도 500만, 미체크 시 식대 한도 1,000만)</span>
</label>
```

변경(variant·size 실재 props 확인 후 적용 — `ToggleCard.tsx` 시그니처 grep 필수):
```tsx
<ToggleCard
  variant="chip"        // chip 미지원 시 variant="card" + 컴팩트 스타일
  tone="emerald"
  size="sm"             // size 미지원 시 className으로 보조
  title="봉안시설 사용료"
  description="ON 시 한도 500만 / OFF 시 식대 한도 1,000만"
  checked={!!it.isBongan}
  onCheckedChange={(v) => update(idx, { isBongan: v })}
/>
```

Phase E 진입 전 `ToggleCard` 컴포넌트 props 그렙으로 `variant="chip"`·`size="sm"` 지원 여부 확정. 미지원 시 card variant + className 보조로 대체.

### 4.3 안내 카드 (혼합 시나리오 옵션 1 강제)

amber ToggleCard와 색조 중복 회피 — sky 톤 사용. `DebtAllocationInput` 최상단:
```tsx
<div className="rounded-md border border-sky-200 bg-sky-50/40 dark:bg-sky-950/20 p-3">
  <p className="text-xs text-sky-800 dark:text-sky-300">
    협의분할 모드에서는 <strong>모든 채무·공과·장례비</strong>를 항목으로 입력해야 합니다.
    단일 합계 금액만 있으면 위 토글을 끄세요.
  </p>
</div>
```

### 4.4 HeirAllocationInput 재사용 (변경 없음)

각 DebtItem 카드 내부에 `<HeirAllocationInput allocations={it.heirAllocations} expectedTotal={it.amount} heirs={heirs} ... />` 그대로.

---

## §5. 결과 카드 ⑦ 상세 디자인

### 5.1 컴포넌트 분할

`components/calc/results/inheritance/DebtAllocationResultCard/`:

```
DebtAllocationResultCard/
├── index.tsx                          # 부모 (조건부 렌더 + 섹션 조립)
├── CategorySummarySection.tsx         # §5.2 카테고리 합계
├── FuneralLimitSection.tsx            # §5.3 장례비 한도
├── HeirDebtAllocationTable.tsx        # §5.4 상속인별 채무 분담
└── HeirTaxSettlementTable.tsx         # §5.5 상속인별 산출세액 배부
```

부모는 ~100줄, Sub 각 ~80-120줄 → 800줄 정책 안전.

### 5.2 카테고리 합계 섹션

```
┌─ rose 카드 ────────────────────────────────────┐
│ 카테고리별 입력 합계        [협의분할 모드]    │
│                                                │
│   금융채무     1,145,000,000                   │
│   공과금          55,000,000                   │
│   사적채무                 0                   │
│   장례비          33,000,000 (한도 적용 전)    │
│   ──────────────────────────                   │
│   입력 합계   1,233,000,000 (한도 적용 전)     │
│   ──────────────────────────                   │
│   장례 한도 적용 후 합계 = 1,215,000,000        │
│   (§5.4 분담 표 합계와 일치)                   │
└────────────────────────────────────────────────┘
```

우상단 amber 칩 `협의분할 모드` 배지 (§3 안내 위치 #3). 숫자 "원" 단위 미표기 (`formatKRW()` 콤마만).

### 5.3 장례비 한도 섹션

```
┌─ emerald 카드 ──────────────────────────────────┐
│ 장례비 한도 적용 (§14①3호)                      │
│                                                 │
│   식대         18,000,000 → 한도   10,000,000   │
│   봉안         15,000,000 → 한도    5,000,000   │
│   ──────────────────────────                    │
│   적용 합계                        15,000,000   │
│   미적용분 (한도 초과)             18,000,000   │
└─────────────────────────────────────────────────┘
```

### 5.4 상속인별 채무 분담 표

```
┌─ violet 카드 ───────────────────────────────────┐
│ 상속인별 채무·공과·장례비 분담                  │
│                                                 │
│ <HorizontalScrollContainer> (모바일 가로 스크롤)│
│   상속인  │ 금융채무  │ 공과금 │ 장례비 │ 합계 │
│   ───────┼──────────┼────────┼────────┼──────│
│   장남   │   400M   │   0   │  (값)  │ (값) │
│   배우자 │   500M   │   0   │  (값)  │ (값) │
│   차남   │   245M   │  55M  │  (값)  │ (값) │
│   ───────┼──────────┼────────┼────────┼──────│
│   합계   │ 1,145M   │  55M  │  15M   │1,215M│
│ </HorizontalScrollContainer>                   │
└─────────────────────────────────────────────────┘
```

장례비 컬럼 값은 **PDF 1864 발췌 전 미정**. 엔진 `calcHeirAllocation` 동작:
- 항목별 `heirAllocations` 입력 시 → 입력값 적용
- 미입력 시 → 본 PR Phase 0에서 엔진 동작 grep 필요 (균등 안분 또는 0 또는 별도 규칙)

`feedback_ui_engine_dual_truth_avoidance` 정책 — UI 자체 계산 금지. `result.heirAllocationResult.perHeir`에서만 추출.

숫자 표기: **"원" 단위 미표기** (`feedback_no_won_suffix`). `formatKRW()` 콤마 포맷만.

### 5.5 상속인별 산출세액 배부 표 (책 1864 재현)

```
┌─ sky 카드 ──────────────────────────────────────────────────┐
│ 상속인별 산출세액 배부 (§3·§28, 집행기준 19-17-1)            │
│                                                             │
│ <HorizontalScrollContainer>                                 │
│  상속인│과세가액│과세표준│산출세액│세대생략│사전증여│신고세│최종 │
│        │상당액 │상당액 │상당액 │할증§57│공제§28│공제§69│자진납부│
│  ──────┼──────┼──────┼──────┼──────┼──────┼──────┼──────│
│  장남  │ (값) │ (값) │ (값) │ (값) │ (값) │ (값) │ (값) │
│  배우자│ (값) │ (값) │ (값) │ (값) │ (값) │ (값) │ (값) │
│  차남  │ (값) │ (값) │ (값) │ (값) │ (값) │ (값) │ (값) │
│  ──────┼──────┼──────┼──────┼──────┼──────┼──────┼──────│
│  합계  │ (값) │ (값) │ (값) │ (값) │ (값) │ (값) │ (값) │
│ </HorizontalScrollContainer>                                │
│                                                             │
│ 세대생략 할증 §57: 직계비속 + 미성년자 = +40%, 그 외 +30%   │
│ 사전증여세액공제 §28: §28② 한도 적용                        │
│ 신고세액공제 §69: 자진납부세액 × 3%                         │
└─────────────────────────────────────────────────────────────┘
```

모든 숫자는 `formatKRW()` 콤마 포맷, **"원" 단위 미표기**. 모바일 7컬럼 — `HorizontalScrollContainer` 강제.

세대생략 할증·사전증여세액공제·신고세액공제는 표 외부 한 줄이 아닌 **상속인별 컬럼**으로 통합 (각 상속인이 다른 값). 표 외부에는 산식 설명만 fine-print로.

**표 분할 옵션** (7컬럼 가독성 보강):
- 옵션 A (기본 채택): 단일 표 + `HorizontalScrollContainer`
- 옵션 B (대안): 2개 표로 분할
  - 표 1 — `상속인 / 과세가액 상당액 / 과세표준 상당액 / 산출세액 상당액` (4컬럼)
  - 표 2 — `상속인 / 세대생략 할증 / 사전증여공제 / 신고공제 / 최종 자진납부세액` (5컬럼)
- Phase F UI 시니어 결정: 모바일 viewport(<640px) 가독성 테스트 후 결정. 단일 표 가로 스크롤이 자연스러우면 옵션 A, 7컬럼이 잘리면 옵션 B 채택.

### 5.6 InheritanceTaxResultView 통합

```tsx
// components/calc/results/InheritanceTaxResultView.tsx
import { DebtAllocationResultCard } from "./inheritance/DebtAllocationResultCard";

// 기존 섹션들 렌더 ...

{result.heirAllocationResult && form.debtItems !== undefined && (
  <DebtAllocationResultCard
    debtItems={form.debtItems}
    heirAllocationResult={result.heirAllocationResult}
    heirs={form.heirs}
  />
)}
```

**조건 이중 가드**:
- `result.heirAllocationResult`: 엔진이 협의분할 계산 수행 (§1.4 확장된 진입 조건)
- `form.debtItems !== undefined`: ON 모드 (OFF 모드인데 estate 협의분할만 있는 경우 본 카드 미노출 — 채무 관점 카드이므로)

**삽입 위치 결정 — Phase F 진입 전 grep 필수**:
`components/calc/results/InheritanceTaxResultView.tsx` 실 구조에서 다음 후보 위치 비교 후 결정:
- 후보 1: 사이드바 합계 카드 직후
- 후보 2: 상세 `CalculationStep` 목록 직전
- 후보 3: 기존 `HeirAllocationCard`(존재 시)와 인접
- 후보 4: 결과 카드 마지막 (DisclaimerBanner 직전)

권장: 후보 3 (관련 카드 인접) → 부재 시 후보 2.

---

## §6. Validation 분기 상세 (⑧)

```ts
// lib/calc/inheritance-validate.ts
if (form.debtItems !== undefined) {
  // ON 모드
  if (form.debtItems.length === 0) {
    errors.push({
      step: 2,
      field: "debtItems",
      message: "협의분할 항목을 1개 이상 추가하거나 토글을 끄세요",
    });
  }
  // 항목별 채권자명·금액 필수
  for (const [idx, di] of form.debtItems.entries()) {
    if (!di.name.trim()) {
      errors.push({ step: 2, field: `debtItems[${idx}].name`, message: "채권자/내용을 입력하세요" });
    }
    // 빈 입력 vs 의도적 0 구분: amount === 0인 항목은 의미 없는 빈 카드.
    // 사용자가 0을 의도적으로 넣을 일 없음 (0이면 항목 자체를 삭제하면 됨)
    if (!Number.isFinite(di.amount) || di.amount <= 0) {
      errors.push({ step: 2, field: `debtItems[${idx}].amount`, message: "금액을 입력하세요 (0보다 큰 값)" });
    }
  }
  // 협의분할 합계 ≠ 금액 차단 (기존 checkAllocs 유지)
  checkAllocs("채무", form.debtItems);
} else {
  // OFF 모드 — legacy debts / funeralExpense 인식 (기존 동작)
}
```

---

## §7. sessionStorage 마이그레이션 (③)

```ts
// shared.ts normalize 또는 calc-wizard-store.ts merge
function normalizeDebtItems(raw: unknown): DebtItem[] | undefined {
  if (Array.isArray(raw) && raw.length > 0) {
    return raw as DebtItem[];
  }
  return undefined;
}
```

기존 사용자가 `debtItems: []`로 저장되어 있었다면 의미상 OFF 모드 — `undefined`로 강등. 데이터 손실 없음 (빈 배열은 데이터가 아님).

---

## §8. 테스트 매트릭스

### 8.1 엔진 anchor

신규 — `__tests__/tax-engine/inheritance/debt-allocation-case-1858.test.ts`:

| anchor | 검증 |
|---|---|
| IDA-1~13 | 계획서 §4.2 표 |
| IDA-LEGACY-1~3 | 계획서 §4.4 표 |
| IDA-ENGINE-1 | §1.4 변경: `debtItems.heirAllocations`만 있는 입력 → `heirAllocationResult` 생성 확인 |
| IDA-ENGINE-2 | §1.4 변경: `debtItems`도 없고 `heirAllocations`도 없는 입력 → `heirAllocationResult === undefined` 확인 (회귀 차단) |
| IDA-ENGINE-3 | §1.4 변경: 기존 `estateItems.heirAllocations` 케이스 → 동작 불변 (회귀 차단) |

회귀 anchor — `__tests__/tax-engine/inheritance/` **전건 통과 강제** (§1.4 엔진 변경 영향).

### 8.2 UI 회귀

| 시나리오 | 기대 |
|---|---|
| OFF → ON 토글 클릭 | Switch 우측 이동, DebtAllocationInput 노출 |
| ON → OFF (빈 배열) | confirm 없이 즉시 OFF, 단일금액 입력 복귀 |
| ON → OFF (항목 있음) | AlertDialog 노출, "취소" 시 ON 유지, "삭제하고 끄기" 시 OFF + 항목 폐기 |
| ON + 빈 항목 → 다음 단계 | Validation 차단 "협의분할 항목을 1개 이상 추가하거나 토글을 끄세요" |
| ON + 4 카테고리 항목 추가 → 계산 | 결과 카드 4종 노출 (CategorySummary·FuneralLimit·HeirDebtAllocation·HeirTaxSettlement) |
| ON + 협의분할 합계 ≠ 금액 (예: 400M 항목에 분담 300M만 입력) | Validation 차단 (`checkAllocs` 기존 동작) |
| 모바일 viewport (< 640px) | 5컬럼·7컬럼 표 가로 스크롤 (HorizontalScrollContainer) |
| 다크모드 | 4 카테고리 색조 모두 가독성 확인 |
| 봉안 토글 ON | 한도 5M 적용, hint 동적 표시 |
| sessionStorage `debtItems: []` 보유 사용자 재진입 | OFF 모드로 강등 |

### 8.3 접근성·다크모드

- AlertDialog focus-trap, ESC 닫기, Tab 순환
- 4 카테고리 정적 색조 매핑 다크모드 변형 모두 확인
- ToggleCard chip variant 봉안 토글 키보드 토글 가능

---

## §9. 의존 컴포넌트 점검

| 컴포넌트 | 현 상태 | 조치 |
|---|---|---|
| `ToggleCard` | 존재 (`components/calc/inputs/ToggleCard.tsx`) | 재사용 |
| `AlertDialog` | **부재** (`components/ui/alert-dialog.tsx` 없음) | `npx shadcn@latest add alert-dialog` 또는 Dialog 기반 자체 구현 |
| `Dialog` | 존재 (`components/ui/dialog.tsx`) | AlertDialog 미설치 시 대체 |
| `CurrencyInput`·`parseAmount`·`formatKRW` | 존재 | 재사용 |
| `HeirAllocationInput` | 존재 | 재사용 |
| `SelectOnFocusProvider` | 전역 등록 | native text input 자동 처리 |

---

## §10. Definition of Done

### 10.1 구현 게이트
- [ ] §1.4 엔진 1줄 추가 (`hasHeirAllocations` 확장)
- [ ] ① ② ③ FormState `DebtItem[] | undefined` 변경 + sessionStorage 강등
- [ ] ⑤ Step 2 토글 재작성 + AlertDialog 통합 + 데드 코드 제거 + hint 동적
- [ ] ⑤' DebtAllocationInput 봉안 ToggleCard + 정적 색조 매핑 + sky 안내 카드
- [ ] ⑥ inheritance-summary.ts 타입+가드 2줄
- [ ] ⑦ DebtAllocationResultCard/ 4파일 신규 + InheritanceTaxResultView 통합
- [ ] ⑧ Validation `undefined` 분기 + ON 빈 항목 차단 + 채권자명·금액 필수

### 10.2 의존 컴포넌트
- [ ] AlertDialog 컴포넌트 추가 (`alert-dialog.tsx`) OR Dialog 기반 ConfirmDialog 자체 구현
- [ ] ToggleCard `variant="chip"`/`size="sm"` props 실재 확인 후 적용

### 10.3 회귀·테스트
- [ ] anchor IDA-1~13 + IDA-LEGACY-1~3 100% 통과
- [ ] §1.4 엔진 변경 영향 anchor (기존 inheritance/__tests__/ 전건 통과)
- [ ] `npx tsc --noEmit` 0건
- [ ] `npx vitest run __tests__/tax-engine/inheritance/` 전건 통과
- [ ] 전체 회귀 0건

### 10.4 UI·접근성·반응형
- [ ] 브라우저 수동 §8.2 표 11 시나리오 모두 확인
- [ ] 모바일 viewport 320·375·414·640px 4단계 표 가로 스크롤 동작 확인
- [ ] 태블릿 viewport 768px 표 단일/분할 가독성 확인
- [ ] 다크모드 4 카테고리 색조 가독성 확인 (버튼 hover·카드 border·chip 모두)
- [ ] AlertDialog focus-trap·ESC·Tab 순환·외부 클릭 확인
- [ ] AlertDialog 닫기 시 ToggleCard 상태 불변 확인 (§3.2 상태 보장 정책)

### 10.5 정책 준수
- [ ] 800줄 정책 모든 파일 준수
- [ ] 숫자 "원" 단위 미표기 (`formatKRW()`만)
- [ ] PDF 변수명 페이지+행 번호 동결 (`idaP1858Row1KBank` 등)
- [ ] `feedback_ui_engine_dual_truth_avoidance` — UI 자체 계산 0건
