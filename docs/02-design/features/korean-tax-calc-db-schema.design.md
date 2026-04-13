# Korean Tax Calc — DB 스키마 설계 (Design Document)

> PDCA Design Phase | 2026-04-13
> Plan Reference: `docs/01-plan/features/korean-tax-calc.plan.md`
> PRD Reference: `docs/00-pm/korean-tax-calc.prd.md`
> Architecture: **Option C — Pragmatic Balance** (Plan 원안 유지)
> Tech Stack: Supabase (PostgreSQL 15) + TypeScript 5.x strict + Zod

---

## Context Anchor

| Dimension | Content |
|-----------|---------|
| **WHY** | 세법 개정 시 코드 배포 없이 DB 행 추가만으로 세율 업데이트 가능한 구조 필요. 6대 세금 통합 관리 |
| **WHO** | 부동산 매도 예정자(40-60대), 공인중개사·세무사(B2B), 부동산 투자자 |
| **RISK** | jsonb 구조 변경 시 Zod 스키마 동기화 실패, 세율 데이터 무결성, effective_date 중복 |
| **SUCCESS** | 6대 세금 세율 정확 관리, 과거 시점 세율 조회, 시딩 멱등성, RLS 정책 적용 |
| **SCOPE** | tax_rates, regulated_areas, standard_prices, calculations, users — 5개 핵심 테이블 |

---

## 1. Overview

### 1.1 설계 범위

양도소득세를 포함한 6대 세금 계산에 필요한 DB 스키마를 설계한다. Plan 문서의 **Option C (Pragmatic Balance)** 아키텍처를 따라:

- **통합 `tax_rates` 테이블** 1개로 6개 세금 타입의 세율·공제·특례를 관리
- `category` 컬럼으로 데이터 유형 구분 (progressive_rate, deduction, surcharge, special, fair_market_ratio)
- `jsonb` 컬럼에 세율·공제·특례 데이터를 저장하고 **Zod 스키마**로 타입 안전성 확보
- `effective_date` 기반 시점별 세율 조회 (과거 세율 보존)

### 1.2 설계 원칙

| 원칙 | 설명 |
|------|------|
| **DB 기반 세율 관리** | 세율을 코드에 하드코딩하지 않음. DB 행 추가로 세법 개정 대응 |
| **시점별 세율 보존** | `effective_date` 기반 조회 — 과거 양도 건에도 당시 세율 적용 가능 |
| **jsonb + Zod** | 유연한 jsonb 구조 + 런타임 Zod safeParse로 타입 가드 |
| **멱등성 시딩** | `ON CONFLICT DO UPDATE`로 시딩 스크립트 반복 실행 가능 |
| **RLS 최소 권한** | 세율은 SELECT만 공개, 수정은 service_role 전용 |

---

## 2. 테이블 상세 설계

### 2.1 tax_rates — 통합 세율 테이블

6대 세금의 세율·공제·감면·중과세·특례를 하나의 테이블에서 관리한다.

```sql
CREATE TABLE tax_rates (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tax_type        text NOT NULL,
  -- 'transfer' | 'inheritance' | 'gift' | 'acquisition' | 'property' | 'comprehensive_property'

  category        text NOT NULL,
  -- 'progressive_rate'    : 누진세율 구간
  -- 'deduction'           : 공제/감면 규칙
  -- 'surcharge'           : 중과세율
  -- 'special'             : 특례/유예/경과규정
  -- 'fair_market_ratio'   : 공정시장가액비율

  sub_category    text NOT NULL DEFAULT '_default',
  -- 동일 category 내 세부 규칙을 구분하는 키
  -- progressive_rate : '_default' (세금당 1건)
  -- deduction        : 'long_term_holding', 'basic', 'self_farming', 'long_term_rental',
  --                    'new_housing', 'unsold_housing', 'personal', 'financial',
  --                    'cohabitation', 'farming', 'business', 'gift_exemption' 등
  -- surcharge        : 'multi_house', 'non_business_land', 'unregistered', 'luxury' 등
  -- special          : 'one_house_exemption', 'temporary_two_house', 'suspension' 등
  -- fair_market_ratio: '_default' (세금당 1건)

  effective_date  date NOT NULL,
  -- 해당 세율이 적용되기 시작하는 날짜
  -- 조회: effective_date <= targetDate 중 가장 최근 레코드

  rate_table      jsonb,
  -- 구간별 세율 데이터 (Zod 검증 필수)
  -- 예: { "brackets": [{ "min": 0, "max": 14000000, "rate": 0.06 }, ...] }

  deduction_rules jsonb,
  -- 공제/감면 규칙
  -- 예: { "type": "self_farming", "maxRate": 1.0, "maxAmount": 100000000, ... }

  special_rules   jsonb,
  -- 중과세/특례/유예 규칙
  -- 예: { "surcharge_suspended": true, "suspended_until": "2026-12-31" }

  is_active       boolean NOT NULL DEFAULT true,
  -- 관리용 플래그 (세율 비활성화). 조회 시 is_active = true 필터

  created_at      timestamptz NOT NULL DEFAULT now(),

  -- 복합 유니크 제약: 동일 세금 타입+카테고리+세부키+시행일에 중복 데이터 방지
  CONSTRAINT uq_tax_rates_type_category_sub_date
    UNIQUE (tax_type, category, sub_category, effective_date)
);

-- 조회 최적화 인덱스
CREATE INDEX idx_tax_rates_lookup
  ON tax_rates (tax_type, category, sub_category, effective_date DESC)
  WHERE is_active = true;

COMMENT ON TABLE tax_rates IS '6대 세금 통합 세율 테이블 — 세법 개정 시 행 추가로 대응';
COMMENT ON COLUMN tax_rates.effective_date IS '세율 시행일. 조회 시 effective_date <= targetDate 중 최신';
COMMENT ON COLUMN tax_rates.sub_category IS '동일 category 내 세부 규칙 구분 키. 단일 규칙만 존재하면 _default';
COMMENT ON COLUMN tax_rates.rate_table IS 'jsonb — Zod safeParse로 타입 검증 필수';
```

#### 2.1.1 tax_type 값 목록

| tax_type | 세금 | 비고 |
|----------|------|------|
| `transfer` | 양도소득세 | v1.0 |
| `inheritance` | 상속세 | v1.1 |
| `gift` | 증여세 | v1.1 |
| `acquisition` | 취득세 | v1.2 |
| `property` | 재산세 | v1.3 |
| `comprehensive_property` | 종합부동산세 | v1.3 |

#### 2.1.2 category 값 목록

| category | 용도 | rate_table 사용 | deduction_rules 사용 | special_rules 사용 |
|----------|------|:-:|:-:|:-:|
| `progressive_rate` | 누진세율 구간 | ✅ | - | - |
| `deduction` | 공제/감면 | - | ✅ | - |
| `surcharge` | 중과세율 | ✅ | - | ✅ (유예 정보) |
| `special` | 특례/경과규정 | - | - | ✅ |
| `fair_market_ratio` | 공정시장가액비율 | ✅ | - | - |

#### 2.1.3 양도소득세 전용 jsonb 구조

**a) progressive_rate (누진세율)**

```jsonc
// tax_type='transfer', category='progressive_rate'
{
  "brackets": [
    { "min": 0,          "max": 14000000,   "rate": 0.06, "deduction": 0 },
    { "min": 14000001,   "max": 50000000,   "rate": 0.15, "deduction": 1260000 },
    { "min": 50000001,   "max": 88000000,   "rate": 0.24, "deduction": 5760000 },
    { "min": 88000001,   "max": 150000000,  "rate": 0.35, "deduction": 15440000 },
    { "min": 150000001,  "max": 300000000,  "rate": 0.38, "deduction": 19940000 },
    { "min": 300000001,  "max": 500000000,  "rate": 0.40, "deduction": 25940000 },
    { "min": 500000001,  "max": 1000000000, "rate": 0.42, "deduction": 35940000 },
    { "min": 1000000001,                    "rate": 0.45, "deduction": 65940000 }
  ]
}
```

**b) deduction — 장기보유특별공제**

```jsonc
// tax_type='transfer', category='deduction'
// deduction_rules 컬럼 사용
{
  "type": "long_term_holding",
  "general": {
    "ratePerYear": 0.02,
    "maxRate": 0.30,
    "minHoldingYears": 3
  },
  "oneHouseSpecial": {
    "holdingRatePerYear": 0.04,
    "holdingMaxRate": 0.40,
    "residenceRatePerYear": 0.04,
    "residenceMaxRate": 0.40,
    "combinedMaxRate": 0.80,
    "minHoldingYears": 3
  },
  "exclusions": ["multi_house_surcharge", "non_business_land", "unregistered"]
}
```

**c) deduction — 기본공제**

```jsonc
// tax_type='transfer', category='deduction'
{
  "type": "basic_deduction",
  "annualLimit": 2500000,
  "excludeUnregistered": true
}
```

**d) deduction — 감면 (조세특례제한법)**

```jsonc
// tax_type='transfer', category='deduction'
{
  "type": "self_farming",
  "maxRate": 1.0,
  "maxAmount": 100000000,
  "periodYears": 5,
  "cumulativeMax": 200000000,
  "conditions": {
    "minFarmingYears": 8,
    "requiresProof": true,
    "maxResidenceDistance": 30
  }
}
```

```jsonc
// 임대주택 감면
{
  "type": "long_term_rental",
  "conditions": {
    "minRentalYears": 8,
    "maxRentIncreaseRate": 0.05,
    "requiresRegistration": true
  }
}
```

```jsonc
// 신축주택 감면
{
  "type": "new_housing",
  "reductionRates": [
    { "region": "metropolitan", "yearsFromAcquisition": 5, "rate": 0.5 },
    { "region": "non_metropolitan", "yearsFromAcquisition": 5, "rate": 1.0 }
  ]
}
```

```jsonc
// 미분양주택 감면
{
  "type": "unsold_housing",
  "conditions": {
    "region": "non_metropolitan",
    "requiresBusinessRegistration": true
  }
}
```

**e) surcharge — 다주택 중과세**

```jsonc
// tax_type='transfer', category='surcharge'
// rate_table 컬럼
{
  "multi_house_2": {
    "additionalRate": 0.20,
    "condition": "regulated_area_2house",
    "referenceDate": "transfer_date"
  },
  "multi_house_3plus": {
    "additionalRate": 0.30,
    "condition": "regulated_area_3house_plus",
    "referenceDate": "transfer_date"
  },
  "non_business_land": {
    "additionalRate": 0.10
  },
  "unregistered": {
    "flatRate": 0.70,
    "excludeDeductions": true,
    "excludeBasicDeduction": true
  }
}
// special_rules 컬럼 (유예 정보)
{
  "surcharge_suspended": true,
  "suspended_types": ["multi_house_2", "multi_house_3plus"],
  "suspended_until": "2026-05-09",
  "legal_basis": "소득세법 부칙 (2024.1.1 시행)"
}
```

**f) special — 1세대1주택 비과세 규정**

```jsonc
// tax_type='transfer', category='special'
{
  "one_house_exemption": {
    "maxExemptPrice": 1200000000,
    "minHoldingYears": 2,
    "regulatedAreaMinResidenceYears": 2,
    "prePolicyDate": "2017-08-03",
    "prePolicyExemptResidence": true
  },
  "temporary_two_house": {
    "disposalDeadlineYears": 3,
    "regulatedAreaDeadlineYears": 2,
    "regulatedAreaRelaxDate": "2022-05-10",
    "regulatedAreaRelaxDeadlineYears": 3
  }
}
```

### 2.2 regulated_areas — 조정대상지역

```sql
CREATE TABLE regulated_areas (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  area_code        text NOT NULL,
  -- 법정동코드 (10자리). 시군구 단위: 앞 5자리로 매칭 가능
  area_name        text NOT NULL,
  -- 지역명 (예: '서울특별시 강남구')
  designation_date date NOT NULL,
  -- 조정대상지역 지정일
  release_date     date,
  -- 해제일 (NULL = 현재 지정 중)
  created_at       timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT uq_regulated_areas_code_date
    UNIQUE (area_code, designation_date)
);

CREATE INDEX idx_regulated_areas_lookup
  ON regulated_areas (area_code, designation_date DESC);

COMMENT ON TABLE regulated_areas IS '조정대상지역 이력 — 비과세는 취득일, 중과세는 양도일 기준 조회';
```

#### 2.2.1 조정대상지역 조회 로직

```typescript
// lib/db/regulated-areas.ts
async function isRegulatedArea(
  areaCode: string,
  referenceDate: Date  // 비과세: 취득일, 중과세: 양도일
): Promise<boolean> {
  const { data } = await supabase
    .from('regulated_areas')
    .select('id')
    .eq('area_code', areaCode.substring(0, 5))  // 시군구 단위
    .lte('designation_date', referenceDate.toISOString().split('T')[0])
    .or(`release_date.is.null,release_date.gte.${referenceDate.toISOString().split('T')[0]}`)
    .limit(1);

  return (data?.length ?? 0) > 0;
}
```

### 2.3 standard_prices — 기준시가 (오피스텔·상업용만)

```sql
CREATE TABLE standard_prices (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  price_type      text NOT NULL,
  -- 'officetel' | 'commercial' (공동주택/토지/단독주택은 API 조회)
  address_code    text NOT NULL,
  -- 법정동코드
  detail_address  text NOT NULL,
  -- 동/호 상세
  reference_date  date NOT NULL,
  -- 기준일 (공시 기준년도)
  price           bigint NOT NULL,
  -- 기준시가 (원 단위 정수)
  area_sqm        numeric(10, 2),
  -- 면적 (㎡)
  source          text NOT NULL DEFAULT 'data_go_kr_file',
  raw_data        jsonb,
  created_at      timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT uq_standard_prices_address_date
    UNIQUE (address_code, detail_address, reference_date)
);

CREATE INDEX idx_standard_prices_lookup
  ON standard_prices (address_code, reference_date DESC);
```

### 2.4 calculations — 계산 이력

```sql
CREATE TABLE calculations (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                 uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tax_type                text NOT NULL,
  -- 'transfer' | 'inheritance' | 'gift' | 'acquisition' | 'property' | 'comprehensive_property'
  input_data              jsonb NOT NULL,
  -- 사용자 입력 조건 (Zod 검증 후 저장)
  result_data             jsonb NOT NULL,
  -- 계산 결과 상세 (세액, 중간값, 적용 세율 등)
  tax_law_version         text NOT NULL,
  -- 적용된 세율의 effective_date (추적용)
  linked_calculation_id   uuid REFERENCES calculations(id),
  -- 재산세↔종부세 연동 시 상호 참조 (nullable)
  created_at              timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_calculations_user
  ON calculations (user_id, created_at DESC);

-- 사용자당 200건 상한 정책: DB trigger 또는 애플리케이션 레벨 구현
```

### 2.5 users — 사용자 프로필 (Supabase Auth 확장)

```sql
CREATE TABLE users (
  id           uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name text,
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- Auth trigger: 회원가입 시 자동 프로필 생성
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.users (id, display_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();
```

---

## 3. RLS (Row Level Security) 정책

```sql
-- tax_rates: 전체 읽기, 수정은 service_role만
ALTER TABLE tax_rates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tax_rates_select" ON tax_rates
  FOR SELECT USING (true);
-- INSERT/UPDATE/DELETE는 RLS로 차단 → service_role key로만 가능

-- regulated_areas: 전체 읽기, 수정은 service_role만
ALTER TABLE regulated_areas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "regulated_areas_select" ON regulated_areas
  FOR SELECT USING (true);

-- standard_prices: 전체 읽기, 수정은 service_role만
ALTER TABLE standard_prices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "standard_prices_select" ON standard_prices
  FOR SELECT USING (true);

-- calculations: 본인 데이터만 CRUD
ALTER TABLE calculations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "calculations_own" ON calculations
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- users: 본인 프로필만 읽기/수정
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users_own" ON users
  FOR ALL USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);
```

---

## 4. 세율 데이터 조회 패턴

### 4.1 preloadTaxRates — 일괄 로드 (RPC 방식)

2-Layer 아키텍처의 핵심. Orchestrator(Route Handler)에서 1회 쿼리로 필요한 세율을 모두 로드한다.

**DB Function (PostgreSQL):**

`DISTINCT ON`은 PostgreSQL 전용 구문으로 Supabase JS 클라이언트의 `.select()`로는 사용 불가.
따라서 **Supabase RPC (Database Function)** 로 구현하여 `supabase.rpc()` 로 호출한다.

```sql
-- Supabase migration에 포함
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

COMMENT ON FUNCTION preload_tax_rates IS
  '복수 세금 타입의 세율을 1회 호출로 일괄 로드. '
  'tax_type+category+sub_category별 가장 최근 effective_date 레코드 반환';
```

**TypeScript 호출:**

```typescript
// lib/db/tax-rates.ts

interface TaxRateRecord {
  id: string;
  tax_type: string;
  category: string;
  sub_category: string;
  effective_date: string;
  rate_table: unknown;       // jsonb → Zod safeParse 후 타입 확정
  deduction_rules: unknown;
  special_rules: unknown;
}

// key: `${tax_type}:${category}:${sub_category}`
type TaxRatesMap = Map<string, TaxRateRecord>;

async function preloadTaxRates(
  taxTypes: string[],
  targetDate: Date
): Promise<TaxRatesMap> {
  const dateStr = targetDate.toISOString().split('T')[0];

  // RPC 1회 호출 — DB function이 DISTINCT ON 처리
  const { data, error } = await supabase
    .rpc('preload_tax_rates', {
      p_tax_types: taxTypes,
      p_target_date: dateStr,
    });

  if (error) throw new TaxRateNotFoundError(error.message);

  // Map에 적재
  const result: TaxRatesMap = new Map();
  for (const row of data ?? []) {
    const key = `${row.tax_type}:${row.category}:${row.sub_category}`;
    result.set(key, row);
  }

  return result;
}

// 편의 함수: 특정 규칙 조회
function getRate(
  map: TaxRatesMap,
  taxType: string,
  category: string,
  subCategory: string = '_default'
): TaxRateRecord | undefined {
  return map.get(`${taxType}:${category}:${subCategory}`);
}

// 편의 함수: 동일 category의 모든 sub_category 조회
function getRatesByCategory(
  map: TaxRatesMap,
  taxType: string,
  category: string
): TaxRateRecord[] {
  const prefix = `${taxType}:${category}:`;
  return Array.from(map.entries())
    .filter(([key]) => key.startsWith(prefix))
    .map(([, value]) => value);
}
```

**사용 예시:**

```typescript
const rates = await preloadTaxRates(['transfer'], transferDate);

// 누진세율 (1건)
const progressive = getRate(rates, 'transfer', 'progressive_rate');

// 모든 공제 규칙 (장기보유, 기본공제, 자경농지 등 복수)
const deductions = getRatesByCategory(rates, 'transfer', 'deduction');

// 특정 공제 규칙
const longTermHolding = getRate(rates, 'transfer', 'deduction', 'long_term_holding');
```
```

### 4.2 Zod safeParse 타입 가드

```typescript
// lib/tax-engine/schemas/rate-table.schema.ts

import { z } from 'zod';

// 누진세율 구간 스키마
const bracketSchema = z.object({
  min: z.number().int().nonnegative().optional().default(0),
  max: z.number().int().positive().optional(),  // 최상위 구간은 max 없음
  rate: z.number().min(0).max(1),
  deduction: z.number().int().nonnegative().optional().default(0),
});

export const progressiveRateSchema = z.object({
  brackets: z.array(bracketSchema).min(1),
});

// 공제/감면 스키마 (discriminatedUnion)
const longTermHoldingSchema = z.object({
  type: z.literal('long_term_holding'),
  general: z.object({
    ratePerYear: z.number(),
    maxRate: z.number(),
    minHoldingYears: z.number().int(),
  }),
  oneHouseSpecial: z.object({
    holdingRatePerYear: z.number(),
    holdingMaxRate: z.number(),
    residenceRatePerYear: z.number(),
    residenceMaxRate: z.number(),
    combinedMaxRate: z.number(),
    minHoldingYears: z.number().int(),
  }),
  exclusions: z.array(z.string()),
});

const basicDeductionSchema = z.object({
  type: z.literal('basic_deduction'),
  annualLimit: z.number().int().positive(),
  excludeUnregistered: z.boolean(),
});

const selfFarmingSchema = z.object({
  type: z.literal('self_farming'),
  maxRate: z.number(),
  maxAmount: z.number().int(),
  periodYears: z.number().int(),
  cumulativeMax: z.number().int(),
  conditions: z.object({
    minFarmingYears: z.number().int(),
    requiresProof: z.boolean(),
    maxResidenceDistance: z.number().int(),
  }),
});

export const deductionRulesSchema = z.discriminatedUnion('type', [
  longTermHoldingSchema,
  basicDeductionSchema,
  selfFarmingSchema,
  // 추가 감면 스키마...
]);

// 중과세 스키마
export const surchargeRateSchema = z.object({
  multi_house_2: z.object({
    additionalRate: z.number(),
    condition: z.string(),
    referenceDate: z.literal('transfer_date'),
  }).optional(),
  multi_house_3plus: z.object({
    additionalRate: z.number(),
    condition: z.string(),
    referenceDate: z.literal('transfer_date'),
  }).optional(),
  non_business_land: z.object({
    additionalRate: z.number(),
  }).optional(),
  unregistered: z.object({
    flatRate: z.number(),
    excludeDeductions: z.boolean(),
    excludeBasicDeduction: z.boolean(),
  }).optional(),
});

// 런타임 사용 예시
function parseRateTable(raw: unknown) {
  const result = progressiveRateSchema.safeParse(raw);
  if (!result.success) {
    throw new TaxRateValidationError(result.error.message);
  }
  return result.data;
}
```

---

## 5. 시딩 전략

### 5.1 양도소득세 시딩 데이터 (Phase 1)

```typescript
// scripts/seed-transfer-tax-rates.ts

const transferTaxSeeds = [
  // 1. 누진세율 (2023.1.1~ 현행)
  {
    tax_type: 'transfer',
    category: 'progressive_rate',
    effective_date: '2023-01-01',
    rate_table: {
      brackets: [
        { min: 0, max: 14000000, rate: 0.06, deduction: 0 },
        { min: 14000001, max: 50000000, rate: 0.15, deduction: 1260000 },
        { min: 50000001, max: 88000000, rate: 0.24, deduction: 5760000 },
        { min: 88000001, max: 150000000, rate: 0.35, deduction: 15440000 },
        { min: 150000001, max: 300000000, rate: 0.38, deduction: 19940000 },
        { min: 300000001, max: 500000000, rate: 0.40, deduction: 25940000 },
        { min: 500000001, max: 1000000000, rate: 0.42, deduction: 35940000 },
        { min: 1000000001, rate: 0.45, deduction: 65940000 },
      ],
    },
    is_active: true,
  },

  // 2. 장기보유특별공제
  {
    tax_type: 'transfer',
    category: 'deduction',
    sub_category: 'long_term_holding',
    effective_date: '2023-01-01',
    deduction_rules: {
      type: 'long_term_holding',
      general: { ratePerYear: 0.02, maxRate: 0.30, minHoldingYears: 3 },
      oneHouseSpecial: {
        holdingRatePerYear: 0.04, holdingMaxRate: 0.40,
        residenceRatePerYear: 0.04, residenceMaxRate: 0.40,
        combinedMaxRate: 0.80, minHoldingYears: 3,
      },
      exclusions: ['multi_house_surcharge', 'non_business_land', 'unregistered'],
    },
    is_active: true,
  },

  // 3. 기본공제
  {
    tax_type: 'transfer',
    category: 'deduction',
    sub_category: 'basic',
    effective_date: '2023-01-01',
    deduction_rules: {
      type: 'basic_deduction',
      annualLimit: 2500000,
      excludeUnregistered: true,
    },
    is_active: true,
  },

  // 4. 중과세율
  {
    tax_type: 'transfer',
    category: 'surcharge',
    sub_category: '_default',
    effective_date: '2023-01-01',
    rate_table: {
      multi_house_2: { additionalRate: 0.20, condition: 'regulated_area_2house', referenceDate: 'transfer_date' },
      multi_house_3plus: { additionalRate: 0.30, condition: 'regulated_area_3house_plus', referenceDate: 'transfer_date' },
      non_business_land: { additionalRate: 0.10 },
      unregistered: { flatRate: 0.70, excludeDeductions: true, excludeBasicDeduction: true },
    },
    special_rules: {
      surcharge_suspended: true,
      suspended_types: ['multi_house_2', 'multi_house_3plus'],
      suspended_until: '2026-05-09',
      legal_basis: '소득세법 부칙',
    },
    is_active: true,
  },

  // 5. 1세대1주택 비과세 특례
  {
    tax_type: 'transfer',
    category: 'special',
    sub_category: 'one_house_exemption',
    effective_date: '2023-01-01',
    special_rules: {
      one_house_exemption: {
        maxExemptPrice: 1200000000,
        minHoldingYears: 2,
        regulatedAreaMinResidenceYears: 2,
        prePolicyDate: '2017-08-03',
        prePolicyExemptResidence: true,
      },
      temporary_two_house: {
        disposalDeadlineYears: 3,
        regulatedAreaDeadlineYears: 2,
        regulatedAreaRelaxDate: '2022-05-10',
        regulatedAreaRelaxDeadlineYears: 3,
      },
    },
    is_active: true,
  },

  // 6. 감면 — 8년 자경 농지
  {
    tax_type: 'transfer',
    category: 'deduction',
    sub_category: 'self_farming',
    effective_date: '2023-01-01',
    deduction_rules: {
      type: 'self_farming',
      maxRate: 1.0,
      maxAmount: 100000000,
      periodYears: 5,
      cumulativeMax: 200000000,
      conditions: { minFarmingYears: 8, requiresProof: true, maxResidenceDistance: 30 },
    },
    is_active: true,
  },
];

// 멱등성 시딩 실행
async function seedTransferTaxRates() {
  for (const seed of transferTaxSeeds) {
    // Zod 검증
    if (seed.rate_table) progressiveRateSchema.safeParse(seed.rate_table);
    if (seed.deduction_rules) deductionRulesSchema.safeParse(seed.deduction_rules);

    // ON CONFLICT DO UPDATE (sub_category 포함)
    const { error } = await supabaseAdmin
      .from('tax_rates')
      .upsert(seed, {
        onConflict: 'tax_type,category,sub_category,effective_date',
      });

    if (error) throw new Error(`Seed failed: ${error.message}`);
  }
}
```

### 5.2 sub_category를 활용한 복수 규칙 관리

`tax_type='transfer'`, `category='deduction'`에 여러 종류의 공제가 있다 (장기보유공제, 기본공제, 자경 농지 등). `sub_category` 컬럼으로 구분하여 UNIQUE 제약 `(tax_type, category, sub_category, effective_date)`을 만족한다.

| category | sub_category | 용도 |
|:---|:---|:---|
| `deduction` | `long_term_holding` | 장기보유특별공제 |
| `deduction` | `basic` | 기본공제 |
| `deduction` | `self_farming` | 자경 농지 감면 |
| `deduction` | `long_term_rental` | 임대주택 감면 |
| `deduction` | `new_housing` | 신축주택 감면 |
| `deduction` | `unsold_housing` | 미분양주택 감면 |
| `surcharge` | `_default` | 중과세율 (단일 규칙) |
| `special` | `one_house_exemption` | 1세대1주택 비과세 |
| `special` | `suspension` | 중과세 유예 |
| `progressive_rate` | `_default` | 누진세율 (세금당 1건) |
| `fair_market_ratio` | `_default` | 공정시장가액비율 (세금당 1건) |

`category`는 5개로 유지하면서, `sub_category`로 세부 규칙을 구분한다. 단일 규칙만 존재하는 경우 `_default`를 사용.

### 5.3 세율 데이터 정합성 검증

운영 중 DB에 직접 행을 추가할 때 잘못된 jsonb 구조가 유입되면 런타임 계산 에러가 발생한다.

**검증 원칙: 시딩 CLI를 통해서만 데이터 변경**

```
세법 개정 → seed 스크립트 수정 → Zod 검증 통과 → DB upsert
                                    ↑
                              자동 검증 게이트
```

1. **시딩 CLI 의무화**: `npm run seed:tax-rates` — 모든 세율 변경은 이 스크립트를 통해서만 수행
2. **Zod 검증 게이트**: 시딩 시 DB 저장 전 반드시 `safeParse` 실행. 실패 시 저장 차단 + 에러 로그
3. **런타임 이중 검증**: `preloadTaxRates` 조회 후에도 `safeParse`로 재검증 — DB에 잘못된 데이터가 있어도 런타임에서 조기 감지
4. **DB CHECK 제약 (보조)**: jsonb 컬럼에 최소 구조 검증 추가

```sql
-- rate_table 최소 구조 검증 (보조 — 주 검증은 Zod)
ALTER TABLE tax_rates ADD CONSTRAINT chk_rate_table_structure
  CHECK (
    rate_table IS NULL
    OR jsonb_typeof(rate_table) = 'object'
  );

ALTER TABLE tax_rates ADD CONSTRAINT chk_deduction_rules_structure
  CHECK (
    deduction_rules IS NULL
    OR jsonb_typeof(deduction_rules) = 'object'
  );
```

---

## 6. Supabase Migration 파일 구조

```
supabase/
  migrations/
    20260413000001_create_tax_rates.sql
    20260413000002_create_regulated_areas.sql
    20260413000003_create_standard_prices.sql
    20260413000004_create_users.sql
    20260413000005_create_calculations.sql
    20260413000006_rls_policies.sql
    20260413000007_indexes.sql
  seed.sql  → scripts/seed-transfer-tax-rates.ts 호출
```

---

## 7. 정수 연산 및 절사 규칙

| 적용 대상 | 절사 함수 | 규칙 |
|-----------|----------|------|
| 양도세 과세표준 | `truncateToThousand(amount)` | 천원 미만 절사 |
| 재산세 과세표준 | `truncateToThousand(amount)` | 천원 미만 절사 |
| 종부세 과세표준 | `truncateToTenThousand(amount)` | 만원 미만 절사 |
| 산출세액 (공통) | `truncateToWon(amount)` | 원 미만 절사 |

```typescript
// lib/tax-engine/tax-utils.ts
export const truncateToThousand = (amount: number): number =>
  Math.floor(amount / 1000) * 1000;

export const truncateToTenThousand = (amount: number): number =>
  Math.floor(amount / 10000) * 10000;

export const truncateToWon = (amount: number): number =>
  Math.floor(amount);
```

모든 금액은 **원(정수)** 단위. DB 컬럼은 `bigint`, TypeScript에서는 `number` (9,007조원 이하 안전).

---

## 8. ERD (Entity Relationship Diagram)

```
┌──────────────────┐     ┌──────────────────┐
│   tax_rates      │     │ regulated_areas   │
│──────────────────│     │──────────────────│
│ id          PK   │     │ id          PK   │
│ tax_type         │     │ area_code        │
│ category         │     │ area_name        │
│ effective_date   │     │ designation_date │
│ rate_table  jsonb│     │ release_date     │
│ deduction_rules  │     │ created_at       │
│ special_rules    │     └──────────────────┘
│ is_active        │
│ created_at       │     ┌──────────────────┐
└──────────────────┘     │ standard_prices   │
                         │──────────────────│
┌──────────────────┐     │ id          PK   │
│   auth.users     │     │ price_type       │
│──────────────────│     │ address_code     │
│ id          PK   │     │ detail_address   │
└───────┬──────────┘     │ reference_date   │
        │                │ price    bigint  │
        │ 1:1            │ area_sqm         │
        ▼                │ source           │
┌──────────────────┐     │ raw_data   jsonb │
│   users          │     │ created_at       │
│──────────────────│     └──────────────────┘
│ id      PK FK    │
│ display_name     │
│ created_at       │
└───────┬──────────┘
        │ 1:N
        ▼
┌──────────────────┐
│  calculations    │
│──────────────────│
│ id          PK   │
│ user_id     FK ──┤──→ users.id
│ tax_type         │
│ input_data  jsonb│
│ result_data jsonb│
│ tax_law_version  │
│ linked_calc_id FK┤──→ calculations.id (self)
│ created_at       │
└──────────────────┘
```

---

## 9. 검증 체크리스트

- [ ] `tax_rates` UNIQUE 제약이 category 세분화로 정상 동작하는지 확인
- [ ] `preloadTaxRates` 쿼리가 1회로 양도소득세 전체 세율(누진+공제+중과+특례) 로드 가능한지 확인
- [ ] Zod `discriminatedUnion`이 `deduction_rules`의 각 감면 유형을 정확히 파싱하는지 확인
- [ ] `regulated_areas` 조회가 지정일/해제일 구간을 정확히 판단하는지 확인
- [ ] RLS 정책이 비로그인 사용자의 세율 조회를 허용하는지 확인
- [ ] `calculations` 200건 상한 정책의 구현 방식 결정 (DB trigger vs 앱 로직)
- [ ] 시딩 스크립트 멱등성 (`ON CONFLICT DO UPDATE`) 검증
- [ ] `bigint` 컬럼과 TypeScript `number` 간 변환 안전성 확인 (Supabase JS는 bigint → string 반환)

---

## 10. 다음 단계

이 DB 스키마 설계를 기반으로:
1. **API 설계** — Route Handler + preloadTaxRates 패턴 상세화
2. **계산 엔진 모듈 설계** — Pure Engine 함수 시그니처, 입출력 타입
3. **UI 컴포넌트 설계** — StepWizard, TransferTaxForm 등

---

## 11. Implementation Guide

### 11.1 구현 순서

1. Supabase migration 파일 생성 (테이블 5개 + RLS + 인덱스)
2. Zod 스키마 파일 (`lib/tax-engine/schemas/rate-table.schema.ts`)
3. DB 조회 유틸 (`lib/db/tax-rates.ts`, `lib/db/regulated-areas.ts`)
4. 시딩 스크립트 (`scripts/seed-transfer-tax-rates.ts`)
5. Supabase CLI 타입 생성 (`supabase gen types typescript`)

### 11.2 핵심 파일 목록

| 파일 | 용도 |
|------|------|
| `supabase/migrations/20260413000001_create_tax_rates.sql` | tax_rates DDL |
| `supabase/migrations/20260413000006_rls_policies.sql` | RLS 정책 |
| `lib/tax-engine/schemas/rate-table.schema.ts` | jsonb Zod 스키마 |
| `lib/db/tax-rates.ts` | preloadTaxRates, getTaxRate |
| `lib/db/regulated-areas.ts` | isRegulatedArea |
| `scripts/seed-transfer-tax-rates.ts` | 양도소득세 세율 시딩 |
| `lib/database.types.ts` | Supabase CLI 자동 생성 타입 |

### 11.3 Session Guide

| Module | 범위 | 예상 파일 수 |
|--------|------|:---:|
| module-1 | DDL + RLS + 인덱스 (migration 파일) | 7 |
| module-2 | Zod 스키마 + DB 조회 유틸 | 3 |
| module-3 | 시딩 스크립트 + 타입 생성 | 2 |
