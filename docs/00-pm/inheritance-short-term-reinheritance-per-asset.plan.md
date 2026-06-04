# 단기 재상속세액공제 재산별 구분 계산 — 구현 계획서 (Plan)

> 작성 2026-06-04 · 세목: 상속세 · 조문: 상증법 §30 · 집행기준 30-22-1
> 인터뷰 반영: 재산별 구분 입력·표 완전 구현 / 1차·2차 상속개시일 → 공제율 구간 자동 도출 / 산출물 = Plan·Design까지
> 짝 문서: [`docs/02-design/features/inheritance-short-term-reinheritance.engine.design.md`](../02-design/features/inheritance-short-term-reinheritance.engine.design.md)

---

## 0. 요약 (TL;DR)

현재 단기재상속세액공제(§30)는 **단일 안분 분수**만 지원한다. 교재 사례(부친 2020.7.5 → 모친 2022.10.10)는
재상속 재산을 **비상장주식·토지1·토지2 각각 구분 계산**해 합산하는 표(집행기준 30-22-1 ②)를 요구하고,
공제율 구간은 **두 상속개시일로 자동 도출**(2년 3개월 → "3년 이내" → 80%)된다. 본 계획은:

1. 엔진을 **재상속분 재산 배열** 입력으로 확장(재산별 floor 계산 + 합산).
2. 공제율 구간을 **1차·2차 상속개시일 차이**로 자동 도출(`deriveShortTermReinheritBand`) — 현 수동 정수 입력 대체.
3. 결과뷰에 **재산별 공제세액 표**를 구조화 echo로 표시.
4. 교재 사례를 **원단위 실측 anchor**로 고정(floor 일관값 + 교재 round 값 Δ 문서화).

기존 단일 입력 경로는 **legacy fallback으로 보존**(하위호환·회귀 0).

---

## 1. Context / 동기

- 사용자 제공 교재(상속·증여세 2026, 제2권 상속세 p.461~469) 9개 이미지로 §30 단기재상속세액공제 사례 확인.
- 교재 사례는 **재산별 구분 계산 표**(③ 재산별 단기 재상속에 대한 세액공제 합계표)를 핵심으로 제시.
- 현 구현은 단일 분수(재상속분 합계 ÷ 전의 상속재산가액)만 지원 → 재산별 표 미표시, 공제율 구간 수동 입력.
- **충실도 vs 결과 분리** ([[feedback_numeric_impact_verify_before_bug_claim]]): 모든 재산의 공제율이 동일하면
  재산별 합 = 합계 결과라 **사례 총액 203,832,558은 현 단일 입력으로도 재현 가능**하다. 본 작업의 실질 가치는
  (a) 재산별 표 표시 (b) 재산별 비율≤1 제약 (c) 공제율 구간 자동 도출(오입력 방지) (d) 사례 anchor 고정.

---

## 2. 법령 근거 (KoreanLaw MCP 검증 완료 — 2026-06-04, mst=276123, 시행 20260102)

> 추정 인용 금지 정책([[feedback_korean_law_citation_verify]])에 따라 조문 전문 직접 조회로 확정.

**상증법 §30 (단기 재상속에 대한 세액공제)**

- **§30①**: 상속개시 후 **10년 이내**에 상속인·수유자의 사망으로 다시 상속이 개시되는 경우, 전(前)의 상속세가
  부과된 상속재산(§13 가산 증여재산 중 상속인·수유자가 받은 것 포함) 중 **재상속되는 상속재산에 대한 전의 상속세
  상당액**을 상속세 산출세액에서 공제.
- **§30② 1호 산식** (조문 원문):

  ```
                          전의 상속세 과세가액
  전의 상속세    재상속분의   ────────────────
  산출세액   ×   재산가액  ×  전의 상속재산가액
             ───────────────────────────────
                          전의 상속세 과세가액
  ```

  → 판례 약분(전의 과세가액 분모·분자 상쇄, 교재 p.466 ①):

  ```
  공제 기준액 = 전의 상속세 산출세액 × (재상속분의 재산가액 ÷ 전의 상속재산가액)
  ```

- **§30② 2호 공제율** (조문 표 — 1년당 10%p 체감):

  | 기간 | 1년 이내 | 2년 이내 | 3년 이내 | 4년 | 5년 | 6년 | 7년 | 8년 | 9년 | 10년 이내 |
  |---|---|---|---|---|---|---|---|---|---|---|
  | 공제율 | 100% | 90% | 80% | 70% | 60% | 50% | 40% | 30% | 20% | 10% |

- **§30③ 한도**: 공제액은 산출세액에서 **§28 증여세액공제 및 §29 외국납부세액을 차감한 금액을 한도**.
- **재상속분의 재산가액 = 전의(1차) 상속 당시 가액** (2002.12.18 개정 §30③, 교재 p.464~465). **2차 평가액 아님**.
  - 사례: 비상장주식 1차 1,300M / 2차 1,350M → §30 분자는 **1,300M** 사용.
  - 재상속분에는 §30① 본문에 따라 **§13 가산 증여재산 중 상속인·수유자가 받은 증여재산도 포함** 가능.
- **분모 "전의 상속재산가액" = 1차 상속의 총상속재산(채무공제 전)** — 사례 **4,300M**(과세가액 3,500M·채무공제후 상속재산 3,500M **아님**). 검토 #1-4.
- **전체 vs 개인 구분(검토 #1-5)**: 「전의 상속세 산출세액」(440M)·「전의 상속재산가액」(4,300M)은 1차 상속 **전체** 기준(특정 상속인 몫 아님). **재상속분**(2,490M)만 피상속인이 1차에서 받아 다시 상속되는 부분. 산식이 전체 산출세액을 재상속분 비율로 안분.
- **비율 ≤ 1 제약**(2019.12.31 삭제 → 집행기준 30-22-1 ③): 「재상속분 재산가액 × 전의과세가액/전의상속재산가액」이
  전의 과세가액 상당액을 초과 못함. 약분 후 = 재상속분 ≤ 전의 상속재산가액. 재산별로 적용.
- **재산별 구분 계산**(집행기준 30-22-1 ②): 전의 상속재산이 재상속재산에 포함된 경우 **재산별로 각각 구분**하여 계산.

법령 상수: `lib/tax-engine/legal-codes/inheritance-gift.ts:229` `TAX_CREDIT.SHORT_TERM_REINH = "상증법 §30"` (기존, 유지).

---

## 3. 현재 구현 현황 (실측 — file:line 직접 확인)

### 3-1. 엔진 (정확 — 산식 검증 완료)

`lib/tax-engine/credits/short-term-reinheritance.ts`
- `getShortTermReinheritRate(elapsedYears)` — 공제율 표 §30②2호 정확. `<=0 → 1.0`, `<=N → rate`, `>10 → 0`.
- `calcShortTermReinheritCredit(input)` — §30②1호 **약분 산식 정확**: `floor(priorTaxPaid × 분자/분모) × rate`,
  `currentComputedTax` 한도, `safeMultiplyThenDivide` BigInt 정밀, 분모0 fallback(전부재상속 분수=1).
- 입력 `shortTermReinheritAssetValue`(분자)·`shortTermReinheritPriorEstateValue`(분모) **단일 쌍만** 지원.

`lib/tax-engine/inheritance-gift-tax-credit.ts:249-270` (orchestrator step 3)
- §30 호출 후 `Math.min(creditAmount, remainingTax)` — §30③ 한도(§28·§29 차감 후 잔액) **사실상 적용됨**.

### 3-2. 14개 동기화 지점 (단일 모델 기준 전부 존재)

| # | 지점 | 위치 | 상태 |
|---|---|---|---|
| ① | 폼 상태 | `components/calc/inheritance/shared.ts:73-86` (string ×4) | ✅ |
| ② | initial | `shared.ts:137-140` | ✅ |
| ③ | normalize | (sessionStorage — string "" default) | ✅ |
| ④ | API 변환 | `InheritanceTaxForm.tsx:387-395` (parseInt/parseAmount) | ✅ |
| ⑤ | UI 위젯 | `inheritance/steps.tsx:599-677` | ✅ |
| ⑥ | 사이드바 | (결과 도착 후 산출 — 미표시, 적정) | ✅ N/A |
| ⑦ | 결과 카드 | `TaxCreditBreakdownCard.tsx:137-200` `buildSection30Formula` | ✅ (label-parse) |
| ⑧ | validation | `inheritance-validate.ts:327-349` (분자만/분모만/분자>분모 차단) | ✅ |
| ⑨ | Zod enum 메인 | `property-valuation-input.ts:685-690` | ✅ |
| ⑩ | Zod 컴패니언 | (증여세 §30 없음) | ✅ N/A |
| ⑪ | 자산-수준 acqDate | (N/A) | ✅ N/A |
| ⑫ | Zod 입력객체 | `inheritanceTaxCreditInputSchema` (4필드) | ✅ |
| ⑬ | body spread | `route.ts:84-85` (creditInput 명시 매핑) | ✅ |
| ⑭ | route 엔진 매핑 | `route.ts:84-85` | ✅ |

→ **현 단일 모델은 14지점 완비**. 본 작업은 재산별 배열 모델을 **추가**하면서 14지점을 재동기화한다.

### 3-3. 잠재 결함 (신규 설계에서 정정)

- **`tax-utils.ts:233` `calcShortTermReinheritYears`** = `differenceInYears`(버림). 사례 2.27년 → **2 반환 → 90%(오류, 80%여야 함)**.
  현재 **미사용**(주석 참조만, grep 확인) → 신규 banding 함수로 대체·정정. [[feedback_engine_comment_vs_impl_drift]]
- 현 UI는 사용자가 **공제율 구간 정수 직접 입력** → 2.27년을 "3"으로 수동 변환 필요(직관 반함, 오입력 위험).
- 결과뷰 §30 산식이 `breakdown` label 문자열 파싱 의존 → 재산별 표는 구조화 echo 필요.

---

## 4. Gap 분석 (현 → 목표)

| Gap | 현 상태 | 목표 | 영향 |
|---|---|---|---|
| G1 재산별 구분 계산 | 단일 분수 | 재상속분 **배열** + 재산별 floor + 합산 표 | 엔진 input·result·UI·결과뷰 |
| G2 공제율 구간 도출 | 수동 정수 입력 | 1차·2차 **상속개시일 차이 자동 banding** | 엔진/orch·UI·validate |
| G3 재산별 비율≤1 | 합계 분자>분모만 차단 | **재산별** priorValue ≤ 전의상속재산가액 | validate |
| G4 1차 당시 가액 안내 | hint 약함 | "1차 상속 당시 가액(2차 평가액 아님)" 명시 | UI hint |
| G5 사례 anchor | 합성 케이스만 | 교재 9장 사례 **원단위 anchor** | 테스트 |
| G6 결과 표 | label-parse 1줄 | 재산별 구조화 표 echo | result·결과뷰 |

---

## 5. 설계 결정 (인터뷰 2026-06-04 + 정책)

| # | 결정 | 선택 | 근거 |
|---|---|---|---|
| D1 | 재산별 범위 | **재산별 구분 입력·표 완전 구현** | 인터뷰 Q1 |
| D2 | 공제율 입력 | **1차·2차 상속개시일 → 구간 자동 도출** | 인터뷰 Q2. 2차 = `deathDate` 자동연동 |
| D3 | 산출물 | **Plan·Design까지** | 인터뷰 Q3. 구현은 승인 후 별도 |
| D4 | legacy 보존 | 단일 입력 경로 **fallback 유지** | 회귀 0, [[feedback_800line_split_export_preservation]] |
| D5 | floor vs round | **floor 일관 (권고)** — anchor=엔진 floor값, 교재 round값 Δ 문서화 | 프로젝트 정책(Math.round 금지) + [[feedback_anchor_correction_legal_priority]]. ※ 미결: §6-3 참조 |
| D6 | 입력 위치 | `creditInput`(InheritanceTaxCreditInput) 확장. estateItems와 **별개**(1차 당시 가액 = 다른 시점) | 사례 1차 1,300M ≠ 2차 1,350M |

---

## 6. 핵심 알고리즘

### 6-1. 공제율 구간 도출 `deriveShortTermReinheritBand(priorDeathDate, currentDeathDate)`

법령 "N년 이내" = 1차 상속개시일 + N년이 되는 날까지(경계 포함). 따라서 구간 = **올림(경계 시 하향)**:

```
fullYears   = differenceInYears(current, prior)   // date-fns 버림
anniversary = addYears(prior, fullYears)
band        = (current > anniversary) ? fullYears + 1 : fullYears
// band 0 (동일일·부부동시사망) → getShortTermReinheritRate(0)=100%
```

- 사례 검증: 2020.7.5 → 2022.10.10. fullYears=2, anniversary=2022.7.5, current(10.10) > 7.5 → **band=3 → 80%** ✅.
- 현 `differenceInYears`(버림) = 2 → 90%(오류)와 대비. **이 차이가 G2의 핵심**.
- 도출된 `band`를 기존 `getShortTermReinheritRate(band)`에 그대로 투입(공제율 표 함수는 변경 없음).
- legacy fallback: `priorDeathDate` 미입력 + `shortTermReinheritYears`(수동 정수) 있으면 그 값을 band로 사용.

### 6-2. 재산별 계산 (집행기준 30-22-1 ②)

```
rate = getShortTermReinheritRate(band)
for each asset_i in assets:
  base_i   = safeMultiplyThenDivide(priorComputedTax, asset_i.priorValue, priorEstateValue)  // floor
  credit_i = applyRate(base_i, rate)                                                          // floor(base × rate)
creditAmount = Σ credit_i
공제 적용 = min(creditAmount, §30③ 한도)   // 한도 = 산출세액 − §28 − §29 (orchestrator clamping)
```

- `assets` 미입력 → **legacy lump**: 단일 분자(`shortTermReinheritAssetValue`)·분모, 미입력 시 분수=1(전부재상속).
- 각 자산 `priorValue ≤ priorEstateValue` (재산별 비율≤1, G3).

### 6-3. floor vs round — 실측 확정 (Pre-Do anchor, 2026-06-04)

> `node` 실측(엔진 `safeMultiplyThenDivide`+`applyRate` 복제)으로 확정. 추정 아님.

| 자산 | 재상속분(1차) | base=floor(440M×분자/4,300M) | credit=floor(base×0.8) | 교재(round) | Δ |
|---|---|---|---|---|---|
| 비상장주식 | 1,300,000,000 | 133,023,255 | **106,418,604** | 106,418,605 | 1 |
| 토지1 | 700,000,000 | 71,627,906 | **57,302,324** | 57,302,325 | 1 |
| 토지2 | 490,000,000 | 50,139,534 | **40,111,627** | 40,111,628 | 1 |
| **재산별 floor 합** | 2,490,000,000 | | **203,832,555** | 203,832,558 | **3** |
| (참고) lump 단일분수 | | 254,790,697 | 203,832,557 | 203,832,558 | 1 |

- 원인: 재상속분/전상속재산 비율이 **무한소수**(1,300/4,300 = 0.302325…) → floor 후 ×0.8 floor가 교재 round half-up보다 자산당 1원 작음.
- **권고(D5)**: 엔진 **floor 일관** 유지 → anchor = **203,832,555**(재산별 합), 교재 203,832,558은 round 표기 Δ3로 문서화
  ([[feedback_anchor_correction_legal_priority]] · `bigint-round-half-up` 스킬: "PDF round 오기 판정·tolerance").
- **미결**: §30 세액공제(납세자 유리)에 round-half-up이 더 타당하다는 실무 견해도 있음. round 정확 재현을 원하면
  `bigint-round-half-up` 헬퍼로 자산별 round → 교재 203,832,558 정확 일치 가능(floor 원칙 예외 1건 도입). **Do 진입 시 사용자 확정**.

### 6-4. 2차 산출세액 검증 (사례 정합성)

`(2,670M − 510M) × 40% − 160M = 704,000,000` — 실측 **정확 일치**(교재 704백만). 단기재상속 외 파이프라인 영향 없음 확인.

---

## 7. 케이스 인벤토리 (요약 — 상세·anchor는 Design 문서)

| # | 시나리오 | 법령 | anchor | 상태 |
|---|---|---|---|---|
| R-1 | banding 경계: 정확히 N년(2년 이내=90%) vs N년+1일(3년 이내=80%) | §30②2호 | 자체 계산 | ☐ |
| R-2 | banding 사례: 2020.7.5→2022.10.10 = band 3 (80%) | §30②2호 | 교재 p.463 | ☐ |
| R-3 | banding 10년 초과 → 공제 0 | §30① | 자체 | ☐ |
| R-4 | banding 동일일(부부동시) → band 0 = 100% | 교재 ⑥ | 자체 | ☐ |
| R-5 | **재산별 3건 합산** (비상장1,300M·토지700M·토지490M, 80%) | §30②1호·집행 30-22-1② | 교재 p.468 **203,832,555**(floor) | ☐ |
| R-6 | 재산별 개별 credit (106,418,604 / 57,302,324 / 40,111,627) | §30②1호 | 교재 p.468~469 실측 | ☐ |
| R-7 | 재산별 비율≤1 위반 차단(priorValue > 전상속재산가액) | 집행 30-22-1③ | validate | ☐ |
| R-8 | legacy lump fallback (assets 미입력, 단일분수) — 회귀 | 하위호환 | 기존 C7~C7f | ☐ |
| R-9 | §30③ 한도: §28·§29 차감 후 잔액 클램핑 | §30③ | 자체 | ☐ |
| R-10 | 통합 end-to-end (1차/2차 가액 구분 검증) — 2차 estate 2,670M(2차가)+일괄공제5억+장례비10M → taxBase 2,160M → 산출 **704,000,000**; §30 assets 1차가(1,300/700/490)+priorDeath 2020-07-05 → 공제 **203,832,555** | 파이프라인 | 교재 p.468 | ☐ |

> 규칙: 행 1개 = anchor 테스트 1개 이상. R-5/R-6은 교재 사례, anchor는 **엔진 floor 실측값**(§6-3) 고정 + 교재 round값 주석.

---

## 8. 14개 동기화 지점 변경 명세

> 신규 필드 **2개만**: `shortTermReinheritPriorDeathDate`(1차 상속개시일·banding용), `shortTermReinheritAssets`(재상속분 배열).
> 전의 산출세액은 기존 **`shortTermReinheritTaxPaid` 재사용**(주석 "산출세액"으로 명확화 — 검토 #1-1, dual-truth 회피).
> 분모는 기존 `shortTermReinheritPriorEstateValue` 재사용. legacy `shortTermReinheritYears`·`...AssetValue`는 fallback 보존.
> 엔진 함수 `calcShortTermReinheritCredit` param명(`priorTaxPaid`·`elapsedYears`)은 **유지**(C7~C7f 회귀 0 — 검토 #1-2), `assets`만 추가.

| # | 지점 | 파일 | 변경 |
|---|---|---|---|
| ① | 폼 상태 | `inheritance/shared.ts` | `shortTermReinheritPriorDeathDate: string`, `shortTermReinheritAssets: {name;value:string}[]` 추가 |
| ② | initial | `shared.ts INITIAL_FORM` | `""`, `[]` |
| ③ | normalize | shared/migration | string·배열 default, sessionStorage 복원 호환 |
| ④ | API 변환 | `InheritanceTaxForm.tsx:382-397` | priorDeathDate 전달, assets parseAmount 매핑, legacy 필드 유지 |
| ⑤ | UI 위젯 | `inheritance/steps.tsx:599-677` | DateInput(1차 개시일) + 재상속 자산 반복 카드(추가/삭제) + 1차 당시 가액 hint(G4). **inheritance-gift-tax-ui-senior 담당** |
| ⑥ | 사이드바 | — | 결과 후 산출 — 미표시 유지 |
| ⑦ | 결과 카드 | `TaxCreditBreakdownCard.tsx:137-200` | **label-parser 폐지**(`:144 label === "이전 상속세 납부세액"` exact 결합 — 정정 시 깨짐, 검토 #1-3) → 구조화 `shortTermReinheritDetail.perAsset[]` 표 렌더 |
| ⑧ | validation | `inheritance-validate.ts:327-349` | 재산별 priorValue≤전상속재산가액(G3), priorDeathDate ≤ deathDate, assets·priorEstate 동반입력 |
| ⑨ | Zod 메인 | `property-valuation-input.ts:685-690` | `shortTermReinheritPriorDeathDate`: `z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()`; `shortTermReinheritAssets`: `z.array(z.object({name:z.string().optional(), priorValue:z.number().int().nonnegative()})).optional()` (검토 #3-8) |
| ⑫ | Zod 입력객체 | `inheritanceTaxCreditInputSchema` | 신규 필드 정의(누락 시 침묵 strip) |
| ⑬ | body spread | `route.ts:84-85` | creditInput 명시 매핑(이미 spread 전체) — 신규 필드 자동 포함 확인 |
| ⑭ | route 매핑 | `route.ts:84-85` | creditInput as 캐스팅 — Date 변환 불필요(string regex 유지) |

엔진측(타입·로직):
- `types/inheritance-tax-credit.types.ts` — `InheritanceTaxCreditInput` 확장 + `ShortTermReinheritAsset` 신규 + `TaxCreditResult.shortTermReinheritDetail?` 추가.
- `credits/short-term-reinheritance.ts` — `deriveShortTermReinheritBand` 추가, `calcShortTermReinheritCredit` 배열 지원(legacy 분기 보존), `ShortTermReinheritResult.perAsset[]`·`band` echo.
- `inheritance-gift-tax-credit.ts:249-270` — orchestrator가 `deathDate`로 banding + 배열 전달.

---

## 9. 작업 분해 (Phase — Do 단계 실행 시)

| Phase | 내용 | 산출 |
|---|---|---|
| **A** | 타입 확장 (input/result + ShortTermReinheritAsset) | `types/inheritance-tax-credit.types.ts` |
| **B** | `deriveShortTermReinheritBand` + 배열 엔진 (legacy 분기) | `credits/short-term-reinheritance.ts` |
| **C** | orchestrator banding·배열 전달 | `inheritance-gift-tax-credit.ts` |
| **D** | anchor 테스트 R-1~R-10 (Pre-Do 우선 §10) | `__tests__/.../tax-credit.test.ts` (+ 사례 통합) |
| **E** | Zod·validate·route (⑨⑫⑬⑭⑧) | `property-valuation-input.ts`·`inheritance-validate.ts` |
| **F** | UI (①②③④⑤) — **inheritance-gift-tax-ui-senior** | `shared.ts`·`steps.tsx`·`InheritanceTaxForm.tsx` |
| **G** | 결과뷰 재산별 표 (⑦) — UI senior | `TaxCreditBreakdownCard.tsx` |

> Plan 병렬 / Do 시퀀셜 (CLAUDE.md): 엔진 시니어 A~E 선처리 → UI 시니어 F·G. `tax-utils.ts:233` dead helper 제거/대체.

---

## 10. Pre-Do anchor 설계 ([[feedback_pre_anchor_verification]])

Do 진입 **전** 우선 작성·실행해 디자인 환류 기회 확보:

1. **R-2 banding 사례**: `deriveShortTermReinheritBand("2020-07-05","2022-10-10")` → `3` (현 `differenceInYears`=2 대비 실패로 정정 필요성 실증).
2. **R-5 재산별 합**: 배열 3건 → `creditAmount === 203_832_555` (floor 일관, §6-3). 미구현 시 실패 → 배열 모델 필요성 실증.

실패 메시지로 D5(floor/round) 확정 시점 판단.

---

## 11. 리스크 · 미결 사항

- **[미결] D5 floor vs round**: 권고 floor(203,832,555). round 정확 재현 원하면 §6-3 헬퍼. **Do 진입 시 1줄 확정**.
- **회귀**: legacy lump 경로(C7~C7f) 보존 필수. `npm test` 전체(공유 모듈 의존). [[feedback_per_tax_test_scripts]]
- **UI 800줄**: `steps.tsx` 재상속 자산 반복 카드 추가 시 분리 검토. [[feedback_pdca_session_efficiency]]
- **3중 패턴**: assets·priorEstate fallback은 UI display·API·validate 3층 동일([[mirror-pattern]]). useEffect store 미러링 금지.
- **enum/배열 strip**: ⑫⑬⑭ TS 미감지 → grep 자가점검([[feedback_explicit_prop_mapping_strip]]).

---

## 12. Definition of Done (Do 단계 완료 기준)

- [ ] 케이스 R-1~R-10 anchor 전부 GREEN (원단위 `toBe`, 교재 round Δ 주석)
- [ ] `deriveShortTermReinheritBand` 경계 테스트(정확 N년 vs N년+1일)
- [ ] legacy lump 회귀 0 (C7~C7f)
- [ ] 14지점 전부 (⑫⑬⑭ grep 자가점검)
- [ ] API fallback ↔ validation 동기화 (⑧)
- [ ] `npx tsc --noEmit` 0건 / `npm test` 전체 GREEN
- [ ] `tax-utils.ts:233` dead helper(`calcShortTermReinheritYears`) 제거 + `short-term-reinheritance.ts:51,69` 주석("정수, 버림"·폐기 헬퍼 참조) → band(올림) 정정 (검토 #3-10)
- [ ] 브라우저 E2E (`e2e/*.spec.ts`) — 1차 개시일·재상속 자산 입력 → 재산별 표 ([[feedback_browser_verify_with_playwright]])
- [ ] `ui-engine-sync-checker` + `bkit:gap-detector`
