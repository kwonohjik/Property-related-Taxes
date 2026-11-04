# 증여 겸용주택 「증여 신고가액」 칸 — 쓰이지 않는 필수 칸 · 컴패니언 ⑧ 통과 ↔ ⑫ 400 계획서

> 작성 2026-11-04 · 상태: **Q 전부 권장안(a)으로 구현**(§8) · 실측 master 845b6262e (throwaway probe 2건 · 삭제)
> 선행: #2898(주 자산 겸용 묶음 상속·증여 평가액 카드 중복 — 이 건을 별건으로 분리, 그 계획서 Q-3 a)
> 선례: `docs/00-pm/gb-companion-gift-fixed-acq-price.plan.md`(일반건물 분리 ON — 같은 칸을 `hideFixedAcquisitionPrice`로 숨기고 ⑫ 면제)

## 0. 결론

증여받은 겸용주택에서 취득정보 섹션의 「증여 신고가액 (원)」 칸은 **세액에 쓰이지 않는다**. 그런데 화면은 그 칸을 **필수**로 보인다.

1. **헷갈리는 두 칸.** 겸용이 실제로 쓰는 값은 「주택 기준시가」·「상가 기준시가」 섹션의 「증여일 신고가액 직접 입력 (선택)」 두 칸(주택분·상가분)이다. 필수 칸에만 신고가액을 넣고 선택 칸을 비우면, 입력한 신고가액은 버려지고 취득 당시 기준시가(보충적 평가)로 계산된다 — 오류 없이.
2. **막다른 길.** 이 겸용주택이 둘째 자산(함께 양도)이거나 지분 분할의 둘째 지분이면, 그 칸을 비웠을 때 ⑧은 통과하고 ⑫가 400(「증여 자산은 신고가액(취득가액) 필수」)을 낸다.

상속 겸용은 같은 칸(`publishedValueAtInheritance`)을 이미 숨기고 안내 카드를 띄운다 — 증여 블록만 비대칭이다.

## 1. 실측

### 1.1 세액 — 신고가액 칸 값이 세액을 바꾸지 않는다

공통: 겸용(주택 100㎡ · 상가 60㎡ · 대지 200㎡ · 비조정) · 증여 2022-10-01 · 양도 2023-09-18 · 묶음은 토지(매매) 함께 양도 · 계약 총액 12억(단건 10억). mock 세율(`transfer.route.mixed-primary-inherited-acquisition-dup.anchor.test.ts` 시료와 같음).

| 배치 | 주택분·상가분 증여 평가액 칸 | 신고가액 빈칸 | 6억 | 9억 |
|---|---|---|---|---|
| 단건 | 비움 | 309,240,696 | 309,240,696 | 309,240,696 |
| 주 자산 묶음 | 비움 | 310,621,069 | 310,621,069 | 310,621,069 |
| 둘째 자산 | 비움 | **400** | 310,621,069 | 310,621,069 |
| 지분 60/40 | 비움 | **400** | 309,240,696 | 309,240,696 |
| 단건 | 4억 · 2억 | 252,865,696 | 252,865,696 | 252,865,696 |
| 주 자산 묶음 | 4억 · 2억 | 254,246,069 | 254,246,069 | 254,246,069 |
| 둘째 자산 | 4억 · 2억 | **400** | 254,246,069 | 254,246,069 |
| 지분 60/40 | 4억 · 2억 | **400** | 252,865,696 | 252,865,696 |

- 400 본문(전부 같음): `fieldErrors["companionAssets.0.fixedAcquisitionPrice"] = ["증여 자산은 신고가액(취득가액) 필수"]`. ⑧ `collectStepIssues`(0~3단계)는 전 행 0건.
- 주택분·상가분 평가액 칸이 세액을 움직인다(309,240,696 → 252,865,696) — 겸용이 쓰는 칸은 이쪽이다.

### 1.2 §163⑨ 단서 구간도 같다

`transfer.route.mixed-use-sec163-9-compare.routes.anchor.test.ts` 시료(강남 · 양도 2024-08-20 · 단건):

| 시료 | 채택 | 신고가액 빈칸 | 6억 | 30억 |
|---|---|---|---|---|
| 1980 증여 · ① 9억 + 3억 | reported | 544,213,809 | 같음 | 같음 |
| 1980 증여 · ① 4.5억 + 1억 | converted | 744,422,534 | 같음 | 같음 |
| 1990 증여 PHD · ① 9억 + 1억 | reported | 619,228,500 | 같음 | 같음 |
| 1990 증여 PHD · ① 비움 | standard | 780,004,500 | 같음 | 같음 |

① 후보도 주택분·상가분 평가액 칸에서 온다(⑧ `transfer-tax-validate-mixed-use-inheritance.ts:52-67` · Q-16 · Q-19).

### 1.3 상속 겸용(짝)

같은 매트릭스에서 `publishedValueAtInheritance` 빈칸·6억·9억도 세액이 같고(단건 173,866,000 · 묶음 208,837,200 · 평가액 칸 4억·2억이면 146,366,000 · 180,510,000), **400은 없다**. 화면도 그 칸을 숨긴다.

## 2. 현행 코드

| 지점 | 위치 | 현행 |
|---|---|---|
| ⑤ 증여 블록 마운트 | `components/calc/transfer/CompanionAcquisitionCauseSection.tsx:339-351` | 겸용 여부를 보지 않고 `CompanionAcqGiftBlock`을 그린다 · `hideFixedAcquisitionPrice`를 넘기지 않는다 |
| ⑤ 신고가액 칸 | `components/calc/transfer/CompanionAcqGiftBlock.tsx:89` · `:103-112` | `hideFixedAcquisitionPrice`(일반건물 분리 ON 선례)면 숨김 · 아니면 `required` |
| ⑤ 상속 짝 | `components/calc/transfer/CompanionAcqInheritanceBlock.tsx:195-228` | `isMixedUse`면 평가액 입력을 숨기고 violet 안내 카드(「주택 기준시가·상가 기준시가 섹션의 상속개시일 입력에서 산정」) |
| ⑤ 실제 칸 | `components/calc/transfer/mixed-use/MixedUseAssetMajorStdPrice.tsx:248-259`(주택분) · `:445-447`(상가분) | 「증여일 신고가액 직접 입력 (선택)」 |
| ④ 겸용 | `lib/calc/transfer-tax-api-mixed-use.ts:343-352` | `housing/commercialInheritedValue` ← `mixed*GiftValueOverride` · `fixedAcquisitionPrice`는 매매 게이트 안(`:59-73` · `:397`)에서만 읽는다 |
| ⑧ 겸용 | `lib/calc/transfer-tax-validate-acquisition.ts:371-379` | 겸용이면 `validateMixedUseAsset`로 분기 — 일반 증여 「증여 신고가액을 입력하세요」(`:621-623`)에 닿지 않는다 |
| ⑫ 컴패니언 | `lib/api/transfer-tax-schema-companion-refines.ts:143-149` | 증여 컴패니언은 `burdenedGiftInfo`·일반건물 토지 파트 값이 없으면 `fixedAcquisitionPrice` 필수 — 겸용(`c.mixedUse`) 면제 없음 |
| ⑫ 같은 파일 선례 | 같은 파일 `:275` | 다른 규칙은 `c.mixedUse !== undefined`면 건너뛴다 |

부담부증여 겸용은 범위 밖이다 — `isBurdenedGift`가 참이라 신고가액 칸 대신 §159 안내(또는 `bgPartReportedElsewhere`로 빈 자리)를 그리고, 의제취득일 전 3자 비교(`bgPreDeemedUsesThreeWay`)는 `isBgPreDeemedAsset`이 겸용을 빼므로(`lib/calc/bg-pre-deemed.ts:27`) 칸이 열리지 않는다.

## 3. 법문

「소득세법 시행령」 제163조 제9항 — 증여받은 자산의 취득가액은 증여일 현재 「상속세 및 증여세법」 제60조~제66조 평가액(세무서장등이 결정·경정한 가액이 있으면 그 가액)이다. 겸용주택은 주택분·상가분을 따로 계산하므로(「소득세법 시행령」 제154조 제3항 단서 · 「소득세법」 제100조 제2항) 그 평가액도 부분별로 받는다 — 현행 ④가 그렇게 싣는다. 이 계획서는 계산 규칙을 바꾸지 않는다.

## 4. 설계 후보

### Q-1 화면(⑤) — 겸용 증여의 「증여 신고가액」 칸
- **a (권장)** 숨기고 안내 카드를 띄운다: `hideFixedAcquisitionPrice={asset.isMixedUseHouse}` + 상속 블록과 같은 violet 카드(「겸용주택은 증여일 평가액을 주택분·상가분으로 나눠 아래 "주택 기준시가"·"상가 기준시가" 섹션의 "증여일 신고가액" 칸에 입력합니다」). 증여일·증여자 취득일 칸은 그대로. 상속 겸용과 같은 모양이 되고, 두 신고가액 칸이 경쟁하지 않는다.
- b: 숨기기만 한다(일반건물 분리 ON 선례). 사용자가 신고가액을 어디에 넣는지 화면이 말하지 않는다.
- c: 칸을 두고 값을 주택분·상가분에 나눠 쓴다 — **자동 안분 fallback 금지**(CLAUDE.md)에 걸려 권하지 않는다.

### Q-2 ⑫ — 컴패니언 겸용 증여의 `fixedAcquisitionPrice` 필수
- **a (권장)** 면제한다: `giftPriceFromOtherSource`에 `c.mixedUse !== undefined`를 더한다(같은 파일 `:275` 선례). ⑧은 이미 요구하지 않는다 → ⑧ 통과 ↔ ⑫ 400 해소.
- b: ⑧에 같은 요구를 더한다 — Q-1 a·b와 함께면 숨긴 칸을 채우라고 막는 막다른 길이 된다. Q-1을 「칸 유지」로 고를 때만 가능.

### Q-3 이미 들어 있는 값(잔재)
- **a (권장)** 지우지 않는다. 일반 주택 → 겸용 전환·이력 불러오기로 값이 남아도 세액 0 영향(1.1·1.2 실측 — #2898 뒤 파트 카드도 중화). #2898 Q-2 a와 같은 판단.
- b: 겸용 토글 시 `fixedAcquisitionPrice`를 비운다 — 겸용을 다시 끄면 일반 주택 값이 사라진다.

## 5. 결정 요청

| # | 질문 | 권장 |
|---|---|---|
| Q-1 | 화면 칸 | **a** 숨김 + 안내 카드 |
| Q-2 | ⑫ 필수 | **a** 컴패니언 겸용 면제 |
| Q-3 | 잔재 값 | **a** 그대로 |

세액은 바뀌지 않는다(1.1·1.2). 바뀌는 것: 둘째 자산·지분 분할 빈칸 400 → 200, 화면의 필수 칸 1개 사라짐.

## 6. Do 순서 (Q 전부 a일 때 · 1 PR · 반나절)

1. Pre-Do anchor(빨간불): 둘째 자산·지분 60/40 × 신고가액 빈칸 → 200 · 세액 310,621,069 / 309,240,696. → verify: 현행 400으로 실패.
2. ⑫ 면제 1줄 → verify: 1번 통과 · 신고가액 값 6억/9억 행 불변(위치·값 불변 짝).
3. ⑤ 숨김 + 안내 카드 → verify: jsdom 렌더(겸용 증여 = 칸 없음·안내 있음 / 일반 주택 증여 = 칸 있음·필수 / 겸용 상속 불변).
4. E2E: 겸용을 둘째 자산으로 두고 화면에서 신고가액 없이 계산 → 200. 뮤테이션(⑫ 줄 되돌림 → 실패).
5. 회귀 `__tests__/api` `__tests__/calc` `__tests__/components` `__tests__/lib` · tsc · acquisition-cost-review 게이트.

## 7. 확인 필요

- **V-1 (측정함 · 별건)** 사이드바 계산 전 「취득가액」은 숨은 칸 값을 보인다 — `directAcqRaw`(`lib/stores/transfer-per-asset-direct.ts:137`)가 `fixedAcquisitionPrice`를 읽는다. 신고가액 6억 · 주택분·상가분 칸 비움: 계산 전 600,000,000(지분 60/40은 360,000,000 · 240,000,000) → 계산 후 537,500,000(엔진 · `mixedUseDisplayedAcqPrice`). 계산 후는 전 배치 엔진 값과 같다. 이 변경 **전부터** 있던 표시 문제이고(칸이 보일 때도 같은 값), 상속 겸용 단건도 숨은 `publishedValueAtInheritance`를 계산 전에 보인다(600,000,000 → 537,500,000 · 묶음·지분은 계산 전 0). 세액 무관 · 이 PR 범위 밖 — 상속·증여 겸용 계산 전 사이드바 별건.
- **V-2** 결과 화면·신고서 PDF·이력 불러오기에서 겸용 증여의 신고가액 칸 값이 쓰이는지 — 결과는 엔진 값이라 쓰이지 않을 것으로 보이나 측정하지 않았다.
- **V-3** 다건(⑪ 다건 신고) 경로의 겸용 증여 — 측정하지 않았다.
- **V-4** 주 자산 ④가 겸용 증여에도 `inheritedAcquisition`을 싣는다(#2898 계획서 — 파트 카드가 중화). 칸을 숨겨도 잔재 값은 계속 실린다 — 세액 무관(실측)이나 ④ 대칭(컴패니언 `ownsAcquisitionSubobject`)은 이 범위 밖.
- **V-5** `e2e/mixed-primary-inherited-acquisition-dup.spec.ts:2` 머리 주석이 「증여 신고가액 입력」을 적는다 — 시드로 값을 넣으므로 동작 영향은 없고, 문구만 낡는다.

## 8. 구현 (2026-11-04 · 워크트리 -mgf)

- ⑫ `lib/api/transfer-tax-schema-companion-refines.ts` — `giftPriceFromOtherSource`에 `c.mixedUse !== undefined`(Q-2 a).
- ⑤ `CompanionAcqGiftBlock.tsx` — prop `mixedUseReportedElsewhere`: 부담부증여가 아니면 칸 대신 violet 안내 카드 · `CompanionAcquisitionCauseSection.tsx`가 `!!asset.isMixedUseHouse`로 넘긴다(Q-1 a). 증여일·증여자 취득일 칸은 그대로. Q-3 a — 잔재 값은 지우지 않는다.
- anchor `__tests__/api/transfer.route.mixed-gift-fixed-acq-price.anchor.test.ts` 9건(Pre-Do 6건 빨간불 → 통과 · 짝: 4배치 × 빈칸·6억·9억 세액 불변 · 일반 주택 증여 둘째 자산은 여전히 ⑧·⑫ 필수).
- 렌더 `__tests__/components/mixed-gift-fixed-acq-price.render.test.tsx` 4건(겸용 증여 안내 · 짝: 일반 주택 증여 칸 · 부담부증여 겸용 · 상속 겸용).
- E2E `e2e/mixed-gift-fixed-acq-price.spec.ts` MGF-1(둘째 자산 · 칸 없음 + 안내 · 계산 200).
- 뮤테이션: ⑫ 줄 되돌림 → anchor 6 실패·E2E 400 · ⑫ 전부 면제 → 일반 주택 짝 실패 · ⑤ prop false → 렌더 1 실패·E2E 안내 없음.
- 회귀 `__tests__/{api,calc,components,lib,stores}` 2206 파일 26,921 통과 · tsc 0 · E2E MGF-1·MPI-1·MIH-1 통과.

### 8.1 리뷰 게이트(acquisition-cost-review · WARN · BLOCK 0) 반영

- **W-1** ⑫ 면제 술어를 ⑭ 겸용 분기(`bundled-split-helpers.ts` `c.assetKind === "mixed_use_house" && c.mixedUse`)와 같게 좁혔다 — `mixedUse`만 보면 종류가 일반 주택인 요청(API 직접 호출)이 신고가액 없이 통과해 ⑭ 일반 주택 분기에서 취득가액 0이 된다. anchor: 그 요청 → 400(뮤테이션 「`mixedUse`만」 → 실패).
- **W-2** §163⑨ 단서 구간 둘째 자산·지분 anchor `__tests__/api/transfer.route.mixed-gift-fixed-acq-price-era.anchor.test.ts` 4건 — 1980 증여 ① 9억+3억(둘째 자산 585,600,362 · 지분 544,213,810) · 1990 PHD ① 9억+1억(662,018,500 · 619,228,501), 각각 신고가액 빈칸 = 6억 = 9억 · ⑧ 0건 · 200(뮤테이션 「면제 제거」 → 둘째 자산 행 실패).
- **W-3** ⑤ 술어를 ④(`buildMixedUsePayload` — `assetKind === "housing" && isMixedUseHouse`)와 같게 — 주택이 아닌데 겸용 플래그만 남은 잔재는 칸을 보인다(숨기면 ⑫가 요구하는 칸이 없는 막다른 길). 렌더 짝 1건(뮤테이션 → 실패). ⑧ 겸용 분기(`isMixedUseHouse === true` · 종류 무관)와 상속 블록 술어(`isMixedUse`)는 그대로 — 그 잔재 상태가 이력 복원으로 실제 생기는지는 측정하지 않았다(별건).
