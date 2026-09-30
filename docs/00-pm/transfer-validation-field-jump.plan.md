# 양도세 검증 오류 → 수정할 입력칸으로 이동

- 작성: 2026-09-30
- 선행: PR #1883 (하단 sticky 오류 목록 · 실시간 갱신) — 계획서 `transfer-validation-issue-panel.plan.md` §7 「범위 밖」 1번의 후속
- 브랜치·워크트리: `feat/transfer-validation-field-jump` · `.claude/worktrees/transfer-field-jump` (slot 1 — dev 3001 / E2E 3101)
- 범위: **UI 이동 + 검증 메시지에 필드 식별자 부착**. 검증 **규칙**(무엇을 막는가)·엔진·API·store 무변경.

## 1. 목표와 성공 기준

오류 목록의 항목을 누르면 **그 오류를 고칠 입력칸**으로 스크롤하고 커서를 둔다. 지금은 자산 카드까지만 간다(`TransferTaxCalculator.tsx` `scrollToAssetCard`). 1~3단계 오류는 아예 누를 수 없다.

- 필드가 식별된 오류: 항목 클릭 → 입력칸이 화면 안(`toBeInViewport`) + 포커스(`toBeFocused`)
- 입력칸이 접힌 섹션 안에 있어도 펼쳐서 간다
- 필드가 아직 식별되지 않은 오류: **현행 동작으로 후퇴**(자산 카드 → 없으면 아무 일 없음). 퇴행 0
- 1~3단계 오류도 필드가 있으면 누를 수 있다

## 2. 현행 실측

### 2.1 검증 쪽 — 필드 정보가 없다

- `ValidationIssue = { message, step, assetIndex? }` (`lib/calc/transfer-tax-validate.ts:42-47`) — **어느 입력칸인지 없다**.
- 메시지 생산 구조가 둘이다:

| 구조 | 위치 | 규모 | 필드 부착 난이도 |
|---|---|---|---|
| **직접 push** — `issues.push({ step, message })` | `transfer-tax-validate.ts` step 0(:62-445) 11곳 · step 1~3(:446-753) 24곳 | 35곳 | 낮음 — 객체에 `field`만 추가 |
| **감면 `fail()` 클로저** — `ValidationIssue`를 직접 만든다 | `transfer-tax-validate-reductions.ts:57` | `fail(` 89회 | 낮음 — `fail(message, field?)` |
| **문자열 반환 하위 검증** — `string \| null`을 돌려주고 자산 오케스트레이터가 모은다 | `validateAssetEntry`(`transfer-tax-validate-asset.ts:103`) → `validateAssetAcquisition`·`validateGeneralBuildingAsset` 등 20여 파일. 자산당 **첫 오류 1건**만 올라온다(`transfer-tax-validate.ts:394-395`) | 정규식 근사 **약 440곳**(`return "`/`` return ` ``/`push(` 계수 — 비메시지 반환 일부 포함, **정확한 수는 Do 전 확인 필요**) | **높음** — 아래 2.3 |

파일별 근사(정규식): acquisition 87 · gb 55 · redev 45 · rental-exception 31 · bg 27 · nbl-other 25 · commercial-asset 23 · asset 23 · mixed-use-asset 22 · nbl 20 · expropriation 16 · split 15 · 기타 9파일 44.

### 2.2 화면 쪽 — 입력칸을 가리킬 수단이 없다

- 양도세 UI 입력 위젯: `ToggleCard` 268 · `CurrencyInput` 206 · `DateInput` 163 · `DecimalInput` 123 · `RadioCardGroup` 123 · `LandPriceLookupField` 26 · `Select` 21 · `FieldCard` 320 (`components/calc/transfer`·`app/calc/transfer-tax` grep).
- `FieldCard`에 식별 속성이 없다 — `data-slot="field-card"`뿐(`components/calc/inputs/FieldCard.tsx:41`). `DateInput`은 `data-testid`만 받는다(`components/ui/date-input.tsx:25·158`).
- 자산 카드 섹션 ①~⑤는 접혀도 **DOM에 남는다** — `hidden print:block`(`AssetSection.tsx:130`). ⇒ 입력칸은 찾을 수 있지만 **펼치지 않으면 보이지 않는다**.
- 섹션 강제 펼침은 **오류 배너가 걸린 카드 하나**만 한다(`CompanionAssetCard.tsx:180` `forceOpenAll = !!errorMessage`, 배너 대상은 첫 자산 오류 1개 — `TransferTaxCalculator.tsx` `errorAssetIndex`). 자산 2의 오류를 눌러도 자산 2 카드는 접힌 채다.

### 2.3 🔑 설계를 가르는 사실 — 하위 검증의 문자열 반환을 테스트가 직접 붙잡고 있다

하위 검증 함수를 테스트가 **직접** 호출하는 횟수(grep): `validateAssetAcquisition` 109 · `validateSplitDirectInputs` 93 · `validateGeneralBuildingAsset` 35 · `validateBurdenedGiftAsset` 31 · `validateAssetEntry` 26 · `validateRedevelopmentAsset` 19 · …
반환 타입을 `string` → `{ message, field }`로 바꾸면 이 단언들(`toBe("…")`·`toMatch`)이 **수백 건** 깨진다. 반면 최상위(`collectStepIssues`·`validateStep`)만 쓰는 테스트는 영향이 없고, 이슈 객체를 **통째로 비교**(`toEqual({ step…})`·`toStrictEqual`)하는 테스트는 grep 0건이다 ⇒ **이슈 객체에 `field`를 추가하는 것 자체는 안전**(Do에서 실행으로 확정 — V-1).

### 2.4 형제 경로

주식양도세(`StockValidationError { field, message, severity }` — `stock-transfer-tax-validate.ts:40`)와 1주택 판정 메뉴는 **필드 키를 이미 갖고 있다**. 그러나 그 키로 입력칸에 이동하는 UI는 **어디에도 없다**(`data-field`·`scrollToField`·`focusField` grep 0건). ⇒ 재사용할 선례는 「키를 메시지와 함께 둔다」까지이고 이동 메커니즘은 신규다.

## 3. 설계

### D-1. 필드 키 = 폼 경로 문자열

- 폼 전역: `TransferFormData` 키 그대로 — `transferDate`·`contractTotalPrice`·`householdHousingCount`
- 자산 수준: `AssetForm` 키 그대로 — `acquisitionDate`·`fixedAcquisitionPrice`. 어느 자산인지는 **기존 `assetIndex`가 준다**(키에 인덱스를 넣지 않는다)
- 배열 하위: `경로.인덱스.키` — `houseEntries.1.acquisitionDate`
- 타입: `` `${keyof TransferFormData}` | `${keyof AssetForm}` | `${string}.${number}.${string}` `` — 최상위·자산 1단계 오타는 컴파일러가 잡는다

### D-2. 화면 앵커 = `data-field` 속성

- `FieldCard`에 `field?: string` prop → 루트에 `data-field`. 가장 많은 입력이 FieldCard 안이라 **한 곳 수정으로 대부분이 앵커가 된다**
- FieldCard 밖 위젯(`ToggleCard`·`RadioCardGroup` 단독 사용 등)은 해당 컴포넌트에 같은 prop을 추가하거나 감싸는 div에 `data-field`
- 자산 수준은 `[data-asset-card-index="i"] [data-field="key"]`로 **카드 안에서만** 찾는다(카드마다 같은 키가 반복되므로)

### D-3. ✅ Q-1(F 확정) — 문자열 반환 하위 검증에 필드를 어떻게 붙이나

| 안 | 방법 | 테스트 영향 | 평가 |
|---|---|---|---|
| **F (권장)** 수집기 | `fieldError(field, message)`는 **문자열을 그대로 반환**하면서, `collectStepIssues`가 실행 중일 때만 열어 두는 수집기에 `message → field`를 기록한다. `collectStepIssues`가 끝에 각 이슈의 메시지로 필드를 찾아 붙인다 | **0건** — 하위 함수의 반환값·시그니처 불변 | 파일별 점진 이관 가능. 검증은 동기 순수 함수라 실행 중 끼어들기가 없다(JS 단일 스레드). 단점: 암묵적(동적 스코프) — 모듈 한 곳에 격리하고 주석으로 계약 명시 |
| A 반환 타입 변경 | 하위 검증이 `{ message, field } \| null` 반환 | 직접 호출 단언 **수백 건** 수정 | 명시적이나 변경량이 기능 대비 과대. 단언 대량 수정은 안전망 훼손 위험(`feedback_shared_assertion_reversal_erases_sibling_net`) |
| ~~메시지→필드 대조표~~ | 메시지 문구를 키로 매핑 | 0건 | **기각** — 문구 수정 시 조용히 끊긴다(`feedback_display_string_change_needs_reverse_grep`) |

F의 충돌 규칙: 한 번의 검증에서 같은 메시지 문자열이 두 필드로 기록되면 **첫 기록**을 쓴다(자산 메시지는 「자산 N:」 접두로 대부분 유일 — Do에서 중복 실측, V-2).
직접 push·`fail()` 경로는 수집기를 쓰지 않고 **객체에 `field`를 직접** 넣는다.

### D-4. 이동 동작 — `jumpToIssue(issue)`

```
1. 대상 찾기: assetIndex 있으면 카드 안에서, 없으면 문서 전체에서 [data-field=key]
2. 접힌 섹션이면 펼친다 (D-5가 오류 카드를 펼쳐 두므로 대부분 이미 펼쳐져 있다)
3. scrollIntoView({ block: "center" })  — 입력칸 하나라 짧다. 하단 sticky 패널을 피하도록 center
4. 첫 포커스 가능 요소에 focus({ preventScroll: true })  — 날짜는 「연도」칸
5. 대상이 없거나 보이지 않으면(checkVisibility false) → 자산 카드로 후퇴 → 그것도 없으면 아무 일 없음
```
포커스되면 전역 `SelectOnFocusProvider`가 값을 전체 선택한다 — 바로 덮어쓸 수 있다(전역 규칙과 일치).

### D-5. 오류가 있는 자산 카드는 **모두** 펼친다

현재는 첫 오류 자산 1장만 펼친다(§2.2). 오류 자산 인덱스 **집합**을 넘겨 해당 카드들을 강제 펼침 + 각 카드는 **자기** 첫 오류를 배너로 표시. 섹션을 여는 명령형 코드 없이 D-4의 2번이 대부분 불필요해진다.

### D-6. ✅ Q-2(a 확정) — 버튼(「다음」·「세금 계산하기」) 실패 시 자동 이동을 어디까지

| 안 | 동작 |
|---|---|
| **a (권장)** | 첫 오류로 **스크롤 + 포커스** (필드 없으면 현행처럼 카드로) |
| b | 스크롤만, 포커스는 목록 항목을 눌렀을 때만 (모바일에서 누르자마자 키보드가 뜨는 것을 피함) |
| c | 자동 이동은 현행 유지(카드), 필드 이동은 목록 클릭 시에만 |

### D-7. 목록 항목 클릭 조건 확장

현재: `assetIndex`가 있고 0단계일 때만 버튼(`ValidationIssuePanel` `onAssetClick`). 변경: `field` **또는** `assetIndex`가 있으면 버튼 → `jumpToIssue`. 1~3단계도 포함.

### D-8. 커버리지 게이트 (정적 vitest)

`fieldError`·`field:`에 쓰인 키 집합 ⊆ UI의 `data-field`/`field=` 키 집합(인덱스 정규화). 검증에 키를 달았는데 화면에 앵커가 없으면 **조용히 카드로 후퇴**하므로, 그 어긋남을 테스트가 이름으로 출력한다. (역방향 — 앵커는 있는데 검증이 안 가리킴 — 은 정상이므로 검사하지 않는다.)
커버리지 수치(필드 부착 메시지 / 전체)는 **보고만** 한다 — 단계적 이관 중이라 게이트로 걸면 매 PR이 막힌다.

## 4. 단계 (PR 분할)

각 Phase는 독립 PR. Phase 1이 인프라, 이후는 파일 단위 이관.

```
Phase 1 — 인프라 + 폼 전역 + 자산 공통
  1. ValidationIssue.field · fieldError 수집기(D-3 F) · FieldCard field prop(D-2)
     → verify: 기존 vitest 무변경 통과(V-1) · 수집기 단위 테스트
  2. jumpToIssue(D-4) · 오류 카드 전부 펼침(D-5) · 패널 클릭 조건(D-7) · 자동 이동(Q-2 결정대로)
     → verify: E2E — 신규 spec이 현행에서 FAIL 확인 후 통과
  3. 필드 부착: validate.ts 직접 push 35곳 + validate-asset.ts(23) + UI 앵커
     → verify: 커버리지 게이트(D-8) 통과 · 대표 E2E
  4. 뮤테이션: field 제거 / data-field 제거 / 강제 펼침 1장 복귀 / focus 제거 → 각각 KILLED
Phase 2 — 취득(acquisition 87)
Phase 3 — 자산 종류별(gb 55 · redev 45 · bg 27 · commercial 23 · mixed-use 22+)
Phase 4 — 감면 fail() 89 · 비사업용토지(nbl 45) · 기타
```

## 5. 테스트

**E2E** `e2e/transfer-validation-field-jump.spec.ts` (E2E_PORT=3101, `nextjs-portal` 숨김 · hydration 대기 — 선행 PR 함정 재사용)
1. 빈 폼 「다음」 → 「양도일을 선택하세요.」 클릭 → 양도일 「연도」칸 `toBeFocused` + `toBeInViewport`
2. 「총 양도가액을 입력하세요.」 클릭 → 해당 금액칸 포커스
3. **자산 2**의 오류(자산 1도 오류 있음) 클릭 → 자산 2 카드가 펼쳐지고 그 입력칸 포커스 — D-5 검증
4. 1단계 오류(예: 세대 보유 주택 수) 클릭 → 해당 입력으로 이동 — D-7
5. **필드 미부착 오류** 클릭 → 자산 카드로 후퇴(현행과 동일) — 퇴행 0
6. (Q-2=a) 「다음」 실패 즉시 첫 오류 입력칸 포커스

**vitest**: 수집기(중복 메시지·수집기 밖 호출 무기록) · `collectStepIssues`가 field를 붙이는지 대표 케이스 · 커버리지 게이트(D-8).
**뮤테이션**: §4 Phase 1-4.

## 6. 범위 밖

- 다른 세목(주식·판정 메뉴 등) — 필드 키는 있으나 이동 UI는 이번 양도세에 한정. 공용화는 Phase 1 안착 후 판단
- 자산당 **첫 오류 1건**만 올라오는 구조(`transfer-tax-validate.ts:394`) — 자산 하나의 오류를 모두 나열하려면 하위 검증 전체를 수집형으로 바꿔야 한다. 별건
- 비차단 경고(`StepWarningBanner`)의 필드 이동

## 7. 미검증·결정 레지스터

| ID | 내용 | 상태 |
|---|---|---|
| Q-1 | 하위 검증 필드 부착 방식 | ✅ **F(수집기)** 확정 (2026-09-30 사용자) |
| Q-2 | 버튼 실패 시 자동 이동 | ✅ **a(스크롤+포커스)** 확정 |
| Q-3 | PR 분할 | ✅ **§4 4개 Phase** 확정 — 이 브랜치는 Phase 1 |
| V-1 | 이슈 객체에 `field` 추가 시 기존 vitest 무변경 통과 | ✅ `npm run test:transfer` 996파일 **기존 테스트 수정 0건**으로 통과 |
| V-2 | 한 검증 실행 내 동일 메시지 문자열 중복 여부 | ✅ Phase 1 범위는 충돌 없음 — `fieldError` 메시지 11건 전부 `${label}:`(「자산」/「자산 N」) 접두라 자산마다 유일. ⚠️ 접두 없는 메시지를 이관하는 Phase에서 재확인 |
| V-3 | 메시지 생산 지점 정확한 수(§2.1 근사 440) | 확인 필요 — Phase 계획 규모 보정 |
| V-4 | 1~3단계 입력의 접힘·렌더 조건 | ✅ **E2E 키 전수로 해소**(아래 「키 전수 E2E」) — 20키 중 19키가 「그 오류를 누르면 그 키의 입력칸에 커서 + 화면 안」 통과. `assetKind`는 화면에서 도달 불가(사유 기재) |
| V-5 | `checkVisibility()` 지원 | ✅ chromium E2E 통과. 미지원 브라우저는 `offsetParent` 대체 분기(`validation-jump.ts:isShown`) — Safari 실기 미확인 |

## 7-1. Phase 1 실측 결과 (Do)

### Do 중 바뀐 설계

- **D-4에 「접힌 섹션 펼치기」를 실제로 넣었다** — 폼 전역 입력이 **오류 없는 자산 카드**의 접힌 섹션 안에 있는 경우가 있다(단건 모드의 양도가액 = 총 양도가액, 자산 카드 ②). D-5(오류 카드 강제 펼침)로는 닿지 않는다. 후보가 `[data-asset-section]` 안에서 숨어 있으면 그 헤더 버튼(`aria-expanded="false"`)을 눌러 **사용자와 같은 경로로** 펼친 뒤 다음 틱에 이동한다.
- **같은 키가 여러 곳에 렌더된다** — `acquisitionDate`(분리 OFF/ON 분기)·수정신고 블록(2벌)·`presaleRights`(Step4 두 위치). ⇒ **보이는 첫 후보**를 고른다.
- **단건 모드 총 양도가액** — 「총 양도가액」 카드는 `splitMode !== "none"`에서만 렌더된다(`Step1.tsx:220`). 단건은 자산 카드의 양도가액 칸에 `data-field={singleMode ? "contractTotalPrice" : "actualSalePrice"}`. 단건에서는 「계약서상 양도가액」 오류(자산 2개 이상 전용)가 나지 않아 키가 겹치지 않는다.
- **800줄 분리** — 수집기 래퍼로 `transfer-tax-validate.ts`가 정확히 800줄이 돼 1단계 블록을 `transfer-tax-validate-step1.ts`로 옮겼다(감면 단계 분리와 같은 방식, push 순서 불변). 800 → 517 + 약 300.
- **D-7** 패널 API `onAssetClick` → `onIssueClick(issue)`. 항목은 `field` 또는 `assetIndex`가 있으면 버튼.

### Phase 1에서 field를 단 키 (20개)

| 구분 | 키 |
|---|---|
| 0단계 폼 전역 | `transferDate` · `filingDate` · `contractTotalPrice`(2곳) |
| 0단계 자산 | `assetKind` · `addressJibun`(소재지·동호) · `acquisitionDate` · `landAcquisitionDate` · `landNature` · `ownershipNumerator` · `actualSalePrice` · `standardPriceAtTransfer` |
| 1단계 | `householdHousingCount` · `presaleRights.*.acquisitionDate` · `gracePeriod.contractDate` · `gracePeriod.permitApplicationDate` |
| 3단계 | `originalDeterminedTax` · `posteriorEventDate` · `statutoryFilingDeadline` · `amendedFilingDate` · `amendedPaymentDate` |

**의도적으로 남긴 것(카드 후퇴)** — 0단계: 함께양도 불가 조합·부담부증여 평가 모드·매매사례가액 2번째 자산·지분 합계 100%(특정 칸이 아니라 조합 오류) · 일반건물 미등기 안내 · 지분 단독 불가 · 가업상속공제 4건 · 하위 검증(취득·특수자산 등 — Phase 2~4). 1단계: 보유 감면주택 행·보유 주택 목록 첫 오류·양도주택 특례 기간·지정 전 계약·단서·최종 1주택·거주기간·상속 일반주택 입주권(Phase 4).

### 키 전수 E2E (사용자 요청 「e2e 확인해」, 2026-09-30)

처음 E2E는 20키 중 **4키**(양도일·총 양도가액·소재지·주택 수)만 실제 이동을 봤고, 나머지 16키는 정적 게이트(「앵커가 소스에 있다」)뿐이었다 — 「그 오류가 날 때 그 칸이 렌더되고 보이는가」는 미확인이었다.

- 케이스 정의 `e2e/_helpers/validation-field-jump-cases.ts` — 키마다 「검증이 그 오류를 내고 화면이 그 칸을 렌더하는」 입력. 중과 한시 유예는 1세대·2채·보유 주택 1행·**보유 2년 미만**(한시배제 창 밖)이어야 열린다.
- vitest `transfer-validation-field-jump-cases.test.ts` 17건 — 각 입력이 **그 메시지·그 field·그 assetIndex**를 내는지, 3단계 케이스는 **0~2단계 무오류**(「세금 계산하기」가 앞 단계를 먼저 재검증)까지 고정. E2E가 엉뚱한 줄에서 30초로 터지기 전에 여기서 이름으로 실패한다.
- E2E 판정: `document.activeElement.closest("[data-field]")` = 그 키, 자산 수준이면 `closest("[data-asset-card-index]")` = 그 카드, 그리고 `:focus`가 화면 안.
- 결과: **15/15 통과 + `assetKind` 건너뜀**. `assetKind` 오류는 세션 복원이 빈 종류를 `"building"`으로 채우고(`calc-wizard-asset-migrate.ts:290`) 화면이 항상 한 종류를 선택해 두므로 **사용자가 낼 수 없다**(E2E 실측: 오류 항목 자체가 안 뜸) — 케이스에 `unreachableInUi` 사유를 적고 vitest만 유지.
- 첫 실행 실패 9건 중 8건은 **테스트 버그**였다(`expect.anything()`은 `null`과 불일치 — 폼 전역 키의 카드 인덱스). field는 전부 일치했다.
- 뮤테이션: M8 앵커 1개 제거(`posteriorEventDate`) → 그 케이스만 FAIL · M9 검증 키 오기(수정신고일 → 법정신고기한) → 그 케이스만 FAIL.

### 검증

| 항목 | 결과 |
|---|---|
| 신규 E2E `transfer-validation-field-jump.spec.ts` | 6/6 통과. Pre-Do: 첫 5건을 현행 코드로 돌려 **4건 FAIL · 후퇴 1건 PASS**(현행 동작이 곧 기대값) 확인. 이후 「총 양도가액」을 단건·다건 2건으로 나눴다 — **나눈 뒤 현행 코드 대조는 하지 않았다**(구별력은 M2·M5 뮤테이션으로 확인) |
| 선행 E2E(`transfer-validation-issue-panel` 6 · `input-error-prevention` 3 · `burdened-gift-fractional` 3) | 통과 |
| vitest: 수집기·부착 6 · 패널 RTL 7 · 정적 게이트 2 · `test:transfer` 996파일 | 통과 |
| **E2E 전체**(공용 `FieldCard`·`CurrencyInput`·`DateInput`을 건드렸으므로) | **1428 passed · 0 failed** · flaky 2(종부세 PT-1·REGR-1 — 재시도 없이 `--repeat-each=5` 45/45 통과, 전건 동시 부하 기인으로 판단) |

**뮤테이션** — 전부 KILLED:

| # | 뮤테이션 | 잡은 테스트 |
|---|---|---|
| M1 | 수집기 부착 제거 | D-5(소재지는 `fieldError` 경유) · 단위 |
| M2 | `FieldCard` `data-field` 제거 | 양도일 자동 이동 · 다건 총 양도가액 |
| M3 | D-5를 첫 카드만으로 | D-5 (자산 2 자기 배너) |
| M4 | 포커스 제거 | 5건 |
| M5 | 섹션 펼치기 제거 | 단건 총 양도가액(접힌 ②) |
| M6 | 자동 이동을 카드로(Q-2 되돌림) | 3건 |
| M7 | 앵커 1개 제거(`posteriorEventDate`) | 정적 게이트 — 누락 키 이름 출력 |

⚠️ **구별력 보강 2건** — ① D-5 테스트는 처음엔 「자산 2 입력칸 포커스」만 봤는데, D-4 섹션 펼치기가 같은 결과를 내서 D-5를 되돌려도 통과했을 것이다 → 「자산 2 카드에 자기 배너」 단언 추가. ② 단건 총 양도가액 테스트는 처음 입력에서 소재지 오류가 카드를 강제로 펼쳐 **펼치기 경로를 안 탔다** → 오류가 총 양도가액 1건뿐인 입력(probe 실측)으로 바꾸고 「누르기 전 칸이 숨겨져 있다」 전제를 단언.

📌 **Phase 2 인계** — 후퇴 E2E의 대조군 메시지 「자산: 취득일을 입력하세요.」는 취득 검증(Phase 2 대상)이다. Phase 2가 이 메시지에 field를 달면 **후퇴 테스트를 다른 미연결 메시지로 옮길 것**(안 그러면 후퇴 경로 안전망이 사라진다).

## 8. 실행 함정 (선행 PR에서 밟은 것 — 반복 금지)

- 워크트리는 husky가 조용히 안 돈다 → 푸시 전 `bash .husky/pre-push` 수동
- E2E는 `E2E_PORT=3101` · 여러 spec은 `xargs`로(zsh 단어 분리 없음)
- 가림·위치 단언은 `click({ trial: true })` 금지 → `elementFromPoint` · dev 표시기 `nextjs-portal` 숨김
- 머지는 `--auto` 금지 — 롤업 전건 SUCCESS + `headRefOid` 일치 확인 후
