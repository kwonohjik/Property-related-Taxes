# 다건 `properties[]` 경로가 임대 조문 중복 차단(V-6)을 같은 문구로 받는가 — 도달 계획서 (V-6 계획서 V-3)

- 상태: **결정 대기**(Q-1 한 건). 기준 master `cc4b91094`.
- 출처: `docs/00-pm/rental-97-overlap-v6.plan.md` §5 V-3(«다건 `properties[]`·컴패니언에 ⑫ 차단이 닿는지는 anchor로만 확정») · `docs/00-pm/rental-97-5-has975-v2.plan.md` §5 V-2(«`multi` route `properties[]` 항목의 ⑫ 도달»).
- 도달 경로: 다건 화면(`app/calc/transfer-tax/multi/MultiTransferTaxCalculator.tsx`)은 단건 마법사를 건마다 임베드한다. 직접 API 호출은 `POST /api/calc/transfer/multi`(`multiInputSchema` → `propertyItemSchema`).

## 0. 결론

| 항목 | 내용 |
|---|---|
| 도달 여부 | **닿는다.** 다건 `properties[i].reductions`에 담은 명문 배제 3쌍(§97의3×§97의4 · §97의3×§97의5 · §97의4×§97의5)과 §127⑦ 교차 조합은 단건 route와 **같은 문구의 400**이다. 측정 23개 시료 중 조합 16건이 단건·다건 모두 400이고 문구 집합이 전부 일치했다 [직접, §3] |
| 단독 대조 | 6건(§97의3 · §97의4 · §97의5 · 신축 §99의3 · 수용 §77 · §97 본문)은 단건·다건 모두 200이고 **총세액이 같다**(§3.2) [직접] |
| 경로 | 다건 항목 스키마의 `superRefine`이 `addPropertyRefines`를 부르고(`transfer-tax-schema.ts:499-501`), 거기서 `refineReductionTrack127_7`을 건마다 부른다(`transfer-tax-schema-refines.ts:166`). 같은 함수 한 곳이 단건·다건을 함께 막는다 [직접: 읽음 + 호출 제거 실험 §3.5] |
| 위치 | 오류 경로가 `properties.{i}.reductions.{j}.type`이라 몇 번째 건의 몇 번째 감면인지 나온다. 문제 건이 둘째여도 같다(§3.3) [직접] |
| ⑧ | 다건 흐름의 건별 검증(`isPropertyReady` → `validateStep(2)`)은 단건과 **같은 함수**(`validateStep2Reductions`)를 부른다. 23개 시료 전부에서 단건 ⑧ 문구와 다건 `validateStep(2)` 문구가 같았고, 계산 버튼의 최종 관문(`notReadyPropertiesMessage`)이 그 문구를 낸다(§3.4) [직접] |
| 컴패니언 | 다건 항목에는 컴패니언(`companionAssets`)이 **들어갈 수 없다**. 화면은 «한 건 내 다자산 일괄양도는 단건 계산기에서만 지원됩니다»로 막고, 직접 본문에 넣으면 같은 문구로 400이다. 컴패니언 안 쌍은 다건에서 별도 문구 없이 이 400에 가려진다(§3.6) [직접] |
| 결함 | **이번 범위에서 찾지 못했다.** 200으로 통과해 이중 적용되는 조합은 없었다. 다만 이 도달을 고정하는 테스트는 없다(§3.7) |
| 결정 | **Q-1**: 고정 anchor를 추가할지. 권장 a(추가) |

## 1. 범위

- 대상: 다건 route `properties[i].reductions`의 임대 범주 명문 배제 3쌍(V-6, 조특법 §97의3②·§97의5②)과 §127⑦ 교차(`findTrack127_7Conflict`: 임대 장특 특례 §97의3·§97의4 + 다른 분류 조문). 클라이언트 ⑧(`multi-transfer-tax-validate.ts` → `validateStep`)과 ⑫(`multiInputSchema`), 컴패니언 경로.
- 제외: 다건 합산 엔진의 금액 정합(단독 총세액 일치는 §3.2에서 확인만 했다) · §98 시리즈 등 다건이 통째로 막는 조문(`ALL_INCOME_DEDUCTION_IDS` 중 §99·§99의3 제외, `transfer-tax-schema-multi-refines.ts:94-104`) · 거주주택 경로(상위 V-7) · 판정 메뉴 route.

## 2. 조문·코드 실독

### 2.1 조문 [직접, KoreanLaw MCP, 조회기준일 2026-11-10, 조세특례제한법 MST 284389(시행 2026-09-18)]

- **§97의3②**: «제1항에 따른 과세특례는 제97조의4에 따른 장기임대주택에 대한 양도소득세의 과세특례와 중복하여 적용하지 아니한다.»
- **§97의5②**: «제1항에 따른 세액감면은 제97조의3의 장기일반민간임대주택등에 대한 양도소득세의 과세특례 및 제97조의4의 장기임대주택에 대한 양도소득세의 과세특례와 중복하여 적용하지 아니한다.»
- **§127⑦**: «거주자가 토지등을 양도하여 둘 이상의 양도소득세의 감면규정을 동시에 적용받는 경우에는 그 거주자가 선택하는 하나의 감면규정만을 적용한다. 다만, 토지등의 일부에 대하여 특정의 감면규정을 적용받는 경우에는 남은 부분에 대하여 다른 감면규정을 적용받을 수 있다.»
- 이번 계획서는 조문 해석을 바꾸지 않는다. V-6(#3126)이 정한 차단 기준을 다건이 같이 받는지만 본다.

### 2.2 코드 [직접: 파일을 읽음]

- `app/api/calc/transfer/multi/route.ts:74` — `multiInputSchema.safeParse(body)`가 실패하면 `fieldErrors`를 만들어 400을 낸다. 엔진 호출 전이다.
- `lib/api/transfer-tax-schema.ts:508` `multiInputSchema` → `properties: z.array(propertyItemSchema).min(1).max(20)`. `propertyItemSchema`의 `superRefine`(499-505)은 `addPropertyRefines(data, ctx)` · `refinePropertyRequiredInputs` · `refineMultiUnsupported`를 차례로 부른다.
- `lib/api/transfer-tax-schema-refines.ts:66` `addPropertyRefines` — 단건·다건 공용. 166행에서 `refineReductionTrack127_7(data.reductions, data.acquisitionDate, data.transferDate, ctx, ["reductions"])`를 부른다. 이 함수(`transfer-tax-schema-reduction-refines.ts:54-79`)가 §127⑦ 교차를 먼저, 이어서 `findRental97StatutoryOverlap`(명문 배제 3쌍)을 판정한다.
- `lib/api/transfer-tax-schema-multi-refines.ts`의 `reductions:` 항목(94-104행)은 **임대 쌍과 무관한 별도 규칙**이다. `ALL_INCOME_DEDUCTION_IDS`(§98·§99 계열 11종) 중 §99·§99의3의 2016.1.1. 이후 양도분을 뺀 나머지를 다건에서 통째로 막는다. 임대 조문(`rental_97_*`)과 수용(`public_expropriation`)은 이 집합에 없다(`income-deduction-router.ts:170-182`). 즉 임대 쌍 차단은 이 규칙이 아니라 공용 refine이 맡는다.
- `companionAssets:` 항목(105행)은 길이 1 이상이면 `MULTI_COMPANION_UNSUPPORTED_MESSAGE`로 거부한다. 컴패니언 안 감면의 교차 refine(`transfer-tax-schema.ts:202`)은 **단건 `propertySchema`** 안에 있고 `propertyItemSchema`에는 없다.
- 클라이언트: `isPropertyReady`(`multi-transfer-tax-validate.ts:225`) → `firstBlockingMessage`(230)가 `validateStep(step, item.form)`을 step 0~2로 돈다. step 2는 `validateStep2Reductions`(`transfer-tax-validate.ts:549`)이고, 임대 쌍은 그 안의 `findTrack127_7Conflict` 호출(`transfer-tax-validate-reductions.ts:149`)과 D2-05(`transfer-tax-validate-rental-97.ts:171`)가 막는다. 계산 버튼은 `notReadyPropertiesMessage(form.properties) ?? validateMultiSettings(form)`를 먼저 통과해야 한다(`MultiTransferTaxCalculator.tsx:339`).
- 다건 ④(`multi-transfer-tax-api.ts`)는 건마다 첫 자산(`form.assets[0]`)만 싣고 컴패니언은 싣지 않는다(같은 파일 252행 주석 + §3.6 실측).

## 3. 측정 [직접]

### 3.1 방법

throwaway probe(`__tests__/api/zz-probe-v3.test.ts`, 커밋하지 않고 삭제). V-6 프로브 틀을 재사용했다. 시료는 V-6과 같다: 주택 1장 · 취득 2003-03-01 · 양도 2025-08-01 · 양도가액 900,000,000 · 취득가액 200,000,000 · 임대 등록·개시 2014-01-01. §97 본문은 신축 1995 카드(취득 1995-02-01). 세율표는 route 폴백. 같은 폼을 ① 단건 ④→`/api/calc/transfer` ② 다건 ④(`callMultiTransferTaxAPI`)→`/api/calc/transfer/multi`로 각각 보냈다(`__tests__/calc/_helpers/single-multi-route-parity.ts`의 `buildMultiBody` 재사용). 응답은 `error.fieldErrors`의 문구 집합으로 비교했다.

### 3.2 건 1개 — 단건 대 다건 (⑫ route)

| 시료 | 단건 | 다건 | 문구 일치 | 다건 오류 경로 |
|---|---|---|---|---|
| §97의3 · §97의4 · §97의5 · §97 본문 · 신축 §99의3 · 수용 §77 **각 단독** | 200 | 200 | 총세액 같음: 144,899,332 · 155,166,000 · 185,966,000 · 109,889,000 · 156,565,999 · 163,142,900 | — |
| [§97의3, §97의4] / [§97의4, §97의3] | 400 | 400 | 일치(§97의3②) | `properties.0.reductions.1.type` |
| [§97의3, §97의5] / [§97의5, §97의3] | 400 | 400 | 일치(§97의5②) | `.reductions.1.type` / `.reductions.0.type` |
| [§97의4, §97의5] / [§97의5, §97의4] | 400 | 400 | 일치(§97의5②) | 〃 |
| [§97의3, §97의4, §97의5] | 400 | 400 | 일치(§97의5②) | `.reductions.2.type` |
| [§97의4, §99의3] / [§99의3, §97의4] | 400 | 400 | 일치(§127⑦) | `.reductions.1.type` / `.0.type` |
| [§97의3, §99의3] | 400 | 400 | 일치(§127⑦) | `.reductions.1.type` |
| [§97의3, §77] / [§77, §97의3] | 400 | 400 | 일치(§127⑦) | 〃 |
| [§97의4, §77] | 400 | 400 | 일치(§127⑦) | `.reductions.1.type` |
| [§97 본문, §97의4] / [§97의4, §97 본문] | 400 | 400 | 일치(§127⑦) | `.reductions.0.type` / `.reductions.1.type` |
| [§97 본문, §97의3] | 400 | 400 | 일치(§127⑦) | `.reductions.0.type` |

- 문구는 단건과 글자 단위로 같고(`sameMsgs`=true) 경로만 `properties.0.` 접두가 붙는다.
- 대조 한 건: [§97 본문, §97의5]는 단건·다건 모두 **200**, 총세액 109,889,000(= §97 본문 단독)이다. §97 본문·§97의5는 둘 다 세액감면형이라 `calcReductions` max 패턴이 맡고 §127⑦ 교차 대상이 아니다(V-6 §1 제외 범위). 이번 계획의 대상이 아니다.
- 신축 §99의3은 양도일 2025라 다건이 허용하는 범위(2016.1.1. 이후)다. 양도일 2015-08-01로 바꾸면 다건은 교차 문구 **외에** «신축주택 감면(조특법 §99·§99의3)은 양도일이 2016.1.1. 이후인 건만 합산 계산을 지원합니다…»를 추가로 낸다(`properties.0.reductions`). 단건은 교차 문구만이다.

### 3.3 건 2개 이상 — 문제 건 위치

[§97의3, §97의4] · [§97의3, §97의5] · [§97의4, §97의5] · [§97의4, §99의3] · [§97의3, §77] · [§97의4, §77] 6개 조합을 «정상 건(§97의4 단독) + 문제 건»과 «문제 건 + 정상 건»으로 `properties` 2건에 넣었다. 12건 모두 400이고 오류 경로가 문제 건의 위치(`properties.1.reductions.1.type` / `properties.0.reductions.1.type`)를 가리켰으며 문구는 위치와 무관하게 같았다.

### 3.4 ⑧ — 다건 흐름의 건별 검증

시료 23개 전부에서 `validateStep2Reductions(2, form)`(단건 ⑧)과 `validateStep(2, form)`(다건이 건마다 부르는 함수)의 결과가 같았다. 조합 16건은 둘 다 §3.2의 문구를 낸다. `notReadyPropertiesMessage`는 그 문구를 «필수 정보가 입력되지 않은 양도 건이 있습니다 … • 「p1」 …»에 담았고, 단독 6건은 null이다(세대 보유 주택 수와 «다른 보유 주택 없음» 확인이 어긋나는 명부 문구는 시료 폼의 `householdHousingCount`를 "1"로 둬 제거했다). `validateMultiSettings`는 건별 감면 쌍을 보지 않는다(조합 16건 모두 null) — 감면 쌍은 `notReadyPropertiesMessage`가 앞서 막는다. 양도일 2015-08-01 시료에서만 `validateMultiSettings`가 «신축주택 감면 … 2016.1.1. 이후인 건만…»을 냈다.

### 3.5 호출 제거 실험 (가정 실험 — 되돌림)

`transfer-tax-schema-refines.ts:166`의 호출 한 줄만 주석 처리하고 같은 프로브를 돌렸다(백업 후 `cmp`로 복원 확인, 이 PR에 남지 않음). **단건·다건 모두 조합 16건이 200**이 됐다. 곧 다건의 400은 이 한 줄에 의존한다. 그때의 총세액(참고, 다건 = 단건):

| 조합 | 총세액 | 비교 |
|---|---:|---|
| [§97의3, §97의4] | 144,899,332 | §97의3 단독과 같다. [§97의4, §97의3]은 155,166,000(§97의4 단독) — 순서로 갈린다 |
| [§97의3, §97의5] 등 §97의5 쌍 5건 | 185,966,000 | §97의5 부적격 단독 값(V-2) |
| [§97의4, §99의3] | 129,966,000 | §99의3 단독 156,565,999보다 26,599,999 적음 |
| [§97의3, §77] | 127,116,232 | §77 단독 163,142,900보다 36,026,668 적음 |
| [§97 본문, §97의4] | 91,689,000 | §97 본문 단독 109,889,000보다 18,200,000 적음 |
| [§97 본문, §97의3] | 단건 85,622,332 · 다건 85,622,333 | 호출을 제거한 상태에서만 나오는 1원 차이 — 현행 동작이 아니다 |

호출을 제거한 상태에서도 다건·단건 값이 같으므로 다건 합산 엔진이 이중 적용을 따로 막는 장치는 없다(단독 총세액 일치도 같은 결론). 차단은 ⑫가 유일한 방어선이다.

### 3.6 컴패니언

- 단건: 컴패니언 카드 안의 쌍은 `companionAssets.0.reductions.1.type`로 400(V-6에서 고정, 이번에 [§97의3, §97의4]·[§97의4, §99의3] 재확인).
- 다건: ① 같은 2자산 폼을 ④로 보내면 본문에 `companionAssets`가 **없다**(첫 자산만 실린다). route는 이 본문에 200을 냈다(총세액은 기록하지 않았다). 화면은 이 경우를 ⑧이 먼저 막는다 — `validateMultiSupportedMode`와 `validateMultiSettings` 둘 다 «한 건 내 다자산 일괄양도는 단건 계산기에서만 지원됩니다.» ② 컴패니언을 본문에 직접 넣으면(`properties[0].companionAssets` 1건) 400이고 오류는 `properties.0.companionAssets`의 같은 문구 한 건뿐이다. 컴패니언 안 쌍의 교차 문구는 나오지 않는다.
- 결론: 다건에서 컴패니언 안 쌍이 엔진에 닿는 경로는 없다. 다만 ①의 «④가 첫 자산만 싣고 route가 200»은 ⑧을 거치지 않는 호출에서만 의미가 있고, 임대 쌍과는 무관한 기존 설계다(이번에 바꾸지 않는다).

### 3.7 기존 테스트 현황 [직접, grep]

`__tests__` 전체에서 다건 route(`transfer/multi/route` import · `buildMultiBody`·`runMulti`·`postMulti` 헬퍼) 또는 `multiInputSchema`·`propertyItemSchema`를 쓰면서 `rental_97_3`·`rental_97_4`·`rental_97_5`를 언급하는 파일은 `transfer.route.zod-required-inputs.anchor.test.ts` 한 개뿐이고, 그 안의 언급(535행)은 옛 키 `rentalReductionDetails` 거부 안내 문구 검사다. **다건 `/multi` route로 임대 쌍·§127⑦ 교차 400을 확인하는 테스트는 없다**(grep, `awk`로 해당 파일의 다건 구간 확인). 다건 키 분류 가드(`transfer.route.multi-key-coverage-f12.test.ts`)는 키의 분류만 보고 `reductions` 쌍은 보지 않는다.

## 4. 결정 대기

### Q-1. 다건 도달을 고정하는 anchor를 추가할까 (구현 불필요 — 고정 여부만)

| 안 | 내용 | 비용·위험 |
|---|---|---|
| **a (권장)** | route anchor 한 파일 추가: 명문 배제 3쌍 + §127⑦ 교차 대표 조합이 다건 `properties[i]`(둘째 건 포함)에서 단건과 같은 문구로 400, 단독은 200 | 코드 변경 없음. §3.5처럼 ⑫ 한 줄이 사라지거나 다건 스키마가 공용 refine을 우회하게 바뀌어도 알아채는 안전망이 생긴다. 단건 anchor는 `propertySchema`만 거치므로 `propertyItemSchema`의 회귀를 못 본다 |
| b | 추가하지 않는다 | 현재 동작은 올바르다. 다건 스키마 리팩터에서 공용 refine 호출이 빠져도 단건 테스트 전부가 통과한다(§3.5: 호출을 제거하면 단건·다건이 함께 200이 되지만, 다건만 빠지는 변경은 어떤 테스트도 잡지 못한다 — 확인 필요: 그런 변경으로 실제로 전 테스트가 통과하는지는 재현하지 않았다) |

권장 a의 근거: ① 임대 쌍 차단이 ⑫ 한 곳에 단독 의존한다(§3.5) ② 다건 route에 이 쌍을 확인하는 테스트가 0건이다(§3.7) ③ V-6·V-2가 «다건 도달은 anchor로만 확정»이라고 남겼다. 비용은 테스트 1파일이다.

## 5. 미검증 · 확인 필요

- V-1: 브라우저에서 다건 화면의 계산 버튼이 실제로 §3.4의 문구를 보여주는지 — **수동 확인 안 함**. 함수 호출(`notReadyPropertiesMessage`)로만 확인했다. UI는 라디오가 같은 범주를 하나만 남겨 조합을 만들 수 없다.
- V-2: 이력에서 다건으로 다시 계산하는 경로(`lib/calc/cross-104-5-recalc.ts`)가 저장된 단건 폼을 다건으로 옮기며 임대 두 조문이 담긴 이전 저장분을 만났을 때 어떻게 되는지 — **확인 필요**(이번에 호출하지 않았다). V-6 §5 V-5와 같은 축이다.
- V-3: 판정 메뉴 route(`one-house-exemption`·`multi-house-surcharge-judgment`)도 `propertySchema`를 쓰므로 같은 refine을 탄다고 import로만 봤다 — route 호출은 **확인 필요**.
- V-4: 임대 조문과 다건이 통째로 막는 조문(§98 시리즈, 양도일 2016 전 §99·§99의3)의 조합은 다건 400의 문구가 막는 쪽만 나오는지 — 신축 §99의3 2015 양도 한 건만 측정했고(§3.2) §98 계열 조합은 코드 읽기뿐이다.
- V-5: 레거시 id `long_term_rental`(폼 마이그레이션 전 저장분)과 §97의3/4 조합의 다건 동작 — 측정하지 않았다(V-6 §5 V-4 계승).
- V-6: 수용 §77 시료는 최소 본문(`{type}`만)에서 필드 검증이 먼저 걸려 교차 문구가 나오지 않는다 — 단건·다건이 같았다(문구 집합 일치). 정상 폼 시료에서는 교차 문구가 나온다(§3.2). 최소 본문 시료를 그대로 anchor에 쓰면 안 된다.
- V-7: 다건 `reductionAmount`(건별)는 단건 결과 필드와 값이 다른 시료가 있었다(§97 본문 단독: 단건 84,530,000 · 다건 건별 85,030,000, 총세액은 109,889,000으로 같음; §77 단독: 25,359,000 ↔ 25,509,000). 표시 필드의 정의 차이로 보이나 **원인을 확인하지 않았다** — 이번 범위(차단 도달) 밖이다.
- 부존재 증명이 아니다: 측정한 임대 쌍·교차 조합 외의 감면 조합은 같은 함수라는 코드 읽기로만 추정했다.

## 6. 구현 계획 (결정 후 — 아직 하지 않음)

Q-1 a를 고르면:

1. 테스트 한 파일(예: `__tests__/api/transfer.route.multi-rental-97-overlap.anchor.test.ts`) — `buildMultiBody`·`postMulti`(parity 헬퍼)와 V-6 anchor의 임대 카드 픽스처를 재사용. ① 명문 배제 3쌍(순서 양방향)이 `properties.0.reductions.{j}.type`로 400이고 문구가 단건 ⑧ 문구와 같음 ② §127⑦ 대표 3종(§97의4×§99의3 · §97의3×§77 · §97 본문×§97의4)이 400 ③ 문제 건이 `properties[1]`일 때 경로가 `properties.1.…` ④ 단독 3종(+§97 본문)은 200이고 단건과 총세액 같음 ⑤ 컴패니언을 직접 넣으면 `properties.0.companionAssets`의 일괄양도 문구(§3.6) ⑥ 전제: 조합에서 ⑧(`validateStep(2)`)이 같은 문구를 낸다.
2. 뮤테이션: `transfer-tax-schema-refines.ts:166` 호출 제거 · `propertyItemSchema`의 `addPropertyRefines` 제거 · `findRental97StatutoryOverlap` 쌍 누락 — 각각 새 테스트가 실패하는지(백업/복원 + `cmp`).
3. 단일 파일 실행(`npx vitest run <그 파일>`) + tsc/eslint. 수치는 헬퍼 폴백 세율에서 이번 §3.2 값과 같아야 한다.

Q-1 b를 고르면 이 PR(계획서)로 종결한다.
