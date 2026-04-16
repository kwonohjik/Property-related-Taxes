# 재산세 계산기 개발 계획 (Property Tax)

> 작성일: 2026-04-16 | Phase 3 (v1.3) 대상
> 담당 에이전트: 5개 전문 에이전트 공동 작업
> 설계 문서: `docs/02-design/features/korean-tax-calc-engine.design.md`
> 법령 기준: 지방세법 제104조~제122조, 동법 시행령 제101조~제109조, 지방세특례제한법

---

## 1. 전체 구조 및 에이전트 책임 분담

```
┌────────────────────────────────────────────────────────────────────┐
│                      재산세 계산기 전체 흐름                          │
│                                                                    │
│  입력 → [과세대상 판정] → [물건 분기] → [서브엔진 3종] → [부가세]       │
│          object-senior    object      aggregate/separate/farmland │
│                                        ↓                           │
│                              [property-tax.ts 메인 엔진]            │
│                                property-tax-senior                 │
│                                        ↓                           │
│                    [API Route] → [UI 폼] → [결과 화면]               │
│                                        ↓                           │
│                   [종부세 연동 export: taxBase·determinedTax]        │
└────────────────────────────────────────────────────────────────────┘
```

### 에이전트별 담당 영역

| 에이전트 | 담당 파일 | 핵심 역할 |
|---------|---------|---------|
| `property-tax-senior` | `property-tax.ts`, API, UI, DB 시딩 | 메인 엔진, 공정시장가액비율, 주택/건축물 세율, 세부담상한, 부가세, 종부세 연동 export |
| `property-tax-object-senior` | `property-object.ts`, `property-taxpayer.ts`, `property-house-scope.ts`, `property-land-classification.ts`, `property-exemption.ts` | 5종 물건 판정, 납세의무자 확정(§107), 주택 범위·부속토지, 토지 3분류 분기, §109 비과세·감면 |
| `property-tax-comprehensive-aggregate-senior` | `property-tax-comprehensive-aggregate.ts` | 종합합산 판정·인별 전국합산·누진세율(0.2/0.3/0.5%)·지자체 안분·세부담상한 150% |
| `property-tax-separate-aggregate-senior` | `separate-aggregate-land.ts` | 별도합산 판정·용도지역별 기준면적(3/4/5/7배)·누진세율(0.2/0.3/0.4%)·초과분 종합합산 이관 |
| `property-tax-separate-senior` | `separate-taxation.ts`, `SeparateTaxationDetailCard.tsx` | 분리과세 3구간(저율 0.07%/일반 0.2%/중과 4%)·종부세 배제 플래그 |

---

## 2. 생성할 파일 목록

### 2.1 엔진 레이어 (`lib/tax-engine/`)

```
lib/tax-engine/
├── types/
│   ├── property.types.ts                    ← 공유 타입(PropertyTaxInput/Result, 서브엔진 시그니처)
│   └── property-object.types.ts             ← 과세대상·납세의무자 타입
├── property-tax.ts                          ← 메인 통합 엔진 (Pure Engine)
├── property-object.ts                       ← 5종 물건·건축물 분류
├── property-taxpayer.ts                     ← 과세기준일 납세의무자 확정
├── property-house-scope.ts                  ← 주택 범위·겸용·부속토지·오피스텔
├── property-land-classification.ts          ← 토지 3분류 분기(비과세→분리→별도→종합)
├── property-exemption.ts                    ← 비과세(§109)·감면(지특법)
├── property-tax-comprehensive-aggregate.ts  ← 종합합산과세대상
├── separate-aggregate-land.ts               ← 별도합산과세대상
├── separate-taxation.ts                     ← 분리과세대상
└── legal-codes.ts                           ← PROPERTY.*, PROPERTY_CONST, PROPERTY_CAL, PROPERTY_SEPARATE 상수 확장
```

### 2.2 API·Validator·Store

```
app/api/calc/property/route.ts               ← Orchestrator (Rate Limit + Zod + preloadTaxRates)
lib/validators/property-input.ts             ← Zod 입력 스키마
lib/validators/separate-aggregate-input.ts   ← 별도합산 입력 스키마
supabase/seeds/property_rates_seed.sql       ← 세율·공정시장가액비율·세부담상한 시딩
```

### 2.3 UI 레이어

```
components/calc/PropertyTaxForm.tsx                      ← StepWizard 입력 폼
components/calc/results/PropertyTaxResultView.tsx        ← 결과 화면
components/calc/SeparateTaxationDetailCard.tsx           ← 분리과세 판정 근거 카드
app/calc/property-tax/page.tsx                           ← 기존 스켈레톤 교체
```

### 2.4 테스트

```
__tests__/tax-engine/property-tax.test.ts
__tests__/tax-engine/property-object.test.ts
__tests__/tax-engine/property-exemption.test.ts
__tests__/tax-engine/property-land-classification.test.ts
__tests__/tax-engine/property-house-scope.test.ts
__tests__/tax-engine/property-taxpayer.test.ts
__tests__/tax-engine/property-comprehensive-aggregate.test.ts
__tests__/tax-engine/separate-aggregate-land.test.ts
__tests__/tax-engine/separate-taxation.test.ts
```

---

## 3. 구현 흐름 (Pipeline)

```
1) 과세대상 판정 (property-object.ts)
     ├─ 5종 물건 확인 (land/building/house/vessel/aircraft)
     ├─ 비과세 판정 (property-exemption.ts) → 해당 시 조기반환
     ├─ 납세의무자 확정 (property-taxpayer.ts)
     └─ 물건별 분기
          ├─ 토지 → property-land-classification.ts
          │         ├─ 분리과세 → separate-taxation.ts ← 종부세 배제
          │         ├─ 별도합산 → separate-aggregate-land.ts
          │         │             └─ 초과분 → 종합합산 이관
          │         └─ 종합합산 → property-tax-comprehensive-aggregate.ts
          ├─ 주택 → property-house-scope.ts (겸용·부속토지·오피스텔)
          └─ 건축물 → property-object.classifyBuilding()

2) 세율 적용 (property-tax.ts)
     ├─ 공정시장가액비율 (주택 60% / 토지·건축물 70%)
     ├─ 과세표준 (천원 절사)
     ├─ 세율 (주택 누진 / 1세대1주택 특례 / 건축물 0.25% or 4%)
     └─ 세부담상한 (주택 3억/6억 기준 105·110·130% / 토지 150%)

3) 부가세 합산 (property-tax.ts)
     ├─ 지방교육세 (재산세 × 20%)
     ├─ 도시지역분 (과세표준 × 0.14%, 도시지역 한정)
     └─ 지역자원시설세 (건축물 4구간 누진)

4) 종부세 연동 (export)
     └─ calculatePropertyTax(input, rates) → { taxBase, determinedTax, ... }
```

---

## 4. Phase P1 — 메인 엔진 및 공통 인프라 (property-tax-senior)

| ID | 작업 | 파일 | 의존 | 완료기준 |
|----|------|------|------|---------|
| P1-01 | `PropertyTaxInput`/`PropertyTaxResult` 공유 타입 정의 | `types/property.types.ts` | - | tsc 통과, 서브엔진 공통 필드 포함 |
| P1-02 | 서브엔진 인터페이스 시그니처 문서화 (determinePropertyObjectType, calcAggregateLandTax, calcSeparateLandTax, calcFarmlandTax) | `types/property.types.ts` | P1-01 | 타입만 정의, 구현 없음 |
| P1-03 | DB 세율 시딩 SQL (주택 누진 4구간×2, 공정시장가액비율, 세부담상한, 지역자원시설세 4구간, 건축물, 분납 기준) | `supabase/seeds/property_rates_seed.sql` | P1-01 | supabase db reset 후 `property:*` 키 레코드 확인 |
| P1-04 | 공정시장가액비율 적용 + 과세표준 계산(`calcTaxBase`) — 주택 60%, 토지·건축물 70%, `truncateToThousand` | `property-tax.ts` | P1-01, P1-03 | 주택 10억→6억, 토지 1억→7,000만 단위 테스트 |
| P1-05 | 주택 누진세율 계산(`calcHousingTax`) — 일반 4구간·특례 4구간, `applyRate()` | `property-tax.ts` | P1-04 | 6천만/1.5억/3억 경계값 + 9억 특례 분기 통과 |
| P1-06 | 건축물 세율 계산(`calcBuildingTax`) — 일반 0.25%, 골프장·고급오락장 4% | `property-tax.ts` | P1-04 | 일반/사치성 각 1케이스 |
| P1-07 | 세부담상한(`applyTaxCap`) — 3억/6억 주택 105·110·130%, 토지 150%, 전년도 미입력시 생략+warning | `property-tax.ts` | P1-05, P1-06 | 경계값 구간별 상한율 전환 통과 |
| P1-08 | 부가세 합산(`calcSurtax`) — 지방교육세 20%, 도시지역분 0.14%, 지역자원시설세 4구간 | `property-tax.ts` | P1-07 | 도시지역 on/off 분기 + 원 미만 절사 |
| P1-09 | 메인 엔진 `calculatePropertyTax(input, rates)` — P1-04~08 호출, 서브엔진 stub은 NOT_IMPLEMENTED throw, 분납 안내 | `property-tax.ts` | P1-04~08 | `PropertyTaxResult` 반환, `taxBase`·`determinedTax` 포함 |
| P1-10 | 종부세 연동 타입 호환성 검증 | `property-tax.ts` | P1-09 | `calculateProration()` 입력 호환 확인 |
| P1-11 | 메인 엔진 단위 테스트 15케이스 이상 | `__tests__/tax-engine/property-tax.test.ts` | P1-09 | T01~T15 전체 통과 |
| P1-12 | Zod 입력 검증 스키마 | `lib/validators/property-input.ts` | P1-01 | 유효/무효 parse 확인 |
| P1-13 | API Route Handler (POST `/api/calc/property`) — Rate Limit 30/분, preloadTaxRates, saveCalculation | `app/api/calc/property/route.ts` | P1-09, P1-12 | 200/400/429 각 응답 확인 |
| P1-14 | StepWizard 입력 폼 (Step1 물건·공시가·1세대1주택·도시지역 / Step2 토지 분류 / Step3 전년도 세액 / Step4 결과) | `components/calc/PropertyTaxForm.tsx` | P1-13 | 모든 단계 뒤로/다음 버튼, Step1 뒤로→홈 |
| P1-15 | 결과 화면 (과세표준·세율·특례·상한·부가세 분해·분납 안내) | `components/calc/results/PropertyTaxResultView.tsx` | P1-09 | 조건부 렌더링 확인 |
| P1-16 | 기존 스켈레톤 페이지 교체 + 메타데이터 | `app/calc/property-tax/page.tsx` | P1-14, P1-15 | `/calc/property-tax` 렌더링 |
| P1-17 | 종부세 연동 시나리오 테스트 (복수 주택) | `__tests__/tax-engine/property-tax.test.ts` | P1-10 | 2주택 각 반환값 타입 검증 |
| P1-18 | lint·build 최종 확인 | - | 전체 | `npm run lint`/`build`/`test` 전부 0 오류 |

---

## 5. Phase P2 — 과세대상 판정 모듈 (property-tax-object-senior)

**우선순위**: 비과세(§109) → 분리과세(§106②) → 별도합산(§106①2호) → 종합합산(default)

| ID | 작업 | 파일 | 의존 | 완료기준 |
|----|------|------|------|---------|
| P2-01 | `PropertyTaxObjectType`, `LandClassification`, `ZoningDistrictType` 유니온 타입 | `types/property-object.types.ts` | - | 5종·3분류·용도지역 7종 export |
| P2-02 | `LandInput`/`HouseInput`/`BuildingInput` 인터페이스 | `types/property-object.types.ts` | P2-01 | 필드별 단위(m²·원) JSDoc |
| P2-03 | `PropertyObjectInput`/`PropertyObjectResult` 최상위 타입 | `types/property-object.types.ts` | P2-02 | `taxBase`·`warnings`·`legalBasis` 포함 |
| P2-04 | `CoOwnershipShare` + `PropertyTaxpayerType` 8종 | `types/property-object.types.ts` | P2-01 | export 확인 |
| P2-05 | `PROPERTY.*` 법령 상수 확장 (§104~§109) | `legal-codes.ts` | - | NON_TAXABLE/TAXPAYER_DEF/LAND_CLASSIFICATION/HOUSE_SCOPE 추가 |
| P2-06 | §109 비과세 판정(`checkPropertyTaxExemption`) | `property-exemption.ts` | P2-03, P2-05 | 8종 비과세 사유 분기 |
| P2-07 | 지특법 감면 판정(`checkPropertyTaxReduction`) 6종 | `property-exemption.ts` | P2-06 | 공공임대·장기임대·중소기업 등 |
| P2-08 | 비과세·감면 테스트 | `__tests__/.../property-exemption.test.ts` | P2-07 | 5케이스 이상 |
| P2-09 | 분리과세 0.07%/0.2%/4% 판정(`classifySeparateTaxationLand`) | `property-land-classification.ts` | P2-05 | 9종 subtype 분기 |
| P2-10 | 별도합산 기준면적 판정(`classifySeparateAggregate`) | `property-land-classification.ts` | P2-09 | 용도지역 배율·recognized/excess 반환 |
| P2-11 | 토지 3분류 오케스트레이터(`classifyLand`) | `property-land-classification.ts` | P2-09, P2-10 | 4단계 우선순위 엄수, split 타입 지원 |
| P2-12 | 토지 분류 테스트 | `__tests__/.../property-land-classification.test.ts` | P2-11 | 자경·나대지·상업지역·한도초과·골프장 |
| P2-13 | 겸용주택 판정(`classifyMixedUseBuilding`) | `property-house-scope.ts` | P2-05 | 주거>비주거 / ≤ 분기 |
| P2-14 | 부속토지 한도 계산(`handleExcessAttachedLand`) | `property-house-scope.ts` | P2-13 | 도시 10배/비도시 5배 |
| P2-15 | 오피스텔 분류(`classifyOfficetel`) | `property-house-scope.ts` | P2-13 | 주거용/업무용 분기 |
| P2-16 | 주택 범위 집계(`calculateHouseScope`) | `property-house-scope.ts` | P2-14, P2-15 | totalHouseValue/excessLandValue 반환 |
| P2-17 | 주택 범위 테스트 | `__tests__/.../property-house-scope.test.ts` | P2-16 | 겸용 2종·부속토지 초과·오피스텔 2종 |
| P2-18 | 과세기준일 납세의무자 확정(`determineTaxpayer`) | `property-taxpayer.ts` | P2-05 | 우선순위 적용 + legalBasis |
| P2-19 | 공유 재산 지분 안분(`distributeCoOwnershipTax`) | `property-taxpayer.ts` | P2-18 | 지분 합 1.0 초과 에러 |
| P2-20 | 납세의무자 테스트 | `__tests__/.../property-taxpayer.test.ts` | P2-19 | 매매/신탁/상속/공유 |
| P2-21 | 5종 열거주의 판정(`isPropertyTaxObject`) | `property-object.ts` | P2-05 | 차량/기계장비 등 제외물건 false |
| P2-22 | 건축물 분류(`classifyBuilding`) | `property-object.ts` | P2-21 | 일반·골프장·고급오락장·공장 4종 |
| P2-23 | 최상위 진입점(`determinePropertyTaxObject`) | `property-object.ts` | P2-06, P2-11, P2-16, P2-18, P2-22 | 5단계 순서 엄수 |
| P2-24 | 과세대상 통합 테스트 | `__tests__/.../property-object.test.ts` | P2-23 | 7시나리오 이상 |
| P2-25 | `property-tax.ts` 연결 + smoke test | `property-tax.ts` | P2-23 | build 성공 |

---

## 6. Phase P3 — 종합합산과세대상 모듈 (comprehensive-aggregate-senior)

| ID | 작업 | 파일 | 의존 | 완료기준 |
|----|------|------|------|---------|
| P3-01 | `PROPERTY_CAL` 법령 상수 8개 추가 | `legal-codes.ts` | - | 문자열 리터럴 0건 |
| P3-02 | `PROPERTY_CONST` 수치 상수 (구간 5천만/1억, 누진공제 5만/255만, 상한율 1.50, 공정시장가액비율 0.70) | `legal-codes.ts` | P3-01 | 중복 없음 |
| P3-03 | `LandInfo`/`ComprehensiveAggregateInput`/`Result` 타입 + 열거형 | `property-tax-comprehensive-aggregate.ts` | P3-01 | 에이전트 정의 §5.1과 일치 |
| P3-04 | `isSeparatedTaxation(land)` 판정 | `property-tax-comprehensive-aggregate.ts` | P3-03 | 6경우 단위 테스트 |
| P3-05 | `isSeparateAggregate(land)` 기준면적 이내/초과 분리 | `property-tax-comprehensive-aggregate.ts` | P3-03 | 경계값 테스트 |
| P3-06 | `classifyLand(land)` 3분 오케스트레이터 | `property-tax-comprehensive-aggregate.ts` | P3-04, P3-05 | 우선순위 분리→별도→종합 |
| P3-07 | 인별 전국 합산 과세표준(`calculateComprehensiveAggregateTaxBase`) | `property-tax-comprehensive-aggregate.ts` | P3-06 | BigInt guard, `applyRate()` 사용 |
| P3-08 | 3단계 누진세율(`calculateComprehensiveAggregateTax`) | `property-tax-comprehensive-aggregate.ts` | P3-07 | 경계값 5천만/1억 정확 |
| P3-09 | 세부담상한 150% (`applyBurdenCap`) | `property-tax-comprehensive-aggregate.ts` | P3-08 | 전년도 미제공시 미적용 |
| P3-10 | 지자체 안분(`allocateByJurisdiction`) | `property-tax-comprehensive-aggregate.ts` | P3-08 | 세율 재적용 금지 |
| P3-11 | 메인 엔트리(`calculateComprehensiveAggregate`) | `property-tax-comprehensive-aggregate.ts` | P3-06~P3-10 | 종부세 연동 데이터 export |
| P3-12 | 테스트 12케이스 | `__tests__/.../property-comprehensive-aggregate.test.ts` | P3-11 | TC-01~12 전체 통과 |
| P3-13 | 기존 테스트 회귀 확인 | - | P3-01, P3-02 | 339개 유지 |

---

## 7. Phase P4 — 별도합산과세대상 모듈 (separate-aggregate-senior)

| ID | 작업 | 파일 | 의존 | 완료기준 |
|----|------|------|------|---------|
| P4-01 | `PROPERTY_SEPARATE` 법령 상수 7개 이상 | `legal-codes.ts` | - | 문자열 리터럴 0건 |
| P4-02 | `PROPERTY_SEPARATE_CONST` (배율 7종, 세율 3구간, 누진공제, 공정시장 0.70, 철거 6개월) | `legal-codes.ts` | P4-01 | 맵·배열 구조 |
| P4-03 | Zod 입력 스키마 (`demolished`+`demolishedDate` 연계 검증) | `lib/validators/separate-aggregate-input.ts` | P4-01 | superRefine 유효/무효 각 5건 |
| P4-04 | `isSeparateAggregateLand()` 판정 (4단계 우선순위 + 철거 6개월 경계) | `separate-aggregate-land.ts` | P4-02 | 판정 테스트 10건 |
| P4-05 | `calculateBaseArea()` 기준면적 계산 (용도지역 7종 배율) | `separate-aggregate-land.ts` | P4-02 | 용도지역 7개 정확도 100% |
| P4-06 | `splitByBaseArea()` 면적·가액 안분 + 종합합산 이관 | `separate-aggregate-land.ts` | P4-05 | 정수 연산 오버플로 없음 |
| P4-07 | `calculateSeparateAggregateTax()` 누진 0.2/0.3/0.4% | `separate-aggregate-land.ts` | P4-04~06 | `applyRate`/`truncateToThousand` |
| P4-08 | 누진세율 경계값 테스트 10건 | `__tests__/.../separate-aggregate-land.test.ts` | P4-07 | 2억/10억 정확 |
| P4-09 | 용도지역 기준면적 테스트 7건 | `__tests__/.../separate-aggregate-land.test.ts` | P4-05, P4-06 | 7개 배율 정확 |
| P4-10 | 철거 6개월 경계 테스트 3건 | `__tests__/.../separate-aggregate-land.test.ts` | P4-04 | 5개월/6개월/6개월+1일 |
| P4-11 | 복수 토지 합산 테스트 | `__tests__/.../separate-aggregate-land.test.ts` | P4-07 | 누진 효과 검증 |
| P4-12 | `property-tax.ts` 연동 (`landTaxType:'separate'` 분기) | `property-tax.ts` | P4-07 | 초과분 종합합산 합산, 순환 import 없음 |
| P4-13 | DB 세율 맵 fallback 경로 | `separate-aggregate-land.ts` | P4-07 | 상수 fallback 동작 |
| P4-14 | 분리·별도·종합 경계 통합 테스트 3건 | `__tests__/.../separate-aggregate-land.test.ts` | P4-07 | reason에 법령 상수 포함 |

---

## 8. Phase P5 — 분리과세대상 모듈 (separate-senior)

| ID | 작업 | 파일 | 의존 | 완료기준 |
|----|------|------|------|---------|
| P5-01 | `PROPERTY.SEPARATE.*` 상수 10개 (저율3·일반3·중과2·공통2) | `legal-codes.ts` | - | const assert |
| P5-02 | `SeparateTaxationInput/Result/Category` 타입 | `separate-taxation.ts` | P5-01 | 에이전트 정의 §7.1 일치 |
| P5-03 | 저율(0.07%) 판정 (농지 자경·목장·보전산지) | `separate-taxation.ts` | P5-02 | reasoning.legalBasis 포함 |
| P5-04 | 일반(0.2%) 판정 (공장·염전·터미널·주차장) | `separate-taxation.ts` | P5-02 | 기준면적 초과 warning |
| P5-05 | 중과(4%) 판정 (회원제 골프장·고급오락장), 대중제/간이 구분 경고 | `separate-taxation.ts` | P5-02 | golfCourseType 미입력 warning |
| P5-06 | `classifySeparateTaxation()` 통합 + excludedFrom | `separate-taxation.ts` | P5-03~05 | ['comprehensive','special_aggregated'] |
| P5-07 | `calculateSeparateTaxationTax()` 시가표준×70% 천원절사→단일세율 | `separate-taxation.ts` | P5-06 | 절사 오차 0원 |
| P5-08 | 종부세 배제 플래그 export + jsdoc | `separate-taxation.ts` | P5-07 | comprehensive-tax에서 import 가능 |
| P5-09 | `SeparateTaxationDetailCard` (배지·법령·경고) | `components/calc/SeparateTaxationDetailCard.tsx` | P5-07 | 스냅샷 테스트 |
| P5-10 | 저율 테스트 4건 | `__tests__/.../separate-taxation.test.ts` | P5-07 | legalBasis 정확성 |
| P5-11 | 일반 테스트 3건 | `__tests__/.../separate-taxation.test.ts` | P5-10 | 공장 초과 warning |
| P5-12 | 중과 테스트 4건 (대중제 배제 포함) | `__tests__/.../separate-taxation.test.ts` | P5-10 | 중과 배제 케이스 warnings |
| P5-13 | 정밀도 테스트 3건 (천원/원/BigInt) | `__tests__/.../separate-taxation.test.ts` | P5-11, P5-12 | 오버플로 없음 |
| P5-14 | 경계·배제관계 테스트 3건 | `__tests__/.../separate-taxation.test.ts` | P5-13 | 총 14건 이상 통과 |
| P5-15 | `property-tax.ts` 분리과세 분기점 연동 | `property-tax.ts` | P5-08 | 단방향 import 확인 |

---

## 9. 테스트 전략

### 9.1 커버리지 목표
- 엔진 레이어: **100%** (property-tax.ts 및 서브엔진 5종)
- 계산 정확도: 경계값·정수 절사·BigInt overflow guard
- 총 테스트 케이스: **120건 이상**

### 9.2 필수 회귀
- 기존 339개 테스트 유지
- `npm test` 전체 통과
- `npm run build`·`npm run lint` 0 오류

---

## 10. 종부세(comprehensive-tax) 연동 인터페이스

```typescript
// property-tax.ts export
export function calculatePropertyTax(
  input: PropertyTaxInput,
  rates: TaxRatesMap
): PropertyTaxResult;

export interface PropertyTaxResult {
  taxBase: number;         // 종부세 비율 안분에 사용
  determinedTax: number;   // 종부세 재산세 공제(부과세액)에 사용
  // ... (세부 항목)
}

// separate-taxation.ts export (종부세 배제 플래그)
export function isExcludedFromComprehensiveTax(
  result: SeparateTaxationResult
): boolean;
```

**단방향 import 규칙**: `comprehensive-tax → property-tax → (서브엔진)` 방향만 허용, 역방향 금지.

---

## 11. 위험 요소 및 대응

| 리스크 | 대응 |
|--------|------|
| 서브엔진 인터페이스 변경 시 property-tax.ts 영향 | P1-02에서 타입을 먼저 고정, 변경 시 에이전트 간 사전 협의 |
| 토지 분류 우선순위 오판 | 4단계 순서(비과세→분리→별도→종합) 단위 테스트로 강제 |
| 법령 문자열 리터럴 사용 | `legal-codes.ts`의 PROPERTY.*/PROPERTY_CAL/PROPERTY_SEPARATE 상수 의무화, ESLint 검사 고려 |
| 누진세율 경계값 부정확 | 경계 1원·정확값·경계+1원 3종 테스트 필수 |
| 공유재산 지분 합 오류 | 지분 합 1.0 초과 시 TaxCalculationError throw |
| 정수 오버플로 | `safeMultiply`/BigInt fallback 적용 |

---

## 12. 작업 순서 제안

```
Week 1: P1-01~03 (타입·시딩)  →  P2-01~05 (과세대상 타입·법령상수)
Week 2: P2-06~25 (과세대상 판정 모듈 전체)
Week 3: P3-01~13 (종합합산)  ||  P4-01~14 (별도합산) 병렬
Week 4: P5-01~15 (분리과세)  +  P1-04~11 (메인 엔진 세율·세부담·부가세)
Week 5: P1-12~18 (API·UI·최종)
```

---

## 13. 참고 문서

- PRD: `docs/00-pm/korean-tax-calc.prd.md` (M5·M6)
- Roadmap: `docs/00-pm/korean-tax-calc.roadmap.md`
- Engine Design: `docs/02-design/features/korean-tax-calc-engine.design.md`
- DB Schema: `docs/02-design/features/korean-tax-calc-db-schema.design.md`
- UI Design: `docs/02-design/features/korean-tax-calc-ui.design.md`
- TODO: `docs/01-plan/features/property-tax.todo.md`
