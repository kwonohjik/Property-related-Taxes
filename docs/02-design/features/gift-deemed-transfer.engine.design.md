# 증여로 보는 경우 — Phase 1 엔진 설계 (ENGINE DESIGN)

> 상위: [`docs/00-pm/gift-deemed-transfer.plan.md`](../../00-pm/gift-deemed-transfer.plan.md)
> 범위: **Phase 1 MVP** — (2)보험금§34 · (3)저가고가§35 · (4)채무면제§36 · (5)부동산무상사용§37 · (6)금전무상대출§41의4 + 공통 인프라
> 산출: 의제별 순수 계산기 → 단일 `deemedGiftValue` → 기존 `calcGiftTax` prefill 이관
> 작성일: 2026-06-18

---

## 0. 설계 원칙

- 각 계산기 = **순수 함수** `(input) → DeemedGiftResult`. DB 호출 없음. 세율·이자율은 `gift-deemed-rates.ts`에서 주입.
- 정수 연산: 모든 금액 원(정수). 세율×금액 직후 `Math.floor()`. 분수율(4.6%)은 `floor(x*46/1000)` (memory `feedback_applyrate_fractional_rate_one_won_error`).
- 임계(1억·1천만·30%·3억)는 **규정·항별 상수** — 일괄치환 금지 (R8).
- 결과는 `applied`(요건 충족) + `deemedGiftValue` + `breakdown`(산식 단계) + `exclusionReason`.
- 법령 상수는 `legal-codes/inheritance-gift.ts` GIFT 객체 경유 (리터럴 0).

---

## 1. 공통 타입 (`lib/tax-engine/gift-deemed/types.ts`)

```ts
import type { CalculationStep } from "../types/inheritance-gift.types";

/** Phase 1 의제 유형 (discriminated union 판별자) */
export type DeemedGiftType =
  | "insurance"        // §34 (2)
  | "bargain_transfer" // §35 (3)
  | "debt_forgiveness" // §36 (4)
  | "free_realestate"  // §37 (5)
  | "free_loan";       // §41의4 (6)
// Phase 2~3에서 merger·capital_increase·… 추가

/** 모든 계산기 공통 결과 */
export interface DeemedGiftResult {
  type: DeemedGiftType;
  applied: boolean;             // 과세요건·임계 충족
  deemedGiftValue: number;      // 증여재산가액(원, 정수)
  breakdown: CalculationStep[]; // 산식 단계 (formula-display-builder)
  exclusionReason?: string;     // 미적용 사유
  legalBasis: string;           // GIFT.* 상수
  thresholdEcho?: Record<string, number | boolean>; // 임계 판정 근거 echo
}

/** 판별 유니온 입력 */
export type DeemedGiftInput =
  | ({ type: "insurance" } & InsuranceInput)
  | ({ type: "bargain_transfer" } & BargainTransferInput)
  | ({ type: "debt_forgiveness" } & DebtForgivenessInput)
  | ({ type: "free_realestate" } & FreeRealEstateInput)
  | ({ type: "free_loan" } & FreeLoanInput);
```

### Router (`router.ts`)
```ts
export function calcDeemedGift(input: DeemedGiftInput): DeemedGiftResult {
  switch (input.type) {
    case "insurance":        return calcInsuranceGift(input);
    case "bargain_transfer": return detectBargainTransfer(input);
    case "debt_forgiveness": return calcDebtForgivenessGift(input);
    case "free_realestate":  return calcFreeRealEstateGift(input);
    case "free_loan":        return calcFreeLoanGift(input);
  }
}
// §43① 중복배제·§43② 합산은 Phase 3 router 후처리(여기선 단일 의제만)
```

---

## 2. 규정별 설계

### (2) 보험금 §34 — `insurance.ts`

**케이스 인벤토리**

| ID | 조건 | 산식 | 비고 |
|---|---|---|---|
| INS-1 | §34①1호 수령인 ≠ 납부자 | `보험금 × (수령인외납부보험료 ÷ 납부보험료총액)` | floor |
| INS-2 | §34①2호 증여재산으로 납부 | `보험금 × (증여재산납부보험료 ÷ 총액) − 증여재산납부보험료` | floor 후 차감, 음수가드 |
| INS-3 | §34② §8 상속재산 해당 | 미적용(`applied=false`) | `isInheritanceInsurance` 게이트 |

**입력 타입**
```ts
export interface InsuranceInput {
  caseType: "non_payer" | "gifted_premium"; // 1호 / 2호
  insuranceProceeds: number;     // 보험금
  totalPremiumPaid: number;      // 납부보험료총액 (>0)
  relevantPremium: number;       // 1호=수령인외납부 / 2호=증여재산납부
  isInheritanceInsurance: boolean; // §34② §8 상속재산 여부 → true면 미적용
}
```

**알고리즘**
```
if isInheritanceInsurance → applied=false, exclusionReason="§34② 상속재산(§8) — 증여세 미적용"
if totalPremiumPaid <= 0 → applied=false, exclusionReason="납부보험료총액 0 — 판정불가"
ratioNumer = relevantPremium; ratioDenom = totalPremiumPaid
base = safeMultiplyThenDivide(insuranceProceeds, ratioNumer, ratioDenom)  // floor((보험금×관련보험료)/총액)
deemedGiftValue =
  caseType === "non_payer"      ? base
  : Math.max(0, base - relevantPremium)   // 2호: 증여재산납부분 차감
```

**anchor**
| ID | 입력 | 기댓값 |
|---|---|---|
| INS-1 | 보험금 100,000,000 · 총 10,000,000 · 수령인외 6,000,000 | `60,000,000` (1억×0.6) |
| INS-2 | 보험금 100,000,000 · 총 10,000,000 · 증여재산납부 6,000,000 | `54,000,000` (6,000만−600만) |
| INS-3 | isInheritanceInsurance=true | `applied=false`, value 0 |

---

### (3) 저가양수·고가양도 §35 — `bargain-transfer.ts` (산식 정정 후 이전)

> 🔴 기존 `lib/tax-engine/bargain-transfer.ts` 산식 버그 정정 후 `gift-deemed/`로 이전.

**케이스 인벤토리**

| ID | 관계 | 거래 | 임계(적용) | 공제 | 비고 |
|---|---|---|---|---|---|
| BARG-1 | 특수 §35① | 저가양수 | 차액 ≥ MIN(시가30%,3억) | MIN(시가30%,3억) | 차액=시가−대가 |
| BARG-2 | 특수 §35① | 고가양도 | 〃 | 〃 | 차액=대가−시가 |
| BARG-3 | 특수 | — | 차액 < 임계 | — | `applied=false` |
| BARG-4 | 비특수 §35② | 저가/고가 | 차액 ≥ 시가30% | **3억 고정** | §26④ |
| BARG-5 | 비특수 | — | 차액 < 시가30% | — | `applied=false` |
| BARG-6 | 비특수 | — | 정당사유 有 | — | `applied=false` (§35②) |
| BARG-7 | — | — | §52② 시가·상장시가거래 | — | 과세제외(§35③·§26①) |

**입력**
```ts
export interface BargainTransferInput {
  marketValue: number;        // 시가(>0)
  transactionPrice: number;   // 대가
  transactionType: "purchase" | "sale";
  isRelatedParty: boolean;
  hasJustifiableReason?: boolean; // 비특수 §35② 정당사유 (true→미적용)
  isExcludedTransaction?: boolean;// §35③ 과세제외(§52² 등)
}
```

**알고리즘 (정정판)**
```
if marketValue<=0 → applied=false
if isExcludedTransaction → applied=false, "§35③ 과세제외"
diff = transactionType==="purchase" ? marketValue - transactionPrice : transactionPrice - marketValue
if diff <= 0 → applied=false

if isRelatedParty:           // §35①
   threshold = Math.min(applyRate(marketValue, 0.30), 300_000_000)  // MIN(시가30%,3억)
   if diff < threshold → applied=false
   deduction = threshold                       // ★정정: 특수도 공제
else:                        // §35②
   if hasJustifiableReason → applied=false, "정당한 사유"
   applyThreshold = applyRate(marketValue, 0.30) // 시가30%
   if diff < applyThreshold → applied=false
   deduction = 300_000_000                      // ★정정: 비특수는 3억 고정

deemedGiftValue = Math.max(0, diff - deduction)
```

**anchor** (기존 [T18a] 등 본칙 정합값으로 재산정)
| ID | 입력 | 기댓값 |
|---|---|---|
| BARG-1 | 특수·저가·시가 1,000,000,000·대가 600,000,000 | diff 4억 ≥ MIN(3억,3억) → `100,000,000` |
| BARG-3 | 특수·시가 1,000,000,000·대가 800,000,000 | diff 2억 < 3억 → `applied=false` |
| BARG-4 | 비특수·저가·시가 1,000,000,000·대가 500,000,000 | diff 5억 ≥ 3억(시가30%) → 5억−3억 = `200,000,000` |
| BARG-2 | 비특수·고가·시가 1,000,000,000·대가 1,400,000,000 | diff 4억 ≥ 3억(시가30%) → 4억−3억 = `100,000,000` |
| BARG-6 | 비특수·정당사유 | `applied=false` |
| BARG-시가7억 | 특수·저가·시가 700,000,000·대가 300,000,000 | diff 4억 ≥ MIN(2.1억,3억)=2.1억 → 4억−2.1억 = `190,000,000` (시가<10억서 MIN=시가30%) |

> ⚠️ 기존 테스트 `__tests__/tax-engine/property-valuation.test.ts` [T18a]`toBe(400_000_000)` → 본칙값 `100,000,000`으로 재산정.

---

### (4) 채무면제 §36 — `debt-forgiveness.ts`

**케이스 인벤토리**

| ID | 조건 | 산식 |
|---|---|---|
| DEBT-1 | 면제·인수·변제, 보상 없음 | `면제채무액` |
| DEBT-2 | 보상(지급액) 있음 | `면제채무액 − 보상액` (음수가드) |

**입력**
```ts
export interface DebtForgivenessInput {
  forgivenDebt: number;   // 면제·인수·변제 채무액
  compensation: number;   // 보상(지급)액 (없으면 0)
  occurType: "creditor_waiver" | "third_party_assumption"; // 증여시기 라벨용
}
```
**알고리즘**: `deemedGiftValue = Math.max(0, forgivenDebt - compensation)`; `applied = deemedGiftValue > 0`.
> 증여시기: creditor_waiver=면제 의사표시일 / third_party_assumption=인수계약 체결일 (UI 라벨, 계산 무영향). §36 별도 금액 임계 없음(Do 단계 본칙 재확인).

**anchor**
| ID | 입력 | 기댓값 |
|---|---|---|
| DEBT-1 | 면제 100,000,000 · 보상 0 | `100,000,000` |
| DEBT-2 | 면제 100,000,000 · 보상 30,000,000 | `70,000,000` |

---

### (5) 부동산무상사용 §37 — `free-realestate-use.ts`

**케이스 인벤토리**

| ID | 유형 | 임계 | 산식 |
|---|---|---|---|
| FRE-1 | 무상사용(§37①) | 무상사용이익 ≥ 1억 | `Σ(n=1..5) floor(연이익 × 10^n / 11^n)`, 연이익=`floor(부동산가액×2/100)` |
| FRE-2 | 무상사용 임계미달 | < 1억 | `applied=false` |
| FRE-3 | 무상담보(§37②) | 차입이익 ≥ 1천만 | `차입금 × 적정이자율(4.6%) − 실제지급이자` |
| FRE-4 | 무상담보 임계미달 | < 1천만 | `applied=false` |

**입력**
```ts
export interface FreeRealEstateInput {
  subType: "free_use" | "collateral";
  propertyValue?: number;   // free_use: 부동산가액
  loanAmount?: number;      // collateral: 차입금
  actualInterestPaid?: number; // collateral 실제지급이자
  isRelatedParty: boolean;
  hasJustifiableReason?: boolean; // §37③
}
```

**알고리즘 (free_use, 정수 정밀)**
```
annualBenefit = applyRateFraction(propertyValue, 2, 100)   // floor(부동산가액×2/100) — 부동소수 0.02 회피
pvSum = 0
for n in 1..5:
   pvSum += safeMultiplyThenDivide(annualBenefit, 10**n, 11**n)  // floor(연이익×10^n/11^n)
if pvSum < 100_000_000 → applied=false, "무상사용이익 1억 미만"
deemedGiftValue = pvSum
```
> 5년 초과: 5년 되는 날 다음날 새 무상사용 개시(UI 안내, 단일 계산은 5년). 현가율 10%·환산율 2%는 시행규칙 출처 — Do 단계 KoreanLaw 검증.

**알고리즘 (collateral)**: `benefit = applyRateFraction(loanAmount, 46, 1000) - actualInterestPaid`; `if benefit < 10_000_000 → 미적용`; else `deemedGiftValue = max(0, benefit)`. (적정이자율 = §41의4 동일 소스 — 분수 정수연산)

**anchor**
| ID | 입력 | 기댓값 |
|---|---|---|
| FRE-1 | free_use · 부동산가액 2,000,000,000 | 연이익 4천만 → Σ ≈ `151,631,4xx` (≥1억 적용, 정밀값 Do 확정) |
| FRE-2 | free_use · 부동산가액 1,300,000,000 | 연이익 2,600만 → Σ ≈ 98,560,4xx < 1억 → `applied=false` |
| FRE-3 | collateral · 차입 500,000,000 · 이자 0 | 5억×4.6% = `23,000,000` |
| FRE-4 | collateral · 차입 100,000,000 · 이자 0 | 1억×4.6%=460만 < 1천만 → `applied=false` |

> 현가합 정밀값은 Pre-Do anchor에서 정수 산식(`floor(연이익×10^n/11^n)` 누적) 손계산으로 확정. 소수 계수합(3.790786769) 곱과 1원 차이 가능 → 정수 경로 단일화.

---

### (6) 금전무상대출 §41의4 — `free-loan.ts`

**케이스 인벤토리**

| ID | 유형 | 임계 | 산식 |
|---|---|---|---|
| LOAN-1 | 무상대출 | 이익 ≥ 1천만 | `대출금액 × 적정이자율(4.6%)` |
| LOAN-2 | 저리대출 | 이익 ≥ 1천만 | `대출금액 × 적정이자율 − 실제지급이자` |
| LOAN-3 | 임계미달 | < 1천만 | `applied=false` |
| LOAN-4 | 비특수·정당사유 | §41의4③ | `applied=false` |

**입력**
```ts
export interface FreeLoanInput {
  loanAmount: number;
  actualInterestPaid: number;   // 무상이면 0
  appropriateRate: { numer: number; denom: number }; // 적정이자율 분수 (4.6% = {46,1000}) — 부동소수 회피
  isRelatedParty: boolean;
  hasJustifiableReason?: boolean; // §41의4③
}
```
**알고리즘**
```
if !isRelatedParty && hasJustifiableReason → applied=false
benefit = applyRateFraction(loanAmount, appropriateRate.numer, appropriateRate.denom) - actualInterestPaid
   // applyRateFraction(amount, numer, denom) = safeMultiplyThenDivide(amount, numer, denom) = floor(amount×numer/denom)
   // 4.6% → floor(loanAmount × 46 / 1000) (분수 정수연산, 0.046 곱 1원 부족 회피)
if benefit < 10_000_000 → applied=false, "이익 1천만 미만"
deemedGiftValue = Math.max(0, benefit)
```
> 대출기간 1년 이상: 1년 되는 날 다음날 매년 새로(§41의4②) — UI 안내. 기간 미정=1년.

**anchor**
| ID | 입력 | 기댓값 |
|---|---|---|
| LOAN-1 | 대출 300,000,000 · 무이자 | floor(3억×46/1000) = `13,800,000` |
| LOAN-2 | 대출 500,000,000 · 이자 5,000,000 | 2,300만−500만 = `18,000,000` |
| LOAN-3 | 대출 200,000,000 · 무이자 | 920만 < 1천만 → `applied=false` |

---

## 3. 공통 인프라

### 3.1 법령 상수 (`legal-codes/inheritance-gift.ts` GIFT 확장)
Phase 1: `GIFT.INSURANCE("상증법 §34")`, `GIFT.DEBT_FORGIVENESS("상증법 §36")`, `GIFT.FREE_REALESTATE("상증법 §37")`, `GIFT.FREE_LOAN("상증법 §41의4")`. §35는 `GIFT.BARGAIN_TRANSFER`(기존) 재사용.
> 800줄 여유 실측 후 추가, 초과 시 GIFT_DEEMED 별도 객체 분리.

### 3.2 역사 고시 (`data/gift-deemed-rates.ts`)
```ts
// 적정이자율 §41의4① (= §37② 무상담보 동일 소스 상증령 §31의4①) — 분수로 보관(부동소수 0)
// 동일율 연속 구간은 시작 고시일로 압축(from 이상 룩업이라 결과 동일). PDF (6) 표: 2001·2002·2009 모두 9% → 2001-12-31 1행.
export const FREE_LOAN_RATE_HISTORY = [
  { from: "1999-06-30", rate: { numer: 110, denom: 1000 } }, // 11%
  { from: "2001-12-31", rate: { numer: 90,  denom: 1000 } }, // 9% (~2010-11-04) ← Do 단계 기재부고시 교차검증
  { from: "2010-11-05", rate: { numer: 85,  denom: 1000 } }, // 8.5%
  { from: "2016-03-07", rate: { numer: 46,  denom: 1000 } }, // 4.6% 현행
] as const;
// 부동산무상사용 §37①: 환산율 2/100 · 할인율 10% · 5년 (시행규칙 출처 — Do 검증)
export const FREE_USE_ANNUAL_RATE = { numer: 2, denom: 100 };  // floor(부동산가액×2/100)
export const FREE_USE_DISCOUNT = { base: 11, unit: 10 };       // 1/1.1^n = 10^n/11^n (정수경로)
export const FREE_USE_YEARS = 5;

```
> **헬퍼 위치**: `applyRateFraction(amount, numer, denom) = safeMultiplyThenDivide(amount, numer, denom)`는 데이터 파일이 아니라 **`tax-utils.ts`에 추가**(기존 `safeMultiplyThenDivide:104` 옆, 범용 분수 정수연산). 모든 율은 `{numer, denom}` 분수로 보관 → 이 헬퍼로 정수 연산. 부동소수(`0.046`·`0.02`) 직접 곱 금지.

### 3.3 세액 연결 어댑터 (`lib/calc/gift-deemed-api.ts`)
```ts
export function toGiftWizardPrefill(r: DeemedGiftResult, label: string): Partial<FormState> {
  return { giftItems: [{ id: genId(), name: `${label} 증여이익`, category: "other", marketValue: r.deemedGiftValue }] };
}
```
- `category:'other'` → `evaluateEstateItem` default 통과(`property-valuation.ts:411`). 신규 enum 0.
- donor·priorGifts·공제는 마법사 입력. IndexedDB `sourceCalculationId` 연동(R12).

---

## 4. 동기화 지점 (엔진·API 측)

| 지점 | Phase 1 내용 |
|---|---|
| ⑨⑩ Zod enum | `deemedGiftTypeSchema = z.enum(["insurance","bargain_transfer","debt_forgiveness","free_realestate","free_loan"])` |
| ⑫ Zod 입력객체 | `deemedGiftInputSchema = z.discriminatedUnion("type", [insuranceSchema, bargainSchema, ...])` + superRefine(유형별 required) |
| ⑬ fetch body | `{ deemed: DeemedGiftInput }` POST `/api/calc/gift-deemed` |
| ⑭ Route 매핑 | 문자열 날짜 그대로(증여세 패턴, date-coerce N/A). `calcDeemedGift(parsed.data.deemed)` |
| ⑧ validation | Zod superRefine 중심(gift-validate.ts 부재). 임계·필수필드 검증 |

> ⑪ 자산-수준 fallback N/A (단일 의제 입력).

---

## 5. anchor 테스트 목록 (`__tests__/tax-engine/gift-deemed/`)

| 파일 | 케이스 |
|---|---|
| `insurance-anchor.test.ts` | INS-1·INS-2·INS-3 |
| `bargain-transfer-anchor.test.ts` | BARG-1·2·3·4·6 + 시가7억 + 기존 [T18a] 재산정 |
| `debt-forgiveness-anchor.test.ts` | DEBT-1·2 |
| `free-realestate-anchor.test.ts` | FRE-1·2·3·4 (현가 정수경로) |
| `free-loan-anchor.test.ts` | LOAN-1·2·3 |
| `router-anchor.test.ts` | dispatch 5종 + 미적용 echo |

**Pre-Do anchor (Do 진입 전 우선 실행)**: BARG-1(§35 버그 정정 실증) + FRE-1(현가 정수경로 정밀) — 실패 확보 후 산식 환류.

---

## 6. 미결정 (Do 단계 KoreanLaw 검증)
- §37 환산율 2%·할인율 10% 시행규칙 조문번호
- §41의4 이자율 역사값(2001~2010 구간) 기재부고시 정확성
- §36 채무면제 금액 임계 유무
- §35 비특수 "현저히" 정의(시가30%와의 관계)
- 현가합 정수 경로(`floor(연이익×10^n/11^n)` 누적) vs 법정 산식 정밀도 1원 검증
