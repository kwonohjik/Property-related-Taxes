# 증여세 세액공제 산출근거 표시 (§28·§69)

> **Feature ID**: `gift-tax-credit-formula-display`
> **Scope**: UI 한정 (엔진 변경 0)
> **Tax Domain**: 증여세 §28 (증여세액공제) + §69 (신고세액공제) + §58 (안분 한도)
> **Status**: Plan (Pre-Design)
> **Author**: claude-opus-4-7
> **Date**: 2026-05-20

---

## 1. 배경 및 문제 정의

### 1.1 현재 상태

`components/calc/TaxCreditBreakdownCard.tsx` 의 세액공제 내역 카드는 **값만** 표시:

```
세액공제 내역                                      - 234,000,000
                                              세액 대비 54.7% 절감

증여세액공제          §28                           - 228,000,000
신고세액공제 (3%)     §69                           -   6,000,000
세액공제 합계                                       - 234,000,000
```

### 1.2 사용자 Pain Point

- 세액공제 값이 어떻게 산출되었는지 **검증 불가**
- §28의 §58 안분 한도 계산식이 결과 카드에 안 보임 (사용자가 신고서 ⑭⑮⑯ 행을 알 수 없음)
- §69의 3% 기준세액(= ⑦합계 − §28 − 외국납부 − 조특 특례)이 안 보임
- 세무사가 결과를 의뢰인에게 설명할 때 산식 노출이 필수

### 1.3 해결 방향

각 공제 항목 **하단에 산식 1줄 + 변수값**을 인라인 또는 펼침으로 노출:

```
증여세액공제 §28                                    - 228,000,000
  └─ ⑯ = Min(⑭ 240,000,000, ⑮ 228,000,000)
     ⑭ 가산 증여재산 산출세액 = 240,000,000
     ⑮ 한도 = ⑦ 380,000,000 × (⑤_prior 600,000,000 / ⑤ 1,000,000,000) = 228,000,000

신고세액공제 (3%) §69                               -   4,560,000
  └─ 4,560,000 = 152,000,000 × 3%
     기준세액 152,000,000 = ⑦합계 380,000,000 − §28 228,000,000
                                                ※ 외국납부·조특 특례 0
```

> 위 예시는 부록 A의 자기일관 anchor 데이터 기준. 사용자 이미지 #12(§28=228M·§69=6M)는 §1.1의 현재 화면 그대로이며, 그 데이터로 §69=6M이 나오려면 ⑦합계가 428M이어야 함(역산: 6M ÷ 3% = 200M base, 200M + 228M = 428M).

---

## 2. 법적 근거 (변경 없음)

| 조문 | 적용 |
|---|---|
| §28 (상증법) | 증여세액공제 — 10년 이내 사전증여 기납부세액 |
| §58 (상증법) | §28 공제한도 = ⑦(할증 전) × (사전증여 합산과세표준 ⑤_prior ÷ 현재 합산과세표준 ⑤) |
| §69 (상증법) | 신고세액공제 — 법정신고기한 내 신고 시 산출세액의 3% |
| 시행령 §65 | §69 공제 기준세액 = ⑦합계 − §28 − 외국납부 − **조특법 특례 절감액** |

> **증여세 특이사항**: 단기재상속공제(§30)는 상속세 전용 — 증여세에서는 항상 0 (`inheritance-gift-tax-credit.ts:422` `shortTermReinheritCredit: 0`).
> **차감 순서** (엔진 line 378·399): ⑦합계 → §28 → 외국납부 → 조특법 특례 → 잔액 × 3% = §69.

엔진은 이미 이 산식대로 계산 중. 본 PR은 UI 표시만.

---

## 3. 엔진 데이터 인벤토리 (이미 존재 — 신규 없음)

### 3.1 §28 — `GiftTaxResult.priorGiftCreditDetail`

```ts
priorGiftCreditDetail: {
  priorComputedTax: number;      // ⑭ = 가장 최근 합산 회차의 ⑦ (가산 증여재산 산출세액)
  priorAddedTaxBase: number;     // ⑤_prior 사전증여 합산과세표준
  aggregatedTaxBase: number;     // ⑤ 현재 합산과세표준
  creditLimit: number;           // ⑮ = floor(⑦ 할증전 × ⑤_prior / ⑤)
  priorPaidCredit: number;       // ⑯ = Min(⑭, ⑮) — 실제 공제액
} | null
```

> **출처 검증** (코드 grep 2026-05-20):
> - `priorComputedTax` ← `priorAggregation.totalComputedTax` ← `matched[0]?.computedTax` (gift-prior-aggregation.ts:137 — giftDate 내림차순 정렬 후 가장 최근 회차의 ⑦)
> - `creditLimit` 산식의 ⑦은 **할증 전 computedTax** (inheritance-gift-tax-credit.ts:334-335) — §69 산식의 ⑦합계(할증 포함)와 구분 필수.

→ `priorGiftCreditDetail.priorPaidCredit === credit.giftTaxCredit` (동일).
→ null이면 사전증여 없음 → §28 공제 없음 → 산식 표시 skip.

### 3.1.1 엔진 `breakdown`에 이미 산식 텍스트 존재 (대안 데이터 소스)

`inheritance-gift-tax-credit.ts:339-349`에서 §58 산식이 이미 CalculationStep으로 저장됨:
```
{ label: "§58 ① 한도 — ⑦ × ⑤_prior / ⑤", note: "계산값" }
{ label: "§58 ① 공제액 Min(가산 산출세액, 한도)", note: "..." }
```

**UI 옵션**:
- **Option A** (권장): UI 자체 빌더로 React JSX 산식 렌더링 — 변수 배지·정렬 자유도 높음
- **Option B**: 엔진 breakdown 텍스트 그대로 표시 — 변경 0이나 시각 표현 제약

→ Design 단계에서 Option A 채택 (변수 배지로 가독성·접근성 우위).

### 3.2 §69 — `TaxCreditResult.filingCredit` + 엔진 산식

엔진(`calcFilingCredit`)에 입력되는 `taxBeforeFilingCredit`은 `TaxCreditResult`에 직접 노출되지 않음. **신규 필드 추가 필요**:

```diff
 export interface TaxCreditResult {
   giftTaxCredit: number;
   foreignTaxCredit: number;
   shortTermReinheritCredit: number;
   filingCredit: number;
   specialTreatmentCredit: number;
   totalCredit: number;
   appliedLaws: string[];
   breakdown: CalculationStep[];
+  /**
+   * §69 산식 노출용 — 신고세액공제 기준세액.
+   * = totalComputedTaxWithSurcharge − giftTaxCredit − foreignTaxCredit − specialTreatmentCredit
+   * (= 엔진 remainingTax, line 378·399).
+   */
+  filingCreditBase?: number;
+  /**
+   * §69 산식 노출용 — 산출세액 합계 (할증 포함).
+   * = computedTax + generationSkipSurcharge
+   * (= 엔진 totalComputedTax, line 315). §28의 ⑦(할증 전)과 구분.
+   */
+  totalComputedTaxWithSurcharge?: number;
 }
```

> **명명 의도**: 직전 안의 `computedTaxForFilingCredit`는 의미 모호 → `totalComputedTaxWithSurcharge`로 정정. 신고서 양식의 ⑦합계와 일관.

→ 엔진 (`calcGiftTaxCredits` 반환 시) 2줄 추가하여 echo. 계산 로직 변경 없음.

```ts
// inheritance-gift-tax-credit.ts:419~ return 직전에 echo 2줄 추가
return {
  giftTaxCredit: priorPaidCredit,
  // ...
  filingCreditBase: Math.max(0, remainingTax),  // 신규
  totalComputedTaxWithSurcharge: totalComputedTax,  // 신규
};
```

### 3.3 §28의 ⑦ (산출세액) 인용 — 이미 `result.computedTax`

`creditLimit` 산식 `⑦ × ⑤_prior / ⑤`의 ⑦은 `result.computedTax`. 인용 가능.

---

## 4. UI 명세 (`components/calc/TaxCreditBreakdownCard.tsx`)

### 4.1 §28 산식 행

```
증여세액공제 §28                                    - 228,000,000
  ⑯ = Min(⑭, ⑮)
  ⑭ 240,000,000 (가산 증여재산 산출세액)
  ⑮ 228,000,000 = ⑦ 380,000,000 × (⑤_prior 600,000,000 ÷ ⑤ 1,000,000,000)
```

→ `priorGiftCreditDetail`가 null이 아닐 때만 노출.
→ 클릭 시 펼침 (기본 접힘) — 카드 높이 부담 최소화.

### 4.2 §69 산식 행 (부록 A 자기일관 데이터)

```
신고세액공제 (3%) §69                               -   4,560,000
  4,560,000 = 152,000,000 × 3%
  기준세액 152,000,000 = ⑦합계(할증포함) 380,000,000
                       − §28 228,000,000
                       − 외국납부 0
                       − 조특 특례 0
```

→ `filingCredit > 0`일 때만 노출.
→ 클릭 시 펼침.
→ 외국납부·조특 특례는 0이어도 표시 (계산식의 완결성). 모두 0이면 "(외국납부·조특 미적용)" 단축 표기.
→ ⑦합계 = `result.computedTax + result.generationSkipSurcharge`. 세대생략 할증 0이면 ⑦합계 = ⑦.

### 4.3 색상 / 레이아웃

| 영역 | 스타일 |
|---|---|
| 산식 컨테이너 | `mt-1.5 ml-3 text-[11px] text-gray-600 dark:text-gray-400 space-y-0.5` |
| 변수 라벨 (⑭⑮⑯⑦⑤_prior⑤) | `inline-flex items-center gap-1 bg-blue-50 dark:bg-blue-900/30 rounded px-1 text-[10px] font-mono text-blue-700` |
| 숫자 | `font-mono` |
| 펼침 토글 | "▶ 산출근거" / "▼ 산출근거" (gray, hover violet) |

### 4.4 접근성

- 펼침 버튼 `aria-expanded` 토글
- 키보드 Tab/Enter 동작
- 모바일에서 가로 스크롤 가능 (긴 산식 줄바꿈)

### 4.5 비교/예외 UI 케이스 분기

> **참고**: 본 표는 UI 분기 케이스(어떻게 표시할지). 실제 엔진 anchor는 §6.1 참조. ID prefix를 anchor와 분리하기 위해 UI- 사용.

| ID | 상황 | UI 표시 |
|---|---|---|
| UI-1 | 사전증여 없음 (priorGiftCreditDetail=null, giftTaxCredit=0) | §28 행·산식 모두 숨김 |
| UI-2 | §58 한도 미달 — Min에서 ⑭ 채택 | ⑯ = ⑭ 직접 표기 + ⑮는 한도 정보용 |
| UI-3 | §58 한도 적중 — Min에서 ⑮ 채택 (부록 A) | ⑯ = ⑮ 직접 표기 + ⑭ 정보용 |
| UI-4 | aggregatedTaxBase = 0 (과세표준 0) | creditLimit = 0 표기 + "과세표준 0 — 산식 무효" rose 안내 |
| UI-5 | 법정기한 외 신고 (isFiledOnTime=false) | §69 행 0원 → CreditRow null 반환 → 펼침 토글 미렌더 |
| UI-6 | §69 기준세액 ≤ 0 (사전증여로 전액 차감) | §69 행 0원 → 미표시 |
| UI-7 | 조특법 특례 (창업·가업) 적용 | 기준세액 산식에 "− 조특 특례 N" 행 + amber "차감 후 3% 적용" 안내 |
| UI-8 | 외국납부 + 조특 특례 동시 적용 | 기준세액 산식에 외국납부·조특 모두 노출 (단기재상속은 항상 0 — 증여세 미적용) |

---

## 5. 구현 명세

### 5.1 신규 파일 — 없음

기존 `TaxCreditBreakdownCard.tsx` 수정만.

### 5.2 수정 파일

| 파일 | 변경 | LOC |
|---|---|---|
| `lib/tax-engine/types/inheritance-gift.types.ts` | `TaxCreditResult`에 `filingCreditBase?`·`totalComputedTaxWithSurcharge?` 추가 | +6 |
| `lib/tax-engine/credits/gift-tax-credits.ts` (또는 동등 파일) | 위 두 필드 echo (계산 변경 0) | +4 |
| `components/calc/TaxCreditBreakdownCard.tsx` | §28·§69 펼침 영역 추가 (~80줄) | +80 |
| `__tests__/tax-engine/inheritance-gift/gift-tax-credit.formula.test.ts` | F-1~F-8 anchor 8건 | +120 |

### 5.3 컴포넌트 구조

```tsx
function CreditRow({ label, amount, lawRef, highlight, formula }: CreditRowProps & { formula?: ReactNode }) {
  const [expanded, setExpanded] = useState(false);
  if (amount === 0) return null;
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between py-2 px-3 rounded-md bg-gray-50">
        <div className="flex items-center gap-2">
          <span>{label}</span>
          {lawRef && <span className="text-xs text-gray-400">{lawRef}</span>}
          {formula && (
            <button
              type="button"
              onClick={() => setExpanded(p => !p)}
              className="text-[10px] text-gray-500 hover:text-violet-700"
              aria-expanded={expanded}
            >
              {expanded ? "▼ 산출근거" : "▶ 산출근거"}
            </button>
          )}
        </div>
        <span className="font-mono text-sm text-blue-600">- {amount.toLocaleString()}</span>
      </div>
      {expanded && formula && (
        <div className="ml-3 px-3 py-2 text-[11px] text-gray-600 bg-gray-50/60 rounded-md space-y-0.5">
          {formula}
        </div>
      )}
    </div>
  );
}
```

### 5.4 §28 산식 빌더 (인라인)

```tsx
function buildSection28Formula(detail: PriorGiftCreditDetail, computedTax: number) {
  const { priorComputedTax, priorAddedTaxBase, aggregatedTaxBase, creditLimit, priorPaidCredit } = detail;
  const limitFormula = aggregatedTaxBase > 0
    ? <>⑮ <Num val={creditLimit}/> = ⑦ <Num val={computedTax}/> × (⑤_prior <Num val={priorAddedTaxBase}/> ÷ ⑤ <Num val={aggregatedTaxBase}/>)</>
    : <>⑮ <Num val={0}/> — 과세표준 0으로 산식 무효</>;
  return (
    <>
      <p>⑯ <Num val={priorPaidCredit}/> = Min(⑭, ⑮)</p>
      <p>⑭ <Num val={priorComputedTax}/> 가장 최근 합산 회차의 ⑦ (가산 증여재산 산출세액)</p>
      <p>{limitFormula}</p>
      <p className="text-[10px] text-gray-400">※ ⑦은 할증 전 산출세액 (`result.computedTax`)</p>
    </>
  );
}
```

### 5.5 §69 산식 빌더

```tsx
function buildSection69Formula(credit: TaxCreditResult) {
  const base = credit.filingCreditBase ?? 0;
  const totalWithSurcharge = credit.totalComputedTaxWithSurcharge ?? 0;
  const foreign = credit.foreignTaxCredit;
  const special = credit.specialTreatmentCredit;
  const allOthersZero = foreign === 0 && special === 0;
  return (
    <>
      <p><Num val={credit.filingCredit}/> = <Num val={base}/> × 3%</p>
      <p>기준세액 <Num val={base}/> = ⑦합계 <Num val={totalWithSurcharge}/> − §28 <Num val={credit.giftTaxCredit}/></p>
      {!allOthersZero && (
        <>
          {foreign > 0 && <p>  − 외국납부 <Num val={foreign}/></p>}
          {special > 0 && <p>  − 조특 특례 <Num val={special}/></p>}
        </>
      )}
      {allOthersZero && (
        <p className="text-[10px] text-gray-400">(외국납부·조특 특례 미적용)</p>
      )}
      <p className="text-[10px] text-gray-400">※ ⑦합계 = 산출세액 + 세대생략 할증</p>
    </>
  );
}
```

---

## 6. 테스트 계획

### 6.1 anchor 케이스 (`__tests__/tax-engine/inheritance-gift/gift-tax-credit.formula.test.ts`)

| ID | 시나리오 | 검증 |
|---|---|---|
> **상세 anchor 명세는 Design §6.1 참조** (자기일관 검증값 포함). 본 표는 시나리오 요약.

| ID | 시나리오 | Expected (요약) |
|---|---|---|
| F-1 | 사전증여 X + 법정기한 내 + 세대생략 X (⑦=100M) | priorGiftCreditDetail=null, filingCredit=**3,000,000** |
| F-2 | 사전증여 O + ⑭ < ⑮ (한도 미달, ⑭ 채택) | ⑯=⑭=§28 |
| F-3 | **부록 A**: ⑦=380M·⑭=240M·⑤_prior=600M·⑤=1,000M | §28=**228M**, filingCreditBase=**152M**, filingCredit=**4,560,000**, totalCredit=**232,560,000** |
| F-4 | aggregatedTaxBase=0 + 사전증여 O | creditLimit=0, §28=0, "산식 무효" 안내 |
| F-5 | 법정기한 외 신고 (다른 조건 F-1 동일) | filingCredit=**0**, filingCreditBase=**100M echo 유지** — UI CreditRow null |
| F-6 | ⑤_prior=⑤=1,000M + ⑦=⑭=300M + 할증 0 → §28 전액 | filingCreditBase=0, filingCredit=0 |
| F-7 | 조특 특례 (startup, 절감=50M, 사전증여 X) | totalComputedTaxWithSurcharge=**일반세액 그대로**(엔진 line 386 `normalComputedTax`), filingCreditBase=⑦합계−외국납부−50M |
| F-8 | 외국납부 30M + 조특 50M + 사전증여 ⑯=100M (⑦합계=400M) | filingCreditBase=**220M**, filingCredit=**6,600,000** |
| F-9 | **부록 A.1**: F-3 + 세대생략 할증 50M | totalComputedTaxWithSurcharge=**430M**, ⑮=228M(불변), filingCreditBase=**202M**, filingCredit=**6,060,000** |
| F-10 | 조특 절감 = ⑦합계 (전액 차감) | remainingTax=0, filingCreditBase=0, filingCredit=0 |

### 6.2 UI 회귀

- 기존 사례 (사전증여 없음·있음)에서 산식 펼침 동작
- 모바일 폭에서 산식 줄바꿈 확인
- 펼침 상태 페이지 다시 마운트 시 초기화 (state 보존 미요구)

---

## 7. 동기화 지점 점검 (8/9 지점)

| # | 지점 | 영향 |
|---|---|---|
| ① 폼 상태 | 변경 없음 | — |
| ② initial | 변경 없음 | — |
| ③ normalize | 변경 없음 | — |
| ④ API 변환 | 변경 없음 | — |
| ⑤ UI 위젯 | TaxCreditBreakdownCard 펼침 영역 추가 | ✓ |
| ⑥ 사이드바 | 변경 없음 | — |
| ⑦ 결과 카드 | 산식 인라인 표시 | ✓ |
| ⑧ Validation | 변경 없음 | — |
| ⑨ Zod | 변경 없음 (결과 echo만 추가) | — |

### 7.1 엔진 영향

- `TaxCreditResult`에 2개 필드(`filingCreditBase`·`totalComputedTaxWithSurcharge`) optional 추가.
- 기존 anchor 회귀 무 (옵셔널 필드).
- 엔진 산식 자체는 변경 없음.

---

## 8. 비기능 요구

- **성능**: 산식 렌더링은 펼침 후만 — 초기 렌더 부담 0.
- **i18n**: 한국어 고정 (현행 정책).
- **접근성**: aria-expanded·키보드 동작.
- **시각**: 변수 라벨(⑭⑮⑯) 배지 + 숫자 colon-aligned 정렬.

---

## 9. 위험·완화

| ID | 위험 | 완화 |
|---|---|---|
| R-1 | echo 필드(`filingCreditBase`/`totalComputedTaxWithSurcharge`) optional이라 legacy IndexedDB 결과 또는 상속세 호출 시 누락 | Design §4.7.3 가드 — 두 필드 모두 존재할 때만 `buildSection69Formula` 호출. undefined 시 펼침 토글 자체 미렌더. 기존 동작 100% 보존 |
| R-2 | 조특법 특례 적용 시 기준세액 의미 다름 | F-7 anchor + UI 안내 추가 |
| R-3 | 상속세에도 동일 패턴 필요 가능성 | 본 PR은 증여세 한정. 상속세 후속 PR |
| R-4 | 모바일에서 산식 너무 길어 가독성 저하 | flex-wrap + 줄바꿈 |
| R-5 | §28의 ⑦(할증 전 `computedTax`)과 §69의 ⑦합계(`computedTax + generationSkipSurcharge`) 혼동 위험 | (a) §28 산식 fine-print "※ ⑦은 할증 전 산출세액" (b) §69 산식 fine-print "※ ⑦합계 = 산출세액 + 세대생략 할증" (c) anchor F-9 신규: 할증 포함 케이스에서 ⑦≠⑦합계 검증 |
| R-6 | 조특법 특례 적용 시 `totalComputedTax`는 일반세액 (특례 절감은 별도 차감). 사용자가 "왜 특례 절감 후 3%가 아닌가?" 혼동 | 펼침에 "조특 특례 절감 분 차감 후 3% 적용" 안내 1줄 추가 (엔진 line 399 검증) |
| R-7 | priorGiftCreditDetail prop 추가가 GiftTaxResultView에 영향 | optional prop, 미전달 시 §28 펼침 미표시 (현행 동작 보존) |
| R-8 | **엔진 line 334 잠재 정밀도 손실** — `Math.floor(computedTax × priorGiftAddedTaxBase / aggregatedTaxBase)`에서 두 큰 정수 곱이 `Number.MAX_SAFE_INTEGER`(9 × 10^15) 초과 가능. 부록 A(380M × 600M = 2.28 × 10^17)도 해당 | 본 PR 범위 외 (엔진 기존 동작). 별도 PR로 `safeMultiply()`(BigInt fallback, `tax-utils.ts`) 적용 권장. 부록 A는 결과 / 1e9 → 228M 정확한 정수라 ok. 향후 큰 금액 케이스 신중 |

---

## 10. 작업 일정

| 단계 | 작업 | 추정 |
|---|---|---|
| Design | UI 시니어 + 엔진 시니어 협의 (산식 표기 컨벤션 확정) | 0.25d |
| Do-1 | TaxCreditResult 타입 + 엔진 echo 2필드 추가 | 0.1d |
| Do-2 | TaxCreditBreakdownCard 펼침 영역 + 산식 빌더 2종 | 0.5d |
| Do-3 | anchor 10건(F-1~F-10) 작성·통과 — 세대생략·조특 특례 케이스 포함 | 0.4d |
| Check | 회귀 + 브라우저 수동 (F-1~F-8) | 0.25d |
| Act | MEMORY 갱신 + 후속 PR 노트 (상속세 동일 패턴) | 0.1d |

**총 추정**: 약 1.5d.

---

## 11. Definition of Done

- [ ] `TaxCreditResult`에 `filingCreditBase?`·`totalComputedTaxWithSurcharge?` 추가
- [ ] 엔진 echo 2줄 추가 (`inheritance-gift-tax-credit.ts` return 직전, 산식 로직 변경 0)
- [ ] TaxCreditBreakdownCard §28·§69 펼침 영역 동작
- [ ] anchor 10건 (F-1~F-10) 100% PASS
- [ ] §28 산식 fine-print "⑦은 할증 전 산출세액" 노출
- [ ] §69 산식 fine-print "⑦합계 = 산출세액 + 세대생략 할증" 노출
- [ ] 변수 라벨(⑭⑮⑯⑦⑤_prior⑤) 배지 정확
- [ ] `priorGiftCreditDetail=null`일 때 §28 산식 미노출
- [ ] `npx tsc --noEmit` 0 errors
- [ ] `npm run lint` 0 errors
- [ ] 전체 vitest 회귀 0 신규
- [ ] 브라우저 수동 (F-1·F-2·F-5)

---

## 12. 후속 PR 분리 항목

1. **상속세** TaxCreditBreakdownCard에 동일 패턴 (§28·§30·§69)
2. **외국납부세액공제 §29/§59** 산식 표시 (해외 자산 한도)
3. **단기재상속공제 §30** 산식 (10년 내 재상속 차등 공제율)
4. **조특법 특례** 산식 (창업자금·가업승계 과세특례 산출세액 산식)

---

## 부록 A — 산식 표기 UI 예시 (자기일관 anchor 데이터)

> **주의**: 사용자 이미지 #12 (§28=228M·§69=6M)는 사용자가 본 PR을 요청한 동기 부여 자료. 부록 A 예시는 **자기일관성 검증용 anchor 데이터**(별도 케이스)이며 이미지 #12와 완전 일치하지 않음.

**입력 조건** (세대생략 할증 0, 외국납부 0, 조특 특례 미적용):
- 산출세액 ⑦ (할증 전) = 380,000,000
- 세대생략 할증 = 0 → ⑦합계 = 380,000,000
- 사전증여 ⑤_prior = 600,000,000, 현재 ⑤ = 1,000,000,000
- 가장 최근 합산 회차의 ⑦ (⑭) = 240,000,000

**엔진 계산 (자기일관 검증)**:
- ⑮ = floor(380M × 600M ÷ 1,000M) = **228,000,000**
- ⑯ = Min(⑭=240M, ⑮=228M) = **228,000,000** = §28
- base = 380M − 228M − 0 − 0 = **152,000,000**
- §69 = floor(152M × 3%) = **4,560,000** (applyRate→Math.floor)
- 세액공제 합계 = 228M + 4.56M = **232,560,000**

```
증여세액공제 §28                                    - 228,000,000
[▼ 산출근거]
  ⑯ 228,000,000 = Min(⑭, ⑮)
  ⑭ 240,000,000  가장 최근 합산 회차의 ⑦
  ⑮ 228,000,000 = ⑦ 380,000,000 × (⑤_prior 600,000,000 ÷ ⑤ 1,000,000,000)
  ※ ⑦은 할증 전 산출세액

신고세액공제 (3%) §69                               -   4,560,000
[▼ 산출근거]
  4,560,000 = 152,000,000 × 3%
  기준세액 152,000,000 = ⑦합계 380,000,000 − §28 228,000,000
                       (외국납부·조특 특례 미적용)
  ※ ⑦합계 = 산출세액 + 세대생략 할증

세액공제 합계                                       - 232,560,000
```

→ Min에서 ⑮ 채택 (⑤_prior/⑤ = 0.6 비율로 ⑮ < ⑭).
→ §69는 `applyRate(base, 0.03)` = `Math.floor(base × 0.03)` 이므로 152M × 0.03 = 4,560,000 (소수 절사 없음, 정수 결과).

### 부록 A.1 — 세대생략 할증 포함 케이스

부록 A 동일 조건 + 세대생략 할증 50,000,000 추가:
- ⑦ (할증 전) = 380,000,000 — §28 산식 분자 (불변)
- ⑦합계 = 380,000,000 + 50,000,000 = **430,000,000** (§69 기준세액 시작점)
- §28의 ⑮ = 228,000,000 (변화 없음 — 할증 전 ⑦ 사용)
- §28의 ⑯ = 228,000,000 (할증 0 케이스와 동일)
- §69 기준세액 = 430,000,000 − 228,000,000 = **202,000,000**
- §69 = floor(202,000,000 × 3%) = **6,060,000**

→ ⑦(할증 전)과 ⑦합계 출처를 산식 옆 fine-print로 명시하여 사용자 혼동 차단.
→ F-9 anchor 검증값: §28 = 228M (불변), §69 = 6,060,000 (할증 영향).
