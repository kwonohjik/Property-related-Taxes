# 1세대1주택 판정 마법사 — 입력 단계 재배치 (②↔③) + 양도주택 정보 통합

> 상태: **구현 완료 · 게이트 통과** · 작성/구현 2026-09-23
> 대상: `/calc/one-house-exemption` (판정 마법사). 양도세 계산기(`/calc/transfer-tax`)의 **동작은 바꾸지 않는다**.
> 결정 완료: Q-1 = 세 블록 모두 이동 · Q-2 = 합가일 중복 함께 수정 · Q-3 = 주소 신설 + 2-C 재설계
>
> ## 실행 결과 요약
>
> | 게이트 | 결과 (종료코드 직접 확인) |
> |---|---|
> | Pre-Do anchor 3건 (현행 진단 고정) | ✅ 9건 통과 → 진단 확정 후 착수 |
> | 뮤테이션 구별력 실측 | ✅ ④ `regionCode` 제거 → 2건 red · `hideMergeDate` 제거 → 1건 red (둘 다 KILLED) |
> | `npx tsc --noEmit` | ✅ `0` |
> | `npm run lint` | ✅ `0` (경고 352건은 전부 기존분 — 변경 파일 신규 0) |
> | 폰트·톤·워크플로 하드블록 | ✅ `0` |
> | `npx vitest run` 전건 | ✅ `0` — 23057 통과 / 13 skipped / 4 todo |
> | **판정 관련 E2E 78건** | ✅ `0` — 전건 통과 (소스 고정 상태에서 확정 실행) |
> | E2E 전건 1316건 | ✅ 1차 1314 통과 · **flaky 1건**(§11 V-6 — 계산기 NBL, 단독 3/3 통과) |
>
> 🔴 **실행 교훈**: `npx playwright test | tail`은 **실패해도 exit 0**이다(파이프 종료코드는
> `tail`의 것). 1차 전건에서 「exit 0」만 보고 초록으로 읽을 뻔했고 요약 줄에 `1 failed`가 있었다.
> 전건 판정은 **파일로 리다이렉트해 종료코드를 직접** 받을 것
> (`feedback_gh_watch_pipe_exit0_false_green`·`feedback_playwright_summary_last_passed_line_hides_failures`).

---

## 1. 배경 — 사용자 제보

> 「양도주택이 ③ 화면에서 입력되는데 ② 화면에서 **종전주택 취득일이 먼저** 나오니까 입력을 해야 하는 것 같아서 당황스러워.
> 그리고 ② 화면에 **양도주택 정보와 다른 주택 정보가 혼합**돼 있어서 혼란스러워.」

두 제보 모두 정당하다. 그리고 첫 번째는 **미관 문제가 아니라 기능 결함**이다(§3).

---

## 2. 현행 구조 (전부 코드 확인)

`OneHouseJudgmentCalculator.tsx:36-37`

```ts
const STEPS = ["세대", "보유 주택·권리", "양도 예정", "판정 결과"] as const;
const RESULT_STEP = 3;
```

| idx | 화면 | 컴포넌트 | 검증 |
|---|---|---|---|
| 0 | ① 세대 | `steps/Step1.tsx:29` | `validateStep1` (`one-house-exemption-validate.ts:52`) |
| 1 | ② 보유 주택·권리 | `steps/Step2.tsx:180` | `validateStep2` (`:83`) |
| 2 | ③ 양도 예정 | `steps/Step3.tsx:43` | `validateStep3` (`:268`) |
| 3 | 판정 결과 | `steps/Step4.tsx:22` | 없음 |

---

## 3. 🔴 현행 순서는 **기능 결함**이다

### 3.1 데이터 의존 방향이 화면 순서와 반대다

`assets[0].acquisitionDate`의 **유일한 입력 경로는 ③ 단계**(`Step3.tsx:83-89`, `validateStep3:273`이 필수).
`form.transferDate`도 ③ 단계(`Step3.tsx:91-95`, `validateStep3:272`).

그런데 **② 단계가 그 두 값을 6곳에서 소비한다**:

| 소비 지점 | 용도 |
|---|---|
| `Step2.tsx:58` | `primaryAcquisitionDate = form.assets?.[0]?.acquisitionDate ?? ""` |
| `Step2.tsx:72-90` | `resolveTemporaryTwoHouse(...)` — §155① 신규 주택 도출 |
| `Step2.tsx:93-119` | `judgeTempTwoHouseFromForm(...)` — 요건 자동판정 카드 |
| `Step2.tsx:166-175` | `provisoGate({ temporaryTwoHouseApplies })` → §154① 단서 노출 게이트 |
| `Step2.tsx:206` | 「종전 주택 취득일」 표시 |
| `Step2.tsx:380-381` | §155⑳ 임대주택 섹션 |

### 3.2 그 결과 — **첫 순방향 진행에서 §155① 블록이 뜨지 않는다**

`household-house-count.ts:263`

```ts
if (!prev) return fallback();   // 비교 기준이 없으면 「나중 취득」을 가릴 수 없다
```

`prev`(= `primaryAcquisitionDate`)가 `""`이면 `fallback()`도 `prev`를 요구하므로(`:253`) `undefined`.
→ `Step2.tsx:207`이 `derivedNewHouseAcquisitionDate={undefined}`
→ `TemporaryTwoHouseSection.tsx:123` `if (!derivedNewHouseAcquisitionDate) return null`

⇒ **①→② 순방향으로 처음 도달한 사용자에게 「일시적 2주택 특례(§155①)」 블록은 보이지 않는다.**
③에서 취득일을 넣고 **되돌아와야** 나타난다.

### 3.3 안내 문구 2건이 없는 단계를 가리킨다

| 위치 | 현재 | 실제 |
|---|---|---|
| `TemporaryTwoHouseSection.tsx:134` | 「자동 반영 (**1단계**에서 입력)」 | ③ 단계다. 판정 마법사 1단계는 「① 세대」. **양도세 계산기 Step1**을 가리키는 스테일 텍스트 |
| `HousesListSection.tsx:593-595` | 「**1단계에서 양도 물건 주소를 입력**하세요」 | 판정 마법사엔 주소 입력이 없었다 → **Q-3에서 신설한다** |

`TemporaryTwoHouseSection.tsx:132`·`:139`는 `disabled` + `onChange={() => {}}`로 **이미 읽기 전용**이다.

---

## 4. 설계 결정

### D-1. 파일명·검증 함수명은 바꾸지 않는다. 렌더 순서만 바꾼다 ✅

`Step3`(양도 대상) → idx **1**, `Step2`(보유 주택·권리) → idx **2**.

1. **저장소 관례** — `components/calc/CLAUDE.md`: 「파일명은 historical naming을 유지하지만 마법사 UI는 0~3 인덱스」(양도세 계산기 Step1·Step4·Step5·Step6).
2. **유닛 테스트 7파일이 경로로 import** — `proviso-gate-roster-deps.ui.test.tsx:23` · `two-house-axis-path.anchor.test.tsx:20` · `right-three-year-exception-path.ui.test.tsx:31` · `inherited-right-exception-path.ui.test.tsx:27` · `merged-household-right-path.ui.test.tsx:25` · `redev-right-exemption-prop-wiring.anchor.test.tsx:61` · `redev-right-section-moved.anchor.test.tsx:29`
3. **소스 문자열 anchor 2건이 파일 경로를 고정** — `temp-two-house-sections-moved.anchor.test.ts:289` · `right-exception-sections-moved.anchor.test.ts:138`

⇒ 파일명 유지로 **9파일이 무손상**. 파일명을 바꾸면 전부 수정 + anchor 2건 재작성이고 얻는 것은 이름의 미감뿐이다.

### D-2. 화면 제목·라벨 번호 변경

| 위치 | 현재 | 변경 |
|---|---|---|
| `OneHouseJudgmentCalculator.tsx:36` | `["세대","보유 주택·권리","양도 예정","판정 결과"]` | `["세대","양도 대상 주택","보유 주택·권리","판정 결과"]` |
| `OneHouseJudgmentSidebar.tsx:20` | 동일 배열 **복제** | 같이 변경 |
| `Step3.tsx:43` | `"③ 양도 예정"` | `"② 양도 대상 주택"` |
| `Step2.tsx:180` | `"② 보유 주택·권리"` | `"③ 보유 주택·권리"` |
| `Step3.tsx` 섹션 번호 | `3-A`·`3-B`·`3-C` | `2-A`·`2-B`·`2-C` |

### D-3. ✅ 양도주택 특례 3블록을 ② 화면(`Step3.tsx`)으로 옮긴다 — Q-1 결정

| 블록 | 현재 위치 | 검증 규칙 |
|---|---|---|
| §155의2 장기저당담보 | `Step2.tsx:233-305` | `validate:131-143` (3건) |
| §155의3 상생임대 | `Step2.tsx:307-361` | `validate:184-197` (4건) |
| §155⑳ 거주주택 임대 | `Step2.tsx:376-383` | `validate:152-162` (error) + `:168-180` (warning) |

**⑧ 검증도 함께 옮긴다** — `validateStep2` → `validateStep3`. 3중 패턴(⑤/④/⑧) 유지.

> 🔴 **예외 하나: §155⑳ 이중입력 경고(`validate:168-180`)는 `validateStep2`에 남긴다.**
> 그 경고는 「특례로 선언한 임대주택을 **명부에도** 넣지 마세요」이고, 조건이 `form.houses.length > 0`이다.
> 명부는 ③ 화면(idx 2)에서 입력되므로, 경고를 ②로 옮기면 **명부 입력 시점에 평가되지 않아 사실상 죽는다**.
> 경고가 판정을 막지는 않으므로(`handleNext`는 error만 차단) 명부 화면에 남기는 것이 맞다.

**옮기지 않는 것**(전부 명부·공유 컴포넌트 종속 — 실측):

| 블록 | 이유 |
|---|---|
| 양도 주택 소재지 카드 (`HousesListSection.tsx:580-598`) | 공유 컴포넌트 **내부**. 계산기도 쓴다 |
| §155② 2년내 증여분 (`HouseCountExemptionInputs.tsx:68-77`) | 게이트가 `form.houses?.some(h => h.isInherited)` — 명부 종속 |
| §154① 단서 (`Step2.tsx:220-230`) | `proviso` 게이트가 명부 파생 `derivedNewHouse`에 의존(`Step2.tsx:172`) |

**고아 정리**: §155⑳을 옮기면 `Step2.tsx:63-64` `patchPrimaryAsset`이 미사용이 된다 → 제거(내 변경이 만든 고아만).

**파일 크기**: `Step2.tsx` 386 → 약 240줄, `Step3.tsx` 179 → 약 330줄. 둘 다 정책(≤700) 내.

### D-4. 스테일 문구 정정

| 위치 | 현재 | 변경 |
|---|---|---|
| `TemporaryTwoHouseSection.tsx:134` | 「1단계에서 입력」 | 「**② 양도 대상 주택** 단계에서 입력」 |
| `TemporaryTwoHouseSection.tsx:141` | 「**②** 보유 주택 목록에서」 | 「**③** 보유 주택 목록에서」 |
| `Step2.tsx:186-188` | 「양도 대상은 **③ 단계에서 따로 입력하며**」 | 「양도 대상은 **② 단계에서 이미 입력했으며**」 |
| `HousesListSection.tsx:593-595` | 「1단계에서 양도 물건 주소를 입력하세요」 | 「**② 양도 대상 주택**에서 주소를 입력하세요」 (D-6으로 실제 경로가 생긴다) |

> ⚠️ `TemporaryTwoHouseSection.tsx:134`·`:141`은 `full` 모드 전용 블록 안(`:441`)이라 계산기 무영향 — **확인 완료**.
> `HousesListSection.tsx:593`은 **계산기와 공유 경로**다. 계산기에서는 「1단계」가 실제로 맞으므로(자산 카드 `AssetSectionBasic.tsx:315`) **문구를 분기**해야 한다.

### D-5. ✅ `MergeDateSection` ①·② 중복 제거 — Q-2 결정

**주택 수 ≥ 2이면 합가일 칸이 양쪽에 뜬다:**

- `Step1.tsx:78` — `judgmentMergeDateOwnedByStep1(form)`
  = `!(presaleRights.length > 0 && houseCount < 2)` (`one-house-judgment-section-scope.ts:34-37`) ⇒ houseCount ≥ 2면 **true**
- `TemporaryTwoHouseSection.tsx:461` — `full` 가드 **밖**, 무조건 렌더.
  섹션 노출 게이트는 houseCount ≥ 2 (`Step2.tsx:199`)
- `MergeDateSection` 자체에 내부 게이트 없음 (`MergeDateSection.tsx:10-18`)

배타 규약 주석(`one-house-judgment-section-scope.ts:26-32`)이 `MergedHouseholdRightSection`만 상대로 쓰고 **`TemporaryTwoHouseSection:461`을 빠뜨렸다.**

**수정 방침**: `:461`을 `full` 가드 안으로 넣지 **않는다** — 계산기(`mode="calc"`)는 합가 입력을 그 자리에서 받아야 하기 때문이다(`TemporaryTwoHouseSection.tsx:437` 설명). 대신 **판정 마법사에서만 끄는 prop**(`hideMergeDate`)을 추가한다. `hideSellingHouseExclusion`(F-1)과 같은 층위의 선례가 이미 있다.

### D-6. ✅ 양도 물건 주소 입력 신설 + 2-C 재설계 — Q-3 결정

#### 배선은 **거의 다 있다** (실측)

| 지점 | 상태 | 근거 |
|---|---|---|
| ① 타입 | ✅ 있음 | `calc-wizard-asset.ts:300` `regionCode?: string` |
| ⑫ Zod | ✅ 있음 | `transfer-tax-schema-base-shape.ts:116` `regionCode: z.string().length(10).optional()` (판정 route가 같은 `propertySchema`를 쓴다 — `route.ts:30`) |
| ⑭ route→엔진 | ✅ 있음 | `app/api/calc/transfer/engine-input.ts:68` `regionCode: data.regionCode` (판정 route가 `buildTransferEngineInput` 공유 — `route.ts:31`) |
| 엔진 소비 | ✅ 있음 | `judge.ts:65` → `meetsOneHouseResidenceRequirement` → `transfer-tax-exemption-requirements.ts:473` `resolveWasRegulatedAtAcquisition(input)` |
| **④ 전송** | ❌ **없음** | `one-house-exemption-api.ts`에 region 축 0건 |
| **⑤ 위젯** | ❌ **없음** | 판정 마법사에 `AddressSearch` 0건 |

⇒ 실제 작업은 **④ 한 줄 + ⑤ 위젯 + 2-C 재설계**다.

#### 🔴 2-C 재설계가 필요한 이유 — 주소가 토글을 **완전히 이긴다**

`transfer-tax-exemption-requirements.ts:382-390`

```ts
export function resolveWasRegulatedAtAcquisition(input: ResidenceReqInput): boolean {
  if (input.regionCode) {
    return isRegulatedByBjdCode(input.regionCode, 취득일).isRegulated;  // ← 주소가 이긴다
  }
  return input.wasRegulatedAtAcquisition === true;                       // ← fallback
}
```

주소를 넣은 뒤에도 현재 토글(`Step3.tsx:118-125` 「취득 당시 조정대상지역이었습니다」)을 그대로 두면,
사용자가 켜도 **조용히 무시**된다 — `feedback_ui_engine_dual_truth_avoidance` 정면 위반.

**설계**:

1. `2-B 양도 대상 주택`에 `AddressSearch` 추가 → `patchAsset({ regionCode: v.pnu.slice(0, 10) })`
   (선례: `AssetSectionBasic.tsx:315-317`. `z.string().length(10)`이라 **정확히 10자리**여야 한다)
2. `2-C 조정대상지역`:
   - **주소 있음** → 「취득 당시」 토글을 **자동 판정 결과 + 읽기 전용 + 「자동」 배지**로 대체.
     판정값은 `isRegulatedByBjdCode(regionCode, 취득일)` — **엔진과 같은 함수를 UI에서도 직접 import**
     (`single-source-engine-helper` 스킬 — 별도 판정 함수 재정의 금지)
   - **주소 없음** → 현행 토글 유지 (fallback 경로)
   - 안내문에 「주소를 입력하면 읍·면·동·택지지구 예외까지 정밀 판정됩니다」 추가

> ⚠️ **「양도 당시 조정대상지역입니다」 토글(`Step3.tsx:126-133`)은 손대지 않는다.**
> `Step3.tsx:115-116`이 「양도 당시 지정 여부는 거주요건과 무관합니다」라고 명시하고,
> `resolveWasRegulatedAtAcquisition`은 **취득일** 기준만 본다. 양도당시 축의 소비처는 **V-4**로 확인.

---

## 5. 재배치 후 화면 구성

```
① 세대                  — 1세대 해당 선언 + 합가일
② 양도 대상 주택         — 2-A 종류(주택/입주권)
                          2-B 주소 · 취득일 · 양도예정일 · 예상 양도가액        ← 주소 신설
                          2-C 조정대상지역 (주소 있으면 자동판정 읽기전용)      ← 재설계
                          거주기간 · 미등기
                          §155의2 · §155의3 · §155⑳                          ← 이동
③ 보유 주택·권리         — 다른 보유 주택 명부 · 분양권·입주권 · 조특법 감면주택
                          §155① 일시적 2주택(취득일 2건이 ②에서 채워진 상태)
                          §155⑯⑱ · §154① 단서 · 합가 특례
④ 판정 결과
```

---

## 6. 변경 지점 전수

### A. 오케스트레이터 `app/calc/one-house-exemption/OneHouseJudgmentCalculator.tsx`

| # | line | 변경 |
|---|---|---|
| A-1 | `:36` | `STEPS` 2·3번째 라벨 교체 |
| A-2 | `:55-63` | `validateCurrent` — `1→validateStep3`, `else→validateStep2` |
| A-3 | `:183-184` | `1 && <Step3>` · `2 && <Step2>` |
| A-4 | `:37,:102,:174,:185,:197,:200,:210` | **변경 없음** (단계 수·결과 인덱스 불변) |

### B. 사이드바 `components/calc/one-house/OneHouseJudgmentSidebar.tsx`

| # | line | 변경 |
|---|---|---|
| B-1 | `:20` | `STEP_LABELS` — A-1과 동일 문자열 복제. 같이 수정 |
| B-2 | `:44` | 변경 없음 |

### C. 검증 `lib/calc/one-house-exemption-validate.ts`

| # | line | 변경 |
|---|---|---|
| C-1 | `:298-308` | `getStepErrorCount` — `step===1 → validateStep3`, `step===2 → validateStep2` |
| C-2 | `:131-143` · `:184-197` · `:152-162` | §155의2·§155의3·§155⑳(error) 규칙을 `validateStep3`로 **이동** |
| C-3 | `:168-180` | §155⑳ 이중입력 **경고는 `validateStep2`에 잔류**(D-3 예외) |
| C-4 | `:51,:78,:225,:267,:296` | 머리·인라인 주석의 ①②③ 표기 갱신 |

### D. 화면 컴포넌트

| # | 파일 | 변경 |
|---|---|---|
| D-1 | `steps/Step3.tsx` | 제목·섹션번호 2-A/2-B/2-C · 주소 위젯 · 2-C 재설계 · 특례 3블록 수용 |
| D-2 | `steps/Step2.tsx` | 제목 ③ · 안내문 · 특례 3블록 제거 · `patchPrimaryAsset` 고아 제거 · `hideMergeDate` 전달 |
| D-3 | `step4-sections/TemporaryTwoHouseSection.tsx` | `:134`·`:141` 문구 · `hideMergeDate` prop 추가(`:461` 게이트) |
| D-4 | `step4-sections/HousesListSection.tsx` | `:593-595` 문구 분기(계산기/판정) |

### E. 변경 불필요 (확인 완료)

- `lib/stores/one-house-judgment-store.ts:44,63,89` — `currentStep`은 persist하지 않고 항상 0
- `one-house-judgment-handoff.ts:166` · `history-resume-entry.ts:94,129` — 전부 `setStep(0)`
- 외부에서 판정 마법사를 0이 아닌 특정 단계로 진입시키는 코드 **없음**(grep)
- ⑫ Zod · ⑭ engine-input · ① AssetForm 타입 — **이미 `regionCode`를 갖고 있다**(D-6 표)

---

## 7. E2E 영향 (8 spec + 1 헬퍼)

### 7.1 헬퍼 — 파급이 가장 크다

`e2e/_helpers/judgment-seed.ts:19-52` `gotoJudgmentStep2()`
현재: 시드 → 「다음」 **1회** → `② 보유 주택·권리` 단언(`:50-51`).
변경 후 명부·특례 화면은 **「다음」 2회** + `③ 보유 주택·권리` 단언. 함수명도 **`gotoJudgmentHoldingsStep()`** 으로 개명.

**이 헬퍼를 쓰는 4 spec**(본문 수정 불요 예상):
`transfer-155-temp-two-house-auto-judge.spec.ts:19` · `transfer-154-proviso-mode.spec.ts:20` ·
`transfer-replacement-house.spec.ts:22` · `transfer-155-16-18-deadline-specials.spec.ts:21`

### 7.2 직접 수정

| spec | 라인 |
|---|---|
| `one-house-judgment-one-right.spec.ts` | `:19-22` |
| `one-house-judgment-handoff.spec.ts` | `:32-33`, `:54-55` — ⚠️ `:119-120`·`:172-173`의 「① 세대·주택 현황」은 **계산기** 화면이라 무관 |
| `one-house-judgment-history.spec.ts` | `:27-34`(주석 포함), `:88-89` |
| `one-house-judgment-provenance.spec.ts` | `:34-36`, `:63`, `:111` |
| `one-house-judgment-rental-housing.spec.ts` | `:27-28`, `:73-77`, `:115-116` — **§155⑳가 ②로 이동하므로 차단 단계가 바뀐다**(V-1) |
| `one-house-judgment-rental-155-20-active-ui.spec.ts` | `:90-91` — 동상 |
| `one-house-judgment-unmet-155-exceptions.spec.ts` | `:82-84` |
| `one-house-judgment-unmet-merge.spec.ts` | `:79-83` |

### 7.3 영향 없음 (확인 완료)

`wizard-reset-on-home-entry.spec.ts` · `transfer-handoff-notice-provenance.spec.ts` ·
`transfer-house-row-one-house-facts.spec.ts` · `transfer-rental-155-20-calc-side.spec.ts`

⚠️ **`one-house-judgment-load.spec.ts`는 초기 조사에서 누락됐다** — 파일명에 `one-house-judgment`가
있지만 본문은 `/calc/transfer-tax`만 방문한다(`:66`). `grep -rl "one-house-exemption" e2e/`가
**라우트 문자열로만** 훑었기 때문이다. 실제로 단계 내비게이션이 없어 영향은 없었으나,
**영향 범위 집계는 라우트 문자열만으로 끝내지 말 것** — 파일명·헬퍼 import도 함께 훑는다.

### 7.4 🔴 실행 함정 — 전건 E2E가 도는 중에 소스를 고치지 말 것

2차 전건이 도는 동안 `Step3.tsx`의 안내 문구를 고쳤는데, 그 편집이 일시적으로 JSX를 깨뜨렸다
(아래 §12 F-4). Playwright는 파일 순서로 도므로 그 시점 이후에 실행된 `one-house-*` spec
구간의 결과가 **통째로 무효**가 됐다. dev 서버는 라우트별로 컴파일하므로 다른 spec은 무사했지만,
**「전건 초록」을 주장하려면 소스가 고정된 상태에서 끝까지 돈 run이어야 한다.**

---

## 8. Pre-Do anchor (Do 진입 전 작성·실행)

### AN-1 — 현행 결함 고정 (RTL, 재배치 **전**에 통과해야 함)

`Step2`를 `assets[0].acquisitionDate: ""` + 명부 1채로 렌더 → **「종전 주택 취득일」 라벨 부재** 단언.
현행에서 통과하면 §3.2가 실측 확정된다. **통과하지 않으면 계획을 되돌린다.**

### AN-2 — 합가일 중복 고정 (RTL, 재배치 **전**)

houseCount ≥ 2 폼으로 `Step1`·`Step2`를 각각 렌더 → **양쪽에 「혼인합가일」이 있다** 단언(현행 통과 = D-5 확정).
수정 후 `Step2` 쪽만 사라지도록 반전.

### AN-3 — `regionCode` 정밀 판정 도달 (엔진/어댑터, 재배치 **전**)

`buildOneHouseExemptionApiBody(form)` 결과에 **top-level `regionCode`가 없다**를 현행에서 단언 →
D-6 적용 후 **있다 + 조정지역 주소를 넣으면 토글 OFF여도 거주요건이 요구된다**로 반전.
(`feedback_api_trigger_without_input_path_is_noop` — 위젯만 만들고 전송을 빠뜨리는 것을 막는 유일한 방어선)

### AN-4 — 단계 매핑 회귀 (유닛)

취득일만 비운 폼 → `getStepErrorCount(form, 1) >= 1` · `(form, 2) === 0`

---

## 9. 성공 기준

1. AN-1·AN-2·AN-3이 **재배치 전에 통과** → 진단 3건 확정
2. AN-1~AN-4가 **재배치 후 반전 형태로 통과**
3. `npx tsc --noEmit` 0건
4. `npx vitest run __tests__/calc/ __tests__/components/` 전건 통과 — D-1로 9파일 무손상 예상(V-2)
5. `npx playwright test e2e/one-house-judgment-*.spec.ts e2e/transfer-154-proviso-mode.spec.ts e2e/transfer-155-*.spec.ts e2e/transfer-replacement-house.spec.ts` 전건 통과
6. 브라우저 수동 확인 — ①→②→③ 순방향에서 §155① 블록이 **되돌아가지 않고** 보이고 취득일이 채워져 있다
7. 브라우저 수동 확인 — ②에 조정대상지역 주소 입력 → 2-C가 자동 판정 읽기 전용으로 바뀌고, Network 탭 request body에 `regionCode` 10자리가 실린다

---

## 10. 미검증 항목 (V-n) — Do 중 실측

| # | 항목 |
|---|---|
| **V-1** | ✅ **해소 — 단언 교체만으로는 부족했다.** §155⑳ 검증이 `validateStep3`로 오면서 **같은 화면의 필수 3값과 한 검증을 공유**하게 됐고, 배너는 첫 error 하나만 띄우므로(`OneHouseJudgmentCalculator.tsx:66-71`) 기본값을 비워 두면 「양도 예정일을 입력하세요」가 먼저 떠 OHR-3이 겨냥한 축을 가렸다. ⇒ spec에서 기본 3값을 먼저 채우도록 고쳤다. **제품 동작은 옳다**(위에서 아래로 채우는 사용자는 기본값을 먼저 넣는다) |
| **V-2** | ✅ **해소 — 무손상은 아니었다.** 9파일 중 7파일은 무손상이었으나 2건이 갱신을 요구했다: ① `merged-household-right-path.ui.test.tsx` — 합가일 소유자가 ①로 정리되며 기대가 바뀜(그 테스트가 원래 「③ 섹션이 소유한다」고 적어 **중복을 정상으로 고정**하고 있었다) ② `temp-two-house-sections-moved.anchor.test.ts` TM-8 — **내가 새로 쓴 주석의 `mode="calc"` 문자열**이 소스 스캔 anchor에 걸렸다(`feedback_static_guard_matches_its_own_comment`). 파일명 유지 판단 자체는 유효했다 |
| **V-3** | `validateAllSteps`(`one-house-exemption-validate.ts:311`)는 **소비처가 없다**(grep — 소비되는 것은 `stock-transfer-tax-validate.ts:740`의 동명 함수뿐). 사이드바 점프(`OneHouseJudgmentCalculator.tsx:103,222-227`)로 앞 단계 오류 우회 가능. **이번 변경이 만든 결함이 아니라 범위 밖**이나, 재배치 후 ②를 건너뛰면 ③의 §155① 도출이 실패하므로 체감이 커진다 — 관찰 후 별건 판단 |
| **V-4** | `isRegulatedArea`(양도 당시) 토글이 1세대1주택 판정에서 실제로 소비되는 지점. `Step3.tsx:115-116`은 「거주요건과 무관」이라 하고 `resolveWasRegulatedAtAcquisition`은 취득일만 본다 — 소비처가 없으면 **별건**으로 기록만 한다(이번 범위에서 제거하지 않는다) |
| **V-5** | ✅ **해소** — `RentalHousingExceptionSection`은 `rh`·`asset`·`acquisitionDate`·`transferDate`만 받는다(`form.houses` 미참조). 명부를 보는 것은 ⑧의 이중입력 **경고**뿐이고 그것은 `validateStep2`에 남겼다 |
| **V-6** | ✅ **해소 — 부하 의존 flaky로 확정.** `transfer-nbl-revenue-deemed-common.spec.ts:26`이 전건 1·2차에서 실패했으나 **단독 3/3 통과**. 실패 지점은 `/calc/transfer-tax` **1단계 지목 콤보박스**의 option 미노출 타임아웃으로, 변경 파일 중 그 렌더 경로에 참여하는 것이 없다. 2차에서 겸용주택 4건이 추가로 흔들린 것은 **내가 vitest·tsc를 동시에 돌려 워커를 굶긴 탓**이고, 부하 없이 재실행하니 17/18 통과(남은 1건이 이 NBL) |
| **V-7** | ✅ **해소 — `DateInput`의 저장값은 padded다.** SO-1이 월을 `08`로 단언했다가 `8`을 받았다. 실측하니 `buildDateStr`가 저장 시 `padStart(2,"0")`하고(`date-input.tsx:44-45`) `parseDateStr`가 **표시할 때만** 선행 0을 제거한다(`:32-36`). ⇒ 저장값 `2017-08-31`이므로 `resolveTemporaryTwoHouse`의 **사전식 비교 전제(`household-house-count.ts:265-268`)는 성립**한다. 단언은 표시 형식에 맞췄다. ⚠️ 이 형식을 **두 번 추정으로 틀렸다** — e2e/CLAUDE.md §4 「셀렉터·값 형식은 probe로 확정」을 지켰어야 했다 |

---

## 12. 범위 밖에서 발견한 것 (언급만 — 이번에 고치지 않는다)

| # | 항목 |
|---|---|
| **F-1** | 🟠 **판정 마법사의 `severity: "warning"`은 화면에 전혀 뜨지 않는다.** 배너는 첫 `error`만(`OneHouseJudgmentCalculator.tsx:76`), 사이드바 배지도 `error`만 센다(`getStepErrorCount:337`). 그래서 현재 계산되는 경고 3건 — 1세대 비해당(`validate:60`) · 혼인↔동거봉양 합가일 동시 입력(`:66`) · §155⑳ 임대주택 명부 이중 입력(`:152`) — 이 **전부 보이지 않는다**. 이번 변경이 만든 것이 아니라 기존 상태다. ⚠️ 계획 초안에서 「경고를 ②로 옮기면 **죽는다**」고 적었는데, 실측하니 **이미 표시되지 않는 상태**였다 — 배치 판단(명부 화면에 둔다)은 유효하나 근거 표현을 정정했다(`feedback_verify_before_report_no_inflation`) |
| **F-2** | 🟡 `validateAllSteps`(`one-house-exemption-validate.ts`)는 **소비처가 없다**(V-3). 사이드바 단계 점프로 앞 단계 오류를 우회할 수 있다 |
| **F-3** | 🟡 `isRegulatedArea`(양도 당시) 토글의 1세대1주택 판정 내 소비처 미확인(V-4) — 제거하지 않고 기록만 |
| **F-4** | 📌 **JSX 주석 함정 2종을 이 작업 중 실제로 밟았다.** ① `{cond && (` **안**에 `{/* ... */}`를 넣으면 표현식 자리라 **객체 리터럴로 파싱**돼 파일 전체가 깨진다 → 괄호 밖에 둔다. ② 주석 본문에 **닫는 슬래시-별표 표기를 적으면 주석이 거기서 끝난다**(`feedback_global_replace_eats_own_comment`와 같은 층위 — 주석이 제 발을 건다). 둘 다 `tsc`가 즉시 잡았으나, `npx tsc \| head` 형태는 **종료코드가 `head`의 것**이라 초록으로 보인다 — 반드시 파일로 리다이렉트해 종료코드를 직접 받을 것 |
