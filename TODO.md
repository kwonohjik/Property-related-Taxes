# §22 deposit 적격 정합 + 영농 §16⑤ 염전 문구 (PR2) — 구현 TODO

> 정책: 각 작업 완료 시 본 TODO.md 즉시 업데이트 후 다음 작업 이동. `- [ ]` 미완료 / `- [x]` 완료
> 계획: `docs/00-pm/inheritance-remaining-credit-deduction-gaps.plan.md` §5
> 디자인: `docs/02-design/features/inheritance-section22-deposit-financial.design.md`
> 시작: 2026-05-26

---

## Phase 0 — Pre-Do anchor
- [x] P0. DEP-1·3 실패 확보 ✅ (현재 deposit true)

## Phase A — 엔진 (4-a)
- [x] A1. `financial-deduction-resolver.ts` `CATEGORY_DEFAULT.deposit` 제거 + 주석 정정 ✅

## Phase B — anchor 재산정 (4-a numeric)
- [x] B1. asset-toggle deposit `financialDeduction` → `"hidden_expandable"` + 주석 ✅
- [x] B2. deposit 펼침 카운트 `0` → `1` ✅
- [x] B3. line 8 describe 주석 갱신 ✅
- [x] B4. 신규 anchor DEP-1·2·3 (resolver) ✅ (30 PASS)

## Phase C — UI (4-c)
- [x] C1. `steps.tsx` 영농상속재산 hint §16⑤ 가~사목(염전) + label §23→§18의3 오기 정정 ✅

## 검증
- [x] V1. 계획↔구현 갭 분석 ✅ — 케이스 D-1~5·C-1 전수 커버. 4-d stale(이미 구현)·4-d/4-a 안내문구 기구현 확인. label §23 오기 추가 정정
- [x] V2. `npx tsc --noEmit` 0건 ✅
- [x] V3. 전체 `npm test` 5024 PASS / 회귀 0 ✅ (comprehensive F-03 불변 실증)
- [x] V4. 현황 출력 ✅
- [ ] V5. 커밋 + 푸시 (한국어 메시지)

---

## 진행 현황
- 전체 작업: 12개
- 완료: 11개
- 미완료: 1개 (V5 커밋·푸시)
- 상태: 커밋 대기
