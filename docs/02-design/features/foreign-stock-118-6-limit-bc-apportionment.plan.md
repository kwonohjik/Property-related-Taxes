# 국외주식 외국납부세액 공제한도 B/C 안분 (§118의6①1호) — 구현 계획

> 선행: [`foreign-stock-94-1-3-da-statute-track.plan.md`](./foreign-stock-94-1-3-da-statute-track.plan.md)
> — 그 계획서의 **D-4 잔여** 항목이다. **A항은 PR #1221에서 종결**(A = §104①12호 산출세액)했고,
> 남은 것이 **B/C 안분** 하나다.

---

## §0 한 줄 요약

`foreignTaxCreditLimit = incomeTax` (한도 = 산출세액 전액)는 **국외자산이 하나일 때만** 맞다.
법문은 `A × B / C`이고 다종목이면 종목마다 한도가 A의 **일부**여야 하는데, 현행은 종목마다
**A 전액**을 준다 ⇒ **과대공제**.

## 🔴 §1 그런데 이것만 고치면 **세액이 1원도 바뀌지 않는다** — 범위 결정이 먼저다

### 1.1 현행 도달 가능성 실측 (2026-08-12)

| # | 확인 | 결과 | 근거 |
|---|---|---|---|
| ① | 국외주식 **다종목 입력 UI** | ❌ 없음 | `ForeignStockBlock.tsx` — 종목 배열·추가 버튼 **0건**(`COUNTRY_OPTIONS.map` 등 옵션 map만) |
| ② | 폼 스토어에 종목 배열 | ❌ 없음 | `calc-wizard-stock-store.ts` — `items` grep **0건** · `marketType`은 **폼-전역 단일 필드**(:77) |
| ③ | 클라이언트가 `items` 전송 | ❌ 없음 | `lib/calc/stock-transfer-tax-api.ts` — `items` grep **0건**. `buildForeignStockApiBody(form)`는 **단건 body** 하나만 만든다(:92) |
| ④ | API `items`가 국외주식 수용 | ❌ 거부 | `stock-transfer-tax-schema.ts:591` `items: stockTransferInputSchema.array()` — `marketType`에 `foreign_stock` 없음 |
| ⑤ | route 분기 순서 | `items` → `foreign_stock` 순 | `app/api/calc/stock-transfer/route.ts` — `"items" in body`가 **:78**, `marketType === "foreign_stock"`이 **:86**. `items`가 **먼저**라 넣기만 하면 aggregate로 간다 |

⇒ **한 과세기간에 국외주식 2종목을 입력할 방법이 UI에도 API에도 없다.**
B/C 안분만 구현하면 **실행되지 않는 코드**가 된다 — [[feedback_api_trigger_without_input_path_is_noop]].

### 1.2 ⚖️ 범위 fork — **사용자 결정 필요**

| | 범위 | 산출물 | 성격 |
|---|---|---|---|
| **접근 1** ⭐권장 | **D-3(국외주식 다종목 편입) + B/C 안분**을 한 묶음으로 | 실제로 세액이 바뀐다 | 결함 수정 **+ 신규 기능** |
| **접근 2** | 순수 함수 `computeForeignTaxCreditLimits()` **만** 선행 구현 + 단위 테스트 + 트립와이어 | 세액 변화 **0** | 법령 산식만 미리 고정 |
| **접근 3** | 착수하지 않고 트립와이어(S-1·F-3)만 유지 | 없음 | 현상 유지 |

> ### ✅ **결정: 접근 1** (사용자 승인 · 2026-08-12)
> D-3(국외주식 다종목 편입) + B/C 안분을 한 묶음으로 진행한다. **Phase 4·5(신규 기능)를 포함**한다.
> ⇒ 선행 계획서가 D-2·D-3을 「도달 불가 ⇒ 범위 밖」으로 둔 판단은 **이 승인으로 대체**된다.
> [[feedback_plan_gate_survives_after_override]] — 게이트를 넘어선 근거를 여기 남긴다.

**권장 = 접근 1.** 이유: ㉠ 접근 2는 「고쳤다」는 인상만 남기고 과대공제는 그대로 도달 불가 상태로
남아 실익이 없다(현재도 도달 불가라 **틀린 세액이 나오지 않는다**). ㉡ 접근 1의 비용 대부분은
**D-3(다종목 입력)** 이고, D-3은 §103①2호 공동 기본공제·§102② 통산까지 **함께 해소**한다
(선행 계획서 D-2·D-3). B/C는 그 위에 얹히는 **작은 마지막 조각**이다.

> ⚠️ **접근 1은 「결함 수정」이 아니라 신규 기능이 절반이다.** 선행 계획서가 D-2·D-3을
> 「도달 불가 ⇒ 범위 밖」으로 확정한 판단이 지금도 유효하다 — 뒤집으려면 **사용자 승인**이 필요하다.
> 이 문서는 승인 시 바로 착수할 수 있게 설계까지 적어 두되, **§7 Phase 0에서 승인을 게이트로 둔다.**

---

## §2 법령 근거 (verbatim · 2026-08-12 DRF 실측 — 법 MST 280405 / 영 286211)

### ① 법 §118의6①1호 — 한도 산식

> 1. 외국납부세액의 세액공제방법: 다음 계산식에 따라 계산한 금액을 **한도로** 국외자산 양도소득세액을
>    해당 과세기간의 **양도소득 산출세액에서 공제**하는 방법
> 　공제한도금액 = A × B / C
> 　A: 제118조의5에 따라 계산한 해당 과세기간의 **국외자산에 대한 양도소득 산출세액**
> 　B: **해당 국외자산** 양도소득금액
> 　C: 해당 과세기간의 **국외자산에 대한 양도소득금액**

- **A** = §104①12호로 계산한 국외주식 산출세액 (선행 계획서 §4 Q-3 종결 · PR #1221).
- **B는 「해당 국외자산」** — 자산 단위다. **국가 단위가 아니다**(§118의6·영 §178의7 어디에도 국가별
  구분 문언이 없다). §57(종합소득)의 국별한도와 다르다.

### ② 법 §92② — 「양도소득금액」이 어느 단계인가

> ② 양도소득과세표준은 다음 각 호의 **순서**에 따라 계산한다.
> 　1. **양도차익**: … 양도가액에서 제97조에 따른 필요경비를 공제하여 계산
> 　2. **양도소득금액**: 제1호의 양도차익에서 제95조에 따른 장기보유 특별공제액을 공제하여 계산
> 　3. **양도소득과세표준**: 제2호의 양도소득금액에서 **제103조에 따른 양도소득 기본공제액**을 공제하여 계산

### ③ 법 §102② — 통산이 그 「양도소득금액」 **안에** 있다

> ② 제1항에 따라 **양도소득금액을 계산할 때** 양도차손이 발생한 자산이 있는 경우에는 제1항 각 호별로
>    해당 자산 외의 다른 자산에서 발생한 양도소득금액에서 그 양도차손을 공제한다. …

🔑 **⇒ B·C는 §102② 통산 후 값이다** (Q-1 종결 근거). 기본공제(§103)는 그 **다음** 단계라 B·C에 안 들어간다.

### ④ 영 §178의7 — A/B/C를 재정의하지 않는다

「국외자산 양도소득세액」(= 공제받을 **외국세**)의 범위와 신청서 제출만 정한다. 안분 방법 규정 없음.
⚠️ ②이 지목하는 신청서 서식은 **시행규칙 별지 254건에 부존재**(2026-08-12 전수 확인) — **서식으로
안분 규칙을 확인할 수 없다.** 이 계획의 판단은 전부 법문에서 나온다.

---

## §3 결함 — 무엇이 어떻게 틀리는가

**현행** (`lib/tax-engine/stock-transfer/foreign-stock.ts` STEP 10):

```ts
foreignTaxCreditLimit = incomeTax;                              // = A. B/C 곱하지 않음
foreignTaxCreditApplied = Math.min(foreignTaxPaidKrw, foreignTaxCreditLimit);
```

단건 엔진이라 B = C(비율 1)이고 **단건에서는 정확히 맞다**. 다종목이 되는 순간 종목마다 A 전액을
한도로 잡아 **Σ공제 ≤ A** 라는 상한이 깨진다.

### 발현 예 (설계값 — 구현 후 실측으로 대체할 것)

국외주식 2종목, 각 양도소득금액 5,000만 (통산 없음), 기본공제 250만은 종목1에 배분(§103②).

| | 종목1 | 종목2 | 계 |
|---|---:|---:|---:|
| 양도소득금액 (B) | 50,000,000 | 50,000,000 | **C = 100,000,000** |
| 과세표준 | 47,500,000 | 50,000,000 | 97,500,000 |
| 산출세액 (20%) | 9,500,000 | 10,000,000 | **A = 19,500,000** |
| 외국납부세액 | 12,000,000 | 0 | 12,000,000 |
| **올바른 한도** `A×B/C` | **9,750,000** | 9,750,000 | Σ = A |
| **현행 한도** | 19,500,000 | 19,500,000 | Σ = 2A 🔴 |
| 공제액 (올바름 / 현행) | 9,750,000 / **12,000,000** | 0 / 0 | **차 2,250,000 과대** |

⇒ **과대공제 = 납세자 유리 방향**. 급하지 않으나 [[feedback_tax_calculation_principle]]상 방치 대상은 아니다.

---

## §4 미결 질문

| Q | 내용 | 상태 |
|---|---|---|
| **Q-1** | B·C가 §102② **통산 전인가 후인가** | ✅ **종결 — 통산 후**. §92②2호 「양도소득금액」 단계 안에 §102② 통산이 있다(§2 ②③). 실익도 크다 → §6.2 |
| **Q-2** | 한도가 **자산별인가 국가별인가** | ✅ **종결 — 자산별**. B = 「**해당 국외자산** 양도소득금액」. §118의6·영 §178의7에 국가 문언 없음 |
| **Q-3** | A/B/C 풀에 **국외 부동산**이 섞이는가 | ✅ **종결 — 안 섞인다**. 이 앱은 국외 부동산 양도를 지원하지 않는다(`transfer-tax.ts`에 §118의2 트랙 grep 0건). 준용 맥락에서 「국외자산」→「§94①3호다목 자산」 |
| **Q-4** | C = 0 (전 종목 손실·전액 통산) | ✅ **종결 — 나눗셈 자체가 불필요**. 그 경우 A = 0이라 한도 0. **0 나눗셈 guard 필수** |
| **Q-5** | 통산으로 소득이 0이 된 종목의 외국세 | 🟡 **미결** — B = 0 ⇒ 한도 0 ⇒ 공제 0이 문언상 귀결이다. §57 서식도 결손 국가를 「기준 국외원천소득 0」으로 다루나 **그건 §57이지 §118의6이 아니다**. 안분 서식이 부존재해 대조할 것이 없다 ⇒ **문언대로 0** 으로 가되 결과 화면에 사유를 표시한다(§6.4) |
| **Q-6** | 자산별 한도가 **불리** 방향인 국면 | ✅ 근거 있음 — 종목1만 외국세를 냈고 종목2는 안 낸 위 예에서, 풀링이면 12,000,000 전액 공제되지만 자산별이면 9,750,000이다. **B = 「해당 국외자산」이라는 명문**이 있으므로 [[feedback_no_unfavorable_application_without_legal_basis]]에 걸리지 않는다 |

> ⚠️ Q-5는 **「확인 필요」로 남긴다.** 문언 귀결은 명확하지만 대조 자료(서식·예규)가 없다 —
> [[feedback_no_statute_claim_needs_requirement_article]]의 「도구 실패 ≠ 결론」과 같은 취지로,
> **없는 것을 없다고 적되 「없음을 확인했다」와 「그래서 이렇게 정했다」를 구분해 적는다.**

---

## §5 케이스 매트릭스

`L-*` = 한도 산식 · `Z-*` = 경계 · `N-*` = 무변화(회귀 방지)

| # | 국외주식 구성 | 외국세 | 기대 |
|---|---|---|---|
| **L-1** | 1종목 | 있음 | 한도 = A **(현행과 동일 — 양성 대조군)** |
| **L-2** | 2종목 동액 이익 | 종목1만 | 한도₁ = A/2. 위 §3 표 실측값 |
| **L-3** | 2종목 이익 3:1 | 양쪽 | 한도가 3:1로 갈린다 |
| **L-4** | 3종목, 1종목 **손실** | 이익 종목 | **통산 후** B로 안분 — 손실 종목 B = 0 |
| **L-5** | 2종목 + **국내주식 1종목** | 국외 종목 | C에 **국내주식이 들어가면 안 된다**(C = 「국외자산」). 기본공제는 §103①2호로 **공동** 배분되므로 A는 그 영향을 받는다 |
| **Z-1** | 전 종목 손실 (C = 0) | 있음 | 한도 0 · **0 나눗셈 없음** |
| **Z-2** | C > 0인데 특정 종목 B = 0 | 그 종목 | 한도 0 (Q-5) |
| **Z-3** | 1원 단위 잔차 | — | Σ 한도 ≤ A **불변식** — 잔액 흡수 필요(§6.3) |
| **N-1** | 국내주식만 다종목 | — | 세액 **완전 불변** |
| **N-2** | 국외주식 단건 (기존 경로) | 있음 | 세액 **완전 불변** — FS-anchor-03·04·F 시리즈 그대로 통과 |

⚠️ **L-1·N-1·N-2가 양성 대조군**이다. 부정 단언만 있으면 산식이 통째로 죽어도 통과한다
([[feedback_negative_assertion_needs_mutation_probe]]).

---

## §6 구현 설계

### 6.1 D-3 — 국외주식을 aggregate에 편입 (접근 1 채택 시)

**🔴 선행 계획서 §6.2의 「접근 A: aggregate 배분 루프가 자동 처리」는 낙관적이었다.**
실측하면 **엔진이 둘로 갈라져 있다**:

| | 국내주식 | 국외주식 |
|---|---|---|
| 입력 타입 | `StockTransferInput` | `ForeignStockInput` (**다른 타입**) |
| 엔진 | `calculateStockTransferTaxInternal` | `calculateForeignStockTax` (**다른 함수**) |
| 결과 타입 | `StockTransferResult` | `ForeignStockResult` (**다른 타입**) |

`aggregateCore`는 `StockTransferInput[]`을 받아 `calculateStockTransferTaxInternal`을 돌리는 것을
전제로 STEP 1·3이 짜여 있다(`stock-transfer-aggregate.ts:353·502`). 즉 **어댑터가 필요하다.**

🔑 **다행인 점**: `StockTransferResult.taxCategory` union에 **이미 `"foreign_stock"`이 있다**
(`types/stock-transfer.types.ts:676`). 결과 축은 열려 있고, 막힌 것은 `marketType`(:21 — 국내 5종)과
foreign 전용 필드다.

**설계**: `ForeignStockResult → StockTransferResult` **단방향 어댑터**를 두고, foreign 전용 필드는
`StockTransferResult`에 **optional로 추가**한다(별도 union보다 소비처 변경이 적다).

```ts
// lib/tax-engine/stock-transfer/foreign-stock-aggregate-adapter.ts (신설 · 무의존 leaf 지향)
export function toStockResult(fr: ForeignStockResult, /* … */): StockTransferResult
export function isForeignItem(i: StockTransferInput | ForeignStockInput): i is ForeignStockInput
```

⚠️ 어댑터가 **`basicDeductionGroup: "stock"`을 반드시 세팅**해야 STEP 1.5 통산·STEP 3 기본공제
배분에 자동으로 들어간다(§103①2호 — 국내주식과 **같은 그룹**, 선행 계획서 D-2).

⚠️ STEP 3의 stock 분기는 기본공제 배분 후 `applyStockTaxRate(...)`로 **세율을 다시 적용**한다
(:471). 국외주식은 세율이 §104①12호 20% 단일이므로 **그 분기를 타면 안 된다** —
`taxCategory === "foreign_stock"`일 때 `STOCK_FOREIGN_RATE`를 쓰는 갈래를 추가한다.
👉 여기가 이 작업 **최대 회귀 위험 지점**이다(§9).

### 6.2 B/C 한도 — 순수 함수 (접근 1·2 공통)

통산·기본공제가 끝난 **뒤**에 계산한다. §92② 순서상 B·C는 통산 후·기본공제 전이고, A는 기본공제
후 과세표준에 세율을 적용한 값이다 — **A와 B/C의 기준 단계가 다르다.** 헷갈리기 쉬우니 인자 이름에 박는다.

```ts
// lib/tax-engine/stock-transfer/foreign-tax-credit-limit.ts (신설 · 무의존 leaf)

export interface ForeignTaxCreditLimitInput {
  /** 통산 후 양도소득금액 (§92②2호 · §102②) — 기본공제 **전** */
  incomeAfterOffset: number;
  /** 그 종목의 산출세액 (§104①12호 20%) — 기본공제 **후** 과세표준 기준 */
  incomeTax: number;
  /** 원화 환산 외국납부세액 */
  foreignTaxPaidKrw: number;
}

export interface ForeignTaxCreditLimitRow { limit: number; applied: number; }

/**
 * §118의6①1호 — 공제한도 = A × B / C
 *   A = Σ incomeTax (국외주식 전체 산출세액)
 *   B = 종목별 incomeAfterOffset  ·  C = Σ B
 *
 * · C ≤ 0 이면 A도 0이므로 전 종목 한도 0 (0 나눗셈 없음).
 * · 정수 연산은 BigInt — `Number((BigInt(A) * BigInt(B)) / BigInt(C))`.
 *   `stock-carryover.ts`의 안분과 같은 패턴이다.
 * · **마지막 양(+) 종목이 잔액을 흡수**해 `Σ limit ≤ A` 불변식을 지킨다
 *   (floor 절사 잔차 — [[feedback_floor_residual_absorption]]).
 */
export function computeForeignTaxCreditLimits(
  rows: ForeignTaxCreditLimitInput[],
): ForeignTaxCreditLimitRow[]
```

**왜 별도 leaf인가**: ㉠ 접근 2를 택하면 이 파일만 만들고 배선은 미룰 수 있다.
㉡ `foreign-stock.ts`(단건)와 `stock-transfer-aggregate.ts`(다종목)가 **같은 산식을 공유**해야
[[feedback_ui_engine_dual_truth_avoidance]]에 걸리지 않는다. 단건은 `rows.length === 1`로 호출하면
`B/C = 1`이라 **현행과 정확히 같은 값**이 나온다 ⇒ N-2 회귀 0.

### 6.3 잔액 흡수 — `Σ limit ≤ A` 불변식

`floor(A × Bᵢ / C)`를 각각 구하면 절사 잔차 때문에 Σ < A가 된다(불리 방향). 마지막 **양(+) B**
종목이 `A − Σ앞항목`을 받는다. ⚠️ **마지막 종목이 B = 0이면 잔액을 줄 수 없다** — 배열 끝이 아니라
**마지막 양수 B**를 찾아야 한다. Z-3이 이것을 고정한다.

### 6.4 표시 (⑦ 결과 카드 · 신고서식)

- 결과 카드: 한도를 `A × B / C` **풀어쓴 산식**으로 보인다(변수 약어·`floor()` 금지 — components/calc/CLAUDE.md).
- Q-5(B = 0으로 공제 0)인 종목은 **사유를 명시**한다 — 금액만 0으로 보이면 버그로 읽힌다.
- `foreignTaxCreditLimit`이 종목마다 달라지므로 **종목 단위로** 보여야 한다.

### 6.5 🧹 곁다리 — `foreign-stock.types.ts`의 D-5 잔재 (**이 작업과 무관하게 이미 틀려 있다**)

PR #1212의 D-5 표시 정정이 **이 파일을 빠뜨렸다**. 2026-08-12 실측:

| 위치 | 현행 문구 | 정정 |
|---|---|---|
| `:4` | 「§94①3다목 + **§118의2~§118의8**」 | §118② 준용 범위로 축소 |
| `:128` | 「한도 = 산출세액 × B/C — **단일 자산 시 산출세액 전액**」 | 본 계획 반영 |
| `:162` | 「**§118의7** 기본공제 250만원 (§103①…와 **별도 그룹**)」 | **§103①2호 · 국내주식과 같은 그룹** |
| `:164` | 「LTHD 미적용 — **§118의8 단서**」 | **§95②**(토지·건물 전용) |
| `:167` | 「── **§118의5 → §55① 6~45% 8구간 누진** ──」 | **§104①12호나목 20%** |
| `:178` | 「공제한도 … **단일 자산 = 산출세액 전액**」 | 본 계획 반영 |

⚠️ **결과 화면에 나가는 문구가 아니라 타입 주석**이라 사용자에게 보이지는 않는다. 다만 다음 작업자가
이걸 읽고 §55① 누진으로 되돌릴 위험이 있다 — [[feedback_engine_comment_vs_impl_drift]].
**접근 3(미착수)을 택하더라도 이 6줄은 별건으로 정정할 것.**

---

## §7 Phase

| Phase | 내용 | 완료 판정 |
|---|---|---|
| **0** | ⚖️ **범위 승인**(§1.2) — 접근 1/2/3 중 택일 | 사용자 결정이 이 문서에 기록됨 |
| **0b** | §6.5 타입 주석 6줄 정정 (**어느 접근이든 수행**) | grep으로 §118의5·§118의7·§118의8 잔재 0건 |
| **1** | Pre-Do anchor — §5 매트릭스를 **현행 코드에** 걸어 통과/실패 기록 | 실패 예상 건이 실제로 실패 · **통과한 건 중 구별력 없는 것 표시** ([[feedback_pre_anchor_verification]]) |
| **2** | `foreign-tax-credit-limit.ts` 순수 함수 + 단위 테스트 (§6.2·6.3) | L-1~L-5·Z-1~Z-3 통과 · **mutation으로 판별력 실측** |
| **3** | 단건 경로를 그 함수로 교체 (`rows.length === 1`) | **N-2 세액 완전 불변** — 기존 FS-anchor·F 시리즈 무변화 |
| **4** | D-3 어댑터 + `items` union + aggregate 배선 (§6.1) — **접근 1만** | N-1 국내주식 세액 불변 · 국외 2종목 계산 성립 |
| **5** | 다종목 UI (종목 추가·삭제) — **접근 1만** | ⑤⑥⑦ 14지점 동기화 |
| **6** | 표시 (§6.4) + 신고서식 | 산식이 한국어 풀어쓰기 · Q-5 사유 노출 |
| **7** | E2E + 전체 회귀 | tsc 0 · lint 0 · `npm test` 전건 · 주식 E2E |

🔑 **Phase 3을 4보다 먼저** 두는 이유: 순수 함수 교체가 **세액을 바꾸지 않는다**는 것을 다종목
배선 **전에** 확인해 두면, Phase 4에서 세액이 바뀔 때 원인이 배선임을 즉시 안다.

⚠️ **Phase 4·5는 「신규 기능」이다.** Phase 0에서 승인받지 못하면 **2·3에서 멈춘다**(= 접근 2).

---

## §8 검증 기준

- [ ] Q-1~Q-6 각각 **verbatim 인용 + 출처(MST)** 기재 — Q-5는 **「확인 필요」 유지**
- [ ] §5 매트릭스 전 케이스 anchor 존재 — **부정 단언에 양성 대조군을 같은 파일에**
- [ ] **mutation probe**로 anchor 판별력 실측 (통과 건수는 증거가 아니다)
- [ ] `Σ limit ≤ A` 불변식 테스트 (Z-3)
- [ ] **0 나눗셈** 경로 테스트 (Z-1)
- [ ] 14 동기화 지점 ⑫⑬⑭ **grep 자가 점검** — `items` union 확장은 ⑫에 직결
- [ ] `npx tsc --noEmit` 0건 · `npm run lint` 0 errors
- [ ] `npx vitest run __tests__/tax-engine/stock-transfer/` → 전체 `npm test`
- [ ] **브라우저 확인은 Playwright E2E** ([[feedback_browser_verify_with_playwright]])
- [ ] 착수 전후 세액을 **실측**해 §3 표를 설계값에서 실측값으로 교체

---

## §9 회귀 위험

| 위험 | 왜 | 방어 |
|---|---|---|
| 🔴 **STEP 3 세율 재적용** | aggregate STEP 3 stock 분기가 `applyStockTaxRate`로 세율을 다시 계산한다(:471). 국외주식이 그 분기를 타면 **§104①11호 국내 세율**이 붙는다 | `taxCategory === "foreign_stock"` 갈래 분리 + N-2 anchor |
| 🔴 **route if-체인 순서** | `items` 분기(:78)가 `foreign_stock` 분기(:86)보다 **먼저** — `items`에 foreign을 넣는 순간 단건 경로를 **건너뛴다** | **양쪽 경로 각각** anchor ([[feedback_route_if_chain_order_swallows_branches]]) |
| 🟠 **통산 그룹 오염** | 국외주식이 `basicDeductionGroup: "stock"`으로 들어가면 §102①2호 통산에 **자동 편입**된다. 이는 **법령상 옳다**(같은 3호) — 다만 국내주식 세액이 바뀔 수 있다 | N-1(국내 단독) + 혼합 케이스 L-5 |
| 🟠 **기본공제 250만 이동** | 국외주식이 §103①2호 공동 그룹에 들어가면 §103② 순서(양도일 순)로 **국내주식 공제가 줄 수 있다** | 법령상 옳은 변화다. anchor 갱신 시 **조문 근거를 주석에** ([[feedback_anchor_correction_legal_priority]]) |
| 🟡 **파일 크기** | `stock-transfer-aggregate.ts` **563줄**. Phase 4가 +100줄이면 663 — 트리거 800 이하나 750 위험구간 접근 | 기회주의적 분리 검토(루트 File Size Policy) |
| 🟡 **`marketType` 폼-전역** | 다종목 UI는 종목마다 국내/국외를 고를 수 있어야 하는데 현재 **폼-전역 단일 필드**다(:77) | Phase 5 설계 시 자산-수준으로 내리는 범위를 먼저 확정 |

---

## §10 관련 메모리

[[project_foreign_stock_wrong_statute_track]] · [[project_stock_102_2_loss_offset_103_deduction]] ·
[[feedback_api_trigger_without_input_path_is_noop]] · [[feedback_route_if_chain_order_swallows_branches]] ·
[[feedback_floor_residual_absorption]] · [[feedback_negative_assertion_needs_mutation_probe]] ·
[[feedback_pre_anchor_verification]] · [[feedback_api_zod_schema_sync]]
