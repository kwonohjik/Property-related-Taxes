# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**KoreanTaxCalc** — 한국 부동산 6대 세금 자동계산 웹 앱 (양도·상속·증여·취득·재산·종합부동산세).

- 구현 현황: [`docs/00-pm/korean-tax-calc.roadmap.md`](docs/00-pm/korean-tax-calc.roadmap.md). 양도세만 엔진·UI·API·테스트 완전 구현. 나머지는 엔진 완료·UI 대기.
- 진행 중: 양도세 감면 23개 조문 확장 — `lib/tax-engine/transfer-reductions/` (계획: `docs/00-pm/transfer-reduction-expansion.plan.md`).
- 최근 완료 작업 이력: [`docs/00-pm/recent-completions.md`](docs/00-pm/recent-completions.md).

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
npx shadcn@latest add <name>  # shadcn/ui 컴포넌트 추가

# 데이터·법령 (.env.local 필요)
npm run seed:tax-rates        # Supabase tax_rates 시딩
npm run verify:legal          # 법령 조문 상수 검증
npm run verify:legal:refresh  # 캐시 무효화 후 재검증
```

**자동 게이트**: husky pre-commit(lint-staged) + pre-push(typecheck + test) + GitHub Actions.

**ESLint --fix 함정**: pre-commit lint-staged의 `eslint --fix`가 미사용 import 라인 정리 시 **같은 라인의 사용 중인 named export까지 함께 제거**할 수 있다 (예: `import { CurrencyInput, parseAmount }`에서 CurrencyInput만 미사용일 때 parseAmount도 제거 → TS2304). 회피: 신규 import는 한 라인에 한 named만 두거나, 별도 라인으로 분리. pre-push의 `tsc --noEmit`이 잡아주지만 별도 fix 커밋 1개가 추가됨.

## Tech Stack

Next.js 16 (App Router, React 19, Turbopack) + TS strict / shadcn(BaseUI) + Tailwind v4 + zustand / Next Route Handlers + Server Actions (`actions/calculations.ts`) / Supabase (Auth + Postgres) / vitest + jsdom + RTL / Sentry (`tax_type`·`request_id` 태그).

## Architecture — 2-Layer Tax Engine

```
Layer 1: Orchestrator (app/api/calc/{tax-type}/route.ts)
  → Rate limiting (lib/api/rate-limit.ts) IP당 분당 30회
  → Zod 검증 (discriminatedUnion 감면 스키마)
  → preloadTaxRates() Supabase RPC 일괄 로드
  → Pure Engine 호출 (세율 데이터 매개변수 전달)
  → saveCalculation() Server Action (로그인 시 이력 저장)

Layer 2: Pure Engine (lib/tax-engine/*.ts)
  → DB 직접 호출 없음, 순수 함수
  → 단방향 의존만 허용: comprehensive → property (역방향 금지)
  → 감면 라우터: lib/tax-engine/transfer-reductions/ (23개 조문)
  → 양도세 4-파일 분할: transfer-tax.ts + transfer-tax-helpers.ts
    + transfer-tax-rate-calc.ts + transfer-tax-finalize.ts
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
- 감면 중복배제(조특법 §127②): 후보 배열 max 패턴.
- 법령 조문 상수: 문자열 리터럴 금지. `lib/tax-engine/legal-codes/` 의 `TRANSFER.*` 등 상수.

**API Date 직렬화** — `lib/api/date-coerce.ts` 필수. JSON 경유 후 string 도달 → `Date < string` silent false 함정. `toDate(v, "field")` / `toOptionalDate(v)` / `coerceDates(obj, [...])`. 신규 코드 `new Date(x)` 직접 호출 금지.

**설계 원칙 (UI 금지)**:
- 자동 안분 fallback 금지(예외: PHD §164⑤). 미입력은 검증 오류로 차단.
- useEffect → store 미러링 금지. cross-field 동기화는 onChange/useMemo.
- 법령 정확성 최우선. 납세자 유리/불리·절감 표현 금지.

## UI 작성 원칙 (요약 — 상세: [components/calc/CLAUDE.md](components/calc/CLAUDE.md))

계산 로직 순서 = UI 표시 순서(모드 토글은 영향 필드 직전). 사이드바 합계는 계산 가능한 항목만 0원 제외. 결과 산식은 한국어 풀어쓰기(변수 약어·`floor()` 금지). 토글/라디오는 `ToggleCard`/`RadioCardGroup` 필수, native 신규 금지, OFF도 tone 유지. 공시지가는 `LandPriceLookupField` 필수. 면적 반올림(UI 한정) `parseFloat(toFixed(2))` 후 단가 곱셈. placeholder 숫자 예시 금지 — 형식 설명은 FieldCard `hint`.

**자산 종류 특수 분기 진입점**: `components/calc/transfer/CompanionAcqPurchaseBlock.tsx` — 상단 일반 "취득가액 산정 방식·취득가액" 영역을 `assetKind`(redevelopment_apt·general_building·commercial_building 등)/`transferType`(burdened_gift)별로 조건부 숨김. 특수 분기 추가 시 violet/fuchsia 안내 카드 패턴 차용. 자산-수준 입력은 해당 자산 전용 Block(`RedevelopmentBlock`/`GeneralBuildingBlock`/`CommercialBuildingBlock`)에 격리.

## 인프라

**Supabase / DB**: `supabase/migrations/`(tax_rates·regulated_areas·standard_prices·users·calculations). 시딩 `npm run seed:tax-rates`. 환경변수 미설정 시 graceful 통과(로컬 개발 가능). `DISTINCT ON` 미지원 → DB Function `preload_tax_rates()`.

**Route Protection (`proxy.ts`)**: 보호 `/history`·`/api/history`·`/api/pdf`. 미보호 `/api/calc/*`·`/api/law/*`(비로그인 계산 허용).

**로컬 저장소**: IndexedDB(Dexie). 비로그인 sessionStorage 보존→로그인 후 마이그레이션. zustand `result`는 partialize 제외. Store 마이그: `lib/stores/calc-wizard-migration.ts`. 상세: [lib/storage/CLAUDE.md](lib/storage/CLAUDE.md).

## 법령 리서치 (`/law`)

법제처 Open API 직접 호출. 환경변수 `KOREAN_LAW_OC`.

- Routes: `app/api/law/{search-law,law-text,search-decisions,decision-text,annexes,chain}/route.ts`
- Client barrel: `lib/korean-law/client.ts` (5파일 분할).
- 별칭 52종: `lib/korean-law/aliases.ts`. 캐시 `.legal-cache/` 7일 TTL.

## 새 기능 추가 워크플로 (강제)

### 에이전트

엔진/UI 시니어는 **Plan 단계부터 병렬 참여**(Agent tool 단일 메시지). 한쪽만 단독 보고 금지.

- 엔진: `transfer-tax-senior` / `acquisition-tax-senior` / `property-tax-senior` / `comprehensive-tax-senior` / `inheritance-gift-tax-senior` (+세목별 서브)
- UI: `{transfer|acquisition|property|comprehensive|inheritance-gift}-tax-ui-senior`
- QA: `tax-qa-lead` (6대 세목 병렬), `ui-engine-sync-checker` (read-only)

**Plan 병렬 / Do 시퀀셜 위임 패턴** (사례 36 검증):
1. Plan/Design — 엔진+UI 시니어 단일 메시지 동시 호출
2. **Do — 시퀀셜**: 엔진 시니어가 ①②③④⑧⑨⑫⑭ 선처리(타입·헬퍼·anchor) → UI 시니어가 결과 받아 ⑤⑥⑦만 담당 → ④/⑬ 충돌 회피
3. Check — `ui-engine-sync-checker` (14지점 read-only) → `bkit:gap-detector` (계획-구현 matchRate)
4. UI 시니어 단독 작업 중 자주 중단되는 5가지(800줄·14지점·TS 연쇄·plan mode 상속·복잡 컴포넌트) → memory `feedback_pdca_session_efficiency` 6가지 사전 적용

### PDCA 5단계

1. **PM/Plan**: 법령 근거. 엔진+UI 시니어 동시 호출. 신규 세목 UI 첫 진입 시 `docs/02-design/features/_new-tax-ui-kickoff.checklist.md`.
2. **Design**: `_template.engine.design.md` 복사. **케이스 인벤토리 표 행≥1 필수** — 비면 Do 진입 금지.
3. **Do**: 엔진 = 엔진+anchor. UI = 14개 동기화 지점. 디자인 갱신 없이 우회 금지.
4. **Check**: `ui-engine-sync-checker` + QA + 브라우저 수동 확인.
5. **Act**: 회귀 후속 + 디자인 환류. 상태: `.bkit/state/pdca-status.json`.

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
| PRD / Roadmap | `docs/00-pm/korean-tax-calc.{prd,roadmap}.md` |
| Engine / DB / UI Design | `docs/02-design/features/korean-tax-calc-{engine,db-schema,ui}.design.md` |
| 신규 기능 템플릿 | `docs/02-design/features/_template.engine.design.md` |
| 신규 세목 UI 킥오프 | `docs/02-design/features/_new-tax-ui-kickoff.checklist.md` |
| 최근 완료 이력 | [docs/00-pm/recent-completions.md](docs/00-pm/recent-completions.md) |
