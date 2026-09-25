# 검증 경고(`severity: "warning"`) 표시 경로 신설

> 발단: `one-house-judgment-step-reorder.plan.md` §12 **F-1**.
> 그 기록은 「판정 마법사의 경고 3건이 안 보인다」였다. 착수 전 실측하니 **모집단이 13건**이고
> 마법사가 **둘**이었다 — 기록을 정정하고 범위를 넓혔다(사용자 승인 2026-09-25).

---

## 1. 결함

`severity: "warning"`을 **만드는 곳은 13곳, 표시하는 곳은 0곳**이다.

### 1.1 생산 지점 전수 (grep 실측)

| 파일 | 건수 | 줄 |
|---|---|---|
| `lib/calc/one-house-exemption-validate.ts` | **3** | `:62` `:68` `:157` (`warn()` 헬퍼) |
| `lib/calc/stock-transfer-tax-validate.ts` | 4 | `:259` `:325` `:487` `:618` |
| `lib/calc/stock-transfer-tax-validate-step2.ts` | 3 | `:136` `:533` `:600` |
| `lib/calc/stock-transfer-tax-validate-exit.ts` | 2 | `:74` `:94` |
| `lib/calc/stock-transfer-tax-validate-foreign.ts` | 1 | `:69` |

### 1.2 소비 지점 — 0건

두 오케스트레이터가 **`error`만** 통과시킨다:

- `app/calc/one-house-exemption/OneHouseJudgmentCalculator.tsx:76`
  `return errors.find((e) => e.severity === "error") ?? null;`
- `app/calc/stock-transfer-tax/StockTransferTaxCalculator.tsx:148,150,357`
- 사이드바 배지도 마찬가지 — `one-house-exemption-validate.ts:340` ·
  `stock-transfer-tax-validate.ts:794`가 `filter(e => e.severity === "error").length`

⇒ 13건 전부 **계산되지만 화면에 도달하지 않는다**.

### 1.3 모집단 경계 — 다른 6개 세목은 무관

`grep -rn 'severity' lib/calc app components`가 `one-house-*` · `stock-transfer-*`만
반환한다. 양도·취득·재산·종부·상속·증여 validate에는 **`severity` 개념 자체가 없다**(전건
차단형). ⇒ 이 결함은 정확히 **이 두 마법사에만** 있다. 나중에 「전 세목에 있다」로 번지지 않게
여기 적어 둔다.

---

## 2. 🔑 설계를 가르는 사실 — 경고는 `error` store 필드를 태우면 안 된다

두 오케스트레이터의 `error`는 **「다음」을 눌렀을 때 세팅되는 명령형 문자열**이다
(`OneHouseJudgmentCalculator.tsx:82-89`). 경고는 **진행을 막지 않으므로**, 같은 경로에 태우면
`setError(경고)` → 곧바로 `setStep(+1)` → 다음 화면에서 `setError(null)` 순으로
**띄우자마자 사라진다**.

⇒ 경고는 `formData`에서 **파생(`useMemo`)** 해 조건이 성립하는 동안 상시 렌더한다.
   store에 넣지 않는다(`feedback_useeffect_store_mirror_forbidden`와 같은 층위 — 파생값을
   상태로 복제하지 않는다).

---

## 3. 설계 결정

### D-0. 🔴 Do 중 뒤집힌 것 — 두 마법사가 **한 가지에서 갈린다**

계획 초안은 「단계 배너 + 결과 화면 종합」을 **양쪽에** 적용하는 것이었다. 주식은 뺐다.

**근거(실측)**: 다종목 모드에서 `commitCurrentItem`이 확정 직후 `formData`를
`carryFilingFields(...)`로 **비운다**(`calc-wizard-stock-store.ts:200-207`). 결과 화면에서
`formData` 파생 경고를 「계산 시 전제된 주의사항」이라 띄우면 **계산에 들어간 종목이 아니라
빈 편집기**를 설명하게 된다. 판정 마법사는 다종목 개념이 없어 이 문제가 없다.

⇒ **판정 = 입력 단계 + 결과 종합 · 주식 = 입력 단계만.**

### D-1. 공용 컴포넌트 1개 — 두 마법사가 공유한다 ✅

두 오류 타입이 **글자 그대로 같은 모양**이다:

```ts
// one-house-exemption-validate.ts:32-36   ·   stock-transfer-tax-validate.ts:43-47
{ field: string; message: string; severity: "error" | "warning" }
```

⇒ `components/calc/shared/ValidationWarnings.tsx` 하나가 둘을 받는다. 구조적 타이핑이라
import 방향 의존이 생기지 않는다(공용 컴포넌트가 세목 validate를 import하지 않는다).

### D-2. 톤·형태는 **같은 마법사의 확립된 패턴**을 따른다 ✅

`OneHouseJudgmentResultView.tsx:225-249`가 이미 `<ToneCard tone="amber">` + `<ul>`로
「불성립 사유」를 렌더한다. 경고도 같은 모양으로 간다 — `amber` = 「취득/주의」
(`tones.ts:17` 문서화된 2축 의미).

- 인라인 톤 하드코딩 금지 ⇒ `<ToneCard>` 사용 (`components/calc/CLAUDE.md`)
- 🔴 **`ToneCard`는 `data-testid`를 전달하지 않는다** — props에 `...rest` spread가 없다
  (`ToneCard.tsx:20-41` 실측). ⇒ testid는 **바깥 `<div>`** 에 건다
  (`feedback_shared_card_testid_not_forwarded`).
- 폰트는 `text-sm` (온-스케일 정본 — `check-font-sizes.sh`는 `text-[Npx]`만 막는다)

### D-3. 마운트 지점은 **오케스트레이터 1곳** ✅

각 단계 컴포넌트나 결과뷰에 심지 않는다. 오케스트레이터가 이미 `formData`·`currentStep`을
둘 다 아는 유일한 지점이고, 거기 한 곳이면 **입력 단계 배너**와 **결과 화면 종합**이 같은
컴포넌트 하나로 처리된다.

| 단계 | 소스 | 제목 |
|---|---|---|
| 입력 단계 (0·1·2) | 그 단계의 validate | 「확인이 필요합니다」 |
| 결과 단계 (3) | `validateAllSteps` | 「판정 시 전제된 주의사항」 / 「계산 시 전제된 주의사항」 |

**결과 화면에도 띄우는 이유**: 사이드바로 단계를 건너뛰면 그 단계의 경고를 한 번도 못 본다
(F-2 우회 경로). 결과 화면 종합이 「최소 한 번은 본다」를 보장한다.

> ⚠️ **이것은 F-2를 고치지 않는다.** F-2는 「앞 단계의 **오류**를 우회해 진행할 수 있다」는
> 게이트 결함이다. 여기서 `validateAllSteps`에 소비처가 생기지만 그것은 **경고 표시용**이고
> 차단은 여전히 없다. F-2는 열린 채로 둔다(`feedback_closure_claim_scoped_to_verified_subset`).

### D-4. 단계 디스패치 — 판정은 모듈로, **주식은 오케스트레이터 로컬로** ⚠️ 부분 수정

경고 배너에는 「현재 단계의 전체 errors 배열」이 필요하다. 지금 그 디스패치가 이미 **2벌**이다:

| 위치 | 형태 |
|---|---|
| `OneHouseJudgmentCalculator.tsx:74-79` | 삼항 3단 (idx → validateStepN) |
| `one-house-exemption-validate.ts:331-339` | 삼항 4단 (`getStepErrorCount` 내부) |
| 〃 (주식) `StockTransferTaxCalculator.tsx:141-147` · `stock-transfer-tax-validate.ts:791-797` | 삼항 / `switch` |

여기 **3벌째를 더하지 않는다.** `validateStepByIndex(form, step)`를 validate 모듈에 노출하고
기존 둘이 그것을 쓰게 한다.

> 이것은 「안 깨진 것의 리팩터」가 아니다 — 내 변경이 **요구하는** 함수이고, 대안은 드리프트
> 위험이 있는 3번째 사본이다(Surgical Changes: 내 변경이 만든 필요만 처리).
> 🔑 판정 쪽은 **함수명 ≠ 화면 번호**다(idx 1 → `validateStep3`). 그 매핑이 이제 한 곳에만 산다.

🔴 **주식은 모듈로 올리지 못했다 — 800줄 상한.** `stock-transfer-tax-validate.ts`가 **798줄**이라
`validateStepByIndex`를 더하자 **809줄**이 되어 PostToolUse 훅이 분리를 요구했다(실측). 그 분리는
F-1과 무관한 큰 수술이므로, **줄을 늘리지 않는 쪽**을 택했다 — 오케스트레이터 안에서
`currentStepErrors` useMemo 하나를 `handleNext`와 경고 배너가 **함께** 쓴다.
사본 수는 종전과 같은 **2벌**(validate의 `getStepErrorCount` switch + 오케스트레이터)이고,
세 벌째는 생기지 않았다. ⇒ 상한도 정책도 지켜지고 드리프트도 늘지 않는다.

🔑 그 useMemo는 종전 삼항을 **명시적 switch로 바꿨다**. 종전 삼항은 인덱스 3에서
`validateStep3`으로 흘러내렸는데, 그것이 무해했던 것은 `validateStep3`이 경고를 **0건**
만들기 때문일 뿐이었다(실측 — foreign·exit 변형 포함). 우연에 기대지 않도록 `default: []`로
못 박았다.

### D-5. 사이드바는 건드리지 않는다 ✅ (이번 범위 밖)

`WizardSidebar`의 `status: "attention"`이 **이미 amber `!`** 다(`WizardSidebar.tsx:44-52`) —
그런데 그것은 **오류** 표식이다. 경고 표식을 더하면 같은 색이 두 의미를 갖는다. 게다가 status
union은 **6개 마법사 공용**이라 영향권이 넓다. ⇒ 별건(§7 F-5).

---

## 4. 변경 지점

### A. 신규 — `components/calc/shared/ValidationWarnings.tsx`

```tsx
{ items: {field,message,severity}[], title, testId }
  → severity==="warning" 필터 → 0건이면 null
  → <div data-testid><ToneCard tone="amber" title><ul>…</ul></ToneCard></div>
```

### B. `lib/calc/one-house-exemption-validate.ts`

- `validateStepByIndex(form, step)` 신설 (idx 매핑 정본)
- `getStepErrorCount`가 그것을 쓰도록 축약
- `:141-146` 주석 갱신 — 「지금 이 경고는 화면에 뜨지 않는다」가 **거짓이 된다**
  (`feedback_display_string_change_needs_reverse_grep` — 주석도 역방향 점검 대상)

### C. `app/calc/one-house-exemption/OneHouseJudgmentCalculator.tsx`

- `warnings` useMemo + `<ValidationWarnings>` 렌더 (오류 배너 **아래**)
- `validateCurrent`가 `validateStepByIndex`를 쓰도록 축약

### D. `lib/calc/stock-transfer-tax-validate.ts` — B와 같은 형태

### E. `app/calc/stock-transfer-tax/StockTransferTaxCalculator.tsx` — C와 같은 형태

---

## 5. Pre-Do anchor (착수 **전** 작성·통과해야 함)

> 정책 `feedback_pre_anchor_verification` — 진단이 맞다는 것을 **현행 코드에서** 먼저 고정한다.

| # | 단언 (현행에서 통과) |
|---|---|
| **AW-1** | 판정 ① — 합가일 2개 입력 상태로 렌더 → 경고 문구가 **DOM에 없다** |
| **AW-2** | 판정 ③ — §155⑳ 이중입력 상태로 렌더 → 경고 문구가 **DOM에 없다** |
| **AW-3** | 🔑 **긍정 짝** — 같은 폼으로 `validateStep1`/`validateStep2`를 부르면 그 경고가 **배열에는 있다** (`feedback_negative_anchor_needs_positive_twin`) ⇒ AW-1·2의 부재는 **표시 갭**이지 검증 갭이 아니다 |
| **AW-4** | 주식 국외전출세 — 비대주주 상태로 렌더 → `:94` 경고가 **DOM에 없다** + 긍정 짝 |

착수 후 AW-1·2·4를 **존재 단언으로 반전**한다.

---

## 6. 성공 기준 — **실측 결과**

| 기준 | 결과 |
|---|---|
| Pre-Do anchor (착수 전, 현행 통과) | ✅ 8건 — 판정 5 + 주식 3 (긍정 짝 포함) |
| anchor 반전 후 | ✅ 11건 |
| 뮤테이션 구별력 | M-1 KILLED · **M-2 SURVIVED → 구조 수정** · M-2b KILLED (§7-1) |
| `npx tsc --noEmit` | ✅ 0건 |
| `npm run lint` | ✅ 0 error (변경 파일 지적 0건) |
| 톤·폰트 게이트 | ✅ 통과 |
| 전건 vitest | ✅ **23,068 passed** (2,199 파일) |
| 신규 E2E (실브라우저) | ✅ VW-1·VW-2 |
| 영향권 E2E 24파일 | ✅ 89 passed |
| 전건 E2E | ⚠️ **1,319 passed / 1 failed** — 아래 |
| `known-failures.ts` | ✅ 0건 유지(늘리지 않음) |

### 6.0 전건 E2E의 1건 — 부하 의존 flake로 확정

`transfer-nbl-revenue-deemed-common.spec.ts:26`. **지난 PR(§V-6)과 같은 건, 같은 지점**이다 —
`/calc/transfer-tax` **1단계** `getByRole("combobox").nth(1)` 타임아웃(30초).

「지난번과 같다」로 넘기지 않고 두 가지를 직접 확인했다:

1. **단독 3/3 통과**(5.0~5.4초).
2. **내 변경이 그 화면에 닿지 않는다** — `<ValidationWarnings>` 마운트 지점은 전수 grep으로
   **2곳뿐**(판정·주식 오케스트레이터)이고 transfer-tax에는 없다. transfer-tax 쪽 변경은
   `MergeDateSection`의 **`data-testid` 속성 2개**가 전부로, 요소를 추가하지 않으므로
   `.nth(1)` 인덱스가 밀릴 수 없다(그 섹션은 Step4, 실패 지점은 Step1).

⇒ 회귀가 아니다. 다만 이 spec은 **인덱스 셀렉터**를 써서 구조 변화에 취약하다 — 별건 F-7.

### 6.1 나머지 기준

1. AW-1·2·4 반전 후 통과 / AW-3 불변
2. 13건 각각에 대해 「이 조건을 만들면 화면에 뜬다」가 유닛 또는 E2E로 최소 1건씩 대표 검증
3. `npx tsc --noEmit` 0건 · `npm run lint` 0건
4. **E2E 회귀 0** — 특히 아래 영향권
5. `scripts/check-tone-classes.sh` · `check-font-sizes.sh` 통과
6. `e2e/known-failures.ts` 0건 유지 (**늘리지 않는다**)

### 6.1 E2E 영향권 (경고가 새로 뜰 수 있는 경로)

기본 폼 상태에서는 **판정 3건 전부 안 뜬다**(`isOneHousehold` 기본 `true` · 나머지는 명시
입력 필요). 주식은 `marketType` 분기에 갇혀 있다(`stock-transfer-tax-validate.ts:158-170`).

| 경고 | 조건 | 의심 spec |
|---|---|---|
| exit `:94` 비대주주 | `marketType==="exit_tax"` + 토글 OFF | `exit-tax-wizard-steps` · `exit-tax-filing-form-first` |
| exit `:74` 거주 5년 미만 | 〃 + 연수 입력 | 〃 |
| foreign `:69` 거주 5년 미만 | `marketType==="foreign_stock"` | `foreign-stock-*` (3건) |
| `:618` §94①4다 미충족 | `other_asset` | `stock-block-shareholder-94-1-4-da` |
| `:325` `:487` 이월과세 | 증여자 취득가액 부재 | `stock-transfer-carryover-97-2*` (2건) |
| `step2:136` `:533` 월할가산 | 토글 ON + 평가액 상이 | `stock-transfer-monthly-accrual` |
| `step2:600` 무상증자 비율 | ratio > 10 | `stock-transfer-split-capital` |
| `:259` 판정기준일 override | 일자만 입력 | 미상 — grep으로 확인할 것 |

⚠️ **새 카드가 `getByText` 유일성을 깰 수 있다**
(`feedback_new_widget_breaks_uniqueness_selectors`). 위 spec들은 실행해서 확인한다 —
「안 걸릴 것 같다」로 넘기지 않는다.

---

## 7. 범위 밖 (기록만)

| # | 항목 |
|---|---|
| **F-2** | (기존) `validateAllSteps`에 **차단 소비처**가 없다 — 사이드바 점프로 앞 단계 **오류** 우회 가능. 이번에 경고 표시용 소비처가 생기지만 **게이트는 여전히 없다** |
| **F-3** | (기존) `isRegulatedArea`(양도 당시) 토글의 판정 내 소비처 미확인 |
| **F-5** | 🆕 사이드바 `attention`(amber `!`)이 **오류**를 나타낸다 — 경고 표식을 더하려면 색 의미 충돌을 먼저 정리해야 하고, status union이 6개 마법사 공용이라 영향권이 넓다 (D-5) |
| **F-6** | ✅ **해소(2026-09-25).** `validateStep1`의 국내 본문(172–637행)을 `stock-transfer-tax-validate-step1.ts`의 `validateStep1Domestic`으로 추출 — `validateStep2`가 이미 쓰던 규약(`-step2.ts`·`-foreign.ts`·`-exit.ts`)을 그대로 따랐다. **798 → 261줄**(신규 568줄), 둘 다 상한 아래. `pushLotTimelineErrors`·`parseF`·`parseI`와 `block-shareholder-gate` import가 본 파일에서 고아가 되어 함께 옮겼다. 동작 동일성은 **원본 사본과의 차분 대조**로 확인(9개 시장 × 21표본 = 189건, 차이 0 · 오류 발생 표본 100건 초과 · 1줄 뮤테이션으로 하네스 KILLED 확인). ❌ 미결 재기재 금지 |
| **F-7** | 🆕 `transfer-nbl-revenue-deemed-common.spec.ts:74`가 `getByRole("combobox").nth(1)` — **인덱스 셀렉터**다(e2e/CLAUDE.md §1이 지양하는 형태). 부하에 흔들리는 데다 그 화면에 combobox가 하나 늘면 조용히 엉뚱한 컨트롤을 집는다. 전건 실행에서 **두 PR 연속** 실패한 유일한 건이다 |

## 7-1. ⚠️ 안전망이 **없는** 축 (`feedback_anchor_excluded_axis_is_unguarded`)

**「주식 결과 화면이 `validateStep3`으로 흘러내리는」 회귀는 테스트가 못 잡는다.**
`validateStep3`이 경고를 0건 만들기 때문에, `default: []`를 `default: validateStep3(formData)`로
되돌려도 화면이 **똑같다**. 실제로 첫 뮤테이션(M-2)이 그렇게 **살아남았고**, 그때서야 그
단언이 구별력 0임을 알았다(`feedback_mutation_zero_discrimination_is_not_proof`).

지금 테스트가 잡는 것은 **`default`가 `validateStep1`/`validateStep2`로 흘러내리는** 쪽뿐이다
(M-2b로 KILLED 확인). 장차 `validateStep3`에 경고를 추가하는 사람은 **결과 화면 누출을
스스로 확인**해야 한다 — 그래서 `default: []` 옆에 근거 주석을 남겼다.

---

## 8. 실행 함정 (지난 작업에서 실제로 밟은 것 — 반복 금지)

- 🔴 **파이프는 종료코드를 삼킨다** — `npx tsc --noEmit | head`는 `head`의 0을 돌려준다.
  파일로 리다이렉트하고 `$?`를 직접 읽는다 (`feedback_gh_watch_pipe_exit0_false_green`)
- 🔴 **전건 E2E가 도는 중에 소스를 고치지 말 것** — 지난 PR에서 두 번 밟아 실행 창을 오염시켰다
- 🔴 **셀렉터·값 형식을 추정하지 말 것** — `data-testid`로 잡고 probe로 확정 (e2e/CLAUDE.md §4)
- 🔴 **JSX 주석** — `{cond && (` 안에 `{/* */}` 금지(객체 리터럴로 파싱) · 주석 본문에 닫는
  슬래시-별표 표기 금지(주석이 거기서 끝난다)
