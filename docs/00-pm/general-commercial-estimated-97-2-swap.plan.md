# 일반건물·상가 환산 경로 §97②2호 단서 swap 배선 — 구현 계획서

> 상태: **Plan (코딩 미착수)** · 작성 2026-07-21
> 선행 조사: silent-drop 갭 **확정**(실측). 관련 메모리 `project_general_commercial_building_estimated_swap_unplumbed_open`(OPEN → 갭 CONFIRMED로 승격 필요).

---

## 0. 배경 — 확정된 갭 (실측 file:line)

UI는 일반건물(`general_building`)·상가건물(`commercial_building`) 환산취득가 모드에서 자본적지출·양도비 입력을 **노출**하고 "§97② 단서" 안내까지 표시하지만, 그 값은 엔진에 도달하지 못하고 **조용히 버려진다(silent drop)**.

| 지점 | 실측 |
|---|---|
| **UI 노출** | `components/calc/transfer/asset-sections/AssetSectionExpense.tsx:27-49` capex/양도비 CurrencyInput, `:63-65` "§97② 단서 swap" 안내. 자산종류·환산모드 게이팅 **없음**(`CompanionAssetCard.tsx:326-342` 무조건 마운트). |
| **카드 타입에 필드 부재** | `general-building-valuation.ts:286-320` `AssetCardForAggregate`에 `capitalExpenditure`/`transferExpense` **필드 없음**. `expenses`(298)=개산공제만. |
| **카드 생성 시 개산공제 고정** | 토지 카드 `:661` `expenses: estimatedDeduction.land`, 건물 카드 `:689` `expenses: estimatedDeduction.building`. |
| **라우트 매핑 미전달** | `general-building-route-helper.ts:112-184` `buildProperties`가 capex 키 자체를 매핑 안 함 + `:126` `useEstimatedAcquisition:false` 강제. |
| **상가 STEP 명시적 폐기** | `transfer-tax-commercial-step.ts:128-129` `capitalExpenditure/transferExpense: undefined` + `:125` `useEstimatedAcquisition:false`. |
| **엔진 swap 게이트** | `transfer-tax-helpers.ts:253-254` `isConversionMode = useEstimatedAcquisition===true` && `swapEligible` && `directSide>estimatedSide`. → 두 경로 모두 `useEstimatedAcquisition:false`라 **구조적 미발동**. |

**비대칭**: 단건(`calcNecessaryExpense`)·다필지(`multi-parcel-transfer`)·토지건물분리(`SplitPartResult.swapApplied`)는 swap 지원. 일반건물·상가 환산 다중카드/재구성 경로만 미지원.

---

## 1. 법령 근거 — 수정 방향은 "배선"으로 확정

소득세법 §97②2호 단서(KoreanLaw mst 280405, 메모리 `feedback_97_2_swap_necessary_expense_max_not_sum` 검증완료):
- 본문: 필요경비 = 환산취득가액 + 개산공제.
- 단서: **가목(환산취득가+개산공제) < 나목(자본적지출+양도비)** 이면 **나목을 필요경비 전체로** 할 수 있다(택일=MAX, 합산 아님).
- ⚠️ 나목 채택 시 **환산취득가는 별도 차감하지 않는다**(이중차감 금지). 양도차익 = 양도가 − 나목.
- 단서는 "취득가액을 **환산취득가액**으로 하는 경우"에 한정 → 감정가액·매매사례가액 모드는 대상 아님.

**정책 판정**: §97②2호 단서는 **납세자 유리 규정**(자본적지출>개산공제 시 미적용 = 과다과세). CLAUDE.md `법 근거 없이 불리 적용 금지·명문부재=유리`(메모리 `feedback_no_unfavorable_application_without_legal_basis`)에 따라 **"UI 입력을 숨기는 방향"은 오답**이며, 단건·다필지와 대칭이 되도록 **배선(plumb)이 정답**. (메모리 사전 결정트리 "노출 O → plumb"와 일치.)

---

## 2. 수정 전략 — ③ "재구성 지점 swap 판정"만 정합

두 경로는 **"실가 모드 재구성" 패턴**: valuation 엔진이 환산취득가를 미리 계산해 `acquisitionPrice`로 넣고 `useEstimatedAcquisition:false`로 내림(엔진 내장 swap이 발동 못 하는 근본 원인).

| 전략 | 판정 |
|---|---|
| ① `useEstimatedAcquisition:true` 되돌림 | ❌ 엔진이 환산가를 **재계산**(`transfer-tax-helpers.ts:317` `calculateEstimatedAcquisitionPrice`) → valuation 엔진의 3시점·건물기준시가 산출값과 불일치 |
| ② actual 모드에 capex만 전달 | ❌ **이중차감**: actual 분기(`:346·352`) `acqCostForGain=환산가` 유지 + `expensesApplied=directSide` → `gain=양도가−환산가−나목` (§97②2호 위반) |
| **③ 재구성 지점에서 swap 판정** | ✅ `directSide > 환산가+개산공제` 이면 `acquisitionPrice=0, expenses=나목`으로 재구성 → `gain=양도가−나목`. 미발동 시 현행 유지 |

### 전략 ③ 재구성 규칙 (공통)
```
estimatedSide = 환산취득가(acquisitionPrice) + 개산공제(expenses)
directSide    = capexEff + transferExpenseEff   // ⚠️ F3: 엔진에 실제 도달하는 유효값(폼-수준 자동안분 후)
swapEligible  = capitalExpenditure !== undefined || transferExpense !== undefined
if (isEstimatedConversion && swapEligible && directSide > estimatedSide) {
  // §97②2호 단서 발동: 나목을 필요경비 전체로. 환산가 미차감.
  acquisitionPrice = 0
  expenses         = directSide
  swapApplied      = true
  swapComparison   = { estimatedSide, directSide, chosen: "direct" }
  // ⚠️ F4: penalty base(usedEstimatedAcquisition·estimatedBase, §114의2 가산세)는 불변 유지.
  //        취득가 '공제'만 0으로. estimatedBase는 penalty 계산용으로 그대로 둔다.
}
// 동률(==)은 본문 적용(단서는 "적은 경우").
```
> **F5 플래그 명시**: `isEstimatedConversion`은 경로별 실제 플래그로 치환 — 상가는 pre-swap 환산 판정(`input.useEstimatedAcquisition===true` 시점의 STEP), 일반건물 카드는 `card.usedEstimatedAcquisition===true`. 엔진의 `useEstimatedAcquisition`(input)과 카드의 `usedEstimatedAcquisition`은 별개 필드이므로 혼용 금지.
> **F3 유효값(`capexEff`/`transferExpenseEff`)**: `transferExpense`는 UI에 **폼-수준 자동 안분**(`AssetSectionExpense.tsx:48,54-57` `allocated = 총 양도비 × 지분`, `useFormLevel` 분기)이 존재. swap directSide는 raw `asset.transferExpense`가 아니라 **API 변환 후 엔진에 도달하는 안분된 값**을 써야 한다. Design에서 변환 지점(`transfer-tax-api*.ts`) 실측 확정.
> **F4 penalty 불변**: swap으로 `acquisitionPrice=0` 세팅 시에도 §114의2① 환산취득가액 가산세 base(`estimatedBase`)는 유지 — 취득가 '공제'만 제거하는 것이지 "환산취득 안 함"이 아니다.
> 엔진 내장 `calcNecessaryExpense`를 재사용하지 않고 재구성 지점에서 판정하는 이유: 이들 경로는 이미 actual 모드로 내려가므로 엔진 내부 swap 분기(`isConversionMode`)에 도달 불가. 로직 중복이지만 **단일 산식(estimatedSide/directSide/동률 본문)**은 `feedback_97_2` 메모리로 고정.

---

## 3. 케이스 매트릭스

| # | 자산 | 취득방식 | capex 입력 | directSide vs (환산+개산) | 기대 결과 |
|---|---|---|---|---|---|
| C1 | 상가 | 환산 | 없음 | — | 현행(개산공제만), swapApplied=false |
| C2 | 상가 | 환산 | 有, directSide ≤ estimatedSide | 이하 | 본문(개산공제), swapComparison.chosen="estimated" |
| C3 | 상가 | 환산 | 有, directSide > estimatedSide | 초과 | **swap**: gain=양도가−나목, 환산가 미차감 |
| C4 | 상가 | 감정가액·**매매사례가액**(salesCase) | 有 | — | swap 대상 아님(본문=취득가+개산공제 — §97②2호 단서는 환산취득가 전용). ⚠️F2: UI 안내 문구도 "감정가액" 오표기 정정 필요 |
| C5 | 상가 | 상속(§163⑨) | 무관 | — | 환산 자체 skip(`:117-119`), swap 무관 |
| G1 | 일반건물 | 전체환산 | 없음 | — | 현행, 카드별 개산공제 |
| G2 | 일반건물 | 전체환산 | 有, 초과 | 초과 | **swap** (capex 배분 설계 필요 — §5.2) |
| G3 | 일반건물 | 실가안분(건물2만 환산) | 有 | — | 부분환산 — swap 범위 판단 필요(§5.2 미결) |
| G4 | 일반건물 | NBL 분리(4카드) | 有 | — | 카드별 swap? 자산 총액 swap? (§5.2 미결) |

---

## 4. Phase 1 — 상가건물 ✅ 배선 완료 (2026-07-21, 미커밋)

**구현 결과**: `transfer-tax-commercial-step.ts` swap 판정(가목=cbStep.acquisitionPrice+lumpSumDeduction vs 나목=capex+양도비, `directSide>estimatedSide` 시 acquisitionPrice=0·expenses=나목) + `CommercialBuildingStepResult`에 swapApplied/swapComparison. `transfer-tax.ts:303` cbStep swap을 result로 승격 병합(`swapApplied = gainSwapApplied || cbStep?.swapApplied`) + gainFormula hoist(CB는 useEstimatedAcquisition=false라 최상위 분기). ⑦ 표시: `TransferTaxResultView` 기존 swap 설명 자동 적용 + `CommercialBuildingValuationDetailCard` swap caveat 추가. F2 UI 안내 문구 정정. anchor A1 3케이스 green, tsc 0·lint 0·transfer 2200 pass 무회귀.
**E2E**: `e2e/commercial-building-97-2-swap.spec.ts` — seedForm sessionStorage 패턴, 양성(나목>가목 → swap caveat 표시)·음성(나목<가목 → 미표시) 2케이스 green. post_disclosure 환산은 `cbLandPricePerSqmAtAcq`(취득시 개별공시지가)도 검증 필수.
**잔여(후속)**: F4 §114의2 penalty base — CB는 환산이어도 usedEstimatedAcquisition=false(기존)라 penalty 경로 별도 검증 필요(본 swap과 독립·기존 이슈).

## 4-원. Phase 1 원설계 — 상가건물 (난이도: 하, 단일 자산)

상가는 **단일 property**이고 `input`이 이미 capex를 들고 온다(`transfer-tax-api.ts:243-254` 전달 확인됨). STEP 0.35만 폐기 중이라 배선이 국소적.

### 수정 지점 (1파일)
- `lib/tax-engine/transfer-tax-commercial-step.ts:120-133` `applyCommercialBuildingStep`:
  - `runCommercialBuildingStep` 결과(`cbStep.acquisitionPrice`, `cbStep.lumpSumDeduction`)로 §2 재구성 규칙 적용.
  - swap 발동 시 `effectiveInput = { ...input, useEstimatedAcquisition:false, acquisitionPrice:0, expenses:directSide, capitalExpenditure:undefined, transferExpense:undefined }` + swap 정보 반환.
  - 미발동 시 현행(`:122-132`) 유지(capex는 계속 undefined 처리 — 이미 나목보다 개산공제가 크므로 안전).
  - ⚠️ 상속 분기(`:117-119`)는 **swap 이전에 早期 return** — 유지(환산 skip이므로 swap 무관).

### 결과 표시 (reconcile)
- `CommercialBuildingStepResult` 타입에 `swapApplied?`/`swapComparison?` 추가.
- 상가 결과뷰 필요경비 산식에서 swap 시 "취득가 항 제외, 필요경비=자본적지출+양도비" 표기(메모리 `feedback_engine_result_display_drift`·`formula-display-builder` 스킬·한국어 풀어쓰기 `feedback_result_view_korean_formula`).
- 표시 지점: `CommercialBuildingResult` 소비 컴포넌트(Do 단계에서 grep 확정 — 계획 단계 미단정).

### F2 — UI 안내 문구 법령 정정 (Phase 1·2 공통 태스크)
`AssetSectionExpense.tsx:22,64`의 안내 문구가 "환산취득가/**감정가액** 모드에서 §97② 단서 발동"이라 표기하나, §97②2호 단서는 **환산취득가 전용**(감정가액·매매사례가액 제외 — 엔진 `transfer-tax-helpers.ts:251-252`·메모리 `feedback_97_2_swap_necessary_expense_max_not_sum`). → 문구를 "**환산취득가 모드에서**"로 축소 정정. 미정정 시 UI가 법령보다 넓게 안내 → C4와 모순·display drift. (기존 UI 버그이나 본 작업이 건드리는 컴포넌트라 동반 정정.)

---

## 5. Phase 2 — 일반건물 ✅ G2 배선 완료 (2026-07-21, 미커밋) · G3/G4 후속

**G2(전체환산) 구현 결과**:
- 신규 `lib/tax-engine/general-building-swap.ts` — `resolveGeneralBuildingSwap`: 환산 카드(F8) estimatedSide 합 vs 나목 자산총액 판정 + estimatedSide 비율 배분(applyRate)·마지막 카드 잔액 흡수(Σ=directSide).
- `GeneralBuildingInput`에 capitalExpenditure?/transferExpense?(자산총액) 추가.
- `buildProperties`(route-helper) swap 파라미터 — swap 카드 acquisitionPrice=0·expenses=배분나목. `calculateGeneralBuildingTransfer`에서 판정·`aggregated.swapApplied/swapComparison` 노출(F10).
- `AggregateTransferResult`에 swapApplied?/swapComparison?. `BundledAllocationCard`에 swap 설명 블록(F10 GB 표시 — bundled는 TransferTaxResultView 아닌 BundledAllocationCard 렌더).
- ④ `transfer-tax-api-gb.ts` capex 매핑(**비-증축만** — 증축은 F1 transferExpense 충돌로 제외) + ⑫ Zod(`transfer-tax-building-schemas.ts`) capex optional.
- anchor `general-building-97-2-swap.anchor.test.ts` 5케이스(baseline·swap gain 115M·Σ불변식·**F9 배분 basis 724,342,809/85,657,191 보유기간 무관**·음성경계) + E2E 2케이스 green. tsc0·lint0·transfer 2204 pass.
- 실측: 사례31 estimatedSideTotal=269,553,853, 나목 810M → gain 925M−810M=**115,000,000**.

**G4(NBL 분할 3카드) ✅ 완료(2026-07-21, anchor만·엔진 코드 무변경)**: landArea>인정면적 시 토지 사업용/비사업용 2장+건물=3 환산 카드. `resolveGeneralBuildingSwap`이 3카드 전체 대상 → estimatedSideTotal 516,233,347<나목 1,026,233,347 → gain 1.2B−1,026,233,347=173,766,653·Σ필요경비=directSide. API 비-증축 capex + NBL은 valuation 내부 분기라 자동 동작. anchor A4 2케이스 green.

**G3(증축) ✅ 완료(2026-07-21, decision b)**: 증축 3카드(토지·건물1·건물2, 원건물·증축 환산)도 `resolveGeneralBuildingSwap`이 처리 — 엔진 무변경. API `transfer-tax-api-gb.ts`: **capitalExpenditure는 항상 전달**(bundledExpenses fallback 미포함·안전), **transferExpense는 비-증축만**(증축은 bundledExpenses legacy fallback으로 소비 가능·F1 이중차감 방지·원건물 실가 시 양도비 이미 차감돼 법령 정합). anchor A3 2케이스(gain 925M−673,376,413=251,623,587) + API 배선 가드 2케이스 green. **swap 3경로(상가·일반건물 G2/G3/G4) 전건 완료.**

## 5-원. Phase 2 원설계 — 일반건물 (난이도: 상, 다중 카드 + capex 배분 난제)

### 5.1 배선 체인 (capex를 카드까지)
1. `GeneralBuildingInput`(types)에 `capitalExpenditure?`/`transferExpense?` 추가 — **자산-총액** 단위.
2. `lib/calc/transfer-tax-api-gb.ts` `buildGeneralBuildingValuation` payload에 capex 매핑.
   - ⚠️ **F1 — 경계 실측 완료(2026-07-21)**: `bundledExpenses`(`:187-196`)는 **이중 게이팅** — `if (asset.gbHasExtension)` **AND** `gbBundledAcquisitionExpenses` 미입력 시에만 `transferExpense`를 fallback 소비. 판정:
     - **G2(순수 전체환산 `gbHasExtension=false`)**: `transferExpense` payload 미포함 → 현재 그냥 drop(=원래 갭). swap 라우팅 **이중소비 없음** — 자유.
     - **G3/증축(`gbHasExtension=true`) + `gbBundledAcquisitionExpenses` 입력**: 전용 필드가 소비 → `transferExpense` 미사용. **이중소비 없음**.
     - **G3/증축 + 전용필드 미입력**: `transferExpense`가 `bundledExpenses`(토지+건물1 실가 필요경비)로 소비 → swap 나목(건물2 환산)에 재사용 시 **이중계상**. = §5.3 G3 경계와 동일 메커니즘(나목의 실가분은 실가 카드가 이미 소비·환산분만 swap 대상).
     - **`capitalExpenditure`는 api-gb 미참조(grep 0건)** → 전 케이스 safe.
   - **해소 방향**: 증축 케이스에서 (a) `gbBundledAcquisitionExpenses` 전용 필드 강제 + `transferExpense` legacy fallback **제거**(→ transferExpense=순수 자산총액 양도비) — 소유 경계 명확·권장, legacy 회귀 검증 필요. 또는 (b) swap directSide에서 bundledExpenses 소비분 transferExpense 제외. **Phase 2는 G2부터 착수 가능**(이중소비 무관) — 증축(G3) 경로만 (a)/(b) 확정 후.
3. `AssetCardForAggregate` 타입(`general-building-valuation.ts:286-320`)에 `capitalExpenditure?`/`transferExpense?` 추가.
4. 카드 생성부(`:635-672` 토지, `:683-699` 건물, `general-building-extension.ts:159-189` 증축)에서 배분값 주입.
5. `buildProperties`(`general-building-route-helper.ts:112-184`)에서 §2 재구성 규칙 적용(자산총액 판정 — §5.2 안 A).
6. ⚠️ **F10(Fork3#5 High) — result→결과뷰 도달 배선 (경계 실측 완료 2026-07-21)**:
   - 실측: 단건 `TransferTaxResult`(`transfer-result.types.ts:81·89`)는 `swapApplied`/`swapComparison` **보유**(단건·다필지 표시용). 그러나 **aggregate `PerPropertyBreakdown`(`transfer-aggregate.types.ts:82-151`)에는 부재** — `capitalExpenditureForDisplay`(:97)만 있고 GB/CB 카드는 항상 0.
   - ⚠️ **핵심**: 전략 ③은 swap을 `buildProperties` 재구성 지점(**단건 엔진 밖**)에서 하므로 단건 엔진은 actual 모드로 돌아 `r.result.swapApplied=undefined`. aggregate builder(`transfer-tax-aggregate.ts:441-481`)의 `r.result` 전파로는 **표시 불가**.
   - **∴ F10 = 3단 작업**: (a) `PerPropertyBreakdown` 타입에 `swapApplied?`/`swapComparison?` 추가, (b) builder(:441-481) 주입, (c) swap 메타를 **buildProperties → item/card → breakdown** 별도 채널로 배선(단순 `r.result` 전파 불가). 단건·다필지 경로는 무영향(기존 swap 필드 유지).

### 5.2 capex 배분/판정 — **안 A (자산총액 swap 판정) 확정** (2026-07-21 결정)
일반건물은 자산-총액 capex 1개인데 valuation 엔진이 토지/건물(+NBL 분리 시 4카드)로 쪼갠다. §97②2호 단서 비교는 **자산 단위**(가목=자산 전체 환산가+개산공제, 나목=자산 전체 자본+양도비)인데, aggregate는 카드별 양도차익 합산 구조.

**채택 = 안 A (자산총액 swap)**:
- **판정 1회 / 자산 총액**: `Σ(환산 카드 acquisitionPrice) + Σ(환산 카드 expenses)` = estimatedSide_total vs `directSide = capex + 양도비` 비교. ⚠️ **F8(Fork1#1 High)**: Σ 대상은 **환산 카드(`usedEstimatedAcquisition=true`)만** — 실가 카드(G3의 토지·건물1)의 취득가·expenses를 가목에 합산하면 estimatedSide_total 과대 → swap 미발동 오판. §5.3과 산식 일원화(§5.3만 아니라 §5.2 본 산식에도 한정자 명기).
- `directSide > estimatedSide_total` 이면 **전 (환산) 카드 swap 처리**. §97②2호 "자산 단위 택일=MAX"와 정합(부분 카드만 swap되는 왜곡 없음).
- **나목(directSide) 카드 배분**: swap 대상 카드 집합에 `estimatedSide`(카드 환산가+개산공제) **비율**로 배분. 각 swap 카드는 `acquisitionPrice=0, expenses=배분된 나목분`. ⚠️ **F4**: 카드의 `estimatedBase`·`usedEstimatedAcquisition`(penalty base)는 **불변 유지**(취득가 공제만 0, 환산 사실 자체는 유지).
  - ⚠️ **F9(Fork3#1 High) — 배분 basis가 세액을 좌우**: 토지 카드와 건물 카드는 **보유기간이 달라 LTHD율이 상이**(건물2 증축은 취득일도 다름). 나목을 어느 카드에 더 배분하느냐가 카드별 양도차익 → 카드별 LTHD 공제 → **총세액을 바꾼다**. 즉 "자산총액 판정이므로 배분은 표시상 artifact"가 **아니다**. §97②2호 나목은 자산 단위인데 aggregate가 카드로 쪼개므로 배분 basis는 **모델 선택**이며 법적 정답이 유일하지 않다. **estimatedSide 비율**을 default로 채택하되(각 카드의 환산가치 기여도 반영 = 가장 중립적), Design 단계에서 (a)estimatedSide 비율 (b)환산가 비율 (c)보유기간 무관 단일 귀속 중 정당화 확정. **anchor A2에 토지·건물 보유기간 상이 케이스 필수 포함**(배분 basis별 세액 차이 실측).
  - 잔액 흡수: 마지막 swap 카드가 `residual = directSide − 앞 카드 배분 합` 흡수(메모리 `feedback_floor_residual_absorption`·`feedback_area_apportion_residual_absorption`). 흡수 기준은 자산총액 아닌 **directSide raw**(게이팅 안분 — CLAUDE.md area-utils 게이팅 주의). → `Σ 카드 배분 나목 = directSide` 불변식.
  - ⚠️ **F7 정책 구분**: 이 estimatedSide 비율 배분은 **엔진-내부 결정적 안분**(입력 완비 + 잔액흡수)이지, 금지 대상인 UI silent apportion fallback(`feedback_no_silent_apportion_fallback`)이 아니다. 미입력을 임의로 채우는 fallback이 아니라 이미 입력된 자산총액 나목을 카드로 쪼개는 산술이므로 정책 위반 아님 — 단, 판정·배분 모두 결정적(비-random·비-fallback)이어야 함.
- **기각 = 안 B (카드별 독립 swap)**: capex를 카드에 **인위적으로 안분**해야 하고(자본적지출은 통상 건물 귀속), 한 카드는 swap·다른 카드는 본문이 되는 자산단위 §97②2호 위반. 비채택.

> **판정 위치**: `buildProperties`(`general-building-route-helper.ts:112-184`)가 카드 배열 전체를 받으므로, 카드→`TransferTaxItemInput` map **이전에** 총액 판정 1회 → swap 여부·카드별 배분값 산출 후 map. (map 내부 per-card 판정 아님.)

### 5.3 G3(부분환산)·G4(NBL 분리) 범위 — **Phase 2 포함 확정** (2026-07-21 결정)
G2(전체환산)와 함께 Phase 2에서 일괄 구현. 안 A 자산총액 판정이 세 케이스를 단일 규칙으로 흡수하므로 분리 이득 적음.
- **G3(건물2만 환산·토지건물 실가안분)**: swap 판정 대상 = **환산 카드(`usedEstimatedAcquisition=true`)만**. estimatedSide_total은 환산 카드들의 `acquisitionPrice+expenses` 합. 실가 카드(`usedEstimatedAcquisition=false`)는 이미 actual 경로(나목 직접차감 or legacy expenses)이므로 **swap 판정·나목 배분에서 제외**. ⚠️ 자산총액 directSide를 환산 카드에만 귀속시키면 실가분 자본적지출이 이중 반영될 위험 → **G3의 directSide는 환산 카드 몫만** 대상(실가 카드가 이미 소비하는 capex와 분리). Design에서 실가/환산 capex 소유 경계 실측 확정.
- **G4(NBL 4카드)**: 사업용·비사업용 초과분 각각 토지·건물 환산 카드(모두 `usedEstimatedAcquisition=true`). 네 카드 estimatedSide 합으로 자산총액 판정, 초과 시 네 카드에 estimatedSide 비율 배분. 안 A와 자연 정합.
- **복잡도 게이트**: G3의 "실가/환산 혼재 시 directSide 귀속 경계"가 최난. Pre-Do anchor에 G3·G4 각 1건 추가(§7)하여 이중차감·경계 오류 실측 차단.

---

## 6. 14개 동기화 지점 매핑 (Do 단계 강제 점검)

| # | 지점 | 상가(P1) | 일반건물(P2) |
|---|---|---|---|
| ① 폼 상태 | AssetForm capex | 기존(노출됨) | 기존(노출됨) |
| ② initial | — | 무변경 | 무변경 |
| ③ normalize | — | 무변경 | 무변경 |
| ④ API 변환 | `transfer-tax-api.ts` capex | 기존 전달됨 | **`transfer-tax-api-gb.ts` 신규 매핑** |
| ⑤ UI 위젯 | AssetSectionExpense | 기존 | 기존 |
| ⑥ 사이드바 | — | swap 반영 확인 | ⚠️**F11**: `transfer-per-asset-summary.ts:79` 현재 `capex+양도비` **단순합산**(실측) — 엔진 swap은 MAX 비교라 드리프트. 정합화 |
| ⑦ 결과 카드 | CB 결과뷰 swap 산식(**신규**) | ⚠️**F10**: `TransferTaxResultView.tsx`·`DetailedStatementFormulaBuilders.ts`(기존 swap 참조처·grep 실측)에 aggregate swap 산식 추가. 결과타입 `transfer-result.types.ts` 확장 선행 |
| ⑧ validation | capex 음수 차단 | 기존 | 기존 |
| ⑨⑩⑫ Zod | capex enum/객체 | 기존 스키마 확인 | **GB payload 스키마 capex 추가** |
| ⑪ 자산 acqDate fallback | — | 무관 | 무관 |
| ⑬ body spread | callTransferTaxAPI | 기존 | **GB 경로 spread 확인** |
| ⑭ Route 매핑 | STEP 0.35 | **수정** | **buildProperties 수정** |

> P1은 대부분 기존 배선 재사용(엔진 STEP만). P2는 ④⑨⑫⑬⑭ 신규 배선 다수 — `tax-field-add` 스킬 체크리스트 적용.
>
> **F4 penalty 경로(별도 점검)**: swap 시 `acquisitionPrice=0`이어도 `usedEstimatedAcquisition`·`estimatedBase`는 §114의2① 환산취득가액 가산세 base로 **불변 유지**. `finalize.ts` penalty 계산(`isEstimatedMode = useEstimatedAcquisition || usedEstimatedAcquisition`)이 swap 후에도 정상 발동하는지 Do 단계 grep 확인.
> **F3 transferExpense 유효값 경로**: 폼-수준 자동안분(`useFormLevel`) 값이 API 변환에서 자산별로 확정되는 지점을 ④에서 실측 — swap directSide가 그 확정값을 참조하도록 배선.

---

## 7. Pre-Do Anchor 설계 (코딩 전 필수 — 수치 확정)

메모리 `feedback_pre_anchor_verification`·`feedback_numeric_impact_verify_before_bug_claim` 강제. 착수 전 anchor 1~2건 우선 작성·실행하여 **과다과세 수치를 실측 확정**하고 설계 환류.

- **A1 (상가 C3) — 작성·실행 완료(2026-07-21)**: `__tests__/tax-engine/transfer/commercial-building-97-2-swap.anchor.test.ts`. 실측 확정: estimatedSide=406,000,000 < directSide=460,000,000. **현행 버그** `transferGain=594,000,000`(capex 완전 폐기·swapApplied=false), **수정 목표** `540,000,000`+swapApplied=true → **과다과세 gain 54,000,000**. 현행 버그값(green 회귀락) + 목표값(`it.fails` — 수정 후 `.fails` 제거) + 음성 경계 3케이스. 테스트 green(2 passed | 1 expected fail).
- **A2 (일반건물 G2)**: 전체환산 일반건물 + 자산총액 directSide 초과 케이스. 안 A 자산총액 판정 + 나목 카드 배분(estimatedSide 비율·잔액 흡수 `Σ=directSide`) 검증.
- **A3 (일반건물 G3)**: 실가/환산 혼재(건물2만 환산). 환산 카드만 swap 판정 대상, 실가 카드 capex 이중차감 없음 검증(§5.3 경계).
- **A4 (일반건물 G4)**: NBL 4카드 전체 환산. 네 카드 estimatedSide 합 판정 + 비율 배분 검증. **정당성(F6)**: A2(2카드)와 판정 로직은 동일하나 NBL 분리는 카드 수↑ → **잔액흡수가 마지막 카드에 몰리는 경로**가 A2와 다르므로 별도 anchor 유지(A2로 흡수 불가). NBL 분리 없으면 A4 생략 가능.
- **A5 (음성·경계 — Fork3#2)**: (a) **C2 경계** — `directSide ≤ estimatedSide`(동률 포함) → 본문 유지·`chosen="estimated"`, swap 미발동. (b) **C4 음성** — 감정가액·매매사례가액 모드 + capex 큰 값 → swap **미발동**(단서는 환산 전용). 오발동·경계 회귀 무방비 방지.
- **A2 배분 basis 검증(F9)**: A2는 **토지·건물 보유기간 상이** 케이스로 구성 — estimatedSide 비율 배분이 세액에 미치는 영향 실측 + `Σ 카드 배분 나목 == directSide`(1원 오차 없음) assert.
- anchor는 **현행 실패(과다과세) → 수정 후 통과** 회귀 가드로 재사용.
- 수치는 KoreanLaw 산식·1원 tolerance 정책(`bigint-round-half-up` 스킬) 준수.

---

## 8. 리스크 / 가드

| 리스크 | 가드 |
|---|---|
| **이중차감**(환산가+나목 동시 차감) | §2 규칙 `acquisitionPrice=0` 강제. anchor로 `gain=양도가−나목` 검증. CLAUDE.md §97② 절 재확인. |
| 감정가액·매매사례가액 모드 오발동 | swap은 `usedEstimatedAcquisition`(환산) 한정. 감정/매매사례 카드 제외 확인. |
| 상가 상속(§163⑨) 회귀 | 상속 早期 return(`:117-119`) swap 이전 유지 — PR#715~718 회귀 금지. |
| capex 배분 왜곡(일반건물) | 안 A(자산총액 판정) 채택. 안 B 지양. |
| 표시 드리프트 | swapApplied 시 결과뷰 취득가 항 제외 reconcile(`feedback_engine_result_display_drift`). UI 안내 문구(F2)도 환산 전용으로 정정. |
| **transferExpense 이중 소비(F1)** | `bundledExpenses` legacy fallback(`api-gb.ts:191-194`)과 swap 나목 라우팅 충돌 — 소유 경계 확정 전 Phase 2 착수 금지. |
| **penalty base(F4) — ✅법제처 검증 완료(2026-07-21)** | swap `acquisitionPrice=0`이어도 estimatedBase 보존 → §114의2 가산세 유지가 **정답**. §97②2호 단서=「취득가액을 환산취득가액으로 하는 경우로서…나목을 필요경비로 할 수 있다」→ swap도 §114의2① 발동조건("환산취득가액을 그 취득가액으로 하는 경우") 충족. anchor F4 2케이스(신축+swap 시 건물분 1,383,043 유지) 고정. 코드 변경 불필요. |
| **transferExpense 안분 불일치(F3)** | swap directSide가 raw 아닌 폼-안분 후 유효값 참조. |
| **800줄 정책(F12, Fork3#3)** | `general-building-valuation.ts` **현재 787줄(실측)** — capex 필드 + 카드 배분 로직 추가 시 800 초과 확실. 카드 배분·자산총액 판정 헬퍼를 **별도 파일(`general-building-swap.ts` 등)로 선분리** 계획. `buildProperties` 증가분도 route-helper 크기 확인. |

---

## 9. 범위 권고

1. **Phase 1(상가) 우선 출시** — 단일 자산·국소 수정·고정 산식. Pre-Do anchor A1 → 엔진 STEP → 결과뷰 → E2E.
2. **Phase 2(일반건물) — 안 A(자산총액 판정) 확정**. G2·G3·G4 **일괄 구현**(안 A가 단일 규칙으로 흡수). G3 실가/환산 경계가 최난 → anchor A3 선행. ⚠️ **F1 Critical 게이트 선결**: transferExpense 이중 소비(`api-gb.ts:191-194`) 경계 확정 전 배선 착수 금지(§10).
3. 각 Phase 독립 PR. 메모리 `project_general_commercial_building_estimated_swap_unplumbed_open` 갱신(갭 CONFIRMED → Phase별 완료 추적).

---

## 10. 확인 필요 (Design 진입 전)

**결정 완료 (2026-07-21)**:
- [x] §5.2 capex 배분 → **안 A(자산총액 swap 판정)** 확정. (§5.2)
- [x] G3(부분환산)·G4(NBL) → **Phase 2 포함** 확정(G2와 일괄). (§5.3)

**Critical 선결 (F1) — 경계 실측 완료(2026-07-21)**:
- [x] **transferExpense 이중 소비 경계 확정**: `bundledExpenses`(`api-gb.ts:187-196`)는 `gbHasExtension` **AND** `gbBundledAcquisitionExpenses` 미입력 시에만 `transferExpense` 소비. → **G2(비-증축)는 이중소비 무관·즉시 착수 가능**. `capitalExpenditure`는 미참조라 전 케이스 safe. **잔여**: 증축(G3) 경로만 (a)legacy fallback 제거 or (b)swap directSide 제외 중 택일(Design). §5.1-2 참조.

**F9·F10·F11 — 경계 실측 완료(2026-07-21)**:
- [x] **F9 CONFIRMED**: `PerPropertyBreakdown`에 카드별 `longTermHoldingDeduction`(`:105`)·`transferGain`(`:101`) 존재 → 나목 배분이 카드별 LTHD 통해 **세액 변동**. estimatedSide 비율 default 채택·정당화는 **Design 확정 + A2 anchor(보유기간 상이)로 수치 실측** 필요(잔여).
- [x] **F10 정정·CONFIRMED**: 단건 result는 swap 필드 有(`transfer-result.types.ts:81·89`)이나 aggregate `PerPropertyBreakdown`(`transfer-aggregate.types.ts:82-151`)는 **부재**. 전략 ③ swap이 단건 엔진 밖(buildProperties)이라 `r.result.swapApplied` undefined → **3단 작업**(타입 추가+builder 주입+buildProperties→breakdown 별도 채널). §5.1-6 참조. (구현은 Do — 코딩)
- [x] **F11 CONFIRMED**: `transfer-per-asset-summary.ts:78-81` 단순합 vs 엔진 MAX 드리프트. **프리뷰 전용**이라 F9/F10보다 저순위. 정합화는 Do에서 3중 패턴.

**잔여 Design 확정 (계획 단계 미단정)**:
- [ ] **F9 정당화**: 배분 basis (a)estimatedSide (b)환산가 (c)단일 귀속 중 택일 — A2 anchor 수치로 결정.
- [ ] 상가 결과뷰 swap 산식 표시 지점 grep 확정(CB 경로).
- [ ] Zod GB payload 스키마에 capex optional 추가 위치 확정(⑫).
- [ ] **F3**: transferExpense 폼-수준 자동안분(`useFormLevel`)이 API 변환에서 확정되는 지점 실측 → swap directSide가 유효값 참조.
- [ ] **F4**: swap `acquisitionPrice=0` 후 §114의2 penalty base(estimatedBase·usedEstimatedAcquisition) 정상 유지 확인(`finalize.ts`).
- [ ] G3에서 실가 카드가 소비하는 capex와 환산 카드 자산총액 directSide의 **소유 경계** 실측(이중차감 방지 — §5.3, F1과 연동).
- [ ] **F2**: `AssetSectionExpense.tsx:22,64` 안내 문구 "감정가액" → "환산취득가 전용" 정정.
- [ ] "극희소 edge case" 우선순위 — 사용자 확인(구현 착수 vs 문서화 보류).
