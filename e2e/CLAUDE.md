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

## 6. 클릭·입력은 **hydration 전에 조용히 유실된다** — 그리고 다른 줄에서 터진다

(2026-09-25 `transfer-nbl-revenue-deemed-common.spec.ts` 실측 — 진단 전말은
`docs/00-pm/validation-warnings-display.plan.md` §7 F-7)

React 리스너가 붙기 전에 떨어진 클릭·`fill()`은 **아무 일도 일으키지 않는다.** 그런데 화면은
멀쩡해 보인다 — DOM에는 값이 들어가고 native radio는 `checked`까지 된다. **React 상태만
그대로다.** 그 어긋남은 그 자리에서 터지지 않고 **한참 뒤 전혀 다른 줄**에서 30초 타임아웃으로
나타나, 범인이 늘 잘못 지목된다. 한 spec에서 실측된 증상만 넷이었다:

| 증상이 난 자리 | 진짜 원인 |
|---|---|
| `getByRole("combobox").first()` 30초 | 그 앞의 라디오 클릭 유실 → 섹션 자체가 미렌더 |
| 옵션이 「resolved … waiting for element to be visible」 | 전역 옵션 조회가 **다른 포털의 안 보이는 옵션**을 집음 |
| 상세 섹션 미출현 | 토글 클릭 유실 |
| 입력칸이 통째로 없음 | 날짜 `fill()` 유실 → 엔진이 **다른 분기**를 타 `aria-hidden` 처리 |

- ✅ **긴 풀플로우 spec은 맨 앞에서 hydration을 기다린다.** React는 hydration 시점에 host DOM
  노드에 `__reactFiber$…`/`__reactProps$…`를 붙인다 — 그 키의 존재가 직접 증거다.
  ```ts
  await page.waitForFunction(() => {
    const el = document.querySelector('[data-testid="transfer-date"] input');
    return !!el && Object.keys(el).some((k) => k.startsWith("__react"));
  });
  ```
- ✅ **누른 뒤에는 «그 결과»를 단언하고 넘어간다.** 유실을 그 자리에서 잡아야 범인이 바로 나온다.

### 6-1. 🔴 「유실됐나 보다」며 **다시 누르는** 재시도가 부모를 토글한다

재시도 헬퍼를 넣었다가 **없던 실패를 만들었다**(전건 실행에서 관측). 실측:

| 동작 | 바깥 스위치 | 안쪽 섹션 |
|---|---|---|
| `ToggleCard` 스위치 ON | `true` | — |
| 안쪽 라디오 클릭 | `true` | 1개 |
| **같은 라디오 재클릭** | **`false`** | **0개** |

이미 선택된 라디오를 다시 누르면 그 클릭이 바깥 `ToggleCard`까지 올라가 **카드가 꺼지고 내용이
통째로 사라진다**. ⇒ 재시도는 **「이미 그 상태인가」를 먼저 읽고** 아닐 때만 누른다. 상태를 읽을
수 없으면 **한 번만 누르고 넉넉히 기다린다**(유실은 §6의 hydration 대기로 막는다).

### 6-2. 🔴 `isChecked()`는 상태 판정에 쓸 수 없다 — `aria-checked`는 쓸 수 있다

| | 누가 세우는가 | 재시도 가드로 |
|---|---|---|
| native `<input type="radio">`의 `isChecked()` | **브라우저** — React 미도달 클릭도 `true` | ❌ 「골랐는데 안 뜨는」 교착 |
| `ToggleCard`/`Switch`의 `aria-checked` | **React가 렌더** | ✅ |
| BaseUI `Select` 트리거의 `aria-expanded` | **React가 렌더** | ✅ |

판정 기준은 언제나 **React가 실제로 렌더한 결과**여야 한다.

### 6-3. 옵션은 방금 연 `listbox` 안에서 찾는다

`page.getByRole("option", { name })`는 **페이지 전역**이라 다른 Select의 포털에 걸린다. 그러면
locator는 resolve되는데 영영 visible이 되지 않아 **30초를 버린다**.

```ts
await expect(page.getByRole("listbox")).toBeVisible();
await page.getByRole("listbox").getByRole("option", { name }).click();
```

### 6-4. 긴 풀플로우에는 **예산**을 준다

기본 타임아웃은 30초(CI 60초)다. 입력 30여 단계를 거치는 풀플로우 spec이 이 기본값으로 돌면
평소엔 남아도 서버가 붐빌 때 **여유가 0**이 된다. 같은 무게의 spec들은 이미
`test.setTimeout(60_000~120_000)`을 쓴다. ⚠️ 단언을 약화시키는 것이 아니다 — 틀린 결과는
120초를 줘도 틀리다.

> 🪤 **그 전에 dev 서버 나이부터 재라.** `reuseExistingServer: !CI`라 로컬 전건 실행은 며칠째
> 떠 있던 서버를 그대로 쓴다. 가동 4일·RSS 3.3GB 서버에서 6/9 실패하던 spec이 **재시작만으로
> 9/9 통과**했고 전건 소요도 17.2분 → 7.7분이 됐다(2026-09-25 실측). CI는 job마다 새 서버라
> 이 증상이 없다 — 「로컬 전건에서만 깨지는 spec」의 유력한 정체다.
> ⚠️ 환경이 시간에 따라 나빠지므로 **A/B는 교차 실행**할 것. 몰아서 재면 드리프트가 결과로 둔갑한다.
