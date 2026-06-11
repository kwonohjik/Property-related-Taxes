# 장기임대주택 감면 (조특법 §97 시리즈) — 엔진 설계

> **상태**: ✅ Do 완료 (2026-06-11) — 하단 "Do 환류" 참조
> **작성**: 2026-06-11

## Do 환류 (구현 중 확정·변경 사항 — 문서-구현 드리프트 0 유지)

**법령 게이트 확정 (KoreanLaw 2026-06-11)**:
- **R-5 확정**: 령 §97의3③ — ①5% 증액 제한 ②**국민주택규모 이하**(설계에 없던 요건 — `isNationalHousingScale` 입력 추가) ③10년 ④기준시가 합계 6억/수도권 밖 3억 (임대개시일 당시). 4요건 전부 evaluator 구현.
- **R-2 확정**: §97의5 **면적 요건 없음** — 설계의 `exclusiveAreaSqm` 제거 (케이스 #22 삭제).
- **F-1 확정**: §97의2① "양도소득세를 면제" = 세액 단계 100% (tax_amount).
- **R-1 미확정 유지**: 8년 50% 경과규정 미구현 — 10년 미달 시 불적용 사유에 "구법 경과규정은 부칙 확인 필요" 안내.
- **R-3 미확정 유지**: §97의4 추가율 표는 법 본문 내 표가 API 응답에서 누락 — 표 상수(`RENTAL_97_4_ADDITIONAL_RATE_TABLE`) + evaluator 구현하되 `isFullyImplemented=false` (UI 라디오 비활성·폼 미작성).
- 공실 6개월 간주 출처 확정: 령 §97의5①1호 (케이스 #25 ⚠️ 해소).

**산식 정밀화 (설계 대비 강화)**: 단순 override → **령 §97의3⑤·§97의5② 임대기간 분 양도차익 기준시가 안분** 구현 (`calcRentalGainRatio` — 취득 즉시 임대 시 ratio 1, 임대개시>취득 시 3점 기준시가 필수·미입력 자동 안분 금지). LTHD = 임대분×70% + 비임대분×일반율.

**구현 구조 deviation**:
- 평가 입력은 별도 라우터(`rental-97-router.ts`)가 reductions[] variant에서 조립 — `evaluateRental97Lthd`(STEP 4)·`evaluateRental97TaxAmount`(STEP 8) 2 진입점.
- 테스트는 조문별 6파일 대신 3파일 (`rental-97-shared-helpers` · `rental-97-evaluators`(단위 통합) · `rental-97-3-integration`(B-1)).
- 800줄 정책 연쇄 분할 5건: `transfer-tax-penalty-steps.ts`·`transfer-tax-reductions-calc.ts`(calcReductions 이동)·`types/transfer-reduction-input.types.ts`·`route-reductions-mapper.ts`(단건+다건 공용 — 다건 silent strip 사전 차단)·`transfer-tax-validate-reductions.ts`.
- UI 시한 카운터: `buildPeriodContext`에 낙관 fallback (`registrationDate: 입력값 ?? 취득일 ?? 양도일`) — `before(undefined)=false`로 §97의3 라디오가 영구 disabled 되는 통합 버그를 E2E에서 적발·수정. 구법(§97 본문·단서)은 취득일까지만 fallback (양도일 fallback 시 항상 시한 외 오탐).

> **상태(원본)**: Design (Do 미착수) · 2026-06-11
> **선행**: `docs/00-pm/transfer-rental-reduction.plan.md` (법령 검증·드리프트 D-1~D-9·결정사항 R-1~R-5·F-1·F-2)
> **검증 표기**: ✅ KoreanLaw 원문 검증 / ⚠️ 확인 필요 (R/F 번호 = 계획서 §7)

## Context

양도세 감면 23개 조문 확장(`transfer-reductions/` Phase 1 골격)의 장기임대 카테고리 6개 조문 본격 구현. 현행은 3경로 모순 상태 — UI 실경로는 §97의3을 산출세액×50%로 처리(법정 효과는 장특공제율 70% 특례 — 산식 범주 오류 D-4), 정밀 엔진(`rental-housing-reduction.ts`)은 UI 미배선 dead path + 조문 매핑 오류(D-1·D-2)·§133 한도 무근거 적용(D-3). 신규 라우터 중심으로 통합하고 레거시 순수 헬퍼만 이식한다.

---

## ★ 케이스 인벤토리 (행 1개 = anchor 테스트 ≥ 1개)

| # | 시나리오 | 법령 근거 | anchor 출처 | 테스트 파일 | 상태 |
|---|---|---|---|---|---|
| 1 | §97① 본문 — 1986~2000 신축 국민주택·2000.12.31 이전 임대개시·5년+ 임대 → 세액 50% | §97① 본문 ✅ | 법정 산식 직접 계산 | `rental-97-main.test.ts` | ☐ |
| 2 | §97① 단서(a) — 건설임대 5년+ → 100% 면제 | §97① 단서 ✅ | 동상 | `rental-97-main.test.ts` | ☐ |
| 3 | §97① 단서(b) — 매입임대 5년+ (1995.1.1 이후 취득·취득 시 미입주) → 100% | §97① 단서 ✅ | 동상 | `rental-97-main.test.ts` | ☐ |
| 4 | §97① 단서(c) — 10년+ 임대 → 100% | §97① 단서 ✅ | 동상 | `rental-97-main.test.ts` | ☐ |
| 5 | §97 — 임대개시 2001.1.1 → 시한 외 불적용 | §97① ✅ | period-check 기존 | `rental-97-main.test.ts` | ☐ |
| 6 | §97의2 1호 — 건설임대 1999.8.20~2001.12.31 신축·5년+ → 100% | §97의2①1호 ✅ | 법정 산식 (F-1 확정 후 단계 결정) | `rental-97-2.test.ts` | ☐ |
| 7 | §97의2 2호 — 매입임대 동기간 매매계약+계약금·5년+ → 100% | §97의2①2호 ✅ | 동상 | `rental-97-2.test.ts` | ☐ |
| 8 | §97의2 — 임대 4년 → 기간 미달 불적용 | §97의2① ✅ | 동상 | `rental-97-2.test.ts` | ☐ |
| 9 | §97의3 — 10년+ 임대·증액 5% 이내 → 장특공제율 70% (B-1: 산출세액 36,185,000) | §97의3① ✅ | 법정 산식 직접 계산 (plan §6 P2) | `rental-97-3.test.ts` | ☐ |
| 10 | §97의3 — 9년 임대 → 기간 미달 불적용 | §97의3①1호 ✅ | 동상 | `rental-97-3.test.ts` | ☐ |
| 11 | §97의3 — 임대료 증액 위반 신고 → 불적용 | §97의3①2호 ✅ | 동상 | `rental-97-3.test.ts` | ☐ |
| 12 | §97의3 — 2020.7.11 이후 단기→장기 변경 신고분 → 제외 | §97의3① 괄호 ✅ | 동상 | `rental-97-3.test.ts` | ☐ |
| 13 | §97의3 — 8년 경과규정 케이스 (⚠️ R-1 확정 후 행 확정/삭제) | §97의3 부칙 ⚠️ | R-1 | `rental-97-3.test.ts` | ☐ |
| 14 | §97의3 — 기준시가 한도 초과 (⚠️ R-5 확정 후 행 확정/삭제) | §97의3 령 ⚠️ | R-5 | `rental-97-3.test.ts` | ☐ |
| 15 | §97의4 — 6~7년 임대 → 장특 추가 2%p (⚠️ R-3 수치 확정 후) | §97의4 ⚠️ R-3 | 법정 표 직접 | `rental-97-4.test.ts` | ☐ |
| 16 | §97의4 — 10년+ → 추가 10%p·일반공제율과 합산 | §97의4 ⚠️ R-3 | 동상 | `rental-97-4.test.ts` | ☐ |
| 17 | §97의4 — 5년 임대 → 미달 불적용 | §97의4 ✅(6년 요건) | 동상 | `rental-97-4.test.ts` | ☐ |
| 18 | §97의4 — §95① 단서(미등기 양도) → 추가율 배제 | §97의4 단서 ✅ | 동상 | `rental-97-4.test.ts` | ☐ |
| 19 | §97의5 — 2018.10.1 취득·12.1 등록(3개월 내)·10년+ → 세액 100% (C-1: 5천만 전액) | §97의5① ✅ | plan §6 P3 | `rental-97-5.test.ts` | ☐ |
| 20 | §97의5 — 취득 후 3개월 초과 등록 → 불적용 (C-2) | §97의5①1호 ✅ | plan §6 P3 | `rental-97-5.test.ts` | ☐ |
| 21 | §97의5 — 9년 임대 → 미달 불적용 | §97의5①2호 ✅ | 법정 산식 | `rental-97-5.test.ts` | ☐ |
| 22 | §97의5 — 전용면적 요건 (⚠️ R-2 확정 후 행 확정/삭제) | §97의5 령 ⚠️ | R-2 | `rental-97-5.test.ts` | ☐ |
| 23 | 중복배제 — §97의3 선택 + §97의4 입력 동시 → UI 라디오 차단 (엔진은 §97의3② 사유 반환) | §97의3② ✅ | — | `rental-97-3.test.ts` | ☐ |
| 24 | 중복배제 — §97의5 세액감면 + §69 자경 동시 → candidates max 1건 (§127⑦) | §127⑦ ✅ | 기존 calcReductions 패턴 | `rental-97-5.test.ts` | ☐ |
| 25 | 유효임대기간 — 공실 149일 → 미차감 / 210일 → 차감 (A-1·A-2) | 조특령 §97⑤ 준용 ⚠️ 공실 180일 기준 출처 령 확인 | plan §6 P1 | `rental-97-shared-helpers.test.ts` | ☐ |
| 26 | 레거시 회귀 — 기존 `long_term_rental` 입력 이력은 P4 제거 전까지 동작 보존 | — | 기존 테스트 | 기존 `rental-housing-reduction.test.ts` | ☐ |
| 27 | 카테고리 간 동시 — §97의3(장특 STEP4) + §69 자경(세액 STEP7) 동시 입력 시 둘 다 적용됨을 확인하고 결과에 F-2 경고 echo (⚠️ F-2 확정 후 차단 전환 여부 결정) | §127⑦ 범위 ⚠️ F-2 | — | `rental-97-3.test.ts` | ☐ |

---

## 법령 근거 (`lib/tax-engine/legal-codes/transfer.ts` 상수 — 문자열 리터럴 금지)

기존 상수 사용 (실측: `legal-codes/transfer.ts:524-529`):
```
RENTAL_97_MAIN:    "조특법 §97 ① 본문"
RENTAL_97_PROVISO: "조특법 §97 ① 단서"
RENTAL_97_2:       "조특법 §97의2"
RENTAL_97_3:       "조특법 §97의3"
RENTAL_97_4:       "조특법 §97의4"
RENTAL_97_5:       "조특법 §97의5"
```
신규 상수 추가: `REDUCTION_OVERLAP_EXCLUSION: "조특법 §127⑦"` (기존 §127② 표기 정정 — D-7).

요건·효과 확정표는 plan §2.1 (✅/⚠️ 표기 그대로 따름).

---

## 엔진 input 타입

```ts
// transfer-reductions/types.ts 확장
export type Rental97ArticleId =
  | "rental_97_main" | "rental_97_proviso" | "rental_97_2"
  | "rental_97_3" | "rental_97_4" | "rental_97_5";

/**
 * 공통 평가 입력 — 기존 stub 패턴(types.ts:92 `ReductionEvaluationInput extends PeriodCheckContext`)을 따라
 * PeriodCheckContext를 extends. transferDate(필수)·acquisitionDate·contractDate·registrationDate·
 * rentalStartDate·usageApprovalDate(§97의2 1호 건설임대 fallback)는 ctx 키 그대로 사용 — 변환 매핑 불요.
 * 모든 Date는 라우트에서 date-coerce 적용 후 전달.
 */
export interface Rental97EvaluationInput extends PeriodCheckContext {
  id: Rental97ArticleId;
  // 임대 정보 (공통 — ctx 외 추가분)
  isTaxRegistered?: boolean;       // 세무서 사업자 등록
  vacancyPeriods?: { startDate: Date; endDate: Date }[];
  /** 간소화 모드 — 사용자 명시 신고 (true=위반 있음 → 불적용) */
  rentIncreaseViolated?: boolean;
  /** 정밀 모드 — 제공 시 validateRentIncrease로 검증 (간소화보다 우선) */
  rentHistory?: { contractDate: Date; monthlyRent: number; deposit: number; contractType: "jeonse" | "monthly" | "semi_jeonse" }[];
  // 조문 특화
  officialPriceAtStart?: number;   // ⚠️ R-5 확정 시 §97의3 검증에 사용
  propertyType?: "apartment" | "non_apartment";  // §97의3 2020.8.18 아파트 제한
  region?: "capital" | "non_capital";            // ⚠️ R-5 한도 분기
  rentalHousingType?: "public_support_private" | "long_term_private"; // §97의3·§97의5
  exclusiveAreaSqm?: number;       // ⚠️ R-2 — §97의5
  constructionYear?: number;       // §97 (1986~2000 신축 검증)
  isNationalHousing?: boolean;     // §97 국민주택 요건 (사용자 확인 입력 — 자동 판정 금지)
  provisoCase?: "a_construction" | "b_purchase" | "c_10years"; // §97 단서 분기
  /** §97의3 2020.7.11 이후 단기→장기 변경 신고분 제외 */
  isConvertedFromShortTerm?: boolean;
  // 계산 컨텍스트 (tax_amount 계열만)
  calculatedTax?: number;
}
```

## 엔진 result 타입

```ts
// effectCategory 멤버 추가: lib/tax-engine/legal-codes/transfer.ts:560 ReductionEffectCategory
//   + "long_term_holding_additional"
// metadata.ts:119 rental_97_4.effectCategory 정정: "long_term_holding_special" → "long_term_holding_additional"

export interface Rental97IneligibleReason { code: string; message: string; legalBasis: string; }

/** §97의3·§97의4 — 장특공제 단계(STEP 4) 반영 */
export interface RentalLthdEffect {
  effectCategory: "long_term_holding_special" | "long_term_holding_additional";
  overrideRate?: number;      // §97의3: 0.70 (R-1 확정 시 0.50 경과 분기 추가)
  additionalRate?: number;    // §97의4: 0.02~0.10 (R-3 확정 수치)
  eligibleRentalYears: number;
}

/** §97 본문/단서·§97의2·§97의5 — 산출세액 단계(STEP 7) 반영 */
export interface RentalTaxAmountEffect {
  effectCategory: "tax_amount";
  reductionRate: number;      // 0.5 | 1.0
  reductionAmount: number;    // applyRate(calculatedTax, rate) — Math.floor, §133 한도 미적용(✅ 비열거)
  isFullExemption: boolean;
}

export type Rental97Result =
  | ({ id: Rental97ArticleId; isEligible: true; legalBasis: string } & (RentalLthdEffect | RentalTaxAmountEffect))
  | { id: Rental97ArticleId; isEligible: false; ineligibleReasons: Rental97IneligibleReason[]; legalBasis: string;
      effectCategory: ReductionEffectCategory };
```

`TransferTaxResult` 확장: `rental97Detail?: Rental97Result` (echo-field 패턴 — 기존 `rentalReductionDetail`은 레거시 경로 결과로 P4 제거 전까지 병존, **Map 금지·Record/plain object만** — JSON 직렬화).

---

## 계산 알고리즘 (단계별)

**공통 골격 (조문별 evaluator — `evaluateRental97X(input)`)**:
1. `checkReductionPeriod(id, ctx)` — 시한 검증 (기존 `period-check.ts:38-74` 재사용)
2. 조문 요건 검증 — 등록·기간·유형·(R-2/R-5 확정 시) 면적·기준시가. 실패 시 `ineligibleReasons` 수집 (1건 발견 즉시 중단하지 않고 전부 수집 — UI 사유 표시)
3. 유효임대기간 = `calculateEffectiveRentalPeriod(rentalStartDate, transferDate, vacancyPeriods)` — 공실 180일+ 구간만 차감 (레거시 이식, ⚠️ 180일 기준의 령 출처 확인)
4. 임대료 검증 — `rentHistory` 제공 시 `validateRentIncrease`(전월세 환산 포함), 미제공 시 `rentIncreaseViolated` 신고값
5. 효과 산출:
   - §97의3: `overrideRate = 0.70` (R-1 확정 시 등록일 분기)
   - §97의4: `additionalRate = 표[유효임대연수구간]` (R-3 수치)
   - §97/§97의2/§97의5: `reductionAmount = applyRate(calculatedTax, rate)` — `Math.round` 금지

**파이프라인 통합 (transfer-tax 본체)**:
- STEP 4 (장특공제) 전: §97의3/§97의4 evaluator 실행 → `calcLongTermHoldingDeduction`(`transfer-tax-helpers.ts:450`)에 `rentalLthdEffect?` 매개변수 추가. 기존 L-1c 블록(`helpers.ts:519-533`)의 `rentalReductionDetails` 의존을 신규 evaluator 결과로 교체. §97의4는 `rateForYears`(`helpers.ts:540`) 반환값에 `Math.min(holdingRate + additionalRate, 법정상한)` 가산 — §95① 단서(미등기) 시 배제.
- STEP 7 (산출세액) 후: §97/§97의2/§97의5 evaluator 결과를 `calcReductions`(`transfer-tax-rate-calc.ts:460` 일대) candidates 배열에 push — 기존 §127⑦ max 패턴 합류. 기존 단순 경로(`rate-calc.ts:571`)는 R-4 시점까지 병존.

**중복배제**: §97의3↔§97의4↔§97의5는 UI 라디오 단일 선택으로 1차 차단 + 엔진에서 복수 입력 도달 시 §97의3②·§97의5② 사유로 후순위 항목 `isEligible:false`. 카테고리 간(F-2 미확정)은 v1 경고 표시만.

---

## Silent fallback / 자동 안분 후보 식별

| 필드 | 위험 | 정책 |
|---|---|---|
| `rentIncreaseViolated` 미선택 | 자동 "위반 없음" 처리 → 무근거 감면 | validate에서 명시 선택 강제 (3-state: 미선택=차단) |
| `registrationDate` 미입력 | acquisitionDate로 자동 대체 유혹 | fallback 금지 — 차단. §97의5 3개월 검증의 분모 |
| 공실 "있음" + 구간 미입력 | 빈 배열로 자동 통과 | 차단 (구간 ≥ 1 필수) |
| `officialPriceAtStart` | R-5 확정 전 자동 통과 | R-5 확정 전 optional + 결과에 "기준시가 요건 미검증" 경고 문구, 확정 후 required 전환 |
| 유효임대기간 | rentalStartDate 미입력 시 보유기간으로 대체 유혹 | fallback 금지 — 차단 |

---

## 테스트 약속

- 케이스 인벤토리 26행 전부 anchor. 수치 anchor는 **양도연도 §55·§95 법정 산식 직접 계산** (외부 자료 추종 금지). B-1 = 36,185,000원 (plan §6 P2 — 35% 구간·누진공제 15,440,000 검산 완료).
- ⚠️ 행(13·14·15·16·22·25)은 R-1·R-2·R-3 확정 전 `it.todo` 등록 — 확정 즉시 활성.
- 레거시 신구 비교: P2 완료 시 동일 입력(10년 임대) 구 산식(세액 50%) vs 신 산식(장특 70%) 결과 차이를 보고서에 수치 기재 (numeric 영향 공개).
- 회귀: `npm test` 전체 + `rental-housing-reduction.test.ts` 기존 26 케이스 P4 이관 전까지 유지.

---

## UI 통합 위임

- UI 명세: `transfer-rental-reduction.ui.design.md` (14개 동기화 지점 매핑 plan §5.6).
- 엔진 책임: `Rental97EvaluationInput`/`Rental97Result` 타입 + evaluator + 파이프라인 통합 + anchor.
- Zod: `lib/api/transfer-tax-schema-sub.ts:166` `reductionSchema` discriminatedUnion variant 추가는 엔진 시니어가 타입과 함께 선처리 (⑫ 침묵 strip 방지), Route 변환(`route.ts:199`) Date 변환 포함.
- **명명 통일 (E5)**: 등록일은 폼·Zod·Route·엔진 전 구간 **`registrationDate`** 단일 명명 (PeriodCheckContext 키와 일치 — `rentalRegistrationDate` 사용 금지).
