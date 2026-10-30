# API 겸용주택(`mixed-use-house`) 거주 상한 갭 (측정 + 계획)

> 출처: `land-only-o11-o13-o14-o16-o17-measure.plan.md` O-14 §범위 2 — «⑧은 겸용에도 걸지만 API의 겸용은 `propertyType: "mixed-use-house"`라 이번 범위 밖 … **남은 갭**: API 겸용주택 직접 호출은 거주 상한이 없다».
> 규칙: 추정 금지 — 아래 수치는 throwaway probe 실측이다(probe는 커밋하지 않는다).

## 0. 결론

| 질문 | 결과 |
|---|---|
| 갭이 실제로 세액을 바꾸나 | **그렇다.** 겸용 API에 보유 3년·거주 10년을 넣으면 400 없이 장특 거주분 12% → 40%로 계산돼 총세액이 186,112,055 → 150,314,609(−35,797,446)로 줄어든다(V-2). |
| UI 경로는 | 막는다(⑧ 1단계 «거주기간: 120개월이 취득일(2021-06-01)부터 양도일까지의 36개월을 넘습니다», V-3). **⑧은 막고 ⑫는 통과** — 화면으로는 도달할 수 없고 API 직접 호출만 도달한다. |
| 어디를 고치나 | `residenceMonthsOverflowIssue`(`lib/api/transfer-tax-schema-household-refines.ts`)의 `propertyType !== "housing"` 게이트가 겸용을 뺀다. 겸용의 거주는 `residencePeriodMonths`가 아니라 `mixedUse.residencePeriodYears`(= `floor(개월 / 12)` — `transfer-tax-api-mixed-use.ts:272`)다(V-1). |
| 시험 적용 | 겸용 연수 × 12가 보유 개월을 넘을 때만 400 → 전체 스위트 44,349건 중 **실패 1건**(V-5, 비현실 시료). 그 밖은 영향 없음. |
| 새로 발견 | **컴패니언 주택(`companionAssets[].residencePeriodMonths`)도 상한이 없다**(V-6, 5년 보유·20년 거주 → 장특 144,000,000 → 216,000,000 · 총세액 87,373,000 → 50,589,000). 이 계획서 범위 밖 — O-24로 기록. |

## 1. 측정 (V 레지스터)

시료(겸용): 주택 비중 큰 겸용 1세대 1주택 · 취득 2021-06-01 · 양도 2024-06-01(보유 36개월) · 양도가 20억 · 서울 · 용도지역 일반주거(`mixed-use-high-value-share-denominator.anchor.test.ts` MIXED 시료에서 취득일만 2021-06-01로).

| ID | 측정 | 결과 |
|---|---|---|
| V-1 | 겸용 API가 읽는 거주 | 최상위 `residencePeriodMonths`는 **무시**(36 ↔ 120 같은 세액). 읽는 값은 `mixedUse.residencePeriodYears`(및 표2 통산 `table2ResidencePeriodYears`). 폼 → 본문 변환은 `deriveResidencePeriodMonths` → `floor(개월 / 12)` |
| V-2 | `mixedUse.residencePeriodYears` 3 / 10 / 20 (보유 3년) | 3 → 거주분 12% · 총세액 186,112,055 / 10 → **40%** · 150,314,609 / 20 → 40% · 150,314,609. 전부 HTTP 200. 법 표2: 거주 3년 이상 4년 미만 12%, 10년 이상 40% (소법 §95② 표2 — 조문 본문 확인) |
| V-3 | ⑧ (`collectStepIssues` 0~4단계) | 직접 입력 36개월 → 거주 관련 오류 없음 · 37개월 → «37개월이 … 36개월을 넘습니다» · 120 · 240 → 같은 오류. ⑧의 상한은 겸용에도 걸린다(`isOneHouseExemptionAsset("housing")`) |
| V-4 | 시험 적용 — 겸용 연수 × 12 > 보유 개월이면 400 | 3(36) 통과 · **37개월(연수 3)도 통과**(연수 3 × 12 = 36 ≤ 36 — ⑧보다 느슨, ⑧ 통과 ⇒ ⑫ 통과 방향 유지) · 연수 10 · 20 → **400** |
| V-5 | 시험 적용 전체 스위트(44,671) | **1건 실패** — `transfer.route.mixed-use-89-2-e7.anchor.test.ts` «2022-03-01 양도 · 입주권 3년 이내 → 구 §167의11①1호 배제». 시료 `mixedUse.residencePeriodYears: 5`(60개월)인데 취득 2018-06-01 · 양도 2022-03-01 = 보유 45개월 — **비현실 시료**(합법 통산 후보 없음: 매매, 증여자·세대 통산 칸 없음). 같은 테스트의 주택 변형은 이미 `residencePeriodMonths: 45`로 보정돼 있다 |
| V-6 | 컴패니언 주택 거주 개월 (reverse 시료: 부수토지 주 자산 + 컴패니언 주택 h1, 취득 2021-06-01 · 양도 2026-06-15) | 60 → 총세액 87,373,000 (h1 장특 144,000,000) · 61 → 같음 · **240 → 50,589,000 (h1 장특 216,000,000)**, 전부 200 — 상한 없음. 컴패니언 겸용의 같은 입력은 **미측정(확인 필요)** |

## 2. 결정 요청 (Q 레지스터)

| ID | 질문 | 선택지 | 권고 |
|---|---|---|---|
| **Q-1** | 겸용에 ⑫ 거주 상한을 둘까 | **a** `mixedUse.residencePeriodYears × 12`가 «가능한 가장 이른 보유 기산일(취득일 · 겸용 토지·건물 취득일 · 통산 후보)~양도일» 개월을 넘으면 400 — 기존 `residenceMonthsOverflowIssue`를 겸용까지 넓힘(필드 경로 `mixedUse.residencePeriodYears`, 같은 leaf) · **b** 기록만 | **a** — 세액이 침묵으로 −3,579만 원 바뀌는 자리이고, ⑧이 이미 막는 값이라 화면 경로에 막다른 길이 생기지 않는다. 연수 하한(`연수 × 12`)으로 비교해 ⑧ 통과 ⇒ ⑫ 통과를 지킨다. 통산 거주(`table2ResidencePeriodYears`)는 합법 통산이 있어 막지 않는다 |
| **Q-2** | 실패 1건(V-5) 처리 | **a** 시료를 현실화: `residencePeriodYears: 5 → 3`(36 ≤ 45개월)으로 바꾸고 기대 세액(195,217,632 등)은 **독립 산식으로 재도출**해 갱신 · **b** 시료 취득일을 앞당겨 거주 5년이 가능하게 | **a** — 이 테스트의 주제는 §89②/§167의11 중과 배제이고 거주분이 아니다. 단 값이 바뀌는 만큼 새 기대값은 장특 표2(보유 3년 12% + 거주 3년 12%)로 독립 도출한다 |
| **Q-3** | 컴패니언 주택 거주 상한(V-6, O-24) | **a** 이번에는 기록만, 별건으로 · **b** 이 PR에 포함 | **a** — 컴패니언은 입력 경로(⑧ 컴패니언 검증 · ④ 변환)가 달라 먼저 «⑧이 막는가»부터 측정해야 한다. 범위를 섞지 않는다 |

## 3. 구현 계획 (Q-1 a · Q-2 a · Q-3 a 선택 시)

1. 테스트 먼저 — 신규 `__tests__/api/transfer.route.mixed-use-residence-cap.anchor.test.ts`: 겸용 연수 3 통과 · 연수 3 + 직접 37개월 상당(⑧은 막고 ⑫는 통과, 연수 하한 규칙) · 연수 10 · 20 → 400 `mixedUse.residencePeriodYears` · 통산 후보(증여자 취득일 등)가 있으면 통과 · `isOneHousehold: false`면 판정 안 함 · 주택 변형과 같은 leaf 문구. 단위 `residenceMonthsOverflowIssue` 겸용 케이스(기존 o14 anchor에 추가가 아니라 새 파일).
2. 구현 — `residenceMonthsOverflowIssue` 게이트·월 환산·기준일 후보에 겸용을 추가하고 호출부의 필드 경로를 겸용이면 `["mixedUse","residencePeriodYears"]`로. 시험 적용 diff는 스크래치패드 `mx-H.trial`.
3. 기존 테스트 1건 보정(Q-2 a) + 공용 보정 헬퍼 `capResidenceToHolding`은 주택만 보정하므로 겸용 시료는 개별 확인.
4. 뮤테이션(겸용 게이트 제거 · 연수 환산 `× 12` 제거 · 후보 날짜 제거 등) → 전체 회귀 → tsc · eslint. 브라우저: 화면 변화 없음(⑧은 이미 막는다) — 해당 없음.

## 4. 구현 결과 (Q-1 a · Q-2 a · Q-3 a)

| 항목 | 결과 |
|---|---|
| 코드 | `lib/api/transfer-tax-schema-household-refines.ts` — `residenceMonthsOverflowIssue`가 `mixed-use-house`를 포함: 거주 = `mixedUse.residencePeriodYears × 12`(실제 개월의 하한) · 기산 후보에 `mixedUse.landAcquisitionDate`·`buildingAcquisitionDate` 추가 · 호출부 필드 경로는 겸용이면 `mixedUse.residencePeriodYears`. 엔진·UI·세액 산식 불변 |
| 신규 anchor | `__tests__/api/transfer.route.mixed-use-residence-cap.anchor.test.ts` — 10건(라우트 C1~C4 · 단위 U1~U6). 경계 8년 통과 · 9년(108 > 96개월) 400 · 연수 하한(⑧ 통과 ⇒ ⑫ 통과) · 겸용 토지 취득일·증여자 취득일 후보 · 1세대1주택 아님/연수 없음/재개발/취득일 없음/토지·일반건물 미판정 |
| 기존 테스트 1건 | `transfer.route.mixed-use-89-2-e7.anchor.test.ts` — 비현실 시료(보유 45개월 · 거주 60개월)를 거주 3년으로 보정. 기대 결정세액 195,217,632 → **196,471,584**(독립 도출: 종전 거주 5년 표2 거주분 20% → 12%, 주택분 과세 양도차익 37,320,000 × 8%p = 2,985,600이 장특에서 덜 빠져 종합소득 +2,985,600 × 42% = +1,253,952). 시험 적용 때 실측한 거주 3년 값과 일치 |
| 뮤테이션 | ① 겸용 게이트 제거 → 5건 실패 ② 연수 환산 `× 12` → `× 1` → 5건 ③ 겸용 토지·건물 취득일 후보 제거 → 1건 ④ `(연수 + 1) × 12`(과엄격) → 5건 ⑤ 필드 경로 `residencePeriodMonths`로 되돌림 → 1건 ⑥ 1세대1주택 조건 제거 → 2건. 6/6 killed, 원복 확인 |
| 전체 회귀 | 3,625개 파일 통과 · 1 skip · 실패 0 (44,380 테스트 통과) · tsc 0 · eslint 0 |
| 브라우저 | 해당 없음 — 화면은 ⑧이 이미 같은 값을 막는다(V-3). 이 변경은 API 직접 호출만 닿는다 |
| 남은 별건 | **O-24** 컴패니언 주택 `residencePeriodMonths` 상한 없음(V-6) · 컴패니언 겸용 미측정(확인 필요) |
