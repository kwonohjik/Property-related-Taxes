# 양도일·신고일을 자산 ① 기본정보로 이동 — 작업 계획서

- **브랜치**: `feat/transfer-date-basic` (워크트리 `.claude/worktrees/transfer-date-basic`, slot 1 / dev 3001 / e2e 3101)
- **분기 기준**: `origin/master` @ 32ca8526
- **작성일**: 2026-06-30
- **성격**: 양도세 마법사 Step 1 UI 재배치 (입력 위젯 위치 이동 + 부수 정합). **엔진·API·데이터 모델 무변경.**

---

## 1. 목표

상단에 별도로 떨어져 있는 폼-전역 **양도일·신고일** 입력을, 각 자산 카드의 **① 기본정보** 섹션 안으로 이동해 "기본정보"라는 같은 분류를 시각적으로 한 묶음으로 만든다.

**성공 기준 (검증 가능)**:
1. 단일 자산 모드: 자산 카드 ① 기본정보 최상단에 양도일·신고일이 보이고(진입 시 자동 펼침), 상단 별도 "기본정보" 섹션은 사라진다.
2. 입력 → `form.transferDate`/`filingDate`(폼-전역) 갱신 + 가산세 파생(`derivePenaltyFields`) 정상 작동.
3. 양도일 미입력·신고일<양도일 검증 시 주 자산 카드로 스크롤 + 인라인 에러.
4. 양도세 E2E **17개** 영향 스펙이 새 위치에서 통과 (회귀 0).
5. `npx tsc --noEmit` 0건 · 양도세 vitest 통과.

---

## 2. 현재 구조 (실측)

```
Step1.tsx
├─ <section> "기본정보 / 계약·신고 정보를 입력하세요"   ← 이동 대상 (L67-104)
│    ├─ 양도일  FieldCard + DateInput  (form.transferDate, L83-86)
│    │    └─ warning: 신고기한 초과 경고 (filingOverdue, L77-81)
│    └─ 신고일  FieldCard + DateInput  (form.filingDate,  L98-101)
└─ <section> "양도자산 구성"
     ├─ 일괄양도 토글
     ├─ [일괄 ON] 총 양도가액·총 양도비·안분방식
     └─ CompanionAssetsSection (assets[])
          └─ CompanionAssetCard (자산별)
               ├─ 칩바: 1 기본 / 2 양도 / 3 취득 / 4 경비 / 5 특례
               ├─ ① 기본정보 (AssetSectionBasic)  ← 목적지 (자산종류·소재지·면적·지분)
               ├─ ② 양도정보  ③ 취득정보  ④ 필요경비  ⑤ 기타특례
               └─ 진입 시 ①~⑤ 전부 접힘 (open 초기 {}, CompanionAssetCard.tsx:104)
```

---

## 3. 핵심 제약 — 양도일·신고일은 **폼-전역값**

`form.transferDate`·`form.filingDate`는 모든 자산이 공유하는 폼-전역 필드다 (일괄양도여도 양도일은 같은 날). 자산 카드 ① 기본정보는 **자산별**(`AssetForm`)이다.

| 모드 | 처리 |
|---|---|
| **단일 자산** (절대다수) | 전역=자산이라 ① 안에 그대로 넣으면 됨 |
| **일괄양도** (자산 ≥2) | 양도일은 공통값 → **주 자산(`assets[0]`) ①에만** 표시. 나머지 카드엔 "주 자산과 공통" 안내 |

> 주 자산 = `assets[0]` 확정: `calc-wizard-asset-factory.ts:50` (`isPrimaryForHouseholdFlags: index === 1`, 1-based).

**데이터 모델은 변경하지 않는다.** `transferDate`/`filingDate`는 폼-전역 그대로. **입력 위젯 위치만** 이동한다. → 14/8 동기화 지점·엔진·API·sessionStorage 마이그레이션 **전부 무관**.

---

## 4. 설계 결정 — 1-A 채택 (자동 펼침 필수 포함)

| 안 | 배치 | 비고 |
|---|---|---|
| **1-A (채택)** | ① 기본정보 섹션 **안** 최상단 + 단일 모드 ① 자동 펼침 | 사용자 선택. 자산종류·소재지·면적과 완전한 한 묶음 |
| 1-B (대안) | 칩바 아래 ① 섹션 **직전**(접이식 밖) 상시 노출 | 양도일이 늘 보이나 "① 안"은 아님 |

**왜 자동 펼침이 선택이 아니라 필수인가**: `AssetSection`은 접힘 시 본문을 `hidden`(display:none)으로 둔다 (`AssetSection.tsx:125` `expanded ? "" : "hidden print:block"`). 양도일은 *필수·최우선* 입력값인데, 접힌 ① 안에 두면 (a) 사용자가 못 보고, (b) Playwright `.fill()`이 hidden 요소에 불가능해 E2E가 깨진다. 따라서 1-A는 **단일 자산 모드에서 ①을 자동 펼침**으로 연다.

---

## 5. 변경 명세

### 5-1. UI 위젯 이동 — 핵심

| 파일 | 변경 |
|---|---|
| `app/calc/transfer-tax/steps/Step1.tsx` | 상단 `<section>"기본정보"`(L67-104) **삭제**. `filingOverdue`/`burdenedGiftDeadline`(L61-62) 계산은 **Step1에 유지**하고 결과값을 자산 카드로 prop 전달 (leaf 재계산 금지 — `isAllBurdenedGift`는 `form.assets` 전체 배열 필요, leaf엔 없음) |
| `components/calc/transfer/asset-sections/AssetSectionBasic.tsx` | 섹션 최상단에 양도일·신고일 FieldCard+DateInput 추가. write·read prop 수신(5-2). **게이트는 `index === 0`(첫 자산)** — `AssetSectionBasic`에 신규 boolean prop(예: `showFormDates`) 전달. 비-게이트 카드는 "양도일·신고일은 주 자산과 공통" 안내 |

> **게이트 결정 — `isPrimaryForHouseholdFlags` 재활용 금지**: 이 플래그는 1세대1주택 판정용(`calc-wizard-asset.ts:66`)이라 위젯 표시 위치로 전용하면 의미 결합 + 마이그레이션 경로에서 `assets[0]`이 false면 양도일 입력란이 사라질 위험. `index === 0`(`CompanionAssetCard`의 `index` prop)으로 게이트해 `showFormDates`를 계산·전달한다. `AssetSectionBasic`은 현재 `isPrimary`/`index`를 받지 않으므로(props: asset/onChange/isMultiBundled/onAddAsset, `AssetSectionBasic.tsx:34-43`) 신규 prop 명시 필요.

### 5-2. 배선 — write + read 양방향 (4-레벨 스레딩)

현재 `transferDate`는 자산 카드로 **읽기 전용**만 흐른다 (`CompanionAssetsSection.tsx:73` — 공시연도·날짜경고용). `filingDate`는 카드에 **아예 전달 안 됨**(`CompanionAssetCard.tsx:80`은 `transferDate`만 수신). ① 안에서 입력·경고·hint를 렌더하려면 **write 콜백 + read 값**을 함께 4단계로 내려보낸다:

```
Step1  →  CompanionAssetsSection  →  CompanionAssetCard  →  AssetSectionBasic
```

**write** (양도일·신고일 입력):
- **별도 prop `onFormChange`로 추가** — Step1이 `CompanionAssetsSection`에 이미 넘기는 `onChange={updateAssets}`(`assets[]` 시그니처, `Step1.tsx:178`)와 **혼용 불가**. 폼-전역 패치(`Partial<TransferFormData>`)는 자산 patch(`AssetForm`)와 시그니처가 다르다.
- `onFormChange`는 **반드시 `TransferTaxCalculator.handleFormChange`로 연결** — `transferDate`/`filingDate`/`assets` 패치 시 `derivePenaltyFields` 자동 호출(`TransferTaxCalculator.tsx:144-154`)이 가산세 파생을 유지한다. 자산별 `updateAsset`로 양도일을 쓰면 이 파생이 누락된다.

**read** (경고·hint 렌더용 — Step1에서 계산해 prop 전달, leaf 재계산 금지):
- `filingDate` (신규 스레딩)
- `filingOverdue` (boolean) · `filingDeadline`(문자열) · `burdenedGiftDeadline`(boolean) — `isAllBurdenedGift(form.assets)`가 전체 배열 필요(`filing-deadline.ts:18-22`)하므로 Step1에서 산출.

> 신규 prop은 명시 매핑 — spread로 누락 방지 후 grep 점검 (memory `feedback_explicit_prop_mapping_strip`).

### 5-3. 진입 시 ① 자동 펼침

`CompanionAssetCard.tsx:104` `open` 초기값을 단일 자산(주 자산)일 때 `{1: true}`로. 검증 강제 펼침(`forceOpenAll`, L105)과 독립. useEffect 미러링 금지 — 초기 state로만 (memory `feedback_useeffect_store_mirror_forbidden`).

> **E2E 타이밍 제약**: `transfer-nbl-academy-land.spec.ts`는 양도일 fill(`.first()`)을 `expandAssetSection`보다 **먼저** 실행한다. 자동 펼침이 **진입 즉시(첫 fill 이전)** 활성이어야 통과 — 초기 state로 여는 본 방식이 이 요건을 충족한다(클릭·useEffect 지연 없음).

### 5-4. 검증 에러 → 자산 카드 유도 (+ 기존 테스트 갱신)

`lib/calc/transfer-tax-validate.ts` — 기존 `step`(=0)은 **유지**하고 `assetIndex: 0`만 추가:
- **L52** `issues.push({ step, message: "양도일을 선택하세요." })` → `{ step, assetIndex: 0, message }`
- **L56** 신고일<양도일 push (조건은 L55) → `{ step, assetIndex: 0, message }`

> **스크롤 게이트 — `step` 동반 필수**: `failWithIssues`(`TransferTaxCalculator.tsx:163-170`)의 스크롤은 `assetIndex != null` **AND `firstAsset.step === 0`** 동시 충족 시에만 발동(L167). 양도일/신고일 push는 step 0이므로 기존 `step`을 그대로 두면 충족 — `assetIndex`만 추가한다(`step` 누락 시 스크롤 불발).

⚠️ **기존 테스트가 정반대를 단언 — 갱신 대상**: `__tests__/calc/transfer-validate-detailed.test.ts:27-35` "폼-전역 오류(양도일 누락)는 assetIndex 없이 반환"이 `expect(issue?.assetIndex).toBeUndefined()`(L33)를 단언한다. `assetIndex:0` 부여 시 이 테스트가 **즉시 깨진다**. 따라서 본 작업은:
- L33 `toBeUndefined()` → `toBe(0)` 변경
- 테스트 설명문("폼-전역 오류는 assetIndex 없이" → "양도일 오류는 주 자산 카드(index 0)로 유도")
- 이 갱신을 **Phase 5에 명시**.

> `transfer-validate-collect.test.ts` T-01(`issues[0].message`만 검사)은 영향 없음. 깨지는 건 detailed.test.ts:33 한 곳.

### 5-5. 신고기한 초과 경고 이동

`Step1.tsx:77-81`의 `filingOverdue` warning을 **① 안 양도일 옆으로 확정 이동**(FieldCard `warning` 슬롯). 카드 상단 배너(`CompanionAssetCard.tsx:163-167`, basic 밖)는 read prop을 card 레벨까지 추가 스레딩해야 하므로 **채택 안 함**. 계산값은 5-2 read prop(`filingOverdue`·`filingDeadline`)으로 받고, 산출 함수 `isFilingOverdue`/`getFilingDeadline`/`isAllBurdenedGift`(`lib/calc/filing-deadline`)는 Step1에서 그대로 재사용.

### 5-6. E2E 안정화 — **영향 17개 스펙** (필수 선행, 최대 리스크)

양도일을 **페이지-전역 DateInput**으로 입력하는 양도세 스펙은 셀렉터 문법 3종에 흩어져 있다. `getByLabel("연도").first()` 단일 패턴만 보면 6개를 놓친다(grep 리터럴 함정). 전수 union = **19개**, 그중 `multi-house-marriage`·`-rights` 2개는 혼인블록 스코프(`marriageBlock.getByLabel`)·양도일 미입력(스텝퍼 점프)이라 제외 → **실제 영향 17개**.

| 셀렉터 | 스펙 |
|---|---|
| `getByLabel("연도").first()` (11) | `transfer-98-8` · `-98-9` · `-99-4` · `-housing-reduction-asset-kind-gate` · `-input-error-prevention` · `-p2-hybrid` · `-p3-hybrid` · `-p4` · `-p5` · `-rental-97-3` · `-rental-97-4` |
| `getByLabel("연도",{exact:true})` (4) | `transfer-nbl-academy-land` · `-nbl-revenue-autofetch` · `-nbl-revenue-deemed-common` · `-pre1990-land-transfer-stdprice` |
| `getByRole("textbox",{name:"연도"})` (2) | `transfer-date-input-validation` · `-result-no-detail-summary-table` |

**위젯 이동 시 깨지는 메커니즘**: DOM 순서 변경 + 접힘 `hidden`(`AssetSection.tsx:125` `expanded ? "" : "hidden print:block"`)으로 `.fill()` 불가. `e2e/CLAUDE.md` §1이 명시 경고 — "`.nth(0)`/`.nth(1)`(페이지 상단 양도일·신고일)도 인덱스 시프트 위험 잠재". 이 리팩터가 정확히 그 위험을 촉발한다.

**testid 전환 1순위 (nth 강결합)**:
- `transfer-date-input-validation` — **양도일<취득일 차단의 정본**. `year(p,0)`=양도일·`year(p,2)`=취득일 page-global nth 의존(`:22,33,42`). nth 시프트에 가장 취약.
- `transfer-nbl-academy-land` — `.first()`=양도일·`.nth(1)`=신고일·`.nth(2)`=취득일. 양도일 fill이 `expandAssetSection`보다 먼저(5-3 타이밍 참조).
- `transfer-pre1990-land-transfer-stdprice`·`-nbl-revenue-deemed-common` — `.nth(2)`=취득일 의존.

**완화책**:
1. 양도일·신고일 DateInput(FieldCard 래퍼)에 안정적 식별자 — `data-testid="transfer-date"` / `"filing-date"`. 순서 의존 제거.
2. 17개 스펙의 양도일·신고일 입력을 testid 스코프 기반으로 교체. (양도세 스펙은 `fillDateAndVerify` helper **미사용** — grep 0건, 직접 `page.getByLabel/getByRole`. helper 재사용보다 testid 직접 교체가 현실적. 신규 양도일 helper 추가 가능.)
3. 자동 펼침(5-3)으로 양도일 input이 진입 즉시 visible 보장 → `.fill()` 가능.

> 정책: memory `feedback_blocking_validation_full_e2e_regression`(baseline 대조), `feedback_browser_verify_with_playwright`(수동안내 금지), `feedback_e2e_worktree_port_isolation`(`E2E_PORT=3101`).

---

## 6. 비변경 확인 (명시)

- **데이터 모델**: `transferDate`/`filingDate` 폼-전역 유지 → 14/8 동기화 지점 무관.
- **엔진·API·Route·Zod**: 입력 키 불변 → 무변경.
- **sessionStorage 마이그레이션**: 필드 신설/폐지 없음 → `calc-wizard-migration.ts` 무관.
- **사이드바 합계**: 양도일은 합계 항목 아님 → `computeTransferSummary` 무관.

---

## 7. 작업 순서 (Phase + verify)

1. **E2E baseline 확보** → verify: **17개** 영향 스펙 현재 통과 기록 (`E2E_PORT=3101 npx playwright test <17 specs>`).
2. **testid 부여(5-6①) + 17스펙 교체(5-6②)** → verify: **위치 이동 전** testid로 17스펙 통과(이동 전 안정화 — 회귀 격리).
3. **배선(5-2 write+read) + AssetSectionBasic 위젯 추가(5-1) + 자동펼침(5-3)** → verify: 단일 모드 ① 펼침·입력→`form.transferDate` 갱신 + `derivePenaltyFields` 호출 anchor.
4. **상단 섹션 제거(5-1) + 신고기한 경고 이동(5-5)** → verify: tsc 0 · 화면 중복 없음.
5. **검증 `assetIndex:0`(5-4, `step` 유지) + `transfer-validate-detailed.test.ts:33` 갱신(`toBe(0)`+설명문)** → verify: 양도일 비우고 "다음" → 주 자산 카드 스크롤 + 인라인 에러. `npx vitest run __tests__/calc/transfer-validate-detailed.test.ts` 통과.
6. **`index===0` 게이트 + 일괄양도 비대칭(5-1)** → verify: 자산 2건 시 첫 자산만 양도일, 2번째 안내 문구.
7. **E2E 17스펙 새 위치 통과 + 양도세 vitest 전체** → verify: 회귀 0.
8. **수동 확인** → verify: 폼→계산→결과, Network 탭 request body의 `transferDate`/`filingDate` 정상 도달.

---

## 8. 리스크·롤백

| 리스크 | 대응 |
|---|---|
| E2E **17스펙** 회귀 (최대 리스크) | Phase 1·2에서 testid 선행 안정화 후 이동. baseline 대조. 셀렉터 3종 전수(union) 확정 |
| 양도일 hidden으로 `.fill()` 실패 | 자동 펼침(5-3, 진입 즉시) + testid visible 보장 |
| 가산세 파생 누락 (양도일을 자산 patch로 잘못 배선) | 반드시 `onFormChange`→`handleFormChange` 경유(자산 `updateAsset` 아님). anchor로 `derivePenaltyFields` 호출 확인 |
| **`assetIndex` 의미 변경** (폼-전역 양도일 오류 → 자산 0번 인라인) | `transfer-validate-detailed.test.ts:33` 갱신 명시(Phase 5). `step` 동반 유지로 스크롤 게이트 충족 |
| `index===0` 게이트 누락 시 양도일 입력란 소실 | `isPrimaryForHouseholdFlags` 재활용 금지, `index` 기준 게이트 |
| 일괄양도에서 양도일 입력란 사라짐 혼란 | 2번째+ 카드 안내 문구 |

**롤백**: 단일 브랜치·격리 워크트리. 미머지 상태 폐기는 `scripts/wt-rm.sh transfer-date-basic`.

---

## 9. 설계 확정 + 자가 검토 반영 이력

**확정**: **1-A(① 기본정보 안 + 진입 즉시 자동 펼침)**. E2E 분석상 자동 펼침이 필수라 1-A가 자연스럽다.

**v2 자가 검토 반영** (독립 검토자 2명 × 실코드 대조, 전부 실증):

| 등급 | 발견 | 반영 |
|---|---|---|
| High | E2E 영향 스펙 11 → **17개** (셀렉터 3종 union, multi 2개 제외) | 5-6·7·성공기준#4 |
| High | 5-4가 `transfer-validate-detailed.test.ts:33`을 정반대 인용 — 실제는 `toBeUndefined` 단언 → **갱신 대상** | 5-4·Phase 5·리스크 |
| Med | 5-2가 read-side(`filingDate`·경고·기한) 스레딩 누락 | 5-2 write+read 분리 |
| Med | `isPrimary` 미전달 + `isPrimaryForHouseholdFlags` 의미 결합 | 5-1 `index===0` 게이트 |
| Low | `onFormChange`가 기존 `onChange=updateAssets`와 혼용 위험 | 5-2 별도 prop 명시 |
| Low | 신고기한 경고 위치 모호 | 5-5 ① 안 확정 |
| 정정 | 신고일 push = L**56**(L55 조건) · hidden 동작 = `AssetSection.tsx:**125**`(L9는 주석) · 스크롤 `step===0` 게이트 동반 | 5-4·5-6 |

**검증 안 됨(확인 필요)**: 없음 — 본 계획의 모든 file:line·동작 주장은 워크트리 코드로 실측 완료.
