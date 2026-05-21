# 채무·공과금·장례비 협의분할 입력 기능 구현 계획 (v2)

> **목표**: 상속세 마법사 Step 2의 협의분할 입력 토글을 정식 활성화하고, 사용자가 실제로 항목별 채권자명·상속인별 변제 분담을 입력해 상속인별 산출세액 배부 결과까지 받을 수 있도록 마감한다.
>
> **법령 근거**: 상증법 §14①1·2·3호 (채무·공과금·장례비) / §3·§28 + 집행기준 19-17-1 + 재재산 46014-247(2000.8.26.) (상속인별 안분 배부)
>
> **PDF anchor**: 종합사례 PDF 책 1858 (3) 채무 협의분할 + 책 1864 상속인별 산출세액 배부 표
>
> **v1 → v2 변경점**: 방안 C(`debtItems?: undefined / [] / [...]` 3-state) 채택 · 데드 코드 제거 명시 · ⑥⑦ grep 검증 결과 반영 · ⑨~⑭ 정합 확인 · anchor prefix `IDA-` · OFF confirm() 본 PR 포함 · 혼합 시나리오 강제 · 800줄 사전 점검
>
> **v2 → v3 변경점**: `InheritanceSummaryFormInput` 타입 동기화 명시 · OFF 모드 hint 동적 처리 · `window.confirm()` → AlertDialog · 결과 카드 표시 항목 10종 + 800줄 분할 디렉터리 · PDF 변수명 페이지+행 동결 · IDA-LEGACY-1~3 명세
>
> **v3 → v4 변경점 (디자인 통합 후)**: **엔진 1줄 수정 추가** (`hasHeirAllocations` 진입 조건 확장 — `debtItems.heirAllocations`만으로도 협의분할 트리거) · 14지점 매트릭스에 ⓪ 추가 · IDA-ENGINE-1~3 회귀 anchor 추가 · 결과 카드 통합 위치 grep 게이트 정밀화 · Phase 순서에 엔진 1줄 작업 단계 신설

---

## 1. 현황 검증 (Grep 실측)

| 레이어 | 위치 | 상태 |
|---|---|---|
| 엔진 타입 `DebtItem`/`HeirAllocation` | `lib/tax-engine/types/inheritance-gift.types.ts:442,384,700` | ✅ optional |
| 엔진 채무 합산 + 장례비 한도 | `lib/tax-engine/inheritance-tax.ts:110-130` | ✅ `debtItems` 우선, 미입력 시 legacy fallback |
| 상속인 배부 13-2~13-13 | `lib/tax-engine/inheritance-allocation.ts` `calcHeirAllocation()` | ✅ |
| Zod 스키마 | `lib/validators/property-valuation-input.ts:224,310,315` `debtItems: z.array(debtItemSchema).optional()` | ✅ optional — 방안 C와 정합 |
| Route ⑭ 매핑 | `app/api/calc/inheritance/route.ts:66-76` | ✅ `debtItems` 그대로 전달 |
| Validation | `lib/calc/inheritance-validate.ts:112-139,165-185` | ✅ `checkAllocs("채무", debtItems)` 합계 검증 |
| 사이드바 합계 ⑥ | `lib/stores/inheritance-summary.ts:32,86,106-110` | ✅ `form.debtItems.length > 0` 분기 (방안 C에서 `?.length` 호환 필요) |
| UI 위젯 `DebtAllocationInput` | `components/calc/inheritance/DebtAllocationInput.tsx` 201줄 | ✅ 카테고리 칩 + `HeirAllocationInput` 재사용 |
| FormState | `components/calc/inheritance/shared.ts:27` `debtItems: DebtItem[]` (initial `[]`) | ⚠️ 방안 C로 `DebtItem[] | undefined` 변경 필요 |
| Step 2 진입 토글 | `components/calc/inheritance/steps.tsx:141,213-217` | ❌ derive 결함 + 데드 코드 |
| 결과 카드 ⑦ 협의분할 표시 | `components/calc/results/` grep 0건 | ❌ **미구현 — 신규 작업 필요** |

**결론**: 5개 레이어는 정합 → 결함 2건(Step 2 토글 + 결과 카드 ⑦) + 마이그레이션 1건(FormState 타입) + UI 마감 1건(봉안 ToggleCard) = **총 4개 PR Phase로 마감**

---

## 2. 결함 정밀 분석

### 2.1 토글 derive 결함 (steps.tsx:141)

```ts
const usesDebtItems = form.debtItems.length > 0;   // 토글 표시 신호
```

- 초기 `debtItems = []` → `usesDebtItems = false` → Switch OFF
- 사용자 ON 클릭 → `set({ debtItems: [], ... })` (이미 빈 배열) → `usesDebtItems = false` 유지 → Switch가 즉시 OFF로 복귀
- ON 분기 `<DebtAllocationInput>` 렌더 안 됨 → **카테고리 추가 버튼 도달 불가 → 영구 잠금**

### 2.2 데드 코드 (steps.tsx:213-217)

```tsx
{usesDebtItems && form.debtItems.length === 0 && (
  <p>위에서 채무·공과금·장례비를 카테고리별로 추가하세요.</p>
)}
```

`usesDebtItems = (debtItems.length > 0)`과 `debtItems.length === 0` 양립 불가 → **절대 렌더되지 않는 데드 코드**. 본 PR에서 제거.

---

## 3. 설계 — 방안 C (3-state Optional)

`FormState.debtItems`를 `DebtItem[] | undefined`로 변경. 추가 플래그·마이그레이션 모두 불필요.

| 상태 | 의미 | UI 분기 |
|---|---|---|
| `undefined` | OFF 모드 (legacy 단일금액) | `funeralExpense` + `debts` 입력 노출 |
| `[]` | ON 모드 진입, 빈 상태 | `<DebtAllocationInput items={[]}>` (카테고리 추가 버튼만) |
| `[{...}]` | ON 모드 데이터 있음 | `<DebtAllocationInput items={[...]}>` 전체 |

토글 derive: `form.debtItems !== undefined`

### 3.1 Step 2 재작성

```tsx
import { useState } from "react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export function Step2({ form, set }: { form: FormState; set: FormSet }) {
  const isAllocationMode = form.debtItems !== undefined;
  const [pendingDiscardConfirm, setPendingDiscardConfirm] = useState(false);

  const enterAllocationMode = () => {
    set({
      debtItems: [],
      funeralExpense: "",
      funeralIncludesBongan: false,
      debts: "",
    });
  };

  const exitAllocationMode = () => {
    set({ debtItems: undefined });
  };

  const handleToggle = (v: boolean) => {
    if (v) {
      enterAllocationMode();
    } else {
      if ((form.debtItems?.length ?? 0) > 0) {
        setPendingDiscardConfirm(true);
      } else {
        exitAllocationMode();
      }
    }
  };

  return (
    <div className="space-y-6">
      <ExemptionChecklist ... />

      <ToggleCard
        tone="amber"
        title="채무·공과·장례비 협의분할 입력"
        description="ON: 항목별 채권자명·상속인별 변제 분담 / OFF: 합계 단일 금액"
        checked={isAllocationMode}
        onCheckedChange={handleToggle}
      />

      {isAllocationMode ? (
        <DebtAllocationInput
          items={form.debtItems ?? []}
          heirs={form.heirs}
          onChange={(items) => set({ debtItems: items })}
        />
      ) : (
        <>{/* 장례비 + 공과금·채무 단일금액 입력 (기존 유지, hint 동적 — §3.7) */}</>
      )}

      <AlertDialog open={pendingDiscardConfirm} onOpenChange={setPendingDiscardConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>협의분할 입력 모드를 끄시겠습니까?</AlertDialogTitle>
            <AlertDialogDescription>
              입력한 채무·공과·장례비 {form.debtItems?.length ?? 0}개 항목이 모두 삭제되고
              단일 금액 입력 모드로 전환됩니다. 이 동작은 되돌릴 수 없습니다.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                exitAllocationMode();
                setPendingDiscardConfirm(false);
              }}
            >
              삭제하고 끄기
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
```

- 데드 코드 `:213-217` 제거 (안내 메시지는 `DebtAllocationInput.tsx:107-109` 빈 상태 분기에 이미 존재)
- ToggleCard 제목에서 "(Phase A0)" 내부 코드명 제거 — 사용자 노출 불필요

### 3.2 sessionStorage 마이그레이션

legacy 스토어에 `debtItems: []`로 저장된 사용자 → 의미상 OFF 모드로 해석:

```ts
// shared.ts normalize 또는 calc-wizard-store.ts merge
debtItems: Array.isArray(data.debtItems) && data.debtItems.length > 0
  ? data.debtItems
  : undefined,
```

빈 배열을 undefined로 강등 → 사용자가 ON 모드 명시 클릭 시에만 진입.

### 3.3 사이드바 합계 ⑥ 호환

`lib/stores/inheritance-summary.ts:32` 입력 타입도 동기화:
```ts
export interface InheritanceSummaryFormInput {
  // ...
  debtItems: DebtItem[] | undefined;   // ← 방안 C 동기화 (현재 DebtItem[])
  // ...
}
```

`:106` 본문:
```ts
if (form.debtItems && form.debtItems.length > 0) {   // 변경
```

**grep 전수 영향 매트릭스** (방안 C 적용 시 정정 대상):

| 위치 | 현재 | 변경 |
|---|---|---|
| `shared.ts:27` FormState | `debtItems: DebtItem[]` | `debtItems: DebtItem[] | undefined` |
| `shared.ts:66` INITIAL_FORM | `debtItems: []` | `debtItems: undefined` |
| `inheritance-summary.ts:32` 입력 타입 | `debtItems: DebtItem[]` | `debtItems: DebtItem[] | undefined` |
| `inheritance-summary.ts:106` 분기 | `form.debtItems.length > 0` | `form.debtItems && form.debtItems.length > 0` |
| `steps.tsx:141` derive | `usesDebtItems = ...length > 0` | `isAllocationMode = ... !== undefined` |
| `steps.tsx:174` props | `items={form.debtItems}` | `items={form.debtItems ?? []}` |
| `steps.tsx:213-217` 데드 코드 | — | **제거** |
| `inheritance-validate.ts:112` 함수 시그니처 | `debtItems: DebtItem[]` | `debtItems: DebtItem[] | undefined` (또는 호출부에서 `?? []` 보호) |
| `DebtAllocationInput.tsx:27` props | `items: DebtItem[]` | **변경 없음** — 부모가 `?? []`로 보장 |
| `route.ts:76` 매핑 | `debtItems: parsedData.debtItems as ...` | **변경 없음** — Zod optional 그대로 |

### 3.4 Validation ⑧ 분기

`lib/calc/inheritance-validate.ts` 신규 분기:

```ts
if (form.debtItems !== undefined) {
  // ON 모드
  if (form.debtItems.length === 0) {
    errors.push({
      step: 2,
      field: "debtItems",
      message: "협의분할 항목을 1개 이상 추가하거나 토글을 끄세요"
    });
  }
  // 기존 checkAllocs("채무", debtItems) 유지 — 협의분할 합계 ≠ 금액 차단
} else {
  // OFF 모드 — legacy debts / funeralExpense 인식 (변경 없음)
}
```

**혼합 시나리오 정책**: 엔진 `inheritance-tax.ts:110`이 `debtItems` 있으면 legacy 전부 무시하므로, ON 모드에서 사용자가 일부 항목만 입력 시 나머지 채무가 침묵 누락. **옵션 1 채택 — ON 모드는 전수 입력 강제**.

**안내 카드 위치 — 3중 배치**:
1. `DebtAllocationInput.tsx` 상단 amber `bg-amber-50/40` 안내 박스 — "협의분할 모드에서는 모든 채무·공과·장례비를 항목으로 입력해야 합니다. 단일금액만 있으면 토글을 끄세요."
2. `inheritance-validate.ts` ON + 빈 항목 차단 메시지 — "협의분할 항목을 1개 이상 추가하거나 토글을 끄세요"
3. 결과 카드 ⑦에 "협의분할 모드 적용" 배지 표시 (사용자 인지)

### 3.5 결과 카드 ⑦ — 신규 작업

`grep -rn "debtItems" components/calc/results/` 0건. 협의분할 결과를 보여주는 카드가 부재.

**신규 컴포넌트**: `components/calc/results/inheritance/DebtAllocationResultCard.tsx`

표시 항목:
1. **카테고리별 입력 합계** — financial·tax·personal·funeral
2. **장례비 한도 적용 결과** — 식대 입력값/한도 1,000만 + 봉안 입력값/한도 500만 + 미적용분(한도 초과) 명시
3. **상속인별 채무 부담 분배 표** — `result.heirAllocationResult.perHeir`에서 채무 분담 추출 (13-2 직접배부 구성요소)
4. **상속인별 과세가액상당액 분해** (13-2) — 본래·간주·추정·**사전증여** − 채무·공과·장례비 분담 (사전증여 분담 명시)
5. **상속인별 산출세액 배부 표** (13-6~13-8 — 책 1864 재현)
6. **세대생략 수유자 할증 가산** (13-9) — 해당 상속인 표시 + §57 30%/40% 할증액
7. **사전증여세액공제 안분** (13-10) — §28 한도 적용 결과
8. **상속인별 최종 자진납부세액** (13-13)
9. **근거 조문 라벨** — `§14①1·2·3호` (채무·공과·장례비) + `§3·§28` + `집행기준 19-17-1` + `재재산 46014-247`
10. **협의분할 모드 배지** — 카드 우상단 amber 칩 "협의분할 모드"

`InheritanceTaxResultView`에 `result.heirAllocationResult` 존재 시 조건부 렌더 (이미 엔진이 협의분할 입력 시에만 `calcHeirAllocation` 호출).

### 3.6 DebtAllocationInput UI 마감

| 위치 | 현재 | 변경 |
|---|---|---|
| `:154-160` 봉안 checkbox | native `<input type="checkbox">` | `<ToggleCard variant="chip" tone="emerald" size="sm">` |
| `:94-102` 카테고리 추가 버튼 | Tailwind dynamic `bg-${tone}-50/60` | 4개 카테고리 색조 정적 매핑 객체 (purge 위험 차단) |
| `:125` 채권자명 input | native text input | 유지 (`SelectOnFocusProvider` 처리, FieldCard 도입은 후속 PR) |

### 3.7 OFF 모드 hint 통일 (UI 마감)

`steps.tsx:188` 현재 "최대 1,500만원 한도 자동 적용"은 사용자에게 한도 적용 메커니즘이 모호. 봉안 토글 ON/OFF에 따라 실제 한도가 10M ↔ 15M으로 전환되므로 hint를 동적으로:

```ts
// steps.tsx OFF 분기
<CurrencyInput
  label="장례비용"
  value={form.funeralExpense}
  onChange={(v) => set({ funeralExpense: v })}
  hint={
    form.funeralIncludesBongan
      ? "최대 1,500만원 한도 (식대 1,000만 + 봉안 500만)"
      : "최대 1,000만원 한도 (식대만)"
  }
  placeholder="금액 입력 (원)"
/>
```

### 3.9 엔진 1줄 수정 (디자인 §1.4 통합)

`lib/tax-engine/inheritance-tax.ts:422-425` `hasHeirAllocations` 진입 조건 확장:

```ts
// 변경 전
const hasHeirAllocations =
  input.heirs.length > 0 &&
  (input.estateItems.some((e) => e.heirAllocations) ||
    input.preGiftsWithin10Years.some((g) => g.doneeId));

// 변경 후 — OR 절 1줄 추가
const hasHeirAllocations =
  input.heirs.length > 0 &&
  (input.estateItems.some((e) => e.heirAllocations) ||
    input.preGiftsWithin10Years.some((g) => g.doneeId) ||
    (input.debtItems?.some((d) => d.heirAllocations && d.heirAllocations.length > 0) ?? false));
```

**이유**: 채무 협의분할만 입력된 케이스도 `calcHeirAllocation` 트리거되어 상속인별 채무 분담·산출세액 배부가 결과(`heirAllocationResult`)에 노출되어야 결과 카드 ⑦ 진입 가능.

**회귀 영향**: estateItems/priorGifts 진입 케이스 동작 불변 (OR 절 추가만). 회귀 anchor IDA-ENGINE-1~3 필수.

API/Zod/Route 변환은 변경 없음.

### 3.8 ConfirmDialog 컴포넌트 — `window.confirm()` 금지

OFF 클릭 데이터 폐기 안내는 shadcn `AlertDialog` 기반 컴포넌트 사용:

- 기존 컴포넌트 grep: `components/ui/alert-dialog.tsx` 존재 시 재사용, 부재 시 `npx shadcn@latest add alert-dialog`로 추가
- Step 2 컴포넌트 local state `pendingDiscardConfirm: boolean`로 다이얼로그 제어
- 다이얼로그 확인 시 `set({ debtItems: undefined })` + state 클리어, 취소 시 state 클리어만

이유: `window.confirm()`은 Tailwind 디자인 토큰·다크모드·접근성(focus-trap·키보드)·테스트(Playwright/RTL) 모두 무지원.

---

## 4. PDF Anchor 회귀 (Pre-Do 게이트)

`feedback_pre_anchor_verification` + `feedback_pdf_example_test_anchoring` + `feedback_pdf_table_row_one_to_one_mapping`(★★★) 정책 적용.

### 4.1 PDF 책 1858 (3) 입력 — 변수명에 PDF 페이지+행 번호 동결

PDF 보관 위치: `docs/02-design/features/inheritance-debt-allocation/comprehensive-case-p1858-p1864.pdf` (Phase 0에서 첨부)

| PDF 행 | 변수명 | 카테고리 | 채권자 | 금액 | 협의분할 |
|---|---|---|---|---|---|
| P1858-Row1 | `idaP1858Row1KBank` | financial | K은행 | 400,000,000 | 장남 400M |
| P1858-Row2 | `idaP1858Row2SSavings` | financial | S저축은행 | 745,000,000 | 배우자 500M + 차남 245M |
| P1858-Row3 | `idaP1858Row3ComprehensiveIncomeTax` | tax | 종합소득세 | 55,000,000 | 차남 55M |
| P1858-Row4 | `idaP1858Row4FuneralMeal` | funeral | 식대 | 18,000,000 (isBongan=false) | — |
| P1858-Row5 | `idaP1858Row5FuneralBongan` | funeral | 봉안 | 15,000,000 (isBongan=true) | — |
| P1864-Row1~N | `idaP1864RowN{HeirName}` | (배부 결과) | 장남·배우자·차남 | (PDF 발췌값) | calcHeirAllocation 출력 |

### 4.2 anchor (`__tests__/tax-engine/inheritance/debt-allocation-case-1858.test.ts`)

| anchor # | 항목 | 기대값 | 근거 |
|---|---|---|---|
| IDA-1 | 채무 총액 (financial + tax) | 1,200,000,000 | Row1+Row2+Row3 |
| IDA-2 | 장례비 식대 한도 적용 | 10,000,000 | §14①3 min(18M, 10M) |
| IDA-3 | 장례비 봉안 한도 적용 | 5,000,000 | §14①3 min(15M, 5M) |
| IDA-4 | 장례비 합산 | 15,000,000 | IDA-2 + IDA-3 |
| IDA-5 | 상속재산가액 차감 합계 | 1,215,000,000 | IDA-1 + IDA-4 |
| IDA-6 | 장남 부담 채무 | 400,000,000 | Row1 분담 |
| IDA-7 | 배우자 부담 채무 | 500,000,000 | Row2 분담 |
| IDA-8 | 차남 부담 채무 | 300,000,000 | Row2 245M + Row3 55M |
| IDA-9~11 | 상속인별 산출세액 배부 (장남·배우자·차남) | **책 1864 표값 — Plan 게이트에서 PDF 직접 발췌 후 확정** | calcHeirAllocation |
| IDA-12 | 정합성 가드: IDA-6+IDA-7+IDA-8 = IDA-1 (personal=0, financial+tax만) | 1,200,000,000 | — |
| IDA-13 | personal 카테고리 합계 | 0 | PDF Row1·2·3 모두 financial/tax — personal 누락 회귀 차단 |
| IDA-ENGINE-1 | §3.9 변경: `debtItems.heirAllocations`만 있는 입력 → `heirAllocationResult` 생성 | `result.heirAllocationResult !== undefined` | 진입 조건 확장 동작 확인 |
| IDA-ENGINE-2 | §3.9 변경: `debtItems`·`estateItems.heirAllocations`·`doneeId` 모두 없음 → `heirAllocationResult === undefined` | undefined | 진입 조건 false 유지 회귀 차단 |
| IDA-ENGINE-3 | §3.9 변경: 기존 `estateItems.heirAllocations`만 있는 케이스 → 결과 불변 | 기존 anchor 값과 동일 | 회귀 차단 |

### 4.3 Plan 게이트 — Phase 0 차단 조건

**책 1864 상속인별 산출세액 배부 표값 발췌 전 Phase A 진입 금지**. 미발췌 시 anchor IDA-9~11이 공중에 떠 회귀 보호 무효화.

### 4.4 OFF 모드 회귀 보호 anchor (IDA-LEGACY-1~3)

PDF 책 1858 동일 시나리오를 단일금액으로 입력해 OFF 경로 무손상 보장.

| anchor # | 입력 | 기대값 |
|---|---|---|
| IDA-LEGACY-1 | `debtItems: undefined` + `debts: "1200000000"` + `funeralExpense: "33000000"` + `funeralIncludesBongan: true` | 채무 1,200M + 장례 한도 15M |
| IDA-LEGACY-2 | `funeralIncludesBongan: false` + `funeralExpense: "18000000"` | 장례 한도 10M (식대 단독) |
| IDA-LEGACY-3 | `debtItems: undefined` + 모두 빈 문자열 | 채무 0 + 장례 0 |

---

## 5. 14개 동기화 지점 매트릭스

| # | 지점 | 변경 | 파일 |
|---|---|---|---|
| ⓪ | 엔진 진입 조건 | `hasHeirAllocations` OR 절에 `debtItems.some(d => d.heirAllocations?.length > 0)` 추가 | `inheritance-tax.ts:422-425` |
| ① | FormState 타입 | `debtItems: DebtItem[] \| undefined` (방안 C) | `shared.ts:27` |
| ② | initial value | `debtItems: undefined` (현재 `[]` → 변경) | `shared.ts:66` |
| ③ | normalize fallback | legacy `[]` → `undefined` 강등 | `shared.ts` 또는 `calc-wizard-store.ts` merge |
| ④ | API 변환 | optional 그대로 전달 (변경 없음) | `lib/calc/inheritance-tax-api.ts` |
| ⑤ | UI 입력 위젯 | Step2 토글 재작성 + 데드 코드 제거 + DebtAllocationInput 봉안 ToggleCard | `steps.tsx:140-220` + `DebtAllocationInput.tsx` |
| ⑥ | 사이드바 합계 | 입력 타입 1줄 (`InheritanceSummaryFormInput.debtItems`) + 분기 가드 1줄 (`:106`) | `inheritance-summary.ts:32,106` |
| ⑦ | 결과 카드 | **신규** `DebtAllocationResultCard.tsx` | `components/calc/results/inheritance/` |
| ⑧ | Validation | `undefined` 분기 + ON 모드 빈 항목 차단 | `inheritance-validate.ts` |
| ⑨~⑩ | Zod enum | 변경 없음 (debtItemSchema optional) | `lib/validators/property-valuation-input.ts:315` |
| ⑪ | acquisitionDate fallback | 해당 없음 (상속세) | — |
| ⑫ | Zod 입력 객체 정의 | 변경 없음 (`debtItems` 이미 정의) | 동상 |
| ⑬ | API body spread | 변경 없음 | `inheritance-tax-api.ts` |
| ⑭ | Route handler 매핑 | 변경 없음 (`debtItems: parsedData.debtItems` 이미 정합) | `route.ts:76` |

**⑨~⑭ 모두 정합** — optional 스키마라 방안 C `undefined ↔ array` 모두 자연 처리.

---

## 6. 구현 순서 (Do)

### Phase 0 — Plan 게이트
- [ ] PDF 책 1864 상속인별 산출세액 배부 표값 직접 발췌 → IDA-9~11 확정
- [ ] `feedback_pdf_table_row_one_to_one_mapping` Row 번호 1:1 매핑 확정
- [ ] 책 1858·1864 PDF 캡처 첨부 (`docs/02-design/features/inheritance-debt-allocation.engine.design.md` 신규)

### Phase A — Pre-Do anchor (회귀 보호 우선)
- [ ] `__tests__/tax-engine/inheritance/debt-allocation-case-1858.test.ts` 신규 (IDA-1~12)
- [ ] OFF 모드 회귀 anchor 1건
- [ ] anchor 실행 → 실패 메시지 확인 → 설계 환류

### Phase A2 — 엔진 1줄 수정 (⓪)
- [ ] `inheritance-tax.ts:422-425` `hasHeirAllocations` OR 절 1줄 추가
- [ ] IDA-ENGINE-1·2·3 anchor 통과
- [ ] `__tests__/tax-engine/inheritance/` 전건 회귀 0건

### Phase B — FormState 마이그레이션 (① ② ③)
- [ ] `shared.ts` `debtItems: DebtItem[] | undefined`
- [ ] initial `undefined`
- [ ] normalize: legacy `[]` → `undefined`
- [ ] `inheritance-summary.ts:106` `form.debtItems &&` 가드 (⑥)
- [ ] `npx tsc --noEmit` 0건 확인

### Phase C — Step 2 토글 재작성 (⑤)
- [ ] derive `isAllocationMode = form.debtItems !== undefined`
- [ ] OFF 클릭 시 `window.confirm()` 데이터 폐기 안내 (입력 데이터 있을 때만)
- [ ] 데드 코드 `:213-217` 제거
- [ ] ToggleCard 제목에서 "(Phase A0)" 내부 코드명 제거

### Phase D — Validation 분기 (⑧)
- [ ] `undefined` 분기 + ON 빈 항목 차단
- [ ] 기존 `checkAllocs` 보존

### Phase E — DebtAllocationInput UI 마감
- [ ] 봉안 native checkbox → ToggleCard chip
- [ ] Tailwind dynamic class → 정적 카테고리 색조 매핑 객체

### Phase F — 결과 카드 ⑦ 신규
- [ ] `DebtAllocationResultCard/` 4파일 신규 (디자인 §5.1 분할 구조)
- [ ] `InheritanceTaxResultView` 통합 위치 grep 결정 (디자인 §5.6 후보 1~4)
- [ ] 조건 이중 가드: `result.heirAllocationResult && form.debtItems !== undefined`
- [ ] 책 1864 상속인별 배부 표 재현 anchor 시각 확인
- [ ] 모바일 viewport 320·375·414·640px 표 7컬럼 스크롤 동작 확인 → 디자인 §5.5 옵션 A/B 결정

### Phase G — 회귀
- [ ] `npx vitest run __tests__/tax-engine/inheritance/` 100% 통과
- [ ] 전체 회귀 0건
- [ ] `npx tsc --noEmit` 0건

### Phase H — 브라우저 수동 확인
- [ ] 토글 ON → DebtAllocationInput 노출 → 4 카테고리 추가 → HeirAllocationInput 입력 → 계산 → 결과 카드 상속인별 배부 확인
- [ ] 토글 OFF (데이터 있는 상태) → confirm 다이얼로그 노출 → 취소/확인 동작 검증
- [ ] 토글 OFF (빈 상태) → confirm 없이 즉시 OFF
- [ ] 단일금액 입력 회귀 확인
- [ ] Network 탭: `debtItems` 전송(ON) / 미전송(OFF) 확인

### Phase I — 메모리·문서
- [ ] `MEMORY.md` `project_inheritance_debt_allocation_activation.md` 항목 추가
- [ ] 발견된 신규 정책이 있으면 feedback 메모리 추가

---

## 7. 800줄 정책 사전 점검

| 파일 | 현재 | 예상 증가 | 위험 |
|---|---|---|---|
| `steps.tsx` | 445줄 | -3줄 (데드 코드 제거 + 토글 분기 단순화) | 0 |
| `DebtAllocationInput.tsx` | 201줄 | +20줄 (정적 색조 매핑) | 0 |
| `shared.ts` | 95줄 | +5줄 (normalize) | 0 |
| `inheritance-validate.ts` | 191줄 | +15줄 (undefined 분기) | 0 |
| `DebtAllocationResultCard.tsx` (신규) | 0 | +250~300줄 (10 표시 항목) | ⚠ 분할 검토 |
| `DebtAllocationResultCard/` 분할 (신규) | 0 | 부모 100줄 + Sub 3종 (CategorySummary·HeirAllocationTable·SettlementTable) | 0 |
| `inheritance-summary.ts` | (확인 필요) | +1줄 | 0 |

전부 여유 — **800줄 분할 사전 작업 불필요**.

---

## 8. 위험 (Risk)

| 위험 | 완화책 |
|---|---|
| 토글 OFF 클릭 시 입력 데이터 손실 | `window.confirm()` 본 PR 포함 |
| 책 1864 표값 발췌 오류 | Phase 0 차단 게이트 + PDF 직접 대조 |
| ON 모드 부분 입력 시 침묵 누락 | UI 안내 카드 + Validation `checkAllocs` 합계 검증 |
| Tailwind dynamic class purge | 정적 매핑 객체로 사전 차단 |
| 결과 카드 누락 (기존) | Phase F에서 신규 추가로 해소 |
| sessionStorage 기존 사용자 OFF로 강등 | 의도된 동작 (빈 `[]`는 의미 없음) — 안내 불필요 |

---

## 9. 정책 메모리 참조

| 메모리 | 적용 항목 |
|---|---|
| `feedback_pre_anchor_verification` ★★★ | Phase 0 차단 게이트 + Phase A 우선 |
| `feedback_pdf_table_row_one_to_one_mapping` ★★★ | 변수명 PDF Row 번호 동결 |
| `feedback_pdf_example_test_anchoring` | 원단위 toBe anchor |
| `feedback_validation_sync_8th_point` ★★★ | UI↔validate 모순 차단 (⑧) |
| `feedback_store_default_vs_ui_display_fallback` ★★★ | factory · normalize · UI 3중 일관성 |
| `feedback_toggle_card_visibility` | 봉안 native checkbox → ToggleCard |
| `feedback_no_silent_apportion_fallback` | 혼합 시나리오 자동 안분 금지 → 옵션 1 강제 입력 |
| `feedback_no_yangdo_korea_brand` ★★★ | "Phase A0" 등 내부 코드명 사용자 노출 제거 |
| `feedback_useeffect_store_mirror_forbidden` | onCheckedChange 직접 set |

---

## 10. Definition of Done (자가 점검)

- [ ] Phase 0 PDF 표값 발췌 완료, 책 1864 anchor IDA-9~11 확정
- [ ] anchor IDA-1~12 100% 통과
- [ ] 14 동기화 지점 ⑤⑥⑦⑧ 변경, ⑨~⑭ 정합 grep 재확인
- [ ] `npx tsc --noEmit` 0건
- [ ] `npx vitest run __tests__/tax-engine/inheritance/` 100% 통과
- [ ] 전체 회귀 0건
- [ ] 브라우저 수동: 토글 ON/OFF, confirm 다이얼로그, 4 카테고리 추가, 협의분할 입력, 계산, 결과 카드 표시 모두 확인
- [ ] 데드 코드 `steps.tsx:213-217` 제거 확인
- [ ] `DebtAllocationResultCard` 800줄 미만
- [ ] `MEMORY.md` 갱신

---

## 11. 후속 PR (본 PR 범위 외)

1. DebtAllocationInput 채권자명 input → FieldCard 도입
2. 카테고리별 그룹 표시 + 카테고리 헤더 합계
3. HeirAllocationInput 자동 균등분할 옵션 (정책 검토 필요 — `feedback_no_silent_apportion_fallback`)
4. 결과 카드 협의분할 표 PDF 다운로드 시 시각화
5. 책 1858 외 다른 PDF 사례 anchor 추가
