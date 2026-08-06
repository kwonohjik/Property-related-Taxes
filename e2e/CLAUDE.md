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

## 2. 버튼 — `name` + `exact:true` 는 설명 텍스트 합쳐짐 주의

버튼 안에 제목 div + 설명 div가 같이 있으면 accessible name이 **합쳐진다**
(예: `환산취득가` 버튼의 실제 name = `"환산취득가양도가 × 기준시가 비율"`). `exact:true`로 제목만 매칭하면 0개로 실패한다.

- ✅ 권장: 부분 매칭 `getByRole("button", { name: "환산취득가" })`, 또는 제목 텍스트를 직접 타겟 후 상위 button 클릭.
- ⚠️ `exact:true`는 설명 div가 없는 단순 버튼에만.

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
