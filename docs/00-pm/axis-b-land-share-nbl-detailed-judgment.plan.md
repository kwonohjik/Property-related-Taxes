# 축 B(같은 땅 지분 분할) 토지 — 비사업용 정밀판정이 첫 지분에만 걸리는 결함 수정 계획서 v0.2

- 작성일: 2026-10-19 · 기준 커밋: master `27612a286` · 워크트리 `-axbnbl` (브랜치 `fix/axis-b-land-share-nbl-detail`)
- 출처: 사이드바 축 B 표시 수정(#2265) 계획서의 범위 밖 항목 Q-2 → 실측으로 세액 결함을 확인했다

## 1. 원인

같은 땅을 지분으로 나눠 입력하고(축 B) 첫 카드에서 비사업용 토지 **정밀판정**을 켜면, 정밀판정 입력이 **첫 지분에만** 실린다.

| 단계 | 첫 지분 | 둘째 지분 이후 |
|---|---|---|
| ④ 정밀판정 입력 | `buildNonBusinessLandRaw(primary, …)`(`lib/calc/transfer-tax-api.ts:111`) → `nonBusinessLandRaw`(`:574`) | **없음** — 지분 payload는 `mergePrimaryBasic`(`transfer-tax-api-helpers.ts:140`)을 거친 `buildAssetPayload`(`transfer-tax-api-bundled.ts:73`)뿐 |
| 비사업용 표지 | 첫 카드 값 | `mergePrimaryBasic`이 첫 카드의 `isNonBusinessLand`를 복사(`transfer-tax-api-helpers.ts:213`) |
| ⑫ Zod | `nonBusinessLandRaw`(`transfer-tax-schema-base-shape.ts:184`) | 지분 스키마(`transfer-tax-schema-companion.ts:60`)에 키 없음 |
| ⑭ 엔진 입력 | `nonBusinessLandDetails: buildNblEngineInput(…)`(`app/api/calc/transfer/engine-input.ts:277`) | `isNonBusinessLand: c.isNonBusinessLand ?? false`(`bundled-split-helpers.ts:586`)만 — 정밀판정 입력 없음 |
| 엔진 STEP 0.6 | 정밀판정 입력이 있을 때만 판정 결과로 `isNonBusinessLand`를 덮는다(`transfer-tax-judgment-steps.ts:535`) | 입력이 없어 화면 표지 `true`가 그대로 남는다 |

정밀판정을 켜면 화면이 `isNonBusinessLand`도 함께 켠다(`TransferModeBlock.tsx:130-131`). 그래서 **판정 결과가 «사업용»이어도 둘째 지분 이후는 §104①8호 +10%p가 붙는다.**

둘째 지분 카드에는 비사업용 입력이 없다 — `AssetSectionExtras`(`CompanionAssetCard.tsx:462`)는 저장된 원래 값을 받는데, 축 B 둘째 카드의 원래 `assetKind`는 기본값 «주택»이라 토지 블록(`AssetSectionExtras.tsx:62`)이 뜨지 않는다. 즉 사용자는 고칠 수 없다.

다건 계산기는 함께 양도 카드를 받지 않아(`multi-transfer-tax-api.ts:207`) 이 경로가 없다.

### 연혁

`mergePrimaryBasic`의 `isNonBusinessLand` 복사(`:213`)는 2026-09-02 코드 리뷰 V10-f에서 넣었다. 그 전에는 정반대로 둘째 지분이 **중과에서 빠졌다**(그 주석의 실측: 74,661,400원 과소). V10-f는 정밀판정을 쓰지 않는 경우(화면 표지 그대로)를 고쳤고, 정밀판정 경로는 그때 다루지 않았다.

## 2. 실측 (probe — 화면 폼 → ⑧ → ④ → 실제 route → 집계 엔진, mock 세율표)

공통 조건: 토지 300㎡, 공익수용 양도(사업인정고시일 2020-01-01), 양도일 2024-06-03, 총양도가 10억, 물건 전체 취득가 4억, 50/50 지분. 첫 카드에서 정밀판정 ON(지목 미입력 — 공익수용 의제가 성립하면 지목 없이 판정된다).

| 시료 | 현행 총세액 | 둘째 지분을 «사업용»으로 바꾼 요청 | 단건 100% |
|---|---|---|---|
| S1 두 지분 모두 2014-01-02 취득 | **181,852,000** (지분1 38% · 지분2 48%) | **181,566,000** | 181,566,000 |
| S2 지분2만 2019-06-03 취득 | 197,692,000 (지분1 38% · 지분2 48%) | 194,931,000 | — |
| 정밀판정 OFF(표지만 ON), S1 | 234,091,000 (둘 다 48%) | — | 234,091,000 |

- S1: 같은 땅·같은 취득일인데 지분으로 나누면 **+286,000원**. 둘째 지분을 «사업용»으로 바꾸면 단건과 정확히 같아진다 — 차이 전부가 이 결함이다.
- 앞선 리뷰 시료(10억·2014-01-02 취득·공익수용)는 +1,661,000원이었다. 결함은 같고, 차이 금액은 시료에 따라 다르다.
- 정밀판정 OFF면 단건과 같다 — V10-f가 지키는 경로는 정상이다.
- S2의 둘째 지분은 고시일 전 7개월에 취득했다. **취득일이 고시일부터 5년 이전**이라는 요건(아래 §3)을 지분 단위로 보면 의제가 성립하지 않는다. 그래서 «첫 지분 판정을 그대로 공유»하면 S2는 194,931,000이 되는데, 이것은 정답이 아닐 수 있다(Q-1).

## 3. 법령·해석 — 판정 단위

- 「소득세법」 §104의3①: 비사업용 토지는 «해당 토지를 **소유하는 기간** 중 대통령령으로 정하는 기간 동안» 각 호에 해당하는 토지다. 기간 기준이 소유기간이므로, 지분마다 취득일이 다르면 기간 계산의 시작점이 다르다.
- 「소득세법 시행령」 §168의14③3호: 협의매수·수용 토지로서 «사업인정고시일이 2006년 12월 31일 이전인 토지 또는 **취득일**(상속받은 토지는 피상속인이 해당 토지를 취득한 날)이 사업인정고시일부터 5년 이전인 토지». 엔진 조문 상수는 `lib/tax-engine/legal-codes/transfer-nbl.ts:128`(③3호 나목). 위 문언은 국세청 회신(부동산거래관리과-0012, 2012.01.06.)에 인용된 당시 본문이다. 현행 본문은 `npm run verify:legal`로 Do 전에 다시 확인한다.
- 사전-2015-법령해석재산-0446(2016.01.26.): 공유 임야 **지분**을 양도한 사안이다. 그 지분을 누구로부터 언제 상속받았는지(조부인지 부친인지)에 따라 §168의14③1호의2 직계존속 재촌기간을 정했다. 같은 토지라도 **지분의 취득 경위에 따라** 판정 사실이 달라진다는 근거다.
- 부동산거래관리과-0012(2012.01.06.): 모(母) 지분이 재상속된 사안이다. 직계존속 8년 재촌·자경 의제는 «해당 직계존속으로부터 상속·증여받은 토지»에 적용된다고 회신했다.
- **확인하지 못함**: «한 사람이 같은 토지의 지분을 순차 취득한 경우 지분별로 판정한다»를 정면으로 다룬 해석. 위 두 해석은 지분의 취득 경위가 판정 사실을 바꾼다는 인접 근거다 — **확인 필요**.

## 4. 수정안

### 4-1. 판정 단위 (Q-1)

- **(a) 지분별 판정 — 권장.** 각 지분에 정밀판정 입력을 실어 엔진이 지분마다 STEP 0.6을 돈다(집계는 이미 자산별로 `calculateTransferTax`를 부른다 — `transfer-tax-aggregate-asset-records.ts:135`).
  - 땅에 관한 사실은 **첫 카드 값**이다: 지목·용도지역·사용기간·재촌·면적·소재지 등 `nbl*`, 정밀판정 토글, 양도원인, 사업인정고시일.
  - 지분에 관한 사실은 **그 지분 카드 값**이다: 취득일, 취득원인, 피상속인·증여자 취득일, 지분율. 공유 면적 안분(대법원 2015두39439 — `lib/tax-engine/non-business-land/co-ownership.ts`)에 쓰이는 `nblOwnershipRatio`는 `deriveOwnershipRatio`(`non-business-land-request.ts:29`)가 그 지분 값으로 계산한다.
  - 결과: S1은 단건과 같아진다. S2의 둘째 지분은 공익수용 의제가 성립하지 않아 일반 판정으로 간다. 그러려면 지목·용도지역이 필요하다(4-3).
- (b) 첫 지분 판정 결과를 전 지분에 공유한다. 서버에서 첫 지분의 `isNonBusinessLand`·면적비율을 둘째 지분에 복사한다. 변경은 작지만, S2처럼 취득일이 다르면 §168의14③3호의 «취득일» 요건을 첫 지분 기준으로 둘째 지분에 적용하게 된다 — 문언과 어긋난다.

### 4-2. 취득 경위에 달린 의제 선언 (Q-2)

무조건 사업용 의제 8종(`nbl-unconditional-exemption-status.ts:69-126`)은 첫 카드에서 한 번 받는다. 그중 일부는 **지분의 취득 경위**에 달려 있다.

| 선언 | 지분 취득 경위 의존 |
|---|---|
| 2006년 이전 상속 · 직계존속 8년 자경 상속·증여 · 도시지역 농지(종중·상속) · 20년 이상 소유 · 종중 소유(취득일) · 이농 | 있음 — 상속·증여 여부나 취득일이 지분마다 다를 수 있다 |
| 공익수용 | 취득일은 이미 지분 값을 쓴다(4-1) — 선언 자체는 땅 단위 |
| 공장 인접 | 없음(땅 단위) |

- **(a) 권장 — 그 지분의 취득원인·취득일이 첫 카드와 같을 때만** 첫 카드 선언을 그 지분에 적용한다. 다르면 위 6종을 적용하지 않고, 결과에 다음 안내를 띄운다: «자산 N은 취득 경위가 첫 카드와 달라 상속·증여·소유기간에 따른 사업용 의제 선언을 적용하지 않았습니다 — 확인 필요». 근거가 확인되지 않은 혜택은 성립시키지 않는다는 저장소 규약을 따른다.
- (b) 지분 카드마다 의제 선언 입력을 따로 연다. 정확하지만, 둘째 카드에 비사업용 블록을 새로 여는 UI 확장이 필요하다(지금은 그 블록이 없다).
- (c) 취득원인·취득일이 다르면 ⑧이 정밀판정을 막는다. 사용자가 계산할 길이 없어진다 — 비권장.

### 4-3. 변경 지점 (Q-1 (a) · Q-2 (a) 기준)

| # | 지점 | 변경 |
|---|---|---|
| E1 ④ | `transfer-tax-api-bundled.ts:73` 지분 map | 축 B · 토지 · 첫 카드 정밀판정 ON이면 지분 payload에 `nonBusinessLandRaw`를 싣는다. 새 헬퍼는 «첫 카드 `nbl*`·땅 사실 + 그 지분 취득 사실»로 레코드를 만들어 **기존 `buildNonBusinessLandRaw`를 그대로** 부른다(빌더 사본 금지). Q-2 (a)의 6종 차단도 이 헬퍼가 한다 |
| E2 ⑩⑫ | `transfer-tax-schema-companion.ts:60` | `nonBusinessLandRaw: nonBusinessLandRawSchema.optional()` — 주 자산과 같은 스키마 |
| E3 ⑭ | `bundled-split-helpers.ts`(`buildCompanionEngineInputs` `:357`, 명시 매핑) | `nonBusinessLandDetails: buildNblEngineInput(c.nonBusinessLandRaw)` — 주 자산과 같은 함수(`engine-input.ts:277`). 매핑을 빠뜨리면 Zod를 통과한 값이 엔진에 닿지 않는다 |
| E4 ⑧ | 정밀판정 필수 입력 검증(`transfer-tax-validate-nbl.ts:93`) | 축 B 지분마다 E1과 같은 레코드로 의제 성립을 평가한다. 어느 지분이라도 의제가 성립하지 않으면 첫 카드에 지목·용도지역을 요구하고, 메시지에 지분 번호를 쓴다. 그러지 않으면 화면은 통과하는데 ④가 그 지분 입력을 버리고(`buildNonBusinessLandRaw`의 지목 게이트 `:92-100`) 표지 `true`로 조용히 떨어진다 |
| E5 안내 | 엔진 STEP 0.6 경고 또는 ④ 결과 안내 | Q-2 (a) 안내 문구(지분 번호 포함) |

엔진 판정식은 바꾸지 않는다. `mergePrimaryBasic`의 `isNonBusinessLand` 복사(V10-f)는 그대로 둔다 — 정밀판정 OFF 경로의 정답이다.

## 5. 결정 요청

- **Q-1. 판정 단위** — 권장 **(a) 지분별 판정**(땅 사실은 첫 카드, 취득 사실은 지분 카드). (b)는 첫 지분 판정 공유.
- **Q-2. 취득 경위에 달린 의제 선언 6종** — 권장 **(a) 취득원인·취득일이 첫 카드와 같은 지분에만 적용하고, 다르면 미적용 + 「확인 필요」 안내**. (b) 지분 카드마다 입력. (c) 차단.

## 6. 검증 계획

1. route anchor(화면 폼 → ⑧ → ④ → route → 집계): S1 총세액 = 단건 100%(현행 181,852,000 → 181,566,000) · 지분별 `nonBusinessLandJudgmentDetail`이 존재하는지 단언(«양쪽 다 미판정»과 구분하기 위해).
2. S2: 둘째 지분이 의제 불성립 → 지목·용도지역이 없으면 ⑧이 지분 번호를 넣어 차단하고, 입력하면 일반 판정으로 간다. 기대 세액은 Do 단계 probe로 실측한다.
3. Q-2: 첫 카드 «직계존속 8년 자경» 선언 + 둘째 지분 매매 취득 → 둘째 지분은 선언 미적용 + 안내. 취득원인·취득일이 같으면 적용(부정 짝).
4. 회귀: 정밀판정 OFF 축 B(V10-f · `nbl-pr1-gates.anchor.test.ts:381`) 불변 · 함께 양도(서로 다른 물건) 불변 · 비토지 축 B 불변.
5. 결과 화면: 지분별 판정 카드 표시를 E2E로 확인(집계는 이미 자산별 판정 상세를 운반한다 — `transfer-tax-aggregate-asset-records.ts:174`; 화면 표시는 Do에서 실측).
6. 뮤테이션: E1 raw 미탑재 · E1 지분 취득일 대신 첫 카드 취득일 · E2 스키마 키 제거 · E3 매핑 제거 · E4 지분 루프 제거 · Q-2 같은 경위 조건 반전.
7. `npm run check:pre-pr`.

## 7. 결정·구현 결과 (v0.2 — 2026-10-19)

- 사용자 결정: Q-1 **(a) 지분별 판정** · Q-2 **(a) 취득원인·취득일이 첫 카드와 같은 지분에만 의제 선언 6종 적용, 다르면 미적용 + 「확인 필요」 고지**.
- 구현(§4-3 그대로):
  - E1 ④ `buildFractionalShareNblRecord`(`lib/calc/non-business-land-request.ts`) — 첫 카드 전체 위에 지분의 취득일·취득원인·피상속인/증여자 취득일·이월과세·지분율을 덮고, 경위가 다르면 `NBL_ACQUISITION_DEPENDENT_EXEMPT_FLAGS` 6종을 끈다. 축 B 지분 map(`transfer-tax-api-bundled.ts`)이 이 레코드로 **기존 `buildNonBusinessLandRaw`** 를 불러 `nonBusinessLandRaw`를 싣는다.
  - E2 ⑫ `companionAssetSchema.nonBusinessLandRaw` · E3 ⑭ `buildCompanionEngineInputs`의 `nonBusinessLandDetails: buildNblEngineInput(…)` — 주 자산과 같은 스키마·같은 함수.
  - E4 ⑧ `transfer-tax-validate.ts` — 첫 지분은 의제 성립인데 다른 지분이 불성립이고 첫 카드 지목·용도지역이 비었으면, 자산 1에 그 칸을 요구한다(메시지에 지분 번호).
  - E5 고지 `nblShareExemptionWithheldNotice`(`lib/tax-engine/non-business-land/sole-split-share-notice.ts`) — 다건 엔진이 첫 지분에서 켜진 6종 중 이 지분에서 꺼진 것을 찾아 `[자산 N]` 경고로 싣는다(축 B 입주권 `soleSplitRightShareDateNotice`와 같은 층).
- 실측(route anchor `__tests__/api/transfer.route.axis-b-land-share-nbl.anchor.test.ts`, mock 세율표):

| # | 시료 | 결과 |
|---|---|---|
| N1 | 같은 날 취득 50/50 | 181,852,000 → **181,566,000** = 단건 100% · 판정 [사업용, 사업용] |
| N2 | 지분2 2019-06-03 취득 · 지목 미입력 | ⑧ 「자산 1: 자산 2 지분은 … 지목을 선택하세요」(field `nblLandType`) · 용도지역만 비면 `nblZoneType` |
| N3 | N2 + 지목·용도지역 | 지분2 의제 불성립 → 일반 판정 [사업용, 비사업용] · 197,692,000 |
| N4 | 첫 지분 상속+「직계존속 8년 자경」 · 지분2 매매 | 지분2 선언 미적용 [사업용, 비사업용] · 197,692,000 · `[자산 2]` 고지 |
| N5 | 지분2도 같은 날 상속 | 선언 적용 [사업용, 사업용] · 181,566,000 · 고지 없음 |
| N6 | 정밀판정 OFF | 지분 입력 미탑재 · 234,091,000 = 단건(V10-f 경로 불변) |
| N7 | 함께 양도(다른 물건) | 지분 입력 미탑재 |

- 단위 `__tests__/lib/calc/axis-b-share-nbl-record.anchor.test.ts`(레코드 출처·6종 차단·고지 조건) · E2E `e2e/transfer-axis-b-land-share-nbl.spec.ts`(AXN-1 요청에 지분 입력·응답 판정 / AXN-2 결과 화면 고지) 통과.
- 뮤테이션 12/12 KILLED: raw 미탑재 · 첫 카드 취득일 · 스키마 키 · ⑭ 매핑 · ⑧ 지분 검증 · Q-2 조건 반전 · 취득일 비교 제거 · 고지 제거 · 축 B 게이트 · 용도지역 필드 · 지분율/취득원인 첫 카드.
- `npm run check:pre-pr` 통과(3119 파일). `bundled-split-helpers.ts`는 800줄(상한 초과 아님 — 다음 기능 때 분리 대상).
- 남은 확인 필요: 지분 순차 취득의 지분별 판정을 정면으로 다룬 해석(§3). 임야·목장 상속일 입력(`nblForestInheritanceDate`·`nblPastureInheritanceDate` 등)은 Q-2의 6종에 넣지 않았다 — 첫 카드 값을 그대로 쓴다.
