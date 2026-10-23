# 계산기 양도 주택 「양도 당시 기준시가」 칸 누락 → 가액기준 지역 중과 누락 — 수정 계획서

- 작성: 2026-10-23 · 상태: 계획 — **결정 Q-1 a · Q-2 a · Q-3 a · Q-4 a 확정(2026-10-23, 사용자 결정 — 권고안 전부)** · 검증 깊이 **L3**(세액이 바뀐다)
- 발견 경위: 다주택 중과 판정 메뉴 계획서(`multi-house-surcharge-judgment-menu.plan.md`) V-7 — 판정 메뉴는 P6a(#2438)에서 M1 칸 + ⑧로 막았고, 계산기는 별건으로 남겼다.

## 1. 결함

양도세 계산기는 **양도 주택의 양도 당시 기준시가**를 받는 칸이 일부 경로에만 있다. 단건 매매·실가(가장 흔한 경로)에는 양도가액 칸만 있다.
칸이 없으면 ④가 양도 주택 행에 0을 싣고, 엔진은 0을 「3억 이하」로 읽는다. 그러면 「소득세법 시행령」 §167의3①1호(가액기준 지역 · 양도 당시 기준시가 3억 이하)에 따라 양도 주택이 **주택 수에서 빠지고**, 양도 주택 **자신도 중과에서 빠진다**(#2317 Step 4.5 backstop).
⑧은 이 칸을 요구하지 않는다. 모르는 사실이 납세자에게 유리하게 작동하는 셈이다(`feedback_unknown_fact_applies_unfavorably` 위반).

### 1.1 경로 (실측 인용)

| 층 | 위치 | 동작 |
|---|---|---|
| ⑤ | `components/calc/transfer/asset-sections/AssetSectionTransfer.tsx:127-170` → `CompanionSaleModeBlock`(`singleMode` → `"actual"`) | 실가 모드는 양도가액 칸만 그린다. 기준시가 칸은 `"apportioned"`(함께 양도 안분)에서만 그린다 |
| ⑤ | `CompanionAcqStdPriceSection.tsx:229-237` | 환산취득가(`useEstimatedAcquisition`)를 켰을 때만 `data-field="standardPriceAtTransfer"` |
| ⑤ | `TransferStdPriceCards.tsx:194-197` `showTransferHousingTotalInAxisA` | 토지·건물 분리(소유자 분리) 주택의 양도시 개별주택가격 — 그 술어일 때만 |
| ④ | `lib/calc/transfer-tax-api-houses.ts:142` | `officialPrice: parseAmount(primary.standardPriceAtTransfer) \|\| 0` — 칸이 화면에 없어도 store 값을 그대로 읽는다(비면 0) |
| ④ 주 본문 | `lib/calc/engine-std-price-at-transfer.ts:43-69` `primaryEngineStdPriceAtTransfer` | 실가 모드는 `undefined` — 주 본문 `standardPriceAtTransfer`는 환산·1990 전·안분 키 등에서만 싣는다 |
| 엔진 | `lib/tax-engine/multi-house-surcharge-count.ts:600-615` `resolveLowPriceLocalHouse` | `price <= threshold` — **0도 3억 이하** |
| 엔진 | `lib/tax-engine/multi-house-surcharge.ts:356-375` Step 4.5 | 양도 주택이 1호면 `surchargeType: "none"` |
| 엔진(대조) | `multi-house-surcharge-exclusion.ts:78-82` · `:614-617` · `multi-house-surcharge.ts:455-462` | **9호(1억 이하)는 0을 「판정 불가」로 보고** 배제하지 않으며 경고를 낸다 — 같은 값의 0을 두 호가 반대로 읽는다 |
| 엔진(명부 없음) | `lib/tax-engine/transfer-tax-judgment-steps.ts:264-270` `noRosterSellingHouse` | 명부 없는 합성 구성의 양도 주택 행은 **주 본문** `standardPriceAtTransfer ?? 0` — 실가 모드면 칸에 값을 넣어도 0이다 |
| ⑧ | `lib/calc/transfer-tax-validate-step1.ts:155` | 명부 행은 기준시가를 **늘** 요구한다. 양도 주택은 요구하지 않는다 |

### 1.2 실측 (2026-10-23, origin/master 9f1a8b266 · throwaway probe — 계산기 단건 `callTransferTaxAPI` 본문 → `/api/calc/transfer` route)

공통: 양도 2021-06-01 · 양도가 10억 · 취득 2015-01-01 · 취득가 5억 · 매매·실가. 명부 행은 강남(1168010100) 공시가 5억. 전주 완산구(4511110100)는 2020-12-18~2022-09-26 조정대상지역이고 가액기준이다.

| # | 양도 주택 | 명부 | 기준시가 | 본문 양도 행 `officialPrice` | 판정 | 중과 주택 수 | 총세액 | ⑧ |
|---|---|---|---|---|---|---|---|---|
| A3-0 | 전주 | 강남 2 | 비움 | 0 | 중과 없음(`low_price_local_house`) | 2 | 164,560,000 | 통과 |
| A3-4 | 전주 | 강남 2 | 4억 | 400,000,000 | **3주택 이상 중과** | 3 | **355,135,000** | 통과 |
| A3-2.5 | 전주 | 강남 2 | 2.5억 | 250,000,000 | 중과 없음(1호 정당) | 2 | 164,560,000 | 통과 |
| B2-0 | 전주 | 강남 1 | 비움 | 0 | 중과 없음 | 1 | 164,560,000 | 통과 |
| B2-4 | 전주 | 강남 1 | 4억 | 400,000,000 | **2주택 중과** | 2 | **300,410,000** | 통과 |
| C2-0 | 강남 | 강남 1 | 비움 | 0 | 2주택 중과 + 9호 판정 불가 경고 | 2 | 300,410,000 | 통과 |
| C2-0.9 | 강남 | 강남 1 | 9천만 | 90,000,000 | 중과 없음(9호) | 2 | 164,560,000 | 통과 |
| F3-4 | 전주(환산 켬) | 강남 2 | 4억 | 400,000,000 | 3주택 이상 중과 | 3 | 350,515,000 | 통과 |

- 칸을 비우면 3주택 사례는 **190,575,000원**, 2주택 사례는 **135,850,000원** 적게 나온다(A3-0↔A3-4, B2-0↔B2-4). 2026-10-22 첫 실측(다른 취득가 픽스처)은 75,207,000원이었다 — 차액은 픽스처마다 다르고 방향은 같다.
- ⑧ 메시지는 모든 행에서 픽스처 관련 2건(분양권 확인·거주 구간)뿐이다. 기준시가에 관한 차단은 없다.
- 가액기준이 아닌 지역(C2)에서는 결함이 없다. 0을 9호가 「판정 불가」로 읽어 중과하고 경고를 낸다. 다만 그 경고를 풀 칸이 실가 경로에 없다(§9 범위 밖 관찰 O-1).

### 1.3 안전망 실측 (mutation probe — 착수 전)

엔진 `resolveLowPriceLocalHouse`를 `price > 0 && price <= threshold`로 바꾸고 `__tests__/tax-engine/` · `__tests__/calc/` · `__tests__/api/`를 돌렸다. 2,350개 파일 30,428건 중 **1건만 실패**했다.
그 1건은 `__tests__/calc/multi-house-surcharge-validate.anchor.test.ts` VC-0이다. 이 테스트는 결함 동작 자체를 「M1이 필수인 이유」로 고정해 둔 것이다.
⇒ 0을 3억 이하로 읽는 동작을 지키는 다른 계약은 없다. 엔진 변경의 회귀 표면은 VC-0 하나다. 반대로 고친 뒤의 동작을 지킬 테스트도 0건이므로 **신규 anchor가 필수**다(§7).

## 2. 법령

- 「소득세법 시행령」 §167의3①1호 — 수도권·광역시·특별자치시(광역시 군, 경기·세종 읍·면 제외) 밖 지역의 주택으로서 「해당 주택 및 이에 부수되는 토지의 기준시가의 합계액이 **양도 당시** 3억원을 초과하지 아니하는 주택」은 주택 수에 넣지 않는다. 같은 호를 2주택 §167의10①1호, 주택+권리 §167의11①3호·§167의4③1호가 인용한다(#2317에서 근거 4갈래 확인).
- §167의10①9호 — 「주택의 양도 당시 기준시가가 1억원 이하인 주택」(정비구역 등 제외).
- 두 호 모두 기준이 **양도 당시** 기준시가다. 칸의 뜻은 주택 기준시가(개별·공동주택가격, 부수토지 포함)로 같다. 원문 대조는 판정 메뉴 계획서 V-9(P3c)에서 했다. 이 계획서는 새 조문을 인용하지 않는다.

## 3. 범위와 목표

| 목표 | 검증 |
|---|---|
| G1 가액기준 지역 양도 주택이 중과 판정을 받는 계산에서 양도 당시 기준시가를 반드시 받는다 | ⑧ anchor — 비움 차단 · 값 입력 통과 |
| G2 그 값이 엔진의 양도 주택 행에 도착한다(명부 있음 · 명부 없는 합성 구성 모두) | route anchor — A3·B2 세액 표 재현 |
| G3 값이 없어도 엔진이 3억 이하로 읽지 않는다(9호와 같이 「판정 불가」 + 확인 필요) | 엔진 anchor + mutation |
| G4 기준시가 칸이 같은 화면에 둘이 되지 않는다 | 노출 격자 UI 테스트 |

## 4. 결정 게이트 (Q-n — 2026-10-23 확정: 네 항목 모두 권고안)

| Q | 질문 | 선택지 | 권고 |
|---|---|---|---|
| Q-1 | 엔진도 고치는가 | (a) 화면·⑧ + **엔진 backstop**: 0 = 미입력 → 1호 불성립(불리) + 경고 — 9호와 같은 규약 / (b) 화면·⑧만 | **(a)** — 저장된 옛 이력·다건·향후 경로가 칸을 놓쳐도 유리하게 새지 않는다. 회귀 표면은 VC-0 하나(§1.3) |
| Q-2 | 칸을 어디에 두는가 | (a) **Step1 자산 카드 양도 정보**(양도가액 바로 아래) — 주소·양도일이 같은 단계라 필수 여부를 그 자리에서 정한다. 다른 칸이 이미 같은 값을 받는 모드에서는 그리지 않는다 / (b) Step4 「④ 주택수·중과 판정」 — 다만 한시 유예 창 안에서는 이 섹션이 숨는다(`Step4.tsx:731`)는 문제가 있다 | **(a)** |
| Q-3 | 언제 보이고 언제 필수인가 | (a) **보임** = 주택 양도 ∧ 양도일 2018-04-01 이후 ∧ 양도일 현재 조정대상지역. **필수** = 그중 가액기준(법정동코드 분류). 지역기준이면 선택 입력이고 9호(1억) 판정에 쓴다 / (b) 판정 메뉴 M1과 같게: 보임 = 주택 양도, 필수 = 가액기준(조정지역 무관) / (c) 가액기준 ∧ 조정지역일 때만 보임·필수 | **(a)** — 양도 주택이 조정대상지역이 아니면 중과가 없어 이 값이 결론을 가르지 않는다. 그래서 필수를 그 경우로 좁혀 1주택 지방 계산의 입력 부담을 없앤다. 지역기준 2주택은 9호 경고(O-1)를 풀 칸이 생긴다 |
| Q-4 | 명부 없는 합성 구성(§155⑳ 거주주택 의제 · §155①⑦ 의제 · 임대 불성립 복원)에 값을 어떻게 보내는가 | (a) **새 본문 키** `sellingHouseStdPriceAtTransfer`(①~⑭ — 주 본문 `standardPriceAtTransfer`는 실가 모드에서 감면 폴백·장특·환산 등 15곳이 넘는 소비처가 읽으므로 넓히지 않는다) / (b) 보내지 않는다 — Q-1 (a)이면 합성 구성은 늘 「미입력」(불리 + 경고) | **(a) 확정** — (b)는 칸에 값을 넣어도 엔진이 무시한다(화면엔 있는데 안 보내짐). V-1은 PR-2 착수 전 실측(도달하지 않으면 키를 만들지 않고 범위 밖으로 기록) |

> Q-4 (a)에서 주 본문 키를 넓히지 않는 근거: `lib/tax-engine/` 안에서 `input.standardPriceAtTransfer`를 읽는 곳은 감면 기준시가 폴백(`transfer-tax-reductions-calc.ts:514`), 장특(`transfer-tax-lthd.ts:617`), 마무리(`transfer-tax-finalize.ts:238`), 동일 조정기간(`transfer-tax-same-period-step.ts:66`), 건물 가산세(`transfer-tax-building-penalty.ts:95`) 등 15곳이 넘는다(grep 2026-10-23). 실가 모드에서 이 값을 싣기 시작하면 중과와 무관한 축이 함께 움직인다.

## 5. 설계 (확정안 Q-1 a · Q-2 a · Q-3 a · Q-4 a)

### 5.1 술어 leaf — `lib/calc/selling-std-price-scope.ts`(신규)

> **PR-1 구현 정정(2026-10-23)** — V-2~V-4 실측으로 아래가 바뀌었다(방향은 유지).
> - **범위 밖 둘 추가**: 겸용(V-3 · O-4)과 부담부증여 시가 모드(O-5). 칸·⑧ 모두 같은 술어(`isHouseSale`)라 막다른 길이 없다.
> - **④ 값 leaf `sellingHouseStdPriceAtTransfer`**: §164⑦ 3시점이면 그 카드의 `phdTransferHousingPrice`(일반 칸에 남은 값은 쓰지 않는다), 그 밖은 `standardPriceAtTransfer` → 비었으면 상속·증여 주택 3시점 카드의 `inhHouseValHousePriceAtTransfer`. 종전 ④는 PHD 경로에서도 일반 칸(숨은 칸)을 읽어 0이었다 — PHD 가액기준 양도 주택도 같은 결함이었다.
> - **⑧ 앵커**: PHD면 `phdTransferHousingPrice`, 그 밖은 `standardPriceAtTransfer`.
> - **`sellingStdPriceInScope`는 주소 판정만 쓴다**(폼-전역 조정지역 토글은 보지 않는다) — 필수 판정이 가액기준(법정동코드)이라 주소 없이는 성립하지 않는다.
> - 양도가액 블록의 안분 칸 판정은 블록이 가진 값으로 정한다 — `CompanionSaleModeBlock`에서 `saleModeBlockShowsStdPrice`를 추출했다(동작 불변).

```ts
/** 양도 주택이 가액기준인가 — ④가 싣는 `regionCode`(primary.regionCode)로 엔진과 같은 분류 */
sellingHouseIsValueCriteriaCalc(primary: AssetForm): boolean
/** ⑤ 칸 노출 — 주택 양도 ∧ 양도일 ≥ 2018-04-01 ∧ 양도일 현재 조정대상지역(`calcEffectiveIsRegulatedAtTransfer`) */
sellingStdPriceInScope(form): boolean
/** ⑧ 필수 — 노출 ∧ 가액기준 */
sellingStdPriceRequired(form): boolean
/** 같은 화면의 다른 칸이 이미 `standardPriceAtTransfer`를 받는가(환산 · 분리 주택 축 A · 함께 양도 안분 · 부담부증여 · 의제 전 상속 환산 등) — V-2 전수 */
sellingStdPriceShownElsewhere(asset, form): boolean
```

- 판정 메뉴 leaf(`lib/calc/surcharge-price-criteria.ts`)의 `sellingHouseIsValueCriteria`는 `OneHouseJudgmentFormData`의 `assets`만 본다. 계산기 쪽에서는 시그니처를 `Pick<…, "assets">`로 받아 **같은 함수를 재사용**한다(복제 금지).
- 「주택 양도」는 `assetKind ∈ {housing, redevelopment_apt}`다. 입주권·분양권 양도는 §104⑦ 밖이다. 겸용·완공 재개발은 V-3·V-4에서 정한다.

### 5.2 ⑤ 화면

- `AssetSectionTransfer`의 `CompanionSaleModeBlock` 바로 아래에 둔다. 조건은 `sellingStdPriceInScope && !sellingStdPriceShownElsewhere`다. 판정 메뉴 Step3 M1과 같은 `HousingStdPriceLookupField`(주소·동·호·양도일 기준 자동조회)를 쓴다.
  - `data-field="standardPriceAtTransfer"`
  - 라벨: 「양도 당시 기준시가(주택 공시가격)」. 필수일 때 `*`를 붙인다.
  - 안내(hint): 가액기준이면 「수도권·광역시·특별자치시 밖 주택은 양도 당시 기준시가 3억원 이하이면 주택 수에서 빠지고 중과하지 않습니다(소득세법 시행령 §167의3①1호) — 비워 두면 그 판정을 할 수 없습니다」. 지역기준이면 「2주택이면 1억원 이하 중과 배제(§167의10①9호) 판정에 씁니다」.
- 다른 칸이 이미 그리는 모드에서는 그 칸이 정본이다. ⑧ 필수 메시지는 그 칸의 `data-field`로 안내한다(같은 필드라 앵커가 같다).
- 사이드바(⑥)는 바꾸지 않는다. 금액 합계가 아니다.

### 5.3 ⑧ 검증

- 자산 카드 검증(`lib/calc/transfer-tax-validate-asset.ts` — 양도가액·안분 키 기준시가 필수 검사가 있는 곳, `:317-329`)에 추가한다. 조건은 `sellingStdPriceRequired && parseAmount(primary.standardPriceAtTransfer) <= 0`이고, 그때 `fieldError("standardPriceAtTransfer", …)`를 낸다. 같은 파일 `:328`이 안분 모드에서 같은 필드를 이미 요구하므로, 메시지가 두 번 나지 않게 그 갈래 뒤에 둔다.
- 다건은 `multi-transfer-tax-validate.ts:206`이 건별로 `validateStep`을 부르므로 자동으로 따라간다.
- 판정 메뉴 ⑧(`multi-house-surcharge-validate.ts:35`)은 그대로 둔다. 판정 메뉴는 조정지역과 관계없이 필수다(D 결정 그대로). 두 메뉴의 필수 범위가 다른 이유를 leaf 주석에 적는다.

### 5.4 ④ 전송

- **명부 있음**: 바꾸지 않는다. `transfer-tax-api-houses.ts:142`는 이미 store 값을 싣는다.
- **명부 없는 합성 구성(Q-4 a)**: 주 본문에 `sellingHouseStdPriceAtTransfer`(양수일 때만)를 새로 싣는다. 동기화 지점은 다음과 같다.
  - ⑫ `app/api/calc/transfer/` 메인 Zod 스키마와 다건 property 스키마
  - ⑬ `callTransferTaxAPI` 본문과 `buildPropertyPayload`
  - ⑭ route 엔진 입력 매핑
  - 엔진 `TransferTaxInput.sellingHouseStdPriceAtTransfer?: number`
  - `noRosterSellingHouse`: `officialPrice: workingInput.sellingHouseStdPriceAtTransfer ?? workingInput.standardPriceAtTransfer ?? 0`
- ①②③ 폼 필드는 새로 만들지 않는다. `AssetForm.standardPriceAtTransfer`를 그대로 쓴다.

### 5.5 엔진 backstop (Q-1 a)

- `resolveLowPriceLocalHouse`를 `price > 0 && price <= threshold`로 바꾼다. 주택 수 산정(`countEffectiveHouses`)과 Step 4.5 양도 주택 자기 배제가 같은 술어를 쓰므로 함께 바뀐다.
- 경고는 9호 선례(`multi-house-surcharge.ts:455-462`)와 같은 자리, 같은 형식으로 낸다. 술어는 `isLowPriceLocalHouseUndecidable(house)`(가액기준 ∧ 0)다.
  - 양도 주택: 「양도 주택의 양도 당시 기준시가가 입력되지 않아 지방 저가주택(3억원 이하, 소득세법 시행령 §167의3①1호) 해당 여부를 판정하지 못했습니다 — 주택 수에 넣고 중과를 판정했습니다」
  - 명부 행: `countEffectiveHouses` `warnings`에 행 단위로 낸다. 계산기 ⑧과 판정 메뉴 ⑧이 막으므로 도달하는 것은 옛 이력뿐이다.
- 설명문(P3c `multi-house-surcharge-narrative-steps.ts:125`)은 같은 술어를 쓰므로 자동으로 「산입」이 된다. 경고는 `headline.warnings`를 거쳐 `checks`로 간다(F-7 경로 그대로). 판정 메뉴는 M1이 0을 막으므로 화면 변화가 없다.
- 결과 화면은 `MultiHouseSurchargeDetailCard.tsx:185`가 `detail.warnings`를 이미 그린다(9호 경고와 같은 자리). ⑦은 새 컴포넌트가 필요 없다.

## 6. 케이스 매트릭스

| # | 양도 주택 | 양도일 조정 | 양도일 | 명부 | 기준시가 | ⑤ 칸 | ⑧ | 엔진 결과(수정 후) |
|---|---|---|---|---|---|---|---|---|
| M-1 | 가액기준 | 조정 | 2021 | 2채 | 비움 | 보임·필수 | **차단** | (도달 안 함) |
| M-2 | 가액기준 | 조정 | 2021 | 2채 | 4억 | 보임 | 통과 | 3주택 이상 중과 355,135,000 |
| M-3 | 가액기준 | 조정 | 2021 | 2채 | 2.5억 | 보임 | 통과 | 1호 — 중과 없음 164,560,000 |
| M-4 | 가액기준 | 조정 | 2021 | 1채 | 4억 | 보임 | 통과 | 2주택 중과 300,410,000 |
| M-5 | 가액기준 | **비조정** | — | 2채 | 비움 | 숨김 | 통과 | 중과 없음(비조정) — 세액 불변 |
| M-6 | 지역기준 | 조정 | 2021 | 1채 | 비움 | 보임(선택) | 통과 | 2주택 중과 + 9호 판정 불가 경고(현행 그대로) |
| M-7 | 지역기준 | 조정 | 2021 | 1채 | 9천만 | 보임 | 통과 | 9호 — 중과 없음 |
| M-8 | 가액기준 | 조정 | **2018-03-31** | 2채 | 비움 | 숨김 | 통과 | §104⑦ 시행 전 — 세액 불변 |
| M-9 | 가액기준 | 조정 | 2021 | 2채 | 비움(옛 이력 · ⑧ 우회) | — | — | **backstop**: 3주택 이상 중과 + 1호 판정 불가 경고 |
| M-10 | 가액기준 | 조정 | 2021 | 없음(§155⑳ 합성) | 4억 | 보임 | 통과 | 합성 양도 행 400,000,000 도착(Q-4 a) |
| M-11 | 가액기준 | 조정 | 2021 | 2채 | 환산 켬 4억 | 환산 칸만(중복 없음) | 통과 | F3-4와 같음 |
| M-12 | 입주권 양도 | — | — | — | — | 숨김 | 통과 | 범위 밖 |
| M-13 | 다건 1번 건 = M-1 | | | | | 보임·필수 | 차단 | — |

## 7. 테스트 계획

| ID | 무엇 | 파일(예정) |
|---|---|---|
| SP-1 | 술어 leaf 격자: 주택·권리 × 가액·지역 × 조정·비조정 × 2018.4.1. 전후 | `__tests__/calc/selling-std-price-scope.test.ts` |
| SP-2 | ⑧ M-1 차단(메시지·`data-field`) / M-2·M-5·M-6·M-8 통과 · 다건 M-13 | 위 파일 |
| SP-3 | route 재현 — M-2·M-3·M-4 세액(§1.2 표 값 고정) | `__tests__/calc/selling-std-price-value-region.anchor.test.ts` |
| SP-4 | 노출 격자 — 모드(실가·환산·분리 축 A·함께 양도 안분·부담부증여·의제 전 상속 환산) × 노출 조건. **화면의 `[data-field="standardPriceAtTransfer"]`가 정확히 0 또는 1개** | `__tests__/calc/selling-std-price-field.ui.test.tsx` |
| SP-5 | 엔진 backstop — M-9 양도 주택 0 · 명부 행 0 → 산입 + 경고 / 2.5억 → 불산입(회귀) | `__tests__/tax-engine/multi-house-surcharge-low-price-undecidable.test.ts` |
| SP-6 | Q-4 a — M-10 합성 구성에 값 도착(⑫⑬⑭ strip 없음 · 단건·다건 route) | SP-3 파일 |
| VC-0 | 판정 메뉴 anchor 개정 — 「비우면 3억 이하」 → 「비우면 산입 + 판정 불가 경고 · M1 값이 있어야 1호를 판정」(`feedback_shared_assertion_reversal_erases_sibling_net` — 단언을 지우지 않고 바꾼다) | 기존 파일 |

**구현 후 mutation (P-n)**

| P | 무력화 | 실패해야 할 테스트 |
|---|---|---|
| P-1 | ⑧ 필수 조건 제거 | SP-2 |
| P-2 | 노출 술어에서 조정지역 조건 제거 | SP-1 · SP-4 |
| P-3 | `ShownElsewhere` 한 갈래 제거 | SP-4(중복 2개) |
| P-4 | backstop `price > 0` 제거 | SP-5 · VC-0 |
| P-5 | 1호 판정 불가 경고 제거 | SP-5 |
| P-6 | ⑬ 새 키 spread 제거 / ⑭ 매핑 제거 | SP-6 |

**브라우저(Playwright)**: 전주 완산구 주소 + 강남 2채 + 2021-06-01로 확인한다.
- 칸이 보이고 비우면 ⑧ 배너가 뜨는지
- 4억을 넣으면 결과에 3주택 이상 중과가 나오는지
- 환산을 켜면 칸이 하나로 줄어드는지
- 375px 화면과 다크 모드

## 8. PR 분할

| PR | 내용 | 세액 |
|---|---|---|
| PR-1 ✅ | 5.1 leaf · 5.2 ⑤ · 5.3 ⑧ · ④ 값 leaf(PHD·상속 3시점) · SP-1~4 · V-5 · 브라우저 — 테스트 45건(SP-1~3 · SP-4 22 · V-5) · 전체 39,849 통과 · mutation 14/14(각 변형이 겨냥한 테스트에서만 실패) · 브라우저(Playwright): 전주 완산구 + 강남 2채 → 칸 노출 · 비움 ⑧ 배너 · 4억 → 본문 양도 행 400,000,000 · 3주택 이상 중과 355,135,000 · 다크 375 가로 스크롤 0 | 칸을 비운 사용자는 막히고, 값을 넣은 사용자는 정확해진다(M-2·M-4 증가 방향) |
| PR-2 ✅ | 5.4 새 본문 키(Q-4 a — ⑫ 공용 shape · ⑬ 단건·다건 · ⑭ 단건 `engine-input.ts`·다건 route · 엔진 `noRosterSellingHouse`) · 5.5 엔진 backstop(`resolveLowPriceLocalHouse` `price > 0` · `isLowPriceLocalHouseUndecidable` · 양도 주택/다른 행 경고 · 설명문 ② 미입력 문장) · SP-5(6) · SP-6(3) · VC-0 개정(단언을 지우지 않고 새 계약으로) | 옛 이력·합성 구성의 0이 불리 + 경고로 바뀐다 · 합성 구성에 넣은 값이 처음으로 엔진에 도착한다 |

PR-1만으로 실제로 도달하는 결함(명부 있는 단건·다건)이 닫힌다. PR-2는 V-1 실측 후 착수한다.

## 9. 미검증 레지스터 (V-n)

| ID | 항목 | 검증 방법 | 설계 영향 | 상태 |
|---|---|---|---|---|
| V-1 | 명부 없는 합성 구성(§155⑳ 거주주택 의제 · §155①⑦ 의제 · 임대 불성립 복원)에서 가액기준 양도 주택 0 → 1호 불산입이 실제 세액을 가르는지 | route probe(합성 구성 3종 × 0/4억) | Q-4가 (a)인지 (b)인지 | ✅ **해소(2026-10-23, PR-2)** — **임대 불성립 복원 경로가 세액을 가른다**: 전주 완산구 양도 · 명부 없음 1채 · §155⑳ 거주 0 → 불성립 · 임대 카드 1호(임대개시 기준시가 9억 — 2호 아님) → 0이면 1호 자기 배제 667,342,500 / 4억이면 2주택 중과 1,141,772,500(−474,430,000). 그런데 실가 모드 ④가 주 본문 `standardPriceAtTransfer`를 싣지 않아 **칸에 4억을 넣어도 0으로 계산됐다** ⇒ Q-4 (a) 확정. §155①⑦ 의제 경로는 결론을 가르지 않는다 — 의제가 서지 않으면 구성 행이 없고(원시 플래그), 서면 15호가 먼저 배제한다. §155⑳ 거주주택 의제(성립) 경로는 임대 호가 2호라 10호가 먼저 배제한다(probe 2건) |
| V-2 | Step1 같은 화면에서 같은 사실(양도 당시 주택 공시가격)을 받는 칸 전수 | 실제 자산 카드를 19개 모드로 렌더해 `data-field` 개수 실측 | `ShownElsewhere` 갈래 수 | ✅ **해소(2026-10-23, PR-1)** — 수정 전 칸이 있던 모드는 다섯이다: 환산 분모(`CompanionAcqStdPriceSection`) · 소유자 분리 축 A 개별주택가격(`TransferStdPriceCards`) · 의제취득일 전 상속 환산 분모(`PreDeemedConversionFields`) · 부담부증여(기준시가) 안분 칸 · 함께 양도 기준시가 안분 칸(`CompanionSaleModeBlock`). **§164⑦ 3시점(PHD)은 같은 사실을 다른 필드(`phdTransferHousingPrice`)로 받는다** — grep 6곳 목록에 없던 갈래다. 상속·증여 주택 3시점 평가 카드(`HouseValuationSection` `inhHouseValHousePriceAtTransfer`)도 같은 사실이지만 선택 입력 카드라 새 칸을 함께 둔다(④·⑧은 둘 중 값이 있는 쪽을 쓴다). 실측 뒤 범위 안 15개 모드 모두 칸이 정확히 하나다(SP-4) |
| V-3 | 겸용주택(`assetKind: housing` + 겸용) — 기준시가가 4부분 패널(`mixedTransfer*`)에 있고 ④ 양도 행은 `standardPriceAtTransfer`를 읽는다. 겸용 양도 주택의 1호 판정 값 출처 | Read(`mixed-use-asset-input.ts:159-181` — 겸용 엔진도 같은 본문 `houses`를 쓴다) | 겸용을 범위에 넣을지, 별건으로 둘지 | 🟡 **범위 밖으로 확정(2026-10-23)** — 겸용 양도 주택의 1호 「해당 주택 … 기준시가」가 주택분(`mixedTransferHousingPrice`)인지 상가분을 포함하는지 법령 근거를 확인하지 않았다(`feedback_unverified_authority_blocks_tax_change`). 겸용은 칸·⑧ 없이 ④ 종전 값(대개 0)을 싣는다 — 같은 과소 방향의 결함이 남는다. 별건 O-4 |
| V-4 | 완공 재개발 아파트(`redevelopment_apt`) — 숨은 기준시가(`redevHiddenGeneralStdPrice`)와 이 칸의 관계 | Read | 노출 조건에 포함할지 | ✅ **해소(2026-10-23)** — 범위에 넣는다. 재개발 자산의 일반 양도시 칸은 숨은 칸이라 ④ 주 본문이 싣지 않고 ⑧ 감면 폴백도 인정하지 않는다(`redev-acquisition-price-source.ts:87-97`). 새 칸 값은 ④ 양도 주택 행에만 간다 — 주 본문·감면 축은 움직이지 않는다 |
| V-5 | 판정 메뉴 → 계산기 넘기기에서 M1 값이 그대로 도착하는지(`toTransferFormPatch` assets 경유) | handoff anchor 1건 | 없음(확인용) | ✅ 도착한다(`selling-std-price-scope.test.ts` V-5) |

## 10. 범위 밖 관찰

- **O-1** 지역기준 2주택의 9호(1억) 판정 불가 경고는 지금 풀 칸이 실가 경로에 없다(C2-0). Q-3 (a)이면 이 계획서의 선택 칸으로 함께 풀린다. (b)·(c)이면 남는다.
- **O-2** 명부 없이 세대 주택 수만 있는 옛 경로(`legacyHouseCountPrecedence`)는 양도 주택 행이 없어 1호 자기 배제를 아예 보지 않는다(probe에서 명부 없음 3주택은 기준시가와 관계없이 중과 355,135,000). 지금은 ⑧(「다른 보유 주택이 없는지 확인하세요」, `transfer-tax-validate-step1.ts:62-75`)이 새 입력을 명부로 보내므로 옛 이력에서만 남는다. 방향은 과다다. 별건 후보.
- **O-3** 조정대상지역 판정에 주소가 없을 때의 토글 fallback(probe D3)은 이 결함과 관계없다.
- **O-4** 겸용주택 양도 주택(V-3) — 칸·⑧ 없이 ④가 `standardPriceAtTransfer`(겸용 화면엔 없는 칸)를 싣는다. 1호 「기준시가」의 범위를 법령으로 확인한 뒤 별건으로 다룬다. PR-2 backstop(0 = 미입력 → 산입 + 경고)이 들어가면 과소 방향은 막히지만 경고를 풀 칸이 없다.
- **O-5** 부담부증여 시가 모드 — 그 모드에서도 ④가 `standardPriceAtTransfer`를 §159 본문의 건물 기준시가(`transfer-tax-api-burdened-gift.ts:481-487`)로 싣고, 엔진이 그 값을 양도가액 안분 분모(`burdened-gift-apportionment.ts:120-130`)에 쓴다. 중과용 칸을 열면 그 축이 함께 움직일 수 있어 범위에서 뺐다(칸·⑧ 모두 없음 — 막다른 길 없음). 과소 방향 결함은 남는다.
