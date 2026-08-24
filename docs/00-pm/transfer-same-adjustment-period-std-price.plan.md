# 동일조정기간 내 취득·양도 시 「양도당시 기준시가」 환산 — 구현 계획서

> 근거: **소득세법 시행령 §164⑧** · **소득세법 시행규칙 §80①~⑤**
> 작성 기준일: 2026-08-24 · 브랜치 `stdprice-two-timepoint-enhance`
> 요구: *"양도소득세에서 기준시가를 계산하는 모든 경우에 호출할 수 있어야 한다"*

---

## §1. 법령 본문 — KoreanLaw MCP 실측 (verbatim)

### 1-1. 소득세법 시행령 §164⑧ (트리거 조항)

> ⑧보유기간중 새로운 기준시가가 고시되지 아니함으로써 법 제99조제1항제1호의 규정에 의한 **양도당시의 기준시가와 취득당시의 기준시가가 동일한 경우**에는 당해토지 또는 건물의 보유기간과 양도일 전후 또는 취득일 전후의 기준시가의 상승률을 참작하여 **재정경제부령이 정하는 방법**에 의하여 계산한 가액을 양도당시의 기준시가로 한다.

⇒ 트리거는 **「양도당시 기준시가 == 취득당시 기준시가」**다. 이는 §164③(*"새로운 기준시가가 고시되기 전에 취득 또는 양도하는 경우에는 직전의 기준시가에 의한다"*)의 귀결로, **두 시점이 같은 고시분을 가리킬 때** 성립한다.

### 1-2. 소득세법 시행규칙 §80①~⑤ (산식 본문)

| 항·호·목 | 실측 본문 요지 |
|---|---|
| **§80①1호 본문** | 취득일이 속하는 연도의 **다음 연도 말일 이전**에 양도하는 경우 → 각 목 산식. **단서: 각 목 산식으로 계산한 양도당시 기준시가가 취득당시 기준시가보다 적으면 취득당시 기준시가를 양도당시 기준시가로 한다** |
| **§80①1호 가목** | 양도일까지 새 기준시가 미고시(개별주택가격·공동주택가격 공시 포함) → `양도당시 = 취득당시 + (취득당시 − 전기) × [보유월수 / 조정월수(100분의 100을 한도로 한다)]` |
| **§80①1호 나목** | 양도일부터 2월이 되는 날이 속하는 월의 말일까지 새 기준시가가 고시된 경우로서 **거주자가 이 산식을 적용하여 법 §110① 확정신고를 하는 경우** → `양도당시 = 취득당시 + (새로운 − 취득당시) × (보유월수 / 조정월수)` |
| **§80①2호** | 1호 외의 경우 → **취득당시의 기준시가**(= 환산 없음) |
| **§80②1호** | 조정월수 — **가목**: 전기 결정일 ~ 취득당시 결정일 **전일**까지 월수 / **나목**: 취득당시 결정일 ~ 새 결정일 **전일**까지 월수 |
| **§80②2호** | 전기의 기준시가 — 취득당시 기준시가 **결정일 전일**의 당해 양도자산의 기준시가 |
| **§80③** | 전기 기준시가 부존재 시 대체 — 1호 토지: 지목·이용상황 유사 **인근토지**의 전기 기준시가 / 2호 §99①1호**나목 건물**: `국세청장이 해당 건물에 최초로 고시한 기준시가 × 국세청장 고시 기준율` / 3호 §99①1호**다목(오피스텔·상업용) 및 라목(주택)**: `전기 = 취득당시 × (전기의 가목+나목 합계액 ÷ 취득당시의 가목+나목 합계액)` |
| **§80④** | ③3호 적용 시 취득당시 또는 전기의 **나목 가액이 없으면 ③2호 준용** |
| **§80⑤** | 조정월수·보유기간 월수 계산 시 **1월 미만의 일수는 1월로 한다** |

---

## §2. 첨부 교재와 현행 법문의 차이 — **5건 실측** ⚠️

첨부 이미지(집행기준 해설서)를 그대로 구현하면 **현행 법문과 어긋나는 지점**이 있다. 구현 정본은 **법문**으로 한다.

| # | 교재 서술 | 현행 법문 실측 | 처리 |
|---|---|---|---|
| **C-1** | "**동일조정기간** 내에 취득·양도하는 경우" | 강학상 표현. 법문 요건은 **2단**: ① §164⑧ 「양도·취득 기준시가 동일」 ② §80①1호 「취득 연도의 **다음 연도 말일 이전** 양도」 | 트리거를 **2단 판정**으로 구현. ②만 충족하고 ①이 아니면 미적용, ①만 충족하고 ②가 아니면 **§80①2호 → 취득당시 기준시가** |
| **C-2** | 단서 ①(계산값 < 취득당시 → 취득당시)을 **(1) 가목 아래에만** 배치 | 단서는 **§80①1호 본문**이며 *"다음 각 목의 산식에 의하여 계산한"*이라 **가·나목 공통** | **가·나목 모두**에 하한 적용 |
| **C-3** | (2) 나목에도 *"※ 보유월수 ÷ 조정월수는 100분의 100을 한도"* 부기 | **가목 산식 괄호 안에만** 존재. 나목에는 한도 문구 **없음** | 가목만 cap. **V-2 전수 실측(2,020만 조합 0건)으로 나목은 `보유 ≤ 조정` 확정** ⇒ 나목 cap 분기 **미구현** |
| **C-4** | ⑤ii) 건물: `**2001.1.1.** 건물기준시가 × 산정기준율` | §80③2호는 *"국세청장이 해당 건물에 대하여 **최초로 고시한** 기준시가 × … 기준율"* — 2001.1.1.은 구판의 최초고시일 표현 | **"최초 고시분"**으로 일반화(`§164⑤` 기존 구현과 동일 축) |
| **C-5** | ⑤iii) "**국토교통부장관이 공시하는** 주택, 오피스텔 및 상업용 건물" | §80③3호는 *"§99①1호**다목**의 오피스텔 및 상업용 건물과 같은 호 **라목**의 주택"* — 다목은 **국세청장** 고시다 | 조문 축(다목·라목)으로 판정. 고시 주체로 판정하지 않는다 |

> 📌 교재 ③의 *"초일을 산입하여 월수를 계산"*은 법문이 아니라 **예규(재산 46014-205, 2002.12.18.)**다. 법문(§80⑤)은 *"1월미만의 일수는 1월로 한다"*만 규정한다. → §5-1에서 초일산입을 채택하되 근거를 예규로 명시한다.

---

## §3. 현행 구현 실측 — **부분 구현이 이미 존재한다**

`grep`·본문 정독 결과, §164⑧ 산식은 **건물 기준시가 계산기 도메인 안에만** 국지적으로 존재한다.

| 지점 | file:line | 현황 |
|---|---|---|
| 산식 leaf | `lib/tax-engine/building-standard-price-helpers.ts:551` `calcSameYearTransferStdPrice(acqStd, delta, holdingMonths, adjustMonths)` | `floor(acqStd + delta × min(hold/adj, 1))` — **하한 미적용** |
| 유일 호출부 | `lib/tax-engine/building-standard-price.ts:462` | 트리거가 **`if (transferYear === acquisitionYear)`** (`:426`) |
| 입력 타입 | `lib/tax-engine/types/building-standard-price.types.ts:88~102` | `holdingMonths` · `adjustMonths`(기본 12) · `sameYearFormula`("prev"\|"new") · `newNoticePricePerM2` · `prevLandPricePerM2` · `prevStructureKey` · `prevUsageNo` |
| 폼 | `lib/calc/building-std-price-form.ts:146,703` | `adjustMonths` 문자열 필드 + 검증 |
| §164⑥ 준용 | `lib/tax-engine/commercial-building-valuation.ts:99~130` | 상가·오피스텔 최초고시 전 취득 환산에 **가목 산식 준용**. 주석 `:107`이 *"분모 하한(≥ A) **미적용**"* 자인 |
| 준용 UI | `components/calc/transfer/Sec164_8ProvisoInput.tsx` | A·B·C·D 4입력(전기 합계액·조정월수) |
| 월수 헬퍼 | `lib/tax-engine/transfer-tax-commercial-step.ts:181` `monthsBetween`(private) | §80⑤ 준거 주석 있음 |
| 법령 상수 | `lib/tax-engine/legal-codes/building-standard-price.ts:20` `SAME_YEAR_TRANSFER` | 상수만 존재, 범용 배선 없음 |
| 검증 manifest | `lib/legal-verification/manifest/additions-transfer-decree.ts:392` | `소득세법 시행규칙 §80` 등록됨 (키워드: 조정월수·전기의 기준시가) |

### 3-1. 🔴 **교재 사례 2건 모두 현행 코드로 도달 불가** — 실측

두 사례 다 **취득연도 ≠ 양도연도**다(2005 → 2006). 현행 트리거 `transferYear === acquisitionYear`가 **거짓**이 되어 §164⑧ 분기에 진입하지 못하고 일반 양도 경로(`building-standard-price.ts:479`)로 떨어진다.

- 사례1: 취득 2005-07-28 → 양도 2006-03-24
- 사례2: 취득 2005-09-07 → 양도 2006-06-10

법문 요건은 **"취득일이 속하는 연도의 다음 연도 말일 이전"**이므로 **연도가 달라도 성립**한다. 현행 조건은 법문보다 **과도하게 좁다**.

> 나아가 두 사례는 **공동주택**(§99①1호라목)이다. 공동주택은 애초에 건물 기준시가 계산기를 거치지 않고 사용자가 공시가격을 직접 입력하므로, 이 경로에는 §164⑧ 코드가 **전혀 없다**.

### 3-2. 🔴 월수 헬퍼 결함 — **실측 확인** (probe)

> ### ⚠️ 초판 판정 정정 (자가검토 2026-08-24)
> 초판은 *"`monthsBetween`은 §164⑥ 준용의 C에도 쓰인다. **고치면 기존 상가 환산 결과가 움직인다**"*
> 라고 단정하고 이를 근거로 Q-1(별도 승인)을 요구했다. **불완전했다.**
>
> **V-1 실측**: 정정판으로 교체 후 `__tests__/tax-engine/ __tests__/calc/` 전량 실행 → **회귀 0건**
> (1,039파일 **12,168건 전부 통과**).
>
> ⇒ 결론 정정: 위험은 「기존 결과가 움직인다」가 **아니라** 그 반대다 —
> **`monthsBetween`의 월수 동작을 지키는 테스트가 하나도 없다.** §164⑥ 준용 anchor들이
> 월수 경계를 타지 않기 때문이다. 고쳐도 아무도 안 잡고, **고친 뒤에도 아무도 안 지킨다.**
>
> ⇒ **P-0.5는 안전하되, 신규 anchor 없이는 무방비다.** A-8(월수 경계)을 **P-0.5 동시 필수**로
> 승격하고, §164⑥ 준용 C의 월수 경계 anchor도 함께 심는다(A-11 신설).

`transfer-tax-commercial-step.ts:181`의 `monthsBetween`을 복제해 교재 두 사례로 측정:

```
사례1 (가목)  기대=8   현행monthsBetween=8  ✓    제안=8  ✓
사례2 (나목)  기대=10  현행monthsBetween=9  ✗    제안=10 ✓
```

원인: 현행은 달력 월 차이(`raw`)만 쓰고 **"응당일 도달 후 남은 끝수일"**을 절상하지 않는다.
`2005-09-07 → 2006-06-10`은 만 9개월 경과 후 **4일이 남는데**(§80⑤ → 1월) 현행은 9를 반환한다.
주석(`:176~180`)은 *"도달했으면 정확히 raw개월 경과"*라 단정하지만, **끝수가 있어도 raw로 끊긴다**.

산식 자체는 정확하다 — 올바른 월수를 넣으면 두 사례 모두 재현된다:

```
사례1 = floor(161,000,000 + 12,000,000 × min(8/12,1))  = 169,000,000  ✓
사례2 = floor(210,000,000 + 10,000,000 × 10/12)        = 218,333,333  ✓
```

> ⚠️ `monthsBetween`은 §164⑥ 준용의 **C(취득~최초고시 보유월수)**에도 쓰인다. 고치면 **기존 상가 환산 결과가 움직인다** → §9 **Q-1**(사용자 결정) + **V-1**(회귀 실측).

---

## §4. 갭 요약

| # | 갭 | 영향 |
|---|---|---|
| **G-1** | 트리거가 「연도 동일」로 과협소 | 법정 요건(다음 연도 말일 이전) 미충족분 전부 누락 — 교재 사례 2건 포함 |
| **G-2** | §80①1호 본문 **단서(하한) 미구현** | 하락장에서 양도기준시가 < 취득기준시가 → **환산취득가액 과대**(양도차익 과소) |
| **G-3** | 적용 범위가 **§99①1호나목 건물** 한정 | 토지·개별주택·공동주택·오피스텔·상업용건물 전부 미적용 |
| **G-4** | **나목(제2산식)** 은 존재하나 「확정신고 선택」 요건·UI 없음 | 납세자 선택권 미노출 |
| **G-5** | **§80③ 전기 기준시가 부존재 대체규정** 미구현(토지 인근토지·건물 최초고시×기준율·다목/라목 비율환산) | 전기 미고시 자산에서 계산 불가 |
| **G-6** | **§80①2호**(1호 외 = 취득당시 기준시가) 미구현 | 트리거는 섰으나 기간요건 미충족 시 처리 부재 |
| **G-7** | 월수 절상 결함(§3-2) | 나목·경계 케이스 1개월 과소 |

---

## §5. 설계

### 5-1. 신규 순수 leaf — `lib/tax-engine/same-adjustment-period-std-price.ts`

도메인 무관 순수 함수 3종. **자산 종류를 모른다** — 호출부가 사실(fact)만 넘긴다(memory `feedback_shared_predicate_argument_parity`).

```ts
/**
 * §80⑤ + 예규(재산 46014-205) — 초일산입 후 1월 미만 끝수 **절상**.
 *
 * 🔴 **「보유기간 월수」는 이 저장소에 두 축이 있다 — 혼용 금지 (F-2)**
 *   · **§80⑤ 축(절상)** = 본 함수. 기준시가 조정월수·§80① 보유월수 전용
 *   · **§95·§104 축(내림)** = `transfer-tax-aggregate-helpers.ts:146` `monthsBetween`
 *     (LTHD·세율 보유기간). **손대지 않는다**
 *   · 상증 사업연도 환산 = `property-valuation/fiscal-year-annualize.ts:28`. 무관
 *   이름을 `monthsBetween`으로 짓지 않는 이유가 이것이다.
 */
export function calcStdPriceMonths(from: Date, to: Date): number;

/** §164⑧ + §80①1호 본문 — 적용 요건 2단 판정 */
export function classifySameAdjustmentPeriod(facts: {
  standardPriceAtAcquisition: number;
  standardPriceAtTransfer: number;   // §164③ 적용 후(= 직전 고시분) 값
  acquisitionDate: Date;
  transferDate: Date;
}): "clause_1" | "clause_2" | "not_applicable";
//   clause_1     = §80①1호 (가·나목 산식 대상)
//   clause_2     = §80①2호 (→ 취득당시 기준시가 그대로)
//   not_applicable = §164⑧ 미해당(두 기준시가 상이) → 입력값 유지
//
// 🔑 **트리거 정본은 「두 기준시가 값이 같은가」다 (F-11)** — 고시일자 일치가 아니다.
//    §164⑧ 문언이 *"양도당시의 기준시가와 취득당시의 기준시가가 동일한 경우"*이기 때문이다.
//    자동 조회(Q-2) 경로에서 고시일자가 같다는 사실은 **UI 사전 안내에만** 쓰고 판정에는 쓰지
//    않는다 — 판정축을 둘로 만들면 수동 입력 경로와 dual-truth가 된다.

/** §80①1호 가목·나목 산식 + 본문 단서(하한) */
export function calcSameAdjustmentPeriodStdPrice(args: {
  formula: "prev" | "new";           // 가목 | 나목
  standardPriceAtAcquisition: number;
  priorStandardPrice?: number;       // 가목: 전기의 기준시가 (§80②2호)
  newStandardPrice?: number;         // 나목: 새로운 기준시가
  holdingMonths: number;
  adjustmentMonths: number;
  /**
   * §80①1호 본문 단서(하한) 적용 여부. **기본 true**(§164⑧ 본체).
   * `false`는 §164⑥ 준용 전용 — 그 경로가 구하는 값은 「양도당시」가 아니라
   * 「취득당시 기준시가의 **분모**」라 단서의 대상이 아니다 (F-1).
   */
  applyFloor?: boolean;
}): { value: number; capApplied: boolean; flooredToAcquisition: boolean };
```

**산식 규칙 (법문 실측 고정)**
| | 가목(`prev`) | 나목(`new`) |
|---|---|---|
| `delta` | 취득당시 − **전기** | **새로운** − 취득당시 |
| 유효 보유월수 `h'` | `min(보유월수, 조정월수)` ← **cap 적용** | `보유월수` **그대로** ← cap 없음(C-3) |
| 산식 | `취득당시 + floor(delta × h' ÷ 조정월수)` | 동일 |
| 하한(C-2) | 적용 | 적용 |

⚠️ **cap은 가목에만 건다.** 나목에 걸면 법문에 없는 제한을 넣는 것이다(→ **V-2**로 도달 가능성 실측).

🔴 **정수 연산 — F-5 정정 (정책 위반 사전 차단)**

1. **`delta ≤ 0`이면 즉시 `취득당시` 반환하고 곱셈을 하지 않는다.**
   delta < 0(하락장)이면 결과가 반드시 취득당시보다 작아 **어차피 §80①1호 단서로 취득당시가 된다**.
   이 단락은 결과를 바꾸지 않으면서 **음수 경로를 통째로 제거**한다 — `safeMultiplyThenDivide`는
   분자 `> MAX_SAFE_INTEGER`일 때 BigInt 나눗셈(**0 방향 절사**)으로 빠지는데, 그 아래에서는
   `Math.floor(a*b/c)`(**아래 방향**)라 **음수에서 두 경로가 1원 갈린다**(`tax-utils.ts:164~171` 실측).
2. **`applyRate(x, hold/adj)` 금지.** `hold/adj`는 이진 표현 불가 소수라 floor 직전 ulp 아래로
   떨어져 **1원 부족**이 난다(memory `feedback_applyrate_fractional_rate_one_won_error`).
   ⇒ **분수 정수 연산** `Math.floor(delta × hold ÷ adj)` = `safeMultiplyThenDivide(delta, hold, adj)`
   (delta > 0 보장 후 호출).
3. cap(**가목 한정**)은 **비율이 아니라 월수에** 건다 — `h' = Math.min(hold, adj)`를 먼저 구하고
   곱한다. `Math.min(hold/adj, 1)`을 먼저 계산하면 소수를 다시 만들어 2번의 취지가 무너진다.
4. `Math.round()` 금지 (프로젝트 정수 연산 원칙).

🔑 **파생 불변식 — 하한 발동 ⟺ `delta ≤ 0`** (blast-radius에서 도출)
`delta > 0`이고 §80⑤로 `h' ≥ 1`이므로 `취득당시 + floor(delta × h' ÷ adj) ≥ 취득당시`가 **항상**
성립한다. 즉 §80①1호 단서가 발동하는 경우는 **`delta ≤ 0`뿐**이고, 위 1번의 단락과 **동치**다.
⇒ 단서를 별도 후처리로 두지 않고 **단락 하나로 구현**해도 법문과 같다. `flooredToAcquisition`은
그 단락을 탔는지를 그대로 반환한다. **A-3이 이 동치를 고정한다.**

### 5-2. 배선 — "모든 경우에 호출 가능"의 구현 형태

`standardPriceAtTransfer`의 **기록(write) 지점이 28곳 이상**이다(`lib/calc/*` 8 · `app/api/calc/transfer/*` 9 · `components/calc/transfer/*` 8 …). 각 지점을 개별 패치하면 첫 히트에서 멈추는 전형적 실패가 난다(memory `feedback_enumerate_all_write_sites_before_fixing`).

⇒ **단일 정규화 choke point** 방식을 택한다.

**엔진 진입부 STEP 0.47 (신설)** — `lib/tax-engine/transfer-tax.ts`
`pre1990Land`(STEP 0.4, **`:82`**) · `inheritedAcquisition`(STEP 0.45, **`:116`**) · `resolveAcquisitionOverride`(STEP 0.46, **`:127`**)로 **기준시가가 확정된 직후**, `let workingInput = input`(**`:129`**) 직전에 삽입한다. 이 위치 하나로 단건 엔진의 **모든** 다운스트림 소비자(환산취득가액·기준시가 과세·감면 안분·LTHD·중과 판정)가 자동 추종한다.

```
STEP 0.4   pre1990Land        → standardPriceAtAcquisition 주입 (§164④)
STEP 0.45  inheritedAcq       → standardPriceAtDeemedDate/Transfer 주입 (§163⑨)
STEP 0.42  familyBusiness     → 조기 반환(단, 내부에서 calculateTransferTax 재귀 → 0.47 우회 없음, F-9)
STEP 0.46  acquisitionOverride
STEP 0.47  ★ §164⑧ 정규화     → standardPriceAtTransfer 치환 + steps 1건 push  ← 신설 (:129 직전)
```

**독자 기준시가를 산출하는 특수 경로**는 각자 leaf를 호출한다(자동 추종 불가):

| 경로 | file | 배선 |
|---|---|---|
| 건물 기준시가 계산기 | `building-standard-price.ts:426` | 트리거를 `classifySameAdjustmentPeriod`로 **교체**(연도 동일 → 법정 2단) + 하한 적용 |
| 상가·오피스텔 §164⑥ 준용 | `commercial-building-valuation.ts:99` | 🔴 **위임 철회 — F-1** (아래 경고 참조). 비율 곱 core만 공유하고 **하한은 미적용**(`applyFloor: false`) |
| 겸용주택 | `transfer-tax-mixed-use-*.ts` | 주택분·상가분 **각각** 판정(§80⑤ 후단: 토지·건물 조정월수 상이 시 각각 계산 후 합산) |
| 일괄양도 안분 | `app/api/calc/transfer/bundled-split-helpers.ts` | 안분 **분모 확정 전** 정규화 |
| 다필지 | `transfer-tax-multi-parcel-branch.ts:122` | 필지별 판정 |
| 부담부증여 | `burdened-gift-apportionment.ts:233,237` | 토지·건물 각각 |
| 재개발 | `transfer-tax-redevelopment.ts` | 권리가액 축 — **비범위**(§10) |

> 🔴 **F-1 — §164⑥ 준용에 하한을 전파하지 말 것 (판정 뒤집힘)**
> 초판은 *"`commercial-building-valuation.ts:99` 산식을 신규 leaf로 위임(중복 제거)"*이라 했다.
> **틀렸다.** 두 지점은 **다른 축**이다:
> · **§164⑧ 본체** — 구하는 값이 「**양도**당시 기준시가」. §80①1호 본문 단서(하한) **적용 대상**
> · **§164⑥ 준용** — 구하는 값은 「**취득**당시 기준시가」의 **분모**. 단서의 대상이 아니다
>
> 게다가 `commercial-building-valuation.ts:105~112`에 **2026-07-28 결정이 명문으로 기록**돼 있다 —
> *"❌ 분모 하한(≥ A) 미적용 … 적용하면 A < B 구간에서 납세자에게 불리하다.
> 명문 근거가 확인되기 전까지 적용하지 않는다(`feedback_no_unfavorable_application_without_legal_basis`)"*.
> 그대로 위임하면 이 결정을 **조용히 뒤집고** 기존 상가 결과가 움직인다.
>
> ⇒ 공유는 **비율 곱 core**(`delta × min(hold, adj) ÷ adj`)까지만. 하한은 §164⑧ 경로 전용
> 옵션(`applyFloor`)으로 분리하고 §164⑥ 준용은 **`false`로 현행 동작 보존**한다.
> ❌ **「단서는 1호 본문이니 §164⑥ 준용에도 걸어야 한다」 재제안 금지** — 단서가 규율하는 것은
> 「양도당시의 기준시가」이지 §164⑥ 분모가 아니다.

> 🔑 **수용 §164⑨와의 순서**: §164⑨(보상액 차감)는 *"법 §99①1호 가목부터 라목까지의 규정에 따른 가액에서 차감"*이므로 **§164⑧ 환산 후의 값**에서 차감한다. `transfer-tax-expropriation-valuation.ts:411,423`이 `input.standardPriceAtTransfer`를 읽으므로 STEP 0.47이 그보다 앞이면 자동 정합. → **V-3**으로 실측.

### 5-3. 입력 축 — 신규 필드

`TransferTaxInput`(`lib/tax-engine/types/transfer.types.ts:131~138` 인접)에 **선택 객체 1개**로 묶는다. 평면 필드 5개를 흩뿌리면 14지점 동기화 비용이 배가된다.

```ts
/** §164⑧·§80① 동일조정기간 양도당시 기준시가 환산 입력 */
sameAdjustmentPeriod?: {
  /** 가목(미고시) | 나목(2월 내 고시 + 확정신고 선택) — 미지정 시 "prev" */
  formula?: "prev" | "new";
  /** 가목: 전기의 기준시가 (§80②2호). §80③ 대체 산정값도 여기로 주입 */
  priorStandardPrice?: number;
  /** 나목: 새로운 기준시가 */
  newStandardPrice?: number;
  /** 조정월수 (§80②1호). 미입력 시 12 */
  adjustmentMonths?: number;
  /** 전기 기준시가 부존재 대체 근거 (§80③1~3호) — 표시·검증용 */
  priorBasis?: "direct" | "nearby_land" | "first_notice_rate" | "ratio_conversion";
  /** 값의 출처 — "lookup"(자동 조회) | "manual"(수동). 결과 표시·감사용 (Q-2) */
  priceSource?: "lookup" | "manual";
};
```

**Q-2(자동 조회) 배선 원칙**
- 조회는 **UI 층에서만** 한다. 엔진 leaf는 **숫자만** 받는다 — 엔진이 네트워크를 타면 순수 함수 원칙(Layer 2)이 깨진다.
- 조회 결과는 **폼 상태에 채워 넣고 사용자가 수정 가능**하게 둔다(`LandPriceLookupField` 기존 패턴 차용).
- **조회 실패·미고시 지역은 수동 입력으로 열어둔다.** 자동 조회를 필수 게이트로 만들면 입력 경로가 사라진다(memory `feedback_ui_gate_removes_sole_input_path`).
- 조정월수는 **고시일자 2건(전기 결정일·취득당시 결정일)에서 파생**한다 — 사용자가 월수를 직접 세지 않게 한다. 단 파생 불가 시 수동 입력 fallback.

`holdingMonths`는 **입력받지 않는다** — `acquisitionDate`·`transferDate`로 엔진이 산출한다(자동 안분 fallback 금지 원칙과 무관: 여기서는 **이미 필수인 두 날짜의 결정론적 파생값**이다).

---

## §6. 적용 범위 매트릭스 — 「모든 경우」의 전수 정의

| 자산 유형 (§99①1호) | 기준시가 원천 | §164⑧ 적용 | 전기 기준시가 부존재 시 (§80③) |
|---|---|---|---|
| **가목 토지** | 개별공시지가 | ✅ | 1호 — 지목·이용상황 유사 **인근토지**의 전기 기준시가 (수동 입력) |
| **나목 건물** | 국세청 건물기준시가 | ✅ | 2호 — `최초고시 기준시가 × 국세청 고시 기준율` (기존 `§164⑤` 산정기준율표 재사용) |
| **다목 오피스텔·상업용건물** | 국세청 호별 고시 | ✅ | 3호 — 비율환산 (`commercial-building-valuation.ts` 기존 구현 재사용) |
| **라목 단독주택(개별주택가격)** | 국토부 공시 | ✅ | 3호 — 비율환산 |
| **라목 공동주택(공동주택가격)** | 국토부 공시 | ✅ | 3호 — 비율환산 |
| 부동산에 관한 권리(입주권·분양권) | — | ❌ | §164⑧은 *"당해 **토지 또는 건물**"* 한정 |
| 주식·기타자산 | — | ❌ | 조문 대상 외 |

> §80③4호 상당(**§80④**): ③3호 적용 시 취득당시 또는 전기의 **나목 가액이 없으면 ③2호 준용** — 다목·라목 경로에서 건물분 결손 시 fallback.

---

## §7. Phase 계획

| Phase | 내용 | verify |
|---|---|---|
| ✅ **P-0** | **Pre-Do anchor** — 교재 사례1·2를 leaf 시그니처로 작성(실패 확인) + **V-5 안전망 실측** | anchor 2건 **RED** · 무력화 probe 실패건수 기록 |
| ✅ **P-0.5** | **월수 헬퍼 통일**(Q-1) — `calcStdPriceMonths` 신설 후 **`transfer-tax-commercial-step.ts:182` private `monthsBetween` 1곳만** 위임. 🔴 **`transfer-tax-aggregate-helpers.ts:146`(보유기간 내림)·`property-valuation/fiscal-year-annualize.ts:28`(상증)은 손대지 않는다 — 다른 축**(F-2) | **V-1** 회귀 diff 첨부 · 움직인 anchor 기대값 정정 · 미대상 2곳 무변경 grep |
| ✅ **P-1** | leaf 3종 신설 + 단위 테스트(가·나목·하한·cap·월수 경계) | 사례1=169,000,000 · 사례2=218,333,333 **GREEN** |
| ✅ **P-2** | `TransferTaxInput.sameAdjustmentPeriod` 타입 + STEP 0.47 배선 + `steps` 산출근거 1건 | 단건 엔진 anchor |
| ✅ **P-3** | ⑫Zod(`transfer-tax-*schemas.ts`) · ⑬body spread · ⑭route 매핑 (Date 변환 `toDate`) | grep 자가점검 3건 |
| ✅ **P-4** | `building-standard-price.ts:426` 트리거를 `classifySameAdjustmentPeriod`로 교체 + 하한 적용. 🔴 `commercial-building-valuation.ts`는 **비율 곱 core만 공유·`applyFloor:false`**(F-1 — 위임 아님) | 기존 상가 anchor **회귀 0**(부정형 단언 → **P-4 mutation**: `applyFloor`를 강제 `true`로 뒤집으면 상가 anchor가 실패해야 한다) |
| ✅ **P-5** | ⑤UI — 자산 카드에 §164⑧ 섹션(`ToggleCard`+`RadioCardGroup` 가/나목) · ⑥사이드바 · ⑦결과 카드 산식 | E2E 1건 |
| ✅ **P-6** | 겸용·일괄양도·다필지·부담부증여 경로 배선 (§5-2 표) | 경로별 anchor |
| ✅ **P-7** | §80③ 대체 산정 3종 + §80④ 준용 | 케이스 매트릭스 전수 |
| ✅ **P-8** 🆕 | **자동 조회 배선**(Q-2) — 전기·새 기준시가 + 고시일자→조정월수 파생. 자산 5종별 소스 분기 + **수동 fallback**. 🔑 **연도 선택은 §164③**(직전 고시분) — `recommendLandPriceYear()`(`lib/utils/land-price-year.ts:22`) 재사용, **취득/양도 비대칭 금지**(memory `feedback_standard_price_year_164_3_prior`) | V-6 결과대로 유형별 · 조회 실패 E2E 1건 · §164③ 연도 anchor |

**파일 크기 주의**: `lib/tax-engine/transfer-tax.ts`는 **현재 847줄로 hard cap 800을 이미 초과**했다. STEP 0.47은 본문에 인라인하지 말고 **`transfer-tax-same-period-step.ts` 신설 후 1줄 호출**로 넣는다(`runInheritedAcquisitionStep` 패턴 차용). 기회주의적 분리 대상이나 **본 작업 범위 밖**으로 두고 별건 기록.

---

## §8. 14개 동기화 지점

| # | 지점 | 대상 |
|---|---|---|
| ① 폼 상태 | `lib/stores/calc-wizard-asset-*.ts` | `sapFormula`·`sapPriorStdPrice`·`sapNewStdPrice`·`sapAdjustMonths`·`sapPriorBasis`·**`sapPriceSource`** (문자열) — 아래 매핑표 |
| ② initial | 동일 | 전부 `""` · `sapFormula="prev"` |
| ③ normalize | 동일 | 빈 문자열 → undefined |
| ④ API 변환 | `lib/calc/transfer-tax-api.ts` | `sameAdjustmentPeriod` 객체 조립 (전 필드 미입력 시 **객체 자체 미전송**) |
| ⑤ UI 위젯 | `components/calc/transfer/SameAdjustmentPeriodSection.tsx` (신설) | 게이트: 취득·양도 기준시가 동일 + 기간요건 충족 시에만 노출 |
| ⑥ 사이드바 | `lib/stores/transfer-per-asset-summary.ts:422,467` | 환산취득가액 추정에 정규화 반영 |
| ⑦ 결과 카드 | **4개 정본(실측)**: `results/TransferTaxResultView.tsx`(단건) · `results/BundledAllocationCard.tsx`(일반건물 일괄) · `results/MultiTransferTaxResultView.tsx`(다건) · `results/mixed-use/MixedUseResultCard.tsx`(겸용) | 단건 뷰만 배선하면 **일반건물 일괄에서 통째로 사라진다** — 같은 실패가 한 달에 2회 재발했고 **둘 다 E2E 전건 초록인 채 사용자 제보로 발견**됐다(memory `feedback_transfer_result_view_is_not_one`). ⚠️ `components/calc/results/transfer/`는 **카드 모음 디렉터리**이지 결과뷰가 아니다 |
| ⑧ validation | `lib/calc/transfer-tax-validate*.ts` | 가목→전기 필수 / 나목→새 기준시가 필수 / 조정월수 > 0. **④ fallback과 동일 규칙** |
| ⑨⑩ Zod enum | `lib/api/transfer-tax-*schemas.ts` | `formula`·`priorBasis` enum (메인 + 컴패니언 + `addPropertyRefines`) |
| ⑪ 자산-수준 fallback | route | `acquisitionDate` 기존 fallback 축 그대로 |
| **⑫ Zod 입력 객체** | `lib/api/transfer-tax-*schemas.ts` | `sameAdjustmentPeriodSchema` — **누락 시 침묵 strip** |
| **⑬ body spread** | `lib/calc/transfer-tax-api.ts` · `multi-transfer-tax-api.ts` | `callTransferTaxAPI` body |
| **⑭ route 엔진 매핑** | `app/api/calc/transfer/engine-input.ts:48` 인접 | **중첩 객체 통째 매핑** `sameAdjustmentPeriod: data.sameAdjustmentPeriod`. 날짜 필드가 없어 `coerceDates`는 불요이나, 같은 파일 `:49` 주석이 *"⑭ §164⑨ 특례(TS 미감지 침묵 strip 주의)"*로 **동일 함정의 선례**를 남겨뒀다 — 그 옆에 나란히 둔다 |

**폼 필드명 ↔ 엔진 필드명 매핑 (S-1 — 이름이 다르므로 표로 고정)**

| ① 폼(문자열) | → ④ 변환 | 엔진 `sameAdjustmentPeriod.*` | 비고 |
|---|---|---|---|
| `sapFormula` | 그대로 | `formula` | `"prev"` \| `"new"` |
| `sapPriorStdPrice` | `parseAmount` | `priorStandardPrice` | 가목 필수 |
| `sapNewStdPrice` | `parseAmount` | `newStandardPrice` | 나목 필수 |
| `sapAdjustMonths` | `Number` | `adjustmentMonths` | 미입력 시 엔진 기본 12 |
| `sapPriorBasis` | 그대로 | `priorBasis` | §80③ 근거 4택 |
| `sapPriceSource` | 그대로 | `priceSource` | `"lookup"` \| `"manual"` — **표시·감사 전용, 세액 무영향** |

> ⚠️ `priceSource`도 **⑫⑬⑭를 통과시킨다.** 세액에 영향이 없다고 Zod에서 빼면 결과 화면의
> 「자동 조회」 배지가 조용히 사라진다 — 침묵 strip의 전형이다.

> ⚠️ **anchor 진입점 주의** (memory `feedback_leaf_anchor_skips_zod_layer`): leaf 직접 호출 anchor는 ⑫를 태우지 않는다. **route 경유 anchor를 최소 1건** 둔다. 단 route에 body를 직접 넣는 anchor는 ④를 건너뛰므로, **폼→④→⑬→⑫→⑭ 전 구간** anchor를 P-3에 배치한다.

---

## §9. 레지스터

### V — 미검증(착수 전 실측 필요)

| ID | 항목 | 방법 |
|---|---|---|
| **V-1** ✅ | `monthsBetween` 수정 시 회귀 폭 — **실측 완료(2026-08-24)** | `transfer-tax-commercial-step.ts:182`를 §80⑤ 절상 정정판으로 교체 후 `__tests__/tax-engine/ __tests__/calc/` 실행 → **회귀 0건**(1,039파일 12,168건 전부 통과). ⇒ **초판 판정 뒤집힘**(§3-2 참조) |
| **V-2** ✅ | 나목에서 `보유월수 > 조정월수` **도달 가능성** — **전수 실측 완료(2026-08-24)** | 나목 요건(취득결정일 ≤ 취득일 · 양도일 < 새결정일 ≤ 양도일+2월 속월 말일) 아래 **20,199,325 조합** 전수 → `보유 > 조정` **0건**. ⇒ 나목 cap은 **도달 불가**이며 넣지 않는다(A-9 폐기) |
| **V-3** | §164⑨(수용 차감)와 STEP 0.47 **순서 정합** | 수용 + 동일조정기간 동시 성립 케이스 anchor |
| **V-4** | 겸용주택에서 **토지·건물 조정월수 상이** 시 §80⑤ 후단(각각 계산 후 합산) 도달 경로 존재 여부 | 겸용 경로 probe |
| **V-5** ✅ | 현행 안전망 크기 — **실측 완료(2026-08-24)** | `calcSameYearTransferStdPrice`를 `acqStd` 상수 반환으로 무력화 → **4건 실패 / 2파일 / 12,168건 중**. 확인된 것: `__tests__/tax-engine/building-standard-price/anchor.test.ts` **BSP-08**(가목)·**BSP-14**(나목, 65,700,000→61,400,000). 🔴 **그러나 4건 전부 「동일연도」 케이스다** — 법정 요건인 **연도 교차(취득연도+1년 말일 이전)는 안전망 0건**이므로 A-1·A-2가 **필수**다 |
| **V-6** ✅ | 자산 유형별 고시일자·전기 가격 조회 가능 여부 — **부분 해소(2026-08-24)** | `app/api/address/standard-price/route.ts` 실측: `pblntfDe`(**공시일**) → `announcedDate`로 반환(`:209,288,304`), `year` 쿼리 파라미터로 **과거 연도 조회 가능**(`:222` → `stdrYear`로 API 전달 `:125`). ⇒ **전기 기준시가·고시일 자동 조회 성립**. 다목(오피스텔·상가)은 `lib/stdprice` 파티션에 고시일자 실재. **잔여**: 건물(국세청 기준시가) 경로는 계산기 산출이라 조회 대상 아님 |
| **V-8** ✅ | 개별주택 `pblntfDe` 부재 시 추정 공시일이 조정월수를 흔드는가 — **실측 확정(2026-08-24)** | `standard-price/route.ts:323~324` 실측: `indvdHit.item.pblntfDe ?? \`${stdrYear}0429\`` — **추정값이 실제값과 같은 `announcedDate` 필드로 반환되어 호출부가 구분 불가**. 4/29 추정은 월 경계(4/29 vs 5/1)에서 **조정월수가 1개월 어긋난다**. ⇒ **확정**: 응답에 `announcedDateEstimated: boolean` 추가 → `true`면 조정월수 **자동 파생 중단 + 수동 입력 전환 + 안내**. 「추정 공시일로 월수를 세지 않는다」 |
| **V-9** 🆕 | `applyFamilyBusinessCgtStep`(STEP 0.42) **조기 반환**이 STEP 0.47을 우회하는가 — **해소(F-9)** | `transfer-tax-family-business.ts:233~234` 실측: 내부에서 `calculateTransferTax`를 **재귀 호출**(의제·원취득가 2회)하므로 재귀 안에서 STEP 0.47을 탄다. **우회 없음** ✅ |
| **V-10** 🆕 | 법령 검증 manifest 신규 등록 필요 여부 — **해소(F-10)** | `additions-transfer-decree.ts:164` 실측: `"소득세법 시행령 §164"` **조 단위** 커버(항 단위 아님) + `:392` `"소득세법 시행규칙 §80"` 등록됨 ⇒ **신규 등록 불필요** ✅ |
| **V-7** | `pickNoticeDate`(`lib/stdprice/pick-notice-date.ts:24`)를 **전기 결정일 산출**에 재사용 가능한지 | `pickNoticeDate(dates, acqNoticeDate−1일)` = §80②2호 전기 결정일. 다목 외 자산에 동일 데이터 축이 있는지 확인 |

### Q — 사용자 결정 **확정** (2026-08-24)

| ID | 질문 | **확정** | 파급 |
|---|---|---|---|
| **Q-1** | `monthsBetween` 결함(§3-2)을 이번에 같이 고칠 것인가 | ✅ **같이 수정** | P-0.5로 편입. ~~기존 결과가 움직인다~~ → **V-1 실측 회귀 0건**(§3-2 정정). 실제 리스크는 **안전망 부재** ⇒ A-8·A-11 anchor가 **동시 필수**. 통일 범위는 **§80⑤ 축 1곳뿐**(F-2) |
| **Q-2** | 전기·새 기준시가를 수동 입력으로 갈 것인가, 자동 조회까지 넣을 것인가 | ✅ **자동 조회** | §10 비범위에서 **삭제**. **V-6이 착수 게이트로 승격** — 자산 유형별 고시일자 데이터 유무가 확인돼야 조정월수 자동 산출이 성립한다. 조회 실패·데이터 부재 시 **수동 입력 fallback 필수**(무입력 차단 금지) |
| **Q-3** | 나목(제2산식) 가/나목을 사용자가 고르게 할 것인가 | ✅ **사용자 선택** | `RadioCardGroup` 2택. 요건(양도일부터 2월 되는 날이 속하는 월 말일까지 고시) 미충족 시 **나목 비활성 + 사유 표시** |

---

## §10. 비범위 (명시)

- **입주권·분양권** — §164⑧은 *"당해 토지 또는 건물"* 한정
- **재개발 권리가액 축**(`transfer-tax-redevelopment.ts`) — 별도 평가 체계
- **상속·증여세 기준시가** — §164는 양도세 전용(상증은 상증법 §60~66)
- **취득세·재산세·종부세** 시가표준액 — 지방세법 §4 별도 체계
- `transfer-tax.ts` 847줄 → 800 이하 분리 — 별건 기록
- **미고시 지역 자동 조회** — 데이터가 없는 시군구는 수동 입력 유지(V-6 결과에 따름)

---

## §11. Anchor 명세

| ID | 케이스 | 기대 |
|---|---|---|
| **A-1** | 교재 사례1 — 공동주택, 취득 2005-07-28(161,000,000) · 전기 149,000,000 · 양도 2006-03-24, 조정월수 12 | 양도기준시가 **169,000,000** (보유월수 8) |
| **A-2** | 교재 사례2 — 공동주택, 취득 2005-09-07(210,000,000) · 새 220,000,000 · 양도 2006-06-10, 조정월수 12 | 양도기준시가 **218,333,333** (보유월수 10, cap 미적용) |
| **A-3** | 하한 발동 — 전기 > 취득당시(하락장, `delta < 0`) | 결과 == 취득당시 기준시가 (§80①1호 단서) · `flooredToAcquisition === true` |
| **A-4** | 기간요건 미충족 — 취득 2005-03-01 → 양도 2007-06-01 | §80①2호 → **취득당시 기준시가** |
| **A-5** | 트리거 미성립 — 취득·양도 기준시가 상이 | **입력값 무변경**(회귀 0) |
| **A-6** | cap 발동 — **가목**에서 보유월수 > 조정월수 | `h' = 조정월수`로 clamp → `취득당시 + delta` |
| ~~A-9~~ | ~~나목 cap 도달~~ | ❌ **anchor 불필요 — V-2 전수 실측으로 도달 불가 확정**(2,020만 조합 0건). 코드에는 나목 cap 분기를 **넣지 않고**, `calcSameAdjustmentPeriodStdPrice` 주석에 도달 불가 근거를 남긴다 |
| **A-10** 🆕 | 하한 발동 ⟺ `delta ≤ 0` **동치 불변식** | `delta > 0` 전 구간에서 `flooredToAcquisition === false` · `delta ≤ 0` 전 구간에서 `value === 취득당시` |
| **A-7** | route 경유(⑫⑬⑭ 관통) — 폼 값 → 세액 변동 | 신규 필드 제거 시 세액이 **달라져야** 함(구별력 확인) |
| **A-8** 🔺 | 월수 경계 — 응당일 도달 + 끝수 1일 (`2005-09-07 → 2006-06-10`) | 절상되어 **10월**(현행 9월) — §80⑤. **P-0.5 동시 필수**(V-1로 안전망 0 확인) |
| **A-11** 🆕 | §164⑥ 준용 C의 월수 경계 — 취득일이 최초고시일 응당일 **직후** | 절상 반영. P-0.5가 만든 동작을 고정 (V-1 회귀 0 = 기존 anchor가 이 축을 안 봄) |

> **A-7 필수 사유**: memory `feedback_api_trigger_without_input_path_is_noop` — 엔진만 열고 입력 경로를 안 열면 세액 변화 0인 no-op이 된다.

---

## §12. 착수 게이트 (넘기 전 필수)

1. **V-5 안전망 실측** — 무력화 probe로 현행 회귀 안전망 크기를 먼저 잰다. 0건이면 P-1에서 characterization 테스트를 먼저 쌓는다.
2. **P-0 anchor RED 확인** — 사례1·2가 현행 코드로 실패하는 것을 눈으로 본다(§3-1 단정의 실증).
3. ~~Q-1~Q-3 사용자 회신~~ → ✅ **확정 완료(2026-08-24)**.
4. ~~V-6 조회 가능성 실측~~ → ✅ **해소**(공시일·과거연도 조회 성립). 잔여는 **V-8**(추정 공시일 처리).
5. 🆕 **V-1 회귀 실측** — Q-1(같이 수정) 확정으로 P-0.5가 선행이 됐다. 회귀 diff 없이 P-1로 넘어가지 않는다.

### 🔴 잔존 착수 차단 항목 (verdict 게이트)

| ID | 왜 설계를 가르는가 |
|---|---|
| ~~V-1~~ | ✅ 해소 — 회귀 0건. P-0.5 안전. 대신 A-8·A-11 필수 |
| ~~V-2~~ | ✅ 해소 — 전수 0건, 나목 cap 분기 **불필요** |
| ~~V-6~~ | ✅ 해소 — 공시일·과거연도 조회 성립 |
| ~~V-8~~ | ✅ 해소 — 추정 플래그 노출 + 추정 시 수동 전환으로 확정 |
| ~~V-9·V-10~~ | ✅ 해소 |

**⇒ 미해소 설계-영향 항목 없음. verdict `clean` — Do 진입 가능.**

> 잔여 **V-3**(§164⑨ 순서)·**V-4**(겸용 조정월수 상이)·**V-7**(`pickNoticeDate` 재사용)은
> **설계를 가르지 않는다** — 각각 P-6·P-6·P-8 착수 시점의 확인 항목이다. 착수를 막지 않는다.

> 이 게이트는 §7 이후 단계를 넘어선 뒤에도 유효하다(memory `feedback_plan_gate_survives_after_override`).


---

## §13. 자가 검토 루프 결과 (2026-08-24)

`plan-design-self-review-loop` v4 · 깊이 **L3** · 인라인 검토(문서 1개 · 442줄).

### 판정 뒤집힘 3건 — 검토가 실제로 방향을 바꿨다

| # | 초판 | 정정 | 근거 |
|---|---|---|---|
| **1** | §164⑥ 준용에 신규 leaf **위임**(중복 제거) | **위임 철회** — 비율 곱 core만 공유, 하한은 `applyFloor` 옵션으로 분리 | `commercial-building-valuation.ts:105~112`에 **2026-07-28 결정**이 명문 기록. 두 지점은 「**양도**당시」 vs 「**취득**당시 분모」로 **다른 축** (F-1) |
| **2** | 월수 헬퍼를 **공용 leaf 1개로 통일**(dual-truth 제거) | **§80⑤ 축 1곳만** 통일 | `monthsBetween`이 **3축** 실재 — 보유기간 **내림**(§95·§104) / §80⑤ **절상** / 상증 사업연도. 전역 치환은 `feedback_rename_same_name_two_axes` 위반 (F-2) |
| **3** | 월수 헬퍼를 고치면 **기존 상가 결과가 움직인다** | **회귀 0건** — 대신 **안전망이 0**이다 | V-1 실측: 정정판 교체 후 1,039파일 **12,168건 전부 통과**. 리스크가 반대편에 있었다 ⇒ A-8·A-11 신규 anchor 필수 |

### mutation probe 실측 3건

| probe | 결과 | 함의 |
|---|---|---|
| **V-5** 안전망 | `calcSameYearTransferStdPrice` 무력화 → **4건 실패 / 12,168** (BSP-08 가목 · BSP-14 나목) | 안전망 존재하나 **전부 「동일연도」** — 법정 요건인 **연도 교차는 0건** ⇒ A-1·A-2 필수 |
| **V-1** 회귀 | 월수 정정판 교체 → **0건 실패** | 고쳐도 안전 · 고친 뒤도 무방비 |
| **V-2** 전수 | 나목 요건 아래 **20,199,325 조합** → `보유 > 조정` **0건** | 나목 cap **도달 불가** ⇒ 분기 미구현, A-9 폐기 |

### 검토 발견 종합

- **Critical 3** (F-1 dual-truth · F-2 정책위반 · F-5 정수 연산) — 전건 해소
- **High 4** (F-3 STEP 줄번호 `88/114/122`→**82/116/127** · F-4 결과뷰 4개 정본 · F-6 §164③ 연도 · F-11 트리거 정본) — 전건 해소
- **blast-radius 3** (B-1 `applyFloor` 시그니처 누락 · B-2 cap 가/나목 미구분 · B-3 A-6 표현) — 전건 해소
- **STEP 10 내부 정합 4** (S-1 폼↔엔진 필드명 매핑 · S-2 **P-4가 철회된 위임을 계속 지시**(모순) · S-3 A-9 폐기 · S-4 ⑭ 중첩 객체) — 전건 해소
- **파생 불변식 1건 도출**: 하한 발동 ⟺ `delta ≤ 0` (A-10으로 고정)

### 산출물 게이트 (STEP 5 / 12)

`.engine.design.md`·`.ui.design.md`는 **현 시점 생성하지 않는다**.
Phase 수(10개)는 조건 1을 충족하나, 케이스 매트릭스·설계·anchor·14 동기화 지점이 **본 계획서 한 문서에 이미 수렴**해 있어 지금 분리하면 내용 없는 중복이 된다(스킬 원칙 — *"문서를 위한 문서를 만들지 않는다"*).

⇒ **P-5(UI) 착수 시점에 `.ui.design.md`만 생성**한다. 그때는 ⑤ 위젯 게이트 조건·RadioCardGroup 2택·자동 조회 실패 fallback의 **ASCII 레이아웃**이 본문을 압도하기 때문이다.

### verdict

**`clean`** — 미해소 Critical/High 0 · 설계-영향 V-n 0 · 재검토 신규 모순 0.

잔여 **V-3**(§164⑨ 순서) · **V-4**(겸용 조정월수 상이) · **V-7**(`pickNoticeDate` 재사용)은 설계를 가르지 않는 **착수 시점 확인 항목**이며 각각 P-6·P-6·P-8에 귀속된다.

⇒ 다음: `pre-do-anchor-verification`(P-0: A-1·A-2 RED 확인) → `single-response-do-execution`.


---

## §14. 착수 기록 — P-0 · P-0.5 · P-1 완료 (2026-08-24)

### 산출물

| 파일 | 내용 |
|---|---|
| `lib/tax-engine/same-adjustment-period-std-price.ts` (신규) | leaf 3종 — `calcStdPriceMonths` · `classifySameAdjustmentPeriod` · `calcSameAdjustmentPeriodStdPrice` |
| `lib/tax-engine/legal-codes/transfer.ts` | 법령 상수 7건 추가(§164⑧ · §80①1호 가·나목 · 단서 · 2호 · §80②1호 · §80⑤) |
| `lib/tax-engine/transfer-tax-commercial-step.ts` | private `monthsBetween` → `calcStdPriceMonths` **위임**(§80⑤ 축 단일화) |
| `__tests__/tax-engine/transfer/same-adjustment-period-std-price.anchor.test.ts` (신규) | anchor **21건** |

### 검증

- **P-0 RED 확인** — 모듈 부재로 import 실패(예정된 상태)
- **P-1 GREEN** — 교재 사례1 **169,000,000** · 사례2 **218,333,333** 정확 재현
- `npx tsc --noEmit` **0건**

### 착수 중 발견 2건 — 계획서에 없던 것

#### D-1 🔴 초판 월수 산식이 **민법 §160②③를 반영하지 못했다**

계획 §5-1의 초판 구현은 응당일을 「대상 월 말일로 clamp」하는 방식이었다. **A-13에서 깨졌다**:
`2005-01-31 → 2005-02-28`이 **2월**로 나왔다(정답 1월).

원인은 clamp가 만료일과 응당일을 뒤섞은 것이다. 민법은 두 경우를 **구분**한다:
- **§160②** 응당일이 있으면 → 만료일 = **응당일 전일** (7/28 + 7월 = 2/28 → 만료 2/27)
- **§160③** 최종 월에 해당일이 **없으면** → 만료일 = 그 월의 **말일** (1/31 + 1월 → 만료 2/28)

⇒ 「만 m개월의 **만료일**」을 직접 정의하고 `만료일 ≤ 양도일`을 만족하는 최대 m을 찾는 방식으로
재구현했다. 21 anchor 전건 통과.

#### D-2 🔴 §164⑥ 준용 C 축은 **게이트가 닫혀 있어** 검증된 적이 없다

A-11w(배선 anchor)를 처음 작성했을 때 **구별력 0**이 나왔다 — `prevStdPriceSum`(B)을 넣어도
결과가 움직이지 않았다. 추적 결과 §164⑧ 준용 게이트가

```
commercial-building-valuation.ts:268
const sec164_8Applicable = combinedStdAtAcq === combinedStdAtFirst;
```

즉 **취득시 기준시가합 == 최초고시시 기준시가합**일 때만 열린다. 기존
`commercial-164-6-proviso-echo.anchor.test.ts`의 fixture는 두 시점 기준시가를 **다르게** 두어
(`120,000,000` vs `150,000,000`) 이 게이트가 **한 번도 열리지 않았다**. 그래서 그 파일의
*"취득연도가 달라도 환산 금액이 동일하다"* 단언이 통과했던 것이고, **V-1 회귀 0건의 실체**가
이것이다 — C 축을 보는 테스트가 없었던 게 아니라 **게이트가 닫혀 C가 쓰이지 않았다**.

⇒ A-11w는 두 시점 기준시가를 같게 둬 게이트를 열고, 취득일만 `2004-03-01`(C=11) ↔
`2004-03-15`(C=10)로 바꿔 **환산 기준액이 실제로 갈리는지**를 단언한다. 이제 배선이 잠겼다.

> 🔑 **교훈**: 「anchor가 있다」와 「anchor가 그 경로를 탄다」는 다르다. 게이트가 닫힌 fixture는
> 조용히 통과하며 커버리지 착시를 만든다. 배선 anchor는 **구별력(값이 갈리는가)** 을 먼저 확인한다.

### 다음 → P-3 (⑫⑬⑭) — ✅ 완료(§16)


---

## §15. 착수 기록 — P-2 완료 (2026-08-24)

### 산출물

| 파일 | 내용 |
|---|---|
| `lib/tax-engine/types/transfer.types.ts` | `SameAdjustmentPeriodTransferInput` 신설 + `TransferTaxInput.sameAdjustmentPeriod` |
| `lib/tax-engine/transfer-tax-same-period-step.ts` (신규) | STEP 0.47 헬퍼 — 요건 판정 → 치환 → 산출근거 step |
| `lib/tax-engine/transfer-tax.ts` | STEP 0.46 직후 · `let workingInput` 직전에 1줄 호출 |
| `__tests__/tax-engine/transfer/same-adjustment-period-engine.anchor.test.ts` (신규) | 배선 anchor **9건** |

`holdingMonths`는 **입력받지 않는다** — 이미 필수인 `acquisitionDate`·`transferDate`에서 §80⑤로 파생한다.

### 실측 — 세액이 실제로 움직인다

교재 사례1을 엔진에 통과시킨 결과(양도가액 10억, 다주택·비과세 미적용):

| | §164⑧ 미적용 | §164⑧ 적용(가목) |
|---|---|---|
| 양도당시 기준시가 | 161,000,000 | **169,000,000** |
| 환산취득가액 | 1,000,000,000 | **952,662,721** |
| 양도차익 | **0** | **42,507,279** |
| 총 납부세액 | **0** | **30,805,604** |

### 🔑 발견 D-3 — 이 조문이 존재하는 이유가 실측으로 보인다

§164⑧을 적용하지 않으면 **환산취득가액 = 양도가액 × (취득기준시가 ÷ 양도기준시가)**의
분자와 분모가 **같아져** 환산취득가액이 양도가액과 일치하고, **양도차익이 구조적으로 0**이 된다.
엔진은 이 경우 차익 0으로 조기 반환한다(`steps = [양도차익 계산]` 하나뿐).

⇒ §164⑧은 「보정 옵션」이 아니라 **환산 모드에서 과세가 성립하기 위한 필수 경로**다.
현행처럼 「연도 동일」로 트리거를 좁히면 연도 교차 케이스에서 **세액이 통째로 0으로 떨어진다**.

> ⚠️ 이 관측은 **환산취득가액 모드** 기준이다. 실지거래가액 모드에서는 §164⑧이 기준시가
> 과세·감면 안분 등 다른 경로로 작용하며 차익 0 현상은 일어나지 않는다.

### mutation 검증 (구현 후)

STEP 0.47 호출을 무력화(`false ? … : undefined`)했을 때:

| 대상 | 결과 | 판정 |
|---|---|---|
| 엔진 anchor 9건 | **6 실패 / 3 통과** | ✅ 조준 정확. 통과한 3건은 *"미제공이면 no-op"*·*"트리거 미성립"*·*"상대 기준시가 미제공"* — **무변화를 단언하는** 케이스라 무력화 시에도 통과하는 것이 맞다 |
| leaf anchor 21건 | **21 통과** | ✅ 과녁 이탈 없음(엉뚱한 곳이 무더기로 깨지지 않는다) |

### 파일 크기

`lib/tax-engine/transfer-tax.ts` **847 → 857줄**. hard cap 800을 **이미 초과한 상태**였고
본 변경은 +10줄(호출 1줄 + 주석)이다. 계획 §7대로 로직은 별도 파일로 뺐다.
분리는 **별건**으로 남긴다 — 본 작업 범위에서 800줄 분해를 시도하면 diff가 회귀 위험을 가린다.

### 다음

**P-3** — ⑫Zod(`sameAdjustmentPeriodSchema`) · ⑬body spread · ⑭route 매핑.
현재 엔진은 받을 준비가 됐지만 **API를 통해서는 도달하지 못한다**(⑫에서 침묵 strip).


---

## §16. 착수 기록 — P-3 ~ P-8 완료 (2026-08-24)

### P-3 API 배선 (⑫⑬⑭)

| 지점 | 파일 |
|---|---|
| ⑫ Zod | `transfer-tax-schema-sub.ts` `sameAdjustmentPeriodSchema`(신설) + 컴패니언 · `transfer-tax-schema.ts` 메인 |
| ④⑬ | `transfer-same-adjustment-period-input.ts`(신설, **단일 소스**) → 단건·다건·컴패니언 3경로 공용 |
| ⑭ | `engine-input.ts` · `multi/route.ts` · `bundled-split-helpers.ts`(+`CompanionRawAsset` 타입) |
| anchor | `__tests__/calc/same-adjustment-period-api-pipeline.test.ts` **8건** — ②③④⑬⑫⑭ 전 계층 관통 + OFF 구별력 |

`priceSource`도 ⑫⑬⑭를 통과시킨다 — 세액 무영향이라고 빼면 결과 화면의 「자동 조회」 배지가 조용히 사라진다.

### P-4 건물계산기 트리거 교체

`building-standard-price.ts:426`의 `transferYear === acquisitionYear`를 법정 요건
(`transferYear <= acquisitionYear + 1`)으로 넓히고 §80①1호 단서(하한)를 적용했다.

#### 🔴 발견 D-4 — 트리거를 넓히자 **기존 호출부가 무너졌다**

`phd-3point-batch.anchor` 2건이 즉시 실패했다. 3시점 배치는 보유월수를 쓰지 않는데, 넓어진
트리거가 그 입력을 §164⑧ 분기로 끌어들여 *"보유월수 필수 입력"*으로 떨어뜨렸다.

원인은 **트리거의 의미가 달라졌다는 것**이다. 「연도 동일」은 연 1회 고시 전제에서
「같은 고시분」을 사실상 함의했지만, **연도가 다르면 서로 다른 고시분일 수 있어** §164⑧의
전제(취득·양도 기준시가 동일)가 깨진다. 이 계산기는 기준시가를 **산출하는 주체**라 그
동일성을 스스로 알 수 없다.

⇒ **연도 교차 구간은 호출부가 `holdingMonths`를 줄 때만 진입**하도록 가드를 넣었다.
같은 연도는 종전 그대로다(회귀 0).

> 🔑 게이트를 넓힐 때는 **넓어진 쪽으로 들어오는 기존 호출부**를 봐야 한다
> (memory `feedback_ui_gate_expansion_activates_latent_defect`와 같은 구조).

`commercial-building-valuation.ts`는 **위임이 아니라 core 공유**로 바꿨다 —
`applyFloor: false`로 2026-07-28 결정(하한 미적용)을 보존한다.
**mutation 확인**: `applyFloor`를 `true`로 뒤집으면 상가 anchor **1건이 실패**한다 —
종전에는 이 결정을 지키는 안전망이 없었다.

### P-5 UI (①~⑧)

- ① `AssetForm` +7 (`sapEnabled`·`sapFormula`·`sapPriorStdPrice`·`sapNewStdPrice`·`sapAdjustMonths`·`sapPriorBasis`·`sapPriceSource`) · ② factory 기본 **OFF** · ③ `migrateAsset` stale 가드
- ⑤ `SameAdjustmentPeriodSection.tsx`(신설) — `ToggleCard` + 가/나목 `RadioCardGroup` + §80③ 근거 4택
- ⑥ `transfer-per-asset-summary.ts` — 사이드바 프리뷰가 **엔진과 같은 leaf** 사용
- ⑦ `DetailedStatementFormulaBuilders.ts` — 환산 산식에 §164⑧ 고지.
  **결과뷰 4개 전부가 상세 명세서 카드를 렌더**함을 실측 확인(2·3·2·2회) ⇒ 한 곳이면 네 경로 도달
- ⑧ `transfer-tax-validate-sec164.ts` `sameAdjustmentPeriodError` — ④와 **같은 fallback**
  (조정월수 미입력은 차단하지 않는다)

### P-6 특수 경로 — 실측으로 갈렸다

| 경로 | 판정 | 근거 |
|---|---|---|
| 다건·일괄 | ✅ **자동 도달** | `transfer-tax-aggregate.ts:171`이 항목마다 `calculateTransferTax`를 부른다 → STEP 0.47이 항목별로 적용 |
| 다필지 | ✅ **자동 도달** | `handleMultiParcelBranch`가 STEP 0.47 이후의 `input`을 받는다 |
| **겸용주택** | 🔴 **미도달 → 명시 차단** | `calcMixedUseTransferTax`가 **별도 진입점**(route.ts:392) |
| **부담부증여** | 🔴 **미도달 → 명시 차단** | 안분이 `landStdPriceAtTransfer`·`buildingStdPriceAtTransfer`라는 **다른 필드**를 쓴다 |

두 경로 모두 §80⑤ 후단(*"토지와 건물 기준시가 조정월수가 서로 다른 경우에는 각각 계산하여
합한 금액으로 한다"*)에 따라 **부분별 전기 기준시가·조정월수**가 필요한데, 현재 입력 모델은
자산당 1쌍뿐이다. 한 쌍을 양쪽에 쓰면 **조용히 틀린 세액**이 나온다.

⇒ 입력 모델을 부분 축으로 확장하기 전까지 **⑧에서 차단하고 사유를 말한다**. ⑤ 게이트도 같은
조건으로 막아 차단 메시지만 보게 두지 않는다. **침묵 no-op보다 차단이 낫다.**

### P-7 §80③ 전기 기준시가 부존재 대체

`calcPriorStdPriceSubstitute` — 3호(비율환산) 우선, 합계액이 없으면 **§80④ 준용**으로 2호
(최초고시 × 기준율). 둘 다 불가하면 `null`(**추정하지 않는다**).
1호(인근토지)는 **산정이 아니라 조사**라 계산 대상에서 제외하고 출처 표기만 한다.

### P-8 자동 조회 (Q-2)

- `same-adjustment-period-lookup.ts`(신설) — §164③ 연도 선택(`recommendLandPriceYear` 재사용,
  **취득·양도 비대칭 금지**) + §80②1호 조정월수 파생
- `standard-price/route.ts` — **`announcedDateEstimated` 플래그 신설**. 종전에는 추정 공시일
  (`stdrYear + "0429"`)이 실제값과 **같은 필드로 섞여** 나가 호출부가 구분할 수 없었다.
  추정이면 조정월수 파생을 **끄고 수동 입력으로 안내**한다 — 월 경계(4/29 ↔ 5/1)에서 1개월이
  어긋나기 때문이다.
- 조회는 **UI 층에서만** 한다. 엔진 leaf는 숫자만 받는다(Layer 2 순수성).
- 조회 실패·미고시는 **수동 입력을 열어둔다** — 자동 조회를 필수 게이트로 만들면 입력 경로가 사라진다.

### 잔여 (범위 밖 명시)

| 항목 | 사유 |
|---|---|
| 겸용주택·부담부증여 **부분별 축** | §80⑤ 후단 대응에 입력 모델 확장 필요. 현재는 차단 |
| §80③1호 인근토지 **자동 선정** | 유사 토지 판단은 엔진 대상이 아니다 |
| `transfer-tax.ts` 800줄 분해 | 종전부터 초과 상태. 별건 |


---

## §17. 코드 품질 게이트 — `/code-review high` 결과 및 처리 (2026-08-25)

리뷰가 **High 2 · Medium 3 · Low 3**을 냈고 전건 실증 지적이었다. High/Medium은 전건 수정, Low는 2건 수정·1건 기록.

### High

**H-1 — ⑤ 게이트와 ⑧ 차단이 겹쳐 dead-end**
`SameAdjustmentPeriodSection`은 토글을 **끌 수 있는 유일한 위젯**인데 렌더 조건이 좁고,
`sameAdjustmentPeriodError`는 `sapEnabled`만 보고 차단한다. 토글을 켠 뒤 취득가액 산정 방식을
실지거래가액으로 되돌리면 **섹션은 사라지고 차단은 남아** 빠져나올 수 없다.
겸용·부담부증여 차단 메시지가 *"「…환산」을 꺼주세요"*라고 하는데 정확히 그 조건에서 토글이
사라지는 것도 같은 함정이었다.
⇒ **`asset.sapEnabled ||` 를 게이트 앞에 붙여 켜져 있으면 항상 렌더**한다.

**H-2 — 자동 조회가 `propertyType`을 안 보내 토지에서 엉뚱한 값**
route 기본값이 `housing`(`standard-price/route.ts:221`)이라 토지 자산에서 개별공시지가 대신
주택 공시가격이 조회된다. 게다가 토지 분기의 `price`는 **원/㎡**(총액 아님)로 단위축도 다르다.
⇒ `propertyType` 명시 + 토지는 **면적을 곱해 총액 환산**, 면적을 모르면 **채우지 않고 안내**한다.

### Medium

**M-3 — 나목에 cap이 없어 비율이 100%를 넘는다**
V-2 전수 실측은 「나목 요건이 성립할 때」의 이야기였는데 **엔진은 그 요건을 검증하지 않는다**
(새 고시일을 입력받지 않는다). 실측 반례: 취득 2005-03-01 · 양도 2006-11-01 → 보유 21월 /
조정 12월 → `1억 + 1천만 × 21/12 = 117,500,000` — **실제 새 기준시가 1.1억을 넘어선다**.
⇒ 법문에 없는 clamp를 넣는 대신 **요건 위반 조합을 계산 대상에서 뺀다**(엔진 no-op) +
**⑧이 사유를 말한다**(침묵 no-op 아님).

**M-4 — §164⑥ 분모의 절사 방향이 바뀌어 1원 회귀**
`applyFloor: false` 경로는 delta가 음수인데, 크기를 먼저 floor하고 부호를 되붙이면
**0 방향 절사**가 되어 종전 `Math.floor(A + (A−B)·ratio)`의 아래 방향과 1원 갈린다
(실측 A=100·B=111·C=5·D=12 → 종전 **95** / 부호분리 **96**).
leaf 주석이 근거로 든 「delta ≤ 0 단락」은 `applyFloor` 참일 때만 발동해 **이 경로에 성립하지 않았다**.
⇒ 음수 delta는 **종전 산식을 그대로** 쓴다. anchor 3건으로 고정.

**M-5 — 넓힌 게이트가 실 입력 경로에서 도달 불가**
엔진 게이트를 `transferYear <= acquisitionYear + 1`로 넓혔지만, `holdingMonths`를 채우는
**유일한 프로덕션 호출부**(`building-std-price-form.ts:490`)가 **같은 연도일 때만** 채운다.
⇒ 새 조건절이 **어떤 실제 입력으로도 진입할 수 없었다** — 인용한 집행기준 2건은 여전히 미해결.

⇒ 폼에 **`crossYearSameAdjust` opt-in**을 신설했다. 같은 연도는 연 1회 고시 전제상 자동이지만,
연도가 다르면 서로 다른 고시분일 수 있어 §164⑧ 전제를 계산기가 확인할 수 없다 —
**사용자가 명시할 때만** 환산 경로로 간다. `validateBuildingStdPriceForm`도 같은 축으로 넓혔고,
`BuildingStdPriceForm`에 토글을 노출했다. 도달성 anchor 4건.

> 🔑 **「게이트를 넓혔다」와 「입력이 그 게이트에 닿는다」는 다르다.** 엔진만 열고 폼을 그대로
> 두면 조건절은 dead code다(memory `feedback_api_trigger_without_input_path_is_noop`와 같은 축).

### Low

- **L-6** 내 변경이 고아로 만든 `calcSameYearTransferStdPrice`(16줄) **제거**.
  `calcPriorStdPriceSubstitute`는 §80③ 구현체로 남기되 **UI 미배선**임을 §16 잔여에 기록.
- **L-7** 조회 결과에 금액이 없으면 기존 입력을 빈 값으로 덮어쓰던 것 → **덮어쓰지 않고 안내**.
- **L-8** (기록만) 사이드바 프리뷰는 `standardPriceAtTransfer` raw를, ⑤ 게이트는 증환지 fallback이
  적용된 `effTotal`을 본다. 증환지 증가분 자산에서 UI는 섹션을 띄우지만 사이드바는 종전 값을
  보여준다. 표시 계층 한정이라 세액 무영향 — **별건**.

### 리뷰가 확인해 준 것

⑫⑬⑭ 배관은 단건·다건·컴패니언 **3경로 모두 연결**돼 있고, 겸용·부담부증여 미도달이 ⑧에서
차단 처리돼 있음이 독립 검증됐다.
