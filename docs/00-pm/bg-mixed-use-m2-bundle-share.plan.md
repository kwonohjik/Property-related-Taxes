# 겸용주택 × 부담부증여 — 공유지분·함께 양도·지분 분할 취득(M-2) 해제 계획서

> 작성 2026-11-17 · 상태 **Plan v0.2 — Q-1~Q-7 전부 권고안으로 확정(2026-11-17 사용자 「권고대로」) · PR-A #3428 · PR-B #3432 · V-0 결함 → fix #3437(§9) · PR-C 절 v0.3(§3.3 · 2026-11-17) — Q-10·Q-12 결정 대기**
> 선행: M-1 단독 단건(#3419 · 사용자 결정 H-1) · 부분 증여가액 하한(#3423 · 결정 5). 상위 계획 `bg-nonsupp-winner-support.plan.md` §4.3.3이 「별도 계획서」로 넘긴 범위.
> 조사: 엔진(transfer-tax-senior)·UI(transfer-tax-ui-senior) 병렬 — throwaway probe(삭제 확인), 핵심 file:line은 작성자가 재확인.

## 0. 한 줄 요약

막는 곳은 엔진 MB-6 하나(`lib/tax-engine/mixed-use-burdened-gift-prepare.ts:217`)와 그 짝 ⑫·⑧이다. **게이트만 풀면 세 축 모두 세액이 틀린다** — 공유지분은 지분 스케일 4곳이 없고(실측 최대 −11,000,400), 함께 양도는 파트 카드가 부담부증여를 **두 번** 적용한다(실측 190,014,000 vs 정답 8,632,800). 그래서 축마다 「게이트 + 배관」을 한 PR에서 같이 연다.

| 축 | 화면 입력 경로 | 지금 막는 곳 | 게이트만 풀면 | 권장 PR |
|---|---|---|---|---|
| A. 공유지분 단건 | 열려 있음(① `OwnershipRatioBlock`) | ⑧ HARD_BLOCKS MB-6 · ⑫ `refineMixedUseBurdenedGift` · 엔진 MB-6 | 승자 오판·하한 미발동·증여세 과대 | **PR-A**(중) |
| B. 함께 양도(컴패니언) | 열려 있음(컴패니언 카드가 같은 `BurdenedGiftBlock`·귀속 카드를 띄움) | ⑧ 묶음 차단 · ⑫ `refineCompanionMixedUseBurdenedGift` · 엔진 MB-6 · ⑭ `burdenedGift: undefined` | 카드마다 §159 재실행 → 이중 적용 | **PR-B**(대) |
| C. 지분 분할 취득(축 B) | #3437로 지분 카드가 겸용이 됨 | ⑧ `validate-bg.ts:207` · ⑫ MB-6 | 엔진이 함께 양도로 오인(MB-21) · 귀속 칸 없음 · 귀속 ×r 누락(§3.3.1) | **PR-C0**(소) → **PR-C**(대) |

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
- 기존 anchor `__tests__/api/mixed-use-fractional-axis-b.anchor.test.ts`(축 B 60/40 = 단건 일치)는 픽스처가 두 카드 모두에 겸용 필드를 직접 넣는다 — 화면 경로의 간극을 가린다. **비BG 겸용 축 B의 세액 영향은 미측정**(V-0) — 결함으로 단정하지 않는다. → 2026-11-17 실측 결함 확정 · fix #3437(§9).
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

### 3.3 PR-C — 지분 분할 취득 (축 B) · v0.3 (2026-11-17 실측 재설계)

> 조사: 엔진(transfer-tax-senior)·UI(transfer-tax-ui-senior) 병렬 · 화면 경로 probe(폼 → ⑧ → ④ body → route) · throwaway 패치는 복사본에서만, 삭제 확인. [재확인] = 작성자가 file:line을 다시 읽음.

#### 3.3.1 지금 막는 곳과 「게이트만 풀면」

| 층 | 위치 | 비고 |
|---|---|---|
| ⑧ | `lib/calc/transfer-tax-validate-bg.ts:207-210` `isFractionalSplitAxis` → `transferType` 칸에 MB-6 문구 | 자산 1·자산 2 같은 문구(자산 2 칸은 숨음 — 자산 1이 먼저라 막다른 길 아님) |
| ⑫ | `lib/api/transfer-tax-schema-mixed-bg-refines.ts:79-83`(주 자산) · `:104-134`(컴패니언) `isAxisB: isAxisBBundle(...)` | **MB-6의 서버 쪽 정본** |
| 엔진 leaf | `lib/tax-engine/mixed-use-burdened-gift-prepare.ts:266-268` | 엔진 호출은 `isAxisB`를 넘기지 않는다 — `transfer-tax-mixed-use.ts:125` [재확인] `isCompanion: burdenedGiftInBundle` 뿐, ⑭ `mixed-use-part-cards.ts:575` [재확인]이 BG 카드면 무조건 `true` |

게이트(⑧·⑫·leaf MB-6)만 풀면 **세 군데가 막힌다**(실측):

1. **엔진이 축 B를 함께 양도로 오인** — `inBundle = isCompanion && isAxisB !== true`(`prepare.ts:270` [재확인])인데 `isAxisB`가 엔진에 오지 않아 inBundle → MB-21(재배분 채무 없음) 400. 주택·상가 귀속이면 MB-19, 담보·임대 승이면 MB-20도 같은 원인.
2. **귀속 3칸이 지분 카드에 없다** — `mergePrimaryBasicAll`(`transfer-tax-api-helpers.ts:187~`)이 귀속 8칸(`bgDepositAttribution`·`bgMortgageAttribution`·`bg{Deposit,Mortgage}Split{Housing,Commercial,Unallocated}`)과 구분 감정평가 2칸(`bgHousingAppraisalDeclared`·`bgHousingAppraisalValue`)을 잇지 않는다 [재확인: grep 0건]. 지분 카드는 ②가 숨어 칸도 없다(`CompanionAssetCard.tsx:162`·`:428`) → ⑧ 자산 2 「담보차입금 … 어디에 속하는지 선택하세요」 = **막다른 길**.
3. **귀속 ×r 누락** — ④ 겸용 분기(`transfer-tax-api-burdened-gift.ts:364-386` [재확인])는 채무 4칸을 `d()`로 ×r한 `...allowed`를 펼치지만 `debtAttribution`은 원값 → ⑫ MB-13 「귀속 합계(600,000,000) ≠ 인수 채무 합계(360,000,000)」. 이때 ⑧은 0건(원값끼리 비교) — **⑧↔⑫ 어긋남**.

#### 3.3.2 배관을 다 고친 뒤의 세액 (throwaway, 엔진에 `isAxisB` 전달 + 귀속 병합 + 귀속 항목별 ×r)

오라클 = 같은 물건을 단독 소유 단건 겸용 BG로 계산(같은 취득이면 같아야 한다). 비교값 = 결정세액 + 지방소득세. 기준 2024-03-01 · 주택 100㎡/상가 100㎡ · 양도시 기준시가 12억 · 지분 60/40(S14는 50/30/20).

| 시료 | 단건 | 축 B | 차이 |
|---|---|---|---|
| S1 기준시가 보충 승 · 불분명 6억 | 67,033,120 | 67,033,120 | 0 |
| S2 시가 15억 · 불분명 6억 · 실지 7억 | 76,003,401 | 76,003,401 | 0 |
| S3c 시가 15억 · 주택 2억 + 상가 1억 + 불분명 3억 | 76,003,401 | 76,003,402 | +1 |
| S4 기준시가 고가(주택 20억) · 1세대1주택 | 115,743,896 | 115,743,897 | +1 |
| S5 부분 증여가액 하한 발동(결정 5) · 주택 귀속 9억 | 149,446,000 | 149,446,000 | 0 |
| S9a 기준시가 **담보 승**(채무 13억) | 192,473,160 | 192,473,160 | 0 |
| S9c 기준시가 **임대 승** | 26,892,378 | 26,892,379 | +1 |
| S13 시가 + 구분 감정평가 8억 | 76,003,401 | 76,003,401 | 0 |
| S14b 3분할 · 시가 + 귀속 3칸 | 76,003,401 | 76,003,403 | +2 |

전 시료(19건) ±2원 이내 = 카드별 절사(V-P1b-2). **S8 지분별 취득이 다른 경우**: 오라클 = PR-A 공유지분 단건 2건(60%·2010 취득 / 40%·2015 취득) → 4부분별 양도가액·취득가액·개산공제가 카드 8장 전부 일치(기준시가 모드 · 시가 모드 + `bgShareOwnAcquisition`). 상속·증여 취득 지분(2015 증여 · 2006 상속)도 단건과 0원 차이.

- **12억 판정**: 카드마다 `highValue.judgmentBase`가 물건 전체 값(S4 20억 · S5 하한 9억)이다 — `prepare.ts:497-511` 규약(보충 승 = 물건 전체 보충적평가액 · 담보·임대 승 `ceil(C/r)` · 하한 `ceil(Ch/r)`)이 축 B에서도 그대로 맞는다. 추가 작업 없음.
- **증여세**: 계약 단위 `aggregated.burdenedGift`는 단건과 같다(S1 101,850,000) — ④ `burdenedGiftWholeInfo`(`transfer-tax-api.ts:675-678`)가 겸용 info를 그대로 싣는다. 합산 코드 불필요(V-3과 달리 물건이 하나).
- **귀속 ×r 단위 함정(NEG)**: 귀속을 **합계 단위**로 ×r하고 불분명이 잔액을 흡수하면 음수가 난다(보증금 100,000,001 · 담보 500,000,001 모두 주택 → 주택 360,000,001 · 불분명 −1 → ⑧ 0건인데 ⑫ 400 「>=0」). **항목별(보증금·담보차입금 각각) ×r + 그 항목 불분명이 잔액 흡수**면 주택 360,000,000 · 불분명 0 · 단건 일치. → Q-6 「칸별 floor 잔액 → 불분명」의 구현 단위는 **항목별**.

#### 3.3.3 설계 — PR-C 변경 목록

**엔진·⑭**
1. MB-6 삭제: `prepare.ts:266-268`(+ 상수 `:52-54` · 타입 `:46`) · ⑧ HARD_BLOCKS(`transfer-tax-validate-mixed-use-bg.ts:30`) · ⑫ 전달(`isAxisB`)은 유지 — inBundle 판정에만 쓴다.
2. 엔진 입력에 축 B 표시 `burdenedGiftAxisB`(`types/transfer-mixed-use.types.ts` · `burdenedGiftInBundle` 옆): ⑭ `mixed-use-part-cards.ts:575` → `mixed-use-asset-input.ts` Sources → `transfer-tax-mixed-use.ts:125`가 `isAxisB`를 prepare에 넘긴다. 호출처(`bundled-route.ts` 주 자산 · `bundled-split-helpers.ts` 컴패니언)에 `isFullFractionalBundle`.
3. 계약 단위 1회: `mixed-use-burdened-gift.ts:252`(카드별 `giftTax`) · `:315-318`(notices) · `:361`(bundleNotices) 조건을 `inBundle || axisB`로. 지금은 축 B 카드마다 증여세가 슬롯에 따로 계산된다(S1 50,440,000 + 27,160,000 ≠ 101,850,000 — 화면 미노출이지만 데이터 어긋남).
4. 고지 전달: 축 B에서 `aggregated.warnings`가 0건(공유지분·12억·귀속 사실 고지 소실). `bundled-route.ts:505-510`이 축 B 슬롯 notices도 올린다. 축 B 문구는 「귀속 = 입력한 사실 선언을 지분율로 나눔」(함께 양도의 재배분 문구와 다름).

**④**
5. `mergePrimaryBasicAll`에 귀속 8칸 + 구분 감정평가 2칸 병합 — 단일 소스 목록(선례 `mixed-use-share-object-fields.ts`). 귀속은 한 증여계약 채무의 속성이라 물건 단위.
6. ④ 겸용 분기 `debtAttribution`을 `d()`와 같은 r로 **항목별** ×r · floor 잔액은 그 항목 불분명에 흡수(Q-6 · NEG).

**⑧ (3중 패턴 — ④와 같은 값)**
7. `transfer-tax-validate-bg.ts:207-210` 삭제(파일 708줄 → 감소).
8. 미리보기 `burdened-gift-mixed-use-preview.ts:74` [재확인]가 축 B에서도 채무를 원값으로 엔진 leaf에 넘긴다 → 축 B면 ④와 같은 ×r. 실측 S12(채무 9억 · 담보 설정 5억): ⑧ MB-10 「인수 채무가 증여가액을 초과」 오탐 2건인데 route 200(= 단건 112,490,400) — ⑧이 ⑫보다 엄격.
9. `isMixedBgMarketCollateralWin`(`burdened-gift-mixed-use-scope.ts:60-73` [재확인])이 지분율 < 1이면 시가만 ×r하고 채무는 원값 비교 — 축 B는 입력이 모두 물건 전체라 오판(S10 시가 15억 · 채무 10억 · 실제 시가 승 → 담보 승 판정 → 취득가액 방식 라디오 숨김(`BurdenedGiftBlock.tsx:167`·`:455`) + ⑧ 「산정방식을 선택하세요」 = 막다른 길 가능, 렌더 확인 필요). 축 B 인자를 받아 물건 전체로 비교.
10. 비보충 승 처리 = Q-10.

**⑤⑥⑦**
11. ⑤ `TransferModeBlock.tsx:216-224` 「지분 분할 취득은 계산하지 않습니다」 → 축 B 규약 문구(물건 전체 입력 · 채무·귀속은 지분율로 나눔). 지분 카드는 BG 칸이 없다(② 숨김 — 비겸용과 같음) → `fractional-basic-inherited-notice`처럼 한 줄 안내. `CompanionAcqSpecialAssetNotices.tsx:66-70` 「② 양도정보의 증여재산 평가는…」은 지분 카드엔 ②가 없어 문구 정정.
12. ⑥ 변경 없음 — `transfer-per-asset-summary.ts:175·183`이 병합 자산으로 `bgMixed`를 판정해 i>0에서 참, 계산 후 슬롯(`primary`·`assetId`) 값 정상(실측).
13. ⑦ `MixedUseBgBundleAssetCard.tsx:81·87·92·150`의 함께 양도 전용 문구(「신고 단위 채무를 자산별 증여가액 비율로 재배분…」)를 축 B 분기 · `mixed-bg-bundle-views.ts:38`이 **저장된** `bgValuationMode`(지분 카드는 `""`)를 읽음 → 병합 자산 값으로(라벨만, 세액 무관).

**⑫** 코드 변경 없음(MB-6 삭제를 따라감). ⑧↔⑫ 격자 대조: 귀속 ×r 합 = ×r 채무.

#### 3.3.4 남는 한계 (v1)

- 지분 카드가 1985.1.1. 전 또는 2005.4.30. 전 상속·증여 취득이면 ⑧이 「미공시를 켜세요」(엔진 MB-11 · `transfer-tax-validate-mixed-use-inheritance.ts:71`)와 Q-9 「지분 카드는 미공시를 계산하지 않습니다」가 서로를 가리킨다 — **비BG에서도 지금 master에 있는 막다른 길**(#3437 Q-9가 만듦 · 2026-11-17 probe: 증여 2000-01-01 지분 카드 · PHD 끔/켬 둘 다 ⑧ 걸림, ⑤ 토글은 지분 카드에서 disabled). → **PR-C0**(아래 §3.3.5 · Q-12).
- 보유 중 일부 용도변경(Q-8)·지분 카드 미공시(Q-9)는 BG에서도 그대로 막는다.
- 미측정: 지분 4개 이상 · 자본적지출·양도비가 있는 시료 · 시가 모드 담보 승 축 B(단건 입력 불완전으로 비교 못 함 — 기존 ⑧ `bgFractionalCollateralKindSupported`가 겸용을 제외해 막힘) · 화면 렌더(Playwright).

#### 3.3.5 분할

| PR | 내용 | 규모 |
|---|---|---|
| **PR-C0** | 지분 카드 × 1985 전·2005.4.30. 전 상속·증여 막다른 길 해소(비BG·BG 공통 · Q-12) | 약 2시간 |
| **PR-C** | §3.3.3 1~13 + 테스트 뒤집기(§7) + anchor(S1·S2·S3c·S4·S5·S8·S9a·S13·S14b · NEG · S12) + E2E(BGMU-17 대체) | 약 1일 |

### 3.4 기각·재제안 금지 (이 계획에서 쓰지 않는 것)

- 「담보 승 자산을 안분에서 빼고 그 물건에 귀속」 — 기각 기록(`transfer-tax-api-burdened-gift.ts:632` 부근).
- W안(물건 전체 값으로 계산하고 채무를 1/r로 역산) — 채무 역산은 자동 안분 성격이고 증여세·하한 스케일이 어긋난다. (축 B는 반대로 입력이 물건 전체 · 채무 ×r이 규약이라 별개다.)
- H-1 결정 1~5 재논의.

## 4. 14 동기화 지점

| 지점 | PR-A 지분 | PR-B 컴패니언 | PR-C 축 B |
|---|---|---|---|
| ①②③ | 없음 | 없음(Q-3 선택지 3이면 신설) | 없음(기존 필드 · initial `calc-wizard-asset-factory.ts:530-538`) |
| ④ | `share()` 우회 점검 | 재배분 ↔ 귀속(Q-3) | 귀속·감정 병합 · 귀속 항목별 ×r |
| ⑤ | `TransferModeBlock` 문구 | 귀속 카드 묶음 규약 안내 | 안내 문구 2곳 · 지분 카드 한 줄 안내 |
| ⑥ | 현행 `i===0` 충분 | `bgMixed` 일반화 · `mu-*#assetId` 매핑 | 변경 없음(실측) |
| ⑦ | notice · echo | `mixedUseBgDetailsByAsset` 슬롯·카드 변형 | 슬롯 재사용 · 카드 문구 축 B 분기 · 고지 전달 |
| ⑧ | 엔진 판정 따라 해제 | 묶음 차단 해제 · 승자 게이트 문구 | 차단 삭제 · 미리보기 ×r · 담보 승 술어 축 B |
| ⑨⑩ | 없음 | 확인 필요(V-8) | 같음 |
| ⑪ | 없음 | 확인 필요(V-8) | 같음 |
| ⑫ | `ownershipRatio` 전달 유지 · ⑧ 격자 대조 | collector 교체 · deemed 면제 | MB-6 삭제만(전달 유지) |
| ⑬ | 없음 | 없음(이미 전달) | 없음 |
| ⑭ | 판정용 물건 전체 값 | `burdenedGift` 전달 · 중화 · detail 보관 | `burdenedGiftAxisB` 전달 · 증여세·고지 1회 |

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

**PR-C v0.3에서 새로 생긴 결정 — 대기**

| # | 질문 | 선택지 | 권고 |
|---|---|---|---|
| **Q-10** | 축 B의 담보·임대 승 — Q-4(「묶음(축 B 포함) v1 보충 승만」)를 다시 묻는 것. Q-4 당시엔 축 B 실측이 없었다 | (a) Q-4 유지 — 축 B에 승자 게이트 신설(지금 ⑧ 승자 게이트 `transfer-tax-validate.ts:381`은 `!fullFractional`이라 축 B를 안 막는다 · 엔진 MB-20도 축 B 제외) · (b) **기준시가 모드** 담보·임대 승은 계산, 시가 모드 담보 승은 기존 ⑧(`bgFractionalCollateralKindSupported` 겸용 제외)대로 차단 · (c) 전부 계산(시가 담보 승 실측 필요) | **(b)** — 축 B는 물건이 하나라 승자가 단건과 같고(비율 1), S9a·S9c·S9d가 단건과 ±1. (a)는 실측상 맞는 계산을 새 코드로 막는다 |
| **Q-12** | 지분 카드 × 1985 전·2005.4.30. 전 상속·증여(§3.3.4 막다른 길 — 비BG도 해당) | (a) ⑧이 그 조합에서 「미공시를 켜세요」 대신 「이 지분 조합은 계산하지 않습니다」 한 문구로 막는다(술어는 기존 PHD 필수 규칙 재사용) · (b) 지분 카드 미공시를 열고 3시점 입력을 양도시(자산 1 값)·취득시(지분 값)로 나눈다(화면 큼) | **(a)** — Q-9와 같은 범위 제한. 직접 API는 이미 단건과 일치(1983 상속 · 지분 2 PHD 117,626,660 = 단건) |

구현 지침(결정 아님): 귀속·구분 감정평가는 자산 1 값을 지분 카드로 병합(물건 단위 사실 · 지분 카드 입력 칸 신설 안 함) · Q-6 잔액 흡수는 항목별 · 축 B 슬롯 `giftTax`는 비움(계약 단위 1회).

## 6. 미확인 (V)

| # | 내용 | 막는 PR |
|---|---|---|
| ~~V-0~~ | ✅ 2026-11-17 실측 — **결함**(§9). 고가 −20,220,815 · 12억 이하 −1,765,771 | fix PR로 해소 |
| V-1 | ④ BG × 지분에서 `housingInheritedValue`·`capitalExpenditure`·`transferExpense` `share()` 이중 축소 여부(정독만) | PR-A |
| V-2 | K-5 환산·§97②2호 단서 경로에서 지분일 때 `est.*AppraisalDed`(지분 감축)와 `lump()` 중복 여부 | PR-A |
| V-3 | `buildCompanionBurdenedGiftWholeInfo`에 겸용 info 합산 가능 여부(증여세 1회) | PR-B |
| V-4 | 컴패니언 `acquisitionCause`(`"burdened_gift"`)와 증여자 취득원인 echo 전달 설계(MB-5·MB-9가 읽는 값) | PR-B |
| ~~V-5~~ | ✅ 2026-11-17 실측(§3.3.2 — 배관 수정 후 19시료 단건 ±2 · S8 지분별 취득 4부분 일치) | — |
| V-6 | 상속·증여 취득(deemed) 지분·임대 승 지분 시료 | PR-A |
| V-7 | `wholeHouse` 훅 B_i vs C — 12억 경계 시료의 세액 차이 | PR-B |
| V-8 | ⑨⑩⑪이 겸용 컴패니언 BG에 필요한지 | PR-B |
| V-9 | 묶음 명세서·신고서가 `mu-*#assetId` 파트 카드를 묶어 보이는 방식 | PR-B |
| V-11 | 축 B 시가 모드 담보 승 · 지분 4개 이상 · 자본적지출·양도비 시료 · 화면 렌더 | PR-C 구현 중 실측 |
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

PR-C 뒤집기(축 B 차단 단언): `mixed-use-burdened-gift.anchor.test.ts:345-352` · `transfer.route.mixed-use-burdened-gift-companion-block.anchor.test.ts` CB-4·CB-5(`:191-209`) · `transfer.route.mixed-use-bg-companion.anchor.test.ts` CP-7(`:298-306`) · `__tests__/calc/mixed-bg-bundle-screen-path.anchor.test.ts` SC-6(`:122-129`) · `__tests__/components/mixed-bg-bundle-ui.test.tsx:92-99` · E2E `transfer-bg-mixed-use.spec.ts` BGMU-17(`:476-482`) · 주석 3곳.

신규: PR-A anchor(§2.1 시료 6건, R4÷2 대조) · PR-B anchor(카드 집계 = 단건×1.1 · 재배분 시료) · E2E 축별 1건 이상(BGMU-13~).

## 8. 다음 단계

1. ~~사용자: Q-1~Q-7 결정~~ — 2026-11-17 전부 권고안 확정.
- ✅ PR-A 공유지분 단건 #3428(2026-11-17) — 미측정 경로 12건(의제취득일 전·단서·구분 감정평가) 오라클 일치.
- ✅ PR-B 함께 양도 묶음(이 PR) — MB-6은 축 B만, 묶음은 MB-19(귀속 입력 거부)·MB-20(보충 승만)·MB-21(재배분 채무 없음). 묶음 × 지분·의제취득일 전·단서 구간 오라클 일치. 연간 합산은 종전대로 차단.
- ✅ PR-B 함께 양도 #3432(2026-11-17).
- ✅ **V-0 실측 = 결함 확정(비BG)** → fix PR(이 PR, 아래 §9).
2. PR-A Pre-Do anchor(§2.1 C·E 시료) 먼저 작성 → 설계 환류.
3. PR-A 구현·머지 → PR-B → V-0 실측 → PR-C 절 v0.3 ✅(§3.3).
4. 사용자: Q-10 · Q-12 결정 → PR-C0 → PR-C.

## 9. V-0 실측 결과와 fix (2026-11-17)

**결함 확정.** 비BG 겸용 축 B 60/40 · ⑧ 0건으로 계산 통과 · 정답 = 두 카드에 겸용 칸을 직접 넣은 값(= 단건 × 1.1, 원 단위 일치).

| 시료 | 화면 경로(수정 전) | 정답 | 차이 |
|---|---|---|---|
| A 고가(양도 20억) | 53,499,421 | 73,720,236 | −20,220,815 |
| B 12억 이하 · 부수토지 초과분 | 1,679,023 | 3,444,794 | −1,765,771 |

원인: 둘째 지분 카드는 `makeDefaultAsset`(겸용 토글 없음 · ① 숨김) → 병합 `mergePrimaryBasicAll`이 `assetKind`만 잇고 겸용 칸을 잇지 않음 → ④가 `housing` · `mixedUse` 없음으로 전송 → 상가분까지 주택(A) · 부수토지 초과분 비과세(B).

**fix(상가 선례 #3408과 같은 규약):**

1. **④⑧⑥ 병합** — 물건 단위 겸용 칸 단일 소스 `lib/calc/mixed-use-share-object-fields.ts`(겸용 여부 · 전용/공용/연면적 · 정착 · 토지 · 안분 지정 3칸 · 양도시 개별주택가격 · 상가건물 · ㎡당 공시지가 · 주택건물 나목 · 수도권 · 용도지역)를 `mergePrimaryBasicAll`에 추가. 취득 쪽(취득시 기준시가 · 나목 · 상속 · 증여 신고가액 · 실비 · 파트별 취득 · 미공시 §164⑦ 값)은 지분 값 그대로.
2. **⑤ 지분 카드 ③** — `acquisitionAsset`에 같은 목록을 주입해 겸용 패널을 띄우고, `shareCard`로 양도시 칸(주택 양도 sub-block · 상가건물 양도시 · 상가부수토지 양도시)을 숨긴다. 상가건물 기준시가 모달은 취득시 값만 쓴다. 안내 `mixed-share-object-fields-note`.
3. **⑧ 받지 않는 조합(사용자 결정 대기 없이 권고안 — 아래 Q-8·Q-9)** — `transfer-tax-validate-mixed-use-share.ts`.
   - **Q-8 보유 중 일부 용도변경(§166⑥) × 축 B → 차단**(자산 1 토글 칸). 취득 당시 구성은 지분 취득일마다 다른데 지분 카드에 칸이 없다. 대안: 자산 1 값 병합(지분이 모두 용도변경 전 취득일 때만 맞음) — 채택하지 않음.
   - **Q-9 둘째 이후 지분 카드의 미공시 환산(§164⑦) → 차단**(그 카드 토글 칸 · ⑤ 켜는 쪽 잠금). 3시점 입력에 양도시(물건 단위)와 취득시(지분 단위)가 섞여 있다. 첫 지분의 미공시는 계산한다.
   - ⑫는 바꾸지 않는다 — 직접 API는 카드마다 자기 `mixedUse`를 실어 이 제약이 없다(FB anchor).
4. **anchor** — `__tests__/api/mixed-use-axis-b-share-screen-path.anchor.test.ts`(A · B · C 화면 = 정답 · 같은 취득은 단건 × 1.1 ±2원(카드별 절사, V-P1b-2) · C 취득 쪽 값 고정) · `__tests__/components/mixed-use-axis-b-share-card.anchor.test.tsx`(③ 칸 · ⑧ 두 조합 · 짝). 뮤테이션 4건 실측(병합 제거 → 4건 실패 · 취득 칸까지 병합 → C 실패 · 주입 제거 · 양도시 숨김 제거 → 각 1건 실패).

남은 한계: 지분 카드의 양도시 나목 미입력 시 ⑧이 자산 1과 자산 2에 같은 문구를 낸다(자산 2 칸은 숨김 — 자산 1을 고치면 둘 다 풀린다) · 겸용 양도가액 구분(§166⑧) · 건물 직접 양도비 · 감가상각비는 자산 2건 이상이면 원래 받지 않는다(`mixed-use-sale-split-scope.ts:30` — 지분 분할도 해당) — 병합 대상 아님 · PR-C(BG 축 B)는 이 병합 위에서 다시 설계한다.(→ §3.3 v0.3)

**#3437 뒤 발견(2026-11-17 PR-C 조사)**: 지분 카드가 2005.4.30. 전(또는 1985.1.1. 전) 상속·증여 취득이면 ⑧ 「미공시를 켜세요」(`transfer-tax-validate-mixed-use-inheritance.ts:71`)와 Q-9가 서로를 가리키는 막다른 길 — 비BG에서도 재현(probe · 증여 2000-01-01). 세액이 틀리게 나오지는 않는다(계산 전 차단). → PR-C0 · Q-12.
