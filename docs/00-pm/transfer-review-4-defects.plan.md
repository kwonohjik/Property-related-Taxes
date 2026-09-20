# 양도세 리뷰 발견 결함 4건 — 수정 계획서 (v0.23)

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
| **Q-4** ✅ | D9: 3주택 이상에서 §155① 중첩으로 §155④가 성립하는 경우 | **이번 범위 밖 · 결과 안내에 한계 명시 · 후속 F-1로 등록** | 2026-09-18 사용자(권장안). 엔진이 중첩 의제를 모델링하지 않는다. 13호 중과 배제를 직접 다룬 해석·심판례를 찾지 못했다 — **2026-09-20 해소**(§24: 국세청 해석 확보 후 두 축 모두 구현) |
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
| ~~**F-1**~~ ✅ | 3주택 이상에서 §155①(일시적 2주택)과 §155④·⑤가 겹쳐 합가 특례가 성립하는 경우의 중과 배제(소득세법 시행령 §167의3①13호) — 엔진 모델링 + anchor | Q-4 | **해소** §24 |
| ~~**F-2**~~ → PR-1 | 비과세 경로 E-3.5의 합가 전 보유 비교 `acquisitionDate < mergeDate` | V-5 ✅ 결함 확정 | **PR-1에 흡수** — 공용 술어로 꺼내면 같은 함수라 따로 둘 수 없다. anchor: 취득일 = 합가일 → 비과세 성립 |
| ~~**F-3**~~ ✅ | `legal-codes/transfer-house.ts:38`(「§167의3 ① 2호 나목 10호」, 실제 ①10호)·`:48`(「§167의10 ⑩」, 실제 ①9호 — 9호는 양도 주택 자체 요건인데 코드는 다른 주택을 본다) 인용·적용 대상 드리프트 의심 | D16 법령 검증 잔여 의심 | **해소** §25 |
| ~~**F-5**~~ ✅ | `/api/calc/transfer/multi`를 API로 직접 호출하면 `carryoverTaxation`이 route 매핑(⑭)에서 조용히 빠진다 — 200 · 취득가액 0 · 양도차익 15억(probe). 화면은 ⑧(`multi-transfer-tax-validate.ts:133-135`)이 막는다 | V-8 조사 | 다건 route에 이월과세 지원을 붙이거나 ⑫에서 거부 — **해소: ⑫에서 거부**(§16, 2026-09-19) |
| ~~**F-6**~~ ✅ | 부수토지 한도 초과로 카드가 둘로 나뉘면(`bundled-companion-split.ts:214`) D-8(②2호)을 **카드마다** 판정 — 초과분 토지 카드는 A가 1세대1주택이 아니라 이월과세 비교에 남는다. ②2호 「고가주택(이에 딸린 토지를 포함한다)」에 초과분 토지가 들어가는지 법령 판단 필요. 겸용 파트 카드도 같은 구조 | V-8 조사 | 해석 확보 — **종결: 현행 카드별 판정이 조문과 정합(정면 해석 미확보)**(§17) · 배율 이내 카드는 F-13 |
| ~~**F-7**~~ ✅ | 컴패니언 일반건물은 GB 분기가 `c.isUnregistered`를 쓰지 않고 `gbv` 축만 쓰는데 컴패니언용 토지·건물 미등기 입력 UI가 없어 화면의 「미등기 양도」 토글이 무시됐다 — **재현**: 켬 184,140,000 = 끔 184,140,000(2축을 직접 켜면 310,271,500) | V-6 조사 | **해소** §18 |
| ~~**F-14**~~ ✅ | 사이드바 필요경비 미리보기(`calc-wizard-store.ts:382`)가 개산공제율을 **모든 자산에 폼-전역 `formData.isUnregistered`**로 고른다 — 조사 결과 그 함수는 **화면 소비처가 없었고**(#487), 렌더되는 자산별 행에 다른 결함 2건이 있었다 | F-7 조사 | **해소** §22 |
| ~~**F-8**~~ ✅ | §155⑳(장기임대주택 보유자 거주주택) 특례 경로에 **§91① 미등기 비과세 배제가 없다** — 미등기여도 특례가 적용된다(probe: `rentalHousingExceptionDetail.applied: true`, 15억/11억 · 세액 25,179,000). 소득세법 §91①·조특법 §129②상 비과세 불가 → 과소 방향 | PR-2 probe | 별건 PR — 법령상 기대값 probe 후 — **해소**(§15, 2026-09-19) |
| ~~**F-9**~~ ✅ | GB 부분 미등기(토지만)에서 M-8이 건물 감면을 「합산 산출세액(토지 70% 포함) × 건물 감면대상소득 / 합산 과세표준」으로 재계산한다(7,487,000 → 13,445,744). **해석 확보** — 재산세과-3820·서면5팀-57: 호가 섞이면 「각호별로 산출세액과 감면세액을 산정」한다. 원인은 게이트가 아니라 M-8의 합산 비율이다(미등기 자산에 감면이 없어도 같다) | V-6 조사 | **해소** — 계획서 `transfer-aggregate-reduction-per-clause.plan.md` §7(호별 산정 · §104⑤ 괄호) |
| ~~**F-12**~~ ✅ | ⑧(`validateMultiSupportedMode`)이 「단건 계산기에서만 지원」으로 막는 **다른 모드**도 `/multi`를 API로 직접 부르면 조용히 일반 양도로 계산될 수 있다 — 조사 결과 **화면 경로에도** 같은 부류가 있었다(§164⑨·소유자 분리) | F-5 | **해소** §21 |
| ~~**F-13**~~ ✅ | 컴패니언 주택부수토지(`landNature: appurtenant_to_housing`)가 1세대1주택 비과세(§89①3호)에서 빠지고 12억 판정이 주택 카드 가액만으로 이뤄진다 — 단일 주택 입력 대비 C1 과다 8,844,000 · C2 과다 9,322,500(fallback) | F-6 조사 | **계획서** `docs/00-pm/transfer-companion-appurtenant-land-exemption.plan.md` — Q-1~Q-4 결정 후 — **해소**(Q-1 가 · 별도 계획서 v0.2 §6, 2026-09-19) |
| ~~**F-10**~~ ✅ | §167의3④ — 의무임대기간 충족 **전**에 일반주택을 양도해도 그 임대주택을 장기임대로 보아 10호(3주택)·§167의10①10호(2주택, ②로 준용)를 적용한다. 엔진은 10호 판정에서 다른 주택의 기간 충족까지 요구해 중과했다 — **재현** 299,816,000 vs 기간 충족 시 141,966,000(**157,850,000 과다**) | PR-4 | **해소** §19 |
| ~~**F-15**~~ ✅ | §155㉑ — 장기임대주택의 임대기간요건(·장기어린이집 운영기간요건)을 **충족하기 전에 거주주택을 양도**해도 §155⑳ 특례를 적용한다. §155⑳ 판정(`rental-housing-exception/eligibility.ts`)은 `RENTAL_PERIOD_SHORT`를 말소 특례(㉓)로만 풀고 ㉑ 처리 흔적이 없다 — 비과세 거부(과다) 의심(**확인 필요** — 수치 probe 안 함 · 조문은 로컬 캐시 MST 286211 본문으로 확인) | F-10 조사 | **해소** §23 |
| ~~**F-11**~~ ✅ | 주택 수 불산입 목록의 시점 분기 — 확인 결과 결함 5건(시점 3 · 근거 없음 2) | V-1 | **해소** §20 |
| ~~**F-16**~~ ✅ | §167의10①3호(부득이 취득)·7호(소송 취득)를 **양도 주택 자신**에는 적용하지 않는다 — 각 호는 「양도하는 주택」을 가리키는데 코드는 다른 주택만 본다. **실측**(조정지역 2주택·2026-08-01): 양도 주택이 소송 취득(2년 전)이면 `surchargeApplicable: true`(중과), 같은 주택이 다른 주택이면 배제. 부득이(3호)도 같다 — 과다 방향 | F-3 조사 | **해소** §26 |
| ~~**F-17**~~ ✅ | 7호의 3년 기산점이 법문과 다르다 — 「소송으로 인한 **확정판결일**부터 3년」인데 필드·라벨·주석이 모두 「소송 **취득일**」이다(`litigationAcquisitionDate`). 확정판결일 ≤ 등기 취득일이라 사용자가 취득일을 넣으면 창이 늦게 시작해 배제가 과하게 유지된다 — **과소** 방향 | F-16 조사 | **해소** §27(문구·라벨 정정 · 필드명은 legacy 유지) |
| ~~**F-18**~~ ✅ | 일반건물 결과 카드·상세명세서가 개산공제율을 **「3%」로 하드코딩**한다 — §163⑥1호 단서의 미등기양도자산(3/1000)에서 **적힌 산식이 적힌 값을 만들어내지 못한다**. **실측**: base 238,000,000 · 개산공제 714,000인데 화면은 「238,000,000 × 3%」(= 7,140,000). 엔진은 맞다 — **표시 축**이라 세액 영향 없음 | 미확인 항목 조사 | **해소** §28 |
| ~~**F-19**~~ ✅ | 부담부증여 GB 상세명세서가 K-4(실지취득가) 경로에서도 「안분 취득가액 × N% (개산공제, §163⑥)」라 적는다 — 그 경로의 필요경비는 개산공제가 아니라 **안분 실비**(자본적지출·양도비)다. §97②2호 swap 경로도 같다. 표시 축(세액 무관) | F-18 조사 | **해소** §29 |
| ~~**F-20**~~ ✅ | GB 상세명세서 **증축(건물2)** 산식의 base가 `acqExtensionStdTotal`(100% 값)이라 **지분 자산에서 산식이 자기 값을 못 만든다** — 토지·건물1은 `landBase`·`buildingBase` echo로 이미 해결된 축인데 증축분만 빠졌다. 표시 축(세액 무관) · **수치 probe 미수행** | F-18 조사 | **해소** §29 — **실측 결과 토지·건물1 base echo도 증축 경로에선 빠져 있었다** |
| **F-21** | GB 상세명세서가 **토지·건물1의 실가 파트**(§163⑨ 상속·증여 평가액·파트별 실지거래가액)에서도 「취득시 기준시가 × N%」라 적을 수 있다 — 그 파트는 개산공제가 아니다(엔진 `landUsedEstimated`·`building1UsedEstimated`가 신호). F-19와 같은 축인데 증축·부담부증여만 닫았다. 표시 축(세액 무관) · **수치 probe 미수행** | F-19 구현 | 별건 — base echo를 「개산공제 경로 신호」로 겸용하면 옛 이력의 base 부재와 구별이 안 된다(별도 플래그가 필요할 수 있다) |
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

## 20. F-11 구현 기록 — 2026-09-19

**법령 대조**: DRF `eflaw`(`LM`+`efYd`)로 소득세법 시행령 2021-01-01~2028-01-01 **전 시행본**의 §167의3① 괄호를 찍었다 —
「제1호」(~2024-02-28) → 「제1호 **또는 제12호**」(2024-02-29~). 2024-01-01 시행본의 12호는 「삭제<2023.2.28>」.

| # | 결함 | 법령 | 수정 |
|---|---|---|---|
| A | 12호 가·나목(소형 신축·준공 후 미분양) 불산입·중과배제에 양도일 조건이 없었다 | 2024.2.29 개정(제34265호) 부칙 §11① 「이 영 시행 이후 주택을 **양도**하는 경우부터」 | `isSmallNewHouseSpecial(house, transferDate)` — 2024-02-29 전 양도면 false |
| B | 12호 나목2) 취득가액을 늘 7억으로 봤다 | 2026.2.27 개정 부칙 §11 「이 영 시행 이후 … **취득**하는 경우부터」 — 그 전 6억 | 2026-02-27 전 취득 6억 · 이후 7억 |
| C | 12호 다·라목(세컨드홈)에 취득일·양도일 조건이 없었다 | 2026-02-27 시행본에서 신설 · 호 본문 「2026년 1월 1일 이후 **취득**하는 주택」 | 취득 ≥ 2026-01-01 · 양도 ≥ 2026-02-27 |
| D | 「미분양주택」을 주택 수에서 뺐다 | 조특법 §98의2·98의3·98의5~98의8·99·99의2·99의3은 「소득세법 제89조제1항제3호를 적용할 때」만 소유주택 제외(현행 조특법 전수 확인) · 영 §167의3①5호는 **중과 대상에서만** 제외 | 산입 + ①5호 — 양도 주택 자신 배제(`tax_special_exemption`) · 10호 판정 `isGroupExcludable`. 화면 라벨 「조특법 감면주택(미분양·신축)」(사용자 결정 2026-09-19) |
| E | 주거용 오피스텔 「2022.1.1 전 취득분」을 뺐다 | 양도세에 그런 경과규정 없음 — 심사-양도-2020-0038(2020.8.26) · 조심-2023-서-10142(2024.3.19)가 3주택 판정에 산입 | 불산입 삭제. `rules.officetelStartDate`는 DB 데이터 호환을 위해 필드만 남기고 `@deprecated` |

- **세액 방향**: A·B·C·D·E 모두 주택 수가 늘거나 같아지는 쪽 — 중과 단계가 오를 수 있다(세액 증가). D는 대신 10호·양도 주택 5호 배제가 생긴다.
- **anchor** `__tests__/tax-engine/multi-house-surcharge/house-count-era-f11.anchor.test.ts`(11): 수정 전 RED 8 · 대조 GREEN 3.
- **기존 테스트 정정**: 결함을 고정하던 MH-11(미분양 불산입)·MH-12(오피스텔 경과규정)는 법령대로 반전. 세컨드홈 테스트 9건은 **단언은 두고 날짜만** 법령 적용 구간(2026.1.1 이후 취득 · 2026.2.27 이후 양도)으로 옮겼다 — 날짜 게이트가 지역·가액·등록 축의 구별력을 흡수하지 않도록 형제 「산입」 테스트도 함께 옮겼다.
- **mutation 9/9 KILLED** · 회귀 양도세 896 · 다주택 22파일 · E2E(다주택 상세·혼인) 14건 통과.

## 21. F-12 구현 기록 — 2026-09-19

**조사**: 다건 스키마(⑫ `propertyItemSchema`) 139키 중 **69키**를 ⑭(multi route)가 옮기지 않았다(정적 대조). ⑬도 그 키를 만들지 않아
API 직접 호출뿐 아니라 **⑧이 막지 않는 화면 입력**까지 엔진에 닿지 않았다. 단건 ④·다건 ⑬이 같은 폼에서 만드는 본문을 가로채 두 route에 넣어 비교했다(probe):

| 화면 입력 (⑧ 통과) | 단건 | 다건(수정 전) |
|---|---|---|
| §164⑨1호 공익수용 — 토지 ㎡단가 · 주택 총액 | 49,293,200 | 85,868,200 (+36,575,000) |
| §164⑨2호 공매·경락 | 49,293,200 | 85,868,200 (+36,575,000) |
| 소유자 분리 — 토지만 본인(소령 §166⑥·§168②) | 29,216,000 | 35,953,500 (+6,737,500) |
| 토지·건물 취득일 분리(§166⑥) | 27,291,000 | ⑧ 차단 |

- 차이 없음(probe): 단순 토지·신축 4-시점·단독 토지 `landNature`·상속 신고가액(의제 전후)·환산 토지 — 그리고 ⑧이 막지만 ⑭가 **매핑은 하는** 다필지(62,711,000)·용도변경(47,245,000)·보유 감면주택 제외(47,245,000)는 API 직접 호출도 단건과 같다.
- 다른 부류: §98계 감면은 ⑭가 옮기지만 합산이 세율 특칙을 잃는다(단건 83,500,000 ↔ 다건 141,060,000 — 기존 anchor `multi-block-reason-rate-special`). ⑧만 막고 있었다.

**결정**(사용자, 2026-09-19): §164⑨·소유자 분리 모두 **다건에 연결**. 소유자 분리를 연결하면서 같은 분리 경로인 취득일 분리의 ⑧ 차단도 풀었다 — 합산 엔진은 이미 분리 자산을 파트 단위로 §104⑤에 넣는다(P13).

**수정**
- ⑬ `buildPropertyPayload` — 단건 ④와 **같은 leaf**: `buildExpropriationInput` · `buildSplitPayload`(게이트 `isSplitPayloadActive`) · `buildNewConstructionPayload`(부수토지 한도) · 분리 모드의 `standardPriceAtAcquisition`.
  단건 ④의 인라인 두 블록(토지 ㎡단가·면적, 토지 파트 취득원인 G-4)은 leaf(`buildLandStdAtAcquisitionPayload`·`buildLandPartCausePayload`, `transfer-tax-api-split.ts`)로 꺼내 두 클라이언트가 같이 쓴다.
- ⑭ multi route — §164⑨ 11키 · 분리 24키 · 토지 ㎡단가·면적 · 부수토지 한도 3키(날짜 4개 `toOptionalDate`).
- ⑫ `transfer-tax-schema-multi-refines.ts`(신설) — 합산이 처리하지 못하는 서브객체 모드 거부: 부담부증여·§166·겸용·일반/상업건물·PHD·상속 평가·가업상속·일괄양도·§98계 감면(F-5 이월과세도 이 파일로 옮김). 문구는 ⑧과 같은 상수(`multi-transfer-support-messages.ts`).
  옮기지 않는 나머지 13키는 **근거와 함께** 무효과로 분류했다(일괄양도 안분 입력 · 신축 4-시점 · 엔진 미소비 · 단독 자산 `landNature`).
- ⑧ 취득일 분리 차단 삭제.

**가드** `__tests__/api/transfer.route.multi-key-coverage-f12.test.ts` — 스키마의 **모든 키**가 ⑭ 매핑·⑫ 거부·무효과 중 하나(정적 스캔). 새 키를 넣고 ⑭를 잊으면 실패한다.

- **anchor** `__tests__/api/transfer.route.multi-single-only-keys-f12.anchor.test.ts`(14): 화면 경로 세액 5 · 대조 1 · 본문 동치 4(⑬ ↔ ④ 키·값) · API 거부 3 + 대조 1. 수정 전 RED 7(F12-1~5 · R1·R2), 대조 GREEN.
- **기존 테스트 정정**: H-2 차단 표의 「토지건물분리」 행을 통과 짝으로 옮겼다(`multi-transfer-api-sync.test.ts`).
- **mutation 18/18 KILLED** — 첫 회 14/18(⑬이 보내는 값 4개를 세액 anchor가 쓰지 않았다) → 본문 동치 anchor 추가 후 전건.
- **세액 방향**: 다건 화면에서 §164⑨·소유자 분리를 쓴 계산은 **세액이 줄어든다**(단건과 같아진다). API 직접 호출은 해당 모드가 400이 된다.
- **남은 것**: 브라우저 수동 확인 안 함(UI 변경 없음 — ⑧ 통과 조건만 바뀜).

## 22. F-14 구현 기록 — 2026-09-19

**조사 정정**: F-14가 가리킨 `computeTransferSummary().totalNecessaryExpense`는 #487(사이드바 자산별 요약) 이후 **화면 소비처가 없다**(소비처는 테스트뿐).
사이드바가 렌더하는 것은 자산별 행(`computeTransferPerAssetSummary`)이고, 거기서 재니 결함 모양이 달랐다(probe · 엔진은 route 실측):

| 입력 | 자산별 행(표시) | 합계(미렌더) | 엔진 |
|---|---|---|---|
| D1 자산 1건 환산 · 미등기 — 계산 전 | 3,000,000 (`0.03` 하드코딩) | 300,000 | 300,000 |
| D1 분양권 환산(§163⑥4호 1%) — 계산 전 | 3,000,000 | 1,000,000 | 1,000,000 |
| D1 환산 + 자본적지출 입력 — 계산 전 | 7,000,000 (폼 경비) | 3,000,000 | 3,000,000 |
| D2 자산 1건 환산 + 자본적지출 — **계산 후** | 7,000,000 | 3,000,000 | 3,000,000 |
| D2 일괄양도 환산(주 등기 + 컴패니언 미등기) — **계산 후** | 0 · 0 (「-」) | 6,000,000 | 3,000,000 · 300,000 |
| 일반건물 환산 · 토지 미등기 | 3,600,000 ✅ | 0 | 3,600,000 |

- F-14 본래 주장(자산별 미등기 축)은 표시 층에서는 성립하지 않았다 — 자산이 여럿이면 계산 전 「계산 후 표시」, 계산 후 엔진 값.
- **결정**(사용자, 2026-09-19): 표시 층 D1·D2 + 미렌더 함수 **완전 정정**.

**수정**
- 자산별 행(`transfer-per-asset-summary.ts`) — 계산 전 개산공제는 엔진 leaf(`estimatedDeductionRate`·`computeEstimatedDeduction`, 지분 절사 순서 포함)로,
  추계 3종 전부(환산·감정·매매사례), 미등기 축은 엔진이 받는 값(주 자산 = 폼 값 · 컴패니언 = 자산 값). 일괄양도 각 자산도 미리 본다(개산공제는 안분과 무관).
  기준시가를 전용 경로가 만드는 자산(일반건물·상가·§166·겸용·다필지·분리·부담부증여·1990 전 토지·이월과세)은 제외.
  계산 후는 엔진 값 — 자산 1건 `result.expenses`, 일괄양도 `aggregated.properties[].necessaryExpense`.
- 합계(`computeTransferSummary`) = **자산별 행의 합**(단일 소스). 일반건물·상가도 전용 프리뷰가 자동으로 반영된다.
- 문서: `components/calc/CLAUDE.md`의 「사이드바 합계 selector」(stale)를 「자산별 행이 정본」으로 정정.

- **anchor** `__tests__/api/transfer.sidebar-lump-sum-per-asset-f14.anchor.test.ts`(14): 수정 전 RED 8 · 대조 GREEN 3 → 경계 3건 추가(지분 · 미입력 pending · 종류 전환 잔존값).
- **E2E** `transfer-sidebar-estimated-preview.spec.ts` F-14 케이스(미등기 토지 계산 전·후 300,000) — 수정 전 코드에서 5,000,000으로 실패 확인.
- **기존 테스트 정정**: `swap-97-2-display-identity.anchor.test.ts` 대조군이 이 결함을 「기존 동작(별건)」으로 고정하던 단언(20,000,000)을 엔진 값(4,500,000)으로 반전 — swap 축(230,000,000)과 갈려 서로의 구별력이 된다.
- **mutation 11/11 KILLED**(첫 회 8/11 — 지분·pending·일반건물 제외는 경계 anchor 추가 후).
- **세액 방향**: 없음(표시 전용).

## 23. F-15 구현 기록 — 2026-09-19

- **법문**(소득세법 시행령 §155, 로컬 캐시 MST 286211 본문 직독):
  ㉑ 「1세대가 장기임대주택의 임대기간요건 … 을 충족하기 전에 거주주택을 양도하는 경우에도 해당 임대주택 … 을 장기임대주택 … 으로 보아 제20항을 적용한다」.
  ㉒ 「제21항을 적용받은 후에 임대기간요건 … 을 충족하지 못하게 된(… 임대의무호수를 임대하지 않은 기간이 6개월을 지난 경우를 포함한다) 때에는 그 사유가 발생한 날이 속하는 달의 말일부터 2개월 이내에 … 양도소득세로 신고ㆍ납부해야 한다」.
- **재현**(엔진 · mock 세율 · 마목 수도권 의무 10년 · 2025-03-03 양도): 거주주택 8억 · 임대 36개월 → **50,589,000**(과세), 120개월 → 0.
  15억은 두 경우 모두 19,321,498이라 세액 구별력이 없었다(특례 적용 여부만 갈림 — 사용자가 주택 수 1을 입력하면 일반 경로 고가주택 계산과 대수적으로 같다).
- **수정**:
  - 판정기 `checkEligibility`: **말소되지 않은** 호의 `RENTAL_PERIOD_SHORT`만 뗀다 — 다른 실패 코드(기준시가 상한 등)는 그대로.
    말소된 호는 양도일 현재 임대 중이 아니므로(⑳2호) 종전대로 ㉓(자진말소 1/2·자동말소)으로만 풀린다.
    ㉑로 통과한 호 번호를 `periodPendingUnitIndexes`로 남긴다(㉓ 간주 충족·기간 충족 호는 제외).
  - ㉒ 안내(경고): 특례 경로(`runRentalHousingExceptionStep` — A2·B)와 1세대1주택 조기반환(STEP 1a — A1)의 **두 경로**에 싣는다. 조문은 `TRANSFER_RENTAL_HOUSING.PIT_RD_155_21`·`_22` 상수.
  - ⑤ 안내 문구: 「의무임대기간 N년 이상이어야 특례 적용」(법령과 반대) → ㉑·㉒ 안내.
- **anchor**
  - 엔진: `__tests__/tax-engine/rental-housing-exception/rental-period-pending-155-21-f15.anchor.test.ts`(10). 수정 전 RED 7건, 대조 GREEN 2건(거주 2년 미충족 · 말소 ㉓ 불충족). 복수 호 기록 1건은 뮤테이션 전에 추가했다.
  - route: `__tests__/api/transfer.route.rental-period-pending-f15.anchor.test.ts`(2 — 폼→④→⑫→⑭). 수정 전 코드에서 RED를 확인했다.
- **기존 테스트 정정**(공유 단언 반전 — 형제 안전망 유지):
  - `rh-b1-early-exempt-bypass` P3·P7은 「특례 불가 → 과세」 경로를 지키던 테스트다. 기간 미충족 대신 **기준시가 상한 초과**로 바꿔 같은 경로를 계속 지킨다.
  - `rh-eligibility-period`·`rh-eligibility`: 「기간 미충족 → 불가」를 두 테스트로 나눴다 — **말소 + ㉓ 불충족 → 불가**와 **㉑ 통과**.
- **mutation 8/10 KILLED**. 생존 2건은 동치 변이였고, 중복 조건이라 코드에서 뺐다:
  - `!terminationRelief`: `terminationRelief`가 참이면 말소 플래그도 참이다.
  - 조기반환 `passed` 가드: STEP 1a가 이미 판정 통과를 전제한다.
- **세액 방향**: 감소(과다 과세 해소). ㉒ 추징 세액 자체(「특례가 없었다면 납부했을 세액 − 납부한 세액」)는 **계산하지 않는다** — 사후 사유 발생일의 사실이 필요해 안내만 한다.
- **남은 한계**(확인 필요): ⑳2호 「양도일 현재 … 임대하고 있으며」는 누적 임대월수로 알 수 없어 「기타 요건 자기확인」에 맡긴다(종전과 같다). 말소 입력은 가·다·라·마목에만 있어, 바·아·자목이 말소된 경우는 말소를 표현할 수 없다(종전 한계).

## 24. F-1 구현 기록 — 2026-09-20

**착수 조건이던 자료를 확보했다**(taxlaw.nts·법제처 본문 직독 — 하청 보고 후 핵심 4건은 직접 재확인):

| 문서 | 생산일 | 무엇을 말하는가 |
|---|---|---|
| 사전-2021-법령해석재산-1719 | 2021.12.22 | 중첩(§155①+⑳)으로 §154①을 적용하고 「같은 항의 요건을 모두 충족하는 경우에는 … **제167조의3제1항제13호에 따라 중과세율을 적용하지 아니하며 장기보유특별공제도 적용**할 수 있는 것」 |
| 서면-2020-부동산-2226(사전-2019-법령해석재산-0368 전재) | 2020.06.22 | 13호 **신설 전**에는 같은 중첩에 「세율 +20%p·장특 배제」 — 13호는 창설적 규정 |
| 사전-2025-법규재산-1240 | 2026.03.16 | 일시적 2주택 + 동거봉양 합가 3주택 → 「§155조제1항 및 제4항에 따라 … §154조제1항을 적용」 |
| 서면-2022-법규재산-5124 | 2025.06.18 | 혼인 합가 후 신규주택 취득 3주택 → 「§155조제1항 및 제5항의 규정에 의하여 1세대1주택 비과세」 |
| 서면-2021-부동산-0263 | 2023.04.11 | 합가 3주택에서 상속으로 **4주택**이 되면 비과세 부인 — 상한 근거 |

**정면 자료는 없다** — ①+④·⑤ 조합에서 **중과**를 판단한 해석·심판례는 확인되지 않았다(양쪽 다 없음).
반대처럼 보이는 서울고법 2024누69953(대법 2025두35564 확정)은 **4주택·2019년 양도**(13호 이전) 사안이고,
판결도 「4주택 이상까지 인정한 사례는 없다」고 선을 그었다. 13호 시행 후 3주택을 다룬 국세청 해석과 층위가 다르다.

- **재현**(fallback 세율 · 조정지역 · 동거봉양 합가 2022-01-01 · 2026-08-01 양도 · 신규주택 2024-02-01):
  8억 **354,541,000**(70% 중과) · 15억 **915,403,500**(75%·장특 0). 2주택 합가면 각각 0 · 22,709,500.
- **수정**:
  - `resolveMergeOverlapDeeming`(신설) — 합가 창(窓)을 `matchMergeWindow`로 떼어내 주택 수 게이트와 분리하고,
    **3주택 + 일시적 2주택 타이밍(§155① 정본) 충족 + 합가 요건**이면 `*_merge_overlap` 의제를 낸다. 4주택 이상은 대상 아님.
  - 비과세(E-3.5)와 중과(`resolveDeemedOneHouseBy155`)가 **같은 술어**를 쓴다 — 중첩 판정은 ① 단독 분기보다 먼저 본다(합가 근거 보존).
  - 중과 배제는 13호 시행일 게이트(`CLAUSE_13_SURCHARGE_EXCLUSION_EFFECTIVE_DATE` = 2021-02-17)를 통과해야 한다.
    §154① 요건 면제(구 5·6호)는 **2주택 축 전용** — 3주택 중첩에는 주지 않는다.
  - 결과 경고에 근거 해석 번호와 한계(「정면 해석 없음」·「4주택 이상 제외」)를 싣는다. 종전 「미모델링」 경고는 **중첩이 서지 않은 경우에만** 남는다.
- **anchor** `__tests__/tax-engine/transfer/merge-overlap-3house-155-1-4-5-f1.anchor.test.ts`(14): 수정 전 RED 6 · 대조 GREEN 6 → 경계 2건 추가(한계 경고 소멸 · 주택3+분양권1).
  13호 시행일은 세액 경로로 관측되지 않아(2021년 fallback에 주택 수 산정 규칙이 없어 정밀 중과 판정 자체가 미수행) 중과 엔진 직접 호출로 고정했다.
- **mutation 12/12 KILLED**(첫 회 10/12 — 경고 관측 지점과 분양권 경계 추가 후).
- **세액 방향**: 감소(과다 과세 해소). D9-A1(3주택 합가 · 일시적 2주택 입력 없음)은 354,541,000 그대로다.

## 25. F-3 구현 기록 — 2026-09-20

**원문 대조**(로컬 캐시 MST 286211 직독) — 의심 2건 모두 **결함으로 확정**했다.

| 상수 | 종전 인용 | 실제 |
|---|---|---|
| `THREE_HOUSE_EXCLUSION_SOLE` | 「§167의3 ① 2호 나목 10호」 | **§167의3①10호** — 「1세대가 제1호부터 제8호까지 및 제8호의2에 해당하는 주택을 제외하고 1개의 주택만을 소유하고 있는 경우의 해당 주택」(9호는 삭제<2018.2.13>) |
| `TWO_HOUSE_SMALL_HOUSE` | 「§167의10 ⑩」 | **§167의10①9호** — 그 조에 ⑩항은 없다(①②뿐) |

**적용 대상도 어긋나 있었다**(인용만의 문제가 아니었다). §167의10①은 「1세대가 소유하는 주택으로서
다음 각 호의 어느 하나에 **해당하지 않는** 주택」을 중과 대상으로 하므로 각 호는 **양도하는 주택 자신**이다.
9호는 「**주택의 양도 당시** … 기준시가가 1억원 이하인 주택」이고, 10호(유일 일반주택)는 **1호~7호**만
인용하므로 **다른 주택**이 1억 이하인 것은 배제 근거가 아니다.

- **재현**(fallback 세율 · 조정지역 2주택 · 양도가 8억 · 2026-08-01):

  | 입력 | 종전 | 수정 후 |
  |---|---|---|
  | 양도주택 5억 · 다른 주택 9천만 | 141,966,000(잘못 배제) | **299,816,000** |
  | 양도주택 9천만 · 다른 주택 5억 | 299,816,000(배제 누락) | **141,966,000** |
  | 취득 시 5억 · 양도 당시 9천만 | 299,816,000 | **141,966,000** |

- **수정**: 판정 대상을 양도 주택으로 옮기고 값은 `transferOfficialPrice ?? officialPrice`(양도 당시)를 쓴다.
  정비구역 단서도 양도 주택에 건다. 상한은 `LOW_PRICE_SMALL_HOUSE_CAP` 상수로 뺐다.
  3주택 사유 문구의 「①~⑨ 배제 항목」은 10호 문언(「1호부터 8호까지 및 8호의2」)으로 고쳤다.
  `HouseInfo.isRedevelopmentZone` 주석의 인용(「§167-10 ① 10호」)도 9호로 정정했다.
- **미입력(0)은 「1억 이하」가 아니다**: ④가 양도 당시 기준시가 공란을 0으로 보낸다(`transfer-tax-api-houses.ts:37`).
  그대로 두면 값을 안 넣은 모든 2주택이 조용히 중과 배제됐다 — 실제로 기존 anchor
  `multi-presale-rights-plumbing`(P1-02-05, `officialPrice: 0`)이 pre-push에서 이 회귀를 잡았다.
  ⇒ `> 0` 게이트 + 「판정하지 못했습니다」 경고(`isLowPriceSmallHouseUndecidable`).
- **anchor** `__tests__/tax-engine/transfer/small-house-167-10-1-9-f3.anchor.test.ts`(9): 수정 전 RED 6 · 대조 GREEN 2(정비구역 단서 · 3주택 무대응) · 미입력 경계 1.
- **기존 테스트 정정**: `special-exclusion-p2`·`utilities-and-2house`가 「다른 주택 1억 이하 → 배제」를 고정하고 있었다.
  법령대로 뒤집고, 정비구역 단서 테스트도 **대상을 양도 주택으로 옮겨** 공허해지지 않게 했다. 「다른 주택만 1억 이하 → 배제 아님」 케이스를 새로 넣었다.
- **mutation 10/10 KILLED**.
- **세액 방향**: 양방향(다른 주택이 싸서 잘못 빠지던 건은 증가 · 양도 주택이 싼 건은 감소).

## 26. F-16 구현 기록 — 2026-09-20

**원문 대조**(로컬 캐시 MST 286211 직독). §167의10①은 「1세대가 소유하는 주택으로서 다음 각 호의
어느 하나에 **해당하지 않는** 주택」을 중과 대상으로 한다 — 각 호는 **양도하는 주택 자신**이다(F-3에서
9호에 대해 확인한 것과 같은 독법). 3호·7호도 예외가 아닌데 코드는 **다른 주택만** 봤다.

- **3호** 「…부득이한 사유로 … 1주택(… **취득 당시** 법 제99조에 따른 기준시가의 합계액이 3억원을
  초과하지 아니하는 것에 한정한다)을 취득함으로써 1세대 2주택이 된 경우의 **해당 주택**(취득 후
  1년 이상 거주하고 해당 사유가 해소된 날부터 3년이 경과하지 아니한 경우에 한정한다)」
- **7호** 「주택의 소유권에 관한 소송이 진행 중이거나 해당 소송결과로 취득한 주택(소송으로 인한
  확정판결일부터 3년이 경과하지 아니한 경우에 한정한다)」 — **8호는 2023.2.28 삭제**됐다.
- **10호** 「1세대가 **제1호부터 제7호까지**의 규정에 해당하는 주택을 제외하고 1개의 주택만을
  소유하고 있는 경우 그 해당 주택」 ⇒ 3호·7호는 9호와 달리 10호의 인용 범위 **안**이라, 다른 주택이
  해당하는 경로는 결론이 같다. 그 축은 유지하고 근거 인용만 10호를 병기했다.

- **재현**(fallback 세율 · 조정지역 2주택 · 양도가 8억 · 2026-08-01):

  | 입력 | 종전 | 수정 후 |
  |---|---|---|
  | 양도 주택이 소송 취득(2년 전) | 299,816,000 | **141,966,000** |
  | 양도 주택이 부득이 취득(취득 당시 2.5억·2년 거주) | 299,816,000 | **141,966,000** |
  | 다른 주택이 같은 사유(대조) | 141,966,000 | 141,966,000(불변) |

- **3호의 기준시가 시점도 틀렸다**. 법문은 「취득 당시」인데 코드는 `officialPrice`를 봤고, 그 칸은
  ⑤가 **양도일 연도** 공시가격을 채운다(`HousePriceYearLookup.resolveLookupYear` — §167의3①1호
  주택 수 산정의 기준시가가 양도 당시이기 때문이다). ⇒ `acquisitionOfficialPrice` 전용으로 바꿨다.
  미입력(0)은 「3억 이하」가 아니라 **판정 불가**다(F-3 9호와 같은 독법) — 배제하지 않고 경고한다
  (`isUnavoidableReasonUndecidable`).
- **인용 정정**: `TWO_HOUSE_LITIGATION` 「§167의10 ① 8호」 → **§167의10①7호**(8호는 삭제된 호다).
  타입·스토어·UI·`citation-link` 예시 주석까지 역방향 grep으로 전수 정정했다.
- **입력 경로를 함께 열었다** — 엔진만 고치면 no-op이다. ④(`buildHousesPayload`)의 `selling` 객체는
  3주택+ 전용 특례(`sellingHouseExclusion`)만 실었고 3호·7호는 「다른 보유 주택」 행에만 있었다.
  - ①②③ `TransferFormData.sellingHouseExclusion`에 6필드 추가(3호 4 · 7호 2).
  - ④ `selling` 매핑 + 다른 주택의 `acquisitionOfficialPrice`를 **장기임대 9유형 게이트 밖**으로
    꺼냈다(종전에는 `isLongTermRental && rentalType`일 때만 전달돼 3호만 켠 주택에서 값이 유실됐다).
  - ⑤ `SellingHouseTwoHouseExclusionSection`(신규, rose) + `HouseEntrySpecialExclusionSection`의
    3호 하위에 「취득 당시 기준시가」 입력 추가.
  - ⑧ 양도 주택 3호의 거주기간·취득 당시 기준시가 요구(7호 날짜는 미입력이 「진행 중」이라 요구 안 함).
  - ⑫⑭는 기존 `houseSchema`·`transfer-route-multi-house`가 이미 전 필드를 매핑하고 있었다.
  - 가시성 게이트 `sellingHouseTwoHouseExclusionVisible`은 주택수 2 — 토글이 켜져 있으면 주택수와
    무관하게 남긴다(3주택+ 섹션과 같은 dead-end 회피 규칙).
- **anchor 3파일 29건**: 엔진 `selling-house-167-10-1-3-7-f16.anchor.test.ts`(14 — 수정 전 RED 8 ·
  대조 GREEN 4 · 경계 2) · ④ `selling-house-two-house-exclusion-payload-f16.anchor.test.ts`(7) ·
  ⑤⑧ `selling-house-two-house-exclusion-gate-f16.anchor.test.ts`(8 — ⑧ 추가분이 RED 2를 잡았다).
- **기존 테스트 정정**: `utilities-and-2house`·`special-exclusion-p2`의 3호 픽스처 7곳이
  `officialPrice`로 3억 요건을 고정하고 있었다. `acquisitionOfficialPrice`로 옮기되, 통과 중이던
  형제 케이스(3억 초과·거주 0년·해소 3년 초과·3주택 미적용)도 기준시가를 채워 **구별력이 공허해지지
  않게** 했다.
- **mutation 14/14 KILLED**. 1차 12건 중 2건이 살아남아 anchor를 보강했다 — 「기준시가를 양도 당시로
  되돌림」은 취득 당시 값이 있는 케이스만 있어 구별이 안 됐고(⇒ F16-10b: 양도 당시 2.5억·취득 당시
  미입력), 「7호 3년→4년」은 4.17년 케이스뿐이라 넘어갔다(⇒ F16-3b: 만 3년 ±1일 경계).
- **세액 방향**: 감소(양도 주택이 두 호에 해당하는데 중과하던 과다 과세 해소). 3호 기준시가 시점
  정정은 양방향이나, 취득 당시 값이 없으면 배제하지 않으므로 기존 입력에서는 증가 쪽으로 움직일 수
  있다 — 그래서 경고로 알린다.

## 27. F-17 구현 기록 — 2026-09-20

**법문**(로컬 캐시 MST 286211 직독) — §167의10①7호 「주택의 소유권에 관한 소송이 진행 중이거나
해당 소송결과로 취득한 주택(소송으로 인한 **확정판결일**부터 3년이 경과하지 아니한 경우에
한정한다)」. 기산점은 확정판결일이지 등기 취득일이 아니다.

- **방향**: 확정판결일 ≤ 등기 취득일이므로, 화면이 「소송 취득일」을 요구하면 3년 창이 **늦게
  시작**해 배제가 과하게 유지된다 — **과소 과세**다. F-16 축(조정지역 2주택·양도가 8억·
  2026-08-01)에서 확정판결 2023-01-01 / 등기 2024-06-01인 사건이면 **299,816,000 vs 141,966,000**로
  갈린다(anchor F17-6).

- **필드명은 legacy로 남겼다**(사용자 결정). `litigationAcquisitionDate`를 개명하면
  ①③④⑫⑭ + UI 2곳 + 테스트 5파일을 고쳐야 하는데, 진짜 위험은 그게 아니라 **저장값 유실**이다 —
  `houses[]`는 sessionStorage에 그대로 persist되고 이력도 `inputData: formData` 전체를
  IndexedDB에 담아 마법사로 복원한다(`TransferTaxCalculator.tsx:115`). 구 키 승계를 빠뜨리면
  값이 사라지고, 그러면 「미입력 = 소송 진행 중」으로 읽혀 **조용히 배제가 켜진다**(세액 감소
  방향의 silent 회귀). `calc-wizard-migration.ts`에는 `houses` 배열 **내부 키**를 옮기는 패턴이
  아직 없다.
  ⇒ 세액을 정하는 것은 **사용자가 넣는 날짜**이고 그걸 정하는 것은 **라벨**이므로, 라벨·설명·
  결과 문구·주석을 고치고 이름-의미 불일치는 타입 주석에 못박았다.

- **정정 지점**: ⑤ 라벨 2곳(「소송 취득일」→「소송 확정판결일」, hint도 「판결 확정 시 — 그날부터
  3년 이내 배제」) · 엔진 결과 detail(「법원 결정 취득(날짜)로부터」→「소송 확정판결(날짜)부터」) ·
  `HouseInfo`·`HouseEntry`·`sellingHouseExclusion`·Zod 주석 · 기존 테스트 제목 2건.
  역방향 grep으로 「소송 취득일」·「법원 결정 취득」 잔존 0을 확인했다(E2E 셀렉터 없음).

- **anchor 6건**: `litigation-judgment-date-label-f17.anchor.test.tsx`(4 — 두 섹션의 라벨·기산
  문구 · 토글 OFF 긍정 짝) · F-16 anchor에 F17-5·F17-6 추가(결과 detail · 두 날짜가 갈리는 사건).
- **mutation 4/4 KILLED**(라벨 2 · hint 1 · detail 1).
- **세액 방향**: 사용자가 앞으로 확정판결일을 넣게 되므로 증가 쪽(과소 과세 해소). 이미 저장된
  값은 그대로 두므로 기존 이력의 세액은 바뀌지 않는다.

## 28. F-18 구현 기록 — 2026-09-20

**엔진은 원래 맞았다.** §163⑥1호 단서(미등기양도자산 3/1000)를 일반건물 3경로 모두
`estimatedDeductionRate()` 단일 판정점으로 지킨다(`general-building-valuation.ts:342-343` ·
`general-building-extension.ts:67-68` · `burdened-gift-valuation.ts:286-287`).

**표시 층 6곳이 율을 「3%」로 박고 있었다.** 미등기 자산에서 **적힌 산식이 적힌 값을 만들어내지
못한다** — 세액은 맞고 검산만 10배 어긋나는 형태다.

- **재현**(양도 20억 · 토지 85㎡ · 취득 공시지가 2,800,000원/㎡ · 취득 건물기준시가 2,814,470):

  | 입력 | base | 엔진이 낸 개산공제 | 종전 화면 산식 |
  |---|---|---|---|
  | 등기 | 238,000,000 | 7,140,000 | 238,000,000 × 3% ✅ |
  | 토지 미등기 | 238,000,000 | **714,000** | 「238,000,000 × 3%」 → 7,140,000 ❌ |
  | 건물 등기 / 미등기 | 2,814,470 | 84,434 / **8,443** | 둘 다 「× 3%」 ❌ |

- **원인**: `GeneralBuildingEstimatedDeduction`에 base echo(`landBase`·`buildingBase`)는 있는데
  **율 echo만 없었다**. 그 타입 주석이 `feedback_engine_result_display_drift`를 인용하면서도
  지분 축만 막고 율 축을 빠뜨렸다. 다른 결과뷰(재개발 카드·PHD·명세서 공통 헬퍼)는
  `estimatedDeductionRate()`를 경유해 라벨을 만든다 — GB만 예외였다.
- **도달 가능**: `gbLandUnregistered`·`gbBuildingUnregistered` 입력 경로가 F-7(§18)에서 열렸다.
- **수정**: result에 `landRate`·`buildingRate`를 echo하고(2-way·증축 3-way·부담부증여 perAsset),
  표시 층이 그것을 읽는다. 증축분(건물2)은 건물1과 같은 축이다 — 민법 §256 부합·표시변경등기라
  「그 자산 취득에 관한 등기」(§104③)를 건물 1동 단위로 본다.
  **부담부증여는 개산공제 경로에서만 율을 채운다** — K-4(실비 안분)·§97②2호 swap 경로는 율이라는
  개념이 없어 `undefined`로 둔다(그 문구 축은 F-19로 등록).
- **옛 이력 호환**: echo가 없는 결과(이 변경 전 IndexedDB 이력)는 **등기 3%로 fallback**한다 —
  종전과 같은 표시다. 미등기로 떨어지면 등기 자산 산식이 조용히 0.3%가 되므로 anchor로 고정했다
  (D-2b·D-7). 뮤테이션 1차에서 이 축만 살아남아 보강한 것이다.
- **anchor 14건**: 엔진 `gb-estimated-deduction-rate-echo.anchor.test.ts`(6 — 「base × rate가
  개산공제를 재현한다」를 술어로 고정) · 표시 `gb-estimated-deduction-rate-label.anchor.test.tsx`
  (8 — 카드 렌더 4 · 명세서 산식 4). 엔진 echo만 고정하면 표시 층이 계속 3%를 박아도 초록이라
  (`feedback_library_anchor_does_not_prove_component_uses_it`) 배선 anchor를 따로 두었다.
- **mutation 9/9 KILLED**(엔진 echo 3 · 표시 하드코딩 4 · fallback 2).
- **세액 방향**: 없음. 표시 축이다 — R-5가 개산공제 값 불변을 고정한다.

## 29. F-19 · F-20 구현 기록 — 2026-09-20

둘 다 F-18 조사에서 나온 **표시 축**이다(세액 무관). 한 브랜치로 묶었다 — 같은 파일
(`DetailedStatementGbFormulas.ts`)의 같은 함수를 고치므로 PR·CI 고정비를 한 번만 치른다.

### F-19 — 실비 경로인데 「개산공제 × N%」라 적었다

부담부증여 K-4(실지취득가)·§97②2호 swap 경로의 필요경비 슬롯에는 개산공제가 아니라 **채무비율로
안분한 실비**(자본적지출·양도비)가 들어간다(`burdened-gift-apportionment.ts` STEP 5 —
`acquisitionMethodUsed === "actual"`). 종전 문구는 그 경우에도 「안분 취득가액 × 3% (개산공제,
소령 §163⑥)」라고 적어 **없는 근거를 댔다**.

- **신호**: F-18에서 율 echo를 **개산공제 경로에서만** 채워 두었다 — `undefined`가 곧 실비 경로다.
  `acquisitionMethod`로 가르면 swap 경로(`converted` + 실비)를 놓친다.
- **수정**: 율이 없으면 「채무비율 안분 실비 (자본적지출·양도비)」 + 「실지취득가액 경로라 §163⑥
  개산공제를 적용하지 않습니다」.

### F-20 — 증축 base가 100% 값이라 지분 자산에서 어긋났다

- **재현**(증축 취득 기준시가 1,000,000):

  | 지분 | 엔진 개산공제 | 종전 화면 산식 |
  |---|---|---|
  | 1 | 30,000 | 1,000,000 × 3% = 30,000 ✅ |
  | 1/2 | **15,000** | 「1,000,000 × 3% = 15,000」 ❌ (1,000,000 × 3% = 30,000) |

- **수정**: `GeneralBuildingEstimatedDeduction`에 `extensionBase` echo 추가. **개산공제 경로에서만**
  채운다 — 증축분을 실가로 직접 입력하면 그 필요경비는 실비라 율도 base도 없다(F-19와 같은 규율).
  표시 층은 base가 없으면 「사용자 직접 입력 (증축 실제 필요경비)」로 적는다.

- 🔴 **anchor가 더 큰 것을 잡았다.** 대조군으로 넣은 F20-3(「토지·건물1은 종전부터 base echo가
  있었다」)이 **RED**였다 — base echo는 2-way 경로(`calculateEstimatedDeduction`)에만 있었고
  **증축 3-way 경로에는 토지·건물1도 없었다**. 표시 층이 `?? gb.acqLandStdTotal`로 100% 값에
  떨어져 지분 자산에서 같은 어긋남이 났다. 증축 경로에도 2-way와 동등하게 base를 echo한다.
  (교훈: 대조군을 「이미 맞을 것」으로 단정하지 말 것 — 짐작이 아니라 실행이 갈랐다.)

- **anchor 7건**: `gb-statement-formula-f19-f20.anchor.test.tsx`. 산식 문자열에서 「적힌 base ×
  적힌 율 = 적힌 값」을 **정규식으로 직접 검산**하는 술어(`reproducesFromFormula`)를 썼다 —
  숫자를 테스트에 다시 적으면 그 숫자가 틀려도 통과한다.
- **mutation 7/7 KILLED**(증축 base echo 2 · 증축 경로 토지·건물1 base echo 2 · 표시 3).
- **세액 방향**: 없음. 표시 축이다.
- **후속 F-21 등록**: 토지·건물1의 **실가 파트**에도 F-19와 같은 축이 남아 있다
  (`landUsedEstimated`·`building1UsedEstimated`가 신호). base echo를 「개산공제 경로 신호」로
  겸용하면 옛 이력의 base 부재와 구별이 안 되므로 별도 플래그 검토가 필요하다.

## 부록. 변경 이력

| 버전 | 날짜 | 내용 |
|---|---|---|
| v0.1 | 2026-09-18 | 최초 작성 — 재현 워크플로 결과(결함 4건 전건 재현, 반박 검증 8건) + Q-1·Q-2 결정 반영 |
| v0.2 | 2026-09-18 | **Q-3 대안 채택**(저장 당시 세액 유지 + 전환 버튼 — 판별은 옛 필드 존재로만, anchor L1~L3) · **Q-4 권장안 채택**(범위 밖 + 결과 안내) · §10 후속 작업 F-1~F-4 신설 |
| v0.3 | 2026-09-18 | **V-4·V-5 해소** — §1.4 설계 정정(배제 3에 게이트 덧붙이기 → E-3.5 합가 판정을 공용 술어로 꺼내 `deemedOneHouseBy155`에 채움), F-2를 PR-1에 흡수, Q-5(먼저 양도 요건) 신설 |
| v0.3′ | 2026-09-18 | **Q-5 확정 — 토글 필수**(기존 미체크 혼인 중과배제는 세액 증가 · PR 본문 명시) · anchor D9-A8 |
| v0.4 | 2026-09-18 | **PR-1(D9) 구현** — §11 구현 기록·mutation 9건·세액 방향 |
| v0.23 | 2026-09-20 | **F-19·F-20 해소**(§29 — 실비 경로 문구 · 증축 base echo · **증축 경로 토지·건물1 base echo 누락도 함께**) · 후속 **F-21** 등록(실가 파트 문구) |
| v0.22 | 2026-09-20 | **F-18 해소**(§28 — GB 개산공제율 echo · 표시 6곳의 「3%」 하드코딩 정정) · 후속 **F-19**(부담부증여 K-4 실비 문구) · **F-20**(증축 base echo) 등록 |
| v0.21 | 2026-09-20 | **F-17 해소**(§27 — 7호 3년 기산점 「확정판결일」 라벨·문구 정정 · 필드명은 저장값 유실 위험으로 legacy 유지) |
| v0.20 | 2026-09-20 | **F-16 해소**(§26 — 3호·7호 양도 주택 자기 적용 · 3호 기준시가 「취득 당시」 · 입력 경로 ①②③④⑤⑧ 신설 · 8호→7호 인용) · 후속 **F-17** 등록(7호 기산점 확정판결일) |
| v0.19 | 2026-09-20 | **F-3 해소**(§25 — §167의10①9호 대상·시점 정정 + 인용 2건) · 후속 **F-16** 등록(3호·7호 자기 배제 누락) |
| v0.18 | 2026-09-20 | **F-1 해소**(§24 — ①+④⑤ 중첩 3주택 1세대1주택 의제 · 13호 중과 배제 · 시행일 게이트 · 근거 고지) |
| v0.17 | 2026-09-19 | **F-15 해소**(§23 — §155㉑ 기간 미충족 호 통과 · ㉒ 사후 추징 안내 · 말소는 ㉓으로만) |
| v0.16 | 2026-09-19 | **F-14 해소**(§22 — 표시 층 자산별 행 개산공제 엔진 leaf·계산 후 엔진 값 · 미렌더 합계 = 행의 합) |
| v0.15 | 2026-09-19 | **F-12 해소**(§21 — 화면 경로 §164⑨·소유자 분리 연결 · 취득일 분리 차단 해제 · ⑫ 거부 규칙 + 키 분류 가드) |
| v0.14 | 2026-09-19 | **F-11 해소**(§20 — 12호 시점 3건 · 미분양·오피스텔 불산입 근거 없음 2건) |
| v0.13 | 2026-09-19 | **F-10 해소**(§19 — §167의3④ 10호 의제) · 후속 F-15(§155㉑) |
| v0.12 | 2026-09-19 | **F-9 해소** — 다건 감면 호별 산정(재산세과-3820) + §104⑤ 괄호 감면 후 비교(별도 계획서 §7) |
| v0.11 | 2026-09-19 | **F-7 해소**(§18 — 컴패니언 GB 미등기 2축 입력 · ⑧⑩ 옛 값 차단) · 후속 F-14 |
| v0.10 | 2026-09-19 | **F-6 종결**(§17 — 현행 정합 · 해석 미확보) · **F-13 신설**(별도 계획서) |
| v0.9 | 2026-09-19 | **F-5 해소**(§16 — ⑫ 거부) · 후속 F-12 |
| v0.8 | 2026-09-19 | **F-8 해소**(§15) — §155⑳ 경로 §91① 게이트 |
| v0.7 | 2026-09-19 | **PR-4(D16) 구현**(§14) · 후속 F-10·F-11 |
| v0.6 | 2026-09-18 | **PR-3(D45) 구현**(§13) · 0068 오독 정정 3곳 |
| v0.5 | 2026-09-18 | PR-1 머지(#1689) · **V-1~V-3·V-6~V-8 해소**(§6) · **PR-2(D15) 구현**(§12 — 차감형 2곳·겸용 경로를 설계에 추가) · 후속 F-5~F-9 신설 |
