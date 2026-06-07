# 새 기능 추가 워크플로 (강제) — 상세

> 루트 `CLAUDE.md`의 "새 기능 추가 워크플로" 요약본의 상세 문서.
> 14개 동기화 지점 계약과 자가 점검은 루트 CLAUDE.md에 유지된다.

## 에이전트

엔진/UI 시니어는 **Plan 단계부터 병렬 참여**(Agent tool 단일 메시지). 한쪽만 단독 보고 금지.

- 엔진: `transfer-tax-senior` / `acquisition-tax-senior` / `property-tax-senior` / `comprehensive-tax-senior` / `inheritance-gift-tax-senior` (+세목별 서브)
- UI: `{transfer|acquisition|property|comprehensive|inheritance-gift}-tax-ui-senior`
- QA: `tax-qa-lead` (6대 세목 병렬), `ui-engine-sync-checker` (read-only)

### Plan 병렬 / Do 시퀀셜 위임 패턴 (사례 36 검증)

1. **Plan/Design** — 엔진+UI 시니어 단일 메시지 동시 호출
2. **Do — 시퀀셜**: 엔진 시니어가 ①②③④⑧⑨⑫⑭ 선처리(타입·헬퍼·anchor) → UI 시니어가 결과 받아 ⑤⑥⑦만 담당 → ④/⑬ 충돌 회피
3. **Check** — `ui-engine-sync-checker` (14지점 read-only) → `bkit:gap-detector` (계획-구현 matchRate)
4. UI 시니어 단독 작업 중 자주 중단되는 5가지(800줄·14지점·TS 연쇄·plan mode 상속·복잡 컴포넌트) → memory `feedback_pdca_session_efficiency` 6가지 사전 적용

## PDCA 5단계

1. **PM/Plan**: 법령 근거. 엔진+UI 시니어 동시 호출. 신규 세목 UI 첫 진입 시 `docs/02-design/features/_new-tax-ui-kickoff.checklist.md`.
2. **Design**: `_template.engine.design.md` 복사. **케이스 인벤토리 표 행≥1 필수** — 비면 Do 진입 금지.
3. **Do**: 엔진 = 엔진+anchor. UI = 14개 동기화 지점. 디자인 갱신 없이 우회 금지.
4. **Check**: `ui-engine-sync-checker` + QA + 브라우저 수동 확인.
5. **Act**: 회귀 후속 + 디자인 환류. 상태: `.bkit/state/pdca-status.json`.

## E2E full-flow 스펙 작성 표준

신규 full-flow E2E 스펙(폼→계산→결과)은 공용 헬퍼 `e2e/_helpers/tax-flow.ts`를 기본 사용:
`fillDateAndVerify`(연·월·일 + 커밋검증) · `addLandAsset` · `nextSteps(n)` · `calcAndWaitResult`(`waitForResponse` + `resp.ok()` 가드 + 결과텍스트, `taxType` inheritance|gift).
병렬 경합 시 단일 `"unknown"` IP가 rate limit 30회/분을 공유 → `playwright.config`의 `x-e2e-rate-limit-bypass` 헤더 + `shouldBypassRateLimit()`(prod 무시)로 우회. (memory `feedback_e2e_preexisting_failures` · `feedback_browser_verify_with_playwright`)
