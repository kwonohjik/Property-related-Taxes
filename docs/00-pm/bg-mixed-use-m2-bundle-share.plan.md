# 겸용주택 × 부담부증여 — 공유지분·함께 양도·지분 분할 취득(M-2) 해제 계획서

> 작성 2026-11-17 · 상태 **Plan v0.2 — Q-1~Q-7 전부 권고안으로 확정(2026-11-17 사용자 「권고대로」) · 다음: PR-A Pre-Do anchor**
> 선행: M-1 단독 단건(#3419 · 사용자 결정 H-1) · 부분 증여가액 하한(#3423 · 결정 5). 상위 계획 `bg-nonsupp-winner-support.plan.md` §4.3.3이 「별도 계획서」로 넘긴 범위.
> 조사: 엔진(transfer-tax-senior)·UI(transfer-tax-ui-senior) 병렬 — throwaway probe(삭제 확인), 핵심 file:line은 작성자가 재확인.

## 0. 한 줄 요약

막는 곳은 엔진 MB-6 하나(`lib/tax-engine/mixed-use-burdened-gift-prepare.ts:217`)와 그 짝 ⑫·⑧이다. **게이트만 풀면 세 축 모두 세액이 틀린다** — 공유지분은 지분 스케일 4곳이 없고(실측 최대 −11,000,400), 함께 양도는 파트 카드가 부담부증여를 **두 번** 적용한다(실측 190,014,000 vs 정답 8,632,800). 그래서 축마다 「게이트 + 배관」을 한 PR에서 같이 연다.

| 축 | 화면 입력 경로 | 지금 막는 곳 | 게이트만 풀면 | 권장 PR |
|---|---|---|---|---|
| A. 공유지분 단건 | 열려 있음(① `OwnershipRatioBlock`) | ⑧ HARD_BLOCKS MB-6 · ⑫ `refineMixedUseBurdenedGift` · 엔진 MB-6 | 승자 오판·하한 미발동·증여세 과대 | **PR-A**(중) |
| B. 함께 양도(컴패니언) | 열려 있음(컴패니언 카드가 같은 `BurdenedGiftBlock`·귀속 카드를 띄움) | ⑧ 묶음 차단 · ⑫ `refineCompanionMixedUseBurdenedGift` · 엔진 MB-6 · ⑭ `burdenedGift: undefined` | 카드마다 §159 재실행 → 이중 적용 | **PR-B**(대) |
| C. 지분 분할 취득(축 B) | **없음** — 지분 카드에서 겸용이 될 길이 없다(§2.3) | 위와 같음 + 화면 경로 부재 | — | **PR-C**(대 · V-0 선행) |

## 1. 법령 근거 (KoreanLaw MCP — 소득세법 시행령 MST 290841, 시행 2026-10-01 본문)

| 조문 | verbatim 요지 | 이 계획에서 |
|---|---|---|
| 소득세법 시행령 §159① | 「부담부증여의 경우 양도로 보는 부분에 대한 양도차익을 계산할 때 그 취득가액 및 양도가액은 다음 각 호에 따른다」 1호 취득가액 = A × B/C, 2호 양도가액 = A × B/C (C: 증여가액) | 지분 증여면 C는 **그 지분의 증여가액** — 비겸용 지분과 같은 독법 |
| 소득세법 시행령 §159② | 과세대상·비과세대상 자산을 함께 부담부증여하면 채무액 = 총 채무액 × 과세대상 자산가액/총 증여 자산가액 | 묶음 재배분(`apportionCompanionBurdenedGiftDebt`)의 근거 축 |
| 소득세법 시행령 §156① | 「1주택 및 이에 딸린 토지의 일부를 양도하거나 일부가 타인 소유인 경우로서 실지거래가액 합계액에 양도하는 부분(타인 소유부분을 포함한다)의 면적이 전체 주택면적에서 차지하는 비율을 나누어 계산한 금액이 12억원을 초과하는 경우에는 고가주택으로 본다」 | 12억 판정은 **물건 전체 가액**. 법문은 「면적 비율」 — 지분율로 읽는 것은 비겸용에서 이미 쓰는 독법(직접 근거 없음 → V-10) |
| 소득세법 시행령 §160① | 괄호 「주택 외의 부분은 주택으로 보지 않는다」 · 후단 「일부만 양도하는 때에는 12억원에 … 비율을 곱하여 안분계산한다」 | 겸용 고가 판정의 주택분 한정(2022.1.1. 이후) — 지분이어도 판정 가액은 물건 전체 |

해석례 검색(KoreanLaw `search_decisions` domain=nts): 「겸용주택 부담부증여」 1건(부동산거래관리과-119 — 이미 반영), 「겸용주택 부담부증여 공유지분 채무」·「부담부증여 공유지분」 **0건**. 「부담부증여 지분」 서면-2017-법령해석재산-1629(분양권, 사안 다름·본문 미열람). → **겸용 × 지분·묶음 부담부증여를 직접 다룬 해석례는 확인되지 않았다.** 설계는 비겸용 지분·묶음 규약과 H-1 결정 1~5를 그대로 잇는 것으로 하고, 결과에 「확인 필요」 안내를 둔다.

## 2. 실측 사실

### 2.1 공유지분 단건 (축 A)

- **종전 기록 정정.** 엔진 설계서 §3.1(`transfer-burdened-gift-mixed-use.engine.design.md:153`)의 「`totalPropertyTransferPrice` 훅이 지분 축과 충돌해 BG×지분 동시 불가」는 그대로는 성립하지 않는다. 겸용 BG는 `ownershipRatio`를 읽지 않고, 훅(`totalPropertyTransferPrice := C`, `wholeHousingTransferPrice := C_h`)은 입력이 물건 전체면 지분 축이 요구하는 「물건 전체 가액」과 같은 뜻이다. **실제 충돌은 지분 스케일 4곳**이다: (a) 승자 판정·MB-10(`B ≤ C`) (b) 부분 증여가액 하한(결정 5) (c) 증여세 `gratuitousPortion` (d) echo(`housingRatio`·`highValue`).
- 비겸용 지분 규약: `scaleBurdenedGiftInfo`(`lib/tax-engine/burdened-gift-valuation.ts:88`)가 평가·취득 입력을 ×r, 채무는 **지분 인수분**을 사용자가 입력(화면 라벨 「지분 인수분」 `BurdenedGiftBlock.tsx:139,290-296`). 12억 분모 `fractionalHighValueDenominator`(`burdened-gift-valuation.ts:233`) = 보충 승이면 물건 전체 보충적평가액, 담보·임대 승이면 `ceil(C/r)`.
- 겸용 일반 양도 지분: 기준시가·면적은 물건 전체, 절대금액만 ④가 `share()`로 지분분(`lib/calc/transfer-tax-api-mixed-use.ts:77~97`, `:347~397`).

probe(r = ½, F2 기하 주택 150㎡·상가 50㎡, 증여일 2024-03-01, 1세대1주택 거주 10년). 변형: **R1** 게이트만 제거 · **R2** 평가·취득 ×r + 12억 훅만 물건 전체 · **R3** R2에서 훅도 지분분 · **R4** 채무를 B/r로 둔 100% 오라클.

| 시료 | R1 | R2 | R3 | 판정 |
|---|---|---|---|---|
| A 시가 20억 · 불분명 5억 | 7,830,000 | 7,830,000 | 0 | 보충 승은 r이 약분돼 R1=R2. R3은 12억 훅이 10억이라 전액 비과세 오판 |
| B 상가 보증금 1.5억 + 불분명 3.5억 | 19,538,125 | 19,538,125 | 0 | 같음 |
| C 주택 귀속 담보 8억 | 1,005,000 | **1,833,750** | 0 | R1은 하한 미발동. R2(C_h := 8억)가 R4÷2와 일치 |
| D2 F1 단서 시가 30억 | 41,354,000 | 41,354,000 | 38,162,000 | R3 주택분 비과세 오판 |
| E 기준시가 모드 보충 12억 · 지분 채무 7억 | 0 | **11,000,400** | 0 | R1은 물건 전체 12억 > 7억으로 보충 승 오판. R2는 지분 기준 담보 승(7억 > 6억), 12억 분모 14억 |
| E2 F1 단서 · 기준시가 · 지분 채무 7억 | 27,650,251 | 34,319,500 | 34,319,500 | R1 승자 오판 −6,669,249 |

R2는 A·B·C·E에서 R4÷2(양도차익·4부분)와 일치한다. R1의 `gratuitousPortion`은 15억(= C_w − B_s)으로 정답 5억(C_s − B_s)과 다르다.

### 2.2 함께 양도 (컴패니언)

- ⑭ `buildMixedUseCompanionItems`가 `burdenedGift: undefined`로 서브엔진을 부른다(`app/api/calc/transfer/mixed-use-part-cards.ts:557` [재확인]).
- **종전 기록 정정.** `bg-nonsupp-winner-support.plan.md` §3.3 사실 6 (i) 「게이트만 풀면 BG가 일반 양도로 계산된다」는 실측과 반대다. 파트 카드의 `neutralized`(`mixed-use-part-cards.ts:197~`)가 `burdenedGiftInfo`·`transferType`·`acquisitionCause`를 지우지 않아 [재확인: 그 객체에 BG 키 없음], 이미 B가 반영된 카드 4장마다 STEP 0.48(§159)이 **다시** 돈다.

| 시료(F2 시가 15억 · 채무 6억 불분명 · 단건 7,848,000) | 총세액 |
|---|---|
| 카드 집계 as-is(게이트 제거) | **190,014,000** — 카드 4장 모두 양도차익 320,000,000 |
| 카드 BG 키 3개 중화 후 | **8,632,800** = 단건 × 1.1 정확히 일치 |

- 재배분 ↔ 귀속 충돌: ④ `apportionCompanionBurdenedGiftDebt`(`lib/calc/transfer-tax-api-burdened-gift.ts:561`)가 신고 단위 총채무를 자산가액 비율로 재배분해 `assumedDebtOverride`를 싣는데, 겸용 귀속 3칸은 카드에 입력한 자기 채무 그대로다(`:382` [재확인]). 실측: 총채무 8억(주택 2억 + 겸용 6억) → B_i = [266,666,666, 533,333,334], 귀속 합 6억 → MB-13 · override 존재만으로 MB-12(`prepare.ts:258-265` [재확인]).
- 사소한 결함(게이트 닫힌 지금은 도달 없음): `wholeHouse`(OH-17 본문) 분기의 12억 훅 `housingTotal`(`mixed-use-part-cards.ts:180`)이 BG에서 C가 아니라 안분 양도가 B_i를 쓴다(시료: 훅 4억 vs C 11억, 둘 다 12억 이하라 세액 동일 → V-7).
- 결과: 다건 집계에 겸용 BG 4부분 detail을 싣는 경로가 없다. `aggregated.burdenedGift`는 2부분(토지/건물) 형이고, 묶음 결과 `BundledAllocationCard.tsx:281`은 `BurdenedGiftDetailCard`만 그린다. 선례 `aggregated.generalBuildingDetailsByAsset`(`bundled-route.ts:497` · `MultiGbAssetGroup`).
- ⑥ 사이드바: `transfer-per-asset-summary.ts:180` `bgMixed = i === 0 && …` [재확인] — 컴패니언 겸용 BG를 못 잡는다.
- ⑫ 부수 결함: `transfer-tax-schema-companion-refines.ts:38-48`의 `bgActualAcquisitionMissing`이 겸용 상속·증여(deemed)에 실지 총액을 요구한다(게이트 해제 시 막다른 길).

### 2.3 지분 분할 취득 (축 B)

- **화면 경로가 없다.** 축 B 지분 카드는 ①이 숨고(`CompanionAssetCard.tsx:158` `hideInheritedSections` [재확인]) 겸용 토글은 ①에 있다. 병합 `mergePrimaryBasicAll`(`lib/calc/transfer-tax-api-helpers.ts:184~`)은 `assetKind`를 잇지만 `isMixedUseHouse`·겸용 칸을 잇지 않는다 [재확인]. UI probe: 비BG 겸용 60/40 + 기본 지분 카드 → ⑧ 0건, body `companionAssets[0]`은 `assetKind:"housing"`·`mixedUse` 없음.
- 기존 anchor `__tests__/api/mixed-use-fractional-axis-b.anchor.test.ts`(축 B 60/40 = 단건 일치)는 픽스처가 두 카드 모두에 겸용 필드를 직접 넣는다 — 화면 경로의 간극을 가린다. **비BG 겸용 축 B의 세액 영향은 미측정**(V-0) — 결함으로 단정하지 않는다.
- ④ 축 B 채무 스케일 `d()`(`transfer-tax-api-burdened-gift.ts:278`)는 채무 4칸만 ×r, 귀속 3칸은 원값(`:382`) → MB-13 불가피.
- 규약: 축 B는 물건 전체 입력 · 채무 ×r · 승자는 물건 전체(비율 1)로 판정(`bg-nonsupp-winner-support.plan.md` §4.1.2) — 겸용도 같다. 겸용 축 B BG 직접 실측은 없다(V-5).

## 3. 설계

### 3.1 PR-A — 공유지분 단건 (S안)

1. **엔진 prepare**: MB-6에서 `ownershipRatio < 1` 조건 삭제(`isCompanion`은 PR-B까지 유지). 평가·취득 입력을 비겸용 `scaleBurdenedGiftInfo`와 같은 규약으로 ×r → C_s·C_h_s·승자·MB-10·하한(결정 5)·증여세를 지분분으로. 채무·귀속 3칸은 **지분 인수분**(입력 그대로).
2. **12억 판정 가액**: 지분분 C와 따로, 판정용 물건 전체 값을 `bg`가 들고 온다 — 비겸용 `fractionalHighValueDenominator` 규약 재사용(보충 승 = 물건 전체 보충적평가액, 담보·임대 승 = `ceil(C_s/r)`; 주택분은 C_h 쪽 같은 규약). `transfer-tax-mixed-use.ts:204-205`·`:354`의 훅이 이 값을 받는다(Q-2).
3. **`applyMixedBurdenedGift`**: `lump()` basis·`e.acq`·`e.ded`에 ×r 반영(`mixed-use-burdened-gift.ts:93~140`). echo에 판정용 물건 전체 가액 필드 추가.
4. **④**: BG 경로에서 `share()` 이중 축소 점검(V-1).
5. **⑧⑫**: HARD_BLOCKS MB-6은 엔진 판정을 그대로 따르므로 엔진 해제로 지분 단건이 풀린다. ⑤ 안내문 `TransferModeBlock.tsx:216-221`(「단독 소유 단건」)을 축별 문구로. 비겸용 축 A의 승자 규약과 같아 담보·임대 승도 연다(Q-4).
6. **결과**: 「확인 필요 — 겸용 × 지분 부담부증여 해석례 없음」 notice 1건.
7. **anchor**: 시료 A~E2를 R4÷2 대조로 고정. 뮤테이션: 훅을 C_s로 되돌림(R3) → 비과세 오판 검출 · 스케일 제거(R1) → C·E 검출.

### 3.2 PR-B — 함께 양도 (컴패니언)

1. **⑭ 배관**: `mixed-use-part-cards.ts` `neutralized`에 `burdenedGiftInfo`·`transferType`·`acquisitionCause` 중화 추가, `buildMixedUseCompanionItems`가 `burdenedGift`(debtAttribution·housingAppraisal 포함)와 증여자 취득원인을 전달(V-4), `wholeHouse` 훅 `housingTotal`을 BG면 C로(V-7).
2. **B 소스**: 컴패니언 겸용에 한해 MB-12의 `assumedDebtOverride` 거부를 풀고 B := override. 귀속 처리는 Q-3.
3. **엔진**: MB-6 `isCompanion` 분기 삭제. ⑫ `refineCompanionMixedUseBurdenedGift`를 실제 collector 호출(선례 `refineMixedUseInheritedSplitDate`의 컴패니언 루프)로 교체, `companion-refines.ts:38-48` deemed 면제.
4. **⑧**: `transfer-tax-validate-bg.ts:207-209`·`transfer-tax-validate-acquisition.ts:383-386` 묶음 차단 해제. 묶음 비보충 승자 게이트(`transfer-tax-validate.ts:384` `bgNonSupplementaryWinnerUnsupported` 겸용=true)는 Q-4에 따라 유지하고 문구만 「담보·임대 평가는 단독 소유(지분 포함) 단건만」으로 정확화(`burdened-gift-collateral-win.ts:93-95,143-146`).
5. **결과·⑥**: 자산별 슬롯 `mixedUseBgDetailsByAsset`(선례 GB) + 묶음용 `MixedUseBurdenedGiftDetailCard` 변형(증여세 행 숨김 — 묶음은 계약 단위 1회 `aggregated.burdenedGift`). 사이드바 `bgMixed` 술어를 i>0로 일반화. 증여세 1회 산정에 겸용 info 합산(V-3).
6. **anchor**: 카드 집계 = 단건 × 묶음 대조(위 8,632,800 시료), 이중 적용 뮤테이션(중화 제거 → 190,014,000 검출), 재배분 시료(B_i 533,333,334).

### 3.3 PR-C — 지분 분할 취득 (축 B)

선행 **V-0**: 비BG 겸용 축 B가 화면 경로에서 지분 카드를 일반 주택으로 계산하는지 세액 실측(Playwright 또는 화면 body probe). 결함이면 별도 fix PR이 먼저다(병합 목록에 `isMixedUseHouse`·`mixedUse*` 추가 — 물건 단위 값).
그 뒤: ④ 귀속 3칸도 `d()` 규약으로 ×r, 칸별 floor 잔액은 불분명에 흡수(Q-6) · 승자는 비율 1 판정 · 증여세 1회(`burdenedGiftWholeInfo`, `transfer-tax-api.ts:672-678`) · detail 슬롯은 PR-B 것 재사용. 규모·세부는 V-0·V-5 실측 후 이 절을 v0.2로 다시 쓴다.

### 3.4 기각·재제안 금지 (이 계획에서 쓰지 않는 것)

- 「담보 승 자산을 안분에서 빼고 그 물건에 귀속」 — 기각 기록(`transfer-tax-api-burdened-gift.ts:632` 부근).
- W안(물건 전체 값으로 계산하고 채무를 1/r로 역산) — 채무 역산은 자동 안분 성격이고 증여세·하한 스케일이 어긋난다. (축 B는 반대로 입력이 물건 전체 · 채무 ×r이 규약이라 별개다.)
- H-1 결정 1~5 재논의.

## 4. 14 동기화 지점

| 지점 | PR-A 지분 | PR-B 컴패니언 | PR-C 축 B |
|---|---|---|---|
| ①②③ | 없음 | 없음(Q-3 선택지 3이면 신설) | V-0 결과에 따라 병합 필드 |
| ④ | `share()` 우회 점검 | 재배분 ↔ 귀속(Q-3) | 귀속 ×r |
| ⑤ | `TransferModeBlock` 문구 | 귀속 카드 묶음 규약 안내 | 지분 카드 겸용 표시 |
| ⑥ | 현행 `i===0` 충분 | `bgMixed` 일반화 · `mu-*#assetId` 매핑 | PR-B와 같음 |
| ⑦ | notice · echo | `mixedUseBgDetailsByAsset` 슬롯·카드 변형 | PR-B 재사용 |
| ⑧ | 엔진 판정 따라 해제 | 묶음 차단 해제 · 승자 게이트 문구 | 병합 자산 검증 |
| ⑨⑩ | 없음 | 확인 필요(V-8) | 같음 |
| ⑪ | 없음 | 확인 필요(V-8) | 같음 |
| ⑫ | `ownershipRatio` 전달 유지 · ⑧ 격자 대조 | collector 교체 · deemed 면제 | 같음 |
| ⑬ | 없음 | 없음(이미 전달) | 없음 |
| ⑭ | 판정용 물건 전체 값 | `burdenedGift` 전달 · 중화 · detail 보관 | 지분 카드별 호출 |

## 5. 사용자 결정 (Q) — 2026-11-17 전부 권고안 확정

| # | 질문 | 선택지 | 확정(권고안) |
|---|---|---|---|
| **Q-1** | 공유지분 겸용 BG의 C | (S) 지분 증여가액 — 비겸용과 같음 · (W) 물건 전체 + 채무 역산 | **S** — R4 오라클과 일치(§2.1) |
| **Q-2** | 지분일 때 12억 판정 가액 | 비겸용 `fractionalHighValueDenominator` 재사용 · 다른 규칙 | **재사용** — 보충 승은 물건 전체 보충적평가액, 담보·임대 승은 `ceil(C/r)`. 법문 「면적 비율」을 지분율로 읽는 것은 비겸용과 같은 독법(V-10) |
| **Q-3** | 묶음 안 겸용의 채무 귀속 | ① **구분 불분명만 허용**(주택·상가·나누어 입력 옵션 disabled + hint, 귀속 = {0,0,B_i}) · ② 재배분된 B_i를 보여 주고 귀속을 B_i 합으로 다시 입력 · ③ 카드 귀속을 B_i/B_own으로 자동 환산 | **①** — 묶음은 이미 신고 단위 채무를 자산가액 비율로 재배분하는 모델이라 자산 안에서도 「구분 불분명」과 같은 성격이고, 새 필드가 없다. 한계: 묶음 안에서는 부동산거래관리과-119 귀속을 쓰지 못한다(안내). ③은 사용자 선언 사실의 자동 환산이라 비권고(B_own=0, B_i>0이면 채울 값도 없다) |
| **Q-4** | 비보충 승(담보·임대) 허용 범위 | 공유지분 단건은 전 승자 · 묶음(컴패니언·축 B)은 보충 승만 / 전부 허용 | **지분 단건 전 승자 · 묶음은 v1 보충 승만**(문구 정확화). 비겸용 묶음 균일 승자 규칙(26셀)을 겸용에 확장하는 것은 별건 |
| **Q-5** | 분할·순서 | PR-A → PR-B → (V-0) → PR-C | **그대로** — 축 B는 화면 경로부터 없다 |
| **Q-6** | 축 B 귀속 ×r의 floor 잔액 흡수처 | 불분명 · 주택 · 상가 | **불분명**(Q-3 ①이면 묶음 쪽은 해당 없음, 축 B 단독 물건만) |
| **Q-7** | 묶음 결과 표시 | 자산별 겸용 BG 4부분 카드(증여세 행 숨김) / 합계만 | **자산별 카드** — GB 선례와 같은 슬롯 |

## 6. 미확인 (V)

| # | 내용 | 막는 PR |
|---|---|---|
| **V-0** | 비BG 겸용 축 B 지분 카드가 화면 경로에서 일반 주택으로 전송되는 것의 **세액 영향** — 결함 의심, 미측정 | PR-C 선행 |
| V-1 | ④ BG × 지분에서 `housingInheritedValue`·`capitalExpenditure`·`transferExpense` `share()` 이중 축소 여부(정독만) | PR-A |
| V-2 | K-5 환산·§97②2호 단서 경로에서 지분일 때 `est.*AppraisalDed`(지분 감축)와 `lump()` 중복 여부 | PR-A |
| V-3 | `buildCompanionBurdenedGiftWholeInfo`에 겸용 info 합산 가능 여부(증여세 1회) | PR-B |
| V-4 | 컴패니언 `acquisitionCause`(`"burdened_gift"`)와 증여자 취득원인 echo 전달 설계(MB-5·MB-9가 읽는 값) | PR-B |
| V-5 | 축 B 겸용 BG 직접 실측 | PR-C |
| V-6 | 상속·증여 취득(deemed) 지분·임대 승 지분 시료 | PR-A |
| V-7 | `wholeHouse` 훅 B_i vs C — 12억 경계 시료의 세액 차이 | PR-B |
| V-8 | ⑨⑩⑪이 겸용 컴패니언 BG에 필요한지 | PR-B |
| V-9 | 묶음 명세서·신고서가 `mu-*#assetId` 파트 카드를 묶어 보이는 방식 | PR-B |
| V-10 | §156① 「면적 비율」을 겸용 지분에서 지분율로 읽는 직접 근거 — 해석례 0건 | 결과 「확인 필요」 고지로 대응 |

## 7. 테스트

뒤집거나 고칠 기존 단언(E2E `transfer-bg-mixed-use.spec.ts` BGMU-1~12에는 MB-6 단언 없음 — 신규 E2E만 추가):

| 파일 | 위치 | PR |
|---|---|---|
| `__tests__/tax-engine/transfer/mixed-use-burdened-gift.anchor.test.ts` | `:345` MB-6 지분 < 1 | A |
| `__tests__/api/transfer.route.mixed-use-burdened-gift-companion-block.anchor.test.ts` | CB-1·2·3 (400) | B |
| `__tests__/api/transfer.route.bg-nonsupp-winner-reason.anchor.test.ts` | `:47,101` `MIXED_CAUSE` 문구 | A·B |
| `__tests__/api/transfer.route.bg-axis-a-nonsupp-win.anchor.test.ts` | `:186` 술어 | A |
| `__tests__/api/transfer.route.bg-uniform-winner-gate.anchor.test.ts` | UW-2 겸용 셀(Q-4에서 묶음 비보충을 열 때만) | — |
| `__tests__/calc/bg-collateral-win-ratio-one.anchor.test.tsx` | `:8` 주석 | A |

신규: PR-A anchor(§2.1 시료 6건, R4÷2 대조) · PR-B anchor(카드 집계 = 단건×1.1 · 재배분 시료) · E2E 축별 1건 이상(BGMU-13~).

## 8. 다음 단계

1. ~~사용자: Q-1~Q-7 결정~~ — 2026-11-17 전부 권고안 확정.
2. PR-A Pre-Do anchor(§2.1 C·E 시료) 먼저 작성 → 설계 환류.
3. PR-A 구현·머지 → PR-B → V-0 실측 → PR-C 절 v0.2.
