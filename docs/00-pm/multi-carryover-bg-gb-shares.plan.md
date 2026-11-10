# 연간 합산(다건) — 이월과세 · 부담부증여 · 일반건물 지분 분할 취득 지원 계획서

> 작성 2026-11-09 · 상태: **계획(Do 전 · 사용자 결정 Q 대기)**
> 선행: `docs/00-pm/multi-building-valuation-support.plan.md`(트랙 C 상업용 · 트랙 G 일반건물 — 머지 완료).
> 모든 수치는 master `c6c6bbe43` 기준 throwaway probe 실측. 미검증은 「확인 필요」(V-n)로 둔다.

## 1. 현재 — 세 조합 모두 ⑧·⑫에서 막힌다

| 조합 | ⑧ 화면 차단 | ⑫ 서버 거부 키 |
|---|---|---|
| 배우자등 이월과세(§97의2) | `lib/calc/multi-transfer-tax-validate.ts:157` | `lib/api/transfer-tax-schema-multi-refines.ts:44-55` — `carryoverTaxation` · `acquisitionCause = carryover_gift` · 파트 이월과세 3키 |
| 부담부증여(소령 §159) | 같은 파일 `:130` | 같은 파일 `:46-57` — `acquisitionCause`·`transferType = burdened_gift` · `burdenedGiftInfo` · `burdenedGiftWholeInfo` |
| 일반건물 지분 분할 취득 | 같은 파일 `:196`(한 건에 자산 2개 이상 → 「한 건 내 다자산」 문구) | 같은 파일 `:72` — `generalBuildingShares` |

단건 route의 경로(`app/api/calc/transfer/route.ts`):
- 이월과세·부담부증여(주택·토지 등) — 기본 단건 경로(5-b). 엔진 안 단계가 처리한다(이월과세 A/B 비교 · STEP 0.48 §159). 엔진 입력은 `engine-input.ts:131`(`toEngineCarryoverTaxation`) · `:481`(`burdenedGiftInfo`).
- 이월과세 × 당초 증여 때 인수한 채무 부분(매입분) — 전용 경로 `carryover-debt-route.ts`(5-a-4).
- 일반건물 지분 분할 — 전용 경로 `calculateGeneralBuildingFractional`(`general-building-fractional.ts:133`). 지분마다 토지·건물 카드를 만들어 합산 엔진을 1회 부른다.

## 2. 실측 — 합산 엔진은 세 조합을 이미 계산한다

방법: 단건 route가 엔진에 넘긴 입력(또는 카드 목록)을 캡처해 **그대로** `calculateTransferTaxAggregate(WithUnits)`에 넣었다 — 「④⑫⑭가 단건과 같은 입력을 옮기면 단건과 같은 세액인가」. 함께 넣은 아파트: 2018 취득 6억 → 2024-09-01 양도 9억(단건 87,373,000).

| 조합 | 단건 | 합산 엔진 단독 | 아파트와 함께 |
|---|---|---|---|
| 이월과세 — 배우자 증여 주택(증여 2021-06-01 · 증여자 취득 2005 · 양도 10억) | 155,166,000 · 시나리오 A | **155,166,000 · A** | 275,319,000 · 양도차익 600,000,000 그대로 · 신고단위 비교 작동(적용 250,290,000 vs 미적용 231,810,000 → A) |
| 부담부증여 — 주택(시가 10억 · 채무 3억 · 실지취득 4억) | 31,949,500 · §159 명세 있음 | **31,949,500** · §159 명세 **없음** | 143,550,000 · 양도차익 180,000,000 그대로 |
| 일반건물 지분 분할 — 60%(2009) · 40%(2015) · 환산 | 96,789,704(카드 4장) | **96,789,704** | 213,654,936 · 카드 4장 양도차익 그대로(148,200,000 ×2 · 48,200,000 ×2) |

**결론** — 세액 축의 장벽은 엔진이 아니라 **배관(④·⑫·⑭)과 ⑧**이다. 다만 아래 세 가지는 배관만으로 끝나지 않는다.

1. **부담부증여 §159·증여세 명세가 합산 결과에 없다.** 합산 엔진의 명세는 「묶음 전체 1회」(`buildBundleBurdenedGiftWhole` — `burdenedGiftWholeInfo` 전제, 함께 양도·축 B용)다. 연간 합산은 자산마다 **다른 증여**라 자산별 명세가 필요하다. 자산별 결과(`PerPropertyBreakdown`)에는 지금 명세를 싣지 않는다(이월과세 상세는 싣는다 — `transfer-tax-aggregate-pickers.ts:49`).
2. **일반건물 지분 카드 id가 연간 합산 규약과 충돌한다.** 지분 경로 카드 id 접미사는 **지분 번호**(`land#0`·`land#1`)다. 트랙 G 연간 합산은 같은 자리에 **자산 id**(`land#<자산id>`)를 쓰고 결과 묶음·폼 조회가 그 접미사를 읽는다(`cardSuffixOf` — `lib/tax-engine/general-building-share-id.ts:68`).
3. **이월과세 비교 단위가 커진다.** 연간 합산은 확정신고 1건이라 §97의2②3호 비교가 그 해 전체 결정세액으로 한다(memory `project_transfer_carryover_filing_unit_scope` — 순차 고정점 · 2ⁿ 전수 탐색 금지). 엔진은 이미 그렇게 계산했다(위 표). 단건(자산 1건 비교)과 **결과가 갈릴 수 있는 것이 정상**이다 — 화면은 `filingUnitComparison`으로 근거를 보여 줘야 한다.

## 3. 트랙과 작업

### 트랙 CO — 이월과세 (PR-1)

- ④ `lib/calc/multi-transfer-tax-api.ts` — 단건 공용 leaf `buildCarryoverPayload`(+`withDonorBuilt` — `transfer-tax-api.ts:732-734`)를 그대로 부른다.
- ⑫ `transfer-tax-schema-multi-refines.ts:44-47` 거부 해제(`carryoverTaxation`·`carryover_gift`). 파트 이월과세 3키(`:53-55`)는 **계속 거부**(범위 밖 — V-CO3).
- ⑭ `multi/route.ts` — `toEngineCarryoverTaxation`(단건 `engine-input.ts:131`과 같은 함수 · Date 변환).
- ⑧ `:157` 해제. 단, 채무 인수분(매입분)이 있는 이월과세는 전용 경로라 **계속 차단**(V-CO2).
- ⑦ 자산 행 펼침에 시나리오 A/B 근거 — `MultiTransferPropertyBreakdown.tsx:86`이 `carryoverTaxationDetail`을 넘기지만 A/B 카드를 실제로 그리는지는 **확인 필요**(V-CO5).

### 트랙 BG — 부담부증여 (PR-2)

- ④ 단건 공용 leaf `buildBurdenedGiftInfo` + `transferType`. 축 B 전용 `burdenedGiftWholeInfo`는 보내지 않는다(연간 합산 자산은 각자 다른 증여).
- ⑫ `:46-57` 거부 해제(`burdenedGiftWholeInfo`는 계속 거부).
- ⑭ `burdenedGiftInfo`(단건 `engine-input.ts:481`과 같은 매핑).
- ⑦ 자산별 §159·증여세 명세 — 엔진 pickers에 자산별 명세 echo를 더하고 자산 행 펼침에 단건과 같은 카드(Q-3).
- 일반건물 부담부증여는 트랙 G 펼침(`multi-gb-expansion.ts`)이 `burdenedGift`를 넘겨야 한다 — 단건 `route.ts:337-347`. **확인 필요**(V-BG2).

**구현 결과(트랙 BG · 2026-11-10)** — anchor `__tests__/calc/multi-burdened-gift-parity.anchor.test.ts`.
- ④는 단건과 같은 세 키를 싣는다: `transferType`, `burdenedGiftInfo`(`buildBurdenedGiftInfo`), 양도가액 placeholder. placeholder는 인수 채무 합계(`burdenedGiftAssumedDebtOf`)이고, 다건은 종전에 0을 보냈다. 실측에서 단건 본문과 다른 키는 이 셋뿐이었다.
- 단건 = 연간 합산 1건:
  - 주택(시가 10억 · 채무 3억 · 실지 4억): 38,879,500
  - 토지(감정가액): 2,591,556
  - 일반건물(실지): 47,245,000
  - 주택 × 이월과세: 47,746,600
- 아파트와 함께: 주택 151,470,000 · 일반건물 160,446,000. 부담부증여 자산의 양도차익은 그대로다.
- ⑦ 자산별 §159·증여세 명세(Q-3 a):
  - 엔진 echo `PerPropertyBreakdown.transferBurdenedGiftBreakdown`을 자산 행 펼침의 `BurdenedGiftDetailCard`가 그린다.
  - 일반건물은 다건 펼침이 카드의 자산 명세(`gbAssetBurdenedGift`)를 `generalBuildingDetailsByAsset[자산].burdenedGiftBreakdown`에 1회 옮긴다. 카드에는 싣지 않는다.
  - 두 경로 모두 단건 명세와 같은 값이다.
- **V-BG1 해소**: `burdenedGiftWholeInfo`(축 B·함께 양도)가 있으면 자산별 echo를 싣지 않는다. 물건 전체 1건(`burdenedGift`)과 같은 자리에 겹치지 않는다. 연간 합산 ⑫는 이 키를 거부한다.
- **V-BG2 해소**: 트랙 G 펼침(`buildGbCompanionItems`)이 엔진 입력의 `transferType`·`burdenedGiftInfo`를 그대로 읽어 세액이 같았다.
  - 단, **일반건물 부담부증여 × 이월과세**는 카드 세트 A·B 비교 단위(`onCarryoverUnit`)를 펼침이 받지 않아 카드 빌더가 멈춘다(단건 71,321,800 · 다건 예외).
  - 그래서 ⑧·⑫에서 같은 문구로 계속 막는다(별건).

### 트랙 GS — 일반건물 지분 분할 취득 (PR-3)

- ④ 단건 공용 leaf `buildGeneralBuildingShares`(`lib/calc/transfer-tax-api-gb-shares.ts:250`).
- ⑧ `:196` 「한 건 내 다자산」 차단에서 **일반건물 전 지분 묶음**(`isFullFractionalBundle`)만 뺀다. 다른 물건 묶음(함께 양도)은 계속 차단.
- ⑫ `:72` 거부 해제.
- ⑭ 지분 카드 빌더를 `calculateGeneralBuildingFractional`에서 카드 목록 함수로 꺼내 트랙 G 펼침처럼 끼운다(예정신고 단위 = 그 물건의 전 지분 카드 · 이월과세 외부 단위 `externalUnits` 위치 이동).
- 카드 id 규약 — Q-2.

**V-GS1 조사(2026-11-10)** — 꼬리를 읽는 곳은 두 계열이다(모두 `general-building-share-id.ts` 정본 함수를 거치거나 `#` 뒤를 직접 자른다).

| 계열 | 읽는 곳 |
|---|---|
| 지분 번호 | `shareIndexOf` 3곳 · `isSameShare` 5곳(전부 자산 상세의 `assetCards` 안에서 짝을 찾는다) · 사이드바 `#${i}` 조립 1곳 · 지분 echo 키(`shareBlockEcho`·`shareFormulaEcho`·`shareActualExpenseEcho`) |
| 자산 id | `cardSuffixOf` 11곳 · 연간 합산 행 묶기 `multiFormPropertyIdOf` 2곳 |
| 둘 다 시도 | `assetOfCardSuffix` · `pre-deemed-purchase-filing-note.ts` · `cardBg`(직접 자름) |

- (b)는 두 지분 카드가 같은 id(`land#p1`)가 된다. 그래서 `isSameShare`가 지분을 가리지 못하고, 카드를 id로 찾는 곳(`transfer-tax-aggregate-debt-units.ts:76` 등)과 React key가 겹친다.
- ✅ **결정(2026-11-10 사용자): Q-2 a.**

**구현 결과(트랙 GS · 2026-11-10)** — anchor `__tests__/calc/multi-gb-shares-parity.anchor.test.ts`.
- 정본 함수: 복합 접미사 `<자산id>.<지분번호>`(`shareCardSuffix`)를 읽는다. `cardSuffixOf`는 점 앞, `shareIndexOf`는 점 뒤를 돌려준다. 단건 축 B·함께 양도는 점이 없어 종전 그대로다.
- ⑭: 단건 지분 경로에서 세 함수를 꺼냈다. 지분 조각 `buildSharePiece`, 지분 양도가액 `shareTransferPrices`, 결과 상세 조립 `assembleShareDetail`이다. 다건 펼침이 같은 함수로 지분 카드를 만들고, 자산 상세(`generalBuildingDetailsByAsset[자산]`)에 지분 echo를 싣는다.
- ④는 단건과 같은 빌더(`buildGeneralBuildingShares`)를 쓴다. ⑧은 「한 건 내 다자산」에서 일반건물 전 지분 묶음만 뺀다. 둘째 지분부터도 같은 차단 규칙을 지분마다 적용한다.
- ⑦ 자산 블록 뷰에 지분별 블록(`shareBlockViews` — 단건 축 B와 같은 조립)을 붙였다. 명세서 산식은 지분 양도가액·개산공제 base를 쓴다. 폼 조회(`multiFormAssetOf`)는 그 지분의 자산을 읽는다(종전 `assets[0]`).
- 단건 = 연간 합산:
  - 지분 분할: 132,951,280
  - 지분 × 이월과세: 지분 전체 182,393,200 · 건물만 157,672,240
  - 아파트와 함께: 251,993,544
- **V-GS2**: 지분 × 부담부증여는 펼침이 지분 §159 정보를 넘기지 않아 일반 양도로 계산된다. 그래서 ⑧·⑫에서 같은 문구로 계속 막는다(단건 59,564,296 · 별건). 지분 × 이월과세(부담부증여 아님)는 단건과 같아 연다.

### 트랙 GS-BG — 일반건물 지분 분할 × 부담부증여 (PR-4 · 2026-11-10 사용자 「1번 진행해」)

- 원인(실측): ④는 이미 지분마다 §159 정보(채무 지분 안분)를 보낸다(`buildGeneralBuildingShares` — 단건과 같은 빌더). ⑭ 펼침(`multi-gb-expansion.ts`)이 `buildSharePiece`에 `burdened`·지분 info를 넘기지 않아 버렸다.
- 작업:
  - ⑭ 펼침 — 단건 `calculateGeneralBuildingFractional`의 B 시나리오와 같은 인자(`burdened = { date }` · 지분 info · `carryoverApplied: false`).
  - 결과 명세 — 단건 축 B 집계(`transfer-tax-aggregate-once.ts`)와 같은 두 함수(`buildBundleBurdenedGiftWhole` → `withCardAcquisitions`)로 물건 전체 §159·증여세를 1회 만들어 자산 상세 `burdenedGiftBreakdown`에 싣는다.
  - ④ `burdenedGiftWholeInfo` — 단건 축 B ④와 같은 leaf·인자. ⑫는 「부담부증여 + 지분 2개 이상」일 때만 받는다(그 밖은 종전대로 거부).
  - ⑧·⑫ — 지분 × 부담부증여 차단을 풀고 **부담부증여 × 이월과세 지분만** 막는다(`MULTI_GB_BG_CARRYOVER_UNSUPPORTED_MESSAGE` 같은 문구). ⑧은 첫 자산 표지 + 전 지분 `carryoverEventForm`(④가 첫 자산 표지로 전 지분에 `carryoverTaxation`을 싣기 때문 — 지분 단독 검사로는 안 잡힌다 · GS-6b가 뮤테이션으로 고정).
  - 형제 결함(실측): 연간 합산 일반건물 부담부증여 × 양도인 본인 신축 §114조의2 — 가산세(6,250,000)·총납부(71,655,100)는 단건과 같았지만 «확인 필요» 고지(`GB_BG_SELF_BUILT_NOTICE`)가 없었다(트랙 BG #3119 경로·지분 경로 공통). 다건 route가 단건 GB 경로와 같은 조건으로 싣는다(MG-9).
- 단건 = 연간 합산(실측):
  - 지분 × 부담부증여: 59,564,296 · 카드 양도차익 79,200,000 ×2 · 52,800,000 ×2 · 물건 전체 명세(채무 3억·증여세 130,950,000) JSON 동일
  - 아파트와 함께: 지분 카드 양도차익 그대로
- 계속 막는 것: 지분 × 부담부증여 × 이월과세(지분별 A·B 비교 단위 — 별건 「GB 부담부증여 × 이월과세」와 같은 축) → 트랙 GB-BG-CO에서 해소.

### 트랙 GB-BG-CO — 일반건물 부담부증여 × 이월과세(지분 포함) (PR-5 · 2026-11-10 사용자 「1번 진행해」)

- 원인(실측): 단건 F27·단건 지분 경로·함께 부담부증여 묶음은 카드 세트 A·B를 집계 외부 비교 단위로 넘긴다(`calculateTransferTaxAggregateWithUnits`). 연간 합산 route는 그 함수를 부르지 않고, 펼침이 비교 단위 수신처(`onCarryoverUnit`)를 넘기지 않아 카드 빌더가 던졌다.
- 작업:
  - ⑭ 펼침(`multi-gb-expansion.ts`) — 일반건물은 `buildGbCompanionItems`에 `onCarryoverUnit`을 넘긴다(묶음과 같은 재료). 지분은 단건 지분 경로에서 뽑은 `buildShareScenarioPieces`(무동작 추출)로 지분별 A·B 조각을 만든다. 비교 단위 키 = 자산 id · 지분은 복합 접미사(`p1.1`).
  - ⑭ route — 1차·최종 집계를 `calculateTransferTaxAggregateWithUnits`로 부른다(연간 합산 = 그 해 전체 결정세액 비교 · 다른 자산 이월과세와 한 번의 순차 고정점). A 카드는 같은 자리 B 카드의 가산세 입력(예정신고 세액 주입 뒤)을 받는다. `attachGbCarryoverUnits`로 [A]/[B] 명세를 싣고, A 채택 자산은 결과 상세·§159 명세를 A 것으로 바꾼다(지분은 채택 조각으로 다시 조립 — `finalizeShareDetails`).
  - 예정신고 세액(가산세 base) — `gbPreliminaryUnits`가 그 물건 안에서 A·B를 비교한다(물건 1건 신고 = 단건 F27·지분 경로와 같은 비교 범위 · V-CO1의 일반건물 축).
  - ④ 결함(실측): 첫 지분이 이월과세면 다건 ④가 최상위 `carryoverTaxation`을 함께 실어 공용 ⑫가 400(「지분마다 보냅니다」)이었다 — 단건 ④와 같은 예외(부담부증여 지분 분할이면 최상위 생략)를 둔다.
  - ⑧·⑫ — 차단을 풀고 **당초 증여자 신축·증축(§114조의2)만** 막는다(`MULTI_GB_BG_DONOR_BUILT_UNSUPPORTED_MESSAGE` · ⑧ `donorBuiltBgActive` · ⑫ `burdenedGiftInfo.carryoverDonorBasis.donorBuilt` × 일반건물). 펼침 카드 함수가 그 입력을 받지 않는다(단건 F27만 계산). 지분은 지분 스키마가 이미 거부한다.
  - ⑦ — 연간 합산 일반건물 결과 행에 자산별 [A]/[B] 비교 카드(`GbBurdenedGiftCarryoverCard` 자산별 모드 — 신고 전체 A·B). 신고서·명세서 취득일 echo는 `#` 뒤 접미사 전체로 단위를 찾는다(복합 접미사).
- 단건 = 연간 합산(실측):
  - 일반건물(BG-6): B 채택 71,321,800(A 50,132,000 · B 64,838,000 결정세액) · A 채택 88,752,400(A 80,684,000) · §159 명세 JSON 동일 · 무신고 가산세(A 채택) 단건과 같음
  - 아파트와 함께: 168,900,000 결정세액(B · A 153,420,000) — 연간 비교 단위
  - 지분(GS-6b): B 채택 64,861,192 · A 채택 68,061,400(A 61,874,000 · B 58,964,720) · 지분 상세 전체·물건 전체 명세 단건과 같음
  - 지분 K-7 50/50(첫 지분 이월과세): 82,627,700 · 단위별 채택 단건과 같음 · 물건 전체 명세 같음
- 뮤테이션: 11건 중 10건 검출. 생존 1건(M8 — 첫 지분 이월과세면 물건 전체 info를 양도인 기준으로 읽기)은 `withCardAcquisitions`가 취득 열을 카드 합으로 덮어 K-4·K-7 시료에서 결과가 같다(단건 지분 경로와 같은 줄을 유지).
- 계속 막는 것: 당초 증여자 신축·증축 가산세(§114조의2) — 단건만.

### 트랙 CO-DEBT — 이월과세 × 당초 증여 때 인수한 채무 부분(매입분) (PR-6 · 2026-11-10 사용자 「2번 진행해」 · V-CO2)

- 원인(실측): 연간 합산 집계는 #3140부터 `calculateTransferTaxAggregateWithUnits`를 부르고, 그 함수가 채무 카드를 증여분·매입분으로 나눈다(`deriveCarryoverDebtUnits`). 막힌 곳은 **자산 단독 계산 두 곳**뿐이었다 — 예정신고 세액(`computePreliminaryFilingTaxes`)과 같은 날 권리 고지 판정이 단건 엔진을 직접 불러 채무 키에서 멈췄다(엔진 가드 「신고 단위 집계 경로에서만」).
- 작업:
  - ⑭ `multi-carryover-debt-units.ts` — 채무 인수분 자산의 단독 계산을 단건 route(`carryover-debt-route.ts`)와 같은 카드 1장짜리 신고 단위 집계로 한다(예정신고 단위 · 같은 날 권리 판정 어댑터). 일반건물 카드는 물건 단위가 이미 계산하므로 제외한다.
  - 엔진 `applyDebtUnits` — 매입분 꼬리 카드가 부모의 자산-수준 가산세 입력을 복사해 **가산세가 두 번** 부과됐다. 꼬리 카드는 가산세 입력을 싣지 않는다(두 조각 = 신고 1건 · base는 자산 전체 예정신고 세액). 단건 route는 가산세를 신고서 단위로만 넘겨 영향이 없다.
  - ⑧·⑫ 차단 해제(`MULTI_CARRYOVER_DEBT_UNSUPPORTED_MESSAGE` 삭제).
  - ⑦ 결과 행 — 매입분 꼬리 카드(`p1__purchased`)를 그 자산 행으로 묶는다(`multiFormPropertyIdOf` → `purchasedPartParentIdOf`).
- 단건 = 연간 합산(실측):
  - 주택 채무 1억(A · 두 조각): 146,806,000 · 무신고 176,167,200 · 채무 3억(B · 조각 없음): 135,806,000 · 무신고 162,967,200
  - 🔴 형제 결함(master 실측): 일반건물 토지 파트 이월과세 × 채무 인수분 + 무신고 — 세액은 같았고 가산세만 **56,784,000(단건 28,392,000의 두 배)**. 일반건물 파트 채무는 트랙 G 펼침으로 이미 연간 합산에 들어와 있었다. 수정 후 28,392,000.
- 뮤테이션 5건 전부 검출(꼬리 가산세 · 일반건물 제외 · 예정신고 단위 · 같은 날 어댑터 · 결과 행 매핑).
- 계속 막는 것: **파트 이월과세(V-CO3)** — 실측: 다건 ④는 이미 파트 키(`landCarryoverPart`·`carryoverGiftEvent`)를 보내지만 다건 ⑭가 `composeSplitCarryover`를 부르지 않아 엔진이 400을 낸다. ⑭만 이으면 1건은 단건과 같겠지만, 엔진은 파트 A/B를 **그 자산의 결정세액**으로 정한다(STEP 0.476). 연간 합산의 다른 이월과세는 그 해 전체 결정세액으로 비교한다 — 비교 단위가 갈린다. 사용자 결정 필요(Q-4).

### 트랙 CO-PART — 주택·건물 토지·건물 파트 이월과세 (PR-7 · 2026-11-10 사용자 Q-4 **b** · V-CO3)

- 원인(실측): 다건 ④는 파트 키(`carryoverGiftEvent`·`landCarryoverPart`·`buildingCarryoverPart`)를 이미 보냈다(단건과 같은 `buildSplitPayload`). 다건 ⑭가 단건 `engine-input.ts`의 합성기(`composeSplitCarryover`)를 부르지 않아 엔진이 「파트 이월과세 정보가 함께 필요합니다」 400. ⑧·⑫는 그 앞에서 막았다.
- 작업:
  - ⑭ `route-property-input.ts` — 단건과 같은 합성기(Date 변환·증여세 영 §163의2② 안분). 와이어 5키를 명시로 넘긴다(F-12 정적 스캔이 `p.<key>`를 본다).
  - ④ 결함(실측): 다건 ④가 자산 `acquisitionDate`를 원시값으로 보냈다 — 단건은 이월과세면 `primaryAcquisitionDateOf`(증여 등기접수일)다. P4 B(건물만)·P2 C(증여자 분리)는 화면에 취득일 칸이 없어 빈 값 → ⑫ 400. 같은 leaf로 맞췄다(형제: `temporaryTwoHouseApplies` 인자도 같은 leaf · 자산 단위 이월과세도 잔재 취득일이면 단건과 갈렸을 축).
  - ⑧·⑫ 차단 해제(`MULTI_CARRYOVER_PART_UNSUPPORTED_MESSAGE` 삭제).
  - 고지(Q-4 b): 엔진(STEP 0.476)이 파트 A/B를 **그 자산의 결정세액**으로 정한다(실측: 연간 합산 비교 드라이버는 파트 자산을 보지 못한다 — `carryoverTaxationDetail` 없음). 연간 합산의 다른 이월과세는 그 해 전체 결정세액으로 비교하므로, 다른 자산과 함께 신고하면 «확인 필요»(`MULTI_SPLIT_CARRYOVER_ASSET_SCOPE_NOTICE`)를 싣는다. 1건 신고면 싣지 않는다.
  - ⑦ 연간 합산 자산 행은 `ValuationDetailCards` → `SplitGainDetailSection`으로 단건과 같은 파트 이월과세 블록을 그린다(E2E MSC-E1).
- 단건 = 연간 합산(실측): A 토지만(매매·신축 호스트) 189,486,000 · B 건물만 287,331,000 · C 증여자 분리 330,019,800. 아파트와 함께 A 308,583,000 · B 406,527,000 · C 451,126,500(고지 실림).
- 뮤테이션 5건 전부 검출(합성기 · 취득일 leaf · 고지 다건 조건 · 고지 · 고지 술어).
- 한계(사용자 결정 b로 수용): 다른 자산과 함께면 파트 A/B 결론이 그 해 전체 비교와 갈릴 수 있다(2026-08-23 신고단위 전환 때 자산별 비교는 300 격자 중 7건 과소였다 — memory `project_transfer_carryover_filing_unit_scope`). 그 해 전체로 비교하려면 파트 A/B를 집계 외부 비교 단위로 올려야 한다(Q-4 a · 미착수).

### 공통

- 파일 크기: `lib/calc/multi-transfer-tax-api.ts` 722줄 · `app/api/calc/transfer/multi/route.ts` 738줄. 세 트랙 배관을 더하면 800 트리거를 넘을 수 있다 — 첫 PR에서 기회주의적 분리(≤700 착지)를 함께 한다.
- 매 PR: parity anchor(단건 = 연간 합산 1건) + 다른 자산과 함께인 경우 + 뮤테이션 + E2E 1건.

## 4. 사용자 결정(Q)

- **Q-1 순서** — (a) CO → BG → GS 각각 PR **(권장: CO·BG는 엔진 그대로·배관 위주, GS는 카드 id 규약과 빌더 분리가 필요해 마지막)** · (b) 세 트랙 한 PR.
- **Q-2 지분 카드 id(GS)** — ✅ a 결정(2026-11-10) · (a) 복합 접미사 `land#<자산id>.<지분번호>`(자산 묶음은 앞부분, 지분 구분은 뒷부분) · (b) 연간 합산에서만 접미사를 자산 id로 바꾸고 지분 번호는 라벨·별도 필드로. **결정 전 V-GS1(접미사 파서 전수 조사) 필요** — 어느 쪽이든 결과 묶음·신고서·명세서·폼 조회가 접미사를 읽는다.
- **Q-3 부담부증여 표시(BG)** — (a) 자산 행 펼침에 그 자산의 §159·증여세 명세 카드(단건과 같은 카드) **(권장: 세액 근거가 화면에 남는다)** · (b) 세액만(명세 없음 — 숨은 계산이라 비권장).
- ✅ **Q-4 결정(2026-11-10 사용자): b** — **Q-4 파트 이월과세(V-CO3)의 연간 합산 비교 단위** — (a) 그 해 전체 결정세액으로 비교 — 파트 A/B를 집계 외부 비교 단위로 등록(일반건물 부담부증여 × 이월과세와 같은 구조 · 엔진 STEP 0.476 해결자를 집계에서 부를 수 있게 나눠야 함 · 규모 확인 필요) **(권장: 자산 단위 이월과세·일반건물과 같은 비교 단위)** · (b) ⑭만 이어 엔진의 자산 단위 파트 비교를 그대로 쓰고 «확인 필요» 고지 — 다른 자산과 함께면 비교 단위가 갈린다 · (c) 계속 막는다.
- ✅ **결정(2026-11-09 사용자)**: Q-1 **a**(CO → BG → GS 각각 PR) · Q-2 **V-GS1 조사 후 결정**(트랙 GS 착수 전) · Q-3 **a**(자산 행 펼침에 §159·증여세 명세 카드).

## 5. 미검증(V)

| # | 내용 |
|---|---|
| V-CO1 | 예정신고 세액(가산세 base) — `computePreliminaryFilingTaxes`가 자산마다 단건 엔진을 부르므로 이월과세 A/B를 자산 단독으로 비교한다. 예정신고는 자산별 신고라 맞는 축으로 보이나 가산세 있는 시료로 **실측 필요** |
| V-CO2 | ✅ 해소(트랙 CO-DEBT) — 집계가 조각으로 나누고 자산 단독 계산은 카드 1장짜리 집계. 일반건물 파트 채무 가산세 두 배 결함 함께 수정 |
| V-CO3 | ✅ 해소(트랙 CO-PART · Q-4 b) — ⑭ 합성기 · ④ 취득일 leaf · 다른 자산과 함께면 «확인 필요»(파트 A/B는 그 자산 기준) |
| V-CO4 | 일반건물 이월과세(`general-building-route-carryover.ts`) — 트랙 G 펼침이 이월과세를 넘기는지 |
| V-CO5 | 연간 합산 결과 화면이 이월과세 A/B 카드·신고단위 비교 근거를 그리는지(브라우저) |
| V-BG1 | ✅ 해소(트랙 BG) — 묶음 명세 입력이 있으면 자산별 echo를 싣지 않는다 |
| V-BG2 | ✅ 해소(트랙 BG) — 세액 단건과 같음. 일반건물 부담부증여 × 이월과세도 트랙 GB-BG-CO로 단건과 같음(당초 증여자 신축만 계속 차단) |
| V-GS1 | ✅ 조사 완료(트랙 GS 절) — Q-2 a |
| V-GS2 | ✅ 이월과세는 단건과 같음 · 부담부증여도 트랙 GS-BG로 · 지분 × 부담부증여 × 이월과세도 트랙 GB-BG-CO로 단건과 같음 |

## 6. 완료 기준

- [ ] 트랙별 parity anchor — 단건 = 연간 합산 1건(위 §2 세 시료 포함) · 아파트와 함께인 경우 세액·자산별 양도차익 고정
- [ ] 이월과세 신고단위 비교가 단건과 갈리는 시료 1건 이상(갈리는 것이 정상임을 고정 — memory 「컴패니언이 단기뿐이면 divergence 0」 주의)
- [ ] ⑧↔⑫ 정합 — 해제한 키가 ⑧에서도 같은 조건으로 열린다
- [ ] 뮤테이션 · tsc 0 · 회귀 · E2E 1건(headless) — 사람이 브라우저로 직접 보는 확인은 별도 명시
