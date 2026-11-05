# 피상속인 취득일 후속 3건 — 일반건물 안내 · 건물만 상속(D2) 안내 · 날짜 순서 오류의 칸 이동

> **출처**: `inherit-decedent-date-early-return.plan.md` §5.5 「남긴 것」·§5.3(#2906).
> **검증 깊이**: L1 — 안내 문구와 ⑧ 오류의 칸 키만 바뀐다. ⑧ 통과·차단 여부, ⑫, 엔진, 세액은 바뀌지 않는다.

## 0. 결론

| # | 항목 | 실측 결과 | 권장 |
|---|---|---|---|
| 1 | 일반건물 피상속인 취득일 안내·⑧ 문구가 「단기보유 통산용 (소득세법 §95④·§104②1호)」 | **인용이 틀렸다.** §95④ 본문은 장기보유 기간을 상속개시일부터 센다. 피상속인 취득일은 단서의 가업상속 비율분에만 쓰는데, 일반건물에서는 가업상속 입력 자체가 막혀 있다(`transfer-fb-gate.ts`). #2906이 넣은 공용 안내(§95④ 단서 포함)도 일반건물 토지 카드에 그대로 뜬다 | Q-1 a |
| 2 | 건물만 상속(D2) 「건물 피상속인 취득일」 안내가 §104②1호뿐 | **빠진 쓰임 1개.** 엔진이 수용 감면(조특법 §77⑨)에 이 날짜를 쓴다(엔진 실측). D2에서는 가업상속이 막혀 있고 토지는 매매라, 비사업용 토지 쪽은 해당이 없다 | Q-2 a |
| 3 | 날짜 순서 오류를 누르면 칸으로 이동하는가 | **이동하지 않는다.** 오류 4종에 칸 키가 없어, 누르면 자산 카드 맨 위로만 스크롤되고 커서는 들어가지 않는다. 칸은 보이므로 막다른 길은 아니다 | Q-3 a |

## 1. 실측

### 1.1 일반건물 — 피상속인 취득일이 장기보유공제에 쓰이는가 (route probe · 세율 mock)

분리 ON · 토지 매매 2008 · 건물 상속 · 양도 2024-03-01 (`transfer-gb-building-decedent-date-d3.anchor.test.ts` 픽스처).

| 건물 상속개시일 | 건물 피상속인 취득일 | 결정세액 |
|---|---|---|
| 2015-01-01 (9년) | 1990-01-01 | 78,260,600 |
| 2015-01-01 (9년) | 2014-12-31 | 78,260,600 |
| 2023-06-01 (1년 미만) | 2000-01-01 | 94,061,000 |
| 2023-06-01 (1년 미만) | 2023-01-01 | 103,444,000 |

- 9년 보유면 피상속인 취득일을 24년 앞당겨도 세액이 같다. 장기보유공제는 상속개시일 기준이다(§95④ 본문).
- 1년 미만이면 세율이 바뀐다(§104②1호).
- 가업상속 입력: `allowsFamilyBusinessInheritance`가 일반건물(`assetKind === "general_building"`)과 D2(`effectiveBuildingCauseMix`)에서 `false`다. 일반건물에서 §95④ 단서가 쓰일 길이 없다.
- 일반건물의 수용 감면(조특법 §77⑨)에 건물 피상속인 취득일이 쓰이는지는 **재지 않았다(확인 필요 · V-1)**. 그래서 일반건물 안내에는 넣지 않는다.

### 1.2 D2 — 수용 감면에 건물 피상속인 취득일이 쓰이는가 (엔진 직접 · 세율 mock)

토지 매매 2010 · 건물 상속개시 2024-01-10 · 수용 · 사업인정고시 2025-06-01 · 양도 2026-06-30.

| 건물 피상속인 취득일 | 감면액 | 결정세액 |
|---|---|---|
| 비움 | 12,271,222 (토지분만) | 118,788,778 |
| 2000-01-01 | 19,659,000 | 111,401,000 |
| 2023-12-01 (고시일 소급 2년 안) | 12,271,222 | 118,788,778 |

- 건물분이 §77① 「2년 이전 취득」을 피상속인 취득일로 판정받는다(`public-expropriation-reduction.ts` 건물 파트 `expropriationAcquisitionDate`).
- 화면→④→⑫ 경로로는 재지 않았다. 엔진 입력에서 확인했다.

### 1.3 날짜 순서 오류의 칸 키 (vitest probe `collectStepIssues`) · 클릭 결과 (headless Playwright)

| ID | 오류 | ⑧ 칸 키 | 클릭 후 커서가 칸 안에 | 칸 보임 |
|---|---|---|---|---|
| B1 | 「취득일은 양도일보다 이전이어야 합니다.」 | 없음 | 아니오(카드 맨 위로 스크롤 · 포커스는 누른 버튼에 남음) | 예 |
| B2 | 「피상속인 취득일은 상속개시일보다 이전이어야 합니다.」 | 없음 | 아니오 | 예 |
| B3 | 「증여자 취득일은 증여일보다 이전이어야 합니다.」 | `donorAcquisitionDate` | 해당 없음 — 같은 문구를 `gift-household-payload.ts`가 칸 키와 함께 낸다 | — |
| B4 | 「동일세대 거주·보유 개시일은 상속개시일(취득일)보다 앞서야 합니다. …」 | 없음 | 아니오 | 예 |
| B5 | 「동일세대 거주·보유 개시일이 피상속인 취득일보다 빠릅니다. …」 | 없음 | 아니오 | 예 |

원인: `getAssetDateOrderError`(`lib/calc/transfer-tax-validate-asset.ts`)가 문자열만 돌려준다. `fieldError`로 감싸지 않아 수집기에 칸 키가 남지 않는다(`transfer-tax-validate-field.ts`). 칸 키가 없으면 `jumpToIssue`가 자산 카드 맨 위로 물러난다(`TransferTaxCalculator.tsx`). 같은 함수가 카드 안의 즉시 경고도 만드는데, 수집기 밖이라 `fieldError`로 감싸도 문자열은 같다.

이동할 칸(`data-field`)은 이미 있다:
- `acquisitionDate`: `CompanionAcqDateSection` · 상속 블록 · 일반건물 건물 카드
- `decedentAcquisitionDate`: 상속 블록 · D2 블록
- `decedentCohabitationHoldingStartDate`: `InheritedCohabitationCard`

칸을 찾지 못하는 화면에서는 지금처럼 카드 맨 위로 물러난다(`jumpToIssue` 후퇴) — 나빠지는 경우는 없다.

## 2. 결정 Q-n

| ID | 질문 | 선택지 | 권장 |
|---|---|---|---|
| Q-1 | 일반건물 인용 정정 범위 | **a** ① 건물 피상속인 취득일 안내 2문구(`GeneralBuildingAcquisitionCards.tsx`) ② ⑧ 2문구(`transfer-tax-validate-gb-required.ts`)를 §104②1호로 고친다. ③ 공용 안내(`CompanionAcqInheritanceBlock`)의 §95④ 단서 문장은 가업상속 입력이 열린 자산(`allowsFamilyBusinessInheritance`)에서만 보인다 · **b** ①②만 | **a** — ③을 남기면 일반건물 토지 카드가 계속 「가업상속 … 기산일로도 씁니다」라고 말한다. 그 화면에는 가업상속 입력이 없다 |
| Q-2 | D2 안내 | **a** 「건물 피상속인 취득일」 안내에 수용 감면(조특법 §77⑨)을 더한다 · **b** 그대로 둔다 | **a** — §1.2 엔진 실측 |
| Q-3 | 날짜 순서 오류 칸 이동 범위 | **a** B1·B2·B4·B5 네 오류에 칸 키를 붙인다 · **b** 요청한 B2만 · **c** 그대로(카드 맨 위 이동) | **a** — 같은 함수의 같은 결함이다. B2만 고치면 형제 3건이 남는다 |

예상 시간: Q-1 a 약 40분 · Q-2 a 약 15분 · Q-3 a 약 40분(E2E 포함).

## 3. 미검증 V-n

| ID | 항목 | 상태 |
|---|---|---|
| V-1 | 일반건물의 수용 감면(조특법 §77⑨)이 건물·토지 피상속인 취득일로 판정되는가 | 확인 필요 — 재면 안내에 더할지 판단한다(이번 범위 밖) |
| V-2 | D2 수용 감면을 화면→④→⑫ 경로로 재기 | 엔진 입력에서만 확인 |

## 4. 구현 계획(권장안 기준)

1. anchor 먼저(수정 전 실패 확인):
   - Q-1·Q-2: 컴포넌트 렌더 테스트 — 일반건물 토지·건물 카드에 §95④가 없고 §104②1호가 있다 · 주택 상속은 §95④ 단서 문장 유지 · D2 칸 안내에 §77⑨. ⑧ 문구 단언.
   - Q-3: `collectStepIssues` 칸 키 단언(B1·B2·B4·B5) + E2E — 오류 클릭 후 커서가 그 칸 안.
2. 구현 → 뮤테이션(칸 키 1개 제거 · §95④ 조건 제거) → 회귀(`__tests__/calc` · `components` · `lib`) → tsc·eslint → Playwright.
3. 결과를 이 문서 §5에 적는다.

## 5. 구현 결과 (2026-11-05 · 결정: Q-1 a · Q-2 a · Q-3 a)

### 5.1 변경

| 항목 | 파일 | 내용 |
|---|---|---|
| Q-1 ① | `components/calc/transfer/GeneralBuildingAcquisitionCards.tsx` | 「건물 피상속인 취득일」 안내 2문구: 「단기보유 통산용 (소득세법 §95④·§104②1호)」 → 「세율의 보유기간 기산일입니다 (소득세법 §104②1호)」 |
| Q-1 ② | `lib/calc/transfer-tax-validate-gb-required.ts` | ⑧ 문구 2개(토지·건물)를 같은 인용으로 |
| Q-1 ③ | `components/calc/transfer/CompanionAcqInheritanceBlock.tsx` | 가업상속 문장을 `allowsFamilyBusinessInheritance(asset)`일 때만 — 일반건물 토지 카드에서 빠진다 |
| Q-2 | `components/calc/transfer/BuildingCauseMixBlock.tsx` | D2 안내에 「수용으로 양도하면 감면의 「2년 이전 취득」도 이 날로 판정합니다 (「조세특례제한법」 제77조 제9항)」 |
| Q-3 | `lib/calc/transfer-tax-validate-asset.ts` | `getAssetDateOrderIssue`(메시지 + 칸 키) 신설 · 단계 차단은 `fieldError`로 기록 · 카드 인라인 경고용 `getAssetDateOrderError`는 그 메시지만(호출부 불변) |

⑧ 통과·차단 여부 · ⑫ · 엔진 · 세액 불변.

### 5.2 테스트

- anchor `__tests__/calc/decedent-date-hint-followups.anchor.test.tsx` 11건 — 수정 전 9건 실패(단언 실패만) → 수정 후 통과.
- #2906 anchor `inherit-decedent-date-uses-hint.test.tsx`의 일반건물 행은 의도된 반전 → 목록에서 빼고(주택·토지 유지), 일반건물 쪽은 새 anchor Q-1 ③이 지킨다.
- 입력칸 이동 레지스트리 `e2e/_helpers/validation-field-jump-cases.ts`에 4건(B1·B2·B4·B5) — vitest `transfer-validation-field-jump-cases.test.ts` 707건 통과 · E2E `transfer-validation-field-jump.spec.ts` 새 4건 포함 8건 통과(오류 클릭 → 커서가 그 칸 안).
- 뮤테이션 5건 모두 잡힘: M1 가업상속 문장 항상 표시(1 실패) · M2 항상 숨김(4) · M3 `fieldError` 제거(4) · M4 동일세대 칸 키 오기(2) · M5 피상속인 칸 키 오기(1).
- 회귀: `__tests__/calc` · `components` · `lib` 1,769파일 21,215건 통과 · tsc 0 · eslint 0.
- 화면(headless Playwright · 사람이 직접 한 확인 아님): 일반건물 토지 상속 카드 안내에 §95④ 문장 없음 · 일반건물 건물 칸 안내·⑧ 문구 §104②1호 · D2 안내에 §77⑨ · D2 피상속인 취득일 오류 클릭 → 그 칸 · 375px 가로 스크롤 없음.

### 5.3 남은 것

- V-1(일반건물 §77⑨) · V-2(D2 §77⑨ 화면 경로) — §3 그대로.
