# §155⑳ 장기임대주택 임대기간 계산 — 기산일·3월 이내 공실·상속 합산

- 작성: 2026-11-12 · 상태: **PR-1 구현(Q-1·Q-2·Q-3 결정 반영)** · PR-2(중과배제 날짜 입력 전환) 별도 계획서 예정
- 계기: 교재 이미지 22 「의무임대기간의 계산」 대조 — 기산일·상속 합산·3월 공실 3규칙이 ⑳ 엔진에 없다.
- 범위: ⑳ 임대주택 카드(`RentalUnitPeriodPriceBlock`)의 「실제 임대 기간」 → 엔진 `rentalMonths`. 중과배제 경로는 Q-3.

## 1. 법령 체인 (KoreanLaw MCP 2026-11-12 조회)

| 단계 | 조문 | 원문 요지 |
|---|---|---|
| ⑳ 대상 | 소득세법 시행령 §155⑳ (MST 290841) | 「제167조의3제1항제2호에 따른 주택 … 이하 이 조에서 "장기임대주택"」 |
| 계산 위임 | 소득세법 시행령 §167의3③ | 「제1항제2호의 규정에 의한 장기임대주택의 임대기간의 계산은 「조세특례제한법 시행령」 제97조의 규정을 준용한다. 이 경우 **사업자등록등을 하고 임대주택으로 등록하여 임대하는 날부터 임대를 개시한 것으로 본다**.」 |
| 기산 | 조특령 §97⑤1호 (MST 288915) | 「주택임대기간의 기산일은 주택의 임대를 개시한 날로 할 것」 |
| 상속 | 조특령 §97⑤3호 | 「상속인이 상속으로 인하여 피상속인의 임대주택을 취득하여 임대하는 경우에는 피상속인의 주택임대기간을 상속인의 주택임대기간에 합산할 것」 |
| 공실 위임 | 조특령 §97⑤5호 | 「제1호 또는 제3호의 규정을 적용함에 있어서 재정경제부령이 정하는 기간은 이를 주택임대기간에 산입할 것」 |
| 공실 | **조세특례제한법 시행규칙 §44** (MST 289267) | 「영 제97조제5항제5호에서 "재정경제부령이 정하는 기간"이라 함은 **기존 임차인의 퇴거일부터 다음 임차인의 입주일까지의 기간으로서 3월이내의 기간**을 말한다.」 |

- §97 감면 계열은 같은 체인을 이미 구현했다: `RENTAL_VACANCY_GRACE_MONTHS_97 = 3` (`lib/tax-engine/transfer-reductions/rental-97-shared-helpers.ts:31`, 주석에 조특칙 §44 인용) · 기산일 = 실제 임대일·임대사업자 등록일·세무서 사업자등록일 중 가장 늦은 날 (`lib/calc/rental-97-effective-start.ts:20` `rental97EffectiveStartString`).
- §155⑳ 경로만 이 체인을 쓰지 않는다.
- 국세청 해석(국세법령정보시스템 공개 페이지 — 원문 대조 권장): 부동산거래관리과-511(2012.09.25.)은 거주주택 특례(당시 §155⑲, 현 ⑳)에서, 부동산거래관리과-371(2012.07.16.)은 중과배제에서 「사업자등록과 임대사업자등록을 하고 임대주택으로 등록하여 임대하는 날부터 임대를 개시한 것으로 보아 계산」 — 기산일 규칙이 ⑳에 걸린다는 것을 확인. 371 본문의 참고 해석(안건번호 미표시)도 실제 임대개시일(2000년 6월)부터가 아니라 두 등록 후 임대하는 날부터 센다고 답했다.

## 2. 현행 (실측)

- 입력 모드 2개: `direct`(합산 개월 직접 입력 — **기본값**, `lib/stores/calc-wizard-asset-rental-period.ts:22`) / `interval`(구간 여러 개).
- `deriveRentalMonths` (`calc-wizard-asset-rental-period.ts:66`) → interval이면 `sumRentalMonths`가 구간별 `diffMonthsClamped`를 **단순 합산**. 호출처는 ④ `lib/calc/transfer-tax-api-rental-housing.ts:87` 하나.
- ⑧ `lib/calc/transfer-tax-validate-rental-exception.ts:158-179`: 두 등록일 필수 + 구간 역전·겹침만 차단.
- 엔진: `rentalYears = rentalMonths / 12` (`eligibility.ts:483`) → `u.rentalYears < requiredYears`면 `RENTAL_PERIOD_SHORT` (`lib/tax-engine/rental-article/check.ts:306`). ㉓1호 1/2 판정도 `rentalMonths`를 읽는다(`eligibility.ts:581`).

throwaway probe (2026-11-12, `deriveRentalMonths`):

| # | 입력 (interval) | 현행 | 법문대로 | 판정(가목 5년=60) |
|---|---|---|---|---|
| P1 | 2015-01-01~2018-01-01 + 2018-03-01~2020-02-01 (공백 2개월) | **59** | 61 (조특칙 §44 산입) | 현행 미충족 ↔ 법문 충족 |
| P2 | 2014-01-01~2019-01-01, 두 등록일 2016-01-01 | **60** | 36 (등록일부터 기산) | 현행 충족 ↔ 법문 미충족 |
| P3 | direct 59 | 59 | 59 (사용자가 계산한 값) | 변화 없음 |

## 3. 설계안

### A. interval 모드 계산 변경 (`calc-wizard-asset-rental-period.ts` 단일 소스)

1. **기산일 자르기**: 각 구간 시작을 `max(구간 시작, 세무서 사업자등록일, 지자체 등록일)`로 자른다. 잘린 뒤 종료 ≤ 시작이면 0.
2. **3월 이내 공백 산입**: 시작일순 정렬 후 직전 구간 종료일 → 다음 구간 시작일 공백이 달력 3개월 이내(`addMonths(종료, 3) ≥ 다음 시작` — 「이내」 경계 포함)면 두 구간을 이어 붙여 한 구간으로 센다. 3개월을 넘으면 공백 전체를 뺀다(§97 헬퍼 `calculateEffectiveRentalDays`와 같은 기준).
3. 개월 수는 이어 붙인 구간마다 `diffMonthsClamped` 합산(현행 method 유지).
4. 순서: 자르기 → 이어 붙이기. 등록 전 구간과 등록 후 구간 사이 공백은 자른 뒤 기준으로 판단.

- 시그니처: `deriveRentalMonths(unit)`가 이미 unit을 받으므로 `businessRegistrationDate`·`rentalRegistrationDate`를 같이 읽는다. ④ 호출처 변경 없음.
- 엔진 input·result 불변 → 14지점 중 ⑨~⑭ 해당 없음. 직접 API(`rentalMonths` 정수)도 불변.
- ⑤ UI: interval 모드에 계산 결과 「인정 임대기간 N개월(등록일 이전 제외 · 3개월 이내 공실 포함)」 표시 — 사용자가 입력한 구간과 엔진 값이 달라지는 이유를 보여 준다.
- direct 모드(화면 없음 — 옛 기록·AI 필드 경로): 계산 없음. AI 필드 카탈로그(`lib/one-house-ai/field-catalog-asset.ts`) `rentalMonths` hint에 세 규칙을 적는다.

### B. 상속 합산 — Q-2

자르기(A1)를 상속인 등록일로 하면 피상속인 임대 구간이 전부 잘린다. 그래서 호 카드에 「상속받아 계속 임대하는 주택」 토글(`isInheritedRental`)과 「피상속인 임대기간(개월)」 칸(`decedentRentalMonths`)을 두고, `deriveRentalMonths`가 자르지 않고 더한다. 두 필드는 폼(①②③)·④(`deriveRentalMonths` 경유)·⑤·⑧(토글 ON + 미입력 차단)·AI 필드 카탈로그에만 있다. 엔진 input·Zod·Route는 그대로(`rentalMonths` 정수).

### C. 중과배제 경로 — Q-3 결정에 따름

`calcRentalPeriodYears` (`lib/tax-engine/multi-house-surcharge-count.ts:200`)는 `rentalPeriodYears`(직접 입력, UI `SellingHouseLongTermRentalSection.tsx:115`) 또는 `rentalEndDate − rentalStartDate`를 쓴다. 기산일 자르기·공실·상속 규칙이 없다.

## 4. Q-레지스터 (사용자 결정)

| # | 질문 | 결정 (2026-11-12 사용자) |
|---|---|---|
| Q-1 | 기산일 자르기에 쓸 지자체 날짜 | **(a) 기존 「지자체 임대사업자등록신청일」 칸 그대로** — 칸 추가 없음. V-3은 열린 채로 둔다 |
| Q-2 | 상속 임대주택 | **(a) 직접 입력 안내만** — 상속 건은 「합산 개월 직접 입력」으로 피상속인 기간을 더해 넣으라고 안내. 상태 필드 추가 없음 |
| Q-3 | 중과배제 경로 | **(b) 날짜 입력으로 전환** — 별도 계획서·PR(PR-2). 실측: 화면(`SellingHouseLongTermRentalSection.tsx:115`)·Zod(`lib/api/transfer-tax-schema-sub.ts:264`)가 `rentalPeriodYears` 숫자만 받아 엔진 `calcRentalPeriodYears`의 시작·종료일 경로는 제품에서 도달하지 않는다. 그래서 엔진만 자르는 안은 기각 |

PR 나누기: **PR-1** = §3 A + direct·상속 안내(이 계획서) · **PR-2** = 중과배제 경로 날짜 입력 전환(별도 계획서, 14지점).

## 5. V-레지스터 (착수 전 확인)

| # | 항목 | 상태 |
|---|---|---|
| V-1 | 「3월이내」를 달력 3개월로 재는 것 | 🟡 해석례 미확인 — §97 헬퍼가 같은 기준(`rental-97-shared-helpers.ts:69-70` 주석). 착수 전 국세청 해석 1회 검색 |
| V-2 | 조특령 §97⑤4호(5호 미만 기간 제외)를 §167의3③이 준용하는가 | 🟡 확인 필요 — §167의3 장기임대는 1호·2호 요건이라 4호를 그대로 쓰면 의무 없는 차감이 생긴다. **적용하지 않는다**(근거 없는 불리 적용 금지) |
| V-3 | 「임대주택으로 등록」 시점 = 등록신청일인가 등록일인가 | 🟡 확인 필요 — 2026-11-12 「기산일」 해석 8건 검색: 511·647·371 모두 「등록을 하고 … 임대하는 날」까지만 말하고 신청일·등록일을 가르지 않는다. 정면 해석 미확보 |
| V-4 | interval 모드 화면에 합계 표시가 이미 있는지(`PeriodRangeEditor`) | ✅ 있다 — 입력 구간 단순 합(`PeriodRangeEditor.tsx:58`). 공용 편집기라 그대로 두고, 그 아래 「의무임대기간 판정에 쓰는 임대기간」 줄을 따로 그린다. ⑳ 카드에는 direct 입력 화면이 없다(direct는 옛 기록·AI 필드 경로) — 그래서 Q-2를 「피상속인 개월 칸」으로 다시 정했다 |
| V-5 | ㉓1호 「민특법 §43 임대의무기간의 1/2 이상 임대」도 같은 `rentalMonths`를 읽었다(`eligibility.ts:581`) | ✅ 해소(2026-11-12) — 민특령 §34①2호·서면-2021-부동산-7820·서면-2022-부동산-4280: 1/2 기산일은 지자체 임대사업자 등록일(그 뒤 임대 개시면 실제 임대개시일). 실측: 지자체 2018-01-01·세무서 2020-01-01·말소 2022-03-01 → 26개월(㉓ 불성립) ↔ 50개월(성립). 엔진 `halfDutyRentalMonths`(지자체 등록일로만 자름 · `deriveHalfDutyRentalMonths`) 신설, 미제공이면 `rentalMonths`. 3개월 공실·피상속인 개월은 ⑳과 같게 유지 — 2026-11-12 조사: 공실은 해석례 없음(자진말소 해석 29건·국토부 16건), 상속은 포괄양수 해석 서면-2020-법규재산-5310(전 임대사업자 등록일부터) 유추뿐 → 계산 유지 + 해당할 때만 말소 블록에 확인 필요 고지(사용자 결정) · 말소일 이후 구간을 잘라내지 않는 것은 확인 필요 |

## 6. Pre-Do anchor (`__tests__/lib/stores/rental-period-months.test.ts`에 추가)

| ID | 입력 | 기대 |
|---|---|---|
| RP-1 | P1 (공백 2개월) | 61 |
| RP-2 | 공백 정확히 3개월 (2018-01-01 → 2018-04-01) | 공백 산입 |
| RP-3 | 공백 3개월 + 1일 | 공백 제외 |
| RP-4 | P2 (등록일 2016-01-01) | 36 |
| RP-5 | 구간 전체가 등록일 전 | 0 |
| RP-6 | direct 59 | 59 (불변) |
| RP-7 | 기존 「비연속 2구간(공백 1년) = 60」 | 60 (불변 — 기존 단언 유지) |

+ API 경유 anchor 1건: ④ `transfer-tax-api-rental-housing`이 P1 unit에서 `rentalMonths: 61`을 싣는다.

## 7. 작업 순서·시간

1. V-1·V-3 해석례 검색 → 결과로 Q-1 확정 (20분)
2. RP-1~7 anchor 먼저 작성·실패 확인 (20분)
3. A1~A4 구현 + ⑤ 인정 개월 표시 + direct hint (1시간)
4. Q-2·Q-3 선택분 hint (20분)
5. 게이트(dark·font·tone) + typecheck + `npx vitest run __tests__/lib/stores/ __tests__/tax-engine/rental-housing-exception/ __tests__/calc/` (20분)

합계 약 2시간 20분. 브라우저 확인은 Playwright로 interval 2구간 입력 → 인정 개월 표시·판정 확인.
