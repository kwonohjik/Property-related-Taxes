# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**KoreanTaxCalc** — 한국 부동산 6대 세금 자동계산 웹 앱 (양도소득세·상속세·증여세·취득세·재산세·종합부동산세).
현재 Phase 1(프로젝트 초기 설정) 완료 상태. 6개 세금별 계산기 페이지 라우트와 공통 유틸이 구현되어 있으며, 계산 엔진은 미구현.

## Commands

```bash
npm run dev          # 개발 서버 (Turbopack)
npm run build        # 프로덕션 빌드
npm run lint         # ESLint
npm test             # vitest 전체 테스트
npm run test:watch   # vitest watch 모드
```

단일 테스트 실행:
```bash
npx vitest run __tests__/tax-engine/tax-utils.test.ts
```

shadcn/ui 컴포넌트 추가:
```bash
npx shadcn@latest add <component-name>
```

## Tech Stack

- **Frontend**: Next.js 16 (App Router, React 19, Turbopack)
- **UI**: shadcn/ui + Tailwind CSS v4, react-hook-form + zod, zustand
- **Backend**: Next.js Route Handlers (계산 API) + Server Actions (이력 CRUD)
- **Auth/DB**: Supabase (Auth + PostgreSQL) — `lib/supabase/` 에 client/server/middleware 설정 완료
- **Testing**: vitest + @testing-library/react (jsdom) — `__tests__/` 디렉토리, `vitest.config.ts`
- **Language**: TypeScript strict mode

## Architecture — 2-Layer Tax Engine

```
Layer 1: Orchestrator (app/api/calc/{tax-type}/route.ts)
  → Zod 입력 검증
  → preloadTaxRates() — Supabase RPC로 세율 일괄 로드 (DB 쿼리 1회)
  → Pure Engine 호출 (세율 데이터를 매개변수로 전달)
  → 결과 반환 / 이력 저장

Layer 2: Pure Engine (lib/tax-engine/*.ts)
  → DB 직접 호출 없음, 순수 함수 — 테스트 시 DB mock 불필요
  → comprehensive-tax.ts는 property-tax.ts를 직접 import (재산세↔종부세 연동)
  → 단방향 의존만 허용: comprehensive → property (역방향 금지)
```

## Critical Design Decisions

- **DB 기반 세율 관리**: 세율·공제한도를 `tax_rates` 테이블 jsonb로 관리. 세법 변경 시 배포 없이 업데이트. TaxRateMap key 형식: `${tax_type}:${category}:${sub_category}`.
- **Supabase RPC**: `DISTINCT ON`은 Supabase JS 미지원 → DB Function `preload_tax_rates()`로 구현.
- **정수 연산 원칙**: 모든 금액은 원(KRW, 정수) 단위. 곱셈-후-나눗셈 순서. BigInt fallback for overflow. `lib/tax-engine/tax-utils.ts`의 `applyRate()`, `safeMultiply()` 사용.
- **중간 절사 원칙**: 소수 세율 × 금액 곱셈 직후 반드시 `Math.floor()` 적용. 절사 단위는 세금 종류별로 다름 (천원/만원 미만).
- **Auth**: 비로그인도 계산 가능, 로그인 시 이력/PDF. Supabase Auth redirect-only (no popup). sessionStorage로 게스트 결과 보존 → 로그인 후 마이그레이션.

## Key Documents

구현 시 반드시 해당 설계 문서를 먼저 읽고, 설계 사양을 따를 것.

| 문서 | 경로 |
|------|------|
| PRD | `docs/00-pm/korean-tax-calc.prd.md` |
| Roadmap | `docs/00-pm/korean-tax-calc.roadmap.md` |
| Development Plan | `docs/01-plan/features/korean-tax-calc.plan.md` |
| Engine Design | `docs/02-design/features/korean-tax-calc-engine.design.md` |
| DB Schema Design | `docs/02-design/features/korean-tax-calc-db-schema.design.md` |
| UI Design | `docs/02-design/features/korean-tax-calc-ui.design.md` |
| Auth Design | `docs/02-design/features/korean-tax-calc-auth.design.md` |

## Supabase Setup

환경변수 `.env.local` 필요 (`.env.local.example` 참조):
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` (서버 전용)

환경변수 미설정 시에도 middleware가 graceful하게 통과하므로 Supabase 없이 개발 가능.

## Route Protection

`middleware.ts`에서 Supabase 세션 기반으로 라우트 보호:
- 보호 라우트 (`/history`, `/api/history`, `/api/pdf`): 미인증 시 `/auth/login`으로 리다이렉트
- `/api/calc/*`: 인증 불필요 (비로그인 계산 허용)

## PDCA Workflow (bkit)

이 프로젝트는 bkit PDCA 사이클을 따른다:
- PM → Plan → Design → **Do** → Check → Act
- `.bkit/state/pdca-status.json`에서 현재 단계 확인 가능
- 구현 후 gap-detector로 설계 대비 구현 일치도 검증 (목표 90%+)

## Custom Agents

`.claude/agents/`에 11개 세금 전문 에이전트 정의:
- `transfer-tax-senior.md`, `property-tax-senior.md`, `comprehensive-tax-senior.md` 등
- 각 세금별 세법 조항, 계산 로직, 특례/감면 규칙에 대한 도메인 전문성 보유
