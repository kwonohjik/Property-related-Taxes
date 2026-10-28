# 이월과세 — 당초 증여 때 인수한 채무 부분(매입분) PR-2 · E2(일반건물 파트)·E3(주택 분리 파트) 엔진 설계서

> 작성 2026-10-28 · 계획서 [`docs/00-pm/carryover-gift-debt-purchased-part.plan.md`](../../00-pm/carryover-gift-debt-purchased-part.plan.md) §4.4 「E2·E3: 입력은 그대로, 파트 r = 파트 채무 ÷ 파트 평가액」(Q-1 a · Q-2 a · Q-3 b · Q-4 a 확정)의 PR-2 엔진 설계.
> 선행 [`carryover-gift-debt-purchased-part.engine.design.md`](carryover-gift-debt-purchased-part.engine.design.md)(PR-1, 머지됨) §3.4 「r을 어느 파트에 적용할지 정의 없음(E3 = PR-2)」 · §5.2 · §9 V-9. E3 선행 [`transfer-split-part-carryover.engine.design.md`](transfer-split-part-carryover.engine.design.md).
> 짝 문서 `carryover-gift-debt-purchased-part-parts.ui.design.md`(UI 시니어 별도 작성).
> **코드는 한 줄도 고치지 않았다**(설계서 + throwaway probe — 파일은 삭제했고 요약은 §4·부록). 모든 file:line은 2026-10-28 이 worktree(master `7b99968a0`) 실측이다.
> **검증 표기**: 「손계산 ✓」 = 손으로 따로 계산해 엔진 값과 일치 확인 · 「probe」 = 엔진 실측만 · 「코드읽기」 = 실행 없이 코드로만 확인 · 「확인 필요」 = 미검증.
> 세액은 전부 `makeMockRates()` 기준이다. 실DB 세율에서는 달라질 수 있다.

## 0. 결론 요약

| 숙제 | 결론 | 근거 |
|---|---|---|
| **E2 범위** | **전부 지원**(토지 파트 + 건물 파트 · 환산/실가 · 증여자 환산 · 증축 · 사업용/비사업용 분할 · 지분 · 함께 양도 컴패니언). 막는 것은 감면·감가상각(해당 카드)·증여자 신축·용도변경뿐이다 | §2 매트릭스 22행 |
| E2 진입 | 일반건물 카드는 이미 `calculateTransferTaxAggregate`로 가므로(`general-building-route-helper.ts:302` · `general-building-route-actual.ts:638` · 지분 `general-building-fractional.ts:365` · 컴패니언 `bundled-route.ts:378`) **PR-1 파생 단위가 자동으로 돈다**. 카드에 채무 키만 실으면 된다 — 실측으로 확인(§4 P1) | probe |
| 필요한 엔진 변경 | **R1** `composeGbCarryover.fromPart`가 파트 `giftAssumedDebt`를 ct에 싣는다(1곳) · **R2** `splitLandCarryover`가 채무도 면적 비율로 자른다(1곳 — 4개 호출부 공유) · **R3** 범위 술어가 일반건물 카드(`general_building_unit`)를 받는다(1줄) · **R4** 꼬리 카드 id를 지분 접미사 앞에 둔다(`land__purchased#0`) · **R5** ⑧·⑫ 차단 거울 | §3 |
| 사업용/비사업용 분할 | **면적 비율**(기존 평가액·취득가액·증여세와 같은 술어·같은 인자 `apportionLandByBusinessArea`)로 채무를 자르고 비사업용 카드가 잔액을 흡수한다. 안 자르면 **채무가 두 카드에 전액** 들어가 오답(실측 20,051,350 ↔ 올바른 26,763,852). 계획서 범위 안이다 — 사용자 입력 채무를 같은 자산의 두 카드로 나누는 것이지 빈 칸을 채우는 안분 fallback이 아니다 | §3.2 · probe P4 |
| 결과 echo | 일반건물 응답은 이미 `mode:"bundled"`라 **mode 이동 비용이 없다**. `purchasedPartSplit`은 **채무가 있는 부모 카드마다**(증여분 카드 detail) 붙는다 — 사업용·비사업용 분할이면 카드 2장 각각 | §3.4 |
| **E3** | **PR-2에서 조각을 만들지 않는다(대안 c1 — 현행 유지 + 결과 고지)**. 토글·채무 입력·분자 순액은 그대로 두고, 「채무 부분을 따로 나누어 계산하지 않았다」를 결과 echo로 알린다. 근거: ① `calcSplitGain`이 고정 2파트이고 파트 소비처가 11파일·83곳이다 ② 증여분·매입분은 취득일이 달라 한 파트 안에 날짜 둘이 생기는데 이를 받는 장치가 없다 ③ 집계로 보내면(b) 주택 일체 판정이 깨진다 | §5 |
| 기존 anchor | E2 토글 ON anchor는 **반전**한다: `transfer.route.carryover-gift-tax-numerator-net.anchor` 경로 2 `157,460,000` → **`141,690,000`**(손계산 ✓). 경로 1(BG 외부 단위)·경로 3(E3)은 불변 | §6 |
| 사용자 결정 | Q-1 ~ Q-6(§8) | |

## 1. 확정 규칙과 법령 확인

### 1.1 계획서 확정 규칙의 E2·E3 적용
- 파트 r = 파트 채무 ÷ 파트 평가액(`giftDateAssetValue`). 증여분(1 − r)은 증여자 기준(취득가액 × (1 − r) · 증여자 취득일 · 증여세 상당액 전액 · 증여자 자본적지출 전액), 매입분(r)은 취득가액 = 채무 · 취득일 = 증여 등기접수일. 양도가액·본인 필요경비는 r로 나눈다(Q-2 a). B는 불변. 이 규칙의 leaf는 PR-1 `splitCarryoverDebtPieces`(`lib/tax-engine/carryover-debt-pieces.ts:68-120`)이고 **바꾸지 않는다**.
- **증여세 상당액은 이중으로 줄지 않는다**: E2 합성기가 이미 분자를 평가액 − 채무로 만든다(`general-building-entry.ts:73` `giftTaxedValue` → `:81-87` `apportionGiftTax`). 이 값은 「증여세가 과세된 증여세 과세가액」 몫이므로 **증여분 카드가 전액 받는 PR-1 규칙(`carryover-debt-pieces.ts:104-119`)과 일치**한다. 매입분은 증여받은 자산이 아니라 상당액이 없다.

### 1.2 법령 (KoreanLaw MCP 현행 본문 · 2026-10-28 조회)
- 「소득세법」 제97조의2 제1항: 「배우자 … 또는 직계존비속으로부터 증여받은 제94조제1항제1호 및 제3호에 따른 자산 …의 양도차익을 계산할 때 … 취득가액은 거주자의 배우자 또는 직계존비속이 해당 자산을 취득할 당시의 제97조제1항제1호에 따른 금액으로 한다」(제1호) · 제3호 증여세 상당액. 매입분은 증여받은 자산이 아니므로 적용 대상이 아니다. 제2항 제3호(적용 결정세액이 미적용보다 적으면 제1항 미적용)는 PR-1 신고 단위 드라이버가 그대로 판정한다.
- 「소득세법」 제95조 제4항 단서: 「제97조의2제1항의 경우에는 증여한 배우자 또는 직계존비속이 해당 자산을 취득한 날부터 기산(起算)」 — 증여분 장기보유특별공제 기산. 매입분은 본문 「그 자산의 취득일부터 양도일까지」(증여일).
- 「소득세법」 제104조 제2항 제2호: 「제97조의2제1항에 해당하는 자산은 증여자가 그 자산을 취득한 날」 — 증여분 세율 기산. 매입분은 해당 자산이 아니라 본문(취득일 = 증여일).
- 「소득세법 시행령」 제162조 제1항 제5호: 「상속 또는 증여에 의하여 취득한 자산에 대하여는 그 상속이 개시된 날 또는 증여를 받은 날」.
- 「소득세법」 제104조 제5항: 「한 필지의 토지가 제104조의3에 따른 비사업용 토지와 그 외의 토지로 구분되는 경우에는 각각을 별개의 자산으로 보아」 — 사업용·비사업용 카드가 따로 도는 구조의 법문 근거(§3.2).
- 「소득세법」 제88조 제1호 후단(채무액 부분은 양도) · 영 제159조는 PR-1 계획서 §1에서 같은 날 확인한 본문이다. 이번 설계에 **새로 인용한 조문은 없다** — 법령 상수·`additions-transfer.ts` 추가 불필요(PR-1이 `TRANSFER.CARRYOVER_DEBT_PURCHASED_PART`를 이미 등록).

## 2. E2 케이스 매트릭스 (하위 경로 전수)

판정: **O** = 조각 규칙 그대로 적용 가능(R1 포함) · **△** = 추가 설계 필요 · **X** = 막아야 함 · **—** = 해당 없음/범위 밖.
probe 열의 번호는 §4. 카드 id는 `land`·`land_business`·`land_nbl`·`building`(2-way)/`building1`·`building2`(증축)(`general-building-valuation.ts`·`general-building-extension.ts`).

| # | 하위 경로 | 근거 (file:line) | 판정 | 비고 |
|---|---|---|---|---|
| 1 | 2-way 환산 · 토지 파트 · 증여자 실가 | 카드: `general-building-valuation.ts:553-565`(전체 사업용 1장) · ct 싣기 `general-building-route-cards.ts:271-274` · 집계 `general-building-route-helper.ts:302` | **O** | P1: 35,488,448 → 25,428,373 손계산 ✓ |
| 2 | 2-way 환산 · 증여자 **환산취득가액**(`useEstimatedAcquisition`) | 분자·분모 주입 `general-building-carryover-basis.ts:15-29` → 카드 `route-cards.ts:292-298` · 조각 규칙이 기준시가 2칸을 `cut`(`carryover-debt-pieces.ts:109-112`) | **O** | P2: 40,928,847 → 28,509,351 손계산 ✓. 환산은 양도가·기준시가가 같이 줄어 비율 보존, 개산공제 base만 (1−r) 몫 |
| 3 | 실가 경로(`actualPriceMode`) · 토지 | `general-building-route-actual.ts:414-438`(ct 싣기) · 집계 `:638` | **O** | P3. 카드 `expenses` = 본인 직접 필요경비라 Q-2 a가 그대로 맞다(환산 경로와 다름 — §3.5) |
| 4 | 증축 3-way · 토지 ct / 원건물(`building1`) ct | `general-building-extension.ts:496-561`(토지) · `:614`(건물1) · `building2`는 ct 없음(`:656` · `gb-carryover-card-wiring GX-3`) | **O** | P3: 토지 증여분+매입분 정상. building2 제외 |
| 5 | **토지 사업용·비사업용 분할**(배율 초과) | `general-building-valuation.ts:489`(환산) · `general-building-extension.ts:496`(증축) · `general-building-route-actual.ts:414`(실가) — 모두 `carryover-land-split.ts:42-72` 한 함수 | **△** | 채무를 안 자르면 두 카드에 전액(P4). **R2** |
| 6 | **건물 파트** 이월과세 (`general_building_unit`) | 범위 술어 `carryover-debt-pieces-scope.ts:26,33`이 `housing·land·building`만 허용 → 지금은 throw(P5) | **△** | 술어에 `general_building_unit` 추가(R3) 후 probe(scope 우회 mock)에서 조각 정상(P5). 건물 카드의 §114조의2 신호(`isSelfBuilt` 거짓 · `penaltyAxis`는 환산 신축·증여자 신축에서만)는 이월과세 건물에서 꺼져 있다 — 코드읽기 `route-cards.ts:230-236` |
| 7 | 지분(%) 분할 — 지분마다 카드 | 카드 `general-building-fractional.ts:240-263` · 집계 `:365` · ④ 스케일 `transfer-tax-api-gb-carryover.ts:187-221`(`giftAssumedDebt: true` — 평가액과 같이 × r) | **△** | r 불변(정수 쌍 스케일). **꼬리 id가 `land#0__purchased`면 `shareIndexOf`가 undefined**(P6) → **R4** |
| 8 | 함께 양도 컴패니언 GB | `bundled-route.ts:378` · 카드 `general-building-part-cards.ts:295`(같은 `coerceGeneralBuildingPayload`) · 상세 키 `cardSuffixOf`(`gb-result-block-views.ts:95,115`) | **△** | 7과 같은 id 문제. `land#asset-1__purchased`의 `cardSuffixOf`는 `asset-1__purchased`(P6) |
| 9 | §97②2호 단서 swap(환산 파트 + 자본적지출·양도비) | 카드 `route-cards.ts:177,193`(`swapNabok` → `expenses`) · A 필요경비 `transfer-tax-carryover.ts:394-404`(`expenses` 무시) | **O**(기존 동작 승계) | P7: **현행 A가 swap 나목을 버린다** — 조각도 증여분(A)이 같이 버리고 매입분(B 규칙)이 (1−…)몫을 쓴다. 기존 결함 후보 → V-1 |
| 10 | 감가상각비(§97③) | `general-building-depreciation.ts:14`(원건물 카드만) · 범위 술어 `depreciation` 사유 | **X**(해당 카드) | 건물 파트에 채무 + 감가상각 > 0이면 엔진이 이미 throw. 토지 파트 채무 + 건물 감가상각은 카드가 다르므로 통과(P8) — ⑧·⑫는 **같은 카드 쌍**만 막는다(R5) |
| 11 | 증여자 신축·증축(`donorBuilt`, 건물 파트) | 술어 `donorBuilt` 사유(`scope.ts:60-61`) | **X** | 이미 엔진이 거부. ⑧·⑫ 거울 |
| 12 | 조특법 감면(`reductions`) | `reductionsForCard`(`route-cards.ts:130`)가 카드마다 싣는다(`:222`) · 술어 `reductions` 사유 | **X** | P8: throw 확인. 모든 카드가 받으므로 **어느 파트에 채무가 있든** 차단 |
| 13 | 주택→상가 용도변경 | `valuation.ts:628-634`가 모든 카드에 전파 · 술어 `acquisitionFacts` 사유 | **X** | P8: throw 확인 |
| 14 | 미등기(`unregistered` 축) | `route-cards.ts:221`(카드별 축) | **O** | 두 조각이 같은 축을 물려받는다(PR-1 A-13과 같은 구조 — 일반건물 카드 실측은 안 했다, 코드읽기) |
| 15 | 공익수용 §164⑨1호 | `general-building-converted-acquisition.ts:56-71`: **현 소유자** 환산의 토지 분모만 min[] — 증여자 환산 분모(`landStdTotalForFormula`, `valuation.ts:617-625`)는 원값 | **O**(영향 없음) | 코드읽기. probe는 게이트(2009.2.4·보상 후보)를 못 채워 수용 미발동 → V-4 |
| 16 | 구분 기재 양도가액(§100②) · 감정 안분 | 카드 `transferPrice`가 이미 확정된 뒤에 조각 | **O** | 코드읽기. 조각은 확정 양도가액만 자른다 |
| 17 | 의제취득일 전 상속·증여 파트(`resolveGbPreDeemedRoute`) | `general-building-pre-deemed.ts`에 이월과세 언급 0건(grep) | **—** | 상속·증여 파트용. 이월과세 파트와 겹치는지는 확인 필요 → V-5 |
| 18 | 부담부증여 일반건물(E4 경로 1) | 외부 단위 `externalStarts` 제외 `aggregate-debt-units.ts:39` · 카드에 ct 없음(`bundled-gb-carryover-units.ts` 머리) | **—**(PR-3) | 건드리지 않는다. ⑧ 범위 `numerator_only` 유지 |
| 19 | r = 1 (채무 = 파트 평가액) | `carryover-debt-pieces.ts:116-118` 증여분 없음 · 매입분이 원 id | **O** | 상당액은 분자 0이라 자동 0. **증여자 자본적지출 > 0이면 버려지므로 ⑧·⑫ 차단**(PR-1 Q-6과 같은 규칙, R5) |
| 20 | 양도자 본인 필요경비(환산 모드) | 카드 `expenses` = 개산공제(`valuation.ts` `estimatedDeduction`) 또는 swap 나목 | **△** | 매입분이 B 규칙으로 `rest(card.expenses)`를 받는다 — 환산 개산공제가 실가 취득가액(채무)에 붙는다. 기존 B도 같다 → Q-3 · V-2 |
| 21 | 한 토지 두 카드의 A/B가 서로 다르게 채택 | P4(R2 前): `land_business` A · `land_nbl` B — 카드마다 ②3호 단위 | **O**(기존 동작) | 조각과 무관한 기존 구조. 단 R2 後 두 카드 모두 A로 정착(P4′). V-6 |
| 22 | 카드 수 상한 20 | `transfer-tax-aggregate-helpers.ts:35-36`이 **일반 `Error`**(→ 500) | **△** | 지분 N × 4카드 + 꼬리가 20을 넘을 수 있다 → V-7 |

## 3. E2 설계

### 3.1 흐름 (변경점 R1~R5)

```
폼/④ (변경 없음: landCarryoverPart.giftAssumedDebt는 이미 와이어에 있다 · 지분 × r 스케일 `gb-carryover.ts:187-221`)
 → ⑫ (R5: 차단 거울만 추가 — 키·shape 변경 없음)
 → route 5-a-3 `dispatchGeneralBuilding` → `coerceGeneralBuildingPayload` → ★R1 `composeGbCarryover.fromPart`: ct.giftAssumedDebt 싣기
 → `buildGeneralBuildingAssetCards`(환산) / `calculateGeneralBuildingActualTransfer`(실가) / 증축 / 지분 `buildGbPartCards`
       ★R2 `splitLandCarryover`: 사업용·비사업용 분할 시 채무도 면적 비율로
 → `buildProperties`가 카드에 ct 싣기(변경 없음)
 → `calculateTransferTaxAggregate` → `…WithUnits` → `deriveCarryoverDebtUnits`(PR-1)  ★R3 범위 술어: `general_building_unit` 허용
       ★R4 꼬리 카드 id = 원 id의 `#` 앞에 `__purchased`
 → 응답 `mode:"bundled"` (변경 없음) · echo `scenarioA.purchasedPartSplit`은 부모 카드 detail(변경 없음)
```

**와이어 입력은 그대로**다(검증): 파트 `giftAssumedDebt`는 이미 ⑫ 파트 shape(`transfer-tax-building-schemas.ts:116` · 스키마 `landCarryoverPart`/`buildingCarryoverPart`)에 있고, ④가 보낸다(`transfer-tax-api-gb-carryover.ts:94`). 엔진 모양 `landCarryoverTaxation`/`buildingCarryoverTaxation`·지분 ct는 PR-1이 `rejectDebtPiecesKeyRefine`로 **거부**한다(`transfer-tax-building-schemas.ts:96-99,399,404` · `building-share-schemas.ts:140`) — 이 거부는 유지한다(받아 놓고 무시하는 침묵 strip 방지; 채무는 파트 shape으로만 들어온다).

### 3.2 R1 · R2 — ct에 채무 싣기와 분할

**R1** (`lib/tax-engine/general-building-entry.ts` `composeGbCarryover.fromPart`, `:66-100`): 반환 객체에 `...(debt > 0 ? { giftAssumedDebt: debt } : {})`를 더한다(`part.giftAssumedDebt`는 이미 `:73`에서 읽는다). 그러면 카드 ct에 채무가 실려 PR-1 파생 단위가 돈다. 레거시 경로(`legacy()`, `:104-114`)는 `...ct` 스프레드라 ⑫가 거부한 키가 올 수 없다. 이 파일 364줄 → ~368줄.

**R2** (`lib/tax-engine/carryover-land-split.ts:42-72`): 사업용 카드 채무 = `apportionLandByBusinessArea(ct.giftAssumedDebt, businessArea, totalArea)`, 비사업용 = 전체 − 사업용(잔액 흡수). 평가액·취득가액·증여세·자본적지출을 이미 이렇게 자르는 **같은 술어·같은 인자**다(파일 머리 주석 「분자와 분모가 갈린다」 · memory `feedback_shared_predicate_argument_parity`). 결과 카드별 r = 카드 채무 ÷ 카드 평가액이 파트 r과 floor 오차(≤ 수 원)로 같다.
- `undefined`는 「입력 없음」이라 그대로 둔다(0과 의미가 다르다) — 같은 파일의 기존 규칙.
- 호출부 4곳(`valuation.ts:489` · `extension.ts:496` · `route-actual.ts:414`와 단위 테스트)이 한 함수를 공유하므로 수정은 1곳이다.
- **계획서 범위 안인가**: 계획서 §4.4 「파트 r = 파트 채무 ÷ 파트 평가액」은 **파트** 단위 규칙이다. 한 토지 파트가 두 카드가 되는 것은 「소득세법」 제104조 제5항(한 필지를 비사업용과 그 외로 나누면 별개 자산으로 보아 계산)의 세율 계산 구조일 뿐 취득 사실이 둘로 나뉘는 것이 아니다. 따라서 사용자가 입력한 파트 채무를 **그 분할과 같은 비율**로 카드에 나누는 것이며, 빈 칸을 면적으로 채우는 「자동 안분 fallback 금지」 정책과 다르다(입력은 필수이고 ⑧이 막는다). 사용자가 다른 기준(예: 비사업용 먼저)을 원하면 Q-2.
- **R2를 안 하면**(실측 P4): 채무 8천만을 두 카드가 각각 전액 받아 합계 1.6억이 된다 → 사업용 카드 r = 1(증여분 사라짐) · 비사업용 카드 r = 2/3. 결정세액 20,051,350(올바른 값 26,763,852보다 6.7백만 작다) — **조용히 틀린 값**이다.

### 3.3 R3 — 범위 술어 (`lib/tax-engine/carryover-debt-pieces-scope.ts`)

- `SUPPORTED_PROPERTY_TYPES`(`:26`)에 `"general_building_unit"` 추가(+1줄). 이 술어는 와이어 최상위 `propertyType`(`general_building`은 계속 거부 — `:33`)과 카드의 `propertyType`을 같은 키로 읽는다. 일반건물 카드가 아닌 곳에서 `general_building_unit`은 존재하지 않는다(카드 전용 값 · `route-cards.ts`).
- **카드에 실리는 차단 사유는 이미 작동한다**(P8): 감면(`reductions` — 모든 카드) · 용도변경(`houseToCommercialConversion` — 모든 카드) · 감가상각(`depreciationAmount > 0` — 원건물 카드) · 증여자 신축(`ct.donorBuilt`).
- 같은 파일의 사유 문자열은 ⑧·⑫와 공유 상수다(`DEBT_PIECES_REASON`).

### 3.4 R4 — 꼬리 카드 id와 echo

**문제(P6)**: PR-1은 꼬리 id를 `${id}__purchased`로 만든다(`carryover-debt-pieces.ts:92`). 일반건물 지분·컴패니언 카드는 `land#0`·`land#asset-1` 꼴이라 `land#0__purchased`가 되는데, `shareIndexOf`는 `#` 뒤가 **숫자만**이어야 인정하므로(`general-building-share-id.ts:52-59`) `undefined`이고 `cardSuffixOf`는 `0__purchased`/`asset-1__purchased`를 돌려준다 → 같은 지분 짝 찾기(`isSameShare`)·함께 양도 상세 키(`gb-result-block-views.ts:73,95,115` · `DetailedStatementGbAsset.ts:31,37`)가 어긋난다. 지분 요약도 `assetId.endsWith('#i')`로 지분 행을 고른다(`transfer-per-asset-summary.ts:386`).

**규칙**: 접미사를 **`#` 앞**에 둔다 — `land#0` → `land__purchased#0`, `land_nbl#asset-1` → `land_nbl__purchased#asset-1`. 이러면 `shareIndexOf`(0) · `cardSuffixOf`(`0`/`asset-1`) · `endsWith('#0')`가 그대로 맞고 `isSameShare("land#0", "land__purchased#0")`가 true다. `#`가 없는 id(E1 `primary` · `asset-N`)는 종전 `${id}__purchased` 그대로다(**E1 회귀 0** — `#`는 일반건물 전용 구분자, grep 확인).
- 구현: `lib/tax-engine/general-building-share-id.ts`(무의존 leaf, 71줄)에 `purchasedPartIdOf(id)`를 추가하고 `carryover-debt-pieces.ts:92`가 쓴다. leaf라 순환 없음.
- **소비처 영향은 UI 설계서 합의 항목**: `baseCardId("land__purchased#0")`은 `land__purchased`라서 `=== "land_business"`·`"building1"` 같은 정확 비교(`route-cards.ts:344,349` · `DetailedStatementGbFormulas.ts:36-65,80,306,638` · `GeneralBuilding3WayTable.tsx:44` 등)가 꼬리 카드를 **어느 쪽으로도 분류하지 않는다**. 이것이 의도다 — 꼬리 카드를 부모의 환산 산식 카드로 오인해 표시하는 것보다 안전하다. 꼬리 행의 근거는 echo(`purchasedPartSplit.purchased`)가 대신한다. (대안: `baseCardId`가 `__purchased`도 벗기면 꼬리가 부모 산식 카드를 집는다 — 환산 산식 표시가 매입분(채무 = 실가)과 어긋나 기각 → Q-6.)

**echo**: 변경 없음. `attachPurchasedPartSplit`(`aggregate-debt-units.ts:93-127`)이 **채무 단위마다** 부모 카드 `properties[idx].carryoverTaxationDetail.scenarioA.purchasedPartSplit`에 싣는다(P1·P9). 따라서
- 토지·건물 둘 다 채무 → 부모 2장 각각(토지 `land` · 건물 `building`).
- 사업용·비사업용 분할 → `land_business`·`land_nbl` 각각(각 `debtAmount`/`giftValuation`은 카드 몫, P4′).
- 지분 → 지분 × 파트마다.
- 일반건물 `apportionment`(사이드바 표)는 **조각 전 카드**(`buildApportionment`, `route-helper.ts` 환산 / 실가 각각)로 만든다 — 표시 전용이고 합이 조각 합과 일치한다(500M + 500M = 375M + 125M + 500M, P9). 꼬리 행은 `aggregated.properties`에만 있다.
- `donorAcquisitionPrice`·`giftValuation` 등 echo 필드의 의미는 PR-1 §2.6과 같다(카드 몫).

### 3.5 환산 모드 필요경비와 swap — 승계하는 기존 동작

`buildInputB`는 카드 `expenses`를 그대로 B 입력에 둔다(`transfer-tax-carryover-inputs.ts:58-98`). 일반건물 **환산** 카드의 `expenses`는 현 소유자 환산취득가액의 **개산공제**(또는 swap 나목, `route-cards.ts:178-180,198`)다. 한편 시나리오 A는 `capitalExpenditure`가 항상 정의돼 `expenses`를 읽지 않는다(`transfer-tax-carryover.ts:394-404` — 주석 「legacy `expenses`를 무시」). 결과:
- **B(현행)**: 취득가액 = 증여 당시 평가액(실가) + 필요경비 = 환산 개산공제 — 이미 있는 동작.
- **조각**: 증여분(A 규칙)은 `expenses`를 읽지 않아 (1−r) 몫이 버려지고, 매입분(B 규칙)은 `rest(card.expenses)`를 받는다(P1: 2,394,000 → 매입분 957,600 · 증여분 1,436,400 버려짐).
이는 PR-1이 정한 「매입분은 B 입력과 같고 취득가액만 다르다」(PR-1 §3.3)의 직접 귀결이다. **일반 양도 E1에서는 `expenses`가 사용자 직접 필요경비라 문제가 없지만 E2 환산 모드에서는 의미가 다르다.** PR-2는 B 규칙을 바꾸지 않고 승계하며, 쟁점은 Q-3 · V-1 · V-2로 올린다. 실가 경로(P3)는 `expenses` = 본인 직접 필요경비라 Q-2 a(r로 나눔)와 정확히 일치한다(매입분 필요경비 0은 입력이 0이어서다).

### 3.6 R5 — ⑧·⑫ 차단 거울

| 위치 | 규칙 |
|---|---|
| ⑫ GB 파트 refine `lib/api/transfer-tax-schema-required-refines-gb.ts:253-297` `refineGbCarryover` | 채무 > 0인 파트에 대해 ① r = 1 ∧ 그 파트 `donorCapitalExpenditure > 0` → issue(`{part}CarryoverPart`,`donorCapitalExpenditure`) ② 최상위 `reductions` 비어 있지 않음 ③ `houseToCommercialConversion` ④ 건물 파트 `donorBuilt` ⑤ 건물 파트 채무 ∧ `depreciationAmount > 0` → issue(`{part}CarryoverPart`,`giftAssumedDebt`). 사유 문자열은 `DEBT_PIECES_REASON` 재사용 |
| ⑧ `lib/calc/transfer-tax-validate-carryover-debt.ts` `assumedDebtIssue` 쪽 (일반건물 `validateGbCarryover` `transfer-tax-validate-gb-carryover.ts:130-134`) | ⑫와 같은 조건을 폼 기준으로 |
| 범위 술어 `carryoverPurchasedPartScope` (`lib/calc/carryover-gift-assumed-debt.ts`) | `general_building` + 부담부증여 → `numerator_only` 유지(E4 경로 1) · 일반 양도 → `apply` (UI 설계서) |
- 엔진 throw(`INVALID_INPUT`, `path: carryoverTaxation.giftAssumedDebt`)는 `route.ts:428` `taxCalculationErrorResponse`로 400이 되지만 **필드 오류가 아니다** — ⑫가 먼저 필드 위치로 막아야 한다(⑧↔⑫ 격자 전수 대조 anchor).
- ⑧ 사이드바·검증이 같은 카드 쌍만 막는 이유(행 10): 토지 파트 채무 + 건물 감가상각은 카드가 달라 엔진이 통과시킨다. 막으면 합법 입력이 막힌다.

## 4. probe 실측 (throwaway, 삭제함)

공통: `makeMockRates()` · 환산 · 양도 2022-10-11 · 총 양도가액 330,000,000 · 토지 57㎡ · 증여 2020-03-17 · 증여자 1995-06-15 취득 5천만 · 평가액 2억 · 증여세 상당액 5천만 · 채무 8천만(r = 0.4). 토지만 이월과세. 「ct만」 = 엔진 모양 `landCarryoverTaxation.giftAssumedDebt`를 직접 실었다(Zod 우회) — R1·R2·R3의 효과를 각각 시뮬레이션하려고 vitest `vi.mock`으로 합성기·분할·술어를 덧입힌 경우는 표에 표시했다.

| P | 경로 | 입력 | 결정세액 | 구조 | 손계산 |
|---|---|---|---|---|---|
| P1 | 2-way 환산 · 토지 | 채무 OFF | **35,488,448** | 행 2(토지·건물) | (152,918,087 − 4,908,235 − 250만) × 35% − 1,544만 ✓ |
| P1 | 같음 | **채무 8천만(ct만)** | **25,428,373** | 토지(증여분) · 건물 · `land__purchased` | 증여분 tp 191,072,645 · 취득 3천만 · 상당액 5천만 → 차익 111,072,645 − 장특 30% 33,321,793 = 77,750,852 / 매입분 tp 127,381,764 · 취득 8천만 · 필요경비 957,600 → 46,424,164 (보유 2년 7개월 장특 0) / 건물 −4,908,235 → 합 119,266,781 − 250만 = 116,766,781 × 35% − 1,544만 = **25,428,373 ✓** |
| P2 | 2-way 환산 · 증여자 환산(분자 3천만) | OFF | 40,928,847 | 취득 28,140,964 · 필요경비 50,900,000 | — |
| P2 | 같음 | 채무 8천만 | **28,509,351** | 증여분 취득 16,884,578(= 28,140,964 × 0.6) · 필요경비 50,540,000(상당액 5천만 + 개산공제 3% × 1,800만) | (123,648,067 − 37,094,420 + 46,424,164 − 4,908,235 − 250만) × 35% − 1,544만 = **28,509,351 ✓** |
| P3 | 실가 · 토지 | 채무 8천만 | 증여분 12,900,204 + 매입분 5,847,264 (신고 합 0 — 건물 차손 통산) | 필요경비 0 | — (probe) |
| P3 | 증축 3-way · 토지 | OFF 19,923,021 → 채무 | **9,957,002** | 토지 · building1 · building2 · `land__purchased` | probe |
| P4 | 토지 570㎡ 사업용 40%·비사업용 60% | OFF | 39,606,565 | 카드 `land_business`·`land_nbl` | 손계산 ✓ (아래) |
| P4 | 같음 | **채무 8천만을 면적으로 안 자름**(현행 코드 + R1) | **20,051,350 (오답)** | 두 카드 모두 채무 8천만 → 사업용 r = 1 · 비사업용 r = 2/3 · 비사업용 B 채택 | — |
| P4′ | 같음 | 채무를 면적으로 자름(R2 시뮬레이션) | **26,763,852** | 사업용 채무 3,200만/평가액 8천만 · 비사업용 4,800만/1.2억 · 꼬리 2장 · 두 카드 A | **max(§104⑤1호 합산, 2호 자산별) ✓**: 1호 (기본세율 소득 48,654,547 + 비사업용 소득 74,427,890 − 250만) × 35% − 1,544만 = 26,763,852 / 2호 비사업용 71,927,890 → 18,695,482 + 기본 48,654,547 → 6,038,182 = 24,733,664 → 큰 값 26,763,852 |
| P5 | 건물 파트 이월과세 · 채무 8천만 | 현행 | **throw** 「분양권·입주권·재개발·겸용·일반건물은 지원하지 않습니다」 | — | — |
| P5 | 같음 | 술어에 `general_building_unit` 허용(R3 시뮬레이션) | 10,484,504 | `building` · `building__purchased` | probe (픽스처 건물 양도가 1,155만 ≪ 채무라 매입분 차손 7.6천만 — 구조 확인용, 현실 수치 아님). 증축 + 건물1: `building1__purchased` 정상 |
| P6 | id 규칙 | `shareIndexOf("land#0__purchased")` | undefined · `cardSuffixOf` = `0__purchased` | — | |
| P6 | 같음 | `land__purchased#0` | `shareIndexOf` = 0 · `cardSuffixOf` = `0` · `baseCardId` = `land__purchased` | — | |
| P7 | swap(자본적지출 1.5억 + 양도비 5백만 — 환산+개산 93.7M < 155M) | 채무 OFF | 31,721,209 (토지 A 필요경비 5천만 = 상당액만 · 나목 127,782,635 **버려짐**) | 건물 swap 나목 27,217,365 | probe |
| P7 | 같음 | 채무 8천만 | 7,643,469 | 매입분 필요경비 51,113,054 = 나목의 40% | probe → V-1 |
| P8 | 감면 + 채무 | — | **throw** 「감면」 | | |
| P8 | 용도변경 + 채무 | — | **throw** 「취득 시점에 따라 …」 | | |
| P8 | 건물 감가상각(비이월과세 건물) + 토지 채무 | — | 27,168,738 (통과) | 카드가 달라 | |
| P9 | **화면 경로**(폼 → ④ → ⑫ → route, 경로 2 numerator-net 픽스처) · R1 시뮬레이션 | 토글 OFF | **156,620,000** (기존 anchor) | `mode:"bundled"` · 행 2 | (458.9M − 250만) × 40% − 2,594만 ✓ |
| P9 | 같음 | 토글 ON 1억(평가액 4억 · r = 0.25) 현행 | **157,460,000** (기존 anchor — 분자만 순액) | 행 2 | |
| P9 | 같음 | 토글 ON 1억 **+R1** | **141,690,000** | 토지(증여분) tp 375,000,000 · 취득 112,500,000 · 상당액 9,000,000 · 장특 20년 30% / 매입분 tp 125,000,000 · 취득 1억 · 필요경비 750,000 · 보유 5년(정확히 2021-03-01→2026-03-01) 장특 10% / 건물 불변. `purchasedPartSplit`이 `land` 행에 부착, 꼬리 `land__purchased` | (253,500,000 − 76,050,000) + (24,250,000 − 2,425,000) + (247,000,000 − 24,700,000) = 421,575,000 − 250만 = 419,075,000 × 40% − 2,594만 = **141,690,000 ✓** |

P4 OFF 손계산: 기본세율 소득 (91,523,161 − 27,456,948) + (−964,046) = 63,102,167 / 비사업용 137,284,743 − 41,185,422 = 96,099,321 → 1호 합산 (63,102,167 + 96,099,321 − 250만) × 38% − 1,994만 = 39,606,565 ✓(= 엔진).

## 5. E3 — 주택 분리 계산 파트

### 5.1 현행 사실
- 흐름: 합성기 `transfer-split-carryover-compose.ts:68-123` → `calculateTransferTax` 내부 STEP 0.476(`transfer-tax-precalc.ts:174`) `calcSplitCarryoverScenarios`(`transfer-tax-split-carryover.ts`). **집계를 거치지 않는 단건**이고 호스트는 단일 자산이다(다건·컴패니언·병용은 ⑫ 거부 — E3 설계서 §0 D-7, §6.2 S0·S2′).
- 채무는 합성기에서 분자 순액에만 쓰이고(`compose.ts:92`) ct에 `giftAssumedDebt`가 echo로 실린다(`:96` → `split-carryover.ts:339`). 최상위 `carryoverTaxation`이 없어 PR-1 파생 단위·G1 가드(`transfer-tax-carryover.ts:672`)에 걸리지 않는다 — 현행 anchor 경로 3: `175,110,000`(통과, `transfer.route.carryover-gift-tax-numerator-net.anchor` 20건 통과 확인).
- 파트별 A/B: 토지=0·건물=1을 **순차 고정점**으로(`:255-295` · `INDEX` `:69`). 한 시나리오 입력은 일반 split 입력(`buildScenarioInput`, `:119-192`)이고 **파트마다 취득일·취득가액이 하나**다(토지 `landAcquisitionDate`·`landAcquisitionPrice` / 건물 `acquisitionDate`·`buildingAcquisitionPrice`). 시나리오는 `calculate(input)` 재귀(`:267`)로 계산한다.
- ②2호(1세대1주택)는 ②3호 **앞**에서 A 전부 vs B 전부 상태 변화로 판정한다(`:281-290` `becomesOneHouse`·`oneHouseExclusion`) — 집 일체 기준.

### 5.2 왜 조각이 안 들어가는가
1. **한 파트 안에 날짜가 둘** — A 시나리오의 토지 파트 = 증여분(증여자 취득일) + 매입분(증여일). `calcSplitGain`은 토지·건물 **고정 2파트**(`transfer-tax-split-gain.ts:57-` · 결과 `SplitGainResult { land, building }`)이다. 이후 장특(`transfer-tax-lthd.ts:393-457` 파트별 `holdingYears`)·파트별 세율 + §104⑤ 비교(`transfer-tax-split-rate.ts`)·12억 안분(`transfer-tax-taxable-gain.ts:115-119` `taxableGainAfterProration`)이 모두 이 2파트를 읽는다. `splitDetail.land|building`을 읽는 곳이 `lib/tax-engine`에 **11파일·83곳**(grep). 세 번째 파트(`nonBusinessLandPart`, 배율 초과 부수토지 — `lthd.ts:485` · `split-rate.ts:573`)는 소비처마다 **개별 처리**한 선례일 뿐 일반 N파트 구조가 아니다.
2. 파트 이월과세 입력은 `S5`로 **「이월과세 파트의 취득일 = 증여 등기접수일」**을 강제한다(E3 설계서 §6.2 S5). 즉 B쪽 파트(매입분이 앉을 자리)와 증여분이 한 입력의 같은 파트에서 충돌한다.
3. 토지·건물 r이 **파트마다 다르다**(파트 r = 파트 채무 ÷ 파트 평가액). A 시나리오가 파트별로 갈린 경우(토지 A·건물 B 등 `01`·`10`) 시나리오 수가 늘어 순차 고정점(`MAX_PASSES 2`)·`orderDependent` 표시(`:371-393`)가 조각 단위로 재설계돼야 한다.

### 5.3 대안 비교

| | 내용 | 주택 일체 1세대1주택(§89①3호) · 12억 안분 · ②2호 · ②3호와의 맞물림 | 판정 |
|---|---|---|---|
| **(a)** 해결자 안에서 파트 안 조각을 별도 기산으로 | `calcSplitGain`/`SplitGainResult`를 N파트로 일반화하거나 파트마다 서브파트를 도입 | 12억 안분 분모는 이미 물건 전체(`transfer-tax-exemption.ts:371,498,517,549` — `totalPropertyTransferPrice ?? transferPrice`)라 조각 `totalPropertyTransferPrice = whole` 규약(PR-1)과 맞는다. 그러나 장특·세율·§104⑤·echo·결과 8뷰·`splitDetail` 소비처 83곳을 고쳐야 하고 ②2호 판정(`:281`)은 조각 합을 한 집으로 읽게 바꿔야 한다 | **별건 계획서**(대규모 · 순차 고정점 재설계 포함) |
| **(b)** 집계로 보내기 | 증여분·매입분을 PR-1처럼 카드 둘로 펼침 | 한 집이 카드 둘이 되면 `resolveOneHouseUnit`이 집 카드 **1장**을 전제해 단위를 못 세운다(`transfer-tax-one-house-unit.ts:79` `houseIdxs.length !== 1`; PR-1이 E1에서 막은 이유 `aggregate-debt-units.ts:42-46`). E3는 거기에 더해 **A 시나리오에서만 파트 안 조각**이 생기고 한 집에 토지 조각 둘 + 건물 하나가 되는데, 카드 단위 조각은 파트별 r을 표현할 수 없다(토지만 조각이면 매입분 카드는 건물 없는 토지 카드 — 주택이 아니라 §89①3호 판정 불가). ②3호도 카드 단위(자산) 드라이버라 E3의 **파트 단위** 고정점(N-1 사용자 결정)과 다르다 | **기각**(주택 일체 판정이 깨진다) |
| **(c1)** 이번 PR에서 안 만들고 **현행 유지 + 결과 고지** | 토글·입력·분자 순액 그대로. 결과에 「당초 증여 때 인수한 채무 부분은 따로 나누지 않고 증여세 상당액 분자에서만 뺐다」를 echo 기반으로 고지 | 현행 세액이 불변(E3 anchor 175,110,000 등). 판정(②2호·②3호·12억)이 전부 현행 그대로라 모순 없음. 단 사용자 결정(§0)과 다른 결과가 나오는 영역이 남는다 → 고지가 이를 가린다 | **권장** |
| **(c2)** 이번 PR에서 막기 | E3 + 토글 ON ⑧·⑫ 400 | V-7이 연 입력(경로 3)을 다시 막는다(PR-1 §5.2가 같은 이유로 거부). anchor 2건 반전 | 비권장 |

**고지 echo 설계(c1)**: `SplitPartCarryoverEcho.giftAssumedDebt`는 **이미 있다**(`transfer-split-gain.types.ts:112` ← `split-carryover.ts:339`) — 결과 화면은 이 값이 > 0이면 문구를 낸다. 엔진 변경 0, 와이어 변경 0. 고지 문구·위치는 UI 설계서. 별건 계획서의 입구 질문(Q-4)은 §8.

법문이 명확해 단정하는 부분: 증여분의 보유·세율 기산이 증여자 취득일(제95조제4항 단서 · 제104조제2항제2호), 매입분의 취득일이 증여일(영 제162조제1항제5호)이라는 점 — 그래서 한 파트에 날짜가 둘이 된다. 법문이 둘로 읽히는 곳: 주택 일체에서 조각별 비과세·12억 안분 판정(PR-1 V-5와 같은 미결) → V-8.

## 6. 기존 anchor와 회귀

| anchor | 현재 | PR-2 後 | 비고 |
|---|---|---|---|
| `transfer.route.carryover-gift-tax-numerator-net.anchor` 경로 2 (일반건물 일반 양도, 토글 ON 1억) | 157,460,000 | **141,690,000**(손계산 ✓) · 행 3 · `mode:"bundled"` | 반전. 같은 테스트의 「B(미적용) 동일」 단언은 유지(`scenarioB` 불변) · `giftTaxAddedToExpense` 9,000,000 불변 · `landOf(r)`은 `토지…`로 시작하는 첫 행(증여분)을 집는다 |
| 같은 파일 경로 2 토글 OFF | 156,620,000 | 불변 | 회귀 0 |
| 경로 1(BG P0·P3·0 토글) | 107,454,000 · 97,800,000 | 불변 | 외부 단위 — 카드에 ct 없음 |
| 경로 3(E3) | 175,110,000 | 불변 | (c1) |
| `carryover-gift-assumed-debt-fields.anchor.test.tsx` | 통과 | 일반건물 `numerator_only` 문구가 `apply`로 바뀌는 곳은 UI 설계서 | |
| 일반건물 이월과세 기존 anchor(`gb-carryover-card-wiring` GX/LS 등) | 통과 | 불변 | 채무 키 없음 = 조각 없음 |
| 저장 이력(IndexedDB) 중 일반건물 + 토글 ON | 저장된 세액 | **재계산 시 값이 달라진다**(위 경로 2 같은 폭) | Q-5 |

## 7. 14개 동기화 지점 (엔진 쪽)

| # | 지점 | 변경 | 근거 |
|---|---|---|---|
| ① ② ③ | 폼 상태·initial·normalize | 없음 | 파트 필드 재사용 |
| ④ | API 변환 | **없음** — 파트 `giftAssumedDebt`는 이미 전송 · 지분 스케일 `PART_SCALE.giftAssumedDebt: true`(`transfer-tax-api-gb-carryover.ts:187-221`). 컴패니언도 같은 `buildGbCarryoverPayload` | 코드읽기. 단 컴패니언·지분 ④ 호출부가 모두 같은 함수인지 grep 자가 점검(`transfer-tax-api-gb-shares.ts:195`) |
| ⑤ | UI 위젯 | UI 설계서 | |
| ⑥ | 사이드바 | **없음 확인**: 환산 프리뷰는 카드 조립까지만(`transfer-estimated-preview.ts:169` `buildEstimatedGeneralBuildingCards`) — 집계를 안 거쳐 조각이 안 보인다. 계산 후 합산은 UI | |
| ⑦ | 결과 | 부모 카드 echo(변경 없음) + 꼬리 행 처리(R4) | UI 설계서 |
| ⑧ | validation | R5 | |
| ⑨ ⑩ | Zod enum | **없음**(새 enum 없음) | |
| ⑪ | 자산-수준 `acquisitionDate` fallback | **없음** — 조각 날짜는 ct에서 | |
| ⑫ | Zod 입력 객체 | **shape 변경 없음**(파트 shape에 이미 있음) · refine만 추가(R5) · 엔진 모양 거부 유지 | `required-refines-gb.ts:290` |
| ⑬ | body spread | **없음** — 파트 객체가 통째로 spread(`buildGbCarryoverPayload`) | |
| ⑭ | Route 엔진 input 매핑 | **R1 1곳**(`composeGbCarryover.fromPart`) — 이 합성기가 필드를 **하나씩 옮기는 갈래**라 빠지면 침묵 strip이다(`general-building-entry.ts` 머리 주석 · 파트 `donorBuilt`가 같은 이유로 여기에 있다 `:94-95`). 숫자라 Date 변환 불필요. 단건·지분·컴패니언이 `coerceGeneralBuildingPayload` 한 함수를 공유(`route-helper.ts:135` · `part-cards.ts:295` · `fractional.ts:327`) | |

**자기 점검**: 새 `useEffect → store` 없음 · 자동 안분 fallback 없음(R2는 사용자 입력 채무의 카드 분배이며 ⑧이 필수로 막음) · validate 8번째 동기화는 R5에 명시 · 금액 연산은 `apportionLandByBusinessArea`(내부 `safeMultiplyThenDivide`)와 PR-1 leaf를 재사용(`Math.round` 없음).

## 8. 사용자 결정 레지스터 (Q-n) — ✅ 2026-10-28 확정: 전부 권장안(Q-1 a · Q-2 a · Q-3 a · Q-4 c1 · Q-5 a · Q-6 a)

- Q-4 c1: E3는 현행 분자 순액 유지 + 결과 고지. N파트 해결자(a)는 별건 계획서로 예약(이번에 착수하지 않음).
- Q-UI-6 a(K-2, UI 설계서)도 확정 — §3.1 「와이어 입력은 그대로」는 part 모양에 한한다. engine 모양(증여세 칸 비었을 때)은 토글 ON이면 ⑧이 막는다.

| # | 질문 | 선택지 | 권장 |
|---|---|---|---|
| **Q-1** | E2 건물 파트까지 이번 PR에 넣는가 | **a** 토지·건물 전부 · **b** 토지만(건물은 별건) | **a** — 건물 카드는 범위 술어 1줄이면 probe에서 정상(P5). 단 Pre-Do에서 건물 파트 손계산 anchor 선행(미검증 V-3). 틀리면 b로 후퇴 |
| **Q-2** | 사업용·비사업용 분할 카드에서 채무 분배 | **a** 면적 비율(기존 평가액·취득가액·증여세와 같은 술어) · **b** 비사업용 초과분에 먼저/전액 · **c** 분할 + 채무 조합 차단 | **a** — 카드별 r이 파트 r과 같고(§3.2), 법 제104조제5항상 한 필지의 두 별개 자산 계산. b·c는 근거가 없다 |
| **Q-3** | 환산 모드 매입분의 필요경비 | **a** B 규칙 승계 — `card.expenses`(현 소유자 환산 개산공제 또는 swap 나목)를 r로 나눠 매입분이 받음(기존 B와 일치) · **b** 환산 모드 매입분은 필요경비 0(취득가액이 실가=채무라 개산공제는 환산·감정·기준시가 취득가액에 한 적용이라는 해석) | **a** — 바꾸려면 B도 함께 바꿔야 한다(dual truth). 다만 **기존 B의 환산 개산공제 혼용이 맞는지 자체가 V-2** — 사용자가 판단해 별건으로 |
| **Q-4** | E3 | **c1** 현행 유지 + 결과 고지 · **c2** 막기 · **a** N파트 해결자 별건 계획서(즉시 착수) · (b 기각) | **c1**, 그리고 a를 별건 계획서로 예약할지는 사용자 결정(수요 확인) |
| **Q-5** | E2 토글 ON 기존 이력의 재계산 값 변경(경로 2 157,460,000 → 141,690,000) | **a** 그대로 진행(결과 화면의 조각 표시가 사유를 설명) · **b** 결과에 「종전 계산과 달라질 수 있음」 고지 추가 | **a** — 계획서 §0 결정의 귀결이고 토글은 사용자가 켜야 작동 |
| **Q-6** | 꼬리 id | **a** `base__purchased#N`(R4 — `#` 앞) · **b** `base#N__purchased` + `shareIndexOf`/`cardSuffixOf` 완화 | **a** — 기존 숫자 접미사 규약·`endsWith('#i')`를 안 건드린다 |

## 9. 검증 계획

### 9.1 Pre-Do anchor (빨간불 먼저)
1. **엔진 집계 anchor** (`__tests__/tax-engine/transfer/`): 위 P1·P2·P4′·P9의 손계산 값을 `calculateGeneralBuildingTransfer` 직접 호출로 — 현재는 R1 전이라 채무 키를 읽지 않아 OFF 값(적색). P4는 현행 코드에서 R1을 엔진 모양으로 실으면 **20,051,350(적색의 반대 — 오답이 재현)**, R2 후 26,763,852.
2. **route anchor**: 경로 2(numerator-net)를 141,690,000으로 반전 · `mode:"bundled"` · 행 `land` + `land__purchased` · `purchasedPartSplit.debtAmount = 100,000,000`.
3. 건물 파트 손계산 anchor 선행(Q-1 a의 전제): 현실 비율(건물 양도가 > 채무)로 다시 잡은 픽스처.
4. 지분 route anchor(40% 지분 ✕ 채무): 꼬리 id `land__purchased#1`, `shareIndexOf` = 1, 스케일 floor로 r이 ±수 원 흔들리는 범위 확인(V-3).
5. 컴패니언 GB route anchor: 꼬리 `land__purchased#asset-1`, 상세 키 일치.

### 9.2 뮤테이션 (각각 어느 anchor가 죽어야 하는지 구현 때 실측)
- R1 제거(채무 strip) · R2 제거(채무 전액을 두 카드에) · R2에서 비사업용 잔액 흡수 대신 둘 다 floor(합 −1원) · R3 제거 · R4를 `base#N__purchased`로 · `giftTaxAmount`를 매입분에도 · 증여자 자본적지출을 매입분에도 · ⑫ r = 1 차단 제거 · ⑫ 감면 차단 제거 · ⑧ 감가상각 차단 조건을 「같은 카드 쌍」에서 「전 카드」로 넓힘(토지 채무 + 건물 감가상각 통과 anchor가 죽어야 한다).
- PR-1 뮤테이션(꼬리를 splice 삽입 · `buildInputB` 손조립 · `totalPropertyTransferPrice` 조각 크기)도 일반건물 카드에서 한 번 더 확인.

### 9.3 완료 점검
`npx tsc --noEmit` · `npx vitest run __tests__/tax-engine/transfer/ __tests__/tax-engine/transfer-tax/ __tests__/calc/ __tests__/api/` 관련 · ⑧↔⑫ 격자 전수 대조 · 14지점 grep(⑫⑬⑭) · 브라우저(Playwright) — 폼 → 계산 → 결과 → Network body에 채무 키 확인.

## 10. 미검증 레지스터 (V-n)

| # | 항목 | 상태 |
|---|---|---|
| **V-1** | 일반건물 환산 카드에서 **시나리오 A가 swap 나목(`card.expenses`)을 읽지 않는다**(P7: 자본적지출 1.5억이어도 A 필요경비는 상당액 5천만뿐 — 현 소유자 본인 지출이 A에서 사라진다). 조각은 이를 승계한다(증여분 버림 · 매입분 몫만 사용). 기존 결함 여부 판정 필요 | **확인 필요** — PR-2 범위 밖, 발견만. 별건 |
| **V-2** | B 및 매입분이 **환산 개산공제를 실가 취득가액에 붙인다**(§3.5). 「소득세법」 제97조제2항 제1호·제2호의 구분(실지거래가액 = 자본적지출+양도비 / 환산 = 개산공제)과 맞는지 | **확인 필요**(기존 B 동작 · Q-3) |
| **V-3** | 건물 파트·지분·컴패니언은 **probe/코드읽기만**, 손계산 anchor는 Pre-Do에서. 지분 스케일 floor로 r이 ±수 원 | **확인 필요** |
| **V-4** | 공익수용 §164⑨1호 조합: 이번 probe는 게이트를 못 채워 수용 미발동 | **확인 필요**(코드상 증여자 환산 분모는 원값 — 영향 없음 예상이 아니라 기존 동작) |
| **V-5** | `resolveGbPreDeemedRoute`(의제취득일 전 상속·증여 파트)와 `carryover_gift` 파트의 상호작용 | **확인 필요**(grep 0건 = 이월과세 언급 없음) |
| **V-6** | 한 토지의 사업용·비사업용 두 카드가 **각자 ②3호 A/B 판정 단위**(P4 현행: 한쪽 A · 한쪽 B) — 법 제104조제5항상 별개 자산이지만 §97의2제2항제3호 「해당 자산」과의 관계는 조각과 무관한 기존 구조 | 기존 동작 — 별건 |
| **V-7** | 카드 상한 20이 일반 `Error`(→ 500)(`transfer-tax-aggregate-helpers.ts:35-36`). 지분 N × (토지 1~2 + 건물 1~2) + 꼬리가 넘을 수 있다 | **확인 필요** — 구현 PR에서 앵커로 한계 케이스 |
| **V-8** | 주택 일체에서 조각별 비과세·12억 안분(PR-1 V-5와 같은 미결) — E3 별건 시 재논의 | 미결(PR-1 승계) |
| **V-9** | 결과 화면 소비처(`baseCardId` 정확 비교 · `gb-result-block-views` · 신고서)의 꼬리 카드 처리 | UI 설계서 합의 |
| **V-10** | 엔진 throw가 400이지만 필드 오류가 아니다 → ⑫가 먼저 막는지 격자 전수 대조 | 구현 anchor |

## 부록 — probe 기록 (파일은 삭제함 · 재현 가능한 요약)
- e2-1: `calculateGeneralBuildingTransfer`(BASE: 총 3.3억 · 토지 57㎡ · 증여 2020-03-17)에 `landCarryoverTaxation`(엔진 모양) ± `giftAssumedDebt` 8천만. 건물 파트는 술어가 throw.
- e2-2: 사업용·비사업용(570㎡) · 증여자 환산 · 증축 · 실가(`calculateGeneralBuildingActualTransfer`) × 채무.
- e2-3: swap 발동(자본적지출 1.5억) ± 채무.
- e2-4: `vi.mock`으로 술어에 `general_building_unit` 허용 → 건물 파트·증축 건물1·양쪽 파트.
- e2-5: 폼 → ④ → ⑫ → route(POST) 경로 2 픽스처. `coerceGeneralBuildingPayload`를 `vi.mock`으로 감싸 파트 채무를 ct에 싣는 R1을 시뮬레이션(환경변수 ON/OFF).
- e2-6: `splitLandCarryover` 채무 분할(R2) 시뮬레이션 · 감면/용도변경/감가상각 차단 확인 · id 규칙 평가.
- 기존 안전망: `transfer.route.carryover-gift-tax-numerator-net.anchor.test.ts` + `carryover-gift-assumed-debt-fields.anchor.test.tsx` 20건 통과(이 worktree 현재).


## 11. Do 환류 (2026-10-28 — PR-2 본인 지출 소실 수정과의 상호작용)

- **V-2 해소 · Q-3 a 승계 결과 변경.** 이월과세 일반건물 카드가 본인 직접귀속 나목을 `capitalExpenditure`로 **명시**(0이어도 0)하게 되어(`buildProperties` — 계획서 `docs/00-pm/gb-estimated-carryover-scenario-a-capex.plan.md` §11) 매입분(`splitCarryoverDebtPieces` → `buildInputB`)이 §97②2호 swap 경로로 읽는다. 매입분 필요경비는 카드 스칼라 `expenses`의 몫(= 본인 환산 개산공제)이 아니라 **본인 자본적지출 + 양도비 몫뿐**이다. 매입분의 취득가액은 채무(실지거래가액)라 「소득세법」 제97조제2항**제1호**이고 개산공제(같은 항 제2호 몫)는 근거가 없다 — 위 §3.5 표 행 20의 `△`와 V-2 「환산 개산공제를 실가 취득가액에 붙임」이 이 변경으로 해소된다. Q-3 의 결정(B 규칙 승계)은 그대로이고, 승계되는 **B 규칙 자체가 정정된 것**이다(증여 당시 평가액 = 실지거래가액 의제 → B 필요경비에서 개산공제 제거, B-2).
- **수치 정정(원인 하나 — 매입분 개산공제 제거, 증여분 카드 불변).** 위 표·본문의 P-값은 당시 실측으로 두고 현행 값은 아래와 같다. 검증: 세액 증가 = 제거된 매입분 개산공제 × 한계세율(또는 장특 후 비율), 건별 손계산 + 카드별 덤프.

| 행 | 종전 | 현행 | 제거된 매입분 개산공제 → 설명 |
|---|---|---|---|
| P1 (2-way 환산 토지, 채무 8천만) | 25,428,373 | **25,763,533** | 957,600 × 35% = 335,160 |
| P2 (증여자 환산취득가액) | 28,509,351 | **28,844,511** | 957,600 × 35% |
| P3 (증축 3-way, probe 고정) | 9,957,002 | **10,590,144** | 2,638,093 × 24% = 633,142 |
| P4′ (사업용·비사업용 분할) | 26,763,852 | **30,115,452** | (3,830,400 + 5,745,600) × 35% = 3,351,600 |
| E2-3 (건물 파트, 채무 4천만) | 40,556,000 (B 33,210,000) | **41,012,000** (B 34,260,000) | 1,200,000 × 38% (B 는 개산공제 3,000,000 제거 → 142,000,000 × 35% − 15,440,000) |
| P9 (일반 양도 일반건물, 토글 ON 1억) | 141,690,000 | **141,960,000** | 750,000 × 90%(장특 10%) × 40% = 270,000 |
| 지분 40% (CDP-2) | 96,460,000 | **96,580,000** | 매입분 차손 −10,300,000 → −10,000,000 → 300,000 × 40% = 120,000 |
| 함께 양도 컴패니언 (CDP-3, probe 고정) | 181,431,000 | **181,746,000** | 차손 −50,750,000 → −50,000,000 → 750,000 × 42% = 315,000 |

- 토글 OFF 값(156,620,000 등)과 증여분 카드 값은 불변이다. 사이드바 필요경비(P9 사례) 12,750,000 → 12,000,000.
