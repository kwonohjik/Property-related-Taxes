# 상속세 §69 신고세액공제 산출근거 echo (PR1) — 구현 TODO

> 정책: 각 작업 완료 시 본 TODO.md 즉시 업데이트 후 다음 작업 이동. `- [ ]` 미완료 / `- [x]` 완료
> 계획: `docs/00-pm/inheritance-remaining-credit-deduction-gaps.plan.md` §2
> 디자인: `docs/02-design/features/inheritance-filing-credit-echo.engine.design.md`
> 시작: 2026-05-26

---

## Phase 0 — Pre-Do anchor
- [x] P0. INH-ECHO-1 anchor 우선 작성 → 실패 확보 ✅ (`totalComputedTaxWithSurcharge` undefined 확인, C23)

## Phase A — 엔진
- [x] A1. `calcInheritanceTaxCredits` return echo 2필드 추가 ✅ (C23 통과)

## Phase B — UI (카드 빌더)
- [x] B1. `buildSection69Formula` §30 분기 추가 (텍스트·금액 줄) ✅
- [x] B2. `allOthersZero`에 `&& shortTerm === 0` 추가 (E-2) ✅ + outdated 주석 2곳 정정

## Phase C — anchor
- [x] C1. INH-ECHO-1: 상속세 결과 echo 2필드 정의+값 일치 ✅ (C23·C25)
- [x] C2. INH-ECHO-2: `filingCreditBase × 3% === filingCredit` ✅ (C23)
- [x] C3. INH-ECHO-3: §30>0 케이스 역산 일치 ✅ (C23b)
- [x] C4. 회귀: 기존 상속세 anchor 전수 불변 ✅ (V3 전체 5021 PASS·회귀 0)

## 검증
- [x] V1. 계획↔구현 갭 분석 ✅ — 디자인 테스트 약속(ECHO-1·2·3+회귀) 100% 충족. EC-3·EC-5는 동일 산식 경로 회귀 커버, 핵심 갭 0
- [x] V2. `npx tsc --noEmit` 0건 ✅
- [x] V3. 전체 `npm test` 5021 PASS / 회귀 0 ✅
- [ ] V4. 현황 출력
- [ ] V5. 커밋 + 푸시 (한국어 메시지)

---

## 진행 현황
- 전체 작업: 13개
- 완료: 12개
- 미완료: 1개 (V5 커밋·푸시)
- 상태: 커밋 대기
