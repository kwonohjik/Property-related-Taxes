# 환산취득가액 산식 부동소수 1원 과소 — 수정 계획서

**작성**: 2026-10-21 · **base**: master `4340b7985` · **출처**: P6(주택 split 파트 이월과세 환산) 엔진 Do 중 발견한 별건 후보
**상태**: ✅ Plan 확정 (2026-10-21 사용자 결정 — Q1 인접 축 포함(단 지분 규약 `applyRatio`는 제외, §6.1) · Q2·Q3 권장안) → P6 머지 후 Do
**실측 원자료**: 세션 scratchpad `estfl/`(probe.mjs~probe5.mjs · e2e.probe.test.ts · measure.py · res.json) — 세션이 끝나면 지워진다.

---

## 1. 요약

환산취득가액(양도가액 × 취득 당시 기준시가 ÷ 양도 당시 기준시가)을 저장소의 정본 헬퍼 `calculateEstimatedAcquisitionPrice` → `safeMultiplyThenDivide`(`lib/tax-engine/tax-utils.ts:215-223, 331-341`)를 거치지 않고 **직접 부동소수로 계산하는 곳이 18곳** 있다. 이 곳들은 참값이 정수로 떨어질 때 **약 4~5% 확률로 1원 과소**를 낸다(방향은 항상 과소). 정본 헬퍼는 같은 실측에서 오차 0이다.

- 영향: 취득가액이 1원 작아져 양도차익·과세표준이 1원 커진다. 결정세액은 세율 곱 뒤 절사라 0~1원 영향이다(실측 사례는 결정세액 불변).
- 기존 테스트는 이 조합을 하나도 쓰지 않는다 — 18곳을 고쳐도 32,333건 중 실패 0(§4). **새 anchor 없이는 회귀를 막을 수 없다.**
- 같은 부류의 선례: 「단가 × 면적」 1원 과소(`multiplyByArea`·정적 가드 `__tests__/lib/unit-price-area-policy.test.ts`) · `applyFairMarketRatio`(0.70 double 표현).

## 2. 원인 — 두 가지 계산 모양

| 모양 | 식 | 언제 틀리나 | 실측 |
|---|---|---|---|
| **R(비율 먼저)** | `Math.floor(a * (b / c))` | `b / c`가 이진 소수로 정확히 표현되지 않으면 곱이 참값보다 미세하게 작아진다. 참값이 정수면 `floor`가 1을 깎는다. 곱의 크기와 무관하다 | 참값 정수 표본 50만: 일반 규모 4.45% · 소규모(곱 < 2^53) 4.28% 과소, 과대 0 |
| **P(곱 먼저, 가드 없음)** | `Math.floor(a * b / c)` | `a * b`가 `Number.MAX_SAFE_INTEGER`(약 9×10^15)를 넘으면 곱 자체가 반올림된다. 양도가 수억 × 기준시가 수천만이면 대부분 넘는다 | 참값 정수 표본 50만: 4.75% 과소(곱 > 2^53인 표본이 99.6%), 소규모 0 |
| 정본 `safeMultiplyThenDivide` | 곱 > 2^53이고 정수면 BigInt, 아니면 `floor(p / c)` | — | 같은 표본 전부 0. 곱 ≤ 2^53 경로의 경계(곱 = q·c − 1) 18표본도 0 |

- 무작위 입력(참값이 정수 아님) 100만 표본에서는 R·P 모두 0 — 오차는 **참값이 정수인 입력**에서만 난다. 실무형 숫자로도 생긴다:
  - R: 양도가 114,000,000 × 4,900,000 ÷ 150,000,000 → **3,723,999**(참값 3,724,000). 7,900,000 ÷ 120,000,000 등 6건을 손쉽게 찾았다.
  - P: 1,879,616,249 × 678,235,448 ÷ 738,389,368 → 1,726,490,688(참값 …689). 백만 원 단위로 반올림된 입력(곱의 하위 비트가 0)은 13만 표본에서 0 — 원 단위 기준시가(공시지가 × 면적)에서 생긴다.

### 2.1 엔진 끝까지 재현 (master 엔진, mock 세율)

split 건물(토지·건물 별개 취득, 두 파트 환산): 토지 양도가 114,000,000 · 토지 취득시 기준시가 24,500원/㎡ × 200㎡ = 4,900,000 · 토지 양도시 기준시가 150,000,000.
- 토지 환산취득가액 **3,723,999**(참값 3,724,000) → 양도차익 166,562,335 · 과세표준 120,810,882 · 산출세액 26,843,808.
- 고치면 과세표준이 1원 작아지지만 이 사례의 산출세액은 같다(120,810,881 × 35% − 누진공제의 소수부가 같은 정수로 절사). 결정세액이 바뀌는 사례는 세율 × 1원이 절사 경계를 넘을 때다.
- 표시: 결과 카드·상세명세서·신고서·PDF의 취득가액 칸이 1원 작게 나온다.

## 3. 대상 — 18곳 (1단계)

| # | 파일:줄 | 모양 | 경로 |
|---|---|---|---|
| 1 | `lib/tax-engine/transfer-tax-split-acq-price.ts:213` `calcPartAcquisitionPrice` | R | 주택·건물 split 파트 환산 전부 + 일반건물 파트(`general-building-part-acq.ts`·`general-building-valuation.ts`가 같은 함수 호출) + P6 이월과세 파트 환산 |
| 2 | `lib/tax-engine/transfer-tax-carryover.ts:189` | P | 자산 전체 이월과세 — 기준시가 직접 입력 환산 |
| 3~16 | `lib/tax-engine/transfer-tax-pre-housing-disclosure.ts:109,116,122,128,140,144,223,232,234,236,241,246,248,250` | P | 영 §164⑦ 주택 최초 공시 전 취득 환산(PHD) — 추정 취득시 가액·토지/건물 안분·4분할 |
| 17 | `lib/tax-engine/transfer-reductions/phd-helper.ts:126` | P | 감면 경로의 PHD 추정 취득시 기준시가 |
| 18 | `lib/tax-engine/transfer-tax-aggregate-display-echo.ts:151` | P | 다건 합산 표시 fallback(엔진 `estimatedBase`가 없을 때만) |

※ 합계 18곳(R 1 · P 17). 측정 하네스는 위 줄을 그대로 바꿨다(§4).

- 정본 헬퍼를 이미 쓰는 곳(변경 없음): `transfer-tax-helpers.ts:359`(단건 환산) · `multi-parcel-transfer.ts:376` · `mixed-use-sale-split.ts:312` · `burdened-gift-apportionment.ts:361,365` · `transfer-tax-building-penalty.ts:97,185` · `inheritance-acquisition-price.ts:141` · `transfer-tax-mixed-use-*` 일부 · 사이드바 `calc-wizard-store.ts:396`·`transfer-per-asset-summary.ts:543`.

## 4. 회귀 영향 실측 (임시 적용 → 측정 → cp 원복·sha 확인)

18곳을 `safeMultiplyThenDivide(a, b, c)`로 바꾸고 `__tests__/tax-engine/ __tests__/api/ __tests__/lib/ __tests__/calc/`를 돌렸다.
- `tsc --noEmit` 0건 · vitest **32,333건 중 실패 0**(통과 32,011, 나머지 skip·todo).
- 해석: 기존 픽스처가 「이진으로 정확한」 조합(기준시가 백만 원 단위·비율 1/2 등)만 쓴다. 메모리 「전건 통과는 커버리지의 증거가 아니다」와 같은 상황 — **각 경로에 참값 정수 + 1원 과소가 나는 입력으로 새 anchor**를 세워야 한다(§5-3).

### 4.1 P6 머지 후 재측정 (master `95f1ed086`, 2026-10-21) — 1단계 18곳 + 인접 축 10곳 동시

1단계·인접 축 28곳을 한꺼번에 정확화하고, 옛 식과 새 식의 값이 갈리면 호출 위치를 기록하도록 계측한 뒤 `__tests__/` 전체를 돌렸다(원복 sha 확인).
- P6로 밀린 줄은 #1 하나뿐이다(`transfer-tax-split-acq-price.ts:213` → `:224`). 나머지 위치는 그대로다.
- `tsc` 0건 · vitest **38,594건 중 실패 0**(P6 anchor 포함 — P6 시드는 이 수정으로 값이 바뀌지 않는다).
- **값이 실제로 갈린 호출 16건** — 기존 테스트가 1원 과소 입력을 지나가지만 그 값을 단언하지 않는다:

| 지점 | 옛 값 → 정확 값 | 횟수 | 지나간 테스트 | 왜 안 잡혔나 |
|---|---|---|---|---|
| #8 PHD `transfer-tax-pre-housing-disclosure.ts:144`(토지 몫 안분) | 231,884,056 → 231,884,057 | 12 | `__tests__/api/transfer.route.split-part-carryover.regression-grid.test.ts`(P1 회귀 격자) | 격자는 결정세액만 비교한다 — 12셀 모두 **결정세액 불변**(1원이 세율 곱 절사에 흡수) |
| A5 겸용 취득 `transfer-tax-mixed-use-helpers.ts:183` | 473,249,999 → 473,250,000 | 2 | 겸용 헬퍼 `__tests__/tax-engine/_helpers/mixed-use-identity-std.ts`를 거치는 겸용 테스트 | 그 값을 단언하지 않는다 |
| A3 겸용주택 취득 `transfer-tax-mixed-use-housing.ts:415` | 132,413,792 → 132,413,793 | 1 | `__tests__/api/transfer.route.mixed-use-housing-std-proportional.s3-2.predo.anchor.test.ts` | 총액(환산취득가액)만 BigInt로 단언, 토지 몫은 단언 안 함 |
| #1 split 파트 환산 `transfer-tax-split-acq-price.ts:224` | 128,571,428 → 128,571,429 | 1 | (호출 스택에 테스트 파일이 안 잡힘 — route 비동기 경유) | — |

- 결론: 고치면 **취득가액·양도차익 표시값이 1원 달라지는 실제 사례가 기존 시드에도 있다.** 결정세액이 바뀐 셀은 없었다. Do에서는 위 네 경로에 1원 단위 단언을 더하는 것부터 한다.

## 5. 설계안 (권장)

1. **치환**: 18곳을 `safeMultiplyThenDivide(a, b, c)`로 바꾼다. 환산 의미인 곳(#1·#2)은 `calculateEstimatedAcquisitionPrice`로 — 저장소의 환산 정본 이름과 맞춘다(`lib/tax-engine/CLAUDE.md:61`). 비-정수 입력(지분 스케일 기준시가 등)은 헬퍼가 `floor(p / c)` 경로로 받으므로 동작이 같다.
2. **ESLint --fix 함정**: 새 import는 한 줄에 named 하나.
3. **anchor**: 경로마다 R·P 과소가 나는 입력 1건 이상 — #1 split 주택·split 건물·일반건물 파트·P6 이월과세 파트, #2 자산 전체 이월과세, #3~#17 PHD(본문·4분할), #18 다건 표시. 기대값은 BigInt 참값으로 손계산해 원 단위 `toBe()`.
4. **정적 가드**(`unit-price-area-policy.test.ts` 선례): `lib/tax-engine/**`에서 환산·안분 파일의 `Math.floor(… * (… / …))`와 가드 없는 `Math.floor(… * … / …)`를 금지 목록으로 0건 하드게이트. 대상 범위는 §6 Q2.
5. **뮤테이션**: 각 치환 지점을 원래 식으로 되돌리는 변형이 anchor에 잡히는지.

## 6. 사용자 결정

| Q | 쟁점 | 선택지 | 권장 |
|---|---|---|---|
| Q1 | 같은 모양의 **인접 축**(환산이 아니라 기준시가·면적 **비율 안분**) 포함 여부 — `transfer-tax-split-acq-price.ts:166`(`splitPair` 총액 × 토지 비율) · 겸용주택 `transfer-tax-mixed-use-commercial.ts:257`·`-housing.ts:308,415`·`-inheritance.ts:320`·`-helpers.ts:183`·`-housing-acq.ts:221` · 사이드바 지분 `calc-wizard-store.ts:405` | (a) 1단계(18곳)만 이 PR, 인접 축은 실측 후 별건 (b) 함께 | (a) — 비율 안분은 R 모양이지만 잔액 흡수(`total − land`)로 합계는 보존되고, 면적 비율은 소수 면적이 섞여 따로 실측해야 한다. 이 계획서는 환산 산식 18곳만 실측했다 |
| Q2 | 정적 가드 범위 | (a) 이번 18곳이 있는 5개 파일만 (b) `lib/tax-engine/**` 전체 | (a) — (b)는 Q1 인접 축·다른 세목(주식 `securities-transaction-tax.ts`·감면 등)의 기존 식을 한꺼번에 막아 이 PR이 커진다. 인접 축 별건에서 넓힌다 |
| Q3 | P6 PR과의 순서 | (a) P6 머지 후 착수 (b) 지금 병행 | (a) — #1 파일을 P6도 고친다(다른 줄이라 충돌 가능성은 낮다). P6 anchor 값이 이 수정으로 바뀌는지는 P6 머지 후 재측정(확인 필요 — §4 측정은 P6 없는 master 기준) |

## 6.1 확정 범위 — 인접 축 (2026-10-21 추가 실측)

Q1을 (b)로 정한 뒤 인접 축을 다시 전수했다. **지분 규약은 빼고** 기준시가·면적 비율 안분만 넣는다(사용자 확인).

- 🔴 **사이드바 지분 `calc-wizard-store.ts:405`는 범위에서 뺐다** — Q1 목록에 넣었으나 이것은 API·엔진의 지분 단일 규약 `applyRatio`(`tax-utils.ts:78-80` = `Math.floor(금액 × 지분비율)`, 호출 69곳)를 그대로 따라 한 것이다. 사이드바만 정확하게 바꾸면 엔진과 1원씩 어긋난다(`applyRatio` JSDoc 「실측 0.49% 1원 차」가 바로 그 사고). 지분 규약을 고치려면 분자·분모를 넘기도록 69곳을 함께 바꿔야 해서 **별건**(실측 필요)으로 둔다.
- 정본 헬퍼가 이미 있다: `apportionByStdPrice(total, land, building)`(`lib/tax-engine/std-price-apportion.ts:20-24` — `safeMultiplyThenDivide` + 잔액 흡수). 양도가액 안분 정본 `resolveSaleApportionBasis`도 이것을 쓴다.

| # | 파일:줄 | 무엇 | 바꿀 식 |
|---|---|---|---|
| A1 | `transfer-tax-split-acq-price.ts:166` `splitPair` | 취득가액(실가·감정·매매사례 총액)을 취득시 기준시가 비율로 토지·건물 안분 | `calcApportionRatio`가 비율 대신 기준시가 쌍을 넘기게 바꾸고 `apportionByStdPrice` — 서명 변경이라 측정 하네스에는 넣지 못했다(Do에서 anchor로 확인) |
| A2 | `transfer-tax-mixed-use-commercial.ts:243` · `:257` | 겸용 상가분 양도가액(양도시 비율)·환산취득가액(취득시 비율) 토지·건물 안분 | `apportionByStdPrice` |
| A3 | `transfer-tax-mixed-use-housing.ts:406` · `:415` | 겸용 주택분 같은 안분 | 〃 |
| A4 | `transfer-tax-mixed-use-inheritance.ts:320` | 겸용 상속 PHD 환산취득가액 토지·건물 안분 | 〃 |
| A5 | `transfer-tax-mixed-use-helpers.ts:127` · `:183` | 겸용 주택·상가 양도가액·취득가액 안분 | 〃 |
| A6 | `lib/stores/calc-wizard-store.ts:469` | A5 `:127`의 사이드바 거울 | 〃(엔진과 같이 바꿔야 사이드바가 엔진과 같다) |
| B1 | `transfer-tax-mixed-use-housing.ts:308` · `transfer-tax-mixed-use-housing-acq.ts:221` | 용도변경(상가→주택) 취득시 상가 기준시가를 **면적 비율**로 안분 | 면적을 0.01㎡ 정수로 올려 `safeMultiplyThenDivide`(면적 정책 `area-utils.ts`의 `round2` 규약과 같은 단위) |

실측:
- 기준시가 비율 안분(R 모양): 참값 정수 표본 274,894건 중 10,978건(**4.0%**) 1원 과소.
- 면적 비율 안분: 무작위 100만 표본 0건이지만 참값 정수 표본 50만 건 중 83,735건(**16.7%**) 1원 과소 — 소수 면적을 두 번 나누어 오차가 쌓인다. 예: 1,905,052,470 × 183.98 ÷ 547.98 → 639,606,469(참값 …470).
- 회귀: A2~A6·B1(10곳)을 임시 정확화하고 `tax-engine·api·lib·calc·stores·components`를 돌렸다 — `tsc` 0건 · **37,503건 중 실패 0**(원복 sha 확인). 1단계와 같이 기존 픽스처는 이 조합을 쓰지 않는다 → 경로마다 새 anchor.
- B1 경로는 살아 있다: `partialUsageChange`는 ④ `transfer-tax-api-mixed-use.ts:396`·⑫ `transfer-tax-schema-mixed-use.ts:97`로 전달된다(메모리 「`partialUsageChange` 삭제 금지」).

정적 가드(Q2 (a))는 이 PR에서 고치는 파일(1단계 5개 + 인접 축 7개)에 건다.

## 7. 범위 밖 (관찰만)

- **지분 규약 `applyRatio`(69곳)** — 위 §6.1. 별건.

- 다른 세목의 비슷한 식: `transfer-tax-aggregate-reduction-step.ts:730`(감면 한도 안분, R) · `lib/calc/inheritance-deduction-suggest.ts:453`(R) · 주식 `stock-valuation-post-listing.ts:577`·`lot-allocation-tax.ts:154`(P) — 환산이 아니라 이 계획서에서 실측하지 않았다.
- `Math.floor(p / c)`가 곱 ≤ 2^53에서 과대로 반올림되는 경우는 18표본 경계 탐색에서 0이었다(곱 상한이 몫의 ulp를 1/c 이하로 묶는다) — 정본 헬퍼는 안전하다고 판단했다.
