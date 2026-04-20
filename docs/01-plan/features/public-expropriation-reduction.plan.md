# Plan: 공익사업용 토지 수용 감면 (조특법 §77)

- Feature: `public-expropriation-reduction`
- Status: Plan
- Updated: 2026-04-20

## 1. 법령 매트릭스

### 1-A. 조특법 §77 ① 감면율

| # | 보상 유형 | 감면율 |
|---|---|---|
| 1 | 현금보상 | 10% |
| 2 | 채권보상 (일반) | 15% |
| 3 | 채권 3년 만기보유 특약 | 30% |
| 4 | 채권 5년 만기보유 특약 | 40% |

- 현금+채권 혼합 시 **금액 가중평균**: `감면율 = (현금×0.10 + 채권×적용율) / 총보상`
- 감면세액 = `산출세액 × 가중평균감면율` (정수 절사)

### 1-B. 조특법 부칙 제53조 (종전 감면율 경과조치)

**적용 조건 (AND)**
1. 사업인정고시일 `≤ 2015-12-31`
2. 양도일 `≤ 2017-12-31`

**종전 감면율** (참고: 2016년 이전)
- 현금 20% / 채권 25% / 3년특약 40% / 5년특약 50%

> 이번 사례(고시 2017.4.23., 양도 2023.02.16.)는 **해당 없음** → 현행 감면율 적용.
> 현 시점(2026-04) 양도일 조건(`≤ 2017-12-31`)을 만족하는 신규 계산은 실질적으로 불가하지만, 이력 계산·검증 재현을 위해 분기는 남긴다.

### 1-C. 소득령 §168의14 ③ 3호 — 사업인정고시일 기준 당연사업용

| 고시일 구간 | 당연사업용 인정 요건 |
|---|---|
| `≤ 2021-05-03` | 취득일이 고시일 **2년 전 이전** |
| `≥ 2021-05-04` | 취득일이 고시일 **5년 전 이전** |

현재 `non-business-land.ts:895~911`은 OR 연결 → **2021.5.3. 기준 분기로 정밀화** 필요.

### 1-D. 조특법 §133 ① 종합한도

- 단건 계산 기준: **1년 2억원 한도** (단일 계산 트리거)
- 5년 누적 3억원 한도는 이력 연동 없이 판별 불가 → Phase 2 (경고만 노출)

## 2. 입력·산출 계약

### 2-A. 엔진 입력
```ts
interface PublicExpropriationReductionInput {
  cashCompensation: number;          // 현금보상액 (KRW)
  bondCompensation: number;          // 채권보상액 (KRW)
  bondHoldingYears?: 3 | 5 | null;   // 채권 만기특약 (null=일반 15%)
  businessApprovalDate: Date;        // 사업인정고시일
  transferDate: Date;                // 양도일 (부칙 §53 판정용)
  calculatedTax: number;             // 산출세액
}
```

### 2-B. 엔진 출력
```ts
interface PublicExpropriationReductionResult {
  isEligible: boolean;
  reductionAmount: number;           // 최종 감면세액 (한도 반영)
  rawReductionAmount: number;        // 한도 적용 전
  weightedRate: number;              // 가중평균 감면율
  breakdown: {
    cashRate: number;
    bondRate: number;
    cashAmount: number;
    bondAmount: number;
  };
  useLegacyRates: boolean;           // 부칙 §53 적용 여부
  cappedByAnnualLimit: boolean;      // §133 한도 초과
  appliedAnnualLimit: number;        // 200_000_000
  legalBasis: string;
  warnings: string[];
}
```

## 3. 연동 포인트

1. `TransferReduction` 유니온 확장 → `public_expropriation`
2. `transfer-tax.ts` `calcReductions` 분기 추가 (R-5) — 기존 후보 배열에 `{amount, type}` push
3. `non-business-land.ts:895~911` — 2021.5.3. 기준 2년/5년 분기 정밀화 (기존 OR → if/else)
4. `lib/api/transfer-tax-schema.ts` discriminatedUnion 확장
5. API: single + multi 라우트 자동 수용
6. UI: `TransferTaxCalculator.tsx` 양도 사유 단계 + 보상 구성 입력 + 결과 카드

## 4. 테스트 계획 (Check 단계 앵커)

| ID | 시나리오 | 기대값 |
|---|---|---|
| R77-1 | 현금 단독 (10%) | rawReduction = tax × 0.10 |
| R77-2 | 채권 단독 15% | rawReduction = tax × 0.15 |
| R77-3 | 채권 3년 30% | rawReduction = tax × 0.30 |
| R77-4 | 채권 5년 40% | rawReduction = tax × 0.40 |
| R77-5 | 현금/채권 혼합 가중평균 (이미지 사례) | 가중율 13.507% |
| R77-6 | 부칙 §53 적용 (고시 2015/양도 2017) | 종전 감면율 |
| R77-7 | §133 한도 초과 | min(raw, 2억) |
| R77-8 | 비사업용 분기 정밀화 (2021.5.4. 고시 · 3년 전 취득) | 비사업용 |
| R77-9 | 통합 — 이미지 사례 전체 파이프라인 | 감면 적용된 최종 세액 |

## 5. 위험·가정

- 5년 누적 한도는 사용자 자기 기입 (입력 선택사항), 기본 동작은 단건 2억 한도만
- 채권 만기특약은 사용자 자기 기입 (실제 특약서 존재 가정)
- 부칙 §53 경계값(2015-12-31, 2017-12-31)은 `≤` 포함 경계
