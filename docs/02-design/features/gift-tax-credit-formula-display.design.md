# Design — 증여세 세액공제 산출근거 표시 (§28·§69)

> **Plan Doc**: [`docs/00-pm/gift-tax-credit-formula-display.plan.md`](../../00-pm/gift-tax-credit-formula-display.plan.md)
> **Tax Domain**: 증여세 §28 (증여세액공제) + §69 (신고세액공제) + §58 (안분 한도)
> **Status**: Design (Pre-Do)
> **Author**: claude-opus-4-7
> **Date**: 2026-05-20

---

## §1. 아키텍처 개요

### §1.1 레이어 매핑

```
┌─────────────────────────────────────────────────────────────────┐
│ UI Layer (components/calc/TaxCreditBreakdownCard.tsx)           │
│   ├─ CreditRow (확장 — formula?: ReactNode + 펼침 토글)         │
│   ├─ buildSection28Formula() — §28 산식 빌더                   │
│   └─ buildSection69Formula() — §69 산식 빌더                   │
└───────────────────────┬─────────────────────────────────────────┘
                        │ reads
                        ▼
┌─────────────────────────────────────────────────────────────────┐
│ Engine Result (lib/tax-engine/types/inheritance-gift.types.ts)  │
│   GiftTaxResult                                                 │
│   ├─ priorGiftCreditDetail (기존)                              │
│   │  ├─ priorComputedTax  // ⑭                                 │
│   │  ├─ priorAddedTaxBase // ⑤_prior                           │
│   │  ├─ aggregatedTaxBase // ⑤                                 │
│   │  ├─ creditLimit       // ⑮                                 │
│   │  └─ priorPaidCredit   // ⑯                                 │
│   ├─ computedTax (기존, 할증 전 ⑦)                              │
│   └─ creditDetail: TaxCreditResult                              │
│      ├─ giftTaxCredit / foreignTaxCredit / specialTreatmentCredit│
│      ├─ filingCredit                                            │
│      ├─ filingCreditBase ★ (신규 echo)                          │
│      └─ totalComputedTaxWithSurcharge ★ (신규 echo)             │
└───────────┬─────────────────────────────────────────────────────┘
            │ echo (2줄 추가, 계산 로직 변경 0)
            ▼
┌─────────────────────────────────────────────────────────────────┐
│ Engine Logic (lib/tax-engine/inheritance-gift-tax-credit.ts)    │
│ calcGiftTaxCredits()                                            │
│   line 315: totalComputedTax = computedTax + generationSkip…    │
│   line 334-337: §58 한도 + Min                                  │
│   line 378·399: remainingTax = totalComputedTax − §28 − 외국납부 − 조특 │
│   line 419+: return { ..., filingCreditBase, totalComputedTaxWithSurcharge } │
└─────────────────────────────────────────────────────────────────┘
```

### §1.2 데이터 흐름 (변경 없음)

`buildInput → /api/calc/gift → calcGiftTax → creditDetail` 흐름 그대로. 본 PR은 결과 echo 2필드 + UI 표시만.

### §1.3 의존 검증

| From | To | 허용 |
|---|---|---|
| `TaxCreditBreakdownCard.tsx` | `GiftTaxResult.priorGiftCreditDetail` / `creditDetail.*` | ✓ 결과 read-only |
| `inheritance-gift-tax-credit.ts` | (변경 없음 — return 시점 echo 2줄) | ✓ |

엔진 산식 로직 변경 0. 회귀 위험 최소.

---

## §2. 타입 명세

### §2.1 `TaxCreditResult` 확장 (`lib/tax-engine/types/inheritance-gift.types.ts:618-627`)

```diff
 export interface TaxCreditResult {
   giftTaxCredit: number;
   foreignTaxCredit: number;
   shortTermReinheritCredit: number;
   filingCredit: number;
   specialTreatmentCredit: number;
   totalCredit: number;
   breakdown: CalculationStep[];
   appliedLaws: string[];
+  /**
+   * §69 산식 노출용 — 신고세액공제 기준세액.
+   * = totalComputedTaxWithSurcharge − giftTaxCredit − foreignTaxCredit − specialTreatmentCredit
+   * (= 엔진 `remainingTax`, inheritance-gift-tax-credit.ts:378·399).
+   * 법정기한 외 신고 시 0. Math.max(0, ...) 적용됨.
+   */
+  filingCreditBase?: number;
+  /**
+   * §69 산식 노출용 — 산출세액 합계 (할증 포함).
+   * = computedTax + generationSkipSurcharge
+   * (= 엔진 `totalComputedTax`, inheritance-gift-tax-credit.ts:315).
+   * §28의 ⑦(할증 전, `result.computedTax`)과 구분 필수.
+   */
+  totalComputedTaxWithSurcharge?: number;
 }
```

### §2.2 산식 prop 타입 (UI)

```ts
// components/calc/TaxCreditBreakdownCard.tsx 내부
interface CreditRowProps {
  label: string;
  amount: number;
  lawRef?: string;
  highlight?: boolean;
  formula?: React.ReactNode;  // 신규 — 펼침 영역 산식
}
```

`formula`가 `undefined`이면 기존 동작과 동일. 펼침 토글 미표시.

---

## §3. 엔진 echo 추가 (계산 로직 변경 0)

### §3.1 `inheritance-gift-tax-credit.ts:419` 직전 echo 2줄

```diff
   const totalCredit =
     priorPaidCredit + foreignTaxCredit + specialTreatmentCredit + filingCredit;

   allBreakdown.push({
     label: "세액공제 합계",
     amount: totalCredit,
   });

   return {
     giftTaxCredit: priorPaidCredit,
     foreignTaxCredit,
     shortTermReinheritCredit: 0,
     filingCredit,
     specialTreatmentCredit,
     totalCredit,
     breakdown: allBreakdown,
     appliedLaws: Array.from(appliedLaws),
+    filingCreditBase: Math.max(0, remainingTax),
+    totalComputedTaxWithSurcharge: totalComputedTax,
   };
 }
```

### §3.2 상속세 동일 함수(`calcInheritanceTaxCredits`) — 본 PR 범위 외

상속세 동일 함수에도 echo 추가 가능하나 본 PR은 증여세 한정. 후속 PR로 분리.

### §3.3 회귀 영향

- TaxCreditResult 신규 optional 필드 2개 → 기존 anchor 회귀 0.
- `gift-tax.ts:178-194` calcGiftTaxCredits 호출부 변경 없음.
- `partialResult.creditDetail = creditResult` 그대로 → UI에서 신규 필드 자동 가용.

---

## §4. UI 명세

### §4.1 케이스 인벤토리 (필수 — Plan 진입 게이트)

| ID | 입력 조건 | 모달/카드 표시 | 산식 펼침 |
|---|---|---|---|
| U-1 | 사전증여 X + 법정기한 내 신고 (priorGiftCreditDetail=null, filingCredit>0) | §28 행 숨김, §69 행만 표시 | §69만 펼침 — base=⑦합계 |
| U-2 | 사전증여 O + 법정기한 내 신고 (둘 다 표시) | §28·§69 행 모두 표시 | 두 항목 펼침 가능 |
| U-3 | 사전증여 O + ⑭ < ⑮ (한도 미달, Min에서 ⑭ 채택) | §28 행 표시 | 펼침 시 ⑯=⑭ 강조 |
| U-4 | 사전증여 O + ⑭ > ⑮ (한도 적중, Min에서 ⑮ 채택, 부록 A 케이스) | §28 행 표시 | 펼침 시 ⑯=⑮ 강조 |
| U-5 | 사전증여 O + aggregatedTaxBase=0 | §28 행 표시 (⑯=0) | 펼침 시 "과세표준 0 — 산식 무효" 안내 |
| U-6 | 법정기한 외 신고 (isFiledOnTime=false) | §69 행 숨김 (amount=0이라 CreditRow null 반환) | — |
| U-7 | 사전증여 X + 외국납부 O (filingCreditBase = ⑦합계 − 외국납부) | §69 펼침 | "외국납부 N" 명시 |
| U-8 | 조특법 특례 적용 (specialTreatmentCredit>0) | §69 펼침 | "조특 특례 N" 명시 |
| U-9 | 세대생략 할증 포함 (donor=grandparent) | §28·§69 모두 펼침 | §28 ⑦=할증 전, §69 ⑦합계=할증 포함 fine-print |
| U-10 | 외국납부 + 조특 + 사전증여 동시 | 4개 차감 모두 노출 | 산식이 길어 줄바꿈 |
| U-11 | filingCreditBase 누락 (legacy IndexedDB 결과 또는 상속세 호출) | §69 행 표시 (amount>0), 펼침 토글 미렌더 | §4.7.3 가드로 formula=undefined 전달 |
| U-12 | UI 펼침 토글 클릭 | 산식 영역 슬라이드 | aria-expanded 토글 |
| U-13 | **상속세 결과 화면** (InheritanceTaxResultView) | §28·§69 펼침 토글 모두 미렌더 (기존 동작 100% 보존) | 후속 PR로 상속세 echo 추가 시 자동 활성화 |

### §4.2 CreditRow 확장

기존 (`components/calc/TaxCreditBreakdownCard.tsx:18`):

```tsx
function CreditRow({ label, amount, lawRef, highlight }: CreditRowProps) {
  if (amount === 0) return null;
  return (<div>...</div>);
}
```

확장 후:

```tsx
function CreditRow({ label, amount, lawRef, highlight, formula }: CreditRowProps) {
  const [expanded, setExpanded] = useState(false);
  if (amount === 0) return null;
  return (
    <div className="space-y-1">
      <div
        className={`flex items-center justify-between py-2 px-3 rounded-md ${
          highlight
            ? "bg-emerald-50 dark:bg-emerald-900/20 font-semibold"
            : "bg-gray-50 dark:bg-gray-800"
        }`}
      >
        <div className="flex items-center gap-2 flex-wrap">
          <span
            className={`text-sm ${
              highlight
                ? "text-emerald-800 dark:text-emerald-200"
                : "text-gray-700 dark:text-gray-300"
            }`}
          >
            {label}
          </span>
          {lawRef && (
            <span className="text-xs text-gray-400 dark:text-gray-500">{lawRef}</span>
          )}
          {formula && (
            <button
              type="button"
              onClick={() => setExpanded((p) => !p)}
              className="text-[10px] text-gray-500 hover:text-violet-700 transition-colors"
              aria-expanded={expanded}
              aria-label={`${label} 산출근거 ${expanded ? "닫기" : "펼치기"}`}
            >
              {expanded ? "▼ 산출근거" : "▶ 산출근거"}
            </button>
          )}
        </div>
        <span
          className={`font-mono text-sm ${
            highlight
              ? "text-emerald-700 dark:text-emerald-300"
              : "text-blue-600 dark:text-blue-400"
          }`}
        >
          - {amount.toLocaleString()}
        </span>
      </div>
      {expanded && formula && (
        <div className="ml-3 px-3 py-2 text-[11px] text-gray-600 dark:text-gray-400 bg-gray-50/60 dark:bg-gray-900/40 rounded-md space-y-0.5 font-mono">
          {formula}
        </div>
      )}
    </div>
  );
}
```

### §4.3 변수 배지 컴포넌트

```tsx
function Var({ label, val }: { label: string; val: number }) {
  return (
    <span className="inline-flex items-baseline gap-1">
      <span className="text-[10px] font-bold text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-900/30 rounded px-1">
        {label}
      </span>
      <span className="text-[11px]">{val.toLocaleString()}</span>
    </span>
  );
}
```

→ 변수 라벨(⑭⑮⑯⑦⑤_prior⑤) 옆 숫자값을 일관 표기. 색상 토큰: blue (정보).

### §4.4 §28 산식 빌더

```tsx
function buildSection28Formula(
  detail: PriorGiftCreditDetail,
  computedTax: number,  // result.computedTax (할증 전 ⑦)
): React.ReactNode {
  const {
    priorComputedTax,
    priorAddedTaxBase,
    aggregatedTaxBase,
    creditLimit,
    priorPaidCredit,
  } = detail;

  return (
    <>
      <div>
        <Var label="⑯" val={priorPaidCredit} /> = Min(<Var label="⑭" val={priorComputedTax} />, <Var label="⑮" val={creditLimit} />)
      </div>
      <div className="text-gray-500">
        <Var label="⑭" val={priorComputedTax} /> 가장 최근 합산 회차의 ⑦
      </div>
      {aggregatedTaxBase > 0 ? (
        <div className="text-gray-500 flex flex-wrap gap-x-1">
          <Var label="⑮" val={creditLimit} /> = <Var label="⑦" val={computedTax} /> ×
          (<Var label="⑤_prior" val={priorAddedTaxBase} /> ÷ <Var label="⑤" val={aggregatedTaxBase} />)
        </div>
      ) : (
        <div className="text-rose-600">⑮ 0 — 과세표준 0으로 산식 무효</div>
      )}
      <div className="text-[10px] text-gray-400">※ ⑦은 할증 전 산출세액 (`result.computedTax`)</div>
    </>
  );
}
```

### §4.5 §69 산식 빌더

```tsx
function buildSection69Formula(credit: TaxCreditResult): React.ReactNode {
  const base = credit.filingCreditBase ?? 0;
  const totalWithSurcharge = credit.totalComputedTaxWithSurcharge ?? 0;
  const giftCredit = credit.giftTaxCredit;
  const foreign = credit.foreignTaxCredit;
  const special = credit.specialTreatmentCredit;
  const allOthersZero = foreign === 0 && special === 0;

  return (
    <>
      <div>
        <span className="font-semibold">{credit.filingCredit.toLocaleString()}</span> = <Var label="기준세액" val={base} /> × 3%
      </div>
      <div className="text-gray-500 flex flex-wrap gap-x-1">
        <Var label="기준세액" val={base} /> = <Var label="⑦합계" val={totalWithSurcharge} /> − §28 {giftCredit.toLocaleString()}
        {foreign > 0 && <> − 외국납부 {foreign.toLocaleString()}</>}
        {special > 0 && <> − 조특 특례 {special.toLocaleString()}</>}
      </div>
      {allOthersZero && (
        <div className="text-[10px] text-gray-400">(외국납부·조특 특례 미적용)</div>
      )}
      <div className="text-[10px] text-gray-400">※ ⑦합계 = 산출세액 + 세대생략 할증</div>
      {special > 0 && (
        <div className="text-[10px] text-amber-600">※ 조특 특례 절감 분 차감 후 3% 적용 (엔진 line 399)</div>
      )}
    </>
  );
}
```

### §4.6 통합 — TaxCreditBreakdownCard

```tsx
export interface TaxCreditBreakdownCardProps {
  credit: TaxCreditResult;
  taxBeforeCredit: number;
  /** §28 산식 노출용 — GiftTaxResult.priorGiftCreditDetail */
  priorGiftCreditDetail?: PriorGiftCreditDetail | null;
  /** §28 산식 ⑦(할증 전) — GiftTaxResult.computedTax */
  computedTax?: number;
}

export function TaxCreditBreakdownCard({
  credit,
  taxBeforeCredit,
  priorGiftCreditDetail,
  computedTax,
}: TaxCreditBreakdownCardProps) {
  // ...
  return (
    <div>
      {/* ...헤더... */}
      <div className="p-3 space-y-2">
        <CreditRow
          label="증여세액공제"
          amount={credit.giftTaxCredit}
          lawRef="§28"
          formula={
            priorGiftCreditDetail && computedTax !== undefined
              ? buildSection28Formula(priorGiftCreditDetail, computedTax)
              : undefined
          }
        />
        <CreditRow label="외국납부세액공제" amount={credit.foreignTaxCredit} lawRef="§29 / §59" />
        <CreditRow label="단기재상속공제" amount={credit.shortTermReinheritCredit} lawRef="§30" />
        <CreditRow
          label="신고세액공제 (3%)"
          amount={credit.filingCredit}
          lawRef="§69"
          formula={buildSection69Formula(credit)}
        />
        <CreditRow label="조특법 과세특례 (창업·가업)" amount={credit.specialTreatmentCredit} lawRef="조특 §30의5·§30의6" />
        <CreditRow label="세액공제 합계" amount={credit.totalCredit} highlight />
      </div>
      {/* ...appliedLaws 배지... */}
    </div>
  );
}
```

### §4.7 호출처 갱신

#### 4.7.1 GiftTaxResultView (본 PR 적용 — `components/calc/results/GiftTaxResultView.tsx:276`)

```tsx
<TaxCreditBreakdownCard
  credit={result.creditDetail}
  taxBeforeCredit={taxBeforeCredit}
  priorGiftCreditDetail={result.priorGiftCreditDetail}
  computedTax={result.computedTax}
/>
```

#### 4.7.2 InheritanceTaxResultView (본 PR 변경 없음 — `components/calc/results/InheritanceTaxResultView.tsx:206`)

```tsx
{/* 기존 코드 유지 — priorGiftCreditDetail·computedTax 미전달 */}
<TaxCreditBreakdownCard
  credit={result.creditDetail}
  taxBeforeCredit={taxBeforeCredit}
/>
```

> **상속세 §69 산식 미노출 이유**:
> - `InheritanceTaxResult`에 `priorGiftCreditDetail` 필드 자체가 없음 (gift 전용)
> - 상속세 `calcInheritanceTaxCredits` 함수에는 `filingCreditBase`·`totalComputedTaxWithSurcharge` echo가 **추가되지 않음** (본 PR은 `calcGiftTaxCredits` 한정)
> - 따라서 상속세 결과에서 `credit.filingCreditBase = undefined` → `?? 0` fallback → 산식이 의미 없는 0으로 표기됨
> - **해결**: `buildSection69Formula`는 `credit.filingCreditBase`가 undefined일 때 **자체적으로 fallback 처리**가 아닌 **펼침 자체를 비활성화** (formula 인자 자체를 `undefined`로 전달). GiftTaxResultView에서만 formula prop 전달.

#### 4.7.3 buildSection69Formula 호출 가드 (§4.6 수정)

```tsx
<CreditRow
  label="신고세액공제 (3%)"
  amount={credit.filingCredit}
  lawRef="§69"
  formula={
    // echo 필드 두 개 모두 존재할 때만 산식 표시 (legacy/상속세 호출 보호)
    credit.filingCreditBase !== undefined && credit.totalComputedTaxWithSurcharge !== undefined
      ? buildSection69Formula(credit)
      : undefined
  }
/>
```

→ 상속세에서 호출 시 echo 누락 → formula=undefined → 펼침 토글 미렌더 → 기존 동작 100% 보존.
→ 후속 PR(`gift-tax-credit-formula-display-inheritance`)에서 상속세 `calcInheritanceTaxCredits` echo 추가 시 자동으로 펼침 활성화.

### §4.8 색상 토큰

| 영역 | 색상 |
|---|---|
| 카드 헤더 (기존) | blue-50/200 |
| §28·§69 펼침 영역 컨테이너 | gray-50/60 dark:gray-900/40 |
| 변수 배지 (⑭⑮⑯⑦ 등) | blue-50/900 + blue-700/300 텍스트 |
| 변수 fine-print (※) | gray-400 |
| 조특 안내 (※) | amber-600 |
| 과세표준 0 무효 안내 | rose-600 |
| 펼침 토글 | gray-500 → hover violet-700 |

### §4.9 접근성

- 펼침 버튼 `aria-expanded` + `aria-label` 동적
- 키보드 Tab·Enter·Space로 토글
- 변수 배지 `<span>` (decorative — alt 불필요, 숫자 텍스트와 함께)
- 산식 영역 `role="region"` 명시 가능

### §4.10 8개 동기화 지점 매핑

| # | 지점 | 변경 |
|---|---|---|
| ① 폼 상태 | 변경 없음 | — |
| ② initial | 변경 없음 | — |
| ③ normalize | 변경 없음 | — |
| ④ API 변환 | 변경 없음 | — |
| ⑤ UI 위젯 | TaxCreditBreakdownCard 확장 + 빌더 2종 | ✓ |
| ⑥ 사이드바 | 변경 없음 | — |
| ⑦ 결과 카드 | §28·§69 산식 펼침 영역 추가 | ✓ |
| ⑧ Validation | 변경 없음 | — |
| ⑨ Zod | 변경 없음 (결과 echo만 추가) | — |

---

## §5. 산식 자기일관성 검증

### §5.1 부록 A 데이터 — Self-test

| 변수 | 값 | 산식 |
|---|---|---|
| ⑦ (할증 전) | 380,000,000 | (input) |
| 세대생략 할증 | 0 | (input) |
| ⑦합계 | 380,000,000 | = ⑦ + 할증 |
| ⑭ | 240,000,000 | (input — 직전 회차 ⑦) |
| ⑤_prior | 600,000,000 | (input) |
| ⑤ | 1,000,000,000 | (input) |
| ⑮ | 228,000,000 | = floor(380M × 600M ÷ 1,000M) |
| ⑯ | 228,000,000 | = Min(240M, 228M) |
| §28 | 228,000,000 | = ⑯ (=credit.giftTaxCredit) |
| 외국납부 | 0 | (input) |
| 조특 | 0 | (input) |
| base | 152,000,000 | = 380M − 228M − 0 − 0 |
| §69 | 4,560,000 | = floor(152M × 3%) |
| totalCredit | 232,560,000 | = 228M + 4.56M |

→ 모든 산식이 자기일관. UI 렌더 결과가 anchor와 정확 일치.

> **정밀도 검증** (R-8 관련): 380,000,000 × 600,000,000 = 228,000,000,000,000,000.
> - JavaScript `Number.MAX_SAFE_INTEGER` = 9,007,199,254,740,991 (≈ 9 × 10^15) 보다 큼.
> - 그러나 결과 / 1,000,000,000 = 228,000,000 (정확).
> - 검증: `Math.floor(380e6 * 600e6 / 1e9)` → 228000000 (Node 22 직접 확인).
> - 두 곱이 2^53 약간 초과해도 마지막 9자리 0이 많아 정확. 일반화 보장은 없음 → R-8 후속 PR.

### §5.2 부록 A.1 — 세대생략 할증 50M 추가

| 변수 | 값 | 산식 |
|---|---|---|
| ⑦합계 | 430,000,000 | = 380M + 50M |
| ⑮ | 228,000,000 | (변화 없음 — 할증 전 ⑦ 사용) |
| ⑯ | 228,000,000 | |
| base | 202,000,000 | = 430M − 228M |
| §69 | 6,060,000 | = floor(202M × 3%) |

→ §28은 할증 무관, §69는 할증 반영. 두 ⑦ 의미 차이를 산식이 명확히 보임.

---

## §6. 테스트 매트릭스

### §6.1 엔진 anchor (`__tests__/tax-engine/inheritance-gift/gift-tax-credit.formula.test.ts`)

| ID | Setup | Expected |
|---|---|---|
| F-1 | 사전증여 X + 법정기한 내 + 세대생략 할증 X (⑦=100M, isFiledOnTime=true) | priorGiftCreditDetail=null, totalComputedTaxWithSurcharge=100M, filingCreditBase=100M, filingCredit=floor(100M×3%)=**3,000,000** |
| F-2 | 사전증여 O + ⑭=100M, ⑮=200M (한도 미달, ⑭ 채택) | ⑯=§28=100M, filingCreditBase=⑦합계−100M, filingCredit=floor(base×3%) |
| F-3 | **부록 A 데이터**: ⑦=380M, 할증 X, ⑭=240M, ⑤_prior=600M, ⑤=1,000M | ⑮=228M, ⑯=§28=**228,000,000**, filingCreditBase=**152,000,000**, filingCredit=**4,560,000**, totalCredit=**232,560,000** |
| F-4 | aggregatedTaxBase=0 + 사전증여 O | priorGiftCreditDetail.creditLimit=0, §28=0, filingCreditBase=⑦합계 |
| F-5 | 법정기한 외 신고 (isFiledOnTime=false, 다른 조건 F-1 동일) | filingCredit=**0**, filingCreditBase=**100M (echo 그대로)** — UI는 filingCredit=0이라 CreditRow null 반환, 산식 미표시 |
| F-6 | ⑤_prior=⑤=1,000M + ⑦=300M + ⑭=300M + 세대생략 할증 0 | ⑮=300M, ⑯=§28=300M, filingCreditBase=0, filingCredit=0 |
| F-7 | 조특 특례 적용 (startup) — 특례절감=50M, 사전증여 X | totalComputedTaxWithSurcharge=일반세액 그대로(엔진 line 386 `normalComputedTax`), specialTreatmentCredit=50M, filingCreditBase=⑦합계−외국납부−50M |
| F-8 | 외국납부 30M + 조특 50M + 사전증여 ⑯=100M (⑦합계=400M) | filingCreditBase=400−100−30−50=**220M**, filingCredit=floor(220M×3%)=**6,600,000** |
| F-9 | **부록 A.1**: F-3 + 세대생략 할증 50M | totalComputedTaxWithSurcharge=**430M**, ⑮=228M(불변), §28=228M, filingCreditBase=**202M**, filingCredit=**6,060,000** |
| F-10 | 조특 절감 = ⑦합계 (전액 특례 차감) | remainingTax=0, filingCreditBase=0, filingCredit=0, totalCredit=특례절감 |

### §6.2 UI 회귀 (브라우저 수동)

U-1 ~ U-12 (§4.1 케이스 인벤토리). 핵심:
- U-2·U-4·U-9: 펼침 클릭 → 산식 표시 → 다시 클릭 → 접힘
- U-5·U-6: 산식 미표시 또는 무효 안내
- U-11: legacy 결과(echo 누락) — fallback 0 처리, 산식 0 표기
- 모바일 폭(< 640px)에서 산식 줄바꿈 정상

### §6.3 회귀 테스트

- `__tests__/tax-engine/inheritance-gift/` 전체 PASS
- 기존 §28·§58·§57·§69 anchor 회귀 0건
- `npx tsc --noEmit` 0 errors
- `npm run lint` 0 errors

---

## §7. 위험·완화

| ID | 위험 | 완화 |
|---|---|---|
| R-1 | echo 필드(`filingCreditBase`/`totalComputedTaxWithSurcharge`) optional이라 legacy IndexedDB 결과 또는 상속세 호출 시 누락 | §4.7.3 패턴 — 두 필드 모두 존재할 때만 `buildSection69Formula` 호출. undefined 시 펼침 토글 자체를 미렌더. legacy 결과는 산식 없이 기존 동작 100% 보존 |
| R-2 | 사용자가 ⑦(할증 전)과 ⑦합계 혼동 | fine-print 2종 명시 ("⑦은 할증 전" / "⑦합계 = 산출세액 + 할증") |
| R-3 | 조특 특례 차감 후 3% 적용 흐름 사용자 혼동 | 조특 특례>0일 때 amber 안내 추가 |
| R-4 | CreditRow의 useState 추가 → 다른 호출처(InheritanceTaxResultView)에서 의도치 않은 상태 변경 | formula optional, 미전달 시 펼침 토글 미렌더 — 기존 동작 100% 보존 |
| R-5 | 산식 영역이 길어 모바일 가독성 저하 | flex-wrap + 줄바꿈 + 좁은 폰트 (text-[11px]) |
| R-6 | aggregatedTaxBase=0에서 division by zero 위험 | `aggregatedTaxBase > 0` 가드 + 무효 안내 (rose-600) |
| R-7 | priorGiftCreditDetail prop 추가가 GiftTaxResultView에 영향 | optional prop, 미전달 시 §28 펼침 미표시 (현행 동작) |
| R-8 | **엔진 line 334 잠재 정밀도 손실** — `Math.floor(computedTax × priorGiftAddedTaxBase / aggregatedTaxBase)`에서 두 큰 정수 곱이 `Number.MAX_SAFE_INTEGER`(9 × 10^15) 초과 가능. 부록 A 데이터(380M × 600M = 2.28 × 10^17)도 해당. JavaScript는 IEEE 754 double로 처리 — 마지막 자리 손실 가능 | 본 PR 범위 외 (엔진 기존 동작). 별도 PR로 `safeMultiply()`(BigInt fallback, `tax-utils.ts`) 적용 권장. anchor F-3·F-9가 부록 A 데이터를 정확히 검증하므로 현재 케이스는 ok (228,000,000은 정확한 정수 결과). 향후 큰 금액 케이스 신중 |

---

## §8. 작업 순서 (Do 단계)

| 단계 | 작업 | 추정 |
|---|---|---|
| D-1 | `TaxCreditResult`에 `filingCreditBase?`·`totalComputedTaxWithSurcharge?` 추가 + tsc | 0.1d |
| D-2 | `calcGiftTaxCredits` return 직전 echo 2줄 + 기존 anchor 회귀 확인 | 0.1d |
| D-3 | anchor 10건 (F-1~F-10) 작성·통과 | 0.4d |
| D-4 | `TaxCreditBreakdownCard` CreditRow 확장 + Var 컴포넌트 + 빌더 2종 | 0.5d |
| D-5 | `GiftTaxResultView` 호출처에 `priorGiftCreditDetail`·`computedTax` prop 전달 | 0.05d |
| D-6 | 브라우저 수동 검증 (U-1~U-12) | 0.3d |
| D-7 | MEMORY.md 항목 추가 + 회귀 PASS 최종 확인 | 0.1d |

**총 추정**: 약 1.55d (Plan §10 일치).

---

## §9. Definition of Done

- [ ] `TaxCreditResult`에 `filingCreditBase?: number`·`totalComputedTaxWithSurcharge?: number` 추가
- [ ] `inheritance-gift-tax-credit.ts:419` return 직전 echo 2줄 (계산 변경 0)
- [ ] anchor 10건 (F-1~F-10) 100% PASS — 부록 A 자기일관 검증값 적중
- [ ] `TaxCreditBreakdownCard`의 §28·§69 펼침 영역 동작
- [ ] §28 산식 fine-print "⑦은 할증 전 산출세액"
- [ ] §69 산식 fine-print "⑦합계 = 산출세액 + 세대생략 할증"
- [ ] 조특 특례>0일 때 amber 안내
- [ ] aggregatedTaxBase=0 시 rose 무효 안내
- [ ] 변수 배지(⑭⑮⑯⑦⑤_prior⑤) 일관 표기
- [ ] `priorGiftCreditDetail=null`·`filingCredit=0` 시 펼침 토글 미렌더
- [ ] `npx tsc --noEmit` 0 errors
- [ ] `npm run lint` 0 errors
- [ ] 전체 vitest 회귀 0 신규
- [ ] 브라우저 수동 (U-2·U-4·U-9 핵심 3건)
- [ ] CLAUDE.md / MEMORY.md 메모리 항목 추가

---

## §10. 후속 PR 분리 항목

1. **상속세 동일 패턴** — `InheritanceTaxResultView` + `calcInheritanceTaxCredits` echo + §28·§30·§69 산식
2. **외국납부세액공제 §29/§59 산식** — 해외 자산 한도식 노출
3. **단기재상속공제 §30 산식** — 10년 내 재상속 차등 공제율 표
4. **조특법 과세특례 절감액 산식** — 창업자금·가업승계 (특례세액 vs 일반세액 비교)
5. **§58 한도 사례 다중 회차** — 가장 최근 합산 회차 외 추가 회차 표시 (현재는 최근 1건만)

---

## 부록 A — UI 렌더 결과 예시 (부록 A 데이터 기준)

```
┌─────────────────────────────────────────────────────────────┐
│ 세액공제 내역                          - 232,560,000        │
│                                       세액 대비 61.2% 절감  │
├─────────────────────────────────────────────────────────────┤
│ 증여세액공제  §28   [▶ 산출근거]      - 228,000,000        │
│ 신고세액공제 (3%)  §69   [▶ 산출근거]   -   4,560,000        │
│ 세액공제 합계                          - 232,560,000        │
└─────────────────────────────────────────────────────────────┘

[펼침 후 — §28]
  ┌─────────────────────────────────────────────┐
  │  ⑯ 228,000,000 = Min(⑭ 240,000,000,         │
  │                       ⑮ 228,000,000)          │
  │  ⑭ 240,000,000  가장 최근 합산 회차의 ⑦     │
  │  ⑮ 228,000,000 = ⑦ 380,000,000 ×            │
  │     (⑤_prior 600,000,000 ÷ ⑤ 1,000,000,000) │
  │  ※ ⑦은 할증 전 산출세액                      │
  └─────────────────────────────────────────────┘

[펼침 후 — §69]
  ┌─────────────────────────────────────────────┐
  │  4,560,000 = [기준세액 152,000,000] × 3%       │
  │  [기준세액 152,000,000] = [⑦합계 380,000,000] │
  │                         − §28 228,000,000    │
  │  (외국납부·조특 특례 미적용)                  │
  │  ※ ⑦합계 = 산출세액 + 세대생략 할증           │
  └─────────────────────────────────────────────┘
```

---

> **다음 단계**: 본 디자인 승인 후 `inheritance-gift-tax-ui-senior` + `inheritance-gift-tax-senior` 동시 호출로 Do 단계 진입.
