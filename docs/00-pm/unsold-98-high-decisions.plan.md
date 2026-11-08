# 조특법 §98 시리즈 리뷰 — High 결정 항목(US-01·US-13) 수정 계획

- 근거 리뷰: `docs/reviews/unsold-98-series-review-2026-11.md` US-01 · US-48 · US-13 · US-71 · US-43, §3 Q-10 · Q-11 · Q-14 · Q-15
- 사용자 결정(2026-11-08, 「권장안대로 진행」)
  - **Q-11 (b)** 임대하지 않은 §98 주택이 중과 대상이면 중과가 우선한다.
  - **Q-10 (b)** §98 20%를 적용하면 기본세율 산출세액을 고지만 한다(자동 선택 없음).
  - **Q-14 (a)** 겸용주택 주택분에서 §98 시리즈 차감을 계산한다(A1 기준시가 축 · 토지 선보유분은 Q-7 노선).
  - **Q-15 (a)** §155⑳ 경로도 일반 경로와 같은 순서(고가 안분 후 차감)로 계산한다.
- PR 분할: ① §98 세율 트랙(US-01·Q-11·Q-10/US-48) → ② 겸용 §98 시리즈(US-13·US-71) → ③ §155⑳ 경로(US-43).

## ① §98 세율 트랙 — US-01 · Q-11 (b) · Q-10 (b) — #3000

### 변경

| 지점 | 변경 | 근거 |
|---|---|---|
| `lib/tax-engine/transfer-reductions/unsold-hybrid-p5.ts` | `RENTAL_NOT_CONFIRMED` 게이트와 `Unsold98Input.rentedFor5Years`를 뺀다. 적용 요건은 보유 5년(일자 검증) 하나 | 해석례 재일46014-2551·서면4팀-1122·서면5팀-1134(「보유 또는 임대」), 조특령 §98③(보유기간 계산만 위임)·④(임대 증빙 없음) |
| `lib/tax-engine/transfer-reductions/income-deduction-router.ts` `resolveSurchargeExclusionByReduction` | `unsold_98`은 감면 카드 `rentedFor5Years98 === true`일 때만 중과 배제(3호) | 소령 §167의3①3호 「…감면되는 임대주택으로서 5년 이상 임대한 국민주택」 |
| `lib/tax-engine/transfer-tax-rate-calc.ts` | `forceFlatRate20 && !surchargeApplicable`일 때만 20% — 중과 대상이면 중과세율 | Q-11 (b). 법 §98①1호는 「같은 법 제104조제1항에도 불구하고」만 지목, §104⑦은 별개 항 |
| `lib/tax-engine/transfer-tax-unsold98-rate-notice.ts`(신규) · `transfer-tax.ts` STEP 7 | 중과 우선이면 확인 필요 고지, 20%면 같은 과세표준·같은 중과 판정의 기본세율 산출세액 고지 | Q-11 해석례 0건 · Q-10 (b) · 조특령 §98④ |
| `components/calc/transfer/Unsold98InputForm.tsx` | 토글 「5년 이상 임대 (다주택 중과 배제 판정)」, 안내문의 「중과세율 대체」·「중과세율이 적용되지 않습니다」를 조건부 문구로 | 리뷰 US-01 수정 방향 3 |
| 설계 문서 `transfer-remaining-p5.{engine,ui}.design.md` | 「임대 사실은 확인 토글」을 3호 판정용으로 정정 | 같음 |

### 임대 사실 칸 — 하나로 합치지 않는다 (실측 후 결정)

- 양도 주택 3호 칸(`sellingHouseExclusion.taxIncentiveRental`)은 명부(`houses[]`)가 있을 때만 엔진에 닿는다(`lib/calc/transfer-tax-api-houses.ts` `buildHousesPayload` — 명부가 없으면 `undefined`).
- §98 카드 토글은 감면 카드로 실려 명부·무명부 두 경로(STEP 0.45 주입 · fallback `surchargeExcludedByReduction`)에 모두 닿는다. 국민주택규모도 §98 카드가 이미 확인한다.
- 두 입력은 이미 OR로 공존한다(`__tests__/api/transfer.route.tax-incentive-rental-3ho.anchor.test.ts` 「§98 자동 경로 — 3호 입력과 OR로 공존한다」). 어느 쪽이든 켜면 배제되고 서로를 덮지 않는다.
- ⇒ §98 주택의 3호 정본은 §98 카드 토글로 둔다. 양방향 동기화는 하지 않는다.
- 확인 필요(범위 밖): 3호 후단(민간매입 장기일반·단기 아파트의 양도기한)은 §98 카드 경로에서 판정하지 않는다. 바닥 기한 2027.12.31. 이전 양도분은 영향이 없다.

### 실측 (mock 2024 누진 · 1996-06-15 취득 5억 · 8억 양도 · 2주택)

| 시나리오 | 수정 전 | 수정 후 |
|---|---|---|
| 비조정 · 임대 OFF | 64,801,000 (§98 탈락) | 45,650,000 + 기본세율 58,910,000 고지 |
| 조정(명부) · 임대 OFF · 2026-06-01 | 167,871,000 (§98 탈락) | 167,871,000 (§98 적격 · 중과 우선) + 확인 필요 고지 |
| 조정(무명부) · 임대 OFF | 167,871,000 | 167,871,000 + 확인 필요 고지 |
| 조정(명부·무명부) · 임대 ON | 45,650,000 | 45,650,000 |
| 비조정 · 과세표준 67,500,000 | 14,850,000 | 14,850,000 + 기본세율 10,440,000 고지 |

route(fallback 세율표, 2022-08-01 양도): 65,395,000 → **45,650,000**. 고지의 기본세율 산출세액 59,450,000(38% − 19,400,000)은 리뷰 값과 같다.

### anchor

- `__tests__/tax-engine/transfer/unsold-98-rental-gate-us01.anchor.test.ts`(엔진 7건)
- `__tests__/api/transfer.route.unsold-98-rental-gate-us01.anchor.test.ts`(폼 → ④ → ⑫ → ⑭ → 엔진 4건)
- 14지점: 입력 필드는 바뀌지 않는다(`rentedFor5Years98` 그대로 ①~⑭ 배선). 결과는 기존 `warnings`로 싣는다.

## ② 겸용 §98 시리즈 — US-13 · US-71 (Q-14 (a)) — #3001

### 변경

| 지점 | 변경 | 근거 |
|---|---|---|
| `lib/tax-engine/transfer-reductions/mixed-use-computed-ids.ts`(신규 leaf) | 겸용 주택분 차감 계산 조문을 §99·§99의3(NH-33)에서 §98의3·§98의5·§98의6·§98의7·§98의8까지 넓힌 `MIXED_INCOME_DEDUCTION_COMPUTED_IDS`. 엔진과 감면 패널이 같은 집합을 쓴다 | 재산세과-1174·-1079·-514·-1214·-1328(겸용주택은 주택부분에만 특례), 법령해석과-103(§99의2) |
| `lib/tax-engine/transfer-tax-mixed-use-totals.ts` | 계산 조문은 미반영 고지에서 뺀다. §98은 「세율 100분의 20 특례 미반영(확인 필요)」으로 따로, §98의2는 장특 고지 1건만. 남은 조문(§99의2·§98의4)은 조문명 + 「주택부분에만 적용 · 미계산 · 확인 필요」. `reductionDetails`에 `unsold98{3,5,6,7,8}Detail` | US-71 · 고지 문구 「명문 규정이 없습니다」는 사실과 달라 뺐다 |
| `lib/tax-engine/transfer-tax-mixed-use-income-deduction.ts` · `transfer-tax-mixed-use.ts` | §98의3에서 토지를 건물보다 먼저 취득했으면 토지 선보유분 안내(`mixedLandPriorNotice`). 산식은 바꾸지 않는다 | Q-7 (b) — 확정 판결 노선(대법원 2019두58353) 유지, 해석·심판례 노선(재산세과-1450·조심2011전1378·재산세과-514) 병기 |
| `components/calc/transfer/UnifiedReductionPanel.tsx` | 겸용 자산에서 계산 조문을 고르면 「겸용주택 — 감면은 주택부분(부수토지 포함)에만 적용합니다」 안내 카드 | A1: 기준시가 3칸은 「주택부분 + 부수토지」 가격(NH-33과 같은 규약) |
| `components/calc/results/mixed-use/MixedUseTotalTaxSection.tsx` | 차감 행 라벨에 §98의3·§98의5·§98의6·§98의7·§98의8 | 같음 |

### 실측

| 시료 | 수정 전 | 수정 후 |
|---|---|---|
| route R1(F17-B 본문 60/40 · 15억 · 2009-08-01 취득 · 2022-02-16 양도 · §98의3) | 220,716,936 | 141,729,720 (차감 176,415,000 · 과세표준 385,613,000) |
| mock case14(11억 · §98의3 기준시가 2억→3억→4억) | 244,707,938 | 158,949,305 (차감 189,143,868 · 농특세 0) |
| 브라우저(주거 100㎡ · 비주거 100㎡ · 토지 200㎡ · 15억) | 240,801,000 | 171,600,000 (차감 152,000,000) |

리뷰 R1 근사치 141,135,720과의 차이 594,000은 근사가 2023년 이후 누진공제(25,940,000)를 쓴 탓이다. 2022년 양도분 누진공제는 25,400,000이고 엔진이 맞다.

### anchor

- `__tests__/tax-engine/transfer/us13-mixed-use-98-series.anchor.test.ts`(엔진 8건)
- `__tests__/api/transfer.route.mixed-use-98-series-us13.anchor.test.ts`(⑫ → ⑭ → 엔진)
- `__tests__/components/mixed-use-reduction-housing-only-notice.test.tsx`(UI 4건)
- 14지점: 입력 필드는 바뀌지 않는다. 결과는 기존 `reductionDetails`·`warnings`로 싣는다.

### 확인 필요로 남긴 것

- §98의5 가액 요건(기준시가 6억)·§98의7 가액 요건(취득가액 9억)을 주택부분 가액으로 볼지 건물 전체로 볼지 — 지금은 감면 카드 입력값으로 판정한다. 해석례를 찾지 못했다.
- 주택 면적이 더 큰 겸용을 일반 주택 하나로 입력하면 감면이 상가부분까지 미친다(§99 리뷰 Q-14와 같은 축, 범위 밖).
- §99의2·§98의4는 겸용 경로에서 계산하지 않고 고지만 한다.

## ③ §155⑳ 경로 — US-43 · US-71 (Q-15 (a)) — #3002

### 변경

| 지점 | 변경 | 근거 |
|---|---|---|
| `lib/tax-engine/transfer-tax-rental-housing-income-deduction.ts` | 5년 후 차감 조문을 §99·§99의3(NH-37)에서 §98의3·§98의5·§98의6·§98의7·§98의8까지 넓힌다. 고가주택 안분·장특·§161 반영 후 차감(일반 경로와 같은 순서). 「적용 순서 (확인 필요)」 단계 유지, 근거 상수 `TRANSFER_RENTAL_HOUSING.PIT_RD_155_20` | Q-15 (a) — 순서를 정한 규정·해석례 없음 |
| `lib/tax-engine/transfer-tax-rental-housing-reductions.ts` | 5년 이내 하이브리드는 세액감면형이라 일반 경로처럼 `calcReductions`에 넘긴다(`isTaxAmountTrack`). 미반영 고지 분리: §98 → 「세율 특례 미반영」, §98의2 → 장특 고지 1건(§97의3·§97의4 «임대주택» 재확인 문장과 분리), 나머지(§99의2 5년 후·§98의4) → 조문명 + 확인 필요 | US-43 · US-71 |
| `components/calc/results/transfer/DetailedStatementHelpers.ts` · `FilingFormTableHelpers.ts` | 이 경로의 「감면후 소득금액」을 과세대상 양도소득금액 − 소득금액 감면대상으로 표시. 종전에는 차감 전 값을 적어 과세표준 + 기본공제와 어긋났다(§99·§99의3 NH-37 분기도 같은 결함) | 브라우저 확인 중 발견 |

### 실측 (mock · 리뷰 C1~C3 재현)

| 시료 | 일반 경로 | §155⑳ 수정 전 | §155⑳ 수정 후 |
|---|---|---|---|
| C1 §98의5(5년 후 · 2024-06-01) | 4,141,500 | 12,012,000 | 4,141,500 |
| C2 §98의7(5년 후) | 3,271,500 | 6,781,500 | 3,271,500 |
| C3 §98의5 5년 이내(2015-06-01) | 0 | 79,347,400 | 0 |
| 시나리오 B · §98의5 | — | 81,604,600 | 30,217,000 (§161 후 차감 125,100,000 + 확인 필요) |

브라우저(15억 · 2010-07-01 취득 6억 · 시나리오 A · 2024-06-01 양도): 12,012,000 → 4,141,500. 신고서 표 감면후 소득금액 36,000,000(수정 전 72,000,000) · 과세표준 33,500,000.

### anchor

- `__tests__/tax-engine/transfer/us43-rental-155-20-98-series.anchor.test.ts`(엔진 7건)
- `__tests__/calc/rental-155-20-income-after-deduction-display.anchor.test.ts`(표시 2건)

### 확인 필요로 남긴 것

- §155⑳ 경로의 차감 순서(§161 안분 후 차감)는 정면 규정·해석례가 없어 「확인 필요」 단계를 유지한다.
- §99의2(5년 후)·§98의4는 이 경로에서 계산하지 않고 고지만 한다.
