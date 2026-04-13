# Korean Tax Calc — 계산 엔진 & API 설계 (Design Document)

> PDCA Design Phase | 2026-04-14
> Plan Reference: `docs/01-plan/features/korean-tax-calc.plan.md`
> DB Schema Reference: `docs/02-design/features/korean-tax-calc-db-schema.design.md`
> Architecture: **2-Layer (Orchestrator + Pure Engine)** — Plan 원안 유지
> Tech Stack: Next.js 15 Route Handlers + TypeScript 5.x strict + Zod + date-fns

---

## Context Anchor

| Dimension | Content |
|-----------|---------|
| **WHY** | 6대 세금 계산 로직을 테스트 가능하고 유지보수 가능한 구조로 설계. DB 의존성을 순수 엔진에서 분리하여 단위 테스트 시 mock 불필요 |
| **WHO** | 프론트엔드 개발자(API 호출), 계산 엔진 개발자(순수 함수 구현), QA(테스트 케이스 작성) |
| **RISK** | 세금간 연동 시 순환 의존, 정수 연산 오버플로우, 절사 시점 오류로 인한 세액 불일치 |
| **SUCCESS** | 6대 세금 엔진 모두 순수 함수, 재산세↔종부세 연동 정확, 경계값 테스트 100% 통과 |
| **SCOPE** | 계산 엔진 인터페이스, API Route 명세, 공통 유틸, 에러 체계, 연동 흐름 |

---

## 1. 아키텍처 개요: 2-Layer 설계

```
┌─────────────────────────────────────────────────────────┐
│  Client (Browser)                                       │
│  POST /api/calc/{tax-type}  ←  JSON body                │
└──────────────────┬──────────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────────┐
│  Layer 1: Orchestrator (API Route Handler)               │
│                                                         │
│  1. Zod 입력 검증                                        │
│  2. preloadTaxRates() — DB에서 세율 일괄 로드 (1~2회)     │
│  3. 순수 계산 엔진 호출 (세율 데이터를 매개변수로 전달)      │
│  4. 결과 반환 (+ 선택적 이력 저장)                        │
│                                                         │
│  파일: app/api/calc/{tax-type}/route.ts                  │
└──────────────────┬──────────────────────────────────────┘
                   │ rates: TaxRateData
                   ▼
┌─────────────────────────────────────────────────────────┐
│  Layer 2: Pure Engine (순수 함수)                         │
│                                                         │
│  - DB 직접 호출 없음                                     │
│  - 세율 데이터를 매개변수로 받아 순수 계산만 수행            │
│  - 부수효과 없음 → 동일 입력 = 동일 출력                  │
│  - 테스트 시 DB mock 불필요                              │
│                                                         │
│  파일: lib/tax-engine/{tax-type}.ts                      │
└─────────────────────────────────────────────────────────┘
```

### 1.1 핵심 설계 원칙

| 원칙 | 설명 |
|------|------|
| **순수 함수** | 계산 엔진은 외부 상태(DB, API, 환경변수)에 접근하지 않음 |
| **매개변수 주입** | 세율 데이터는 Orchestrator가 로드하여 엔진에 전달 |
| **정수 연산** | 모든 금액은 원(정수) 단위. 부동소수점 회피. 곱셈 먼저 후 나눗셈 |
| **단계별 절사** | 세금별 절사 시점과 단위가 다름 — 각 엔진이 정확한 시점에 절사 호출 |
| **단방향 의존** | comprehensive-tax → property-tax 호출은 허용. 역방향 금지 |

---

## 2. 공통 모듈

### 2.1 세율 로드 — `lib/db/tax-rates.ts`

```typescript
// 복수 세금 타입 일괄 조회 (RPC 1회 호출)
async function preloadTaxRates(
  taxTypes: TaxType[],
  targetDate: Date
): Promise<TaxRateMap>

// 단일 규칙 조회 (편의 함수)
function getRate(
  map: TaxRateMap,
  taxType: TaxType,
  category: TaxCategory,
  subCategory?: string         // 기본값 '_default'
): TaxRateRow | undefined

// 동일 category 전체 조회 (공제/감면 등 복수 규칙)
function getRatesByCategory(
  map: TaxRateMap,
  taxType: TaxType,
  category: TaxCategory
): TaxRateRow[]
```

**`TaxRateMap` 구조:**

```typescript
type TaxType =
  | 'transfer'
  | 'inheritance'
  | 'gift'
  | 'acquisition'
  | 'property'
  | 'comprehensive_property';

type TaxCategory =
  | 'progressive_rate'
  | 'deduction'
  | 'surcharge'
  | 'special'
  | 'fair_market_ratio';

// preloadTaxRates 반환 타입
// key: `${tax_type}:${category}:${sub_category}`
type TaxRateMap = Map<string, TaxRateRow>;

interface TaxRateRow {
  id: string;
  tax_type: TaxType;
  category: TaxCategory;
  sub_category: string;        // 동일 category 내 세부 규칙 구분
  effective_date: string;
  rate_table: unknown;         // Zod safeParse로 타입 확정
  deduction_rules: unknown;
  special_rules: unknown;
  is_active: boolean;
}
```

**쿼리 전략 — Supabase RPC:**

`DISTINCT ON`은 PostgreSQL 전용 구문으로 Supabase JS 클라이언트의 `.select()`로는 사용 불가.
따라서 **DB Function**으로 구현하고 `supabase.rpc()`로 호출한다.

```sql
-- DB Function (Supabase migration에 포함)
CREATE OR REPLACE FUNCTION preload_tax_rates(
  p_tax_types text[],
  p_target_date date
)
RETURNS SETOF tax_rates
LANGUAGE sql STABLE
AS $$
  SELECT DISTINCT ON (tax_type, category, sub_category)
    *
  FROM tax_rates
  WHERE tax_type = ANY(p_tax_types)
    AND effective_date <= p_target_date
    AND is_active = true
  ORDER BY tax_type, category, sub_category, effective_date DESC;
$$;
```

```typescript
// TypeScript 호출
const { data, error } = await supabase.rpc('preload_tax_rates', {
  p_tax_types: ['transfer'],
  p_target_date: '2026-04-14',
});

// 사용 예시
const rates = await preloadTaxRates(['transfer'], transferDate);
const progressive = getRate(rates, 'transfer', 'progressive_rate');        // 1건
const allDeductions = getRatesByCategory(rates, 'transfer', 'deduction');  // 복수건
const longTermHolding = getRate(rates, 'transfer', 'deduction', 'long_term_holding');
```

### 2.2 공통 유틸 — `lib/tax-engine/tax-utils.ts`

```typescript
// ── 누진세율 계산 (공통) ──
function applyProgressiveRate(
  taxBase: number,
  brackets: ProgressiveBracket[]
): number
// 과세표준에 누진세율 적용 → 산출세액 반환
// 구현: Math.floor(taxBase × rate) - deduction (누진공제 방식)
// ⚠️ 중요: rate × taxBase 곱셈 직후 Math.floor()로 원 미만 절사 필수
//    (부동소수점 오차 누적 방지 — P0-2 참고)

interface ProgressiveBracket {
  min?: number;   // 하한 (없으면 0)
  max?: number;   // 상한 (없으면 무한)
  rate: number;   // 세율 (소수)
  deduction: number; // 누진공제액
}

// ── 중간 절사 규칙 (P0-2) ──
// ⚠️ 부동소수점 안전 원칙: 소수 세율(rate)과 금액(amount)의
//    곱셈 결과는 **즉시** Math.floor()로 원 미만을 절사한다.
//    이를 지키지 않으면 0.38 × 100_000_000 = 37_999_999.99999... 같은
//    부동소수점 오차가 후속 연산에 누적된다.
//
// 적용 대상:
//   - applyProgressiveRate 내부: Math.floor(taxBase * rate) - deduction
//   - 공정시장가액비율 적용: Math.floor(assessedValue * fairMarketRatio)
//   - 세액공제율 적용: Math.floor(calculatedTax * deductionRate)
//   - 세부담 상한 적용: Math.floor(previousTax * capRate)
//   - 할증 적용: Math.floor(baseTax * surchargeRate)
//
// 구현 헬퍼:
function applyRate(amount: number, rate: number): number
// 구현: Math.floor(amount * rate)
// 모든 세율 곱셈에 이 헬퍼를 사용하여 일관성 보장

// ── 절사 유틸 ──
function truncateToThousand(amount: number): number
// 천원 미만 절사 — 양도세·재산세·취득세·상속세·증여세 과세표준
// 구현: Math.floor(amount / 1000) * 1000

function truncateToTenThousand(amount: number): number
// 만원 미만 절사 — 종합부동산세 과세표준
// 구현: Math.floor(amount / 10000) * 10000

function truncateToWon(amount: number): number
// 원 미만 절사 — 산출세액 (공통)
// 구현: Math.floor(amount)

// ── 보유기간 계산 ──
function calculateHoldingPeriod(
  acquisitionDate: Date,
  disposalDate: Date
): { years: number; months: number; days: number }
// 세법상 기산일: 취득일 다음날 ~ 양도일 (민법 초일불산입)
// date-fns intervalToDuration 사용 후 기산일 보정 (+1일)

// ── 정수 안전 연산 ──
function safeMultiplyThenDivide(
  a: number,
  b: number,
  c: number
): number
// (a × b) / c — 곱셈 먼저 수행하여 정밀도 유지
// Number.MAX_SAFE_INTEGER 초과 시 BigInt fallback
// c === 0 방어: 0 반환

// ── 비율 연산 (안분 공제용) ──
function calculateProration(
  amount: number,
  numerator: number,
  denominator: number
): number
// amount × numerator / denominator
// denominator === 0 방어: 0 반환
// 비율 상한: min(numerator / denominator, 1.0) 적용
```

### 2.3 에러 체계 — `lib/tax-engine/tax-errors.ts`

```typescript
// 에러 코드 enum
enum TaxErrorCode {
  // 공통
  TAX_RATE_NOT_FOUND = 'TAX_RATE_NOT_FOUND',
  INVALID_INPUT = 'INVALID_INPUT',
  CALC_TIMEOUT = 'CALC_TIMEOUT',
  RATE_SCHEMA_MISMATCH = 'RATE_SCHEMA_MISMATCH',

  // 양도소득세
  REGULATED_AREA_LOOKUP_FAILED = 'REGULATED_AREA_LOOKUP_FAILED',

  // 상속세
  INVALID_HEIR_COMPOSITION = 'INVALID_HEIR_COMPOSITION',

  // 종부세 연동
  PROPERTY_TAX_CALC_FAILED = 'PROPERTY_TAX_CALC_FAILED',
  PRORATION_DENOMINATOR_ZERO = 'PRORATION_DENOMINATOR_ZERO',
}

class TaxCalculationError extends Error {
  constructor(
    public code: TaxErrorCode,
    message: string,
    public details?: Record<string, unknown>
  ) {
    super(message);
  }
}
```

### 2.4 Zod 검증 스키마 — `lib/tax-engine/schemas/rate-table.schema.ts`

```typescript
// 누진세율 구간
const progressiveBracketSchema = z.object({
  min: z.number().int().nonnegative().optional(),
  max: z.number().int().positive().optional(),
  rate: z.number().min(0).max(1),
  deduction: z.number().int().nonnegative(),
});

const progressiveRateTableSchema = z.object({
  brackets: z.array(progressiveBracketSchema).min(1),
});

// 세율 Zod 검증 유틸
function parseRateTable<T extends z.ZodSchema>(
  raw: unknown,
  schema: T
): z.infer<T> {
  const result = schema.safeParse(raw);
  if (!result.success) {
    throw new TaxCalculationError(
      TaxErrorCode.RATE_SCHEMA_MISMATCH,
      `세율 데이터 검증 실패: ${result.error.message}`
    );
  }
  return result.data;
}
```

---

## 3. 개별 세금 엔진 인터페이스

### 3.1 양도소득세 — `lib/tax-engine/transfer-tax.ts`

```typescript
// ── 입력 ──
interface TransferTaxInput {
  propertyType: 'housing' | 'land' | 'building';
  transferPrice: number;          // 양도가액 (원)
  transferDate: Date;             // 양도일
  acquisitionPrice: number;       // 취득가액 (원, 0이면 환산취득가 사용)
  acquisitionDate: Date;          // 취득일
  expenses: number;               // 필요경비 (원)

  // 환산취득가 (취득가액 불명 시)
  useEstimatedAcquisition: boolean;
  standardPriceAtAcquisition?: number;  // 취득시 기준시가
  standardPriceAtTransfer?: number;     // 양도시 기준시가

  // 보유 상황
  householdHousingCount: number;  // 세대 보유 주택 수
  residencePeriodMonths: number;  // 거주기간 (월)
  isRegulatedArea: boolean;       // 조정대상지역 여부 (양도일 기준)
  wasRegulatedAtAcquisition: boolean; // 취득일 기준 조정대상지역 여부

  // 중과 관련
  isUnregistered: boolean;        // 미등기 여부
  isNonBusinessLand: boolean;     // 비사업용토지 여부

  // 비과세 특례
  isOneHousehold: boolean;        // 1세대 여부
  temporaryTwoHouse?: {           // 일시적 2주택
    previousAcquisitionDate: Date;
    newAcquisitionDate: Date;
  };

  // 감면
  reductions: TransferReduction[];

  // 기본공제
  annualBasicDeductionUsed: number; // 당해 연도 기사용 기본공제 (원)
}

type TransferReduction =
  | { type: 'self_farming'; farmingYears: number }
  | { type: 'long_term_rental'; rentalYears: number; rentIncreaseRate: number }
  | { type: 'new_housing'; region: 'metropolitan' | 'non_metropolitan' }
  | { type: 'unsold_housing'; region: 'non_metropolitan' };

// ── 출력 ──
interface TransferTaxResult {
  // 비과세 판단
  isExempt: boolean;
  exemptReason?: string;

  // 양도차익 계산
  transferGain: number;              // 양도차익
  taxableGain: number;               // 과세 대상 양도차익 (12억 초과분)
  usedEstimatedAcquisition: boolean; // 환산취득가 사용 여부

  // 공제
  longTermHoldingDeduction: number;  // 장기보유특별공제
  longTermHoldingRate: number;       // 적용된 공제율
  basicDeduction: number;            // 기본공제 (최대 250만원 - 기사용분)

  // 과세표준 및 세액
  taxBase: number;                   // 과세표준 (천원 미만 절사)
  appliedRate: number;               // 적용 세율
  progressiveDeduction: number;      // 누진공제액
  calculatedTax: number;             // 산출세액

  // 중과세
  surchargeType?: 'multi_house_2' | 'multi_house_3plus' | 'non_business_land' | 'unregistered';
  surchargeRate?: number;            // 추가 세율
  isSurchargeSuspended: boolean;     // 중과세 유예 여부

  // 감면
  reductionAmount: number;           // 감면세액
  reductionType?: string;

  // 최종
  determinedTax: number;             // 결정세액 (원 미만 절사)
  localIncomeTax: number;            // 지방소득세 (결정세액의 10%)
  totalTax: number;                  // 총 납부세액

  // 계산 과정 추적
  steps: CalculationStep[];
}

interface CalculationStep {
  label: string;       // 예: '양도차익 계산'
  formula: string;     // 예: '양도가액 - 취득가액 - 필요경비'
  amount: number;      // 결과 금액
}
```

**계산 흐름:**

```
calculateTransferTax(input, rates) → TransferTaxResult

1. 비과세 판단
   ├─ 1세대1주택? → 보유 2년+ & (비조정 or 거주 2년+) & 양도가 12억 이하 → 전액 비과세
   ├─ 일시적 2주택? → 3년 내(조정 2년, 2022.5.10 이후 완화) 종전주택 양도 → 비과세
   └─ 2017.8.3 이전 취득 경과규정 확인

2. 양도차익 계산
   ├─ 취득가 불명 시 환산취득가: 양도가 × (취득시 기준시가 ÷ 양도시 기준시가)
   ├─ 환산 시 필요경비 = 개산공제 (토지·건물 3%)
   └─ 양도차익 = 양도가 - 취득가 - 필요경비

3. 12억 초과분 과세 비율 적용 (1세대1주택 + 양도가 12억 초과 시)
   └─ 과세 양도차익 = 양도차익 × (양도가 - 12억) ÷ 양도가

4. 장기보유특별공제 (중과세 대상 시 배제)
   ├─ 일반: 연 2% (최대 30%, 3년 이상)
   └─ 1주택: 보유 연 4%(40%) + 거주 연 4%(40%) = 최대 80%

5. 기본공제 (연간 250만원 한도 - 기사용분, 미등기 시 배제)

6. 과세표준 = 과세 양도차익 - 장기보유공제 - 기본공제
   └─ truncateToThousand() 적용

7. 세액 결정
   ├─ 미등기: 70% 단일세율
   ├─ 중과세: 누진세율 + 추가세율 (유예 여부 DB 확인)
   └─ 일반: 누진세율 (6~45%)

8. 감면 적용 (조세특례제한법)

9. 결정세액 = truncateToWon(산출세액 - 감면세액)
10. 지방소득세 = 결정세액 × 10%
11. 총 납부세액 = 결정세액 + 지방소득세
```

### 3.2 취득세 — `lib/tax-engine/acquisition-tax.ts`

```typescript
// ── 입력 ──
interface AcquisitionTaxInput {
  acquirerType: 'individual' | 'corporation';
  propertyType: 'housing' | 'land' | 'building';
  acquisitionCause: 'purchase' | 'inheritance' | 'gift' | 'original' | 'auction';
  acquisitionPrice: number;         // 취득가액 (원)
  acquisitionDate: Date;
  areaSqm: number;                  // 전용면적 (㎡, 농특세 면제 판단)
  isFarmland: boolean;              // 농지 여부 (상속 시 2.3%)

  // 중과 관련
  householdHousingCount: number;
  isRegulatedArea: boolean;         // 취득일 기준 조정대상지역
  isLuxuryProperty: boolean;        // 사치성 재산

  // 감면
  isFirstTimeHomeBuyer: boolean;    // 생애최초
  isMetroArea: boolean;             // 수도권 여부
}

// ── 출력 ──
interface AcquisitionTaxResult {
  taxBase: number;                  // 과세표준 (천원 미만 절사)
  baseRate: number;                 // 기본세율
  appliedRate: number;              // 적용세율 (중과 포함)
  baseTax: number;                  // 취득세 본세

  // 선형보간 (주택 6~9억)
  usedLinearInterpolation: boolean;
  interpolatedRate?: number;

  // 중과
  surchargeType?: string;
  surchargeRate?: number;

  // 감면
  firstTimeBuyerReduction: number;  // 생애최초 감면 (최대 200만원)

  // 부가세
  ruralSpecialTax: number;          // 농어촌특별세
  localEducationTax: number;        // 지방교육세

  // 최종
  totalTax: number;                 // 총 납부세액

  steps: CalculationStep[];
}
```

**계산 흐름:**

```
calculateAcquisitionTax(input, rates) → AcquisitionTaxResult

1. 과세표준 = truncateToThousand(취득가액)

2. 기본세율 결정
   ├─ 매매 주택: 6억↓ 1% / 6~9억 선형보간 / 9억↑ 3%
   ├─ 매매 토지·건물: 4%
   ├─ 상속: 2.8% (농지 2.3%)
   ├─ 증여: 3.5%
   ├─ 원시취득: 2.8%
   └─ 공매: 매매와 동일

3. 중과세 판단 (조정지역 + 주택)
   ├─ 개인 2주택(조정): 8%
   ├─ 개인 3주택+(조정): 12%
   ├─ 법인(주택): 12%
   ├─ 사치성: 기본+중과
   └─ 유예 여부 DB special_rules 확인

4. 생애최초 감면 (200만원 한도)

5. 부가세 합산
   ├─ 농어촌특별세: (적용세율 - 2%) × 과세표준 × 10% (85㎡↓ 면제)
   └─ 지방교육세: 표준세율(2%) 기준 × 과세표준 × 20%

6. 총 납부세액 = 본세 - 감면 + 농특세 + 지방교육세
```

**선형보간 구현:**

```typescript
function calculateLinearInterpolation(acquisitionPrice: number): number {
  // 6억 이하: 1%, 9억 이상: 3%, 그 사이: 보간
  if (acquisitionPrice <= 600_000_000) return 0.01;
  if (acquisitionPrice >= 900_000_000) return 0.03;

  // 공식: (취득가액 × 2 / 300,000,000 - 3) / 100
  // 정수 연산: 소수점 5자리 정밀도 유지
  const rate = (acquisitionPrice * 2 / 300_000_000 - 3) / 100;
  return Math.round(rate * 100_000) / 100_000; // 소수점 5자리 반올림
}
```

### 3.3 상속세 — `lib/tax-engine/inheritance-tax.ts`

```typescript
// ── 입력 ──
interface InheritanceTaxInput {
  deceasedDate: Date;                // 상속개시일

  // 상속재산
  totalEstateValue: number;          // 상속재산가액 (원)
  financialAssetValue: number;       // 순금융재산 (금융재산공제용)
  debts: {
    publicCharges: number;           // 공과금
    privateDebts: number;            // 사적채무
  };
  funeralExpenses: {
    amount: number;                  // 장례비용
    hasMemorialFacility: boolean;    // 봉안시설 포함 여부
  };

  // 사전증여
  priorGifts: PriorGift[];

  // 상속인 구성
  hasSpouse: boolean;
  heirs: Heir[];
  spouseActualShare?: number;        // 배우자 실제 상속분 (미입력 시 법정상속분)

  // 세대생략
  generationSkip?: {
    estateValue: number;             // 세대생략 상속재산가액
    isMinorOver2B: boolean;          // 미성년 + 20억 초과
  };

  // 공제 관련
  cohabitationEligible: boolean;     // 동거주택상속공제 요건 충족
  cohabitationHouseValue?: number;   // 동거주택 가액
  farmingEstateValue?: number;       // 영농상속 재산가액
  businessEstateValue?: number;      // 가업상속 재산가액
  businessManagementYears?: number;  // 가업 경영 기간

  // 외국납부
  foreignTaxPaid: number;

  // 신고
  willFileOnTime: boolean;           // 기한 내 신고 예정
}

interface Heir {
  relationship: 'spouse' | 'child' | 'lineal_ascendant' | 'lineal_descendant' | 'sibling';
  age: number;
  isDisabled: boolean;
  lifeExpectancyYears?: number;      // 장애인: 기대여명
}

interface PriorGift {
  giftDate: Date;
  recipientIsHeir: boolean;         // 상속인 여부 (10년 vs 5년)
  amount: number;
  taxPaid: number;                  // 기납부 증여세
}

// ── 출력 ──
interface InheritanceTaxResult {
  // 과세가액
  grossEstate: number;               // 총 상속재산
  priorGiftsTotal: number;           // 사전증여 합산
  debtsTotal: number;                // 채무 합계
  funeralDeduction: number;          // 장례비용 공제 (500만~1,500만원)
  taxableValue: number;              // 과세가액

  // 법정상속분
  legalShares: { relationship: string; share: number; amount: number }[];

  // 공제
  deductions: {
    basic: number;                   // 기초공제 2억
    personalTotal: number;           // 인적공제 합계
    lumpSum: number;                 // 일괄공제 5억
    appliedMethod: 'personal' | 'lumpsum'; // 유리한 쪽 적용
    spouse: number;                  // 배우자공제
    financial: number;               // 금융재산공제
    cohabitation: number;            // 동거주택공제
    farming: number;                 // 영농상속공제
    business: number;                // 가업상속공제
    total: number;                   // 공제 합계
  };

  // 과세표준 및 세액
  taxBase: number;                   // 과세표준 (천원 미만 절사)
  calculatedTax: number;             // 산출세액

  // 할증 및 세액공제
  generationSkipSurcharge: number;   // 세대생략 할증
  priorGiftTaxCredit: number;        // 기납부 증여세 공제
  foreignTaxCredit: number;          // 외국납부 세액공제
  filingDeduction: number;           // 신고세액 공제 (3%)

  // 최종
  determinedTax: number;             // 결정세액
  installmentEligible: boolean;      // 분납 가능 여부 (1천만 초과)

  steps: CalculationStep[];
}
```

**계산 흐름:**

```
calculateInheritanceTax(input, rates) → InheritanceTaxResult

1. 과세가액
   = 상속재산가액 + 사전증여(상속인 10년, 비상속인 5년)
   - 채무(공과금 + 사적채무) - 장례비용(500만~1,500만원)

2. 법정상속분 계산
   ├─ 배우자+직계비속: 배우자 1.5 : 자녀 각 1
   ├─ 배우자+직계존속: 배우자 1.5 : 존속 각 1
   └─ 정수연산: 곱셈 먼저, 잔여분 배우자 우선 배분

3. 상속공제 (7종)
   ├─ 기초공제 2억 + 인적공제 vs 일괄공제 5억 → 유리한 쪽
   ├─ 배우자공제: min(max(실제상속분, 5억), min(법정상속분, 30억))
   ├─ 금융재산공제: 3구간 (2천만↓전액/1억↓2천만/초과 20% 최대 2억)
   ├─ 동거주택 (최대 6억)
   ├─ 영농 (최대 20억)
   └─ 가업 (최대 600억)
   ※ 종합한도: 공제 합계 ≤ 과세가액

4. 과세표준 = truncateToThousand(과세가액 - 공제합계)

5. 산출세액 = applyProgressiveRate(과세표준, 10~50% 5단계)
   └─ truncateToWon()

6. 세대생략 할증
   = 산출세액 × (세대생략재산 ÷ 전체재산) × 30% (또는 40%)

7. 세액공제 적용 순서
   ① 산출세액 + 세대생략 할증
   ② - 기납부 증여세 공제
   ③ - 외국납부 세액공제
   ④ - 신고세액 공제 (잔여세액 × 3%)
   ※ 각 단계 max(0, ...) — 음수 방지

8. 결정세액 = truncateToWon(최종 잔여세액)
```

### 3.4 증여세 — `lib/tax-engine/gift-tax.ts`

```typescript
// ── 입력 ──
interface GiftTaxInput {
  giftDate: Date;
  donorRelationship: 'spouse' | 'lineal_ascendant_adult' | 'lineal_ascendant_minor'
    | 'lineal_descendant' | 'other_relative';
  giftValue: number;                // 증여재산가액
  debtAssumption: number;           // 채무인수액
  isGenerationSkip: boolean;        // 세대생략
  isMinorOver2B: boolean;           // 미성년 + 20억 초과 (할증 40%)

  // 10년 내 동일인 사전증여
  priorGifts: {
    giftDate: Date;
    amount: number;
    taxPaid: number;
    deductionUsed: number;          // 기적용 공제액
  }[];

  willFileOnTime: boolean;
}

// ── 출력 ──
interface GiftTaxResult {
  giftValue: number;
  debtAssumption: number;
  priorGiftsTotal: number;          // 10년 내 합산
  grossTaxableValue: number;        // 과세가액

  // 공제
  deductionLimit: number;           // 관계별 공제한도
  priorDeductionUsed: number;       // 기적용 공제
  remainingDeduction: number;       // 잔여 공제
  appliedDeduction: number;         // 실제 적용 공제

  // 과세표준 및 세액
  taxBase: number;                  // 천원 미만 절사
  calculatedTax: number;            // 산출세액 (원 미만 절사)
  generationSkipSurcharge: number;  // 세대생략 할증
  priorTaxCredit: number;           // 기납부 세액공제
  filingDeduction: number;          // 신고세액 공제 (3%)
  determinedTax: number;            // 결정세액

  steps: CalculationStep[];
}
```

**계산 흐름:**

```
calculateGiftTax(input, rates) → GiftTaxResult

1. 과세가액 = 증여재산가액 - 채무인수액 + 10년 내 사전증여 합산

2. 공제 = min(잔여공제, 과세가액)
   잔여공제 = max(0, 관계별 한도 - 기적용 공제)

3. 과세표준 = truncateToThousand(과세가액 - 공제)

4. 산출세액 = truncateToWon(applyProgressiveRate(과세표준, 10~50%))

5. 세대생략 할증 (30% 또는 40%)

6. 세액공제 순서
   ① + 세대생략 할증
   ② - 기납부 증여세 공제
   ③ - 신고세액 공제 (잔여 × 3%)
   ※ 각 단계 max(0, ...) 적용

7. 결정세액 = truncateToWon(최종)
```

### 3.5 재산세 — `lib/tax-engine/property-tax.ts`

```typescript
// ── 입력 ──
interface PropertyTaxInput {
  propertyType: 'housing' | 'land' | 'building';
  assessedValue: number;            // 공시가격 또는 시가표준액 (원)
  isOneHousehold: boolean;          // 1세대1주택 (주택만)
  isUrbanArea: boolean;             // 도시지역 여부 (도시지역분)

  // 토지 전용
  landTaxType?: 'aggregate' | 'separate' | 'farmland' | 'golf_luxury' | 'other';

  // 건축물 전용
  buildingType?: 'general' | 'golf_luxury';

  // 세부담 상한 (선택적)
  previousYearTax?: number;         // 전년도 재산세 (부가세 포함)
}

// ── 출력 ──
interface PropertyTaxResult {
  // 과세표준
  fairMarketRatio: number;          // 공정시장가액비율
  taxBase: number;                  // 과세표준 (천원 미만 절사)

  // 본세
  appliedRate: number;              // 적용 세율 (구간)
  baseTax: number;                  // 재산세 본세

  // 1세대1주택 특례
  usedOneHouseSpecial: boolean;
  specialRateApplied?: number;

  // 부가세
  localEducationTax: number;        // 지방교육세 (20%)
  urbanAreaTax: number;             // 도시지역분 (0.14%)
  regionalResourceTax: number;      // 지역자원시설세

  // 세부담 상한
  taxCapApplied: boolean;
  taxCapRate?: number;
  cappedTax?: number;               // 상한 적용 후 세액

  // 최종
  determinedTax: number;            // 재산세 결정세액 (본세)
  totalTax: number;                 // 총 납부세액 (본세 + 부가세)

  // 분할 납부
  installmentEligible: boolean;     // 20만원 초과 시 분할

  steps: CalculationStep[];
}
```

**계산 흐름:**

```
calculatePropertyTax(input, rates) → PropertyTaxResult

1. 공정시장가액비율 적용
   ├─ 주택: 60% (DB fair_market_ratio에서 로드)
   └─ 토지·건축물: 70%

2. 과세표준 = truncateToThousand(공시가격 × 비율)

3. 세율 적용
   ├─ 주택: 4구간 누진 (1세대1주택 특례: 각 0.05%p 인하)
   ├─ 토지: 종합합산/별도합산/분리과세 각각
   └─ 건축물: 일반 0.25% / 골프장 4%

4. 세부담 상한 (전년도 세액 입력 시)
   ├─ 주택: 공시가 3억↓ 105%, 6억↓ 110%, 6억↑ 130%
   └─ 토지: 150%

5. 부가세 합산
   ├─ 지방교육세: 재산세 × 20%
   ├─ 도시지역분: 과세표준 × 0.14% (도시지역만)
   └─ 지역자원시설세: 시가표준액 기반 4구간 (v1.3 일반 건축물만)

6. 총 납부세액 = 재산세 본세 + 부가세 합계
```

**export 함수 (종부세 연동용):**

`calculatePropertyTax`는 종부세 엔진에서 직접 import하여 호출. 반환값의 `taxBase`(과세표준)와 `determinedTax`(결정세액)를 종부세 비율 안분 공제에 사용.

### 3.6 종합부동산세 — `lib/tax-engine/comprehensive-tax.ts`

```typescript
// ── 입력 ──
interface ComprehensiveTaxInput {
  // 주택분
  properties: ComprehensiveProperty[];
  isOneHouseOwner: boolean;         // 1세대1주택자
  ownerAge: number;                 // 소유자 나이 (고령자 공제)
  holdingYears: number;             // 보유기간 (장기보유 공제)

  // 토지분
  landAggregate?: {                 // 종합합산 토지
    totalAssessedValue: number;
  };
  landSeparate?: {                  // 별도합산 토지
    totalAssessedValue: number;
  };

  // 세부담 상한 (선택적) — 전년도 세액을 종부세·재산세 별도 입력
  previousYearComprehensiveTax?: number;  // 전년도 종합부동산세 결정세액
  previousYearPropertyTax?: number;       // 전년도 재산세 (부가세 포함 합계)
  isRegulatedAreaMultiHouse: boolean; // 조정대상지역 2주택+ (상한 300%)
}

interface ComprehensiveProperty {
  assessedValue: number;            // 공시가격 (원)
  areaSqm: number;
  propertyType: 'housing';
  isUrbanArea: boolean;             // 재산세 계산용
}

// ── 출력 ──
interface ComprehensiveTaxResult {
  // 주택분
  housing: {
    totalAssessedValue: number;     // 공시가격 합산
    basicDeduction: number;         // 기본공제 (9억 또는 12억)
    fairMarketRatio: number;        // 60%
    taxBase: number;                // 과세표준 (만원 미만 절사)
    calculatedTax: number;          // 산출세액

    // 1세대1주택 세액공제
    seniorDeduction: number;        // 고령자 공제
    seniorRate: number;
    longTermDeduction: number;      // 장기보유 공제
    longTermRate: number;
    combinedDeductionRate: number;  // 합산 (최대 80%)

    // 재산세 비율 안분 공제 (핵심)
    propertyTaxResults: PropertyTaxResult[];  // 주택별 재산세
    propertyTaxTotal: number;                // 재산세 합계
    propertyTaxProration: number;            // 안분 공제액
    prorationRatio: number;                  // 안분 비율

    // 세부담 상한
    taxCapApplied: boolean;
    taxCapRate?: number;

    determinedTax: number;          // 주택분 결정세액
  };

  // 토지분
  landAggregate?: {
    taxBase: number;
    calculatedTax: number;
    determinedTax: number;
  };
  landSeparate?: {
    taxBase: number;
    calculatedTax: number;
    determinedTax: number;
  };

  // 부가세
  ruralSpecialTax: number;          // 농어촌특별세 (종부세 × 20%)

  // 최종
  totalComprehensiveTax: number;    // 종부세 합계
  totalPropertyTax: number;         // 재산세 합계
  totalRuralTax: number;            // 농특세 합계
  grandTotal: number;               // 총 납부세액

  steps: CalculationStep[];
}
```

---

## 4. 재산세↔종합부동산세 연동 상세 설계

### 4.1 연동 아키텍처

```
┌── Orchestrator (API Route: /api/calc/comprehensive) ──────────────────┐
│                                                                       │
│  const rates = await preloadTaxRates(                                │
│    ['comprehensive_property', 'property'], targetDate                │
│  );  // DB 1회 쿼리로 2개 세금 세율 모두 로드                           │
│                                                                       │
│  const result = calculateComprehensiveTax(input, rates);             │
│                                                                       │
└───────────────────────────┬───────────────────────────────────────────┘
                            │
                            ▼
┌── comprehensive-tax.ts (Pure Engine) ────────────────────────────────┐
│                                                                      │
│  // Step 1~5: 종부세 과세표준 & 산출세액 계산                          │
│  const compTaxBase = calculateCompTaxBase(input, rates);             │
│                                                                      │
│  // Step 6: 재산세 자동 계산 (property-tax.ts 호출)                   │
│  const propertyResults = input.properties.map(prop =>                │
│    calculatePropertyTax({                                            │
│      propertyType: 'housing',                                        │
│      assessedValue: prop.assessedValue,                              │
│      isOneHousehold: input.isOneHouseOwner && props.length === 1,    │
│      isUrbanArea: prop.isUrbanArea,                                  │
│    }, rates)  // ← rates에서 property 세율 추출하여 전달              │
│  );                                                                  │
│                                                                      │
│  // Step 7: 비율 안분 공제 계산                                       │
│  const propertyTaxBase = sum(propertyResults.map(r => r.taxBase));   │
│  const propertyTaxTotal = sum(propertyResults.map(r => r.determinedTax)); │
│  const prorationRatio = min(compTaxBase / propertyTaxBase, 1.0);    │
│  const prorationCredit = propertyTaxTotal × prorationRatio;          │
│                 ↑                                                    │
│        calculateProration() 사용 (분모 0 방어 포함)                    │
│                                                                      │
│  // Step 8: 세부담 상한 & 농특세                                      │
│  ...                                                                 │
└──────────────────────────────────────────────────────────────────────┘
```

### 4.2 비율 안분 공제 공식

```
공제할 재산세 = 재산세 부과세액(determinedTax)
             × (종부세 과세표준 ÷ 재산세 과세표준)

단, 비율 = min(종부세 과세표준 ÷ 재산세 과세표준, 1.0)
    재산세 과세표준 = 0 → 공제액 = 0
```

**정수 연산 구현:**

```typescript
const prorationCredit = calculateProration(
  propertyTaxDetermined,   // amount: 재산세 결정세액
  compTaxBase,             // numerator: 종부세 과세표준
  propertyTaxBase          // denominator: 재산세 과세표준
);
// 내부: amount × numerator / denominator
// 곱셈 먼저, 분모 0 방어, 비율 상한 1.0
```

### 4.3 연동 계산 예시

```
[예시] 공시가격 15억 주택 1채, 1세대1주택자, 65세, 10년 보유

─── 종부세 ───
공시가격 합산: 15억
기본공제: -12억 (1세대1주택)
공정시장가액비율: × 60%
종부세 과세표준: truncateToTenThousand(1.8억) = 1.8억
산출세액: 1.8억 × 0.5% = 90만원
고령자 공제(30%) + 장기보유(40%) = 70% 공제 → 27만원

─── 재산세 (자동 계산) ───
공시가격: 15억
공정시장가액비율: × 60%
재산세 과세표준: truncateToThousand(9억) = 9억
재산세: 9억 × 0.4% - 63만원 = 297만원

─── 비율 안분 공제 ───
비율: min(1.8억 / 9억, 1.0) = 0.2
공제할 재산세: 297만원 × 0.2 = 59.4만원

종부세 결정세액: max(27만원 - 59.4만원, 0) = 0원
농특세: 0원
```

### 4.4 성능 고려 (다주택)

- **10채 미만**: 각 주택별 `calculatePropertyTax` 순차 호출
- **10채 이상**: 세율 데이터는 1회만 파싱, 반복 호출 시 파싱된 데이터 재사용

```typescript
// 최적화: 세율 파싱 1회
const parsedPropertyRates = parsePropertyRates(rates);
const results = input.properties.map(prop =>
  calculatePropertyTaxWithParsedRates(prop, parsedPropertyRates)
);
```

---

## 5. API Route 명세

### 5.1 공통 규격

| 항목 | 값 |
|------|-----|
| Method | POST |
| Content-Type | application/json |
| Rate Limit | 분당 30회 (Upstash + Vercel Edge Middleware) |
| Auth | 비로그인 허용 (계산은 공개, 이력 저장은 로그인 필요) |
| 에러 형식 | `{ error: { code: TaxErrorCode, message: string } }` |

### 5.2 엔드포인트 목록

| Endpoint | 계산 엔진 | Orchestrator 패턴 |
|----------|----------|-------------------|
| `POST /api/calc/transfer` | `calculateTransferTax` | `preloadTaxRates(['transfer'], transferDate)` |
| `POST /api/calc/acquisition` | `calculateAcquisitionTax` | `preloadTaxRates(['acquisition'], acquisitionDate)` |
| `POST /api/calc/inheritance` | `calculateInheritanceTax` | `preloadTaxRates(['inheritance'], deceasedDate)` |
| `POST /api/calc/gift` | `calculateGiftTax` | `preloadTaxRates(['gift'], giftDate)` |
| `POST /api/calc/property` | `calculatePropertyTax` | `preloadTaxRates(['property'], taxBaseDate)` |
| `POST /api/calc/comprehensive` | `calculateComprehensiveTax` | `preloadTaxRates(['comprehensive_property', 'property'], taxBaseDate)` |

### 5.3 Orchestrator 패턴 (공통)

```typescript
// app/api/calc/{tax-type}/route.ts 공통 구조
export async function POST(request: Request) {
  // 1. Rate limiting 확인
  const rateLimitResult = await ratelimit.limit(getClientIp(request));
  if (!rateLimitResult.success) {
    return NextResponse.json(
      { error: { code: 'RATE_LIMITED', message: '요청 한도 초과' } },
      { status: 429 }
    );
  }

  // 2. Zod 입력 검증
  const body = await request.json();
  const parsed = inputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: 'INVALID_INPUT', message: parsed.error.message } },
      { status: 400 }
    );
  }

  // 3. 세율 프리로드 (DB 1회)
  const rates = await preloadTaxRates(taxTypes, targetDate);

  // 4. 순수 계산 엔진 호출
  const result = calculateTax(parsed.data, rates);

  // 5. 결과 반환
  return NextResponse.json({ data: result });
}
```

### 5.4 응답 구조

```typescript
// 성공
{
  "data": {
    // ...TaxResult 객체
    "steps": [
      { "label": "양도차익 계산", "formula": "5억 - 3억 - 500만", "amount": 195000000 },
      // ...
    ]
  }
}

// 실패
{
  "error": {
    "code": "TAX_RATE_NOT_FOUND",
    "message": "2026-01-15 시점의 양도소득세 세율을 찾을 수 없습니다"
  }
}
```

---

## 6. 조정대상지역 조회 — `lib/db/regulated-areas.ts`

```typescript
async function isRegulatedArea(
  areaCode: string,
  referenceDate: Date
): Promise<boolean>
```

- Orchestrator 레벨에서 호출 (DB 접근이므로 순수 엔진 외부)
- 결과를 `isRegulatedArea: boolean`으로 순수 엔진 입력에 포함
- 판단 기준:
  - **비과세 판단**: 취득일 기준
  - **중과세 판단 (양도세)**: 양도일 기준
  - **중과세 판단 (취득세)**: 취득일 기준

---

## 7. 계산 이력 — `lib/db/calculations.ts`

```typescript
// 이력 저장 (Server Action, 로그인 필수)
async function saveCalculation(params: {
  userId: string;
  taxType: TaxType;
  inputData: Record<string, unknown>;
  resultData: Record<string, unknown>;
  taxLawVersion: string;
  linkedCalculationId?: string;     // 재산세↔종부세 연동
}): Promise<{ id: string }>

// 이력 조회
async function getCalculations(
  userId: string,
  filters?: { taxType?: TaxType; limit?: number; offset?: number }
): Promise<CalculationRecord[]>

// 이력 삭제
async function deleteCalculation(
  userId: string,
  calculationId: string
): Promise<void>

// 보존 정책: 사용자당 최대 200건, 초과 시 가장 오래된 이력 자동 삭제
```

---

## 8. 파일 구조 요약

```
lib/
  tax-engine/
    transfer-tax.ts              # 양도소득세 순수 계산 엔진
    acquisition-tax.ts           # 취득세 순수 계산 엔진
    inheritance-tax.ts           # 상속세 순수 계산 엔진
    gift-tax.ts                  # 증여세 순수 계산 엔진
    property-tax.ts              # 재산세 순수 계산 엔진
    comprehensive-tax.ts         # 종합부동산세 순수 계산 엔진
                                 #   → property-tax.ts import (단방향)
    tax-utils.ts                 # 공통 유틸
    tax-errors.ts                # 에러 코드 + TaxCalculationError
    schemas/
      rate-table.schema.ts       # jsonb Zod 검증 스키마
      transfer-input.schema.ts   # 양도세 입력 Zod
      acquisition-input.schema.ts
      inheritance-input.schema.ts
      gift-input.schema.ts
      property-input.schema.ts
      comprehensive-input.schema.ts
  db/
    tax-rates.ts                 # getTaxRate, preloadTaxRates
    regulated-areas.ts           # isRegulatedArea
    calculations.ts              # 이력 CRUD + 200건 보존 정책

app/api/calc/
    transfer/route.ts            # Orchestrator
    acquisition/route.ts
    inheritance/route.ts
    gift/route.ts
    property/route.ts
    comprehensive/route.ts       # preload 2개 세금 타입
```

---

## 9. 의존성 다이어그램

```
comprehensive-tax.ts ──→ property-tax.ts ──→ tax-utils.ts
         │                      │                  ↑
         └──────────────────────┼──────────────────┘
                                │
transfer-tax.ts ────────────────┼──→ tax-utils.ts
acquisition-tax.ts ─────────────┼──→ tax-utils.ts
inheritance-tax.ts ─────────────┼──→ tax-utils.ts
gift-tax.ts ────────────────────┘──→ tax-utils.ts

모든 엔진 → tax-errors.ts (에러 코드)
모든 엔진 → schemas/*.schema.ts (Zod 검증)

※ 순환 의존 없음: comprehensive → property 단방향만 허용
```

---

## 10. 절사 규칙 매트릭스

| 세금 | 과세표준 절사 | 산출세액 절사 | 비고 |
|------|-------------|-------------|------|
| 양도소득세 | 천원 미만 | 원 미만 | |
| 취득세 | 천원 미만 | 원 미만 | |
| 상속세 | 천원 미만 | 원 미만 | |
| 증여세 | 천원 미만 | 원 미만 | |
| 재산세 | 천원 미만 | 원 미만 | |
| **종합부동산세** | **만원 미만** | 원 미만 | ⚠️ 다른 세금과 다름 |

---

## 11. 설계 결정 기록 (ADR)

### ADR-1: 왜 BigInt를 기본으로 쓰지 않는가?

- 한국 부동산 최대 양도가는 수백억원 수준
- `Number.MAX_SAFE_INTEGER` = 9,007조원 → 단일 금액으로는 충분
- **곱셈 중간값**: `양도가 × 취득시 기준시가` 시 오버플로우 가능 → `safeMultiplyThenDivide`에서 BigInt fallback
- JSON 직렬화 시 BigInt 비호환 문제 회피
- **결론**: 기본 Number, 중간값 오버플로우 위험 구간만 BigInt fallback

### ADR-2: 왜 재산세 엔진을 종부세에서 직접 호출하는가?

- 종부세 계산 시 재산세를 반드시 함께 계산해야 함 (비율 안분 공제)
- API 레벨 호출 시 네트워크 오버헤드 + 트랜잭션 일관성 문제
- 순수 함수이므로 직접 import 호출이 가장 단순하고 정확
- **결론**: `comprehensive-tax.ts`가 `property-tax.ts`를 직접 import (단방향 의존)

### ADR-3: 왜 Orchestrator가 세율을 프리로드하는가?

- 순수 엔진이 DB에 접근하면 테스트 시 DB mock 필요 → 복잡도 증가
- Orchestrator가 1~2회 DB 쿼리로 필요한 세율을 모두 로드 후 매개변수로 전달
- 종부세: `preloadTaxRates(['comprehensive_property', 'property'])` 1회로 2개 세금 세율 모두 로드
- **결론**: DB 접근은 Orchestrator에 집중, 엔진은 순수 함수 유지
