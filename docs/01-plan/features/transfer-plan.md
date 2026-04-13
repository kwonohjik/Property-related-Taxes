# 양도소득세 계산 엔진 세부 작업 계획서

> 작성일: 2026-04-14
> 참조 설계: `docs/02-design/features/korean-tax-calc-engine.design.md`
> 참조 DB 설계: `docs/02-design/features/korean-tax-calc-db-schema.design.md`

---

## 현황 요약

| 구분 | 파일 | 상태 |
|------|------|------|
| 완료 | `lib/tax-engine/types.ts` | TaxType, TaxBracket, TaxRateRecord 타입 정의 |
| 완료 | `lib/tax-engine/tax-utils.ts` | 9개 유틸 함수 (P0 이슈 해결 포함) |
| 완료 | `lib/tax-engine/tax-errors.ts` | TaxCalculationError, TaxRateNotFoundError 등 |
| 완료 | `lib/tax-engine/schemas/rate-table.schema.ts` | Zod 스키마 전체 |
| 완료 | `lib/db/tax-rates.ts` | preloadTaxRates, getRate, getRatesByCategory |
| 완료 | `lib/db/regulated-areas.ts` | isRegulatedArea |
| 완료 | DB + 시딩 | tax_rates 테이블 + 양도세 6건 |
| **미구현** | `lib/tax-engine/transfer-tax.ts` | **순수 계산 엔진 (이번 작업)** |
| **미구현** | `app/api/calc/transfer/route.ts` | **Orchestrator API Route** |
| **미구현** | `__tests__/tax-engine/transfer-tax.test.ts` | **단위 테스트** |

---

## 파일 1: `lib/tax-engine/transfer-tax.ts`

### 1-A. 타입 정의 (파일 상단)

| # | 타입명 | 필드 | 비고 |
|---|--------|------|------|
| 1 | `TransferTaxInput` | `propertyType: 'housing' \| 'land' \| 'building'` | 물건 종류 |
| | | `transferPrice: number` | 양도가액 (원, 정수) |
| | | `transferDate: Date` | 양도일 |
| | | `acquisitionPrice: number` | 취득가액 (0이면 환산 사용) |
| | | `acquisitionDate: Date` | 취득일 |
| | | `expenses: number` | 필요경비 |
| | | `useEstimatedAcquisition: boolean` | 환산취득가 사용 여부 |
| | | `standardPriceAtAcquisition?: number` | 취득시 기준시가 |
| | | `standardPriceAtTransfer?: number` | 양도시 기준시가 |
| | | `householdHousingCount: number` | 세대 보유 주택 수 |
| | | `residencePeriodMonths: number` | 거주기간 (월) |
| | | `isRegulatedArea: boolean` | 양도일 기준 조정대상지역 |
| | | `wasRegulatedAtAcquisition: boolean` | 취득일 기준 조정대상지역 |
| | | `isUnregistered: boolean` | 미등기 여부 |
| | | `isNonBusinessLand: boolean` | 비사업용 토지 여부 |
| | | `isOneHousehold: boolean` | 1세대 여부 |
| | | `temporaryTwoHouse?: { previousAcquisitionDate, newAcquisitionDate }` | 일시적 2주택 |
| | | `reductions: TransferReduction[]` | 조세특례 감면 목록 |
| | | `annualBasicDeductionUsed: number` | 당해 연도 기사용 기본공제 |
| 2 | `TransferReduction` | `{ type: 'self_farming'; farmingYears: number }` | 자경농지 |
| | | `{ type: 'long_term_rental'; rentalYears; rentIncreaseRate }` | 장기임대 |
| | | `{ type: 'new_housing'; region }` | 신축주택 |
| | | `{ type: 'unsold_housing'; region }` | 미분양주택 |
| 3 | `TransferTaxResult` | `isExempt: boolean` | 전액 비과세 여부 |
| | | `exemptReason?: string` | 비과세 사유 |
| | | `transferGain: number` | 양도차익 |
| | | `taxableGain: number` | 과세 양도차익 (12억 초과분) |
| | | `usedEstimatedAcquisition: boolean` | 환산취득가 사용 여부 |
| | | `longTermHoldingDeduction: number` | 장기보유특별공제 |
| | | `longTermHoldingRate: number` | 적용 공제율 |
| | | `basicDeduction: number` | 기본공제 |
| | | `taxBase: number` | 과세표준 (천원 미만 절사) |
| | | `appliedRate: number` | 적용 세율 |
| | | `progressiveDeduction: number` | 누진공제액 |
| | | `calculatedTax: number` | 산출세액 |
| | | `surchargeType?: string` | 중과세 유형 |
| | | `surchargeRate?: number` | 추가 세율 |
| | | `isSurchargeSuspended: boolean` | 중과세 유예 여부 |
| | | `reductionAmount: number` | 총 감면세액 |
| | | `reductionType?: string` | 감면 유형 |
| | | `determinedTax: number` | 결정세액 (원 미만 절사) |
| | | `localIncomeTax: number` | 지방소득세 (결정세액 × 10%) |
| | | `totalTax: number` | 총 납부세액 |
| | | `steps: CalculationStep[]` | 계산 과정 |
| 4 | `CalculationStep` | `label: string` | 단계명 (예: '양도차익 계산') |
| | | `formula: string` | 산식 설명 |
| | | `amount: number` | 결과 금액 |

---

### 1-B. 내부 헬퍼 함수 (export 안 함)

| # | 함수명 | 입력 | 출력 | 핵심 로직 | 의존 함수 |
|---|--------|------|------|-----------|----------|
| H-1 | `parseRatesFromMap` | `rates: TaxRatesMap` | `ParsedRates` 객체 | DB 세율 Map에서 필요한 6종 규칙 추출·파싱. 실패 시 `TaxRateNotFoundError` throw | `getRate`, `parseProgressiveRate`, `parseSurchargeRate`, `parseDeductionRules` |
| H-2 | `checkExemption` | `input`, `specialRules` | `{ isExempt, isPartialExempt, exemptReason? }` | 1세대1주택 비과세/일시적 2주택 판단. E-1~E-4 세부 규칙 적용 | `calculateHoldingPeriod` |
| H-3 | `calcTransferGain` | `input` | `{ gain, usedEstimated }` | 양도차익 계산 (환산취득가 포함) | `calculateEstimatedAcquisitionPrice` |
| H-4 | `calcOneHouseProration` | `gain, transferPrice` | `taxableGain: number` | 12억 초과분 과세 안분 | `calculateProration` |
| H-5 | `calcLongTermHoldingDeduction` | `taxableGain, input, rules, isSurcharge, suspended` | `{ deduction, rate }` | 장기보유특별공제 계산. L-1~L-4 세부 규칙 | `calculateHoldingPeriod`, `applyRate` |
| H-6 | `calcBasicDeduction` | `taxableGain, longTermDed, annualUsed, isUnregistered` | `deduction: number` | 연 250만원 한도 – 기사용분. 미등기 시 0 | — |
| H-7 | `calcTax` | `taxBase, parsedRates, input, suspended` | `{ calculatedTax, surchargeType, surchargeRate, appliedRate, progressiveDeduction }` | 세액 결정 (미등기·중과·일반 3경로). T-1~T-3 | `calculateProgressiveTax`, `applyRate`, `isSurchargeSuspended` |
| H-8 | `calcReductions` | `calculatedTax, input.reductions, deductionRules` | `{ reductionAmount, reductionType? }` | 조세특례 감면 계산. R-1~R-4 | `applyRate` |

---

### 1-C. 비과세 판단 세부 규칙 (H-2 내부)

| # | 규칙 코드 | 조건 | 결과 | 세법 근거 | 주의사항 |
|---|-----------|------|------|----------|----------|
| E-1 | 1세대1주택 전액 비과세 | `isOneHousehold AND householdHousingCount === 1 AND holdingYears >= 2 AND (비조정 OR 거주 24개월+) AND transferPrice <= 1,200,000,000` | `isExempt = true` | 소득세법 §89① | 보유·거주 요건 동시 검토 |
| E-2 | 1세대1주택 부분 과세 | E-1 조건 충족 + `transferPrice > 1,200,000,000` | `isPartialExempt = true` | 소득세법 §89① 단서 | 12억 초과분만 과세 (H-4 호출) |
| E-3 | 일시적 2주택 비과세 | `isOneHousehold AND householdHousingCount === 2 AND temporaryTwoHouse 존재` + 기한 내 양도 | `isExempt = true` | 소득세법 시행령 §155① | 기한: 조정지역 2년(2022.5.10 이후 완화 3년), 비조정 3년 |
| E-4 | 2017.8.3 이전 취득 경과규정 | `acquisitionDate < 2017-08-03 AND isOneHousehold AND householdHousingCount === 1` | 거주 요건 면제 | 소득세법 부칙 (2017.8.2 개정) | 취득 당시 비조정이면 2년 보유만으로 비과세 |

**일시적 2주택 기한 계산 상세:**

| 취득일 | 조정지역 여부 | 처분 기한 | 근거 |
|--------|-------------|----------|------|
| 2022.5.10 이전 | 조정→조정 | 신규취득일 + 1년 (구 규정) | 개정 전 시행령 |
| 2022.5.10 이후 | 조정→조정 | 신규취득일 + 3년 | 시행령 §155① 완화 |
| 무관 | 비조정 | 신규취득일 + 3년 | 시행령 §155① |

---

### 1-D. 장기보유특별공제 세부 규칙 (H-5 내부)

| # | 규칙 코드 | 조건 | 공제율 계산 | 최대 공제율 | 최소 보유 |
|---|-----------|------|------------|------------|----------|
| L-1 | 공제 배제 | `isSurcharge AND NOT isSuspended` | 0% | — | — |
| L-2 | 공제 배제 | `isUnregistered` | 0% | — | — |
| L-3 | 1세대1주택 특례 | `isOneHousehold AND householdHousingCount === 1 AND holdingYears >= 3` | 보유 연 4% + 거주 연 4% | 80% (보유 40% + 거주 40%) | 3년 |
| L-4 | 일반 | 그 외 `holdingYears >= 3` | 연 2% | 30% | 3년 |

**공제율 계산 공식:**

| 구분 | 공식 | 예시 (5년 보유, 3년 거주) |
|------|------|------------------------|
| L-3 보유율 | `min(holdingYears × 0.04, 0.40)` | `min(5 × 0.04, 0.40) = 0.20` |
| L-3 거주율 | `min(floor(residencePeriodMonths / 12) × 0.04, 0.40)` | `min(3 × 0.04, 0.40) = 0.12` |
| L-3 합산 | `min(보유율 + 거주율, 0.80)` | `min(0.32, 0.80) = 0.32` |
| L-4 일반 | `min(holdingYears × 0.02, 0.30)` | `min(5 × 0.02, 0.30) = 0.10` |

---

### 1-E. 세액 결정 세부 규칙 (H-7 내부)

| # | 경로 | 진입 조건 | 세율 | 공제·조정 | 법적 근거 |
|---|------|----------|------|----------|----------|
| T-1 | 미등기 | `isUnregistered === true` | 70% 단일세율 | 장기보유공제·기본공제 모두 배제 | 소득세법 §104①12 |
| T-2 | 비사업용 토지 중과 | `isNonBusinessLand === true` | 누진세율 + 10%p 추가 | 장기보유공제 미적용, 기본공제 허용 | 소득세법 §104①8 |
| T-3 | 다주택 중과 (유예 해제 시) | `isSurcharge AND NOT isSuspended` | 누진세율 + 20%p(2주택) / 30%p(3주택+) 추가 | 장기보유공제 미적용 (L-1) | 소득세법 §104①1·2 |
| T-4 | 일반 | 그 외 모든 경우 | 누진세율 6~45% | 정상 적용 | 소득세법 §55 |

**중과세 적용 조건 (T-3):**

| 조건 항목 | 값 | 비고 |
|----------|-----|------|
| `propertyType` | `'housing'` | 토지·건물은 다주택 중과 미해당 |
| `isRegulatedArea` | `true` | 양도일 기준 조정대상지역 |
| `householdHousingCount` | `>= 2` | 세대 기준 |
| `isSurchargeSuspended(...)` | `false` | DB suspended_until 초과 시 |

---

### 1-F. 조세특례 감면 세부 규칙 (H-8 내부)

| # | 감면 유형 | 진입 조건 | 감면율 | 한도 | 법적 근거 |
|---|----------|----------|-------|------|----------|
| R-1 | 자경농지 (`self_farming`) | `farmingYears >= 8` | 100% (세액 전부) | 단일 5년 1억원, 5년 누적 2억원 | 조세특례제한법 §69 |
| R-2 | 장기임대 (`long_term_rental`) | `rentalYears >= 8 AND rentIncreaseRate <= 0.05` | 50% (장기일반민간임대 8년 기준) | 제한 없음 | 조세특례제한법 §97조의3 |
| R-3 | 신축주택 (`new_housing`) | 항상 | 수도권 50%, 비수도권 100% | 제한 없음 | 조세특례제한법 §99 |
| R-4 | 미분양주택 (`unsold_housing`) | 항상 | 100% (전액) | 제한 없음 | 조세특례제한법 §98 |

**중복 감면 처리 원칙:**

| 원칙 | 내용 |
|------|------|
| 유형별 1개만 | 동일 유형 중복 적용 불가 (reductions 배열에서 type별 첫 번째만 사용) |
| 감면 합계 상한 | `reductionAmount <= calculatedTax` (음수 결정세액 방지) |

---

### 1-G. 메인 함수 흐름표

| 단계 | 호출 함수/로직 | 입력 | 출력 | 절사 적용 | steps 추가 |
|------|--------------|------|------|----------|-----------|
| **STEP 0** | `parseRatesFromMap(rates)` | TaxRatesMap | ParsedRates | — | — |
| **STEP 1** | `checkExemption(input, specialRules)` | input, DB special_rules | `{ isExempt, isPartialExempt }` | — | — |
| **STEP 1a** | `isExempt === true` 조기 반환 | — | 모든 금액 0, totalTax=0 | — | '1세대1주택 비과세' |
| **STEP 2** | `calcTransferGain(input)` | input | `{ gain, usedEstimated }` | — | '양도차익 계산' |
| **STEP 2a** | `gain = max(0, gain)` | gain | 음수 손실 → 0 처리 | — | — |
| **STEP 3** | `calcOneHouseProration` (조건부) | gain, transferPrice | taxableGain | — | '과세 양도차익 (12억 초과분)' |
| **STEP 4** | `calcLongTermHoldingDeduction` | taxableGain, input, rules | `{ deduction, rate }` | — | '장기보유특별공제' |
| **STEP 5** | `calcBasicDeduction` | taxableGain, longTermDed, annualUsed, isUnregistered | basicDeduction | — | '기본공제' |
| **STEP 6** | `taxBase = truncateToThousand(taxableGain - longTermDed - basicDed)` | — | taxBase | **천원 미만 절사** | '과세표준' |
| **STEP 6a** | `taxBase = max(0, taxBase)` | — | 음수 방어 | — | — |
| **STEP 7** | `calcTax(taxBase, parsedRates, input, suspended)` | taxBase 등 | `{ calculatedTax, surchargeType, ... }` | applyRate() 의무 | '산출세액' |
| **STEP 8** | `calcReductions(calculatedTax, reductions, deductionRules)` | calculatedTax, 감면 목록 | `{ reductionAmount, reductionType }` | — | '감면세액' |
| **STEP 9** | `determinedTax = truncateToWon(max(0, calculatedTax - reductionAmount))` | — | determinedTax | **원 미만 절사** | '결정세액' |
| **STEP 10** | `localIncomeTax = applyRate(determinedTax, 0.10)` | — | localIncomeTax | applyRate() (P0-2) | '지방소득세' |
| **STEP 11** | `totalTax = determinedTax + localIncomeTax` | — | totalTax | — | '총 납부세액' |

---

## 파일 2: `app/api/calc/transfer/route.ts`

### 2-A. Zod 입력 스키마 필드 목록

| # | 필드명 | Zod 타입 | 검증 규칙 | 비고 |
|---|--------|----------|----------|------|
| 1 | `propertyType` | `z.enum(['housing','land','building'])` | — | 물건 종류 |
| 2 | `transferPrice` | `z.number().int().positive()` | > 0 | 양도가액 |
| 3 | `transferDate` | `z.string().date()` | YYYY-MM-DD | ISO 날짜 문자열 |
| 4 | `acquisitionPrice` | `z.number().int().nonnegative()` | >= 0 | 0이면 환산취득가 |
| 5 | `acquisitionDate` | `z.string().date()` | YYYY-MM-DD | |
| 6 | `expenses` | `z.number().int().nonnegative()` | >= 0 | 필요경비 |
| 7 | `useEstimatedAcquisition` | `z.boolean()` | — | 환산취득가 사용 여부 |
| 8 | `standardPriceAtAcquisition` | `z.number().int().positive().optional()` | > 0 | 취득시 기준시가 |
| 9 | `standardPriceAtTransfer` | `z.number().int().positive().optional()` | > 0 | 양도시 기준시가 |
| 10 | `householdHousingCount` | `z.number().int().min(1)` | >= 1 | 세대 보유 주택 수 |
| 11 | `residencePeriodMonths` | `z.number().int().nonnegative()` | >= 0 | 거주기간(월) |
| 12 | `isRegulatedArea` | `z.boolean()` | — | 양도일 기준 |
| 13 | `wasRegulatedAtAcquisition` | `z.boolean()` | — | 취득일 기준 |
| 14 | `isUnregistered` | `z.boolean()` | — | 미등기 여부 |
| 15 | `isNonBusinessLand` | `z.boolean()` | — | 비사업용 토지 |
| 16 | `isOneHousehold` | `z.boolean()` | — | 1세대 여부 |
| 17 | `temporaryTwoHouse` | `z.object({...}).optional()` | — | 일시적 2주택 |
| 17a | `└ previousAcquisitionDate` | `z.string().date()` | YYYY-MM-DD | 종전주택 취득일 |
| 17b | `└ newAcquisitionDate` | `z.string().date()` | YYYY-MM-DD | 신규주택 취득일 |
| 18 | `reductions` | `z.array(감면유니온).default([])` | — | 감면 목록 |
| 19 | `annualBasicDeductionUsed` | `z.number().int().nonnegative().default(0)` | >= 0 | 기사용 기본공제 |

**상호 의존 검증 (superRefine):**

| # | 검증 규칙 | 오류 메시지 |
|---|----------|------------|
| V-1 | `useEstimatedAcquisition === true` → `standardPriceAtAcquisition` 필수 | '환산취득가 사용 시 취득시 기준시가 필수' |
| V-2 | `useEstimatedAcquisition === true` → `standardPriceAtTransfer` 필수 | '환산취득가 사용 시 양도시 기준시가 필수' |
| V-3 | `acquisitionDate < transferDate` | '취득일은 양도일보다 이전이어야 합니다' |

### 2-B. Orchestrator 처리 흐름

| 단계 | 처리 내용 | 실패 시 응답 |
|------|----------|------------|
| 1 | `request.json()` 파싱 | 400 `INVALID_JSON` |
| 2 | `inputSchema.safeParse(body)` | 400 `INVALID_INPUT` + fieldErrors |
| 3 | `string → Date` 변환 (`new Date(parsed.transferDate)` 등) | — |
| 4 | `preloadTaxRates(['transfer'], transferDate)` | 500 `TAX_RATE_NOT_FOUND` |
| 5 | `calculateTransferTax(input, rates)` | 500 `TaxCalculationError` |
| 6 | `NextResponse.json({ data: result })` | — |

### 2-C. 응답 구조

| 상황 | HTTP | 응답 Body |
|------|------|----------|
| 성공 | 200 | `{ data: TransferTaxResult }` |
| 입력 오류 | 400 | `{ error: { code: 'INVALID_INPUT', message, fieldErrors? } }` |
| 세율 없음 | 500 | `{ error: { code: 'TAX_RATE_NOT_FOUND', message } }` |
| 계산 오류 | 500 | `{ error: { code: TaxErrorCode, message } }` |

---

## 파일 3: `__tests__/tax-engine/transfer-tax.test.ts`

### 3-A. Mock 세율 데이터 구성 (DB 없이)

| # | Map 키 | 설명 | 값 출처 |
|---|--------|------|---------|
| M-1 | `transfer:progressive_rate:_default` | 누진세율 8구간 | DB 시딩과 동일 |
| M-2 | `transfer:deduction:long_term_holding` | 장기보유특별공제 규칙 | DB 시딩과 동일 |
| M-3 | `transfer:deduction:basic` | 기본공제 (연 250만원) | DB 시딩과 동일 |
| M-4 | `transfer:surcharge:_default` | 중과세율 + 유예 정보 | `suspended_until: '2026-05-09'` |
| M-5 | `transfer:special:one_house_exemption` | 1세대1주택 특례 | `maxExemptPrice: 1_200_000_000` |
| M-6 | `transfer:deduction:self_farming` | 자경농지 감면 | DB 시딩과 동일 |

### 3-B. 테스트 케이스 목록

| # | 테스트 ID | 시나리오 | 핵심 입력 | 검증 항목 | 예상값 |
|---|-----------|---------|---------|----------|--------|
| 1 | **T-01** | 1주택 비과세 (양도가 10억, 비조정) | `isOneHousehold=true`, `count=1`, `transferPrice=1_000_000_000`, `holdingYears=3`, `isRegulatedArea=false` | `isExempt`, `totalTax` | `true`, `0` |
| 2 | **T-02** | 1주택 부분과세 (양도가 15억, 비조정) | `transferPrice=1_500_000_000`, `gain=5억`, `holdingYears=3` | `isExempt`, `taxableGain`, `totalTax > 0` | `false`, `양도차익 × (3억/15억)` |
| 3 | **T-03** | 1주택 장기보유공제 80% (10년 보유+거주) | `holdingYears=10`, `residencePeriodMonths=120`, `isOneHousehold=true` | `longTermHoldingRate`, `longTermHoldingDeduction` | `0.80`, `taxableGain × 0.80` |
| 4 | **T-04** | 1주택 장기보유공제 보유율만 (거주 0개월) | `holdingYears=5`, `residencePeriodMonths=0`, `isOneHousehold=true` | `longTermHoldingRate` | `0.20` (보유 5년 × 4%) |
| 5 | **T-05** | 일반 장기보유공제 (10년, 일반) | `holdingYears=10`, `isOneHousehold=false` | `longTermHoldingRate` | `0.20` (10년 × 2%, max 30%) |
| 6 | **T-06** | 장기보유공제 최대 30% 도달 (15년, 일반) | `holdingYears=15`, `isOneHousehold=false` | `longTermHoldingRate` | `0.30` (상한) |
| 7 | **T-07** | 2주택 조정지역, 유예 기간 중 (일반세율 적용) | `count=2`, `isRegulatedArea=true`, `transferDate=2026-01-01` | `isSurchargeSuspended`, `surchargeType` | `true`, `undefined` |
| 8 | **T-08** | 2주택 조정지역, 유예 종료 후 (중과세 20%p) | `count=2`, `isRegulatedArea=true`, `transferDate=2026-05-10` | `isSurchargeSuspended`, `surchargeType`, `surchargeRate` | `false`, `'multi_house_2'`, `0.20` |
| 9 | **T-09** | 3주택+ 조정지역, 유예 종료 후 (중과세 30%p) | `count=3`, `isRegulatedArea=true`, `transferDate=2026-06-01` | `surchargeType`, `surchargeRate` | `'multi_house_3plus'`, `0.30` |
| 10 | **T-10** | 미등기 양도 (70% 단일세율) | `isUnregistered=true`, `taxBase=1억` | `appliedRate`, `calculatedTax`, `longTermHoldingDeduction`, `basicDeduction` | `0.70`, `70_000_000`, `0`, `0` |
| 11 | **T-11** | 비사업용 토지 (누진+10%p) | `isNonBusinessLand=true`, `taxBase=5_000만` | `surchargeType`, `calculatedTax` | `'non_business_land'`, `누진세액+500만` |
| 12 | **T-12** | 환산취득가 사용 (개산공제 3%) | `useEstimatedAcquisition=true`, `transferPrice=10억`, `priceAtAcq=5억`, `priceAtTransfer=8억` | `usedEstimatedAcquisition`, `transferGain` | `true`, `10억 - 6.25억 - 3%` |
| 13 | **T-13** | 자경농지 8년 감면 (한도 1억) | `reductions=[{type:'self_farming', farmingYears:8}]`, `calculatedTax=2억` | `reductionAmount` | `1억 (한도 적용)` |
| 14 | **T-14** | 기본공제 잔여 50만원 적용 | `annualBasicDeductionUsed=2_000_000` | `basicDeduction` | `500_000` |
| 15 | **T-15** | 기본공제 연간 한도 초과 방어 | `annualBasicDeductionUsed=2_500_000` | `basicDeduction` | `0` |
| 16 | **T-16** | 과세표준 경계: 누진세율 15% 구간 (5,000만원) | `taxBase=50_000_000` | `calculatedTax` | `50_000_000 × 0.15 - 1_260_000 = 6_240_000` |
| 17 | **T-17** | 과세표준 경계: 누진세율 45% 구간 (10억+1원) | `taxBase=1_000_000_001` | `calculatedTax` | `1_000_000_001 × 0.45 - 65_940_000` |
| 18 | **T-18** | 지방소득세 = 결정세액 × 10% | 임의 케이스 | `localIncomeTax === determinedTax × 0.1` | Math.floor 적용값 |
| 19 | **T-19** | 양도 손실 시 세액 0 | `acquisitionPrice > transferPrice` | `transferGain`, `totalTax` | `0`, `0` |
| 20 | **T-20** | 3년 미만 보유 → 장기보유공제 0% | `holdingYears=2` (취득 2021-01-01, 양도 2023-01-01) | `longTermHoldingDeduction` | `0` |
| 21 | **T-21** | 과세표준 천원 미만 절사 검증 | `taxBase 계산 결과 = 50_001_500` | `taxBase` | `50_001_000` |
| 22 | **T-22** | 전액 비과세 시 steps 포함 여부 | `isExempt=true` | `steps.length > 0`, `steps[0].label` | `true`, `'1세대1주택 비과세'` |

---

## 구현 순서 (의존 관계 기반)

| 순서 | 작업 | 의존 | 완료 기준 |
|------|------|------|----------|
| ① | `transfer-tax.ts` — 타입 정의 (1-A) | 없음 | TypeScript 컴파일 통과 |
| ② | `transfer-tax.ts` — `parseRatesFromMap` (H-1) | Zod 스키마, getRate | TaxRateNotFoundError 정상 throw |
| ③ | `transfer-tax.ts` — `checkExemption` (H-2, E-1~E-4) | calculateHoldingPeriod | T-01, T-02 통과 |
| ④ | `transfer-tax.ts` — `calcTransferGain` (H-3) | calculateEstimatedAcquisitionPrice | T-12, T-19 통과 |
| ⑤ | `transfer-tax.ts` — `calcOneHouseProration` (H-4) | calculateProration | T-02 수치 검증 |
| ⑥ | `transfer-tax.ts` — `calcLongTermHoldingDeduction` (H-5, L-1~L-4) | isSurchargeSuspended | T-03~T-06, T-20 통과 |
| ⑦ | `transfer-tax.ts` — `calcBasicDeduction` (H-6) | 없음 | T-10, T-14, T-15 통과 |
| ⑧ | `transfer-tax.ts` — `calcTax` (H-7, T-1~T-4) | calculateProgressiveTax, isSurchargeSuspended | T-07~T-11, T-16~T-17 통과 |
| ⑨ | `transfer-tax.ts` — `calcReductions` (H-8, R-1~R-4) | 없음 | T-13 통과 |
| ⑩ | `transfer-tax.ts` — `calculateTransferTax` 메인 (1-G) | ①~⑨ 전부 | T-18, T-21, T-22 통과 |
| ⑪ | `transfer-tax.test.ts` — T-01~T-22 작성 | ⑩ 완료 | 전체 22개 테스트 통과 |
| ⑫ | `app/api/calc/transfer/route.ts` — Orchestrator (2-A~C) | ⑩ 완료 | TypeScript 컴파일 + 수동 curl 테스트 |

---

## 절사 적용 체크리스트

| 적용 위치 | 함수 | 절사 단위 | 잘못 적용 시 영향 |
|----------|------|----------|----------------|
| 과세표준 확정 (STEP 6) | `truncateToThousand` | 천원 | 과세표준 최대 999원 오차 |
| 산출세액 내부 세율 곱셈 | `applyRate` | 원 | 부동소수점 누적 오차 |
| 결정세액 (STEP 9) | `truncateToWon` | 원 미만 | 소수점 오차 |
| 지방소득세 (STEP 10) | `applyRate(determinedTax, 0.10)` | 원 | 10원 미만 오차 |
| 장기보유공제 금액 | `applyRate(taxableGain, rate)` | 원 | 공제액 과다/과소 |
| 12억 초과분 안분 | `calculateProration` | 원 | 과세소득 오차 |
