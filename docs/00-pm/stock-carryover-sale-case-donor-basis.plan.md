# 주식 이월과세(§97의2①) × 매매사례가액 — 증여자 기준 나목 경로 + §163⑨ 증여·상속 추계 차단

> 작성 2026-10-02 · 세목: 주식 양도소득세 · 상태: **✅ Do 완료 (2026-10-03 — Q-1 β · Q-2 상속 포함 · Q-3·Q-4 추천안) — §10 구현 결과**
> 출발점: `docs/00-pm/stock-sale-case-transfer-priority-and-deduction.plan.md` §11 **X-2**
> 선행: `docs/02-design/features/stock-carryover-97-2-necessary-expense.plan.md` (Phase 3 = 환산 5분기 증여자 기준, 2026-08-11 완료)

---

## 0. 결론 요약

X-2는 「이월과세 + 매매사례」 한 칸의 문제가 아니었다. 실측해 보니 **두 축이 겹쳐 있다**.

| # | 축 | 판정 | 실측 (§2) |
|---|---|---|---|
| **F-1** | 시나리오 A(§97의2① 적용) — 증여자 취득가액을 **매매사례가액**(§97①1호 나목)으로 정하는 경로가 없다 | 🔴 결함 | A의 취득가액이 **수증일 매매사례 1억5천만원** 그대로이고, 개산공제도 **수증연도** 기준시가로 30만원이다(증여자 기준이면 5만원) |
| **F-2** | 시나리오 B·단순 증여·상속 — 수증자 측에서 **추계 모드(매매사례·환산)를 고를 수 있다** | 🔴 결함 (§163⑨ 위배) | 단순 증여 + 매매사례 → 개산공제 **30만원**이 붙는다. 증여 자산 취득가액은 증여일 평가액이 «실지거래가액으로 의제»되므로 개산공제 대상이 아니다. **PR #1930이 매매사례 개산공제를 켜면서 드러난 면**이다(그 전에는 우연히 0원) |
| F-3 | 구조 — 주식은 Step 2의 **수증자** 취득가액 모드가 시나리오 A의 **증여자** 측 나목 방식을 겸한다(Phase 3) | 🟠 설계 결함 | F-2를 막으면 A의 환산 입력 경로가 함께 사라진다 → **F-1·F-2·F-3을 한 번에** 옮겨야 한다 |

부동산 형제 경로는 이미 정답 구조다 — 수증자 측은 §163⑨로 실거래가 모드를 **강제**(`lib/calc/transfer-tax-validate-gift-163-9.ts`)하고, 증여자 측 산정 방식은 이월과세 블록이 **따로** 받는다(`transfer-tax-carryover.ts:174-193` `ct.useEstimatedAcquisition`). **주식을 그 구조에 맞추는 것**이 이 계획의 추천안(β)이다.

---

## 1. 법령 근거 (KoreanLaw MCP, 2026-10-02 현행본)

| 조문 | 원문 발췌 | 이 계획에서의 의미 |
|---|---|---|
| 소득세법 §97의2① 각 호 외 | 「…증여받은 … 제3호에 따른 자산 … 의 양도차익을 계산할 때 양도가액에서 공제할 필요경비는 **제97조제2항에 따르되**, 다음 각 호의 기준을 적용한다」 | 필요경비 틀은 §97②(개산공제 포함) 그대로 |
| 같은 항 1호 | 「취득가액은 거주자의 배우자 또는 직계존비속이 **해당 자산을 취득할 당시의 제97조제1항제1호에 따른 금액**으로 한다」 | §97①1호 = 가목(실가) **+ 나목(매매사례·감정·환산 순차)**. 증여자 측 매매사례가액이 정식 경로다 → **F-1** |
| 소득세법 §97①1호 | 「다만, **가목의 실지거래가액을 확인할 수 없는 경우에 한정하여** 나목의 금액을 적용한다. … 나. 대통령령으로 정하는 매매사례가액, 감정가액 또는 환산취득가액을 **순차적으로** 적용한 금액」 | 나목은 실가 확인 불가가 전제 |
| 소득세법 §97②2호 | 본문 「제1항제1호나목 … 의 금액에 자산별로 대통령령으로 정하는 금액을 더한 금액」 / 단서 「제1항제1호나목에 따라 취득가액을 **환산취득가액으로 하는 경우로서** …」 | A가 나목(매매사례)이면 개산공제 가산. 실비 swap 단서는 **환산 한정** |
| 소득세법 시행령 §163⑥4호 | 「제1호 내지 제3호외의 자산 　**취득당시의 기준시가**×1／100」 | 이월과세 A의 「취득 당시」 = **증여자 취득 당시** — Phase 3 환산 경로가 이미 같은 독법(`acquisitionStdPriceOverridePerShare`가 분자·개산공제 base를 함께 바꾼다) |
| 소득세법 시행령 §163⑨ | 「상속 또는 증여 … 받은 자산에 대하여 법 제97조제1항제1호**가목**을 적용할 때에는 상속개시일 또는 증여일 현재 「상속세 및 증여세법」 제60조부터 제66조까지의 규정에 따라 평가한 가액 … 을 **취득당시의 실지거래가액으로 본다**」 | 수증자·상속인 측 취득가액은 **가목(의제 실가)** — 나목(추계)으로 갈 자리가 없다 → **F-2** |
| 소득세법 시행령 §176의2③1호 | 「**양도일 또는 취득일** 전후 각 3개월 이내에 해당 자산(주권상장법인의 주식등은 제외한다)과 동일성 또는 유사성이 있는 자산의 매매사례가 있는 경우 그 가액」 | A의 「취득일」 = 증여자 취득일 → ±3개월 경고의 기준일도 증여자 취득일 |
| 소득세법 시행령 §176의2④ | 「의제취득일 전에 취득한 자산(**상속 또는 증여받은 자산을 포함**한다)에 대하여 제3항제1호부터 제3호까지의 규정을 적용할 때에 …」 | 의제취득일 이전 상속·증여는 추계가 남는다 → F-2 차단의 **예외** |
| **국심2007중1761** (조세심판원, 2007.9.19., 기각) | 「상속받은 자산에 대해서는 취득당시의 실지거래가액으로 보는 가액을 소득세법 시행령 제163조 제9항에서 **직접 규정**하고 있으므로 … 그 취득 당시의 실지거래가액을 확인할 수 없는 경우에 **해당하지 아니하여**, … 취득가액을 환산가액에 의하여 산정하여야 한다는 청구인의 주장은 받아 들이기 어렵다」 | F-2의 직접 근거(상속 사례). 증여도 §163⑨ 같은 문장 안에 있다 |

> ⚠️ 국심2007중1761은 2007년 결정이다. §163⑨의 「실지거래가액으로 본다」 구조는 현행본(2026-10-01 시행)에서 확인했으나 **2007년 시행본 원문은 아직 대조하지 않았다** → V-5.

---

## 2. 현행 실측

### 2.1 probe (엔진 직접 호출, 2026-10-02)

공통: 비상장 100주 · 양도 2,000,000/주(2억) · 수증일 2025-03-01 · 양도 2025-12-01 · 증여자 취득 2015-06-01 · 배우자 ·
수증측 매매사례 1,500,000/주(2025-02-15) · 수증연도 NI=NA=300,000 · `donorAcquisitionStdPrice` 50,000

| 케이스 | ②3호 결과 | 취득가액 | 개산공제 | 필요경비 | 산출세액 | ②3호 비교 (A / B) |
|---|---|---|---|---|---|---|
| 이월과세 + **매매사례** | excluded | 150,000,000 | **300,000** | 300,000 | 14,160,000 | 9,440,000 / 14,160,000 |
| 이월과세 + 실가(평가액 1,500,000) | excluded | 150,000,000 | — | 0 | 14,250,000 | 9,500,000 / 14,250,000 |
| **단순 증여** + 매매사례 | — | 150,000,000 | **300,000** | 300,000 | 14,160,000 | — |

읽는 법:
- 이월과세 A의 취득가액이 **B와 같은 1억5천만원**이다 — 증여자 측 값이 한 번도 들어가지 않았다. A가 B보다 싼 이유는 **세율 소급(§104②2호)뿐**이다(F-1).
- 매매사례 행 B의 개산공제 30만원 · 단순 증여 30만원 → 실가 행(0원)과의 차이 90,000원이 **§163⑨ 위배분**이다(F-2).

### 2.2 코드 지점

| 위치 | 현행 |
|---|---|
| `lib/tax-engine/stock-transfer/stock-carryover.ts:259-283` | A ①1호 가목 — `donorAcquisitionPrice`가 있으면 `actual`로 승계 ✅ |
| 같은 파일 `:296-314` | A ①1호 나목 — **환산 입력만** 증여자 값으로 치환(`acquisitionDatePriceAvg1Month`·`acquisitionStdPriceOverridePerShare`). `acquisitionMode`는 **수증자가 고른 값 그대로** → `sale_case`면 수증자 매매사례가 흐른다 (F-1) |
| `lib/tax-engine/stock-transfer/stock-acquisition-basis.ts` `sale_case` 분기 | `acquisitionStdPriceOverridePerShare`를 **읽지 않는다** — PR #1930에서 V-5로 의도 보류 |
| `lib/tax-engine/stock-transfer/stock-transfer-pr2-detail.ts` | ±3개월 기준일 = `input.acquisitionDate`(수증일). A에서는 증여자 취득일이어야 한다 |
| `stock-carryover.ts:198-232` `buildStockScenarioB` | B는 `acquisitionMode`를 **그대로 둔다** → 수증자 추계 모드가 B에 남는다 (F-2) |
| `app/calc/stock-transfer-tax/steps/Step2.tsx:249-270` 취득가액 라디오(`name="acquisitionMode"` :251) | 취득원인과 무관하게 3종(실가·환산·매매사례) 모두 열림 — §163⑨ 게이트 없음 |
| `components/calc/stock-transfer/AcquisitionInfoBlock.tsx:227~` 이월과세 카드(증여자 칸 :295·:305) | 증여자 입력은 `donorAcquisitionPrice`(가목)·`donorAcquisitionStdPrice`(나목 환산 분자)뿐. **산정 방식 선택이 없다** |
| 대조군 `lib/calc/transfer-tax-validate-gift-163-9.ts:41-53` | 부동산: 1985 이후 **증여** + 추계(환산·감정·매매사례) → ⑧ 차단 + 복원 마이그레이션(`calc-wizard-asset-migrate.ts:578-581`) |

---

## 3. 사용자 결정 필요 (Q)

### Q-1. 구조 — ✅ **β 확정 (2026-10-03)**

| 안 | 내용 | 장단 |
|---|---|---|
| **β (추천)** | 부동산 형제 구조. ① 수증자(B) 측은 증여일 평가액 = **실가 모드 강제**(§163⑨). ② 이월과세 카드에 **「증여자 취득가액 산정 방식」**(실지거래가액 / 매매사례가액 / 환산취득가액)을 두고 A는 그것만 본다 | 법령 축과 화면 축이 1:1. F-1·F-2·F-3 동시 해소. Phase 3 환산 경로를 증여자 카드로 **옮기는 작업**이 포함되어 규모가 크다 |
| α | Phase 3 구조 유지 — 수증자 `acquisitionMode`가 A의 나목 방식을 계속 겸하고, 증여자 매매사례 필드만 추가 | 작다. 그러나 그 모드에서 **B의 증여일 평가액을 받을 칸이 없어** B가 계속 추계로 계산된다(F-2 잔존). §163⑨ 차단과 양립하지 않는다 |

### Q-2. §163⑨ 차단 범위에 **상속**을 넣는가 — ✅ **넣는다 (2026-10-03)**

- 국심2007중1761은 **상속** 사례 그 자체다. §163⑨도 상속·증여를 한 문장에 둔다.
- 부동산 형제(`giftEstimatedModeBlocked`)는 `gift`만 막는다 — 부동산 상속은 상가(`validateCommercialInheritanceAsset`)·§164 등 별도 경로가 있어서다. 주식에는 그런 별도 경로가 없다(`AcquisitionInfoBlock` 상속 분기는 피상속인 취득일만 받음 — V-6).
- 예외: 의제취득일 이전 상속·증여(§176의2④).

### Q-3. 증여자 매매사례의 개산공제 base 입력 — ✅ **1주당 직접 입력(`donorAcquisitionStdPrice` 재사용) 확정**

- Phase 3 환산이 이미 같은 칸을 «증여자 취득 당시 1주당 기준시가»로 받고 `acquisitionStdPriceOverridePerShare`로 보충평가를 우회한다. 같은 의미의 값을 두 칸으로 받을 이유가 없다.
- 대안: 증여자 취득연도 순손익·순자산(§165④)을 따로 받기 — 10년 전 결산 자료를 사용자가 다시 넣어야 하고, 칸이 4개 늘어난다.

### Q-4. §163⑨ 차단을 어디서 거는가 — ✅ **⑧ + ⑫ + 복원 마이그레이션 (엔진은 그대로) 확정**

- 부동산 형제와 같은 층위. 주식은 ⑧↔⑫를 `stock-transfer-required-inputs.ts` 공용 술어로 맞추는 규약이 있다.
- 엔진까지 막으면(추계 모드를 무시) API 직접 호출 결과가 조용히 바뀐다 — ⑫ 400이 더 명시적이다.

---

## 4. 설계 (β 기준)

### 4.1 새 입력 — 증여자 취득가액 산정 방식

| 필드 | 타입 | 의미 |
|---|---|---|
| `donorAcquisitionMethod` | `"actual" \| "sale_case" \| "estimated"` | §97①1호 가목 / 나목(매매사례) / 나목(환산). 감정가액은 주식 제외(영 §176의2③2호 괄호) |
| `donorAcquisitionMarketSamplePrice` | number (1주당) | 증여자 취득일 전후 3개월 매매사례가액 |
| `donorAcquisitionMarketSampleDate` | Date | ±3개월 경고용 |
| (기존) `donorAcquisitionPrice` | | `actual`일 때 |
| (기존) `donorAcquisitionStdPrice` | | `sale_case`의 개산공제 base · `estimated`의 환산 분자 — **두 방식 모두 필수** |

**3중 패턴 default**(stale 데이터·API 직접 호출 하위 호환 — `feedback_flipping_enum_default_rewrites_absent_records`):
`donorAcquisitionMethod` 부재 시 → `donorAcquisitionPrice` 있음 ⇒ `"actual"` · 없음 ⇒ 종전 동작(수증자 `acquisitionMode`). 이 도출은 **엔진·④·⑧ 세 곳이 같은 leaf**를 쓴다.

> ⚠️ 매매사례 거래상대(counterparty)는 받지 않는다 — 수증자 측에서도 메타 경고용일 뿐이고(§98①), 이번 결함과 무관하다. 필요하면 별건.

### 4.2 엔진 — 시나리오 A (`buildStockScenarioABase`)

| method | A 입력 치환 |
|---|---|
| `actual` | 현행 그대로(가목 승계) |
| `sale_case` | `acquisitionMode: "sale_case"` · `acquisitionMarketSamplePrice = donor 사례가` · `acquisitionMarketSampleDate = donor 사례일` · `acquisitionStdPriceOverridePerShare = donorStd` · `expenseMode: "estimated"` |
| `estimated` | `acquisitionMode: "estimated"` + 현행 Phase 3 치환(`acquisitionDatePriceAvg1Month`·override) |

동반 변경:
- `stock-acquisition-basis.ts` `sale_case` 분기가 `acquisitionStdPriceOverridePerShare`를 읽는다(override가 있으면 보충평가 대신 그 값). PR #1930 V-5 보류 해제.
- `stock-transfer-pr2-detail.ts` ±3개월 기준일: `carryoverOutcome === "applied"`면 `donorAcquisitionDate`.
- §97②2호 단서 swap — A `sale_case`는 `usedEstimatedAcquisition` 미설정이라 구조적으로 비대상(현행 그대로). 증여자 자본적지출(①2호)은 `actualExpenses`에 더해지는데 `sale_case`는 STEP 4에서 실비를 쓰지 않으므로 **①2호가 사라진다** → ⚠️ **V-8**: §97의2①2호(증여자 자본적지출 «포함»)와 §97②2호 본문(나목이면 개산공제만)의 관계를 확인해야 한다. 환산 경로는 단서 비교의 나목으로만 쓰인다(선행 계획서 `:808-817`).

### 4.3 엔진 — 시나리오 B (`buildStockScenarioB`)

- `acquisitionMode: "actual"`로 되돌리고 매매사례·환산 입력을 비운다 — B는 §163⑨ 증여일 평가액(`perShareAcquisitionPrice` 또는 합계)이다.
- `expenseMode: "actual"` — 실비 필요경비.
- β에서는 UI가 carryover_gift에 실가 모드만 열어 두므로 이 치환은 **API 직접 호출·stale 데이터 방어선**이다.

### 4.4 §163⑨ 게이트 (F-2)

공용 술어 1개 — `lib/calc/stock-transfer-required-inputs.ts`에 `isGiftLikeEstimationBlocked(cause, acquisitionDate, acquisitionMode)`:
`cause ∈ {gift, carryover_gift, inheritance(Q-2)}` ∧ `acquisitionDate ≥ 의제취득일(V-1)` ∧ `acquisitionMode ∈ {estimated, sale_case}`

| 층 | 처리 |
|---|---|
| ⑤ UI | Step 2 라디오: 해당 원인이면 「환산취득가」·「매매사례가액」 `disabled` + 안내(「증여·상속받은 주식의 취득가액은 증여일·상속개시일 평가액입니다 — 소득세법 시행령 §163⑨」) |
| ⑧ validate | `acquisitionMode` 필드 오류 |
| ⑫ Zod | 같은 술어로 400 |
| 복원 마이그레이션 | `calc-wizard-stock-normalize.ts` — 술어가 참인 stale 폼: carryover_gift면 **`donorAcquisitionMethod`를 종전 모드로 옮기고** `acquisitionMode`를 `actual`로. 그 외(gift·inheritance)는 `actual`로만. 부동산 `calc-wizard-asset-migrate.ts:578-581`과 같은 규약(⑧과 **같은 술어**일 때만 건드린다) |

> ⚠️ 마이그레이션 후 `perShareAcquisitionPrice`(평가액)가 비어 있으면 ⑧이 「입력하세요」로 막는다 — **조용히 0원 계산되지 않게** 하는 것이 목적이다. 단, 그 오류가 사용자에게 보이는 칸을 가리키는지 확인(`feedback_blocked_message_is_not_missing_input_path`).

### 4.5 UI — 이월과세 카드 (`AcquisitionInfoBlock.tsx`)

- 「증여자 취득가액 산정 방식」 `RadioCardGroup` 3종 → 선택에 따라 칸 노출.
- `estimated`: 증여자 취득 당시 기준시가(분자) + **양도 당시 기준시가(분모)** — 분모 입력은 지금 Step 2 환산 모드 화면에만 있다(상장 `TransferStdPriceSection` · 비상장 `EstimatedUnlistedBlock` 양도측). Step 2를 실가 모드로 강제하면 **분모 입력 경로가 사라진다** → 이월과세 카드에서 렌더하거나 Step 2에 «A 전용» 섹션을 둔다(V-2 — 재사용 가능한 prop 확인 후 결정).
- 파일 393줄 → 3종 분기 + 칸 추가로 800줄 위험은 낮다(예상 +120). 넘으면 `CarryoverDonorBasisBlock.tsx`로 분리.

---

## 5. 14 동기화 지점

| 지점 | `donorAcquisitionMethod` · `donorAcquisitionMarketSample{Price,Date}` | §163⑨ 게이트 |
|---|---|---|
| ① 폼 타입 / ② initial / ③ normalize | 3필드 추가 · normalize enum + 마이그레이션 | 마이그레이션 |
| ④ API (`stock-transfer-tax-api.ts`) | carryover_gift일 때 전송(method 도출 leaf) | — |
| ⑤ UI | 이월과세 카드 라디오·칸 | Step 2 라디오 disabled + 안내 |
| ⑥ 사이드바 | 영향 확인(취득가액 표시가 A/B 중 무엇인지) | — |
| ⑦ 결과 | `carryoverDetail`에 method·증여자 사례가 echo — 「증여자 기준 매매사례」 표시 | — |
| ⑧ validate | method별 필수(사례가·기준시가) | 술어 오류 |
| ⑫ Zod 입력 객체 | 3필드 + `stock-transfer-date-fields.ts` 날짜 | 술어 refine |
| ⑬ body spread | 확인 | — |
| ⑭ Route 엔진 매핑 (`stock-transfer-engine-input.ts`) | 3필드 매핑(Date 변환) | — |
| ⑨⑩⑪ | 해당 없음 | — |

---

## 6. anchor 케이스 매트릭스 (Pre-Do 우선: CO-1 · CO-5)

| ID | 입력 | 기대 (수치는 Pre-Do 실측으로 확정 — 추정 금지) |
|---|---|---|
| **CO-1** | §2.1 공통 + `donorAcquisitionMethod: "sale_case"` · 증여자 사례 300,000/주(2015-07-01) · donorStd 50,000 | A 취득가액 30,000,000 · 개산공제 50,000 · B 취득가액 150,000,000 · B 개산공제 없음 · ②3호 비교 두 세액 |
| CO-2 | CO-1 + 증여자 사례일 2016-03-01 | ±3개월 경고 기준일이 **증여자 취득일**(2015-06-01)이고 수증일 기준 경고는 없음 |
| CO-3 | CO-1 − donorStd | ⑧ **경고**(field `donorAcquisitionStdPrice` — 개산공제 0) · 계산은 진행 (§7.1) |
| CO-4 | `donorAcquisitionMethod: "estimated"` (Phase 3 기존 픽스처를 새 필드로 이관) | `carryover-97-2-estimated-branches` 8건 **값 불변** |
| **CO-5** | 단순 증여 + `sale_case` | ⑧·⑫ 차단 (현행 개산공제 300,000 경로 소멸) |
| CO-6 | 상속 + `estimated` | ⑧·⑫ 차단 (Q-2) |
| CO-7 | 증여 + `estimated` + 수증일 1985-06-01(의제취득일 전) | **허용**(§176의2④) |
| CO-8 | stale 폼: carryover_gift + `estimated` | 복원 후 `donorAcquisitionMethod: "estimated"` · `acquisitionMode: "actual"` · 평가액 미입력이면 ⑧ 오류가 **보이는 칸**을 가리킨다 |
| CO-9 | API 직접: carryover_gift + method 부재 + `donorAcquisitionPrice` 있음 | 종전과 같은 가목 승계(하위 호환) |
| CO-10 | CO-1 + 증여자 자본적지출 30,000,000 | A 필요경비 = 개산공제만 · `carryoverDetail.donorCapexIncluded` **0** · `swapApplied` false (V-8) |
| CO-11 | 상장 + carryover_gift + method `sale_case` | ⑧·⑫ 차단(영 §176의2③1호 괄호 — 상장 매매사례 제외) |
| CO-12 | carryover_gift + method `estimated` + 분모 미입력 | ⑧·⑫ **오류** (§7.1) |
| CO-13 | 코스닥 + carryover_gift + `estimated` + 양도일 거래정지 | 분모 = 양도연도 보충평가 — Phase 3 「거래정지(양도)」 분기와 같은 값 |

> CO-5는 **부정 anchor**다 — 긍정 짝은 같은 입력을 실가(평가액)로 바꿨을 때 계산이 통과하는 CO-5b로 붙인다(`feedback_negative_anchor_needs_positive_twin`).

---

## 7. 확인 결과 (V) — 2026-10-03 Do 1단계

| ID | 항목 | 결과 |
|---|---|---|
| V-1 ✅ | 주식 의제취득일 | 영 §162⑥3호·⑦3호 — 1985.12.31. 이전 취득 §94①3호 자산 → **1986.1.1.** (기타자산 §94①4호는 ⑦1호 **1985.1.1.** — 엔진 `stock-transfer-helpers.ts:228-243`은 둘을 1986 하나로 처리 → **기존 별건 Y-1**). ⚠️ UI가 1985.12.31. 이전 취득일을 `1986-01-01`로 **바꿔 저장**한다(`AcquisitionInfoBlock.tsx:44-50` `coerceDeemed`) ⇒ §163⑨ 게이트는 **`acquisitionDate > "1986-01-01"`(엄격)** 이어야 의제취득 자산(§176의2④)을 막지 않는다 |
| V-2 ✅ | 환산 분모 입력 재사용 | 증여자 환산은 분자를 `donorAcquisitionStdPrice`로 **덮어쓰므로**, 분자만 다른 갈래(취득후상장 · 취득일 거래정지)는 결과가 같아진다. 남는 분모는 **두 종류뿐**: ⓐ 상장 정상 = 양도일 이전 1개월 종가평균(`TransferStdPriceSection` — `form`·`onChange`만 받는 독립 컴포넌트, 그대로 재사용) ⓑ 비상장 또는 코스닥·코넥스 양도일 거래정지(§165③) = 양도연도 순손익·순자산(`EstimatedUnlistedBlock`에 **양도측 전용 prop 신설** — 현재는 `acquisitionSideOnly`·`simpleOnly`뿐). 코스닥·코넥스는 ⓐ/ⓑ를 고르는 2지 라디오(`acquisitionStdMode` monthly_avg / halt_transfer 재사용)로 Phase 3 커버리지를 유지한다 |
| V-3 ✅ | override가 보충평가를 우회 | `stock-acquisition-basis.ts` C-1·비상장 분기 정독 — 우회한다 |
| V-4 | Phase 3 테스트 3파일 | Pre-Do에서 실행. ⚠️ **B를 §163⑨(실가)로 고치면 B 세액이 바뀐다** — 선행 계획서 `:819`가 「B의 취득측 기준시가를 주지 않아 B 취득가액이 0」인 픽스처를 보정한 이력이 있다. 값이 바뀌는 anchor는 법령 우선으로 재기준(`feedback_anchor_correction_legal_priority`) |
| V-5 ✅ | 국심2007중1761 당시 §163⑨ | 2006.9.25. 시행본(MST 75526) — 「상속 또는 증여(상증법 제33조 내지 제42조의 규정에 의한 증여를 제외한다)받은 자산 … 평가한 가액을 취득당시의 실지거래가액으로 본다」. 현행과 같은 구조. **증여의제·추정은 두 시점 모두 제외** — 이 앱의 「증여」 원인은 일반 증여라 게이트 범위와 맞다 |
| V-6 ✅ | 상속 원인 다른 경로 | 없다(`decedentAcquisitionDate`만). 분할(lot) 카드는 이미 원인별 「§60~66 평가가액 — 소령 §163⑨」 안내가 있다(`AcquisitionLotCard.tsx:131-140`) — **형제 경로가 규칙을 이미 구현** |
| V-7 ✅ | 단건 Step 2 「1주당 취득가액」 안내 | `Step2.tsx:324-330` 원인과 무관하게 「실제 취득가액 (원)」 → lot 카드와 같은 원인별 문구로 맞춘다 |
| V-8 ✅ | 증여자 자본적지출 × 매매사례 A | §97②2호 **본문**: 나목이면 필요경비 = 나목 금액 + 개산공제(자본적지출·양도비 미가산). §97의2①2호는 「§97①2호에 따른 필요경비」의 **내용**을 넓힐 뿐 2호 본문 구조를 바꾸지 않는다 ⇒ 매매사례 A에서 증여자 자본적지출은 **산입되지 않는다**(환산은 단서 swap의 나목으로만 쓰임 — 현행 그대로). 엔진 계산은 이미 그렇다(`sale_case`는 STEP 4에서 실비 미사용). 🔴 다만 **결과 echo `carryoverDonorCapexApplied`가 「산입」으로 표시된다** → 0으로 고친다 |

### 7.1 정책 정합 — 증여자 값 누락은 «경고», 분모 누락은 «오류»

- 선행 Phase 3은 증여자 취득가액·기준시가가 비어도 **경고만** 한다(`stock-transfer-tax-validate-step1.ts:390-409` — 「법 근거 없이 입력을 막지 않는다」). 같은 정책을 따른다 ⇒ **CO-3은 경고**로 조정.
- 반면 증여자 환산의 **분모**가 비면 A 취득가액이 0이 되어 A 세액이 커지고 ②3호가 A를 «채택»한다 — 조용한 과대과세. 종전 환산 모드 필수 게이트와 같이 **오류**로 막는다.

### 7.2 별건 (이번 범위 밖)

| ID | 내용 |
|---|---|
| Y-1 | 기타자산(§94①4호) 의제취득일은 1985.1.1.(영 §162⑦1호)인데 엔진·UI는 1986.1.1. 하나로 처리 |
| Y-2 | `stock-transfer-tax-validate-step2.ts:355·364·399·411` 「§163⑨ 환산 분모·분자」 오인용(정본 영 §176의2②1호) |

## 8. 실행 단계

```
1. V-1~V-8 해소, Q-1~Q-4 확정                  → verify: §3·§7 갱신
2. Pre-Do anchor CO-1(A 사례가) · CO-5(§163⑨) RED 확인 → verify: 현행에서 실패 사유가 §2와 일치
3. 엔진 A/B(4.2·4.3) + method 도출 leaf          → verify: CO-1·2·9·10, Phase 3 3파일 불변(CO-4)
4. ④⑧⑫⑬⑭ + §163⑨ 술어(4.4)                     → verify: CO-3·5·6·7·11
5. ①②③ + 마이그레이션                            → verify: CO-8
6. ⑤ UI(이월과세 카드 · Step 2 라디오) · ⑦ 결과   → verify: Playwright 폼→결과, request body
7. 전체 vitest · tsc · verify:legal(신규 인용 manifest) → verify: 0 fail
```

한 PR로 낸다 — 3단계만 내면 A가 고쳐져도 F-2가 남고, 4단계만 내면 Phase 3 환산 입력 경로가 사라진다(F-3).

## 9. 범위 밖

- X-1(K-OTC 비과세 + 매매사례 echo 0원) — 별건 유지.
- 분할(lot) 모드 — Zod가 실가만 허용(`stock-transfer-tax-refines.ts:466`)해 추계 조합이 없다.
- 감정가액 — 주식 제외(영 §176의2③2호 괄호).
- `stock-transfer-tax-validate-step2.ts:355·364·399·411`의 「§163⑨ 환산 분모·분자」 문구는 오인용이다(정본 영 §176의2②1호 — `stock-valuation-listed.ts:9-10`이 이미 정정 기록). 문구 정정은 별건으로 기록만.

---

## 10. 구현 결과 (2026-10-03)

### 10.1 변경 지점

| 층 | 파일 | 내용 |
|---|---|---|
| 술어(단일 소스) | `lib/tax-engine/stock-transfer/gift-acquisition-163-9.ts` 🆕 | `isGiftLikeEstimationBlocked(cause, date, mode)` — 증여·이월과세·상속 ∧ 취득일 > 1986-01-01 ∧ 추계 모드. ⑧·⑫·마이그레이션·엔진 B가 공유 |
| 법령 상수 | `legal-codes/stock.ts` | `ENFORCEMENT_DECREE_163_9_GIFT_VALUATION` (§163은 manifest에 조문 단위 등록 — 감시 범위 안) |
| 엔진 타입 | `stock-transfer.types.ts` | `donorAcquisitionMethod` · `donorAcquisitionMarketSample{Price,Date}` · `carryoverDetail.donorAcquisitionMethod` |
| 엔진 A | `stock-carryover.ts` | `resolveDonorAcquisitionMethod`(명시 > 증여자 실가 > 수증자 `estimated`) · 매매사례 분기 신설(증여자 사례가·증여자 기준시가 override·①2호 echo 0) · 환산은 A에서 `acquisitionMode: "estimated"`로 전환 |
| 엔진 B | 같은 파일 | §163⑨ 술어가 참이면 실가로 되돌리고 사례가 입력 제거 · 비교표 echo(증여자 사례가) |
| STEP 3 | `stock-acquisition-basis.ts` | `sale_case`가 override를 읽는다(없으면 수증연도 보충평가로 새지 않게 0 → 개산공제 없음 + 경고) |
| ±3개월 | `stock-transfer-pr2-detail.ts` · `stock-valuation-market-sample.ts` | A면 기준일 = 증여자 취득일 · 문구 「증여자 취득일과 N일」 |
| ①②③ | `calc-wizard-stock-form*.ts` · `-normalize.ts` | 3필드 + 복원 마이그레이션(§163⑨ 조합 → 실가, 이월과세는 종전 모드를 `donorAcquisitionMethod`로 이관) |
| ④ | `stock-transfer-tax-api.ts`(754→**706**줄) + `stock-transfer-tax-api-carryover.ts` 🆕 | 방식별 입력만 전송 · 증여자 환산 분모 전송 · `acquisitionStdMode`를 분모 두 갈래로 좁힘(stale `post_listing`·`halt_acquisition` 차단). 750 위험구간이라 이월과세 body 구성을 형제 파일로 이동 |
| ⑤ | `AcquisitionInfoBlock.tsx` · `CarryoverDonorConversionSection.tsx` 🆕 · `EstimatedUnlistedBlock.tsx`(`transferSideOnly`) · `Step2.tsx` | 증여자 산정 방식 라디오(상장이면 매매사례 비활성) · Step 2 추계 모드 비활성 + §163⑨ 안내 · 1주당·합계 칸 원인별 평가액 안내(V-7) · 증여자 환산 분모 섹션 |
| ⑦ | `StockCarryoverComparisonCard.tsx` | 「적용」 열이 증여자 매매사례가액이면 그 사실을 표시 |
| ⑧ | `validate-step1.ts` · `validate-step2.ts` | 방식별 경고(§7.1) · 상장 증여자 매매사례 오류 · §163⑨ 오류 · 분모 오류(`isDonorConversionForm` 공유) |
| ⑫⑬⑭ | `stock-transfer-tax-schema.ts` · `-refines.ts` · `-engine-input.ts` · `-date-fields.ts` | 3필드 · 같은 세 규칙 · `requiredUnlistedValuationKeys`에 `scope: "transfer"` |
| ⑥ | — | 계산 전 사이드바는 수증자 평가액을 보여주고 계산 후 엔진값을 읽는다 — 종전과 같음 |

### 10.2 검증

| 항목 | 결과 |
|---|---|
| Pre-Do 엔진 anchor `carryover-sale-case-donor-basis.anchor.test.ts` | **9 RED** → GREEN 11/11 (CO-1·2·9·10·B) |
| 게이트 anchor `stock-carryover-sale-case-gates.anchor.test.ts` | 17/17 (CO-3·5·5b·6·7·8·11·12·13 · AP-1) |
| 뮤테이션 probe 4건 (⑫ §163⑨ · ④ 분모 · 엔진 B · basis override) | **전건 KILLED** (1·4·3·3건 실패) |
| 기존 테스트 | `stock-carryover-97-2-wiring` W-3을 β 입력 형태로 이관(기대값 불변 — 종전 B와 새 B가 같은 8억) · Phase 3 `carryover-97-2-estimated-branches` 등 **값 변경 0** |
| 전체 vitest | 27,412 passed (literal `÷` 게이트 1건은 안내 문구 풀어쓰기로 해소) |
| tsc · eslint | 0 · 에러 0 (경고 3건은 기존 `stock-transfer-tax-schema.ts` 미사용 import) |
| 브라우저 E2E `e2e/stock-carryover-donor-sale-case.spec.ts` | ① 증여자 매매사례: Step 2 추계 모드 비활성·안내 → 신고서 취득가액 **30,000,000** · 개산공제 **50,000** · 비교표 라벨 ② 증여자 환산: 분모 섹션(취득측 칸 없음) → 취득가액 **100,000,000** · 개산공제 50,000 |
| 주식 관련 E2E 45파일 | 104 passed |

### 10.3 남은 것

- §7.2 별건 Y-1(기타자산 의제취득일 1985.1.1.) · Y-2(「§163⑨ 환산」 오인용 문구) — 미수정.
- X-1(K-OTC 비과세 + 매매사례 echo 0원) — 선행 계획서 별건 유지. 단 이번 §163⑨ 차단으로 **증여·상속 원인의 비과세 + 매매사례** 조합은 입력 자체가 막힌다.

