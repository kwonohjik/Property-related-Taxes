# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**KoreanTaxCalc** — 한국 부동산 6대 세금 자동계산 웹 앱 (양도소득세·상속세·증여세·취득세·재산세·종합부동산세).

**구현 상태**
- ✅ **양도소득세**: 엔진·UI·API·테스트 완전 구현. 마법사 4단계, 자산-수준 취득정보 통합, 토지/건물 분리 양도차익(소령 §166⑥), §164⑤ 3-시점 환산 지원.
- 🚧 **취득세·재산세·종부세·상속·증여**: 엔진 구현 완료, UI 부분 구현 중 (`components/calc/property/` 진행).
- ✨ **공용 입력 컴포넌트**: `FieldCard`·`SectionHeader`·`WizardSidebar`·`ToggleCard` 4종 — 양도세 마법사 적용, 타 세목 점진 확장.

## ⚠️ Next.js 16 주의사항

**This is NOT the Next.js you know** — API·컨벤션·파일 구조가 학습 데이터와 다를 수 있다.

- **`middleware.ts` → `proxy.ts`**: Next.js 16 rename. 세션 처리는 `proxy.ts`에서 수행.
- 변경 사항 확인 시 `node_modules/next/dist/docs/` 가이드를 먼저 읽을 것.

## Commands

```bash
npm run dev                   # 개발 서버 (Turbopack)
npm run build                 # 프로덕션 빌드
npm run lint                  # ESLint
npm test                      # vitest 전체 (90 파일 / 1,714 tests)
npm run test:watch            # watch 모드
npx vitest run <path>         # 단일 파일/디렉터리 실행
npx shadcn@latest add <name>  # shadcn/ui 컴포넌트 추가

# 데이터·법령 시딩·검증 (.env.local 필요)
npm run seed:tax-rates        # Supabase tax_rates 시딩
npm run verify:legal          # 법령 조문 상수 검증
npm run verify:legal:refresh  # 캐시 무효화 후 재검증
```

## Tech Stack

- **Frontend**: Next.js 16 (App Router, React 19, Turbopack) + TypeScript strict
- **UI**: shadcn/ui (BaseUI 기반) + Tailwind CSS v4 + zustand (마법사 폼 상태)
- **Backend**: Next.js Route Handlers (계산 API) + Server Actions (`actions/calculations.ts`, 이력 CRUD)
- **Auth/DB**: Supabase (Auth + PostgreSQL) — `lib/supabase/`
- **Observability**: Sentry (`sentry.{client,edge,server}.config.ts`)
- **Testing**: vitest + jsdom + @testing-library/react — `__tests__/tax-engine/`

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

세부 엔진 구조는 [lib/tax-engine/CLAUDE.md](lib/tax-engine/CLAUDE.md) 참조.

## File Size Policy (강제 규칙)

**모든 파일 800줄 이하**. PostToolUse hook이 초과 시 경고 (`⚠️ {file} exceeds 800 lines ({N})`). 즉시 분할.

분할 패턴: orchestrator + helpers / types / sections. Hook 설정은 `.claude/settings.json` PostToolUse.

## Critical Design Decisions

### 엔진 계산 원칙 (전 세목 공통)

- **DB 기반 세율 관리**: 세율·공제한도를 `tax_rates` 테이블 jsonb로 관리. 세법 변경 시 배포 없이 업데이트. TaxRateMap key: `${tax_type}:${category}:${sub_category}`.
- **정수 연산**: 모든 금액은 원(KRW, 정수). 곱셈-후-나눗셈 순서. `lib/tax-engine/tax-utils.ts`의 `applyRate()` / `safeMultiply()` 사용. BigInt fallback for overflow.
- **중간 절사**: 소수 세율 × 금액 곱셈 직후 반드시 `Math.floor()`. 지방소득세는 `applyRate()` (원 미만 절사 — 지방세법 §103의3, 천원 절사 규정 없음).
- **감면 중복배제 (조특법 §127 ②)**: 동일 자산에 복수 감면 해당 시 납세자 유리 1건만 선택. 후보 배열에서 max 선택 패턴.
- **법령 조문 상수**: 문자열 리터럴 직접 사용 금지. `lib/tax-engine/legal-codes/` 의 `TRANSFER.*` / `NBL.*` / `ACQUISITION.*` 상수 사용.

### 양도세 자산-수준 통합 (2026-04-25 이후)

- **취득 정보는 모두 `AssetForm` 자산-수준**: 취득가 산정방식·감정가액·신축·1990 환산·PHD 등 13필드. 폼-전역 `acquisitionMethod`·`appraisalValue`·`isSelfBuilt` deprecated. 다건 양도 시 자산별로 다른 산정방식·신축 여부 입력 가능.
- **감정가액 → 개산공제 자동 (소령 §163⑥)**: `isAppraisalAcquisition === true` 시 엔진이 `취득시 기준시가 × 3%` 개산공제 자동 적용 (`transfer-tax-helpers.ts` `calcTransferGain`).
- **토지/건물 분리 양도차익 (소령 §166⑥·§168②)**: `hasSeperateLandAcquisitionDate === true` 시 `transfer-tax-split-gain.ts`가 토지·건물 각각 양도차익 계산. `landSplitMode === "actual"` 직접 입력, 미입력은 기준시가 비율로 자동 안분. 자본적지출은 귀속 명확한 항목만 입력 권장.
- **개별주택가격 미공시 환산 (§164⑤·§166⑥·§163⑥)**: `usePreHousingDisclosure === true` 경로. `transfer-tax-pre-housing-disclosure.ts`의 3-시점(취득·최초공시·양도) 알고리즘으로 취득시 기준시가를 역산. PHD의 "취득시" 참조일은 **`landAcquisitionDate`** (건물 취득일이 아님).

### 데이터·세션·통합

- **Vworld API 공시지가**: `/api/address/standard-price?propertyType=land&jibun=...&year=...` 로 개별공시지가(원/㎡) 조회. PHD 3-시점 입력에서 시점별 조회 + 토지기준시가 자동 계산(공시지가 × 면적). 공시지가 추천 연도는 `lib/utils/land-price-year.ts` `recommendLandPriceYear()` (5/31 이하=전년, 6/1 이후=당년, 공시일 기준).
- **Auth**: 비로그인도 계산 가능. 로그인 시 이력·PDF. sessionStorage로 게스트 결과 보존 → 로그인 후 마이그레이션. zustand `result`는 partialize 제외 (민감정보 + Date 직렬화).
- **Store legacy 마이그레이션**: `lib/stores/calc-wizard-migration.ts`로 분리(800줄 정책). `migrateLegacyForm` + `STEP_MIGRATION` (5→4단계 인덱스 매핑) 자동 적용.
- **Supabase RPC**: `DISTINCT ON`은 Supabase JS 미지원 → DB Function `preload_tax_rates()` 로 구현.

## UI 작성 원칙

- **계산 로직 순서 = UI 표시 순서 (강제 규칙)**: 화면 배치는 엔진의 변수 사용 순서를 따른다. 모드 토글은 영향받는 필드 직전.
  - 예: 취득가액 산정 방식 → PHD 토글(환산 모드 의존) → 취득시 기준시가.
  - "토지·건물 취득일 다름" 토글은 "취득일" 라벨 옆 인라인 (분리 모드 결정이 후속 입력 좌우).
- **사이드바 합계**: `WizardSidebar`의 합계는 **이전 단계 입력값으로 계산 가능한 항목만** 노출. 환산 모드 취득가액처럼 API 결과 후 알 수 있는 값은 결과 도착 후 표시. 0원 항목은 제외.
- **결과 뷰 산식**: 기술 변수명(`P_F`, `Sum_A`, `floor()`) 금지. 한국어 풀어쓰기(`최초 고시 주택가격`). 중간 산술 결과는 미표시, 우측 결과값 단일 표기. 곱셈-후-내림은 결과값 자체가 floor된 값이므로 산식에 `floor()` 미표기.
- **placeholder 정확성**: "자동 안분"은 엔진이 실제로 안분할 때만. 자본적지출처럼 귀속 명확 필드는 "없으면 비워두세요".
- **면적 반올림 일관성 (UI 계산 한정)**: 비율로 파생한 면적(부수토지 등)을 단가와 곱할 때, 표시 자리수와 계산 자리수를 일치시킨다. `parseFloat(rawArea.toFixed(2))` 후 곱셈. 미적용 시 표시(76.51㎡) ≠ 계산(76.508...) → 수천~수만 원 오차 발생. **엔진(`tax-engine/`) 내부 계산에는 적용 금지** (정밀도 우선).
- **분기·옵션 토글은 ToggleCard 사용 (강제 규칙)**: `components/calc/inputs/ToggleCard.tsx`. native checkbox 신규 작성 금지. **OFF 상태에도 tone 배경(`bg-{tone}-50/70`) 항상 유지** — 회색 배경으로 두면 토글 위치를 사용자가 인지 못함. ON/OFF 구분은 Switch thumb·border 진하기·ring 유무·title 색 4신호. tone 매핑: amber=취득·분리계산 / rose=지역 / violet=거주·자격 / emerald=양도시점 / sky=면적·규모.

## 서브 CLAUDE.md (도메인별 심화)

해당 디렉터리에서 작업 시 자동으로 컨텍스트에 포함됨.

| 영역 | 파일 | 주제 |
|---|---|---|
| 세금 엔진 | [lib/tax-engine/CLAUDE.md](lib/tax-engine/CLAUDE.md) | 파일 조직(orchestrator·helpers·types·legal-codes), 신기능 워크플로, 정수 연산 디테일 |
| UI 마법사 | [components/calc/CLAUDE.md](components/calc/CLAUDE.md) | StepWizard 네비게이션, Step 분리, 공용 입력 컴포넌트, ToggleCard 가시성 원칙, 색상 카드 패턴 |
| 테스트 | [__tests__/tax-engine/CLAUDE.md](__tests__/tax-engine/CLAUDE.md) | Mock 공유 패턴(`_helpers/`), 시나리오 분할 원칙, 팩토리 함수 |

## Database (Supabase)

- **마이그레이션**: `supabase/migrations/` — `tax_rates`·`regulated_areas`·`standard_prices`·`users`·`calculations` 테이블 DDL.
- **초기 데이터**: `supabase/seed/`·`supabase/seeds/` — `npm run seed:tax-rates`로 반영.
- **환경변수**: `NEXT_PUBLIC_SUPABASE_URL`·`NEXT_PUBLIC_SUPABASE_ANON_KEY`·`SUPABASE_SERVICE_ROLE_KEY`. 미설정 시에도 `proxy.ts` graceful 통과 → Supabase 없이 로컬 개발 가능.

## Route Protection (`proxy.ts`)

Supabase 세션 기반:
- 보호 라우트 (`/history`, `/api/history`, `/api/pdf`): 미인증 시 `/auth/login` 리다이렉트.
- `/api/calc/*`, `/api/law/*`: 인증 불필요 (비로그인 계산·리서치 허용).

## 법령 리서치 (`/law`)

korean-law-mcp 15개 도구를 법제처 Open API 직접 호출로 재현한 통합 검색 페이지.

- **API Routes**: `app/api/law/{search-law,law-text,search-decisions,decision-text,annexes,chain}/route.ts`
- **UI 탭 4종**: 법령·조문 / 판례·결정례 / 별표·서식 / 리서치 체인
- **환경변수**: `KOREAN_LAW_OC` (법제처 Open API 인증키, https://open.law.go.kr 발급)
- **캐시**: `.legal-cache/` 파일 캐시 7일 TTL
- **별칭**: `상증법 → 상속세및증여세법` 등 52종 자동 해석 (`lib/korean-law/aliases.ts`)
- **클라이언트**: `lib/korean-law/client.ts` 는 barrel — 실체는 `client-core` / `client-law` / `client-decisions-{search,text}` / `client-annexes` 5파일 분리.

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

## Observability (Sentry)

3개 환경별 설정: `sentry.client.config.ts` / `sentry.edge.config.ts` / `sentry.server.config.ts`. 운영 이슈 재현 시 Sentry 이벤트의 `tax_type`·`request_id` 태그로 역추적.

## PDCA Workflow (bkit)

PM → Plan → Design → **Do** → Check → Act. `.bkit/state/pdca-status.json` 에서 현재 단계 확인. 구현 후 gap-detector로 설계 대비 일치도 검증 (목표 90%+).

## Custom Agents

`.claude/agents/`에 세목별·특례별 전문 에이전트. 새 기능 구현 시 해당 전문 에이전트를 활성화.

| 세목 | 에이전트 |
|---|---|
| 양도소득세 | `transfer-tax-senior` + `multi-house-surcharge-senior` / `one-house-tax-senior` / `non-business-land-tax-senior` / `long-term-rental-tax-senior` / `new-housing-tax-senior` / `transfer-deduction-senior` |
| 취득세 | `acquisition-tax-senior` + `-base` / `-object` / `-rate` / `-standard-price` / `-surcharge` / `-qa` |
| 재산세 | `property-tax-senior` + `-object` / `-comprehensive-aggregate` / `-separate-aggregate` / `-separate` / `-qa` |
| 종합부동산세 | `comprehensive-tax-senior` + `-house` / `-land-aggregate` / `-separate-land` / `-exclusion` / `-qa` |
| 상속·증여 | `inheritance-gift-tax-senior` + `-deduction` / `-credit` / `-nontax-teacher` / `property-valuation-senior` |
| QA 리더 | `tax-qa-lead` (6대 세목 QA 병렬 실행) |
