# §19① 공제금 financial 카테고리 포함 명문화 (PR6) — 구현 TODO

> 정책: 각 작업 완료 시 본 TODO.md 즉시 업데이트 후 다음. `- [ ]` 미완료 / `- [x]` 완료
> 계획: `docs/00-pm/inheritance-remaining-credit-deduction-gaps.plan.md` §5 4-b
> 디자인: `docs/02-design/features/inheritance-section19-mutual-aid.design.md`
> 시작: 2026-05-26

---

## Phase A — 표시·명문화 (numeric 무영향)
- [x] A1. financial 라벨 "예금·펀드·채권·공제금" ✅
- [x] A2. financial hint §62·§19① 공제금 명시 ✅
- [x] A3. getFinancialDeductionHint 기본 return 공제금 추가 ✅
- [x] A4. financial-deduction-resolver.ts 주석 §8 미열거→financial 분류 근거 명문화 ✅

## 검증
- [x] V1. 라벨 hard-assert 없음 확인(test:134는 it 제목) + 갭 분석 ✅ — 4곳 명문화, 신규 numeric anchor 없음(K-1), financial §22 적격 기존 유지
- [x] V2. `npx tsc --noEmit` 0건 ✅
- [x] V3. 전체 `npm test` 5055 PASS / 회귀 0 ✅ (PR4 후 외부 커밋 2건 비상장 V2분 +30 포함)
- [x] V4. 현황 출력 ✅
- [ ] V5. 커밋 + 푸시 (한국어 메시지)

---

## 진행 현황
- 전체 작업: 9개
- 완료: 8개
- 미완료: 1개 (V5 커밋·푸시)
- 상태: 커밋 대기

> 참고: PR4 이후 사용자가 비상장 V2 2건(`5511d53`·`9b81295`) 별도 커밋 — 보존하던 UnlistedStockBesshiPdf 미커밋 변경도 그 과정(`6298623`)에서 해결됨.
