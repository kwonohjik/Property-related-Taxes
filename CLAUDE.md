# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**KoreanTaxCalc** — 한국 부동산 6대 세금 자동계산 웹 앱 (양도·상속·증여·취득·재산·종합부동산세).

- 구현 현황: 6대 세목 + 주식양도세 전부 엔진·UI·API·결과뷰·테스트 완료. 계산 결과 선택 출력 공통화(8 결과뷰). 상속·증여세는 별지 서식(별지9호·부표2·3·5 등) PDF 재현까지 확장.
- 최근 완료 이력: [`docs/00-pm/recent-completions.md`](docs/00-pm/recent-completions.md). (초기 로드맵은 현황과 차이 큼 — Next.js 16·6세목 완료 미반영.)
- 양도세 감면 23개 조문 확장: `lib/tax-engine/transfer-reductions/` 대부분 구현 완료 (`metadata.isFullyImplemented` 기준).

## ⚠️ Next.js 16 주의사항

**This is NOT the Next.js you know** — API·컨벤션이 학습 데이터와 다를 수 있다.

- `middleware.ts` → `proxy.ts` rename. 세션 처리는 `proxy.ts`.
- 변경 사항 확인 시 `node_modules/next/dist/docs/` 가이드를 먼저 읽을 것.

## Commands

```bash
npm run dev                   # 개발 서버 (Turbopack)
npm run build                 # 프로덕션 빌드
npm run typecheck             # tsc --noEmit
npm run lint                  # ESLint
npm run check:pre-pr          # typecheck + lint + test (PR 전 수동 게이트)
npm test                      # vitest 전체 (1회)
npm run test:watch            # vitest 감시 모드
npx vitest run <path>         # 단일 파일/디렉터리
npx vitest run -t "T-01"      # 이름 패턴
npx playwright test <spec>    # E2E 단일 스펙 (비-worktree는 E2E_PORT 생략, 기본 3000)
npx shadcn@latest add <name>  # shadcn/ui 컴포넌트 추가

# 데이터·법령 (.env.local 필요)
npm run seed:tax-rates        # Supabase tax_rates 시딩
npm run verify:legal          # 법령 조문 상수 검증 (:refresh = 캐시 무효화 후)
```

**자동 게이트**: husky pre-commit(lint-staged) + pre-push(typecheck + test) + GitHub Actions.

### 머지 워크플로 — `scripts/ship.sh` (수시 수정 사이클)

브랜치 → 커밋 → 푸시 → PR → 머지 → 브랜치 삭제 → master 동기화를 **한 명령**으로.

```bash
scripts/ship.sh <branch> "<commit message>"          # 즉시 머지 + 원격/로컬 브랜치 삭제 + master 동기화
scripts/ship.sh <branch> "<commit message>" --auto   # CI 통과 후 자동 머지(감독 불필요)
```

- **전제**: master에서 작업 변경분을 들고 실행(자동으로 새 브랜치 분기)하거나, 이미 `<branch>`에 있는 상태.
- **진짜 게이트는 `git push` 시 pre-push(tsc + 전체 test)뿐**. master에 브랜치 보호가 없어 **CI는 머지를 차단하지 않음**(머지 후 기록용 실행) → 즉시 머지 모드는 CI를 기다리지 않는다.
- repo 설정 `deleteBranchOnMerge: true`(원격 자동삭제) + `allowAutoMerge: true`(`--auto`) 적용됨.
- **lint 갭 주의**: pre-push는 tsc+test만(lint 제외). lint는 commit 시 lint-staged가 **변경 파일만** `--fix`. 대규모 변경 후 불안하면 push 전 `npm run lint`.
- **효율**: 작은 수정 여러 개를 한 브랜치에 모아 1회 ship → CI 실행 횟수↓.
- `.claude/commands/`(로컬 개인 슬래시 커맨드)는 `.git/info/exclude`로 제외됨 → `git add -A` 오염 없음.

**ESLint --fix 함정**: pre-commit lint-staged의 `eslint --fix`가 미사용 import 정리 시 **같은 라인의 사용 중인 named export까지 제거**할 수 있다 (`import { CurrencyInput, parseAmount }`에서 CurrencyInput만 미사용 → parseAmount도 제거 → TS2304). 회피: 신규 import는 한 라인에 한 named만. pre-push `tsc`가 잡지만 fix 커밋 1개 추가됨.

## Tech Stack

Next.js 16 (App Router, React 19, Turbopack) + TS strict / shadcn(BaseUI) + Tailwind v4 + zustand / Next Route Handlers (`app/api/**`) / Supabase (Auth + Postgres) / vitest + jsdom + RTL / Playwright E2E / Sentry (`tax_type`·`request_id` 태그).

## Architecture — 2-Layer Tax Engine

```
Layer 1: Orchestrator (app/api/calc/{tax-type}/route.ts)
  → Rate limiting (lib/api/rate-limit.ts) IP당 분당 30회
    · 테스트 우회: shouldBypassRateLimit(req) — prod NODE_ENV는 항상 false
  → Zod 검증 (discriminatedUnion 감면 스키마)
  → preloadTaxRates() Supabase RPC 일괄 로드
  → Pure Engine 호출 (세율 데이터 매개변수 전달)
  → (이력 저장은 서버 미경유 — 결과 화면 마운트 시 클라이언트 IndexedDB 자동 저장, lib/storage)

Layer 2: Pure Engine (lib/tax-engine/*.ts)
  → DB 직접 호출 없음, 순수 함수
  → 단방향 의존만 허용: comprehensive → property (역방향 금지)
  → 감면 라우터: lib/tax-engine/transfer-reductions/ (23개 조문)
  → 양도세 4-파일 분할: transfer-tax.ts + -helpers.ts + -rate-calc.ts + -finalize.ts
  → 환산: commercial-building-valuation.ts / general-building-valuation.ts

lib/calc/ — 클라이언트↔API 변환 (14개 동기화 지점 ④⑧ 담당)
```

세부 파일 조직·의존·정수 연산: [lib/tax-engine/CLAUDE.md](lib/tax-engine/CLAUDE.md).

## File Size Policy (강제)

**모든 파일 800줄 이하**. PostToolUse hook 경고. 위반 감지 시 즉시 분리(orchestrator + helpers/types/sections) — 우회 금지.

## 세금 엔진 규칙

**계산 원칙**:
- DB 기반 세율: `tax_rates` jsonb. key: `${tax_type}:${category}:${sub_category}`.
- 정수 연산: 금액은 원(KRW, 정수). `applyRate()`/`safeMultiply()` 사용. `Math.round()` 금지.
- 중간 절사: 세율 × 금액 직후 `Math.floor()`. 지방소득세는 원 미만 절사.
- 감면 중복배제(양도세 조특법 §127⑦·취득세/재산세 지방세특례제한법 §180): 후보 배열 max 패턴.
- 법령 조문 상수: 문자열 리터럴 금지. `lib/tax-engine/legal-codes/` 의 `TRANSFER.*` 등 상수.

**API Date 직렬화** — `lib/api/date-coerce.ts` 필수. JSON 경유 후 string 도달 → `Date < string` silent false 함정. `toDate(v, "field")` / `toOptionalDate(v)` / `coerceDates(obj, [...])`. 신규 코드 `new Date(x)` 직접 호출 금지.

**설계 원칙 (UI 금지)**:
- 자동 안분 fallback 금지(예외: PHD §164⑦). 미입력은 검증 오류로 차단.
- useEffect → store 미러링 금지. cross-field 동기화는 onChange/useMemo.
- 법령 정확성 최우선. 납세자 유리/불리·절감 표현 금지.

## UI 작성 원칙 (요약 — 상세: [components/calc/CLAUDE.md](components/calc/CLAUDE.md))

계산 로직 순서 = UI 표시 순서(모드 토글은 영향 필드 직전). 사이드바 합계는 계산 가능한 항목만 0원 제외. 결과 산식은 한국어 풀어쓰기(변수 약어·`floor()` 금지). 토글/라디오는 `ToggleCard`/`RadioCardGroup` 필수, native 신규 금지, OFF도 tone 유지. 공시지가는 `LandPriceLookupField` 필수. 면적 반올림(UI 한정) `parseFloat(toFixed(2))` 후 단가 곱셈. placeholder 숫자 예시 금지 — 형식 설명은 FieldCard `hint`.

**자산 종류 특수 분기 진입점**: `components/calc/transfer/CompanionAcqPurchaseBlock.tsx` — 상단 일반 "취득가액 산정 방식·취득가액" 영역을 `assetKind`(redevelopment_apt·general_building·commercial_building 등)/`transferType`(burdened_gift)별로 조건부 숨김. 특수 분기 추가 시 violet/fuchsia 안내 카드 패턴 차용. 자산-수준 입력은 해당 자산 전용 Block(`RedevelopmentBlock`/`GeneralBuildingBlock`/`CommercialBuildingBlock`)에 격리.

## 인프라

**Supabase / DB**: `supabase/migrations/`(tax_rates·regulated_areas·standard_prices·users·calculations). 시딩 `npm run seed:tax-rates`. 환경변수 미설정 시 graceful 통과(로컬 개발 가능). `DISTINCT ON` 미지원 → DB Function `preload_tax_rates()`.

**Route Protection (`proxy.ts`)**: `updateSession`으로 Auth 세션만 유지 — 이력 로컬 IndexedDB 일원화로 보호 라우트(`/api/history`·`/api/pdf`) 제거됨(proxy.ts:4). 모든 계산·법령 라우트 비로그인 허용.

**로컬 저장소**: IndexedDB(Dexie). 비로그인 sessionStorage 보존→로그인 후 마이그레이션. zustand `result`는 partialize 제외. Store 마이그: `lib/stores/calc-wizard-migration.ts`. 상세: [lib/storage/CLAUDE.md](lib/storage/CLAUDE.md).

**법령 리서치 (`/law`)**: 법제처 Open API 직접 호출(`KOREAN_LAW_OC`). Routes `app/api/law/{search-law,law-text,search-decisions,decision-text,annexes,chain,route-router,applicable-law}/route.ts`. Client barrel `lib/korean-law/client.ts`(5파일). 별칭 다수 `aliases.ts`. 캐시 `.legal-cache/` 7일 TTL.

- **통합 검색 + Query Router**(`lib/korean-law/router/query-router.ts`): 자연어 질의를 정규식 패턴으로 도구 자동 라우팅. 우선순위 0=행위시법(`applicable_law`)·개정신구대조(`amendment_article`), 1=조문(제 포함), 2=조문(제 생략), 10~=개정·판례·별표 등. `UnifiedSearchBar`→`/api/law/route-router`→`LawResearchClient` 탭 전환.
- **v4.4 고도화(korean-law-mcp 동급)**:
  - **행위시법**(`applicable-law.ts`): 기준일 시행 조문 + 부칙 경과규정. 법제처 `target=eflaw`(시행일자별)·연혁. `ApplicableLawPanel`. 부칙 발췌는 조문 전용(`articleSpecific`) 우선. "2021년 시행 소득세법 89조".
  - **신구대조**(`time-travel.ts`): `compareLatestAmendment`(distinct MST 거슬러 실제 변경 탐색)·LCS `diffLines`. `amendment_track` 체인 `diff` 섹션 + `LawDiffView`. "소득세법 89조 개정".
  - **현행성 라벨**: 조문 표시 지점에 `CurrentLawBadge`([현행]). 과거 시점은 행위시법 [연혁].
- 구조화 참조조문(`parsers/ref-parser.ts` `LawRef[]`)·시나리오 8종(`scenarios/`)·판례 17도메인(`DECISION_DOMAINS`).

**키움 OpenAPI 자동조회**: 주식 시세 자동조회(양도·상속·증여 공용). 시점 4종·인프라·법령 인용 정정: [lib/kiwoom/CLAUDE.md](lib/kiwoom/CLAUDE.md).

## 새 기능 추가 워크플로 (강제)

엔진+UI 시니어를 **Plan 단계부터 단일 메시지로 병렬 호출**(한쪽 단독 보고 금지) → **Do는 시퀀셜**(엔진이 타입·헬퍼·anchor 선처리 → UI가 ⑤⑥⑦ 담당) → Check는 `ui-engine-sync-checker`(14지점) + `bkit:gap-detector`(matchRate). 에이전트 목록·PDCA 5단계·E2E 표준 상세: [docs/00-pm/feature-workflow.md](docs/00-pm/feature-workflow.md).

**검증 기준 (강제)**: 계획·설계·분석·검토 문서의 모든 주장은 **추정 금지**. 인용 file:line은 실제 파일로, 동작·수치는 throwaway probe/anchor 실측으로 검증 후 단정. "현행 일치 예상"·"아마"·미확인 인용 금지. 미검증은 "확인 필요" 명시. (memory `feedback_pre_anchor_verification` · `feedback_numeric_impact_verify_before_bug_claim` · `feedback_korean_law_citation_verify`)

### Definition of Done — 14개 동기화 지점

엔진 input·result 변경 시 14개 **모두** 동기화. ⑫⑬⑭는 TypeScript 미감지 — 누락 시 침묵 stripping/엔진 미도달.

**클라이언트 8개**: ①폼 상태 → ②initial → ③normalize → ④API 변환(`lib/calc/{tax}-api.ts`) → ⑤UI 위젯 → ⑥사이드바 합계 → ⑦결과 카드 → ⑧validation(`lib/calc/{tax}-validate.ts`).

**API/Route 6개**: ⑨Zod enum 메인 → ⑩Zod enum 컴패니언+`addPropertyRefines` → ⑪자산-수준 `acquisitionDate` fallback → **⑫Zod 입력 객체 정의** → **⑬callTransferTaxAPI body spread** → **⑭Route handler 엔진 input 매핑(Date 변환)**.

**5단 파이프라인 전수 점검**: 폼(①②③) → 변환(④⑬) → fetch body(⑬) → Zod(⑨⑩⑫) → Route(⑪⑭) → 엔진 input. ⑧ 규칙: API/UI fallback 있는 필드는 validate도 동일 fallback. UI 통과↔validate 차단 모순 금지.

**3중 패턴 강제** (memory `mirror-pattern`): UI display fallback이 있는 필드는 API 변환·validate 모두 동일 fallback 적용. 토글/라디오 기본값(예: `redevSubject || "apt"`)도 3 layer 모두 일치. `useEffect → store` 미러링으로 fallback 구현 금지 — 무한 루프 위험.

**완료 보고 전 자가 점검**:
- [ ] 케이스 매트릭스 표 모든 분기 enumerate (단순 케이스부터)
- [ ] anchor 테스트 작성
- [ ] 14지점 전부 (⑫⑬⑭ grep 자가 점검)
- [ ] API fallback ↔ validation 동기화
- [ ] `npx tsc --noEmit` 0건
- [ ] `npx vitest run __tests__/tax-engine/{tax}/` 통과
- [ ] **브라우저 수동 확인** (폼→계산→결과, Network 탭 request body 신규 필드 확인). 미수행 시 명시.

## 참조 문서

| 영역 | 파일 |
|---|---|
| 세금 엔진 (파일·의존·정수·양도세 설계) | [lib/tax-engine/CLAUDE.md](lib/tax-engine/CLAUDE.md) |
| UI 마법사 (StepWizard·공용·14지점 상세) | [components/calc/CLAUDE.md](components/calc/CLAUDE.md) |
| 테스트 (Mock·시나리오 분할·anchor) | [__tests__/tax-engine/CLAUDE.md](__tests__/tax-engine/CLAUDE.md) |
| 로컬 저장소 (Dexie·resultData·Supabase 전환) | [lib/storage/CLAUDE.md](lib/storage/CLAUDE.md) |
| 키움 자동조회 (시점·인프라·법령) | [lib/kiwoom/CLAUDE.md](lib/kiwoom/CLAUDE.md) |
| 새 기능 워크플로 (에이전트·PDCA·E2E 상세) | [docs/00-pm/feature-workflow.md](docs/00-pm/feature-workflow.md) |
| PRD / Roadmap | `docs/00-pm/korean-tax-calc.{prd,roadmap}.md` |
| Engine / DB / UI Design | `docs/02-design/features/korean-tax-calc-{engine,db-schema,ui}.design.md` |
| 신규 기능 템플릿 / 세목 UI 킥오프 | `docs/02-design/features/_template.engine.design.md` · `_new-tax-ui-kickoff.checklist.md` |
| 최근 완료 이력 | [docs/00-pm/recent-completions.md](docs/00-pm/recent-completions.md) |
