# 영농상속공제 상속인별 자격 명시 override (PR5) — 구현 TODO

> 정책: 각 작업 완료 시 본 TODO.md 즉시 업데이트 후 다음. `- [ ]` 미완료 / `- [x]` 완료
> 계획: `docs/00-pm/inheritance-remaining-credit-deduction-gaps.plan.md` §3-a
> 디자인: `docs/02-design/features/inheritance-farming-heir-override.design.md`
> 시작: 2026-05-26

---

## Phase A — 로직 (순수 헬퍼 + 파생)
- [x] A1. `resolveEffectiveQualifiedHeirIds` 헬퍼 — 명시 override 우선 ✅
- [x] A2. `step4-5.tsx` 헬퍼 사용 + 미사용 deriveQualifiedHeirIds import 제거 ✅

## Phase B — UI
- [x] B1. FarmingEligibilitySection — heirAssessments 입력 시에도 override 토글 노출 + 안내 분기 + 경고 배지 ✅

## Phase C — anchor
- [x] C1~C4. FH-OVR-1~5 (legacy·자동도출 회귀·override 우선·경고 대상) ✅ 5건 통과

## 검증
- [x] V1. 계획↔구현 갭 분석 ✅ — A1·A2·B1 구현, FH-OVR-1~5 통과. qualifiedHeirIds 기존 필드라 신규 동기화 지점 0. 핵심 갭 0
- [x] V2. `npx tsc --noEmit` 0건 ✅
- [x] V3. 전체 `npm test` 5060 PASS / 회귀 0 ✅
- [x] V4. 현황 출력 ✅
- [ ] V5. 커밋 + 푸시 (한국어 메시지)

---

## 진행 현황
- 전체 작업: 11개
- 완료: 10개
- 미완료: 1개 (V5 커밋·푸시)
- 상태: 커밋 대기
