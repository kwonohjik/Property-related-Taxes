# Korean Tax Calc — Development Plan

> PDCA Plan Phase | 2026-04-13 (v2.0 — 6대 세금 확장)
> PRD Reference: `docs/00-pm/korean-tax-calc.prd.md`
> Roadmap Reference: `docs/00-pm/korean-tax-calc.roadmap.md`
> Tech Stack: Next.js 15 (App Router, React 19, Turbopack) + Supabase (Auth + DB) + Vercel
> Runtime: Node.js 22 LTS | TypeScript 5.x (strict mode)

---

## Executive Summary

| Perspective | Description |
|------------|-------------|
| **Problem** | 한국 부동산 6대 세금(양도소득세·상속세·증여세·취득세·재산세·종합부동산세)은 세율·공제·감면·중과세·연동 규정이 복잡하여 일반인이 정확한 세금을 스스로 계산하기 어렵고, 기존 홈택스는 UX가 불편하며 세금 간 연동 계산을 지원하지 않는다. |
| **Solution** | 최신 세법이 DB 기반으로 자동 반영되는 웹 계산기를 제공한다. 6대 세금의 비과세 판단·감면 자동 적용·세액 계산을 1분 이내에 완료하며, 재산세와 종합부동산세는 자동 연동하여 이중과세 공제까지 처리한다. |
| **Functional UX Effect** | 사용자가 부동산 정보를 입력하면 6가지 세금 중 원하는 항목을 선택해 결과를 즉시 확인하고, 로그인 시 이력을 저장·조회하며 PDF로 출력할 수 있다. |
| **Core Value** | "세금 계산의 민주화" — 세무사 없이도 6대 세금을 정확히 파악하여 의사결정 비용을 줄이고, 전문가에게는 업무 효율화 도구를 제공한다. |

---

## Context Anchor

| Dimension | Content |
|-----------|---------|
| **WHY** | 복잡한 한국 세법으로 일반인의 세금 계산 접근성이 낮고, 특히 재산세↔종부세 연동 계산은 전문가도 까다로운 영역. 홈택스 UX 불만 시장 공백 공략 |
| **WHO** | ① 부동산 매도 예정자(40-60대) ② 공인중개사·세무사(B2B) ③ 부동산 투자자 ④ 상속·증여 계획자 |
| **RISK** | 세금 계산 오류(법적 리스크), 재산세↔종부세 연동 복잡성, 세법 개정 반영 지연 |
| **SUCCESS** | 6가지 세금 계산 정확도 99%+, 재산세↔종부세 연동 검증 통과, 계산 완료율 80%+ |
| **SCOPE** | v1.0~v1.4: 6가지 세금 계산 + 인증 + 이력 저장 + PDF + 기준시가 자동 조회 |

---

## 1. Feature Overview

### 1.1 Feature Name
**KoreanTaxCalc** — 한국 부동산 6대 세금 자동계산 웹 앱

### 1.2 6대 세금 범위

| 세금 | 유형 | 핵심 특징 |
|------|------|----------|
| 양도소득세 | 국세 | 비과세 판단, 중과세, 감면, 기준시가 환산 |
| 상속세 | 국세 | 공제 7종, 재산 평가, 세대생략 할증 |
| 증여세 | 국세 | 관계별 공제, 10년 합산, 재산 평가 |
| 취득세 | 지방세 | 물건·원인별 세율, 중과세, 부가세 합산 |
| 재산세 | 지방세 | 물건별 세율, 1주택 특례, 세부담 상한 |
| 종합부동산세 | 국세 | 합산 과세, **재산세 공제 연동**, 세부담 상한 |

---

## 2. Architecture Overview

### 2.1 기술 스택

| Layer | Technology | Purpose |
|-------|-----------|---------|
| Frontend | Next.js 15 (App Router) | SSR/SSG, SEO, UI (React 19, Turbopack) |
| UI Library | shadcn/ui + Tailwind CSS v4 | 컴포넌트 시스템 |
| Form / Validation | react-hook-form + zod | 다단계 폼 관리 + 입력값 유효성 검증 |
| State Management | zustand | StepWizard 전역 상태 관리 (sessionStorage 연동) |
| Date | date-fns | 보유기간·거주기간 계산, 세율 시점 조회 |
| Decimal | 정수 연산 (원 단위 변환) | 부동소수점 오류 방지 — 금액을 원(정수) 단위로 변환 후 계산 |
| Backend | Next.js Route Handlers + Server Actions | 계산 API는 Route Handler (비로그인 접근+rate limiting), 이력 CRUD·PDF는 Server Actions (로그인 필수) |
| Auth | Supabase Auth | 이메일/소셜 로그인, JWT |
| Database | Supabase (PostgreSQL) | 사용자, 이력, 세율, 기준시가 |
| Type-safe DB | Supabase CLI (`supabase gen types`) | DB 스키마 → TypeScript 타입 자동 생성 |
| Deployment | Vercel | 배포, CDN |
| PDF | @react-pdf/renderer 또는 jsPDF (Phase 6 PoC 후 확정) | PDF 생성 |
| Cache / Rate Limit | Upstash Redis + @upstash/ratelimit | API 프록시 캐싱 + rate limiting |
| Testing | vitest + @testing-library/react | 계산 엔진 단위 테스트 + 컴포넌트 테스트 |
| E2E Testing | Playwright | 다단계 폼 플로우 자동 검증 |
| Monitoring | @sentry/nextjs | 에러 트래킹 + 런타임 오류 감지 |
| Language | TypeScript 5.x (strict mode) | 타입 안전성 |
| Runtime | Node.js 22 LTS | 2026 시점 Active LTS |

### 2.2 데이터 모델

#### 핵심 설계 결정: DB 기반 세율 관리
세율·공제한도·공정시장가액비율을 코드가 아닌 DB로 관리하여 세법 변경 시 배포 없이 업데이트 가능.

```sql
-- 세율 테이블 (6개 세금 타입 통합)
tax_rates
  - id              uuid PK
  - tax_type        text  -- 'transfer' | 'inheritance' | 'gift' | 'acquisition'
                          -- | 'property' | 'comprehensive_property'
  - category        text  -- 'progressive_rate' | 'deduction' | 'surcharge'
                          -- | 'special' | 'fair_market_ratio'
  - effective_date  date
  - rate_table      jsonb       -- 구간별 세율
  - deduction_rules jsonb       -- 공제/감면 규칙
  - special_rules   jsonb       -- 중과세/특례/연동 규칙 (예: { "surcharge_suspended": true, "suspended_until": "2026-12-31" })
  - is_active       boolean
  - created_at      timestamptz

-- 기준시가/공시가격 데이터 (오피스텔·상업용 파일 적재 전용, 수도권+광역시 한정)
-- 공동주택/토지/단독주택은 국토부 API 프록시 + Upstash Redis 24h 캐싱 (DB 미적재)
standard_prices
  - id              uuid PK
  - price_type      text  -- 'officetel' | 'commercial' (API 조회 대상은 미적재)
  - address_code    text        -- 법정동코드
  - detail_address  text        -- 동/호 상세
  - reference_date  date        -- 기준일
  - price           bigint      -- 기준시가 (원)
  - area_sqm        numeric     -- 면적 (㎡)
  - source          text        -- 'data_go_kr_file'
  - raw_data        jsonb
  - created_at      timestamptz

-- 사용자 (Supabase Auth 확장)
users
  - id              uuid PK (auth.users 연동)
  - display_name    text
  - created_at      timestamptz

-- 계산 이력
calculations
  - id                      uuid PK
  - user_id                 uuid FK -> users
  - tax_type                text (6 types)
  - input_data              jsonb   -- 입력 조건
  - result_data             jsonb   -- 계산 결과 상세
  - tax_law_version         text    -- 적용 세율 버전
  - linked_calculation_id   uuid FK -> calculations (nullable)
    -- 재산세↔종합부동산세 연동 시 상호 참조
  - created_at              timestamptz

-- 인덱스
idx_tax_rates_lookup ON tax_rates (tax_type, category, effective_date DESC)
idx_regulated_areas_lookup ON regulated_areas (area_code, designation_date DESC)
idx_calculations_user ON calculations (user_id, created_at DESC)
```

### 2.3 페이지 구조 (App Router)

```
app/
  page.tsx                              # 랜딩 (세금 종류 선택)
  calc/
    transfer-tax/page.tsx               # 양도소득세 계산기
    inheritance-tax/page.tsx            # 상속세 계산기
    gift-tax/page.tsx                   # 증여세 계산기
    acquisition-tax/page.tsx            # 취득세 계산기
    property-tax/page.tsx               # 재산세 계산기
    comprehensive-tax/page.tsx          # 종합부동산세 계산기 (재산세 자동 연동)
  result/[id]/page.tsx                  # 계산 결과 상세
  history/page.tsx                      # 계산 이력
  auth/
    login/page.tsx
    signup/page.tsx
  guide/
    page.tsx                            # 세금 가이드 목록
    [slug]/page.tsx
  api/
    calc/transfer/route.ts
    calc/inheritance/route.ts
    calc/gift/route.ts
    calc/acquisition/route.ts
    calc/property/route.ts
    calc/comprehensive/route.ts         # 내부에서 property 엔진 호출
    history/route.ts
    pdf/route.ts
    standard-price/route.ts             # 기준시가 조회 프록시
```

### 2.4 계산 엔진 아키텍처 — 2-레이어 설계

```
Layer 1 (Orchestrator — API Route/Server Action)
  → 필요한 세율 데이터를 한 번에 프리로드 (DB 쿼리 1~2회로 통합)
  → 순수 계산 엔진 호출 (세율 데이터를 매개변수로 전달)
  → 결과 반환 / 이력 저장

Layer 2 (Pure Engine — tax-engine/*.ts)
  → DB 직접 호출 없음, 세율 데이터를 매개변수로 받아 순수 계산만 수행
  → 장점: 테스트 시 DB mock 불필요, 함수 단독 테스트 가능
  → 종부세 엔진도 재산세 엔진을 직접 호출하되, 세율은 상위에서 전달받음

// 예시: API Route (orchestrator)
const rates = await preloadTaxRates(
  ['comprehensive_property', 'property'], targetDate
);  // DB 쿼리 1회로 2개 세금 세율 모두 로드
const result = calculateComprehensiveTax(input, rates);  // 순수 함수
```

### 2.5 핵심 모듈 구조

```
lib/
  tax-engine/
    transfer-tax.ts              # [구현됨] 양도소득세 계산 엔진 (Orchestrator 통합 진입점)
    multi-house-surcharge.ts     # [구현됨] 다주택 중과세 전담 엔진 (§104·§167-3·§167-10)
                                 #   주택 수 산정, 배제(상속·임대·오피스텔), 일시적2주택·혼인합가·동거봉양 특례
    non-business-land.ts         # [구현됨] 비사업용 토지 판정 엔진 (§104의3·시행령 §168의6~14)
                                 #   사업용 기간 비율, 유예기간, 이력 판정
    rental-housing-reduction.ts  # [구현됨] 장기임대주택 감면 엔진 (조특법 §97·§97의3·§97의4·§97의5)
                                 #   유형별(장기일반·공공지원·공공임대) 감면율·의무기간·임대료제한 검증
    new-housing-reduction.ts     # [구현됨] 신축·미분양주택 감면 엔진 (조특법 §99·§99의3·§98의2)
                                 #   시기별·지역별 감면율 매트릭스, 5년 안분 계산
    inheritance-tax.ts           # 상속세 계산 엔진
    gift-tax.ts                  # 증여세 계산 엔진
    acquisition-tax.ts           # 취득세 계산 엔진
    property-tax.ts              # 재산세 계산 엔진
    comprehensive-tax.ts         # 종합부동산세 계산 엔진
      → property-tax.ts를 import하여 재산세 자동 계산 + 공제
    tax-utils.ts                 # [구현됨] 공통 유틸 (누진세율, 정수 연산, 절사, 보유기간)
    tax-errors.ts                # [구현됨] 에러 코드 (TaxRateNotFoundError 등)
    schemas/
      rate-table.schema.ts       # [구현됨] jsonb 입출력 Zod 검증 스키마
                                 #   (진세율·감면·중과·주택수배제·조정지역이력·임대·신축 파서 포함)
    standard-price.ts            # 기준시가 조회 (API + DB)
  db/
    tax-rates.ts                 # [구현됨] DB 세율 조회 + preloadTaxRates() 일괄 로드 함수
    regulated-areas.ts           # [구현됨] 조정대상지역 DB 조회 유틸
    calculations.ts              # 계산 이력 CRUD + 보존 정책 (200건 상한)
    standard-prices.ts           # 기준시가 DB 조회
  stores/
    calc-wizard-store.ts         # [구현됨] zustand store (TransferFormData 포함, sessionStorage persist)
  database.types.ts              # Supabase CLI 자동 생성 타입
app/
  calc/
    transfer-tax/
      page.tsx                   # [구현됨] 양도소득세 계산기 페이지
      TransferTaxCalculator.tsx  # [구현됨] 5단계 StepWizard + 결과 표시 통합 컴포넌트
      loading.tsx                # [구현됨] 로딩 UI
      error.tsx                  # [구현됨] 에러 바운더리
    layout.tsx                   # [구현됨] /calc 공통 레이아웃
  api/calc/transfer/route.ts     # [구현됨] Route Handler (Orchestrator 패턴)
components/
  calc/
    StepIndicator.tsx            # [구현됨] 공통 단계 인디케이터
    inputs/
      CurrencyInput.tsx          # [구현됨] 금액 입력 컴포넌트 (parseAmount, formatKRW 포함)
    shared/
      DisclaimerBanner.tsx       # [구현됨] 면책 고지 공통 배너
      LoginPromptBanner.tsx      # [구현됨] 비로그인 결과 저장 유도 배너
    InheritanceTaxForm.tsx       # 상속세 입력
    GiftTaxForm.tsx              # 증여세 입력
    AcquisitionTaxForm.tsx       # 취득세 입력
    PropertyTaxForm.tsx          # 재산세 입력
    ComprehensiveTaxForm.tsx     # 종부세 입력 (다주택 목록)
    PropertyListInput.tsx        # 복수 물건 입력 컴포넌트
    LinkedTaxResult.tsx          # 재산세↔종부세 연동 결과 표시
  ui/
    address-search.tsx           # [구현됨] Vworld 주소 검색 컴포넌트
    date-input.tsx               # [구현됨] 날짜 입력 컴포넌트 (연도 6자리 버그 해결)
    (기타 shadcn/ui 컴포넌트)
__tests__/
  tax-engine/
    transfer-tax.test.ts         # [구현됨] 양도소득세 엔진 단위 테스트
    multi-house-surcharge.test.ts # [구현됨] 다주택 중과세 엔진 단위 테스트
    non-business-land.test.ts    # [구현됨] 비사업용 토지 판정 단위 테스트
    rental-housing-reduction.test.ts # [구현됨] 장기임대 감면 단위 테스트
    new-housing-reduction.test.ts    # [구현됨] 신축·미분양 감면 단위 테스트
    tax-utils.test.ts            # [구현됨] 공통 유틸 단위 테스트
```

### 2.5 재산세↔종합부동산세 연동 아키텍처

```
[사용자 입력: 보유 주택 목록 (공시가격, 유형, 면적)]
        │
        ▼
┌─── comprehensive-tax.ts ──────────────┐
│                                        │
│  Step 1. 공시가격 합산                  │
│  Step 2. 기본공제 차감 (9억/12억)       │
│  Step 3. 공정시장가액비율 적용 (60%)    │
│  Step 4. 과세표준 → 누진세율 → 산출세액 │
│  Step 5. 1세대1주택 공제 (고령자+장기)  │
│           │                            │
│           ▼                            │
│  ┌── property-tax.ts 호출 ──────┐      │
│  │  각 주택별 재산세 자동 계산    │      │
│  │  (세율 적용 + 부가세 합산)    │      │
│  │  → 재산세 합계 반환           │      │
│  └──────────────────────────────┘      │
│           │                            │
│           ▼                            │
│  Step 6. 재산세 비율 안분 공제           │
│  Step 7. 세부담 상한 적용               │
│  Step 8. 농어촌특별세 가산 (20%)        │
│           │                            │
│           ▼                            │
│  [최종 결과: 종부세 + 재산세 + 농특세]   │
│  [UI: LinkedTaxResult로 연동 표시]      │
└────────────────────────────────────────┘
```

---

## 3. Implementation Plan

### Phase 1: 기반 환경 구축 (3~4일) [v1.0]

- [ ] Next.js 15 프로젝트 초기화 (App Router, TypeScript 5.x strict, ESLint, Prettier, Turbopack)
- [ ] Supabase 프로젝트 생성 및 환경변수 설정 (.env.local)
- [ ] shadcn/ui + Tailwind CSS v4 설치 및 테마 설정
- [ ] 핵심 라이브러리 설치: `react-hook-form`, `zod`, `zustand`, `date-fns`
- [ ] 테스트 환경 설정: `vitest` + `@testing-library/react` + `Playwright`
- [ ] DB 스키마 생성 — `tax_rates`, `standard_prices`, `users`, `calculations`
- [ ] Supabase RLS 정책 설정
  - `calculations`: 본인 데이터만 CRUD (`auth.uid() = user_id`)
  - `tax_rates`: SELECT만 허용 (전체 읽기), INSERT/UPDATE/DELETE는 service_role만 가능
  - `regulated_areas`: SELECT만 허용, 수정은 service_role만 가능
  - `standard_prices`: SELECT만 허용, 수정은 service_role만 가능
  - 시딩 CLI와 Admin은 **service_role key**를 사용하여 RLS 우회
- [ ] `transfer` 세율 데이터만 시딩 (나머지 세금은 해당 Phase에서 시딩)
  - transfer: 누진세율, 장기보유공제율, 중과세율, 감면율
  - 시딩 스크립트는 `ON CONFLICT DO UPDATE`로 멱등성 보장
- [ ] 조정대상지역 데이터 시딩 (`regulated_areas` 테이블 — 법정동코드, 지정일, 해제일)
- [ ] jsonb 스키마 공통 인터페이스 설계 + **Zod 검증 레이어**
  - 공통: `{ brackets: [{ min, max, rate, deduction }] }` 형태
  - 세금별 확장: 취득세 매트릭스, 재산세 특례 등
  - **취득세 매트릭스(rate_table) jsonb 구조** (acquisition 전용):
    ```json
    {
      "matrix": [
        { "propertyType": "housing", "cause": "purchase", "brackets": [
            { "max": 600000000, "rate": 0.01 },
            { "min": 600000001, "max": 899999999, "type": "linear_interpolation" },
            { "min": 900000000, "rate": 0.03 }
        ]},
        { "propertyType": "housing", "cause": "inheritance", "rate": 0.028 },
        { "propertyType": "housing", "cause": "inheritance_farmland", "rate": 0.023 },
        { "propertyType": "housing", "cause": "gift", "rate": 0.035 },
        { "propertyType": "housing", "cause": "original", "rate": 0.028 },
        { "propertyType": "housing", "cause": "auction", "brackets": "same_as_purchase" },
        { "propertyType": "land", "cause": "purchase", "rate": 0.04 },
        { "propertyType": "building", "cause": "purchase", "rate": 0.04 }
      ],
      "surcharge": [
        { "condition": "regulated_2house", "rate": 0.08 },
        { "condition": "regulated_3house_plus", "rate": 0.12 },
        { "condition": "corporate", "rate": 0.12 },
        { "condition": "luxury_golf", "rate": "기본+중과" },
        { "condition": "luxury_housing", "rate": "기본+중과" },
        { "condition": "luxury_entertainment", "rate": "기본+중과" },
        { "condition": "luxury_vessel", "rate": "기본+중과" }
      ],
      "linearInterpolation": {
        "min": 600000000, "max": 900000000,
        "formula": "(value * 2 / 300000000 - 3) / 100",
        "precision": 5
      },
      "additionalTax": {
        "ruralSpecialTax": { "baseRate": 0.02, "surchargeRate": 0.10, "exemptAreaSqm": 85 },
        "localEducationTax": { "baseRate": 0.02, "rate": 0.20 }
      }
    }
    ```
  - **재산세 세율(rate_table) jsonb 구조** (property 전용):
    ```json
    {
      "housing": {
        "general": {
          "brackets": [
            { "max": 60000000, "rate": 0.001 },
            { "min": 60000001, "max": 150000000, "rate": 0.0015, "deduction": 30000 },
            { "min": 150000001, "max": 300000000, "rate": 0.0025, "deduction": 180000 },
            { "min": 300000001, "rate": 0.004, "deduction": 630000 }
          ]
        },
        "oneHouseSpecial": {
          "condition": { "maxAssessedValue": 900000000, "isOneHousehold": true },
          "brackets": [
            { "max": 60000000, "rate": 0.0005 },
            { "min": 60000001, "max": 150000000, "rate": 0.001, "deduction": 30000 },
            { "min": 150000001, "max": 300000000, "rate": 0.002, "deduction": 180000 },
            { "min": 300000001, "rate": 0.0035, "deduction": 630000 }
          ]
        }
      },
      "land": {
        "aggregate": { "brackets": [
          { "max": 50000000, "rate": 0.002 },
          { "min": 50000001, "max": 100000000, "rate": 0.003, "deduction": 50000 },
          { "min": 100000001, "rate": 0.005, "deduction": 250000 }
        ]},
        "separate": { "brackets": [
          { "max": 200000000, "rate": 0.002 },
          { "min": 200000001, "max": 1000000000, "rate": 0.003, "deduction": 200000 },
          { "min": 1000000001, "rate": 0.004, "deduction": 1200000 }
        ]},
        "special": [
          { "type": "farmland", "rate": 0.0007 },
          { "type": "golf_luxury", "rate": 0.04 },
          { "type": "other", "rate": 0.002 }
        ]
      },
      "building": {
        "general": { "rate": 0.0025 },
        "golf_luxury": { "rate": 0.04 }
      },
      "fairMarketRatio": {
        "housing": 0.60,
        "land_building": 0.70
      },
      "taxCapRates": {
        "housing": [
          { "maxAssessedValue": 300000000, "capRate": 1.05 },
          { "maxAssessedValue": 600000000, "capRate": 1.10 },
          { "minAssessedValue": 600000001, "capRate": 1.30 }
        ],
        "land": { "capRate": 1.50 }
      },
      "urbanAreaTax": { "rate": 0.0014 },
      "localEducationTax": { "rate": 0.20 }
    }
    ```
  - **종합부동산세 세율(rate_table) jsonb 구조** (comprehensive_property 전용):
    ```json
    {
      "housing": {
        "progressive": {
          "brackets": [
            { "max": 300000000, "rate": 0.005 },
            { "min": 300000001, "max": 600000000, "rate": 0.007, "deduction": 600000 },
            { "min": 600000001, "max": 1200000000, "rate": 0.010, "deduction": 2400000 },
            { "min": 1200000001, "max": 2500000000, "rate": 0.013, "deduction": 6000000 },
            { "min": 2500000001, "max": 5000000000, "rate": 0.015, "deduction": 11000000 },
            { "min": 5000000001, "max": 9400000000, "rate": 0.020, "deduction": 36000000 },
            { "min": 9400000001, "rate": 0.027, "deduction": 101800000 }
          ]
        },
        "basicDeduction": {
          "general": 900000000,
          "oneHouseOwner": 1200000000
        },
        "fairMarketRatio": 0.60,
        "oneHouseDeductions": {
          "senior": [
            { "minAge": 60, "maxAge": 64, "rate": 0.20 },
            { "minAge": 65, "maxAge": 69, "rate": 0.30 },
            { "minAge": 70, "rate": 0.40 }
          ],
          "longTerm": [
            { "minYears": 5, "maxYears": 9, "rate": 0.20 },
            { "minYears": 10, "maxYears": 14, "rate": 0.40 },
            { "minYears": 15, "rate": 0.50 }
          ],
          "combinedMax": 0.80
        }
      },
      "land": {
        "aggregate": {
          "basicDeduction": 500000000,
          "fairMarketRatio": 1.00,
          "brackets": [
            { "max": 1500000000, "rate": 0.01 },
            { "min": 1500000001, "max": 4500000000, "rate": 0.02, "deduction": 15000000 },
            { "min": 4500000001, "rate": 0.03, "deduction": 60000000 }
          ]
        },
        "separate": {
          "basicDeduction": 8000000000,
          "fairMarketRatio": 1.00,
          "brackets": [
            { "max": 20000000000, "rate": 0.005 },
            { "min": 20000000001, "max": 40000000000, "rate": 0.006, "deduction": 20000000 },
            { "min": 40000000001, "rate": 0.007, "deduction": 60000000 }
          ]
        }
      },
      "taxCapRates": {
        "general": 1.50,
        "multipleHousing": 3.00
      },
      "ruralSpecialTax": { "rate": 0.20 }
    }
    ```
  - **상속세·증여세 누진세율(rate_table) jsonb 구조** (inheritance/gift 공통):
    ```json
    {
      "progressive": {
        "brackets": [
          { "max": 100000000, "rate": 0.10 },
          { "min": 100000001, "max": 500000000, "rate": 0.20, "deduction": 10000000 },
          { "min": 500000001, "max": 1000000000, "rate": 0.30, "deduction": 60000000 },
          { "min": 1000000001, "max": 3000000000, "rate": 0.40, "deduction": 160000000 },
          { "min": 3000000001, "rate": 0.50, "deduction": 460000000 }
        ]
      },
      "generationSkip": {
        "defaultRate": 0.30,
        "minorOver2B": 0.40
      },
      "filingDeduction": {
        "rate": 0.03,
        "inheritanceMonths": 6,
        "giftMonths": 3
      }
    }
    ```
  - **감면(deduction_rules) jsonb 구조**: 하이브리드 전략 — 공통 필드(`type`, `maxRate`, `maxAmount`, `periodYears`) + 감면별 조건 필드(`conditions` 객체). 예시:
    ```json
    { "type": "self_farming", "maxRate": 1.0, "maxAmount": 100000000,
      "periodYears": 5, "cumulativeMax": 200000000,
      "conditions": { "minFarmingYears": 8, "requiresProof": true } }
    ```
  - Zod: `z.discriminatedUnion("type", [...])` 사용 시 감면 유형별 조건 필드 검증 가능
  - **증여재산공제(deduction_rules) jsonb 구조** (gift 전용):
    ```json
    { "deductions": [
        { "relationship": "spouse", "limit": 600000000, "periodYears": 10 },
        { "relationship": "lineal_ascendant_adult", "limit": 50000000, "periodYears": 10 },
        { "relationship": "lineal_ascendant_minor", "limit": 20000000, "periodYears": 10 },
        { "relationship": "lineal_descendant", "limit": 50000000, "periodYears": 10 },
        { "relationship": "other_relative", "limit": 10000000, "periodYears": 10 }
    ] }
    ```
  - **상속 인적공제(deduction_rules) jsonb 구조** (inheritance 전용):
    ```json
    { "personalDeductions": {
        "childPerPerson": 50000000,
        "minorFormula": "(20 - age) * 10000000",
        "seniorAge": 65, "seniorPerPerson": 50000000,
        "disabledFormula": "lifeExpectancy * 10000000"
      },
      "lumpSum": 500000000,
      "financial": {
        "fullExemptMax": 20000000,
        "midRangeMax": 100000000, "midRangeFixed": 20000000,
        "overRate": 0.20, "overMax": 200000000
      },
      "cohabitation": {
        "maxDeduction": 600000000, "shareRate": 0.80,
        "requirements": ["10year_cohabitation", "one_house", "heir_no_house", "lineal_descendant", "5year_post_mgmt"]
      },
      "farming": { "maxDeduction": 2000000000, "postMgmtYears": 5 },
      "business": { "maxDeduction": 60000000000, "minMgmtYears": 10, "postMgmtYears": [7, 10] }
    }
    ```
  - **jsonb 입출력 Zod 스키마** (`lib/tax-engine/schemas/rate-table.schema.ts`)
    - `progressiveRateSchema`, `deductionRulesSchema`, `specialRulesSchema` 등
    - 시딩 스크립트에서 DB 저장 전 Zod 검증 (잘못된 구조 조기 차단)
    - 런타임 세율 조회 시 `safeParse`로 타입 가드 (Supabase `Json` → 정확한 타입으로 변환)
- [ ] 공통 유틸 구현 (`tax-utils.ts` — 누진세율 계산, 정수 연산, 절사, 시점별 세율 조회)
  - **정밀 연산 원칙**: 모든 금액을 원(정수) 단위로 변환 후 계산
  - **세금별 절사 유틸** (한국 세법 규정 준수):
    - `truncateToThousand(amount)` — 양도세·재산세 과세표준: 천원 미만 절사
    - `truncateToTenThousand(amount)` — 종부세 과세표준: 만원 미만 절사
    - `truncateToWon(amount)` — 산출세액: 원 미만 절사 (공통)
    - 각 계산 엔진에서 단계별로 적절한 절사 함수 호출
  - 세율 조회: `effective_date <= targetDate` 중 가장 최근 레코드 (과거 세율 지원)
- [ ] Upstash Redis 설정 + @upstash/ratelimit 설치
- [ ] Vercel Edge Middleware rate limiting 구현 (계산 API: 분당 30회)
- [ ] StepWizard 상태 관리 구현 (zustand store + sessionStorage persist middleware)
- [ ] Supabase CLI 타입 생성 설정 (`supabase gen types typescript` → `lib/database.types.ts`)
- [ ] Sentry 설정 (에러 트래킹 + 계산 엔진 런타임 오류 감지)
- [ ] Supabase CLI migration 설정 (`supabase init` + 초기 마이그레이션 생성)
- [ ] DB 인덱스 생성
  - `idx_tax_rates_lookup` ON tax_rates (tax_type, category, effective_date DESC)
  - `idx_regulated_areas_lookup` ON regulated_areas (area_code, designation_date DESC)
  - `idx_calculations_user` ON calculations (user_id, created_at DESC)
- [ ] 계산 이력 보존 정책 구현 (사용자당 최대 200건, 초과 시 가장 오래된 이력 자동 삭제)
- [ ] 세율 데이터 관리 CLI 스크립트 (`npm run seed:tax-rates`) — 세법 개정 시 배포 없이 DB 업데이트
- [ ] Vercel Cron Job 설정 — Supabase keepalive ping (6일 주기, Free tier 자동 pause 방지)
- [ ] 에러 처리 체계 구현
  - 계산 엔진 에러 코드 정의 (`TAX_RATE_NOT_FOUND`, `INVALID_INPUT`, `CALC_TIMEOUT` 등)
  - App Router `error.tsx` / `loading.tsx` 에러 바운더리 (각 calc/ 라우트에 적용)
  - 계산 실패 시 사용자에게 구체적 안내 메시지 + 입력 데이터 유실 방지 (zustand 상태 보존)

### Phase 2: 인증 기능 (1~2일) [v1.0]

- [ ] Supabase Auth 이메일 로그인 구현
- [ ] 구글 소셜 로그인 설정
- [ ] 카카오 소셜 로그인 설정 (카카오 Developer 앱 등록 + 도메인 설정 포함)
- [ ] 로그인/회원가입 페이지 UI (shadcn/ui Form)
- [ ] 인증 미들웨어 — **비로그인 사용자 계산 허용** 정책 반영
  - 보호 라우트: `/history`, `/api/history`, `/api/pdf` (로그인 필요)
  - 비보호 라우트: `/api/calc/*` (비로그인도 계산 가능)
  - 계산 결과 페이지에서 "이력 저장하려면 로그인" 유도 UI
- [ ] **비로그인→로그인 전환 시 계산 결과 이관 로직**
  - 비로그인 상태 계산 결과를 zustand store (sessionStorage persist)에 임시 보관
  - 로그인 완료 시 `onAuthStateChange` 리스너에서 임시 결과 감지 → DB 자동 저장 + sessionStorage 정리
  - 이관 완료 후 "이전 계산 결과가 저장되었습니다" 토스트 알림
  - **주의**: Supabase Auth 소셜 로그인은 **redirect 방식만 사용** (popup 방식 시 sessionStorage 탭 격리로 이관 실패)
- [ ] users 프로필 테이블 자동 생성 (Auth trigger)

### Phase 3: 양도소득세 계산 엔진 (4~5일) [v1.0] ✅ 완료

- [x] DB에서 세율 로드하는 유틸 함수 (`db/tax-rates.ts`) — **시점별 조회** 지원
  - `getTaxRate(taxType, category, targetDate)` → `effective_date <= targetDate` 중 최신
  - `preloadTaxRates(taxTypes[], targetDate)` → 복수 세금 타입의 세율을 **1회 쿼리**로 일괄 로드 (DB 왕복 최소화)
  - 과거 세율 보존: `is_active = false`로 변경하지 않고 effective_date로 구분
  - 반환 데이터는 jsonb Zod 스키마로 `safeParse` 후 타입 확정
  - `db/regulated-areas.ts` — 조정대상지역 DB 조회 유틸 별도 구현
- [x] 입력 데이터 타입 정의 — `TransferTaxInput` (transfer-tax.ts 내 정의, zustand store `TransferFormData`와 연동)
  - ※ 당초 계획한 `validators/transfer-input.ts` (별도 파일) 대신 zustand store + 엔진 내 타입 정의 방식으로 구현
- [x] 1세대 1주택 비과세 판단 로직
  - 보유기간 2년+ 판단 (**보유기간 기산일**: 취득일 다음날 ~ 양도일, date-fns `differenceInCalendarDays` 사용 시 +1일 보정 필요)
  - 조정대상지역 거주기간 2년+ 판단 (**취득일 기준** 조정대상지역 판단 — 비과세 판단은 취득일, 중과세 판단은 양도일 기준으로 구분)
  - 양도가액 12억 기준 판단
  - **일시적 2주택 비과세 특례**: 종전 주택 보유 중 신규 주택 취득 후 **3년 내** 종전 주택 양도 시 비과세 (조정대상지역은 2년 내, 2022.5.10 이후 3년으로 완화 경과규정 확인)
  - **2017.8.3 이전 취득분**: 조정대상지역이라도 거주요건 면제 (경과규정)
- [x] 양도차익 계산 (양도가액 - 취득가액 - 필요경비)
- [x] 12억 초과분 과세 대상 양도차익 산출
  - **계산 순서 주의**: 양도차익 산출 → 12억 초과 비율 적용 → 장기보유공제 적용 (순서 역전 시 세액 오류)
- [x] 장기보유특별공제 계산
  - 일반: 보유기간별 연 2% (최대 30%)
  - 1세대1주택: 보유 연 4%(최대 40%) + 거주 연 4%(최대 40%) = 최대 80%
  - **중과세 대상(다주택·비사업용토지·미등기) 시 장기보유특별공제 적용 배제** — `isSurchargeTarget` 플래그로 분기
- [x] 기본공제 250만원 적용 (**연간 합산 한도** — 동일 연도 복수 양도 시 합산 250만원, 미등기양도자산 제외)
- [x] 누진세율 세액 계산 (6~45%, 8단계)
  - **검증 참조용 세율 테이블 (2026년 기준)**:
    | 과세표준 구간 | 세율 | 누진공제 |
    |-------------|------|---------|
    | 1,400만원 이하 | 6% | - |
    | 1,400만~5,000만원 | 15% | 126만원 |
    | 5,000만~8,800만원 | 24% | 576만원 |
    | 8,800만~1.5억원 | 35% | 1,544만원 |
    | 1.5억~3억원 | 38% | 1,994만원 |
    | 3억~5억원 | 40% | 2,594만원 |
    | 5억~10억원 | 42% | 3,594만원 |
    | 10억원 초과 | 45% | 6,594만원 |
  - 위 세율은 DB(`tax_rates`)에서 로드하되, 테스트 시 해당 구간별 정확성 검증에 활용
- [x] **미등기 양도 중과세 로직**
  - 미등기 양도자산 **70% 단일세율** 적용 (누진세율 아님)
  - 장기보유특별공제 배제, 기본공제 배제
  - 미등기 여부 판단: 양도일 현재 소유권이전등기 미완료
- [x] 비사업용토지 중과세 로직 (+10%p, **장기보유특별공제 배제**)
  - `lib/tax-engine/non-business-land.ts` — 별도 전담 엔진으로 분리 구현
  - 소득세법 §104의3·시행령 §168의6~14 기반 정밀 판정 (`judgeNonBusinessLand()`)
  - 사업용 기간 비율 계산, 유예기간, 이력 판정 지원
  - `TransferTaxInput.nonBusinessLandDetails` 제공 시 정밀 판정 / 미제공 시 `isNonBusinessLand` 플래그 사용 (하위 호환)
- [x] 다주택 중과세 로직 (+20%p / +30%p, 유예 여부 DB 참조, **장기보유특별공제 배제**)
  - `lib/tax-engine/multi-house-surcharge.ts` — 별도 전담 엔진으로 분리 구현
  - 소득세법 §104·§152·§167-3·§167-10 기반 주택 수 산정 (`determineMultiHouseSurcharge()`)
  - 배제 처리: 상속주택(§155⑨), 장기임대사업자등록주택, 임대말소주택, 오피스텔(2022.1.1 이후), 분양권/입주권(§167-11)
  - 특례: 일시적 2주택, 혼인합가(5년), 동거봉양 합가(10년)
  - `TransferTaxInput.houses[]` 제공 시 정밀 주택 수 산정 / 미제공 시 `householdHousingCount` 사용 (하위 호환)
- [x] 조정대상지역 판단 로직 (`regulated_areas` 테이블 조회)
  - **비과세 판단 시**: 취득일 기준 조정대상지역 여부
  - **중과세 판단 시**: 양도일 기준 조정대상지역 여부
  - `TransferTaxInput.regulatedAreaHistory` 주입 시 이력 기반 자동 판단
- [x] 조세특례제한법 감면 4종 로직
  - **장기임대주택 감면** — `lib/tax-engine/rental-housing-reduction.ts` 별도 엔진 구현
    - 조특법 §97·§97의3·§97의4·§97의5 기반 유형별(장기일반민간·공공지원·공공임대) 감면율
    - 의무임대기간·임대료증액제한·사업자등록 요건 검증
    - `TransferTaxInput.rentalReductionDetails` 제공 시 정밀 감면 / 미제공 시 `reductions[]` 사용 (하위 호환)
  - **신축주택 감면 / 미분양주택 감면** — `lib/tax-engine/new-housing-reduction.ts` 별도 엔진 구현
    - 조특법 §99·§99의3·§98의2 기반 시기별·지역별 감면율 매트릭스
    - 5년 안분 계산, 주택 수 제외 특례, 다주택 중과 배제 특례
    - `TransferTaxInput.newHousingDetails` 제공 시 정밀 조문 매핑 / 미제공 시 `reductions[]` 사용 (하위 호환)
  - **8년 자경 농지 감면** — transfer-tax.ts 내 직접 처리 (100%, 한도 1억/5년간 2억)
- [x] 기준시가 수동 입력 UI + 부동산공시가격알리미 외부 링크 안내 (자동 조회는 Phase 11에서)
- [x] 취득가액 환산 (수동 입력된 기준시가 기반, 매매사례가 → 감정가 → 환산취득가)
  - **환산취득가액 공식**: `양도실거래가 × (취득시 기준시가 ÷ 양도시 기준시가)`
  - **환산 적용 시 필요경비**: 개산공제 (토지·건물 3%, 지상권·전세권 등 7%) — 실제 필요경비 불인정
  - 환산 계산 시 비율 연산: **분자·분모 정수 유지, 곱셈 먼저 후 나눗셈** (`양도가 × 취득시가 / 양도시가`) — 중간값 오버플로우 주의 (Number.MAX_SAFE_INTEGER 9,007조원 초과 여부 검증)
- [x] 지방소득세 자동 계산 (양도소득세의 10%)
- [x] Route Handler 구현 (`app/api/calc/transfer/route.ts`)
  - Orchestrator 패턴: `preloadTaxRates` → 순수 계산 엔진 호출 → 결과 반환
  - Supabase 클라이언트는 모듈 스코프에서 1회 생성 (cold start 연결 재사용)
- [ ] **검증 데이터 준비** (외부 권위 소스 기반) — 미완료
  - 국세청 홈택스 양도소득세 계산 예시
  - 국세청 「양도소득세 실무 해설」 수록 사례
  - 세무사 실무사례집 공개 케이스
- [x] **보유기간 계산 유틸** (`calculateHoldingPeriod` — `lib/tax-engine/tax-utils.ts`)
  - 세법상 기산일: 취득일 다음날 ~ 양도일 (민법 초일불산입)
  - date-fns 주의: `differenceInYears`는 만 연수 반환 — 세법상 "3년 이상"은 취득일 다음날 기준 만 3년
  - 윤년 2/29 취득 시 만기일 처리 (2/28 vs 3/1)
  - 거주기간 계산도 동일 원칙 적용
- [x] 단위 테스트 작성 (계산 엔진, 위 검증 데이터 기반)
  - `transfer-tax.test.ts` — 비과세·12억초과·장기보유공제·중과세·감면·환산취득가·경계값
  - `multi-house-surcharge.test.ts` — 주택 수 산정·배제 처리·특례
  - `non-business-land.test.ts` — 비사업용 토지 판정·이력 계산
  - `rental-housing-reduction.test.ts` — 장기임대 감면율·의무기간·위반 사유
  - `new-housing-reduction.test.ts` — 신축·미분양 조문 매핑·5년 안분
  - `tax-utils.test.ts` — 공통 유틸 (보유기간·환산·절사)
  - **경계값 테스트** (필수):
    - 양도가액 12억 정확히 / 12억 + 1원
    - 보유기간 2년 정확히 (하루 차이로 비과세/과세 분기)
    - 과세표준 구간 경계 (1,400만원 정확히)
    - 양도손실 (양도차익 음수) → 세액 0원 확인
    - 윤년 2/29 취득 → 보유기간 계산 정확성
  - **중과세 관련 테스트**:
    - 중과세 대상 시 장기보유특별공제 배제 확인
    - 미등기 양도 70% 단일세율 + 공제 배제 확인
    - 중과세 유예 기간 DB 참조 정상 동작
  - **일시적 2주택 비과세 특례 테스트**
  - **보유기간 계산 테스트**: 취득일 다음날 기산, 윤년 경계, 거주기간 동일 원칙

### Phase 4: 양도소득세 UI + 이력 (3~4일) [v1.0] ✅ UI 완료 / 이력 미완료

- [x] 공통 StepWizard 인프라 구현
  - `components/calc/StepIndicator.tsx` — 단계 진행 표시 공통 컴포넌트
  - `lib/stores/calc-wizard-store.ts` — zustand store (TransferFormData + sessionStorage persist)
  - `components/calc/inputs/CurrencyInput.tsx` — 금액 입력 컴포넌트 (parseAmount, formatKRW)
  - `components/ui/address-search.tsx` — Vworld 주소 검색 연동 컴포넌트
- [x] `app/calc/transfer-tax/TransferTaxCalculator.tsx` — 5단계 입력 + 결과 표시 통합 컴포넌트
  - ※ 당초 계획한 `components/calc/TransferTaxForm.tsx` 대신 페이지 단위 통합 컴포넌트로 구현
  - Step 1: 물건 유형 선택 (주택/토지/건물) — 토지/건물 선택 시 Step 4에서 비사업용토지·미등기 필드 조건부 표시
  - Step 2: 양도 정보 (양도가액, 양도일, 주소 검색 연동)
  - Step 3: 취득 정보 (취득가액, 취득일, 필요경비, 취득가액 불명 시 환산취득가 선택 + 기준시가 입력 필드)
  - Step 4: 보유 상황 (주택 수, 거주기간, 조정대상지역, 미등기, 비사업용토지)
  - Step 5: 감면 해당 여부 확인
- [ ] **기본공제 연간 합산 한도 안내** — 미완료
  - 동일 연도 양도 이력이 있는 경우 "이번 연도 기본공제 잔여 한도: OOO만원" 표시
  - 이력 미존재 또는 비로그인 시 기본공제 250만원 전액 적용 + "동일 연도 다른 양도 건이 있으면 합산 250만원 한도" 안내
- [x] 계산 결과 표시 — TransferTaxCalculator.tsx 내 인라인 구현
  - 비과세/과세 분기 표시, 단계별 계산 내역(steps) 표시
  - 세액 합계 (결정세액 + 지방소득세 + 총납부세액)
- [x] 면책 고지 컴포넌트 (`components/calc/shared/DisclaimerBanner.tsx`) — 결과 화면에 표시
- [x] 비로그인 계산 결과 임시 저장 유도 UI (`components/calc/shared/LoginPromptBanner.tsx`)
- [x] `app/calc/transfer-tax/loading.tsx` — 로딩 UI
- [x] `app/calc/transfer-tax/error.tsx` — 에러 바운더리
- [ ] ResultBreakdown 항목별 상세 컴포넌트 별도 분리 — 미완료 (현재 인라인 처리)
- [ ] 계산 이력 저장 로직 — **Server Action** (`actions/calculations.ts`) — 미완료
- [ ] 이력 목록 페이지 (`app/history/page.tsx`) — 미완료
- [ ] 이력 상세 조회 페이지 (`app/result/[id]/page.tsx`) — 미완료
- [ ] 이력 삭제 기능 (Server Action) — 미완료
- [ ] 모바일 반응형 최종 확인
- [ ] 메인 랜딩 페이지 (6가지 세금 선택 카드) — 미완료

### Phase 5: 취득세 계산 엔진 + UI (2~3일) [v1.1]

- [ ] `acquisition` 세율 데이터 시딩 (물건·원인별 세율, 중과세율)
- [ ] Zod 입력 스키마 (`validators/acquisition-input.ts`)
- [ ] 물건 종류별 기본 취득세 계산
  - 주택: 6억 이하 1%, 6~9억 **선형 보간**, 9억 초과 3%
    - **선형보간 공식**: `취득세율 = (취득가액 × 2 / 300,000,000 - 3) / 100` (소수점 5자리)
    - **정수 연산 구현**: `(acquisitionValue * 2n) / 300_000_000n`으로 BigInt 나눗셈 후, 소수점 5자리 반올림 → 세액 산출 시 `Math.floor()` 절사
    - **경계값 처리**: 6억 정확히 → 1%, 9억 정확히 → 3% (보간 미적용, 직접 매핑)
    - **과세표준**: 천원 미만 절사 (`truncateToThousand`) 후 세율 적용
  - 토지: 4%
  - 건물: 4%
  - 원시취득: 2.8%
- [ ] 취득 원인별 세율 분기
  - 매매 (유상): 물건별 기본세율 (위 참조)
  - 상속: 2.8% (단, **농지 상속은 2.3%** — 지방세법 제15조)
  - 증여: 3.5%
  - 원시취득: 2.8% (신축·건축)
  - 공매·경매: 물건별 기본세율 (매매와 동일)
  - 무상취득 (기타): 3.5%
- [ ] 주택 수 기반 중과세 판단
  - 1주택 (조정지역): 기본세율 (중과 대상 아님)
  - 2주택 (조정지역): 8%
  - 3주택 이상 (조정지역): 12%
  - 법인: 12% (주택 취득 시)
  - **사치성 재산 중과** (지방세법 제13조의2):
    - 골프장: 기본세율 + 중과 (별장·고급오락장 등과 동일 체계)
    - 고급주택: 취득세 기본세율에 중과세율 추가 적용
    - 고급오락장: 중과세율 적용
    - 고급선박: 중과세율 적용
    - UI: "사치성 재산 여부" 선택 필드 추가 → 해당 시 중과세율 자동 적용
  - 비조정지역: 주택 수와 관계없이 기본세율
  - 중과세 유예: DB `special_rules.surcharge_suspended` 참조
- [ ] 조정대상지역 판단 (`regulated_areas` 테이블 조회, **취득일 기준**)
  - 판단 시점: 취득일(잔금 지급일 또는 등기 접수일 중 빠른 날) 기준으로 조정지역 여부 판단
  - `regulated_areas` 테이블에서 `designation_date <= 취득일` AND (`release_date IS NULL` OR `release_date > 취득일`) 조회
  - 취득자 유형 선택: **개인 / 법인** (법인 선택 시 주택 취득 12% 중과세 자동 적용)
- [ ] 생애최초 주택 감면
  - **대상 조건**: 본인·배우자 모두 주택 미보유 + 소득 요건 충족
  - **금액 조건**: 수도권 4억 이하 / 비수도권 3억 이하 주택
  - **감면액**: 취득세 감면, **200만원 한도**
  - **취소 요건**: 3개월 내 전입 미이행, 3년 내 매도·임대 시 추징
  - UI: "생애최초 주택 여부" 체크 + 수도권/비수도권 구분 → 감면 자동 적용 + 추징 주의사항 안내
- [ ] 농어촌특별세·지방교육세 합산 (상세 규칙)
  - **농어촌특별세**: 취득세 표준세율(2%) 초과분 × 10%
    - 전용면적 85㎡ 이하 주택: 면제
    - 중과세 적용 시: 중과세율 기준 세액에서 표준세율(2%) 초과분 × 10%
    - 1세대 1주택 (6억 이하 1%): 비과세 (표준세율 미초과)
    - 선형보간 구간: 적용세율이 2% 초과 시에만 농특세 발생
  - **지방교육세**: 취득세 표준세율분 × 20%
    - 중과세 적용 시에도 표준세율(2%) 기준으로 계산
    - 비과세·감면 시: 감면 후 세액 기준
  - **총 납부세액** = 취득세 본세 + 농어촌특별세 + 지방교육세
- [ ] **과세표준 절사**: 취득세 과세표준(취득가액)은 **천원 미만 절사** (`truncateToThousand` 공통 유틸 사용)
- [ ] **감면 중복 적용 방지**: v1.1에서는 생애최초 감면만 지원하나, 향후 지방세특례제한법 감면 확장 시 중복 방지 로직 필요 — 현 단계에서는 단일 감면만 허용하는 구조로 설계
- [ ] API Route 구현
  - `/api/calc/acquisition` Route Handler (비로그인 허용, rate limiting 분당 30회)
  - `preloadTaxRates(['acquisition'], targetDate)` → 순수 엔진 호출 → 결과 반환
- [ ] AcquisitionTaxForm UI
  - 취득자 유형 선택: 개인 / 법인
  - 물건 종류 선택: 주택 / 토지 / 건물
  - 취득 원인 선택: 매매 / 상속 / 증여 / 원시취득 / 공매
  - 농지 여부 (상속 선택 시 활성화)
  - 사치성 재산 여부 체크
  - 조정대상지역 여부 + 보유 주택 수
  - 생애최초 주택 여부 체크
  - 전용면적 (㎡) — 농어촌특별세 면제 판단용
- [ ] 단위 테스트 작성
  - 필수 케이스: 기본세율(주택/토지/건물), 선형보간(6억/7.5억/9억/경계값), 취득원인별(매매/상속/증여/농지상속/공매), 중과세(2주택/3주택+/법인/사치성), 비조정지역 다주택, 생애최초(적용/한도초과), 부가세 합산(일반/중과/85㎡이하), 과세표준 절사

### Phase 6: PDF 출력 (1~2일) [v1.1]

- [ ] **PDF 기술 PoC** — Vercel Serverless에서 @react-pdf/renderer 번들 크기(50MB 제한)·실행 시간(10초 제한)·메모리(1024MB 제한) 검증
  - **한글 폰트 포함 상태에서 측정** (Noto Sans KR 또는 Pretendard 서브셋)
    - 한글 폰트 미포함 시 PDF 내 한글이 깨지므로, 폰트 포함 번들 크기가 PoC 핵심 판단 기준
    - 폰트 서브셋 적용 시 ~2MB, 풀 폰트 시 ~16MB — 번들 50MB 한도 내 영향 평가
  - 통과 시: @react-pdf/renderer로 서버 사이드 생성
  - 미통과 시: jsPDF + html2canvas 클라이언트 사이드 생성으로 전환
- [ ] PoC 결과 기반 PDF 템플릿 디자인
  - 계산 조건 요약
  - 세금 항목별 상세 내역
  - 면책 고지
- [ ] PDF 생성 구현 — 서버 사이드 시 Server Action (`actions/pdf.ts`), 클라이언트 사이드 시 유틸 함수
- [ ] 다운로드 버튼 UI (결과 페이지 + 이력 페이지)
- [ ] 6가지 세금 모두 PDF 지원 (세금별 템플릿 분기)

### Phase 7: 상속세 계산 엔진 + UI (3~5일) [v1.2]

- [ ] `inheritance` 세율 데이터 시딩 (누진세율, 공제한도, 인적공제 금액)
- [ ] Zod 입력 스키마 (상속인 구성 필드 포함)
  - 배우자 유무
  - 자녀 수 + 관계 (직계비속·직계존속·형제자매)
  - 상속재산가액, 채무(공과금/사적채무 구분), 장례비용(봉안시설 포함 여부)
  - **배우자 실제 상속분** (선택 — 미입력 시 법정상속분 적용)
  - **사전증여 내역** (증여일, 수증인, 금액, 납부세액)
  - v1.2 scope 한계: 대습상속·상속포기·태아 → "세무사 상담 권장" 안내
- [ ] **상속인 구성 기반 법정상속분 계산 로직**
  - 배우자 + 직계비속: 배우자 1.5 : 자녀 각 1 비율
  - 배우자 + 직계존속: 배우자 1.5 : 존속 각 1 비율
  - 배우자 단독: 전액
  - 법정상속분 금액 → 배우자공제 한도 산출
  - **정수연산 구현**: 곱셈 먼저 원칙 — `과세가액 × 비율분자 / 비율분모` (소수점 중간 과정 회피)
  - 분모 0 방어: 상속인 0명 시 에러 코드 반환 (`INVALID_HEIR_COMPOSITION`)
  - 비율 합계 검증: 모든 상속인 지분 합 = 과세가액 (원 단위 오차 ±1원 이내)
  - **잔여분 처리**: 비율 소수점 절사 후 잔여분은 배우자에게 우선 배분
- [ ] **과세가액 계산** (항목별 세분화)
  - 상속재산가액 + **사전증여재산 합산** (상속인 10년 내 + 비상속인 5년 내, 상증법 제13조)
  - \- 비과세재산 (국가귀속·금양임야 등)
  - \- 공익법인출연재산 (한도 내)
  - \- 채무 (공과금 + 사적채무, 입증 요건 안내)
  - \- 장례비용 (최소 500만원 보장 / 일반 상한 1,000만원 / 봉안시설 추가 500만원 = 최대 1,500만원)
  - = 상속세 과세가액
- [ ] 상속공제 자동 적용 (7종) + **종합한도 검증**
  - 기초공제 2억
  - **배우자상속공제**: `min(max(실제상속분, 5억), min(법정상속분, 30억))` — 미입력 시 법정상속분
  - 일괄공제 5억 (기초+인적 vs 일괄 자동 비교)
  - **인적공제 4종** (일괄공제 비교용): 자녀 1인당 5천만, 미성년자 `(20세-나이)×1천만`, 연로자 65세+ 1인당 5천만, 장애인 `기대여명×1천만`
  - **금융재산공제** 3구간: 순금융 2천만 이하 전액, 2천만~1억 → 2천만원, 1억 초과 → 20%(최대 2억)
  - **동거주택상속공제** (최대 6억): 5가지 요건 체크 (10년+ 동거, 1세대1주택, 무주택 직계비속, 주택가액 80%, 5년 사후관리)
  - 영농상속공제 (최대 15~20억, 사후관리 5년 추징 경고)
  - 가업상속공제 (최대 600억, 중소·중견기업 10년+ 경영, 사후관리 7~10년 추징 경고)
  - **공제 종합한도**: 공제 합계가 과세가액 초과 시 과세표준 0원 + 경고 메시지
- [ ] **절사 규칙** (정밀 연산 원칙 준수)
  - 과세표준: 천원 미만 절사 (`truncateToThousand`)
  - 산출세액: 원 미만 절사 (`truncateToWon` — `Math.floor()`)
  - 각 공제·세액 계산 단계에서 원 단위 정수 유지
- [ ] 누진세율 세액 계산 (10~50%)
- [ ] 세대생략 할증 (30%, 미성년+20억 초과 40%)
  - **안분 계산**: 산출세액 × (세대생략 상속재산 / 전체 상속재산) × 할증률
  - 정수연산: 곱셈 먼저 `산출세액 × 세대생략재산 / 전체재산` (정밀도 유지)
- [ ] **세액공제 적용 순서**: 산출세액 → 세대생략 할증 → 기납부 증여세 공제 → 외국납부 세액공제 → 신고세액 공제(남은 세액의 3%)
  - 각 단계에서 `max(0, 잔여세액 - 공제액)` — 음수 방지
- [ ] 신고세액 공제 (3%, 상속개시일+6개월 내 신고)
- [ ] **외국납부 세액공제**: v1.2 scope 한계 — 해외 재산 미보유 기본 가정, UI에 "해외 재산 포함 여부" 체크 → 체크 시 외국납부세액 직접 입력 필드 표시 (상세 외국세액 계산은 v2.0 확장)
- [ ] 결과 화면: 세액 1,000만원 초과 시 **분납** 안내 (신고기한 경과 후 2개월 이내 2회 분할 납부)
  - 부동산 비중 높고 현금 부족 시 **물납 가능** 안내 (부동산으로 세금 납부)
- [ ] 재산 평가 기능 — **모든 재산 유형에서 사용자 수동 입력** 방식
  - UI 흐름: "평가 방식 선택 (시가/보충적 평가)" → "금액 직접 입력"
  - 시가 평가: 매매사례가·감정가·수용가·경매가 중 선택 후 금액 입력
  - 보충적 평가: 기준시가 직접 입력 (v1.4에서 자동 조회로 전환)
  - 부동산(토지·건물·주택)·금융자산·기타 자산 모두 수동 입력
- [ ] API Route 구현
  - `POST /api/calc/inheritance` — Orchestrator 패턴
  - `preloadTaxRates(['inheritance'], targetDate)` → 세율 일괄 로드
  - 순수 엔진 `calculateInheritanceTax(input, rates)` 호출 → 결과 반환
  - Rate limiting: 분당 30회 (비로그인 포함)
- [ ] InheritanceTaxForm UI (HeirComposition + PropertyValuation 복합 컴포넌트)
  - 상속인 구성: 배우자 유무, 자녀 수, 관계 선택
  - 재산 입력: 유형별(부동산/금융/기타) + 평가방식(시가/보충적)
  - 채무 입력: 공과금/사적채무 구분
  - 장례비용: 금액 + 봉안시설 여부 체크
  - 배우자 실제 상속분 (선택 입력)
  - 사전증여 내역: 동적 추가 (증여일, 수증인, 금액, 납부세액)
  - 금융자산 순액 (금융재산공제용)
  - 동거주택 요건 체크리스트 (5가지)
  - 세대생략 상속 여부 + 해당 재산가액
  - 해외 재산 포함 여부 + 외국납부세액
  - "기한 내 신고 예정" 체크
- [ ] 단위 테스트 작성
  - 법정상속분 비율 정확성 + 잔여분 처리 + **정수연산 오차 검증**
  - 배우자공제 최소 5억 보장 / 최대 30억 한도
  - 사전증여 합산 + 기납부세액 공제
  - 공제 종합한도 (공제 > 과세가액 시 0원)
  - 인적공제 vs 일괄공제 자동 비교
  - 금융재산공제 3구간 경계값
  - 세대생략 안분 할증
  - 세액공제 적용 순서 정확성
  - 장례비용 3구간 (500만/1,000만/봉안 1,500만)
  - 과세표준 구간 경계값 (1억/5억/10억/30억 정확히)

### Phase 8: 증여세 계산 엔진 + UI (2~3일) [v1.2]

- [ ] `gift` 세율 데이터 시딩 (누진세율, 관계별 공제한도)
- [ ] Zod 입력 스키마 (증여자-수증자 관계, 이전 증여 내역 포함)
- [ ] **증여세 비과세 판단 로직**
  - 사회통념상 생활비·교육비 → 비과세 안내
  - 축의금·조의금 → 비과세 안내
  - 이혼 재산분할 → 비과세 안내
  - UI: "비과세 해당 여부 확인" 체크리스트 제공 (체크 항목별 안내 문구)
- [ ] **증여세 과세가액 계산** (항목별 흐름 명시)
  - 증여재산가액
  - \- 비과세재산 (사회통념상 인정 금액)
  - \- 채무인수액
  - \+ **10년 내 동일인 사전증여 합산액**
  - \- 증여재산공제 (관계별, 10년 총 한도 - 기적용분)
  - = 과세표준 (천원 미만 절사 — `truncateToThousand`)
- [ ] **절사 규칙** (정밀 연산 원칙 준수)
  - 과세표준: 천원 미만 절사 (`truncateToThousand`)
  - 산출세액: 원 미만 절사 (`truncateToWon` — `Math.floor()`)
- [ ] 증여재산공제 적용 (관계별)
  - 배우자 6억, 직계존속→성년 5천만, 직계존속→미성년 2천만, 직계비속 5천만, 기타 친족 1천만
- [ ] **10년 내 동일인 증여 합산 계산**
  - 공제는 10년 **총 한도** — 이전 증여 시 적용한 공제분 차감 (잔여 공제 계산)
  - **정수연산 방어**: 잔여공제 = `max(0, 총한도 - 기적용공제)` (음수 방지)
  - 합산 산출세액 - 기납부세액 = 최종 납부세액
  - **기납부세액 공제 방어**: `max(0, 산출세액 - 기납부세액)` (음수 방지)
  - UI: "이전 증여 내역 추가" 버튼 → 증여일, 금액, 납부세액 입력
  - 예시: 1차 3천만(공제 3천만) → 2차 4천만 → 합산 7천만 - 공제 5천만 = 과세 2천만
- [ ] 누진세율 세액 계산 (상속세와 동일)
- [ ] 세대생략 할증 (30%/40%)
- [ ] **세액공제 적용 순서** (Phase 7과 유사 — 명시적 순서 기재)
  - ① 산출세액
  - ② + 세대생략 할증
  - ③ - 기납부 증여세액 공제 (이전 증여 시 납부분)
  - ④ - 신고세액 공제 (남은 세액의 3%, 증여일+3개월 내 신고)
  - = 최종 납부세액
  - 각 단계에서 `max(0, 잔여세액 - 공제액)` — 음수 방지
- [ ] **연대납세의무 안내**: 미성년자 수증 시 "증여자 연대납세의무" 경고 표시
- [ ] 재산 평가 기능 (상속세와 공유 — 동일 수동 입력 방식)
- [ ] API Route 구현
  - `POST /api/calc/gift` — Orchestrator 패턴
  - `preloadTaxRates(['gift'], targetDate)` → 세율 일괄 로드
  - 순수 엔진 `calculateGiftTax(input, rates)` 호출 → 결과 반환
  - Rate limiting: 분당 30회 (비로그인 포함)
- [ ] GiftTaxForm UI (PriorGiftInput 포함)
  - 증여자-수증자 관계 선택 (배우자/직계존속/직계비속/기타친족)
  - 수증자 성년/미성년 여부
  - 증여재산가액 + 평가방식(시가/보충적)
  - 채무인수액
  - 비과세 해당 여부 체크리스트
  - 이전 증여 내역: 동적 추가 (증여일, 증여가액, 납부세액)
  - 세대생략 여부 체크
  - "기한 내 신고 예정" 체크
- [ ] 단위 테스트 작성
  - 관계별 공제 (배우자/직계존속 성년·미성년/직계비속/기타친족)
  - 10년 합산: 공제 잔여분 정확 계산, **잔여공제 음수 방지 검증**, 기납부세액 공제
  - 비과세 판단 분기
  - 세대생략 할증
  - **세액공제 적용 순서 정확성**
  - 과세표준 0원 (공제 > 증여가액)
  - **과세표준 천원 절사·산출세액 원 절사 검증**

### Phase 9: 재산세 계산 엔진 + UI (2~3일) [v1.3]

- [ ] `property` 세율 데이터 시딩 (주택·토지·건축물 세율, 공정시장가액비율, 특례세율)
- [ ] Zod 입력 스키마 (`validators/property-input.ts`)
- [ ] **공정시장가액비율** (DB `tax_rates` category='fair_market_ratio'에서 로드)
  - 주택: **60%** (2026년 기준, 정부 매년 고시)
  - 토지·건축물: **70%**
  - 1세대1주택 특례 기준금액(현재 9억)도 DB `special_rules`에서 로드 (향후 변경 대응)
- [ ] **과세기준일**: 매년 **6월 1일** 기준 부과 — 세율 시점 조회 시 과세기준일 기준 `effective_date` 매칭
- [ ] 주택 재산세 계산
  - 공시가격 × 공정시장가액비율(60%) = 과세표준 (천원 미만 절사)
  - 누진세율 (6천만 이하 0.1%, 6천만~1.5억 0.15%, 1.5억~3억 0.25%, 3억 초과 0.4%)
- [ ] 1세대 1주택 특례세율 (각 구간 0.05%p 인하)
- [ ] 토지 재산세 계산 (시가표준액 × 공정시장가액비율 **70%** = 과세표준)
  - **종합합산** (나대지, 잡종지 등):
    - 5,000만원 이하: 0.2%
    - 5,000만~1억원: 0.3% (누진공제 5만원)
    - 1억원 초과: 0.5% (누진공제 25만원)
  - **별도합산** (사업용 토지):
    - 2억원 이하: 0.2%
    - 2억~10억원: 0.3% (누진공제 20만원)
    - 10억원 초과: 0.4% (누진공제 120만원)
  - **분리과세**:
    - 농지(전·답·과수원): 0.07%
    - 회원제 골프장·고급오락장 용지: 4%
    - 그 외 분리과세 대상: 0.2%
- [ ] 건축물 재산세 (시가표준액 × 공정시장가액비율 **70%** = 과세표준)
  - 일반 건축물: 0.25%
  - 골프장·고급오락장: 4%
- [ ] 전년도 세액 선택적 입력 필드 (미입력 시 세부담 상한 생략 + "전년도 고지서 참조" 안내)
- [ ] 앱 내 이전 재산세 이력 존재 시 자동 채움 제안
- [ ] 세부담 상한 계산 (전년도 세액 입력된 경우만)
  - 주택 공시가격 3억 이하: 전년 대비 **105%**
  - 주택 공시가격 3억~6억: 전년 대비 **110%**
  - 주택 공시가격 6억 초과: 전년 대비 **130%**
  - 토지: 전년 대비 **150%**
  - 경계값 처리: 3억/6억 정확히 → 해당 구간 상한율 적용
- [ ] 부가세 합산
  - **지방교육세**: 재산세의 20%
  - **지역자원시설세** (건축물 시가표준액 기준, 용도별 차등):
    - 일반 건축물: 시가표준액 × 0.04~0.12% (4구간 누진)
    - 대형마트·백화점·4,000㎡ 이상 대형건물 등: 별도 세율
    - 골프장·고급오락장 등: 중과 세율
    - v1.3 범위: 일반 건축물 기본 세율만 구현 (특수시설은 향후 확장)
  - **도시지역분**: 과세표준 × 0.14%
    - **적용 대상**: 도시지역(「국토의 계획 및 이용에 관한 법률」상 도시지역) 내 토지·건축물·주택에만 적용
    - **비도시지역 제외**: 관리지역·농림지역·자연환경보전지역은 미적용
    - UI: "도시지역 여부" 선택 필드 추가 (기본값: 도시지역)
  - **분할 납부 안내**: 재산세 20만원 초과 시 7월/9월 분할 납부 가능 → 결과 화면에 안내 표시
- [ ] **재산세 결과 export 함수** (종부세 연동용 — 2-레이어 순수함수 원칙 준수)
  - `calculatePropertyTax(input, rates) → PropertyTaxResult` 형태로 외부 호출 가능
  - **매개변수 `rates`**: 상위 Orchestrator에서 `preloadTaxRates`로 로드한 세율 데이터 전달 (DB 직접 호출 금지)
  - **반환 필수 필드**: `taxBase`(과세표준, 종부세 비율 안분에 필수) + `determinedTax`(결정세액, 종부세 재산세 공제에 사용)
  - 종부세 엔진(comprehensive-tax.ts)에서 주택 수만큼 반복 호출 — **10채 이상 시 배치 최적화** 고려
- [ ] API Route 구현
  - `/api/calc/property` Route Handler (비로그인 허용, rate limiting 분당 30회)
  - `preloadTaxRates(['property'], targetDate)` → 순수 엔진 호출 → 결과 반환
- [ ] PropertyTaxForm UI
  - 물건 종류 선택: 주택 / 토지 / 건축물
  - 공시가격(주택) 또는 시가표준액(토지·건축물) 입력
  - 1세대1주택 여부 체크 (주택 선택 시)
  - 토지 과세유형 선택: 종합합산 / 별도합산 / 분리과세(농지/골프장/기타)
  - 도시지역 여부 선택 (기본값: 도시지역)
  - 전년도 세액 입력 (선택적 — 세부담 상한 적용용)
  - 건축물 용도 선택 (일반/골프장·고급오락장)
- [ ] 단위 테스트 작성
  - 필수 케이스: 주택 4구간 누진세율 + 경계값(6천만/1.5억/3억), 1세대1주택 특례(9억 이하/초과), 공정시장가액비율(주택60%/토지건축물70%), 토지 3유형(종합합산/별도합산/분리과세), 건축물(일반/골프장), 세부담 상한(3구간 + 미입력), 부가세(지방교육세/지역자원시설세/도시지역분), 도시지역 여부에 따른 도시지역분, 종부세 연동(`taxBase`·`determinedTax` 반환값), 복수 물건 배치 호출, 분할 납부 안내 조건(20만원 초과)

### Phase 10: 종합부동산세 계산 엔진 + UI (3~4일) — 핵심 연동 [v1.3]

- [ ] `comprehensive_property` 세율 데이터 시딩 (누진세율, 공정시장가액비율, 고령자·장기보유 공제율)
- [ ] Zod 입력 스키마 (`validators/comprehensive-input.ts`)
  - 보유 주택 목록 (공시가격, 면적, 유형)
  - 1세대1주택 여부
  - 소유자 나이, 보유기간
  - 전년도 종부세 (세부담 상한용, **선택적 입력**)
- [ ] PropertyListInput 컴포넌트 — 다주택 목록 입력 UI
  - 물건 추가/삭제
  - 합산 공시가격 실시간 표시
- [ ] 주택분 종합부동산세 계산
  - Step 1: 인별 공시가격 합산
  - Step 2: 기본공제 차감 (일반 9억 / 1세대1주택 12억)
  - Step 3: 공정시장가액비율 적용 (60%, DB에서 로드)
  - Step 4: 과세표준 (**만원 미만 절사** — `truncateToTenThousand`, 재산세 천원 절사와 다름!) → 누진세율 (0.5~2.7%, 7단계) → 산출세액 (원 미만 절사)
  - Step 5: 1세대1주택 세액공제
    - 고령자 공제 (60세+ 20%, 65세+ 30%, 70세+ 40%)
    - 장기보유 공제 (5년+ 20%, 10년+ 40%, 15년+ 50%)
    - 합산 최대 80%
- [ ] **재산세 비율 안분 공제 연동 (핵심)** — 종부세법 시행령 제4조의2
  - Step 6: property-tax.ts의 `calculatePropertyTax(input, propertyRates)` 호출하여 재산세 산출
    - `propertyRates`는 Orchestrator에서 `preloadTaxRates(['comprehensive_property', 'property'], targetDate)`로 일괄 로드한 재산세 세율
  - **비율 안분 공식**: `공제할 재산세 = 재산세 부과세액 × (종부세 과세표준 ÷ 재산세 과세표준)`
  - 단순 전액 차감이 아님 — 종부세 과세 대상 부분에 해당하는 재산세만 공제
  - **정수 연산 구현**: `부과세액 × 종부세과세표준 / 재산세과세표준` (곱셈 먼저 후 나눗셈 — 정밀도 유지)
  - **분모 0 방어**: 재산세 과세표준이 0인 경우 공제액 0원 처리
  - **비율 상한**: `Math.min(ratio, 1.0)` 적용 — 종부세 과세표준이 재산세 과세표준 초과 불가
  - 예시: 공시가격 15억 1주택, 재산세 과세표준 9억, 종부세 과세표준 1.8억 → 재산세의 20%만 공제
- [ ] 세부담 상한 적용 (전년도 세액 입력된 경우만)
  - 일반: 전년도 **총세액**의 **150%**
  - 다주택 (조정대상지역 2주택 이상): 전년도 **총세액**의 **300%** — `regulated_areas` 테이블로 조정지역 판단
  - **총세액 정의**: 종부세 + 재산세 (비율 안분 공제 **전** 금액) — 재산세 공제 후 금액이 아님
  - 전년도 총세액 미입력 시: 상한 생략 + "전년도 고지서 참조" 안내
  - 앱 내 이전 종부세 이력 존재 시 자동 채움 제안
- [ ] 농어촌특별세 가산 (종부세의 20%)
- [ ] 토지분 종합부동산세
  - **공정시장가액비율**: 토지분은 **100%** (주택분 60%와 다름!)
  - **과세표준 계산**: 공시지가 합산 → 기본공제 차감 → ×100% → **만원 미만 절사**
  - **종합합산** (기본공제 5억):
    - 15억 이하: 1%
    - 15억~45억: 2% (누진공제 1,500만원)
    - 45억 초과: 3% (누진공제 6,000만원)
  - **별도합산** (기본공제 80억):
    - 200억 이하: 0.5%
    - 200억~400억: 0.6% (누진공제 2,000만원)
    - 400억 초과: 0.7% (누진공제 6,000만원)
  - 토지분도 농어촌특별세 20% 가산
- [ ] **과세기준일**: 매년 **6월 1일** 기준 부과 — 재산세와 동일, 세율 시점 조회 시 과세기준일 기준 `effective_date` 매칭
- [ ] API Route 구현
  - `/api/calc/comprehensive` Route Handler (비로그인 허용, rate limiting 분당 30회)
  - `preloadTaxRates(['comprehensive_property', 'property'], targetDate)` → 2개 세금 세율 1회 일괄 로드
- [ ] ComprehensiveTaxForm UI
  - 보유 주택 목록 (PropertyListInput: 물건 추가/삭제, 합산 공시가격 실시간 표시)
  - 1세대1주택 여부 체크
  - 소유자 나이 (고령자 공제용)
  - 보유기간 (장기보유 공제용)
  - 전년도 총세액 입력 (선택적 — 세부담 상한용)
  - 조정대상지역 여부 (세부담 상한 150% vs 300% 판단용)
  - 토지분: 토지 유형(종합합산/별도합산), 공시지가 합산 입력
- [ ] LinkedTaxResult 연동 결과 표시 컴포넌트
  - 종부세 Step 1~8 계산 과정 단계별 표시
  - **재산세 비율 안분 공제 시각화**: 비율(%) + 공제 전/후 세액 비교
  - 농어촌특별세
  - 총 납부세액 요약 (종부세 + 재산세 + 농특세 합계)
- [ ] 연동 계산 이력 저장 (calculations.linked_calculation_id 설정)
- [ ] **연동 전략**: v1.3에서는 모드 A(내부 자동 계산)만 구현
  - 모드 B(이력 참조): v2.0 이관
  - 모드 C(일관성 경고): v2.0 이관
- [ ] **v1.3 scope 한계** (향후 확장 — 결과 화면에 "세무사 상담 권장" 안내):
  - 부부 공동명의 1주택 특례 (종부세법 제8조: 12억 공제 vs 인별 9억 공제 중 유리한 것 선택) → v2.0 이관
  - 법인 종합부동산세 (기본공제 없음, 단일세율 6%) → v2.0 이관
- [ ] **단위 테스트 작성** (최우선)
  - 필수 케이스: 1세대1주택(12억 이하 종부세 0원), 1세대1주택(12억 초과 고령자+장기보유), 고령자+장기보유 합산 80% 상한, 다주택 합산(3주택), 재산세 비율 안분 공제(수동 비율 vs 엔진 비교), 비율 안분 경계(분모 0 방어/비율 1.0 상한), 세부담 상한(150%/300%/미입력), 농특세 20%, 토지분(종합합산/별도합산 3구간), **과세표준 만원 절사**(천원 아님 확인), 5주택 이상 성능(1초 이내), 연동 통합 테스트(comprehensive→property→안분→최종세액 전체 흐름)

### Phase 11: 기준시가 자동 조회 (2일) [v1.4]

- [ ] 국토교통부 공동주택가격 API 프록시 연동 (data.go.kr API 키 발급)
  - Next.js API Route → 국토부 API → Upstash Redis 24h 캐싱 (DB 미적재)
  - 아파트/연립/다세대 공시가격 조회
- [ ] **API 쿼터 관리**
  - 공공데이터포털 일일 호출 한도 확인 (기본 1,000회/일)
  - Redis 24h 캐싱으로 실제 API 호출 최소화 (동일 주소 재조회 방지)
  - 쿼터 초과 시 수동 입력 fallback 자동 전환
  - 필요 시 트래픽 확대 신청 (data.go.kr 포털에서 신청 가능)
- [ ] 국토교통부 개별공시지가 API 프록시 연동
  - 토지 공시지가 조회 (동일 캐싱 전략)
- [ ] 국토교통부 개별주택가격 API 프록시 연동
  - 단독주택 공시가격 조회 (동일 캐싱 전략)
- [ ] 공공데이터포털 파일 DB 적재 스크립트
  - 오피스텔·상업용 건물 기준시가 파일 → standard_prices 테이블
  - **범위: 수도권+광역시 한정** (Supabase Free 500MB 용량 대응)
  - 연 1회 업데이트 프로세스
- [ ] standard-price API Route (프록시 + rate limiting 분당 10회)
- [ ] 기존 수동 입력 폼에 자동 채움 연동 (6가지 계산기 모두)
  - 주소 입력 → API 자동 조회 → 금액 자동 채움
- [ ] API 장애 시 수동 입력 fallback (기존 수동 입력 UI 유지)

### Phase 12: SEO + 가이드 (1~2일) [v1.4]

- [ ] 메인 랜딩 페이지 완성 (6가지 세금 카드 + CTA)
- [ ] 세금 가이드 6종 작성 (SSG)
  - 양도소득세 가이드
  - 상속세 가이드
  - 증여세 가이드
  - 취득세 가이드
  - 재산세 가이드
  - 종합부동산세 가이드
- [ ] 메타 태그, OG 태그 설정
- [ ] sitemap.xml 생성
- [ ] robots.txt 설정

---

## 4. Success Criteria

| ID | 기준 | 측정 방법 | 목표값 |
|----|------|---------|-------|
| SC-1 | 양도소득세 계산 정확도 | 세무사 검증 케이스 통과율 | 99%+ |
| SC-2 | 상속/증여세 계산 정확도 | 세무사 검증 케이스 통과율 | 99%+ |
| SC-3 | 취득세 계산 정확도 | 세무사 검증 케이스 통과율 | 99%+ |
| SC-4 | 재산세 계산 정확도 | 세무사 검증 케이스 통과율 | 99%+ |
| SC-5 | 종합부동산세 계산 정확도 | 세무사 검증 + 재산세 공제 정확성 | 99%+ |
| SC-6 | 재산세↔종부세 연동 정확성 | 국세청 예시 케이스 기반 검증 | 100% |
| SC-7 | 계산 완료율 | 시작 → 결과 도달 비율 | 80%+ |
| SC-8 | 이력 저장 | 로그인 사용자 저장 성공률 | 100% |
| SC-9 | 응답 속도 | 계산 결과 표시 시간 (종부세 다주택 포함) | **warm** 1초 이내, cold start 포함 3초 이내 |
| SC-10 | 모바일 호환성 | 모바일 브라우저 정상 동작 | 100% |
| SC-11 | 인증 보안 | RLS 본인 데이터만 접근 | 통과 |
| SC-12 | 정밀 연산 | 국세청 예시와 세액 1원 단위 일치 | 100% |
| SC-13 | 에러 복원력 | 계산 실패 시 입력 데이터 유실 없음 | 100% |

---

## 5. Constraints & Dependencies

### 5.1 제약사항

| 제약 | 설명 |
|-----|------|
| 세법 정확성 | 모든 계산 로직은 세무사 검증 필수. 오류 시 법적 리스크 |
| 세법 기준연도 | 2026년 현행 세법 기준 (개정 시 DB 업데이트) |
| 면책 고지 | 모든 결과는 "참고용" 명시, 실제 신고 시 전문가 상담 권장 |
| 기준시가 API | 국세청 공식 실시간 API 미제공. v1.0~v1.3은 수동 입력, v1.4에서 국토부 API 프록시(Redis 캐싱) + 파일 적재(수도권+광역시 한정) |
| DB 용량 | Supabase Free 500MB — 기준시가 전국 적재 불가. API 프록시 + 범위 한정으로 대응 |
| 공정시장가액비율 | 정부가 매년 고시 — DB에서 관리하여 즉시 반영 |
| 개인정보 | 계산 이력 내 거래 정보 Supabase 서버측 암호화 |
| Supabase Free tier | 1주일 미사용 시 프로젝트 자동 pause — Vercel Cron keepalive로 방지 |
| 부동소수점 연산 | JS 부동소수점 한계 — 원(정수) 단위 연산 원칙 + 세금별 절사 시점 준수 (과세표준: 천원/만원 미만 절사, 세액: 원 미만 절사) |
| 국토부 API 쿼터 | 공공데이터포털 일일 호출 한도 (기본 1,000회/일) — Redis 24h 캐싱 + 쿼터 초과 시 수동 fallback |
| 이력 보존 | 사용자당 최대 200건 — Supabase Free 500MB 내 안정 운영 |
| 세율 관리 | 세법 개정 시 시딩 CLI로 DB 업데이트 (v2.0에서 Admin UI 추가) |

### 5.2 외부 의존성

| 의존성 | 용도 | 비용 |
|-------|------|------|
| Supabase | Auth + PostgreSQL DB | Free tier → MVP |
| Vercel | 배포 | Free tier |
| shadcn/ui | UI 컴포넌트 | 무료 (MIT) |
| @react-pdf/renderer 또는 jsPDF | PDF 생성 (PoC 후 확정) | 무료 (MIT) |
| Upstash Redis | API 프록시 캐싱 + rate limiting | Free tier (10K req/day) |
| 국토교통부 공동주택가격 API | 공시가격 프록시 조회 | 무료 (API 키 필요) |
| 공공데이터포털 파일 | 오피스텔·상업용 기준시가 (수도권+광역시) | 무료 |

---

## 6. Risks & Mitigations

| Risk | 확률 | 심각도 | 대응 방안 |
|------|:---:|:---:|---------|
| 세금 계산 오류 (법적 리스크) | 중 | 심각 | 단위 테스트 100%, 세무사 검증, 면책 고지 |
| 세법 개정 반영 지연 | 중 | 심각 | DB 기반 세율 관리 (배포 없이 업데이트) |
| 재산세↔종부세 연동 오류 | 중 | 높음 | 연동 통합 테스트 + 국세청 예시 기반 크로스 검증 |
| 종부세 다주택 입력 UX 복잡성 | 높음 | 중간 | 물건 추가/삭제 직관적 UI + 합산 실시간 프리뷰 |
| 공정시장가액비율 변경 | 중 | 중간 | DB category='fair_market_ratio'로 별도 관리 |
| PDF 생성 Vercel 제약 | 중 | 중간 | Phase 6 PoC로 번들/시간/메모리 검증 후 방식 확정 |
| 비인증 API 남용 | 중 | 중간 | Upstash rate limiting (계산 30/min, 기준시가 10/min) |
| 기준시가 API 장애/변경 | 낮음 | 중간 | 수동 입력 fallback 유지 + Redis 캐싱 |
| DB 용량 초과 | 중 | 중간 | 기준시가 DB 적재 범위 수도권+광역시 한정, API 프록시 전략 |
| Supabase RLS 설정 오류 | 낮음 | 높음 | 타 사용자 데이터 접근 테스트 |

---

## 7. Out of Scope (현재 버전 제외)

- 절세 시나리오 비교 / What-if 시뮬레이션 (v2.0)
- 상속 vs 증여 비교 시뮬레이터 (v2.0)
- Pro 구독 결제 기능 (v2.0)
- B2B 라이선스 / 고객 관리 대시보드 (v2.0)
- 세무사-고객 협업 워크플로우 (v2.1)
- API 외부 제공 (v2.1)
- 다국어 지원

---

## 8. Definition of Done

- [ ] 6가지 세금 계산기 모두 UI + 계산 엔진 완성
- [ ] 단위 테스트 작성 (계산 엔진 핵심 로직 100%)
- [ ] 재산세↔종합부동산세 연동 계산 통합 테스트 통과
- [ ] Supabase 인증 + RLS 적용 완료
- [ ] 계산 이력 저장/조회 동작 확인 (6가지 세금 + 연동 그룹)
- [ ] PDF 출력 기능 동작 확인
- [ ] 기준시가 자동 조회 동작 확인
- [ ] 모바일 반응형 확인
- [ ] 면책 고지 문구 전 페이지 표시
- [ ] Vercel 배포 성공
