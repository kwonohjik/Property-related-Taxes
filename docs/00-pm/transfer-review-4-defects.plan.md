# 양도세 리뷰 발견 결함 4건 — 수정 계획서 (v0.13)

> 작성 2026-09-18 · 브랜치 `fix/transfer-review-4-defects`(origin/master `2a68b08c` 기준) · 검증 깊이 **L3**(세액이 바뀐다)
> 출처: 「1세대1주택 판정 자동화」 문서 3종 리뷰(2026-09-18)가 **문서 밖 현행 코드 결함**으로 보고한 4건.
> 재현: 결함별 재현 에이전트 1 + 반박 검증 2(법령 관점·코드/도달성 관점)로 **4건 모두 재현**. 수치는 전부 probe 실측이다.
> 결정: **Q-1~Q-5 전건 확정**(2026-09-18) — §5. 미검증 **V-1~V-8 전건 해소**(2026-09-18) — §6. 후속 작업 F-1·F-3~F-9(F-2는 PR-1 흡수) — §10.
> 진행: **PR-1(D9) 머지**(#1689) · **PR-2(D15)** #1691 · **PR-3(D45)** #1692(둘 다 CI 통과) · **PR-4(D16) 구현**(§14).

---

## 0. 한눈에

| ID | 결함 | 현행 → 법령상 세액 (실측) | 방향 | 결정 | PR |
|---|---|---|---|---|---|
| **D9** | 동거봉양 합가 중과배제(배제 3)에 소득세법 시행령 §167의10①15호·§167의3①13호 요건이 없다 | 3주택 141,966,000 → **354,541,000** | 과소 | 법령상 답 명확 | PR-1 |
| **D15** | 미등기양도자산에 조특법 감면이 적용된다(조세특례제한법 §129② 미반영) | §77 337,750,000 → **385,000,000** | 과소 (§69 자경은 과다) | **Q-1 ✅** | PR-2 |
| **D45** | 이월과세 §97의2②2호 **자기선언 토글**이 자동 판정(D-8)을 건너뛴다 + D-8에 **배우자 예외**가 없다 | 58,378,000 → **0** (토글만 켜면) | 과소 | **Q-2 ✅** | PR-3 |
| **D16** | 중과 주택 수 산정이 §167의3①7호(5년 내 상속주택)·2호(장기임대)를 **주택 수에서** 뺀다 | 3주택 299,816,000 → **354,541,000** | 과소 (일부 과다) | V-1·V-2 선결 | PR-4 |

세율은 별도 표기가 없으면 프로덕션 fallback(`loadFallbackTransferRates`)이다. 모든 결함은 **UI 마법사로 도달**한다(API 전용 아님).

---

## 1. D9 — 동거봉양 합가 중과배제

### 1.1 법령 (KoreanLaw MCP · DRF 원문 확인)

- **소득세법 시행령 §167의10①15호**(2주택, 2023-02-28 신설) · **§167의3①13호**(3주택 이상, **2021-02-17** 신설 — 대통령령 제31442호):
  「제155조 또는 「조세특례제한법」에 따라 1세대가 국내에 1개의 주택을 소유하고 있는 것으로 보거나 1세대 1주택으로 보아
  **제154조제1항이 적용되는 주택으로서 같은 항의 요건을 모두 충족하는 주택**」
- **소득세법 시행령 §155④**(동거봉양): 「…세대를 합침으로써 **1세대가 2주택을 보유하게 되는 경우** 합친 날부터 10년 이내에 **먼저 양도하는 주택**은…」
- **구 §167의10①5호**(2023-02-27까지, 2주택): 2주택 + 합가 후 10년 — **§154① 요건 없음**. 2023-02-28 부칙(대통령령 제33267호 제10조) 적용례는 §167의10①15호에만 걸린다.
- 2021-02-17 전 3주택 목록에는 동거봉양 배제 호가 **없었다**.

⇒ 현행 배제 3이 법령과 맞았던 시점은 **2주택 · 2023-02-27 이전 양도분(§154① 축만)** 뿐이다. 주택 수 축과 3주택 이상은 처음부터 어긋났다.

### 1.2 현행 코드

- `lib/tax-engine/multi-house-surcharge-exclusion.ts:289-299` 배제 3: `parentalCareMerge`가 있고 `differenceInYears(...) < 10`이면 **즉시 배제**. 주택 수·§154①·합가 전 보유 검사 없음. 주석 근거 「§155⑦」은 오기(동거봉양은 §155④).
- 대조: 같은 파일 `:266-287` 배제 2(혼인)는 `effectiveHouseCount === 2` + `sellingHouseMeetsOneHouseRequirements ?? true`로 막는다(PR #247).
- §154① 사전 계산은 이미 `mhInput.sellingHouseMeetsOneHouseRequirements`로 들어온다(`lib/tax-engine/transfer-tax-judgment-steps.ts:44-70`) — **입력은 있는데 배제 3이 읽지 않는다**.
- 정본 형제 경로: 비과세 쪽 `checkExemption` E-3.5(`transfer-tax-exemption.ts:252-274`)는 동거봉양에 §154①을 요구한다. 그래서 **같은 사실에 두 경로가 다른 결론**을 낸다(T6: 비과세는 거부, 중과 배제는 적용 — 230,967,000).
- 기존 감사 문서 `docs/02-design/features/transfer-surcharge-155-deeming-coverage.plan.md:188`이 배제 3을 「✅ 구현」으로 판정해 놓쳤다(정정 대상).

### 1.3 재현 (fallback · 조정지역 · 8억/3억)

| # | 시나리오 | 합가 없음 | 동거봉양 | 혼인 | 법령상 |
|---|---|---|---|---|---|
| R1 | 3주택 · 2015 취득 · 거주 48개월 · 합가 2022-01-01 · 양도 2026-08-01 | 354,541,000 | **141,966,000** | 354,541,000 | 354,541,000 |
| T1 | 2주택 · 2018 조정 취득 · **거주 0**(§154① 미충족) · 양도 2026-08-01 | 299,816,000 | **155,166,000** | 299,816,000 | 299,816,000 |
| T2 | T1 + 거주 36개월(§154① 충족) — **긍정 짝** | 299,816,000 | 155,166,000 | 155,166,000 | 155,166,000 |
| T4 | 2주택 · 양도 주택을 **합가 후** 취득(2023-01-01) · 거주 36개월 | 299,816,000 | **177,166,000** | **177,166,000** | 299,816,000 |
| B1 | 합가 2016-08-01 → 양도 2026-08-01(**정확히 10년**) | 299,816,000 | **299,816,000** | 137,566,000 | 배제(10년 이내) |

- **시점축**(T1 입력, 양도일만 이동): 2023-02-27 · 2023-02-28 · 2024-06-01 · 2026-05-09는 셋 다 같다 — 중과 유예(§167의10①12호의2) 때문이다. **2026-05-10부터** 299,816,000 / 155,166,000으로 갈린다(차액 144,650,000).
- T4는 **혼인(배제 2)도 같은 결함**이다(합가 전 보유 검사 없음). B1은 반대 방향(과다) — `differenceInYears < 10`이 10년째 되는 날을 뺀다.
- 이 동작을 고정한 기존 테스트: **없음**(multi-house-surcharge 19파일·transfer-tax·api grep).

### 1.4 수정 설계

> 🔄 **v0.3 설계 정정 (V-4 실측)**: 초판은 배제 3에 게이트를 **따로 덧붙이는** 설계였다. 불완전했다 —
> 중과 엔진에는 이미 **§155 의제 성립을 비과세 정본으로 선판정해 넘기는 슬롯** `deemedOneHouseBy155`가 있고
> (`transfer-tax-judgment-steps.ts:51-56`, `resolveDeemedOneHouseBy155` — `transfer-tax-exemption-requirements.ts:583`),
> 배제 1(일시적 2주택)은 「①을 중과에서 재판정하지 않는다 — 자체 계산이 비과세와 어긋났다」는 이유로 이 슬롯만 읽는다
> (`multi-house-surcharge-exclusion.ts:242-262`). 그 함수 주석도 「현재 채우는 항은 ①뿐 — 나머지 §155 각 항은 후속」이라 적는다.
> ⇒ 게이트를 새로 쓰지 않고 **비과세 E-3.5의 합가 판정을 공용 함수로 꺼내** 이 슬롯에 동거봉양·혼인을 채운다.

1. **공용 술어 추출**: E-3.5(`transfer-tax-exemption.ts:255-275`)의 합가 의제 성립 판정 —
   2주택 · (혼인 | 동거봉양) · 먼저 양도(**토글 필수 — Q-5**) · **합가(혼인) 전 또는 당일 취득(`<=` — V-5)** · 합가일부터 10년 이내(`<=` 포함) — 를
   `qualifiesMergeDeeming(input)`(이름 가칭)으로 꺼낸다. §154① 충족은 **빼고** 반환한다(② 요소는 별도 게이트).
   비과세 E-3.5와 중과가 **같은 함수**를 부른다 → T6의 「비과세 거부 / 중과 배제」 불일치가 사라진다.
2. `DeemedOneHouseBasis`에 `"marriage_merge" | "parental_care_merge"`를 추가하고 `resolveDeemedOneHouseBy155`가 채운다.
3. 배제 2·3을 15호 한 갈래로 합친다: `effectiveHouseCount === 2 && deemedOneHouseBy155 ∈ {merge} && §154① 충족`.
   배제 2의 ⑨ 차감(`marriageSubtractionApplied`) 제외 조건은 유지한다.
4. **시점축**: 양도일 < 2023-02-28이면 구 5호(동거봉양)·구 6호(혼인) — **§154① 게이트 없이** 2주택 + 합가 전 보유 + 기한. 시점 상수는 `legal-codes`.
5. 3주택 이상 + 합가 입력 → 결과 안내 한 줄(Q-4 · F-1).
6. ⚠️ **범위 밖 — 기한 연수의 시점 분기**: 혼인 5년→10년(§155⑤ 2024-11-12 개정)과 구 6호 5년은 「1세대1주택 판정 자동화」 계획서 G-7(V-3 부칙 선결)이 다룬다.
   공용 술어의 연수는 **현행 상수(`MERGE_EXEMPTION_YEARS` = 10)를 그대로** 쓴다 — 이번 PR에서 연수를 바꾸지 않는다.

시점 상수는 `legal-codes`에 두고 manifest(`lib/legal-verification/manifest/additions-transfer.ts`)에 §167의10①15호·§167의3①13호를 등록한다. 주석 「§155⑦」 → 「§155④」.

---

## 2. D15 — 미등기양도자산 감면

### 2.1 법령

- **조세특례제한법 §129②**(현행 원문): 「「소득세법」 제104조제3항에 따른 미등기양도자산에 대해서는 양도소득세의 **비과세 및 감면**에 관한 규정을 적용하지 아니한다.」 2005·2010·2015·2024·2026판 모두 같은 규범(2010-12-27 개정으로 ②항).
- **소득세법 §91①**은 비과세만 배제한다 — 현행 코드가 근거로 삼은 조문. 감면 배제의 근거는 조특법 §129②다.
- **소득세법 시행령 §168①3호**(현행 원문 직접 확인): 「법 제89조제1항제2호, 「조세특례제한법」 **제69조제1항 및 제70조제1항에 규정하는 토지**」는 **미등기양도자산에서 제외**된다.
  ⇒ 자경농지(§69①) 감면 대상 토지는 애초에 미등기양도자산이 아니다. 「미등기 + 자경 감면」은 **모순 입력**이다.

### 2.2 현행 코드

- 감면 공통 진입 `calcReductions`(`lib/tax-engine/transfer-tax-reductions-calc.ts:118`)가 **`isUnregistered`를 받지 않는다**. 호출부 5곳 전부 영향:
  `transfer-tax-finalize.ts:310` · `transfer-tax-multi-parcel-branch.ts:148` · `transfer-tax-redevelopment.ts:386` · `transfer-tax-mixed-use-totals.ts:396` · `transfer-tax-rental-housing-step.ts:485`.
- `lib/tax-engine/transfer-reductions/`(23개 조문) · `self-farming-reduction.ts` · `public-expropriation-reduction.ts`에 `isUnregistered`·§129 참조 0건.
- 코드 주석 `transfer-tax-exemption.ts:79-83`: 「미등기를 사유로 한 감면 배제는 §91에 없다 — 감면까지 끄면 법 근거 없는 불리 적용」 — **§129②를 놓친 서술**(b4d8f5d1, 2026-08-11). 기존 계획서 `docs/02-design/features/transfer-unregistered-asset-kind-coverage.plan.md:81`이 「범위 밖」으로 보류한 항목이다(사용자가 기각한 결정 아님).
- 정상 동작(대조군): §91① 비과세 배제(`checkExemption`), 장특공 배제(`transfer-tax-helpers.ts:473-476`), 기본공제 배제.
- 입력 경로: 주 자산 토글 `app/calc/transfer-tax/steps/step4-sections/SpecialSituationSection.tsx:62-68`(§168① 안내는 `:103-111`, C-6c), 컴패니언 `components/calc/transfer/asset-sections/AssetSectionBasic.tsx:201`, 감면 입력은 Step5 `UnifiedReductionPanel`. validate·Zod에 교차 검사 0건.

### 2.3 재현

| 감면 | 시나리오 | 현행 | 법령상 | 차이 |
|---|---|---|---|---|
| §77 공익수용 | (재현자 C1·D1) | 337,750,000 | 385,000,000 | **47,250,000 과소** |
| §77의3 | 2024 | 448,999,998 | 538,999,998 | **90,000,000 과소** |
| §99 신축주택 | 9억/3억 · 2015→2024 (mock) | 273,000,000 | 462,000,000 | **189,000,000 과소** — 한도 없는 감면이라 상한이 없다 |
| §69 자경 | 토지 5억/1억 · 2012→2026 · 자경 10년 | 198,000,000 | **0**(§168①3호 → 등기 계산) | **과다** |

- 시점: `self_farming` seed의 effective_date가 2023-01-01이라 그 전 양도분은 감면 후보 자체가 없다(별개 사정).
- 이 조합을 고정한 기존 테스트: **없음**.

### 2.4 수정 설계 (Q-1 반영)

1. **엔진**: `calcReductions`에 미등기 여부를 넘기고, 미등기면 **모든 감면 후보를 0**으로 한다(조특법 §129②). 5개 호출부 전부. 감면이 0이면 농특세도 0, §133 한도 합산에서도 빠진다.
   결과 detail에 배제 사유(「조세특례제한법 §129② — 미등기양도자산」)를 싣고 결과뷰 4종에 표시한다.
2. **검증 차단(Q-1)**: 미등기 + `self_farming` 감면이면 validate(⑧)가 막는다.
   문구: 「자경농지 감면 대상 토지는 미등기양도자산이 아닙니다(소득세법 시행령 §168①3호). 미등기 체크를 해제하세요.」
   **3중 패턴**: Zod 교차 refine(API 직접 호출)도 같은 조건으로 거부한다 — 엔진이 모순 입력을 받아 조용히 해석하지 않게 한다.
3. 코드 주석 `transfer-tax-exemption.ts:79-83`과 계획서 `transfer-unregistered-asset-kind-coverage.plan.md:81`을 §129②로 정정한다.
4. 부분 미등기(일반건물 토지/건물 축 `gbLandUnregistered`·`gbBuildingUnregistered`)·컴패니언 자산 단위는 **V-6**에서 감면 배분 단위를 확인한 뒤 게이트 단위를 정한다.

---

## 3. D45 — 이월과세 §97의2②2호

### 3.1 법령 · 해석 (taxlaw.nts.go.kr 원문 직접 확인)

- **소득세법 §97의2②2호**: 「제1항을 적용할 경우 제89조제1항제3호 각 목의 주택[…고가주택…을 포함한다]의 양도에 해당하게 되는 경우」 → 이월과세를 적용하지 않는다.
- **②3호**: 이월과세를 적용한 결정세액이 적용하지 않은 결정세액보다 **적으면** 적용하지 않는다.
  ⇒ ②2호가 걸리면 **B**(이월과세 미적용), 안 걸리면 사실상 **max(A, B)**. **②2호를 더 자주 걸수록 세액은 내려가기만 한다.**
- **상태 변화(D-8의 근거)**: 사전-2016-법령해석재산-0374 — 이월과세 없이도 1세대1주택이면 ②2호를 적용하지 않는다.
- **배우자 예외(D-8에 없음)**:
  - 서면-2022-부동산-0068(부동산납세과-3383) 질의1: 「1세대 1주택에 해당하는 주택을 **배우자**로부터 증여받아 양도하는 경우 ②2호를 적용하지 않는 것」(기획재정부 재산세제과-333, 2014.4.24. 인용). 사실관계는 **이혼 후 양도**(질의3 — B 보유기간은 증여등기접수일부터).
  - 서면-2016-법령해석재산-3313 · 서면-2016-부동산-4434 · 서면-2016-부동산-3753: 「**증여일 현재** 「소득세법」 제89조제1항제3호에 따른 1세대1주택에 해당하는 주택을 배우자로부터 증여받아 이혼 후 양도하는 경우 ②2호를 적용하지 않는 것」.
  - ⇒ B가 1세대1주택 비과세에 **해당하지 않아도**(D-8 기준으로는 ②2호가 걸리는 사안) 배우자 증여 + 증여일 현재 1세대1주택이면 ②2호를 적용하지 않는다.
- 코드 주석 `lib/tax-engine/transfer-tax-carryover.ts:475-481`은 0068을 「B도 1세대1주택이면 불발동」의 근거로 인용한다 — **오독**(정정 대상).

### 3.2 현행 코드

- 토글: `components/calc/transfer/CarryoverGiftExclusionSection.tsx:122-128`(「이월과세를 적용할 경우 1세대1주택 비과세에 해당하는 경우」 — B 조건을 묻지 않는다).
- 엔진 Step 2: `lib/tax-engine/transfer-tax-carryover-eligibility.ts:85-87` — 토글이 true면 **즉시** `isEligible:false`. `transfer-tax-carryover.ts:124-140`이 곧바로 반환해 **Step 5.5(D-8, `:463-510`)에 도달하지 않는다**.
- D-8: `oneHouseExclusion = scenarioAIsOneHouse && !(resultB.isExempt || resultB.isPartialExempt)` — `donorRelation`을 보지 않는다.
- `donorRelation`은 이미 폼(`lib/stores/calc-wizard-asset-carryover.ts:91`)·같은 섹션(`CarryoverGiftExclusionSection.tsx:21,45-56`)에 있다.
- 일반건물 경로 `app/api/calc/transfer/general-building-route-carryover.ts:78-86`도 같은 Step 2 leaf를 쓰지만 카드가 `isOneHousehold: false` 하드코딩(`general-building-route-cards.ts:193-194`)이라 **현재 세액 영향 없음**.

### 3.3 재현 (OH 픽스처: 15억 · 증여자 2000-06-01 취득 1천만 · 양도 2026-02-16)

| 사례 | 자동 판정 | 토글 켬 | 법령상 |
|---|---|---|---|
| OH-2: 증여 2023-06-01 (A·B 모두 1세대1주택) | A **58,378,000** | B **0** | 58,378,000 |
| 다주택 3채 | A 402,285,000 | B **0** | 402,285,000 |
| OH-1: 증여 2025-06-01 (B 보유 8개월 — B 불해당), **배우자·증여일 현재 1세대1주택** | B 0 | B 0 | **A 58,378,000**(②2호 불적용 → A ≥ B) |

OH-1 행의 A·B 값은 재현 probe(mock 세율)의 시나리오 값이다. 배우자 예외를 넣은 엔진으로는 아직 돌리지 않았다(수정 후 anchor로 고정).

### 3.4 수정 설계 (Q-2 반영)

1. **자기선언 토글 제거** — 판정은 D-8 하나로 한다. 화면 토글은 없애고, 필드는 Q-3 레거시 플래그(`legacyOneHouseExemptionDeclared`)로 **개명**한다 — 엔진 Step 2 분기와 Zod 키는 레거시 플래그로만 남는다. 개명·삭제 지점(전수, grep):
   `lib/tax-engine/types/transfer-carryover.types.ts:91` · `transfer-tax-carryover-eligibility.ts:85-87` · `lib/api/transfer-tax-schema-base-shape.ts:391` · `lib/api/transfer-tax-building-schemas.ts:16` ·
   `lib/calc/transfer-tax-api-carryover.ts:118` · `lib/calc/transfer-tax-api-gb-carryover.ts:55,124,335` · `lib/stores/calc-wizard-asset-carryover.ts:11,120,182` · `CarryoverGiftExclusionSection.tsx:122-128`.
   테스트·E2E 참조: `__tests__/api/transfer.route.gb-carryover.predo.anchor.test.ts` · `__tests__/calc/transfer-carryover-fractional-ratio.anchor.test.ts` · `__tests__/calc/transfer-companion-carryover-apportion-key-f16.test.ts` · `__tests__/tax-engine/transfer-tax/carryover-exclusion-one-house.test.ts` · `__tests__/tax-engine/transfer/rate-104-2-2-gift-scope.anchor.test.ts` · `e2e/general-building-carryover.spec.ts`.
2. **배우자 예외 사실 입력 신설**: `carryoverTaxation.spouseGiftOneHouseAtGiftDate?: boolean`(이름은 구현 시 확정).
   - 화면: 증여자가 **배우자**일 때만 `ToggleCard` — 「증여일 현재 1세대1주택(소득세법 §89①3호)이던 주택을 배우자로부터 증여받았습니다」. 결론(「②2호 해당」)이 아니라 **사실**을 묻는다.
   - 엔진 D-8: `oneHouseExclusion = A 해당 && !B 해당 && !(donorRelation === "spouse" && spouseGiftOneHouseAtGiftDate)`.
   - 결과뷰: 「배우자 예외로 ②2호 불적용(서면-2022-부동산-0068 등)」 한 줄.
3. **기존 이력 (Q-3 — 저장 당시 세액 유지 + 전환 버튼)**:
   - **판별은 값 비교가 아니라 옛 필드의 존재로만** 한다. 저장 record의 `exclusionDeclared.oneHouseExemptionApplies === true`를
     ③ normalize(`lib/stores/calc-wizard-asset-carryover.ts:180-182`)가 **레거시 플래그** `legacyOneHouseExemptionDeclared: true`로 옮긴다.
     새 폼에는 옛 필드도, 이 플래그를 세우는 UI도 없다 ⇒ **새 계산에는 구조적으로 붙을 수 없다**.
     (문서 리뷰 critical #8 — 「스칼라 ≠ 명부」 비교 판별자가 새 계산에도 상시 붙은 함정을 반복하지 않는다.)
   - 플래그가 있으면 엔진은 **종전과 같이** Step 2에서 ②2호로 배제한다 → 저장 당시 세액이 그대로 재현된다.
   - 화면: 토글 대신 `<ToneCard tone="amber">` 「저장 당시 직접 선언한 『②2호 해당』으로 계산했습니다. 현재는 자동 판정으로 계산합니다(세액이 달라질 수 있습니다).」
     + `<Button>` 「자동 판정으로 전환」. 누르면 플래그를 지우고 재계산한다. 전환 후 저장하면 플래그가 없는 record가 되어 **다시 붙지 않는다**.
   - 결과뷰 4종에 「저장 당시 선언 기준」 한 줄.
   - ⚠️ 한계: 레거시 플래그는 API 스키마에 남으므로 API 직접 호출로는 종전 경로가 열린다. 화면에서는 새로 만들 수 없다.
4. 코드 주석 `:475-481`의 0068 인용을 정정한다(0374 = 상태 변화, 0068·3313·4434 = 배우자 예외).

---

## 4. D16 — 5년 내 상속주택·장기임대를 중과 주택 수에서 뺀다

### 4.1 법령

- **소득세법 시행령 §167의3①** 본문 괄호: 「(**제1호 또는 제12호**에 해당하는 주택은 주택의 수를 계산할 때 산입하지 않는다)」. 7호(「제155조제2항에 해당하는 상속받은 주택(상속받은 날부터 5년이 경과하지 아니한 경우에 한정한다)」)·2호(장기임대)는 **그 주택이 중과 대상에서 빠질 뿐 주택 수에는 산입**된다.
- 7호는 「**제155조제2항에 해당하는**」 상속주택에 한정된다 — §155② 단서(동일세대 상속)·순위 요건을 따른다.
- 2주택 쪽: **§167의10①10호** 「제1호부터 제7호까지의 규정에 해당하는 주택을 제외하고 1개의 주택만을 소유하고 있는 경우 그 해당 주택」 — **V-1**.
- 코드가 근거로 적은 §155⑨는 **이농주택** 조항이다(상속과 무관).

### 4.2 현행 코드

- `lib/tax-engine/multi-house-surcharge-count.ts:380-391` 배제 1(상속 5년) · `:409-428` 배제 2(장기임대): 주택 수에서 `continue`로 뺀다.
- 그래서 `multi-house-surcharge-exclusion.ts:42-60` `isGroupExcludable`의 ①②⑦ 분기(올바른 처리)가 **도달 불가**(죽은 코드) — 기존 테스트 MH-15 주석이 이를 인정한다.
- `determineSurchargeExclusion`(`multi-house-surcharge-exclusion.ts:318-383`)에 **양도 주택 자체가 5년 내 상속·장기임대**인 경우의 배제가 없다.
- 7호 경로가 `isInherited`만 보고 §155② 단서 게이트를 보지 않는다. 비과세 경로에는 이미 있다: `transfer-inheritance-exclusion.ts:37-45`(`passesHouseholdGate`·`passesRankingGate`).
- 단일 진입: `transfer-tax-judgment-steps.ts:28-77` → `determineMultiHouseSurcharge`(겸용주택 경로도 이것을 그대로 호출).

### 4.3 재현 (fallback · 조정지역 · 8억/3억 · 양도 2026-09-18)

| # | 시나리오 | 현행 | 법령상 | 방향 |
|---|---|---|---|---|
| 1 | 3주택: 일반 양도 + 일반 + 2024-01-01 상속 | 299,816,000 (count 2) | **354,541,000** (count 3) | 과소 54,725,000 |
| 2 | 긍정 짝: 3번째가 1호 지방 저가주택 | 299,816,000 | 299,816,000 | — |
| 4 | 3주택에서 **양도 주택 자체**가 5년 내 상속 | 299,816,000 | **190,366,000** | **과다** |
| 5 | 2주택 일반 + **동일세대** 상속(§155② 단서) | 141,966,000 | **299,816,000** | 과소 157,850,000 |
| 5′ | 같은 조건 3주택 | 299,816,000 | 354,541,000 | 과소 |
| 7 | 형제 결함 — 3주택 + 장기임대(2호) | 299,816,000 | 354,541,000 | 과소 |

- 수기 검산(#1): 과세표준 497,500,000 × (40% + 30%p) − 25,940,000 = 322,310,000 × 1.1 = 354,541,000.
- 시점: 2022-01-01~2022-05-09 양도분도 영향(2022-03-01: 300,410,000 vs 355,135,000). 2022-05-10~2026-05-09는 유예로 가려진다. 2021-12-31 이전은 `house_count_exclusion` seed(effective 2022-01-01)가 없어 결함 경로를 타지 않는다(V-3).
- 🔴 **주택 수 제외만 지우면 안 된다**: 2주택(일반 + 5년 내 상속, §155② 비과세 불성립)이 +20%p **과다**로 뒤집힌다 — 엔진에 §167의10①10호 일반 구현이 없다. 인접 관찰: 2주택에서 다른 주택이 사원용(§167의3①4호)이어도 현행 +20%p(299,816,000).
- 뒤집힐 기존 테스트: `__tests__/tax-engine/multi-house-surcharge/basic-exclusion.test.ts` MH-02(:77-94) · `predo-anchor.test.ts` A2(:47-59) · `__tests__/tax-engine/transfer-tax/multi-house-grace-period.test.ts` MHG-01(:33-55). `suspension-and-multi.test.ts` MH-15(:308-397)는 이 분기를 피해 가므로 **신규 케이스 추가**.

### 4.4 수정 설계 (V-1·V-2 해소 후 확정)

1. `countEffectiveHouses`에서 7호·2호의 주택 수 제외를 없앤다(1호·12호·§167의3②2호 공동상속 소수지분은 유지).
2. 3주택 이상: `isGroupExcludable` ①②⑦이 살아나 「유일한 일반주택」 판정에 참여한다.
3. 2주택: **§167의10①10호**를 일반 구현한다(V-1 원문 대조 후).
4. 양도 주택 자체가 7호·2호면 배제(`determineSurchargeExclusion`).
5. 7호 판정에 §155② 단서 게이트를 **비과세 경로와 같은 함수**로 적용한다(`transfer-inheritance-exclusion.ts:37-45` 재사용 — 단일 소스).
6. 역방향 grep 정정: `HouseEntryEditor.tsx:246`(「§167의3①7호 — 상속개시일로부터 5년 이내 주택 수 배제」) · `multi-house-surcharge-exclusion.ts:326` 주석 · `docs/02-design/features/transfer-multi-house-input.engine.design.md:18-37` · `docs/02-design/features/transfer-surcharge-155-deeming-coverage.plan.md:186` · `docs/00-pm/transfer-multi-house-input.plan.md:47`.

---

## 5. 결정 기록 (Q-n)

| ID | 질문 | 결정 | 근거 |
|---|---|---|---|
| **Q-1** ✅ | D15: 「미등기 + 자경농지 감면」이 함께 들어오면? | **검증에서 차단**(validate ⑧ + Zod refine). 엔진이 조용히 해석하지 않는다 | 2026-09-18 사용자. 소득세법 시행령 §168①3호상 모순 입력 · 기존 C-6c 정책(미등기 여부는 사용자가 판단) 유지 · 자동 안분·조용한 해석 금지 원칙 |
| **Q-2** ✅ | D45: 자기선언 토글을 어떻게? | **토글 제거 + 배우자 예외 사실 입력 추가** | 2026-09-18 사용자. 토글이 정당한 경우는 D-8이 이미 잡는다 · 국세청 해석 4건의 배우자 예외는 반대 방향(②2호 불적용) |
| **Q-3** ✅ | D45: 토글을 켜고 저장한 기존 이력을 다시 열면? | **저장 당시 세액 유지 + 「자동 판정으로 전환」 버튼**(§3.4-3). 판별은 옛 필드의 존재로만 | 2026-09-18 사용자(대안 채택). 저장된 세액을 사용자 동의 없이 바꾸지 않는다(`feedback_flipping_enum_default_rewrites_absent_records`) |
| **Q-4** ✅ | D9: 3주택 이상에서 §155① 중첩으로 §155④가 성립하는 경우 | **이번 범위 밖 · 결과 안내에 한계 명시 · 후속 F-1로 등록** | 2026-09-18 사용자(권장안). 엔진이 중첩 의제를 모델링하지 않는다. 13호 중과 배제를 직접 다룬 해석·심판례를 찾지 못했다 |
| **Q-5** ✅ | D9: 중과 배제에도 「먼저 양도」 요건을 붙이나? 법령상 요건(15호 → §155④⑤)이지만 현행 혼인 중과배제는 토글 없이 적용되고, 토글 설명은 비과세 위주다 | **토글 필수** — 비과세 E-3.5와 같은 술어. 토글 설명(`MergeDateSection.tsx:52`)을 「비과세·중과배제 모두」로 고친다. ⚠️ 토글을 체크하지 않고 혼인 중과배제를 받던 기존 계산·이력은 **세액이 오른다** — PR 본문에 명시 | 2026-09-18 사용자. 대안 (가) 명부 도출은 채택하지 않음 |
| (제안) | D45: 2016-01-01 전 양도분(②2호에 고가주택 미포함) | 범위 밖 — 경정청구 기간 경과 | 법률 제13558호 부칙 §2② |

---

## 6. 미검증 레지스터 (V-n) — 해소 전 해당 PR 착수 금지

| ID | 항목 | 방법 | 막는 PR |
|---|---|---|---|
| **V-1** ✅ | §167의10① 2주택 배제 각 호 원문 | **해소** — 10호의 「제1호부터 제7호까지」는 **§167의10① 자신의** 1~7호다. §167의3①을 끌어오는 호는 **2호**(「제167조의3제1항제2호부터 제8호까지 및 제8호의2」 — 장기임대 2·3호, **상속 5년 7호** 포함)와 12호뿐. ⇒ 2주택(일반 + 5년 내 상속)에서 일반주택 양도 → 10호 배제, 상속주택 양도 → 2호 배제. 서면4팀-588(3주택 10호 동형). 🔴 **시점 분기 필요**: 2022-01-01판(MST 236737)은 §167의3① 본문 괄호가 「제1호」만(「또는 제12호」는 2024-02-29판부터), §167의10①5·6호(합가·혼인)·8·12·13·14호가 살아 있었다(2023-02-28 제33267호에서 삭제·15호 신설). §167의3④(의무임대기간 충족 전 양도도 10호 적용)은 §167의10②로 준용 | PR-4 |
| **V-2** ✅ | 7호 「제155조제2항에 해당하는」의 범위 | **해소(일부)** — (i) 상속주택 적격(동일세대 단서·순위)은 **7호에 적용**: 서면4팀-2898 · 서면4팀-2403 · 조심-2022-부-5548 · 서울행정법원 2025구단9898(동일세대) · 서면4팀-4227(선순위 1채). **다른 주택 수는 요건 아님**: 부동산거래관리과-362(「기존 주택과 관계없이」). (ii) 일반주택 쪽 요건(상속개시 당시 보유 등)은 **해석 미확보** ⇒ 7호에 **붙이지 않는다**(세액이 오르는 방향인데 법 근거가 확인되지 않음 — `feedback_no_unfavorable_application_without_legal_basis`). 동거봉양 합가 예외의 7호 직접 적용 해석도 미확보(문언상 단서 전체 준용으로 읽힘) | PR-4 |
| **V-3** ✅ | Supabase `house_count_exclusion` effective_date | **해소** — `transfer:special:house_count_exclusion` effective_date **2022-01-01**(is_active) — fallback seed와 같다 | PR-4 시점 anchor |
| **V-4** ✅ | 「먼저 양도」 입력 경로 | **해소**: 토글 `MergeDateSection.tsx:48-57`(합가일 입력 시 노출) → `transfer-tax-api.ts:523`·`multi-transfer-tax-api.ts:294` → Zod `transfer-tax-schema-base-shape.ts:139` → `engine-input.ts:198`·`multi/route.ts:202` → 엔진. **비과세 E-3.5만 소비**하고 중과 `mhInput`에는 없다(`transfer-tax-judgment-steps.ts:43-70`). ⇒ §1.4 설계 정정 + Q-5 | PR-1 |
| **V-5** ✅ | 합가 전 보유 비교 | **해소 — `<=`**. 서면-2023-부동산-0231(부동산납세과-396, 2023.02.09.) 원문: 「주택을 취득한 날과 동거봉양하기 위하여 세대를 합친 날이 같은 날인 경우에는 … 제155조제4항을 적용할 수 있는 것」. 혼인도 부동산거래관리과-410(2012.08.01.): 같은 날이면 납세자가 선택한 순서. ⇒ E-3.5의 `<`도 결함(F-2 → PR-1 흡수) | PR-1 |
| **V-6** ✅ | 부분 미등기·컴패니언의 감면 배분 단위 | **해소** — 감면은 **엔진 카드 단위**(GB 토지/건물 축은 카드별 `isUnregistered` — `general-building-route-cards.ts:208`; 컴패니언·겸용 파트도 카드별 `finalize` 호출)라 카드의 `isUnregistered`를 넘기면 축별로 닫힌다. ⚠️ 차감형(`resolveIncomeDeduction`)은 `calcReductions` **밖** — 호출부 2곳(`transfer-tax.ts` STEP 4.6 · `transfer-tax-redevelopment.ts` Step C.5)에도 게이트 필요(미게이트 시 §99 미등기 94,500,000 과소). 겸용은 `computeMixedUsePostTax`에 플래그 전달 경로가 없었다 | PR-2 |
| **V-7** ✅ | 다건 §133 5년 합산 한도 | **해소** — M-8(`transfer-tax-aggregate-reduction-step.ts`)은 `calcReductions` 반환값만 소비한다(다른 생산자 0건). 게이트가 0을 내면 한도 계산도 0을 받는다. `priorReductionUsage`는 사용자 입력 이력이라 되먹임 없음 | PR-2 |
| **V-8** ✅ | 다건 신고단위 이월과세 상속 | **해소** — 신고단위 이월과세는 `/multi`가 아니라 **단건 route의 함께양도·일반건물 경로**에서 돈다(`calculateTransferTaxAggregate`). 자산마다 단건 `calculateTransferTax` → Step 2·Step 5.5(D-8)를 그대로 통과하고, `aggregate-carryover-scope`는 ②3호 A/B 비교만 한다(override는 Step 6에서만 쓰여 D-8을 덮지 못함). ⇒ **엔진은 단건 2곳만 고치면 물려받는다**. 배관은 ⑫(`transfer-tax-schema-base-shape.ts` · `transfer-tax-building-schemas.ts`)·④(`transfer-tax-api-carryover.ts` · `transfer-tax-api-gb-carryover.ts`) 명시 필요, ⑭는 spread라 불요. probe: OH-2 함께양도 토글 on 344,622,000 → 257,010,000(과소 폭이 단건보다 크다) | PR-3 |

---

## 7. Pre-Do anchor (수정 **전**에 작성 — 결함 케이스는 현행 값으로 RED 확인 후 기대값으로)

재현 probe 입력을 그대로 anchor로 옮긴다. 결함 케이스마다 **긍정 짝**을 함께 둔다(`feedback_negative_anchor_needs_positive_twin`).

| PR | anchor | 입력 요지 | 기대 |
|---|---|---|---|
| PR-1 | D9-A1 | R1(3주택 동거봉양) | 354,541,000 |
| PR-1 | D9-A2 / A2+ | T1(§154① 미충족) / T2(충족 — 긍정 짝) | 299,816,000 / 155,166,000 |
| PR-1 | D9-A3 | T4(합가 후 취득) — 동거봉양·혼인 둘 다 | 299,816,000 |
| PR-1 | D9-A4 | B1(정확히 10년) — 동거봉양·혼인 | 둘 다 137,566,000(배제) |
| PR-1 | D9-A5 | T1 입력 · 양도 2023-02-27(구 5호 — §154① 없음) | 배제 유지 |
| PR-1 | D9-A6 | 양도 주택 취득일 = 합가일(동거봉양·혼인) — 비과세 E-3.5와 중과 둘 다 | 비과세 성립 · 중과 배제(V-5) |
| PR-1 | D9-A7 | T6 — 동거봉양 · §154① 미충족: 비과세 거부와 중과 배제가 **같은 결론** | 둘 다 불성립 |
| PR-1 | D9-A8 / A8+ | 2주택 · 혼인 · §154① 충족 · 먼저 양도 토글 **미체크** / 체크(긍정 짝) — Q-5 | 중과 / 배제 |
| PR-2 | D15-A1~A3 | §77 · §77의3 · §99 미등기 | 감면 0 |
| PR-2 | D15-A4 / A4+ | 등기 + §77(긍정 짝) | 감면 유지 |
| PR-2 | D15-V1 | validate: 미등기 + self_farming | 차단 메시지 · Zod 거부 |
| PR-3 | D45-A1 | OH-2 — 옛 클라이언트가 토글 필드를 보내도 Zod가 제거하고 자동 판정으로 계산 | 58,378,000 |
| PR-3 | D45-A2 / A2+ | OH-1 · 배우자 · 증여일 현재 1세대1주택 true / false(긍정 짝) | A 58,378,000 / B 0 |
| PR-3 | D45-A3 | OH-1 · 직계존비속 · 같은 사실 true(배우자가 아니면 무시) | B 0 |
| PR-3 | D45-L1 | 옛 record(`oneHouseExemptionApplies: true`) 로드 → normalize → 계산 | 레거시 플래그 true · 저장 당시 세액(OH-2 입력이면 0) |
| PR-3 | D45-L2 | L1 → 「자동 판정으로 전환」 | 플래그 false · 58,378,000 · 재저장 후 재로드에도 false |
| PR-3 | D45-L3 | 새 폼(옛 필드 없음) 저장 → 재로드 — **음성 짝** | 플래그가 생기지 않는다 |
| PR-4 | D16-A1~A7 | §4.3 #1·#2·#4·#5·#5′·#7 + 2주택 일반+5년 내 상속(과다 방지 짝) | §4.3 법령상 열 |

---

## 8. 14 동기화 지점

- **D9·D16**: 엔진 내부 판정만 바뀐다 — 입력 필드 신설 없음(⑨~⑭ N/A). ⑦ 결과뷰의 배제 사유 문구·HouseEntryEditor 안내 문구만 갱신.
- **D15**: 입력 신설 없음. ⑧ validate + ⑫ Zod refine(3중 패턴), ⑦ 결과뷰 4종에 §129② 배제 표시.
- **D45**: 선언 필드 1개 → 레거시 플래그로 개명 + 배우자 예외 1개 신설 — ①폼 ②initial ③normalize(`calc-wizard-asset-carryover.ts`) ④API 변환(`transfer-tax-api-carryover.ts`·`-gb-carryover.ts`) ⑤UI(`CarryoverGiftExclusionSection.tsx`) ⑦결과뷰 ⑧validate ⑫Zod(`transfer-tax-schema-base-shape.ts:391` · `transfer-tax-building-schemas.ts:16`) ⑬body ⑭route 매핑. ⑥ 사이드바 N/A. 다건 경로(V-8) 포함.

---

## 9. PR 순서

| 순서 | PR | 범위 | 선결 |
|---|---|---|---|
| 1 | **PR-1 D9** | 합가 의제 공용 술어 추출(E-3.5 ↔ 중과) · `deemedOneHouseBy155` 확장 · 배제 2·3 → 15호 · 시점 상수 · F-2 · 토글 설명 · 겸용 배선 · 문서 정정 | ✅ **구현 완료**(§11) |
| 2 | **PR-2 D15** | `calcReductions` §129② 게이트(5개 호출부) + **차감형 2곳** + 겸용 플래그 전달 + validate·Zod + 결과 안내 + 주석 정정 | ✅ **구현 완료**(§12) |
| 3 | **PR-3 D45** | 토글 제거 + 배우자 예외 + 레거시 플래그·전환 버튼 + D-8 주석 정정 | ✅ **구현 완료**(§13) |
| 4 | **PR-4 D16** | 주택 수 산정·§167의10①10호·양도 주택 자체 배제·§155② 게이트 + 문구·문서 정정 | ✅ **구현 완료**(§14) |

각 PR은 세액이 **늘어나는** 방향이 있으므로 PR 본문에 명시한다. 구현 후 anchor마다 대응 mutation을 넣어 **그 anchor만** 실패하는지 확인한다(플레이북 `plan-design-self-review-loop`).

---

## 10. 후속 작업 (이번 PR 범위 밖 — 별건)

| ID | 내용 | 출처 | 착수 조건 |
|---|---|---|---|
| **F-1** | 3주택 이상에서 §155①(일시적 2주택)과 §155④·⑤가 겹쳐 합가 특례가 성립하는 경우의 중과 배제(소득세법 시행령 §167의3①13호) — 엔진 모델링 + anchor | Q-4 | 13호 중과 배제를 직접 다룬 국세청 해석·심판례 확보(taxlaw.nts) — 비과세 쪽 부동산거래관리과-48은 유추 근거일 뿐 |
| ~~**F-2**~~ → PR-1 | 비과세 경로 E-3.5의 합가 전 보유 비교 `acquisitionDate < mergeDate` | V-5 ✅ 결함 확정 | **PR-1에 흡수** — 공용 술어로 꺼내면 같은 함수라 따로 둘 수 없다. anchor: 취득일 = 합가일 → 비과세 성립 |
| **F-3** | `legal-codes/transfer-house.ts:38`(「§167의3 ① 2호 나목 10호」, 실제 ①10호)·`:48`(「§167의10 ⑩」, 실제 ①9호 — 9호는 양도 주택 자체 요건인데 코드는 다른 주택을 본다) 인용·적용 대상 드리프트 의심 | D16 법령 검증 잔여 의심 | 원문 대조 후 결함이면 G-n 등록 |
| ~~**F-5**~~ ✅ | `/api/calc/transfer/multi`를 API로 직접 호출하면 `carryoverTaxation`이 route 매핑(⑭)에서 조용히 빠진다 — 200 · 취득가액 0 · 양도차익 15억(probe). 화면은 ⑧(`multi-transfer-tax-validate.ts:133-135`)이 막는다 | V-8 조사 | 다건 route에 이월과세 지원을 붙이거나 ⑫에서 거부 — **해소: ⑫에서 거부**(§16, 2026-09-19) |
| ~~**F-6**~~ ✅ | 부수토지 한도 초과로 카드가 둘로 나뉘면(`bundled-companion-split.ts:214`) D-8(②2호)을 **카드마다** 판정 — 초과분 토지 카드는 A가 1세대1주택이 아니라 이월과세 비교에 남는다. ②2호 「고가주택(이에 딸린 토지를 포함한다)」에 초과분 토지가 들어가는지 법령 판단 필요. 겸용 파트 카드도 같은 구조 | V-8 조사 | 해석 확보 — **종결: 현행 카드별 판정이 조문과 정합(정면 해석 미확보)**(§17) · 배율 이내 카드는 F-13 |
| ~~**F-7**~~ ✅ | 컴패니언 일반건물은 GB 분기가 `c.isUnregistered`를 쓰지 않고 `gbv` 축만 쓰는데 컴패니언용 토지·건물 미등기 입력 UI가 없어 화면의 「미등기 양도」 토글이 무시됐다 — **재현**: 켬 184,140,000 = 끔 184,140,000(2축을 직접 켜면 310,271,500) | V-6 조사 | **해소** §18 |
| **F-14** | 사이드바 필요경비 미리보기(`calc-wizard-store.ts:382`)가 개산공제율을 **모든 자산에 폼-전역 `formData.isUnregistered`**로 고른다 — 미등기 컴패니언(자산 값)·일반건물 2축이 미리보기에 반영되지 않는다(3% vs 0.3%). 표시 전용 · 엔진 결과 무관(**확인 필요** — 수치 probe 안 함) | F-7 조사 | 자산별 미등기 축으로 율 선택 |
| ~~**F-8**~~ ✅ | §155⑳(장기임대주택 보유자 거주주택) 특례 경로에 **§91① 미등기 비과세 배제가 없다** — 미등기여도 특례가 적용된다(probe: `rentalHousingExceptionDetail.applied: true`, 15억/11억 · 세액 25,179,000). 소득세법 §91①·조특법 §129②상 비과세 불가 → 과소 방향 | PR-2 probe | 별건 PR — 법령상 기대값 probe 후 — **해소**(§15, 2026-09-19) |
| ~~**F-9**~~ ✅ | GB 부분 미등기(토지만)에서 M-8이 건물 감면을 「합산 산출세액(토지 70% 포함) × 건물 감면대상소득 / 합산 과세표준」으로 재계산한다(7,487,000 → 13,445,744). **해석 확보** — 재산세과-3820·서면5팀-57: 호가 섞이면 「각호별로 산출세액과 감면세액을 산정」한다. 원인은 게이트가 아니라 M-8의 합산 비율이다(미등기 자산에 감면이 없어도 같다) | V-6 조사 | **해소** — 계획서 `transfer-aggregate-reduction-per-clause.plan.md` §7(호별 산정 · §104⑤ 괄호) |
| **F-12** | ⑧(`validateMultiSupportedMode`)이 「단건 계산기에서만 지원」으로 막는 **다른 모드**(조합원입주권·겸용주택·일반건물/상업용·상속 신고가액 공란 등)도 `/multi`를 API로 직접 부르면 ⑭가 해당 서브객체를 매핑하지 않아 조용히 일반 양도로 계산될 수 있다 — F-5와 같은 부류(**확인 필요** · 모드별 probe 안 함) | F-5 | 모드별 route probe 후 ⑫ 거부 목록 확정 |
| ~~**F-13**~~ ✅ | 컴패니언 주택부수토지(`landNature: appurtenant_to_housing`)가 1세대1주택 비과세(§89①3호)에서 빠지고 12억 판정이 주택 카드 가액만으로 이뤄진다 — 단일 주택 입력 대비 C1 과다 8,844,000 · C2 과다 9,322,500(fallback) | F-6 조사 | **계획서** `docs/00-pm/transfer-companion-appurtenant-land-exemption.plan.md` — Q-1~Q-4 결정 후 — **해소**(Q-1 가 · 별도 계획서 v0.2 §6, 2026-09-19) |
| ~~**F-10**~~ ✅ | §167의3④ — 의무임대기간 충족 **전**에 일반주택을 양도해도 그 임대주택을 장기임대로 보아 10호(3주택)·§167의10①10호(2주택, ②로 준용)를 적용한다. 엔진은 10호 판정에서 다른 주택의 기간 충족까지 요구해 중과했다 — **재현** 299,816,000 vs 기간 충족 시 141,966,000(**157,850,000 과다**) | PR-4 | **해소** §19 |
| **F-15** | §155㉑ — 장기임대주택의 임대기간요건(·장기어린이집 운영기간요건)을 **충족하기 전에 거주주택을 양도**해도 §155⑳ 특례를 적용한다. §155⑳ 판정(`rental-housing-exception/eligibility.ts`)은 `RENTAL_PERIOD_SHORT`를 말소 특례(㉓)로만 풀고 ㉑ 처리 흔적이 없다 — 비과세 거부(과다) 의심(**확인 필요** — 수치 probe 안 함 · 조문은 로컬 캐시 MST 286211 본문으로 확인) | F-10 조사 | route probe로 재현 후 ㉑·㉒(사후 추징) 반영 |
| **F-11** | 주택 수 불산입 목록의 시점 분기 — 2022-01-01판 §167의3① 괄호는 「제1호」만(「또는 제12호」는 2024-02-29판부터). 현행 `countEffectiveHouses`의 1호 외 제외(미분양·소형 신축·세컨드홈 등)가 2022~2024 양도분에 맞는지 미확인(**확인 필요** — V-1 조사 중 발견) | V-1 | 호별 시행일 대조 |
| **F-4** | 일반건물 부담부증여 경로(`general-building-route-carryover.ts`)에 D-8 자동 판정이 없다 — 카드가 `isOneHousehold: false` 하드코딩이라 현재 세액 영향 없음 | D45 재현 | 일반건물 카드에서 1세대1주택이 성립할 수 있게 되는 변경이 생길 때 |

## 11. PR-1 (D9) 구현 기록 — 2026-09-18

**구현**
- `resolveMergeDeeming`(`transfer-tax-exemption-requirements.ts`) 신설 — §155④⑤ 의제 성립(①)의 **단일 정본**.
  2주택 · 먼저 양도(선언 필수) · 합가 전 **또는 당일** 취득 · 합가일 이후 양도 · 10년 이내(경계 포함).
  비과세 E-3.5(`transfer-tax-exemption.ts`)와 `resolveDeemedOneHouseBy155`가 함께 부른다.
- `DeemedOneHouseBasis`에 `marriage_merge`·`parental_care_merge` 추가. 중과 배제 2·3을 지우고 배제 1(15호) 한 갈래로 합쳤다
  (`multi-house-surcharge-exclusion.ts`) — ⑨ 차감(3→2) 제외, **2023-02-28 전 양도분은 구 5·6호라 §154① 게이트 없음**.
- 겸용주택 경로: `isFirstTransferredInMerge`를 route → `buildMixedUseAssetInput` → `MixedUseAssetInput` → 엔진까지 이었다.
  종전 겸용은 `householdHousingCount: 0`을 넘겨 합가 의제가 설 수 없었다(주석 근거 「2를 넣으면 §155⑦ 오판정」은 `ruralHouse` 미주입이라 해당 없음).
- Q-4 안내: 3주택 이상 + 합가 입력이면 중과 결과 `warnings`에 한계 문구(`MultiHouseSurchargeDetailCard`가 표시).
- Q-5: 토글 설명(`MergeDateSection.tsx`)에 「2주택 중과배제(§167의10①15호)」와 「합가일 이전 또는 당일 취득」 명시.
- 법령 상수: `MULTI_HOUSE.PARENTAL_CARE_MERGE_2HOUSE_BASIS` · `*_BASIS_OLD`(구 5·6호) · `MERGE_3HOUSE_OVERLAP_BASIS` · `MERGE_SURCHARGE_154_GATE_EFFECTIVE_DATE`.

**기존 테스트 계약 변경 (단언 의도는 유지)**
- 직접 호출 5건(`basic-exclusion` MH-07 · `gaps-2a-marriage` A-155-7y·10y경계 · `gaps-154-marriage-gate` C-154-met·undefined):
  중과 엔진이 의제를 재판정하지 않으므로 `deemedOneHouseBy155: resolveMergeDeeming(...)`을 넘긴다 — 날짜 조건은 그 함수가 계속 검증한다.
- `multi-house-marriage-154`: 공통 입력에 먼저 양도 선언 추가. 「보유<2년」·「단서(수용)」 두 케이스는 취득일이 **혼인 뒤**였다 —
  새 규칙에서는 합가 후 취득만으로 배제가 불성립해 §154① 게이트 구별력이 사라지므로(`feedback_new_guard_absorbs_sibling_anchor_discriminance`)
  혼인일을 취득일 뒤(2023-02-01)로 옮겨 **§154①만** 가르게 했다.

**anchor** — `__tests__/tax-engine/transfer/merge-deeming-surcharge-d9.anchor.test.ts`(파이프라인 9 + 단위 7) ·
`__tests__/api/transfer.route.mixed-use-merge-deeming-d9.anchor.test.ts`(겸용 route 4). 수정 전 결함 8건 RED · 긍정 짝 1건 GREEN 확인.

**구현 후 mutation (원본은 백업 복원 — git checkout 미사용)**

| P | 무력화 | 실패한 anchor |
|---|---|---|
| P-1 | 2주택 조건 제거 | D9-A1 · 단위 「주택 수 ≠ 2」 |
| P-2 | 먼저 양도 조건 제거 | D9-A8 · MUM-2·4 · 단위 · 기존 `merge-155-4-5` 선양도 OFF |
| P-3 | 당일 취득 불인정(`>=`) | D9-A6 · 단위 |
| P-4 | 합가 전 취득 조건 제거 | D9-A3 · 단위 · 기존 `merge-155-4-5` 합가 후 취득 |
| P-5 | 10년 경계 제외(`>=`) | D9-A4 · 단위 · A-155-10y경계 |
| P-6 | §154① 게이트 제거 | D9-A2·A5·A7 · C-154-notmet · MH154 2건 · basic-exclusion 1건 |
| P-7 | 구 5·6호 분기 제거 | D9-A5 |
| P-8 | 겸용 먼저 양도 배선 제거 | MUM-1·3·4 |
| P-9 | Q-4 안내 제거 | D9-A1 |

**게이트**: `tsc` 0건 · 전체 vitest 2,110파일 22,069건 중 실패 1건(`legal-codes-namespace-export` NS-META-2 — 새 export를 표에 등록해 해소) ·
법령 검증 커버리지 통과. **브라우저 확인은 하지 않았다** — UI 변경은 토글 설명 문구 1건이다.

**세액이 오르는 방향(PR 본문 명시)**: ① 3주택 이상 동거봉양 ② §154① 미충족 동거봉양 ③ 합가(혼인) 후 취득 주택 ④ 먼저 양도 **미선언** 혼인·동거봉양(Q-5).
**내리는 방향**: 합가일로부터 정확히 10년 되는 날(동거봉양) · 취득일 = 합가일(비과세 E-3.5, F-2) · 2023-02-28 전 §154① 미충족 혼인(구 6호).

## 12. PR-2 (D15) 구현 기록 — 2026-09-18

**법령**: 조세특례제한법 §129② 현행 원문 직접 조회(KoreanLaw MST 284389, 시행 2026-09-18) —
「「소득세법」 제104조제3항에 따른 미등기양도자산에 대해서는 양도소득세의 비과세 및 감면에 관한 규정을 적용하지 아니한다.」
상수 `TRANSFER.REDUCTION_UNREGISTERED_EXCLUSION` · manifest `additions-transfer.ts`(키워드 verbatim).

**구현 — 게이트 7곳 + 겸용 1곳 (V-6)**
- 세액감면형: `calcReductions`에 마지막 인자 `isUnregistered` — 참이면 후보·레거시 인자(`rentalReductionDetails`·`newHousingDetails`)와 무관하게 `{ reductionAmount: 0 }`.
  호출부 5곳: `transfer-tax-finalize.ts`(단건·모든 집계 카드) · `-multi-parcel-branch.ts` · `-redevelopment.ts` · `-rental-housing-step.ts` · 겸용은 아래.
- 차감형: `resolveIncomeDeduction` 호출부 2곳(`transfer-tax.ts` STEP 4.6 · `transfer-tax-redevelopment.ts` Step C.5)에 미등기면 `undefined`.
- 겸용: `MixedUsePostTaxInput.isUnregistered`(`buildTotalTax`가 채움) → 미등기면 감면 목록 전체를 비운다(차감형 고지·LTHD 특례 고지도 함께 사라짐).
- 결과 안내: `unregisteredReductionNotice` — 미등기 + 감면 선택일 때만 `warnings`에 1줄. `calculateTransferTax`가 한 번 싣고,
  조기반환 두 경로(다필지·§155⑳)는 본 경로 `warnings`를 싣지 않으므로 반환 직전에 덧붙인다. 겸용은 자체 `warnings`.
  결과뷰는 기존 `result.warnings` 렌더러(`CalculationWarningsCard` — 단건·다건, `BurdenedTransferTaxResultCard`)를 그대로 탄다. 다건 집계는 자산 라벨(`[L] …`)을 붙인다.
- Q-1: ⑧ `validateStep2Reductions` — 자경농지(`self_farming`) + 미등기면 차단(주 자산 = 폼-전역 `form.isUnregistered`, 컴패니언 = 자산 값 — ④와 같은 축).
  ⑫ `refineUnregisteredSelfFarming` — 주 자산(`addPropertyRefines`)·컴패니언(`transfer-tax-schema.ts` 일괄양도 루프) 거부.
- 정정: `transfer-tax-exemption.ts` §91① 주석(§129②를 놓친 서술) · `transfer-unregistered-asset-kind-coverage.plan.md`(「범위 밖」 → §129② 근거).

**anchor** — `__tests__/tax-engine/transfer/unregistered-reduction-129-2-d15.anchor.test.ts`(9) ·
`__tests__/api/transfer.route.unregistered-reduction-d15.anchor.test.ts`(겸용 1 · Zod 2) · `__tests__/calc/transfer-validate-unregistered-self-farming-d15.test.ts`(3).
경로마다 「미등기 + 감면 = 미등기 + 감면 없음」 동등성 + 등기 긍정 짝(감면이 실제로 붙는 입력). mock 세율 실측:

| 경로 | 미등기 + 감면 | 등기 + 감면(긍정 짝) |
|---|---|---|
| 단건 §77(토지 6억/2억) | 감면 0 · 308,000,000 | 감면 8,855,000 · 89,435,500 |
| 단건 §77의3 | 감면 0 | 34,204,000 |
| STEP 4.6 §99(차감형) | 462,000,000 = 감면 없음 | 134,166,000(감면 없음 176,286,000) |
| 다필지 §77 | 감면 0 · 안내 | 16,506,000 |
| 재개발 §77 / §99의3(차감형) | 감면 0 · 같은 세액 | 8,375,491 / 산출세액 26,086,550 |
| §155⑳ §77 | 감면 0 · 안내 | 364,500 |
| 다건 집계(토지 카드만 미등기) | 토지 카드 0 · 건물 카드 7,582,000 | 둘 다 7,582,000 |
| 겸용 route §77 | 감면 0 · 농특세 0 | 5,532,128 |

**mutation 16건 전건 KILLED** (원본 백업 복원 — git checkout 미사용)

| M | 무력화 | 실패한 anchor |
|---|---|---|
| M1 | finalize 인자 | A1·A2·A7 |
| M2 | 다필지 인자 | A4 |
| M3 | 재개발 세액감면 인자 | A5 |
| M4 | 재개발 차감형 게이트 | A5(최초 SURVIVED → §99의3 케이스 추가 후 KILLED) |
| M5 | STEP 4.6 차감형 게이트 | A3 |
| M6 | §155⑳ 인자 | A6 |
| M7 | 겸용 목록 비우기 | MU1 |
| M8 | `calcReductions` 조기 0 | A1·A2·A4~A8 |
| M9 | 본 경로 안내 | A1·A3·A5·A7 |
| M10·M11 | 조기반환 안내(다필지·§155⑳) | A4 / A6 |
| M12 | validate 차단 | V-1·V-2 |
| M13·M14 | Zod 주 자산 / 컴패니언 | V1 / V2 |
| M15 | 겸용 안내 | MU1 |
| M16 | validate 컴패니언 축(폼-전역으로 대체) | V-2 |

**게이트**: `tsc` 0건 · `__tests__/{tax-engine,api,calc,lib}` 1,649파일 18,211건 통과(법령 검증 커버리지 포함).
**브라우저 확인은 하지 않았다** — 화면 변경은 validate 차단 문구와 기존 경고 카드에 실리는 안내 1줄이다.

**세액이 오르는 방향(PR 본문 명시)**: 미등기 + 조특법 감면(세액감면형·차감형 전부) — 감면·농특세가 0이 된다.
**바뀌는 입력 계약**: 미등기 + 자경농지 감면은 화면(⑧)과 API(⑫) 모두 거부된다(종전: §69 감면이 과다 적용).

## 13. PR-3 (D45) 구현 기록 — 2026-09-18

**구현**
- 엔진: `exclusionDeclared.oneHouseExemptionApplies` → **`legacyOneHouseExemptionDeclared`**(Step 2 분기는 이 플래그로만 남는다).
  D-8(`transfer-tax-carryover.ts` Step 5.5)에 배우자 예외 — `donorRelation === "spouse" && spouseGiftOneHouseAtGiftDate`이면 ②2호 불적용.
  echo 2개: `oneHouseExclusionSource`(`legacy_declaration` / `auto`) · `spouseOneHouseExceptionApplied`.
- ③ `migrateCarryoverFields`: 옛 record의 `oneHouseExemptionApplies === true`(옛 필드 존재·참)만 레거시 플래그로 옮긴다. 새 폼에는 옛 필드도 플래그를 세우는 UI도 없다.
- ④ `buildCarryoverPayload`: 배우자 사실은 **관계가 배우자일 때만** 싣는다(관계 stale 가드) · 레거시 플래그. GB ④는 레거시 플래그 개명만(배우자 사실 미전송).
- ⑫ 단건 인라인 shape · `carryoverTaxationEngineShape`(컴패니언·GB 파트) 양쪽에 두 필드 — parity 유지. 옛 키는 strip(D45-A1).
- ⑤ `CarryoverGiftExclusionSection`: ②2호 토글 삭제 → 자동 판정 안내 1줄. 배우자 예외 **사실** 문항은 배우자 + 비-GB에서만(§97의2②2호는 주택 조항이고 GB ④는 싣지 않는다).
  관계 변경 시 함께 초기화. 레거시면 amber `ToneCard` + 「자동 판정으로 전환」(`Button`) → 플래그 false.
- ⑦ `CarryoverComparisonCard`: ②2호 출처를 echo로 구분(종전 「사용자 선언 또는 엔진 자동」 고정 문구) · 「저장 당시 선언 기준」 줄 · 배우자 예외 `ToneCard`.
- 정정: 0068 오독(「상태 변화」 근거로 인용) — `transfer-tax-carryover.ts` 주석 · `carryover-exclusion-one-house-auto.test.ts`·`burdened-gift-carryover-d5.anchor.test.ts` 머리 주석 ·
  `burdened-gift-carryover-159-97-2.plan.md` §5.10.0. (`transfer-104-2-2-gift-carryover-scope.plan.md:379`는 질의3 인용이라 정확 — 유지.)

**기존 테스트 계약 변경 (의도 유지)** — 선언 경로를 쓰던 5파일(`carryover-exclusion-one-house` · `rate-104-2-2-gift-scope` C-2 · `gb-carryover.predo` K-04 ·
`transfer-carryover-fractional-ratio` · `transfer-companion-carryover-apportion-key-f16`)은 레거시 플래그로 개명 — 레거시 경로가 종전 동작을 그대로 재현한다.
`e2e/general-building-carryover.spec.ts`는 옛 모양 sessionStorage를 시드하므로 **그대로 둔다**(③ 마이그레이션 경로를 태운다).

**anchor** (mock 세율 · OH 픽스처)
- 엔진 `carryover-spouse-exception-d45.anchor.test.ts`(5): A2 배우자 true → A 58,378,000 · A2+ false → 0(auto) · A3 직계 true 무시 → 0 · A4 B도 해당이면 echo 없음 · L0 레거시 → 0(legacy_declaration)
- route `transfer.route.carryover-d45.anchor.test.ts`(4): A1 옛 키 strip → 58,378,000 · R1 배우자 사실 도달 · R2 레거시 도달 · R3 컴패니언 shape parity
- ③④ `transfer-carryover-legacy-declaration-d45.test.ts`(4): L1·L2(전환 후 재저장·재로드에도 false)·L3(음성 짝)·S1(관계 stale 가드)
- ⑤⑦ `transfer-carryover-exclusion-section-d45.test.tsx`(6) · E2E `carryover-d45-spouse-legacy.spec.ts`(3 — UI → store)

**mutation 18건 전건 KILLED** — D-8 배우자 예외 · 관계 무시 · 레거시 분기 · ③ 옛 필드 매핑 / 존재-아닌-값 판별 · ④ 관계 가드 / 레거시 · ⑫ 단건 2필드 / 파트 shape ·
⑤ 배우자 게이트 / GB 게이트 / 관계 초기화 / 전환 버튼 · ⑦ 출처 라벨 · echo 3종.

**게이트**: `tsc` 0건 · `__tests__/{tax-engine,api,calc,lib,components}` 2,046파일 21,354건 · E2E(워크트리 `E2E_PORT`) carryover 관련 11건 통과.
브라우저 확인은 E2E(Playwright)로 UI → store 구간을 확인했다 — 계산 결과 화면까지 한 번에 태우지는 않았다(store → 세액은 route·엔진 anchor).

**세액이 오르는 방향(PR 본문 명시)**: ① 자기선언 토글을 켜서 ②2호로 B를 받던 **새 계산**(OH-2 0 → 58,378,000) ② 배우자 예외 사실을 체크한 D-8 조합(0 → A).
**그대로**: 토글을 켜고 저장한 **옛 이력**은 레거시 플래그로 저장 당시 세액을 재현 — 사용자가 전환해야 바뀐다(Q-3).

## 14. PR-4 (D16) 구현 기록 — 2026-09-19

**설계 확정(V-1·V-2·V-3 해소 후)**
- `countEffectiveHouses`에서 7호(상속 5년)·2호(장기임대) 주택 수 제외를 **삭제**. 1호·§167의3②2호(공동상속 소수지분) 등 나머지는 그대로.
- 판정 술어 2개 신설(`multi-house-surcharge-count.ts`):
  - `isSurchargeExemptInherited` — 5년 이내 + §155② 동일세대 단서·순위 게이트(비과세 경로 `passesHouseholdGate`·`passesRankingGate`를 export해 **단일 소스**).
    일반주택 쪽 요건(상속개시 당시 보유)은 해석 미확보라 붙이지 않았다(세액이 오르는 방향 · V-2).
  - `isSurchargeExemptRental` — **종전 주택 수 제외 규칙을 그대로 옮긴 술어**(유형 있으면 9유형 정밀 판정, 없으면 등록·말소 전 선언으로 인정).
    화면이 유형 없이도 장기임대를 받으므로 기준을 바꾸면 기존 입력 결과가 조용히 달라진다. 종전 3주택 판정이 쓰던 `isLongTermRentalHousingExempt`와는
    유형 없는 입력에서만 갈리는데, 그 입력은 종전에 주택 수에서 먼저 빠져 그 판정에 닿지 않았다 ⇒ 통일해도 종전 도달 사례의 결과는 같다.
- 사용처: `isGroupExcludable`·`getGroupExcludeReason`(3주택 유일한 일반주택 ②·⑦) · `determineSurchargeExclusion` 양도 주택 자체 배제
  (`inherited_house_5years` · `long_term_rental_house` — 3주택 §167의3①7호·2호 / 2주택 §167의10①2호) · **2주택 §167의10①10호**(`only_general_two_house` —
  다른 주택 1채가 `isGroupExcludable`면 양도 주택 배제. 3호·4호·7호(소송)는 기존 분기).
- 법령 상수 4개(`MULTI_HOUSE.LONG_TERM_RENTAL_EXCLUSION_BASIS` · `INHERITED_5Y_EXCLUSION_BASIS` · `TWO_HOUSE_167_3_REFERENCE_BASIS` · `TWO_HOUSE_ONLY_GENERAL`) · 결과 카드 라벨 3개.
- 문구 정정: `HouseEntryEditor` 상속·장기임대 설명 3곳(「주택 수 배제」 → 「중과 대상에서 제외 · 주택 수에는 산입」) · 설계 문서 4곳.
- 2022-01-01 전 양도분: `house_count_exclusion` 규칙(effective 2022-01-01, V-3)이 없어 정밀 경로 자체를 타지 않는다 — 변경 영향 없음.

**기존 테스트 계약 변경 (13건 · 9파일)** — 모두 결함 동작(「주택 수에서 제외」)을 단언하던 것이다. 관측점을 주택 수에서 **2주택 §167의10①10호·술어**로 옮겼고,
「미배제」 쪽 단언도 함께 바꿨다(주택 수 단언은 이제 항상 참이라 구별력이 없다):
`rental-type-matrix`(긍정 4·부정 6) · `basic-exclusion` MH-02·03 · `special-exclusions` MH-16 · `predo-anchor` A2 · `co-inherited` 우선순위(소수지분 사유로) ·
`same-sigungu` C8(주택 수 2 → 3) · `multi-house-and-nbl` T-25 · `multi-house-grace-period` MHG-01 · `review-2026-08-f01`(주택 수 1 → 3, 결론은 유일한 일반주택으로 동일).

**anchor** `__tests__/tax-engine/transfer/house-count-7-2-surcharge-d16.anchor.test.ts`(18 · fallback 세율)

| # | 시나리오 | 현행(수정 전) | 수정 후 |
|---|---|---|---|
| A1 | 3주택 일반+일반+상속 | 299,816,000 | **354,541,000** |
| A2 | 긍정 짝 3번째 1호 저가 | 299,816,000 | 299,816,000 |
| A3 | 3주택 + 장기임대 | 299,816,000 | **354,541,000** |
| A4 | 양도 주택 자체 상속(취득=상속일) | 2주택 중과 | **190,366,000**(배제) |
| A5 | 다른 두 채 7호·2호 | — | 유일한 일반주택 배제 |
| A6 | 3주택 동일세대 상속 | 299,816,000 | **354,541,000** |
| B1 | 2주택 일반+적격 상속(과다 방지 짝) | 141,966,000 | 141,966,000(10호) |
| B2 | 2주택 일반+동일세대 상속 | 141,966,000 | **299,816,000** |
| B3 | 동거봉양 합가 전 보유 예외 | — | 141,966,000 |
| B4 | 순위 부적격 | 141,966,000 | **299,816,000** |
| B7 | 2주택 일반+사원용 | 299,816,000 | **141,966,000**(10호) |
| T1 | 2022-03-01 양도 | 300,410,000 | **355,135,000** |

**mutation 12건 전건 KILLED** — 5년 경계 · 동일세대 게이트 · 순위 게이트 · 말소 · 임대 술어 엄격화 · 자체 배제 2종 · 10호 · 그룹 ⑦·② · 주택 수 제외 재도입 2종.

**게이트**: `tsc` 0건 · `__tests__/{tax-engine,api,calc,lib,components}` 2,047파일 21,372건 · 다주택 E2E 11 spec 28건(워크트리 `E2E_PORT`).

**세액이 오르는 방향(PR 본문 명시)**: 3주택 이상에서 5년 내 상속·장기임대를 뺀 채 2주택으로 계산되던 사안(+10%p) · 2주택에서 동일세대·순위 부적격 상속주택을 빼 1주택으로 보던 사안(+20%p).
**내리는 방향**: 양도 주택 자체가 5년 내 상속·장기임대 · 2주택에서 다른 주택이 사원용·조특법·국가유산·저당권·어린이집(§167의10①10호 신설).

## 15. F-8 구현 기록 — 2026-09-19

- **법령**: 소득세법 §91① 현행 원문(KoreanLaw MST 280405) — 「미등기양도자산에 대하여는 이 법 또는 이 법 외의 법률 중 양도소득에 대한 소득세의 **비과세**에 관한 규정을 적용하지 아니한다.」
  상수 `TRANSFER.EXEMPTION_UNREGISTERED_EXCLUSION` · manifest 등록.
- **형제 경로 전수**: 양도세 비과세를 내는 곳은 `checkExemption`(진입부 §91① 게이트) · STEP 1a 조기반환(`checkExemption` 결과) · 재개발(`exemptionResult` 전달) ·
  겸용주택(자체 게이트 `transfer-tax-mixed-use.ts`) · **§155⑳ 특례**(`runRentalHousingExceptionStep`)다. 게이트가 없는 것은 §155⑳ 하나였다.
- **수정**: `runRentalHousingExceptionStep` 진입부 — 미등기면 「적용 불가(§91①)」 step을 남기고 `null` → 일반 과세 경로(70%·장특·기본공제 배제).
  D15에서 §155⑳ 조기반환 결과에 덧붙이던 §129② 안내(`withUnregisteredNotice(rheResult)`)는 미등기로는 도달할 수 없게 돼 제거(일반 경로가 안내를 싣는다).
- **anchor** `__tests__/tax-engine/transfer/rental-exception-unregistered-91-f8.anchor.test.ts`(3, mock 세율):
  15억/11억 A 미등기 25,179,000 → **308,000,000**(= 특례 없는 미등기) · 10억/7억 A 미등기 0(전액 비과세) → **231,000,000** · 등기 긍정 짝 4,009,500 / 0.
  게이트 무력화 mutation → F8-1·F8-2·D15-A6 실패(KILLED).
- **세액 방향**: 오르기만 한다(미등기 + §155⑳ 입력).

## 16. F-5 구현 기록 — 2026-09-19

- **결정**: 다건 route에 이월과세 지원을 붙이지 않고 **⑫에서 거부**한다 — 화면(⑧)이 이미 「단건 계산기에서만 지원」으로 막는 제품 정책과 같고,
  지원은 신고단위 ②3호 비교·배관 전체를 여는 새 기능이다(별건).
- **수정**: `propertyItemSchema` superRefine — `acquisitionCause === "carryover_gift"` **또는** `carryoverTaxation`이 있으면 400.
  취득원인만 있어도(서브객체 없이 취득가액 0 계산) · 다른 원인에 서브객체만 stale하게 실려도 거부한다(어느 쪽도 조용히 버리지 않는다).
- 문구는 ⑧과 **같은 상수**(`lib/calc/multi-transfer-support-messages.ts` — 의존성 없는 파일. validate 파일은 `"use client"` 컴포넌트를 끌고 와 서버 스키마가 직접 import하면 안 된다).
- **호출자 전수**: `/multi` POST는 `callMultiTransferTaxAPI`(다건 계산기) 하나 — `buildPropertyPayload`는 `carryoverTaxation`을 보내지 않으므로 거부로 깨지는 흐름이 없다.
- **anchor** `__tests__/api/transfer.route.multi-carryover-reject-f5.anchor.test.ts`(4): 수정 전 F5-1~3 RED(200) · 긍정 짝 F5-4(매매 취득 200) GREEN 확인 후 구현.
- **세액 방향**: 없음(API 직접 호출의 조용한 오산을 400으로 바꾼다).

## 17. F-6 종결 기록 — 2026-09-19

- **질문**: 배율 초과 부수토지 카드·겸용주택 상가 파트 카드를 §97의2②2호에서 주택 카드와 따로 판정하는 것이 맞는가.
- **조사**: 정면 해석(국세청·심판원·판례)은 **0건**(KoreanLaw · taxlaw.nts 통합검색). 근거의 무게는 **별개자산설(현행)** 쪽이다 —
  - 문언: §89①3호 비과세 대상은 「각 목의 주택」과 「주택부수토지(배율 이내)」뿐 — 초과 토지는 둘 다 아니다. 겸용주택(주택 ≤ 비주택)의 비주택 부분은 시행령 §154③ 단서가 「주택으로 보지 아니한다」.
  - 같은 괄호 문구 「고가주택(이에 딸린 토지를 포함한다)」(§95③)에 대한 국세청 해석이 기준면적 초과분을 고가주택 단위 밖으로 뗀다(재산세과-1485 · 부동산거래관리과-97 외).
    초과분에는 주택 중과가 아닌 비사업용 토지 세율(사전-2026-법규재산-0075).
  - 취지: ②2호는 이월과세로 비과세를 만들어내는 것을 막는다(재산세제과-333 · 0374 · 0068 등 일관) — 초과 토지는 이월과세 여부와 무관하게 비과세가 될 수 없다.
  - 반대 해석(거래단위설 — 주택이 ②2호에 걸리면 초과 토지도 배제)은 세액을 대체로 낮추는 방향이나 직접 근거가 없다.
- **결론**: 현행 유지. anchor `__tests__/api/transfer.route.carryover-split-card-f6.anchor.test.ts`가 「주택 카드 ②2호 배제 · 초과분 카드 이월과세 유지」를 고정한다.
- **곁가지 → F-13**: probe 중 배율 **이내** 카드가 1세대1주택 비과세·12억 판정에서 빠지는 것을 발견 — ②2호 잔여(배율 이내 카드가 주택을 따르는가)도 그 계획서 Q-4로 넘겼다.

## 18. F-7 구현 기록 — 2026-09-19

- **재현**(route probe): 주 자산 주택 + 컴패니언 일반건물(환산). 컴패니언 단일 토글을 켜도 총결정세액 **184,140,000 = 끈 것과 같다**.
  `generalBuildingValuation.unregisteredLand·unregisteredBuilding`을 직접 켜면 310,271,500 — 엔진 GB 축(카드별 70%·장기보유공제 배제)은 이미 맞고 **입력 경로만 막혀 있었다**.
- **원인**: 컴패니언 `general_building`은 2026-09-03에 열렸는데(⑩ enum) ⑤ 컴패니언 미등기 토글은 단일 축(`isUnregistered`) 그대로였다. 스토어 주석도 「컴패니언 enum에 GB 없음」으로 stale.
- **수정**:
  - ⑤ `AssetSectionBasic.tsx` — 일반건물 컴패니언은 「토지 미등기 양도」·「건물 미등기 양도」 2축(주 자산 `SpecialSituationSection`과 같은 필드). 단일 토글은 GB가 아닐 때만.
  - 옛 기록의 단일 값: 어느 파트인지 알 수 없어 **자동으로 옮기지 않는다**. 안내 카드(amber)가 「토지·건물 모두 미등기로 옮기기」·「이전 값 지우기」를 준다.
  - ⑧ `validateAssetEntry` — 컴패니언(index > 0) GB에 단일 값이 남아 있으면 차단. 지분 분할(축 B)은 제외(① 기본정보가 숨겨져 해소 경로가 없고 `companionAssets`도 만들지 않는다).
  - ⑩ `refineCompanionGbUnregisteredAxis` — `companionAssets[i]`가 GB이고 `isUnregistered: true`면 400(API 직접 호출도 조용히 빠지지 않게).
- **anchor**: `__tests__/api/transfer.route.companion-gb-unregistered-f7.anchor.test.ts`(7 — 대조군 184,140,000 · 토지만 · 2축 310,271,500 · ⑧/⑩ 차단 · 긍정 짝(토지 컴패니언 단일 값 70%) · 축 B 제외 · 주 자산 제외),
  `__tests__/components/transfer-companion-gb-unregistered-f7.test.tsx`(6), E2E `e2e/transfer-companion-gb-unregistered-f7.spec.ts`(2).
- **mutation 8/8 KILLED** — UI 단일 토글 복귀 · 2축 제거 · ⑧ 제거 · ⑧ 축 B 가드 제거 · ⑧ index 가드 제거 · ⑩ 제거 · 옮기기 버튼 오기 · 카드 토지 축 누락.
- **세액 방향**: 증가(컴패니언 일반건물 미등기가 70%로 계산된다). 옛 기록은 해소 전까지 계산이 막힌다.
- **곁가지 → F-14**(사이드바 개산공제 미리보기의 미등기 축).

## 19. F-10 구현 기록 — 2026-09-19

- **법문**: 소득세법 시행령 §167의3④ 「제1항제2호부터 제4호까지 또는 제8호의2에 따른 장기임대주택등의 의무임대기간등의 요건을 충족하기 전에 일반주택을 양도하는 경우에도 … 장기임대주택등으로 보아 제1항제10호를 적용한다」. 2주택은 §167의10②가 §167의3②~⑧을 준용한다(현행 2026-07-01 시행본 직독).
- **재현**(세액 · 2026-09-18 양도 — 한시 유예 종료 후): 일반주택 + 마목 임대주택(임대 3년, 요건 8년) → **299,816,000**(중과). 같은 임대주택이 8년이면 141,966,000. 2024-06-01 양도는 한시 유예(2022.5.10~2026.5.9)라 셋 다 150,766,000으로 구별력이 없었다.
- **수정**:
  - `isLongTermRentalDutyPeriodPending`(count): 판정기 실패 코드가 `RENTAL_PERIOD_SHORT` **하나뿐**일 때만 참 — 등록·등록상한(2018.4.2)·기준시가·임대료 5% 등 다른 요건은 그대로 요구. 사목(말소 게이트)은 대상 아님. 등록상한 게이트는 `passesRegistrationCap`으로 추출해 기존 술어와 공유.
  - `dutyPeriodPendingReason`·`isExcludableForGeneralHouse`·`getGeneralHouseExcludeReason`(exclusion): 2호 임대 · 3호 감면임대(5년 미만) · 4호 사원용(10년 미만) · 8의2호 어린이집(5년 미만).
  - 10호 판정 두 곳(2주택 `only_general_two_house` · 3주택 `only_one_remaining`)만 이 술어를 쓴다. **양도 주택 자신**의 2호 판정(`isSurchargeExemptRental`)은 그대로 — ④는 일반주택 양도에만 걸린다.
  - §167의3⑤(요건 미충족 시 차액 신고·납부) 안내를 ④가 쓰였을 때만 경고로 띄운다. 조문 인용은 `MULTI_HOUSE.DUTY_PERIOD_PENDING_BASIS`·`_CLAWBACK_BASIS` 상수.
- **anchor** `__tests__/tax-engine/multi-house-surcharge/duty-period-pending-167-3-4-f10.anchor.test.ts`(9): 수정 전 RED 5 · 대조 GREEN 3(기간 충족 · 5% 위반 · 임대주택 자신 양도) 확인 후 구현. 세액 동등성(기간 미충족 = 기간 충족) + 구별력 가드.
- **mutation 12/12 KILLED**.
- **세액 방향**: 감소(과다 중과 해소). 회귀 — 양도세 895 · 다주택 21파일 불변.
- **곁가지 → F-15**(§155㉑ — 비과세 축의 같은 부류).

## 부록. 변경 이력

| 버전 | 날짜 | 내용 |
|---|---|---|
| v0.1 | 2026-09-18 | 최초 작성 — 재현 워크플로 결과(결함 4건 전건 재현, 반박 검증 8건) + Q-1·Q-2 결정 반영 |
| v0.2 | 2026-09-18 | **Q-3 대안 채택**(저장 당시 세액 유지 + 전환 버튼 — 판별은 옛 필드 존재로만, anchor L1~L3) · **Q-4 권장안 채택**(범위 밖 + 결과 안내) · §10 후속 작업 F-1~F-4 신설 |
| v0.3 | 2026-09-18 | **V-4·V-5 해소** — §1.4 설계 정정(배제 3에 게이트 덧붙이기 → E-3.5 합가 판정을 공용 술어로 꺼내 `deemedOneHouseBy155`에 채움), F-2를 PR-1에 흡수, Q-5(먼저 양도 요건) 신설 |
| v0.3′ | 2026-09-18 | **Q-5 확정 — 토글 필수**(기존 미체크 혼인 중과배제는 세액 증가 · PR 본문 명시) · anchor D9-A8 |
| v0.4 | 2026-09-18 | **PR-1(D9) 구현** — §11 구현 기록·mutation 9건·세액 방향 |
| v0.13 | 2026-09-19 | **F-10 해소**(§19 — §167의3④ 10호 의제) · 후속 F-15(§155㉑) |
| v0.12 | 2026-09-19 | **F-9 해소** — 다건 감면 호별 산정(재산세과-3820) + §104⑤ 괄호 감면 후 비교(별도 계획서 §7) |
| v0.11 | 2026-09-19 | **F-7 해소**(§18 — 컴패니언 GB 미등기 2축 입력 · ⑧⑩ 옛 값 차단) · 후속 F-14 |
| v0.10 | 2026-09-19 | **F-6 종결**(§17 — 현행 정합 · 해석 미확보) · **F-13 신설**(별도 계획서) |
| v0.9 | 2026-09-19 | **F-5 해소**(§16 — ⑫ 거부) · 후속 F-12 |
| v0.8 | 2026-09-19 | **F-8 해소**(§15) — §155⑳ 경로 §91① 게이트 |
| v0.7 | 2026-09-19 | **PR-4(D16) 구현**(§14) · 후속 F-10·F-11 |
| v0.6 | 2026-09-18 | **PR-3(D45) 구현**(§13) · 0068 오독 정정 3곳 |
| v0.5 | 2026-09-18 | PR-1 머지(#1689) · **V-1~V-3·V-6~V-8 해소**(§6) · **PR-2(D15) 구현**(§12 — 차감형 2곳·겸용 경로를 설계에 추가) · 후속 F-5~F-9 신설 |
