# 지분 규약 `applyRatio` 부동소수 1원 과소 — 수정 계획서

**작성**: 2026-10-21 · **base**: master `bafdddeb8` · **선행**: 환산취득가액·비율 안분 1원 과소 #2360(`docs/00-pm/estimated-acquisition-float-precision.plan.md` §6.1·§7에서 별건으로 분리)
**상태**: ✅ Plan 확정 (2026-10-21 사용자 결정 — Q1 (a) `applyRatio` 내부 정확화 · Q2 (a) 채무비율 별건 · Q3 (a) 거울 9곳 통일 · Q4 (a) 10자리 경계) → Do
**실측 원자료**: 세션 scratchpad `shr/`(probe1~4.mjs · measure*.py · hits*.log) — 세션이 끝나면 지워진다.

---

## 1. 요약

양도세 지분 적용의 단일 규약 `applyRatio(amount, ratio)`(`lib/tax-engine/tax-utils.ts:78-80`)는 `Math.floor(amount × ratio)`다. `ratio`는 부동소수라서 **특정 지분율에서 1원 과소**가 난다(과대는 0건).

- 지분 입력은 **백분율 한 칸**이다(`components/calc/transfer/OwnershipRatioInput.tsx:3-8` — 분자 = 입력 %, 분모 = "100"). 그래서 실제 지분은 항상 **유한 소수**(`P/100`)다.
- 오차는 지분율마다 다르다. 정수 % 전체로는 0.04%지만 **70%는 1.51%, 35%는 0.73%, 57%는 0.48%** 확률로 1원 과소. 30%·55%·12.5%·33.3333%는 0.
- 기존 테스트 3만 8천여 건은 이런 지분율을 쓰지 않는다 — 실행 중 관찰한 `applyRatio` 호출에서 정확값과 갈린 건이 **0건**이었다(§4). 새 anchor 없이는 회귀를 막을 수 없다.

## 2. 원인

- `Math.floor(x × 0.7)`: `0.7`의 이진 표현은 0.69999…라서 참값이 정수인 `x × 7/10`에서 1이 깎인다.
  - 예: 1,518,341,200 × 70% → **1,062,838,839**(참값 1,062,838,840).
- 같은 부류의 선례: 「단가 × 면적」(`multiplyByArea`) · `applyFairMarketRatio`(0.70) · 환산취득가액 #2360.
- `applyRatio` JSDoc이 이미 「순서·절사가 갈리면 사이드바 미리보기와 엔진 결과가 어긋난다(실측 0.49% 1원 차)」고 적었다 — **규약을 한 곳에 모은 것은 맞고, 그 한 곳의 식이 부정확**한 것이다.

## 3. 실측

### 3.1 지분율별 과소 확률 (금액 10만~50억 무작위, 과대 0건)

| 입력 모델 | 과소율 | 비고 |
|---|---|---|
| 정수 %(1~99) | 0.038% | 70% 1.51% · 35% 0.73% · 57% 0.48% |
| 소수 1자리 % | 0.019% | 예 90.6% |
| 소수 2자리 % | 0.019% | 예 58.12% |
| 소수 4자리 % | 0% | 33.3333%·66.6667% 등 |
| 레거시 분자/분모(분모 ≤ 100 기약분수 3,043개) | 0.060% | 321개 분수에서 발생(10.5%) — 최악 6/11 3.7% · 3/11 3.6% · 15/26 2.5%. **1/3·2/3·1/7은 0%** |

### 3.2 정본 후보로 계산하면

- **십진 정확 계산**(`String(ratio)`의 소수 자릿수로 정수화해 BigInt): 백분율 입력은 항상 유한 소수라 오차 0. `area-utils.ts`의 `floorProduct`·`decompose`(`:91-127`)가 이미 같은 방식이다(`multiplyByAreaShare`).
- ⚠️ 그 방식은 **순환 소수에서 오히려 틀린다**: 1/3 → `String`은 0.3333333333333333(16자리) → 안전정수 한계로 15자리까지 → `floor(x × 333…333 / 10^15)` → 참값이 정수이면 **1 과소**. 실측: `multiplyByAreaShare(3,000,000, 100, 1/3)` = **99,999,999**(참값 100,000,000). 현재 float 식은 1/3에서 맞는다.
  - 종부세 토지 지분(`comprehensive-api.ts:397` — `%/100`)과 비사업용 토지 자동조회는 백분율 입력이라 현재 경로에서는 순환 소수가 들어오지 않는다(관찰만).

### 3.3 기존 테스트 관찰 계측 (동작 불변, master `bafdddeb8`)

`applyRatio`에 「십진 정확값과 다르면 기록, 8자리를 넘는 소수 비율이면 따로 기록」만 넣고 `__tests__/` 전체를 돌렸다(원복 sha 확인).
- 정확값과 **갈린 호출 0건**.
- 8자리 넘는 비율 호출 **67건, 전부 1/3**(0.3333333333333333) — 레거시 분자/분모 픽스처. 현재 식으로 67건 모두 정확했다.
  - 위치: 개산공제 base(`tax-utils.ts:119` `computeLumpSumDeductionBase`) 19 · 부담부증여 평가(`burdened-gift-valuation.ts:75-97`) 36 · 일반건물 지분(`general-building-fractional.ts:138`·`transfer-tax-api-gb-shares.ts:125`) 3 · 겸용 양도가 안분(`transfer-tax-api-mixed-use-sale-split.ts:40`) 2 · 그 밖 7(sec164 브리지·`transfer-tax-api.ts:285` 등).
- ⚠️ 첫 계측 실행에서 3건이 실패했으나 같은 계측으로 다시 돌리자 **0건**이었다 — 스택 수집으로 느려진 시간 초과로 보인다(동작은 바꾸지 않았다). 실패 테스트 이름은 첫 실행에서 남기지 못했다.

## 4. 범위 — 무엇이 이 규약을 쓰나

| 축 | 위치 | 비율의 정체 |
|---|---|---|
| **S 지분**(주) | `applyRatio` 호출 69곳 중 축 D 4곳을 뺀 지분: `lib/calc/transfer-tax-api*.ts`(companion-payload 9 · api 7 · multi 7 · gb-shares 3 · bundled 3 · parcels 2 · mixed-use 2 · mixed-use-sale-split 2 · inheritance 2 · asset-basics 2 · split·redev·gb-carryover·carryover·burdened-gift 각 1) · `sec164` 브리지 2 · `transfer-tax-validate*.ts` 2 · `components/calc/transfer/BurdenedGiftBlock.tsx:499` · `app/api/calc/transfer/general-building-fractional.ts:138` · 엔진 `tax-utils.ts:119`·`burdened-gift-valuation.ts:75-97`·`inheritance-acquisition-helpers.ts:303-315` | `getOwnershipRatio` = `parseFloat(분자)/parseFloat(분모)`(`transfer-tax-api-asset-basics.ts:136-141`) · 엔진 `ownershipRatio` 와이어 필드(⑫ `transfer-tax-schema-base-shape.ts:359`) |
| **S′ 지분 직접 곱**(같은 값의 거울) | `lib/stores/transfer-per-asset-summary.ts:202·400·429·558·564` · `lib/stores/calc-wizard-store.ts:405` · `components/calc/results/transfer/FilingFormTableHelpers.ts:224·233·498` | `applyRatio`를 안 거치고 `Math.floor(x × ratio)` — 같은 식이라 지금은 엔진과 같은 값이지만, `applyRatio`만 고치면 **1원씩 어긋난다** |
| **D 채무비율** | `lib/tax-engine/redevelopment-burdened-gift.ts:94-98`(`applyRatio(…, debtRatio)`) · `redevelopment-split.ts:238`(지분 × 채무비율 곱) | `debtRatio = 채무 ÷ 증여가액`(`burdened-gift-valuation.ts:321`) — **순환 소수가 정상**이고 엔진 입력(`rawInput.debtRatio`)으로 소수 그대로 들어온다 |

## 5. 설계안

1. **`applyRatio` 내부 정확화(서명 불변)**: 비율의 십진 표현이 짧은(예: ≤ 10자리) 유한 소수면 BigInt로 `floor(amount × N / 10^k)`, 그보다 길면(순환 소수 — 레거시 1/3·채무비율) **현행 float 식 유지**. 백분율 입력은 언제나 앞 갈래다. 69곳·와이어·14지점 변경 없음.
2. **S′ 거울 9곳을 `applyRatio`로**: 사이드바·신고서 표시가 엔진과 같은 값을 쓰게 한다(안 하면 1원 어긋남이 새로 생긴다).
3. **anchor**: 70%·35%·57%·90.6%·58.12% 등 실측 사례를 경로별(API 양도가·취득가·필요경비, 개산공제 base, 부담부증여 평가, 일반건물 지분, 사이드바·신고서 거울)로 1원 단언. 레거시 1/3 회귀(현행 값 유지) 단언. 결정세액이 바뀌는 사례를 쌍대 실행으로 찾아 1건 이상 고정.
4. **정적 가드**: S′ 위치 파일에서 `Math.floor(… * ratio|ownRatio|ownershipRatio)` 금지(이번 #2360 가드와 같은 방식).
5. **뮤테이션**: `applyRatio` 내부 갈래·S′ 9곳 각각.

## 6. 사용자 결정

| Q | 쟁점 | 선택지 | 권장 |
|---|---|---|---|
| Q1 | 고치는 방식 | (a) `applyRatio` 내부만 정확화 — 짧은 유한 소수는 BigInt, 긴 소수는 현행(서명·와이어 불변) (b) 지분을 분자·분모 유리수로 끝까지 전달(69곳 서명 + 엔진 와이어 `ownershipRatio` → 분자·분모, 14지점 동기화) | (a) — 실제 입력(백분율)은 (a)로 오차 0. (b)가 추가로 고치는 것은 레거시 분자/분모 이력(분모 ≠ 100)뿐이고, 그 중 실측 테스트에 나온 1/3은 이미 정확하다 |
| Q2 | 채무비율(축 D) | (a) 별건 — 채무·증여가액을 분자·분모로 넘기는 와이어 변경이 필요 (b) 이 PR에 포함 | (a) — 순환 소수가 정상인 축이라 Q1(a)로는 고쳐지지 않고, 재개발 부담부증여 엔진 와이어(`debtRatio`)를 바꿔야 한다. 별도 실측 필요 |
| Q3 | 지분 직접 곱 거울(축 S′ 9곳) | (a) 이 PR에서 `applyRatio`로 통일 (b) 그대로 | (a) — 안 바꾸면 `applyRatio`만 정확해져 사이드바·신고서가 엔진과 1원씩 어긋난다 |
| Q4 | 「짧은 유한 소수」 경계 | (a) 10자리 이하 (b) 안전정수 한계까지(최대 15자리) | (a) — 백분율 입력은 소수 4자리 ÷ 100 = 6자리 안팎이다. (b)는 1/3(16자리)이 15자리로 잘려 들어와 오히려 1 과소가 된다(§3.2) |

## 7. 범위 밖 (관찰만)

- `multiplyByAreaShare`에 순환 소수 지분이 들어오면 1 과소(§3.2) — 현재 호출부는 모두 백분율 입력이라 도달하지 않는다.
- 다른 세목의 비율 곱: `property-taxpayer.ts:348`(재산세 지분 세액) · `inheritance-corporate-exemption.ts:188` — 이 계획서에서 실측하지 않았다.
- 비사업용 토지 공유 면적 `non-business-land/co-ownership.ts:35-37`(면적 × 지분, 절사 없음) — 금액이 아니다.
