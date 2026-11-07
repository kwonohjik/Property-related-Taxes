# 다주택 중과 묶음의 남은 범위 밖 항목 (2026-11-08)

> 근거: `docs/00-pm/roster-fallback-surcharge-bundle.plan.md` §4 · `docs/00-pm/carryover-surcharge-suspension-holding.plan.md` §6.
> 기준 커밋 origin/master `38ae2b4a6`. 세율은 mock(`makeMockRatesWithHouseEngine`) — 정본 세액이 아니다. 기대값은 같은 입력의 명부(정밀) 경로와 대조해 얻었다.

## 1. 항목별 판정

| # | 항목 | 실측 | 처리 |
|---|---|---|---|
| A | 겸용주택 자산별 fallback(`asset.surchargeFallback`) — 위기취득 · 감면주택 · 한시배제 보유 2년 | 🔴 세 축 모두 명부 경로와 다르다 (§2) | 고친다 |
| B | §99·§99의3·§98의8 5년 후 양도의 `MISSING_STD_PRICE` 선판정 | 🔴 기준시가 하나만 비면 중과 배제가 사라진다 (§3) | 고친다(엔진 + §98의8 ⑧) |
| C | 상속 컴패니언 겸용 파트 카드의 세율군 표시 | 표시만 틀림 — 세액 같음 (§4) | 고친다 |
| D | 재개발 결과의 `rateSurchargeStatutoryExcluded` echo | 영향 없음 (§5) | 닫는다 |
| E | US-19 「토글에 근거 조문 선택」 대안 | — | 사용자 결정(2026-11-07)으로 하지 않는다 |
| F | 이월과세 자산의 화면 게이트(④ 중과 섹션 숨김 등) | 질문만 더 보임 · 세액 무관 | 그대로 둔다 — §97의2②3호 적용 여부가 계산 뒤에 정해진다(선행 계획서 §6) |
| G | `transfer-tax.ts` 751줄 · `transfer-tax-rental-housing-step.ts` 762줄 | 800 미만 | 분리하지 않는다(트리거 800) — `transfer-tax.ts`는 C로 +2줄(753), 임대 스텝은 변경 없음 |

## 2. A — 겸용주택 fallback

`transfer-tax-mixed-use.ts`가 `resolveSurchargeApplication`에 취득일·감면 배제 표지를 넘기지 않고(`acquisitionDate`·`surchargeExcludedByReduction` 없음),
감면주택 선판정(`judgeMixedUseMultiHouseSurcharge`)은 명부가 있을 때만 돈다.

실측(엔진 직접 · `mixedUseCase14` · 토지·건물 취득일을 같게 바꿈):

| 셀 | 명부 | fallback(수정 전) |
|---|---|---|
| 위기취득 2010-06-01 · 2주택 · 양도 2026-06-01 · 11억 | 291,164,337 (세율 기본 · 장특 배제) | 368,585,036 (+20%p) |
| 보유 1년 6개월(2024-09-01) · 한시배제 창 양도 2026-03-01 · 30억 | 1,285,421,105 (§104⑦ 비교과세) | 1,283,183,922 (한시배제) |
| 같은 셀 · 60억 | 2,676,077,013 | 2,598,788,362 |
| §99의3 적격 · 3주택 · 2003-09-01 취득 · 양도 2026-06-01 · 11억 | 179,169,333 (중과 배제 + 주택분 차감) | 318,535,333 (차감만 · +30%p) |

처방
- fallback 사실(`propertyType: "housing"` · 조정 · 주택 수 · **건물 취득일**)을 한 헬퍼로 만든다. 건물 취득일은 ④가 명부 양도 행에 싣는 값(`transfer-tax-api-mixed-use.ts` `buildingAcquisitionDate: primary.acquisitionDate`)과 같다.
- 감면주택 선판정을 fallback 후보일 때도 돌린다(단건 `transfer-tax-precalc.ts`의 `isFallbackSurchargeCandidate` 게이트와 같다). 배제되면 같은 단계·고지를 남긴다.

## 3. B — §99·§99의3·§98의8 기준시가 미입력

세 조문 모두 요건 판정을 끝낸 뒤 공제액 계산 단계에서만 `MISSING_STD_PRICE`·`ALLOCATION_DENOMINATOR_ZERO`를 낸다
(`new-99.ts` 7단계 · `new-99-3.ts` STEP 3 · `unsold-98-8.ts` 요건 `reasons` 반환 뒤). 그런데 라우터의 `requirementsMetId`는
하이브리드(US-35)와 §98의8 분모 0(NH-76)에만 있어, 세 조문은 기준시가 하나만 비어도 「감면되는 주택」이 아니게 됐다.

실측(단건 · 3주택 · 조정 · 양도 2026-07-01 · 명부·fallback 같음):

| 조문 | 기준시가 다 있음 | 양도시 또는 5년시점 비움(수정 전) | 「5호 선언 · 감면 없음」 대조 |
|---|---|---|---|
| §99의3 (2003-09-01 취득) | 105,171,000 | 433,686,000 (중과) | 155,166,000 |
| §99 (1999-03-01 취득) | 95,595,000 | 433,686,000 | 155,166,000 |
| §98의8 (2015-07-01 취득) | 134,166,000 | 433,686,000 | 176,286,000 |

조문: 소령 §167의3①5호 「…에 따라 양도소득세가 감면되는 주택」. 기준시가는 요건이 아니라 공제액 계산 인자다(조특령 §40① 준용 — 리뷰 US-35 근거와 같다).

처방
- 엔진: 세 조문도 사유가 계산 인자(`MISSING_STD_PRICE`·`ALLOCATION_DENOMINATOR_ZERO`)뿐이면 `requirementsMetId`를 싣는다 — 차감은 0 그대로, 중과 배제만 유지. `MISSING_PREVIOUS_STD_PRICE`(§99 재개발 변형)는 넣지 않는다(⑧이 막고, 이번 리뷰 결정 범위 밖).
- ⑧: §99·§99의3은 이미 막는다(NH-25 · `burdened-gift-bundle-hidden-stdprice`). **§98의8만 5년 후 양도 기준시가를 묻지 않는다** — ⑤ 제목은 「5년이 지난 후 양도 시 필수」라 ⑤↔⑧ 모순이다.
  하이브리드와 같은 헬퍼(`failIfStdPriceMissingOver5Y` — 리뷰 Q-3 결정 (A))로 막는다. PHD 환산 모드 충분성 검사도 §98의7과 같은 규칙을 쓴다.

## 4. C — 상속 컴패니언 겸용 파트 카드의 세율군

실측(route · `transfer.route.companion-mixed-use-acq-cause-nh14` 상속 셀 · 총세액 208,214,285 불변): 주택 토지·건물 카드가 `rateGroup: "multi_house_surcharge"`인데 `rateClause: "104-1-1"`(기본세율)이다.
같은 취득일의 증여 셀은 `progressive`다.

원인: 상속 파트 카드는 양도차익이 0 이하라 차손 조기반환(`transfer-tax-loss-return.ts`)을 탄다. 이 반환이 `rateSurchargeStatutoryExcluded`를 싣지 않아,
다건 분류(`classifyRateGroup`)가 원시 플래그(조정 · 주택 수)로 중과 세율군을 붙였다. 정상 반환(`transfer-tax-normal-return.ts`)은 싣는다.

처방: 차손 반환의 표시용 세율 echo(`rateEcho`)에 같은 술어(`resolveSurchargeApplication`)의 `rateSurchargeStatutoryExcluded`를 더한다. 세액·통산 키(`lossOffsetRateKey`)는 바뀌지 않는다.

## 5. D — 재개발 결과 echo (닫음)

실측(단건·다건 · 재개발APT · 조정 · 2주택 · 양도 2026-09-18): 위기취득(2010-06-01)이면 명부·fallback 모두 단건 697,935,000 · 다건(차손 토지 동반) 668,728,500이고 세율군 `progressive`다 — 일반 주택(`housing`)과 같다.
재개발 경로는 위기취득일 때 `surchargeType`을 싣지 않아 분류가 원시 플래그 분기로 가지 않는다(`isHousingLike`에 `redevelopment_apt` 없음). 고칠 결함이 없다.

## 6. anchor

- `__tests__/tax-engine/transfer/surcharge-oos-mixed-use-fallback.anchor.test.ts` — A 세 축 명부 = fallback.
- `__tests__/tax-engine/transfer/surcharge-oos-std-price-requirements.anchor.test.ts` — B 세 조문 × 두 칸 = 「5호 선언 · 감면 없음」 대조, 요건 부적격 대조.
- `__tests__/api/transfer.route.companion-mixed-use-acq-cause-nh14.anchor.test.ts` — C 세율군 단언 추가.
- ⑧ — `__tests__/calc/transfer-validate-98-8-std-price.test.ts`(5년 후 · 5년 이내 · 환산 모드 자산값 통과).

## 7. 검증 · 검토 반영

- vitest 46,840건 통과. 실패 1건은 기존 간헐 실패(`sale-split-unentered-notice` C-1 — origin/master에서도 실패). 뮤테이션 6건(A 취득일 · A 감면 표지 · A 선판정 게이트 · B 라우터 · C 차손 echo · ⑧ §98의8) 모두 테스트가 잡음. E2E 로컬 26건 통과(입력칸 이동 §98의8 8건 포함).
- `acquisition-cost-review` 게이트: FAIL 없음. 확인 필요로 받은 항목:
  - §99의3 STEP 1 요건 실패는 STEP 3(`MISSING_STD_PRICE`) 앞에서 반환한다 — 직접 확인.
  - 겸용 고지(`mixedReductionSurchargeExclusionNotice`)는 §99·§99의3이면 「차감 미반영」 꼬리를 붙이지 않는다. 기준시가 미입력으로 차감이 0이어도 겸용 엔진은 NH-33 경로로 차감을 **계산한** 것이라(사유가 그 단계에 남는다) 꼬리를 붙이지 않는 것이 맞다.
  - §98의8 PHD 충분성 검사는 5년 이내 양도에서도 막는다 — §98의3·§98의7 등 형제 조문과 같은 규칙이다(이번에 바꾸지 않음).
  - 🔍 **확인 필요(범위 밖 · 종전부터)**: 겸용주택 + 이월과세(`carryover_gift`) + 자산 취득일 빈 값이면 명부 행은 증여 등기접수일 fallback(`primaryAcquisitionDateOf`)을, 겸용 엔진 입력(`transfer-tax-api-mixed-use.ts` `buildingAcquisitionDate`)은 원시값을 쓴다. fallback도 겸용 엔진의 다른 날짜와 같은 값을 보므로 이번 변경이 만든 차이는 아니다. 화면에서 이 조합이 닿는지는 확인하지 않았다.
- 브라우저 수동 확인: 하지 않음(엔진·⑧ 변경 — 계산 화면 경로는 E2E로 확인).
