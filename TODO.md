# PR-L §63② 기업공개 준비 중 법인 평가 — 구현 TODO

> Plan: `docs/00-pm/inheritance-unlisted-stock-pre-ipo-listing-section-63-2.plan.md`
> Engine Design: `docs/02-design/features/inheritance-unlisted-stock-pre-ipo-listing-section-63-2.engine.design.md`
> UI Design: `docs/02-design/features/inheritance-unlisted-stock-pre-ipo-listing-section-63-2.ui.design.md`

## 엔진 (시퀀셜 선행 — PL anchor RED→GREEN)

- [x] E1 (PL-1 RED) — anchor 파일 작성 + RED 확인 (applyPreIpoListing 부재) ✅ import 실패 RED
- [x] E2 (S-2) — 신규 모듈 `pre-ipo-listing-section-63-2.ts` (applyPreIpoListing + 타입, 105줄) ✅
- [x] E3 (S-1) — 타입 확장 (input.preIpoListing? + result.preIpoListingResult?) ✅
- [x] E4 (S-3) — orchestrator: supplementary 캡처(C3) + 날짜정규화(C1) + override + §54⑥ 인자교체 + echo + appliedRules ✅
- [x] E5 — PL-1~7·9·10·11 GREEN ✅ 16 PASS + property-valuation 274 PASS 회귀 0
- [x] E6 (S-4) — Zod superRefine(공모가>0·신고일·taxKind enum) + PL-8 ✅

## UI (8지점 ⑤⑦ + 폼조립 + besshi)

- [x] U1 (S-6) — `PreIpoListingToggle.tsx` 신규 (ToggleCard emerald + 공모가·신고일·상장일 + 윈도우 preview) ✅
- [x] U2 (S-6) — `UnlistedStockV2Card` sectionNum 재배치 (§63②=9·§54⑥10·결과11 + taxKind 주입, 하드코딩 2곳 정정) ✅
- [x] U3 (S-5) — 폼→v2 taxKind={mode} 주입 + strip 0 grep(통째 spread·Zod만) ✅
- [x] U4 (S-7) — `PerShareValuationResultCard` MAX 분기 + 윈도우 밖 경고 + §54⑥ 범위 안내(L-5) ✅
- [x] U5 (S-8) — `normalizeBesshiInput` 날짜정규화(C1) + besshi note(applied gated) ✅

## 검증·마무리

- [x] V1 — `npx tsc --noEmit` 0건 ✅
- [x] V2 — `npm test` 5229 PASS(회귀 0) + e2e T-L-1/2/3 3 PASS + 기존 V2 e2e 7 PASS ✅
- [x] V3 — 계획↔구현 갭 분석 ✅ (아래)
- [ ] V4 — 커밋 + 푸시 (한국어 메시지)

---

## V3 — 계획↔구현 갭 분석

| 지점 | 계획/디자인 | 구현 | 일치 |
|---|---|---|---|
| S-1 타입 | input.preIpoListing? + result.preIpoListingResult? | types 추가 | ✅ |
| S-2 모듈 | applyPreIpoListing ≤150줄 (subMonths·MAX·window) | 105줄 | ✅ |
| S-3 orchestrator | supplementary 캡처(C3)+날짜정규화(C1)+override+§54⑥ 인자교체+echo+appliedRules | 전부 구현 | ✅ |
| S-4 Zod | preIpoListing z.object + superRefine(공모가>0·taxKind enum·신고일 coerce) | 구현 | ✅ |
| S-5 폼 | taxKind={mode} 주입 + strip 0 | StockValuationForm + 통째 spread | ✅ |
| S-6 UI | PreIpoListingToggle(emerald) + sectionNum §63②=9·§54⑥10·결과11 | 구현(하드코딩 2곳 정정 보너스) | ✅ |
| S-7 결과 | MAX 분기 + 윈도우 경고 + §54⑥ 범위 안내(L-5) | PerShareValuationResultCard | ✅ |
| S-8 besshi | normalizeBesshiInput 날짜정규화(C1) + note(applied gated) | 구현 | ✅ |
| PL-1~11 | 11 anchor + 경계 + Zod + 회귀 | 16 PASS | ✅ |
| C1~C7·DR-1~3 | 정정 전부 반영 | 코드 주석에 C1·C3 명시 | ✅ |

**갭 0건.** 디자인 대비 추가 구현: ① taxKind 하드코딩("inheritance") 2곳(EvaluationCommitteeFilingGuideCard·ResultPanel)을 prop으로 정정 — PR-L taxKind 주입 일관성 확보 부수효과(증여 신고기한 안내 정확화). ② e2e는 디자인 T-L-1/2에 OFF 케이스(T-L-3) 추가.
