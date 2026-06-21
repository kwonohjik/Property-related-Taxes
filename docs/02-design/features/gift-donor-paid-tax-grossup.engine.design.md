# 증여세 대납(代納) Gross-up 순환계산 — 엔진 설계

> **Feature**: 증여자가 수증자의 증여세를 대신 납부할 때, 대납세액이 §36 채무변제 증여로
> 다시 과세가액에 가산되어 수렴할 때까지 반복 계산하는 gross-up 엔진
> **Branch / Worktree**: `feat/gift-enhance` (`.claude/worktrees/gift-enhance`)
> **Plan 문서**: `docs/00-pm/gift-donor-paid-tax-grossup.plan.md`
> **작성일**: 2026-06-21
> **법령 검증**: KoreanLaw MCP — 상증법 MST 276123 (시행 20260102) / 시행령 MST 283637 (시행 20260227)

---

## Context

증여자가 수증자 대신 증여세를 납부하면, 그 대납액은 §36에 따라 수증자가 채무(증여세 납부의무)를
면제받은 이익 = 재차증여가 된다. 이 재차증여분이 §47②에 따라 합산되어 증여세가 다시 늘고,
늘어난 증여세를 또 대납하면 또 재차증여가 되는 순환구조가 형성된다.
이 고정점(fixed-point) 수렴 계산을 `calcGiftTaxWithDonorPaidTax` 함수로 구현한다.

단, 증여자가 §4의2⑥ 연대납세의무자 자격으로 대납한 경우에는 §36 재차증여가 성립하지 않으므로
(국세청 해석 [207328], 2011.11.28) gross-up을 미적용한다.

**현행 한계**: `calcGiftTax`는 대납 시나리오를 전혀 지원하지 않음. 본 설계로 해소.

---

## ★ 케이스 인벤토리 (법령 본문·단서·각호 전수)

§36(채무면제 증여)·§47②(10년 합산)·§4의2⑥(연대납세의무 단서)·§57(할증)·§69②(신고세액공제)
본문과 단서·각호를 전수 열거한 뒤 케이스화.

| # | 시나리오 | 법령 근거 | anchor 기대값 | 테스트 파일 | 상태 |
|---|---------|----------|-------------|-----------|------|
| C-1 | 부모→성년자녀 현금 5억, 비연대, 비대납(baseline) | §47②·§53·§56·§69② | finalTax=77,600,000 | `gift-donor-paid-grossup-anchor.test.ts` | ☐ |
| C-2 | 부모→성년자녀 현금 5억, 비연대, 대납 ON (전형) | §36·§47②·§56·§69② | donorPaidTax=102,609,309 ±1 | 동일 | ☐ |
| C-3 | 동일 + 연대납세의무(§4의2⑥) ON → gross-up 미적용 | §4의2⑥·해석[207328] | finalTax=77,600,000, applied=false | 동일 | ☐ |
| C-4 | 대납 토글 OFF → calcGiftTax 동일 결과(회귀) | — | 기존 anchor E10~E21 무변경 | 기존 파일 | ☐ |
| C-5 | 최고구간(50%) 현금 30억, 비연대, 대납 ON — MAX_ITER 내 수렴 | §56·§69② | iterations≤100, tolerance≤1 | 동일 | ☐ |
| C-6 | 사전증여 합산 동반 — 합산 후 gross-up + **§58 한도 왜곡 분석** | §47②·§36·§58① | 확인 필요 — §58 `limit58`·`priorPaidCredit` 변화 포함하여 anchor 실측 후 결정 (STEP G-3 §58 상호작용 참조) | 동일 | ☐ |
| C-7 | 2-스트림(가업특례) + 대납 → **명시 미지원** (입력 검증 차단) | §30의6·§36 | 검증 오류 반환 (주입 지점 line 167-168 미도달 — STEP G-6 참조) | 동일 | ☐ |
| C-8 | 세대생략(donorGroup=B) + 대납 → **명시 미지원** (입력 검증 차단) | §57·§46의3②·§36 | 검증 오류 반환 (grossGiftValue 조정 미구현 — STEP G-5 (b) 확정) | 동일 | ☐ |
| C-9 | 공제 동결 확인 — §53/§53의2 공제가 회차 무관 A 기준 1회 | §53·상증령 §46①2호 | 각 회차 deduction 불변 | 동일 | ☐ |
| C-10 | besshi10 ㉓·㉔ 대납분 오귀속 방지 | §47② | ㉓=실제사전증여만, ㉔=gross-up전 or 후 설계 (a)/(b) 선택 | 동일 | ☐ |
| C-11 | 동시증여(simultaneousGifts) + 대납 → **명시 미지원** (입력 검증 차단) | 상증령 §46①2호 | 검증 오류 반환 | 동일 | ☐ |
| C-12 | 의제증여 유형(§4의2⑥ 단서 열거 조문) 수증 후 대납 → 항상 재차증여 | §4의2⑥ 단서 | applied=true (연대의무 성립 불가) | 동일 | ☐ |

**규칙**: 행≥1 없으면 Do 진입 금지. "anchor 기대값=확인 필요" 행은 Pre-Do anchor 실측 후 채움.

---

## 법령 근거 (KoreanLaw MCP 검증 완료)

### §4의2 증여세 납부의무 (MST 276123, 시행 20260102)

```
제4조의2 ① 수증자는 ... 증여세를 납부할 의무가 있다.
제4조의2 ⑥ 증여자는 다음 각 호의 어느 하나에 해당하는 경우에는 수증자가 납부할
  증여세를 연대하여 납부할 의무가 있다.
  다만, 제4조제1항제2호 및 제3호, 제35조부터 제39조까지, 제39조의2, 제39조의3,
  제40조, 제41조의2부터 제41조의5까지, 제42조, 제42조의2, 제42조의3, 제45조,
  제45조의3부터 제45조의5까지 및 제48조(출연자 면책 한정)에 해당하는 경우는 제외한다.
  1. 수증자 주소·거소 불명 + 조세채권 확보 곤란
  2. 납부 능력 없음 + 강제징수로 조세채권 확보 곤란
  3. 수증자가 비거주자
```

구현 함의:
- §4의2⑥ 단서 열거 조문(§35~§42의3, §45, §45의3~5, §48 등)은 연대의무 적용 제외
  → 해당 유형 수증에서 증여자가 대납하면 연대의무가 아닌 **재차증여**로 간주 → gross-up 적용
- `donorHasJointLiability=true` 입력 시 §4의2⑥ 1~3호 중 하나에 해당하는 것으로 처리
- 의제증여 유형(§4의2⑥ 단서 해당)은 연대의무 토글=false 고정·안내문 노출 (MVP)

### §36 채무면제 등에 따른 증여 (MST 276123)

```
제36조 ① 채권자로부터 채무를 면제받거나 제3자로부터 채무의 인수 또는 변제를 받은
  경우에는 그 면제, 인수 또는 변제를 받은 날을 증여일로 하여 그 면제등으로 인한
  이익에 상당하는 금액을 그 이익을 얻은 자의 증여재산가액으로 한다.
```

구현 함의:
- 증여자(제3자)가 수증자의 증여세(채무)를 대납(변제) → **§36 재차증여** 직접 근거
- 대납액 = 수증자가 면한 이익 = 재차증여가액

### §47 증여세 과세가액 (MST 276123)

```
제47조 ② 해당 증여일 전 10년 이내에 동일인으로부터 받은 증여재산가액을 합친 금액이
  1천만원 이상인 경우에는 그 가액을 증여세 과세가액에 가산한다.
  다만, 합산배제증여재산의 경우에는 그러하지 아니하다.
```

구현 함의:
- 대납분(§36 재차증여)은 §31조 일반 증여에 해당 → **합산배제증여재산 아님** → §47② 합산 대상
- 단, MVP(본 PR) 모델은 "현 회차 aggregatedGiftValue에 fold-back"으로 처리
  (대납을 별도 증여건으로 신고서 분리하지 않음 — scope 밖)

### §56 증여세 세율 (MST 276123)

```
증여세는 제55조에 따른 과세표준에 제26조에 규정된 세율을 적용하여 계산한다.
```

§26 세율표 (DEFAULT_INHERITANCE_GIFT_BRACKETS 실측, `inheritance-gift-common.ts:82-88`):

| 과세표준 구간 | 세율 | 누진공제 |
|------------|------|---------|
| 1억원 이하 | 10% | 0 |
| 1억 초과~5억 이하 | 20% | 1,000만원 |
| 5억 초과~10억 이하 | 30% | 6,000만원 |
| 10억 초과~30억 이하 | 40% | 1억 6,000만원 |
| 30억 초과 | 50% | 4억 6,000만원 |

### §57 직계비속에 대한 증여의 할증과세 (MST 276123)

```
제57조 ① 수증자가 증여자의 자녀가 아닌 직계비속인 경우에는 증여세산출세액에
  100분의 30 (미성년자이면서 증여재산가액이 20억원을 초과하는 경우에는 100분의 40)에
  상당하는 금액을 가산한다.
  다만, 증여자의 최근친인 직계비속이 사망하여 그 사망자의 최근친인 직계비속이
  증여받은 경우에는 그러하지 아니하다.
② 할증과세액의 계산방법 등 필요한 사항은 대통령령으로 정한다.
```

상증령 §46의3② (MST 283637, 시행 20260227):

```
제46조의3② 할증과세액 = [증여세 산출세액 ×
  (수증자의 부모를 제외한 직계존속으로부터 증여받은 재산가액 / 총증여재산가액) × 30% or 40%]
  - 종전에 납부한 할증과세액
```

상증령 §46의3① (중요):

```
제46조의3① §57①을 적용할 때 증여재산가액은 §47②에 따라 증여세 과세가액에
  가산하는 증여재산을 포함한다.
```

구현 함의 (핵심 제약):
- `calcGiftGenerationSkipSurchargeWithLimit`에 전달되는 `grossGiftValue`는
  **STEP 1 평가합계**(실측: `gift-tax.ts:96-99`)로 §57 미성년 20억 임계 판정과 비율 분자를 계산
- 상증령 §46의3①에서 "§47② 가산 증여재산 포함"이라 하나, 현재 엔진은 `grossGiftValue`(STEP1)
  를 할증 기준값으로 전달 — `aggregatedGiftValue`(STEP3)를 쓰지 않음
- 따라서 gross-up 가산분을 `aggregatedGiftValue`에만 주입하면 §57 할증 임계·비율에 미반영
- **본 PR 결정**: 세대생략+대납 조합은 입력 검증 차단(C-8). grossGiftValue 조정은 후속 PR (STEP G-5 (b) 확정 참조)

### §69 신고세액 공제 (MST 276123)

```
제69조 ② §68에 따라 증여세 과세표준을 신고한 경우에는 증여세산출세액
  (§57에 따라 산출세액에 가산하는 금액을 포함한다)에서 다음 각 호의 금액을 공제한
  금액의 100분의 3에 상당하는 금액을 공제한다.
  1. §75에 따라 징수를 유예받은 금액
  2. 이 법 또는 다른 법률에 따라 산출세액에서 공제되거나 감면되는 금액
```

구현 함의:
- 신고세액공제 기준액 = 산출세액+할증 - §75징수유예 - 법정공제감면
- **대납액 = finalTax(신고세액공제 §69 적용 후 결정세액)** — 사용자 확정(plan §2)

---

## 엔진 input 타입 변경

### 신규 필드 (`GiftTaxInput` — `lib/tax-engine/types/inheritance-gift.types.ts:575-616`)

```ts
/** 증여자가 수증자의 증여세를 대신 납부하는지 (대납) */
donorPaysGiftTax?: boolean

/** 증여자가 §4의2⑥ 연대납세의무자로서 대납하는지.
 *  true: 재차증여 아님(해석[207328]) → gross-up 미적용.
 *  false/undefined: 비연대 대납 → §36 재차증여 → gross-up 적용. */
donorHasJointLiability?: boolean

/** 내부 전용 — calcGiftTaxWithDonorPaidTax가 반복 회차에서 주입하는 대납 가산분.
 *  Zod·UI·API에 노출 금지. 외부 호출자 직접 세팅 금지. */
_donorPaidTaxAddition?: number
```

### 신규 echo 결과 필드 (`GiftTaxResult` — `inheritance-gift.types.ts:618-733`)

```ts
/** 대납 gross-up 상세 (echo — UI 표시 전용, 미적용 시 applied=false).
 *  Map 금지 — Record/원시값만 사용 (feedback_engine_result_map_json_loss). */
donorPaidTaxGrossUp?: {
  applied: boolean
  reasonNotApplied?: "joint_liability" | "toggle_off"
  iterations: number              // 수렴 반복 횟수
  originalNetGift: number         // A — gross-up 전 순증여가액 = netCurrentGiftValue (gift-tax.ts:155-158, 공제·사전증여 합산 전)
  grossedUpNetGift: number        // V* — 수렴 후 aggregatedGiftValue (= A + 대납가산분; 사전증여 없으면 = A + donorPaidTax). 과세표준(taxBase)이 아님.
  donorPaidTax: number            // 대납세액 = 수렴 finalTax (재차증여가액)
  baselineTax: number             // 비대납 결정세액 (비교용 echo)
}
```

---

## 계산 알고리즘 (단계별)

### STEP G-0: 게이트 판정

```
gross_up_on =
  input.donorPaysGiftTax === true
  && input.donorHasJointLiability !== true
```

| 케이스 | donorPaysGiftTax | donorHasJointLiability | gross-up | 처리 |
|---|---|---|---|---|
| 일반(수증자 납부) | false / undefined | — | 미적용 | calcGiftTax 그대로 |
| 비연대 대납 (전형) | true | false / undefined | **적용** | 반복 수렴 |
| 연대의무자 대납 | true | true | 미적용 | applied=false + 안내 |
| 의제증여(§4의2⑥ 단서 열거) 대납 | true | (false 고정·안내) | **적용** | 연대의무 성립 불가 |

### STEP G-1: baseline 계산

```
A = netCurrentGiftValue (gift-tax.ts:155-158 = max(0, grossGiftValue−exemptAmount−assumedDebtTotal), 대납 가산 전)
    ※ §53 증여재산공제는 여기서 차감되지 않음(공제는 STEP4). 현금 5억·비과세/채무 없음이면 A=500,000,000.
    ※ echo originalNetGift·STEP G-2 `V=A+addition`·A-2 anchor 모두 이 정의(A=500,000,000)로 동결.
baseline = calcGiftTax(input, options).finalTax   // _donorPaidTaxAddition=0
```

### STEP G-2: 고정점 반복 (수렴 보장)

```
수렴 근거:
  유효 한계세율 = 한계세율(≤0.5) × (1+할증율,≤1.4) × (1-0.03) ≤ 0.5×1.4×0.97 = 0.679 < 1
  → 축약사상(contraction mapping) → 반드시 수렴

반복식:
  addition_0 = 0
  tax_0      = baseline

  for n = 0, 1, 2, ..., MAX_ITER-1:
    addition_n+1 = tax_n
    V_n+1        = A + addition_n+1        // aggregatedGiftValue 주입 지점
    tax_n+1      = calcGiftTax(input with _donorPaidTaxAddition=addition_n+1).finalTax
    if |tax_n+1 - tax_n| < 1:             // 1원 미만 차이 → 수렴
      break

MAX_ITER = 100
tolerance = 1  // 1원 미만 (floor 누적 허용)
```

### STEP G-3: 주입 지점 — aggregatedGiftValue에만 가산 (중요)

```
gift-tax.ts STEP 3 (라인 167-168):
  aggregatedGiftValue = netCurrentGiftValue + priorAggregation.totalAmount
                        + (input._donorPaidTaxAddition ?? 0)   ← 신규 가산
```

**netCurrentGiftValue에 가산하면 안 되는 이유**:
- `netCurrentGiftValue`는 `calcGiftDeductions` 3번째 인자 `currentNetGiftValue`로 전달됨
  (실측: `gift-tax.ts:183`)
- `calcRelationDeduction`·`calcMarriageBirthDeduction`은 `simultaneousGifts` 존재 시
  `floor(remaining × currentNetGiftValue ÷ (currentNetGiftValue + Σ타인))`으로 공제 안분
  (실측: `gift-deductions.ts:100-127`, `197-208`)
- netCurrentGiftValue가 회차마다 부풀면 공제 안분 비율이 이동 → "공제 1회 동결" 원칙 위반
- **해결**: `_donorPaidTaxAddition`은 `aggregatedGiftValue`에만 가산, `currentNetGiftValue`는 A로 고정

**§58 기납부 증여세액공제 한도와의 상호작용 (사전증여 동반 시 — C-6)**:
- §58① 안분 한도 = `floor(⑦(할증 전 산출세액) × ⑤_prior / ⑤)`
  (실측: `inheritance-gift-tax-credit.ts:437` `calcGiftTaxCredits` 내부
  `safeMultiplyThenDivide(computedTax, priorGiftAddedTaxBase, aggregatedTaxBase)`.
  ※ line 60은 상속세용 `calcGiftTaxCredit`(시그니처 상이) — 혼동 금지).
  분모 ⑤(`aggregatedTaxBase`)는 **`aggregatedGiftValue` 파생 과세표준**이다.
- `_donorPaidTaxAddition`을 `aggregatedGiftValue`에만 가산하면 ⑤(분모)가 부푼다.
- **✅ 확정 (2026-06-22): 자연 계산 채택 (특수 처리 없음)**.
  - 근거: §47② 대납 재차증여분은 **정당한 합산 대상**이므로 합산 과세표준(⑤)이 실제로 커진 것이며,
    사전증여가 전체에서 차지하는 비율이 실제로 줄어든 것이 맞다. §58 한도가 이를 반영해 축소되는 것은
    법령 정합(분모=실제 합산 과세표준). 인위적으로 분모에서 addition을 제외하는 것이 오히려 왜곡.
  - 즉 `aggregatedGiftValue`에 자연 가산하고 §58 한도는 기존 산식 그대로 둔다(special-case 금지).
  - **C-6 anchor**: 사전증여 동반 케이스에서 수렴 자기일관성(`A + donorPaidTax == grossedUpNetGift`,
    각 회차 §58 `limit58`·`priorPaidCredit`이 수렴값에서 안정)만 검증. 별도 보정 로직 없음.
  - (반려) 분모에서 addition 제외 / 가산분 별도 처리: 법령 근거 없는 인위 보정 → 미채택.

### STEP G-4: 공제 동결 원칙

- §53/§53의2 공제 안분 기준(`currentNetGiftValue`) = **원래 순증여(A)로 고정**
- 대납분이 `aggregatedGiftValue`에만 가산되므로 공제는 자연스럽게 A 기준 1회 동결
- 검증 anchor: C-9 (각 회차 deduction 불변 확인)

### STEP G-5: §57 세대생략 할증 주의사항

현행 엔진에서 `calcGiftGenerationSkipSurchargeWithLimit` 호출 (실측: `gift-tax.ts:237-245`):

```ts
const surchargeResult = calcGiftGenerationSkipSurchargeWithLimit(
  computedTax,
  donorGroup,
  input.isMinorDonee,
  grossGiftValue,          // ← STEP1 평가합계 (gross-up 가산과 무관·불변)
  priorAggregation,
  taxBase,
  input.isSubstituteGift,
)
```

- `grossGiftValue` = STEP1 `evaluateAllEstateItems` 결과 합계 (고정값)
- 상증령 §46의3① "§47② 가산 포함" 취지상 수렴 대상에 포함해야 하나,
  현행 전달값이 STEP1 고정값이어서 gross-up 가산분이 §57 임계·비율에 미반영
- **본 PR 결정 (b 단일 확정)**: 세대생략(donorGroup=B)+대납 조합은 **입력 검증 차단(C-8)**한다.
  grossGiftValue 조정(a 방식: `grossGiftValue + _donorPaidTaxAddition` 전달)은 본 PR에서 미구현 →
  미결정 복잡도를 본 설계에 잔류시키지 않는다. 실제 수요 확인 시 후속 PR에서 (a) 검토.

### STEP G-6: 2-스트림(가업·창업 특례) + 대납 — **본 PR scope 제외 (입력 검증 차단)**

⚠️ 2-스트림+대납은 동시증여(C-11)와 동일하게 **명시 미지원**으로 강등한다.

근거 (주입 메커니즘 양립 불가):
- STEP G-3 주입 지점은 단일 스트림 경로의 `aggregatedGiftValue`(gift-tax.ts:167-168)에만 가산한다.
- 그러나 `input.creditInput?.specialTreatment`가 설정되면 `calcGiftTax`는 즉시
  `calcGiftTaxTwoStream`으로 분기·return하므로 line 167-168에 **도달하지 못한다**(실측).
- 2-스트림 경로의 합산값은 별도 변수 `aggregatedOrdinaryValue`(gift-tax.ts:573)이며
  여기에는 `_donorPaidTaxAddition` 가산이 설계상 전혀 없다 → addition이 일반 스트림 과세가액에
  fold-back되지 않아 1회차에 baseline에서 수렴 종료(gross-up 침묵 미적용).

처리: `donorPaysGiftTax=true` + 2-스트림 특례(`specialTreatment`) 조합 → 입력 검증 차단(C-7).
실제 수요 확인 시 후속 PR에서 `aggregatedOrdinaryValue`(line 573) 주입 지점 추가로 지원.

### STEP G-7: besshi10 신고서 보정 (택일 설계)

현행 `derivePriorGiftAddition` (실측: `gift-tax-filing-form-besshi10.ts:71-78`):

```ts
function derivePriorGiftAddition(r): number {
  const debtAssumed = r.debtAssumed ?? 0;
  const netCurrent = Math.max(0, r.grossGiftValue - r.exemptAmount - debtAssumed);
  return Math.max(0, r.aggregatedGiftValue - netCurrent);
}
```

gross-up 적용 후 `aggregatedGiftValue`가 대납분만큼 부풀면:
- ㉓ 증여재산가산액(§47②) = `(부푼 aggregated) - (원래 netCurrent)` = **대납분 + 실제사전증여**
- → 대납 gross-up분이 신고서상 '증여재산가산액'으로 **오귀속**

**✅ 확정: (a) 분리 echo 방식** (2026-06-22):

  - `donorPaidTaxGrossUp.donorPaidTax`를 besshi10 builder에 전달
  - `derivePriorGiftAddition`에서 `donorPaidTax`를 차감:
    `return Math.max(0, r.aggregatedGiftValue - netCurrent - (donorPaidTax ?? 0))`
  - ㉓ 증여재산가산액(§47②) = **실제 사전증여분만** (대납 gross-up 가산분 차감) → 오귀속 방지
  - ㉔ 증여세과세가액은 gross-up 후 `aggregatedGiftValue` 그대로 유지 (gross-up 가산 반영)
  - 차감 인자명은 echo 실제 필드명 `donorPaidTax`(`result.donorPaidTaxGrossUp.donorPaidTax`)로 통일.
    수렴 시 addition == donorPaidTax(고정점)이므로 numeric 동일.

(반려) (b) 신고서 원래 A 기준 고정: ㉔가 gross-up 미반영이라 결과 카드와 신고서가 불일치 → 미채택.

C-10 anchor: A-2 케이스 ㉓=0(사전증여 없음, 대납분 미포함)·㉔=602,609,309(gross-up 후)로 동결.

---

## 신규 함수 시그니처

### `calcGiftTaxWithDonorPaidTax` (신규 — `lib/tax-engine/gift-tax.ts`)

```ts
export function calcGiftTaxWithDonorPaidTax(
  input: GiftTaxInput,
  options: GiftTaxEngineOptions = {},
): GiftTaxResult
```

동작:
- 게이트 OFF (`!donorPaysGiftTax` or `donorHasJointLiability`) → `calcGiftTax(input)` 그대로
  + `donorPaidTaxGrossUp = { applied: false, reasonNotApplied: ..., ... }`
- 게이트 ON → STEP G-1~G-6 반복 수렴 후 결과 반환
  + `donorPaidTaxGrossUp = { applied: true, iterations, originalNetGift, grossedUpNetGift, donorPaidTax, baselineTax }`

### 내부 헬퍼: `runGrossUpIteration`

```ts
function runGrossUpIteration(
  input: GiftTaxInput,
  options: GiftTaxEngineOptions,
  addition: number,
): GiftTaxResult
```

`input._donorPaidTaxAddition = addition`을 세팅하여 `calcGiftTax`를 호출.
외부 호출 금지 — `calcGiftTaxWithDonorPaidTax` 내부 전용.

### API route 변경 (`app/api/calc/gift/route.ts:64-70`)

```ts
// Before:
const result = calcGiftTax(input);
// After:
const result = calcGiftTaxWithDonorPaidTax(input);
```

route는 필드별 매핑 없이 `parsed.data`를 통째 cast 후 엔진에 전달하므로(line 64-70),
신규 boolean은 ⑫ Zod 통과 시 자동으로 엔진 input에 도달한다 → route에서 할 일은 **함수 교체뿐**.
동일 시그니처, 게이트 OFF 시 동일 동작 — 하위 호환 완전 유지.

---

## 수렴 산식 검증 (A-1 닫힌형 손계산)

**입력**: 증여가액 500,000,000 / 성년 직계비속 공제 50,000,000 / 사전증여 없음 /
세대생략 없음 / 신고기한 내(§69② 3%)

**비대납 baseline (C-1)**:
```
과세표준 = 500,000,000 - 50,000,000 = 450,000,000
  → 450,000,000은 §26 세율표 "1억 초과~5억 이하" 구간 (세율 20%·누진공제 1,000만원)
산출세액 = 450,000,000 × 0.20 - 10,000,000 = 80,000,000
신고공제 = floor(80,000,000 × 0.03) = 2,400,000
finalTax = 80,000,000 - 2,400,000 = 77,600,000
```

(이 값은 C-1 anchor 표 line 33의 finalTax=77,600,000과 일치 — 독립 재현 확인.)
검증: §26 세율표 실측 `inheritance-gift-common.ts:84` ({ min:100_000_001, max:500_000_000, rate:0.20, deduction:10_000_000 }).

**gross-up 수렴 닫힌형 (C-2 검산용)**:
- ⚠️ 구간 교차 주의: baseline 과세표준(450,000,000)은 **20% 구간**이나,
  수렴 후 과세표준은 **30% 구간**(taxBase 552,609,309)으로 넘어간다.
  → 세율이 회차 중 바뀌므로 단일세율 닫힌형은 성립하지 않으며, 반복식(STEP G-2)으로만 정확하다.
- (단일 30% 구간 가정 닫힌형 `tax(V)=floor(V × 0.97 × 0.3 - 공제_등)/(1 - 0.97 × 0.3)`는
  baseline이 20% 구간이므로 검산용으로도 부적합 — 사용 금지.)
- **실제 anchor 기대값은 Pre-Do anchor 실행 후 확정** — 본 문서 손계산은 구간 검증용

---

## Silent fallback / 자동 안분 후보 식별

| 필드 | 빈값 처리 | 정책 |
|------|---------|------|
| `donorPaysGiftTax` | undefined → false (대납 OFF) | 기본값, 자동 안분 아님 |
| `donorHasJointLiability` | undefined → false (비연대) | 기본값, 자동 안분 아님 |
| `_donorPaidTaxAddition` | undefined → 0 | 내부 초기값, 외부 미노출 |

- 빈값 자동 채움 로직 없음 — 정책 `feedback_no_silent_apportion_fallback` 준수
- `donorPaysGiftTax=true` + `donorHasJointLiability` 미입력 시 false로 처리(비연대 대납)
  → gross-up 적용. 납세자 불리하지 않음 (§4의2⑥ 연대 = 재차증여 면제; 미입력=연대 아님)
  → `feedback_no_unfavorable_application_without_legal_basis` 준수 (default=유리)

---

## 14개 동기화 지점 — 엔진 측 책임

신규 필드 `donorPaysGiftTax`·`donorHasJointLiability`·`donorPaidTaxGrossUp` 14지점 전수.
`_donorPaidTaxAddition`은 내부 전용 — 외부 동기화 지점 해당 없음.

| 지점 | 파일 (실측) | 내용 | 엔진/UI |
|-----|-----------|------|---------|
| ① 폼 상태 | `components/calc/gift-tax-form-shared.tsx:44` (`FormState`) | `donorPaysGiftTax?: boolean`, `donorHasJointLiability?: boolean` 추가 | UI |
| ② initial | `gift-tax-form-shared.tsx:104` (`INITIAL_FORM`) | 기본값 `false`/`false` | UI |
| ③ normalize | N/A — gift 폼에 필드-수준 normalize 함수 **없음** | 복원 기본값은 ②`INITIAL_FORM`(line 104, 상수) + `GiftTaxForm.tsx:67` `setForm((prev)=>({...prev, ...normalized}))` 스프레드가 담당(prev는 INITIAL_FORM으로 초기화된 상태) → 신규 boolean은 ②에 false 추가로 충족. (존재하는 `normalizeRestoredFormDates`(GiftTaxForm.tsx:66)는 Date 복원 전용 — 무관) | UI |
| ④ API 변환 | `lib/calc/gift-api.ts` `buildGiftTaxInput`(line 40) | 명시 객체 리터럴 return(line 83~108)에 두 boolean 명시 키 추가 (⑬과 동일 함수) | UI |
| ⑤ UI 위젯 | `components/calc/gift/GiftCreditChecklist.tsx` | 세액공제 단계 하단 `ToggleCard` 대납 + 하위 연대의무 토글 | UI |
| ⑥ 사이드바 | N/A — 증여 마법사 입력 사이드바 미구현 | 해당 없음 (plan §7-6 실측) | N/A |
| ⑦ 결과 카드 | `components/calc/results/GiftTaxResultView.tsx` | `donorPaidTaxGrossUp` 섹션 렌더 + 선택출력 leaf id | UI |
| ⑧ validation | `gift-tax-form-shared.tsx:246` (`validateStep`) | 대납(donorPaysGiftTax)과 다음 조합 차단: ⓐ동시증여(simultaneousGifts) ⓑ2-스트림 특례(specialTreatment) ⓒ세대생략(donorGroup=B). ⑫ Zod superRefine과 **동일 메시지로 양쪽 차단**(UI↔validate 무모순) | UI |
| ⑨ Zod enum | N/A — boolean이므로 enum 해당 없음 | — | — |
| ⑩ Zod companion | N/A | — | — |
| ⑪ 자산-수준 fallback | N/A | — | — |
| ⑫ **Zod 입력객체** | `lib/validators/property-valuation-input.ts:493-571` (`giftTaxInputSchema`) | `donorPaysGiftTax: z.boolean().optional()`, `donorHasJointLiability: z.boolean().optional()` — `isSubstituteGift`(514) 인근 추가. **route.ts:13은 import만 → 여기 추가 필수**. **+ `superRefine` 교차필드 차단 필수**(아래) — `/api/calc/gift` 직접 호출이 클라이언트 ⑧을 우회하므로 Zod 측에서도 동시증여·2-스트림·세대생략+대납 조합 차단 | 엔진 |
| ⑬ **명시 반환 객체** | `lib/calc/gift-api.ts` `buildGiftTaxInput`(line 40, 실제 전송 본문; fetch는 `GiftTaxForm.tsx:132` `JSON.stringify(buildGiftTaxInput(form))`) | **spread 아님 — 명시 객체 리터럴(line 83~108) return**. `donorPaysGiftTax`·`donorHasJointLiability`를 return 객체에 **명시 키로 직접 추가**(누락 시 TS 미감지 silent strip — memory `feedback_explicit_prop_mapping_strip`). ④와 동일 함수. grep 자가점검 | UI |
| ⑭ **Route handler** | `app/api/calc/gift/route.ts:64-70` | route는 필드별 매핑 없이 `parsed.data` 통째 cast 후 엔진 전달 → 신규 boolean은 ⑫ Zod 통과 시 자동 전달됨. **할 일은 `calcGiftTax` → `calcGiftTaxWithDonorPaidTax` 함수 교체뿐**('boolean 전달' 별도 매핑 단계 없음) | 엔진 |

⚠️ `_donorPaidTaxAddition`은 Zod 스키마·API body·UI에 절대 노출 금지.
⚠️ ⑫⑬⑭ TypeScript 미감지 — grep 자가 점검 필수 (memory `feedback_api_zod_schema_sync`).

### ⑫ Zod `superRefine` 교차필드 차단 (필수 — 직접 API 호출 우회 방어)

`simultaneousGifts`는 `deductionInput` 하위(`gift-aux-schemas.ts:27`)이고 `donorPaysGiftTax`는
top-level이므로, 조합 차단은 `giftTaxInputSchema`의 `superRefine`로 구현한다.
클라이언트 ⑧ `validateStep`만으로는 `/api/calc/gift` 직접 호출을 막지 못한다("UI 통과↔validate 차단 모순" 대칭 위반 방지).

```ts
// giftTaxInputSchema 끝에 .superRefine((data, ctx) => { ... })
const isDonorPaying = data.donorPaysGiftTax === true && data.donorHasJointLiability !== true;
if (isDonorPaying) {
  // ⓐ 동시증여 + 대납 (C-11) — 상증령 §46①2호 안분 ↔ 대납 fold-back 미검증
  if (data.deductionInput?.simultaneousGifts?.length) {
    ctx.addIssue({ code: "custom", path: ["donorPaysGiftTax"],
      message: "동시증여와 대납(代納)은 현재 함께 계산할 수 없습니다." });
  }
  // ⓑ 2-스트림 특례 + 대납 (C-7) — aggregatedOrdinaryValue 주입 미지원
  if (data.creditInput?.specialTreatment) {
    ctx.addIssue({ code: "custom", path: ["donorPaysGiftTax"],
      message: "가업·창업 특례(2-스트림)와 대납(代納)은 현재 함께 계산할 수 없습니다." });
  }
  // ⓒ 세대생략(donorGroup=B) + 대납 (C-8) — §57 grossGiftValue 조정 미구현
  //   ※ donorGroup은 입력 boolean이 아니라 getDonorGroup(input.donor) 파생값(실측: gift-tax.ts:236).
  //     Zod 측에서는 getDonorGroup(data.donor)==="B" 로 판정(엔진 헬퍼 재사용 — single-source-engine-helper).
  // if (getDonorGroup(data.donor) === "B") ctx.addIssue({ ... });
}
```

- ⑧ `validateStep`(step3)에 **동일 메시지**로 동일 3조합 차단.
- C-7·C-8·C-11 anchor는 Zod `safeParse` 실패도 검증(검증 오류 반환).

---

## 선택출력(PrintSelectionPanel) 동기화

신규 결과 섹션은 선택 출력 leaf id 등록 필수 (memory `project_selective_print_6tax_series`):

1. `GiftPrintSectionId` union (`lib/print/gift-print-sections.ts:30`)에 `"donor-paid-grossup"` 추가
2. `GIFT_PRINT_SECTIONS` 트리 (`gift-print-sections.ts:55`) 적정 그룹(summary 또는 tax-credit 인근)에
   leaf 노드 추가
3. `availablePrintIds` Set (`GiftTaxResultView.tsx`)에
   `if (result.donorPaidTaxGrossUp?.applied) s.add("donor-paid-grossup")` 가드 추가
4. 섹션 JSX를 해당 id로 감싸기
5. PDF 채널 포함 시 `ResultPdfDocument` 분리 렌더 단위 추가

---

## anchor 기대값 (Pre-Do 실측 선행 필수)

### A-1: 비대납 baseline (C-1)

입력: 증여가액 500,000,000 / 공제 50,000,000 / 사전증여 없음 / 세대생략 없음 / 신고기한 내

```
기대: donorPaidTaxGrossUp.applied === false
      finalTax === 77,600,000 (= 80,000,000 산출세액 × 0.97; §26 20% 구간·누진공제 1,000만원. C-1 표 line 33과 일치)
```

### A-2: 전형 대납 케이스 (C-2)

```
기대: donorPaidTaxGrossUp.applied === true
     donorPaidTaxGrossUp.donorPaidTax === 102,609,309 ±1  // 닫힌형 고정점 검산값(수렴 과세표준 552,609,309=30% 구간, 자기일관). Pre-Do anchor로 ±1 최종 확정
     donorPaidTaxGrossUp.originalNetGift === 500,000,000  // A = netCurrentGiftValue (실측 gift-tax.ts:155-158 = max(0, grossGiftValue−exemptAmount−assumedDebtTotal); 공제 5천만은 STEP4에서 차감되며 여기 미포함)
     donorPaidTaxGrossUp.grossedUpNetGift === 500,000,000 + donorPaidTax  // V* = A + addition (STEP G-2 line 237 정의, aggregatedGiftValue 주입값) = 602,609,309
     donorPaidTaxGrossUp.baselineTax === A-1의 finalTax
     iterations ≤ 20  // 실측 후 상한 결정
```

### A-3: 연대의무 OFF (C-3)

```
기대: donorPaidTaxGrossUp.applied === false
     donorPaidTaxGrossUp.reasonNotApplied === "joint_liability"
     finalTax === A-1의 finalTax (비대납과 동일)
```

### A-4: 50% 구간 수렴 (C-5)

```
입력: 증여가액 3,000,000,000 / 공제 600,000,000 (배우자 가정) / 비연대 / 신고기한 내
기대: iterations ≤ 100, |최종 tax_n - tax_n-1| < 1
      donorPaidTax = 확인 필요 (Pre-Do anchor 실측)
```

### A-5: 공제 동결 확인 (C-9)

```
동시증여 없는 케이스에서 각 반복 회차의 deductionResult.totalDeduction이
첫 번째 회차와 동일한지 확인 (aggregatedGiftValue에만 가산, currentNetGiftValue 고정)
```

### A-6: besshi10 ㉓ 오귀속 방지 (C-10)

```
A-2 케이스에서:
  ㉓ 증여재산가산액 = 실제 사전증여분 (0) — 대납분 미포함
  ㉔ 증여세과세가액 = 설계 (a)/(b) 선택에 따라 결정 후 고정
```

---

## 테스트 약속

테스트 파일: `__tests__/tax-engine/inheritance-gift/gift-donor-paid-grossup-anchor.test.ts` (신규)

- C-1~C-12 모든 케이스에 대응하는 anchor 테스트
- `toBe()` 정확값 고정 — Pre-Do anchor 실측값으로 갱신
- 기존 gift 테스트 (`gift.test.ts` 등) 회귀 확인: `donorPaysGiftTax` 미입력 시 기존 동작 100% 보존
- 세대생략 할증 케이스(C-8): 입력 검증 차단 — Zod safeParse/validateStep 모두 검증 오류 반환 확인 (grossGiftValue 조정 미구현)

---

## Do 단계 Phase (시퀀셜)

| Phase | 내용 | verify |
|-------|------|--------|
| Pre-Do | C-1·C-2 anchor 작성·실행(실패 확보) | 닫힌형 검산(C-1 finalTax=77,600,000)과 대조 |
| A (타입·법령상수) | `GiftTaxInput` 2필드 + `_donorPaidTaxAddition` + `GiftTaxResult.donorPaidTaxGrossUp` + Zod ⑫ | tsc 0건 |
| B (엔진) | `calcGiftTaxWithDonorPaidTax` + `runGrossUpIteration` + STEP3 주입 | A-1~A-5 anchor 통과 |
| C (route) | `app/api/calc/gift/route.ts` 함수 교체 ⑭ (`calcGiftTaxWithDonorPaidTax`) + `buildGiftTaxInput` 명시 키 추가 ⑬ | tsc 0건 + ⑬ grep 자가점검 |
| D (besshi10) | `derivePriorGiftAddition` 보정 (택일 (a)/(b)) | A-6 anchor 통과 |
| E (UI) | ToggleCard ⑤ + 결과카드 ⑦ + 선택출력 leaf id + 폼①②③④ | E2E green |
| F (검증) | ⑧ validateStep + ⑫ Zod superRefine 동일 메시지로 대납+{동시증여·2-스트림·세대생략} 3조합 차단 (C-7·C-8·C-11) | UI↔validate 무모순, Zod safeParse 실패 anchor |
| G (회귀) | 전체 test + tsc + lint 0건 | 기존 gift anchor 무변경 |

---

## Scope (포함 / 제외)

**포함**: 현재 증여 1건 대납 gross-up 수렴, 연대의무 게이트, 마법사 토글·결과(+선택출력 leaf id),
anchor·E2E. (사이드바 미포함 — 증여 폼에 부재.)

**제외(후속)**:
- 대납분을 별도 증여건으로 신고서 분리 등록
- 사전증여 이력에 대납분 자동 등록(다회차 연쇄 대납)
- **동시증여(simultaneousGifts) + 대납 공존** — 상증령 §46①2호 안분과 대납 상호작용 미검증 → scope 제외
  (본 PR에서 해당 조합 입력 시 검증 오류 처리)
- **2-스트림(가업·창업 특례) + 대납 공존** — 주입 지점이 단일 스트림 `aggregatedGiftValue`(line 167-168)뿐이고
  2-스트림 경로 `aggregatedOrdinaryValue`(line 573)에는 미주입 → scope 제외 (입력 검증 차단, C-7).
  실제 수요 확인 시 후속 PR에서 line 573 주입 지점 추가.
- **§57 세대생략 + 대납** — 본 PR에서 입력 검증 차단(C-8). grossGiftValue 조정(a 방식)은 미구현, 실제 수요 시 후속 PR.

---

## UI 통합 위임

UI 측 명세는 별도 `gift-donor-paid-tax-grossup.ui.design.md` 작성 예정.

엔진 시니어 책임 범위:
- ①②③ 타입 정의 (GiftTaxInput / GiftTaxResult / Zod 스키마)
- ⑫ Zod 입력객체 (`property-valuation-input.ts`)
- ⑭ Route handler 엔진 input 매핑
- `calcGiftTaxWithDonorPaidTax` 함수 + `_donorPaidTaxAddition` 주입 메커니즘
- `derivePriorGiftAddition` besshi10 보정

UI 시니어 책임 범위 (⑤⑥⑦⑧⑬):
- `GiftCreditChecklist.tsx` ToggleCard 위젯
- `GiftTaxResultView.tsx` 결과 카드 + 선택출력 leaf id
- `gift-api.ts` `buildGiftTaxInput` 명시 객체 리터럴(line 83~108)에 두 boolean 명시 키 추가 ⑬ (spread 아님)
- `gift-tax-form-shared.tsx` FormState·INITIAL_FORM·validateStep (대납+{동시증여·2-스트림·세대생략} 3조합 차단, ⑫ Zod superRefine과 동일 메시지)

---

## 핵심 설계 결정 요약

1. **대납액 기준**: finalTax(§69② 신고세액공제 후 결정세액) — 증여자 실지급액 = 수증자 면채무
2. **주입 지점**: `aggregatedGiftValue`에만 가산 — `netCurrentGiftValue` 불변으로 §53 공제 1회 동결 보장
3. **세대생략+대납**: 본 PR scope 제외 — 입력 검증 차단(C-8). §57 grossGiftValue 조정(a)은 후속 PR (STEP G-5 (b) 확정)
4. **2-스트림+대납**: 본 PR scope 제외 — 입력 검증 차단 (주입 지점 단일 스트림 line 167-168만, 2-스트림 `aggregatedOrdinaryValue` line 573 미주입 → 양립 불가; STEP G-6 참조)
5. **besshi10 택일**: (a) 분리 echo 차감 / (b) 신고서 원래 A 기준 — Do 진입 전 선택
6. **scope 제외 3조합**: 대납 + {동시증여(C-11)·2-스트림 특례(C-7)·세대생략(C-8)} 입력 검증 차단 — ⑧ validateStep + ⑫ Zod superRefine 양쪽(직접 API 호출 우회 방어)
7. **`_donorPaidTaxAddition`**: 내부 전용 — Zod·API·UI 노출 금지 (TS strict 미감지 → grep 자가점검)
