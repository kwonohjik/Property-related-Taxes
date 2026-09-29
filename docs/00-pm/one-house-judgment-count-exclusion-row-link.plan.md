# 1세대1주택 판정 — 주택 수 제외 특례(조특법 §99의4·§98의9·감면주택)를 보유 주택 명부 행과 연결

> 작성 2026-09-29 · 상태 **Do 완료 — 엔진·배관·UI·검증·전달 구현, anchor 17 · UI 7 · E2E 2 (§7-3)** · 대상 화면 `/calc/one-house-exemption` ③ 보유 주택·권리
> 선례: D-6(§155⑥1호·⑦·⑧을 명부 행으로 이전 — `lib/calc/one-house-row-facts.ts`) · 합가 명부 연결(`one-house-judgment-merge-house-link.plan.md`)
> 인용 기준: master `2db7fc10` + PR(소제목 묶음) 브랜치 `c2e797be`. `Step2.tsx` 줄 번호만 그 PR로 바뀌었다.

## 1. 제보 요약

③ 화면의 주택 수 제외 입력 3종이 **명부의 어느 주택인지와 연결되지 않는다**(스크린샷 10).

- 조특법 감면주택 보유 — 주택 수 제외(§89①3호 의제)
- 농어촌주택·고향주택 — 조특법 §99의4
- 수도권 밖 준공후미분양주택 — 조특법 §98의9

다른 보유 주택이 여러 채면 어느 주택이 무슨 사유로 빠지는지, 어느 주택이 주택 수에 들어가는지 알 수 없다.

## 2. 현황 실측

### 2-1. 입력이 두 저장소에 있고, 둘 다 행이 아니다

| 입력 | 저장소 | UI | ④ 변환 |
|---|---|---|---|
| 감면주택(10개 조문) | `form.specialHouseExclusions[]` | `components/calc/transfer/SpecialHouseExclusionSection.tsx` ← `HouseCountExemptionInputs.tsx:74-77` (계산기와 공용) | `lib/calc/one-house-exemption-api.ts:217-225` |
| §99의4 · §98의9 | `assets[0].reductions[]` (양도 대상 자산) | `app/calc/one-house-exemption/steps/SpecialTaxHouseCountExclusionSection.tsx` | `one-house-exemption-api.ts:126-129` (`judgmentHouseCountExclusionReductions` → `toEngineReductions`) |

- 안내문은 「위 보유 주택 목록에 넣으세요」라고 하지만(`SpecialTaxHouseCountExclusionSection.tsx:70`) **연결하는 코드는 없다.**
- 행에는 이미 `isUnsoldHousing`(「조특법 감면주택(미분양·신축)」)이 있으나, 이것은 **중과 배제**(소령 §167의3①5호) 축이라 주택 수에는 그대로 산입한다. 새 필드와 이름·축을 섞으면 안 된다(`feedback_rename_same_name_two_axes`).

### 2-2. 엔진은 조문 1건당 1채를 스칼라에서 뺄 뿐이다

- `lib/tax-engine/transfer-tax-house-exclusion-step.ts:204-207` — `householdHousingCount − totalExcluded`. 어느 행인지는 쓰지 않는다.
- `lib/tax-engine/one-house/house-count.ts:139-155` — §99의4·§98의9·감면주택 제외는 `houseId` 없이 명세에 들어간다. `houseId`가 있는 것은 §155②③ 상속뿐이다(`:156-166`, 주석 「행을 특정할 수 있는 유일한 축」).
- 평가기는 행이 아닌 **선언에 적힌 사실**을 읽는다: §99의4 `new-99-4.ts:61-67`·`:115`, §98의9 `unsold-98-9.ts:75`·`:171-177`. 기준인 「일반주택」 취득일은 양도 대상 주택 취득일이다.
- 결과 화면 `components/calc/results/OneHouseJudgmentResultView.tsx:124-140`은 `excluded[].label`만 그린다(`houseId` 미사용).

### 2-3. 🔴 probe 실측 — 판정이 틀린다 (throwaway, ④ 본문 → route `POST`, 실행 후 삭제)

공통: 양도 대상 S 취득 2015-01-01 · 양도 2024-06-01 · 9억 · 비조정. R = 농어촌주택(2021-01-01, §99의4 요건 충족 선언), N = 일반주택.

| # | 입력 | 판정 결과 | 법령상 |
|---|---|---|---|
| P1 | S + N(2023-12-01) | 비과세 | 비과세 (대조군) |
| **P2** | S + R + N(2023-12-01) | **과세 · 미충족 사유 0건** | 비과세 — 해석례 서면-2021-부동산-6220(§3) |
| **P3** | S + §99의4 선언, 명부에 R 없음 | **주택 수 0채 · 과세 · 사유 0건** | 비과세(1채 9년 보유) |
| P5 | S + N(2016-01-01, 처분기한 경과) | 과세 | 과세 (대조군) |
| **P6** | S + N(2016-01-01) + §99의4 선언, 명부에 R 없음 | **비과세** | 과세 — **과소과세 방향** |

- P2·P3·P6 모두 `validateAllSteps` 오류·경고 **0건**.
- 감면주택(10개 조문)은 같은 구조(행 미특정 차감)지만 **probe는 §99의4로만** 돌렸다.

### 2-4. 원인 분해

1. **P2 — 신규 주택 후보에 제외 주택이 섞인다.** `resolveTemporaryTwoHouse`(`lib/calc/household-house-count.ts:254-284`)가 「양도 주택보다 늦게 취득한 명부 행이 정확히 1채」를 요구하는데(`:273-276`), R이 후보에 들어가 2채가 되어 §155①이 성립하지 않는다. 스칼라 주택 수는 3→2로 맞게 줄지만, 그 2채가 S+N인지 모르는 채로 판정된다.
2. **P3·P6 — 선언과 명부가 따로 논다.** 선언은 행이 없어도 1채를 뺀다. P6은 선언이 엉뚱한 N을 빼 준 셈이다.
3. **사실의 이중 입력** — 선언 폼이 행과 같은 사실을 따로 묻는다(§4-2 표).

### 2-5. `resolveTemporaryTwoHouse`의 호출부 — 계산기와 공용

`transfer-tax-api-body-blocks.ts:56` · `temporaryTwoHouseApplies`(`household-house-count.ts:287`)를 거쳐 `transfer-tax-api.ts:551` · `transfer-tax-validate.ts:656` · `multi-transfer-tax-api.ts:167` · `transfer-tax-api-residence.ts:59` · `one-house-judgment-section-scope.ts:87`, 판정 메뉴 `one-house-judgment-temp-two-house.ts:17`.
⇒ 후보 제외 규칙을 이 함수에 넣으면 **계산기에도 적용된다.** 다만 제외 표시가 행에 있을 때만 작동하므로, 계산기 UI가 그 표시를 쓰기 전까지 계산기 결과는 바뀌지 않는다(§4-5).

## 3. 법령 근거 (KoreanLaw MCP — 조세특례제한법 MST 284389, 2026-09-18 시행 현행본 실독)

- **§99의4①**: 1세대가 농어촌주택등취득기간 중 「다음 각 호의 어느 하나에 해당하는 **1채의 주택**」을 취득하여 3년 이상 보유하고 「**그 농어촌주택등 취득 전에 보유하던** 다른 주택(일반주택)을 양도하는 경우에는 그 농어촌주택등을 **해당 1세대의 소유주택이 아닌 것으로 보아** 「소득세법」 제89조제1항제3호를 적용한다」.
  - 1호 농어촌주택 가목(소재) · 나목(취득 당시 기준시가 합계 3억, 한옥 4억) / 2호 고향주택 가·나·다목.
  - ③ 같은·연접 읍·면·동(고향주택은 시)이면 미적용 · ④ 3년 보유 전 양도에도 적용 · ⑥ 미충족 시 추징 · ⑦ 과세특례신청.
- **§98의9①**: 「1주택을 보유한 1세대」가 2024.1.10.~2026.12.31. 준공후미분양주택을 취득한 후 「**준공후미분양주택을 취득하기 전에 보유한 주택**을 양도하는 경우에는 그 준공후미분양주택을 해당 1세대의 소유주택이 아닌 것으로 보아 같은 법 제89조제1항제3호를 적용한다」.
- **효과의 범위는 §89①3호 한정** — 다주택 중과의 주택 수는 바꾸지 않는다. 엔진도 같은 원칙이다(`transfer-tax-house-exclusion-step.ts:6` 「중과 주택수는 불변(R-D)」).
- **해석례 서면-2021-부동산-6220**(2022.09.14, taxlaw.nts.go.kr Playwright 실독): 종전주택 A(2012.11.21.)를 취득하고 1년이 지난 뒤 비조정 신규주택 B(2019.3.17.)를 취득해 일시적 2주택인 1세대가 §99의4 농어촌주택 C(2019.10.21.)를 취득하고, A를 B 취득일부터 3년 이내(2021.12.12.) 양도하면 「국내에 1개의 주택을 소유하고 있는 것으로 보아 「소득세법」 제89조제1항제3호를 적용」. ⇒ **P2는 결함으로 확정.**
- 감면주택 10개 조문 — §7-1 V-3.
- **해석례 사전-2021-법령해석재산-0072**(2021.02.23): 종전주택 A → §99의4 농어촌주택 B(3년 이상 보유) → 신규주택 C 순서로 3주택이 된 1세대가 A를 양도하면 「B주택은 … 해당 1세대의 소유주택이 아닌 것으로 보는 것」이고 §155① 요건을 갖추면 §154①을 적용한다. ⇒ P2의 두 번째 근거.

## 4. 해결 방향

### 4-1. 원칙

1. **정본은 명부 행이다** — D-6와 같다. 「그 주택」이 무엇인지가 법문의 대상이므로 세대 단위 선언이 아니라 행의 속성이다.
2. **엔진 평가기는 그대로 쓴다** — ④ 변환층이 행 → 기존 엔진 입력(`reductions`·`specialHouseExclusions`)으로 바꾸되 **행 id를 함께 싣는다.** 규칙을 두 벌 만들지 않는다(`feedback_aggregate_display_rederives_engine_value`).
3. **행이 없는 선언은 존재할 수 없게 한다** — P3·P6은 입력 구조로 막는다.

### 4-2. 데이터 모델 — `HouseEntry`(`lib/stores/calc-wizard-asset-nbl.ts:75`) 확장

행에 「주택 수 제외 사유」 하나를 둔다(한 주택에 사유는 하나).

| 사유 | 행에서 가져오는 사실 | 행에 새로 받는 사실 |
|---|---|---|
| §99의4 농어촌 / 고향 | 취득일 ← `acquisitionDate`, 지번 ← `addressJibun` | 취득 당시 기준시가 합계, 등록 한옥, 연접 여부, 소재 요건 확인 (고향: 고향 요건) |
| §98의9 준공후미분양 | 취득일 ← `acquisitionDate`, 취득가액 ← `acquisitionPrice`, 전용면적 ← `exclusiveArea` | 수도권 밖 여부(아래 주의), 취득 당시 1주택 세대, 매도자·계약 요건 확인 |
| 감면주택(10개 조문) | 취득일 ← `acquisitionDate` | 조문, 매매계약일, 국민주택(§99), 요건 확인 |

- ⚠️ §99의4의 「취득 당시 기준시가」는 행의 `officialPrice`(양도연도 공시가)와 **다른 사실**이다 — 합치지 않는다.
- ⚠️ §98의9 「수도권 밖」은 행 `region`으로 도출할 수 **없다** — `region: "capital"`의 화면 표시는 「수도권·광역시 등」이다(`HousesListSection.tsx:120`). 광역시는 수도권 밖이다. `regionCode` 도출 가능성은 **V-4**.

### 4-3. 1단계 — 엔진·배관 (행 id를 끝까지)

1. ④ 어댑터: 제외 사유가 있는 행 → `reductions`/`specialHouseExclusions` 원소 + `houseId`. 기존 `assets[0].reductions`·`form.specialHouseExclusions` 경로는 **레거시 입력**으로 남긴다(§4-6).
2. Zod(⑨⑩⑫)·route(⑭): `houseId` 통과. 평가기(`new-99-4.ts`·`unsold-98-9.ts`·`unsold-hybrid-p5.ts`)는 결과에 `houseId`만 되돌려 주고 판정 로직은 불변.
3. `buildOneHouseCountBreakdown`(`house-count.ts:118-`): `excluded[]`·`notApplied[]`에 `houseId` 채움.
4. **신규 주택 후보에서 제외 행을 뺀다** — `resolveTemporaryTwoHouse`에 「제외된 행 id 집합」 인자 추가. 어느 행을 빼는지는 **Q-3**.
5. 같은 이유로 행 구성을 보는 술어도 제외 행을 뺀 명부를 본다 — 합가 구성 `merge-composition.ts:89`(`houses.length !== count`이면 `unknown`), 장기임대 거주주택 구성 `transfer-tax-rental-residence-composition.ts:57·67`(`special_act`면 `undetermined`). 지금은 행을 몰라 판정을 포기하는 자리다. 범위 포함 여부는 **Q-5**.

### 4-4. 2단계 — UI

1. 행 편집 모달(`components/calc/transfer/HouseEntryEditor.tsx:476-490`)에 **「주택 수 제외(조특법)」 섹션** 추가. 판정 메뉴 전용이면 `mergeContext`(`:47`·`:481`)처럼 옵셔널 prop으로 게이트한다(**Q-1**).
2. 명부 표 「특례」 열(`HousesListSection.tsx:69` `resolveHouseBadges`)에 제외 사유 배지.
3. ③ 화면의 기존 두 섹션 제거 — `SpecialTaxHouseCountExclusionSection`(판정 전용), `SpecialHouseExclusionSection`(계산기 공용이므로 판정 메뉴에서만 숨기는 prop).
4. 사이드바 「선언한 특례」 줄(`lib/calc/one-house-exemption-validate.ts:570-574`)을 행 기반으로.
5. 결과 화면(`OneHouseJudgmentResultView.tsx:124-140`): `houseId` → 「보유 주택 N (취득일) — 사유」. 요건 미달(`notApplied`)도 같은 형식.

### 4-5. 3단계 — 검증(⑧)

- 제외 사유를 고른 행의 필수 사실(§4-2 「새로 받는 사실」).
- §99의4 사유 행이 2채 이상이어도 ⑧에서 막지 않는다 — 엔진이 `notApplied`로 사유를 낸다(§7-1 V-2).
- 순서 요건(양도 대상이 그 주택보다 먼저 취득)은 엔진이 이미 `notApplied`로 낸다 — ⑧에서 막지 않고 결과에 사유를 보인다(법문상 요건 미충족이지 입력 오류가 아니다).

### 4-6. 옛 기록 호환 — 행이 지정되지 않은 선언

D-6는 「행 표시가 있으면 행, 없으면 레거시」로 세액을 보존했다(`one-house-row-facts.ts:9-16`, `fromLegacyOnly`). 이 축은 **레거시 동작 자체가 P3·P6 결함**이라 그대로 보존하면 과소과세도 보존된다. **Q-2**로 결정한다.

### 4-7. 판정 → 계산기 전달

`toTransferFormPatch`(`lib/calc/one-house-judgment-handoff.ts:81-`)는 폼을 펼쳐 넘긴다. 행 필드는 자동으로 넘어가지만, 계산기가 행 필드를 읽지 않으면 제외가 사라진다. **Q-4**.

## 5. 작업 순서 (Do — Q·V 확정 후)

```
0. ✅ V-1~V-5 확인 완료(§7-1)
1. anchor 선작성(Pre-Do): P2 비과세 · P3·P6 차단 · breakdown houseId  → verify: 현행에서 RED
2. 엔진·배관 (§4-3)                               → verify: anchor GREEN · 엔진 anchor 회귀 0
3. UI (§4-4) · 14지점                              → verify: ui-engine-sync-checker
4. 검증·레거시 (§4-5·§4-6)                         → verify: P3·P6 차단 anchor
5. E2E (행 모달 → 판정 → 결과 행 라벨)            → verify: 스펙 통과 + 브라우저 확인
```

## 6. 테스트 계획

| 축 | 테스트 | 단언 |
|---|---|---|
| P2 해석례 재현 | anchor (route) | 서면-2021-부동산-6220 사실관계 A·B·C → 비과세 + `excluded[].houseId === C` |
| P2 짝 | anchor | C를 제외하지 않으면 3주택 → 과세 (`feedback_negative_anchor_needs_positive_twin`) |
| P3·P6 | validate anchor | 행 없는 선언이 입력 구조상 불가 / 레거시 선언이면 Q-2 결정대로 |
| 신규 주택 후보 | unit (`resolveTemporaryTwoHouse`) | 제외 행을 빼고 1채면 성립 · 빼지 않으면 불성립 |
| 중과 불변 | anchor | 같은 입력의 중과 주택 수가 바뀌지 않는다 |
| 계산기 회귀 | 기존 계산기 anchor 전체 | 행 표시가 없는 입력은 결과 불변 |
| 화면 | UI test + E2E | 행 모달 섹션 · 「특례」 배지 · 결과 「보유 주택 N — 사유」 |
| 기존 테스트 재작성 | `__tests__/calc/one-house-judgment-c2-display.ui.test.tsx:103-126`(C2-28-UI-a·b·c) | 입력 위치가 행 모달로 바뀜. `one-house-judgment-c2.anchor.test.ts:202-262`는 어댑터가 `reductions`를 유지하면 그대로 통과해야 한다 |

E2E는 `one-house-new-99-4`·`one-house-unsold-98-9` testid를 쓰는 스펙이 없다(grep 0건). 행 사실 E2E 표본은 `e2e/transfer-house-row-one-house-facts.spec.ts`.

## 7. 레지스터

### 사용자 결정 (Q) — ✅ 2026-09-29 전건 추천안으로 확정

| # | 질문 | 선택지 | 결정 |
|---|---|---|---|
| Q-1 | 범위 | (a) 판정 메뉴만 — 행 섹션을 prop으로 게이트 (b) 계산기까지 | ✅ **(a)** — 계산기는 §99의4·§98의9가 감면 패널(`UnifiedReductionPanel`) 소유라 이전 범위가 크다. V-1 실측 후 후속 계획 |
| Q-2 | 행이 지정되지 않은 옛 선언 | (a) 판정 차단 + 「어느 주택인지 지정」 안내 (b) 종전대로 1채 차감 + 안내만 | ✅ **(a)** — (b)는 P6 과소과세를 보존한다. 저장된 옛 결과는 그대로 남고, **다시 판정할 때만** 막힌다 |
| Q-3 | 신규 주택 후보에서 빼는 행 | (a) 제외 사유를 고른 행 전부 (b) 요건을 충족한 행만 — 엔진 평가기를 클라이언트에서 재사용 | ✅ **(b)** — 요건 미달 R은 소유주택이므로 3주택이 맞다. (a)면 화면은 일시적 2주택을 그리는데 서버는 3주택으로 판정해 두 진실이 생긴다 |
| Q-4 | 판정 → 계산기 전달 | (a) 전달 시 행 선언을 계산기 저장소(`reductions`·`specialHouseExclusions`)로 변환 (b) 계산기가 행 필드를 읽게 한다 | ✅ **(a)** — Q-1(a)와 짝. 계산기 세액 경로를 건드리지 않는다 |
| Q-5 | 합가 구성·장기임대 거주주택 구성의 `unknown`/`undetermined` 해소 | (a) 이번 범위 (b) 곁가지로 기록 | ✅ **(b)** — 결론이 바뀌는 새 판정이라 별도 anchor가 필요하다 |

### 가정 (A)

- A-1 제외 효과는 §89①3호 한정이고 중과 주택 수는 불변(§3 · `transfer-tax-house-exclusion-step.ts:6`).
- A-2 평가기 판정 로직은 바꾸지 않는다 — 입력 출처(선언 → 행)와 `houseId` 반환만 바뀐다.

### 미검증 (V) — Do 전 확인

| # | 내용 | 방법 | 결과 |
|---|---|---|---|
| V-1 | 계산기에도 P2·P3·P6이 재현되는가 | 계산기 route probe | ✅ **재현된다** — §7-1 |
| V-2 | §99의4 「1채」가 농어촌+고향 합산 1채인가, 조문별 1채인가 | 해석례 검색(국세청·조세심판원) | ✅ **2채 보유 중에는 미적용** — §7-1 |
| V-3 | 감면주택 10개 조문의 효과 문언과 「먼저 보유한 주택」 순서 요건 유무 — 엔진은 순서를 검사하지 않는다(`unsold-hybrid-p5.ts:372-`) | KoreanLaw MCP 조문 실독 | ✅ **순서 요건·수 제한 없음 · §99·§99의3만 양도 기한** — §7-1 |
| V-4 | §98의9 「수도권 밖」을 행 `regionCode`로 도출할 수 있는가 | 코드 확인 | ✅ **가능(코드가 있을 때)** — §7-1 |
| V-5 | §99의4⑦ 과세특례신청을 엔진이 어떻게 다루는가 | 코드 확인 | ✅ **다루지 않는다** — §7-1 · 곁가지 |

### 7-1. V 확인 결과 (2026-09-29)

**V-1 — 계산기도 같은 결함이다.** throwaway probe(계산기 ④ `callTransferTaxAPI` 본문 → `app/api/calc/transfer/route.ts` POST, 실행 후 삭제). 판정 메뉴 probe(§2-3)와 같은 사실관계.

| # | 계산기 입력 | 결과 | 법령상 |
|---|---|---|---|
| C1 | 명부 N | 비과세(일시적 2주택) | 비과세 |
| **C2** | 명부 R·N + §99의4 선언 | **과세 114,686,000** | 비과세 (P2와 같다) |
| **C3** | 명부 없음 · 주택 수 1 · §99의4 선언 | **과세 114,686,000** | 비과세 (P3와 같다) |
| C5 | 명부 N(2016) | 과세 114,686,000 | 과세 |
| **C6** | 명부 N(2016) + §99의4 선언(R 없음) | **비과세 (0)** | **과세 114,686,000** — 과소과세 |

⇒ Q-1(a)의 전제(「계산기는 실측 후 후속」)는 유지하되 **후속 계획의 우선순위가 높다**. 설계 보정 한 가지(§7-2)로 판정 → 계산기 전달분은 이번 범위에서 함께 고쳐진다.

**V-4 — 행 `regionCode`(`lib/stores/calc-wizard-asset-nbl.ts:308`)가 있으면 도출 가능.** `isCapitalAreaByRegionCode`(`lib/geo/rural-house-location.ts:42-45`)가 시도 2자리(서울 11·인천 28·경기 41)로 판정하고 코드가 없으면 `null`. ⇒ 코드가 있으면 자동, `null`이면 지금의 수동 토글(`isNonCapitalRegion`)로 받는다. 행 `region`(「수도권·광역시 등」)은 쓰지 않는다.
- ✅ 조특법 §2①9호 「수도권」= 「수도권정비계획법」 §2제1호 → 같은 법 시행령 §2(MST 277967) 「인천광역시와 경기도」 + 서울특별시. `CAPITAL_AREA_SIDO_CODES`(서울 11·인천 28·경기 41)와 일치한다.

**V-5 — 엔진·입력 폼 어디에도 §99의4⑦ 과세특례신청 처리가 없다**(`new-99-4.ts`·`unsold-98-9.ts`·`New994InputForm.tsx`·`Unsold989InputForm.tsx` grep 0건). 신청이 효력 요건인지 절차인지는 이 계획의 축(행 연결)과 무관하므로 곁가지로 기록한다.

**V-2 — 농어촌주택등을 2채 보유한 동안에는 특례가 적용되지 않는다** (taxlaw.nts.go.kr Playwright 실독).
- 재산세과-1096(2009.06.02)·부동산납세과-91(2014.02.19): 취득기간 중 농어촌주택 2채를 취득한 경우 「**1채를 양도한 후에** 보유하고 있는 농어촌주택 취득 전에 보유하던 다른 주택을 양도하는 경우」 과세특례를 적용한다.
- 농어촌주택 1채 + 고향주택 1채의 조합을 직접 다룬 해석은 찾지 못했다(부동산거래관리과-1340은 멸실 후 재건축 사안으로 무관). 법문은 1호·2호를 합쳐 「다음 각 호의 어느 하나에 해당하는 **1채의 주택**(농어촌주택등)」이라 하므로 **합산 1채**로 본다 — 직접 근거가 아닌 법문 해석임을 코드 주석에 남긴다.
- ⇒ 설계(§4-5 수정): §99의4 사유 행이 2채 이상이면 ⑧에서 막지 않는다(입력 오류가 아니라 법률효과다). **엔진이 둘 다 제외하지 않고** `notApplied`에 「농어촌주택등 2채 보유 — 1채를 양도한 뒤에 적용(재산세과-1096·부동산납세과-91)」로 사유를 낸다. 현행 엔진은 `reductions.find`로 첫 선언만 본다(`new-99-4.ts:61`) — 행 기반에서 이 동작을 명시적 규칙으로 바꾼다.

**V-3 — 감면주택 10개 조문**(조특법 MST 284389 · 조특령 MST 288915, 시행 2026-09-18 — 에이전트 실독, §99②는 직접 대조해 일치 확인).
- 효과 문언: §98의2④·§98의3③·§98의5②·§98의6②·§98의7②·§98의8②·§99의2② 「…해당 거주자의 소유주택으로 보지 아니한다」 · §98은 영 §98②(⑥) 「해당 미분양주택 외의 다른 주택만을 기준으로 하여 「소득세법」 제89조제1항제3호를 적용한다」 · §99②·§99의3② 「그 신축주택 외의 주택을 **2007년 12월 31일까지 양도하는 경우에만**」.
- **순서 요건 없음**(10개 조문 모두 — §99의4·§98의9와 다르다) · **수 제한 없음** · 효과는 모두 §89①3호 한정.
- ⇒ 설계: 감면주택 사유 행은 **여러 채 허용**(현행 `SpecialHouseExclusionSection`도 복수 행). 「양도 대상이 먼저 취득」 검사를 넣지 않는다. §99·§99의3 양도 기한은 현행 엔진·안내(`SpecialHouseExclusionSection.tsx` `new_99`·`new_99_3` 안내문)를 그대로 쓴다.
- 곁가지: 효과 단위가 §99의4·§98의9는 「해당 **1세대의** 소유주택」, 감면주택은 「해당 **거주자의** 소유주택」이다. 세대원이 보유한 감면주택에 미치는지는 이 계획의 축이 아니다(현행 엔진 동작 유지).

### 7-2. 설계 보정

- **행 id를 선언 자체에도 싣는다.** ④ 어댑터가 만드는 엔진 입력 원소(`reductions`·`specialHouseExclusions`)에 `houseId`를 두면, Q-4(a)의 「판정 → 계산기 전달 시 계산기 저장소로 변환」에서도 **어느 행인지가 보존된다**. 그러면 계산기 쪽 `resolveTemporaryTwoHouse`(공용, §2-5)도 그 행을 신규 주택 후보에서 뺄 수 있어 **판정 메뉴에서 넘어온 계산기 입력은 C2·C6이 고쳐진다**. 계산기에서 직접 입력한 선언은 `houseId`가 없으므로 종전 동작 그대로다(Q-1(a) 범위 유지).

### 7-3. 구현 결과 (2026-09-29 — 브랜치 `feat/one-house-count-exclusion-row-link`)

**엔진** (선언이 1건씩이면 종전 결과와 같다 — 양도세 엔진 테스트 289파일 3,108건 불변)
- `new-99-4.ts` `evaluateNew994Declarations` — 선언 **전건** 평가 + `houseId` 반환. 2채 이상이면 전부 불성립(`MULTIPLE_HOUSES` — 재산세과-1096·부동산납세과-91).
- `unsold-98-9.ts` `resolveHouseCountExclusion` — §98의9도 전건 평가, 결과에 `details`(성립·불성립 전건·행 id). `new994Detail`·`unsold989Detail`은 **첫 선언** 그대로(계산기 결과 카드 의미 불변).
- `unsold-hybrid-p5.ts` — 감면주택 평가에 `houseId` 통과(본문은 `evaluateSpecialHouseExclusion`로 추출, 판정 로직 불변).
- `one-house/house-count.ts` `buildOneHouseCountBreakdown` — `excluded`·`notApplied`에 `houseId`·`houseNo`·`houseAcquisitionDate`. **감면주택 불성립 사유도 `notApplied`에 싣는다**(종전에는 성공만 담았다). 상속 제외 항목도 행 번호가 붙는다.

**배관 (⑨⑩⑫⑬⑭)** — Zod `houseId`(§99의4 두 형·§98의9·`specialHouseExclusionSchema`), `engine-input.ts`·`multi/route.ts` 감면주택 매핑, 계산기 ④ `toEngineReductions`·`transfer-tax-api.ts`. `route-reductions-mapper.ts`는 `...r` 전개라 추가 불요.

**클라이언트 단일 소스** `lib/calc/house-count-exclusion-rows.ts`
- `rowCountExclusionReductions`·`rowSpecialHouseExclusions` — 행 → 선언. 취득일·주소·취득가액·전용면적은 행 값, §98의9 수도권 여부는 행 `regionCode`(`isCapitalAreaByRegionCode`, 코드 없으면 폼 확인값).
- `eligibleCountExcludedHouseIds` — **엔진 평가기를 그대로 불러** 요건 충족 행 id(Q-3(b)). 행 선언 + 넘겨받아 `houseId`가 남은 계산기 선언.
- `resolveTemporaryTwoHouse`에 **필수 인자** `excludedHouseIds` — 호출부 8곳(판정 2 · 계산기 6) 전부 컴파일러가 짚어 연결했다. 계산기에서 직접 입력한 선언은 `houseId`가 없어 빈 집합 → 종전 동작.

**판정 메뉴 ④⑤⑥⑦⑧**
- ④ `judgmentHouseCountExclusionReductions`·`judgmentSpecialHouseExclusions` — 출처를 명부 행으로. 옛 세대 단위 선언은 보내지 않는다.
- ⑤ 행 편집 모달 ⑥ `HouseEntryCountExclusionSection`(판정 전용 prop `countExclusionEnabled` — 계산기 불변) · 「특례」 열 배지 · 옛 `SpecialTaxHouseCountExclusionSection` 삭제 · 세대 단위 감면주택 섹션은 판정 메뉴에서 숨김 · 머리말에 「조특법으로 소유주택으로 보지 않는 N채를 빼면 M채」.
  - `New994InputForm`·`Unsold989InputForm`에 `rowFacts` — 행 값 칸은 읽기 전용. 감면주택 한 건 칸은 `SpecialHouseExclusionItemFields`로 추출(목록 섹션과 공용).
- ⑥ 사이드바 「선언한 특례」에 감면주택.
- ⑦ 결과 「보유 주택 N (취득일 취득) — 사유」 — 엔진이 결과에 싣으므로 이력 상세에서도 같다.
- ⑧ 행 번호가 붙은 필수값 메시지 · **옛 선언 차단**(Q-2) + 해소 경로 `LegacyCountExclusionNotice`(확인 다이얼로그 후 삭제).

**전달 (Q-4)** `one-house-judgment-handoff.ts` `withRowCountExclusions` — 행 선언을 `assets[0].reductions`·`specialHouseExclusions`로 옮기고(행 id 유지) 행 필드는 비운다.

**검증**
- anchor `__tests__/calc/one-house-count-exclusion-row-link.anchor.test.ts` 17건 — ROW-1(서면-2021-부동산-6220 재현 비과세 + 짝 과세) · ROW-2(요건 미달 행은 후보에 남는다) · ROW-3(2채) · ROW-4·5(감면주택 성립·불성립 사유) · ROW-6(④ 행 값) · ROW-7(옛 선언 차단) · ROW-8(전달 변환) · **ROW-9(넘겨받은 입력이 계산기 route에서도 비과세 · 짝: 행 id를 지우면 종전 결함 그대로 과세)**.
- 뮤테이션 2건 KILLED — 후보 제외 조건 무력화(ROW-1·ROW-1u) · 2채 규칙 무력화(ROW-3).
- 기존 테스트 재작성: C2-28 anchor 8건(입력 자리만 행으로, 주장 동일) · C2-28-UI 7건(행 모달 클릭 · `radioValues`로 값 축) · R-4(상속 제외 항목의 행 번호 필드 추가).
- E2E `e2e/one-house-judgment-count-exclusion-row.spec.ts` CXR-1(행 모달 → 배지 → 본문 `houseId` → 결과 「보유 주택 2」) · CXR-1+(짝 과세).
- vitest calc·components·api·lib·tax-engine 2,318파일 24,783건 통과 · 관련 E2E 71건(handoff 2건 첫 실행 flaky → 재시도 없이 10/10).

**알려진 한계**
- 계산기에서 **직접 입력한** 선언은 여전히 행을 모른다(C2·C3·C6) — 후속 계획(§8).
- 계산기로 넘긴 뒤 계산기에서 명부 행을 지우면 선언의 `houseId`가 가리킬 행이 없다 — 후보 제외가 no-op가 될 뿐 결과는 종전 동작과 같다.

## 8. 곁가지 (범위 밖 — 기록만)

- **계산기의 같은 결함 — V-1로 확인(C2·C3·C6).** 계산기에서 직접 입력한 선언의 행 연결은 후속 계획. 우선순위 높음(C6 과소과세).
- §99의4⑦ 과세특례신청 처리 부재(V-5).
- 감면주택 효과 단위(「거주자」 vs 「1세대」)가 세대원 보유분에 미치는 범위(V-3).
- 합가 구성·장기임대 거주주택 구성이 조특법 제외가 섞이면 판정을 포기하는 문제(Q-5(b)).
- 조특법 제외와 영 §167의10①15호(중과 배제) 편입 — 해석 미확보로 현행 유지(`transfer-tax-house-exclusion-step.ts` 주석).

## 9. 완료 기준 (DoD)

- [x] P2 해석례 재현 anchor 비과세 · 짝 anchor 과세 (ROW-1·ROW-1+)
- [x] 행 없는 선언이 입력 구조상 불가 · 레거시 선언 Q-2대로 (ROW-6c·ROW-7 · UI-e)
- [x] 결과 화면이 「보유 주택 N — 사유」로 제외·미적용을 표시 (CXR-1)
- [x] 14지점 전부 — `ui-engine-sync-checker` blocking 0 · `npx tsc --noEmit` 0건. 지적 2건은 실영향 없음 확인: ① 입주권 양도는 `resolveTemporaryTwoHouse`가 후보 필터 **전에** 반환(`household-house-count.ts:281`)해 제외 집합이 쓰이지 않는다 ② ⑧ `field`(`"houses"`)를 읽는 소비처 없음(단계 매핑은 검증 함수 단위)
- [x] 계산기 anchor 회귀 0 · 중과 주택 수 불변(엔진 R-D 경로 무변경 — 양도세 엔진 테스트 불변)
- [x] 브라우저 확인(행 모달 → 판정 → 결과) — Playwright E2E CXR-1 + 모달·표 캡처
