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

### D-5. 사이드바는 건드리지 않는다 ✅ (이번 범위 밖) → **F-5에서 해소(2026-09-25)**

`WizardSidebar`의 `status: "attention"`이 **이미 amber `!`** 다(`WizardSidebar.tsx:44-52`) —
그런데 그것은 **오류** 표식이다. 경고 표식을 더하면 같은 색이 두 의미를 갖는다. 게다가 status
union은 **6개 마법사 공용**이라 영향권이 넓다. ⇒ 별건(§7 F-5).

> ⚠️ **위 두 문장은 뒤에 실측으로 정정됐다** — 「6개 공용」은 4개 렌더·2개 세팅이었고, 색
> 충돌은 「더하면 생길 일」이 아니라 이 PR(F-1)이 amber 경고 카드를 넣으면서 **이미 출하됐다**.
> 결론(별건으로 미룬다)은 유효했으나 근거의 규모는 틀렸다. 전말은 §7 F-5.

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
| **F-2** | ✅ **해소(2026-09-25).** 🔴 미관 문제가 아니라 **조용히 틀린 판정**이었다 — 취득일 없는 명부 주택은 ⑧이 막지만 엔진은 주택 수에서 **조용히 뺀다**. ③을 건너뛰고 ④로 점프하면 **2주택 과세 → 1주택 비과세로 뒤집혔다**(API 200 실측). 서버는 그 본문을 받으므로 **클라이언트 관문이 유일한 방어선**이다. 관문 **둘**을 세웠다: ① `onStepClick`(앞으로 가는 점프는 건너뛰는 단계를 검사하고 **그 단계로 데려간다**) ② `handleJudge`가 `validateAllSteps`로 한 번 더 막는다(경로와 무관한 구조적 보장 — F-2가 지목한 「차단 소비처 없음」이 이 자리다). ❌ 미결 재기재 금지 |
| **F-3** | ✅ **해소(2026-09-25). 전제가 틀렸다 — 토글은 죽어 있지 않았다.** 소비처 **둘**을 실측 확인: ① 판정 §155① 처분기한(`one-house/pending.ts:157` → `resolveTemporaryTwoHouseDeadlineYears`) ② 핸드오프로 계산기에 전달 → 다주택 중과. 🔴 그런데 **비대칭**이었다 — 「취득 당시」·중과는 이미 `regionCode`를 우선하는데 **§155① 기한만 boolean을 직접** 읽어, 같은 폼의 세 판정이 서로 다른 근거를 썼다. 그리고 UI에서 「취득 당시」만 자동 판정 카드로 바뀌어, 주소를 넣으면 **엔진이 무시하는 토글**이 양도 당시 쪽에만 남았다. ⇒ 엔진에 `resolveIsRegulatedAtTransfer` 신설(형제 둘과 같은 규약) + UI를 `RegulatedAreaField` 공용 컴포넌트로 대칭화. ❌ 미결 재기재 금지 |
| | 📌 **부수 사실**: 기한 데이터가 비조정 3년 · 조정 2년 · **조정+2022-05-10 이후 양도 3년(완화)** 이라, **양도일 2022-05-10 이후에는 이 축이 판정 결과를 바꾸지 않는다**(실측). 그 날짜 이후 fixture로는 이 축을 **잴 수 없다** — anchor가 그 사실 자체를 단언으로 고정했다 |
| | 📌 **부수 분리**: 엔진 수정이 `transfer-tax-exemption-requirements.ts`를 779 → 802줄로 밀어 올려, §155① 타이밍 4함수를 `transfer-tax-temporary-two-house-timing.ts`로 추출(부모 **706** · 자식 133). `evaluateTemporaryTwoHouseTiming`은 부모의 `resolveExemptionProviso`를 부르므로 **함께 옮기지 않았다**(순환 회피). 재수출을 빠뜨려 tsc가 5곳을 잡았다 — `feedback_800line_split_export_preservation`을 그대로 밟았다 |
| **F-5** | ✅ **해소(2026-09-25). 기록 두 줄이 틀렸다.** ① 「6개 마법사 공용」은 과다 — `WizardSidebar`를 **렌더**하는 곳은 4개(양도세·판정·취득세·주식)이고 `InheritanceSidebar`는 import조차 하지 않는다(주석만 «패턴 따름»). 그중 `attention`을 **세팅**하는 곳은 **2개뿐**(`TransferTaxCalculator.tsx:359` · `OneHouseJudgmentSidebar.tsx:46`). ② 색 충돌은 「더하면 생길 일」이 아니라 **F-1에서 이미 출하됐다** — 배너는 rose=오류·amber=경고인데 사이드바·StepIndicator만 amber=오류였다. ⇒ **오류를 rose로 내리고 amber를 경고 전용으로 비운 뒤** `status: "warning"`을 신설, 판정 사이드바에 배선했다(`getStepWarningCount`). ❌ 미결 재기재 금지 |
| | 🔴 **부수 실측 — 경고만 있는 단계는 «표식이 없는» 게 아니라 «✓ 완료»로 떴다.** Pre-Do anchor가 화면0 «세대» 행을 `"✓세대"`로 잡았다. 미해소 주의사항에 초록 체크를 붙이던 것이라 「없음」보다 나쁘다. ⇒ 우선순위를 **오류 > 경고 > 완료**로 못 박았다(SB-3가 고정, 뮤테이션 M-B로 구별력 확인) |
| | ⚖️ **«조기 `!`» 규약은 통일하지 않았다.** 판정은 `i < currentStep` 게이트가 없어 **첫 로드에 화면1이 이미 `!`** 다(양도세엔 없는 증상). 계약을 어긴 것은 맞지만 **F-2 이후 명분이 생겼다** — 전진 점프가 차단되므로 미방문 단계의 `!`가 그 차단의 예고다. ⇒ 동작은 그대로 두고 거짓이 된 `WizardSidebar.tsx`의 타입 주석만 「마법사마다 다르다」로 정정했다 |
| | 📌 **의도적 제외 3건** — ⓐ **양도세 사이드바**: 경고가 1건(미래 양도일)뿐이고 이미 amber 배너가 있다 ⓑ **주식·취득세 사이드바**: 위치 기반(`done/active/todo`)만 써서 **오류 표식조차 없다** — 경고 이전에 그쪽이 먼저다 ⓒ **StepIndicator의 warning 상태**: `stepStatus` 소비처 2곳(양도세·상속세)이 요구하지 않아 색만 rose로 맞췄다. ⓑ는 새 별건이다 |
| **F-6** | ✅ **해소(2026-09-25).** `validateStep1`의 국내 본문(172–637행)을 `stock-transfer-tax-validate-step1.ts`의 `validateStep1Domestic`으로 추출 — `validateStep2`가 이미 쓰던 규약(`-step2.ts`·`-foreign.ts`·`-exit.ts`)을 그대로 따랐다. **798 → 261줄**(신규 568줄), 둘 다 상한 아래. `pushLotTimelineErrors`·`parseF`·`parseI`와 `block-shareholder-gate` import가 본 파일에서 고아가 되어 함께 옮겼다. 동작 동일성은 **원본 사본과의 차분 대조**로 확인(9개 시장 × 21표본 = 189건, 차이 0 · 오류 발생 표본 100건 초과 · 1줄 뮤테이션으로 하네스 KILLED 확인). ❌ 미결 재기재 금지 |
| **F-7** | ✅ **해소(2026-09-25). 🔴 방아쇠는 spec이 아니라 «낡은 dev 서버»였다.** 신선한 서버에서는 **원본도 9/9 통과**한다(`--repeat-each=3 --workers=3` 3라운드). 실패를 만들던 서버는 **가동 4일 6시간 · RSS 3.3GB**였고, 그 위에서는 원본이 6/9 실패했다. 전건 E2E 소요도 **17.2분 → 7.7분**으로 줄었다. 「두 PR 연속 실패」는 그 서버 위에서 벌어진 일이다 — CI는 매 job이 새 서버라 이 spec이 CI에서 깨진 기록은 없다. ❌ 미결 재기재 금지 |
| | 🔑 **그래도 spec은 고쳤다 — 느려지면 깨지는 구조가 맞았기 때문이다.** 공통 근원은 **hydration 전에 떨어지는 클릭·입력**이다. React 리스너가 붙기 전이면 DOM에는 값이 들어가고 라디오는 `checked`가 되지만 **React 상태는 그대로**다. 그 어긋남이 한참 뒤 전혀 다른 줄에서 터져 범인이 늘 잘못 지목됐다 ⇒ `waitForHydration`(host 노드의 `__reactFiber$` 키 존재)을 맨 앞에 세웠다 |
| | 📌 **기록이 지목한 `:74`는 네 모드 중 하나였다** — ⓐ `:70` `combobox.first()` 30초 타임아웃(라디오 클릭 유실 → 섹션 미렌더) ⓑ `:71` 옵션이 「resolved … not visible」(전역 `getByRole("option")`이 **다른 포털의 안 보이는 옵션**을 집음) ⓒ `:74` 인덱스 ⓓ 양도일 `fill()` 유실 → **무조건 사업용 의제**로 빠져 입력칸이 `aria-hidden` |
| | 📌 **셀렉터 실측** — combobox 개수가 흐름 중 **3 → 0 → 2 → 4**로 변한다(지목을 고르면 재산세·업종이 새로 생김). 네 Select 모두 **accessible name이 없다**(`getByRole("combobox",{name})` 전부 0개 — FieldCard 라벨이 컨트롤에 연결돼 있지 않다). ⇒ `div.rounded-lg` 라벨 필터로 스코프(네 라벨 모두 **정확히 1개** 매칭). 옵션은 방금 열린 `listbox` 안으로 한정 |
| | 📌 **예산** — 이 spec은 저장소에서 가장 긴 풀플로우 중 하나인데 **명시 예산 없이 기본 30초**였다. 같은 무게의 풀플로우들은 이미 60~120초를 쓴다 ⇒ `test.setTimeout(120_000)` |
| | 🔴 **작업 중 내가 결함을 하나 만들었다(기록용).** 「클릭이 유실됐나 보다」며 **같은 라디오를 다시 누르는** 재시도 헬퍼를 넣었더니, 그 클릭이 바깥 `ToggleCard`로 올라가 **스위치가 꺼지고 섹션이 통째로 사라졌다**(실측: 스위치ON `true`/섹션1 → 라디오 재클릭 → `false`/섹션0). 전건 실행에서 그 실패를 봤다. ⇒ 라디오는 **한 번만** 누른다. 그리고 `isChecked()`를 상태 판정에 쓰면 안 된다 — native radio의 `checked`는 브라우저가 세우는 값이라 **React에 도달하지 않은 클릭도 `true`** 로 보여 교착이 된다 |
| | ⚖️ **남긴 인덱스 셀렉터 2종** — `:54-56` 취득일 `getByLabel("연도",{exact:true}).nth(2)`(e2e/CLAUDE.md §1이 금지하는 형태지만 **실패 집합에 없었다**)와 `:59·61` `공시지가 단가 .first()/.nth(1)`(placeholder로 이미 좁혀진 2개 중의 순서라 위험도 낮음). 다음 rot 때 함께 |
| | ✅ **검증** — 전건 E2E **1,324 passed · 0 failed**(신선한 서버, 7.7분) · `tsc` 0 · lint 0 error · `known-failures.ts` 0건 유지 |

| **F-8** | ✅ **취득세분 해소(2026-09-25). 기록보다 컸다 — 사이드바 표식은 증상이고, 그 아래 F-2와 같은 구멍이 있었다.** `handleNext`가 **현재 단계만** 검증하고(`AcquisitionTaxForm.tsx:158`) 마지막 단계에서 곧바로 API를 부르므로, ①에서 취득가액을 비운 채 사이드바로 ⑥「감면 확인」에 점프하면 `validateStep(5)`=`null`이라 **계산이 그대로 실행됐다**(API 200 · `totalTax: 0` 실측). 그때 ①은 **«✓취득 정보»(완료)** 로 표시돼 있었다(Pre-Do anchor 실측). ⇒ 3층으로 고쳤다 |
| | 📌 **① 점프 게이트** `handleStepJump` — 전진 점프만 검사하고 **첫 무효 단계로 데려간다**(F-2 규약). 🔑 나눠져 있던 **네 개의 네비 표면**을 하나로 모았다 — 사이드바·StepIndicator 외에 **결과뷰 「수정하러 가기」 2곳(`:334`·`:401`)이 게이트를 우회**하고 있었다 |
| | 📌 **② 제출 백스톱** — 계산 직전 거쳐온 단계 전수 재검증(양도세 `handleSubmit`과 같은 패턴). 스킵 규칙은 다시 적지 않고 **`computeNextStep`을 걸어서** 실제 거치는 단계만 모은다(`activeStepIndices` — 단일 소스) |
| | 📌 **③ 사이드바 표식** — F-5에서 정한 규약(rose `!` = 차단 오류)을 적용. 건너뛰는 단계는 저절로 빠진다 — `validateStep`의 검사가 그 단계의 활성 조건과 **같은 술어**를 쓰기 때문이다(예: ③ 주택 현황 검사는 `propertyType === "housing"` 게이트 안) |
| | ⚠️ **주장하지 않은 축** — 「④ 중과 분기를 건너뛰면 엔진이 조용히 비조정으로 본다」(`acquisition-tax-validate.ts:26` 주석)는 **수치 영향이 0**이었다(미선택·조정 모두 총세액 52,500,000 실측). 처분기한은 취득 시점 세액을 바꾸지 않는다(`feedback_numeric_impact_verify_before_bug_claim`) |
| | ⚖️ **주식은 별건으로 남긴다** — 같은 구멍(점프 무게이트·표식 없음)이 있지만 **조용한 오답이 되지 않는다**: 빈 폼도 `transferTotalPrice`의 **custom refine**이 400으로 막는다(실측 — `.optional()`만 보고 F-2와 같다고 추론했다가 뒤집혔다). 남은 해악은 원시 Zod 필드 경로가 뜨는 **막다른 길**이라 UX 등급이다 |
| | ✅ **검증** — Pre-Do anchor 5건(착수 전 `"✓취득 정보"`·`calcSpy` 1회 호출로 green 확인 후 반전) · 뮤테이션 게이트·표식 **KILLED** · E2E `[AQJ-1]`/`[AQJ-2]` 신설(AQJ-1 KILLED) · 취득세 회귀 919건 · 전건 E2E |

## 7-1. ⚠️ 안전망이 **없는** 축 (`feedback_anchor_excluded_axis_is_unguarded`)

**「주식 결과 화면이 `validateStep3`으로 흘러내리는」 회귀는 테스트가 못 잡는다.**
`validateStep3`이 경고를 0건 만들기 때문에, `default: []`를 `default: validateStep3(formData)`로
되돌려도 화면이 **똑같다**. 실제로 첫 뮤테이션(M-2)이 그렇게 **살아남았고**, 그때서야 그
단언이 구별력 0임을 알았다(`feedback_mutation_zero_discrimination_is_not_proof`).

지금 테스트가 잡는 것은 **`default`가 `validateStep1`/`validateStep2`로 흘러내리는** 쪽뿐이다
(M-2b로 KILLED 확인). 장차 `validateStep3`에 경고를 추가하는 사람은 **결과 화면 누출을
스스로 확인**해야 한다 — 그래서 `default: []` 옆에 근거 주석을 남겼다.

### F-2 — `onStepClick`의 `target > currentStep` 조건도 재지지 않는다

뮤테이션(M-C, 조건 제거)이 **생존**했다. `blockOnFirstInvalidStep`이 `i < target`만 보므로
뒤로 갈 때는 검사 대상이 거의 없고, 유일하게 갈리는 **④→③(②가 불완전)** 은 `handleJudge`
백스톱 때문에 **도달 불가능한 상태**라서다. 그래도 조건을 남겼다 — 없으면 「뒤로가기 자유」가
`upTo` 산식의 **우연**에 기대게 되고, 나중에 그 산식을 넓히는 순간 사용자가 조용히 갇힌다.

> 🔑 **점프 관문 자체는 처음엔 재지지 못했다.** FB-2·FB-3만 있을 때 관문을 통째로 지워도
> 8건이 **전부 통과**했다 — ④로 가는 점프는 백스톱이 되돌려 주므로 최종 상태가 같았다.
> 백스톱이 돌지 않는 축(**②→③ 점프**)을 FB-4로 추가하고서야 KILLED가 됐다.
> 관문을 겹쳐 세울 때는 **각 관문이 단독으로 책임지는 축**에 fixture가 있는지 확인할 것.

### F-8 — 취득세 제출 백스톱은 재지지 않는다

뮤테이션(`handleNext`의 전수 재검증 블록 제거)이 **생존**했다. 점프 게이트가 먼저 막으므로
**UI로는 백스톱이 발동하는 상태를 만들 수 없다** — 네 개의 네비 표면을 전부 `handleStepJump`로
모았기 때문에 더 그렇다.

그래도 남겼다. 게이트는 **클릭 핸들러**라 `setStep`을 직접 부르는 경로가 새로 생기면 그대로
뚫린다(실제로 결과뷰 2곳이 그렇게 우회하고 있었다 — 이번에 합쳤다). 백스톱은 **되돌릴 수 없는
지점(API 호출) 직전**의 경로 무관 보장이고, 양도세·판정이 같은 구조다.

> 🔑 F-2의 M-C와 같은 판단이다 — **단독으로 책임지는 축에 fixture가 없는 가드**임을 알고 남긴다.
> 장차 게이트를 손대는 사람은 이 블록이 테스트로 보호되지 않는다는 것을 알고 있어야 한다.

---

## 8. 실행 함정 (지난 작업에서 실제로 밟은 것 — 반복 금지)

- 🔴 **파이프는 종료코드를 삼킨다** — `npx tsc --noEmit | head`는 `head`의 0을 돌려준다.
  파일로 리다이렉트하고 `$?`를 직접 읽는다 (`feedback_gh_watch_pipe_exit0_false_green`)
- 🔴 **전건 E2E가 도는 중에 소스를 고치지 말 것** — 지난 PR에서 두 번 밟아 실행 창을 오염시켰다
- 🔴 **셀렉터·값 형식을 추정하지 말 것** — `data-testid`로 잡고 probe로 확정 (e2e/CLAUDE.md §4)
- 🔴 **JSX 주석** — `{cond && (` 안에 `{/* */}` 금지(객체 리터럴로 파싱) · 주석 본문에 닫는
  슬래시-별표 표기 금지(주석이 거기서 끝난다)
