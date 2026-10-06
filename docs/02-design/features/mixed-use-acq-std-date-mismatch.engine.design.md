# 겸용주택 취득시 기준시가 시점 혼합 결함 (Phase B0) — 엔진 설계 + Pre-Do anchor

- 상태: **Engine Design + Pre-Do anchor 완료 (2026-10-06)** — 소스 수정 없음(설계서 1 + anchor 1).
- base `88f7bf67`, 브랜치 `fix/mixed-use-acq-std-date-mismatch`, 워크트리 `Property-related-Taxes-mxb0`
- 계획서: `docs/00-pm/transfer-split-acq-per-part-method.plan.md` §2.3 M-0 · §5 B0 · §7 V-1·V-10 · Q-4(독립 선행 PR 확정)
- UI 설계(병행): `mixed-use-acq-std-date-mismatch.ui.design.md` — 폼 필드·술어·배치는 그쪽, 엔진 필드·필수 조건·서버 refine은 본 문서가 정본.
- anchor: `__tests__/api/transfer.route.mixed-use-acq-std-date-mismatch.predo.anchor.test.ts` (실행: 6 passed · 4 skipped)
- 근거 표기: file:line은 워크트리에서 직접 열어 확인, 수치는 anchor 실행값. 미검증은 「확인 필요」.

---

## §0 요약·권장

**결함은 실재하고 anchor로 재현·정량화했다.** 겸용 별개 취득(토지 2005-06-10 / 건물 2010-03-15)에서 주택 건물분 취득시 기준시가가 `4억(건물일 개별주택가격) − 1.2M(토지일 공시지가)×100㎡ = 280,000,000`으로 나온다. 건물일 공시지가(1.8M)를 쓰면 220,000,000이다. **두 날짜가 같을 때만** 정당하다.

| 항목 | 권장 |
|---|---|
| **B0 범위** | **최소안(M)**: 주택 건물분 역산의 공시지가만 「건물 취득일 기준」으로 교체. 토지 파트(`landPricePerSqm`, 토지일)는 불변. 신규 입력 1개. |
| **B1로 이관** | ① 주택:상가 안분 비율(`apportionAcquisitionPrice` — 실가·감정·공통 자본적지출) ② 상가분 환산 합계 ③ PHD(§164⑦) 3시점 합산 ④ 용도변경(상가→주택) 합산. 근거 §4. |
| **신규 필드** | `acquisitionStandardPrice.landPricePerSqmAtBuildingAcq?: number` (취득측 extend에만, 양도측 무관) |
| **필수 조건(단일 술어 5항)** | ⓐ 겸용 payload의 `landAcquisitionDate ≠ buildingAcquisitionDate`(날짜 단위) ∧ ⓑ PHD OFF ∧ ⓒ 용도변경 방향이 `commercial_to_house` 아님 ∧ ⓓ `acquisitionStandardPrice.housingPrice > 0`. UI 술어(5항)와 **실질 일치** — §5.2 |
| **미입력** | 필수인데 없음/0이면 **차단**(엔진 throw · ⑫ 400 · ⑧ 오류). 토지일 값·PHD 값으로 대체 금지. |
| **세액 영향(fixture, 결정세액)** | 환산 **+780,360** · 실가 **−1,725,151** · 감정/매매사례 **−3,863,551** (부호 일정치 않음 — 파트별 LTHD율 차·차손 0 처리 때문, §7.3) |
| **함께 취득** | 값 불변(필드 미전송). anchor C-5·C-6가 수정 후에도 통과해야 하는 회귀선 |

**사용자 결정이 필요한 것**: Q-1(필수 판정 축) · Q-2(토지분 날짜: M vs S) · Q-3(안분 비율을 B0에 포함할지). §9.

---

## §1 결함 재현

### 1.1 경로
- 건물일 개별주택가격: `components/calc/transfer/mixed-use/MixedUseAssetMajorStdPrice.tsx:244` (`referenceDate={acqReferenceDate}`, `:115` = `asset.acquisitionDate` = **건물 취득일**). Legacy 패널도 같다(`MixedUseLegacyStdPrice.tsx:95·174`).
- 토지일 ㎡당 공시지가: 같은 파일 `:410` (`referenceDate={acqLandReferenceDate}`, `:118` = `asset.landAcquisitionDate || asset.acquisitionDate` = **토지 취득일**). 입력 폼 필드는 `mixedAcqLandPricePerSqm` **1개**뿐이다.
- ④: `transfer-tax-api-mixed-use.ts:154-158` — `acquisitionStandardPrice.landPricePerSqm = mixedAcqLandPricePerSqm(...)`(`:47-53`, 직접입력 → PHD ① → 1990 환산). 날짜: `landAcquisitionDate: primary.landAcquisitionDate || primary.acquisitionDate`, `buildingAcquisitionDate: primary.acquisitionDate`(`:142-143`).
- 엔진: `transfer-tax-mixed-use-housing.ts:273-276` — `acqLandStd = landPricePerSqm × effectiveAcqDerived.residentialLandArea`, `acqBuildingStd = max(housingPrice − acqLandStd, 0)`.
- 단건은 같은 연산을 금지한다: `transfer-tax-split-acq-price.ts:55-57` 「혼합 역산 … 서로 다른 취득시점 값의 뺄셈은 근거가 없다」 · `:44-50` (별개 취득이면 파트별 독립 + §163⑥ 1호·2호 각각).

### 1.2 anchor 실측 (Route POST, 3모드 — `__tests__/api/transfer.route.mixed-use-acq-std-date-mismatch.predo.anchor.test.ts`)
공통 fixture: 양도 2024-08-20 · 30억, 주택 100㎡/상가 100㎡, 토지 200㎡(주택부수 100), `isOneHouseExempt:false`. 취득시 개별주택가격 4억(건물일) · 상가건물 8천만(건물일) · **L1 = 1,200,000(토지일)** · **L2 = 1,800,000(건물일)** — 공시지가는 가상값.

| 모드 | 건물분 기준시가(현행) | 주택 토지/건물 취득가액 | 개산공제 토지/건물 | 결정세액 |
|---|---|---|---|---|
| 환산 (C-1) | **280,000,000** (정당값 220,000,000) | 124,137,930 / 289,655,173 | 3,600,000 / 8,400,000 | 677,954,008 |
| 실가 (C-2) | 280,000,000 | 180,000,000 / 420,000,000 | 0 / 0 | 594,155,689 |
| 감정·매매사례 (C-3) | 280,000,000 | 180,000,000 / 420,000,000 | 3,600,000 / 8,400,000 | 590,807,689 |

C-4(결함 핀): 건물일 값(개별주택가격 4억)을 그대로 두고 **토지일 공시지가만** 1.2M→1.8M로 바꾸면 건물분 기준시가가 280M→220M로 움직인다. 건물 취득일 시점의 값이 토지 취득일 입력에 종속된다는 직접 증거다.

### 1.3 함께 취득은 결함이 없다 (C-5·C-6)
두 날짜를 2010-03-15로 같게 하고 L=1.8M이면 건물분 220,000,000, 환산 개산공제 합계 12,000,000(= 4억 × 3% 항등), 결정세액 677,306,007(환산)·612,624,028(실가). 이 값이 수정 후에도 **신규 필드 없이** 그대로여야 한다.

---

## §2 세팅·소비 지점 전수표

grep 범위: `lib app components`의 `landPricePerSqm`·`acquisitionStandardPrice`·`mixedAcqLandPricePerSqm`·`phdLandPricePerSqmAtAcq`·`landStdPriceAtAcq`·`buildingStdPriceAtAcq` 전부 + `__tests__` 영향 후보. 분류: **T**=토지 파트용(토지 취득일 값이 맞음) · **S**=주택 결합가에서 빼는 용(건물일 값 필요) · **R**=주택:상가 안분 비율용 · **U**=용도변경 합산 · **P**=PHD 합산.

### 2.1 엔진 소비처 (`acquisitionStandardPrice.landPricePerSqm`)

| # | 위치 | 용도 | 분류 | 날짜 정당성 | B0 |
|---|---|---|---|---|---|
| E1 | `transfer-tax-mixed-use-housing.ts:273-274` `acqLandStd = L×주택부수토지` | 주택 **토지분** 기준시가 | **T** | 토지일 맞음 | 불변 |
| E2 | 같은 파일 `:275-276` `acqBuildingStd = housingPrice − E1` | 주택 **건물분** 역산 | **S** | **건물일 값 필요 → 결함** | **수정** |
| E3 | `:279-281` `acqLandRatio = E1/(E1+E2)` | 주택분 취득가액 토지:건물 분할 비율 | 파생 | E2 수정으로 자동 | 간접 |
| E4 | `:296-300` 개산공제 `computeEstimatedDeduction(E1/E2, 3%)` | 소령 §163⑥ base | T+S | 토지=1호(토지일), 건물=2호가목(건물일) | 간접 |
| E5 | `:311-325` `resolvePartNecessaryExpense(acqLandStd, acqBuildingStd,…)` | 자본적지출·직접 필요경비의 토지:건물 분할 | 파생 | E2 수정으로 자동 | 간접 |
| E6 | `applyHousingProviso` `:60-104` (non-PHD는 위 E1/E2를 인자로 받음, `:324-325`) | §97②2호 단서 나목 분할 | 파생 | 같음 | 간접 |
| E7 | `:247-271` 용도변경 `commercial_to_house` | 상가 합계(`acqCommBuilding + L×totalLand`)를 주택 면적비로 | **U** | 합산·뺄셈 없음 | **B1** (술어 제외) |
| E8 | `transfer-tax-mixed-use-helpers.ts:179` `apportionAcquisitionPrice` `commercialLandStd = L×상가부수토지` | 주택(건물일 **결합가**) : 상가(L1+건물일) 안분 비율 → 실가·감정 총액(`transfer-tax-mixed-use.ts:240-243`)·공통 자본적지출(`-housing.ts:76-81·311-313`, `-commercial.ts:250-253`) | **R** | **같은 필지가 분자(주택 결합가 안의 L2)와 분모(상가 L1)에서 서로 다른 날짜** | **B1** (§4.2) |
| E9 | `helpers.ts:384-401` `calcHousingEstimatedAcq` 용도변경 | 위 E7과 같은 상가 합계 | **U** | | B1 |
| E10 | `transfer-tax-mixed-use-commercial.ts:162·182` `acqLandStd = L×상가부수토지` | 상가 **토지분** | **T** | 토지일 맞음 | 불변 |
| E11 | `commercial.ts:164-175` `userLandPerSqm <= 0` throw | 필수 가드 | — | | 불변 |
| E12 | `commercial.ts:186·215-217·222` `acqTotalStd = 상가토지(L1)+상가건물(건물일)` → 환산 분자·분할 비율 | 상가분 환산 | **합산** | 각 항이 자기 파트 날짜 — §3 | B1 |
| E13 | `pre-housing-disclosure.ts:91·199-200` `landPricePerSqmAtAcquisition × area` + 건물 기준시가 | PHD Sum_A(③ 합산) | **P** | 합산·뺄셈 없음 | B1 (§4.3) |
| E14 | `inheritance.ts:190` `stdCandidate = housingPrice` | 상속·증여 주택분 평가액(신고가액 없을 때) | — | 상속개시일 단일 | 불변(필요경비 분할은 E5 경유) |
| E15 | 양도측 `transferStandardPrice.landPricePerSqm` (`housing.ts:128-131`, `helpers.ts:115`) | 양도시 | — | **양도일 단일** — 혼합 없음 | 불변 |

### 2.2 폼·API·검증 쪽 세팅·소비 (`mixedAcqLandPricePerSqm` · `phdLandPricePerSqmAtAcq`)

| # | 위치 | 용도 | 비고 |
|---|---|---|---|
| F1 | 입력: `MixedUseAssetMajorStdPrice.tsx:406-408`, `MixedUseLegacyStdPrice.tsx:221-223` (referenceDate=토지일 `:410`·`:225`) | 단일 입력칸 — 라벨은 「상가부수토지 개별공시지가」지만 엔진은 **주택 토지분도** 이 값을 쓴다(E1) | 신규 칸 필요 근거 |
| F2 | ④ `api-mixed-use.ts:47-53` 해소 함수 → `:157` | `acquisitionStandardPrice.landPricePerSqm` | 직접 → PHD ① → pre1990 3단 |
| F3 | ④ `:163-168` PHD `landSqmAtAcq = phd... || mixed...` | `preHousingDisclosure.landPricePerSqmAtAcquisition` | **P** |
| F4 | ⑧ `transfer-tax-validate-mixed-use-asset.ts:95·120-122·135·193-198` | 필수 검증 | 같은 해소 함수 공유 |
| F5 | ⑧ `transfer-tax-validate-mixed-use-inheritance.ts:62` | 상속·증여 상가분 존재 플래그 | 불변 |
| F6 | 표시 fallback `MajorStdPrice.tsx:103-106·385-386`, `LegacyStdPrice.tsx:84·210·221·341`, `PreHousingDisclosureSection.tsx:280` | 상가부분 합계 표시·모달 prefill | 상가 토지분(토지일) — 불변 |
| F7 | ① `lib/stores/calc-wizard-asset-gb.ts:340` · ②③ `calc-wizard-asset-mixed-use.ts:55·92·179` | 타입·initial·normalize | 신규 필드는 여기에 쌍으로 추가 |
| F8 | ⑥ 사이드바 | `mixedAcq*`를 읽지 않는다(grep: 위 파일들 외 0건) | 변경 없음 |
| F9 | ⑦ 결과 `components/calc/results/mixed-use/MixedUseCalculationSections.tsx:209·328·340·503·515` | 엔진 echo(`landStdPriceAtAcq`·`buildingStdPriceAtAcq`·`acqHousingStandardPrice`)를 **그대로 읽는다** — 재계산 없음 | 수정 후 자동 추종 |
| F10 | 신고서·PDF | 같은 echo 경유(`helpers.ts:648-721`이 gainSplit에서 복사) | 자동 추종 |

### 2.3 분류 결론
- **S(뺄셈) 소비처는 E2 1곳뿐**이다. E3·E4·E5·E6은 E2의 값을 받는 **하류**라 E2만 고치면 따라 바뀐다(코드 변경 불요, anchor로 증명).
- **T(토지 파트)** 소비처 E1·E10은 토지일 값이 정당하다 → 기존 단가 유지(UI 설계의 전제 5번과 **일치**: 「기존 단가(토지일)=토지분, 신규(건물일)=주택 결합가에서 빼는 건물분 역산에만」).
- **R·U·P·합산** 소비처(E7·E8·E9·E12·E13)는 **뺄셈이 아니라 합산·비율**이다 — §4에서 B1로 판정.

---

## §3 V-10 — 상가분 기준시가의 조회 날짜

| 값 | 입력 위치 | 조회 기준일 | 근거 |
|---|---|---|---|
| 취득시 **상가부수토지** 기준시가 | `mixedAcqLandPricePerSqm × 상가부수토지 면적` (`commercial.ts:182`, `helpers.ts:179`) | **토지 취득일** | 입력칸 `referenceDate={acqLandReferenceDate}` (`MajorStdPrice.tsx:410`) |
| 취득시 **상가건물** 기준시가 | `mixedAcqCommercialBuildingPrice` (`MajorStdPrice.tsx:356`) | **건물 취득일** | 모달 prefill `acquisitionDate: asset.acquisitionDate`(`:381`) · 직접 입력은 날짜 기준 없음(사용자 책임) |
| 양도시 상가 (토지·건물) | `mixedTransfer*` | **양도일 단일** | — |

**판정(Q-7)**: 상가분 합계 `acqTotalStd = 토지일 L1×면적 + 건물일 상가건물`은 **날짜가 섞인 합산**이지만, **각 항이 자기 파트의 취득일 값**이다 — 주택 건물분처럼 「한 날짜의 결합가에서 다른 날짜의 값을 빼서 한 날짜의 몫을 만드는」 연산이 아니다. 따라서 **근거 없는 연산이 아니라 모델 문제**다: 환산은 법상 파트별(토지/건물) 비율이어야 하는데(`transfer-tax-split-acq-price.ts` 단건 정본) 겸용 상가분은 「비율의 합」이 아니라 「합의 비율」(`commercial.ts:215-217`)로 계산한다. 이는 **B1(파트별 모델)** 소관이다. 상가 쪽에는 **뺄셈이 없다**(grep: `-commercial.ts`에 `housingPrice` 미사용).

---

## §4 B0 수정 범위 결정

### 4.1 원칙
B0 = 「현행 모델 안에서 **명백히 근거 없는** 연산만 제거」. 판정 기준: **한 날짜에 공시된 결합 가액에서 다른 날짜의 값을 빼는가**.
- 개별주택가격은 「토지+건물 결합 공시」이고 건물분 단독 공시가 없다(단건 엔진 주석 `transfer-tax-split-acq-price.ts:28-33`·`transfer-tax-split-acq-mode.ts:258-268`). 따라서 **그 가격이 공시된 날(건물 취득일)의 토지 공시지가**가 짝이다 — 짝이 다른 날이면 항등성이 아니라 임의 값이다.

### 4.2 안분 비율(E8) — **B1 권장** (B0에 넣지 않는다)
같은 「날짜 혼합」이 있다. 실측(anchor C-2, 실가 600,000,000 vs 함께취득 환산값 545,454,545): 주택:상가 비율이 `400/(400+120+80)=0.667`(현행) 대 `400/(400+180+80)=0.606`(건물일 공시지가로 통일)로 갈려 **주택분 취득가액이 54,545,455 이동**한다. 손계산(파이썬 재구현이 현행값과 1원 일치함을 확인 후 적용)으로 이 이동만 반영하면 결정세액 약 **−2,627,808**(592,430,538 → 589,802,730). 크기는 B0 본건과 같은 자릿수라 **무시할 수 없다**. 그러나:
1. **어느 날짜로 통일할지가 법적으로 열려 있다.** 법 §100② 후문·령 §166⑥ → 「부가가치세법 시행령」 §64①1호는 「**공급계약일 현재**의 기준시가」 **단일 시점**을 전제하고, §100②는 「토지와 건물 등을 **함께** 취득하거나 양도한 경우」의 구분기장이다(본문 직접 확인). 별개 취득에서 **단일 `acquisitionActualTotalPrice`** 자체가 모델에 안 맞는다(별개 취득이면 토지·건물 가액이 파트별로 실재 — 계획서 M-1).
2. 날짜를 정하면 **파트별 입력 모델(B1)** 로 가야 하는데, B0에서 임의 날짜로 통일하면 B1에서 다시 뒤집는다(이중 변경).
3. 계획서 B0 원칙(「현행 모델 안에서 명백히 근거 없는 연산만」)에 해당하지 않는다.

⇒ **B1**. 단 §9 Q-3으로 사용자 확인.

### 4.3 PHD(E13) — **B1 권장** (UI Q-3)
`transfer-tax-pre-housing-disclosure.ts:91·199-216`은 `L(취득, 토지일 — UI `MixedUsePreHousingDisclosureSection.tsx:85·274`) × 면적 + 건물 기준시가(건물일 — `:273`)의 **합산**(Sum_A)이다. **뺄셈이 없고** 각 항이 자기 파트 날짜다. §164⑦은 「**취득당시**의 가목 가액과 나목 가액의 합계액」(본문 직접 확인)이라 별개 취득에서 「취득당시」가 한 날짜를 뜻하는지 파트별인지는 **해석 문제**이고 해석례를 확인하지 못했다(**확인 필요**). B0는 PHD ON을 **필수 술어에서 제외**한다(ⓑ). 새 입력을 PHD에 요구하면 §164⑦ 산식의 정의를 건드린다.

### 4.4 B0 확정 범위
| 포함 | 제외(B1) |
|---|---|
| E2(주택 건물분 역산에 건물일 공시지가) + 하류 E3~E6 자동 | E8 안분 비율 · E12 상가 환산 합산 · E13 PHD 합산 · E7/E9 용도변경(상가→주택) |
| 신규 입력 1개(⑤ UI) + ④⑧⑫ 동기화 | 상속·증여 날짜 정규화(§9 Q-4 — 별건) |

### 4.5 토지분 날짜: M 권장 (Q-2)
- **M(권장)**: 토지분 = L1(토지일)×면적 · 건물분 = 개별주택가격 − L2(건물일)×면적. 근거: 소령 §163⑥1호 「토지 취득당시의 개별공시지가×3/100」과 2호가목 「**건물 취득당시**의 라목 가액×3/100」이 **각 파트의 취득당시**를 따로 요구한다(본문 직접 확인). 단건 별개취득도 파트별 독립이다(`split-acq-price.ts:44-50`). **결과**: 토지분+건물분(340M) ≠ 개별주택가격(400M) — 별개 취득에서 의도된 결과이며 개산공제 합계가 `3% × 라목 총액`과 달라진다(−1,800,000, S-1).
- **S**: 토지분도 L2(건물일). 합이 개별주택가격과 일치(항등 유지). 그러나 토지 파트의 §163⑥1호 「토지 취득당시」(토지일)와 어긋나고 **토지 LTHD 기산(이미 토지일)과 비대칭**이다.
- 두 안의 결정세액 차: 환산 +574,820(S) vs +780,360(M), 실가 −1,201,034 vs −1,725,151, 감정 −3,906,434 vs −3,863,551 — **작다**. 법리 일관성(M)을 권장.

---

## §5 신규 엔진 입력·필수 조건

### 5.1 필드
`acquisitionStandardPrice.landPricePerSqmAtBuildingAcq?: number` — `int().nonnegative().optional()`, **건물 취득일 기준 ㎡당 개별공시지가**. 양도측(`transferStandardPrice`)에는 두지 않는다(양도일 단일).
이름 근거: 기존 `landPricePerSqm`(토지일)과 **날짜 축이 다른 별개 값**임을 드러내고, UI 설계의 폼 필드 `mixedAcqLandPricePerSqmAtBuildingAcq`와 1:1.

### 5.2 필수 조건 — 단일 술어 (UI 5항과의 대조, 요청 1·5번)
UI 설계 술어: 「겸용 ∧ ④가 보내는 두 날짜 다름 ∧ PHD OFF ∧ `commercial_to_house` 아님(`house_to_commercial` Case B 포함) ∧ `mixedAcqHousingPrice > 0`」.

| UI 항 | 엔진/⑫ 대응 | 일치 |
|---|---|---|
| 겸용 | `mixedUse` 서브객체 존재 | ✅ |
| ④가 보내는 두 날짜 다름 | `landAcquisitionDate !== buildingAcquisitionDate` (ISO 날짜 문자열, ⑫ 시점) / 엔진은 `Date` → `toISOString().slice(0,10)` 비교 | ✅ (엔진 입력은 Date라 정규화 필요) |
| PHD OFF | ⑫: 이미 있는 `phd` 변수(`schema-mixed-use.ts` superRefine, `usePreHousingDisclosure===true`면 `preHousingDisclosure`) 부재 / 엔진: `housingAcqResult.phdResult` 부재(`housing.ts:135` 조기 return 이후 분기) | ✅ |
| `commercial_to_house` 아님 | `partialUsageChange?.direction !== "commercial_to_house"` (`housing.ts:247`이 별도 분기) | ✅ |
| `mixedAcqHousingPrice > 0` | `acquisitionStandardPrice.housingPrice > 0` (④가 `parseAmount(mixedAcqHousingPrice) || undefined`로 변환, `api-mixed-use.ts:155`) | ✅ — 이 항 덕에 상속·증여가 신고가액만 쓰는 경우·`housingPrice` 미입력 fixture(사례14)는 **필수 대상이 아니다** |

**정정 없음 — 5항 일치**. 구현은 **엔진 leaf 한 곳**(예: `lib/tax-engine/mixed-use-acq-date.ts`의 `isBuildingDayLandPriceRequired({landDate, buildingDate, usePhd, partialDirection, housingPrice})`)에 두고 ⑫·엔진·UI leaf가 모두 그것을 호출한다(memory `single-source-engine-helper`). UI 설계의 `lib/calc/mixed-use-acq-date-split.ts`는 **그 leaf를 감싸는 얇은 어댑터**여야 한다(폼 문자열 → 인자 변환만) — 날짜·방향·PHD 규칙을 두 번 쓰면 dual-truth.

### 5.3 미입력·0 처리 (요청 2번)
- 필수일 때 `undefined`와 `0` 모두 **차단**(`> 0` 아님 → 오류). 공시지가 0은 정당한 값이 아니다(기존 `landPricePerSqm` refine이 `> 0`을 요구하는 것과 같다 — `schema-mixed-use.ts:156`). **메시지는 구분 가능**(미입력 vs 0 이하)하게 두되 의미는 같다.
- 필수가 **아닐 때**(함께 취득·PHD·상속 신고가액 경로 등) 값이 와도 **무시**한다(엔진은 `landPricePerSqm`을 쓴다). UI는 그때 보내지 않는다(UI 설계 4항).
- **자동 fallback 금지**: 토지일 값(`landPricePerSqm`)·PHD 값·1990 환산값으로 대체하지 않는다. 같은 기준연도 편의(Q-1b)도 정책상 **기본안에서 제외**.
- 엔진 throw: `commercial.ts:164-175`와 같은 관례(`Error` 메시지로 필드 지목). `TaxCalculationError` 전환은 이 파일 관례를 따르지 않으므로 B0에서 하지 않는다.

### 5.4 미래 호환(동일 값 보호)
함께 취득(날짜 같음)은 술어가 거짓이라 **필드 없이 현행과 완전히 같은 경로**를 탄다 → 기존 저장 이력·API 클라이언트·예전 fixture 중 날짜가 같은 것은 영향 0.

### 5.5 깨질 기존 테스트 후보 (요청 6번 포함)
엔진은 필수일 때 throw하므로 **날짜가 다르고 `housingPrice>0`이고 PHD OFF**인 기존 fixture는 B0 구현 시 L2를 채우거나(값 = L1이면 결과 불변) 날짜를 맞춰야 한다. 직접 읽어 확인한 후보:

| 파일 | 근거 |
|---|---|
| `__tests__/tax-engine/transfer/expropriation-mixed-use.anchor.test.ts:18-28` | `mixedUseCase14()`(토지 1992 / 건물 1997) + `housingPrice: 400_000_000` + `usePreHousingDisclosure:false` |
| `__tests__/tax-engine/transfer/mixed-use-inherited-cohabitation-table2.anchor.test.ts:28-35` | `base40` = `mixedUseCase14()` + `housingPrice: 500_000_000`(PHD 미설정) |
| `__tests__/components/mixed-use-housing-estimated-numerator.anchor.test.tsx:49-54` | `mixedUseCase14()` + `housingPrice: 240_000_000` |
| `__tests__/api/mixed-use-part-cards.equivalence.anchor.test.ts:79` | 토지 2015-03-01 / 건물 2020-03-01 — `housingPrice` 확인 필요 |

그 밖은 **구현 PR에서 전수 실측**(`npx vitest run __tests__/tax-engine/transfer __tests__/api __tests__/components -t mixed`) — 이 설계 단계에서 단정하지 않는다. 정적 스캔: 날짜 리터럴이 다른 겸용 테스트 파일은 1건뿐(`part-cards.equivalence`), 나머지는 `mixedUseCase14()` 헬퍼 경유라 위 4건 외에 헬퍼+`housingPrice` 덮어쓰기 파일이 더 있을 수 있다.
**요청 6번 답**: `transfer.route.zod-required-2-ex-sp-pd.anchor.test.ts`의 토지일 `2010-06-01`/`2015-06-01`은 **`propertyType:"building"`·토지 payload**(`:111·198-201·314-320·393`)이고, 그 파일의 유일한 겸용 케이스 EX-5(`:230-285`)는 `acquisitionDate:"2009-03-01"` 하나뿐(토지일 미입력 → ④가 같은 날짜로 전송 → 술어 거짓)이라 **⑫ refine 추가로 깨지지 않는다**(읽어서 확인 — 실행은 구현 PR).

---

## §6 엔진·API 변경 지점 (file:line)

| # | 지점 | 파일:위치 | 변경 |
|---|---|---|---|
| 타입 | `MixedUseAssetInput.acquisitionStandardPrice` | `lib/tax-engine/types/transfer-mixed-use.types.ts:95-97` | `landPricePerSqmAtBuildingAcq?: number` 추가 + 주석(건물일) |
| leaf | 신규 술어 | `lib/tax-engine/mixed-use-acq-date.ts`(신규, ~30줄) | §5.2 |
| 엔진 | **E2** | `lib/tax-engine/transfer-tax-mixed-use-housing.ts:275-276` | `required ? field : landPricePerSqm`로 건물분 역산. 필수인데 없음/0이면 throw. **E1(`:273-274`)은 불변** |
| ④ | 변환 | `lib/calc/transfer-tax-api-mixed-use.ts:154-158` | 술어 참일 때만 `landPricePerSqmAtBuildingAcq` 전송(UI 설계 §4와 동일). 해소 함수는 신규 칸 전용 — `mixedAcqLandPricePerSqm()`의 PHD·pre1990 폴백을 **확장하지 않는다** |
| ⑧ | validate | `lib/calc/transfer-tax-validate-mixed-use-asset.ts` 환산 필수 블록(`:103-125`) 직후 | 같은 술어로 필수 검증 + 같은 해소 함수. **실가·감정 블록(`:88-100`)에도 같은 술어가 적용되도록** 술어는 모드 무관 |
| ⑨⑩ | Zod enum | — | **해당 없음**(enum 아님) |
| ⑪ | 자산-수준 `acquisitionDate` fallback | — | **해당 없음** — 겸용은 `mixedUse.landAcquisitionDate/buildingAcquisitionDate`가 문자열 **필수**, fallback은 ④(`api-mixed-use.ts:142-143`)에 이미 있다 |
| ⑫ | Zod | `lib/api/transfer-tax-schema-mixed-use.ts:51-53` | **취득측 extend에만** `landPricePerSqmAtBuildingAcq: z.number().int().nonnegative().optional()`(양도측은 공유 스키마 `:31-35`라 건드리지 않는다). superRefine(`:152-157` 근처)에 술어 거짓/참 분기 + `path:["acquisitionStandardPrice","landPricePerSqmAtBuildingAcq"]`. 컴패니언은 `transfer-tax-schema-companion.ts:119`가 같은 스키마를 써서 자동 |
| ⑬ | body spread | `lib/calc/transfer-tax-api.ts:717` · 컴패니언 `transfer-tax-api-companion-payload.ts:209-214` | `mixedUse` 객체를 **통째로** 싣는 구조라 변경 불요 — **anchor S-1이 증명** |
| ⑭ | Route 매핑 | `app/api/calc/transfer/mixed-use-asset-input.ts:173` | `...s.mixedUse` 스프레드라 중첩 필드가 그대로 도달. ⚠️ `:253-257`의 키 커버리지 가드는 **최상위 키만** 본다 — 중첩 `acquisitionStandardPrice` 안의 누락은 못 잡는다(사전 메모: 중첩은 별도 가드가 필요). ⑫가 strip하면 조용히 현행으로 돌아가므로 **S-1·S-4 anchor가 유일한 안전망** |
| 결과 echo | 선택 | `types` + `helpers.ts:648-721` | Q-5 — 건물분 산식 표시용 echo(`acqLandPricePerSqmForBuildingStd` 등). 세액 무관 |
| ①②③ | 클라 타입·initial·normalize | `calc-wizard-asset-gb.ts:340` · `calc-wizard-asset-mixed-use.ts:55·92·179` | UI 시니어(구 세션은 normalize가 `""`로 채우고 ⑧이 필요 시 차단 — 의도된 차단) |

**3중 패턴**: 필수 술어(leaf) · 값 해소 함수 · 「미입력 시 대체 금지」가 ⑤(노출)·④(전송)·⑧(검증)·⑫(서버)·엔진(throw) **5곳에서 같은 leaf**를 쓴다. UI 통과인데 ⑧이 막는 모순을 피하려면 leaf 인자(날짜·PHD·방향·housingPrice)의 **원천이 ④가 보내는 값과 같아야** 한다.

---

## §7 anchor 실측

### 7.1 명령
```
npx vitest run __tests__/api/transfer.route.mixed-use-acq-std-date-mismatch.predo.anchor.test.ts
→ Tests 6 passed | 4 skipped (10)   (2026-10-06, 1.6s)
```
`it.skip` 4건(S-1~S-4)은 B0 구현 PR에서 해제. Route(POST) 경로라 ⑫ strip 여부까지 본다(S-1·S-4).

### 7.2 검증 방법 (「기대값 근거」)
S-1~S-3의 값은 **파이썬 재구현**으로 산출했다. 재구현이 **현행 3모드의 주택분 양도소득금액·결정세액·지방세와 1원까지 일치**(환산 862,880,277 / 677,954,008, 실가 742,965,517 / 594,155,689, 감정 740,445,517 / 590,807,689)하고, 다른 변수(함께 취득 L=1.8M)에서도 분할·개산공제가 엔진과 일치함을 확인한 뒤, 입력만(건물분 220M) 바꿔 적용했다. **패치한 엔진을 실제로 돌린 값은 아니다**(소스 수정 금지) — 구현 PR에서 `it.skip` 해제 시 실측으로 확정된다.

### 7.3 수정 후 기대값 (환산 / 실가 / 감정·매매사례)

| 항목 | 환산 | 실가 | 감정·매매사례 |
|---|---|---|---|
| 건물분 기준시가 | 280M → **220M** | 280M → **220M** | 280M → **220M** |
| 토지분 취득가액 | 124,137,930 → **146,044,624** | 180,000,000 → **211,764,705** | 180,000,000 → **211,764,705** |
| 건물분 취득가액 | 289,655,173 → **267,748,479** | 420,000,000 → **388,235,295** | 420,000,000 → **388,235,295** |
| 개산공제(토지/건물) | 3.6M/8.4M → 3.6M/**6.6M** | 0 (불변) | 3.6M/8.4M → 3.6M/**6.6M** |
| 주택 양도소득금액 | 862,880,277 → 864,614,410 | 742,965,517 → 739,131,846 | 740,445,517 → 731,859,846 |
| **결정세액** | 677,954,008 → 678,734,368 (**+780,360**) | 594,155,689 → 592,430,538 (**−1,725,151**) | 590,807,689 → 586,944,138 (**−3,863,551**) |
| 지방소득세 | 67,795,400 → 67,873,436 | 59,415,568 → 59,243,053 | 59,080,768 → 58,694,413 |
| 총 납부세액 | 745,749,408 → 746,607,804 (**+858,396**) | 653,571,257 → 651,673,591 (**−1,897,666**) | 649,888,457 → 645,638,551 (**−4,249,906**) |

**부호가 일정하지 않은 이유**(납세자 유·불리 단정 금지): ① 환산은 개산공제 합계가 `3%×(L2−L1)×100 = 1.8M` 줄어 차익이 늘고 ② 토지분 LTHD율(30%)이 건물분(28%)보다 높아 토지로 취득가액이 이동하면 소득금액이 줄고 ③ **주택 건물분 차손은 0 처리**(실가·감정 현행 −6.2M·−14.6M이 소득에 안 들어간다 — 현행 상가분은 차손을 통산해 비대칭이다, 아래 §9 확인 필요)가 겹친다. fixture는 한계세율 45% 구간이라 소득금액 변화 × 0.45가 곧 세액 변화다.

### 7.4 mutation probe
**미수행**. 근거: 소스 수정 금지. 구현 PR에서 (a) E2의 `field`를 `landPricePerSqm`으로 되돌림(C-4 핀 반전·S-1 실패해야) (b) 술어 `landDate!==buildingDate`를 항상 false로(S-4 실패해야) (c) ④ 전송 조건 제거(S-1 실패해야) 3건 이상 KILLED 확인할 것.

---

## §8 법령 근거 (KoreanLaw MCP 본문 직접 확인, 2026-10-06)

| 인용 | 확인한 내용 | B0와의 관계 |
|---|---|---|
| 「소득세법」 §99①1호 **라목**(MST 280405, 시행 2026-01-01) | 주택 기준시가 = 「부동산 가격공시에 관한 법률」에 따른 **개별주택가격 및 공동주택가격** | 개별주택가격은 **하나의 공시 가액**이다. 건물분·토지분 분리 공시 명문은 **없다** |
| 「소득세법」 §99①1호 **가목** | 토지 = **개별공시지가** | 토지분 |
| 「소득세법」 §99③2호 | 개별공시지가·개별주택가격이 **공시되기 전에 취득**한 토지·주택의 취득당시 기준시가는 령으로 정함 | PHD 근거 |
| 「소득세법 시행령」 §164③(MST 290841, 시행 2026-10-01) | 새 기준시가가 고시되기 전 취득·양도는 **직전의 기준시가** | 날짜별 직전 고시분 조회 근거 — 건물일·토지일 각각 |
| 「소득세법 시행령」 §164⑦ | 개별주택가격(**「이들에 부수되는 토지를 포함한다」**) 공시 전 취득 주택의 취득당시 기준시가 = 최초공시가 × 「**취득당시**의 가목+나목 합계」/ 「최초공시 당시의 가목+나목 합계」 | 결합가가 부수토지 포함임을 확인. 「취득당시」의 별개 취득 해석은 §4.3 확인 필요 |
| 「소득세법 시행령」 §163⑥ | 개산공제: **1호 토지 = 취득당시 개별공시지가×3/100**, **2호가목 = 건물(부수토지 포함)·주택 취득당시의 다목·라목 가액×3/100**, 나목 = 그 밖의 건물 | 별개 취득에서 토지는 토지일·건물은 건물일(M안 근거). 1호와 2호가목이 각 파트의 「취득당시」를 따로 요구 |
| 「소득세법」 §100② | 토지와 건물 등을 **함께 취득하거나 양도한 경우** 구분 기장, 불분명하면 **취득 또는 양도 당시의 기준시가 등**을 고려해 령으로 안분; 후문 **공통 취득가액·양도비는 해당 자산 가액에 비례 안분** | 안분 비율(E8)은 「함께 취득」 전제 → §4.2 |
| 「소득세법 시행령」 §166⑥ | 가액 구분 불분명 시 **「부가가치세법 시행령」 §64①에 따라 안분** | 위임 체인 |
| 「부가가치세법 시행령」 §64①1호(MST 283641) | 기준시가가 모두 있으면 **「공급계약일 현재」의 기준시가**에 비례 안분(감정평가가액 있으면 그 가액) | **단일 시점** 전제 — 별개 취득 안분 비율이 B0 밖인 근거 |

**주택 건물분 = 개별주택가격 − 부수토지 공시지가×면적 역산의 법령 근거**: **명문 근거를 찾지 못했다**(§99·§100·령 §163⑥·§164·§166 본문 전체에서 「라목 가액에서 가목 가액을 빼 건물분을 구한다」는 문구 없음). 이 역산은 **엔진·단건 정본의 관행**이며 그 정당화는 (a) 개별주택가격이 부수토지 포함 결합가라 건물분 단독 공시가 없고 (b) 개산공제 합계를 `라목 가액×3%`(령 §163⑥2호가목)와 일치시키는 항등성이다(`transfer-tax-split-acq-mode.ts:258-268`). 따라서 **「같은 날짜의 결합가·토지가」일 때만** 정당화가 성립하고, 날짜가 다르면 (b) 항등성도 깨진다 — B0 수정은 이 정당화의 전제를 복원하는 것이다. 이 점은 **법령이 직접 요구한다고 주장하지 않는다**(관행 복원).

---

## §9 미결·확인 필요

### 사용자 결정 (Q-n)
- **Q-1 필수 판정 축**: (a) **권장** — 날짜 불일치(`landDate ≠ buildingDate`)면 필수, 같은 공시지가 기준연도여도 다시 입력(엄격·정책 일관). (b) 기준연도(`sameLandPriceYear`, `lib/calc/building-std-batch-apply.ts` `sameLandPriceYear`)가 같으면 불필요 + 표시 fallback. (b)는 UX는 낫지만 「토지일 값으로 대체」가 되어 **자동 fallback 금지 정책과 충돌**하고 수동 연도 재정의(`phdLandPriceYearAtAcqIsManual`)와의 정합 비용이 든다.
- **Q-2 토지분 날짜**: M(권장) vs S — §4.5.
- **Q-3 안분 비율(E8)·PHD(E13)를 B0에 넣을지**: 권장 **B1 이관**(§4.2·§4.3). 넣는다면 날짜 통일 기준과 파트별 모델이 선행 결정이어야 한다.
- **Q-4 분리 OFF·상속·증여의 `landAcquisitionDate` 잔존**: UI 권고(B0 이전 별건)에 **동의**. 근거: ④는 `hasSeperateLandAcquisitionDate`를 보지 않고 `primary.landAcquisitionDate || acquisitionDate`를 보낸다(`api-mixed-use.ts:142`). B0 술어는 **④가 실제로 보내는 날짜**를 기준으로 하므로 잔존 값이 있으면 필수가 되고 칸도 노출된다(엔진이 그 날짜로 토지 LTHD를 계산하는 현실과 일치). 정규화는 LTHD 등 다른 축까지 건드리는 별건이다.
- **Q-5 결과 산출근거**: 엔진 echo(`acqLandPricePerSqmForBuildingStd`)를 추가해 「건물분 = 개별주택가격 − 건물 취득일 공시지가×면적」을 표시할지(세액 무관, 선택). 권장: 표시 재작성(dual-truth)을 피하려면 echo를 엔진이 내는 쪽이 맞다 — 다만 B0 필수는 아니다.

### 확인 필요 (검증 못 함)
1. **실브라우저 미수행** — 폼→계산→결과, Network body의 신규 필드 확인은 UI Do 단계.
2. **상속·증여에서 토지 취득일 칸 노출 여부**: `CompanionAcqDateSection.tsx:152-165`는 취득원인을 보지 않는데 ⑧ 주석(`validate-mixed-use-asset.ts:25-30`)은 「상속·증여는 토지 취득일 입력란이 없다」고 한다 — 모순, 어느 쪽이 맞는지 확인 필요.
3. **주택 건물분 차손 0 처리 vs 상가분 통산 비대칭**: anchor 실측에서 주택은 건물 차손(−6,206,896)이 소득에 안 들어가고 상가는 통산된다(726,413,794 = 토지 0.7배 + 건물 차손). 의도(예: 12억 안분 분기 부산물)인지 별건 결함인지 확인 필요 — B0 범위 밖.
4. 별개 취득에서 §164⑦ 「취득당시」·§166⑥ 안분의 **해석례**(국세청·조세심판원) 미확인 — B1 착수 조건.
5. mutation probe(§7.4)·깨질 기존 테스트 전수(§5.5)는 구현 PR에서 실측.
6. 이력(IndexedDB) 재계산 시 구 입력(필드 없음)은 날짜가 다르고 `housingPrice>0`이면 ⑧에서 막힌다 — 저장된 `resultData` 표시는 영향 없고 **재계산 경로만** 차단될 것으로 보이나 `lib/storage/CLAUDE.md` 경로 확인 필요.
7. 공시지가 값은 fixture 가상값이다(실공시값이 아님). 세액 영향 크기는 두 날짜의 공시지가 차에 **선형 비례**하는 합성 수치로 읽을 것.
