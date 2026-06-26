# 영농자녀 농지 증여세 감면(조특법 §71) — 농지 재차증여 — 엔진 설계

> 계획서: `docs/00-pm/gift-farmland-reduction-71-redonation.plan.md`
> 대상 엔진: 신규 `lib/tax-engine/gift-farmland-reduction.ts` + `gift-tax.ts` STEP 7.5 통합
> 예규: 재재산-1454(2022.11.22) · 법규재산-2314(2023.9.21)
> 범위: 정상 파이프라인 내 **산출세액 감면**(2-스트림 아님) + 감면농지가액 안분 + 9 anchor

## Context

조특법 §71 영농자녀 농지 증여세 감면은 **증여세 엔진 전체 미구현**(Explore 검증). §30의5/§30의6(창업자금·가업승계)과 달리 **분리과세가 아니라 정상 §47② 합산·§56 누진 파이프라인 내에서 산출세액을 감면**(5년 1억 한도)한다. 재차증여 시 ① 합산 산출세액에서 직전 농지분 산출세액을 뺀 **농지분 산출세액(㉣)** 을 안분 분모로, ② 5년 한도 잔여 내 **감면세액(㉤)** 을 산정, ③ **감면농지가액(감면범위 ㉮)/초과분(㉯)** 으로 분리한다. 기존 §47②·§53·§56·§58 기계는 이미 정확 — 신규는 감면 모듈 1개뿐.

---

## ★ 케이스 인벤토리 (필수 — 비어 있으면 Do 진입 금지)

> 입력 단위 원. 농지B 사례 = 재재산-1454 해설 표 ①②. (천원 → 원 환산, 813,066천원=813,066,000원)

| # | 시나리오 | 법령 근거 | anchor 출처 | 테스트 파일 | 상태 |
|---|---|---|---|---|---|
| FR-1 | 농지 재차증여(현금→농지A→농지B), 5년내 농지A 100%감면, 한도 잔여<농지분산출세액 | 조특법 §71②·§133②, 상증법 §47②·§58 | 재재산-1454 해설 ②: ㉤ 79,250천 / ㉮ 307,867천 / ㉯ 505,199천 / 차감 130,046천 | `farmland-reduction-71.test.ts` | ☐ TODO |
| FR-2 | 단일 농지 1회 증여(prior 감면농지 없음), 산출세액 ≤ 1억 | 조특법 §71① | (자체 산식) — 감면=산출세액 전액, 안분=농지가액 전액 | 동 | ☐ TODO |
| FR-3 | 5년 한도 완전 소진(기감면 ≥ 1억) | 조특법 §71② | 잔여 0 → 감면 0 + warning, 안분 0/전액 과세 | 동 | ☐ TODO |
| FR-4 | 회귀: 감면 토글 OFF(`isFarmlandGiftReduction` 미설정) | — | 기존 calcGiftTax 결과 **바이트 동일**(farmlandReductionDetail=undefined) | 동 | ☐ TODO |
| FR-5 (SCOPE_OUT) | 금번 증여 농지+비농지 혼합 | — | ㉣ 안분 필요 → Phase 2 | — | ⊘ |
| FR-6 (SCOPE_OUT) | 10년내 3회 증여 합산 | 상증법 §47② | FR-1의 ㉮·㉯ 출력이 입력 토대 → Phase 2 | — | ⊘ |

> **추가 SCOPE_OUT (계획서 §11 참조)**: 2필지 순위신청(조특령 §68⑧)·손자 세대생략가산 기준 감면(재산-2292)·5년내 양도/미경작 추징(§71 사후관리)·비농지 직전회차(R-3)·§58 한도 구속(R-9).

**규칙**: FR-1~FR-4 Phase 1 필수. FR-4(회귀) = 신규 필드 미입력 시 기존 동작 불변 보장.

---

## 법령 근거 (KoreanLaw MCP 본문 확정 대상 — 웹 1차 검증 완료)

```
조특법 §71①   : 자경농민등이 2028.12.31까지 영농자녀등에게 증여하는 농지등 가액의 증여세 100% 감면
조특법 §71②   : 감면받을 + 증여일 전 5년간 기감면 증여세액 합계가 1억원 초과 → 초과분 미감면
조특법 §133②  : 감면 종합한도 — (예규 법규재산-2314) 농지 감면세액이 한도 초과 시 전체 산출세액에서 감면한도액(1억) 공제
조특령 §68⑧   : 2필지 이상 동시증여 시 가액 높은 순 감면신청 의제 (Phase 1 SCOPE_OUT)
상증법 §47②   : 증여일 전 10년 이내 동일인 증여재산 합산
상증법 §58①   : 기납부세액공제 — min(가산증여재산 산출세액, 한도 ⑦×⑤_prior/⑤)
```

- 상수 (`legal-codes/inheritance-gift.ts` 신규, 리터럴 금지 — memory `feedback_legal_codes`):
  - `GIFT.FARMLAND_REDUCTION = "조특법 §71①"`
  - `GIFT.FARMLAND_REDUCTION_LIMIT = "조특법 §71② · §133②"`
  - `GIFT.FARMLAND_REDUCTION_ORDER = "조특령 §68⑧"`
- **Pre-Do KoreanLaw 검증**: §71②(1억·5년 본칙)·§133②(종합한도 연계)·조특령 §68⑧ 본문 위임체인 확정 후 상수 동결 (memory `feedback_korean_law_82_vs_81_2_drift`).
- **§133② 종합한도 SCOPE**: §133②는 타 조특법 감면과 **합산되는 종합한도**. Phase 1은 **§71② 5년 1억 단독 전제**(농지 감면 외 타 조특법 감면 없음). 타감면 합산 종합한도는 SCOPE_OUT.

---

## 엔진 input 타입

### (A) `EstateItem` 확장 (`inheritance-gift-estate.types.ts:48`, `:378` isSpecialTreatmentAsset 인접)

```ts
  /**
   * 조특법 §71 영농자녀 농지 증여세 감면 신청 대상 자산.
   * 토글 ON = 영농자녀·자경농민 요건 충족 의제(요건 자동판정 없음 — validation 안내).
   * §71 대상(농지·초지·산림지·축사)에 해당하는 AssetCategory에서만 UI 노출.
   * ⚠️ 게이팅 대상 AssetCategory 값은 Pre-Do grep 실측 후 확정 (memory enum-verification-before-mapping —
   *    real_estate_land/초지/산림지/축사 매핑은 추정 금지, 실제 enum 확인).
   */
  isFarmlandGiftReduction?: boolean;
```

### (B) `PriorGift` 확장 (`inheritance-prior-gift.types.ts`)

```ts
  /** 그 회차가 조특법 §71 농지 감면 적용 회차였는지 */
  farmlandReductionApplied?: boolean;
  /** 그 회차에 감면받은 증여세액(원) — 5년 1억 한도 누계용. farmlandReductionApplied=true 시 필수 */
  farmlandReductionAmount?: number;
```

> 직전 회차 산출세액 ㉠·과세표준 ⑤는 **기존 `PriorGift.computedTax`·`giftTaxBase` 재사용**(신규 아님).

### (C) 신규 모듈 입력 `FarmlandGiftReductionInput` (`gift-farmland-reduction.ts`)

```ts
export interface FarmlandGiftReductionInput {
  farmlandValue: number;          // 금번 감면농지 평가액 합계 = isFarmlandGiftReduction 자산 합
  aggregatedComputedTax: number;  // ㉡ 합산 산출세액 (gift-tax.ts computedTax)
  priorComputedTax: number;       // ㉠ 직전 회차 산출세액 = priorAggregation.totalComputedTax (full, 한도 없음)
  priorReductionWithin5Years: number; // 5년내 기감면 합계 = PriorGift 5년 필터 Σ farmlandReductionAmount
}

export const FARMLAND_GIFT_REDUCTION_LIMIT_5YR = 100_000_000; // §71② 1억
```

---

## 엔진 result 타입 (`GiftTaxResult.farmlandReductionDetail?` — optional, Record only)

```ts
  /** 조특법 §71 농지 감면 상세 (감면농지 미신청 시 undefined). Map 금지 — memory feedback_engine_result_map_json_loss */
  farmlandReductionDetail?: {
    farmlandValue: number;          // 금번 감면농지 평가액 합계
    farmlandComputedTax: number;    // ㉣ = ㉡ − ㉠ (한도 미적용, ≥0 가드) — 안분 분모
    reductionLimitRemaining: number;// max(0, 1억 − 5년기감면)
    reductionAmount: number;        // ㉤ = min(㉣, 잔여)
    reducedFarmlandValue: number;   // ㉮ 감면범위 = farmlandValue × ㉤/㉣
    excessFarmlandValue: number;    // ㉯ 초과분 = farmlandValue − ㉮ (일반 증여재산 합산과세)
    cumulative5yrReduction: number; // 5년기감면 + ㉤ (1억 도달 echo)
  } | null;
```

> finalTax는 `farmlandReductionDetail.reductionAmount`만큼 차감 반영(echo가 아닌 실제 산식 영향). 그 외 detail 필드는 표시·후속 합산용 echo.

---

## 계산 알고리즘 (단계별)

`calcGiftTax` 정상 경로에 **STEP 7.5** 삽입 (STEP 6 산출세액 후, STEP 8 세액공제 전):

```
STEP 7.5 (신규) — input.giftItems 중 isFarmlandGiftReduction=true 존재 시만 실행
  // 정상 경로엔 valuationMap 없음(2-스트림 전용) → valuationResults[idx] 인덱스 매핑
  farmlandValue = input.giftItems.reduce((s, item, idx) =>
    item.isFarmlandGiftReduction ? s + valuationResults[idx].valuatedAmount : s, 0)
  fr = calcFarmlandGiftReduction({
         farmlandValue,
         aggregatedComputedTax: computedTax,                          // ㉡ (STEP 6)
         priorComputedTax: priorAggregation.totalComputedTax,         // ㉠ (STEP 3, full)
         priorReductionWithin5Years: Σ_{prior in 5yr} farmlandReductionAmount,
       })
  farmlandReduction = fr.reductionAmount                              // ㉤

calcFarmlandGiftReduction 내부:
  ㉣ farmlandComputedTax    = max(0, aggregatedComputedTax − priorComputedTax)
  잔여 reductionLimitRemaining = max(0, 1억 − priorReductionWithin5Years)
  ㉤ reductionAmount        = min(㉣, 잔여)
  ㉮ reducedFarmlandValue   = ㉣ <= 0 ? 0 : safeMultiplyThenDivide(farmlandValue, ㉤, ㉣)   // BigInt
  ㉯ excessFarmlandValue    = farmlandValue − ㉮
  cumulative5yr            = priorReductionWithin5Years + ㉤
  warnings: 잔여===0 → "5년 1억 한도 소진 — 감면 0"; ㉣<=0 → "농지분 산출세액 0 — 안분 불가"

STEP 8 (변경) calcGiftTaxCredits(...) — param에 farmlandReductionAmount 추가
  inheritance-gift-tax-credit.ts:478 remainingTax 산정 후 :500 패턴으로
  remainingTax = max(0, remainingTax − farmlandReductionAmount)      // §69 base 감면 반영 (G-5)

STEP 9 (변경) finalTax = max(0, computedTax + surcharge − totalTaxCredit − farmlandReduction)
```

**이중차감 아님 (E7 검산)**: `farmlandReduction`은 ① §69 base(remainingTax)를 줄여 **filingCredit를 작게** 만들고, ② finalTax에서 **1회** 차감된다. finalTax 식에 1번만 등장 → 이중차감 없음.

FR-1 검산:
```
remainingTax(§69 base) = 230,046,000 − §58 20,750,800 − 0 − 감면 79,249,200 = 130,046,000
filingCredit(§69)      = 130,046,000 × 3% = 3,901,380
totalTaxCredit         = §58 20,750,800 + 0 + filingCredit 3,901,380 = 24,652,180
finalTax(결정세액 §69후) = 230,046,000 − 24,652,180 − 감면 79,249,200 = 126,144,620
차감세액(§69 전)        = 230,046,000 − 20,750,800 − 79,249,200 = 130,046,000  (해설 anchor)
```
> `farmlandReductionDetail`(result)는 모듈 반환 `FarmlandGiftReductionResult`(계획 §4) + orchestrator가 보유한 `farmlandValue`로 조립. breakdown·warnings는 모듈 → `allBreakdown`/`allWarnings` 병합(detail에 미포함).

**불변식 (FR-4 회귀)**: `giftItems`에 `isFarmlandGiftReduction=true` 자산이 없으면 STEP 7.5 미실행 → `farmlandReduction=0`, `farmlandReductionDetail=null`, `calcGiftTaxCredits`에 0 전달 → 기존 결과 **바이트 동일**.

### ㉣ vs §58 구분 (Critical — 동일시 금지)
- **㉣(안분 분모)** = `computedTax − priorComputedTax`(full ㉠, **한도 미적용**). 오직 ㉮ 안분.
- **§58 결정세액 공제**(`inheritance-gift-tax-credit.ts:437-438`) = `min(priorGiftComputedTax, limit58)`(**한도 적용**).
- FR-1: `limit58 = floor(230,046,000×153,754,000/966,820,000) = 36,580,9xx > 20,750,800` → 한도 비구속 → 둘 다 20,750,800. **한도 구속 케이스는 R-9(warning) — Phase 1 한도 비구속 전제**.
- **㉠ 가정**: `priorComputedTax = totalComputedTax`(가장 최근 합산 회차 ⑦)는 **직전 회차 = prior 감면농지** 전제(FR-1: 농지A). 비농지 직전 회차(예: 현금→농지A→현금→농지B)는 ㉣ 정의가 달라짐 → **SCOPE_OUT(R-3)**.

---

## Silent fallback / 자동 안분 후보 식별

- **자동 fallback 없음** (memory `feedback_no_silent_apportion_fallback`):
  - `farmlandReductionApplied=true` prior에 `farmlandReductionAmount` 미입력 → **validation 차단**(자동 0 금지).
  - `isFarmlandGiftReduction=true` 자산이 비대상 종류 → UI 토글 미노출(애초 진입 차단).
- **5/10 비대칭**: 한도 누계 = `subYears(giftDate, 5)` 필터, §47② 합산 = 10년. 5~10년 prior 감면농지는 합산(㉡·㉠)엔 포함되나 한도 누계 제외 — 자동 보정 없이 필터로만.
- **scoping 비대칭**: 한도 누계는 **수증자별**(§71② "수증자별", donor 무관 Σ farmlandReductionAmount), §47② 합산은 **동일인 그룹별**(donor). FR-1은 단일 donor(부친)라 무차이. 다중 donor는 누계만 donor 무관 합산.
- **prior 농지 행 필수필드 (⑧ validate)**: `farmlandReductionApplied=true` 시 `farmlandReductionAmount`(신규) + 기존 `computedTax`·`giftTaxBase` 3필드 필수 — 미입력 차단.
- useEffect→store 미러링 없음 — farmlandValue는 엔진 `evaluateAllEstateItems` 단일 진실(`single-source-engine-helper`).

---

## 테스트 약속 (계획서 §9·§10 = anchor 단일 진실)

- 엔진 단위 `farmland-reduction-71.test.ts`:
  - FR-1 anchor 9개: ⑤=966,820,000 / ㉡=230,046,000 / §58=20,750,800 / ㉣=209,295,200 / ㉤=79,249,200 / ㉮(probe) / ㉯(probe) / 차감(§69전)=130,046,000 / 결정세액(§69후, probe)
  - **자기일관**: ㉣−㉤ = ㉡−§58−㉤ = 130,046,000 / 누적감면 = 100,000,000 (memory `feedback_engine_result_display_drift`)
  - FR-2·FR-3 산식 anchor / FR-4 회귀(바이트 동일)
- PDF값 천원 → 원 환산, **천원 절사 ≤1,000원 tolerance**(memory `bigint-round-half-up`·`feedback_pdf_example_test_anchoring`).
- Pre-Do: FR-1 9 anchor 선작성 → 실패 캡처 → Design 환류 (memory `feedback_pre_anchor_verification`).
- 회귀: `__tests__/tax-engine/gift/` 기존 + 상속·양도 전체 0건.

---

## UI 통합 위임 (→ STEP 12 `gift-farmland-reduction-71.ui.design.md`)

- ⑤ 자산 카드(real_estate_land 등): "영농자녀 농지 감면(§71)" `ToggleCard` + prior 입력 행에 `farmlandReductionApplied` 토글·`farmlandReductionAmount`.
- ⑦ 신규 `FarmlandReductionCard.tsx`: ㉣㉤㉮㉯ + 누적 1억 도달 + 한국어 산식 + 펼침 토글.
- 8 동기화 지점은 UI 시니어 책임 — 엔진 시니어는 input/result 타입만 정의.

---

## 14 동기화 지점 매핑

| # | 지점 | 위치 (실측) | 작업 |
|---|---|---|---|
| ① 폼 | `isFarmlandGiftReduction`·prior 2필드 | `GiftTaxForm.tsx` state | 신규 |
| ② initial | 기본 undefined | 폼 팩토리 | 신규 |
| ③ normalize | 빈문자→undefined·숫자변환 | 폼 normalize | 신규 |
| ④ API 변환 | map 콜백 | `lib/calc/gift-api.ts:46`(giftItems)·`:95`(priorGifts) | 수정 |
| ⑤ UI 위젯 | 토글·prior 입력 | 자산 카드 | 신규 |
| ⑥ 사이드바 | finalTax(감면 반영) | gift summary | 점검 |
| ⑦ 결과 | `FarmlandReductionCard` | `components/calc/results/` | 신규 |
| ⑧ validate | 토글 ON 요건안내·prior 금액 필수 | `components/calc/gift-tax-form-validate.ts` | 수정 |
| ⑨ Zod enum 메인 | N/A (boolean·number) | — | — |
| ⑩ Zod enum 컴패니언 | N/A | — | — |
| ⑪ acquisitionDate fallback | N/A | — | — |
| ⑫ **Zod 입력객체** | `isFarmlandGiftReduction`·prior 2필드 | `lib/validators/estate-item-schema.ts`(baseItemSchema)·`prior-gift-schema.ts` | 수정 |
| ⑬ **body spread** | map 신규 필드 보존 | `lib/calc/gift-api.ts:46·95` | 수정 |
| ⑭ **Route 엔진 매핑** | giftItems·priorGiftsWithin10Years 보존 | `app/api/calc/gift/route.ts` | 수정 |

> ⑫⑬⑭ TypeScript silent strip → grep 자가점검 강제 (memory `feedback_api_zod_schema_sync`·`feedback_explicit_prop_mapping_strip`).
