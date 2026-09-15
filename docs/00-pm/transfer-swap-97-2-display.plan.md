# 양도세 §97②2호 단서 swap — 표시 축 붕괴 수정 계획

- 작성: 2026-09-15
- 기준 커밋: `4d88963b` (master) — **아래 file:line 인용은 이 커밋 기준이다**
  ([[feedback_merged_plan_citations_drift]] — 머지 후 재검토 시 전수 대조할 것)
- 제보: 사용자 실측 화면 3장(입력 카드 · 신고서 양식 탭 · 계산 상세 명세서 1단계)

---

## 1. 제보와 재현

### 1.1 제보 내용

> 자본적지출 + 양도비 > 환산취득가액 + 개산공제액일 때 자본적지출 + 양도비를 취득가액으로 하는
> 규정을 **신고서 탭에서는 정확히 구현**했는데, **취득가액 상세 명세서에서는 엉터리로 표시**한다.

### 1.2 제보 시나리오 (화면 실측값)

| 항목 | 값 |
|---|---|
| 양도가액 | 400,000,000 |
| 취득시 기준시가(2019) | 150,000,000 |
| 양도시 기준시가(2026) | 300,000,000 |
| 자본적지출 | 230,000,000 |
| 양도비 | 0 |
| 취득일 / 양도일 | 2019-09-10 / 2026-06-03 |

환산취득가 200,000,000 + 개산공제 4,500,000 = **204,500,000** < 자본+양도비 **230,000,000**
⇒ §97②2호 **단서** 발동(`swapApplied: true`).

### 1.3 재현 — throwaway probe 실측 (2026-09-15)

`calculateTransferTax` → `buildRows`(신고서) · `buildStatementItems`(명세서)를 같은 result로 호출:

```
ENGINE    swapApplied=true · estimatedBase=200,000,000 · estimatedDeduction=4,500,000
          expenses=230,000,000 · capitalExpenditureForDisplay=230,000,000 · transferGain=170,000,000
          swapComparison={estimatedSide:204,500,000, directSide:230,000,000, chosen:"direct"}

FILING    양도가액 400,000,000 · 취득가액 230,000,000 · 필요경비 –        · 전체 양도차익 170,000,000   ✅
STATEMENT 양도가액 400,000,000 · 취득가액 430,000,000 · 필요경비 0        · 전체 양도차익 170,000,000   ❌
```

- 제보와 **정확히 일치**한다(사용자 화면: 명세서 취득가액 430,000,000).
- 명세서 항등식: 400,000,000 − 430,000,000 − 0 = **−30,000,000 ≠ 170,000,000**.
- 과대 표시 폭 = **200,000,000**(= 환산취득가액 전액).
- 세액은 불변이다 — 엔진은 정확하다(§1.4). **표시층 단독 결함**이다.

### 1.4 엔진은 법령과 일치한다 (변경 대상 아님)

「소득세법」 제97조 제2항 제2호 (KoreanLaw MCP 현행 본문, MST 280405 · 시행 2026-01-01):

> 2. 그 밖의 경우의 필요경비는 제1항제1호나목 … 의 금액에 자산별로 대통령령으로 정하는 금액을
>    더한 금액. **다만, 제1항제1호나목에 따라 취득가액을 환산취득가액으로 하는 경우로서 가목의
>    금액이 나목의 금액보다 적은 경우에는 나목의 금액을 필요경비로 할 수 있다.**
>    가. 제1항제1호나목에 따른 환산취득가액과 본문 중 대통령령으로 정하는 금액의 합계액
>    나. 제1항제2호 및 제3호에 따른 금액의 합계액

⇒ 단서 채택 시 **필요경비 전체 = 자본적지출 + 양도비**이고 **환산취득가액은 차감 성분이 아니다**.

엔진 구현 일치 확인:
- `lib/tax-engine/transfer-tax-helpers.ts:274` — 단서는 `input.useEstimatedAcquisition === true`
  (환산 모드)에만 적용. 감정가액·매매사례가액 제외 → **문언 그대로**다(입력 카드 hint와도 일치).
- 같은 파일 `:396` — `acqCostForGain = swap ? 0 : acquisitionCostBase` (환산취득가액 미차감).

---

## 2. 무엇이 정본인가 — 표시 축

이 저장소는 **신고서 양식 표시 관행**을 이미 채택했다: 「자본적지출은 취득가액 칸에 합산,
필요경비 칸은 양도비만」(`FilingFormTableHelpers.ts:522` · `transfer-tax-aggregate.ts:529` 외).

swap 축에 그 관행을 적용하면:

| 칸 | 값 | 근거 |
|---|---|---|
| 취득가액 | 0(엔진 차감분) + 자본적지출 230,000,000 = **230,000,000** | 표시 관행 |
| 필요경비 | 엔진 필요경비 230,000,000 − 자본적지출 230,000,000 = **0**(→ "–") | 표시 관행 |
| 전체 양도차익 | 170,000,000 | 엔진 |

⇒ 400,000,000 − 230,000,000 − 0 = 170,000,000 ✅ — **현행 단건 신고서 탭이 이 축이다**.
사용자가 「정확」이라 확인한 화면이므로 **이것을 정본으로 채택**하고, 나머지를 여기에 맞춘다.

> ⚠️ 단서 적용 시 국세청 서식의 「취득가액」란 기재 실무 관행 자체는 이 계획의 범위가 아니다
> (저장소 전역 정책이며 이미 실가 모드에서 채택됐다). 여기서는 **한 화면 안의 두 카드가
> 어긋나는 것**을 없앤다.

---

## 3. 왜 지금까지 안 잡혔나 — 안전망 실측

`__tests__/components/estimated-acq-capex-identity.anchor.test.ts` (#069)가 바로 이 항등식
(「양도가액 − 취득가액 − 필요경비 = 전체 양도차익」)을 신고서·명세서 양쪽에서 고정한다. 그런데
E-0이 **swap 축을 명시적으로 배제**한다:

```ts
expect(result.swapApplied, "단서 swap이 걸리면 이 축이 아니다").toBeFalsy();
```

⇒ 본문(환산) 축만 지켜졌고 **단서 축은 안전망이 0건**이다. 그래서 200,000,000 과대가 초록 뒤에
살아남았다.

또 하나: `__tests__/calc/transfer-swap-acq-row-note-n5.anchor.test.ts` (N-5, 2026-08-23)가
**현행 동작을 의도적으로 고정**한다 — 「환산 산식은 그대로 두고 **차감 제외 고지만** 덧붙인다」.
그 판단의 근거는 헤더에 남아 있다: 「환산취득가액은 실재하는 값이고 §97②2호 **가목의
구성요소**다」.

> 🔑 [[feedback_deliberate_design_looks_like_the_defect]] — 이 줄은 결함이 아니라 **의도된
> 설계**다. 그러나 그 설계는 **`capEx = 0`인 fixture로만 검증**됐다(N5 전건이 `capEx` 인자에 0을
> 넘긴다). `capEx > 0`이면 행의 **값 자체**가 `estimatedBase + capEx`로 부풀어(:284), 고지
> 문구로 설명되지 않는 **제3의 수**가 된다. 제보 화면의 430,000,000이 그것이다.
> ⇒ 「고지만 붙인다」는 결론을 **뒤집는 것이 이 계획의 핵심**이며, N5-02·N5-03은 반전된다
> ([[feedback_shared_assertion_reversal_erases_sibling_net]] — 반전 시 형제 단언이 지워지지
> 않도록 §7.2에서 대체 단언을 명시한다).

---

## 4. 결함 목록

부호: 🔴 실측 확인 · 🟡 코드로 확인했으나 수치 미실측 · ⚪ 관찰(판단 필요)

### 🔴 D-1 — 단건 계산 상세 명세서 취득가액 (제보 본체)

`components/calc/results/transfer/DetailedStatementHelpers.ts:281~288`

```ts
const estimatedNoSwap = result.usedEstimatedAcquisition === true && result.swapApplied !== true;
const singleAcq = result.usedEstimatedAcquisition
  ? (result.estimatedBase ?? 0) + (estimatedNoSwap ? 0 : capEx)   // ← swap이면 200,000,000 + 230,000,000
  : inverseAcquisitionForDisplay({ ... });
```

swap 축에서 `estimatedBase`(차감되지 않는 값) 위에 `capEx`까지 얹는다. **430,000,000**.
같은 화면 신고서는 `estimatedDisplay === null`이라 실가 역산 분기로 내려가 230,000,000을 낸다
(`FilingFormTableHelpers.ts:372`) — 두 카드가 정면으로 어긋난다.

### 🔴 D-2 — 단건 명세서 산식 문구 (D-1의 짝)

`DetailedStatementFormulaBuilders.ts:465~502`

swap에서도 환산 산식을 그린다: 「환산취득가 200,000,000 = 양도가액 × (150,000,000/300,000,000)
+ 자본적지출 230,000,000 — … ※ §97②2호 단서 적용 — 이 금액은 차감되지 않습니다」.
- 산식이 만드는 수(430,000,000)와 **행의 값**이 같아 **거짓 등식이 완성**된다.
- 「이 금액은 차감되지 않습니다」가 가리키는 대상이 모호하다 — 자본적지출 230,000,000은
  **차감된다**(그것이 단서의 전부다).
- 필요경비 산식(`:576`)의 「자본적지출은 취득가액에 합산 표시」도 현행 취득가액 행에는
  환산분까지 섞여 있어 **설명이 사실과 다르다**.

### 🔴 D-3 — 다건(aggregate) 신고서·명세서 자산 열 + 합계

실측(자산1 = 제보 시나리오, 자산2 = 무관한 토지):

```
AGG 엔진 echo   p.acquisitionPrice=200,000,000 · p.necessaryExpense=30,000,000(역산) · capEx=230,000,000
AGG 신고서 A1   취득가액 430,000,000 · 필요경비 0 · 전체 양도차익 170,000,000
                ⇒ 400,000,000 − 430,000,000 − 0 = −30,000,000 ≠ 170,000,000   ❌
```

- 표시식은 `FilingFormTableAggregateHelpers.ts:211` `p.acquisitionPrice + p.capitalExpenditureForDisplay`.
  **계산 명세서 다건 perAsset·합계도 같은 식**(`DetailedStatementHelpers.ts:258~262`·`:341`).
- 근인은 엔진 echo다 — `lib/tax-engine/transfer-tax-aggregate.ts:483~490` `effectiveAcquisitionPrice`가
  `usedEstimatedAcquisition`만 보고 **swap을 보지 않는다**. 필요경비는 그 값에서 역산되므로
  30,000,000이라는 **법령상 의미 없는 수**가 나온다.
- 선례: 다필지 엔진은 이미 반대로 한다 — `multi-parcel-transfer.ts:449~450`
  `acquisitionPrice: swapApplied ? 0 : acquisitionPrice` · `estimatedDeduction: swapApplied ? 0 : …`.
- ⚠️ 다건 **요약 카드**(`MultiTransferTaxSummaryCard.tsx:132~133`)는 취득가액 200,000,000 +
  필요경비 30,000,000으로 **항등식이 성립한다** — 역산 짝이 교차검산을 성립시켜 오류를 가리는
  형태다([[feedback_aggregate_display_rederives_engine_value]]). 세액 불변이라 안전망도 안 걸린다.

### 🔴 D-4 — 비과세(1세대1주택) 조기반환에서 swap echo 소실

`lib/tax-engine/transfer-tax-finalize.ts:643~678` `buildExemptEarlyResult`는
`exemptGrossGain`·`expenses`·`estimatedBase`·`estimatedDeduction`은 싣지만
**`swapApplied`·`swapComparison`을 싣지 않는다**(`grossForEcho`에 둘 다 있는데도).

실측(같은 시나리오를 `isOneHousehold: true`로):

```
EXEMPT  isExempt=true · swapApplied=undefined · swapComparison=undefined
        estimatedBase=200,000,000 · estimatedDeduction=4,500,000 · expenses=230,000,000
        exemptGrossGain=170,000,000
```

⇒ 신고서가 `estimatedDisplay` 환산 분기로 떨어져 **취득가액 200,000,000 · 필요경비 4,500,000**
(400,000,000 − 200,000,000 − 4,500,000 = 195,500,000 ≠ 170,000,000).
⇒ 메인 결과뷰의 §97②2호 안내 카드(`TransferTaxResultView.tsx:468`)도 **뜨지 않는다** —
비과세 사용자에게는 단서 적용 사실 자체가 화면에서 사라진다.
[[feedback_early_return_branch_skips_pipeline_stages]] 의 재발이다(그 파일 `:664` 주석이 같은
경로의 선례를 이미 기록하고 있다).

### ⚪ D-5 — 사이드바 합계 축 불일치

`lib/stores/transfer-per-asset-summary.ts:540~541`이 swap과 무관하게
`acqPrice = estimatedBase`(200,000,000)를 쓰고, 경비는 `singleResult.expenses`(230,000,000)를 쓴다.
사이드바는 양도차익을 표시하지 않아 **항등식 붕괴는 없다**. 다만 결과 탭(230,000,000 / –)과
같은 화면에서 축이 다르다.

### ⚪ D-6 — 상세 명세서에 단서 비교 근거가 없다

제보 화면 어디에도 **개산공제 4,500,000**과 **비교 결과**(204,500,000 < 230,000,000)가 없다.
메인 결과뷰에는 있다(`TransferTaxResultView.tsx:468~480`). 명세서만 보는 사용자는 단서 적용을
검증할 수 없다. D-2 산식 교체 시 함께 해소한다.

---

## 5. 수정 설계

### 5.1 원칙

> **swap 축은 「환산 축」이 아니라 「실가 축」으로 내린다.** 단서가 채택되면 환산취득가액은
> 차감 성분이 아니므로, 표시도 실가 모드와 같은 역산 경로를 타면 신고서·명세서·다건·비과세가
> **한 축**이 된다. 현행 단건 신고서가 이미 그렇게 동작하며(`estimatedDisplay = swap ? null`),
> 그 결과가 사용자 확인 화면이다.

### 5.2 지점별

| # | 파일:라인 | 변경 |
|---|---|---|
| **F-1** | `DetailedStatementHelpers.ts:283~288` | `singleAcq` 삼항에서 **swap이면 `inverseAcquisitionForDisplay` 경로**로 보낸다(신고서 `estimatedDisplay` 게이트와 같은 조건). 현행 `estimatedNoSwap` 플래그는 `singleExp`(:346)에서 계속 쓰이므로 **그대로 둔다** |
| **F-2** | `DetailedStatementFormulaBuilders.ts:465~502` | swap 분기를 **먼저** 갈라 환산 산식을 그리지 않는다. 대체 문구(§5.3) |
| **F-3** | `DetailedStatementFormulaBuilders.ts:574~578` | 필요경비 산식의 「취득가액에 합산 표시」 문구를 F-2와 정합하게 다듬는다(자본적지출이 취득가액 칸에 표시된다는 사실은 유지) |
| **F-4** | `lib/tax-engine/transfer-tax-aggregate.ts:483~490` | `effectiveAcquisitionPrice`를 `r.result.swapApplied ? 0 : (기존)`으로. 다필지 선례와 같은 형태. **표시 전용 echo이므로 세액 불변**(필요경비는 :494에서 자동 역산 → 230,000,000) |
| **F-5** | `lib/tax-engine/transfer-tax-finalize.ts:646~678` | `buildExemptEarlyResult`에 `swapApplied: grossForEcho.swapApplied` · `swapComparison: grossForEcho.swapComparison` echo 추가. **세액 불변**(비과세는 0) |
| **F-6** (선택) | `transfer-per-asset-summary.ts:537~541` | swap이면 `acqPrice`를 자본적지출 축으로. **Q-2 결정 후 착수** |

> F-4는 표시층을 **한 줄도 건드리지 않고** 다건 신고서·명세서·요약카드를 동시에 고친다
> — `p.acquisitionPrice + p.capitalExpenditureForDisplay` = 0 + 230,000,000 = 230,000,000,
> 역산 필요경비 230,000,000 − 230,000,000 = 0. 단건 축(§2 표)과 **같은 수**다.

### 5.3 F-2 대체 산식 (안)

```
취득가액 230,000,000
  자본적지출 230,000,000 + 양도비 0 = 230,000,000 — 「소득세법」 §97②2호 단서
  (환산취득가액 200,000,000 + 개산공제 4,500,000 = 204,500,000 < 230,000,000이므로
   자본적지출·양도비 합계를 필요경비로 적용 — 환산취득가액은 차감하지 않습니다)
```

- 값과 산식이 일치한다(거짓 등식 제거).
- 개산공제·비교 근거가 노출되어 **D-6도 함께 해소**된다.
- 수치는 전부 엔진 echo에서 온다(`estimatedBase` · `estimatedDeduction` · `swapComparison` ·
  `capitalExpenditureForDisplay`) — 표시층이 산식을 **재계산하지 않는다**
  ([[feedback_aggregate_display_rederives_engine_value]]).
- `swapComparison`이 없는 경로(분리 입력이 아닌 legacy)에서는 비교 괄호를 **생략**한다(거짓 수
  금지).

---

## 6. V 실측 결과 (2026-09-15 · throwaway probe)

> 🔑 **핵심 발견 — swap 시 「취득가액 0」은 이 저장소 엔진의 확립된 축이다.**
> `multi-parcel-transfer.ts:449` · `transfer-tax-mixed-use-commercial.ts:231~232` ·
> `transfer-tax-mixed-use-housing.ts:289~290` · GB 카드 경로가 **전부** swap에서
> `acquisitionPrice = 0`을 낸다(실측). **`transfer-tax-aggregate.ts:483`만 예외**다
> ⇒ F-4는 새 설계가 아니라 **누락된 한 곳을 기존 축에 합류**시키는 변경이다.

| # | 결과 |
|---|---|
| **V-1 GB** | ✅ **결함 없음**. 실측(자본적지출 600,000,000 · 총양도 2,000,000,000): 토지 `acquisitionPrice=0` · `necessaryExpense=592,987,623` · `transferGain=1,363,174,955` ⇒ 1,956,162,578 − 0 − 592,987,623 = 1,363,174,955 ✅. `filingDisplay={}`라 표시층이 역산 축을 탄다 |
| **V-2 겸용주택** | ✅ **결함 없음**(코드 확인). `swapToDirect ? 0`으로 파트 취득가액을 0으로 둔다 |
| **V-3 상가 CB** | ⚪ 항등식은 성립(`usedEstimatedAcquisition=false` → 실가 역산). 다만 명세서 산식이 「실제 거래가액」이라 적는다 — 환산이었다는 사실이 사라진다. **별건**(N5-04가 현행을 고정 중) |
| **V-4 다필지** | ✅ 필지별 실측: `acquisitionPrice=0` · `expenses=230,000,000` · `swapApplied=true` ⇒ 400,000,000 − 0 − 230,000,000 = 170,000,000 ✅. 단 branch가 `usedEstimatedAcquisition:false`·`expenses` 미설정으로 result를 올려 **합계 열은 폼 legacy 값에 의존**한다 — Q-3대로 **별건** |
| **V-5 소비처** | 전수 확인: 다건 신고서(`FilingFormTableAggregateHelpers.ts:211`) · 명세서(`DetailedStatementHelpers.ts:258·341`) · 요약카드(`MultiTransferTaxSummaryCard.tsx:49`) · PDF 다건(`ResultPdfTransferSections.tsx:246`) · `MultiTransferPropertyBreakdown.tsx:72~73` |
| **V-6 감정·매매사례** | 엔진 `transfer-tax-helpers.ts:273` `isConversionMode = useEstimatedAcquisition === true`로 차단. anchor 대조군(A-7)으로 고정 |

⇒ **결함 모집단은 계획 §4 그대로**(D-1~D-6). GB·겸용주택·다필지에 같은 형태는 **없다**.

## 7. 테스트 계획

### 7.1 신규 anchor (핵심)

`__tests__/components/swap-97-2-display-identity.anchor.test.ts` — **#069 anchor의 swap 축 쌍둥이**.
격자: 자본적지출만 / 자본+양도비 / 대조군(본문 환산, swap 미발동).

- **A-1** 엔진 축 고정: `swapApplied=true` · `expenses = capEx + 양도비` · `transferGain = 양도가액 − expenses`
- **A-2** 신고서 항등식: `양도가액 − 취득가액 − 필요경비 = 전체 양도차익` **그리고** 취득가액 = 자본+양도비
- **A-3** 🔴 **명세서 항등식 + 신고서와 값 일치**(현행 실패 — 430,000,000)
- **A-4** 🔴 **다건** 자산 열·합계에서 A-2·A-3 (현행 실패)
- **A-5** 🔴 **비과세 + swap**에서 `swapApplied` echo 존재 + 신고서 항등식(`exemptGrossGain` 축, 현행 실패)
- **A-6** 산식 문자열이 **값과 일치**한다: 산식에 등장하는 합이 행의 값과 같다(거짓 등식 금지)
- **A-7** 대조군 — swap 미발동(본문)에서는 #069 축이 **그대로** 유지된다(회귀 0 확인)

### 7.2 N-5 anchor 반전 처리

`transfer-swap-acq-row-note-n5.anchor.test.ts` N5-02·N5-03은 「swap에서도 환산 산식이 남는다」를
단언하므로 **반전**된다. 그 항목이 **함께 지키던 것**(고지 문구의 존재)은 사라지면 안 된다
([[feedback_shared_assertion_reversal_erases_sibling_net]]):

- 「환산취득가 문구 유지」 단언 → **「환산취득가액 200,000,000이 비교 근거로 남되 취득가액 값에는
  들어가지 않는다」**로 교체
- 「차감되지 않습니다」 고지 → 대체 문구(§5.3)의 **「환산취득가액은 차감하지 않습니다」** 로 유지
- N5-01(대조군) · N5-04(실가 모드)는 **그대로** — 구별력 보존
- 헤더의 2026-08-23 판단 기록은 **지우지 않고**, 왜 뒤집혔는지(capEx=0 fixture 한계)를 덧쓴다
  ([[feedback_fixture_default_masks_gate_defect]])

### 7.3 뮤테이션 probe (수정 후, 안전망 구별력 실측)

| # | 뮤테이션 | 기대 |
|---|---|---|
| MUT-1 | F-1의 swap 분기를 되돌린다 | A-3 실패 |
| MUT-2 | F-4의 `swapApplied ? 0` 제거 | A-4 실패 |
| MUT-3 | F-5의 echo 2줄 제거 | A-5 실패 |
| MUT-4 | F-2 산식을 현행(환산 산식)으로 되돌린다 | A-6 실패 |
| MUT-5 | 대조군 확인 — swap 미발동 경로만 바꿔 본다 | A-7만 실패(교차 오염 0) |

### 7.4 E2E 1건

`e2e/transfer-swap-97-2-statement.spec.ts` — 제보 시나리오를 **폼 입력 → 계산 → 결과**로 밟아
**신고서 탭과 명세서 탭의 취득가액이 같은 수**임을 단언한다.
⚠️ jumpToStep 등으로 단계를 우회하지 않는다([[feedback_e2e_workaround_hides_the_defect_it_documents]]).
⚠️ 단계 이동 단언은 `aria-current`로([[feedback_wizard_step_assertion_vacuous_indicator_label]]).

---

## 8. 사용자 결정 (Q) — 확정

| # | 결정 | 근거 |
|---|---|---|
| **Q-1** | ⚠️ **기본안 (b)를 (a)로 뒤집었다** — PDF 다건·다건 요약카드는 **현행 유지**(swap 자산 취득가액 0) | V 실측이 전제를 바꿨다. 「취득가액 0 + 필요경비 전액」은 **앱의 다수 축**이다 — GB·다필지·겸용주택이 전부 그렇게 표시하고(§6), 사이드바·요약카드·PDF는 swap 이전부터 **자본적지출을 취득가액에 합산하지 않는다**(신고서 관행은 신고서·명세서 두 카드만의 축이다). (b)를 채택하면 **swap과 무관한 모든 다건 표시**가 바뀐다 — Surgical 위반. 항등식은 (a)에서 성립한다(0 + 230,000,000 = 230,000,000 차감) |
| **Q-2** | **(a) 포함** — 사이드바를 엔진 축(취득가액 0 · 필요경비 전액)으로 | 종전에는 「취득가액 200,000,000 + 필요경비 230,000,000」이 나란히 떠 합 430,000,000이 실제 차감액과 어긋났다. 0이면 렌더러가 그 행을 값으로 그리지 않는다 — **거짓 수를 보이지 않는다**. 바로 아래 상가(§164⑧) 분기가 같은 교리를 이미 쓰고 있었다 |
| **Q-3** | **(b) 별건** — 다필지 합계 열 축 | 모집단·회귀 범위가 다르다(§6 V-4) |

## 9. 작업 순서

```
0. V-1~V-6 실측                         → verify: 각 항목 수치·file:line 확정, 결함 목록 확정
1. 신규 anchor A-1~A-7 작성(실패 확인)   → verify: A-3·A-4·A-5가 현행에서 실패 (Pre-Do anchor)
2. F-5(비과세 echo) → F-4(aggregate echo) → verify: A-4·A-5 통과, 엔진 세액 회귀 0
3. F-1(명세서 값) → F-2·F-3(산식)         → verify: A-3·A-6 통과
4. N-5 anchor 반전 처리(§7.2)             → verify: N5-01·N5-04 불변
5. 뮤테이션 MUT-1~5                       → verify: 각 1건 이상 실패(구별력 실측)
6. Q-1·Q-2 반영                           → verify: 해당 화면 anchor 추가
7. E2E 1건                                → verify: 두 탭 취득가액 동일
8. 전체 게이트                            → verify: npm run check:pre-pr
```

**커밋 분리**: (1) 엔진 echo 2건(F-4·F-5) · (2) 명세서 값·산식(F-1~F-3) · (3) anchor·E2E ·
(4) Q 반영. PR 1건.

---

## 10. 회귀 위험

| 위험 | 완화 |
|---|---|
| F-4가 다건 **세액**을 움직인다 | `acquisitionPrice`·`necessaryExpense`는 `PerPropertyBreakdown`의 **표시 전용 echo**다(세액은 `r.result`·`taxBaseShare` 축). A-7 + 기존 다건 anchor 전건으로 확인 |
| F-5가 비과세 경로의 다른 표시를 바꾼다 | 추가되는 두 필드는 현재 `undefined`다 — 새 분기를 **여는** 변경이다([[feedback_ui_gate_expansion_activates_latent_defect]]). 비과세+환산+**swap 미발동**(본문) 대조군을 A-7에 포함 |
| 산식 문자열 변경이 셀렉터를 깨뜨린다 | 「차감되지 않습니다」·「환산취득가」를 쓰는 테스트·E2E를 **역방향 grep** 후 착수([[feedback_display_string_change_needs_reverse_grep]]) |
| swap이 서지 않는 인접 모드(감정가액·매매사례)를 오염 | V-6 뮤테이션으로 구별력 확인 |

---

## 11. 실행 결과 (2026-09-15)

| 지점 | 상태 | 파일 |
|---|---|---|
| F-5 비과세 echo | ✅ | `transfer-tax-finalize.ts` — `swapApplied`·`swapComparison` 2줄 |
| F-4 aggregate echo | ✅ | `transfer-tax-aggregate.ts` — `swapApplied ? 0` |
| F-1 명세서 값 | ✅ | `DetailedStatementHelpers.ts` — swap을 실가 역산 경로로 |
| F-2 취득가액 산식 | ✅ | `DetailedStatementFormulaBuilders.ts` — 나목 축 + 가목 비교 근거(D-6 해소) |
| F-3 필요경비 산식 | ✅ | 같은 파일 — 조문 표기 통일 |
| F-6 사이드바(Q-2) | ✅ | `transfer-per-asset-summary.ts` |
| N-5 anchor 반전 | ✅ | 헤더에 2026-08-23 판단과 **뒤집힌 이유**를 함께 남김 |

**안전망**: 신규 anchor 20건(A-1~A-8) + N-5 4건 + #069 형제 11건 = 35건 통과.

**뮤테이션 실측 (구별력)**

| # | 뮤테이션 | 실패 건수 |
|---|---|---|
| MUT-1 | F-1 되돌림 | 2 |
| MUT-2 | F-4 되돌림 | 2 |
| MUT-3 | F-5 echo 제거 | 2 |
| MUT-4 | F-2 게이트 무력화 | 4 |
| MUT-5 | 사이드바 되돌림 | 1 |
| — | 복원 후 | 0 (24건 통과) |

**E2E** `e2e/transfer-swap-97-2-statement.spec.ts` — 통과. 뮤테이션(F-1 되돌림)에서
`Expected "230,000,000" / Received "430,000,000"` 로 **제보 화면의 수를 그대로 잡는다**.
명세서는 표가 아니라 div 목록이라 `data-statement-row`·`data-statement-value` 앵커를 추가했다.

**회귀**: `npm run test:transfer` 861파일 9,161테스트 통과. 문구 변경의 역방향 grep — 변경한
문구를 셀렉터로 쓰는 테스트·E2E는 N-5 외에 **0건**.
