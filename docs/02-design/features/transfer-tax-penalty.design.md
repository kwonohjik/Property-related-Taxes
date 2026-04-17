# 양도소득세 가산세 계산 엔진 설계서

## 1. 개요

### 1.1 구현 목표

| 가산세 종류 | 근거 법령 | 내용 |
|------------|---------|------|
| 신고불성실가산세 | 국세기본법 §47의2, §47의3 | 무신고·과소신고·초과환급신고 납부세액 × 가산세율 |
| 지연납부가산세 | 국세기본법 §47의4 | 미납·미달납부세액 × 경과일수 × 일 이자율 |

### 1.2 적용 기준 (2015.7.1 이후 양도분)

- 부칙 12848호 10조 ② 기준: **무신고·과소신고 납부세액** 기준으로 가산세 산정
- 구(2015.6.30 이전): 산출세액 기준 → 신(2015.7.1 이후): 납부세액 기준으로 변경

---

## 2. 신고불성실가산세 (국세기본법 §47의2·§47의3)

### 2.1 산출식

```
가산세 = 무신고·과소신고 납부세액 × 가산세율
```

**납부세액 정의** (세액공제·감면, 기납부세액, 당초 신고세액 차감 후 가산세 가산 前 금액):

```
무신고·과소신고 납부세액
  = 결정세액
  - 세액공제·감면액
  - 기납부세액
  - 당초 신고세액
  ※ 세법에 따른 이자상당액 가산액 제외
  ※ 초과환급신고 환급세액이 있으면 과소신고 납부세액에 합산
```

### 2.2 가산세율 매트릭스

| 신고 유형 | 일반 | 부정행위 | 역외거래 부정행위 (2015.7.1 이후) |
|---------|------|--------|-------------------------------|
| **무신고** | 20% | 40% | 60% |
| **과소신고** | 10% | 40% | 60% |
| **초과환급신고** | 10% | 40% | 60% |

### 2.3 신고 유형 정의

```typescript
type FilingType =
  | "none"           // 무신고
  | "under"          // 과소신고 (신고했으나 납부세액 과소)
  | "excess_refund"  // 초과환급신고 (환급세액 과다 신고)
  | "correct";       // 정상 신고 (가산세 없음)

type PenaltyReason =
  | "normal"         // 일반 (단순 실수·착오)
  | "fraudulent"     // 부정행위 (적극적 위장·은닉)
  | "offshore_fraud"; // 역외거래 부정행위 (2015.7.1 이후)
```

### 2.4 부정행위 해당 여부 판단 기준 (국세기본법 §26의2 ⑪)

납세자가 직접 부정행위 여부를 선택 입력. 다음 행위 해당 시:
- 이중장부 작성, 허위 증빙 수취·발급
- 재산 은닉, 소득·수익 조작
- 고의적 장부 파기·은폐

---

## 3. 지연납부가산세 (국세기본법 §47의4)

### 3.1 산출식

```
지연납부가산세 = 미납·미달납부세액 × 경과일수 × 일 이자율
```

### 3.2 이자율 (국세기본법 시행령 §27의4)

| 적용 기간 | 일 이자율 | 연 환산 |
|---------|---------|-------|
| 2022.2.15 이후 | **0.022%** | 약 8.03% |
| 2019.2.12~2022.2.14 | 0.025% | 약 9.13% |
| 2016.3.1~2019.2.11 | 0.03% | 약 10.95% |

> 기본 적용: 현행 0.022%/일 (시행령 개정 반영)

### 3.3 경과일수 계산

```
경과일수 = 납부기한 다음날 ~ 실제 납부일(또는 계산일)

납부기한:
- 예정신고: 양도일이 속하는 달의 말일부터 2개월 (소득세법 §105)
- 확정신고: 다음해 5월 1일~5월 31일
- 결정·경정: 고지서 납부기한 (통상 고지일부터 30일)
```

### 3.4 납부세액 유형

```typescript
type UnpaidTaxType =
  | "underpayment"   // 미달납부 (신고는 했으나 납부 미달)
  | "non_payment"    // 미납부 (신고 자체 미신고 포함)
  | "refund_excess"; // 환급세액 과다수령
```

---

## 4. 데이터 모델 설계

### 4.1 Input 타입

```typescript
// lib/tax-engine/transfer-tax-penalty.ts

export interface FilingPenaltyInput {
  // ── 과세 결과 (transfer-tax.ts 결과에서 연동) ──
  /** 결정세액 (세액공제·감면 적용 후) */
  determinedTax: number;
  /** 세액공제·감면액 합계 */
  reductionAmount: number;

  // ── 기납부·당초 신고 ──
  /** 기납부세액 (예정신고 기납부 포함) */
  priorPaidTax: number;
  /** 당초 신고세액 (과소신고 시 최초 신고한 납부세액) */
  originalFiledTax: number;
  /** 초과환급신고 환급세액 (환급 과다 수령액) */
  excessRefundAmount: number;

  // ── 신고 유형 ──
  /** 신고 유형 */
  filingType: FilingType;
  /** 부정행위 유형 */
  penaltyReason: PenaltyReason;

  // ── 세법 이자상당액 가산액 ──
  /** 세법에 따른 이자상당액 가산액 (제외 대상) */
  interestSurcharge: number;
}

export interface DelayedPaymentInput {
  /** 미납·미달납부세액 */
  unpaidTax: number;
  /** 납부기한 */
  paymentDeadline: Date;
  /** 실제 납부일 (미입력 시 오늘 기준) */
  actualPaymentDate?: Date;
  /** 일 이자율 override (기본: 0.00022) */
  dailyRateOverride?: number;
}
```

### 4.2 Output 타입

```typescript
export interface FilingPenaltyResult {
  /** 무신고·과소신고 납부세액 (가산세 산정 기준) */
  penaltyBase: number;
  /** 적용 가산세율 */
  penaltyRate: number;
  /** 신고불성실가산세액 */
  filingPenalty: number;
  /** 적용 근거 (법령 조문) */
  legalBasis: string;
  /** 계산 단계 */
  steps: PenaltyStep[];
}

export interface DelayedPaymentResult {
  /** 미납·미달납부세액 */
  unpaidTax: number;
  /** 경과일수 */
  elapsedDays: number;
  /** 적용 일 이자율 */
  dailyRate: number;
  /** 지연납부가산세액 */
  delayedPaymentPenalty: number;
  /** 납부기한 */
  paymentDeadline: Date;
  /** 계산기준일 */
  calculationDate: Date;
  /** 계산 단계 */
  steps: PenaltyStep[];
}

export interface PenaltyStep {
  label: string;
  formula: string;
  amount: number;
  legalBasis?: string;
}

/** 최종 통합 결과 */
export interface TransferTaxPenaltyResult {
  filingPenalty: FilingPenaltyResult | null;
  delayedPaymentPenalty: DelayedPaymentResult | null;
  /** 가산세 합계 */
  totalPenalty: number;
}
```

---

## 5. 구현 파일 구조

### 5.1 신규 파일

```
lib/tax-engine/
└── transfer-tax-penalty.ts    # 가산세 순수 엔진 (신규)

__tests__/tax-engine/
└── transfer-tax-penalty.test.ts  # 테스트 (신규)
```

### 5.2 수정 파일

```
lib/tax-engine/
├── legal-codes.ts              # PENALTY 상수 추가
└── transfer-tax.ts             # TransferTaxInput·Result에 가산세 필드 추가 (선택적)

app/calc/transfer-tax/
└── TransferTaxCalculator.tsx   # 가산세 입력 UI 단계 추가
```

---

## 6. 법령 상수 추가 (legal-codes.ts)

```typescript
export const PENALTY = {
  // ── 신고불성실가산세 ──
  /** 국세기본법 §47의2 — 무신고가산세 (납부세액 × 20%, 부정행위 40%) */
  NON_FILING:          "국세기본법 §47의2",
  /** 국세기본법 §47의3 — 과소신고·초과환급신고가산세 (납부세액 × 10%, 부정행위 40%) */
  UNDER_FILING:        "국세기본법 §47의3",
  /** 부칙 12848호 §10② — 2015.7.1 이후 양도분 납부세액 기준 산정 */
  ADDENDUM_2015:       "부칙 §12848호 제10조②",
  /** 국세기본법 §26의2 ⑪ — 부정행위의 정의 */
  FRAUDULENT_DEF:      "국세기본법 §26의2 ⑪",

  // ── 지연납부가산세 ──
  /** 국세기본법 §47의4 — 납부지연가산세 (미납세액 × 일수 × 이자율) */
  DELAYED_PAYMENT:     "국세기본법 §47의4",
  /** 국세기본법 시행령 §27의4 — 납부지연 이자율 (일 0.022%) */
  DAILY_RATE:          "국세기본법 시행령 §27의4",

  // ── 양도소득세 신고기한 ──
  /** 소득세법 §105 — 양도소득 예정신고 기한 (양도월 말일부터 2개월) */
  PRELIMINARY_DEADLINE: "소득세법 §105",
  /** 소득세법 §110 — 양도소득 확정신고 기한 (다음해 5.1~5.31) */
  FINAL_DEADLINE:       "소득세법 §110",
} as const;

export const PENALTY_CONST = {
  /** 무신고 일반 가산세율 */
  NON_FILING_RATE:          0.20,
  /** 과소신고·초과환급신고 일반 가산세율 */
  UNDER_FILING_RATE:        0.10,
  /** 부정행위 가산세율 */
  FRAUDULENT_RATE:          0.40,
  /** 역외거래 부정행위 가산세율 (2015.7.1 이후) */
  OFFSHORE_FRAUD_RATE:      0.60,
  /** 지연납부 현행 일 이자율 (2022.2.15 이후) */
  DAILY_PENALTY_RATE:       0.00022,
  /** 지연납부 이전 일 이자율 (2019.2.12~2022.2.14) */
  DAILY_PENALTY_RATE_OLD_1: 0.00025,
  /** 지연납부 이전 이자율 (2016.3.1~2019.2.11) */
  DAILY_PENALTY_RATE_OLD_2: 0.0003,
  /** 2015.7.1 납부세액 기준 전환일 */
  REFORM_DATE_2015:         new Date("2015-07-01"),
  /** 현행 이자율 적용 시작일 (2022.2.15) */
  DAILY_RATE_EFFECTIVE_DATE: new Date("2022-02-15"),
} as const;
```

---

## 7. 핵심 계산 로직

### 7.1 신고불성실가산세 계산 흐름

```
① 납부세액 산정
   penaltyBase = determinedTax
               - reductionAmount
               - priorPaidTax
               - originalFiledTax
               - interestSurcharge
               + excessRefundAmount   (초과환급 시)
   if (penaltyBase <= 0) → 가산세 없음

② 가산세율 결정
   penaltyReason === "offshore_fraud"  → 60%
   penaltyReason === "fraudulent"      → 40%
   filingType === "none"               → 20%  (무신고 일반)
   filingType === "under"|"excess"     → 10%  (과소·초과환급 일반)

③ 가산세 = penaltyBase × penaltyRate
```

### 7.2 지연납부가산세 계산 흐름

```
① 경과일수 = actualPaymentDate - paymentDeadline - 1 (납부기한 다음날부터)
   if (elapsedDays <= 0) → 가산세 없음

② 이자율 결정
   actualPaymentDate >= 2022.2.15 → 0.022%
   actualPaymentDate >= 2019.2.12 → 0.025%
   그 외                          → 0.03%

③ 가산세 = unpaidTax × elapsedDays × dailyRate
   ※ Math.floor() 적용 (원 미만 절사)
```

---

## 8. UI 연동 설계

### 8.1 신규 입력 단계 위치

```
현재 StepWizard 단계:
  Step 1: 물건 정보
  Step 2: 취득·양도 정보
  Step 3: 감면 정보
  Step 4: 결과

추가 방안 (선택적 단계):
  Step 3.5: 가산세 정보 (선택 입력, 기본: 정상신고·납부)
  → filingType, penaltyReason, priorPaidTax, originalFiledTax
  → paymentDeadline, actualPaymentDate
```

### 8.2 기본값 전략

- `filingType`: `"correct"` (정상신고) → 가산세 없음으로 기본 계산
- 사용자가 가산세 계산 원할 때만 입력 단계 노출 (토글 방식)

---

## 9. 테스트 시나리오

### 9.1 신고불성실가산세

| 케이스 | filingType | penaltyReason | 결과 |
|-------|-----------|--------------|------|
| T1 | `none` | `normal` | 납부세액 × 20% |
| T2 | `none` | `fraudulent` | 납부세액 × 40% |
| T3 | `none` | `offshore_fraud` | 납부세액 × 60% |
| T4 | `under` | `normal` | 납부세액 × 10% |
| T5 | `under` | `fraudulent` | 납부세액 × 40% |
| T6 | `excess_refund` | `normal` | (과소+환급) × 10% |
| T7 | `correct` | `normal` | 0 |
| T8 | penaltyBase ≤ 0 | any | 0 |

### 9.2 지연납부가산세

| 케이스 | 설명 | 기대 결과 |
|-------|-----|---------|
| D1 | 납부기한 전 납부 | 0 |
| D2 | 납부기한 당일 납부 | 0 |
| D3 | 30일 경과 | 미납 × 30 × 0.022% |
| D4 | 365일 경과 | 미납 × 365 × 0.022% |
| D5 | 2022.2.14 이전 납부 | 이전 이자율 적용 |

---

## 10. 구현 순서 (Do 단계)

1. **Step 1**: `legal-codes.ts`에 `PENALTY`, `PENALTY_CONST` 상수 추가
2. **Step 2**: `transfer-tax-penalty.ts` 순수 엔진 구현
   - `calculateFilingPenalty()` — 신고불성실가산세
   - `calculateDelayedPaymentPenalty()` — 지연납부가산세
   - `calculateTransferTaxPenalty()` — 통합 함수
3. **Step 3**: `transfer-tax.ts` Input/Result 타입에 가산세 관련 선택 필드 추가
4. **Step 4**: `__tests__/tax-engine/transfer-tax-penalty.test.ts` 테스트 작성
5. **Step 5**: UI 연동 (TransferTaxCalculator.tsx — 가산세 선택 단계 추가)

---

## 11. 참고 법령

| 법령 | 조문 | 내용 |
|-----|-----|------|
| 국세기본법 | §47의2 | 무신고가산세 |
| 국세기본법 | §47의3 | 과소신고·초과환급신고가산세 |
| 국세기본법 | §47의4 | 납부지연가산세 |
| 국세기본법 시행령 | §27의4 | 납부지연 이자율 |
| 국세기본법 | §26의2 ⑪ | 부정행위 정의 |
| 소득세법 | §105 | 양도소득 예정신고 기한 |
| 소득세법 | §110 | 양도소득 확정신고 기한 |
| 부칙 12848호 | 10조 ② | 2015.7.1 이후 납부세액 기준 전환 |
