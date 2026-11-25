# 재산세 별도합산 철거 특례 «3가지 요건» — 화면·클라이언트(①~⑧⑫⑭) 계획서

> 상태: **Plan v2 (2026-11-25 — 코드 변경 0)**. 사용자 요청 2026-11-25 «세 가지 모두 판정이 달라질 수 있는 요건 수정 계획서 작성해»의 UI 쪽. 엔진 정본 = `docs/01-plan/features/property-separate-demolished-requirements.engine.plan.md` **v2**(§5.9 이름·§13 이관분 세액). **v2 = 사용자 결정 2026-11-25 반영**(§0.0) + 엔진 문서 도착 후 정합(§3 이름 대응표 — 불일치 0건).
> 근거 표기: file:line = 워크트리 `Property-related-Taxes-ptax-demolish-plan`(origin/master `ae92c7bd3`)에서 이 세션이 직접 읽은 줄. 동작 수치는 throwaway `tsx` probe(scratchpad — 저장소 변경 0)로 실측한 것만 단정했다. 정독만으로 쓴 곳은 «정독», 못 본 곳은 «확인 필요».
> **범위 밖(재제안 금지)**: 과세기준일(6.1.) 단위 «접기» · **자동 안분 fallback**(예외 PHD §164⑦ — 이 기능은 해당 없음) · `useEffect → store` 미러링 · native checkbox/radio/date · placeholder 숫자 예시 · ~~별도합산 초과분의 종합합산 세액 계산 신설~~ → **사용자 결정 2026-11-25(Q-9 기각)로 이번 범위에 포함**(§0.0 · §5.8 · §7).
> 선례(같은 법령 §103의2, 양도세 쪽 — master 반영): `components/calc/transfer/nbl/OtherLandDemolishedFactsField.tsx` · `OtherLandDemolishedPublicUseField.tsx` · `lib/calc/nbl-demolished-row-scope.ts` · 엔진 술어 `lib/tax-engine/non-business-land/demolished-temp-status.ts`(`demolishedRequiredFacts`·`demolishedPublicUseAsked`) · `demolished-row-facts.ts`(`firstBlankDemolishedFact`·`demolishedRowFactIssue` — ⑧·⑫′ 단일 함수) · UI 계획서 `nbl-state-history-e3-5-demolition-temp-status.ui.plan.md`·`…e3-5d-vacant-public-use.ui.plan.md`.

---

## 0. 한눈에

### 0.0 사용자 결정 2026-11-25 (이 문서는 이 표를 전제로 한다 — 엔진 문서 §0.0과 같은 날 결정)

| 항목 | 결정 (**사용자 결정 2026-11-25**) | 이 문서의 반영 |
|---|---|---|
| Q-2 | **적용** — 본 경로(비철거 건축물, 영 §101① 단서)에도 허가·사용승인 요건. PSA-E3 | §4.7 · §5.1 `saBuildingPermit` |
| **Q-9** | **이관분 세액 계산까지 이번 범위에 포함**(0원 + 경고로 끝내지 않음). 합산을 무시하는 단순화 금지 | §5.8(합산 입력 칸) · §7(3분할 결과) · §8.1(기대값 변경) · **UQ-4는 «Q-9로 대체 — 이관분 세액 계산 포함»** |
| UQ-1·2·3·5·7·8·9 | 추천 채택(§9) — UQ-3 = 엔진 Q-6 (가)(공용 사용·유료 **2칸·날짜 없음**) | §4.2 · §5.1 |
| **UQ-6** | **채택 — 계산 직전 재검증**. 이 문서가 합산 칸을 **Step 3**에 두므로(UQ-10 — 엔진 §13.3(c)는 «판정 뒤 요구 술어»만 정함) 재검증 범위는 «0~2단계» + **3단계 합산·상한 칸**이다(§9 UQ-6·UQ-12 · §8.5) | §5.7 · §8.5 |
| 엔진 Q-1·3·4·5·6·7·8·10·11·12 | 추천 채택 — Q-1 미선택 = ⑧ 차단 + ⑫ 400 · Q-8 바닥면적·용도지역 «읽을 때만» · Q-10 화면 과세연도 선택 안 함 · Q-11 철거일 > 과세기준일 = ⑧ 차단 + ⑫ 400 | §3 · §6 |
| 엔진 Q-13~Q-18 | **결정됨 — 전부 추천안 채택**(엔진 문서 §0.0): Q-13 금액 칸 2개 · Q-14 이 필지 몫 대표 금액 · Q-15 필지 합계 recompute(이관분 + direct = 미적용 + 고지) · Q-16 직접 종합합산에도 적용 · Q-17 서술만 정정 · Q-18 현행 `calcSurtax` | §5.8 · §7 · §9 |
| **UQ-10** | **결정됨 — 추천안 채택**: 합산 칸 = **Step 3 상단** 블록 | §5.8 |
| **UQ-11** | **결정됨 — 추천안 채택**: 결과 대표 금액 = **이 필지 몫** | §7 |
| **UQ-12** | **결정됨 — 추천안 채택**: 계산 직전 재검증을 **0~3단계로 넓힘**(합산·상한 칸 + `validateStep(3)` 기존 규칙 — N-7) | §5.7 · §8.5 |


### 0.1 문제

「지방세법 시행령」 §103의2(현행 — KoreanLaw MST 290815 실독 2026-11-25, 시행 2026.10.1., 2025.12.31. 개정 반영)는 철거ㆍ멸실된 건축물·주택의 부속토지를 별도합산에 포함하되 **세 가지 요건**을 단다.

| # | 요건 | 조문(현행) | 시행본 | 현행 재산세 화면 |
|---|---|---|---|---|
| ① | 건축·주택 관계 법령상 **허가 등을 받지 않았거나 사용승인(임시사용승인 포함)을 받지 않은** 건축물·주택의 부속토지는 **제외** | 본문 후단 «이 경우 …» | 과세기준일 2019.6.1.~ | **입력 칸 없음** |
| ② | **건축 외 용도로 사용하는 부속토지는 제외**(1호 괄호 · 2호 단서) | 1호 괄호·2호 단서 | 과세기준일 2024.6.1.~ | **입력 칸 없음** |
| ③ | **빈집정비사업 등으로 철거된 빈집**은 3년 · 그 부속토지가 건축 외 용도여도 **국가·지자체·지자체조합이 1년 이상 공용·공공용으로 사용(1년 이상 사용이 계약서 등으로 입증되는 경우 포함)** 하고 §109② 단서의 재산세 부과대상이면 **그 사용 기간 동안은 포함** | 2호 본문·단서 | 2024.6.1.~ | **입력 칸 없음** |
| (기존) | 철거ㆍ멸실일 입력 → 6개월(2016.6.1.~) · 1년(2026.6.1.~) | 1호 | #3645로 연혁 정정됨 | 철거 토글 + 철거일 1칸 |

(1호 후단 «철거ㆍ멸실되기 전 건축물의 바닥면적 × §101② 적용배율» 범위 문언은 **건축물**에 대한 것이다 — 주택은 해당 문언이 없다.)

현행 화면은 **철거 토글 + 철거일**뿐이라 세 요건이 판정에 들어갈 길이 없다. 허가 없는 건축물도·건축 외 용도로 쓰는 토지도 «철거일만 맞으면» 별도합산으로 계산된다 — **법보다 유리하게 틀린 세액**이 조용히 나온다.

### 0.2 실측 한 줄 (현행 엔진 — 화면 경로 `buildPropertyTaxRequestBody → calculatePropertyTax`, 이 세션 probe)

시료: 상업지역 · 토지 1,000㎡ · 공시가격 10억 · 바닥면적 100㎡(기준면적 300㎡) · 과세기준일 2026.6.1.(화면은 `targetDate` 미전송 → 서버가 올해 6.1.).

| 철거일 | 총 납부세액 | 과세표준 | 비고 |
|---|---|---|---|
| 2026-03-01 | **516,000** | 210,000,000 | 본세 430,000 + 부가세 86,000 · 300㎡ 별도합산·700㎡ 종합합산 이관(경고 문구만) |
| 2025-06-01(1년 당일) | **516,000** | 210,000,000 | 특례 유지 |
| 2025-05-31(1년 초과) | **0** | 0 | 전량 종합합산 이관 — **종합합산 세액은 계산하지 않는다** |
| 2024-03-01(주택 빈집 3년 안) | **0** | 0 | 현재는 일반 12개월만 봐서 접힘 — ③이 들어오면 «빈집정비 예»일 때 뒤집힌다 |
| 2026-08-01(과세기준일 **뒤** 철거) | **516,000** | 210,000,000 | 경고 «철거 후 0개월 경과…특례 적용» — 과세기준일 현재 건축물이 있는데도 철거 특례 문구(§3 E-7) |

→ **현행은 이관분이 0원으로 사라진다**(2025-05-31 행 — «종합합산 세액은 계산하지 않는다»; 2026-03-01 행도 700㎡ 이관분 세액 누락). **사용자 결정(Q-9)으로 이관분 세액을 계산해 합계에 넣는다** — 같은 시료의 반영 후 값(오라클 — 엔진 §13 프로토타입 + 현행 엔진 직접 호출, 합산 입력 0·세부담상한 없음·비도시지역):

| 철거일 | 현행 총 납부세액 | 반영 후(별도합산분 + 종합합산 이관분 = 합계 본세 → **총액**) | 어느 PR에서 바뀌나 |
|---|---|---|---|
| 2026-03-01 | 516,000 | 430,000(300㎡) + **2,200,000**(700㎡ 이관) = 2,630,000 → **3,156,000** | PSA-E4(요건 이전부터) |
| 2025-06-01(1년 당일) | 516,000 | 〃 **3,156,000** | PSA-E4 |
| 2025-05-31(1년 초과) | **0** | 0 + **3,250,000**(1,000㎡ 전량) = 3,250,000 → **3,900,000** | PSA-E4 |
| 2024-03-01(주택 · 빈집정비 «예») | **0** | 별도합산 1,000㎡(주택 면적 한도 없음) **1,900,000 → 2,280,000** | PSA-E2(요건) + E4 |
| 2024-03-01(주택 · 빈집정비 «아니오»·«모름») | 0 | 전량 이관 **3,900,000** | PSA-E4 |
| 2026-08-01(과세기준일 **뒤** 철거) | 516,000 | **차단**(엔진 Q-11 (가) — ⑧ + ⑫) | PSA-E2 |

(단독 필지·합산 0 가정. 같은 관할구역 다른 토지가 있으면 값이 더 커진다 — 엔진 §13.4 S-5·S-6.) 0원이 «세금 없음»으로 읽힐 일은 없어지지만 **총액이 크게 바뀌는 입력이 생기므로 «왜 이 금액인가»(분할 근거 · 합산 가정 · 상한 고지)를 결과에 보이는 것이 §7의 일**이다.

### 0.3 설계 한 줄

철거 토글(`saDemolished`)·철거일 **바로 뒤**에 «철거 후 한시 별도합산 사실 확인» 블록을 둔다. 순서 = 계산 순서: ① **철거된 건축물 종류(주택 / 주택이 아닌 건축물)** → ② 허가·사용승인(3지선다) → ③ 철거 후 건축 외 용도(3지선다) → ④a 빈집정비(**주택일 때만**) → ⑤ 국가 등 공용·공공용 사용 하위 칸(건축 외 용도 «예» ∧ 빈집정비 «예»일 때만) → ⑥ (건축물일 때) 철거 전 바닥면적 = **기존 «건물 바닥면적» 칸을 재사용**(새 필드 0 — §4.5). **어느 칸이 보이는가는 엔진 술어 한 함수**(노출 ≡ 필수)이고 UI는 날짜·시행본을 비교하지 않는다.

### 0.4 단계 한눈에

| 단계 | 내용 | 새 FormState 필드 |
|---|---|---|
| PSA-E1 (엔진) | 판정 leaf·술어·고지 (엔진 §8) | — |
| PSA-E4 + PSA-U2 | 이관분 세액·합산 칸·3분할 결과(§5.8 · §7) | `otherSeparateAggregateValue`·`otherComprehensiveValue` |
| PSA-E2 + PSA-U1 | 철거 사실 칸·재검증(§4 · §5.1 · §6) | 6개(`saDemolishedKind` ~ `saDemolishedPublicUsePaid`) |
| PSA-E3 + UI | 본 경로 허가(§4.7) | `saBuildingPermit` |
| PSA-X | E2E | — |

---

## 1. 현행 사실 (실측)

### 1.1 재산세 마법사 구조 (정독 — `components/calc/PropertyTaxForm.tsx`)

- **상태는 `useState` 로컬**(`PropertyTaxForm.tsx:23-24` `useState<FormState>(INITIAL_FORM)`) — zustand store·sessionStorage·normalize·migrate **없음**. 새로고침하면 폼이 초기화된다. 이력 저장은 `useAutoSaveCalculation`(:31-39)이 `inputData: form`을 IndexedDB에 **저장만** 하고, 이력에서 폼으로 **복원하는 경로는 없다**(`HistoryDetailDrawer.tsx:126-131`은 결과 숫자만 표시 · `lib/storage/business-key.ts:69-73`은 주소만 키). → **③ normalize·구 세션 처리 = 해당 없음**(§5.3).
- 단계: 토지는 `기본 정보(0) → 토지 분류(1) → 토지 상세(2, 별도합산·분리과세일 때만) → 전년도 세액(3)`(`PropertyTaxForm.tsx:64-73`). 결과는 step 4.
- 검증: `handleNext`가 step 0·1·2에서 `validateStep(n, form)`(`:116·123·130`), **step 3(계산)은 `runCalculation`을 바로 호출한다 — `validateStep`을 다시 부르지 않는다**(`:136-138`·`:146`). 오류는 문자열 하나 + 빨간 박스(`:254-258`) — **필드 점프(`data-field`) 없음**(양도세 `ValidationIssue.field` 같은 구조가 재산세엔 없다).
- **StepIndicator 점프로 step 2를 건너뛸 수 있다**(`:210-224` `onStepClick` → `setStep(i)`; 토지 상세 있는 경로는 `i` 그대로) → 사용자가 step 0에서 step 3으로 가서 «재산세 계산하기»를 누르면 ⑧을 거치지 않고 ⑫(Zod)에서만 막힌다. 그때 화면에 나오는 문구는 `callPropertyTaxAPI`가 던지는 `json.error.message` = **«입력값이 올바르지 않습니다.»**(`shared.ts:759`, route `:62-68`이 `details`는 따로 담지만 클라이언트가 쓰지 않는다). → ⑫ 문구가 사용자에게 안 보인다(§6.3 · UQ-6).
- 사이드바·합계 카드: **재산세 마법사에 없다**(`grep Sidebar|Summary components/calc lib/stores` 에 재산세 항목 0) → **⑥ = 해당 없음**.

### 1.2 별도합산 상세 화면 (`components/calc/property/Step2SeparateAggregate.tsx`, 105줄)

| 줄 | 칸 | 컴포넌트 |
|---|---|---|
| 22-35 | 용도지역(`saZoningDistrict`) | `RadioCardGroup` sky inline |
| 38-50 | 토지 면적(`saLandArea`) | `DecimalInput` |
| 53-59 | 공장용지(`saIsFactory`) | `ToggleCard` sky |
| 62-75 | **건물 바닥면적**(`saBuildingFloorArea`) — 공장·비공장 공통 | `DecimalInput` + 힌트 |
| 83-88 | **건축물 철거 완료**(`saDemolished`) | `ToggleCard` sky(description «철거·멸실 후 1년 이내 별도합산 유지 특례» — 시행본 고정 문구) |
| 90-102 | **철거일**(`saDemolishedDate`) | `DateInput` + 힌트 «철거·멸실일부터 1년 이내이면…» |

- 라벨은 `<label className="text-sm font-medium">` 직접 작성(FieldCard 아님) — 이 블록 밖은 건드리지 않는다(Surgical). 신규 블록은 `FieldCard`·`RadioCardGroup`·`ToneCard`로 쓴다.
- 입력 칸 select-on-focus: `app/layout.tsx:6·70`에 `SelectOnFocusProvider` 포함 확인 → `DecimalInput`·`DateInput` 별도 처리 불요.
- 철거 토글 설명·힌트의 «1년»은 **2026.6.1.~ 시행본 고정 문구**다(과세기준일이 이후 연도면 맞지만 6개월 시행본이 아님을 말하지 않는다). 화면은 항상 올해 6.1.이므로 문구 자체는 틀리지 않으나, 요건 ①~③이 들어오면 «1년 이내이면 특례 적용» 단정 문구가 **요건을 가린다** → 문구를 «요건 충족 시»로 고친다(§4.6).

### 1.3 14지점 대응표 (재산세 — 해당 없음은 근거와 함께)

| 지점 | 재산세 위치(file:line) | 현행 | 이 기능의 변경 |
|---|---|---|---|
| ① 폼 상태 | `components/calc/property/shared.ts:174-175` `saDemolished`·`saDemolishedDate` | 2필드 | **+5~7**(§5.1): `saDemolishedKind`·`saDemolishedPermit`·`saDemolishedOtherUse`·`saDemolishedVacantHouse`·`saDemolishedPublicUse`(·`saDemolishedPublicUsePaid`) |
| ② initial | `shared.ts:271-272` `INITIAL_FORM` | `false`·`""` | 신규 필드 전부 `""`(**가정값 없음** — 미선택) |
| ③ normalize | **없음**(폼이 `useState` 로컬 · 이력 복원 없음 — §1.1) | — | **해당 없음**. 단 `INITIAL_FORM` 스프레드를 쓰는 테스트 픽스처가 신규 필드를 `""`로 자동 갖는다 |
| ④ API 변환 | `shared.ts:559-563` `buildPropertyTaxRequestBody`(철거 시 `demolished`·`demolishedDate`만) | 2필드 전송 | 노출된(= 엔진이 읽는) 사실만 `separateAggregateItem`에 싣는다. stale(숨은 값) 미전송 — 게이트 = 엔진 술어(§5.4) |
| ⑤ UI 위젯 | `Step2SeparateAggregate.tsx:83-102` | 토글 + 철거일 | 신규 블록 `SeparateAggregateDemolishedFacts`(§4) |
| ⑥ 사이드바 | 재산세 마법사에 없음 | — | **해당 없음** |
| ⑦ 결과 카드 | `components/calc/results/PropertyTaxResultView.tsx`(714줄) — 토지 3분류 구분 표시 **없음**(`grep 별도합산` = 0) · 철거 특례는 `warnings` 앰버 박스(`:415-424`)뿐 | 경고 문자열 | 엔진 echo 기반 «철거 특례 판정» 카드 + 0원 이관 안내(§7) |
| ⑧ validation | `shared.ts:407-412`(step 2 별도합산: 용도지역·면적·바닥면적·**철거일**) | 철거일 1건 | 사실 칸 4~6건(§6) — 엔진 단일 함수 |
| ⑨ Zod enum 메인 | **해당 없음**(재산세는 `landTaxType` enum 1곳 `property-input.ts:123` — 이 기능은 enum 추가 0) | — | 사실 값 `yes\|no\|unknown` enum 신설 = ⑫에 포함 |
| ⑩ Zod 컴패니언·refine | `lib/validators/property-input.ts:410-423`(superRefine — 바닥면적 필수·철거일 필수) | 2건 | 사실 칸 요구 refine **추가**(⑧과 같은 함수 §6) |
| ⑪ 자산-수준 acquisitionDate fallback | **해당 없음**(재산세에 취득일 개념 없음) | — | — |
| ⑫ Zod 입력 객체 | `property-input.ts:131-149` `separateAggregateItem`(`demolished`·`demolishedDate`) | strip 위험 | 신규 키 **반드시 추가**(Zod는 스키마 밖 키를 조용히 strip — `property-input.ts:164·178·210` 주석이 같은 함정을 경고) · **2번째 Zod** `lib/validators/separate-aggregate-input.ts:79-118`(엔진 직접 경로·테스트 전용 — 라우트 미경유: `grep separate-aggregate-input app lib` = 주석 1건뿐)는 엔진 시니어 판단 |
| ⑬ callXxxAPI body spread | `shared.ts:745-755` `JSON.stringify(buildPropertyTaxRequestBody(form))` — spread 아님·변환 결과 그대로 | — | 해당 없음(④가 곧 ⑬) |
| ⑭ Route 엔진 input 매핑 | `app/api/calc/property/route.ts:78` `parsed.data as PropertyTaxInput`(필드별 매핑 없음) · Date 변환은 `targetDate`만(:89) | — | **신규 필드 매핑 불요**(Zod 통과 객체가 그대로 엔진 입력). 엔진 `PropertyTaxInput.separateAggregateItem`(`lib/tax-engine/types/property.types.ts:208-230`) 타입 확장은 엔진 몫 |

**5단 파이프라인(재산세)**: 폼(①②) → 변환(④) → fetch body(⑬=④) → Zod(⑫⑩) → Route(⑭ 무매핑) → 엔진 `calculatePropertyTax`(`property-tax.ts:442-453`이 `{...separateAggregateItem, taxBaseDate: targetDate}`를 `calculateSeparateAggregateTax`에 위임). ⑫가 빠지면 ④가 보낸 값이 엔진에 닿지 않는다(TS 미감지) — §8 grep 자가 점검.

### 1.4 현행 엔진이 읽는 것 (정독 — `lib/tax-engine/separate-aggregate-land.ts`)

- 건축물 존재: `buildingFloorArea > 0 || demolished === true`(`:190-192`). 철거면 `demolishedStatusPeriodMonths(baseDate, false)`(`:212` — **`vacantHouse`는 항상 `false`**) → 6/12개월, 0이면 시행 전 종합합산(`:231-246`), 기간 초과면 종합합산(`:253-269`).
- **허가·건축 외 용도·빈집정비·공용 사용은 입력도 판정도 없다** — 이 기능의 대상.
- 단일 필지 경로는 **별도합산 인정분만 세액화**하고 초과분은 경고 문구 «종합합산과세대상으로 이관됩니다. 인별 합산 계산 시 별도 처리가 필요합니다»(`property-tax.ts` 이관 경고 — probe §0.2 출력)로만 알린다. 결과 객체에는 인정/이관 면적·가액이 없다(`PropertyTaxResult` 필드 목록에 별도합산 echo 없음 — 정독).
- 과세기준일: 화면은 `targetDate`를 **보내지 않는다**(`buildPropertyTaxRequestBody` 전 구간에 `targetDate` 없음 — 정독). 엔진은 `input.targetDate ?? \`${new Date().getFullYear()}-06-01\``(`property-tax.ts:376-377`), route 세율 조회도 같은 규칙(`route.ts:88-89`). 클라이언트의 이력 `taxLawVersion`도 `new Date().getFullYear()`(`PropertyTaxForm.tsx:38`). **즉 화면의 과세기준일 = 서버 현재 연도 6.1.**(올해 = 2026.6.1.).

---

## 2. 사용자 시나리오 — 무엇을 알고 무엇을 모르는가

철거한 토지의 소유자는 보통 **철거일**은 안다(철거 신고·멸실등기). 모르거나 흔히 틀리는 것:

- **허가·사용승인**: 건축물대장·허가대장을 봐야 안다. 무허가·미사용승인 건축물이었다면 이 특례 자체가 없다 — 사용자가 «건물이 있었다»만 떠올리고 넘어가기 쉽다.
- **철거 후 용도**: «나대지로 두었다»는 건축 외 용도가 아니다(법문은 «건축을 위한 용도 외의 다른 용도») — 주차장·야적장·경작 등이 건축 외 용도. 일부만 그렇게 썼는지도 흔한 상황.
- **빈집정비 철거**: 「빈집 및 소규모주택 정비에 관한 특례법」 빈집정비사업 또는 「농어촌정비법」 생활환경정비사업(빈집 정비)으로 철거한 것인지 — 철거비 지원 사업이라면 해당 가능.
- **국가 등 공용·공공용 사용**: 지자체가 마을주차장·소공원으로 빌려 쓰는 경우 등. 계약서·재산세 과세내역으로 확인.

→ **«모름»을 허용하되 혜택을 인정하지 않고 확인 필요로 표시**(양도세 선례 UQ — `feedback_unknown_fact_applies_unfavorably`). **미선택은 ⑧이 막는다**(가정값 없음).

---

## 3. 엔진 계획서와의 계약 (E-n — 엔진 문서 v2 §5.9·§13과 **이름 정합 완료**)

> 엔진 정본: `lib/tax-engine/property-separate-requirements.ts`(판정·요구 술어) · `lib/tax-engine/property-land-split-tax.ts`(이관분 세액). UI는 날짜·시행본을 비교하지 않고 **엔진 술어만** 부른다. 양도세 leaf(`non-business-land/*`)·`DemolishedFact` 타입은 **import하지 않는다**(엔진 §5.1 의존 규칙 — 재산세 → 양도세 서브엔진 역방향 금지).

**이름 대응(v1 UI 제안 → 엔진 정본)**

| v1 UI 제안 | 엔진 정본 (엔진 문서 §5.9) |
|---|---|
| `propertyDemolishedRequired` | **`propertyDemolishedRequired({ taxBaseDate, removedOn, kind })`** → `{ permit, otherUse, vacantHouse, floorArea }`(`floorArea`는 용도지역 포함) |
| `demolishedPublicUseAsked`(양도세 leaf) | **`propertyDemolishedPublicUseAsked(need, facts)`** → `{ publicUse, paid }`(재산세 소유 — **날짜 칸 없음**) |
| `propertyDemolishedFactIssue` | **`propertyDemolishedFactIssue(i)`** → `{ field, message } \| null`(⑧·⑫ 공유) |
| `DemolishedFact`(`non-business-land/land-usage.types`) | **`PropertyRequirementFact`**(`""\|"yes"\|"no"\|"unknown"` — 재산세 leaf 소유) · `PropertyDemolishedKind`(`"house"\|"building"`) |
| (신규) 본 경로 허가 | `propertyBuildingPermitRequired(s: Date): boolean` |
| (신규) 합산 칸 요구 | `propertyLandSplitRequired(verdict, landTaxType)` → `{ otherSeparate: boolean, otherComprehensive: boolean }` |
| (신규) 과세기준일 | `resolvePropertyTaxBaseDate(targetDate?, now?)` — 엔진·route·⑧ 공유(Q-10 (나): 화면은 `targetDate`를 안 보내므로 올해 6.1.) |
| 어댑터 파일 | UI 시니어가 `lib/calc/property-separate-requirements.ts`를 둔다(엔진 §5.9 지정 — v1의 `lib/calc/property-separate-requirements.ts`는 이 이름으로 통합) |
| 결과 echo | 엔진 §5.6 `demolishedVerdict`(판정 사유·요구 칸 echo) + §13.3(b) **`landSplit`**(별도합산분 / 종합합산 이관분 / 합계) |
| 접힘 사유 코드 | 엔진 `"not_yet"\|"period"\|"permit"\|"other_use"\|"public_use_unpaid"`(v1의 `demolished_*` 선례 코드를 쓰지 않는다 — 재산세 소유 어휘) |

| # | 요구 | 엔진 문서 응답(상태) |
|---|---|---|
| **E-1** | 노출 술어 `propertyDemolishedRequired` — **⑤ 노출 = ④ 전송 = ⑧ 차단 = ⑫ 400 = 엔진 읽기의 단일 술어**. 철거일·`kind` 미입력·`철거일 > s`이면 전부 `false`(행 결함이 먼저) · 한시 기간 밖이면 사실 요구 0 | ✅ 엔진 §5.4 |
| **E-2** | 하위 칸 술어 = `propertyDemolishedPublicUseAsked`(건축 외 용도 «예» ∧ 빈집정비 «예» → 공용 사용 → «예»이면 유료). **날짜 칸 없음**(Q-6 (가)) | ✅ 엔진 §5.4 · §5.5 |
| **E-3** | `propertyDemolishedFactIssue` 한 함수를 ⑧·⑫가 공유(첫 결함 1개 + 문구 — 엔진이 문장 정본) | ✅ 엔진 §5.9 |
| **E-4** | 와이어: `separateAggregateItem.demolishedKind`·`demolishedPermit`·`demolishedOtherUse`·`demolishedVacantHouse`·`demolishedPublicUse`·`demolishedPublicUsePaid`(값 `PropertyRequirementFact`). **합산 칸 2개는 `separateAggregateItem` 밖 최상위**(`otherSeparateAggregateValue`·`otherComprehensiveValue` — 직접 종합합산 선택 경로도 쓰므로 — 엔진 §13.6 ⑨⑩⑫) · 본 경로 허가 `separateAggregateItem.buildingPermit` | ✅ 엔진 §5.5 · §13.6(키 이름 일치) |
| **E-5** | 결과 echo: `demolishedVerdict`(holds/fold·사유·기간 개월·요구 칸·`vacantHouseExtensionUnconfirmed`) + `landSplit`(분류별 `ownValue`·`otherValue`·`combinedTaxBase`·`combinedGrossTax`·`share`·`appliedRate`·`progressiveDeduction`·`ownTaxBase` · 이관 사유 `transferReasons[]` · `taxBeforeCap`·`cap`·`jurisdictionBasis`). 고지 문장은 엔진 상수 | ✅ 엔진 §5.6 · §13.3(b) |
| **E-6** | 사유→문구는 UI가 읽기만(엔진 §5.8 상수) | ✅ |
| **E-7** | 철거일 > 과세기준일 | ✅ **Q-11 (가): ⑧ 차단 + ⑫ 400**(«철거일은 과세기준일 이전이어야 합니다») |
| **E-8** | 철거 주택은 **바닥면적·용도지역 비요구**(Q-8 (가) — 엔진 `floorArea` 술어가 건축물 ∧ 2024.6.1.~일 때만) → 기존 ⑧ «바닥면적 필수»(`shared.ts:409-410`)·⑫(`property-input.ts:408-414`)를 **술어 따르기로 교체** | ✅ 엔진 §5.4 · §6 ⑩ |
| **E-9** | 엔진 직접 호출(`isSeparateAggregateLand`)에서 요구 칸 `""`는 «yes 아님» → **접힘**(throw 없음) — 입구는 Zod·⑧이 막는다. 기존 테스트 픽스처에 새 칸 명시(엔진 §8.1) | ✅ 엔진 §5.3 · §8.1 |
| **E-10** | **합산 칸 요구 술어 `propertyLandSplitRequired`** — 입력은 `isSeparateAggregateLand` 결과 요약(`recognizedArea > 0`·`excessArea > 0`). UI는 **같은 순수 함수로 미리 판정**(어댑터)해 칸을 연다 | ✅ 엔진 §13.3(c) |
| **E-11** | 세부담상한 recompute를 **별도합산 선택에도** 연다(분류별 직전 세율 재산정 — 엔진 Q-15 (가) **결정됨 — 추천안 채택**: 이관분이 있는데 direct면 상한 미적용 + 고지). 현행 `Step3.tsx:62-70` `isRecomputeTarget`은 건축물·선박·항공기·종합합산 토지뿐 | ✅ 엔진 Q-15 결정됨(추천안 채택) |

## 4. 화면 스펙 ⑤

### 4.1 위치·순서 (계산 순서 = 표시 순서)

`Step2SeparateAggregate.tsx` 철거 토글(`:83-88`) → 철거일(`:90-102`) **바로 뒤**, `saDemolished`가 켜졌을 때만. 신규 컴포넌트 `components/calc/property/SeparateAggregateDemolishedFacts.tsx`(~150줄) 한 개 — `Step2SeparateAggregate.tsx`는 105줄 → ~112줄.

| 순서 | 칸 | 노출 | 형태 |
|---|---|---|---|
| 0 | (기존) 철거 토글 · 철거일 | `saDemolished` | 유지 |
| 1 | 철거된 건축물 종류 | `saDemolished` ∧ 철거일 입력 | `RadioCardGroup` 2택(주택 / 주택이 아닌 건축물), 미선택 `""` |
| 2 | 허가·사용승인 | E-1 `permit` | `RadioCardGroup` 3택(예·아니오·모름) |
| 3 | 철거 후 건축 외 용도 사용 | E-1 `otherUse` | 3택(아니오·예·모름 — 질문 문장 순서) |
| 4a | 빈집정비사업 철거 | E-1 `vacantHouse`(주택 한정) | 3택(예·아니오·모름) |
| 5 | 국가 등 공용·공공용 사용(2호 단서) | E-2 | 하위 `ToneCard` — 선례 컴포넌트 구조 |
| 6 | 철거 전 바닥면적 | E-1 `floorArea`(건축물 한정) | **기존 «건물 바닥면적» 칸 재사용**(§4.5) — 새 칸 없음 |

종류(1) 미선택·철거일 미입력이면 2~6은 그리지 않고 안내 한 줄: «철거일과 철거된 건축물 종류를 입력하면 확인할 사실 칸이 표시됩니다.»(`data-testid="pt-demolished-dates-notice"` — 선례 `…-demolished-dates-notice`).

### 4.2 칸 문구 (선례 문구를 재사용하되 «이 계산기»·과세기준일 표현을 재산세 단일 필지에 맞춘다)

- **종류**: «철거된 것은 주택입니까, 주택이 아닌 건축물입니까?» — hint: 「빈집정비사업 3년」은 주택(빈집)에만, 「철거 전 바닥면적 × 용도지역 배율」 범위는 건축물에만 적용되어 묻습니다. 공장용지(위 «공장용지» 켬)는 건축물입니다. — 라디오 tone `sky`(이 단계 지배 톤), 값 `house`·`building`.
- **허가·사용승인**: «철거된 건축물(주택)이 건축 관계 법령상 허가·사용승인을 받은 것이었습니까?» — 선례 힌트 그대로(건축물대장·허가대장 확인 · 모름은 인정하지 않고 확인 필요로 표시). 톤 `amber`.
- **건축 외 용도**: «철거 후 그 토지를 건축을 위한 용도 외의 다른 용도로 사용했습니까?» — 선례 힌트 + **「일부만 그렇게 썼으면 그 부분만 제외되지만 이 계산기는 면적을 안분하지 않아 «예»로 처리하고 확인 필요로 표시합니다」**(UQ-5 결정 대상). 나대지로 둔 것은 건축 외 용도가 아니다 한 줄 추가.
- **빈집정비**: «철거된 주택이 빈집정비사업 등으로 철거된 빈집이었습니까?» — 힌트: 「빈집 및 소규모주택 정비에 관한 특례법」 빈집정비사업 또는 「농어촌정비법」 생활환경정비사업(빈집의 정비에 관한 사업만)으로 철거했으면 «예»(철거일부터 3년), 아니오·모름은 일반 한시 기간(과세기준일 시행본 — 2026.6.1.~ 1년)만 인정하고 3년 연장은 확인 필요.
- **공용 사용 하위 칸**(엔진 Q-6 (가) 결정 — 2칸·날짜 없음): ① «**과세기준일(올해 6.1.) 현재** 그 부속토지를 국가·지방자치단체·지방자치단체조합이 1년 이상 공용 또는 공공용으로 사용하고 있습니까? (1년 이상 사용할 것이 계약서 등으로 입증되면 «예»)» ② «그 사용이 유료이거나 소유권 유상이전 약정 후 취득 전 미리 사용한 것이라 재산세가 부과됩니까?(「지방세법」 §109② 단서)» — 선례 힌트(무상이면 재산세 비과세라 «아니오» · 일부만이면 «아니오»).
- **«올해 6.1.» 표기**: 힌트의 과세기준일은 `new Date().getFullYear()` 문자열 보간으로만 쓴다(서버 규칙과 동일 — §1.4 · V-3). UI가 날짜 비교를 하지 않으므로 표기용일 뿐이다.

### 4.3 컴포넌트 규칙

- `RadioCardGroup`(native radio 금지 · OFF도 tone 유지) · `FieldCard`(label·hint·`required`·`field`) · `ToneCard`(amber 안내 — 인라인 톤 하드코딩 금지) · `CollapsibleHintCard`(선례 «예외의 요건과 이 계산기의 처리» 접힘). 라벨 크기 = 정본 클래스(`text-sm`·`text-xs`·`text-caption`) — 임의 `text-[Npx]` 금지(pre-push 게이트).
- 라디오 `layout="inline"` 3택 → 375px에서 줄바꿈(`flex-wrap`) 확인 필요(V-6 — 선례는 같은 레이아웃으로 모바일 E2E 통과했는지 미확인).
- `data-testid`: `pt-sa-demolished-kind-{house|building}` · `pt-sa-demolished-permit-{yes|no|unknown}` · `…-otheruse-…` · `…-vacanthouse-…` · `…-publicuse-…` · `…-publicusepaid-…` · 블록 `pt-sa-demolished-facts`. 선례의 `nbl-other-state-event-{i}-demolished-…` 접두어는 쓰지 않는다(재산세 `pt-` 접두어 — `pt-factory-total-area` 선례 `Step2Separated.tsx:237`).
- `useEffect → store` 미러링 없음: 블록은 렌더 파생(`propertyDemolishedRequired` 호출) + 쓰기는 `onChange`뿐. 하위 칸이 사라져도 **저장값을 지우지 않는다**(숨은 값 보존 — ④가 보내지 않고 ⑧이 묻지 않는다).

### 4.4 선례 컴포넌트 재사용 검토 (양도세 마법사 vs 재산세 마법사 구조 차이)

| 선례 | 재사용? | 이유 |
|---|---|---|
| `OtherLandDemolishedFactsField` | **그대로는 불가** — 사건 행 인덱스(`index`·`idKey`)·`NblOtherStateEventInput`(`demolishedPermitBefore`…)·`DemolishedRowView`·미리보기 `StateHistoryPreviewRow`에 묶여 있다. 구조·문구·힌트·ToneCard 배치는 **복제 기준** | 양도세는 `AssetForm` 사건 배열, 재산세는 평면 `FormState` |
| `OtherLandDemolishedPublicUseField` | 마찬가지(`event`·`patchEvent` prop). **답 의존 사슬 술어는 재산세 소유 `propertyDemolishedPublicUseAsked`를 import**(양도세 `demolishedPublicUseAsked`는 부르지 않는다 — 엔진 §5.1) | 술어 단일 소스 |
| 라디오 옵션 헬퍼 `answerOptions`·`PERMIT_LABELS`·`OTHER_USE_LABELS`·`VACANT_LABELS` | 컴포넌트 안의 모듈 상수 — 공용으로 올리지 않고 **신규 컴포넌트에 3줄씩 둔다**(단일 사용처 2곳에 추상화 금지) | Simplicity |
| `nbl-confirm-notices.ts`의 고지 상수 | 문장이 «나대지 구간·양도일» 맥락 — 재산세용 고지는 **엔진이 재산세 문구로 새로 낸다**(E-5) | 문장 단일 소스는 엔진 |
| `lib/calc/nbl-demolished-row-scope.ts` | 불가(사건 배열 전제) → 재산세용 평면 어댑터 `lib/calc/property-separate-requirements.ts` 신설(엔진 §5.9 지정 이름)(`lib/calc/one-house-demolished.ts` 구조 선례: ④ payload·⑧ 이슈·⑤ 노출 술어를 한 leaf에) | 14지점 단일 소스 |

### 4.5 철거 전 바닥면적 = 기존 «건물 바닥면적» 칸 재사용

`saBuildingFloorArea`는 철거 여부와 무관하게 별도합산 ⑧·⑫의 필수 칸(`shared.ts:409-410` · `property-input.ts:408-414`)이고 엔진이 `calculateBaseArea`에서 읽는다. 철거 건축물에서는 **그 값이 곧 «철거 전 건축물 바닥면적»**이므로 새 필드를 두지 않는다. `saDemolished` ON이면 라벨·힌트만 «철거 전 건축물 바닥면적(㎡)» / «철거ㆍ멸실되기 전 건축물의 바닥면적(건축물 외의 시설은 수평투영면적)…»으로 **표시만** 바꾼다(`Step2SeparateAggregate.tsx:62-75`의 표시 분기 — 저장·전송 불변). 주택 철거에서 이 칸이 필요한지는 E-8(엔진 결정) — 필요 없으면 ⑧·⑫·표시가 `floorArea` 술어를 따른다.

### 4.6 기존 문구 정정 (요건을 가리는 단정 문구)

`Step2SeparateAggregate.tsx:85` «철거·멸실 후 1년 이내 별도합산 유지 특례» → «철거·멸실 후 한시 별도합산 특례 — 허가·용도·빈집 요건 확인(시행령 §103의2)». `:96-98` 힌트 «철거·멸실일부터 1년 이내이면 별도합산 유지 특례 적용» → «철거·멸실일부터 과세기준일 시행본의 한시 기간(6개월 · 2026.6.1.~ 1년) 이내이고, 아래 요건을 충족하면 특례가 적용됩니다.» (기간은 UI가 계산하지 않고 문구로만.)

### 4.7 본 경로(비철거 건축물) 허가·사용승인 칸 (Q-2 적용 — PSA-E3)

`Step2SeparateAggregate.tsx`의 «건물 바닥면적»(`:62-75`) **뒤**, 철거 토글 **앞**에 `saDemolished === false`일 때만 3택(예·아니오·모름) «이 건축물이 건축 관계 법령상 허가·사용승인(임시사용승인 포함)을 받은 것입니까? 받을 필요가 없는 건축물이면 «예»» — 노출 술어 `propertyBuildingPermitRequired(s)`(영 §101① 단서 — 과세기준일 ≥ 2011.6.1.). «아니오»·«모름»은 별도합산 접힘 + 확인 필요 → **종합합산 이관분 세액**(엔진 §13). 미선택은 ⑧ 차단 + ⑫ 400. 철거 토글 ON이면 이 칸은 숨기고 §4.1의 허가 칸(철거 전 건축물의 허가)이 같은 값 의미를 가진다 — **한 시점에 한 칸만** 노출(FormState는 `saBuildingPermit`(본 경로)와 `saDemolishedPermit`(철거) 두 키 — 의미가 달라 합치지 않는다: 하나는 «지금 있는 건축물», 하나는 «철거된 건축물»).

---

## 5. 클라이언트 지점 — 변경 명세

### 5.1 ① FormState·② initial (`shared.ts:174-175`·`:271-272` 바로 뒤)

```ts
saDemolishedKind: "" | "house" | "building";
saDemolishedPermit: PropertyRequirementFact;   // "" | "yes" | "no" | "unknown" — 엔진 `property-separate-requirements.ts` type-only import(양도세 `DemolishedFact` 아님)
saDemolishedOtherUse: PropertyRequirementFact;
saDemolishedVacantHouse: PropertyRequirementFact;
saDemolishedPublicUse: PropertyRequirementFact; // 엔진 Q-6 (가): 과세기준일 현재 공용 사용 중
saDemolishedPublicUsePaid: PropertyRequirementFact; // 하위 — 유료·부과
saBuildingPermit: PropertyRequirementFact;     // 본 경로(비철거) 허가·사용승인 — Q-2
otherSeparateAggregateValue: string;           // 같은 관할구역 타 별도합산 공시가액 합계(원 — 금액 문자열, 빈칸 = 미입력, 0 = 없음 명시)
otherComprehensiveValue: string;               // 같은 관할구역 타 종합합산 공시가액 합계
```

initial 전부 `""`(합산 칸 포함 — 빈칸 ≠ 0). **3중 패턴 해당 없음 근거**: 이 칸들은 UI display fallback이 없다(미선택 = 그대로 `""`). 따라서 ④·⑧이 «기본값으로 채워 통과»시키는 경로 0.

### 5.2 ⑤ 위젯 — §4. 새 컴포넌트가 import하는 것: `FieldCard`·`RadioCardGroup`·`ToneCard`·`CollapsibleHintCard`·엔진 술어(E-1·E-2)·`lib/calc/property-separate-requirements.ts`.

### 5.3 ③ normalize·구 세션 — 해당 없음 (§1.1 근거)

이력에서 폼을 복원하는 경로가 없고 폼이 세션 저장소에 올라가지 않으므로 **구 세션에서 신규 필드가 `undefined`로 들어오는 경로가 없다**. 단 두 곳을 «확인 필요»로 둔다: ⓐ `lib/storage`가 `inputData: form`을 저장하므로 **이후 이력 복원 기능이 생기면** 신규 필드 `undefined` → `""` 정규화가 필요(지금은 범위 밖 · 재산세 `FormState` 전체에 해당하는 기존 한계) ⓑ 전문가 의뢰인 모드 `ProfessionalClientGate`가 폼을 prefill하는지(정독 — `app/calc/property-tax/page.tsx`는 게이트만 감싼다).

### 5.4 ④ API 변환 — `lib/calc/property-separate-requirements.ts`(신규 leaf, `one-house-demolished.ts` 구조)

```
buildSeparateDemolishedPayload(form, taxBaseDate) -> {
  demolished: true, demolishedDate,
  demolishedKind?, demolishedPermit?, demolishedOtherUse?, demolishedVacantHouse?,
  demolishedPublicUse?, demolishedPublicUsePaid?   // E-1·E-2가 true인 칸만
}
```

- 게이트 = **엔진 술어 결과**(`propertyDemolishedRequired` · `propertyDemolishedPublicUseAsked`)이지 `form.saDemolished`만이 아니다. 철거 토글 OFF면 사실 전부 미전송(기존 `shared.ts:561-563`과 같은 방식). 종류 변경·답 변경으로 숨은 칸은 **미전송**(stale 차단 — 선례 «숨은 값 보존 · ④가 보내지 않는다»). 예: 종류 `house` → `building`으로 바꾸면 `saDemolishedVacantHouse`는 폼에 남지만 body에서 사라진다.
- `taxBaseDate` 인자: 화면은 `targetDate`를 보내지 않으므로 술어 평가용 과세기준일을 **서버 기본과 같은 규칙**(`${올해}-06-01`)으로 만든다(V-3: 연말 경계에서 클라이언트·서버 연도가 갈릴 수 있음 — UQ-7).
- `shared.ts` 변경은 `buildPropertyTaxRequestBody`의 철거 스프레드(`:561-563`)를 `...buildSeparateDemolishedPayload(...)` 한 줄로 바꾸는 것뿐.

### 5.5 ⑥ 사이드바 — 해당 없음 (재산세 마법사에 사이드바·합계 카드 없음).

### 5.6 ⑦ 결과 카드 — §7.

### 5.7 ⑧ validation — §6. ⑫ Zod — `property-input.ts:143-148` 뒤에 신규 키(`separateAggregateItem` 안 사실 6칸 + `buildingPermit`) + **최상위** 합산 2칸 + `:417-423` superRefine에 E-3·E-10 호출. ⑭ — 매핑 불요. **계산 직전 재검증(UQ-6 채택)**: `PropertyTaxForm.tsx` `handleNext`의 step 3 분기(`:136-138`)에서 `runCalculation` 전에 `validateStep(0)`·`(1)`·`(2)`·`(3)`을 순서대로 재실행해 첫 오류를 `setError`(3~6줄). 현행은 step 3 검증을 아예 호출하지 않는다(`grep validateStep( components` — 재산세 호출은 `:116·123·130`뿐) → **`validateStep(3)`의 기존 규칙(recompute 직전 과표 형식 · 주택 경과조치 직전 본세)도 UI에서 처음으로 실행**된다(§8.5 N-7).

### 5.8 합산 입력·세부담상한 칸 (Q-9 결정 — 엔진 §13.3(c)(d) · UI 몫)

- **위치**: **Step 3 상단** «같은 지방자치단체 관할구역의 다른 토지(합산)» 블록. 별도합산·종합합산 선택 모두에서 Step 3을 지나므로(종합합산은 Step 2 없음) 한 곳에 둔다. 칸은 **`propertyLandSplitRequired`가 연 것만** 노출 — 어댑터가 `form`에서 `isSeparateAggregateLand`와 같은 순수 함수로 **이관 판정 미리보기**(별도합산 선택일 때 · 입력 필드가 §4의 사실 칸 + 면적·바닥면적·용도지역이라 Step 2 이후에는 모두 있다)를 돌려 `{ otherSeparate, otherComprehensive }`를 얻는다. 종합합산 직접 선택이면 `otherComprehensive`만 항상.
- **칸**: `CurrencyInput` 2개(금액 입력 표준 — 콤마·select-on-focus 내장). 라벨 «이 토지 외에 **같은 지방자치단체 관할구역**에서 소유한 **종합합산**과세대상 토지의 공시가액 합계(원) — 없으면 0 입력» / 별도합산 동형. hint: 재산세는 종부세와 달리 **관할구역(시·군·구)별로 합산**합니다(「지방세법」 §113①) — 다른 시·군·구 토지는 넣지 않습니다. **기본값 0 금지**(빈칸 = 미입력 = ⑧ 차단 — «없음»은 0을 직접 입력).
- **세부담상한**: 현행 Step 3의 recompute 선택 조건(`Step3.tsx:62-70`)에 **이관분이 생기는 별도합산 입력**을 추가(엔진 E-11·Q-15 결정 후). 이관분 > 0 ∧ direct 선택이면 엔진이 상한 미적용 + 고지를 내므로 UI는 direct 선택지 옆에 «이관분이 있으면 직전 과세표준(recompute)을 권장합니다» 한 줄(고지 문장은 엔진 상수).
- ⑧ 규칙: 요구된 합산 칸이 빈칸이면 «같은 관할구역에 이 토지 외 {종합합산|별도합산}과세대상 토지가 없으면 0을 입력하세요 — 합산 과세라 이 필지의 세액이 달라질 수 있습니다.» 음수·비수치 차단(`parseAmount`). 이 검사는 `validateStep(3)`에 두고 **계산 직전 재검증 대상에 포함**(§5.7·UQ-6).
- ④: 요구되지 않은 합산 칸은 body에서 **생략**(stale 비전송) — 엔진은 안 읽는다.

---

## 6. ⑧ 검증 규칙 · ⑧↔⑫ parity 격자

### 6.1 규칙 (⑧ = `validateStep(2)`의 철거 부분 — 기존 `:411` 뒤)

`propertyDemolishedFactIssue`(E-3 — 엔진 leaf) **한 함수**를 ⑧(`shared.ts` → `lib/calc/property-separate-requirements.ts`의 `demolishedStepIssue(form, taxBaseDate)`가 호출)과 ⑫(`property-input.ts` superRefine)가 같이 부른다. 규칙 순서(= 화면 순서):

1. `saDemolished` ∧ 철거일 빈칸 → 기존 문구 유지(`:411`).
2. 철거일 ∧ 종류 `""` → «철거된 것이 주택인지 주택이 아닌 건축물인지 선택하세요 — 빈집정비 3년은 주택에만, 바닥면적×배율 범위는 건축물에만 적용되어 판정에 필요합니다.»
3. E-1 요구 칸이 `""` → 선례 메시지 형식 `…번째` 제거·재산세 문구: «철거한 건축물·주택이 허가·사용승인(임시사용승인 포함)을 받은 것인지 선택하세요. 받지 않은 건축물·주택의 부속토지는 특례에서 제외되어 판정에 필요합니다(모르면 「모름」).» · 건축 외 용도 · 빈집정비 · 공용 사용(E-2) · 유료 — 문구는 선례(`demolished-row-facts.ts:66-92`)를 재산세에 맞게 옮긴다. 정확한 문구는 엔진 leaf가 단일 정본(UI가 문장을 짓지 않는다).
4. **명시 «모름»·«아니오»(허가) 등은 막지 않는다** — 엔진이 접고(종합합산) 확인 필요로 고지(§7). 미선택 `""`만 막는다.
5′. **철거일 > 과세기준일**(엔진 Q-11) → «철거일은 과세기준일(올해 6.1.) 이전이어야 합니다 — 과세기준일 현재 건축물이 있으면 철거 칸을 끄세요.»
5″. 합산 칸(`propertyLandSplitRequired`가 연 것) 빈칸 → §5.8 문구.
5. 공장용지(`saIsFactory`) ∧ 종류 `house` → **모순 차단**(공장용 건축물은 주택이 아니다): «공장용지를 켰는데 철거된 것을 주택으로 선택했습니다 — 종류를 확인하세요.» (UQ-8 — 자동으로 `building`을 채우는 것은 금지: 미러링·침묵 fallback.)

### 6.2 필드 점프

재산세에는 `ValidationIssue.field` 구조가 없다(§1.1). **이 기능에서 신설하지 않는다**(UQ-6 (나)): 오류 문자열 + 빨간 박스(기존 방식). `FieldCard field=` 앵커(`data-field`)는 신규 칸에 붙여 두되(선례 호환 — 비용 0) 점프 로직은 만들지 않는다. 단 §1.1의 우회 경로 때문에 **계산 직전 재검증**(UQ-6 (가) 추천)이 필요하다.

### 6.3 ⑧↔⑫ parity 격자 (구현·테스트 계획 — 전수 대조)

축: 철거 토글 {OFF, ON} × 종류 {"", house, building} × 철거일 {빈칸, 기간 안, 기간 밖(요건 0)} × 각 사실 {"", yes, no, unknown} 중 노출된 칸 × `saIsFactory` {off, on} × 하위 사슬. 각 셀마다 **⑧ 통과/차단**과 **⑫(`POST /api/calc/property`) 200/400**이 일치해야 한다. 구현 전략: 두 계층이 **같은 엔진 함수**를 호출하므로 어긋남은 «호출 인자 매핑»(FormState → 와이어)에서만 생긴다 → 격자 anchor는 `formState → buildPropertyTaxRequestBody → safeParse(Zod)` vs `validateStep(2)`를 **같은 케이스 배열**로 돌려 (blocked ↔ 400) 짝을 단언한다(선례 `feedback_fe8_vs_12_parity_grid`). 격자는 약 60~90행(자동 생성 — 손으로 쓰지 않는다).

경계 셀(반드시 포함): 철거 직후 1일 · 1년 당일 · 1년+1일 · 3년 당일(주택) · 2026.6.1. 전 시행본(직접 API `targetDate 2025-06-01`) · 철거일 > 과세기준일(E-7) · `saIsFactory` on + house.

---

## 7. ⑦ 결과 표시 · 확인 필요 고지 · 분할 결과 (Q-9 결정 반영 — 엔진 §13.3(b) `landSplit` 소비)

현행 결과 화면은 토지 분류·철거 판정을 구분하지 않는다(§1.3 ⑦). 신규 echo를 읽어 **새 카드 한 종류(`results/PropertyLandSplitCard.tsx` — 철거 판정은 같은 카드의 첫 블록)**를 둔다. 토지·별도합산/종합합산 입력일 때만 렌더(`landSplit` 있을 때).

1. **«토지 과세 구분 결과» 카드** — 한 표(산식 표기 규칙: 한국어 풀어쓰기·변수 약어 금지):
   | 구분 | 이 필지 공시가액 | 같은 관할구역 다른 토지 | 합산 과세표준 | 합산 산출세액 | **이 필지 몫** |
   |---|---|---|---|---|---|
   | 별도합산분 | … | (입력값) | … | … | … |
   | 종합합산 이관분(또는 직접 선택분) | … | (입력값) | … | … | … |
   | **합계(본세)** | | | | | **determinedTax** |
   헤드라인 = **이 필지 몫**(엔진 Q-14 (가) — 합산 입력이 0이면 합산 세액 = 몫). 합산 입력이 > 0이면 한 줄 «합산 과세 가정: 입력하신 다른 토지 공시가액 N원을 같은 관할구역에서 합산했습니다 — 이 필지의 세액은 합산 세액을 공시가액 비율로 나눈 값입니다(필지별 안분 방식은 확인 필요)».
2. **이관 사유 한 줄**(분할이 있을 때): 엔진 `transferReasons[]`를 «철거 후 1년 경과 / 허가·사용승인 미확인 / 건축 외 용도 사용 / 기준면적 초과(N㎡) / 건축물 없음» 등 문구로(엔진 상수 — UI는 코드→문장 사전 1개). **«모름»이 사유면** «인정하지 않고 종합합산으로 보았습니다 — 확인 필요» + 엔진 고지 문장(`confirmNotices` 그대로).
3. **철거 특례 판정 블록**(철거 ON일 때): 「철거ㆍ멸실일 → 과세기준일 현재 N개월 경과 · 한시 기간 {6개월|1년|3년(빈집정비)} → **별도합산 유지** | **종합합산으로 접힘(사유)**」 + 요건 응답 요약(변수명 라벨) + 3년 연장 미반영 고지(주택 ∧ 빈집정비 ≠ 예).
4. **0원은 «세금 없음»이 아니다**: 별도합산분 몫이 0이어도 이관분 몫이 합계에 들어가므로 합계가 0이 되는 입력은 사실상 사라진다. 합계가 0이면 그 이유(예: 무상 공용 §109② 비과세 가능성 고지 — 엔진 문구)를 카드가 보여준다.
5. **세부담상한**: 상한 적용 시 «상한 전 본세 → 상한 후»(엔진 `taxBeforeCap`·`cap`) 한 줄, direct + 이관분이면 미적용 고지(엔진 상수).
6. **총 납부세액 행 라벨은 «총 납부세액»을 유지**한다(v1의 «별도합산 인정분 총 납부세액» 라벨 변경안은 **폐기** — 이관분이 합계에 포함되므로 오독 소지가 사라졌다). 부가세(지방교육세·도시지역분)는 기존 `surtax` 행 그대로(엔진 Q-18 (가) 현행 `calcSurtax`).
7. 인쇄·PDF: 신규 카드를 `PropertyPrintSectionId`에 추가해야 선택 출력에 나온다(`availablePrintIds` — `PropertyTaxResultView.tsx:387-399` 패턴) — 새 섹션 id `land-split`(`PROPERTY_PRINT_SECTIONS` 목록 추가 · PDF 생성기 `generateResultPdf` taxType `property` 섹션 렌더 추가 — **정독 안 함 · 확인 필요**, V-5).
8. 이력 상세(`HistoryDetailDrawer.tsx:126-131`)는 숫자 4개만 — 변경 없음(`totalPayable`은 합계로 자연 반영).

## 8. 케이스 매트릭스 · 테스트 · E2E · 14지점 자가 점검

### 8.1 시료·기대값 (현행 엔진 실측 §0.2 + **이관분 세액 포함 후 오라클** — Q-9 결정으로 «접힘 시 0» 기대값을 전부 이관분 세액 포함 값으로 교체)

기준 시료 S: 상업지역 · 1,000㎡ · 공시가격 10억 · 바닥면적 100㎡(기준 300㎡) · 과세기준일 2026.6.1. · 합산 입력 0 · 세부담상한 없음 · 비도시지역. 금액 = 총 납부세액(본세 + 지방교육세 20%). 오라클 = 현행 엔진 직접 호출(`calculatePropertyTax` 별도합산 · `calculateComprehensiveAggregateTax`) + 엔진 §13 프로토타입(probe 스크래치패드 — 코드 변경 0).

| 케이스 | 입력 | 현행(실측) | **이 기능 후 기대(오라클)** | 바뀌는 PR |
|---|---|---|---|---|
| C1 | 철거 2026-03-01 · 건축물 · 허가 예 · 건축 외 아니오 | 516,000 | **3,156,000**(별도합산분 430,000 + 이관분 2,200,000[700㎡: 과표 490,000,000] = 본세 2,630,000 + 지방교육세 526,000) — **현행 «대조군 516,000 불변»은 E4에서 깨진다**(700㎡ 이관분이 세액에 들어옴) | E4 |
| C2 | 〃 · 허가 **아니오** | 516,000 | **3,900,000**(전량 이관 1,000㎡: 과표 700,000,000 → 3,250,000 + 650,000) — 접힘 `permit` | E2 |
| C3 | 〃 · 허가 **모름** | 516,000 | **3,900,000** + «인정하지 않음 — 확인 필요» | E2 |
| C4 | 〃 · 건축 외 용도 **예** | 516,000 | **3,900,000**(`other_use`) | E2 |
| C5 | 철거 2025-06-01(1년 당일) · 건축물 · 예·아니오 | 516,000 | **3,156,000**(= C1) | E4 |
| C6 | 철거 2025-05-31 · 건축물 | **0** | **3,900,000**(`period` 접힘 — 요건 칸은 **노출되지 않는다**: 한시 기간 밖) | E4 |
| C7 | 철거 2024-03-01 · **주택** · 허가 예 · 건축 외 아니오 · 빈집정비 **예** | **0** | **2,280,000**(주택 면적 한도 없음 → 1,000㎡ 전부 별도합산 과표 700,000,000 → 1,900,000 + 380,000) | E2(+E4) |
| C8 | 〃 · 빈집정비 **아니오/모름** | 0 | **3,900,000** + 3년 연장 미반영 고지 | E4 |
| C9 | 〃 · 건축 외 용도 **예** · 빈집정비 예 · 공용 사용 예 · 유료 예 | 0 | **2,280,000**(단서 포함 — 점 판정) · 유료 «아니오» → **3,900,000** + 비과세(§109②) 가능성 고지 | E2 |
| C10 | 직접 API `targetDate 2025-06-01` · 철거 2024-12-01 · 공업 1,000㎡·바닥 300(한도 1,200㎡ 이내 — era 테스트 ITEM) · 요건 충족 | 2,280,000 | **2,280,000 불변**(이관분 0) — 허가 칸 요구(≥2019.6.1.)·건축 외 용도 칸 요구(≥2024.6.1.) | E2 |
| C11 | 철거 토글 OFF | 건축물 현존 경로 | 사실 칸 전부 미전송·미요구 — **불변**(단 Q-2로 본 경로 허가 칸은 요구 — C12) | — |
| C12 | 철거 OFF · 건축물 300㎡ 상업(토지 300·바닥 100 → 한도 300) · **허가 아니오**(Q-2) | 516,000 | **960,000**(전량 이관 300㎡: 과표 210,000,000 → 800,000 + 160,000) | E3 |
| C13 | 직접 **종합합산** 선택 · 공시가격 3억(300㎡) · 타 종합합산 0 명시 | 960,000 | **960,000 불변**(합산 칸 0) · 칸 빈칸이면 ⑧ 차단 | E4 |
| C14 | C13 + 타 종합합산 1억 | (칸 없음 — 사용자가 `publishedPrice`에 합계를 넣던 우회) | 합산 가액 4억 → 과표 280,000,000 → 합산세 1,150,000 → **몫 862,500**(= floor(1,150,000 × 300/400)) → 총액 1,035,000 | E4 |

(C14는 엔진 §13.3 4단계 산식에서 직접 도출한 오라클이다 — 구현 PR이 anchor로 첫 검증한다.)

**기존 테스트 반전 규모(grep 실측, 전체 vitest 미실행)**: `__tests__/api/property.route.separate-aggregate-required.anchor.test.ts` 철거 대조군(`:97-104`)·SA-2(`:119-124`) · `__tests__/api/property.route.separate-aggregate-demolished-era.anchor.test.ts` 3건(모두 `demolished: true`만 전송 — 신규 Zod 요구로 400이 되므로 사실 칸 추가 필요) · `__tests__/tax-engine/separate-aggregate-demolished-era.anchor.test.ts` 8건 · `__tests__/tax-engine/separate-aggregate-land.test.ts` `demolished` 27줄(엔진 직접 — E-9 결정에 따름) · `__tests__/components/calc/property-shared.test.ts`(철거 0줄 — 영향 낮음) · `__tests__/tax-engine/property/recompute-e2e-anchor.test.ts`(폼 → 엔진 전 경로 — 철거 케이스 유무 확인 필요). 교훈: 회귀를 `property`·`api`로만 돌리면 `__tests__/tax-engine/separate-aggregate*`·`__tests__/lib/`를 놓친다 — `npx vitest run __tests__/tax-engine/ __tests__/api/property* __tests__/components/ __tests__/calc/`.

### 8.2 vitest 계획

| 파일 | 내용 |
|---|---|
| `__tests__/components/property-separate-demolished-facts.anchor.test.tsx` | 노출 격자: 종류 미선택 → 사실 칸 0 · house → 빈집정비 노출·바닥면적 문구 아님 · building → 빈집정비 없음 · 건축 외 용도 «예» ∧ 빈집정비 «예» → 공용 하위 칸 · 상위 답 변경 시 하위 사라짐 · 철거 OFF → 블록 없음 · `data-testid` |
| `__tests__/calc/property-demolished-wire.anchor.test.ts` | ④: 숨은 칸 미전송(종류 변경 · 건축 외 용도 «예→아니오» · 철거 OFF) · 노출 칸 전송 · `""` 전송 0 |
| `__tests__/calc/property-demolished-parity.anchor.test.ts` | §6.3 격자 ⑧↔⑫(자동 생성) |
| `__tests__/api/property.route.separate-demolished-requirements.anchor.test.ts` | route 200/400 + 세액(엔진 문서 확정 후) — 기존 era 테스트 보강 |
| 결과뷰 `.test.tsx` | echo 기반 카드: holds/fold/모름 고지/0원 이관 안내/섹션 선택 출력 id |

mutation 계획(제품 코드 1줄 → 대응 anchor 실패 → 원복): ⓐ ④ 게이트를 `form.saDemolished`만으로 바꿈 → wire anchor 실패 ⓑ ⑫ refine 호출 제거 → parity 격자 실패 ⓒ 노출 술어를 `true`로 → 노출 anchor 실패 ⓓ ⑧ 호출 제거 → ⑧ anchor 실패. (실행은 Do 단계 — 이 세션 미실행.)

### 8.3 E2E — `e2e/property-separate-demolished-requirements.spec.ts` (재산세 별도합산 E2E는 **현재 0건** — `grep 별도합산 e2e/property*` 없음; 형식 선례 `e2e/property-tax-base-cap.spec.ts` `calcAndWait`)

1. 토지 → 별도합산 → S 입력 → 철거 ON 2026-03-01 → 종류 건축물 → 허가 예 · 건축 외 용도 아니오 → (Step 3 합산 칸: 이관분 700㎡이 있으므로 «타 종합합산» 칸 노출 · «타 별도합산» 칸 노출 — 각각 0 입력) → 계산 → **총 납부세액 3,156,000**(C1 — **v1의 516,000은 E4 이후 틀린 기대값이다**) · 카드에 «별도합산분 430,000 / 종합합산 이관분 2,200,000 / 합계 2,630,000».
2. 같은 입력 → 허가 **아니오** → 계산 → 카드 «별도합산분 0 / 종합합산 이관분 3,250,000» · **총 납부세액 3,900,000**(C2 — v1 «0원 + 안내»는 폐기).
3. 허가 **모름** → 3,900,000 + 확인 필요 고지(C3) · 건축 외 용도 **예** → 3,900,000(C4).
4. 철거 2025-05-31 → 사실 칸 **미노출**(`pt-sa-demolished-facts` 안에 permit 라디오 0) → **3,900,000**(C6 — 현행 0원).
5. 주택 선택 → 빈집정비 칸 노출 · 건축물 선택 → 사라짐 · 건축 외 용도 예 + 빈집정비 예 → 공용 사용 하위 칸 노출.
6. 미선택 상태로 «다음» → ⑧ 오류 박스 · StepIndicator로 step 3 점프 → «재산세 계산하기» → **(UQ-6 채택) 계산 전 재검증 오류 박스**(구체 문구 — 「입력값이 올바르지 않습니다.」가 나오면 실패). 합산 칸 빈칸 → 합산 문구 차단.
6′. 직접 종합합산 선택 + 공시가격 3억 + 타 종합합산 0 → 960,000(C13) · 1억 → 총액 1,035,000(C14 — **합산이 세액을 바꾼다** 단언).
6″. 철거 OFF + 허가 «아니오»(Q-2) → 960,000(C12).
7. 375px 뷰포트 캡처(라디오 줄바꿈·토글 카드 가로 넘침 없음).
세액 오라클은 위 §8.1(C7·C9 포함 — 엔진 문서 §13.4와 같은 산식). 외부 호출 없음(mock 불요) — 재산세 route는 Supabase 미설정 시 상수 폴백(`route.ts:85-96`).

### 8.4 14지점 자가 점검 (Do 완료 보고 전 — grep)

`grep -rn "saDemolishedKind\|saDemolishedPermit" components lib app` → ①②④⑤⑧ 5곳 이상 · `grep -n "demolishedKind\|demolishedPermit" lib/validators/property-input.ts` → ⑫(**strip 가드 최우선**) · `grep -rn "demolishedPermit" lib/tax-engine/types/property.types.ts lib/tax-engine/property-tax.ts` → 엔진 타입·위임 · ⑭는 `parsed.data` 무매핑 확인(grep 0이 정상). 완료 보고에 **브라우저 수동 확인 여부 명시**(Network 탭 request body에 신규 키가 실제 실리는지 — 숨은 값 미전송 포함).

### 8.5 새로 막히는 기존 입력 경로 — 실측 항목 (UQ-6 계산 직전 재검증 + 새 필수 칸)

> 이 변경은 **엔진 문서의 새 필수 칸(Q-1 미선택 차단)** 과 **UQ-6 재검증**으로 «지금은 계산되는 입력»의 일부를 막는다. 아래는 이 세션이 grep·정독으로 센 것(코드 변경 0)이며, **구현 PR 완료 보고 전에 격자·전수로 재측정**한다.

| N | 새로 막히는 경로 | 현재 상태 | 실측 방법(구현 PR) |
|---|---|---|---|
| N-1 | **모든 철거 ON 입력** — 종류·허가·(건축 외 용도·빈집정비) 새 필수(요구 술어가 연 칸) | 철거일만 있으면 통과 | §6.3 격자 |
| N-2 | **모든 별도합산(비철거) 입력** — 본 경로 허가 칸(Q-2) + `otherSeparateAggregateValue`(별도합산분 > 0이므로 항상 요구) | 통과 | 격자: 별도합산 × 허가 × 합산 |
| N-3 | **모든 직접 종합합산 입력** — `otherComprehensiveValue` 항상 요구(Q-16 (가)) | 통과(합산 칸 없음) | 격자 |
| N-4 | **이관분이 생기는 별도합산 입력**(면적 초과 · 철거 기간 경과 · 요건 미충족) — `otherComprehensiveValue` 추가 요구 | 통과(이관분 세액 누락) | 이관 판정 미리보기 격자 |
| N-5 | **철거일 > 과세기준일** | 통과(철거 특례 문구 + 별도합산) | 경계 셀 |
| N-6 | 공장용지 ON + 철거 종류 `house` | 통과 | UQ-8 격자 |
| N-7 | **step 3 기존 규칙이 UI에서 처음 실행** — `validateStep(3)`(recompute 직전 과표 형식 · 주택 경과조치 직전 본세/도시지역분)은 `PropertyTaxForm`이 한 번도 부르지 않았다(`validateStep(` 호출 `:116·123·130`뿐 — grep 실측). 재검증 채택 시 그 규칙이 UI에서 막기 시작한다(⑫는 이미 400으로 막던 항목) | UI 통과 → ⑫ 400(문구 «입력값이 올바르지 않습니다.») | 격자: step 3 규칙 × 이전 통과 여부 — **새로 막히는 건 «UI에서 일찍 구체 문구로»일 뿐 ⑫와 막히는 집합은 같아야 한다**(차이가 있으면 ⑧↔⑫ 결함) |
| N-8 | StepIndicator 점프 우회(step 0 → 3) | ⑫ 400 일반 문구 | UQ-6 채택으로 구체 문구 |
| N-9 | 비UI(직접 API) 호출자 — 신규 400 | — | 영향받는 기존 테스트 파일(엔진 §8.1) + `grep totalPayable).toBe(0)` 전수 |

**측정된 규모(grep — 전체 vitest 미실행)**: 재산세 토지 경로(`landTaxType` 별도·종합합산)를 쓰는 테스트 파일 **8개**(`property.route.separate-aggregate-demolished-era.anchor` · `…-required.anchor` · `components/calc/property-shared` · `tax-engine/property-comprehensive-aggregate` · `property-land-classification` · `property/cap-echo-anchor` · `property/recompute-cap-anchor` · `property/recompute-e2e-anchor`) — 이 중 route·`property-shared`·`recompute-e2e`는 **폼/요청 본문 수준이라 새 필수 칸 400의 영향**, 나머지는 엔진 직접 호출이라 `calculatePropertyTax` 입력에 합산 칸이 없으면 «요구 술어는 Zod 담당 · 엔진은 접힘/무시»로 값 불변이어야 한다(엔진 E-9). **E2E는 재산세 토지 흐름이 현재 0건**(`e2e/property-*.spec.ts` 토지 분기 없음) — 신규 spec이 첫 E2E.

---

## 9. 사용자 결정 UQ-n (추천 첫째 + 근거)

> **사용자 결정 2026-11-25**: UQ-1·2·3·5·7·8·9 = 추천 채택 · UQ-3 = 엔진 Q-6 (가)(2칸·날짜 없음) · **UQ-4 = «Q-9로 대체 — 이관분 세액 계산 포함»** · **UQ-6 = 채택(계산 직전 재검증)**. 아래 본문은 결정 전 기록이며 각 항 끝에 결정을 표시했다. UQ-10~12도 같은 날 추천안으로 **결정됨**(이 표 하단) — **미결 UQ 0건**.

**UQ-1 — 사실 칸 형태(허가·건축 외 용도·빈집정비).** [**결정: (가) 채택**] (가) **3지선다 예/아니오/모름, 가정값 없음(미선택은 ⑧ 차단)** — 양도세 E3f-2와 같은 정책(모름 = 혜택 불성립 + 확인 필요) · (나) 토글(OFF = 허가 받음·건축 외 용도 아님 가정) — 재산세 분리과세 공장용지 `stFactoryIsUnpermitted` 토글(`Step2Separated.tsx:220-225`)과 같다. 추천 (가): (나)는 OFF 기본이 «허가 받았다고 가정»해 유리한 방향으로 조용히 통과한다 — 기존 공장용지 토글은 이 정책 이전의 것(그 칸은 **이 계획 범위 밖** · 정합은 별도 결정).

**UQ-2 — «철거된 건축물 종류» 칸 신설.** [**결정: (가) 채택**] (가) **명시 라디오 2택(주택 / 주택이 아닌 건축물)** — 빈집정비 3년(주택)·면적 범위(건축물)가 갈리는데 현행 폼에 종류를 가르는 칸이 없다 · (나) 추론(공장 토글·바닥면적 유무로 판단) — 추론은 침묵 fallback이다. 추천 (가).

**UQ-3 — 공용·공공용 사용(2호 단서)의 칸 수.** [**결정: (가) 채택 = 엔진 Q-6 (가)**] (가) **«과세기준일 현재 사용 중인가» 1칸 + 유료 여부 1칸** — 재산세는 과세기준일이 하나라 날짜 2칸(양도세 선례)은 «과세기준일이 사용 기간 안인가»를 묻는 우회이고 종료일 빈칸 해석 문제까지 끌어온다 · (나) 개시일·종료일 2칸(양도세 E3f-3 동형 — 엔진 재사용 최대, 사용자 입력 부담 큼). 추천 (가) — 단 **엔진 결정에 종속**(E-2): 엔진이 (나) 와이어만 받으면 (나).

**UQ-4 — ~~별도합산 인정분만 세액화하는 현행 결과 표시~~ → Q-9로 대체 — 이관분 세액 계산 포함**(사용자 결정 2026-11-25). v1 추천 (가)(현행 유지 + 안내 카드 + 합계 라벨 변경)는 **기각**됐다. 결과 표시는 §7(3분할·합산 가정·이관 사유), 합산 입력은 §5.8, 세액 설계는 엔진 §13. 이 문서의 «별도합산 인정분만 계산합니다» 안내 카드·합계 라벨 변경안은 폐기.

**UQ-5 — «건축 외 용도로 일부만 사용» 처리.** [**결정: (가) 채택**] 법문은 그 부분만 제외인데 이 화면은 단일 필지·면적 안분 금지. (가) **«예»로 답하면 전체를 접고 확인 필요로 고지(양도세 선례 `OtherLandDemolishedFactsField`와 같은 처리)** · (나) 사용자가 토지 면적을 줄여 입력 — `officialLandPrice = floor(공시가격 ÷ 토지면적)`(`shared.ts:549`)이 깨진다. 추천 (가) — 단 «일부만이면 그 부분만 제외인데 안분하지 않는다» 문구 + 법 근거 없는 불리 적용 아님을 고지에 명시(엔진 문서 결정에 종속).

**UQ-6 — ⑧ 우회 경로(StepIndicator 점프 → 계산)와 ⑫ 문구.** [**결정: (가) 채택 — 계산 직전 재검증**] `runCalculation` 직전에 `validateStep`을 재실행한다. 사용자 결정 문구는 «0~2단계»이나 이 문서가 **합산·상한 칸을 Step 3에 둠**(UQ-10)에 따라 **3단계까지 포함**하는 것이 일관되다(포함하지 않으면 합산 칸 빈칸이 일반 ⑫ 문구로만 막힌다) — 이 확장은 UQ-12에서 사용자가 (가)로 확정했다. 필드 점프(`data-field`) 신설은 하지 않는다. 변경 범위·N-7 영향은 §5.7 · §8.5.

**UQ-7 — 클라이언트·서버 과세기준일 연도 불일치(연말 경계).** [**결정: (가) 채택** — 단 엔진 §5.4가 `resolvePropertyTaxBaseDate`를 엔진·route·⑧ 공유로 둔다 → UI는 그 함수를 호출(자체 `new Date().getFullYear()` 금지)] (가) **현행 유지(화면은 `targetDate` 미전송, UI는 술어 평가에 `new Date().getFullYear()`)** — 모든 시행본 조항이 2026.6.1.부터 동일하므로 노출 칸은 연도에 둔감하고 불일치 창은 12.31. 전후 몇 시간 · (나) 화면이 `targetDate`를 명시 전송 — 서버 연도와의 불일치를 구조적으로 없애지만 **모든 재산세 계산의 전송 body가 바뀐다**(범위 초과). 추천 (가) + V-3 실측.

**UQ-8 — 공장용지 토글 × 철거 종류 `house` 모순.** [**결정: (가) 채택**] (가) **⑧·⑫ 모두 차단(문구로 종류 확인 요구)** · (나) 공장용지 ON이면 종류를 `building`으로 자동 채움 — 침묵 채움·미러링 위험. 추천 (가). (엔진이 이 모순을 이미 다루면 정합.)

**UQ-9 — 철거 «주택» 선택 시 바닥면적 칸 표시(E-8).** [**결정: (가) 채택 — 엔진 Q-8 (가)와 일치**] (가) 엔진 `floorArea` 술어를 따른다(주택이면 필수 아님 → ⑧·⑫·표시 모두 비필수) · (나) 현행처럼 모든 철거에 필수. 추천 (가) — 엔진 결정 뒤 맞춘다(기존 ⑧ `shared.ts:409-410`의 «바닥면적 필수» 문구가 «엔진이 읽지 않는 칸 요구»가 되지 않게).

**— 이하 Q-9 결정에서 새로 생긴 UI 결정 — 사용자 결정 2026-11-25: UQ-10·11·12 전부 «추천 (가)» 채택 —**

**UQ-10 — 합산 칸의 위치.** [**결정됨 — (가) 채택**] (가) **Step 3 상단 블록**(§5.8) — 종합합산 선택은 Step 2가 없고 별도합산도 이관 판정에 Step 2 입력이 모두 필요하므로 한 곳에서 묻는다 · (나) 별도합산은 Step 2 하단·종합합산은 Step 1 뒤에 새 Step 2 신설 — 단계 수·`StepIndicator`·`handleBack` 분기가 바뀌어 범위 과대. 추천 (가). 근거: 계산 순서 = UI 표시 순서(합산은 판정 뒤·상한 앞) · 엔진 §13.3(c) 술어가 판정 결과를 입력으로 받는다. 엔진 Q-13 (가)에 종속.

**UQ-11 — 결과 headline 기준.** [**결정됨 — (가) 채택**] (가) 엔진 Q-14 (가) **이 필지 몫** headline + 합산 과표·합산 산출세액·몫 비율 echo(§7 표) · (나) 합산 총세액 headline. 추천 (가) — 엔진 Q-14에 종속(합산 입력 0이면 두 안이 같은 값).

**UQ-12 — 계산 직전 재검증 범위.** [**결정됨 — (가) 채택: 0~3단계**] (가) **0~3단계 전부**(합산·상한 칸이 Step 3이고 `validateStep(3)` 기존 규칙도 처음 실행 — N-7) · (나) 사용자 결정 문구 그대로 **0~2단계만** + 합산 칸 검사는 별도 `validateLandSplit()`을 `runCalculation` 직전에 추가(단계 번호와 분리). 추천 (가) — 단순하고 ⑧↔⑫ 집합 차이가 사라진다. N-7(step 3 기존 규칙의 UI 최초 실행)을 받아들이는 선택 — 사용자가 2026-11-25 이 영향을 포함해 (가)로 결정했다.

---

## 10. 미검증 V-n (추정 금지 — «확인 필요»)

- **V-1** 엔진 계획서 부재 시점의 §3 이름·와이어·echo 필드 — 엔진 문서와 대조 후 §3 대응표 갱신.
- **V-2** 인라인 3택 라디오 + `FieldCard` 안의 375px 레이아웃 — 이 세션 렌더·Playwright 미수행(선례 E2E가 375px를 다뤘는지 미확인).
- **V-3** 클라이언트(KST)·서버(UTC) 연도 불일치 창(`new Date().getFullYear()` 두 곳 — `property-tax.ts:376`, `route.ts:89` — 이 저장소 엔진 규칙은 로컬 달력 함수를 금하나 이 줄은 기존 코드) — 실측 안 함.
- **V-4** StepIndicator 점프로 ⑧을 건너뛰는 경로 — 정독으로 도출, **브라우저 재현 안 함**.
- **V-5** 재산세 결과 PDF 생성기(`generateResultPdf` taxType `property`)의 섹션 id 추가 지점 — 미정독.
- **V-6** `recompute-e2e-anchor.test.ts` 등 «폼 → 엔진 전 경로» 테스트에 철거 케이스가 있는지(철거 0줄로 보이나 파일 전수 정독 아님).
- **V-7** 주택 철거 부속토지의 별도합산 기준면적(E-8) — 법문(§103의2 1호 후단은 건축물만)과 현행 엔진(`calculateBaseArea` 공통)의 정합은 엔진 시니어 확인 사항.
- **V-9** 합산 칸 라벨 «같은 지방자치단체 관할구역» 이해도 — 일반구(자치구 아닌 구)는 시 단위, 자치구는 구 단위라는 `comprehensive-land-parcels.ts` 정규화 규칙(확인)을 힌트에 어떻게 풀어 쓸지 — 법·해석 근거 엔진 V-16·V-17.
- **V-10** 결과 3분할 표의 375px 레이아웃(6열 표) — 가로 스크롤 금지(16px 거터) 규칙상 열 축약·카드 스택 필요 — 렌더 미수행.
- **V-11** 이관 판정 미리보기를 클라이언트에서 돌릴 때 `isSeparateAggregateLand`(순수·`parseISO`/`civil-period`)의 번들 크기·SSR 안전 — 미확인(선례: `nbl-other-state-history-preview.ts`가 같은 방식).
- **V-8** 전문가 모드 `ProfessionalClientGate`가 폼을 prefill하는지(§5.3 ⓑ).

---

## 11. PR 분할 · 800줄 정책

- **엔진 문서 §8 순서에 맞춘다**: PSA-E1 → **PSA-E4(이관분 세액) + PSA-U2(합산 칸·분할 결과 — 이 문서 §5.8·§7)** → PSA-E2 + **PSA-U1(철거 사실 칸·재검증 — §4·§6·§5.7)** → PSA-E3 + UI(§4.7 본 경로 허가) → PSA-X(E2E). 엔진 PR마다 UI PR(선례). §3 정합 개정(v2)은 **완료**.
- **줄 수**: `components/calc/property/shared.ts` **763줄 — ≥750 위험구간**이라 필드 5~7개 + initial + ⑧ 호출(+~15줄)이면 ~780. 규칙(기회주의적 분리)에 따라 철거 관련 ⑧·④를 `lib/calc/property-separate-requirements.ts`(신규 ~120줄)로 **밖에 두어** shared.ts 순증을 ≤ +12줄로 막는다. 그래도 780대면 이 PR에서 `validateStep`의 step 2 분기(`:403-412`)를 leaf로 내려 700대 착지 확인(억지 분할 금지 — 응집도 우선). `lib/validators/property-input.ts` 427줄 · `Step2SeparateAggregate.tsx` 105줄 · `PropertyTaxResultView.tsx` 714줄(+카드 ~40줄 = 754 — **신규 카드는 별도 파일 `results/PropertyLandSplitCard.tsx`**로 두어 본 파일 증가 ≤ +8줄) · `property-tax.ts` 774줄(엔진 몫 — 엔진 문서가 분리 판단).
- 신규 파일: `SeparateAggregateDemolishedFacts.tsx` · `lib/calc/property-separate-requirements.ts` · `property/LandSplitInputs.tsx`(Step 3 합산 블록) · `results/PropertyLandSplitCard.tsx` · 테스트 5종(§8.2 + 결과 3분할) · E2E 1종. `Step3.tsx`는 합산 블록 마운트 + recompute 조건(E-11) 변경만.

---

## 12. 재제안 금지·기결정 준수

과세기준일(6.1.) 단위 접기 · 자동 안분 fallback · useEffect→store 미러링 · native radio/checkbox/date · placeholder 숫자 예시 · ~~별도합산 이관분 종합합산 세액화~~(Q-9로 **포함 결정** — 재제안 대상 아님) · 합산을 무시하는 단순화(사용자 금지) · 양도세 선례의 기결정(공용 사용 종료일 빈칸 ≠ 구간 끝 · 모름 = 혜택 불성립)을 재산세에 그대로 따른다. 사용자 결정 UQ가 닫히기 전에 Do 착수 금지.

## 13. 자가 검토 (1회)

- 14지점 표의 «해당 없음» 4곳(③⑥⑨⑪⑬⑭ 중)은 각각 file:line 또는 grep 근거를 달았다 — ③·⑥은 §1.1, ⑪은 재산세에 취득일 없음(정독), ⑭는 `route.ts:78` 무매핑.
- 가장 큰 위험 둘: ⓐ ⑫ strip(신규 키 누락 시 ④가 보낸 사실이 엔진에 안 닿고 판정이 조용히 현행 그대로) ⓑ 0원 오독(⑦ 이관 안내). 둘 다 anchor·E2E에 짝을 둔다.
- v2 정합: §3 이름 대응표로 v1 제안 이름 전부 엔진 §5.9 정본에 맞췄다(불일치 0). 미결 Q·UQ 0건(엔진 Q-1~Q-18 · UI UQ-1~12 전부 결정됨). 구현 PR이 첫 검증할 것: 이관분 오라클 중 C14는 산식 도출값(구현 PR anchor가 첫 검증) · 3분할 결과 카드·합산 칸 렌더 미수행(V-10).


---

## 14. PSA-U2 구현 기록 (2026-11-25 — PSA-E4에 기대는 부분만, 계획서와 다른 점)

- **M3 계산 직전 재검증**: `shared.ts`의 `firstInvalidStep(form)`이 «이 물건이 실제로 거치는 단계»(0 → 토지 1 → 토지 상세 2 → 3)만 순서대로 `validateStep`에 돌려 첫 실패 `{step, message}`를 돌려주고, `PropertyTaxForm`이 그 단계로 복귀·오류 표시. 계획 §5.7은 «0~3 전부»였으나 **토지가 아닌데 남은 `landTaxType` 잔재**로 토지 단계가 막히지 않도록 거치는 단계만 센다. ⑧↔⑫ 격자(`__tests__/calc/property-precalc-parity-grid.anchor.test.ts`, 428셀): «⑧ 통과 ∧ ⑫ 400» 0, «⑧ 통과 ∧ ⑫ 통과 ∧ 엔진 던짐» 0.
  - 격자가 잡은 기존 막다른 길 1건: ④가 `isOneHousehold`를 모든 물건에 보내 «주택에서 토글 ON → 건축물로 변경» 뒤 ⑫ 400 → 주택일 때만 전송.
  - **§8.5 N-7 정정**: «step 3 규칙은 ⑫가 이미 400으로 막던 항목»은 일부만 맞다. 주택 부칙 §15 토글 ON + 직전 본세 빈칸은 ⑫가 200이다(토글이 UI 전용 상태 — ④가 값 없이 토글 OFF와 같은 body를 보낸다). ⑧이 막는 «화면 전용 사유» 3종(공시가격 빈칸·주택 경과조치 토글 빈칸·분리과세 유형 미선택)은 격자가 이름 붙여 닫는다. 이 중 **기존 정상 경로에 새로 막히는 입력은 주택 경과조치 토글 ON + 빈칸(+ 도시지역 직전 도시지역분 빈칸)뿐**이다(종전엔 상한 없이 계산됨).
  - `validateStep`의 `parseAmount(...) === null` 검사는 `parseAmount`가 null을 돌려주지 않아(0) 실질 죽은 코드다 — 이 PR에서 건드리지 않았다.
- **M2 결과 카드**: `results/PropertyLandSplitCard.tsx`. 분류별 4단계(합산 가액 → 합산 과세표준 → 합산 산출세액 → 이 필지 몫) + 3분할 행(별도합산분·종합합산분·합계) + 세부담상한 + 이관 사유 + 엔진 고지. 엔진 고지는 카드가 보여 주고 «경고» 목록에서는 뺀다(`LAND_SPLIT_CARD_NOTICES`). 인쇄 id `land-split`(화면+PDF 채널) · PDF는 `PropertySection`이 계산표와 독립으로 분류별 세액표를 렌더. 합계 행 라벨은 «합계 = 산출세액»(상한 있으면 «세부담상한 적용 전»). 산출세액 섹션 첫 행은 «분류별 합산 과세 이 필지 몫의 합계»로 바꿔 «과세표준 × 세율 ≠ 산출세액» 오독을 막는다.
- **M1 recompute 개방**: §5.8의 «direct 선택지 옆 한 줄»은 이관분이 있고 직접 입력일 때만 노출(`landSplitRequired(form).otherComprehensive`). 직전 과세표준 빈칸은 기존 recompute 대상과 같이 ⑧ 통과·④ 미전송(상한 없음) — 합산 칸과 달리 «빈칸 = 상한 없음»이 정의된 칸이다.
- **E2E**: `e2e/property-land-split.spec.ts` 8건(S-1 960,000 · S-5 3,063,000 · S-7 900,000 · 합산 빈칸 차단 · 단계 우회 2건 · 직접 종합합산 1,035,000 · 375px).
