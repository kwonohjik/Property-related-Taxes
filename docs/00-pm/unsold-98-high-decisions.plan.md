# 조특법 §98 시리즈 리뷰 — High 결정 항목(US-01·US-13) 수정 계획

- 근거 리뷰: `docs/reviews/unsold-98-series-review-2026-11.md` US-01 · US-48 · US-13 · US-71 · US-43, §3 Q-10 · Q-11 · Q-14 · Q-15
- 사용자 결정(2026-11-08, 「권장안대로 진행」)
  - **Q-11 (b)** 임대하지 않은 §98 주택이 중과 대상이면 중과가 우선한다.
  - **Q-10 (b)** §98 20%를 적용하면 기본세율 산출세액을 고지만 한다(자동 선택 없음).
  - **Q-14 (a)** 겸용주택 주택분에서 §98 시리즈 차감을 계산한다(A1 기준시가 축 · 토지 선보유분은 Q-7 노선).
  - **Q-15 (a)** §155⑳ 경로도 일반 경로와 같은 순서(고가 안분 후 차감)로 계산한다.
- PR 분할: ① §98 세율 트랙(US-01·Q-11·Q-10/US-48) → ② 겸용 §98 시리즈(US-13·US-71) → ③ §155⑳ 경로(US-43).

## ① §98 세율 트랙 — US-01 · Q-11 (b) · Q-10 (b)

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

## ② 겸용 §98 시리즈 — US-13 · US-71 (Q-14 (a))

착수 시 이 절을 채운다. 출발점은 다음과 같다.
- §99 리뷰 NH-33 구현(`lib/tax-engine/transfer-tax-mixed-use-income-deduction.ts`)의 `MIXED_INCOME_DEDUCTION_COMPUTED_IDS`를 §98의3·§98의5·§98의6·§98의7(·§98의8)로 넓힌다.
- A1: 감면 카드 기준시가 3칸을 「주택부분 + 부수토지」 가격으로 정의한다(NH-33과 같은 규약).
- 고지 문구 「명문 규정이 없습니다」를 정정하고, §98·§98의2를 차감형 고지에서 분리한다(US-71).
- 확인 필요로 남길 것: §98의5 6억·§98의7 9억 가액 요건의 기준(주택부분/전체), 주택 면적이 더 큰 겸용의 단건 입력.

## ③ §155⑳ 경로 — US-43 (Q-15 (a))

착수 시 이 절을 채운다. 출발점은 §99 리뷰 NH-37 구현이다(같은 필터를 §98 시리즈까지 넓힌다).
