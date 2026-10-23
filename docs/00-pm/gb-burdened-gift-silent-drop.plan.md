# 일반건물 × 부담부증여 «침묵 소실» 2건 수정 계획서

> 상태: **v0.2 (2026-10-23) 사용자 결정 반영 — Q-1~Q-6 전부 권장안 확정.** 순서 PR-1(결함 2) → PR-2(컴패니언) → PR-3(지분). PR-1 Do 기록은 §12.
> 계기: PR-5b(#2456, 일반건물 부담부증여 K-5·K-7 × 본인 신축 §114조의2) 작업 중 발견. 입력은 받는데 계산에 반영되지 않는다.
> 1. 일반건물 **지분 분할 취득(축 B `generalBuildingShares`)** · **함께 양도(컴패니언)** 일반건물 + 부담부증여 → §159가 조용히 무시된다.
> 2. 일반건물 부담부증여 + **환산·증축을 켠 뒤 남은 값(stale)** → 환산 경로로 라우팅되어 §159가 조용히 무시된다.
>
> 검증 방식: throwaway probe(커밋 안 함)로 **폼(AssetForm) → ④ `callTransferTaxAPI` → route `POST` → 응답**을 실측했고(vitest, mock 세율표), 같은 입력을 **Playwright로 실제 UI**에서 재현해 요청 body·결과 화면 숫자가 일치함을 확인했다(dev 서버 `:3293`, 종료·`next.config.ts` 원복 완료).
> 인용 file:line은 base `c7f135041`(PR-5b head) 기준. 세액은 **mock 세율표 실측값**이지 정본 세액이 아니다 — **전후 차이의 크기와 방향**을 보는 용도다.

---

## 0. 한 줄 요약

- **결함 1·2 모두 UI에서 재현된다.** ⑤가 입력을 열어 두고, ⑧이 0건 이슈로 통과시키고, 응답은 200이다. 화면에는 오류도 경고도 없다.
- **방향은 과대과세·과소과세가 둘 다 나온다.** 지분·컴패니언 + 부담부증여는 취득가액이 0으로 떨어져 **크게 과대**(K-5 기준 지분 +84,413,120 / 컴패니언 +179,764,200). 증축 stale은 양도차손으로 읽혀 세액 **0**(−57,552,880)이 된다.
- **결함 2는 «증축 stale»뿐이 아니다.** 같은 라우팅 조건(`transfer-tax-api-gb.ts:321`)이 **환산 선택 후 전환**(`useEstimatedAcquisition` stale)과 **분리 ON 파트 환산 stale**도 환산 경로로 보낸다. 감정가액·매매사례가액 stale은 이미 막혀 있다(`:259-266`).
- **권장:** 결함 1 = **(A) 지원 구현** — 카드 빌더에 `burdenedGiftInfo`를 넘기는 것만으로 단건 100% 값이 정확히 재현된다(§4 프로토타입). 결함 2 = **④ 라우팅에서 부담부증여를 환산 분기 밖으로 + 서버 400 안전망**(⑧ 차단은 막다른 길이라 부적절, §5). PR 3개(§8).

---

## 1. 대상 경로와 근거 file:line

| 결함 | 어디서 버려지나 | 근거 |
|---|---|---|
| 1-a 축 B 지분 | route 5-0이 `burdenedGiftInfo`를 넘기지 않는다. `calculateGeneralBuildingFractional` 시그니처에도 인자가 없다 | `app/api/calc/transfer/route.ts:167-192` · `general-building-fractional.ts:86-` |
| 1-b 컴패니언 | `buildGbCompanionItems`가 `generalBuildingValuation`만 받는다. `companionEngine.burdenedGiftInfo`는 `:547`에서 실리는데 GB 분기(`:715-721`)에서 쓰이지 않는다 | `bundled-split-helpers.ts:547·715-721` · `general-building-part-cards.ts:222-` |
| 1-c 주 자산이 GB인 묶음 | 같은 `buildGbCompanionItems`를 부른다 | `bundled-route.ts:246-250` |
| 2 라우팅 | `anyEstimated \|\| gbHasExtension \|\| (anyNonActual && !isBurdenedGiftGb)` — 앞 두 항은 부담부증여를 제외하지 않는다 | `lib/calc/transfer-tax-api-gb.ts:321` (술어 `:259·265-266`) |
| 2 (서버) | `gbRaw.actualPriceMode === true`일 때만 실가 경로(= §159 소비). 아니면 `burdenedGiftInfo`를 받고도 환산 경로로 간다 | `general-building-route-helper.ts:186` · `route.ts:313-323` |

**왜 막지 못했나**
- ⑧ `validateGeneralBuildingAsset`은 부담부증여면 `:58-97`에서 **조기 종결**한다. 환산·증축 stale은 검사 대상이 아니다.
- ⑧ `transfer-tax-validate.ts:150-170` 주석은 «부담부증여 차단은 2026-09-03에 모두 해제 — 축 B 60%+40% 합계 = 단건 100% (64,600,360)»라고 적는다. **그 실측은 주택(비-GB)이다.** 일반건물 지분 경로(2026-08-10)는 그 해제에 포함되지 않았고, GB × 지분/컴패니언 × 부담부증여 테스트는 **0건**이다(`generalBuildingShares` 언급 테스트 중 `burden`을 다루는 것은 `gb-fractional-reductions` 하나이며 housing leaf 대조뿐).
- ⑤ UI: 양도 형태 라디오 `TransferModeBlock.tsx`는 일반건물을 지분·컴패니언 어디서나 연다(`SUPPORTED_ASSET_KINDS`에 `general_building`, 게이트 없음). 지분 카드(자산 2~N)는 ②를 숨기지만 `mergePrimaryBasic`이 `transferType`을 자산 1에서 병합한다(`transfer-tax-api-helpers.ts:166`).
- 결함 2의 ⑤: 부담부증여로 바꾸면 **증축 토글**(`GeneralBuildingAcquisitionCards.tsx:299`)·**증축 상세 카드**(`GeneralBuildingBlock.tsx:769`)·**③ 취득가액 산정 방식 영역**(`CompanionAcqPurchaseBlock.tsx:367`)이 숨는다. 이전에 켠 값은 `selectMode`(`TransferModeBlock.tsx:109-`, 부담부증여 분기 `:140-`)가 지우지 않고, 이력 복원(`migrateAsset`)도 지우지 않는다(실측 P7: `transferType: burdened_gift`·`useEstimatedAcquisition: true`·`gbHasExtension: true` 보존). **사용자가 끌 칸이 없다.**

---

## 2. 현행 실측 — 케이스 매트릭스

### 공통 픽스처 (자기 신축 가산세 anchor와 같은 숫자)
토지 100㎡ × 2,000,000(양도시 2억) · 건물 양도시 2억 · 취득시 토지 1억·건물 1억 · 시가 모드 시가 10억 · 인수채무 5억(채무비율 0.5) · 양도 2026-03-01 · 취득 2015-03-01.
K-4 실지 150M+150M · K-6/K-7 토지 2억+건물 3억 · «기준시가»(STD) = 시가 모드 아님, 채무 2억·키 양도시 4억.
**대조(단건 100%, §159 반영)**: K-5 57,552,880 · K-4 91,135,000 · K-6 57,552,880 · K-7 57,552,880 · STD 12,978,240 (총납부세액).

### 2.1 결함 1-a — 축 B(지분 60/40, 같은 취득일, 총양도가 입력 10억)
⑧ 이슈 0건. 요청 body: `burdenedGiftInfo` 있음 · `generalBuildingShares` 2건 · `transferPrice` = 채무(5억) → route 5-0이 `data.totalPropertyTransferPrice ?? data.transferPrice`로 **채무를 총양도가로 쓴다.**

| 산정방식 | 현행 총납부 | 양도차익 합 | 취득가액 | §159 반영 시(프로토타입) | 차이 |
|---|---:|---:|---:|---:|---:|
| K-5 환산 | 141,966,000 | 500,000,000 | **0** | 57,552,880 | **+84,413,120** |
| K-4 실지 | 141,966,000 | 500,000,000 | 0 (입력한 취득가 무시) | 91,135,000 | +50,831,000 |
| K-6 매매사례 | 141,966,000 | 500,000,000 | 0 | 57,552,880 | +84,413,120 |
| K-7 감정 | 141,966,000 | 500,000,000 | 0 | 57,552,880 | +84,413,120 |
| STD 기준시가 | 42,229,000 | 200,000,000 | 0 | 12,978,240 | +29,250,760 |
| K-5, 취득일 2009/2015 | 131,406,000 | 500,000,000 | 0 | 52,597,072 | +78,808,928 |

- 응답에 `transferBurdenedGiftBreakdown`·`aggregated.burdenedGift` 없음 → **결과 화면에 §159·증여세 카드가 아예 안 뜬다**(UI 재현: 총납부 141,966,000, «부담부증여» 문구 0).


### 2.2 결함 1-b — 함께 양도(컴패니언)
| 조합 | ⑧ | 현행 총납부 | §159 반영 시(프로토타입) | 차이 |
|---|---|---:|---:|---:|
| GB(주)+GB, 전 자산 부담부증여 K-5 | 0건 | 319,671,000 | 139,906,800 | **+179,764,200** |
| 〃 K-4 | 0건 | 319,671,000 | 211,563,000 | +108,108,000 |
| 〃 STD | 0건 | 107,646,000 | 40,311,700 | +67,334,300 |
| 주택(주)+GB | 주택 수 확인 2건(무관) | 148,744,200 | 88,738,606 | +60,005,594 |
| GB(주)+주택 | 0건 | 148,744,200 | 88,738,606 | +60,005,594 |
| GB 일반 + 주택 부담부증여(혼합) | **차단**(`MIXED_BURDENED_GIFT_BUNDLE_MESSAGE`) | — | — | 이미 막힘 |
| 대조: 주택+주택 전 자산 부담부증여 | — | 40,311,700 | — | GB STD «반영 시»와 **정확히 일치** |
| 대조: GB+GB 일반(함께 양도) | — | 141,966,000 | — | 회귀 0 셀 |

- 컴패니언은 `aggregated.burdenedGift`(증여세 1회 산정)는 **응답에 있다** — 결과 화면에 **증여세 카드는 뜨는데 양도세 카드는 §159를 무시한** 숫자다(UI 재현: 총납부 319,671,000, 양도차익 250M×4, 취득가액 0). 같은 화면에서 서로 모순된다.
- 컴패니언 쪽은 `engine.burdenedGiftInfo`가 주 자산·컴패니언 **모두** 이미 엔진 item에 실려 있다(프로토타입 로그 `[true,true]`). 즉 ④·⑫는 이미 되어 있고 ⑭ 카드 빌더만 비어 있다.

### 2.3 결함 2 — stale 라우팅 (단건 GB + 부담부증여, K-5 / K-4)
⑧ 이슈 전건 0건. 대조 S0(stale 없음): **57,552,880 / 91,135,000**.

| 케이스 | 요청 body | 현행 총납부 K-5 | 차이 | 현행 K-4 | 차이 |
|---|---|---:|---:|---:|---:|
| S1 환산 선택 후 전환 (`useEstimatedAcquisition`) | `actualPriceMode` 없음 | 56,574,760 | −978,120 | 56,574,760 | −34,560,240 |
| S2 증축(환산모드) ON 후 전환 | `extensionInfo` 있음 | **0** | −57,552,880 | 0 | −91,135,000 |
| S3 증축(실가모드) ON 후 전환 | 〃 | **0** | −57,552,880 | 0 | −91,135,000 |
| S4 감정가액 선택 후 전환 | actualPriceMode true | 57,552,880 | 0 | 91,135,000 | 0 |
| S5 매매사례 선택 후 전환 | 〃 | 57,552,880 | 0 | 91,135,000 | 0 |
| S6 분리 ON + 토지 환산 stale | `actualPriceMode` 없음 | 65,703,880 | +8,151,000 | 65,703,880 | −25,431,120 |

- **UI 재현(실제 라디오 클릭)**: 환산·증축을 켠 일반 양도 입력을 시드 → ②에서 «부담부증여 (소령 §159)» 라디오 클릭 → 계산. S1 총납부 56,574,760 · S2 **0**. 증축 토글 개수 1→0·증축 상세 카드 1→0(전환 후 숨김). 결과에 §159 카드 없음. 대조(S0) 57,552,880.
- S2·S3에서 취득가액이 증축 원건물 일괄 취득가(`fixedAcquisitionPrice` 5억)로 들어가 토지·건물1이 **양도차손**으로 읽힌다 — 세액 0.
- **API 직접 호출**(`actualPriceMode` false/생략 + `burdenedGiftInfo`): 200, 56,574,760, 부담부증여 흔적 없음. `false`+`extensionInfo`: 200, 세액 **0**. 서버가 입력 모순을 거부하지 않는다.
- **이력**: 저장 `inputData`는 `migrateAsset`을 거쳐도 stale이 그대로다(P7). 저장된 `resultData`는 당시 숫자이고, **재계산하면 같은 오류가 재현**된다. 옛 이력이 몇 건인지는 확인 불가(로컬 IndexedDB).

### 2.4 쓸어 봤으나 결함 없는 인접 셀 (회귀 0 근거)
- 단건 GB 부담부증여(stale 없음, K-1~K-7) — 위 대조값. 감정·매매사례 stale(S4·S5) — `:259-266`가 이미 막는다.
- 비-GB 부담부증여 축 B·컴패니언 — 엔진 STEP 0.48이 처리(주택+주택 40,311,700).
- 축 A(공유 소유) 단건 GB 부담부증여 — 실행은 되고 K-5 시가 모드에서는 지분 인수분 비례 값(123,500,000 차익)이 나온다. 단 **GB 실가 경로는 `ownershipRatio`를 §159에 넘기지 않는다**(`general-building-route-actual.ts` 구조분해에 없음; 비-GB는 `transfer-tax-burdened-gift-step.ts:35`가 넘긴다). 시가·기준시가 모드는 B/C 비율이 약분돼 동치일 수 있으나 **담보평가·임대평가 승 조합은 확인 필요**(§10 V-5, 이 계획 범위 밖).

---

## 3. 법령 근거 (KoreanLaw MCP, 「소득세법 시행령」 [현행] MST 290841, 시행 2026-10-01 본문 확인)

「소득세법 시행령」 제159조(부담부증여에 대한 양도차익의 계산)
- ①1호 취득가액 = A × B/C. A: 법 제97조제1항제1호에 따른 가액(양도가액을 상증법 제61조제1항·제2항·제5항 및 제66조에 따라 기준시가로 산정한 경우에는 취득가액도 기준시가로 산정). B: 채무액. C: 증여가액.
- ①2호 양도가액 = A × B/C. A: 상증법 제60조부터 제66조까지의 규정에 따라 평가한 가액.
- ② 양도소득세 과세대상 자산과 아닌 자산을 **함께** 부담부증여하는 경우 채무액 = A × B/C (A 총 채무액, B 과세대상 자산가액, C 총 증여 자산가액).

⇒ **조문은 자산별 B/C를 «증여계약 단위 채무액과 증여가액»으로 정한다.** 지분율을 곱하는 순서는 조문에 없다.
저장소의 축 B 규약(채무는 지분 안분 → B/C 보존, 평가액·기준시가는 엔진 `scaleBurdenedGiftInfo`가 지분 축소)은 **설계 전제이지 법문 직접 근거가 아니다**(`lib/calc/transfer-tax-api-burdened-gift.ts` `buildBurdenedGiftInfo` JSDoc). 같은 물건을 지분 취득일을 달리해 나눠 가진 경우의 §159 적용을 직접 다룬 해석례는 **확인하지 못했다 — 확인 필요**(V-1). 컴패니언의 신고 단위 채무 재배분(`apportionCompanionBurdenedGiftDebt`)은 ②의 «함께 부담부증여» 취지에 맞춘 저장소 선례이며 **이미 비-GB에서 운영 중**이다.

---

## 4. 처리 선택지

### (A) 지원 구현 — **권장 (결함 1)**
지분·컴패니언 경로의 카드 빌더에 `burdenedGiftInfo`를 전달한다. 엔진은 이미 실가 카드 경로(`buildActualGeneralBuildingCards`)에서 `burdenedGiftInfo`를 소비한다(`general-building-route-actual.ts:62·256`) — 필요한 것은 **전달**과 **지분 스케일**뿐이다.

**프로토타입 실측(repo 파일 변경 없이 모듈 목킹)**
- 컴패니언: `buildGbCompanionItems`가 `engine.burdenedGiftInfo`를 카드 빌더 payload에 넘기면 위 §2.2 표의 «반영 시» 값이 나온다(5/5). 주택+주택 대조값과 정확히 일치하는 셀이 있다(STD 40,311,700).
- 지분: 지분 k에 `burdenedGiftInfo`(채무 × r_k) + `buildBurdenedGiftBreakdown`에 `ownershipRatio = r_k`를 넘기면 **단건 100% 값과 정확히 일치**한다(K-5/K-4/K-6/K-7/STD 5/5, 같은 취득일). 취득일이 다르면 지분별 보유기간이 달라져 값이 다르고(52,597,072) 정상이다.
- 지분 스케일 규칙은 비-GB 축 B와 같다: 채무는 ④가 지분 안분(`buildBurdenedGiftInfo(…, debtScaleRatio)`), A·C는 엔진 `scaleBurdenedGiftInfo`(`burdened-gift-valuation.ts`, 호출은 `burdened-gift-apportionment.ts:108`). 다만 GB 실가 카드 빌더는 `ownershipRatio`를 받는 자리가 **없다**(§2.4) — 신설해야 한다(**단건 경로에는 연결하지 않는다**: 축 A 결과가 바뀔 수 있어 별건).

**변경 범위(14지점)**
| 지점 | 컴패니언 | 지분 |
|---|---|---|
| ①②③ 폼·initial·normalize | 없음 | 없음 |
| ④ API 변환 | 없음(`companionAssets[].burdenedGiftInfo` 이미) | `buildGeneralBuildingShares`가 지분별 `burdenedGiftInfo` 싣기(둘째 지분은 `buildBurdenedGiftInfo(merged_k, r_k)` — 감면 `reductions`와 같은 패턴 `transfer-tax-api-gb-shares.ts:243-245`) |
| ⑤ UI | 없음(이미 열림) | 없음 |
| ⑥ 사이드바 | 확인 필요(V-3) | 확인 필요(V-3) |
| ⑦ 결과 카드 | 이미 `aggregated.burdenedGift`(증여세) 표시 — 양도세 카드는 수정 후 §159 값 | 지분 응답에 BG 명세가 없다 → `burdenedGiftWholeInfo`를 aggregate에 넘길지(Q-6) |
| ⑧ validate | 기존 그대로(통과 ↔ 반영 일치) + 지분별 K-6/K-7·취득시 기준시가 요구는 이미 있음 | 〃. `transfer-tax-validate.ts:150-170` 주석 정정(GB는 그때 해제 대상 아니었음) |
| ⑨⑩ enum·컴패니언 refine | 없음 | 없음 |
| ⑫ Zod | 없음 | `generalBuildingShareSchema`에 `burdenedGiftInfo` 추가(`transfer-tax-building-schemas.ts:596` 부근, `reductions`처럼 optional) |
| ⑬ body spread | 없음 | `generalBuildingShares[]`에 포함 → 별도 spread 없음 |
| ⑭ route | `buildGbCompanionItems` Pick 타입·`buildGbPartCards` 인자 | 5-0 → `calculateGeneralBuildingFractional` → `buildGbPartCards` + `buildActualGeneralBuildingCards` `ownershipRatio` |

**3중 패턴(⑤ 노출·④ 전송·⑧ 요구)**: 이미 ⑤는 열려 있고 ⑧은 지분별 요구(K-4/K-6/K-7·취득시 기준시가)를 한다. (A)는 ④⑭만 채워 세 층을 일치시킨다. **자동 안분 fallback 아님** — 사용자가 입력한 채무를 §159 산식이 요구하는 계산 단위로 나누는 기존 규약(`buildBurdenedGiftInfo` 주석)을 따른다.

### (B) 명시 차단
- ⑤: 일반건물 + (지분 또는 컴패니언)에서 부담부증여 옵션 비노출/비활성. 이미 선택된 값은 막다른 길이 되지 않게 안내(옵션이 숨어도 현재 선택은 보이게 + 안내).
- ⑧: `isBlockedMixedBurdenedGiftBundle`와 같은 패턴(`burdened-gift-transfer-price-scope.ts` 술어 + 메시지 상수 → `transfer-tax-validate.ts:362`, ⑥ `transfer-per-asset-summary.ts:280`).
- ⑩/⑫: 같은 술어·같은 메시지로 400(`transfer-tax-schema.ts:215` 선례). route 5-0·`bundled-route`에도 가드.
- 단점: (1) 비-GB는 모두 지원하는데 GB만 막는 비대칭 — ⑧ 자신의 주석(`validate.ts:150-170`)이 «전건 개방»을 선언한다. (2) 옛 이력(⑧ 통과로 저장된 것)은 열면 새로 막혀 사용자가 입력을 고쳐야 한다. (3) ⑤·⑧·⑩·⑥·route 5곳 + 메시지·테스트 — (A)의 컴패니언 쪽보다 크다. 이득은 «계산 로직을 안 건드린다» 하나다.

### 결함 2 선택지
| 안 | 내용 | 평가 |
|---|---|---|
| **2-가 (권장)** | ④ `:321`을 `!isBurdenedGiftGb && (anyEstimated \|\| gbHasExtension \|\| anyNonActual)`로 — 부담부증여는 항상 실가(§159) 페이로드. 환산·증축 stale은 **전송하지 않는다** | ⑤가 숨긴 입력을 ④가 보내지 않으므로 3중 패턴(⑤ 비노출 = ④ 비전송)이 맞는다. 프로토타입: S1·S2·S6 모두 S0와 동일(57,552,880 / 91,135,000) |
| 2-나 | ⑧에서 stale을 요구/차단 | **부적절.** 사용자가 끌 칸이 없어 영구 차단(`feedback_ui_gate_removes_sole_input_path`) |
| 2-다 | `selectMode(burdened_gift)`가 stale을 지움 | 저장 이력·API 경로는 못 고친다. 3중 패턴의 «전송» 층이 비어 있다. 보조로는 가능하나 단독 불가 |
| 안전망(공통) | 서버: `burdenedGiftInfo`가 있는데 일반건물 payload가 실가(`actualPriceMode !== true`)면 400 (⑫ refine 또는 `dispatchCoercedGeneralBuilding` throw) | API 직접 호출의 «세액 0 200 응답» 차단. 침묵 strip 대신 명시 거부 |

---

## 5. 권장안과 근거

1. **결함 1 = (A).** 근거: ① 비-GB 두 축은 이미 지원이고 ⑧도 같은 방향으로 선언(`validate.ts:150-170`). ② 카드 레벨 전달로 단건 100% 값이 **정확히** 재현된다(컴패니언 5/5, 지분 5/5) — 계산 로직 신설이 아니라 배관 누락. ③ (B)는 옛 입력에 새 차단을 걸고 5곳을 건드린다. ④ 현행 오차가 크다(+84M~+180M).
2. **결함 2 = 2-가 + 서버 400.** 근거: ⑤가 이미 «증축은 부담부증여에서 비스코프»라 선언한다(`GeneralBuildingAcquisitionCards.tsx:285-300` 주석). ④가 같은 선언을 따르는 한 줄 수정이다.
3. **순서**: 결함 2(작음, 독립) → 컴패니언 → 지분. 지분 PR이 컴패니언 PR의 `buildGbPartCards` 인자 변경을 재사용한다.

---

## 6. ⑧↔⑫ 격자 / 회귀 0 셀

| 셀 | ⑧ | ⑫ | 현행 route | (A)+2-가 후 |
|---|---|---|---|---|
| 단건 GB 부담부증여, stale 없음 | 통과 | 통과 | §159 반영 | **불변**(57,552,880 / 91,135,000 / 12,978,240) |
| 단건 GB 부담부증여 + stale(S1·S2·S3·S6) | 통과 | 통과 | 무시 | §159 반영(= S0) |
| 단건 GB 부담부증여 + S4·S5 | 통과 | 통과 | 반영 | **불변** |
| API 직접: BG + `actualPriceMode` false/생략 | — | 통과 | 무시(200) | **400** |
| GB 지분 + 부담부증여 | 통과 | 통과 | 무시 | §159 반영 |
| GB 컴패니언 + 부담부증여(전 자산) | 통과 | 통과 | 무시 | §159 반영 |
| GB 일반 + 부담부증여 혼합 | 차단 | 400 | — | **불변**(차단 유지) |
| GB 지분/컴패니언 일반 양도(부담부증여 아님) | 통과 | 통과 | 141,966,000(C6) | **불변** |
| 비-GB 축 B·컴패니언 부담부증여 | 통과 | 통과 | 40,311,700(C5) | **불변** |
| 증축 비-부담부증여 환산 경로 | 통과 | 통과 | 기존 | **불변** |

신설 anchor(구현 단계): 위 «변경» 셀마다 숫자 anchor + 구조 가드(`gb-route-actual-payload-forwarding.anchor.test.ts`와 같은 층위로 «지분·컴패니언 카드 빌더가 `burdenedGiftInfo`를 버리지 않는다»), 뮤테이션(전달 제거 · `ownershipRatio` 제거 · ④ 라우팅 술어 반전 · 서버 가드 제거).

---

## 7. 800줄 정책 (`wc -l`, base `c7f135041`)

| 파일 | 현재 | 예상 변경 | 판단 |
|---|---:|---|---|
| `app/api/calc/transfer/general-building-part-cards.ts` | 263 | +15 | 여유 |
| `app/api/calc/transfer/general-building-fractional.ts` | 287 | +15 | 여유 |
| `app/api/calc/transfer/general-building-route-actual.ts` | 640 | +5 | 여유 |
| `app/api/calc/transfer/route.ts` | 432 | +3 | 여유 |
| `lib/calc/transfer-tax-api-gb-shares.ts` | 249 | +25 | 여유 |
| `lib/calc/transfer-tax-api-gb.ts` | 597 | ±3 | 여유 |
| `lib/api/transfer-tax-building-schemas.ts` | **749** | +10~15 | ≥750 위험구간 진입 — 지분 PR에서 **기회주의적 분리 검토**(지분 스키마를 별 파일로) |
| `app/api/calc/transfer/bundled-split-helpers.ts` | **776** | 0 (컴패니언은 건드리지 않음) | **건드리지 않는다** — 건드리면 즉시 분리 필요 |
| `lib/calc/transfer-tax-validate.ts` | 561 | 주석 정정 | 여유 |

---

## 8. PR 분할

| PR | 내용 | 크기 | 의존 |
|---|---|---|---|
| **PR-1 결함 2** | ④ `:321` 술어 수정 + 서버 400 안전망(⑫ refine 또는 dispatch) + anchor(S1~S6 K-4/K-5, API 직접 3셀) + Playwright(전환 클릭 후 총납부 = S0) | S | 없음 |
| **PR-2 컴패니언** | `buildGbCompanionItems`/`buildGbPartCards`에 `burdenedGiftInfo` 전달(+`ownershipRatio`는 컴패니언 1.0이라 미사용) + anchor(§2.2 6셀) + E2E(D1-b) | S~M | 없음(PR-1과 독립) |
| **PR-3 지분(축 B)** | ⑫ share `burdenedGiftInfo` · ④ 지분별 info · ⑭ 5-0→fractional→part-cards · `buildActualGeneralBuildingCards`에 `ownershipRatio`→breakdown · `burdenedGiftWholeInfo`(Q-6) · `validate.ts` 주석 정정 + anchor(§2.1 6셀 + 단건 100% 동치) + E2E(D1-a) | M | PR-2 |

각 PR 완료 전 `ui-engine-sync-checker`(14지점) + 브라우저(Playwright) 확인. 별건(축 A GB `ownershipRatio` 미전달)은 포함하지 않는다.

---

## 9. 사용자 결정 Q — **확정 (2026-10-23, 전부 권장안)**

| Q | 질문 | 권장 |
|---|---|---|
| **Q-1** | 결함 1: (A) 지원 구현 vs (B) 명시 차단 | **(A) 확정** — §5 근거 |
| **Q-2** ✅ | (A)일 때 PR 순서: 컴패니언 먼저 · 지분 나중 / 한 PR | 분리(PR-2 → PR-3) |
| **Q-3** ✅ | 결함 2: ④ 라우팅 제외(2-가) vs ⑧ 차단(2-나) vs 선택 시 지우기(2-다) | **2-가**(+ 2-다는 보조로 원하면) |
| **Q-4** ✅ | 서버 안전망: 부담부증여 + 비-실가 payload → **400** vs 실가로 강제 라우팅 | **400**(침묵 라우팅 금지). 강제하면 API 호출자가 보낸 환산·증축이 조용히 무시된다 |
| **Q-5** ✅ | 이미 저장된 이력: 저장된 `resultData`는 그대로 두고 재계산 시 정정(자동 갱신 안 함 — 메모리 «다건 스냅샷 자동갱신» 기각 준수) + 별도 안내 없음 / 이력 화면에 «재계산 권장» 고지 | 안내 없음(재계산으로 정정). 필요하면 고지 문구만 별건 |
| **Q-6** ✅ | 지분 경로의 BG 결과 표시: 컴패니언처럼 `burdenedGiftWholeInfo`로 증여세·§159 명세 카드를 싣기 vs 양도세만(명세 없음 — 현행 비-GB 축 B는 싣는다) | **싣기**(축 B 비-GB와 같은 층위). 단 aggregate가 GB 카드와 함께 받는지 PR-3 Do 1단계에서 확인 |

---

## 10. 미확인 레지스터

| ID | 항목 | 상태 |
|---|---|---|
| V-1 | 지분 취득일이 다른 같은 물건을 한 증여계약으로 부담부증여할 때 §159 B/C를 물건 단위로 보는 근거 — 법문(§159①②)은 지분을 말하지 않는다 | **확인 필요**(저장소 설계 전제만 확인). 해석례 미확인 |
| V-2 | 지분별 취득일이 다른 GB 축 B에서 지분별 K-6/K-7·취득시 기준시가 입력이 ⑤에 모두 있는지(`BurdenedGiftTrancheBasisBlock`은 `needsBgAcqStdPriceInput`이 일반건물에 false) | ⑧은 «자산 2: … 입력하세요»를 요구함은 실측(P1). ⑤ 칸 위치는 **확인 필요**(PR-3 Do) |
| V-3 | 사이드바(⑥) — GB 지분/컴패니언 부담부증여 양도가액 표시가 §159 값을 읽는지 | **확인 필요**(UI 스냅숏 d1a/d1b는 양도차익 행만 확인) |
| V-4 | PR-5b K-5/K-7 × 신축 §114조의2 신호가 지분·컴패니언 카드에서 지분 스케일(`penaltyBase`)과 어떻게 만나는지 | **확인 필요**(PR-5b #2456 CI 중, 병합 후 재측정) |
| V-5 | 축 A(공유 소유) 단건 GB 부담부증여: `ownershipRatio` 미전달이 담보평가·임대평가 승에서 값을 바꾸는지 | **확인 필요**, 범위 밖 |
| V-6 | 옛 이력 중 해당 조합이 몇 건인지 | 확인 불가(로컬 IndexedDB) |
| V-7 | 프로토타입은 컴패니언·지분 «같은 상수» 입력과 목킹으로 쟀다 — 지분별 취득시 기준시가가 다른 경우 등 격자 전수는 PR Do에서 anchor로 확정 | 일부 미실측 |
| V-8 | Playwright 재현은 `next dev --turbopack` + `turbopack.root` 임시 변경(원복 완료)로 수행. 정식 CI 환경 재현은 안 함 | — |

## 11. 재현 방법 (구현 단계 anchor로 옮길 입력)
- 공통: 위 픽스처. 폼 → `callTransferTaxAPI`(fetch 스텁으로 body 캡처) → `POST /api/calc/transfer` 흐름은 `__tests__/calc/axis-b-burdened-gift-plumbing.anchor.test.ts`의 `run()`과 같다.
- 지분: 자산 1 = GB 전체 입력 + `ownershipNumerator 60/denominator 100` + 부담부증여 입력, 자산 2 = `ownershipNumerator 40` + 취득일 + `gbAcqLandPricePerSqm`/`gbAcqBuildingValue`(지분 카드는 ② 숨김 → `transferType` 기본 «일반»), `assetSplitMode: "fractional"`, `contractTotalPrice` 입력.
- 컴패니언: GB 두 자산 모두 부담부증여 + `assetSplitMode: "companion"`.
- stale: 일반 양도 입력(`useEstimatedAcquisition: true` 또는 `gbHasExtension` + 증축 필수칸 + `fixedAcquisitionPrice`) 시드 후 UI에서 양도 형태 라디오만 부담부증여로 전환.
