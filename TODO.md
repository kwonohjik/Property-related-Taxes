# 담보채무 §14 자동 반영 + 채무 입력 화면 자동 노출 — 구현 TODO

> 정책: 각 작업 완료 시 본 TODO.md 즉시 업데이트 후 다음 작업 이동. `- [ ]` 미완료 / `- [x]` 완료
> 계획: `docs/00-pm/inheritance-collateral-debt-auto-deduction.plan.md`
> 디자인: `docs/02-design/features/inheritance-collateral-debt-auto-deduction.design.md`
> 시작: 2026-05-26

---

## Phase A — 엔진 §14 자동 반영

- [x] A0. 코드 구조 파악 (EstateItem=폼 직접사용·STEP3 line112·allocation calcHeirAllocation·단일 return 526·route as캐스팅·estateItemSchema line84) ✅
- [x] A1. Pre-Do anchor AC-1 실패 확보 ✅ (현행 동작 발견: 상증령 §9 기본 장례비 500만 항상 적용 → anchor 정합 정정)
- [x] A2. `EstateItem` 타입 3필드 추가 ✅
- [x] A3. `InheritanceTaxResult.collateralDebtDetail?` echo + `DerivedCollateralDebt` 타입 ✅
- [x] A4. `inheritance-collateral-debt.ts` 신규 — `deriveCollateralDebts`·`scaleAllocations`·`toCollateralDebtItems` ✅
- [x] A5. STEP3 §14 합산 + breakdown 별도 행 ✅
- [x] A6. calcHeirAllocation debtItems에 담보채무(환산) 합산 ✅
- [x] A7. result `collateralDebtDetail` emit (단일 return 526) ✅
- [x] A8. anchor 11건 통과 (CDA-1·2·3단위·4·4b·6·8·amount0 + AC-1·2) ✅

## Phase A′ — lib/calc §22 순금융 제안

- [x] A′1. Pre-Do anchor AC-3(CDA-3) 실패 확보 ✅ (현행 3억 미차감)
- [x] A′2. `suggestNetFinancialAssets` 담보채무(저당) 차감 + breakdown·notes ✅
- [x] A′3. anchor CDA-3·nonfin·lease·off 4건 통과 (suggest 45건 회귀 0) ✅

## Phase B — UI 자동 노출 + 중복 방지

- [x] B1. ① 폼 상태 — EstateItem 타입 직접 사용(shared.ts estateItems: EstateItem[]) → 타입 추가로 자동 ✅
- [x] B2. ②③ initial·normalize — optional 필드(undefined 자연) ✅
- [x] B3. ④ API 변환 + ⑫ Zod — `estateItemSchema` 3필드 추가(strip 방지), route `as` 통과 ✅
- [x] B4. ⑤a `PropertyValuationForm` 담보채무 자동공제 토글(amber)+금융채무(rose)+채권자명 ✅
- [x] B5. ⑤b `DebtAllocationInput` slate 자동노출 카드 + `steps.tsx` useMemo(deriveCollateralDebts) ✅ (mirror-pattern 준수)
- [x] B6. ⑥ `computeInheritanceSummary` totalDebts += 담보채무 ✅
- [x] B7. ⑦ `DebtAllocationResultCard` collateralDebtDetail 섹션(amber) + ResultView prop ✅
- [x] B8. ⑧ `validateCollateralDebtOptIn`+`warnCollateralDebtDuplication` ✅
- [x] B9. ⑫⑬⑭ grep 자가점검 ✅ (Zod 3필드 / api·route estateItems 객체 전체 전달 strip 없음)
- [x] B10. anchor CDA-5·7 통과 (inheritance 216/216) ✅

## 검증

- [x] V1. 계획 문서 ↔ 구현 갭 분석 ✅ 핵심 갭 0 (CD-3b·CD-4 통합 anchor는 단위로 커버, 후속 보강 가능)
- [x] V2. `npx tsc --noEmit` 0건 ✅
- [x] V3. 전체 `npm test` 5001 PASS / 0 FAIL / 회귀 0 ✅
- [x] V4. 현황 출력 (전체/완료/미완료) ✅
- [x] V5. 커밋 + 푸시 (한국어 메시지) ✅

---

## 진행 현황
- 전체 작업: 27개
- 완료: 27개
- 미완료: 0개
- 상태: 완료 ✅
