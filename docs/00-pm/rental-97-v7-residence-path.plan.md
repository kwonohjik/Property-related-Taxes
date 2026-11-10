# 거주주택 경로(§155⑳)에서 «계산에 반영되지 않는» §97의3·§97의4 선택이 §127⑦ 교차 차단을 거는가 (#3118 계획서 V-7)

- 상태: **구현 완료**(Q-1 a · Q-2 a · Q-3 a — 사용자 «모두 권장안으로») — 결과는 §7. 기준 master `708d7c5fb`.
- 출처: `docs/00-pm/rental-97-3-4-track-127-7.plan.md` §5 V-7(«거주주택 경로는 §97의3·§97의4를 반영하지 않음 고지로 처리 → 반영되지도 않는 선택 때문에 막는 위양성 가능, 수치로는 측정하지 않았다»).
- 도달 경로: ⑤ 감면 패널(배너)·⑧ `validateStep2Reductions`·⑫ `refineReductionTrack127_7`이 `findTrack127_7Conflict` 한 함수를 공유한다. 거주주택 경로의 입력(`rentalHousingException`)은 이 세 곳 어디에서도 읽지 않는다(§2.3).

## 0. 결론

| 항목 | 내용 |
|---|---|
| 경로를 켜는 입력 | 요청 `rentalHousingException.applyException === true`(폼 `asset.rentalHousingException.applyException`). ④는 자산 종류가 `housing`·`redevelopment_apt`이고 첫 자산이며 시나리오 A는 임대주택 1호 이상일 때만 싣는다. **선언만으로는 경로가 서지 않는다** — 엔진이 요건(1세대·미등기 아님·세대 구성·호별·거주)을 판정해 통과해야 `runRentalHousingExceptionStep`이 세액을 낸다(§2.1) |
| 이 경로가 반영하는 감면 | 세액감면형(§77·§69·§97 본문 등) · 차감형 7종(§99·§99의3·§98의3·§98의5~§98의8) · 5년 이내 하이브리드. **반영하지 않고 고지만**: §97의3·§97의4·§98의2(`lthdSpecialReductions`) · §98 · §99의2 5년 후·§98의4(`deferredReductions`)(§2.2) |
| 위양성 실재 | **있다 — 주택(`housing`) 종류·§155⑳ 성립 시.** §97의3/4 + §99의3(또는 §77) 조합을 ⑧·⑫가 모두 400(`조특법 §127⑦ 중복배제`)으로 막는데, 같은 입력의 ⑧⑫를 끄면 거주주택 경로가 §97의3/4를 계산에 넣지 않아 세액이 막힌 쪽 감면 단독과 같다(§3.2). 이중 적용은 일어나지 않는다 |
| 막힌 쪽 단독 반영 | §99의3 단독 총세액 **54,844,999** · §77 단독 **73,716,350** · §97의3 단독/§97의4 단독/감면 없음 모두 **84,029,000**(§3.2). 즉 사용자가 §97의3/4를 해제해야만 §99의3(−29,184,001)·§77(−10,312,650)이 세액에 들어간다 |
| 고지문의 해제 안내 | **없다.** 거주주택 경로 고지(`transfer-tax-rental-housing-reductions.ts:176-190`)는 «선택 자체를 재확인»만 말하고 §99의3 등을 언급하지 않는다. 더 근본적으로 이 고지는 **200일 때만** 뜬다 — 위양성 조합은 400이라 사용자는 경로 설명이 없는 일반 §127⑦ 문구만 본다(§3.3) |
| ⑧⑫의 경로 구분 가능성 | **선언 여부는 구분할 수 있고, 경로가 성립하는지는 구분할 수 없다.** 선언은 ⑧(`asset.rentalHousingException`)·⑫(`data.rentalHousingException`, 단 `addPropertyRefines` 파라미터 타입에 없음)에서 읽을 수 있다. 성립 판정은 `parsedRates`(DB 세율)가 필요한 엔진 함수라 Zod 단계(`route.ts:86` safeParse → `:156` preloadTaxRates)에 없다. 선언만 보고 풀면 **선언했으나 불성립** 입력이 일반 경로로 떨어져 이중 적용된다 — 총세액 **263,950,998**로 어느 한쪽 단독(336,336,000·378,191,000)보다 낮다(§3.4) |
| 결정 | **Q-1 a**(차단 기준 유지 + 현행 동작 고정) · **Q-2 a**(⑧⑫ 문구에 «거주주택 특례를 선언한 계산에서는…» 안내 추가 — 게이트 불변) 권장 |

## 1. 범위

- 대상: 1세대1주택 §155⑳ 거주주택 경로 `runRentalHousingExceptionStep`(`transfer-tax-rental-housing-step.ts`) → `applyRentalHousingReductions`와, 그 경로의 선택을 보지 못하는 ⑤·⑧·⑫ 교차 차단.
- 제외: 법적 판단(§97의3·§97의4가 거주주택 양도에 적용되는지)은 하지 않는다 — 엔진 고지문이 «임대주택에 붙는 특례»라고 적고 있다는 **코드 사실**만 쓴다. 겸용주택 거주주택 경로(`transfer-tax-mixed-use-rental-residence.ts`)·다건 `properties[]`·시나리오 B(직전거주주택보유주택) 측정은 제외(§5).

## 2. 코드 실독 [직접]

### 2.1 경로를 켜는 입력과 성립 조건

- 엔진 진입: `lib/tax-engine/transfer-tax.ts:502` — `effectiveInput.rentalHousingException?.applyException && !landOnlyBuildingOwnerOtherHousehold(effectiveInput)`이면 `runRentalHousingExceptionStep`을 부른다. 반환값이 있으면 `transfer-tax.ts:528`에서 즉시 return하고 STEP 3 이후(일반 경로)를 건너뛴다. `null`이면 일반 경로로 계속한다.
- `null`로 떨어지는 지점(`transfer-tax-rental-housing-step.ts`): 미등기(`:190`) · 1세대 아님(`:208`) · 세대 구성 초과(`composition.status === "exceeded"`) · 호별·거주 요건 불성립(`!rhe.applied`). 이 경우 감면은 일반 경로가 계산한다(§3.4 실측).
- 폼→요청: `lib/calc/transfer-tax-api-rental-housing.ts:30` — `!rh?.applyException`이면 미전송, `:37` `isRentalHousingExceptionApplicable(assetKind)`(`housing`·`redevelopment_apt`만), `:44` 시나리오 A + 임대주택 0호면 미전송. 첫 자산만 선언 가능(`lib/calc/rental-housing-exception-scope.ts` `canDeclareRentalHousingException` — `assetIndex === 0`).
- Zod: `lib/api/transfer-tax-schema-base-shape.ts:633` `rentalHousingException: rentalHousingExceptionSchema.optional()`.
- 법령(조회기준일 2026-11-10, 소득세법 시행령 MST 290841 시행 2026.10.1.): 영 §155⑳은 «제167조의3제1항제2호에 따른 주택(…이하 "장기임대주택")…과 그 밖의 1주택을 국내에 소유하고 있는 1세대가 각각 제1호와 제2호 또는 제1호와 제3호의 요건을 충족하고 해당 1주택(이하 "거주주택")을 양도하는 경우에는 국내에 1개의 주택을 소유하고 있는 것으로 보아 제154조제1항을 적용한다.» — 엔진의 «성립 판정»이 이 요건들을 코드로 옮긴 것이다.

### 2.2 이 경로가 반영하는 감면과 반영하지 않는 감면 (`transfer-tax-rental-housing-reductions.ts`)

| 구분 | 조문 | 처리 | 근거 |
|---|---|---|---|
| 세액감면형 | §77·§69·§97 본문/단서/§97의2·§97의5 등 | `calcReductions`(일반 경로와 같은 함수) + `applyReductionStatutoryCap` | `:92`(`taxCreditReductions`), `:104-:150` |
| 차감형 7종 | §99·§99의3·§98의3·§98의5·§98의6·§98의7·§98의8 | `transfer-tax-rental-housing-income-deduction.ts`가 고가주택 안분·장특 후 차감 | `RENTAL_HOUSING_INCOME_DEDUCTION_IDS`(`-income-deduction.ts:37-45`) |
| 하이브리드 5년 이내 | §98의3~§98의8 5년 이내 | 세액감면형으로 `calcReductions` | `:79-:81` `isHybridTaxAmount` |
| **반영 안 함 — 차감형 잔여** | §99의2 5년 후·§98의4 | `deferredReductions` 고지 | `:82-:89`, 고지 `:158-:164` |
| **반영 안 함 — §98** | §98 세율 20% | `flatRate98` 고지 | `:90`, `:158-:166` |
| **반영 안 함 — LTHD 계열** | **§97의3·§97의4·§98의2** | `lthdSpecialReductions` 고지 | `:102-:104`, 고지 `:172-:190` |

- 주석(`:93-:101`)은 §97의3·§97의4·§98의2①1호가 «감면세액이 아니라 장기보유특별공제율 자체를 바꾸는 조문이라 `calcReductions`에서 계산되지 않는다. 세액 반영은 아직 하지 않는다 — 이 경로의 거주주택 장특공에는 §97의3·§97의4 특례가 붙지 않는다»고 적는다.
- 고지문(`:176-:190` 중 `:180`): «선택한 감면 중 N건(장기보유특별공제 특례 — 조세특례제한법 §97의3①·§97의4①)은 이 계산에 반영되지 않았습니다. 이 경로가 양도하는 자산은 «거주주택»이고 §97의3·§97의4는 «임대주택»에 붙는 특례이므로 선택 자체를 재확인하시기 바랍니다.» — 다른 감면(§99의3 등)과의 관계나 해제 시 효과는 적지 않는다.
- 조특법 §97의3 본문(조회기준일 2026-11-10, MST 284389, 시행 2026.9.18.): ①은 «…등록한 후 다음 각 호의 요건을 모두 갖추어 **그 주택을 양도하는 경우** … 임대기간 중 발생하는 양도소득에 대해서는 「소득세법」 제95조제1항에 따른 장기보유 특별공제액을 계산할 때 같은 조 제2항에도 불구하고 100분의 70의 공제율을 적용한다»이다. **엔진 고지문의 «임대주택에 붙는 특례»가 이 문언과 어떤 관계인지의 법적 판단은 하지 않는다**(§1). §97의4 본문은 이번에 다시 읽지 않았다(앞선 계획서 인용).

### 2.3 ⑤·⑧·⑫는 경로를 읽지 않는다

- ⑧ `lib/calc/transfer-tax-validate-reductions.ts:131-:150`: `primaryAcquisitionDateOf(asset)`·`form.transferDate`·`asset.reductions`로 `findTrack127_7Conflict`만 호출한다. 이 파일에는 `rentalHousingException` 참조가 없다(grep 0건).
- ⑫ `lib/api/transfer-tax-schema-reduction-refines.ts:54-:80` `refineReductionTrack127_7(reductions, acquisitionDate, transferDate, ctx, path)`: 파라미터에 거주주택 선언이 없다. 호출처 2곳: `transfer-tax-schema-refines.ts:166`(본문), `transfer-tax-schema.ts:202`(컴패니언).
- ⑤ `components/calc/transfer/UnifiedReductionPanel.tsx:378-:396`: `reductions`·`acquisitionDate`·`transferDate`만 보고 배너를 낸다(`rentalHousingException` 참조 0건).
- 문구: `track-127-7-message.ts`의 `track127_7ConflictMessage(conflict)` 한 함수를 ⑧·⑫가 공유한다. 경로 관련 문구는 없다. (`income-deduction-router.ts`와 별개 파일이다.)

### 2.4 ⑧⑫가 경로를 구분하려면

- 선언: ⑧은 `asset.rentalHousingException?.applyException`(+`canDeclareRentalHousingException(asset.assetKind, ai)`)으로 읽을 수 있다. ⑫는 `addPropertyRefines` 호출 시점의 `data`에 런타임 필드가 있으나(`base-shape.ts:633`) 파라미터 타입(`transfer-tax-schema-refines.ts:66-:`)에는 선언돼 있지 않아 타입 추가가 필요하다. 같은 패턴이 `transfer-tax-schema-sub.ts:24`(`data: { rentalHousingException?: unknown }`)에 이미 있다. 컴패니언 자산은 선언을 보내지 않는다(첫 자산만).
- 성립: `resolveRentalResidenceComposition(effectiveInput, parsedRates, …)`(`transfer-tax-rental-residence-composition.ts:164`)가 `parsedRates.oneHouseSpecialRules`(DB 세율 로드)를 쓴다. 호출처는 전부 엔진 안(`transfer-tax-rental-housing-step.ts:227` 등)이고 `lib/calc`(⑧)에는 없다. Zod는 `route.ts:86`(safeParse)이 `:156`(preloadTaxRates)보다 앞이다. 따라서 ⑧⑫는 성립 판정을 **할 수 없다**(코드 사실).

## 3. 측정 [직접]

### 3.1 방법

throwaway probe(`__tests__/api/zz-probe-v7.test.ts`, 커밋하지 않고 삭제). 폼 → `captureBody`(④⑬) → route POST(⑫⑭ → 엔진), 같은 폼으로 `validateStep2Reductions(2, form)`(⑧). 세율표는 route 폴백. 입력: 주택, 취득 2002-09-01, 양도 2025-08-01, 양도가 2,000,000,000, 취득가 400,000,000(실지), 거주 60개월, 1세대·주택 수 1, 임대주택 1호(등록 2015-06-01·임대 120개월). 거주주택 경로 성립 시료의 시나리오는 `RH-A2`(12억 초과 고가주택, 과세대상 양도소득금액 256,000,000).
- §99의3: 계약 2002-05-01(법률 제6762호 부칙 §29① 적용 시료 — `nh37-rental-155-20-new-housing-income-deduction.anchor.test.ts`와 같은 시료), 주택 유형 `apartment`. §77: 현금 500,000,000·고시 2023-01-01. §97의3/4: 등록 2014-01-01 등 V-6 프로브 틀.
- «⑧⑫ 끔»은 프로브 한정으로 `findTrack127_7Conflict`가 null을 돌려주게 mock한 것이다(엔진은 이 함수를 호출하지 않는다 — grep 확인). 이 mock은 측정 장치일 뿐 제품 코드가 아니다.
- 비교 대조: 같은 폼에서 `applyException`을 끈 일반 경로(N) · 선언했으나 거주 0개월이라 불성립인 경로(U).

### 3.2 거주주택 경로(성립) — 조합별 ⑧·⑫와 엔진 값

| 사례 | 선택 | ⑧ | ⑫(route) | ⑧⑫ 끔(엔진) 총세액 |
|---|---|---|---|---|
| R0 | 감면 없음 | 통과 | 200 · 84,029,000 | 같음 |
| R1 | §99의3 단독 | 통과 | 200 · **54,844,999**(산출 43,963,333 · 농특세 6,485,333) | 같음 |
| R2 | §77 단독 | 통과 | 200 · **73,716,350**(감면 11,458,500 · 농특세 2,291,700) | 같음 |
| R3 | §97의3 단독 | 통과 | 200 · **84,029,000** + «반영되지 않았습니다» 고지 | 같음 |
| R4 | §97의4 단독 | 통과 | 200 · 84,029,000 + 같은 고지 | 같음 |
| R5 | §98의2 단독 | 통과 | 200 · 84,029,000 + §98의2 «반영되지 않았습니다 — 확인 필요» | 같음 |
| R6 | §97의3 + §99의3 | **§127⑦ 문구** | **400** `reductions.1.type` 같은 문구 | 200 · 54,844,999(= R1) + 고지 |
| R7 | §99의3 + §97의3 | 〃 | **400** `reductions.0.type` | 200 · 54,844,999 |
| R8 | §97의4 + §99의3 | 〃 | **400** | 200 · 54,844,999 |
| R9 | §97의3 + §77 | 〃 | **400** | 200 · 73,716,350(= R2) + 고지 |
| R10 | §97의4 + §77 | 〃 | **400** | 200 · 73,716,350 |
| R11 | §98의2 + §99의3 | 〃 | **400** | 200 · 54,844,999 + §98의2 고지 |
| R12 | §97의3 + §97의4 | `§97의3②` 문구 | **400**(§97의3②) | 같은 400(명문 배제라 ⑧⑫ 끔과 무관 — mock 대상 아님) |

- 모든 400의 ⑧ 문구와 ⑫ `fieldErrors` 문구는 일치했다(R6~R11 전부 `조특법 §127⑦ 중복배제 …`).
- R6~R11(⑧⑫ 끔) 값은 각각 막힌 쪽 감면 단독(R1·R2)과 **정확히 같다.** 이중 적용이 아니다. 그러나 ⑧⑫는 이 입력을 막는다 → 위양성.
- 차액(사실 수치): 감면 없음(R0/R3) − §99의3 단독(R1) = 29,184,001. 감면 없음 − §77 단독(R2) = 10,312,650.
- R12는 위양성 문제가 아니다(법 §97의3② 명문 쌍). 거주주택 경로가 §97의3/4를 계산하지 않아도 ⑧⑫는 그대로 막는다 — V-6(#3126) 범위.

### 3.3 위양성의 실제 피해와 안내

- 사용자 흐름: R6 선택 → ⑧ 또는 route가 400 → 문구는 «둘 중 하나만 선택하세요 — … 각각 선택해 계산한 뒤 총 납부세액을 비교하면 됩니다»(`track-127-7-message.ts`). 따라 하면 §97의3 단독 84,029,000(고지: 반영되지 않음) · §99의3 단독 54,844,999를 얻는다. **세액이 조용히 틀어지지는 않는다**(400이 막고 비교 방법이 안내된다).
- 피해: ① §99의3을 적용하려면 §97의3/4를 해제해야 하는데 400 문구는 이 경로에서 §97의3/4가 세액에 들어가지 않는다는 사실을 알리지 않는다. ② 거주주택 경로 고지문(`:176-:190`)은 200일 때만 보이므로 이 사용자에게 도달하지 않는다. ③ 사용자가 §99의3을 해제하고 §97의3을 남기는 선택을 하면 감면 없음과 같은 84,029,000이 나오고 고지가 «재확인»을 권한다.
- 고지문의 해제 안내: 없음(위 문구 전문 실독). 안내 대상 조합(§99의3·§77과의 병용)은 문구에 없다.

### 3.4 선언했으나 불성립(U) — 일반 경로로 떨어진다

| 사례 | 선택 | 경로 | ⑧ | ⑫(route) | ⑧⑫ 끔 총세액 |
|---|---|---|---|---|---|
| U0 | 감면 없음 | 일반(거주 0개월 → `rheApplied:false`) | 통과 | 200 · 480,628,500 | 같음 |
| U1 | §97의3 단독 | 일반 — §97의3 **적용**(장특 693,333,333) | 통과 | 200 · 378,191,000 | 같음 |
| U3 | §99의3 단독 | 일반 — §99의3 **적용**(감면대상 373,333,333) | 통과 | 200 · 336,336,000 | 같음 |
| U2 | §97의3 + §99의3 | 일반 | §127⑦ 문구 | **400** | 200 · **263,950,998**(§99의3 302,222,222 + §97의3 693,333,333 **동시 적용**) |

- U2(⑧⑫ 끔) 263,950,998은 U3(336,336,000)보다 72,385,002, U1(378,191,000)보다 114,240,002 낮다 — NH-41·#3118이 막으려던 이중 적용이다.
- 같은 폼(`applyException: true`)에서 R6은 위양성, U2는 정당한 차단이다. 두 사례의 요청 본문 차이는 거주 개월 수뿐이다. **선언 여부만으로 ⑧⑫를 풀면 U2가 이중 적용으로 새어 나간다.** 성립 여부는 엔진만 안다(§2.4).
- 부가 확인: 선언을 끈 일반 경로 N1(§97의3 단독) 총세액 75,111,666 · N3(§99의3 단독) 54,844,999 · N4(§97의3 + §99의3) 400. N3 = R1이다(같은 고가주택 안분·장특·차감 결과 — NH-37 anchor가 이미 고정).

### 3.5 재개발·재건축 완공 아파트(`redevelopment_apt`) 거주주택 선언 — 엔진 단위 1건

`redevelopment_apt`도 선언 가능 종류이나 `transfer-tax-redevelopment-apt-exemption.ts:147`이 §155⑳을 **판정만** 하고 감면은 재개발 분기(Step A.8b, `transfer-tax-redevelopment-steps.ts:365-`)가 `input.reductions`로 계산한다. 엔진 직접 호출(mock 세율, 양도가 2,500,000,000, 거주주택 선언 A + `rental_97_3` 적격):

| 사례 | 총세액 | 비고 |
|---|---|---|
| RD2 선언 A · 감면 없음 | 223,713,466 | `장기임대주택 거주주택 비과세 특례` 단계 있음 |
| RD3 선언 A · §97의3 | **173,953,401** | §97의3 장특 714,293,234 **반영**(미반영 단계 없음) |

→ 완공 아파트에서는 §97의3이 계산에 들어가므로 §127⑦ 차단이 위양성이 아니다. 거주주택 «경로»를 하나로 뭉뚱그릴 수 없고, 자산 종류(`housing` vs `redevelopment_apt`)로 갈린다. 1건·mock 세율·route 미경유이므로 일반화하지 않는다(§5).

## 4. 결정 (사용자 «모두 권장안으로»: Q-1 a · Q-2 a · Q-3 a)

### Q-1. ⑧⑫(⑤)의 차단 기준을 경로에 맞춰 풀 것인가

| 안 | 내용 | 비용·위험 |
|---|---|---|
| **a (권장)** | 현행 유지. 위양성을 **고정하는 route anchor**를 추가한다(R6·R9 → 400, ⑧⑫ 문구 일치, U2 400, 단독 값). 코드 변경 없음 | 사용자는 §97의3/4를 직접 해제해야 한다(Q-2로 보완). 풀면 U2(이중 적용 263,950,998)가 새는데 이를 막을 판정이 ⑧⑫에 없다 |
| b | 선언(`applyException` + `housing` + 첫 자산)이 있으면 §97의3/4를 §127⑦ 분류에서 뺀다 | **U2가 새어 나간다**(§3.4). 선언과 성립이 다르고 성립은 엔진만 안다(§2.4). `redevelopment_apt`는 선언해도 §97의3/4가 반영되므로(§3.5) 자산 종류 분기도 필요. 공유 코드 `findTrack127_7Conflict` 시그니처 변경 → ⑤·⑧·⑫ 호출처 3곳 동시 수정 |
| c | route가 엔진 결과를 본 뒤 «경로 불성립 + 충돌»일 때만 400 | 엔진은 400을 내지 못하는 구조(Zod 검증 → 엔진). route에 사후 검사를 새로 두어야 하고 ⑧(클라이언트)과 ⑫가 갈린다 — ⑧↔⑫ 정합 원칙 위반. 비용 대비 효과 없음 |
| d | 엔진이 불성립으로 일반 경로에 떨어질 때 §97의3/4와 다른 감면 중 하나를 고른다 | 조문이 «거주자가 선택하는 하나»(조특법 §127⑦, 조회기준일 2026-11-10 실독)라 자동 선택은 불가. 이 저장소에서 재제안 금지로 확정된 방향(MEMORY.md 「V-6 임대 범주 안 쌍 … 자동 선택 안 함」) |

권장 a의 근거: ① 위양성은 «막다른 길»이 아니다 — 한쪽을 해제하면 통과하고 세액이 조용히 틀어지지 않는다(§3.3). ② 풀 수 있는 기준(선언)이 불성립 사례를 이중 적용으로 흘린다(§3.4). ③ 완공 아파트 경로에서는 차단이 맞다(§3.5). 근거 없이 게이트를 움직이지 않는다.

### Q-2. 400 문구에 경로 안내를 추가할 것인가

| 안 | 내용 | 비용·위험 |
|---|---|---|
| **a (권장)** | ⑧·⑫가 «거주주택 특례를 선언한 계산(첫 자산·`housing`)»이고 충돌 쌍에 §97의3/4가 있을 때 문구 끝에 안내를 붙인다. 예: «장기임대주택 거주주택 특례(소득세법 시행령 §155⑳)가 성립하는 경우 이 경로는 §97의3·§97의4를 세액에 반영하지 않습니다(성립하지 않으면 일반 경로에서 반영) — 반영되지 않는 쪽을 해제하면 다른 감면이 계산됩니다.» 게이트·차단 기준 불변 | ⑧⑫가 선언 여부를 알아야 한다: ⑧은 `asset` 접근 가능, ⑫는 `addPropertyRefines` 파라미터 타입에 필드 추가 필요. 문구는 `track-127-7-message.ts`에서 선택 인자로 한 곳에 둔다 — ⑧↔⑫ 문구 일치 anchor(`toContain(m8)`)가 그대로 지킨다 |
| b | 하지 않는다(Q-1 a의 anchor만) | 위양성 사용자에게 경로 사실이 전달되지 않는다 |
| c | 거주주택 경로 고지문(`:176-:190`)에 «§99의3 등과 병용 가능» 문구 추가 | 고지는 200일 때만 뜬다 — 위양성은 400이라 이 문구를 보지 못한다. 효과 없음 |

### Q-3. ⑤ 패널 배너에도 같은 안내를 둘 것인가

Q-2 a가 승인되면 패널은 이미 `asset`을 받으므로 같은 인자를 넘길 수 있다. 배너는 UI 변경이라 Playwright 1건이 필요하다. 권장: **Q-2 a와 함께** 한다(⑤에서 먼저 보이면 400까지 가지 않는다). 승인되지 않으면 보류.

## 5. 미검증 · 확인 필요

- V-1: 시나리오 B(직전거주주택보유주택)와 §154⑩ 표준 경로에서 같은 동작인지 — `applyRentalHousingReductions`가 A·B 공용이라는 코드 읽기뿐 측정하지 않았다.
- V-2: 겸용주택 거주주택 경로(`transfer-tax-mixed-use-rental-residence.ts`)와 다건 `properties[]`·컴패니언의 ⑫ 도달은 측정하지 않았다. `lthd-special-notice-three-paths.anchor.test.ts`(CB-02-M1)가 겸용에서 §97의3 선택 시 미반영 고지를 고정하나 거주주택 선언 시료는 아니다.
- V-3: §3.5는 1건(mock 세율·엔진 직접·route 미경유)이다. 완공 아파트 선언 시료가 정말 §155⑳ 성립 경로를 탔는지는 `장기임대주택 거주주택 비과세 특례` 단계 존재로만 확인했고, ⑧⑫ 도달은 측정하지 않았다.
- V-4: §3.2 R-시료는 한 입력(RH-A2, 5년 후 §99의3, 2003.1.1. 전 계약)이다. §99의3 5년 이내·§98의3~ 하이브리드·§99 조합은 측정하지 않았다(분류 경로가 같다는 것은 코드 읽기).
- V-5: 엔진 고지문 «§97의3·§97의4는 임대주택에 붙는 특례»의 법적 타당성은 판단하지 않았다. §97의3 본문(§2.2)은 읽었고 §97의4 본문은 이번에 다시 읽지 않았다. 직접 재결·해석례는 #3118 V-1과 같이 없다.
- V-6: 브라우저(⑤ 배너·마법사 흐름) 수동 확인은 하지 않았다. ⑧은 `validateStep2Reductions(2, form)` 직접 호출이고 전 단계 `collectStepIssues`는 돌리지 않았다.
- V-7: 저장된 이력을 다시 열 때(#3118 V-4)의 거주주택 선언 입력 동작은 측정하지 않았다.

## 6. 구현 계획 (Q-1 a · Q-2 a · Q-3 a — 실행함)

Q-1 a · Q-2 a · Q-3 a 기준.

1. 테스트 1파일(route + ⑧): R6·R9·R10 → ⑧ 문구 = ⑫ 문구(400) · R1·R2·R3 단독 200과 총세액(54,844,999 · 73,716,350 · 84,029,000) · U2 400 · N 대조. 시료는 §3.1 그대로(픽스처 기본값이 게이트 결함을 가리지 않도록 `houseType993`·계약일을 명시).
2. 문구(Q-2 a): `track-127-7-message.ts`의 `track127_7ConflictMessage(conflict, opts?)`에 선택 인자 추가. ⑧(`transfer-tax-validate-reductions.ts:150`)은 `asset.rentalHousingException`·`canDeclareRentalHousingException`으로, ⑫(`transfer-tax-schema-reduction-refines.ts:71`)는 `refineReductionTrack127_7`에 선언 인자를 추가하고 호출처 2곳(`transfer-tax-schema-refines.ts:166` · `transfer-tax-schema.ts:202` — 컴패니언은 선언 없음)과 `addPropertyRefines` 파라미터 타입을 맞춘다. 3중 패턴: 선언의 «성립 가능 범위»(`housing`·첫 자산·시나리오 A 임대 1호 이상)를 ⑤·⑧·⑫가 같은 술어로 읽는다.
3. 패널(Q-3 a): `UnifiedReductionPanel.tsx` 배너 문구에 같은 인자. Playwright 1건(master 코드에서 실패해야 한다).
4. 뮤테이션(백업/복원 + `cmp`): 선언 인자 무시 · ⑧만 문구 추가 · ⑫만 문구 추가 · 성립 범위 술어 반전 — 각각 anchor가 실패하는지.
5. 회귀 5묶음(`__tests__/api`·`tax-engine`·`calc`·`lib`·`components`) + tsc + eslint(`| tail` 없이 `grep ✖`).
6. **순서 충돌 주의**: Q-2의 수정 파일은 `track-127-7-message.ts`·`transfer-tax-validate-reductions.ts`·`transfer-tax-schema-reduction-refines.ts`·`transfer-tax-schema-refines.ts`·`transfer-tax-schema.ts`·`UnifiedReductionPanel.tsx`다. **`income-deduction-router.ts`·`findTrack127_7Conflict`는 건드리지 않는다.** 다만 같은 파일을 만지는 다른 열린 PR이 있는지는 이 계획서 작성 시점에 확인하지 못했다 → 착수 직전 `git log origin/master -- <파일>`로 확인. Q-1 b를 택하면 `findTrack127_7Conflict` 시그니처 변경이라 #3118 계열 PR과 순서를 맞춰야 한다.

## 7. 구현 결과 [직접]

### 7.1 변경

- **차단 기준은 그대로다**(Q-1 a). ⑧·⑫·⑤의 §127⑦ 판정(`findTrack127_7Conflict`)은 건드리지 않았다 — `income-deduction-router.ts` 무변경.
- 공용 술어·문구: `lib/tax-engine/transfer-reductions/track-127-7-message.ts`에 `rentalHousingPathApplies`(첫 자산 · `housing` · ④가 선언 payload를 싣는 경우) · `rentalHousingPathNotice`(충돌 쌍에 §97의3/4가 있을 때만) · `track127_7ConflictMessage(conflict, opts?)`의 선택 인자. 옵션이 없으면 종전 문구와 글자까지 같다.
- ⑧ `transfer-tax-validate-reductions.ts`: `toRentalHousingExceptionApi(asset) !== undefined`(④와 같은 게이트)로 선언 여부를 읽는다. ⑫ `refineReductionTrack127_7(…, opts)` + `addPropertyRefines`의 `data.rentalHousingException?.applyException === true`. 컴패니언 호출처(`transfer-tax-schema.ts`)는 옵션을 넘기지 않는다(선언 없음).
- ⑤ `UnifiedReductionPanel.tsx`: 배너에 같은 안내 문단(`data-testid="track-127-7-rental-housing-notice"`). 
- **계획 §6.2·§6.3과 달라진 점**: «패널은 이미 `asset`을 받으므로 같은 인자를 넘길 수 있다»는 일부 틀렸다 — 패널은 자산 **위치**(첫 자산 여부)를 몰라 `assetIndex` prop을 새로 두었다. 선택 prop(기본 0)이라 기존 패널 테스트 10여 곳은 수정하지 않았고 프로덕션 호출처(`Step5.tsx`)는 항상 넘긴다.
- 문구 끝에 붙는 안내: «참고: 장기임대주택 거주주택 비과세 특례(소득세법 시행령 §155⑳)를 선언한 계산입니다. 이 특례가 성립하면 이 경로는 §97의3·§97의4를 세액에 반영하지 않으므로 (성립하지 않으면 일반 경로에서 반영됩니다) §97의3·§97의4를 해제하고 다른 감면만 선택하면 그 감면이 계산됩니다.»

### 7.2 시료 재측정

계획서 §3의 프로브 원본이 남아 있지 않아 같은 입력으로 시료를 다시 만들었다(`e14gh` anchor의 거주주택 선언 틀 + V-6 감면 픽스처). 감면 없음 84,029,000 · §77 단독 73,716,350 · 거주 0개월 480,628,500은 §3과 **그대로 재현**됐다. §99의3 단독은 시료의 기준시가가 달라 §3의 54,844,999가 아니라 **69,436,998**이다 — 이 anchor는 제 시료의 실측값으로 고정했다(§3 수치와 별개).

### 7.3 테스트

- route anchor `__tests__/api/transfer.route.rental-housing-path-127-7-v7.anchor.test.ts` 18건: 단독 값 · 위양성 5조합(⑧=⑫ 문구, 안내 포함) · U2(선언했으나 불성립 → 400 유지) · 선언 끔·쌍에 §97의3/4 없음·명문 배제 쌍은 안내 없음 · 술어/문구/refine 단위. **구현 전 11건 실패**, 7건 통과(현행 고정분).
- ⑤ 컴포넌트 `__tests__/calc/rental-housing-path-127-7-banner-v7.ui.test.tsx` 5건. 구현 전 2건 실패.
- Playwright `e2e/transfer-rental-97-3-4-track-127-7.spec.ts`에 2건 추가(선언 시 안내 · 선언 없으면 안내 없음 대조): **현재 코드 4건 통과**, **master 코드(소스 stash)에서 V-7 테스트만 실패**(대조 3건은 통과).

### 7.4 뮤테이션 (백업/복원 + `cmp`, 관련 4파일 60건)

| 변이 | 결과 |
|---|---|
| V1 ⑧ 안내 옵션 미전달 | 7건 실패 |
| V2 ⑫ 메시지에 옵션 미전달 | 7건 실패 |
| V3 ⑫ 호출처 옵션 제거 | 6건 실패 |
| V4 술어 첫 자산 조건 제거 | 2건 실패 |
| V5 술어 housing 조건 제거 | 1건 실패 |
| V6 ⑧ 선언 여부 무시 | 5건 실패 |
| V7 §97의3/4 무관 안내 | 3건 실패 |
| V8 ⑤ 배너 안내 제거 | 2건 실패 |
| **V9 ⑫ 게이트 완화(Q-1 b)** | 8건 실패 |
| **V10 ⑧ 게이트 완화(Q-1 b)** | 8건 실패 |

10종 전부 검출, 복원은 `cmp` 일치. V9·V10은 «선언만으로 §127⑦ 차단을 푸는» 변이로, U2·R 계열이 그 회귀를 잡는다.

### 7.5 회귀·정적 검사

- 회귀 5묶음 실패 0: `__tests__/api` 6,981 · `tax-engine` 19,209 · `calc` 11,737 · `lib` 3,409 · `components` 7,000건.
- `tsc --noEmit` 0건. eslint 오류 0 — 경고 4건(`Step5.tsx` 2 · `UnifiedReductionPanel.tsx` 2)은 **master에도 있는 기존 경고**(stash로 대조, 줄 번호만 이동)라 손대지 않았다.
- **tsc 첫 실행은 종료코드 134(메모리 부족)였다.** 원인은 직전 Playwright 개발 서버가 만든 `.next`(642M)였다 — `tsconfig`의 `include`가 `**/*.ts`이고 `node_modules`만 제외해 `.next` 안 파일이 tsc 대상에 들어갔다. 제가 만든 빌드 산출물이라 지운 뒤 재실행해 0건이다. 코드 오류가 아니다.

### 7.6 남은 확인 필요

- §5 V 항목 그대로. 특히 시나리오 B·겸용주택 · 다건 `properties[]` · §99의3 5년 이내·§99·§98의3~ 하이브리드 조합은 측정하지 않았다.
- `redevelopment_apt` 선언은 안내 대상이 아니다(`rentalHousingPathApplies`가 `housing`만 허용) — route·⑧⑫ 도달은 측정하지 않았고 엔진 직접 1건(§3.5)뿐이다.
- 브라우저 수동 확인은 하지 않았다(Playwright 2건이 배너를 확인).
