# 양도소득세 계산 엔진 TODO

> 계획서: `docs/01-plan/features/transfer-plan.md`
> 최종 업데이트: 2026-04-14

---

## 진행 상태 범례

| 기호 | 상태 |
| ---- | ---- |
| `[ ]` | 미시작 |
| `[~]` | 진행 중 |
| `[x]` | 완료 |

---

## Phase 0 — 사전 작업 (완료)

| 상태 | ID | 작업 | 파일 | 완료 기준 |
| ---- | -- | ---- | ---- | --------- |
| `[x]` | P0-1 | `calculateProgressiveTax` P0-1 부동소수점 검증 및 applyRate() 통일 | `lib/tax-engine/tax-utils.ts` | 기존 테스트 통과 |
| `[x]` | P0-2 | `applyRate()` 의무 사용 원칙 주석 문서화 | `lib/tax-engine/tax-utils.ts` | 코드 상단 주석 확인 |
| `[x]` | P0-3 | `isSurchargeSuspended()` 구현 및 테스트 7개 | `lib/tax-engine/tax-utils.ts` | T 테스트 통과 |
| `[x]` | P0-4 | `calculateProration()` 구현 및 테스트 5개 | `lib/tax-engine/tax-utils.ts` | T 테스트 통과 |
| `[x]` | P0-5 | `calculateHoldingPeriod()` 구현 및 테스트 5개 | `lib/tax-engine/tax-utils.ts` | 초일불산입 검증 통과 |
| `[x]` | P0-6 | `safeMultiplyThenDivide()` 구현 및 테스트 | `lib/tax-engine/tax-utils.ts` | 분모 0 방어 검증 |
| `[x]` | P0-7 | `calculateEstimatedAcquisitionPrice()` 구현 및 테스트 | `lib/tax-engine/tax-utils.ts` | 환산취득가 검증 통과 |
| `[x]` | P0-8 | DB 스키마 Migration 7개 적용 | `supabase/migrations/` | supabase migration list 확인 |
| `[x]` | P0-9 | 양도소득세 시딩 6건 | `scripts/seed-transfer-tax-rates.ts` | DB 조회 6건 확인 |

---

## Phase 1 — `lib/tax-engine/transfer-tax.ts` 구현

| 상태 | ID | 작업 | 핵심 로직 | 의존 | 완료 기준 |
| ---- | -- | ---- | --------- | ---- | --------- |
| `[x]` | **①** | 타입 정의 (`TransferTaxInput`, `TransferReduction`, `TransferTaxResult`, `CalculationStep`) | 1-A 표 19개 필드 | 없음 | `npx tsc --noEmit` 통과 |
| `[x]` | **②** | `parseRatesFromMap` — DB 세율 Map 파싱 (H-1) | 6종 규칙 추출, TaxRateNotFoundError throw | Zod 스키마, getRate | 누락 세율 시 에러 throw 확인 |
| `[x]` | **③** | `checkExemption` — 비과세 판단 (H-2) | E-1 1세대1주택 전액, E-2 부분과세, E-3 일시적2주택, E-4 2017.8.3 경과규정 | `calculateHoldingPeriod` | T-01, T-02 통과 |
| `[x]` | **④** | `calcTransferGain` — 양도차익 계산 (H-3) | 일반 취득가 / 환산취득가(개산공제 3%) 분기 | `calculateEstimatedAcquisitionPrice` | T-12, T-19 통과 |
| `[x]` | **⑤** | `calcOneHouseProration` — 12억 초과분 안분 (H-4) | `calculateProration(gain, transferPrice-12억, transferPrice)` | `calculateProration` | T-02 수치 정확성 검증 |
| `[x]` | **⑥** | `calcLongTermHoldingDeduction` — 장기보유공제 (H-5) | L-1 중과배제, L-2 미등기배제, L-3 1주택80%, L-4 일반30% | `isSurchargeSuspended`, `applyRate` | T-03, T-04, T-05, T-06, T-20 통과 |
| `[x]` | **⑦** | `calcBasicDeduction` — 기본공제 (H-6) | 연 250만 - 기사용분, 미등기 시 0, 잔여액 범위 내 적용 | 없음 | T-10, T-14, T-15 통과 |
| `[x]` | **⑧** | `calcTax` — 세액 결정 (H-7) | T-1 미등기 70%, T-2 비사업용+10%p, T-3 다주택+20%/30%p, T-4 일반누진 | `calculateProgressiveTax`, `isSurchargeSuspended`, `applyRate` | T-07, T-08, T-09, T-10, T-11, T-16, T-17 통과 |
| `[x]` | **⑨** | `calcReductions` — 감면 계산 (H-8) | R-1 자경1억한도, R-2 임대50%, R-3 신축50/100%, R-4 미분양100% | `applyRate` | T-13 통과 |
| `[x]` | **⑩** | `calculateTransferTax` — 메인 함수 (1-G) | STEP 0~11 순차 실행, steps 배열 누적, 조기 반환 처리 | ①~⑨ 전부 | T-18, T-21, T-22 통과, `tsc` 통과 |

---

## Phase 2 — `__tests__/tax-engine/transfer-tax.test.ts` 작성

| 상태 | ID | 테스트 ID | 시나리오 | 검증 항목 | 의존 |
| ---- | -- | --------- | -------- | --------- | ---- |
| `[x]` | **⑪-01** | T-01 | 1주택 비과세 (양도가 10억, 비조정) | `isExempt=true`, `totalTax=0` | ⑩ |
| `[x]` | **⑪-02** | T-02 | 1주택 부분과세 (양도가 15억) | `taxableGain` 정확, `totalTax>0` | ⑩ |
| `[x]` | **⑪-03** | T-03 | 1주택 공제 80% (10년 보유+거주) | `longTermHoldingRate=0.80` | ⑩ |
| `[x]` | **⑪-04** | T-04 | 1주택 보유율만 (거주 0개월, 5년) | `longTermHoldingRate=0.20` | ⑩ |
| `[x]` | **⑪-05** | T-05 | 일반 장기공제 (10년) | `longTermHoldingRate=0.20` | ⑩ |
| `[x]` | **⑪-06** | T-06 | 일반 장기공제 상한 30% (15년) | `longTermHoldingRate=0.30` | ⑩ |
| `[x]` | **⑪-07** | T-07 | 2주택 조정, 유예 중 (일반세율) | `isSurchargeSuspended=true` | ⑩ |
| `[x]` | **⑪-08** | T-08 | 2주택 조정, 유예 종료 (중과 20%p) | `surchargeType='multi_house_2'`, `surchargeRate=0.20` | ⑩ |
| `[x]` | **⑪-09** | T-09 | 3주택+ 조정, 유예 종료 (중과 30%p) | `surchargeType='multi_house_3plus'`, `surchargeRate=0.30` | ⑩ |
| `[x]` | **⑪-10** | T-10 | 미등기 70% 단일세율 | `appliedRate=0.70`, 공제 모두 0 | ⑩ |
| `[x]` | **⑪-11** | T-11 | 비사업용 토지 누진+10%p | `surchargeType='non_business_land'` | ⑩ |
| `[x]` | **⑪-12** | T-12 | 환산취득가 + 개산공제 3% | `usedEstimatedAcquisition=true`, gain 정확 | ⑩ |
| `[x]` | **⑪-13** | T-13 | 자경농지 감면 한도 1억 | `reductionAmount=100_000_000` | ⑩ |
| `[x]` | **⑪-14** | T-14 | 기본공제 잔여 50만원 | `basicDeduction=500_000` | ⑩ |
| `[x]` | **⑪-15** | T-15 | 기본공제 한도 초과 방어 | `basicDeduction=0` | ⑩ |
| `[x]` | **⑪-16** | T-16 | 누진세율 15% 구간 경계값 | `calculatedTax=6_240_000` | ⑩ |
| `[x]` | **⑪-17** | T-17 | 누진세율 45% 구간 경계값 | `calculatedTax` 정확 | ⑩ |
| `[x]` | **⑪-18** | T-18 | 지방소득세 = 결정세액 × 10% | `localIncomeTax` Math.floor 검증 | ⑩ |
| `[x]` | **⑪-19** | T-19 | 양도 손실 → 세액 0 | `transferGain=0`, `totalTax=0` | ⑩ |
| `[x]` | **⑪-20** | T-20 | 3년 미만 보유 → 공제 0% | `longTermHoldingDeduction=0` | ⑩ |
| `[x]` | **⑪-21** | T-21 | 과세표준 천원 미만 절사 | `taxBase` 절사값 검증 | ⑩ |
| `[x]` | **⑪-22** | T-22 | 비과세 시 steps 배열 | `steps[0].label='1세대1주택 비과세'` | ⑩ |

---

## Phase 3 — `app/api/calc/transfer/route.ts` 구현

| 상태 | ID | 작업 | 핵심 내용 | 의존 | 완료 기준 |
| ---- | -- | ---- | --------- | ---- | --------- |
| `[x]` | **⑫-1** | Zod 입력 스키마 정의 | 19개 필드 + V-1~V-3 superRefine 검증 | ⑩ | tsc 통과 |
| `[x]` | **⑫-2** | POST handler 구현 | 2-B 흐름 (파싱→검증→세율로드→계산→응답) | ⑫-1 | tsc 통과 |
| `[x]` | **⑫-3** | 에러 응답 처리 | 400/500 분기, TaxCalculationError 캐치 | ⑫-2 | 오류 케이스 응답 형식 확인 |
| `[x]` | **⑫-4** | curl 수동 테스트 | 정상 케이스 1건, 오류 케이스 2건 | ⑫-3 | 200/400/500 응답 확인 |

---

## 절사 체크리스트 (구현 시 확인)

| 체크 | 위치 | 함수 | 단위 |
| ---- | ---- | ---- | ---- |
| `[x]` | 과세표준 (STEP 6) | `truncateToThousand` | 천원 |
| `[x]` | 세율 곱셈 전체 | `applyRate` | 원 |
| `[x]` | 결정세액 (STEP 9) | `truncateToWon` | 원 미만 |
| `[x]` | 지방소득세 (STEP 10) | `applyRate(determinedTax, 0.10)` | 원 |
| `[x]` | 장기보유공제 금액 | `applyRate(taxableGain, rate)` | 원 |
| `[x]` | 12억 초과분 안분 | `calculateProration` | 원 |

---

## 전체 진행률

```
Phase 0 (사전작업):  ████████████████████  9/9   100%
Phase 1 (엔진구현):  ████████████████████ 10/10  100%
Phase 2 (테스트):    ████████████████████ 22/22  100%
Phase 3 (API Route): ████████████████████  4/4   100%
─────────────────────────────────────────────────────
전체:                ████████████████████ 45/45  100%
```
