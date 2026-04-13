# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**KoreanTaxCalc** — 한국 부동산 6대 세금 자동계산 웹 앱 (양도소득세·상속세·증여세·취득세·재산세·종합부동산세).
현재 Design 단계 완료, Do(구현) 단계 진입 전 상태. 소스 코드는 아직 없으며, docs/ 아래 설계 문서가 구현의 근거이다.

## Tech Stack

- **Frontend**: Next.js 15 (App Router, React 19, Turbopack)
- **UI**: shadcn/ui + Tailwind CSS v4, react-hook-form + zod, zustand
- **Backend**: Next.js Route Handlers (계산 API) + Server Actions (이력 CRUD)
- **Auth/DB**: Supabase (Auth + PostgreSQL)
- **Deploy**: Vercel
- **Testing**: vitest + @testing-library/react (단위), Playwright (E2E)
- **Language**: TypeScript 5.x strict, Node.js 22 LTS

## Architecture — 2-Layer Tax Engine

```
Layer 1: Orchestrator (API Route Handler)
  → preloadTaxRates() — Supabase RPC로 세율 일괄 로드 (DB 쿼리 1회)
  → Pure Engine 호출 (세율 데이터를 매개변수로 전달)
  → 결과 반환 / 이력 저장

Layer 2: Pure Engine (lib/tax-engine/*.ts)
  → DB 직접 호출 없음, 순수 함수
  → 테스트 시 DB mock 불필요
  → comprehensive-tax.ts는 property-tax.ts를 직접 import하여 재산세↔종부세 연동
```

## Critical Design Decisions

- **DB 기반 세율 관리**: 세율·공제한도를 `tax_rates` 테이블 jsonb로 관리. 세법 변경 시 배포 없이 업데이트.
- **sub_category 컬럼**: 동일 `(tax_type, category)` 내 복수 규칙 구분. TaxRateMap key는 `${tax_type}:${category}:${sub_category}`.
- **Supabase RPC**: `DISTINCT ON`은 Supabase JS 미지원 → DB Function `preload_tax_rates()`로 구현.
- **정수 연산 원칙**: 모든 금액은 원(KRW, 정수) 단위. 곱셈-후-나눗셈 순서. BigInt fallback for overflow.
- **중간 절사 원칙**: 소수 세율 × 금액 곱셈 직후 반드시 `Math.floor()` 적용 (부동소수점 오차 방지).
- **절사 규칙**: 과세표준 천원/만원 미만 절사, 산출세액 원 미만 절사 — 세금 종류별로 다름.
- **Auth**: 비로그인도 계산 가능, 로그인 시 이력/PDF. Supabase Auth redirect-only (no popup). sessionStorage로 게스트 결과 보존 → 로그인 후 마이그레이션.

## Key Documents

| 문서 | 경로 |
|------|------|
| PRD | `docs/00-pm/korean-tax-calc.prd.md` |
| Roadmap | `docs/00-pm/korean-tax-calc.roadmap.md` |
| Development Plan | `docs/01-plan/features/korean-tax-calc.plan.md` |
| Engine Design | `docs/02-design/features/korean-tax-calc-engine.design.md` |
| DB Schema Design | `docs/02-design/features/korean-tax-calc-db-schema.design.md` |
| UI Design | `docs/02-design/features/korean-tax-calc-ui.design.md` |
| Auth Design | `docs/02-design/features/korean-tax-calc-auth.design.md` |

구현 시 반드시 해당 설계 문서를 먼저 읽고, 설계 사양을 따를 것.

## Planned Module Structure

```
lib/
  tax-engine/
    transfer-tax.ts           # 양도소득세 (Pure Engine)
    inheritance-tax.ts        # 상속세
    gift-tax.ts               # 증여세
    acquisition-tax.ts        # 취득세
    property-tax.ts           # 재산세
    comprehensive-tax.ts      # 종합부동산세 (→ property-tax import)
    tax-utils.ts              # 공통 유틸 (누진세율, 절사, 보유기간, BigInt)
    tax-errors.ts             # 에러 코드 enum
    schemas/rate-table.schema.ts  # jsonb Zod 검증
  db/
    tax-rates.ts              # preloadTaxRates (Supabase RPC 호출)
    calculations.ts           # 계산 이력 CRUD
  validators/                 # 6개 세금별 Zod 입력 스키마
  stores/
    calc-wizard-store.ts      # zustand + sessionStorage persist
```

## PDCA Workflow (bkit)

이 프로젝트는 bkit PDCA 사이클을 따른다:
- PM → Plan → Design → **Do** → Check → Act
- `.bkit/state/pdca-status.json`에서 현재 단계 확인 가능
- 구현 후 gap-detector로 설계 대비 구현 일치도 검증 (목표 90%+)

## Custom Agents

`.claude/agents/`에 11개 세금 전문 에이전트 정의:
- `transfer-tax-senior.md`, `property-tax-senior.md`, `comprehensive-tax-senior.md` 등
- 각 세금별 세법 조항, 계산 로직, 특례/감면 규칙에 대한 도메인 전문성 보유
