# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**KoreanTaxCalc** — 한국 부동산 6대 세금 자동계산 웹 앱 (양도소득세·상속세·증여세·취득세·재산세·종합부동산세).

**구현 상태**
- ✅ **양도소득세**: 엔진·UI·API·테스트 완전 구현. 마법사 4단계, 자산-수준 취득정보 통합, 토지/건물 분리 양도차익(소령 §166⑥), §164⑤ 3-시점 환산.
- 🚧 **취득세**: 엔진 구현 완료, UI 시니어 에이전트로 마법사·결과 화면 구현 진행 중 (`acquisition-tax-ui-senior`).
- 🚧 **재산세·종합부동산세·상속세·증여세**: 엔진 구현 완료, UI 구현 예정 (`components/calc/property/` 대기).
- ✨ **공용 입력 컴포넌트**: `FieldCard`·`SectionHeader`·`WizardSidebar`·`ToggleCard`·`RadioCardGroup`·`LandPriceLookupField` — 양도세 마법사 적용, 타 세목 점진 확장.

## ⚠️ Next.js 16 주의사항

**This is NOT the Next.js you know** — API·컨벤션·파일 구조가 학습 데이터와 다를 수 있다.

- **`middleware.ts` → `proxy.ts`**: Next.js 16 rename. 세션 처리는 `proxy.ts`.
- 변경 사항 확인 시 `node_modules/next/dist/docs/` 가이드를 먼저 읽을 것.

## Commands

```bash
npm run dev                   # 개발 서버 (Turbopack)
npm run build                 # 프로덕션 빌드
npm run lint                  # ESLint
npm test                      # vitest 전체 (90 파일 / 1,714 tests)
npm run test:watch            # watch 모드
npx vitest run <path>         # 단일 파일/디렉터리
npx vitest run -t "T-01"      # 이름 패턴
npx shadcn@latest add <name>  # shadcn/ui 컴포넌트 추가

# 데이터·법령 시딩·검증 (.env.local 필요)
npm run seed:tax-rates        # Supabase tax_rates 시딩
npm run verify:legal          # 법령 조문 상수 검증
npm run verify:legal:refresh  # 캐시 무효화 후 재검증
```

## Tech Stack

- **Frontend**: Next.js 16 (App Router, React 19, Turbopack) + TypeScript strict
- **UI**: shadcn/ui (BaseUI) + Tailwind CSS v4 + zustand (마법사 폼)
- **Backend**: Next.js Route Handlers (계산 API) + Server Actions (`actions/calculations.ts`, 이력 CRUD)
- **Auth/DB**: Supabase (Auth + PostgreSQL) — `lib/supabase/`
- **Observability**: Sentry (`sentry.{client,edge,server}.config.ts`) — 이슈 재현 시 `tax_type`·`request_id` 태그로 역추적
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
  → 단방향 의존만 허용: comprehensive → property (역방향 금지)
```

세부는 [lib/tax-engine/CLAUDE.md](lib/tax-engine/CLAUDE.md) 참조.

## File Size Policy (강제)

**모든 파일 800줄 이하**. PostToolUse hook이 초과 시 경고. 분할 패턴: orchestrator + helpers / types / sections.

## Critical Design Decisions

### 엔진 계산 원칙 (전 세목 공통)

- **DB 기반 세율 관리**: `tax_rates` 테이블 jsonb. 세법 변경 시 배포 없이 업데이트. TaxRateMap key: `${tax_type}:${category}:${sub_category}`.
- **정수 연산**: 모든 금액은 원(KRW, 정수). `lib/tax-engine/tax-utils.ts`의 `applyRate()` / `safeMultiply()` 사용. BigInt fallback for overflow.
- **중간 절사**: 소수 세율 × 금액 곱셈 직후 반드시 `Math.floor()`. 지방소득세는 `applyRate()` (원 미만 절사 — 지방세법 §103의3, 천원 절사 규정 없음). `Math.round()` 절대 금지.
- **감면 중복배제 (조특법 §127 ②)**: 동일 자산 복수 감면 시 납세자 유리 1건만 선택 (후보 배열 max 패턴).
- **법령 조문 상수**: 문자열 리터럴 직접 사용 금지. `lib/tax-engine/legal-codes/` 의 `TRANSFER.*` / `NBL.*` / `ACQUISITION.*` 등 상수 사용.

### 양도세 자산-수준 통합 (2026-04-25 이후)

- **취득 정보 13필드는 모두 `AssetForm` 자산-수준**: 폼-전역 `acquisitionMethod`·`appraisalValue`·`isSelfBuilt` deprecated. 다건 양도 시 자산별로 다른 산정방식·신축 입력 가능.
- **감정가액 → 개산공제 자동 (소령 §163⑥)**: `isAppraisalAcquisition === true` 시 엔진이 `취득시 기준시가 × 3%` 개산공제 자동 적용 (`transfer-tax-helpers.ts` `calcTransferGain`).
- **토지/건물 분리 양도차익 (소령 §166⑥·§168②)**: `hasSeperateLandAcquisitionDate === true` 시 `transfer-tax-split-gain.ts`가 토지·건물 각각 양도차익 계산. `landSplitMode === "actual"` 직접 입력, 미입력은 기준시가 비율로 자동 안분.
- **개별주택가격 미공시 환산 (§164⑤·§166⑥·§163⑥)**: `usePreHousingDisclosure === true` 경로. `transfer-tax-pre-housing-disclosure.ts`의 3-시점(취득·최초공시·양도) 알고리즘으로 취득시 기준시가 역산. PHD의 "취득시" 참조일은 **`landAcquisitionDate`** (건물 취득일 아님).

### 양도세 검용주택 PHD 분기 (2026-05-03 이후)

- **일반 PHD** (`partialUsageChange` 미사용): 주택부수토지 단일 면적으로 §164⑤ 역산.
- **Case A** (`house_to_commercial` AND `firstDisclosureDate < usageChangeDate`): **4부분 안분** 모드. 취득시·최초공시 시점에 건물 전체가 주택이었으므로 `fourPartApportionment`로 주택분토지·주택건물·상가분토지·상가건물 각각 안분. 사용자는 취득시·최초공시 시점에 주택건물/상가건물 기준시가 별도 입력 (홈택스 조회). 엑셀 사례 anchor 테스트(`mixed-use-phd-case-a-fourpart.test.ts`)로 검증.
- **Case B** (`firstDisclosureDate >= usageChangeDate`): 최초공시 시점에 이미 검용. 시점별 주택부수토지 면적만 사용.

### 데이터·세션·통합

- **API 페이로드 Date 직렬화 주의**: 클라이언트가 `new Date()` 객체로 전달해도 JSON 직렬화 후 라우트 핸들러는 string으로 받음. 엔진 타입이 `Date`면 라우트에서 `new Date(...)` 명시 변환 필수. 누락 시 `Date < string` 비교는 silent false (조용한 버그). 예: `app/api/calc/transfer/route.ts` mixedAsset 생성 시 `partialUsageChange.usageChangeDate` 도 변환 필요.
- **Vworld API 공시지가**: `/api/address/standard-price?propertyType=land&jibun=...&year=...`. PHD 3-시점 입력에서 시점별 조회 + 토지기준시가 자동 계산. 추천 연도는 `lib/utils/land-price-year.ts` `recommendLandPriceYear()` (5/31 이하=전년, 6/1 이후=당년).
- **Auth**: 비로그인도 계산 가능. 로그인 시 이력·PDF. sessionStorage로 게스트 결과 보존 → 로그인 후 마이그레이션. zustand `result`는 partialize 제외 (민감정보 + Date 직렬화).
- **Store legacy 마이그레이션**: `lib/stores/calc-wizard-migration.ts` (800줄 정책). `migrateLegacyForm` + `STEP_MIGRATION` (5→4단계 인덱스 매핑) 자동 적용.
- **Supabase RPC**: `DISTINCT ON`은 Supabase JS 미지원 → DB Function `preload_tax_rates()`.

## UI 작성 원칙 (요약)

상세는 [components/calc/CLAUDE.md](components/calc/CLAUDE.md). 요약:

- **계산 로직 순서 = UI 표시 순서**: 화면 배치는 엔진 변수 사용 순서. 모드 토글은 영향받는 필드 직전.
- **사이드바 합계**: 이전 단계 입력값으로 계산 가능한 항목만. 0원 항목 제외.
- **결과 뷰 산식**: 변수 약어(`P_F`, `floor()`) 금지. 한국어 풀어쓰기. 곱셈-후-내림은 결과값 단일 표기.
- **분기·옵션 토글은 ToggleCard / RadioCardGroup 사용** — native checkbox·radio 신규 작성 금지. OFF 상태에도 tone 배경 항상 유지.
- **공시지가 입력은 `LandPriceLookupField` 필수** — 기준연도+Vworld 조회+토지기준시가 자동 계산.
- **면적 반올림 일관성 (UI 한정)**: 비율 파생 면적은 `parseFloat(toFixed(2))` 후 단가 곱셈. **엔진 내부 계산엔 미적용** (정밀도 우선).
- **placeholder에 숫자 예시 금지 (전 세목 공통)**: 입력란 placeholder에 특정 숫자(계산 예제·Excel 예제 숫자 등)를 사용하지 않는다. 도움말이 필요한 경우 **한국어 설명**으로만 표시한다. 예) `"예: 91.78"` → `"양도시 주거용 합계 면적"`. 입력 형식 안내는 FieldCard의 `hint` prop에 한국어로 작성한다.

## Database (Supabase)

- **마이그레이션**: `supabase/migrations/` — `tax_rates`·`regulated_areas`·`standard_prices`·`users`·`calculations` DDL.
- **시딩**: `supabase/seed/`·`supabase/seeds/` — `npm run seed:tax-rates`로 반영.
- **환경변수**: `NEXT_PUBLIC_SUPABASE_URL`·`NEXT_PUBLIC_SUPABASE_ANON_KEY`·`SUPABASE_SERVICE_ROLE_KEY`. 미설정 시에도 `proxy.ts` graceful 통과 → Supabase 없이 로컬 개발 가능.

## Route Protection (`proxy.ts`)

Supabase 세션 기반:
- 보호 라우트 (`/history`, `/api/history`, `/api/pdf`): 미인증 시 `/auth/login` 리다이렉트.
- `/api/calc/*`, `/api/law/*`: 인증 불필요 (비로그인 계산·리서치 허용).

## 법령 리서치 (`/law`)

korean-law-mcp 15개 도구를 법제처 Open API 직접 호출로 재현.

- **API Routes**: `app/api/law/{search-law,law-text,search-decisions,decision-text,annexes,chain}/route.ts`
- **UI 탭 4종**: 법령·조문 / 판례·결정례 / 별표·서식 / 리서치 체인
- **환경변수**: `KOREAN_LAW_OC` (https://open.law.go.kr 발급). 캐시: `.legal-cache/` 7일 TTL.
- **별칭**: `상증법 → 상속세및증여세법` 등 52종 (`lib/korean-law/aliases.ts`).
- **클라이언트**: `lib/korean-law/client.ts`는 barrel — 실체는 `client-core` / `client-law` / `client-decisions-{search,text}` / `client-annexes` 5파일.

## 서브 CLAUDE.md (도메인별 심화)

해당 디렉터리에서 작업 시 자동 컨텍스트 포함.

| 영역 | 파일 | 주제 |
|---|---|---|
| 세금 엔진 | [lib/tax-engine/CLAUDE.md](lib/tax-engine/CLAUDE.md) | 파일 조직, 신기능 워크플로, 정수 연산 디테일, 감면 중복배제 패턴 |
| UI 마법사 | [components/calc/CLAUDE.md](components/calc/CLAUDE.md) | StepWizard, 공용 입력 컴포넌트, ToggleCard 가시성, 색상 카드, 8개 동기화 지점 |
| 테스트 | [__tests__/tax-engine/CLAUDE.md](__tests__/tax-engine/CLAUDE.md) | Mock 공유 패턴, 시나리오 분할, PDF 예시값 anchor |

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

PM → Plan → Design → Do → Check → Act. 상태는 `.bkit/state/pdca-status.json`. 구현 후 gap-detector로 설계 대비 일치도 검증 (목표 90%+).

## Custom Agents

`.claude/agents/`에 세목별·특례별 전문 에이전트. 새 기능 구현 시 해당 에이전트 활성화.

### 엔진 시니어 (계산 로직 전담)

| 세목 | 에이전트 |
|---|---|
| 양도소득세 | `transfer-tax-senior` + `multi-house-surcharge` / `one-house-tax` / `non-business-land` / `long-term-rental-tax` / `new-housing-tax` / `transfer-deduction` |
| 취득세 | `acquisition-tax-senior` + `-base` / `-object` / `-rate` / `-standard-price` / `-surcharge` / `-qa` |
| 재산세 | `property-tax-senior` + `-object` / `-comprehensive-aggregate` / `-separate-aggregate` / `-separate` / `-qa` |
| 종합부동산세 | `comprehensive-tax-senior` + `-house` / `-land-aggregate` / `-separate-land` / `-exclusion` / `-qa` |
| 상속·증여 | `inheritance-gift-tax-senior` + `-deduction` / `-credit` / `-nontax-teacher` / `property-valuation` |

### UI 시니어 (UI 통합 전담, 2026-04-30 신설)

엔진 시니어가 input/result 타입을 명세하면, 대응 UI 시니어가 마법사 폼·결과 카드·zustand·API 변환을 책임. **엔진 시니어가 UI 작업까지 직접 수행하지 않음** — UI 통합 누락 반복의 근본 원인.

| 세목 | UI 에이전트 |
|---|---|
| 양도소득세 | `transfer-tax-ui-senior` |
| 취득세 | `acquisition-tax-ui-senior` |
| 재산세 | `property-tax-ui-senior` |
| 종합부동산세 | `comprehensive-tax-ui-senior` |
| 상속·증여 | `inheritance-gift-tax-ui-senior` |

### QA·검증

| 역할 | 에이전트 |
|---|---|
| QA 리더 | `tax-qa-lead` (6대 세목 QA 병렬 실행) |
| UI-Engine 동기화 | `ui-engine-sync-checker` (read-only, 8개 동기화 지점 점검) |

## 기능 추가 작업 흐름 (강제 — PDCA 5단계)

엔진에 새 input/result 필드를 추가하는 모든 작업은 다음 순서로:

1. **PM/Plan**: 사용자 요구·법령 근거 정리. **엔진 + UI 시니어 동시 참여**로 시나리오·UI 노출 사전 검토.
2. **Design**: 분리 패턴 권장 — `{feature}.engine.design.md` (엔진 시니어, 계산·타입·테스트) + `{feature}.ui.design.md` (UI 시니어, 8개 동기화 지점 사전 명세). 단일 패턴: `{feature}.design.md`에 "엔진 명세" + "UI 통합 명세" 섹션.
3. **Do**: 디자인 그대로 구현. 엔진 시니어 = 엔진 + 엔진 테스트, UI 시니어 = 7개 지점 모두. 누락 발견 시 우회 금지 — 디자인 갱신 후 구현.
4. **Check**: `ui-engine-sync-checker` (read-only) + QA 에이전트 + 사용자 수동 확인 (브라우저).
5. **Act**: 회귀 후속 + 디자인 환류.

엔진 시니어 단독 작업 종료 보고 금지. UI 통합 미완성·디자인 미갱신 시 작업 미완료.

## Definition of Done — UI 통합 8개 동기화 지점

엔진 input·result 타입 변경 시 다음 8개 지점이 **모두 동기화**되어야 완료. 위치 상세는 [components/calc/CLAUDE.md](components/calc/CLAUDE.md).

① 폼 상태 타입 → ② initial value → ③ normalize fallback → ④ API 변환 (`lib/calc/{tax-type}-api.ts`) → ⑤ UI 입력 위젯 → ⑥ 사이드바 합계 (해당 시) → ⑦ 결과 카드 산식·표시 → ⑧ **validation** (`lib/calc/{tax-type}-validate.ts`).

**⑧ Validation 강제 규칙 (2026-05-01 추가)**: API/UI fallback이 있는 필드는 validation 단계에서도 같은 fallback을 인식해야 함. 예) `mixedAcqLandPricePerSqm`이 비었어도 `phdLandPricePerSqmAtAcq`로 fallback되는 경우, validate에서는 두 필드 중 하나라도 충족하면 통과해야 함. UI/API는 통과하는데 validate가 차단하는 모순 방지.

**자가 점검 (작업 완료 보고 전 필수)**:

- [ ] 디자인 문서에 8개 지점 사전 명세 작성됨
- [ ] 엔진 input 타입의 모든 필드가 폼 타입에 매핑됨
- [ ] 새 필드 모두 initial · normalize · API 변환에 등록됨
- [ ] 입력 위젯 배치 (UI 순서 = 엔진 계산 로직 순서)
- [ ] 새 결과 필드 모두 결과 화면 노출 (산식 + 숫자 라벨)
- [ ] **API에 fallback 추가 시 validation에도 같은 fallback 인식** (⑧)
- [ ] `npx tsc --noEmit` 오류 0건
- [ ] `npx vitest run __tests__/tax-engine/{tax-type}/` 통과
- [ ] 브라우저 수동 확인 또는 "수동 확인 미수행" 명시
- [ ] (권장) `ui-engine-sync-checker` 호출
