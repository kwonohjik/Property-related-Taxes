# §155⑳ 거주주택 거주요건 — 증여·상속 전 동일세대 거주 통산 (1주택 코드 리뷰 별건 ⑥) 수정 계획서 v0.2

- 작성일: 2026-10-19 · 기준 커밋: master `b19dc044d` · 워크트리 `-rhgift` (브랜치 `fix/rental-residence-gift-household-months`)
- 출처: 1주택 코드 리뷰 별건 8건 재분류(2026-10-18)의 ⑥ 「해석 대기」 → 해석례 확보(2026-10-19) → 사용자 결정(2026-10-19)

## 0. 사용자 결정 (2026-10-19)

| 항목 | 결정 |
|---|---|
| 통산 대상 | 동일세대 전부 — 배우자·직계존비속(증여·상속 모두) |
| 통산 범위 | **거주기간만**. 보유기간은 종전대로(증여일·상속개시일 기산) |
| 부담부증여로 취득한 주택 | **(가) 현행 범위 유지** — 이 입력으로 표현하지 않는다(결정 #38-5와 같은 범위, `GiftedSameHouseholdField.tsx:207-210`) |
| Q-1 통산 적용 시 고지 | **(a) 확인 필요 고지 없음** — 통산 내역만 결과에 적는다 |
| Q-2 증여 전 거주 개월 미답 | **입력된 개월만 통산** — 미답은 0, 미답 고지(S4)는 넣지 않는다 |

## 1. 근거 (국세법령정보시스템 원문 확인 — 2026-10-19)

| 문서 | 요지 | 쓰임 |
|---|---|---|
| 서면-2022-부동산-2643 [부동산납세과-3385] (2022.11.02.) | 「제155조제20항제1호에 따른 거주주택의 거주기간을 계산함에 있어 … 동일세대원 간 증여로 취득한 주택을 양도하는 경우에는 수증자가 증여받기 전에 증여자와 수증자가 동일세대로서 거주한 기간을 통산」. 증여 당시 별도세대였다가 증여 후 합가한 자녀는 통산하지 않는다 | 증여 — 정면 |
| 서면-2016-부동산-3992 [부동산납세과-1366] (2016.09.01., 당시 §155⑲) | 「해당 양도주택에서 피상속인과 함께 하였던 거주기간과 상속인의 거주기간을 통산」 | 상속 — 정면 |
| 사전-2025-법규재산-0504 (2025.06.25.) | 배우자로부터 증여받은 주택과 상속받은 주택은 「동일세대원으로서 보유하고 거주한 기간을 통산」 | 증여·상속(배우자) |
| 서면-2020-법령해석재산-2718 [법령해석과-1743] (2021.05.17.) | 부담부증여: 채무 부분은 증여받은 날부터, 증여 부분은 통산 | 범위 밖 근거(결정 (가)) |

## 2. 현행 결함 (실측)

§154① 거주요건·표2 대상 판정은 이미 통산 leaf `resolveExemptionRequirementResidenceMonths`(`lib/tax-engine/one-house/residence-months.ts:90-92`)를 읽는다(결정 #38-7·#38-9). 이 leaf는 §154⑧3호 동일세대 상속 통산(`consolidateResidenceMonths`, `:22-37`)과 증여 전 동일세대 거주 개월(`giftHouseholdPriorResidenceMonths`, `gift-household-basis.ts:136-140`)을 더한다. 같은 파일의 §155⑳ 경로는 본인 거주만 읽는다.

| 위치 | 현행 | 용도 |
|---|---|---|
| `lib/tax-engine/transfer-tax-rental-housing-judge.ts:91` | `Math.floor(effectiveInput.residencePeriodMonths / 12)` | `checkEligibility`의 거주주택 거주연수(A 2년 요건 `eligibility.ts:341` · §154⑩ 종전규정 `:692`) — 판정 메뉴(`rental-housing-verdict.ts:66`)·판정 단계(`transfer-tax-judgment-steps.ts:218`)도 이 함수 |
| `lib/tax-engine/transfer-tax-rental-housing-step.ts:190` → `:222` (7번째 인자 `residenceLiveYears`) | 같은 본인 값 | 세액 경로의 같은 요건 판정 |
| `lib/tax-engine/transfer-tax-rental-housing-step.ts:190` → `:220` (5번째 인자 `liveYears`) | 같은 본인 값 | **표2 공제율 거주분** — 바꾸지 않는다 |
| `lib/calc/transfer-tax-validate-rental-exception.ts:389`·`:391-394`·`:405-407` (⑧) | 본인 거주(`deriveResidencePeriodMonths`) 24개월 미만이면 **계산 차단** | 화면에서는 엔진에 닿기 전에 막힌다 |

**Probe 실측**(`__tests__/zz-probe/`, 커밋 안 함): 9억 거주주택, 증여일 2021-01-04, 양도일 2025-03-03, 본인 거주 12개월, 장기임대 1호(A, 요건 충족).

| 입력 | 통산 leaf | 현행 | 두 줄(`judge:91`·`step:222`)만 leaf로 바꾼 probe |
|---|---|---|---|
| 증여 · 증여 전 같은 세대 거주 없음 | 12 | 미충족 · 132,286,000 | 미충족 · 132,286,000 (불변) |
| 증여 · 증여 전 같은 세대 거주 18개월 | 30 | 미충족 · 132,286,000 | **충족 · 비과세 0** |
| 동일세대 상속 · 동거 18개월 | 30 | 미충족 · 132,286,000 | **충족 · 비과세 0** |
| 본인 거주 24개월(대조) | 24 | 충족 · 0 | 충족 · 0 |

## 3. 수정 범위

| # | 지점 | 변경 |
|---|---|---|
| S1 | `transfer-tax-rental-housing-judge.ts:91` | `liveYears`를 `Math.floor(resolveExemptionRequirementResidenceMonths(effectiveInput) / 12)`로(import는 `:22`에 이미 있음) |
| S2 | `transfer-tax-rental-housing-step.ts:222` | 7번째 인자(요건)만 같은 leaf 값. **5번째 인자(`:220`, 공제율)는 본인 값 유지** — 변수 둘로 나눠 이름으로 구분 |
| S3 | ⑧ `transfer-tax-validate-rental-exception.ts:389-407` | 24개월 비교를 엔진과 같은 통산값으로 — 본인 개월 + 상속 통산(`consolidateResidenceMonths` + ④ 조각 `buildSameHouseholdInheritancePayload`) + 증여 통산(`giftHouseholdPriorResidenceMonths(calcGiftHouseholdBasis(asset, scope))`). 판정식 사본을 새로 만들지 않고 엔진 leaf를 그대로 부른다. 차단 문구에 「증여·상속 전 같은 세대 거주 통산 포함」을 적는다 |
| S4 | 고지(Q-2) | 「같은 세대 = 예」인데 증여 전 거주 개월이 미답이면 통산 없이 판정하고, 상한까지 거주했다고 보면 §155⑳ 결론이 바뀔 때만 확인 필요. 기존 반사실 leaf `giftPriorResidenceDecides`(`gift-household-notice.ts:171-182`)에 §155⑳ 판정(`judgeRentalHousingEligibility(...).passed`)을 `verdictOf`로 넘긴다 |
| S5 | 정적 가드 | `__tests__/tax-engine/one-house/table2-residence-leaf-parity.test.ts` 옆에 §155⑳ 요건 호출부 2곳 = leaf, 공제율 인자 = 본인 값 짝을 고정 |

⑤ 입력 칸(증여 세대 사실·증여 전 거주 개월·상속 동거 개월)과 ④·⑫·⑭는 이미 있다(`gift-household-payload.ts:42-49`, `transfer-tax-api-helpers.ts:542`, `lib/api/gift-household-basis-route-map.ts`). 판정 메뉴는 `buildTransferEngineInput`(`app/api/calc/one-house-exemption/route.ts:34`)을 공유하므로 엔진 변경만으로 같은 답이 된다. 판정 메뉴 ⑧은 `mode === "facts"`에서 거주 검증 전에 반환하므로(`:381`) 영향이 없다.

## 4. 범위 밖 (변경 없음)

- **보유기간**(사용자 결정) — `step.ts:188`·`judge.ts:87-90` 증여일·상속개시일 기산 유지.
- **표2 공제율 거주분** — 본인 거주(사전-2025-법규재산-0506 질의2와 같은 구분, `residence-months.ts:82-83`).
- **B 시나리오**(직전거주주택보유주택) — 거주요건은 별도 입력 「사업자등록·임대사업자 등록 이후 거주기간」(`eligibility.ts:323-340`)이라 이 leaf를 읽지 않는다.
- **부담부증여로 취득한 주택** — 결정 (가).
- 증여 당시 별도세대 → 증여 후 합가(2643 子 사안): 기존 입력이 「계속 같은 세대 = 아니오」이면 통산하지 않는다(`giftHouseholdConsolidationStart`) — 해석과 같은 방향.

## 5. 결정 요청

- **Q-1. 통산을 적용했을 때 확인 필요 고지를 낼지** — 권장 **(a) 내지 않는다**: 증여(2643)·상속(3992) 모두 §155⑳ 정면 회신이 있다. 대신 미충족 사유·결과 산식에 통산 개월을 적는다. (b) §154① 쪽처럼 결론을 가를 때 고지.
- **Q-2. 증여 전 거주 개월 미답 고지(S4)** — 권장 **(a) 넣는다**: 「모름 = 불성립 + 결론을 가를 때만 확인 필요」 정책과 같고 기존 leaf를 재사용한다. (b) 넣지 않는다(S4 삭제).

## 6. 검증 계획

1. anchor(엔진): §2 표 4행 + 12억 초과 거주주택에서 공제율 거주분이 본인 값인지(통산 전후 공제율 불변) + 동일세대 상속 + B 시나리오 불변 + 별도세대(`continuousSameHousehold: false`) 불변 + 판정 메뉴 경로(`rental-housing-verdict`)와 계산기 결론 일치.
2. ⑧ anchor: 본인 12 + 증여 전 18 → 통과, 본인 12 + 0 → 차단, 상속 동거 18 → 통과.
3. 정적 가드(S5).
4. 뮤테이션: S1·S2(요건 인자 원복)·S2 공제율 인자를 leaf로 바꾸는 역방향·S3 각 항·S4 게이트.
5. E2E 1건: 증여 주택 + §155⑳ A, 본인 12·증여 전 18개월 → 계산 통과 → 비과세.
6. `npm run check:pre-pr`.

## 7. 구현 결과 (v0.2 — 2026-10-19)

| # | 결과 |
|---|---|
| S1 | `transfer-tax-rental-housing-judge.ts` `judgeRentalHousingEligibility` — `liveYears` = 통산 leaf |
| S2 | `transfer-tax-rental-housing-step.ts` — 요건 인자 `Math.floor(requirementResidenceMonths / 12)`, 공제율 인자 `liveYears`(본인)는 그대로 |
| S3 | ⑧ `rentalResidencePriorHouseholdMonths` — 엔진 leaf(`consolidateResidenceMonths` · `giftHouseholdPriorResidenceMonths`)에 ④와 같은 사실(`buildSameHouseholdInheritancePayload` · `calcGiftHouseholdBasis`)을 넣는다. A·§154⑩ 종전규정 두 분기, 문구에 통산분 표기 |
| 표시(Q-1) | `rentalResidenceConsolidationText` 한 문장 — 세액 경로는 계산 단계 「거주주택 거주기간 — 동일세대 거주 통산」, 전액 비과세 조기반환은 `rentalNoticesForEarlyReturn` 안내(9억 이하는 STEP 2.5를 거치지 않는다). A만 |
| S4 | 넣지 않음(Q-2) |
| S5 | 정적 가드 대신 행위 anchor로 고정 — 요건 인자 원복(M1·M2)·공제율 인자 통산값(M3) 뮤테이션이 모두 KILLED |

**계획과 다른 점**: 9억 이하 전액 비과세는 STEP 1a 조기반환이라 계산 단계가 없어 안내(warnings)로 실었다 · §154⑩ 종전규정(B · 0호) 분기도 같은 `liveYears`를 읽어 함께 통산된다(§154① 원칙 분기라 §154① 통산과 같은 방향) — anchor RC-7·V6-6.

**검증**
- anchor: 엔진 `rh-residence-same-household-consolidation.anchor.test.ts` 7건(RC-1~7) · ⑧ `rental-exception-same-household-residence.anchor.test.ts` 6건(V6-1~6). 15억 시료: 통산 30개월이면 표2 대상, 공제율 16%(보유 4년 16% + 본인 거주 1년 0%) · 총세액 47,245,000 / 본인 30개월 대조 24% · 40,573,500.
- 뮤테이션 13종 전부 KILLED(용도변경 게이트·§154⑩ 분기는 처음 생존 → V6-5·V6-6·RC-7 추가 후 KILLED).
- E2E `transfer-rental-155-20-same-household-residence.spec.ts` 2건 — RS-2는 master 코드에서 실패, 수정 후 통과.
- 기존 §155⑳·판정 메뉴 관련 258파일 3,004건 통과.
