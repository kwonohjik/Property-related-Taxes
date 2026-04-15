# Korean Tax Calc — 계산 엔진 & API 설계 (Design Document)

> PDCA Design Phase | 2026-04-14 (코드 기반 업그레이드: 2026-04-15)
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
// lib/tax-engine/types.ts
export const TAX_TYPES = [
  "transfer", "inheritance", "gift",
  "acquisition", "property", "comprehensive_property",
] as const;
export type TaxType = (typeof TAX_TYPES)[number];

export const RATE_CATEGORIES = [
  "progressive_rate", "deduction", "surcharge",
  "special", "fair_market_ratio",
] as const;
export type RateCategory = (typeof RATE_CATEGORIES)[number];

// key 형식: `${tax_type}:${category}:${sub_category}`
export type TaxRateKey = `${TaxType}:${RateCategory}:${string}`;

// preloadTaxRates 반환 타입
export type TaxRateMap = Map<TaxRateKey, TaxRateRecord>;

export interface TaxRateRecord {
  id: string;
  taxType: TaxType;
  category: RateCategory;
  subCategory: string;         // 동일 category 내 세부 규칙 구분
  effectiveDate: string;
  rateTable: unknown;          // Zod safeParse로 타입 확정
  deductionRules: unknown;
  specialRules: unknown;
}

export interface TaxBracket {
  min: number;
  max: number | null;
  rate: number;
  deduction: number;
}
```

> **변경 이력**: `TaxCategory` → `RateCategory`, `TaxRateRow` → `TaxRateRecord`, 필드명 camelCase 통일, `TaxRateKey` 타입 리터럴 추가, `TaxBracket` 인터페이스 추가

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
function calculateProgressiveTax(
  taxableAmount: number,
  brackets: TaxBracket[]
): number
// 과세표준에 누진세율 적용 → 산출세액 반환
// 구현: applyRate(taxableAmount, bracket.rate) - bracket.deduction
// ⚠️ 중요: rate × amount 곱셈 직후 Math.floor() 절사 (P0-2)

// ── P0-2: 세율 × 금액 헬퍼 ──
function applyRate(amount: number, rate: number): number
// 구현: Math.floor(amount * rate)
// ⚠️ 모든 세율 곱셈에 이 함수를 사용. 직접 amount * rate 후 floor 금지.
// 이유: 0.38 × 100_000_000 = 37_999_999.999... 같은 부동소수점 오차 방지

// ── 절사 유틸 ──
function truncateToThousand(amount: number): number
// 천원 미만 절사 — 양도세·재산세·취득세·상속세·증여세 과세표준

function truncateToTenThousand(amount: number): number
// 만원 미만 절사 — 종합부동산세 과세표준

function truncateToWon(amount: number): number
// 원 미만 절사 — 산출세액 (공통)

// ── 보유기간 계산 ──
function calculateHoldingPeriod(
  acquisitionDate: Date,
  disposalDate: Date
): { years: number; months: number; days: number }
// 세법상 기산일: 취득일 다음날 ~ 양도일 (민법 초일불산입)
// date-fns addDays/differenceInYears 조합 사용

// ── 정수 안전 연산 ──
function safeMultiply(a: number, b: number): number
// 안전한 정수 곱셈 — MAX_SAFE_INTEGER 초과 시 BigInt fallback

function safeMultiplyThenDivide(a: number, b: number, c: number): number
// (a × b) ÷ c — 곱셈 먼저 수행하여 정밀도 유지
// MAX_SAFE_INTEGER 초과 시 BigInt fallback, c === 0 → 0 반환

// ── 비율 연산 (안분 공제용) ──
function calculateProration(
  amount: number,
  numerator: number,
  denominator: number
): number
// amount × (numerator / denominator), denominator === 0 → 0
// 비율 상한: numerator >= denominator → amount 그대로 반환

// ── 환산취득가액 ──
function calculateEstimatedAcquisitionPrice(
  transferPrice: number,
  standardPriceAtAcquisition: number,
  standardPriceAtTransfer: number
): number
// 공식: transferPrice × (standardPriceAtAcquisition ÷ standardPriceAtTransfer)
// standardPriceAtTransfer === 0 → 0 반환

// ── 중과세 유예 판단 ──
function isSurchargeSuspended(
  specialRules: { surcharge_suspended: boolean; suspended_types?: string[]; suspended_until?: string } | null | undefined,
  referenceDate: Date,
  surchargeType: string   // 'multi_house_2' | 'multi_house_3plus' 등
): boolean
// DB special_rules.suspended_until과 양도일을 비교하여 유예 여부 판단
// suspended_until 없으면 false (유예 종료)
```

> **변경 이력**: `applyProgressiveRate` → `calculateProgressiveTax` (rename), `safeMultiply`, `calculateEstimatedAcquisitionPrice`, `isSurchargeSuspended` 추가

### 2.3 에러 체계 — `lib/tax-engine/tax-errors.ts`

```typescript
// lib/tax-engine/tax-errors.ts

export enum TaxErrorCode {
  TAX_RATE_NOT_FOUND    = "TAX_RATE_NOT_FOUND",     // 세율 데이터 없음
  INVALID_INPUT         = "INVALID_INPUT",            // 입력값 오류
  INVALID_DATE          = "INVALID_DATE",             // 날짜 형식/범위 오류
  CALCULATION_OVERFLOW  = "CALCULATION_OVERFLOW",     // 정수 연산 오버플로우
  RATE_SCHEMA_MISMATCH  = "RATE_SCHEMA_MISMATCH",    // Zod 검증 실패
  PROPERTY_TAX_REQUIRED = "PROPERTY_TAX_REQUIRED",   // 종부세 연동 시 재산세 미계산
}

export class TaxCalculationError extends Error {
  constructor(
    public readonly code: TaxErrorCode,
    message: string,
    public readonly details?: Record<string, unknown>
  ) {
    super(message);
    this.name = "TaxCalculationError";
  }
}

// 세율 조회 실패 전용 서브클래스 (가장 자주 throw)
export class TaxRateNotFoundError extends TaxCalculationError {
  constructor(message: string) {
    super(TaxErrorCode.TAX_RATE_NOT_FOUND, message);
    this.name = "TaxRateNotFoundError";
  }
}

// Zod 검증 실패 전용 서브클래스
export class TaxRateValidationError extends TaxCalculationError {
  constructor(message: string) {
    super(TaxErrorCode.RATE_SCHEMA_MISMATCH, message);
    this.name = "TaxRateValidationError";
  }
}
```

> **변경 이력**: `CALC_TIMEOUT`, `REGULATED_AREA_LOOKUP_FAILED`, `INVALID_HEIR_COMPOSITION`, `PROPERTY_TAX_CALC_FAILED`, `PRORATION_DENOMINATOR_ZERO` 제거 → `INVALID_DATE`, `CALCULATION_OVERFLOW`, `PROPERTY_TAX_REQUIRED` 추가. `TaxRateNotFoundError`, `TaxRateValidationError` 서브클래스 추가

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

**파싱 함수 목록 (rate-table.schema.ts 실제 export):**

| 함수 | 반환 타입 | 용도 |
|------|----------|------|
| `parseProgressiveRate(raw)` | `ProgressiveRateData` | 누진세율 구간 파싱 |
| `parseDeductionRules(raw)` | `DeductionRulesData` | 공제 규칙 파싱 (long_term_holding / basic_deduction / self_farming) |
| `parseSurchargeRate(raw)` | `SurchargeRateData` | 중과세율 파싱 |
| `parseHouseCountExclusion(raw)` | `HouseCountExclusionData` | 주택 수 산정 배제 규칙 |
| `parseRegulatedAreaHistory(raw)` | `RegulatedAreaHistoryData` | 조정대상지역 이력 |
| `parseNonBusinessLandJudgment(raw)` | `NonBusinessLandJudgmentSchemaData` | 비사업용 토지 판정 기준 |
| `parseLongTermRentalRuleSet(raw)` | `LongTermRentalRuleSet` | 장기임대 감면 규칙 V2 |
| `parseNewHousingMatrix(raw)` | `NewHousingMatrixData` | 신축·미분양 감면 매트릭스 |

### 2.5 법령 조문 상수 — `lib/tax-engine/legal-codes.ts`

```typescript
// ── 비사업용 토지 — 소득세법 §104조의3 + 시행령 §168조의6~14 ──
export const NBL = {
  MAIN:           "소득세법 §104조의3",      // 비사업용 토지의 범위
  CRITERIA:       "시행령 §168조의6",         // 판정 3기준 (80%/5년3년/3년2년)
  UNAVOIDABLE:    "시행령 §168조의7",         // 부득이한 사유 (질병·고령·징집 등)
  FARMLAND:       "시행령 §168조의8",         // 농지 자경 요건 + 건물 부수 토지 배율
  FARMLAND_DEEM:  "시행령 §168조의8 ③",      // 농지 사용의제
  FOREST_PASTURE: "시행령 §168조의9",         // 목장용지·임야 사업용 요건
  FOREST_SPECIAL: "시행령 §168조의10",        // 임야 특수 요건
  VILLA_OTHER:    "시행령 §168조의11",        // 별장 부수·기타 토지
  OTHER_LAND:     "시행령 §168조의11 ①",     // 기타토지 재산세 유형
  BUILDING_SITE:  "시행령 §168조의8",         // 건물 부수 토지 용도지역별 배율
  HOUSING_SITE:   "시행령 §168조의8",         // 주택 부수 토지 배율
  URBAN_GRACE:    "시행령 §168조의14 ①",     // 도시지역 편입유예
  UNCONDITIONAL:  "시행령 §168조의14 ③",     // 무조건 사업용 의제 (7가지 사유)
} as const;

// ── 양도소득세 — 소득세법 §89~§104 ──
export const TRANSFER = {
  ONE_HOUSE_EXEMPT:    "소득세법 §89 ①",     // 1세대 1주택 비과세
  LONG_TERM_DEDUCTION: "소득세법 §95 ②",     // 장기보유특별공제
  BASIC_DEDUCTION:     "소득세법 §103",       // 기본공제 (연 250만원)
  TAX_RATE:            "소득세법 §104 ①",    // 양도소득세율
  SURCHARGE:           "소득세법 §104 ②",    // 다주택 중과세율
  LOCAL_INCOME_TAX:    "지방세법 §92",        // 지방소득세 (결정세액 × 10%)
} as const;
```

> **사용 원칙**: 법령 조문 문자열을 코드에 직접 기입 금지. 반드시 `NBL.*` / `TRANSFER.*` 상수 사용. 세법 개정 시 이 파일만 수정하면 모든 단계의 법령 참조가 일괄 반영됨.

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

  // ── 서브엔진 입력 (선택적 — 정밀 계산 모드) ──

  /**
   * 세대 보유 주택 상세 목록 (선택)
   * 제공 시 multi-house-surcharge 서브엔진으로 주택 수 정밀 산정.
   * 미제공 시 householdHousingCount 사용 (하위 호환).
   */
  houses?: HouseInfo[];
  presaleRights?: PresaleRight[];      // 분양권·입주권 목록

  /** houses 제공 시 — 일시적 2주택 주택 ID 지정 */
  multiHouseTemporaryTwoHouse?: {
    previousHouseId: string;
    newHouseId: string;
  };
  marriageMerge?: { marriageDate: Date };       // 혼인합가 정보
  parentalCareMerge?: { mergeDate: Date };      // 동거봉양 합가 정보
  sellingHouseId?: string;                      // 양도 주택 ID (houses 제공 시)

  /**
   * 비사업용 토지 상세 정보 (선택)
   * 제공 시 non-business-land 서브엔진으로 정밀 판정.
   * 미제공 시 isNonBusinessLand 플래그 사용 (하위 호환).
   */
  nonBusinessLandDetails?: NonBusinessLandInput;

  /**
   * 장기임대주택 감면 상세 정보 (선택)
   * 제공 시 rental-housing-reduction 서브엔진으로 정밀 감면 판정.
   * 미제공 시 reductions[] 배열의 long_term_rental 단순 처리 (하위 호환).
   */
  rentalReductionDetails?: RentalReductionInput;

  /**
   * 신축·미분양주택 감면 상세 정보 (선택)
   * 제공 시 new-housing-reduction 서브엔진으로 조문 매트릭스 기반 감면 판정.
   * 미제공 시 reductions[] 배열의 new_housing/unsold_housing 단순 처리 (하위 호환).
   */
  newHousingDetails?: NewHousingReductionInput;
}

type TransferReduction =
  | { type: 'self_farming'; farmingYears: number }
  | { type: 'long_term_rental'; rentalYears: number; rentIncreaseRate: number }
  | { type: 'new_housing'; region: 'metropolitan' | 'non_metropolitan' }
  | { type: 'unsold_housing'; region: 'metropolitan' | 'non_metropolitan' };  // ← 수도권 포함으로 확장

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
  surchargeType?: string;            // 'multi_house_2' | 'multi_house_3plus' | 'non_business_land' | 'unregistered'
  surchargeRate?: number;            // 추가 세율
  isSurchargeSuspended: boolean;     // 중과세 유예 여부

  // 감면
  reductionAmount: number;           // 총 감면세액
  reductionType?: string;

  // 최종
  determinedTax: number;             // 결정세액 (원 미만 절사)
  localIncomeTax: number;            // 지방소득세 (결정세액의 10%)
  totalTax: number;                  // 총 납부세액

  // 계산 과정 추적
  steps: CalculationStep[];

  // ── 서브엔진 상세 결과 (선택적 — 해당 입력 제공 시만 포함) ──

  /** 다주택 중과세 상세 (houses[] 제공 시) — UI 제외주택·배제사유 표시용 */
  multiHouseSurchargeDetail?: {
    effectiveHouseCount: number;     // 중과 적용 주택 수
    rawHouseCount: number;           // 산정 전 총 주택 수
    excludedHouses: ExcludedHouse[]; // 배제된 주택 목록
    exclusionReasons: ExclusionReason[];
    isRegulatedAtTransfer: boolean;
    warnings: string[];
  };

  /** 비사업용 토지 판정 상세 (nonBusinessLandDetails 제공 시) */
  nonBusinessLandJudgmentDetail?: NonBusinessLandJudgment;

  /** 장기임대 감면 상세 (rentalReductionDetails 제공 시) */
  rentalReductionDetail?: RentalReductionResult;

  /** 신축·미분양 감면 상세 (newHousingDetails 제공 시) */
  newHousingReductionDetail?: NewHousingReductionResult;
}

interface CalculationStep {
  label: string;        // 예: '양도차익 계산'
  formula: string;      // 예: '양도가액 - 취득가액 - 필요경비'
  amount: number;       // 결과 금액
  legalBasis?: string;  // 법적 근거 조문 (예: "소득세법 §95 ②") — 결과 시각화용
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
   ├─ rentalReductionDetails 제공 → calculateRentalReduction() 호출 (정밀 감면)
   ├─ newHousingDetails 제공 → determineNewHousingReduction() 호출 (조문 매트릭스)
   └─ 복수 감면 해당 시 납세자 유리 1건 선택 (조특법 §127 ②)

9. 결정세액 = truncateToWon(산출세액 - 감면세액)
10. 지방소득세 = 결정세액 × 10%
11. 총 납부세액 = 결정세액 + 지방소득세
```

---

### 3.1-A 서브엔진: 다주택 중과세 — `lib/tax-engine/multi-house-surcharge.ts`

**역할**: 세대 보유 주택 목록(HouseInfo[])을 받아 소득세법 시행령 §167-3·§167-10 기준으로 주택 수를 정밀 산정하고 중과세 적용 여부를 판정.

```typescript
// ── 주요 타입 ──

/** 장기임대주택 유형 (소령 §167-3 ① 2호 가목~자목) */
type RentalHousingType = "A" | "B" | "C" | "D" | "E" | "F" | "G" | "H" | "I";
//  A: 민간매입임대 5년 (가목)
//  B: 2003.10.29 이전 기존 등록 (나목)
//  C: 민간건설임대 5년 (다목)
//  D: 미분양 매입임대 (라목)
//  E: 장기일반 매입임대 10년 (마목)
//  F: 장기일반 건설임대 10년 (바목)
//  G: 자진·자동 말소 후 양도 (사목)
//  H: 단기 매입임대 6년 (2025.6.4 이후 신설, 아목)
//  I: 단기 건설임대 6년 (2025.6.4 이후 신설, 자목)

interface HouseInfo {
  id: string;
  acquisitionDate: Date;
  officialPrice: number;             // 취득시 공시가격
  transferOfficialPrice?: number;    // 양도시 공시가격 (VALUE 지역 가액기준 판정)
  region: "capital" | "non_capital"; // 수도권 여부 (legacy 폴백)
  regionCriteria?: "REGION" | "VALUE"; // 지역기준/가액기준 명시적 구분
  isCapitalArea?: boolean;           // 수도권 여부 (장기임대 가액기준용)
  isInherited: boolean;
  inheritedDate?: Date;
  isLongTermRental: boolean;
  rentalType?: RentalHousingType;    // 유형별 세부 요건 검증
  // ... (임대 등록일, 임대 기간, 면적, 임대료 증가율 등 상세 필드)
}

interface MultiHouseSurchargeInput {
  houses: HouseInfo[];
  presaleRights?: PresaleRight[];
  transferDate: Date;
  isRegulatedArea: boolean;
  temporaryTwoHouse?: { previousHouseId: string; newHouseId: string };
  marriageMerge?: { marriageDate: Date };
  parentalCareMerge?: { mergeDate: Date };
  sellingHouseId?: string;
  surchargeSpecialRules?: SurchargeSpecialRulesData;
}

interface MultiHouseSurchargeResult {
  isSurcharge: boolean;
  surchargeType?: "multi_house_2" | "multi_house_3plus";
  surchargeRate: number;             // 추가 세율 (0.2 = 20%p 등)
  effectiveHouseCount: number;       // 중과 적용 주택 수
  rawHouseCount: number;
  excludedHouses: ExcludedHouse[];   // 산정 제외 주택 목록
  exclusionReasons: ExclusionReason[];
  isRegulatedAtTransfer: boolean;
  isSurchargeSuspended: boolean;     // 유예 여부
  warnings: string[];
}

// ── 메인 함수 ──
function determineMultiHouseSurcharge(
  input: MultiHouseSurchargeInput
): MultiHouseSurchargeResult
```

**판정 흐름:**
```
1. 주택 수 산정 (소령 §167-3)
   ├─ 전체 HouseInfo 순회
   ├─ regionCriteria === "VALUE" + 양도시 공시가 3억 이하 → 제외
   ├─ 장기임대 유형별 세부 요건 검증 (가목~자목) → 통과 시 제외
   ├─ 상속주택 5년 내 → 제외
   ├─ 혼인합가·동거봉양 5년 내 → 제외
   └─ 일시적 2주택 → previousHouse 제외

2. 중과 판정
   ├─ 양도일 기준 조정대상지역 여부 확인
   ├─ effectiveHouseCount >= 3 → 3주택+ 중과 (20%p 추가)
   ├─ effectiveHouseCount == 2 → 2주택 중과 (10%p 추가)
   └─ isSurchargeSuspended() 으로 유예 여부 최종 확인
```

---

### 3.1-B 서브엔진: 비사업용 토지 판정 — `lib/tax-engine/non-business-land.ts`

**역할**: 토지 속성과 보유·이용 이력을 받아 소득세법 §104조의3 + 시행령 §168조의6~14 기준으로 비사업용 토지 여부를 판정. 판정 단계별 상태(PASS/FAIL/SKIP)를 반환하여 UI 시각화에 활용.

```typescript
type StepStatus = "PASS" | "FAIL" | "SKIP" | "NOT_APPLICABLE";

interface JudgmentStep {
  id: string;           // 예: "unconditional_exemption", "criteria_80pct"
  label: string;        // 예: "① 무조건 사업용 의제"
  status: StepStatus;
  detail: string;
  legalBasis?: string;  // 예: "시행령 §168조의14 ③"
}

type LandType =
  | "paddy" | "field" | "orchard" | "forest" | "pasture"
  | "vacant_lot" | "building_site" | "housing_site"
  | "villa_land" | "other_land" | "miscellaneous" | "other";
  // "farmland" 레거시 타입(paddy/field/orchard 통합)도 허용

type ZoneType =
  | "exclusive_residential" | "general_residential" | "semi_residential"
  | "residential" // 레거시 통합형
  | "commercial" | "industrial" | "green" | "management"
  | "agriculture_forest" | "natural_env" | "unplanned" | "undesignated";

interface NonBusinessLandInput {
  landType: LandType;
  zoneType: ZoneType;
  acquisitionDate: Date;
  transferDate: Date;
  // 자경·임대·이용 이력, 유예기간, 부득이한 사유 등 상세 필드
}

interface NonBusinessLandJudgment {
  isNonBusinessLand: boolean;        // 최종 판정 (true = 비사업용)
  steps: JudgmentStep[];             // 판정 단계별 상세
  appliedCriteria?: string;          // 충족된 판정 기준
  legalBasis: string;                // 메인 근거 조문
}

function judgeNonBusinessLand(
  input: NonBusinessLandInput,
  judgmentRules?: NonBusinessLandJudgmentSchemaData
): NonBusinessLandJudgment
```

**판정 흐름 (법령 §168조의6):**
```
1. 무조건 사업용 의제 (시행령 §168조의14 ③) → PASS 시 종료
2. 지목/유형별 분기 (농지/임야/목장/주택부수/건물부수/기타)
3. 3가지 기준 중 하나 충족 시 사업용 판정
   ├─ 기준1: 보유기간 80% 이상 사업용
   ├─ 기준2: 5년 내 3년 이상 사업용
   └─ 기준3: 3년 내 2년 이상 사업용
4. 유예기간(상속·법령제한·매매계약·신축 등) 산입하여 재산정
```

---

### 3.1-C 서브엔진: 장기임대 감면 — `lib/tax-engine/rental-housing-reduction.ts`

**역할**: 조세특례제한법 §97·§97의3·§97의4·§97의5 기반 장기임대주택 감면 판정. 등록요건·임대기간·임대료 증액제한을 검증하고 감면율을 산출.

```typescript
type RentalHousingType =
  | "public_construction"    // 공공건설임대 §97
  | "long_term_private"      // 장기일반민간임대 §97의3
  | "public_support_private" // 공공지원민간임대 §97의4
  | "public_purchase";       // 공공매입임대 §97의5

type ReductionLawVersion =
  | "pre_2018_09_14"   // 구법
  | "post_2018_09_14"  // 1차 개정 (2018.9.14 ~ 2020.7.10)
  | "post_2020_07_11"  // 2차 개정 (~ 2020.8.17)
  | "post_2020_08_18"; // 3차 개정 (2020.8.18 이후)

interface RentalReductionInput {
  isRegisteredLandlord: boolean;     // 지자체 임대사업자 등록 여부
  isTaxRegistered: boolean;          // 세무서 사업자 등록 여부
  registrationDate: Date;
  rentalHousingType: RentalHousingType;
  propertyType: "apartment" | "non_apartment";
  region: "capital" | "non_capital";
  officialPriceAtStart: number;      // 임대개시일 당시 기준시가
  rentalStartDate: Date;
  transferDate: Date;
  vacancyPeriods: VacancyPeriod[];   // 공실 기간 (임대 기간 산정에서 제외)
  rentHistory: RentHistory[];        // 임대료 이력 (5% 증액 제한 검증)
  calculatedTax: number;             // transfer-tax 엔진에서 전달
}

interface RentalReductionResult {
  isEligible: boolean;
  ineligibleReasons: IneligibleReason[];
  reductionType: RentalHousingType;
  applicableLawVersion: ReductionLawVersion;
  mandatoryPeriodYears: number;      // 의무임대기간
  effectiveRentalYears: number;      // 실제 임대기간 (공실 제외)
  reductionRate: number;             // 감면율 (0~1)
  reductionAmount: number;           // 감면세액
  longTermDeductionOverride?: number; // 장기보유공제율 override (§97의3)
  warnings: string[];
}

function calculateRentalReduction(
  input: RentalReductionInput,
  ruleSet?: LongTermRentalRuleSet
): RentalReductionResult

// transfer-tax.ts에서 장기보유공제율 override 취득
function getLongTermDeductionOverride(result: RentalReductionResult): number | undefined
```

---

### 3.1-D 서브엔진: 신축·미분양 감면 — `lib/tax-engine/new-housing-reduction.ts`

**역할**: 조세특례제한법 §98의2·§99①~⑥ 기반 신축·미분양주택 감면 판정. 취득 시기별 조문 매트릭스로 적용 조문·감면율·5년 안분 계산.

```typescript
type ReductionScope = "tax_amount" | "capital_gain";

type NewHousingRegion =
  | "nationwide" | "metropolitan" | "non_metropolitan"
  | "outside_overconcentration"; // 수도권 과밀억제권역 외

interface NewHousingReductionInput {
  acquisitionDate: Date;
  transferDate: Date;
  region: NewHousingRegion;
  acquisitionPrice: number;
  exclusiveAreaSquareMeters: number; // 85㎡ 국민주택규모 기준
  isFirstSale: boolean;             // 최초 분양(사업주체로부터 직접 취득)
  hasUnsoldCertificate: boolean;    // 미분양 확인서 보유
  totalCapitalGain: number;         // capital_gain 방식 감면 계산용
  calculatedTax: number;            // tax_amount 방식 감면 계산용
}

interface NewHousingReductionResult {
  isEligible: boolean;
  matchedArticleCode?: string;      // 예: "99-1", "99-5"
  matchedArticle?: string;          // 예: "§99 ①"
  reductionScope?: ReductionScope;
  reductionRate: number;
  reductionAmount: number;
  isWithinFiveYearWindow: boolean;  // 5년 이내 양도 여부
  reducibleGain: number;            // 감면 대상 양도차익 (capital_gain 방식)
  fiveYearRatio: number;            // 5년 안분 비율
  isExcludedFromHouseCount: boolean;
  isExcludedFromMultiHouseSurcharge: boolean;
  warnings: string[];
}

function determineNewHousingReduction(
  input: NewHousingReductionInput,
  matrix?: NewHousingMatrixData
): NewHousingReductionResult
```

**조문 매트릭스 취득 시기:**
| 조문 | 취득 기간 | 감면율 |
|------|----------|--------|
| §98의2 | 1998.5.22~2001.12.31 | 과세특례 |
| §99 ① | 2001.5.23~2003.6.30 | 100% |
| §99 ② | 2009.2.12~2010.2.11 | 신축100%/미분양60% |
| §99 ③ | 2010.2.12~2011.4.30 | 60% |
| §99 ④ | 2012.9.24~2013.4.1 | 100% |
| §99 ⑤ | 2013.4.1~2013.12.31 | 지역별 차등 |
| §99 ⑥ | 2014.1.1~2014.12.31 | 지역별 차등 |

---

### 3.2 취득세 — `lib/tax-engine/acquisition-tax.ts`

> **구현 기준일**: 2026-04-15 (하위 필드명이 아래 실제 구현과 일치하도록 갱신)

```typescript
// ── 입력 (lib/tax-engine/types/acquisition.types.ts) ──
interface AcquisitionTaxInput {
  // 기본 정보
  acquiredBy: 'individual' | 'corporation' | 'government' | 'nonprofit';
  propertyType: PropertyObjectType;    // 12종: housing | land | land_farmland | building | vehicle | ...
  acquisitionCause: AcquisitionCause;  // 16종: purchase | exchange | auction | in_kind_investment |
                                       //        inheritance | inheritance_farmland | gift | burdened_gift |
                                       //        donation | new_construction | extension | reconstruction |
                                       //        reclamation | deemed_major_shareholder | deemed_land_category | deemed_renovation

  // 취득가액 (원인별로 하나만 입력)
  reportedPrice?: number;              // 유상취득 신고가액 (실거래가)
  marketValue?: number;                // 시가인정액 (특수관계인·부담부증여 시가)
  standardValue?: number;              // 시가표준액 (공시가격)
  constructionCost?: number;           // 공사비 (원시취득)
  encumbrance?: number;                // 승계 채무액 (부담부증여 유상분)

  // 면적·물건 특성
  areaSqm?: number;                    // 전용면적 (㎡, 85㎡ 이하 농특세 면제)
  isLuxuryProperty?: boolean;          // 사치성 재산 (§13①, 기본세율 × 5배 중과)
  isRelatedParty?: boolean;            // 특수관계인 거래 (시가 70%~130% 범위 벗어나면 시가 기준)

  // 주택 중과 관련
  houseCountAfter?: number;            // 취득 후 보유 주택 수 (취득 대상 포함)
  isRegulatedArea?: boolean;           // 취득일 기준 조정대상지역 여부

  // 생애최초 감면
  isFirstHome?: boolean;               // 생애최초 주택 취득 (지방세특례제한법 §36의3)
  isMetropolitan?: boolean;            // 수도권 여부 (한도: 4억, 비수도권: 3억)

  // 취득일 (원인별 분기)
  balancePaymentDate?: string;         // 잔금지급일 / 상속개시일 (YYYY-MM-DD)
  registrationDate?: string;           // 등기접수일
  contractDate?: string;               // 증여·기부 계약일
  usageApprovalDate?: string;          // 사용승인서 발급일 (원시취득)
  actualUsageDate?: string;            // 사실상 사용개시일 (원시취득)

  // 간주취득 전용
  deemedInput?: DeemedAcquisitionInput;

  // 기타
  targetDate?: string;                 // 적용 법령 기준일 (YYYY-MM-DD, 기본값: 오늘)
}

// ── 출력 (lib/tax-engine/types/acquisition.types.ts) ──
interface AcquisitionTaxResult {
  // 입력 요약
  propertyType: PropertyObjectType;
  acquisitionCause: AcquisitionCause;
  acquisitionValue: number;            // 실제 적용 취득가액

  // 과세표준
  taxBase: number;                     // 최종 과세표준 (천원 미만 절사)
  taxBaseMethod: TaxBaseMethod;        // actual_price | recognized_market | standard_value | construction_cost | split_onerous | split_gratuitous | installment | deemed_difference

  // 세율
  appliedRate: number;                 // 최종 적용세율 (소수점 5자리)
  rateType: TaxRateType;               // basic | linear_interpolation | reduced_* | surcharge_luxury | surcharge_corporate | surcharge_regulated
  isSurcharged: boolean;
  surchargeReason?: string;

  // 세액
  acquisitionTax: number;              // 취득세 본세
  ruralSpecialTax: number;             // 농어촌특별세
  localEducationTax: number;           // 지방교육세
  totalTax: number;                    // 총 납부세액 (감면 전)

  // 감면
  reductionType?: 'first_home';
  reductionAmount: number;             // 생애최초 감면액 (최대 200만원)
  totalTaxAfterReduction: number;      // 감면 후 최종 납부세액

  // 부담부증여 분리
  burdenedGiftBreakdown?: BurdenedGiftBreakdown;

  // 취득 시기·신고 기한
  acquisitionDate: string;             // 확정 취득일 (YYYY-MM-DD)
  filingDeadline: string;              // 신고 기한 (YYYY-MM-DD)

  // 비과세
  isExempt: boolean;
  exemptionType?: AcquisitionExemptionType;

  // 계산 과정 (결과 UI 상세 표시용)
  steps: AcquisitionCalculationStep[];

  // 메타
  appliedLawDate: string;
  warnings: string[];
  legalBasis: string[];
}
```

**계산 흐름:**

```
calcAcquisitionTax(input) → AcquisitionTaxResult   // lib/tax-engine/acquisition-tax.ts

1. 과세 대상 판정 (acquisition-object.ts)
   └─ 열거주의: 지방세법 §7 12종 과세 대상 + 비과세 6유형

2. 간주취득 판정 (acquisition-deemed.ts)
   ├─ 과점주주 (§7의2①): 비과점→과점 전체 지분율, 과점→증가분
   ├─ 지목변경 (§7의2②): 변경 후 - 변경 전 시가표준액
   └─ 건물 개수 (§7의2③): 개수 후 - 개수 전 시가표준액

3. 취득 시기 확정 (acquisition-timing.ts, §20)
   ├─ 유상취득: 잔금지급일·등기접수일 중 빠른 날
   ├─ 상속: 상속개시일, 신고기한 6개월
   ├─ 증여·기부: 계약일, 신고기한 60일
   └─ 원시취득: 사용승인서 발급일 vs 사실상 사용개시일 중 빠른 날

4. 과세표준 결정 (acquisition-tax-base.ts, §10)
   ├─ 유상: 신고가액 (특수관계인 시가 70%~130% 범위 벗어나면 시가인정액)
   ├─ 무상: 시가인정액 > 시가표준액 순 우선
   ├─ 원시: 공사비
   └─ 부담부증여: 유상분(채무) + 무상분(초과) 분리, 각 과세표준으로 계산

5. 기본세율 결정 (acquisition-tax-rate.ts, §11)
   ├─ 매매 주택: 6억↓ 1% / 6~9억 선형보간(BigInt) / 9억↑ 3%
   ├─ 매매 토지·건물: 4%
   ├─ 상속: 2.8% (농지inheritance_farmland: 2.3%)
   ├─ 증여·부담부증여 무상분: 3.5%
   └─ 원시취득: 2.8%

6. 중과세 판정 (acquisition-tax-surcharge.ts, §13·§13의2)
   ├─ 사치성 재산 (§13①): 기본세율 × 5배 (골프장·별장·고급주택·고급오락장·고급선박)
   ├─ 법인 주택 유상취득 (§13의2): 12%
   └─ 다주택 조정지역 (§13의2): 2주택 8% / 3주택+ 12%

7. 세액 계산
   ├─ 선형보간 구간: calcLinearInterpolationTax(taxBase) — BigInt 정밀 계산
   ├─ 부담부증여: 유상분·무상분 각각 적용세율 × 과세표준 합산
   └─ 일반: Math.floor(taxBase × finalRate)

8. 부가세 합산 (acquisition-tax-rate.ts)
   ├─ 농어촌특별세: 취득세 본세 × 10% (85㎡ 이하 주택 면제)
   └─ 지방교육세: 취득세 본세 × 20%

9. 생애최초 감면 적용 (지방세특례제한법 §36의3)
   ├─ 조건: 주택·유상취득·개인·취득가액 수도권 4억·비수도권 3억 이하
   └─ 감면액 = min(acquisitionTax, 2,000,000)
```

**선형보간 구현 (BigInt):**

```typescript
// acquisition-tax-rate.ts — linearInterpolationRate()
// 6억 이하: 1%, 9억 이상: 3%, 그 사이: (취득가액 × 2 - 9억) ÷ 300억
function linearInterpolationRate(value: number): number {
  if (value <= 600_000_000) return 0.01;
  if (value >= 900_000_000) return 0.03;
  const numerator = BigInt(value) * 2n - 900_000_000n;
  const rate = Number(numerator) / 30_000_000_000;
  return Math.round(rate * 100_000) / 100_000; // 소수점 5자리
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
