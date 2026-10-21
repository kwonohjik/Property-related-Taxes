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

---

## 9. Do 결과 (2026-10-21)

**변경**: `applyRatio` 내부 정확화(서명 불변) + 거울 S′ 9곳 `applyRatio` 통일 + 정적 가드. 파일 4개(소스) + 가드 갱신 1개 + 신규 테스트 4개.

### 9.1 계획서와 달라진 점 — 십진 판정 방식 (실측으로 정정)

§5-1·§6 Q1·Q4는 「`String(ratio)`의 소수 자릿수 ≤ 10」으로 판정한다고 적었다. **그 가정이 틀렸다.** 화면 지분은 `parseFloat(P) / parseFloat("100")`이라
`P`의 이진 오차와 나눗셈 반올림이 겹쳐 짧은 소수가 **긴 문자열**로 나온다.

| 입력 | `String(parseFloat(P)/100)` |
|---|---|
| 90.6% | `0.9059999999999999` (16자리) |
| 1.1% | `0.011000000000000001` (18자리) |

소수 1자리 %의 26%(259/990) · 2자리 %의 28%(2,735/9,900) · 4자리 %의 28%(272,775/990,000)가 10자리를 넘는다. `String` 판정이면 이 비율이 전부
옛 식으로 떨어져, 계획서가 고친다고 적은 **90.6%·58.12%가 고쳐지지 않는다**(anchor가 먼저 잡았다).

⇒ 판정을 «`round(ratio × 10^k) / 10^k`가 ratio와 상대 4.5e-16(≈2ulp) 이내인 k ≤ 10이 있는가»로 바꿨다(`decimalizeRatio`). Q1 (a)의 의도(짧은 유한 소수는 정확, 순환 소수는 현행 float)와 Q4 (a)의 10자리 경계는 그대로다.
- 백분율 입력 전수(정수 % 100 · 1자리 1,000 · 2자리 10,000 · 3자리 100,000 · 4자리 1,000,000 = 1,111,100개): 십진화 실패 0 · 오십진화 0 (probe 6).
- 오판 방지: 기약분수(분모 ≤ 1000) 중 비유한 소수인데 십진화되는 것 0건 — 1/3 같은 순환 소수는 어느 k에서도 맞지 않는다(최소 간격 ≈ 3e-11 ≫ 허용 오차).

### 9.2 결과

- anchor 43건(신규 4파일) — **수정 전 27건 실패**(엔진 13 · API/사이드바/신고서 10 · 일반건물 route 2 · 정적 가드 2), 수정 후 전건 통과.
- **결정세액이 바뀌는 사례**: 70% 지분 단건 토지, 양도가 170,000,000 · 취득가 100,000,000, 양도일 2026-02-16(보유 1년 8개월) —
  양도차익 48,999,999 → **49,000,000** · 결정세액 18,599,999 → **18,600,000** · 지방소득세 1,859,999 → 1,860,000 · 총 20,459,998 → **20,460,000**.
- 거울 9곳: `transfer-per-asset-summary.ts` 202·400·429·558·564, `calc-wizard-store.ts` 405, `FilingFormTableHelpers.ts` 224·233·498 — 9곳 모두 `ownershipRatioOf`/`getOwnershipRatio`와 같은 `n/d`(`n<d`, `d>0`)임을 확인했다.
- 뮤테이션: `applyRatio` 내부 8종(경계 10→15·10→9, 새 갈래 제거, 안전정수 판정 제거, 음수 보정 제거, 허용 오차 0·과대, round→floor) + 거울 9곳 되돌리기 9종 = **17/17 KILLED**. 정적 가드 단독으로도 거울 9곳 되돌리기 **9/9 KILLED**.
  (`Number.isFinite(ratio)`·`Number.isSafeInteger(n)` 가드를 제거한 변형 2종은 생존해 — NaN/∞는 비교식이 NaN이라 자연히 null, 거대 비율은 단일 반올림이라 값이 같다 — 두 가드를 **삭제**하고 NaN·±∞·1e300 단위 테스트로 고정했다.)
- 기존 테스트 관찰 계측(동작 불변 `__fp` 방식, 수정 후 `applyRatio`가 옛 식과 다른 값을 내면 기록): 전체 3,222파일 통과, **기존 호출 중 값이 바뀐 것 0건**(바뀐 7,876건은 전부 신규 anchor 파일의 의도된 호출).
  → 기존 기대값 수정 없음.

### 9.3 채무비율(축 D, Q2 (a) 별건) 실측

`applyRatio` 내부 변경은 채무비율 호출(`redevelopment-burdened-gift.ts:94-98` · `transfer-tax-api-burdened-gift.ts:283` · `redevelopment-split.ts:238`의 `지분 × 채무비율` → `computeLumpSumDeductionBase`)에도 적용된다.
- 기존 테스트의 채무비율 호출 310건: 전부 짧은 유한 소수(0.4 ×199 · 0.6 ×48 · 0.25 ×44 · 0.5 ×15 · 0.8 ×4) → 십진 갈래, **값 변화 0건**.
- 임의 B/C(정수 쌍, 분모 1천만~50억 20만 쌍): 십진 갈래 1건(0.001%) — 거의 전부 ≥ 11자리 순환 소수라 **현행 float 갈래**(동작 불변). 지분 × 채무비율 곱 10만 쌍: 십진 갈래 0건.
- 짧은 유한 소수 채무비율(3/5 · 1/4 · 2/5 · 1/5 · 7/10 · 3/20 · 1/8) 14만 표본: 옛 식 1원 과소 297건(0.21%) → 새 식 **전건 참값**(개선). 순환 소수 채무비율의 1원 과소는 이 PR로 안 고쳐진다(별건 유지).

### 9.4 확인 필요 (이 PR이 건드리지 않은 것)

- 같은 모양 `Math.floor(금액 × 지분)`이 **Q3의 9곳 밖 화면 안내 2곳**에 남아 있다: `components/calc/transfer/CompanionSaleModeBlock.tsx:197` · `components/calc/transfer/asset-sections/AssetSectionExpense.tsx:89`. 표시 전용이지만 70% 등에서 입력 카드 안내 금액이 엔진 값과 1원 어긋난다. 고치려면 가드 `GUARDED_FILES`에 두 파일을 더한다.
- 그 밖 비율 곱(범위 밖 §7)은 그대로: `property-tax-comprehensive-aggregate.ts:555` · `new-housing-reduction.ts:398` · `mixed-use-part-cards.ts:121·122·167~169`(NBL 비율) · `transfer-tax-mixed-use-helpers.ts:376` 등.
- E2E(Playwright)·브라우저 수동 확인은 수행하지 않았다(단위·통합·route 호출까지만).

