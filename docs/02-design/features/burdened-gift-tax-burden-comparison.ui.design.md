# 부담부증여 세부담 비교 카드 — UI 설계

> Plan: `docs/00-pm/burdened-gift-tax-burden-comparison.plan.md`
> 엔진 설계: `docs/02-design/features/burdened-gift-tax-burden-comparison.engine.design.md`
> 작성일: 2026-06-21
> 담당: inheritance-gift-tax-ui-senior
> 법령 검증: KoreanLaw MCP MST 276123 (상증법 §47①③) — 엔진 설계에서 직접 확인 완료. 본 UI 문서는 확인된 값만 인용.
> 전제 PR: #321 (결과뷰 정리), #316 (§114조의2 가산세), #315 (K-4/K-5 취득가액)

---

## 0. 한 줄 요약

`GiftTaxForm.tsx`의 `handleCalculate`에 `calcGiftTax(simpleInput)` 동기 1줄을 삽입하고,
`BurdenedGiftComparisonCard.tsx`를 신규 생성해 `GiftTaxResultView.tsx`에 삽입한다.
엔진 신규 필드 0건 — 14개 동기화 지점 대부분 N/A. 실제 작업 지점은 오케스트레이션(GiftTaxForm) + ⑦ 결과 카드 + PrintSection 3곳 동기화뿐.

---

## 1. 법령 근거

### 상증법 §47① — 부담부증여 채무인수 차감 (KoreanLaw MST 276123 확인)

```
① 증여세 과세가액은 증여일 현재 이 법에 따른 증여재산가액을 합친 금액[…]에서
   그 증여재산에 담보된 채무(그 증여재산에 관련된 채무 등 대통령령으로 정하는 채무를 포함한다)로서
   수증자가 인수한 금액을 뺀 금액으로 한다.
```

**UI 적용**: 단순증여 baseline 산출 시 `assumedDebtForGift = 0`(채무인수액 제거)으로 설정하면
§47①의 차감이 0이 되어 동일 자산 전액 무상증여 케이스가 된다. 엔진이 이를 자동 처리하므로
UI는 채무를 0으로 덮어쓴 input만 전달하면 된다.

### 상증법 §47③ — 배우자·직계존비속 채무 추정 (KoreanLaw MST 276123 확인)

```
③ 제1항을 적용할 때 배우자 간 또는 직계존비속 간의 부담부증여에 대해서는 수증자가 증여자의 채무를
   인수한 경우에도 그 채무액은 수증자에게 인수되지 아니한 것으로 추정한다. 다만, 그 채무액이
   국가 및 지방자치단체에 대한 채무 등 대통령령으로 정하는 바에 따라 객관적으로 인정되는 것인 경우에는
   그러하지 아니하다.
```

**UI 적용**: §47③ 단서(객관적 채무) 충족 여부는 기존 엔진이 처리한다. 비교 카드는 엔진이 실제로
적용한 `finalTax`를 그대로 사용하므로 §47③ 분기를 재구현하지 않는다.

### 상증법 §53 — 증여재산공제 (KoreanLaw MST 276123 확인)

| 관계 | 공제 한도(10년 합산) |
|---|---|
| 배우자 | 6억원 |
| 직계존속 → 성년 수증자 | 5천만원 |
| 직계존속 → 미성년 수증자 | 2천만원 |
| 직계비속 | 5천만원 |
| 4촌 이내 혈족·3촌 이내 인척 | 1천만원 |

**UI 적용**: §53 공제는 과세가액에 비선형 의존하므로, 단순증여 baseline을 delta 역산으로 구할 수 없다.
채무 0 input으로 `calcGiftTax`를 **동기 재호출**해야 정확한 baseline이 산출된다(엔진 설계 §STEP2 참조).

---

## 2. 기능 요약 (인터뷰 확정)

| 항목 | 확정 내용 |
|---|---|
| 비교 범위 | 단순증여 증여세 vs (부담부 증여세 + 양도소득세) 총 세부담 |
| 표시 위치 | `BurdenedTransferTaxResultCard` 직후 독립 카드 |
| 단순증여 정의 | 동일 자산·채무인수 없이 전부 무상증여. giftItems 전체(부동산+주식 병합분) `assumedDebtForGift = 0`, 그 외 모든 조건(공제·사전증여·세대생략·2-스트림 특례) 동일 |
| 유불리 표현 | 금지 — "절세"·"유리"·"불리" 등 일체 금지. 중립 사실만 표시 |

---

## 3. 신규 입력 필드

**없음.** 이 기능은 기존 입력값을 재사용한 파생 계산이다. 폼 상태 타입 변경 없음.

---

## 4. 14개 동기화 지점 전수 점검

엔진 input/result **신규 필드 없음** → 8클라이언트+6 API 지점 대부분 N/A.

| # | 지점 | 파일 | 작업 | 상태 |
|---|---|---|---|---|
| ① | 폼 상태 타입 | — | N/A (신규 폼 필드 없음) | N/A |
| ② | initial value | — | N/A | N/A |
| ③ | normalize fallback | — | N/A | N/A |
| ④ | API 변환 | `lib/calc/gift-api.ts` (참조) + `GiftTaxForm.tsx` (오케스트레이션) | `buildGiftTaxInput(form)` 결과 `giftItems` 전체(부동산+주식 병합분)의 `assumedDebtForGift = 0`으로 map+spread. 원본 engineInput 불변 보장 필수 | **Do 추가** |
| ⑤ | UI 입력 위젯 | — | N/A (신규 입력 필드 없음) | N/A |
| ⑥ | 사이드바 합계 | — | N/A (결과 도착 후 파생값 — 사이드바 미표시) | N/A |
| ⑦ | 결과 카드 | `components/calc/results/BurdenedGiftComparisonCard.tsx` (신규) + `GiftTaxResultView.tsx` | BurdenedGiftComparisonCard 신규 + ResultView Props 확장 + 삽입·prop 전달 + availablePrintIds memo 등록 | **Do 추가** |
| ⑧ | validation | — | N/A (신규 입력 필드 없음 — 비교값은 표시 전용) | N/A |
| ⑨ | Zod enum | — | N/A | N/A |
| ⑩ | Zod 컴패니언 | — | N/A | N/A |
| ⑪ | acqDate fallback | — | N/A | N/A |
| ⑫ | Zod 입력객체 | — | N/A | N/A |
| ⑬ | body spread | — | N/A | N/A |
| ⑭ | Route 매핑 | — | N/A | N/A |

**실제 신규 작업 지점 요약 (5곳)**:

| 파일 | 작업 내용 |
|---|---|
| `components/calc/GiftTaxForm.tsx` | `handleCalculate` 내 `calcGiftTax(simpleInput)` 동기 호출 + `simpleGiftResult` state + `handleReset` 초기화 + GiftTaxResultView에 prop 전달 |
| `lib/calc/gift-burden-comparison.ts` (신규) | `BurdenedGiftComparisonResult` 타입 + `computeBurdenedGiftComparison` 순수함수 |
| `components/calc/results/BurdenedGiftComparisonCard.tsx` (신규) | 비교 표 UI 컴포넌트 |
| `components/calc/results/GiftTaxResultView.tsx` | Props에 `simpleGiftResult?: GiftTaxResult` 추가 + 삽입 + `availablePrintIds` memo 등록 + deps 배열 갱신 |
| `lib/print/gift-print-sections.ts` | PrintSection id 3곳 동기화 |

---

## 5. 케이스 매트릭스 (법령 본문·단서·각호 전수)

| # | 시나리오 | 상증법 §47① 채무 | simpleGiftResult | transferTaxResults | 비교 카드 표시 | 비고 |
|---|---|---|---|---|---|---|
| T-01 | 부담부 자산 1건 + 양도세 성공 | `assumedDebtForGift > 0` | 산출 | length >= 1 | **표시** | 기본 케이스 |
| T-02 | 부담부 자산 0건 (순수 증여) | 모든 item 채무 0 | null | length = 0 | **미표시** | simpleGiftResult null |
| T-03 | 양도세 계산 실패 (`transferTaxError` 있음) | 채무 있음 | 산출 | 성공 건만 또는 0 | **미표시** | 불완전 합계 오도 방지 |
| T-04 | 단순증여 세부담 > 부담부 합계 (양수 차이) | 채무 있음 | 산출 | length >= 1 | **표시** (△ 기호) | 일반적 케이스 |
| T-05 | 단순증여 세부담 <= 부담부 합계 (음수·0 차이) | 채무 있음 | 산출 | length >= 1 | **표시** (음수 그대로 중립 표기) | 비정상 방어 — "불리" 표현 금지 |
| T-06 | 부담부 자산 2건 (transferTaxResults 2건) | 채무 있음 (2자산) | 산출 (전체 채무 0) | length = 2 | **표시** (양도세 = reduce 합산) | 다중 양도세 합산 |
| T-07 | 주식 부담부증여 (`stockItems`에 채무) | stockItems.assumedDebtForGift > 0 | 산출 (stockItems 채무 포함 0 처리) | length = 0 (주식은 양도세 토글·오케스트레이션 부재) | **미표시 (의도)** | 주식은 양도세 토글 UI·오케스트레이션 부재로 `transferTaxResults` 생성 불가 → §131 참조 |
| T-08 | 2-스트림 특례 자산 포함 | 채무 있음 | 산출 (동일 특례 적용) | length >= 1 | **표시** | 특례 동일 반영 — 별도 처리 없음 |
| T-09 | 사전증여 합산 포함 (§47②) | 채무 있음 | 산출 (동일 합산 적용) | length >= 1 | **표시** | 별도 처리 없음 |
| T-10 | 세대생략 할증 (§57) | 채무 있음 | 산출 (동일 할증 적용) | length >= 1 | **표시** | 별도 처리 없음 |
| T-11 | mixed-toggle: 자산A(채무>0·양도세 토글 ON) + 자산B(채무>0·양도세 토글 OFF) 혼재 | A·B 모두 채무 있음 | 산출 (A·B 전부 채무 0 = 무상가정) | length = 1 (자산A만 — 토글 OFF인 B는 루프 제외) | **표시하되 불완전 안내** | ★게이트 비대칭. 아래 §주의 참조 |

**표시 게이트 (AND 3조건)**:
1. `simpleGiftResult != null` — 부담부 자산 존재(채무 > 0)
2. `transferTaxResults.length > 0` — 양도세 결과 최소 1건
3. `!transferTaxError` — 양도세 계산 오류 없음

**주의 — T-07 주식 단독 부담부증여는 항상 미표시 (구조적 강제)**: 주식 자산은 (a) 입력 컴포넌트 `StockBurdenedDebtSection.tsx`(components/calc/gift/StockBurdenedDebtSection.tsx)가 `assumedDebtForGift`·`burdenedGiftDebtConfirmed`만 노출하고 `burdenedGiftTransferTax`(양도세 토글)는 §66 필드와 함께 **의도적으로 제외**(헤더 주석 명시)하고, (b) 오케스트레이션 양도세 루프가 `burdenedItems = form.giftItems.filter(...)`로 **`form.giftItems`만 스캔**하며 `form.stockItems`는 절대 스캔하지 않는다(GiftTaxForm.tsx:142-144). 따라서 주식 단독 부담부증여는 `transferTaxResults`가 영원히 비어(`length === 0`) 게이트 (2) 미충족 → 비교 카드 **미표시가 강제**된다. 채무 자체는 §47①로 차감되지만, 양도세 발생(소득세법 §88)은 토글·오케스트레이션 부재로 미도달이다. (엔진 설계 §STEP2·STEP4·anchor-3 결론과 동일.)

**주의 — T-11 mixed-toggle 게이트 비대칭 (산출 범위 불일치)**: `simpleGiftResult` 산출 게이트(§6.2: `engineInput.giftItems.every(채무 === 0)`이 아니면 산출 = **채무 > 0인 모든 자산** 대상)와 `transferTaxResults` 합산 게이트(GiftTaxForm.tsx:142-143: `form.giftItems.filter(it => it.burdenedGiftTransferTax !== undefined)` = **양도세 토글 ON 자산만**)는 서로 다른 플래그를 쓴다. `burdenedGiftTransferTax` 토글은 `BurdenedGiftTransferSection.tsx`(line 7·121)에서 `assumedDebtForGift > 0`일 때만 노출되는 독립 3-state optional 토글(`feedback_three_state_optional_mode_toggle`)이라 "채무 > 0 + 토글 OFF" 자산이 **도달 가능**하다.

자산A(채무·토글 ON)·자산B(채무·토글 OFF) 혼재 시:
- `burdenedGiftTax`(`result.finalTax`) = A·B **양쪽 채무 모두** §47① 차감 반영
- `simpleGiftTax` = A·B **양쪽 모두** 무상가정(채무 0)
- 그러나 `burdenedTransferTax` = **A의 양도세만** 합산 → B의 채무인수분 양도세(소득세법 §88·§159, §47①)는 **누락**
- 결과: `burdenedTotal` 과소집계 → `taxBurdenDiff` 왜곡

**채택 해법 (A)**: 비교 카드는 **양도세 토글 ON 자산이 1건 이상**일 때만 산출·표시(현행 게이트 (2) `transferTaxResults.length > 0` 유지)하되, "채무 > 0인데 양도세 토글 OFF인 자산(B)이 존재"하면 비교가 불완전함을 카드 하단에 명시 안내한다(§8.5 하단 안내에 조건부 1행 추가). 즉 `taxBurdenDiff`는 토글 ON 자산의 양도세만 포함하므로, 토글 OFF 자산이 섞인 경우 "일부 자산의 양도소득세는 비교에 포함되지 않았습니다" 안내를 부가해 과소집계를 사용자에게 드러낸다. (Do 시 불완전 안내 문구·게이트 판정 로직 최종 확정. 대안 (B) 비교 범위를 토글 ON 자산으로 한정해 `burdenedGiftTax`·`simpleGiftTax`도 동일 범위로 재산출하는 방식은 SCOPE OUT — 자산별 분리 재계산 비용·복잡도가 크다.)

---

## 6. 오케스트레이션 변경 명세 (`GiftTaxForm.tsx`)

### 6.1 simpleGiftResult 상태 추가

```ts
// 기존 transferTaxResults, transferTaxError 상태 근처에 추가
const [simpleGiftResult, setSimpleGiftResult] = useState<GiftTaxResult | null>(null);
```

### 6.2 handleCalculate 내 삽입 위치

현행 흐름:
```
1. POST /api/calc/gift → setResult(data.result)
2. burdenedItems 순회 → callGiftBurdenedTransferAPI → setTransferTaxResults
```

추가 흐름 (0' — 기존 1, 2 전에):
```
0'. engineInput = buildGiftTaxInput(form)
    [조건] engineInput.giftItems.every(it => (it.assumedDebtForGift ?? 0) === 0)
            → setSimpleGiftResult(null)  // 부담부 자산 없음
    [아니면]
    simpleInput = {
      ...engineInput,
      giftItems: engineInput.giftItems.map(item => ({
        ...item,
        assumedDebtForGift: 0,   // §47① 채무인수액 0 — 전액 무상증여 가정
      })),
    }
    setSimpleGiftResult(calcGiftTax(simpleInput))  // 동기 호출 — 네트워크 없음
```

**원본 불변 규칙**: `engineInput` 직접 mutation 금지. `map` + 스프레드로 새 객체 생성.

**병합분 채무 포함 규칙**: `buildGiftTaxInput`의 `allItems`(gift-api.ts:42)는 `[...form.giftItems, ...form.stockItems]` 병합 후 매핑된 배열이 `engineInput.giftItems`로 전달된다. 채무 0 설정은 **이 병합 배열 전체**에 적용해야 주식 채무 누락을 방지한다.

**비동기 없음**: `calcGiftTax`(lib/tax-engine/gift-tax.ts:70)는 동기 순수 함수. DB 세율 주입 없음(DEFAULT_INHERITANCE_GIFT_BRACKETS 기본값). 로딩 state·에러 배너 불필요.

### 6.3 handleReset 초기화

```ts
const handleReset = () => {
  setForm(INITIAL_FORM);
  setResult(null);
  setTransferTaxResults([]);
  setTransferTaxError(null);
  setSimpleGiftResult(null);   // ← 추가 1줄
  setStep(0);
  setError(null);
};
```

### 6.4 GiftTaxResultView prop 전달

```tsx
<GiftTaxResultView
  result={result}
  // ... 기존 props ...
  transferTaxResults={transferTaxResults}
  transferTaxError={transferTaxError ?? undefined}
  simpleGiftResult={simpleGiftResult ?? undefined}   // ← 추가
/>
```

---

## 7. 비교 순수함수 (`lib/calc/gift-burden-comparison.ts` 신규)

### 7.1 타입 정의

```ts
import type { GiftTaxResult } from "@/lib/tax-engine/types/inheritance-gift.types";
import type { TransferTaxResult } from "@/lib/tax-engine/types/transfer.types";

/** 부담부증여 세부담 비교 결과 */
export interface BurdenedGiftComparisonResult {
  /** 단순증여(채무 0) 시 증여세 결정세액 */
  simpleGiftTax: number;
  /** 부담부증여 시 증여세 결정세액 */
  burdenedGiftTax: number;
  /** 부담부증여 시 양도소득세 합계 (지방소득세 포함) */
  burdenedTransferTax: number;
  /** 부담부 총세부담 = burdenedGiftTax + burdenedTransferTax */
  burdenedTotal: number;
  /** 세부담 차이 = simpleGiftTax − burdenedTotal (음수 가능) */
  taxBurdenDiff: number;
}
```

### 7.2 순수함수

```ts
/** 단일 진실 — UI가 직접 재계산하지 않고 이 함수를 import해 사용 */
export function computeBurdenedGiftComparison(
  simpleGiftResult: GiftTaxResult,
  giftResult: GiftTaxResult,
  transferTaxResults: TransferTaxResult[],
): BurdenedGiftComparisonResult {
  const simpleGiftTax       = simpleGiftResult.finalTax;
  const burdenedGiftTax     = giftResult.finalTax;
  const burdenedTransferTax = transferTaxResults.reduce((s, t) => s + t.totalTax, 0);
  const burdenedTotal       = burdenedGiftTax + burdenedTransferTax;
  const taxBurdenDiff       = simpleGiftTax - burdenedTotal; // 음수 가능
  return { simpleGiftTax, burdenedGiftTax, burdenedTransferTax, burdenedTotal, taxBurdenDiff };
}
```

**위치 선택 근거**: 신규 파일 `lib/calc/gift-burden-comparison.ts`로 분리. `gift-burdened-transfer-api.ts`에 추가하면 800줄 위반 가능성이 있고, 독립 단위 테스트도 용이함.

---

## 8. 결과 카드 UI 명세 (`BurdenedGiftComparisonCard.tsx` 신규)

### 8.1 레이아웃

```
┌─ 단순증여 vs 부담부증여 세부담 비교 ──────────────────────────┐
│                                                             │
│  구분          단순증여       부담부증여                         │
│  ────────────────────────────────────────────────           │
│  증여세     120,000,000    70,000,000                        │
│  양도소득세        —         35,000,000                       │
│  ────────────────────────────────────────────────           │
│  합계        120,000,000  105,000,000                        │
│  세부담 차이              △ 15,000,000                        │
│                                                             │
│  두 시나리오의 세부담을 비교한 참고 정보입니다.                     │
└──────────────────────────────────────────────────────────┘
```

### 8.2 Props

```ts
interface BurdenedGiftComparisonCardProps {
  simpleGiftResult: GiftTaxResult;
  giftResult: GiftTaxResult;
  transferTaxResults: TransferTaxResult[];
}
```

**내부에서 `computeBurdenedGiftComparison` 호출** — UI 자체 산술 금지(`feedback_ui_engine_dual_truth_avoidance`).

### 8.3 금액 표시 규칙

- `text-right font-mono tabular-nums whitespace-nowrap` (amount-column-align 스킬)
- `formatKRW(n)` 사용 (GiftTaxResultView 기존 패턴 동일)
- "원" 접미사 생략 (`feedback_no_won_suffix`)
- 단순증여 열 양도소득세 칸: `—` (대시) 표시

### 8.4 차액 표시 규칙

| `taxBurdenDiff` 값 | 표시 | 금지 |
|---|---|---|
| > 0 (단순증여 세부담이 더 큼) | `△ {차이}` | "절세"·"유리" |
| = 0 | `0` | — |
| < 0 (부담부 합계가 더 큼) | `▼ {절댓값}` 또는 `△ −{차이}` — Do 시 확정 | "불리" |

**납세자 유불리 표현 금지** (`feedback_tax_calculation_principle`). 사실만 표기.

### 8.5 카드 하단 안내

```
두 시나리오의 세부담을 비교한 참고 정보입니다.
```

중립적 사실만 안내. 유불리 판단 문구 금지.

**조건부 불완전 안내 (T-11 mixed-toggle 대응)**: "채무 > 0인데 양도세 토글 OFF인 자산"이 존재하면(즉 채무 보유 자산 수 > `transferTaxResults` 대상 자산 수) 아래 1행을 추가 표기해 `burdenedTransferTax`가 일부 자산 양도세를 누락함을 드러낸다(중립 사실, 유불리 표현 금지).

```
일부 자산의 양도소득세는 비교에 포함되지 않았습니다.
```

판정 입력은 오케스트레이션에서 전달(예: 채무 보유 자산 수 vs 양도세 대상 자산 수). Do 시 prop·문구 최종 확정.

### 8.6 펼치기/접기

단순 2열 표이므로 펼치기/접기 불필요 (기본 노출). 추후 필요 시 `ExpandToggleButton` 표준 적용.

### 8.7 테이블 구조 스케치

```tsx
function BurdenedGiftComparisonCard({
  simpleGiftResult,
  giftResult,
  transferTaxResults,
}: BurdenedGiftComparisonCardProps) {
  const cmp = computeBurdenedGiftComparison(simpleGiftResult, giftResult, transferTaxResults);

  return (
    <div className="rounded-xl border border-sky-200 bg-sky-50/40 dark:bg-sky-950/20 p-4">
      <p className="text-sm font-semibold text-sky-800 dark:text-sky-200 mb-3">
        단순증여 vs 부담부증여 세부담 비교
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-sky-200">
              <th className="text-left py-1 font-medium text-gray-600 dark:text-gray-400">구분</th>
              <th className="text-right py-1 font-medium text-gray-600 dark:text-gray-400 pr-4">단순증여</th>
              <th className="text-right py-1 font-medium text-gray-600 dark:text-gray-400">부담부증여</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-sky-100">
              <td className="py-1.5 text-gray-700 dark:text-gray-300">증여세</td>
              <td className="py-1.5 text-right font-mono tabular-nums pr-4">
                {formatKRW(cmp.simpleGiftTax)}
              </td>
              <td className="py-1.5 text-right font-mono tabular-nums">
                {formatKRW(cmp.burdenedGiftTax)}
              </td>
            </tr>
            <tr className="border-b border-sky-200">
              <td className="py-1.5 text-gray-700 dark:text-gray-300">양도소득세</td>
              <td className="py-1.5 text-right text-gray-400 pr-4">—</td>
              <td className="py-1.5 text-right font-mono tabular-nums">
                {formatKRW(cmp.burdenedTransferTax)}
              </td>
            </tr>
            <tr className="border-b border-sky-200 bg-sky-100/40">
              <td className="py-1.5 font-semibold text-gray-800 dark:text-gray-200">합계</td>
              <td className="py-1.5 text-right font-mono tabular-nums font-semibold pr-4">
                {formatKRW(cmp.simpleGiftTax)}
              </td>
              <td className="py-1.5 text-right font-mono tabular-nums font-semibold">
                {formatKRW(cmp.burdenedTotal)}
              </td>
            </tr>
            <tr>
              <td className="py-1.5 text-gray-700 dark:text-gray-300">세부담 차이</td>
              <td className="pr-4"></td>
              <td className="py-1.5 text-right font-mono tabular-nums font-semibold text-sky-700 dark:text-sky-300">
                {/* △ 양수 / 0 / ▼ 음수 — Do 시 최종 확정 */}
                {cmp.taxBurdenDiff > 0
                  ? `△ ${formatKRW(cmp.taxBurdenDiff)}`
                  : cmp.taxBurdenDiff === 0
                    ? "0"
                    : `▼ ${formatKRW(Math.abs(cmp.taxBurdenDiff))}`}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">
        두 시나리오의 세부담을 비교한 참고 정보입니다.
      </p>
    </div>
  );
}
```

---

## 9. GiftTaxResultView.tsx 변경 명세

### 9.1 Props 인터페이스 확장 (line 140~187)

```ts
interface Props {
  // ... 기존 props ...
  /** 단순증여 baseline 증여세 결과 — 부담부 자산 있을 때만 산출, 없으면 undefined */
  simpleGiftResult?: GiftTaxResult;
}
```

**주의**: `GiftTaxResult` import는 line 9에 이미 존재 — 중복 추가 금지.

### 9.2 구조분해 (line 189~205)

```ts
export function GiftTaxResultView({
  // ... 기존 구조분해 ...
  simpleGiftResult,  // ← 추가 (optional이므로 기본값 불필요)
}: Props) {
```

### 9.3 availablePrintIds useMemo 갱신 (line 260~292)

```ts
const availablePrintIds = useMemo<Set<GiftPrintSectionId>>(() => {
  // ... 기존 로직 ...
  if (transferTaxResults.length > 0) s.add("burdened-transfer-tax");

  // ★ 신규 등록 — 표시 조건과 3자 일치 필수
  if (
    simpleGiftResult != null &&
    transferTaxResults.length > 0 &&
    !transferTaxError
  )
    s.add("burdened-gift-comparison");

  return s;
}, [
  result,
  estateItems,
  priorGifts,
  transferTaxResults,
  transferTaxError,      // ★ 신규 deps 추가 (누락 시 transferTaxError 변경 시 stale)
  simpleGiftResult,      // ★ 신규 deps 추가 (누락 시 simpleGiftResult 변경 시 stale)
]);
```

**3자 일치 강제**: 화면 표시 조건 · availablePrintIds 등록 조건 · useMemo 의존성 배열 — 셋 모두
`simpleGiftResult != null && transferTaxResults.length > 0 && !transferTaxError`로 일치.

### 9.4 삽입 위치 (line 501~505 이후)

```tsx
{/* 기존 — burdened-transfer-tax PrintSection */}
{transferTaxResults.length > 0 && (
  <PrintSection id="burdened-transfer-tax" selectedIds={selectedPrintIds}>
    <BurdenedTransferTaxResultCard transferTaxResults={transferTaxResults} />
  </PrintSection>
)}

{/* ★ 신규 — 세부담 비교 카드 */}
{simpleGiftResult != null &&
  transferTaxResults.length > 0 &&
  !transferTaxError && (
  <PrintSection id="burdened-gift-comparison" selectedIds={selectedPrintIds}>
    <BurdenedGiftComparisonCard
      simpleGiftResult={simpleGiftResult}
      giftResult={result}
      transferTaxResults={transferTaxResults}
    />
  </PrintSection>
)}
```

---

## 10. PrintSection 3곳 동기화 (`lib/print/gift-print-sections.ts`)

`project_selective_print_6tax_series` 패턴. 정확히 3곳 동기화 필수 — 1곳 누락 시 컴파일 오류 또는 패널 미노출.

### (1) GiftPrintSectionId 유니온 (line 30~44)

```ts
export type GiftPrintSectionId =
  | "core-result"
  | ...
  | "burdened-transfer-tax"
  | "burdened-gift-comparison";  // ← 추가
```

미추가 시: `<PrintSection id="burdened-gift-comparison">` TS 컴파일 에러.

### (2) GIFT_PRINT_SECTIONS leaf 노드 (line 96~103)

`group:etc` children에 추가:

```ts
{ id: "burdened-gift-comparison", label: "세부담 비교 (단순증여 vs 부담부증여)", channel: SCREEN },
```

미추가 시: 선택 패널에 항목 미노출.

### (3) availablePrintIds memo 조건부 등록

위 §9.3 참조. 미등록·deps 누락 시 선택 가능 목록 stale.

---

## 11. Cross-field 동기화 — useEffect 금지 선언

이 기능에는 cross-field 동기화가 없다. `simpleGiftResult`는 `handleCalculate` 내에서 동기 계산되어
state에 저장되는 단방향 파생값이다. `useEffect → store 미러링` 금지 정책 위반 소지 없음.

---

## 12. Silent Fallback 후보 식별

| 위험 후보 | 처리 |
|---|---|
| `engineInput.giftItems` 직접 mutation | `map` + spread로 새 객체 생성. 원본 불변. 기존 `/api/calc/gift` 호출에 채무 0 오전송 방지 |
| `form.stockItems` 채무 누락 | `buildGiftTaxInput`의 `allItems`(gift-api.ts:42)가 이미 `[...form.giftItems, ...form.stockItems]` 병합이므로 `engineInput.giftItems` 전체에 0 적용으로 충분 |
| `calcGiftTax` 예외 | 순수 함수. 예외 발생 안 함. try/catch 불필요 |
| `taxBurdenDiff < 0` 음수 표시 | `▼` 기호 + 절댓값으로 중립 표기. "불리" 표현 금지 |

**자동 안분 fallback 금지** (`feedback_no_silent_apportion_fallback`): 채무 0 이외 모든 필드는 원본 그대로. 자동채움 없음.

---

## 13. Anchor 기대값

### anchor-1: 단순증여 채무 0 산출 자기일관 (Pre-Do 우선 실행)

**파일**: `__tests__/tax-engine/inheritance-gift/burdened-gift-comparison.test.ts` (신설)

**경로 주의**: 증여세 엔진 테스트는 `__tests__/tax-engine/inheritance-gift/`에 위치. `__tests__/tax-engine/gift/`는 부재 — 신규 생성 금지.

**입력**:
- 자산 1건: 부동산, 평가액 200,000,000원, `assumedDebtForGift = 80,000,000`
- 관계: 직계존속 → 성년 수증자 (공제 한도 5,000만원)
- 사전증여 없음, 세대생략 없음, 기한 내 신고

**수기 계산 — 단순증여 (채무 0)**:
```
과세가액 = 200,000,000 − 0 = 200,000,000
증여재산공제 = 50,000,000
과세표준 = 150,000,000
산출세액 = 150,000,000 × 20% − 10,000,000 (누진공제) = 20,000,000
신고세액공제 = 20,000,000 × 3% = 600,000
finalTax = 20,000,000 − 600,000 = 19,400,000
```

**수기 계산 — 부담부증여 (채무 80,000,000)**:
```
과세가액 = 200,000,000 − 80,000,000 = 120,000,000
증여재산공제 = 50,000,000
과세표준 = 70,000,000
산출세액 = 70,000,000 × 10% = 7,000,000
신고세액공제 = 7,000,000 × 3% = 210,000
finalTax = 7,000,000 − 210,000 = 6,790,000
```

**기대값**:
```ts
expect(simpleGiftResult.finalTax).toBe(19_400_000);
expect(burdenedGiftResult.finalTax).toBe(6_790_000);
```

**★ Do 진입 전 anchor-1을 먼저 실행해 현행 엔진이 위 수치를 반환하는지 실측 필수**.
불일치 시 anchor를 엔진 실측값으로 교정하고 디자인 환류.

### anchor-2: computeBurdenedGiftComparison 자기일관

```ts
// anchor-1 결과 사용
// simpleGiftResult.finalTax = 19,400,000
// giftResult.finalTax = 6,790,000
// transferTaxResults[0].totalTax = 5,000,000 (가정)

const cmp = computeBurdenedGiftComparison(simpleGiftResult, giftResult, [{ totalTax: 5_000_000 }]);
expect(cmp.simpleGiftTax).toBe(19_400_000);
expect(cmp.burdenedGiftTax).toBe(6_790_000);
expect(cmp.burdenedTransferTax).toBe(5_000_000);
expect(cmp.burdenedTotal).toBe(11_790_000);   // 6,790,000 + 5,000,000
expect(cmp.taxBurdenDiff).toBe(7_610_000);     // 19,400,000 − 11,790,000

// 자기일관 검증
expect(cmp.burdenedTotal).toBe(cmp.burdenedGiftTax + cmp.burdenedTransferTax);
expect(cmp.taxBurdenDiff).toBe(cmp.simpleGiftTax - cmp.burdenedTotal);
```

### anchor-3: 주식 채무 포함 T-07 케이스 — 병합분 전체 채무 0 확인

```ts
// stockItems에 assumedDebtForGift > 0가 있을 때 engineInput.giftItems에 포함 확인
const engineInput = buildGiftTaxInput(formWithStockBurdenedDebt);
const allDebtSum = engineInput.giftItems.reduce((s, it) => s + (it.assumedDebtForGift ?? 0), 0);
expect(allDebtSum).toBeGreaterThan(0);  // 주식 채무가 병합 배열에 포함

const simpleInput = {
  ...engineInput,
  giftItems: engineInput.giftItems.map(it => ({ ...it, assumedDebtForGift: 0 })),
};
const simpleDebtSum = simpleInput.giftItems.reduce((s, it) => s + (it.assumedDebtForGift ?? 0), 0);
expect(simpleDebtSum).toBe(0);  // 전체 채무 0 확인
```

### anchor-4: 비교 카드 미표시 조건 (T-02, T-03)

```ts
// T-02: 부담부 자산 없음 → simpleGiftResult null → 카드 미표시
// 검증: engineInput.giftItems.every(it => (it.assumedDebtForGift ?? 0) === 0) 이면 null

// T-03: transferTaxError 있음 → 표시 조건 미충족
// 검증: RTL render 시 BurdenedGiftComparisonCard 미렌더 (testid 부재)
```

---

## 14. 결과 산식 한국어 표기 규칙

| 항목 | 표시 | 금지 |
|---|---|---|
| 카드 제목 | "단순증여 vs 부담부증여 세부담 비교" | 내부 변수명 |
| 행 라벨 | "증여세", "양도소득세", "합계", "세부담 차이" | `finalTax`, `burdenedGiftTax` 등 |
| 단순증여 양도세 칸 | `—` | `0`, `null` |
| 차액 기호 | `△` (양수) / `▼` (음수, Do 시 확정) | "절세", "유리", "불리" |
| 하단 안내 | "두 시나리오의 세부담을 비교한 참고 정보입니다." | 판단·권유 문구 |

---

## 15. E2E 명세

### 파일: `e2e/gift-burdened-comparison.spec.ts` (신설)

`e2e/gift-burdened-transfer.spec.ts` 패턴 재사용.

```
시나리오:
  1. 증여세 마법사 → 부담부증여 자산 추가 (assumedDebtForGift > 0)
  2. 양도소득세 토글 ON (burdenedGiftTransferTax)
  3. 취득일·취득시 기준시가 입력
  4. 계산 실행
  5. "burdened-gift-comparison" PrintSection 존재 assert
  6. 증여세 행·양도소득세 행·합계 행·세부담 차이 행 존재 assert

E2E 함정:
  - 모달 닫기: backdrop 클릭 (project_stock_item_table_modal_plan 패턴)
  - RadioCardGroup accessible-name 오매칭: testId 셀렉터 사용
  - 자산명 필수 (모달 내 자산명 입력 없으면 저장 불가)
  - getByLabel("일") 토글 오매칭: textbox role 한정
  - transferTaxError 존재 시 비교 카드 미표시 → 양도세 성공 케이스로 테스트
```

---

## 16. 리스크·함정

| # | 리스크 | 정책 참조 | 대응 |
|---|---|---|---|
| R-1 | `engineInput` 직접 mutation → 기존 gift API 호출이 채무 0으로 오전송 | `feedback_no_silent_apportion_fallback` | map+spread 새 객체. 원본 불변 |
| R-2 | 주식 채무(`stockItems`) 누락 → 단순증여 baseline 과소 산출 | 엔진 설계 §STEP1 | `buildGiftTaxInput` 결과 `giftItems` 전체(병합분)에 0 적용 |
| R-3 | `availablePrintIds` deps 누락 → stale Set | 엔진 설계 §선택출력 | `transferTaxError`, `simpleGiftResult` 반드시 deps 포함 |
| R-4 | 표시 조건 3자 불일치 | 엔진 설계 §STEP4 | 화면 표시 조건 = memo 등록 조건 = deps 배열 — 셋 일치 |
| R-5 | `taxBurdenDiff < 0` 음수 UI "불리" 표현 | `feedback_tax_calculation_principle` | `▼` 기호 + 절댓값. "불리" 금지 |
| R-6 | useEffect store 미러링 시도 | `feedback_useeffect_store_mirror_forbidden` | `handleCalculate` 내 동기 직접 호출. useEffect 금지 |
| R-7 | `GiftTaxResult` import 중복 추가 | 기존 line 9 존재 | import 추가 금지. 구조분해에 `simpleGiftResult` 추가만 |
| R-8 | `GiftTaxResultView` 800줄 초과 | 800줄 정책 | 현재 710줄. `BurdenedGiftComparisonCard`를 별도 파일로 분리해 삽입 |

---

## 17. SCOPE OUT

- 단순증여 시나리오의 양도세 (단순 무상증여이므로 증여자 양도 없음)
- 양도세 세부 경로(K-1~K-5)별 비교 (기존 BurdenedTransferTaxResultCard가 담당)
- 비교 결과의 이력 저장·PDF 별도 채널 확장 (후속 PR)
- 유불리 판단·권유 문구 (정책상 금지)
- §47③ 채무 추정(배우자·직계존비속 단서) 적용 여부 별도 안내 (기존 엔진·결과뷰가 처리)
- T-11 mixed-toggle 대안 (B) — 비교 범위를 양도세 토글 ON 자산으로 한정해 `burdenedGiftTax`·`simpleGiftTax`를 자산별 분리 재계산: 자산별 분리 재산출 비용·복잡도가 커 채택하지 않음. 본 PR은 §5 주의의 해법 (A)(불완전 안내) 적용

---

## 18. 작업 순서 (Do)

1. **Pre-Do anchor-1 작성·실행 (실패 확보)** → 수기 계산값과 엔진 반환값 대조. 불일치 시 anchor를 엔진 실측값으로 교정.
2. **`lib/calc/gift-burden-comparison.ts` 신규**: `BurdenedGiftComparisonResult` 타입 + `computeBurdenedGiftComparison`. anchor-2·3·4 작성·통과.
3. **PrintSection 3곳 동기화** (`gift-print-sections.ts` 유니온·leaf + `GiftTaxResultView.tsx` availablePrintIds memo·deps).
4. **`GiftTaxForm.tsx` 오케스트레이션**: `simpleGiftResult` state + `handleCalculate` 내 동기 호출 + `handleReset` 초기화 + prop 전달.
5. **`BurdenedGiftComparisonCard.tsx` 신규** + `GiftTaxResultView.tsx` 삽입.
6. `npx tsc --noEmit` 0건 → `npx vitest run __tests__/tax-engine/inheritance-gift/` → E2E 1건.
7. 브라우저 수동 확인 (단순증여 baseline이 전 자산 채무 0으로 산출되는지) 또는 미수행 명시.

---

## 19. Definition of Done — 자가 점검 체크리스트

**3대 핵심 정책 사전 점검**:
- [ ] useEffect → store 미러링 없음 (`handleCalculate` 내 동기 직접 호출, useEffect 금지)
- [ ] 자동 안분 fallback 없음 (채무 0 명시 설정. 그 외 모든 필드 원본 유지)
- [ ] validation 8번째 동기화 — 신규 입력 필드 없음이므로 ⑧ N/A. 기존 validation 변경 없음 확인

**14개 동기화 지점**:
- [ ] ①②③⑤⑥⑧⑨⑩⑪⑫⑬⑭ N/A 확인 (신규 엔진 필드 없음)
- [ ] ④ API 변환: `buildGiftTaxInput` 결과 `giftItems` 전체 채무 0 — 원본 불변
- [ ] ⑦ 결과카드: `BurdenedGiftComparisonCard` 신규 + `GiftTaxResultView` 삽입·prop

**PrintSection 3곳 동기화**:
- [ ] `GiftPrintSectionId` 유니온에 `"burdened-gift-comparison"` 추가
- [ ] `GIFT_PRINT_SECTIONS` group:etc children에 leaf 노드 추가
- [ ] `availablePrintIds` useMemo 조건부 등록 + deps 배열 갱신 (transferTaxError·simpleGiftResult)

**구현 품질**:
- [ ] `computeBurdenedGiftComparison` 단일 진실 — UI 자체 산술 없음
- [ ] `GiftTaxResult` import 중복 추가 없음 (line 9 기존 import 활용)
- [ ] `GiftTaxResultView.tsx` 800줄 이하 유지 확인 (현재 710줄)
- [ ] 차액 표시: "절세"·"유리"·"불리" 등 유불리 표현 없음
- [ ] 단순증여 열 양도소득세 칸: `—` 표시
- [ ] 표시 조건 3자 일치: 화면 표시 = availablePrintIds 등록 = useMemo deps

**테스트**:
- [ ] anchor-1: `calcGiftTax` 채무 0 실측 확인
- [ ] anchor-2: `computeBurdenedGiftComparison` 자기일관 (합계·차액)
- [ ] anchor-3: 주식 채무 병합분 전체 0 처리 확인
- [ ] anchor-4: T-02·T-03 미표시 조건
- [ ] `npx tsc --noEmit` 0건
- [ ] `npx vitest run __tests__/tax-engine/inheritance-gift/` 통과
- [ ] E2E `gift-burdened-comparison.spec.ts` 또는 기존 spec 확장 통과
- [ ] 브라우저 수동 확인 또는 미수행 명시
