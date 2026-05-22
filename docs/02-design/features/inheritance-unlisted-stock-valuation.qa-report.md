# 비상장주식 V2 평가 — PDCA Check QA 리포트

- 대상: 7 커밋 (`cc76330` ~ `14d4192`)
- 실행일: 2026-05-22
- 단계: PDCA Check (회귀 검증 전용, 신규 anchor 추가 없음)

## 1. 검증 명령 및 결과

| # | 명령 | Test Files | Tests | 결과 |
|---|------|-----------|-------|------|
| 1 | `npx vitest run __tests__/tax-engine/inheritance` | 26 passed | 475 passed | PASS |
| 2 | `npx vitest run __tests__/tax-engine/gift` | 1 passed | 31 passed | PASS |
| 3 | `npx vitest run __tests__/tax-engine` (6세목 전체) | 233 passed / 1 skipped | 3976 passed / 13 skipped / 1 todo | PASS |
| 4 | `npx vitest run __tests__/tax-engine/property-valuation` (신규 anchor) | 6 passed / 1 skipped | 127 passed / 10 skipped | PASS |

회귀 0건. 234 test files 중 1 skipped (사전 의도된 skip).

## 2. 신규 Anchor 파일 (property-valuation/)

- `case-1-net-income-calc.test.ts`
- `case-3-net-asset-goodwill.test.ts`
- `case-4-integration.test.ts` — 사례 5·6 통합 anchor
- `case-5a-integration.test.ts` — 사례 6 통합
- `pre-do-anchor.test.ts` — Pre-Do anchor (P1-A6 등)

## 3. PDF 사례 완전 재현 검증

### 사례 5 (PDF p1538~1540) — 중소기업·할증 배제
- `[U-10] 1주당 평가액 ⑥ = 10,456원` → PASS
- `[U-11] 상속재산가액 = 104,560,000원 (10,456 × 10,000주)` → PASS
- 할증 배제 §53⑧9호: ⑧ = 10,456 → PASS

### 사례 6 (PDF p1541~1548) — 할증 적용
- `[U-17] 1주당 평가액 ⑧ (할증후) = 13,092원` (10,910 × 120%) → PASS
- `[U-18] 상속재산가액 = 340,392,000원` (13,092 × 26,000) → PASS
- `[P1-A6]` Pre-Do anchor 총 평가액 340,392,000원 → PASS

## 4. 종합 판정

- 상속세 회귀: 0건 (475/475)
- 증여세 회귀: 0건 (31/31)
- 6세목 전체 회귀: 0건 (3976/3976)
- 신규 anchor: 0 FAIL (127/127, skipped 10건은 의도된 후속)
- PDF 사례 5·6 완전 재현 확인

회귀 검출 없음. PDCA Check 통과.
