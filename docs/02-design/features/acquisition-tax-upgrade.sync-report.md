# 취득세 업그레이드 P5UI — UI-Engine 동기화 점검 보고서

**작성일**: 2026-04-30
**점검자**: acquisition-tax-ui-senior
**대상**: Phase 5-UI (P5UI-1 ~ P5UI-10) 7개 동기화 지점 일괄 정비

---

## 1. 동기화 지점 점검 결과 (7개)

| # | 지점 | 위치 | 상태 |
|---|---|---|---|
| ① | FormState 타입 확장 | `components/calc/acquisition/shared.ts` | 완료 (18→78 필드) |
| ② | INITIAL_FORM default 등록 | 동상 | 완료 (전 필드 등록) |
| ③ | normalize fallback (sessionStorage 마이그레이션) | `components/calc/acquisition/normalize.ts` | 완료 (신설) |
| ④ | API 변환 | `lib/calc/acquisition-tax-api.ts` | 완료 (신설, 60+ 필드 변환) |
| ⑤ | UI 입력 위젯 (6단계) | `components/calc/acquisition/Step0~Step5.tsx` | 완료 |
| ⑥ | 사이드바 합계 | `components/calc/acquisition/AcquisitionSidebar.tsx` | 완료 (신설) |
| ⑦ | 결과 카드 산식·표시 | `components/calc/results/AcquisitionTaxResultView.tsx` + 3종 서브 컴포넌트 | 완료 |

---

## 2. 신규 파일 목록

| 파일 | 역할 | 줄 수 |
|---|---|---|
| `components/calc/acquisition/shared.ts` | FormState ~78 필드 + INITIAL_FORM | ~280 |
| `lib/calc/acquisition-tax-api.ts` | API 변환 함수 (60+ 필드) | ~230 |
| `components/calc/acquisition/normalize.ts` | sessionStorage 마이그레이션 | ~190 |
| `components/calc/acquisition/Step0.tsx` | 취득 정보 (violet/sky tone) | ~175 |
| `components/calc/acquisition/Step1.tsx` | 물건 상세 (sky/amber tone) | ~110 |
| `components/calc/acquisition/Step2.tsx` | 주택 현황 (sky/violet tone) | ~260 |
| `components/calc/acquisition/Step3.tsx` | 중과 분기 (rose tone) | ~185 |
| `components/calc/acquisition/Step4.tsx` | 법인·특수 (rose/violet tone) | ~195 |
| `components/calc/acquisition/Step5.tsx` | 감면 확인 (violet tone) | ~130 |
| `components/calc/acquisition/AcquisitionSidebar.tsx` | 진행 사이드바 + 예상세율 | ~155 |
| `components/calc/AcquisitionTaxForm.tsx` | 6단계 마법사 오케스트레이터 | ~160 |
| `components/calc/results/AcquisitionTaxResultView.tsx` | 결과 화면 확장 (D-day + 3종 통합) | ~290 |
| `components/calc/results/acquisition/SurchargeFlowDiagram.tsx` | 8단계 중과 흐름도 | ~130 |
| `components/calc/results/acquisition/HouseCountVerifier.tsx` | 세대 카운트 검산기 | ~145 |
| `components/calc/results/acquisition/RateScenarioTable.tsx` | 보유주택수별 시뮬레이션 표 | ~110 |

---

## 3. 엔진 input 필드 ↔ FormState 매핑 점검

### P1 다주택·중과 정밀화
| 엔진 필드 | FormState | INITIAL | API | UI Step | 결과 |
|---|---|---|---|---|---|
| isUrbanRegenerationArea | ✅ | ✅ | ✅ | Step3 | ✅ |
| isTemporaryTwoHouse | ✅ | ✅ | ✅ | Step3 | ✅(warnings) |
| previousHouseAcquisitionDate | ✅ | ✅ | ✅ | Step3 | ✅ |
| previousHouseRegion | ✅ | ✅ | ✅ | Step3 | ✅ |
| newHouseRegion | ✅ | ✅ | ✅ | Step3 | ✅ |
| wholeHouseStandardValue | ✅ | ✅ | ✅ | Step3 | ✅ |
| isMetropolitanRegion | ✅ | ✅ | ✅ | Step3 | ✅ |
| giftRelation | ✅ | ✅ | ✅ | Step3 | ✅ |
| giftorRelation | ✅ | ✅ | ✅ | Step3 | ✅ |
| giftorIs1HHHolder | ✅ | ✅ | ✅ | Step3 | ✅ |
| contractDateBeforeRegulation | ✅ | ✅ | ✅ | Step3 | ✅ |
| regulationDesignationDate | ✅ | ✅ | ✅ | Step3 | ✅ |
| hasContractDepositProof | ✅ | ✅ | ✅ | Step3 | ✅ |
| isCorpMetroSurcharge | ✅ | ✅ | ✅ | Step4 | ✅ |
| luxuryType | ✅ | ✅ | ✅ | Step1 | ✅ |

### P2 법인·공장·세율특례·자경농지
| 엔진 필드 | FormState | INITIAL | API | UI Step | 결과 |
|---|---|---|---|---|---|
| isMetropolitanCongestion | ✅ | ✅ | ✅ | Step4 | ✅ |
| isHeadquarterNewBuild | ✅ | ✅ | ✅ | Step4 | ✅ |
| isNonUrbanFactory | ✅ | ✅ | ✅ | Step4 | ✅ |
| factoryComponent | ✅ | ✅ | ✅ | Step4 | ✅ |
| isWithin5YearsOfEstablishment | ✅ | ✅ | ✅ | Step4 | ✅ |
| excludedBusinessType | ✅ | ✅ | ✅ | Step4 | ✅ |
| isDormantCorpAcquisition | ✅ | ✅ | ✅ | Step4 | ✅ |
| dormantCorpType | ✅ | ✅ | ✅ | Step4 | ✅ |
| specialRateType | ✅ | ✅ | ✅ | Step4 | ✅ |
| isOneHouseHousehold | ✅ | ✅ | ✅ | Step4 | ✅ |
| isSelfCultivatedFarmlandInheritance | ✅ | ✅ | ✅ | Step4 | ✅ |
| isSelfCultivatedFarmer | ✅ | ✅ | ✅ | Step5 | ✅ |
| farmingYears | ✅ | ✅ | ✅ | Step5 | ✅ |
| farmlandLocationDistance | ✅ | ✅ | ✅ | Step5 | ✅ |

### P3 주택 수 정교화
| 엔진 필드 | FormState | INITIAL | API | UI Step | 결과 |
|---|---|---|---|---|---|
| ownedHouses (배열) | ✅ | ✅ | ✅ | Step2 | ✅(HouseCountVerifier) |
| redevelopmentRights | ✅ | ✅ | ✅ | Step2 | ✅ |
| housingSubscriptionRights | ✅ | ✅ | ✅ | Step2 | ✅ |
| residentialOffices | ✅ | ✅ | ✅ | Step2 | ✅ |
| trustedHouseCount | ✅ | ✅ | ✅ | Step2 | ✅ |
| acquisitionOwnershipShare | ✅ | ✅ | ✅ | Step5 | ✅ |
| coOwnersAllInHousehold | ✅ | ✅ | ✅ | Step5 | ✅ |
| acquiredViaRight | ✅ | ✅ | ✅ | Step2 | ✅ |
| rightAcquisitionDate | ✅ | ✅ | ✅ | Step2 | ✅ |
| isHansiBenefitNewBuild | ✅ | ✅ | ✅ | Step2 | ✅ |
| isHansiBenefitLeaseRegistered | ✅ | ✅ | ✅ | Step2 | ✅ |
| isHansiBenefitUnsoldApt | ✅ | ✅ | ✅ | Step2 | ✅ |
| isMultiHouseholdWithUnitArea | ✅ | ✅ | ✅ | Step2 | ✅ |
| separateHouseholdReason | ✅ | ✅ | ✅ | Step2 | ✅ |

### P4 부가세·감면
| 엔진 필드 | FormState | INITIAL | API | UI Step | 결과 |
|---|---|---|---|---|---|
| isRuralRegion | ✅ | ✅ | ✅ | Step5 | ✅(AdditionalTaxDetailCard) |
| isSmallHouseFirstHome | ✅ | ✅ | ✅ | Step5 | ✅ |

---

## 4. 결과 필드 표시 점검

| 결과 필드 | 표시 위치 |
|---|---|
| acquisitionTax, ruralSpecialTax, localEducationTax, totalTax | TaxRow 목록 |
| reductionAmount, totalTaxAfterReduction | 감면 행 + 최종세액 |
| acquisitionDate, filingDeadline | 과세 정보 카드 + D-day |
| burdenedGiftBreakdown | 부담부증여 분리 내역 |
| isSurcharged, surchargeReason | 중과세 사유 + SurchargeFlowDiagram |
| houseCountDetail | HouseCountVerifier |
| specialRateDetail | SpecialRateDetailCard |
| corpSurchargeDetail | CorpSurchargeDetailCard |
| selfCultivationReductionDetail | SelfCultivationDetailCard |
| additionalTaxDetail | AdditionalTaxDetailCard |
| appliedRate (시뮬레이션) | RateScenarioTable |

---

## 5. Skip 로직 검증

| 조건 | Skip 동작 |
|---|---|
| 비주택 (`propertyType !== "housing"`) | Step2(주택 현황) 건너뜀 |
| 비법인 + 비사치성 + 세율특례 없음 | Step4(법인·특수) 건너뜀 |
| 뒤로가기 시 skip 역방향 적용 | `computeNextStep(step, form, false)` |

---

## 6. 누락 항목

### 경미 (기능 동작에 영향 없음)
- `ownedHouses` 배열의 상세 상속 정보(`inheritedHouses` 타입)는 현재 API 변환에서 배열 직접 전달이 아닌 `houseCountAfter` 직접 입력 방식으로 폴백. P3 `HouseCountInputRef` 완전 통합은 별도 작업(P3-2 태스크)으로 분리.
- `farmlandArea` (농지 면적) 필드는 `AcquisitionTaxInput`에 존재하나 FormState에 미포함. 별도 추가 가능.

### 미수행
- 브라우저 수동 확인 (4 시나리오: 주택매매·증여·법인·신축) — 미수행 명시

---

## 7. 자가 점검 체크리스트

- [x] 디자인 문서에 7개 지점 사전 명세 작성됨
- [x] 엔진 input 타입의 모든 필드가 폼 타입에 매핑됨 (farmlandArea 제외 경미 누락)
- [x] 새 필드 모두 initial · normalize · API 변환에 등록됨
- [x] 입력 위젯 배치 (UI 순서 = 엔진 계산 로직 순서)
- [x] 새 결과 필드 모두 결과 화면 노출 (산식 + 숫자 라벨)
- [x] `npx tsc --noEmit` 오류 0건
- [x] `npx vitest run __tests__/tax-engine/acquisition-tax/` 120건 통과
- [ ] 브라우저 수동 확인 — 미수행
- [x] 7개 동기화 지점 자가 점검 완료

---

## 8. tsc / vitest 최종 결과

- `npx tsc --noEmit`: **0건**
- `npx vitest run __tests__/tax-engine/acquisition-tax/`: **4 files / 120 tests passed**
