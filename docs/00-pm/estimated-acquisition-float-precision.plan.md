# 환산취득가액 산식 부동소수 1원 과소 — 수정 계획서

**작성**: 2026-10-21 · **base**: master `4340b7985` · **출처**: P6(주택 split 파트 이월과세 환산) 엔진 Do 중 발견한 별건 후보
**상태**: 🟡 Plan — 사용자 결정 대기(§6)
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

## 7. 범위 밖 (관찰만)

- 다른 세목의 비슷한 식: `transfer-tax-aggregate-reduction-step.ts:730`(감면 한도 안분, R) · `lib/calc/inheritance-deduction-suggest.ts:453`(R) · 주식 `stock-valuation-post-listing.ts:577`·`lot-allocation-tax.ts:154`(P) — 환산이 아니라 이 계획서에서 실측하지 않았다.
- `Math.floor(p / c)`가 곱 ≤ 2^53에서 과대로 반올림되는 경우는 18표본 경계 탐색에서 0이었다(곱 상한이 몫의 ulp를 1/c 이하로 묶는다) — 정본 헬퍼는 안전하다고 판단했다.
