# 「다주택 중과 판정」 메뉴 — 구현 계획서

> 작성 2026-10-22 · 워크트리 `Property-related-Taxes-mhj` · 브랜치 `docs/multi-house-surcharge-judgment-plan` (origin/master c885a632a)
> Plan 단계 입력: 엔진 시니어(`multi-house-surcharge-senior`)·UI 시니어(`transfer-tax-ui-senior`) 병렬 분석 초안 + 주 세션 근거 재검증.
> 선행: #2415(읍·면 가액기준 · 수도권 판정 분리) 머지 완료. 교재 적용사례 1~5 엔진 대조 완료(같은 날 — 사례 5 본문 1건 교재 오류 판단).

---

## 0. 요약

홈의 「1세대1주택 비과세 판정」 바로 옆에 「다주택 중과 판정」 메뉴를 만든다. 입력은 1주택 판정 메뉴의 단계 화면과 저장소를 **공유**하고, 결과 단계에서 교재식 표(보유 주택마다 ①판정기준 ②기준시가 ③주택 수 산입 ④조정대상지역 ⑤「이 주택을 양도한다면」)와 양도 예정 주택의 판정 순서별 상세 설명, 비과세 요약·세율 영향·세부담 시뮬레이션·계산기 넘기기를 보여 준다.

**엔진 신규 로직은 거의 없다.** 판정은 계산기와 같은 함수(`runMultiHouseSurchargeStep`)를 그대로 부르고, 새로 만드는 것은 ① 판정 메뉴용 route·body 빌더 ② 행별 간이 판정과 설명문 조립(순수 함수) ③ 결과 화면이다.

### 0.1 사용자 결정 (2026-10-22 인터뷰)

| ID | 결정 |
|---|---|
| D1 | 결과 = 교재식 전체 표 + 양도 예정 주택 상세 |
| D2 | 1주택 판정의 단계 화면 재사용 + **입력(store) 공유** |
| D3 | 결과에 함께: (a) 1세대1주택 비과세 결론 요약 (b) 세율 영향 (c) 추가 세부담 시뮬레이션 (d) 양도세 계산기로 넘기기 |
| D4 | 홈 메뉴는 1주택 판정 바로 옆 · **이력 저장 안 함** |
| D5 | 홈 카드는 「새 건」(`?new=1` 유지) · 두 판정 메뉴 사이에 **교차 링크**(입력 유지) |
| D6 | 표 ⑤의 다른 행 = 간이 판정 + 결론을 가를 때만 「확인 필요」 + **「이 주택을 양도 예정 주택으로 바꿔 판정」 전환 버튼** |
| D7 | 보유 주택 행에 사원용(4호)·저당권 실행(8호)·가정어린이집(8호의2) 입력 칸을 **이번에 추가** |
| D8 | 시뮬레이션 지원 범위 = 매매 취득·실가·단일 주택. 그 밖은 「계산기에서 확인」 안내 |

### 0.2 기술 결정 (근거와 함께 이 계획서가 정함)

| ID | 결정 | 근거 |
|---|---|---|
| T1 | 신규 route `app/api/calc/multi-house-surcharge-judgment/route.ts`. 1주택 route의 공통 전처리(Date 변환·주택 수 파생·세율 로드)를 공용 모듈로 추출해 두 route가 부른다 | 「화면은 나누고 엔진은 하나」(`app/api/calc/one-house-exemption/route.ts:9-15`) |
| T2 | 양도 예정 주택 판정 = `runMultiHouseSurchargeStep`(export, `lib/tax-engine/transfer-tax-judgment-steps.ts:410`)을 계산기와 **같은 인자**로 호출(`transfer-tax-precalc.ts:307-320`) | 입력 조립 두 벌 금지 |
| T3 | 「중과를 끈 반사실」은 엔진 **내부 플래그**(`forceNoMultiHouseSurcharge`)로 만든다. 입력 트릭(양도 행에 `isTaxSpecialExemption: true`)은 쓰지 않는다. 플래그는 **중과 적용 술어 `resolveSurchargeApplication`의 최상단 게이트**에서 읽는다(중과 결과를 `undefined`로 두는 방식 금지 — 자가 검토 F-1) | 트릭은 결과에 `tax_special_exemption` 배제 사유를 남겨 설명·echo를 오염시킨다. 선례: `forceFlatRate20`(`types/transfer.types.ts:1200`) |
| T4 | 시뮬레이션은 실제 엔진(`calculateTransferTax`) 2회. 기존 `buildMultiHouseTaxSimulation`은 쓰지 않는다 | 엔진 시니어 실측: 누진표 하드코딩·기본공제 누락·지방소득세 없음으로 차액 170,520,000 vs 엔진 169,770,000 |
| T5 | 설명문은 **서버에서 순수 함수로** 조립해 구조 데이터와 함께 응답. 문장 속 조문은 엔진 `detail` 문구(이미 `MULTI_HOUSE.*` 상수 포함)를 인용하고 새 리터럴을 만들지 않는다 | UI 재계산 금지 · 법령 상수 규칙 |
| T6 | 판정이 어느 단계에서 끝났는지는 엔진 echo 필드를 늘리지 않고 파생 함수 `decisionStageOf(result)`로 얻는다 | 엔진 반환 경로 6곳 무수정 |
| T7 | 저장소 공유 방식 = 같은 store(`useOneHouseJudgmentStore`)에 `surcharge` 결과 슬롯 추가. 폼은 하나, 결과·단계·오류·로딩은 메뉴별 | `updateFormData`가 한 `set`에서 결과를 무효화(`one-house-judgment-store.ts:67-68`) → 두 슬롯을 원자적으로 무효화 |
| T8 | 오케스트레이터는 **신규 파일**. 1주택 오케스트레이터를 일반화하지 않는다 | 1주택 파일은 AI·자동저장·`resultAtMount` 등 전용 분기와 anchor 다수를 가진다 |
| T9 | 시뮬레이션은 결과 뒤 **선택 단계 ⑤**로 둔다(결과 화면 안 입력 아님) | 결과 화면 안 입력은 `updateFormData`로 판정 결과를 무효화한다 |
| T10 | AI 「원문으로 채우기」·참고 의견은 v1 제외 | `handleAiApply`가 `reset()+updateFormData()`로 공유 폼을 통째로 바꾼다 |
| T11 | 한시배제 창(2022.5.10.~2026.5.9.) 안 양도일은 계산기와 같이 중과 전용 입력을 닫고, 결과는 「이론상 중과 유형 + 유예 근거」를 함께 보여 준다 | 계산기 정합(`transfer-tax-api-helpers.ts:30` `isMultiHouseSurchargeSuppressed`) |
| T12 | 메뉴 하한 2018-04-01. 그 전 양도일은 「§104⑦ 다주택 중과 시행 전」으로 응답하고 판정하지 않는다 | `MULTI_HOUSE_SURCHARGE_START_DATE`(`data/multi-house-surcharge-rate-history.ts:21`) · 그 전에는 `house_count_exclusion` 규칙이 없다(엔진 시니어 실측) |

---

## 1. 범위와 법령

- 대상: 「소득세법」 §104⑦(조정대상지역 주택 중과) — 1호(1세대 2주택, 「소득세법 시행령」 §167의10), 2호(1주택+1권리, 같은 영 §167의11), 3호(1세대 3주택 이상, 같은 영 §167의3), 4호(주택+권리 3 이상, 같은 영 §167의4). 장기보유특별공제 배제는 같은 법 §95②.
- 기간: 2018-04-01 이후 양도분. 가산율 연혁은 `resolveSurchargeAddonRate`(2018-04-01~2021-05-31 +10%p/+20%p, 2021-06-01~ +20%p/+30%p).
- 교재 판정 순서(①조정대상지역 → ②지역·가액기준 → ③중과 주택 수 → ④배제) — 엔진 순서는 다르지만 결론이 같다(조건이 모두 「그리고」). 설명문은 **교재 순서**로 서술하고 각 단계의 사실은 엔진 결과에서 가져온다.
- 범위 밖: 겸용주택(`transfer-tax-mixed-use.ts` 별도 경로 — 1주택 route에도 겸용 분기가 없다), 다건 연간 합산, 2018-04-01 전, 비거주자 특례(중과 엔진은 비거주자를 읽지 않는다 — 결과에 고지).
- 법령 인용: 새로 쓰는 조문은 KoreanLaw MCP로 본문 확인 → `lib/tax-engine/legal-codes/` 상수 → `lib/legal-verification/manifest/additions-transfer*.ts` 등록(`__tests__/lib/legal-verification-coverage-complete.test.ts` 게이트).

## 2. 재사용 자산 (실측)

| 자산 | 위치 | 쓰임 |
|---|---|---|
| 판정 폼 타입(TransferFormData 슈퍼셋) | `lib/stores/one-house-judgment-form.types.ts:95-97` | 입력 그대로 |
| 판정 store | `lib/stores/one-house-judgment-store.ts` (persist `one-house-judgment-wizard`, `partialize: formData`) | 공유 + `surcharge` 슬롯 |
| 단계 화면 | `app/calc/one-house-exemption/steps/Step1·Step3·Step2` (화면 순서 0·1·2) | `menu` prop으로 재사용 |
| body 빌더 | `lib/calc/one-house-exemption-api.ts` `buildOneHouseExemptionApiBody` | 감싸서 중과 축 추가 |
| Zod·엔진 입력 조립 | `propertySchema`, `buildTransferEngineInput` | 그대로(신규 Zod 필드 0) |
| 비과세 파이프라인 | `app/api/calc/one-house-exemption/judgment-pipeline.ts` `runOneHouseJudgmentPipeline` | D3a |
| 중과 판정 단계 | `runMultiHouseSurchargeStep` (`transfer-tax-judgment-steps.ts:410`) | 양도 예정 주택 정밀 판정 |
| 중과 엔진 | `determineMultiHouseSurcharge` (`multi-house-surcharge.ts:172`) | 다른 행 간이 판정 |
| 자산 게이트·세율 축 | `resolveSurchargeApplication` (`transfer-tax-surcharge-predicate.ts:128`) | 입주권 양도 = 중과 없음, 장특 축/세율 축 분리 |
| 지역·조정 판정 | `classifyRegionCriteriaByCode`·`isEupMyeonByRegionCode`·`resolveLowPriceLocalHouse`(`multi-house-surcharge-count.ts`), `isRegulatedByBjdCode`(`data/regulated-areas.ts`) | 표 ①③④ |
| 결론 술어 | `lib/calc/one-house-judgment-verdict.ts` `oneHouseVerdictOf` | D3a 배지 |
| 계산기 넘기기 | `lib/calc/one-house-judgment-handoff.ts` `openTransferWithOneHouseFacts` | D3d (수정 필요 — §5.7) |
| 행 라벨 | `components/calc/results/transfer/count-exclusion-house-ref.ts:19` `countExclusionHouseRef` | 표 행 이름 |

## 3. 데이터 흐름

```
[공유 store formData] ──(Step1·Step3·Step2, menu="surcharge")──┐
                                                              ▼
buildMultiHouseSurchargeApiBody(form) = buildOneHouseExemptionApiBody(form) + 중과 축
  (sellingHouseExclusion · gracePeriod · houses 중과 칸 · spouseHeldAtTransfer)
        │ POST /api/calc/multi-house-surcharge-judgment  { property, simulation? }
        ▼
route: rate limit → Zod(propertySchema) → date-coerce → buildTransferEngineInput → 주택 수 파생
       → (양도일 < 2018-04-01 → scope 응답)
       → exemption  = runOneHouseJudgmentPipeline(...)                          [D3a]
       → headline   = runMultiHouseSurchargeStep(engineInput, rates, [], excl, hceDate)  [정밀]
       → app        = resolveSurchargeApplication(...)
       → rows[]     = 행별 간이 판정 + 민감도 재판정                               [표 ⑤]
       → narrative  = buildSurchargeNarrative(headline, facts)                   [상세]
       → rateImpact = f(headline, app, transferDate)                             [D3b]
       → simulation = calculateTransferTax ×2 (요청 시)                           [D3c]
        ▼
store.surcharge.result ──> MultiHouseSurchargeResultView
```

---

## 4. 엔진·API 설계

### 4.1 route 단계

| # | 단계 | 1주택 route와의 관계 |
|---|---|---|
| 0~2 | rate limit(키 `multi-house-surcharge-judgment:ip`) · JSON · Zod `{ property: propertySchema, simulation?: {...} }` | 같은 방식 |
| 3~5 | Date 변환(`date-coerce`) · `buildTransferEngineInput` · `deriveHouseholdHousingCount/RightCount` 덮어쓰기 · 세율 로드(+fallback) | **공용 모듈로 추출**(T1). 1주택 route 응답 불변을 기존 anchor로 보증 |
| 6 | 양도일 < 2018-04-01 → `scope: { supported: false, reason: "before_2018_04_01" }` | 신규 |
| 6' | `parsedRates.houseCountExclusionRules` 없음 → 명시 에러(근사 금지) | 신규 |
| 7 | `exemption = runOneHouseJudgmentPipeline(engineInput, rates, judgmentBaseDate=오늘, isRightSale)` | 그대로 호출 |
| 8 | `excl = resolveSurchargeExclusionByReduction(...)` — `transfer-tax-precalc.ts:307-313`과 같은 인자 | 계산기와 동일 |
| 9 | `headline = runMultiHouseSurchargeStep(engineInput, rates, [], excl, hceGeneralHouseAcquisitionDate)` | 계산기와 동일. `hceGeneralHouseAcquisitionDate` 산식(`transfer-tax-precalc.ts:249-256`)을 export 함수로 추출해 공유 |
| 10 | 행별 판정(§4.3) | 신규 |
| 11 | 설명문·세율 영향·시뮬레이션 | 신규 |
| 12 | `finiteJson({ data })` · 오류 envelope은 1주택 route와 같다 | 같음 |

- 중과 판정 기준일은 **양도일**, D3a의 pending 기한 기준일은 **오늘**(`resolveJudgmentBaseDate`)이다. 두 날짜를 응답에 함께 싣는다.
- 확인 필요(별건 기록): 1주택 pipeline은 `runHouseCountExclusionStep`에 `generalHouseAcquisitionDate`를 넘기지 않는다(`judgment-pipeline.ts:36`). 계산기는 넘긴다. 증여 세대에서 결론이 갈리는지는 이 기능 범위 밖으로 따로 실측한다(V-4).

### 4.2 body 빌더 (④⑬)

`buildMultiHouseSurchargeApiBody(form)`:
- 기반: `buildOneHouseExemptionApiBody(form)`.
- `houses`를 `buildHousesPayload(primary, form.houses, rights, form.sellingHouseExclusion, form.transferDate)`로 다시 만든다(1주택 빌더는 4번째 인자를 `undefined`로 고정 — `one-house-exemption-api.ts:118`, 호출 `:113-119`). 엔진 시니어 실측: 문화유산 선언 3주택 양도가 1주택 body로는 `multi_house_3plus`, 중과 body로는 `none(cultural_heritage)`.
- `gracePeriod`: 계산기 ④(`transfer-tax-api.ts:614-617`)와 같은 `gracePeriodInScope` 게이트. 단 그 술어는 `form.householdHousingCount` 스칼라를 읽는다(`lib/calc/grace-period-scope.ts:48`). 판정 폼에는 그 스칼라가 없으므로 **`withDerivedHouseCount(form)`로 파생한 폼**을 넘긴다(위젯 노출·전송·validate 3중 일치).
- 행 `spouseHeldAtTransfer`는 `buildOtherHousesPayload`가 이미 싣는다 — 판정 메뉴가 묻지 않았을 뿐이다.
- D7 신규 행 칸(4호·8호·8호의2)은 `buildOtherHousesPayload`에 추가(§5.4).
- Zod(`houseSchema` `transfer-tax-schema-sub.ts:336-349`)·route 매핑(`transfer-route-multi-house.ts:146-153`)은 이미 이 필드를 받는다 — **신규 Zod 필드 0**.

### 4.3 행별 「이 주택을 양도한다면」 (표 ⑤)

인벤토리 = `[assets[0], ...form.houses, ...form.presaleRights]` 중 **양도일 현재 보유분**(`housesOwnedAtTransfer`·`rightsOwnedAtTransfer`). 필터에서 빠진 행은 표에 「양도일 현재 미보유」로 따로 보인다(행이 조용히 사라지지 않게).

| 행 | 판정 | 비고 |
|---|---|---|
| 양도 예정 주택(assets[0]) | **정밀** = `headline` | 계산기와 같은 결론(parity anchor MH-P2) |
| 그 밖의 주택 행 k | **간이** = `determineMultiHouseSurcharge({ houses, sellingHouseId: k, transferDate, isOneHousehold, presaleRights, marriageMerge, parentalCareMerge })` | 양도 행위에 묶인 슬롯은 비운다(아래) |
| 입주권·분양권 행 | 「중과 없음 — 주택이 아님」 | 셀 값을 만들지 말고 `resolveSurchargeApplication`의 자산 게이트를 부른다 |
| assets[0]이 입주권·분양권 | headline도 자산 게이트로 「중과 없음」. 행 판정에서는 assets[0]을 권리 행으로 바꾸고 `selling` 더미 주택 행을 뺀다(1주택 route `:180`과 같은 이유) | `rightValue` 출처 V-5 |

간이 판정에서 비우는 슬롯(모름 = 불성립): `deemedOneHouseBy155`·`deemedOneHouseSource`·`sellingHouseMeetsOneHouseRequirements`·`unavoidableOutsideCapitalHouse`·`oldClause8TemporaryTwoHouse`·`rightDeemingCitedByOldClause1`·`gracePeriod`(가목은 날짜만으로 판정)·감면 배제 주입.

- 🔴 **행 판정의 주택 집합은 headline이 쓴 것과 같아야 한다(F-5)** — `runMultiHouseSurchargeStep`은 `determineMultiHouseSurcharge`를 부르기 전에 주택 집합을 손본다: §155⑳ 불성립 임대 호 추가(`unmetRentalSurchargeHouses`), 명부 없는 구성 행, ⑥ 5호 연결(`linkTaxIncentiveHouse5ho`), 3호 확인 필요(`withTaxIncentiveRental3hoNotice`) — `transfer-tax-judgment-steps.ts:420-480`. 행 판정이 `determineMultiHouseSurcharge`를 직접 부르면 이 단계를 건너뛴다(`feedback_early_return_branch_skips_pipeline_stages`). ⇒ 집합 조립부를 export 함수로 추출(결과 불변 리팩터)해 행 판정이 재사용하고, 행마다 `sellingId`만 바꿔 5호 연결을 다시 한다.
- 🔴 **assets[0]이 「다른 주택」이 될 때 양도 행위에 묶인 사실을 뺀다(F-10)** — 11호 공고 전 매매계약(`preDesignationContract`), 12의2 나·다목 계약·허가 사실, 감면 배제 주입(`isTaxSpecialExemption` — `surchargeExclusionByReduction`)은 「그 주택을 이번에 판다」는 사실이다. 사원용·저당권·문화유산·어린이집·조특법 감면주택 같은 **주택의 속성**은 남긴다. 어느 필드가 어느 쪽인지 V-2에서 전수 분류한다.
- **가정(F-6)**: 표 ⑤는 「같은 양도일에 이 주택을 대신 양도한다면」이다. 표 머리글과 설명 첫 줄에 그 가정을 적는다 — 양도일이 다르면 조정대상지역·유예·가산율이 모두 달라진다.

명부 행만으로 판정 **가능**: 조정대상지역(10자리 코드), 주택 수 산입(1호·12호·공동상속 소수지분·§167의3⑨), 행 자체 1호, 2호·3호·5호·6호·7호, 10호, 2주택 3호·7호·9호, 12의2 가목, 위기취득 부칙, **D7 이후 4호·8호·8호의2**.
명부 행만으로 판정 **불가**: 15호·13호 의제(행의 §154① 보유·거주 사실 필요), 구 8호, §167의10①4호(§155⑧), 11호 공고 전 계약, 12의2 나·다목.

**민감도 재판정**(D6 「필요할 때만 확인 필요」): 행 k의 간이 결과가 중과일 때만 아래를 돌려 결론이 바뀌면 그 행에 확인 필요를 단다. 저장소 관례(`spouseHoldingNotices`·`rentalCancellationNotices`의 반사실 재판정)와 같다.

| 재판정 | 입력 | 고지 |
|---|---|---|
| S1 | `deemedOneHouseBy155: "temporary_two_house"` + `sellingHouseMeetsOneHouseRequirements: true` | 「이 주택을 팔 때의 보유·거주 사실(일시적 2주택 등)에 따라 중과가 배제될 수 있습니다 — 양도 예정 주택으로 바꿔 판정하세요」 |
| S2 | `unavoidableOutsideCapitalHouse: true` | §155⑧ 수도권 밖 부득이 주택 |
| S3 | 양도일 > 2026-05-09 이고 `transitionExemptionMonths(code) !== null` | 12의2 나·다목(계약일·토지거래허가) |

엔진 시니어 실측(p5): 2주택 강남(양도)+서초(양도일 2024-03-01) — 두 행 간이 결과 `multi_house_2`, S1에서 `none`.

**전환 버튼**(D6): 「이 주택을 양도 예정 주택으로 바꿔 판정」 → **확인 대화상자**(「양도 예정 주택이 바뀌고, 입력을 함께 쓰는 1세대1주택 비과세 판정 메뉴에도 반영됩니다」 — F-9) 후 `swapSellingHouse(form, houseId)`가 assets[0] ↔ 명부 행을 맞바꾼다. 맞바꾸기는 `updateFormData` 한 번이라 두 메뉴의 결과가 함께 무효화된다. 양도 주택에만 있는 사실(양도가액·거주기간·§155 특례 입력·`sellingHouseExclusion` 등)은 **비우고** ② 양도 대상 주택 단계로 보내며 「새 양도 주택의 사실을 입력하세요」를 고지한다. 필드 대응표(AssetForm ↔ HouseEntry)는 Do 진입 전 전수 작성(V-6) — 대응 없는 필드를 조용히 버리지 않는다.
  - 🔴 **초판 정정(P9, 2026-10-23)**: 초판은 「`sellingHouseExclusion` 등 양도 주택에만 있는 사실은 비운다」였다. **불완전했다** — V-2 실측대로 `sellingHouseExclusion`은 대부분 **주택 속성**(사원용·저당권·문화유산·어린이집·부득이·소송·장기임대·조특 임대)이고 명부 행에 같은 뜻의 칸이 있다. 비우면 옛 양도 주택이 행이 되는 순간 그 배제가 빠져 표 판정이 달라진다. 진짜 양도 행위 사실은 11호 공고 전 매매계약 두 칸뿐이다. ⇒ 사용자 결정으로 **주택 속성은 서로 옮기고** 양도 행위 사실·한쪽에만 있는 칸만 비운다(V-6 대응표).
  - 거주 입력은 「구간 입력 + 빈 구간」으로 되돌린다. 옛 「개월 수 직접 입력」 축을 남기면 새 양도 주택의 거주가 조용히 0개월이 되므로 ⑧이 다시 묻게 한다.
  - §155① 신규 주택 취득 경위(행 `acquisitionOrigin`)는 옛 양도 주택 행에 **채우지 않는다**. 「매매 취득」이 분양권 취득일 수도 있어서 추측이 되기 때문이다. 그 행이 새 양도 주택보다 나중 취득이면 ⑧이 묻는다.

- **P3a 실측 메모(2026-10-22)**: `assembleSurchargeHouseSet`의 `fromTwoHouseDeeming`은 「구성 행이 **만들어졌는가**」(`!!twoHouseDeemingHouses`)로 종전 의미를 유지했다. 「집합으로 쓰였는가」로 바꾸는 mutation은 `__tests__/tax-engine/{multi-house-surcharge,transfer}/` 5,563건에서 **살아남는다** — 명부 없는 §155⑳ 불성립 임대 호(주택 수 1)와 조특법 제외만의 의제 구성 행이 동시에 서는 조합을 다루는 테스트가 없다(기존 공백 · 이번 변경은 결과 불변). `classifyRegionCriteriaDetail` 동치는 변경 전 함수 스냅샷(시군구 2,153코드)과 대조해 전부 같았다.

### 4.4 표 셀 출처

| 셀 | 출처 | 비고 |
|---|---|---|
| ① 판정기준 | `classifyRegionCriteriaDetail(code)` — 신규. `"REGION"/"VALUE"`와 **이유**(수도권 동·광역시 자치구·세종 동 / 군·읍·면·그 밖의 지방)를 함께 반환. 기존 `classifyRegionCriteriaByCode`는 이것을 호출 | 전 시군구 코드 동치 anchor. 코드 없으면 수동 지역 구분값 + 「주소 미입력」 |
| ② 기준시가 | 행 `officialPrice` / assets[0] `standardPriceAtTransfer` | 입력 echo |
| ③ 산입 여부 | `headline.excludedHouses`에서 행 id 조회(`reason`·`detail`) · assets[0] id는 `"selling"`(`house-count.ts` `SELLING_HOUSE_ID`) · 권리는 사유를 돌려주는 helper(`isPresaleRightCounted`가 호출하도록 추출) | **비조정지역에서도 `excludedHouses`는 채워진다**(엔진 시니어 실측). Step 4 조기 반환은 `exclusionReasons`에만 해당 |
| ④ 조정대상지역 | `isRegulatedByBjdCode(code, 양도일, row.inDesignatedDistrict)` — `basis`·`confidence`·`districtOnly` | `districtOnly` 미선언 = 지정(불리) + 확인 필요 |
| ⑤ 양도한다면 | §4.3 + `resolveSurchargeApplication` | |

### 4.5 양도 예정 주택 상세 설명 (`buildSurchargeNarrative`)

교재 순서로 단계 배열을 만든다. 각 단계 = `{ id, title, verdict, sentences[], basis[] }`.

| 단계 | 사실 출처 | 예시 문장 골격 |
|---|---|---|
| ① 조정대상지역 | `headline.isRegulatedAtTransfer` + `isRegulatedByBjdCode(...).basis` | 「양도일(YYYY-MM-DD) 현재 ○○는 조정대상지역입니다(지정 YYYY-MM-DD).」 |
| ② 판정기준 | `classifyRegionCriteriaDetail` + `resolveLowPriceLocalHouse` | 「○○읍은 읍·면 지역이라 가액기준이 적용되고, 양도 당시 기준시가 ___는 3억원 이하이므로 중과대상 주택이 아닙니다.」 |
| ③ 중과 주택 수 | `effectiveHouseCount`·`rawHouseCount`·`excludedHouses[].detail`·`excludedPresaleRights` | 「보유 N채 중 ___는 ○○ 사유로 빠져 중과대상 주택은 M채(1세대 M주택)입니다.」 |
| ④ 배제 | `exclusionReasons[].detail` · `onlyOneRemainingDetail` · 불성립 이유는 `exemption.judgment.unmetExceptions`/`undetermined` | 「○○호에 해당해 중과가 배제됩니다.」 |
| ⑤ 유예·부칙 | `isSurchargeSuspended`·`surchargeSuspensionBasis/Deadline`·`rateSurchargeStatutoryExcluded` | |
| ⑥ 결론 | `decisionStageOf(headline)` + `app.isSurchargeApplied` | 「1세대 3주택 이상 중과(기본세율 +30%p)가 적용됩니다.」 |

- 결론 단계 판별 `decisionStageOf`: `multi-house-surcharge.ts`의 반환 경로(Step 3 1주택 이하 `:316` · Step 4 비조정 `:332` · Step 4.5 1호 `:353` · Step 5 10호 `:386` · Step 6 배제/유예 `:435` · Step 7 중과 `:508`)를 결과 신호로 판별하는 exhaustive switch. 각 경로 최소 1건 anchor.
- 「납세자 유리/불리·절감」 표현 금지. 금액은 「원」 접미 없이 숫자만(결과 화면 규칙).
- **판정하지 못한 것도 서술한다(F-7)** — `headline.result.warnings`(예: 9호 1억 판정 불가 · 3호 부득이 사유 취득 당시 기준시가 없음 · 3호 후단 대상 모름 · 확인 필요 고지)를 해당 단계와 「확인 필요」 목록에 **빠짐없이** 싣는다. ④ 배제 단계는 배제가 없을 때도 「검토한 배제 사유 중 해당하는 것이 없습니다」와 판정에 쓰지 못한 사실을 함께 적는다(`feedback_success_only_breakdown_hides_failures`).

### 4.6 세율 영향 (D3b)

| 항목 | 출처 |
|---|---|
| 가산율 | `resolveSurchargeAddonRate(transferDate, type)` (`data/multi-house-surcharge-rate-history.ts`) |
| 장기보유특별공제 배제 | `app.isSurchargeCase && !suspended && isMultiHouseLthdExclusionEra(date)` (`transfer-tax-lthd.ts:176`), 라벨 `LTHD_EXCLUSION_LABEL.multi_house_surcharge` |
| 한시 유예 | `isSurchargeSuspended`·`surchargeSuspensionBasis`(가·나·다)·`surchargeSuspensionDeadline`, 보유 2년 `meetsSurchargeSuspensionHolding`(`tax-utils.ts:495`) |
| 위기취득 부칙 | `rateSurchargeStatutoryExcluded` — **세율만 배제, 장특 배제는 존속**(서울행정법원 2024구단72950). 두 축(`isSurchargeCase` 장특 축 / `isRateSurchargeApplied` 세율 축)을 따로 표시 |
| 단기보유 비교과세 | 「보유 2년 미만이면 단기세율과 중과세율 중 큰 세액」 한 줄 고지(수치는 시뮬레이션에서만) |

### 4.7 세부담 시뮬레이션 (D3c · D8)

- 입력(⑤ 선택 단계): 취득가액·필요경비 합계. 양도가액은 기존 `contractTotalPrice`. 보유기간은 취득일. 연간 기본공제 사용액 0 가정(고지).
- 지원 조건: 양도 예정 주택이 주택이고, 취득 원인이 매매, 실가, 단일 자산. 아니면 `simulation: { status: "unsupported", reason }` + 「계산기에서 확인」.
- 계산: A = `calculateTransferTax(engineInput + 비용)`(`lib/tax-engine/transfer-tax.ts:78`) / B = A 입력 + **`forceNoMultiHouseSurcharge: true`**(T3).
- 🔴 **초판 정정(F-1)**: 초판은 「플래그가 서면 중과 결과를 `undefined`로 둔다」였다. **틀렸다** — 결과가 `undefined`면 `resolveSurchargeApplication`이 원시 플래그(`isRegulatedArea && householdHousingCount >= 2`)로 fallback해(`transfer-tax-surcharge-predicate.ts:146-151`) **B도 중과로 계산된다**. ⇒ 플래그를 술어 입력(`SurchargeApplicationInput`)에 더하고 술어 최상단에서 `isSurchargeCase=false`로 닫는다. 술어 호출부 4곳이 입력을 만드는 방식이 다르다 — `transfer-tax.ts:585`(장특 축)는 **4필드 리터럴을 새로 만들므로 플래그를 명시 전달**해야 하고, `transfer-tax-rate-calc.ts:370`(세율 축)은 입력 전체를 넘긴다. `transfer-tax-redevelopment-steps.ts:325`·`transfer-tax-mixed-use.ts:233`은 D8 범위 밖이지만 같은 전달을 넣어 경로 간 차이를 남기지 않는다. 다른 경로(일시적 2주택 기한 판정의 `isRegulatedArea` 등)는 건드리지 않는다.
- 표시: 양도차익·장특공제·과세표준·적용세율(기본+가산)·산출세액·지방소득세·합계, 차액 = A − B. 비과세면 「비과세라 비교 해당 없음」. 금액 칸 정렬 표준(amount-column-align).
- A의 `multiHouseSurchargeEvaluation`(`transfer-result.types.ts:369`)이 headline과 같아야 한다(parity anchor MH-P2 재사용).
- **구현 정밀화(P8, 2026-10-23)**:
  - 입력 두 칸은 공유 폼(`formData`)이 아니라 store 중과 슬롯 `simulationInput`에 둔다. 공유 폼에 두면 칸을 고칠 때마다 두 메뉴의 판정 결과가 함께 무효화된다(T9가 피하려던 것). 또 계산기 넘기기가 계산기의 필요경비 구조(자본적지출 칸 + 폼 수준 양도비 안분 — `transfer-tax-api.ts` `expenses`·`capitalExpenditure`)와 엇갈린다. ⇒ 넘기기에는 실리지 않는다.
  - 입력을 고치면 **시뮬레이션만** 비우고 판정은 둔다(`setSurchargeSimulationInput`). 판정 사실을 고치면 기존대로 판정이 비고 입력은 남는다.
  - 「세액 비교하기」는 같은 route에 `{ property, simulation }`을 보내 판정과 시뮬레이션을 한 응답으로 받는다. 응답 귀속 가드에 시뮬레이션 입력 동일성을 더했다.
  - 세율 로드는 `loadJudgmentRateMap`(원본 맵)과 `loadJudgmentRates`(파싱)로 나눴다 — `calculateTransferTax`가 원본 맵을 받는다. 1주택 route는 그대로 파싱 함수를 쓴다.
  - D8 지원 범위는 화면 술어(`surchargeSimulationUnsupportedReason` — 주택 양도 ∧ 매매 취득)가 정한다. 판정 본문은 상속·증여 원인을 사실이 다 갖춰졌을 때만 싣는다. 그래서 route(`runSurchargeSimulation`)는 본문에 보이는 원인·자산 종류만 다시 확인해 `unsupported`로 답한다.
  - 판정 범위 밖(`scope.supported = false`)이면 `simulation`을 싣지 않는다.

### 4.8 응답 타입 (초안)

```ts
type MultiHouseSurchargeJudgmentResponse = {
  scope: { supported: boolean; reason?: "before_2018_04_01" | "rules_not_loaded" | "non_housing_sale" };
  transferDate: string;          // 중과 기준일
  judgmentBaseDate: string;      // D3a 기한 기준일(오늘)
  headline: {
    result: MultiHouseSurchargeResult;           // 엔진 원본
    application: SurchargeApplication;           // 자산 게이트·세율 축·장특 축
    decisionStage: DecisionStage;
    narrative: NarrativeStep[];
  };
  rows: SurchargeRow[];          // 표 ①~⑤ (양도 예정 주택 · 명부 · 권리 · 미보유)
  exemption: { judgment: OneHouseJudgment; houseCount: OneHouseCountBreakdown };
  rateImpact: RateImpact;
  simulation?: SimulationResult | { status: "unsupported"; reason: string };
  notices: string[];             // 비거주자 미반영 · 미래 양도일 · 기본공제 0 가정 등
};
```

---

## 5. UI 설계

### 5.1 파일 구성 (신규)

```
app/calc/multi-house-surcharge/
  page.tsx                              # metadata + ProfessionalClientGate
  MultiHouseSurchargeCalculator.tsx     # 오케스트레이터 (≈250줄)
  steps/StepResult.tsx                  # 마운트 시 1회 판정(1주택 Step4 패턴)
  steps/StepSimulation.tsx              # ⑤ 선택 단계
components/calc/results/
  MultiHouseSurchargeResultView.tsx     # 조립 (≤400줄)
  surcharge/ExemptionSummaryCard.tsx    # D3a — oneHouseVerdictOf
  surcharge/SurchargeHouseTable.tsx     # D1 표
  surcharge/SurchargeSellingDetail.tsx  # D1 상세
  surcharge/SurchargeRateImpactCard.tsx # D3b
  surcharge/SurchargeSimulationCard.tsx # D3c
components/calc/multi-house-surcharge/MultiHouseSurchargeSidebar.tsx
lib/calc/multi-house-surcharge-api.ts   # ④⑬
lib/calc/multi-house-surcharge-validate.ts  # ⑧
lib/calc/judgment-menu-flags.ts         # menu → 개별 플래그
lib/calc/swap-selling-house.ts          # D6 전환
app/api/calc/multi-house-surcharge-judgment/route.ts (+ 공용 전처리 모듈)
lib/tax-engine/multi-house-surcharge-narrative.ts  # 설명문·decisionStageOf·행 판정 (순수)
```

### 5.2 store (`one-house-judgment-store.ts`)

| 대상 | 변경 |
|---|---|
| state | `surcharge: { currentStep, result, resultClientId, error, isLoading }` — 초기값은 팩토리 `createInitialSurchargeSlot()` 하나 |
| `updateFormData` | 같은 `set`에서 `surcharge.result/resultClientId`도 null(단계·오류는 유지) |
| `reset` · `discardResultForClientChange` · `onRehydrateStorage` | 슬롯 초기화 |
| 의뢰인 전환 구독(`:124-129`) | 조건을 `result !== null \|\| surcharge.result !== null`로 확장. **P5 정밀화**: `discardResultForClientChange`는 결과가 있는 메뉴만 비우고 1단계로 보낸다 — 두 메뉴를 한꺼번에 초기화하면 결과가 없는(입력 도중인) 다른 메뉴의 단계까지 0이 되어 구독 주석의 「결과가 있을 때만 비운다」 원칙과 어긋난다 |
| 신규 액션 | `setSurchargeStep` · `setSurchargeResult(result, clientId)` · `setSurchargeError` · `setSurchargeLoading` |
| persist | `partialize: formData` 그대로 — 슬롯은 자동 제외 |

- selector는 원자 단위(`s => s.surcharge.result`)만. 슬롯 갱신은 단일 `set`(다중 키 stale spread 방지).

### 5.3 단계 재사용과 숨김 플래그

- 공유 단계에 `menu: "one_house" | "surcharge"`(기본 `"one_house"`)를 넘기고, **호출부가** `judgmentMenuFlags(menu)`로 개별 플래그를 풀어 하위에 넘긴다. 하위 컴포넌트는 메뉴를 추론하지 않는다(`HousesListSection.tsx:297` 주석 원칙).
- **선행 PR(P0): 프록시 해체.** `HousesListSection.tsx:718` `taxIncentiveRentalEnabled={!hideSellingHouseExclusion}`·`:720` `householdGiftEnabled={hideSellingHouseExclusion}`, `houseEntrySpecialExclusionVisible(house, judgmentMenu)`(`HouseEntryEditor.tsx:712`)는 한 플래그에서 다른 축을 추론한다 → 명시 prop으로 승격하고 1주택 메뉴 값이 종전과 같음을 anchor로 고정.

| 플래그 | one_house(현행) | surcharge |
|---|---|---|
| `hideGracePeriod` · `hideSellingHouseExclusion` · `hideSpouseOwned` | true | false |
| `judgmentMenu`(카피·「없음 확인」 미표시) | true | true |
| `surchargeInputsEnabled`(신규 — 행 편집 창의 중과 칸) | false | true |
| `taxIncentiveRentalEnabled`(승격) | false | true |
| `householdGiftEnabled`(승격) | true | true(D3a 쟁점 카드 유지) |

- 화면별: ① 세대 — 제목만 분기 / ② 양도 대상 — 2-C 조정대상지역 안내 문구 분기(중과에서는 「양도일 현재」가 핵심) + **M1 양도 당시 기준시가 입력**(아래) / ③ 보유 주택·권리 — 플래그로 중과 칸 노출.
- **M1**: 양도 주택의 양도 당시 기준시가(`assets[0].standardPriceAtTransfer`, 폼 필드는 이미 있음)가 일반 매매 양도 경로에는 입력 칸이 없다(UI 시니어 grep — 확인 필요 V-7). ② 단계 2-C에 `HousingStdPriceLookupField`를 재사용해 둔다. 가액기준 지역이면 필수(1호 판정), 2주택이면 9호(1억) 판정에 쓰인다.
- 한시배제 창 안이면 중과 칸을 닫고 sky 안내(T11 · 계산기 `Step4.tsx:640` 패턴).

### 5.4 D7 — 보유 주택 행 4호·8호·8호의2

| 지점 | 변경 |
|---|---|
| ① `HouseEntry`(`lib/stores/calc-wizard-asset-nbl.ts`) | `isEmployeeHousing?` · `freeProvisionYears?` · `isMortgageExecution?` · `isDayCareCenter?` · `dayCareOperationYears?` (양도 주택 `sellingHouseExclusion`과 같은 이름·의미) |
| ② initial · ③ normalize | 기본 미설정, 구 데이터 그대로 |
| ④ `buildOtherHousesPayload`(`transfer-tax-api-houses.ts`) | 양도 행(`:199-207`)과 같은 변환으로 행에도 싣는다 |
| ⑤ `HouseEntrySpecialExclusionSection` | 칩 3개 + 조건부 입력(무상제공 연수·어린이집 운영 연수). `surchargeInputsEnabled`일 때와 계산기에서 노출 |
| ⑧ validate | 칩을 켜고 연수를 비우면 오류 |
| ⑫⑬⑭ | 이미 있음(`transfer-tax-schema-sub.ts:336-349` · `transfer-route-multi-house.ts:146-153`) |

- 계산기 명부에도 같은 칸이 생긴다 — 입력하면 계산기 중과 판정도 바뀐다(의도된 정정). 별도 PR로 계산기 회귀(transfer 범위)를 돌린다. 기존 입력(새 칸 미입력)의 세액 불변은 부정형 단언이므로 mutation probe로 확인한다(§11 P-n).
- 🔴 **8호의2 엔진 요건 누락(F-4 · Q-A)** — 현행 「소득세법 시행령」 §167의3①8호의2(시행 2026-07-01, 로컬 캐시 원문)는 「…고유번호를 부여받은 후 5년 이상 어린이집으로 사용하고 **어린이집으로 사용하지 않게 된 날부터 6개월이 경과하지 않은** 주택. 이 경우 가목에서 나목으로 또는 나목에서 가목으로 전환된 경우에는 … 각각의 사용기간을 합산한다」이다. 엔진은 `dayCareOperationYears >= 5`만 본다(`multi-house-surcharge-exclusion.ts:72`·`:109`) — 사용 종료 후 6개월이 지난 주택도 배제한다(과소과세). 양도 주택 경로에도 이미 있는 결함이고 D7이 보유 주택 행까지 넓힌다. 처리 방향은 Q-A → **(a) P1에 포함**(2026-10-22 결정): 행·양도 주택에 「어린이집 사용 종료일」(사용 중이면 비움)을 받고, 엔진 8호의2 판정을 「5년 이상 사용 **그리고** (사용 중이거나 종료일부터 6개월 미경과)」로 정정한다. 운영 연수 칸은 가·나목 전환 시 **합산 기간**임을 안내한다. 신규 필드라 ①~⑭ 전부(⑫ `houseSchema`·양도 주택 Zod, ⑬ body, ⑭ route 매핑·Date 변환) 동기화. 「사용 종료일 모름」은 모름 = 혜택 불성립 + 확인 필요(`feedback_unknown_fact_applies_unfavorably`)이므로 3-state(사용 중 / 종료일 입력 / 모름)로 받는다.

- **P1 구현 결정(2026-10-22)**:
  - 사용 상태는 **택일 2필드**(`dayCareEndDate` · `dayCareInUse`)로 받는다 — §167의10①3호·7호·§155⑧의 기산 상태와 같은 규약(`two-house-exclusion-status.ts`, 사용자 결정 2026-10-04). 초판의 「3-state(사용 중 / 종료일 / 모름)」는 이 규약으로 **정밀화**했다: 「모름」을 선택지로 두지 않고 ⑧·⑫가 막으며, 엔진은 둘 다 없으면 불성립(`isDayCareCenterExempt`). 공용 leaf `lib/calc/daycare-usage-status.ts`(④·⑧·⑫) · 화면 `DayCareUsageFields`(양도 주택·행 공용).
  - 「경과하지 않은」 = 저당권 3년과 같은 독법(초일불산입·말일 당일까지·민법 §161) — `civil-period.ts` `isWithinDeadlineMonths` 신설.
  - §167의3④ 의무사용기간 충족 전 의제는 **사용 중일 때만** 본다 — 5년 전에 사용을 그만뒀으면 요건 미충족(⑤ 추징 사유)이다.
  - 엔진 `multi-house-surcharge-exclusion.ts`가 784줄이 되어 ①~⑨ 그룹 배제·④ 의제를 `multi-house-surcharge-group-exclusion.ts`로 분리(re-export 유지, 681+144).
  - 행 ④ 카드 제목 「특수 배제 사유 (2주택·인구감소)」→「(중과 배제·인구감소)」. 판정 메뉴(중과 입력 닫힘)에서는 D7 사실이 담긴 행에만 열린다(`houseEntryHasSpecialExclusionFacts` — 막다른 길 방지). 판정 메뉴 ⑧(`one-house-exemption-validate.ts`)도 같은 leaf `houseSpecialUseIssue`로 막는다(⑫가 같은 조건으로 400).

### 5.5 결과 화면

**표(`SurchargeHouseTable`)** — 행: 양도 예정 주택(맨 위, 강조) → 명부 순서 → 분양권·입주권 → 양도일 현재 미보유. 열: ①판정기준 ②기준시가 ③주택 수 산입 ④조정대상지역 ⑤양도한다면.
- ②는 `text-right font-mono tabular-nums whitespace-nowrap`, 미입력 「—」, 「원」 접미 없음.
- ○/×는 글리프 + `aria-label`, 색은 `text-emerald-700 dark:text-emerald-400` / `text-rose-700 dark:text-rose-400`(다크 짝 필수).
- ⑤ 간이 판정 행은 「(간이)」 표시 · 확인 필요 아이콘 · 「양도 예정 주택으로 바꿔 판정」 버튼(D6).
- 래퍼 `overflow-x-auto`, 375px에서 페이지 가로 스크롤 0. 글자 크기는 정본 클래스만.
- testid: `surcharge-table` · `surcharge-row-{houseId}`(양도 주택 `surcharge-row-selling`) · `surcharge-cell-{criteria|price|counted|regulated|ifSold}-{houseId}` · `surcharge-count-summary`. `ToneCard`는 testid를 흘리지 않으므로 바깥 div에 붙인다.

**상세(`SurchargeSellingDetail`)** — `narrative` 단계를 번호 매겨 그대로 렌더 + `LawArticleModal`(`components/ui/law-article-modal.tsx:114`) 링크 + 확인 필요 목록(rose). UI는 문장을 만들지 않는다.

**D3 카드**: (a) `ExemptionSummaryCard` — `oneHouseVerdictOf` 배지 + 「비과세 판정에서 자세히 보기」 교차 링크 · 비과세 주택 수와 중과 주택 수는 **다른 축**이라 라벨을 나눈다 (b) `SurchargeRateImpactCard` (c) `SurchargeSimulationCard` (d) 「이 사실로 양도세 계산」 `CtaButton`.

**인쇄**: `window.print()` 버튼 + 단계표시줄·사이드바·버튼 `print:hidden`, 접힘 블록은 `hidden print:block`.

### 5.6 오케스트레이터 안전장치 (1주택 오케스트레이터에서 이어받음)

| 장치 | 원본 |
|---|---|
| 의뢰인 격리 표시 방어(`resultClientId !== activeClientId → null`) | `OneHouseJudgmentCalculator.tsx:85` |
| 응답 귀속 가드 `isCurrent()`(요청 시점 폼 참조 + 의뢰인) | `:196` 부근 |
| 점프 관문(첫 무효 단계로) · 판정 직전 `validateCurrent` | `:145` |
| 결과 단계 제자리 클릭 무시 | `:235` |
| 경고는 `useMemo` 파생(store 금지) | `:126` |
| `useResetOnNewParam(reset)` | `:95` |
| **제외**: `useAutoSaveCalculation`·`resultAtMount`(D4) | `:93`, `:266` |

### 5.7 계산기 넘기기 수정 (D3d)

`toTransferFormPatch`가 `sellingHouseExclusion: undefined`·`gracePeriod: undefined`로 덮는다(`one-house-judgment-handoff.ts:151-152`). 원래 목적은 계산기에 남은 **이전 물건의 값**을 지우는 것(S11-7)이다. 판정 폼이 이제 이 값을 편집하므로 **판정 폼의 값(`form.sellingHouseExclusion`·`form.gracePeriod`)을 넘긴다**. `regionCode: undefined`·`assetSplitMode: undefined`는 유지.

- 🔴 **초판 정정(F-2)**: 초판은 「1주택 메뉴에서는 그 값이 항상 비어 있어 결과가 종전과 같다」였다. **틀렸다** — 입력을 공유하므로(D2) 중과 메뉴에서 넣은 값이 1주택 메뉴의 넘기기에도 실린다. 같은 물건의 사실이라 그것이 맞는 동작이다(계산기는 사실을 받아 재판정). 바뀌는 것은 「1주택 메뉴 넘기기 결과가 종전과 같다」가 아니라 「**판정 폼에 중과 값이 없으면** 종전과 같다」이다.
- 안전망(P-1 실측): 지우기를 무력화하면 `handoff-patch-keys-s11-7.anchor.test.ts` 2건이 실패한다. 이 두 단언(이전 물건 값이 남지 않음 · 640,761,000)은 판정 폼에 값이 없을 때의 동작이라 변경 뒤에도 통과해야 한다.

### 5.8 홈·교차 링크·메타

- 홈 `MENU`(`app/page.tsx:65`) 1주택 항목 바로 뒤: `title: "다주택 중과 판정"`, `subtitle: "보유 주택으로 중과 여부·사유 판정"`, `href: "/calc/multi-house-surcharge?new=1"`(D5), tone `rose`, 아이콘은 기존과 겹치지 않는 것.
- 교차 링크(입력 유지, `?new=1` 없음): 두 메뉴의 입력 단계 헤더·결과 상단. 「이 입력으로 다주택 중과 판정 보기」 / 「이 입력으로 1세대1주택 비과세 판정 보기」.
- `ResetButton`·`HomeButton` 확인 문구에 「두 판정 메뉴가 입력을 함께 씁니다」 추가.
- 메타데이터 description의 조문은 KoreanLaw 확인 후 확정.
- `e2e/home-menu-layout.spec.ts` `titles`에 새 제목 추가, 레이아웃 단언은 완화하지 않는다(13 → 14개, lg 4열 행 수 동일 — 높이 실측 필요 V-8).

### 5.9 validate (⑧ — 신규 파일에서 조합)

- 🔴 **초판 정정(P6a)**: 초판은 「1주택 `validateAllSteps`를 그대로 쓰지 않는다 — 단계별 규칙을 골라 조합」이었다. **불완전했다** — 1주택 단계 검증의 오류는 대부분 ⑫ refine의 거울이고(중과 route도 같은 `propertySchema`라 같은 조건으로 400), 나머지는 결과에 함께 싣는 비과세 요약(D3a)을 틀리게 만드는 입력이다. 덜어 내면 「⑧ 통과 → route 400」이나 틀린 요약이 생긴다. ⇒ **1주택 단계 검증 전부 + 중과 축**으로 정정. 경고 문구는 D3a에도 맞는 내용이라 그대로 둔다.
- 추가 규칙: 양도일·양도 주택 소재지(또는 조정대상지역 토글), 가액기준 지역 행의 기준시가, M1(양도 주택이 가액기준 지역일 때), D7 칩의 연수, 중과 칸의 게이트 술어는 위젯과 **같은 함수**(`gracePeriodInScope`·`isMultiHouseSurchargeSuppressed`·`sellingHouse*Visible`)를 직접 호출.
- 다른 행 소재지 미입력은 막지 않는다 — 표 ①④⑤를 「주소 미입력 · 확인 필요」로 표시(수동 지역 구분으로 ①은 표시).
- 계산기 ⑧의 중과 축 검증(`transfer-tax-validate-step1.ts`의 행·양도 주택·유예 구간)은 leaf로 추출해 계산기와 함께 부른다(P2 — 계산기 동작 불변 anchor).

---

## 6. 14개 동기화 지점

| 지점 | 해당 |
|---|---|
| ①②③ | D7 행 필드 5개(§5.4). 그 밖의 폼 필드 신규 0 |
| ④ | `buildMultiHouseSurchargeApiBody` 신규 · `buildOtherHousesPayload` D7 · 유예 게이트 파생 주택 수 |
| ⑤ | 단계 재사용 + 플래그 · M1 · D7 칩 · 결과·시뮬레이션 단계 |
| ⑥ | `MultiHouseSurchargeSidebar`(`computeOneHouseJudgmentSummary` 재사용 + 입력 사실(양도일 조정대상지역 입력값·보유 주택 수)). **중과 주택 수는 결과 도착 후 응답 echo만** 표시 — 클라이언트에서 산입 여부를 다시 세지 않는다(F-8 · `feedback_aggregate_display_rederives_engine_value`) |
| ⑦ | 결과 뷰 신규 |
| ⑧ | `multi-house-surcharge-validate.ts` 신규 · D7 |
| ⑨⑩⑫ | 신규 필드 0(요청 래퍼 `{property, simulation?}`만) — grep 자가 점검 |
| ⑪ | 해당 없음 |
| ⑬ | 신규 fetch · envelope은 1주택과 같게 |
| ⑭ | `buildTransferEngineInput` 재사용 · Date는 `date-coerce` |

---

## 7. 테스트 계획

### 7.1 route anchor — 교재 5사례 (양도일 2021-06-01)

법정동코드는 **행안부 법정동코드 전체자료(2026-10-22)로 실재 확인한 코드**만 쓴다. (엔진 시니어 초안의 시료 6개 중 5개는 의도와 다른 지역이거나 현행 코드표에 없었다 — 포승 4122025021=팽성읍, 진접 4136025021=와부읍, 군산 4513010100·광주 2914010100 미존재, 대전 3017010100=서구 복수동.)

| ID | 사례 | 코드 | 단언 |
|---|---|---|---|
| MH-1 | 아산 2억·4억 / 세종 2억·4억 | 아산 4420010100 · 세종 반곡동 3611010100 | 주택 수 3(아산 2억 불산입) · 세종 둘 3주택↑ 중과 · 아산 둘 중과 없음(비조정). 대조: 세종 조치원읍 3611025021이면 주택 수 2·전부 중과 없음 |
| MH-2 | 과천·포승·강릉·광주 각 2억 | 과천 4129010100 · 포승읍 4122025621 · 강릉 5115010100 · 광주 1224010400(현행) / 2914010400(구) | 주택 수 2 · 과천·광주 2주택 중과 · 포승 조정지역이나 1호 배제 · 강릉 비조정. 광주 현행·구 코드 동치 |
| MH-3 | 과천 2억·진접 2억·군산 4억·대전 2억 | 진접읍 4136025321 · 군산 5213010100 · 대전 3011010100 | 주택 수 3 · 과천·대전 3주택↑ · 진접 1호 배제 · 군산 비조정. 변형: 진접 4억이면 주택 수 4·진접도 중과 |
| MH-4 | 강남 1억·수성·해운대·분당 각 2억 | 강남 1168010100 · 수성 2726010100 · 해운대 2635010100 · 분당 4113510100 | 2021-06-01 전부 3주택↑ · 2020-06-01 수성·해운대 중과 없음 · 2019-06-01 수성만 중과 없음 |
| MH-5 | 강남 1억·광명 입주권 2억·해운대·구미 2억 | 광명 4121010100 · 구미 4719010100 | 주택+권리 3 · 강남·해운대 중과 · 입주권 양도 중과 없음(자산 게이트) · 구미 비조정. 입주권 먼저 양도 후 강남 1억 → 2주택 9호 배제(교재 서술과 다름 — §167의10①9호), 정비구역이면 중과 |

각 anchor에 **양성 대조**(규칙을 끄면 결론이 바뀌는 쌍)를 둔다.

### 7.2 경계·parity

| ID | 단언 |
|---|---|
| MH-B1 | 2018-03-31 `scope.supported=false` / 2018-04-01 가산율 +10/+20 |
| MH-B2 | 2021-05-31 → 2021-06-01 가산율 변경이 `rateImpact`에 반영 |
| MH-B3 | 2022-05-09 중과 / 2022-05-10 유예 · 2026-05-09 유예 / 2026-05-10 중과 |
| MH-B4 | 위기취득(2009.3.16~2012.12.31 취득) — 세율 축 배제·장특 축 유지 |
| MH-B5 | 양도일에 취득한 행 → 「양도일 현재 미보유」 · 불산입 |
| MH-P1 | 같은 폼에서 중과 route `exemption.judgment` = 1주택 route `judgment` |
| MH-P2 | `headline.result` = `calculateTransferTax(...).multiHouseSurchargeEvaluation` (`surchargeType`·`effectiveHouseCount`·`exclusionReasons.type`) |
| MH-P3 | 「양도 행위 사실이 없는」 폼에서 행 k=0 간이 판정 = 정밀 판정 |
| MH-P4 | body 배선: `sellingHouseExclusion.isCulturalHeritage` → `none`(1주택 body는 `multi_house_3plus`) |
| MH-P5 | 민감도: S1이 결론을 바꿀 때만 확인 필요 문구 |
| MH-P6 | 시뮬레이션 B(`forceNoMultiHouseSurcharge`) = 중과가 애초에 없는 세대 구성의 세액 · 중과 아니면 A = B · 비과세면 A = B = 0 |
| MH-P7 | `decisionStageOf` 6개 경로 각 1건 · `classifyRegionCriteriaDetail` ↔ `classifyRegionCriteriaByCode` 전 시군구 동치 |
| MH-P8 | **1주택 판정 불변(F-3 — 안전망 0 실측)**: 판정 폼에 중과 축(`sellingHouseExclusion`·`gracePeriod`·D7 행 칸)을 채워도 1주택 body는 `sellingHouseExclusion`을 싣지 않고, 1주택 route의 `judgment`는 채우기 전과 동일 |
| MH-P9 | 반사실 플래그 두 축: B 시나리오에서 장특 축(`transfer-tax.ts:585`)과 세율 축(`transfer-tax-rate-calc.ts:370`)이 **모두** 중과 없음. 명부 없는 입력(중과 결과 `undefined` → fallback 경로)에서도 B가 중과 없음 |
| MH-P10 | 행 판정 주택 집합 = headline 주택 집합(§155⑳ 불성립 임대 호·5호 연결 포함) |

### 7.3 UI·E2E

| 파일 | 지키는 것 |
|---|---|
| `__tests__/calc/judgment-menu-flags.anchor.test.ts` | one_house 매핑 = 종전 값, surcharge 매핑 |
| `__tests__/stores/one-house-judgment-store-surcharge-slot.test.tsx`(persist API가 sessionStorage를 요구해 jsdom) | `updateFormData`가 두 슬롯 무효화 · reset/의뢰인 전환/rehydrate · partialize |
| `__tests__/calc/multi-house-surcharge-calculator-isolation.anchor.test.tsx` | 의뢰인 격리 · 응답 귀속 · 점프 관문 · 자동저장 **미호출** |
| `__tests__/calc/judgment-input-sharing.anchor.test.tsx` | 한 메뉴 입력이 다른 메뉴에 그대로 렌더 |
| `__tests__/calc/multi-house-surcharge-api.anchor.test.ts` | 공통 키는 1주택 body와 동일 · 중과 축 도달 · 3중 패턴(UI 노출 ↔ 전송 ↔ validate) |
| `__tests__/calc/handoff-patch-keys-s11-7.anchor.test.ts`(확장 — 2주택 중과 세액 하네스가 이미 있어 이 파일에 둠) | 중과 값 도착(세액 짝) · 판정 폼에 값이 없으면 이전 물건 값이 남지 않음(기존 단언) |
| `__tests__/calc/surcharge-result-table.ui.test.tsx` | 행·열·○/× · 금액 칸 클래스 · 「원」 없음 |
| `__tests__/calc/swap-selling-house.test.ts` | 대응표 전 필드 · 양도 주택 전용 사실 비움 · 명부 행 수 보존 |
| `e2e/multi-house-surcharge-flow.spec.ts` | 시드 → 판정 → 표·상세 → 계산기 넘기기 후 중과 사실 도착 |
| `e2e/multi-house-surcharge-shared-input.spec.ts` | 교차 링크 입력 유지 · 홈 카드 진입 초기화 |
| `e2e/home-menu-layout.spec.ts`(수정) | 새 제목 · 레이아웃 단언 유지 · 375px 가로 스크롤 0 · 다크 대비 |

- 컴포넌트를 렌더하는 테스트는 `.test.tsx`(`.test.ts`는 node 환경).
- 브라우저 확인은 Playwright로(교재 5사례 중 2·3을 화면에서 재현).

---

## 8. PR 분해

| PR | 내용 | verify |
|---|---|---|
| P0 ✅ | 숨김 플래그 프록시 해체 + `judgment-menu-flags.ts`(동작 불변). 편집 창 `judgmentMenu` → `hideSurchargeInputs`(뜻대로 개명), `HouseCountExemptionInputs`·`HousesListSection`에 명시 prop 3개(`hideSurchargeInputs`·`taxIncentiveRentalEnabled`·`householdGiftEnabled`) | 관련 72파일 740건 통과 · 구현 후 mutation 6/6이 정확한 테스트에 잡힘(1주택 값 3 · 계산기 기본값 2 · 중간 전달 1). ⚠️ `HousesListSection.tsx` 761줄(위험구간) — P6에서 이 파일을 다시 열 때 분리 |
| P1 ✅ #2425 | D7 행 4호·8호·8호의2(①②③④⑤⑧) + **8호의2 사용 종료일 신규 필드(①~⑭) · 엔진 6개월 요건 정정**(Q-A) — 계산기·판정 공용 | 행 판정 anchor · 8호의2 경계(종료 후 6개월 전날·당일·다음 날, 민법 기간 계산) · 양도 주택 경로 세액 변경 anchor · transfer 범위 회귀 |
| P2 ✅ | 계산기 ⑧ 중과 축 leaf 추출(동작 불변) — `transfer-tax-validate-surcharge-axis.ts`(행·양도 주택·유예 3 leaf). 동작 불변 실측: 변경 전·후 `collectStep1Issues` 표적 9,792폼 + e2e 케이스 380폼 출력 동일(메시지 56종) | 계산기 validate 회귀 · `surcharge-axis-validate-leaf.anchor.test.ts`(호출 3곳 mutation 포착) |
| P3a ✅ #2428 | 엔진 배관(결과 불변 + 반사실 플래그) — `forceNoMultiHouseSurcharge`(술어 최상단 게이트 · `transfer-tax.ts` 장특 리터럴 명시 전달) · `assembleSurchargeHouseSet`/`linkSurchargeHousesForSelling` export · `resolveHceGeneralHouseAcquisitionDate` 추출 · `classifyRegionCriteriaDetail` · `presaleRightCountReason` | MH-P6·P9(FN-1~5) · 지역기준 이유 · 권리 사유 · 집합 조립 |
| P3b ✅ #2429 | `multi-house-surcharge-narrative.ts` — `decisionStageOf`(7갈래) · 행별 간이 판정(`rowJudgmentHouses` = STEP 0.5 집합 − 11호 계약 사실 · `judgeSurchargeRowSimplified` · 소재지 코드 없으면 조정지역으로 봄) · 민감도 S1~S3 · `judgeSurchargeRows` | MH-P3(RJ-1)·P5(SN-1~3)·P7(DS-1·2)·P10(RJ-2·3) |
| P3c ✅ #2432 | 설명문 `buildSurchargeNarrative`(`multi-house-surcharge-narrative-steps.ts`) — ①조정대상지역 ②판정기준 ③주택 수 ④배제 ⑤유예·취득 시기 특례 ⑥결론. ①②③은 늘, ④⑤는 엔진이 간 단계만. `decisive` = `decisionStageOf`. `headline.warnings` 전건 → `checks`(코드 없음 경고만 ①의 쉬운 문구로 대신 — `REGION_CODE_MISSING_WARNING` export). 주택별 서술은 `houseNotes`(문장에 id 없음) | NR-1~10 · NC-1·2 · mutation 10/10 포착 |
| P4 ✅ #2434 | route `app/api/calc/multi-house-surcharge-judgment/` (`{ property }` · 순수 조립 `surcharge-judgment-payload.ts`) + 공용 전처리 `one-house-exemption/judgment-request.ts`(1주택 route 284→79줄, 동작 불변) + body `lib/calc/multi-house-surcharge-api.ts`(1주택 본문 + 양도 주택 배제 사실 + `gracePeriod`(파생 주택 수 폼) + 빈 명부에도 양도 주택 행 — `buildHousesPayload` `includeSellingWithoutRoster`). scope 밖 4종: `before_2018_04_01`·`non_housing_sale`(입주권·분양권 양도 — 행 표는 V-5 남음)·`rules_not_loaded`·`no_house_roster`. 가목 유예는 엔진이 목을 비워 두므로 `rateImpact.suspension.basis`를 `"a"`로 정규화 | MH-1~5 · MH-B1~B6 · MH-P1·P2(3폼) · MH-P4 · 20건 · mutation 9/10(M8 감면 배제 전달 = 동치: 메뉴 본문 `reductions`는 §99의4·§98의9 행 선언뿐이라 중과 배제 감면 목록과 겹치지 않음) |
| P5 ✅ #2436 | store `surcharge` 슬롯(`SurchargeJudgmentSlot` · `createInitialSurchargeSlot` · 액션 4개) — `updateFormData` 한 `set`에서 두 메뉴 결과 무효화 · reset/rehydrate 초기화 · 의뢰인 전환은 **결과가 있는 메뉴만** 비움(§5.2 정밀화) · handoff는 판정 폼의 `sellingHouseExclusion`·`gracePeriod`를 넘김(§5.7) | SS-1~4(9건) · P5 짝 2건(S11-7 파일 — 같은 B 폼 저당권 실행 선언 도착 → 2주택 중과 배제) · S11-7 기존 단언 통과 · mutation 9/9 |
| P6a ✅ #2438 | 단계 화면 `menu` prop(Step2 플래그 · Step3 2-C 문구 · T11 창 안 안내) · **M1** 양도 당시 기준시가 칸(`HousingStdPriceLookupField`, 가액기준이면 필수) · ⑧ `multi-house-surcharge-validate.ts`(1주택 단계 검증 전부 + 중과 축 leaf · 가액기준 행 기준시가) · 술어 leaf `surcharge-price-criteria.ts` | VC-0~6 · MH-P8 · SM-1~3 · mutation 12/12 |
| P6b ✅ #2441 | 라우트 `app/calc/multi-house-surcharge/`(page · `MultiHouseSurchargeCalculator` · `steps/StepResult` — 결과는 **최소 표시**: 범위 밖 사유·설명문 ①~⑥·확인 필요·고지. 표·세율 영향·비과세 요약·넘기기는 P7) · `MultiHouseSurchargeSidebar`(1주택 요약 + 양도일 조정대상지역 입력값 + 결과 echo 중과 주택 수) · 교차 링크는 **중과 → 1주택 한쪽만**(1주택 → 중과 링크는 결과 뷰가 완성되는 P7에서 — 그 전엔 미완 결과 화면으로 들어오는 경로를 만들지 않는다) · 이력 자동저장 없음(D4) | CI-1~7(11건) · mutation 9/9(점프 관문 단독 무력화는 결과 단계 마지막 관문이 같은 결과를 내는 이중 방어 — 둘 다 끄면 CI-3 실패) · 브라우저(Playwright): 전주 완산구+강남 2채 → M1 차단 배너 → 4억 입력 → 본문 양도 주택 행 400,000,000 → 3주택 이상 중과 설명문 · 375px 가로 스크롤 0 |
| P7 ✅ #2442 | 결과 뷰 `MultiHouseSurchargeResultView`(고지 → 결론 → D1 표 `SurchargeHouseTable` → D1 상세 `SurchargeSellingDetail`(설명문 번호·결론 단계·`LawArticleModal`·확인 필요) → D3b `SurchargeRateImpactCard` → D3a `ExemptionSummaryCard`(`oneHouseVerdictOf`) → 인쇄 · D3d 「이 사실로 양도세 계산」) · 1주택 → 중과 교차 링크 · 두 메뉴 초기화·홈 확인 문구 · 사유 라벨 표 export 재사용(`MultiHouseSurchargeDetailCard`) · 표 요약은 응답 echo(F-8). 권리 양도(V-5)는 종전대로 범위 밖 사유 + 비과세 요약만 | RV-1~9(12건) · CI-8·9 · E2E `multi-house-surcharge-flow.spec.ts` MHF-1~3 · mutation 17/17(동치 2건 — 선택 주택 맨 앞 조건·정렬은 응답 순서와 같아 코드 삭제) · 브라우저: 라이트·다크·375(머리줄 세로 눌림 → 좁은 화면 2줄로 정정) |
| P8 ✅ | 선택 단계 ⑤ `StepSimulation`(취득가액·필요경비 합계 → 「세액 비교하기」) · `SurchargeSimulationCard`(판정대로 A / 중과가 없다면 B / 차액) · route `simulation` 블록 + `surcharge-simulation.ts`(`calculateTransferTax` ×2, B = `forceNoMultiHouseSurcharge`) · store 슬롯 `simulationInput` · 세율 로드 분리(`loadJudgmentRateMap`) — §4.7 구현 정밀화 | MH-P6 S-1~9 · SS-1~7(10건) · E2E MHF-4 |
| P9 ✅ | 전환(D6) `lib/calc/swap-selling-house.ts`(사용자 결정 2026-10-23: **주택 속성은 옮긴다** — 대응표 V-6) · 표 ⑤ 다른 행 버튼 → `ConfirmDialog`(F-9 문구) → `updateFormData` 한 번 · ② 단계로 이동 + 「옮길 칸이 없어 비운 입력」 고지(값이 있던 것만) · 홈 카드(1주택 판정 옆, rose ⚖️, `?new=1`) · E2E는 새 파일 대신 `multi-house-surcharge-flow.spec.ts`에 모음(MHF-5 홈 카드 새 건 · MHF-6 전환→재판정) | SW-1~6(12건 · 「옮김」 칸 왕복) · SWP-1~3 · MHF-5·6 · 홈 레이아웃(V-8) · mutation 14/14 + 대응표 컴파일 가드 · 브라우저 라이트·다크·375 |

- `lib/stores/**`·`lib/tax-engine/**` 변경 PR은 pre-push 전체 테스트가 돈다.
- 각 PR은 수동 2단계 머지(PR → `gh pr checks` 롤업 conclusion 확인 → merge).
- 800줄: `one-house-exemption-validate.ts`(744)·`OneHouseJudgmentResultView.tsx`(509)는 건드리지 않는다. `transfer-tax-judgment-steps.ts`(608)·`multi-house-surcharge.ts`(622)에는 export·플래그 몇 줄만.

## 9. 위험·함정

| # | 위험 | 방어 |
|---|---|---|
| R1 | 입력을 바꿨는데 결과가 옛 판정 | T7 — 같은 `set`에서 두 슬롯 무효화 |
| R2 | 홈 카드가 다른 메뉴 입력을 지움 | D5 — 홈은 새 건으로 명시, 교차 링크, 확인 문구 |
| R3 | UI 통과 ↔ validate 차단 모순 | 위젯·전송·validate가 같은 게이트 함수 호출 · 유예 게이트는 파생 주택 수 |
| R4 | 간이 판정을 정밀 판정처럼 보이게 함 | 「(간이)」 표시 · 민감도 확인 필요 · 전환 버튼 |
| R5 | 1주택 메뉴에서 안 보이는 중과 값이 남음 | 1주택 body는 중과 축을 보내지 않음 → **현재 이를 지키는 테스트 0건(P-2 실측)** → MH-P8 신규 필수 |
| R6 | 반사실 입력이 다른 판정을 오염 | T3 내부 플래그 · `houses` 삭제·`isRegulatedArea` 끄기 금지(일시적 2주택 기한 판정에 쓰임) |
| R7 | 설명 문구가 법령 리터럴을 새로 만듦 | 엔진 `detail` 인용 · 신규 인용은 상수+매니페스트 |
| R8 | 공유 컴포넌트 `menu` prop이 기존 단언을 뒤집음 | 기본값 `one_house` · 호출부 무변경 |
| R9 | 숨김 해제가 다른 입력을 새로 노출 | 풀기 대상별 「유일 입력 경로」 전수 확인 |
| R10 | 미래 양도일 | 조정대상지역·유예 데이터는 오늘까지의 고시만 반영 — 고지 |

## 10. 미검증 (V-n) — 해당 PR 착수 전 해소

| ID | 내용 |
|---|---|
| V-1 | ✅ **해소(2026-10-22, P3a)** — 술어 호출부 4곳: `transfer-tax-rate-calc.ts`(세율 축)·`transfer-tax-redevelopment-steps.ts`는 `TransferTaxInput`을 통째로 넘겨 자동 전달(`calcTax` 입력은 모든 경로에서 `effectiveInput` spread — `transfer-tax.ts:517·717`·`transfer-tax-redevelopment.ts:339`). `transfer-tax.ts`(장특 축) 리터럴만 명시 전달이 필요해 넣었다(빠지면 FN-2·FN-3 실패 — mutation 실측). `transfer-tax-mixed-use.ts`는 별도 입력 타입(`MixedUseAssetInput`)이고 D8(매매·실가·단일 주택)이 겸용 시뮬레이션을 범위 밖에 두므로 플래그를 넣지 않는다(쓰는 호출자 없는 필드 금지). 술어를 우회해 정밀 결과를 직접 읽는 곳은 안내문 2곳(`transfer-tax.ts:278·299`)뿐 — 세액 무관. B = 「중과 없는 세대 구성」 세액은 FN-2(명부)·FN-3(명부 없음 fallback)로 실측 |
| V-2 | ✅ **해소(2026-10-22, P3b)** — ④ `buildHousesPayload`의 양도 주택 전용 칸을 `HouseInfo` 필드 전수와 대조: 양도 행위 사실은 **11호 공고 전 매매계약 `contractDate`·`saleDepositReceived` 둘뿐**이다. 나머지(사원용·저당권·문화유산·어린이집·조특법 감면 선언·장기임대·3호/7호·상속·소재지)는 주택 속성 — 보존. 12의2 나·다목(`gracePeriod`)·§155 의제·감면 배제 주입(`surchargeExclusionByReduction`)은 `HouseInfo` 밖 입력이라 간이 판정이 넘기지 않는다(주입은 STEP 0.5가 `sellingId`에만 하므로 집합 `rawHouses`에 남지 않는다) |
| V-3 | ✅ **해소(2026-10-22)** — `transitionExemptionMonths`를 전국 시군구(256)에 돌린 결과 6개월 = 서울 21구 + 경기 12곳, 4개월 = 강남·서초·송파·용산. 현행 시행령(MST 290841 · 시행 2026-10-01) §167의3①12의2 나목4) 표와 **정확히 일치** |
| V-4 | 1주택 pipeline의 `generalHouseAcquisitionDate` 미전달이 증여 세대에서 결론을 가르는지(별건) — 🔴 **결론이 갈린다(2026-10-23 실측)**: 동일세대 증여 주택 + §99의4 농어촌주택에서 계산기 비과세 · 판정 메뉴 과세. 수정 계획 → `multi-house-surcharge-menu-residuals.plan.md` §1 |
| V-5 | assets[0]이 입주권·분양권일 때 권리 행 변환의 `rightValue` 출처 — **P4는 범위 밖으로 둠**: 양도 대상이 권리면 `scope.reason = "non_housing_sale"`(§104⑦은 주택 양도 · 자산 게이트)로 답하고 보유 주택별 표는 싣지 않는다. 표를 열려면 이 항목을 먼저 푼다(P7 전) — 막힌 원인(양도 입주권의 「종전 주택의 가격」 칸 없음)과 결정 Q-2 → `multi-house-surcharge-menu-residuals.plan.md` §2 |
| V-6 | ✅ **해소(2026-10-23, P9)** — 대응표 `ROW_FIELD_DISPOSITION`(`lib/calc/swap-selling-house.ts`)이 명부 행 칸 전부(113)에 처분을 둔다. `satisfies Record<keyof HouseEntry, …>`라 칸이 늘면 컴파일이 실패한다(한 칸 삭제 실측 → TS1360). **옮김**: 소재지·좌표·법정동코드·지구·PNU · 취득일(+분리 OFF 토지 취득일 거울) · 양도 당시 기준시가(`officialPrice` ↔ `standardPriceAtTransfer`) · 상속(`isInherited`·상속일·수유자·피상속인 동일세대·동거봉양 합가·순위 배제 ↔ `acquisitionCause`·`inheritanceDate` 등) · 같은 이름의 배제 사실 15칸(4·8·8의2호 · §167의10①3·7호) · 문화유산(행 `oneHouseCulturalHeritage` ↔ `isCulturalHeritage` — 엔진 같은 필드) · 장기임대(`RentalDeclaration`은 행 칸의 Pick) · 조특 감면 임대(공유 칸은 `effectiveSellingTaxIncentiveRental` 유효 사실). **비움+고지**: 행에만 있는 칸(1주택 판정용 상속 세부·농어촌·§155⑧·조특 주택 수 제외·인구감소지역·미분양·배우자·같은 날 양도·§155① 취득 경위(「일반 취득」 제외)·아파트 여부(임대로 옮겨지지 않을 때)) · 양도 주택에만 있는 것(조특 감면 중과 배제 선언 · 11호 공고 전 매매계약) · 양도 행위 사실(예상 양도가액·거주기간·§155 특례·§154① 단서·최종 1주택 재기산·한시 유예 나·다목). 세대 사실(세대·양도일·권리 목록·혼인일·동거봉양 합가일·비거주 사실)은 남긴다 |
| V-7 | ✅ **해소(2026-10-22, P6a)** — 계산기 단건 매매·실가 경로(`CompanionSaleModeBlock` `singleMode` actual)는 양도가액 칸만 그리고 양도 당시 기준시가 칸이 없다(환산취득가를 켰을 때만 `CompanionAcqStdPriceSection`이 받는다). ④는 양도 주택 행 `officialPrice`에 0을 싣고(`transfer-tax-api-houses.ts:142`), 엔진은 0을 「3억 이하」로 읽는다(`resolveLowPriceLocalHouse`). ⇒ 판정 메뉴는 M1 칸을 두고 가액기준이면 ⑧로 막는다(VC-0이 엔진 동작을 고정). 🔴 **계산기 별건**: 같은 공백이 계산기 세액을 낮춘다 — 전주 완산구(2021-06-01 조정 · 가액기준) 양도 주택 + 강남 2채, 기준시가 비움 → 2주택·중과 없음 51,183,000 / 4억 → 3주택 이상 중과 126,390,000(계산기 ⑧ 무경고). 별도 PR로 다룬다 → 계획서 `calc-selling-house-std-price-value-region.plan.md` |
| V-8 | ✅ **해소(2026-10-23, P9)** — 14개(lg 4열 4행 그대로) 1280×720에서 마지막 카드(법령 리서치) 하단 713.25px ≤ 720. 단언 완화 없음 |
| V-9 | ✅ **설명문 부분 해소(2026-10-22, P3c)** — §167의3①1호(수도권·광역시·특별자치시 중 광역시 군·읍·면 제외 밖 · 양도 당시 기준시가 3억) · 12의2 가·나·다목(MST 290841 실독 · §167의10①12의2 등 네 호 문언 같음 — 매니페스트 기존 기록)을 원문 대조했다. 신규 상수는 `SURCHARGE_TRANSITION.BASIS_A`(가목) 하나 — 조(§167의3·§167의10)는 매니페스트 등록분. **위기 취득 특례(2009.3.16.~2012.12.31. 취득)는 부칙 조문을 인용하지 않는다** — 법률 제9270호 부칙 제14조 원문(2009.1.1. 시행본)은 「이 법 시행 후 2010년 12월 31일까지 취득한 주택」·§104①2호의3~6 대상이라 현행 엔진 창(2009.3.16.~2012.12.31.)과 다르고, 그 뒤 개정 부칙 원문을 확보하지 못했다. 설명문은 기간·효과(세율만 기본세율, 장특 배제는 따로)만 쓴다. 메타데이터(P6) 인용은 남은 범위 — 남은 범위는 페이지 메타데이터 인용(영 §167의4·§167의11 누락) → `multi-house-surcharge-menu-residuals.plan.md` §3 |
| V-10 | 8호의2 연혁 — ✅ **해소(2026-10-22, DRF 시행본 대조)**. 6개월 요건은 2006.2.9. 개정(MST 72871)부터 모든 시행본에 있다(2005.12.31. 신설본 MST 72432에는 없음 — 범위 밖). 가·나목(인가·위탁) 구분·「고유번호」·합산 후단은 **대통령령 제32420호(2022.2.15., MST 240311)** 에서 들어왔고 별도 적용례가 없어 부칙 §2②(「양도소득세에 관한 개정규정은 시행일 이후 양도하는 경우부터」) — **2022.2.15. 이후 양도분**부터다. 그 전 시행본은 「인가 받은 **가정어린이집**」(2011.12.8. 전 「가정보육시설」)만 대상이다. ⇒ 설계 영향: 6개월 요건은 연혁 게이트 없이 적용(2009.3.16. 이후 범위 전부). 종류 한정·합산 시기는 신규 필드 없이 **사용 기간 칸 안내**로 둔다(자기 선언 칸 — 4호 특수관계인 제외와 같은 층위) |

---

## 11. 자가 검토 (plan-design-self-review-loop v4 · 2026-10-22)

### 11.1 깊이·산출물 판정

- **깊이 L3** — D7(보유 주택 행 4호·8호·8호의2)과 계산기 넘기기 수정(§5.7)이 **계산기 세액**을 바꿀 수 있고, 8호의2 엔진 결함(F-4)이 법령 판정을 가른다.
- **산출물 게이트**: 조건 1(여러 PR — P0~P9)은 충족한다. 그러나 엔진·UI 설계가 이미 이 계획서 §4·§5에 있고, 별도 `.engine/.ui.design.md`를 만들면 같은 내용이 두 곳에 생긴다(dual-truth). ⇒ **STEP 5~9·12~13 생략**. 대신 각 PR 착수 시 그 PR의 세부(V-n 해소 결과·필드 대응표 등)를 이 계획서 해당 절에 덧붙인다.

### 11.2 STEP 0 — 반영한 정책 메모리

`feedback_ui_mode_flag_not_domain_semantics`(§5.3) · `project_judgment_menu_empty_list_is_none`(판정 메뉴 목록 미입력 = 없음 — 중과 메뉴에도 적용) · `feedback_success_only_breakdown_hides_failures`(F-7) · `feedback_early_return_branch_skips_pipeline_stages`(F-5) · `feedback_aggregate_display_rederives_engine_value`(F-8) · `feedback_negative_assertion_needs_mutation_probe`(P-2·MH-P8) · `feedback_ui_gate_removes_sole_input_path`(R9) · `feedback_store_update_must_invalidate_result`(R1).

### 11.3 STEP 1 — 검토 표

| # | 카테고리 | 우선순위 | 위치 | 문제 | 정정 |
|---|---|---|---|---|---|
| F-1 | 오류 | **Critical** | §4.7 · T3 | 「플래그가 서면 중과 결과를 `undefined`로」는 술어 fallback(`transfer-tax-surcharge-predicate.ts:146-151`)으로 **B도 중과**가 된다 | 술어 최상단 게이트 + 호출부 4곳 전달 · MH-P9 |
| F-2 | 오류 | High | §5.7 | 「1주택 메뉴에서는 그 값이 항상 비어 있다」 — 입력 공유(D2)에서 거짓 | 「판정 폼에 중과 값이 없으면 종전과 같다」로 정정 |
| F-3 | 누락 | High | §9 R5 | 「1주택 결론 불변」을 지키는 테스트 **0건**(P-2 실측) | MH-P8 신규 필수 |
| F-4 | 누락(법령) | High | §5.4 · 엔진 `multi-house-surcharge-exclusion.ts:72` | 8호의2 「사용하지 않게 된 날부터 6개월 미경과」·가·나목 합산 요건 미구현(과소과세) — D7이 범위를 넓힘 | Q-A |
| F-5 | 누락 | High | §4.3 | 행 간이 판정이 `runMultiHouseSurchargeStep`의 집합 조립(§155⑳ 임대 호·5호 연결·3호 고지)을 건너뜀 | 조립부 export·재사용 · MH-P10 |
| F-6 | 누락 | Medium | §4.3 · §5.5 | 표 ⑤의 「같은 양도일 가정」 미표기 | 머리글·설명 첫 줄에 명시 |
| F-7 | 누락 | Medium | §4.5 | `headline.warnings`(판정 불가 고지)가 설명·확인 필요로 가는 경로 없음 | 전건 싣기 · 배제 없음도 서술 |
| F-8 | 정책위반 | Medium | §6 ⑥ | 사이드바가 결과 전 「중과 주택 수」를 표시 — UI 재계산 | 결과 echo만 |
| F-9 | 누락 | Medium | §4.3 전환 | 전환이 공유 폼을 바꿔 1주택 메뉴에도 반영 — 고지 없음 | 확인 대화상자 |
| F-10 | 누락 | Medium | §4.3 · V-2 | assets[0]이 「다른 주택」일 때 11호·12의2 나·다·감면 배제 주입 같은 양도 행위 사실이 남음 | 속성/행위 사실 분류 후 제거 |
| F-11 | 오류 | Low | §5.5 | `LawArticleModal` 위치 미기재 | `components/ui/law-article-modal.tsx:114` |
| F-12 | 오류 | Low | §4.2 | `one-house-exemption-api.ts:117-120` | `:118`(호출 `:113-119`) |

인용 실측(문제 없음): `runMultiHouseSurchargeStep` `transfer-tax-judgment-steps.ts:410` · `forceFlatRate20` `types/transfer.types.ts:1200` · `isMultiHouseSurchargeSuppressed` `transfer-tax-api-helpers.ts:30` · `isMultiHouseLthdExclusionEra` 호출 `transfer-tax-lthd.ts:176` · 엔진 반환 경로 `multi-house-surcharge.ts:316·332·353·386·435·508` · `withDerivedHouseCount`·`deriveJudgmentHouseCount`·`computeOneHouseJudgmentSummary`·`HousingStdPriceLookupField`·`SELLING_HOUSE_ID`·`toTransferFormPatch` 실재.

### 11.4 착수 전 mutation probe (실측)

스크립트: scratchpad `mutation-probe.sh`(bash 3.2 · trap 원복 · 종료 후 `git status` 깨끗함 확인).

| P | 무력화 | 실행 범위 | 결과 | 해석 |
|---|---|---|---|---|
| P-1 | `one-house-judgment-handoff.ts:151-152` 삭제(중과 값 지우기 제거) | 관련 22파일 357건 | **2건 실패** — `handoff-patch-keys-s11-7.anchor.test.ts` | 안전망 실재. §5.7 변경 뒤에도 두 단언은 통과해야 한다 |
| P-2 | `one-house-exemption-api.ts:118` `undefined` → `form.sellingHouseExclusion` | 관련 54파일 643건 | **0건 실패** | 🔴 안전망 0 → MH-P8 필수 |
| P-3a | `HousesListSection.tsx:718` → `{true}` | 관련 47파일 540건 | 1건 — `tax-incentive-rental-3ho-inputs.test.tsx` 「판정 메뉴: 편집 창을 열어도 3호 칩 없음」 | P0 승격 후에도 1주택 메뉴 값 보존 단언 |
| P-3b | `HousesListSection.tsx:720` → `{false}` | 같음 | 1건 — `one-house-contested-dual-view.anchor.test.tsx` 「판정 메뉴 Step2 편집 창에는 있고, 계산기 명부 편집 창에는 없다」 | 같음 |

**구현 후 mutation (P-n 계획)**

| P | 무력화 대상 | 실패해야 할 anchor |
|---|---|---|
| P-4 | 술어 최상단 `forceNoMultiHouseSurcharge` 게이트 | MH-P6·P9 |
| P-5 | `transfer-tax.ts:585` 리터럴의 플래그 전달 | MH-P9(장특 축만) |
| P-6 | 행 판정의 집합 조립 재사용 → 원시 `houses` | MH-P10 |
| P-7 | 중과 body의 `sellingHouseExclusion` 전달 | MH-P4 |
| P-8 | D7 `buildOtherHousesPayload` 4호·8호·8호의2 변환 | D7 행 판정 anchor |
| P-9 | `updateFormData`의 `surcharge` 슬롯 무효화 | store 슬롯 테스트 |
| P-10 | `buildMultiHouseSurchargeApiBody`의 유예 게이트 파생 주택 수 | 3중 패턴 anchor |

### 11.5 판정 뒤집힘

1. **F-1** — 반사실 방식(「결과 undefined」 → 「술어 게이트」). 그대로 구현했다면 시뮬레이션이 「중과 시 세액 = 비중과 시 세액」을 내 차액 0으로 보였을 것이다.
2. **F-2** — 「1주택 넘기기 결과 불변」의 전제(값이 항상 비어 있음)가 입력 공유로 무너짐.
3. **P-2** — 「1주택 결론 불변」이 지켜지고 있다는 암묵 전제가 실측으로 0건.

### 11.6 결정 게이트 Q-n

| ID | 질문 | 선택지와 달라지는 것 | 상태 |
|---|---|---|---|
| Q-A | 8호의2 엔진 결함(6개월 요건·가·나목 합산)을 어떻게 다룰까 | (a) **P1에 포함** — 행·양도 주택에 「어린이집 사용 종료일」(사용 중이면 비움)을 받고 엔진 요건을 법문대로. 양도 주택 경로 세액도 바뀐다(과소과세 정정). 「사용 종료일」은 Zod·route·엔진 타입에 없는 **신규 필드**라 14지점 전부(⑫⑬⑭ 포함) 동기화 필요 (b) 별건 PR로 먼저 (c) 이번엔 D7에서 8호의2를 빼고 4호·8호만 | ✅ 2026-10-22 사용자 결정 **(a) P1에 포함** |

### 11.7 verdict

- 미해소 High: 0 — F-4는 Q-A (a)로 결정·본문 반영. F-1~F-12 전건 본문 정정.
- ~~미해소 V-n: V-1(일부)·V-2·V-3·V-4·V-5·V-6·V-7·V-8·V-9 — 모두 **해당 PR 착수 전** 해소 대상이며, 방향을 바꾸는 것은 Q-A뿐이다.~~
- ~~⇒ **`needs-fix`** — 방향을 가르는 결정은 모두 끝났다. 남은 V-n은 PR별 착수 조건이다(P1 착수 전 V-10, P3 전 V-1·V-2·V-3, P4 전 V-4·V-5, P6 전 V-7, P9 전 V-6·V-8, 인용 문구 확정 전 V-9). P0은 바로 착수 가능.~~
- **갱신(2026-10-23, P0~P9 전건 머지 후)**: V-1~V-3·V-6~V-8·V-10 해소 · V-9 부분 해소. 남은 V-4(🔴 결론이 갈림 — 실측)·V-5·V-9 잔여는 후속 계획서 `multi-house-surcharge-menu-residuals.plan.md`로 넘겼다. 이 계획서의 범위(P0~P9)는 완료다.
