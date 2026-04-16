# 종합부동산세 구현 TODO 목록

> 생성일: 2026-04-16
> 담당 에이전트: comprehensive-tax-senior (오케스트레이터), comprehensive-tax-house-senior, comprehensive-tax-exclusion-senior, comprehensive-tax-land-aggregate-senior, comprehensive-tax-separate-land-senior
> 설계 참조: `docs/02-design/features/korean-tax-calc-engine.design.md` § 3.6
> 목표 완료: 종합부동산세 계산 엔진 + API + UI 전체 구현

---

## Phase 1 — 기반 준비

### T-01: 법령 상수 추가 (`legal-codes.ts`)
- **파일**: `lib/tax-engine/legal-codes.ts`
- **담당**: comprehensive-tax-house-senior + comprehensive-tax-exclusion-senior + comprehensive-tax-land-aggregate-senior
- **내용**:
  - `COMPREHENSIVE.*` — 주택분 종부세 법령 상수
  - `COMPREHENSIVE_LAND.*` — 토지분 법령 상수 (종합합산·별도합산)
  - `COMPREHENSIVE_EXCL.*` — 합산배제 법령 상수
  - `COMPREHENSIVE_EXCL_CONST.*` — 합산배제 수치 상수 (임대료 기준, 면적 기준 등)
- **완료 기준**: 문자열 리터럴 직접 사용 없이 상수로 모든 법령 조문 참조 가능

### T-02: 타입 파일 생성 (`types/comprehensive.types.ts`)
- **파일**: `lib/tax-engine/types/comprehensive.types.ts` (신규)
- **담당**: comprehensive-tax-senior
- **내용**:
  - `ComprehensiveProperty` — 개별 주택 입력 타입
  - `ComprehensiveTaxInput` — 전체 입력 (주택 목록 + 토지 + 세부담상한)
  - `PropertyForExclusion` / `ExclusionType` / `ExclusionResult` / `AggregationExclusionResult`
  - `OneHouseDeductionResult`
  - `TaxCapResult`
  - `PropertyTaxCredit`
  - `AggregateLandTaxInput` / `AggregateLandTaxResult`
  - `SeparateAggregateLandForComprehensive` / `SeparateAggregateLandTaxResult`
  - `ComprehensiveTaxResult` — 전체 출력 타입
- **완료 기준**: TypeScript strict mode 오류 없음, 모든 에이전트 파일에서 import 가능

### T-03: `truncateToTenThousand` 유틸 확인/추가 (`tax-utils.ts`)
- **파일**: `lib/tax-engine/tax-utils.ts`
- **담당**: comprehensive-tax-senior
- **내용**: 종부세 과세표준 절사 — 만원 미만 절사 (`Math.floor(x / 10_000) * 10_000`)
- **완료 기준**: 기존 `truncateToThousand`와 별도로 `truncateToTenThousand` export 확인

### T-04: Zod 입력 스키마 작성 (`comprehensive-input.ts`)
- **파일**: `lib/validators/comprehensive-input.ts` (신규)
- **담당**: comprehensive-tax-senior
- **내용**:
  - `comprehensivePropertySchema` — 개별 주택 (공시가격, 면적, 도시지역여부, 합산배제유형)
  - `exclusionInfoSchema` — 합산배제 세부 정보 (임대정보, 기타 정보)
  - `aggrerateLandSchema` — 종합합산 토지 (공시지가합산, 재산세 데이터)
  - `separateLandSchema` — 별도합산 토지 배열
  - `comprehensiveTaxInputSchema` — 전체 입력 스키마 (z.discriminatedUnion 또는 z.object)
- **완료 기준**: safeParse로 유효하지 않은 입력 감지, TS 타입 추론 정상 동작

---

## Phase 2 — 핵심 엔진 구현

### T-05: 합산배제 판정 모듈 (`comprehensive-tax.ts`)
- **파일**: `lib/tax-engine/comprehensive-tax.ts`
- **담당**: comprehensive-tax-exclusion-senior
- **함수**:
  - `validateRentalExclusion(input: RentalExclusionInput): ExclusionValidationResult`
    - 임대등록 여부 확인
    - 면적 요건 (85㎡ 이하)
    - 가격 요건 (수도권 6억/9억, 비수도권 3억)
    - 임대료 증가율 5% 이내 검증
    - 임대 개시 여부
  - `validateOtherExclusion(prop, type, info): ExclusionValidationResult`
    - 미분양주택 (최초매각 + 5년 이내)
    - 가정어린이집 (인가증 + 실사용)
    - 사원용 (시세 50% 이하 + 85㎡ 이하)
  - `applyAggregationExclusion(properties, assessmentDate): AggregationExclusionResult`
    - 각 주택별 유형 분기 → 검증 → 결과 집계
- **완료 기준**: T-09~T-15 테스트 케이스 모두 통과

### T-06: 주택분 1세대1주택 세액공제 (`comprehensive-tax.ts`)
- **파일**: `lib/tax-engine/comprehensive-tax.ts`
- **담당**: comprehensive-tax-house-senior
- **함수**:
  - `getSeniorRate(birthDate: Date, assessmentDate: Date): number`
    - 과세기준일 기준 만 나이 계산 → 0 / 0.2 / 0.3 / 0.4 반환
  - `getLongTermRate(acquisitionDate: Date, assessmentDate: Date): number`
    - 실제 보유기간 계산 → 0 / 0.2 / 0.4 / 0.5 반환
  - `applyOneHouseDeduction(calculatedTax, birthDate, acquisitionDate, assessmentDate): OneHouseDeductionResult`
    - 합산공제율 = seniorRate + longTermRate
    - 최종공제율 = Math.min(합산, 0.80)
    - 공제금액 = Math.floor(산출세액 × 최종공제율)
- **완료 기준**: T01~T05 테스트 케이스 통과 (특히 80% 상한 케이스)

### T-07: 주택분 세부담 상한 (`comprehensive-tax.ts`)
- **파일**: `lib/tax-engine/comprehensive-tax.ts`
- **담당**: comprehensive-tax-house-senior
- **함수**:
  - `applyTaxCap(comprehensiveTax, totalPropertyTax, previousYearTotalTax, isMultiHouseInAdjustedArea): TaxCapResult | undefined`
    - undefined 반환 → 전년도 세액 미입력
    - capRate = isMultiHouseInAdjustedArea ? 3.0 : 1.5
    - capAmount = Math.floor(previousYearTotalTax × capRate)
    - cappedTax = Math.max(Math.min(compTax, capAmount - propertyTax), 0)
- **완료 기준**: T06~T10 테스트 케이스 통과 (음수 방어, 0원 케이스 포함)

### T-08: 비율 안분 공제 공통 함수 (`comprehensive-tax.ts`)
- **파일**: `lib/tax-engine/comprehensive-tax.ts`
- **담당**: comprehensive-tax-senior
- **함수**:
  - `calculateProration(propertyTaxAmount, comprehensiveTaxBase, propertyTaxBase): PropertyTaxCredit`
    - 분모 0 방어 → ratio = 0, creditAmount = 0
    - ratio = Math.min(comprehensiveTaxBase / propertyTaxBase, 1.0)
    - creditAmount = Math.floor(propertyTaxAmount × comprehensiveTaxBase / propertyTaxBase)
    - creditAmount = Math.min(creditAmount, 산출세액) — 산출세액 초과 불가
- **완료 기준**: 정수 연산 정확성 + 분모0 + 비율1.0 상한 테스트 통과

### T-09: 종합합산 토지분 계산 모듈 (`comprehensive-tax.ts`)
- **파일**: `lib/tax-engine/comprehensive-tax.ts`
- **담당**: comprehensive-tax-land-aggregate-senior
- **함수**:
  - `calcAggregateLandTaxBase(totalOfficialValue, fairMarketRatio): number`
    - (합산 - 5억) × 100% → truncateToTenThousand
  - `calcAggregateLandTaxAmount(taxBase): number`
    - 3단계 누진세율 (1%/2%/3%) 적용
  - `applyAggregateLandTaxCap(compTax, propertyTax, prevYearTax): TaxCapResult | undefined`
    - 150% 단일 상한
  - `calculateAggregateLandTax(input: AggregateLandTaxInput, rates): AggregateLandTaxResult`
    - 납세의무 판정 (5억 초과 여부)
    - 전체 흐름: 과세표준 → 세율 → 비율안분 → 상한 → 농특세
- **완료 기준**: T01~T21 테스트 케이스 통과 (주택분 60%/토지분 100% 혼동 방지 포함)

### T-10: 별도합산 토지분 계산 모듈 (`comprehensive-separate-land.ts` 신규)
- **파일**: `lib/tax-engine/comprehensive-separate-land.ts` (신규 생성)
- **담당**: comprehensive-tax-separate-land-senior
- **함수**:
  - `applySeparateAggregateLandRate(taxBase): { appliedRate, progressiveDeduction, calculatedTax }`
    - 3단계 누진세율 (0.5%/0.6%/0.7%)
  - `applySeparateLandPropertyTaxCredit(calculatedTax, propertyTaxAmount, propertyTaxBase, comprehensiveTaxBase)`
    - 비율 안분, 분모 0 방어, creditAmount ≤ calculatedTax
  - `calculateSeparateAggregateLandTax(input, rates): SeparateAggregateLandTaxResult`
    - 납세의무 판정 (80억 초과)
    - 과세표준: (합산 - 80억) × 100% → 만원절사
    - 세율 → 비율안분 → 농특세 (세부담 상한 없음)
- **완료 기준**: T01~T15 테스트 케이스 통과 (주택분과의 차이점 명확히 구분)

### T-11: 메인 엔진 통합 (`comprehensive-tax.ts`)
- **파일**: `lib/tax-engine/comprehensive-tax.ts`
- **담당**: comprehensive-tax-senior
- **함수**:
  - `calculateComprehensiveTax(input: ComprehensiveTaxInput, rates: TaxRatesMap): ComprehensiveTaxResult`
    1. Step 0: applyAggregationExclusion
    2. Step 1~9: 주택분 계산 (각 서브 함수 순차 호출 + property-tax.ts 내부 호출)
    3. Step A: calculateAggregateLandTax (landAggregate 있을 때)
    4. Step B: calculateSeparateAggregateLandTax (landSeparate 있을 때)
    5. 최종 합산: grandTotal 산출
- **완료 기준**: 통합 테스트 시나리오 (1세대1주택 15억, 전체 흐름) 정확 계산

---

## Phase 3 — API Route

### T-12: API Route 구현 (`app/api/calc/comprehensive/route.ts`)
- **파일**: `app/api/calc/comprehensive/route.ts` (신규)
- **담당**: comprehensive-tax-senior
- **내용**:
  - Rate Limiting: `checkRateLimit('comprehensive:${ip}', { limit: 30, windowMs: 60_000 })`
  - JSON 파싱 오류 처리
  - Zod 검증: `comprehensiveTaxInputSchema.safeParse(body)`
  - 세율 프리로드: `preloadTaxRates(['comprehensive_property', 'property'], taxBaseDate)`
    - Supabase 미설정 시 graceful skip (내부 상수 fallback)
  - `calculateComprehensiveTax(input, rates)` 호출
  - 에러 처리: `TaxCalculationError` → 422, 기타 → 500
  - 이력 저장: `saveCalculation({ taxType: 'comprehensive', ... })` 비동기 non-blocking
- **완료 기준**: `curl -X POST /api/calc/comprehensive -d '{...}'` 정상 응답

---

## Phase 4 — UI (StepWizard)

### T-13: UI 상태 스토어 확장 (`calc-wizard-store.ts`)
- **파일**: `lib/stores/calc-wizard-store.ts`
- **담당**: comprehensive-tax-senior
- **내용**:
  - `comprehensiveInput` 슬라이스 추가 (주택목록, 토지, 상한 등)
  - zustand sessionStorage persist (result 제외)
  - 주택 목록 add/remove/update 액션

### T-14: 주택 목록 입력 컴포넌트 (`PropertyListInput.tsx`)
- **파일**: `components/calc/PropertyListInput.tsx` (신규)
- **담당**: comprehensive-tax-senior
- **내용**:
  - 주택 추가/삭제 버튼
  - 각 주택: 공시가격(CurrencyInput), 전용면적, 도시지역 여부, 합산배제 유형 선택
  - 합산 공시가격 실시간 표시
  - 5건 이상 성능 보장 (1초 이내)
  - SelectOnFocusProvider 자동 적용 (onFocus 개별 추가 불필요)

### T-15: 합산배제 상세 입력 컴포넌트 (`ExclusionInfoInput.tsx`)
- **파일**: `components/calc/ExclusionInfoInput.tsx` (신규)
- **담당**: comprehensive-tax-exclusion-senior
- **내용**:
  - 합산배제 유형별 조건부 입력 필드
  - 임대주택: 등록일, 임대개시일, 임대료 증가율, 수도권 여부
  - 미분양주택: 모집공고일, 취득일, 최초매각 여부
  - 신고 기간 안내 배너 (9/16~9/30)
  - 요건 미충족 시 경고 메시지 실시간 표시

### T-16: 종합부동산세 계산기 메인 페이지 (`page.tsx`)
- **파일**: `app/calc/comprehensive-tax/page.tsx`
- **담당**: comprehensive-tax-senior
- **내용** (StepWizard 패턴):
  - **Step 1**: 기본정보 (1세대1주택 여부, 생년월일, 취득일, 과세기준연도)
  - **Step 2**: 주택 목록 입력 (PropertyListInput)
  - **Step 3**: 합산배제 신청 (선택, ExclusionInfoInput)
  - **Step 4**: 토지 정보 (종합합산/별도합산, 선택)
  - **Step 5**: 세부담 상한 (전년도 세액, 선택)
  - **공통**: 뒤로/다음 버튼, Step 1 뒤로 = 홈(`/`)
  - DateInput 컴포넌트 사용 (type="date" 금지)

### T-17: 결과 화면 컴포넌트 (`ComprehensiveTaxResultView.tsx`)
- **파일**: `components/calc/results/ComprehensiveTaxResultView.tsx` (신규)
- **담당**: comprehensive-tax-senior
- **내용**:
  - 재산세↔종부세 연동 결과 시각화 (비율 안분 공제 강조)
  - 합산배제 적용 내역 표시
  - 1세대1주택 세액공제 breakdown
  - 세부담 상한 적용 여부 표시
  - 토지분 결과 (종합합산/별도합산) 별도 섹션
  - 최종 납부세액 합계 (종부세 + 재산세 + 농특세)
  - "세무사 상담 권장" 안내 배너 (v1.3 scope 한계)
  - 로그인 시 이력 저장/PDF 버튼 표시

---

## Phase 5 — 테스트

### T-18: 합산배제 판정 테스트
- **파일**: `__tests__/tax-engine/comprehensive-aggregation-exclusion.test.ts` (신규)
- **케이스**: T01~T15 (에이전트 파일 §9 기준)
  - 수도권/비수도권 가격 기준, 면적 요건, 임대료 증가율
  - 미분양주택 5년 기간, 가정어린이집, 사원용
  - 합산배제 후 과세표준 계산 통합

### T-19: 1세대1주택 공제 + 세부담 상한 테스트
- **파일**: `__tests__/tax-engine/comprehensive-house-deduction.test.ts` (신규)
- **케이스**: 고령자 40%+장기보유 50%=90%→80% 상한, 생일 경계값, 0원 케이스

### T-20: 종합합산 토지분 테스트
- **파일**: `__tests__/tax-engine/comprehensive-land-aggregate.test.ts` (신규)
- **케이스**: 5억 경계, 누진세율 3구간, 비율 안분 분모0, 세부담 상한 음수 방어

### T-21: 별도합산 토지분 테스트
- **파일**: `__tests__/tax-engine/comprehensive-separate-land.test.ts` (신규)
- **케이스**: 80억 경계, 세율 3구간, 비율 안분 상한, 세부담 상한 없음 확인

### T-22: 통합 시나리오 테스트 (재산세↔종부세 연동)
- **파일**: `__tests__/tax-engine/comprehensive-tax-integration.test.ts` (신규)
- **케이스**:
  - 1세대1주택 12억 이하 → 종부세 0원
  - 1세대1주택 15억 / 70세 / 15년 보유 (전체 흐름 수동 계산 비교)
  - 3주택 합산 과세 (다주택 세부담 상한 300%)
  - 합산배제 1주택 포함 → 배제 후 과세표준 확인
  - 5주택 성능 테스트 (1초 이내)

---

## Phase 6 — DB 세율 데이터 확인

### T-23: `tax_rates` 테이블 종합부동산세 데이터 검증
- **파일**: `scripts/` 또는 Supabase SQL 직접 실행
- **확인 키**:
  - `comprehensive_property:housing:basic_deduction_general` → 9억
  - `comprehensive_property:housing:basic_deduction_one_house` → 12억
  - `comprehensive_property:housing:fair_market_ratio` → 0.60
  - `comprehensive_property:housing:rate_brackets` → 7단계 세율 jsonb
  - `comprehensive_property:housing:tax_cap_rate_general` → 1.5
  - `comprehensive_property:housing:tax_cap_rate_multi_house` → 3.0
  - `comprehensive_property:land_aggregate:*` → 종합합산 세율
  - `comprehensive_property:land_separate:*` → 별도합산 세율
- **완료 기준**: preloadTaxRates 호출 시 모든 키 정상 조회

---

## 구현 순서 권고

```
T-01 → T-02 → T-03 (기반)
  → T-04 (Zod 스키마)
  → T-05 (합산배제)
  → T-06, T-07 (주택분 공제/상한)
  → T-08 (비율 안분)
  → T-09 (종합합산 토지)
  → T-10 (별도합산 토지)
  → T-11 (메인 엔진 통합) + T-18~T-22 (테스트)
  → T-12 (API Route)
  → T-23 (DB 세율 검증)
  → T-13~T-17 (UI)
```

---

## 완료 체크리스트 (Gap Analysis 기준)

> 최종 점검: 2026-04-16 — 전체 ✅

- [x] `lib/tax-engine/comprehensive-tax.ts` 생성 및 순수 함수 구현
- [x] `lib/tax-engine/comprehensive-separate-land.ts` 신규 생성
- [x] `lib/tax-engine/types/comprehensive.types.ts` 신규 생성
- [x] `lib/tax-engine/legal-codes.ts` — COMPREHENSIVE, COMPREHENSIVE_LAND, COMPREHENSIVE_EXCL 상수 추가
- [x] `lib/tax-engine/tax-utils.ts` — `truncateToTenThousand` 확인/추가
- [x] `lib/validators/comprehensive-input.ts` — Zod 스키마
- [x] `app/api/calc/comprehensive/route.ts` — Orchestrator
- [x] `app/calc/comprehensive-tax/page.tsx` — StepWizard UI
- [x] `components/calc/PropertyListInput.tsx` — 다주택 목록 입력
- [x] `components/calc/ExclusionInfoInput.tsx` — 합산배제 입력
- [x] `components/calc/results/ComprehensiveTaxResultView.tsx` — 결과 화면
- [x] `__tests__/tax-engine/comprehensive-*.test.ts` — 테스트 파일 5개 (84 케이스)
- [x] DB `tax_rates` 데이터 검증 (comprehensive_property:* 키) — seed 파일 생성 완료
- [x] `npm test` 전체 통과 (988개, 35파일)
- [x] `npm run build` 빌드 성공
