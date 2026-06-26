# 영농자녀 농지 증여세 감면(조특법 §71) — 농지 재차증여 감면세액 계산 구현 계획서

> 출처: 첨부 해설서 「(4) 증여세 감면신청 방법」 — 🔍 농지를 재차 증여한 경우 감면세액 등 계산방법
> 예규: **재재산-1454, 2022.11.22.** · **법규재산-2314, 2023.9.21.** (재차증여 계산방법) · 재산-2292, 2008.8.18.(손자 세대생략)
> 작성일: 2026-06-26
> 대상 화면: 증여세 마법사 (`components/calc/GiftTaxForm.tsx`)
> 엔진: `lib/tax-engine/gift-tax.ts` + 신규 `lib/tax-engine/gift-farmland-reduction.ts`
> 설계: `docs/02-design/features/gift-farmland-reduction-71.{engine,ui}.design.md` (13단계 셀프리뷰 완료)
> 상태: **§71 영농자녀 농지 증여세 감면 — 증여세 엔진 전체 미구현** (Explore 검증 완료. `self-farming-reduction.ts`는 양도세 자경농민 §69 계열로 별개)

---

## 0. 핵심 설계 판단 — §71은 "정상 파이프라인 내 산출세액 감면"

**§30의5/§30의6 특례(창업자금·가업승계)와 근본적으로 다르다.**

| 구분 | §30의5/§30의6 (기구현) | §71 영농자녀 농지 감면 (본 계획) |
|---|---|---|
| 과세 방식 | **분리과세** (2-스트림) | **정상 파이프라인** (단일 스트림) |
| 세율 | 10%/20% 단일정률 | §56 누진세율 그대로 |
| §47② 합산 | **배제**(특례 prior만 기간무관 합산) | **정상 적용**(10년 동일인 합산) |
| 증여공제 | 5억/10억 정액 | §53 직계존속 5천만 그대로 |
| 감면 성격 | 과세표준·세율 자체가 특례 | **산출세액에서 감면세액 차감** |
| 한도 | 과세가액 50/100/300억 등 | **5년간 감면세액 1억원**(§71②) |

→ **2-스트림(`calcGiftTaxTwoStream`)을 타지 않는다.** 정상 `calcGiftTax` 파이프라인에 **STEP 7.5 "농지 감면세액" 단계**를 추가하는 surgical 구조.

**기존 엔진이 이미 처리하는 부분(신규 작업 아님):**
- §47② 10년 동일인 합산 — `aggregatePriorGiftsForGift()` (`gift-prior-aggregation.ts:102`)
- §53 직계존속 5천만 공제 — `calcGiftDeductions()` (PDF 사례 1·2가 ⑤=①+③−④로 검증 완료)
- §56 누진세율 산출세액 — `calcInheritanceGiftTax()`
- §58 기납부세액공제(직전 회차 산출세액 차감) — `priorAggregation.totalComputedTax` (`gift-prior-aggregation.ts:150`)

**신규 작업 = 감면세액 계산 + 감면농지가액 안분 1개 모듈뿐.**

---

## 1. §56 누진세율표 (검증 기준)

| 과세표준 | 세율 | 누진공제 |
|---|---|---|
| 1억원 이하 | 10% | 0 |
| 1억~5억 | 20% | 10,000,000 |
| 5억~10억 | 30% | 60,000,000 |
| 10억~30억 | 40% | 160,000,000 |
| 30억 초과 | 50% | 460,000,000 |

본 사례 농지B 합산 과세표준 966,820,000원 → 5억~10억 구간 → **30% − 60,000,000**.

---

## 2. 사례 요약 + 전 행 anchor 검증 (실측 완료)

### 2.1 증여 내역 (단위: 천원 → 엔진은 원)

| 증여일자 | 재산 | 증여재산가액 | 세부 |
|---|---|---:|---|
| 2015-01-19 | 현금 | 50,000 | 증여재산공제로 납부세액 없음 (prior, 일반) |
| 2019-05-03 | 농지(A) | 153,754 | **감면신청**, 산출세액 20,750 (prior, 감면농지) |
| 2021-04-19 | 농지(B) | 813,066 | **감면신청** — **금번 계산 대상** |

- 신청인·부친 모두 §71 '영농자녀등'·'자경농민등' 요건 충족 전제.
- 부친 단일 증여자 → §47② 동일인 그룹 A. **현금·농지A·농지B 모두 10년 내 동일인** → 합산.

### 2.2 PDF 해설 표 — 전 항목 실측 검증 (✅ = 본 계획 단계에서 산식으로 확인)

| 해설 기호 | 항목 | 천원 | 엔진(원) | 산식 검증 |
|---|---|---:|---:|---|
| — | 합산 과세표준 ⑤ | 966,820 | 966,820,000 | 현금50,000+농지A153,754+농지B813,066 − 증여공제50,000 ✅ |
| ㉡ | 농지B 합산 산출세액 | 230,046 | 230,046,000 | 966,820,000×30%−60,000,000 ✅ |
| ㉠ | 농지A 산출세액(직전 회차 ⑦) | 20,750 | 20,750,800 | (현금50,000+농지A153,754−공제50,000)=153,754,000×20%−10,000,000 ✅ |
| ㉣ | **B농지분 산출세액(순증)** | 209,296 | 209,295,200 | ㉡ − ㉠ = 230,046,000 − 20,750,800 ✅ (`priorAggregation.totalComputedTax` 재사용) |
| ㉤ | **B농지분 감면세액** | 79,250 | 79,249,200 | min(㉣ 209,295,200, 5년한도잔여 100,000,000−20,750,800=79,249,200) ✅ |
| ㉮ | **감면농지가액(감면범위)** | 307,867 | **307,865,780** | 813,066,000×79,249,200/209,295,200 (Do probe 확정, 해설 307,867천과 1,220원차·tolerance내) ✅ |
| ㉯ | **감면한도 초과분 농지가액** | 505,199 | **505,200,220** | 813,066,000 − ㉮ (Do probe 확정) ✅ |
| — | 농지B 차감세액(§69 전) | 130,046 | 130,046,000 | ㉡ − §58(20,750,800) − 감면(79,249,200) ✅ |
| — | 결정세액(§69 후) | — | **126,144,620** | ㉡ − totalCredit(24,652,180) − 감면(79,249,200), §69=3,901,380 (Do 확정) ✅ |

> **Do 결과**: anchor 13/13 통과. ㉮·㉯ 원-정확값은 해설 천원값과 ~1,200원 차(천원 표시 절사·tolerance 정책 §5). 2-스트림 경로(조특법 특례 동시선택)는 농지 감면 미적용(농지=일반자산 → 특례 불가, SCOPE_OUT). 800줄 초과 follow-up: inheritance-gift.types.ts(812)·gift-tax.ts(830)·GiftRowEditor(802)·GiftTaxResultView(801) — pre-existing 경계 + 필드 추가, 별도 분할 PR.

**자기일관성 교차검증**: 누적 감면 = 농지A 20,750,800 + 농지B 79,249,200 = **100,000,000 (5년 1억 한도 정확 도달)** ✅
→ 차감세액 = 230,046,000 − 100,000,000 = **130,046,000** (해설 ㉡행 차감세액 130,046과 일치) ✅

### 2.3 산식 정의 (엔진 구현 기준)

```
㉡ 합산산출세액   = §56누진(합산과세표준)                       [기존 엔진]
㉠ 직전회차산출세액 = priorAggregation.totalComputedTax           [기존 엔진]
㉣ 농지분산출세액  = ㉡ − ㉠          (한도 미적용 — full ㉠)      [신규, 안분 분모 전용]
한도잔여          = max(0, 100,000,000 − 5년내_기감면합계)        [신규]
㉤ 농지감면세액    = min(㉣, 한도잔여)                            [신규]
㉮ 감면농지가액    = 농지B가액 × ㉤ / ㉣        (㉣≤0이면 0)        [신규]
㉯ 초과분농지가액  = 농지B가액 − ㉮                               [신규]
결정세액(§69전)   = ㉡ − §58공제 − ㉤                            [기존§58 + 신규감면]
```

> **㉣ vs §58 구분 (Critical — 동일시 금지)**:
> - **㉣(안분 분모)** = `computedTax − priorGiftComputedTax` — **한도 미적용**, full ㉠. 오직 ㉮ 안분에만 사용.
> - **§58 결정세액 공제** = `min(priorGiftComputedTax, limit58)` (`inheritance-gift-tax-credit.ts:437-438`) — **한도 적용**.
> - 본 사례는 `limit58 = floor(230,046,000×153,754,000/966,820,000) = 36,580,9xx > priorGiftComputedTax 20,750,800` → **한도 비구속 → 둘 다 20,750,800으로 일치**. 한도 구속 edge case는 R-9.
>
> **㉣를 finalTax 차감에 사용하지 않음**(안분 분모 전용). finalTax 차감 = ㉤(감면세액) + 기존 §58.
> 이중차감 없음: §58은 직전 농지A분 제거, ㉤은 농지B 신규 감면. **자기일관성**: ㉣−㉤(209,295,200−79,249,200) = ㉡−§58−㉤(230,046,000−20,750,800−79,249,200) = **130,046,000** — DoD anchor.
> ※ 본 등식은 **농지A 차감세액=0(농지A 100% 감면, 산출세액 20,750,800 전액 감면)** 케이스 한정. 농지A 부분감면 시 일반화 금지.

---

## 3. 현행 엔진 상태와 갭

### 3.1 ✅ 재사용 (변경 불필요 — 실측 file:line)
- `gift-prior-aggregation.ts:102` `aggregatePriorGiftsForGift()` → `:150` `totalComputedTax = matched[0]?.computedTax`(㉠) 이미 노출.
- `gift-tax.ts:225` `calcInheritanceGiftTax(taxBase, brackets)` → ㉡.
- `gift-tax.ts:260` `calcGiftTaxCredits()` → §58 `inheritance-gift-tax-credit.ts:437-438` `min(priorGiftComputedTax, limit58)` 자동 차감. **실측: `limit58=floor(230,046,000×153,754,000/966,820,000)=36,580,9xx > 20,750,800` → 한도 비구속 → §58=20,750,800 전액**.
- `PriorGift.computedTax`·`giftTaxBase`(`inheritance-prior-gift.types.ts`) → 농지A ⑦·⑤ 입력 필드 **이미 존재** (신규 필드 아님).
- `safeMultiplyThenDivide`(`tax-utils.ts`, `gift-tax.ts:42` import) → ㉮ 안분 BigInt fallback.

### 3.2 ⚠️ 갭

| ID | 갭 | 해결 |
|---|---|---|
| **G-1** | 감면농지 식별 입력 부재 | `EstateItem.isFarmlandGiftReduction?: boolean` 추가 (`inheritance-gift-estate.types.ts:48` EstateItem, `:378` isSpecialTreatmentAsset 인접 지점). **토글은 §71 대상 자산종류(농지=`real_estate_land`·초지·산림지·축사)에서만 노출** — ⑤ 위젯·⑧ validation 게이트. 비대상 종류는 토글 미표시 |
| **G-2** | 5년 기감면 누계 입력 부재 | `PriorGift.farmlandReductionApplied?: boolean` + `farmlandReductionAmount?: number` 추가. 엔진이 **5년 필터**(`subYears(giftDate,5)`) 후 `farmlandReductionAmount` 합산. **5/10 비대칭**: 한도 누계=5년, §47② 합산=10년 → 5~10년 prior 감면농지는 합산엔 포함(㉡·㉠ 기여)되나 한도 누계 제외 |
| **G-3** | 감면세액 계산 엔진 부재 | 신규 `lib/tax-engine/gift-farmland-reduction.ts` `calcFarmlandGiftReduction()` |
| **G-4** | 결과 detail 부재 | `GiftTaxResult.farmlandReductionDetail?` (Record, **Map 금지** — memory `feedback_engine_result_map_json_loss`) |
| **G-5** | §69 신고세액공제 기준에 감면 미반영 | `calcGiftTaxCredits`(`inheritance-gift-tax-credit.ts:406`) param에 `farmlandReductionAmount` 추가 → `:478 remainingTax` 뒤에 `:500`(특례 `remainingTax -= specialTreatmentCredit`)과 **동일 패턴**으로 `remainingTax = max(0, remainingTax − farmlandReductionAmount)` → §69 base 반영 |
| **G-6** | finalTax에 감면 미차감 | `gift-tax.ts` STEP 9 finalTax 산식에 `− farmlandReduction` 추가 |
| **G-7** | legal-codes 상수 부재 | `legal-codes/inheritance-gift.ts`에 §71 계열 상수 3종 |

---

## 4. 신규 엔진 모듈 설계 — `gift-farmland-reduction.ts`

```ts
/** 조특법 §71 영농자녀 농지 증여세 감면 — 재차증여 감면세액·감면농지가액 안분 */
export interface FarmlandGiftReductionInput {
  /** 금번 감면농지 평가액 합계(원) = isFarmlandGiftReduction 자산 합 */
  farmlandValue: number;
  /** ㉡ 금번 합산 산출세액 (gift-tax.ts computedTax) */
  aggregatedComputedTax: number;
  /** ㉠ 직전 회차 산출세액 (priorAggregation.totalComputedTax) */
  priorComputedTax: number;
  /** 5년 내 기감면받은 증여세액 합계 (PriorGift 5년 필터 합산) */
  priorReductionWithin5Years: number;
}

export interface FarmlandGiftReductionResult {
  farmlandComputedTax: number;   // ㉣ = ㉡ − ㉠ (≥0 가드)
  reductionLimitRemaining: number; // max(0, 1억 − 5년기감면)
  reductionAmount: number;       // ㉤ = min(㉣, 잔여)
  reducedFarmlandValue: number;  // ㉮ 감면범위 = 농지가액×㉤/㉣
  excessFarmlandValue: number;   // ㉯ 초과분 = 농지가액 − ㉮
  cumulative5yrReduction: number; // 기감면 + ㉤ (1억 도달 echo)
  breakdown: CalculationStep[];
  warnings: string[];
}

export function calcFarmlandGiftReduction(
  input: FarmlandGiftReductionInput,
): FarmlandGiftReductionResult;
```

**정수 연산**: 안분 ㉮ = `safeMultiplyThenDivide(farmlandValue, reductionAmount, farmlandComputedTax)` (BigInt fallback). `applyRate` 미사용(분수 안분).
**가드**: `farmlandComputedTax <= 0` → 감면 0·안분 0 (음수/0 division 차단). `priorReductionWithin5Years >= 1억` → 잔여 0 → 감면 0 + warning.

**상수 한도**: `const FARMLAND_GIFT_REDUCTION_LIMIT_5YR = 100_000_000;`

---

## 5. 라운딩 정책 (KEY 의사결정 — Pre-Do 확정)

해설은 **천원 단위 표시**, 엔진은 **원 단위 정확 계산**. 농지A 산출세액 20,750,800원이 해설에서 20,750천원으로 절사 표시되어 ~800원 갭 발생:

| 값 | 해설(천원) | 엔진(원, 정확) |
|---|---:|---:|
| 5년 한도잔여 | 79,250 | **79,249,200** (=1억−20,750,800) |
| 감면세액 ㉤ | 79,250 | **79,249,200** |
| 감면범위 ㉮ | 307,867 | ≈307,866,7xx (천원 절사 = 307,866) |
| 초과분 ㉯ | 505,199 | ≈505,199,3xx (천원 절사 = 505,199) |

**결정**: 엔진은 **원 단위 정확값** 사용(5년 누계는 농지A 산출세액 20,750,800원 정확값 기준). anchor는 **Pre-Do probe로 캡처한 원 단위 정확값**을 canonical로 고정하고, 해설 천원값과는 **천원 표시 절사(≤1,000원) tolerance**로 교차검증. (memory `bigint-round-half-up`·`feedback_pdf_example_test_anchoring` — PDF 자체 round 일관성 오기 시 tolerance 적용 정책.)

---

## 6. 14개 동기화 지점 매트릭스

| # | 위치 (실측 경로) | 신규/변경 |
|---|---|---|
| ① | FormData (`components/calc/GiftTaxForm.tsx` state) | 자산 `isFarmlandGiftReduction`, prior `farmlandReductionApplied`·`farmlandReductionAmount` |
| ② | initial 팩토리 | 신규 필드 undefined |
| ③ | normalize | 빈문자→undefined, 숫자 변환 |
| ④ | API 변환 **`lib/calc/gift-api.ts`** (line 46 `giftItems.map`, line 95 `priorGifts.map`) | map 콜백에 신규 필드 (자동 fallback **금지** — memory `feedback_no_silent_apportion_fallback`) |
| ⑤ | UI 위젯 (자산 카드 + prior 입력) | 자산 카드 "영농자녀 농지 감면(§71)" 토글 + prior 행 감면 입력 |
| ⑥ | 사이드바 합계 | finalTax(감면 반영) |
| ⑦ | 결과 카드 (`components/calc/results/`) | 신규 `FarmlandReductionCard.tsx` (㉣㉤㉮㉯ + 누적 1억) |
| ⑧ | validation **`components/calc/gift-tax-form-validate.ts`** | 감면농지 토글 ON 시 영농요건 확인 + prior `farmlandReductionApplied` 행에 `farmlandReductionAmount`·`computedTax` 필수 (UI통과↔validate차단 모순 금지) |
| ⑨ | Zod enum 메인 | (해당 없음 — boolean·number) |
| ⑩ | Zod enum 컴패니언 | (해당 없음) |
| ⑪ | 자산-수준 acquisitionDate fallback | (해당 없음) |
| ⑫ | **Zod 입력 객체 정의** | `lib/validators/estate-item-schema.ts` baseItemSchema(`isSpecialTreatmentAsset` 인접)에 `isFarmlandGiftReduction` + `lib/validators/prior-gift-schema.ts`에 감면 2필드 |
| ⑬ | **API body spread** `lib/calc/gift-api.ts` | line 46·95 map에 신규 필드 보존 |
| ⑭ | **Route handler 엔진 input 매핑** `app/api/calc/gift/route.ts` | `giftItems`·`priorGiftsWithin10Years` 변환 시 신규 필드 보존 |

⑫⑬⑭는 TypeScript silent stripping → **grep 자가점검 강제** (memory `feedback_api_zod_schema_sync`·`feedback_explicit_prop_mapping_strip`).

**영농자녀·자경농민 요건(§71①) 입력 모델 (결정)**: per-asset `isFarmlandGiftReduction` 토글 ON = 사용자가 요건 충족을 의제 선언. 별도 global 요건 토글 **불필요**(MVP). ⑧ validation에 "영농자녀(만18세↑ 직계비속·농지소재지/직선20km 거주·증여전 3년 자경)·자경농민 요건 충족 시에만 신청" 안내 문구. 요건 미충족 자동판정은 SCOPE_OUT.

---

## 7. 법령 인용 (KoreanLaw MCP 검증 완료/대상)

| 조문 | 요지 | 검증 |
|---|---|---|
| 조특법 §71① | 자경농민→영농자녀 농지등 증여세 100% 감면 (~2028.12.31) | ✅ 웹 확인 |
| **조특법 §71②** | 감면받을 + **5년간** 기감면 증여세액 합계 **1억원** 초과분 미감면 | ✅ 웹 확인 (한도 본칙) |
| **조특법 §133②** | 감면 **종합한도** — 예규: 농지 감면세액이 §133② 한도 초과 시 전체 산출세액에서 감면한도액(1억) 공제 | ✅ 웹 확인 (해설 표 "(조특법 133②)" 인용처) |
| 조특령 §68⑧ | 2필지 이상 동시 증여 시 가액 높은 순 감면 신청 의제 | ⏳ Pre-Do KoreanLaw 본문 |
| 상증법 §47② | 10년 내 동일인 증여재산 합산 | ✅ 기구현 |
| 상증법 §58 | 기납부세액공제(직전 산출세액 한도 차감) | ✅ 기구현 |
| 재재산-1454(2022.11.22)·법규재산-2314(2023.9.21) | 재차증여 감면세액·감면농지가액 계산방법 | ✅ 웹 확인 (예규 실재) |

**legal-codes 상수** (`legal-codes/inheritance-gift.ts`, Pre-Do KoreanLaw 본문 확정 후):
```ts
GIFT.FARMLAND_REDUCTION        = "조특법 §71①";
GIFT.FARMLAND_REDUCTION_LIMIT  = "조특법 §71② · §133②";
GIFT.FARMLAND_REDUCTION_ORDER  = "조특령 §68⑧";
```
※ 문자열 리터럴 금지 (memory `feedback_legal_codes`). 추정 인용 금지 — 위임 체인 본칙까지 추적 (memory `feedback_korean_law_82_vs_81_2_drift`).

---

## 8. 위험 요소 / 의사결정

| ID | 항목 | 결정 |
|---|---|---|
| R-1 | `PriorGift.farmlandReductionAmount`/`computedTax` 미입력 fallback | **fallback 없음 + validation 차단**. 감면농지 prior 행에 필수 (memory `feedback_no_silent_apportion_fallback`) |
| R-2 | 금번 증여에 농지 + 비농지 자산 혼합 | **Phase 1 SCOPE_OUT** — 금번 증여 = 단일 감면농지(또는 감면농지 only) 전제. 혼합 시 ㉣ 안분 필요 → 후속 PR. 혼합 입력 시 warning |
| R-3 | 직전 회차가 감면농지가 아닌 일반 증여인 경우 ㉠ 정의 | `priorAggregation.totalComputedTax`(가장 최근 합산 회차 ⑦) 사용. 본 사례는 직전=농지A. 비농지 직전 회차 케이스는 §58 정합 검토 후 Phase 2 |
| R-4 | 5년 한도 누계 단위 | **원 단위 정확값**(농지A 20,750,800) — §5 라운딩 정책 |
| R-5 | 2필지 이상 순위신청(조특령 §68⑧) | **Phase 1 SCOPE_OUT** — 가액 높은 순 자동 의제는 후속. Phase 1은 단일 농지 |
| R-6 | "10년 이내 3회 증여"(해설 4항) | **Phase 1 SCOPE_OUT** — 본 계획은 2회차(재차증여)까지. ㉮·㉯ 안분 출력이 3회차 합산의 입력이 되므로 자연 확장 가능 |
| R-7 | 손자(직계비속 손자) 세대생략가산 기준 감면(재산-2292) | **Phase 1 SCOPE_OUT** — 부→자 직계 전제. 세대생략 농지감면은 후속 |
| R-8 | §69 신고세액공제 기준 | 산출세액합계 − §58 − **농지감면** − 외국납부 차감 후 ×3% (G-5). 음수 clamp |
| **R-9** | §58 한도 구속 시 ㉣(full ㉠) ↔ §58(한도 적용) 괴리 | 본 사례 한도 비구속(36.5M>20.75M)으로 일치. 한도 구속 케이스(`limit58 < priorGiftComputedTax`)는 예규의 full-㉠ 안분과 §58 결정세액이 달라짐 → **Phase 1은 한도 비구속 전제**, 구속 시 warning. §2.3 구분 참조 |
| **R-10** | 결과 헤드라인 — 차감세액(§69 전) vs 결정세액(§69 후) | 해설 anchor 130,046,000은 **§69 전 차감세액**. 엔진 결정세액은 §69 적용 후(126,144,620). anchor 2종 캡처(§69 전·후), 카드는 결정세액 헤드라인 + 차감세액 echo |
| **R-11** | 별지10호·본표 reconcile | 농지 감면세액이 finalTax를 줄이므로 별지10호/본표 산출→결정 흐름에 감면 반영 필요(자기일관 memory `feedback_engine_result_display_drift`). Pre-Do `gift-tax-filing-form-besshi10.ts` 구조 확인 → 전용행 매핑 OR breakdown+card reconcile. UI설계 U2 참조 |

---

## 9. 구현 범위 (Phase 분할)

### Phase A — Pre-Do anchor (먼저)
- `__tests__/tax-engine/gift/farmland-reduction-71.test.ts` 작성:
  - 농지B 회차 anchor 9개: ⑤=966,820,000 / ㉡=230,046,000 / §58=20,750,800 / ㉣=209,295,200 / ㉤=79,249,200 / ㉮(감면범위, probe) / ㉯(초과분, probe) / 차감세액(§69 전)=130,046,000 / **결정세액(§69 후, probe)**
  - **자기일관 anchor**: ㉣−㉤ = ㉡−§58−㉤ = 130,046,000 (agree). 누적감면(20,750,800+㉤)=100,000,000.
  - vitest 실행 → **실패 캡처** (감면 필드 미존재 → undefined). 실패 메시지로 Design 환류 (memory `feedback_pre_anchor_verification`).
  - **㉮·㉯·결정세액 정확 원값은 probe로 캡처**하여 canonical anchor 고정 (천원 절사 ≤1,000원 tolerance vs 해설).

### Phase B — 엔진 (시퀀셜, 엔진 시니어)
1. 타입 확장 (G-1·G-2·G-4): `EstateItem`·`PriorGift`·`GiftTaxResult`.
2. 신규 `gift-farmland-reduction.ts` `calcFarmlandGiftReduction()` (G-3).
3. `gift-tax.ts` STEP 7.5 통합 + STEP 9 finalTax 감면 차감 (G-6). orchestrator diff ≤ +30줄 목표.
4. `calcGiftTaxCredits` §69 base에 감면 전달 (G-5).
5. legal-codes 상수 (G-7) — KoreanLaw 본문 확정 후.
- **800줄 점검**: `gift-tax.ts` 실측 802줄(이미 800 정책 한계) → STEP 7.5 추가 시 초과 → 감면 로직은 신규 파일 `gift-farmland-reduction.ts`로 격리(orchestrator는 호출 1줄 + finalTax 산식 1줄).

### Phase C — UI (엔진 결과 받아, UI 시니어)
- 자산 카드 "영농자녀 농지 감면(§71)" `ToggleCard` (⑤). OFF도 tone 유지 (memory `feedback_toggle_card_visibility`).
- prior 행 감면 입력 (⑤·⑧).
- `FarmlandReductionCard.tsx` 결과 카드 (⑦) — ㉣㉤㉮㉯ + 누적 1억 + 한국어 산식 (memory `feedback_result_view_korean_formula`·`feedback_no_won_suffix`). 펼침 토글 `ExpandToggleButton` (memory `feedback_result_expand_toggle_standard`).
- 금액 칸 `font-mono tabular-nums` 우측정렬 (skill `amount-column-align`).

### Phase D — 검증
- `gift-tax-qa` → anchor 회귀 0건 + gift 기존 anchor 무회귀.
- `ui-engine-sync-checker` → 14지점 read-only.
- 브라우저 수동(Playwright E2E `e2e/*.spec.ts`): 현금·농지A prior + 농지B 입력 → 결과 카드 ㉤ 79,249,200·㉮·㉯ 일치 (memory `feedback_browser_verify_with_playwright`).

---

## 10. 완료 정의 (Definition of Done)

- [ ] Pre-Do anchor 9개 toBe 일치 (㉮·㉯·결정세액 probe 캡처값, 천원 절사 tolerance)
- [ ] 자기일관성: 누적감면(농지A 20,750,800 + 농지B ㉤) = 100,000,000 + ㉣−㉤ = ㉡−§58−㉤ = 130,046,000 (memory `feedback_engine_result_display_drift`)
- [ ] 회귀 0건 (`__tests__/tax-engine/gift/` 기존 + 상속·양도 전체)
- [ ] 14지점 grep 자가점검 0 누락 (⑫⑬⑭ 강조)
- [ ] `npx tsc --noEmit` 0 / `npx vitest run __tests__/tax-engine/gift/` 통과
- [ ] 800줄 정책 — `gift-tax.ts` 미초과 (감면 로직 신규 파일 격리)
- [ ] KoreanLaw MCP §71·§133②·조특령 §68⑧ 본문 검증 + legal-codes 상수 확정
- [ ] 브라우저(E2E) 사례 재현: ㉤ 79,249,200 / ㉮ 307,867천원 / ㉯ 505,199천원
- [ ] 결과 카드 "원" 표기 미사용 / fallback 0건
- [ ] 별지10호·본표 결정세액 ↔ finalTax reconcile 자기일관 (R-11)
- [ ] memory `project_gift_farmland_reduction_71.md` 작성

---

## 11. SCOPE_OUT (후속 PR 명시 — 침묵 누락 방지)

1. **금번 증여 농지+비농지 혼합** (R-2) — ㉣ 안분 필요.
2. **2필지 이상 순위신청** (조특령 §68⑧, R-5).
3. **10년 내 3회 증여 합산** (해설 4항, R-6) — 본 계획 ㉮·㉯ 출력이 입력 토대.
4. **손자 세대생략가산 기준 감면** (재산-2292, R-7).
5. **5년 내 양도·미경작 추징** (§71 사후관리) — 계산기 범위 외.
