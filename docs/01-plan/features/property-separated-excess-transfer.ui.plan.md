# 재산세 분리과세(공장용지·목장용지) 면적 한도 초과분 «종합합산 이관 세액» — 화면·클라이언트(⑤⑦⑧·④⑫ 소비) 계획서

> 상태: **Plan v1 (2026-11-25 — 코드 변경 0)**. 엔진 정본 = `docs/01-plan/features/property-separated-excess-transfer.engine.plan.md`(병렬 작성본 — **이 문서 초안 뒤에 생긴 §4.9·§5·§7을 읽고 이름을 대조·정정했다**, §3.5 표). 엔진 계획서가 정한 이름은 그대로 쓰고, 엔진이 **정하지 않아** 이 문서가 요청하는 것만 **〔엔진 계획서와 맞출 것〕**으로 남겼다. 엔진 Q-1(초과분 귀속)·Q-3(세부담상한) 결정이 바뀌면 이 문서 §3.5·§4·UQ-5가 따라 바뀐다.
> 선례: PSA-E4 #3651(별도합산 경로 이관분 세액 — 엔진 leaf `lib/tax-engine/property-land-split-tax.ts`) · U2 #3652(Step 3 합산 칸·결과 카드). 이 문서는 그 위에 **분리과세 경로를 얹는다** — 판정·세율·합산 규칙은 새로 만들지 않는다.
> 근거 표기: file:line = 워크트리 `Property-related-Taxes-sep-excess-plan`(master `46976ad8e`)에서 이 세션이 직접 읽은 줄. 동작은 throwaway vitest probe(scratchpad — 저장소 변경 0, 실행 뒤 삭제 확인)로 실측한 값만 단정했다. 정독만 한 곳은 «정독», 못 본 곳은 «확인 필요».
> **재제안 금지**: 자동 안분 fallback(합산 칸 빈칸을 0·이 필지 단독으로 채우기 — 예외 PHD §164⑦ 해당 없음) · `useEffect → store` 미러링 · native radio/checkbox · placeholder 숫자 예시 · 법 근거 없는 유리/불리 표현 · 분리과세끼리 합산(§113①3호 — 아래 §1.6).

---

## 0. 한눈에

### 0.1 화면 흐름 5줄

1. **Step 2(분리과세 상세, 변경 없음 + 문구 2곳)** — 공장용지(입지·부속토지 면적·연면적·면적률…) 또는 축산용지(면적·축종·마릿수…)를 입력한다. 기준면적 판정은 입력이 다 차면 엔진이 이미 한다.
2. **Step 3(전년도 세액) 맨 위** — 기준면적을 **넘는 면적이 있을 때만** 기존 «같은 지방자치단체 관할구역의 다른 토지 (합산)» 카드가 나타나고 **종합합산 칸 하나만** 요구된다(별도합산 칸 없음 — 분리과세는 합산하지 않는다). 초과 0이면 카드가 없다(현행과 동일).
3. 카드 첫 줄에 **왜 이 칸이 나왔는지**(기준면적·부속토지 면적·초과 면적)를 엔진 판정 값으로 보인다. 빈칸 = 미입력(⑧ 차단), `0` = «없음». 입력에 다른 공장용지·목장용지의 한도 초과분도 포함한다는 안내가 hint에 붙는다(엔진 V-8).
4. **계산** — ④가 `otherComprehensiveValue`를 실어 보내고(요구된 때만) ⑫가 같은 술어로 검증한다.
5. **결과** — 기존 `PropertyLandSplitCard`에 **분리과세분 블록**(한도 echo → 공시가액 → 과세표준 → 단일세율 → 세액)이 생기고 **종합합산 이관분** 블록은 기존 `ClassFormula` 그대로. 합계 = 산출세액, 부가세·총 납부세액은 기존 구역이 그대로 이어받는다. 이관분이 별도합산일 수 있다는 «확인 필요» 고지가 카드에 붙는다(엔진 Q-1 (가))

### 0.2 변경 범위 요약

| 구역 | 변경 |
|---|---|
| Step 2 | 안내 문구 2곳(`Step2Separated.tsx:81-84`·`:213-216`)만 — 「…이관됩니다」 뒤에 «다음 단계에서 같은 관할구역의 종합합산 토지를 입력» 연결 |
| Step 3 | `LandSplitInputs` 분리과세 분기(요구 술어·초과 요약·문구·hint variant) · 세부담상한 안내·재산정 개방(UQ-5 — 엔진 PSE-E4 의존) |
| ④ | `separateTaxationItem` 조립을 함수로 빼 ⑧의 요구 미리보기와 **같은 객체**를 쓴다(선례 `buildSeparateAggregateItem`) |
| ⑧ | 새 코드 없음 — 요구 술어가 분리과세를 알게 되면 `validateStep(3)`(`shared.ts:524-527`)이 그대로 막는다 |
| ⑫ | 새 와이어 키 **0**(`otherComprehensiveValue`는 이미 선언 — `property-input.ts:197`) · `superRefine`의 술어 호출 인자에 분리과세 항목 추가 |
| ⑦ | 카드에 분리과세분 블록 · 이관 사유 라벨(엔진 제공) · 안내 상수 · PDF 행 · 결과뷰 산출세액 행 라벨 |
| ⑥ 사이드바 | **해당 없음**(재산세 마법사에 사이드바가 없다 — `app/calc/property-tax/page.tsx`는 `PropertyTaxForm` 단독, `PropertyTaxForm.tsx`에 sidebar/summary grep 0) |
| 종부세 연동 | **영향 없음** — `comprehensive-tax.ts:250·294`가 `calculatePropertyTax`를 부를 때 `objectType: "housing"`만(정독). `PropertyTaxResult` 입출력 시그니처 변경 0(추가 optional echo만). 엔진 §4.8이 초과 > 0일 때 «종부세 제외» 고지 **문구만** 바꾼다(화면은 경고 목록으로 그대로 보임). |
| 세액 | 초과 0 입력은 **불변**(엔진 K-1). 초과 > 0 입력은 엔진 이관분 세액만큼 증가(오라클 = 엔진 계획서 §3.2·§6) |

---

## 1. 현행 실측

### 1.1 입력 흐름 (분리과세 경로)

`PropertyTaxForm.tsx`: Step 0(물건·공시가격) → Step 1(토지 과세 유형, 분리과세 선택) → **Step 2** `{step === 2 && form.landTaxType === "separated" && <Step2Separated/>}`(`:254`) → **Step 3** `<Step3/>`(`:258`). 계산 직전 `firstInvalidStep`이 0 → 1 → 2 → 3을 다시 검사한다(`PropertyTaxForm.tsx:139` → `shared.ts:553`). `targetDate`는 폼에 없다(`grep` 0 — 과세기준일은 서버가 올해 6.1.).

`Step2Separated.tsx`(405줄) 위→아래:

| 순서 | 칸 | 줄 | 비고 |
|---|---|---|---|
| 1 | 분리과세 유형 라디오 `stSeparatedType`(8종) | `:60-72` | 옵션 표 `shared.ts:123-132` |
| 2 | **축산용지**(`livestock`) 카드: 도시지역 소재 → 1989 이전 소유(조건부) → 목장용지 면적 `pt-pasture-total-area`(`:108-114`) → 축종 Select `pt-pasture-livestock-type`(`:124`) → 보유 시설 3 토글 → 마릿수 `pt-pasture-livestock-count`(`:171-175`) | `:75-180` | 안내 «초과분은 종합합산과세대상으로 이관됩니다.» `:81-84` |
| 3 | **공장용지**(`factory`) 입지 라디오 `stFactoryLocation` → `urban`이면 분리과세 아님 rose 카드(`:196-205`) / 그 밖이면 카드: 허가·사용승인 미이행 토글 → (아니면) 부속토지 면적 `pt-factory-total-area`(`:234-238`) · 연면적 `pt-factory-floor-area`(`:246`) · 기준공장면적률 `pt-factory-rate`(`:258`) · 제한지역 토글 · 추가 인정면적 · 종업원용 체육시설 블록 | `:183-388` | 안내 «…초과분은 종합합산과세대상으로 이관됩니다.» `:213-216` |
| 4 | 대중형·간이 골프장 안내(접힘) | `:390-402` | |

초과 면적은 **화면 어디에도 계산·표시되지 않는다** — 엔진이 경고 문구 한 줄로만 낸다(§1.3).

### 1.2 Step 3 · 합산 칸 · ④ · ⑧ · ⑫

- `Step3.tsx:66-69`: 토지면 `<LandSplitInputs/>`를 맨 위에 그린 뒤 «전년도 세액(선택)». `isRecomputeTarget`(`request-body.ts:86`)은 종합합산·별도합산만 재산정 선택지를 연다 — **분리과세는 직접 입력만**(`Step3.tsx:116-131`). 별도합산 + direct + 종합합산 칸 요구일 때 안내 한 줄(`:94-99`).
- `LandSplitInputs.tsx:20-21`: `landSplitRequired(form)`이 둘 다 false면 `null`. `:25-34` 별도합산이고 `validateStep(2) !== null`이면 amber 카드 «앞 단계 입력을 먼저 마치세요»(`data-testid="land-split-inputs-pending"`). `:36-` 그 밖엔 sky 카드 + 안내문 «종합합산·별도합산 토지는 같은 시·군·구…» + 요구된 칸(`other-separate-aggregate-value`·`other-comprehensive-value`).
- 요구 술어: `request-body.ts:17-22 landSplitRequired(form)` → `lib/calc/property-land-split-inputs.ts:27-35 landSplitRequiredFromForm({landTaxType, separateAggregateItem})` → 엔진 `propertyLandSplitRequiredFor`(`property-land-split-tax.ts`). **분리과세는 `propertyLandSplitRequired`가 `NONE_REQUIRED`**(실측 probe: `propertyLandSplitRequiredFor({landTaxType:"separated"})` → `{otherSeparate:false, otherComprehensive:false}`).
- ④: `request-body.ts:153-203` 분리과세 유형별 switch로 `separateTaxationItem` 조립(인라인), `:208`에서 `landSplitBodyFields(landSplitRequired(form), form)` — 요구된 칸만 실어 stale 값을 안 보낸다.
- ⑧: `validateStep(2)`의 분리과세 분기 `shared.ts:466-` (축산: 면적·축종·마릿수 / 공장: 입지·면적·연면적·면적률·체육시설) · `validateStep(3)`의 합산 칸 검사 `:524-527` · `firstInvalidStep`.
- ⑫: `lib/validators/property-input.ts:502-516` `superRefine`이 `propertyLandSplitRequiredFor({landTaxType, separateAggregateItem, targetDate})`로 `missingLandSplitInputs`를 이슈화. 공장·목장 입력 키는 Zod에 이미 선언(`:208-262` — pasture 8·factory 9 키 확인). Route(`app/api/calc/property/route.ts:65-79`)는 Zod 통과 객체를 `calculatePropertyTax`에 그대로 넘긴다 — 매핑 코드 없음.

### 1.3 엔진 현행(이관분 세액 0)

- `separate-taxation-classify.ts:184-197` `factoryAreaCheck`/`pastureAreaCheck`(`standardArea`·`recognizedArea`·`excessArea`·`recognizedRatio`·`recognizedAssessedValue`·`excessAssessedValue`) · `:226-238 apportionByArea`(금액 floor, 잔액은 초과분이 흡수 — 합 보존) · 경고 문구 `:341-349`(목장)·`:497-504`(공장) «…종합합산과세대상으로 이관됩니다. 인별 합산 계산 시 별도 처리가 필요합니다.».
- `separate-taxation.ts:180-190 calculateSeparateTax`: 인정분 시가표준액만 과세표준. `property-tax.ts:447-` `separated` 분기 — `taxBase`·`calculatedTax`는 **인정분만**, 결과에 `landSplit` echo **없음**(분리과세 return `:~510-529`에 `landSplit` 키 없음 — 정독).
- 같은 분기가 결과 경고에 «분리과세 대상 토지는 종합부동산세 과세 대상에서 제외됩니다»를 항상 붙인다(`property-tax.ts:505`) — 이관분이 생기면 이 문장의 범위가 모호해진다(§8 V-4).

**실측 (probe — `calculatePropertyTax` 직접 호출, 과세기준일 2026-06-01, 공시가격 1억)**

| 시료 | 입력 | 현행 결과 |
|---|---|---|
| F1 공장 초과 | 산업단지, 부속토지 15,000㎡ · 연면적 1,200㎡ · 면적률 12% | 기준면적 12,000㎡ · 초과 3,000㎡ · 초과분 공시가액 20,000,000 · `taxBase` 56,000,000 · `calculatedTax` 112,000 · 부가세 22,400 · **총 134,400** · `fairMarketRatio` 0.7 · 경고에 이관 문구 |
| P1 목장 초과 | 한우 사육 10두 · 시설 3종 보유 · 150,250㎡ | `taxBase` 35,000,000 · `calculatedTax` 24,500 · 부가세 4,900 · 총 29,400 |

현행 이관분 몫(엔진 leaf `calculateLandClassTax` 직접 호출 — 공시가액만 넣은 가상 실측): F 초과분 20,000,000 · 타 종합합산 0 → **몫 28,000**(합산 과세표준 14,000,000 · 세율 0.2%) · 타 종합합산 2억 → **몫 47,272**(합산 과세표준 154,000,000 · 합산 산출세액 520,000 · 세율 0.5%) · P 초과분 50,000,000 · 타 0 → **몫 70,000**. 이 값은 **leaf 값**이고 최종 합계·부가세는 엔진 계획서 오라클(§3.2·§6)이 정본이다 — 이 표의 1억 시료는 UI가 독립으로 돌린 교차 확인용이고 E2E는 엔진 시료(§6.3)를 쓴다.

### 1.4 결과 화면·PDF

- `PropertyTaxResultView.tsx`: `landSplit` 있으면 «토지 과세 구분별 세액» 카드 + 경고 중복 제거(`:359`, `LAND_SPLIT_CARD_NOTICES`) + 인쇄 id `land-split`(`:395`) + 산출세액 행 라벨 «분류별 합산 과세 — …»(`:~513`) + 재산정 note 분기(`:533` `landSplit?.separate && landSplit?.comprehensive`).
- `PropertyLandSplitCard.tsx`(213줄): `separate`·`comprehensive` 두 `ClassFormula` · 합계 줄 · 세부담상한 블록(`cap`, 두 분류 모두 있을 때 분류별 직전 세액상당액 표시 `:175`) · 이관 사유 `:155`(`PROPERTY_LAND_SPLIT_TRANSFER_REASON_LABEL`) · `ownSum !== publishedPrice` 환산 안내(`:129`).
- PDF: `ResultPdfDocument.tsx:197-221` `PropertyLandSplitPdf` — `split.separate`·`split.comprehensive` 두 분류만. 인쇄 섹션 `land-split`(`lib/print/property-print-sections.ts:56`, 채널 screen+pdf).
- 이 카드의 `PropertyLandSplitClass`(`property.types.ts:424-446`)는 **합산 과세 분류**(합산 가액 → 합산 과세표준 → 누진 → 몫) 모양이다 — 분리과세분은 합산·누진이 없어 **모양이 안 맞는다**(§4.2).

### 1.5 테스트·E2E 현황

- Step 2 분리과세: `__tests__/components/property-separated-factory.anchor.test.tsx`(177줄 — 공장 입력 카드 PTF-1~). 분리과세 ⑧: `__tests__/components/calc/property-shared.test.ts:182-`. 격자: `__tests__/calc/property-precalc-parity-grid.anchor.test.ts` «토지-분리과세» 그룹(`:~160` — `PRICE × {"" , farmland} × cap 4`뿐 — **공장·목장 셀 없음**, `uiOnlyReason` `separated-type` `:171`).
- Step 3/카드: `property-land-split-inputs.anchor.test.tsx`(`:65` «분리과세·주택 — 칸 없음») · `property-land-split-card.anchor.test.tsx`(`:283` «분리과세: 재산정 선택지 없음(대상 아님)») · `__tests__/print/property-land-split-pdf.anchor.test.tsx`.
- E2E: 분리과세 **화면** E2E 0(`e2e/`에서 분리과세는 `property-separate-requirements-api.spec.ts:178` API 422 1건뿐). 헬퍼 `e2e/_helpers/property-land.ts`(139줄)는 별도합산 전용.
- 엔진 anchor: `__tests__/tax-engine/property-factory-separate-limit.anchor.test.ts`(LIM-1~6 · PAS-1~ · LIM-4 `taxBase`·`calculatedTax` 단언 — **엔진 몫이 바꿀 기대값**).

### 1.6 왜 합산 칸이 «종합합산 하나»뿐인가

분리과세분은 §113①3호(`PROPERTY.SEPARATE.TAX_BASE` — `legal-codes/property.ts` · 커밋 `b0a591526`이 KoreanLaw MCP 본문으로 정정: «분리과세대상이 되는 해당 토지의 가액을 과세표준으로 하여 …세율»)에 따라 **합산 없이 이 토지 가액만** 과세표준이다. 합산 단위(§113①1호 «해당 지방자치단체 관할구역»)는 **종합합산 이관분**에만 있다. 그래서 같은 관할구역 타 토지 입력은 `otherComprehensiveValue` 하나다 — 별도합산 칸은 이 경로에서 **요구되지 않는다**(요구되지 않은 칸은 엔진이 읽지 않으므로 stale도 무해 — 술어 정본 원칙).

---

## 2. 사용자 시나리오

공통: 분리과세 선택 → 공장용지 또는 축산용지. «요구 술어» = 〔엔진 계획서와 맞출 것〕 `propertyLandSplitRequiredFor`에 분리과세 항목을 받게 한 확장 — ⑧(Step 3 미리보기)·⑫(Zod `superRefine`)·엔진이 **같은 함수**를 쓴다.

| # | 시나리오 | Step 2 | Step 3 합산 카드 | 요구 칸 | 결과 |
|---|---|---|---|---|---|
| S-1 | **공장용지 초과** (산업단지·읍면, 허가 O, 면적 > 기준면적) | 현행 입력 | **나타남** — 요약 «공장입지기준면적 N㎡ 중 초과 M㎡(공시가액 K원)는 종합합산으로 계산합니다» | 종합합산 1칸(빈칸 차단·0 허용) | 카드: 분리과세분 + 종합합산 이관분 |
| S-2 | **축산용지 초과** (면적 > 가축별 기준면적) | 현행 입력 | 나타남 — 요약 «가축별 기준면적 …» | 종합합산 1칸 | 카드 동일 구조 |
| S-3 | **초과 0** (이내) | 현행 입력 | **없음** | 0칸 | 카드 없음 — 현행과 같은 단일 분리과세 결과 |
| S-4 | 공장 **허가·사용승인 미이행** 토글 ON | 면적 칸 숨김(`:227`) | 없음 | 0칸 | 현행 그대로 — 엔진이 422(종합합산 재입력 안내, `e2e/property-separate-requirements-api.spec.ts:178`). **이번 범위 밖**(§8 V-5) |
| S-5 | 공장 **시지역 그 밖(urban)** | rose 안내 + ⑧ 차단 | 도달 못함 | — | 현행 그대로 |
| S-6 | 그 밖 유형(농지·보전산지·염전·터미널·골프장·오락장) | 현행 | 없음 | 0칸 | 현행 그대로 — 면적 한도가 없는 유형 |
| S-7 | Step 2 **미완**인 채 Step 3(StepIndicator 우회) | 미완 | **없음**(엔진 §4.6: 판정이 던지면 술어 `null` — 요구 없음) | 0칸 | 계산 시 `firstInvalidStep`이 Step 2 구체 문구로 차단(`PropertyTaxForm.tsx:139`). 별도합산의 «앞 단계를 먼저» 안내 카드는 **쓰지 않는다**(술어가 «두 칸 요구»로 접지 않기 때문 — 아래 §3.2) |
| S-8 | S-1에서 Step 2로 돌아가 면적을 줄여 초과 0으로 | — | 카드가 **사라진다**(렌더 파생) | 0칸 | ④는 `otherComprehensiveValue`를 **보내지 않는다**(stale 값 보존은 폼에만 — 다시 초과로 늘리면 복원) |

**칸 등장 시점**: Step 2 입력이 판정에 필요한 만큼 차는 순간부터가 아니라 **Step 3 진입 시점**이다(합산 칸은 항상 Step 3 — UQ-1). Step 2에서는 값을 입력하는 도중에 칸이 생기거나 사라지지 않는다.

---

## 3. 설계

### 3.1 합산 칸 위치 — Step 3 기존 `LandSplitInputs` 재사용 (UQ-1)

별도합산 선례와 같다: 계산 순서(면적 한도 판정 → 이관분 가액 → **합산** → 세부담상한)와 표시 순서(Step 2 → Step 3 합산 → 전년도 세액)가 일치하고, `LandSplitInputs`가 이미 «요구된 칸만 / 빈칸 차단 / 0 = 없음 / 앞 단계 미완 안내»(별도합산 전용)를 가졌다. 새 컴포넌트·새 FormState 필드·새 testid가 없다.

### 3.2 `LandSplitInputs` 재사용 범위와 문구 (UQ-2·UQ-3)

| 요소 | 재사용 | 변경 |
|---|---|---|
| 종합합산 `FieldCard`·`CurrencyInput`(`data-testid="other-comprehensive-value"`) | **그대로**(라벨·`hint`·testid·body 키 `otherComprehensiveValue` 불변) | 없음 |
| 별도합산 칸 | 분리과세에서는 `required.otherSeparate=false`라 그려지지 않음 | 없음 |
| 미완 안내(amber, `:25-34`) | 별도합산 전용(술어가 «분류를 모르면 두 칸»을 돌려주기 때문). 분리과세는 엔진 §4.6이 판정 throw ⇒ `null`(요구 없음)이라 **카드 자체가 안 나온다** | **변경 없음** — 분리과세용 pending 분기를 만들지 않는다. 침묵 단독 계산 위험은 «술어 throw ⇒ 엔진 throw» anchor(엔진 몫)가 막는다 |
| **안내 문단** | 현행 «종합합산·별도합산 토지는 같은 시·군·구에 있는 같은 분류의 토지 가액을 모두 합한…» — **분리과세에는 맞지 않는다**(분리과세는 합산 대상이 아니고, 이 칸은 «이관분»에만 적용). | **variant**: 분리과세일 때 «이 토지 중 기준면적을 넘는 부분(공시가액 K원)은 종합합산과세대상이라, 같은 시·군·구(관할구역)에 있는 다른 종합합산과세대상 토지와 가액을 합쳐 세율을 적용합니다. 분리과세 인정 부분은 합산하지 않습니다.» — 렌더 파생 문자열(상태 없음) |
| **초과 요약 줄** (UQ-3) | 신규 | `data-testid="land-split-inputs-excess"` — «공장입지기준면적(또는 가축별 기준면적) N㎡ · 부속토지 T㎡ · 초과 M㎡». 값은 엔진 `separatedAreaExcessOf`(엔진 §4.6·§4.9)가 낸다 — 화면은 계산하지 않는다(`single-source-engine-helper`). **〔엔진 계획서와 맞출 것〕** 엔진 §4.6은 반환을 `{kind, excessArea}`로만 적었다 — 이 줄에는 `standardArea`·`totalArea`도 필요하다(판정이 이미 구한 값 — `factoryAreaCheck`/`pastureAreaCheck`에 있다) — 반환에 포함 요청 |
| **`hint` variant** | 현행 hint «이 토지 외에 같은 관할구역에서 소유한 종합합산과세대상 토지의 공시가액 합계입니다. 없으면 0을 입력하세요.» | 분리과세일 때 «…합계입니다. 같은 관할구역의 다른 공장용지·목장용지가 기준면적을 넘는 부분이 있으면 그 공시가액도 포함합니다. 없으면 0을 입력하세요.»(엔진 V-8) — **`PROPERTY_LAND_SPLIT_INPUT_MESSAGE`(⑧·⑫ 차단 문구)는 불변**(⑧↔⑫ 같은 문구 원칙 — 보충은 hint에만) |
| 소제목 `ToneCard title` | «같은 지방자치단체 관할구역의 다른 토지 (합산)» | 유지(문구가 분리과세에도 맞다) |
| 법령 모달 `LawArticleModal legalBasis="지방세법 §113" label="§113①"` | 유지 | 없음 |

⚠️ `ToneCard`는 `data-testid`를 DOM에 전달하지 않는다(`Step2Separated.tsx:194-195` 주석) — 새 testid는 카드 **안의 `<p>`/`<div>`**에 단다(`land-split-inputs-pending`이 이미 그렇다).

### 3.3 Step 2 문구 (UQ-4)

`Step2Separated.tsx:81-84`(목장)·`:213-216`(공장)의 «초과분은 종합합산과세대상으로 이관됩니다.» 뒤에 **한 문장**: «초과분이 있으면 다음 단계에서 같은 관할구역의 다른 종합합산과세대상 토지 공시가액을 입력합니다.» Step 2에 초과 미리보기·새 칸은 두지 않는다(UQ-4 추천).

### 3.4 ④·⑧·⑫ 배선

- **④**: `request-body.ts:153-203`의 분리과세 조립 블록을 `buildSeparateTaxationItem(form)`(파일 내부 함수)로 **옮기기만** 한다(`buildSeparateAggregateItem`과 같은 패턴 — 한 객체를 ④ 본문과 ⑧ 미리보기가 같이 쓴다). `landSplitRequired(form)`(`:17-22`)이 `separated`일 때 이 객체를 술어에 넘긴다. `landSplitBodyFields`(`:208`)는 불변 — 요구된 종합합산 칸만 싣고 요구 없으면 stale 값을 보내지 않는다.
- **`lib/calc/property-land-split-inputs.ts:27-35`**: `landSplitRequiredFromForm`의 인자에 `separateTaxationItem`을 추가(엔진 §4.9 이름 그대로 — `landSplitRequiredFromForm({ …, separateTaxationItem })`).
- **⑧**: 새 분기 없음. 술어가 `{otherComprehensive:true}`를 돌려주면 `validateStep(3)`(`shared.ts:524-527`)이 `firstLandSplitIssue`로 막는다. 문구 `PROPERTY_LAND_SPLIT_INPUT_MESSAGE.otherComprehensiveValue` 재사용.
- **⑫**: `property-input.ts:505-509`의 술어 호출에 `separateTaxationItem: data.separateTaxationItem` 추가. **판정 입력이 불완전해 판정이 던지면 엔진 §4.6이 `null`(요구 없음)을 정했다**(별도합산의 «분류를 모르면 두 칸 요구»와 다르다 — 근거: 분리과세는 엔진이 같은 판정을 던져 422가 되므로 침묵 0원 경로가 없다). 그래서 ⑫는 면적 키 누락을 합산 칸 문구가 아니라 엔진 문구(422)로 알린다 — 이 비대칭이 격자의 «이름 붙인 허용 사유»가 된다(§6.2 · §8 V-3).
- **⑭ Route**: 변경 없음(§1.2).

### 3.5 엔진 계획서와의 대조 (초안 가정 → 엔진 정본 — 2026-11-25)

| # | UI가 필요한 것 | 엔진 정본(엔진 계획서) | 결과 |
|---|---|---|---|
| E-1 | 요구 술어가 분리과세 항목을 받는다: 초과 > 0 ⇒ `{otherSeparate:false, otherComprehensive:true}`, 아니면 요구 없음 | §4.6 `propertyLandSplitRequiredFor({landTaxType, separateAggregateItem, separateTaxationItem, targetDate})` — **일치** | ⑧·④·⑫·`LandSplitInputs` 4곳이 같은 술어 |
| E-2 | Step 3 초과 요약 줄 값 | §4.6·§4.9 `separatedAreaExcessOf(item): {kind, excessArea} \| null`(`separate-taxation.ts`, 던지면 `null`) | **〔엔진 계획서와 맞출 것〕** 반환에 `standardArea`·`totalArea`(·`recognizedArea`) 추가 요청 — 판정이 이미 구한 값이고 반환만 넓히면 된다. 초과분 **공시가액**은 안분식이 필요하므로 Step 3에는 두지 않는다(UQ-3 (가) — 가액은 결과 echo가 정본) |
| E-3 | 결과 echo — 분리과세분 | §4.3 `landSplit.separated {category, appliedRate, ownValue, ownTaxBase, tax, areaLimit{kind, totalArea, standardArea, recognizedArea, excessArea}}` | **일치** — 카드의 «인정 면적 ÷ 부속토지 면적(= %)»은 `areaLimit`에서 파생(`recognizedRatio` echo 없음 — 카드 파생은 현행 `ClassFormula`의 `ratio`와 같은 종류) |
| E-4 | 이관 사유 | §4.3 `factory_area_excess`·`pasture_area_excess` + 라벨(기존 `area_excess` 재사용 금지) | **일치**(초안 가정 이름 `separated_*`는 폐기) |
| E-5 | 최상위 `taxBase` 의미 | §9.2 «초과 > 0에서만 인정분 → 이 필지 자기 과표 합» | **일치**. `appliedRate`는 엔진이 정하지 않음 → **〔엔진 계획서와 맞출 것〕**: 선례(별도합산 echo)처럼 0이면 결과뷰·PDF 계산표 «적용 세율» 행이 «누진세율 (구간별)»로 나온다(§4.3 PDF 행 변경 근거) |
| E-6 | 안내 상수 | §4.9 `PROPERTY_LAND_SPLIT_SEPARATED_NOTICE`(이관·합산 단위·**별도합산 해당 여부 확인 필요**) — `LAND_SPLIT_CARD_NOTICES` 등록 · §9 PSE-E2가 기존 경고 문구 정정(substring 유지) | **일치** |
| E-7 | 세부담상한 | §4.5·Q-3 (가): 합계 150% · direct + 초과 > 0 ⇒ 미적용 + `DIRECT_CAP_NOTICE` · recompute 2단계(PSE-E4) · `cap.basisTaxSeparated?`(분리과세분 직전 재산정액 — 신규 optional, **`basisTaxSeparate`(별도합산)와 다름**) | **일치** — UQ-5가 이 결정에 종속 |
| E-8 | testid 정본 | §4.9 신규 `land-split-separated-section`(분리과세분)·`land-split-separated-area-limit`(기준면적·인정·초과). 같은 표가 «기존 재사용»으로 적은 `land-split-comprehensive-section`·`land-split-total-line`은 **현행 코드에 없다** — 현행은 `land-split-separate`·`land-split-comprehensive`·`land-split-row-separate/comprehensive/total`(`PropertyLandSplitCard.tsx`, E2E·anchor가 사용) | **〔엔진 계획서와 맞출 것〕** 신규 2개는 엔진 이름 채택. **기존 testid는 바꾸지 않는다**(`property-land-split-card.anchor.test.tsx`·`e2e/property-land-split.spec.ts` 회귀). 분리과세분 합계 행은 `land-split-row-separated`(신규 — 엔진 표에 없음) |
| E-9 | 종부세 고지 | §4.8 초과 > 0이면 문구 교체(세액·종부세 엔진 불변) | UI 변경 없음 — 경고 목록에 그대로 보임(카드 상수 목록에는 넣지 않는다) |
| E-10 | ⑥ 사이드바 | 엔진 §5 ⑥ «확인 필요(UI)» | **해당 없음 확정**(§0.2 — 재산세에 사이드바 없음) |
| E-11 | 합산 입력 문구 | §8 V-8·§4.6 끝: `PROPERTY_LAND_SPLIT_INPUT_MESSAGE` 보충은 UI·구현 PR이 정한다 | hint에만 보충(§3.2) — 차단 문구 불변 |

---

## 4. 결과 화면

### 4.1 재사용 vs 확장 (UQ-6)

`PropertyLandSplitCard`를 **확장**한다(새 카드 신설 아님): 인쇄 id `land-split`·PDF 섹션·`property-land-split-card` testid·합계 줄·세부담상한 블록·고지 영역을 한 곳에 유지하고, **분리과세분 블록 1개**와 라벨 분기만 더한다. 분리과세 초과 0이면 `landSplit` echo 자체가 없다(엔진) → 카드가 없어 현행 화면과 동일(UQ-9).

### 4.2 카드 구성 (위→아래)

1. 소제목: «토지 과세 구분별 세액 — 같은 지방자치단체 관할구역 합산 (지방세법 §113①)» — 분리과세 경로에서는 안내 문단을 variant로: «분리과세로 인정되는 부분은 합산하지 않고 그 토지의 과세표준에 단일세율을 적용합니다(§113①3호). 기준면적을 넘는 부분은 종합합산과세대상이라 같은 관할구역의 다른 종합합산 토지와 합산한 과세표준에 누진세율을 한 번 적용하고, 이 필지의 몫만 냅니다.»
2. **분리과세분 블록**(`data-testid="land-split-separated-section"` — 엔진 §4.9 이름) — 한국어 풀어쓰기, 숫자 옆 변수명 라벨. 기준면적·인정·초과 행은 `land-split-separated-area-limit`. 예(엔진 오라클 F-1 — 공시가격 1,500,000,000·부속토지 15,000㎡; 값은 전부 엔진 echo, 아래는 **엔진 §3.2·§6 오라클**):

```
분리과세분 (공장용지 — 공장입지기준면적 이내)
 부속토지 면적                                        15,000㎡
 공장입지기준면적                                     12,000㎡
 분리과세 인정 면적 ÷ 부속토지 면적 (= 80%)           12,000㎡ ÷ 15,000㎡
 이 필지 분리과세 인정 공시가액                       1,200,000,000
 인정 공시가액 × 공정시장가액비율(70%) = 과세표준     840,000,000
 과세표준 × 분리과세 세율(0.2%) = 분리과세분 세액     1,680,000   ← 합산하지 않음
```

3. **종합합산 이관분 블록**(`land-split-comprehensive` — 기존 testid 유지; F-1 값: 이 필지 공시가액 300,000,000 → 합산 과세표준 210,000,000 → 합산 산출세액 800,000 → 몫 800,000) — 기존 `ClassFormula` **그대로**(이 필지 공시가액 + 같은 관할구역 다른 토지 공시가액 합계 = 합산 공시가액 → 공정시장가액비율 → 합산 과세표준 → 세율(누진공제) → 합산 산출세액 → × 이 필지 공시가액 ÷ 합산 공시가액 = 이 필지 몫). 제목은 직접 선택 분기(`compLabel`)에 **분리과세 변형** 추가: «종합합산 이관분 (분리과세 기준면적 초과)».
4. **이관 사유 줄**(`land-split-reasons`): 엔진 라벨(엔진 §4.3 — «공장입지기준면적(칙 §50 [별표 6])을 초과한 공장 부속토지» / «가축별 기준면적(영 §102①3호 [표])을 초과한 목장용지»)을 `PROPERTY_LAND_SPLIT_TRANSFER_REASON_LABEL`로 그대로 출력(UQ-7).
5. **합계 행**: 분리과세분 세액(`land-split-row-separated` — testid 신규) + 종합합산 이관분 이 필지 몫(`land-split-row-comprehensive`) → `land-split-row-total` = 산출세액.
6. **세부담상한 블록**(`land-split-cap`): UQ-5 결정에 따름. 분리과세는 두 분류가 «분리과세분 + 종합합산분»이라 현행 `bothClasses`(`separate && comprehensive`) 분기(`:113·:175`)를 **`separated && comprehensive`도 포함하도록** 일반화하고, 분리과세분 직전 세액상당액은 `cap.basisTaxSeparated`(엔진 E-7 — 별도합산 `basisTaxSeparate`와 다른 키)를 읽는다. direct + 초과 > 0이면 엔진이 상한을 적용하지 않고 `PROPERTY_LAND_SPLIT_DIRECT_CAP_NOTICE`를 낸다(이미 카드 고지 목록에 있음).
7. **고지**(`land-split-notices`): 엔진 상수 — `PROPERTY_LAND_SPLIT_SEPARATED_NOTICE`(이관·합산 단위·별도합산 해당 여부 확인 필요) + 기존 단독 계산·합산·상한 고지(`LAND_SPLIT_CARD_NOTICES`).

값은 전부 엔진 echo — 카드는 곱셈·비교를 하지 않는다(현행 `ratio` 퍼센트 표기 `c.ownValue / c.combinedValue`만 파생 — 선례 그대로).

### 4.3 결과뷰·PDF·인쇄

| 위치 | 변경 |
|---|---|
| `PropertyTaxResultView.tsx` | ① `availablePrintIds` `land-split`(`:395`)은 `landSplit` 존재로 이미 열림 — 변경 없음 ② 산출세액 행 라벨(`:~513`): `landSplit` 분기 문구가 «같은 관할구역 합산 세액 중 이 필지 몫의 합계»인데 분리과세분은 합산 몫이 아니다 → `landSplit.separated`가 있으면 «분리과세분 세액 + 종합합산 이관분 이 필지 몫의 합계» ③ `:533` 재산정 note 분기(`landSplit?.separate && landSplit?.comprehensive`)에 `separated` 조합 추가 — UQ-5가 재산정을 여는 PSE-E4 이후 |
| `PropertyLandSplitCard.tsx` 213줄 | 분리과세분 블록(+~45줄) · 라벨·variant 분기(+~25줄) → ~285줄 — 한도 안 |
| `LAND_SPLIT_CARD_NOTICES` | `PROPERTY_LAND_SPLIT_SEPARATED_NOTICE`(엔진 §4.9) 추가 |
| PDF `ResultPdfDocument.tsx:208-221` | `rows`에 분리과세분(`split.separated`) 행 묶음(이 필지 분리과세 인정 공시가액 · 과세표준 · 세율 · 분리과세분 세액) 추가 — 호출·인쇄 id 불변 |
| PDF `PropertyCalcPdf`(`:242-`) | `적용 세율` 행: `appliedRate`가 0이면 «누진세율 (구간별)»을 쓰는데(`:257`) 분리과세 혼합에서는 부정확 → `landSplit.separated`가 있으면 «분류별 (위 표)»로 |
| 인쇄 섹션 `property-print-sections.ts:56` | 라벨·채널 불변(문구 «토지 과세 구분별 세액» 적합) |
| ⑥ 사이드바 | 없음(§0.2) |
| 이력 저장(IndexedDB `resultData`) | `result`에 optional echo가 늘 뿐 — 이전 결과 열람 시 `landSplit.separated`가 없으면 카드 분기가 `undefined`를 견뎌야 한다(옵셔널 체이닝 — §6.1 단언). 분리과세 + 초과 > 0이던 **과거 저장 결과는 이관분 0(구 값)으로 열린다** — 재계산 안내 필요 여부는 엔진 V-7과 같은 «확인 필요»(`lib/storage/CLAUDE.md` 미확인) |

---

## 5. 14지점 대응 (재산세 — ⑬ 양도세 전용·⑨⑩⑪ 양도세 Zod enum은 제외)

| 지점 | 변경 | 근거(file:line) |
|---|---|---|
| ① 폼 상태 | **없음** — 새 필드 0(`otherComprehensiveValue: string` 재사용) | `shared.ts:193-195` |
| ② initial | **없음** — 빈칸 `""`(자동 0 기본값 금지) | `shared.ts:300-301` |
| ③ normalize | 해당 없음(재산세 폼은 로컬 state — store·normalize 없음) | `PropertyTaxForm.tsx:23` |
| ④ API 변환 | **변경** — `buildSeparateTaxationItem` 추출 + 술어 인자(§3.4) | `request-body.ts:17-22·153-203·208` |
| ⑤ UI 위젯 | **변경** — `LandSplitInputs`(조건·variant·요약) · `Step3`(상한 안내) · `Step2Separated` 문구 2곳 | `LandSplitInputs.tsx:20-39` · `Step3.tsx:94-99` · `Step2Separated.tsx:81-84·213-216` |
| ⑥ 사이드바 | 해당 없음 | §0.2 |
| ⑦ 결과 카드·PDF | **변경** — 카드 분리과세분 블록·라벨(엔진 제공)·상한 일반화 · 결과뷰 산출세액 행 · PDF 행 2곳 | §4 |
| ⑧ validation | **코드 변경 없음**(술어 확장으로 충족) — 단 UQ-5가 재산정을 열면 `isRecomputeTarget` 확장 ⇒ `validateStep(3)` recompute 형식 검사(`shared.ts:528-532`)가 따라옴 | `shared.ts:524-532` |
| ⑫ Zod 입력 객체 | **새 키 0**(엔진 §5 ⑫와 같음) · `superRefine` 술어 인자 추가(E-1) — ⑫ 선언 누락 stripping 위험은 anchor가 지킨다 | `property-input.ts:192-201·505-509` |
| ⑭ Route | 없음 | `route.ts:65-79·102` |
| 종부세 연동 | 영향 없음(§0.2) — export 시그니처 변경 0, 종부세 엔진은 housing만 호출. `comprehensive-tax-ui-senior` 통보 불필요(구현 PR 머지 시 한 줄 통지만) | `comprehensive-tax.ts:250·294` |

### 5.1 기존 경고 문구 제거·변경 위치

| 위치 | 현행 | 변경 |
|---|---|---|
| `separate-taxation-classify.ts:341-349`(목장)·`:497-504`(공장) | «…종합합산과세대상으로 이관됩니다. 인별 합산 계산 시 별도 처리가 필요합니다.» | **엔진 몫(E-6)** — 세액이 반영되면 «별도 처리가 필요» 문구는 거짓. 이관 사실만 남기거나 카드 상수로 교체. 테스트 3곳이 이 문구를 단언한다: `property-factory-separate-limit.anchor.test.ts:91·304` · `separate-taxation.test.ts:133`(`"종합합산과세대상으로 이관"` 부분 문자열 — 접두 유지하면 불변) |
| `property-tax.ts:505` | «분리과세 대상 토지는 종합부동산세 과세 대상에서 제외됩니다» | 엔진 §4.8이 초과 > 0일 때 교체(세액 불변) — UI 변경 없음(경고 목록에 그대로) |
| `Step2Separated.tsx:81-84·213-216` | «초과분은 종합합산과세대상으로 이관됩니다.» | UI 몫 — §3.3 한 문장 추가 |
| 결과 «경고» 목록 | 위 문구가 그대로 나옴 | 카드가 같은 사실을 직접 보이므로 `LAND_SPLIT_CARD_NOTICES`로 제거(별도합산 선례) |

---

## 6. 테스트·E2E

### 6.1 기존 vitest 기대값 변화

| 파일 | 변화 |
|---|---|
| `property-land-split-inputs.anchor.test.tsx:65` «분리과세·주택 — 칸 없음» | 분리과세 중 **초과 0**(또는 면적 한도 없는 유형)은 칸 없음 유지 · **초과 > 0 신규 셀**(공장·목장) → 종합합산 칸만 · 별도합산 칸 DOM 0 |
| `property-land-split-card.anchor.test.tsx:283` «분리과세: 재산정 선택지 없음» | UQ-5 결정에 따름(추천 = 불변) |
| 같은 파일 카드 기대값 | 분리과세 echo 있는 결과(`result.landSplit.separated`)로 분리과세분 블록·합계 행·이관 사유 라벨 단언 + **echo 없는 이전 이력 결과**(분리과세 단일)에서 카드 없음 단언 |
| `property-separated-factory.anchor.test.tsx` | 안내 문구 변경(§3.3)에 걸리는 단언 있는지 **확인 필요**(정독 안 함 — 첫 50줄만 읽음) |
| `property-shared.test.ts:182-` | 분리과세 ⑧ 기존 단언 불변 · 초과 시 Step 3 ⑧ 신규 |
| `__tests__/print/property-land-split-pdf.anchor.test.tsx` | 분리과세 echo 포함 결과로 `land-split` PDF 렌더 성공 1건 추가 |
| 엔진 anchor(`property-factory-separate-limit` LIM-4·LIM-5, `separate-taxation.test.ts`) | **엔진 시니어 몫** — `taxBase`·`calculatedTax` 의미가 E-5로 바뀌면 기대값 갱신 |

### 6.2 ⑧↔⑫ parity 격자 — **필요하다**

이유: 요구 술어가 새 분기(분리과세)를 얻고 ⑧(Step 3 미리보기)·⑫(Zod)·엔진이 **같은 함수**를 같은 입력 객체로 부른다 — 입력 객체를 만드는 쪽(④의 `buildSeparateTaxationItem` vs Zod 통과 객체)이 둘이라 어긋날 수 있다(별도합산에서 N3이 실제로 났다). 현행 격자의 «토지-분리과세» 그룹(`property-precalc-parity-grid.anchor.test.ts:~160`)은 `farmland`뿐이라 공장·목장 셀이 **하나도 없다** → 이 변경이 격자의 첫 공장·목장 셀이다.

- **G-A (기존 `precalc-parity` 확장)**: 유형 {공장(산업단지) · 공장(읍면 `other`) · 축산 · 농지} × 면적 {이내 · 초과 · 빈칸} × 합산 칸 {빈 · `0` · 값} × Step 2 결함 {없음 · 입지 미선택 · 연면적 빈칸 · 축종 미선택 · 마릿수 0}. 단언: ⑧ 통과 ∧ ⑫ 400 = 0 · ⑫ 400 ⇒ ⑧ 차단 · ⑧ 통과 ∧ ⑫ 통과 ∧ 엔진 던짐 = 0 · 초과 > 0 ⇔ 종합합산 칸 요구 ⇔ ④ body에 `otherComprehensiveValue` · **초과 0·한도 없는 유형에서 합산 칸 stale 값이 body에 없음**.
- **격자가 이름 붙여 닫아야 할 두 셀 군(`uiOnlyReason`·엔진 던짐 허용 사유 — 새 사유가 생기면 목록을 보고 판단한다는 파일 머리 규칙)**: ① **Step 2 면적 입력 미완**(연면적·면적률·부속토지 면적·축종·마릿수 빈칸) — ⑧ 차단 ∧ ⑫ 통과(Zod가 면적 키를 요구하지 않고 엔진 §4.6이 술어를 `null`로 접었다) ∧ 엔진 throw(422). 현행 `uiOnlyReason`(`:~168-176`)에 해당 사유가 없어 새 이름(예 `separated-area-input`)이 필요하다. ② 공장 `허가·사용승인 미이행` ON → ⑧ 통과 · ⑫ 통과 · **엔진 422**(현행 의도된 동작 — «종합합산 재입력» 문구, `e2e/property-separate-requirements-api.spec.ts:178`): 격자의 «⑧ 통과 ∧ ⑫ 통과 ∧ 엔진 던짐 = 0» 단언이 이 셀에서 실패하므로 허용 사유로 닫거나 별도 결정(§8 V-5). 둘 다 **이번 변경이 만든 결함이 아니라 격자가 처음 드러내는 기존 동작**이다.
- **G-B (렌더 격자 소형, 신규 `property-separated-excess-render-grid.anchor.test.tsx`)**: Step 3를 실제 렌더해 «화면에 그려진 합산 칸 = 술어 요구 칸 = ⑧이 첫 번째로 막는 칸» — 공장 3 × 축산 2 × 초과 {0, >0} 정도(수십 셀 — 시간 한도 부담 없음 · **실측 전 미확정**).
- 뮤테이션 확인(구현 PR): ① ④ 술어 인자에서 `separateTaxationItem`을 빼면 G-A·G-B 실패 ② ⑫ 호출 인자에서 빼면 G-A 실패 — 격자가 비공허한지 실측해 보고(미수행 시 명시).

### 6.3 E2E 시나리오 (신규 `e2e/property-separated-excess.spec.ts` + 헬퍼 확장)

**헬퍼**(`e2e/_helpers/property-land.ts`, 현 139줄): `fillSeparatedFactory(page, {location, total, floor, rate})` · `fillSeparatedPasture(page, {total, livestockType, count, facilities})`. 분리과세 유형·입지는 **라디오 role + 라벨 정규식**(`getByRole("radio", { name: /공장용지/ })`), 면적은 `pt-factory-*`·`pt-pasture-*` testid, 축종은 shadcn Select(`pt-pasture-livestock-type` 클릭 → 옵션 선택 — **옵션 role·라벨은 구현 시 확인 필요**). 사슬 판단을 헬퍼에 넣지 않는다(선례 원칙).

**세액 오라클 = 엔진 계획서 §3.2·§6이 정본**(F-0·F-1·F-2·P-1·P-2). 이 UI 문서는 같은 시료를 쓴다 — 현행 값(F-0 총 1,344,000 · F-1 총 2,016,000 · P-1 총 18,374)은 이 세션 probe로도 재확인했다(엔진 문서 §3.2와 일치).

| # | 경로 | 기대 testid·값 | body 키 |
|---|---|---|---|
| SE-1 | 공시가격 **1,500,000,000** → 토지 → 분리과세 → 공장용지·산업단지 → 부속토지 15,000㎡·연면적 1,200㎡·면적률 12% → 다음 → Step 3 (**엔진 F-1 / K-2**) | `land-split-inputs-excess` 가시(기준면적 12,000㎡·초과 3,000㎡) · `other-comprehensive-value` 가시 · `other-separate-aggregate-value` **count 0** → `0` 입력 → 계산 → `property-land-split-card` · `land-split-separated-section` 분리과세분 **1,680,000**(과세표준 840,000,000) · `land-split-row-comprehensive` **800,000**(합산 과세표준 210,000,000) · `land-split-row-total` **2,480,000** · 총 납부세액 **2,976,000** | `landTaxType:"separated"` · `otherComprehensiveValue:0` · `otherSeparateAggregateValue` 없음 · `separateTaxationItem.factoryTotalLandArea:15000` |
| SE-2 | SE-1 + 타 종합합산 **200,000,000** (**F-2 / K-4**) | `land-split-comprehensive`: 합산 공시가액 500,000,000 · 합산 산출세액 1,500,000 · 몫 **900,000** · 합계 **2,580,000** · 총 **3,096,000** | `otherComprehensiveValue:200000000` |
| SE-3 | 축산: 공시가격 100,000,000 · 2,000㎡ · 한우(육우) 사육 50마리 · 부대시설만 보유 (**P-1 / K-5**) | 분리과세분 **15,312** · 이관분 **96,250** · 합계 **111,562** · 총 **133,874** | 동일 · `pastureLivestockType` 등 |
| SE-4 | 공시가격 800,000,000 · 공장 **8,000㎡**(이내, **F-0 / K-1**) | Step 3에 `land-split-inputs-excess`·합산 칸 **DOM 0** · 카드 **없음** · 산출 **1,120,000**·총 **1,344,000**(현행과 동일) | `otherComprehensiveValue` **없음** |
| SE-5 | SE-1에서 합산 칸 빈칸 → 계산 | ⑧ 문구 `PROPERTY_LAND_SPLIT_INPUT_MESSAGE.otherComprehensiveValue` 가시 · **서버 호출 0** | — |
| SE-6 | SE-1 후 Step 2 복귀 → 부속토지 8,000㎡로 → Step 3 → 계산 | 합산 칸·카드 없음 · body에 `otherComprehensiveValue` **없음**(stale 미전송) · 다시 15,000㎡ → 칸 복귀(값 보존, 폼 값은 지우지 않음) | — |
| SE-7 | 분리과세 공장 입력을 비운 채 StepIndicator로 Step 3 | 합산 카드 **없음**(엔진 §4.6 `null`) · 계산 → Step 2의 구체 문구로 복귀(**서버 호출 0**) | 0건 |
| SE-8 | 375px — Step 3 카드·결과 카드 | `scrollWidth <= innerWidth` | — |
| SE-9 | 세부담상한: SE-1 + direct `previousYearTax` | 엔진 K-13 — 상한 미적용 + `DIRECT_CAP_NOTICE` 가시 · (PSE-E4 이후) recompute 선택지가 열리고 K-14 오라클 | `previousYearTax` / `taxCapMode:"recompute"`·`previousYearTaxBase` |

**미확정**: 도시지역(`isUrbanArea`) 셀(엔진 F-1u — 총 4,446,000)은 위 SE에 넣지 않았다 — 도시지역 토글이 Step 0에 있다는 것만 확인했고(`isUrbanArea` 사용처 grep), E2E 조작 경로는 **확인 필요**. 부가세 정합(K-19)은 vitest 엔진 anchor가 맡는다.

---

## 7. 사용자 결정 UQ (각 안 — 첫 번째가 추천안)

**UQ-1 — 합산 칸의 위치.** (가) **Step 3 기존 `LandSplitInputs` 재사용** · (나) Step 2 면적 카드 바로 아래에 칸 추가 · (다) 별도 Step 신설. **추천 (가).** 근거: 별도합산 선례(PSA-E4)와 같은 자리라 ⑧(`validateStep(3)`)·`firstInvalidStep`·E2E 헬퍼·테스트가 그대로 재사용되고, 계산 순서(한도 판정 → 합산 → 상한)와 화면 순서가 일치한다. (나)는 Step 2 입력 도중 칸이 생겼다 사라져 레이아웃이 튀고 ⑧(2)가 합산 칸을 알아야 한다. (다)는 `visibleStepLabels`·`displayStep`(`PropertyTaxForm.tsx:65-84`)·`onStepClick` 역매핑 전부를 건드려 범위 과대.

**UQ-2 — 문구.** (가) **기존 카드 재사용 + 분리과세 variant**(안내 문단만 파생 교체, 라벨·hint·testid 불변) · (나) 문구 그대로 재사용 · (다) 분리과세 전용 컴포넌트 신설. **추천 (가).** 근거: 현행 안내 «종합합산·별도합산 토지는 …»는 분리과세 이관분에 맞지 않고(분리과세는 합산 대상 아님), 라벨·hint(«없으면 0을 입력하세요»)는 그대로 맞는다. (나)는 사용자에게 «이 토지가 합산된다»고 오해시킬 수 있다(분리과세 인정분은 합산 안 됨). (다)는 같은 칸을 두 곳에 두어 ⑧↔⑫ 단일 소스 원칙에 어긋난다.

**UQ-3 — «왜 이 칸이 나왔나» 초과 요약 줄(Step 3).** (가) **면적 3값만 표시** — «기준면적 N㎡ · 부속토지 T㎡ · 초과 M㎡»(엔진 `separatedAreaExcessOf` 반환을 넓혀 사용 — §3.5 E-2) · (나) 면적 + **초과분 공시가액**까지(엔진 프리뷰가 `publishedPrice`를 받아 `apportionByArea` 안분을 같이 반환해야 함) · (다) 안내 문단만. **추천 (가).** 근거: 별도합산 철거 요건에서 사용자가 «왜 이 칸이 필요했나»를 같은 값으로 말해 주도록 한 결정(PSA-E2 `demolishedVerdict`)과 같은 취지이고, Step 2 값이 아직 머릿속에 있는 시점이라 면적 단위 오입력을 발견할 기회다. 초과분 **공시가액**은 안분식(`floor`·잔액 흡수)이라 화면이 재현하면 단일 소스 위반이고 엔진 반환을 더 넓혀야 하므로 결과 카드 echo에서만 보인다((나)는 사용자가 Step 3에서 가액을 보고 싶다고 하면 전환 가능 — 엔진 요구 1개). 조건: 화면은 계산하지 않고 엔진 값을 그대로 출력.

**UQ-4 — Step 2에서의 초과 미리보기.** (가) **하지 않음** — 문구 한 문장만(§3.3) · (나) 면적 카드 하단에 «기준면적 N㎡ · 초과 M㎡» 미리보기 · (다) 초과 시 경고 카드(amber). **추천 (가).** 근거: 입력 도중에 값이 계속 바뀌는 파생 표시는 ⑧↔DOM 단언·격자 비용이 크고(칸이 아니라 표시라도 테스트 대상이 된다), 같은 정보는 Step 3 요약(UQ-3)이 이미 준다. (나)는 별도 요청이 있으면 엔진 프리뷰(E-2) 재사용으로 추가 가능.

**UQ-5 — 세부담상한(직전연도 세액) 처리 — 엔진 Q-3과 같은 결정.** (가) **엔진 Q-3 (가)를 그대로 따른다**: 필지 합계에 150% 상한 · **direct 입력은 이관분이 있으면 상한 미적용 + 확인 필요 고지**(별도합산 선례 `Step3.tsx:94-99` 안내와 같은 구조) · **recompute(직전 과세표준 재산정) 선택지는 엔진 PSE-E4가 구현된 뒤에 개방**(`isRecomputeTarget`(`request-body.ts:86`)을 «분리과세 ∧ 요구 술어가 종합합산 칸을 요구»로 확장 — 같은 술어 파생이라 ⑧(`shared.ts:528-532`)·④·Step 3 위젯 3곳이 한 번에 따라온다). **단계 분할**: UI-1에서는 direct 고지 안내만 두고 recompute 개방·«재산정을 선택하세요» 문구는 PSE-E4 머지 뒤 UI-2 이후에 넣는다 — 선택지가 없는 화면에 «재산정을 선택하세요»를 쓰지 않는다(선례 S-7b: 안내는 선택지가 화면에 있을 때만) · (나) direct 고지만 두고 recompute는 열지 않는다(엔진 Q-3 (다)) · (다) 이관분이 있으면 상한 칸을 숨긴다. **추천 (가).** 근거: 엔진이 direct를 막으면(영 §118①1호 가목 단서·다목 — 직전 구분을 알 수 없음) 이관분이 있는 납세자가 상한을 받을 길이 recompute뿐이라, 화면이 그 길을 열어 주지 않으면 «혜택 불성립 + 확인 필요»가 영구적이 된다. (나)는 범위가 작지만 그 납세자에게 길이 없다. (다)는 상한(§122)을 받을 권리를 UI가 지워 법 근거 없는 불리 적용이다. ⚠️ 엔진 Q-3이 (나)/(다)로 바뀌면 이 UQ가 그대로 따라간다. 분리과세 + 초과 0은 상한 입력이 **현행 그대로**(직접 입력만, `Step3.tsx:116-131`).

**UQ-6 — 결과 카드.** (가) **`PropertyLandSplitCard` 확장**(분리과세분 블록 + 라벨 분기 + 합계·상한·고지 재사용) · (나) 분리과세 전용 카드 신설 · (다) 카드 없이 경고 문구와 «산출세액» 한 줄만. **추천 (가).** 근거: 인쇄 id `land-split`·PDF 섹션·`property-land-split-card`·합계/상한/고지가 한 벌이고 사용자는 «토지 구분별 세액»을 한 곳에서 본다. (나)는 PDF·인쇄 선택 항목·테스트가 갈라지고 합계 줄이 중복된다. (다)는 «과세표준 × 세율 ≠ 산출세액»을 사용자가 검증할 수 없다(별도합산 U2가 카드를 만든 이유와 동일).

**UQ-7 — 이관 사유 표시.** (가) **엔진의 분리과세 전용 사유 값 2개**(`factory_area_excess`·`pasture_area_excess` — 엔진 §4.3, 라벨은 엔진이 `PROPERTY_LAND_SPLIT_TRANSFER_REASON_LABEL`에 정의)를 카드가 그대로 출력 · (나) 기존 `area_excess` 재사용 + 카드가 echo(`separated.areaLimit.kind`)로 라벨 선택 · (다) `area_excess` 라벨 문구를 중립으로 수정. **추천 (가) — 엔진 계획서와 같음(결정 아님·확인).** 근거: 현행 `area_excess` 라벨은 «기준면적(바닥면적 × 용도지역 배율)을 초과한 토지»(`property-land-split-tax.ts:148`)로 **별도합산 전용 문구** — 분리과세에서 쓰면 틀린 근거를 사용자에게 말한다. (가)는 `Record<PropertyLandSplitTransferReason,string>` 때문에 라벨 누락이 컴파일 오류로 잡힌다. (나)는 카드가 판정을 추론하게 되어 «화면은 계산·추론 안 함» 원칙에 어긋난다.

**UQ-8 — 기존 이관 경고 문구(«…별도 처리가 필요합니다»).** (가) **엔진이 이관 사실 고지로 교체 + 카드 상수로 노출·경고 목록에서 중복 제거** · (나) 경고 문구 유지(세액이 반영돼도 그대로). **추천 (가).** 근거: 이관분에 세액이 매겨지면 «별도 처리가 필요합니다»는 사실과 다르다(허위 고지 — 법령 정확성 최우선). 테스트 3곳이 부분 문자열 `"종합합산과세대상으로 이관"`을 단언하므로(§5.1) 접두를 유지하면 불변.

**UQ-9 — 초과 0일 때 카드.** (가) **카드 없음(현행 유지 — `landSplit` echo 없음)** · (나) 분리과세는 초과 0이어도 단일 분리과세 카드를 항상 표시. **추천 (가).** 근거: 세액이 안 바뀌는 입력(농지·이내 등 대다수)의 결과 화면·PDF·테스트를 건드리지 않아 회귀 0이고, 기존 «과세표준»/«산출세액» 섹션이 이미 단일 산식을 보인다. (나)는 모든 분리과세 유형에 카드를 만들어 범위가 커진다.

---

## 8. 미검증 V-n · 확인 필요 (추정 금지)

- **V-1 〔엔진 계획서와 맞출 것〕** §3.5 대조표의 «맞출 것» 4건: E-2(`separatedAreaExcessOf` 반환에 `standardArea`·`totalArea` 추가) · E-5(`appliedRate` 값) · E-8(testid 이름 — 엔진 §4.9가 «기존 재사용»으로 적은 `land-split-comprehensive-section`·`land-split-total-line`은 현행 코드에 없음, 기존 `land-split-comprehensive`·`land-split-row-total` 유지) · 엔진 Q-3 결정(UQ-5 종속). 구현 PR 직전 한 번 더 대조.
- **V-2 초과분의 귀속(엔진 Q-1·V-1·V-2와 같은 미결)** — 엔진 계획서가 법령(영 §101①2호 «제1호에 따른 공장용 건축물은 제외»)을 확인해 «별도합산일 수 있음 — 해석례 미확보»로 두고 종합합산 단일 + 고지를 추천했다(§1.4). **UI 영향**: 추천안이면 요구 칸은 종합합산 1개(이 문서). 엔진 Q-1 (나)(3-way)로 바뀌면 별도합산 칸 + 별도합산 필지 입력(바닥면적·용도지역·허가)이 Step 3/Step 2에 더 필요해 이 계획서의 §1.6·§2·§3 전제가 바뀐다 — 그때 재작성한다. 이 세션은 법령 본문을 새로 조회하지 않았다(엔진 계획서의 verbatim 인용에 의존).
- **V-3 술어가 던질 때(분리과세)** — **해소(엔진 §4.6)**: 판정이 던지면 `null`(요구 없음), 엔진도 같은 판정을 던져 422라 침묵 0원 경로 없음 — 엔진이 «술어 throw ⇒ 엔진 throw» anchor로 고정한다. UI 몫: 이 비대칭이 만드는 ⑧ 차단 ∧ ⑫ 통과 셀을 격자 허용 사유로 이름 붙임(§6.2 ①).
- **V-4 종부세 경고 문구** — **해소(엔진 §4.8 · §1.3 종부세법 §11)**: 이관분이 있으면 엔진이 문구를 교체한다. UI는 변경 없음. 초과 0은 현행 문구(결과 불변).
- **V-6** `ToneCard`가 `data-testid`를 전달하지 않는다는 주석(`Step2Separated.tsx:194-195`)은 정독만 — 구현 시 `ToneCard` 소스로 재확인.
- **V-7** `PropertyTaxResultView` 과세표준 섹션 `TaxRow`(`:~420-450`)가 E-5(전체 과세표준)로 바뀐 `taxBase`에서 정합한지 — 정독만, 렌더 단언은 구현 때.
- **V-8** 축산 Select 옵션의 E2E 접근 방식(`pt-pasture-livestock-type`는 shadcn `SelectTrigger` — 옵션 role·라벨 실측 안 함).
- **V-9** `property-separated-factory.anchor.test.tsx`(177줄)는 첫 50줄만 읽었다 — §3.3 문구 변경에 걸리는 단언은 구현 때 grep.
- **V-10** 375px: 분리과세분 블록 + 합산 카드가 가로 넘침 없는지 — **미수행**(SE-8).
- **V-11** 브라우저 수동 확인(폼 → 계산 → 결과, Network 탭 body) — **미수행**(문서 전용 작업).
- **V-12** 초과 면적 > 0이나 공시가격이 극히 작아 초과분 공시가액이 0이 되는 경계 — 안분 식 `assessedValue − floor(assessedValue × ratio)`(`:236`)상 `assessedValue ≥ 1`·비율 < 1이면 ≥ 1이라 0이 안 될 것으로 **추정**(미실측) — 술어는 면적 기준이라 무관하나 요약 줄 표시는 확인 필요. ⑧ `publishedPrice`가 `"0"`일 때(`shared.ts` Step 0는 `parseAmount === null`만 거름) 동작도 확인 필요.
- **V-13 이력 재열람** — 과거에 저장한 «분리과세 + 초과 > 0» 결과는 이관분 0의 구 값으로 열린다(엔진 V-7과 같음). 재계산 안내가 필요한지는 `lib/storage/CLAUDE.md` 미확인 — **확인 필요**.
- **V-14 hint/라벨 문구의 법적 표현** — «다른 공장용지·목장용지의 기준면적 초과분도 포함»(엔진 V-8)은 §113①1호 «종합합산과세대상이 되는 토지의 가액을 모두 합한 금액»에 기댄 설명이다 — 문구 확정은 구현 PR에서 `verify:legal` 키워드 대조와 함께(엔진 §4.7 manifest 항목에 §113①1호는 PSA-E4가 이미 등록).
- **V-15 도시지역(`isUrbanArea`) E2E 조작 경로** — 엔진 F-1u(총 4,446,000)를 E2E에 넣을지는 Step 0 토글 위치 확인 후(미확인).

---

## 9. PR 분할·800줄 정책

엔진 PR 분할은 **엔진 계획서 §9가 정본**(PSE-E0 회귀 anchor → E1 술어·타입·상수 → E2 leaf·분기 → E3 ⑫ Zod·격자 → E4 recompute). UI는 같은 브랜치에서 엔진 커밋 뒤에 이어 붙는다(엔진이 타입·헬퍼·anchor 선처리 → UI가 ⑤⑦⑧ — 시퀀셜):

| 커밋 | 내용 | 선행 |
|---|---|---|
| **PSE-U1** | ④ `buildSeparateTaxationItem` 추출 + `landSplitRequired`·`landSplitRequiredFromForm` 술어 인자 · `LandSplitInputs` 분리과세 분기(요약 줄·문구·hint variant) · Step 2 문구 · Step 3 direct 고지 안내(UQ-5 단계 1) · G-A·G-B 격자·위젯 anchor | 엔진 E1(술어·`separatedAreaExcessOf`) · E3(⑫ — G-A가 ⑫를 부르므로) |
| **PSE-U2** | `PropertyLandSplitCard` 분리과세분 블록·라벨·상한 일반화 · 결과뷰 산출세액 행 · `LAND_SPLIT_CARD_NOTICES` · PDF 행 2곳 · 카드·PDF anchor | 엔진 E2(echo) |
| **PSE-U2b** | `isRecomputeTarget` 확장 + Step 3 «재산정 선택» 안내(UQ-5 단계 2) | 엔진 **E4** 머지 뒤 |
| **PSE-U3 (E2E)** | 헬퍼 + `property-separated-excess.spec.ts`(SE-1~9) + 뮤테이션 확인 보고 + 브라우저 확인 | U1·U2 |

줄 수 예상(전부 한도 안): `PropertyLandSplitCard.tsx` 213→~285 · `LandSplitInputs.tsx` 76→~125 · `request-body.ts` 329→~345 · `Step3.tsx` 134→~145 · `property-land-split-inputs.ts` 57→~65 · `ResultPdfDocument.tsx` 518→~535 · `e2e/_helpers/property-land.ts` 139→~190. 엔진 `property-tax.ts`는 엔진 §4.1이 분기를 새 파일로 이동해 ≈570줄로 둔다(엔진 몫).

## 10. 3대 정책·DoD 자가 점검

1. **useEffect → store 미러링**: 없음 — 요약 줄·variant·hint 전부 렌더 파생(`LandSplitInputs`는 이미 순수 함수 컴포넌트), 폼 쓰기는 `onChange` 한 칸 패치뿐.
2. **자동 안분 fallback**: 없음 — 합산 칸 빈칸은 ⑧·⑫ 차단, `0`은 사용자 명시. 초과분 가액 안분(`apportionByArea`)은 기존 엔진 법정 안분(§102①1호·3호 «범위의 토지»)이지 입력 fallback이 아니다. PHD 예외 해당 없음.
3. **⑧ 동기화**: ④ `buildSeparateTaxationItem`·⑫ 호출 인자·⑧ 요구 미리보기가 **같은 술어**에 연결 — G-A가 ⑧↔⑫ 모순 0을 전수로 닫는다(UQ·V-3 결정 전제).
- DoD: 14지점 중 재산세 해당 분(§5) 전수 점검 완료(계획 단계). `npx tsc --noEmit`·vitest·브라우저 확인은 **코드 변경이 없어 미수행**. `ui-engine-sync-checker`는 Do 후 호출.

---

## 사용자 결정 (2026-11-26 확정)

| 항목 | 결정 |
|---|---|
| Q-1 초과분 과세 구분 | **(가) 종합합산 단일 + «별도합산 해당 여부 확인 필요» 고지** — 3-way·토글 기각 |
| Q-2 목장용지 | **(가) 공장·목장 같이** |
| Q-3 세부담상한 | **(가) 필지 합계 적용 · direct는 이관분 있으면 미적용 + 확인 필요 · recompute는 같은 브랜치에서 구현** |
| Q-4 초과>0 · 합산 칸 미입력 | **(가) ⑧ 차단 + ⑫ 400** (0 기본값 재제안 금지) |
| Q-5 결과 표시 | **(가) `PropertyLandSplitCard` 확장** |
| Q-6 종부세 고지문 | **(가) 초과>0이면 «분리과세 부분만 제외 · 이관분은 종합합산 대상일 수 있음»으로 교체** |
| UQ-1~UQ-9 | **전부 (가) 추천안** |
