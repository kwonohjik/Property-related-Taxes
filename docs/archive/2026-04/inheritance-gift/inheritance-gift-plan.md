# 상속세·증여세 계산 엔진 세부 작업 계획서

> 작성일: 2026-04-15
> 참조 PRD: `docs/00-pm/korean-tax-calc.prd.md` (M2 상속세 / M3 증여세)
> 참조 설계: `docs/02-design/features/korean-tax-calc-engine.design.md`
> 참조 Plan: `docs/01-plan/features/korean-tax-calc.plan.md` (Phase 7~8)
> 협업 에이전트:
> - `inheritance-gift-tax-senior` (메인 엔진)
> - `inheritance-valuation-senior` (재산평가)
> - `inheritance-gift-deduction-senior` (상속·증여공제)
> - `inheritance-gift-tax-credit-senior` (세액공제·과세특례)
> - `inheritance-gift-nontax-teacher` (비과세 판단·UI·가이드)

---

## 0. Executive Summary

| 항목 | 내용 |
|------|------|
| **목표** | 상속세(상증법 §1~§4)·증여세(§4의2) 계산 엔진 + UI + API + 테스트를 양도소득세와 동일 품질로 구현 |
| **아키텍처** | 2-Layer (Orchestrator + Pure Engine) — DB 의존성 분리, 단위 테스트 mock 불필요 |
| **핵심 모듈** | 메인 엔진 2종 + 재산평가 2종 + 공제 5종 + 세액공제 6종 + 비과세 룰 (총 ~22 파일) |
| **세법 근거** | 상증법 §11·§12·§18~§24·§28~§30·§35·§46·§53·§60~§68·§69·§71·§73, 조특법 §30의5·§30의6·§30의7 |
| **전체 일정** | **약 28~30일** (5개 모듈 병렬 + 통합 5일) |
| **범위** | v1.2 (상속세 M2) + v1.3 (증여세 M3) — 수동 입력 위주, 외부 API 자동조회는 v1.4 |

---

## 1. 모듈 구조 개요 (책임 분담)

```
┌────────────────────────────────────────────────────────────────────┐
│  Orchestrator (Route Handler)                                      │
│    app/api/calc/inheritance/route.ts                               │
│    app/api/calc/gift/route.ts                                      │
│      ↓ Zod 검증 + preloadTaxRates() + 평가데이터 수집               │
└──────────────────────────┬─────────────────────────────────────────┘
                           ▼
┌────────────────────────────────────────────────────────────────────┐
│  Pure Engine (메인 — inheritance-gift-tax-senior)                  │
│    inheritance-tax.ts / gift-tax.ts                                │
│      산출세액 + 세대생략할증까지 산정                                │
└─┬──────────┬───────────┬──────────────┬────────────────────────────┘
  │          │           │              │
  ▼          ▼           ▼              ▼
[평가]    [비과세]    [공제]          [세액공제]
property- exemption-  deductions/    inheritance-
valuation rules.ts    inheritance-   gift-tax-
.ts(+st-              deductions.ts  credit.ts
ock.ts)               gift-          (+credits/*
                      deductions.ts   short-term,
                      personal-       foreign,
                      deduction-      special,
                      calc.ts         filing,
                      deduction-      installment)
                      optimizer.ts
```

### 1.1 의존 방향 (단방향)
```
inheritance-tax.ts ──→ property-valuation.ts
                  ├──→ inheritance-deductions.ts
                  ├──→ exemption-rules.ts
                  └──→ inheritance-gift-tax-credit.ts (산출세액 이후)

gift-tax.ts       ──→ property-valuation.ts
                  ├──→ gift-deductions.ts
                  ├──→ exemption-rules.ts
                  └──→ inheritance-gift-tax-credit.ts
```

역방향 import 금지.

---

## 2. 전체 파일 생성 목록 (22개 + 테스트 8개)

### 2.1 lib/tax-engine/ (코어 엔진)

| # | 파일 | 담당 에이전트 | 책임 |
|---|------|--------------|------|
| 1 | `inheritance-tax.ts` | tax-senior | 상속세 메인 엔진 |
| 2 | `gift-tax.ts` | tax-senior | 증여세 메인 엔진 |
| 3 | `inheritance-gift-common.ts` | tax-senior | 누진세율·세대생략할증 공통 유틸 |
| 4 | `property-valuation.ts` | valuation | 부동산·금융·임대차 평가 |
| 5 | `property-valuation-stock.ts` | valuation | 상장·비상장주식 평가 |
| 6 | `exemption-rules.ts` | nontax | 비과세 룰 엔진 |
| 7 | `exemption-evaluator.ts` | nontax | 체크리스트 → 차감액 계산 |
| 8 | `inheritance-gift-tax-credit.ts` | credit | 세액공제 메인 진입점 |
| 9 | `legal-codes.ts` (확장) | 전체 | `INH.*`, `GIFT.*`, `VALUATION.*`, `EXEMPTION.*`, `TAX_CREDIT.*` 추가 |

### 2.2 lib/tax-engine/deductions/ (공제 모듈)

| # | 파일 | 담당 |
|---|------|------|
| 10 | `deduction-types.ts` | deduction |
| 11 | `personal-deduction-calc.ts` | deduction |
| 12 | `inheritance-deductions.ts` | deduction |
| 13 | `gift-deductions.ts` | deduction |
| 14 | `deduction-optimizer.ts` | deduction |

### 2.3 lib/tax-engine/credits/ (세액공제 서브모듈)

| # | 파일 | 담당 |
|---|------|------|
| 15 | `short-term-reinheritance.ts` | credit |
| 16 | `foreign-tax-credit.ts` | credit |
| 17 | `special-tax-treatment.ts` (조특법 창업·가업) | credit |
| 18 | `filing-credit.ts` (3% 신고세액공제) | credit |
| 19 | `installment-payment.ts` (분납·물납 안내) | credit |

### 2.4 lib/validators/ (Zod 입력 스키마)

| # | 파일 | 담당 |
|---|------|------|
| 20 | `inheritance-input.ts` | tax-senior |
| 21 | `gift-input.ts` | tax-senior |
| 22 | `property-valuation-input.ts` | valuation |
| 23 | `exemption-input.ts` | nontax |

### 2.5 app/api/calc/ (Orchestrator)

| # | 파일 | 담당 |
|---|------|------|
| 24 | `inheritance/route.ts` | tax-senior |
| 25 | `gift/route.ts` | tax-senior |

### 2.6 components/calc/ (UI)

| # | 파일 | 담당 |
|---|------|------|
| 26 | `InheritanceTaxForm.tsx` | tax-senior |
| 27 | `GiftTaxForm.tsx` | tax-senior |
| 28 | `HeirComposition.tsx` | tax-senior |
| 29 | `PropertyValuationForm.tsx` | valuation |
| 30 | `StockValuationForm.tsx` | valuation |
| 31 | `PriorGiftInput.tsx` | tax-senior |
| 32 | `ExemptionChecklist.tsx` | nontax |
| 33 | `ExemptionWarning.tsx` | nontax |
| 34 | `ExemptionSummaryCard.tsx` | nontax |
| 35 | `TaxCreditBreakdownCard.tsx` | credit |
| 36 | `InheritanceTaxResultView.tsx` | tax-senior |
| 37 | `GiftTaxResultView.tsx` | tax-senior |

### 2.7 콘텐츠

| # | 파일 | 담당 |
|---|------|------|
| 38 | `content/guides/inheritance-nontax.mdx` | nontax |
| 39 | `content/guides/gift-nontax.mdx` | nontax |
| 40 | `content/guides/marriage-birth-exemption.mdx` | nontax |

### 2.8 테스트

| # | 파일 | 담당 |
|---|------|------|
| 41 | `__tests__/tax-engine/inheritance-tax.test.ts` | tax-senior |
| 42 | `__tests__/tax-engine/gift-tax.test.ts` | tax-senior |
| 43 | `__tests__/tax-engine/property-valuation.test.ts` | valuation |
| 44 | `__tests__/tax-engine/property-valuation-stock.test.ts` | valuation |
| 45 | `__tests__/tax-engine/deductions/inheritance-deductions.test.ts` | deduction |
| 46 | `__tests__/tax-engine/deductions/gift-deductions.test.ts` | deduction |
| 47 | `__tests__/tax-engine/credits/*.test.ts` (5개 스위트) | credit |
| 48 | `__tests__/tax-engine/exemption-rules.test.ts` | nontax |

### 2.9 시딩

| # | 파일 | 담당 |
|---|------|------|
| 49 | `supabase/seed/inheritance-gift-rates.sql` | tax-senior |

---

## 3. 메인 계산 흐름 (산출세액 → 최종납부세액)

### 3.1 상속세 통합 흐름

```
[Orchestrator]
  ① preloadTaxRates(['inheritance'], deathDate)
  ② preloadValuationParams(공시지가배율·기준시가)
  ③ Zod 검증 (InheritanceTaxInput)

[메인 엔진: inheritance-tax.ts]
  ④ 평가: PropertyValuationResult[] = items.map(evaluate)
  ⑤ 비과세 차감: totalExemptAmount = exemptionEvaluator(items)
  ⑥ 과세가액 = grossEstate - 비과세 - 공과금 - 장례비 - 채무
  ⑦ 사전증여 합산: + preGiftsWithin10Years
  ⑧ 공제 차감 (deduction 모듈): - calculateInheritanceDeductions()
       └─ 일괄 vs 항목별 자동 선택 + §24 종합한도
  ⑨ 과세표준 = max(0, taxableValue - applied)  [천원 절사]
  ⑩ 누진세율 적용 → 산출세액 [원 절사]
  ⑪ 세대생략 할증 (30% / 미성년·20억초과 40%)

[세액공제 모듈: inheritance-gift-tax-credit.ts]
  ⑫ - 증여세액공제 (§28)
  ⑬ - 단기재상속 공제 (§30)
  ⑭ - 외국납부세액공제 (§29)
  ⑮ - 신고세액공제 (§69, 3%)
  ⑯ = 최종 납부세액 + 분납·물납 안내
```

### 3.2 증여세 통합 흐름

```
[Orchestrator]
  ① preloadTaxRates(['gift'], giftDate)
  ② Zod 검증 (GiftTaxInput)

[메인 엔진: gift-tax.ts]
  ③ 평가: 증여재산 평가 + 저가·고가 양도 증여의제 검출
  ④ 비과세 차감 (생활비·축의금·혼인공제·출산공제)
  ⑤ 채무인수액 차감
  ⑥ 10년내 동일인 증여 합산
  ⑦ 증여재산공제 (관계별 한도 - 10년 기적용분)
  ⑧ 과세표준 [천원 절사]
  ⑨ 누진세율 → 산출세액
  ⑩ 세대생략 할증

[세액공제 모듈]
  ⑪ - 외국납부세액공제 (§59)
  ⑫ - 기납부세액공제 (10년 합산 분)
  ⑬ - 신고세액공제 (§69, 3%)
  ⑭ = 최종 납부세액 (+ 조특법 과세특례 별도 비교)
```

---

## 4. 핵심 타입 정의 (요약)

### 4.1 InheritanceTaxInput

| 필드 | 타입 | 설명 |
|------|------|------|
| `decedentType` | `'resident' \| 'non-resident'` | 거주자/비거주자 |
| `deathDate` | `string` (ISO) | 상속개시일 |
| `estateItems` | `EstateItem[]` | 평가 대상 자산 목록 |
| `funeralExpense` | `number` | 장례비용 (최대 1,500만원) |
| `funeralBongan` | `boolean` | 봉안시설 추가(+500만) |
| `debts` | `number` | 공과금 + 사적채무 |
| `exemptions` | `ExemptionInput` | 비과세 항목 (nontax 모듈) |
| `preGiftsWithin10Years` | `PriorGift[]` | 사전증여재산 |
| `heirs` | `Heir[]` | 상속인 구성 (배우자·자녀 등) |
| `deductionInput` | `InheritanceDeductionInput` | 7종 공제 입력 |
| `creditInput` | `InheritanceTaxCreditInput` | 세액공제 입력 |
| `isFiledOnTime` | `boolean` | 6개월 내 신고 여부 |

### 4.2 GiftTaxInput

| 필드 | 타입 | 설명 |
|------|------|------|
| `giftDate` | `string` (ISO) | 증여일 |
| `donorRelation` | `'spouse'\|'linealAsc'\|'linealDesc'\|'minorLinealDesc'\|'otherRelatives'` | 관계 |
| `giftItems` | `GiftItem[]` | 평가 대상 |
| `exemptions` | `ExemptionInput` | 비과세 항목 |
| `priorGiftsWithin10Years` | `PriorGift[]` | 동일인 10년 합산 |
| `isGenerationSkip` | `boolean` | 세대생략 여부 |
| `isMinor` | `boolean` | 수증자 미성년 |
| `specialTreatment?` | `'startup'\|'familyBusiness'` | 조특법 특례 선택 |
| `marriageExemption?` | `number` | 혼인공제 (≤1억) |
| `birthExemption?` | `number` | 출산공제 (≤1억) |
| `isFiledOnTime` | `boolean` | 3개월 내 신고 여부 |

### 4.3 공통 Result 구조

각 결과 타입은 다음 공통 필드 포함:
- `breakdown: CalculationStep[]` — 단계별 산식·금액
- `appliedLaws: string[]` — 근거 조문 (UI 배지용)
- `warnings: string[]` — 사후관리·추징·분납 안내
- `appliedLawDate: string` — 적용 세법 기준일

---

## 5. 세율·공제 시딩 (`tax_rates` 테이블)

### 5.1 누진세율 (상속·증여 공통)

```json
{
  "tax_type": "inheritance|gift",
  "category": "progressive",
  "effective_date": "2024-01-01",
  "rate_table": {
    "brackets": [
      {"max": 100000000, "rate": 0.10},
      {"max": 500000000, "rate": 0.20, "deduction": 10000000},
      {"max": 1000000000, "rate": 0.30, "deduction": 60000000},
      {"max": 3000000000, "rate": 0.40, "deduction": 160000000},
      {"rate": 0.50, "deduction": 460000000}
    ]
  }
}
```

### 5.2 세대생략 할증

```json
{ "category": "surcharge",
  "rate_table": { "default": 0.30, "minorOver2B": 0.40 } }
```

### 5.3 상속공제 (`deduction_rules` jsonb)

```json
{
  "basic": 200000000,
  "lumpSum": 500000000,
  "spouseMin": 500000000,
  "spouseMax": 3000000000,
  "personal": {
    "child": 50000000,
    "minor": {"perYear": 10000000, "thresholdAge": 19},
    "elder": {"perPerson": 50000000, "thresholdAge": 65},
    "disabled": {"perYear": 10000000, "useLifeTable": "2024"}
  },
  "financial": [
    {"max": 20000000, "rate": 1.0},
    {"max": 100000000, "flat": 20000000},
    {"rate": 0.20, "cap": 200000000}
  ],
  "cohabit": {"shareRate": 0.80, "cap": 600000000},
  "farm": {"cap": 3000000000},
  "familyBiz": [
    {"years": 10, "cap": 20000000000},
    {"years": 20, "cap": 30000000000},
    {"years": 30, "cap": 60000000000}
  ]
}
```

### 5.4 증여재산공제

```json
{
  "spouse": 600000000,
  "linealAsc": 50000000,
  "linealDesc": 50000000,
  "minorLinealDesc": 20000000,
  "otherRelatives": 10000000,
  "marriageBirth": {"cap": 100000000, "windowYears": 2}
}
```

### 5.5 세액공제 (`tax_credit` 카테고리)

```json
{
  "shortTermReinherit": {
    "rateTable": [100, 90, 80, 70, 60, 50, 40, 30, 20, 10],
    "maxYears": 10
  },
  "filing": {"rate": 0.03, "inheritanceMonths": 6, "giftMonths": 3},
  "startupFund": {
    "deduction": 500000000,
    "lowRate": 0.10, "lowLimit": 1000000000,
    "highRate": 0.20,
    "maxLimit": 50000000000, "highEmployMaxLimit": 100000000000
  },
  "familyBusiness": {
    "deduction": 1000000000,
    "lowRate": 0.10, "lowLimit": 6000000000,
    "highRate": 0.20, "maxLimit": 60000000000
  },
  "installment": {"minTax": 10000000, "deadlineMonths": 2}
}
```

---

## 6. 단위 테스트 케이스 (총 ~110개)

| 모듈 | 케이스 수 | 핵심 경계값 |
|------|----------|-------------|
| inheritance-tax | 12 | 1억/5억/10억/30억 구간 경계, 세대생략 30%/40%, 법정상속분 |
| gift-tax | 6 | 10년 합산, 직계비속 성년/미성년, 동일인 2회 합산 |
| property-valuation | 18 | 시가 우선순위, 환산 절사, 임대차 환산 |
| property-valuation-stock | 별도 | 비상장 60:40, 부동산과다 80:20, 적자법인 |
| exemption-rules | 12 | 문화재/금양임야/혼인공제/축의금 |
| inheritance-deductions | 17 | 배우자 5억 보장/30억 한도, 일괄 vs 항목별, §24 종합한도 |
| gift-deductions | 8 | 직계존속 잔여, 혼인공제 중복, 10년 초과 재사용 |
| credits/short-term | 7 | 1·5·10년 경계, 10년 초과 0, 이중한도 |
| credits/foreign | 2 | 한도초과, 비례안분 |
| credits/filing | 3 | 3% 적용/미적용, 순서 |
| credits/special | 7 | 창업 5억·10억·50억, 가업 10억·60억·600억 |
| credits/installment | 2 | 1천만 경계, 50% 한도 |
| **합계** | **~110** | |

---

## 7. 비과세 룰 데이터 (16종)

### 7.1 상속세 비과세 8종 (§11·§12)
1. 지정문화재 (지정취소 시 5년내 추징)
2. 금양임야 600평
3. 묘토 1,200평
4. 족보·제구 1천만원
5. 공익법인 출연재산 (3년내 목적외 사용 시 추징)
6. 사망보험금 일부 (법정상속인 공제)
7. 정당·법정기부금 단체 유증
8. 퇴직연금 일부

### 7.2 증여세 비과세 8종 (§46·§46의2)
1. 부양가족 생활비·교육비 (필요시마다 원칙)
2. 축의금·부의금·혼수용품 (사회통념상 범위)
3. 장애인 보조금
4. 국가유공자 보조금
5. 혼인공제 1억 (§46의2, 평생 1회)
6. 출산공제 1억 (§46의2)
7. 사회통념상 선물
8. 신탁이익 일부

### 7.3 잘못된 사례 5개 (UI 경고)
- 축의금 전액 비과세 오해
- 자녀 유학비 일시 송금 (목돈은 증여)
- 혼인공제 양가 각 1억 착각 (수증자 기준 1억)
- 금양임야 600평 초과분 전체 과세 오인 (초과분만 과세)
- 공익법인 3년내 목적외 사용 (추징 + 가산세)

---

## 8. 에러 코드 추가 (`tax-errors.ts`)

```ts
TaxErrorCode.INVALID_HEIR_SHARE
TaxErrorCode.NEGATIVE_TAXABLE_VALUE
TaxErrorCode.INVALID_DEATH_DATE
TaxErrorCode.PRIOR_GIFT_DATE_MISMATCH
TaxErrorCode.INVALID_GENERATION_SKIP_CONFIG
TaxErrorCode.RATE_TABLE_NOT_LOADED
TaxErrorCode.ZERO_SHARES                  // 비상장주식
TaxErrorCode.NO_PRICE_DATA                // 상장주식 데이터 없음
TaxErrorCode.PREV_INHERITANCE_VALUE_ZERO  // 단기재상속 분모 0
TaxErrorCode.EXEMPTION_RULE_UNKNOWN
TaxErrorCode.EXEMPTION_LIMIT_EXCEEDED
TaxErrorCode.MARRIAGE_EXEMPTION_ALREADY_USED
```

---

## 9. legal-codes.ts 확장 상수 묶음

```ts
// 누진세율·할증 (메인)
INH.* / GIFT.*

// 재산평가
VALUATION.ART_60_MARKET_PRIORITY
VALUATION.ART_61_REAL_ESTATE
VALUATION.ART_63_SECURITIES
VALUATION.DECREE_49_EVAL_PERIOD
VALUATION.DECREE_52_2_LISTED_AVG
VALUATION.DECREE_54_UNLISTED_WEIGHT
VALUATION.DECREE_54_REAL_ESTATE_HEAVY
VALUATION.CAPITALIZATION_RATE_12
VALUATION.BARGAIN_THRESHOLD_30PCT_3OKR

// 비과세
EXEMPTION.INH_ART11_NATIONAL_DONATION
EXEMPTION.INH_ART12_1~8 (8종)
EXEMPTION.GIFT_ART46_LIVELIHOOD
EXEMPTION.GIFT_ART46_2_MARRIAGE_BIRTH

// 세액공제
TAX_CREDIT.PRIOR_GIFT             // §28
TAX_CREDIT.SHORT_TERM_REINHERIT   // §30
TAX_CREDIT.FOREIGN_INHERIT        // §29
TAX_CREDIT.FOREIGN_GIFT           // §59
TAX_CREDIT.FILING                 // §69
TAX_CREDIT.STARTUP_FUND           // 조특 §30의5
TAX_CREDIT.FAMILY_BUSINESS        // 조특 §30의6
TAX_CREDIT.DEFER_INHERIT          // 조특 §30의7
TAX_CREDIT.INSTALLMENT            // §71
TAX_CREDIT.IN_KIND_PAYMENT        // §73
```

---

## 10. 작업 일정 (모듈별 + 통합)

### 10.1 모듈별 일정 (병렬 진행 가능)

| 모듈 | 담당 에이전트 | 일정 |
|------|--------------|------|
| 메인 엔진 (상속·증여) | tax-senior | 6일 |
| 재산평가 | valuation | 7일 |
| 공제 (7종+증여) | deduction | 6.5일 |
| 세액공제·과세특례 | credit | 4.5일 |
| 비과세 룰·UI·가이드 | nontax | 5.5일 |

### 10.2 통합 작업 순서 (Critical Path)

```
Week 1 (5일): 기반 작업
  - Day 1: legal-codes.ts 통합 확장 + 세율 시딩 (모든 에이전트 협업)
  - Day 2-3: 타입 정의 통합 (Input/Result 인터페이스 확정)
  - Day 4-5: tax-utils.ts 보강 (필요 시)

Week 2 (5일): 평가·공제·비과세 병렬 개발
  - valuation·deduction·nontax 동시 진행

Week 3 (5일): 메인 엔진·세액공제
  - tax-senior가 평가·공제·비과세 결과를 통합
  - credit 모듈 산출세액 이후 단계 결합

Week 4 (5일): UI·통합 테스트
  - StepWizard·Form 컴포넌트
  - E2E 시나리오 + gap-detector 검증

Week 5 (5일): QA·문서·배포
  - 110개 단위 테스트 통과
  - simplify → completion report
```

**전체 예상 일정: 약 25~30일 (5~6주)**

---

## 11. UI 컴포넌트 책임 (CLAUDE.md 준수)

| 컴포넌트 | 사용 규칙 |
|----------|----------|
| 금액 입력 | `CurrencyInput` (`parseAmount()`) 필수 |
| 날짜 입력 | `DateInput` 필수 (`type="date"` 금지) |
| 포커스 자동 선택 | `SelectOnFocusProvider` 자동 적용 (개별 추가 불필요) |
| StepWizard 네비 | 모든 단계 뒤로가기+다음 버튼 / 1단계 뒤로가기=홈 |
| 결과 카드 | `breakdown[]` + `appliedLaws[]` 배지 + `warnings[]` 알림 |

---

## 12. 검증 기준 (Definition of Done)

- [ ] 110개 단위 테스트 100% 통과
- [ ] 메인 엔진 ↔ 평가/공제/세액공제 모듈 단방향 의존 검증
- [ ] gap-detector Match Rate ≥ 90%
- [ ] 국세청 홈택스 예시 5건 결과 일치 (상속 3건 + 증여 2건)
- [ ] 세무사 실무사례집 10건 검증
- [ ] simplify 패스 (코드 중복·미사용 검출)
- [ ] PDCA Report 생성

---

## 13. 향후 확장 (v2.0 이상)

- 외국납부세액공제 상세 계산 (조세조약별 면제법/세액공제법 분기)
- 평가심의위원회 신청 자동화
- 기준시가 자동조회 (국토부 / 국세청 / RTMS API 연동)
- 가업상속공제 사후관리 추징 시뮬레이션
- 상속·증여 통합 절세 시뮬레이터 (10년 분산 증여 전략)

---

## 14. 참고 문서

- `docs/00-pm/korean-tax-calc.prd.md` — M2/M3 요구사항
- `docs/00-pm/korean-tax-calc.roadmap.md` — Phase 3 (v1.2~v1.3)
- `docs/02-design/features/korean-tax-calc-engine.design.md` — 2-Layer 아키텍처
- `docs/01-plan/features/transfer-plan.md` — 양도세 계획서 (포맷 참조)
- `.claude/agents/inheritance-gift-tax-senior.md`
- `.claude/agents/inheritance-valuation-senior.md`
- `.claude/agents/inheritance-gift-deduction-senior.md`
- `.claude/agents/inheritance-gift-tax-credit-senior.md`
- `.claude/agents/inheritance-gift-nontax-teacher.md`
