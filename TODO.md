# 작업 TODO — 협의분할 일원화 + 법정상속분 자동 배분

> 정책: 각 작업 완료 시 본 TODO.md 즉시 업데이트 후 다음 작업 이동. `- [ ]` 미완료 / `- [x]` 완료
> 계획: `docs/00-pm/heir-allocation-legal-share-unification.plan.md`
> 디자인: `docs/02-design/features/heir-allocation-legal-share.engine.design.md`
> 시작: 2026-05-26

---

## 엔진 (Phase 1)
- [x] E1. `computeLegalShares(heirs)` 신규 헬퍼 (`inheritance-legal-share.ts`) — 정수 분자/분모, §1009·§1003·§1000 ✅ (+ distributeByLegalShares 잔액흡수)
- [x] E2. Pre-Do anchor — `computeLegalShares` 단위 (LS-1~12, 분자합=분모 자가검증) ✅ (14건 PASS)
- [x] E3. `calcHeirAllocation` 수정 — 미입력 자산 법정상속분 fallback (estate·presumed·debt) + 트리거 `hasDistributableHeir` ✅ (resolveAllocationsByHeir + valuatedAmountById + computeLegalShares 트리거)
- [x] E4. 배분 anchor — C9 재산정 + C10(배우자+자녀2)·C11(혼합) 신규 ✅ (10건 PASS)
- [x] E5. 회귀 측정·재산정 — IDA-ENGINE-2/4/5·IDA-LEGACY-1 "항상 배부"로 재산정 ✅ (inheritance 411 PASS)

## UI (Phase 2~4)
- [x] U1. `actualShareRatio` 제거 — 타입 `@deprecated`, validator 제거, HeirComposition 블록 제거 ✅ (normalize 참조 없음)
- [x] U2. `HeirComposition.tsx` — 블록 제거 + steps.tsx 상속인 섹션 안내 카드 ✅
- [x] U3. `HeirAllocationInput.tsx` — 미입력 시 법정상속분 안내 ✅
- [x] U4. 결과 카드 — `HeirAllocationTable` usedLegalShareFallback echo 캡션 ✅ (자산별 배지는 perHeir 합산 구조상 echo로 대체)

## 검증 (Phase 5)
- [x] V1. `npx tsc --noEmit` 0건 ✅
- [x] V2. `npx vitest run` 전체 4949 PASS·0 FAIL ✅
- [x] V3. Playwright E2E 5건 (% 필드 부재 + 법정상속분 안내) ✅
- [x] V4. 계획·디자인 ↔ 구현 갭 분석 ✅ (G1 debt anchor C12 보완 / G2 디자인 §5-3 환류 / PRE 통합 anchor 후속)
- [ ] V5. 커밋 + 푸시 (한국어 메시지)

---

## 진행 현황
- 전체 작업: 14개
- 완료: 13개
- 미완료: 1개 (V5 커밋·푸시)
- 상태: 진행 중
