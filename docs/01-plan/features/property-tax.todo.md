# 재산세 계산 엔진 TODO

> 계획서: `docs/01-plan/features/property-tax.plan.md`
> 최종 업데이트: 2026-04-16
> 담당 에이전트: property-tax-senior, property-tax-object-senior, property-tax-comprehensive-aggregate-senior, property-tax-separate-aggregate-senior, property-tax-separate-senior

---

## 진행 상태 범례

| 기호 | 상태 |
| ---- | ---- |
| `[ ]` | 미시작 |
| `[~]` | 진행 중 |
| `[x]` | 완료 |

---

## Phase P1 — 메인 엔진 및 공통 인프라 (property-tax-senior)

| 상태 | ID | 작업 | 파일 | 의존 | 완료 기준 |
| ---- | -- | ---- | ---- | ---- | --------- |
| `[x]` | P1-01 | `PropertyTaxInput`/`PropertyTaxResult` 공유 타입 정의 | `lib/tax-engine/types/property.types.ts` | - | tsc 통과 |
| `[x]` | P1-02 | 서브엔진 4종 함수 시그니처 정의 (구현 없음) | `lib/tax-engine/types/property.types.ts` | P1-01 | 타입 export |
| `[x]` | P1-03 | DB 세율 시딩 SQL (주택 4구간×2·공정시장가·상한·지역자원시설세 4구간·건축물·분납) | `supabase/seeds/property_rates_seed.sql` | P1-01 | `property:*` 키 레코드 삽입 |
| `[x]` | P1-04 | `calcTaxBase()` 공정시장가액비율 + 천원 절사 | `lib/tax-engine/property-tax.ts` | P1-01, P1-03 | 주택 60%/토지 70% 단위 테스트 |
| `[x]` | P1-05 | `calcHousingTax()` 주택 누진 + 1세대1주택 특례 | `lib/tax-engine/property-tax.ts` | P1-04 | 6천만/1.5억/3억/9억 경계 통과 |
| `[x]` | P1-06 | `calcBuildingTax()` 일반 0.25% / 골프·오락장 4% | `lib/tax-engine/property-tax.ts` | P1-04 | 2케이스 통과 |
| `[x]` | P1-07 | `applyTaxCap()` 주택 105·110·130% / 토지 150% | `lib/tax-engine/property-tax.ts` | P1-05, P1-06 | 경계 + 미입력 warning |
| `[x]` | P1-08 | `calcSurtax()` 지방교육세·도시지역분·지역자원시설세 | `lib/tax-engine/property-tax.ts` | P1-07 | 도시지역 on/off 분기 |
| `[x]` | P1-09 | `calculatePropertyTax(input, rates)` 메인 엔진 | `lib/tax-engine/property-tax.ts` | P1-04~08 | 서브엔진 stub throw + 분납 안내 |
| `[x]` | P1-10 | 종부세 연동 타입 호환성 검증 | `lib/tax-engine/property-tax.ts` | P1-09 | calculateProration 입력 호환 |
| `[x]` | P1-11 | 메인 엔진 단위 테스트 (T01~T15 최소 15건) | `__tests__/tax-engine/property-tax.test.ts` | P1-09 | 전체 통과 |
| `[x]` | P1-12 | Zod 입력 검증 스키마 | `lib/validators/property-input.ts` | P1-01 | parse 확인 |
| `[x]` | P1-13 | API Route Handler (Rate Limit 30/분, preloadTaxRates, saveCalculation) | `app/api/calc/property/route.ts` | P1-09, P1-12 | 200/400/429 |
| `[x]` | P1-14 | StepWizard 입력 폼 | `components/calc/PropertyTaxForm.tsx` | P1-13 | 뒤로/다음 버튼, Step1→홈 |
| `[x]` | P1-15 | 결과 화면 | `components/calc/results/PropertyTaxResultView.tsx` | P1-09 | 조건부 렌더링 |
| `[x]` | P1-16 | 스켈레톤 페이지 교체 | `app/calc/property-tax/page.tsx` | P1-14, P1-15 | `/calc/property-tax` 렌더링 |
| `[x]` | P1-17 | 종부세 연동 시나리오 테스트 | `__tests__/tax-engine/property-tax.test.ts` | P1-10 | 2주택 시나리오 |
| `[x]` | P1-18 | lint·build·test 최종 확인 | - | 전체 | 0 오류 |

---

## Phase P2 — 과세대상 판정 모듈 (property-tax-object-senior)

**우선순위**: 비과세(§109) → 분리과세(§106②) → 별도합산(§106①2호) → 종합합산(default)

### P2-A 타입·상수

| 상태 | ID | 작업 | 파일 | 의존 | 완료 기준 |
| ---- | -- | ---- | ---- | ---- | --------- |
| `[x]` | P2-01 | `PropertyTaxObjectType`/`LandClassification`/`ZoningDistrictType` 타입 | `lib/tax-engine/types/property-object.types.ts` | - | 5종·3분류·7지역 export |
| `[x]` | P2-02 | `LandInput`/`HouseInput`/`BuildingInput` 정의 | `lib/tax-engine/types/property-object.types.ts` | P2-01 | 단위 JSDoc |
| `[x]` | P2-03 | `PropertyObjectInput`/`Result` 최상위 타입 | `lib/tax-engine/types/property-object.types.ts` | P2-02 | taxBase/warnings/legalBasis |
| `[x]` | P2-04 | `CoOwnershipShare` + `PropertyTaxpayerType` 8종 | `lib/tax-engine/types/property-object.types.ts` | P2-01 | export |
| `[x]` | P2-05 | `PROPERTY.*` 법령 상수 확장 (§104~§109) | `lib/tax-engine/legal-codes.ts` | - | 문자열 리터럴 0건 |

### P2-B 비과세·감면

| 상태 | ID | 작업 | 파일 | 의존 | 완료 기준 |
| ---- | -- | ---- | ---- | ---- | --------- |
| `[x]` | P2-06 | `checkPropertyTaxExemption()` §109 비과세 8종 | `lib/tax-engine/property-exemption.ts` | P2-03, P2-05 | legalBasis 반환 |
| `[x]` | P2-07 | `checkPropertyTaxReduction()` 지특법 감면 6종 | `lib/tax-engine/property-exemption.ts` | P2-06 | 감면율 반환 |
| `[x]` | P2-08 | 비과세·감면 테스트 5건 | `__tests__/tax-engine/property-exemption.test.ts` | P2-07 | 통과 |

### P2-C 토지 분류

| 상태 | ID | 작업 | 파일 | 의존 | 완료 기준 |
| ---- | -- | ---- | ---- | ---- | --------- |
| `[x]` | P2-09 | `classifySeparateTaxationLand()` 9종 분기 | `lib/tax-engine/property-land-classification.ts` | P2-05 | subtype·rate 반환 |
| `[x]` | P2-10 | `classifySeparateAggregate()` 용도지역 배율 | `lib/tax-engine/property-land-classification.ts` | P2-09 | recognizedArea/excessArea |
| `[x]` | P2-11 | `classifyLand()` 4단계 오케스트레이터 | `lib/tax-engine/property-land-classification.ts` | P2-09, P2-10 | split 타입 지원 |
| `[x]` | P2-12 | 토지 분류 테스트 5건 | `__tests__/tax-engine/property-land-classification.test.ts` | P2-11 | 자경·나대지·상업·초과·골프장 |

### P2-D 주택 범위

| 상태 | ID | 작업 | 파일 | 의존 | 완료 기준 |
| ---- | -- | ---- | ---- | ---- | --------- |
| `[x]` | P2-13 | `classifyMixedUseBuilding()` 겸용 판정 | `lib/tax-engine/property-house-scope.ts` | P2-05 | housePortion 반환 |
| `[x]` | P2-14 | `handleExcessAttachedLand()` 한도 초과 분리 | `lib/tax-engine/property-house-scope.ts` | P2-13 | 10배/5배 |
| `[x]` | P2-15 | `classifyOfficetel()` 주거용/업무용 | `lib/tax-engine/property-house-scope.ts` | P2-13 | 분기 legalBasis |
| `[x]` | P2-16 | `calculateHouseScope()` 통합 집계 | `lib/tax-engine/property-house-scope.ts` | P2-14, P2-15 | totalHouseValue 반환 |
| `[x]` | P2-17 | 주택 범위 테스트 5건 | `__tests__/tax-engine/property-house-scope.test.ts` | P2-16 | 통과 |

### P2-E 납세의무자

| 상태 | ID | 작업 | 파일 | 의존 | 완료 기준 |
| ---- | -- | ---- | ---- | ---- | --------- |
| `[x]` | P2-18 | `determineTaxpayer()` 우선순위 분기 | `lib/tax-engine/property-taxpayer.ts` | P2-05 | legalBasis·warnings |
| `[x]` | P2-19 | `distributeCoOwnershipTax()` 공유 안분 | `lib/tax-engine/property-taxpayer.ts` | P2-18 | 지분 합 >1 에러 |
| `[x]` | P2-20 | 납세의무자 테스트 5건 | `__tests__/tax-engine/property-taxpayer.test.ts` | P2-19 | 매매/신탁/상속/공유 |

### P2-F 통합

| 상태 | ID | 작업 | 파일 | 의존 | 완료 기준 |
| ---- | -- | ---- | ---- | ---- | --------- |
| `[x]` | P2-21 | `isPropertyTaxObject()` 5종 열거주의 | `lib/tax-engine/property-object.ts` | P2-05 | 차량 등 제외 |
| `[x]` | P2-22 | `classifyBuilding()` 4종 분류 | `lib/tax-engine/property-object.ts` | P2-21 | 골프·오락 4% |
| `[x]` | P2-23 | `determinePropertyTaxObject()` 진입점 | `lib/tax-engine/property-object.ts` | P2-06, P2-11, P2-16, P2-18, P2-22 | 5단계 순서 |
| `[x]` | P2-24 | 통합 테스트 7건 | `__tests__/tax-engine/property-object.test.ts` | P2-23 | 전체 통과 |
| `[x]` | P2-25 | `property-tax.ts`와 연결 smoke test | `lib/tax-engine/property-tax.ts` | P2-23 | 828개 테스트 전부 통과 |

---

## Phase P3 — 종합합산과세대상 (comprehensive-aggregate-senior)

| 상태 | ID | 작업 | 파일 | 의존 | 완료 기준 |
| ---- | -- | ---- | ---- | ---- | --------- |
| `[x]` | P3-01 | `PROPERTY_CAL` 법령 상수 8개 | `lib/tax-engine/legal-codes.ts` | - | 문자열 리터럴 0건 |
| `[x]` | P3-02 | `PROPERTY_CONST` 수치 상수 확장 | `lib/tax-engine/legal-codes.ts` | P3-01 | 중복 없음 |
| `[x]` | P3-03 | `LandInfo`/`Input`/`Result` 타입 | `lib/tax-engine/property-tax-comprehensive-aggregate.ts` | P3-01 | tsc 통과 |
| `[x]` | P3-04 | `isSeparatedTaxation()` 판정 | `lib/tax-engine/property-tax-comprehensive-aggregate.ts` | P3-03 | 6경우 테스트 |
| `[x]` | P3-05 | `isSeparateAggregate()` 기준면적 분리 | `lib/tax-engine/property-tax-comprehensive-aggregate.ts` | P3-03 | 경계값 통과 |
| `[x]` | P3-06 | `classifyLandForComprehensive()` 3분 오케스트레이터 | `lib/tax-engine/property-tax-comprehensive-aggregate.ts` | P3-04, P3-05 | reason에 상수 참조 |
| `[x]` | P3-07 | `calculateComprehensiveAggregateTaxBase()` 인별 합산 | `lib/tax-engine/property-tax-comprehensive-aggregate.ts` | P3-06 | BigInt guard |
| `[x]` | P3-08 | `calculateComprehensiveAggregateTax()` 3단계 누진 | `lib/tax-engine/property-tax-comprehensive-aggregate.ts` | P3-07 | 경계값 정확 |
| `[x]` | P3-09 | `applyBurdenCap()` 150% 상한 | `lib/tax-engine/property-tax-comprehensive-aggregate.ts` | P3-08 | 미제공 시 생략 |
| `[x]` | P3-10 | `allocateByJurisdiction()` 지자체 안분 | `lib/tax-engine/property-tax-comprehensive-aggregate.ts` | P3-08 | 세율 재적용 금지 |
| `[x]` | P3-11 | `calculateComprehensiveAggregate()` 메인 엔트리 | `lib/tax-engine/property-tax-comprehensive-aggregate.ts` | P3-06~10 | 종부세 데이터 export |
| `[x]` | P3-12 | 테스트 20건 | `__tests__/tax-engine/property-comprehensive-aggregate.test.ts` | P3-11 | 전체 통과 |
| `[x]` | P3-13 | 기존 테스트 회귀 확인 | - | P3-01, P3-02 | 848개 통과 |

---

## Phase P4 — 별도합산과세대상 (separate-aggregate-senior)

| 상태 | ID | 작업 | 파일 | 의존 | 완료 기준 |
| ---- | -- | ---- | ---- | ---- | --------- |
| `[x]` | P4-01 | `PROPERTY_SEPARATE` 법령 상수 7개+ | `lib/tax-engine/legal-codes.ts` | - | 문자열 리터럴 0건 |
| `[x]` | P4-02 | `PROPERTY_SEPARATE_CONST` 수치 상수 | `lib/tax-engine/legal-codes.ts` | P4-01 | 배율 맵·세율 배열 |
| `[x]` | P4-03 | Zod 입력 스키마 + demolished 연계 검증 | `lib/validators/separate-aggregate-input.ts` | P4-01 | 유효/무효 각 5건 |
| `[x]` | P4-04 | `isSeparateAggregateLand()` 4단계 판정 | `lib/tax-engine/separate-aggregate-land.ts` | P4-02 | 테스트 10건 |
| `[x]` | P4-05 | `calculateBaseArea()` 용도지역 7종 배율 | `lib/tax-engine/separate-aggregate-land.ts` | P4-02 | 배율 정확도 100% |
| `[x]` | P4-06 | `splitByBaseArea()` 면적·가액 안분 | `lib/tax-engine/separate-aggregate-land.ts` | P4-05 | 정수 연산 오버플로 없음 |
| `[x]` | P4-07 | `calculateSeparateAggregateTax()` 누진 3구간 | `lib/tax-engine/separate-aggregate-land.ts` | P4-04~06 | applyRate/truncateToThousand |
| `[x]` | P4-08 | 누진세율 경계 테스트 10건 | `__tests__/tax-engine/separate-aggregate-land.test.ts` | P4-07 | 2억/10억 정확 |
| `[x]` | P4-09 | 용도지역 기준면적 테스트 7건 | `__tests__/tax-engine/separate-aggregate-land.test.ts` | P4-05, P4-06 | 7개 배율 |
| `[x]` | P4-10 | 철거 6개월 경계 테스트 3건 | `__tests__/tax-engine/separate-aggregate-land.test.ts` | P4-04 | 5/6/6+1 월 |
| `[x]` | P4-11 | 복수 토지 합산 테스트 | `__tests__/tax-engine/separate-aggregate-land.test.ts` | P4-07 | 누진 효과 |
| `[x]` | P4-12 | `property-tax.ts` separate 분기 연결 | `lib/tax-engine/property-tax.ts` | P4-07 | 초과분 종합합산 이관, 순환 import 없음 |
| `[x]` | P4-13 | DB fallback 경로 검증 | `lib/tax-engine/separate-aggregate-land.ts` | P4-07 | 상수 fallback 동작 |
| `[x]` | P4-14 | 분리·별도·종합 통합 테스트 3건 | `__tests__/tax-engine/separate-aggregate-land.test.ts` | P4-07 | reason 법령 상수 포함 |

---

## Phase P5 — 분리과세대상 (separate-senior)

| 상태 | ID | 작업 | 파일 | 의존 | 완료 기준 |
| ---- | -- | ---- | ---- | ---- | --------- |
| `[x]` | P5-01 | `PROPERTY.SEPARATE.*` 상수 10개 | `lib/tax-engine/legal-codes.ts` | - | const assert |
| `[x]` | P5-02 | `SeparateTaxationInput/Result/Category` 타입 | `lib/tax-engine/separate-taxation.ts` | P5-01 | 에이전트 정의 일치 |
| `[x]` | P5-03 | 저율(0.07%) 판정 3종 | `lib/tax-engine/separate-taxation.ts` | P5-02 | reasoning.legalBasis |
| `[x]` | P5-04 | 일반(0.2%) 판정 4종 | `lib/tax-engine/separate-taxation.ts` | P5-02 | 초과 warning |
| `[x]` | P5-05 | 중과(4%) 판정 + 대중제/간이 경고 | `lib/tax-engine/separate-taxation.ts` | P5-02 | 미입력 warning |
| `[x]` | P5-06 | `classifySeparateTaxation()` + excludedFrom | `lib/tax-engine/separate-taxation.ts` | P5-03~05 | 양방 배열 포함 |
| `[x]` | P5-07 | `calculateSeparateTaxationTax()` 70%·절사·단일세율 | `lib/tax-engine/separate-taxation.ts` | P5-06 | 오차 0원 |
| `[x]` | P5-08 | 종부세 배제 플래그 export + jsdoc | `lib/tax-engine/separate-taxation.ts` | P5-07 | comprehensive-tax import 가능 |
| `[x]` | P5-09 | `SeparateTaxationDetailCard` 컴포넌트 | `components/calc/SeparateTaxationDetailCard.tsx` | P5-07 | 스냅샷 테스트 |
| `[x]` | P5-10 | 저율 테스트 4건 | `__tests__/tax-engine/separate-taxation.test.ts` | P5-07 | legalBasis 정확 |
| `[x]` | P5-11 | 일반 테스트 3건 | `__tests__/tax-engine/separate-taxation.test.ts` | P5-10 | 공장 초과 warning |
| `[x]` | P5-12 | 중과 테스트 4건 | `__tests__/tax-engine/separate-taxation.test.ts` | P5-10 | 대중제 배제 warnings |
| `[x]` | P5-13 | 정밀도 테스트 3건 | `__tests__/tax-engine/separate-taxation.test.ts` | P5-11, P5-12 | BigInt 오버플로 없음 |
| `[x]` | P5-14 | 경계·배제관계 테스트 3건 | `__tests__/tax-engine/separate-taxation.test.ts` | P5-13 | 총 14건+ 통과 |
| `[x]` | P5-15 | `property-tax.ts` 분리과세 분기 연결 | `lib/tax-engine/property-tax.ts` | P5-08 | 단방향 import |

---

## 최종 검증 체크리스트

- [ ] `npm run lint` — 0 오류
- [ ] `npm run build` — 0 오류
- [ ] `npm test` — 기존 339개 + 신규 120건+ 전체 통과
- [ ] 엔진 레이어 코드 커버리지 100%
- [ ] `calculatePropertyTax()` 단방향 export 및 종부세 호환성 확인
- [ ] 법령 상수(PROPERTY.*, PROPERTY_CAL, PROPERTY_SEPARATE) 문자열 리터럴 직접 사용 0건
- [ ] gap-detector Match Rate ≥ 90%

---

## 작업 순서 제안

```
Week 1: P1-01~03, P2-01~05 (타입·법령상수·시딩 기반)
Week 2: P2-06~25 (과세대상 판정 모듈 전체)
Week 3: P3-01~13  ||  P4-01~14 (종합/별도합산 병렬)
Week 4: P5-01~15  +  P1-04~11 (분리과세 + 메인 엔진 계산 로직)
Week 5: P1-12~18 (API·UI·최종 검증)
```
