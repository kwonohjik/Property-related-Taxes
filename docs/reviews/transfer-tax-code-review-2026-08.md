# 양도소득세 코드 리뷰 — 2026-08

> 이 저장소에서 **양도소득세가 받은 첫 전면 코드 리뷰**다. `docs/reviews/`에는 종전까지 증여세·상속세(2026-06) 두 건만 있었고, 양도세가 받은 것은 전부 특정 축을 겨눈 표적 감사(취득가액·감면·엔진 findings)였다.

## 1. 범위와 방법

| | |
|---|---|
| **베이스** | `master` @ `52c1180d` (워크트리 `transfer-code-review`) |
| **대상** | 부동산 양도소득세 **566파일 137,151 LOC** — 엔진 219파일 55,229 / 변환·검증·Zod·Route·스토어 110파일 27,614 / UI·결과뷰·신고서식 237파일 54,308 |
| **제외** | 주식양도세 110파일 29,979 LOC(최근 #1218·#1221~#1228로 집중 정비) · 재개발·재건축·입주권 축(**별도 최종 패스**) · 증여·상속 공용 스택 105파일 24,329(읽기만, 수정 금지 — `burdened-gift-apportionment.ts:34`의 `import { calcGiftTax }` 한 줄로 연결) |
| **절단 방식** | 계층이 아니라 **축**. 14 동기화 지점이 계층을 가로지르므로 계층으로 자르면 이 저장소가 반복 재발시킨 결함 유형(입력 UI 없는 API 트리거 / 결과뷰 일부만 배선 / validate↔API fallback 불일치)을 구조적으로 못 본다 |
| **1단계** | 13축 × 6계층(엔진→`lib/calc`→Zod→Route→UI→결과) 세로 훑기. 각 축이 throwaway probe로 자체 실증 |
| **2단계** | 후보 45건(High+Medium)에 **적대적 검증** — 검증자의 기본 임무는 반박이고 확신이 없으면 기각이 기본값. `must` 10건은 KoreanLaw MCP로 조문 본문을 독립 확인 |

**무감사 구간**: 직전 감사(R7) 베이스라인은 2026-07-14다. 그 이후 양도세 경로에 **634커밋 606파일**이 들어갔고 `docs/00-pm/recent-completions.md`는 2026-07-06에서 멈춰 있어 문서로는 파악되지 않는다.

## 2. 결과 요약

| | 건수 |
|---|---|
| 1단계 후보(병합 후) | 58 |
| 2단계 검증 대상(High+Medium) | 45 |
| **CONFIRMED** | **36** |
| **PARTIALLY_CONFIRMED** (범위·수치 정정) | **8** |
| REFUTED | 1 |
| 법령 독립확인(`must` 10건) | CONFIRMED 7 · PARTIALLY 3 |
| **생존 확정 결함** | **44** (High 25 · Medium 16 · Low 3) |
| Low(미검증, 문서화만) | 13 |
| 미구현 → 백로그 분리 | 12 |
| 재제안 금지 위반으로 폐기 | 0 |

### 🔴 이 리뷰의 가장 중요한 부수 결론 — 안전망이 없다

`__tests__/tax-engine/transfer/` **123파일 1,080테스트가 전건 green인 상태에서 58건이 나왔다.** 13축 전원이 "기존 anchor가 이 결함을 보지 않는다"고 독립 보고했고, 2단계 검증에서 **현행 동작을 고정하는 테스트가 존재하는 것은 3건뿐**(F11·F26·F36)으로 확인됐다. 나머지는 고쳐도 red가 나지 않는다.

⇒ **각 수정의 완료 조건에 anchor 신설을 반드시 포함해야 한다.** 수정만 하고 테스트를 안 심으면 다음 기능에서 그대로 되돌아온다.

### 심각도 재조정

적대적 검증이 원 리뷰어의 심각도를 9건 하향했다: high→medium 5 · high→low 1 · medium→low 3. 도달성은 44건이 `reachable-via-ui`, 1건만 validate 차단.

---

## 3. 확정 결함 44건


### High — 세액이 틀린다

#### F01 · 다건·일괄 자산별 세액 재계산이 houses[] 정밀 다주택 판정을 버리고 원시 플래그로 §104⑦ 중과를 되살린다

| | |
|---|---|
| 위치 | `lib/tax-engine/transfer-tax-aggregate-helpers.ts:338` |
| 판정 | **CONFIRMED** |
| 심각도 | **high** |
| 도달성 | reachable-via-ui |
| 탐지 축 | core / rate |
| 조치 | 배치 3 |

**결함**

aggregateByGroup의 assetTaxOf(:336-345)가 resolveSplitAwareTax ctx에 multiHouseSurchargeResult를 넣지 않는다(직접 확인: ctx 키는 taxBase·transferIncome·basicDeduction·splitDetail·parsedRates·taxRateInput 6개). optional 필드라 TS가 못 잡고, calcTax(transfer-tax-rate-calc.ts:308-312·421-426)가 원시 플래그(housing && isRegulatedArea && householdHousingCount>=2)로 중과를 재판정한다. classifyRateGroup:121-131의 multiHouseByInput도 같은 원시 축이라 그룹 라벨과 실제 세율이 어긋난다. §104⑤ 버킷 병합 세액(:464·:557 calcTax)도 동일.

**실패 시나리오**

조정대상지역 주택 1건(양도 9억·취득 4억·2015-01-01 취득), householdHousingCount=3, houses[] 중 2채가 2023년 상속(영167의3 배제) → 단건 effectiveHouseCount=1·appliedRate 0.4·totalTax 150,766,000. 같은 자산 1건만 담은 다건은 rateGroup=multi_house_surcharge·appliedRate 0.7·totalTax 285,241,000(산출세액 +122,250,000 과대). 반대로 원시 isRegulatedArea=false + houses[] regionCode 11680(지정 미해제) 조합에서는 단건 184,060,000 vs 다건 94,060,000으로 90,000,000 과소.

**검증자 재현 실측**

[A] 원 수치 정확 재현(makeMockRatesWithHouseEngine, 양도 2024-06-01, 취득 2015-01-01, 양도가 900,000,000·취득가 400,000,000, householdHousingCount=3, houses 3채 중 2채 2023-03-01 상속, regionCode 1168010100): 단건 LTHD 90,000,000·과세표준 407,500,000·appliedRate 0.4·산출세액 137,060,000·**totalTax 150,766,000**(effectiveHouseCount=1) vs 1건 다건 rateGroup=multi_house_surcharge·appliedRate 0.7·산출세액 259,310,000·**totalTax 285,241,000** ⇒ 산출세액 **+122,250,000**(=407,500,000×0.30) 과대 — 주장과 완전 일치.
[B] 실제 seed(loadFallbackTransferRates) 재현: 양도 2026-06-01(한시배제 창 밖) 단건 141,966,000(rate 0.4, 산출 129,060,000) vs 다건 269,841,000(rate 0.7, 산출 245,310,000) ⇒ 산출세액 +116,250,000·총부담 +127,875,000. 같은 입력 양도 2026-04-01(창 안)은 단건=다건 141,966,000으로 **차이 0** — 원시 경로도 suspended라 은폐된다.
[C] 역방향(원시 isRegulatedArea=false + houses regionCode 지정): 단건 산출 322,310,000(rate 0.7·LTHD 0·surchargeType multi_house_3plus·isRegulatedAtTransfer=true) vs 다건 173,060,000(rate 0.4) ⇒ **149,250,000 과소**(=497,500,000×0.30). 원 주장의 184,060,000/94,060,000(Δ90,000,000)은 과세표준 300,000,000 전제의 같은 산식(과세표준×0.30)으로, 내 입력에선 다른 절대값이 나왔을 뿐 방향·기전은 동일.
[D] 대조군: 동일 입력에서 houses/sellingHouseId만 제거 → 단건·다건 모두 322,310,000으로 일치(원인 격리).
[E] 그룹 라벨 오분류는 창 안에서도 발생 — 정밀 effectiveHouseCount=1인데 groupTaxes[0].group="multi_house_surcharge".

**제안 수정**

AssetRecord에 단건 호출이 만든 MultiHouseSurchargeResult를 보존해 assetTaxOf·:464·:557의 calcTax에 그대로 전달하고(자산 result에서 재도출하면 dual-truth), classifyRateGroup의 multiHouseByInput은 정밀 결과가 있을 때 쓰지 않도록 좁힌다 — transfer-tax.ts:454-458이 이미 「정밀 결과가 정본, 없을 때만 원시 fallback」 규약을 구현한다. rate 축이 transfer-tax-redevelopment.ts:210도 같은 4번째 인자 누락 형태라고 보고했다(재개발 최종 패스로 전달).

**수정 위험**

낮음~중간. (a) 회귀 위험 낮음 — 현행 aggregate 테스트 중 houses[]를 주는 것이 **0건**이라(`grep -rln houses __tests__/` 결과 aggregate 계열 전무) mh를 넘겨도 기존 케이스는 undefined 그대로라 계산이 바뀌지 않는다. 즉 지금 이 동작을 고정하는 테스트가 없다(안전망 0 — 「기존 전건 green」 주장 확인). `AssetRecord`는 `transfer-tax-aggregate.ts:132`에서만 생성되고 characterization 테스트(`transfer-tax-loss-offset-characterization.test.ts:41-47`)는 `as unknown as AssetRecord` 캐스팅이라 필드 추가에 깨지지 않는다. (b) 배관 비용 — `TransferTaxResult.multiHouseSurchargeDetail`(types/transfer-result.types.ts:232-242)에는 surchargeApplicable·surchargeType·isSurchargeSuspended가 **없어** result에서 재구성이 불가능하다. 따라서 단건 엔진이 `MultiHouseSurchargeResult`를 밖으로 내보내거나(신규 필드·옵션) aggregate가 `runMultiHouseSurchargeStep`을 다시 부르는 배선이 필요하다 — 후자는 이중 판정(dual-truth) 위험. (c) 블라스트 반경 — classifyRateGroup의 multiHouseByInput을 좁히면 houses[] 케이스의 rateGroup이 바뀌고, rateGroup은 §102② 통산 범위(loss-offset-core rateKey)와 `allocateBasicDeduction` groupPriority(:231-237)에 직결되므로 세액이 함께 움직인다. 수정 시 houses[] 다건 anchor를 신설해 ①창 밖 양도 ②역방향(regionCode) ③통산·기본공제 배분까지 고정할 것.

---

#### F02 · 다건 route ⑭가 similarSalesValue를 매핑하지 않아 매매사례가액 모드 취득가액이 0이 된다

| | |
|---|---|
| 위치 | `app/api/calc/transfer/multi/route.ts:203` |
| 판정 | **CONFIRMED** |
| 심각도 | **high** |
| 도달성 | reachable-via-ui |
| 탐지 축 | core / multi / plumbing |
| 조치 | 배치 2 |

**결함**

다건 route의 인라인 96키 매핑(:101-268)이 acquisitionMethod(:202)·appraisalValue(:203)는 옮기면서 similarSalesValue는 옮기지 않는다. ⑫Zod(lib/api/transfer-tax-schema.ts:187 propertyBaseShape)는 수락하고 ⑬(lib/calc/multi-transfer-tax-api.ts:114)은 실제 전송하므로 전형적 침묵 stripping. 엔진(transfer-tax-helpers.ts:347)은 salesCase에서 `input.similarSalesValue ?? input.acquisitionPrice`를 쓰는데 클라이언트가 salesCase일 때 acquisitionPrice를 0으로 보내(:95-99) 취득가액이 통째로 0이 된다. validateMultiSupportedMode는 salesCase를 차단하지 않고, 다건 StepEdit이 단건 마법사를 임베드해 라디오가 그대로 노출된다.

**실패 시나리오**

토지 양도가 10억·매매사례가액 6억·2015-06-01 취득. 단건 route: transferGain 400,000,000 / totalTax 118,206,000. 다건 route(동일 payload): transferGain 1,000,000,000 / 결정세액 266,460,000~305,343,600(축별 입력 차) — 약 177,910,000~223,356,760 과대. 화면에는 사용자가 입력한 매매사례가액이 그대로 보이고, 결과 표시 acquisitionPrice는 환산 역산식(aggregate.ts:487-491) 때문에 4억으로 떠 자기모순이 된다.

**검증자 재현 실측**

시나리오: 토지, 양도가 1,000,000,000(2025-06-01), 매매사례가액 600,000,000, 취득 2015-06-01, 1세대1주택 아님, 기준시가 미입력. makeMockRates 사용.
- 단건 route POST /api/calc/transfer → 200: transferGain 400,000,000 · usedEstimatedAcquisition true · estimatedBase 600,000,000 · LTHD 72,000,000(18%) · taxBase 325,500,000 · determinedTax 104,260,000 · localIncomeTax 10,426,000 · totalTax 114,686,000.
- 다건 route POST /api/calc/transfer/multi(동일 payload+propertyId/Label) → 200: totalTransferGain 1,000,000,000 · LTHD 180,000,000 · taxBase 817,500,000 · calculatedTax=determinedTax 307,410,000 · localIncomeTax 30,741,000 · totalTax 338,151,000 · properties[0].acquisitionPrice 0 · necessaryExpense 0.
- 과대분: 결정세액 +203,150,000 / 총부담세액 +223,465,000 (원 주장 범위 177,910,000~223,356,760의 상단과 사실상 일치).
- 대조군(동일 취득가액 6억을 actual 모드로 다건 호출): totalTransferGain 400,000,000 · determinedTax 104,260,000 · totalTax 114,686,000 → 단건과 완전 일치.
- 수정 시뮬레이션(calculateTransferTaxAggregate에 similarSalesValue 600,000,000 주입): totalTransferGain 400,000,000 · determinedTax 104,260,000 · totalTax 114,686,000 → 단건 parity 회복. 동일 입력을 appraisal 모드로 돌린 결과도 400,000,000 / 104,260,000으로 동일.
- 키 diff: payload의 정의된 키 19개 중 route에 매핑 없는 키 = similarSalesValue 1건.
- 원 주장 단건 118,206,000과 내 114,686,000의 차이는 부수 입력(기준시가·NBL 등) 차이일 뿐 방향·자릿수는 동일.

**제안 수정**

multi/route.ts base 객체에 `similarSalesValue: p.similarSalesValue,` 추가(숫자라 Date 변환 불요). 근본적으로는 다건 route의 96키 인라인이 buildTransferEngineInput과 이중 진실이라 재발이 예정돼 있으므로 per-property 매핑을 buildTransferEngineInput 재사용으로 수렴시킬 것. 즉시 반영이 어려우면 validateMultiSupportedMode에 salesCase 차단을 먼저 넣어 침묵 오산을 막는다.

**수정 위험**

낮음. (a) `similarSalesValue: p.similarSalesValue,` 한 줄 추가는 타입 안전 — `lib/tax-engine/types/transfer.types.ts`에 `similarSalesValue?: number`가 선언돼 있고 Zod 파싱값도 number|undefined라 Date 변환 불필요. (b) 회귀 위험 낮음 — `__tests__`·`e2e` 어디에도 `app/api/calc/transfer/multi/route`를 import·검증하는 테스트가 없다(grep 0건, 내 scratch 파일 제외). 현행 동작을 고정하는 테스트가 없다는 것은 "의도된 동작"의 증거도 없다는 뜻이다. (c) 엔진 레벨 시뮬레이션으로 수정 후 값이 단건 route와 정확히 일치함을 확인했고(114,686,000), 이미 매핑된 형제 모드 appraisal과 동일한 결과 형태가 된다. (d) 잔존 표시 이슈: 수정 후에도 다건 결과의 properties[0].acquisitionPrice=0 / necessaryExpense=600,000,000로 취득가액이 필요경비 칸에 뭉쳐 표시된다 — 다만 이는 appraisal 모드에서도 동일하게 나타나는 **선재 표시 특성**이지 이 수정이 만드는 회귀가 아니다(양도차익·세액은 정확). (e) 제안된 후속(96키 인라인을 buildTransferEngineInput로 수렴)은 범위가 크므로 별건으로 분리 권고. (f) 대안으로 제시된 "validateMultiSupportedMode에 salesCase 차단 선행"은 무해하지만, 이미 ⑫⑬이 값을 온전히 전달 중이라 1줄 매핑이 더 정확한 해법이다.

---

#### F04 · 다건 ⑬⑭가 §155④⑤ 합가 게이트·§155⑦ 농어촌·§155⑧ 부득이·§155⑯⑱ 입력을 양쪽에서 버린다

| | |
|---|---|
| 위치 | `lib/calc/multi-transfer-tax-api.ts:178` |
| 판정 | **CONFIRMED** |
| 심각도 | **high** |
| 도달성 | reachable-via-ui |
| 탐지 축 | exemption |
| 조치 | 배치 2 |

**결함**

다건 StepB가 단건 마법사를 그대로 임베드하므로(MultiTransferTaxCalculator.tsx:230) Step4의 TemporaryTwoHouseSection 토글이 전부 렌더된다. 그런데 ⑬ buildPropertyPayload는 marriageMerge(:178)·parentalCareMerge(:179-181)만 싣고 E-3.5의 필수 게이트 isFirstTransferredInMerge를 싣지 않으며, ruralHouse·unavoidableOutsideCapitalHouse를 아예 싣지 않고 temporaryTwoHouse도 두 날짜만 싣는다(§155⑯⑱ 4필드 누락). ⑭ multi/route.ts:101-176에도 세 필드가 없다. validateMultiSupportedMode는 이 조합을 차단하지 않는다(부담부증여·재개발·겸용만 차단).

**실패 시나리오**

다건에서 건1에 혼인합가일 2020-01-01 + 「합가 후 첫 양도」 체크(2주택·양도 5억·2018-01-01→2026-03-01·비조정). buildPropertyPayload 실측: marriageMerge는 실리고 isFirstTransferredInMerge=undefined, validate는 null. 엔진 E-3.5는 `isFirstTransferredInMerge === true`를 요구(transfer-tax-exemption.ts:720)하므로 특례 미발동 → 단건 totalTax 0(비과세) vs 다건 47,245,000. §155⑧ 부득이·§155⑦ 농어촌도 payload에서 undefined로 실측되어 각각 0원 대신 47,245,000이 과세된다.

**검증자 재현 실측**

⑬ payload 실측(buildPropertyPayload 직접 호출):
- marriageMerge: {"marriageDate":"2020-01-01"} (실림)
- "isFirstTransferredInMerge" in payload → false (undefined)
- "ruralHouse" in payload → false (undefined)
- "unavoidableOutsideCapitalHouse" in payload → false (undefined)
- temporaryTwoHouse: {"previousAcquisitionDate":"2018-01-01","newAcquisitionDate":"2020-06-01"} — publicInstitutionRelocation·relocatedSigunguCode·newHouseSigunguCode·disposalDelayReason 4필드 소실
- validateMultiSupportedMode: 네 폼 모두 null (차단 없음)

단건 엔진 델타(주택·1세대·2주택·양도 500,000,000·취득 300,000,000·2018-01-01→2026-03-01·비조정·혼인합가 2020-01-01):
- isFirstTransferredInMerge=true  → isExempt=true,  totalTax=0
- 플래그 미전송(undefined)         → isExempt=false, totalTax=47,245,000
- delta = 47,245,000 (원 주장과 정확히 일치)
- 산식 대조: 양도차익 200,000,000 → LTHD 8년 16% 32,000,000 → 소득금액 168,000,000 → 기본공제 2,500,000 → 과표 165,500,000 × 38% − 19,940,000 = 42,950,000 + 지방세 4,295,000 = 47,245,000

§155⑦ 농어촌(kind=inherited·읍면·피상속인 거주 10년):
- ruralHouse 전송 시 isExempt=true, totalTax=0 / 미전송 시 isExempt=false, totalTax=47,245,000

§155⑧ 부득이(reason=work·resolvedDate 2025-06-01):
- unavoidableOutsideCapitalHouse 전송 시 isExempt=true, totalTax=0

aggregate 경로(위 주택 + 토지 200,000,000/150,000,000 2건 합산, calculateTransferTaxAggregate 직접 호출):
- 플래그 有  → totalTax 4,636,500 (건1 determinedTax 0)
- 플래그 無  → totalTax 63,547,000 (건1 determinedTax 43,900,000)
- aggregate delta = 58,910,500 (합산 누진 이동으로 단건 델타보다 큼)

**제안 수정**

⑬은 단건과 같은 buildHouseholdSpecialPayload(form, primary)를 spread하고 isFirstTransferredInMerge를 추가 전송, ⑭은 인라인 매핑 대신 buildTransferEngineInput 재사용. 전량 통일이 어렵다면 최소한 validateMultiSupportedMode에 이 토글들을 명시 차단으로 추가해 침묵 오산을 막는다(부담부증여·겸용과 같은 규약). 반대 방향 dead surface도 함께 정리: replacementHouse는 ⑭(multi/route.ts:149-155)만 있고 ⑬이 없다.

**수정 위험**

낮음~중간.

⑫ Zod는 변경 불필요(`transfer-tax-schema.ts:138·139·148`이 이미 `propertyBaseShape`에 세 필드를 갖고 `propertyItemSchema`가 이를 그대로 편다). `lib/api/transfer-tax-schema-refines.ts`에는 ruralHouse·unavoidable·isFirstTransferredInMerge·temporaryTwoHouse·replacementHouse를 제약하는 refine이 하나도 없어(grep 0건) superRefine 400 신규 발생 위험이 없다.

⑬ `buildPropertyPayload` 소비자는 `callMultiTransferTaxAPI`(:251) 하나뿐이고 나머지는 전부 테스트다. 현행 동작을 고정하는 테스트는 없다 — `__tests__/lib/calc/multi-transfer-api-sync.test.ts`·`house-region-payload.test.ts`·`multi-transfer-pre1990-support.test.ts` 모두 **특정 키의 존재/값**만 단언하고 이 다섯 필드의 **부재**를 단언하지 않는다. 즉 필드를 추가해도 red가 나지 않는다(= 「의도된 동작」의 테스트 증거가 없다는 뜻이기도 하다).

⑭ 라우트에 매핑을 추가할 때 Date 변환을 빠뜨리면 `Date < string` silent false 함정에 걸린다 — `ruralHouse.acquisitionDate`·`unavoidableOutsideCapitalHouse.resolvedDate`는 `toOptionalDate`로 감싸야 한다(단건 `app/api/calc/transfer/engine-input.ts:111-122`가 정본).

aggregate 재계산 위험은 낮다. `calculateTransferTaxAggregate`는 이미 `temporaryTwoHouse`를 통해 비과세(isExempt) 자산을 다루고 있어 「과세표준 0인 건」이 신규 상태가 아니다. 다만 aggregate가 `income = taxableGain − lthd`로 소득금액을 재산정하므로, 비과세 전환된 건이 빠지면서 **나머지 건의 세율 구간이 내려간다**(probe 실측 63,547,000 → 4,636,500). 이는 §92 합산 과세상 정상 동작이지만, 기존 다건 anchor 중 합가·농어촌 입력이 섞인 것이 있다면 기대값이 바뀐다 — 수정 시 `npm run test:transfer` 전체를 돌려야 한다.

대안(validateMultiSupportedMode에 명시 차단 추가)은 위험이 더 낮고 이 파일의 기존 규약과 동일하나, `marriageMerge`가 이미 전송되고 있어 「지원되던 것을 회수」하는 방향이라 사용자 노출 변경이 생긴다.

---

#### F05 · 다건 ⑬가 공유 지분율(× ratio)을 전혀 적용하지 않아 지분 자산이 100% 기준으로 과세된다

| | |
|---|---|
| 위치 | `lib/calc/multi-transfer-tax-api.ts:91` |
| 판정 | **CONFIRMED** |
| 심각도 | **high** |
| 도달성 | reachable-via-ui |
| 탐지 축 | plumbing |
| 조치 | 배치 2 |

**결함**

buildPropertyPayload(:89-218)는 applyRatio/getOwnershipRatio를 import조차 하지 않는다. transferPrice(:91)·acquisitionPrice(:95-99)·expenses(:103)·capitalExpenditure(:105)·transferExpense(:106)가 전부 폼 원값이고 ownershipRatio도 전송하지 않는다. 폼 규약은 「사용자 입력은 100% 기준, API 변환에서 × ratio」(OwnershipRatioInput.tsx:14)이고 「공유 지분율」 칸은 AssetSectionBasic.tsx:358-374에서 splitMode!==fractional이면 항상 렌더되며 다건 편집도 같은 컴포넌트를 마운트한다. 수신부는 이미 준비돼 있다(multi/route.ts:126 `ownershipRatio: p.ownershipRatio`).

**실패 시나리오**

다건 토지 1건 — 물건 전체 양도가 10억·취득가 4억·2010-03-02 취득·2024-06-01 양도·지분 50%. 현재 payload transferPrice 1,000,000,000·acquisitionPrice 400,000,000·ownershipRatio 키 없음 → 총 결정세액 145,860,000. 단건 규약(×0.5)대로면 61,190,000 — 84,670,000 과대.

**검증자 재현 실측**

probe(`__tests__/_scratch/verify-F05-1.test.ts`, 실행 후 삭제) — 토지, 물건전체 양도가 1,000,000,000 · 취득가 400,000,000 · 취득 2010-03-02 · 양도 2024-06-01 · 지분 50%(ownershipNumerator "50"/denominator "100"), 1세대1주택 아님, `loadFallbackTransferRates(2024-12-31)`.

payload 실측: `"ownershipRatio" in payload = false` · `"totalPropertyTransferPrice" in payload = false` · transferPrice = 1000000000 · acquisitionPrice = 400000000 · expenses = 0 (전부 미축소).

세액 실측(`calculateTransferTaxAggregate`):
- 현행(그대로 전송): determinedTax **145,860,000** · localIncomeTax 14,586,000 · totalTax 160,446,000
- 단건 규약대로 ×0.5 + ownershipRatio 0.5: determinedTax **61,190,000** · localIncomeTax 6,119,000 · totalTax 67,309,000
- 차이 determinedTax **84,670,000** 과대 (총부담 기준 93,137,000 과대)

⇒ 원 주장 145,860,000 / 61,190,000 / 84,670,000과 **완전 일치**.

**제안 수정**

단건(transfer-tax-api.ts:198-206·271-273·287-289·358)과 같은 `getOwnershipRatio`/`makeRatioed`를 도입해 금액 5필드에 적용하고 `ownershipRatio`를 전송(개산공제 base). 도입 전까지는 validateMultiSupportedMode에서 지분율<100%를 명시 차단.

**수정 위험**

회귀 위험은 낮으나 수정 범위는 원 제안보다 넓다.

무해 근거: 자산 기본값이 `ownershipNumerator: "100"` / `ownershipDenominator: "100"`(lib/stores/calc-wizard-asset-factory.ts:115-116, 마이그레이션도 동일 보정 calc-wizard-asset-migrate.ts:407-408)이고 `getOwnershipRatio`(transfer-tax-api-helpers.ts:322-328)가 1.0을 반환하므로, `makeRatioed` 도입은 비-지분 폼에 대해 완전한 no-op이다.

현행 동작을 고정하는 테스트는 없다 — `__tests__/lib/calc/multi-transfer-api-sync.test.ts`·`multi-transfer-pre1990-support.test.ts`에 "ownership"·"지분" 문자열이 0건이라 지분 케이스를 아무도 단언하지 않는다(= 안전망 0건. 수정 시 red가 나지 않으므로 「의도된 동작」 증거도 없고, 동시에 회귀 감지도 못 한다 ⇒ 지분 anchor를 먼저 심어야 한다).

주의점 3가지:
1. **⑭ 동반 수정 필요** — `totalPropertyTransferPrice`를 전송해도 `app/api/calc/transfer/multi/route.ts`가 매핑하지 않아 침묵 stripping된다(현재 파일 내 해당 키 0건). ⑬만 고치면 1세대1주택 고가주택 지분 건의 §95③ 안분이 여전히 틀린다.
2. **transferExpense 이중 안분 주의** — 다건 :78-80은 `directTransferExpense > 0 ? direct : form.totalTransferExpense`인데, 단건(:213-219)은 direct에도 ratio를 곱하고 form-level에도 곱한다. 그대로 옮기지 않으면 한쪽만 축소되는 비대칭이 생긴다. 공용 헬퍼 `buildTransferExpense`(transfer-tax-api-helpers.ts:460-470)가 이미 그 규약을 담고 있으니 재구현 말고 재사용할 것.
3. **개산공제 base는 금액과 규약이 다르다** — 기준시가(standardPriceAtAcquisition/Transfer)는 raw 100% 유지하고 `ownershipRatio`만 넘겨 엔진이 개산공제 지점에서만 적용한다(transfer-tax-api.ts:205-207 주석, types/transfer.types.ts:613). 기준시가에 ×ratio를 같이 걸면 이중 축소가 된다.

임시 차단안(validateMultiSupportedMode에 지분<100% 차단 추가)은 저장소 정책(「침묵 오산보다 명시 차단」, multi-transfer-tax-validate.ts:46)과 정합하지만, 현재 통과하던 입력을 새로 차단하므로 지분 자산이 든 기존 E2E/이력 로드 경로가 있으면 빨개질 수 있다 — `git grep -n ownershipNumerator e2e/`로 사전 확인 권장.

---

#### F07 · §155⑳ 특례의 12억 고가주택 판정이 지분 총 물건가(totalPropertyTransferPrice)를 무시하고 본인 지분 양도가만 본다

| | |
|---|---|
| 위치 | `lib/tax-engine/transfer-tax-rental-housing-step.ts:297` |
| 판정 | **CONFIRMED** |
| 심각도 | **high** |
| 도달성 | reachable-via-ui |
| 탐지 축 | exemption |
| 조치 | 배치 4 |

**결함**

calculateRentalHousingException에 넘기는 S를 `effectiveInput.transferPrice`로 고정한다. 그 S가 rental-housing-exception/index.ts:136·259와 prhp-allocation.ts:142에서 12억 임계 비교와 (S−12억)/S 분모로 쓰인다. 이 저장소의 12억 분모 정본은 `burdenedGiftDenominator ?? totalPropertyTransferPrice ?? transferPrice`(transfer-tax-helpers.ts:404-414 calcOneHouseProration, exemption.ts:753-754, taxable-gain.ts:30-37)이고, 지분 모드는 transferPrice에 지분 안분액을 싣는다(transfer-tax-api.ts:275). 두 경로 사이에 상호배제 게이트가 없다.

**실패 시나리오**

1세대1주택+장기임대 1호, 공유 지분 50% 주택을 총 20억(본인 지분 10억)에 양도(2018-01-01 취득·2026-03-01 양도·취득가 4억·거주 36개월). 특례 OFF: isPartialExempt=true·taxableGain 240,000,000·totalTax 33,797,500. 특례 ON: S=10억≤12억으로 RH-A1(전액 비과세) → totalTax 0 — 33,797,500 과소. 총 물건가가 12억 초과인 모든 공유주택이 이 경로를 탄다.

**검증자 재현 실측**

제보 시나리오(취득 2018-01-01 · 양도 2026-03-01 · 지분 50% · 총 20억 / 본인 10억 · 취득가 4억 · 거주 36개월 · 1세대1주택):
· 특례 OFF: isPartialExempt=true · transferGain 600,000,000 · taxableGain **240,000,000** · totalTax **33,797,500** (제보와 완전 일치)
· 특례 ON : isExempt=true · taxableGain **0** · totalTax **0** → 33,797,500 과소 (제보와 완전 일치, RH-A1)
추가 실측(임대주택을 주택수에 산입한 현실 케이스 householdHousingCount=2):
· OFF: taxableGain 600,000,000 · totalTax **192,159,000** / ON: 0 · **0** ⇒ 192,159,000 과소
본인 지분가만으로 12억 초과(총 40억 · 50% · 본인 20억 · 취득가 4억, 2주택):
· ON(현행): taxableGain **358,400,000** · totalTax 128,062,000 (= 896,000,000 × (20억−12억)/20억 ⇒ S=본인지분가 확정)
· 정본 분모(40억) 적용 시 마땅한 값: 896,000,000 × (40억−12억)/40억 = **627,200,000** ⇒ 과세 양도차익 268,800,000 과소
단독소유 대조군(20억·지분 없음)은 ON에서 taxableGain 268,800,000으로 정상 — 지분 모드에서만 갈린다.

**제안 수정**

S를 `burdenedGiftDenominator ?? totalPropertyTransferPrice ?? transferPrice`로 바꿔 정본 우선순위를 따르게 한다. 분자(gain)는 지분분 양도차익이므로 index.ts의 taxableGain = gain95Table2 × (S−12억)/S가 분모 교체 후에도 성립하는지 RH-A2·RH-B2 anchor로 함께 검증할 것.

**수정 위험**

낮음-중간. (a) 현행 동작을 고정하는 테스트는 **없다** — `rentalHousingException`을 쓰는 테스트 9파일 중 `totalPropertyTransferPrice`/`burdenedGiftDenominator`를 함께 두는 것이 0건이라 수정으로 red가 나는 기존 anchor가 없다. 뒤집으면 **수정 후에도 안전망이 0이라는 뜻**이므로 RH-A1/A2·RH-B1/B2 각각에 지분 anchor를 신설해야 한다(현재 RH 계열 anchor는 전부 단독소유 픽스처다). (b) `calculateRentalHousingException`의 S 인자를 바꾸면 A·B 두 시나리오와 `prhp-allocation.ts`의 B1/B2 분기가 동시에 이동한다 — 특히 B2는 §161② 1·2호 안분과 §161③ cap이 얽혀 있어 RH-B2 anchor 병행 검증이 필수(finding의 지적이 옳다). (c) 우선순위 체인에 `burdenedGiftDenominator`를 넣으면 「부담부증여 주택 × §155⑳」 조합이 새로 활성화된 것처럼 보일 수 있으나, 그 조합은 별도 도달성 확인이 필요하고 미확인이면 `totalPropertyTransferPrice ?? transferPrice`로 좁혀 시작하는 편이 안전하다(확인 필요). (d) 함수 시그니처는 유지되고 호출부가 `transfer-tax-rental-housing-step.ts` 1곳뿐이라(전 저장소 grep: 정의 1 + 호출 1 + 테스트 6파일) 타 세목 파급은 없다.

---

#### F08 · §155⑳ 특례 조기반환 경로가 사용자가 입력한 조특법 감면을 reductionAmount:0으로 하드코딩해 버린다

| | |
|---|---|
| 위치 | `lib/tax-engine/transfer-tax-rental-housing-step.ts:400` |
| 판정 | **CONFIRMED** · 법령 PARTIALLY_CONFIRMED |
| 심각도 | **high** |
| 도달성 | reachable-via-ui |
| 탐지 축 | exemption |
| 조치 | ⏸ **사용자 판단 대기** |

**결함**

applied=true이면 STEP 4.6~7.5(감면 라우터)와 finalizeTransferTax를 건너뛰고 자체 결과를 반환하는데, `const rheDeterminedTax = rheTaxResult.calculatedTax; // 특례 경로 감면 없음`(:400)과 `reductionAmount: 0`(:438)로 감면을 무조건 0으로 고정한다. §155⑳은 12억 초과분 과세가 남으므로(RH-A2·RH-B1·RH-B2) 감면 여지가 실재하고 일반 경로는 같은 입력에 감면을 적용한다. steps에도 「감면 미적용」 안내가 없고 validate·Zod에 「감면+§155⑳」 차단이 없다.

**실패 시나리오**

1세대1주택+장기임대 1호, 거주주택 2016-01-01→2026-03-01 양도(양도 20억·취득 5억·거주 60개월, RH-A2)에 공익수용(public_expropriation, 전부수용) 선택. 특례 OFF: reductionAmount 14,062,000·totalTax 61,872,800. 특례 ON: reductionAmount 0·totalTax 77,341,000 — 15,468,200 과다과세. 반환 steps는 3건뿐으로 산출세액·결정세액·감면 단계가 전부 없다.

**검증자 재현 실측**

probe(삭제 완료, `__tests__/_scratch/verify-F08-{1,2}.test.ts`), makeMockRates + calculateTransferTax 직접 호출.
[A 시나리오 재현 — 양도 20억·취득 5억·2016-01-01→2026-03-01·거주 60개월·1세대1주택·임대 1호 적격, reductions=[public_expropriation]]
· 특례 OFF: transferGain 1,500,000,000 / taxableGain 600,000,000 / LTHD 360,000,000 / taxBase 237,500,000 / calculatedTax 70,310,000 / **reductionAmount 14,062,000**(채권보상 20억, reductionType "공익사업용 토지 수용(§77)") / determinedTax 56,248,000 / localIncomeTax 5,624,800 / **totalTax 61,872,800**
· 특례 ON: taxableGain 240,000,000 / LTHD 300,000,000 / taxBase 237,500,000(동일) / calculatedTax 70,310,000(동일) / **reductionAmount 0** / determinedTax 70,310,000 / localIncomeTax 7,031,000 / **totalTax 77,341,000**, rheApplied=true, scenarioId="RH-A2"
· 차액 **15,468,200**(= 14,062,000 × 1.1) — 제보 수치와 완전 일치.
· 현금보상 20억으로 바꾸면 OFF reduction 10,546,500(15%) / total 65,739,850, ON은 77,341,000 불변 ⇒ 제보의 "전부수용" 수치는 **채권보상** 전제.
· ON steps 실측 3건: ["양도차익 계산","장기임대주택 보유자 거주주택 비과세 특례","비과세 양도소득금액 (소령 §161①)"] / OFF steps 13건(감면세액·결정세액 포함).
[B 시나리오 추가 실측 — 양도 8억(12억 이하), PDF 사례25 입력 + reductions 토글]
· 감면 미선택: calc 44,699,900 / reduction 0 / total 49,169,890
· 감면 선택(§77 현금 8억): calc 44,699,900 / reduction 0 / total 49,169,890 — **완전 동일(입력이 세액에 0 영향)**
· 같은 입력을 특례 OFF·비1세대1주택으로 돌리면 calc 66,563,200 / reduction 6,656,320 적용됨 ⇒ 감면 배선 자체는 정상.

**법령 독립확인**

법령 쪽만 독립 확인했다(코드 재현은 미수행 — 다른 검증자 담당). 결론: **finding의 법적 전제는 대체로 성립하나, 조문 단위로 좁혀야 한다.**

■ 1) §155⑳에 감면 배제 명문은 없다 — 요건 조항 본문·괄호·후단·인접 항(21~25항)까지 전수 확인
소득세법 시행령 §155⑳ 본문은 "…해당 1주택(이하 이 조에서 "거주주택"이라 한다)을 양도하는 경우에는 국내에 1개의 주택을 소유하고 있는 것으로 보아 **제154조제1항을 적용한다**"뿐이다. 후단(직전거주주택보유주택 기간 안분)·제21항~제25항(임대기간요건 미충족 추징, 자동말소 특례, 제출서류) 어디에도 조특법 감면에 관한 언급이 **없다**. 즉 §155⑳은 "1주택 의제 + §154① 적용"만 하는 조항이고, 산출세액 단계의 감면과는 층위가 다르다.

■ 2) 12억 초과 과세분이 남는다는 전제는 조문으로 확인됨
소득세법 §89①3호 각 목 외의 부분 괄호: "(주택 및 이에 딸린 토지의 양도 당시 실지거래가액의 합계액이 **12억원을 초과하는 고가주택은 제외한다**)". §155⑳은 §154①(=§89①3호가목의 위임)을 적용시킬 뿐이므로 이 괄호는 그대로 살아 있다. 과세분 계산은 §95③ → 소령 §160①1호 "법 제95조제1항에 따른 양도차익 × (양도가액 − 12억원)/양도가액". ⇒ finding이 말한 RH-A2·RH-B1·RH-B2의 과세 잔존은 법령상 정확하다.

■ 3) 감면은 그 잔존 과세분 위에서 작동하도록 설계돼 있다
소득세법 §90①: "제95조에 따른 양도소득금액에 이 법 또는 **다른 조세에 관한 법률**에 따른 감면대상 양도소득금액이 있을 때에는 … 양도소득세 감면액 = A × (B−C)/D × E (A: §104 산출세액, B: 감면대상 양도소득금액, C: §103② 기본공제, D: §92 과세표준, E: 감면율)". 분모 D가 과세표준이므로 비과세로 걸러진 뒤 남은 과세표준 위에서 감면이 계산된다 — 병용을 전제한 산식이다.
조특법 §127⑦: "거주자가 토지등을 양도하여 **둘 이상의 양도소득세의 감면규정**을 동시에 적용받는 경우에는 … 하나의 감면규정만을 적용한다." → 배제 대상은 **감면↔감면**뿐이고 비과세↔감면은 사정 범위 밖이다.

■ 4) 조세심판원 선례가 정면으로 다룬다 — 처분청의 "택일" 논리를 4건 모두 배척
· 국심2006서2402(2006.11.13) 재결요지 verbatim: "쟁점아파트가 1세대1주택 비과세요건을 갖춘 고가주택이면서 조특법상 신축주택에 해당하는 경우 **조특법과 개별세법간의 비과세 또는 감면규정 상호간에 중복적용을 배제한다는 규정은 없으므로** 중복적용배제로 보아 한 이 건 처분은 위법함." 이유 (4): "…이는 원칙적으로 조세특례제한법에 규정된 감면제도 상호간의 중복적용을 배제하는 규정이라 할 것이며, 조세특례제한법과 개별세법간의 … 조정 규정은 없는 것으로 이해된다." 이유 (5): "**감면대상 양도소득은 … 소득세법 시행령 제160조의 규정에 의하여 계산된 양도가액 6억원을 초과하는 부분**이라 할 것" (당시 고가 기준 6억, 현행 12억).
· 국심2006서2254(2006.10.18)·2256(동일자)·2200(2006.11.29) 동지.
⇒ finding의 제안 (1)(특례 경로도 calcReductions를 호출해 rhe.taxableGain 기준 산출세액에 감면 적용)은 이 선례의 판단과 **정확히 일치**한다.

■ 5) 그러나 조문별로 갈린다 — finding의 포괄적 서술은 부정확
현행 조특법 §99①·§99의3① **단서**는 고가주택을 명시적으로 배제한다: "다만, (해당) 신축주택이 「소득세법」 **제89조제1항제3호에 따라 양도소득세의 비과세대상에서 제외되는 고가 주택**에 해당하는 경우에는 그러하지 아니하다." §155⑳ 거주주택이 12억 초과이면 바로 이 문언에 해당하므로, **§99·§99의3에 한해서는 감면 0이 법령상 옳다**(엔진도 `isHighValueHouseUnder993`로 이미 게이트 — new-99.ts:189, new-99-3.ts:281).
⚠️ 2006년 선례들이 감면을 인정한 것은 당시 단서가 "**고급주택**"(면적·시설 기준)이었기 때문이다. 국심2006서2254 인용 원문: 개정 전 §99의3① 단서 "…비과세대상에서 제외되는 **고급주택**에 해당하는 경우…", 그리고 조특법 부칙(2002.12.11 법률 제6762호) 제29조①: "이 경우 … 당시의 **고급주택 기준**을 적용한다." 2002.12.11 개정으로 "고가주택"으로 바뀌었다. ⇒ 선례의 **일반론**(비과세↔감면 병용 가능, 감면대상 = 12억 초과분)은 살아 있으나, §99·§99의3에 대한 **결론**은 현행법에 그대로 옮길 수 없다.
반면 다음 조문에는 고가주택 배제 단서가 **본문·단서·괄호 어디에도 없다**(전문 확인):
· §77(공익사업용 토지 등 감면, 15/20/35/45%) — "토지등"에 주택 포함, 배제 단서 없음
· §97(장기임대주택 50%/면제), §97의2(신축임대주택 면제) — §97② "「소득세법」 제89조제1항제3호를 적용할 때 임대주택은 그 거주자의 소유주택으로 보지 아니한다"는 **주택 수 계산** 규정일 뿐 감면 배제가 아님
· §97의5(장기일반민간임대주택 100% 세액감면) — ②는 §97의3·§97의4와의 중복만 배제
· §98의8(준공후미분양 50% 소득공제), §99의2(신축·미분양 100% 세액감면)
⇒ **이들에 대해서는 "감면 여지가 실재한다"는 finding의 주장이 조문상 성립한다.** 특히 §77은 현실적 결합 가능성이 높다(국세청 해석 [306452] "거주주택이 수용되어 장기임대주택으로 전입하는 경우 비과세 특례여부"가 §155⑳ 수용 사안이 실재함을 보여준다).

■ 6) 선례 부존재 명시
"§155⑳ 거주주택 특례 + 조특법 감면 병용"을 **직접** 다룬 조세심판원 재결례·국세청 해석은 검색되지 않았다(tax_tribunal "거주주택 비과세 특례 감면 중복" 0건, nts "거주주택 비과세 특례 고가주택 감면"·"고가주택 감면 조세특례제한법 제99조의2" 0건). 위 4건은 §155⑳이 아니라 §89①3호 본체 사안이다. 다만 §155⑳은 §154①을 적용시키는 것에 불과해 과세분 구조가 동일하므로 동일 법리가 미친다고 보는 것이 문언상 자연스럽다 — 이 부분은 **유추이며 직접 선례가 아님을 명시**한다. 국세청 해석 본문은 법제처 OPEN API가 목록만 제공(NOT_SUPPORTED)해 taxlaw.nts.go.kr 링크 외 본문 확인 불가 — [2992] "1세대1주택인 감면대상 신축주택이 고가주택인 경우 양도소득세의 적용 방법"(2006.11.01)은 **본문 미확인**이므로 판정 근거로 쓰지 않았다.

■ 결론
"침묵 드롭에 법령 근거가 없다"는 finding의 핵심은 **CONFIRMED**. 다만 "감면 여지가 실재"를 무조건으로 서술한 점, 그리고 "15,468,200 과다"가 어떤 조문의 감면인지 특정하지 않은 점에서 **PARTIALLY_CONFIRMED**로 낮춘다 — §99·§99의3이라면 0이 정답이고 finding은 그 부분에서 틀린다.

> 조문 정정: 「§155⑳ 특례 경로가 감면을 무조건 0으로 고정하는 것은 법령 근거가 없다」는 방향은 맞다. 다만 조문 단위로 결론이 갈리므로 다음과 같이 정정한다.

(A) 병용 금지의 명문은 없다 — 확정.
소득세법 시행령 §155⑳(본문·후단·제21~25항)은 "국내에 1개의 주택을 소유하고 있는 것으로 보아 제154조제1항을 적용한다"고만 규정하며 조특법 감면을 배제하지 않는다. 조특법 §127⑦은 "둘 이상의 **양도소득세의 감면규정**" 사이의 택일만 규정해 비과세↔감면에는 미치지 않는다. 조세심판원 국심2006서2402(2006.11.13)는 "조특법과 개별세법간의 비과세 또는 감면규정 상호간에 중복적용을 배제한다는 규정은 없다"고 판시하고 처분청의 택일 논리를 배척했으며, 감면대상 양도소득은 "소득세법 시행령 제160조의 규정에 의하여 계산된 양도가액 [12억원] 초과 부분"이라고 명시했다(국심2006서2254·2256·2200 동지).

(B) 그러나 「감면 여지가 실재한다」는 **조특법 §99·§99의3에는 성립하지 않는다**.
현행 조특법 §99① 단서·§99의3① 단서는 "다만, (해당) 신축주택이 「소득세법」 제89조제1항제3호에 따라 양도소득세의 비과세대상에서 제외되는 **고가 주택**에 해당하는 경우에는 그러하지 아니하다"고 명문 배제한다. §155⑳ 거주주택이 12억 초과이면 정확히 이 문언에 해당하므로 이 두 조문에 한해 감면 0이 **법령상 옳다**(엔진도 `isHighValueHouseUnder993`로 이미 차단 — new-99.ts:189, new-99-3.ts:281). 2006년 선례들이 감면을 인정한 것은 당시 단서가 "**고급주택**"(면적·시설 기준)이었고 부칙(2002.12.11 법률 제6762호) 제29조①이 "당시의 고급주택 기준을 적용한다"고 정했기 때문이므로, 그 결론을 현행 §99·§99의3에 그대로 옮길 수 없다.

(C) 고가주택 배제 단서가 **없는** 조문에 대해서는 finding의 주장이 성립한다.
조특법 §77(공익사업용 토지등, 15~45%), §97(장기임대주택 50%/면제), §97의2(신축임대주택 면제), §97의5(장기일반민간임대주택 100% 세액감면), §98의8(준공후미분양 50% 소득공제), §99의2(신축·미분양 100% 세액감면) — 본문·단서·괄호 전문을 확인한 결과 고가주택 배제 문언이 없다. §97②·§98의8②·§99의2②의 "「소득세법」 제89조제1항제3호를 적용할 때 … 소유주택으로 보지 아니한다"는 **주택 수 계산** 규정일 뿐 감면 배제가 아니다. 특히 §77은 거주주택 수용 사안에서 현실적 결합 가능성이 크다(국세청 해석 [306452] "거주주택이 수용되어 장기임대주택으로 전입하는 경우 비과세 특례여부"). ⇒ 이들 조문에 대해 `reductionAmount: 0`을 하드코딩하는 것은 **법 근거 없이 납세자에게 불리하게 적용**하는 것이다.

(D) 병용 시 감면대상 양도소득금액(§90① 산식의 B)은 **§160① 안분 후 12억 초과분**이어야 한다.
선례가 명시한 바(국심2006서2402 이유 (5))대로 전체 양도소득금액이 아니라 (양도가액−12억)/양도가액 안분 후 과세분이 B다. finding 제안 (1)의 "rhe.taxableGain 기준"이 이에 부합한다.

(E) 「15,468,200 과다」 수치 주장은 **어느 조문의 감면인지 특정되어야만** 성립한다. §99·§99의3이면 성립하지 않고(감면 0이 정답), §77·§97 시리즈·§99의2·§98의8이면 성립한다. 수치 재현자는 재현에 사용한 reduction 종류를 반드시 명시할 것.

(F) 선례 부존재 명시: §155⑳ 거주주택 특례와 조특법 감면의 병용 가부를 **직접** 판단한 조세심판원 재결례·국세청 해석은 검색되지 않았다. 위 4건은 §89①3호 본체 사안이며, §155⑳이 §154①을 적용시키는 구조라 동일 법리가 미친다고 보는 것은 문언상 자연스러운 **유추**이지 직접 선례가 아니다.

⇒ 결론: finding 제안 (1)(특례 경로도 calcReductions 호출)이 원칙적으로 옳되 (B)의 조문별 게이트를 유지해야 하고, (2)(steps·warnings에 사유 노출)는 §99·§99의3처럼 법령상 배제되는 경우의 **필수 보완**이다. 현행처럼 사유 없이 침묵 드롭하는 것은 어느 조문에서도 정당화되지 않는다.

**제안 수정**

(1) 특례 경로도 calcReductions를 호출해 rhe.taxableGain 기준 산출세액에 감면을 적용하거나, (2) 법령상 병용 불가로 결론나면 steps·warnings에 「감면 미적용」 사유를 노출한다 — 어느 쪽이든 현행 침묵 드롭은 저장소의 침묵 실패 차단 규약에 어긋난다. ⚠️ 「15,468,200 과다」라는 수치 주장은 (1)이 정답일 때만 성립하므로, §155⑳ 특례와 조특법 감면의 병용 가부를 먼저 확정할 것.

**수정 위험**

호출부는 transfer-tax.ts:417 한 곳뿐이라 폭발 반경은 좁다. 기존 anchor는 이 경로에 감면 입력이 없어(rental-housing-exception/ 전 파일 reductions 미사용) **감면 배열이 비면 종전과 동일** ⇒ 추가형 수정의 회귀 위험은 낮다(rh-penalty-integration.test.ts:37의 reductionAmount:0은 입력 필드라 red가 되지 않는다).
다만 (1)안(calcReductions 호출)을 택하면 finalize가 함께 수행하던 부수 로직을 이 경로에 별도로 옮겨야 한다: ① 농특세 2-pass(transfer-tax-finalize.ts:166·326 — 차감형·하이브리드 감면세액 × 20%)와 `ruralSurtaxTotal`의 totalTax 합산, ② 가산세 base — 현재 :402가 `emitPenaltySteps(input, steps, rheDeterminedTax, 0, 0, undefined)`로 감면 전 세액을 신고불성실 base로 넘기므로 감면 적용 시 base가 바뀐다(rh-penalty-integration.test.ts가 이 값을 고정하고 있어 감면이 있는 케이스에서만 달라짐), ③ 차감형 감면(STEP 4.6)은 「양도소득금액 차감」이라 특례가 이미 확정한 rhe.taxableGain 위에 어떤 순서로 얹을지 법령 판단이 필요(§161 안분 前/後), ④ §127⑦ 중복배제 한도는 다건에서 transfer-tax-aggregate.ts:355가 재계산하므로 건별 값 변경이 aggregate 총액에도 전파된다. ⑤ 감면 적용 시 결과 카드·신고서가 읽는 산출세액·결정세액 step이 이 경로엔 (배율초과 분리가 없으면) 아예 없어 표시 갭이 드러난다.
(2)안(steps/warnings로 사유 노출)만 하면 세액 무변경이라 회귀 0이지만, 「법 근거 없이 불리 적용 금지」(★★★)를 충족하려면 병용 불가라는 법령 근거를 먼저 확정해야 한다.

---

#### F09 · E-3 일시적 2주택의 raw 보유 조기반환이 §154⑧3호 통산을 무시하고 그 아래 §155⑧·⑦·합가 특례까지 삼킨다

| | |
|---|---|
| 위치 | `lib/tax-engine/transfer-tax-exemption.ts:648` |
| 판정 | **CONFIRMED** |
| 심각도 | **high** |
| 도달성 | reachable-via-ui |
| 탐지 축 | exemption |
| 조치 | 배치 3 |

**결함**

checkExemption E-3가 temporaryTwoHouse.previousAcquisitionDate로 raw 보유기간을 계산해(:648-651) 2년 미만이면 즉시 `return {isExempt:false,isPartialExempt:false}`(:652-654). (a) 이 게이트는 12줄 뒤 :664가 부르는 정본 meetsOneHouseHoldingResidence(§154⑧3호 통산·§154⑤ backdate 반영)보다 엄격해 정본이 충족이라 본 자산을 먼저 거부한다. (b) fall-through가 아니라 return이라 일시적 2주택 토글이 켜져 있기만 하면 E-3.7(§155⑧ :690)·E-3.8(§155⑦ :705)·E-3.5(§155④⑤ :717)가 아예 평가되지 않는다. UI는 previousAcquisitionDate에 양도 자산 취득일을 그대로 넣는다(transfer-tax-api-body-blocks.ts:22).

**실패 시나리오**

동일세대 상속주택(상속개시 2025-01-01, decedentCohabitationHoldingStartDate 2012-01-01, 통산 거주 120개월)을 2026-03-01 8억 양도(취득 3억·2주택)+일시적 2주택 토글 ON(신규 2026-01-01). 정본은 기산일 2012-01-01·meetsOneHouseHoldingResidence=true인데 :652 게이트가 raw 1년2개월로 조기반환 → totalTax 328,350,000. previousAcquisitionDate만 통산 기산일로 바꾸면 0원. 같은 폼에 §155⑦ 농어촌을 켜도 328,350,000 그대로(농어촌 단독이면 0원).

**검증자 재현 실측**

동일세대 상속주택 픽스처(취득 3억·양도 8억, 상속개시 2025-01-01, decedentCohabitationHoldingStartDate 2012-01-01, 통산거주 120개월, 비조정, householdHousingCount=2, temporaryTwoHouse{prev 2025-01-01, new 2026-01-01}, 양도 2026-03-01):
- resolveExemptionHoldingStartDate = 2012-01-01 (통산 backdate 정상 작동)
- A 현행(토글 ON): isExempt=false, exemptReason=undefined, taxableGain=500,000,000, **totalTax=328,350,000** (제보값과 완전 일치. 60%×(500,000,000−2,500,000)+지방 10%)
- B previousAcquisitionDate만 2012-01-01: isExempt=true, "일시적 2주택 비과세", **totalTax=0**
- C 토글 OFF·householdHousingCount=1: isExempt=true, "1세대1주택 비과세", totalTax=0
- decedentAcquisitionDate(2012-01-01)까지 넣어 단기세율을 없앤 현실적 변형: A **totalTax=190,366,000** ↔ B **0** (과세 크기는 세율 입력에 따라 190,366,000~328,350,000 범위, 방향은 동일)
삼킴 검증(같은 픽스처):
- §155⑦ 농어촌 단독 0원("농어촌주택 비과세 (§155⑦1호 상속)") ↔ 일시적2주택 동시 328,350,000
- §155⑧ 단독 0원("수도권 밖 부득이한 사유 주택 비과세 (§155⑧ 근무상 형편)") ↔ 동시 328,350,000
- §155④ 동거봉양 단독 0원("동거봉양 합가 (§155④) 1세대1주택 비과세") ↔ 동시 328,350,000

**제안 수정**

(a) :648 기산일을 resolveExemptionHoldingStartDate(input) 기준으로 교체, (b) :652-654를 return이 아니라 조건 분기로 바꿔 E-3만 건너뛰고 E-3.7/3.8/3.5로 흘러가게 한다 — :664가 이미 §154①을 검증하므로 raw 사전게이트를 제거해도 과다 비과세가 생기지 않는다.

**수정 위험**

기존 anchor는 (a)+(b)를 제안대로 적용해도 red가 나지 않는다 — 셋 다 backdate/proviso 입력이 없어 정본 판정이 독립적으로 실패하기 때문이다:
- `__tests__/tax-engine/transfer-tax/reductions-and-exempt.test.ts:371` T-34(보유 1년11개월 → isExempt=false): 통산 필드 없음 ⇒ resolveExemptionHoldingStartDate=acquisitionDate ⇒ meetsOneHouseHoldingResidence=false ⇒ 그대로 false.
- `__tests__/tax-engine/transfer/temporary-two-house-proviso-154.anchor.test.ts` #3a 나목(해외이주)·#3b 5호·#4 회귀: #3a는 proviso "both"라 meetsHolding은 통과하지만 `oneYearWaived=false`로 timing.overall=false ⇒ 여전히 false. #3b는 residence_only ⇒ meetsHolding false. #4는 proviso 없음 ⇒ false.
- `temporary-two-house-high-value.anchor.test.ts`·`temporary-two-house-one-year-155-1.anchor.test.ts`·`155-16-18` 계열은 보유 2년 이상이거나 timing으로 갈리므로 영향 없음.

⚠️ 다만 finding의 「:664가 이미 §154①을 검증하므로 raw 사전게이트를 **제거**해도 과다 비과세가 생기지 않는다」는 **틀렸다**. 전면 제거하면 `!provisoRelaxesHolding &&` 화이트리스트 차단이 함께 사라지는데, `meetsOneHouseHoldingResidence`는 proviso === "both"면 **화이트리스트와 무관하게** 보유요건을 면제한다(:415-417). 나·다목(overseas_migration/overseas_residence)을 §155① 준용에서 뺀 것은 legal-codes/transfer.ts:347 `TEMP_TWO_HOUSE_PROVISO_REASONS`의 명시적 설계다. 단건 UI는 `effectiveProvisoReason`이 막아주지만 다자산 경로(multi-transfer-tax-api.ts:182-191)는 정규화가 없어 실제로 과다 비과세가 날 수 있다. ⇒ **(a)는 "기산일만 교체하고 `!provisoRelaxesHolding &&` 조건은 유지"로 좁혀 적용**할 것.

(b) `return` → 조건분기 전환의 부작용은 작다: E-3이 건너뛰어지면 E-3.7/3.8/3.5를 거쳐 :742 `householdHousingCount !== 1` 게이트에서 동일하게 false로 끝난다(2주택이므로 E-4까지 새로 열리지 않는다).

파급 범위: `checkExemption`는 겸용주택 서브엔진(transfer-tax-mixed-use.ts)이 호출하지 않고 정본 헬퍼만 쓰므로 겸용 경로 회귀 없음. 타 세목 영향 없음(양도 전용 파일). 다만 `resolveDeemedOneHouseBy155`(중과배제 §167의10①15호)는 raw 게이트를 보지 않으므로 이 수정은 「비과세 O / 중과배제 X」 방향의 불일치를 **줄인다**(현재는 비과세만 X인 상태). 부담부증여 경로(lib/calc/gift-burdened-transfer-api.ts:269-272)도 같은 엔진을 타므로 회귀 테스트에 포함할 것.

---

#### F10 · §155 의제 1세대1주택(일시적 2주택·합가·농어촌)에 LTHD 표2가 적용되지 않는다 — 영 §159의4 위반

| | |
|---|---|
| 위치 | `lib/tax-engine/transfer-tax-lthd.ts:147` |
| 판정 | **CONFIRMED** · 법령 CONFIRMED |
| 심각도 | **high** |
| 도달성 | reachable-via-ui |
| 탐지 축 | lthd |
| 조치 | ⏸ **사용자 판단 대기** |

**결함**

표2 게이트가 `isOneHousehold && householdHousingCount === 1`(:147-148, L-1b 복제본 :110-111)로 실제 주택 수만 본다. 「소득세법 시행령」 §159의4는 표2 대상을 「1주택(제155조… 및 그 밖의 규정에 따라 1세대 1주택으로 보는 주택을 포함한다)」으로 정의한다(MST 286211 verbatim). checkExemption은 §155①·④⑤·⑦을 의제 1세대1주택으로 인정해 12억 초과분만 과세하는데, 그 뒤 LTHD는 householdHousingCount가 2로 남아 표1(최대 30%)로 떨어진다.

**실패 시나리오**

일시적 2주택 종전주택 2017-05-02 취득 5억 → 2026-02-16 14억 양도·거주 96개월. 엔진은 exemptReason="일시적 2주택 고가주택"·과세 양도차익 128,571,428로 정확히 판정한 뒤 LTHD를 표1 16%(20,571,428)로 계산해 총세액 23,633,500. 순수 1주택 대조군은 표2 64%(82,285,713) → 5,838,642. 17,794,858 과다과세. 합가·농어촌 고가주택도 같은 경로.

**검증자 재현 실측**

동일 픽스처(취득 2017-05-02 5억 → 2026-02-16 14억 양도, 거주 96개월, 비조정, mockRates), 전부 `taxableGain=128,571,428`·`transferGain=900,000,000` 동일:

| 경로 | exemptReason | LTHD rate | LTHD | totalTax |
|---|---|---|---|---|
| §155① 일시적 2주택 | 일시적 2주택 고가주택 | **0.16** | 20,571,428 | **23,633,500** |
| §155⑤ 혼인 합가 | 혼인 합가 (§155⑤) 고가주택 | 0.16 | 20,571,428 | 23,633,500 |
| §155④ 동거봉양 합가 | 동거봉양 합가 (§155④) 고가주택 | 0.16 | 20,571,428 | 23,633,500 |
| §155⑦1호 상속 농어촌 | 농어촌주택 고가주택 (§155⑦1호 상속) | 0.16 | 20,571,428 | 23,633,500 |
| §155⑦2호 이농 | 농어촌주택 고가주택 (§155⑦2호 이농) | 0.16 | 20,571,428 | 23,633,500 |
| §155⑧ 수도권 밖 부득이 | 수도권 밖 부득이한 사유 주택 고가주택 (§155⑧ 근무상 형편) | 0.16 | 20,571,428 | 23,633,500 |
| §156의2⑤ 대체주택 | 대체주택 특례 고가주택 (§156의2⑤) | 0.16 | 20,571,428 | 23,633,500 |
| **대조군 순수 1주택** | 1세대1주택 고가주택 | **0.64** | 82,285,713 | **5,838,642** |

과다과세 = 23,633,500 − 5,838,642 = **17,794,858** (원 주장과 원 단위 일치).

STEP formula 실측:
- 2주택: `"128,571,428 × 16% | 보유 8년×2% = 16% (30% 한도) | 보유기간 8년 9개월"` (표1)
- 1주택: `"128,571,428 × 64% | 보유 8년×4%=32% + 거주 8년×4%=32% = 64% | 보유기간 8년 9개월"` (표2)

법문 verbatim(mst 286211, 시행 2026-07-01): 소령 §159의4 「…국내에 1주택(**제155조**ㆍ제155조의2ㆍ제156조의2ㆍ제156조의3 및 그 밖의 규정에 따라 1세대 1주택으로 보는 주택을 포함한다)을 보유하고 보유기간 중 거주기간이 2년 이상인 것…」

**법령 독립확인**

법령 쪽만 독립 확인했고, 위임 체인 끝까지 본문 verbatim으로 추적한 결과 finding의 법적 주장이 그대로 성립한다.

**위임 체인 (법 → 령)**
1. 「소득세법」 제95조 제2항 (MST 280405, 시행 2026-07-01) 표 외의 부분 **단서**: "다만, **대통령령으로 정하는 1세대 1주택**(이에 딸린 토지를 포함한다)에 해당하는 자산의 경우에는 그 자산의 양도차익에 다음 표 2에 따른 보유기간별 공제율을 곱하여 계산한 금액과 같은 표에 따른 거주기간별 공제율을 곱하여 계산한 금액을 합산한 것을 말한다." → 표2 대상 정의를 시행령에 위임.
2. 「소득세법 시행령」 제159의4 (MST 286211, 시행 2026-07-01) 제1문: "법 제95조제2항 표 외의 부분 단서 및 같은 조 제5항 각 호 외의 부분에서 "대통령령으로 정하는 1세대 1주택"이란 각각 1세대가 양도일 … 현재 국내에 **1주택(제155조ㆍ제155조의2ㆍ제156조의2ㆍ제156조의3 및 그 밖의 규정에 따라 1세대 1주택으로 보는 주택을 포함한다)**을 보유하고 보유기간 중 거주기간이 2년 이상인 것을 말한다."

⇒ 표2 대상 판정의 「1주택」은 **실제 보유 주택 수**가 아니라 **제155조 등에 따른 의제를 포함한 개념**이다. finding이 인용한 괄호 문언은 verbatim 일치한다(다만 생략부호 안에 §155의2·§156의2·§156의3이 더 있다 — 아래 correctedClaim).

**§155 각 항이 실제로 「1세대 1주택으로 보는 주택」인지 본문 확인 (「소득세법 시행령」 제155조)**
- ① 일시적 2주택: "…**이를 1세대1주택으로 보아 제154조제1항을 적용한다**."
- ④ 동거봉양 합가: "…합친 날부터 10년 이내에 먼저 양도하는 주택은 **이를 1세대1주택으로 보아 제154조제1항을 적용한다**."
- ⑤ 혼인 합가: "…혼인한 날부터 10년 이내에 먼저 양도하는 주택은 **이를 1세대1주택으로 보아 제154조제1항을 적용한다**."
- ⑦ 농어촌주택: "…일반주택을 양도하는 경우에는 **국내에 1개의 주택을 소유하고 있는 것으로 보아 제154조제1항을 적용한다**."
- ⑧ 부득이한 사유 수도권 밖 주택: ⑦과 동일 문언(코드 E-3.7이 구현 중인데 finding 열거에서 빠졌다).

교차 확인: 「소득세법 시행령」 제154조 제11항 — "법 제89조제1항제3호나목에서 "대통령령으로 정하는 주택"이란 **제155조에 따른 1세대1주택의 특례에 해당하여 이 조를 적용하는 주택**을 말한다." ⇒ §155 특례 주택이 §89①3호 비과세 주택이라는 점이 령 차원에서도 명시돼 있다.

**과세분(12억 초과)에 표2가 실제로 물리는지** — 법 §95③ → 「소득세법 시행령」 제160조 제1항 제2호: "고가주택에 해당하는 자산에 적용할 장기보유특별공제액 = **법 제95조제2항에 따른 장기보유특별공제액** × (양도가액−12억원)/양도가액". 즉 부분비과세(고가주택) 경로에서 안분 대상 기준액 자체가 법 §95②(단서 포함)이므로, 표2/표1 선택이 곧바로 과세분 공제액을 가른다.

**예규·심판례 (조문만으로 안 갈리는지 적대적 확인)**
- 국세청 서면-2021-부동산-7577(부동산납세과-784, 2022.04.06) 회신 verbatim: "…신규주택(C)을 취득하여, 「소득세법 시행령」 **제155조제1항**에 따라 종전주택(B)을 양도하는 경우로서, 보유기간(해당 주택의 취득일부터 양도일까지 기간) 중 2년 이상 거주한 주택을 양도한 경우 **장기보유특별공제율은 「소득세법」 제95조제2항 표2의 공제율을 적용하는 것입니다**." (관련법령란에 소령 §155·§159의4 명시)
- 국세청 서면-2021-부동산-7376(부동산납세과-2133, 2022.08.02) — 위 해석 인용, 같은 결론.
- 국세청 부동산거래관리과-1497(2010.12.20) 요지: "…같은 법 시행령 제159조의2 따른 1세대1주택(1세대가 양도일 현재 국내에 1주택을 소유하고 있는 경우의 그 주택을 말하며, 같은령 **제155조** 제155조의2 제156조의2 및 **그 밖의 규정에 의하여 1세대1주택으로 보는 주택 포함**)에 해당하는 자산의 경우에는 같은 법 제95조 제2항 **표2**에 따른 보유기간별 공제율을 적용하는 것임" ⇒ 괄호 문언은 구 §159의2 시절부터 동일하게 존재했다(시기 드리프트 없음).
- 조세심판원 조심2025서1570(2025.10.17) — 쟁점 프레이밍 자체가 "일시적 2주택자이므로 「소득세법」 제89조 제1항 제3호 나목의 1세대 1주택 비과세 및 **제95조 제2항 단서 표2**의 장기보유특별공제를 적용해야 한다"이고, 기각 사유는 **거주자 해당 여부**였을 뿐 ①→표2 연결 자체는 다투어지지 않았다.
- 반대 취지(§155 의제인데 표2 배제) 예규·심판례는 검색되지 않았다.

**§155⑦(농어촌) 범위 — finding이 적대적 검증을 요구한 지점**
§159의4는 「제155조」를 항 구분 없이 지목하고, ⑦은 "국내에 1개의 주택을 소유하고 있는 것으로 보아 제154조제1항을 적용한다"로 1주택 의제를 명문화한다. §159의4에 ⑦을 빼는 단서·괄호는 **없다**. 다만 **농어촌주택 특례에 한정한 예규·심판례는 검색 결과 0건**이므로 「선례 부존재, 문언해석으로 포함」이 정확한 서술이다(추정으로 단정하지 않음).

**house-exclusion-step 설계와의 충돌 여부**
`transfer-tax-house-exclusion-step.ts:22-23` 주석이 이미 "비과세·12억 안분·**LTHD 표2**에 유효 주택수(count−1) 반영"이라고 명시하고, `transfer-tax.ts:475`가 `exemptionJudgeInput`(차감 후)을 LTHD에 넘긴다. 즉 §99의4·§98의9·감면주택·§155②③ 상속주택 축은 이미 §159의4 취지대로 배선돼 있고, §155①④⑤⑦⑧만 `checkExemption` 내부 분기(E-3·E-3.5·E-3.7·E-3.8)로 처리돼 주택수를 차감하지 않는다. **설계 충돌이 아니라 같은 설계의 미적용 구간**이다 — finding의 진단 방향이 정확하다.

**제안 수정**

runHouseCountExclusionStep(transfer-tax-house-exclusion-step.ts:41-45)이 이미 §99의4·§98의9·§155②③ 상속주택을 비과세 판정용 주택수에서 차감하는 정본이므로 §155①④⑤⑦ 의제도 같은 자리에 추가하거나, isOneHouseSingle 판정을 checkExemption의 의제 결과(resolveDeemedOneHouseBy155, exemption.ts:558-570)를 읽는 단일 술어로 교체한다. 중과 주택수 축은 불변 유지. ⚠️ 표2 적용 범위가 §155 어느 항까지인지(특히 ⑦ 농어촌)와 house-exclusion-step 설계와의 충돌 여부를 적대적으로 검증할 것.

**수정 위험**

**A안은 회귀가 아니라 기능 파괴다** — 위 correctedClaim 참조. `checkExemption`이 `householdHousingCount === 2`로 의제 분기를 게이팅하는 지점이 4곳(transfer-tax-exemption.ts:63·101·644·718)이라, exemptionJudgeInput의 주택수를 §155 의제로 깎으면 의제 판정이 사라진다. 12억 이하 구간에서는 여전히 비과세라 **테스트가 초록인 채로 조용히 다른 경로**를 타게 된다(merge-155-4-5 anchor는 `isExempt`만 단언).

**B안 적용 시 파급 지점(전부 같은 파일·인접)**:
- `transfer-tax-lthd.ts:147-148` 본 게이트 + **:110-111 L-1b 부수토지 복제본** — 「같은 술어 두 벌」이라 한쪽만 고치면 부수토지 일체과세 경로가 어긋난다(memory `feedback_shared_predicate_argument_parity`).
- `transfer-tax.ts:485-486` §98의2 특칙(`unsold_98_2`) 분기가 `exemptionJudgeInput.householdHousingCount === 1`로 표2 여부를 **재판정**한다 — 같은 술어를 공유시키지 않으면 세 번째 진실이 생긴다.
- `transfer-tax.ts:504-505` `pushLongTermHoldingSteps`에 `isOneHousehold`·`householdHousingCount`가 표시용으로 전달된다 — 게이트만 바꾸고 표시를 안 바꾸면 rate↔display drift(64%인데 문구는 표1).
- `transfer-tax-lthd.ts:159-165` L-2(§95⑤ 용도변경)가 `isOneHouseSingle`을 재사용한다 — 표2 대상 확대가 §95⑤ 혼합공제 진입 조건도 동시에 넓힌다(§159의4가 §95⑤을 명시 포함하므로 법령상으로는 정합하나, `non-housing-to-housing-conversion.engine.test.ts`가 `householdHousingCount: 2` 픽스처를 갖고 있어 red 가능).
- `transfer-tax-lthd.ts:243` split 분기의 `isProratedSplit`(12억 초과 안분)도 `isOneHouseSingle`을 쓴다 — 토지·건물 분리취득 × 의제 1세대1주택 조합의 안분 축이 함께 움직인다. 여기는 **표2 축이 아니라 12억 안분 축**이라 별개 판정이 필요하다(같은 이름 두 축 — memory `feedback_rename_same_name_two_axes`).

**현행 동작을 고정하는 테스트는 없다** — §155 의제 6개 anchor 파일(`temporary-two-house-{high-value,one-year-155-1,155-16-18,proviso-154}`·`merge-155-4-5-exemption`·`rural-and-unavoidable-155-7-8`)에 세액·LTHD 단언 0건. 즉 「의도된 동작」의 증거가 없고, 동시에 **회귀 감지 안전망도 0건**이므로 수정 시 표2 전환값을 원 단위 anchor로 새로 심어야 한다. 파급 확인은 `npx vitest run __tests__/tax-engine/transfer/ __tests__/tax-engine/transfer-tax/` + E2E `transfer-*` 필요.

---

#### F11 · 부수토지 일체과세(L-1b)의 표1 공제율·3년 게이트가 토지가 아니라 주택의 보유기간을 본다

| | |
|---|---|
| 위치 | `lib/tax-engine/transfer-tax-lthd.ts:104` |
| 판정 | **CONFIRMED** · 법령 PARTIALLY_CONFIRMED |
| 심각도 | **high** |
| 도달성 | reachable-via-ui |
| 탐지 축 | lthd |
| 조치 | ⏸ **사용자 판단 대기** |

**결함**

L-1b가 3년 진입요건을 `ctx.holdingMonths < 36`(:104)로, 공제율 연수를 `floor(ctx.holdingMonths/12)`(:97→:116-120)로 전부 primary 주택 보유개월로 판정한다. 토지 자신의 취득일은 :105·:122의 표시용 holdingPeriod에만 쓰인다. 「소득세법」 §95④는 「그 자산의 취득일부터」이고, 예규(서면인터넷방문상담5팀-1289 2008.06.20 / 재산세과-1693 2009.08.17)는 「표1과 주택 보유기간에 따른 표2의 공제율 중 큰 것」을 적용하라고 한다 — 표1은 토지 자신의 보유기간 기준이고 max 비교가 있어야 하는데 둘 다 없다.

**실패 시나리오**

일괄양도 companion 부수토지: 토지 2021-06-01 취득(양도 2024-06-01 기준 2년 11개월), 주 주택 보유 14년, 양도 5억·취득 1억. 엔진은 §95② 3년 요건 미달 토지에 표1 28%(=주택 14년×2%) 공제 112,000,000을 부여 → 총세액 97,405,000. 토지 자신 기준이면 공제 0 → 146,366,000(48,961,000 과소). step formula가 「400,000,000 × 28% | 보유 2년×2% = 28% | 보유기간 2년 11개월」로 자기모순 표시된다.

**검증자 재현 실측**

Engine probe (`calculateTransferTax`, makeMockRates), companion 부수토지: 양도 500,000,000 / 취득 100,000,000 / 토지취득 2021-06-01 / 양도 2024-06-01 / landNature=appurtenant_to_housing / 다주택(1세대1주택 아님):
- primaryCtx.holdingMonths=168 (주택 14년) → longTermRate 0.28, longTermDeduction 112,000,000, calculatedTax 88,550,000, localIncomeTax 8,855,000, **totalTax 97,405,000**
- primaryCtx.holdingMonths=35 (동일 입력, 이 값만 변경) → rate 0, deduction 0, calculatedTax 133,060,000, localIncomeTax 13,306,000, **totalTax 146,366,000**
- 차액 **48,961,000** — 원 주장과 원 단위까지 일치.
- appliedRate 0.38 / 0.40 (둘 다 누진 — 세율 경로 동일, 차이는 오직 LTHD).
- LTHD step formula 실측: `400,000,000 × 28% | 보유 2년×2% = 28% (30% 한도) | 보유기간 2년 11개월` (자기모순 표시 재현).
- `calculateHoldingPeriod(2021-06-01, 2024-06-01)` = `{years:2, months:11, days:30}`.
Route-조립 probe (`buildCompanionEngineInputs`): 생성된 companion item = `acquisitionDate 2021-06-01` (primary는 2010-06-01), `landNature appurtenant_to_housing`, `primaryContextForCompanionRate.holdingMonths 168` — 위 엔진 입력이 실제 배선으로 만들어짐을 확인.

**법령 독립확인**

법령 쪽만 독립 확인했다(코드 재현 미수행). 결론: **finding의 법적 방향은 옳고 통제적 권위가 존재하나, finding이 든 근거 2건 중 1건은 정반대를 말한다.**

■ 1. 조문 — finding 지지 (KoreanLaw MCP, 소득세법 MST 280405, 시행 2026-07-01)

§95④ 본문이 finding 인용 그대로다: "제2항에서 규정하는 자산의 보유기간은 **그 자산의 취득일부터 양도일까지**로 한다." 결정적인 것은 **단서의 예외가 한정 열거**라는 점이다 — 단서는 ①§97의2① 이월과세(증여자 취득일 기산) ②가업상속공제 적용비율분(피상속인 취득일 기산) **딱 두 개**만 든다. 「부수토지는 주택의 보유기간을 따른다」는 예외는 §95 어디에도 없다. §95②의 진입요건도 "**보유기간이 3년 이상인 것**"이고, 그 보유기간의 정의가 곧 §95④다.

§104①2호 괄호를 확인한 결과 일체과세의 사정거리도 확정된다: "주택(이에 딸린 토지로서 대통령령으로 정하는 토지를 포함한다. **이하 이 항에서 같다**)". "이 항"=제104조 **제1항**이므로 부수토지=주택 정의확장은 세율 조문 내부에 갇힌다. §95(LTHD)에는 미치지 않는다. 즉 코드 주석(appurtenant-land-rate.ts:8-10)이 근거로 삼는 §104①2호·영§167의5는 **세율 축 전용**이고, 그 축을 LTHD 보유기간으로 전이시킬 조문 근거는 없다.

위임 체인: 법 §95② 단서 → 영 §159의4("보유기간 중 거주기간이 2년 이상") 확인. 표2 대상 요건은 주택 기준이며 토지 축으로 옮길 근거는 없다(현행 코드 `table2ResidenceYears >= 2` 판정은 유지돼야 함).

■ 2. 예규 — finding 근거 2건 중 1건이 **반대**

taxlaw.nts.go.kr 본문 전수(Playwright) 결과 교리가 **2008→2010에 뒤집혔다**:

(가) 2008년 3건은 **현행 코드를 지지**한다. 특히 finding이 인용한 **서면인터넷방문상담5팀-1289(2008.06.20)**는 갑설(토지 자신 20년→80%) vs 을설(건물 13년→52%)에서 **을설을 채택**했다 — "당해 부수토지에 대한 …장기보유특별공제액은 같은항 **표2**의 규정에 따라 양도차익의 **100분의 52**로 하는 것임". 표1도, max 비교도 없다. 동일 취지 서면4팀-972(2008.04.17, 72%)·서면5팀-1061(2008.05.20, 76%). ⇒ **finding의 인용 1건은 자기 주장을 반증한다.**

(나) 그러나 **기획재정부 재산세제과-1183(2010.12.10)**가 이를 뒤집었고, 이것이 통제적 권위다(finding 미인용). 상속증여세과-461(2013.08.12) 본문에 전문 인용됨. 이후 부동산거래관리과-696(2010.05.18)·사전-2018-법령해석재산-0493(2018.07.27)이 재확인. 특히 부동산거래관리과-696의 사실관계는 **2004.02 농지 취득 → 2007.03 대지 용도변경·주택신축 → 2010 양도**로 L-1b(나대지 취득 후 주택신축·일괄양도) 패턴과 동일하다.

(다) finding이 인용한 재산세과-1693(2009.08.17)은 max 규칙을 말하는 것은 맞으나 **재개발 나대지 출자·청산금 납부** 사건이라 부수토지 일체과세와 사실관계 축이 다르다. 보조 근거는 되어도 통제적 권위는 아니다.

■ 3. finding의 caveat — 정당하나 시점이 부정확

finding은 근거 예규가 "2008~2009년 것"이라 현행 2축 표2(보유분+거주분) 대입이 미확정이라 했다. 방향은 맞으나 **2018.07.27에 재확인**된 사실이 빠졌다. 다만 그 2018 예규가 인용한 §95②도 표2를 "보유기간별 공제율"만으로 적기 때문에(현행 조문은 보유기간별+거주기간별 2축 — 두 본문 대조로 실측), **1축 시절 해석인 것은 여전히 맞다**. 표2 2축화 이후 max 대입 방식을 다룬 선례는 **부존재**다: nts "부수토지 장기보유특별공제" 48건 날짜 역순 전수(최신 2023.02.08 사전-2022-법규재산-1252 — 부수토지에 표1 적용을 확인하나 max 쟁점 아님), "주택부수토지 보유기간" 6건(최신 2013), 조세심판원 5건(전부 2016 이전). ⇒ 착수 전 확인 필요하다는 finding의 경고는 유효하다.

■ 4. 3년 게이트

토지 10년·주택 2년이면 §95④상 토지의 보유기간은 10년이므로 §95② "보유기간 3년 이상" 요건을 충족하고 표1 20%가 산출된다(표2는 주택 2년이라 0). 기재부 1183의 max 규칙상 20%가 채택된다. 코드는 `ctx.holdingMonths < 36`(주택 기준)으로 0을 반환하므로 **법령·기재부 유권해석 양쪽과 어긋난다.** 방향은 납세자 불리(과대과세)다.

기각 목록 저촉 없음 — 본건 max는 §95② LTHD 공제율 max(기재부 유권해석)이고, 기각된 "미등기 70%×§104⑦ MAX 추가"는 §104 세율 축이라 별개다.

■ 도구 실패 없음. 조문·예규 전부 본문 verbatim 확보.

> 조문 정정: L-1b(부수토지 일체과세)가 3년 진입요건과 표1 공제율 연수를 모두 primary 주택 보유개월로 판정하는 것은 「소득세법」 제95조 제4항 및 기획재정부 유권해석에 어긋난다.

정확한 근거는 다음과 같이 정정한다.

(1) 법 근거 — 「소득세법」(법률) 제95조 제4항 본문 "제2항에서 규정하는 자산의 보유기간은 그 자산의 취득일부터 양도일까지로 한다". 같은 항 **단서는 예외를 §97의2①(이월과세)과 가업상속공제 적용비율분 2개로 한정 열거**하며 부수토지 예외는 없다. 같은 조 제2항의 진입요건 "보유기간이 3년 이상인 것"도 이 정의를 따르므로, 토지 자신의 보유기간이 3년 이상이면 주택이 3년 미만이어도 표1 대상이다.

(2) 일체과세의 사정거리 — 「소득세법」 제104조 제1항 제2호 괄호 "주택(이에 딸린 토지로서 대통령령으로 정하는 토지를 포함한다. **이하 이 항에서 같다**)"는 그 정의확장을 **제104조 제1항 내부로 한정**한다. 따라서 영 §167의5·§104①2호에 기초한 부수토지 세율 일체과세는 유효하되 §95(LTHD) 보유기간 축으로 전이되지 않는다. 코드가 세율 축 근거를 LTHD에 원용한 것이 오류의 원인이다.

(3) 통제적 권위 — **기획재정부 재산세제과-1183(2010.12.10)**: "1세대1주택에 딸린 토지를 양도하는 경우로서 주택보다 보유기간이 오래된 주택 부수토지에 대한 장기보유특별공제는 **그 토지의 전체보유기간에 따른 표1의 공제율**과 **주택 부수토지로서의 보유기간에 따른 표2의 공제율 중 큰 공제율**을 적용". 부동산거래관리과-696(2010.05.18)·사전-2018-법령해석재산-0493(2018.07.27)이 동일 취지로 재확인.

(4) **finding의 인용 정정(중요)** — 서면인터넷방문상담5팀-1289(2008.06.20)는 max 규칙의 근거가 **아니다**. 그 예규는 갑설(토지 자신 20년→80%)을 배척하고 **을설(주택 13년→표2 52%)을 채택**해, 오히려 현행 코드와 같은 결론이다(동지 서면4팀-972·서면5팀-1061). 2008년 3건은 **2010.12.10 기재부 해석으로 대체된 구 교리**이므로 인용에서 빼고 기재부 재산세제과-1183으로 갈음해야 한다. 재산세과-1693(2009.08.17)은 max 규칙을 말하나 재개발 나대지 출자·청산금 사건이라 보조 근거에 그친다.

(5) 잔존 미확정(착수 전 필수) — max 규칙 예규는 **전부 표2가 보유기간 1축이던 시기(~2018)** 것이다. 현행 표2(보유분 4%/40% + 거주분 4%/40%)에서 비교 대상을 「표1 vs 표2 보유분」으로 볼지 「표1 vs 표2 보유분+거주분」으로 볼지에 관한 예규·심판례는 **부존재**(실측 범위: nts 48건·6건, 조세심판원 5건 전수). 이 선택이 세액을 가르므로 수치(48,961,000 포함)는 이 미결에 종속된다. 표2 **대상 판정**(영 §159의4 거주 2년)은 주택 기준을 유지해야 하며 토지 축으로 옮기면 안 된다.

**제안 수정**

3년 게이트와 표1 공제율은 토지 자신의 취득일로, 표2는 현행대로 주택 보유기간으로 산정한 뒤 재산세과-1693에 따라 둘 중 큰 공제율을 채택하고 표시용 holdingPeriod·step 산식을 채택 축과 일치시킨다. ⚠️ 근거 예규 2건은 표2가 보유 단일축이던 2008~2009년 것이라 현행 표2(보유분+거주분 분리)에 max를 어떻게 대입할지가 미확정 — 착수 전 최신 예규 확인 필수(수치 48,961,000도 그 해석에 종속).

**수정 위험**

**Red가 나는 기존 anchor는 정확히 3건**이며, 전부 `__tests__/tax-engine/transfer/audit-fix-transfer-tax-helpers.test.ts`의 D1 describe다. 이 픽스처는 토지 취득 2021-01-01 · 양도 2024-06-01이라 **토지 본래 보유가 3년 4개월**이므로, 토지 축으로 바꾸면 표1 6%(=6,000,000)가 살아난다:
- `:49` "주 주택 30개월 → deduction 0" → 6,000,000 (RED)
- `:60` "표2 주 주택 30개월 + 거주 30개월 → 0" → 표2는 주택 3년 미달로 미적용, 표1(토지) 6% → 6,000,000 (RED)
- `:71` "경계: 주 주택 35개월 → 0" → 6,000,000 (RED)
- `:81` 36개월 표1 6% / `:92` 36개월 표2 24% 는 GREEN 유지.

⚠️ 이 3건은 「의도된 설계」의 증거가 **아니다**. 파일 헤더(`:4-7`)가 밝히듯 이 테스트들은 #591 감사 R7이 **24개월 게이트 → 36개월 게이트**만 고치며 만든 것이고, 「그 36개월을 누구 것으로 세는가」라는 축은 검토된 적이 없다. 부수 효과로 잘못된 축이 고정된 것이다.

**Green 유지가 확인된 경로**: `new-construction-bundled-case-28.test.ts` T-33(`:627`)은 토지 2021-01-01 → 양도 2023-03-06 = 2년 2개월이라 수정 후에도 LTHD 0으로 그대로 통과한다. T-34~T-37은 세율 단언이라 무관. `case-28-fixtures.ts`(LAND_ACQ 2022-01-08 / TRANSFER 2023-03-06 = 1년 남짓)도 3년 미달이라 무관.

**다른 세목 파급 없음**: `calcLongTermHoldingDeduction`은 양도세 전용이고, `primaryContextForCompanionRate`를 읽는 곳은 `transfer-tax-lthd.ts`와 `transfer-tax-rate-calc.ts:195`(세율 축) 둘뿐이다. 세율 축은 손대지 않으므로 T-34/T-35/T-36 계열 회귀 없음.

**수정 자체의 미확정 지점(착수 전 해소 필요)**: 근거 예규 3건(2008·2009·2018)이 모두 **표2가 보유 단일축이던 시절**의 것이라, 2021년 이후 표2(보유분 4%/yr + 거주분 4%/yr)에 max를 **표2 전체 기준으로** 대입할지 **보유분끼리만** 비교할지 명문이 없다. 다만 이 불확실성은 1세대1주택 경로에만 걸리고, 표2 미적용(다주택) 경로는 §95④ 문리만으로 확정된다 — **표1 축·3년 게이트 축부터 좁게 고치면 미확정 부분에 손대지 않고 실측 48,961,000 오차를 제거할 수 있다.** 표시용 `holdingPeriod`와 step 산식(`:105`·`:122`)도 채택 축과 맞춰야 자기모순 출력이 사라진다.

---

#### F12 · ⑬ 일괄양도 companion payload에 residencePeriodMonths가 없어 부수토지·컴패니언 주택 거주기간이 항상 0이 된다

| | |
|---|---|
| 위치 | `app/api/calc/transfer/bundled-split-helpers.ts:243` |
| 판정 | **CONFIRMED** |
| 심각도 | **high** |
| 도달성 | reachable-via-ui |
| 탐지 축 | lthd |
| 조치 | 배치 5 |

**결함**

companion 엔진 입력 조립은 세대 단위 3값(householdHousingCount·isRegulatedArea·wasRegulatedAtAcquisition)을 primaryEngineInput에서 상속시키면서 거주기간만 `c.residencePeriodMonths ?? 0`(:243)으로 payload를 읽는다. 그런데 ⑬ buildAssetPayload(transfer-tax-api-helpers.ts:562-708)가 그 키를 한 번도 싣지 않는다 — ⑫(transfer-tax-schema-sub.ts:317)과 ⑭에는 있는데 ⑬만 빠진 침묵 strip이다(같은 함수 :625-637에 isOneHousehold·isUnregistered가 같은 이유로 누락됐다 고쳐진 이력 주석이 있다). 결과적으로 companion은 항상 거주 0개월 → 표2 진입 불가. 엔진 주석(:109 「부수토지는 거주기간을 주택과 공유」)과 구현이 어긋난다.

**실패 시나리오**

1세대1주택 고가주택 + 부수토지 companion(2012-06-01 취득→2024-06-01 양도·양도 5억·취득 1억, 주 주택 보유 12년·거주 10년). 현행 거주 0 → 표1 24%·공제 96,000,000·총세액 104,126,000. 거주 120개월 도달 시 표2 80%·공제 320,000,000·총세액 14,124,000 — 90,002,000 과다과세.

**검증자 재현 실측**

probe B (엔진 직접, 부수토지 단건 — 주장과 원 단위 일치): residencePeriodMonths=0 → taxBase 301,500,000 · totalTax 104,126,000 / residencePeriodMonths=120 → taxBase 77,500,000 · totalTax 14,124,000 · 차액 90,002,000. taxBase 차 224,000,000 = LTHD 320,000,000(표2 80%) − 96,000,000(표1 24%).

probe A (callTransferTaxAPI 전 파이프라인): companion 키 13개 = acquisitionCause,acquisitionDate,assetId,assetKind,assetLabel,directExpenses,fixedAcquisitionPrice,fixedSalePrice,isOneHousehold,isUnregistered,landNature,reductions,useEstimatedAcquisition → "residencePeriodMonths" in companion === false. isOneHousehold=true, landNature=appurtenant_to_housing, top-level residencePeriodMonths=120.

probe C (POST /api/calc/transfer 실호출, 1세대1주택 고가주택 15억 + 부수토지 5억/취득 1억, 둘 다 2012-06-01 취득 → 2024-06-01 양도): 현행(⑬ 미전송) totalTax 128,766,000 · land LTHD 88,000,000 / companion residencePeriodMonths:120 주입 시 totalTax 31,333,500 · land LTHD 320,000,000 → 과다과세 97,432,500. (probe B의 90,002,000과 다른 이유는 12억 고가주택 안분이 과세대상 양도차익을 줄이기 때문 — 단건 격리 시나리오에는 안분이 없다.)

validateStepDetailed step1~6 = 전부 null (차단 없음).

**제안 수정**

부수토지(landNature===appurtenant_to_housing)는 ctx.primaryEngineInput에 residencePeriodMonths를 추가해 :243이 주택 값을 상속하게 하고(호출부 route.ts:279-287·CompanionBuildContext 타입 동반 수정), 자산별 거주가 필요한 companion 주택은 buildAssetPayload에서 emit해 ⑫⑬⑭를 맞춘다.

**수정 위험**

낮다 — 그리고 그 이유가 곧 위험 신호다. appurtenant_to_housing를 다루는 기존 테스트 전부가 isOneHousehold:false + residencePeriodMonths:0을 쓴다: __tests__/tax-engine/transfer-tax/_helpers/case-28-fixtures.ts(:64-70·88-94·119-125·149-155) · new-construction-bundled-case-28.test.ts(:81-87·105-111·408-414·438-444) · new-construction-bundled-case-28-g4.test.ts(:90-96·129-135) · __tests__/api/transfer.route.landnature.test.ts(:40 residencePeriodMonths:0, :46 isOneHousehold:false). 즉 L-1b의 표2 분기(isOneHouseSingleForCompanion && table2ResidenceYears>=2)는 어느 테스트도 진입하지 않는다 → 제안 수정으로 red가 나는 기존 테스트가 없다. 이는 「현행 동작이 의도됐다」는 증거가 아니라 그 경로에 안전망이 0건이라는 뜻이므로, 수정과 함께 anchor를 반드시 신설해야 한다.

실제 회귀 위험 지점 2곳: (1) ctx.primaryEngineInput에 residencePeriodMonths를 추가하면 route.ts:279-287 호출부와 CompanionBuildContext 타입(bundled-split-helpers.ts:167-180)을 동반 수정해야 한다 — 두 곳뿐이며 buildCompanionEngineInputs 호출부는 route.ts:274 단 1곳(grep 확인). (2) :243을 무조건 상속으로 바꾸면 companion 주택(별개 주택)이 primary의 거주기간을 물려받아 §154① 비과세·표2 판정이 잘못 열린다 ⇒ landNature==="appurtenant_to_housing" 게이트 필수. lib/tax-engine/transfer-tax-lthd.ts는 타 세목에서 쓰이지 않으므로(transfer 전용) 세목 간 파급은 없다.

---

#### F13 · ⑭ 일괄양도 companion 매핑이 §154⑧3호 통산 3필드를 버려 상속 컴패니언 주택 비과세가 사라진다

| | |
|---|---|
| 위치 | `app/api/calc/transfer/bundled-split-helpers.ts:250` |
| 판정 | **CONFIRMED** |
| 심각도 | **high** |
| 도달성 | reachable-via-ui |
| 탐지 축 | multi |
| 조치 | 배치 5 |

**결함**

buildCompanionEngineInputs(:213-259)가 decedentAcquisitionDate만 매핑하고 decedentSameHouseholdBeforeInheritance·decedentCohabitationHoldingStartDate·decedentCohabitationResidenceMonths를 매핑하지 않는다. 세 필드 모두 ⑫(transfer-tax-schema-sub.ts:348-350)에 있고 ⑬(transfer-tax-api-helpers.ts:652-663)이 실제 전송한다. 엔진은 이 값들로 §154⑧3호 기산일을 앞당기고 거주기간을 통산한다(exemption.ts:399-406·:276-). CompanionRawAsset 인터페이스가 Zod의 부분집합이라 TS도 못 잡는다.

**실패 시나리오**

일괄양도 총 5억: 주 자산 토지 3억(2010-01-01 매매) + 컴패니언 동일세대 상속주택(상속개시 2023-06-01·피상속인 취득 2010-01-01·통산 거주 120개월·본인 거주 6개월), 2024-05-01 양도, isOneHousehold. route 결과 컴패니언 isExempt=false·transferGain 50,000,000·합산 determinedTax 52,830,000. 같은 안분값으로 세 필드를 포함해 calculateTransferTax를 직접 부르면 isExempt=true·determinedTax 0.

**검증자 재현 실측**

route POST(`app/api/calc/transfer/route.ts`, makeMockRates) — 주 자산 토지 300,000,000(취득 150,000,000·2010-01-01 매매, landNature=standalone) + 컴패니언 상속주택 200,000,000(상속개시 2023-06-01·피상속인 취득 2010-01-01·동일세대 개시일 2010-01-01·통산 거주 120개월), 양도 2024-05-01, form.isOneHousehold=true, householdHousingCount=1, bundledSaleMode=actual, 총 500,000,000.

현행(⑭ strip): status 200 · sentCompanionFields=[{same:true, start:"2010-01-01", months:120}] · properties=[{primary, exempt:false, gain:150,000,000}, {companion, exempt:false, gain:50,000,000}] · aggregated.determinedTax = 39,150,000.
세 필드 주입 후: properties=[{primary, exempt:false, gain:150,000,000}, {companion, **exempt:true**, gain:0}] · determinedTax = 21,485,000. 차액 17,665,000.
validateStep(0)~(3) = [null, null, null, null].
키 실측: buildCompanionEngineInputs 출력의 decedent* 키 = ["decedentAcquisitionDate"] 뿐.

⚠️ 원 finding의 "합산 determinedTax 52,830,000"은 makeMockRates·동일 안분값으로 재현되지 않았다(39,150,000). 합산 세액은 세율 fixture·안분 파라미터 의존이라 수치 자체는 fixture 종속이다. "컴패니언 transferGain 50,000,000"과 "세 필드 포함 시 컴패니언 세액 0(isExempt=true)"은 정확히 재현됐다. 원 finding의 "determinedTax 0"은 컴패니언 단건 호출 기준으로 읽으면 맞고, 일괄 합산 기준으로 읽으면 틀리다(주 자산 토지분이 남아 21,485,000).

**제안 수정**

buildCompanionEngineInputs에 세 필드를 추가하고 CompanionRawAsset 인터페이스에도 선언해 다음 누락을 컴파일러가 잡게 한다(단건 engine-input.ts:71-73이 정답).

**수정 위험**

낮음. `buildCompanionEngineInputs`에 3줄 추가(문자열→Date 변환 필요 — `decedentCohabitationHoldingStartDate`는 `toOptionalDate` 또는 `new Date()`; JSON 경유 string이라 `Date < string` 함정 회피가 필수. sibling `engine-input.ts:72`가 `toOptionalDate` 사용) + `CompanionRawAsset`(:100-147)에 3필드 선언.

- `buildCompanionEngineInputs` 호출 지점은 `app/api/calc/transfer/route.ts:274` **단 한 곳**(타 세목 없음). `splitCompanionIntoTwo`는 `...base` spread라 split 경로도 자동 승계.
- 현행 동작을 고정하는 기존 테스트 없음: 세 필드를 세팅하는 파일 전수 grep 결과 컴패니언/bundled 경로 테스트는 0건(`__tests__/api/transfer.route.bundled*.test.ts`·`transfer.route.fractional/landnature.test.ts`·`bundled-companion-one-household.anchor.test.ts` 모두 미사용). 세 필드는 primary 단건 anchor(`inherited-self-transfer-154-8-3`·`inherited-cohabitation-residence-table2`·`non-housing-to-housing-conversion`)와 UI 테스트에서만 쓰인다 ⇒ 수정 시 red 예상 0건.
- 유일한 실질 리스크: 기존 세션에 `decedentSameHouseholdBeforeInheritance=true`가 저장된 컴패니언이 있으면 배선 직후 세액이 낮아진다(= 의도된 정정). ⑧validate가 개시일 필수를 이미 강제(`transfer-tax-validate-asset.ts:541-544`)하므로 게이트만 켜지고 backdate가 없는 상태는 차단된다.
- 회귀 확인은 `npx vitest run __tests__/api/ __tests__/tax-engine/transfer/` 권장.

---

#### F14 · 컴패니언 감면 매퍼가 27 variant 중 3개만 Date 변환 — 같은 감면이 자산1과 자산2에서 다른 세액

| | |
|---|---|
| 위치 | `app/api/calc/transfer/bundled-split-helpers.ts:459` |
| 판정 | **CONFIRMED** |
| 심각도 | **high** |
| 도달성 | reachable-via-ui |
| 탐지 축 | reductions |
| 조치 | 배치 5 |

**결함**

mapCompanionReductions는 public_expropriation·replacement_land_comp·self_farming 3개만 string→Date 변환하고 나머지는 `return r as TransferReduction`으로 통과시킨다. 컴패니언 Zod(transfer-tax-schema-sub.ts:313)는 27 variant 전부를 받는 reductionSchema를 쓰고 클라이언트도 컴패니언마다 같은 toEngineReductions를 태운다(Step5.tsx:553이 모든 자산에 패널 렌더). 결과적으로 §77의3·§97 시리즈·§99의4·§98의9의 일자가 string으로 엔진에 도달해 `Date < string`이 silent false가 되거나 `.getTime()`이 TypeError를 낸다.

**실패 시나리오**

일괄양도 자산2(토지)에 §77의3 개발제한구역 감면(지정 2005-06-01·매수청구 2026-05-01·취득 2003-03-27·산출세액 5천만·과표 9,750만): primary는 40%(①1호) 20,000,000, 동일 입력이 companion에서는 25%(①2호) 12,500,000 — 7,500,000 과대. §97① 임대주택은 25,000,000 → 0(OUT_OF_PERIOD)로 전액 소실. §99의4·§98의9는 `.getTime is not a function` TypeError로 계산 자체가 500.

**검증자 재현 실측**

Probes: __tests__/_scratch/verify-F14-{1..4}.test.ts (deleted after run).

A) gb_designated_land — payload {branch:"in_zone", designationDate:"2005-06-01", triggerDate:"2026-05-01", residedFromAcqToTrigger:true, freeEconZone:false}; ctx calculatedTax=50,000,000, transferDate=2026-06-15, transferIncome=120,000,000, basicDeduction=2,500,000, taxBase=97,500,000, acquisitionDate=2003-03-27.
  mapReductionsToEngine -> designationDate instanceof Date = true; calcReductions -> reductionAmount 24,102,564, reductionRate 0.4, appliedClause "1호", reducibleIncome 47,000,000.
  mapCompanionReductions -> designationDate instanceof Date = FALSE (raw "2005-06-01"); calcReductions -> reductionAmount 15,064,102, reductionRate 0.25, appliedClause "2호", reducibleIncome 29,375,000.
  Delta = 9,038,462 under-reduction on companion (finding claimed 20,000,000 vs 12,500,000 / 7,500,000 — WRONG absolute values, reviewer used rate x calculatedTax instead of the reducibleIncome formula; real gap is LARGER than claimed).

B) rental_97_main — payload {registrationDate:"1995-02-01", rentalStartDate:"1995-03-01", isTaxRegistered:true, rentIncreaseViolated:false, constructionYear:1994, isNationalHousing:true}, acquisitionDate=1994-06-01, same ctx.
  primary  -> reductionAmount 25,000,000, isEligible true, reductionRate 0.5
  companion-> reductionAmount 0, isEligible false, ineligibleReasons ["OUT_OF_PERIOD"]
  EXACT MATCH to the finding's claim (25,000,000 -> 0 OUT_OF_PERIOD, full loss).

C) resolveHouseCountExclusion(ctx {generalHouseAcquisitionDate:2003-03-27, transferDate:2026-06-15}):
  new_99_4_rural  primary -> applied true, isEligible true | companion -> THROW "input.ruralHouseAcquisitionDate.getTime is not a function"
  unsold_98_9     primary -> evaluated, ineligibleReasons [MISSING_PRICE, MISSING_AREA, REGION_UNCONFIRMED, ONE_HOUSE_UNCONFIRMED, SELLER_UNCONFIRMED] | companion -> THROW "input.unsoldHouseAcquisitionDate.getTime is not a function"
  Both TypeErrors confirmed exactly as claimed.

D) unsold_98_3 also diverges (companion adds OUT_OF_CONTRACT_PERIOD from the string contractDate983 vs primary's Date) — additional variant beyond those the finding enumerated.

**제안 수정**

mapCompanionReductions를 삭제하고 bundled-split-helpers.ts:252에서 정본 mapReductionsToEngine(route-reductions-mapper.ts:14)을 직접 호출한다(단건·다건이 이미 쓰는 27 variant 완성본). 두 매퍼가 같은 payload에 같은 결과를 내는지 비교하는 회귀 anchor 1건 추가.

**수정 위험**

LOW.

No existing test pins the buggy behavior. Companion-reduction coverage in the repo uses only `self_farming` — __tests__/api/transfer.route.bundled.test.ts:96 and __tests__/api/transfer.route.bundled-swallows-special.test.ts:351 — which is one of the 3 variants already handled identically by both mappers, so swapping in `mapReductionsToEngine` leaves them green. `grep -rn "mapCompanionReductions"` across app/lib/__tests__/components returns only the definition (:459) and the single call site (:252) — no other consumer, no other tax type touches it (transfer-only file).

One real, non-obvious blocker: `mapReductionsToEngine` is typed `(reductions: ReductionPayload[])` where `ReductionPayload = z.infer<typeof reductionSchema>` (a discriminated union), but `CompanionRawAsset.reductions` at bundled-split-helpers.ts:131 is declared loosely as `Array<{ type: string; businessApprovalDate?: string; incorporationDate?: string; [key: string]: unknown }>`. A direct swap will not typecheck until that field is retyped to the Zod-inferred union. Retyping it is safe (the value genuinely IS the Zod-parsed union — companionAssetSchema line 313 is `z.array(reductionSchema).default([])`), but it may surface follow-on TS errors wherever `CompanionRawAsset` is constructed in tests with loose object literals. Do NOT paper over it with `as never` — that would re-hide exactly the class of silent-strip bug this finding is about.

Also note `.default([])` on the Zod field means `reductions` is always defined post-parse, so the `?? []` at :252 is dead but harmless; leave it (Surgical Changes).

Regression anchor worth adding, as proposed: feed one payload per date-bearing variant to both mappers and assert deep equality — that pins the two paths together permanently and would have caught this.

---

#### F15 · ⑭ engine-input.ts가 carryoverTaxation의 donorRelation·donorDeceased를 침묵 strip — §97의2① 사망·관계 배제 미적용

| | |
|---|---|
| 위치 | `app/api/calc/transfer/engine-input.ts:85` |
| 판정 | **CONFIRMED** |
| 심각도 | **high** |
| 도달성 | reachable-via-ui |
| 탐지 축 | plumbing |
| 조치 | — |

**결함**

engine-input.ts:85-96이 carryoverTaxation을 명시 필드 나열로 재조립하는데 donorRelation·donorDeceased가 목록에 없다. ④(transfer-tax-api-carryover.ts:77-78)는 보내고 ⑫(transfer-tax-schema.ts:363-364)는 통과시키며 엔진(transfer-tax-carryover.ts:146 isCarryoverRelationExcluded)은 소비한다 — ④⑫⑧⑤가 다 갖춰졌는데 ⑭ 한 곳에서만 사라진다.

**실패 시나리오**

주택 양도 15억(2030-05-31)·이월과세(증여등기 2023-06-01·증여자 취득 2005-01-01·취득가 2억·증여시 평가 9억·증여세 1억) + 증여자 관계 「배우자」 + 「증여자 사망」 선언. 현재: carryoverEligible=true → 취득가액 2억 → 결정세액 315,810,000. 두 필드 도달 시 exclusionReason=relation_invalid → 취득가액 9억 → 184,770,000. 131,040,000 과대(§97의2① 배우자 괄호 「사망으로 혼인관계가 소멸된 경우 제외」).

**검증자 재현 실측**

시나리오(probe 실측): housing / 양도가 1,500,000,000 / 양도일 2030-05-31 / 취득일=증여등기일 2023-06-01 / carryoverTaxation{donorAcquisitionDate 2005-01-01, donorAcquisitionPrice 200,000,000, giftDateValuation 900,000,000, giftTaxAmount 100,000,000, donorRelation "spouse", donorDeceased true} / isOneHousehold false / householdHousingCount 1 / mock rates.
· ⑫ Zod parse 후 키 10개(donorRelation·donorDeceased 포함) → ⑭ engineInput 키 8개(두 필드 소멸).
· 현재(⑭ strip): determinedTax = 315,810,000 · carryoverTaxationDetail.isEligible = true · exclusionReason = undefined · adoptedScenario = "A".
· 두 필드 도달 시: determinedTax = 184,770,000 · isEligible = false · exclusionReason = "relation_invalid" · adoptedScenario = "B".
· 차이 = 131,040,000 (과대). ⑧ validateAssetAcquisition = null(차단 없음), ④ payload = {…, donorRelation:"spouse", donorDeceased:true}.

**제안 수정**

engine-input.ts:86-95에 두 줄 추가(Date 변환 불요). GB 경로(engine-input.ts:348)가 `...data.generalBuildingValuation` spread로 중첩 필드를 살리는 것과 대비되는 명시 나열의 구조적 위험이므로, 회귀 방어로 wiring 테스트에 ⑭ 케이스를 추가한다.

**수정 위험**

낮다. `engine-input.ts:86-95`에 `donorRelation: data.carryoverTaxation.donorRelation,` `donorDeceased: data.carryoverTaxation.donorDeceased,` 2줄 추가(Date 변환 불요). 타입은 이미 존재한다(`lib/tax-engine/types/transfer-carryover.types.ts:61·67`)라 tsc 통과.
· 회귀 위험: `buildTransferEngineInput` 호출 테스트 2건(`__tests__/calc/split-appraisal-exemption-plumbing.test.ts`·`__tests__/api/commercial-appurtenant-land-wiring.test.ts`)은 carryover를 건드리지 않는다 — 현행 8키 모양을 고정하는 red 테스트 없음. 즉 "현 동작이 의도"라는 증거도 없다.
· 기존 사용자 영향: `CARRYOVER_DEFAULTS`가 donorRelation ""·donorDeceased false이고 ④가 `|| undefined`로 걸러 보내지 않으므로(probe 확인), 구형 sessionStorage·미입력 케이스는 payload에 두 필드가 없어 **세액 변화 0**. 값이 실제로 선택된 경우에만 §97의2① 배제가 살아난다.
· 유일한 주의: 이 수정으로 route 경유 세액이 바뀌므로, carryoverTaxation을 route로 통과시키는 E2E/통합 anchor가 있으면 기대값 재확인 필요. 다만 회귀 방어를 위해 `carryover-donor-death-wiring.test.ts`에 ⑭ 케이스(propertySchema.parse → buildTransferEngineInput 키 존재)를 추가하는 것이 제안대로 타당하다.

---

#### F16 · ⑫ companionAssetSchema에 carryoverTaxation이 없어 컴패니언 이월과세 취득가액이 0으로 떨어진다

| | |
|---|---|
| 위치 | `lib/api/transfer-tax-schema-sub.ts:286` |
| 판정 | **CONFIRMED** |
| 심각도 | **high** |
| 도달성 | reachable-via-ui |
| 탐지 축 | plumbing |
| 조치 | ⏸ **사용자 판단 대기** |

**결함**

companionAssetSchema(:286-399)의 acquisitionCause enum은 carryover_gift를 허용하지만 carryoverTaxation 서브객체를 선언하지 않는다. ④(transfer-tax-api-helpers.ts:672-679)가 실어 보내지만 Zod가 통째로 버리고, 이후 companionFixedAcq(bundled-split-helpers.ts:554-566)는 purchase·inheritance만 분기하며 fixedAcqRaw도 carryover_gift를 채우지 않아 취득가액이 undefined가 된다. UI는 컴패니언 카드에도 「이월과세(증여)」 옵션을 제공하고(CompanionAcquisitionCauseSection.tsx:31) validate SINGLE_ONLY 차단 목록에도 없다.

**실패 시나리오**

「함께 양도」 2자산 — 주 토지(매매 4억) + 컴패니언 주택(이월과세: 증여등기 2023-06-01·증여자 취득가 3억·증여시 평가 7억·증여세 8천만), 총 양도 20억, 기준시가 1:1 안분. 현재 컴패니언 취득가액 0 → 양도차익 10억 → 자산 결정세액 333,660,000·합계 517,935,000. 대조군(단순 증여·취득가 7억)은 80,380,000·합계 250,290,000 — 최소 267,645,000 과대.

**검증자 재현 실측**

원 보고의 원(₩) 수치는 시나리오가 미완결(주자산 취득일·양도일·LTHD 보유연수·세대 주택수 미기재)이라 **그대로 재현되지 않았다**. 내 파라미터화(주 토지 매매 4억/2015-01-01, companion 주택 carryover_gift/증여등기 2023-06-01·증여자취득 2010-03-01·증여자취득가 3억·증여시평가 7억·증여세 8천만, 양도일 2025-05-01, 총양도 20억, 기준시가 5억:5억) 실측:

[결함 경로] `apportioned`: primary allocatedSalePrice 1,000,000,000 / allocatedAcquisitionPrice 400,000,000 — companion allocatedSalePrice 1,000,000,000 / **allocatedAcquisitionPrice 0**. aggregated: primary acq 400,000,000 gain 600,000,000 determined 166,060,000 · companion acq **0** gain **1,000,000,000** determined **600,000,000** · 합계 determinedTax **764,560,000**.

[대조군] companion을 `gift` + fixedAcquisitionPrice 700,000,000으로 바꾸면: companion acq 700,000,000 gain 300,000,000 determined 180,000,000 · 합계 **344,560,000**.

⇒ 과대 세액 **420,000,000**(원 보고 주장 267,645,000보다 크다 — 방향·자릿수는 일치, 절대값은 시나리오 파라미터 차이).

Zod strip 실측: `companionAssetSchema.parse()` 후 잔존 키 8개 = `acquisitionCause, acquisitionDate, assetId, assetKind, assetLabel, isOneHousehold, reductions, standardPriceAtTransfer`, `"carryoverTaxation" in parsed === false`.
④ 실측: `buildAssetPayload(companion, "apportioned", ...)` → `carryoverTaxation` 존재(8필드 전송), `fixedAcquisitionPrice === undefined`.
⑧ 실측: `collectStepIssues(step, form)` step 1~6 전부 `[]`(차단 0건).

**제안 수정**

(a) companionAssetSchema에 carryoverTaxation을 단건과 같은 shape로 선언하고 companion 엔진 input 매핑에 추가, 또는 (b) 그 전까지 transfer-tax-validate.ts:126 SINGLE_ONLY에 carryover_gift 컴패니언을 추가해 명시 차단(다건 validateMultiSupportedMode:66-68과 같은 정책).

**수정 위험**

기존 테스트가 현행 동작을 고정하고 있지 않다 — `__tests__/api/transfer.route.bundled.test.ts`·`transfer.route.bundled-swallows-special.test.ts`에 carryover 단언 0건, `e2e/carryover-donor-death.spec.ts`·`e2e/transfer-bundled-amendment.spec.ts` 모두 「2자산 + carryover」 조합 없음. 즉 red 위험은 낮고, 「이 동작이 의도된 것」이라는 테스트 증거도 없다.

수정 (a)(정식 지원)의 위험 — 3계층을 **동시에** 고쳐야 no-op이 안 된다(⑫ 스키마 + ⑭ `buildCompanionEngineInputs` 매핑 + ④/`companionFixedAcq` 취득가액 경로). 그 위에 설계 위험이 하나 더 있다: 일괄 route는 `transferPrice`를 기준시가 안분값으로 덮어쓰는데 §97의2② 비교과세는 엔진 STEP 0.475(`lib/tax-engine/transfer-tax.ts:128-134`) 안에서 그 안분값으로 돌게 된다. 이는 `lib/calc/transfer-tax-validate.ts:104-111` 주석이 기록한 부담부증여 일괄 「스케일 충돌 → 표시 필요경비 음수」와 같은 클래스라 실측 검증 없이 열면 안 된다. 범위는 좁다 — `companionAssetSchema`는 `transfer-tax-schema.ts:327` 한 곳에서만 쓰이고 타 세목 재사용 0건.

수정 (b)(명시 차단)의 위험 — `transfer-tax-validate.ts:126`의 SINGLE_ONLY는 `form.assets.length > 1`에서 돌아 **지분 분할(fractional) 카드도 함께 걸린다**. 비-일반건물 지분 분할은 route 5-a(일괄)로 흘러 idx>0 지분의 carryover가 지금도 똑같이 깨져 있으므로 차단 자체는 정합적이지만, 「자산 2개인데 primary만 carryover」인 현재 정상 동작 조합까지 막게 된다(SINGLE_ONLY가 `some()`이므로). 그 부작용을 피하려면 술어를 `assets.slice(1).some(...)`로 좁히거나, `fullFractional` 예외와 같은 방식으로 예외를 두어야 한다 — 그 판단은 `multi-transfer-tax-validate.ts:66-68`이 다건에서 primary 1건만 보고 전면 차단한 것과 대칭을 맞출지에 달렸다.

---

#### F17 · 겸용주택·일반건물 dispatch 분기가 reductions를 엔진에 전혀 전달하지 않아 감면·가산세가 침묵 무시된다

| | |
|---|---|
| 위치 | `app/api/calc/transfer/route.ts:376` |
| 판정 | **PARTIALLY_CONFIRMED** · 법령 PARTIALLY_CONFIRMED |
| 심각도 | **high** |
| 도달성 | reachable-via-ui |
| 탐지 축 | reductions / mixed |
| 조치 | ⏸ **사용자 판단 대기** |

**결함**

겸용 분기는 `calcMixedUseTransferTax(transferPrice, transferDate, mixedAsset, rates, amendment)`만 부르고(MixedUseAssetInput에 reduction 필드 0건), 일반건물 분기(:425 dispatchGeneralBuilding → calculateGeneralBuildingTransfer)도 priorReductionUsage만 받는다. 그런데 클라이언트는 자산 종류와 무관하게 reductions를 body 최상위에 항상 싣고(transfer-tax-api.ts:473) Zod도 항상 받으며, UnifiedReductionPanel은 assetKind 게이트 없이 standalone 4종(§69·§77·§77의2·§77의3)을 렌더한다(asset-kind-gate.ts:55 `case "standalone": return true`). 가산세도 같다 — 겸용은 buildPenaltyAmendmentPayload가 실어 보내지만 route가 버리고 어댑터가 reductionAmount:0·penaltyTax:0을 하드코딩한다(MixedUseResultCardAdapter.ts:61·64).

**실패 시나리오**

겸용주택을 공익수용으로 양도하며 Step5에서 §77 감면(현금보상 8억·2025년 이후 15%)을 선택하면 validate·Zod를 통과하지만 세액이 감면 미선택과 완전히 동일하고 결과 카드에 「감면 미적용」 안내가 없다. 같은 화면의 §164⑨1호 공익수용 평가 특례는 겸용에 구현돼 있어 사용자는 전부 반영된 것으로 오인한다. 일반건물+§77의3, 겸용+무신고 가산세(신고서 ㉚㉛ 0)도 동일.

**검증자 재현 실측**

All via `POST /api/calc/transfer` with mocked rates (`makeMockRates()`), 양도일 2025-06-01, 취득일 2009-03-01. §77 payload: `{type:"public_expropriation", cashCompensation:800,000,000, bondCompensation:0, businessApprovalDate:"2024-01-01"}`.

**겸용주택 (mode "mixed-use", 양도가 1,500,000,000):**
- reductions [] → total `{taxBase:192,485,000, transferTax:53,204,300, localTax:5,320,430, totalPayable:58,524,730}`
- reductions [§77] → **identical, 58,524,730** (델타 0원). `result.total`에는 `reductionAmount` 키 자체가 없음 (result 최상위 키: splitMode, apportionment, housingPart, commercialPart, nonBusinessLandPart, total, steps, calculationRoute, warnings).
- + filingPenaltyDetails(filingType "none") → **identical, 58,524,730** (델타 0원).

**일반건물 (mode "bundled", 양도가 1,000,000,000, 환산):**
- reductions [] → `determinedTax 111,380,000 / totalTax 122,518,000 / reductionAmount 0 / penaltyTax 0`
- reductions [§77] → **identical** (111,380,000 / 122,518,000 / reductionAmount **0**)
- reductions [§77의3 gb_designated_land] → **identical** (111,380,000 / 122,518,000)
- + filingPenaltyDetails → **identical** (122,518,000)

**대조군 — 같은 payload가 단건 경로에서는 no-op이 아니다 (propertyType "housing", 동일 금액):**
- 감면: determinedTax 315,810,000 → **268,438,500** (`reductionAmount 47,371,500`, `reductionType` 노출), totalTax 347,391,000 → 295,282,350
- 가산세: totalTax 347,391,000 → **410,553,000** (+63,162,000)

**validate 실측:** `collectStepIssues(2, form)` = `[]` (겸용+§77, 일반건물+§77 둘 다). step0의 유일한 이슈는 면적 미입력으로 감면과 무관.

**⚠️ 정정된 주장** (원 보고가 과장·부정확했던 부분)

겸용주택(`route.ts:319-389`)·일반건물(`route.ts:392-452`) 분기가 `reductions`와 `filingPenaltyDetails`·`delayedPaymentDetails`를 엔진에 **전달하지 않아 침묵 무시**된다. 겸용은 `MixedUseAssetInput`에 감면 필드가 아예 없고(`transfer-mixed-use.types.ts` reduction 0건), 일반건물은 `dispatchGeneralBuilding`이 `priorReductionUsage`만 받고 `general-building-route-cards.ts:115`가 카드마다 `reductions: []`를 하드코딩한다. 실측 델타 **0원**(위 수치) — 같은 payload가 단건 경로에서는 47,371,500원(감면)·63,162,000원(가산세)을 움직인다.

도달 경로는 완전히 열려 있다: `UnifiedReductionPanel`이 standalone 4종을 assetKind 무관하게 렌더(§77 checkbox `UnifiedReductionPanel.tsx:378`, 게이트 `asset-kind-gate.ts:55`), validate step2가 0건 반환, Zod 200. 결과 카드는 `MixedUseResultCardAdapter.ts:61·64`가 `reductionAmount:0`·`penaltyTax:0`을 하드코딩해 「감면 미적용」 고지도 없다.

**원 finding에서 정정할 것 2가지**:
(a) **`amendment`(수정신고·경정청구)는 버려지지 않는다** — `route.ts:383`이 `engineInput.amendment`를 겸용 엔진에 전달하고 `e2e/mixed-use-amendment.spec.ts`·`mixed-use-amendment.test.ts`가 이를 고정한다. 유실되는 것은 `filingPenaltyDetails`·`delayedPaymentDetails`(무신고·과소신고·납부지연)뿐이다. "가산세를 통째로 버린다"는 서술은 과장.
(b) 어댑터 경로는 `components/calc/transfer/result/`가 아니라 `components/calc/results/mixed-use/MixedUseResultCardAdapter.ts`(라인 61·64는 정확).

이 결함이 「의도된 미지원」이 아니라는 결정적 근거는 **같은 파일이 같은 패턴의 결함을 이미 한 번 고쳤다는 것**이다 — `general-building-route-cards.ts:104-115`의 `isUnregistered` 주석: "종전에는 `false` 하드코딩이라 폼에서 미등기를 켜도 엔진에 도달하지 못했다(세액 변화 0)". 그 바로 다음 줄이 `reductions: []`다.

**법령 독립확인**

법령 쪽만 독립 확인했다(코드 재현은 미실시). 결론: finding의 **법적 전제는 3/4 성립**하되, standalone 4종을 뭉뚱그린 부분이 부정확하다.

**① §77 — 건물 포함이 명문이다 (위임 체인 끝까지 추적).**
조특법 §77①1호는 "공익사업에 필요한 **토지등**을 그 공익사업의 시행자에게 양도함으로써 발생하는 소득"이라 하고, 3호는 "…법률에 따른 **토지등**의 수용으로 인하여 발생하는 소득"이라 한다. "토지등"은 공익사업법 §2 1호가 "제3조 각 호에 해당하는 토지·물건 및 권리"로 정의하고, §3 2호가 "토지와 함께 공익사업을 위하여 필요한 입목(立木), **건물**, 그 밖에 토지에 정착된 물건"을 명시한다. 조특령 §72 ①~⑧ 전문을 읽었으나 채권 종류·대상 법률·감면신청 절차만 규정할 뿐 **자산 종류를 좁히는 문언·괄호·단서가 없다**. ⇒ 겸용주택·일반건물이 수용되면 §77 감면 대상이다.

**② §77의2 — 동일 정의 차용.** 조특법 §77의2①도 "…취득한 **토지등**을 2026년 12월 31일 이전에 해당 공익사업의 시행자에게 양도함으로써 발생하는 양도차익"으로 같은 공익사업법 "토지등"을 쓴다 ⇒ 건물 포함.

**③ §77의3 — 경로에 따라 갈린다(finding이 구분하지 않은 부분).** 조특법 §77의3①은 "개발제한구역 내의 해당 **토지등**을 같은 법 제17조에 따른 토지매수의 청구 또는 같은 법 제20조에 따른 협의매수를 통하여" 양도한 경우다. 그런데 개발제한구역법 §17①은 매수대상을 "**토지**"로만 정의하고("…그 효용이 현저히 감소된 토지나 그 토지의 사용 및 수익이 사실상 불가능하게 된 토지(이하 "매수대상토지"라 한다)"), §20①은 "개발제한구역의 **토지와 그 토지의 정착물**(이하 "토지등"이라 한다)"로 정착물(건물)을 포함한다. ⇒ **§20 협의매수 경로에서만 건물 포함.**

**④ §69 — 건물에 애초에 적용 불가(finding의 과대 포섭).** 조특법 §69①은 "직접 경작한 토지 중 대통령령으로 정하는 토지"이고, 조특령 §66④은 그 토지를 "자기가 경작한 사실이 있는 **농지**"로 한정한다. 겸용주택·일반건물(토지+건물 일괄)은 자경농지가 아니다. ⇒ §69에 관한 한 route가 값을 버리는 것이 **결과적으로 옳은 답**을 낸다(우연히). 오히려 asset-kind-gate.ts:55의 `case "standalone": return true`가 §69를 겸용·일반건물에 **과잉 개방**하는 반대 방향 결함이다.

**⑤ 가산세 — 자산 종류 배제 근거 조문이 부존재한다.** 국세기본법 §47의3①은 "납세의무자가 법정신고기한까지 세법에 따른 국세의 과세표준 신고…를 한 경우로서 납부할 세액을 신고하여야 할 세액보다 적게 신고…한 경우에는 …가산세로 한다"이고, §48②은 "정부는 다음 각 호의 어느 하나에 해당하는 경우에는 이 법 또는 세법에 따른 해당 가산세액에서 다음 각 호에서 정하는 금액을 감면한다"이다. 두 조문 본문·각 호·단서 어디에도 **양도 자산의 종류에 따른 예외·배제 문언이 없다**. §47의3④은 부적용 사유를 열거하지만 상속·증여 평가 착오, 부담부증여 양도분(1의2호), 부가세 등 **특정 사유 한정**이며 겸용주택·일반건물은 없다. ⇒ 겸용이라는 이유로 penaltyTax를 0으로 두는 것은 법령상 근거가 없다.

**선례**: 조심 2009광2620(2010.06.08)은 사실관계가 정확히 **주상겸용 건축물 수용** 케이스다 — "토지 159㎡와 지상건축물 176.4㎡…쟁점건축물(주상겸용)…2008.3.28. 보상금을 지급받은". 겸용주택이 공익사업 수용 대상이 되는 것은 실재하는 사실관계임이 확인된다(쟁점은 양도시기라 §77 감면 자체를 판시하진 않음). 국세청 해석 [2691233](2026.04.03) "주택의 토지와 건물 순으로 시차를 두고 수용되는 경우"도 건물 수용이 현재도 다뤄지는 통상 사안임을 보여준다. 다만 「겸용주택·일반건물에 §77 감면을 적용한다」를 **정면으로 판시한 예규·심판례는 검색되지 않았다**(nts·tax_tribunal 다중 키워드 6회 질의) — 조문이 명확해 다툼이 없는 것으로 보이나, 이 점은 **선례 부존재**로 명시한다.

> 조문 정정: 「겸용주택·일반건물 dispatch가 reductions를 엔진에 전달하지 않아 감면이 침묵 무시된다」는 법적 전제는 **조특법 §77·§77의2·§77의3에 한해 성립**한다. 근거는 조특법 §77①의 "토지등"이 공익사업법 §2 1호 → §3 2호로 위임되어 **"건물"을 명문으로 포함**하고, 조특령 §72에 자산 종류를 좁히는 문언이 없기 때문이다. §77의2도 동일 정의를 차용한다. §77의3은 **개발제한구역법 §20 협의매수 경로에서만** 건물 포함이고(§20① "토지와 그 토지의 정착물"), **§17 토지매수청구 경로는 "매수대상토지"로 토지 한정**이므로 건물 부분은 대상이 아니다 — finding은 이 경로 구분을 하지 않았다.

**정정 1**: finding이 "standalone 4종(§69·§77·§77의2·§77의3)"을 동일 취급한 것은 부정확하다. **조특법 §69 자경농지는 조특령 §66④이 대상을 "농지"로 한정**하므로 겸용주택·일반건물에는 법적으로 적용될 여지가 없다. §69에 관한 한 route가 값을 버리는 것은 결과적으로 옳다. 실제 결함은 반대 방향 — `asset-kind-gate.ts:55 case "standalone": return true`가 §69를 겸용·일반건물에 과잉 개방하는 것이다. 따라서 「침묵 무시로 과대과세」 주장은 **4종이 아니라 3종(§77·§77의2·§77의3)** 기준으로 좁혀야 한다.

**정정 2**: 가산세 부분은 finding이 옳고 오히려 근거가 더 강하다. 국세기본법 §47의3①·§48②은 본문·각 호·단서 어디에도 양도 자산의 종류에 따른 예외가 없고, §47의3④의 부적용 사유는 한정 열거로서 겸용주택·일반건물을 포함하지 않는다. **자산 종류를 이유로 가산세를 0으로 두는 근거 조문은 부존재**한다. 다만 penaltyTax 하드코딩 0은 과대과세가 아니라 **과소과세** 방향이라 §77 감면 누락(과대과세)과 오류 방향이 반대다 — finding이 둘을 "같다"고 묶은 것은 배관 관점에서는 맞지만 세액 영향 방향은 구분해야 한다.

**정정 3**: finding의 중기 제안 "파트별 calculateTransferTax로 전달"은 조특법 §133②과 충돌할 수 있다(아래 fixRisk 참조) — 조문상 한도는 파트 단위가 아니라 **과세기간 단위 합계액**이다.

**제안 수정**

단기: 겸용·일반건물 자산에 감면·가산세가 입력되면 validate에서 명시 차단한다(transfer-tax-validate.ts:110-140 SINGLE_ONLY 가드가 「침묵 오산보다 명시 차단」 규약을 이미 선언). 중기: MixedUseAssetInput·calculateGeneralBuildingTransfer에 reductions를 받아 파트별 calculateTransferTax로 전달. 엔진 신설분은 백로그(droppedAsNotImplemented 참조) — 이 항목은 「입력 UI가 열려 있는데 침묵 무시」 배관 결함에 한정한다.

**수정 위험**

**단기(validate 명시 차단) — 낮음, 단 범위를 좁혀야 한다.** GB 관련 E2E 3건(`general-building-carryover`·`-nbl-section-in-basic`·`-fractional-share`)은 "감면·공제" 스텝을 **통과만** 하고 감면을 선택하지 않으므로, "감면이 실제로 선택된 경우에만" 발화하는 가드는 red를 내지 않는다. 겸용 E2E 12건(`mixed-use-*.spec.ts`)에도 감면 선택이 없다. ⚠️ 다만 `transfer-tax-validate.ts:114-117`이 **과차단 금지의 선례를 명문화**하고 있다 — `commercial_building`은 "실측 결과 계산 정상"이라 일부러 SINGLE_ONLY에서 뺐다. 자산종류 전체를 막는 blanket 가드는 이 정책과 충돌하고, 메모리 `feedback_blocking_validation_full_e2e_regression`(차단 validation 도입 시 전체 E2E 회귀) 대상이므로 반드시 `reductions.length > 0` 조건부여야 한다.

**중기(엔진 배관) — 겸용과 일반건물의 위험이 다르다.**
- **일반건물: 낮음.** 기존 anchor는 전부 `reductions: []`를 보내므로 `general-building-route-cards.ts:115`를 실인자로 바꿔도 기존 값이 안 변한다. `calculateTransferTaxAggregate`는 이미 `reductionAmount`·`reductionBreakdown`을 산출한다(현재 상시 0).
- **겸용: 배관이 아니라 신규 기능.** `MixedUseTotalTax`에 `reductionAmount` 필드 자체가 없고(`result.total` 키 실측), 어댑터·결과카드·신고서까지 새 필드가 번져 나간다. 더 근본적으로 §77 한도(연 2억)와 조특법 §127⑦ 중복배제를 **주택분/상가분/비사토분 3파트에 어떻게 귀속시킬지**가 미결이라 법령 설계가 선행되어야 한다. 이 항목을 "감면을 겸용에 구현하라"로 확대하면 리뷰 범위를 벗어난다 — finding 자신이 스코프를 「입력 UI가 열려 있는데 침묵 무시」로 한정한 것이 옳다.

**고정 테스트 없음(= 현행 동작이 의도라는 증거 없음):** 겸용·GB 경로에서 `reductionAmount === 0`을 단언하는 테스트를 찾지 못했다(`__tests__/tax-engine/transfer/mixed-use-*.test.ts` 11파일에 `reductions` 0건). 즉 수정해도 red가 나지 않는다.

---

#### F18 · §97②2호 단서가 겸용주택 PHD(미공시 환산) 경로에서 주택분에 미적용 — 필요경비가 본문·단서 하이브리드가 된다

| | |
|---|---|
| 위치 | `lib/tax-engine/transfer-tax-mixed-use-housing.ts:61` |
| 판정 | **CONFIRMED** |
| 심각도 | **high** |
| 도달성 | reachable-via-ui |
| 탐지 축 | mixed |
| 조치 | 배치 6 |

**결함**

오케스트레이터(transfer-tax-mixed-use.ts:283-302)는 단서 발동 시 calcHousingGainSplit·calcCommercialGainSplit을 swapToDirect=true로 재호출하는데, calcHousingGainSplit의 PHD 분기(:61-136)는 swapToDirect를 한 번도 읽지 않고 조기 return한다 → 주택분은 본문(환산취득가+개산공제) 그대로. 동시에 공통 실비 안분기(mixed-use-helpers.ts:154-163)가 acquisitionStandardPrice.housingPrice를 분자로 쓰는데 PHD 모드에서는 그 필드가 구조적으로 undefined(UI가 칸을 숨김) → housingRatio 0 → 나목 전액이 상가분에 배분된다.

**실패 시나리오**

겸용+§164⑦ PHD+자산 자본적지출 9억, 양도 15억(2024-03-01 양도·1998-03-01 취득·주택 60㎡/상가 40㎡·다주택). 엔진은 proviso={estimatedSide 609,157,690, directSide 900,000,000, chosen "direct"}를 기록하면서 주택분 취득가액 384,615,384+개산공제 3,692,306을 그대로 차감하고 상가분만 취득가액 0·필요경비 9억이 된다. 필요경비 총합 1,288,307,690으로 본문(609,157,690)도 단서(900,000,000)도 아님 → 총 납부세액 139,517,231(본문대로면 247,409,402, 107,892,171 과소). 비-PHD 대조군은 단서가 정확히 적용된다(155,166,000).

**검증자 재현 실측**

주장 시나리오 원단위 완전 재현(겸용·PHD·2024-03-01 양도 15억·1998-03-01 취득·주택60/상가40㎡·다주택, 취득시 개별주택가격 없음, PHD P_A_est=123,076,923):
· proviso = {estimatedSide: 609,157,690, directSide: 900,000,000, chosen: "direct"} ← 주장과 동일
· 주택분 취득가액 384,615,384 + 개산공제 3,692,306 그대로 차감(=본문 유지), 상가분 취득가액 0 · 필요경비 900,000,000 ← 주장과 동일
· 필요경비 총합 1,288,307,690(=384,615,384+3,692,306+900,000,000) ← 주장과 동일
· total.totalPayable 139,517,231 / 실비 미입력·미발동 시 247,409,402 ← 주장과 동일
· apportionAcquisitionPrice(9억, PHD자산) = {housingRatio: 0, housingAcqPrice: 0, commercialAcqPrice: 900,000,000} ← 메커니즘 ② 실측
· 비-PHD 대조군(취득시 개별주택가격 123,076,923) = 155,166,000, hAcq 0·cAcq 0, 필요경비 573,705,179+326,294,821=900,000,000 ← 주장과 동일

추가 실측(원 주장에 없는 것):
· 정정 기준선: 단서가 올바로 적용되면 155,166,000이므로 이 픽스처의 실제 오차는 155,166,000−139,517,231 = **15,648,769 과소**(주장한 107,892,171은 「본문 기준선」 대비값).
· 자본적지출 6.5억: PHD 139,517,231 vs 대조군 234,201,001 → **94,684,770 과소**(상가분 차익 음수 clamp가 덜 먹어 오차가 훨씬 커진다).
· 양도비 9억(자본적지출 0): PHD 209,684,792 vs 대조군 155,166,000 → **54,518,792 과다**. 즉 방향이 나목의 성질(취득시 축/양도시 축)에 따라 뒤집힌다.
· Case A 4부분(1985 취득·2005 최초고시·2011 용도변경·2023-02-16 양도 13억): 자본적지출 9억 유무 무관 352,211,435 동일, proviso는 {estimatedSide 85,094,509, directSide 900,000,000, chosen "direct"} 기록 → 단서 완전 무효(과다과세).
· 기존 anchor 32건(mixed-use-97-2-proviso / mixed-use-common-expense / mixed-use-phd-case-a-fourpart) 전부 green — 이 경로를 보는 테스트가 하나도 없다.

**제안 수정**

① PHD 분기(:109-135)에도 비-PHD 분기(:195-196·:231)와 동일한 swapToDirect 처리를 넣는다. ② 공통 실비 안분 분자를 PHD가 역산한 취득시 개별주택가격(phdResult.estimatedHousingPriceAtAcquisition)으로 주입하거나 파트별 취득시 기준시가 합 축으로 통일한다. ③ PHD×단서 anchor(P7) 추가.

**수정 위험**

medium.
· 안전망 실측: 이 경로를 고정하는 테스트가 **0건**이다(`mixed-use-97-2-proviso.anchor.test.ts` P1~P6은 전부 비-PHD 픽스처, `mixed-use-common-expense.anchor.test.ts` X1~X4도 PHD 없음, PHD 테스트 4종은 capitalExpenditure/transferExpense를 단 한 곳도 넣지 않는다 — grep 실측). 즉 「현행 동작이 의도된 것」이라는 테스트 증거가 없고, 수정해도 기존 red는 안 난다.
· 수정 ①(PHD 분기 swapToDirect 처리)의 위험: `calcHousingGainSplit`의 PHD 분기는 지금 `resolvePartNecessaryExpense`/공통 실비 블록 자체가 없다(그 블록이 :217 이후라 return 뒤). 단순히 취득가액 슬롯을 0으로만 만들면 나목이 어디에도 안 실려 **과다과세로 뒤집힌다** — 필요경비 주입까지 세트로 해야 한다. 또 PHD+상속(:71-107)은 `provisoEligible=false`라 손대면 안 되고(무관 회귀), 4부분 어댑터 2개(`buildHousingGainSplitFromFourPart`/`buildCommercialGainSplitFromFourPart`)도 같이 고쳐야 한다.
· 수정 ②(안분 분자 교체)의 위험: `apportionAcquisitionPrice`(mixed-use-helpers.ts:149)는 3곳이 쓴다 — 오케스트레이터 STEP 2.5 실가/감정·매매사례 총액 안분(`transfer-tax-mixed-use.ts:220`), 주택분 공통 자본적지출(`housing.ts:217`), 상가분 공통 자본적지출(`commercial.ts:177`). STEP 2.5 경로는 validate(`transfer-tax-validate-mixed-use-asset.ts:80`)가 취득시 개별주택가격을 필수로 요구하므로 분자가 항상 존재 → PHD 한정 주입이면 그 경로 회귀 위험은 없다. 단 상가분(`commercial.ts:177`)은 잔액 흡수(`total − housing`)라 분자를 바꾸면 **상가분도 동시에** 변한다 — 주택분만 고치고 상가분을 그대로 두면 합계가 나목과 어긋난다.
· 동명 이함수 주의: `lib/tax-engine/burdened-gift-valuation.ts:221`에도 `apportionAcquisitionPrice`가 있으나 시그니처·용도가 전혀 다르다(부담부증여). 전역 치환 금지.
· 회귀 확인 범위: `npx vitest run __tests__/tax-engine/transfer-tax/ __tests__/tax-engine/transfer/` (겸용 anchor 14+3파일) + PHD 4파일.

---

#### F19 · 겸용주택에서 감정가액·매매사례가액 모드에도 §97②2호 단서가 발동한다 — 「환산취득가액으로 하는 경우」 게이트 누락

| | |
|---|---|
| 위치 | `lib/tax-engine/transfer-tax-mixed-use.ts:278` |
| 판정 | **CONFIRMED** |
| 심각도 | **high** |
| 도달성 | reachable-via-ui |
| 탐지 축 | mixed |
| 조치 | 배치 6 |

**결함**

`provisoEligible = !acquisitionByInheritance && !acquisitionByGift && !useActualAcquisition` — useAppraisalSalesAcquisition이 빠져 있다. 「소득세법」 §97②2호 단서는 「취득가액을 환산취득가액으로 하는 경우」 한정이고 감정가액·매매사례가액(§176의2②③)은 같은 호 본문이다. 겸용 감정·매매사례는 취득가액 총액을 §100②로 안분해 직접 쓰는 경로인데 단서가 발동하면 그 안분값이 통째로 0이 된다.

**실패 시나리오**

겸용+감정가액 모드(총액 5억)+자산 자본적지출 9억, 양도 15억(2024-03-01·다주택). proviso={estimatedSide 506,600,000, directSide 900,000,000, chosen "direct"}로 취득가액 합계가 5억→0이 되고 필요경비가 개산공제 6,600,000→9억이 된다. 총 납부세액 160,446,000(본문대로면 289,755,577 — 129,309,577 과소). 실가 모드에 같은 실비를 넣으면 정상적으로 미발동한다.

**검증자 재현 실측**

엔진 직접 호출(throwaway probe, 삭제 완료). 공통: 겸용 양도가 1,500,000,000 · 양도일 2024-03-01 · 취득일 2009-03-01 · 주거 60㎡/비주거 40㎡ · 토지 100㎡ · 양도시(주택 3억·상가건물 1억·토지 200만/㎡) · 취득시(주택 1.5억·상가건물 3천만·토지 100만/㎡) · isOneHouseExempt=false(다주택).

A. 감정가액 총액 5억, 실비 없음 → route=section176_2_appraisal_sales · proviso=undefined · acqTotal=500,000,000 · dedTotal(개산공제)=6,600,000 · aggregateIncome=715,248,003 · **totalPayable=289,755,577**

B(🔴결함). 감정가액 총액 5억 + 자본적지출 900,000,000 → proviso={estimatedSide **506,600,000**, directSide **900,000,000**, chosen **"direct"**} · acqTotal **0** (5억이 통째로 소멸) · dedTotal=900,000,000 · aggregateIncome=432,000,002 · **totalPayable=160,446,000**
⇒ 차액 289,755,577 − 160,446,000 = **129,309,577 과소** (제보 수치와 원 단위까지 일치)

D. 매매사례가액 경로도 동일 플래그 — 감정 5억 + 자본적지출 9억 + 양도비 1천만 → proviso={506,600,000 / 910,000,000 / "direct"} · acqTotal=0 · totalPayable=157,278,000

E(본문 대조). 감정 5억 + 자본적지출 1억 → chosen="estimated" · acqTotal=500,000,000 · dedTotal=6,600,000 · totalPayable=**289,755,577** (= A와 동일) ⇒ 본문에서는 실비가 필요경비에 들어가지 않는 것이 정본임을 확인.

C(정상 대조). 실가(useActualAcquisition) + 자본적지출 9억 → proviso=**undefined** · acqTotal=500,000,000 **유지** · dedTotal=900,000,000(§97②1호 가산) · totalPayable=14,915,998 ⇒ 실가 경로는 정상적으로 단서 미발동.

**제안 수정**

provisoEligible에 `&& !asset.useAppraisalSalesAcquisition` 추가. 단건 엔진(transfer-tax-helpers.ts:247-250 `isConversionMode = useEstimatedAcquisition === true` + 주석)과 일반건물(general-building-swap.ts:177-180 appraisal·salesCase는 갈래 4 무동작), UI 안내문(AssetSectionExpense.tsx:99)이 모두 같은 규칙을 이미 말한다. anchor P4에 감정·매매사례 케이스 추가.

**수정 위험**

낮다.

- `provisoEligible`은 `lib/tax-engine/transfer-tax-mixed-use.ts` **내부 지역변수**로 파일 밖 소비자가 없다(grep: 278·283 두 줄뿐). `necessaryExpenseProviso`도 엔진·타입·anchor 테스트에만 등장하고 `components/**` 소비자 0건이라 결과 카드 회귀 없음.
- **현재(결함) 동작을 고정하는 테스트가 없다.** `useAppraisalSalesAcquisition`을 세팅하는 테스트는 `__tests__/tax-engine/transfer/mixed-use-appraisal-sales-acquisition.anchor.test.ts`(capex/transferExpense **미세팅**)와 `__tests__/lib/calc/mixed-use-appraisal-sales-api.anchor.test.ts`(④변환 전용) 둘뿐이다. 단서 anchor `__tests__/tax-engine/transfer-tax/mixed-use-97-2-proviso.anchor.test.ts`는 감정·매매사례를 한 번도 쓰지 않는다 ⇒ `&& !asset.useAppraisalSalesAcquisition` 추가로 red가 날 기존 테스트를 찾지 못했다.
- 타 세목 영향 없음(겸용 전용 파일, 단일 호출부).
- ⚠️ 단, 이 파일은 다른 검증 대상(F18 등)과 같은 STEP 7.5 블록을 공유하므로 동시 수정 시 충돌 가능. 그리고 **anchor 추가가 수정의 일부**여야 한다 — P4에 「감정(useAppraisalSalesAcquisition) + 거대 나목 → proviso undefined · acqTotal 유지 · dedTotal=개산공제」 케이스를 넣지 않으면 같은 누락이 재발한다(현재 교차 커버리지 0건).

---

#### F21 · 일반건물 증축(3-way) 경로가 파트 자본적지출을 카드 필요경비와 swap addition에 이중 계상

| | |
|---|---|
| 위치 | `lib/tax-engine/general-building-extension.ts:327` |
| 판정 | **CONFIRMED** |
| 심각도 | **high** |
| 도달성 | reachable-via-ui |
| 탐지 축 | gb |
| 조치 | 배치 7 |

**결함**

3-way 경로는 파트가 비-환산으로 대체될 때 landExp=`input.landDirectExpenses ?? 0`(:327)·building1Exp=`input.buildingDirectExpenses ?? 0`(:334)로 파트 자본적지출을 카드 expenses에 직접 싣는다. 같은 값이 buildEstimatedGeneralBuildingCards(general-building-entry.ts:213-223)를 통해 resolveGeneralBuildingSwap의 partAxis.direct로도 들어가 §97②1호 가산(addition)으로 배분되고, 최종 엔진 input은 `expenses = card.expenses + directAddition`(general-building-route-cards.ts:88)이라 같은 지출이 두 번 차감된다. 2-way는 applyPartAcqModes가 실가 파트 필요경비를 0으로 만들어(part-acq.ts:138) 한 번만 계상된다 — 3-way가 그 반환값 중 estimatedDeduction만 버린다.

**실패 시나리오**

일반건물·분리 ON(토지 1999-05-24/건물 2005-03-10)·토지 실거래 4억·건물 환산·증축 ON(2015-06-01 환산)·총양도 20억·토지 자본적지출 30,000,000. 토지 카드 필요경비가 60,000,000으로 계상 → 결정세액 413,251,699(정상 422,701,699 대비 9,450,000 과소, 총세액 기준 10,395,000 과소).

**검증자 재현 실측**

픽스처: 일반건물·분리 ON(토지 1999-05-24 / 건물 2005-03-10) · 토지 실거래 400,000,000 · 건물 환산 · 증축 ON(2015-06-01 환산) · 총양도 2,000,000,000 · 2026-02-16 양도 · 토지 자본적지출 30,000,000 · mock rates.

[3-way 증축 ON — 결함]
CARD land        acq=400,000,000  expenses=30,000,000  usedEst=false  estDed=0
swap.addition    land=30,000,000  (allocation 비어 있음)
PROP land (엔진 input) acq=400,000,000  **expenses=60,000,000**   ← 30,000,000 이중계상

[2-way 증축 OFF 대조군 — 정상]
CARD land        acq=400,000,000  expenses=0
swap.addition    land=30,000,000
PROP land        acq=400,000,000  expenses=30,000,000

[세액 — 증축 ON, landDirectExpenses 30,000,000 vs 15,000,000(= 이중계상 결과가 정상 30,000,000 차감과 동일해지는 등가점)]
determinedTax 413,052,152 → 422,502,152  차이 **9,450,000**
totalTax      454,357,367 → 464,752,367  차이 **10,395,000**
(증축분 기준시가를 8,000,000/6,000,000·20,000,000/10,000,000으로 바꿔도 차이는 9,450,000 / 10,395,000 로 **불변** — 30,000,000 × LTHD 30% 차감 후 × 45% = 9,450,000, × 1.1 = 10,395,000)

⇒ 원 주장의 델타(9,450,000 / 10,395,000)와 「토지 카드 필요경비 60,000,000」은 **정확히 재현**. 절대값(413,251,699 / 422,701,699)은 재현되지 않았다 — 리뷰어가 쓴 증축분 기준시가가 명시되지 않아 내 픽스처(413,052,152 / 422,502,152)와 다르다. 결함의 크기와 방향은 동일.

[분리 OFF · 건물 파트 실가 20,000,000 — 추가 재현]
CARD building1 exp=20,000,000 → PROP building1 exp=34,411,346, building2 exp=5,738,654
(addition building1 14,411,346 + building2 5,588,654 = 20,000,000 이 카드 expenses 위에 또 얹힌다)

**제안 수정**

3-way도 landExp/building1Exp를 partAcq.estimatedDeduction.land/.building(실가 파트면 0)으로 대체하고 자본적지출 반영은 resolveGeneralBuildingSwap의 addition/allocation 단일 경로에 맡긴다.

**수정 위험**

낮음~중간.

깨질 수 있는 곳(grep + 픽스처 대조로 확인):
· `__tests__/tax-engine/transfer/general-building-extension-transfer-expense.anchor.test.ts` D-11 describe — 유일하게 「증축 + 파트 자본적지출(PART_CAPEX 400,000,000)」을 쓰는 anchor다. 단언이 전부 상대 비교(`withoutExp.tax > withExp.tax`, `huge.tax === zero.tax`, payload 존재 여부)라 양변이 같은 방향으로 움직여 red 가능성은 낮다. 다만 파트 자본적지출 4억이 절반으로 줄어드는 셈이라 §97②2호 가목↔나목 겨루기 자체는 움직이지 않는다(실가 파트는 allocation 대상이 아님) — 그래도 이 파일은 반드시 재실행할 것.
· `gb-extension-part-acq-date.anchor.test.ts` · `gb-inheritance-extension-3part.anchor.test.ts` · `gb-extension-4mode.anchor.test.ts` — 파트 모드는 `actual`이나 파트 자본적지출이 없어 현행·수정 후 모두 0. 영향 없음.
· 사이드바 표시(`buildApportionment` `allocatedExpenses`, route-cards.ts:250)도 같은 식이라 자동으로 함께 정정된다(표시↔계산 드리프트 없음).

제안 수정의 함정 1건: 제안대로 `partAcq.estimatedDeduction.land/.building`으로 대체하면, 3-way는 `applyPartAcqModes`에 `originUsedEstimated ? landExp : 0`을 넘기는데(`general-building-extension.ts:300-302`) production에서는 `route-helper`가 `actualBundledAcquisitionPrice`를 항상 주입해 `isOriginActual`이 늘 true → 인자가 0이므로, **감정가액·매매사례가액 파트에서 개산공제가 0이 되어 2-way(`part-acq.ts:138`이 `!== "actual"`이라 개산공제를 남긴다)와 어긋난다**. 현행 UI는 실거래가·환산 2종만 노출해 도달 불가지만 Zod는 4종을 허용하므로(`A-20` anchor가 그 잠복을 봉인하고 있다), 수정 시 파트 모드가 `appraisal`/`salesCase`인 경우의 개산공제 처리를 함께 맞추거나 최소한 anchor로 고정할 것. `actual` 파트만 노리는 최소 수정은 `landPartApplied`/`buildingPartApplied` 분기에서 `*Exp`를 **0**으로 두는 것이며(가산은 swap addition 단일 경로가 담당), 그 편이 2-way와의 동치가 명확하다.

엔진 파일 수정이므로 `scripts/select-test-scope.sh` 판정상 전체 테스트 대상이다 — `npm test` 전체 + GB E2E까지 돌릴 것.

---

#### F22 · 일반건물 파트 자본적지출을 비우면 그 파트에 안분된 양도비가 통째로 사라진다 (§97②2호 판정이 mode 대신 direct 유무로 게이팅)

| | |
|---|---|
| 위치 | `lib/tax-engine/general-building-entry.ts:213` |
| 판정 | **CONFIRMED** |
| 심각도 | **high** |
| 도달성 | reachable-via-ui |
| 탐지 축 | gb |
| 조치 | ⏸ **사용자 판단 대기** |

**결함**

buildEstimatedGeneralBuildingCards가 §97②2호 판정의 partAxis 항목을 파트 자본적지출의 유무로만 만든다(`landDirectExpenses !== undefined` :213 / `buildingDirectExpenses !== undefined` :216) — 파트 모드(landAcqMode)를 이미 알면서 싣지 않는다. resolvePerPart는 `const mode = input?.mode`(general-building-swap.ts:221)로 갈래를 정하므로 항목이 없으면 실가 파트인데도 갈래 3(§97②1호 가산)으로 못 가고 `estimatedCards.length===0 → continue`(:249)로 버려져, §100② 후문으로 그 파트에 안분된 양도비가 소실된다. ④ 변환(transfer-tax-api-gb.ts:343-348)이 truthy일 때만 실어 「0 입력」도 「미입력」과 같다.

**실패 시나리오**

일반건물·분리 ON·토지 실거래 4억+건물 환산·총양도 20억·양도비 3억·건물 자본적지출 100만·토지 자본적지출 비움(정상적 입력). 토지에 안분됐어야 할 양도비 293,424,386이 사라져 결정세액 434,548,681. 토지 칸에 1원만 넣으면 344,916,000 — 89,632,681 과대. 양쪽 다 비우면 자산총액 분기로 떨어져 312,933,515(파트 단위 345,209,999 대비 32,276,484 과소)로 반대 방향 오차.

**검증자 재현 실측**

determinedTax(지방소득세 제외) 실측 — 원 리뷰어 수치와 원단위 일치:
· 토지 자본적지출 비움(현행 결함)      = 434,548,681  (claim 434,548,681 ✓)
· 토지 칸에 1원                        = 344,916,000  (claim 344,916,000 ✓)
· 차이(과대)                           =  89,632,681  (claim 89,632,681 ✓)
· 양쪽 다 비움 → 자산총액 분기         = 312,933,515  (claim 312,933,515 ✓)
· 파트 단위 기준선(land/building direct 0 명시) = 345,210,000  (claim 345,209,999 — 1원 상이)
· 과소 폭 345,210,000 − 312,933,515    =  32,276,485  (claim 32,276,484 — 1원 상이)
· 제안 수정 등가(landDirectExpenses:0 명시 + 건물 100만) = 344,916,000 → 「1원 넣은 값」과 완전 동일
totalTax(지방 포함) 대조: 478,003,549 / 379,407,600 / 344,226,866 / 379,731,000 (= 각 결정세액 ×1.1)

swap 객체 직접 관측:
· 토지 항목 없음 → perPart = {building:{estimatedSide:6,065,163, directSide:7,575,614, swapApplied:true}}, addition = [] ← land 키 부재
· 토지 항목 {direct:0, mode:"actual"} → perPart.land = {estimatedSide:0, directSide:293,424,386, swapApplied:false}, addition = [["land", 293,424,386]]
카드: land transferPrice 1,956,162,578 / acq 400,000,000 / est=false, building transferPrice 43,837,422 / acq 5,980,729 / exp 84,434 / est=true

validate: validateGeneralBuildingAsset(landEmpty) = null, (bothEmpty) = null (무차단)

**제안 수정**

partAxis의 land/building 항목을 모드 기준으로 항상 싣고 direct만 `?? 0`으로 둔다(part-acq.ts:77-78이 이미 `input.landAcqMode ?? "estimated"`로 자본적지출과 무관하게 모드를 도출하는 단일 소스). resolvePerPart에서 mode undefined일 때 카드로 fallback하는 방어는 두 번째 진실이 되므로 피할 것. 참고: 양쪽 비움 조합이 자산총액 분기로 가는 것이 의도인지(swap 헤더 표 vs O-1 서술 충돌)는 사용자 판단 필요 — 이 수정으로 함께 파트 단위가 된다.

**수정 위험**

제안 수정(파트 항목을 모드 기준으로 항상 싣고 direct는 `?? 0`)은 **반드시 `!bothEstimated`로 게이팅**해야 한다 — finding이 이 조건을 명시하지 않은 것이 가장 큰 위험이다. 무조건 싣으면 「두 파트 모두 환산」에서도 `usePartAxis`가 true가 되어 `resolveGeneralBuildingSwap`의 자산총액 분기(general-building-swap.ts:151-172)에 **영원히 도달하지 못한다**. `resolvePerPart`는 `capitalExpenditure` 인자를 아예 읽지 않으므로, 자산 단위 자본적지출(validate V-8이 bothEstimated일 때만 허용하는 바로 그 값)이 **조용히 무시**되어 정반대 방향의 대형 회귀가 난다. UI(showPartCapex)·④(partExpensePayload)가 이미 `!bothEstimated`를 게이트로 쓰므로 entry.ts도 같은 술어를 써야 한다(`feedback_shared_predicate_argument_parity`).

기존 테스트로 red가 날 지점 조사(현행 동작을 고정하는 테스트는 발견되지 않음):
· `__tests__/tax-engine/transfer/general-building-part-swap.anchor.test.ts` — A-15(:254-267)는 `resolveGeneralBuildingSwap`를 **직접** partAxis 없이 부르므로 entry.ts 변경에 영향 없음. A-16(:213-252)·A-19(:320-343)는 항상 최소 한쪽 파트 자본적지출을 명시하거나 transferExpense가 없어 land partDirectSide가 0(`if (partDirectSide <= 0) continue`)이라 결과 불변.
· `__tests__/tax-engine/transfer/general-building-extension-transfer-expense.anchor.test.ts` — fixture(:92-99)가 land·building 자본적지출을 **둘 다** 싣는다 → 영향 없음.
· `__tests__/calc/gb-actual-expenses-plumbing.test.ts` — ④ payload 키만 단언, 세액 미고정.
⇒ entry.ts만 고치면 위 anchor는 green 유지될 것으로 보인다. 단, `resolveGeneralBuildingSwap` 쪽에 mode-undefined 방어를 넣는 것은 「두 번째 진실」이 되므로 finding 지적대로 피할 것.

별도 사용자 결정 필요(수정에 딸려오는 의미 변경): 혼합 모드 + 양쪽 자본적지출 공란이 현재 자산총액 분기(312,933,515)로 떨어지는데, 수정하면 파트 단위(345,210,000)로 바뀐다 — 32,276,485원 증가. swap.ts 헤더 표(:10-12 "자산 단위 자본적지출·양도비만 → 자산총액")와 같은 헤더의 O-1 서술(:21-23 "자산총액 1회 판정은 실가 파트까지 단서에 끌어들여 요건에 반한다")이 이 조합에서 정면 충돌하므로, 어느 쪽이 정본인지 확정한 뒤 착수해야 한다.

기타: `transfer-estimated-preview.ts:162`가 같은 헬퍼를 쓰므로 미리보기 표시도 함께 바뀐다(의도된 동반 변경).

---

#### F24 · 비소유 파트(selfOwns≠both)의 잔존 취득가액이 전송돼 본인 파트 취득가액을 잔액으로 뒤바꾼다

| | |
|---|---|
| 위치 | `lib/calc/transfer-tax-api-split.ts:162` |
| 판정 | **CONFIRMED** |
| 심각도 | **high** |
| 도달성 | reachable-via-ui |
| 탐지 축 | split |
| 조치 | 배치 8 |

**결함**

landAcqDirectActive/buildingAcqDirectActive(:71-72)가 isSplitActive와 파트 모드만 보고 selfOwns를 보지 않아, selfOwns='building_only'여도 landAcquisitionPrice가 body에 실린다(:162). UI는 landOwned 게이트로 그 칸을 렌더하지 않고(LandBuildingSplitSection.tsx:401) validate도 비소유 파트를 건너뛴다. 엔진 splitPair(transfer-tax-split-gain.ts:126)는 한쪽만 입력되면 반대쪽을 `총액 − 입력값`으로 도출하므로 화면에 없는 잔존값이 본인 파트 취득가액을 결정하고 §166⑥ 기준시가 비율 안분이 조용히 우회된다.

**실패 시나리오**

housing·양도 10억·취득 총액 5억·selfOwns='building_only'·취득시 기준시가 토지 3억/건물 1억. 정상(토지 칸 미입력): 건물 취득가액 125,000,000·총세액 38,648,500. selfOwns=both일 때 입력해 둔 토지 취득가액 450,000,000이 남은 채 전환하면(AssetOwnershipSplitSection.tsx:49-69이 초기화하지 않음) 건물 취득가액 50,000,000·총세액 64,801,000 — 26,152,500 과대.

**검증자 재현 실측**

probe(삭제 완료: __tests__/_scratch/verify-F24-1.test.ts)

[C] payload — buildSplitPayload(selfOwns="building_only", landAcquisitionPrice="450,000,000", landAcqMode="", buildingAcqMode="", saleSplitMode="apportioned"):
{ selfOwns:"building_only", landAcquisitionDate:"2019-06-01", landAcqMode:"actual", buildingAcqMode:"actual", saleSplitMode:"apportioned", isSeparateAcquisition:false, landAcquisitionPrice:450000000, landStandardPriceAtTransfer:750000000, buildingStandardPriceAtTransfer:250000000 }
→ 비소유 파트 취득가액 키가 실린다(주장대로).

[D] validate — validateSplitDirectInputs(동일 자산, "자산1") → null (차단 없음).

[A/B] 엔진 (housing, 양도 10억, 취득 총액 5억, 취득일 동일=비별개취득, selfOwns=building_only, 취득시 기준시가 토지 3억/건물 1억, 양도시 기준시가 토지 7.5억/건물 2.5억, 2주택·비1세대1주택, 2019-06-01→2024-06-01):
  A 토지값 미전송: building.acquisitionPrice = 125,000,000 / land = 375,000,000 · transferGain 125,000,000 · totalTax 26,328,500
  B 잔존 450,000,000 전송: building.acquisitionPrice = 50,000,000 / land = 450,000,000 · transferGain 200,000,000 · totalTax 53,933,000
  Δ totalTax = +27,604,500 (과대)

⇒ finding의 핵심 수치 125,000,000 → 50,000,000 은 **정확히 재현**. 다만 finding의 세액 38,648,500 / 64,801,000 / Δ26,152,500 은 재현되지 않았다 — 시나리오에 양도시 기준시가·1세대1주택 여부·보유기간이 명시돼 있지 않아 보조 입력이 다르기 때문이며, 방향(과대)과 자릿수는 동일하다.

**제안 수정**

landAcqDirectActive에 `selfOwns !== 'building_only'`, buildingAcqDirectActive에 `selfOwns !== 'land_only'`를 대칭 추가(매매사례 2필드도 동일). 판정은 separateAcqPartsSum·validateSeparateAcqParts가 쓰는 selfOwns 술어와 같은 값이어야 한다. 같은 파일 :119-131이 별개취득 standardPriceAtAcquisition에 대해 이미 같은 차단을 하고 이유를 주석으로 남겼다.

**수정 위험**

낮음 — 수정 지점이 payload 빌더 1곳(lib/calc/transfer-tax-api-split.ts:71-72)이고, 엔진·validate는 손대지 않는다.

기존 안전망 조사: `selfOwns`를 언급하는 vitest는 __tests__/calc/{transfer-split-acq-stdprice-gate, transfer-tax-validate-split, split-sale-std-part-gate, split-sale-std-price-transmit}.test.ts 4건뿐이고 **어느 것도 `buildSplitPayload`가 비소유 파트 취득가액을 싣는다고 단언하지 않는다**. 엔진 쪽에서 잔액 도출을 고정하는 __tests__/tax-engine/transfer-tax/split-acq-per-part-completion.test.ts:286-296("한쪽만 입력 → 잔액 도출 유지")은 `selfOwns`를 설정하지 않으므로 영향 없다. 즉 현재 동작을 고정하는 테스트가 없다 = 「의도된 동작」의 증거도 없다.

주의할 부작용 3가지:
① 수정 후 소유 파트도 비어 있으면 `splitPair`가 비율 안분으로 가는데, 비율이 null이면 throw한다. 다만 비별개취득 + `selfOwns≠both`에서는 validate V8(transfer-tax-validate-split.ts:132-139)이 이미 취득시 ㎡당 공시지가·면적·기준시가 총액 3필드를 필수로 받으므로 새 dead-end는 생기지 않는다.
② :163-172의 `landAcquisitionCause` fallback(신축 + 토지 상속·증여 → `fixedAcquisitionPrice`로 후퇴)은 selfOwns="both" 경로이므로 게이트 추가 시 그 경로가 죽지 않도록 `selfOwns !== "land_only"` 조건만 더해야 한다(e2e/split-mode-gating.spec.ts P8이 이 경로를 지킨다).
③ 기준시가 필드에는 확대하지 말 것 — LandBuildingSplitSection.tsx:461이 **비소유 토지 파트의 취득시 기준시가 카드는 일부러 렌더**한다(주택 라목 결합 공시에서 건물분을 역산하는 유일 경로). 물건 속성값이라 소유 축과 무관하다.
④ ⑧ 규칙 정합: 판정은 `separateAcqPartsSum`(transfer-tax-split-acq-mode.ts:121-136)·`validateSeparateAcqParts`(transfer-tax-validate-split.ts:59-66)가 쓰는 `selfOwns` 술어와 같은 값이어야 dual-truth가 생기지 않는다.

---

#### F25 · 파트 취득방식이 자산 단위 플래그로 역파생되지 않아 §114조의2 신축 가산세가 발동하지 않는다

| | |
|---|---|
| 위치 | `lib/calc/transfer-tax-api.ts:322` |
| 판정 | **CONFIRMED** |
| 심각도 | **high** |
| 도달성 | reachable-via-ui |
| 탐지 축 | split |
| 조치 | 배치 8 |

**결함**

별개취득에서는 자산 전체 「취득가액 산정 방식」 라디오가 숨겨지고(CompanionAcqPurchaseBlock.tsx:398) 파트 라디오는 landAcqMode/buildingAcqMode만 갱신하는데(:622-624), transfer-tax-api.ts:98-100은 여전히 숨겨진 레거시 플래그로 isEstimated/isAppraisal을 파생해 :322 useEstimatedAcquisition·:352 acquisitionMethod를 만든다. 그래서 건물 파트가 환산이어도 엔진에는 acquisitionMethod='actual'이 도달해 transfer-tax-building-penalty.ts:22-30 isPenaltyMethod와 finalize.ts:384-385 isEstimatedMode가 false가 되고, transfer-tax-helpers.ts:279-281 usedEstimated도 false가 되어 결과 산식이 무너진다.

**실패 시나리오**

토지 2015 매입+건물 2021 신축(isSelfBuilt·constructionDate 2021-03-10→2024-06-01 양도, 5년 이내), buildingAcqMode='estimated'·건물 환산취득가액 225,000,000. 현행 penaltyTax=0·총세액 179,924,800 — §114조의2①(환산취득가액의 5%) 11,250,000+지방분 1,125,000이 누락된다. 같은 실행에서 「양도차익 계산」 산식이 `양도가 − 취득가(0 − 경비(0`인데 금액은 570,500,000으로 자기 금액을 못 만든다. 반대로 자산 전체를 환산으로 고른 뒤 토지만 실가로 바꾸면 base가 토지 실취득가까지 포함해 31,250,000으로 과대 산출된다(probe 관측).

**검증자 재현 실측**

엔진 실측(fixture: propertyType building/housing, 별개취득, 토지 2015-05-01 실가 200,000,000 · 건물 2021-03-10 신축 환산, 양도 2024-06-01, 양도가 1,000,000,000 = 토지 700,000,000 + 건물 300,000,000, 건물 취득시 기준시가 225,000,000 / 양도시 300,000,000 → 건물 환산취득가 225,000,000):

· 현행(payload 그대로: useEstimatedAcquisition=false, acquisitionMethod="actual", buildingAcqMode="estimated") → penaltyTax **0**, totalTax 178,994,200, 양도차익 568,250,000, splitBuilding.acquisitionPrice 225,000,000 / appraisalDeduction 6,750,000 / acqMode "estimated"
· 대조군(자산 플래그만 환산으로) → penaltyTax **21,250,000**(= 425,000,000 × 5%, 토지 실취득가 200,000,000이 base에 섞임), totalTax 202,369,200
· propertyType "housing" 동일: 0 → 21,250,000 / 178,994,200 → 202,369,200
· §114조의2① 법정 정답 = 225,000,000 × 5% = **11,250,000** (+ 지방소득세 1,125,000)

payload 실측(callTransferTaxAPI + fetch stub): {acquisitionMethod:"actual", useEstimatedAcquisition:false, landAcqMode:"actual", buildingAcqMode:"estimated", isSeparateAcquisition:true, isSelfBuilt:true, constructionDate:"2021-03-10", buildingType:"new"}
validate 실측: validateAssetEntry(...) → **null**(통과)
deriveUseEstimatedAcquisitionFromParts 호출부: **0건**(정의 1건뿐)

반증된 부수 주장: 「양도차익 계산 | 양도가(1,000,000,000 - 취득가(0 - 경비(0」 산식은 토지·건물 **양쪽 실가** 별개취득에서도 동일하게 출력됨(금액 550,000,000) → 이 결함과 무관한 선재 표시 결함.

**제안 수정**

별개취득이면 파트 모드를 우선하도록 deriveUseEstimatedAcquisitionFromParts를 실제로 호출한다. 단 §114조의2① base는 건물분 한정이므로 자산 합계를 그대로 쓰면 과대가 된다 — split일 때 penalty base를 splitDetail.building.acquisitionPrice(건물 파트가 환산·감정인 경우)로 좁히도록 finalize.ts의 effectiveEstimatedBase를 함께 분기할 것.

**수정 위험**

finding이 제안한 방식(별개취득 시 `deriveUseEstimatedAcquisitionFromParts`로 자산-수준 `useEstimatedAcquisition`을 역파생)은 **blast radius가 크다**. `useEstimatedAcquisition`을 읽는 지점이 lib/tax-engine에만 35곳이다:
· `transfer-tax-split-gain.ts:249` `deriveLegacyAcqMode` — 플래그가 true가 되면 **모드 미지정 파트가 자동으로 estimated**가 된다(파트 중 하나만 환산인데 반대 파트 모드가 ""로 도착하면 조용히 양쪽 환산).
· `transfer-tax-helpers.ts:279-288` — `usedEstimated`가 true가 되면 `estimatedBase = land + building` **합계**가 되어 penalty base가 토지까지 포함(=현행 대조군에서 관측된 21,250,000 과대). finding도 이 점을 인정하고 finalize의 `effectiveEstimatedBase` 분기를 함께 요구하지만, 그 분기를 빠뜨리면 **과소를 과대로 바꾸는 것뿐**이다.
· `transfer-tax-helpers.ts:249·312`, `transfer-tax-commercial-step.ts:56·129`(STEP 0.35 상가 환산 게이트), `transfer-tax-expropriation-valuation.ts:395·408·420`(공익수용 평가), `transfer-tax-redevelopment.ts:90-91·270`, `transfer-tax-split-gain.ts:671` — 세목 내 다른 축들이 같은 플래그를 스위치로 쓴다.
· `transfer-tax-api.ts:322`는 이미 `isCommercialBuilding`·`isGeneralBuilding`·`isCarryoverGeneral`·`parcelModeActive`·`isMixed`·`hasPre1990`·`isSalesCase` 7개 분기를 얹은 표현식이라, 여기에 파트 역파생을 끼우면 상가·일반건물·재개발·다필지·겸용 경로와 상호작용이 생긴다.

**현행 동작을 고정하는 테스트는 찾지 못했다** — split payload 테스트(`__tests__/calc/transfer-tax-api-split-gate.test.ts`, `split-building-acq-std-payload.test.ts`, `split-housing-separate-acq-part-std.test.ts`, `transfer-tax-validate-split.test.ts`)에 `useEstimatedAcquisition` 단언이 0건이고, `deriveUseEstimatedAcquisitionFromParts`의 테스트도 0건이다. 즉 「의도된 동작」이라는 증거는 없으나, 동시에 **안전망도 없다** — 이 자리를 바꾸면 회귀를 잡아 줄 것이 `general-building-*`(다른 축)과 split anchor의 세액 값들뿐이다. 착수 전 mutation probe로 안전망을 실측할 것.

⇒ 위험이 훨씬 낮은 대안: 자산-수준 플래그를 건드리지 말고 sibling과 같은 **파트-국소 신호**를 쓴다(`app/api/calc/transfer/general-building-route-cards.ts:118-119`). split 경로에서 penalty 게이트·base만 `splitDetail.building`(acqMode·acquisitionPrice)을 보게 하면 위 35개 소비 지점을 전혀 흔들지 않는다.

리스크 회귀 확인 권장 경로: `npx vitest run __tests__/tax-engine/transfer/ __tests__/tax-engine/transfer-tax/ __tests__/calc/` (특히 `general-building-case-32`·`split-part-rate.anchor`·`expropriation-*-split.anchor`·`transfer-tax-api-split-gate`).

---

#### F26 · 증여세 폼 부담부증여: §159 양도가액 B가 §47① 인수채무가 아니라 §66 평가용 칸에서 파생 — 양도세 0원 또는 과대

| | |
|---|---|
| 위치 | `lib/calc/gift-burdened-transfer-api.ts:154` |
| 판정 | **CONFIRMED** |
| 심각도 | **high** |
| 도달성 | reachable-via-ui |
| 탐지 축 | burdened |
| 조치 | 배치 10 |

**결함**

buildGiftBurdenedTransferBody가 `lendingDepositTotal = item.leaseDeposit`·`mortgageDebtAmount = item.mortgageAmount`(:154-155)를 싣고 엔진은 그 합을 §159의 B(양도가액)로 쓴다(burdened-gift-valuation.ts:180). 그런데 증여세 폼에서 두 칸은 §66 평가 하한 전용이고(EstateBodyRealEstate.tsx:540-596 hint가 명시) 실제 인수채무는 별도 필드 assumedDebtForGift다. 같은 파일 :86-92 주석은 「두 필드는 부담부증여 양도가액과 무관」이라 적어 놓고 그 값을 B로 보내며, :123-126이 주장하는 「validate ⑧이 일치를 강제」도 사실이 아니다(gift-tax-form-validate.ts:176-179는 assumedDebtForGift>0만 검사).

**실패 시나리오**

공동주택 공시가 8억·취득시 4억·증여 2024-03-01. ① §47① 인수채무 5억만 입력하고 §66 칸을 비우면 engine B=0 → 결정세액 0원(정답 45,458,000 전액 소실). ② §47① 3억인데 저당권 2억(증여자가 상환)을 §66 목적으로 입력하면 B=5억 → 45,458,000(정답 20,351,000, 25,107,000 과대). 두 경우 모두 validateStep이 빈 배열이고 화면 경고가 없다.

**검증자 재현 실측**

공동주택 공시가 800,000,000 · 취득시 기준시가 400,000,000 · 취득일 2009-06-01 · 증여(양도)일 2024-03-01 · housing · 세대주택수 2. 각 케이스 [validateStep(1) 반환 / bodyTransferPrice / lendingDepositTotal / mortgageDebtAmount / 엔진 B / C / debtRatio / determinedTax]:

D1 (§47①=5억, §66 두 칸 공란): null / 500,000,000 / 0 / 0 / **B=0** / C=800,000,000 / 0 / **determinedTax=0**, taxableGain=0 → 정답 45,458,000 전액 소실 (주장과 일치)
D2 (§47①=5억, 보증금 3억+저당 2억): null / 500,000,000 / 300,000,000 / 200,000,000 / B=500,000,000 / C=800,000,000 / 0.625 / **45,458,000**, taxableGain 242,500,000 (주장과 일치)
D3 (§47①=3억, §66 목적 보증금 3억+저당 2억): null / 300,000,000 / 300,000,000 / 200,000,000 / **B=500,000,000** / 0.625 / **45,458,000** (주장과 일치)
D4 (정답 — B=3억이어야 할 값): null / 300,000,000 / 300,000,000 / 0 / B=300,000,000 / 0.375 / **20,351,000**, taxableGain 145,500,000 (주장과 일치)
⇒ D3 과대분 = 45,458,000 − 20,351,000 = **25,107,000** (주장 25,107,000과 정확히 일치)

validate mutation sentinel: assumedDebtForGift=0 → "아파트: 수증자 인수 채무액(§47①)을 입력하세요…" 반환(코드 경로 도달 증명). 불일치·공란 케이스는 step 0·1·2·3·4 **전부 null**.

**제안 수정**

증여세 폼 경로에서 B(§47① 인수채무)와 C(§66 평가) 축을 분리한다 — 엔진 B 슬롯에는 item.assumedDebtForGift가 도달해야 하고 §66 평가에는 leaseDeposit·mortgageAmount·monthlyRent가 그대로 쓰여야 한다(현행 엔진이 두 용도를 겸용하므로 BurdenedGiftInfo에 인수채무 명시 축을 추가하는 것이 정공법). 축 분리 전이라도 ⑧에서 불일치를 차단해 침묵 0원을 없앤다.

**수정 위험**

수정을 **증여세 폼 ⑧(validate)에 한정**하면 위험이 낮고, 엔진을 건드리면 매우 높다.

레드가 나는 기존 테스트(= 현행 동작을 고정 중):
- `__tests__/calc/gift-burdened-acq-stdprice-k4.test.ts` — 픽스처가 `assumedDebtForGift: 400_000_000`만 두고 `leaseDeposit`·`mortgageAmount`를 아예 안 쓴다(정확히 D1 모양). `:67 expect(msg).toBeNull()`은 ⑧ 일치 게이트를 넣는 순간 실패하고, `:81·95·110`의 `expect(msg).toContain("취득시 기준시가")`도 새 에러가 먼저 반환되면 깨진다 ⇒ **게이트를 넣을 때 검사 순서와 픽스처를 함께 갱신해야 한다**(이 픽스처들이 D1 입력형태의 자연스러움을 방증하므로, 픽스처에 §66 칸을 채우는 방향이 맞다).
- `__tests__/tax-engine/transfer-tax/gift-burdened-transfer-api.test.ts:109-114`가 `lendingDepositTotal === leaseDeposit` / `mortgageDebtAmount === mortgageAmount`를 못박는다. ⑧ 게이트만 추가하면 그린 유지(픽스처가 500M = 300M+200M로 이미 일치). 반면 `leaseDeposit`를 B 슬롯에서 빼는 방향의 어댑터 재배선은 이 두 단언을 즉시 깬다.

엔진(`burdened-gift-valuation.ts:180 computeDebtRatio`)을 고치면 안 되는 이유 — 슬롯이 **다른 세목/경로와 공유**된다:
- 양도세 마법사 자체 경로 `lib/calc/transfer-tax-api-burdened-gift.ts:107-108` ← `components/calc/transfer/BurdenedGiftBlock.tsx:247·257`. 그 UI에서는 두 칸이 진짜 인수채무("담보차입금 (실제 채무잔액)", 패널 안내 "채무 B는 실제 인수액")이므로 엔진 의미를 바꾸면 **정상 경로가 깨진다**.
- 같은 슬롯을 `burdened-gift-eligibility.ts:56-57`(초과부담부 §47③ 차단)도 읽으므로 의미 변경이 차단 로직까지 전파된다.
- 엔진 앵커 다수가 이 산식을 고정: `burdened-gift-commercial.test.ts:65·161·193`, `burdened-gift-building.test.ts:64`, `burdened-gift-fractional-ownership.test.ts:58·164·191·247·265·291`, `burdened-gift-carryover-donor-death.anchor.test.ts:34`, `burdened-gift-carryover-d7a.anchor.test.ts:42`, `burdened-gift-actual-apportioned-path.test.ts:22·113`, `general-building-actual-sale-split.anchor.test.ts:160`.

⇒ 저위험 수정 = `components/calc/gift-tax-form-validate.ts`의 C-4 블록에 불일치 차단 추가 + `gift-burdened-transfer-api.ts:122-126`의 허위 주석 정정. 엔진·타입(`BurdenedGiftInfo`) 신규 축 추가는 설계상 비범위 기능(일부 인수)이라 별도 PR로 분리할 것.

---

#### F27 · 일반건물 부담부증여 × 이월과세: ⑧는 「당초 증여자」 값을 필수로 요구하는데 GB route가 §97의2 세 축을 전혀 적용하지 않는다

| | |
|---|---|
| 위치 | `app/api/calc/transfer/general-building-route-actual.ts:343` |
| 판정 | **CONFIRMED** · 법령 CONFIRMED |
| 심각도 | **high** |
| 도달성 | reachable-via-ui |
| 탐지 축 | burdened |
| 조치 | ⏸ **사용자 판단 대기** |

**결함**

assetKind=general_building은 route.ts:392 분기로 빠져 buildBurdenedGiftBreakdown을 route가 직접 호출하는데(:343), info를 원본 그대로 넘겨 carryoverDonorBasis(§97의2①1호) 치환도 carryoverGiftTaxAmount(①3호) 산입도 하지 않는다 — 그 치환은 applyCarryoverDonorBasis(transfer-tax-carryover-burdened-gift.ts:133-150)에서만 일어나고 단건 STEP 0.475에서만 호출된다. transfer-tax-api-gb-carryover.ts:121은 부담부증여면 {}를 반환해 GB 카드의 carryoverTaxation도 만들지 않는다(주석의 「그쪽 줄기가 지원한다」가 GB에는 닿지 않는다). 반면 ⑧(transfer-tax-validate-bg.ts:77-82)은 GB에서도 「당초 증여자」 기준시가 두 칸을 필수로 막고 UI도 그 칸을 낸다.

**실패 시나리오**

GB(토지 1279㎡×6,215,000/㎡·건물 631,846,500, 취득시 2,130,000/㎡·424,472,064, 인수채무 5억, 증여등기 2023-06-01, 당초 증여자 취득 2012-01-01, 증여세 1억, 2026-02-16 양도)에서 「당초 증여자 취득 당시 기준시가」를 15억+2억 → 1원+1원으로 바꿔도 결과가 완전히 동일하다(양도차익 311,020,394·결정세액 97,468,157·LTHD 0). ①1호 취득가액 치환·①3호 증여세 산입·§95④ 단서 보유기간·②3호 max(A,B)가 모두 미적용이며, 현행은 사실상 시나리오 B라 A가 큰 통상의 경우 과소과세가 된다.

**검증자 재현 실측**

GB route (dispatchGeneralBuilding, real ④ payload), 부담부증여 기준시가 모드 + acquisitionCause=carryover_gift:
- base (bgCoDonor 토지 1,500,000,000 / 건물 200,000,000): determinedTax **97,468,157** · totalTransferGain **311,020,394** · LTHD **0**
  - land card: transfer 463,182,676 / acq 158,741,609 / exp 4,762,248 / gain 299,678,819
  - building card: transfer 36,817,324 / acq 24,733,737 / exp 742,012 / gain 11,341,575
  - `transferBurdenedGiftBreakdown.carryoverGiftTax` = undefined (①3호 미산입)
- mutation (bgCoDonor 1원 / 1원): determinedTax **97,468,157** · gain **311,020,394** · LTHD **0** — Δ = **0** (전 필드 동일)
- emitted gbv keys: transferLandPricePerSqm, transferBuildingStdPrice, landArea, buildingFootprintArea, actualPriceMode, land/buildingAppraisalAtTransfer, appraisalDateAtTransfer, land/buildingAcqMode, building/landAcquisitionDate, buildingAcquisitionCause, isSelfBuilt, acquisitionLandPricePerSqm, acquisitionBuildingStdPrice, **landAcquisitionCause**, zoneType, isMetropolitan, unapprovedBuilding, unregisteredLand, unregisteredBuilding — **carryover 서브객체 0개 · donorAcquisitionDate 없음**
- payload에 실린 info.carryoverDonorBasis = {landStdPriceAtAcquisition: 1500000000, buildingStdPriceAtAcquisition: 200000000} → 도달은 하는데 소비처가 없다

⑧ validate (same asset):
- bgCoDonor 두 칸 비움 → "자산1: 이월과세가 적용되므로 「당초 증여자」… 취득 당시 토지·건물 기준시가을(를) 입력하세요…" (차단)
- 두 칸 채움 → null (통과)

대조군 — 동일 수치를 단건 경로(calculateTransferTax, propertyType "building")로:
- base: determinedTax **97,468,157** (scenarioA 86,400,412 / scenarioB 97,468,157 → adopted **B**, exclusionReason "tax_comparison")
  - scenarioA 상세: acquisitionPrice 99,057,998 · holdingPeriodYears 14 · giftTaxAddedToExpense 5,826,941 · giftTaxApportionment {raw 100,000,000, apportioned 5,826,941, debtAmount 500,000,000, giftValuation 8,580,831,500}
  - scenarioB 상세: acquisitionPrice 3,000,000,000 · holdingPeriodYears 2 · LTHD 0
- mutation (1원/1원): determinedTax **115,381,841** · gain 494,173,059 · LTHD **138,368,456** (scenarioA 채택)
- ⇒ 같은 mutation에서 단건 Δ = **+17,913,684**, GB Δ = **0**

**법령 독립확인**

법령 쪽만 독립 확인했다(코드 재현은 하지 않음). 결론: **조문 본문이 finding의 법적 주장을 뒷받침한다.**

【1】인용 조문이 실재하고 계층이 정확하다 (현행 시행본: 소득세법 공포 20251223·시행 20260701, MST 280405 / 소득세법 시행령 공포 20260522·시행 20260701, MST 286211)
- §97의2①은 2023.12.31. 개정 이후 **각 호 구조**다. finding의 「①1호(취득가액)」·「①3호(증여세 산입)」·「②3호(비교과세)」는 현행 문언과 **정확히 일치**한다. repo의 `lib/tax-engine/legal-codes/transfer.ts:192,201,220`도 같은 번호를 쓰고 있어 드리프트 없음.

【2】부담부증여 출구에 §97의2가 닿는 위임 체인이 문언상 연결된다
- 법 §88조1호 각 목 외의 부분 **후단**: 부담부증여 채무액 부분은 「양도로 보며」.
- 시행령 §159①: 「…**양도로 보는 부분에 대한 양도차익을 계산할 때** 그 취득가액 및 양도가액은 다음 각 호에 따른다」, 1호 취득가액 = A×B/C, **A = 「법 제97조제1항제1호에 따른 가액」**.
- §97의2①1호는 바로 그 「제97조제1항제1호에 따른 금액」을 **당초 증여자 취득 당시 값으로 치환**한다. ⇒ 두 조문이 **같은 슬롯**을 가리키므로 결합 적용이 문언상 성립한다.
- §97의2①은 「…증여받은 제94조제1항제1호 및 제3호에 따른 자산…의 **양도차익을 계산할 때**」로 열려 있고, **양도의 형태를 한정하지 않는다**. 일반건물(토지·건물)은 §94①1호 자산이다.
- §97의2②의 적용배제는 **3개 호뿐**(수용·§89①3호 주택·세액비교)이며 **부담부증여를 배제하는 문언은 없다**. 「명문 없음」이 아니라 「배제 문언의 부존재를 요건 조항 본문·괄호까지 읽어 확인」했다.

【3】②3호는 A/B 두 시나리오를 **조문이 요구**한다
「제1항을 적용하여 계산한 양도소득 결정세액이 제1항을 적용하지 아니하고 계산한 양도소득 결정세액보다 적은 경우」 — 두 결정세액을 동시에 산출하지 않으면 판정 자체가 불가능하다. finding의 「A/B 두 시나리오 비교」 요구는 조문 그대로다.

【4】⑧이 「당초 증여자」 기준시가 두 칸을 필수로 막는 것도 법령 근거가 있다
§159①1호 A **괄호**: 「제2호에 따른 양도가액을 「상속세 및 증여세법」 제61조제1항·제2항·제5항 및 제66조에 따라 기준시가로 산정한 경우에는 **취득가액도 기준시가로 산정한다**」 ⇒ 이월과세 시나리오에서 필요한 것은 **당초 증여자의 취득 당시 기준시가**다. 즉 ⑧의 요구 자체는 정당하고, 문제는 「요구해 놓고 반영하지 않는 것」이다.

【5】선례 — **온-포인트 부존재**(추정 아님, 전수 확인)
- 국세청 법령해석 「이월과세」 **399건** 중 상위 100건 제목 스캔 + 「부담부증여 이월과세」 2건 · 조세심판원 「이월과세」 **106건** · 판례 검색 — 「배우자·직계존비속으로부터 증여받은 자산을 **부담부증여로 양도**」 조합을 다룬 것은 **하나도 없다**.
- ⚠️ **오용 주의**: 검색에 걸리는 서면인터넷방문상담5팀-571(2006.10.30)·서면인터넷방문상담4팀-3628(2006.11.02) 「부담부증여로 취득한 자산 중 양도로 보는 부분의 배우자 이월과세 적용여부」는 **반대 다리(취득 다리)**다. 회신 원문: 「배우자로부터 **부담부증여받은** 부동산의 양도차익을 …계산함에 있어서 …‘양도로 보는 부분’은 …배우자 이월과세 규정이 적용되지 아니하는 것이며, …취득가액은 …상속세 및 증여세법 제60조 내지 제66조의 규정에 의하여 평가한 가액」 — 현행 시행령 **§163⑨**(부담부증여 채무액 부분 포함 → 증여일 상증법 평가액을 취득 당시 실지거래가액으로 봄)에 대응한다. **출구 다리를 판단한 것이 아니다.**
- 가장 가까운 **동일 구조** 유추: 서면법규과-182(2014.03.04) — 「거주자가 …사업용 고정자산을 배우자로부터 증여받고 증여받은 날로부터 5년 이내 …사업양도·양수의 방법에 따라 법인으로 전환하는 경우 해당 사업용 고정자산의 양도차익을 산정할 때 양도가액에서 공제할 필요경비 계산방법은 「소득세법」 제97조의2를 적용하는 것」 ⇒ **양도의 형태가 특수해도(현물출자·사업양수도) §97의2는 적용된다**는 방향.

【6】finding이 언급하지 않은 코드 내 법적 상충 (법령 관점에서 지적)
`lib/tax-engine/legal-codes/burdened-gift.ts:59,61`이 「부담부증여 채무인수 양도분은 양도자가 증여자 본인 → §97의2 적용 대상 아님 (수증자 양도가 아님)」 / `CARRYOVER_NOT_APPLY_97_2: "…부담부증여 미적용"`이라고 **단정**한다. 이 논거는 **두 다리를 혼동**한 것이다 — §97의2는 「현재 양도의 형태」가 아니라 「**양도인이 그 자산을 어떻게 취득했는가**」로 발동한다. 위 2006년 예규(취득 다리)를 출구 다리로 확장한 오독으로 보인다. 조문상 근거 없음.

【7】도구 한계 (추정 금지 원칙에 따라 명시)
과거 시행본 조회는 **실패**했다 — `get_law_text(lawId=001565, jo="제97조의2", efYd=20230101/20200101)`·`mst=247467/237497` 모두 NOT_FOUND. 따라서 「5년→10년」·「①2호 신설」의 정확한 시행일·적용례는 **독립 확인하지 못했다**(확인 필요). 다만 finding은 특정 시점 적용을 전제하지 않으므로 판정에 영향 없다.

**제안 수정**

GB도 §159 안분 전에 applyCarryoverDonorBasis를 태우고 A/B 두 시나리오로 §97의2②3호 비교를 거치게 배선하거나, 그 전까지 ⑧에서 GB+부담부증여+이월과세를 명시 차단해 「입력을 요구하는데 반영되지 않는」 상태를 없앤다.

**수정 위험**

**제안된 수정 중 「⑧에서 명시 차단」 쪽이 저위험**이고, 「GB에도 §97의2를 배선」 쪽은 넓다.

배선 시 red가 나는 곳:
- `__tests__/calc/gb-carryover-api-validate.predo.anchor.test.ts:154-176` (**K-18**)이 `transferType: "burdened_gift"`에서 `landCarryoverTaxation`·`landCarryoverPart`가 **없음**을 고정한다. ④ payload 경로로 고치면 즉시 red. 다만 K-18의 근거는 「중복 배선 회피」(§159와 §97의2가 각각 취득가액을 만드는 것 방지)이지 「GB에 §97의2를 적용하지 않는다」가 아니다 ⇒ **§159 분기 안**(general-building-route-actual.ts:336-343)에서 `assertCarryoverDonorBasis` + `applyCarryoverDonorBasis`를 태우는 형태면 K-18을 건드리지 않는다.
- `e2e/transfer-burdened-gift-carryover-block.spec.ts` CB-1/CB-2는 정확히 이 GB 픽스처를 쓰지만 **차단/비차단만** 단언한다(CB-2는 "계산 결과가 보인다"뿐) ⇒ 깨지지도, 보호하지도 않는다. 고치면 금액 단언을 반드시 추가해야 한다(안 그러면 같은 사각지대가 남는다).
- `__tests__/tax-engine/transfer-tax/burdened-gift-carryover-d7a.anchor.test.ts` 10건은 단건 경로만 보므로 무영향 — **그래서 이 결함을 못 잡았다**.

배선 시 실제 위험:
- §97의2②3호 비교는 GB **aggregate 전체를 2회** 돌려야 한다(카드 분해 후 세액이 확정되므로 단건처럼 입력 1벌 교체로 끝나지 않는다). 그 파이프라인은 `general-building-route-cards.ts`·`general-building-fractional.ts`·`general-building-extension.ts`가 공유하고, 같은 자리에서 이미 두 번 사고가 났다 — 증축 경로 `buildingCarryoverTaxation` 미주입 no-op, NBL 분할 시 증여세 상당액 2배 이중 산입(#1184로 해소). 부담부증여를 얹으면 그 두 함정이 다시 열린다.
- `assertCarryoverDonorBasis`는 `ct.useEstimatedAcquisition`이면 throw한다(:100-107). GB의 환산은 `carryover.useEstimatedAcquisition`가 아니라 `bgAcquisitionMethod === "converted"`(K-5) 축이라, 두 축을 그대로 이어붙이면 **신규 400**이 난다.
- `transferBurdenedGiftBreakdown`은 `route.ts:441`로 응답에 실려 사이드바·결과 카드가 소비한다. `carryoverGiftTax`가 GB에서 처음 채워지면 ⑦ 표시가 바뀐다(⑦ 동기화 필요).
- 「⑧에서 GB+부담부증여+이월과세를 차단」으로 가면 반대 위험이 있다: `docs/00-pm/transfer-gb-carryover-wiring.plan.md` Q4가 기록한 대로, 종전 차단 문구가 부담부증여 ⑧를 **가로채 지원된 기능(주택·토지·건물)을 막아** CB-2가 실패한 전례가 있다. 차단은 반드시 `assetKind === "general_building"`으로 **좁혀야** 하고, 양성 대조군(주택 fixture)이 계속 통과하는지 확인해야 한다.

---

#### F28 · 기타토지 §101①2호 배율 검증이 재산세 분류 enum을 반대로 읽는다 — 「별도합산」 선택 시 검증이 사라지고 「분리과세」 선택 시 잘못 적용된다

| | |
|---|---|
| 위치 | `lib/tax-engine/non-business-land/other-land.ts:339` |
| 판정 | **CONFIRMED** · 법령 CONFIRMED |
| 심각도 | **high** |
| 도달성 | reachable-via-ui |
| 탐지 축 | nbl |
| 조치 | ⏸ **사용자 판단 대기** |

**결함**

Step 0.6(건물 부수토지 §101①2호 배율 판정) 게이트가 `effectiveTaxType === "special_sum"`인데, UI Select는 special_sum을 「분리과세」·separate를 「별도합산」으로 라벨하고(OtherLandDetailSection.tsx:213·221) 같은 함수 :316도 `route==="separate_taxation" ? "special_sum" : "separate"`로 UI와 같은 뜻으로 매핑한다. 23줄 뒤 :339만 같은 리터럴을 「별도합산」으로 읽는다(주석·step detail 문구가 전부 「별도합산」). §104의3①4호나목이 제외하는 것은 「지방세법」 §106①2호 별도합산이므로 배율 한도는 별도합산 축에 걸려야 한다.

**실패 시나리오**

일반주거 나대지 2,000㎡·건축물 바닥 100㎡(배율 4배→허용 400㎡)·건물 시가표준 5억/토지 10억. 「별도합산」 선택 시 Step 0.6이 실행조차 되지 않아 isNonBusinessLand=false·중과 0(초과 1,600㎡가 통째로 사업용). 「분리과세」 선택 시 isNbl=true·비율 0.8. 두 선택지의 세액 효과가 정확히 뒤바뀐다.

**검증자 재현 실측**

probe(삭제 완료): buildNblEngineInput(route와 동일 경로) + judgeNonBusinessLand, DEFAULT_NON_BUSINESS_LAND_RULES.
입력: nblLandType=other_land, nblZoneType=general_residential, acquisitionArea=2000, acquisitionDate=2010-01-01, transferDate=2024-01-01, nblOtherHasBuilding=true, nblOtherBuildingValue=500,000,000, nblOtherLandValue=1,000,000,000, nblOtherBuildingFloorArea=100.

nblOtherPropertyTaxType="separate" (UI 라벨 「별도합산」):
  isNonBusinessLand = false
  judgmentReason = "재산세 separate + 기간기준 충족"
  areaProportioning = (없음)
  judgmentSteps ids = [land_category, unconditional_exemption, other_bare_land, other_tax_type_criteria]  ← other_building_multiplier 부재

nblOtherPropertyTaxType="special_sum" (UI 라벨 「분리과세」):
  isNonBusinessLand = true
  judgmentReason = "건물 부수토지 배율(4배) 초과 — 초과분 1600㎡ 비사업용"
  areaProportioning = { totalArea 2000, businessArea 400, nonBusinessArea 1600, nonBusinessRatio 0.8, buildingMultiplier 1 }
  judgmentSteps ids = [land_category, unconditional_exemption, other_bare_land, other_building_multiplier, other_tax_type_criteria, other_building_multiplier_apply]
  step detail = "일반주거지역 4배 (「지방세법 시행령」 제101조 제2항) → 허용 400㎡ 초과분 1600㎡는 별도합산 제외"

참고(대조군): "comprehensive" → isNbl=true(Step 0.6 미실행), "exempt" → isNbl=false(Step 0.6 미실행).
⑧ validation: validateAssetAcquisition(asset,0,1) = "0: 취득가액을 입력하세요." — NBL 재산세 분류·바닥면적을 막는 항목 없음.

**법령 독립확인**

법령 축만 독립 확인했다(코드 재현은 범위 밖). 결론: **용도지역별 적용배율 한도는 「별도합산」 축에만 존재한다** — 조문 본문으로 확정.

**1) 배율은 별도합산 범위 규정 안에만 있다.** 「지방세법 시행령」 **제101조**의 제목 자체가 "**별도합산과세대상 토지의 범위**"이고, 그 ①은 "법 제106조제1항제2호가목에서 …대통령령으로 정하는 건축물의 부속토지"를 정의한다. 그 2호 본문이 finding이 인용한 배율 조항이다. ②의 배율표(전용주거 5·준주거/상업 3·일반주거/공업 4·녹지 7·미계획 4·도시지역 외 7)도 "**제1항에 적용할**" 배율이라고 명시해 §101 밖으로 나가지 않는다.

**2) 분리과세 축에는 일반건축물 배율이 없다.** 「지방세법 시행령」 **제102조**("**분리과세대상 토지의 범위**", 법 §106①3호 위임) 전문(①~⑫)을 읽었다. 면적 한도는 **공장입지기준면적**(①1호 → 「지방세법 시행규칙」 **제50조** → **별표 6**), 축산용 기준면적표(①3호) 등이고, **용도지역별 적용배율은 단 한 번도 나오지 않는다**. §103(건축물의 범위 등)도 §101 소관 규정일 뿐 배율을 분리과세로 확장하지 않는다.

**3) 초과분의 귀착.** 「지방세법」 §106①1호 verbatim — 종합합산 = "별도합산과세대상 또는 분리과세대상이 되는 토지를 **제외한** 토지". 즉 배율 초과분은 종합합산으로 떨어져 소득세법 §104의3①4호나목의 제외에서 벗어난다. 선례도 같다: **조심2009지0090**(2009.10.22, 기각) "…용도지역별 배율을 적용하여 산정한 면적 중 큰 면적을 **별도합산과세대상으로 구분**"·처분 개요 "바닥면적(78.3㎡)의 3배에 해당하는 234.9㎡는 별도합산과세대상으로, 나머지 277.10㎡는 **종합합산과세대상**으로 구분". 동종 다수(조심2012지0404·0405·0436, 조심2023서7862, 조심2023지3691, 조심2026지0221)가 전부 "배율 → 별도합산 구분"의 축을 전제한다. 국세청 예규도 "용도지역별 적용배율을 초과하는 토지의 분할 양도시 비사업용 토지 규정의 적용"(2007.09.11)으로 존재한다(법제처 API는 nts 본문 미제공 — 제목만 확인).

**4) finding의 전제 한 곳은 부정확하다(결론은 불변).** §104의3①4호나목 verbatim은 "「지방세법」 제106조제1항**제2호 및 제3호**에 따른 재산세 별도합산과세대상 **또는 분리과세대상**이 되는 토지"로, 별도합산과 분리과세를 **둘 다** 제외한다. finding은 "나목이 제외하는 것은 §106①2호 별도합산"이라고만 적었다. 이 정정은 결론을 약화시키지 않고 **강화**한다 — 분리과세 선언에 배율을 걸면 (a) 법에 없는 한도를 적용하는 데다 (b) 나목이 이미 분리과세를 사업용으로 빼주므로 이중으로 근거가 없다.

**5) 코드 enum 의미(법이 아닌 사실관계로만 확인).** UI Select는 `separate`="별도합산"·`special_sum`="분리과세"(OtherLandDetailSection.tsx:212·213·220·221), other-land.ts:316도 `route==="separate_taxation"(분리과세) → "special_sum"`으로 같은 뜻이며, `NBL.FACTORY_LAND_SEPARATE = "지방세법 시행령 §102①1호 + 시행규칙 §50 [별표 6]"`(transfer-nbl.ts:86, 분리과세)·`NBL.BUILDING_SITE_MULTIPLIER = "지방세법 시행령 §101①2호 (같은 조 ② 적용배율)"`(:98, 별도합산)로 상수 인용도 이 매핑과 정합한다. 반면 anchor(other-land-building-multiplier.anchor.test.ts:52) 주석만 `special_sum`을 "별도합산"으로 읽는다. **법령 관점에서 어느 쪽이 정본인지는 답이 하나다** — 배율(§101①2호)은 별도합산 축이므로, 게이트는 UI가 "별도합산"으로 라벨한 리터럴에 걸려야 하고 anchor 주석은 정정 대상이다. 참고로 같은 저장소 재산세 엔진은 이미 모호하지 않은 이름을 쓴다(`separate_aggregate`=별도합산·`separated`=분리과세, property.types.ts:62·63) — finding의 리네임 제안 방향과 일치한다.

**6) 유일한 반대방향 뉘앙스(현행 게이트를 정당화하지는 못함).** 영 §102⑧9호는 부동산집합투자기구 소유 토지 중 "**법 제106조제1항제2호에 해당하는 토지**"를 분리과세로 삼아, 그 좁은 경우엔 분리과세 판정이 §101①2호(배율)에 종속된다. 그러나 이는 특정 투자기구 전용이고 코드에 해당 입력이 없으며, 어느 쪽으로 판정되든 2호·3호 모두 나목 제외 대상이라 비사업용 결론이 달라지지 않는다.

도구 실패 항목: 국세청 예규 본문(법제처 API 미지원 — 제목·링크만), "별도합산 용도지역별 적용배율 초과 비사업용토지" 등 장문 질의 0건(키워드 축약 후 8건 확보). 어느 것도 "명문 없음" 근거로 쓰지 않았다.

**제안 수정**

게이트를 `effectiveTaxType === "separate"`로 정정하거나 enum을 separate_aggregate/separate_taxation처럼 뜻이 드러나는 이름으로 바꿔 UI·엔진·테스트를 한 번에 맞춘다. ⚠️ 기존 anchor(other-land-building-multiplier.anchor.test.ts:52)가 special_sum에 「사용자가 별도합산을 선언한다」 주석을 달아 현행 반전을 고정하고 있다 — 어느 쪽이 정본인지(UI 라벨 vs anchor)를 먼저 확정해야 정정 방향이 뒤집히지 않는다.

**수정 위험**

권고 방향(게이트를 `effectiveTaxType === "separate"` 로 정정, 또는 enum을 separate_aggregate/separate_taxation 로 개명하며 UI·엔진·테스트 동시 정렬) 적용 시:

RED 예상 — __tests__/tax-engine/non-business-land/other-land-building-multiplier.anchor.test.ts. base()(:52)가 `propertyTaxType: "special_sum" // 사용자가 「별도합산」을 선언한다` 로 현행 반전을 고정한다. BM-1~BM-7(:66·72·80·90·109·123·136)이 전부 이 base를 타므로 게이트를 뒤집으면 실패한다. 리터럴만 separate로 바꾸면 그대로 GREEN 복귀한다(단언 자체는 법령상 옳다). 음성 케이스 BM-8(:144 comprehensive)·BM-9(:151 바닥면적 미입력)·BM-10(:159 건물없음)은 어느 방향이든 GREEN.

영향 없음 — factory-land-standard-area.anchor.test.ts:448(`propertyTaxType = "special_sum"`, isBusiness true 기대): base()(:48)에 buildingFloorArea·건물/토지 시가표준액이 없어 Step 0.6 게이트(`!bareLand && buildingFloorArea > 0`)에 애초에 도달하지 않는다. __tests__/lib/calc/nbl-detailed-cases.test.ts:177·193·211(`"separate"`)도 buildingFloorArea 미설정이라 무영향. `special_sum` 을 쓰는 파일은 전 저장소에 위 3개 테스트 + 엔진 3줄 + UI 3줄 + 스토어 타입 1줄뿐이고, 타 세목(property/comprehensive)은 독립 enum(separate_aggregate/separate_taxation)을 쓰므로 세목 간 파급 없음.

대안 수정(UI 라벨만 맞바꾸기)은 더 위험하다 — IndexedDB 이력·sessionStorage에 이미 저장된 `separate`/`special_sum` 값의 의미가 조용히 뒤바뀌어 과거 계산 결과가 재현되지 않는다. 개명 방식을 택하면 lib/stores/calc-wizard-asset-migrate.ts 계열에 마이그레이션이 필요하다.

---

#### F29 · 비사업용 유예기간(§168의14①) 일수를 사업용 기간과 합집합이 아니라 산술 합산해 판정이 뒤집힌다

| | |
|---|---|
| 위치 | `lib/tax-engine/non-business-land/period-criteria.ts:168` |
| 판정 | **CONFIRMED** |
| 심각도 | **high** |
| 도달성 | reachable-via-ui |
| 탐지 축 | nbl |
| 조치 | 배치 9 |

**결함**

사업용 사용기간은 :144에서 mergeOverlappingPeriods로 합집합을 만드는데 유예기간은 :167-170에서 calculateGraceDaysInWindow가 낸 일수를 `+=`로 더한다. 겹치면 같은 날이 두 번 계산되고, 창 길이 min-clip(:173-175)이 오히려 「창을 꽉 채운 것」으로 만들어 비사업용 일수를 0으로 만든다. 유예기간은 「사업용으로 사용한 기간으로 본다」는 의제이므로 합집합이어야 한다. 겹침은 예외가 아니다 — resolveGraceIntervals의 5·6호는 기산일이 취득일이라(grace-reason-period.ts:96-99·108-110) 취득 직후 자경 농지는 구조적으로 항상 겹친다.

**실패 시나리오**

농지·2014-01-01 취득→2024-01-01 양도(3,651일)·재촌 전 기간·자경 2022-07-01~2024-01-01(549일)에 유예 9호(건축물 멸실 2022-07-01부터 5년)를 같은 구간에 입력하면 사업용 일수가 549→1,098로 두 배가 되어 직전 3년 창(1,096일)이 꽉 차 §168의6 1호 나목이 미충족 → 사업용으로 판정된다. 양도 10억·취득 3억 기준 산출세액 126,810,000 → 96,260,000(30,550,000 과소).

**검증자 재현 실측**

시나리오(원 리뷰어와 동일 입력): 농지·2014-01-01 취득→2024-01-01 양도·재촌 전기간·자경 2022-07-01~2024-01-01·유예 9호(멸실 2022-07-01, 자동 +5년 → 2027-07-01).

meetsPeriodCriteria 직접 호출:
- grace 없음: meets=false(비사업용), total=3651, effectiveBusinessDays=549, bizInLast3=549, bizInLast5=549, gracePeriodDays=0 / detail "직전5년 비사업 1277일(가 충족), 직전3년 비사업 546일(나 충족), 전체 비사업 3102일(다 충족)"
- grace 있음: meets=true(사업용), effectiveBusinessDays=1098(중복 549), bizInLast3=1095(1098이 창길이 1095로 min-clip), bizInLast5=1098, gracePeriodDays=549 / detail "직전5년 비사업 728일(가 미충족), 직전3년 비사업 0일(나 미충족), 전체 비사업 2553일(다 충족)"

judgeNonBusinessLand: isNonBusinessLand true → false (effectiveBusinessDays 549→1098).
클라이언트 raw 경로(buildNblEngineInput, 기산일만 입력): gracePeriods=[2022-07-01~2027-07-01], 판정 true→false 동일.

세액(표준 하네스 `__tests__/tax-engine/_helpers/mock-rates` baseTransferInput, 양도 10억·취득 3억·land·非1세대1주택):
- grace 없음: calculatedTax 261,240,000 / surchargeType "non_business_land" 0.1 / LTHD 0.18
- grace 있음: calculatedTax 204,090,000 / surcharge undefined
- 델타 57,150,000 (과소)

⚠️ 원 주장의 세액 수치(126,810,000 → 96,260,000, 델타 30,550,000)는 **재현되지 않았다** — 그 값은 과표 305,500,000 기준(40%+10%p vs 40%)으로 내부적으로는 정합하나 이 저장소 표준 입력으로는 나오지 않는다. 판정 뒤집힘과 델타 방향은 동일하고 실측 델타는 오히려 더 크다.

**제안 수정**

GracePeriod[]를 DateInterval[]로 바꿔 effectivePeriods와 함께 mergeOverlappingPeriods에 넣고 창별 sumDaysInWindow를 한 번만 호출한다(같은 파일 :144가 정본). gracePeriodDays echo는 merge 전후 차(합집합 증가분)로 산출하면 표시 의미가 유지된다.

**수정 위험**

낮음~중간. 결과가 달라지는 것은 **유예기간이 사업용 사용기간과 겹치는 입력뿐**이며, 현재 이 동작을 고정하는 테스트는 없다:
- `__tests__/tax-engine/non-business-land/qa-integration.test.ts:487-503` (QA-101) — 사업용 2010-01-02~2020-01-01과 유예 2015-01-01~2016-01-01이 **완전히 겹치는 유일한 기존 테스트**지만 단언이 `expect(r).toBeDefined()`·`typeof r.isNonBusinessLand === "boolean"`뿐이라 수정해도 red가 나지 않는다(= 이 동작을 의도로 고정한 증거가 아니라 안전망 부재의 증거).
- `grace-wiring.test.ts`(자경 2018~2019 vs 유예 2023-06~2026-06)·`integration.test.ts:218-235`(자경 2021~2022-06-30 vs 유예 2022-07-01~2023-06-30)·`nbl-grace-auto-period.test.ts`(자경 2018~2019 vs 유예 2021-06~2026-06) — 전부 **비겹침**이라 합집합으로 바꿔도 그대로 통과한다.
- 기준선 실측: `npx vitest run __tests__/tax-engine/non-business-land/ __tests__/lib/calc/nbl-grace-auto-period.test.ts` → 29파일 377테스트 전부 통과(현재).

주의점 2가지:
1) `meetsPeriodCriteria`는 farmland·forest·pasture·villa-land·other-land 6개 judge에서 **13개 호출 지점**이 있고 각기 다른 `effectivePeriods`(realFarming·nonVilla·fullPeriod 등)를 넘긴다 — 합집합은 호출 지점별로 각각 적용되어야 하며 헬퍼 내부에서 처리하면 자동 추종된다.
2) `gracePeriodDays`는 결과 표시에 쓰인다(`components/calc/NonBusinessLandResultCard.tsx:187-190`, "유예기간 N일"). 정의를 "합집합 증가분"으로 바꾸면 겹침 입력에서 표시값이 줄어드니(겹침 전량이면 0) 라벨 의미를 함께 점검할 것. 타 세목 영향 없음(`non-business-land/`는 양도세 전용).

---


### Medium — 입력이 조용히 무시되거나 화면에서 사라진다

#### F03 · 다건 가산세 2-pass가 집계 전 자산별 standalone 결정세액을 가산세 과세표준으로 주입한다

| | |
|---|---|
| 위치 | `app/api/calc/transfer/multi/route.ts:317` |
| 판정 | **PARTIALLY_CONFIRMED** · 법령 CONFIRMED |
| 심각도 | ~~high~~ → **medium** |
| 도달성 | reachable-via-ui |
| 탐지 축 | core / multi |
| 조치 | ⏸ **사용자 판단 대기** |

**결함**

`const determinedTax = breakdown?.determinedTax ?? 0`(:317)이 filingPenaltyDetails.determinedTax와 delayedPaymentDetails.unpaidTax fallback으로 주입된다. 그 값은 aggregate가 skipBasicDeduction=true·skipLossFloor=true로 부른 단건 standalone 결과(transfer-tax-aggregate.ts:526)이고, 같은 파일 :499-501 주석이 「그 값은 부정확하다」고 명시하며 그 목적으로 refDeterminedTax(:514, breakdown :543)를 따로 계산해 같은 객체에 실어 둔다. 즉 §102② 차손통산·§103 기본공제·합산 누진이 전혀 반영되지 않은 금액에 가산세율이 곱해진다.

**실패 시나리오**

[과대] 이익자산(6억→2억)+차손자산(1억→3억) 무신고 20%: 현행 penaltyTax 21,692,000(base 108,460,000) / totalTax 56,105,500인데 신고서 전체 결정세액은 31,285,000 — base가 결정세액의 3.47배다. 별도 실측(2자산·1건 무신고)에서도 자산 base 138,060,000 vs 합산 determinedTax 8,040,000, 가산세 27,612,000이 신고 전체 결정세액의 3.4배. [과소] 차손 없는 [3억→2억, 3억→2억]에서는 합산 누진 미반영으로 5,760,000(정당 base 8,590,000).

**검증자 재현 실측**

[실제 POST /api/calc/transfer/multi, 2015-06-01 취득 / 2024-06-01 양도 / expenses 0]
■ 제보 시나리오 A (이익 6억→2억 무신고20% + 차손 1억→3억) — 제보 수치 전건 일치:
  props determinedTax=[108,460,000, 0] · refDeterminedTax=[27,460,000, 0] · LTHD=[64,000,000,0] · income=[336,000,000, -200,000,000]
  집계 determinedTax=31,285,000 (taxBase 133,500,000 · basicDeduction 2,500,000)
  penaltyBase(주입)=108,460,000 · penaltyTax=21,692,000 · totalTax=56,105,500
  → 108,460,000 / 31,285,000 = 3.467배 (제보 "3.47배" 일치) · Sum(refDeterminedTax)=27,460,000 ≠ 31,285,000 (제보 일치)
■ 제보 [과소] 시나리오 (3억→2억 × 2, 둘 다 무신고):
  props determinedTax=[14,400,000, 14,400,000] · refDeterminedTax=[13,800,000, 14,400,000]
  집계 determinedTax=42,950,000 · 현행 penaltyTax=5,760,000 · 집계×20%=8,590,000 (제보 두 수치 모두 재현)
■ ⚠️ 정정 실측 — §107①(기본공제 포함) 기준 단건 엔진 대조:
  6억→2억: skipBasicDeduction=true 108,460,000 vs 기본공제 반영 107,460,000 → 차이 1,000,000, 가산세 20% 차이 200,000 (0.93%)
  3억→2억: skip 14,400,000 vs 기본공제 반영 13,800,000 → 2건 무신고 시 현행 5,760,000 vs §107① 기준 5,640,000 (현행이 120,000 과대 — 제보의 "과소" 방향과 반대)

**⚠️ 정정된 주장** (원 보고가 과장·부정확했던 부분)

다건 가산세 2-pass(`app/api/calc/transfer/multi/route.ts:317`)가 주입하는 `breakdown.determinedTax`는 aggregate가 `skipBasicDeduction: true`(`transfer-tax-aggregate.ts:99`)로 부른 단건 standalone 결정세액이라 **양도소득기본공제가 빠져 있다**. 이 앱의 자산별 가산세는 소득세법 §105 예정신고 기한(`lib/calc/filing-deadline.ts:30-42`)에서 파생되는 **예정신고 무신고**이고, 국세기본법 §47의2①이 예정신고를 포함하며 §47의2⑤가 확정신고와의 중복을 배제하므로 자산별 합산 자체는 정합하다. 다만 그 base는 **소득세법 §107① 예정신고 산출세액 = (양도차익 − 장기보유특별공제 − 양도소득기본공제) × 세율**이어야 하는데 기본공제가 누락돼 **base가 (기본공제 × 적용세율)만큼 과대**하고, 가산세가 그 20~60%만큼 납세자에게 불리하게 과대 산정된다(실측 +200,000 / 0.93%).

제보가 주장한 "§102② 차손통산·§103 기본공제·합산 누진이 반영돼야 한다"는 **§103 기본공제만 맞다**. §107①에는 차손통산도 합산 누진도 없다(§107②는 납세자가 합산 신고를 선택한 경우에 한정). 따라서 "base가 결정세액의 3.47배"라는 과대 규모 주장과 "[3억→2억,3억→2억]에서 5,760,000으로 과소"라는 주장은 **둘 다 확정신고 집계 결정세액을 정당 base로 가정한 전제 오류**다 — 후자는 실측상 오히려 120,000 과대다.

부수 확인: `delayedPaymentDetails.unpaidTax`(:332) 역시 같은 standalone 값을 fallback으로 받아 §47의4 미납세액도 동일 방향으로 과대해진다.

**법령 독립확인**

법령 쪽만 독립 확인했다(코드는 축 판별에 필요한 최소 범위만 열람). 결론: finding의 법적 주장 — 「가산세 기준금액은 그 신고로 납부하여야 할 세액이어야 하고, §103 기본공제·§102② 통산·합산 누진이 빠진 자산별 standalone 금액에 가산세율을 곱하는 것은 조문과 어긋난다」 — 은 조문 본문으로 뒷받침된다.

【1. 가산세 기준금액의 정의 — 국세기본법(법률)】
- §47의2① : 기준은 "그 신고로 납부하여야 할 세액". 괄호가 기준금액에서 빼라고 명시한 것은 "가산세와 … 이자 상당 가산액"뿐이다. 기본공제·통산을 빼고 계산하라는 문언은 없다.
- §47의3① : "과소신고한 납부세액과 초과신고한 환급세액을 합한 금액".
- §47의4①1호 : "납부하지 아니한 세액 또는 과소납부분 세액".
⇒ 세 조문 모두 base를 **그 신고 단위의 납부하여야 할 세액**에 결박한다. "자산별 세액"이라는 축은 국기법에 존재하지 않는다.
- 위임 확인: §47의2⑦·§47의3⑦ → 국기령 §27의2. 본문 전문을 읽었으나 부정과소신고분 안분(③)·부가세 특례뿐이고 **base 산정을 달리 정하는 규정은 없다**(= 법 본문이 그대로 지배).

【2. "납부하여야 할 세액"이 무엇인가 — 소득세법(법률) 위임체인】
- §92②3호 : "양도소득과세표준: … 양도소득금액에서 제103조에 따른 양도소득 기본공제액을 공제하여 계산" → 과세표준 단계에서 기본공제는 **강행**.
- §92③1·2·3호 : 산출세액 → 결정세액(감면 공제) → "양도소득 총결정세액: … 결정세액에 제114조의2, 제115조 및 「국세기본법」 제47조의2부터 제47조의4까지에 따른 가산세를 더하여 계산". ⇒ 가산세가 얹히는 토대가 **§92②의 과세표준을 거쳐 산출된 결정세액**임을 소득세법이 직접 지정한다.
- §102②(+ 시행령 §167의2①) : "양도차손이 발생한 자산이 있는 경우에는 … 다른 자산에서 발생한 양도소득금액에서 그 양도차손을 **공제한다**" / 령 §167의2① "같은 세율 → 다른 세율 순차, 다른 세율이 2 이상이면 세율별 합계액에서 차지하는 비율로 안분". ⇒ 통산은 재량이 아니라 강행.
- §103①② : 소득별 연 250만원 공제, 공제순서는 "감면소득금액 외의 양도소득금액에서 먼저 … 먼저 양도한 자산의 양도소득금액에서부터 순서대로".
- §111①③ : 확정신고납부액 = "해당 과세기간의 과세표준에 대한 양도소득 산출세액에서 감면세액과 세액공제액을 공제한 금액", "제107조에 따른 예정신고 산출세액 … 이를 공제하여 납부". ⇒ 확정신고 축의 "납부하여야 할 세액"은 **과세기간 단위 집계값**이다.

【3. 예정신고 축으로 읽어도 결론은 같다 — 기본공제는 빠질 수 없다】
국기법 §47의2①은 "과세표준 신고(**예정신고 및 중간신고를 포함**하며…)", §47의4①은 "납부(중간예납ㆍ**예정신고납부**ㆍ중간신고납부를 포함한다)"라 하여 자산(거래)별 예정신고도 독립 신고 단위로 인정한다. 그러나 그 경우의 base는 소득세법 §107이다:
- §107① : "예정신고 산출세액 = (A − B − **C**) × D", **C = 양도소득 기본공제**.
- §107② : 누진세율 대상 자산을 2회 이상 예정신고하면서 합산신고하려는 경우 "[(A + B − C) × D] − E"(A=이미 신고한 양도소득금액, E=이미 신고한 예정신고 산출세액).
⇒ 확정신고 축이든 예정신고 축이든 **기본공제가 반영된 과세표준**이 base다. `skipBasicDeduction: true`(lib/tax-engine/transfer-tax-aggregate.ts:99)로 산출된 자산별 standalone 결정세액은 §92②3호·§103①에도, §107①C에도 해당하지 않는다.

【4. 위임입법(서식)이 축을 못박는다 — 소득세법 시행규칙 별지 제84호서식(개정 2026.3.20.)】
본표 열 축은 "③ 세율구분(코드) / 양도소득세 합계"이고, ⑦ 양도소득기본공제 · ⑧ 과세표준(④+⑤−⑥−⑦) · ⑩ 산출세액 · ⑪ 감면세액 · **⑯ 가산세(무(과소)신고·납부지연·기장불성실 등·계)** · ⑱ 납부할 세액(⑩−⑪−⑫−⑬−⑭−⑮+⑯−⑰)이 **모두 같은 축**에 놓인다. 자산별 명세인 **부표 1(양도소득금액 계산명세서)은 ⑱양도소득금액(및 ⑲⑳ 감면소득금액·기준시가)에서 끝나고 기본공제·과세표준·산출세액·가산세 칸이 아예 없다**. 작성요령 13은 "⑯ 가산세란: **산출세액에** 기한 내 신고ㆍ납부 불이행에 따른 무(과소)신고(일반무신고 20%, 부당무신고 40%, 일반과소신고 10%, 부당과소신고 40%)ㆍ납부지연 … 금액을 적습니다"라 하여 그 산출세액이 작성요령 8의 **집계 산출세액**(가: 과세기간 과세표준 합계액×§55① / 나: 자산별 산출세액 합계 중 큰 금액)임을 전제한다.
⇒ 서식 상 **자산별 가산세 칸은 존재하지 않는다**. 자산별 standalone 세액을 가산세 base로 쓰는 축은 법·령·규칙 어디에도 없다.

【5. 선례】
조세심판원(tax_tribunal) 14건·판례 25건·국세청 해석(nts) 6건을 검색했으나, **다자산 양도 시 가산세 기준금액을 자산별로 산정할 수 있는지**를 직접 판단한 선례는 확인되지 않았다(감면 대상자 무신고, 부당무신고 40% 요건, 명의신탁 등 다른 쟁점뿐). ⇒ 이 쟁점에 대한 **선례는 부존재**하며, 판단은 위 조문·서식 문언으로 갈린다. 국세청 해석 본문은 법제처 OPEN API가 조회를 제공하지 않아(NOT_SUPPORTED) 원문 대조는 하지 못했다 — 다만 위 조문만으로 판정이 갈리므로 미확인이 결론을 바꾸지 않는다.

【6. finding 서술 중 정밀도가 낮은 부분(수정 필요, 방향은 유지)】
- "§102② 차손통산 … 반영되지 않았다"는 **확정신고(과세기간) 축에서만 무조건 성립**한다. 자산별 최초 예정신고 시점에는 통산할 다른 자산이 없을 수 있고, §107②의 합산은 "합산하여 신고하려는 경우"라는 **선택적** 요건이다(령 §173⑤1호가 그 미합산 시 확정신고 의무를 규정).
- 반면 **기본공제 누락은 두 축 모두에서 조문 위반**이다(§92②3호·§103① / §107①C). finding에서 가장 강한 근거는 이쪽이다.
- 국기법 §47의2⑤·§47의4⑤는 "예정신고와 관련하여 가산세가 부과되는 부분에 대해서는 확정신고와 관련하여 … 적용(부과)하지 아니한다"고 하므로, 자산별(예정) 가산세와 신고단위(확정) 가산세를 **동시에 더하면 중복부과**가 된다. 수정 시 축을 하나로 정해야 한다.

【7. 부수 관찰(F03 범위 밖, 별건)】
app/calc/transfer-tax/steps/Step6.tsx:135 hint가 이자상당액 제외 근거를 "국세기본법 §47의2③"으로 적고 있으나, **현행 §47의2③은 부가가치세법 §69 납부의무 면제 등 적용배제 규정**이고 이자상당액 제외는 **§47의2① 괄호**(및 §47의3① 괄호)에 있다. 과거 시행본에 ③이었는지는 `efYd` 조회가 NOT_FOUND로 실패해 **확인 필요**(추정하지 않음). F03 판정과는 무관하다.

**제안 수정**

가산세 base를 다건 컨텍스트 값으로 교체한다. 다만 Sum(refDeterminedTax)=27,460,000이 집계 결정세액 31,285,000과 일치하지 않고, multi 축이 refCalculatedTax 산식(aggregate.ts:507-513, 파트 없는 자산은 standalone appliedRate·누진공제를 aggregate taxBaseShare에 적용)의 별도 문제를 지적했으므로 그 산식을 먼저 정리해야 한다. ⚠️ 이 정정은 §104⑤ 비교과세의 refCalculatedTax 역안분(재제안 금지 항목)과 무관한 별개 축이며, 그 모델을 되살리는 방향으로 확장해서는 안 된다. 정답 base(자산별 재계산 vs 집계 결정세액 안분)는 국세기본법 §47의2 문언 확인 후 결정.

**수정 위험**

🔴 **제보가 제시한 방향(집계 결정세액 또는 refDeterminedTax로 교체)으로 고치면 ~1% 오차를 훨씬 큰 반대 방향 오차로 바꾼다.** 실측상 [3억→2억 ×2] 사례에서 5,760,000 → 8,590,000(집계 base)로 49% 상향되는데, 소득세법 §107①·국세기본법 §47의2⑤에 반한다(예정신고 무신고 base에 차손통산·합산 누진을 넣는 셈). 좁은 정답 수정은 "자산별 §107① 예정신고 산출세액(기본공제 포함)"을 별도 산출해 주입하는 것인데, aggregate의 `allocatedBasicDeduction`은 **확정신고 MAX_BENEFIT 배분**이라 그대로 쓸 수 없다 — 예정신고는 시간순으로 첫 신고에 250만원이 소진되므로 새 배분 로직이 필요하다(자동 안분 금지 정책과의 충돌 여부도 먼저 판단할 것).

⚠️ **안전망이 사실상 없다** — 바꿔도 red가 안 난다:
- `__tests__/tax-engine/transfer-tax-aggregate.test.ts:446`·`:475`(T-M11)는 `filingPenaltyDetails.determinedTax`에 100,000,000을 **직접** 넣고 엔진을 부르므로 route의 주입 경로를 전혀 타지 않는다. 단언도 `toBeGreaterThan(0)`/`toBeGreaterThanOrEqual(0)` 수준이라 값이 바뀌어도 통과한다.
- `__tests__/api/`에 다건 route POST 테스트 자체가 없다(`transfer/multi` grep 0건).
- `e2e/transfer-multi-*.spec.ts` 5건 어디도 가산세 금액을 단언하지 않는다.
⇒ 수정 시 **회귀 0건**이 나오는데, 그것은 "의도된 동작"의 증거가 아니라 **사각지대 신호**다(memory `feedback_pre_change_safety_net_probe`). 손대기 전에 현행 값을 고정하는 characterization anchor를 먼저 심을 것.

영향 범위는 다건 route 한 곳으로 좁다 — `filingPenaltyDetails` 주입 지점은 단건 `app/api/calc/transfer/route.ts:462-464`와 다건 `multi/route.ts:320-336` 둘뿐이고 단건은 정합하므로 타 세목 파급 없음.

---

#### F20 · 겸용주택 §104⑤2호 파트 세액이 §104① 후단(단기세율 vs §55① 누진 MAX)을 건너뛴다

| | |
|---|---|
| 위치 | `lib/tax-engine/transfer-tax-mixed-use-totals.ts:159` |
| 판정 | **CONFIRMED** · 법령 CONFIRMED |
| 심각도 | ~~high~~ → **medium** |
| 도달성 | reachable-via-ui |
| 탐지 축 | rate |
| 조치 | 배치 6 |

**결함**

buildTotalTax의 clause2에서 §104⑦ 가산이 붙는 파트(:143-149)는 max(중과세액, 단기세액)로 후단을 수행하는데, 가산이 없는 순수 단기 파트(:151-159)는 `applyRate(base, r)` 한 줄로 끝나 §104①1호(§55① 누진)와 비교하지 않는다. 저장소 정본은 compareWithClause1(transfer-tax-rate-calc.ts:135, :503-512가 단기 호에 적용)이고 split 경로는 파트별 calcTax 위임으로 자동 적용된다 — 겸용만 §104 세율을 자체 구현해 빠졌다. clause1과의 MAX로도 구제되지 않는다(주택 파트가 60/70%로 clause2를 끌어올리면 후단 누락분이 그대로 남는다).

**실패 시나리오**

겸용, 보유 1.5년, 주택분 양도소득금액 10억·상가토지 12억·상가건물 8억, 기본공제 250만. 현행 buildTotalTax → transferTax 1,398,500,000(rateBasis clause2). 상가 합산 과표 20억에 후단을 적용하면 40% 800,000,000 < §55① 누진 834,060,000이므로 상가분은 834,060,000, 주택분 598,500,000을 더해 1,432,560,000이 옳다 — 34,060,000 과소(clause1=1,282,935,000이라 MAX가 구제 못함).

**검증자 재현 실측**

[구성 파트 직접 호출] buildTotalTax(housing 10억/commercial 20억/nonBiz 0, 파트: housing 1.5y 10억 · commercial_land 1.5y 12억 · commercial_building 1.5y 8억, 기본공제 2,500,000):
  aggregateIncome 3,000,000,000 · taxBase 2,997,500,000 · taxByBasicRate(clause1) 1,282,935,000 · appliedRate 0.6 · rateBasis "clause2" · **transferTax 1,398,500,000** · localTax 139,850,000
  progressive(2,000,000,000) = 834,060,000 / progressive(997,500,000) = 383,010,000
  sibling calcTax(2,000,000,000, 상가 1.5년) = 834,060,000, rateClause "104-1-1", note "§104① 후단: 단기세율 40% 산출세액보다 §55① 누진세액이 커 1호를 적용"
  sibling calcTax(1,200,000,000)=480,000,000(104-1-2) · calcTax(800,000,000)=320,000,000(104-1-2)
  ⇒ 도출 598,500,000 + 834,060,000 = 1,432,560,000 · **과소 34,060,000** (원 주장과 완전 일치)

[전체 엔진] calcMixedUseTransferTax(5,000,000,000, 2024-06-01, mixedUseCase14 + 취득일 2022-12-01(1.5년) + isOneHouseExempt:false):
  housingPart.incomeAmount 2,522,255,734 · commercialPart.incomeAmount 1,468,735,376 · nonBusinessLandPart null
  taxBase 3,988,491,110 · taxByBasicRate 1,728,880,999 · rateBasis "clause2" · **transferTax 2,099,347,590**
  상가 버킷: 40% 587,494,150 vs progressive 594,990,919 ⇒ 도출 2,106,844,359 · **과소 7,496,769**

[기존 anchor 비노출 확인] mixed-use-104-7-surcharge B-B17(PRICE 30억·보유 1년) 재현: transferTax 1,495,427,008(anchor 기대값과 동일), 상가 소득금액 877,113,019 → 40% 350,845,207 > progressive 332,447,467 ⇒ 수정해도 값 불변.

**법령 독립확인**

법령 쪽만 독립 확인했다(코드 재현 안 함). 결론: **조문 본문이 finding의 법적 주장을 뒷받침한다.**

**1. §104① 후단은 실재하고, 단기 파트에 발동한다.**
「소득세법」 제104조 제1항 후단은 "하나의 자산이 다음 각 호에 따른 세율 중 둘 이상에 **해당**할 때에는 해당 세율을 적용하여 계산한 양도소득 산출세액 중 **큰 것**을 그 세액으로 한다"고 정한다. 1호는 "제94조제1항제1호ㆍ제2호 및 제4호에 따른 자산 → 제55조제1항에 따른 세율"이고 **보유기간 한정도, 2·3호 제외 문구도 없다**. 겸용주택의 상가건물분·상가토지분은 §94①1호(토지·건물) 자산이므로 보유 1~2년이면 **1호와 2호에 동시 해당** → 후단 발동. 괄호·단서까지 읽었고 배제 문구는 없다.

**2. §104⑤2호는 후단을 내장하라고 명시적으로 지시한다.**
⑤2호 본문: "제1항부터 제4항까지 및 제7항의 **규정에 따라 계산한** 자산별 양도소득 산출세액 합계액". "제1항의 규정"에는 후단이 포함되므로, ⑤2호 파트 세액은 후단을 거친 값이어야 한다. ⇒ finding의 "clause1과의 MAX로도 구제되지 않는다"도 법적으로 맞다 — ⑤1호는 "**합계액**에 §55①"이라는 별개 규정이고, ⑤ 본문은 두 호의 MAX를 요구할 뿐 2호 내부 계산을 면제하지 않는다.

**3. 위임 체인 끝까지 추적 — 하위법령의 배제·수정 없음.**
§104⑧("그 밖에 양도소득 산출세액의 계산에 필요한 사항은 대통령령으로 정한다")의 산출물을 현행 「소득세법 시행령」 전문(3.1MB) grep으로 전수 확인: **영 §167의5(단기보유 주택부수토지의 범위)**와 **영 §173④4호(경정청구 사유)**뿐. 후단을 배제·변형하는 시행령·시행규칙 조항은 **없다**. §104① 후단은 본칙 직접 적용이다.

**4. 파트별 세율 적용 단위 자체는 예규로 확증된다.**
**사전-2014-법령해석재산-22086**(2015.02.13) 요지: "상가겸용주택(주택부분 면적이 더 큼)과 그 부수토지를 1년이상 2년미만 보유하다가 양도하는 경우 주택(그 부수토지 포함)과 그 외의 부분(그 부수토지 포함)을 **각각 구분하여** 주택은 일반세율을, 그 외의 부분은 40% 세율을 적용함". finding이 전제하는 "겸용 파트가 각각 세율 적용 단위"라는 구조를 확증한다.
⚠️ **다만 이 예규는 권위로 쓸 수 없다** — 인용한 조문이 **2014.1.1 개정본**이고 그때 후단은 "그 중 **가장 높은 것을 적용**한다"였다(내 실측: efYd=20140101). 현행 "**산출세액 중 큰 것**" 문언은 그 뒤 개정이라 이 예규는 현행 후단에 대해 침묵한다.

**5. 정면 선례는 부존재.**
조세심판원 2회·국세청 겸용주택 10건을 검색했고 §104① 후단 × 일반 단기(2·3호)를 정면으로 다룬 것은 **0건**이다. 저장소의 기존 전수조사(2026-08-03 MCP · 2026-08-10 NTS Playwright)와 일치한다. 발현 구간이 극히 좁아(아래) 실무에서 부딪히지 않은 것으로 자연스럽게 설명된다.

**6. 기각 목록과 충돌하지 않는다.**
"§104① 후단 「잔여규정 독법」 병기 금지"는 **1호를 잔여규정으로 읽어 후단을 배제하는** 반대 방향 해석을 금지한 것이다. F20은 그 반대편(후단 적용)이므로 기각 항목을 되살리지 않는다. 오히려 저장소 정본과 같다 — 2026-08-11에 `compareWithClause1()`(transfer-tax-rate-calc.ts:135)이 신설되어 2·3호·10호·영§167의5에 후단을 **항상** 적용하도록 이미 종결됐다. 겸용 경로만 §104 세율을 자체 구현해 그 정본을 우회한다는 것이 F20의 지적이고, 법령상 그 우회는 정당화되지 않는다.

**한계 명시**: 겸용주택 파트를 "별개의 자산"으로 의제하는 **명문**은 §104⑤ 본문 후단의 "한 필지의 토지가 §104의3 비사업용 토지와 그 외의 토지로 구분되는 경우"뿐이고, 주택분/상가분 구분은 그 문언에 직접 들어가지 않는다(근거는 영 §154③④ + 위 예규). 그러나 어느 독법을 취해도 결론은 같다 — 파트가 별개 자산이면 파트마다 후단이 걸리고, 겸용주택 전체가 하나의 자산이면 그 전체에 후단이 걸린다. 코드는 **어느 단위에서도** 순수 단기 버킷에 비교를 수행하지 않는다.

**제안 수정**

단일세율 버킷 세액을 max(applyRate, 누진세액)로 바꾸거나 파트별 세액 산출을 calcTax에 위임해 §104①·⑦ 후단을 한 곳에서만 구현한다(현행 :148 addon 분기도 규칙을 손으로 다시 쓰고 있다). ⚠️ 「잔여규정 독법」 병기는 금지 항목이며 이 제안은 그것이 아니다 — compareWithClause1이라는 기존 정본의 재사용이다. 겸용 파트 버킷에 §104① 후단이 미치는지 조문·기존 판정과 적대적으로 대조할 것.

**수정 위험**

낮다. `buildTotalTax` 소비처는 `transfer-tax-mixed-use.ts:429` 하나뿐이고(재수출 `transfer-tax-mixed-use-helpers.ts:621` 경유), 타 세목 소비처 0건이다. 버킷 키가 `String(rate)`라 §104⑤ 버킷 재편(memory가 경고한 `candidateClauses`/`clauseBucketKey` blast radius)은 겸용에서 발생하지 않는다 — 그룹핑은 그대로 두고 버킷 세액만 max로 바꾸는 국소 변경이다.

기존 anchor 중 이 경로를 고정하는 것은 없다: `mixed-use-104-5-nonbiz.anchor.test.ts`는 전 파트 LONG=10(단기 버킷 자체가 없음), `mixed-use-104-7-surcharge.anchor.test.ts` B-B17(보유 1년·PRICE 30억)은 상가 과세표준 877,113,019로 역전 경계 1,318,800,000 미만이라 **수정해도 1,495,427,008 그대로**임을 실측 확인했다. B-B18(비사토 동반, transferTax 559,027,563)은 rateBasis="progressive"(1호 채택)라 무관.

⚠️ 실제 수정 시 주의: `applyRate(base, r)` 단순 치환이 아니라 `Math.max(applyRate(base, r), calculateProgressiveTax(base, brackets))` 형태여야 하고, `clause2.maxRate`(표시 세율)·`progressiveDeduction` 표시가 1호 승리 버킷에서 어긋나지 않는지 함께 봐야 한다(현행 :198-199는 clause2 채택 시 누진공제를 0으로 강제한다). 제안대로 파트 세액을 `calcTax`에 위임하는 큰 수술은 겸용 파트가 `TransferTaxInput`을 들고 있지 않아 비용이 크다 — `compareWithClause1` 재사용(또는 위 max)이 최소 변경이다.

---

#### F23 · split(토지·건물 별개취득) 경로가 자산-수준 자본적지출·양도비(§97①2호·3호)를 통째로 버린다

| | |
|---|---|
| 위치 | `lib/tax-engine/transfer-tax-helpers.ts:273` |
| 판정 | **PARTIALLY_CONFIRMED** |
| 심각도 | ~~high~~ → **medium** |
| 도달성 | reachable-via-ui |
| 탐지 축 | split |
| 조치 | ⏸ **사용자 판단 대기** |

**결함**

calcTransferGain은 calcSplitGain 결과가 있으면 :273-296에서 조기 반환하는데, 그 분기는 필요경비를 splitResult.land/building.directExpenses로만 만들고 calcNecessaryExpense를 호출하지 않아 input.capitalExpenditure·input.transferExpense를 한 번도 읽지 않는다(transfer-tax-split-gain.ts:500-512의 총액 소스도 deprecated input.expenses뿐). UI는 CompanionAssetCard.tsx:403에서 ④ 필요경비 섹션을 split 자산에도 항상 렌더하고 ④ 변환은 게이트 없이 전송한다. 특히 파트별 양도비 입력 필드는 코드베이스에 존재하지 않아(AssetForm grep 0건) split 자산의 양도비는 어떤 경로로도 반영될 수 없다.

**실패 시나리오**

building 자산·양도 10억·토지 3억/건물 2억 실가·토지 2010/건물 2016 취득. ④에 자본적지출 50,000,000+양도비 10,000,000 입력 → 양도차익 500,000,000·총세액 135,366,000으로 미입력과 완전히 동일(변화 0). 같은 50,000,000을 파트 칸에 넣으면 118,206,000(17,160,000 차이). 비-split 동일 자산은 60,000,000 입력이 155,166,000→132,990,000으로 반영된다.

**검증자 재현 실측**

제보 수치(135,366,000 / 118,206,000 / 155,166,000 / 132,990,000)는 fixture 미명시(파트 양도가액 분할)로 그대로 재현되지 않음. 등가 fixture 실측 — propertyType "building", 양도 1,000,000,000(2026-07-01), 토지 600,000,000/건물 400,000,000 구분, 취득 토지 300,000,000(2010-06-01)/건물 200,000,000(2016-06-01), 실가·실가, mock 세율:

[split 활성, isSeparateAcquisition]
· baseline                                  총세액 133,166,000
· 자산-수준 capitalExpenditure 50,000,000    총세액 133,166,000  (델타 0)
· 자산-수준 capex 50,000,000 + 양도비 10,000,000  총세액 133,166,000  (델타 0)
· 자산-수준 transferExpense 10,000,000 단독   총세액 133,166,000  (델타 0)
· 파트 칸 landDirectExpenses 30,000,000 + buildingDirectExpenses 20,000,000  총세액 116,886,000  (델타 16,280,000)
· splitDetail.land.directExpenses = 0 (자산-수준 입력 유무와 무관)
· result.expenses = 0 (자산-수준 입력 유무와 무관)
· result.capitalExpenditureForDisplay = 50,000,000  ← 차감 안 됐는데 echo됨

[동일 자산, split 비활성(landAcquisitionDate 제거)]
· baseline 146,366,000 → capex 50,000,000 + 양도비 10,000,000 시 125,246,000 (델타 21,120,000 — 정상 반영)

[제보 미기재 두 번째 도달 경로: selfOwns="land_only", 취득일 동일, isSeparateAcquisition=false]
· baseline 77,341,000 → 자산-수준 capex 50,000,000 + 양도비 10,000,000 시 77,341,000 (델타 0)
· 파트 칸 landDirectExpenses 50,000,000 시 60,621,000 (델타 16,720,000)

⇒ "자산-수준 두 필드의 세액 영향 = 정확히 0" 및 "파트 칸은 반영" 및 "비-split은 반영"은 전건 재현. 절대 금액만 fixture 차이로 불일치.

**⚠️ 정정된 주장** (원 보고가 과장·부정확했던 부분)

split(`calcSplitGain`) 경로가 자산-수준 `capitalExpenditure`·`transferExpense`를 **경고 없이 무시**한다(transfer-tax-helpers.ts:273-295 조기 반환이 `calcNecessaryExpense`를 우회 · split-gain.ts:500-512의 유일한 총액 소스는 deprecated `input.expenses`). UI(CompanionAssetCard.tsx:393-408)는 ④ 칸을 split 자산에도 게이트 없이 렌더하고 API(transfer-tax-api.ts:307-318)는 게이트 없이 전송하며 validate에는 차단·경고가 없다. 도달 경로는 둘 — ①`hasSeperateLandAcquisitionDate`(별개 취득) ②`selfOwns≠both`(취득일 동일). 실측 세액 변화 0.

단, 제보의 두 가지 서술을 정정한다:

(1) **"통째로 버린다"는 과장이다.** 자본적지출은 파트 칸(`landDirectExpenses`/`buildingDirectExpenses`, UI `LandBuildingSplitSection.tsx:525-532`)이 **정상 반영되는 정본 입력 경로**이고, 엔진이 자산-수준 값을 안 읽는 것은 설계문서 `transfer-tax-acq-cost-swap.engine.design.md:138·151`이 「토지·건물 분리 시 자본·양도비 자동 안분 = 금지, 자산별 명시 입력」으로 **확정한 의도**다. 따라서 자본적지출의 결함은 "계산 누락"이 아니라 **UI/validate 갭** — sibling `transfer-tax-validate-gb.ts:337-350`(V-8)이 일반건물 축에서 자산-수준 capex를 **차단**하는데, 일반 split 축에만 그 가드가 없어 침묵 유실이 된다.

(2) **제안된 수정은 절반이 정책 위반이다.** 인용된 `general-building-swap.ts:195-212`는 **양도비만** 안분한다(:200). 자본적지출은 같은 파일 :234-235가 **파트 직접 귀속**만 쓰고, `validate-gb.ts:344-345`가 그 이유를 명시한다 — 「소득세법」 제100조 제2항 후문은 「**공통되는** 취득가액과 **양도비용**」만 안분 대상으로 열거하고 **자본적지출을 열거하지 않는다**(memory `feedback_no_silent_apportion_fallback`). ⇒ 자본적지출을 §100② 후문으로 안분하자는 제안은 저장소가 명문으로 기각한 접근이며 재제안 금지 대상이다.

**정본 수정 방향**: (a) 자본적지출 — V-8과 같은 **validate 차단**(파트 칸으로 안내). (b) 양도비 — 여기만 진짜 기능 공백이다. `landTransferExpense`/`buildingTransferExpense`는 저장소 전체 grep 0건이고 자산-수준도 유실되므로 split 자산의 §97①3호 양도비는 **어떤 경로로도 반영 불가**하다. §100② 후문이 양도비용을 명시 열거하고 sibling(general-building-swap.ts:196-211)이 이미 그 규칙을 구현하므로 그 헬퍼 공유가 적법하다. **부수**: `transfer-tax.ts:668`의 `capitalExpenditureForDisplay` echo가 split에서도 무조건 실려 신고서 양식이 차감 안 된 금액을 취득가액에 얹는다 — 함께 고쳐야 한다.

**제안 수정**

calcSplitGain이 자산-수준 두 값을 받아 파트별 직접 귀속이 없는 부분만 §100② 후문(파트 양도가액 비율, 마지막 파트 잔액 흡수)으로 안분해 더한다 — general-building-swap.ts:195-212가 같은 규칙을 이미 구현하므로 그 헬퍼를 공유해 dual-truth를 피한다(임의 추정이 아니라 법정 안분 규칙의 재사용이며, 「자동 안분 fallback 금지」 원칙과 충돌하지 않는다). 그 전까지는 split 자산에서 ④ 섹션을 숨기거나 경고로 침묵 누락을 막는다.

**수정 위험**

**정책 충돌(최대 위험)** — 제보가 제안한 「자산-수준 자본적지출을 §100② 후문으로 파트 안분」은 다음 셋과 정면 충돌한다: ① `docs/02-design/features/transfer-tax-acq-cost-swap.engine.design.md:151` 금지 목록 ② `lib/calc/transfer-tax-validate-gb.ts:344-345`의 조문 논거(§100② 후문에 자본적지출 미열거) ③ CLAUDE.md·memory `feedback_no_silent_apportion_fallback`의 「자동 안분 fallback 금지」. 자본적지출에 대해서는 채택하면 안 된다.

**이중 계상 위험** — 자산-수준 값을 파트에 더하면 사용자가 파트 칸에도 같은 지출을 넣은 경우(UI가 두 칸을 동시에 노출하므로 흔하다) 그대로 중복 차감된다. `AssetSectionExpense.tsx`엔 파트 칸과의 배타 안내가 없다.

**red가 나는 기존 테스트**
- `__tests__/calc/transfer-tax-validate-split.test.ts:180-189` — split + `capitalExpenditure: "100,000,000"`에서 `validateSplitDirectInputs`가 **null(통과)**이어야 한다고 고정. V-8식 차단을 같은 함수에 넣으면 red. (별도 validate 지점에 넣으면 우회 가능하나, 그 경우 두 층의 판정이 갈려 dual-truth가 된다.)
- `__tests__/tax-engine/transfer-tax/split-gain-residual-symmetry.anchor.test.ts:113-137` — `expenses=0`일 때 파트 칸이 "총액 안분"이 아닌 **독립 입력**임을 고정(:118-136, 잔액 규칙 적용 시 음수 → 공제 소멸). `splitPair` 의미를 건드리는 수정은 여기서 red.
- `__tests__/tax-engine/transfer/audit-fix-split-gain.test.ts` — PHD(§164⑤) 경로의 §97②2호 MAX(택일) 규칙. capex를 split에 새로 흘리면 `applyAssetSwap`의 `explicitDirect` 인자(split-gain.ts:544·552는 `input.landDirectExpenses !== undefined`를 본다)와 상호작용해 swap 자격이 뒤바뀔 수 있다.
- `transfer-tax-split-gain.ts:529-535`가 잔액 흡수 재시도로 PHD Excel anchor 14건이 깨진 이력을 명시 기록 — 이 파일의 안분 규칙 변경은 실패 전례가 있다.

**파급 범위 grep** — `calcSplitGain`은 `transfer-tax-helpers.ts:273` 단일 호출부지만 `calcTransferGain`은 양도세 전 경로(단건·다자산 aggregate·부담부증여·이월과세)가 탄다. 겸용주택은 `calcMixedUseTransferTax`(`transfer-tax-mixed-use.ts:281-289`)가 capex를 **이미** 소비하므로 무관하고, 일반건물·상가는 별도 라우트라 무관 — 즉 영향은 `assetKind` housing·building의 split 축에 한정된다.

**저위험 대안** — ㉠ 자산-수준 capex 차단(V-8 문구 재사용) ㉡ 양도비만 §100② 후문 안분(`general-building-swap.ts:196-211` 공유) ㉢ `capitalExpenditureForDisplay` echo를 split에서 억제. ㉠㉢은 세액 산식 무변경이라 anchor 회귀가 거의 없다.

---

#### F30 · §168의8⑤1호 도시지역 편입유예의 기산점(편입일 소급 1년)이 구현돼 있지 않아 보유기간 아무 곳의 1년 자경으로 통과한다

| | |
|---|---|
| 위치 | `lib/tax-engine/non-business-land/farmland.ts:81` |
| 판정 | **PARTIALLY_CONFIRMED** |
| 심각도 | ~~high~~ → **medium** |
| 도달성 | reachable-via-ui |
| 탐지 축 | nbl |
| 조치 | 배치 9 |

**결함**

hasAtLeastOneYearSelfFarming은 재촌·자경 구간 중 어디든 365일 이상 연속 구간이 있으면 true를 반환한다. 함수 주석(:76)은 법문 「편입된 날부터 소급하여 1년 이상 재촌하면서 자경하던 농지」를 인용해 놓았는데 인자는 구간 배열뿐이고 input.urbanIncorporationDate가 전달되지 않는다 — 호출부(:223) 스코프에 그 값이 있고 15줄 뒤 :238 checkIncorporationGrace가 이미 쓴다.

**실패 시나리오**

도시지역 농지·2014-01-01 취득→2024-01-01 양도·재촌 전 기간·편입일 2021-06-01(유예 창 안)·자경 2021-12-31~2024-01-01(731일)뿐. 편입일 소급 1년(2020-06-01~2021-06-01)에 자경이 없어 ⑤1호에 해당하지 않고 ⑤2호도 아니므로 비사업용이어야 하는데 엔진은 {isNonBusinessLand:false, "도시지역 內 농지 + 편입유예 내"}를 낸다. 양도 10억·취득 3억 기준 126,810,000 → 96,260,000(30,550,000 과소).

**검증자 재현 실측**

【판정 — 재현됨】
A(주장 케이스: 도시지역 commercial·취득 2014-01-01·양도 2024-01-01·재촌 전기간(강남 11680)·편입 2021-06-01·자경 2021-12-31~2024-01-01 731일):
  isNonBusinessLand = false
  steps = ["land_category:PASS","unconditional_exemption:NOT_APPLICABLE","usage_residence_self_farming:PASS(1호: 직전5년 비사업 1095일 가 충족 / 직전3년 비사업 364일 나 미충족 / 전체 비사업 2920일 다 충족 → 사업용)","region_urban_grace:PASS(편입일 2021-06-01부터 3년 유예 적용)"]
  ※ region_grace_requirement 스텝 부재 = 1년 요건이 무조건 통과됨
B(대조군: 2020-06-01~2021-06-01 자경 추가) → isNonBusinessLand = false (A와 동일)
D(현실형: 2010~2020 자경 10년 → 휴경 → 편입 2022-01-01 → 양도 2024-01-01)
  → isNonBusinessLand = false, judgmentReason = "도시지역 內 농지 + 편입유예 내",
    surcharge = {additionalRate: 0, nonBusinessAreaRatio: 0, longTermDeductionExcluded: false}

【세액 — 주장값 미재현】
주장: 126,810,000 → 96,260,000 (차이 30,550,000)
실측(makeMockRates + baseTransferInput, propertyType=land, 양도 10억 / 취득 3억 / 2014-01-01→2024-01-01, isOneHousehold=false):
  엔진 판정대로(현행, 사업용) calculatedTax = 204,090,000
  isNonBusinessLand 강제 true      calculatedTax = 261,240,000
  차이 = 57,150,000  (taxBase 571,500,000 × 10%p)
  taxBase = 571,500,000 / 양도차익 700,000,000 / LTHD 126,000,000
주장값 126,810,000·96,260,000은 과세표준 305,500,000(40% 구간·누진공제 25,940,000)에서만 산출되는 값으로, 주장된 입력(양도 10억·취득 3억)에서는 나오지 않는다.

【참고 — 취득시기에 따라 세액 영향이 0이 되는 구간이 있다】
같은 시나리오를 취득일 2010-01-01로 바꾸면 isNonBusinessLand 강제 true여도 세액이 180,570,000로 동일(차이 0). 2009-03-16~2012-12-31 취득분 중과 배제 구간으로 보인다 ⇒ 세액 영향은 취득시기 의존이며 「항상 30,550,000 과소」 같은 단일 수치 주장은 성립하지 않는다.

**⚠️ 정정된 주장** (원 보고가 과장·부정확했던 부분)

`lib/tax-engine/non-business-land/farmland.ts:81` `hasAtLeastOneYearSelfFarming(combined)`가 소득세법 시행령 §168조의8⑤1호의 기산점(「도시지역에 편입된 날부터 **소급하여** 1년 이상 재촌하면서 자경」)을 구현하지 않고, 보유기간 어디든 연속 365일 이상의 재촌∩자경 구간이 있으면 true를 반환한다. 호출부 farmland.ts:223 스코프에 `input.urbanIncorporationDate`가 있고 farmland.ts:**240**(주장 :238 — 2줄 오차)의 `checkIncorporationGrace`가 이미 그 값을 쓴다.

결과적으로 「편입일 소급 1년에는 자경이 없었으나 과거에 1년 이상 자경했던」 도시지역 농지가 §168의8⑤1호를 충족한 것으로 처리되어 편입유예(⑥ 3년) 경로로 사업용 판정된다. 실측 확인: 엔진이 `isNonBusinessLand=false` + `region_urban_grace:PASS`("도시지역 內 농지 + 편입유예 내")를 내고, 소급 1년 구간의 자경 유무를 바꿔도 판정이 변하지 않는다(대조군 동일).

단, **원 finding의 세액 수치(126,810,000 → 96,260,000, 30,550,000 과소)는 주장된 입력에서 재현되지 않는다.** 동일 입력의 실측은 261,240,000(비사업용) vs 204,090,000(사업용), 차이 57,150,000(과세표준 571,500,000 × 10%p)이다. 또 취득일이 2009-03-16~2012-12-31 구간이면 중과 자체가 배제되어 세액 영향이 0이 되므로, 영향액은 취득시기·금액에 따라 0~수천만원으로 가변이다.

도달 경로는 UI로 열려 있다(NblSectionContainer.tsx:210 도시편입일 · FarmlandDetailSection.tsx:40 자경기간 · ResidenceHistorySection · nblZoneType). validate(`transfer-tax-validate-nbl.ts`)·Zod 어디에도 차단이 없다. 심각도는 high가 아니라 **medium** — 결함·법령 위배·과소과세 방향은 실재하지만, 발현에는 (도시지역 주·상·공 농지) × (편입 후 3년 내 양도) × (§168의6 기간기준 통과) × (편입일 직전 1년에만 자경 공백) 4중 조합과 NBL 정밀판정 상세 입력이 모두 필요하고, 세액 영향 규모 주장이 과장됐다.

**제안 수정**

hasAtLeastOneYearSelfFarming(combined, urbanIncorporationDate)로 기산점을 받아 [편입일−365d, 편입일) 구간이 combined에 연속 포함되는지만 본다. 편입일이 없으면 ⑤1호 미충족으로 처리(자동 통과 fallback 금지) — 실질 영향은 checkIncorporationGrace가 이미 끊으므로 없다.

**수정 위험**

【회귀 위험: 낮음 — 현행 동작을 고정하는 테스트 없음】
`hasAtLeastOneYearSelfFarming`은 module-private(export 없음)이고 호출부는 farmland.ts:223 **1곳뿐**(전 저장소 grep 확인). pasture.ts:214·forest.ts:215는 `checkIncorporationGrace`만 공유하고 1년 요건 헬퍼는 쓰지 않으므로 타 지목·타 세목 영향 없음.

편입유예 경로에 도달하는 기존 테스트 6건을 전수 추적한 결과, 제안 수정([편입일−365d, 편입일] 구간이 재촌∩자경에 연속 포함되는지) 적용 시 **결과가 바뀌는 것은 없다**:
- `__tests__/tax-engine/non-business-land/farmland.test.ts:118`(편입 2022-06-01, 자경 2015-01-02~2024-01-01) → 창 ⊂ 자경 → PASS 유지
- 동 :131(편입 2017-01-01) → 요건 통과 후 grace 초과 FAIL → `reason` "편입유예 외" 단언 유지
- 동 :144(6개월) → 현행도 수정 후도 요건 FAIL → "편입유예 요건" 단언 유지
- `qa-land-type-flow.test.ts:82`(QA-012, 편입 2018-01-01·자경 2010~2018) → 창 ⊂ 자경 → PASS 유지
- 동 :148(QA-013b, 편입 2023-01-01·자경 2022-01-02~2023-01-01) → 창 시작 2022-01-01 < 2022-01-02 → FAIL 유지(`region_grace_requirement` 단언 그대로)
- `engine.test.ts:60`(편입 2015-01-01·자경 2010~2024) → 요건 통과 후 grace 초과 → `judgmentReason` "편입유예" 단언 유지
E2E에는 `nblUrbanIncorporationDate`/도시편입일 관련 spec이 **0건**(e2e/ grep) — E2E 회귀 없음.

【수정 시 주의할 점 3가지】
1. **편입일 미제공 시 reason 문자열이 바뀐다.** 제안대로 「편입일 없으면 ⑤1호 미충족」으로 처리하면 도시지역 농지 + 편입일 공란 케이스의 실패 사유가 "도시지역 內 농지 + 편입유예 외"에서 "…편입유예 요건(1년 재촌자경) 미충족"으로 이동한다. isNonBusinessLand는 양쪽 다 true라 세액 무영향이고 현행 단언과도 충돌하지 않지만(해당 테스트는 모두 편입일을 준다), `reason` 문자열 매칭이 있는 결과뷰/신고서 표시 경로를 함께 확인할 것.
2. **편입일 < 취득일(취득 전 이미 편입)** 케이스를 명시적으로 결정해야 한다. 소유 개시 전 구간은 재촌∩자경일 수 없어 자동으로 ⑤1호 미충족이 되는데, 이것이 의도인지(법문상 그렇게 읽힌다) 주석으로 못박지 않으면 다음 수정자가 "버그"로 오인해 되돌릴 수 있다. 저장소 정책상 자동 통과 fallback은 금지이므로 미충족 처리가 정답 방향.
3. **`mode === "deemed"` 우회는 건드리지 말 것.** 이는 ⑤**2호**(제3항 각 호)에 대응하는 별개 경로다. 다만 `checkFarmlandDeeming`의 주말·체험영농은 §168의8③ 각 호에 없어 ⑤2호 대응 여부가 별도 쟁점이며 — **이 finding의 범위 밖**이므로 같은 PR에서 함께 손대지 말 것(Surgical Changes).

【테스트 요구】수정 시 anchor 필수: 「편입일 소급 1년에 자경 공백 + 과거 1년 이상 자경」 케이스가 `region_grace_requirement:FAIL` + `isNonBusinessLand:true`가 되는 회귀 테스트 1건, 그리고 대조군(소급 1년 구간에 자경 존재 → PASS) 1건. 대조군 없이 넣으면 「무조건 FAIL」로 과도 차단해도 안 잡힌다.

---

#### F31 · 단건 신고서 양식 표의 「가산세액」이 신고불성실·납부지연 가산세를 통째로 누락해 총결정세액이 어긋난다

| | |
|---|---|
| 위치 | `components/calc/results/transfer/FilingFormTableHelpers.ts:722` |
| 판정 | **PARTIALLY_CONFIRMED** |
| 심각도 | ~~high~~ → **medium** |
| 도달성 | reachable-via-ui |
| 탐지 축 | report |
| 조치 | 배치 11 |

**결함**

단건 신고서 표가 `setNum("penaltyTax","total", result.penaltyTax)`(:722)·`totalDeterminedTax = determinedTax + penaltyTax`(:723)로 §114조의2 가산세만 싣고, 엔진이 별도 필드로 내리는 result.penaltyDetail.totalPenalty(finalize.ts:419·477)를 어느 행에도 반영하지 않는다. 같은 결과 화면의 상세명세서(DetailedStatementHelpers.ts:728-761)와 다건·일괄 신고서 표(FilingFormTableAggregateHelpers.ts:226·238)는 두 가산세를 합산한다 — 동일한 32행 서식이 두 값을 동시에 보여준다.

**실패 시나리오**

토지 1건(10억/4억·2010-01-01→2026-06-01)+무신고+납부지연(미납 1억·기한 2026-08-31·납부 2026-12-31): 엔진 determinedTax 141,060,000·penaltyDetail.totalPenalty 12,684,000·totalTax 167,850,000. 신고서 표는 「가산세액 0·총결정세액 141,060,000」, 상세명세서는 「12,684,000·153,744,000」 — 사용자가 서식 값으로 신고하면 12,684,000 과소신고가 된다(엔진 세액 자체는 정확).

**검증자 재현 실측**

probe(토지 10억/4억, 2010-01-01→2026-06-01, 무신고, 미납 1억·기한 2026-08-31·납부 2026-12-31, makeMockRates):
- 1-pass determinedTax = 141,060,000 (finding과 일치)
- penaltyTax(§114의2) = 0
- penaltyDetail.filingPenalty = 28,212,000 (= 141,060,000 × 20%), delayedPaymentPenalty = 2,684,000, totalPenalty = **30,896,000** (finding 주장 12,684,000 ≠ 재현값)
- localIncomeTax = 14,106,000, totalTax = 186,062,000 (finding 주장 167,850,000 ≠ 재현값)
- buildRows(single) → 결정세액 141,060,000 / **가산세액 0** / **총결정세액 141,060,000** / 지방소득세 산출세액 14,106,000
- buildStatementItems → penaltyTax **30,896,000** ("신고불성실·납부지연 가산세 30,896,000 (국세기본법 §47·§48)") / totalDeterminedTax **171,956,000**
⇒ 같은 화면 두 서식이 가산세액 0 vs 30,896,000, 총결정세액 141,060,000 vs 171,956,000으로 갈린다. 갭 = 30,896,000 (finding이 적은 12,684,000보다 큼).

**⚠️ 정정된 주장** (원 보고가 과장·부정확했던 부분)

결함 실재. 단건(비-집계) 신고서 양식 표가 `FilingFormTableHelpers.ts:722-723`에서 §114조의2 가산세(`result.penaltyTax`)만 싣고 `result.penaltyDetail.totalPenalty`(신고불성실 §47의2·§47의3 + 납부지연 §47의4)를 「가산세액」·「총결정세액」 어느 행에도 반영하지 않는다. 32행 rowOrder에 「가산세액」 행은 하나뿐이므로 다른 행이 이를 대신하지도 않는다. 같은 화면의 상세명세서(`DetailedStatementHelpers.ts:729·757`)·다건 신고서 표(`FilingFormTableAggregateHelpers.ts:226·238·327`)·상단 총납부세액 카드(`TransferTaxResultView.tsx:319`)는 모두 두 가산세를 합산하므로 단건 표만 outlier다. 「신고서 양식」은 `form-table` 단독 print leaf라 이 표만 인쇄하면 가산세가 통째로 빠진 서식이 나온다.
단, finding의 수치는 틀렸다: 제시된 시나리오(무신고·미납 1억)의 실제 값은 penaltyDetail.totalPenalty = 30,896,000(신고불성실 28,212,000 + 납부지연 2,684,000), 상세명세서 총결정세액 171,956,000, 엔진 totalTax 186,062,000이다(finding의 12,684,000·153,744,000·167,850,000은 무신고 20% base 141,060,000과 모순 — 과소신고 10% 등 다른 입력에서 나온 값으로 보인다). 갭은 finding이 적은 것보다 크다.
심각도는 high가 아니라 medium: 엔진 세액(totalTax·지방소득세)은 정확하고 화면 상단 요약과 상세명세서가 올바른 값을 이미 보여준다 — 잘못된 계산이 아니라 인쇄 대상 서식의 표시 누락이다.
수정은 제안대로 `const totalPenalty = result.penaltyTax + (result.penaltyDetail?.totalPenalty ?? 0)`를 :722·:723에 쓰되, :726 지방소득세 base는 엔진(`transfer-tax-finalize.ts:410`)·집계(`transfer-tax-aggregate.ts:399`)와 동일하게 §114의2분만 유지해야 한다.

**제안 수정**

`totalPenalty = result.penaltyTax + (result.penaltyDetail?.totalPenalty ?? 0)`로 상세명세서와 단일 소스를 쓰게 한다(총결정세액 행도 동일). 지방소득세 base(:726)는 엔진과 같이 §114조의2분만 유지 — 아래 「지방소득세 산출세액 base」 항목과 함께 정합시킬 것.

**수정 위험**

낮음. (a) buildRows는 mode==="aggregate"일 때 :396에서 buildAggregateRows로 조기 위임하므로 :722 수정은 단건·분할(fourpart/split-2col/redev-*) 모드에만 영향한다. (b) FilingFormTable/buildRows를 쓰는 vitest 15파일·e2e 4스펙 어디에도 `penaltyDetail`을 설정한 픽스처가 없고(grep 히트 0) 전부 `penaltyTax: 0`이라 제안 수정은 그 경로에서 no-op — 현행 동작을 고정하는 테스트가 없으므로 「의도된 설계」의 증거도 없다. (c) 주의점 둘: ①`:726 localCalc`는 절대 함께 바꾸지 말 것 — 엔진 `transfer-tax-finalize.ts:410`과 집계 `transfer-tax-aggregate.ts:399-400`(주석: 신고불성실·납부지연은 지방소득세 base 제외)이 §114의2분만 base로 쓰므로 함께 바꾸면 「지방세 산출세액 ≠ 지방세 결정세액(result.localIncomeTax)」 새 불일치가 생긴다. ②`__tests__/components/gb-filing-form-tax-rows-total-only.anchor.test.ts:82`가 「가산세액」 행의 파트 열이 null임을 고정하는데, 이는 aggregate 경로(buildAggregateRows)라 :722 수정과 무관하다. 동일 파일을 import하는 타 세목 경로는 없다(주식은 별도 `StockFilingFormTableHelpers.ts`).

---

#### F32 · 조특법 §77의2·§77의3 감면 detail이 단건 결과에 실리지 않아 상세 카드·신고서 19번 칸이 사라지거나 틀린 값이 된다

| | |
|---|---|
| 위치 | `lib/tax-engine/transfer-tax.ts:638` |
| 판정 | **CONFIRMED** |
| 심각도 | **medium** |
| 도달성 | reachable-via-ui |
| 탐지 축 | core |
| 조치 | 배치 3 |

**결함**

finalizeTransferTax는 gbDesignatedLandDetail·replacementLandDetail을 FinalizeResult 필수 필드로 돌려주는데(finalize.ts:130-131·258-259·468-469) 오케스트레이터의 구조분해(:620-648)와 return 객체(:649-728)가 그 두 키만 빠뜨렸다. 바로 옆 publicExpropriationDetail(:638·:704)은 정상 배선. TransferTaxResult 타입이 optional이라 TS가 못 잡는다. 그 결과 ReductionDetailCards·다건 breakdown(aggregate-pickers.ts:90-91)·별지84호 부표2 19번 칸(FilingFormTableHelpers.ts:702)·상세명세서가 전부 undefined를 받는다.

**실패 시나리오**

토지 10억(2010-01-01→2024-06-01, 취득 3억)+대토보상 5억: reductionAmount 35,112,167로 감면은 적용되고 reductionType도 표시되지만 replacementLandDetail=undefined라 상세 카드가 렌더되지 않는다. 나아가 신고서 19번 세액감면대상금액이 reductionEligibleIncome fallback(reduction-eligible-income.ts:23-24) 때문에 252,000,000이어야 할 값이 100,800,000(감면율 곱값)으로 표시된다 — FilingFormTableHelpers.ts:694 주석이 스스로 부적합하다고 밝힌 바로 그 오류.

**검증자 재현 실측**

§77의2 시나리오(토지 10억 · 2010-01-01 취득 3억 → 2024-06-01 양도 · 현금보상 5억 + 대토보상 5억 · 고시일 2023-06-01, mock 세율):
- transferGain 700,000,000 / LTHD 196,000,000 / 양도소득금액 504,000,000 / basicDeduction 2,500,000 / taxBase 501,500,000 / calculatedTax 174,690,000
- reductionAmount **35,112,167** (원 주장과 원 단위 일치) · reductionTypeApplied "replacement_land_comp" · reducibleIncome 100,800,000
- r.replacementLandDetail === undefined, Object.hasOwnProperty(r,"replacementLandDetail") === **false** (같은 객체에서 "publicExpropriationDetail"은 true)
- calculateReplacementLandReduction 직접 재호출: replacementRatio 0.5 · **eligibleTransferIncome 252,000,000** · reducibleIncome 100,800,000 · rawReductionAmount 35,112,167
- reductionEligibleIncome(..., undefined) = **100,800,000** vs 배선 시 **252,000,000** → 별지84호 부표2 ⑲ 오값 확인(원 주장과 일치)

§77의3 시나리오(같은 토지 · in_zone · 지정일 2015-01-01 · 매수청구일 2024-01-01 · 거주요건 충족):
- reductionAmount **69,876,000** (원 리뷰어 보고값 67,624,000은 파라미터 미기재로 미재현) · reductionTypeApplied "gb_designated_land"
- r.gbDesignatedLandDetail === undefined, hasOwnProperty === **false**

Route 경유(POST /api/calc/transfer, preloadTaxRates·rate-limit mock): 두 케이스 모두 **status 200**, 감면 정상 적용, 상세만 부재 → 도달 가능 확정.

**제안 수정**

transfer-tax.ts의 구조분해와 return에 두 키를 추가한다(FinalizeResult가 이미 필수로 선언하므로 값 소스 변경 불요). 이 한 줄로 단건 카드·다건 breakdown·신고서 19번이 동시에 복구된다.

**수정 위험**

낮음. (1) 식별자 충돌 없음 — 두 이름은 transfer-tax.ts에 전혀 없어 구조분해 추가 시 shadowing이 발생하지 않는다. (2) 현행(undefined) 동작을 고정하는 테스트 없음 — 두 키를 언급하는 유일한 테스트 __tests__/components/calc/reduction-eligible-income.test.ts:38-42는 순수 함수에 인자를 직접 넘기므로(`..., undefined`) 배선 여부와 무관하게 계속 green이다. reductionTargetIncome을 단언하는 테스트는 __tests__/components/calc/detailed-statement-993-income-deduction.anchor.test.ts 1건뿐인데 §99의3(income_deduction) 경로라 §77의2와 무관. E2E e2e/transfer-expropriation-77-2025.spec.ts는 입력 카드만 본다. (3) 회귀 가드 __tests__/api/transfer.route.bundled-swallows-special.test.ts:290-316은 TransferReductionDetailSource(25종) ↔ pickReductionDetails 소스 동기화만 비교하므로 영향 없음. (4) 의도된 표시 변화 2건이 따라온다 — §77의2의 별지84호 부표2 ⑲가 100,800,000 → 252,000,000으로, 상세명세서·다건 신고서(DetailedStatementHelpers.ts:574·582, FilingFormTableAggregateHelpers.ts:201·293)도 동시에 채워진다. 이는 FilingFormTableHelpers.ts:694 주석이 명시한 목표값이므로 회귀가 아니라 복구다. 세액(reductionAmount·determinedTax·totalTax)은 불변. (5) 타 세목 무영향 — 두 키는 transfer 전용이고 grep 상 상속·증여·취득·재산·종부세 경로에 등장하지 않는다.

---

#### F33 · 양도차손 조기반환 경로가 신고불성실·납부지연 가산세를 통째로 건너뛴다

| | |
|---|---|
| 위치 | `lib/tax-engine/transfer-tax.ts:335` |
| 판정 | **CONFIRMED** · 법령 CONFIRMED |
| 심각도 | **medium** |
| 도달성 | reachable-via-ui |
| 탐지 축 | core |
| 조치 | 배치 3 |

**결함**

transferGain<=0 조기반환 블록(:335-411)은 §114조의2 건물 가산세만 계산하고 emitPenaltySteps를 호출하지 않아 penaltyDetail이 undefined이고 totalTax에도 반영되지 않는다. 신고불성실 기준금액(transfer-tax-penalty.ts:244-251)은 결정세액에서 기납부·당초신고를 뺀 뒤 초과환급세액을 더하므로 결정세액이 0이어도 양수가 될 수 있고, 납부지연의 unpaidTax는 Step6.tsx:160에서 사용자가 직접 입력한다. 블록 주석(:333-334)은 「가산세는 §114의2②에 따라 산출세액 없어도 부과」라며 건물 가산세만 챙겼다.

**실패 시나리오**

토지 양도 2억·취득 3억(차손), filingType=under, excessRefundAmount 50,000,000, unpaidTax 30,000,000(기한 2024-08-31·납부 2025-08-31): 현행 penaltyDetail undefined·totalTax 0. 같은 가산세 입력으로 이익 케이스(6억/3억)를 돌리면 신고불성실 5,000,000+납부지연 2,409,000=7,409,000이 계산된다 — 차손이라는 이유만으로 7,409,000이 사라진다.

**검증자 재현 실측**

probe(`makeMockRates` + `baseTransferInput`, propertyType=land, 취득 2019-06-01 / 양도 2024-06-01, filingPenaltyDetails{excessRefundAmount:50,000,000, determinedTax:0, filingType:"under", penaltyReason:"normal"}, delayedPaymentDetails{unpaidTax:30,000,000, paymentDeadline:2024-08-31, actualPaymentDate:2025-08-31}):
· 차손(양도 2억/취득 3억): transferGain=0, determinedTax=0, **penaltyDetail=undefined**, penaltyTax=0, localIncomeTax=0, **totalTax=0**
· 이익(양도 6억/취득 3억, 가산세 입력 동일): determinedTax=83,990,000, filingPenalty=**5,000,000**, delayedPayment=**2,409,000**(365일 × 0.022%), totalPenalty=**7,409,000**, totalTax=99,798,000
· route 2-pass 의미론 재현(이익 + filingPenaltyDetails.determinedTax=0): penaltyBase=50,000,000 → filingPenalty=5,000,000, delayed=2,409,000, totalPenalty=7,409,000 — 즉 determinedTax=0이어도 엔진 정상 경로는 7,409,000을 계산한다. 차손 경로만 이를 버린다.
· UI 도달형 변형(filingType="excess_refund", 동일 금액): 차손 penaltyDetail=undefined/totalTax=0, 이익 filing=5,000,000·delayed=2,409,000·total=7,409,000 — 세율이 동일(UNDER_FILING_RATE 10%, `transfer-tax-penalty.ts:203-211`)이라 수치가 일치.
· 지연납부만 입력(filingPenaltyDetails 없음) 차손: penaltyDetail=undefined, totalTax=0.
· 비과세 조기반환(1세대1주택 8억, 동일 가산세 입력): isExempt=true, penaltyDetail=undefined, totalTax=0.
원 finding이 제시한 5,000,000 / 2,409,000 / 7,409,000 및 「현행 penaltyDetail undefined·totalTax 0」이 **전부 그대로 재현**됐다.

**법령 독립확인**

법령 쪽만 독립 확인했다(코드 재현은 하지 않음). 결론: **조문이 finding의 법적 주장을 뒷받침한다.** 다만 근거 구조는 finding의 서술과 한 곳에서 다르므로 그 부분을 correctedClaim에 정정했다.

■ 위임·인용 체인 (전부 KoreanLaw MCP 본문 조회, 현행 소득세법 MST 280405 / 국세기본법 MST 288571)

1) **신고의무는 양도차손에도 존속한다** — 소득세법 §105③ verbatim: "제1항은 양도차익이 없거나 양도차손이 발생한 경우에도 적용한다." 같은 법 §110② verbatim: "제1항은 해당 과세기간의 과세표준이 없거나 결손금액이 있는 경우에도 적용한다." ⇒ 손실이라고 신고의무가 소멸하지 않으므로 신고불성실 가산세의 성립 요건 자체는 살아 있다.

2) **총결정세액 정의가 §47의2~§47의4를 명시적으로 포함한다** — 소득세법 §92③3호 verbatim: "양도소득 총결정세액: 제2호의 양도소득 결정세액에 **제114조의2, 제115조 및 「국세기본법」 제47조의2부터 제47조의4까지에 따른 가산세를 더하여** 계산". 조기반환 블록은 이 합계 중 §114의2만 싣고 §47의2~§47의4를 뺀다.

3) **본세가 0이어도 가산세는 부과된다** — 국세기본법 §47③ verbatim: "가산세는 납부할 세액에 가산하거나 **환급받을 세액에서 공제**한다."

4) **§47의3의 base는 결정세액과 독립한 축을 갖는다** — 국기법 §47의3① verbatim: "과소신고한 납부세액과 **초과신고한 환급세액**을 합한 금액(…가산세와 …이자 상당 가산액이 있는 경우 그 금액은 제외하며, 이하 "과소신고납부세액등"이라 한다)". 코드의 `excessRefundAmount`가 정확히 이 축이므로 결정세액 0에서도 base가 양수가 될 수 있다는 finding의 지적은 조문상 성립한다.

5) **§47의4의 base도 독립축이다** — 국기법 §47의4①1호 "납부하지 아니한 세액 또는 과소납부분 세액", 2호 "초과환급받은 세액". 결정세액을 참조하지 않는다. 그리고 코드의 `unpaidTax`는 app/calc/transfer-tax/steps/Step6.tsx:158-161 `CurrencyInput`으로 **사용자가 직접 입력**하는 값이라 결정세액 0과 무관하게 양수일 수 있다(finding 서술과 일치).

6) **선례가 직접 확인한다** — 조심 2012서2857(2013.2.12., 기각) 이유 3.나.(3) verbatim: "쟁점토지에 대한 과세표준 및 세액은 산158-1 토지와 통산함으로써 없어졌을 뿐, **그 이전까지 과소신고 및 납부하지 아니한 세액이 존재하고 있었던 점** … 양도소득세의 예정신고 및 납부의무는 확정신고 및 납부의무와 **별개의 독립적인 의무**(대법원 2011.9.29. 선고 2009두22850 판결 참조)". ⇒ 최종 세액이 0이 되어도 과소신고·납부불성실가산세는 유지된다.

■ finding 서술 중 정정이 필요한 지점 (전체 판정을 뒤집지는 않음)

blocks 주석이 인용한 소득세법 §114의2② verbatim은 "제1항은 제92조제3항제1호에 따른 양도소득 산출세액이 없는 경우에도 적용한다."로 **§114의2 전용 명문**이다. 국기법 §47의2~§47의4에는 이런 명문이 없는데, 이유는 그 base가 세액 그 자체이기 때문이다(§114의2는 base가 환산취득가액×5%라 별도 명문이 필요했다). 따라서 "§114의2에만 명문이 있으니 §47의2~4도 당연히 손실 시 항상 부과된다"로 읽으면 안 된다.

실제로 **순수 양도차손 + 초과환급·미납 없음**이면 §47의2①의 base("그 신고로 납부하여야 할 세액", = 무신고납부세액)가 0이라 **무신고가산세는 법상 0**이다. 조심 2019서3374(2020.1.16., 인용)이 인용한 기획재정부 조세정책과-1171(2010.12.20.) "추가로 납부할 세액이 없는 경우에는 무신고가산세를 적용하지 않는 것임", 서면법규과-551(2013.5.14.)도 같은 취지다. (⚠️ 이 두 예규는 nts·interpretation 도메인 **직접 조회가 실패**했다 — 조심 2019서3374 본문 내 인용으로만 확인했다. 원문 대조는 확인 필요.) 조심 2019서3374 재결요지 verbatim: "예정신고기간이 겹치는 쟁점주택과 쟁점부동산의 양도소득금액을 **통산하여 계산한 산출세액을 기준으로** 두 가산세를 적용하는 것이 타당".

⇒ 조문상 **세액 차이가 실제로 발생하는 축은 두 개로 좁혀진다**: (a) §47의3① "초과신고한 환급세액"(`excessRefundAmount`), (b) §47의4①1호·2호(`unpaidTax`). 나머지 무신고·과소신고분은 emitPenaltySteps를 호출해도 `calculateFilingPenalty`가 penaltyBase≤0에서 0을 반환하므로 값이 같다. 이 때문에 severity를 high가 아니라 medium으로 조정한다. 다만 `penaltyDetail`이 undefined가 되어 **산출근거 표시가 통째로 소실**되는 것은 두 입력 유무와 무관하게 항상 발생한다.

■ 코드 상수 정합성 (부수 확인, 전부 일치)
lib/tax-engine/legal-codes/common.ts:14·16·22 = "국세기본법 §47의2/§47의3/§47의4", transfer.ts:148 = "소득세법 §114조의2" — 인용 드리프트 없음. 세율 상수도 §47의2①2호 100분의 20(NON_FILING_RATE 0.20), §47의3①2호 100분의 10(UNDER_FILING_RATE 0.10), §47의2①1호 100분의 40·역외 100분의 60(FRAUDULENT/OFFSHORE_FRAUD)와 일치.

■ 제안된 수정의 법령 적합성
"emitPenaltySteps를 determinedTax=0으로 호출"은 조문과 충돌하지 않는다 — §47의2①·§47의3①의 괄호가 "이 법 및 세법에 따른 가산세…는 제외"라고 명시하므로 §114의2 가산세(penaltyTax)를 §47의2~4의 base에 넣지 않아야 하는데, 현행 emitPenaltySteps는 determinedTax를 표시용으로만 쓰고 base는 filingPenaltyDetails가 별도로 들고 있으므로 이 배제 요건을 자동으로 만족한다.

buildExemptEarlyResult(비과세 조기반환)도 같은 갭 구조를 갖는다: §89 비과세는 납부할 세액이 0이라 §47의2①·§47의3①의 base가 0이므로 신고불성실가산세는 법상 0이지만, §47의4①의 "납부하지 아니한 세액"은 여전히 결정세액과 독립한 사용자 입력축이다. 다만 비과세는 "본래 낼 세금이 없다"는 판정이라 미납세액이 존재할 여지가 손실 경로보다 좁다 — 별도 판단이 필요하다(법령만으로는 갈리지 않음).

**제안 수정**

조기반환 블록에서도 emitPenaltySteps(finalize.ts:419-430과 같은 헬퍼)를 determinedTax=0으로 호출해 penaltyDetail을 싣고 totalTax를 합산한다. buildExemptEarlyResult(비과세 조기반환)에도 같은 누락이 있는지 함께 판단. 착수 전 §47의2·§47의3·§47의4 본문으로 차손 시 부과 여부를 확정할 것.

**수정 위험**

기존 테스트가 현행 동작을 고정하지 않는다 — `penaltyDetail`을 `toBeUndefined`로 단언하는 곳은 `__tests__/tax-engine/rental-housing-exception/rh-penalty-integration.test.ts:81` 하나뿐이고 그건 **가산세 입력이 없을 때**의 케이스라 `emitPenaltySteps`가 그대로 undefined를 반환해 안전하다. 차손+가산세 조합을 단언하는 테스트·E2E는 grep 결과 0건. 따라서 red는 예상되지 않는다(= 「의도된 동작」의 증거도 없다).

수정 시 실제 위험 3가지:
1) **지방소득세 base 오염** — 차손 블록의 `lit0 = applyRate(pt0, 0.1)`은 §114조의2 가산세만 base로 삼는다. `finalize.ts:410-415`도 `determinedTax + penaltyTax`만 base로 쓰고 신고불성실·납부지연은 제외한다. 수정 시 `filingDelayedPenalty`를 지방소득세 base에 넣으면 정상 경로와 어긋난다. `totalTax = pt0 + lit0 + filingDelayedPenalty` 형태여야 한다.
2) **다건(aggregate) 총액 변동** — `lib/tax-engine/transfer-tax-aggregate.ts:391-395`가 자산별 `result.penaltyDetail?.totalPenalty`를 합산하고, aggregate는 `skipLossFloor=true`로 호출해 음수 차익 자산이 바로 이 조기반환을 탄다(`transfer-tax.ts:305-306`). 다건 route는 자산별 `filingPenaltyDetails`를 주입한다(`app/api/calc/transfer/multi/route.ts:320-334`). 즉 단건만 고친 것으로 끝나지 않고 **다건 합계세액이 함께 변한다** — 의도한 방향이더라도 `__tests__/tax-engine/transfer-tax-aggregate.test.ts` 회귀를 반드시 함께 돌려야 한다.
3) **비과세 경로를 같이 고치면 신규 불일치** — `buildExemptEarlyResult`에 `penaltyDetail`을 실으면 단건은 반영되는데 aggregate는 `isExempt ? 0`(:388·:392)으로 버려 **단건↔다건 세액이 갈린다**. 비과세 쪽은 별건으로 다루거나 aggregate의 `isExempt` 배제와 함께 판단해야 한다.

검증 명령: `npx vitest run __tests__/tax-engine/transfer-tax/ __tests__/tax-engine/transfer-tax-aggregate.test.ts __tests__/tax-engine/rental-housing-exception/`.

---

#### F34 · §155⑳ 특례 조기반환 경로가 수정신고(경정) 결과를 반환하지 않아 추가납부세액이 화면에서 사라진다

| | |
|---|---|
| 위치 | `lib/tax-engine/transfer-tax-rental-housing-step.ts:411` |
| 판정 | **CONFIRMED** |
| 심각도 | **medium** |
| 도달성 | reachable-via-ui |
| 탐지 축 | exemption |
| 조치 | 배치 4 |

**결함**

반환 객체(:411-447)에 amendmentDetail이 없다. 특례가 적용되면 finalizeTransferTax의 STEP 12.5를 거치지 않으므로 input.amendment가 있어도 computeAmendment가 호출되지 않는다. amendmentMode는 폼-전역이라 자산-수준 §155⑳ 토글과 독립적으로 켤 수 있고 Zod·validate에 상호배제가 없다. 같은 엔진의 양도차손 조기반환은 transfer-tax.ts:371에서 이 필드를 명시적으로 싣고 :393-399 주석이 「조기반환에만 빠져 결과 화면이 산출근거를 잃었다」는 같은 유형의 과거 결함을 기록한다.

**실패 시나리오**

수정신고(당초 결정세액 1천만)+§155⑳ 특례(거주주택 2016-01-01→2026-03-01·양도 20억·취득 5억·거주 60개월): 특례 OFF면 amendmentDetail{추가납부 60,310,000·지방분 6,031,000·steps 2건}이 실리는데 ON이면 undefined — 결과 화면에 추가납부세액 카드가 없어 사용자가 실제 납부액을 산출할 수 없다(두 경로의 determinedTax는 70,310,000으로 동일).

**검증자 재현 실측**

주장 시나리오 그대로 재현(전체 엔진 `calculateTransferTax` + makeMockRates). §155⑳ ON: determinedTax 70,310,000 / totalTax 77,341,000 / amendmentDetail = undefined. §155⑳ OFF(동일 input.amendment{originalDeterminedTax 10,000,000}): determinedTax 70,310,000 / totalTax 77,341,000 / amendmentDetail = {additionalTax 60,310,000, additionalLocalIncomeTax 6,031,000, amendedDeterminedTax 70,310,000, totalPayable 60,310,000, underReportingPenalty 0, latePaymentPenalty 0, steps 2건("추가 납부 본세" 60,310,000 · "수정신고 총 납부세액" 60,310,000)}. 제보 수치 전부 일치. 부수 실측(§114조의2): 신축·환산 조건에서 ON penaltyTax 0 / totalTax 136,840,880 vs OFF penaltyTax 30,000,000 / totalTax 169,840,880 (determinedTax 양쪽 124,400,800).

**제안 수정**

반환 객체에 `amendmentDetail: input.amendment ? computeAmendment(input.amendment, rheDeterminedTax) : undefined` 추가(특례 경로는 이미 같은 이유로 emitPenaltySteps를 직접 호출하고 있어 패턴이 일치한다). §114조의2 건물 가산세가 penaltyTax:0으로 고정(:441)된 것도 같은 계열인지 함께 확인.

**수정 위험**

낮음. finalize에서도 `amendmentDetail`은 totalTax에 반영되지 않는 echo 성격(`transfer-tax-finalize.ts:430` totalTax 산식에 amendment 항이 없음)이므로 세액 회귀 없음. 이 경로의 현행 동작(amendmentDetail undefined)을 고정하는 테스트는 없다 — `__tests__/tax-engine/rental-housing-exception/*`·`__tests__/tax-engine/transfer/audit-fix-rental-housing-step.test.ts`·`e2e/transfer-rental-155-20-active-ui.spec.ts` 어디에도 `amendment` 문자열이 없고, `amendmentDetail`을 undefined로 단언하는 기존 테스트는 다자산(`multi-amendment.test.ts:146`)·겸용(`mixed-use-amendment.test.ts:60,148`)의 **amendment 미전달** 케이스뿐이라 영향 없음. 사용자 가시 변화는 §155⑳+수정신고 조합에서 hero가 `AmendmentResultCard`로 바뀌는 것(의도된 결과). `computeAmendment` 인자는 finalize와 동일 축(감면 전 determinedTax)이어야 하며 이 경로는 감면이 없어 `rheDeterminedTax = calculatedTax`가 그 축과 일치한다. 다른 세목·다건(aggregate) 경로는 자체 부착 지점(`transfer-tax-aggregate.ts:382`)이 따로 있어 이중 계상 위험 없음. 단, steps push를 함께 넣으면 §155⑳ 결과의 계산내역 행 수가 늘어 스냅샷성 E2E가 있다면 확인 필요(현재 grep상 없음).

---

#### F35 · 배율초과 비사업용토지 파트가 겸용 신고서 어댑터에서 누락 — 양도차익이 「비과세 양도차익」으로 오분류

| | |
|---|---|
| 위치 | `components/calc/results/mixed-use/MixedUseResultCardAdapter.ts:40` |
| 판정 | **CONFIRMED** |
| 심각도 | **medium** |
| 도달성 | reachable-via-ui |
| 탐지 축 | mixed |
| 조치 | ⏸ **사용자 판단 대기** |

**결함**

mixedUseToFilingResult의 taxableGain(:40)은 housingPart.proratedTaxableGain+commercialPart.transferGain, longTermHoldingDeduction(:46)은 두 파트 합만 더해 nonBusinessLandPart가 빠졌다. 반면 taxBase(:56)·determinedTax(:62)는 엔진 total을 그대로 싣는데 그 값은 비사토 소득금액을 포함한다. 신고서 합계 열이 이 어댑터 값을 쓰므로(FilingFormTableHelpers.ts:637·639·688-691·718) 한 표 안에서 두 축이 어긋나고, :636 `exemptGain = max(0, transferGain − taxableGain)` 때문에 빠진 비사토 양도차익이 「비과세 양도차익」 칸으로 흘러든다.

**실패 시나리오**

겸용+토지 1,000㎡(정착 30㎡×3배=90㎡ 한도, 초과 510㎡)·양도 15억·다주택(비과세 미적용): 신고서 합계 열이 비과세 양도차익 144,075,000(비과세 요건 0인데)·양도소득금액 432,018,000·과세표준 533,252,000을 나란히 출력한다. 양도소득금액−기본공제=429,518,000인데 아랫줄 과세표준이 533,252,000으로 103,734,000(비사토 소득금액 전액)이 근거 없이 튄다. 배율초과 없는 대조군은 완전 정합.

**검증자 재현 실측**

픽스처: __tests__/tax-engine/_helpers/mixed-use-fixture.ts `mixedUseCase14()` 변형, 양도 2023-05-10 · 양도가 1,500,000,000 · makeMockRates().
[A] 토지 1,000㎡ + isOneHouseExempt=false(비과세 미적용) — 비사토 파트: 초과 151.23㎡ / 양도차익 149,724,558 / 장특 44,917,367 / 소득금액 104,807,191.
 신고서 「합계」 열 실측: 전체 양도차익 929,161,305 · **비과세 양도차익 149,724,558(비과세 요건 0인데 = 비사토 양도차익과 1원도 다르지 않음)** · 과세대상 양도차익 779,436,747 · 장기보유특별공제 233,831,023 · 양도소득금액 545,605,724 · 기본공제 2,500,000 · **과세표준 647,912,915**. 양도소득금액−기본공제 = 543,105,724 ⇒ **gap 104,807,191 = 비사토 소득금액 정확히 일치**. 결정세액 236,183,424(세액 자체는 정상).
[B] 대조군(배율초과 없음, 나머지 동일): 비과세 양도차익 0 · 양도소득금액 831,778,990 − 기본공제 2,500,000 = 과세표준 829,278,990 ⇒ **gap 0**(완전 정합).
[C] 배율초과 + 1세대1주택(주택분 12억 이하 전액 비과세): 비과세 양도차익 213,879,497로 표시되나 그 안에 비사토 149,724,558이 섞여 있다(적정값은 64,154,939) · gap 104,807,191 동일.
[D] 리뷰어 시나리오 재현(주택연면적 600/상가 400 → 주택 정착 30㎡, 전체 토지 1,000㎡): **초과면적 510㎡ — 리뷰어 주장과 정확히 일치**. 비과세 양도차익 294,282,013(=비사토 양도차익) · 양도소득금액 486,700,147 − 2,500,000 = 484,200,147 vs 과세표준 690,197,557 ⇒ gap 205,997,410 = 비사토 소득금액. 리뷰어의 절대 금액(144,075,000 / 432,018,000 / 533,252,000 / 103,734,000)은 기준시가 픽스처가 달라 그대로 재현되지 않았으나 구조·항등식은 전건 일치.
[참고] 4열 합 vs 합계 실측 diff: 전체 양도차익 0 · 비과세 0 · 과세대상 0 · 장특 −1 · 양도소득금액 −1(기존 floor 오차 범위) ⇒ 4열도 비사토를 「비과세」로 함께 오분류하고 있어 현재는 열 합이 합계와 맞는다.

**제안 수정**

taxableGain에 nonBusinessLandPart.transferGain, longTermHoldingDeduction에 nonBusinessLandPart.longTermDeductionAmount를 더해 「taxableGain − lthd === basicDeduction + taxBase」 불변식을 세운다(그러면 exemptGain도 12억 안분분만 남는다). 4열 표에 비사토 전용 열을 신설할지는 별건. 회귀 방어 anchor 추가.

**수정 위험**

① 어댑터만 고치면(taxableGain += nb.transferGain, lthd += nb.longTermDeductionAmount) 배율초과 케이스에서 **4열 합 ≠ 합계**가 되어 새 불일치가 생긴다 — 현재 4열은 비사토를 주택분 토지의 「비과세」로 흡수해 합이 맞고 있기 때문이다(실측 diff 0). 이 조합을 덮는 테스트는 **없다**: __tests__/components/mixed-use-filing-form-4col.anchor.test.tsx의 A2(정확 합)·A4(±4원)는 `mixedUseCase14()`(배율초과 없음 — nonBusinessLandPart = null, __tests__/tax-engine/transfer-tax/mixed-use-house.test.ts:119가 확인)를 쓰므로 어댑터 수정 후에도 green으로 남는다 ⇒ **회귀 안전망 0건**. 배율초과 픽스처로 4열 anchor를 먼저 심고 고쳐야 한다.
② 같은 어댑터를 4개 컴포넌트 테스트가 공유한다(mixed-use-filing-form-4col / mixed-use-filing-form-per-part-date / mixed-use-statement-acquisition-actual / calc/detailed-statement-lthd-fallback) — 전부 case14 계열이라 배율초과가 없어 red 위험은 낮지만 `longTermHoldingRate`(:49-53) 분모를 함께 바꾸면 상단 요약 산식 표시가 흔들릴 수 있다.
③ 어댑터는 겸용 전용이라 타 세목 파급은 없다(mixedUseToFilingResult 호출부는 MixedUseResultCard.tsx:129·704뿐). 다만 DetailedStatementHelpers.ts:318이 같은 값을 재계산하므로 두 보고서가 동시에 바뀐다는 점을 확인해야 한다.
④ 엔진(transfer-tax-mixed-use.ts·-totals.ts)은 건드릴 필요가 없다 — 세액은 이미 맞다. 엔진을 손대면 §104⑤ 관련 기각 이력과 충돌하므로 표시 계층에 국한할 것.

---

#### F36 · 증축 + 「감정평가가액으로 안분」 모드에서 감정평가가액이 검증도 반영도 되지 않고 조용히 버려진다

| | |
|---|---|
| 위치 | `lib/calc/transfer-tax-validate-gb-sale.ts:41` |
| 판정 | **CONFIRMED** |
| 심각도 | **medium** |
| 도달성 | reachable-via-ui |
| 탐지 축 | gb |
| 조치 | 배치 7 |

**결함**

「증축 자산은 감정평가가액으로 안분할 수 없다」 차단이 `saleSplitMode === "actual"` 블록 안(:52)에 들어 있다. 그런데 안분 방식 라디오에는 별도의 "appraisal" 모드가 있고(GeneralBuildingSaleSplitSection.tsx:94·145-149) ④ API의 saleAppraisalFields는 모드 게이트가 없어(transfer-tax-api-gb.ts:160-166) 감정평가 2필드를 항상 전송하는데, 3-way 엔진은 감정평가 필드를 읽지 않고 기준시가 3-way 안분만 한다. general-building-valuation.ts:335-336 주석(「validate가 그 조합을 먼저 막는다」)은 appraisal 모드에 대해 사실이 아니다.

**실패 시나리오**

일반건물·증축 ON(2015-06-01)·안분 방식 「감정평가가액」·토지 6억/건물 4억 감정·총양도 20억: validate가 null(통과)이고 payload에 감정평가 2필드가 실려 가는데 결정세액·안분값이 감정평가를 전혀 넣지 않은 경우와 완전히 동일(398,266,728 / land 1,935,596,925 / building1 43,376,547 / building2 21,026,528). 증축만 끄면 같은 감정평가가 399,464,626 → 428,550,467로 안분을 바꾼다.

**검증자 재현 실측**

probe(vitest, 삭제 완료) 실측 — 픽스처: 일반건물·환산·증축 ON(2015-06-01), 토지 85㎡ × 양도시 10,830,000원/㎡ = 920,550,000, 건물 기준시가 20,629,440, 증축 기준시가 10,000,000(denom3 = 951,179,440), 총양도 2,000,000,000, 감정 토지 600,000,000 / 건물 400,000,000.
• `validateGeneralBuildingAsset(...)` = **null** (통과)
• payload: `landAppraisalAtTransfer: 600000000`, `buildingAppraisalAtTransfer: 400000000` (전송됨)
• 감정 有 안분: land 1,935,596,925 / building1 43,376,547 / building2 21,026,528, 결정세액 378,761,828
• 감정 無(apportioned) 안분: **동일** land 1,935,596,925 / building1 43,376,547 / building2 21,026,528, 결정세액 378,761,828 → 차이 0원
• 증축 OFF 대조군: 감정 有 103,277,956 vs 감정 無 380,270,635 → 같은 감정이 277,000,000원 가까이 세액을 바꾼다
안분 3값은 제보와 **원 단위 일치**. 결정세액만 제보값(398,266,728)과 다른데, 취득측 픽스처 차이(자본적지출·양도비 등) 때문이며 판정의 핵심(감정 有=無)에는 영향 없다.

**제안 수정**

차단을 saleSplitMode 블록 밖으로 옮겨 `anyAppraisal && gbHasExtension`이면 모드 무관 차단하고, UI에서도 증축 ON일 때 appraisal 옵션을 비활성화한다(현행 설계는 건물 몫을 본체·증축으로 다시 나눌 근거가 없다고 판단하므로 차단이 일관된다).

**수정 위험**

① **검증 쪽 이동은 저위험** — `transfer-tax-validate-gb-sale.ts`의 유일 소비자는 `validateGeneralBuildingAsset`(`transfer-tax-validate-asset.ts:166`)이고 일반건물 전용이라 타 세목·타 자산 blast radius가 없다. 기존 anchor `__tests__/calc/gb-sale-split-plumbing.test.ts:199`(증축+감정 차단, actual 모드)는 차단을 블록 밖으로 올려도 그대로 green이다.
② **주의 — apportioned 모드 오차단.** 조건을 `anyAppraisal && gbHasExtension`으로 모드 무관 적용하면, `saleSplitModePatch("apportioned")`(`transfer-tax-split-acq-mode.ts:44-48`)가 감정 3필드를 비우기 이전에 저장된 sessionStorage 자산(잔존 감정값 + apportioned + 증축)이 갑자기 차단된다 — 현재 통과하는 입력이 red가 된다. `saleSplitMode !== "apportioned"`로 좁히거나 마이그레이션에서 비우는 처리가 필요하다.
③ **UI 절반이 진짜 위험** — 제안대로 「증축 ON일 때 appraisal 옵션 비활성화」를 `blockedReason`으로 구현하면 `__tests__/components/gb-sale-split-section.test.tsx:157-179`(⑤-4 「🔴 증축이 있어도 구분 기재 칸이 열린다」·`gb-sale-split-blocked` 부재·`gb-split-extension-note` 존재)와 `__tests__/calc/gb-sale-split-plumbing.test.ts:191`(「증축 + 구분 기재는 이제 통과한다 (Q-4)」)가 red가 된다. 이 테스트들은 Q-4 확정(증축 × 구분양도는 허용)을 고정한 것이므로, 차단은 **감정 옵션 하나만** disabled로 해야 하고 섹션 전체를 blockedReason으로 덮으면 안 된다.
④ **설계 선택지 주의** — Q-4는 이미 「건물 구분값을 본체·증축에 양도시 기준시가 비율로 나눈다」를 확정했으므로, 감정으로 얻은 건물 몫도 같은 비율로 3-way에 넘기는 대안이 논리적으로 가능하다. 즉 「차단」이 유일한 정합 해가 아니다 — 어느 쪽을 택하든 현재의 **침묵 유실**이 결함이라는 점은 변하지 않으나, 차단을 택하면 Q-4 확정 문구와의 정합을 계획서에 명시해 두어야 재논쟁이 난다.

---

#### F37 · 일괄양도 기본(안분) 모드에서 split validate의 취득가액·자본적지출 초과 가드가 통째로 꺼진다

| | |
|---|---|
| 위치 | `lib/calc/transfer-tax-validate-split.ts:313` |
| 판정 | **CONFIRMED** |
| 심각도 | **medium** |
| 도달성 | reachable-via-ui |
| 탐지 축 | split |
| 조치 | 배치 8 |

**결함**

`if (asset.saleSplitMode !== "actual") return null;`이 V9(§166⑧)뿐 아니라 그 아래 ②취득가액·③자본적지출 초과 검증까지 차단한다. ②·③은 saleSplitMode와 무관한 축이고(취득가액 2필드·자본적지출 2필드는 transfer-tax-api-split.ts:162-187에서 모드와 무관하게 전송), API 기본값이 `saleSplitMode ?? 'apportioned'`(:67)이라 기본 경로 전체가 미검증이다. 파일 머리말(:6-8)이 「엔진은 clamp하지 않는다 — 그 모순 입력을 여기서 차단한다」고 선언한 계약이 기본 모드에서 성립하지 않는다.

**실패 시나리오**

동일 자산(양도 10억·취득 총액 5억·토지 취득가액 900,000,000·토지 자본적지출 50,000,000 / 총 자본적지출 30,000,000)에서 saleSplitMode='actual'이면 「토지 취득가액이 취득가액(500,000,000원)을 초과합니다」로 차단되고, 'apportioned'(기본)이면 null 통과 → 엔진 splitPair가 건물 취득가액을 −400,000,000으로 도출해 음수 잔액이 그대로 세액에 반영된다.

**검증자 재현 실측**

[validate — probe 1·4]
② actual  : "자산 1: 토지 취득가액이 취득가액(500,000,000원)을 초과합니다 — 나머지가 음수가 됩니다."  (제보 문자열과 verbatim 일치)
② apportioned(기본) : null
② saleSplitMode undefined : null   / makeDefaultAsset saleSplitMode = "apportioned"
③ actual  : "자산 1: 토지·건물 자본적지출이 총 자본적지출(30,000,000원)과 맞지 않습니다."
③ apportioned : null
소유자분리(selfOwns=building_only, 건물 취득가 900,000,000 vs 총 500,000,000):
  apportioned → null  /  actual → "자산 1: 건물 취득가액이 취득가액(500,000,000원)을 초과합니다 — 나머지가 음수가 됩니다."
  상위 validateAssetAcquisition도 동일(ap=null, ac=차단)

[엔진 — calcSplitGain, 양도 10억·취득 총액 5억·양도시 기준시가 6:4]
정상(토지 2억) : landAcq 200,000,000 / bldgAcq 300,000,000 / landGain 400,000,000 / bldgGain 100,000,000
초과(토지 9억) : landAcq 900,000,000 / **bldgAcq −400,000,000** / landGain −300,000,000 / bldgGain 800,000,000
  → 제보의 "건물 취득가액 −400,000,000" 정확히 일치

[세액 — calculateTransferTax, mock rates, isOneHousehold=false·2주택]
selfOwns=both       : totalTax 150,766,000 → 127,006,000 (**−23,760,000 과소**, calculatedTax 137,060,000 → 115,460,000)
                       원인: 파트별 LTHD — 음수 gain 파트가 0으로 눌리고 반대편 800,000,000에 18% 적용 ⇒ 공제 54,000,000 과다 × 40% = 21,600,000
selfOwns=building_only: totalTax 45,573,000 → **0** (건물 gain 음수 → 전액 소멸)
③ 자본적지출(총 30,000,000 / 토지 50,000,000): totalTax 139,942,000 → 139,942,000 (**변화 없음**)

[mixed 파트 모드 — 수정 위험 실측]
land=estimated + building=actual, building 900,000,000: landAcq 200,000,000(환산식 — 잔액 미사용) / bldgAcq 900,000,000 / bldgGain −500,000,000

**제안 수정**

early-return을 V9 직후로 좁힌다 — V9·①만 `saleSplitMode === 'actual'` 안에 두고 ②·③은 모드 무관 실행. 같은 파일 :141-150이 V1·V2를 early-return 앞에 배치하며 그 이유를 주석으로 못박은 선례가 있다.

**수정 위험**

제안된 수정(early-return을 V9 직전으로 내려 ①·V9만 `saleSplitMode==="actual"`에 남기고 ②③은 모드 무관 실행)의 위험은 **낮지만 조건부**다.

1) **기존 테스트 red 없음(확인함).** `__tests__/calc/transfer-tax-validate-split.test.ts`에서 apportioned를 쓰는 케이스는 :68-79(①양도가액 미검증 — 제안 수정이 ①을 그대로 게이트 안에 남기므로 무영향), :83-119, :600-641, :645-680 뿐이고 **어느 것도 land/buildingAcquisitionPrice·directExpenses를 세팅하지 않는다**. `splitAsset`의 `fixedAcquisitionPrice:"400,000,000"`만 있고 파트 값이 없어 `isSplitPairOverflow(400M, undefined, undefined) === false`. 즉 현행 동작을 고정하는 안전망이 **없다** — 이 자체가 "의도된 설계가 아니다"의 방증이면서, 동시에 회귀 감지가 안 된다는 뜻이라 수정 시 anchor를 새로 심어야 한다.

2) **진짜 위험은 게이트 축 불일치다.** ②의 현행 조건은 자산-수준 legacy 플래그(`useEstimatedAcquisition`·`isSalesCaseAcquisition`, :351-353)인데 API 전송 게이트는 **파트별** `effectivePartAcqMode`(actual/appraisal)다. 그대로 모드 무관으로 풀면 mixed 파트 모드에서 과잉 차단이 난다 — 실측: land=estimated + building=actual, building 900,000,000이면 토지분은 환산식으로 200,000,000이 나와 **잔액이 소비되지 않는데**(landAcq 200,000,000) ②는 "총액 초과"로 막는다. 이 저장소가 반복해서 경계한 "입력 칸 없는 dead-end / UI 통과 ↔ validate 차단 모순"(⑧ 규칙, :157-161·:184-185 주석)에 해당하므로, ②를 옮길 때 `landAcqDirectActive`/`buildingAcqDirectActive`와 **같은 파트별 술어**로 함께 좁혀야 한다.

3) 타 세목 영향 없음 — `validateSplitDirectInputs` 호출부는 `lib/calc/transfer-tax-validate-asset.ts:570` 1곳뿐(양도세 전용).

4) 부수 위험: `skipTotals`(부담부증여·재개발·지분)와 `isSeparateAcquisition` 제외는 그대로 유지해야 한다 — 별개취득은 "합 = 총액" 불변식이 폐지됐고 그것을 고정하는 테스트가 있다(:277-282 "별개 취득은 잔액 규칙이 폐지돼 … 총액 초과 검증이 살아있으면 정당 입력이 막힌다").

소스는 수정하지 않았고, 검증용 probe(`__tests__/_scratch/verify-F37-*.test.ts` 5개)는 전부 삭제했다(`git status` 확인 — 타 검증자 파일만 잔존).

---

#### F39 · ⑭ 일괄양도 companion 매핑이 ownershipRatio를 버려 지분 자산의 §163⑥ 개산공제가 100% 기준으로 과대 계산된다

| | |
|---|---|
| 위치 | `app/api/calc/transfer/bundled-split-helpers.ts:226` |
| 판정 | **CONFIRMED** |
| 심각도 | **medium** |
| 도달성 | reachable-via-ui |
| 탐지 축 | multi |
| 조치 | 배치 5 |

**결함**

⑫(transfer-tax-schema-sub.ts:301)은 「⑫ 침묵 stripping 방지」 주석까지 달아 ownershipRatio를 받고 ⑬(transfer-tax-api-helpers.ts:606)은 실제 전송하는데 buildCompanionEngineInputs(:213-259)가 엔진 input에 싣지 않는다. 엔진 주석(transfer-tax-helpers.ts:306-309)이 명시한 대로 개산공제 base는 지분 기준시가로 축소돼야 하는데 100% 기준시가가 그대로 쓰여 개산공제가 커진다(과소과세 방향).

**실패 시나리오**

일괄 총 10억: 주 주택(기준시가 3억)+컴패니언 토지 지분 50%(양도시 기준시가 2억·취득시 1억=물건 전체·환산 모드), 안분 후 토지 몫 4억. ownershipRatio 유무와 무관하게 응답 동일 — 토지 necessaryExpense 3,000,000·transferGain 197,000,000·합산 totalTax 131,282,800. 지분이 도달하면 1,500,000·198,500,000·131,784,400 — 501,600 과소(기준시가·지분·세율에 비례해 커진다).

**검증자 재현 실측**

[probe a — ⑭ strip] buildCompanionEngineInputs 산출 companion input: `"ownershipRatio" in input` = **false**, 값 undefined. (transferPrice 400,000,000 / acquisitionPrice 200,000,000 / standardPriceAtAcquisition 100,000,000)

[probe b — route POST, 리뷰어 시나리오 그대로] 총 10억, primary 주택(양도시 기준시가 3억) + companion 토지(양도시 2억·취득시 1억 = 물건 전체, purchase+환산), ownershipRatio 0.5 유/무:
  status 200 / 200, **응답 JSON 완전 동일**.
  토지: transferPrice 400,000,000 · acquisitionPrice(환산) 200,000,000 · necessaryExpense **3,000,000** · transferGain **197,000,000**
  ⇒ 리뷰어 주장 수치(3,000,000 · 197,000,000)와 **정확히 일치**.

[probe c — 엔진 input에 ratio 0.5 주입 대조군] necessaryExpense **1,500,000** · transferGain **198,500,000** ⇒ 리뷰어 주장(1,500,000 · 198,500,000)과 **정확히 일치**. 개산공제 과대분 = 1억 × (1−0.5) × 3% = 1,500,000.
  합산 totalTax: 현행 191,017,200 → ratio 도달 시 191,576,880, **델타 559,680**(과소과세 방향).
  ⚠️ 리뷰어가 적은 합산 절대값(131,282,800/131,784,400·델타 501,600)은 **재현되지 않았다** — 시나리오에 primary 자산의 주택수·1세대1주택·보유기간이 명시돼 있지 않아 합산 세율·LTHD·기본공제 배분이 달라지기 때문이다. 방향·자릿수는 동일(둘 다 ≈50만원대)이고 내 실측이 오히려 더 크다 ⇒ 과장 아님.

[probe d — 가장 자연스러운 지분 시나리오, 사례 27 패턴] 같은 물건 10억을 60%(상속)+40%(매매·환산)로 분할 취득, companion 취득시 기준시가 2억(물건 전체):
  status 200/200, **응답 동일**. companion 개산공제 **6,000,000**(= 2억 × 3%) — 지분 반영 시 2,400,000(= 2억 × 0.4 × 3%)이어야 한다. 과대공제 3,600,000.

**제안 수정**

buildCompanionEngineInputs에 `ownershipRatio: c.ownershipRatio`를 추가하고 CompanionRawAsset에 선언(단건 engine-input.ts:218이 정답).

**수정 위험**

낮음. 제안 수정(`buildCompanionEngineInputs` 객체에 `ownershipRatio: c.ownershipRatio` 추가 + `CompanionRawAsset`에 `ownershipRatio?: number` 선언)은 sibling 4경로(`engine-input.ts:218` primary · `multi/route.ts:126` · `general-building-route-helper.ts:184` · `route.ts:333` 겸용)와 동형이다.

현재(결함) 동작을 고정하는 테스트 없음 — `companionAssets`를 쓰는 테스트 9파일(`__tests__/api/transfer.route.{bundled,fractional,landnature,bundled-swallows-special}.test.ts`, `__tests__/lib/calc/{bundled-companion-one-household,fractional-primary-basic-merge}.anchor.test.ts`, `__tests__/calc/{companion-unregistered-plumbing,gift-donor-date-optional-parity,usage-conversion-api-pipeline}.test.ts`) 중 `ownershipRatio`를 보내는 것은 0건이고, `transfer.route.fractional.test.ts`의 지분 자산은 `fixedAcquisitionPrice`(실거래가)라 개산공제 분기에 진입하지 않는다 ⇒ 수정해도 red 없음(= "현행이 의도"라는 증거도 없음).

주의할 잔여 지점 2가지:
① `splitCompanionIntoTwo`(:397-453)가 `...base` 스프레드라 부수토지/한도초과 두 파트가 ratio를 함께 상속한다. 두 파트가 이미 `base.standardPriceAtAcquisition`(물건 전체)을 공유하므로 지금과 동형이며 새 결함은 아니지만, 파트별 개산공제 이중 계상 여부는 별도 확인 대상이다(이 finding 범위 밖).
② 엔진 쪽 `ownershipRatio`는 개산공제 외에 `transfer-tax-burdened-gift-step.ts:100`(12억 분모 분기)에서도 읽힌다. 다만 부담부증여는 `transfer-tax-validate.ts:126` SINGLE_ONLY로 다자산 일괄양도가 차단되어 컴패니언 경로와 만나지 않는다.

수정 시 회귀 안전망이 0이므로 **F14 도달 anchor(설계문서 plan.md:318이 요구했으나 미작성)를 함께 추가**해야 한다 — 그렇지 않으면 다음 리팩터에서 같은 방식으로 조용히 다시 빠진다.

---

#### F40 · ⑫ companionAssetSchema에 공익수용 §164⑨ 6필드가 없어 컴패니언 특례 입력이 통째로 버려진다

| | |
|---|---|
| 위치 | `lib/api/transfer-tax-schema-sub.ts:398` |
| 판정 | **CONFIRMED** · 법령 CONFIRMED |
| 심각도 | **medium** |
| 도달성 | reachable-via-ui |
| 탐지 축 | plumbing |
| 조치 | 배치 1 |

**결함**

④(transfer-tax-api-helpers.ts:574-596)가 standardPricePerSqmAtTransfer·transferArea·compensationPerSqm·compensationBasisStdPrice·isAuctionTransfer·auctionPrice 등을 실으면서 주석으로 「⑫ 컴패니언 스키마 동반 필수」라 못박고 ⑭(bundled-split-helpers.ts:115-127·231-241)도 타입 주석과 매핑을 갖췄는데, companionAssetSchema(:286-399)에는 이 필드도 게이트 필드 transferCause도 없다. 게다가 buildAssetPayload는 transferCause 자체를 emit하지 않아 스키마만 고쳐도 특례가 발동하지 않는다.

**실패 시나리오**

「함께 양도」에서 컴패니언 토지를 공익수용으로 양도하며 ExpropriationBlock(컴패니언 카드에도 렌더됨)에 ㎡당 보상가액·기준시가를 입력해도 Zod가 6키를 제거하고 transferCause는 오지 않아 §164⑨1호 min[] 비교가 한 번도 실행되지 않는다. 환산취득가가 특례 미적용값으로 산출되는데 화면에는 입력값이 그대로 보인다.

**검증자 재현 실측**

[probe 1 — ④→⑫ strip] buildAssetPayload(land 컴패니언, 수용+환산) emit 키 = ["standardPricePerSqmAtTransfer","transferArea","compensationPerSqm","compensationBasisStdPrice","isAuctionTransfer","auctionPrice"], 값 = {standardPricePerSqmAtTransfer:2500000, transferArea:200, compensationPerSqm:1500000, compensationBasisStdPrice:2000000} (transferCause·housing 2필드 미emit). companionAssetSchema.safeParse → success=true(400 아님), 9키 중 생존 = [] (0개).

[probe 2 — ⑭→엔진 + 델타] buildCompanionEngineInputs 산출 engineInput의 {transferCause, standardPricePerSqmAtTransfer, transferArea, compensationPerSqm, compensationBasisStdPrice} 전부 undefined. calculateTransferTax 현행: transferGain 594,000,000 / totalTax 184,681,200, expropriationValuationDetail=null. 5필드를 손으로 주입: transferGain 327,333,334 / totalTax 89,217,772, detail={perSqmCandidates:{standard:2500000,compensation:1500000,basis:2000000}, chosenPerSqm:1500000, area:200, denominator:300000000}. 델타 = 양도차익 266,666,666 과대, 세액 95,463,428 과대.

[probe 3 — route 레벨 결정적] POST /api/calc/transfer (bundled, primary·companion 동일 토지, 컴패니언 body에도 transferCause+4필드 완비) → status 200, mode "bundled", properties = [{id:"primary", gain:327333334, detail 有(denominator 300000000)}, {id:"c1", gain:594000000, detail:null}]. ⇒ 클라이언트가 완벽히 보내도 ⑫가 전량 strip.

**법령 독립확인**

법령 쪽만 독립 확인했다. 결론: F40의 법적 전제(§164⑨ 특례가 컴패니언 자산에도 미친다)는 조문 본문이 정면으로 뒷받침한다.

【1】핵심 조문 — 소득세법 시행령 §164⑨ (MST 286211, 공포 20260522 / 시행 20260701) 본문 verbatim:
"⑨다음 각 호의 어느 하나에 해당하는 가액이 법 제99조제1항제1호가목부터 라목까지의 규정에 따른 가액보다 낮은 경우에는 그 차액을 같은 호 가목부터 라목까지의 규정에 따른 가액에서 차감하여 양도 당시 기준시가를 계산한다.
1. 「공익사업을 위한 토지 등의 취득 및 보상에 관한 법률」에 따른 협의매수ㆍ수용 및 그 밖의 법률에 따라 수용되는 경우의 그 보상액과 보상액 산정의 기초가 되는 기준시가 중 적은 금액
2. 「국세징수법」에 의한 공매와 「민사집행법」에 의한 강제경매 또는 저당권실행을 위하여 경매되는 경우의 그 공매 또는 경락가액"

「주된 자산」·「일괄양도 제외」 같은 범위 제한이 본문·괄호·단서 어디에도 없다. 발동 요건은 오직 「각 호 가액 < 법 §99①1호 가~라목 가액」이라는 자산별 비교다.

【2】비교 대상이 자산별 값임을 확인 — 소득세법 §99①1호 (MST 280405): 가목 토지(개별공시지가) · 나목 건물(국세청장 산정·고시) · 다목 오피스텔 및 상업용 건물 · 라목 주택(개별주택가격 및 공동주택가격). 넷 다 개별 물건 단위 값이다 ⇒ §164⑨의 비교·차감은 본질적으로 자산 단위 연산이며, 컴패니언이라고 달라질 근거가 없다.

【3】위임 체인을 끝까지 추적 — 컴패니언 기준시가가 법적으로 살아있는 값임을 확인:
· 소득세법 §100② : "토지와 건물 등을 함께 취득하거나 양도한 경우에는 … 가액 구분이 불분명할 때에는 취득 또는 양도 당시의 기준시가 등을 고려하여 대통령령으로 정하는 바에 따라 안분계산한다"
· → 시행령 §166⑥ : "법 제100조제2항의 규정을 적용함에 있어서 토지와 건물 등의 가액의 구분이 불분명한 때에는 「부가가치세법 시행령」 제64조제1항에 따라 안분계산 하며"
· → 부가가치세법 시행령 §64①1호 (MST 283641) : "「소득세법」 제99조에 따른 기준시가 … 가 모두 있는 경우: 공급계약일 현재의 기준시가에 따라 계산한 가액에 비례하여 안분 계산한 금액"
⇒ 컴패니언 안분 키가 곧 기준시가이고, §164⑨은 바로 그 「양도 당시 기준시가」를 계산하는 규정이다. 두 조문은 충돌 없이 병존한다(수용되는 토지·건물의 보상금 총액 구분이 불분명하면 안분과 §164⑨이 함께 작동).

【4】환산취득가액 경로도 자산별 — 시행령 §176의2②2호: 환산가액 = 양도당시 실지거래가액 × (취득당시 기준시가 ÷ 양도당시 기준시가). 분모가 §164⑨이 조정하는 값이다. 컴패니언 배제 문언 없음.

【5】엔진 게이트가 조문과 일치함을 확인(코드 재현이 아니라 조문 대응 확인 목적): lib/tax-engine/transfer-tax-expropriation-valuation.ts:112·257·312가 1호를 transferCause === "public_expropriation"로 게이트 — §164⑨1호 "협의매수ㆍ수용" 요건과 일치. :189가 2호를 isAuctionTransfer 단독으로 게이트 — §164⑨2호는 수용을 요구하지 않으므로 이것도 조문과 일치(:178 주석 "isAuctionTransfer로 진입(수용 아님)").

【6】선례 — 「일괄양도 안분 기준시가」 조세심판원 74건이 기준시가 비율 안분을 확립된 실무로 확인(조심 2021서2234, 조심 2012서0722, 국심1995서3611 "그 양도당시 기준시가 비율로 안분계산" 등). 다만 §164⑨을 일괄양도 컴패니언 자산에 적용한 결정례·예규는 tax_tribunal·nts·interpretation 도메인 다중 검색에서 발견되지 않았다 ⇒ 해당 쟁점 선례 부존재. 조문 문언이 일의적이므로 이 부존재가 주장을 약화시키지 않는다.

【7】확인 실패(추정 금지) — §164⑨ 신설 시점·부칙 적용례는 확인하지 못했다. get_law_text(mst=286211, jo=제164조, efYd=20090204)가 NOT_FOUND를 반환했다. 이는 엔진 주석이 스스로 기재한 미검증 항목과 일치한다. 이것은 도구 실패이지 「명문 없음」이 아니다. F40이 시점 특정 주장을 하지 않으므로 판정에는 영향 없다.

**제안 수정**

companionAssetSchema에 transferCause+8필드를 단건 propertyBaseShape:110-123과 동일 타입으로 추가하고 buildAssetPayload에 transferCause를 emit한다 — 셋 중 하나라도 빠지면 여전히 no-op이므로 세 층을 한 커밋으로. 착수 전 실제 세액 영향(현재 0인지)을 먼저 실측할 것.

**수정 위험**

낮음~중간. (a) `companionAssetSchema`는 비-strict `z.object`라 optional 필드 9개 추가는 순수 가산 — 기존 payload가 400을 맞지 않는다(현재도 여분 키를 조용히 통과시켜 200을 낸다는 것을 probe 3에서 실측). (b) 진짜 위험은 `buildAssetPayload`의 `transferCause` emit 쪽이다. 엔진에서 `transferCause`를 읽는 곳이 §164⑨ 외에도 있다 — `lib/tax-engine/transfer-tax-split-gain.ts:320,672` · `transfer-tax-commercial-step.ts:71` · `transfer-tax-mixed-use-helpers.ts:226,378` · `transfer-tax-mixed-use-commercial.ts:77,131` · `general-building-converted-acquisition.ts:57`. 겸용·재개발·일반건물 컴패니언은 `lib/calc/transfer-tax-validate.ts:124-133` SINGLE_ONLY가 함께양도에서 차단하지만 **`commercial_building`은 의도적으로 차단하지 않는다**(:115-117 주석). `bundled-split-helpers.ts:190`이 컴패니언 propertyType을 `housing|building` 외 전부 "land"로 뭉개므로, 게이트 없는 `transferCause` emit + stale 보상값이 남으면 상가 컴패니언에서 토지 의미로 특례가 오발동할 수 있다 — ④가 per-sqm 필드에 이미 건 `isExprValuationEligibleAssetKind` 게이트를 `transferCause`에도 동일 적용하면 원천 차단된다. (c) 지분분할 경로는 `mergePrimaryBasic`(transfer-tax-api-helpers.ts:373)이 이미 `transferCause`를 복사하지만 지분분할+공익수용은 `transfer-tax-validate.ts:89`가 차단하므로 신규 노출 없음. (d) 현행 동작을 고정해 red를 낼 테스트는 **찾지 못했다** — `__tests__/api/transfer.route.bundled-swallows-special.test.ts`는 겸용·재개발·일반건물·부담부증여·상가만 다루고 수용은 없다. `expropriation-companion.anchor.test.ts`·`expropriation-auction-clause2.anchor.test.ts`의 594,000,000 단언은 엔진 input을 손으로 만드는 "특례 미적용 대조군"이라 수정 후에도 green 유지(오히려 컴패니언 지원 의도를 고정하는 증거). 착수 시 `npm run test:transfer` 전체 + `__tests__/api/transfer.route.bundled*.test.ts` 확인 권장.

---

#### F41 · ⑧↔⑩ 불일치: 컴패니언을 「매매사례가액」으로 취득하면 UI는 통과하는데 API가 400을 던진다(메시지도 화면에 없는 필드)

| | |
|---|---|
| 위치 | `lib/api/transfer-tax-schema.ts:618` |
| 판정 | **CONFIRMED** |
| 심각도 | **medium** |
| 도달성 | reachable-via-ui |
| 탐지 축 | plumbing |
| 조치 | 배치 10 |

**결함**

companion superRefine(:600-626)이 acquisitionCause==='purchase'를 환산/실가 2분기로만 본다. 실제 산정 방식은 4축이고 salesCase에서는 금액이 similarSalesValue로 들어가는데(CompanionAcqAmountSection.tsx:41-56이 취득가액 입력을 SalesCaseSection으로 교체) companionAssetSchema에 similarSalesValue·acquisitionMethod가 없고 buildAssetPayload도 보내지 않아 fixedAcquisitionPrice가 비어 refine이 걸린다. 반면 ⑧(transfer-tax-validate-asset.ts:331-333)은 salesCase에서 similarSalesValue만 요구해 통과시킨다.

**실패 시나리오**

컴패니언 주택을 매매(2010-05-05)로 두고 「매매사례가액」 7억을 입력 → validate null(진행 허용) → 계산 버튼 → 400 `{"companionAssets.0.fixedAcquisitionPrice":["매매(실가) 시 취득가액 필수"]}`. 사용자는 화면에 없는 「취득가액」을 요구받고 계산을 끝낼 수 없다. 감정가액 모드는 400은 안 나지만 acquisitionMethod가 없어 §163⑥ 개산공제가 빠질 가능성(미검증).

**검증자 재현 실측**

probe(삭제 완료) 실측 3케이스.
[A] 함께양도 actual: 자산1 주택 매매 실가(취득 2010-05-05·400,000,000·양도 1,000,000,000), 자산2 주택 매매 **매매사례가액 700,000,000**(fixedAcquisitionPrice 빈칸), 총 양도가액 1,800,000,000.
 · collectStepIssues(step 0·1·2·3) = [] (⑧ 전부 통과)
 · body.companionAssets[0] 키 = assetId, assetLabel, assetKind, standardPriceAtTransfer, directExpenses, reductions, isOneHousehold, isUnregistered, fixedSalePrice(800,000,000), acquisitionCause("purchase"), useEstimatedAcquisition(false), acquisitionDate — **similarSalesValue 없음 · fixedAcquisitionPrice 없음 · acquisitionMethod 없음**
 · propertySchema.safeParse → 실패, fieldErrors = {"companionAssets.0.fixedAcquisitionPrice":["매매(실가) 시 취득가액 필수"]} (route가 그대로 400 반환)
 · 사용자 메시지(formatFieldErrors) = "입력값이 올바르지 않습니다\n• companionAssets.0.fixedAcquisitionPrice: 매매(실가) 시 취득가액 필수"
[B] 함께양도 apportioned: 동일 입력 → validateIssues [] · 동일 fieldError(모드 무관).
[C] 함께양도 + 컴패니언 **감정가액** 700,000,000: parseOk=true(400 없음), companion 키에 fixedAcquisitionPrice 존재 · acquisitionMethod 부재.
[D] 지분(50/100) 분할 2자산, 2번째 지분만 매매사례가액 700,000,000 → validateIssues [] · 동일 fieldError `companionAssets.0.fixedAcquisitionPrice`.

**제안 수정**

최소 수정은 transfer-tax-validate.ts:126 SINGLE_ONLY에 컴패니언 salesCase 차단 추가(다건 validateMultiSupportedMode와 같은 정책). 정식 지원이라면 companionAssetSchema에 acquisitionMethod·similarSalesValue 추가 + buildAssetPayload 전송 + superRefine 4축 확장 + companion 엔진 input 매핑까지 함께.

**수정 위험**

· 최소 수정(SINGLE_ONLY에 컴패니언 salesCase 차단 추가, `lib/calc/transfer-tax-validate.ts:126~140`): 이 가드는 `form.assets.length > 1` 전체에 걸리므로 **지분 분할 경로까지 함께 막힌다**. 다만 그 경로도 현재 동일하게 400이므로 「동작하던 기능」을 잃지는 않는다(위 [D] 실측). 주의점 둘 — ① 기존 항목처럼 `some()`으로 전 자산을 보면 **primary만 salesCase인 단건→다건 전환 케이스**도 막히므로 술어를 `assets.slice(1)`(또는 companion emit 대상)로 좁혀야 한다. primary salesCase는 `transfer-tax-api.ts:361`로 정상 배관돼 있고 `__tests__/lib/calc/transfer-sales-case-wiring.test.ts`가 그것을 고정한다. ② `fullFractional` carve-out(general_building)과 상호작용을 함께 봐야 한다.
· 정식 지원(스키마+payload+refine 4축+엔진 input 매핑): 변경 파일이 `transfer-tax-schema-sub.ts`·`transfer-tax-schema.ts`·`transfer-tax-api-helpers.ts`·`bundled-split-helpers.ts` 4곳으로 14지점 ⑩⑫⑬⑭ 전부에 걸린다. `companionAssetSchema`는 `transfer-tax-schema.ts:327` 외에도 다건 계산기(`lib/calc/multi-transfer-tax-api.ts`) 계열이 참조하는지 확인 필요. `buildAssetPayload`를 고정하는 기존 테스트 존재: `__tests__/calc/transfer-replot-increase-live-fallback.test.ts`, `__tests__/calc/transfer-fractional-part-field-ratio.test.ts`(지분 스케일 × similarSalesValue 규약 — 컴패니언에도 `applyRatio`를 동일 적용하지 않으면 이 규약과 어긋난다).
· **현재 동작을 의도로 고정하는 테스트는 없다** — 컴패니언 salesCase를 다루는 테스트가 `__tests__`·`e2e` 전체에 0건(grep `isSalesCaseAcquisition` 전수 확인). 즉 "이 동작이 의도됨"의 증거는 발견되지 않았다.

---

#### F43 · 합산 신고서 양식의 농어촌특별세 행이 0으로 하드코딩되어 실제 부과되는 농특세가 서식에서 사라진다

| | |
|---|---|
| 위치 | `components/calc/results/transfer/FilingFormTableAggregateHelpers.ts:329` |
| 판정 | **CONFIRMED** |
| 심각도 | **medium** |
| 도달성 | reachable-via-ui |
| 탐지 축 | multi |
| 조치 | 배치 11 |

**결함**

`setNum("ruralSurtax","total", 0)` 리터럴. 엔진은 소득금액차감 감면(§99의3 등) 적용 시 농특세를 2-pass로 산정해 AggregateTransferResult.ruralSurtax로 노출하고 totalTax에도 합산한다(transfer-tax-aggregate.ts:243-259·402). 다건 마법사는 income-deduction 감면을 차단하지만 일괄(bundled)은 차단 대상이 아니어서 단건 route가 aggregate를 부르고 BundledAllocationCard가 mode="aggregate"로 이 빌더를 탄다.

**실패 시나리오**

일괄양도(총 10억) 주 자산 주택에 §99의3 신축주택 감면: route 실측 aggregated.ruralSurtax 8,960,000·determinedTax 116,260,000·localIncomeTax 11,626,000·totalTax 136,846,000인데 서식의 농특세 행은 0 → 서식 행 합(127,886,000)이 같은 화면의 총 납부세액과 8,960,000 어긋난다.

**검증자 재현 실측**

원 리뷰어의 정확한 입력 파라미터가 명시되지 않아 그가 적은 수치(ruralSurtax 8,960,000 / determinedTax 116,260,000 / localIncomeTax 11,626,000 / totalTax 136,846,000 / 행 합 127,886,000)는 그대로 재현하지 못했다. 동등한 bundled §99의3 케이스(총 10억 = 주택 8억[§99의3, 취득 5억, 2015-07-01→2022-08-01, 세대주택수 2] + 토지 2억[취득 1.2억], bundledSaleMode="actual")로 실측한 값:

라우트 실측 (POST /api/calc/transfer, status 200, mode="bundled"):
  aggregated.ruralSurtax   = 7,940,400
  aggregated.determinedTax = 64,078,000
  aggregated.penaltyTax    = 0
  aggregated.localIncomeTax= 6,407,800
  aggregated.totalTax      = 78,426,200
  properties[0].incomeDeductionReducible = 103,200,000

buildAggregateRows 실측:
  "농어촌특별세 (§99의3 등)" 행 = { primary: null, c1: null, total: 0 }   ← 0 하드코딩
  "총결정세액" 행 total        = 64,078,000
  "지방세 결정세액" 행 total    = 6,407,800
  두 행 합 = 70,485,800 vs aggregated.totalTax 78,426,200 → 차이 = 7,940,400 (= 누락된 농특세 전액, 총세액의 10.1%)

원 주장의 수치는 다르지만 구조(농특세 전액이 서식에서 사라지고 그만큼 총세액과 어긋남)는 1:1로 재현된다.

**제안 수정**

`setNum("ruralSurtax","total", aggregated.ruralSurtax ?? 0)` — aggregated는 같은 함수가 이미 :322-338에서 참조하므로 추가 배선 불요(단건 FilingFormTableHelpers.ts:725가 정답 형태).

**수정 위험**

낮다.
· `aggregated.ruralSurtax`는 `AggregateTransferResult`의 항상 채워지는 number 필드(`transfer-tax-aggregate.ts:243` `let ruralSurtax = 0` → :595 반환)라 `?? 0` 없이도 안전하고, `aggregated`는 같은 함수가 이미 :322-338에서 참조 중이라 추가 배선이 없다. 14 동기화 지점 무관(표시 전용, 엔진 input/result 변경 없음).
· `buildAggregateRows` 소비자는 4개 테스트 파일뿐이며(`gb-filing-form-land-acq-date.anchor.test.ts` · `gb-filing-form-tax-rows-total-only.anchor.test.ts` · `filing-form-exempt-gain-reduction-cap.test.tsx`), **어느 것도 "농어촌특별세" 행을 단언하지 않는다** — 전 저장소 grep 결과 이 행 라벨을 검사하는 테스트·E2E가 0건이다. 즉 현재 0 동작을 고정하는 안전망이 없다(= "의도된 설계"의 증거도 없다).
· 회귀 표면: 다건(multi) 경로는 income-deduction이 validate 차단이라 `ruralSurtax`가 항상 0 → 값 무변화. 일반건물(GB) 일괄·지분분할 등 다른 aggregate 소비 경로도 income-deduction 감면이 없으면 0 그대로. 실제로 값이 바뀌는 것은 bundled + §99의3/§99/§98의8 계열 케이스뿐이다.
· 다른 세목(취득세·재산세 등)의 농특세 로직과는 파일·경로가 완전히 분리돼 있어 영향 없음.
· 주의: 한 줄 수정만 하면 같은 화면 상세명세서는 여전히 0이라 **화면 내 새 불일치(서식 7,940,400 vs 명세서 0)**가 생긴다 — 두 지점을 함께 고칠 것.

---

#### F44 · 다건 감면 재계산 표의 '건별 산출세액' 열이 감면세액을 표시하고 화살표가 미완성

| | |
|---|---|
| 위치 | `components/calc/results/MultiTransferTaxResultView.tsx:139` |
| 판정 | **CONFIRMED** |
| 심각도 | **medium** |
| 도달성 | reachable-via-ui |
| 탐지 축 | report |
| 조치 | 배치 11 |

**결함**

헤더가 「건별 산출세액」인 열(:128)의 셀이 `{p.reductionAmount.toLocaleString()} → {/* standaloneTax 필드는 미노출 */}`로 감면세액을 그리고 목적지 없는 화살표를 렌더한다. 옆 「건별 단독감면」 열(:141-143)이 같은 값을 다시 표시해 두 열이 동일해진다. 주석과 달리 PerPropertyBreakdown.refCalculatedTax는 필수 필드로 존재한다(types/transfer-aggregate.types.ts:150).

**실패 시나리오**

§69 감면이 있는 자산 2건 다건 계산에서 「건별 산출세액」과 「건별 단독감면」이 같은 숫자로 나란히 떠 감면율(감면/산출) 검산이 불가능하다.

**검증자 재현 실측**

입력: taxYear 2023, 자경농지 2건(A: 양도 826,000,000 / 1975-05-24 취득 / 환산 / §69 30년 + 2020-02-14 주거지역 편입, B: 양도 500,000,000 / 2005-02-18 취득 100,000,000 / §69 15년), makeMockRates().

엔진 관측(PerPropertyBreakdown):
- jangseungpo-24: refCalculatedTax=193,127,572 / reductionAmount=100,000,000 / reducibleIncome=318,214,211 / reductionAggregated=53,194,025 / taxBaseShare=545,398,981 / appliedRate=0.42 / progressiveDeduction=35,940,000
- second-farm: refCalculatedTax=86,460,000 / reductionAmount=86,460,000 / reducibleIncome=280,000,000 / reductionAggregated=46,805,975

렌더된 DOM(`[data-print-id="reduction-recalc"] tbody tr` td textContent):
- ["농지A", "100,000,000 → ", "100,000,000", "318,214,211", "53,194,025"]
- ["농지B", "86,460,000 → ", "86,460,000", "280,000,000", "46,805,975"]

⇒ 「건별 산출세액」 열이 193,127,572 대신 100,000,000(=감면세액)을 그리고, 「건별 단독감면」과 문자열이 동일하며, 각 행마다 목적지 없는 「→」가 1개씩(섹션 내 총 2개) 남는다. 편차 93,127,572원(약 1.93배 과소 표시). 두 번째 자산은 refCalculatedTax==reductionAmount(전액 감면)라 우연히 같은 값이어서 **결함이 눈에 띄지 않는 케이스도 있다**. 같은 container 안에 193,127,572가 존재(아코디언 「산출세액 (참고)」)함도 확인.

**제안 수정**

셀을 `{p.refCalculatedTax.toLocaleString()}`로 바꾸고 미완성 화살표와 dead 주석 제거. ⚠️ multi 축이 refCalculatedTax 산식 자체(파트 없는 자산에서 standalone 세율·누진공제를 aggregate taxBaseShare에 적용해 0이 나오는 사례)를 uncertain으로 남겼으므로 표시 전에 그 값의 의미를 확정할 것.

**수정 위험**

낮음~중간. (1) **깨질 테스트 없음** — 「건별 산출세액」·「건별 단독감면」 문자열을 단언하는 테스트·E2E는 저장소에 없다(`__tests__`·`e2e` 전수 grep 결과 히트는 소스 4파일뿐). 즉 현재 동작을 고정하는 안전망이 0이며, 「의도된 것」의 증거도 없다. (2) **소비자 1곳** — 이 뷰는 `app/calc/transfer-tax/multi/MultiTransferTaxCalculator.tsx:647`에서만 마운트되므로 타 세목 파급 없음. (3) 🔴 **실질 위험은 stale 저장 결과다** — 결과는 IndexedDB에 저장·복원되고, sibling `MultiTransferPropertyBreakdown.tsx:115-124`가 굳이 `typeof breakdown.refCalculatedTax === "number"` 가드 + 인라인 재계산 fallback을 두고 「옛 데이터·HMR 부분 적용 등으로 새 필드가 누락된 경우 (NaN 차단)」이라고 명시한다. 따라서 제안대로 `p.refCalculatedTax.toLocaleString()`을 그냥 쓰면 구(舊) 저장 결과에서 `TypeError: Cannot read properties of undefined`로 **결과 페이지 전체가 죽는다**. 반드시 sibling과 같은 가드를 재사용할 것(가능하면 그 fallback을 공용 헬퍼로 뽑아 단일 소스화 — 다만 그건 별건). (4) 파트 분리 자산은 `refCalculatedTaxNote`(엔진 :542)가 산식 문구를 따로 주므로, 표에 숫자만 넣으면 「기여분×세율」 산식이 성립하지 않는 자산에서 오해 소지가 남는다 — 표는 숫자만 쓰므로 실무상 영향은 작으나, finding이 남긴 「refCalculatedTax 산식 자체 uncertain」 경고는 파트 없는 자산의 근사식(:512-514, 종전 산식 유지 명시)에 관한 것이라 이 표시 수정과는 독립이다.

---


### Low — 표시·일관성

#### F38 · 부담부증여 × 이월과세에서 「환산취득가 사용」 토글이 열려 있고 ⑧도 환산 입력을 요구하지만 엔진은 fail-fast로 500을 던진다

| | |
|---|---|
| 위치 | `lib/calc/transfer-tax-validate-bg.ts:77` |
| 판정 | **PARTIALLY_CONFIRMED** |
| 심각도 | ~~medium~~ → **low** |
| 도달성 | reachable-via-ui |
| 탐지 축 | burdened |
| 조치 | 배치 10 |

**결함**

엔진 assertCarryoverDonorBasis는 ct.useEstimatedAcquisition이 true면 무조건 TaxCalculationError를 던진다(transfer-tax-carryover-burdened-gift.ts:99-106). 그런데 UI는 부담부증여 여부와 무관하게 「환산취득가 사용」 토글을 렌더하고(CarryoverGiftBlock.tsx:154-166), ⑧은 오히려 환산 모드 필수 입력을 요구하며(transfer-tax-validate-asset.ts:225-241) 부담부증여 전용 validate(:77-82)에도 이 조합 차단이 없다.

**실패 시나리오**

housing + burdened_gift + carryover_gift + useEstimatedAcquisition=true + 증여자 기준시가 2억/8억 입력 → validateAssetAcquisition=null(통과) → 엔진 throw → route.ts:476-480이 500 응답 → 사용자는 마법사 마지막 단계에서야 오류 배너를 본다(환산 OFF 대조군은 determinedTax 63,071,000으로 정상).

**검증자 재현 실측**

probe(삭제 완료: __tests__/_scratch/verify-F38-{1,2,3}.test.ts)

[⑧ validate — housing + transferType=burdened_gift + acquisitionCause=carryover_gift + bgValuationMode=sangjeungbeop_standard + 채무 3억/2억 + bgCoDonor 기준시가 0/1.5억]
· carryover.useEstimatedAcquisition=true, estimationMode=null   → "자산1: 환산 방식(일반 기준시가/개별주택가격 미공시/공동주택 최초고시 전)을 선택하세요."
· estimationMode="general", 기준시가 미입력                      → "자산1: 취득시 기준시가를 입력하세요."
· estimationMode="general", donorStdPrice 2억/8억 입력완료        → **null (통과)**
· 대조군 환산 OFF + donorAcquisitionPrice 1억                     → null (통과)
· 대조군 일반양도(transferType=sale) + 환산 ON                    → null (통과, 정상 지원)

[④⑬ body — callTransferTaxAPI fetch 가로채기]
· carryoverTaxation = {"giftRegistryDate":"2023-06-01","donorAcquisitionDate":"2000-06-01","useEstimatedAcquisition":true,"giftTaxAmount":0,"giftDateValuation":600000000,"exclusionDeclared":{}}
· topLevelOverrides = {"standardPriceAtAcquisition":200000000,"standardPriceAtTransfer":800000000,"useEstimatedAcquisition":true}
· burdenedGiftInfo.carryoverDonorBasis = {"landStdPriceAtAcquisition":0,"buildingStdPriceAtAcquisition":150000000}

[⑫ Zod — propertySchema.safeParse(body)]
· estimationMode="general" → success = true
· estimationMode="phd"     → success = true
⇒ 400이 아니라 엔진까지 도달한다.

[엔진 calculateTransferTax]
· ct.useEstimatedAcquisition=true  → THROW: "부담부증여에서는 이월과세 취득가액을 환산으로 구할 수 없습니다. 취득가액은 「소득세법 시행령」 제159조 제1항 제1호가 정하므로, 환산이 필요하면 증여재산 평가 모드를 시가 + 취득가액 산정방식 「환산」(K-5)으로 선택하세요."
· ct.useEstimatedAcquisition=false → determinedTax = 121,560,000 (정상 산출)

⚠️ 원 주장 대조군 63,071,000은 픽스처 미공개로 그대로 재현되지 않음(내 픽스처 121,560,000). 정성적 방향만 일치.

**⚠️ 정정된 주장** (원 보고가 과장·부정확했던 부분)

⑧ `validateBurdenedGiftAsset`(lib/calc/transfer-tax-validate-bg.ts:77-82)은 엔진 `assertCarryoverDonorBasis`의 **두 throw 중 하나만** 미러한다 — 「당초 증여자 필드 미입력」은 막지만 「`ct.useEstimatedAcquisition === true`」(transfer-tax-carryover-burdened-gift.ts:99-106)는 막지 않는다. 그 결과 부담부증여 × 이월과세에서 「환산취득가 사용」 토글을 켠 사용자는 ⑧이 오히려 환산 모드 선택·기준시가 입력을 요구한 끝에 통과하고(⑫ Zod도 통과 — 실측), 계산 제출 시 엔진 fail-fast로 HTTP 500 배너를 받는다.

다만 (a) 잘못된 세액이 산출되는 침묵 오답은 없고(hard fail), (b) 배너 문구는 엔진의 정확·실행가능한 한국어 안내가 그대로 전달되며, (c) 500은 이 저장소가 모든 TaxCalculationError에 쓰는 공통 코드이고, (d) 같은 파일 :151이 「기준시가 모드 B/C>1은 엔진 fail-fast」라는 동종 선례를 명시한다. ⇒ 실질 영향은 "인라인 필드 오류 대신 제출 시점 오류"이므로 **medium이 아니라 low**다. 수정은 ⑧ (1-b) 블록에 `asset.carryover?.useEstimatedAcquisition` 차단 1건 추가로 충분하며, 제안된 「UI 토글 숨김/비활성」은 오히려 위험하다(아래 fixRisk).

**제안 수정**

⑧ (1-b) 블록에 `carryover?.useEstimatedAcquisition`이면 엔진과 같은 문구로 차단하는 검사를 추가하고, UI에서도 부담부증여일 때 환산 토글을 숨기거나 비활성화해 dead-end 입력을 없앤다(같은 블록이 이미 describeRequiredDonorFields와 1:1 사전 차단을 구현한다).

**수정 위험**

⑧ 추가(권장, 저위험): `validateBurdenedGiftAsset`은 `validateAssetAcquisition:118` 단 한 곳에서만 호출된다(grep 확인). (1-b) 블록에 `carryover?.useEstimatedAcquisition` 차단을 넣으면 general_building 부담부증여에도 함께 걸리는데, 그 조합도 엔진에서 같은 throw를 타므로(anchor `burdened-gift-carryover-d7a.anchor.test.ts`가 propertyType="general_building"으로 A7-6 검증) 과차단이 아니다. 현재 동작(null 통과)을 고정하는 기존 테스트는 없다 — E2E `e2e/transfer-burdened-gift-carryover-block.spec.ts`는 `useEstimatedAcquisition: false` 픽스처만 쓴다. 다만 그 spec의 CB-2(계산 도달)와 문구가 겹치지 않게 새 메시지를 골라야 한다.

🔴 UI 토글 숨김/비활성(제안 후반부)은 **하지 말 것을 권한다**: 사용자가 일반양도 상태에서 토글을 켠 뒤 양도 형태를 부담부증여로 바꾸면 store의 `carryover.useEstimatedAcquisition=true`가 남는데, 그 상태에서 토글을 숨기면 **플래그를 끌 유일한 입력 경로가 사라져** 500이 영구화된다(메모리 `feedback_ui_gate_removes_sole_input_path` · `feedback_new_asset_field_stale_sessionstorage_guard`). 또 CarryoverGiftBlock은 `CompanionAcquisitionCauseSection.tsx:305`와 `GeneralBuildingAcquisitionCards.tsx:628·723` 3곳에서 마운트되므로 한 곳만 고치면 일반건물 경로에 그대로 남는다(`feedback_transfer_result_view_is_not_one` 유형).

⚠️ 선례 주의: `lib/calc/transfer-tax-validate-gb-carryover.ts:60`은 부담부증여에서 **의도적으로 차단 메시지를 띄우지 않는다** — 초안이 ⑧에서 사유를 말하게 했다가 「당초 증여자 입력 요구」를 가로채 지원된 기능을 막았고 E2E CB-2 실패로 정정된 이력이 주석에 남아 있다. 새 차단은 반드시 (1-b) 안, 즉 기존 `missingCoDonorBasisLabel` 검사와 **같은 층위**에 두고 그보다 앞서지 않게 해야 한다.

부수 관찰(범위 밖·미검증): 환산 OFF로 되돌리면 `transfer-tax-validate-asset.ts:220`이 `donorAcquisitionPrice > 0`을 요구하는데, §159 경로에서 그 값이 실제로 쓰이는지는 확인하지 않았다. 만약 미사용이라면 "증여자 실거래가를 모르는" 사용자에게는 여전히 우회로가 좁다.

---

#### F42 · 다건 결과뷰가 평가·판정 13종과 감면 20여종 상세 카드를 하나도 렌더하지 않는다(엔진이 breakdown에 실어 보낸 값이 버려짐)

| | |
|---|---|
| 위치 | `components/calc/results/MultiTransferPropertyBreakdown.tsx:320` |
| 판정 | **PARTIALLY_CONFIRMED** |
| 심각도 | ~~medium~~ → **low** |
| 도달성 | reachable-via-ui |
| 탐지 축 | nbl / reductions / report |
| 조치 | 배치 11 |

**결함**

다건과 일괄은 같은 엔진(calculateTransferTaxAggregate)을 쓰고 pickValuationDetails·pickReductionDetails가 자산별 breakdown에 detail을 무조건 싣는다(aggregate.ts:550). 일괄 뷰는 공용 ValuationDetailCards·ReductionDetailCards로 렌더하는데(BundledAllocationCard.tsx:188-205) 다건 뷰의 건별 아코디언은 §77·§77의2·§77의3 3종만 렌더하고(:321-329) 두 공용 컴포넌트를 import조차 하지 않는다. 누락되는 것: 비사업용 토지 판정, 상가 환산 §164⑥, PHD, 다주택 중과 상세, §69 자경농지, §97 시리즈, §99의4, §98의9 등.

**실패 시나리오**

다건에 비사업용 토지 1건을 넣으면 세율군 배지 「비사업용 토지」만 뜨고 지목·기간분석·면적안분·판정 근거 조문 카드가 한 줄도 나오지 않는다(엔진 breakdown에는 nonBusinessLandJudgmentDetail이 실려 있다). §69 자경농지 감면도 「산출세액 − 감면」만 뜨고 감면대상 소득금액·편입일 안분·§133 한도 근거를 볼 수 없다. 단건·일괄에서는 모두 보인다.

**검증자 재현 실측**

엔진 probe(calculateTransferTaxAggregate, taxYear 2026, mock rates): A(토지 9억, 2015-01-01 취득, nonBusinessLandDetails 제공) → rateGroup="non_business_land", properties[0].nonBusinessLandJudgmentDetail 정의됨(키 22개: isNonBusinessLand·judgmentReason·criteria·areaProportioning·revenueTestDetail·surcharge·appliedLawArticles·judgmentSteps 등), isNonBusinessLand=true. B(토지 5억/취득 3억, 2010-06-01, reductions=[self_farming 10년]) → reductionAmount=33,560,000, reductionType="self_farming", selfFarmingReductionDetail={"qualifies":true,"reducibleIncome":140000000,"reducibleRatio":1,"legalBasis":"조특법 §69",...}. RTL 렌더 probe(PropertyBreakdownAccordion 2건 펼침, textContent 1,651자): "비사업용 토지 —" false / "자경농지 양도소득세 감면" false / "감면대상 양도소득금액" false. 동일 breakdown을 ValuationDetailCards+ReductionDetailCards에 넣으면 "비사업용 토지 —" true / "자경농지" true (755자). 세액은 양쪽 동일(A 산출세액 참고 264,020,000 — 표시 갭이지 계산 결함 아님).

**⚠️ 정정된 주장** (원 보고가 과장·부정확했던 부분)

다건 결과뷰의 건별 아코디언(components/calc/results/MultiTransferPropertyBreakdown.tsx:320-329)은 §77·§77의2·§77의3 3종만 렌더하고 공용 ValuationDetailCards·ReductionDetailCards를 import조차 하지 않아, 엔진이 pickValuationDetails/pickReductionDetails(transfer-tax-aggregate.ts:549-550)로 breakdown에 실어 보낸 산출근거가 화면에서 버려진다(단건 TransferTaxResultView:447·616, 일괄 BundledAllocationCard:188-205는 모두 렌더). 단, 실제로 유실되는 것은 계약 13+25종 전부가 아니라 **다건 입력 배관이 존재하는 부분집합**이다 — 비사업용 토지 정밀판정(+§14① 중과배제 사유)·다주택 중과 상세·소령 §155⑳ 임대주택 특례·1990 환산·§69 자경농지·§99의4·§98의9·§99의3·§98의x 소득공제형·상속 취득가액 의제·감면주택 주택수 제외 등. 원 finding이 든 상가 환산 §164⑥·PHD·이월과세·겸용/분리·수용·경매 평가·가업·장기임대 정밀 §97·신축주택 §99는 다건 API 클라이언트(lib/calc/multi-transfer-tax-api.ts)와 route 매핑(app/api/calc/transfer/multi/route.ts:100-270)에 해당 필드가 아예 없어 다건에서 생성 자체가 불가능하므로 이 결함의 대상이 아니다. 세액 영향은 0(자산별 단건 엔진 계산은 정상)인 표시 갭이다.

**제안 수정**

건별 아코디언에 `<ReductionDetailCards result={breakdown} calculatedTax={breakdown.refCalculatedTax} taxBase={breakdown.taxBaseShare} />`와 `<ValuationDetailCards result={breakdown} ... />`를 일괄 뷰와 같은 prop 규약으로 추가하고 기존 §77 3종은 중복 렌더되지 않게 흡수한다. 렌더러 목록과 aggregate-pickers 목록이 어긋나지 않도록 소스 수준 동기화 테스트를 둘 것.

**수정 위험**

① §77 3종 중복 — ReductionDetailCards도 같은 3카드를 렌더하되 prop 규약이 다르다(다건 현행은 aggregatedContext, 공용은 calculatedTax/taxBase). 그대로 추가하면 카드가 두 번 뜨고, 기존 것을 지우면 "합산 재계산 카드가 최종 감면세액을 낸다"는 다건 전용 안내(aggregatedContext)가 자산별 참고세액 기준 산식으로 **표시 내용이 바뀐다**. ② e2e/transfer-multi-nbl-business-recalc.spec.ts:138이 다건 결과 화면에서 `page.getByText("비사업용 토지")).toHaveCount(0)`을 단언한다(사업용 판정 케이스). NonBusinessLandResultCard의 사업용 분기는 "사업용 토지 —"를 쓰지만 바로 아래 judgmentReason 원문에 "비사업용 토지" 부분문자열이 들어갈 수 있다. 현행 카드가 `{open && ...}` 안에 있어 접힌 기본 상태면 통과하지만, 수정 시 카드를 open 게이트 **밖**에 두거나 spec이 아코디언을 펼치도록 바뀌면 이 spec이 빨개진다. ③ 인쇄 — MULTI_TRANSFER_PRINT_SECTIONS의 leaf "per-property"가 아코디언을 덮으므로 카드를 그 안에 중첩하면 leaf 추가는 불필요하나, 별도 섹션으로 빼면 ALL_LEAVES 동기화 테스트를 함께 갱신해야 한다. ④ 소스 동기화 테스트 __tests__/api/transfer.route.bundled-swallows-special.test.ts:318은 ValuationDetailCards.tsx 파일만 검사하므로 다건에 컴포넌트를 재사용하는 변경으로는 깨지지 않는다(반대로 다건 전용 렌더러를 새로 만들면 그 목록이 가드 밖에 놓여 같은 침묵 누락이 재발한다 — 재사용이 정답). ⑤ 현행 동작을 고정하는 테스트는 없다(다건 뷰에 상세 카드 부재를 단언하는 테스트 0건) → "의도된 설계"의 증거는 없다.

---

#### F45 · §95⑤ 용도변경 산출근거 카드가 단건 결과뷰에만 배선돼 일괄·다건에서 사라진다

| | |
|---|---|
| 위치 | `components/calc/results/transfer/ReductionDetailCards.tsx:52` |
| 판정 | **PARTIALLY_CONFIRMED** |
| 심각도 | ~~medium~~ → **low** |
| 도달성 | reachable-via-ui |
| 탐지 축 | lthd |
| 조치 | 배치 11 |

**결함**

엔진은 usageConversionDetail을 단건 결과에 담고(transfer-tax-lthd.ts:208-217 → transfer-tax.ts:707) 집계도 pickReductionDetails(aggregate-pickers.ts:74)로 자산별 breakdown에 옮긴다 — 데이터는 도달한다. 그러나 렌더러는 TransferTaxResultView.tsx:482-484 한 곳뿐이고, 일괄 결과가 쓰는 공용 ReductionDetailCards의 표시 대상 목록(:52-78)에 usageConversionDetail이 없다.

**실패 시나리오**

주 자산에 「건물 전체를 주택으로 용도변경(§95⑤)」 토글을 켜고(입력은 일괄양도에서도 노출 — AssetSectionBasic.tsx:203-207) companion을 함께 양도하면 BundledAllocationCard 경로로 흘러 「비주택 N년 표1 + 주택 N년 표2, 40% 한도」 산출근거 카드가 화면에서 사라진다(공제액 자체는 step에 남아 세액은 정상).

**검증자 재현 실측**

단건 POST /api/calc/transfer (PDF 사례30: 양도 15억/2026-01-27, 취득 6억/2018-02-10, 필요경비 7,300,000, 1세대1주택, 거주 36개월, 주거용 사용개시 2022-11-25) → status 200, transferGain 892,700,000 / taxableGain 178,540,000 / longTermHoldingDeduction 57,132,800 / longTermHoldingRate 0.32, result.usageConversionDetail = {residentialUseStartDate:'2022-11-25', nonHousingYears:4, housingYears:3, table1Pct:8, table2HoldingPct:12, residencePct:12, holdingRateCapped:false, residenceMonthsTrimmed:0}.
동일 입력 + companion(농지, 취득 1억/2010-01-01, 기준시가 2억) + totalSalePrice 18억 → status 200, mode "bundled", properties[primary].usageConversionDetail = 위와 **완전 동일한 객체**, longTermHoldingDeduction 57,132,800, isExempt false (세액 영향 0 확인).
RTL: render(<ReductionDetailCards result={{usageConversionDetail: 위 객체}} calculatedTax=26,177,520 taxBase=118,907,200 />) → container.innerHTML === "" (완전 미렌더).
validateStep(0..3) = null, null, null, null (차단 없음).
multi 경로: grep "nonHousingToHousingConversion|residentialUseStartDate" lib/calc/multi-transfer-tax-api.ts → 0 hits.

**⚠️ 정정된 주장** (원 보고가 과장·부정확했던 부분)

§95⑤ 용도변경 산출근거 카드(`UsageConversionDetailCard`)는 단건 결과뷰(`TransferTaxResultView.tsx:482-486`)에만 배선돼 있고, **일괄(bundled) 모드**가 쓰는 공용 `ReductionDetailCards`(`:53-78` hasAny 목록·`:82-178` JSX)에는 분기가 없다. 엔진은 값을 채우고(`transfer-tax-lthd.ts:206-217` → `transfer-tax.ts:707`) `pickReductionDetails`(`transfer-tax-aggregate-pickers.ts:74`)가 자산별 breakdown으로 옮기므로 데이터는 도달하지만 화면에서 사라진다. 추가로 일괄의 상세명세서도 잃는다 — `BundledAllocationCard.tsx:626`의 `adaptedResult`(`aggregateToFilingResult`, 같은 파일 :63-89)가 이 필드를 담지 않아 `DetailedStatementHelpers.ts:515-517`의 §95⑤ note가 일반 표2 문구로 대체된다. **다만 「다건(multi)」은 해당하지 않는다** — `lib/calc/multi-transfer-tax-api.ts`가 `nonHousingToHousingConversion`을 전송하지 않아 다건에서는 필드가 생성되지 않으며(미지원 입력 경로), 다건 뷰는 per-asset `lthdStep.formula`를 노출하므로(`MultiTransferPropertyBreakdown.tsx:105·108`) 값이 오면 산식 문구는 보인다. 세액 영향은 0(일괄 primary LTHD = 단건 57,132,800)이며 트리거는 「1세대1주택 고가주택 + §95⑤ 전환 + 2025-01-01 이후 양도 + companion 동반」으로 좁다 ⇒ 표시 갭(low).

**제안 수정**

ReductionDetailCards의 hasAny 목록과 본문에 usageConversionDetail 분기를 추가해 단건과 같은 컴포넌트를 재사용한다. aggregate-pickers 목록 ↔ 렌더러 목록 동기화 가드를 기존 회귀 테스트에 추가.

**수정 위험**

① **단건 중복 렌더 위험(가장 큼)**: `TransferTaxResultView.tsx`는 :483에서 `UsageConversionDetailCard`를 인라인으로, :616에서 `ReductionDetailCards`를 **둘 다** 렌더한다. `ReductionDetailCards`에 분기만 추가하면 단건에서 카드가 2번 나온다 — 인라인 렌더를 함께 제거해야 하는데, 그러면 카드가 `PrintSection`(:493 `phd` 직전 블록) 밖으로 이동해 **인쇄·PDF 선택 출력 그룹이 바뀐다**(`PrintSelectionPanel`/`TRANSFER_PRINT_SECTIONS` 영향). ② **prop 계약 확장 필요**: `UsageConversionDetailCard`는 `deduction: number`(LTHD 총액)를 요구하는데 `TransferReductionDetailSource`(Pick)에는 `longTermHoldingDeduction`이 없다 — probe에서 `deduction` 미전달 시 `TypeError: Cannot read properties of undefined (reading 'toLocaleString')`로 렌더가 죽는 것을 실측했다. `calculatedTax`·`taxBase`와 같은 **명시 prop** 방식으로 두 호출부(`TransferTaxResultView.tsx:616`, `BundledAllocationCard.tsx:188`)에 배선해야 한다(일괄은 `breakdown.longTermHoldingDeduction`). ③ 기존 테스트가 현행 동작을 고정하지는 않는다 — `ReductionDetailCards` 대상 렌더 커버리지 가드는 **없고**(`ValuationDetailCards`만 `transfer.route.bundled-swallows-special.test.ts:317-336`에 있음), `__tests__/tax-engine/transfer-tax/reduction-detail-cards.anchor.test.ts`는 엔진 populate만 본다. 계약↔picker 25종 동기화 테스트(같은 파일 :291-)는 목록 수만 세므로 렌더 추가에 영향 없다. ④ 제안된 "동기화 가드 추가"는 `ValuationDetailCards` 가드를 그대로 복제하면 되지만, 그 가드는 `result.<field>` 문자열 매칭이라 **`hasAny`가 아니라 마지막 `return (` 이후 JSX 범위로 좁혀야** 한다(가드 주석이 명시).

---


## 4. 수정 계획 — 11개 배치

배치는 **파일 충돌로 강제됐다**. 같은 객체 리터럴·같은 배열을 편집하는 findings는 한 배치·한 워커여야 한다.

생존 44건 중 33건을 11개 배치로 고치고, 6건(F03·F08·F16·F23·F27·F35)은 정답이 갈려 사용자 판단 대기, 5건은 하위 쟁점(F10·F11·F17·F22·F28) 결정 후 착수한다. 배치는 파일 충돌로 강제됐다 — 실측 결과 F12·F13·F39가 bundled-split-helpers.ts의 단일 객체 리터럴(:213-259)을, F02·F04·F05가 multi/route.ts base와 multi-transfer-tax-api.ts 반환 객체를, F01·F10·F32·F33이 transfer-tax.ts를, F10·F11이 lthd.ts L-1b 블록을, F41·F17이 validate.ts:126 SINGLE_ONLY 배열을, F42·F45가 ReductionDetailCards.tsx를 공유한다. 순서는 세 의존을 따른다: ⑫ Zod가 값을 막는 F40이 최우선(⑭ 매핑은 이미 있어 Zod만 열면 도달), 엔진 축(batch 3·6)이 companion 배관(batch 5 — F12가 여는 L-1b 표2 경로)과 표시 계층(batch 11)보다 먼저 확정돼야 anchor 기대값을 두 번 고치지 않으며, 다건·NBL·validate·GB 묶음은 파일이 겹치지 않아 병렬 가능하다. 전 건의 공통 위험은 「안전망 0」이다 — 현행 동작을 고정하는 테스트가 있는 것은 F11(3건)·F26(1파일)·F36(2건)뿐이고 나머지는 수정해도 red가 나지 않으므로, 각 배치의 완료 조건에 characterization/anchor 신설을 반드시 포함시켜야 한다.

| 배치 | findings | 파일 | 충돌 위험 |
|---|---|---|---|
| 1 | F40 | `transfer-tax-schema-sub.ts` · `transfer-tax-api-helpers.ts` | 낮음 |
| 2 | F02, F05, F04 | `route.ts` · `multi-transfer-tax-api.ts` | 높음(세 건이 동일 객체 리터럴 2개를 공유) |
| 3 | F32, F33, F01, F09, F11, F10 | `transfer-tax.ts` · `transfer-tax-lthd.ts` · `transfer-tax-exemption.ts` · `transfer-tax-aggregate-helpers.ts` · `transfer-tax-redevelopment.ts` | 높음(6건이 3파일 공유, 전 건 세액 변동) |
| 4 | F07, F34 | `transfer-tax-rental-housing-step.ts` | 중간(F08 미결이 같은 파일에 남음) |
| 5 | F14, F13, F39, F12 | `bundled-split-helpers.ts` · `route.ts` | 높음(4건이 동일 객체 리터럴·동일 타입 공유) |
| 6 | F19, F18, F20 | `transfer-tax-mixed-use.ts` · `transfer-tax-mixed-use-housing.ts` · `transfer-tax-mixed-use-commercial.ts` · `transfer-tax-mixed-use-helpers.ts` · `transfer-tax-mixed-use-fourpart.ts` · `transfer-tax-mixed-use-totals.ts` | 높음(단서 블록 공유) |
| 7 | F22, F21, F36 | `general-building-entry.ts` · `general-building-extension.ts` · `transfer-tax-validate-gb-sale.ts` · `GeneralBuildingSaleSplitSection.tsx` | 중간 |
| 8 | F24, F37, F25 | `transfer-tax-api-split.ts` · `transfer-tax-validate-split.ts` · `transfer-tax-finalize.ts` · `transfer-tax-helpers.ts` | 중간 |
| 9 | F29, F28, F30 | `period-criteria.ts` · `other-land.ts` · `farmland.ts` | 낮음 |
| 10 | F41, F17, F38, F26 | `transfer-tax-validate.ts` · `transfer-tax-validate-bg.ts` · `gift-tax-form-validate.ts` · `gift-burdened-transfer-api.ts` | 중간(F41·F17이 동일 배열) |
| 11 | F31, F43, F44, F45, F42 | `FilingFormTableHelpers.ts` · `FilingFormTableAggregateHelpers.ts` · `MultiTransferTaxResultView.tsx` · `MultiTransferPropertyBreakdown.tsx` · `ReductionDetailCards.tsx` · `TransferTaxResultView.tsx` | 중간(F42·F45가 ReductionDetailCards 공유) |

### 배치별 근거·순서

**배치 1** — F40

⑫가 값을 막는 유일한 층이라 최우선. 실측: bundled-split-helpers.ts:231-241에 transferCause·standardPricePerSqmAtTransfer·isAuctionTransfer·housingCompensationTotal 등 ⑭ 매핑은 이미 전부 있고, companionAssetSchema(schema-sub.ts:286-399) grep에 transferCause·isAuctionTransfer 0건 — ⑫만 열면 ⑭는 그대로 동작한다. ④ transferCause emit(buildAssetPayload)도 같은 배치에서 처리하되 isExprValuationEligibleAssetKind 게이트를 동일 적용해 상가 컴패니언 오발동을 막을 것. statute 정정: §164⑨2호(공매·경락)는 transferCause에 종속시키면 안 된다(isAuctionTransfer 단독 게이트). 두 파일을 다른 finding이 건드리지 않아 병렬 안전.

**배치 2** — F02, F05, F04

다건 3건은 전부 multi/route.ts base 객체(:101-268)와 multi-transfer-tax-api.ts buildPropertyPayload 반환 객체라는 동일 두 지점을 편집하므로 한 배치·한 워커 필수. Zod는 이미 3필드 보유(transfer-tax-schema.ts:138·139·148 실측)라 batch 1과 의존 없음 — 병렬 가능. 순서: F02(similarSalesValue 1줄, 3배 오산 즉시 제거) → F05(⑬ makeRatioed/ownershipRatio + ⑭ totalPropertyTransferPrice, buildTransferExpense 헬퍼 재사용·기준시가는 raw 유지) → F04(⑬ buildHouseholdSpecialPayload spread + isFirstTransferredInMerge, ⑭는 ruralHouse.acquisitionDate·unavoidable.resolvedDate에 toOptionalDate 필수). F04는 비과세 전환으로 나머지 건 세율 구간이 내려가므로 npm run test:transfer 전체 필요.

**배치 3** — F32, F33, F01, F09, F11, F10

transfer-tax.ts를 4건이 공유하고(F32 :620-728 구조분해·return / F33 :335 차손 조기반환 / F01 mh 노출 / F10 :485-486·:504-505), lthd.ts L-1b 블록(:89-127)을 F10·F11이, exemption.ts를 F09(:648)·F10(의제 근거 echo)이 공유 — 전이적으로 한 배치가 강제된다. 단일 워커가 싼 것→넓은 것 순으로: F32(키 2개, 세액 불변) → F33(차손 경로 emitPenaltySteps, 지방세 base에 신고불성실 넣지 말 것·aggregate 총액 동반 변동) → F01(AssetRecord에 MultiHouseSurchargeResult 보존, classifyRateGroup multiHouseByInput 좁히기, redevelopment.ts:210 4번째 인자) → F09(기산일만 resolveExemptionHoldingStartDate로 교체하고 !provisoRelaxesHolding 조건은 유지 — 전면 제거는 과다 비과세) → F11(3년 게이트·표1을 토지 축으로, 표시 holdingPeriod·step 산식 정렬) → F10(B안만: checkExemption 의제 결과 단일 술어, :110-111 복제본·transfer-tax.ts:485/504 동시 정렬, :243 isProratedSplit은 12억 안분 축이라 별개 판정). 전 건 안전망 0이라 anchor 신설이 수정의 일부.

**배치 4** — F07, F34

같은 파일 §155⑳ 특례 조기반환 블록 2건. F07(:297 S를 totalPropertyTransferPrice ?? transferPrice로 — burdenedGiftDenominator는 도달성 미확인이라 일단 제외) → F34(:411 amendmentDetail 부착 + finalize·재개발과 동형이 되도록 amendmentDetail.steps를 steps에 push). F34는 세액 불변, F07은 RH-A1/A2·B1/B2 지분 anchor 신설 필수(현행 RH anchor는 전부 단독소유 픽스처). ⚠️ 같은 파일의 F08(감면 침묵 드롭)과 :440 penaltyTax:0 부수는 미결이므로 이 배치와 동시 작업 금지.

**배치 5** — F14, F13, F39, F12

실측 확인: F13(§154⑧3호 3필드)·F39(ownershipRatio)·F12(residencePeriodMonths 상속)이 전부 buildCompanionEngineInputs의 단일 객체 리터럴(:213-259)을 편집하고 F14는 같은 파일 :459 — 한 배치·한 워커 강제. 순서: F14(mapCompanionReductions 삭제 → mapReductionsToEngine, CompanionRawAsset.reductions를 z.infer 유니온으로 재타이핑, as never 금지) → F13(3필드, 날짜는 toOptionalDate) → F39(ownershipRatio 1줄 + 타입 선언) → F12(landNature==="appurtenant_to_housing" 한정 상속 + route.ts:279-287·CompanionBuildContext 동반 수정). batch 3 뒤에 두는 이유: F12가 여는 L-1b 표2 경로를 F11·F10이 재정의하므로 엔진 축 확정 후 anchor를 심어야 기대값을 두 번 안 고친다.

**배치 6** — F19, F18, F20

F19(:278-279 provisoEligible)와 F18(swapToDirect 미반영)은 같은 STEP 7.5 단서 블록의 앞·뒤라 동시 수정 충돌이 확실하고 F20은 그 파트 세액을 소비한다. 순서: F19 먼저(&& !asset.useAppraisalSalesAcquisition — 감정·매매사례에서 단서를 끄면 F18이 다룰 조합이 줄고 129,309,577 과소가 즉시 사라짐) → F18(PHD 3갈래 + 4부분 어댑터 2개, 취득가액 슬롯을 0으로만 만들면 과다로 뒤집히므로 필요경비 주입과 세트, 상가분 잔액 흡수 동반 이동 주의, PHD+상속 :71-107은 provisoEligible=false라 손대지 말 것) → F20(statute 정정 반영: 버킷 합계 max가 아니라 파트 단위로 calcTax/compareWithClause1 위임). 안전망 0이라 P4·P7·B 시리즈 anchor 신설 필요.

**배치 7** — F22, F21, F36

F22·F21 둘 다 resolveGeneralBuildingSwap의 partAxis/addition 입력을 만드는 지점이라 한쪽만 고치면 다른 쪽 판정이 어긋난다. 순서: F22(partAxis를 모드 기준으로 싣되 반드시 !bothEstimated 게이트 — 무조건 싣으면 자산총액 분기 도달 불가라는 반대 방향 대형 회귀) → F21(3-way도 partAcq.estimatedDeduction 사용, appraisal/salesCase 파트 개산공제가 2-way와 어긋나지 않게. 최소 수정은 실가 파트 *Exp를 0으로 두고 가산은 swap addition 단일 경로에 위임) → F36(차단을 saleSplitMode 블록 밖으로 옮기되 apportioned는 제외해 stale 감정값 오차단 방지 / UI는 감정 옵션 하나만 disabled — 섹션 전체 blockedReason은 Q-4 anchor 3건을 깬다). 엔진 파일이라 select-test-scope상 전체 테스트 + GB E2E 대상.

**배치 8** — F24, F37, F25

토지·건물 split 축 3건. 파일은 다르지만 술어가 얽힌다 — F24가 selfOwns로 파트 전송 게이트를 좁히면 F37②의 초과 가드도 같은 파트별 술어(landAcqDirectActive/buildingAcqDirectActive)로 맞춰야 「UI 통과 ↔ validate 차단」 모순이 안 생기므로 한 워커가 함께 봐야 한다. 순서: F24(payload 게이트 2줄 + 매매사례 2필드, 기준시가 필드로는 확대 금지 — 비소유 토지 취득시 기준시가 카드는 의도적 렌더) → F37(early-return을 V9 직후로 좁히되 ③ directExpenses는 사문이라 실질은 ② 취득가액뿐, skipTotals·별개취득 제외는 유지) → F25(제보의 자산 플래그 역파생 대신 part-local 신호로 §114조의2 게이트·base를 splitDetail.building에 한정).

**배치 9** — F29, F28, F30

비사업용 토지 3건. 파일은 각각 다르지만 같은 judge 파이프라인을 공유하고 회귀 확인이 __tests__/tax-engine/non-business-land/ 한 번으로 끝나 한 배치. 순서: F29(GracePeriod[]→DateInterval[]로 mergeOverlappingPeriods 합집합 — 6 judge 13 호출지점에 자동 추종, gracePeriodDays echo는 merge 전후 차로 재정의하고 NonBusinessLandResultCard 라벨 점검) → F28(other-land.ts:339 게이트를 effectiveTaxType==="separate"로 정정 + other-land-building-multiplier.anchor.test.ts:52 base 리터럴·주석 정정) → F30(farmland.ts:81에 urbanIncorporationDate 기산점 전달, 편입일 없으면 미충족 처리·자동 통과 fallback 금지, PASS 대조군 anchor 동반, checkFarmlandDeeming ⑤2호는 손대지 말 것). F30은 헬퍼가 module-private·호출부 1곳이라 파급 없음.

**배치 10** — F41, F17, F38, F26

⑧ 명시 차단(「침묵 오산보다 명시 차단」 규약) 묶음. F41과 F17-단기가 transfer-tax-validate.ts:126 SINGLE_ONLY 배열이라는 동일 지점을 편집하므로 같은 배치 필수. F41은 술어를 assets.slice(1)로 좁혀 primary만 salesCase인 정상 조합을 살리고(현행은 어차피 400이라 기능 손실 없음), F17은 반드시 reductions.length>0 조건부여야 한다(자산종류 blanket 차단은 commercial_building 과차단 금지 선례·차단 validation 전체 E2E 회귀 메모리와 충돌). F38은 validate-bg.ts (1-b) 블록에 carryover?.useEstimatedAcquisition 차단 1건 추가(기존 missingCoDonorBasisLabel보다 앞서지 않게). F26은 증여세 폼 C-4 블록에 assumedDebtForGift ≠ leaseDeposit+mortgageAmount 불일치 차단 + gift-burdened-transfer-api.ts:122-126 허위 주석 정정(엔진·BurdenedGiftInfo 금지), gift-burdened-acq-stdprice-k4.test.ts 픽스처에 §66 칸을 채워 갱신.

**배치 11** — F31, F43, F44, F45, F42

표시 전용(세액 불변) 5건을 맨 뒤로 — 엔진 배치(3·6)가 채워 넣는 값(gbDesignatedLandDetail·replacementLandDetail 등)을 전제로 화면을 맞춰야 두 번 고치지 않는다. F42와 F45가 ReductionDetailCards.tsx를 공유하므로 같은 배치가 강제된다. 순서: F31(totalPenalty 합산, :726 지방세 base는 절대 함께 바꾸지 말 것) → F43(setNum ruralSurtax + 같은 화면 상세명세서 aggregateToFilingResult 누락도 동시 정정, 안 하면 서식↔명세서 새 불일치) → F44(refCalculatedTax로 교체하되 sibling과 동일한 typeof 가드 필수 — 없으면 구 IndexedDB 결과에서 페이지 전체 사망) → F45(ReductionDetailCards에 usageConversionDetail 분기 + TransferTaxResultView 인라인 렌더 제거로 중복 차단, deduction은 명시 prop, PrintSection 그룹 이동 확인) → F42(공용 ValuationDetailCards·ReductionDetailCards 재사용, §77 3종 중복 흡수, e2e transfer-multi-nbl-business-recalc.spec.ts:138 toHaveCount(0) 확인).


## 5. ⛔ 고치면 안 되는 것 (doNotFix 11건)

생존했지만 **제안된 수정 방향이 위험하거나 정책 위반**인 것들이다. 이 절은 다음 세션이 같은 제안을 반복하지 않도록 남긴다.

- F10의 A안(runHouseCountExclusionStep에 §155 의제 주택수 차감) — checkExemption이 householdHousingCount===2로 의제 분기를 게이팅하는 지점이 4곳(exemption.ts:63·101·644·718)이라 주택수를 깎으면 의제 판정 자체가 도달 불가가 되고 순수 1주택 경로로 조용히 갈아탄다. 회귀가 아니라 기능 파괴이며 12억 이하 구간에서는 테스트가 초록인 채로 다른 경로를 탄다. B안(checkExemption 결과 단일 술어)만 채택.
- F03이 제안한 base 교체(집계 결정세액 또는 Sum(refDeterminedTax)) — 실측상 ~1%(200,000) 과대를 49%(5,760,000→8,590,000) 반대 방향 오차로 바꾼다. 소득세법 §107①·국세기본법 §47의2⑤에 반한다(예정신고 무신고 base에 차손통산·합산 누진을 넣는 셈). §104⑤ refCalculatedTax 역안분 재제안 금지 항목과 인접하므로 그 방향 확장 금지.
- F23의 자산-수준 자본적지출을 §100② 후문으로 파트 안분하는 제안 — transfer-tax-acq-cost-swap.engine.design.md:151 금지 목록 · transfer-tax-validate-gb.ts:344-345의 조문 논거(§100② 후문은 「공통되는 취득가액과 양도비용」만 열거, 자본적지출 미열거) · 「자동 안분 fallback 금지」 정책 셋과 정면 충돌. 파트 칸(landDirectExpenses/buildingDirectExpenses)이 정본 입력 경로이므로 V-8식 validate 차단이 정답.
- F25의 deriveUseEstimatedAcquisitionFromParts 역파생으로 자산-수준 useEstimatedAcquisition을 되살리는 방식 — 소비 지점이 lib/tax-engine에만 35곳(split-gain deriveLegacyAcqMode의 자동 estimated 승격, helpers estimatedBase가 토지+건물 합계화, 상가 STEP 0.35·공익수용 평가·재개발). 과소(12,375,000)를 과대(10,000,000)로 바꿀 뿐이다. part-local 신호(general-building-route-cards.ts:118-119 패턴)로 대체.
- F20의 「단일세율 버킷 세액을 max(applyRate, 누진)로」 — statute 정정: §104① 후단의 단위는 「하나의 자산」이고 §104⑤2호 단서 합산은 「적용세율이 둘 이상」일 때만 허용된다. 40% 파트만 든 버킷은 단서 요건 미충족이라 본문의 자산별 계산이 정본이며, 누진의 볼록성 때문에 버킷 합산 비교는 조문보다 과다과세가 된다. 파트 단위 위임안만 채택.
- F38 후반부의 「부담부증여 시 환산 토글 숨김/비활성」 — store에 남은 carryover.useEstimatedAcquisition=true를 끌 유일한 입력 경로가 사라져 500이 영구화된다(feedback_ui_gate_removes_sole_input_path). CarryoverGiftBlock 마운트 지점이 3곳이라 한 곳만 고치면 일반건물 경로에 그대로 남는 문제도 있다. ⑧ 차단만 추가.
- F12 후반부의 「자산별 거주가 필요한 companion 주택은 buildAssetPayload에서 emit」 — 현재 no-op(ResidencePeriodSection이 Step4.tsx:543에서 primary에만 렌더, onChange도 i===0). 게다가 모든 companion에 일괄 상속하면 별개 주택 companion이 primary 거주기간을 물려받아 §154① 비과세·표2가 잘못 열린다 — landNature==="appurtenant_to_housing" 한정만 수행.
- F26의 BurdenedGiftInfo에 인수채무 명시 축 신설(「정공법」) — 설계가 「일부 인수」를 후속 PR 비범위로 선언한 기능 확장이고, lendingDepositTotal/mortgageDebtAmount 슬롯을 양도세 마법사 자체 경로(transfer-tax-api-burdened-gift.ts:107-108)와 §47③ 초과부담부 차단(burdened-gift-eligibility.ts:56-57)이 공유하므로 의미를 바꾸면 정상 경로가 깨진다(엔진 anchor 10여 파일이 현행 산식 고정). ⑧ 불일치 차단만.
- F42의 다건 전용 상세 카드 렌더러 신설 — 소스 동기화 가드(transfer.route.bundled-swallows-special.test.ts:317-336)가 ValuationDetailCards.tsx 파일만 검사하므로 별도 렌더러를 만들면 목록이 가드 밖에 놓여 같은 침묵 누락이 재발한다. 공용 컴포넌트 재사용이 유일한 정답.
- F31의 지방소득세 base(:726 localCalc)를 함께 변경 — 엔진 transfer-tax-finalize.ts:410과 집계 transfer-tax-aggregate.ts:399-400이 §114조의2분만 base로 쓴다(신고불성실·납부지연 제외 주석 명시). 함께 바꾸면 「지방세 산출세액 ≠ result.localIncomeTax」 새 불일치가 생긴다. F33의 차손 경로 수정에도 같은 제약 적용.
- F45에서 ReductionDetailCards에 분기만 추가하고 TransferTaxResultView.tsx:483 인라인 렌더를 남겨두는 것 — 단건에서 카드가 2번 렌더된다. 인라인 제거 시 PrintSection 그룹이 바뀌므로 TRANSFER_PRINT_SECTIONS/ALL_LEAVES 동기화 확인이 수정의 일부.


## 6. ⏸ 사용자 판단이 필요한 것 (원 11건 → **미결 5건**)

> 🔄 **2026-08-23 갱신** — 아래 11건 중 6건은 이후 결정·처리됐다. 미결은 **5건**이며
> 상세·선택지·금지사항은 [`docs/00-pm/transfer-review-2026-08-open-items.plan.md`](../00-pm/transfer-review-2026-08-open-items.plan.md)로 옮겼다
> (그 문서는 Wave 1~5 이후 file:line을 전수 재검증한 값을 쓴다 — 아래 원문의 인용은 리뷰 시점 기준이라 라인이 이동했을 수 있다).
>
> | | 항목 | 처리 |
> |---|---|---|
> | **미결 5** | F03 · F08 · F16 · F23 · F35 | 결정 대기 → 위 링크 문서 |
> | 결정·적용 4 | F10(§155 계열만) · F11(표1 축만) · F22(파트 단위) · F28(리터럴 정정) | Wave 2~4에서 적용 완료 |
> | 신규 기능 트랙 2 | F17(겸용·일반건물 감면) · F27(GB×부담부증여×이월과세) | 「정식 구현」 선택 — 리뷰 수정이 아니라 별도 기능 |

아래는 검증 단계가 생성한 **원문**이다(갱신하지 않는다 — 결정 시점의 근거 기록).

- F03(다건 자산별 가산세 base) — 축 확정 필요: (가) 예정신고 축 = 소득세법 §107① 산출세액(양도차익−LTHD−기본공제)×세율을 자산별로 재산출, (나) 신고단위(확정신고) 집계 축. statute 조사상 별지84호서식은 ⑯가산세를 세율구분/합계 축에만 두고 자산별 명세인 부표1은 ⑱에서 끝나 「자산별 가산세 칸이 위임입법에 존재하지 않는다」. (가)는 예정신고 기본공제 250만원을 시간순 첫 신고에 소진시키는 배분 로직을 새로 만들어야 하고(aggregate의 MAX_BENEFIT 배분 재사용 불가) 「자동 안분 금지」 정책과의 충돌 판단이 선행돼야 한다. (나)는 자산별 penaltyReason/filingType 입력 UI 회수를 수반한다. 현행 유지 시 편차 +200,000(0.93%) 과대. 착수 전 characterization anchor 필수(현재 안전망 0).
- F08(§155⑳ 특례 × 조특법 감면 병용) — (1) 특례 경로도 calcReductions 호출: statute상 §99·§99의3은 고가주택 배제 단서가 명문이라 0이 정답이고 §77·§97 시리즈·§97의5·§98의8·§99의2는 배제 문언이 없어 감면 여지가 실재하므로 조문별 게이트가 필요하다. 다만 감면대상 소득금액을 §160① 안분 후 12억 초과분으로 잡는 것 외에 차감형(STEP 4.6)을 §161 안분 前/後 어디에 얹을지 명문이 없고 §155⑳ 병용 가부를 직접 판단한 예규·심판례가 부존재다. (2) steps·warnings로 사유만 노출(세액 무변). 어느 쪽이든 현행 「무조건 0 + 무고지」는 정당화되지 않는다. (1) 채택 시 농특세 2-pass·가산세 base(:402 emitPenaltySteps)·§127⑦ 한도의 aggregate 전파까지 동반 설계가 필요하므로 결정 전 착수 금지.
- F16(컴패니언 이월과세) — (a) ⑫스키마+⑭매핑+④취득가액 3계층 정식 지원인가, (b) SINGLE_ONLY 명시 차단인가. (a)는 일괄 route가 transferPrice를 기준시가 안분값으로 덮은 상태에서 §97의2② 비교과세(STEP 0.475)가 돌게 되어 validate.ts:104-111이 기록한 부담부증여 「스케일 충돌 → 표시 필요경비 음수」와 같은 클래스의 위험을 연다(실측 없이 열면 안 됨). (b)는 SINGLE_ONLY가 some()이라 「자산 2개인데 primary만 carryover」인 현재 정상 조합까지 막히므로 술어를 slice(1)로 좁힐지 결정이 필요하다.
- F23(split 자산의 §97①3호 양도비) — 자산-수준 양도비가 split 경로에서 유실되고 landTransferExpense/buildingTransferExpense는 저장소 전체 grep 0건이라 어떤 경로로도 반영이 불가능하다(진짜 기능 공백). §100② 후문이 「양도비용」을 명시 열거하므로 general-building-swap.ts:196-211 헬퍼 공유는 적법하나, 파트 칸과 자산 칸이 동시 노출돼 이중 계상 위험이 있고 배타 안내가 없다. (가) 양도비만 안분 구현 + 이중 계상 방지 UI, (나) 자산-수준 입력을 차단하고 파트 칸 신설 중 선택 필요. 함께: transfer-tax.ts:668 capitalExpenditureForDisplay echo를 split에서 억제할지. 자본적지출 안분은 doNotFix 확정.
- F27(일반건물 × 부담부증여 × 이월과세) — (가) §159 분기 안에서 assertCarryoverDonorBasis+applyCarryoverDonorBasis 배선(K-18 anchor를 건드리지 않는 형태)인가, (나) assetKind==="general_building" 한정 ⑧ 명시 차단인가. (가)는 §97의2②3호 비교를 위해 GB aggregate를 2회 돌려야 하고(증축 no-op·NBL 증여세 이중 산입 전례 2건이 같은 파이프라인), assertCarryoverDonorBasis의 환산 throw 축(ct.useEstimatedAcquisition)과 GB의 bgAcquisitionMethod==="converted" 축이 달라 신규 400 위험이 있으며, §163의2② 후단 한도와 「증여세 상당액을 채무비율로 다시 안분할지」가 명문·선례 모두 부존재다. (나)는 종전 차단 문구가 부담부증여 ⑧를 가로채 CB-2를 깬 전례가 있어 술어를 좁혀야 한다. 함께 결정: legal-codes/burdened-gift.ts:59·61의 「부담부증여는 §97의2 대상 아님」 상수가 조문 근거 없는 정정 대상인지.
- F35(겸용 배율초과 비사토의 신고서 표시) — 어댑터(taxableGain·lthd에 nonBusinessLandPart 가산)만 고치면 현재 맞고 있는 「4열 합 = 합계」가 깨진다(FilingFormTableFinancials.ts:30-37의 housingExemptRatio가 비사토를 주택분 토지 비과세로 흡수 중). (가) 비사토 전용 열 신설, (나) 주택분 토지 열의 과세/비과세 분해 정정 중 어느 것을 정본으로 할지 결정 필요. 배율초과 픽스처 4열 anchor를 먼저 심어야 함(현행 anchor는 배율초과 없는 case14 계열뿐이라 회귀 감지 0).
- F11(하위 쟁점, batch 3 내부) — 1세대1주택 부수토지에서 「표1(토지 보유) vs 표2」 비교를 표2 전체(보유분+거주분)로 할지 보유분끼리만 할지에 관한 예규·심판례가 부존재(nts 48건·6건, 조세심판원 5건 전수). 이번엔 표2 미적용(다주택) 구간, 즉 §95④ 문리만으로 확정되는 표1 축·3년 게이트만 좁게 고치고 1세대1주택 하위 사례의 max 대입 방식은 이 결정 후로 미룰지 확인 필요. 인용도 정정 대상(서면인터넷방문상담5팀-1289는 max 근거가 아님 → 기획재정부 재산세제과-1183으로 갈음).
- F10(하위 쟁점, batch 3 내부) — 표2 의제 범위를 어디까지 열지: 영 §159의4 괄호는 「제155조·제155조의2·제156조의2·제156조의3 및 그 밖의 규정」을 열거한다. 이번 수정에서 §155①④⑤⑦⑧만 다룰지, §155의2(장기저당담보)·§156의2(주택+입주권)·§156의3(주택+분양권)까지 함께 열지 결정 필요. §155만 좁히면 나머지 축이 같은 결함으로 남고, 전부 열면 blast radius가 §95⑤ 혼합공제 진입 조건(lthd.ts:159-165)까지 넓어진다.
- F17(중기 범위) — 겸용주택에 감면을 실제로 구현할지. MixedUseTotalTax에 reductionAmount 필드 자체가 없어 어댑터·결과카드·신고서까지 번지는 신규 기능이고, §77 한도(연 2억)와 조특법 §127⑦ 중복배제를 주택분/상가분/비사토분 3파트에 어떻게 귀속시킬지 법령 설계가 선행돼야 한다(statute 정정: §69 자경농지는 조특령 §66④이 대상을 「농지」로 한정해 겸용·일반건물에 적용 여지가 없으므로 실제 대상은 §77·§77의2·§77의3 3종이며, 오히려 asset-kind-gate.ts:55가 §69를 과잉 개방하는 반대 방향 결함이 있다). 일반건물 쪽(general-building-route-cards.ts:115 reductions: [] → 실인자)은 저위험이므로 별건으로 먼저 할지도 함께 결정.
- F22(부수 결정, batch 7 착수 전) — 혼합 모드 + 양쪽 파트 자본적지출 공란 조합이 현재 자산총액 분기(312,933,515)로 떨어지는데 수정하면 파트 단위(345,210,000)로 32,276,485원 증가한다. general-building-swap.ts 헤더 표(:10-12 「자산 단위 자본적지출·양도비만 → 자산총액」)와 같은 헤더의 O-1 서술(:21-23 「자산총액 1회 판정은 실가 파트까지 단서에 끌어들여 요건에 반한다」)이 이 조합에서 정면 충돌하므로 어느 쪽이 정본인지 확정 후 착수.
- F28(부수 결정, batch 9 착수 전) — 게이트 리터럴만 정정(other-land.ts:339 → "separate")할지, enum을 separate_aggregate/separate_taxation으로 개명해 UI·엔진·테스트를 한 번에 맞출지. 개명은 재산세 엔진 관례(property.types.ts:62·63)와 일관되지만 IndexedDB 이력·sessionStorage에 저장된 기존 값의 의미가 바뀌므로 calc-wizard-asset-migrate 계열 마이그레이션이 필요하다. UI 라벨만 맞바꾸는 3안은 과거 계산 결과 재현 불가라 금지.


## 7. 미구현 → 백로그 (12건)

결함이 아니라 **애초에 만들지 않은 기능**이다. findings로 취급하지 않는다.

- §99·§98·§98의2·§98의7·§98의8의 거주자·국내소재·주택건설사업자 요건(reductions 축, income-deduction-router.ts:242 등 6키 isResident99·isHousingConstructionBusiness99·isResident988·isDomestic987·isResident982·isResident98) — 폼·UI·Zod·API 빌더 4계층 어디에도 필드가 없어 「끊긴 배관」이 아니라 애초에 만들지 않은 입력 축이다(엔진의 부적격 사유 코드는 도달 불가). 다만 엔진이 `?? true`로 납세자에게 유리하게 자동 후퇴하는 것은 저장소의 「미입력은 차단, 자동 fallback 금지」 원칙과 충돌하므로 백로그 우선순위를 높게 둘 것. 정답 배선은 §99의3(New993InputForm.tsx:350-359 → 폼 → Zod:191 → 빌더:135 → 엔진:208)이 이미 보여준다.
- DB 세율표의 다주택 중과 가산율 dead 데이터(rate 축, transfer-rate-seed-historical.ts:26) — surchargeRates.multi_house_*.additionalRate를 읽는 코드가 0건이고(엔진은 존재 여부만 게이트로 쓰고 실값은 multi-house-surcharge-rate-history.ts에서 가져온다) 현재 세액 영향도 0이라 결함이 아니다. 다만 1990-01-01 행이 2018-04-01~2021-05-31 구간에 대해 틀린 값(+20/+30)을 담고 있어, 누군가 시드를 정본으로 믿고 읽기 시작하면 즉시 과대과세가 되는 latent trap이다 — 주석·스키마로 「읽히지 않음」을 못박거나 값 필드를 제거하고 CLAUDE.md의 `transfer:surcharge:_default` 설명도 함께 정정할 것.
- 겸용주택 엔진의 감면·가산세 미지원(mixed 축) — calcMixedUseTransferTax 시그니처에 reduction 인자가 없고 MixedUseGainBreakdown에 penaltyBase가 없다. 23개 조문 라우터가 겸용에 배선되지 않은 것은 미구현이다. (별도로 merged에 남긴 route.ts:376 항목은 「입력 UI가 열려 있는데 침묵 무시된다」는 배관·게이트 결함에 한정한다.)
- 일반건물의 감면 미지원(reductions 축, general-building-route-helper.ts:222) — calculateGeneralBuildingTransfer가 priorReductionUsage만 받는다. 위와 같은 이유로 엔진 신설은 백로그, 침묵 무시 차단은 merged 항목에 포함.
- 다건(연간 합산)이 미지원으로 명시 차단하는 축들 — 차감형·세액감면형 11조문(multi-transfer-tax-validate.ts:19·96-101), 토지·건물 취득일 분리(:87-89), specialHouseExclusions(:98-100), 부담부증여(:54). 명시 차단이라 침묵 오산이 아니다. 반면 §155④⑤⑦⑧⑯⑱·지분율·매매사례가액은 차단 목록에 없어 결함으로 남겼다.
- 다건 route가 매핑하지 않지만 ⑬도 보내지 않는 키군 — transferCause·§164⑨ 공익수용 전 필드, presaleRights, regionCode, landNature, nonHousingToHousingConversion(§95⑤·⑥), totalPropertyTransferPrice, saleSplitMode 계열, extensionStdPriceAtAcquisition 등. 침묵 strip이 아니라 다건 미구현 기능이다(단, UI는 단건 마법사를 임베드해 그대로 보이므로 validateMultiSupportedMode 확장 검토 대상).
- 컴패니언 자산의 비사업용 토지 축 전무(nbl 축) — buildAssetPayload가 isNonBusinessLand·nonBusinessLandRaw를 emit하지 않고 컴패니언 카드에 토글 UI 자체가 없다(반대편 Zod:321·route:247은 준비돼 있다). 입력 경로가 없어 세액 변화 0.
- 비사업용 토지의 도달 불가 표면 — building_site 지목(UI·Zod enum 부재), nblVillaIsAfter20150101(엔진 미참조), 목장 기준면적 직접입력(form-mapper 미충전), 기타토지 무허가 건축물(§101① 단서) 입력 경로 부재, 기타토지 시간축 상태변화 미지원(항상 fullPeriod).
- 선택 출력(PrintSelectionPanel) leaf 커버리지(report 축) — TransferTaxResultView:531-620의 7개 카드군과 BundledAllocationCard의 안분표·§163⑨·swap·GB 3-way 표가 PrintSection 밖이라 선택과 무관하게 항상 인쇄된다. 설계(selective-print-6tax.ui.design.md §2.5)가 leaf를 5종으로만 열거한 미구현 범위. 겸용·주식 print 레지스트리의 pdf 채널 0종도 설계상 명시된 미구현.
- 지방세 감면세액 행 상수 0(DetailedStatementFormulaBuilders.ts:566 「미구현」 자인, 신고서 표 2곳 동일) — 지방세 감면 정책 자체가 미반영.
- dead 표면 재확인(세액 영향 0): apportionmentMethod(transfer-tax-schema.ts:332, 참조 0건), Zod Phase 1 stub 잔재 4개(unsold_98_5.priceReductionRate·new_99.region·new_99_3.region·unsold_98_3.region), 컴패니언 취득원인 carryover_gift용 UI 미제공 enum, extensionInfo.extensionArea(엔진 소비처 0), 일반건물 파트 감정·매매사례 모드(UI 2옵션만), buildMultiHouseTaxSimulation(프로덕션 소비자 0·§104 축 3번째 재구현), 일반건물 gbLandUnregistered·gbBuildingUnregistered(입력 UI 전무), 증여 결과뷰의 §159 상세·별지10호 미배선.
- 레거시 long_term_rental(구 §97의3 8년 50%)의 시한·등록일 게이트 부재(transfer-tax-reductions-calc.ts:298-303) — 신규 UI가 생성하지 않고 구버전 마이그레이션 경로로만 존재하며 부칙 존속이 R-1 보류 상태.


## 8. Low 13건 (문서화만, 미검증)

표시·일관성 계열이라 적대적 검증을 돌리지 않았다. 수정 시 개별 확인이 필요하다.

| 위치 | 내용 | 축 |
|---|---|---|
| `components/calc/results/transfer/DetailedStatementFormulaBuilders.ts:555` | 지방소득세 산출세액 base에 신고불성실·납부지연 가산세가 들어가 「산출 − 감면 = 결정」 등식이 화면에서 깨진다 | report/multi |
| `components/calc/results/transfer/DetailedStatementHelpers.ts:422` | 명세서·신고서의 표2 판정이 「거주 ≥ 24개월」 휴리스틱이라 1세대1주택 여부를 무시한다 | lthd |
| `components/calc/results/mixed-use/MixedUseResultCard.tsx:399` | §97②2호 단서 발동이 겸용 결과 카드에 표시되지 않고 나목 금액이 「개산공제(기준시가×3%)」로 오표기된다 | mixed |
| `lib/stores/calc-wizard-store.ts:578` | 사이드바 필요경비 합계가 겸용주택에서 자산-수준 자본적지출·양도비를 제외한다(주석이 사실과 반대) | mixed |
| `components/calc/results/transfer/SplitGainDetailSection.tsx:99` | 분리 결과 카드가 안분 전 양도차익과 안분 후 장특공제를 한 표에 섞어 산식이 자기 값을 못 만든다 | split |
| `lib/tax-engine/transfer-tax-split-gain.ts:183` | split 안분·환산이 부동소수 비율을 써 정수연산 정본 헬퍼를 우회한다(정확분할 입력에서 1원 과소) | split |
| `lib/tax-engine/transfer-tax-carryover.ts:522` | 이월과세 비교 카드 시나리오 B의 취득가액이 §159 안분 전 값이라 같은 칸의 양도차익과 산수가 맞지 않는다 | burdened |
| `lib/tax-engine/transfer-tax-carryover.ts:496` | 기준시가·환산 모드 부담부증여에서 「당초 증여자 자본적지출 +N원」이 카드에 표시되지만 세액에는 반영되지 않는다 | burdened |
| `lib/calc/gift-burdened-transfer-api.ts:141` | 증여세 폼 경로가 사전증여의 computedTax·giftTaxBase를 버려 §159 안 증여세의 §58 기납부세액공제가 항상 0이 된다 | burdened |
| `lib/tax-engine/non-business-land/housing-land.ts:141` | 면적안분 분기 7곳이 businessUseRatio에 비사업용 비율을 담아 결과 카드가 「사업용 비율」로 반대 값을 표시한다 | nbl |
| `lib/tax-engine/non-business-land/form-mapper-helpers.ts:147` | 농지전용 허가일 입력이 엔진에 도달하지 않고 UI 라벨 「3년 이내」는 법문에 없는 요건이다 | nbl |
| `components/calc/results/MultiTransferTaxResultView.tsx:93` | 다건 감면 한도 배지의 괄호가 닫히지 않아 「⚠ 한도 적용 (100,000,000」로 렌더된다 | report |
| `lib/pdf/ResultPdfDocument.tsx:245` | 양도세 PDF의 토지·건물 분리 내역이 변수 약어(Sum_A·Sum_F·P_A_est)를 그대로 노출한다 | report |


## 9. 기각 (1건)

### F06 · §155⑳ 거주주택 특례가 §154① 판정 정본을 쓰지 않고 raw 보유·거주 연수를 재구현해 특례를 오거부한다

**REFUTED** — 1) CITATIONS ARE REAL. `lib/tax-engine/transfer-tax-rental-housing-step.ts:286-288` does compute `holdYears = calculateHoldingPeriod(effectiveInput.acquisitionDate, effectiveInput.transferDate).years` / `liveYears = Math.floor(residencePeriodMonths/12)` and passes them at :296-302; `isPrhpScenarioAIneligible` at :56-65 repeats the same raw args; `eligibility.ts:214-231` gates on `residenceHoldYears < 2` (:222) and `residenceLiveYears < 2` (:227). No line drift worth noting.

2) NUMBERS REPRODUCE EXACTLY. Probe calling `calculateTransferTax` twice on identical input (양도 10억 · 취득 4억 · 취득 2025-01-01 · 양도 2026-03-01 · 거주 30개월 · householdHousingCount=1 · §154①2호가목 수용 proviso): OFF → isExempt=true, totalTax=0. ON → isExempt=false, totalTax=394,350,000 (determinedTax 358,500,000), step "장기임대주택 거주주택 비과세 특례 — 적용 불가 | 거주주택 보유기간 2년 미충족 (현재: 1년)". The §154⑧3호 동일세대 상속 통산 variant reproduces the same 0 ↔ 394,350,000 swing. So the engine-level mechanism is exactly as described.

3) REACHABILITY IS REJECTED — THIS IS THE DECIDING POINT. The finding never examines 동기화 지점 ⑧. `lib/calc/transfer-tax-validate-rental-exception.ts:156-176` mirrors the SAME raw thresholds and blocks first: I called `validateRentalHousingException` with the finding's own fact pattern and got, for BOTH variants, `"자산1: 장기임대주택 특례 — 거주주택 보유기간 2년(730일) 이상이 필요합니다. (취득일~양도일: 424일)"` (and, with residence < 24개월, the 거주기간 error). `app/calc/transfer-tax/TransferTaxCalculator.tsx:189-190` (`handleNext`: `if (list.length > 0) { failWithIssues(list); return; }`) hard-stops the wizard on issues. A user therefore never observes 394,350,000 — they get an explicit, correctly-worded block. The engine raw check and the ⑧ validate are a deliberate 3-layer mirror ("§155⑳ 거주주택 거주 2년 + 보유 2년 요건 — 침묵 실패 차단"), not a silent engine-only divergence. Only a hand-crafted POST to `/api/calc/transfer` bypassing the client validate reaches the number.

4) HALF THE CLAIM IS LEGALLY WRONG, AND THE PROPOSED FIX IS HARMFUL. I pulled 소득세법 시행령 현행본 (법제처 MST 286211) verbatim: §155⑳ 제1호 reads "거주주택: 보유기간 중 거주기간(…)이 2년 이상일 것" — this is §155⑳'s OWN requirement, distinct from the §154① 거주요건 (which only bites on 취득 당시 조정대상지역 and is waived by 단서). The finding proposes replacing BOTH args with `meetsOneHouseHoldingResidence`/`resolveExemptionResidenceMonths`. I probed that predicate directly: with `residencePeriodMonths: 0`, `wasRegulatedAtAcquisition: false`, 11-year holding it returns **true** (`meetsOneHouseResidenceRequirement` also true, via the `!wasRegulated` short-circuit at transfer-tax-exemption.ts:355). Adopting the fix would grant §155⑳ 특례 to a 거주주택 with ZERO months residence in a non-조정대상지역 — 전액 비과세 (0원) where the current code correctly taxes. That is a strictly worse over-exemption defect than the alleged over-taxation, and it contradicts the statute I verified. The finding itself concedes the §154⑧3호 통산 준용 is unverified ("예규 확인이 남아 있다"), i.e. it proposes a tax-changing edit on an admittedly unverified basis.

5) SIBLING PATH SUPPORTS ONLY THE 보유 HALF. `lib/tax-engine/transfer-tax-mixed-use.ts:110-113` documents this exact bug class being fixed for the pure §154① path ("종전 P3a는 보유 축만 따로 구현했다가 단서가 보유요건까지 면제한다는 점을 놓쳐 … 과다과세") and reuses the canonical predicate at :131-139. But that path carries no §155⑳제1호 overlay, so it is precedent for the 보유 axis only — not for the 거주 axis the finding lumps in with it.

6) FIX RISK. Beyond the over-exemption above, changing only the engine leaves ⑧ still blocking at 730 days → the engine would accept what the UI refuses to submit, i.e. a dead branch and the repo's forbidden "UI 통과↔validate 차단 모순" in mirror image. Any real fix must move ⑧, ⑤ hint text, and the engine together.

Conclusion: citation real and numbers real, but the asserted user-visible failure does not exist (blocked at ⑧ with a clear message), the 거주 half of the claimed defect is correct behavior compelled by §155⑳제1호, and the prescribed remedy would introduce a larger over-exemption bug. Item 3 and item 4 of the rebuttal checklist both reject it.


## 10. 이 리뷰가 닿지 않은 곳 (14건)

완전성 비평자가 지적한 사각지대다. **"리뷰했다"가 "전부 봤다"가 아니라는 기록**으로 남긴다.

- 축 개수 불일치 — 「14축」이라고 했으나 도착한 결과는 13축(core·rate·exemption·lthd·gb·mixed·split·burdened·nbl·reductions·multi·plumbing·report)뿐이다. 누락된 1축의 산출물이 이 배치에 없으므로 그 축이 무엇이었는지(주식양도세로 추정) 확인하고 별도 실행할 것. plumbing·multi 두 축이 「주식은 별 축」이라며 명시적으로 비켜 갔는데 그 축의 보고가 없다.
- 주식양도세 전체가 무감사 — lib/tax-engine/stock-transfer/ 33파일 10,234줄 + lib/calc/stock-transfer-tax-{api,validate,validate-exit,validate-foreign,validate-step2}.ts + app/api/calc/stock-transfer/** + StockTransferTaxResultView + e2e 15 spec을 어느 축도 열지 않았다. 최근 대량 변경 영역(#1218 §102②·§103, #1212·#1221 §118의6, #1222~#1228 국외주식 B/C 안분·별지84호 다종목)이 그대로 사각지대다.
- 취득가액·평가 축이 통째로 없다 — 어느 축의 filesReviewed에도 없는 엔진 파일: transfer-tax-expropriation-valuation.ts(436줄, §164⑨ — mixed 축이 「호출만 확인, 산식 미검증」 명시), transfer-tax-pre-housing-disclosure.ts(330, PHD §164⑦ 본체 — mixed·lthd는 결과만 소비), inheritance-acquisition-price.ts(373)+inheritance-acquisition-helpers.ts(279, §163⑨ 상속 취득가액 — split 축이 uncertain으로 남김), pre-1990-land-valuation.ts(331), building-standard-price.ts(497)+building-standard-price-helpers.ts(693), transfer-tax-acquisition-override.ts(107), bargain-transfer.ts(183, §101 저가양도), transfer-inheritance-exclusion.ts(134), transfer-tax-family-business.ts(312, §97의2④ 가업상속 — report 축이 결과 카드로만 언급), multi-parcel-transfer.ts(491)+transfer-tax-multi-parcel-branch.ts(179), transfer-tax-settlement.ts(75). 합계 약 3,700줄.
- 가산세·수정신고 축이 없다 — transfer-tax-amendment.ts(268)와 lib/calc/transfer-amendment-{entry,helpers}.ts를 아무도 읽지 않았고 transfer-tax-penalty.ts는 core가 부분 정독했을 뿐이다. 그런데 이 배치의 결함 3건(차손 조기반환 가산세 누락·§155⑳ amendmentDetail 누락·신고서 가산세액 누락)이 전부 그 경계에서 나왔으므로 결함 밀도가 높을 영역이다.
- lib/calc의 미커버 파일 — transfer-tax-validate-{expropriation,sec164,clause-a,gift-163-9,commercial-asset,usage-conversion}.ts, transfer-temp-two-house-judge.ts, transfer-estimated-preview.ts, transfer-163-9-base-date.ts, transfer-phrp-stdprice-link.ts, transfer-multi-load-entry.ts, transfer-tax-api-{houses,inheritance,residence,error-log}.ts, transfer-tax-error-format.ts가 어느 축의 filesReviewed에도 없다(lib/calc 143파일 중 transfer 관련 58파일).
- modality: E2E를 아무도 돌리지 않았다 — 13축 전원이 「Playwright 미기동」을 명시했다. e2e/에 transfer 관련 spec이 104건 있고 known-failures 16건 정책이 있으므로, 이 배치가 제안한 수정들이 기존 E2E를 깨는지 전혀 측정되지 않았다. 특히 UI 도달성 주장(다건 마법사가 단건 마법사를 임베드하므로 §155 토글·지분율·매매사례가액 라디오가 보인다 / 겸용에 감면 패널이 렌더된다)은 코드 경로 근거일 뿐 브라우저에서 확인되지 않았다 — merged 상위 결함 다수의 도달성이 여기에 걸려 있다.
- modality: 전체 회귀(npm test 1036파일 11,628테스트)를 돌린 축이 없다 — 대부분 __tests__/tax-engine/transfer/(123파일 1,080테스트)만 green 확인했다. 제안된 수정 중 공용 경로(transfer-tax-helpers·bundled-split-helpers·engine-input·ReductionDetailCards·FilingFormTable*)를 건드리는 것들이 상속·증여(property-valuation 공유, gift-burdened 경로)나 겸용·재개발에 미치는 회귀는 미측정.
- modality: 브라우저 수동 확인 0건, PDF 실제 생성 0건 — report 축의 PDF 결함 2건과 BundledAllocationCard의 aggregateToFilingResult가 PDF에 「장기보유특별공제 (0%)·산출세액 (0%)」로 인쇄되는지(report 축 uncertain)는 렌더 실행으로 확인되지 않았다.
- 법령 확인 modality가 축마다 다르다 — KoreanLaw MCP를 쓴 축은 lthd·nbl·exemption·reductions·burdened 5개뿐이고, core(국세기본법 §47의3 차손 시 신고불성실)·rate(§104⑤×겸용 파트)·mixed(§97②2호 단서 적용범위)·report(지방세법 §103의3 가산세 base)는 조문 원문 미확인 상태로 세액 주장을 냈다. 해당 4건은 verifyPriority를 must/optional로 표시했으나 별도 법령 전용 패스가 더 효율적이다.
- UI 레이어 커버리지 부족 — components/calc/transfer는 146파일 33,084줄인데 축별 filesReviewed 합계가 그 절반에 못 미친다. multi 축이 「Companion*.tsx 14파일 3,184줄과 asset-sections/ 10파일의 조건부 숨김 매트릭스를 전수 열거하지 못했다」고 명시했다 — 이 배치의 결함 유형 중 「UI 게이트가 유일 입력 경로를 제거」·「자산 종류별 조건부 숨김」이 반복 등장하므로 그 매트릭스 전수화가 다음 배치의 최우선 대상이다. app/calc/transfer-tax(15파일 4,719줄)의 Step 컴포넌트도 부분만 읽혔다.
- 결과 표시 6컴포넌트 중 편차 — StockTransferTaxResultView는 아무도 안 봤고 MixedUseResultCard·BurdenedTransferTaxResultCard는 부분만 봤다. lib/print leaf 4파일·ResultPdfDocument는 report 축만 정독했다. components/calc/results는 161파일인데 감면 계열 개별 카드 약 15파일의 산식 문구는 대조되지 않았다(report 축 자인).
- 재개발·재건축·입주권(지시대로 제외) 최종 패스에 전달할 것 — transfer-tax-redevelopment.ts(731)·redevelopment.ts(800)·redevelopment-split·types(803) 등 약 2,300줄+. 특히 rate 축이 transfer-tax-redevelopment.ts:210의 `calcTax(taxBase, parsedRates, input)`가 merged #1(다건 multiHouseSurchargeResult 미전달)과 동일한 4번째 인자 누락 형태라고 보고했다 — 최종 패스에서 반드시 확인.
- 각 축이 남긴 미검증 주장(정답 방향을 가르는 것들) — §155⑤ 혼인합가 10년의 연혁 적용(개정 전 양도분에 10년을 쓰면 과다 비과세), 주말·체험영농 사용의제 부칙 축(취득일 vs 양도일), getThresholdRatio 0.8 레거시 임계의 개정 전 본문, §127⑦에 소득금액차감형 과세특례(§98의8)가 포함되는지, §97의4 registrationDate>=2014-01-01의 근거, §155⑳ 거주요건에 §154⑧3호 통산이 준용되는지, 부수토지 표1·표2 max 비교를 현행 분리 표2에 어떻게 대입하는지. 이들은 별도 법령 패스로 일괄 처리하는 편이 축별 재조사보다 싸다.
- 안전망(테스트) 관점의 공백 — 13축 전원이 「기존 anchor가 이 결함을 보지 않는다」고 보고했고 실제로 1,080테스트가 전건 green인 상태에서 58건이 나왔다. 즉 이 영역의 테스트는 회귀 방어력이 낮다는 것이 이번 배치의 부수 결론이다. 다음 단계에서 mutation probe로 안전망 밀도를 실측(핵심 경로 무력화 → 반응 테스트 수)해 두면 수정 순서를 정하는 데 쓸 수 있다.


## 11. 재제안 금지 목록 검증

(해당 없음) 58건 전부를 ❌재제안 금지 목록·설계 원칙에 대조했으나 위반으로 폐기할 finding은 없었다. 경계에 있던 3건은 폐기 대신 suggestedFix에 금지선을 명시해 남겼다: ① 다건 가산세 base(multi/route.ts:317) — 「집계 결정세액을 taxBaseShare로 안분」 대안이 §104⑤ refCalculatedTax 역안분(금지)과 형태가 닮았으므로 가산세 base 축에 한정되며 §104⑤ 모델을 되살리는 방향으로 확장 금지임을 명시. ② 겸용 §104⑤2호 파트에 §104① 후단 적용(mixed-use-totals.ts:159) — 금지된 「잔여규정 독법 병기」가 아니라 기존 정본 compareWithClause1의 재사용임을 명시(다만 겸용 파트 버킷에 후단이 미치는지는 must로 표시). ③ split 자산-수준 양도비 §100② 후문 안분(transfer-tax-helpers.ts:273) — 금지된 「자동 안분 fallback」(미입력 임의 추정)이 아니라 general-building-swap.ts가 이미 구현한 법정 안분 규칙의 공유임을 명시하고, 대안으로 명시 차단도 병기. 또한 R4 지분 부담부증여·V-3·미등기×§104⑦ MAX·주택 파트별 세율·partialUsageChange 삭제·용도변경 차단·신고서 역안분·건물기준시가 접근 A를 재제안한 finding은 한 건도 없었다(burdened 축은 R4 차단이 정상임을 확인만 하고 올리지 않았다).

---

_1단계 13축 14에이전트 · 2단계 검증 56에이전트. 모든 수치는 워크트리에서 실제 명령·엔진 호출로 관측한 값이며 산식 추론값이 아니다._
