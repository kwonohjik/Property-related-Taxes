# CLAUDE.md

**KoreanTaxCalc** — 한국 부동산 6대 세금(양도·상속·증여·취득·재산·종합부동산세) + 주식양도세 자동계산 웹 앱. 전 세목 엔진·UI·API·결과뷰·테스트 완료(계산 결과 선택 출력 공통화 8 결과뷰, 상속·증여세는 별지 서식(별지9호·부표2·3·5 등) PDF 재현까지). 최근 완료 이력: [docs/00-pm/recent-completions.md](docs/00-pm/recent-completions.md) — 초기 로드맵은 현황과 차이 큼(Next.js 16·6세목 완료 미반영).

> 📏 **이 파일은 매 세션 통째로 로드된다 — 모든 작업에 적용되는 규칙만 둔다.** 공식 권장은 파일당 200줄 이하다(길수록 준수율이 떨어진다). 한 폴더에서만 필요한 규칙은 그 폴더의 `CLAUDE.md`(그 폴더 파일을 읽거나 고칠 때 로드된다)에, 배경·실측 수치·사고 경위는 `docs/`에 두고 여기에는 규칙 한 줄과 링크만 남긴다. 교훈을 추가할 때도 이 기준을 지킨다.

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
npm test                      # vitest 전체 (1회) — 반복 검증에는 쓰지 않는다(아래 「테스트」)
npm run test:watch            # vitest 감시 모드
npx vitest run <path>         # 단일 파일/디렉터리
npx vitest run -t "T-01"      # 이름 패턴
npx playwright test <spec>    # E2E 단일 스펙 (비-worktree는 E2E_PORT 생략, 기본 3000)
npx shadcn@latest add <name>  # shadcn/ui 컴포넌트 추가

# 데이터·법령 (.env.local 필요)
npm run seed:tax-rates        # Supabase tax_rates 시딩
npm run verify:legal          # 법령 조문 상수 검증 (:refresh = 캐시 무효화 후)
```

## 🔴 세금 엔진 규칙 — 어기면 세액이 조용히 틀린다

- 정수 연산: 금액은 원(KRW, 정수). `applyRate()`/`safeMultiply()` 사용. **`Math.round()` 금지**.
- 중간 절사: 세율 × 금액 직후 `Math.floor()`. 지방소득세는 원 미만 절사.
- 면적 반올림은 `round2()`(`lib/tax-engine/area-utils.ts`) 후 단가 곱셈 — 인라인 `parseFloat(x.toFixed(2))` 금지(결과가 다르다: 8.045 → 8.05 vs 8.04).
- DB 기반 세율: `tax_rates` jsonb. key: `${tax_type}:${category}:${sub_category}`.
- 감면 중복배제(양도세 조특법 §127⑦·취득세/재산세 지방세특례제한법 §180): 후보 배열 max 패턴.
- 법령 조문 상수: 문자열 리터럴 금지. `lib/tax-engine/legal-codes/`의 `TRANSFER.*` 등 상수. 새 조문을 인용하면 **`lib/legal-verification/manifest/additions-{세목}.ts`에도 등록** — 안 하면 `npm run verify:legal` 대상에서 조용히 빠져 개정돼도 모른다(게이트: `__tests__/lib/legal-verification-coverage-complete.test.ts`). 키워드는 KoreanLaw MCP로 조회한 본문의 verbatim 표현(강학상 용어 금지), 등록 후 `npm run verify:legal`로 확인.
- API Date 직렬화 — `lib/api/date-coerce.ts` 필수. JSON 경유 후 string 도달 → `Date < string` silent false 함정. `toDate(v, "field")` / `toOptionalDate(v)` / `coerceDates(obj, [...])`. **신규 코드 `new Date(x)` 직접 호출 금지**.
- **자동 안분 fallback 금지**(예외: PHD §164⑦). 미입력은 검증 오류로 차단.
- 법령 정확성 최우선. 납세자 유리/불리·절감 표현 금지.

## 🔴 검증 기준 — 추정 금지 (강제)

계획·설계·분석·검토 문서의 모든 주장은 **추정 금지**. 인용 file:line은 실제 파일로, 동작·수치는 throwaway probe/anchor 실측으로 검증 후 단정. "현행 일치 예상"·"아마"·미확인 인용 금지. 미검증은 "확인 필요" 명시. (memory `feedback_pre_anchor_verification` · `feedback_numeric_impact_verify_before_bug_claim` · `feedback_korean_law_citation_verify`)

## 🔴 UI 규칙 (상세·강제력: [components/calc/CLAUDE.md](components/calc/CLAUDE.md))

- **useEffect → store 미러링 금지**. cross-field 동기화는 onChange/useMemo.
- 계산 로직 순서 = UI 표시 순서(모드 토글은 영향 필드 직전).
- 토글/라디오는 `ToggleCard`/`RadioCardGroup` 필수, native 신규 금지, OFF도 tone 유지. 공시지가는 `LandPriceLookupField` 필수.
- 안내·섹션 카드는 `<ToneCard>`(인라인 톤 하드코딩 금지·`tones.ts` 단일 소스). 라벨 크기는 역할별 정본 클래스(임의 px `text-[Npx]` 금지·pre-push 게이트). 모달 런처 버튼은 `<Button variant="modalLauncher">`(native 런처 금지).
- 결과 산식은 한국어 풀어쓰기(변수 약어·`floor()` 금지). 사이드바 합계는 계산 가능한 항목만 0원 제외.
- placeholder 숫자 예시 금지 — 형식 설명은 FieldCard `hint`.

## 새 기능 추가 워크플로 (강제)

엔진+UI 시니어를 **Plan 단계부터 단일 메시지로 병렬 호출**(한쪽 단독 보고 금지) → **Do는 시퀀셜**(엔진이 타입·헬퍼·anchor 선처리 → UI가 ⑤⑥⑦ 담당) → Check는 `ui-engine-sync-checker`(14지점) + `bkit:gap-detector`(matchRate). 에이전트 목록·PDCA 5단계·E2E 표준 상세: [docs/00-pm/feature-workflow.md](docs/00-pm/feature-workflow.md).

### Definition of Done — 14개 동기화 지점

엔진 input·result 변경 시 14개 **모두** 동기화. ⑫⑬⑭는 TypeScript 미감지 — 누락 시 침묵 stripping/엔진 미도달.

**클라이언트 8개**: ①폼 상태 → ②initial → ③normalize → ④API 변환(`lib/calc/{tax}-api.ts`) → ⑤UI 위젯 → ⑥사이드바 합계 → ⑦결과 카드 → ⑧validation(`lib/calc/{tax}-validate.ts`).

**API/Route 6개**: ⑨Zod enum 메인 → ⑩Zod enum 컴패니언+`addPropertyRefines` → ⑪자산-수준 `acquisitionDate` fallback → **⑫Zod 입력 객체 정의** → **⑬callTransferTaxAPI body spread** → **⑭Route handler 엔진 input 매핑(Date 변환)**.

**5단 파이프라인 전수 점검**: 폼(①②③) → 변환(④⑬) → fetch body(⑬) → Zod(⑨⑩⑫) → Route(⑪⑭) → 엔진 input. ⑧ 규칙: API/UI fallback 있는 필드는 validate도 동일 fallback. UI 통과↔validate 차단 모순 금지.

**3중 패턴 강제** (skill `mirror-pattern`): UI display fallback이 있는 필드는 API 변환·validate 모두 동일 fallback 적용. 토글/라디오 기본값(예: `redevSubject || "apt"`)도 3 layer 모두 일치. `useEffect → store` 미러링으로 fallback 구현 금지 — 무한 루프 위험.

**완료 보고 전 자가 점검**:
- [ ] 케이스 매트릭스 표 모든 분기 enumerate (단순 케이스부터)
- [ ] anchor 테스트 작성
- [ ] 14지점 전부 (⑫⑬⑭ grep 자가 점검)
- [ ] API fallback ↔ validation 동기화
- [ ] `npx tsc --noEmit` 0건
- [ ] `npx vitest run __tests__/tax-engine/{tax}/` 통과
- [ ] **브라우저 수동 확인** (폼→계산→결과, Network 탭 request body 신규 필드 확인). 미수행 시 명시.

## File Size Policy (강제)

**분리 트리거 800줄 · 착지 목표 ≤700줄**(hard cap 800, PostToolUse hook 경고 — 우회 금지). 800줄 초과 감지 시 즉시 분리(orchestrator + helpers/types/sections).

- **트리거(800)와 착지목표(≤700)를 분리**한다. 800 직하로 착지시키면 기능 1건(≈+50줄)마다 재분리 thrash → `transfer-tax.ts`가 "≈800" 분리 후 801줄로 재초과한 실례. ≤700 착지로 ≈100줄(기능 2건) 데드밴드 확보.
- **트리거는 낮추지 않는다**: 700~749에 안정적으로 앉은 파일을 커지지도 않는데 미리 쪼개면 순수 낭비(Simplicity/Surgical). 800 초과 시에만 분리하되, 분리할 땐 여유분까지 확보.
- **줄 수는 응집도에 종속**: ≤700은 여유분 목표이지 숫자 맞추기가 아니다. 자연 이음매로 2분할해 ≤700이 안 되면 3분할하거나 더 깊은 이음매를 찾는다. 억지 조각화 금지(과분할 방지 — ~500 이하로 무리하게 내리지 말 것).
- **타입 전용 파일 예외**: 로직 없이 타입 선언만 나열된 파일(`*.types.ts` 등)은 분리 가치 낮음(재성장 위험 낮음·import 간접만 증가) — 별도 판단.
- **기회주의적 분리**: 기능 작업으로 이미 연 파일이 ≥750 위험구간이면 그 김에 깊게 분리 — 미래의 분리 전용 PR(고정비: PR·리뷰·pre-push 전체 테스트) 회피.

## 테스트 — 반복 검증에 전체 실행 금지

| 상황 | 명령 |
|---|---|
| 작업 중 반복 검증 | `npx vitest run __tests__/tax-engine/{tax}/ __tests__/calc/` |
| 세목 단위 회귀 | `npm run test:{transfer\|acquisition\|property\|comprehensive\|inheritance\|gift}` |
| push 직전·PR 전 | pre-push가 자동 판정 / `npm run check:pre-pr` |

- pre-push는 변경 경로로 범위를 자동 판정한다(`scripts/select-test-scope.sh`): 세목 전용 경로만 → 그 세목 / `docs/**`·`*.md`·`e2e/**`만 → vitest 생략 / `lib/tax-engine/**`·`lib/api/**`·`lib/stores/**`·`types/**`·설정 파일·두 세목 동시·판정 불가 → 전체. 강제 전체는 `FULL_TEST=1 git push`.
- 판정 규칙을 넓히려면 `scripts/select-test-scope.test.sh`에 케이스를 먼저 추가한다 — 좁히기 오판정은 회귀 안전망을 뚫는다.
- `.test.ts`는 node 환경(모듈 격리 끔), `.test.tsx`는 jsdom이다. 컴포넌트를 렌더하는 `.test.ts`는 `document is not defined`로 실패한다 → `.test.tsx`로 만들거나 `vitest.config.ts`의 `DOM_TS`에 추가. mock·가짜 타이머·store 등 전역 상태를 바꾸는 파일은 자동으로 `node-isolated`로 가고, 공유 실행에서만 깨지는 파일은 `FORCE_ISOLATED`에 넣는다.
- 작성 규칙(Mock·시나리오 분할·anchor): [__tests__/tax-engine/CLAUDE.md](__tests__/tax-engine/CLAUDE.md) · E2E: [e2e/CLAUDE.md](e2e/CLAUDE.md).

## 커밋·PR·머지

- 자동 게이트: husky pre-commit(lint-staged) + pre-push(폰트·톤·다크 짝·워크플로 러너 + typecheck + lint + 범위 선택 테스트) + CI(PR에서만). **master에 브랜치 보호가 없어 CI는 머지를 막지 않는다** — 실질 관문은 pre-push뿐이다.
- `scripts/ship.sh <branch> "<commit message>"` = 브랜치 → 커밋 → 푸시 → PR → 즉시 머지 → 브랜치 삭제 → master 동기화(CI를 기다리지 않는다). 작은 수정 여러 개는 한 브랜치에 모아 1회 ship.
- 🔴 **`--auto` 금지** — 이 저장소에서 `gh pr merge --auto`(와 `ship.sh --auto`)는 「CI 통과 후 머지」가 아니라 즉시 머지다. 확인 목적으로도 부르지 말 것.
- CI 통과 후 머지해야 하면: `git push -u origin <branch> && gh pr create --fill --base master` → `statusCheckRollup`의 conclusion 전건 `SUCCESS` + `headRefOid` 일치를 확인(pending이면 확정까지 폴링) → `gh pr merge <n> --merge --delete-branch`. `gh pr checks --watch`의 exit code로 판정하지 않는다 — 파이프를 걸면 실패해도 0, 체크 등록 전에 부르면 곧바로 0이다.
- ESLint --fix 함정: pre-commit lint-staged의 `eslint --fix`가 미사용 import 정리 시 같은 라인의 사용 중인 named export까지 제거할 수 있다(`import { CurrencyInput, parseAmount }`에서 CurrencyInput만 미사용 → parseAmount도 제거 → TS2304). 회피: 신규 import는 한 라인에 한 named만. pre-push `tsc`가 잡지만 fix 커밋 1개 추가됨.
- 상세·사고 경위: [docs/00-pm/ci-pipeline.md](docs/00-pm/ci-pipeline.md).

## CI — GitHub 호스팅 러너, PR에서만

- job: `check`(typecheck+lint) · `test`(vitest 4샤드) · `e2e`(Playwright 12샤드) · `e2e-report`. 문서 전용(`**.md`·`docs/**`·`.claude/**`)·draft PR은 건너뛴다. E2E는 CI에만 있다(pre-push에 없음). Node는 `setup-node`로 24 고정.
- 신규 워크플로는 `runs-on: ubuntu-latest`. self-hosted는 pre-push가 차단한다(`scripts/check-workflow-runner.sh` — public 저장소라 fork PR이 개발자 Mac에서 코드를 실행할 수 있다). 저장소를 비공개로 되돌리면 이 방향부터 재검토.
- 샤드 수를 바꾸면 `ci.yml`의 `--shard=N/분모`도 함께 바꾸고, 샤드 합집합 = 전체(누락·중복 0)를 한 리포터(json)로 대조한다 — 어긋나면 일부 테스트가 조용히 실행되지 않는다. `--reporter=dot` 요약은 적게 집계하므로 json과 섞지 말 것.
- `timeout-minutes`는 호스팅 러너 실측으로만 갱신(Mac 수치 금지). Playwright 타임아웃은 CI 60초 / 로컬 30초 — 로컬은 올리지 않는다.
- job 레벨 `continue-on-error`는 체크를 초록으로 만들지 않는다(conclusion은 `failure` 그대로).
- 배경·실측 이력(러너 전환·샤딩·법제처 API 실패 원인과 기각된 가설 — 재조사 전에 먼저 볼 것): [docs/00-pm/ci-pipeline.md](docs/00-pm/ci-pipeline.md).

## Tech Stack

Next.js 16 (App Router, React 19, Turbopack) + TS strict / shadcn(BaseUI) + Tailwind v4 + zustand / Next Route Handlers (`app/api/**`) / Supabase (Auth + Postgres) / vitest(node·jsdom) + RTL / Playwright E2E / Sentry (`tax_type`·`request_id` 태그).

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
  → 감면 라우터: lib/tax-engine/transfer-reductions/ (조문별 구현 여부: metadata.isFullyImplemented)
  → 양도세 4-파일 분할: transfer-tax.ts + -helpers.ts + -rate-calc.ts + -finalize.ts
  → 환산: commercial-building-valuation.ts / general-building-valuation.ts

lib/calc/ — 클라이언트↔API 변환 (14개 동기화 지점 ④⑧ 담당)
```

세부 파일 조직·의존·정수 연산: [lib/tax-engine/CLAUDE.md](lib/tax-engine/CLAUDE.md).

## 인프라

- Supabase / DB: `supabase/migrations/`(tax_rates·regulated_areas·standard_prices·users·calculations). 시딩 `npm run seed:tax-rates`. 환경변수 미설정 시 graceful 통과(로컬 개발 가능). `DISTINCT ON` 미지원 → DB Function `preload_tax_rates()`. `supabase-keepalive` 워크플로(3일마다)가 밀리면 Supabase가 pause되어 세율 로드가 fallback으로 떨어진다.
- Route Protection (`proxy.ts`): `updateSession`으로 Auth 세션만 유지 — 이력 로컬 IndexedDB 일원화로 보호 라우트(`/api/history`·`/api/pdf`) 제거됨. 모든 계산·법령 라우트 비로그인 허용.
- 로컬 저장소: IndexedDB(Dexie). 비로그인 sessionStorage 보존→로그인 후 마이그레이션. zustand `result`는 partialize 제외. Store 마이그: `lib/stores/calc-wizard-migration.ts`. 상세: [lib/storage/CLAUDE.md](lib/storage/CLAUDE.md).
- 법령 리서치 (`/law`): 법제처 Open API 직접 호출(`KOREAN_LAW_OC` — 없으면 `/law`는 검색창 대신 안내 화면). 라우트 `app/api/law/**`, 클라이언트 `lib/korean-law/`. 상세(Query Router·행위시법·신구대조·캐시 TTL): [lib/korean-law/CLAUDE.md](lib/korean-law/CLAUDE.md).
- 키움 OpenAPI 자동조회: 주식 시세 자동조회(양도·상속·증여 공용). 시점 4종·인프라·법령 인용 정정: [lib/kiwoom/CLAUDE.md](lib/kiwoom/CLAUDE.md).

## 참조 문서

| 영역 | 파일 |
|---|---|
| 세금 엔진 (파일·의존·정수·양도세 설계) | [lib/tax-engine/CLAUDE.md](lib/tax-engine/CLAUDE.md) |
| UI 마법사 (StepWizard·공용·14지점 상세·양도세 특수 분기 진입점) | [components/calc/CLAUDE.md](components/calc/CLAUDE.md) |
| 테스트 (Mock·시나리오 분할·anchor) | [__tests__/tax-engine/CLAUDE.md](__tests__/tax-engine/CLAUDE.md) |
| E2E (셀렉터·hydration·외부 API mock·CI 게이트) | [e2e/CLAUDE.md](e2e/CLAUDE.md) |
| 로컬 저장소 (Dexie·resultData·Supabase 전환) | [lib/storage/CLAUDE.md](lib/storage/CLAUDE.md) |
| 법령 리서치 `/law` (Query Router·행위시법·신구대조) | [lib/korean-law/CLAUDE.md](lib/korean-law/CLAUDE.md) |
| 키움 자동조회 (시점·인프라·법령) | [lib/kiwoom/CLAUDE.md](lib/kiwoom/CLAUDE.md) |
| CI·테스트 범위·머지 (상세·배경·실측 이력) | [docs/00-pm/ci-pipeline.md](docs/00-pm/ci-pipeline.md) |
| 새 기능 워크플로 (에이전트·PDCA·E2E 상세) | [docs/00-pm/feature-workflow.md](docs/00-pm/feature-workflow.md) |
| PRD / Roadmap | `docs/00-pm/korean-tax-calc.{prd,roadmap}.md` |
| Engine / DB / UI Design | `docs/02-design/features/korean-tax-calc-{engine,db-schema,ui}.design.md` |
| 신규 기능 템플릿 / 세목 UI 킥오프 | `docs/02-design/features/_template.engine.design.md` · `_new-tax-ui-kickoff.checklist.md` |
| 최근 완료 이력 | [docs/00-pm/recent-completions.md](docs/00-pm/recent-completions.md) |
