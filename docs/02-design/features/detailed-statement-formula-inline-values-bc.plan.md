# 수정 계획서(후속) — 상세명세서 산식 값 인라인 B·C군

> 작성일 2026-07-27 · 세목: 양도소득세(계산결과 상세명세서) · 유형: 표시 개선
> 선행: `detailed-statement-formula-inline-values.plan.md`(A1~A5 완료 PR #819)
> 표준: memory `feedback_result_view_korean_formula`·`feedback_detailed_statement_formula_sync`

A군(상시 표시 산술 5종)은 완료. 본 계획은 잔여 **B(날짜·기간 행)**·**C(엔진 step 부재 시 fallback 라벨)**를 다룬다. 행 번호는 PR #819 반영 후 **현행 실측**(2026-07-27).

## B. 날짜·기간 행 — 값 인라인

값 칸에는 이미 기간/날짜가 있으나 산식은 서술만. 가독성 향상 목적.

| # | 파일:행 | 항목 | 현재 formula | 개선안 | 사용 값 |
|---|---|---|---|---|---|
| B1 | Helpers:163 | 보유기간 | `양도일 − 취득일 (월 단위 절사)` | `양도일 {transferDate} − 취득일 {displayAcqDate} = {기간}` | `transferDate`·`displayAcqDate`(scope 內)·value(기간 문자열) |
| B2 | Helpers:213 | 거주기간 | `거주 기간 합산 (월 단위)` | interval 모드: `{구간1}+{구간2}… = {합산}`, months 모드: `{개월}개월` | `periods[]`·`residenceMs`(scope 內) |
| B3 | Helpers:201/207 | 퇴거일·입주일 | `마지막 거주기간 종료일`/`최초 거주 시작일` | (선택) 날짜값 자체가 value 칸에 있음 — 서술 유지 가능 | — |

- **집계(다건)**: 보유기간은 `perAsset[]`에 자산별 기간이 이미 있음 → 상단 formula는 대표(primary) 기준 or 서술 유지 판단.
- **주의**: 값이 "기간 문자열"이라 A군(금액)과 달리 우측 칸 표시가 이미 충분 → **우선순위 낮음**.

## C. Fallback 라벨 (엔진 step 부재 시에만 노출)

`formula: step?.formula ?? "<fallback>"` 패턴. 평상시 엔진 step(`result.steps`)이 **값 인라인 산식**을 제공하고, fallback(라벨만)은 **step 부재 edge에서만** 노출된다. 따라서 C는 "방어적 완결"로 사용자 노출 빈도가 낮다.

### C-1. 순수 라벨-only fallback (값 없음)

| # | 파일:행 | 항목 | fallback(라벨만) | step label |
|---|---|---|---|---|
| C1 | Helpers:549 | 양도소득금액 | `과세대상 양도차익 − 장기보유특별공제 (음수 시 0)` | "양도소득금액" |
| C2 | Helpers:569 | 비과세 양도소득금액 | `§95① 양도소득금액 − 과세대상 양도소득금액 — §155⑳ + §161 안분 …` | "비과세 양도소득금액" |
| C3 | Helpers:660 | 기본공제 | `연 250만원 한도 (§103) — 자산별 배분 후 합계` | "기본공제" |
| C4 | Helpers:678 | 과세표준 | `양도소득금액 − 기본공제` | "과세표준" |
| C5 | Helpers:705 | 감면세액 | `감면 적용 양도소득금액 비율 × 산출세액 (§127⑦ 중복배제)` | "감면세액" |
| C6 | Helpers:724 | 결정세액 | `산출세액 − 감면세액 (원 미만 절사)` | "결정세액" |
| C7 | Builders:464 | 양도차손 통산(다건) | `그룹 내 통산 + 타군 pro-rata 안분 …` | "양도차손 통산" |
| C8 | Builders:478 | 기본공제 배분(다건) | `연 250만원 한도 자산별 배분 (MAX_BENEFIT …)` | "기본공제" |
| C9 | Builders:492 | 비교과세(다건) | `MAX(세율군별 합산세액, 전체누진세액) …` | "비교과세" |

### C-2. 부분 값 fallback (rate만·금액 결여 — 경미)

| # | 파일:행 | 항목 | 현재 fallback |
|---|---|---|---|
| C10 | Helpers:402 | 장기보유특별공제(non-mu) | `과세대상 양도차익 × {rate}% (보유 + 거주)` (금액 없음) |
| C11 | Helpers:687 | 산출세액 | `과세표준 × 세율({rate}) − 누진공제 {값}` (과세표준·결과 금액 없음) |

### 제외 (이미 값 인라인 fallback)

- Helpers:522/534 보유·거주 기간분 장특 → `lthHoldingFallbackFormula`/`lthResidenceFallbackFormula`(460-469)가 **금액 인라인**(totalLth·lthSplit) — 수정 불요.
- Helpers:752 가산세액 → `penaltyParts.join`(값 인라인) / "가산세 없음"(0건 서술) — 수정 불요.

## 수정 방안

**핵심 판단: fallback 도달 가능성 먼저 확인.** step이 항상 emit되면 fallback은 dead code → 값 인라인 개선이 무의미하고 오히려 유지비만 증가.

### Step 1 (Pre-Do probe) — fallback 도달성 실측 (필수)

각 항목의 엔진 step이 `result.steps`에 **항상 존재하는지** throwaway probe로 확인:
- 존재 항상 O → 해당 fallback은 **dead** → 값 인라인 대신 **간결 서술 유지**(또는 주석으로 dead 명시). 개선 비대상.
- 조건부 부재 가능(예: 감면세액 step은 감면 無 시 미emit / 비과세 step은 §161 無 시 미emit) → fallback **실제 노출** → 값 인라인 개선 대상.

> 근거: memory `feedback_pre_anchor_verification` — "현행 엔진 일치 예상" 가정 금지. probe로 각 step emit 여부 실측 후 대상 확정.

### Step 2 — 도달 fallback만 값 인라인

도달 확정된 fallback에 result 필드 값 인라인:
- C1 양도소득금액: `과세대상 양도차익 {result.taxableGain} − 장특 {result.longTermHoldingDeduction} = {value}`
- C2 비과세: `{result.nontaxableGainAmount}` (§161 안분액) 인라인
- C3/C8 기본공제: `{result.basicDeduction}` 인라인
- C4 과세표준: `양도소득금액 {income} − 기본공제 {result.basicDeduction} = {result.taxBase}`
- C5 감면세액: `{result.reductionAmount}` 인라인 (비율×산출세액 서술 유지)
- C6 결정세액: `산출세액 {result.calculatedTax} − 감면세액 {result.reductionAmount} = {result.determinedTax}`
- C10/C11: 금액 인라인(과세표준·산출세액 결과)
- C7/C9(다건 summaryOnly): step.amount 값 인라인

> **주의(집계)**: C7~C9는 다건 전용 + `summaryOnly`. step 부재 시 값 자체 재구성이 필요할 수 있어 도달 확정 시에만.

## 영향 파일

| 파일 | 대상 |
|---|---|
| `DetailedStatementHelpers.ts` | B1:163·B2:213 / C1:549·C2:569·C3:660·C4:678·C5:705·C6:724·C10:402·C11:687 |
| `DetailedStatementFormulaBuilders.ts` | C7:464·C8:478·C9:492 |

## 검증 (성공 기준)

1. **Pre-Do probe**: 각 step emit 여부 실측표 → 개선 대상 fallback 확정(dead 제외).
2. **anchor**: B1·B2 값 인라인 단언(날짜·기간 문자열 포함). 도달 확정 C 항목은 step 미emit 상황을 강제한 result로 fallback formula 값 인라인 단언.
3. 32항목 합계·라벨 불변(회귀 0). `npx tsc --noEmit` 0 · 관련 vitest GREEN · eslint 0.

## 범위·권장

- **권장 우선순위**: B1·B2(상시 노출·확정 개선) > C(도달 확정분만). dead fallback은 개선 대상 제외(서술 유지).
- 타 세목 상세명세서 동종 감사는 별도(요청 시).

## C probe 실측 결과 (2026-07-27 · 확정)

**dynamic probe**(`__tests__/components/calc/detailed-statement-fallback-dead.anchor.test.ts`, 9/9 pass) — 실엔진 `calculateTransferTax`(과세 시나리오) 결과 검증:

- **C1·C3·C4·C5·C6·C10·C11 (단건)**: 엔진이 양도소득금액·기본공제·과세표준·산출세액·감면세액·결정세액·장기보유특별공제 step을 **모두 값-인라인 formula와 함께 emit**. `findStepByLabel`은 substring 매칭 → Helpers fallback(`?? "라벨만"`)은 **절대 도달하지 않음(dead)**.
- **C2 (비과세 양도소득금액)**: 엔진 step은 임대주택 특례(§161①, nontaxableGainAmount>0) 시에만 emit되나 라벨 `"비과세 양도소득금액 (소령 §161①)"` + 값-인라인 formula(`transfer-tax-rental-housing-step.ts:144`). substring 매칭됨. 비-RH는 step 부재+행 "특례 시만 표시"라 무영향.
- **C7·C8·C9 (집계)**: 엔진 집계 step(`transfer-tax-aggregate.ts:250·275·294`)이 값-인라인 formula 보유(정적 확인) → fallback dead.

**결론: C군 fallback은 dead code** — 실제 사용자 화면엔 이미 엔진 값-인라인 산식이 표시됨(A·B와 달리 버그 아님). **production 코드 변경 없음.** fallback은 방어적으로 유지하고, 위 anchor로 "엔진이 값-인라인 formula를 항상 제공" 불변식을 고정(엔진 regress 시 회귀 검출).
