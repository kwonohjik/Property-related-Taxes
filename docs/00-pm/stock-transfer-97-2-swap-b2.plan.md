# B-2 §97②2호 단서 swap (주식) — 판정·구현 계획서 (PR-ε)

> 작성 2026-06-12 · 기준 origin/master `ea2edf14` (PR #159 머지 후)
> 로드맵: `docs/00-pm/stock-transfer-remaining-followups.plan.md` Track B-2
> P0 = KoreanLaw 축자 검증 — **완료(§1)**. 모든 인용 file:line grep/Read 실측 (추정 0).

## 0. 판정 결론 — **적용 (구현 필요)**

로드맵의 "미적용 결론이면 주석 정리로 종결" 시나리오는 **기각**. §97②2호 단서 swap은 주식 환산취득가액에 문리상 직접 적용된다. 환산 모드에서 (환산취득가 + 개산공제) < (자본적지출 + 양도비)이면 후자를 필요경비로 할 수 있다(납세자 선택 → 큰 쪽 적용, 부동산 엔진 전례 동일).

## 1. 법령 근거 (KoreanLaw 축자 — 2026-06-12 실측, MST 285523·286211)

| 조문 | 축자 내용 | 판정 기여 |
|---|---|---|
| 소법 §97②2호 본문 | "그 밖의 경우의 필요경비 = §97①1나목 금액 + **자산별로 대통령령으로 정하는 금액**(개산공제)" | 현행 엔진 본문 구현과 일치 |
| 소법 §97②2호 **단서** | "다만, 제1항제1호나목에 따라 취득가액을 **환산취득가액으로 하는 경우**로서 **가목**(환산취득가액+개산공제 합계)이 **나목**(§97①2호·3호 합계)보다 **적은** 경우에는 나목의 금액을 필요경비로 **할 수 있다**" | 자산 유형 제한 없음. "적은 경우" → 동률은 본문 |
| 소령 §163⑫ | "법 §97①1나목의 '…환산취득가액'이란 **§176의2②부터 ④까지**의 가액" | 위임 종착 확정 |
| 소령 §176의2②**1호** | "**법 §94①3에 따른 주식등**이나 같은 항 4호 기타자산의 경우 — 양도 실지거래가액 × (취득시 기준시가 ÷ 양도시 기준시가)" | **주식 환산 = §97①1나목 환산취득가액 명시 포함** — 판정 핵심 |
| 소령 §163⑤1호 가목 | 양도비에 "「증권거래세법」에 따라 납부한 **증권거래세**" 명시 (+나목 신고서 작성비용·다목 공증·인지·소개비) | 주식의 "나목 금액" 실재 — 단서가 공집합이 아님 |
| 소령 §163⑥4호 | "제1호 내지 제3호 외의 자산 — 취득당시의 기준시가 × 1/100" | 주식 개산공제 (기구현) |
| 소령 §163③ | 자본적지출 — 2호 소유권 쟁송 소송·화해비용은 주식에도 성립 가능 | 나목 합계의 일부 |

- 부동산 전례: `transfer-tax-helpers.ts:265-290` — `necessaryExpenseMode`·`swapApplied`·`swapComparison{estimatedSide,directSide,chosen}`, 발동 조건 "명시 입력 + directSide > estimatedSide, 동률은 본문". 주식도 동일 의미론.
- **단서의 의미**: swap 발동 시 필요경비 **전체**가 나목 금액으로 대체 — 환산취득가액 자체가 차감에서 제외됨(가목이 "환산취득가액과 개산공제의 합계액"). 양도차익 = 양도가액 − (자본적지출+양도비).

## 2. 현행 실측 (Pre-Do 기준점)

| 지점 | 실측 |
|---|---|
| 엔진 STEP 4 | `stock-transfer-tax.ts:445-465` — 환산 모드면 `expenses = estimatedDeduction` 강제, `actualExpenses` 입력 시 "무시됩니다" warning(:456-459). 주석 ":449 §97② 단서 swap은 KoreanLaw 검증 후 후속 PR 검토" — **본 PR이 그 후속** |
| 기존 anchor | `listed-estimated-conversion.test.ts` LE-7 — "환산 모드 + actualExpenses 1,000,000 → 개산공제만 + warning". directSide 1,000,000 < estimatedSide 30,300,000이라 **swap 후에도 수치 기대값 동일** (warning 문구만 정보성으로 변경 — 재anchor) |
| 입력 필드 | `actualExpenses`(기존) — **신규 입력 필드 0**. 나목은 합계 비교라 자본적지출/양도비 구분 불요. ★단, **④ api.ts:558-561 silent strip 발견**: `resolvedExpenseMode === "actual"`일 때만 body 포함 — 환산 모드에서 실비가 엔진 미도달 (5번째 차단 유형). 게이트 해제 = 본 PR 핵심 작업 |
| swap 게이트 구조 | `usedEstimatedAcquisition` 할당은 `:229`(face_value)·`:259`(estimated) **2곳뿐** — sale_case는 미설정이라 STEP 4 swap 게이트 **구조적으로 미진입** (S-5 별도 가드 불요). STEP 5(:469 인근) `transferIncome = transferPrice − acquisitionPrice − expenses` |
| UI 실비 입력 | `Step3.tsx:59-61` `isEstimatedAcquisition`(estimated·sale_case·face_value) → `expenseLocked` → `:175` 실비 입력 숨김. **환산 모드에서 실비 입력 경로 자체가 없음** — swap 비교 입력을 위해 optional 노출 필요 |
| 결과 타입 | `StockTransferResult`에 swap 필드 없음 — 신규 `swapApplied?`·`swapComparison?` (부동산 :272-281 형태 차용) |
| 다자산 | `stock-transfer-aggregate.ts` = 단건 엔진 반복 호출 — 자동 전파 |
| exempt 정보성 | `exempt-informational-acquisition.ts` — acquisitionPrice·estimatedBase echo만, 필요경비·차익 미계산 → **swap 무관 (작업 없음)** 확인 필요 1회 |
| 부수 정정 대상 | ① `MarketTypeBlock.tsx:6-10` stale 헤더 주석(B-1③ — 로드맵 "차기 아무 PR에 부수") ② `Step3.tsx:182` `placeholder="291,200"` 숫자 예시 금지 위반 |

## 3. 케이스 매트릭스 (전수)

| # | 케이스 | swap 비교 | 근거 |
|---|---|---|---|
| S-1 | estimated + 상장 종가평균 환산 | **적용** (directSide 명시 입력 + > estimatedSide 시) | §176의2②1호 |
| S-2 | estimated + 비상장 보충평가 | **적용** — 동일 환산 산식(§176의2②1호, 기준시가만 §165④) | 동상 |
| S-3 | estimated + 거래정지(양도일·취득일 C-1)·취득 후 상장(§165⑤) | **적용** — 기준시가 결정 규정만 다르고 취득가액은 환산취득가액 | 동상 |
| S-4 | face_value (장부분실 §99①4 후단) | **적용(잠정)** — 액면가=취득 기준시가로 한 §176의2②1호 환산 → 환산취득가액 해당. `usedEstimatedAcquisition=true`(`:229` 실측)로 게이트 진입 확정 — 법리 재확인 1회(R-1) | §99①4 후단 |
| S-5 | sale_case (매매사례가액) | **비적용** — 단서는 "환산취득가액으로 하는 경우" 한정 + **구조적 배제**: sale_case는 `usedEstimatedAcquisition` 미설정이라 swap 게이트 미진입 (별도 가드 불요, anchor로 고정) | §97②2호 단서 문리 + `:198/:229/:259` 실측 |
| S-6 | actual (실가) | 무관 — §97②1호 경로 (기존 동작 유지) | — |
| S-7 | directSide ≤ estimatedSide (미달·동률) | 본문 유지 — 동률은 "적은 경우" 아님. 입력 시 정보 warning(비교 결과 안내)으로 문구 교체 | 단서 문리 |
| S-8 | actualExpenses 미입력(0) | 비교 자체 미발동 — 본문 (현행과 동일, 회귀 0) | 부동산 전례 "명시 입력 시만" |
| S-9 | 비과세 2경로 | (a) 장내 비대주주 = full pipeline + zeroing → **swap 자동 반영** (LE-8 expenses echo 구조) / (b) K-OTC `buildExemptResult` = expenses 0 고정(`stock-transfer-exempt-result.ts:93`) → 무관 | 실측 |
| S-10 | 다자산 합산 | 자산별 독립 swap (단건 반복 호출 자동) | aggregate 구조 |

## 4. 엔진 설계 요약

### 4.1 결과 타입 (`types/stock-transfer.types.ts`)

```ts
/** [B-2] §97②2호 단서 swap 발동 여부 (환산 모드 한정) */
swapApplied?: boolean;
/** [B-2] swap 비교 echo */
swapComparison?: {
  /** 가목 = 환산취득가 + 개산공제 */
  estimatedSide: number;
  /** 나목 = 자본적지출 + 양도비 (actualExpenses 합계 입력) */
  directSide: number;
  chosen: "estimated" | "direct";
};
```

### 4.2 STEP 4 블록 교체 (`stock-transfer-tax.ts:445-465`)

```ts
if (usedEstimatedAcquisition && estimatedDeduction !== undefined && estimatedDeduction > 0) {
  // §97②2호 단서 — directSide는 expenseMode 무관 actualExpenses 사용
  // (④ 게이트 해제 후 환산 모드에서도 body 전송됨. sale_case는 usedEstimatedAcquisition
  //  미설정이라 본 게이트 자체 미진입 — 별도 가드 불요, 구조적 배제)
  const directSide = input.actualExpenses ?? 0;
  const estimatedSide = acquisitionPrice + estimatedDeduction;   // 가목 합계
  if (directSide > estimatedSide) {
    swapApplied = true;  // STEP 5에서 transferIncome = transferPrice − directSide
    expenses = directSide;
    appliedRules.push("§97②단서swap");
    warnings.push(법령 안내);
  } else {
    expenses = estimatedDeduction;  // 본문 (현행)
    if (directSide > 0) warnings.push(비교 결과 정보 — "무시됩니다" 문구 교체);
  }
}
```

- **양도차익 처리**: swap 시 가목(환산취득가+개산공제) 전체가 나목으로 대체 → STEP 5(`:469` 인근) 차익 산식에서 취득가액 차감 제외 — `transferIncome = swapApplied ? transferPrice − expenses : transferPrice − acquisitionPrice − expenses`. `result.acquisitionPrice`는 환산값 **정보 echo 유지**(결과 카드·명세 표시용) — 자기일관 anchor 필수 ([[feedback_engine_result_display_drift]])
- appliedRules 유니온에 `"§97②단서swap"` 추가
- face_value도 `usedEstimatedAcquisition = true`(`:229` 실측) — 게이트 진입 확정 (법리 재확인은 R-1)
- **④ api.ts:558-561 게이트 해제**: `actualExpenses`를 expenseMode 무관 항상 전송 (`parseIntOrUndef` 정의 시) — `body.expenseMode` 결정 로직은 유지

### 4.3 LE-7 호환

기대 수치 불변(directSide 1M < estimatedSide 30.3M → 본문). LE-7 단언은 `warnings.some(w => w.includes("환산취득가 모드"))` — **신규 정보 warning 문구를 "환산취득가 모드…"로 시작**시키면 LE-7 무변경 통과 (재anchor 불요). 문구 예: "환산취득가 모드 — §97②2호 단서 비교 결과 (환산취득가+개산공제)가 입력 실비보다 크므로 본문(개산공제)을 적용합니다."

## 5. UI 설계 요약 (상세는 ui.design.md)

- **Step3 실비 입력 노출 확장**: `expenseLocked`(환산·액면가) 시에도 **optional** "실제 필요경비 합계 (§97②2호 단서 비교용)" CurrencyInput 노출 — sale_case는 제외(S-5). 안내 카드에 단서 산식 설명(증빙 요건 §163⑤ 포함). placeholder 숫자 제거(부수 정정 ②와 동일 지점).
- **결과 카드**: `swapApplied` 시 비교 표(가목 vs 나목·선택 결과) + 산식 "필요경비 = 자본적지출과 양도비의 합계 (소득세법 §97②2호 단서)". RULE_BADGE에 `"§97②단서swap"` 엔트리.
- **사이드바**: `StockSidebar.tsx:206-207` expenses 계산이 `expenseMode==="actual"` 시 actualExpenses — 환산 모드 합계 표시와 swap의 상호작용 확인 (⑥).
- 부수 정정: `MarketTypeBlock.tsx:6-10` stale 주석(해외주식 기구현 반영) + `Step3.tsx:182` placeholder.

## 6. 14지점

신규 **입력** 필드 0 (actualExpenses 재사용). 변경 지점:
- **④ api.ts:558-561 silent strip 해제** (Critical — 환산 모드 실비 전송) — 본 PR의 ⑬ 등가 지점
- ⑤ Step3 optional 실비 노출 (expenseLocked 분기)
- ⑥ 사이드바 expenses 정합 확인
- ⑦ 결과 카드 swap 표 + RULE_BADGE
- ⑧ validate — 변경 없음(optional 입력·차단 없음·Zod `actualExpenses: z.number().min(0).optional()` :259 실측) 확인 명시
- ⑫⑭ — Zod 기존 optional·route 기존 매핑 grep 자가 점검

## 7. anchor (Pre-Do + 신규)

**Pre-Do**: LE-1~8 통과 고정 (특히 LE-7 현행 문구 단언 확인) — Do 진입 조건.

| # | 시나리오 | 기대값 |
|---|---|---|
| SW-1 | 환산 + 실비 미입력 | 본문 — LE-1 동일 수치·swapApplied undefined/false (S-8 회귀 0) |
| SW-2 | 환산 + 실비 31,000,000 (> 가목 30,300,000) | **swap** — transferIncome = 50,000,000−31,000,000 = 19,000,000 · swapComparison{30,300,000, 31,000,000, "direct"} · appliedRules 포함 |
| SW-3 | 실비 = 가목 동률 (30,300,000) | 본문 (동률 비발동 — "적은 경우" 문리) |
| SW-4 | 실비 1,000,000 (< 가목) | 본문 + 정보 warning (LE-7 재anchor) |
| SW-5 | sale_case + 실비 > 가목 | swap 비발동 (S-5) |
| SW-6 | face_value + 실비 > 가목 | swap (S-4 잠정 — 13단계 재확인 후 확정) |
| SW-7 | C-1 취득정지 환산 + 실비 > 가목 | swap (S-3 교차) |
| SW-8 | 다자산 — 자산 1 swap·자산 2 본문 | 자산별 독립 (S-10) |
| SW-9 | 장내 비대주주 비과세 + 실비 > 가목 | finalTax 0 + swap 정보 echo (S-9a) |

E2E 1건: 환산 모드 → 실비 입력 → 계산 → swap 결과 카드 + transferIncome 단언 (`E2E_PORT=3200`).

## 8. PR 구성·규모

단일 PR (`feat/stock-transfer-97-2-swap-b2`). 엔진 STEP4 교체 + result 2필드 + UI 2곳 + anchor 8 + E2E 1 + 부수 정정 2 (B-1③ 주석·placeholder). 규모 소~중.

## 9. 리스크·결정 대기

| # | 항목 | 대응 |
|---|---|---|
| R-1 | face_value 모드 단서 해당 여부 (S-4) | 잠정 적용 — 13단계에서 §99①4 후단↔§176의2② 관계 재확인. 비적용 결론 시 swapEligible에서 제외(1줄) |
| R-2 | "할 수 있다"(선택) → 자동 큰 쪽 적용 | 부동산 전례 동일 — 납세자 유리 선택이 산식에 내장. 결과 카드에 "단서 적용" 명시로 중립 표현 유지 |
| R-3 | swap 시 acquisitionPrice echo 유지 vs 차익 분리 | engine.design에서 변수 분리 설계 + 자기일관 anchor ([[feedback_engine_result_display_drift]]) |
| R-4 | 환산 모드 실비 입력 노출이 기존 사용자 흐름 변화 | optional·기본 빈값 — 미입력 시 현행과 완전 동일 (S-8) |
