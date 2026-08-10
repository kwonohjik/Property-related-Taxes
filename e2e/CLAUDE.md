# e2e/ — Playwright E2E 셀렉터 규칙

신규·수정 spec 작성 시 아래 셀렉터 안티패턴을 피한다. (배경: `transfer-nbl-academy-land.spec.ts` spec rot 복구 PR #417 — 진단·근거는 `docs/00-pm/e2e-selector-robustness-audit.plan.md`)

## 1. 날짜 입력 — 공용 헬퍼 사용 (직접 `getByLabel("연도/월/일").nth()` 지양)

`DateInput`은 `aria-label="연도"·"월"·"일"`을 쓴다. `getByLabel("일")`은 **substring 매칭**이라 "일"을 포함한 다른 라벨(radio 등)까지 잡혀, `.nth(2+)`가 엉뚱한 컨트롤로 해석된다(academy rot의 직접 원인).

- ✅ 권장: `fillDateAndVerify(page, { year, month, day }, { scope })` (`_helpers/tax-flow.ts`)
  - `scope`(Locator)로 카드 내부 날짜를 한정 — 페이지 인덱스 의존 제거.
- ⚠️ 불가피하게 직접 쓸 때:
  - `getByLabel("일", { exact: true })` — substring 오매칭 차단.
  - 깊은 인덱스 `.nth(2+)`는 금지 → 해당 날짜를 감싸는 컨테이너로 `scope` 한정.
  - `.nth(0)`/`.nth(1)`(페이지 상단 양도일·신고일)도 인덱스 시프트 위험이 잠재하니 가능하면 스코프.

## 2. 선택지 카드 — `name` + `exact:true` 는 설명 텍스트 합쳐짐 주의

제목 + 설명이 한 컨트롤 안에 있으면 accessible name이 **합쳐진다**
(예: 환산취득가의 실제 name = `"환산취득가양도가 × 기준시가 비율"`). `exact:true`로 제목만 매칭하면 0개로 실패한다.

- ✅ 권장: 부분 매칭 `getByRole("radio", { name: "환산취득가" })`.
- ⚠️ `exact:true`는 설명이 없는 단순 버튼에만.
- ⚠️ **role이 바뀌었다**: 「취득가액 산정 방식」은 2026-08-11부터 native `<button>` 카드가 아니라
  `RadioCardGroup`(**`radio`**)이다. 같은 라벨을 쓰는 파트별 라디오와 동시 렌더되는 화면에서는
  `data-testid`로 스코프해야 strict mode 위반을 피한다(`landAcqGroup`·`buildingAcqGroup` 참조).

## 3. 결과 화면 라벨 중복 — visible/스코프 한정

결과 화면은 같은 라벨이 여러 곳에 나올 수 있다(예: `총 납부세액` = 요약 카드(인쇄용 hidden) + 납부 카드(visible)). 무방어 `locator('p:has-text("총 납부세액")')`는 strict mode 위반.

- ✅ 권장: `data-print-id`/`data-testid` 등 고유 속성으로 스코프, 또는 visible 요소 한정(`.last()` 등 — 단 DOM 순서 가정은 probe로 확인).
- 부재 단언은 `toHaveCount(0)`로 — strict 무관.
- 결과 테이블에서 같은 라벨(예: `산출세액`·`결정세액`)이 본세 표 + 지방소득세 명세에 중복될 수 있으니, 행 선택 시 `.first()`(본세) 여부를 확인.

## 4. 셀렉터 확정은 추정 금지 — probe로 검증

라벨 개수·DOM 순서·visible 여부는 결과뷰 구조에 의존한다. 새 셀렉터는 throwaway probe spec으로 count·순서를 실측한 뒤 확정한다("아마 nth(2)일 것" 금지).

## 5. 외부 API 의존 spec은 `page.route`로 mock — 실호출 금지

정부 API(주소·시가표준액·법제처)에 의존하는 spec은 **전부 mock**한다. 외부 가용성이 우리 코드의 신호를 오염시키기 때문이다.

- 주소·시가표준액: `building-register-autofill.spec.ts:22` 등 **14 spec**의 `page.route("**/api/address/**")`
- 법제처: `_helpers/law-api-mock.ts` — fixture 캡처/재생(`LAW_FIXTURE_CAPTURE=1`로 갱신)

> ⚠️ **실호출 감시를 없애는 것이 아니다** — 스케줄 워크플로로 분리한다(`.github/workflows/law-api-health.yml`, `LAW_E2E_LIVE=1`).
> 🪤 로컬 대조 실험 시 `.legal-cache/`(TTL 30일)가 mock 없이도 통과시켜 **검증을 무효로 만든다**. 반드시 `rm -rf .legal-cache` + dev 서버 재시작 후 확인할 것.

### 5-1. `page.route` mock은 **서버 렌더 게이트**를 못 막는다

mock은 브라우저 요청을 가로챌 뿐이다. 환경변수로 **화면 자체를 가르는** 게이트가 서버에 있으면
검색창이 애초에 DOM에 없어 mock이 닿을 곳이 없다 — `app/law/page.tsx`의
`Boolean(process.env.KOREAN_LAW_OC)`가 그 예다.

`.gitignore`가 `.env*`를 제외하므로 **`git worktree add`로 만든 트리에는 `.env.local`이 없다.**
그대로 두면 `law-*` **12건이 「통합 검색창을 찾을 수 없음」으로 타임아웃**한다(2026-08-09 실측).
`playwright.config.ts`의 `webServer.env`가 폴백을 넣어 해소했다(anchor:
`__tests__/e2e-config/law-oc-worktree-fallback.anchor.test.ts`).

> 🪤 **워크트리끼리 대조하면 오판한다.** 양쪽 다 키가 없어 **둘 다 실패**하므로 「master에서도
> 실패하니 기존 실패」로 읽힌다 — 그런데 **메인 트리에서는 통과**한다. 환경 기인 실패를 의심할
> 때 대조군은 **메인 체크아웃**이어야 한다.
