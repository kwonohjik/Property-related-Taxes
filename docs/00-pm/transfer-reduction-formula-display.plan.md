# 양도소득세 감면 — 결과탭 계산과정 표시 보강 계획서

- 작성일: 2026-08-25
- 브랜치: `worktree-transfer-reduction-result-view`
- 요청: **감면 사항이 입력되면 감면세액 유무와 무관하게, 결과탭에 계산 과정을 라벨과 변수(실제 값)를 포함해 표시**
- 제보 케이스: 조특법 §99의2(신축·미분양·1세대1주택) — 5년 후 양도, **5년시점 기준시가가 취득시보다 하락**해 감면세액 0
- **검증 깊이: L3** (초판 L2 → 정정. 근거 §0)

---

## 0. 🔴 초판 판정 정정 (자가검토 2026-08-25)

초판은 이 작업을 **"표시 보강"(세액 불변)** 으로 규정하고 §4-2에 「엔진 계산 로직 일절 무변경」을
못박았다. **틀렸다.**

`transfer-tax.ts:568-569` 실측:

```ts
if (incomeDeduction.appliedId) {
  transferIncome = Math.max(0, transferIncomeBefore993 - incomeDeduction.reducible);
}
```

차감은 `appliedId` 존재에 의존하고, `appliedId`·`unsold992Detail`은 **같은 resolution 객체에서
함께 나온다**(`income-deduction-router.ts:303-330`). 즉 **detail이 화면에 없다 = 평가가 안 됐다 =
차감도 0**이다.

⇒ **D-7은 표시 결함이 아니라 세액 결함이다.** 제보 케이스는 `neg_pos`라 정답이 0이어서 세액이
**우연히 맞았을 뿐**이고, 같은 원인이 `all_positive` 케이스에 걸리면 **감면이 통째로 누락되어
세액이 과대 산출**된다.

| 유지 | 변경 |
|---|---|
| D-1~D-6 표시 보강의 내용·범위 | 검증 깊이 L2 → **L3** |
| Phase 1 echo 추가가 계산 무변경이라는 점 | 「이 작업 전체가 세액 불변」이라는 전제 → **철회** |
| D-7 우선 순서 | D-7의 **성격**(표시→세액)과 **PR 분리 권고**(Q-5) |

---

## 1. 재현 실측 (추정 아님)

throwaway probe로 제보 케이스를 재현했다. 사용자 화면 수치와 **정확히 일치**한다.

| 항목 | probe 실측 | 이미지1 |
|---|---|---|
| 양도차익 | 14,750,000 | 14,750,000 |
| 장기보유특별공제 | 3,540,000 | 3,540,000 |
| 양도소득금액 | 11,210,000 | 11,210,000 |
| 소득금액 감면대상 | 0 | 0 |

probe 입력: 취득 2013-10-23 / 양도 2025-11-20 / 취득가 127,000,000 / 전용 74.03㎡ /
기준시가 취득시 100,000,000 · 5년시점 90,000,000 · 양도시 120,000,000.

### 1-1. 엔진 반환값 (실측)

```jsonc
// result.unsold992Detail
{
  "isEligible": true,                 // ← 요건은 충족. 적용 불가가 아니다
  "effectCategory": "income_deduction",
  "reducibleTransferIncome": 0,
  "fiveYearRatio": 0,
  "signCase": "neg_pos",              // (분자 −, 분모 +) → 감면 0
  "formulaSteps": [
    { "label": "5년간 발생 양도소득금액 (기준시가 안분)", "value": 0,
      "formula": "양도소득금액 11,210,000 × (5년시점 기준시가 90,000,000 − 취득시 기준시가 100,000,000) ÷ (양도시 기준시가 120,000,000 − 취득시 기준시가 100,000,000)" },
    { "label": "과세대상소득금액에서 공제 (초과금액은 없는 것)", "value": 0,
      "formula": "5년간 발생분 0을 과세대상소득금액에서 공제" }
  ]
}
```

**중요**: 엔진은 감면 0인 경우에도 `formulaSteps`를 **값이 대입된 채로 이미 반환**하고 있고,
`ReductionDetailCards.tsx:159` → `IncomeDeductionDetailCard`가 이를 렌더한다.

### 1-2. 🔴 V-1 실측 결과 — 상세 카드가 화면에 **없다** (2026-08-25 사용자 확인)

코드상으로는 렌더되어야 한다. `ReductionDetailCards`는 `TransferTaxResultView.tsx:621`에서
**접힘 없이 최하단에 항상 렌더**되고, `:159`는 `result.unsold992Detail`만 있으면 카드를 낸다.
`evalHybrid`(`income-deduction-router.ts`)도 적격·부적격 무관하게 `detailField`를 스프레드한다.

⇒ **화면에 없다 = `unsold992Detail`이 result에 도달하지 않는다.** 이것은 표시 문구 문제가 아니라
**별개의 배선 결함**이며, 본 계획의 최우선 항목으로 승격한다(D-7).

⚠️ §1-1의 probe는 `calculateTransferTax`를 **직접 호출**했다 — ④ API 변환·⑫ Zod·⑬ body spread·
⑭ route 매핑을 **한 층도 태우지 않았다**. 따라서 "엔진은 정상"은 참이지만 "화면까지 온다"의
근거가 되지 못한다. (memory `feedback_leaf_anchor_skips_zod_layer`)

### 1-3. V-2 실측 — 입력 위젯은 **있다** (이미지2)

§99의2 폼에 "기준시가 (취득일부터 5년이 지난 후 양도 시 필수)" 섹션이 존재하며, 사용자 실제 입력값은:

| 시점 | 값 | 비고 |
|---|---|---|
| 취득시 | 121,191,049 | **PHD 환산(§164④) 자동 계산값** — 직접 입력칸이 아님 |
| 5년시점 | 112,969,780 | 2018년 공시 |
| 양도시 | 126,887,420 | 2026년 공시 |

분자 = 112,969,780 − 121,191,049 = **−8,221,269** (음수)
분모 = 126,887,420 − 121,191,049 = **+5,696,371** (양수)
⇒ `neg_pos` → 감면 0. §1-1 probe와 **동일한 부호 케이스**임이 확인됐다.

⚠️ 취득시 기준시가가 **PHD 환산 자동 계산값**이라는 점이 D-7의 유력 가설이다(§3 D-7 참조).

---

이미지1이 보여주는 것은 **3단계 상세명세 섹션의 "소득금액 감면대상" 행**이며, 이 행만 값이
빠진 일반 문구를 쓴다.

---

## 2. 원인 (file:line)

`components/calc/results/transfer/DetailedStatementHelpers.ts:483-487`

```ts
formula:
  // §99의3은 3시점 공시가격 echo가 있어 분수 산식까지 풀어씀. 그 외 소득금액차감 조문은
  // 조문별 산출근거를 ⑦ 상세 카드(IncomeDeductionDetailCard)가 노출하므로 신고서 행은 일반 문구.
  !isAggregate && result.new993Detail
    ? buildNew993ReducibleFormula(result.new993Detail, singleIncome)
    : INCOME_DEDUCTION_5YEAR_FORMULA,
```

- `INCOME_DEDUCTION_5YEAR_FORMULA` = `DetailedStatementFormulaNodes.tsx:11-16` — **값이 없는 상수 JSX**.
  이미지1의 `양도소득금액 × (5년시점 − 취득시 공시가격)/(양도시 − 취득시 공시가격)` 이 바로 이것이다.
- `buildNew993ReducibleFormula` = `DetailedStatementFormulaBuilders.ts:235-271` — 값 인라인 + `Frac` 분수.
  **§99의3 전용**이다.

즉 설계상 의도된 분기이며, "그 외 조문은 상세 카드가 대신한다"는 전제가 깔려 있다. 요청은 이
전제를 바꾸는 것이다.

---

## 3. 결함·갭 목록

| # | 내용 | 근거 |
|---|---|---|
| **D-1** | 3단계 "소득금액 감면대상" 행이 §99의3에만 값 인라인. 나머지 소득금액차감 조문은 값 없는 일반 문구 | `DetailedStatementHelpers.ts:486-487` |
| **D-2** | 다건·일괄(`isAggregate`)은 §99의3조차 일반 문구 | 같은 곳 `!isAggregate &&` 조건 |
| **D-3** | 하이브리드 8조문·§99·§98의8은 **Result에 3시점 기준시가 숫자 echo가 없다**(문자열 `formula` 안에만 있음) → `Frac` 분수 렌더 불가 | `unsold-hybrid.ts:61-82`(`UnsoldHybridResult`)에 `standardPrice*` 부재 / `new-99.ts:49-51`·`unsold-98-8.ts:68-72`는 **Input** 전용. 대조군 `new-99-3.ts:121-123`은 Result에 echo 보유 |
| **D-4** | 감면 0일 때 **왜 0인지** 사유가 없다. 엔진 `formula` 문자열도 분자·분모까지만 쓰고 `= 0` 결과와 부호 사유를 안 쓴다 | 실측 JSON 위 · `unsold-hybrid.ts:274-278` |
| **D-5** | 5년 **내** 양도(세액감면 경로)의 `formulaSteps`는 안내 문구 1줄뿐 — 산출세액 × 감면율 = 감면세액 대입 과정이 없다(`value: 0`) | `unsold-hybrid.ts:229-233` |
| **D-6** | 3단계 "세액감면대상금액"(§90① 세액감면방식) 행은 결과값만 있고 산출 과정이 없다 | `DetailedStatementHelpers.ts:458-470` |
| **🔴 D-7** | **§99의2 상세 카드가 화면에 없다** — `unsold992Detail`이 result에 도달하지 않는다. §0에 따라 **표시가 아니라 세액 결함**(감면 통째 누락 가능). 원인 미규명 | V-1 사용자 확인 · `TransferTaxResultView.tsx:621`은 무조건 렌더 · `transfer-tax.ts:568-569` |
| **🆕 D-8** | **적용 불가(ineligible)일 때 계산 과정이 아예 안 나온다.** rose 카드가 `ineligibleReasons` 사유만 렌더하고 `formulaSteps`를 건너뛴다 | `IncomeDeductionDetailCard.tsx:61-78` |

> **D-8은 요청 문언에 직접 걸린다** — "감면 사항이 **입력되면** 감면세액이 있든 없든 계산 과정을
> 표시". 요건 미충족으로 적용 불가인 경우도 "입력된" 경우다. 초판 D 목록에 없었다.

### D-7 원인 가설 (Phase 0에서 배타적으로 가른다)

⑫⑬⑭ 필드 배선은 전수 grep으로 **모두 존재**함을 확인했다(`standardPriceAt5Years992`가
폼 defaults·InputForm·API 변환 `transfer-tax-api-reductions.ts:506`·Zod `transfer-tax-schema-reductions.ts:373`·
validate·엔진 `unsold-hybrid.ts:618`에 전부 있다). 따라서 **단순 필드 누락은 아니다**.

**자가검토 실측으로 가설 공간이 크게 좁혀졌다.** 결정적 사실:

> `evaluateP2HybridFromReduction`(`unsold-hybrid.ts:600-621`)은 `r.type === "unsold_99_2"`이면
> **무조건** `evaluateUnsold992(...)`를 반환한다 — `undefined`를 반환하는 경로가 없다.
> `evalHybrid`(`income-deduction-router.ts:303-330`)도 detail이 있으면 적격·부적격 무관하게
> `detailField`를 스프레드한다.
>
> ⇒ **type이 `reductions`에 실리기만 하면 detail은 반드시 생긴다.** 카드가 rose조차 없다는 것은
> **`resolveIncomeDeduction`이 §99의2를 아예 보지 못했다**는 뜻이다.

| 가설 | 내용 | 판정 |
|---|---|---|
| **H-2** ⭐⭐ | `reductions` 배열에 `unsold_99_2`가 담기지 않는다 (④ 변환·⑬ body spread·토글→form 반영 중 하나) | **최유력** — 위 사실과 유일하게 정합 |
| **H-6** ⭐ 🆕 | **선행 evaluator가 적격을 반환해 §99의2 평가가 스킵된다.** `resolveIncomeDeduction`(`income-deduction-router.ts:162-186`)은 `evalNew993 → evalNew99 → evalUnsold988 → evalHybrid` 순으로 돌다 **적격을 만나면 즉시 return**한다 | **유력** — 사용자가 다른 차감형 감면을 함께 켰다면 성립. 초판 누락 |
| ~~H-1~~ | PHD 환산 취득시 기준시가가 form에 안 흘러든다 | 🔻 **기각** — ④ 변환(`transfer-tax-api-reductions.ts:485-489`)에 PHD 자동계산 분기가 **실재**한다. 설령 참이어도 detail은 `MISSING_STD_PRICE` **부적격으로 담겨** rose 카드가 뜬다 → 현상과 모순 |
| ~~H-3~~ | `asset-kind-gate.ts`가 자산종류로 걸러낸다 | 🔻 **기각** — 호출처 전수 grep 결과 UI 3개 + `transfer-tax-validate-reductions.ts` + barrel뿐. **엔진 계산 경로에 없다** |
| **H-4** | IndexedDB 저장·복원에서 `unsold992Detail` 소실 | 잔존 — 계산 직후 화면 vs 이력 복원 화면 대조 |
| **H-5** | 결과뷰가 단건이 아닌 다른 뷰이고 그 경로에 배선이 없다 | 잔존 — V-6과 함께 확인 |

⚠️ **초판은 H-1을 ⭐최유력으로 지목했다. 근거가 약했다** — ④ 변환 코드를 읽지 않고 이미지2에
입력칸이 안 보인다는 것만으로 추정했다. 실제로는 PHD 자동계산 분기가 있다.

**부호 4케이스**(`new-99-3.ts:309-348` `calcSignedAllocation`) — D-4에서 문구로 풀어야 할 대상:

| signCase | 조건 | 결과 |
|---|---|---|
| `all_positive` | 분자 + / 분모 + | 정상 안분 (양도소득금액 상한 clamp) |
| `neg_pos` | 분자 − / 분모 + | 감면 0 ← **제보 케이스** |
| `pos_neg` | 분자 + / 분모 − | 전액 감면 |
| `all_negative` | 그 밖(둘 다 −, 분자 0, 분모 0) | 감면 0 |

---

## 4. 작업 범위

### 4-1. 대상 조문 (소득금액차감 = 5년 안분)

| 조문 | id | Result 타입 | echo 현황 |
|---|---|---|---|
| §99의3 | `new_99_3` | `New993Result` | ✅ 보유 (대조군) |
| §99 | `new_99` | `New99Result` | ❌ 없음 |
| §98의8 | `unsold_98_8` | `Unsold988Result` | ❌ 없음 |
| §98의7 | `unsold_98_7` | `UnsoldHybridResult` | ❌ 없음 |
| **§99의2** | `unsold_99_2` | `UnsoldHybridResult` | ❌ 없음 ← **제보** |
| §98의3 | `unsold_98_3` | `UnsoldHybridResult` | ❌ 없음 |
| §98의5 | `unsold_98_5` | `UnsoldHybridResult` | ❌ 없음 |
| §98의6 | `unsold_98_6` | `UnsoldHybridResult` | ❌ 없음 |

**범위 밖(5년 안분 아님)**: §98의2(`lthd_rate_special`) · §98(`flat_rate_20`) · §98의4(5년 구분 없는 10% 세액감면)
— `effectCategory` 실측으로 확인(`unsold-hybrid-p4.ts:106,185` · `unsold-hybrid-p5.ts:154`).

### 4-2. 손대지 않는 것

- **별지 제84호서식 부표2 등 신고서 양식 표**(`FilingFormTableHelpers.ts:705-725`) — 공식 서식
  재현이라 숫자만 넣는 것이 정본이다. 산식 주입 금지.
- 엔진 **계산 로직·산식** 일절 무변경. 추가하는 것은 echo 필드뿐(`echo-field-pattern`).

---

## 5. 실행 계획

> 원칙: 엔진 계산 무변경 · 공용 빌더 1개로 8조문 처리(조문별 분기 금지) · 4개 결과뷰 동시 반영.

### Phase 0 — 🔴 D-7 원인 규명 (**최우선 · 이것이 갈리면 이후 Phase 범위가 바뀐다**)

D-1~D-6은 "카드·행에 무엇을 쓸까"이지만 D-7은 "카드가 아예 없다"이다. **순서를 뒤집으면
안 보이는 화면의 문구를 다듬는 헛일이 된다.**

1. **사용자 실제 값으로 UI 전 구간 재현** — Playwright로 §99의2 토글 ON → 이미지2의 값 그대로
   입력(취득 121,191,049 PHD 환산 / 5년 112,969,780 / 양도 126,887,420) → 계산 →
   **Network request body에 `reductions[].type === "unsold_99_2"`와 `standardPrice*992` 3필드가
   실려 있는지** 확인.
   → verify: H-1~H-5 중 하나로 배타 확정. (memory `feedback_browser_verify_with_playwright`)
2. 확정된 원인을 수정 → verify: 상세 카드가 화면에 나타난다.
3. 제보 케이스(neg_pos)를 **API 경로를 태우는 anchor**로 승격.
   ⚠️ `calculateTransferTax` 직접 호출 anchor는 ④⑫⑬⑭를 건너뛰어 **구별력이 없다** — D-7을
   못 잡는다. route handler 또는 `callTransferTaxAPI` 진입점을 쓸 것.
4. **mutation probe 2종으로 안전망 실측** (memory `feedback_pre_change_safety_net_probe`)

   | ID | 무력화 대상 | 재는 것 |
   |---|---|---|
   | **P-1** | `INCOME_DEDUCTION_5YEAR_FORMULA`를 빈 값으로 | **D-1 표시** 경로의 안전망 |
   | **P-2** 🆕 | `evalHybrid`의 `detailField` 스프레드 제거 (= D-7 현상 인위 재현) | **D-7 세액·카드** 경로의 안전망 |

   → verify: 0건이면 그 경로에 안전망이 없다 → 해당 Phase에서 anchor 신설을 **필수**로 못박는다.
   ⚠️ 초판은 P-1만 뒀다. P-1은 D-7을 **못 잡는다** — 무력화 대상이 다른 층이다.

### Phase 1 — 엔진 echo 추가 (D-3)

`UnsoldHybridResult`(+ `New99Result` · `Unsold988Result`)에 optional echo 3필드 추가:
`standardPriceAtAcquisition?` · `standardPriceAt5Years?` · `standardPriceAtTransfer?`
그리고 `transferIncomeApplied?` — §99의3(`new-99-3.ts:118-123`)과 **같은 이름·같은 의미**로 맞춘다.

- `computeHybridEffect`(`unsold-hybrid.ts:207`)에서 이미 지역변수로 들고 있는 `stdAtAcq`·`stdAt5Y`·
  `stdAtTransfer`를 반환 객체에 그대로 실어 보낸다. **계산 경로 무변경**.
- → verify: Phase 0 anchor 통과 유지 + 새 필드가 route→UI까지 도달(⑫⑬⑭ 확인, `tax-field-add`).

### Phase 2 — 공용 산식 빌더 (D-1·D-2·D-4)

`buildNew993ReducibleFormula`를 **조문 무관 공용 빌더로 일반화**한다(§99의3 전용 함수를 없애지 않고
내부 공용 함수로 위임 — 기존 호출부 유지).

> 🔴 **초판 정정 — "공용 빌더 1개로 8조문, 조문별 분기 금지"는 §99에서 깨진다.**
> `new-99.ts:243-262` 실측: §99는 다른 7조문과 **산식 구조가 다르다**.
>
> | 축 | §99의3·하이브리드 | **§99** |
> |---|---|---|
> | 5년 내 | 전액 차감 (안분 없음) | `variant`(재개발)면 **5년 내에도 안분** |
> | 분자 | 5년시점 − 취득시 | 5년 내면 **양도시 − 취득시**, 5년 후면 5년시점 − 취득시 |
> | 분모 | 양도시 − 취득시 | `variant`면 **양도시 − 종전주택 취득시** ← **4번째 시점** |
> | echo 필요 수 | 3 | **4** (`previousHouseStdPriceAtAcquisition` — `new-99.ts:77`) |
>
> ⇒ 공용 빌더는 **분자·분모·라벨을 인자로 받는 형태**여야 한다(조문이 값을 정하고 빌더는
> 표기만 담당). 「조문별 분기 금지」는 **빌더 내부 if-체인 금지**로 좁혀 읽는다.

빌더가 처리할 분기:

| 상황 | 표시 |
|---|---|
| 5년 이내 양도 (소득금액차감형) | `양도소득금액 N 전액 차감 (취득 후 5년 이내 양도 — 조특법 §…)` |
| 정상 안분 `all_positive` | `양도소득금액 N ×` + `Frac`(분자·분모 각각 값·차액) + `= M` |
| **`neg_pos`** | 값을 **그대로 보이고** 결과 0 + 사유: 5년시점 기준시가가 취득시 이하라 분자가 음수 |
| `pos_neg` | 전액 감면 + 사유 |
| `all_negative` | 값 + 결과 0 + 사유 |
| echo 없음(구 저장 결과) | 현행 일반 문구로 graceful fallback |

- **D-4 핵심**: 감면 0이어도 `Frac`에 **실제 숫자를 넣어** 왜 0인지 보이게 한다. 현행 §99의3
  빌더는 `reducible <= 0`이면 값을 숨기고 서술만 하는데(`DetailedStatementFormulaBuilders.ts:244-246`),
  이는 요청("있든 없든 계산 과정을 표시")과 어긋나므로 **함께 고친다**.
- **D-2**: `isAggregate` 분기는 자산별 `perAsset` 산식으로 확장(`buildPerAssetWithFormula` 기존 패턴 사용).
- → verify: 8조문 × 부호 4케이스 렌더 테스트.

### Phase 3 — 결과뷰 배선·회귀 (D-5 판단 포함)

- `DetailedStatementHelpers.ts:483-487`의 `result.new993Detail` 단독 분기를 **소득금액차감 detail 탐색**으로 교체.
- 4개 결과뷰 전부 확인 — 단건 `TransferTaxResultView` · 다자산 `MultiTransferPropertyBreakdown` ·
  일괄 `BundledAllocationCard` · 일반건물. (memory `feedback_transfer_result_view_is_not_one` — **2회 재발 이력**)
- **D-5**(5년 내 세액감면 경로 과정 표시)는 Q-3 답변에 따라 포함/제외.
- → verify: `npx vitest run __tests__/tax-engine/transfer-tax/ __tests__/components/` + E2E(`E2E_PORT` 필수).

---

## 6. 미검증 항목 (V) — 착수 전 확인

| # | 항목 | 상태 |
|---|---|---|
| ~~V-1~~ | §99의2 상세 카드가 화면에 보이는가 | ✅ **해소 — 안 보인다**(사용자 확인). ⇒ D-7 신설, Phase 0로 승격 |
| ~~V-2~~ | 3시점 기준시가 입력 위젯 존재 여부 | ✅ **해소 — 있다**(이미지2). 실제 값 §1-3에 기록. 단 취득시는 **PHD 환산 자동계산값** |
| ~~V-3~~ | §99·§98의8이 3시점을 지역변수로 들고 있는가 | ✅ **해소 — 있다**. §99 `new-99.ts:222-225` · §98의8 `unsold-98-8.ts:277-279`. **단 §99는 4번째 시점 `stdAtPrev`(:225)까지 필요** → Phase 2 정정 반영 |
| **V-4** | 저장된 과거 계산 이력(IndexedDB)에는 새 echo가 없다 — fallback 경로가 실제로 동작하는가 | ⏳ 이력 복원 E2E |
| **V-5** | D-7이 §99의2 **단독 결함**인가, 하이브리드 8조문 공통인가 | ⏳ 원인 확정 후 형제 조문 전수 대조 (memory `feedback_enumerate_all_write_sites_before_fixing`) |
| **V-6** | 사용자 화면의 결과뷰가 4종 중 **어느 것**인가(단건/다자산/일괄/일반건물) | ⏳ D-7 원인이 뷰별로 갈릴 수 있다(H-5) |
| **V-7** 🆕 | 사용자가 §99의2 **외의 차감형 감면을 함께 켰는가** — H-6 성립 여부를 가른다 | ⏳ 입력 화면 또는 request body |
| **V-8** 🆕 | D-7이 `all_positive` 케이스에서 **실제로 세액을 과대 산출**하는가 | ⏳ 원인 확정 후 동일 입력에 기준시가만 바꿔 대조 (memory `feedback_numeric_impact_verify_before_bug_claim`) |

---

## 7. 사용자 결정 필요 (Q)

| # | 질문 | 기본안(무응답 시) |
|---|---|---|
| **Q-1** | 3단계 명세 행에 값 인라인을 넣으면 하단 상세 카드와 **내용이 중복**된다. 그대로 둘지, 상세 카드를 요약할지 | **중복 허용** — 명세는 흐름, 카드는 조문별 근거로 역할이 다름 |
| **Q-2** | 범위를 소득금액차감 **8조문 전체**로 할지, §99의2만 할지 | **8조문 전체** — 공용 빌더라 추가비용이 거의 없고, 조문별로 다르면 그 자체가 결함 |
| **Q-3** | **D-5**(5년 내 세액감면 경로: 산출세액 × 감면율 = 감면세액 대입 과정)도 포함할지 | **포함** — "감면세액이 있든 없든"이라는 요청 취지에 부합 |
| **Q-4** | **D-6**(세액감면방식 §69·§77 계열 "세액감면대상금액" 행의 산출 과정)까지 확장할지 | **이번 범위 밖** — 조문군이 다르고 §127⑦ 중복배제까지 얽혀 별건이 적절 |
| **Q-5** 🆕 | **D-7(세액 결함)을 표시 보강(D-1~D-6·D-8)과 같은 PR로 묶을지, 분리할지** | ✅ **결정: 분리** (사용자 2026-08-25). 근거 — 회귀 표면이 다르다. D-7은 세액이 움직여 전 세목 회귀가 필요하고, 표시 보강은 렌더 테스트로 족하다. 묶으면 회귀 발생 시 원인 분리가 어렵다 ⇒ **PR-1 = D-7 세액 수정**, **PR-2 = D-1~D-6·D-8 표시 보강** |
| **Q-6** 🆕 | **D-8**(적용 불가일 때도 계산 과정 표시)을 포함할지 | **포함** — 요청 문언에 직접 걸린다(§3 D-8 주석) |

---

## 8. 완료 기준

- [ ] **(D-7) §99의2 상세 카드가 화면에 나타난다** — 이것이 안 되면 나머지는 의미가 없다
- [ ] (D-8) 적용 불가일 때도 계산 과정이 표시된다
- [ ] 제보 케이스에서 3단계 "소득금액 감면대상" 행에 **실제 기준시가 3개 값과 결과 0, 그리고 0인 사유**가 표시된다
- [ ] 8조문 × 부호 4케이스 anchor 통과
- [ ] 4개 결과뷰 전부 반영 확인(단건·다자산·일괄·일반건물)
- [ ] 엔진 계산 결과 무변동 — 기존 transfer 테스트 회귀 0건
- [ ] `npm run check:pre-pr` 통과
- [ ] 브라우저 실제 확인(Playwright)

---

## 9. 준수할 기존 정책

- `echo-field-pattern` — 계산 무변경, optional echo만 추가
- `formula-display-builder` — 한국어 풀어쓰기 + 값 인라인 + `Frac`
- `feedback_transfer_result_view_is_not_one` — 결과뷰는 4개 (2회 재발)
- `feedback_pre_change_safety_net_probe` — 바꾸기 전 안전망 실측
- `feedback_result_view_korean_formula` · `feedback_no_won_suffix` · `feedback_no_internal_id_in_result`
- 800줄 정책 — `DetailedStatementFormulaBuilders.ts` 증가분 확인

---

## 9-A. 🔬 Phase 0 실측 결과 (2026-08-25) — **입력·계산·응답·렌더 전 경로 무결**

사용자 실제 입력값(§1-3)으로 각 층을 **실제로 태워** 확인했다. 결과: **어느 층도 끊기지 않는다.**

| 층 | 검증 방법 | 결과 |
|---|---|---|
| ④ API 변환 | `toEngineReductions([§99의2 form])` 직접 호출 | ✅ **PHD 환산이 121,191,049 산출** — 사용자 화면 값과 **일치**. 3시점 전부 실림 |
| ⑬ fetch body | `callTransferTaxAPI` + fetch stub 캡처 | ✅ `reductions[0].type === "unsold_99_2"` + 3시점 온전 |
| ⑫ Zod | `propertySchema.parse(body)` | ✅ strip 없음 — 필드 전부 생존 |
| ⑭ route 매핑 | `buildTransferEngineInput(parsed, …)` | ✅ `contractDate992` Date 변환만 되고 나머지 그대로 |
| 엔진 | `calculateTransferTax` | ✅ `unsold992Detail` 생성 · `formulaSteps`에 **사용자 실제 값 인라인** · steps에 「§99의2 신축주택등 과세특례 — 양도소득금액 차감」 |
| 응답 | `route.ts:515` 코드 | ✅ `{ data: { mode, result } }` — result **필터링 없음** |
| 렌더 | RTL로 `ReductionDetailCards` 렌더 | ✅ **emerald 카드 출력**: 「§99의2 — 신축주택등 과세특례 (신축·미분양·1세대1주택)」 · 구별력 확인(detail 없으면 DOM 길이 0) |

### 가설 판정 갱신

| 가설 | 판정 |
|---|---|
| ~~H-1~~ PHD 미전달 | 🔻 **기각(실증)** — ④가 121,191,049를 정확히 산출 |
| ~~H-2~~ reductions에 type 부재 | 🔻 **기각(실증)** — ⑬⑫⑭ 전 층에서 생존. 또한 `UnifiedReductionPanel.tsx:738`은 배열에 항목이 있어야 폼을 렌더하므로 **이미지3에 폼이 보이는 것 자체가 존재 증거** |
| ~~H-3~~ asset-kind-gate | 🔻 **기각** — 엔진 경로에 호출 없음 |
| **H-6** 선행 evaluator 조기 return | ⭐ **최유력 잔존** — §99의2 **외에 다른 차감형 감면**(§99의3·§99·§98의8)을 함께 켰다면 `resolveIncomeDeduction`(`income-deduction-router.ts:162-186`)이 §99의2에 **도달하지 못한다** |
| **H-4** 이력(IndexedDB) 복원본 | 잔존 |
| **H-5** 결과뷰 종류 | 잔존 |
| **H-8** 🆕 **관측 문제** | ⭐ **유력 신설** — 카드는 결과뷰 **최하단**(`TransferTaxResultView.tsx:621`, 「비로그인 안내」 바로 위)에 있다. 이미지1은 **3단계 섹션**만 캡처된 것이라 하단을 못 봤을 수 있다 |

⇒ **코드에서 재현되지 않는다.** H-6·H-8을 가르려면 사용자 확인이 필요하다(V-7·V-9).

> ⚠️ **D-7을 「결함 확정」으로 다루면 안 된다.** 현 시점 근거는 사용자 관측 1건뿐이고, 코드 실측은
> 전부 반대 방향을 가리킨다. (memory `feedback_numeric_impact_verify_before_bug_claim`)

---

## 9-B. ✅ D-7 소멸 + 요청 재정의 (2026-08-25 사용자 확인)

**사용자 확인: 카드가 있다.** 화면 캡처가 §9-A의 RTL 실증과 **정확히 일치**한다 —
「§99의2 — 신축주택등 과세특례」 + 「취득 후 5년 경과 양도」 배지 + Frac 분수 산식 + 차감액 0.

⇒ **D-7 소멸.** 원인은 **H-8(관측)** 이었다 — 이미지1은 3단계 섹션만 캡처된 것이고 카드는 하단에 있었다.
H-6·H-4·H-5도 함께 소멸(현상 자체가 없다). §0의 「세액 결함」 정정도 **철회**한다 —
detail이 도달하므로 차감도 정상 작동한다. **검증 깊이 L3 → L2 복귀**, Q-5(PR 분리)는 **무의미해져 취소**.

> 🔴 **교훈**: 「안 보인다」는 사용자 관측을 **결함으로 승격하기 전에 화면 위치부터 확인**해야 했다.
> 코드 실측 6층이 전부 무결을 가리키는데도 가설을 늘렸다. 계획서가 D-7을 **최우선 Phase로 올려
> 두 사이클을 소비**했다. (memory `feedback_numeric_impact_verify_before_bug_claim` 적용 대상이었다)

### 🆕 재정의된 요청 — "다른 감면도 표시해줘"

§99의2 카드는 **이미 정본**이다. 사용자 요청은 **다른 감면 조문도 같은 수준으로** 올리는 것이다.

**정본 기준 2형태** (둘 다 이미 저장소에 있다):

| 형태 | 예 | 모양 |
|---|---|---|
| A. formulaSteps 값 인라인 | §99의2 | `양도소득금액 11,210,000 × (5년시점 112,969,780 − 취득시 121,191,049) ÷ (…)` |
| B. 라벨 산식 + 값 대입 2줄 | §77의2 `ReplacementLand77_2DetailCard.tsx:68-72` | `④ 감면세액 = 산출세액 × 감면대상소득금액/과세표준`<br>`1,306,500 × 8,710,000/8,710,000 = …` |

### 감면 조문별 산식 표시 갭 (전수 실측)

| 조문 | 카드 | 현행 | 판정 |
|---|---|---|---|
| §99의2·§98의7·§98의3·§98의5·§98의6·§98의2·§98의4·§98 | `IncomeDeductionDetailCard` | formulaSteps 값 인라인 | ✅ 정본 (단 **적격 시만** — D-8) |
| §99 · §98의8 | 〃 | 〃 | ✅ 정본 |
| §99의3 | `TransferReductionRows` | Frac + 값 | ✅ |
| §77 | `PublicExpropriationDetailCard` | Frac + 값 | ✅ |
| §77의2 | `ReplacementLand77_2DetailCard:68-72` | 라벨 + 값 2줄 | ✅ **정본 B** |
| §77의3 | `GbDesignatedLand77_3DetailCard:74-78` | 라벨 + 값 2줄 | ✅ |
| §69 자경농지 | `SelfFarmingReductionDetailCard:96-115` | Frac 라벨 + 비율값 + 「전체 양도소득금액 X × 감면비율 Y」 + 결과 | ✅ |
| **🔴 §97·§97의2·§97의5** | `Rental97DetailCard:129-172` | **산식 없음** — 「적용 감면율 50%」·「감면세액 N」 **값 나열만** | **D-9** |
| **🔴 §97의3·§97의4** | `Rental97DetailCard:75-127` | **산식 없음** — 「특례 공제율 70%」·「유효 임대기간 8년」 값 나열만. **공제액 자체가 없다** | **D-9** |
| **🔴 장기임대(구 방식)** | `RentalReductionDetailCard:136-150` | 값 나열만(법령 버전·의무/실제 임대기간·특례율) | **D-10** |
| **🟠 신축주택(구 방식)** | `NewHousingReductionDetailCard:131-143` | 산식 **라벨만** — 「감면대상 양도차익 = 전체 양도차익 × 5년 안분 비율」에 **값 미대입** | **D-11** |
| §99의4 · §98의9 · 보유감면주택 | `New994`·`Unsold989`·`SpecialHouseExclusion` | 주택수 제외형 | ⚪ 해당없음(산식 불요) |

> ⚠️ `Rental97DetailCard:10` 주석은 「⑦ 결과 카드 **산식**」이라 적혀 있고 `:152`에도
> 「{/* 산식 표시 — 한국어 풀어쓰기 */}」가 있으나, **실제 렌더는 결과값 나열**이다.
> 주석↔구현 드리프트 (memory `feedback_engine_comment_vs_impl_drift`).

### 재정의된 작업 범위

| PR | 내용 |
|---|---|
| **PR-1** | **D-9** §97 계열 5조문 산식 신설(세액감면형 + LTHD 특례형) · **D-10** 구 장기임대 · **D-11** 구 신축주택 값 대입 |
| **PR-2** | **D-8** 적용 불가 시에도 계산 과정 표시 (전 조문 공통) |
| **PR-3** | **D-1~D-6** 3단계 상세명세 「소득금액 감면대상」 행 값 인라인 (원 요청) |

---

## 9-C. ✅ PR-1 완료 (2026-08-25) — D-9·D-10·D-11

### 구현

| 결함 | 조문 | 표시 (라벨 줄 + 값 줄) |
|---|---|---|
| **D-9** | §97·§97의2·§97의5 | `감면세액 = 산출세액 × 임대기간 분 비율 × 감면율`<br>`10,000,000 × 80% × 50% = 4,000,000` (비율 1이면 항 생략) |
| **D-9** | §97의3 | `장기보유특별공제 = 임대기간 분 양도차익 × 특례 공제율 + 비임대 분 × 일반 공제율`<br>`60,000,000 × 70% + 40,000,000 × 24% = 51,600,000` |
| **D-9** | §97의4 | `양도차익 × (일반 공제율 + 추가 공제율)`<br>`100,000,000 × (24% + 10%) = 34,000,000` |
| **D-10** | 장기임대 구 방식 | `감면세액 = 산출세액 × 감면율` + 값 |
| **D-11** | 신축주택 구 방식 | `전체 양도차익 × 감면대상 보유일수 ÷ 전체 보유일수` + 값<br>(종전 「5년 안분 비율」 문구보다 **실제 계산에 충실** — 엔진은 일수 안분이다) |

### 엔진 변경 — echo만, 계산식 무변경

- `RentalLthdEffect`(types.ts): `baseLthdRate`·`gainApplied`·`rentalGainApplied`·`nonRentalGainApplied`·`deductionApplied` (전부 optional)
- `transfer-tax-lthd.ts`: 공제액 산출 **직후** 그 값들을 그대로 실어 보낸다
- `NewHousingReductionResult`: `totalCapitalGainApplied`·`reductionDaysApplied`·`totalDaysApplied`
- 카드 prop: `Rental97DetailCard`·`RentalReductionDetailCard`에 `calculatedTax` **필수 prop** 추가(누락이 컴파일 에러로 드러나게)

### 안전망 — 착수 시 0건 → anchor 11건

착수 전 실측: `Rental97DetailCard`를 참조하는 테스트가 **전무**했다(P-1 예측 적중).

⭐ **mutation이 사각지대를 드러냈다.** 카드 렌더 anchor(10건)는 detail을 fixture로 직접 주입하므로
**엔진의 echo 주입을 지키지 못했다** — `transfer-tax-lthd.ts`에서 `baseLthdRate`를 제거해도
카드 테스트는 **전건 통과**했다. (memory `feedback_anchor_observes_wrong_stage`)
⇒ 엔진 단계 anchor 1건 추가 후 같은 mutation이 **정확히 그 anchor만** 실패시킴을 재확인.

| anchor | 위치 | mutation 검증 |
|---|---|---|
| 카드 렌더 10건 | `__tests__/components/transfer-reduction-formula-cards.test.tsx` | `calculatedTax` 배선 훼손 → **3건 실패** ✅ |
| 엔진 echo 1건 | `__tests__/tax-engine/transfer-tax/rental-97-3-integration.test.ts` | `baseLthdRate` 제거 → **1건 실패** ✅ |

구 이력(echo 없음) graceful fallback도 각각 anchor로 고정.

### 검증

- `npx tsc --noEmit` 0건
- `npm run test:transfer` — **635파일 6964건 전건 통과** (세액 무변동 실증)
- `npm run lint` — 0 errors, warning **311 → 309**(감소)


---

## 10. 자가검토 이력 (STEP 1~4 · 2026-08-25)

**verdict: `blocked`** — Critical 3건이 해소됐으나 **미해소 V-n 5건(V-4~V-8)이 설계를 가른다**.
특히 **V-7·V-8 없이는 D-7 원인과 세액 영향이 확정되지 않는다** ⇒ Phase 1 이후 착수 금지.
Phase 0은 원인 규명 자체이므로 진행 가능.

| # | 카테고리 | 우선순위 | 위치 | 문제 | 정정 |
|---|---|---|---|---|---|
| 1 | 오류 | **Critical** | 초판 §4-2 | D-7을 표시 결함으로 분류. 실제로는 `transfer-tax.ts:568-569`에서 차감이 `appliedId` 의존이라 **세액 결함** | §0 초판 판정 정정 · L2→L3 |
| 2 | 누락 | **Critical** | 초판 §3 H표 | 선행 evaluator 조기 return 가설 부재(`income-deduction-router.ts:162-186`) | **H-6** 신설 |
| 3 | 오류 | **Critical** | 초판 Phase 2 | 「공용 빌더 1개·조문별 분기 금지」가 §99에서 성립 안 함(`new-99.ts:243-262` — 분모에 **4번째 시점**) | 빌더를 분자·분모 주입형으로 재설계 · echo §99만 4필드 |
| 4 | 오류 | High | 초판 §3 H-1 | ④ 변환에 PHD 자동계산 분기가 **실재**(`transfer-tax-api-reductions.ts:485-489`)하는데 미확인 상태로 ⭐최유력 지정 | H-1 **기각** · H-2로 최유력 이동 |
| 5 | 오류 | High | 초판 §3 H-3 | `asset-kind-gate`는 UI·validate 전용 — 엔진 계산 경로에 없음(호출처 전수) | H-3 **기각** |
| 6 | 누락 | High | 초판 §3 D표 | 적용 불가 시 `formulaSteps` 미렌더(`IncomeDeductionDetailCard.tsx:61-78`) — 요청 문언에 직접 해당 | **D-8** 신설 · Q-6 |
| 7 | 누락 | High | 초판 Phase 0-2 | mutation probe가 D-1 경로만 잼 — D-7을 못 잡음 | **P-2** 신설 |
| 8 | 개선 | Medium | 초판 §5 | 세액 결함과 표시 보강의 회귀 표면이 다름 | **Q-5**(PR 분리) 신설 |
| 9 | 오류 | Low | 초판 §2 | 인용 `:483-487`은 주석 2줄 포함 — 실제 분기는 `:485-487` | 본문 유지(코드 블록이 주석 포함) |

**성과 지표**: 판정 뒤집힘 **3건**(#1 결함 성격 · #3 빌더 전제 · #4·#5 가설 기각) · 누락 발견 3건 ·
V-3 해소 · V-7·V-8 신설. 안전망 실증은 Phase 0에서 수행(P-1·P-2).
