# PR-G §56② 추정이익 갈음 평가 옵션 — 구현 TODO

> Plan: `docs/00-pm/inheritance-unlisted-stock-estimated-profit-section-56-2.plan.md`
> Engine Design: `docs/02-design/features/inheritance-unlisted-stock-estimated-profit-section-56-2.engine.design.md`
> UI Design: `docs/02-design/features/inheritance-unlisted-stock-estimated-profit-section-56-2.ui.design.md`

## 엔진 (S-1~S-4 + EP anchor)

- [x] E1 (EP anchor) — `estimated-profit-section-56-2.test.ts` 14건 작성
- [x] E2 (S-2) — 신규 모듈 `estimated-profit-section-56-2.ts` (ReasonCode 7종 + 라벨 Record + applyEstimatedProfit)
- [x] E3 (S-1) — 타입 추가: `estimatedProfit?` + `estimatedProfitResult?`
- [x] E4 (S-3) — orchestrator 갈음 분기 + echo + §59③ warning + netIncomePerShare let 전환(F-7)
- [x] E5 (S-4) — Zod estimatedProfit 객체 + superRefine(둘 이상 차단)
- [x] E6 — EP-1~8 + 회귀 14 PASS

## UI (S-5~S-8 + e2e)

- [x] U1 (S-6) — `EstimatedProfitToggle.tsx` 신규 (ToggleCard + RadioCardGroup 7사유 + 동적 기관행 + 절차3체크 + 미리보기)
- [x] U2 (S-6) — `UnlistedStockV2Card.tsx` 통합 + 섹션 재번호 4~10
- [x] U3 (S-5) — 폼→v2 조립부 estimatedProfit 포함 확인 (spread+optional, strip 0)
- [x] U4 (S-7) — `PerShareValuationResultCard.tsx` 산식 3분기(적용/미적용/warning)
- [x] U5 (S-8) — besshi 화면 + PDF 제6쪽 7.차 추정이익 갈음 안내
- [x] U6 (e2e) — `e2e/inheritance-estimated-profit.spec.ts` 상속2 + 증여1 (3 PASS)

## 검증·마무리

- [x] V1 — `npx tsc --noEmit` 0건
- [x] V2 — `npm test` 5211 PASS (신규 14)
- [x] V3 — 계획↔구현 갭 분석 (8지점 + EP-1~8) — 아래
- [ ] V4 — 커밋 + 푸시 (한국어 메시지)

---

## V3 — 계획↔구현 갭 분석

| 지점 | 계획 | 구현 | 일치 |
|---|---|---|---|
| S-1 type | estimatedProfit? + estimatedProfitResult? | types 추가 | ✅ |
| S-2 모듈 | applyEstimatedProfit + 7 reason + 라벨 Record | estimated-profit-section-56-2.ts | ✅ |
| S-3 orchestrator | 갈음+echo+§59③ warning+netIncomePerShare let | STEP 5.5 분기 | ✅ |
| S-4 Zod | superRefine 둘 이상 차단 | EP-7 PASS | ✅ |
| S-5 mediator | strip 0 | spread+optional 확인 | ✅ |
| S-6 UI 토글 | 신규 섹션4 + 재번호 4~10 | EstimatedProfitToggle + V2Card | ✅ |
| S-7 결과카드 | 3분기 산식 | ⑤ hint 분기 + notice | ✅ |
| S-8 besshi | 화면+PDF 7.차 | Page6 + PDF 안내 | ✅ |
| EP-1~8 anchor | 8 + 회귀 | 14 PASS | ✅ |

**★ 갭 1건 (법령 우선 정정)**: 계획 D-1은 `calcPerShareNetIncomeValue`(≤0→0 clamp) 재사용 명시였으나, §56② "제1항에도 불구하고"가 §56① 음수→0 단서를 displace(F-1)하므로 **구현은 `Math.floor(평균÷환원율)` 직접 계산**(음수 미clamp)으로 정정. EP-6이 음수 propagation + 80% 하한 보정 검증. [[feedback_anchor_correction_legal_priority]] 법령 정합 우선.
