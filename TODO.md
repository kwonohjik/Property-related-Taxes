# PR-G2 §59③ 영업권 추정이익 준용 — 구현 TODO

> Plan: `docs/00-pm/inheritance-unlisted-stock-estimated-profit-goodwill-section-59-3.plan.md`
> Engine Design: `docs/02-design/features/inheritance-unlisted-stock-estimated-profit-goodwill-section-59-3.engine.design.md`
> UI Design: `docs/02-design/features/inheritance-unlisted-stock-estimated-profit-goodwill-section-59-3.ui.design.md`

## 엔진 (C-1~C-3 + anchor)

- [x] E1 (EP9-1 RED) — anchor 작성 + RED 확인 (EP-5 교체·EP9-2 fail)
- [x] E2 (C-1) — orchestrator companyWeighted3y let + safeMultiply 환산 + import
- [x] E3 (C-2) — EP-5 미반영 warning 제거 + appliedRules gated push(goodwill>0)
- [x] E4 (C-3) — EP-5 교체 + EP9-1~3 GREEN (16 PASS)
- [x] E5 — property-valuation 디렉터리 258 PASS 회귀 0

## UI (C-4 — ⑦ 결과카드만, 화면+PDF)

- [x] U1 — PerShareValuationResultCard ③ 영업권 §59③ 한 줄(applied && goodwill>0)
- [x] U2 — Page5GoodwillTable + UnlistedStockBesshiPdfDocument 5쪽 note(optional prop, 화면 동일 문구)

## 검증·마무리

- [x] V1 — `npx tsc --noEmit` 0건
- [x] V2 — `npm test` 5213 PASS + PR-G e2e 3 PASS 회귀 0
- [x] V3 — 계획↔구현 갭 분석 (아래)
- [ ] V4 — 커밋 + 푸시 (한국어 메시지)

---

## V3 — 계획↔구현 갭 분석

| 지점 | 계획 | 구현 | 일치 |
|---|---|---|---|
| C-1 환산 | companyWeighted3y let + safeMultiply(평균가액, 주식수) | orchestrator override + import | ✅ |
| C-2 warning 전환 | 미반영 warning 제거 + appliedRules gated(goodwill>0) | 구현 | ✅ |
| C-3 anchor 교체 | EP-5 교체 + EP9-1~3 | 16 PASS | ✅ |
| C-4 UI | 결과카드 + besshi 화면 + PDF (화면+PDF 병렬) | PerShareValuationResultCard·Page5GoodwillTable·PDF 3곳 | ✅ |
| EP9-1 | weightedAvg3y = 평균가액 × 주식수 | toBe(1,200×50,000) | ✅ |
| EP9-2 | ON≠OFF comparative | not.toBe | ✅ |
| EP9-3 | §55③ 배제 무간섭 + §59③ 미표시 | goodwillFinal=0·excludedByLaw 유지 | ✅ |

**갭 0건**. 신규 input·Zod·validation 변경 없음(8지점 중 ⑦만, 설계대로). besshi note는 optional prop(testid 동결 보호, 기존 행 외부 추가)로 구현 — 계획 C-4 "추정이익 시 note" 충족.
