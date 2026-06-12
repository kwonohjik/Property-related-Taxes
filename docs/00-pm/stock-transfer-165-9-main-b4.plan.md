# §165⑨ 본체 (기준시가 방식 양도·취득 기준시가 동일) 구현 계획서 — B-4

> 작성: 2026-06-12 · 기준 origin/master `a59c5675`(PR #162 머지 후) · 시리즈: `stock-transfer-remaining-followups.plan.md` §1 Track B B-4
> **검증 상태**: §1 법령 인용은 전부 KoreanLaw MCP 축자 확인(2026-06-12, 소득세법 시행령 MST 286211 · 시행규칙 MST 286379, 현행 시행 2026-05-22). §5·§8 코드 인용은 전부 Read/grep 실측(추정 0).
> 선행: PR-2(§81④ 월할 가산 **§165⑤ 후단 준용** 케이스, `stock-valuation-post-listing.ts`) — B-4는 그 산식 머신을 **§165⑨ 본체**로 확장.

---

## 0. 목적·배경·갭

### 0.1 갭 정의

`calcUnlistedValuation`(비상장 보충적 평가 환산 경로)은 양도 당시 기준시가(`transferStdPricePerShare`)와 취득 당시 기준시가(`acquisitionStdPricePerShare`)를 각각 직전 사업연도 종료일 기준으로 산출하고, 환산취득가 = 양도가 × (취득기준시가 / 양도기준시가)로 계산한다(`stock-valuation-unlisted.ts:368-444` 실측).

**두 기준시가가 같으면**(= 취득·양도가 같은 사업연도에 속해 직전 사업연도가 동일) 환산비율 = 1 → **환산취득가 = 양도가 → 양도차익 0**(개산공제 차감 후 음수 → floor 0). §165⑨은 이 경우 양도 당시 기준시가를 §81④ 월할 상승분으로 **상향 교체**하여 양(+)의 양도차익을 산출하도록 강제한다 — 현행 엔진은 이 보정을 **미적용**(과소 과세 가능).

### 0.2 본체 vs 준용 (PR-2와의 경계)

| 축 | PR-2 (§165⑤ 후단 준용, 기구현) | **B-4 (§165⑨ 본체, 본 PR)** |
|---|---|---|
| 트리거 | 취득일 §4항 평가액 == **상장일** §4항 평가액 (취득 후 상장) | 양도 당시 기준시가 == 취득 당시 기준시가 (기준시가 방식 일반 양도) |
| 보정 대상(분모) | **상장일** 현재 §4항 평가액 | **양도 당시** 기준시가 |
| §81④ 보유월수 | 취득일 → **상장일** (`calcAccrualMonths(acquisitionDate, listingDate)`) | 취득일 → **양도일** (`calcAccrualMonths(acquisitionDate, transferDate)`) |
| 적용 경로 | `acquisitionMode==="estimated"` + `acquiredBeforeListing`(post-listing) | `acquisitionMode==="estimated"` + `marketType==="unlisted"`(weighted_avg) |
| 동일 사업연도 토글 | `PostListingDetailInput.monthlyAccrualToggle` (중첩 — types:321) | **신규 top-level `unlistedSameBizYearToggle`** (★ STEP 1 정정) |
| 전전연도·월수 입력 | `prePriorYear*`·`priorBizYearMonths` (top-level — types:211/213/215) | **동일 top-level 필드 재사용** |

→ §81④ 1호 산식·`calcAccrualMonths`는 **공유 헬퍼로 추출**(현재 post-listing 모듈 사유화). 두 경로의 차이는 (a) 보유월수 종점(상장일/양도일), (b) 교체 대상 식별뿐 — 산식 본체는 동일.

> ★ STEP 1 실측 정정: `monthlyAccrualToggle`(types:321)는 `StockTransferInput`(:18~:285)이 **아닌** `PostListingDetailInput` 중첩 객체 소속. post-listing 모듈은 `postListingDetail?.monthlyAccrualToggle`(`stock-valuation-post-listing.ts:275`)로 읽음. 비상장 환산 경로에는 토글이 없으므로 **신규 top-level 토글 1개 필요**. 전전연도 NI/NA·직전사업연도 월수는 top-level이라 재사용.

---

## 1. 법령 근거 (KoreanLaw 축자 — 2026-06-12 확인)

### 1.1 시행령 §165⑨ (본체 — MST 286211)

> "법 제99조제1항제3호 및 제4호에 따라 산정한 **양도 당시의 기준시가와 취득 당시의 기준시가가 같은 경우**에는 법 제99조제1항제3호 및 제4호에도 불구하고 해당 자산의 **보유기간과 기준시가의 상승률을 고려하여** 재정경제부령으로 정하는 방법에 따라 계산한 가액을 **양도 당시의 기준시가로 한다**."

- 적용 대상: §99①3(상장주식 1개월 종가평균) **및** §99①4(비상장 보충평가) — 양자
- 트리거: 양도 당시 기준시가 == 취득 당시 기준시가
- 효과: 양도 당시 기준시가를 §81④ 계산 가액으로 **교체**(취득 당시 기준시가는 불변)

### 1.2 소칙 §81④ (산식 본문 — MST 286379)

> "영 제165조제9항에서 '재정경제부령으로 정하는 방법에 따라 계산한 가액'이란 다음 각 호의 구분에 따라 계산한 가액을 말한다. 이 경우 **1개월 미만의 월수는 1개월로 본다**.
> 1. 해당 법인의 **동일한 사업연도 내에 취득하여 양도하는 경우**:
>    양도당시 기준시가 = 취득일이 속하는 사업연도의 **직전사업연도 기준시가** + (직전사업연도 기준시가 − **전전사업연도 기준시가**) × (**양도자산 보유월수** ÷ 직전사업연도의 월수)
> 2. **제1호 외의 경우**: 해당 양도자산의 기준시가" *(= 보정 없음)*

### 1.3 §99①3(상장) vs §99①4(비상장) 구조적 적용 차이 ★ (실효 범위 판정)

§81④ 1호 산식은 "직전/전전 **사업연도** 기준시가"를 모수로 한다. 이는 **사업연도 종료일 기준 평가액을 갖는 §99①4(비상장 보충평가)에만 구조적으로 적용** 가능하다.

- **§99①4 (비상장)**: 기준시가 = 직전 사업연도 종료일 보충평가(§165④1). 동일 사업연도 취득·양도 시 직전 사업연도 동일 → 두 기준시가 동일 → §165⑨ 트리거 → §81④ **1호 상향 보정** 실효. **← B-4 본체 구현 대상**
- **§99①3 (상장)**: 기준시가 = 양도일·취득일 직전 **1개월 종가평균**(§165③) — 사업연도 무관. 두 종가평균이 같아도 §81④ 1호의 "직전사업연도 기준시가" 모수가 부재 → §81④ **2호(보정 없음)** 귀속. **← 정보성 warning만, 상향 없음**

→ 본 PR의 산식 보정은 **비상장 환산 경로(`marketType==="unlisted"` weighted_avg)** 한정. 상장 경로(`calcListedValuation`)의 동일 종가평균 케이스는 §81④ 2호로 결과 불변 — warning 1줄만 추가.

### 1.4 인용 드리프트 경계 (memory `feedback_kiwoom_law_citation_drift` 준수)

- §165⑨ ≠ §163⑨(상속·증여 평가가액 §60~66) — 과거 `apply-163-9-conversion.ts` 파일명이 legacy 오기 잔재(D-2 정정 완료). 본 PR 신규 상수·주석은 **§165⑨·§81④만** 인용.
- STOCK 상수: `STOCK.ENFORCEMENT_DECREE_165_9_MAIN`(신규 추가)·`STOCK.ENFORCEMENT_RULE_81_4_MONTHLY_ACCRUAL`(기존 `:197` 재사용). `SECTION_165_9_MAIN`은 미존재 — 명명 정정(★ STEP 1).
- 환원율은 §82(신축주택 요건) 아닌 **시행규칙 §81② → 상증령 §17**(전전 사업연도 평가에 `calcUnlistedPerShareWeighted` 재사용 시 동일 환원율).

---

## 2. 케이스 매트릭스 (전수)

| # | 시장 | 양도≟취득 기준시가 | 동일 사업연도(§81④ 1호 토글) | 전전연도 입력 | 동작 |
|---|---|---|---|---|---|
| M-1 | 비상장 | 다름 | — | — | **현행 환산 유지** (transferStd ≠ acqStd — 사례 anchor 불변) |
| M-2 | 비상장 | 같음 | ON(1호) | 입력됨 | **§81④ 1호 상향 보정 발동**: 양도기준시가 = adjusted > 공통값 → 환산비율 < 1 → 양(+)차익 |
| M-3 | 비상장 | 같음 | OFF(2호) | — | **보정 없음**(2호) + warning "§165⑨ — 양도·취득 기준시가 동일하나 동일 사업연도 아님(§81④ 2호) — 양도차익 0 가능" |
| M-4 | 비상장 | 같음 | ON | **미입력** | warning + 보정 미적용 (엔진 방어). validate ⑧: 토글 ON 자체가 1호 신고 → 전전연도 필수 (단 equal 판정은 엔진 단독 — validate 재현 시 dual-truth라 **simple 모드 한정** 차단, full은 엔진 warning 위임) |
| M-5 | 비상장 | 같음 | ON | 전전 > 직전 (하락) | 법문 그대로: adjusted < 공통값 → 환산비율 > 1 (음수 상승률 허용, 분수 단일 floor 방향 일관) |
| M-6 | 비상장 | 같음 | ON | adjusted ≤ 0 | "환산 불가" 가드 — warning + 보정 미적용(현행 환산값 유지) |
| M-7 | 비상장 | 같음 | ON | 80% 하한이 양도측만 발동해 두 값이 달라진 경우 | **트리거 미성립**(최종 기준시가 비교) → M-1 경로. equal 판정은 floor·하한 적용 **후** 값 기준 |
| M-8 | 상장 | 같음 | (무관) | — | §81④ 2호 — 결과 불변 + 정보성 warning "§165⑨ — 상장 종가평균 동일, §81④ 2호 보정 없음" |
| M-9 | 비상장 | (무관) | OFF | — | 토글 OFF·기준시가 다름 → 완전 현행 (회귀 0) |

**보유월수 종점 = 양도일**(본체) — PR-2의 상장일과 구분. `calcAccrualMonths(acquisitionDate, transferDate)`.

---

## 3. 산식 설계 (정수 연산)

```
[트리거 판정] (비상장 weighted_avg 경로, 80%하한·floor 적용 후)
  triggered = (transferStdPricePerShare === acquisitionStdPricePerShare)
              && transferStdPricePerShare > 0

[§81④ 1호 보정] (triggered && unlistedSameBizYearToggle && prePrior 입력)
  prior  = transferStdPricePerShare            // = acquisitionStdPricePerShare (동일)
  prePrior = calcUnlistedPerShareWeighted(prePriorNI, prePriorNA, isHeavyRE)   // 80% 하한 미적용 (환산비율 모수 관행)
  m = calcAccrualMonths(acquisitionDate, transferDate)   // 1개월 미만 절상 (본체: 양도일 종점)
  d = priorBizYearMonths ?? 12

  adjustedTransferStd = floor( (prior × d + (prior − prePrior) × m) / d )   // 분수 단일 floor (음수 상승률 방향 일관)

  if adjustedTransferStd <= 0 → 보정 미적용 + warning (M-6)

[환산취득가 재산출] (양도 당시 기준시가만 교체, 취득 당시 기준시가 = prior 불변)
  totalAcquisitionPrice = floor( 양도가 × acquisitionStdPricePerShare / adjustedTransferStd )   // BigInt 안전
  // acquisitionStdPricePerShare 불변 → §163⑥4 개산공제 base(취득기준시가 총액) 불변
```

- `adjustedTransferStd > prior`(상승 시) → 환산비율 = prior/adjusted < 1 → 환산취득가 < 양도가 → 양(+)차익
- **공유 헬퍼 추출**: `apply81_4Accrual(prior, prePrior, holdingMonths, priorBizYearMonths)` → `{ adjusted }`. post-listing(`:315-316`)·본체 양경로 호출 → dual-truth 제거([[feedback_ui_engine_dual_truth_avoidance]] 엔진 내부 중복에도 적용)
- 개산공제 base = `acquisitionStdPriceTotal`(취득기준시가 총액) **불변** — §165⑨은 양도 당시 기준시가만 교체. (현행 `:431` 그대로)
- 음수 상승률(M-5): 분수 전체 단일 `Math.floor` — 부동소수 곱 금지([[feedback_applyrate_fractional_rate_one_won_error]])

---

## 4. 트리거 위치·엔진 변경

### 4.1 공유 §81④ 헬퍼 추출 (신규 sibling)

`lib/tax-engine/stock-transfer/apply-81-4-accrual.ts` (신규, ~40줄):
- `calcAccrualMonths(from: Date, to: Date): number` — post-listing `:150`에서 **이동**(종점 일반화 — 인자명 listingDate→to). post-listing은 `calcAccrualMonths(acqDate, listingDate)`로 호출 유지
- `apply81_4Accrual(prior, prePrior, holdingMonths, priorBizYearMonths): { adjusted: number }` — `:315-316` 산식 추출
- post-listing 모듈은 두 헬퍼를 import해 기존 동작 보존(회귀 0 — anchor 사례 48 불변 확인)

### 4.2 비상장 환산 경로 보정 주입 (`stock-valuation-unlisted.ts:422-444`)

`calcUnlistedValuation` weighted_avg 말미(취득기준시가 산출 `:430` 직후, 환산 `:433` 직전)에 §165⑨ 본체 분기:

```
// §165⑨ 본체 — 양도·취득 기준시가 동일 시 §81④ 양도기준시가 상향
let appliedTransferStd = transferStdPricePerShare;
if (transferStdPricePerShare === acquisitionStdPricePerShare
    && transferStdPricePerShare > 0
    && input.unlistedSameBizYearToggle === true            // ★ 신규 top-level 토글
    && typeof input.prePriorYearNetIncomePerShare === "number"
    && typeof input.prePriorYearNetAssetPerShare === "number") {
  const prePrior = calcUnlistedPerShareWeighted(prePriorNI, prePriorNA, isHeavyRE);
  const m = calcAccrualMonths(input.acquisitionDate, transferDate);   // 본체: 양도일 종점
  const { adjusted } = apply81_4Accrual(transferStdPricePerShare, prePrior, m, input.priorBizYearMonths ?? 12);
  if (adjusted > 0) { appliedTransferStd = adjusted; appliedRules.push(STOCK.ENFORCEMENT_DECREE_165_9_MAIN); /* detail echo */ }
  else warnings.push("§81④ 보정 평가액 0 이하 — 보정 미적용");
}
// 환산 분모를 appliedTransferStd로 교체
```

- 결과 타입 `UnlistedValuationResult`에 `section1659Applied?`·`section1659Detail?`(prior·prePrior·holdingMonths·adjusted) optional 추가 → 결과 카드 echo
- M-3(토글 OFF·동일) warning은 트리거 성립이나 토글 OFF 분기에서 push

### 4.3 상장 경로 M-8 (orchestrator 레벨 — 설계 §5 동기화)

`ListedValuationResult`에 `warnings[]` 부재(`appliedRule` 단일 string) → listed 모듈 무변경. **orchestrator**(`stock-transfer-tax.ts:392-404`)에서 `listedResult.perShareTransferStdPrice === listedResult.perShareAcquisitionStdPrice && both>0` → `warnings.push("§165⑨ — 상장 종가평균 동일, §81④ 2호 보정 없음")`. 산식 변경 0.

### 4.4 orchestrator (`stock-transfer-tax.ts:313-350`)

`marketType==="unlisted"` 분기는 `calcUnlistedValuation` 결과를 그대로 사용 → 엔진 변경 최소(보정은 valuation 내부). `section1659Applied` 시 `appliedRules.push(STOCK.ENFORCEMENT_DECREE_165_9_MAIN)` echo + valuationDetail에 detail 전달. (법령 문자열 리터럴 금지 — STOCK 상수 [[feedback_legal_codes]])

---

## 5. 입력 필드 (신규 top-level 토글 1 + 재사용 3)

| 필드 | 정의 | 현황 (실측) |
|---|---|---|
| **`unlistedSameBizYearToggle: boolean`** ★신규 | §81④ 1호(비상장 동일 사업연도 취득·양도) 여부. default false(3중 패턴) | **신규 top-level** — `monthlyAccrualToggle`(types:321)는 `PostListingDetailInput` 중첩이라 재사용 불가 |
| `prePriorYearNetIncomePerShare?` | 전전 사업연도 1주당 순손익 | `types:211` top-level 존재 — 재사용 |
| `prePriorYearNetAssetPerShare?` | 전전 사업연도 1주당 순자산 | `types:213` top-level 존재 — 재사용 |
| `priorBizYearMonths?` | 직전 사업연도 월수 (default 12) | `types:215` top-level 존재 — 재사용 |
| `acquisitionDate`·`transferDate` | 보유월수 산정 (취득→양도) | 기존 |

→ **신규 토글 1개**로 ①②③④⑨⑫⑬⑭ 동기화 발생(§6). **UI 노출 갭**: 전전연도 NI/NA·직전사업연도 월수는 현재 post-listing 블록에서만 노출 — 비상장 환산(`marketType==="unlisted"`) 블록에 **§81④ 입력 영역(전전연도 2필드 + 직전월수 + 신규 토글) 노출 추가**(⑤). 이것이 본 PR UI 작업의 핵심.

---

## 6. 14 동기화 지점

신규 `unlistedSameBizYearToggle` 1필드 기준 (3중 패턴 default false 일관 — store factory·normalize·UI):

| # | 지점 | 작업 |
|---|---|---|
| ① | form 상태 | `calc-wizard-stock-store.ts` FormData에 `unlistedSameBizYearToggle: boolean` 추가 |
| ② | initial | store factory default `false`(`:541` 인근 monthlyAccrualToggle 패턴) |
| ③ | normalize | `calc-wizard-stock-normalize.ts` `boolField("unlistedSameBizYearToggle", ...)`(`:184` 패턴) |
| ④ | api 변환 | `lib/calc/stock-transfer-tax-api.ts`에 신규 토글 전달 (전전연도·월수 전달 여부도 grep 확인 — 비상장 경로에서 누락 시 동시 보강) |
| ⑤ | **UI 위젯** | 비상장 환산 블록에 §81④ 입력(전전연도 NI/NA·직전사업연도 월수·신규 토글 `ToggleCard`) 노출. post-listing 위젯(`PostListingValuationCard` §81④ 영역) 공용 섹션 추출 |
| ⑥ | 사이드바 | 무변경 (result 기반) |
| ⑦ | **결과 카드** | `section1659Detail` echo — "§165⑨ 본체: 양도기준시가 {prior} → {adjusted} (보유 {m}개월·직전월수 {d})". "원" 미표기 |
| ⑧ | validate | M-4 — `stock-transfer-tax-validate-step2.ts` 신규 분기: simple 모드 한정 토글 ON + 전전연도 미입력 차단(post-listing `:303-317` 토글 검증과 **별개** — 그건 취득·상장 평가액 비교, 본체는 양도·취득 비상장) |
| ⑨ | Zod enum 메인 | `stock-transfer-tax-schema.ts` `unlistedSameBizYearToggle: z.boolean().default(false)`(`:97` monthlyAccrualToggle 패턴) |
| ⑩⑪ | 컴패니언·자산-수준 | **N/A** — ★ STEP 3 실측: `prePriorYear*`·`monthlyAccrualToggle`은 **form-global flat**(`store:184-186`·`:220`, StockAssetForm 배열 아님). 비상장 환산 = 단일 종목. 신규 토글도 form-global(monthlyAccrualToggle top-level 패턴 미러) |
| ⑫ | Zod 입력 객체 | ⑨에 포함 (단일 bool 필드) |
| ⑬ | callTransferTaxAPI body | `stock-transfer-tax-api.ts` body spread에 신규 토글 포함 — **silent strip 방지 grep** |
| ⑭ | Route handler 엔진 input 매핑 | `app/api/calc/stock-transfer/route.ts` 엔진 input에 `unlistedSameBizYearToggle` 매핑 (Date 무관 bool) |

★ ⑫⑬⑭ TS 미감지 — 신규 토글 grep 자가 점검 필수(memory `feedback_api_zod_schema_sync`). ⑧ 신규 validate 블록은 기존 `:303-317`(monthlyAccrualToggle·취득연도↔상장연도 비교)과 **별개**로, `unlistedSameBizYearToggle` 키 + 취득연도↔양도연도 비교.

---

## 7. anchor (`__tests__/tax-engine/stock-transfer/section-165-9-main-b4.test.ts`)

| anchor | 검증 |
|---|---|
| B4-ENGINE-1 (M-1) | 비상장 transferStd ≠ acqStd → 현행 환산 (보정 미발동, 회귀 0) |
| B4-ENGINE-2 (M-2) | 동일 기준시가 + 토글 ON + 전전 입력 → adjusted 상향·환산비율<1·양(+)차익 (원단위 toBe) |
| B4-ENGINE-3 (M-3) | 동일 + 토글 OFF → 보정 없음·차익 0·warning |
| B4-ENGINE-4 (M-5) | 전전>직전(하락) → adjusted<prior·환산비율>1·음수 상승률 floor 방향 |
| B4-ENGINE-5 (M-6) | adjusted≤0 → 보정 미적용 + warning |
| B4-ENGINE-6 (M-7) | 80% 하한 양도측만 발동 → equal 미성립 → M-1 경로 |
| B4-BOUNDARY-1 | 보유월수 1개월 미만 → 1개월 절상 (calcAccrualMonths 양도일 종점) |
| B4-SHARED-1 | `apply81_4Accrual` 추출 후 post-listing 사례 48(5,824) 불변 (공유 헬퍼 회귀) |
| B4-LISTED-1 (M-8) | 상장 동일 종가평균 → 결과 불변 + §81④ 2호 warning |

- **Pre-Do anchor**: 기존 비상장 환산 anchor(사례 49·weighted_avg 계열) + post-listing 사례 48 전수 통과 고정 — 헬퍼 추출 회귀 0 확인이 Do 진입 조건.
- E2E 1건(`E2E_PORT=3200`): 비상장 환산 + §81④ 입력 노출 + 동일 기준시가 → 보정 결과. 단 simple 모드 직접 입력으로 equal 재현.

---

## 8. 현행 코드 실측 (2026-06-12)

| 위치 | 내용 |
|---|---|
| `stock-valuation-unlisted.ts:368-407` | 양도기준시가(`transferStdPricePerShare`) 산출 + 80% 하한 |
| `stock-valuation-unlisted.ts:422-431` | 취득기준시가(`acquisitionStdPricePerShare`) 산출 (80% 하한 미적용) |
| `stock-valuation-unlisted.ts:433-444` | 환산취득가 = 양도가 × acqStd / transferStd (BigInt) ← **본체 주입 지점** |
| `stock-valuation-post-listing.ts:150` | `calcAccrualMonths(acqDate, listingDate)` ← 공유 추출 대상 |
| `stock-valuation-post-listing.ts:306-316` | §81④ 1호 산식 (prePrior·adjusted) ← 공유 추출 대상 |
| `stock-transfer-tax.ts:313-350` | orchestrator unlisted 분기 |
| `types/stock-transfer.types.ts:211·213·215·321` | prePrior·priorBizYearMonths·monthlyAccrualToggle (기존) |

## 9. 비스코프·리스크

- **상장 1호 상향**: §81④ 1호 산식은 사업연도 기준시가 모수라 상장(§99①3 종가평균) 미적용 — 2호 warning만(§1.3 판정).
- **사업연도 자동 판정 불가**: 엔진은 사업연도 종료일 미보유(회사별 상이) → 동일 사업연도(1호) 여부는 `monthlyAccrualToggle` 사용자 입력 필수(자동 안분 fallback 금지 [[feedback_no_silent_apportion_fallback]]).
- **트리거 dual-truth**: equal 판정은 엔진 단독(floor·하한 후 값) — validate 재현은 simple 모드 한정. full/listing_only는 합성 산출이라 엔진 warning 위임(M-4).
- **공유 헬퍼 추출 회귀**: post-listing 사례 48 anchor가 추출 후 불변임을 Pre-Do에서 우선 확인.
- **80% 하한 비대칭(비스코프)**: 현행 `calcUnlistedValuation`은 80% 하한을 **양도측만** 적용(`:382-407`), 취득측 미적용(`:430`, 기존 컨벤션 주석 `:423`). equal 트리거는 floor·하한 적용 **후** 최종 기준시가 비교 — 양도측 80% 하한 활성 시 동일 사업연도라도 두 값이 달라져 트리거 억제(M-7). 80% 하한 양측 적용 여부는 §165④1 단서 본칙 재검토 사안이나 **기존 동작 변경은 회귀 위험·B-4 비스코프** — 별도 갭으로 분리. 본체 트리거는 "최종 기준시가 동일"로 정의(법문 "산정한 기준시가가 같은 경우" 부합).
</content>
</invoke>
