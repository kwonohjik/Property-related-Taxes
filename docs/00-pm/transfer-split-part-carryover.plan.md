# 주택 split 파트 이월과세(소득세법 §97의2) — 기능 확장 계획서

**작성**: 2026-10-19 · **base**: master `a89e81d81` · **선행**: 취득원인 혼합 D0~D2(`transfer-acq-cause-mixed.plan.md` — 이 계획은 그 §4 「D 밖 — 이월과세 파트」의 후속이다)
**상태**: ✅ Plan 확정 (2026-10-19 사용자 「권장안대로 진행」 — Q-1~Q-10 전부 권장안) → Design
**조사**: 엔진(`transfer-tax-senior`)·UI(`transfer-tax-ui-senior`) 병렬 조사 + 법령 본문 직접 조회. 실측 출력은 세션 scratchpad `spco/out.txt`·`out-lifted.txt`(mock 세율 — 같은 시드끼리 상대 비교만 의미가 있다).

---

## 1. 요약

주택·건물을 **토지·건물로 나눠 계산(split)** 할 때, 한 파트만 또는 두 파트가 서로 다른 날짜로 이월과세(§97의2) 대상이면 지금은 계산할 수 없다.

| # | 상황 | 현재 화면 | 현재 API | 엔진 |
|---|---|---|---|---|
| **A** | 토지만 배우자·직계존비속 증여(이월과세) + 건물은 매매·신축 — 「부모에게 받은 땅에 집을 지어 판다」 | 토지 원인 라디오에 상속·증여만 있다. 「증여」를 고르면 **「이 화면은 이월과세를 지원하지 않으며 일반 증여로 계산됩니다」** 고지가 뜨고 그대로 일반 증여로 계산된다 (`LandPartCauseBlock.tsx:44-61`) | 400 (`transfer-split-part-cause.ts:296` G-1) | 차단을 풀어도 세율 기산만 바뀌고 취득가액·장특 기산·증여세 상당액·비교과세가 없다 |
| **B** | 건물만 이월과세 + 토지는 매매 | 이월과세 호스트에는 「토지 다른 원인」 토글이 없다 (`transfer-land-part-cause.ts:69-72` → `BuildingCauseMixBlock.tsx:41` null). 증여 호스트의 고지는 「이월과세면 취득원인을 이월과세로 선택하라」고 안내한다 (`BuildingCauseMixBlock.tsx:134-152`) — **안내대로 하면 토지를 나눌 수 없는 막다른 길** | 400 (`:249`) | 파트 이월과세 없음 |
| **C** (인접 결함) | 주택을 통째로 이월과세 증여받았는데 **증여자가 토지·건물을 다른 날 취득**(예: 땅 사 두고 나중에 신축) | 증여자 취득일·취득가액을 **1벌만** 받는다 (`CarryoverGiftBlock.tsx:162-168`, hint 「보유기간·장특 기산일」). 고지 없음 | 200 — 단일 날짜로 계산. split 입력을 같이 보내면 400(Y8) | 어느 날짜를 넣느냐에 따라 세액이 **−18.0M ~ +27.0M** 흔들린다(§4) |

> 사용자 화면 표의 `:248,295`는 그 뒤 master 전진으로 `:249,296`이 됐다(같은 코드).

⇒ 권장: **엔진에 파트 이월과세 시나리오 해결자를 하나 만들고(A·B·C 공용), UI를 C → A → B 순으로 연다.** 1세대1주택 비과세(§97의2②2호)와의 상호작용은 법령 확인 전까지 막아 두고 별도 단계로 한다.

---

## 2. 법령 근거 (KoreanLaw MCP 현행 본문 조회, 2026-10-19)

| 조문 | 본문 요지 | 이 계획에서의 쓰임 |
|---|---|---|
| 「소득세법」 §97의2① | 양도일부터 소급 10년 이내 배우자·직계존비속에게 증여받은 §94①1호 자산(토지·건물)의 필요경비: **1호** 취득가액 = 증여자의 취득 당시 §97①1호 금액, **2호** 증여자가 지출한 자본적지출 포함, **3호** 증여세 상당액 필요경비 산입 | 파트별 취득가액 치환·증여세 상당액. 토지와 건물은 §94①1호상 **각각 자산** |
| 「소득세법」 §97의2② | 적용 배제 — **1호** 사업인정고시일부터 소급 2년 이전 증여 + 수용, **2호** 「제1항을 적용할 경우」 §89①3호 주택(비과세에서 제외되는 고가주택 포함) 양도에 해당하게 되는 경우, **3호** 제1항 적용 결정세액 < 미적용 결정세액 | 비교과세(3호) 단위·1세대1주택(2호) 판정이 핵심 쟁점(§7 V-1·V-2) |
| 「소득세법」 §97의2③ | 연수는 등기부상 소유기간 | 증여 등기접수일 |
| 「소득세법」 §95④ 단서 | §97의2①의 경우 장특 보유기간은 **증여자가 해당 자산을 취득한 날부터** | 파트별 장특 기산 |
| 「소득세법 시행령」 §154⑤ | 1세대1주택 보유기간 계산은 법 §95④에 따른다 | 2호 판정에서 증여자 보유 통산(§7 V-2) |
| 「소득세법 시행령」 §163의2② | 증여세 상당액 = 증여세 산출세액 × 해당 자산가액 / 증여세 과세가액. 한도 = 양도가액 − §97①·② 금액 | 파트별 안분·**파트별 한도**(일반건물 선례 — 사전-2025-법규재산-0366 「해당 자산」, `carryover-land-split.ts` 주석) |

- 10년 기간은 2023.1.1. 이후 증여분이다. 그 전 증여는 5년이다(`transfer-tax-carryover-eligibility.ts` `TEN_YEAR_RULE_CUTOFF`). 실측 시드는 이 때문에 증여 2023-03-01·양도 2025-06-30으로 맞췄다. 증여 2020이면 `period_exceeded`로 자동 배제된다.
- **정면 해석례 미확보**: 국세청 질의회신(KoreanLaw `nts` 3회, taxlaw 통합검색 2회)·조세심판(2회)에서 「토지만 이월과세 + 주택 양도」의 비교 단위·2호 판정을 다룬 결정을 찾지 못했다. 가장 가까운 부동산거래관리과-301(2012.6.1.)은 증여받은 부수토지의 §163⑨ 평가액 문제다(이월과세 아님).

---

## 3. 현행 구조

### 3.1 컨벤션 — 일반건물과 **반대**다

| | 주택 split | 일반건물 |
|---|---|---|
| `acquisitionCause` | **건물** 파트 | **토지** 파트 |
| 다른 파트 | `landAcquisitionCause`(토지 overlay, 부재 = 자산 원인과 같음) | `gbBuildingAcquisitionCause`(건물) |
| 파트 이월과세 | 없음 | `landCarryoverTaxation`·`buildingCarryoverTaxation` + 사건 1벌 `carryoverGiftEvent` |

일반건물 코드를 그대로 복사하면 파트가 뒤집힌다(`calc-wizard-asset-split-acq.ts:32` ↔ `calc-wizard-asset-gb.ts:133`).

### 3.2 엔진 지도

| 축 | 자산 단위 이월과세 | 토지 overlay `carryover_gift` |
|---|---|---|
| 진입 | STEP 0.475 `transfer-tax-precalc.ts:158` → `calcCarryoverScenarios` (`transfer-tax-carryover.ts:76`) | `calcSplitGain` 진입에서 leaf가 throw (`:296`), ⑫도 같은 leaf라 400 |
| 취득가액 | 시나리오 A가 `acquisitionPrice`·`acquisitionDate`를 증여자 값으로 바꾼다. **`landAcquisitionDate`·파트 가격은 그대로** | `calcSplitGain`은 `carryover`를 읽지 않는다(split-gain·split-rate·appurtenant-land·acq-price grep 0건) |
| 장특 기산 | split 파트 `holdingYears` = `calculateHoldingPeriod(파트 취득일, 양도일)` (`transfer-tax-split-gain.ts:331,335`, PHD `:530,534`) | 증여자일 미반영 |
| 세율 기산 §104②2호 | 시나리오 A의 취득일 치환으로 간접 반영 | **이미 구현** — `resolveLandRateBasis`(`transfer-tax-appurtenant-land.ts:70-85`) → `rule: "donor"` |
| 증여세 상당액 | 사용자가 안분해 넣은 `giftTaxAmount` 1칸, 한도는 자산 단위 | 없음. 안분 leaf `carryover-gift-tax-apportion.ts`는 일반건물만 호출 (`general-building-entry.ts:59`) |
| 비교과세 ②3호 | `finishScenarios` A ≥ B면 A | 없음 |
| 적용 배제 ①·③ / ②2호 | `judgeCarryoverEligibility` / `scenarioAIsOneHouse && !B비과세` 자동 판정 | 없음 |

### 3.3 클라이언트 지도

- ⑨⑫는 이미 `landAcquisitionCause: "carryover_gift"`를 받는다 (`transfer-tax-schema-base-shape.ts:309`, `transfer-tax-schema-split.ts:30`). 막는 곳은 엔진 leaf·⑧, 그리고 UI에 옵션이 없다는 점이다.
- 이월과세 호스트는 ⑧이 일반 취득 검증 전에 조기 return한다 (`transfer-tax-validate-acquisition.ts:263`~`:355`). 그래서 `validateLandPartCause`·`validateSplitDirectInputs`에 닿지 않는다. B·C는 새 ⑧ 분기가 필요하다.
- `migrateCarryoverFields`는 호스트가 `carryover_gift`가 아니면 `carryover`를 기본값으로 지운다 (`calc-wizard-asset-carryover.ts:144-148`). A의 토지 이월과세 입력을 `carryover`에 담으면 복원 때마다 사라진다. **별도 서브폼 키가 필요하다.**
- 다건 ④는 `buildCarryoverPayload`를 부르지 않고, ⑫가 이월과세를 거부한다 (`transfer-tax-schema-multi-refines.ts:42-45`). 새 키도 거부 목록에 넣지 않으면 「200 OK·세액 그대로」 침묵이 된다.

---

## 4. 실측 (mock 세율, `POST /api/calc/transfer` 직접 호출)

공통: 양도 12억(토지 7억·건물 5억), 양도일 2025-06-30, 비과세 아님, 증여 등기접수일 2023-03-01. **기대값은 대리 계산**이다 — 이월과세 A는 「파트 취득일·취득가액(증여자 취득가 + 증여세 상당액)을 치환한 일반 split」으로, B는 「이월과세 미적용 증여」로 만들었다. 채택은 A ≥ B이면 A(②3호).

| 케이스 | 입력 요지 | 현행 | 기대(대리) | 차이 |
|---|---|---|---|---|
| A | 토지 이월과세(증여자 2000-01-01·1억, 증여세 2천만, 증여일 평가 3억) + 건물 매매 2021-03-01 4억 | **400** G-1 | A 172,260,000(토지 보유 25년·장특 30%) ≥ B 169,860,000 → **172,260,000** | 계산 불가 |
| A (G-1만 제거) | 같음 | 169,860,000 — 단순 증여와 **동일**(토지 보유 2년·장특 0, 세율 기산 echo만 `rule: donor`) | 172,260,000 | −2,400,000 |
| A' | 건물 신축 | **400** | A와 같은 구조 | — |
| B | 건물(자산) 이월과세 + 토지 `purchase` 2008 | **400** `:249` | 미산정 | — |
| C1 | 통째 이월과세, 증여자 토지 1995-03-01·건물 2015-06-01, 증여자 취득일 칸에 **1995** | 277,590,000(전체 장특 30%) | **300,018,000** — 파트별 ②3호(Q-3): 토지는 적용 시 89,082,000 < 미적용 93,110,000이라 배제, 건물만 적용 (두 파트 모두 적용이면 295,566,000) | **−22,428,000** |
| C2 | 같은데 칸에 **2015** | 322,530,000(전체 장특 20%) | 300,018,000 | **+22,512,000** |
| C3·C4 | 자산 이월과세 + split 입력 | **400** (Y8 `LAND_CAUSE_ABSENT`) | — | 병용 수단 없음 |

- C 기대값은 Design 단계에서 정정했다(§11 I-1). 종전 295,566,000은 두 파트 모두 A인 값이다.
- C는 입력 칸이 1벌이라 어느 날짜를 넣어도 법령값에 맞출 수 없다.
- 1세대1주택 케이스(8억)는 A·B 모두 0이라 변별이 안 됐다. 후취득 토지(보유 2년 미만) 케이스는 기대값이 법령상 미확정이다(§7 V-2).

---

## 5. 결함·갭 목록

| ID | 등급 | 내용 | 근거 |
|---|---|---|---|
| **H-1** | 🟠 기능 부재 | A 입력 불가. 화면은 고지 후 일반 증여로 계산 | §1·§4 |
| **H-2** | 🟠 기능 부재 + 막다른 안내 | B 입력 불가. 증여 호스트 고지가 이월과세 호스트로 보내는데 거기엔 토지 분리 토글이 없다 | `BuildingCauseMixBlock.tsx:134-152` |
| **H-3** | 🔴 침묵 오차 | C — 증여자 파트별 취득일·취득가액을 받을 수 없고 고지도 없다. ±수천만 원 | §4 C1·C2 |
| H-4 | 🟡 확인 필요 | `effectiveLandAcquisitionCause`가 저장된 `carryover_gift`를 캐스트로 통과시켜(`transfer-land-part-cause.ts:55`) `LAND_CAUSE_META["carryover_gift"]` 접근 시 크래시 가능 — 코드 독해로만 도출 | P0에서 실측 |
| H-5 | 🟡 확인 필요 | 이월과세 호스트 + 소유자 분리(`selfOwns≠both`)에서 ⑧ 조기 return으로 `NonPurchaseSplitInputsBlock` 필수 규칙이 검증되지 않을 가능성 | P0에서 실측 |
| H-6 | 🟡 별건 후보 | 일반건물 이월과세 환산 모드 PHD/APD 선택 시 ⑧이 화면에 없는 `donorStandardPriceAtAcquisition`을 요구할 가능성(`transfer-tax-validate-gb-carryover.ts`) — **복사 전에 판정** | Q-9 |

---

## 6. 설계안

### 6.1 데이터 모델 — α (권장)

- **엔진·API**: split 입력에 `landCarryoverTaxation`·`buildingCarryoverTaxation`(일반건물과 같은 이름·Zod shape `carryoverTaxationEngineShape` 재사용) + 증여 사건 1벌 `carryoverGiftEvent`(등기접수일·산출세액·과세가액·관계·배제 선언). `splitAcquisitionShape`는 주 자산·컴패니언이 공유하므로 ⑫는 한 곳이다.
  - A = `landCarryoverTaxation`만, B = `buildingCarryoverTaxation`만, C = 둘 다.
  - B 시나리오(미적용) 취득가액은 기존 파트 평가액 칸(`landAcquisitionPrice` 등 상속·증여 평가액 규약)을 쓴다 — 이중 진실 없음.
- **폼**: 새 서브폼 `landCarryover`(A·C의 토지). B·C의 건물은 기존 `carryover`. `buildingCarryover`는 일반건물 전용이고 의미가 반대라 재사용하지 않는다. 사건 정보 출처는 일반건물 `gbCarryoverEventSource` 패턴(호스트가 이월과세면 `carryover`, 아니면 `landCarryover`).
- **술어**: 새 `effectiveLandCarryover(asset)`. `effectiveLandAcquisitionCause`의 반환형은 넓히지 않는다 — truthy 소비처가 9곳 이상이고, D2가 `purchase`에서 같은 이유로 별도 술어를 만들었다.
- ⑨⑩⑪ 변경 없음(enum 이미 열림, 이월과세 `acquisitionDate` fallback은 증여일).

β(top-level `carryoverTaxation`을 「토지일 수도 있다」로 재해석)는 자산·파트 의미가 충돌하고 C를 표현할 수 없어 비권장.

### 6.2 엔진 — 파트 이월과세 시나리오 해결자

`calcSplitGain` 앞단에 하나 둔다(A·B·C 공용, `:249`·`:296` 차단은 서브객체가 없을 때만 남긴다).

1. 파트별 `judgeCarryoverEligibility`(①·③) — 일반건물처럼 파트마다 호출하고 사건 수준 선언은 두 파트에 같은 값.
2. 시나리오 A: 이월과세 파트의 취득일·취득가액을 증여자 값으로 치환 + 증여자 자본적지출 + 증여세 상당액. 장특 `holdingYears`가 치환된 취득일을 따라가고, 세율 기산은 이미 `resolveRateBasis` 단일 소스라 일관된다.
3. 증여세 상당액: `apportionGiftTax`(영 §163의2②)로 파트 안분, 한도는 **파트 gain**. 명문 안분이라 「자동 안분 fallback 금지」와 충돌하지 않는다(일반건물 기확정).
4. 시나리오 B: 이월과세 미적용 증여(증여일·평가액).
5. ②3호 비교 — 단위는 Q-3.
6. echo: `SplitPartResult`에 파트별 증여자 취득일(장특 기산)·A/B 결정세액·채택·증여세 상당액. 지금 JSDoc은 「`acquisitionDate` = 장특 기산일」이고 이월과세 파트는 범위 밖이라고 적혀 있다(`transfer-split-gain.types.ts`) — 함께 고친다.
7. ⚠️ 1세대1주택 부수토지 장특 통칙 분기(`transfer-tax-lthd.ts:422-436`, `land.holdingYears > building.holdingYears`)에 증여자일 치환이 걸린다 → anchor 필수.

### 6.3 UI — O1 호스트별 확장 (권장)

| 케이스 | 진입 | 재사용 |
|---|---|---|
| C | 이월과세 호스트에 「증여자가 토지·건물을 다른 날 취득」 토글 → 증여자 파트별 취득일·취득가액·자본적지출 + 양도가액 구분(`LandBuildingSaleSplitSection`) | `CarryoverGiftBlock` 래퍼(일반건물 `GeneralBuildingAcquisitionCardsParts.tsx:316-326`의 `carryover → 다른 키` 패턴) |
| A | `LandPartCauseBlock` 라디오에 「이월과세(증여)」 추가 → 래퍼 블록. 증여 등기접수일 입력 시 토지 취득일을 **한 번의 onChange 배치 patch**로 함께 기록(`isSeparateAcquisition`이 원값을 읽으므로 store에 실제로 써야 한다, useEffect 미러링 금지) | 같음 |
| B | `BuildingCauseMixBlock` 호스트에 `carryover_gift` 추가 + 매매 블록 「건물 원인 모드」 확장 | `CompanionAcqPurchaseBlock`이 576줄 — 800줄 정책상 분리 여지 |

- 파트 모드에서는 `CarryoverEstimationSection`의 PHD(§164⑦ 3-시점)·APD 환산 옵션을 숨긴다 — 토지+건물 **합산** 환산이라 파트 단위에서 의미가 없다.
- 증여자 자본적지출(`donorCapitalExpenditure`)과 수증자 자본적지출(파트 `*DirectExpenses`)은 라벨로 구분한다.
- 「지원하지 않는다」 고지 3곳 교체: `land-gift-carryover-notice`, `building-gift-carryover-notice`, 증여자 취득일 hint(`BuildingCauseMixBlock.tsx:134`).
- ⑥ 사이드바: 이월과세 파트는 계산 전 `pending`, 결과 후 엔진 파트 합으로 해소(`transfer-per-asset-summary.ts` split 분기 — #2081 규약).
- ⑦ 결과 4뷰(카드·상세명세서·신고서·PDF): `splitCauseLabel`은 이미 `carryover_gift`를 안다(`transfer-tax-split-display.ts:56`). 파트별 장특 기산일·비교과세 A/B·증여세 상당액 표시를 추가한다. 기존 `CarryoverComparisonCard`는 자산 단위만 읽는다(`ValuationDetailCards.tsx:125`).

### 6.4 14 동기화 지점

| 지점 | 할 일 |
|---|---|
| ① | `landAcquisitionCause`에 `carryover_gift`(타입), `landCauseHost`에 `carryover_gift`(C), `landCarryover` 신설 — `LAND_CAUSE_META` 키 커버리지가 컴파일 가드 |
| ② | `landCarryover: { ...CARRYOVER_DEFAULTS }` (`calc-wizard-asset-factory.ts:205` 부근) |
| ③ | `migrateAsset`이 빈칸만 채운다. 잔재는 지우지 않는다(읽는 쪽 파생, D0 G-6 규약). 판정 메뉴 handoff(`gift-household-handoff.ts:41`)도 같은 경로 |
| ④ | 단건(`transfer-tax-api-split.ts`)·컴패니언(`companion-payload.ts:245`). 일반건물 비공개 빌더(`gb-carryover.ts:70,94`)를 공용 모듈로 추출 + 주택용 어댑터(컨벤션 반대). 지분 스케일 `PART_SCALE` 승계는 V-5 |
| ⑤⑥⑦ | §6.3 |
| ⑧ | 새 분기 3개(A·B·C). 필수 칸 순서와 규칙은 `collectSplitPartCauseIssues` 단일 소스(⑧≡⑫ 격자). 일반건물 `validateGbCarryover`(`lib/calc/transfer-tax-validate-gb-carryover.ts`)의 파트 루프를 함수로 추출해 재사용 |
| ⑫ | `splitAcquisitionShape`에 새 키, G-1·`:249` refine을 「서브객체 필수 필드」 검증으로 교체 |
| ⑬⑭ | body spread, `engine-input.ts:365`·`bundled-split-helpers.ts:411` Date 변환(`giftRegistryDate`·`donorAcquisitionDate`) |
| 다건 | ⑧(`multi-transfer-tax-validate.ts:145`)·⑫(`schema-multi-refines.ts:42-45`) 거부 목록에 `landAcquisitionCause: carryover_gift`·새 키 추가. 키 커버리지 테스트(`transfer.route.multi-key-coverage-f12.test.ts`)가 누락 시 실패해야 정상 |

---

## 7. 단계 (PR 분할 제안)

| PR | 내용 | 화면 변화 |
|---|---|---|
| **P0** | Pre-Do anchor(§4 케이스를 RED 기준으로 고정) · H-4·H-5 실측 · 다건·컴패니언 새 키 명시 거부 · ⑧ 분기 골격 · 일반건물 파트 루프·빌더 공용 추출 | 0 |
| **P1** | 엔진 코어 §6.2(A·B·C 3모드) + ⑫⑬⑭ + echo. 1세대1주택 비과세 판정 경로에서 파트 이월과세가 걸리면 400 + 안내(P5 전까지) | 0(API만) |
| **P2** | C UI(①~⑧, ⑦ 4뷰) + E2E | C 입력 가능 |
| **P3** | A UI + 고지 교체 + E2E | A 입력 가능 |
| **P4** | B UI(매매 블록 건물 원인 모드 확장) + E2E — `d2-2.spec.ts:214-217` 「이월과세 호스트에는 토글이 없다」 반전 | B 입력 가능 |
| **P5** | 1세대1주택 ②2호 판정 + 부수토지 통칙 상호작용 — V-2·V-3 확정 후 | 차단 해제 |

- 최소 정확성 단위는 「토지만 이월과세 + 비과세 아님」(P1+P3)이지만, C는 지금 **침묵 오차**라 UI를 C부터 연다(Q-1).
- E2E는 일반건물 `e2e/general-building-carryover.spec.ts` 구성(시드 → 폼에서 payload가 실제 만들어지는지 Network 확인)을 따른다. vitest만으로는 「폼에서 키가 안 만들어지는」 결함을 못 잡는다(그 파일의 교훈).
- 반전·갱신 대상 기존 spec: `transfer-acq-cause-mixed-d0.spec.ts:36-41`, `d1-2.spec.ts:47`, `d2-2.spec.ts:143`(고지 testid).

---

## 8. 사용자 결정 질문 — ✅ 2026-10-19 전부 권장안으로 확정

| # | 질문 | 권장안 | 근거 |
|---|---|---|---|
| **Q-1** | 범위·순서 | **A·B·C 모두, P0 → P1(엔진 3모드) → P2 C → P3 A → P4 B → P5 1세대1주택** | C는 지금 고지 없이 ±수천만 원 오차(H-3). A·B는 고지가 있거나 400이라 사용자가 틀린 값을 받지는 않는다. 엔진은 3모드가 같은 해결자라 한 번에 만든다 |
| **Q-2** | 데이터 모델 | **α** — `landCarryoverTaxation`·`buildingCarryoverTaxation` + 사건 1벌, 폼 `landCarryover` 신설 | 일반건물과 대칭, C 표현 가능. β는 의미 충돌 |
| **Q-3** | 비교과세(②3호) 단위 | **파트별 A/B** (일반건물 선례 — 카드별 단건 엔진·신고단위 결정세액 비교) | §94①1호상 토지·건물은 별개 자산, §97의2①이 「해당 자산」 단위. 단 정면 해석례 미확보(V-1) — 주택 일체로 비교하면 토지·건물 증여자일이 다를 때 조합을 놓친다 |
| **Q-4** | 증여세 상당액 입력 | **사건 1벌(산출세액·과세가액) + 파트 평가액 → 엔진이 영 §163의2②로 안분, 한도는 파트 gain** | 일반건물 기확정 방식, 명문 안분 |
| **Q-5** | 1세대1주택 비과세와 겹칠 때 | **P5 전까지 400 + 안내로 막는다** | ②2호 「제1항을 적용할 경우 비과세 주택 양도에 해당하게 되는 경우」를 토지만 이월과세에 어떻게 적용할지 미확정(V-2). 모르는 채 열면 비과세·과세가 뒤집힐 수 있다 |
| **Q-6** | 컴패니언(함께 양도 2번째 이후 자산) | **주 자산 먼저, 컴패니언은 ⑤·⑧·⑫ 명시 차단 후 후속** | ⑫ shape는 공유라 엔진은 열리지만 ④·⑤ 경로가 다르다. 반쯤 열면 침묵 strip 위험 |
| **Q-7** | 다건(합산) 경로 | **명시 차단 유지** — 새 키도 거부 목록에 | 다건은 이월과세 자체를 이미 거부한다(`schema-multi-refines.ts:42`). 파트 override(`CarryoverScenarioOverrides`를 `{land, building}`로)는 별도 작업 |
| **Q-8** | A의 토지 취득일 입력 | **증여 등기접수일 1곳 입력 + 토지 취득일은 같은 patch로 기록·읽기 전용 표시** | 두 칸을 따로 받으면 어긋날 수 있다 |
| **Q-9** | 증여자 동일세대 질문(비과세 통산) | **묻지 않고 「확인 필요」 고지** | D2 「건물만 증여」 선례(`gift-household-payload.ts` 부근)와 같다. 모름 = 혜택 불성립 |
| **Q-10** | H-6(일반건물 PHD/APD ⑧ 불일치 가능성) | **P0에서 실측만, 결함이면 별건 PR** | 파트 UI에는 어차피 옵션을 숨긴다 |

---

## 9. 확인 필요 (착수 조건 표시)

| # | 내용 | 착수 조건 |
|---|---|---|
| V-1 | ②3호 비교 단위 — 파트별인지 주택 일체인지. 정면 해석례 미확보(§2) | P1 Design (Q-3 권장안의 근거 보강) |
| V-2 | ②2호를 「토지만 이월과세」 주택에 적용하는 방법 — 영 §154⑤ → §95④ 단서로 증여자 보유가 1세대1주택 보유요건에 통산되는지. 자산 단위 엔진이 따르는 사전-2016-법령해석재산-0374(「해당하게 **되는**」 = 상태 변화 — 이월과세 없이도 1세대1주택이면 ②2호 미발동, `transfer-tax-carryover.ts:476-490`)는 주택 전체 증여 사안이라 파트 사안의 선례가 아니다 | **P5** |
| V-3 | 1세대1주택 부수토지 장특 통칙 95-0…1에서 증여자 보유 통산이 「주택으로서의 보유」에 들어가는지 | P5 |
| V-4 | 증여자가 토지·건물을 **총액으로만** 취득한 경우의 파트 취득가액(일반건물 계획서도 범위 밖으로 둠) | P1 Design — 안 되면 ⑧ 차단 + 안내 |
| V-5 | 지분 모드 스케일(일반건물 `PART_SCALE`, 2026-08-23 반전)을 split에 그대로 승계해도 되는지 | P1 |
| V-6 | 이월과세 토지 파트의 다주택 판정(`houseCountExclusionAcquisitionDate`)·조정대상지역 「취득 당시」(`giftHouseholdBasis`) 연결 | P1 Design |
| V-7 | H-4 크래시 · H-5 ⑧ 조기 return — 코드 독해로만 도출 | P0 실측 |

---

## 10. 범위 밖

- 겸용주택(B1 파트 모델 `mixed-use-part-acq.ts`는 매매 전용), 일반건물(이미 파트 이월과세 있음), 상업용 건물·재개발·입주권·분양권.
- 부담부증여 파트 분리(`:249` 메시지의 다른 절반, 영 §159) — 이 계획은 이월과세만 연다. `:249`는 부담부증여 차단을 남긴 채 이월과세만 푼다.
- 토지 이월과세 + 건물 상속·증여(`BUILDING_CAUSE_UNSUPPORTED`) — 결합 차단 유지.
- 지분별 분할 취득(`splitMode === "fractional"`).

---

## 11. Design 통합 (2026-10-19) — 엔진·UI 설계 대조 정본

설계서: `docs/02-design/features/transfer-split-part-carryover.engine.design.md`(와이어 정본 §1) · `...ui.design.md`. Pre-Do anchor `__tests__/api/transfer.route.split-part-carryover.predo.anchor.test.ts` **15 pass · 16 skip**.

| # | 쟁점 | 엔진 설계 | UI 설계 | **통합 결정** |
|---|---|---|---|---|
| I-1 | C 기대값 | 파트별 ②3호로 300,018,000 | — | **300,018,000** (Q-3 확정의 귀결. 4조합 실측: 둘 다 B 93,110,000 · 토지만 A 89,082,000 · 건물만 A 300,018,000 · 둘 다 A 295,566,000). §4 표 정정 |
| I-2 | 와이어 키 | `carryoverGiftEvent` 1벌 + `landCarryoverPart`·`buildingCarryoverPart`(최상위 형제), **파트 평가액 칸 없음**(`landAcquisitionPrice`·`buildingAcquisitionPrice` 정본). 엔진 input 이름은 `landCarryoverTaxation`·`buildingCarryoverTaxation`(⑭ 합성기 출력) | 엔진 초안 기준으로 작성 | **엔진 §1 채택** — 계획서 §6.1의 「와이어 = `*CarryoverTaxation`」을 대체(이중 진실 회피, 일반건물 `composeGbCarryover` 선례) |
| I-3 | 지분 스케일(V-5) | 사건 금액(산출세액·과세가액)도 스케일 | 사건 금액 **미스케일**(`GIFT_EVENT_SCALE`) | **UI 안 채택** — 일반건물 코드가 사건 금액을 스케일하지 않는다(`transfer-tax-api-gb-carryover.ts` `GIFT_EVENT_SCALE` 전부 `false`, 「증여세 신고서에 적힌 사실」). 엔진 설계 §5의 「GB 반전 = 사건도 스케일」은 오독(반전은 파트 분자). 파트 금액(증여자 취득가·자본적지출)과 파트 평가액(분자)은 스케일 |
| I-4 | 파트 환산(증여자 취득가액 모름) | P1 미지원 — `donorAcquisitionPrice>0` 필수(V-4) | 「환산취득가 사용」 토글 + 증여자 취득시 기준시가 1칸 | **P1~P4는 엔진 안**: 토글 없이 증여자 취득가액 필수 + 안내(「모르면 이 화면은 아직 지원하지 않습니다」). 파트 환산은 **후속 P6**으로 등록 |
| I-5 | 안정 구성이 둘일 때 순서(V-8) | 토지→건물 고정, 동률 A (1,050 격자 중 100건이 두 안정 구성, 18건 최대 49,000,000 차) | — | **엔진 안** — N-1 사용자 결정(2026-08-23 「2ⁿ 전수 = 조문에 없는 최적화, 재제안 금지」)과 같은 순차 고정점. 순서 의존은 echo·결과 카드에 「확인 필요」 고지 |
| I-6 | 주 자산 + 컴패니언 병용(V-9) | 주 자산 파트 이월과세 + 컴패니언 1건이라도 있으면 400 | 같은 차단 + 안내 N8 | **채택(차단)** — 단건 비교는 N-1이 밝힌 신고단위 결함(300 격자 중 7건 과소)을 파트로 겪는다. 지금도 파트 이월과세는 전부 막혀 있어 기존 기능을 빼앗지 않는다. 다건 신고단위 확장 때 함께 연다 |
| I-7 | 1세대1주택 게이트(Q-5) | `isHousing ∧ isOneHousehold===true ∧ ¬isUnregistered`, 결과 `isExempt`이면 안전망 throw | 보유 상황 단계 ⑧이 같은 leaf 호출 | 일치 |
| I-8 | C 날짜·B 날짜 | 두 날짜 = 증여일, 다르면 400(T14) | A만 write-through, B·C는 읽는 쪽 파생 | 일치 |
| I-9 | 자산 단위 이월과세와 관계 | 상호배제(R-1, S3) — 자산 이월과세 + split은 ⑫ 400 | B·C 호스트는 최상위 `carryoverTaxation` 미전송 | 일치. `transfer-tax-schema-required-refines.ts:196` 「carryoverTaxation 필요」는 파트 서브객체가 있으면 면제로 좁힌다 |

### 11.0 증여세 상당액 한도 단위 — 해석례 본문 확인 (2026-10-19)

사전-2025-법규재산-0366(법규과-1290, 2025.6.18.) 본문(taxlaw.nts.go.kr `ntstDcmId=200000000000012982`, Playwright 직접 열람): 증여세 상당액 = 산출세액 × 양도한 자산가액 / 증여세 과세가액, **「다만, 필요경비에 산입하는 증여세 상당액은 해당 자산에 대한 양도차익을 한도로」**. 토지·건물은 소득세법 §94①1호상 각각 별개 자산이므로 「해당 자산」 = 그 파트로 읽는다(P1 구현). ⚠️ 파트(토지·건물 별개 취득)를 정면으로 다룬 해석례는 아니다 — 독법의 근거는 §94①1호 + 0366 문언.

### 11.1 Design 단계 실측으로 확인된 기존 결함 (별건)

| ID | 판정 | 내용 | 처리 |
|---|---|---|---|
| H-4 | 잠재 결함(현행 UI 도달 불가) | 저장값 `landAcquisitionCause: "carryover_gift"` + 호스트 일치 → `LandPartCauseBlock.tsx:114` `LAND_CAUSE_META[cause]` undefined → `TypeError ... reading 'label'`(매매·신축 호스트 모두). ⑧은 G-1로 차단, ④는 그대로 전송 | **P3 선결**(캐스트를 화이트리스트로) |
| H-5 | 결함 — ⑧ 통과 ↔ ⑫ 400 | 이월과세 호스트 + 소유자 분리(`building_only`·`land_only`), 안분 칸 비움 → ⑧ 0건(`transfer-tax-validate-acquisition.ts:355` `return null`) ↔ ⑫ 400(`standardPricePerSqmAtAcquisition` 등 5필드). 칸은 화면에 있어 채우면 200 — 막다른 길은 아님 | **별건 선행 PR**: 이월과세 분기 끝에서 `selfOwns≠both`면 `validateSplitDirectInputs` 위임 |
| H-6 | 결함 — 막다른 길(일반건물) | 일반건물 토지 이월과세 환산 `estimationMode` phd/apd + `donorStandardPriceAtAcquisition` 비움 → ⑧ 오류인데 그 칸은 general 분기에만 렌더(`CarryoverEstimationSection.tsx:92-163`) | **별건 선행 PR**(Q-10). 파트 UI에는 복사하지 않는다 |

### 11.2 확정 실행 순서

1. **선행 별건 PR** — H-5 + H-6 (이월과세 ⑧ 정합 2건)
2. **P1** — 설계서·anchor + 엔진 해결자 + ⑫⑬⑭ + leaf S0~S9 (화면 변화 0)
3. **P2** C UI → **P3** A UI(H-4 선결) → **P4** B UI
4. P5 1세대1주택 ②2호 · **P6 파트 환산**(I-4) — 후속
