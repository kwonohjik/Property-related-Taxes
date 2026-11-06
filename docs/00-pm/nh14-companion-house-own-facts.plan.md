# NH-14 후속 2 — 함께 양도 주택 자신의 사실(F-1 거주기간·취득 당시 조정대상지역 + §154① 단서) (2026-11-06)

> 근거: `docs/00-pm/nh14-companion-household-followups.plan.md` §4 「범위 밖」(F-1 · §154① 단서) · PR #2957 · #2967
> 사용자 지시: 「남아 있는 범위 밖 항목 — 수정 계획서 작성하고 수정작업 해」
> 범위: 첫 자산이 토지·건물이고 함께 양도 주택이 세대 기준 자산(`householdFactsAssetOf`)인 묶음. F-3(컴패니언 주택 2채 이상)·F-4(토지 + 입주권·분양권)는 종전과 같이 범위 밖.

## 1. 실측 (수정 전 · mock 세율 · 첫 자산 독립 나대지 + 함께 양도 주택 · 1세대 1주택 · 양도 2026-02-16)

| # | 사실 | 주택 먼저 | 토지 먼저(수정 전) | 원인 |
|---|---|---|---|---|
| F-1a | 강남(대치동) 2018-01-02 취득 · 거주 0 | 169,246,000 과세(취득 당시 조정 → 거주 2년 요건 미충족) | 18,628,500 비과세 | ④ `wasRegulatedAtAcquisition`을 첫 자산(토지) 주소로 판정 → false |
| F-1b | 같은 주택 · 거주 36개월 | 비과세 | 컴패니언 카드 `residencePeriodMonths` 미전송(0) | 거주 입력 칸이 ② 섹션(첫 자산 기준)에만 있다 |
| 단서 | §154① 단서(수용 등 — 보유·거주 요건 면제) | 단서 적용 | ⑭가 단서 키를 컴패니언에 덮지 않음 · ⑤ 입력 칸 없음 | `HOUSEHOLD_FACTS_COMPANION_EXCLUDED_KEYS`에 단서 키 포함 |
| 대조 | 양도일 조정대상지역 | 316,382,000 | 316,382,000 | 엔진이 컴패니언 자신의 `regionCode`로 판정 — 문제 없음 |

## 2. 원인

#2967의 「세대 기준 폼 뷰」(`householdFactsFormView`)는 세대 축 판정에만 쓰였고, ② 1세대1주택 비과세 판정 섹션·④ 취득 당시 조정·§154① 단서·⑧ 거주 검증은
첫 자산(`form.assets[0]`) 기준으로 남았다. 첫 자산이 토지면 ② 섹션이 열리지 않아 함께 양도 주택의 거주·단서를 입력할 곳이 없고,
④는 토지 주소로 취득 당시 조정을 판정해 그 결과를 컴패니언이 상속받는다(엔진 helpers — top-level `wasRegulatedAtAcquisition`).

## 3. 처방 — ② 섹션 축 전체를 세대 기준 폼 뷰로

| 층 | 바꾸는 것 |
|---|---|
| ④ `transfer-tax-api.ts` | `wasRegulatedAtAcquisition` = `calcEffectiveWasRegulatedAtAcquisition(뷰.assets[0], …)` · `buildExemptionProvisoPayload(뷰, calcProvisoMode(뷰))` · `buildFinalHouseRestartPayload(뷰, …)` |
| ④ `transfer-tax-api-bundled.ts` | 기준 주택 컴패니언 카드에 `residencePeriodMonths` = `clampResidenceToHousingPeriod(그 카드, …)` (주 자산과 같은 leaf) |
| ⑭ `bundled-reverse-appurtenant.ts` | 제외 키를 소재지(`regionCode`·`regionInDesignatedDistrict`)만으로 줄여 §154① 단서를 기준 주택 컴패니언에 덮는다 |
| ⑧ `transfer-tax-validate-step1.ts` | 단서 게이트를 ④와 같은 `calcProvisoMode(뷰)`로 · 거주 검증·양도 주택 경위·부득이 사유 행을 뷰 기준으로 |
| ⑤ `Step4.tsx` | ② 섹션을 `isOneHouseExemptionAsset(householdKind)`로 열고, 섹션 안 폼·onChange·기준 자산을 뷰(`householdView`·`householdOnChange`·`exemptPrimary`)로 — 입력은 원래 주택 카드에 저장된다 |

첫 자산이 기준 자산이면 뷰 = `form`(같은 객체)이라 주택 먼저 경로는 불변이다.

## 4. 기존 테스트 변경 (의도된 변경 — 기대값은 같은 입력의 「주택 먼저」 계산과 대조)

| 테스트 | 변경 | 근거 |
|---|---|---|
| `nh14-household-facts-step4.ui.test.tsx` | 「② 섹션 열리지 않음」 → 「함께 양도 주택 기준으로 열림」 | 이번 결정 |
| `separate-land-date-required.g2.anchor.test.ts` | 138,270,000 → 39,243,499 | 주택 먼저 39,243,499 (종전 거주 120개월 미전송) |
| `dec17-housing-same-day-part-mode-within-limit.anchor.test.ts` | 138,270,000 → 39,243,499 · 117,716,592 → 34,247,880 | 주택 먼저 실측 동일 |
| `transfer.route.companion-mixed-use-one-house-land-exemption.anchor.test.ts` | 컴패니언 겸용주택에 거주 직접 입력 0개월 추가(기대 세액 불변) | ⑧이 이제 그 카드의 거주를 묻는다 · 종전 엔진값(0)과 같은 사실 |
| `redev-successor-gift-household-0691-ui.anchor.test.tsx` | 소스 가드 `primary` → `exemptPrimary` | ② 섹션 기준 자산 이름 |

## 5. anchor

`__tests__/calc/nh14-companion-house-own-facts.anchor.test.ts`
- A-1 강남 2018 · 거주 0 → 토지 먼저 = 주택 먼저(과세) · 본문 `wasRegulatedAtAcquisition: true` · 컴패니언 거주 0
- A-2 거주 36 → 두 순서 모두 비과세 · 같은 세액 · 컴패니언 거주 36
- B-1 §154① 단서(수용) → 두 순서 같은 결과 · 단서 없는 경우와 다른 결과

`__tests__/calc/nh14-household-facts-step4.ui.test.tsx` — 토지 먼저 ② 섹션 표시 · 거주 입력이 주택 카드(`assets[1]`)에 저장 · 토지+토지 짝은 섹션 없음.

뮤테이션(각 수정 지점을 되돌려 anchor가 잡는지): ④ wasRegulated · ④ 컴패니언 거주 · ⑭ 단서 제외 키 · ⑤ 섹션 게이트 — 4건 모두 실패로 잡힘.

## 6. 미수행

- 브라우저 수동 확인(폼 → 계산 → 결과, Network 본문) — 미수행.
