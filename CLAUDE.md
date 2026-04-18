# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**KoreanTaxCalc** — 한국 부동산 6대 세금 자동계산 웹 앱 (양도소득세·상속세·증여세·취득세·재산세·종합부동산세).

**현재 구현 상태**:
- ✅ **양도소득세**: 계산 엔진 + UI + API + 테스트 완전 구현
- ⏳ **나머지 5개 세금**: 페이지 라우트(스켈레톤)만 존재, 엔진 미구현

## Commands

```bash
npm run dev          # 개발 서버 (Turbopack)
npm run build        # 프로덕션 빌드
npm run lint         # ESLint
npm test             # vitest 전체 테스트 (339개)
npm run test:watch   # vitest watch 모드
```

단일 테스트 파일 실행:
```bash
npx vitest run __tests__/tax-engine/transfer-tax.test.ts
```

shadcn/ui 컴포넌트 추가:
```bash
npx shadcn@latest add <component-name>
```

## Tech Stack

- **Frontend**: Next.js 16 (App Router, React 19, Turbopack)
- **UI**: shadcn/ui + Tailwind CSS v4, zustand (마법사 폼 상태)
- **Backend**: Next.js Route Handlers (계산 API) + Server Actions (`actions/calculations.ts`, 이력 CRUD)
- **Auth/DB**: Supabase (Auth + PostgreSQL) — `lib/supabase/` 에 client/server/middleware 설정 완료
- **Testing**: vitest + jsdom — `__tests__/tax-engine/` 디렉토리
- **Language**: TypeScript strict mode

## Architecture — 2-Layer Tax Engine

```
Layer 1: Orchestrator (app/api/calc/{tax-type}/route.ts)
  → Rate Limiting (lib/api/rate-limit.ts) — IP당 분당 30회
  → Zod 입력 검증 (discriminatedUnion 감면 스키마)
  → preloadTaxRates() — Supabase RPC로 세율 일괄 로드 (DB 쿼리 1회)
  → Pure Engine 호출 (세율 데이터를 매개변수로 전달)
  → 결과 반환 / saveCalculation() Server Action으로 이력 저장

Layer 2: Pure Engine (lib/tax-engine/*.ts)
  → DB 직접 호출 없음, 순수 함수 — 테스트 시 DB mock 불필요
  → comprehensive-tax.ts는 property-tax.ts를 직접 import (재산세↔종부세 연동)
  → 단방향 의존만 허용: comprehensive → property (역방향 금지)
```

**양도소득세 특화 서브엔진** (각각 독립 파일, transfer-tax.ts에서 호출):
- `multi-house-surcharge.ts` — 다주택 중과세 판정 (HouseInfo[] 배열 기반)
- `non-business-land.ts` — 비사업용 토지 정밀 판정 (NonBusinessLandInput)
- `rental-housing-reduction.ts` — 장기임대 감면 V2 엔진
- `new-housing-reduction.ts` — 신축/미분양 감면 V2 엔진

## Critical Design Decisions

- **DB 기반 세율 관리**: 세율·공제한도를 `tax_rates` 테이블 jsonb로 관리. 세법 변경 시 배포 없이 업데이트. TaxRateMap key 형식: `${tax_type}:${category}:${sub_category}`.
- **Supabase RPC**: `DISTINCT ON`은 Supabase JS 미지원 → DB Function `preload_tax_rates()`로 구현.
- **정수 연산 원칙**: 모든 금액은 원(KRW, 정수) 단위. 곱셈-후-나눗셈 순서. BigInt fallback for overflow. `lib/tax-engine/tax-utils.ts`의 `applyRate()`, `safeMultiply()` 사용.
- **중간 절사 원칙**: 소수 세율 × 금액 곱셈 직후 반드시 `Math.floor()` 적용. 지방소득세는 천원 미만 절사 (`truncateToThousand()`).
- **감면 중복 배제**: 동일 자산에 복수 감면이 해당될 때 납세자 유리 1건만 선택 (조특법 §127 ②). 후보 배열에서 max 선택.
- **법령 조문 상수**: 법령 문자열 리터럴 직접 사용 금지. `lib/tax-engine/legal-codes.ts`의 `NBL.*`, `TRANSFER.*` 상수 사용.
- **Auth**: 비로그인도 계산 가능, 로그인 시 이력/PDF. Supabase Auth redirect-only (no popup). sessionStorage로 게스트 결과 보존 → 로그인 후 마이그레이션. `result`는 sessionStorage partialize에서 제외 (민감정보 + Date 직렬화 문제).

## UI Conventions

- **날짜 입력**: `<input type="date">` 사용 금지. 반드시 `@/components/ui/date-input.tsx`의 `DateInput` 컴포넌트 사용 (연/월/일 분리 입력, 6자리 연도 표시).
- **포커스 시 전체 선택**: `SelectOnFocusProvider`(`components/providers/SelectOnFocusProvider.tsx`)가 layout에 전역 등록되어 있어 모든 `<input>`/`<textarea>`에 자동 적용됨. 개별 `onFocus` 추가 불필요.
- **StepWizard 네비게이션**: 모든 단계에 뒤로가기 + 다음 버튼 필수. 1단계 뒤로가기 = 홈(`/`)으로 이동.
- **금액 입력**: `@/components/calc/inputs/CurrencyInput.tsx` 사용. `parseAmount()` 유틸로 문자열 → 정수 변환.

## Component Structure

```
components/
├── providers/
│   └── SelectOnFocusProvider.tsx   # 전역 포커스 시 자동 선택
├── calc/
│   ├── inputs/CurrencyInput.tsx    # 원화 입력 + parseAmount(), formatKRW()
│   ├── results/
│   │   └── TransferTaxResultView.tsx
│   ├── shared/
│   │   ├── DisclaimerBanner.tsx
│   │   └── LoginPromptBanner.tsx
│   ├── MultiHouseSurchargeDetailCard.tsx
│   ├── NonBusinessLandResultCard.tsx
│   └── StepIndicator.tsx
└── ui/
    ├── date-input.tsx              # 반드시 이것 사용 (type="date" 대체)
    └── address-search.tsx          # Vworld API 기반 주소 검색
```

## lib/ Utilities

```
lib/
├── api/rate-limit.ts               # 슬라이딩 윈도우 rate limiter (프로덕션은 Upstash 권장)
├── calc/
│   ├── transfer-tax-api.ts         # callTransferTaxAPI() — UI → API 변환
│   └── transfer-tax-validate.ts    # validateStep() — 단계별 유효성 검사
├── db/tax-rates.ts                 # preloadTaxRates(), getRate(), TaxRatesMap 타입
├── korean-law/                     # 법령 리서치 모듈 (법제처 Open API 래퍼)
│   ├── client.ts                   # searchLaw, getLawText, searchDecisions, getDecisionText, getAnnexes
│   ├── aliases.ts                  # 세법 약칭 ↔ 정식명 사전 (상증법 → 상속세및증여세법 등)
│   ├── chains.ts                   # 8개 리서치 체인 오케스트레이터 (full_research, document_review 등)
│   └── types.ts                    # Zod 스키마 + TS 타입 (DECISION_DOMAINS 17, CHAIN_TYPES 8)
├── stores/calc-wizard-store.ts     # Zustand 마법사 상태 + sessionStorage persist
└── tax-engine/
    ├── legal-codes.ts              # 법령 조문 상수 (NBL.*, TRANSFER.*)
    ├── tax-utils.ts                # applyRate(), safeMultiply(), truncateToThousand()
    └── tax-errors.ts               # TaxCalculationError, TaxErrorCode
```

## Supabase Setup

환경변수 `.env.local` 필요:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` (서버 전용)

환경변수 미설정 시에도 middleware가 graceful하게 통과하므로 Supabase 없이 개발 가능.

## Route Protection

`middleware.ts`에서 Supabase 세션 기반으로 라우트 보호:
- 보호 라우트 (`/history`, `/api/history`, `/api/pdf`): 미인증 시 `/auth/login`으로 리다이렉트
- `/api/calc/*`, `/api/law/*`: 인증 불필요 (비로그인 계산/리서치 허용)

## 법령 리서치 (`/law`)

korean-law-mcp(chrisryugj/korean-law-mcp)의 15개 MCP 도구를 법제처 Open API
직접 호출로 재현한 통합 검색 페이지. 홈화면에서 "법령 리서치" 카드로 진입.

- **API Route**: `app/api/law/{search-law, law-text, search-decisions, decision-text, annexes, chain}/route.ts`
- **UI 탭 4종**: 법령·조문 / 판례·결정례 / 별표·서식 / 리서치 체인
- **환경변수**: `KOREAN_LAW_OC` (법제처 Open API 인증키). 발급: https://open.law.go.kr → 회원가입 → Open API 신청 → 승인 후 `.env.local`에 `KOREAN_LAW_OC=계정ID` 추가
- **캐시**: 기존 `.legal-cache/` 파일 캐시 7일 TTL 재사용
- **별칭**: `상증법 → 상속세및증여세법`, `종부세법 → 종합부동산세법` 등 52종 자동 해석 (`lib/korean-law/aliases.ts`)

## Key Documents

새 세금 계산기 구현 시 반드시 해당 설계 문서를 먼저 읽을 것.

| 문서 | 경로 |
|------|------|
| PRD | `docs/00-pm/korean-tax-calc.prd.md` |
| Roadmap | `docs/00-pm/korean-tax-calc.roadmap.md` |
| Engine Design | `docs/02-design/features/korean-tax-calc-engine.design.md` |
| DB Schema Design | `docs/02-design/features/korean-tax-calc-db-schema.design.md` |
| UI Design | `docs/02-design/features/korean-tax-calc-ui.design.md` |
| Auth Design | `docs/02-design/features/korean-tax-calc-auth.design.md` |

## PDCA Workflow (bkit)

이 프로젝트는 bkit PDCA 사이클을 따른다:
- PM → Plan → Design → **Do** → Check → Act
- `.bkit/state/pdca-status.json`에서 현재 단계 확인 가능
- 구현 후 gap-detector로 설계 대비 구현 일치도 검증 (목표 90%+)

## Custom Agents

`.claude/agents/`에 세금별 전문 에이전트 정의 (각 세금의 세법 조항·계산 로직·특례/감면 규칙 전문):
- `transfer-tax-senior.md` — 양도소득세
- `property-tax-senior.md` — 재산세
- `comprehensive-tax-senior.md` — 종합부동산세
- `acquisition-tax-senior.md` — 취득세
- `inheritance-gift-tax-senior.md` — 상속세·증여세
- 기타 특례 전문 에이전트 (multi-house, one-house, long-term-rental 등)

새 세금 계산기 구현 시 해당 에이전트를 활성화하여 도메인 전문성을 활용할 것.
