# 일반건물 부담부증여 × 이월과세 — 지분 분할 취득(축 B)·부담부증여 묶음에 §97의2②3호 비교 배선 (F27 후속) 계획서

> 작성 2026-10-24 · master 629b0a867 · 선행: `docs/00-pm/gb-bg-carryover-presumed-scenario-b.plan.md` §3.3·§10(PR-3 #2531이 이 두 경로를 ⑧+⑫로 차단하고 배선을 별도 계획으로 넘겼다)
> 상태: **계획 확정** — Q-1~Q-4 전부 권장안 a(2026-10-25 사용자 결정) · ✅ PR-0 #2545 · ✅ PR-1(묶음) #2550 — §10 · ✅ PR-2(지분) 구현 — §11

## 1. 현상 — 실측 (2026-10-24 · 폼 → ④ → route POST · mock 세율)

시료는 PR-3 anchor(`__tests__/api/transfer.route.gb-bg-carryover-bundled-block.anchor.test.ts`)의 `gbAsset`이다. 일반건물 · 부담부증여 K-5(환산) · 시가 10억 · 채무 5억 · 이월과세(증여 등기 2024-05-01 · 당초 증여자 취득 2015-01-01) · 양도 2026-03-01.
단건 대조: A 109,326,000 · B 97,800,000 → A 채택(F27). 증여세 3천만이면 A 104,646,000.

측정 방법: 일회성 probe(저장소에 남기지 않음)에서 ⑫ `refineGbBgCarryoverBundled`만 무력화하고, A 시나리오는 서버 안에서 만들었다. 지분 경로는 `calculateGeneralBuildingFractional` 입구에서 지분별로 `applyCarryoverDonorBasis` 치환과 취득일 3축 치환을 했다. 묶음 경로는 `buildGbCompanionItems` 입구에서 같은 치환을 했다.
⚠️ body에 `carryoverGiftTaxAmount`를 넣으면 Zod가 지운다(엔진 내부 필드). 그래서 A 변환은 반드시 Zod 뒤, 서버 안에서 해야 한다. 첫 probe가 body에 넣었다가 증여세가 반영되지 않는 것처럼 보였다(P4 첫 값).

### 1.1 지분 분할 50/50 — 지분별 A/B 조합의 신고 전체 결정세액

| # | 시료 | BB(현재 계산값) | AA | AB | BA | 순차 고정점 결과 |
|---|---|---|---|---|---|---|
| P1 | 같은 사실 50/50 | 97,800,000 | **109,326,000** | 93,186,350 | 93,186,350 | AA 109,326,000 (+11,526,000) |
| P3 | 당초 증여자 취득일 지분별 2015/2010 | 97,800,000 | **102,338,000** | 93,186,350 | 86,547,750 | AA 102,338,000 (+4,538,000) |
| P4 | 증여세 지분별 1,500만 | 97,800,000 | **104,646,000** | 90,963,350 | 90,963,350 | AA 104,646,000 |
| P2 | 둘째 지분만 이월과세(첫 지분은 증여) | 97,800,000 | — | — | 93,186,350 | B 유지 97,800,000 |

- **정합 확인**: P1의 AA는 단건 A와, BB는 단건 B와 1원까지 같다. P4의 AA는 단건 증여세 3천만의 A와 같다. ⇒ 「지분별 info 치환 + 취득일 치환」은 단건과 같은 계산이다.
- **비단조**: AB·BA가 AA·BB 모두보다 작다. 한 지분만 A가 되면 그 차익은 장기(누진)로, 다른 지분 차익은 단기(1년 10월 보유 → 단기세율)로 갈라진다. 그래서 「지분 하나씩 독립 비교」나 「전체 A vs 전체 B」로 바꾸면 결론이 달라질 수 있다. 확정 규약(§3)인 순차 고정점으로 풀면 P1·P3·P4 모두 AA다.
- **토지·건물 단위로 나눠도** 순차 고정점 결과는 P1·P3·P4 모두 AA로 같았다. 토지만 A(LL)는 98,810,540, 건물만 A(DD)는 87,562,160이었다(P1). 세 시료에서 같다는 것이지 일반적으로 같다는 증명은 아니다(Q-1).

### 1.2 부담부증여 묶음 (일반건물 + 토지 부담부증여, 계약 13억)

| # | 시료 | B(현재 계산값) | A | 결과 |
|---|---|---|---|---|
| Q1 | 일반건물 첫 자산 | 110,760,000 | **140,526,000** | A 채택 (+29,766,000) |
| Q2 | 토지 첫 자산 · 일반건물 둘째 | 110,760,000 | **140,526,000** | Q1과 같다(위치 무관) |
| Q3 | Q1 + 증여세 3천만 | 110,760,000 | 135,846,000 | 증여세 효과 −4,680,000 = 단건과 같다 |

차이가 단건(11,526,000)보다 크다. A로 바뀐 일반건물 차익이 토지 차익과 같은 누진 군에 합산되기 때문이다. 단건 비교로는 이 합산을 볼 수 없다는 신고단위 규약(§3)의 근거와 같은 현상이다.

### 1.3 현재 차단 상태와 ⑧↔⑫ 어긋남

- PR-3 이후 지분·묶음 × 일반건물 부담부증여 × 이월과세는 ⑧(`transfer-tax-validate-bg.ts:139-150` 1-a′)과 ⑫(`lib/api/transfer-tax-schema-donor-built.ts:286-306`)가 「단건으로 계산하세요」로 막는다.
- 🔴 **⑫ 구멍**: 둘째 지분만 이월과세(첫 지분은 증여)인 입력은 ⑧만 막고 ⑫는 통과한다. 최상위 `carryoverTaxation`은 첫 지분 것만 실리는데(`lib/calc/transfer-tax-api.ts:715`), 첫 지분이 이월과세가 아니면 아예 없다. API로 직접 보내면 200 · 97,800,000이 나오고 이월과세 입력은 조용히 사라진다. 이 시료는 B가 맞는 답이라 세액이 우연히 같지만, A가 큰 시료라면 과소다.

## 2. 원인

### 2.1 지분 — 지분별 이월과세 입력이 서버에 도달하지 않는다

- **폼은 지분별 구조다.** 지분은 `assets[]`의 AssetForm 하나씩이다. 지분마다 `acquisitionCause`·`carryover`(증여 등기일·당초 증여자 취득일·증여세…)·`bgCoDonor*`(당초 증여자 기준시가·실지취득가)를 가진다(`lib/stores/calc-wizard-asset-bg.ts:106-123`).
- **④가 버린다.** 지분 payload(`lib/calc/transfer-tax-api-gb-shares.ts:195`)와 Zod 지분 스키마(`lib/api/transfer-tax-building-share-schemas.ts:91-137`, `.strict()` 없음 → 모르는 키는 조용히 지워진다)에는 `carryoverTaxation` 슬롯이 없다. 최상위 `carryoverTaxation`은 첫 지분 것 하나다(`transfer-tax-api.ts:715`). probe에서 첫 지분의 `donorAcquisitionPrice`는 1억 × 50% = 5천만으로 실렸고, 둘째 지분의 당초 증여자 취득일(2010-01-01)은 body 어디에도 없었다.
  - 부담부증여는 일반 양도와 달리 valuation 안의 이월과세 경로도 막혀 있다(`lib/calc/transfer-tax-api-gb-carryover.ts:332`가 `{}`를 돌려준다). 이 분리는 K-18(§159와 §97의2의 중복 배선 회피)의 결과다.
- **서버 지분 경로에는 비교가 없다.** `general-building-fractional.ts`에는 carryover 처리가 없다. 지분별 `burdenedGiftInfo.carryoverDonorBasis`는 실려 오지만 읽히지 않는다. 그래서 결과는 항상 B다.
- **화면 막다른 길.** 둘째 지분부터는 ①·②를 숨기고 `BurdenedGiftTrancheBasisBlock`(81줄)만 보여 준다(`components/calc/transfer/CompanionAssetCard.tsx:143`·`:347`). 이 블록에는 당초 증여자 칸(`bgCoDonor*`)이 없다. 그 칸은 ② `BurdenedGiftBlock` 안의 `BurdenedGiftCarryoverBlock`(`BurdenedGiftBlock.tsx:507`)에만 있다. 그런데 ⑧은 이월과세 지분에 그 값을 요구한다(`transfer-tax-validate-bg.ts:180-183`). 지금은 PR-3 차단이 앞에서 막고 있어 드러나지 않을 뿐이다.

### 2.2 묶음 — 입력과 payload는 있는데 카드 빌더가 읽지 않는다

- 일반건물이 첫 자산이면 최상위 `carryoverTaxation`·`burdenedGiftInfo.carryoverDonorBasis`로 간다. 둘째 이후면 `companionAssets[i].carryoverTaxation`(`lib/calc/transfer-tax-api-companion-payload.ts:648`)·`companionAssets[i].burdenedGiftInfo`(`:503`)로 간다. Date 변환도 끝나 있다(`engine-input.ts:137-152`, `bundled-split-helpers.ts:419-433`).
- 둘 다 `buildGbCompanionItems`(`app/api/calc/transfer/general-building-part-cards.ts:266`)로 가는데, 입력 타입 `Pick<…>`(`:269-272`)에 `carryoverTaxation`이 없다. 그래서 info만 소비되고 결과는 항상 B다.
- 화면 입력 칸은 이미 있다. 묶음은 카드마다 ②가 렌더되고, `BurdenedGiftBlock`이 `bundled`일 때도 `BurdenedGiftCarryoverBlock`을 연다(`BurdenedGiftBlock.tsx:507`).

### 2.3 공통 — 집계 드라이버에 일반건물 부담부증여 단위가 보이지 않는다

신고단위 비교 드라이버(`calculateTransferTaxAggregate` → `resolveFilingUnitCarryoverScope`, `lib/tax-engine/transfer-tax-aggregate.ts:715-733`)는 단건 엔진이 `carryoverTaxationDetail.isEligible`을 낸 카드만 비교 단위로 삼는다. 부담부증여 일반건물은 A/B가 카드 조립 **전**(§159 안분 단계의 info 치환과 취득일 치환)에 갈리므로 카드에 `carryoverTaxation`이 없다. 그래서 드라이버가 이 단위를 볼 수 없다. F27이 route에서 계산 전체를 두 번 돌리는 이유와 같다.

대조 — **일반 양도 지분 × 이월과세는 정상이다**(형제 결함 아님). valuation의 `landCarryoverTaxation`이 지분율로 축소되어 카드의 `carryoverTaxation`이 되고(`transfer-tax-api-gb.ts:397,613` → `route-actual.ts:414-476` → `route-cards.ts:271-280`), 카드마다 드라이버가 비교한다. 세액은 `transfer.route.gb-share-carryover-scale.anchor.test.ts`가 고정한다.

## 3. 법령 · 확정 규약

- 「소득세법」 §97의2② 3호(현행 2026.7.1. 시행본 확인): 「제1항을 적용하여 계산한 양도소득 결정세액이 제1항을 적용하지 아니하고 계산한 양도소득 결정세액보다 적은 경우」 제1항을 적용하지 않는다.
- **비교 단위는 신고단위 결정세액(§92③2호)** 이다. 알고리즘은 `lib/tax-engine/transfer-tax-aggregate-carryover-scope.ts`의 순차 고정점이다. 전부 A에서 출발하고, 단위마다 「그 단위만 A / 그 단위만 B」로 집계를 두 번 돌려, A가 **적을 때만** B로 바꾼다(동률 A). 최대 2 pass. (`docs/00-pm/transfer-n1-carryover-filing-unit.plan.md`)
- ⛔ 2ⁿ 전수 탐색(조합 중 최댓값)과 `refCalculatedTax` 역안분은 금지다(재제안 금지 확정).
- 부담부증여 × 이월과세의 결합 근거(§88조1호 후단 · 소령 §159①1호 「법 제97조제1항제1호에 따른 가액」 = §97의2①1호가 치환하는 슬롯)는 F27이 이미 세웠다(`general-building-route-carryover.ts` 헤더 주석). 이번 계획은 새 법령 근거를 세우지 않는다.

## 4. 수정 설계

### 4.1 비교 단위 — 지분(또는 묶음 안의 일반건물 자산) 하나 = 단위 하나 (Q-1)

- 부담부증여에서는 §159가 info 단위로 취득가액을 정하므로, 단건 F27은 자산 전체(토지+건물)를 한 단위로 비교한다. 이번에도 지분 하나, 묶음 안의 일반건물 자산 하나를 단위로 삼는다.
- 대안(Q-1 b)은 토지·건물 카드를 각각 단위로 삼는 것이다. 일반 양도 일반건물은 카드 단위로 비교하고(소득세법 §94상 토지와 건물은 별개 자산), 같은 지분 안에서도 채택이 갈릴 수 있다. 다만 부담부증여에서는 info의 토지·건물 값을 한쪽만 치환하는 경로를 새로 만들어야 하고, F27 단건과도 달라진다. §1.1의 세 시료에서는 두 단위의 결과가 같았다.

### 4.2 비교 결합 — 집계 드라이버에 외부 단위를 등록한다

묶음에는 일반건물 부담부증여 단위(route가 A/B를 만든다)와 다른 자산의 이월과세 단위(단건 엔진이 A/B를 만든다)가 섞일 수 있다. 두 종류를 **한 번의 순차 고정점**으로 풀어야 규약과 같다.

- **(채택) 외부 단위 등록**: route가 단위마다 A 카드 세트와 B 카드 세트를 미리 만든다. 집계에 「단위 키 → {A 카드, B 카드}」를 넘기면, 집계의 `run(overrides)`가 배정에 따라 카드 구간을 갈아 끼운다. 단위 index는 그 단위 첫 카드의 위치로 잡는다. 이렇게 하면 `resolveFilingUnitCarryoverScope`를 수정 없이 같은 순서로 돌릴 수 있고, 호출 수도 기존과 같다.
- (기각) 바깥 순차 고정점이 `calculateBundledTransfer` 전체를 다시 돌리는 방식: 바깥 토글마다 안쪽 드라이버가 다른 자산 단위를 처음부터 다시 판정한다. 그러면 단위 순서가 자산 순서가 아니게 되어, 다른 이월과세 단위가 섞이면 규약과 결과가 달라질 수 있다. 호출 수도 곱으로 늘어난다.
- (기각) route가 드라이버를 직접 호출하는 방식: `filingUnitComparison` 병합 로직이 복제되어 어긋날 위험이 있다.
- 단건 F27은 이번에 옮기지 않는다(동작 변경 없음 · 회귀 위험만 있다). 단위가 1개면 (채택) 방식과 F27은 같은 비교다.
- `transfer-tax-aggregate.ts`가 745줄이라 공개 진입점(`:686-745`)을 먼저 분리한다(PR-0).

### 4.3 지분 — 지분마다 `carryoverTaxation`을 싣는다

- ④ `buildGeneralBuildingShares`(`transfer-tax-api-gb-shares.ts`)가 지분마다 `buildCarryoverPayload(asset, date, ratio)`로 `share.carryoverTaxation`을 싣는다. 첫 지분만 최상위를 정본으로 쓰는 감면(`reductions`) 선례는 따르지 않는다. 비대칭이 §1.3의 ⑫ 구멍을 만든 원인이다. 최상위 `carryoverTaxation`은 지분 모드에서 싣지 않는다(⑫가 거부).
- ⑫ 지분 스키마에 `carryoverTaxation`을 추가한다. 「이월과세 지분 ⇔ 그 지분 info의 `carryoverDonorBasis`」를 짝으로 강제한다.
- ⑭ Date 변환은 `engine-input.ts:137-152`·`bundled-split-helpers.ts:419-433`에 이미 두 벌 있다. 세 번째로 복사하지 않고 leaf로 추출해 셋이 같이 쓴다.
- 엔진: 지분 루프에서 A 카드를 만들 때 `share.burdenedGiftInfo`는 `applyCarryoverDonorBasis(info, ct.giftTaxAmount)`로 치환하고, 카드 취득일 인자(`buildingAcqDate`·`landAcqDate`, `general-building-fractional.ts:202-211`)는 `ct.donorAcquisitionDate`로 바꾼다. 치환은 지분 축소(`burdened-gift-valuation.ts:86-123`) 전에 100% 값에서 일어나므로 순서가 맞다. 판정(`judgeCarryoverEligibility`)과 fail-fast(`assertCarryoverDonorBasis`)는 F27과 같은 leaf를 쓴다.
- 증여세(`giftTaxAmount`)는 지분마다 자기 입력값을 그대로 쓴다(Q-2). 엔진은 §159 안분 단계(STEP 5.7)에서 그 지분의 채무 비율로 안분하고 한도를 적용한다. P4에서 지분별 1,500만 = 단건 3천만이 확인됐다.

### 4.4 지분 화면 — 둘째 지분부터 당초 증여자 칸

- 둘째 지분 이후의 `BurdenedGiftTrancheBasisBlock`에, 그 지분이 이월과세일 때 `BurdenedGiftCarryoverBlock`(158줄)을 재사용해 보여 준다. 표시 조건 계산(`coDonorNeedsStdPrice`, `BurdenedGiftBlock.tsx:195`)은 leaf로 추출해 두 블록이 같이 쓴다.
- ③ 이월과세 입력(`CarryoverGiftBlock`)은 이미 지분 카드마다 있다. ①②③ 새 필드는 필요 없다.
- ⑧ 둘째 지분의 `bgCoDonor*` 요구와 ⑤ 입력 칸이 같은 조건이어야 한다(막다른 길 금지 — ⑧↔⑤ 격자).

### 4.5 묶음

- `buildGbCompanionItems`의 입력 타입에 `carryoverTaxation`을 추가한다. 일반건물이 첫 자산이든 둘째 이후든 같은 함수에서 단위 A/B 카드 세트를 만든다.
- 다른 자산(토지·주택 부담부증여)의 이월과세는 지금처럼 단건 엔진이 A/B를 만든다. 집계 드라이버가 두 종류 단위를 한 번에 순차 고정점으로 푼다(§4.2).
- 함께 양도(일반 양도 + 부담부증여 혼합)는 지금처럼 차단한다(범위 밖).

### 4.6 결과 echo · 화면 (PR-4 #2535의 지분·묶음판)

- 단건용 `burdenedGiftCarryoverDetail`은 그대로 둔다(저장된 옛 결과 호환). 지분·묶음용으로 `burdenedGiftCarryoverUnits?: Record<단위 키, 같은 모양>`을 추가한다. 키는 카드 접미사(`cardSuffixOf`, `lib/tax-engine/general-building-share-id.ts`)와 같게 지분은 `0`·`1`…, 묶음은 자산 id로 잡는다. `shareBlockEcho`·`generalBuildingDetailsByAsset`와 같은 선례다.
- 단위별 비교 실적은 `filingUnitComparison`과 같은 뜻(그 단위에 적용 / 미적용일 때의 **신고 전체** 결정세액)으로 싣는다. 단건 카드의 「신고세액 = A·B 중 큰 금액」 문구는 여기서 쓰면 틀린다(P1에서 채택 결과는 개별 비교값 어느 쪽과도 다를 수 있다). 다건 카드 문구(`filingUnitComparison`)를 따른다.
- 단위별 [A]/[B] 파트 요약(취득가액·양도차익·기산일)은 **최종 배정**을 기준으로 「그 단위만 반대 시나리오」인 반사실 실행에서 만든다. 비교 시점의 값은 최종 배정과 다를 수 있다.
- `GbBurdenedGiftCarryoverCard`는 단위별로 반복해 렌더한다. 자리(`BundledAllocationCard.tsx:416`)는 지분·묶음 응답(`mode: "bundled"`)에도 이미 있다.
- 신고서·상세명세서 취득일 override(`gbCarryoverAcqDateOverride`, `FilingFormTableDateHelpers.ts:102-112`)는 pid의 접미사로 단위를 찾게 한다. 지금은 `baseCardId`로 접미사를 떼어 모든 지분에 같은 날짜를 쓴다(단위 echo가 없으면 단건 값으로 돌아간다).
- §159 명세(`burdenedGiftWholeInfo` → 「부담부증여 평가 명세」)의 취득 쪽 열은 지금 첫 자산 한 칸의 값이다(`transfer-tax-api.ts:662,670`). 채택된 시나리오의 단위별 명세를 합쳐 바꾼다(Q-4). 선례는 `withCardAcquisitions`(`lib/tax-engine/transfer-tax-aggregate-burdened-gift.ts:41`)다. 증여세(물건 전체 1회)는 A/B와 무관해 그대로 둔다.

### 4.7 차단 해제와 유지

- 해제: ⑧ 1-a′(`transfer-tax-validate-bg.ts:139-150`과 import `:53`) · 문구 상수 `GB_BG_CARRYOVER_BUNDLED_MESSAGE` · ⑫ `refineGbBgCarryoverBundled`(호출부 `transfer-tax-schema-required-refines.ts:16,395`). 경로별로 해당 PR에서 푼다(묶음 → PR-1, 지분 → PR-2).
- 테스트 반전: PR-3 anchor의 차단 7건(대조 5건은 유지) · `…donor-built.pipeline.anchor.test.ts` PL-5(`:186-230`) · `…donor-built.anchor.test.ts:260-276` · E2E GBBD-E6(`e2e/gb-bg-carryover-donor-built-114-2.spec.ts:192-210`) · 선행 계획서 §10에 해제 기록.
- **유지**: 당초 증여자 신축·증축 §114조의2의 지분·묶음 차단(PR-5c 범위 — `transfer-tax-building-share-schemas.ts:123-126` · `transfer-tax-validate-donor-built-bg.ts:21-29` 등). 이번 계획에서 열지 않는다.

## 5. 결정 (2026-10-25 확정 — 전부 a)

| Q | 질문 | 선택지 | 권장 |
|---|---|---|---|
| **Q-1** ✅a | 비교 단위 | a 지분(묶음은 일반건물 자산) 하나 = 단위 하나 / b 토지·건물 카드마다 단위 | **a** — 부담부증여는 §159가 info 단위로 취득가액을 정해 단건 F27도 자산 단위다. 같은 신고서 안에서 단건과 지분의 단위가 다르면 「같은 사실 50/50 = 단건」 등식(P1)이 깨질 수 있다. b는 토지·건물 한쪽만 치환하는 경로를 새로 만들어야 한다. §1.1 세 시료에서는 결과가 같았다 |
| **Q-2** ✅a | 지분별 증여세 | a 지분마다 자기 증여세를 그대로 쓴다(한 번의 증여로 여러 지분을 받았다면 나눠 입력하라고 안내) / b 같은 증여(같은 등기일·같은 당초 증여자 취득일) 지분이 둘 이상이면 증여세를 합계로 한 번만 받아 채무 비율로 나눈다 | **a** — 지분은 원래 서로 다른 날·다른 원인의 취득 단위다. b는 「같은 증여」 판정 규칙을 새로 정해야 한다. 이중 입력 가드는 V-2에서 확인 후 정한다 |
| **Q-3** ✅a | PR 단위 | a 경로별로 엔진·표시·차단 해제를 한 PR에(묶음 → 지분) / b 엔진 전부 → 화면 전부 → 마지막에 차단 해제 | **a** — 차단을 푸는 순간 결과 화면·신고서가 A를 보여야 한다. PR-4(#2535)에서 실측한 「보유 1년 10월 · 장특 22%」 자기모순이 다시 생기지 않는다. 묶음은 화면 입력이 이미 있어 먼저 끝낼 수 있다 |
| **Q-4** ✅a | 「부담부증여 평가 명세」 취득 열 | a 채택 시나리오의 단위별 명세 합으로 바꾼다 / b 지금처럼 첫 자산 값을 두고 안내 문구만 단다 | **a** — 결정세액은 A인데 명세는 B 값이면 화면끼리 어긋난다. 선례(`withCardAcquisitions`)가 있다 |

## 6. PR 계획 (Q 확정안 기준)

| PR | 내용 | 바뀌는 계산 |
|---|---|---|
| PR-0 | `transfer-tax-aggregate.ts` 공개 진입점 분리(745줄) · 집계에 외부 단위 API 추가(사용처 0 — 동작 불변) · Date 변환 leaf 추출(두 벌 → 하나) · 🔴 §1.3 ⑫ 구멍: 지분 모드에서 이월과세 지분이 하나라도 있으면 ⑫도 거부(⑧과 같은 문구 · 해제는 PR-2) | 없음(API 직접 호출의 둘째 지분 이월과세: 200 → 400) |
| PR-1 | 묶음: `buildGbCompanionItems` 단위 A/B 카드 세트 · 외부 단위 등록 · `burdenedGiftCarryoverUnits` echo · 결과 카드 단위별 렌더 · 신고서·상세명세서 날짜 키 · §159 명세 취득 열(Q-4 a) · ⑧⑫ 묶음 해제 · 테스트 반전 | Q1·Q2: 차단 → 140,526,000 |
| PR-2 | 지분: ④⑫⑭ `share.carryoverTaxation` · 지분 루프 A/B · 둘째 지분 당초 증여자 칸(⑤) · ⑧↔⑤ 격자 · ⑧⑫ 지분 해제 · 테스트 반전 | P1: 차단 → 109,326,000 · P3: 102,338,000 |

800줄: `DetailedStatementHelpers.ts`(732)·`transfer-tax-api.ts`(735)·`lib/tax-engine/types/transfer-aggregate.types.ts`(746, 타입 전용)를 건드리는 PR은 그 김에 분리한다.

## 7. 검증 계획

- anchor(수정 前 red · 後 green): §1.1 P1·P3·P4 AA, P2 B 유지, §1.2 Q1·Q2·Q3 A. **단건 등식**: 같은 사실 50/50 지분 = 단건 F27(A·B 모두).
- 묶음 혼재 단위: 일반건물 부담부증여 이월과세 + 토지 부담부증여 이월과세를 함께 둔 시료에서 외부 단위 방식의 결과가 「같은 단위 순서의 순차 고정점」 손계산과 같은지(V-6).
- 회귀: 단건 F27 109,326,000·104,646,000 불변 · 일반 양도 지분 × 이월과세(`transfer.route.gb-share-carryover-scale.anchor.test.ts`) 불변 · PR-3 대조 5건 불변.
- 뮤테이션: 출발점 B로 바꾸기 → P1 red · 「적은 경우」를 「이하」로 → 동률 시료 red · 지분 A 치환에서 취득일 누락 → P1 red · 외부 단위 index를 자산 순서와 다르게 → 혼재 시료 red.
- E2E: 묶음(일반건물 + 토지) 화면 입력 → 결과에 단위별 [A]/[B]·채택·신고서 취득일 2015-01-01 / 지분 50/50 → 둘째 지분 당초 증여자 칸 입력 → 계산. 375px 가로 스크롤 0.
- ⑧↔⑫ 격자: 지분(첫·둘째·전부 이월과세) × 묶음(첫·둘째) × K-5·K-7.

## 8. 확인 필요 (착수 전 또는 해당 PR 첫 단계에서 실측)

| V | 내용 | 시점 |
|---|---|---|
| V-1 | 지분 A 시나리오에서 `gateShareEvents`(증축·용도변경 전후 판정, `general-building-fractional.ts:203`)도 당초 증여자 취득일로 불러야 하는가. probe는 취득일 3축만 바꿨다 | PR-2 첫 단계 |
| V-2 | 같은 증여로 받은 두 지분에 같은 증여세를 두 번 입력하는 것을 ⑧이 막는가(지금 가드는 보이지 않는다). Q-2 a 확정 — 막지 않으면 안내 문구로 대신한다 | PR-2 첫 단계 |
| V-3 | 지분·묶음에서 `useEstimatedAcquisition=true` 이월과세는 엔진 `assertCarryoverDonorBasis`가 던진다. ⑧이 같은 문구로 먼저 막는가 | PR-1·PR-2 |
| V-4 | 비-일반건물 부담부증여 × 이월과세 컴패니언에서 §159 명세 취득 열이 지금 B 기준으로 남는가(코드상 그렇다, 실측 없음) | PR-1 |
| V-5 | `GeneralBuildingAcquisitionCards`에 `isNonPrimaryAsset`·`hasCompanions`가 전달되지 않는 것(`CompanionAcquisitionCauseSection.tsx:78-85`)이 이월과세 블록의 환산 방식 제한에 영향을 주는가 | PR-1 |
| V-6 | 외부 단위와 단건 엔진 단위가 섞일 때 단위 순서(카드 index 순)가 자산 입력 순서와 같은가 | PR-0 |

## 9. 범위 밖

- 당초 증여자 신축·증축 §114조의2의 지분·묶음 개방(PR-5c 차단 유지).
- 함께 양도(일반 양도 + 부담부증여 혼합) — 지금처럼 차단.
- 단건 F27을 외부 단위 방식으로 옮기기.
- 서버 PDF의 A/B 카드(단건도 PDF에 없다 — 선행 계획서 §11).
- 실측 probe는 일회성이었다(저장소에 남기지 않음).

## 10. PR-1 구현 기록 (2026-10-25) — 함께 부담부증여 묶음

- 카드 빌더 `buildGbCompanionItems`(`general-building-part-cards.ts`): 일반건물 부담부증여 × 이월과세(요건 충족)이면 B(`toTransferorBasisInfo`)·A(`applyCarryoverDonorBasis` + 토지·건물 기산일 = 당초 증여자 취득일) 카드 세트를 만들어 `GbBgCarryoverUnitDraft`로 넘긴다. 신고 카드 목록에는 B가 들어간다. 판정·fail-fast는 단건 F27과 같은 leaf다. 이월과세 배제(②1·2호·③)·이월과세 아님은 종전 그대로.
- route `bundled-route.ts` + `bundled-gb-carryover-units.ts`: B 구간을 카드 id로 찾아 외부 단위로 등록하고 `calculateTransferTaxAggregateWithUnits` 1회로 다른 자산 이월과세(단건 엔진 단위)와 함께 푼다. A·B 카드 id가 어긋나면 던진다. 같은 날 권리 재계산은 A 카드에도 같은 변환을 한다. echo `burdenedGiftCarryoverUnits`(키 = 자산 id) — A·B = 그 단위 적용/미적용의 신고 전체 결정세액, [A]/[B] 요약은 최종 배정의 반사실 실행에서. A 채택 자산은 결과 상세(산식 재료)도 A 카드 것으로 바꾼다.
- Q-4 a: 파트 카드에 자산 §159 명세(`gbAssetBurdenedGift`)를 싣고 `withCardAcquisitions`가 자산당 1회 센다. A 채택 자산이 있으면 명세 취득 열 = 자산별 명세 합 + 자산별 카드(「이월과세 적용(당초 증여자 기준)」). 첫 자산이 K-6/K-7 이월과세 일반건물이면 물건 전체 info를 양도인 기준으로 읽는다(수정 前 그 info로 400 — 「감정가액은 취득 당시 감정가액을 입력해야 합니다」).
- 화면: `GbBurdenedGiftCarryoverCard`를 자산마다 렌더(`assetLabel` — 「✓ 채택」·「신고 전체 금액」, 「신고세액 = 큰 금액」 문구 없음). 신고서·상세명세서 취득일 override(`gbCarryoverAcqDateOverride`)는 카드 접미사로 단위를 찾는다.
- 차단 해제: ⑧ 1-a′는 축 B만 · ⑫는 지분과 `fractionalSplitBundle` 묶음만. donorBuilt 묶음 차단(PR-5c)은 그대로 — 카드 빌더도 던진다.
- 타입 분리: `transfer-aggregate.types.ts` 746 → 719줄(타입 전용)(일반건물 echo 타입을 `transfer-aggregate-gb.types.ts`로 · 종전 경로 re-export).
- 실측(anchor `transfer.route.gb-bg-carryover-bundled.anchor.test.ts` 10건): Q1 140,526,000 · Q2 140,526,000(키 `a2`) · Q3 135,846,000 — §1.2와 1원까지 같다. K-7 A 113,226,000 / B 91,960,000. ②3호 B 채택(당초 증여자 기준시가 = 양도인) A 51,965,120 < B 110,760,000 ⇒ 110,760,000. 혼재(토지 이월과세 + 일반건물 이월과세) 153,006,000. 명세 취득 열 토지 62,500,000 · 건물 50,000,000(Q1·Q2 같음 — 종전에는 첫 자산 방식이라 212,727,272 / 50,000,000으로 위치마다 달랐다). 이월과세 아님 110,760,000·명세 종전 그대로.
- 뮤테이션 11/11 KILLED(M7 「미채택 [A] 요약을 최종 결과에서」가 처음 살아 B 채택 시료에 [A] 요약 단언을 추가). E2E `gb-bg-carryover-bundled.spec.ts` 2건(결과 카드·신고서 2015-01-01·명세 자산별 카드 · 375px 가로 스크롤 0) + 회귀(단건 GBPB·donorBuilt GBBD) 통과.
- V-3 ✅ 묶음 × 이월과세 환산 토글은 ⑧이 단건과 같은 문구로 먼저 막는다. V-5 ✅ 묶음에서 `isNonPrimaryAsset`이 바꾸는 분기(C 토글·환산 패널·증여자 신축 토글)는 부담부증여에서 이미 꺼지거나 ⑧·`BurdenedGiftBlock`이 맡는다(코드 확인 + E2E). V-4 🟡 비-일반건물(토지) 부담부증여 × 이월과세만 있는 묶음은 명세가 여전히 물건 전체 재계산(첫 자산 방식) 값이다 — 이번 트리거는 일반건물 단위의 A 채택이다. 확인 필요(별건).
- 별건(확인 필요): 묶음의 토지 부담부증여 × 이월과세가 B로 채택되면 결과의 그 카드 `acquisitionPrice` 표시가 이월과세 「증여일 평가액」 입력값이다(300,000,000 · 1,000,000,000으로 바꾸면 그대로 따라온다). 결정세액은 두 값에서 같았다(137,800,000) — 세액 축이 아니라 표시 echo로 보인다. 일반건물 경로와 무관(이번 변경 전에도 같은 경로).

## 11. PR-2 구현 기록 (2026-10-25) — 지분 분할 취득(축 B)

- **V-1 ✅ (결정)**: A 시나리오의 물건 사건 前/後 판정(`gateShareEvents`)도 당초 증여자 취득일로 한다. 보유기간이 그날부터라(§95④ 단서) 그 뒤 사건은 보유 중 사건이다. 실측(첫 지분 2019 증여 · 둘째 지분 2024 증여 · 당초 증여자 2015 취득 · 2020-06-01 주택→상가 용도변경): 용도변경이 둘째 지분 A에만 걸려 A 84,196,150 → 96,135,000(지분 날짜로 판정하면 용도변경이 빠진다 — 뮤테이션 M1 KILLED). 🟡 확인 필요: 「용도변경 당시 다주택」(`gbWasMultiHouseAtConversion`)은 물건 단위 입력 하나다 — A에서는 용도변경 당시 소유자가 당초 증여자라 그 세대의 사실이어야 하는지 근거(해석례) 미확보.
- **V-2 ✅ (실측)**: 같은 증여로 받은 두 지분에 같은 증여세를 두 번 넣는 것을 ⑧이 막지 않는다(가드 없음 — `transfer-tax-validate-carryover-asset.ts`는 음수만 본다). Q-2 a대로 지분마다 자기 입력값을 쓴다(P4: 지분별 1,500만 = 단건 3천만). 안내 문구는 달지 않았다 — 아래 별건 때문에 일반건물 부담부증여 화면에서는 이 값이 엔진에 닿지 않는다.
- 🔴 **별건(확인 필요 · 이번 범위 밖)**: 일반건물 부담부증여 × 이월과세에서 화면은 증여세를 「증여세 산출세액·과세가액」(`CarryoverGiftBlock`의 일반건물 분기)으로만 받는데, 부담부증여 경로(④ `buildCarryoverPayload` → §159)는 `giftTaxAmount`(증여세 상당액)만 읽는다. 단건 실측: 산출세액 3천만·과세가액 10억을 넣어도 `carryoverTaxation.giftTaxAmount = 0` · 결정세액 109,326,000(증여세 0과 같다) — `giftTaxAmount` 3천만이면 104,646,000. 단건 F27·묶음 PR-1·지분 PR-2 모두 같은 경로다. 산출세액·과세가액을 §159 경로의 증여세 상당액으로 바꾸는 규칙(영 §163의2② 안분 분자)이 필요하다 — 별도 계획.
- ④ `buildGeneralBuildingShares`: 부담부증여 지분마다 `carryoverTaxation`(최상위와 같은 leaf `buildCarryoverPayload` · 금액 3칸 × 지분율 · 증여세 미스케일). 최상위 `carryoverTaxation`은 부담부증여 지분 모드에서 보내지 않는다(`transfer-tax-api.ts`).
- ⑫ 지분 스키마 `carryoverTaxation`(엔진 shape · donorBuilt 거부) + 짝 강제(이월과세 ⇔ `burdenedGiftInfo.carryoverDonorBasis` · 부담부증여 아닌 지분의 이월과세 거부). `refineGbBgCarryoverBundled`는 지분 차단을 풀고 「지분 배열 + 최상위 이월과세」·`fractionalSplitBundle` 컴패니언 일반건물만 막는다. ⑭ 날짜는 PR-0 leaf(`toEngineCarryoverTaxation`)를 세 번째로 쓴다.
- route `general-building-fractional.ts`: 요건 충족 지분은 B(`toTransferorBasisInfo`)·A(`applyCarryoverDonorBasis` + 토지·건물 기산일·사건 판정일 = 당초 증여자 취득일) 카드 세트를 만들어 외부 단위(키 = 지분 index = 카드 접미사)로 등록하고 `calculateTransferTaxAggregateWithUnits` 1회로 푼다. 안분 표·산식 재료(`assetCards`)·swap 표시는 채택된 시나리오 카드로 다시 모은다. echo `burdenedGiftCarryoverUnits`(PR-1 helper 재사용 — 결과 카드·신고서 취득일은 코드 변경 없이 지분 키를 읽는다). 첫 지분이 단위면 물건 전체 info를 양도인 기준으로 읽는다(묶음 PR-1과 같다).
- Q-4 a: 단위가 하나라도 있으면 전 지분 카드에 지분 §159 명세(`gbAssetBurdenedGift`)를 싣는다 — A가 채택되면 명세 취득 열 = 지분별 합(P1 토지 12,500,000 · 건물 50,000,000 = 단건 명세).
- ⑤ 둘째 지분부터 `BurdenedGiftTrancheBasisBlock`이 이월과세 지분이면 `BurdenedGiftCarryoverBlock`(당초 증여자 값)을 연다 · 그 지분의 양도인 매매사례가액·감정가액 칸은 열지 않는다(B는 증여일 평가액). 표시 조건은 leaf `bgCoDonorNeedsStdPrice`(`burdened-gift-acq-std-price.ts`)로 ② 박스·⑧ `missingCoDonorBasisLabel`과 공유.
- ⑧ 1-a′(축 B 일반건물 이월과세 차단) 삭제 — 일반건물이 첫 자산인 축 B는 항상 지분 배열로 간다(`buildGeneralBuildingShares`와 같은 술어).
- 실측(anchor `transfer.route.gb-bg-carryover-share.anchor.test.ts` 14건 — §1.1과 1원까지 같다): P1 AA 109,326,000(AB·BA 93,186,350) = 단건 A · BB 97,800,000 = 단건 B · P3 102,338,000(첫 지분만 B 86,547,750) · P4 104,646,000 · P2 B 유지 97,800,000(단위는 둘째 지분 하나 · A 93,186,350) · K-7 82,627,700 = 단건 K-7(B 71,232,625) · ②3호 B 채택(당초 증여자 기준시가 = 양도인) A 56,286,880 < B 97,800,000.
- 🟡 기존 한계(확인 필요 · 변경 없음): 축 B는 K-6/K-7의 양도인 쪽 증여일 평가액(`bgActual*`)을 첫 지분 값으로 병합한다(`mergePrimaryBasic`). 지분마다 증여일이 다르면 증여일 평가액도 다를 수 있다.
- 테스트 반전: PR-3 차단 anchor 5건 → 「⑧ 통과 · 200 · 지분마다 이월과세」 + ⑫ 남은 거부 1건 · PL-5 지분 케이스(토글 ON만 ⑧ · 지분 info·지분 이월과세 두 경로의 donorBuilt를 ⑫가 거부) · E2E GBBD-E6(토글만 막고 끄면 계산 · 카드 1장).
- 뮤테이션 15/15 KILLED(엔진·⑫·④·⑧ leaf 14 + 화면 박스 미렌더 1 — E2E). E2E `gb-bg-carryover-share.spec.ts` 2건(둘째 지분 당초 증여자 칸 화면 입력 → 카드 2장·109,326,000·신고서 2015-01-01 · 375px 입력 화면·결과 화면 가로 스크롤 0) + 관련 기존 E2E 35건(반전한 GBBD-E6 포함) 통과 · 관련 vitest(`__tests__/api·calc·components·tax-engine·lib`) 40,848건 통과.
