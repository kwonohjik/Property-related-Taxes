# 일반 상속재산 협의분할 UI 통합 설계서 (v4)

> **상태**: Design v4 (1차·2차 자체검토 + Plan↔Design 통합 검토 반영)

## v3 → v4 정정 (Plan ↔ Design 통합 검토)

| # | 카테고리 | 정정 |
|---|---|---|
| U-S1 | 일관성 | Plan v5 §11 변경 파일 표와 동기화 — 본 Design의 §3·§4·§4-bis·§5에서 다루는 모든 컴포넌트(`PropertyValuationForm` / `StockValuationForm` / `HeirAllocationToggleSection` / `HeirAllocationInput` / `HeirAllocationResultCard` / `InheritanceResultView`)를 한 표로 묶어 §13 DoD에 명시 |
| U-S2 | 일관성 | anchor 분류 명확화: 엔진 anchor 8건(A1·A2·C3·C4·C5·C6·C8·C9) + UI anchor 1건(C7) + 회귀 2건(C1·C2). Plan v5와 동일 |
> **작성일**: 2026-05-21
> **참조 Plan**: [`docs/00-pm/inheritance-asset-heir-allocation-ui.plan.md`](../../00-pm/inheritance-asset-heir-allocation-ui.plan.md) v4

## v2 → v3 정정 (자체검토 2차)

| # | 카테고리 | 정정 |
|---|---|---|
| DC5 | 오류 | `ItemEditor` props는 `onUpdate`·`onRemove` (PropertyValuationForm.tsx:86). 디자인 코드의 `set(...)` → **`onUpdate(...)`** 전 영역 정정 |
| DO6 | 누락 | `deemedCategory`(retirement/insurance/trust) 자산도 일반 EstateItem이므로 협의분할 토글 동일 노출 정책 명시. 단, 간주상속재산 본체는 `presumedItems`로 별도 입력되며 `EstateItem.deemedCategory`는 결과 표시 분류용 |
| DO7 | 누락 | HeirAllocationResultCard 모바일 반응형 — 5열 테이블을 `overflow-x-auto` 컨테이너로 감싸 가로 스크롤 + 모바일 폭 시 카드 컬럼 축약 |
| DO8 | 누락 | `Card`·`CardHeader`·`CardTitle`·`CardDescription`·`CardContent` import: `@/components/ui/card` |
| DO9 | 누락 | `CalculationStepRow` 없음 → CalculationStep 인라인 표시 (`{step.label}: {formatKRW(step.amount)}` + 선택적 `note`) |
| DI4 | 개선 | §4 IIFE 제거 — `HeirAllocationToggleSection` 보조 컴포넌트로 추출. `ItemEditor` 가독성 + 800줄 정책 안전 마진 확보 |

## v1 → v2 정정 (자체검토 1차)

| # | 카테고리 | 정정 |
|---|---|---|
| DE1 | 오류 | `EstateItem` 감정평가액 필드명 `appraisalValue` → **`appraisedValue`** (types 라인 71) 전 영역 정정 |
| DO1 | 누락 | `StockValuationForm`도 props (mode/heirs) 확장 + ToggleCard 통합 추가 (주식도 EstateItem) |
| DO3 | 누락 | HeirAllocationResultCard "합계" 행 — `Array.from(perHeir.values()).reduce()` 명시 |
| DO4 | 누락 | `formatKRW` from `@/components/calc/inputs/CurrencyInput`, `heirShortLabel` from `@/components/calc/inheritance/HeirAllocationInput` (export 추가 필요) |
| DO5 | 오류 | 인쇄 자동 펼침 패턴 `details print:open` → `className={open ? "block" : "hidden print:block"}` ([[print-only-css-toggle]] 표준) |
| DC1 | 모순 | anchor 분류 명확화: 엔진 anchor(A1·A2·C3·C4·C5·C6·C8·C9 8건), UI anchor(C7), 회귀(C1·C2) |
| DC2 | 모순 | distributableHeirs 정책 — HeirAllocationInput 내부 단일 진실. ItemEditor에서는 컴포넌트가 자동 필터함을 신뢰하고 `corporate` 제외 로직 중복 작성 금지 |
| DI3 | 개선 | `Heir.age` 없음 → `birthDate?: string`. anchor 코드 정정 |

---

## §1. 개요

### 1.1 목적

`PropertyValuationForm`의 각 자산 카드에 **상속인·수유자별 협의분할 입력 UI**를 노출하고, 결과 화면에 **상속인별 세액 카드**를 신규 추가한다. 마법사 단계를 재구성해 협의분할 입력 *전*에 상속인 등록이 끝나도록 한다.

### 1.2 선행 PR 1 ↔ 메인 PR 2

```
선행 PR 1 (단계 재구성)        메인 PR 2 (자산 협의분할 UI + 결과 카드)
─────────────────              ───────────────────────────────────
STEPS 6→5                      PropertyValuationForm props 확장
HeirComposition → Step 0       ItemEditor에 ToggleCard 통합
Step 4 → "공제·세액공제"       HeirAllocationResultCard 신규
validateStep Step 0 차단       InheritanceResultView 연결
                               anchor 5건
```

### 1.3 법령 근거

| 조문 | 내용 |
|---|---|
| 민법 §1013 | 공동상속인의 협의분할 |
| 민법 §1073 | 유증 — 상속인 외의 자에게도 가능 |
| 민법 §1009 | 법정상속분 (협의 부재 시) |
| 상증법 §3의2 | 수유자도 받았거나 받을 재산 한도 연대납부의무 |
| 상증령 §3 ② | 협의분할 또는 유증 취득가액 기준 안분 |

영리법인(corporate) 협의분할 처리: 통상 유증·사인증여로 별도 처리되며, 일반 상속재산 협의분할 대상이 아님. `HeirAllocationInput`의 `distributableHeirs.filter((h) => h.relation !== "corporate")` 정책 유지.

---

## §2. 마법사 단계 재구성 (선행 PR 1)

### 2.1 STEPS 상수

`components/calc/inheritance/shared.ts:89`

| 구 (v1) | 신 (v2) |
|---|---|
| 0: 피상속인 정보 | 0: **피상속인·상속인** |
| 1: 상속재산 | 1: 상속재산 |
| 2: 비과세·장례비 | 2: 비과세·장례비 |
| 3: 사전증여 | 3: 사전증여 |
| 4: 상속인·공제 | 4: **공제·세액공제** |
| 5: 세액공제 | (삭제 — Step 4 통합) |

```ts
export const STEPS = [
  "피상속인·상속인",
  "상속재산",
  "비과세·장례비",
  "사전증여",
  "공제·세액공제",
] as const;
```

### 2.2 Step 0 레이아웃 (color card + section number)

`components/calc/CLAUDE.md` 다-섹션 입력 폼 강제 규칙 적용.

```tsx
function Step0PrincipalAndHeirs({ form, set }) {
  return (
    <div className="space-y-3">
      {/* 섹션 ① — sky tone */}
      <div className="rounded-lg border border-sky-200 bg-sky-50/40 p-3 space-y-2">
        <div className="flex items-center gap-2">
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-sky-200 text-[10px] font-bold text-sky-800 select-none">
            1
          </span>
          <p className="text-xs font-semibold text-sky-700">피상속인 기본 정보</p>
        </div>
        {/* 거주자 여부 라디오 + 사망일 + 신고기한 (기존 Step 0 컨텐츠 그대로) */}
      </div>

      {/* 섹션 ② — violet tone */}
      <div className="rounded-lg border border-violet-200 bg-violet-50/40 p-3 space-y-2">
        <div className="flex items-center gap-2">
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-violet-200 text-[10px] font-bold text-violet-800 select-none">
            2
          </span>
          <p className="text-xs font-semibold text-violet-700">상속인·수유자 구성</p>
        </div>
        <p className="text-[11px] text-muted-foreground leading-relaxed">
          ※ 협의분할 대상에 포함될 모든 <strong>자연인</strong>(법정상속인 + 수유자)을 등록하세요.
          영리법인은 사전증여·유증 전용으로 별도 처리되며 일반 상속재산 협의분할 대상이 아닙니다.
        </p>
        <HeirComposition heirs={form.heirs} onChange={(heirs) => set({ heirs })} />
      </div>
    </div>
  );
}
```

### 2.3 validateStep 갱신

`components/calc/InheritanceTaxForm.tsx:132`

```ts
function validateStep(step: number, form: FormState): string | null {
  if (step === 0) {
    if (!form.deathDate) return "사망일을 입력하세요.";
    if (form.heirs.length === 0)
      return "상속인·수유자를 1명 이상 등록하세요.";  // 신규
  }
  // ... 나머지 단계
}
```

`lib/calc/inheritance-validate.ts`에도 동일 차단 추가 — UI/Validate 동기화 ⑧.

---

## §3. PropertyValuationForm props 확장 (메인 PR 2)

### 3.1 시그니처

```ts
// 변경 전
export interface PropertyValuationFormProps {
  items: EstateItem[];
  onChange: (items: EstateItem[]) => void;
}

// 변경 후
export interface PropertyValuationFormProps {
  items: EstateItem[];
  onChange: (items: EstateItem[]) => void;
  mode: "inheritance" | "gift";   // 신규
  heirs?: Heir[];                  // 신규 — inheritance 시 필수
}
```

### 3.2 호출처 매핑

| 위치 | 변경 |
|---|---|
| `components/calc/inheritance/steps.tsx:76` | `<PropertyValuationForm items={…} onChange={…} mode="inheritance" heirs={form.heirs} />` |
| `components/calc/GiftTaxForm.tsx:381` | `<PropertyValuationForm items={…} onChange={…} mode="gift" />` (heirs 미전달) |

### 3.3 평가액 도출 헬퍼

`PropertyValuationForm` 내부 (라인 293-300의 기존 우선순위 그대로 재사용):

```ts
function computeEffectiveValuation(item: EstateItem): number {
  // 우선순위: 시가 > 감정가액 > 기준시가 (PropertyValuationForm 기존 패턴)
  return item.marketValue ?? item.appraisedValue ?? item.standardPrice ?? 0;
}
```

상장주식 자산의 경우 `listedStockAvgPrice × listedStockShares` 도출 — `StockValuationForm`에서 별도 헬퍼.

---

## §4. ItemEditor 협의분할 토글

자산 카드 최하단(기준시가 입력 다음, 삭제 버튼 위) 배치.

[[single-source-engine-helper]] 적용 — `distributableHeirs` 필터 로직은 `HeirAllocationInput` 내부에만 존재. ItemEditor에서는 `hasDistributableHeir` export 함수로 자연인 카운트만 확인.

[[feedback_pdca_session_efficiency]] / [[800줄 정책]] — IIFE 대신 별도 컴포넌트 추출:

```tsx
// components/calc/inheritance/HeirAllocationToggleSection.tsx (신규 ~70줄)
import {
  HeirAllocationInput,
  hasDistributableHeir,
} from "@/components/calc/inheritance/HeirAllocationInput";
import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import type { EstateItem, Heir, HeirAllocation } from "@/lib/tax-engine/types/inheritance-gift.types";

interface HeirAllocationToggleSectionProps {
  item: EstateItem;
  heirs: Heir[];
  effectiveValuation: number;
  onChange: (patch: Partial<EstateItem>) => void;
}

export function HeirAllocationToggleSection({
  item, heirs, effectiveValuation, onChange,
}: HeirAllocationToggleSectionProps) {
  const canDistribute = hasDistributableHeir(heirs);  // corporate 제외 자연인 1명+
  const isDisabled = !canDistribute || effectiveValuation === 0;
  const disabledReason = !canDistribute
    ? "Step 0에서 상속인·수유자(자연인)를 먼저 등록하세요"
    : "평가액을 먼저 입력하세요";

  return (
    <ToggleCard
      tone="violet"
      title="상속인·수유자별 협의분할 입력"
      description="OFF: 법정상속분(민법 §1009)으로 자동 안분 / ON: 상속인·수유자에게 직접 분배 (민법 §1013·§1073). 영리법인은 협의분할 대상이 아닙니다."
      disabled={isDisabled}
      disabledReason={disabledReason}
      checked={!!item.heirAllocations}
      onCheckedChange={(on) => {
        if (on) {
          const firstHeir = heirs.find((h) => h.relation !== "corporate");
          const initial: HeirAllocation[] = firstHeir
            ? [{ heirId: firstHeir.id, amount: effectiveValuation }]
            : [];
          onChange({ heirAllocations: initial });
        } else {
          onChange({ heirAllocations: undefined });
        }
      }}
    >
      <HeirAllocationInput
        allocations={item.heirAllocations ?? []}
        expectedTotal={effectiveValuation}
        heirs={heirs}
        onChange={(allocs) => onChange({ heirAllocations: allocs })}
      />
    </ToggleCard>
  );
}
```

`ItemEditor` 내부 호출 (PropertyValuationForm.tsx + StockValuationForm.tsx 양쪽):

```tsx
{mode === "inheritance" && heirs && (
  <HeirAllocationToggleSection
    item={item}
    heirs={heirs}
    effectiveValuation={computeEffectiveValuation(item)}
    onChange={(patch) => onUpdate(patch)}  // ★ set 아님, onUpdate (DC5)
  />
)}
```

`deemedCategory`(retirement/insurance/trust)가 붙은 EstateItem도 동일하게 토글 노출 (DO6). 간주상속재산 본체는 `presumedItems` 경로에 별도 입력되며, `EstateItem.deemedCategory`는 결과 카드 분류용 라벨에 불과.

---

## §4-bis. StockValuationForm 동일 적용 (DO1)

주식(`listed_stock`, `unlisted_stock`)은 `StockValuationForm`에서 별도 처리. 동일 props 확장 + ToggleCard 통합 필요.

```ts
// StockValuationForm props
export interface StockValuationFormProps {
  items: EstateItem[];
  onChange: (items: EstateItem[]) => void;
  mode: "inheritance" | "gift";   // 신규
  heirs?: Heir[];                  // 신규
}
```

상장주식 평가액 도출:
```ts
function computeStockValuation(item: EstateItem): number {
  if (item.category === "listed_stock") {
    const avg = item.listedStockAvgPrice ?? 0;
    const shares = item.listedStockShares ?? 0;
    return avg * shares;
  }
  // 비상장: unlistedStockData 결과 — 보충적 평가 결과값 (별도 헬퍼)
  return 0;  // TODO: unlistedStockValuation 헬퍼 연동
}
```

`ItemEditor` (StockValuationForm 내부) 최하단에 `§4 ItemEditor 협의분할 토글`과 동일 패턴 적용.

호출처:
| 위치 | 변경 |
|---|---|
| `components/calc/inheritance/steps.tsx:82` | `<StockValuationForm ... mode="inheritance" heirs={form.heirs} />` |
| `components/calc/GiftTaxForm.tsx:387` | `<StockValuationForm ... mode="gift" />` |

---

## §5. HeirAllocationResultCard 신규

`components/calc/results/HeirAllocationResultCard.tsx`

### 5.1 엔진 결과 형식

```ts
r.heirAllocationResult?: {
  perHeir: Map<string, HeirTaxBreakdown>;   // heirId → HeirTaxBreakdown
  distributableTax: number;
  indirectDistributionBase: number;
  indirectNumerator: number;
  computedTaxShareDenominator: number;
  breakdown: CalculationStep[];
}

// HeirTaxBreakdown — types/inheritance-gift.types.ts:436~468
interface HeirTaxBreakdown {
  directTaxBaseShare: number;
  indirectTaxBaseShare: number;
  taxBaseShare: number;
  computedTaxShare: number;
  generationSkipSurcharge: number;
  priorGiftCredit: number;
  preFilingCreditTax: number;
  filingCredit: number;
  finalTax: number;
}
```

### 5.2 카드 레이아웃

```
┌─ 상속인별 자진납부세액 (협의분할 기준) ───────────────────────────┐
│  ※ 민법 §1013 협의분할에 의한 안분 결과                              │
│                                                                       │
│  ┌─────────────────┬─────────────┬──────────┬──────────┬───────────┐ │
│  │ 상속인          │ 과세표준    │ 산출세액 │ 세대생략 │ 자진납부  │ │
│  │                 │ 상당액      │ 상당액   │ 할증     │ 세액      │ │
│  ├─────────────────┼─────────────┼──────────┼──────────┼───────────┤ │
│  │ 배우자 (홍길동) │ 700,000,000 │ 80,000K  │ 0        │ 78,000K   │ │
│  │ 장남 (홍철수)   │ 200,000,000 │ 20,000K  │ 0        │ 19,400K   │ │
│  │ 수유자 (손녀)   │ 100,000,000 │ 10,000K  │ 3,000K   │ 12,610K   │ │
│  ├─────────────────┼─────────────┼──────────┼──────────┼───────────┤ │
│  │ 합계            │ … (검증용)  │ …        │ …        │ …         │ │
│  └─────────────────┴─────────────┴──────────┴──────────┴───────────┘ │
│                                                                       │
│  ▼ 펼침: 산식 상세 (CalculationStep 목록)                            │
└───────────────────────────────────────────────────────────────────────┘
```

### 5.3 컴포넌트 스켈레톤

```tsx
import { useState } from "react";
import {
  Card, CardHeader, CardTitle, CardDescription, CardContent,
} from "@/components/ui/card";
import { formatKRW } from "@/components/calc/inputs/CurrencyInput";
import { heirShortLabel } from "@/components/calc/inheritance/HeirAllocationInput";
// ↑ HeirAllocationInput의 heirShortLabel·hasDistributableHeir을 export 추가
import type { Heir, HeirAllocationResult, HeirTaxBreakdown, CalculationStep } from "@/lib/tax-engine/types/inheritance-gift.types";

interface HeirAllocationResultCardProps {
  result: HeirAllocationResult;
  heirs: Heir[];
}

export function HeirAllocationResultCard({ result, heirs }: HeirAllocationResultCardProps) {
  const [open, setOpen] = useState(false);

  const rows = heirs
    .map((h) => ({ heir: h, bd: result.perHeir.get(h.id) }))
    .filter((r): r is { heir: Heir; bd: HeirTaxBreakdown } => r.bd !== undefined);

  // 합계 행 — perHeir 순회 sum
  const totals = rows.reduce(
    (acc, { bd }) => ({
      taxBaseShare: acc.taxBaseShare + bd.taxBaseShare,
      computedTaxShare: acc.computedTaxShare + bd.computedTaxShare,
      generationSkipSurcharge: acc.generationSkipSurcharge + bd.generationSkipSurcharge,
      finalTax: acc.finalTax + bd.finalTax,
    }),
    { taxBaseShare: 0, computedTaxShare: 0, generationSkipSurcharge: 0, finalTax: 0 }
  );

  return (
    <Card className="border-violet-200 bg-violet-50/30">
      <CardHeader>
        <CardTitle>상속인별 자진납부세액 (협의분할 기준)</CardTitle>
        <CardDescription>민법 §1013 협의분할 안분 결과 (상증법 §3의2)</CardDescription>
      </CardHeader>
      <CardContent>
        {/* 모바일 가로 스크롤 컨테이너 (DO7) */}
        <div className="overflow-x-auto -mx-3 px-3">
        <table className="w-full text-sm min-w-[640px]">
          <thead>
            <tr>
              <th className="text-left">상속인·수유자</th>
              <th className="text-right">과세표준상당액</th>
              <th className="text-right">산출세액상당액</th>
              <th className="text-right">세대생략 할증</th>
              <th className="text-right">자진납부세액</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ heir, bd }) => (
              <tr key={heir.id}>
                <td>{heirShortLabel(heir)}</td>
                <td className="text-right tabular-nums">{formatKRW(bd.taxBaseShare)}</td>
                <td className="text-right tabular-nums">{formatKRW(bd.computedTaxShare)}</td>
                <td className="text-right tabular-nums">{formatKRW(bd.generationSkipSurcharge)}</td>
                <td className="text-right tabular-nums font-semibold">{formatKRW(bd.finalTax)}</td>
              </tr>
            ))}
            <tr className="border-t-2 font-semibold">
              <td>합계</td>
              <td className="text-right tabular-nums">{formatKRW(totals.taxBaseShare)}</td>
              <td className="text-right tabular-nums">{formatKRW(totals.computedTaxShare)}</td>
              <td className="text-right tabular-nums">{formatKRW(totals.generationSkipSurcharge)}</td>
              <td className="text-right tabular-nums">{formatKRW(totals.finalTax)}</td>
            </tr>
          </tbody>
        </table>
        </div>

        {/* [[print-only-css-toggle]] 표준 패턴 — 인쇄 시 자동 펼침 */}
        <button
          type="button"
          onClick={() => setOpen((p) => !p)}
          className="mt-3 cursor-pointer text-xs text-violet-700 print:hidden"
        >
          {open ? "▲ 산식 상세 접기" : "▼ 산식 상세 보기"}
        </button>
        <div className={open ? "mt-2 space-y-1" : "hidden print:block mt-2 space-y-1"}>
          {result.breakdown.map((step, i) => (
            <div key={i} className="text-xs text-muted-foreground">
              <span className="font-medium">{step.label}</span>
              {step.amount !== undefined && (
                <span className="ml-2 tabular-nums">{formatKRW(step.amount)}</span>
              )}
              {step.note && <span className="ml-2 italic">— {step.note}</span>}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
```

**컬럼 우선순위**: 자진납부세액(굵게) > 과세표준상당액 > 산출세액상당액 > 세대생략할증. 신고세액공제·사전증여세액공제 등은 펼침 상세에서.

`heirShortLabel` + `hasDistributableHeir` export 추가 작업이 메인 PR 2 변경 파일에 포함됨 (HeirAllocationInput.tsx 2줄). 신규 export 함수:

```ts
// HeirAllocationInput.tsx 신규 export
export function hasDistributableHeir(heirs: Heir[]): boolean {
  return heirs.some((h) => h.relation !== "corporate");
}
export { heirShortLabel };  // 기존 내부 함수 → export 추가
```

### 5.4 InheritanceResultView 통합

```tsx
{result.heirAllocationResult && form.heirs.length > 0 && (
  <HeirAllocationResultCard
    result={result.heirAllocationResult}
    heirs={form.heirs}
  />
)}
```

---

## §6. 케이스 인벤토리 (필수)

| # | 시나리오 | mode | heirs | item.heirAllocations | 엔진 분기 | UI 표시 | Pre-Do anchor |
|---|---|---|---|---|---|---|---|
| C1 | 상속인 미입력 | inheritance | 0명 | - | hasHeirAllocations=false | 토글 disabled | - |
| C2 | 법정상속분 자동 안분 | inheritance | 2명+ | undefined | 자동 안분 | 토글 OFF | (회귀) |
| C3 | 배우자 100% | inheritance | 배우자+자녀 | `[{spouse: 전액}]` | STEP 13 활성 | 토글 ON, 1명 분배, 합계 ✓ | **A1** |
| C4 | 수유자(legatee) + 세대생략 | inheritance | 배우자+자녀+손녀(legatee, isGenerationSkipBeneficiary) | `[{50%,30%,20%}]` | STEP 13 + perHeir 손녀에 generationSkipSurcharge | 토글 ON, 3명 분배 | **A2** |
| C5 | 합계 불일치 | inheritance | 2명 | sum ≠ effectiveValuation | validate 차단 | rose 경고 (HeirAllocationInput 내부) | C5 |
| C6 | orphaned heirId (상속인 삭제) | inheritance | 1명 (h2 삭제됨) | `[{heirId:"h2", ...}]` | validate 차단 (inheritance-validate.ts:127) | rose 경고 | C6 |
| C7 | 증여세 모드 | gift | - | - | (해당 없음) | 토글 미렌더 | C7 |
| C8 | 법인만 등록 | inheritance | 배우자+법인(corporate) | - | corporate는 분배 대상 자동 제외 | HeirAllocationInput 행에서 법인 미노출, 배우자만 노출 | C8 |
| C9 | 평가액 0 | inheritance | 2명+ | - | - | 토글 disabled "평가액을 먼저 입력하세요" | C9 |

---

## §7. Pre-Do anchor 코드 동결

`__tests__/tax-engine/inheritance/asset-heir-allocation-anchor.test.ts`

```ts
import { describe, it, expect, beforeAll } from "vitest";
import { calculateInheritanceTax } from "@/lib/tax-engine/inheritance-tax";
import type { InheritanceTaxInput, Heir, EstateItem } from "@/lib/tax-engine/types/inheritance-gift.types";

function buildBaseInput(overrides: {
  heirs: Heir[];
  estateItems: EstateItem[];
}): InheritanceTaxInput {
  return {
    decedent: {
      residentStatus: "domestic",
      deathDate: new Date("2026-01-01"),
      hasSpouse: overrides.heirs.some(h => h.relation === "spouse"),
    },
    heirs: overrides.heirs,
    estateItems: overrides.estateItems,
    presumedItems: [],
    debtItems: [],
    preGiftsWithin10Years: [],
    creditInput: { isFiledOnTime: true, /* … */ },
    // (필수 필드는 inheritance-tax.ts 시그니처 참조)
  };
}

// Heir.age 필드 없음 → birthDate 사용 (생년 도출용, anchor에서는 선택)

describe("Pre-Do anchor — 자산 협의분할", () => {
  let rates;
  beforeAll(async () => {
    rates = await loadTaxRatesForTest();
  });

  it("[A1] heirAllocations 입력 시 STEP 13 활성 + 배우자 100% 분배", () => {
    const input = buildBaseInput({
      heirs: [
        { id: "h1", relation: "spouse", name: "배우자", birthDate: "1965-01-01" },
        { id: "h2", relation: "lineal_descendant", name: "장남", birthDate: "1995-01-01" },
      ],
      estateItems: [{
        id: "a1",
        category: "real_estate_apartment",
        marketValue: 1_000_000_000,
        heirAllocations: [{ heirId: "h1", amount: 1_000_000_000 }],
      }],
    });
    const r = calculateInheritanceTax(input, rates);
    expect(r.heirAllocationResult).toBeDefined();
    const h1 = r.heirAllocationResult!.perHeir.get("h1")!;
    const h2 = r.heirAllocationResult!.perHeir.get("h2")!;
    expect(h1.finalTax).toBeGreaterThan(0);
    expect(h2.finalTax).toBe(0);
  });

  it("[A2] 수유자(legatee) + 세대생략 할증 정상 작동", () => {
    const input = buildBaseInput({
      heirs: [
        { id: "h1", relation: "spouse", name: "배우자", birthDate: "1965-01-01" },
        { id: "h3", relation: "legatee", name: "손녀(수유자)", birthDate: "2005-01-01",
          beneficiaryType: "legatee", isGenerationSkipBeneficiary: true },
      ],
      estateItems: [{
        id: "a1",
        category: "real_estate_apartment",
        marketValue: 1_000_000_000,
        heirAllocations: [
          { heirId: "h1", amount: 700_000_000 },
          { heirId: "h3", amount: 300_000_000 },
        ],
      }],
    });
    const r = calculateInheritanceTax(input, rates);
    const h3 = r.heirAllocationResult!.perHeir.get("h3")!;
    expect(h3.finalTax).toBeGreaterThan(0);
    expect(h3.generationSkipSurcharge).toBeGreaterThan(0);
  });
});
```

**실행 결과**:
- A1·A2 PASS → UI 통합(Do) 진행
- 실패 → 엔진 STEP 13/세대생략 분기 재확인 → Plan/Design 환류

---

## §8. 8개 동기화 지점 매핑

| # | 지점 | 상속세 (메인 PR 2) | 증여세 (영향) |
|---|---|---|---|
| ① | 폼 상태 타입 | `EstateItem.heirAllocations` (이미 존재) | (변경 없음) |
| ② | initial value | INITIAL_FORM에 heirAllocations undefined (현행) | (변경 없음) |
| ③ | normalize fallback | 토글 OFF 전환 시 undefined 강제 (onCheckedChange) | (gift는 mode 분기로 토글 자체 미렌더) |
| ④ | API 변환 | `inheritance-api.ts:71` estateItems spread — 점검만 ✅ | (변경 없음) |
| ⑤ | UI 위젯 | ItemEditor에 ToggleCard + HeirAllocationInput (신규) | mode="gift" 미렌더 (신규) |
| ⑥ | 사이드바 합계 | 영향 없음 | - |
| ⑦ | 결과 카드 | HeirAllocationResultCard 신규 + InheritanceResultView 연결 | - |
| ⑧ | Validation | `inheritance-validate.ts:30,127` 이미 동작 — 점검만 ✅ | - |
| ⑭ | Route handler | `app/api/calc/inheritance/route.ts:72` estateItems 명시 매핑 — 점검만 ✅ | - |

---

## §9. 컴포넌트 호출 트리

```
InheritanceTaxForm
  └─ Step 0 (피상속인·상속인)
      ├─ [섹션 ①] 피상속인 기본 정보 (DateInput, 거주자 라디오)
      └─ [섹션 ②] HeirComposition ←── (선행 PR 1: Step 4에서 이동)
          ├─ legatee 옵션
          └─ corporate 옵션
  └─ Step 1 (상속재산)
      └─ PropertyValuationForm (mode="inheritance", heirs={form.heirs})
          └─ ItemEditor (자산별)
              ├─ 기본 입력 (자산명, marketValue, appraisalValue, standardPrice)
              └─ ToggleCard (violet, 협의분할)  ←── (메인 PR 2 신규)
                  └─ HeirAllocationInput (allocations, expectedTotal, heirs)

GiftTaxForm
  └─ PropertyValuationForm (mode="gift")  ←── (메인 PR 2 신규)
      └─ ItemEditor (협의분할 토글 미렌더)

InheritanceResultView
  ├─ 요약 카드
  ├─ CalculationStep 목록
  ├─ HeirAllocationResultCard  ←── (메인 PR 2 신규)
  │   └─ result.heirAllocationResult.perHeir 순회
  └─ DisclaimerBanner
```

---

## §10. props drilling 경로 (heirs 전달)

```
InheritanceTaxForm.useState<FormState>
  └─ form.heirs: Heir[]
      ↓ props
  inheritance/steps.tsx Step1Component
      └─ <PropertyValuationForm heirs={form.heirs} mode="inheritance" />
          ↓ props
      ItemEditor
          ↓ props
      <ToggleCard ...>
        <HeirAllocationInput heirs={heirs} expectedTotal={effectiveValuation} />
```

4단계 drilling — TS strict + 호출처 grep 자가점검 강제.

---

## §11. 위험·대응

| 항목 | 위험 | 대응 |
|---|---|---|
| Step 0 길이 | HeirComposition 추가로 화면 길어짐 | 색상 카드 + 섹션 번호 패턴, HeirComposition 자체가 접이식 |
| props drilling 4단계 | 호출처 누락 | TS strict + grep, sync-checker 결과 첨부 |
| mode prop 누락 시 동작 | mode를 required로 강제 → 모든 호출처 즉시 컴파일 오류 | (의도된 강제) |
| corporate 분배 정책 사용자 혼동 | 토글 description + Step 0 안내 텍스트로 명시 | "영리법인은 사전증여·유증 전용" 문구 강제 |
| validation 차단 메시지 | UX 마찰 | "Step 0에서 상속인·수유자를 먼저 등록하세요" 명확 메시지 |
| HeirAllocationResultCard 산식 표시 | 사용자가 안분 산식 이해 필요 | `result.breakdown` `CalculationStep` 펼침 노출 + print 자동 펼침 (print-only-css-toggle skill) |

---

## §12. 정책 사전 적용 ([[MEMORY.md]])

- [[feedback_useeffect_store_mirror_forbidden]]: onCheckedChange 직접 set ✅
- [[feedback_toggle_card_visibility]]: violet tone OFF 배경 유지 ✅
- [[feedback_validation_sync_8th_point]]: validateStep + inheritance-validate 둘 다 동기 ✅
- [[feedback_no_silent_apportion_fallback]]: 합계 불일치 차단, 자동 보정 금지 ✅
- [[feedback_ui_input_path_enumeration]]: C1~C9 9케이스 enumerate ✅
- [[feedback_pre_anchor_verification]]: A1·A2 Pre-Do anchor 명시 ✅
- [[feedback_ui_order_follows_logic]]: heirs 입력이 자산 입력보다 선행 ✅
- [[feedback_pdca_session_efficiency]]: PR 2단계 분할 ✅
- [[feedback_explicit_prop_mapping_strip]]: PropertyValuationForm 호출처 mode/heirs 명시 (spread 미사용) ✅
- [[feedback_section_card_numbering]]: Step 0 sky/violet 섹션 카드 + 번호 ✅
- [[print-only-css-toggle]]: HeirAllocationResultCard `details` `print:open` ✅
- [[single-source-engine-helper]]: heirShortLabel 헬퍼는 HeirAllocationInput에서 export 후 결과 카드 재사용 (TODO 메모)

---

## §13. Definition of Done

### 선행 PR 1 (단계 재구성)

- [ ] STEPS 상수 5단계
- [ ] Step 0 색상 카드 + 섹션 번호 패턴 적용
- [ ] HeirComposition Step 0으로 이동, Step 4 (구 4·5) 통합
- [ ] validateStep Step 0에서 heirs.length 차단
- [ ] inheritance-validate.ts 동기 차단
- [ ] 기존 inheritance anchor 회귀 0
- [ ] 브라우저: Step 0 입력 → Step 2 채무 협의분할 정상 작동
- [ ] `npx tsc --noEmit` 0건

### 메인 PR 2 (자산 협의분할 + 결과 카드)

- [ ] Pre-Do anchor A1·A2 PASS
- [ ] PropertyValuationForm props (mode, heirs) 확장
- [ ] 호출처 2곳 grep 자가점검 후 전달
- [ ] ItemEditor ToggleCard + effectiveValuation + corporate 제외 정책
- [ ] HeirAllocationResultCard 신규 + InheritanceResultView 연결
- [ ] **엔진 anchor**: A1·A2·C3·C4·C5·C6·C8·C9 8건 PASS
- [ ] **UI anchor** (RTL): C7(gift 모드 토글 미렌더) 1건 PASS
- [ ] **회귀**: C1·C2 (자동 안분 동작 유지)
- [ ] `npx tsc --noEmit` 0건
- [ ] 회귀 0건
- [ ] 브라우저 수동 확인 (자산 협의분할 ON/OFF, 수유자 분배, 법인 자동 제외, 합계 경고, 결과 카드 표시·산식 펼침)
- [ ] `ui-engine-sync-checker` 결과 첨부
- [ ] 800줄 정책 준수 (PropertyValuationForm 583줄 예상)
