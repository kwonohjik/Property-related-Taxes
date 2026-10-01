# 다자산 합산 신고서 — 양도차손 통산 행 · 비교과세 표시 · 세율군 세율 오표시 (수정 계획서)

> 상태: **구현 완료 (2026-10-02 · 「권장안대로 착수해」)** — 결정 Q-1~Q-4 전부 권장안 · 구현 메모는 §10
> 세목: 양도소득세 / 연간 합산(`/calc/transfer-tax/multi`) 결과탭
> 작성일: 2026-10-02 · 기준 커밋: `818cb74d4`
> 성격: **표시층 3건**. 세액은 바뀌지 않는다(§6 anchor로 고정).

---

## 0. 한 줄 요약

1. 부동산 합산 신고서 표에는 §102② 통산 **행이 없어** 통산 내역이 「감면후 소득금액」 칸 안의 작은 글씨로 흩어져 있다 — 주식 표(18-1행)처럼 **전용 행**을 만든다. (실측 중 **통산액을 틀리게 말하는 문구**도 하나 발견 — §2-1)
2. 「5단계 산출세액」이 **방법 A(전체 누진) ↔ 방법 B(세율군별) 비교**를 보여주지 않는다 — 두 금액과 **「큰 금액을 결정」**을 적는다.
3. 세율군 카드가 **40% 군을 70%로** 찍는다 — 엔진의 「표시용 최고세율」이 **과세표준 0원인 호의 세율**까지 최고값 후보로 삼는다.

---

## 1. 제보 (이미지 12~15)

| # | 화면 | 내용 |
|---|---|---|
| 12 | 신고서 양식 (합산) | 양도 2번 −20,000,000이 양도 4번(19,000,000)·1번(300,000)·3번(700,000)에 통산. 통산 내역이 **「감면후 소득금액」 칸의 각주**로만 있고, 양도 2번 칸은 `0 / 결손금 20,000,000이 다른 자산의 양도소득금액에 통산` |
| 13 | 5단계 세액 산정 | 산출세액 63,688,000 — 근거: 「자산별 세율이 서로 달라 단일 세율로 표시할 수 없습니다」 **뿐** |
| 14 | 세율군별 산출세액(방법 B) | 단기보유 군: 과세표준 139,300,000 → 55,720,000 **(70.0%)** ← 40%여야 한다 |
| 15 | 주식 신고서 (정답 패턴) | 18행 양도차익 → **18-1행 양도차손 통산** → 19행 양도소득금액 |

---

## 2. 실측 (throwaway probe — 제보 시나리오 재구성, 검증 후 삭제)

`__tests__/tax-engine/transfer-tax/loss-offset-same-rate-axis.predo.anchor.test.ts`의 fixture 형식으로 **제보와 같은 4자산**을 구성해 `calculateTransferTaxAggregate` + `buildAggregateRows`를 직접 호출했다.

| 자산 | 소득금액 | 세율 | 통산 후 | 군 |
|---|---|---|---|---|
| P1 토지 | 60,000,000 | 24%(누진) | 59,700,000 (−300,000) | progressive |
| P2 미등기 | **−20,000,000** | 70% | 0 | unregistered |
| P3 토지 1~2년 | 140,000,000 | **40%** | 139,300,000 (−700,000) | short_term |
| P4 주택 1년 미만 | 19,000,000 | 70% | 0 (−19,000,000) | short_term |

| 지표 | 값 |
|---|---|
| 방법 A `calculatedTaxByGeneral` | **54,730,000** |
| 방법 B `calculatedTaxByGroups` | **63,688,000** (7,968,000 + 0 + 55,720,000) |
| `comparedTaxApplied` | `"groups"` → 산출세액 63,688,000 (제보와 **일치**) |
| `groupTaxes[short_term].appliedRate` | **0.7** (P3 40% + P4 70% 중 최고) ← 제보 재현 |
| `aggregateToFilingResult(...).appliedRate` | 0 (군 3개) |
| 「감면후 소득금액」 각주 | 제보 이미지와 **문구까지 동일** |

### 2-1. 부수 발견 — 통산액을 **틀리게** 말하는 각주

차손이 다 흡수되지 않는 시나리오(U1 +5,000,000 · U2 미등기 −20,000,000 → `unusedLoss` 15,000,000)에서:

```
lossOffsetTable : U2 → U1  5,000,000 한 건뿐
U2 칸 각주      : 「결손금 20,000,000이 다른 자산의 양도소득금액에 통산」   ← 실제 통산 5,000,000 · 소멸 15,000,000
양도소득금액 합계 : 0  (= totalIncomeAfterOffset)   vs   칸의 합 : 5,000,000 + (−20,000,000) = −15,000,000
```

- 각주가 **소멸분을 통산으로** 적는다(`FilingFormTableAggregateHelpers.ts:269-274` — `|income|` 전액을 통산으로 서술).
- 「양도소득금액」 **합계 열은 통산 후**(`:361` `aggregated.totalIncomeAfterOffset`)인데 **자산 칸은 통산 전**(`:253` `p.income`)이라 **가로 합이 맞지 않는다**. 주식 표가 겪고 고친 것과 같은 결함이다(`StockFilingFormTableHelpers.ts:259-264` 「합계 열도 같은 축」).

> 제보 시나리오는 `unusedLoss = 0`이라 이 불일치가 **우연히 가려져** 있다(합계 199,000,000 = 199,000,000).

---

## 3. 원인 (코드 실측)

### 3-1. 통산 행 부재 — 정보가 각주로 떠돈다

| 위치 | 사실 |
|---|---|
| `FilingFormTableAggregateHelpers.ts:157-158` | `offsetNotes` — 「별지 제84호 부표1에는 §102② 행이 없어 종전엔 차액이 **무설명으로 사라졌다**」(#072)를 **각주로 땜질** |
| `:489-494` | 각주는 `incomeAmountAfter`(「감면후 소득금액」) 행에만 붙는다 — **감면과 통산이 한 행에 섞인다** |
| `StockFilingFormTableHelpers.ts:278-336` | 주식은 18-1(통산)·18-2(소멸) **전용 행**. 흡수 = 음수, 유출 = 양수, 합계 = 칸의 합 → `18 + 18-1 = 19`가 가로로 성립 |

부동산은 정보가 없는 게 아니라 **엔진이 이미 다 준다**: `lossOffsetFromSameGroup/OtherGroup`(받은 몫, `PerPropertyBreakdown`) · `lossOffsetTable`(from→to 건별) · `unusedLoss`. **엔진 변경 0** — 신고서 표만 고친다.

### 3-2. 비교과세 표시 부재

- 5단계 「산출세액」 `formula`는 `result.steps`의 「산출세액」 step이 없으면 `describeAggregateCalculatedTax`로 간다(`DetailedStatementLateStages.ts:99-104`). 그 함수는 `comparedTaxApplied === "general"`일 때만 「더 커서 채택」을 말하고(`:266-268`), `groups`(제보)는 「단일 세율로 표시할 수 없다」에서 끝난다 — **A값도 B값도 없다**.
- 값은 이미 있다: `aggregated.calculatedTaxByGeneral/ByGroups/comparedTaxApplied`. 요약 카드(`MultiTransferTaxSummaryCard.tsx:171-188`)는 A·B를 보여주지만 **5단계에는 없다**.
- 4단계 「비교과세」 항목(`DetailedStatementFormulaBuilders.ts:238-247`)은 엔진 step 문구 `세율군별 N vs 전체누진 M → MAX = …`를 그대로 싣는다 — 비교는 있으나 **작은 글씨 한 줄**이고 5단계와 떨어져 있다. (`summaryOnly`는 소비처가 없어 항목은 렌더된다 — grep 확인. **화면 확인은 미수행**, V-3)

### 3-3. 40% 군이 70%로 — 「표시용 최고세율」이 0원 호를 센다

`transfer-tax-aggregate-group-tax.ts`의 단기 군 분기:

```ts
:257  appliedRate = Math.max(appliedRate, bucket[0].appliedRate); // 표시용 최고세율
:272  appliedRate = Math.max(appliedRate, tr.appliedRate);
:436-439 (비단기 다호 군) 동일 규약 · surchargeRate도 Math.max
```

P4(70%)의 **과세표준은 통산으로 0**인데 그 세율이 `Math.max`에 들어가 군 세율이 0.7이 된다. 군 세액 55,720,000은 **P3의 40%** 로만 나온 값이다(`139,300,000 × 40% = 55,720,000`). 카드(`MultiTransferTaxResultView.tsx:381-384`)는 그 값을 그대로 `(70.0%)`로 찍는다.

> 🔴 같은 값이 **다른 소비처**에도 간다: `BundledAllocationCard.tsx:88-90`(군이 1개일 때 신고서 합계 세율·산식) · `BundledAllocationSubCards.tsx:202-203`. 군이 하나인 합산에서 같은 오표시가 난다 — **코드로만 확인, 실측 미수행**(V-2).
> ✅ 세액에는 영향이 없다: `hasSurchargeGroup`(`transfer-tax-aggregate-pickers.ts:199`)은 `g.group`만 읽고 `appliedRate`를 읽지 않는다 — 비교과세 판정은 이 값과 무관하다.

---

## 4. 설계

### A. 신고서 표 — 「양도차손 통산」 전용 행

**행 (합산 빌더에만 — 단건엔 통산이 없다)**

| 위치 | 라벨 | 칸 값 | 합계 열 |
|---|---|---|---|
| 「양도소득금액」 **직후** | `양도차손 통산 (§102②·영 §167의2)` | 받은 자산 **−(same+other)** · 낸 자산 **+낸 금액**(`lossOffsetTable`에서 `fromPropertyId`로 집계) · 해당 없음 `-` | **칸의 합**(차손이 전액 통산되면 0) |
| 위 행 직후, **`unusedLoss > 0`일 때만** | `통산되지 못한 차손 소멸 (이월 불가)` | 차손 자산: `|income| − 낸 금액` | 칸의 합 |

- 순서 근거: §102②·영 §167의2는 **양도소득금액**에서 공제하므로 「양도소득금액 → 통산 → (감면) → 기본공제」다. 주식 표(장특 없음)가 통산을 양도소득금액 *앞*에 두는 것과 달리, 부동산은 소득금액이 장특 후에 정해지므로 **뒤**다.
- 낸 금액·소멸액은 **엔진 `lossOffsetTable`·`income`에서 읽는다**(재산출 금지 — memory `feedback_aggregate_display_rederives_engine_value`). 소멸 = `|income| − Σ 낸 금액`은 뺄셈 한 번이라 재유도가 아니라 **표시 정합용 잔여**다.
- **가로 항등식**(anchor로 고정): `양도소득금액 + 통산 + 소멸 = 통산 후 소득금액(= incomeAfterOffset)`. 차손 자산은 `−20,000,000 + 20,000,000 + 0 = 0`.

**합계 열 축 정렬 (§2-1)**: 「양도소득금액」 합계를 `Σ p.income`(통산 전)으로 바꾼다. 안 바꾸면 새 행이 **소멸이 있는 케이스에서만** 가로 합을 깨뜨린다. 제보 시나리오는 값이 같아 화면 변화 없음.

**각주 정리**: 「감면후 소득금액」의 `offsetNotes`는 새 행이 같은 정보를 더 정확히 싣게 되므로 **제거**한다(중복 + §2-1의 오서술 소멸). 「감면후 소득금액」 행은 순수하게 `통산 후 − 소득금액 감면대상`이 된다.

**건드리는 곳**

| 파일 | 변경 |
|---|---|
| `FilingFormTableAggregateHelpers.ts` | 칸·합계 `setNum` 2행, `offsetNotes` 제거, 합계 축 정렬, rowOrder 2행 추가 |
| `DetailedStatementFormulaBuilders.ts:105-120` | `buildIncomeFormula`의 「통산되어」 문구가 **같은 오서술**(`:119`)이다 — 낸 금액·소멸을 밝히도록 정정(V-4: 이 문장을 단언하는 테스트 확인) |
| 테스트 | 아래 §6 |

> 🔒 **행 추가 규약** — 신고서 표는 `rowOrder`가 **두 개**다(단건 `FilingFormTableRowDefs.ts` · 합산 `…AggregateHelpers.ts:470-`). 새 행은 합산 전용이므로 두 parity 테스트의 `AGGREGATE_ONLY`에 **등록**한다(`filing-form-roworder-parity.anchor.test.ts` · `filing-form-local-tax-identity.anchor.test.ts` L-2). 등록 안 하면 실패 — 의도된 안전망이다.

### B. 5단계 산출세액 — 비교과세를 **금액으로** 보여준다

`isAggregate && comparedTaxApplied !== "none"`일 때 `formula`를 다음 구조로 낸다(문구는 구현 시 다듬되 **세 가지를 모두** 포함):

```
전체 누진세율 적용 (방법 A)   54,730,000   ← 과세표준 196,500,000에 §55① 누진세율
세율군별 분리 산출 (방법 B)   63,688,000   ← 아래 「세율군별 분리 산출」 합계
→ 두 금액 중 큰 금액인 세율군별 63,688,000을 산출세액으로 결정 (소득세법 §104⑤)
```

**「큰 금액」을 무조건 쓰지 않는다** — 감면이 있으면 §104⑤ 괄호에 따라 **감면세액을 뺀 세액이 더 큰 쪽**을 고른다(`transfer-tax-aggregate.ts:316-328` `decidedAfterReduction`). 이때 채택된 쪽이 감면 전 금액으로는 더 작을 수 있다. 판정 규칙:

| `comparedTaxApplied` | 채택된 금액이 A·B 중 **최대**인가 | 결정 문구 |
|---|---|---|
| `groups` / `general` | 예 | 「큰 금액인 …으로 결정」 |
| `groups` / `general` | **아니오** | 「감면세액을 뺀 세액이 더 큰 …으로 결정 (§104⑤ 괄호)」 |
| `none` | — | 종전 문구 유지(비교 불필요) |

- 이 판정은 요약 카드가 이미 쓰는 술어다(`MultiTransferTaxSummaryCard.tsx:177-180`). **같은 규칙을 두 곳에 손으로 쓰면 갈린다**(memory `feedback_shared_predicate_argument_parity`) ⇒ 작은 순수 leaf `comparative-tax-display.ts`(`{ methodA, methodB, applied, reason }`)로 뽑아 **5단계·요약 카드·(Q-1 결정 시) 세율군 카드**가 공유한다.
- 닫힌 산식(`과세표준 × 세율 − 누진공제`) 검산(`closedFormHolds`)은 **그대로 둔다** — 단일 군으로 재현되면 종전 산식을 쓴다. 비교 블록은 `closedFormHolds`와 **독립**으로, 비교과세가 적용된 합산이면 항상 붙인다(`closedFormHolds`가 참이어도 B가 A보다 커서 고른 것이라면 그 사실이 유용하다).

### C. 세율군 카드 — 0원 호의 세율을 최고세율 후보에서 뺀다

**엔진 (표시 echo 한정, 세액 불변)** — `transfer-tax-aggregate-group-tax.ts:257·272·436-439`:

- 표시용 최고세율을 **`taxBase > 0`인 호 버킷**에서만 고른다. 군 전체가 0원이면 종전대로 전체의 최고세율(미등기 군 P2 `70%`·0원은 **그대로** 나온다 — 제보도 이 군은 문제 삼지 않는다).
- `surchargeRate`(`:439`)도 **같은 후보 집합**으로 맞춘다 — 세율과 중과분이 다른 호에서 나오면 `+N%p`가 거짓이 된다.

**카드 (`MultiTransferTaxResultView.tsx:381-384`)** — 항등식 가드:

```ts
const reproduces = Math.floor(g.groupTaxBase * g.appliedRate) - g.progressiveDeduction === g.groupCalculatedTax;
```

재현하면 `(40.0%)`, **재현하지 못하면**(한 군에 과세표준 > 0인 호가 둘 이상, 세율이 다름) 단일 세율을 찍지 않고 **「호별 합계」**로 적는다. 대리 지표(최고세율)를 **주장하는 항등식 자체**로 바꾸는 것이다 — `multi-calculated-tax-formula-identity.plan.md` §3-1의 교훈과 같다.

> ⚠️ **두 겹 방어 주의** — 엔진 수정이 제보 케이스를 고치고 카드 가드는 **잔여 케이스**(양수 호 둘)를 막는다. 두 방어가 서로를 가리므로(memory `feedback_layers_mask_each_other_in_mutation`) anchor는 **층마다** 따로 둔다(§6).

**부가 — A값 노출 (Q-1)**: 카드 하단에 「전체 누진세율 적용(방법 A) 54,730,000 / 큰 금액 → 방법 B」 한 줄을 더할 수 있다. 제보 14는 카드가 B만 말해서 **「왜 이 합계인가」** 가 안 보이는 화면이다.

---

## 5. 동기화 범위 (CLAUDE.md 14지점)

입력·타입·Zod·Route는 **건드리지 않는다**.

| 항목 | 해당 지점 | 비고 |
|---|---|---|
| A | ⑦ 결과 카드(신고서 표·상세명세서) | 엔진·API 변경 없음 — 엔진 필드를 읽기만 한다 |
| B | ⑦ | `AggregateTransferResult`의 기존 3필드만 읽는다 |
| C | ⑦ + **엔진 echo 의미 변경**(필드 추가 없음) | `GroupTaxResult.appliedRate`의 의미가 「과세표준 > 0 호의 최고세율」로 좁아진다 — 소비처 전수: `MultiTransferTaxResultView:381` · `BundledAllocationCard:88-90` · `BundledAllocationSubCards:202-203` · 테스트 §6 |

세액·세율구분 코드·산출세액·지방소득세는 **불변**이어야 한다.

---

## 6. 검증 계획

### 6-1. Pre-Do anchor (착수 전 먼저 쓴다 — 실패해야 하는 것과 통과해야 하는 것)

| ID | 단언 | 착수 전 |
|---|---|---|
| A-1 | 제보 4자산: 합산 표에 `양도차손 통산` 행. P2 칸 **+20,000,000** · P4 −19,000,000 · P1 −300,000 · P3 −700,000 · 합계 **0** | 🔴 실패 |
| A-2 | 가로 항등식: **모든 열**에서 `양도소득금액 + 통산 + 소멸 = 통산 후` | 🔴 |
| A-3 | `unusedLoss=15,000,000` 시나리오(§2-1): 소멸 행 U2 칸 **+15,000,000** · 통산 행 U2 **+5,000,000** · **양도소득금액 합계 = Σ칸** | 🔴 |
| A-4 | `unusedLoss = 0`이면 **소멸 행이 없다**(0으로 채운 행 금지 — 주식 18-2와 같은 규약) | 🟢 통과 상태로 시작 |
| A-5 | 「감면후 소득금액」 행에 `결손금 통산` 각주가 **없다** | 🔴 |
| B-1 | 제보: 5단계 산출세액에 `54,730,000`·`63,688,000`·「큰 금액」 | 🔴 |
| B-2 | 감면 케이스(`decidedAfterReduction`): 채택 금액이 최대가 아닐 때 「감면세액을 뺀」 문구, 「큰 금액」 **금지** | 🔴 |
| B-3 | `comparedTaxApplied="none"` → 비교 블록 **없다**(종전 문구) | 🟢 |
| C-1 | 제보: `groupTaxes[short_term].appliedRate === 0.4` · 미등기 군 `0.7`(0원, 불변) | 🔴 |
| C-2 | 제보: `calculatedTax`·`groupCalculatedTax`·`taxBase` **불변** 63,688,000 · 55,720,000 · 196,500,000 | 🟢 |
| C-3 (엔진 층) | 양수 호 둘(40%+70%) 군 → 카드 가드 없이도 엔진이 거짓 단일 세율을 안 낸다 | 🔴/설계 후 판정 |
| C-4 (카드 층) | 엔진 echo를 일부러 종전 값(0.7)으로 넣고 카드만 렌더 → `(70.0%)`를 **찍지 않는다** | 🔴 |

### 6-2. 뮤테이션 (구현 후 — 각 층을 **혼자** 죽여 구별력 확인)

1. 엔진의 `taxBase > 0` 필터 제거 → C-1 실패해야 함
2. 카드 항등식 가드 제거(엔진은 유지) → C-4 실패해야 함
3. 통산 행에서 유출(+) 칸을 `null`로 → A-1·A-2 실패해야 함 (주식에서 실제로 났던 결함)
4. 합계 축을 `totalIncomeAfterOffset`으로 되돌림 → A-3 실패해야 함
5. 비교 블록의 「큰 금액」을 항상 출력 → B-2 실패해야 함

### 6-3. 기존 테스트 영향 (착수 시 **실측**으로 확정 — 지금은 목록만)

| 테스트 | 영향 |
|---|---|
| `filing-form-roworder-parity.anchor.test.ts` · `filing-form-local-tax-identity.anchor.test.ts` | 새 행을 `AGGREGATE_ONLY`에 등록 |
| `e2e/transfer-multi-loss-offset-same-rate.spec.ts:152-166` | **「감면후 소득금액」 행의 각주 문구를 단언**한다 — 새 행으로 이전(표시 문구 변경 → 역방향 grep 필수) |
| `statement-formula-derives-value.anchor.test.tsx:199` | `결손금 통산` 포함 단언 — `buildIncomeFormula` 정정과 충돌 여부 확인 |
| `gb-bundled-filing-table-parity.anchor.test.ts` | 일반건물 일괄의 행 구성 대조 — 영향 확인 |
| `aggregate-short-term-part-bucket.anchor.test.ts:187·197` · `review-2026-08-f01.test.ts:95` | `groupTaxes[].appliedRate` 단언 — 모두 과세표준 > 0 케이스라 불변 **예상**(미검증, V-1) |

### 6-4. 게이트

`npx tsc --noEmit` 0건 · `npx vitest run __tests__/tax-engine/transfer/ __tests__/tax-engine/transfer-tax/ __tests__/components/ __tests__/calc/` · 관련 e2e(`E2E_PORT` 지정) · **브라우저 수동 확인 — 제보 시나리오 4자산을 실제로 입력**(미수행 시 명시).

---

## 7. 범위 외

1. **PDF·인쇄·요약 카드의 신고서 축 통일** — 기각 확정 사항이다(memory index 「기타」, `archive_transfer_completed.md:134`). 이 계획은 **화면 신고서 표 + 상세명세서 + 세율군 카드**만 다룬다. 다만 PDF/인쇄가 같은 각주·합계를 쓰는지는 **확인만** 한다(V-5) — 쓴다면 별건으로 기록한다.
2. **통산 로직·배분 순서** — 코어는 정확하다(`loss-offset-same-rate-axis.plan.md` §3 「코어는 무죄」). 제보 시나리오의 통산 금액(19,000,000 → 같은 70% 먼저, 잔액 1,000,000을 60:140 안분)은 **법정 순서와 일치**한다.
3. **엔진 `GroupTaxResult`에 버킷 목록 신설** — 호 버킷별 카드 행(`단기 40% / 단기 70%`)까지 펼치는 안은 이번에 하지 않는다. 필요하면 `clauseTaxes`(`ClauseTaxEcho`)에 세율을 echo하는 별건으로 낸다.
4. **단건 모드** — 통산이 없다.

---

## 8. 미검증(V) · 결정 필요(Q)

### 미검증 — 착수 첫 단계에서 실측으로 닫는다

| # | 내용 |
|---|---|
| V-1 | `groupTaxes[].appliedRate`를 단언하는 **모든 테스트**가 과세표준 > 0 케이스인지 — 엔진 필터 적용 후 전수 실행으로 확인 |
| V-2 | 군이 **하나**인 합산에서 같은 오표시(합계 세율·`BundledAllocationCard` 산식)가 실제로 나는지 — 코드로만 확인했다 |
| V-3 | 4단계 「비교과세」 항목이 화면에서 어떻게 보이는지(제보 이미지에 4단계가 없다) — 5단계와 **중복·충돌**하지 않는지 |
| V-4 | `buildIncomeFormula`의 「통산되어」 문구를 단언하는 테스트 전수 |
| V-5 | `lib/print/multi-transfer-print-sections.ts`·`lib/pdf/ResultPdfTransferSections.tsx`가 `offsetNotes`·합계 「양도소득금액」을 쓰는지 |
| V-6 | 감면 + 비교과세 + 통산이 **동시에** 있는 합산에서 B-2 문구 판정이 맞는지(`decidedAfterReduction` 실측 fixture 필요) |

### 결정 필요 — 권장안을 **굵게**

| # | 질문 | 선택지 |
|---|---|---|
| Q-1 | 비교 표시 위치 | **(권장) 5단계 산출세액 행(정본) + 세율군 카드 하단 한 줄** · 5단계만 · 카드만 |
| Q-2 | 「양도소득금액」 합계 열을 통산 전 Σ로 바꿀지(§4-A) | **(권장) 바꾼다**(안 바꾸면 소멸 케이스에서 새 행이 가로 합을 깬다) · 현행 유지 |
| Q-3 | 차손 자산 칸 부호 | **(권장) 주식과 동일 — 흡수 −, 유출 +** · 흡수만 표시 |
| Q-4 | 4단계 「비교과세」 항목 | **(권장) 변경 없음** · 5단계로 이관·삭제 |

---

## 9. 작업 순서

```
1. V-1~V-6 실측 → 미검증 항목 닫기                       → verify: 이 문서 §8 갱신
2. Pre-Do anchor 작성(§6-1) — 🔴 항목이 실제로 실패       → verify: 실패 메시지가 제보 수치와 일치
3. C 엔진 수정(group-tax 3지점) → C-1·C-2 통과            → verify: groupTaxes 단언 테스트 전수 + 세액 불변
4. B leaf `comparative-tax-display.ts` + 5단계·요약 카드   → verify: B-1~B-3
5. A 합산 빌더 행 추가·합계 축·각주 제거 + parity 등록     → verify: A-1~A-5 + parity 2건
6. C 카드 항등식 가드(+ Q-1 결정 시 A값 한 줄)            → verify: C-4
7. 문구 정정 `buildIncomeFormula` + e2e 이전              → verify: 해당 spec
8. 뮤테이션 5종(§6-2) · 게이트(§6-4) · 브라우저 수동 확인
```

착수 단위는 **한 브랜치·한 PR**을 권장한다 — 세 건이 같은 화면의 표시층이고, 신고서 표 행 추가(A)와 parity 테스트가 한 묶음이다. 엔진 수정(C)은 echo 의미 변경이라 **커밋을 분리**해 되돌리기 쉽게 둔다.

---

## 10. 구현 메모 (계획 대비 차이)

| 항목 | 계획 | 실제 |
|---|---|---|
| 통산·소멸 행 | 합산 전용 행으로 `AGGREGATE_ONLY` 등록 | **조건부 행**(통산 없으면 행 없음)이라 parity 테스트 2건은 **수정 불필요** — 빈 meta·무차손 격자에선 행이 아예 없다 |
| 비교 문구 | 닫힌 산식과 독립으로 항상 붙임 | 닫힌 산식이 재현되면 `산식 — 비교문`, 재현 못 하면 비교문이 근거 전부. `comparativeTaxView`는 A·B가 유한수가 아니면 `null`(옛 저장 결과 방어) |
| `buildIncomeFormula` | 통산액·소멸 구분 | `lossGiven`(엔진 `lossOffsetTable`)을 인자로 받아 「N이 … 공제(통산) — 통산되지 못한 M은 소멸」 |
| 카드 | 항등식 가드 + A값 한 줄 | `groupRateText`(leaf) + `data-testid="comparative-tax-decision"` |
| 뮤테이션 | 5종 | **5종 전부 구별 확인** — M1 엔진 필터(C-1) · M2 카드 항등식(C-3·C-4) · M3 유출 null(A-1~3) · M4 합계 축(A-2·3) · M5 항상 larger(B-2). 두 방어층(엔진·카드)은 서로를 가리지 않는다 |
| 기존 테스트 | 영향 목록만 | 4파일 수정: `gb-bundled-filing-table-parity` G-2 · `statement-formula-derives-value` B-1·B-2 · e2e `transfer-multi-loss-offset-same-rate`(각주 → 전용 행) |
| V-1 | 미검증 | 엔진 수정 후 `groupTaxes[].appliedRate` 단언 전수 통과(회귀 0) |
| V-2·V-3·V-5·V-6 | 미검증 | **미수행** — 단일 군 오표시 실측 · 4단계 화면 · PDF/인쇄 소비 · 감면+비교과세 fixture. 별건 확인 대상 |

anchor: `__tests__/components/multi-filing-loss-offset-row.anchor.test.ts` (18건)
