# 비사업용 토지 판정 메뉴 — 엔진·API(⑨~⑭)·⑧ 정합 측 계획

> 상태: **Plan v1 (2026-11-25)** · 코드 변경 0(계획서만). throwaway probe 6건(`scratchpad/nbl-menu-engine/p1~p6`)은 워크트리 밖에서 돌렸고 워크트리에는 이 문서 외 변경이 없다.
> base: `master` 0cbca41ef · 브랜치 `feat/nbl-judgment-menu` · 짝 문서: `nbl-judgment-menu.ui.plan.md`(UI 시니어 — 이 문서는 건드리지 않는다)
> 확정 결정(재론 금지): **D1** Step4 「판정 도움」 유지 · 메뉴는 같은 입력 위젯 재사용 · 결과의 「양도세 계산하기」는 **사실만** 넘기고 계산기가 같은 엔진으로 재판정 · **D2** 4단계(① 토지 기본 → ② 무조건 의제 + 지목·용도지역·지목별 상세 → ③ 부득이한 사유·도시편입일·양도일 의제 → ④ 결과) · **D3** 이력(IndexedDB) 저장 · **D4** 홈 메뉴는 「다주택 중과 판정」 바로 뒤 · **D5** 토지 단독 1필지만 · **D6** 판정 → 계산기 방향만.
> 검증 표기: 「확인」= 이 세션에서 파일·KoreanLaw MCP 본문을 직접 읽음 / 「실측」= throwaway probe 수치 / 「확인 필요」= 읽지 못했거나 근거 없음.
> 약칭: 법 = 「소득세법」, 영 = 「소득세법 시행령」.
> 번호: `D-E n`(설계 확정) · `Q-n`(사용자 결정) · `V-n`(미검증) · `T-n`(함정). 합칠 때 `NM-` 접두어를 붙인다(UI 문서는 `UQ-`·`UV-`).

---


## 사용자 결정 2차 (2026-11-25 · 메인 세션 기록 — 이 절이 본문 Q/UQ 추천보다 우선)

| 번호 | 결정 | 본문 추천과의 차이 |
|---|---|---|
| Q-1 = UQ-1 | **(c) 이월과세(`carryover_gift`)를 받고 A·B 둘 다 판정** | 추천 (b) 제외 → **번복** |
| Q-2 = UQ-2 | 세율 숫자 없이 안내만 — 결과 카드 `judgmentOnly`로 「+10%p」 단정 2곳을 「세율·장특 적용은 양도세 계산기에서」로 | 추천 그대로 |
| Q-3 | 6지목 전부(주택부수토지·별장 포함) | 추천 그대로 |
| UQ-4 | 기타토지 연접 다필지 입력 노출 | 추천 그대로 |
| UQ-3 | 계산기 출처 줄 v1 제외(사용자에게 묻지 않은 기본값 — 메인 세션 판단) | 추천 그대로 |

### Q-1 (c) 설계 골자 — Do에서 확정·실측
- **엔진/API**: 시나리오 B 입력은 기존 단일 소스 `buildNblEngineInputGiftBasis(raw, giftRegistryDate)`(`lib/calc/non-business-land-request.ts:101`)를 그대로 쓴다 — 계산기 ⑭도 같은 함수를 부른다(`app/api/calc/transfer/engine-input.ts:278`). 요청에 증여 등기접수일(`carryoverGiftRegistryDate`)을 더하고, 이월과세이면 응답에 `judgmentIfCarryoverExcluded`(B)를 함께 싣는다. A = 원 raw(증여자 취득일 기산), B = 수증일 기산.
- **parity**: A는 계산기 시나리오 A의 `nonBusinessLandJudgmentDetail`, B는 시나리오 B의 그것과 각각 일치해야 한다(앵커 추가).
- **어느 쪽이 적용되는가는 메뉴가 단정하지 않는다**: §97의2②(1호 수용 2년 이전 증여·2호 1세대1주택·3호 세액 비교)와 ③ 기간 경과로 갈리므로, 결과 화면은 A·B를 나란히 보이고 「적용 여부는 양도세 계산기에서 세액 비교로 정해집니다」를 고지한다.
- **UI ①**: 취득원인에 「이월과세(배우자·직계존비속 증여)」 추가 — 증여자 취득일(`carryover.donorAcquisitionDate`)·증여 등기접수일(`carryover.giftRegistryDate`) 칸. 계산기의 기존 칸·⑧ 규칙(`lib/calc/transfer-tax-api-carryover.ts:99` 등)을 재사용하고 새 규칙을 만들지 않는다.
- **넘기기**: 이월과세 칸도 그대로 계산기 폼에 쓴다(계산기가 A/B 세액 비교로 확정).

## 0. 한눈에

1. **새 route는 `{ nonBusinessLandRaw }` 한 덩어리만 받는다.** 계산기 ④ 클라이언트 빌더(`buildNonBusinessLandRaw`)가 만든 raw를 그대로 싣고, 서버는 계산기 ⑫·⑭와 **같은 함수**(`nonBusinessLandRawSchema` → `buildNblEngineInput` → `parseRatesFromMap(...).nonBusinessLandJudgmentRules` → `judgeNonBusinessLand`)만 부른다. 매핑 로직을 한 줄도 새로 쓰지 않는다.
2. **`propertySchema` 전체를 재사용하지 않는다**(1세대1주택 메뉴와 다른 점 — D-E1). 그쪽은 취득가·양도가 같은 필수 칸 때문에 placeholder 0을 보내야 했으나(`one-house-exemption-api.ts` 머리 주석), NBL 판정은 가액이 필요 없다. 대신 **raw 스키마가 못 막는 property 수준 규칙 4개**(§3.2)만 얇은 래퍼 refine으로 막는다 — 실측으로 확인한 틈이다.
3. **응답 = `{ judgment, inputEffects }`**. `judgment`는 엔진 반환값 그대로(계산기 `nonBusinessLandJudgmentDetail`과 JSON 기준 동일 — 실측 5/5). `inputEffects`는 「입력했는데 판정에 안 쓰인 칸」을 서버가 못박는 echo(§4).
4. **parity 앵커 = 같은 폼 → 계산기 route의 `nonBusinessLandJudgmentDetail` ≡ 메뉴 route의 `judgment`**(§6). 기존 route 관통 하니스(`captureBody` · `postTransfer`)와 E3 표(`e3dBRowRaw`)를 그대로 쓴다.
5. **NBL 내부 파일은 편집하지 않는다**(다른 세션이 E3 작업 중). 기존 파일 수정은 **`transfer-tax-validate-acquisition.ts`의 `inheritedDecedentDateError`에 `export` 1단어**(§5.2)뿐이다.

---

## 1. 법령 근거 (KoreanLaw MCP 본문 확인 · 2026-11-25)

| 조문 | 확인한 본문(verbatim) | 이 계획서에서의 쓰임 |
|---|---|---|
| 법 §104의3① (시행 2026-01-01, MST 280405) | 「해당 토지를 소유하는 기간 중 대통령령으로 정하는 기간 동안 다음 각 호의 어느 하나에 해당하는 토지」 | 판정 대상 1~7호. 메뉴는 지목 6종(농지·임야·목장용지·주택부수·별장·기타)을 모두 받는다(Q-3) |
| 법 §104의3② | 「토지 취득 후 법률에 따른 사용 금지나 그 밖에 대통령령으로 정하는 부득이한 사유가 있어 … 비사업용 토지로 보지 아니할 수 있다」 | ③단계 부득이한 사유 |
| 영 §168의6 (시행 2026-10-01, MST 290841) | 「…기간의 계산은 일수로 한다」 · 1호 소유 5년 이상 가·나·다목 **모두** / 2호 3~5년 / 3호 3년 미만(2년 미만이면 가목 불적용) | **결과 화면 라벨 주의**: 엔진 echo `criteria.rule80Percent·rule5Years·rule2of3Years`는 **옛 「80%·5년·3년 중 2년」 3기준의 이름을 그대로 쓰는 렌즈 변수**다(`period-criteria.ts:298-301` 확인 — 가목/나목/다목 lens). 현행 영 §168의6은 가·나·다목을 **모두** 충족해야 사업용 기간이다. 결과 카드를 새로 쓰면 옛 3기준 문구를 쓰지 말고 기존 `NonBusinessLandResultCard`(계산기와 같은 카드)를 재사용한다(§4.3) |
| 영 §168의14① | 「…각 호에서 규정한 기간동안 … 해당하지 않는 토지로 보아 … 비사업용 토지에 해당하는지를 판정한다」 | 유예(부득이한 사유) 입력 |
| 영 §168의14② | 「…각 호에서 규정한 날을 양도일로 보아 제168조의6의 규정을 적용하여」 1호 경매 최초 경매기일 · 2호 공매 최초 공매일 · 3호 규칙 | ③단계 양도일 의제(기간기준 전용) |
| 영 §168의14③ | 「…비사업용 토지로 보지 않는다」 1호 ~ 5호 (3호 나목 괄호: 상속은 피상속인 취득일 · 법 §97의2①은 증여자 취득일) | ②단계 무조건 의제 · 상속·이월과세 취득일 소급 |

> 법령 상수는 `NBL.MAIN` · `NBL.CRITERIA`(`legal-codes/transfer-nbl.ts:28·35`) · `NBL.UNCONDITIONAL`(:85) · `NBL.UNAVOIDABLE_PERIOD`(:203)가 이미 있다. **새 조문 인용이 없으므로 `additions-*` 매니페스트 추가는 불요**(메뉴 문구에 새 조문을 쓰게 되면 그때 등록 — V-9).

---

## 2. 현행 사실 (file:line 확인 + 실측)

### 2.1 판정 엔진의 입력 — 무엇이 필요하고 어디서 오는가 (요청 1)

**엔진은 순수 함수이고 외부 입력이 둘뿐이다**: `judgeNonBusinessLand(input, rules)`(`non-business-land/engine.ts:41-44`).

| 입력 | 계산기 경로의 공급처 | 메뉴 경로 |
|---|---|---|
| `NonBusinessLandInput` 전부(지목·용도지역·면적·취득일·양도일·사용기간·유예·재촌이력·지분율·무조건 의제·의제일·편입일·이력 등) | ④ `buildNonBusinessLandRaw(asset, transferDate)`(`lib/calc/non-business-land-request.ts:149`)이 store `nbl*` 평면 + 아래 비-`nbl*` 칸을 raw로 → ⑫ `nonBusinessLandRawSchema`(`lib/api/transfer-tax-schema-nbl.ts:346`) → ⑭ `buildTransferEngineInput`이 `buildNblEngineInput(data.nonBusinessLandRaw)`(`app/api/calc/transfer/engine-input.ts:276`; 함수 `non-business-land-request.ts:60`) → `mapAssetToNblInput`(`form-mapper.ts:71`) | **동일** — 래퍼 없이 같은 함수 |
| `rules`(`NonBusinessLandJudgmentRules`) | DB `transfer:special:non_business_land_judgment` → `parseRatesFromMap`이 코드 기본값과 **단방향 병합**(`transfer-tax-helpers.ts:149-160`) → `runNonBusinessLandStep`이 `parsedRates.nonBusinessLandJudgmentRules`로 호출(`transfer-tax-judgment-steps.ts:261-264`) | `loadJudgmentRateMap`(`one-house-exemption/judgment-request.ts:173`) → `parseRatesFromMap(map).nonBusinessLandJudgmentRules` |

**NBL이 읽는 비-`nbl*` 자산 칸**(grep `asset\.` 기반 — 완전성은 V-3): `assetKind` · `acquisitionArea` · `acquisitionDate` · `acquisitionCause` · `decedentAcquisitionDate` · `nonHeirBequest` · `carryover.donorAcquisitionDate` · `transferCause` · `expropriationNoticeDate` · `latitude` · `longitude` · `acquisitionSigunguCode` · `ownershipNumerator`/`ownershipDenominator` · `reductions`(자경 편입일 fallback, `non-business-land-request.ts:135`).

**계산기가 판정 앞뒤에서 더하는 것 — 메뉴는 의도적으로 가져오지 않는다**:
- STEP 0.6 직후 `isNonBusinessLand`·`nonBusinessLandAreaRatio`를 입력에 주입(`transfer-tax-judgment-steps.ts:267-271`) — 세액 경로. 비율 출처는 `judgment.surcharge.nonBusinessAreaRatio`(`engine.ts:385`)라 메뉴는 그 필드를 그대로 읽으면 된다.
- 이월과세 **시나리오 B(배제)** 입력 교체(`transfer-tax-carryover-inputs.ts:94-95`) — A/B는 세액 비교(영 ②3호)로 정해지므로 메뉴는 A(증여자 취득일 기준)만 안다 → **Q-1**.
- 비사업용 +10%p의 **세율 배제**(취득 2009.3.16.~2012.12.31. 위기취득 `transfer-tax-rate-calc.ts:451`, 양도 2009.3.16.~2015.12.31. 지정지역 유예 `data/nbl-rate-deferral-era.ts`) — 판정이 아니라 **세율** 단계 → **Q-2**.
- 8호 유예 지정지역 미선언 고지(`transfer-tax-nbl-deferral-notice.ts`) — 세율 단계 고지. 판정 echo에는 없다.

### 2.2 실측

| id | 실측(probe) | 결과 |
|---|---|---|
| P1 | 폼 5종(나대지·농지 자경·주택부수·공익수용 의제·상속 임야) → `captureBody` → ① 계산기 route 응답 `result.nonBusinessLandJudgmentDetail` ② 메뉴 파이프라인(`nonBusinessLandRawSchema.safeParse` → `buildNblEngineInput` → `judgeNonBusinessLand(input, parseRatesFromMap(loadFallbackTransferRates(...)).nonBusinessLandJudgmentRules)` → `JSON.parse(JSON.stringify())`) | **5/5 `toEqual` 일치**(경고 문구·steps 포함) |
| P2 | 엔진 반환 객체의 `Date` 경로 | `.deemedTransfer.date` · `.urbanIncorporationGrace.graceEndDate` |
| P3 | 위 + E3d B표 전 행 + 재촌 농지 | 추가로 `.periodEvaluation.stateHistory.intervals[].start/end` · `.residencePeriodsUsed[].start/end` — **결과 카드는 이미 `Date｜string` 양쪽을 처리**(`NonBusinessLandResultCard.tsx:32-35`), JSON 경유 값을 그대로 받는다 |
| P2′ | raw 단독 Zod가 못 잡는 property 수준 틈 | ① **상속인데 피상속인 취득일 없음**: raw 스키마 통과 · 계산기 400(`transfer-tax-schema-refines.ts:322-328` 「상속의 경우 피상속인 취득일이 필수입니다」) ② **취득일 ≥ 양도일**: raw 통과 · 엔진 `totalOwnershipDays=0`·`isNonBusiness=true`로 조용히 접힘 · 계산기 400(`:291`) ③ **취득일·양도일이 빈 문자열**: raw Zod 통과 → `toDate`가 plain `Error`를 던짐(`date-coerce.ts:37-48` — `TaxCalculationError` 아님) → `taxCalculationErrorResponse` 경로를 타지 못하고 **500** ④ **`nblUseDetailedJudgment:false`**: `buildNblEngineInput`이 `undefined` 반환 |
| P4 | ⑧ `validateNblDetailedJudgment`를 `AssetForm` 하나로 단독 호출(`stateHistoryFloorDate({assets:[a]})` 하한 포함) | **호출 가능**. 지목·용도지역·면적 0은 ⑧이 막고, **상속 피상속인 취득일 없음은 ⑧이 통과**(그 관문은 `validateAssetAcquisition`의 마지막 `inheritedDecedentDateError`, `transfer-tax-validate-acquisition.ts:138-146` — 모듈 private) |
| P5 | 일반 사례에서 `rules` 유무 | 결과 동일 → **rules 배선을 지켜 줄 앵커가 일반 사례로는 없다** |
| P6 | 농지 · 거주지 직선 22.2km · `rules.farmlandDistanceKm` 30 vs 10 | 30: 사업용(`within_30km`) / 10: **비사업용**. rules 배선 mutation을 잡는 사례(§6 A-5) |
| P7 | 파싱 비용·빈 맵 | `parseRatesFromMap` 0.1ms · **빈 맵이면 「누진세율 없음」으로 throw** — 계산기도 같은 맵이면 throw하므로 parity는 유지(V-6) |

---

## 3. API 설계 (요청 2)

### 3.1 route

`app/api/calc/non-business-land-judgment/route.ts` — `POST`, Layer 1 오케스트레이터. 단계는 1세대1주택 route(`one-house-exemption/route.ts:49-84`)와 같은 골격이다.

| 단계 | 호출 | 출처(재사용) |
|---|---|---|
| 0 rate limit(분당 30) | `judgmentRateLimitResponse(request, "non-business-land-judgment")` | `judgment-request.ts:83` |
| 1 JSON | `parseJudgmentJson(request)` | `:98` |
| 2 Zod | `nblJudgmentRequestSchema.safeParse(body)` → 실패 시 `judgmentZodErrorResponse(err, "non-business-land-judgment route")` | 새 래퍼(§3.2) · `:112` |
| 3 엔진 input | `buildNblEngineInput(parsed.data.nonBusinessLandRaw)` — 결과 `undefined`면 400(`nblUseDetailedJudgment` 거울 · P2′ ④) | `lib/calc/non-business-land-request.ts:60` |
| 4 세율 → rules | `loadJudgmentRateMap(transferDate, "/api/calc/non-business-land-judgment")` → `parseRatesFromMap(map).nonBusinessLandJudgmentRules` | `judgment-request.ts:173` · `transfer-tax-helpers.ts:149-160` |
| 5 판정 | `judgeNonBusinessLand(input, rules)` | `engine.ts:41` |
| 6 echo | `buildNblInputEffects(input, judgment)`(§4.2) | 새 순수 leaf |
| 7 응답 | `finiteJson({ data: { judgment, inputEffects } })` — `NextResponse.json` 직접 금지 | `lib/api/non-finite-guard.ts` |
| catch | `TaxCalculationError` → `taxCalculationErrorResponse`, 그 밖 500 `CALCULATION_FAILED` | 1주택 route와 동일 |

- 단계 3~5는 반드시 **`try` 안**이다(`toDate` 등 plain `Error`가 500이 아니라 아래 §3.2의 400으로 먼저 막히도록 래퍼가 날짜를 선검증하지만, 방어선은 둘이다).
- `judgment-request.ts`는 1주택 전용 import가 많은 모듈이지만 다주택 중과 route가 이미 같은 방식으로 import한다(`multi-house-surcharge-judgment/route.ts:25-33`) — 선례를 따른다. 공용 leaf로 따로 뽑지 않는다(남의 모듈 리팩터링 금지). 번들 영향은 V-7.
- 판정 기준일(`judgmentBaseDate`)은 **싣지 않는다** — NBL 판정은 양도일만 쓰고 오늘 날짜 개념이 없다(엔진 시그니처에 없음 — 확인).

### 3.2 요청 스키마 `nblJudgmentRequestSchema` (⑫) — 단일 소스 + 틈 메우기

`lib/api/non-business-land-judgment-schema.ts`:

```ts
z.object({ nonBusinessLandRaw: nonBusinessLandRawSchema })   // ⑫ raw 스키마 재사용 — 같은 refine(⑧ 거울)까지 따라온다
  .superRefine(nblJudgmentFactsRefine)                        // 아래 4규칙
```

`nonBusinessLandRawSchema`는 **자체 취득일·양도일·공익수용 칸을 가진 독립 스키마**라(`transfer-tax-schema-nbl.ts:122-136`) 계산기 `propertySchema`를 끌어오지 않고도 판정이 닫힌다. raw 스키마가 못 막는 틈(§2.2 P2′)은 **계산기 property 수준 refine과 같은 조건·같은 문구**로 래퍼가 막는다:

| 규칙 | 조건 | 경로 | 문구 출처 |
|---|---|---|---|
| R1 | `nblUseDetailedJudgment !== true` | `nonBusinessLandRaw.nblUseDetailedJudgment` | 새(판정 메뉴는 항상 상세 판정) |
| R2 | `acquisitionDate`·`transferDate`가 `toOptionalDate`로 해석 불가(빈·깨짐) | 각 칸 | 새 — `toDate`의 plain `Error`(500)를 400으로 앞당김. **`new Date(x)` 직접 호출 금지**(CLAUDE.md) → `toOptionalDate` 사용 |
| R3 | `acquisitionDate ≥ transferDate`(ISO 문자열 비교 — 계산기와 같은 방식) | `acquisitionDate` | `transfer-tax-schema-refines.ts:291-296` 「취득일은 양도일보다 이전이어야 합니다」 |
| R4 | `acquisitionCause === "inheritance"` ∧ (`decedentAcquisitionDate` 없음 ∨ `decedentAcquisitionDate ≥ acquisitionDate`) | `decedentAcquisitionDate` | `:322-340` 「상속의 경우 피상속인 취득일이 필수입니다」 · 「피상속인 취득일은 상속개시일보다 이전이어야 합니다」 |

- 면적 > 0은 래퍼에 넣지 않는다 — ⑧ `validateNblDetailedJudgment`(`transfer-tax-validate-nbl.ts:104`)가 막고, 계산기 route가 raw 면적 ≤ 0을 어떻게 다루는지는 **미실측**(V-4). 메뉴가 계산기보다 엄격한 것은 허용된다(§6 B 격자는 「메뉴 200 ⇒ 계산기 NBL 경로 400 아님」만 요구).
- 이월과세(`carryover_gift`)는 **Q-1** 결정 전까지 래퍼 규칙을 정하지 않는다.
- **14지점 영향**: 새 enum·새 raw 칸이 없다 → ⑨⑩⑪ 해당 없음. ⑫ = 위 래퍼(raw 스키마는 불변). ⑬ = 클라이언트 본문 `{ nonBusinessLandRaw }`(§5.1). ⑭ = §3.1 단계 3 — 계산기 `engine-input.ts:276`과 **같은 함수 호출**이므로 **raw에 새 칸이 생겨도(E3 작업 진행 중) 메뉴가 자동으로 따라간다**(T-1).

### 3.3 왜 `propertySchema` 전체가 아닌가 (D-E1)

| | 1세대1주택 메뉴 | NBL 메뉴 |
|---|---|---|
| 판정이 읽는 사실 | 양도일·양도가(고가주택)·명부·거주·상속 … 계산기 폼 슈퍼셋 | `NonBusinessLandInput`뿐(양도가·취득가 불요) |
| `propertySchema` 재사용 | 필요(명부 도출 `buildTransferEngineInput`) | **불필요** — 쓰면 `acquisitionPrice`·`transferPrice` placeholder(0·임의값)를 보내야 해 「가정 금지·자동 fallback 금지」와 어긋난다 |
| 단일 소스의 단위 | `propertySchema` + `buildTransferEngineInput` | **`nonBusinessLandRawSchema` + `buildNblEngineInput`** — 계산기도 NBL 판정은 이 둘만 거쳐 `judgeNonBusinessLand`에 닿는다(P1 5/5) |

---

## 4. 응답 형태 (요청 3)

### 4.1 타입

```ts
// app/api/calc/non-business-land-judgment/route.ts 에서 export
export type NonBusinessLandJudgmentResponse = {
  /** 엔진 정본 — 계산기 result.nonBusinessLandJudgmentDetail과 JSON 기준 동일(P1). Date는 JSON 경유 시 ISO 문자열 */
  judgment: NonBusinessLandJudgment;
  /** 입력했는데 이 판정에 쓰이지 않은 칸 — 서버가 못박는다(화면이 역산하지 않는다) */
  inputEffects: NblInputEffects;
};
```

### 4.2 `judgment`가 이미 싣고 있는 것 → 화면 항목 매핑 (신규 필드 0)

| 화면 항목 | 필드(`non-business-land/types.ts`) |
|---|---|
| 비사업용 여부 · 사유 | `isNonBusinessLand`(:430) · `judgmentReason` |
| 기간기준 상세 | `totalOwnershipDays` · `businessUseDays` · `gracePeriodDays` · `effectiveBusinessDays` · `businessUseRatio` · `criteria`(§1 라벨 주의) · `periodEvaluation`(`basis`: `usage_periods` / `state_history` / `not_judged` 등 — `engine.ts:358-360`) |
| 부분 비사업용 면적비율 | `areaProportioning`(`totalArea`·`businessArea`·`nonBusinessArea`·`nonBusinessRatio`·`legalBasis[]`) · **`surcharge.nonBusinessAreaRatio`**(`engine.ts:385` — 계산기가 `nonBusinessLandAreaRatio`로 주입하는 값과 **같은 출처**) |
| 무조건 사업용 의제 반영 | `unconditionalExemption`(`isApplied`·`reason`·`detail`) — 성립하면 지목별 judge는 돌지 않는다(`engine.ts:84-109`) |
| 양도일 의제(§168의14②) 반영 | `deemedTransfer`(`engine.ts:374-379` — **지목이 소비하고 사유·의제일이 있을 때만** 실린다) |
| 도시편입 유예 | `urbanIncorporationGrace` |
| 유예(부득이한 사유) 반영 | `gracePeriodDays` + (지목이 소비하지 않으면) 엔진 경고 `engine.ts:124-129`. **반영 여부 echo는 없다 → `inputEffects`** |
| 근거 조문 | `appliedLawArticles[]` · `judgmentSteps[].legalBasis` |
| 경고 · 확인 필요 | `warnings[]`(자유 문장 — 별도 구조 없음. 카드가 「주의사항」으로 렌더, `NonBusinessLandResultCard.tsx:379`) |
| 이월과세 안내 | 이월과세면 `warnings[0]`에 기산일·해석례 문장(`engine.ts:50-57`) |
| 중과 효과 | `surcharge.additionalRate`(0.10 고정 — **Q-2 전까지 화면에 숫자로 쓰지 않는다**) · `longTermDeductionExcluded`(2016.1.1. 전 양도만 true, `engine.ts:396`) |

**확인 필요 문장을 서버가 분류하지 않는다**: `warnings`에서 「확인 필요」 부분 문자열로 가르는 것은 문구 의존 휴리스틱이라 채택하지 않는다(D-E4). 카드 전체 「주의사항」으로 충분하다.

### 4.3 `inputEffects` (신규 echo — 표시 전용, 판정 불변)

위젯이 「가산됩니다」라고 안내하던 입력이 판정에 닿지 않는 사고가 이미 있었다(`engine.ts:119-124` NBL2611-V2-C1). 화면이 `consumes*`를 다시 부르면 두 번째 진실이 되므로(`feedback_aggregate_display_rederives_engine_value`) 서버가 한 번만 계산한다.

```ts
type NblInputEffect = "applied" | "ignored_by_category" | "overridden_by_unconditional" | "not_declared";
type NblInputEffects = {
  gracePeriods: NblInputEffect;        // input.gracePeriods.length>0 ? (무조건 의제면 overridden · !consumesGracePeriods(landType)면 ignored · 그 외 applied) : not_declared
  deemedTransfer: NblInputEffect;      // 단일 진실 = judgment.deemedTransfer 존재(applied) · 사유 선언했는데 없음 → 무조건 의제면 overridden, 아니면 ignored
  urbanIncorporation: NblInputEffect;  // input.urbanIncorporationDate ? (무조건 의제 → overridden · consumesUrbanIncorporationDate=false → ignored · else applied) : not_declared
};
```

- 판정 술어는 **이미 단일 소스**인 `consumesGracePeriods`(`land-category.ts:139`) · `consumesPeriodJudgmentDate`(:79) · `consumesUrbanIncorporationDate`(:134)를 그대로 부른다. 새 지목 표를 만들지 않는다.
- 위치: `lib/tax-engine/non-business-land-menu-effects.ts`(순수·DB 없음). **엔진 파일은 수정하지 않는다**(echo는 엔진 반환 + input만으로 계산).
- 앵커 A-6(§6)이 「`gracePeriods === "ignored_by_category"` ⇔ 엔진 `warnings`에 `engine.ts:124`의 문장이 있다」를 전 지목 격자로 고정한다 — 술어가 엔진과 갈라지면 즉시 실패.

### 4.4 이력(D3) 관점의 요건

- 이력 `resultData`는 위 응답의 `data`를 그대로 저장한다. Date는 이미 문자열이라 직렬화 변환이 없다. `finiteJson`이 NaN·Infinity를 막으므로 이력에 깨진 숫자가 들어가지 않는다.
- 이력 dedup 키(`lib/storage/business-key.ts:85`)·제목(`title-generator.ts:19`)·세목 등록(`lib/storage/types.ts:21` · `tax-type-routes.ts:28` · `history-resume-entry.ts:116` · `HistoryClient.tsx:41,97` · `HistoryDetailDrawer.tsx:84`)은 **UI·저장 계획서 소관**이다. 엔진 측 요건은 하나: 소재지(`addressJibun`/`addressRoad`)가 비면 서로 다른 토지가 같은 키로 덮어쓴다(`transfer-tax-validate-asset.ts:185-193`) — 메뉴 ⑧도 같은 이유로 소재지를 필수로 한다.

---

## 5. ④⑧ 정합 (요청 4)

### 5.1 ④ 클라이언트 본문 — 함수 새로 쓰지 않는다

`lib/calc/non-business-land-judgment-api.ts`:

```ts
export function buildNblJudgmentApiBody(asset: AssetForm, transferDate: string) {
  const raw = buildNonBusinessLandRaw(asset, transferDate);   // 계산기 ④와 같은 함수 (non-business-land-request.ts:149)
  return raw ? { nonBusinessLandRaw: raw } : undefined;        // undefined = ⑧이 먼저 막았어야 하는 상태(계산기와 같다)
}
```

- 메뉴의 토지 폼 상태는 **`AssetForm` 호환 레코드**여야 한다. `buildNonBusinessLandRaw`·`evaluateUnconditionalExemption`(`nbl-unconditional-exemption-status.ts:242`)·`validateNblDetailedJudgment`가 모두 `AssetForm`을 받고, 위 §2.1의 비-`nbl*` 칸을 읽는다. 별도 폼 타입을 만들면 이 세 함수를 어댑터로 감싸야 하고, 어댑터가 한 칸을 빠뜨리는 순간 「메뉴와 계산기가 다른 답」이 된다(UI 계획서가 이 제약을 받는다 — 짝 문서 확인 필요, V-1).
- 이 때문에 **`NblSectionContainer`를 그대로 마운트할 수 있다**(`asset`·`onAssetChange`·`transferDate` props — `NblSectionContainer.tsx:69-79`).

### 5.2 ⑧ — 재사용할 기존 검증 (메뉴 전용 신규 규칙을 최소화)

`lib/calc/non-business-land-judgment-validate.ts`(순수):

| 단계 | 재사용 함수 | 비고 |
|---|---|---|
| ① 토지 기본 | **소재지**: `addressJibun`/`addressRoad` 비면 차단 — 계산기와 **같은 문구**(`transfer-tax-validate-asset.ts:191-193`, 해당 규칙은 모듈 내부라 **같은 문구·같은 조건을 얇은 헬퍼로 호출할 수 있는지 V-8**) · **취득일·양도일 필수·순서**: R2·R3와 같은 조건 | 소재지는 재촌 판정의 시군구 코드(`nblLandSigunguCodeOf`, `lib/calc/nbl-land-sigungu.ts`)와 이력 dedup 키의 원천 |
| ① 취득원인 | 상속이면 `inheritedDecedentDateError`(`transfer-tax-validate-acquisition.ts:138`) | **`export` 1단어 추가 — 이 계획서가 유일하게 기존 파일에 요청하는 변경.** 대안(조건 2줄 복제)은 R4와 3중 복제가 되어 채택하지 않는다 |
| ② · ③ 전체 | **`validateNblDetailedJudgment(asset, label, transferDate, { floorDate })`** (`transfer-tax-validate-nbl.ts:104`) · `floorDate = stateHistoryFloorDate({assets:[asset], assetSplitMode}, asset)`(`transfer-tax-validate-nbl-state-history.ts:53`) | 지목·용도지역·면적 > 0·도시지역 행정구역·행 검증·의제일·상태 이력 등 **전부 포함**. P4로 단독 호출 가능 확인 |

- ⑧↔⑫′ parity: ⑧ 통과 ⇒ 메뉴 route가 400을 내지 않아야 한다(§6 B 격자). 반대(⑧ 차단인데 API는 통과, 예: 면적 0 · 소재지 없음)는 허용된다 — 계산기도 같다.
- **3중 패턴**: UI 표시 fallback이 있는 칸은 ④·⑧이 같은 fallback을 쓴다. 메뉴 UI가 NBL 칸에 새 fallback을 만들지 않는다(`NblSectionContainer`가 쓰는 `nblLandSigunguCodeOf` 등 기존 leaf만).

### 5.3 API 400 parity

| 입력 결함 | 메뉴 route | 계산기 route | 상태 |
|---|---|---|---|
| raw 내부 refine 위반(기간 행·유예 행·이력·13호 등) | 400(같은 `refineNonBusinessLandRaw`) | 400 | 같은 스키마 — 자동 정합 |
| 상속 피상속인 취득일 없음 | 400(R4) | 400 | R4로 정합 |
| 취득일 ≥ 양도일 | 400(R3) | 400 | R3로 정합 |
| 취득일·양도일 해석 불가 | 400(R2) | 계산기 top-level 날짜가 먼저 400 | 메뉴가 500이 되지 않도록 R2 |
| 상세 판정 OFF | 400(R1) | (`isNonBusinessLand` 플래그 경로) | 메뉴 전용 |
| 지목 비었고 의제도 불성립 | 400(`LAND_TYPE_REQUIRED_MESSAGE`, raw refine) | 400 | 자동 정합(P4 `raw: undefined` · ⑫ 400) |

---

## 6. Parity 앵커 · mutation 계획 (요청 5)

공용 하니스(확인): `__tests__/calc/_helpers/redev-one-house-route.ts:27 captureBody` · `:44 postTransfer` · 표 `__tests__/tax-engine/_helpers/nbl-state-history-e3-3b-table.ts:100 e3dBRowRaw` · 선례 `__tests__/api/nbl-state-history-e3-3b-route.anchor.test.ts`(vi.mock·`formOf`·`run`).

| id | 파일 | 단언 | 격자 |
|---|---|---|---|
| **A-1** 같은 사실 → 같은 판정 | `__tests__/api/non-business-land-judgment-route.parity.anchor.test.ts` | `captureBody(form).nonBusinessLandRaw`를 **메뉴 route**에 `{nonBusinessLandRaw}`로 POST → `data.judgment` `toEqual` `postTransfer(body).result.nonBusinessLandJudgmentDetail` | P1 5종 + `E3D_B_ROWS` 전 행(주택 철거 이력) + 전 6지목 + 무조건 의제 5호 각각 + 상속(2006 이전·3년) + 수유자 + 이중 유예 |
| **A-2** rules 배선 | 같은 파일 | `vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL")` + `preloadTaxRates` mock이 `farmlandDistanceKm:10`을 돌려주면 **메뉴·계산기 둘 다** 비사업용(P6 사례 — 직선 22.2km) | P6 1건 + 대조(30km) |
| **A-3** ⑧ 통과 ⇒ 200 | `__tests__/calc/non-business-land-judgment-validate.anchor.test.ts` | 격자 모든 폼에서 `validate…()===null` ⇒ 메뉴 route 200 | A-1 격자 재사용 |
| **A-4** 400 parity | 같은 파일 | §5.3 표 6행 각각: 메뉴 400 ⇔ 계산기 400(NBL 경로 결함에 한해) | 상속·순서·날짜·지목 |
| **A-5** 핸드오프 동치(D1) | `__tests__/calc/nbl-judgment-handoff.anchor.test.ts` | 메뉴 폼 `buildNonBusinessLandRaw(asset, td)` ≡ 핸드오프 후 계산기 store의 `buildNonBusinessLandRaw(assets[0], td)` (deep-equal) — **같은 raw ⇒ 같은 답**이 D1의 전제 | A-1 격자 |
| **A-6** `inputEffects` | `__tests__/tax-engine/non-business-land-menu-effects.test.ts` | 전 지목 × 유예 선언 유무 × 무조건 의제 유무: `gracePeriods==="ignored_by_category"` ⇔ `engine.ts:124` 문장 존재 · `deemedTransfer==="applied"` ⇔ `judgment.deemedTransfer` 존재 | 6지목 × 3 |
| **A-7** NaN 가드 | `__tests__/api/calc-routes.non-finite-guard.test.ts` `ROUTES`(`:39`)에 새 route 추가 | 정적: 성공 응답을 `NextResponse.json`으로 직접 만들지 않음 | — |

**착수 전 mutation(격리 사본 `git archive HEAD` → 1줄 무력화 → 실패 앵커 확인 → 삭제)**:

| id | 무력화 | 정확히 실패해야 하는 앵커 |
|---|---|---|
| M-1 | `judgeNonBusinessLand(input, rules)` → `judgeNonBusinessLand(input)` | A-2만 (P5: 일반 사례는 못 잡는다) |
| M-2 | 래퍼 R4 삭제 | A-4 상속 행 |
| M-3 | 래퍼 R3 삭제 | A-4 순서 행 |
| M-4 | 래퍼 R2 삭제 | A-4 날짜 행(500) |
| M-5 | `buildNblEngineInput` 대신 인라인 매핑(한 칸 누락) | A-1 해당 행 |
| M-6 | `inputEffects`가 `consumesGracePeriods` 반전 | A-6 |
| M-7 | ④ 래퍼가 raw의 `transferDate` 누락 | A-1 전 행(400) |

> 일반 판정 사례만으로는 `rules` 배선이 증명되지 않는다(P5) — A-2의 P6류 **rules 민감 사례를 반드시 격자에 넣는다**. M-1 실패 확인 전에 「parity 확인」이라고 보고하지 않는다.

---

## 7. 파일 구성 · PR 분할

| 신규 파일 | 줄 수 예상 | 내용 |
|---|---|---|
| `app/api/calc/non-business-land-judgment/route.ts` | ~80 | §3.1 |
| `lib/api/non-business-land-judgment-schema.ts` | ~70 | §3.2 래퍼 + R1~R4 |
| `lib/tax-engine/non-business-land-menu-effects.ts` | ~60 | §4.3 |
| `lib/calc/non-business-land-judgment-api.ts` | ~30 | §5.1 |
| `lib/calc/non-business-land-judgment-validate.ts` | ~80 | §5.2 |
| 테스트 5파일 | — | §6 |

**기존 파일 변경 3줄 이하**: `transfer-tax-validate-acquisition.ts`(`export` 1단어) · `calc-routes.non-finite-guard.test.ts`(`ROUTES` 1줄) · 저장 세목 등록은 UI·저장 계획서 소관. 800줄 근접 파일을 새로 여는 일 없음.

**PR 순서**(Do는 시퀀셜 — 엔진이 타입·헬퍼·anchor 선처리 → UI가 ⑤⑥⑦):
- **E1**: A-7 `ROUTES` 추가 전 mutation M-1~M-7 실측 → route + 스키마 + `inputEffects` + A-1·A-2·A-4·A-6.
- **E2**: ④⑧ leaf(`…-api.ts`·`…-validate.ts`) + A-3.
- **E3**(UI와 같은 PR 묶음): 핸드오프 leaf + A-5 — 핸드오프 leaf는 `one-house-judgment-handoff.ts` 선례처럼 **store 쓰기 + 이동 두 함수로 분리**(이동하는 쪽을 편집 화면에서 부르면 튕긴다 — 같은 파일 머리 주석).

---

## 8. 결정 레지스터

### 8.1 D-E n — 설계 확정 (사용자 결정 불필요)

| id | 내용 | 근거 |
|---|---|---|
| D-E1 | 요청 = `{ nonBusinessLandRaw }`, `propertySchema` 재사용 안 함 | §3.3 · P1 |
| D-E2 | 판정 후처리(주택 수·§155⑳ 등)가 NBL에는 없다 — 파이프라인 함수를 새로 두지 않고 route에서 직접 호출 | 계산기 NBL 경로도 `judgeNonBusinessLand` 1회(`judgment-steps.ts:261`) |
| D-E3 | 응답에 세액·세율을 싣지 않는다(판정 메뉴) | D1 — 세액은 계산기 |
| D-E4 | `warnings`를 서버가 분류하지 않는다 | §4.2 |
| D-E5 | 소재지·취득일·양도일·취득원인 등 ①단계 입력은 `AssetForm` 호환 필드로 받는다 | §5.1 |
| D-E6 | 핸드오프는 **판정을 복사하지 않는다**(재판정). A-5가 raw 동치로 고정 | `one-house-judgment-handoff.ts` 「재판정은 여기서 하지 않는다 (D-3)」 선례 |

### 8.2 Q-n — 사용자 결정 필요

| id | 질문 | 선택지 | 추천 |
|---|---|---|---|
| **Q-1** | **이월과세(`carryover_gift`) 취득원인을 메뉴에서 받는가** | (a) 받고 A(증여자 취득일 기준)로만 판정 + 「배제 시 수증일 기준 — 계산기에서 확정」 고지 / (b) **v1은 메뉴 취득원인에서 제외**하고 「이월과세 토지는 양도세 계산기 판정 도움에서」 안내 / (c) A·B 둘 다 계산(증여등기일 입력 추가) | **(b)** — 이월과세 A/B는 세액 비교(영 ②3호)로 갈려(`transfer-tax-carryover-inputs.ts:94-95`) 메뉴가 A만 보이면 「같은 사실 → 같은 답」이 이 부분집합에서 깨진다(A-1·A-5가 이 격자를 못 가진다). (a)는 고지 한 줄로 잘못된 안심을 줄 위험, (c)는 D2 4단계에 없는 입력(증여등기일·평가액 아님 — 날짜만이라도)이 필요 |
| **Q-2** | **결과에 비사업용의 「세율 효과(+10%p)」를 숫자로 보이는가** | (a) 숫자 없이 「비사업용이면 계산기에서 세율·장기보유공제를 적용」만 / (b) +10%p·장특 배제 표기 + 위기취득(취득 2009.3.16.~2012.12.31.)·양도 유예(2009.3.16.~2015.12.31. 지정지역) 해당 여부 고지 | **(a)** — (b)는 지정지역 선언·취득일 해석(이월과세·상속 취득일)이 세율 단계 사실이라 메뉴가 알 수 없는 입력을 요구한다(`nbl-rate-deferral-era.ts` · `transfer-tax-rate-calc.ts:451`). `judgment.surcharge.additionalRate`가 항상 0.10을 싣는 것(`engine.ts:383`)을 화면이 그대로 믿으면 위기취득 토지에서 틀린 효과를 말하게 된다 |
| **Q-3** | **주택부수토지·별장 부수토지 지목을 포함하는가**(D5 「겸용·건물 부수토지 제외」의 경계) | (a) 6지목 전부(= `NblSectionContainer`의 `LAND_TYPE_OPTIONS`) / (b) 농지·임야·목장용지·기타토지 4종만 | **(a)** — D1이 입력 위젯 재사용이고 이 두 지목도 법 §104의3①5·6호 **토지 단독 양도 판정**이다(건물이 같이 팔리는 구조가 아님). 정착면적 칸이 필요하며 ⑧이 이미 요구한다 |

### 8.3 V-n — 미검증 (착수 차단 여부)

| id | 항목 | 차단 | 확인 방법 |
|---|---|---|---|
| V-1 | UI 계획서가 메뉴 토지 상태를 `AssetForm` 호환으로 두는가(§5.1 제약) | **차단** | 짝 문서 대조 — 어긋나면 어댑터 필요(A-5가 어댑터 동치를 고정) |
| V-2 | 메뉴 route 응답 전체의 JSON 직렬화 안전성(`NaN`) | 비차단 | A-7 · `finiteJson` |
| V-3 | 비-`nbl*` 자산 칸 목록(§2.1)의 **완전성**(grep은 `asset.`·`share.` 접두어만 봤다 — 구조분해로 읽는 칸은 놓쳤을 수 있다) | 비차단 | 핸드오프 leaf 작성 시 `buildNonBusinessLandRaw` 호출 전후로 칸을 하나씩 비워 raw 변화 실측 |
| V-4 | 계산기 route가 raw 면적 ≤ 0·`nblUseDetailedJudgment:false`+raw 존재를 400으로 막는가 | 비차단 | probe — 메뉴가 더 엄격해도 parity(허용 방향)지만 A-4 표를 확정하려면 필요 |
| V-5 | 같은 폼의 `rules`가 DB 있는 환경과 fallback 환경에서 같은가(P1·P6은 fallback만) | 비차단 | A-2가 mock으로 주입. 운영 DB는 `NEXT_PUBLIC_SUPABASE_URL` 있는 환경에서 수동 1건 |
| V-6 | `parseRatesFromMap` 부분 맵 throw(P7) — 메뉴는 누진세율이 필요 없는데 같이 죽는다 | 비차단 | 계산기도 같은 맵이면 같은 throw. 규칙 행만 따로 파싱하려면 `transfer-tax-helpers.ts:149-160`의 병합 로직을 복제해야 해서 채택하지 않음 |
| V-7 | 메뉴 route가 `judgment-request.ts`(1주택 전용 import 다수)를 import해 서버 번들이 커지는 영향 | 비차단 | 다주택 중과 route가 같은 방식 — 실측 불요라고 보되 `next build` 라우트 크기 1회 확인 |
| V-8 | 소재지 필수 규칙(`transfer-tax-validate-asset.ts:191-193`)을 메뉴가 **함수로** 재사용할 수 있는가 | 비차단 | 모듈 내부 조건이면 같은 조건·같은 문구를 메뉴 leaf에 두고 A-3 격자로 문구 동치를 고정(「문구 두 벌」 위험은 이 한 줄뿐) |
| V-9 | 메뉴 화면 문구가 새 조문을 인용하면 `additions-transfer-decree*.ts` 등록 필요 | 비차단 | UI 문구 확정 후 `npm run verify:legal` |
| V-10 | 계산기에서 §66 자경 편입 부분감면을 켜면 `nblUrbanIncorporationDate` 빈칸이 편입일로 **채워진다**(`non-business-land-request.ts:131-140`) — 메뉴는 감면이 없어 이 fallback이 없다 | 비차단(설명 가능한 차이) | 핸드오프가 **사용자가 입력한 값만** 넘기므로 값이 있으면 같고, 계산기에서 감면을 새로 켠 경우만 갈린다 → 핸드오프 후 화면 고지 1줄을 UI 계획서에 요청 |
| V-11 | `needsRedirect`(별장→주택부수 재분류) 경로의 `judgment`가 JSON 경유 시 카드·이력에서 정상인가 | 비차단 | A-1 격자에 별장 재분류 행 포함 후 카드 렌더 확인(UI) |
| V-12 | 법 §104의3·영 §168의6·§168의14는 이번 세션에 본문을 읽었으나, 영 §168의14③ 개별 호의 **시행일 연혁**(양도일별 유효본)은 메뉴가 새로 판단하지 않는다(엔진 소관) | 비차단 | 엔진 변경 없음 — `npm run verify:legal` 현행 통과 확인만 |

---

## 9. 함정 (T-n)

- **T-1** 새 raw 칸이 생기면(E3 진행 중) 메뉴가 자동으로 따라가야 한다 — 그래서 메뉴 래퍼에 칸 목록을 **하드코딩하지 않는다**(R1~R4는 판정에 직접 필요한 4칸만). 칸 목록을 가진 것은 `nonBusinessLandRawBaseSchema`와 ④ prefix-pick(`nbl*`)뿐이다.
- **T-2** `new Date(x)` 직접 호출 금지 — R2는 `toOptionalDate`.
- **T-3** 응답을 `NextResponse.json`으로 직접 만들지 않는다(A-7).
- **T-4** 이월과세를 허용한다면(Q-1 (a)/(c)) 래퍼 R3·R4의 기준일은 raw의 `acquisitionDate`(= `nblAcquisitionDateOf` = 증여자 취득일)이지 와이어 증여 등기일이 아니다 — 계산기 property 수준 refine(`:291`)은 와이어 취득일을 본다.
- **T-5** `judgment.surcharge.additionalRate`·`longTermDeductionExcluded`는 **세율 단계 전의 판정 부속값**이다(Q-2). 화면이 「이 토지는 +10%p」라고 쓰면 위기취득·유예 구간에서 틀린다.
- **T-6** `criteria` 키 이름이 옛 3기준 이름이다(§1) — 라벨을 키 이름에서 만들지 않는다.
- **T-7** 핸드오프 leaf는 이동 함수와 store 쓰기 함수를 분리한다(선례 헤더).

---

## 10. 재제안 금지·기결정 준수 확인

- 「자동 안분 fallback 금지」: 지분율은 `ownershipNumerator/Denominator` 기본 100/100(단독) — 메뉴가 지분 칸을 열지 않는 것은 D5의 「단독」 해석(**V-13: D5 「단독」을 단독 소유로 읽었다 — 공유지분 판정이 필요하면 별도 결정**).
- 메모리 「강행규정에 토글 달지 말 것」 · 「법 근거 없이 불리 적용 금지」: R1~R4는 계산기가 이미 400으로 막는 조건의 거울이다(메뉴가 새 불리 규칙을 만들지 않음).
- 메모리 「[부분 비사업용 혼합 보상]」 · 「§104⑤ 크로스 엔진」: 메뉴는 세액·통산을 다루지 않으므로 해당 없음.
- 「useEffect → store 미러링 금지」: 이 문서는 UI를 정하지 않는다 — UI 계획서가 지킨다.

---

## 11. 자가 검토

1. **「같은 폼 → 같은 답」의 증명 범위**: A-1은 계산기 **NBL 판정 한 단계**(STEP 0.6)의 동치만 증명한다. 계산기가 STEP 0.6 앞에서 조기 반환하는 경로(가업승계 `fbResult` 등 — `transfer-tax-precalc.ts:158`)에서는 `nonBusinessLandJudgmentDetail`이 비어 비교 불가다 — A-1 격자는 일반 토지 양도(조기 반환 없음)로 한정한다(**V-14**: 토지 단독에서 조기 반환하는 경로 열거는 미실측).
2. **세율 단계 사실의 비-parity**(Q-1·Q-2)를 숨기지 않았다 — 메뉴 결과는 「판정」이지 「이 토지에 +10%p가 붙는다」가 아니다.
3. **재제안 위험**: Q-3 (a)는 사용자가 D5를 더 좁게 의도했다면 뒤집힌다 — 질문으로 남겼다.
4. 법령 연혁(영 §168의14③ 호별 시행일)과 엔진 내부 판정의 정확성은 이 문서의 범위가 아니다(엔진 변경 0).
