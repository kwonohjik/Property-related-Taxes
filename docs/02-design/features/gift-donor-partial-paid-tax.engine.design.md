# 증여세 부분 대납(代納) — 수증자 일부 납부 + 증여자 부족분 대납 엔진 설계

> **Feature**: 기존 "증여자 전액 대납 gross-up"(PR#323, `4650f386`)을 확장 —
> 수증자가 증여세 중 일부(고정 금액 `P`)를 본인 부담으로 납부하고,
> **부족한 나머지 `(T − P)`만 증여자가 대납**하는 경우를 계산.
>
> **기반 문서**: `gift-donor-paid-tax-grossup.engine.design.md`
> **Plan 문서**: `docs/00-pm/gift-donor-partial-paid-tax.plan.md`
> **작성일**: 2026-06-22
> **법령 검증**: KoreanLaw MCP — 상증법 MST 276123 (시행 20260102) / 상증령 MST 283637 (시행 20260227)

---

## Context

PR#323(전액 대납 gross-up)이 이미 구현되어 있다. 본 기능은 그 확장:
- **전액 대납**: `P = 0`, 증여자가 총세액 `T` 전부 대납 → 재차증여가액 `D = T`
- **부분 대납 (본 기능)**: `P > 0`, 수증자가 `P`원 본인 부담, 증여자는 부족분 `(T − P)` 대납 → 재차증여가액 `D = max(0, T − P)`

기존 전액 대납은 `P = 0`의 특수 케이스이므로 **기존 동작 100% 회귀 보장**이 핵심.

---

## ★ 케이스 인벤토리 (법령 본문·단서·각호 전수)

§36①(채무변제 증여)·§4의2⑥(연대납세의무 게이트)·§47②(10년 합산)·§69②(신고세액공제) 본문과 단서 전수 열거 후 케이스화. 기존 C-1~C-12는 `gift-donor-paid-tax-grossup.engine.design.md` 참조 (회귀 테스트 대상).

| # | 시나리오 | 법령 근거 | anchor 기대값 | 테스트 파일 | 상태 |
|---|---------|----------|-------------|-----------|------|
| A-1 | **회귀**: `P = 0` → 기존 전액 대납과 동일 | §36① | `donorPaidTax === 102,609,309` (PR#323 anchor 무변경) | `gift-donor-paid-grossup-anchor.test.ts` | ☐ TODO |
| A-2 | **부분 대납**: 5억 / 공제 5천만 / 수증자 5천만 납부 (`P = 50,000,000`) / 비연대 / 신고기한 내 | §36①·§69② | `donorPaidTax === 34,243,176 (±1)`, `totalGiftTax === 84,243,176 (±1)`, `doneePaidTax === 50,000,000`, `grossedUpNetGift === 534,243,176` — 닫힌형 검산 상세 §계산 알고리즘 참조 | 동일 | ☐ TODO |
| A-3 | **경계 케이스**: `P ≥ 총세액` → 증여자 대납 없음 (`doneePaidGiftTax = 200,000,000`, baseline 77,600,000 초과) | §36① | `donorPaidTax === 0`, `totalGiftTax === 77,600,000`(baseline 유지), `applied === true`, `grossedUpNetGift === 500,000,000` (V* = A, 가산 없음) | 동일 | ☐ TODO |
| A-4 | **회귀**: 대납 OFF — `doneePaidGiftTax` 미적용 (`donorPaysGiftTax = false`) | — | 기존 anchor C-1~C-12 전부 무변경 | 기존 gift 테스트 전체 | ☐ TODO |
| A-5 | **회귀**: 연대의무 ON → gross-up 미적용, `P` 무시 | §4의2⑥ | `applied === false`, `reasonNotApplied === "joint_liability"`, `finalTax === 77,600,000` | 동일 | ☐ TODO |
| A-6 | **수증자 P = baseline 정확히 일치** (경계, ±1원 이내) | §36① | `donorPaidTax === 0 (±1)` (max(0) 게이트 작동), `applied === true` | 동일 | ☐ TODO |
| A-7 | **사전증여 동반 + 부분 대납** (C-6 케이스 확장) | §47②·§36①·§58① | 수렴 자기일관성 (`grossedUpNetGift === A + donorPaidTax`) 검증 + §58 `limit58` 안정 | 동일 | ☐ TODO |
| A-8 | **음수 입력 차단**: `doneePaidGiftTax = -1` | ⑧ validation / ⑫ Zod | Zod `min(0)` 오류, 검증 오류 반환 | 동일 | ☐ TODO |

**규칙**: 행 ≥ 1 없으면 Do 진입 금지. "anchor 기대값 = 확인 필요" 행은 Pre-Do anchor 실측 후 채움.

---

## 법령 근거 (KoreanLaw MCP 검증 완료 — 2026-06-22)

### §36 채무면제 등에 따른 증여 (상증법 MST 276123, 시행 20260102)

```
제36조(채무면제 등에 따른 증여)
① 채권자로부터 채무를 면제받거나 제3자로부터 채무의 인수 또는 변제를 받은 경우에는
  그 면제, 인수 또는 변제(이하 이 조에서 "면제등"이라 한다)를 받은 날을 증여일로 하여
  그 면제등으로 인한 이익에 상당하는 금액(보상액을 지급한 경우에는 그 보상액을 뺀 금액으로
  한다)을 그 이익을 얻은 자의 증여재산가액으로 한다.
② 제1항을 적용할 때 면제등을 받은 날의 판단 및 그 밖에 필요한 사항은 대통령령으로 정한다.
```

**상증령 §26의2 위임 수령 (MST 283637, 시행 20260227)**:

```
제26조의2(채무면제 등에 따른 이익의 증여시기)
  법 제36조제1항에 따른 면제등을 받은 날은 다음 각 호의 구분에 따른 날로 한다.
  1. 채권자로부터 채무를 면제 받은 경우: 채권자가 면제에 대한 의사표시를 한 날
  2. 제3자로부터 채무의 인수를 받은 경우: 제3자와 채권자 간에 채무의 인수계약이 체결된 날
```

**부분 변제 포섭 확인**: §36①은 "제3자로부터 **변제를 받은** 경우 ... **그 면제등으로 인한 이익에 상당하는 금액**"이라 규정. "변제"는 전부 변제·부분 변제를 구분하지 않으며, "이익에 상당하는 금액"은 **실제 변제된 금액** 그 자체이다. 따라서 증여자가 총세액 중 일부(`D = T − P`)만 변제해도, 그 변제된 금액이 재차증여가액 → **부분 변제는 §36① 본문에 자연 포섭**, 별도 특례 조문 불필요.

> 주의: 상증령 §26의2 제1호·제2호는 "채무의 인수"에 대한 날짜만 규정하며 "변제"(제3자 직접 변제)의 증여시기는 규정하지 않는다. 본 엔진은 "대납일"을 외부 입력(증여일)으로 받으므로 시기 판정 로직 추가 불필요.

### §4의2⑥ 연대납세의무 (상증법 MST 276123, 시행 20260102)

```
제4조의2⑥ 증여자는 다음 각 호의 어느 하나에 해당하는 경우에는 수증자가 납부할
  증여세를 연대하여 납부할 의무가 있다. 다만, 제4조제1항제2호 및 제3호, 제35조부터
  제39조까지, 제39조의2, 제39조의3, 제40조, 제41조의2부터 제41조의5까지, 제42조,
  제42조의2, 제42조의3, 제45조, 제45조의3부터 제45조의5까지 및 제48조(출연자가 해당
  공익법인의 운영에 책임이 없는 경우로서 대통령령으로 정하는 경우만 해당한다)에 해당하는
  경우는 제외한다.
  1. 수증자의 주소나 거소가 분명하지 아니한 경우로서 증여세에 대한 조세채권을 확보하기 곤란한 경우
  2. 수증자가 증여세를 납부할 능력이 없다고 인정되는 경우로서 강제징수를 하여도 증여세에 대한 조세채권을 확보하기 곤란한 경우
  3. 수증자가 비거주자인 경우
```

구현 함의: 연대납세의무자 대납은 §36 재차증여 아님(국세청 해석 [207328]). 해당 게이트는 기존과 동일 — `doneePaidGiftTax` 무시, gross-up 미적용.

### §69② 신고세액공제 (상증법 MST 276123)

대납액 = finalTax = §69② 신고세액공제 적용 후 결정세액. `P`도 "수증자가 납부할 총세액 T*에서 수증자가 실제 납부하는 금액"으로 같은 기준. 수렴 후 총세액 T* 기준으로 P 차감.

---

## 엔진 input 타입 변경

### 신규 필드 (`GiftTaxInput` — `lib/tax-engine/types/inheritance-gift.types.ts`)

```ts
/** 수증자가 본인 부담으로 납부하는 증여세액(원).
 *  증여자는 (총세액 − 이 금액)만 대납(부족분).
 *  미입력/undefined/0 = 기존 전액 대납 동작(회귀 안전).
 *  donorPaysGiftTax=true 이고 donorHasJointLiability=false 일 때만 유효.
 *  Zod: z.number().min(0).optional() — 음수 차단.
 *  주의: 이 타입은 **엔진 input(`GiftTaxInput`) / Zod 입력객체** 기준의 number이다.
 *  FormState(①) 는 프로젝트 규약(금액 폼 필드 전부 string)에 따라 `string`으로 정의하고,
 *  ④/⑬ API 변환에서 `parseAmount`로 number 경계 변환한다(아래 ④ 항목 참조).
 */
doneePaidGiftTax?: number;
```

### result 타입 확장 (`GiftTaxResult.donorPaidTaxGrossUp`)

기존 `donorPaidTaxGrossUp` 객체에 2개 필드 optional 추가:

```ts
donorPaidTaxGrossUp?: {
  applied: boolean;
  reasonNotApplied?: "joint_liability" | "toggle_off";
  iterations: number;
  originalNetGift: number;   // A — 변경 없음
  grossedUpNetGift: number;  // V* = A + D — 변경 없음 (P는 V*에 미포함)
  /**
   * [의미 정밀화] 증여자 대납분 D = max(0, T* − P).
   * P = 0(전액 대납)이면 D = T* → 기존 anchor·besshi10·결과카드 호환.
   * JSDoc 기존 "대납세액 = 수렴 finalTax" → "증여자 대납분 D = max(0, T* − P)"로 정정.
   */
  donorPaidTax: number;
  baselineTax: number;       // 변경 없음
  /** 수증자 본인 납부액 P (입력 echo). P = 0(전액 대납) 시 undefined 또는 0. */
  doneePaidTax?: number;
  /** 총 결정세액 T* = 수렴 finalTax. P ≤ T* 시 T* = D + P. P > T* 시 T* = baseline(= 수렴 finalTax)이며 D = 0, P > T*이므로 D + P > T*(불일치). P = 0 시 T* == D이므로 기존 결과와 동일. */
  totalGiftTax?: number;
};
```

**⚠️ 신규 필드가 optional(`?`)인 이유**: `applied: false` 분기(`gift-tax-grossup.ts:89-103`)의 인라인 객체가 이미 확정 구조라 non-optional 추가 시 tsc 실패. `applied: false` 분기에서 두 신규 필드는 `undefined`로 둔다 (gross-up 미적용 시 표시 불필요).

---

## 계산 알고리즘 (단계별)

### STEP 개요

기존 `calcGiftTaxWithDonorPaidTax` (`lib/tax-engine/gift-tax-grossup.ts`) 의 **반복식 1줄 + `donorPaidTax` 대입 1줄 = 2줄 변경**. 반복식(STEP G-2)은 가산식을 `prevTax`→`max(0, prevTax − doneePaid)`로, finalEcho(STEP G-5)의 `donorPaidTax` 대입은 `prevTax`(=T*)→`addition`(=D)로 바꾼다. 현행 `gift-tax-grossup.ts:147 const donorPaidTax = prevTax;` 가 그대로 echo되므로, 반복식만 바꾸면 `donorPaidTax`는 여전히 T*가 되어 A-2 anchor(D=34,243,176)·결과카드 ④행·besshi10 차감이 어긋난다(P>0에서 T*≠D). 나머지 파이프라인(주입 지점·게이트·besshi10 산식) 은 불변.

### STEP G-0: 게이트 판정 (불변)

```
gross_up_on =
  input.donorPaysGiftTax === true
  && input.donorHasJointLiability !== true
```

`doneePaidGiftTax`는 게이트 판정에 미영향.

### STEP G-1: baseline 계산 (불변)

```
baseline = calcGiftTax(input, options, _donorPaidTaxAddition=0).finalTax
A = max(0, grossGiftValue − exemptAmount − assumedDebtTotal)   // 변경 없음
doneePaid = max(0, input.doneePaidGiftTax ?? 0)               // 신규: P 확정
```

### STEP G-2: 고정점 반복 수렴 — **유일한 변경**

```
기존 반복식:
  addition_{n+1} = tax_n                              ← 전액 대납: 총세액을 그대로 가산

신규 반복식 (부분 대납):
  addition_{n+1} = max(0, tax_n − doneePaid)         ← P 차감 후 max(0) 게이트

V_{n+1}  = A + addition_{n+1}   ← aggregatedGiftValue 주입 지점 (불변)
tax_{n+1} = calcGiftTax(..., _donorPaidTaxAddition=addition_{n+1}).finalTax

종료: |tax_{n+1} − tax_n| < 1원, 최대 100회
```

**변경된 코드 (2줄 — 반복식 1줄 + `donorPaidTax` 대입 1줄):**

```ts
// gift-tax-grossup.ts STEP G-2 내부 — 반복식
// Before:
const nextAddition = prevTax;
// After:
const nextAddition = Math.max(0, prevTax - doneePaid);

// gift-tax-grossup.ts:147 — finalEcho용 donorPaidTax 대입 (STEP G-5에서 echo)
// Before:
const donorPaidTax = prevTax;          // = T*
// After:
const donorPaidTax = addition;         // = D = max(0, T* − P). P>0에서 T*≠D이므로 필수 기능 변경
```

**P = 0 시 완전 회귀**: `max(0, prevTax - 0) === prevTax` → 기존 식과 완전 동일.

### STEP G-3: 수렴 보장

- `P = 0` 시: 기존과 동일 (유효 한계세율 ≤ 0.679 < 1, 축약사상).
- `P > 0` 시: `addition = max(0, tax − P)` 함수는 `tax`에 대해 단조증가·비확장. `finalTax`는 tax에 대해 단조증가·축약 → 합성도 축약 → **수렴 유지**.
- `P ≥ T*` 구간: `addition = 0` → `V = A` → baseline에서 즉시 수렴 (D = 0).

### STEP G-4: 주입 지점 (불변)

`aggregatedGiftValue`에만 가산. `netCurrentGiftValue` 불변 → §53/§53의2 공제 1회 동결 원칙 유지. 상세: `gift-donor-paid-tax-grossup.engine.design.md` STEP G-3 참조.

### STEP G-5: finalEcho 확장

```ts
// gift-tax-grossup.ts STEP G-3 (lines 152-159)
const finalEcho: GiftTaxResult["donorPaidTaxGrossUp"] = {
  applied: true,
  iterations,
  originalNetGift,
  grossedUpNetGift,          // = A + addition (변경 없음)
  donorPaidTax: addition,    // D = max(0, T* − P) = 수렴 addition. (변경: 기존 `prevTax`(=T*) → `addition`(=D). P>0에서 T*≠D이므로 필수 기능 변경 — line 147 대입도 함께 정정)
  baselineTax: baseline,
  // 신규 2필드:
  doneePaidTax: doneePaid > 0 ? doneePaid : undefined,   // P (echo)
  totalGiftTax: prevTax,     // T* = 수렴 finalTax. P ≤ T* 시 = D + P. P > T* 시 = baseline(D = 0, P 초과분은 합산 안 됨)
};
```

**자기일관성 검증 (P ≤ T* 조건부)**: `P ≤ T*`인 경우에 한해 `donorPaidTax + (doneePaidTax ?? 0) === totalGiftTax` (±1원 허용). `P ≥ T*`(A-3 경계) 구간은 `donorPaidTax = 0`, `totalGiftTax = baseline`이고 `doneePaidTax = P`가 T*를 초과(echo가 캡 없이 입력 원값)하므로 **불변식 미적용**(`0 + P ≠ baseline`). 이 구간은 A-3 별도 anchor(`donorPaidTax === 0`·`totalGiftTax === baseline`)로 검증한다.

### STEP G-6: applied:false 분기 동기화 (`gift-tax-grossup.ts:89-103`)

`toggle_off` / `joint_liability` 분기는 신규 필드를 `undefined`로 둔다 (변경 없음, tsc 통과).

### STEP G-7: besshi10 보정 (불변)

`donorPaidTax`가 `D = max(0, T* − P)`로 수렴하므로 기존 `derivePriorGiftAddition` 보정(`gift-tax-grossup.ts`에 주입된 `donorPaidTax` 차감)이 자동 정합. `doneePaidTax`는 §47② 사전증여 합산 대상이 아니라 차감 불필요.

---

## 닫힌형 검산 (A-2 anchor 사전 확인용)

**입력**: A = 500,000,000 / 공제 50,000,000 / P = 50,000,000 / 비연대 / 신고기한 내

**단일 20% 구간 가정 닫힌형 (사전 검산)**:

```
finalTax(V) = floor((floor(0.2·(V − 50M) − 10M)) · 0.97)
           = floor(0.194·V − 19,400,000)         [소수점 오차 무시 — 검산용]

addition = finalTax(V) − P
V = A + addition = 500M + finalTax(V) − 50M = 450M + finalTax(V)

V = 450M + (0.194V − 19,400,000)
0.806V = 430,600,000
V* ≈ 534,243,176

과세표준 = 534,243,176 − 50,000,000 = 484,243,176 (20% 구간 — 5억 미만 ✓)
산출세액 = floor(484,243,176 × 0.2 − 10,000,000) = floor(96,848,635.2 − 10M) = 86,848,635
신고공제 = floor(86,848,635 × 0.03) = floor(2,605,459.05) = 2,605,459
T* = 86,848,635 − 2,605,459 = 84,243,176

D = T* − P = 84,243,176 − 50,000,000 = 34,243,176
V* = 500,000,000 + 34,243,176 = 534,243,176 ✓ (자기일관)
```

**anchor 목표값** (±1원 — floor 누적 허용):
- `grossedUpNetGift === 534,243,176`
- `donorPaidTax === 34,243,176`
- `totalGiftTax === 84,243,176`
- `doneePaidTax === 50,000,000`

> 주의: 이 닫힌형은 수렴 전체가 20% 구간에 머문다는 가정 위에서만 성립. Pre-Do anchor 실행 후 구간 교차 여부 재확인 필수. 구간 교차 시 반복식(STEP G-2)만 정확.

**A-1 (P=0) 회귀 기대값**: `donorPaidTax === 102,609,309` (PR#323 anchor 불변)

---

## Silent fallback / 자동 안분 후보 식별

| 필드 | 빈값 처리 | 정책 |
|------|---------|------|
| `doneePaidGiftTax` | `undefined` → 0 (전액 대납 기존 동작) | 기본값, 자동 안분 아님 — `feedback_no_silent_apportion_fallback` 준수 |
| `donorPaysGiftTax` | `undefined` → false (대납 OFF) | 기존 동작 유지 |
| `donorHasJointLiability` | `undefined` → false (비연대) | 기존 동작 유지 |

- `doneePaidGiftTax`를 빈값(`undefined`)으로 두면 기존 전액 대납(`P=0`)과 동일 동작 — 납세자 불이익 없음.
- 음수 입력은 ⑧ validateStep + ⑫ Zod `.min(0)`으로 차단 — 자동 교정 없음.

---

## 14개 동기화 지점 (신규 필드 `doneePaidGiftTax`)

기존 `donorPaysGiftTax`·`donorHasJointLiability`의 14지점 구현은 PR#323에서 완료. **신규 `doneePaidGiftTax`에 대한 추가 동기화만** 아래에 명세.

| 지점 | 파일 (실측) | 처리 | 완료 기준 |
|-----|-----------|------|---------|
| ① 폼 상태 | `components/calc/gift-tax-form-shared.tsx:44` (`FormState`) | `doneePaidGiftTax: string` 추가 (`donorHasJointLiability` 아래). **프로젝트 규약상 모든 금액 폼 필드는 string** (`gift-tax-form-shared.tsx:70-77` marriageExemption 등 전부 `: string`) — number 금지 (⑤ CurrencyInput이 string 전용이므로 number 시 tsc/런타임 불일치) | tsc 0건 |
| ② initial | `gift-tax-form-shared.tsx:114` (`INITIAL_FORM`) | `doneePaidGiftTax: ""` 추가 (`donorHasJointLiability: false` 아래). 빈 문자열 초기화 (기존 marriageExemption `""` 패턴, `gift-tax-form-shared.tsx:125-128`) | — |
| ③ normalize | 증여 폼에 별도 normalize 함수 없음 (`normalizeRestoredFormDates`는 Date 전용) — ② INITIAL_FORM 기본값으로 충족 | 변경 없음 | — |
| ④/⑬ API 변환 | `lib/calc/gift-api.ts` `buildGiftTaxInput` return 객체 (line 109~ 명시 키 목록) | `doneePaidGiftTax: parseAmount(form.doneePaidGiftTax) || undefined`를 **명시 키**로 추가 (spread 아님 — `feedback_explicit_prop_mapping_strip` 준수). FormState가 string("50,000,000")이므로 `parseAmount`로 number 변환 필수 — 기존 marriageExemption(`gift-api.ts:48`)·foreignTaxPaid(`:61`)·requestedSplitAmount(`:105-106`) 동일 패턴. 빈 문자열→undefined→엔진 `?? 0`(P=0 전액 대납) 회귀. **`gift-api.ts:32-34` 변환 설명 주석에도 doneePaidGiftTax 줄 추가** | grep 자가 점검: `doneePaidGiftTax` 가 return 객체에 `parseAmount` 변환과 함께 존재하는지 |
| ⑤ UI 위젯 | `components/calc/gift/GiftCreditChecklist.tsx:190` (`donorPaysGiftTax` ToggleCard children 영역) | 노출 조건: `form.donorPaysGiftTax === true` AND `form.donorHasJointLiability !== true`. 기존 marriageExemption 패턴 동일하게 string FormState에 바인딩: `<CurrencyInput value={form.doneePaidGiftTax} onChange={(v) => set({ doneePaidGiftTax: v })} />` (CurrencyInput은 `value: string`·`onChange: (v: string) => void` 전용 — `inputs/CurrencyInput.tsx:47-48`). 라벨 "수증자 본인 납부액 (원)"·기본 0 안내. 상세는 UI 설계 위임 | E2E green |
| ⑥ 사이드바 | 증여 폼에 사이드바 미구현 | N/A | — |
| ⑦ 결과 카드 | `components/calc/results/GiftTaxResultView.tsx:568-606` | 기존 3행 카드를 5행으로 확장 (§결과 카드 행 매핑 참조). `donorPaidTax` 라벨 "대납세액 (gross-up 수렴값)" → "증여자 대납분 (총세액 − 수증자 납부)" 정밀화 | E2E 결과 카드 표시 확인 |
| ⑧ validation | `components/calc/gift-tax-form-shared.tsx:505` (`validateStep`, `donorPaysGiftTax === true` 분기 내부) | FormState가 string이므로 `parseAmount`로 평가: `if (parseAmount(form.doneePaidGiftTax) < 0) return "수증자 본인 납부액은 음수일 수 없습니다.";` (string `< 0` 직접 비교 금지 — 타입 오류·의도 불일치). `donorPaysGiftTax = false` 시 무시. CurrencyInput은 음수 입력 자체를 기본 차단(parseAmount allowNegative 미설정)하므로 실제 음수 차단 주체는 ⑫ Zod `min(0)`(엔진 input number 기준). A-8(`doneePaidGiftTax = -1`)은 number 엔진 input 기준 anchor. | tsc 0건 + A-8 anchor |
| ⑨⑩⑪ | N/A (boolean enum·companion·Date 해당 없음) | — | — |
| ⑫ Zod 입력객체 | `lib/validators/property-valuation-input.ts:526` (`donorHasJointLiability` 직후) | `doneePaidGiftTax: z.number().min(0).optional()` 추가. **기존 superRefine 유지** (3조합 차단 로직 불변). | tsc 0건 + Zod safeParse 확인 |
| ⑭ route handler | `app/api/calc/gift/route.ts:64-70` | route는 `parsed.data` 통째 cast 후 엔진 전달 → `doneePaidGiftTax`는 ⑫ Zod 통과 시 자동 전달됨. **변경 없음.** | — |
| result 타입 | `lib/tax-engine/types/inheritance-gift.types.ts:751` `donorPaidTaxGrossUp` 객체 | `doneePaidTax?: number`·`totalGiftTax?: number` 2필드 추가 + `donorPaidTax` JSDoc 정밀화("대납세액 = 수렴 finalTax" → "증여자 대납분 D = max(0, T* − P)"). **optional(`?`)로만 추가** | tsc 0건 |

⚠️ ⑫⑬⑭ TypeScript 미감지 → grep 자가 점검 필수 (`feedback_api_zod_schema_sync`).

---

## 결과 카드 행 매핑 (⑦ `GiftTaxResultView.tsx:568-606`)

기존 카드 구조(실측 line 579-603):
- ① 원본 과표 `originalNetGift` (580행)
- ② "대납세액 (gross-up 수렴값)" `donorPaidTax` (584행) ← **라벨 정밀화**
- ③ 최종 과표 `grossedUpNetGift` (588행)
- 흐름행: `originalNetGift + donorPaidTax(=대납세액) = grossedUpNetGift` (593-598행)
- baselineTax 행 (600-603행)

**신 모델 5행 구성**:

| 행 | 라벨 | 값 | 비고 |
|---|---|---|---|
| ① | 원본 증여세 과세가액 (§53 공제 차감 전) | `originalNetGift` (A) | 기존 ① 유지. ※ A=netCurrentGiftValue로 §53 공제 전 과세가액 — "과세표준" 아님 |
| ② | 총 결정세액 | `totalGiftTax` (T*) | **신규** (`result.donorPaidTaxGrossUp.totalGiftTax`) |
| ③ | 수증자 본인 납부 | `doneePaidTax` (P) | **신규** (P = 0 시 행 미노출 — 전액 대납 케이스 UI 간소화) |
| ④ | 증여자 대납분 (총세액 − 수증자 납부) | `donorPaidTax` (D) | 기존 ② 라벨만 "증여자 대납분 (총세액 − 수증자 납부)"으로 정밀화 |
| ⑤ | gross-up 후 최종 과세표준 | `grossedUpNetGift` (V*) | 기존 ③ 유지 |

**흐름행 수식**: `A + D = V*` 그대로 유지 (`originalNetGift + donorPaidTax = grossedUpNetGift`). P는 V* 합산에 포함하지 않는다.

**P = 0(전액 대납) 회귀 안전성**: `T* == D`, ③행 미노출 → 기존 표시와 시각적 동일.

---

## anchor 기대값 요약

### A-1 (회귀, P = 0)

```
donorPaidTaxGrossUp.applied === true
donorPaidTaxGrossUp.donorPaidTax === 102,609,309 (±1)  // PR#323 불변
donorPaidTaxGrossUp.doneePaidTax === undefined (또는 0)
donorPaidTaxGrossUp.totalGiftTax === 102,609,309 (±1)  // P=0 시 T*==D
donorPaidTaxGrossUp.grossedUpNetGift === 500,000,000 + donorPaidTax
```

### A-2 (부분 대납, P = 50,000,000)

```
donorPaidTaxGrossUp.applied === true
donorPaidTaxGrossUp.donorPaidTax === 34,243,176 (±1)     // D
donorPaidTaxGrossUp.doneePaidTax === 50,000,000           // P (echo)
donorPaidTaxGrossUp.totalGiftTax === 84,243,176 (±1)      // T* = D + P
donorPaidTaxGrossUp.grossedUpNetGift === 534,243,176 (±1)  // V* = A + D
donorPaidTaxGrossUp.originalNetGift === 500,000,000         // A
```

### A-3 (경계, P ≥ 총세액)

```
donorPaidTaxGrossUp.applied === true
donorPaidTaxGrossUp.donorPaidTax === 0        // D = max(0, T* − P) = 0
donorPaidTaxGrossUp.doneePaidTax === 200,000,000 (echo — 또는 undefined)
donorPaidTaxGrossUp.totalGiftTax === 77,600,000 (±1)  // T* = baseline (P≥T* 즉시 수렴)
donorPaidTaxGrossUp.grossedUpNetGift === 500,000,000  // V* = A (가산 없음)
```

### A-8 (음수 차단)

```
Zod safeParse 실패: issues[0].path includes "doneePaidGiftTax"  ← 실제 음수 차단 주체 (엔진 input number 기준)
validateStep 오류 반환 (donorPaysGiftTax=true, doneePaidGiftTax=-1)  ← parseAmount(form.doneePaidGiftTax) < 0 평가
```

> 주의: CurrencyInput(string)은 음수 입력 자체가 어려우므로 UI 경로의 음수는 거의 발생하지 않는다. A-8의 `doneePaidGiftTax = -1`은 number 엔진 input 기준이며, ⑫ Zod `min(0)`이 실제 차단 주체다.

---

## 테스트 약속

테스트 파일: `__tests__/tax-engine/inheritance-gift/gift-donor-paid-grossup-anchor.test.ts` (기존 파일 확장)

- **기존 C-1~C-12 케이스 전부 무변경 (`doneePaidGiftTax` 미입력 / 0 케이스) — 회귀 보장**
- A-1: P = 0 회귀 (`toBe(102_609_309)` ±1 허용)
- A-2: 부분 대납 (`donorPaidTax toBe(34_243_176)`, `totalGiftTax toBe(84_243_176)`, `grossedUpNetGift toBe(534_243_176)` 각 ±1)
- A-3: P ≥ 총세액 경계 (`donorPaidTax === 0`, V* === A)
- A-5: 연대의무 ON 시 `doneePaidGiftTax` 무시 + `applied === false`
- A-6: P = baseline 정확히 일치 — `donorPaidTax` 0 or ±1 이내 (max(0) 게이트)
- A-7: 사전증여 동반 + 부분 대납 — 수렴 자기일관성 검증 (`A + donorPaidTax == grossedUpNetGift ±1`)
- A-8: 음수 차단 — Zod safeParse 실패 + validateStep 오류
- `totalGiftTax` 자기일관 (**P ≤ T* 케이스에 한함**): `toBe(donorPaidTax + doneePaidTax)` ±1. A-3(P ≥ T*) 구간은 echo된 `doneePaidTax = P`가 T*를 초과하여 `0 + P ≠ totalGiftTax`이므로 이 무조건 `toBe`에서 **제외** — A-3은 `donorPaidTax === 0`·`totalGiftTax === baseline` 별도 anchor로만 검증.

---

## Do Phase (시퀀셜)

| Phase | 내용 | verify |
|---|---|---|
| Pre-Do | A-1(회귀) · A-2(부분) anchor 작성 → 실행(실패 확보 → 닫힌형 34,243,176과 대조) | anchor 실패 메시지 확보 후 다음 단계 진입 |
| A 타입 | `doneePaidGiftTax?: number` → `GiftTaxInput` + Zod ⑫ `.min(0).optional()` + result 타입 `doneePaidTax?` · `totalGiftTax?` + `donorPaidTax` JSDoc 정밀화 | `tsc --noEmit` 0건 |
| B 엔진 | `gift-tax-grossup.ts` — `doneePaid` 확정 + 반복식 1줄 변경 + **`donorPaidTax` 대입 `prevTax`→`addition` 변경(line 147)** + `finalEcho` 2필드 추가 + `applied:false` 분기 동기화 확인 | A-1~A-3 anchor 통과 |
| C API | `gift-api.ts` ④/⑬ 명시 키 추가 | grep 자가 점검 + tsc 0건 |
| D UI | `FormState` ① + `INITIAL_FORM` ② + `validateStep` ⑧ + `GiftCreditChecklist.tsx` ⑤ + `GiftTaxResultView.tsx` ⑦ 5행 확장 | E2E green |
| E 회귀 | `npm test` 전체 + tsc + lint | 기존 C-1~C-12 + 전체 gift anchor 무변경 · 0건 |

---

## Scope (포함 / 제외)

**포함**:
- 수증자 본인 납부액 `P` 입력 + 증여자 부족분 `D = max(0, T − P)` 대납 계산
- gross-up 수렴 (반복식 1줄 + `donorPaidTax` 대입 1줄 = 2줄 변경)
- 결과 echo(`doneePaidTax`·`totalGiftTax`) + 결과 카드 5행 확장
- anchor A-1~A-8 + E2E

**제외(불변 계승 — 기존 차단 3조합)**:
- 동시증여 + 대납 (⑧/⑫ 차단)
- 2-스트림 특례 + 대납 (⑧/⑫ 차단)
- 세대생략(donorGroup=B) + 대납 (⑧/⑫ 차단)
- 대납분 별도 증여건 신고서 분리 등록
- P를 비율(%) 또는 증여자 대납 상한으로 입력하는 방식 (사용자 확정으로 반려 — plan §11)

---

## 회귀 안전성 요약

`doneePaidGiftTax` 미입력(`undefined`) 또는 0:
- `doneePaid = max(0, 0) = 0`
- `nextAddition = max(0, prevTax - 0) = prevTax` → **기존 반복식과 완전 동일**
- `donorPaidTax` 의미 = 기존 "총세액" (T* = D, P = 0일 때)
- `totalGiftTax` = `donorPaidTax` (동일값, P = 0), `doneePaidTax` = undefined (③행 미노출)
- besshi10·결과카드·기존 anchor 전부 호환

---

## UI 통합 위임

UI 측 명세: `gift-donor-partial-paid-tax.ui.design.md` (별도 작성 예정)

**엔진 시니어 책임 범위**:
- 타입 변경: `GiftTaxInput.doneePaidGiftTax` + `GiftTaxResult.donorPaidTaxGrossUp` 2필드
- ⑫ Zod `property-valuation-input.ts` — `doneePaidGiftTax: z.number().min(0).optional()` 추가
- ⑭ route: 변경 없음 (parsed.data 통째 전달 유지)
- `gift-tax-grossup.ts` 반복식 1줄 + `donorPaidTax` 대입 1줄(`prevTax`→`addition`, line 147) + finalEcho 확장

**UI 시니어 책임 범위**:
- `GiftCreditChecklist.tsx` ⑤ — 수증자 본인 납부액 `CurrencyInput` 추가 (노출 조건: `donorPaysGiftTax && !donorHasJointLiability`)
- `GiftTaxResultView.tsx` ⑦ — 5행 확장 + `totalGiftTax`·`doneePaidTax` 표시
- `gift-tax-form-shared.tsx` ① ② ⑧ — FormState·INITIAL_FORM·validateStep 음수 차단
- `gift-api.ts` ⑬ — `doneePaidGiftTax` 명시 키 추가

---

## 핵심 설계 결정 요약

1. **입력 방식**: 수증자 본인 납부액 `doneePaidGiftTax` (고정 원). 증여자는 부족분(T* − P) 대납. 비율·상한 방식 반려 (plan §11 사용자 확정).
2. **반복식 변경 범위**: 2줄 — 반복식 1줄 (`nextAddition = max(0, prevTax − doneePaid)`) + `donorPaidTax` 대입 1줄 (`prevTax`→`addition`, line 147). 후자는 P>0에서 T*≠D이므로 필수 기능 변경(A-2 결과를 5천만원 변동). 나머지 파이프라인 전부 불변.
3. **P = 0 회귀**: 기존 전액 대납과 수학적으로 완전 동일. 신규 필드 optional → 기존 anchor·besshi10·결과카드 호환.
4. **P ≥ T* 처리**: `applied=true, donorPaidTax=0` + 결과카드에 "수증자 전액 부담(재차증여 없음)" 안내. 미적용 처리 반려 (plan §5.4 확정).
5. **`donorPaidTax` 의미 정밀화**: "총세액" → "증여자 대납분 D = max(0, T* − P)". P=0 시 D=T*이므로 기존 의미와 동일. JSDoc만 정정.
6. **신규 echo 필드**: `doneePaidTax?: number` (P 입력 echo) · `totalGiftTax?: number` (T* = D+P). P=0 시 `totalGiftTax===donorPaidTax`, `doneePaidTax===undefined` → 표시 불변.
7. **결과카드 흐름행**: `A + D = V*` 유지. P는 V* 합산에 미포함 (P를 V*에 더하면 수식 오류).
8. **차단 3조합**: 기존 동시증여·2-스트림·세대생략 차단 완전 계승. `doneePaidGiftTax`는 차단 판단에 미영향.
