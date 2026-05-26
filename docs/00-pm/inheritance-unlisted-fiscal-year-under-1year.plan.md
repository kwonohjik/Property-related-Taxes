# 비상장주식 순손익가치 — 1년 미만 사업연도 연환산 (§17의3②) 작업계획서

> 작성일: 2026-05-26
> 선행: `a3f9e19`(§17의3⑤ 환산주식수 충실 재구현)의 **명시 후속** — `project_unlisted_share_conversion_17_3_5` "§17의3② 1년 미만 사업연도 미구현(capital-increase-adjustment.ts 12개월 하드코딩)"
> 관련 메모리: `project_unlisted_share_conversion_17_3_5` · `feedback_numeric_impact_verify_before_bug_claim` · `feedback_pre_anchor_verification` · `feedback_korean_law_82_vs_81_2_drift`
> 적용 스킬: `korean-law-citation-verify` · `pre-do-anchor-verification` · `echo-field-pattern` · `tax-field-add` · `bigint-round-half-up`
>
> **✅ 법령 검증 1차 (2026-05-26, KoreanLaw MCP)**: 상증규 §17의3② 본문 — "영 §56① 계산식에 따라 1주당 최근 3년간 순손익액 **가중평균액을 계산할 때 사업연도가 1년 미만인 경우에는 1년으로 계산한 가액으로 한다**" (시행규칙 MST 284609, 시행 2026.03.20). 정식평가 V2(`evaluateUnlistedStockV2`) 전용 — 간편평가 V1엔 사업연도 기간 입력 없음.
> - **§56 본문 순서 확정 (P-1)**: §56④(순손익액) → **§56⑤(유상증자·감자 조정, 그 사업연도 월할 "1개월 미만 1개월")** → §56①(1주당 가중평균). **§17의3②은 §56①(가중평균) 단계 보정** → **연환산은 유상증자 조정 후·가중평균 직전(`perShareNetIncomes` 환산)** 에 적용. STEP1.5(조정 전 순손익액) 환산은 오류.
> - **개월수 (P-2)**: `differenceInCalendarMonths(end, start) + 1` (capital-increase `monthsWithMinOne`과 동일 방식, 7/1~12/31=6). **§17의3②은 §56⑤의 "1개월 미만 1개월" 절상 규정 없음** — 환산용 개월수는 절상 미적용(Phase0 재확인).

---

## 0. 배경 — 1년 미만 사업연도가 발생하는 경우

- **신설법인 첫 사업연도**: 설립일~결산일 (예: 2023.7.1. 설립, 12월 결산 → 첫 사업연도 6개월)
- **결산기 변경**: 사업연도 변경 등기로 특정 사업연도가 1년 미만
- **해산·청산 직전**: (평가 대상으로는 드묾)

§17의3②: 이런 1년 미만 사업연도의 순손익액을 **1년치로 환산**하여 가중평균에 반영. 환산하지 않으면 단기 사업연도 순손익이 과소·과대 평가되어 1주당 순손익가치(§56①)가 왜곡됨.

---

## 1. 현행 코드 흐름 (검증 완료, 2026-05-26)

| 위치 | 내용 | 1년 미만 처리 |
|---|---|---|
| `fiscal-year-net-income.ts` `calcFiscalYearNetIncome` | 사업연도별 순손익액 = ① + 가산 − 차감 (§56④) | **연환산 없음** |
| `unlisted-orchestrator.ts` STEP1→STEP5 | adjustedIncomes → 1주당 → `calcWeightedAvg3y`(§56① 3:2:1 가중평균) | **환산 미적용** |
| `capital-increase-adjustment.ts:68-69` | 사업연도 시작일 = `fiscalYearEndDate − 1년 + 1일` (**12개월 하드코딩**) | 1년 미만이면 시작일·월할 분모 부정확 |
| `FiscalYearAdjustment` 타입 | `fiscalYearEndDate`만 보유 | **사업연도 기간(시작일/개월수) 없음** |

> **2지점 영향**: (a) **§56① 가중평균** — 1년 미만 순손익액 연환산 미적용 (b) **§56⑤ 유상증자·감자 월할** — 사업연도 분모를 12개월로 가정.

---

## 2. 법령 정밀 검증 (Phase 0 — Do 전 필수)

§17의3②은 "1년으로 계산"만 명시하고 **환산 방법(월할/일할)·1개월 미만 처리**는 미규정. Phase 0에서 KoreanLaw로 확정:

| 확인 항목 | 1차 추정 | Phase 0 검증 |
|---|---|---|
| 환산 단위 | 월할 (순손익액 × 12 / 사업연도 개월수) | §56① 본문 + 국세청 해석례 (일할 여부) |
| 1개월 미만 처리 | §56⑤은 "1개월 미만 1개월"이나 §17의3②엔 미규정 → 월수 절상 여부 | 해석례 확인. 미발견 시 **본칙(개월수 그대로) 적용·추정 인용 금지** |
| 가중평균 적용 단위 | 순손익액 환산 후 1주당 → 가중평균 (= 1주당 순손익액 환산과 동치) | 산식 위치 확정 |

> `feedback_korean_law_82_vs_81_2_drift`: 환산 방법 해석례 미발견 시 추정 인용하지 말고 본칙(월할·절상 없음)만 적용, 계획에 "해석례 미발견" 명시.

---

## 3. 설계

### 3-1. 입력 모델 (FiscalYearAdjustment 확장)

```ts
// types/unlisted-stock-valuation.types.ts — FiscalYearAdjustment
fiscalYearStartDate?: Date;   // 사업연도 개시일 (미입력 시 종료일−1년+1일 = 12개월 가정, 회귀 0)
```

- **단일 진실**: 시작일 1필드만 추가. 개월수는 `start~end`로 derive (capital-increase의 12개월 하드코딩도 이 값 사용).
- 미입력(undefined) → 현행과 동일(12개월) → **회귀 0 보장**.

### 3-2. §17의3② 연환산 헬퍼 (신규 `fiscal-year-annualize.ts`)

```ts
// 사업연도 개월수 < 12 → 1주당 순손익액 1년 환산 (§17의3② — §56① 가중평균 단계 보정)
export function annualizePerShareNetIncome(perShare: number, startDate?: Date, endDate?: Date): number {
  const months = fiscalYearMonths(startDate, endDate); // 미입력 시 12
  if (months >= 12 || months <= 0) return perShare;    // 1년 이상·불명 → 무변환
  return safeMultiplyThenDivide(perShare, 12, months); // ×12/months (음수=결손도 동일 환산, P-3)
}
// 개월수 = differenceInCalendarMonths(end,start)+1 (P-2). §17의3②은 §56⑤ "1개월 미만 1개월" 절상 없음.
export function fiscalYearMonths(startDate?: Date, endDate?: Date): number // 미입력 시 12
```

- **음수 환산 (P-3)**: 결손 사업연도도 ×12/months 동일 적용 (환산이 결손 확대 → 이후 §56① 가중평균 음수 시 0).
- `bigint-round-half-up`: `safeMultiplyThenDivide`(BigInt)로 대용량 정밀도. PDF ±1원 trade-off.

### 3-3. orchestrator 통합 — 1주당 산출 후·가중평균 직전 (R3-1, P-1)

법령 순서(§56④ STEP1 → §56⑤ STEP2 → §17의3⑤ 환산주식수 STEP4 → 1주당 STEP5 → **§17의3② 연환산** → §56① 아.가중평균) 준수.
현행 `unlisted-orchestrator.ts` line 96-103 사이에 삽입:
```ts
// STEP5: 사.1주당 순손익액 (현행 line 96-100) — finalNetIncomes / convertedShares
const perShareNetIncomes = [...];
// §17의3② 1년 미만 연환산 (신규 — 가중평균 직전)
const annualizedPerShare = perShareNetIncomes.map((ps, i) =>
  annualizePerShareNetIncome(ps, input.fiscalYears[i].fiscalYearStartDate, input.fiscalYears[i].fiscalYearEndDate));
// 아.가중평균 (현행 line 103)
const weightedNetIncomePerShare = calcWeightedAvg3y(annualizedPerShare);
```
- STEP1.5(조정 전 순손익액 환산) **금지** — 유상증자 조정(§56⑤)이 환산 전 순손익액 기준이므로.
- `annualizationApplied[i] = fiscalYearMonths(start,end) < 12` echo로 함께 산출.

### 3-4. capital-increase-adjustment 정합 (P-4)

`fiscalYearStartDate` 입력 시 그 값 사용(현행 `−1년` 하드코딩 대체). 미입력 시 현행 fallback.
- **개월수 헬퍼 공유 (R3-2)**: `fiscalYearMonths`(annualize 모듈)와 capital-increase `monthsWithMinOne`은 둘 다 `differenceInCalendarMonths(end,start)+1` 기반. **§56⑤은 "1개월 미만 1개월" 절상(`Math.max(...,1)`) / §17의3② 환산은 절상 없음**. single-source 시 `monthsBetween(start, end, { floorToOne = true })` — **default true로 기존 capital-increase 호출 무변경 보존**, annualize는 `floorToOne:false` 명시.

### 3-5. 결과 echo (`echo-field-pattern`)

`UnlistedStockValuationResult`에 사업연도별 `annualizationApplied?: boolean[]` + `annualizedNetIncome?: number[]` echo — besshi 6쪽 표시·검증용. **가중평균 산식 외 결과 불변 검증**.

---

## 4. 케이스 인벤토리 (Do 진입 전 행≥1 필수)

| ID | 시나리오 | 입력 | 기대 |
|---|---|---|---|
| **FY-1** | 12개월 (현행 회귀) | `fiscalYearStartDate` 미입력 | 환산 0, PDF 사례1 회귀 0 |
| **FY-2** | 신설 6개월 | 1년전 사업연도 start 2023-07-01·end 2023-12-31, 순손익 6천만 | 연환산 ×2 = 1.2억 가중평균 반영 |
| **FY-3** | 결산기변경 9개월 | 순손익 9천만, 9개월 | ×12/9 = 1.2억 |
| **FY-4** | 1개월 미만 경계 | start·end 동월 | Phase0 확정 규칙대로 (절상 여부) |
| **FY-5** | 1년(12개월)·1년 초과(결산기변경 13개월·윤년 366일) | 1/1~12/31 또는 13개월 | 무변환 (`months≥12`, R3-3) |
| **FY-6** | 연환산 + 유상증자 병존 | FY-2 + 해당 사업연도 유상증자 | §56⑤ 조정(환산 전 순손익) 후 1주당 산출 → 연환산(가중평균 직전) 순서 정합 (P-1) |
| **FY-7** | echo 표시 | FY-2 | `annualizationApplied[0]=true`, besshi 6쪽 환산 표시 |
| **FY-8** | 결손 1년 미만 (P-3) | 6개월 순손익 −6천만 | 환산 −1.2억 (결손 확대) → 가중평균 단계 음수→0 가드 |
| **FY-9** | 개월수 경계 (P-2) | start 2023-07-01·end 2023-12-31 | `fiscalYearMonths`=6 (differenceInCalendarMonths 5 + 1) |

---

## 5. Pre-Do anchor (`pre-do-anchor-verification`)

| anchor | 입력 | 기대 | 현행 예상 | 용도 |
|---|---|---|---|---|
| **AN-1** | FY-2 (6개월, evaluateUnlistedStockV2 통합) | 가중평균에 연환산(×2) 반영 | 현행 미환산 → **실패** | §17의3② 미구현 실증 |
| **AN-2** | FY-1 (12개월/미입력) | 환산 0, PDF 사례1 회귀 | 현행 일치(통과) | 회귀 가드 |
| **AN-3** | `fiscalYearMonths`·`annualizePerShareNetIncome` 단위 | months: 6개월=6/미입력=12, 환산: perShare×12/6 | 헬퍼 미구현 → 실패 | 헬퍼 실증 |

AN-1·AN-3 실패 확보 후 구현.

---

## 6. 작업 분해 (PR 단위)

### Phase 0 — 법령 정밀 검증
- KoreanLaw §56①·§17의3② 환산 방법(월할/일할)·1개월 미만 처리 확정. 해석례 미발견 시 본칙 명시.

### Phase A — 엔진
- **PR-A1**: Pre-Do AN-1·AN-3 작성 → 실패 확보
- **PR-A2** (타입): `FiscalYearAdjustment.fiscalYearStartDate?` + Result echo 2필드
- **PR-A3** (엔진): `fiscal-year-annualize.ts` 신규(`annualizePerShareNetIncome`·`fiscalYearMonths`). orchestrator **STEP5 직전**(가중평균 직전, 유상증자 조정 후) 통합. capital-increase 개월수 헬퍼 정합(절상 옵션)
- **PR-A4**: FY-1~FY-9 anchor 통과 (FY-1 회귀 0 최우선, FY-8 결손·FY-9 경계 포함)

### Phase B — UI (V2 정식평가 전용)
- **PR-B1** (⑤): `FiscalYearAdjustmentTable.tsx`(사업연도 순손익 입력, 현행 종료일 DateInput line 120-139 옆)에 **개시일 DateInput**(`fiscalYearStartDate`) 추가. 미입력 시 12개월 안내. (자본변동 `CapitalChangeTable`과 별개)
- **PR-B2** (⑦): **`Page6NetIncomeBreakdown` 사·아 항목 또는 `PerShareValuationResultCard`**(실제 1주당/가중평균 표시 위치)에 연환산 표시(1주당 순손익 → ×12/N → 환산). echo 활용
- **PR-B3** (⑧): validate — 개시일 > 종료일 차단, 1년 미만 안내
- **PR-B4**: FY-7 echo 표시 anchor + Playwright(개시일 입력 → 환산 표시)

---

## 7. 동기화 지점 (`tax-field-add` — V2 입력 경로)

| # | 지점 | 작업 |
|---|---|---|
| ① 폼 | `unlisted-stock-v2` FiscalYear 폼 상태 | fiscalYearStartDate |
| ② initial | 동상 | undefined (12개월) |
| ③ normalize | 동상 | optional |
| ④ API | flat-adapter / V2 입력 변환 | startDate 매핑 |
| ⑤ UI | `FiscalYearAdjustmentTable.tsx` (사업연도 순손익 입력) | 개시일 DateInput |
| ⑥ 사이드바 | (해당 없음 — V2 평가는 자산 카드 내부) | — |
| ⑦ 결과 | besshi Page6 환산 표시 | echo |
| ⑧ validate | unlisted-stock-valuation-v2.schema + UI validate | 개시일>종료일 차단 |

> ⑫⑬⑭: V2 Zod 스키마(`unlisted-stock-valuation-v2.schema.ts`)에 fiscalYearStartDate 추가 grep 점검 (Date 직렬화 — `coerceDates`/`toOptionalDate`).

---

## 8. 위험·정책

| 위험 | 대응 |
|---|---|
| 미입력 시 회귀 | `fiscalYearStartDate` undefined → 12개월 fallback. FY-1·AN-2 회귀 0 anchor 강제 |
| 환산 방법 추정 인용 | Phase 0 KoreanLaw 확정. 해석례 미발견 시 본칙(월할·절상 없음) 명시 (`feedback_korean_law_82_vs_81_2_drift`) |
| 환산 순서(유상증자 전/후) | §56 본문 순서 Phase0 확인. 1차 = 가중평균 직전 (§17의3② "가중평균 계산할 때") |
| 대용량 정밀도 | `safeMultiplyThenDivide`(BigInt) 검토. PDF ±1원 trade-off |
| numeric 영향 과대주장 | 12개월(대부분 케이스) 무변동 정상 — 1년 미만 트리거 입력 anchor로 실증 (`feedback_numeric_impact_verify_before_bug_claim`) |

## 9. 완료 기준

- [ ] Phase 0 KoreanLaw §56①·§17의3② 환산방법 확정
- [ ] AN-1·AN-3 Pre-Do 실패 확보 → 구현 후 통과
- [ ] FY-1~FY-7 anchor 전수 통과 (FY-1 12개월 회귀 0)
- [ ] `fiscalYearStartDate` 미입력 시 현행 무변동 (PDF 사례1 7 anchor 회귀)
- [ ] besshi 6쪽 연환산 표시 + echo
- [ ] 8지점 동기화 (⑫⑬⑭ V2 Zod grep)
- [ ] `npx tsc --noEmit` 0건 / 전체 `npm test` 회귀 0
- [ ] Playwright E2E (사업연도 개시일 입력 → 환산 표시) — `feedback_browser_verify_with_playwright`
