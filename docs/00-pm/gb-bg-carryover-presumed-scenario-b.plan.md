# 일반건물 부담부증여 × 이월과세 × 감정가액·매매사례가액(K-7·K-6) — 시나리오 B 400 (F27 B) 계획서

> 작성 2026-10-24 · 근거 기록: `docs/00-pm/gb-card-built-penalty-114-2.plan.md` 「K-7(감정)은 열지 않았다 — 발견한 별건 결함」(PR-5c #2476)
> 상태: **계획 확정** — 2026-10-24 사용자 결정 Q-1 a · Q-2 a · Q-3 a · **Q-4 b**(A/B 비교 표시를 이번 계획에 포함 → PR-4)

## 1. 현상 — 실측 (2026-10-24 · master 0875f5a43 · 폼 → ④ → ⑧ → ⑫ → route POST · mock 세율)

시료: 일반건물 단건 · 부담부증여(시가 모드 · 시가 10억 · 채무 5억 → 채무비율 0.5) · 이월과세(증여 등기 2024-05-01 · 당초 증여자 취득 2015-01-01 · 증여세 0) · 양도 2026-03-01.
K-7 입력: 당초 증여자 감정가액 토지 1억·건물 2억(`bgCoDonorPresumedAcquisition*`) · 양도인 증여일 평가액 토지 3억·건물 3억(`bgActualAcquisition*`).
(픽스처는 `__tests__/api/transfer.route.gb-bg-carryover-donor-built.pipeline.anchor.test.ts`의 `gbAsset` 기본값.)

| # | 시료 | ⑧ | route | 결정세액 |
|---|---|---|---|---|
| S1 | 단건 K-7 × 이월과세 | 통과(issues []) | **400** 「[burdened_gift] 취득가액 산정방식 「감정가액」은 취득 당시 감정가액을 입력해야 합니다」 | — |
| S2 | 단건 K-6 × 이월과세 | 통과 | **400**(「매매사례가액」 같은 문구) | — |
| S3 | 단건 K-7 × 이월과세 · 증여세 3천만 | 통과 | **400** | — |
| S4 | 단건 K-5(환산) × 이월과세 — 대조 | 통과 | 200 · A 채택 | 109,326,000 (A) / 97,800,000 (B) |
| S5 | 지분 분할(축 B) 50/50 · K-7 × 이월과세 | 통과 | **400**(S1과 같은 문구) | — |
| S6 | 🔴 지분 분할 50/50 · **K-5** × 이월과세 | 통과 | 200 · **비교 없음** | 97,800,000 — 당초 증여자 기준시가를 1원·1원으로 바꿔도 같다(Δ 0) |
| S7 | 부담부증여 묶음(일반건물 + 토지 부담부증여) · K-7 × 이월과세 | 통과 | **400** | — |
| S8 | 🔴 부담부증여 묶음 · **K-5** × 이월과세 | 통과 | 200 · **비교 없음** | 110,760,000 — 당초 증여자 기준시가 1원·1원에도 같다(Δ 0) |
| S9 | 함께 양도(일반 토지 + 일반건물 부담부증여) | 차단 | 400 「일반 양도 자산과 부담부증여 자산은 함께 양도로 계산할 수 없습니다」(정상 — 범위 밖) | — |

⇒ **사용자가 ⑧을 통과한 입력으로 계산을 못 하는 조합**(S1·S2·S3·S5·S7)과, **이월과세를 입력했는데 조용히 반영하지 않는 조합**(S6·S8 — 시나리오 B 값만 나온다)이 있다.

## 2. 원인

### 2.1 단건(S1~S3) — F27 B 호출이 양도인 기준으로 바꾸지 않는다

`app/api/calc/transfer/general-building-route-carryover.ts`(F27)는 카드 조립을 두 번 부른다:

- A 호출: `burdenedGiftInfo: applyCarryoverDonorBasis(info, …)` — 당초 증여자 값(`carryoverDonorBasis.presumed*`)을 §159 안분 입력으로 옮긴다(소득세법 §97의2①1호).
- **B 호출: `run(payload)` — `info`를 그대로 넘긴다.** K-6/K-7이면 `acquisitionMethod`가 그대로 「감정가액·매매사례가액」인데, 이월과세 입력의 양도인 칸 `presumed*`는 ④가 싣지 않는다(당초 증여자 값은 `carryoverDonorBasis`로 간다 — `__tests__/calc/bg-carryover-presumed-api.anchor.test.ts`). 그래서 §159 안분이 「취득 당시 감정가액」 미입력으로 throw → 400.

단건 엔진은 같은 자리에서 `toTransferorBasisInfo`를 거친다(`lib/tax-engine/transfer-tax-carryover.ts:640` `buildInputB`). 이 함수는 K-6/K-7이면 B를 **실지취득가액(K-4)으로 읽게** 바꾼다 — 양도인은 증여받은 사람이라 「소득세법 시행령」 §163⑨가 증여일 상증법 평가액을 실지거래가액으로 보기 때문이다(`lib/tax-engine/transfer-tax-carryover-burdened-gift.ts:240-258`). F27만 이 단계가 빠졌다.

### 2.2 지분 분할·부담부증여 묶음(S5~S8) — §97의2 비교 자체가 없다

지분 카드와 묶음 카드는 카드 조립(`buildActualGeneralBuildingCards` 계열)을 직접 부르고 F27을 타지 않는다(`gb-card-built-penalty-114-2.plan.md` 「범위 판단」 · PR-5c 실측 Δ 0을 이번에 K-5·묶음까지 재실측). 그래서:

- K-5: 원본 `info`(양도인 기준)로 한 번만 계산 → **시나리오 B 값**이 결과가 된다. §97의2②3호는 「A가 B보다 **적을 때만**」 ①을 배제하므로, A ≥ B인 사례에서는 결정세액이 **과소**가 된다(단건 S4 기준 A 109,326,000 vs B 97,800,000 — Δ 11,526,000. 지분·묶음에서의 A 값은 배선이 없어 측정할 수 없다 — 확인 필요).
- K-6/K-7: 2.1과 같은 이유로 400.

⑧은 두 경로 모두 아무 말이 없다.

## 3. 수정 설계

### 3.1 PR-1 — 단건 F27 B 호출 (S1~S3)

`general-building-route-carryover.ts`의 B 호출 한 줄:

```ts
const resultB = run({ ...payload, burdenedGiftInfo: toTransferorBasisInfo(info) });
```

- K-1~K-5는 `toTransferorBasisInfo`가 그대로 돌려준다(`isPresumedCarryover` 거짓) ⇒ **기존 200 결과는 바뀌지 않는다**.
- 바뀌는 것은 지금 400인 K-6·K-7뿐이다(400 → 200 + 세액).
- 기존 테스트 영향: 임시 적용 상태로 `__tests__/{api,calc,tax-engine/transfer-tax,components}` 1,954파일 23,029건 실패 0 — 지금의 400을 단언하는 테스트가 **없다**(결함을 지키는 테스트도 없다는 뜻이라 PR-1 anchor가 처음 고정한다).
- 14지점: ④⑤⑧⑫는 이미 이 입력을 통과시킨다(⑧ issues [] · ⑫ 통과 — 400은 엔진 throw다). 바꾸는 곳은 route(F27) 한 곳이다.

**임시 적용 실측**(같은 시료 · 수정은 되돌렸다):

| 시료 | 채택 | A | B | 대조군 | 일치 |
|---|---|---|---|---|---|
| S1 K-7 | A | 82,627,700 | 79,000,000 | B 대조: 이월과세 없는 **증여 취득 + K-4 실지**(증여일 평가액 3억·3억) = **79,000,000** | B ✅ |
| 〃 | | | | A 대조: 이월과세 없는 **매매 + K-7**(감정가액 1억·2억 · 취득일 2015-01-01 · 취득시 기준시가 = 당초 증여자 값 토지 1천만·건물 4천만) = **82,627,700** | A ✅ |
| S2 K-6 | A | 82,627,700 | 79,000,000 | S1과 같은 값(매매사례가액 = 감정가액 입력이 같다) | ✅ |
| S3 K-7 · 증여세 3천만 | **B** | 78,181,700 | 79,000,000 | §97의2①3호 증여세 산입으로 A < B → ②3호로 B | — |
| K-6 · 당초 증여자 토지 1.2억 | A | 79,663,700 | 79,000,000 | 입력이 결정세액에 닿는다(구별력) | — |

- A 대조에서 한 번 어긋났던 666,900은 **대조군 시료** 탓이었다 — 개산공제(§163⑥)의 취득시 기준시가를 양도인 값(토지 1억·건물 1억)으로 두었다. 당초 증여자 값(1천만·4천만)으로 맞추자 정확히 같아졌다. 즉 A의 개산공제는 당초 증여자 취득시 기준시가를 쓴다(150,000 · 600,000 = 기준시가 × 3% × 채무비율 0.5).
- ⑧·⑫의 미입력 차단은 그대로 맞물린다: 당초 증여자 값 없음 → ⑧·⑫ 둘 다 차단(「당초 증여자의 감정가액을 입력하세요」) · 증여일 평가액 없음 → 둘 다 차단(「시나리오 B」). 일반건물에서 총액 칸만 채운 입력도 둘 다 차단된다.

### 3.2 PR-2 — 일반건물 K-7 × 당초 증여자 신축·증축 §114조의2 개방 (Q-2)

PR-5c는 PR-1 결함 때문에 일반건물 부담부증여의 증여자 신축 가산세를 **K-5만** 열었다 — ⑤④⑧ 술어(`lib/calc/donor-built-bg-scope.ts`) · ⑫(`refineGbBgDonorBuilt` — 감정 거부) · 엔진 방어선(`assertGbBgDonorBuiltInput`) 3중.
PR-1 뒤에는 K-7 A 시나리오가 계산되므로 열 수 있다. 단건 선례(PR-4 #2443): K-7 기준액 = **채무비율 안분 후 건물 감정가액**(`carryover-donor-built-114-2.plan.md:459` 「K-7: 같은 파일 `penaltyAxis.base = building.acquisitionPrice`(안분 후)」 · 실측 K-7 base 125,000,000 → 6,250,000 `:460`). 위 시료면 A 건물 카드 취득가액 100,000,000 → 가산세 5,000,000이 **예상값**이다(Do에서 실측 — 확인 필요).
- 증축(`donorBuiltType: "extension"`)은 단건이 증축 부분 감정가액(`presumedExtensionAppraisalValue`)을 안분한다. 일반건물 부담부증여 화면에 그 칸이 있는지 확인하지 않았다(확인 필요) — Q-2.
- K-6(매매사례가액)은 §114조의2 대상이 아니다(환산·감정만) — 단건과 같이 열지 않는다.

### 3.3 지분 분할·부담부증여 묶음 (S5~S8) — Q-3

두 경로는 §97의2 A/B 비교 배선 자체가 없다. 고치는 방법은 둘이다:

- **차단(⑧ + ⑫)**: 지분 분할 또는 부담부증여 묶음에서 일반건물 이월과세(`carryover_gift`) 입력을 막고 「단건으로 계산하세요」라고 알린다. 조용한 B 값과 400이 모두 사라진다. 지금 200이 나오는 입력(S6·S8)은 **막히게 된다**(그 값이 A ≥ B 사례에서 과소였다).
- **배선**: 지분·묶음에서도 aggregate를 A/B 두 번 돌려 신고단위 결정세액으로 비교한다(F27 방식). 지분이 서로 다른 날 다른 원인으로 취득된 경우 지분마다 이월과세 여부가 다를 수 있어, 비교 단위·조합을 먼저 정해야 한다(설계 필요 — 별도 계획서).

### 3.4 결과 화면 A/B 비교 표시 — Q-4 b (PR-4)

F27이 싣는 `aggregated.burdenedGiftCarryoverDetail`(채택 시나리오·A/B 결정세액)을 읽는 컴포넌트가 **없다**(`components/` grep 0건). 단건 이월과세는 `CarryoverComparisonCard`로 A/B를 보여준다. K-5에서도 같은 상태이므로 PR-1의 결함은 아니다. 화면에서 실제로 무엇이 보이는지는 확인하지 않았다(확인 필요 — PR-4 Do 첫 단계에서 브라우저로 실측). → **실측 결과·구현은 §11**.

**PR-4 설계(초안 — Do 첫 단계 실측 뒤 확정)**:
- 지금 echo는 신고단위 결정세액 A·B·채택·증여자 취득일·증여세만 싣는다. 단건 카드(`CarryoverComparisonCard` — `ScenarioCol`·`InfoRow`)는 시나리오마다 **취득가액·보유기간·양도차익·결정세액**을 보여 준다. 일반건물은 카드가 토지·건물로 나뉘므로 F27이 두 결과(`resultA`·`resultB`)에서 **시나리오별 요약**(토지·건물 취득가액, 양도차익 합, 보유기간 기산일, 결정세액)을 echo에 더 싣는다 — 미채택 쪽 값은 지금 버려진다.
- 표시는 단건 비교 카드의 열 구성(`ScenarioCol`)을 재사용해 일반건물 결과 카드(실제로 렌더되는 곳은 Do에서 fiber로 확인 — `feedback_same_label_card_different_component`)에 붙인다. 채택 쪽 표시 · ②3호로 B가 된 경우 「비교과세 세액 역전」 문구도 단건과 같은 규칙.
- 결과 4뷰(결과 카드·상세명세서·신고서·PDF) 중 어디까지 붙일지는 단건이 붙이는 범위를 따른다(Do에서 대조 — 확인 필요).
- 세액 불변(표시 전용). K-5·K-6·K-7 모두 대상(K-5도 지금 표시가 없다).

## 4. 결정 필요

| Q | 질문 | 선택지 | 권장 |
|---|---|---|---|
| **Q-1** ✅a | 단건 F27 B 호출 수정(PR-1) | a 진행 / b 보류 | **a** — K-1~K-5 결과 불변, 400인 조합만 계산된다. A·B 모두 대조군과 정확히 같다(§3.1) |
| **Q-2** ✅a → **신축·증축 모두**(§9 재결정) | 일반건물 K-7 × 당초 증여자 신축·증축 가산세 개방(PR-2) | a 신축만 개방 · 증축은 K-7 거부 유지 / b 신축·증축 모두(증축 감정가액 칸 확인·필요하면 신설) / c 이번엔 열지 않음 | **a** — 신축은 단건 선례 규칙(안분 후 건물 감정가액)을 그대로 쓴다. 증축 감정가액 입력 경로는 미확인이라 열면 막다른 길이 될 수 있다 |
| **Q-3** ✅a | 지분 분할·부담부증여 묶음 × 이월과세(S5~S8) | a 이번 계획에서 ⑧+⑫ 차단(PR-3) · 배선은 별도 계획서 / b 이번 계획에서 배선까지 / c 현행 유지·기록만 | **a** — 조용한 B 값은 과소과세 가능성이 있고 사용자가 알 길이 없다. 배선은 비교 단위 설계가 먼저라 한 PR에 넣으면 크다 |
| **Q-4** ✅**b** | 결과 화면에 F27 A/B 비교 표시 | a 별건(이번 범위 밖) / b 이번 계획에 포함 | 권장은 a였다(기존 공백·세액 무관) — **사용자 결정 b**: 이번 계획에 PR-4로 포함 |

## 5. PR 계획 (확정)

| PR | 내용 | 바뀌는 계산 |
|---|---|---|
| PR-1 | F27 B 호출 `toTransferorBasisInfo` + anchor(S1~S3·K-6 구별력·K-5 불변·대조군 2종) + E2E(K-7 × 이월과세 일반건물이 화면에서 계산까지 간다 — 화면 도달 자체를 먼저 확인) · PR-5c 주석·anchor 문구 「B가 400」 정정 | S1·S2·S3: 400 → 계산 |
| PR-2 | (Q-2 a) K-7 신축 개방: `donor-built-bg-scope.ts` 술어 · `refineGbBgDonorBuilt` · `assertGbBgDonorBuiltInput` · 신호 leaf `gbBurdenedGiftDonorBuiltPenaltySignal`에 K-7 기준액. 기존 K-7 거부 anchor(`transfer.route.gb-bg-carryover-donor-built.anchor.test.ts:210`·pipeline PL-2 K-7 행) 반전 | K-7 + 증여자 신축 + 5년 이내: 가산세 신설 |
| PR-3 | (Q-3 a) 지분 분할·부담부증여 묶음 × 일반건물 이월과세 ⑧+⑫ 차단 · ⑧↔⑫ 격자 | S6·S8: 200 → 차단 |
| PR-4 | (Q-4 b) F27 시나리오별 요약 echo + 일반건물 결과 화면 [A]/[B] 비교 카드(단건 `ScenarioCol` 재사용) · 결과 뷰 anchor + E2E | 없음(표시 전용) |

## 6. 검증 계획

- anchor: §1 표 S1~S8 전 행을 단언(수정 전 red · 수정 후 green) · K-1~K-5 × 이월과세 단건 결정세액 불변(S4 109,326,000).
- 대조군 등식: B = 「증여 취득 + K-4 실지(증여일 평가액)」 · A = 「매매 + K-7(당초 증여자 값·취득일·취득시 기준시가)」 — 두 값이 정확히 같아야 한다.
- 뮤테이션: B 호출의 `toTransferorBasisInfo` 제거 → S1 red · A 호출과 뒤바꿈 → 대조 등식 red.
- E2E: 일반건물 부담부증여 K-7 × 이월과세 — 화면 입력 → 계산 결과(400 문구 없음) · PR-4는 결과 화면에 [A]/[B] 두 열과 결정세액(A 82,627,700 · B 79,000,000)·채택 표시.
- 회귀: vitest 전건 · `gb-*`·`general-building-*`·부담부증여 E2E.

## 7. 관련 · 범위 밖

- 법령 근거는 새로 세우지 않는다 — B의 K-6/K-7 처리(소령 §163⑨ 증여일 평가액 = 실지거래가액)와 A의 §97의2①1호 치환은 단건 엔진에 이미 있는 판단을 일반건물에 맞추는 것이다(`transfer-tax-carryover-burdened-gift.ts:240-258` · `general-building-route-carryover.ts` 헤더 주석의 조문 검토).
- PR-5c 기록의 「576셀 전부 400」은 PR-5c 격자 수치다 — 이번에 다시 세지 않았다(대표 시료 S1·S2·S3·S5·S7로 재현).
- 실측 probe는 scratchpad의 일회성 테스트였다(저장소에 남기지 않음).

## 8. PR-1 구현 기록 (2026-10-24)

브랜치 `fix/gb-bg-carryover-presumed-scenario-b`(계획서 브랜치 2f60386f7에서 분기).

- route `general-building-route-carryover.ts` — B 호출에 `toTransferorBasisInfo(info)`(단건 `buildInputB`와 같은 leaf). §3.1 그대로.
- 낡은 주석 4곳 정정(「시나리오 B 가 아직 400」): `donor-built-bg-scope.ts` · `transfer-tax-schema-donor-built.ts` · PR-5c anchor 2파일 — K-7 증여자 신축 개방은 여전히 PR-2.
- anchor `__tests__/api/transfer.route.gb-bg-carryover-presumed-scenario-b.anchor.test.ts` 10건(폼 → ④ → ⑧ → ⑫ → route): K-7 · K-6 · 증여세 B 채택 · 구별력 2(A=당초 증여자 값 · B=증여일 평가액 — 토지 2억이면 B 99,000,000) · 대조 등식 2 · K-5 불변 · ⑧↔⑫ 미입력 2. 수정 前 7 red · 3 green(K-5 회귀·⑧↔⑫ 대조).
- 뮤테이션 3/3 KILLED: B leaf 제거 · A에도 leaf 적용 · 채택 부등호 반전.
- E2E `e2e/gb-bg-carryover-presumed-scenario-b.spec.ts` GBPB-E1(감정가액)·E2(매매사례가액) — 화면에 「당초 증여자의 … 입력」 카드·토지·건물 칸이 있고, 계산하면 신고서에 82,627,700. 수정 前 코드에서 결과 화면이 뜨지 않음(60초 타임아웃) 확인. 회귀: 일반건물 부담부증여·이월과세 E2E 45 passed.

## 9. PR-2 구현 기록 (2026-10-24) — K-7 × 당초 증여자 신축·**증축** 개방

**Q-2 재결정(2026-10-24)**: §4의 Q-2 a(신축만)는 「일반건물 부담부증여에 증축 감정가액 입력 경로가 있는지 미확인」을 근거로 했다. 구현 전 확인하니 경로가 **이미 있었다** — `CarryoverDonorBuiltSection.tsx`(bg 모드 · K-7 · 증축이면 「증축한 부분의 감정가액」 칸) · ④ `buildDonorBuiltBgExtensionAppraisal` · ⑧ `validateDonorBuiltBg`(게이트가 열리면 요구 · 당초 증여자 건물 감정가액 상한). 전제가 바뀌어 다시 물었고 사용자가 **신축·증축 모두**로 정했다.

- ⑤④⑧ 술어 `donor-built-bg-scope.ts` — 일반건물의 K-5 한정을 풀었다(K-6·K-4 등은 공통 규칙이 계속 범위 밖).
- ⑫ `refineGbBgDonorBuilt` — 「감정가액(K-7)은 아직 지원하지 않습니다」 거부 제거(방식 규칙은 공통 `refineBgDonorBuilt`).
- 엔진 `general-building-bg-penalty-signal.ts`:
  - 신호 — K-7 기준액 = 신축: 채무비율 안분 후 건물 감정가액 · 증축: 증축한 부분의 감정가액 × 채무비율(`apportionAcquisitionPrice` — 단건 §159 step 과 같은 규칙). 게이트는 감정가액 시행일(2020.1.1.)로 판정.
  - 방어선 `assertGbBgDonorBuiltInput` — K-7 수용 · K-7 증축은 증축 부분 기준시가를 요구하지 않고, 게이트가 열리면 증축 감정가액(> 0 · 당초 증여자 건물 감정가액 이하)을 요구(단건 step 의 throw 와 같은 조건 · ⑧과 같은 상한).
- route F27 — 적용 echo `burdenedGift.method`와 게이트 판정이 `"estimated"` 고정이었다 → 방식에 따라 `appraisal`.
- 실측(같은 시료): 신축 A 채택 → 기준액 100,000,000 · 가산세 5,000,000 / 증축 90㎡ · 증축 감정가액 6천만 → 30,000,000 · 1,500,000 / B 채택 → 0 + scenario_b / 5년 밖 → 0 + outside_penalty_window. 결과 카드 「증여자 신축 건물 감정가액 가산세 (소득세법 §114조의2)」·「가산세 5,000,000 = 100,000,000 × 5%」(스크린샷 확인).
- 검증: route anchor `transfer.route.gb-bg-carryover-k7-donor-built.anchor.test.ts` 8건(수정 前 6 red · 대조 2 green) · leaf anchor +4(K-7 신축·증축·감정 시행일·방어선) · PR-5c 단언 3곳 반전(K-7 거부 → 수용, stale 행은 K-6 으로 교체) · 뮤테이션 10/10 KILLED · E2E GBBD-E7(K-7 신축 결과·라벨)·E8(K-7 증축 UI 경로 — 기준시가 칸 없음·감정가액 칸 입력) · 회귀 E2E 50 passed.

## 10. PR-3 구현 기록 (2026-10-24) — 지분 분할·부담부증여 묶음 × 일반건물 이월과세 차단 (Q-3 a)

body 실측(수정 前): 지분 분할은 최상위 일반건물 객체에 `carryoverTaxation`이 실리고 지분 카드(`generalBuildingShares`)에는 없다 · 부담부증여 묶음은 일반건물이 첫 자산이면 최상위, 둘째 이후면 `companionAssets[i]`에 실린다. 다섯 시료 모두 ⑧ 통과 · route 200(K-5, B 값)·400(K-7).

- ⑧ `validateBurdenedGiftAsset` (1-a′) — 일반건물 + `carryover_gift` + (축 B `isFractionalSplitAxis` 또는 함께 부담부증여 `contractAssumedDebtTotal`)이면 다른 필수 칸보다 **앞**에서 `acquisitionCause` 칸으로 막는다(「이 일반건물만 따로(단건으로) 계산하세요」). 겸용 묶음 차단(1-a)과 같은 자리·같은 술어.
- ⑫ `refineGbBgCarryoverBundled`(`transfer-tax-schema-donor-built.ts`) — 최상위(지분·컴패니언이 있을 때)와 `companionAssets[i]` 각각 「일반건물 + 부담부증여 + `carryoverTaxation`」이면 거부. 문구 상수를 ⑧과 공유.
- 기존 테스트 갱신: PR-5c route anchor DB-4(지분 donorBuilt) · pipeline PL-5 2건 — 「donorBuilt만 끄면 계산된다」 대조가 이제 묶음 차단에 걸려 400(`carryoverTaxation`)이다. donorBuilt 거부가 **별도 필드로 함께** 나옴을 고정하도록 바꿨다. E2E GBBD-E6도 「토글을 끄면 계산」 → 「⑧이 이월과세 자체를 막고 그 칸으로 이동」으로 바꿨다.
- 검증: anchor `transfer.route.gb-bg-carryover-bundled-block.anchor.test.ts` 12건 — 차단 7(지분 K-5 · 미선언 축 B · K-7 · 첫 지분만 · 묶음 첫 자산 K-5·K-7 · 묶음 둘째 자산) 수정 前 전부 red · 대조 5(단건 109,326,000 · 지분 증여 · 지분 일반 양도 × 이월과세 200 · 묶음 토지 쪽 이월과세 · 묶음 이월과세 아님) green. 뮤테이션 9/9 KILLED(처음 「⑧ 일반건물 조건」이 살아 토지 쪽 이월과세 대조를 추가). E2E 회귀 44 passed.
- 남은 것: 지분·묶음에서 §97의2 비교 **배선**(비교 단위 설계 — 별도 계획서) · PR-4(결과 화면 A/B 비교).

## 11. PR-4 구현 기록 (2026-10-24) — 결과 화면 [A]/[B] 비교 (Q-4 b)

**Do 첫 단계 실측(수정 前, K-7 A 채택 시료)**: 결과 화면 전문에 「이월과세」·[A]/[B]·B 결정세액 79,000,000이 **한 번도 나오지 않았다**(결정세액 82,627,700만). 렌더 지점은 `BundledAllocationCard`다(`aggregated.donorBuiltPenalty`를 읽는 유일한 컴포넌트 — PR-5c 카드와 같은 자리).

같은 실측에서 **신고서 표 자기모순**을 하나 더 찾았다: A 채택이면 엔진은 토지·건물 카드 보유기간을 당초 증여자 취득일(2015-01-01)부터 세어 장특공제율 22%(76,835,000 = 349,250,000 × 22%, 11년)를 냈는데, 신고서 표는 폼 취득일로 **취득일자 2024-05-01 · 보유기간 1년 10월**을 찍었다. 단건 경로의 #023(「보유 26년인데 장특 6%」)과 같은 종류다 — 단건은 `acquisitionDateOverride`로 이미 막았고 일반건물에만 없었다.

- route F27 — `burdenedGiftCarryoverDetail.scenarioA`·`scenarioB`(표시 전용): 카드별 취득가액·양도차익 + 토지·건물 보유기간 기산일. 기산일은 그 호출에 넘긴 카드 취득일 그대로다(A = 당초 증여자 취득일 · B = `landAcquisitionDate ?? acquisitionDate`·`buildingAcquisitionDate ?? acquisitionDate`, `general-building-route-actual.ts`의 `landCardDate`·`buildingCardDate`와 같은 식). 미채택 쪽 카드 값은 종전에 버려졌다.
- 화면 `GbBurdenedGiftCarryoverCard` — 단건 `ScenarioCol`·`InfoRow` 재사용. A·B 결정세액이 곧 신고 전체 결정세액이라 배지는 「✓ 채택 (더 큰 세액)」(단건과 같은 규칙) · B 채택이면 「← 비교과세 세액 역전」·「시나리오 B 채택 (세액 역전)」. 옛 저장 결과(요약 없음)는 결정세액만 보인다.
- 신고서 표·상세명세서 — `gbCarryoverAcqDateOverride`(`FilingFormTableDateHelpers.ts`): A 채택이면 토지·원건물 카드 취득일을 `scenarioA` 기산일로 덮고 취득일자 칸에 각주(「당초 증여자 취득일 — 이월과세 적용(시나리오 A) · 소득세법 §95④ 단서」). B 채택·옛 결과·증축 카드는 그대로.
- 범위: 결과 카드 · 신고서 표 · 상세명세서(보유개월). 단건처럼 신고서를 [A]/[B] 두 단으로 나누지는 않았다 — 일반건물 신고서는 카드 열이 여럿이라 채택 쪽 한 벌만 그리고, 미채택 쪽은 비교 카드가 보여 준다. 서버 PDF(`lib/pdf/ResultPdfTransferSections.tsx`)는 단건 A/B 비교 카드(`carryoverTaxationDetail`)도 싣지 않는다(파트 이월과세·§114조의2 카드만) — 단건 범위를 따라 PDF에는 붙이지 않았다. 일반건물 PDF는 취득일자·보유기간 칸이 없어(입력 요약은 `buildingStdSnapshots`만 받는다) 위 날짜 모순도 PDF에는 없다.
- 실측(수정 後): A 열 토지 50,000,000·건물 100,000,000·기산일 2015-01-01·양도차익 349,250,000·결정세액 82,627,700 / B 열 150,000,000·150,000,000·2024-05-01·200,000,000·79,000,000 · 신고서 2015-01-01·11년 2월 · 375px 가로 스크롤 없음(스크린샷 확인).
- 검증: route anchor +4(A 요약 = 응답 카드 · 미채택 B 요약 · B 채택 요약 = 응답 카드 · 토지만 다른 취득일이면 B 기산일이 갈림) — 수정 前 4 red · 뮤테이션 2/2 KILLED(B 토지 기산일 축 · A 요약 출처) · 헬퍼 anchor 2 · E2E GBPB-E3(A 채택 카드·신고서 날짜)·E4(B 채택 세액 역전·신고서 날짜 불변).
