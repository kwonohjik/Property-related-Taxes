# 부담부증여 채무비율(B/C) 부동소수 1원 과소 — 수정 계획서

**작성**: 2026-10-21 · **base**: master `f204df8f2` · **선행**: 지분 규약 `applyRatio` #2368(`docs/00-pm/share-ratio-apply-float-precision.plan.md` §4 축 D·§6 Q2·§9.3에서 「채무비율은 별건」으로 분리)
**상태**: ✅ Plan 확정 (2026-10-21 사용자 결정 — Q1 (b) 부동산 PR-1 + 주식 S-1 PR-2 · Q2 (a) 순차 floor · Q3 (a) `debtFraction` 교체 · Q4 (a) 기존 가드 재현 · Q5 (a) 한계 문서화) → Do
**실측 원자료**: 세션 scratchpad `plan3-b/`(p1~p6.mts · redev.pair.test.ts · observe.setup.ts · out.log · observe.log) — 세션이 끝나면 지워진다. 제품 파일은 한 줄도 바꾸지 않았다(probe는 전부 scratch의 복사·mock).

---

## 1. 요약

소득세법 시행령 §159①1호·2호는 부담부증여 양도로 보는 부분을 **`A × B/C`**(A 평가가액·취득가액, B 채무액, C 증여가액)로 계산하라고 한다
(현행 MST 290841, 시행 2026-10-01 — KoreanLaw MCP 본문 확인. 절사 규정은 없고 이 저장소 규약은 floor).

- **정본 경로는 이미 정확하다.** 단건·컴패니언·겸용 부담부증여의 양도가액·취득가액·개산공제·실비·이월과세 증여세 안분은 전부 정수 `safeMultiplyThenDivide(A, B, C)`다(§4 표 E).
  채무비율 `debtRatio = B/C`는 거기서 **표시용 echo**일 뿐이다.
- **소수 비율 `debtRatio`를 곱하는 경로가 5곳** 남아 있다(§4 표 F):
  1. 재개발·재건축 완공 아파트/입주권 × 부담부증여 β 스케일 — `redevelopment-burdened-gift.ts:94-98` (`applyRatio(×, debtRatio)` 4항)
  2. 같은 경로의 §163⑥ 개산공제 base — `redevelopment-split.ts:236-248` (`지분 × debtRatio` 곱비율)
  3. 주식 부담부증여 ④(클라이언트) — `lib/calc/gift-burdened-transfer-api.ts:653` (`Math.floor(취득가 × debtRatio)`, **`applyRatio`조차 안 거침**)
  4. 주식 부담부증여 엔진 — `lib/tax-engine/stock-transfer/stock-acquisition-basis.ts:410` (`Math.floor(estimatedBase × burdenedGiftDebtRatio)`, 와이어 필드)
  5. (표시) 사이드바·결과 카드 — 곱셈이 아니라 `toFixed(4)`/echo라 대상 아님
- **양도세(부동산) 와이어는 `debtRatio`를 싣지 않는다.** UI는 채무·평가 원값(정수)을 보내고 엔진이 `computeDebtRatio`로 B/C를 만든다(§5).
  ⇒ 1·2번은 **엔진 내부에서 B·C 원값이 이미 있다** — 와이어·14지점 변경 없이 정확화 가능(설계안 a).
  3·4번(주식)은 와이어에 비율 하나뿐이라 완전 정확화는 와이어 변경이 필요하다(설계안 b) — 별도 PR로 분리 권장.
- 실측 빈도는 낮다(§6): 재개발 β는 **둥근 금액 0.03~0.10%**, 순환 소수 비율에서만. 그러나 결정세액이 실제로 바뀐다(산출세액 6,482,232 → 6,482,233).
  주식 ④는 B/C가 **정수 %** 일 때 **2.4%**(= 이전 PR이 고친 70% 부류가 이 경로엔 그대로 남아 있음).

## 2. 원인

`debtRatio = assumedDebtAmount / giftValuation.max`(`burdened-gift-valuation.ts:321`)는 정수/정수의 부동소수 몫이다.
- **순환 소수**(예 B/C = 14/110): `applyRatio`(#2368)는 11자리 이상 비율을 옛 식 `Math.floor(amount × ratio)`로 넘긴다(순환 소수를 십진화하면 오히려 틀리기 때문 — 선행 §3.2). 참값이 정수인 곱(`X × 14 / 110`이 딱 떨어지는 둥근 금액)에서 1원 과소.
  - 예: 660,000,000 × (140,000,000 / 1,100,000,000) → float 83,999,999 / 참값 84,000,000.
- **짧은 소수 비율**(정수 % 등)은 `applyRatio`를 거치면 이미 정확하다(실측 §6.1: 짧은 소수 유래 과소 0건). **`applyRatio`를 안 거치는 주식 두 곳은 70%류 과소가 그대로**다.
- 근본 해법은 `applyRatio`로 비율을 더 잘 추측하는 것이 아니라 **B·C를 정수 그대로 `safeMultiplyThenDivide`에 넘기는 것**이다 — 정본 §159 경로가 이미 그렇게 한다. 엔진 내부 경로(1·2번)는 그 원값이 손에 있다.

## 3. 법령 근거 (인용 확인)

- 「소득세법 시행령」 §159①1호(취득가액 = A × B/C)·2호(양도가액 = A × B/C), B 채무액·C 증여가액 — **KoreanLaw MCP `get_law_text(mst=290841, 제159조)` 본문 확인(2026-10-21, 시행 2026-10-01)**. 상수: `lib/tax-engine/legal-codes/burdened-gift.ts` `VALUATION_159_1_ACQ`·`VALUATION_159_1_TRANSFER`.
- 산식이 **분수 `A × B/C`로 명시**되므로 정수 분자·분모 곱셈 후 나눗셈이 문언에 가장 가깝다(비율을 소수로 먼저 만드는 것이 문언에서 더 멀다).
- 재개발 β(`평가액·청산금·필요경비 × r`)는 §159와 §166의 결합에 **명문 규정이 없어** 저장소가 정한 안분이다(`redevelopment-burdened-gift.ts` 헤더 · `detectRedevelopmentBurdenedGiftNotice` 고지). 이 계획은 그 **정책을 바꾸지 않고** 곱셈의 정확도만 고친다.
- §166③·§163⑥ 본문은 이번에 다시 조회하지 않았다 — 변경 대상이 산식이 아니라 연산 방식이기 때문(확인 필요 아님, 범위 밖).

## 4. 경로 전수 조사 (B/C 사용처, file:line)

### 표 E — 이미 정확 (정수 `safeMultiplyThenDivide`, 변경 없음)

| 위치 | 하는 일 |
|---|---|
| `burdened-gift-valuation.ts:335-341` `apportionTransferPrice` · `:357-363` `apportionAcquisitionPrice` | `safeMultiplyThenDivide(A, B, C)` — 정본 헬퍼 |
| `burdened-gift-apportionment.ts:177`(기준시가 모드 토지 양도가, 건물은 `B − 토지` 잔액 흡수) · `:185-192`(시가 모드) | 양도가액 §159①2호 |
| `:298-299` · `:316-317` · `:351-352` · `:376-377` | 취득가액 §159①1호 (K-1~3 · K-4 · K-6/7 · legacy) |
| `:385-387` `necessaryExpenseDebtTotal` · `:454-455` 개산공제 base | 실비·개산공제 base `× B/C` |
| `:538-540` 이월과세 증여세 상당액 안분 | `apportionAcquisitionPrice` |
| `transfer-tax-burdened-gift-step.ts:137-141` 증축 감정가액 가산세 base | `apportionAcquisitionPrice` |
| `mixed-use-burdened-gift.ts:92` · `:202` · `mixed-use-burdened-gift-prepare.ts:334` | 겸용 4부분 `x × num/den` |
| `lib/calc/transfer-tax-api-burdened-gift.ts:557` | 컴패니언 `Bᵢ = B × Aᵢ/ΣA`(잔액 흡수) |
| `app/api/calc/transfer/bundled-apportionment.ts:202-203` | 전 자산 부담부증여 묶음 `Bᵢ` 합 |

### 표 F — 소수 비율을 곱한다 (이 계획의 대상)

| # | 위치 | 식 | 비율의 정체 | 현재 정확도 |
|---|---|---|---|---|
| F1 | `redevelopment-burdened-gift.ts:94-98` | `applyRatio(rightsValue·settlementAmount·preApprovalExpenses·postApprovalExpenses, debtRatio)` | 엔진 내부 `breakdown.debtRatio`(B/C 소수) — 호출 `transfer-tax-redevelopment-steps.ts:93` → `redevelopment.ts:88-91` | 짧은 소수 정확 · **순환 소수 1원 과소**(§6.2) |
| F2 | `redevelopment-split.ts:236-248` | `lumpBaseRatio = (ownershipRatio ?? 1) × debtRatio` → `computeEstimatedDeduction(numerator, rate, lumpBaseRatio)` · `computeLumpSumDeductionBase`(echo) | 두 소수의 **곱** — 곱 자체가 반올림을 한 번 더 한다 | 순환/곱 비율 과소(§6.3) · K-5 완공 아파트(`redevSec166Conversion`)만 도달 |
| F3 | `lib/calc/gift-burdened-transfer-api.ts:653` | `Math.floor(actualAcquisitionPrice × debtRatio)` → `Math.floor(÷ shareCount)` | ④의 `assumedDebtForGift / valuationAmount`(`:535`) — 원값 두 개가 같은 함수에 있다 | **`applyRatio`도 안 거침** — 정수 %에서 2.4%(§6.4) |
| F4 | `stock-transfer/stock-acquisition-basis.ts:410` | `Math.floor(estimatedBase × burdenedGiftDebtRatio)` | **와이어 필드**(⑫ `stock-transfer-tax-schema.ts:421` · ⑬ `gift-burdened-transfer-api.ts:670` · ⑭ `stock-transfer-engine-input.ts:168`) — B(=`transferTotalPrice`)는 같은 본문에 있으나 C는 없음 | 동일(`applyRatio` 미경유) |

### 표 D — 표시 전용 (대상 아님, 곱셈 없음)

`lib/stores/calc-wizard-store.ts:515`(사이드바 간이 B/C — 근사값, 곱 없음) · `BurdenedGiftDetailCard.tsx:183-318`·`transfer-tax-burdened-gift-step.ts:227`(`toFixed(4)`) · `mixed-use-burdened-gift.ts:249-250`(`housingRatio` echo).
`debtRatio` echo 필드(`burdened-gift-apportionment.ts:617`, 타입 `transfer-burdened-gift.types.ts:406`)는 **그대로 둔다** — 표시·검증 호환.

### 범위 밖 확인 (채무비율 없음)

취득세 부담부증여(`acquisition-tax-burdened.ts`)는 유상분(채무액)·무상분(잔액)을 **뺄셈**으로 나누고 비율 곱이 없다. 증여세 `gift-tax.ts:126-139`는 채무 합산 뺄셈. §159② 과세/비과세 혼합 채무 안분(`A × B/C`)은 `transfer-tax-api-burdened-gift.ts:557` 표 E.

## 5. 와이어 추적 (14지점 관점)

양도세(부동산) 부담부증여 `debtRatio`는 **엔진이 만든다 — 와이어에 없다**:

| 지점 | 내용 |
|---|---|
| ①~③ 폼 | 채무·보증금·설정액·임대료 원값(문자열 금액) — 비율 입력 칸 없음 |
| ④ `lib/calc/transfer-tax-api-burdened-gift.ts` `buildBurdenedGiftInfo` | `lendingDepositTotal`·`mortgageDebtAmount`·`assumedDebtOverride`(컴패니언 Bᵢ) 등 **정수 원값** + 축 B 지분 시 `d(v)=applyRatio(v, 지분)`(지분 축, 선행 PR 범위) |
| ⑫ `lib/api/transfer-tax-burdened-gift-schema.ts` | 전부 `z.number().int().nonnegative()` — **`debtRatio` 필드 없음**(grep 0건) |
| ⑭ `app/api/calc/transfer/engine-input.ts:495` | `burdenedGiftInfo` 통과 |
| 엔진 | `buildBurdenedGiftBreakdown`이 B(`assumedDebtAmount`)·C(`giftValuation.max`)를 확정 → `debtRatio` 파생 → F1/F2에 전달 |

⇒ **F1·F2는 엔진 입력 변경 없이** `breakdown.assumedDebtAmount`·`breakdown.giftValuation.max`(둘 다 이미 `TransferBurdenedGiftBreakdown` 필드)를 넘기면 된다. UI·Zod·route·validate 무변경.

주식 부담부증여(F3/F4)는 증여세 폼 ④(`buildGiftStockBurdenedTransferBody`)가 `burdenedGiftDebtRatio` **소수 하나**만 와이어에 싣는다(`:670`) — 엔진은 C를 모른다. B는 `transferTotalPrice`(=`assumedDebtForGift`, `:121`)로 같은 body에 이미 있다.

## 6. 실측 (throwaway probe, 제품 파일 무변경)

모두 BigInt 참값 `floor(X × B / C)` 대비. 실행은 `npx tsx`로 **실제 `tax-utils.ts`를 import**했다(복사본 아님). PRNG 고정 시드.

### 6.1 F1 — 현행 `applyRatio(X, B/C)` vs 참값 (40만 쌍/모델)

| 입력 모델 | 현행 과소 | 옛 식(`Math.floor`) 과소 | 비고 |
|---|---|---|---|
| X·B·C 모두 백만 단위 | **139** (0.035%) | 229 | 과소분 **전부 순환 소수**(짧은 소수 유래 0) |
| X·B·C 천만 단위 | **414** (0.10%) | 774 | 〃 |
| X·B·C 만원 단위 | 5 | 7 | |
| X 원 단위 임의 · B·C 만원 | 0 | 0 | 참값이 정수인 곱이 드물어 숨는다 |
| C 천만·B 백만, X 임의 | 62 | 76 | |
| 짧은 소수(B/C = 정수 %·1~4자리 %) | **0** | 242 · 16 | `applyRatio` 이후 정확 — #2368 효과 |
| B·C 완전 임의(C~5e10) | 과소 0 · **과대 3** | 과대 3 | 과대는 float 갈래, X ≥ 1e10에서만 |

예: X=12,710,000,000 · B=1,890,000,000 · C=3,100,000,000 → 현행 7,748,999,999 / 참값 7,749,000,000.
- **과대**(오른쪽 1원)도 난다: X=48,542,119,872 · B=13,558,401,028 · C=16,349,167,519 → 40,256,088,098 / 참값 …097. 순환 소수 float 곱의 양방향 오차다. (실무 규모 밖이지만 「과소만 난다」는 선행 결론을 이 축에서는 쓰지 말 것.)
- **오십진화**(십진 갈래로 잘못 들어가는 순환 소수): C∈[1e8,5e9] 200만 중 3건, [1e9,1e11] 12건, [1e10,1e12] 11건 — 그 표본에서 값이 틀린 것 **0건**(최대 ±1 가능성만 남음).

### 6.2 F1 결정세액이 바뀌는 쌍대 실행 (엔진 풀 파이프라인)

`__tests__/tax-engine/transfer/burdened-gift-redevelopment-apt.anchor.test.ts`의 BASE(재개발 APT · 청산금 납부 · 부담부증여 · mock 세율)에서
건물 기준시가(=C) **11억** · 채무(B) **1.4억** · 권리가액(§166④1호 평가액) **6.6억**으로 바꿔 전/후를 비교했다.
후는 `vi.mock`으로 `scaleRedevelopmentForBurdenedGift`를 **참값 BigInt `floor(X×B/C)`로 대체**한 것이다(상시 mock 아님 — 계획 검증용).

| | 전(현행) | 후(참값) |
|---|---|---|
| 인가전 의제 양도가(권리가액 × r) | 83,999,999 | **84,000,000** |
| 분양가 합 | 109,454,544 | 109,454,545 |
| 인가전 양도차익 | 44,545,454 | 44,545,455 |
| 인가후 기존주택분 | 22,953,490 | 22,953,489 |
| 과세표준 | 51,009,304 | 51,009,305 |
| **산출세액** | 6,482,232 | **6,482,233** |
| **총납부세액** | 7,130,455 | **7,130,456** |

(분기 간 ±1은 분양가 안분·장특 분기 절사 때문이다. 수치는 mock 세율표 실측이지 정본 세액이 아니다. 영향은 **1원 단위**다 — 과장하지 말 것.)

### 6.3 F2 — `지분 × 채무비율` 곱비율의 개산공제 base (40만 표본)

참값 = `floor(numerator × P × B / (100 × C))`(지분 P%). 현행 `computeLumpSumDeductionBase(numerator, own × B/C)`:

| 지분 | 과소 건 | 비고 |
|---|---|---|
| 100%(채무비율만) | 140 | 순환 소수 |
| 임의 정수 % | 609 | |
| 50% | 139 | |
| **70%** | **1,782** (0.45%) | 두 소수의 곱이 반올림을 한 번 더 한다 |
| 33%/67% | 107 | |

### 6.4 F3 — 주식 ④ `Math.floor(취득가 × B/C)` (40만 표본)

| 모델 | 과소 | 비고 |
|---|---|---|
| **B/C = 정수 %**(C 만원 단위) | **9,750 (2.44%)** | 이전 PR이 `applyRatio`로 고친 바로 그 부류 — 이 경로는 안 거침 |
| B/C = 소수 1~4자리 % | 15 | |
| B 백만 · C 만원 · a 만원(순환 위주) | 8 | |
| 완전 임의 | 0 | |

파급: ④의 `perShareAcquisitionPrice = floor(안분취득가 / 주식수)`이므로 안분취득가 1원이 경계를 넘으면 취득가액 총액은 **주식수만큼(1원이 아니라)** 달라질 수 있다(주식수 1,000이면 1,000원). 이 증폭은 별개 설계(floor 위치)라 이번에 고치지 않는다 — **주식 엔진의 결정세액 쌍대 실행은 하지 못했다(확인 필요)**.

### 6.5 순차 floor vs 단일 floor (F2 설계 쟁점)

`floor(floor(num × P/100) × B/C)`(순차, §159 정본 경로와 같은 구조)와 `floor(num × P × B / (100C))`(단일, 현행 의도)는 num이 임의 정수이면 **23.8%에서 1원 다르다**(40만 중 95,174). num이 백만 단위로 둥글면 0건이라 기존 테스트로는 안 드러난다. ⇒ Q2.

### 6.6 기존 테스트 관찰 (동작 불변 계측)

`__tests__` 중 `burdened_gift|burdenedGiftInfo|scaleRedevelopment`를 포함한 `.test.ts` 138파일(2,503 통과, `.test.tsx`는 jsdom이라 제외)을 scratch config의 setup mock으로 돌려, β 스케일 호출마다 참값과 비교했다.
- β 호출 **56건**: B/C = 0.4 ×41 · 0.25 ×11 · 0.4(2억/5억) ×2 · 0.8 ×1 · 0.4(4억/10억) ×1 — **전부 짧은 소수, 값 불일치 0건**.
- ⇒ 기존 기대값 수정은 없을 것으로 본다(Do에서 같은 계측을 수정 후에 재실행해 확인). F2(개산공제 곱비율) 경로는 이 계측으로 관찰하지 않았다 — 확인 필요.

## 7. 설계안 비교

### (a) 엔진 내부 — B·C 원값으로 `safeMultiplyThenDivide` (와이어·14지점 불변) ★F1·F2 권장

- `redevelopment-burdened-gift.ts`: `scaleRedevelopmentForBurdenedGift(info, debtRatio)` → `(info, debt: { debt: number; valuation: number } | undefined)`.
  가드 의미 보존: `undefined`·`debt === valuation`(r=1) → 원본 반환 / `valuation ≤ 0` · `debt ≤ 0` · `debt > valuation` → 기존과 같은 Error. 4항을 `safeMultiplyThenDivide(x, debt, valuation)`.
- `redevelopment-split.ts`·`redevelopment.ts`·`transfer-tax-redevelopment-steps.ts:93`: `debtRatio` → 같은 `debtFraction`으로 교체(호출자는 steps 한 곳, 테스트는 엔진 풀 파이프라인으로만 통과).
  steps는 `{ debt: burdenedGift.assumedDebtAmount, valuation: burdenedGift.giftValuation.max }`를 넘긴다 — `debtRatio`의 분자·분모와 동일(`computeDebtRatio`: `assumedDebtAmount / sangjeungbeopMax`, max=0이면 ratio 0).
- F2: `lumpBase = computeLumpSumDeductionBase(numerator, own ?? 1)`(지분 기준시가 확정, 기존 함수) → 채무가 있고 `< valuation`이면 `safeMultiplyThenDivide(lumpBase, debt, valuation)` → `computeEstimatedDeduction(lumpBase, rate)`(비율 인자 1) · `valuationMeta.lumpDeductionBase = lumpBase`. 채무가 없으면 종전과 동일 값.
- `debtRatio` 필드·`TransferBurdenedGiftBreakdown` 무변경(echo 유지).
- 장점: 와이어·Zod·UI·validate·결과 타입 무변경, 정본 §159와 같은 프리미티브, 순환 소수까지 전건 참값. 단점: 내부 시그니처 3개 변경(호출 1곳).
- 정책 점검: 자동 안분 fallback 추가 없음 · useEffect 미러링 없음 · ⑧ validate 대상 필드 없음(UI/API fallback을 새로 만들지 않음) — 3대 정책 무저촉.

### (a′) `applyRatio`를 더 똑똑하게 — 기각

순환 소수 판정을 풀면 선행 §3.2의 1/3 → 99,999,999 과소가 되살아난다(`String(1/3)` 15자리 절단). 비율에서 분수를 복원(연분수)하는 안은 오탐 위험 대비 이득이 없다 — 원값이 있는데 추측할 이유가 없다.

### (b) 와이어에 B·C 추가 — 주식(F3/F4)에만 필요

| 안 | 내용 | 변경 지점 | 효과 |
|---|---|---|---|
| **S-1 (권장, 소)** | F3: ④에서 `safeMultiplyThenDivide(취득가, assumedDebtForGift, valuationAmount)` — 원값이 같은 함수에 있어 와이어 불변. F4: 엔진 `Math.floor(…)` → `applyRatio(estimatedBase, ratio)` — 짧은 소수(정수 %류)만 고침 | ④ 1곳 + 엔진 1곳, 14지점 불변 | F3 완전 정확. F4는 정수 % 부류만(순환 소수 비율은 남음) |
| S-2 (대) | `burdenedGiftValuationAmount`(C)를 와이어에 추가, 엔진이 `transferPrice`(B)와 C로 `safeMultiplyThenDivide`. `burdenedGiftDebtRatio` 폐지 또는 병기 | ⑫ stock Zod · ⑬ ④ body · ⑭ engine-input · 타입 · ⑧ stock validate(C 미입력 차단) · 사이드바/결과 영향 확인 + 형제 `burdenedGiftDebtRatio` 사용 테스트 | F4 순환 소수까지 정확. 주식 정책·검증 영역이라 별도 계획 필요 |

### (c) 부동산 쪽도 와이어에 비율 대신 분수를 싣기 — 기각

와이어에 `debtRatio`가 없다(§5). 만들 필요가 없다.

### 권장

1. **PR-1 (부동산, 이번 계획의 본체)**: (a) — F1·F2. 와이어 불변.
2. **PR-2 (주식)**: S-1 — F3 정확화 + F4 `applyRatio`. S-2는 사용자가 원할 때 별도 계획서.
   - PR-1/PR-2는 파일이 겹치지 않는다(부동산 엔진 vs stock-transfer + 증여세 폼 ④) — 병렬 가능. 단 pre-push 범위 판정이 `lib/tax-engine/**`라 둘 다 전체 테스트를 돈다.

## 8. 사용자 결정

| Q | 쟁점 | 선택지 | 권장 |
|---|---|---|---|
| Q1 | 고치는 범위 | (a) 부동산 F1·F2만 (b) F1·F2 + 주식 S-1 (c) F1·F2 + 주식 S-2(와이어) (d) 안 고침(1원 수준·저빈도) | (b) — 부동산은 와이어 불변 PR-1, 주식은 S-1 PR-2로 분리. (c)의 S-2는 14지점급 변경이라 이득(순환 소수 비율 0.002%)이 작다. (d)는 정수 % 채무비율 주식 경로에 2.4%가 남아 비권장 |
| Q2 | F2 곱비율의 floor 구조 | (a) 순차 floor — `지분 기준시가 확정 → × B/C`(§159 정본 `scaleBurdenedGiftInfo → apportion…`과 같은 구조, `computeEstimatedDeduction` JSDoc의 「지분 기준시가를 먼저 확정」 규약) (b) 단일 floor — `floor(num × 지분 × B/C)`(현행 의도 유지; 지분을 십진화하는 새 헬퍼 필요) | (a) — 기존 프리미티브만 쓰고 부동산 비재개발 부담부증여의 개산공제 base와 같은 구조가 된다. 단 지분 < 100% **그리고** 부담부 **그리고** K-5 완공 아파트에서만 값이 1원 움직인다(num 임의 시 23.8%). 해당 조합의 기존 테스트 없음(§6.6 미관찰 — Do에서 확인) |
| Q3 | `RedevelopmentSplitInput.debtRatio` 처리 | (a) 필드를 `debtFraction {debt, valuation}`으로 교체 (b) `debtRatio` 유지 + `debtFraction` 병기 | (a) — 두 출처가 어긋나는 드리프트 방지, 호출자 1곳이라 파급 작음 |
| Q4 | 가드 의미 | (a) 기존 가드(r∈(0,1], r=1 no-op)를 분수에서 동일 재현 (b) B=C(r=1)도 계산 경유 | (a) — 동작 불변이 목표 |
| Q5 | 주식 4번(F4) 순환 소수 비율 | (a) S-1 후에도 남는 순환 소수 1원은 「확인된 한계」로 문서화 (b) S-2로 완전 정확화 | (a) — 실측 빈도 0.002%, 와이어·validate 변경 비용 대비 작음 |

## 9. 테스트·가드·뮤테이션 계획

### 9.1 anchor (수정 전 실패 → 수정 후 통과)

| ID | 대상 | 케이스 |
|---|---|---|
| BD-1 | F1 엔진 풀 파이프라인(`calculateTransferTax`) | §6.2 사례(C 11억 · B 1.4억 · 권리가액 6.6억): 인가전 의제 양도가 **84,000,000**, 산출세액 6,482,233(mock 세율 — 스냅샷이 아니라 「참값 floor 와 일치」 단언 + 세액 1건 고정) |
| BD-2 | F1 4항 각각 | `rightsValue`·`settlementAmount`·`preApprovalExpenses`·`postApprovalExpenses`에 대해 순환 소수 B/C(예 14/110)에서 `scaleRedevelopmentForBurdenedGift` 직접 호출 = BigInt 참값 |
| BD-3 | F1 가드 보존 | r=1 → 원본 동일 참조 · `undefined` → 원본 · B>C / B=0 / C=0 → 기존 Error 메시지 |
| BD-4 | F1 짧은 소수 회귀 | 0.4 · 0.25 · 0.8(기존 56건) 값 불변 |
| BD-5 | F2 | 지분 70% · 임의 num · 순환 B/C에서 `lumpDeductionBase`·개산공제 = Q2 선택 구조의 참값(순차 BigInt 독립 계산) · 지분 100% · 채무 없음은 종전과 동일 값 |
| BD-6 | F2 K-5 풀 파이프라인 | `redevSec166Conversion` 경로(완공 아파트 × K-5 × 부담부) 1건 — 개산공제 echo가 산식으로 재현되는지 |
| BD-7 | F3 | `buildGiftStockBurdenedTransferBody` actual 모드: B/C=정수 %(예 57%) 에서 `perShareAcquisitionPrice`가 `floor(floor(취득가×B/C)/주식수)`의 BigInt 참값 · 주식수 경계 1건 |
| BD-8 | F4 | 엔진 `calcStockAcquisitionBasis`류 호출로 `burdenedGiftDebtRatio=0.57` 등에서 `estimatedBase` 참값 · `0.1`(기존 BG-DR-1) 불변 |
| BD-9 | 독립 대조 | 40만 표본 대신 결정적 격자 수천 건(둥근 금액)에서 구현 vs BigInt 일치(과소·과대 0) |

### 9.2 정적 가드

`__tests__/lib/debt-ratio-apply-policy.test.ts`(신규, `share-ratio-apply-policy.test.ts`의 `scan`/`starOperands` 방식 차용):
- 대상 파일: `lib/tax-engine/redevelopment-burdened-gift.ts` · `redevelopment-split.ts` · `lib/tax-engine/stock-transfer/stock-acquisition-basis.ts` · `lib/calc/gift-burdened-transfer-api.ts`.
- 금지: `Math.floor(… * <debtRatio|burdenedGiftDebtRatio|lumpBaseRatio>)`, `applyRatio(…, <debtRatio>)`. 허용 예외: 표시용 주석.
- 자기검증: 옛 식 문자열을 주입한 가짜 소스를 `scan`에 넣어 적발되는지(가드 자체의 살아있음).

### 9.3 뮤테이션 (scratch 복사 + cp 백업/sha 원복, git checkout 금지)

| # | 변형 | 기대 |
|---|---|---|
| M1 | `safeMultiplyThenDivide(x, debt, valuation)` → `Math.floor(x * (debt/valuation))` (4항 각각 4종) | BD-1/2 KILLED |
| M2 | 분자·분모 뒤집기 | BD-2/4 |
| M3 | r=1 no-op 가드 제거 | BD-3 |
| M4 | `debt > valuation` throw 제거 | BD-3 |
| M5 | F2 지분 기준시가 확정 단계 제거(곱 먼저) | BD-5 (Q2 (a) 선택 시) |
| M6 | F2 채무 안분 제거 | BD-5/6 |
| M7 | F3/F4 `Math.floor(× ratio)` 복원 | BD-7/8 + 정적 가드 |
| M8 | steps에서 분자/분모 swap(`giftValuation.max`↔`assumedDebtAmount`) | BD-1 |
| M9 | `postApprovalExpenses` 분기 제거 | BD-2 |

### 9.4 계측·검증 절차

- Do 후 §6.6 계측을 **수정 후 코드에 재실행**: 기존 호출 중 값이 바뀐 것 0건(신규 anchor 제외)을 보고.
- `npx vitest run __tests__/tax-engine/transfer/ __tests__/calc/` (~36초) → 푸시 전 `npm run check:pre-pr`.
- 14지점: PR-1은 ①~⑭ **무변경**(grep으로 `debtRatio` 와이어 0건 재확인) · PR-2(S-1)도 와이어 불변. ⑧ validate 동기화 대상 없음.
- 법령 상수: 신규 조문 인용 없음 → `manifest/additions-*.ts` 등록 불필요(기존 `VALUATION_159_*` 사용). 브라우저 수동 확인은 UI 변경이 없어 해당 없음(미수행 명시).

## 10. 범위 밖 (관찰만)

- 주식 ④의 `floor(안분취득가 / 주식수) × 주식수` 증폭(§6.4) — floor 위치 설계 별건.
- 주식 개산공제 `Math.floor(estimatedBase * STOCK_ESTIMATED_EXPENSE_RATE)`(`stock-acquisition-basis.ts:420`)는 세율 곱이라 `applyRate` 계열 소관 — 이번에 실측하지 않았다.
- 지분 축 `applyRatio`(선행 PR) 및 거울 2곳(`CompanionSaleModeBlock.tsx:197` · `AssetSectionExpense.tsx:89`)은 이 계획과 무관.
- 사이드바 `calc-wizard-store.ts:515` 간이 B/C는 표시용 근사(곱 없음).

## 11. 확인 필요 목록

1. F2(`지분 × 채무비율` 개산공제) 경로는 기존 테스트 계측에서 관찰하지 못했다 — 지분 < 100% × 부담부 × K-5 완공 아파트 기존 테스트 존재 여부(Do 시 `lumpDeductionBase` 호출 계측).
2. 주식 부담부증여의 **결정세액이 바뀌는 쌍대 실행**은 하지 못했다(F3/F4는 값 수준 실측만).
3. `.test.tsx`(jsdom) 부담부증여 테스트는 §6.6 계측에서 제외했다 — 표시 테스트라 값 영향은 낮을 것으로 보나 미관찰.
4. §166③·§163⑥ 조문 본문은 이번에 재조회하지 않았다(산식 변경이 아니므로 범위 밖) — 인용을 새로 쓰게 되면 KoreanLaw MCP로 확인.
5. `safeMultiplyThenDivide`의 BigInt 경로는 **음수 금액에서 0 방향 절사**(floor 아님)다 — β 4항은 음수가 아니라(`preApprovalExpenses` 등 Zod 음수 불허 여부는 Do에서 grep 확인) 영향 없다고 보지만 단정하지 않는다.

## 12. Do 결과 — PR-1 (부동산 F1·F2, 2026-10-22)

브랜치 `fix/redev-debt-ratio-precision` · 변경은 엔진 내부 4파일뿐이다. 와이어·Zod·UI·validate·결과 타입은 **무변경**(`lib/api`·`lib/calc`·`app/api`에서 `debtRatio` 코드 사용 0건 — `lib/calc/gift-burdened-transfer-api.ts`는 주식 ④라 PR-2 범위).

### 12.1 변경

| 파일 | 변경 |
|---|---|
| `lib/tax-engine/redevelopment-burdened-gift.ts` | `scaleRedevelopmentForBurdenedGift(info, debtFraction)` — 시그니처 `debtRatio: number` → `BurdenedGiftDebtFraction {debt, valuation}`(신규 export). 4항을 `safeMultiplyThenDivide(항, debt, valuation)`. 가드 재현(Q4 a): `undefined`·`debt === valuation` → 원본 동일 참조, `debt ≤ 0` · `valuation ≤ 0` · `debt > valuation` → 기존과 같은 `[redev-burdened-gift]` Error(메시지에 `B/C = debt/valuation` 표기로 바뀜 — 종전엔 소수값) |
| `lib/tax-engine/redevelopment-split.ts` | `RedevelopmentSplitInput.debtRatio` → `debtFraction`(Q3 a). Step B: `ownedBase = computeLumpSumDeductionBase(numerator, 지분 ?? 1)` → `debt < valuation`이면 `safeMultiplyThenDivide(ownedBase, debt, valuation)`(Q2 a 순차 floor) → `computeEstimatedDeduction(lumpBase, 율)`. `lumpBaseRatio`(곱비율) 제거. `valuationMeta.lumpDeductionBase = lumpBase` |
| `lib/tax-engine/redevelopment.ts` | `rawInput.debtRatio` → `rawInput.debtFraction`(β 호출 + 입주권 환산 차단 조건 `debt !== valuation`) |
| `lib/tax-engine/transfer-tax-redevelopment-steps.ts` | 호출자 1곳: `debtFraction: { debt: burdenedGift.assumedDebtAmount, valuation: burdenedGift.giftValuation.max }` — `computeDebtRatio(info, giftValuation.max)`의 분자·분모와 같다(`burdened-gift-apportionment.ts:141` 확인) |

`TransferBurdenedGiftBreakdown.debtRatio` echo·`computeDebtRatio`는 그대로다(표시 호환).

### 12.2 §11 확인 필요 중 닫은 것

- **5번(음수 금액)**: 4항의 원천 `rightsValue`·`settlementAmount`·`preApprovalExpenses`·`postApprovalExpenses`는 Zod(`lib/api/transfer-tax-redevelopment-schema.ts:13-20`)가 전부 `z.number().int().nonnegative()`라 음수가 들어오지 않는다 → floor 보정 불필요. 분모 `valuation`·`debt`는 위 가드가 양수로 못박는다.
- **1번(F2 기존 테스트 존재)**: 계측에서 `fraction`이 있는 split 호출은 기존 테스트에 7건(`burdened-gift-redevelopment-apt.anchor` K5 계열 — 지분 미전달 6건 · 지분 0.5 × 0.8 1건; 신규 테스트 호출은 비율·기준시가로 분리), 전부 짧은 소수 비율이라 값 불변이다. 순환 소수 × 지분 조합의 기존 테스트는 없었다(신규 BD-5/6이 처음 덮는다).

### 12.3 수정 전 실패 (anchor · 가드를 먼저 추가해 기록)

수정 전 코드에 대해 신규 anchor를 옛 시그니처 어댑터(`debtRatio = debt/valuation`)로 실행: **33건 중 16건 실패**(BD-2 4 · BD-9 격자 1 · BD-5 5 · BD-1 3 · BD-6 3). 통과한 17건은 가드·짧은 소수·`undefined`/`r=1` 등 보존 케이스다. 정적 가드 `debt-ratio-apply-policy.test.ts`는 6건 중 **3건 실패**(곱셈 패턴 · 식별자 · 호출 존재).

### 12.4 결정세액이 바뀌는 사례 (BD-1)

재개발 APT · 청산금 납부 · 부담부증여(§6.2와 같은 사실관계: C 11억 · B 1.4억 · 권리가액 6.6억, mock 세율표):

| | 수정 전 | 수정 후 |
|---|---|---|
| 인가전 의제 양도가(권리가액 × B/C) | 83,999,999 | **84,000,000** |
| 분양가 합 | 109,454,544 | 109,454,545 |
| **산출세액** | 6,482,232 | **6,482,233** |
| **총납부세액** | 7,130,455 | **7,130,456** |

mock 세율표 실측이며 정본 세액이 아니다. 영향은 **1원**이다. F2는 `lumpDeductionBase`가 예컨대 지분 70% · P_A 3.08억 · B/C = 1.4억/11억에서 27,439,999 → 27,440,000(개산공제 823,199 → 823,200).

### 12.5 기존 기대값 변화 — 0건

동작 불변 계측: 임시로 신·구 식을 같이 계산해 로그하는 계측을 넣고(원복·sha 확인) `__tests__`의 `.test.ts` 중 `burdened_gift|burdenedGiftInfo|scaleRedevelopment|redevelopment|debtFraction`를 포함한 **398파일**(5,925 통과)을 실행.
β 18,426회 · split 412회 호출 중 신·구가 달라진 것은 **모두 신규 BD 테스트의 호출**(β 140,000,000/1,100,000,000 계열 · split 순환 비율 × 지분 18건)이다. 기존 테스트가 부른 β 비율은 0.4 · 0.25 · 0.8뿐(6억/15억 · 6억/24억 · 2억/5억 · 2.5억/10억 · 8억/10억 등)이고 **전부 짧은 소수 — 신·구 일치**. 기존 `.test.ts` 기대값 수정 0건.
(`.test.tsx`(jsdom)는 계측하지 않았다 — 표시 테스트라 값 영향이 없다고 본다. 확인 필요 3번 유지.)

### 12.6 뮤테이션 (cp 백업 → 변형 → 대상 테스트 → 원복 sha 확인)

대상: 신규 anchor + 정적 가드 + `burdened-gift-redevelopment-apt.anchor`(68건). 원복 sha 전건 일치.

| # | 변형 | 결과 | 죽인 테스트 |
|---|---|---|---|
| M1a~d | 4항 각각 `Math.floor(x * (debt / valuation))` | KILLED ×4 | BD-2 해당 항 + BD-9 격자(a는 BD-1도) |
| M2 | 분자·분모 뒤집기 | KILLED(28건) | BD-2·4·9 · BD-1 |
| M3 | r=1 no-op 가드 제거 | KILLED | BD-3 동일 참조 |
| M4 | `debt > valuation` throw 제거 | KILLED | BD-3 |
| M4b | `debt ≤ 0` throw 제거 | KILLED | BD-3 (B=0 · B<0) |
| M5 | F2 «채무 먼저 → 지분» (순차 순서 뒤집기) | KILLED(15건) | BD-5 격자·70%·57% |
| M6 | F2 채무 안분 제거 | KILLED(13건) | BD-5 · BD-6 |
| M6b | F2 지분 기준시가 확정 단계 제거 | KILLED(10건) | BD-5 |
| M7b | `const debtRatio = debt/valuation` + `Math.floor(× debtRatio)` 복원 | KILLED(11건) | 정적 가드 3건 + BD |
| M8 | steps에서 B↔C swap | KILLED(6건) | BD-1 (B>C → 가드 Error) |
| M9 | `postApprovalExpenses` 안분 제거 | KILLED(12건) | BD-2 post · BD-4 |
| M10 | F2 `<` → `<=` | **SURVIVED — 동치 변이** | `safeMultiplyThenDivide(x, C, C) = x`라 값이 같다 |
| M11 | F2 `debt < valuation` 가드 제거 | **SURVIVED — 동치 변이** | 같은 이유(`B > C`는 β가 먼저 throw) |

M10/M11은 값이 달라지지 않는 중복 가드다. Q4 (a)(기존 가드 동일 재현)에 맞춰 가독성용으로 남겼다.

### 12.7 검증

- `npx tsc --noEmit` 0건 · `npm run lint` 오류 0(경고는 기존분 — 이 변경분 경고는 정리) · 폰트·톤·다크·워크플로 게이트 통과.
- `__tests__/tax-engine/ __tests__/calc/ __tests__/api/`(`--maxWorkers=2`): 2,285 파일 통과 / 1 실패 — `redev-phd-deemed-acquisition.test.ts`가 **5000ms 타임아웃**(load average 80~100 환경). 단독 재실행 5/5 통과 → 부하성이다.
- 브라우저 수동 확인: UI 변경 0이라 해당 없음(미수행).
- 14지점: ①~⑭ 무변경(엔진 내부 시그니처만). ⑧ validate 동기화 대상 없음. 자동 안분 fallback·useEffect 미러링 추가 없음.

## 13. Do 결과 — PR-2 (주식 S-1: F3·F4, 2026-10-22)

브랜치 `fix/stock-burdened-debt-ratio-precision`(PR-1 커밋 `cf263715c` 위, 같은 워크트리). **와이어 불변** — `burdenedGiftDebtRatio`(⑫ `stock-transfer-tax-schema.ts` · ⑬ `gift-burdened-transfer-api.ts` body · ⑭ `stock-transfer-engine-input.ts`)와 `perShareAcquisitionPrice` 필드 모두 그대로, Zod·UI·validate 무변경.

### 13.1 변경

| 파일 | 변경 |
|---|---|
| `lib/calc/gift-burdened-transfer-api.ts`(F3) | actual 모드 안분 취득가 `Math.floor(실지취득가 × debtRatio)` → `safeMultiplyThenDivide(실지취득가, assumedDebtForGift, valuationAmount)`. ④ 안에 B(`assumedDebtForGift`)·C(`valuationAmount`) 원값이 이미 있어(`:529-530`) 와이어 변경 없이 소수 비율을 건너뛴다. `debtRatio` 상수는 estimated 모드의 `body.burdenedGiftDebtRatio` 전송용으로 남는다 |
| `lib/tax-engine/stock-transfer/stock-acquisition-basis.ts`(F4) | 개산공제 base `Math.floor(estimatedBase × burdenedGiftDebtRatio)` → `applyRatio(estimatedBase, burdenedGiftDebtRatio)`(`tax-utils` import 추가) |

### 13.2 확인한 것

- **④ 안에 원값 존재**: `assumedDebtForGift = item.assumedDebtForGift ?? 0`, `valuationAmount = computeEffectiveValuation(item, form.giftDate)` — `valuationAmount ≤ 0`이면 함수 초입에서 throw라 분모 0 없음. 파일 781줄 → 783줄(800줄 트리거 미만).
- `perShareAcquisitionPrice = floor(안분취득가 / 주식수)` 증폭(§6.4, 범위 밖 §10)은 그대로 — 안분취득가 1원이 경계를 넘으면 취득가액 총액이 주식수만큼 달라진다. 이 PR이 그 1원을 없애므로 증폭도 같이 사라진다(BD-7: 22,799,000 → 22,800,000).

### 13.3 수정 전 실패

신규 `__tests__/calc/gift-burdened-stock-debt-ratio-precision.anchor.test.ts` **11건 중 5건 실패**(BD-7 3 · BD-8 2). 통과 6건은 짧은 소수(10%)·r=1·7주 경계 중 우연히 맞는 값·KNOWN-LIMIT 등이다. 가드 `debt-ratio-apply-policy.test.ts`를 주식 두 파일로 확장한 상태에서 **7건 중 3건 실패**(곱셈 패턴 · safeMultiplyThenDivide 호출 · applyRatio 호출).
격자(정수 % 1~99 × 취득가·기준시가): ④ 1,188건(99비율 × 4가격 × 3주식수) 중 **22건**, 엔진 297건(99비율 × 3기준시가) 중 **10건**이 옛 식에서 참값과 달랐다.

### 13.4 값이 바뀌는 사례

| 사례 | 수정 전 | 수정 후 |
|---|---|---|
| F3: 평가액 1억 · 채무 5,700만 · 실지취득가 4,000만 · 1,000주 → 1주당 취득가 | 22,799 | **22,800** |
| 같은 사례 엔진 취득가액 총액 | 22,799,000 | **22,800,000** (주식수만큼 증폭) |
| F4: B/C 57% · 취득기준시가 총액 5,000만 → estimatedBase | 28,499,999 | **28,500,000** |
| 같은 사례 개산공제(1%) | 284,999 | **285,000** |

주식 엔진의 **결정세액 쌍대 실행은 하지 않았다**(§11 2번 유지). 값 수준(취득가액·개산공제)까지만 확인했다.

### 13.5 한계 (Q5 a 확정) — 순환 소수 비율

F4는 와이어에 소수 비율 하나뿐이라 순환 소수(B/C = 14/110 등)에서 `applyRatio`가 옛 식으로 넘어가 **참값이 정수인 곱에서 1원 과소가 남는다**. 사례: B 1,400만 · C 1.1억 · 취득기준시가 총액 5,500만 → 참값 7,000,000 / 실제 6,999,999. `KNOWN-LIMIT` 테스트가 현재 값(6,999,999)을 고정해 두었다 — S-2(와이어에 증여가액 C 추가: ⑫·⑬·⑭·타입·⑧ stock validate)를 하면 이 단언을 참값으로 뒤집고 이 절을 갱신할 것. 빈도는 §6.4 실측 기준 0.002% 수준이다.

### 13.6 기존 기대값 변화 — 0건

임시 계측(신·구 식 병행 로그, 원복·sha 일치)으로 `buildGiftStockBurdenedTransferBody|burdenedGiftDebtRatio|burdenedGiftStockTransferTax|assumedDebtForGift`를 포함한 **49파일**(`.test.ts` + `.test.tsx`, 596건)을 실행: 신규 BD 테스트를 뺀 기존 호출 F3 22회 · F4 14회(비율 0.1 · 0.2)에서 신·구가 달라진 것 0건, 실패는 계측으로 옛 식을 되살려 정적 가드가 정상적으로 울린 1건뿐(원복 후 통과).

### 13.7 뮤테이션

대상: 신규 주식 anchor + 가드 + `gift-burdened-stock-major-and-conversion.anchor`(39건). 원복 sha 전건 일치.

| # | 변형 | 결과 |
|---|---|---|
| P7a | F3 `Math.floor(× debtRatio)` 복원 | KILLED(5건: 가드 2 · BD-7 3) |
| P7b | F4 `Math.floor(× 비율)` 복원 | KILLED(4건: 가드 2 · BD-8) |
| P12 | F3 B↔C 뒤집기 | KILLED(7건) |
| P13 | F3 안분 제거(취득가 전액) | KILLED(7건) |
| P14 | F4 `applyRatio(base, 1 − 비율)` | KILLED(7건, 기존 10% 회귀 포함) |
| P16 | `Math.floor(÷ 주식수)` → `Math.round` | KILLED(2건: 7주 경계 · 격자) |
| P15 | F4 가드 `< 1` → `<= 1` | **SURVIVED — 동치 변이**(`applyRatio(base, 1) = base`) |

### 13.8 검증

- `npx tsc --noEmit` 0건 · `npm run lint` 오류 0 · 폰트·톤·다크·워크플로 게이트 통과.
- **전체 vitest(`--maxWorkers=2`, PR-1+PR-2 합친 코드)**: 3,227 파일 통과 / 1 skipped, 38,512 테스트 통과 · 실패 0 (604초). PR-1 시점의 `__tests__/tax-engine/ __tests__/calc/ __tests__/api/` 1회 실패(타임아웃)는 부하 해소 후 재발하지 않았다.
- 브라우저 수동 확인: UI·와이어 변경 0이라 해당 없음(미수행).
- 14지점: ①~⑭ 무변경. ⑧ validate 동기화 대상 없음(UI/API fallback 신설 없음). 자동 안분 fallback·useEffect 미러링 추가 없음.
