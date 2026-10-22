# 이월과세 × 증여자 신축·증축 건물 — 「소득세법」 §114조의2 환산·감정가액 5% 가산세 수정 계획서

**상태**: Plan 작성 완료 (2026-10-22) — 구현 전. 사용자 확인이 필요한 항목은 §11 Q-1~Q-5.
**브랜치**: `fix/carryover-donor-built-114-2` (origin/master 1238c1b11 기준)
**선행 계획과의 관계**: `transfer-split-part-carryover-p6.plan.md` §6 Q3(a) 「증여자 신축 현행 유지(가산세 안 붙임)」는 **이 계획의 사용자 확정 결정(2026-10-22)으로 대체**된다. 그 계획의 「해석 확보 후 자산 전체 이월과세와 함께 바꾸는 별건」이 바로 이 문서다.

---

## 0. 한 줄 요약

이월과세(§97의2①)에서 증여자가 신축·증축한 건물을 5년 안에 양도하면서 증여자 취득가액을 **환산취득가액(또는 감정가액)** 으로 쓰면 §114조의2 가산세(해당 건물 환산·감정가액의 5%)를 붙인다. 현재는 **어느 경로에도 입력이 없고**(자산 전체·일반건물·부담부증여) 파트 이월과세(P6)만 「확인 필요」 고지가 있다. 새 입력 `donorBuilt`(증여자 신축·증축 사실)를 이월과세 서브객체에 두고, 가산세는 **기존 `penaltyAxis` 채널**(finalize·손실 조기반환이 이미 읽는다)에 실어 보내므로 finalize·loss-return·aggregate·결과 4뷰의 합산 로직은 **거의 바뀌지 않는다**. 바뀌는 곳은 (1) 이월과세 해결자 3곳(자산 전체·파트·부담부증여)이 채택 입력에 축을 싣는 것, (2) 입력 파이프라인(14지점), (3) 고지 문구다.

---

## 1. 사용자 확정 결정 (2026-10-22 — 재론 금지)

「거주자」(소득세법 §1조의2①1호)는 신분 개념이라 증여자도 포함 → 이월과세에서 증여자가 신축·증축한 건물에도 §114조의2 적용.

| # | 결정 | 이 계획에서의 반영 |
|---|---|---|
| D1 | 5년 기산 = **증여자 신축일**(증축이면 증여자 증축일) ~ 양도일 | 새 입력 `donorBuilt.constructionDate` (§3.1) · 판정은 기존 `calculateBuildingPenalty` 재사용 |
| D2 | base = §97의2에 따라 계산한 **증여자 기준 환산취득가액(또는 감정가액)**, 증축은 증축 부분 | §3.3 base 표 |
| D3 | §97의2②3호 결정세액 비교에서 가산세는 **양쪽(A 적용·B 미적용) 모두**에 적용 | §3.5 · §5.1 실측 · **Q-1** (메인 세션 해석 = 권장안, 다른 해석과 갈리는 셀 실측 첨부) |
| D4 | **건물 부분에만** 적용(토지분 제외) | §3.3 — 일체 주택의 건물분 base 얻는 법은 **Q-2** |

> 이 문서는 「적용할지」를 묻지 않는다. 묻는 것은 D3의 세부 해석(Q-1)과 D4를 일체 주택에서 구현하는 방법(Q-2) 등 **결정을 구현으로 옮길 때 남는 선택**뿐이다.

---

## 2. 법령 근거 (KoreanLaw MCP 원문 확인 2026-10-22)

| 조문 | 원문 요지 | 이 계획에서의 쓰임 |
|---|---|---|
| 소득세법 §114조의2① (MST 280405, 시행 2026-07-01 본 — 2026-01-01 본과 동일) | 「거주자가 건물을 신축 또는 증축(증축은 바닥면적 합계 85㎡ 초과에 한정)하고 그 건물의 취득일 또는 증축일부터 5년 이내에 해당 건물을 양도하는 경우로서 제97조제1항제1호나목에 따른 감정가액 또는 환산취득가액을 그 취득가액으로 하는 경우에는 해당 건물의 감정가액(증축은 증축한 부분) 또는 환산취득가액(증축은 증축한 부분)의 100분의 5를 **제92조제3항제2호에 따른 양도소득 결정세액에 더한다**」 | D1·D2. 「취득가액으로 하는 경우」 = 이월과세에서는 §97의2①1호가 정한 증여자 취득 당시 §97①1호 금액 |
| §114조의2② | 제92조제3항제1호 산출세액이 없어도 적용 | 양도차손·산출세액 0 경로(`loss-return`)에도 같은 축 필요 |
| §97의2①1호 | 취득가액은 배우자·직계존비속이 취득할 당시의 §97①1호 금액 | 증여자 환산/감정이 §114조의2의 「취득가액」이 되는 연결고리 |
| §97의2②3호 | 「제1항을 적용하여 계산한 양도소득 **결정세액**이 제1항을 적용하지 아니하고 계산한 양도소득 **결정세액**보다 적은 경우」 이월과세 배제 | Q-1 근거 — 비교 대상이 「결정세액」 |
| **소득세법 §92③** | 2호 **결정세액** = 산출세액 − §90 감면. **3호 총결정세액 = 2호 + §114조의2·§115·국기법 §47의2~4 가산세** | 🔑 §114조의2 가산세는 3호(총결정세액)에 속하고 ②3호는 2호(결정세액)를 비교한다 → **비교는 가산세와 무관**(§5.1). 코드도 이미 이 읽기다: `transfer-tax-aggregate-carryover-scope.ts:5-12`(비교 단위=§92③2호 결정세액)·`:60`(「결정세액(가산세 前 · §92③2호)」) · 단건 비교는 `finishScenarios`가 `determinedTax`(가산세 前)로 한다(`transfer-tax-carryover.ts:567-568`) |
| 소득세법 §1조의2①1호 | 「거주자」= 국내에 주소를 두거나 183일 이상 거소를 둔 개인 | D1~D4의 전제(사용자 확정). 증여자 신분 판정 입력은 만들지 않는다 |
| 소득세법 시행령 §162①4호 | 자기가 건설한 건축물의 취득시기 = 건축법 §22② 사용승인서 교부일(사실상 사용일·임시사용승인일이 빠르면 그날) | 신축일 입력 칸의 안내 문구 근거. 증여받은 자산의 취득시기는 5호(증여일)라 **수증자가 아니라 증여자의 신축일**이 따로 필요한 이유 |
| 조심2019서3934 (기존 계획서 인용) | 부담부증여 신축 건물 환산 5% 가산세 적법 — **신축자 = 양도자**인 사안 | 증여자=양도자 경로(K-5/K-7)는 이미 구현. 이번 범위(증여자≠양도자)의 직접 해석례는 없음 — 고지에 반영(§7) |

시행일 게이트(환산: 양도일 ≥ 2018-01-01, 감정: ≥ 2020-01-01, 증축: ≥ 2020-01-01 + 85㎡ 초과)는 기존 `buildingPenaltyMethodApplies`/`calculateBuildingPenalty`(`transfer-tax-building-penalty.ts:28-69`(note `:63-67`))를 그대로 쓴다. 이 부칙을 증여자 신축에 대해 다시 대조하지는 않았다 → V-4.

---

## 3. 현행 실측과 설계

### 3.1 현행 — 왜 증여자 신축이 가산세를 못 붙이는가 (file:line)

| 지점 | 현행 | 근거 |
|---|---|---|
| ④ 입력 억제 | `selfBuiltActive`가 `acquisitionCause === "purchase"`만 허용 → 이월과세 자산은 `isSelfBuilt`·`constructionDate`가 엔진에 안 간다 | `lib/calc/self-built-scope.ts:36-45`, 사용처 `lib/calc/transfer-tax-api.ts:422-425` |
| 폼 | 이월과세 서브폼 `CarryoverTaxationForm`에 신축·증축 필드 없음. 증여자 취득원인(`donorAcquisitionCause`)은 「참고 표시 전용」 | `lib/stores/calc-wizard-asset-carryover.ts:33-50` |
| 일반건물 | `isSelfBuilt`는 `gbBuildingAcquisitionCause === "newConstruction"`에서만 true → 이월과세 건물 카드는 항상 false | `lib/calc/transfer-tax-api-gb.ts:501,687` (인벤토리 조사) |
| 엔진 시나리오 | A 입력은 `{...rawInput}`을 퍼뜨릴 뿐 증여자 신축 정보를 모른다 | `lib/tax-engine/transfer-tax-carryover.ts:207-243` |
| 엔진은 막지 않는다 | 취득원인을 보지 않으므로 API 직접 호출로 `isSelfBuilt:true`를 보내면 **수증자 기준** 값으로 붙을 수 있다(막는 곳은 ④뿐) | `transfer-tax-building-penalty.ts:42` |
| P6 파트 | 건물 파트 환산을 하고도 가산세는 안 붙이고 「확인 필요」 고지만 | `transfer-tax-split-carryover-display.ts:274-277`, `p6.plan.md:88-91` |
| 부담부증여 | 이월과세 × 감정가액 × 본인 신축이면 **throw**(기산점·base 미정이라는 사유) | `transfer-tax-carryover-burdened-gift.ts:152-165`, anchor `burdened-gift-carryover-presumed.anchor.test.ts` G-4·G-4b |
| 자산 전체 | **고지도 없다** — `donor` 신축 관련 `확인 필요` 문구는 P6 파트와 겸용 부담부증여 차단문뿐(grep) | `lib/tax-engine/transfer-tax-split-carryover-display.ts:274`, `mixed-use-burdened-gift-prepare.ts:196` |

### 3.2 입력 모델 — `donorBuilt` (새 필드 vs 재사용 판단)

`CarryoverTaxationInput`(엔진)·`CarryoverTaxationForm`(폼)에 **중첩 선택 객체**를 둔다(`carryoverTaxation` Zod가 이미 13필드 parity 규약이라 객체 1개로 묶는 편이 ⑫ 누락 면적이 작다).

| 필드 | 의미 | 필수 조건 |
|---|---|---|
| `donorBuilt.buildingType` | `"new"` 신축 / `"extension"` 증축 | 토글 ON |
| `donorBuilt.constructionDate` | 증여자의 신축 취득일(영 §162①4호 사용승인일 등) 또는 증축 완공일 | 토글 ON |
| `donorBuilt.extensionFloorArea` | 증축 바닥면적 합계(㎡) | 증축 |
| `donorBuilt.buildingStdPriceAtAcquisition` | **증여자 취득(완공) 당시 그 건물분 기준시가 총액** — 신축=건물 전체, 증축=증축 부분 | 아래 §3.3 표의 「건물분 base가 자산 전체 값과 다른」 경로(일체 주택·증축) |

**기존 필드를 재사용하지 않는 이유(분리 판단)**
1. 최상위 `isSelfBuilt/buildingType/constructionDate`를 재사용하면 **수증자(양도자)의 신축**과 의미가 섞인다. 수증자는 증여받았으므로 신축할 수 없다(영 §162①5호 — 취득시기는 증여일). A·B 두 시나리오가 `{...rawInput}`을 공유해서 B(수증자 기준)까지 증여자 신축일을 읽는 오류 경로가 생긴다. 게다가 `selfBuiltActive`·`housing-flag-reset`·부담부증여 가드가 이 필드를 「매매 취득 + 본인」 전제로 읽는다(`self-built-scope.ts:36-45`, `housing-flag-reset.ts:69`).
2. `donorAcquisitionDate`와도 분리한다 — 증축은 취득일(원 건물)과 증축일이 다르고, 일체 주택은 `donorAcquisitionDate`가 토지 선취득일일 수 있다. **자동 채움 금지**(정책: 자동 안분·fallback 금지). ⑧은 `donorAcquisitionDate ≤ donorBuilt.constructionDate ≤ giftRegistryDate`만 검사한다 → **Q-3**.
3. 증여자 취득원인 `donorAcquisitionCause`는 「참고 표시 전용」이라(`calc-wizard-asset-carryover.ts:50`) 게이트로 쓰지 않는다. 대신 토글 노출 조건 = `useEstimatedAcquisition && 건물성 자산(housing|building|일반건물 건물 카드)`.

### 3.3 base 규칙 (D2·D4) — 경로별로 「건물분」을 어떻게 얻는가

| 경로 | 게이트(§114조의2) | base | 근거 |
|---|---|---|---|
| 비주택 건물 단독(`propertyType: building`) 환산(general) | 증여자 환산 | 증여자 환산취득가액 전체(`donorAcqPrice`) = 양도가 × 증여자 취득시 기준시가 ÷ 양도시 기준시가 | `transfer-tax-carryover.ts:164-174`. 건물 단독이라 토지 없음 |
| **일체 주택**(토지+건물 일체 기준시가) 환산 | 〃 | **Q-2 (b) 권장**: 양도가 × `donorBuilt.buildingStdPriceAtAcquisition` ÷ **일체 양도시 기준시가** (= 건물 양도가액 × 건물 취득시 ÷ 건물 양도시와 수식이 같다 — 일체 계약의 건물분 양도가는 기준시가 비례 안분이므로 분모가 약분된다). 증축도 같은 식에서 분자만 증축 부분 | 비이월 증축이 이미 같은 식: `resolveExtensionPenaltyBase`(`building-penalty.ts:83-103`) |
| 일체 주택, PHD/APD 환산 | — | **도달 불가로 보고 차단**: 신축·증축 후 5년 이내 양도 + 양도일 ≥ 2018 ⇒ 신축일 ≥ 2013, 개별주택가격 최초공시(2005~)·공동주택(2005~) 이후다. ⑧이 phd/apd 모드면 토글 비노출·엔진 거부 | 추정이 아니라 날짜 산술이지만 최초공시일은 사용자 입력이라 완전 보증은 아님 → ⑧에서 모드 상호배타로 차단 |
| split 파트(P6) 건물 파트 환산 | 파트 `partEstimated` | 건물 파트 환산취득가(`SplitPartResult.acquisitionPrice`) — 증축은 `splitExtensionPenaltyBase`와 같은 식으로 증축 부분 | `building-penalty.ts:161-203`. 이미 「건물 파트가 판정 축」 |
| 일반건물 건물 카드 환산 | 카드가 환산 이월과세 | 건물 카드의 증여자 환산취득가(카드 자체가 건물 파트) | `general-building-valuation.ts:316-331`(분자=증여자 취득시 기준시가, 분모=그 파트 양도시 기준시가), 카드 매핑 `general-building-route-cards.ts:208-227` |
| 부담부증여 × 이월과세 K-5(환산) | A 시나리오 | 채무비율 안분 **후** 건물 환산취득가(`building.acquisitionPrice` 또는 W-6 swap 전 `convertedAcquisitionBeforeSwap`) | 기존 `transfer-tax-burdened-gift-step.ts:144-205`(`isK5SelfBuilt`) |
| 부담부증여 × 이월과세 K-7(감정) | A 시나리오 | 안분 후 건물 감정가액(증축은 `presumedExtensionAppraisalValue` 안분) | 〃 `:106-170`(`isAppraisalSelfBuilt`) |
| 자산 전체 이월과세 + **증여자 감정가액** | — | **입력 자체가 없다**(증여자 취득가액은 실가 1칸 또는 환산 3모드). 이번 범위에서 신설하지 않음 → **Q-4** | `calc-wizard-asset-carryover.ts:45-60` |

> 관찰(범위 밖, 수정 안 함): 비이월 **일체 주택** 신축 환산은 현재 **자산 전체(토지 포함) 환산취득가**가 base다. 실측: 양도가 10억·취득시 2억·양도시 4억 → penaltyBase 500,000,000(probe p4). 결정 D4(건물분만)와 같은 논리라면 비이월 쪽도 건물분 기준시가가 맞을 수 있다. 이번 계획은 **이월과세 경로만** 다루며, 비이월 쪽은 별건으로 남긴다.

### 3.4 엔진 주입 방식 — 기존 채널 재사용 (실측 근거)

finalize STEP 10.5와 loss-return은 이미 `splitBuildingAxis ?? input.penaltyAxis ?? effectiveInput.penaltyAxis`를 읽고(`transfer-tax-finalize.ts:325-326`, `transfer-tax-loss-return.ts:104-105`) 게이트는 `effectiveInput`의 `isSelfBuilt/constructionDate/buildingType/extensionFloorArea`를 읽는다. 따라서 **채택된 시나리오 입력**(`workingInput = adoptedInput`, `transfer-tax-precalc.ts:177-198`)에 아래를 싣기만 하면 정상 경로·손실 경로·aggregate 합산이 그대로 작동한다.

```
adoptedInput += { isSelfBuilt: true, buildingType, constructionDate(=donorBuilt.constructionDate),
                  extensionFloorArea, penaltyAxis: { acquisitionMethod: "estimated"|"appraisal", base } }
```

실측으로 채널이 동작함을 확인했다(§5): ① A 채택 입력에 raw 필드를 심으면 penaltyTax 25,000,000, ② ②3호 B 채택 입력에 `penaltyAxis`만 심으면 같은 방식으로 25,000,000이 붙는다(probe p5). **finalize·loss-return·aggregate 코드는 변경하지 않는다**(회귀 면적 최소). 한 가지 예외 — 파트 이월과세(P6)는 `resolveSplitBuildingPenaltyAxis`가 **원본 `input`**(`building-penalty.ts:161`, finalize `:325`)의 `buildingType`을 읽어 증축 base를 정하므로 증축×파트 환산은 `effectiveInput`을 읽게 하는 1줄 수정이 필요하다(§4 M4, V-3).

신규 leaf: `lib/tax-engine/transfer-tax-carryover-donor-penalty.ts` (순수 함수)
- `resolveDonorBuiltPenaltyAxis(ctx)` → `{ axis, patch }`: 게이트(`donorBuilt` 존재 · 환산/감정 · 건물성) · base 계산(§3.3 표) · 증축 85㎡·미입력 오류.
- `applyDonorBuiltPenalty(input, axis)` → 채택 입력 사본.
- 후크: `transfer-tax-carryover.ts` `finishScenarios` 꼬리(adopted 확정 직후, `:567-587`) · `transfer-tax-split-carryover.ts` 6단계 `adoptedInput`(`:289`) · 부담부증여 A(`transfer-tax-carryover.ts:238-275`) · 일반건물 카드는 단건 엔진을 그대로 타므로 자동. `transfer-tax-carryover.ts`가 688줄이라 **본문에는 후크 호출 10줄 미만만** 넣는다(§9).

### 3.5 ②3호 비교와 B 채택 (D3)

- **비교는 바뀌지 않는다.** 두 시나리오에 같은 가산세를 더하든 안 더하든 비교 값(`determinedTax`, 가산세 前)은 같다. 코드의 기존 읽기(§2 표)가 이미 그렇다.
- 바뀌는 것은 **B가 채택될 때 최종 세액에 가산세를 포함하는가**뿐이다. D3(메인 세션 해석)에 따라 ②3호까지 도달해 B로 갈린 경우에도 **A측 base로 계산한 같은 금액**을 싣는다. 구현은 B 입력에 `penaltyAxis`만 싣는 것(위 실측).
- 적용배제가 **이월과세 자체를 확정**한 경우(②1호 수용 · ②2호 1세대1주택 · ③ 기간·관계 부적격)는 B를 `buildInputB` 그대로 반환하는 조기 반환(`transfer-tax-carryover.ts:120-145`, `:534-549`)이라 **후크를 타지 않는다 → 가산세 없음(권장, Q-1-b)**.

---

## 4. 케이스 매트릭스 — 영향 경로 전수

(「경로 인벤토리」는 코드 판독 기준이며 실행 검증은 안 했다. 확인 못한 것은 V-n으로 올렸다.)

| ID | 경로 | carryover_gift 열림 | 현행 | 변경 | PR |
|---|---|---|---|---|---|
| M1 | 단건 비주택 건물(`building`) 자산 전체 환산 | 열림 `CompanionAcquisitionCauseSection.tsx:44`, ④ `transfer-tax-api.ts:706` | 가산세 없음 | 신축·증축 모두. base = 증여자 환산취득가 | 1·2 |
| M2 | 단건 일체 주택(`housing`) 자산 전체 환산 general | 열림 | 가산세 없음 | Q-2(b): 건물분 기준시가 칸 추가 | 1·2 |
| M3 | 일체 주택 PHD/APD 환산 | 열림 | — | 토글 비노출·⑧/엔진 차단 | 1·2 |
| M4 | 주택 split 파트 이월과세 B(건물만)·C(통째) 환산 | `LandPartCauseBlock.tsx:52,63`, `transfer-land-part-cause.ts:119` | 고지만 | 건물 파트 환산취득가 base. 증축은 `effectiveInput` 판독 | 3 |
| M5 | split 토지만(A) · 건물은 본인 취득 | 열림 | 변화 없음 | **대상 아님**(토지는 §114조의2 제외, 건물은 본인 신축 경로 그대로) | — |
| M6 | 일반건물(`general_building`) 건물 카드 환산 | `GeneralBuildingAcquisitionCards.tsx:72,520,545,655`, ④ `transfer-tax-api-gb-carryover.ts:299` | 가산세 없음(`isSelfBuilt`가 newConstruction 한정, `transfer-tax-api-gb.ts:501,687`) | 카드 `carryoverTaxation.donorBuilt`가 단건 엔진 후크를 탄다. 카드 매핑이 `donorBuilt`를 보존하는지 확인 필요 | 5 |
| M7 | 부담부증여 × 이월과세 K-5(환산) | `transfer-tax-validate-bg.ts:159` | 본인 신축 플래그만 | A 입력에 증여자 신축 → 기존 step 분기를 탄다. **B(K-5)는 양도인 기준 환산이라 base가 다르다 → R1은 A측 base로 고정** | 4 |
| M8 | 부담부증여 × 이월과세 K-7(감정) | 〃 | **throw**(`carryover-burdened-gift.ts:152-165`) | throw를 「`donorBuilt` 없이 본인 신축 플래그만 온 경우」로 좁혀 유지, `donorBuilt`가 있으면 통과. G-4·G-4b 반전 | 4 |
| M9 | 일반건물 부담부증여 × 이월과세(F27) | `general-building-route-carryover.ts:63` | 가산세 없음 | 카드 2회 호출(A·B)에 A측 건물 base 전달 — 구조가 달라 PR-4 안에서 별도 확인 | 4 |
| M10 | 함께 양도(컴패니언) 이월과세 자산 | `transfer-tax-schema-companion.ts:278` | 억제 | 컴패니언 ④·⑫·`bundled-split-helpers.ts:625` Date 변환에 `donorBuilt` 추가 | 2 |
| M11 | 연간 다건(multi) | **차단**(`multi-transfer-tax-validate.ts:147-149`, 직접 확인) | — | 영향 없음. 단 단건 route의 함께 양도·일반건물 카드가 쓰는 aggregate는 가산세를 자산별로 합산(`aggregate.ts:395,437,617`)하므로 자동 | — |
| M12 | 겸용주택 · 상가(commercial) · 분양권 · 재개발 입주권 | UI 열림(분양권·재개발은 ⑧ 경로 차이) | 엔진이 이월과세를 읽는지 확인 못함 | **범위 제외** — 건물 신축 사실이 의미 없는 권리이거나 엔진 미연결. 토글 노출 게이트에서 제외(`selfBuiltSectionApplicable`와 같은 종류 술어 재사용) | V-2·V-3 |
| M13 | 양도차손·산출세액 0 | — | — | §114조의2② — `loss-return`이 같은 채널을 읽어 자동 | 1 |
| M14 | 5년 경계 | — | — | 신축일 +5년 당일 **포함**, 다음 날 제외(§5.3 실측) · 2/29 신축은 `addYears`가 2/28 | 1 |
| M15 | 증축 85㎡ | — | — | 85.00 제외, 85.01 포함(§5.3) | 1 |
| M16 | 실지취득가액 승계 · 5년 초과 · 증여자 신축 아님 | — | 변화 0 | **회귀 0 대상**(§8) | — |

---

## 5. 현행 대비 세액 변화 실측 (throwaway probe — `scratchpad/dnb/p1~p5.ts`)

mock 세율(상대 비교만 의미). **probe는 구현이 없으므로 채택 입력에 §3.4 필드를 직접 심어 엔진 채널의 결과를 본 것**이다 — 구현이 같은 숫자를 재현하는 것이 Pre-Do anchor(§10)다.

### 5.1 D3 — A·B에 같은 가산세 vs 다른 해석 (자산 전체 · 비주택 건물 · 증여자 환산 5억 · 신축 2022-01-10 · 양도 2026-03-01)

세 가지 읽기를 같은 격자에 놓았다. 표의 숫자는 **결정세액 + §114조의2 가산세**(지방소득세 10% 제외). p = 25,000,000(= 5억 × 5%).

- **R1 (D3·권장)**: 비교는 가산세 前 결정세액(§92③2호), 가산세는 **채택 시나리오와 무관하게 최종에 가산**(②3호까지 도달한 경우).
- **R2**: 비교는 가산세 前, 가산세는 **A 채택일 때만**(B는 증여받은 실가 평가액이라 환산·감정이 아니다).
- **R3**: 비교를 **가산세 포함 총결정세액**으로(A+p vs B), 가산세는 A에만.

| 증여 당시 평가액(B 취득가) | A 결정세액 | B 결정세액 | R1 채택 / 최종 | R2 채택 / 최종 | R3 채택 / 최종 |
|---|---|---|---|---|---|
| 5.0억 | 154,852,000 | 199,000,000 | B / **224,000,000** | B / 199,000,000 | B / 199,000,000 |
| 5.4억 | 154,852,000 | 183,000,000 | B / **208,000,000** | B / 183,000,000 | B / 183,000,000 |
| 5.6억 | 154,852,000 | 175,000,000 | B / **200,000,000** | B / 175,000,000 | **A** / 179,852,000 |
| 5.8억 | 154,852,000 | 167,000,000 | B / **192,000,000** | B / 167,000,000 | **A** / 179,852,000 |
| 6.0억 | 154,852,000 | 159,000,000 | B / **184,000,000** | B / 159,000,000 | **A** / 179,852,000 |
| 6.2억 이상 | 154,852,000 | ≤151,000,000 | A / 179,852,000 | A / 179,852,000 | A / 179,852,000 |

읽는 법
- **채택(A/B)이 달라지는 셀은 R3뿐**(5.6~6.0억 대역) — R3은 ②3호가 말하는 「결정세액」이 아니라 §92③3호의 **총결정세액**을 비교하는 것이어서 **문언과 어긋난다**(§2). 따라서 비교 중립(R1·R2)은 문언 쪽이고 코드와도 일치한다.
- R1 대 R2의 차이는 **②3호로 B가 채택된 모든 셀에서 최종 세액이 p만큼 크다**는 것이다(예: 5.0억 224,000,000 vs 199,000,000). A 채택 셀은 세 읽기가 같다.
- **어떤 셀에서도 R1이 R2·R3보다 작지 않다** — R1은 가장 무겁다. 정책 메모(`feedback_no_unfavorable_application_without_legal_basis`: 불리한 적용에는 명문 근거가 필요)와의 긴장이 여기 있다. B는 수증자 기준 실가(증여 당시 평가액, 영 §163⑨)라 §114조의2가 문언상 말하는 「감정가액·환산취득가액을 취득가액으로 하는 경우」가 아니다. D3가 사용자 확정이므로 R1로 구현하되 **Q-1에서 이 점을 명시적으로 확인**받고, 결과 고지(§7)에 「B 채택에도 가산세 포함」을 드러낸다.

### 5.2 현행 대비 총 납부세액 변화 (지방소득세 포함 — 대표 셀 4개)

| 셀 | 현행 총납부 | 구현 후(R1) | 차이 | 가산세 base |
|---|---|---|---|---|
| 자산 전체 · A 채택 (평가액 8억) | 170,337,200 | 197,837,200 | +27,500,000 (가산세 25,000,000 + 지방소득세 2,500,000) | 500,000,000 (환산 전체) |
| 자산 전체 · ②3호 B 채택 (평가액 5억) | 218,900,000 | 246,400,000 | +27,500,000 | 500,000,000 (A측 환산) |
| P6 건물 파트 · A 채택 (증여자 건물 환산 1억) | 170,997,200 | 176,497,200 | +5,500,000 | 100,000,000 (건물 파트만, 토지 제외) |
| P6 건물 파트 · B 채택 (A측 환산 2.5억) | 243,870,000 | 257,620,000 | +13,750,000 | 250,000,000 |

P6 A 채택 셀은 기존 `resolveSplitBuildingPenaltyAxis`가 이미 파트 환산 base(건물 파트)를 내고 **토지분이 base에 섞이지 않음**을 확인했다(D4). R2/R3 선택 시 B 채택 셀의 변화는 0이다.

### 5.3 경계 (`calculateBuildingPenalty` 직접 호출)

| 입력 | 결과 | 비고 |
|---|---|---|
| 신축 2021-08-01, 양도 2026-08-01 | 가산세 O | 5년 되는 날 당일 포함 |
| 신축 2021-08-01, 양도 2026-08-02 | 없음 | |
| 신축 2020-02-29, 양도 2025-02-28 / 2025-03-01 | O / 없음 | 2/29 → `addYears` = 2/28 |
| 환산, 양도 2017-12-31 | 없음 | 환산 시행일 2018-01-01 |
| 감정, 양도 2019-12-31 / 2020-01-01 | 없음 / O | 감정 시행일 2020-01-01 |
| 증축 85㎡ / 85.01㎡ | 없음 / O | 85㎡ 초과 |

---

## 6. 14 동기화 지점 (엔진 input·result 변경)

| # | 지점 | 변경 | 파일 | 비고 |
|---|---|---|---|---|
| ① 폼 상태 | O | `CarryoverTaxationForm`에 `donorBuilt`(boolean)·`donorBuildingType`·`donorConstructionDate`·`donorExtensionFloorArea`·`donorBuildingStdPriceAtAcquisition` | `lib/stores/calc-wizard-asset-carryover.ts:33-` | 파트 서브폼(`landCarryover`/건물 파트)이 같은 타입을 공유(`normalizeCarryoverForm`) |
| ② initial | O | `CARRYOVER_DEFAULTS` — `donorBuilt:false`, 나머지 `""` | 같은 파일 `:134-` | 기본 OFF = 회귀 0 |
| ③ normalize | O | `normalizeCarryoverForm`에 타입 검사(boolean/enum/문자열) | 같은 파일 `:166-` | 구 세션 호환: 없으면 OFF |
| ④ API 변환 | O | `buildCarryoverPayload`가 `donorBuilt` 객체를 만들되 **토글 ON + 환산 ON + 건물성 자산일 때만** 전송(stale 방지: 환산 OFF·자산 종류 변경 시 미전송). 파트: `transfer-tax-api-split-carryover.ts`, GB: `transfer-tax-api-gb-carryover.ts`, 컴패니언: `transfer-tax-api-companion-payload.ts:618-624` | `lib/calc/transfer-tax-api-carryover.ts:72-` | 게이트 술어는 ⑤·⑧과 같은 leaf 1개(`donorBuiltApplicable`) — `self-built-scope.ts` 교훈 |
| ⑤ UI 위젯 | O | `CarryoverGiftBlock` ② 증여자 취득가액 블록의 환산 패널 **직후**(계산 순서=표시 순서)에 `ToggleCard` 「증여자가 신축·증축한 건물입니까?」. 기존 `SelfBuiltSection`은 제목·설명이 「본인」 고정이라 title/description prop을 열거나 얇은 래퍼 | `components/calc/transfer/CarryoverGiftBlock.tsx`, `SelfBuiltSection.tsx` | `useEffect` 미러링 없음 — 전부 `onChange` |
| ⑥ 사이드바 | **N/A** | 현행 사이드바는 가산세를 합산하지 않는다(`transfer-per-asset-summary.ts`에 `가산세` grep 0건). 본인 신축 가산세도 마찬가지 | — | 일관성 유지 |
| ⑦ 결과 | O | 가산세 step note·`CarryoverTaxationDetail.donorBuiltPenalty` echo(§7) | `transfer-tax-building-penalty.ts` note, `types/transfer-carryover.types.ts` | 합산·4뷰 표시는 `result.penaltyTax/penaltyBase`를 이미 읽는다 |
| ⑧ validate | O | 아래 ⑧↔⑫ 격자 | `lib/calc/transfer-tax-validate-carryover-asset.ts:78-` (e) 환산 블록 뒤, 파트 `transfer-tax-validate-split-carryover.ts`, GB `transfer-tax-validate-gb-carryover.ts`, BG `transfer-tax-validate-bg.ts:159` | |
| ⑨ Zod enum 메인 | N/A | `acquisitionCause` enum 변경 없음 | | |
| ⑩ Zod enum 컴패니언 | N/A | 〃 (`addPropertyRefines`는 ⑫ 쪽 refine로 처리) | | |
| ⑪ 자산 acquisitionDate fallback | N/A | 이월과세의 `acquisitionDate` fallback(`carryoverAcquisitionDateFallback`)은 변경 없음 | | |
| ⑫ Zod 입력 객체 | **O (gap-prone)** | `carryoverTaxation`에 `donorBuilt: z.object({...}).optional()` — **메인 `base-shape.ts:532-`(별도 z.object), 컴패니언(`schema-companion.ts:388`)·GB 파트는 `carryoverTaxationEngineShape`(`building-schemas.ts:76,95`) 한 곳, 파트 이월과세 `schema-split-carryover.ts:60-`** 전수(메인 객체와 엔진 shape는 parity 규약, `base-shape.ts:554`). 누락 시 **침묵 strip**(TS 미감지 — `engine-input.ts:130-148` 주석 probe 실측) | | `buildingType` enum은 기존 `z.enum(["new","extension"])`(`base-shape.ts:299`) 재사용 |
| ⑬ body spread | 확인 | `carryoverTaxation`은 객체째 전달되는 구조이므로 신규 키 자동 통과. **그래도 grep으로 확인**(`gift-burdened-transfer-api.ts`, `multi`는 차단이라 해당 없음) | | |
| ⑭ Route 엔진 매핑 | **O** | `engine-input.ts:134-147`, `bundled-split-helpers.ts:625-640`의 `carryoverTaxation` 변환에 `donorBuilt.constructionDate` → `toDate(...)`(`date-coerce` 강제, `new Date(x)` 직접 금지 — 정책 / `Date < string` silent false) | | |

### ⑧↔⑫ 정합 격자 (UI 통과 ↔ validate 차단 모순 금지)

| 조건 | ⑤ UI | ⑧ validate | ⑫ Zod refine | 엔진 |
|---|---|---|---|---|
| 토글 ON인데 구분 미선택 | 구분 필수 표시 | 차단 | 차단 | throw |
| 신축일 미입력 | — | 차단 | 차단 | throw |
| 신축일 < 증여자 취득일 또는 > 증여 등기접수일 | — | 차단 | `superRefine` | throw |
| 증축인데 바닥면적 ≤ 0 | — | 차단 | 차단 | 85㎡ 게이트 |
| 증축 또는 일체 주택인데 건물분 기준시가 ≤ 0 | — | 차단 (**자동 안분·기본값 fallback 금지**) | 차단 | throw |
| 환산 OFF(실가 승계)인데 `donorBuilt` 전송 | 토글 비노출 | 토글 상태 stale이면 무시(미전송) | 환산 OFF + `donorBuilt` → 거부 | throw |
| phd/apd 환산 | 토글 비노출 | 차단 | 거부 | throw |
| 비건물 자산(land·분양권·재개발·겸용·상가) | 비노출 | 무시(미전송) | 거부 | — |

**3중 패턴**: 신규 필드는 UI display fallback이 없고(자동 채움 금지) API 변환에도 fallback이 없다. 즉 「미입력 = ⑧ 차단」이 세 계층에서 동일하다. 토글 기본값(`donorBuilt:false`)은 ②·③·④가 모두 같다.

---

## 7. 결과 4뷰 · 고지

- 합산·표시: 결과 카드(`TransferTaxResultView.tsx:428-436` 합계), 상세명세서(`DetailedStatementLateStages.ts:168-214` — `penaltyBase > 0`이면 `§114조의2 환산취득가액 가산세 = base × 5%`), 신고서(`FilingFormTableHelpers.ts:684`, aggregate `:326-349,466`), PDF(`ResultPdfTransferSections.tsx:82,105` — 합계만)는 **`penaltyTax/penaltyBase`를 이미 읽는다** → 숫자는 자동 반영. 실제 변경은 **원인 표기**다.
- 추가: `emitPenaltySteps`의 note(`transfer-tax-penalty-steps.ts:62`)가 「신축 5년 이내 양도 + 환산취득가액 적용」으로 나오는데, 증여자 신축은 「**증여자 신축** … + 증여자 취득가액 환산취득가액 적용」으로 구분한다(`calculateBuildingPenalty` note 분기). 상세명세서의 `penaltyMethod` 판별이 note 문자열 포함 검사(`DetailedStatementLateStages.ts:192`)라 **문구를 바꿀 때 검사 키(「감정가액 적용」)를 깨지 않게** 한다.
- `CarryoverTaxationDetail`에 echo `donorBuiltPenalty?: { buildingType; constructionDate; fifthAnniversary; base; penalty; appliedScenario: "A" | "B" }` — `CarryoverComparisonCard.tsx`(361줄)·`SplitCarryoverComparisonCard.tsx`(152줄)에 한 줄 표시. `TransferTaxResultView.tsx`는 790줄이라 **여기에는 건드리지 않는다**(§9).
- **「확인 필요」 고지 — 문구 교체안(권장 유지, Q-5)**:
  - 종전(`split-carryover-display.ts:277`): 「…가산세 적용 여부는 확인이 필요합니다 — … 이 계산은 양도자 본인이 신축·증축한 건물만 가산세를 붙입니다.」
  - 변경: 「증여자가 신축·증축한 건물을 그 신축·증축일부터 5년 이내에 양도하는 경우의 소득세법 §114조의2 가산세를 **적용했습니다**(증여자 신축일 기산, 증여자 기준 환산취득가액의 5%, 증축은 증축 부분). 증여자 신축분에 대한 정면 해석례는 확인하지 못했습니다 — 확인 필요.」
  - B 채택(②3호) 시 추가 한 줄: 「이월과세를 적용하지 않은 경우에도(②3호) 같은 금액을 가산세로 더했습니다.」
  - **자산 전체 이월과세에는 현재 이 고지가 없다** → 같은 문구를 `CarryoverComparisonCard`/경고 경로에 신설(M1·M2·M6).

---

## 8. 회귀 0이어야 하는 셀 (Pre-Do anchor로 고정)

| 셀 | 기대 |
|---|---|
| `donorBuilt` 미전송(토글 OFF·구 이력·구 세션) 이월과세 전 셀 | 가산세·세액 현행과 동일 |
| 증여자 실지취득가액 승계(환산 OFF) + `donorBuilt` 전송 시도 | ⑧/⑫ 거부(실가는 §114조의2 대상 아님) — 침묵 무시 금지 |
| 증여자 신축이어도 신축일 + 5년 < 양도일 | 가산세 0 (경계 당일은 부과) |
| 환산 양도일 < 2018-01-01 · 감정 양도일 < 2020-01-01 · 증축 ≤ 85㎡ | 0 |
| ②1호/②2호/③ 적용배제로 B 고정 | 가산세 0 (Q-1-b 권장) |
| 수증자(양도자) 본인 신축 경로(`acquisitionCause: purchase`) | 변화 없음 — `donorBuilt`와 독립 |
| 비이월 일체 주택 신축 환산(base 5억 실측) | 변화 없음(§3.3 관찰) |
| split 토지만 이월과세(A) · 일반건물 #7-b(토지 이월과세 + 건물 본인 신축) | 변화 없음 |
| multi(연간 다건) 이월과세 | 계속 차단 |
| 부담부증여 실가(K-4)·K-6(매매사례) × 이월과세 | 변화 없음 (G-5 유지) |
| 부담부증여 본인 신축 플래그 + `donorBuilt` 없음 | 종전 throw 유지 |
| 겸용 부담부증여 | 종전 차단 유지(`burdened-gift-mixed-use-scope.ts:277`) |

---

## 9. 파일 줄 수 (800줄 정책) — `wc -l` 실측

| 파일 | 줄 수 | 이번 변경 | 판정 |
|---|---|---|---|
| `lib/tax-engine/transfer-tax-carryover.ts` | 688 | 후크 호출 <10줄 | 착지 ≤700 유지 — 로직은 신규 leaf로 |
| `lib/tax-engine/transfer-tax-split-carryover.ts` | 419 | 후크 + base 회수 ~25줄 | 여유 |
| `lib/tax-engine/transfer-tax-carryover-burdened-gift.ts` | 257 | throw 완화 ~15줄 | 여유 |
| `lib/tax-engine/transfer-tax-finalize.ts` | 650 | 0줄(채널 재사용) | 변경 없음 |
| `lib/tax-engine/transfer-tax-building-penalty.ts` | 203 | note 분기 ~10줄 + (P6 증축 `effectiveInput` 판독) | 여유 |
| `lib/tax-engine/types/transfer.types.ts` | 1808 | 타입만 | 타입 전용 예외(정책) — 신규 타입은 `transfer-carryover.types.ts`(345)에 둔다 |
| `lib/api/transfer-tax-schema-base-shape.ts` | 654 | zod 객체 1개 공용 export + 4곳 참조 | 공용 `donorBuiltSchema`를 `transfer-tax-schema-split-carryover.ts`(198) 등 작은 파일에 두고 참조 |
| `lib/calc/transfer-tax-api-carryover.ts` | 229 | ~20줄 | 여유 |
| `lib/stores/calc-wizard-asset-carryover.ts` | 263 | ~25줄 | 여유 |
| `components/calc/transfer/CarryoverGiftBlock.tsx` | 404 | 토글 블록 ~30줄(별 컴포넌트로 분리 권장) | 여유 |
| `components/calc/results/TransferTaxResultView.tsx` | **790** | **건드리지 않는다** | 이미 위험구간 — 표시는 하위 카드에서 |
| `components/calc/results/transfer/FilingFormTableHelpers.ts` | 719 | 변경 없음 | — |
| `lib/tax-engine/transfer-tax-aggregate.ts` | 760 | 변경 없음 | — |

신규 파일: `transfer-tax-carryover-donor-penalty.ts`(~120줄 예상), `donor-built-scope.ts`(`lib/calc`, 술어 leaf ~40줄).

---

## 10. PR 분할 · Pre-Do anchor

워크플로: 엔진(타입·leaf·후크·⑫·⑭) → 입력 파이프라인·UI(④⑤⑧) → 결과 순서. 각 PR 전에 anchor 선작성(`pre-do-anchor-verification`).

| PR | 범위 | 핵심 anchor |
|---|---|---|
| **PR-1 엔진 + ⑫⑭** | `donorBuilt` 타입·Zod(전 스키마 parity)·Date 변환·leaf·`finishScenarios` 후크·손실 경로 확인. **M1·M13~M16**(자산 전체 비주택 건물, API 직접 호출로 검증). 일체 주택(M2)은 Q-2 결과에 따라 같은 PR | 5.1 격자(R1) · 경계 5.3 · 5년 당일/익일 · 증축 85㎡ · 손실 경로 · `donorBuilt` 부재 회귀 0 · 환산 OFF 거부 · 직접 호출 raw `isSelfBuilt` 무영향 |
| **PR-2 입력·UI·결과(자산 전체)** | ①②③④⑤⑧ · 컴패니언(M10) · 결과 echo·고지(§7) · E2E(폼→계산→결과, Network body 확인) | ⑧↔⑫ 격자 전수 · 토글 stale 미전송 · 자산 종류 변경 시 비노출 |
| **PR-3 split 파트(P6)** | 해결자 후크(A·B 축)·`resolveSplitBuildingPenaltyAxis`가 `effectiveInput` 판독(증축) · `SplitPartCarryoverCard` 토글 · P6 고지 문구 교체 · `p6.plan.md` Q3 정정 주석 | §5.2 P6 두 셀 · 증축×파트 환산 · 토지 base 미혼입 |
| **PR-4 부담부증여 × 이월과세** | `assertCarryoverDonorBasis` throw 완화 · A측 건물 base를 B에 전달(K-5/K-7) · 일반건물 F27(M9) | G-4·G-4b 반전 · K-5 B base 고정 · K-7 증축 안분 · 겸용 차단 유지 |
| **PR-5 일반건물 카드(M6)** | 카드 ⑤ UI(`GeneralBuildingAcquisitionCards.tsx:520,545,655`)·`transfer-tax-api-gb-carryover.ts:299` ⑧ GB | GB 건물 카드 환산 이월과세 가산세 · V-1 확인 |

PR-1~2는 한 세트로 머지해야 사용자에게 열린다(엔진만 머지돼도 입력이 없으므로 회귀 0).

---

## 11. 사용자 결정이 필요한 Q (권장안 포함)

| Q | 질문 | 선택지 | 권장 |
|---|---|---|---|
| **Q-1** (D3 세부) | **a**. ②3호로 B가 채택된 경우에도 가산세를 싣는가? **b**. ②1호·②2호·③ 적용배제(이월과세 자체가 확정적으로 불적용)로 B 고정인 경우는? | a: **R1**(싣는다·D3) / R2(A 채택에만) / R3(총결정세액으로 비교). b: 싣지 않는다 / 싣는다 | a: **R1** — 이미 확정된 D3·메인 세션 해석. 비교는 문언(§92③2호)·코드와 일치하고 **채택 결과가 R1·R2에서 동일**(§5.1). 다만 B 채택 셀의 최종 세액이 R1이 p만큼 크다(최대 +25,000,000, 지방세 별도)는 점과 정책 메모(불리 적용 시 명문 근거)와의 긴장을 확인해 달라. b: **싣지 않는다** — ①이 불적용으로 확정된 경우 증여자 값을 쓸 근거가 전혀 없다(R1의 정당화 논리가 ②3호 비교 맥락 한정이다) |
| **Q-2** (D4 구현) | 일체 주택(토지+건물 일체 기준시가)에서 건물분 base를 어떻게 얻는가 | (a) 비이월 신축과 같이 일체 환산액 전체(토지 포함) / **(b) 증여자 취득 당시 건물분 기준시가 1칸 추가 입력**(base = 양도가 × 건물분 ÷ 일체 양도시) / (c) 일체 주택은 split(§166⑥) 전환 요구 | **(b)** — D4(건물만)를 지키는 가장 작은 입력. 증축의 기존 식과 동형. (a)는 D4 위반, (c)는 사용자 부담이 크다 |
| **Q-3** | 신축일을 별도 칸으로 받는가(증여자 취득일 자동 채움 없음) | 별도 칸 / 신축이면 `donorAcquisitionDate` 재사용 | **별도 칸**(증축은 어차피 별도, 일체 주택은 취득일이 토지 선취득일일 수 있음, 자동 채움 금지 정책) |
| **Q-4** | 자산 전체 이월과세에 「증여자 취득가액 = 감정가액」 입력을 신설해 감정 경로도 여는가 | 신설 안 함(환산만, 부담부증여 K-7만 감정) / 신설 | **신설 안 함** — 입력 모드 신설은 별건(`donorAcquisitionPrice` 실가 칸에 감정가액을 넣는 사용자는 현재 가산세 대상에서 빠진다는 점은 고지에 한 줄) |
| **Q-5** | 「확인 필요」 고지를 §7 문구(「적용했다 + 해석례 미확보」)로 바꾸는가 | 교체 / 삭제 / 현행 유지 | **교체** — 불리 처분이고 정면 해석례가 없어 고지 유지가 안전 |

---

## 12. 미확인·검증 레지스터

| ID | 항목 | 상태 |
|---|---|---|
| V-1 | 일반건물 건물 카드에서 증여자 환산 이월과세 시 `card.usedEstimatedAcquisition`이 true인지(게이트 `general-building-route-cards.ts:225`)와 카드 매핑이 `donorBuilt`를 보존하는지 | 확인 필요 — PR-5 착수 전 anchor |
| V-2 | 분양권 × 이월과세 차단 코드 | 인벤토리에서 확인 못함 — 토글 비노출로 처리 |
| V-3 | 겸용주택·상가 엔진이 `carryoverTaxation`을 읽는지; `resolveSplitBuildingPenaltyAxis`의 증축 판독이 원본 `input` 기준(`building-penalty.ts:161`, finalize `:325`)이라 파트 증축에서 `effectiveInput` 판독이 필요한지 | 확인 필요 — 후자는 PR-3 anchor로 실측 |
| V-4 | §114조의2 시행 부칙(환산 2018.1.1., 감정·증축 2020.1.1.)이 **증여자 신축·증여 후 양도**에 양도일 기준으로 같게 적용되는지 | 기존 게이트 승계, 부칙 재대조 안 함 — 확인 필요 |
| V-5 | 부담부증여 K-5 × 이월과세 B 시나리오의 base(양도인 증여일 기준시가) — R1은 A측 base로 고정하는 설계 | PR-4 anchor로 실측 |
| V-6 | 다필지 분기(`multi-parcel-branch.ts:263-301`; 환산 base 0·감정만)가 이월과세와 공존하는지 | 인벤토리: 환산 base 0 고정 — 공존 여부 확인 필요 |
| V-7 | PDF에서 자산 전체 이월과세 비교(`carryoverTaxationDetail`)가 출력되는지 | 인벤토리: lib/pdf·lib/print grep 0건 — 숫자는 합계로 반영되나 원인 표기는 PDF에 없음 |
| V-8 | 법령 MST는 소득세법 280405만 확인(시행 2026-01-01/07-01 본). 영 §162는 MST 290841(시행 2026-10-01) | 확인 완료 |

---

## 13. 자가 점검

- [x] useEffect → store 미러링: 신규 필드는 전부 `onChange`·`useMemo`, 자동 채움 없음.
- [x] 자동 안분 fallback 금지: 건물분 기준시가·신축일·바닥면적 미입력은 ⑧ 차단(§6 격자). 일체 주택 건물분은 사용자 입력(Q-2 b)이며 면적/비율 자동 안분이 아니다.
- [x] ⑧ 동기화: ⑧↔⑫↔엔진 격자 작성(§6). 구현 시 ⑧ 전수 대조 필요.
- [ ] 14지점 grep(⑫⑬⑭), anchor, tsc, vitest, 브라우저 확인 — **Do 단계 항목(이번은 계획서만)**.
