# NH-14 후속 — 첫 자산이 주택이 아닐 때 함께 양도 주택의 세대 사실 (2026-11-06)

> 근거: `docs/reviews/unsold-98-series-review-2026-11.md` US-09 · `docs/reviews/new-housing-99-review-2026-11.md` NH-14 · PR #2957(머지)
> 사용자 결정: 「(나) 입력 칸 열기」 · 후속 범위 「②·③과 위 결함」(F-1 제외)

## 1. 실측 (머지된 master `0e4591eaa`, mock 세율, 첫 자산 독립 나대지 + 함께 양도 주택)

| # | 사실 | 주택 먼저 | 토지 먼저(현재) |
|---|---|---|---|
| ① | 분양권·입주권 「없음」 확인 막다른 길 | — | 해소됨(`ce4b4c9e2`) |
| ② | 명부 행 ⑥ = §98의3 감면주택(주택 수 제외 선언) | 18,628,500 비과세 | 154,286,000 과세 — ④ `specialHouseExclusions: []` |
| ③ | 명부 행 = 일시적 2주택 신규 주택 | 18,628,500 비과세 | 154,286,000 과세 — 컴패니언 카드에 `temporaryTwoHouse`·`houses` 없음, ⑧이 신규 주택 경위를 묻지 않음 |
| 결함 | 「양도 주택 취득 경위」(`HousesListSection.tsx:494`) | — | 토지 카드(`assets[0]`)에 저장 |

## 2. 원인

세대 판정 leaf들은 「양도 주택 = `form.assets[0]`」 규약으로 짜여 있다. #2957은 ⑤ 표시와 ④ 주택 수·명부 양도 행만 세대 기준 자산(`householdFactsAssetOf`)으로 바꿨고,
나머지(명부 행 ⑥ 게이트·일시적 2주택 도출·⑧ 신규 주택 경위)는 첫 자산(토지) 기준이다. ⑭는 별개 주택 컴패니언에 세대 사실을 싣지 않는다
(`bundled-route.ts` — 주택 수·분양권만). G1 역방향 짝 주택만 `asReverseUnitHouse`로 전부 받는다.

## 3. 처방 — 「세대 기준 폼 뷰」

`lib/calc/household-facts-view.ts`(신규)
- `householdFactsFormView(form)` — 함께 양도 주택이 세대 기준 자산이면 **그 주택을 맨 앞으로 돌린 읽기 전용 폼**, 아니면 `form` 그대로.
  leaf들의 「`assets[0]` = 양도 주택」 규약을 그대로 살린다(leaf 수정 0).
- `householdViewOnChange(form, onChange)` — 뷰에서 나온 `assets` patch를 원래 순서로 되돌려 저장한다(⑤ 결함 해소).
- `householdFactsCompanionAssetId(form)` — ④가 본문에 싣는 기준 주택 id(⑫⑭).

| 층 | 바꾸는 것 |
|---|---|
| ④ `transfer-tax-api.ts` | `specialHouseExclusionsPayload(뷰)` · `buildHouseholdSpecialPayload(뷰, 뷰.assets[0])` · 대표 자산 감면은 저장분만, 명부 행 감면(§99의4·§98의9)은 기준 주택 카드(`transfer-tax-api-bundled.ts`) · `householdFactsCompanionAssetId` |
| ⑫ | base-shape `householdFactsCompanionAssetId: z.string().optional()` |
| ⑭ `bundled-route.ts` | 그 id의 컴패니언 카드에 세대 1주택 사실(`HOUSEHOLD_ONE_HOUSE_FACT_KEYS` − 소재지·§154① 단서)을 덮는다 — G1과 같은 leaf |
| ⑧ `transfer-tax-validate-step1.ts` · `transfer-tax-validate-count-exclusion.ts` | 일시적 2주택 섹션·신규 주택 경위·명부 행 ⑥ 검증을 뷰로 |
| ⑤ `Step4.tsx` · `SurchargeJudgmentSection` | 일시적 2주택 도출·③ 섹션·세대 명부(`HouseCountExemptionInputs`)에 뷰 + `householdViewOnChange` |

## 4. 범위 밖

- **F-1** 함께 양도 주택의 거주기간·취득 당시 조정대상지역 — 그 주택 자신의 사실이라 입력 칸 신설이 필요하다.
- **§154① 단서** — 입력 칸이 첫 자산 거주 섹션 안에 있어 뷰로 바꾸면 ⑧ 막다른 길이 된다. F-1과 같은 축으로 남긴다.
- 토지 + 입주권·분양권 컴패니언(F-4), 컴패니언 주택 2채 이상 기준(F-3)은 #2957과 같다.

## 5. anchor (선작성)

`__tests__/calc/nh14-household-facts-followups.anchor.test.ts`
- P-1 ② 토지 먼저 = 주택 먼저(같은 사실 · 같은 세액) · ④ 본문에 행 ⑥ 선언
- P-2 ③ 토지 먼저 = 주택 먼저 · 경위 미답이면 두 순서 모두 ⑧이 묻는다
- P-3 결함 — 뷰 patch가 원래 자산에 저장된다
- 회귀: 주택 먼저 불변 · G1 역방향 anchor 불변 · 토지 카드 세액 불변
