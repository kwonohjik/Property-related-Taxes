# 부담부증여 §58 사전증여 기납부세액공제 안분 (PR3) — 구현 TODO

> 정책: 각 작업 완료 시 본 TODO.md 즉시 업데이트 후 다음. `- [ ]` 미완료 / `- [x]` 완료
> 계획: `docs/00-pm/inheritance-remaining-credit-deduction-gaps.plan.md` §1
> 디자인: `docs/02-design/features/transfer-burdened-gift-section58-prior.design.md`
> 시작: 2026-05-26

---

## Phase 0 — Pre-Do anchor (갭 실증)
- [x] P0. §58 공제 0(누락) 실증 ✅ (BG58-2 priorGiftCredit undefined, filingCredit 4,050,000 = 미적용)

## Phase A — 엔진
- [x] A1. priorGiftsWithin10Years 항목에 `computedTax?`·`giftTaxBase?` 추가 ✅
- [x] A2. map에 2필드 전달 + 주석 정정 ✅ + A3. giftTaxSummary `priorGiftCredit` 노출(⑦) ✅

## Phase B — 양도세 14지점 동기화
- [x] B1. ⑤ UI 산출세액·과세표준 2필드 + ②addRow 초기값 + §58 안내 ✅
- [x] B2. ④ API 2필드 전달(payload 타입+map) ✅
- [x] B3. ⑫ Zod 2필드 optional ✅
- [x] B4. ⑧ validation 사전증여 입력 시 computedTax·giftTaxBase 필수 ✅
- [x] B5. ⑬⑭ body/route — burdenedGiftInfo 객체 통째 spread, strip 없음 확인 ✅ + ① 폼 타입 2필드

## Phase C — anchor
- [x] C1. BG58-1 회귀: P3-1~4 불변 ✅
- [x] C2. BG58-2: §58 공제 20M 적용 ✅
- [x] C3. BG58-2b: finalTax 111,550,000 자기일관성 ✅

## 검증
- [x] V1. 계획↔구현 갭 분석 ✅ — 14지점 전수(⑥ 사이드바는 증여세 미표시로 해당없음). BG58-1·2·2b 통과, BG58-3 validation 구현, BG58-4 기존 보존. ⑦ 카드 priorGiftCredit 행 추가. 핵심 갭 0
- [x] V2. `npx tsc --noEmit` 0건 ✅
- [x] V3. 전체 `npm test` 5025 PASS / 회귀 0 ✅
- [x] V4. 현황 출력 ✅
- [ ] V5. 커밋 + 푸시 (한국어 메시지)

---

## 진행 현황
- 전체 작업: 15개
- 완료: 14개
- 미완료: 1개 (V5 커밋·푸시)
- 상태: 커밋 대기
