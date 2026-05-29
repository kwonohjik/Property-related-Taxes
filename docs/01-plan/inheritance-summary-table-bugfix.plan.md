# 상속세 인별 과세가액 집계표 — 버그 수정 계획서

> 대상 화면: 상속세 결과뷰 「상속인별 상속세부담액 집계표」(이미지 = `buildSummaryTable` 산출 매트릭스)
> 데이터 소스: `lib/calc/heir-allocation-summary.ts` ← `result.summaryTable`(합계열) + `result.heirAllocationResult.perHeir`(인별열)
> 작성일: 2026-05-29 · 검토 정정: 2026-05-29 (v2)
> 검증 수준: **코드 경로 file:line 실측 검증**. 단, 자산별 금액 귀속(주식 100M가 어느 자산인지)은 입력 데이터 의존이므로 **AN-1 실측으로 확정**(추정 단정 금지 — 메커니즘만 단정).

---

## 0. 증상 (첨부 이미지 검산)

| 행 | 합계열 | 인별 합(직접 가산) | 일치? |
|---|--:|--:|---|
| 상속재산 — 금융 | 2,100,000,000 | 1,100,000,000+500,000,000+500,000,000 = 2,100,000,000 | ✓ |
| 상속재산 — 부동산 | 3,530,000,000 | 1,650,000,000+780,000,000+1,100,000,000 = 3,530,000,000 | ✓ |
| **상속재산 — 주식** | **550,000,000** | 150,000,000+500,000,000 = **650,000,000** | **✗ (−100,000,000)** |
| 상속재산 — 기타 | 400,000,000 | 400,000,000 | ✓ |
| ① 총상속재산 | 6,580,000,000 | 인별 grossInheritance 합 = 6,680,000,000 | ✗ (주식 버그 전파) |
| ② **사전증여재산** | **— (0)** | 0 (전 상속인) | **✗ (3건 입력했으나 미인식)** |
| ④ 상속세 과세가액 | **7,975,000,000** | Σ taxableValueShare = 5,797,000,000 | ✗ |

**④ 합계열 역산 정합 확인**:
`taxableEstateValue` = grossEstate(주식 550M 버그 포함) + 추정 350M + **사전증여 ~2,278M** − 채무 1,233M = **7,975M**.
→ 합계열 ④는 사전증여를 **포함**(2,278M)하나, ② 행과 인별 ④ 열은 사전증여를 **누락**.
두 버그가 독립적으로 ④ 합계열↔인별합 불일치(2,178M = 사전증여 2,278M − 주식 100M)를 만든다.

**두 버그 모두 수정 후 목표 정합값** (이미지 표시 총액에서 역산 — AN으로 실증):
- 주식 = **650,000,000** · ① = **6,680,000,000** · 사전증여(②) = **2,278,000,000** · ④ = **8,075,000,000** (= 합계열 = 인별합).

---

## 1. Bug #1 — 주식 합계 −100,000,000 (엔진 평가 경로 분기)

### 1.1 근원 (메커니즘 확정)

주식 평가액을 산출하는 경로가 **4곳**인데, **엔진 합계 경로만 명시 평가액(시가·감정가·기준시가)을 무시**한다.

| # | 경로 | 산식 | 명시 평가액 인정? | 의미론 |
|---|---|---|:--:|---|
| 1 | **엔진 grossEstate/categoryTotals** `evaluateStockAsPropertyResult` (`property-valuation.ts:390-409`) | `computeStockValuation(item)` **단독** | **✗** | csv only |
| 2 | validate `validateEstateItemAllocations` (`inheritance-validate.ts:56-65`) | `max(marketValue, standardPrice, appraisedValue, computeStockValuation)` | ✓ | **MAX** |
| 3 | UI 칩·협의분할 자동채움 `computeEffectiveValuation` (`estate-item-valuation.ts:23-40`) | `marketValue ?? appraisedValue ?? standardPrice ?? computeStockValuation` | ✓ | explicit-first (0 통과) |
| 4 | 문서상 §60 단일 진실 `resolveEstateItemValue` (`valuation/resolve-estate-item-value.ts:112-126`) | `marketValue>0 → appraisedValue>0 → standardPrice>0 → computeStockValuation` | ✓ | explicit-first (>0) |

- `computeStockValuation`(`resolve-estate-item-value.ts:52-101`)은 **오직** 상장 `listedStockShares×listedStockAvgPrice`(§63①1가) 또는 비상장 `unlistedStockData`/V2만 계산하고, 명시 `marketValue/appraisedValue/standardPrice`는 **전혀 보지 않는다**(없으면 `return 0`).
- `evaluateAllEstateItems`(`property-valuation.ts:369-381`)은 모든 listed/unlisted를 `evaluateStockAsPropertyResult`로 보내고, 이 함수는 `const amount = computeStockValuation(item)` 한 줄(`:391`)로 명시 평가액을 건너뛴다.
- 따라서 **명시 평가액 > computeStockValuation 인 주식 자산**이 합계열·`grossEstateValue`(`inheritance-tax.ts:83-84`)·`taxableEstateValue`에서 그 차액만큼 **누락**된다. 인별열(`heirAllocations.amount`)은 자동채움 기준이 #3(explicit-first)이라 정상.
- **자산별 100M 귀속은 AN-1로 실증** — 입력 데이터(어느 주식이 명시 시가로 입력됐는지)에 의존. (정정 v2: "주식 1건" 단정 → 메커니즘만 단정)
- **#1이 유일한 이상치**: validate·UI·문서상 단일 진실(#2·#3·#4) 셋 다 명시 평가액을 인정하므로, 인별열 650M이 정합값이고 합계열 550M이 버그.

### 1.2 법령 정합

상증법 §60②③: **시가 우선**(매매·감정·수용·공매 포함), 시가 곤란 시 §61~§66 보충평가. 명시 시가를 무시하는 #1이 법령 위반이며, #3·#4(explicit-first)가 §60 정합. → **#1을 §60 우선순위로 정정**.

### 1.3 수정안 — 단일 진실 위임 + **validate 동시 정합 (정정 v2: 범위 내 승격)**

**(1-A) 엔진 합계 경로**: `evaluateStockAsPropertyResult`(`property-valuation.ts:390-409`)가 `resolveEstateItemValue`(동일 모듈에서 이미 `computeStockValuation` import 중 — `:22`, 순환 없음)에 위임:

```ts
// AS-IS (:391)
const amount = computeStockValuation(item);
// TO-BE — §60 명시 평가액 우선 + 주식 보충평가 fallback (문서상 단일 진실 위임)
const amount = resolveEstateItemValue(item);
```

- **범위 격리**: V2 비상장은 `evaluateAllEstateItems`(`:373`)에서 `evaluateStockAsPropertyResult` 도달 **이전**에 별도 라우팅(`evaluateUnlistedStockV2AsPropertyResult`)되므로 본 수정은 **상장 + V1 간편 비상장**에만 영향. V2 무변경(AN-2).
- `breakdown` 라벨/`method`를 명시 평가액 분기에 맞춰 보정(시가→`market_value`/감정→`appraisal`/기준시가→`standard_price`). 결과 영향 0, echo 정확성.
- ① 총상속재산 합계행(`heir-allocation-summary.ts:184-189` = Σ categoryTotals)도 이 수정으로 **자동 정정**(6,580→6,680).

**(1-B) validate 정합 — ⚠️ 정정 v2: 동시 수정 필수 (역방향 회귀 차단)**:
1-A만 적용하면 **명시값 < computeStockValuation** 케이스에서 새 불일치가 생긴다. validate는 `max`(=csv, 큰 값)를 expected로 강제하므로 사용자는 allocation을 csv까지 채우는데(→ 인별열 = csv), 엔진(1-A 후 explicit-first)은 명시값(작은 값)을 쓴다 → **합계열 < 인별열** 역방향 갭.
→ `validateEstateItemAllocations`(`inheritance-validate.ts:56-65`)의 `max(...)` 도 `resolveEstateItemValue`에 위임하여 4경로를 **단일 함수(`resolveEstateItemValue`)로 통일**. (§66 담보권 하한은 §1.4 별도)
→ UI #3(`computeEffectiveValuation`, `??` 0-통과)도 #4(`>0`)와 미세 차이(명시값=0일 때) — 동일 위임으로 통일 검토. AN-1c가 가드.

### 1.4 잠재·범위 외 (확인 필요)

- §66 담보권 설정 재산 하한(MAX)은 `applyCollateralFloor`로 부동산·금융에만 적용되고 **주식 경로는 미적용**(`evaluateStockAsPropertyResult`·`resolveEstateItemValue` 모두 호출 안 함). 담보 설정 주식 케이스는 별도 latent — **본 PR 범위 외, 확인 필요**로 명시.
- **(정정 v3 — N2) 상장주식 명시값 vs §63①1가 2개월 평균 우선순위**: `resolveEstateItemValue`(explicit-first)는 상장주식에 명시 `marketValue`가 있으면 **2개월 평균(computeStockValuation)보다 우선**한다. 비상장은 §60② 시가 우선이라 정합이나, 상장은 §63①1가 2개월 평균이 법정 시가라 "명시값이 평균을 덮어쓰는" 동작이 §63 논리상 어색할 수 있음. 다만 (a) 4경로 통일 일관성 (b) 명시값만 있고 주식수 미입력 시 평균=0이라 명시값 사용이 유일 정답 (c) 둘 다 입력은 드묾 — 으로 본 PR은 explicit-first 통일 유지. **상장에서 명시값+주식수 동시 입력 시 어느 쪽 우선인지는 Design 케이스 표에 행 추가하여 명시 결정**(확인 필요).

---

## 2. Bug #2 — 사전증여재산 ② 행 0 (doneeId 미수집 + cutoff 미정합)

### 2.1 근원 (확정)

- 사전증여는 **세액 계산에는 정상 반영**: `taxableEstateValue`(`inheritance-tax.ts:207-210`)에 `priorGiftAggregated` 가산(doneeId 무관). result echo `priorGiftAggregated`(`types/inheritance-gift.types.ts:890`). `priorGiftAggregated`는 `aggregatePriorGiftsForInheritance(list, deathDate)`(`:196-200`)로 **§13 cutoff 적용**.
- 그러나 **인별 배부**는 doneeId가 필수: `sumPriorGiftsByDonee`(`inheritance-allocation.ts:190-191`)가 **`if (!gift.doneeId) continue;`** 로 doneeId 없는 증여를 전부 스킵 → 모든 상속인 `priorGiftAmount = 0`.
- ② 행 합계(`heir-allocation-summary.ts:217-229`)는 **인별 합** `Σ perHeirEngine[*].priorGiftAmount`를 쓴다 → 0 → `|| null` → "—".
- **doneeId(특정 Heir.id)는 영리법인 전용으로만 수집**: `CorporateGiftFields.tsx:68`에서만 set. 일반 행 편집기 `GiftRowEditor.tsx`에는 **`doneeRelation`(관계 select, `:168-187`)만 있고 `doneeId`(상속인 식별) 위젯 부재**(`heirs` prop은 CorporateGiftFields에만 전달, `:144`). `prior-gift-lookup.ts:318` 주석: *"doneeId: Heir.id 참조 필요 — 사용자가 별도 매핑 (Phase 2 후속에서 입력 UI 동반)"*.
  - **정정 v2**: 관계만으로는 동일 관계 상속인 복수(자녀 2명 등) 시 배부 대상 특정 불가 → **반드시 `doneeId`(Heir select) 신설**, doneeRelation 재활용 불가.

### 2.2 근원 — cutoff 미정합 (정정 v2: 신규 발견 Finding B)

- `calcHeirAllocation`에 넘기는 건 `input.preGiftsWithin10Years` **전체 목록**(`inheritance-tax.ts:533`)이고, `sumPriorGiftsByDonee`·`totalPriorGiftAmount`(`inheritance-allocation.ts:320`)는 §13 cutoff를 **필터하지 않는다**. (calcHeirAllocation은 deathDate 파라미터 자체가 없음.)
- 반면 `priorGiftAggregated`(②-A echo 대상)는 cutoff 적용값.
- 현재는 doneeId가 항상 없어 `giftAmount=0`으로 **마스킹**되어 무해. **doneeId 추가(2-B) 시 §13 도과 증여가 있으면** 인별 `priorGiftAmount`·`taxableValueShare`·`indirectDenominator`(`:324`)가 도과분까지 과다 계상 → ② total(cutoff) ≠ Σ 인별, 인별 ④ 과다.
- → 2-B와 **동시에** calcHeirAllocation이 cutoff-필터된 증여만 쓰도록 정합: orchestrator에서 `preGiftsWithin10Years.filter(isWithin13Cutoff(g, deathDate))`를 전달(또는 deathDate 파라미터 추가 후 내부 필터). `totalPriorGiftAmount`(`:320`)도 동일 필터셋 사용. (AN-5)

### 2.3 수정안 — 3단

**(2-A) ② 행 합계열 즉시 정정 (표시, 저위험)**
`heir-allocation-summary.ts:217-229` ② 행 `total`을 인별 합 대신 **엔진 echo** `result.priorGiftAggregated`로 교체. → doneeId 미지정이어도 ② 합계열이 실제 가산액(2,278M) 표시 → ④ 합계열과 정합.
- **한계 명시 (정정 v2)**: 2-A는 **합계열 표시 전용**. 인별 ④(`taxableValueShare`)는 여전히 사전증여 누락 → 인별 ④ 합 ≠ ④ total. **완전 정합은 2-B 필수**. 2-A 단독 적용 시 ② 인별 셀 0 + 합계 >0 → "수증자 미지정 — 인별 배부 생략" 안내 배지(`usedLegalShareFallback` 안내 동급 sky tone).

**(2-B) doneeId(Heir select) 수집 UI (정본)**
`GiftRowEditor.tsx` 일반 행에 수증자(Heir) select 추가(영리법인 `CorporateGiftFields.tsx:68` 패턴 차용, `heirs` prop을 일반 행에도 전달). doneeId 입력 시 `sumPriorGiftsByDonee` 정상 배부 → ② 인별 + 인별 ④가 합계열과 정합.
- 14지점 (정정 v3 — strip 위험 검증 완료): ①폼상태(`doneeId?` 기존) → ⑤UI 위젯(select 신설) → ④API(`inheritance-api.ts:79` 배열 passthrough·route.ts:79-80 passthrough — **strip 없음 확정**) → ⑨Zod(`priorGiftSchema` doneeId **이미 정의** — `lib/validators/property-valuation-input.ts:406` `z.string().min(1).optional()`) → ⑦결과(② 인별 자동) → ③normalize(이력 호환 — doneeId 미입력 legacy 보존).
- **(정정 v3 — N1) doneeId ↔ isHeir 교차 일관성**: `isWithin13Cutoff`(`inheritance-gift-common.ts:295`)는 cutoff(10/5년)를 **`gift.isHeir`로** 판정한다(doneeId 아님). doneeId를 상속인으로 지정했는데 `isHeir`가 false면 cutoff가 5년으로 오판정 + 인별 배부는 상속인으로 처리 → 모순. → Heir select 선택 시 해당 Heir가 상속인이면 `isHeir`를 자동 동기화(onChange, [[feedback_useeffect_store_mirror_forbidden]] 준수) 또는 validate 교차검증. Design에서 결정.
- **정책 [[feedback_no_silent_apportion_fallback]]**: doneeId 미입력 시 자동 안분 **금지** → 2-A "미지정" 안내로 명시 입력 유도. select 필수화 여부는 Design 결정(필수화 시 기존 sessionStorage·이력 normalize 동반).

**(2-C) cutoff 정합 (2-B 동반 필수 — §2.2 Finding B)**
calcHeirAllocation이 cutoff-필터 증여만 소비하도록 orchestrator 필터 + `totalPriorGiftAmount` 동일 필터. (AN-5)

---

## 3. Pre-Do anchor (Do 진입 전 필수 — [[feedback_pre_anchor_verification]])

추정 금지. 아래 anchor를 **먼저 작성·실행하여 RED 확보** 후 수정.

- **AN-1 (Bug #1)**: estateItem `category:"listed_stock"`, `marketValue: 100_000_000`, `listedStockShares/AvgPrice` 미입력 1건 + 정상 주식 1건 → `result.summaryTable.categoryTotals.stock` **및** `grossEstateValue`가 명시값 포함 합과 일치 `toBe()`. 수정 전 RED(누락) → 후 GREEN.
- **AN-1b (자기일관성)**: `result.summaryTable.categoryTotals.stock === Σ(perHeir.categoryBreakdown.stock)`(협의분할 입력 시). 합계열↔인별열 항등식.
- **AN-1c (정정 v2 — explicit<csv 무회귀)**: `marketValue: 80M` + `listedStockShares/AvgPrice` 합 200M(csv) 1건 → 1-A+1-B 수정 후 합계열·인별열·validate expected **3자 모두 80M(또는 통일 합의값)으로 일치**. 1-A 단독 시 합계열<인별열 갭 RED → 1-B로 GREEN.
- **AN-2 (Bug #1 V2 무회귀)**: V2 비상장 1건 → 수정 전후 `valuatedAmount` 동일 `toBe`. 범위 격리.
- **AN-3 (Bug #2-A)**: doneeId 없는 priorGift 3건 → ② 행 `total === result.priorGiftAggregated`(>0), 인별 셀 0.
- **AN-4 (Bug #2-B)**: doneeId 지정 priorGift → `perHeir[doneeId].priorGiftAmount === giftAmount`, ② 인별 합 === ② total, 인별 ④ 합 === ④ total.
- **AN-5 (정정 v2 — Bug #2-C cutoff)**: §13 도과(상속인 10년 초과) doneeId 지정 증여 1건 + 유효 1건 → ② total = Σ 인별 = `priorGiftAggregated`(도과분 제외), 인별 ④ 과다 계상 없음. 수정 전 RED(도과분 포함) → 후 GREEN.

---

## 4. 작업 순서 (엔진 → UI 시퀀셜, [[feedback_pdca_session_efficiency]])

1. **Design**: `_template.engine.design.md` 복사 + 케이스 인벤토리 표(주식: 명시시가>csv / 명시시가<csv / 명시만 / csv만 / V2 × 협의분할 유무; 사전증여: doneeId 유/무 × heir/legatee/corporate × cutoff 내/도과). 행≥1 필수.
2. **Pre-Do**: AN-1·AN-1c·AN-3·AN-5 작성·실행 → RED 확인 → 디자인 환류.
3. **Do (엔진, `inheritance-gift-tax-senior`)**: 1-A `evaluateStockAsPropertyResult` 위임 + 라벨 / 1-B `validate` 통일 / 2-A ② total echo / 2-C cutoff 필터.
4. **Do (UI, `inheritance-gift-tax-ui-senior`)**: 2-B 수증자 Heir select(14지점) + "미지정" 안내 배지.
5. **Check**: `ui-engine-sync-checker` + `tax-qa-lead`(상속세) + e2e([[feedback_browser_verify_with_playwright]] — 폼→계산→표 검증 spec).

---

## 5. 회귀 위험 · 영향 범위

| 항목 | 위험 | 완화 |
|---|---|---|
| 1-A 엔진 평가 변경 | `grossEstateValue`·`taxableEstateValue`·세액 전체 파급(**실세액 변동**) | 명시 평가액 주식 fixture만 변동(법령 정합). 주식수-기반 fixture 무변동(AN-2 + 전체 `npm test`). 변동 fixture는 §60 정합값으로 anchor 재산정([[feedback_anchor_correction_legal_priority]]) |
| 1-B validate 통일 | `max`→`first` 전환 시 명시<csv 케이스 검증 변동 | AN-1c로 4경로 일치 보장. 통일 합의값(explicit-first)으로 fixture 점검 |
| 2-A ② total 소스 변경 | 화면·PDF 동일 표 공유(`heir-allocation-summary.ts:7`) | 양쪽 자동 정정(공유 builder). 인별 0+합계>0 시 "미지정" 배지 |
| 2-B select | 기존 sessionStorage·이력 호환 | normalize fallback + 권장(선택) 우선 검토 |
| 2-C cutoff 필터 | `indirectDenominator`·기존 PDF 사례(책 1864) 영향 | PDF 사례는 도과 증여 없음(filtered=unfiltered) → 무변동. 전체 `npm test` 확인 |
| **(정정 v3 — N4) 버그 단정 기존 anchor** | ②=0/"—" 또는 stock=550류를 **현행=정답으로 고정**한 기존 테스트가 있으면 수정 후 RED | Do 전 `grep -rn "row-2-priorGift\|categoryTotals.*stock\|heir-summary-cell-total-row-2"` 로 기존 단정 전수 조사 → 버그값 단정이면 정합값으로 갱신([[feedback_anchor_correction_legal_priority]]) |
| **(정정 v3) 렌더러 도달** | 2-A 수정이 화면/PDF 셀까지 도달 | **검증 완료**: 화면 `HeirAllocationSummaryTable.tsx:137`(`fmt(row.total)`)·PDF `inheritance-heir-allocation-section.tsx` 둘 다 `buildSummaryTable` 공유 — 자동 반영. 배지 자리 `:60-70` 확보 |

**완료 기준**: AN-1~5 GREEN · `npx tsc --noEmit` 0 · `npm test` 전체 통과(공유 모듈) · 주식=650,000,000 · ①=6,680,000,000 · ④ 합계열=인별합=8,075,000,000 · 브라우저 e2e 통과.

**④ 정합 항등식 검증 메모 (v3)**: `taxableEstateValue`(`inheritance-tax.ts:209`) = grossEstate + presumedTotal − exemptAmount(㉠=0) − deductedBeforeAggregation(㉡ 채무 1,233M) + priorGiftAggregated. Σ taxableValueShare = Σ(directEstate+presumed+gift−debtShare). 두 식의 일치는 **㉠(비과세·불산입)=0 + 채무·추정의 floor 잔액 흡수 정상**일 때 성립(본 사례 충족). ㉠>0 케이스의 인별 분배는 별도 검토(확인 필요, 본 버그 범위 외).

---

## 6. 검토 정정 이력 (v1 → v2, 2026-05-29 self-review)

| # | 분류 | v1 문제 | v2 정정 |
|---|---|---|---|
| C1 | 모순 | 헤더 "추정 0" ↔ 100M을 "주식 1건"에 단정(입력 데이터 미확인) | 메커니즘만 단정, 자산별 귀속은 AN-1 실증으로 명시 |
| C2 | 과대단정 | "시가 입력 주식 1건(≈100M)" | "명시값>csv 주식 자산"(개수 불특정) + AN-1 위임 |
| C3 | **누락(회귀 유발)** | 1-A만 수정 → 명시값<csv에서 합계열<인별열 **역방향 갭** 미인지 | 1-B validate 통일 **범위 내 승격** + AN-1c 신설 |
| C4 | 부정확 | "수증자 UI 부재"만 기술 | `doneeRelation`은 존재하나 `doneeId` 부재 — 관계만으론 복수 동일관계 상속인 배부 불가 → Heir select 필수 명확화 |
| C5 | **누락(회귀 유발)** | calcHeirAllocation cutoff 미정합 미인지 | Finding B (§2.2) 신설 + 2-C + AN-5 |
| C6 | 불충분 | ④ 정합 목표 수치 부재 | 주식 650M·①6,680M·②2,278M·④8,075M 역산 목표 명시(§0 말미·§5) |

### v2 → v3 (2026-05-29 2차 self-review — 미검증 주장 코드 실측)

| # | 분류 | v2 상태 | v3 정정·검증 |
|---|---|---|---|
| N1 | **누락(모순 유발)** | doneeId 추가 시 cutoff용 `isHeir`와의 관계 미인지 | `isWithin13Cutoff`는 `gift.isHeir` 기반(`:295`) → doneeId↔isHeir 교차 일관성 동기화/검증 추가(§2.3) |
| N2 | 누락(법령 nuance) | 상장주식 explicit vs §63①1가 우선순위 미검토 | §1.4에 nuance + Design 케이스 행 결정 위임 |
| N3 | **미검증→검증완료** | "Zod doneeId optional 확인"·"API passthrough"를 **추론만** | 실측 확정: `priorGiftSchema` doneeId 정의(`property-valuation-input.ts:406`)·route/api 배열 passthrough — **strip 위험 0** |
| N4 | 누락(회귀) | 버그값을 정답으로 고정한 기존 anchor 가능성 미점검 | Do 전 grep 전수 조사 + 버그단정 anchor 갱신 절차(§5) |
| N5 | **미검증→검증완료** | 2-A 수정이 화면/PDF 셀 도달·배지 자리 **미확인** | 렌더러 `HeirAllocationSummaryTable.tsx:137`·PDF section 공유 `buildSummaryTable` 확정, 배지 영역 `:60-70` 확보 |
| N6 | **미검증→검증완료** | 2-C 필터가 `priorGiftAggregated` 집합과 일치하는지 **미확인** | `aggregatePriorGiftsForInheritance`(`inheritance-gift-common.ts:320`)가 동일 `isWithin13Cutoff` 사용 — 필터 정확 일치 확정 |

> **2차 검토 결론**: 신규 회귀/모순 2건(N1·N4) + 법령 nuance 1건(N2) 보강. 나머지 3건(N3·N5·N6)은 v2의 "확인" 표현을 **코드 실측으로 확정**(미검증 단정 제거). v2의 핵심 진단(Bug #1 4경로 통일·Bug #2 doneeId+cutoff)은 모두 유효 — 번복 0.
