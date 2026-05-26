# 비상장주식 1년 미만 사업연도 연환산 (§17의3②) — 구현 TODO

> 정책: 각 작업 완료 시 본 TODO.md 즉시 업데이트 후 다음 작업 이동. `- [ ]` 미완료 / `- [x]` 완료
> 계획: `docs/00-pm/inheritance-unlisted-fiscal-year-under-1year.plan.md`
> 디자인: `docs/02-design/features/inheritance-unlisted-fiscal-year-under-1year.design.md`
> 시작: 2026-05-26

---

## Phase 0 — 법령 정밀 검증
- [x] P0. KoreanLaw 확정 ✅ — §17의3② 환산방법 미규정·해석례 2회 미발견 → 본칙(월할 ×12/개월수, 절상 없음 floorToOne:false) 적용. 추정 인용 금지

## Phase A — 엔진
- [x] A0. 코드 구조 파악 ✅ (FiscalYearAdjustment line47·orchestrator line96-103·capital-increase monthsWithMinOne·v2.schema line47·Result line248·safeMultiplyThenDivide=tax-utils)
- [x] A1. Pre-Do anchor 단위 11건 통과 (FYA-2·3·5·8·9 + monthsBetween·음수 −12,000 floor 확인). 통합 AN-1은 A4 후 검증 ✅
- [x] A2. `FiscalYearAdjustment.fiscalYearStartDate?` + Result echo 2필드 ✅
- [x] A3. `fiscal-year-annualize.ts` 신규 — `monthsBetween`·`fiscalYearMonths`·`annualizePerShareNetIncome` ✅
- [x] A4. orchestrator 연환산 통합 (1주당 후·가중평균 직전) + echo 2필드 ✅
- [x] A5. capital-increase `monthsWithMinOne` → `monthsBetween` single-source (회귀 0 확인) ✅
- [x] A6. anchor 단위 11 + 통합 AN-1·FY-1(환산 1472·회귀 715) 통과 / property-valuation+inheritance 444 회귀 0 ✅

## Phase B — UI (V2 정식평가)
- [x] B1. ①②③ `FiscalYearAdjustment.fiscalYearStartDate` 타입+Date coerce ✅
- [x] B2. ④⑫ v2.schema `fiscalYearStartDate: z.coerce.date().optional()` (strip 방지) ✅
- [x] B3. ⑤ `FiscalYearAdjustmentTable` 개시일 DateInput + 1년 미만 amber 안내 ✅
- [x] B4. ⑦ `Page6NetIncomeBreakdown` 사-환산 행 + `PerShareValuationResultCard` 연환산 내역 ✅
- [x] B5. ⑧ `fiscalYearAdjustmentSchema.superRefine` 개시일>종료일 차단 ✅
- [x] B6. anchor 단위17+통합 + Playwright E2E 2건 통과(navigation 수정) ✅

## 검증
- [x] V1. 계획 ↔ 구현 갭 분석 ✅ 핵심 갭 0 (FY-6 통합 anchor는 pdf-case-1로 부분 커버, 후속 보강 가능)
- [x] V2. `npx tsc --noEmit` 0건 ✅
- [x] V3. 전체 `npm test` 5020 PASS / 0 FAIL / 회귀 0 ✅
- [x] V4. 현황 출력 ✅
- [x] V5. 커밋 + 푸시 (한국어 메시지) ✅

---

## 진행 현황
- 전체 작업: 19개
- 완료: 19개
- 미완료: 0개
- 상태: 완료 ✅
