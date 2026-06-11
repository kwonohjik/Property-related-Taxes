# P1 — §98의8 준공후미분양 50% + §99 신축주택(IMF 1차) 엔진 설계

> 선행: `docs/00-pm/transfer-remaining-10-reductions.plan.md` (마스터 플랜 §4 P1)
> 법령: 조특법 §98의8·§99 + 령 §98의7(=법 §98의8 위임 — 조번호 어긋남 주의)·령 §99 + 소령 §167의3①5호·§167의10①2호 (KoreanLaw 2026-06-11 원문)

## 0. 산출물

| 파일 | 작업 |
|---|---|
| `lib/tax-engine/transfer-reductions/income-deduction-router.ts` | 신규 — 차감형 공용 라우터 (§99의3 분기 일반화) |
| `lib/tax-engine/transfer-reductions/unsold-98-8.ts` | 신규 — §98의8 evaluator |
| `lib/tax-engine/transfer-reductions/new-99.ts` | 신규 — §99 evaluator |
| `lib/tax-engine/transfer-tax.ts` | :617-657 §99의3 분기 → 라우터 호출 1블록 교체 (797줄 → 여유 확보) + STEP 0.5 직전 배제 선판정 → STEP 0.5 결과 override |
| `lib/tax-engine/transfer-tax-finalize.ts` | 농특세 2-pass — new993FinalResult 경로를 detail 3종(993·99·988) fan-out으로 일반화 |
| `lib/tax-engine/transfer-reductions/new-99-3.ts` | (조건부 — D-11 실측 후) 모드 1 중과 배제 연동 정정 |
| `lib/tax-engine/types/transfer-reductions-stub.types.ts` | new_99·unsold_98_8 본 필드 |
| `lib/tax-engine/types/transfer.types.ts` | `new99Detail?`·`unsold988Detail?` echo |
| metadata.ts / period-check.ts / index.ts / 14지점 파이프라인 | isFullyImplemented·D-1' 점검·re-export·⑫⑬⑭ |

## 1. 케이스 인벤토리 (전수)

### §98의8 (`unsold_98_8`)

| # | 케이스 | 기대 |
|---|---|---|
| A-1 | 2015.6.1 계약·적격 전부 충족·임대 6년·5년 후 양도 | 5년 안분 × 50% 차감 + 농특세(감면 전후 차 × 20%) |
| A-2 | 동일·5년 **내** 양도 (취득일+5년 당일 포함) + **상속 합산으로 임대 5년 충족** (등록 후 기산 시 5년 내 양도와 임대 5년은 상속 합산 없이는 거의 배타적) | 양도소득금액 전액 × 50% 차감 |
| A-3 | 취득가 6억 초과 (601,000,000) | `PRICE_LIMIT_EXCEEDED` 불적격 |
| A-4 | 전용 135.01㎡ | `AREA_LIMIT_EXCEEDED` 불적격 (6억 이하여도 — **AND** 조건) |
| A-5 | 계약일 2014.12.31 / 2016.1.1 | `OUT_OF_CONTRACT_PERIOD` |
| A-6 | 임대 기산: 등록 2016.3.1·임대개시 2015.2.1 → 기산일 2016.3.1 (령 §98의5⑤1호) → 2021.2.1 양도 시 임대 59개월 | `RENTAL_PERIOD_SHORT` 불적격 |
| A-7 | A-6 + 피상속인 임대 24개월 합산 (령 §98의5⑤2호) | 적격 |
| A-8 | 준공후미분양 아님 (2014.12.31 이전 계약 체결 이력 토글 OFF) / 선착순 아님 | `NOT_UNSOLD_AFTER_COMPLETION` |
| A-9 | 최초 매매계약 아님 / 거주자 아님 | 각 불적격 코드 |
| A-10 | 계약 해제 후 본인·배우자 등 재계약 (령 §98의7②2·3호 토글) | `RECONTRACT_EXCLUDED` |
| A-11 | 양도일 ≤ 취득일 | `TRANSFER_BEFORE_ACQUISITION` (§99의4·§98의9 선례) |

### §99 (`new_99`)

| # | 케이스 | 기대 |
|---|---|---|
| B-1 | 주건업·계약 1998.9.1·5년 내 양도 | 양도소득금액 **전액** 차감 (령 §99①1호 본문) |
| B-2 | 동일·5년 후 양도·기준시가 (+,+) | 안분 차감 — 분자 = 5년시점 − 취득시 / 분모 = 양도시 − 취득시 (령 §99①2호, §99의3 동형) |
| B-3 | 부호 (−,+) / (+,−) / (−,−) | 0 / 전액 / 0 (§99의3 `calc5YearAllocation` 재사용 — 선례 부동산-136·525·재산2014-2035) |
| B-4 | 비국민주택·계약 1999.8.1 | `OUT_OF_ACQUISITION_PERIOD` (~1999.6.30) |
| B-5 | 국민주택·계약 1999.8.1 / 2000.1.1 | 적격 (~1999.12.31 연장) / 불적격 |
| B-6 | 자기건설·사용승인 1999.3.1 | 적격 (1호 — 사용승인 기준) |
| B-7 | 고가주택 (양도가 12.5억, 2021.12.8 이후 기준) | `HIGH_VALUE_HOUSE` 단서 배제 (D-9: §99의3 `isHighValueHouseUnder993` 재사용) |
| B-8 | 주건업 본인 / 매매계약일 입주사실 (2호 단서) | 각 배제 |
| B-9 | **재개발·재건축 변형**: `isRedevelopedNewHouse` ON + 종전주택 취득시 기준시가 — 5년 내 양도 | 안분 차감: 양도소득금액 × (양도시 − 신축취득시) / (양도시 − **종전취득시**) (령 §99①1호 단서) |
| B-10 | 변형 + 5년 후 양도 | 분자 = 5년시점 − 신축취득시 / 분모 = 양도시 − **종전취득시** (령 §99①2호 괄호) |
| B-11 | 변형 ON + 종전주택 기준시가 미입력 | 검증 오류 (자동 안분 fallback 금지) |
| B-12 | 1998.5.21 이전 분양계약 해제 후 재계약 (령 §99② 토글) | `RECONTRACT_EXCLUDED` |

### 라우터·중과 (공통)

| # | 케이스 | 기대 |
|---|---|---|
| C-1 | §99의3 기존 anchor 전건 | **무변화** (라우터 일반화 회귀 0 — P1 게이트) |
| C-2 | reductions에 unsold_98_8 + new_99 동시 (비정상 입력) | 라디오 UI상 불가하나 엔진은 첫 적격 1건 + 경고 (§127⑦) |
| C-3 | 다주택(3주택)·조정지역·§98의8 적격 | 중과 **미적용** (소령 §167의3①5호) + 기본세율·표 적용 |
| C-4 | C-3에서 §98의8 불적격 (가액 초과) | 중과 정상 적용 (배제는 eligible 시만) |
| C-5 | §99의3 적격 + 다주택 조정지역 (D-11 기구현 점검) | 중과 미적용으로 **정정** (현행이 중과 적용 시 — numeric 실측 후) |

## 2. 타입 설계

```ts
// transfer-reductions/types.ts 확장
export interface Unsold988EvaluationInput {
  transferDate: Date;
  acquisitionDate: Date;            // 미분양주택 취득일 (= 양도 자산 취득일, 모드 1)
  contractDate?: Date;              // 최초 매매계약일 (시한 판정 — 2015.1.1~12.31)
  acquisitionPrice?: number;        // 취득가액 (6억 한도, 부대비용 제외)
  exclusiveAreaSqm?: number;        // 전용(연)면적 (135 한도)
  rentalStartDate?: Date;           // 임대개시일 (등록 후 — 령 §98의5⑤1호 기산)
  rentalEndDate?: Date;             // 임대종료일 (미입력 = 양도일)
  inheritedRentalMonths?: number;   // 피상속인 임대기간 합산 (령 §98의5⑤2호)
  isResident: boolean;
  isUnsoldAfterCompletion: boolean; // 사용검사 후 2014.12.31까지 미계약 + 2015.1.1 이후 선착순
  isFirstContract: boolean;
  isRecontractExcluded: boolean;    // 령 §98의7②2·3호 해제 후 재계약
}
export interface New99EvaluationInput { /* §99의3 New993Input 동형 + */
  isNationalHousing: boolean;            // 국민주택 — 기간 ~1999.12.31 연장
  isRedevelopedNewHouse?: boolean;       // 령 §99①1호 단서 변형
  previousHouseStdPriceAtAcquisition?: number; // 종전주택 취득 당시 기준시가 (변형 분모)
  isRecontractExcluded?: boolean;        // 령 §99②
}
```

- result: `Unsold988Result`·`New99Result` — §99의3 `New993Result` 동형(`reducibleTransferIncome`·`fiveYearRatio`·`signCase`·`formulaSteps`·농특세 2필드) + `deductionRate` echo. **Record/원시 타입만** (Map 금지 — JSON 소실).
- **한계 (명시)**: §99 "연면적 2배 이내 부수토지" 한도 초과 토지 분리는 §99의3 기구현과 동일하게 미지원 — 주택+한도 내 부수토지 전체 입력 전제, 폼 hint로 안내.
- `IneligibleCode` union에 신규 코드 추가 — `RENTAL_PERIOD_SHORT`·`NOT_UNSOLD_AFTER_COMPLETION`·`RECONTRACT_EXCLUDED`·`PRICE_LIMIT_EXCEEDED`·`AREA_LIMIT_EXCEEDED`·`TRANSFER_BEFORE_ACQUISITION`.

## 3. 차감형 라우터 알고리즘

```
evaluateIncomeDeduction(reductions, ctx):
  1. find 대상 reduction (new_99_3 | new_99 | unsold_98_8) — 1건만 (§127⑦)
  2. evaluator 호출 → { isEligible, ineligibleReasons }
  3. eligible 시 차감액 산출:
     base = isWithin5Years
              ? (변형? allocate(양도시, 신축취득시 / 종전취득시) : transferIncome 전액)
              : allocate(5년시점, 신축취득시 / 분모기준시가)     // calc5YearAllocation 재사용
     reducible = applyRate(base, deductionRate)               // §98의8 0.5 / §99·§99의3 1
     단서: min(reducible, transferIncome) — "초과금액 없는 것"
  4. 농특세: finalize 2-pass (기존 new993FinalResult 경로 일반화 — detail 필드 3종)
```

- `PARAMS: Record<id, { deductionRate, allowRedevelopedVariant, evaluator }>` 정적 테이블.
- §99의3 경로는 파라미터 `{ deductionRate: 1, ... }` 로 무변경 통과 — **기존 input/result 타입·echo 필드명(`new993Detail`) 유지** (하위 호환).
- transfer-tax.ts 통합: 기존 :617-657 블록을 `const idResult = evaluateIncomeDeductionFromInput(effectiveInput, transferIncomeBefore);` + steps push로 교체. finalize 시그니처는 detail 3종 optional 추가.

## 4. 모드 1 중과 배제 (소령 §167의3①5호·§167의10①2호)

- **선판정 가능 근거**: evaluator 적격 판정은 날짜·가액·면적·토글만 사용 — 양도소득금액 불필요 → STEP 0.5(transfer-tax.ts:247) **이전**에 호출 가능.
- 구현: `resolveSurchargeExclusionByReduction(reductions, ctx): { excluded, articleBasis }` — 적격 시 `determineMultiHouseSurcharge` **호출은 유지**하되 결과를 배제로 override (`isSurcharged: false` + 배제 사유 echo — detail 소실 방지). steps에 "조특법 §98의8 감면주택 — 소령 §167의3①5호 중과 배제" 표기.
- 대상: new_99_3(D-11 정정 포함)·new_99·unsold_98_8. **§98의4는 비대상** (P4에서 params `surchargeExcluded: false`).
- D-11 처리: §99의3 기구현이 중과와 무연동임을 grep 확정 후, C-5 anchor로 numeric 영향 실측 → 같은 PR에서 정정 (memory `feedback_numeric_impact_verify_before_bug_claim` — 실측 전 심각도 단정 금지).

## 5. period-check (D-1' 점검)

- 모드 1: 양도 자산 = 감면주택 → 기존 `unsold_98_8`(계약 2015.1.1~12.31)·`new_99` 규칙의 컨텍스트(자산 contractDate·acquisitionDate)가 **그대로 정확** — D-1' 전환 불요. 단 `new_99` 규칙(:77-85)의 국민주택 1999.12.31 광역 통과는 유지(본 판정은 evaluator).
- evaluator가 시한 재검증 (이중 검증 — period-check는 라디오 사전 disabled용).

## 6. 검증 게이트

1. Pre-Do anchor: A-1 (5년 후 50% 차감 — §55 누진세율 직접 계산 원단위) 우선 실행 → 실패 확보 → 설계 환류.
2. §99의3 기존 anchor **전건 무변화** (라우터 회귀 0).
3. tsc 0 · transfer 전체 통과 · E2E 1 spec (그룹 펼침 → §98의8 라디오 → 폼 렌더 → hint 6억·135㎡).
4. 14지점 ⑫⑬⑭ grep 자가 점검. ⑧ validate: §98의8 계약일·취득가·면적·임대개시일 필수 / §99 재개발 변형 ON 시 종전주택 기준시가 필수 (B-11 — 자동 안분 fallback 금지).
5. period-check `new_99` 규칙(:82)의 usageApprovalDate — UI 컨텍스트 전달 여부 Do에서 확인.

## 6.5 Do 환류 (2026-06-11 — 구현이 설계와 다르게 간 결정)

1. **중과 배제 = `isTaxSpecialExemption` 자동 주입** — 설계 §4의 "결과 override" 대신,
   중과 엔진에 기존재하던 수동 토글 경로(`multi-house-surcharge-helpers.ts:689` —
   "조세특례제한법 특례 적용 주택")를 재사용해 STEP 0.5에서 양도 주택에 플래그를 자동 주입.
   중과 엔진 무변경 + detail 보존. D-11(§99의3 미연동)도 이 경로로 자동 해소 (C-5 anchor).
2. **시한 상수 UTC 파싱 통일** — 로컬 자정(`T00:00:00`)과 입력(UTC 파싱)의 시간대 불일치로
   A-5 경계(2015-12-31)가 오차단 → §98의9 선례(UTC, T suffix 없음)로 통일.
3. **period-check D-1' 완화 (설계 §5 변경)** — "모드 1은 기존 규칙 그대로 정확"은
   **일자 미입력 시 `within(undefined) = false`로 라디오가 잠기는 함정** (E2E "element is
   not enabled" 적발). §98의8·§99 규칙에 미입력 낙관 통과 추가. §98의8은 취득일 fallback
   금지 — 계약 2015·취득 2016 케이스를 취득일로 오차단하지 않도록 contractDate만 판정.
4. **api-helpers 800줄 분리** — toEngineReductions(245줄)를 `transfer-tax-api-reductions.ts`로
   추출, 외부 import 호환 re-export 보존 (helpers 571줄).
5. **결과 카드 공용화** — New99/Unsold988 result 구조 동형이라 카드 2종 대신
   `IncomeDeductionDetailCard` 1종 (kind prop 분기).
6. **LTHD 보유 만 N년 당일 경계** — 기존 엔진이 취득일+7년 당일 양도를 6년으로 절사 —
   통합 anchor 양도일을 +1개월 이동해 7년 확정 (기존 엔진 정책 무변경).
