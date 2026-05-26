# 비상장주식 1년 미만 사업연도 연환산 (§17의3②) — 설계 문서

> 작성일: 2026-05-26
> 계획서: `docs/00-pm/inheritance-unlisted-fiscal-year-under-1year.plan.md`
> 법령 검증: ✅ 상증규 §17의3② / 상증령 §56①④⑤ (KoreanLaw MCP 2026-05-26)
> 적용 스킬: `korean-law-citation-verify` · `echo-field-pattern` · `bigint-round-half-up` · `tax-field-add` · `pre-do-anchor-verification`

---

## §0. 범위·법령 순서

정식평가 V2(`evaluateUnlistedStockV2`) 전용. §17의3②: 1주당 순손익액 가중평균(§56①) 계산 시 **사업연도가 1년 미만이면 1년으로 환산**.

**적용 순서 (확정)**: §56④(순손익액) → §56⑤(유상증자·감자 조정) → §17의3⑤(환산주식수) → 1주당 → **§17의3② 연환산** → §56① 가중평균. 즉 연환산은 **1주당 산출 후·가중평균 직전**.

---

## §1. 데이터 모델

### 1-1. 입력 (`FiscalYearAdjustment` 확장)

```ts
// types/unlisted-stock-valuation.types.ts
fiscalYearStartDate?: Date;  // 사업연도 개시일. 미입력 시 fiscalYearEndDate−1년+1일(=12개월) → 회귀 0
```

`fiscalYearEndDate`는 기존 보유. 개월수 = `monthsBetween(start, end)` derive.

### 1-2. 결과 echo (`UnlistedStockValuationResult`)

```ts
annualizationApplied?: boolean[];    // [1년전,2년전,3년전] 각 사업연도 연환산 적용 여부 (months<12)
annualizedPerShareNetIncome?: number[]; // 환산 후 1주당 순손익액 (besshi 6쪽 표시·검증)
```

`echo-field-pattern`: 가중평균 산식 외 결과 불변.

---

## §2. 엔진 설계

### 2-1. 신규 `fiscal-year-annualize.ts`

```ts
import { differenceInCalendarMonths } from "date-fns";
import { safeMultiplyThenDivide } from "@/lib/tax-engine/tax-utils"; // 내부 floor (converted-shares와 동일)

// 사업연도 개월수. floorToOne: §56⑤ "1개월 미만 1개월" 절상(default true, capital-increase 호환)
//                          §17의3② 환산은 floorToOne:false (절상 없음 — ⚠️ Phase0 KoreanLaw 확정 전 잠정)
export function monthsBetween(start: Date, end: Date, opts: { floorToOne?: boolean } = {}): number {
  if (end < start) return 0;
  const m = differenceInCalendarMonths(end, start) + 1; // 7/1~12/31 = 5+1 = 6
  return opts.floorToOne === false ? m : Math.max(m, 1);
}

// 사업연도 개월수(미입력 시 12). §17의3② 환산용 — 절상 없음
export function fiscalYearMonths(startDate?: Date, endDate?: Date): number {
  if (!startDate || !endDate) return 12;
  return monthsBetween(startDate, endDate, { floorToOne: false });
}

// §17의3② 1주당 순손익액 1년 환산 (음수=결손도 동일)
export function annualizePerShareNetIncome(perShare: number, startDate?: Date, endDate?: Date): number {
  const months = fiscalYearMonths(startDate, endDate);
  if (months >= 12 || months <= 0) return perShare;  // 1년 이상·불명 → 무변환
  return safeMultiplyThenDivide(perShare, 12, months); // ×12/months, BigInt 정밀
}
```

### 2-2. orchestrator 통합 (`unlisted-orchestrator.ts` line 96-103)

```ts
const perShareNetIncomes = [...];  // STEP5 사.1주당 (현행 line 96-100)
const annualizedPerShare = perShareNetIncomes.map((ps, i) =>
  annualizePerShareNetIncome(ps, input.fiscalYears[i].fiscalYearStartDate, input.fiscalYears[i].fiscalYearEndDate));
const weightedNetIncomePerShare = calcWeightedAvg3y(annualizedPerShare); // 아 (현행 line 103)
// echo
const annualizationApplied = input.fiscalYears.map(fy =>
  fiscalYearMonths(fy.fiscalYearStartDate, fy.fiscalYearEndDate) < 12);
```

### 2-3. capital-increase-adjustment 정합

`capital-increase-adjustment.ts`의 `monthsWithMinOne` → `monthsBetween(start, end)` (floorToOne default true로 동작 동일). 사업연도 시작일은 `fiscalYearStartDate` 입력 시 그 값, 미입력 시 현행 `−1년+1일` fallback. **동작 무변경(회귀 0) — 헬퍼 single-source화만**.

---

## §3. UI 설계 (V2 정식평가)

### 3-1. 사업연도 개시일 입력 (⑤) — `FiscalYearAdjustmentTable.tsx`
- 현행 사업연도 행에 **종료일 DateInput**(line 120-139, `fiscalYearEndDate`)이 이미 있음. 그 옆/위에 **개시일 DateInput**(`fiscalYearStartDate`) 추가 (`updateField(idx, "fiscalYearStartDate", d)`). 종료일은 기존 유지.
- hint: "신설법인·결산기변경으로 1년 미만이면 개시일 입력 → 순손익액 1년 환산(§17의3②). 미입력 시 12개월".
- 1년 미만 감지 시 amber 안내 "사업연도 N개월 → 연환산 ×12/N 적용".

### 3-2. 환산 표시 (⑦) — `Page6NetIncomeBreakdown`(사·아 항목) 또는 `PerShareValuationResultCard`
- `annualizationApplied[i]`면 "1주당 순손익액 N → ×12/M개월 → 환산 N′" 행 노출. echo 사용. 산식 한국어, "원" 접미사 금지.
- 1주당 순손익액·가중평균 표시가 `PerShareValuationResultCard`에 있으면 거기, besshi 6쪽 사·아 항목에 있으면 거기 — 구현 시 실제 표시 위치 확인 후 부착.

### 3-3. Validation (⑧) — `unlisted-stock-valuation-v2.schema` + UI
- `fiscalYearStartDate > fiscalYearEndDate` 차단.
- 개시일 입력 시 1년 미만이면 안내(차단 아님).

---

## §4. 8지점 (`tax-field-add` — V2 입력 경로)

| # | 지점 | 위치 | 작업 |
|---|---|---|---|
| ① 폼 | `unlisted-stock-v2` FiscalYear 폼 상태 | fiscalYearStartDate |
| ② initial | 동상 | undefined (12개월) |
| ③ normalize | 동상 | optional + Date coerce |
| ④ API | V2 입력 변환 (`BesshiForm...PrintView` / orchestrator 진입) | `fiscalYearStartDate` 폼 Date → `toOptionalDate`(기존 `fiscalYearEndDate` `toDate` 패턴, D8-1). 미입력 undefined 허용 |
| ⑤ UI | FiscalYear 입력 DateInput | §3-1 |
| ⑥ 사이드바 | 해당 없음 (자산 카드 내부 평가) | — |
| ⑦ 결과 | besshi Page6 환산 표시 | echo §3-2 |
| ⑧ validate | v2.schema + UI | 개시일>종료일 §3-3 |

> ⑫⑬⑭: `unlisted-stock-valuation-v2.schema.ts`에 `fiscalYearStartDate` 추가(Date 직렬화 `coerceDates`/`toOptionalDate`) grep 점검.

---

## §5. 케이스 → anchor 매핑

| FY | anchor | 입력 | 기대 (toBe) | 파일 |
|---|---|---|---|---|
| FY-1 | FYA-1 | start 미입력 | 환산 0, PDF 사례1 7 anchor 회귀 | fiscal-year-annualize.test.ts + pdf-case-1 |
| FY-2 | FYA-2 | 6개월 1주당 6천 | annualizePerShareNetIncome=12,000 (×2) | fiscal-year-annualize.test.ts |
| FY-3 | FYA-3 | 9개월 9천 | 12,000 (×12/9) | 〃 |
| FY-4 | FYA-4 | Phase0 확정 (1개월 미만 경계, floorToOne:false) | 규칙대로 | 〃 |
| FY-5 | FYA-5 | 12개월·13개월 | 무변환 (months≥12) | 〃 |
| FY-6 | FYA-6 | 6개월 + 유상증자 (통합) | §56⑤ 조정 후 1주당 → 연환산 순서 정합 (evaluateUnlistedStockV2) | unlisted-orchestrator 통합 |
| FY-7 | FYA-7 | FY-2 | annualizationApplied[0]=true echo | 〃 |
| FY-8 | FYA-8 | 6개월 결손 −6천 | −12,000 (결손 확대) → 가중평균 음수→0 | fiscal-year-annualize.test.ts |
| FY-9 | FYA-9 | start 2023-07-01·end 12-31 | monthsBetween=6 | 〃 |

**Pre-Do**: FYA-2(annualize 단위)·AN-1(evaluateUnlistedStockV2 통합 미환산) 먼저 → 실패 확보.

---

## §6. 작업 순서

1. Phase 0: KoreanLaw §56①·§17의3② 환산방법(월할/일할)·1개월미만 절상 확정
2. Phase A (엔진): FYA-2·AN-1 실패 → 타입(start+echo) → `fiscal-year-annualize.ts` → orchestrator line 100~103 → capital-increase `monthsBetween` 정합 → FYA-1~9
3. Phase B (UI): ⑤ 개시일 DateInput → ⑦ besshi 6쪽 환산 → ⑧ validate → Playwright(개시일 입력→환산 표시)

---

## §7. 엣지

| 엣지 | 처리 |
|---|---|
| start 미입력 | 12개월 → 무변환 (회귀 0, FY-1) |
| start > end | validate 차단 + `monthsBetween` 0 가드 → 무변환 |
| 1개월 미만 사업연도 | Phase0 확정 (§17의3② 절상 규정 없음 → 개월수 그대로, 최소 1) |
| 1년 초과 (13개월) | months≥12 무변환 (§17의3②은 1년 미만만) |
| 결손 1년 미만 | ×12/months 결손 확대 → §56① 가중평균 음수→0 (FY-8) |
| capital-increase 동작 | `monthsBetween` floorToOne default true → 무변경 |

---

## §8. 계획↔디자인 일관성 점검 (10단계용)

| 계획서 | 디자인 | 일치 |
|---|---|---|
| §3-1 fiscalYearStartDate | §1-1 | ✅ |
| §3-2 annualizePerShareNetIncome·fiscalYearMonths | §2-1 (+monthsBetween floorToOne) | ✅ |
| §3-3 orchestrator line 96-103 | §2-2 | ✅ |
| §3-4 헬퍼 공유 floorToOne | §2-3 | ✅ |
| 케이스 FY-1~9 | §5 FYA-1~9 | ✅ |
| §5 Pre-Do AN-1·AN-3 | §5 FYA-2·AN-1 | ✅ |
| §7 8지점 (⑤ FiscalYearAdjustmentTable) | §4 ⑤ | ✅ (11단계 동기화) |
| §6 PR-B1 FiscalYearAdjustmentTable·PR-B2 Page6/PerShareCard | §3-1·§3-2 | ✅ (11단계 동기화) |
