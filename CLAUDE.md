# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**KoreanTaxCalc** — 한국 부동산 6대 세금 자동계산 웹 앱 (양도소득세·상속세·증여세·취득세·재산세·종합부동산세).

구현 현황은 [`docs/00-pm/korean-tax-calc.roadmap.md`](docs/00-pm/korean-tax-calc.roadmap.md) 참조. 양도세만 엔진·UI·API·테스트 완전 구현됨. 취득세 이하 세목은 엔진 완료, UI 구현 대기.

진행 중: 양도세 감면 23개 조문 확장 — `lib/tax-engine/transfer-reductions/` Phase 1 골격 완료, §99의3 완전 구현 완료. 계획서: `docs/00-pm/transfer-reduction-expansion.plan.md`.

최근 완료(2026-05-11): **일반건물 4가지 조합 확장 — 쌍방+쌍방·일방+쌍방·일방+일방 지원** — 예제 4가지 계산유형 모두 계산 가능. `extensionInfo`에 `acquisitionMode: "actual" | "estimated"` enum + `actualAcquisitionPrice?` + `actualExpenses?` 추가. 기존 4필드 optional 완화 + default "estimated" (사례 33 호환). `general-building-extension.ts` Step 2 분기(원건물 실가→일괄 안분, 환산→사례 31식) + Step 3 분기(증축 실가→그대로 사용, 환산→§176의2②). UI: GeneralBuildingBlock 증축 토글 내부 "증축분 취득방식" 서브 라디오 2옵션(실가/환산) + 모드별 필드 분기 + 미리보기 카드 4분기. 4번째 라디오 onClick 정정(useEst=false + extensionMode="estimated"). Zod superRefine 조건부 강제. validate-gb 모드별 필수 분기. anchor 68개 신규(쌍방+쌍방 4,173,273 / 일방+쌍방 30,556,445 / 일방+일방 35,730,197 — §55 누진세율표 자가검증). 사례 31·32·33 회귀 0. 전체 934/935 통과(1 todo). 14지점 sync-checker 0 누락(⑫⑬⑭ 침묵 stripping 위험 영역 모두 통과). 후속: 예제 PDF 실제 사례 anchor 교체·결과 카드 모드별 배지.

이전 완료(2026-05-11): **사례 33 UX 개선 — 예제 "쌍방+일방" 라디오 패턴 도입** — acquisitionMethod 라디오에 4번째 옵션 "쌍방+일방 (증축 있음)" 추가 (`assetKind === "general_building"` 일 때만). 4번째 옵션은 **시각 표시 전용** — 기존 3 boolean(`useEstimatedAcquisition`·`isAppraisalAcquisition`·`gbHasExtension`) 조합으로 매핑하여 **백엔드 변경 0건**. 다른 라디오 클릭 시 `gbHasExtension=false` 자동 reset (정합성 유지). 일괄 취득가·양도비 라벨/hint 동적 변경(`isMixedExtension` 활성 시 "토지·건물 일괄 …"·"엔진 자동 안분" 안내). GeneralBuildingBlock 상단에 시나리오 가이드 카드(실거래가/환산/쌍방+일방 3시나리오 비교). 증축 토글 펼침 마지막에 자동 안분 미리보기 카드 (5필드 입력 즉시 토지/건물1/건물2 안분값 + 건물2 환산취득가 표시, useMemo 순수 함수). validate-gb 정합성 가드(`gbHasExtension=true && !useEstimatedAcquisition` 차단). typecheck 0건 + 사례 31·32·33 anchor 87/87 회귀 0건. 변경 4파일(CompanionAcqPurchaseBlock·GeneralBuildingBlock·GeneralBuildingAcquisitionCards·validate-gb), 800줄 정책 준수. 후속: RadioCardGroup 통일 리팩터·bundledExpenses 분리.

이전 완료(2026-05-11): **사례 33 증축 건물의 취득 실거래가 환산** — 일반건물 사례 31 확장. 원건물(쌍방실가) + 증축분(일방실가=환산) 공존 케이스. `GeneralBuildingInput`에 `extensionInfo?` 서브객체 5필드(extensionDate·extensionArea?·transferExtensionBuildingStdPrice·acquisitionExtensionBuildingStdPrice·extensionAcquisitionCause) + `actualBundledAcquisitionPrice/Expenses` 추가. **신규 파일 `general-building-extension.ts`(299줄)** 분리 — 양도가 3-way 안분(§166⑥) + 일괄 취득가 토지+건물1 2-way 안분(취득시 비율, anchor 검증으로 정정) + 건물2 환산(§176의2②) + 카드 3장 출력. validate 분할 선행 PR(`transfer-tax-validate-gb.ts` 88줄 신규). UI: `GeneralBuildingBlock` 증축 ToggleCard `tone="fuchsia"` + `BundledAllocationCard` `GeneralBuilding3WayTable` 4열 표. fail-fast `buildExtensionInfo()` throw — silent 회귀 차단. anchor 25개 toBe 정확 통과(산출세액 6,480,952·지방세 648,095 PDF 일치, 통산 후 토지 48,791,667·건물2 4,712,301). 14지점 동기화 sync-checker 0 누락. **전체 866/867 통과(1 todo, 회귀 0)**. 후속 PR: 5년 이내 증축 양도 §114조의2 5% 가산세 active 케이스·증축 2회 이상·토지 상속/증여 cross-cutting.

이전 완료(2026-05-11): **일반건물 다른 피상속인/증여자 분리 필드** — #6/#7-a 후속 드문 케이스. 토지·건물이 서로 다른 피상속인/증여자로부터 취득된 경우 지원. `GeneralBuildingInput`에 `buildingDecedent/buildingDonorAcquisitionDate?` 추가, 건물 카드에서 IIFE 우선순위 fallback(`building... ?? decedent/donor`) 적용. 비파괴 확장 — 분리 미입력 시 #6/#7-a 동작 100% 보존. anchor 9개 (분리 inheritance·gift·fallback·교차 cause 시나리오). 전체 2,589/2,589 통과.

이전 완료(2026-05-11): **일반건물 #7-b 토지 증여이월과세 + 건물 신축 cross-cutting 완료** — 분리 PR design.md "후속 PR" 표 4건(#4-a·#6·#7-a·#7-b) **모두 완료**. §97의2 + §114조의2 cross-cutting. `landCarryoverTaxation` 파이프라인 신규(엔진 input/AssetCardForAggregate/buildProperties/dispatch Date 변환/Zod 스키마). aggregate가 단건 엔진 호출 시 `carryoverTaxation`이 spread 전달되어 비교과세(C-01 모듈) 자동 작동. 사례 32 변형(토지 carryover_gift + 건물 newConstruction) anchor 16개. 가산세 13,300,202 cross-cutting 보존 + carryover 결과 양수 회귀 가드. 전체 2,580/2,580 통과.

이전 완료(2026-05-11): **일반건물 #7-a 토지 증여 + 건물 신축 회귀 보호 anchor**. #4-a 동일 패턴의 gift 분기. donor 보조 필드 패스 인프라는 #4-a에서 이미 구축 — **엔진 변경 없이 anchor 18개만 추가**. 토지 LTHD 기산점이 증여일로 매매와 동일하므로 사례 32 결과(가산세 13,300,202·양도소득금액 283,833,151) 그대로 보존. 전체 2,564/2,564 통과. 남은 후속 PR: #7-b 토지 증여이월과세 + 건물 신축(§97의2 + §114조의2 cross-cutting).

이전 완료(2026-05-11): **일반건물 #6 토지·건물 모두 상속 회귀 보호 anchor**. #4-a 후속. `buildGeneralBuildingAssetCards`/`buildProperties`에서 건물 카드에도 `buildingAcquisitionCause === "inheritance"|"gift"` 시 `decedent/donorAcquisitionDate` 패스(같은 피상속인 가정, 자산-수준 단일 필드). 사례 32 입력에서 토지·건물 모두 inheritance + 건물 acquisitionDate=상속개시일로 변경 시 건물 LTHD 4년 8%(2,337,058) → 14년 28%(8,179,704), 가산세 13,300,202 → 0. anchor 17개. 전체 2,546/2,546 통과. 비스코프: 다른 피상속인 케이스(buildingDecedent/landDecedent 분리)·#7-a/b 후속 PR.

이전 완료(2026-05-10): **일반건물 #4-a 토지 상속 + 건물 신축 회귀 보호 anchor**. 분리 PR design.md "후속 PR" 표의 #4-a. `AssetCardForAggregate`/`buildProperties`에 토지 inheritance 보조 필드(`landAcquisitionCause`/`decedentAcquisitionDate`/`donorAcquisitionDate`) 매핑 추가. 사례 32 변형(토지 acqCause만 inheritance) anchor 17개로 사례 32와 동일 결과(가산세 13,300,202·양도소득금액 283,833,151) 보존을 회귀 가드. 전체 2,529/2,529 통과. 비스코프: #6(토지·건물 모두 상속)·#7-a/b(증여) 후속 PR.

이전 완료(2026-05-10): **일반건물 토지·건물 취득원인 분리 UX PR**. 사례 32 후속. `gbIsSelfBuilt` boolean 폐지 → 토지·건물 각각 독립 `acquisitionCause` enum (예제 정렬, 토지=매매/상속/증여/이월과세, 건물=매매/상속/증여/신축). "신축 정보" 토글 완전 제거(자가신축은 건물 라디오 옵션). A안(normalize에서 legacy 자동 폐기). anchor +13(2,499→**2,512** 통과). Playwright 자동 검증 10/10 PASS, 콘솔 에러 0. **다음 PR 작성자 신호**: `transfer-tax-validate.ts` 776줄 — +25줄 시 도메인 분할 선행 권장.

이전 완료(2026-05-10): **신축 건물 단기양도 §114조의2 5% 가산세 사례 32**. 일반건물 환산취득가 위에 토지·건물 취득일 분리(2008/2018) + `gbIsSelfBuilt`/`gbBuildingAcquisitionDate` 2필드 추가로 §114조의2 ① 5% 가산세(13,300,202) 발동. KoreanLaw MCP로 모법 정확 인용 검증(§97②·§114⑦·§176의2⑤ 표기 금지). anchor 28개 + 사례 31 회귀 51개 + 전체 2,497개 통과. 후속 PR 4건 모두 완료(§176의2 ②정정·toOptionalDate·penaltyBase 승격·addYears 정확비교).

이전 완료(2026-05-08): 상업용건물·오피스텔 환산취득가 사례 29 + **일반건물 일괄 환산취득가 사례 31**. 신규 `propertyType: "general_building"` + `lib/tax-engine/general-building-valuation.ts` 모듈(382줄, 시행령 §166⑥ 양도가 안분 + §176의2④ 자산별 환산 + §163⑥ 자산별 개산공제 + §102② 1차 통산 위임). 양도시 건물기준시가 잠금값 20,629,440(BigInt 손계산 함정 주의). anchor 38개 toBe 정확 통과(2,233/2,233 회귀 보존).

## ⚠️ Next.js 16 주의사항

**This is NOT the Next.js you know** — API·컨벤션·파일 구조가 학습 데이터와 다를 수 있다.

- **`middleware.ts` → `proxy.ts`**: Next.js 16 rename. 세션 처리는 `proxy.ts`.
- 변경 사항 확인 시 `node_modules/next/dist/docs/` 가이드를 먼저 읽을 것.

## Commands

```bash
npm run dev                   # 개발 서버 (Turbopack)
npm run build                 # 프로덕션 빌드
npm run typecheck             # tsc --noEmit
npm run lint                  # ESLint
npm run check:pre-pr          # typecheck + lint + test 일괄 (PR 전 수동 게이트)
npm test                      # vitest 전체 (1회)
npm run test:watch            # vitest 감시 모드 (개발 중)
npx vitest run <path>         # 단일 파일/디렉터리
npx vitest run -t "T-01"      # 이름 패턴
npx shadcn@latest add <name>  # shadcn/ui 컴포넌트 추가

# 데이터·법령 (.env.local 필요)
npm run seed:tax-rates        # Supabase tax_rates 시딩
npm run verify:legal          # 법령 조문 상수 검증
npm run verify:legal:refresh  # 캐시 무효화 후 재검증
```

**자동 게이트**: husky pre-commit(lint-staged) + pre-push(typecheck + test) + GitHub Actions(typecheck + lint + test).

## Tech Stack

- **Frontend**: Next.js 16 (App Router, React 19, Turbopack) + TypeScript strict
- **UI**: shadcn/ui (BaseUI) + Tailwind CSS v4 + zustand (마법사 폼 상태)
- **Backend**: Next.js Route Handlers (계산 API) + Server Actions (`actions/calculations.ts`)
- **Auth/DB**: Supabase (Auth + PostgreSQL) — `lib/supabase/`
- **Testing**: vitest + jsdom + @testing-library/react — `__tests__/tax-engine/`
- **Observability**: Sentry — 이슈 재현 시 `tax_type`·`request_id` 태그로 역추적

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
  → 감면 라우터: lib/tax-engine/transfer-reductions/ (23개 조문 메타데이터·시한검증·개별 구현 모듈)
  → 양도세 4-파일 분할 (2026-05-08): transfer-tax.ts(681) + transfer-tax-helpers.ts(787) + transfer-tax-rate-calc.ts(724) + transfer-tax-finalize.ts(211, STEP 7.5~12 통합)
  → 사례 29 환산: lib/tax-engine/commercial-building-valuation.ts (호별고시 전 역환산, propertyType "commercial_building")
  → 사례 31 환산: lib/tax-engine/general-building-valuation.ts (§166⑥ 양도가 안분, propertyType "general_building")

lib/calc/ — 클라이언트↔API 변환 레이어 (14개 동기화 지점 ④⑧ 담당)
  → transfer-tax-api.ts / transfer-tax-api-helpers.ts / transfer-tax-api-carryover.ts (이월과세 전용)
  → multi-transfer-tax-api.ts / multi-transfer-tax-validate.ts (다건 양도 전용)
  → transfer-tax-validate.ts / transfer-tax-error-format.ts
  → acquisition-tax-api.ts (취득세 API 변환)
```

세부 파일 조직·의존 규칙·정수 연산은 [lib/tax-engine/CLAUDE.md](lib/tax-engine/CLAUDE.md) 참조.

## File Size Policy (강제)

**모든 파일 800줄 이하**. PostToolUse hook이 초과 시 경고. 분할 패턴: orchestrator + helpers / types / sections. 위반 감지 시 즉시 분리 — 우회 금지.

## 세금 엔진 규칙

### 계산 원칙 (전 세목 공통)

- **DB 기반 세율**: `tax_rates` 테이블 jsonb. 세법 변경 시 배포 없이 업데이트. TaxRateMap key: `${tax_type}:${category}:${sub_category}`.
- **정수 연산**: 모든 금액은 원(KRW, 정수). `applyRate()` / `safeMultiply()` (`tax-utils.ts`). `Math.round()` 절대 금지.
- **중간 절사**: 세율 × 금액 곱셈 직후 `Math.floor()`. 지방소득세는 원 미만 절사 (천원 절사 규정 없음).
- **감면 중복배제 (조특법 §127②)**: 동일 자산 복수 감면 시 후보 배열 max 패턴.
- **법령 조문 상수**: 문자열 리터럴 금지. `lib/tax-engine/legal-codes/` 의 `TRANSFER.*` / `ACQUISITION.*` 등 상수 사용.

### API Date 직렬화 — `lib/api/date-coerce.ts` 필수

클라이언트 `new Date()`가 JSON 경유 후 string으로 도달 → `Date < string` 비교는 silent false. 신규 라우트·Date 필드는 반드시 헬퍼 사용:

```ts
toDate(v, "fieldName")          // 필수 필드
toOptionalDate(v)               // 옵션 필드
coerceDates(obj, ["a", "b.c"]) // 선언형 bulk
```

`new Date(x)` 직접 호출 금지 (신규 코드 한정). 기존 코드 점진 마이그레이션.

### 설계 원칙 (UI 금지 사항)

- **자동 안분 fallback 금지**: 미입력 필드를 면적·시점비율로 자동 채우기 금지. 검증 오류로 차단 (예외: PHD §164⑤ 법령 명시 안분).
- **useEffect → store 미러링 금지**: cross-field 자동 동기화는 onChange/useMemo. 무한 루프 유발.
- **법령 정확성 최우선**: 납세자 유리/불리·절감 표현 금지. 결과는 중립 사실로만.

## UI 작성 원칙 (요약)

상세는 [components/calc/CLAUDE.md](components/calc/CLAUDE.md).

- **계산 로직 순서 = UI 표시 순서**: 엔진 변수 사용 순서대로 배치. 모드 토글은 영향 필드 직전.
- **사이드바 합계**: 이전 단계 입력으로 계산 가능한 항목만. 0원 제외.
- **결과 뷰 산식**: 변수 약어·`floor()` 금지. 한국어 풀어쓰기.
- **토글/라디오**: `ToggleCard` / `RadioCardGroup` 필수. native checkbox·radio 신규 작성 금지. OFF 상태에도 tone 배경 유지.
- **공시지가 입력**: `LandPriceLookupField` 필수 (기준연도+Vworld+토지기준시가 자동).
- **면적 반올림 (UI 한정)**: 비율 파생 면적은 `parseFloat(toFixed(2))` 후 단가 곱셈.
- **placeholder 숫자 예시 금지**: 한국어 설명만. 입력 형식은 FieldCard `hint` prop에 작성.

## 인프라

### Supabase / Database

- **마이그레이션**: `supabase/migrations/` — `tax_rates`·`regulated_areas`·`standard_prices`·`users`·`calculations` DDL.
- **시딩**: `npm run seed:tax-rates`.
- **환경변수**: `NEXT_PUBLIC_SUPABASE_URL`·`NEXT_PUBLIC_SUPABASE_ANON_KEY`·`SUPABASE_SERVICE_ROLE_KEY`. 미설정 시에도 graceful 통과 → Supabase 없이 로컬 개발 가능.
- **RPC**: `DISTINCT ON`은 Supabase JS 미지원 → DB Function `preload_tax_rates()`.

### Route Protection (`proxy.ts`)

- 보호: `/history`, `/api/history`, `/api/pdf` — 미인증 시 `/auth/login` 리다이렉트.
- 미보호: `/api/calc/*`, `/api/law/*` — 비로그인 계산·법령 리서치 허용.

### 로컬 데이터 저장소 (`lib/storage/`)

IndexedDB(Dexie.js) 기반. 향후 Supabase 도입 시 데이터 폐기 후 새로 시작. Auth·세션·resultData 구조·전환 체크리스트는 [lib/storage/CLAUDE.md](lib/storage/CLAUDE.md) 참조.

- **비로그인 계산 가능**: sessionStorage로 게스트 결과 보존 → 로그인 후 마이그레이션.
- **zustand `result` partialize 제외**: 민감정보 + Date 직렬화 문제.
- **Store legacy 마이그레이션**: `lib/stores/calc-wizard-migration.ts`. `migrateLegacyForm` + `STEP_MIGRATION` 자동 적용.

## 법령 리서치 (`/law`)

법제처 Open API 직접 호출. 환경변수 `KOREAN_LAW_OC` 필요.

- **API Routes**: `app/api/law/{search-law,law-text,search-decisions,decision-text,annexes,chain}/route.ts`
- **클라이언트**: `lib/korean-law/client.ts` barrel — 실체는 `client-core` / `client-law` / `client-decisions-{search,text}` / `client-annexes` 5파일.
- **별칭 52종**: `lib/korean-law/aliases.ts` (`상증법 → 상속세및증여세법` 등).
- **캐시**: `.legal-cache/` 7일 TTL.

## 새 기능 추가 워크플로 (강제)

### 에이전트 구성

| 역할 | 에이전트 |
|---|---|
| 양도세 엔진 | `transfer-tax-senior` + `multi-house-surcharge` / `one-house-tax` / `non-business-land` / `long-term-rental-tax` / `new-housing-tax` / `transfer-deduction` |
| 취득세 엔진 | `acquisition-tax-senior` + `-base` / `-object` / `-rate` / `-standard-price` / `-surcharge` / `-qa` |
| 재산세 엔진 | `property-tax-senior` + `-object` / `-comprehensive-aggregate` / `-separate-aggregate` / `-separate` / `-qa` |
| 종부세 엔진 | `comprehensive-tax-senior` + `-house` / `-land-aggregate` / `-separate-land` / `-exclusion` / `-qa` |
| 상속·증여 엔진 | `inheritance-gift-tax-senior` + `-deduction` / `-credit` / `-nontax-teacher` / `property-valuation` |
| 양도세 UI | `transfer-tax-ui-senior` |
| 취득세 UI | `acquisition-tax-ui-senior` |
| 재산세 UI | `property-tax-ui-senior` |
| 종부세 UI | `comprehensive-tax-ui-senior` |
| 상속·증여 UI | `inheritance-gift-tax-ui-senior` |
| QA 리더 | `tax-qa-lead` (6대 세목 병렬) |
| UI-Engine 동기화 | `ui-engine-sync-checker` (read-only) |

**핵심 규칙**: 엔진 시니어와 UI 시니어는 Plan 단계부터 병렬 참여. 한쪽만 단독 작업 종료 보고 금지.

### PDCA 5단계

1. **PM/Plan**: 법령 근거 정리. 엔진+UI 시니어 **동시** 병렬 호출(Agent tool 단일 메시지). 신규 세목 UI 첫 진입 시 `docs/02-design/features/_new-tax-ui-kickoff.checklist.md` 복사·작성.
2. **Design**: `docs/02-design/features/_template.engine.design.md` 복사로 시작. **케이스 인벤토리 표 필수(행≥1)** — 비어 있으면 Do 진입 금지. 사용자가 새 케이스 제시 시 코드보다 먼저 표에 행 추가 → anchor 약속.
3. **Do**: 엔진 시니어 = 엔진 + anchor 테스트. UI 시니어 = 14개 동기화 지점 모두. 디자인 갱신 없이 우회 금지.
4. **Check**: `ui-engine-sync-checker` + QA + 브라우저 수동 확인 (실제 폼 입력 → 계산 → 결과 표시까지 전체 흐름).
5. **Act**: 회귀 후속 + 디자인 환류. PDCA 상태: `.bkit/state/pdca-status.json`.

### Definition of Done — 14개 동기화 지점 (5단 파이프라인 전수)

엔진 input·result 타입 변경 시 아래 **14개 모두** 동기화되어야 완료. ⑫⑬⑭는 TypeScript 미감지 — 누락 시 데이터 침묵 stripping/엔진 미도달 (2026-05-04 이월과세 작업에서 발견).

**클라이언트 8개 (기존)**:
① 폼 상태 타입 → ② initial value → ③ normalize fallback → ④ API 변환 (`lib/calc/{tax-type}-api.ts`) → ⑤ UI 입력 위젯 → ⑥ 사이드바 합계 (해당 시) → ⑦ 결과 카드 산식 → ⑧ **validation** (`lib/calc/{tax-type}-validate.ts`)

**API/Route 6개 (신규 enum/입력객체 추가 시 추가)**:
⑨ Zod enum (메인 — `lib/api/transfer-tax-schema.ts`) → ⑩ Zod enum (컴패니언 + `addPropertyRefines` 헬퍼 타입 — `transfer-tax-schema-sub.ts`) → ⑪ 자산-수준 `acquisitionDate` fallback (별도 서브객체에 등기접수일/취득일 받는 경우) → **⑫ Zod 입력 객체 정의** (신규 서브객체 자체를 Zod로 명시 — 미정의 시 침묵 stripping) → **⑬ callTransferTaxAPI body spread** (헬퍼만 만들고 메인 body 통합 누락 패턴 차단) → **⑭ Route handler 엔진 input 매핑** (Date 변환 포함)

**핵심 원칙**: "엔진 타입에 추가했으니 끝"이 아니라 사용자 입력이 엔진 input에 도달하는 5단 파이프라인을 모두 점검:
폼 상태(①②③) → API 변환 헬퍼(④⑬) → fetch body(⑬) → Zod 검증(⑨⑩⑫) → Route handler(⑪⑭) → 엔진 input

**⑧ 규칙**: API/UI fallback이 있는 필드는 validate에서도 같은 fallback 인식. UI 통과↔validate 차단 모순 금지.

위치 상세는 [components/calc/CLAUDE.md](components/calc/CLAUDE.md). 14개 매트릭스 상세는 메모리 `feedback_api_zod_schema_sync.md`.

**자가 점검 (작업 완료 보고 전 필수)**:
- [ ] **케이스 매트릭스 표 모든 분기 enumerate 완료** (UI 시니어 — 모드/취득원인 신설 시 매트릭스 행 ≥ 모든 분기. 토글/라디오는 의미 단위 분리. 가장 단순한 케이스부터 점검)
- [ ] anchor 테스트 작성 완료
- [ ] 14개 동기화 지점 전부 반영됨 (특히 ⑫⑬⑭ TypeScript 미감지 영역 grep 자가 점검)
- [ ] API fallback 추가 시 validation도 동기화 (⑧)
- [ ] `npx tsc --noEmit` 0건
- [ ] `npx vitest run __tests__/tax-engine/{tax-type}/` 통과
- [ ] **브라우저 수동 확인** — 폼 입력 → 계산 → 결과 표시까지 전체 흐름 (Network 탭에서 request body에 신규 필드 포함 여부 확인). 미수행 시 명시.

## 참조 문서

### 서브 CLAUDE.md (해당 디렉터리 작업 시 자동 로드)

| 영역 | 파일 |
|---|---|
| 세금 엔진 (파일 조직·의존·정수 연산·양도세 특수 설계) | [lib/tax-engine/CLAUDE.md](lib/tax-engine/CLAUDE.md) |
| UI 마법사 (StepWizard·공용 컴포넌트·14개 동기화 지점 상세) | [components/calc/CLAUDE.md](components/calc/CLAUDE.md) |
| 테스트 (Mock 패턴·시나리오 분할·anchor) | [__tests__/tax-engine/CLAUDE.md](__tests__/tax-engine/CLAUDE.md) |
| 로컬 저장소 (Dexie·resultData·Supabase 전환) | [lib/storage/CLAUDE.md](lib/storage/CLAUDE.md) |

### 설계 문서 (신기능 구현 전 반드시 읽기)

| 문서 | 경로 |
|---|---|
| PRD | `docs/00-pm/korean-tax-calc.prd.md` |
| Roadmap | `docs/00-pm/korean-tax-calc.roadmap.md` |
| Engine Design | `docs/02-design/features/korean-tax-calc-engine.design.md` |
| DB Schema | `docs/02-design/features/korean-tax-calc-db-schema.design.md` |
| UI Design | `docs/02-design/features/korean-tax-calc-ui.design.md` |
| 신규 기능 설계 템플릿 | `docs/02-design/features/_template.engine.design.md` |
| 신규 세목 UI 킥오프 체크리스트 | `docs/02-design/features/_new-tax-ui-kickoff.checklist.md` |
