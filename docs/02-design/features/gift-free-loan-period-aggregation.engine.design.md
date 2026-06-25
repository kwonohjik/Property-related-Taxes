# §41의4 금전무상대출 — 다년 기간 안분 + §43② 합산 엔진 설계 (ENGINE DESIGN)

> 상위: [`docs/00-pm/gift-free-loan-period-aggregation.plan.md`](../../00-pm/gift-free-loan-period-aggregation.plan.md)
> 범위: **§41의4② 다년 window 루프 + §43² 1년 이내 동일거래 합산**
> 재현 목표: 이미지31 사례1·사례2 원단위 고정 anchor
> 작성일: 2026-06-25

---

## 0. 컨텍스트 — 현황과 갭

### 현행 구현 (회귀 보존 대상)
- `lib/tax-engine/gift-deemed/free-loan.ts` (47줄): `calcFreeLoanGift(FreeLoanInput) → DeemedGiftResult`
  - 단건 1년분만 계산. `benefit = applyRateFraction(loanAmount, numer, denom) − actualInterestPaid`.
  - 1천만 임계 판정 후 `applied`/`exclusionReason` 반환.
  - **Critical 갭**: 임계 미달 시 `deemedGiftValue=0`으로 반환 → raw benefit이 합산 레이어에 도달하지 않음.

- `lib/tax-engine/gift-deemed/types.ts` line 194-201: `FreeLoanInput` — 기간 필드 없음 (`loanStartDate`·`loanEndDate` 미존재).

- `lib/tax-engine/gift-deemed/router.ts` line 68: `§43② 합산은 Phase 3 router 후처리(여기선 단일 의제만)` 주석만 존재, 합산 dispatch 없음.

- `lib/tax-engine/legal-codes/inheritance-gift.ts` line 170: `DUP_EXCLUSION_ANNUAL: "상증법 §43② · 상증령 §32의4 6호"` — 상수 이미 선언됨, 엔진 미사용.

---

## 1. 법령 근거 (KoreanLaw 실측 확정)

| 항목 | 위임 체인 | 값·문언 |
|---|---|---|
| 산식(무상) | 상증법 §41의4①1호 | `대출금액 × 적정이자율` |
| 산식(저리) | 상증법 §41의4①2호 | `대출금액 × 적정이자율 − 실제지급이자` |
| 적정이자율 4.6% | §41의4④ → 상증령 §31의4① → 상증칙 §10의5 → **법인세법시행규칙 §43²**("1,000분의 46") | 4.6% (2016.3.7~) |
| 기준금액 1천만 | §41의4① 단서 → 상증령 §31의4② | 10,000,000 |
| 다년 재대출 의제 | **상증법 §41의4②** | "1년 되는 날의 다음 날에 매년 새로 대출받은 것으로 본다" |
| 일수 안분(364/365) | ⚠️ **명문 없음** — §41의4② 의제 + 마지막 해 실제 일수에서 법리 도출 | 분모 365 고정(교재 기준). 윤년 366 명문 부재 — 주석 명시 필수. |
| 합산 근거 | 상증법 §43② 본문 | "이익의 합계액을 기준으로 §31①2호 각 목에 해당하는지를 계산한다" |
| 합산 조문 그룹 | **상증령 §32의4** "이익별로 합산하여 금액기준 계산" | §41의4 이익은 §41의4끼리만 합산. 1년 소급. |
| 합산 대상 12조문 | 상증법 §43② 본문 (KoreanLaw 실측) | §31①2호·§35·§37~§39·§39의2·§39의3·§40·§41의2·**§41의4**·§42·§45의5 |

> **인용 정책**: 코드 주석에 위임 체인 4단 전부 기재 (§41의4④→§31의4①→§10의5→법인세법시행규칙§43²). 일수 안분 주석: "§41의4② 의제 도출 — 일수/365 명문 조항 없음. 분모 365 고정(교재)."

---

## 2. 케이스 인벤토리

### A. 단건 (기존 회귀 보존)

| ID | 시나리오 | 입력 | 기대값 | 상태 |
|---|---|---|---|---|
| LOAN-1 | 무상 3억 (1천만 이상, 적용) | `loanAmount=3억, actualInterestPaid=0, rate={46,1000}` | `applied=true, deemedGiftValue=13_800_000` | ☐ 회귀 |
| LOAN-2 | 저리 5억·이자 500만 (적용) | `loanAmount=5억, actualInterestPaid=5_000_000, rate={46,1000}` | `applied=true, deemedGiftValue=18_000_000` | ☐ 회귀 |
| LOAN-3 | 무상 2억 (미달) | `loanAmount=2억, actualInterestPaid=0, rate={46,1000}` | `applied=false, rawBenefit=9_200_000 (1천만 미만)` | ☐ 회귀 |
| LOAN-4 | 비특수+정당사유 §41의4③ | `isRelatedParty=false, hasJustifiableReason=true` | `applied=false, exclusionReason=정당사유` | ☐ 회귀 |

### B. 다년 분할 §41의4② (신규)

| ID | 시나리오 | 입력 | 기대값 | 상태 |
|---|---|---|---|---|
| **PERIOD-1** | 사례1: 10억·2022.1.2~2023.12.31·연3% | `loanAmount=10억, actualInterestPaid=0, loanStartDate="2022-01-02", loanEndDate="2023-12-31", appropriateRate={46,1000}, contractRate={30,1000}` | 1년차: `giftDate="2022-01-02", benefit=16_000_000`; 2년차: `giftDate="2023-01-02", benefit=15_956_164` — **별개 증여(합산 금지)**, `deemedGiftValue=16_000_000`(첫 window) | ☐ TODO |
| PERIOD-2 | 정확히 2년(마지막 해도 365일) | `loanStartDate="2022-01-02", loanEndDate="2024-01-01"` → 마지막 window: 2023.1.2~2024.1.1 = 365일 | 1년차=16,000,000, 2년차=16,000,000 (일수안분 없음) | ☐ TODO |
| PERIOD-3 | 기간 미정 (필드 없음) | `loanStartDate=undefined, loanEndDate=undefined` | 단건과 동일 경로 → 회귀 LOAN-1~4와 동일 | ☐ 회귀 |

### C. §43² 합산 (신규)

| ID | 시나리오 | 입력 | 기대값 | 상태 |
|---|---|---|---|---|
| **AGG-1** | 사례2: ㉮3억3%·㉯1억무상·㉰5억2.6% (1년 이내) | `loans=[{㉮ loanDate="2022-05-04",...}, {㉯ loanDate="2022-09-20",...}, {㉰ loanDate="2023-04-25",...}]` | `totalBenefit=19_400_000`, `giftDate="2023-04-25"` (합산 1천만 도달일), 건별 echo: ㉮=4_800_000·㉯=4_600_000·㉰=10_000_000 | ☐ TODO |
| AGG-2 | 1년 초과 분리 (㉮ 1년 밖, ㉯ 1년 내) | ㉮·㉰가 1년 이상 간격 | ㉮는 합산에서 제외, ㉰와 1년 내 건만 합산 | ☐ TODO |
| AGG-3 | 단건만 (합산=단건) | `loans=[{ 단건 }]` | 단건과 동일 결과 (회귀) | ☐ 회귀 |

---

## 3. 입력 타입 확정

### 3.1 결정: 2-트랙 병렬 dispatch

계획서 §4.2의 두 선례(§37 `periods` 패턴 vs `capital_increase_allocation` 별도 DeemedGiftType)를 비교한 결과, 아래와 같이 결정한다.

**사례1 (다년)**: 기존 `FreeLoanInput`에 기간 필드 추가 (§37 `FreeRealEstateInput.periods` 패턴 차용).
- 이유: 단일 대출건에 대한 다년 window 루프이므로 `FreeLoanInput` 확장이 자연스럽고, `periods` 배열 추가는 기존 타입 변경 없이 optional 확장 가능.

**사례2 (합산)**: 신규 `DeemedGiftType` `"free_loan_aggregated"` + `FreeLoanAggregatedInput` 추가 (§39 `capital_increase_allocation` 패턴 차용).
- 이유: 복수의 독립적 대출 건을 하나의 입력으로 묶어 §43² 합산을 수행하는 것은 기존 `FreeLoanInput`과 의미론적으로 다름. 별도 dispatch가 API·Zod·Router를 명확히 분리하여 ⑫⑬⑭ 동기화를 강제함.

### 3.2 `FreeLoanInput` 확장 (다년 — types.ts line 194-201)

```typescript
/** (6) 금전무상대출 §41의4 — 단건 + 다년 분할(§41의4②) */
export interface FreeLoanInput {
  loanAmount: number;
  actualInterestPaid: number;           // 무상이면 0
  appropriateRate: { numer: number; denom: number }; // 적정이자율 분수 (4.6%={46,1000})
  isRelatedParty: boolean;
  hasJustifiableReason?: boolean;       // §41의4③ 정당사유

  /**
   * §41의4② 다년 분할 — 대출 기간.
   * 두 필드 모두 있을 때만 다년 경로 활성화. 한쪽이라도 undefined → 단건(회귀 0).
   * 형식: YYYY-MM-DD 문자열 (API JSON 직렬화 안전, date-coerce 불필요).
   */
  loanStartDate?: string;               // 대출 개시일 (첫 window의 증여일)
  loanEndDate?: string;                 // 대출 종료일 (마지막 window의 마지막 날)

  /**
   * 저리 대출 계약이자율 (다년 계산 시 연이익 = 적정이자율 − 계약이자율).
   * 단건 기존 코드는 `actualInterestPaid`(금액)만 사용하므로 이 필드는 다년 전용.
   * 다년 + contractRate 있을 때: 연이익 = applyRateFraction(loanAmount, appropriateRate) − applyRateFraction(loanAmount, contractRate)
   * 다년 + contractRate 없을 때: 연이익 = applyRateFraction(loanAmount, appropriateRate) (무상 가정)
   * 단건: contractRate 무시, actualInterestPaid(금액) 그대로 사용 (회귀 보존)
   */
  contractRate?: { numer: number; denom: number }; // 계약이자율 분수 (3%={30,1000})
}
```

### 3.3 신규 `FreeLoanAggregatedInput` (합산 — types.ts에 추가)

```typescript
/**
 * §43² 1년 이내 동일거래(§41의4) 합산 입력.
 * 복수 대출 건을 하나의 입력으로 묶어 합산 후 1천만 판정.
 * 선례: capital_increase_allocation (§39 다수증자·다증여자 배분)
 */
export interface FreeLoanAggregatedInput {
  /**
   * 개별 대출 건 배열 (1건 이상). 각 건은 FreeLoanItem으로 정의.
   * 1년 이내 여부 판정은 엔진에서 수행 (loanDate 기준).
   */
  loans: FreeLoanItem[];
}

export interface FreeLoanItem {
  /** 대출 거래일 (= 해당 건의 증여일). YYYY-MM-DD 문자열. */
  loanDate: string;
  loanAmount: number;
  actualInterestPaid: number;           // 무상이면 0
  appropriateRate: { numer: number; denom: number };
  isRelatedParty: boolean;
  hasJustifiableReason?: boolean;
  /** 표시용 레이블 (㉮·㉯·㉰ 등). 없으면 "건 N"으로 fallback. */
  label?: string;
}
```

### 3.4 `DeemedGiftType` union 확장 (types.ts line 8-30)

```typescript
export type DeemedGiftType =
  // ...기존 유형들...
  | "free_loan"            // §41의4 단건·다년 (FreeLoanInput)
  | "free_loan_aggregated" // §41의4 §43² 합산 (FreeLoanAggregatedInput) ← 신규
  // ...
```

### 3.5 `DeemedGiftInput` union 확장 (types.ts line 641-661)

```typescript
export type DeemedGiftInput =
  // ...기존...
  | ({ type: "free_loan" } & FreeLoanInput)
  | ({ type: "free_loan_aggregated" } & FreeLoanAggregatedInput) // ← 신규
  // ...
```

---

## 4. 결과 타입 (DeemedGiftResult 재사용 + 확장)

기존 `DeemedGiftResult` (types.ts line 32-113)의 `periodBreakdown` 필드를 §41의4② 다년에도 재사용한다.
§43² 합산 결과는 신규 `aggregationBreakdown` 필드로 추가한다.

### 4.1 periodBreakdown 재사용 (line 81-87)

§37 `_calcMultiPeriod`가 이미 정의·사용 중:
```typescript
periodBreakdown?: {
  index: number;
  giftDate: string;   // window 시작일 (증여일)
  baseValue: number;  // free_loan: loanAmount
  benefit: number;    // window별 증여이익 (일수안분 적용 후)
  applied: boolean;   // 1천만 기준 충족
}[];
```
§41의4② 다년도 동일 구조 사용. `baseValue = loanAmount`, `benefit = 일수안분 적용 연이익`.

### 4.2 신규 aggregationBreakdown 필드 (DeemedGiftResult에 추가)

```typescript
/**
 * §43² 1년 이내 동일거래 합산 결과 echo.
 * Map 금지 — plain 배열 (feedback_engine_result_map_json_loss).
 */
aggregationBreakdown?: {
  /** 표시 레이블 (㉮·㉯·㉰ 또는 "건 N") */
  label: string;
  /** 대출 거래일 (증여일 echo) */
  loanDate: string;
  loanAmount: number;
  /** 건별 raw benefit (적정이자 − 실제이자, 임계판정 전 원금액) */
  rawBenefit: number;
  /** 건별 §41의4③ 정당사유 게이트 통과 여부 */
  eligible: boolean;
  /** §43² 합산 누적값 (이 건까지의 누계 rawBenefit 합) */
  cumulativeBenefit: number;
}[];
```

---

## 5. 알고리즘 상세

### 5.1 다년 분할 (§41의4②) — `_calcFreeLoanMultiPeriod`

`free-loan.ts`에 내부 함수로 추가. `free-realestate-use.ts`의 `_calcMultiPeriod` (line 126-150) 구조를 차용하되, §41의4 고유의 **일수 안분** 로직을 추가한다.

```
알고리즘:
1. loanStartDate → firstWindowStart = loanStartDate
2. 전체 대출 기간 계산: differenceInDays(loanEndDate, loanStartDate) + 1 일
3. window 루프 (index = 0, 1, 2, ...):
   a. windowStart = firstWindowStart + index년 (date-fns addYears)
   b. windowEnd_ideal = windowStart + 1년 - 1일 (=365일)
   c. if loanEndDate <= windowEnd_ideal:
        // 마지막 window — 일수 안분
        actualDays = differenceInDays(loanEndDate, windowStart) + 1
        연이익 = calcAnnualBenefit(loanAmount, appropriateRate, contractRate)
        benefit = safeMultiplyThenDivide(연이익, actualDays, 365)
            // ⚠️ 분모 365 고정 (윤년 366 명문 없음 — §41의4② 의제 도출. 주석 명시)
        break
      else:
        // 중간 window — 1년 full
        benefit = calcAnnualBenefit(loanAmount, appropriateRate, contractRate)
   d. applied = benefit >= FREE_LOAN_THRESHOLD (10_000_000)
   e. periodBreakdown에 { index, giftDate: windowStart, baseValue: loanAmount, benefit, applied } push

4. deemedGiftValue = 첫 window applied이면 첫 benefit, 아니면 0
   // §37 패턴 동일: "현재 증여"는 첫 window. 후속 window는 미래 별건.
   // ⚠️ 합산 금지 — 누진세율 과대 방지 (free-realestate-use.ts line 131 주석 참조)
```

**`calcAnnualBenefit` 헬퍼** (내부, 순수 정수 연산):
```typescript
function calcAnnualBenefit(
  loanAmount: number,
  appropriateRate: { numer: number; denom: number },
  contractRate?: { numer: number; denom: number },
): number {
  // floor(loanAmount × appropriateRate.numer / appropriateRate.denom)
  const appropriateInterest = applyRateFraction(loanAmount, appropriateRate.numer, appropriateRate.denom);
  if (!contractRate) return appropriateInterest;
  // 저리: floor(loanAmount × contractRate.numer / contractRate.denom)
  const contractInterest = applyRateFraction(loanAmount, contractRate.numer, contractRate.denom);
  return Math.max(0, appropriateInterest - contractInterest);
}
```

**정수연산 검산 (PERIOD-1)**:
```
loanAmount = 1_000_000_000
appropriateRate = {46, 1000}  →  applyRateFraction(10억, 46, 1000) = floor(10억 × 46 / 1000) = 46_000_000
contractRate = {30, 1000}    →  applyRateFraction(10억, 30, 1000) = floor(10억 × 30 / 1000) = 30_000_000
연이익 = 46_000_000 - 30_000_000 = 16_000_000

1년차 (2022.1.2~2023.1.1 = 365일, full): benefit = 16_000_000 ✓
2년차 (2023.1.2~2023.12.31): actualDays = differenceInDays("2023-12-31", "2023-01-02") + 1 = 363 + 1 = 364
  benefit = safeMultiplyThenDivide(16_000_000, 364, 365)
         = Math.floor(16_000_000 × 364 / 365)
         = Math.floor(5_824_000_000 / 365)
         = Math.floor(15_956_164.38...)
         = 15_956_164 ✓
```

### 5.2 §43² 합산 — `calcFreeLoanAggregatedGift` (신규 파일: `free-loan-aggregated.ts`)

```
알고리즘:
1. 대상 기준일 결정: loans 배열 중 가장 마지막 loanDate (= 최종 거래일)
2. 1년 소급 윈도: [loanDate_max - 1년, loanDate_max] 이내의 건만 합산 대상
   // 상증법 §43② "1년 이내 동일거래"
3. 각 eligible 건에 대해 rawBenefit 산출:
   a. !isRelatedParty && hasJustifiableReason → eligible=false, rawBenefit=0
   b. else → rawBenefit = applyRateFraction(loanAmount, appropriateRate) - actualInterestPaid
              rawBenefit = Math.max(0, rawBenefit)
   // ⚠️ 임계 판정(1천만) 하지 않음 — 이 시점에서 raw benefit만 산출
   // ← Critical 정정: 현행 free-loan.ts는 임계 미달 시 deemedGiftValue=0 반환 → raw benefit 차단
   //    합산 레이어는 임계 판정 전 raw benefit을 수집해야 함 (AGG-1의 ㉮·㉯ 누락 방지)
4. eligible 건의 rawBenefit 합산:
   totalRawBenefit = Σ rawBenefit (1년 이내 eligible 건)
5. 임계 판정:
   if totalRawBenefit < FREE_LOAN_THRESHOLD (10_000_000):
     applied=false, deemedGiftValue=0
   else:
     applied=true, deemedGiftValue=totalRawBenefit
6. 증여시기 결정 (applied=true 시):
   giftDate = 누적 rawBenefit이 처음으로 1천만 이상이 되는 건의 loanDate
   // AGG-1: ㉮4_800_000 + ㉯4_600_000 = 9_400_000 (미달) → ㉰ 추가 시 19_400_000 (초과) → giftDate = ㉰ 2023.4.25.
7. aggregationBreakdown 구성 (건별 echo, 1년 이내 eligible+ineligible 전부)
```

**정수연산 검산 (AGG-1)**:
```
㉮ loanDate=2022-05-04, loanAmount=3억, actualInterestPaid=floor(3억×30/1000)=9_000_000
   rawBenefit = applyRateFraction(3억,46,1000) - 9_000_000
              = floor(3억×46/1000) - 9_000_000
              = 13_800_000 - 9_000_000
              = 4_800_000 ✓

㉯ loanDate=2022-09-20, loanAmount=1억, actualInterestPaid=0
   rawBenefit = applyRateFraction(1억,46,1000) = floor(1억×46/1000) = 4_600_000 ✓

㉰ loanDate=2023-04-25, loanAmount=5억, actualInterestPaid=floor(5억×26/1000)=13_000_000
   rawBenefit = applyRateFraction(5억,46,1000) - 13_000_000
              = floor(5억×46/1000) - 13_000_000
              = 23_000_000 - 13_000_000
              = 10_000_000 ✓

1년 이내 판정:
  기준일 = 2023-04-25 (loanDate_max)
  1년 소급 = 2022-04-25 ~
  ㉮ 2022-05-04: >= 2022-04-25 → ✓ 포함
  ㉯ 2022-09-20: >= 2022-04-25 → ✓ 포함
  ㉰ 2023-04-25: 기준일 자신 → ✓ 포함

누적:
  ㉮ 누계: 4_800_000 (1천만 미달)
  ㉯ 추가: 4_800_000 + 4_600_000 = 9_400_000 (1천만 미달)
  ㉰ 추가: 9_400_000 + 10_000_000 = 19_400_000 (1천만 이상) → giftDate = 2023-04-25 ✓
totalRawBenefit = 19_400_000 ✓, deemedGiftValue = 19_400_000 ✓
```

---

## 6. 파일 구조 변경 계획

### 6.1 기존 파일 수정

**`lib/tax-engine/gift-deemed/types.ts`**:
- line 194-201: `FreeLoanInput`에 `loanStartDate?`, `loanEndDate?`, `contractRate?` 추가
- 신규 타입 `FreeLoanAggregatedInput`, `FreeLoanItem` 추가 (line 201 이후)
- `DeemedGiftType` union에 `"free_loan_aggregated"` 추가 (line 9-30)
- `DeemedGiftInput` union에 `{ type: "free_loan_aggregated" } & FreeLoanAggregatedInput` 추가 (line 641-661)
- `DeemedGiftResult`에 `aggregationBreakdown?` 필드 추가 (line 113 이전)

**`lib/tax-engine/gift-deemed/free-loan.ts`** (현행 47줄):
- 다년 분할 분기 추가 (`loanStartDate && loanEndDate` 게이트)
- 내부 함수 `_calcFreeLoanMultiPeriod`, `calcAnnualBenefit` 추가
- 예상 증가: 약 +80줄 → 최대 127줄 (800줄 이하 안전)

**`lib/tax-engine/gift-deemed/router.ts`**:
- `case "free_loan_aggregated": return calcFreeLoanAggregatedGift(input);` 추가
- `calcFreeLoanAggregatedGift` import 추가

**`lib/tax-engine/legal-codes/inheritance-gift.ts`** line 169-170:
- 기존 `DUP_EXCLUSION_ANNUAL` 상수를 `FREE_LOAN_ANNUAL_AGG: "상증법 §43② · 상증령 §32의4 6호"` 추가 사용 (기존 상수 유지, 별칭 추가 필요 시)
- 신규 상수 `FREE_LOAN_PERIOD: "상증법 §41의4②"` 추가

### 6.2 신규 파일

**`lib/tax-engine/gift-deemed/free-loan-aggregated.ts`** (신규):
```
export function calcFreeLoanAggregatedGift(input: FreeLoanAggregatedInput): DeemedGiftResult
```
- §43² 합산 로직 전담
- `aggregateSameTransaction` 내부 헬퍼 포함
- 예상 규모: 약 100줄

---

## 7. 14 동기화 지점 (신규 필드 기준)

신규 필드: `loanStartDate`, `loanEndDate`, `contractRate`(다년) + `loans[]`(합산) + 결과 `periodBreakdown`, `aggregationBreakdown`.

| 지점 | 내용 | 담당 |
|---|---|---|
| ① 폼 상태 | `FreeLoanFields` 폼에 기간 DateInput 2개 + `contractRate` CurrencyInput 추가. 합산 모드: `FreeLoanAggregatedFields` 테이블 추가 | UI 시니어 |
| ② initial | `useDeemedGiftWizardStore` initial에 `loanStartDate: ""`, `loanEndDate: ""`, `contractRate: undefined`, `loans: []` 추가 | UI 시니어 |
| ③ normalize | `normalizeDeemedGiftInput`에서 기간 필드 빈 문자열 → `undefined` 변환 | UI 시니어 |
| ④ API 변환 (`gift-deemed-api.ts`) | `FreeLoanInput` 기간 필드 + `FreeLoanAggregatedInput` loans 배열 변환 | UI 시니어 |
| ⑤ UI 위젯 | 대출 기간 DateInput(2개)·계약이자율 CurrencyInput, 다건 대출 추가/삭제 테이블 | UI 시니어 |
| ⑥ 사이드바 합계 | `periodBreakdown` 첫 window 금액 표시 / 합산 totalBenefit 표시 | UI 시니어 |
| ⑦ 결과 카드 | `periodBreakdown` 연도별 분해 표시 + `aggregationBreakdown` 건별 표시 | UI 시니어 |
| ⑧ validation | `loanStartDate > loanEndDate` 오류. `loans` 배열 최소 1건. `loanDate` 형식 검증 | UI 시니어 |
| ⑨ Zod enum 메인 | `DeemedGiftType`에 `"free_loan_aggregated"` 추가 | 엔진 시니어 |
| ⑩ Zod enum 컴패니언 | Route Handler Zod schema에 `free_loan_aggregated` case 추가 | 엔진 시니어 |
| ⑪ N/A | 자산-수준 `acquisitionDate` fallback 해당 없음 | — |
| **⑫ Zod 입력 객체** | `FreeLoanInput`에 `loanStartDate?: z.string()`, `loanEndDate?: z.string()`, `contractRate?` 추가. `FreeLoanAggregatedInput` Zod 스키마 신규 정의. ⚠️ TS 미감지 — grep 자가점검 필수 | 엔진 시니어 |
| **⑬ fetch body spread** | `callGiftDeemedAPI` body에 `loanStartDate`, `loanEndDate`, `contractRate`, `loans` 포함. ⚠️ TS 미감지 | UI 시니어 |
| **⑭ Route handler 매핑** | Route Handler에서 엔진 input 구성 시 기간 문자열 그대로 전달 (date-coerce N/A — 날짜를 문자열로 유지). ⚠️ TS 미감지 | 엔진 시니어 |

> ⚠️ **⑫⑬⑭ TS 미감지 경고**: TypeScript가 런타임 JSON 직렬화 누락을 감지하지 못함. Do 완료 후 grep으로 `loanStartDate`·`loanEndDate`·`loans` 3개 필드가 ⑫⑬⑭ 3개 파일에 모두 존재하는지 자가점검.

---

## 8. 인용 체인 주석 (코드 주석 템플릿)

### 적정이자율 4.6% (4단 체인)
```typescript
/**
 * 금전무상대출 적정이자율 4.6% (2016.3.7~).
 * 위임 체인: 상증법§41의4④ → 상증령§31의4① → 상증칙§10의5 → 법인세법시행규칙§43②("1,000분의 46")
 * 역사 고시: 2016.3.7 이전에는 8.5%(2010.11.5~), 9%(2001.12.31~), 11%(1999.6.30~).
 */
```

### 일수 안분 (명문 부재 명시)
```typescript
/**
 * §41의4② 다년 — 마지막 해 일수 안분.
 * "1년 되는 날의 다음 날에 매년 새로 대출받은 것으로 본다"(§41의4②)에서 의제 도출.
 * 분모 365, 분자=마지막 window 실제 일수 (differenceInDays + 1).
 * ⚠️ 일수/365 명문 조항 없음 — 교재 사례 기준 365 고정. 윤년(366일) 처리는 명문 부재로 미지원.
 * benefit = safeMultiplyThenDivide(annualBenefit, actualDays, 365)  // BigInt overflow 가드
 */
```

### §43² 합산 (raw benefit 분리 이유)
```typescript
/**
 * §43² 1년 이내 동일거래 합산 (상증법§43②·상증령§32의4).
 * ⚠️ 임계 판정(1천만) 전 raw benefit을 합산해야 함.
 *    free-loan.ts 단건 경로는 임계 미달 시 deemedGiftValue=0 반환 → raw benefit 손실.
 *    합산 레이어는 rawBenefit 직접 산출하고 합산 후 임계 판정한다.
 * 증여시기 = 합산 누계가 1천만 이상이 되는 건의 loanDate.
 */
```

---

## 9. anchor 명세 (이미지31 원단위 고정 — `feedback_pdf_example_test_anchoring`)

테스트 파일: `__tests__/tax-engine/gift-deemed/free-loan-period-agg.test.ts`

```
describe("PERIOD-1 — 사례1 다년 분할")
  test("1년차 full 이익 = 16_000_000") toBe(16_000_000)
  test("2년차 일수안분 364/365 = 15_956_164") toBe(15_956_164)
  test("deemedGiftValue = 첫 window (합산 금지)") toBe(16_000_000)
  test("periodBreakdown 길이 = 2") toHaveLength(2)
  test("periodBreakdown[0].giftDate = '2022-01-02'") toBe("2022-01-02")
  test("periodBreakdown[1].giftDate = '2023-01-02'") toBe("2023-01-02")

describe("PERIOD-2 — 정확히 2년 (안분 없음)")
  test("2년차 365일 = 16_000_000 (일수안분 없음)") toBe(16_000_000)

describe("PERIOD-3 — 기간 미정 → 단건 회귀")
  test("loanStartDate=undefined → 단건 경로") toBe(13_800_000) // LOAN-1 동일

describe("AGG-1 — 사례2 §43² 합산")
  test("합계 = 19_400_000") toBe(19_400_000)
  test("증여시기 = '2023-04-25'") toBe("2023-04-25")
  test("건별 echo ㉮ rawBenefit = 4_800_000") toBe(4_800_000)
  test("건별 echo ㉯ rawBenefit = 4_600_000") toBe(4_600_000)
  test("건별 echo ㉰ rawBenefit = 10_000_000") toBe(10_000_000)
  test("aggregationBreakdown 길이 = 3") toHaveLength(3)

describe("AGG-2 — 1년 초과 건 분리")
  test("1년 초과 건은 합산 제외") // 1년 내 건만 합산

describe("AGG-3 — 단건 합산 → 단건 동일")
  test("loans 1건 → 단건과 동일 결과") toBe(13_800_000)

describe("LOAN-1~4 회귀")
  test("LOAN-1: 무상 3억") toBe(13_800_000)
  test("LOAN-2: 저리 5억·이자500만") toBe(18_000_000)
  test("LOAN-3: 무상 2억 미달") expects applied=false
  test("LOAN-4: 정당사유") expects exclusionReason set
```

---

## 10. 리스크 및 처리 방침

| # | 항목 | 처리 방침 |
|---|---|---|
| R1 | 일수 안분 분모 365/366 명문 부재 | 365 고정 (교재). 주석 의무 명시. 윤년 지원은 명문 확정 후 후속. |
| R2 | `_calcFreeLoanMultiPeriod` vs 별도 파일 분리 | free-loan.ts 증가가 127줄 이내이면 내부 함수. 초과 시 `free-loan-multi.ts` 분리. |
| R3 | 법인 대출 가중평균차입이자율 (상증령§31의4① 단서) | 범위 외 (개인간 4.6% 기본). `isRelatedParty=true` 기본 가정. 미지원 명시 주석. |
| R4 | 기존 단건 회귀 | `loanStartDate && loanEndDate` 게이트 — 미입력 시 기존 경로 100% 보존. LOAN-1~4 회귀 필수. |
| R5 | 다년 + 합산 동시 케이스 | 사례는 분리(사례1=다년 단일, 사례2=다건 합산). MVP 각각 독립 처리. 동시 발생 시 `free_loan` + `free_loan_aggregated` 별도 dispatch. |
| R6 | `DeemedGiftResult.aggregationBreakdown` Map 금지 | plain 배열만 (`feedback_engine_result_map_json_loss`). NextResponse.json에서 Map은 `{}`로 소실. |
| R7 | ⑫⑬⑭ TS 미감지 | Do 완료 후 grep 3-file 자가점검 필수 (`feedback_api_zod_schema_sync`). |
| R8 | free-loan.ts Critical 정정 — raw benefit 차단 | 합산 레이어가 raw benefit 직접 산출하므로 기존 free-loan.ts는 수정 최소화. `thresholdEcho.benefit` 기존 필드가 이미 raw benefit 노출하고 있으므로 참고 가능. |

---

## 11. 선례 비교 요약

| 항목 | §37 다기간 (`free-realestate-use.ts`) | §41의4 다년 (신규) |
|---|---|---|
| window 루프 | `periods[]` 명시 배열 (UI가 개별 입력) | `loanStartDate`/`loanEndDate`에서 엔진이 window 자동 생성 |
| 마지막 해 일수 안분 | **없음** (§37은 5년 현가합 방식) | **있음** — `safeMultiplyThenDivide(연이익, actualDays, 365)` |
| deemedGiftValue | 첫 window (합산 금지) | 첫 window (합산 금지, 동일 법리) |
| periodBreakdown | 기존 구조 그대로 재사용 | `baseValue=loanAmount` 로 재사용 |

| 항목 | §43① 중복배제 (`dup-exclusion.ts`) | §43² 합산 (신규) |
|---|---|---|
| 방향 | 결과 배열에서 최대 1건 선택 | raw benefit 배열 합산 후 임계 판정 |
| 위치 | router 후처리 | `free_loan_aggregated` dispatch 내부 |
| 파일 | `dup-exclusion.ts` | `free-loan-aggregated.ts` (신규) |

---

## 12. Definition of Done 체크리스트

- [ ] `FreeLoanInput` 기간 필드 확장 (loanStartDate·loanEndDate·contractRate)
- [ ] `FreeLoanAggregatedInput`·`FreeLoanItem` 타입 신규
- [ ] `DeemedGiftType` + `DeemedGiftInput` union 확장
- [ ] `DeemedGiftResult.aggregationBreakdown` 필드 추가
- [ ] `free-loan.ts` 다년 분기 + `_calcFreeLoanMultiPeriod` 구현
- [ ] `free-loan-aggregated.ts` 신규 + `calcFreeLoanAggregatedGift` 구현
- [ ] `router.ts` `free_loan_aggregated` case 추가
- [ ] `legal-codes/inheritance-gift.ts` `FREE_LOAN_PERIOD` 상수 추가
- [ ] anchor 테스트 `free-loan-period-agg.test.ts` 작성
- [ ] PERIOD-1: `toBe(16_000_000)` + `toBe(15_956_164)` 통과
- [ ] AGG-1: `toBe(19_400_000)` + giftDate `"2023-04-25"` 통과
- [ ] LOAN-1~4 회귀 통과
- [ ] ⑫⑬⑭ grep 자가점검 (loanStartDate·loanEndDate·loans 3필드 × 3파일)
- [ ] `npx tsc --noEmit` 0건
- [ ] `npx vitest run __tests__/tax-engine/gift-deemed/` 통과 + 전체 회귀
- [ ] 인용 체인 주석 (적정이자율 4단·일수안분 명문부재) 코드에 삽입

---

## 13. 통합비교 정정 (STEP 10/11 — 엔진↔UI 정합 확정) ⭐ Do 시 이 섹션 우선

UI 설계가 엔진 설계 미생성 상태에서 작성되어 정합 불일치 7건 발견 → 아래로 확정(양 문서 동기화).

### C1. 다건 이자 입력 — `contractRate` 제거, `actualInterestPaid` 통일 ⭐
- §3.2 `FreeLoanInput.contractRate` 필드 **삭제**. 단건·다년·다건 전부 `actualInterestPaid`(**연간** 실제이자 금액) 통일.
- 이유: 단건/`FreeLoanItem`이 이미 actualInterestPaid(금액). 다년만 율(contractRate)이면 3입력 혼재 + UI 율 위젯 부재 → 사례1 무상 오계산 위험.
- `calcAnnualBenefit` 수정: `applyRateFraction(loanAmount, appropriateRate.numer, appropriateRate.denom) − actualInterestPaid` (contractRate 인자 삭제).
- 검산: 사례1 = 46,000,000 − 30,000,000(=10억×3% 연이자) = 16,000,000 ✓ → 2년차 floor(16,000,000×364/365)=15,956,164 ✓.

### C2. `periodBreakdown.dayCount?` echo 추가
- periodBreakdown 항목에 `dayCount?: number` optional 추가 — 마지막 window 실제일수(364) echo → UI "364/365일" 표시. §37(undefined)은 무영향.

### C3. `aggregationBreakdown.isThresholdCrossing?` 추가
- 항목에 `isThresholdCrossing?: boolean` 추가 — 누계가 1천만 처음 도달하는 건(=증여시기). 증여시기 giftDate = 그 건 loanDate. UI ▶마커·강조에 사용.

### C4. legal 상수 — 기존 재사용, UI 신규상수 폐기
- §43² 합산: 기존 `GIFT.DUP_EXCLUSION_ANNUAL`("상증법 §43② · 상증령 §32의4 6호") **재사용**(이미 `DeemedGiftResultView.tsx:483` §39의3 사용). UI 가정 `SAME_TRANSACTION_AGGREGATION`·`SAME_TRANSACTION_AGG_RULE` **폐기**(grep 미존재).
- ⚠️ 값의 "6호"는 §39의3 해당 호 — §41의4 해당 호는 **Do 시 KoreanLaw 상증령§32의4 확정**(이름 DUP_EXCLUSION은 부적절하나 rename은 §39의3 영향 → 범위외, Do 후 별건 검토).
- §41의4② 다년: `FREE_LOAN_PERIOD: "상증법 §41의4②"` 신규 추가(§6.1 line 354 확정).

### C5. §43② 본문 문언 정정 (§1 표 line 36)
- 법령 실측 문언으로 교체: "**각각의 거래 등에 따른 이익을 해당 이익별로 합산하여 계산한다**"(§43②). 기존 "이익의 합계액을 기준으로 §31①2호 각 목" 표현은 §31①2호 한정 오해 → 폐기.

### C6. `FreeLoanItem` 필드명 ↔ UI form 매핑
- 엔진 `FreeLoanItem`: loanDate·**loanAmount**·actualInterestPaid·appropriateRate·label. UI form `LoanLoanItem`(amount·interest)은 API 변환에서 `amount→loanAmount`·`interest→actualInterestPaid` 매핑(ui.design §6 정정).

### C7. §43² 1년 소급 판정 단순화 명시 (R 보강)
- 현행 알고리즘(§5.2 step1-2)은 **최종 거래일(loanDate_max) 기준 1년 소급**. 사례2는 정확하나, "도달 후 추가 거래" 등 일반 케이스는 거래별 소급이 정밀 → **MVP는 최종거래일 기준 단순화** 명시. AGG-2 anchor로 1년 초과 분리만 검증. 정밀 거래별 소급은 후속.
