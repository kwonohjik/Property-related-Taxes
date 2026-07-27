# 수정 계획서 — 상세명세서 산식 "라벨만/값 없음" 항목 값 인라인화

> 작성일 2026-07-27 · 세목: 양도소득세(계산결과 상세명세서) · 유형: 표시 결함
> 표준: 결과 산식은 한국어 풀어쓰기 + **실제 변수값 인라인**(memory `feedback_result_view_korean_formula`·`feedback_detailed_statement_formula_sync` · skill `formula-display-builder`)

## 1. 증상 (사용자 보고)

계산결과 상세명세서에서 일부 항목의 산식이 **변수값 없이 라벨만** 표시된다.
- 예: `감면후 소득금액` → `"양도소득금액 − 소득금액 감면대상 (§90② 소득금액차감)"` (값 235,201,405이 우측 값 칸에만 있고, 산식에 415,118,683 − 179,917,278 = 235,201,405 인라인 없음).

## 2. 전수 조사 결과

대상: `DetailedStatementHelpers.ts`(32항목 본체) + `DetailedStatementFormulaBuilders.ts`(부가세·지방세·집계). `StatementItem.formula`는 ReactNode 지원(값 인라인 가능, obs 15990).

### A. 단건 상시 표시 — 산식인데 라벨만 (명확 버그, 수정 대상)

| # | 파일:행 | 항목 | 현재 formula(라벨만) | 사용 가능 값 |
|---|---|---|---|---|
| A1 | Helpers:635 | **감면후 소득금액** | `양도소득금액 − 소득금액 감면대상 (§90② 소득금액차감)` | `singleIncome` − `singleIncomeDeduction` = value ★보고 |
| A2 | Helpers:594 | **세액감면대상금액**(단건) | `감면 적용 대상 양도소득금액 (§90① 세액감면방식 …)` | value(=reductionEligibleIncome). 집계는 perAsset 인라인 有 |
| A3 | Helpers:760 | **총결정세액** | `결정세액 + 가산세액` | `result.determinedTax` + `totalPenalty` = value |
| A4 | Builders:511 | **농어촌특별세** | `(감면 전 산출세액 − 감면 후 산출세액) × 20% — §99의3 등 …` | value(=ruralSurtax). 감면세액×20% 인라인 가능 |
| A5 | Builders:536 | **지방세 결정세액** | `지방소득세 산출세액 − 지방세 감면세액 (원 미만 절사)` | 지방산출세액 − 지방감면(0) = value |

### B. 날짜·기간 행 — 값은 우측 칸, 산식은 서술 (선택적 개선)

| # | 파일:행 | 항목 | 현재 | 개선안 |
|---|---|---|---|---|
| B1 | Helpers:163 | 보유기간 | `양도일 − 취득일 (월 단위 절사)` | `양도일 {transferDate} − 취득일 {acqDate} = {기간}` |
| B2 | Helpers:213 | 거주기간 | `거주 기간 합산 (월 단위)` | interval 모드 시 구간 합산 인라인 |

> B는 값이 "기간"(문자열)이라 우측 칸에 이미 표시됨. 날짜 인라인은 가독성 개선(우선순위 낮음).

### C. Fallback-only 라벨 (엔진 step 부재 시에만 라벨만 — 방어적, 2차)

`step?.formula ?? "라벨만"` 패턴 — 엔진이 step을 emit하면 **값 인라인**되고, fallback(라벨만)은 step 부재 edge에서만 노출:
- Helpers: :310(양도차익)·:550(양도소득금액)·:570(비과세)·:653(기본공제)·:698(감면세액)·:717(결정세액)
- Builders: :464(양도차손 통산)·:478(기본공제 배분)·:492(비교과세)

→ 대부분 정상(step 값 인라인). fallback 문자열도 값 인라인으로 개선하면 방어적으로 완결(선택).

### D. 설명형(비-arithmetic) — 수정 불요

`:136`(취득일 source)·`:201/:207`(퇴거·입주일=날짜)·`:529`(지방세 감면 미구현)·`:643`(기신고 0·summaryOnly)·`:746`("가산세 없음")·Builders:522(지방소득세 산출세액 — 이미 값 인라인 有).

## 3. 수정 방안

`StatementItem.formula`(ReactNode)에 **실제 값 인라인**. A1~A5는 상시 표시라 최우선. 기존 값-인라인 행(예: Helpers:501·:682·Builders:522)의 표기 스타일에 맞춘다.

- **표기 형식**: `항목명A {값A.toLocaleString()} − 항목명B {값B.toLocaleString()} = {결과.toLocaleString()}` (소액 산술은 plain 템플릿, 분수/안분은 `formula-display-builder`의 Frac/FLine 재사용).
- **"원" 접미**: 주변 관행 따름(현재 파일은 일부 `…원` 사용). memory `feedback_no_won_suffix`는 값 **칸**에 적용 — 산식 프로즈는 기존 스타일 유지(불일치 시 Do에서 통일 판단).
- **A2**: 단건 분기에만 값 인라인 추가(`= {value}`), 집계 perAsset은 이미 인라인이라 무변경.
- **A4/A5(Builders)**: `result.determinedTax`·`totalPenalty`·지방산출세액 등 이미 함수 스코프에 있는 값 사용.
- **집계 모드**: A1(감면후 소득금액)·A3(총결정세액)은 집계 시 합계값으로 동일 인라인.

### 값 출처 (검증 완료 — 함수 스코프 내 존재)

| 항목 | 값 표현식 |
|---|---|
| A1 | `singleIncome`(545) − `singleIncomeDeduction`(611) (집계: sumIncome − aggIncomeDeductionReducible) |
| A2 | `reductionEligibleIncome(result.reductionTypeApplied, singleIncome, …)` (=value) |
| A3 | `result.determinedTax` + `totalPenalty`(729) |
| A4 | ruralSurtax(=item value) — 감면세액 × 20% |
| A5 | 지방소득세 산출세액(`(determinedTax+totalPenalty)×10%` floor) − 0 |

## 4. 영향 파일

| 파일 | 행 |
|---|---|
| `components/calc/results/transfer/DetailedStatementHelpers.ts` | 635(A1)·594(A2)·760(A3) [+ B1:163·B2:213 선택] |
| `components/calc/results/transfer/DetailedStatementFormulaBuilders.ts` | 511(A4)·536(A5) [+ C fallback 선택] |

## 5. 검증 (성공 기준)

1. **anchor**: 기존 32항목 상세명세서 테스트(`__tests__/components/calc/DetailedCalculationStatementCard.test.tsx`·`detailed-statement-993-income-deduction.anchor.test.ts`)에 A1~A5의 formula가 **값 문자열 포함**을 단언(예: `getByText(/415,118,683.*−.*179,917,278.*=.*235,201,405/)` 유형)하도록 추가/갱신.
2. 32항목 합계값·라벨 불변(회귀 0).
3. `npx tsc --noEmit` 0 · 관련 vitest GREEN.
4. 브라우저 수동 확인: §99의3 케이스에서 감면후 소득금액·총결정세액·농특세 산식에 값 인라인 표시.

## 6. 범위·미결

- **범위**: 본 계획은 **양도세 상세명세서** 한정(사용자 보고 지점). 타 세목(상속·증여·재산·종부·취득·주식) 상세명세서의 동종 라벨-only 산식은 **별도 감사** 대상(요청 시 확장).
- **미결(Do 진입 시 결정)**: B(날짜 인라인)·C(fallback 값 인라인)를 이번 범위에 포함할지 — **권장: A(A1~A5)만 우선 수정**, B·C는 선택(후속).
