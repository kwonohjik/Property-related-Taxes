# TODO — 비상장주식 평가서(별지 부표3) 2025.07.10 개정본 재현

> 정책: 각 작업 완료 시 본 TODO.md 즉시 업데이트 후 다음 작업 이동. `- [ ]` 미완료 / `- [x]` 완료
> 계획: `docs/00-pm/inheritance-unlisted-stock-besshi-2025-revision.plan.md`
> 디자인: `docs/02-design/features/inheritance-unlisted-stock-besshi-2025-revision.engine.design.md`
> 시작: 2026-05-26

---

## Phase A — 계산/표시 버그 (최우선)
- [x] A1. AC-1 anchor: ⑱>0 → 부채소계 차감 검증 ✅ (현행 실패 확보 후 정정 통과)
- [x] A2. AC-2 anchor: ⑮>0 → 부채소계 가산 검증 ✅
- [x] A3. C-1: `Page2NetAssetTable` ⑮ `isSubtract:true→false` ✅ (행+subtotal+소계라벨+⑮ 문구)
- [x] A4. C-2: `net-asset-calc.ts` ⑱ `+deferredTaxAdjustment → −` ✅ (산식+주석, case-3 13건 회귀 0)
- [x] A5. C-3: `NetAssetCalculationTable` ⑱ sign `"+"→"−"` ✅ (sign 메타+미리보기 산식+주석)
- [x] A6. C-13: `Page5GoodwillTable` §55③ 호 라벨 정정 ✅ (real_estate_80→1호, lt3y→2호 본문)
- [x] A7. AC-3: property-valuation 195건 PASS·0 FAIL ✅ (PDF 사례1 ⑱=0·⑮=0 무변동 확인)

## Phase B — 제6쪽 21항목 echo
- [x] B1. C-4: `FiscalYearBreakdown` 타입에 echo 21필드 optional 추가 ✅
- [x] B2. C-5: `buildBreakdown()` 입력 fy 21필드 spread ✅ (산식 무변경)
- [x] B3. C-6: `Page6NetIncomeBreakdown` 21행 전개 ✅ (①+②~⑦ 가소계+⑧~㉒ 나소계+㉓㉔㉕, testid p6-②~㉒)
- [x] B4. AC-4/AC-5: echo 일치 + Σ세부=합계 자기일관 anchor ✅ (pdf-case-1 9건 PASS)

## Phase C — 제1쪽 충실 재현
- [x] C1. C-8: `UnlistedStockValuationInput` +businessRegistrationNumber?·capital? ✅ (optional 표시전용)
- [x] C2. C-7: `Page1CoverSection` 2번 6행 체크박스 상시 렌더 ✅ (다=삭제 회색, AC-6 8건 PASS)
- [x] C3. C-9: `CorporateInfoSection` 입력 + Page1 1번 사업자번호·자본금 ✅ (부모 전달+AC-9 PASS)
- [x] C4. C-10: `Page1CoverSection` 3번 ⑦ 2행 분리 ✅ (㉮할증분·㉯합계)
- [x] C5. AC-6: 5사유 → 해당 행만 [v] anchor ✅

## Phase D — 라벨·할증
- [x] D1. C-11: 헤더 2025.07.10 + ⑯ 기업업무추진비(C-6) + ⑮ 문구(C-1) 최신화 ✅
- [x] D2. C-12/AC-7: companySize large=0.20 / small·medium=0 anchor ✅ (medium 배제 정상)

## 검증
- [x] V1. 갭 분석 (계획·디자인 C-1~C-13 ↔ 구현) ✅ 13개 전부 구현·갭 0
- [x] V2. `npx tsc --noEmit` 0건 ✅
- [x] V3. 전체 `npm test` 4966 PASS·0 FAIL ✅ (property-valuation 195 + besshi 23 + pdf-case-1 13 포함)
- [ ] V4. 커밋·푸시 (한국어 메시지)

---

## 진행 현황
- 전체 작업: 21개
- 완료: 20개
- 미완료: 1개 (V4 커밋·푸시)
- 상태: 진행 중
