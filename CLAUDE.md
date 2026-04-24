# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**KoreanTaxCalc** — 한국 부동산 6대 세금 자동계산 웹 앱 (양도소득세·상속세·증여세·취득세·재산세·종합부동산세).

**현재 구현 상태**
- ✅ **양도소득세**: 엔진·UI·API·테스트 완전 구현 (2025 세법 기준, 꾸준히 업그레이드 중)
- 🚧 **취득세·재산세·종합부동산세·상속·증여**: 엔진 구현 완료, UI 부분 구현 (`components/calc/property/` 재산세 UI 진행 중)

## ⚠️ Next.js 16 주의사항

이 프로젝트는 **Next.js 16**을 사용합니다. `AGENTS.md`의 경고 참조: *"This is NOT the Next.js you know"* — API·컨벤션·파일 구조가 학습 데이터와 다를 수 있습니다.

- **`middleware.ts` → `proxy.ts`**: Next.js 16에서 rename. 세션 처리는 `proxy.ts`에서 수행.
- 변경 사항 확인 시 `node_modules/next/dist/docs/` 내 가이드를 먼저 읽을 것.

## Commands

```bash
npm run dev                   # 개발 서버 (Turbopack)
npm run build                 # 프로덕션 빌드
npm run lint                  # ESLint
npm test                      # vitest 전체 (80 파일 / 1,484 tests)
npm run test:watch            # watch 모드
npx vitest run <path>         # 단일 파일/디렉터리 실행
npx shadcn@latest add <name>  # shadcn/ui 컴포넌트 추가

# 데이터·법령 시딩·검증 (.env.local 필요)
npm run seed:tax-rates        # Supabase tax_rates 시딩 (scripts/seed-transfer-tax-rates.ts)
npm run verify:legal          # 법령 조문 상수 검증 (scripts/verify-legal-codes.ts)
npm run verify:legal:refresh  # 캐시 무효화 후 재검증
```

## Tech Stack

- **Frontend**: Next.js 16 (App Router, React 19, Turbopack) + TypeScript strict
- **UI**: shadcn/ui + Tailwind CSS v4 + zustand (마법사 폼 상태)
- **Backend**: Next.js Route Handlers (계산 API) + Server Actions (`actions/calculations.ts`, 이력 CRUD)
- **Auth/DB**: Supabase (Auth + PostgreSQL) — `lib/supabase/`
- **Observability**: Sentry (`sentry.{client,edge,server}.config.ts`)
- **Testing**: vitest + jsdom — `__tests__/tax-engine/`

## Architecture — 2-Layer Tax Engine

```
Layer 1: Orchestrator (app/api/calc/{tax-type}/route.ts)
  → Rate Limiting (lib/api/rate-limit.ts) — IP당 분당 30회
  → Zod 입력 검증 (discriminatedUnion 감면 스키마)
  → preloadTaxRates() — Supabase RPC로 세율 일괄 로드 (DB 쿼리 1회)
  → Pure Engine 호출 (세율 데이터를 매개변수로 전달)
  → saveCalculation() Server Action으로 이력 저장 (로그인 시)

Layer 2: Pure Engine (lib/tax-engine/*.ts)
  → DB 직접 호출 없음, 순수 함수 — 테스트 시 DB mock 불필요
  → comprehensive-tax.ts는 property-tax.ts를 직접 import (재산세↔종부세 연동)
  → 단방향 의존만 허용: comprehensive → property (역방향 금지)
```

세부 엔진 구조·파일 조직 규칙은 [lib/tax-engine/CLAUDE.md](lib/tax-engine/CLAUDE.md) 참조.

## File Size Policy

**모든 파일 800줄 이하 유지 (강제 규칙)**

- 새 파일 생성 또는 기존 파일 수정 시 800줄 초과 금지.
- 초과 시 PostToolUse hook이 경고 (`⚠️ {file} exceeds 800 lines ({N})`). 즉시 분할 후 진행.
- 분할 패턴: orchestrator + helpers / types / sections 로 분리. 구체 패턴은 [lib/tax-engine/CLAUDE.md](lib/tax-engine/CLAUDE.md) 참조.
- Hook 설정: `.claude/settings.json` PostToolUse. 비활성화는 `/hooks` UI 또는 해당 항목 삭제.

## Critical Design Decisions (프로젝트 전체 관통)

- **DB 기반 세율 관리**: 세율·공제한도를 `tax_rates` 테이블 jsonb로 관리. 세법 변경 시 배포 없이 업데이트. TaxRateMap key 형식: `${tax_type}:${category}:${sub_category}`.
- **정수 연산 원칙**: 모든 금액은 원(KRW, 정수). 곱셈-후-나눗셈 순서. `lib/tax-engine/tax-utils.ts`의 `applyRate()` / `safeMultiply()` 사용. BigInt fallback for overflow.
- **중간 절사 원칙**: 소수 세율 × 금액 곱셈 직후 반드시 `Math.floor()`. 지방소득세는 `applyRate()` (원 미만 절사 — 지방세법 §103의3, 천원 절사 규정 없음).
- **감면 중복배제 (조특법 §127 ②)**: 동일 자산에 복수 감면 해당 시 납세자 유리 1건만 선택. 후보 배열에서 max 선택 패턴.
- **법령 조문 상수**: 문자열 리터럴 직접 사용 금지. `lib/tax-engine/legal-codes/` 에서 `TRANSFER.*` / `NBL.*` / `ACQUISITION.*` 등 세목별 상수 사용.
- **Auth**: 비로그인도 계산 가능. 로그인 시 이력·PDF. sessionStorage로 게스트 결과 보존 → 로그인 후 마이그레이션. `result`는 partialize에서 제외 (민감정보 + Date 직렬화).
- **Supabase RPC**: `DISTINCT ON`은 Supabase JS 미지원 → DB Function `preload_tax_rates()`로 구현.

## 서브 CLAUDE.md (도메인별 심화)

| 영역 | 파일 | 다룬 주제 |
|---|---|---|
| 세금 엔진 | [lib/tax-engine/CLAUDE.md](lib/tax-engine/CLAUDE.md) | 파일 조직(orchestrator·helpers·types·legal-codes), 신기능 추가 워크플로, 정수 연산 디테일 |
| UI 마법사 | [components/calc/CLAUDE.md](components/calc/CLAUDE.md) | StepWizard 네비게이션, Step 파일 분리 패턴, 공용 입력 컴포넌트 |
| 테스트 | [__tests__/tax-engine/CLAUDE.md](__tests__/tax-engine/CLAUDE.md) | Mock 공유 패턴(`_helpers/`), 시나리오별 분할 원칙, 팩토리 함수 |

각 서브 CLAUDE.md는 해당 디렉터리에서 작업할 때 자동으로 Claude Code 컨텍스트에 포함됩니다.

## Database (Supabase)

- **마이그레이션**: `supabase/migrations/` — `tax_rates`·`regulated_areas`·`standard_prices`·`users`·`calculations` 테이블 DDL.
- **초기 데이터**: `supabase/seed/`·`supabase/seeds/` — `npm run seed:tax-rates`로 반영.
- **환경변수**: `NEXT_PUBLIC_SUPABASE_URL`·`NEXT_PUBLIC_SUPABASE_ANON_KEY`·`SUPABASE_SERVICE_ROLE_KEY`. 미설정 시에도 `proxy.ts`가 graceful 통과 → Supabase 없이 로컬 개발 가능.

## Route Protection (`proxy.ts`)

Supabase 세션 기반:
- 보호 라우트 (`/history`, `/api/history`, `/api/pdf`): 미인증 시 `/auth/login` 리다이렉트.
- `/api/calc/*`, `/api/law/*`: 인증 불필요 (비로그인 계산·리서치 허용).

## Observability (Sentry)

- 3개 환경별 설정: `sentry.client.config.ts` / `sentry.edge.config.ts` / `sentry.server.config.ts`.
- 운영 이슈 재현 시 Sentry 이벤트의 `tax_type`·`request_id` 태그로 역추적.

## 법령 리서치 (`/law`)

korean-law-mcp 15개 도구를 법제처 Open API 직접 호출로 재현한 통합 검색 페이지.

- **API Route**: `app/api/law/{search-law, law-text, search-decisions, decision-text, annexes, chain}/route.ts`
- **UI 탭 4종**: 법령·조문 / 판례·결정례 / 별표·서식 / 리서치 체인
- **환경변수**: `KOREAN_LAW_OC` (법제처 Open API 인증키, https://open.law.go.kr 에서 발급)
- **캐시**: `.legal-cache/` 파일 캐시 7일 TTL
- **별칭**: `상증법 → 상속세및증여세법` 등 52종 자동 해석 (`lib/korean-law/aliases.ts`)
- **클라이언트 구조**: `lib/korean-law/client.ts` 는 barrel. 실체는 `client-core.ts` / `client-law.ts` / `client-decisions-search.ts` / `client-decisions-text.ts` / `client-annexes.ts` 5개 파일로 분리됨.

## Key Documents

새 세금 계산기·특례 구현 시 반드시 해당 설계 문서를 먼저 읽을 것.

| 문서 | 경로 |
|---|---|
| PRD | `docs/00-pm/korean-tax-calc.prd.md` |
| Roadmap | `docs/00-pm/korean-tax-calc.roadmap.md` |
| Engine Design | `docs/02-design/features/korean-tax-calc-engine.design.md` |
| DB Schema Design | `docs/02-design/features/korean-tax-calc-db-schema.design.md` |
| UI Design | `docs/02-design/features/korean-tax-calc-ui.design.md` |
| Auth Design | `docs/02-design/features/korean-tax-calc-auth.design.md` |

## PDCA Workflow (bkit)

이 프로젝트는 bkit PDCA 사이클을 따른다: PM → Plan → Design → **Do** → Check → Act. `.bkit/state/pdca-status.json`에서 현재 단계 확인. 구현 후 gap-detector로 설계 대비 일치도 검증 (목표 90%+).

## Custom Agents

`.claude/agents/`에 세목별·특례별 전문 에이전트. 새 기능 구현 시 해당 전문 에이전트를 활성화할 것.

| 세목 | 에이전트 |
|---|---|
| 양도소득세 | `transfer-tax-senior` + `multi-house-surcharge-senior` / `one-house-tax-senior` / `non-business-land-tax-senior` / `long-term-rental-tax-senior` / `new-housing-tax-senior` / `transfer-deduction-senior` |
| 취득세 | `acquisition-tax-senior` + `-base` / `-object` / `-rate` / `-standard-price` / `-surcharge` / `-qa` |
| 재산세 | `property-tax-senior` + `-object` / `-comprehensive-aggregate` / `-separate-aggregate` / `-separate` / `-qa` |
| 종합부동산세 | `comprehensive-tax-senior` + `-house` / `-land-aggregate` / `-separate-land` / `-exclusion` / `-qa` |
| 상속·증여 | `inheritance-gift-tax-senior` + `-deduction` / `-credit` / `-nontax-teacher` / `property-valuation-senior` |
| QA 리더 | `tax-qa-lead` (6대 세목 QA 병렬 실행) |
