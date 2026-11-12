# 부담부증여 시가 모드 — 양도 주택 「양도 당시 기준시가」 칸 누락 (O-5) 계획서

> 2026-11-12 · 코드 읽기 + throwaway probe 실측 + 법령 본문 조회. 출처: 메모리 «기준시가 칸 O-4·O-5» (`calc-selling-house-std-price-value-region.plan.md` PR-1·PR-2 범위 밖 2건).
> 표기: [직접] = 이번에 코드·법령·실측으로 확인 · [해석] = 읽은 것에서 이은 추론 · [확인 필요] = 미검증.
> 상태: **계획 — Q 결정 대기.** 결정 후 같은 PR에서 구현한다(워크플로).

## 0. 결론

| # | 질문 | 결론 |
|---|---|---|
| 1 | O-5가 지금도 열려 있는가 | **열려 있다.** 부담부증여(BG) 시가 모드(환산 아님)에서는 양도 주택의 양도 당시 기준시가를 받는 칸이 화면에 없고, 비우면 엔진 backstop이 «주택 수에 산입 + 중과 판정»으로 읽는다(세액 증가 방향). 사용자가 값을 넣어 풀 방법이 없다 [직접: probe]. |
| 2 | 코드가 적은 «막힌 이유»(칸을 열면 §159 안분 분모가 함께 움직일 수 있다)가 사실인가 | **단건 시료에서는 사실이 아니다.** 같은 시료에서 칸 값을 비움/4억으로 바꿔도 결정세액이 80,975,000으로 같다 — 이 값은 안분에 쓰이지 않고 §167의3①1호 판정(양도 주택 행 `officialPrice`)에만 닿는다 [직접: probe 1표본]. 주 본문 `standardPriceAtTransfer`는 BG 시가 비환산이면 엔진에 실리지 않는다는 주석(`burdened-gift-transfer-price-scope.ts:109-112`)과 일치. 축 B·함께 양도는 **미측정(V-1)**. |
| 3 | 어떻게 푸는가 | **칸을 새로 만들지 않는다.** 기존 `SellingStdPriceField`(양도 정보 카드)·⑧·④가 이미 같은 값을 읽는다. 범위 술어 `isHouseSale`(`selling-std-price-scope.ts:36-41`)가 BG 시가를 통째로 제외해서 칸이 안 그려질 뿐이다. 그 제외를 «BG 시가 비환산 단건 주택»만 풀면 ⑤⑧④가 따라온다 [해석 — 구현 시 확인]. 엔진·API(⑫⑬⑭)는 안 바뀐다(전용 키 `sellingHouseStdPriceAtTransfer`가 이미 있다). |
| 4 | O-4(겸용)는 | **이번 범위 밖 — 기능 제약, 근거 미확보.** 현행 소령 §167의3①1호는 «해당 주택 및 이에 부수되는 토지의 기준시가의 합계액이 … 3억원을 초과하지 않는 주택»일 뿐 겸용주택(주택분만 볼지)을 정하지 않는다 [직접: KoreanLaw 본문, MST 290841]. 국세청 해석례·조세심판 재결례 검색 0건. 겸용 분리계산은 2022.1.1. 이후 양도분만 지원(⑧)이라 닿는 구간도 좁다. 근거 확보 전에는 칸을 만들 수 없다. |
| 5 | 닿는 시기 | 가액기준 지역(수도권·광역시·특별자치시 밖) ∧ **양도일 현재 조정대상지역** ∧ 양도일 2018-04-01 이후. 지방 조정대상지역 해제 이후 양도에는 칸이 열리지 않는다(`sellingStdPriceInScope`가 `effectiveIsRegulatedAtTransfer`로 거른다). 해제 시점은 앱 데이터 기준 [확인 필요]. |

## 1. 사실

### 1.1 코드 [직접]
- `lib/calc/selling-std-price-scope.ts:36-41` `isHouseSale` = 주택·완공 재개발 APT ∧ `!isMixedUseHouse` ∧ `!stdPriceAtTransferComesFromElsewhere(asset)`. 머리 주석(:13-16)이 BG 시가를 범위 밖으로 둔 이유를 «칸을 열면 중과와 무관한 안분 분모가 함께 움직일 수 있다»로 적었다.
- `lib/calc/burdened-gift-transfer-price-scope.ts:92-115` `stdPriceAtTransferComesFromElsewhere` = BG ∧ (일반건물 ∨ 겸용 BG ∨ 입주권 ∨ **시가 모드 ∧ (환산 아님 ∨ 의제취득일 전)**). 시가 모드 비환산의 §159 분모(C)는 `bgMarketValueAtTransfer`가 받고, K-5(환산)만 `standardPriceAtTransfer`를 환산 분모로 쓴다(그때는 공용 칸이 이미 있다).
- `components/calc/transfer/asset-sections/AssetSectionTransfer.tsx:84-100` `showSellingStdPrice` = 첫 자산 ∧ `sellingStdPriceInScope` ∧ `!sellingStdPriceInputElsewhere(...)`; :195-202 `SellingStdPriceField`. BG 시가에서는 `sellingStdPriceInScope`가 거짓이라 안 그려진다.
- `lib/calc/transfer-tax-validate-asset.ts:411-414` ⑧ = 첫 자산 `sellingStdPriceIssue` (같은 leaf). `lib/calc/transfer-tax-api-houses.ts:142` ④ 양도 주택 행 `officialPrice` = `sellingHouseStdPriceAtTransfer(asset)` — 칸이 화면에 없어도 store의 `standardPriceAtTransfer`를 그대로 읽는다.
- 기존 anchor `__tests__/calc/selling-std-price-scope.test.ts:42`가 «부담부증여 시가 모드 — 범위 밖» = `[false,false]`로 고정한다(구현 시 반전 대상 — 공유 단언 반전이라 형제 안전망을 같이 본다).

### 1.2 실측 [직접: throwaway probe, origin/master 695c1bd7a]
공통: 양도 2021-06-01 · 전주 완산구(가액기준 · 2020-12-18~2022-09-26 조정대상지역) · 명부 강남 2채(공시가 5억) · BG 시가 모드(`sangjeungbeop_market`, 시가 10억, 환산 아님, 취득 실가 5억, 채무 3억).

| 양도 주택 기준시가(`standardPriceAtTransfer`) | ④ 양도 주택 행 | 판정 | 결정세액 |
|---|---|---|---|
| 비움(현행 화면 상태) | 0 | 3주택 이상 중과 — **backstop 산입** | 80,975,000 |
| 4억 (화면에 칸이 없어 폼에 직접 넣음) | 400,000,000 | 3주택 이상 중과 | 80,975,000 |
| 2.5억 | 250,000,000 | 1호 배제 — 2주택·중과 없음 | 30,425,000 |

- 비움 = 4억 → 값이 안분 분모를 움직이지 않는다. 2.5억만 1호로 갈린다 → **차이 50,550,000원은 중과 판정에서만 난다.**
- 비움일 때 결과 `multiHouseSurchargeDetail`에 «기준시가가 입력되지 않아 지방 저가주택(…§167의3①1호) 해당 여부를 판정하지 못했습니다 — 주택 수에 넣고 중과를 판정했습니다»가 나온다. 일반 `warnings`에는 안 나온다.
- 대조(일반 매매·실가): 같은 시료에서 비움은 ⑧이 막고, 4억은 322,850,000(3주택 이상 중과)이다 — BG 시가만 막지 않고 조용히 산입한다.
- 시료는 BG·시가·비환산·실가 취득 한 점이다. 축 B·함께 양도·의제취득일 전·§159 상세는 **측정하지 않았다(V-1).**

## 2. 설계 (최소 변경)

1. **leaf 한 곳:** `selling-std-price-scope.ts`의 `isHouseSale`에서 `stdPriceAtTransferComesFromElsewhere`를 그대로 두되, «BG 시가 비환산이고 의제취득일 전 아님»이라는 한 갈래만 예외로 허용하는 술어를 `burdened-gift-transfer-price-scope.ts`에 둔다(예: `bgMarketHidesStdPriceOnly`). 일반건물·겸용·입주권 갈래는 범위 밖 그대로.
2. ⑤ `showSellingStdPrice`(`AssetSectionTransfer.tsx:84-100`)는 `sellingStdPriceInputElsewhere(asset, !comesFromElsewhere && …)`로 이미 BG를 «다른 칸 없음»으로 읽는다 — 술어만 바뀌면 칸이 그려진다 [해석 — 구현 시 렌더 anchor로 확인].
3. ⑧(`sellingStdPriceIssue`)·④(`buildHousesPayload`·`sellingHouseStdPricePayload`)는 같은 leaf라 따라온다. ⑫⑬⑭·엔진·타입은 변경 없음.
4. 칸 문구는 기존 hint 그대로 — 새 문구에서 «안분에 쓰이지 않는다»를 주장하지 않는다(1표본 실측과 코드 주석뿐이라 단정하지 않는다).

## 3. 결정 요청 (Q 레지스터)

### Q-1. 범위
| 안 | 내용 |
|---|---|
| **a (권고)** | BG 시가 **비환산 ∧ 의제취득일 전 아님 ∧ 일반건물·겸용·입주권 아님**만 연다. 의제취득일 전(의제 섹션이 분모 칸을 받음)과 O-4(겸용)는 그대로 범위 밖. |
| b | 의제취득일 전 BG 시가까지 연다 — 의제 섹션의 칸과 중복될 수 있어 렌더 격자 측정이 선행돼야 한다. 규모 확대. |
| c | 연다 대신 닫는다: «기능 제약 + 중과 상세 고지»로 기록하고 끝낸다(사용자가 이미 b(구현)를 택했으므로 비권고). |

### Q-2. 칸 문구
| 안 | 내용 |
|---|---|
| **a (권고)** | 기존 hint 재사용(가액기준이면 «3억원 이하면 주택 수에 넣지 않고 중과하지 않습니다» / 지역기준이면 선택). |
| b | BG 시가 전용 보조 문구를 더한다 — 안분과 무관하다는 주장이 필요해 V-1 측정 후에만 가능. |

## 4. 검증 계획

- **구현 전 측정(V-1, Pre-Do):** (i) 함께 양도(컴패니언) BG 시가, (ii) 축 B(지분) BG 시가, (iii) 의제취득일 전 BG 시가에서 칸 값을 비움/4억/2.5억으로 바꿨을 때 결정세액·`houses[selling].officialPrice`·§159 상세 비교. 안분이 움직이는 조합이 나오면 그 조합은 Q-1 a의 제외 조건에 넣는다.
- **anchor:** (1) `selling-std-price-scope.test.ts` BG 시가 행을 `[true,true]`로 반전 + 제외 갈래(일반건물·겸용·입주권·의제 전·환산은 기존 칸) 대조군 · (2) ⑧ BG 시가 비움 차단/값 통과 · (3) ④→⑭ route: 비움 80,975,000(3주택 이상) / 4억 80,975,000 / 2.5억 30,425,000 (BG 안분 불변 단언) · (4) `AssetSectionTransfer` 렌더 `calc-selling-std-price` testid.
- **뮤테이션(백업/복원·`cmp`):** 예외 술어 제거 · 의제 전 제외 제거 · 환산 제외 제거 · ⑧ 가드 제거 · ④ 읽기 제거.
- **회귀:** `__tests__/api` · `tax-engine` · `calc` · `lib` · `components` 5묶음 + tsc(힙 8GB) + eslint. Playwright는 칸 노출·⑧ 흐름이라 기존 `calc-selling-std-price` E2E가 없으면 신규 1건 [확인 필요 — e2e 디렉터리에서 testid 검색 결과 0건].

## 5. 미검증 · 확인 필요

- **V-1** 축 B·함께 양도·의제취득일 전 BG 시가에서 칸 값이 세액(안분)에 닿는지 — 위 «구현 전 측정».
- **V-2** 닿는 시기(지방 조정대상지역 해제 시점)는 앱의 조정대상지역 데이터 기준. 법령 연혁 직접 조회는 하지 않았다.
- **V-3** 양도 주택이 BG이고 «양도 당시 기준시가»가 §159 안분 분모 C(시가)와 별개 개념임을 법령(소령 §159①1호 · §167의3①1호) 대조로 확인하지 않았다 — 코드 구조(별개 입력 경로)와 1표본 실측만 근거.
- **O-4 겸용:** 근거 확보가 착수 조건. 해석례 0건(국세청 법령해석·조세심판원 «겸용주택 기준시가 3억원» 검색).
