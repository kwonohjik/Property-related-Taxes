# 가업상속공제 §15⑤2호 사업무관자산 자동차감 통합 (PR4) — 구현 TODO

> 정책: 각 작업 완료 시 본 TODO.md 즉시 업데이트 후 다음. `- [ ]` 미완료 / `- [x]` 완료
> 계획: `docs/00-pm/inheritance-remaining-credit-deduction-gaps.plan.md` §4
> 디자인: `docs/02-design/features/inheritance-family-business-section15-unrelated.design.md`
> 시작: 2026-05-26

---

## Phase 0 — Pre-Do anchor (갭 실증)
- [x] P0. FB15-1·5 실패 확보 ✅ (현재 차감 미적용 — 1,000M·11,000M)

## Phase A — 엔진
- [x] A1. `deriveFamilyBusinessValue` §15⑤2호 차감 통합 ✅ (corporate_stock+corporateTotalAssets 입력 시 calcCorporateStockAdjustedValue) + JSDoc(A3) 정정
- [x] A2. orphan `family-business-unrelated-assets.ts` + 전용 테스트 삭제 ✅ (프로덕션 호출 0)
- [x] A3. 주석 정정 ✅ (A1 JSDoc 교체로 FB-8 해소)

## Phase C — anchor
- [x] C1. FB15-1: 차감 적용 750M ✅
- [x] C2. FB15-2 회귀: corporateTotalAssets 미입력 → marketValue ✅ (FB-AUTO-1 30억 불변)
- [x] C3. FB15-5: 혼합 10,750M ✅
- [x] C4. FB15-4: FB15-1이 차감산식=calcCorporateStockAdjustedValue 검증 → single-source 자명, 별도 anchor 생략

## 검증
- [x] V1. 계획↔구현 갭 분석 ✅ — FB15-1·2·5 통과, FB15-3은 FB15-5 포함, FB15-4 single-source 자명. 영농 제외(farmingAssetValue 단일입력)·J-1 raw 별도트랙·⑦ autoDerivedValue 차감반영. 핵심 갭 0
- [x] V2. `npx tsc --noEmit` 0건 ✅
- [x] V3. 전체 `npm test` 5025 PASS / 회귀 0 ✅ (orphan 테스트 삭제로 files 324)
- [x] V4. 현황 출력 ✅
- [ ] V5. 커밋 + 푸시 (한국어 메시지)

---

## 진행 현황
- 전체 작업: 12개
- 완료: 11개
- 미완료: 1개 (V5 커밋·푸시)
- 상태: 커밋 대기
