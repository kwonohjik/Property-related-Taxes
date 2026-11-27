# 국외자산 부동산 양도소득세(소득세법 §118의2~§118의8) — UI·클라이언트 계획(①②③⑤⑥⑦ + ⑧의 UI 쪽)

> 짝 문서: `transfer-foreign-realestate.engine.plan.md`(엔진·API — 병행 작성 중, 이 트리에는 아직 없다). **엔진 파트와 맞춰야 하는 이름·계약은 「(후보)」·「엔진 확인 필요」로 표시**한다. 최종 필드명·result 타입은 엔진 계획서가 우선이다.
> **범위**: 14개 동기화 지점 중 ①폼 ②initial ③normalize ⑤위젯 ⑥사이드바 ⑦결과 + ⑧validate의 UI 쪽 규칙. ④(변환)는 호출 지점·입력 계약만 적는다. ⑨~⑭(Zod·route)는 엔진 파트.
> **기준 트리**: 워크트리 `foreign-re-plan`(master `aaafc4028` 기준). 아래 file:line은 전부 이 트리에서 열어 읽은 값이다. 코드는 한 줄도 바꾸지 않았다.
> **표기**: 「코드 읽기」= 파일을 열어 확인 · 「확인 필요」= V-n 레지스터 · 「(후보)」= 엔진 파트와 맞출 이름. 조문 인용은 KoreanLaw MCP로 현행 본문을 읽고 적었다(소득세법 시행 2026-01-01 본, 시행령 2026-10-01 본).

---

## 0. 한 줄 요약

양도세 마법사 **1단계 최상단에 「자산 소재」 라디오(국내/국외)** 를 두고, 국외를 고르면 국내 자산 카드(`CompanionAssetsSection`) 대신 **국외 전용 입력 5섹션**(①납세의무·자산 ②양도 ③취득 ④필요경비 ⑤외국납부세액)을 한 단계로 보여 준다 — 주식 마법사가 `marketType === "foreign_stock"`에서 **조기 반환**하는 선례(`app/calc/stock-transfer-tax/steps/Step1.tsx:206-212`)를 그대로 따른다. 보유 상황·감면·가산세 단계는 P1에서 **마운트하지 않는다**(국내 전용 입력이라 지우는 것이 아니라 «안 띄운다»). 금액은 **외화 + 일자별 기준환율**로 받고(교재의 환율 3종 함정은 FieldCard `hint`로 막는다), 결과는 **전용 결과 카드**(`result.mode === "foreign"`, 후보)로 환산 단계를 한국어 산식으로 보인다.

---

## 1. 실측 — 지금 어디에 무엇이 있나 (코드 읽기)

### 1.1 양도세 마법사에 국외 경로가 없다

- `app/calc/transfer-tax`·`components/calc/transfer`·`lib/stores`·`lib/calc/transfer-*`에서 `foreign|국외|외화|exchangeRate|환율` 문자열을 grep하면 양도세 경로에는 **적중이 없다**(적중은 주식·상속·증여·재산 쪽뿐 — 2026-11-27 grep). 즉 새 입력·새 결과를 **통째로 짓는** 작업이다.
- 마법사 구조(`app/calc/transfer-tax/transfer-calculator-meta.ts:3`): `STEPS_SINGLE = ["자산 목록","보유 상황","감면·공제","가산세"]`. `TransferTaxCalculator.tsx`가 `STEPS_SINGLE`을 **상수로 직접 3곳**에서 쓴다(`:376` 단계 상태 · `:390` 사이드바 단계 · `:524` 스테퍼) — `:61`의 `const STEPS = STEPS_SINGLE`는 `totalSteps`(`:123`)에만 쓰인다. 단계 라벨을 동적으로 만들려면 이 4곳을 함께 바꿔야 한다(안 바꾸면 스테퍼와 `totalSteps`가 갈린다).
- 결과 분기(`TransferTaxCalculator.tsx:448`): `result.mode === "single"` → `TransferTaxResultView`(678줄, 국내 전용 카드 다수), `:467` `"mixed-use"`, 그 외 `bundled`. **국외 분기 없음.**
- 가산세는 `transfer-calc-actions.ts:113-143`이 `callTransferTaxAPI`를 두 번 부르고 `baseRes.mode !== "single"`이면 조기 종료(`:121`)하며 `result.determinedTax`(`:127`)를 읽는다 → 새 result 모드는 이 경로에서 **막힌다**(UQ-2의 근거).

### 1.2 주식 마법사의 국외 선례 — 재사용 지도

| 용도 | 위치 | 이번 재사용 |
|---|---|---|
| 시장 라디오(`RadioCardGroup`, tone sky) | `components/calc/stock-transfer/MarketTypeBlock.tsx:62-80` | 패턴만(옵션 2개 라디오) |
| 1단계 조기 반환 | `app/calc/stock-transfer-tax/steps/Step1.tsx:206-212` | 구조 그대로 |
| §118의2 5년 요건 + 5년 미만 경고 | `ForeignStockIdentityBlock.tsx:26-55`(DecimalInput 거주연수 · amber 경고 카드) | 문구·구조 복제 → **공용 leaf로 추출**(U0) |
| 통화 목록 | `stock-transfer/currency-options.ts:8-15`(`CURRENCY_OPTIONS`) — 주식·국외전출세가 이미 공용 | 그대로 import |
| 환율 칸·원화 환산 미리보기 | `ForeignStockPriceBlock.tsx:75-141` · `:162-188` | 칸 구조 복제(미리보기는 엔진 leaf로 — §6.2) |
| 장기할부 수령 행(날짜·외화·환율·원화 환산) | `InstallmentReceiptsMatrix.tsx:28-110` | **자본적지출·양도비 행 입력의 모델**(일반화 U0) |
| 지출일 환율 칸(금액>0일 때만) | `ForeignStockExpenseBlock.tsx:38-77` | 모델 — 단 **fallback 부분은 가져오지 않는다**(UQ-5) |
| 외국납부세액 ToggleCard·통화·금액·납세일 환율·택일 라디오 | `ForeignStockExpenseBlock.tsx:115-` · 옵션 상수 `foreign-stock-shared.tsx:72-`(`FOREIGN_TAX_METHOD_OPTIONS`) | 구조 복제, 상수는 공용으로 이동(U0) |
| 결과 산식 `외화 × 환율 = 원화` | `ForeignStockResultCard.tsx:35-41`(`fxFormula`) · 행 `:48-` | `fxFormula`를 공용으로 추출(U0) |
| 신고서·인쇄 선택 | `app/calc/stock-transfer-tax/steps/Step4.tsx:98`(`PrintSelectionPanel`) · `:175-188`(`PrintSection`) · e2e `foreign-track-print-selection.spec.ts` | 같은 패턴, 레지스트리는 신설 |
| 사이드바 국외 분기 | `StockSidebar.tsx:179-196`(환산 참고 + 결과 후 행) | 같은 규약(§5) |

### 1.3 법령 본문 대조 (이 화면 문구의 근거 — 조회 완료)

| 조문 | 확인한 내용 | UI에 미치는 영향 |
|---|---|---|
| 소득세법 §118의2 | 거주자 중 「양도일까지 **계속 5년 이상** 국내에 주소 또는 거소」를 둔 자만 대상. 1호 토지·건물 / 2호 부동산에 관한 권리(가 취득권리·나 지상권·다 전세권·부동산임차권) | ① 섹션의 거주 요건 칸·자산 종류 3분 |
| §118의3 | 양도가액 = 양도 당시 실지거래가액(불가 시 소재국 시가 → 영 위임) | ② 섹션 «실지거래가액» 한정(UQ-11) |
| §118의4①②  | 필요경비 = 취득가액 + 자본적지출 + 양도비, 외화 환산은 영에 위임 | ③④ 섹션 |
| 영 §178의5①② | **「수령하거나 지출한 날 현재 외국환거래법에 의한 기준환율 또는 재정환율」**. ② 장기할부는 영 §162①3호의 양도일·취득일을 수령·지출일로 본다 | 환율 칸 라벨·hint(대고객 매입률·매도율 함정), 일자별 입력 |
| §118의5① | 세율 = **§55① 기본세율**(국외자산 전용 §104 70%·단기 세율 호출 없음) | 미등기·단기 입력칸 불필요(UQ-9) |
| §118의6① | 세액공제(한도 = A×B/C) ↔ 필요경비 산입 **택일** | ⑤ 섹션 라디오(주식과 동일 상수) |
| §118의7① | 국외자산 양도소득금액에서 **연 250만원** 공제(미등기 조건 없음) | ⑦ 결과 «기본공제 §118의7»(주식 카드의 `§103①2호`와 다른 조문) |
| §118의8 | §89·§90·§92·**§95(단 장기보유특별공제는 공제하지 아니한다)**·§97③·§98·§100·§101·§105~107·§110~112·§114·§114의2·§115~118 준용 | 장특·거주기간 입력 불필요 |

> ⚠️ 엔진 파트가 같은 본문으로 §118의8 준용 범위(특히 §89 비과세 준용 여부)와 §114 확정신고 연결을 확정해야 한다. 이 문서는 **«국내 1세대1주택·조정지역·중과 입력은 국외 경로에 필요 없다»** 를 §118의5(세율 = §55①뿐)·§118의8 단서(장특 배제)로만 근거한다 — §89 준용 여부는 V-3.

---

## 2. 설계 결정 (D-n) — 사용자 결정은 §8의 UQ-n

| ID | 결정 | 근거 |
|---|---|---|
| D-1 | 구분은 **폼 전역 라디오 `assetLocation`**(`"domestic"\|"foreign"`) 하나. 자산 카드 안이 아니다 | 국외는 단일 자산·보유상황·감면 단계가 통째로 불필요 → 카드 단위 분기로는 단계 구조를 못 바꾼다(UQ-1) |
| D-2 | 국외 입력은 **새 폼 슬라이스**(후보 `ForeignRealEstateFormSlice`)로 `TransferFormData`에 평탄 필드를 더한다. `AssetForm`은 건드리지 않는다 | `calc-wizard-asset.ts`가 692줄(800줄 정책 근접) · 국내 `assets[0]`을 그대로 보존해 토글 왕복 시 국내 입력이 사라지지 않는다 |
| D-3 | 국외 분기 술어는 **단일 leaf** `isForeignRealEstateForm(form)`(신설 `lib/calc/transfer-foreign-scope.ts`)을 ⑤⑥⑧④·결과 분기가 공유한다 | 3중 패턴(mirror-pattern) · `isForeignCarryoverForm` 선례(`stock-foreign-carryover`) |
| D-4 | 토글을 끄거나 다시 켜도 **값은 지우지 않는다**. ④가 술어로 게이트해 숨은 값이 body에 새지 않게 한다. `useEffect → store` 없음 | `ForeignStockExpenseBlock.tsx:30-36` 규약 · 정책 1 |
| D-5 | 양도일·신고일·수정신고·가산세 폼 전역 필드는 **국내 것을 재사용**(`transferDate`·`filingDate`). 국외 취득일만 신설 | `handleFormChange`(`TransferTaxCalculator.tsx:184-205` 부근)의 신고일↔가산세 파생을 그대로 탄다 |
| D-6 | 입력 순서 = 엔진 계산 순서: 요건(§118의2) → 양도가액 → 취득가액 → 필요경비 → **외국납부세액**(필요경비 산입 택일이 필요경비와 직결 — 주식 Q-2와 동일) | 루트 CLAUDE.md 「UI 순서 = 계산 로직 순서」 |
| D-7 | 숫자 예시 placeholder 금지 — 형식 설명은 `FieldCard hint`. 라벨은 정본 클래스만(`text-[Npx]` 금지) | `components/calc/CLAUDE.md` |

---

## 3. 마법사 배치 (요구 1)

### 3.1 국외 토글 위치

`Step1.tsx`의 `<section>`(`:236`) 맨 앞 — **「판정 불러오기」 블록(`:247-281`)보다 위**에 `AssetLocationBlock`을 둔다.

```
┌ 자산 소재 ────────────────────────────────────────── rose ┐   (RadioCardGroup, layout inline, tone rose = 지역)
│ (●) 국내 부동산   ( ) 국외 부동산 (§118의2~§118의8)        │   미선택 옵션도 tone 배경 유지
│ hint: 국외 부동산은 5년 이상 국내 거주자의 국외 토지·건물·권리 양도입니다 │
└────────────────────────────────────────────────────────────┘
```

- 이유: «판정 불러오기»는 `assets`·`householdHousingCount`를 통째로 치환하는 **국내 전용** 동작이라(`Step1.tsx:238-246` 주석) 국외에서는 숨겨야 하고, 토글 A(함께 양도, `:284`)·자산 카드(`:383`)도 같은 이유로 숨긴다. 모드 토글은 영향받는 필드 **직전**이어야 한다.
- 국외 선택 시 `Step1`은 `AssetLocationBlock` + `<ForeignRealEstateStep1/>`만 반환한다(조기 반환 — `Step1.tsx:234` `return` 앞 분기). 국내 JSX는 **손대지 않고 분기 아래로 밀리기만** 한다(회귀 0 — anchor FRE-4).
- 다건 임베드(`embeddedInMulti` — `Step1.tsx:87`; 판정은 `TransferTaxCalculator.tsx:57` `pathname.includes("/multi")`)에서는 블록 자체를 **그리지 않는다**(§3.5).

### 3.2 단계 구성 (UQ-2)

| 단계 | 국내(현행) | 국외 P1 |
|---|---|---|
| 0 | 자산 목록 | **국외자산 입력**(5섹션 한 페이지 — 국내가 자산 카드 ①~④를 한 단계에 두는 것과 같은 규약) |
| 1 | 보유 상황 | (없음) |
| 2 | 감면·공제 | (없음) |
| 3 | 가산세 | (없음 — P3에서 추가, UQ-2) |

구현 지점(모두 `TransferTaxCalculator.tsx`):

- `:61` `const STEPS = isForeign ? STEPS_FOREIGN : STEPS_SINGLE` — `STEPS_FOREIGN = ["국외자산"]`, `STEP_TITLES_FOREIGN`을 `transfer-calculator-meta.ts`에 추가.
- `:376`·`:390`·`:524`의 `STEPS_SINGLE`을 `STEPS`로 바꾼다(위 §1.1 — 하나라도 빠지면 스테퍼와 사이드바가 국내 4단계를 보인다).
- `:354-369` `stepComponentsAll`: 국외면 `[<ForeignRealEstateStep1 …/>]` 한 개.
- `:548` `STEP_TITLES[currentStep]` → 선택한 배열.
- `:283` `handleSubmit`의 `callTransferTaxAPI(formData)`는 그대로(④ 안에서 분기 — §6.1). `:296` `backupSingleToMulti(formData)`는 **국외면 호출하지 않는다**(§3.5).
- 마지막 단계 판정 `:124`(`isLastStep`)·`:125`(`isResult`)는 `totalSteps`만 쓰므로 자동 정합.
- `TransferTaxCalculator.tsx`는 687줄 — 이 분기를 인라인으로 40줄 가까이 더하면 750을 넘는다. **분기 계산(단계 배열·타이틀·컴포넌트 선택)은 `transfer-foreign-wizard-meta.ts`(신설) 순수 함수로 빼** 인라인 증가를 ≤10줄로 묶는다.

### 3.3 국내 필드 숨김·비활성 매트릭스 (file:line 검증)

국외 경로는 국내 자산 카드·4단계 컴포넌트를 **아예 마운트하지 않는다**(조기 반환) — 따라서 아래는 «숨긴다» 가 아니라 «국외 화면에는 대응 칸이 없다 + 그 이유 + 국외에서 살아 있어야 하는 것»의 대조표다.

| 국내 입력 | 현행 위치(코드 읽기) | 국외 처리 | 근거 |
|---|---|---|---|
| 장기보유특별공제 입력(거주기간 `ResidencePeriodSection`) | `Step4.tsx:539` | 마운트 안 함 | §118의8 단서 — 장특 공제하지 아니함 |
| 1세대1주택 비과세 판정 ② | `Step4.tsx:442` | 마운트 안 함 | §89 준용 여부 V-3(엔진 확인 후 필요 시 후속 안내 카드) |
| 세대·주택 현황 ① · 다른 보유 주택 명부 | `Step4.tsx:317` · `SurchargeJudgmentSection` | 마운트 안 함 | 중과 판정은 §104⑦ — §118의5 불호출 |
| 조정대상지역 질문 | `AssetSectionBasic.tsx:385`(`DesignatedDistrictQuestion`) · `RegulatedAreaField` | 없음 | 위와 같다 |
| 소재지 `AddressSearch`(Vworld) | `AssetSectionBasic.tsx:300` | **국외는 자유 텍스트 소재지**(국내 주소 API가 국외를 모른다) | — |
| 미등기 양도(§104③ 70%) | `AssetSectionBasic.tsx:217`(컴패니언) · `SpecialSituationSection.tsx:58-67`(주 자산) | 입력칸 **없음 + 안내 카드 1장**(UQ-9) | §118의5①은 §55①만 — 교재도 «미등기여도 기본공제»(§118의7①, 조건 없음) |
| 공시지가·기준시가 조회 | `LandPriceLookupField` 사용처 `BurdenedGiftBlock` 등 · 3-시점 `ThreePointStandardPriceInput`(`components/calc/transfer/ThreePointStandardPriceInput.tsx`) · `Pre1990LandValuationInput` | 없음 | 환산취득가·기준시가는 국내 제도 — 국외는 실지거래가액(§118의3·§118의4①1호, 확인 불가 시 시가 UQ-11) |
| 비사업용 토지 토글·정밀 판정 | `components/calc/transfer/nbl/NblScreeningToggle.tsx:29` · `SpecialSituationSection.tsx:139` | 없음 | 비사업용 중과 §104의3은 §118의5 불호출 |
| 다주택 중과·한시배제 카드 | `Step4.tsx:648-668` · `:682-` | 없음 | 위와 같다 |
| 감면 `UnifiedReductionPanel` | `Step5.tsx:113` | 없음 | 조특법 감면은 국내 자산 전제 — 국외 감면 존재 여부는 엔진 확인(V-3) |
| 개산공제·감정가액·환산 | `CompanionAcqAmountSection.tsx:119`(`fixedAcquisitionPrice`) 등 | 없음 | 국외 필요경비는 실액만(P1) |
| 겸용·재개발·입주권·분양권 분기 | `AssetSectionBasic.tsx:44-60`(`ASSET_KIND_OPTIONS` 8종) | 국외 자산 종류는 **3종**(토지·건물·부동산에 관한 권리 — §118의2 1·2호)만 | 국내 8종은 국내 제도 전용 |
| 가산세 단계 | `Step6.tsx:22` · 계산은 `transfer-calc-actions.ts:121` `mode !== "single"` 조기 종료 | P1 없음(P3 후속) | §1.1 |
| 신고일·수정신고 | `AssetSectionBasic.tsx:122-142`(양도일·신고일 위젯, 첫 카드 안) · `AmendmentBlock` | **양도일·신고일은 국외 ① 섹션이 같은 폼 전역 필드를 렌더**(D-5) | 신고기한 §105 준용 |

**자산-수준 vs 폼-수준(요구 1 답)**: 국외는 **폼 전역**이다 — `assetLocation`과 국외 슬라이스 전부 `TransferFormData`(`lib/stores/calc-wizard-form.types.ts:40`). 이유는 D-2. 지분 공유(축 B)·함께 양도(토글 A)는 국외 P1 **범위 밖**(국외는 단일 자산, `assets.length>1` 상태가 남아 있어도 ④가 안 읽는다).

### 3.4 단건 vs 연간 합산(다건) (UQ-3)

- 다건 마법사는 `app/calc/transfer-tax/multi/MultiTransferSteps.tsx:171-206`이 `<TransferTaxCalculator />`를 **그대로 임베드**한다. 따라서 임베드 판정(`pathname.includes("/multi")`, `TransferTaxCalculator.tsx:57`)일 때 `AssetLocationBlock`을 그리지 않으면 다건에서 국외 진입 경로가 없다.
- 합산 공통 설정은 국내 전제다 — `multi-transfer-tax-store.ts:47-65`의 `annualBasicDeductionUsed`·`basicDeductionAllocation`은 **§103② 국내 기본공제** 배분이다. 국외는 §118의7①로 **별도 연 250만원**이라 같은 칸에 합칠 수 없다(엔진 파트가 국내+국외 동일연도 계산을 어떻게 다룰지 정해야 한다 — 엔진 확인 필요).
- 다건 쪽 방어: 다건 편입 자산 폼에 `assetLocation === "foreign"`이 실려 있으면 ⑧이 막는다(신설 `MULTI_FOREIGN_UNSUPPORTED_MESSAGE` → `lib/calc/multi-transfer-support-messages.ts:15-34` 군에 추가, 검사 위치는 `multi-transfer-tax-validate.ts:199`의 `MULTI_COMPANION_UNSUPPORTED_MESSAGE` 선례).
- 단건 결과의 「동일연도 다른 양도건」 버튼(`TransferTaxCalculator.tsx:462` `showMultiTransferButton`·`onContinueToMulti`)과 계산 직후 자동 백업(`:296` `backupSingleToMulti`)은 국외면 **끈다**.

### 3.5 이력(복원) 진입 경로

`transfer-resume-entry.ts:166-167`이 `reset()` 후 `updateFormData({...migrated,...})` — **reset이 `defaultFormData`로 되돌리므로** 국외 필드가 없는 옛 이력은 `assetLocation:"domestic"` 기본값을 얻는다(직전 세션의 국외 토글이 옛 이력에 새는 일 없음, 코드 읽기). 반대로 국외 이력은 저장된 슬라이스가 그대로 복원된다. 다건 복원은 `migrateMultiForm` 경로(`:140-` 근방)라 §3.4 방어가 필요하다.

---

## 4. 입력 설계 (요구 2)

### 4.1 화면 와이어 — `ForeignRealEstateStep1` (ToneCard 5장, `sectionNum` 부모 주입 · 카드 간 `space-y-3`)

```
┌ 1 납세의무·자산 (§118의2) ──────────────────────────────── rose ┐
│ 국내 거주 연수 [   ] 년        hint: 5년 이상 계속 국내에 주소·거소 (양도일까지)
│   (5년 미만이면 amber 경고 카드 — ForeignStockIdentityBlock.tsx:46-56 문구 준용, 비차단)
│ 자산 종류 (RadioCardGroup inline) ◉토지  ○건물  ○부동산에 관한 권리 (§118의2 1·2호)
│ 소재 국가 [select — COUNTRY_OPTIONS 재사용]   소재지 [자유 텍스트]   hint: 국가·도시·지번 등 식별 정보
│ 양도일 · 신고일  (폼 전역 transferDate·filingDate — 신고기한 경고는 Step1.tsx:228-232 leaf 재사용)
│ ToneCard(amber) 「국외자산은 미등기 여부가 세율·기본공제에 영향이 없습니다」(UQ-9)
├ 2 양도가액 — 원화 환산 (영 §178의5) ─────────────────────── emerald ┤
│ 통화 [CURRENCY_OPTIONS]  (단일 통화 — UQ-6)
│ 양도가액 (외화) [DecimalInput]   양도일(대금 수령일) 기준환율 [DecimalInput] KRW/통화
│   hint: 외국환거래법상 「기준환율」(재정환율) — 대고객 매입률·매도율이 아닙니다
│ 원화 환산(참고) 칩 — 엔진 leaf 값
├ 3 취득가액 — 원화 환산 ───────────────────────────────────── amber ┤
│ 취득일 [DateInput]   취득가액 (외화)   취득일 기준환율
├ 4 필요경비 (§118의4) ─────────────────────────────────────── slate ┤
│ 자본적지출  [행 목록: 지출일 · 외화금액 · 기준환율 · 원화환산]  + 행 추가   (없으면 비워두세요)
│ 양도비      [행 목록 — 같은 컴포넌트]                                 (없으면 비워두세요)
├ 5 외국납부세액 (§118의6) ─────────────────────────────────── violet ┤
│ ToggleCard 「외국납부세액 있음」 → 납부세액(외화)·납세일 기준환율·처리 방법(세액공제/필요경비 산입)
└─────────────────────────────────────────────────────────────────┘
```

섹션 톤은 `components/calc/CLAUDE.md` 색상 가이드를 따른다 — rose=지역·지정(§118의2 국내 거주·소재), emerald=양도시점, amber=취득, slate=필요경비(국내 카드 ④와 동일, `CompanionAssetCard.tsx:498-505`), violet=자격·택일(주식 외국납부세액 카드와 동일 `ForeignStockExpenseBlock.tsx:115-121`). 번호 배지는 3개 이상 연속 섹션이라 `ToneCard sectionNum`(규칙: 부모가 주입).

### 4.2 필드·위젯 표 (필드명은 후보 — 엔진과 맞출 것)

| 필드(후보) | 타입 | 위젯 | 필수 | 비고 |
|---|---|---|---|---|
| `assetLocation` | `"domestic"\|"foreign"` | `RadioCardGroup`(rose, inline) | — | 기본 `"domestic"` |
| `foreignYearsResidentInKorea` | string | `DecimalInput`(주식 `yearsResidentInKorea` 문구 재사용) | ✓ | 5년 미만 = 경고(비차단, 주식과 동일 — 엔진 확인 필요 V-2) |
| `foreignAssetKind` | `"land"\|"building"\|"right"` | `RadioCardGroup`(rose, inline) | ✓ | 기본 `"land"`(3중 패턴 §7) |
| `foreignCountryCode` | string | native `<select>`(주식과 동일 — `COUNTRY_OPTIONS` `foreign-stock-shared.tsx:23`) | ✓ | 통화와 무관 — 라벨에서 « (USD)» 접미 제거 필요(주식 옵션은 통화가 붙어 있다) |
| `foreignAddress` | string | `<input>` 텍스트(`FieldCard`) | ✓ | **이력 dedup 키**(§6.4) — 비면 키가 null |
| `transferDate`·`filingDate` | (재사용) | `DateInput` | ✓/선택 | 국내 폼 전역 필드 |
| `foreignCurrencyCode` | string | native `<select>`+`CURRENCY_OPTIONS` | ✓ | 기본 `"USD"` |
| `foreignTransferPrice` | string | `DecimalInput` | ✓ | 외화 총액 |
| `foreignTransferRate` | string | `DecimalInput` | ✓ | 양도일 기준환율 |
| `foreignAcquisitionDate` | string | `DateInput` | ✓ | 취득일 = 환율 기준일 |
| `foreignAcquisitionPrice`·`foreignAcquisitionRate` | string | `DecimalInput` | ✓ | |
| `foreignCapexRows` | `{date,amountForeign,rate}[]` | 행 목록(신설 leaf) | 행 있으면 3칸 모두 | 기본 `[]` |
| `foreignTransferCostRows` | 동상 | 동상 | 동상 | 기본 `[]` |
| `foreignTaxEnabled` | boolean | `ToggleCard`(violet) | — | 기본 false |
| `foreignTaxPaid`·`foreignTaxRate` | string | `DecimalInput` | ON이면 ✓ | 통화는 `foreignCurrencyCode`(UQ-6) |
| `foreignTaxMethod` | `"credit"\|"expense"` | `RadioCardGroup`(violet, stack, 주식 `FOREIGN_TAX_METHOD_OPTIONS`) | ON이면 ✓ | 기본 `"credit"` |

- **힌트 문구(숫자 예시 금지)**: 환율 칸 hint = 「외국환거래법에 따른 기준환율(기준환율이 없는 통화는 재정환율)입니다. 은행이 고객에게 사고파는 대고객 매입률·매도율이 아닙니다 — 영 §178의5①」. 외화 금액 hint = 「센트 단위까지 입력하세요」(**«예: 900,000» 같은 숫자 예시 금지**). 행 목록 빈 상태 hint = 「없으면 비워두세요」(`components/calc/CLAUDE.md` placeholder 정확성 — 귀속이 명확한 필드).
- **`FieldCard` 함정**: `trailing` 배지가 있으면 `unit`이 렌더되지 않는다(`ForeignStockExpenseBlock.tsx:66` 부근 주석) — 환율 칸은 단위를 hint에 쓴다.
- **라벨 정본 클래스**: 새 코드에 `text-[Npx]`·`text-[Nrem]` 금지(pre-push `check-font-sizes.sh`). 주식 블록에서 복제하는 `text-xs`·`text-sm` 클래스는 정본이라 그대로 쓴다.
- **새 native 금지**: `<input type="checkbox|radio|date">` 신규 없음. 통화·국가 `<select>`는 주식 블록이 쓰는 native select(`ForeignStockPriceBlock.tsx:42-`)를 그대로 따르는 기존 관행이며 금지 목록(checkbox·radio·date)에 없다.

### 4.3 일자별 외화 행 입력 — 공용 leaf `ForeignDatedAmountRows`(U0에서 신설)

`InstallmentReceiptsMatrix.tsx:28-110`의 행(수령일·수령액·기준환율·원화 환산)을 **지출 행**으로 일반화한 컴포넌트. props `{ rows, currencyCode, label, lawLabel, onChange }`, 행 추가/삭제는 `onChange` 직접(useEffect 없음 — 같은 파일 `:10-19` 정책 주석). 장기할부 수령 입력은 이 leaf의 다른 인스턴스로 후속(P4)에 쓴다.

- **빈 행 정책**: 부분 입력 행(날짜·금액·환율 중 일부만)은 ⑧이 막는다(자동 보정·기본 환율 대입 없음 — 정책 2).
- **「양도일 환율과 같음」 보조 버튼**(UQ-5 권고): `Button variant="modalLauncher"`가 아니라 일반 보조 버튼 — 클릭 핸들러가 그 행의 `rate`를 현재 `foreignTransferRate`로 **한 번 쓴다**(onClick 안 쓰기 — effect 미러링 아님). 이후 사용자가 고치면 그대로 둔다.

### 4.4 입력 원칙 점검표

- 모드 토글(자산 소재)은 영향 필드 직전(§3.1) ✓ · ToggleCard/RadioCardGroup만 사용, OFF도 tone 배경 ✓ · `CurrencyInput`(원 정수)는 **쓰지 않는다**(전부 외화·환율이라 `DecimalInput` — `components/calc/CLAUDE.md` 「소수점은 CurrencyInput 대체 불가」) · `DateInput` 외 날짜 입력 없음 ✓ · 포커스 전체 선택은 Provider 자동 ✓ · 단계 하단 네비는 공용 `WizardBackNav` ✓.
- 파일 크기: 신규 컴포넌트는 섹션별 5~6개 파일로 각 <200줄(`components/calc/transfer/foreign/`). `Step1.tsx`(459줄)는 분기 +~15줄.

---

## 5. ⑥ 사이드바 합계

- 국외면 `TransferTaxCalculator.tsx:403`의 `sidebarSummaryContent`를 `<ForeignSidebarSummary summary={…}/>`로 갈아 끼운다(국내 `TransferSidebarSummary`·`computeTransferPerAssetSummary`는 호출하지 않는다 — 그 함수는 `assets[0]` 기반이라 국외 폼에서 잘못된 «자산 1» 행을 낸다).
- 요약 계산은 신설 **순수 함수** `computeForeignRealEstateSummary(formData, result)`(`lib/stores/transfer-foreign-summary.ts`) + 호출부 `useMemo`(`TransferTaxCalculator.tsx:110-118`의 deps 규약 — 새 객체를 반환하는 selector를 hook에 직접 쓰지 않는다, `useSyncExternalStore` 무한 루프 방지).
- 표시 항목(입력으로 **계산 가능한 것만, 0원·null 제외**): 양도가액(원화 환산) · 취득가액(원화 환산) · 필요경비(자본적지출 + 양도비 환산 합). **결과 도착 후**에만: 양도차익 · 양도소득금액 · 기본공제(§118의7) · 과세표준 · 산출세액 · 외국납부세액공제 · 총 납부세액. 환산액은 **엔진 환산 leaf를 import**해 계산한다(인라인 `Math.floor` 복제 금지 — `single-source-engine-helper`; 주식 사이드바가 인라인 floor를 쓰는 `StockSidebar.tsx:189-192`은 따라 하지 않는다. 절사 시점 V-5).
- 값이 0원이거나 입력 전이면 라벨만 `-`(국내 `TransferSidebarSummary.tsx:22-34` 규약).

---

## 6. 14지점 중 ①②③④⑦ — 변경 목록(file:line)

### 6.1 ①②③ 폼·초기값·normalize

| # | 파일 | 변경 | 실측 |
|---|---|---|---|
| ① | `lib/stores/calc-wizard-form-foreign.ts`(신설) | `ForeignRealEstateFormSlice` 인터페이스 + `ForeignDatedAmountRow` | — |
| ① | `lib/stores/calc-wizard-form.types.ts:40` | `TransferFormData extends … ForeignRealEstateFormSlice`(또는 필드 직접 추가) | `TransferFormData` 선언 `:40`; 이 파일은 슬라이스 파일 분리 관행을 이미 쓴다(`AssetForm`이 슬라이스 15개 상속, `calc-wizard-asset.ts:73`) |
| ② | `lib/stores/calc-wizard-store.ts:60`(`defaultFormData`) | 슬라이스 기본값 스프레드 1줄(`...FOREIGN_RE_INITIAL`) | `createDefaultTransferFormData`(`:205`)도 `...defaultFormData`라 자동 포함 |
| ③ | `lib/stores/calc-wizard-store.ts:293-309`(`migratePersistedTransferForm`) | `:307-308`(gracePeriod 보정) 아래에 `formData = normalizeForeignRealEstate(formData)` 1줄 | `...defaultFormData, ...raw`(`:300-304`)가 **스칼라 신규 필드는 자동 기본값**을 주지만 배열 `…Rows`가 깨진 값(비배열)일 때는 못 거른다 → normalize 필수. 다건 자산 폼도 이 함수를 쓴다(`:288-292` 주석 — 같은 보정을 자동으로 받음) |
| ③ | `lib/stores/calc-wizard-migration.ts:53`(`migrateLegacyForm`) | **변경 없음** | 이 함수는 `assets` 배열이 없는 구 스키마 전용(`:297-299` 분기) — 국외 필드는 구 스키마에 존재한 적이 없다 |
| 영속 | `calc-wizard-store.ts:348-362` | 변경 없음 — persist 키 `transfer-tax-wizard`, `partialize`가 `formData`·`pendingMigration`만(`result` 제외 ✓), **`version` 옵션 없음** → 필드 추가는 normalize로 닫힌다 | 코드 읽기 |
| 이력 복원 | `lib/calc/transfer-resume-entry.ts:166-167` | 변경 없음(§3.5) | |

### 6.2 ④ 호출 지점·입력 계약 (엔진 파트가 구현, UI가 요구하는 것)

- 진입: `lib/calc/transfer-tax-api.ts:118`(`callTransferTaxAPI`) **맨 앞**에서 `isForeignRealEstateForm(formInput)`이면 신설 `buildForeignRealEstateApiBody`(`lib/calc/transfer-tax-api-foreign.ts`)로 위임 — 주식 `stock-transfer-tax-api.ts:67`의 `buildForeignStockApiBody` 분기와 같은 구조. `transfer-tax-api.ts`는 756줄이라 **분기 ≤8줄만** 더하고(→ ≈764) 본체는 새 파일.
- 반환 타입: `TransferAPIResult`(`:114`)에 `{ mode: "foreign"; result: ForeignRealEstateResult }` 추가(후보) — 이 유니온을 쓰는 분기(`TransferTaxCalculator.tsx:448·467`, `transfer-calc-actions.ts:121`)가 전부 영향받는다 → anchor로 전수 grep(§9 FRE-9).
- ⑬ body spread: 새 필드는 `callTransferTaxAPI`가 **fetch body에 싣는 객체**에 있어야 한다(⑬ — TypeScript 미감지). 엔진 파트의 route/Zod(⑨⑩⑫⑭)와 필드명을 1:1로 맞춘다.

**PR-4 확정 body 키 (엔진 계획 §4.2가 정본) — ④ 변환이 폼 필드를 이렇게 싣는다**

| 폼 필드(후보, §4.2) | body 키 |
|---|---|
| `foreignYearsResidentInKorea` | `domesticResidenceYears` (정수 — ⑧이 정수 검사) |
| `foreignAssetKind` | `assets[0].kind` (`"land"\|"building"` — `"right"`는 v1 body에 없다, ⑧ 차단) |
| `transferDate` / `foreignAcquisitionDate` | `assets[0].transferDate` / `.acquisitionDate` |
| `foreignCurrencyCode` + `foreignTransferPrice` + `foreignTransferRate` | `assets[0].transfer = { currency, amountForeign, exchangeRate, date: transferDate }` |
| `foreignAcquisitionPrice` + `foreignAcquisitionRate` | `assets[0].acquisition = { …, date: foreignAcquisitionDate }` |
| `foreignCapexRows[]` · `foreignTransferCostRows[]` (`{date, amountForeign, rate}`) | `assets[0].capitalExpenditures[]` · `.transferCosts[]` = `{ currency, amountForeign, exchangeRate: rate, date }` (**`rate` → `exchangeRate`**) |
| `foreignTaxEnabled` OFF | `foreignTax` 키 생략 |
| `foreignTaxEnabled` ON: `foreignTaxMethod` + `foreignTaxPaid` + `foreignTaxRate` + 납세일 | `foreignTax = { method, items: [{ assetId: assets[0].id, currency, amountForeign, exchangeRate, date: 납세일 }] }` — **납세일 칸이 폼에 필요하다**(주식 칸 구성에는 없음) |
| 자산 id | `assets[0].id` — 단건이면 고정 문자열(예: 카드 키) 하나 |
| (칸 없음) | `acquisitionCause`·`foreignBorrowAcquired`는 보내지 않는다(미입력 = 매매·차입 아님) |

응답은 `200 { data: ForeignRealEstateResult }`(`mode` 없음) — ④가 `{ mode: "foreign", result: json.data }`로 감싼다. 400 `error.fieldErrors` 키는 `assets.0.transfer.exchangeRate`처럼 점 표기 배열 인덱스.
카드·행 수 상한 상수 `FOREIGN_RE_MAX_ASSETS`(20)·`FOREIGN_RE_MAX_ROWS`(50)는 `lib/api/transfer-foreign-schema.ts` — ⑤⑧이 import한다(단일 소스).

### 6.3 ⑦ 결과 카드 — 산식 표기 (요구 3)

신설 `components/calc/results/ForeignRealEstateResultCard.tsx`(주식 `ForeignStockResultCard.tsx`의 `Row`·`fxFormula`·`Divider` 구조 재사용) + 호출은 `TransferTaxCalculator.tsx:448` 앞에 `result.mode === "foreign"` 분기 추가.

산식 표기 규약(`components/calc/CLAUDE.md`): 한국어 풀어쓰기, **숫자 옆 변수명 라벨**, 변수 약어·`floor()` 금지, 중간 산술 미표시, 숫자 끝 「원」 금지(주식 카드 규약), 금액 칸 `text-right font-mono tabular-nums whitespace-nowrap`(공용 `BesshiRow` 우선).

```
양도가액   외화 양도가액 USD 900,000 × 양도일 기준환율 1,100 = 990,000,000        (교재 환율표 기준환율 — V-1 해소)
취득가액   외화 취득가액 USD 400,000 × 취득일 기준환율 1,300 = 520,000,000
양도비     [행별] 지출일 · 외화 양도비 USD 30,000 × 지출일 기준환율 1,100 = 33,000,000
(필요경비 합) 취득가액 + 자본적지출 + 양도비
양도차익   양도가액 990,000,000 − 필요경비 553,000,000 = 437,000,000
장기보유특별공제   적용 배제(소득세법 §118의8 단서)  — 0 행을 만들지 않고 «배제» 1줄만
양도소득금액  437,000,000
기본공제 (§118의7①)  2,500,000
과세표준  434,500,000
세율 §55① → 산출세액 …
외국납부세액공제(§118의6①1호) 한도 = 산출세액 × 해당 국외자산 양도소득금액 ÷ 국외자산 양도소득금액  (단건 → 분자·분모 모두 숫자 노출)
```

- 위 수치는 **교재 환율표 실제 값**이다(사용자 제공 이미지, 2026-11-27 확인): 기준환율 취득일 1,300·양도일 1,100 / 대고객 매입률 1,250·1,050 / 매도율 1,350·1,150. 양도비 지출일은 교재에 없어 양도일로 본다(교재 정답 437,000,000과 일치). → 990,000,000 − 520,000,000 − 33,000,000 = 437,000,000. 매입률·매도율로 계산하면 정답과 달라지므로 E2E 음성 시료로도 쓴다.
- 환율 3종 함정의 화면 표현: 결과 카드에 사용한 환율의 이름을 **「기준환율」**로 고정 표기하고, 보조 줄 1개로 「대고객 매입률·매도율은 쓰지 않습니다(영 §178의5①)」. 입력 단계 hint(§4.2)와 같은 문구 상수를 공유.
- 분기 표시: 외국납부세액 «필요경비 산입» 선택 시 양도차익 산식에 「+ 외국납부세액(원화 환산)」 행이 필요경비에 들어간다 — 엔진 result가 항목별 echo를 줘야 한다(§9).
- 인쇄·PDF: 국내 `lib/print/transfer-print-sections.ts`의 `printScoped` 체계와 별개로, 국외는 신설 `lib/print/transfer-foreign-print-sections.ts`(섹션 id: 신고서식(후보)·계산 내역)와 `PrintSelectionPanel`/`PrintSection`을 같은 패턴으로 단다(`stock Step4.tsx:98·175-188`). 선택 기본은 **전체 미선택**(메모리 `feedback_print_media_needs_section_selection`). PDF(react-pdf `ResultPdfDocument` 채널)에 국외 섹션이 필요한지·신고서 서식 정본(별지 서식 번호)은 V-6.

### 6.4 이력(IndexedDB)·제목·dedup

- 저장 키(`lib/storage/business-key.ts:45-60`): `extractAddress(inputData)`가 `assets[0]`의 `addressRoad||addressJibun` → 없으면 `null` → **키 null = dedup 불가**. 국외는 `assets[0]` 주소를 쓰지 않으므로(D-2) `lib/storage/title-generator.ts:65-90`의 `extractAddress`에 «`foreignAddress`가 있으면 그것» 분기를 추가한다(소수 줄). 국외 소재지를 `⑧`이 필수로 막는 이유가 이것이다.
- `isTransferFormEmpty`(`components/calc/transfer-tax-save-handler.ts:20-28`): 국외도 `form.transferDate`가 채워지면 비어 있지 않다 — 양도일 없이 외화 금액만 넣은 상태는 «빈 폼»으로 읽혀 수동 저장이 막힐 수 있다. 판정에 국외 금액 필드를 포함(V-7).
- 복원: 이력 record의 `inputData`가 슬라이스를 그대로 담으므로 별도 변환 없음. 결과(`resultData`) 복원이 `mode:"foreign"`을 모르는 코드 경로가 없는지는 grep 필요(`lib/calc/history-resume-entry.ts` 등 — V-8).

---

## 7. ⑧ UI 쪽 validate 규칙 (3중 패턴) — `lib/calc/transfer-tax-validate-foreign.ts`(신설)

`transfer-tax-validate.ts:99`(`collectStepIssuesRaw`) **맨 앞**에서 `isForeignRealEstateForm(form)`이면 국외 검증만 수행하고 반환(국내 `step === 0` 검증 `:103-`이 `assets[0]`·`contractTotalPrice`를 요구하므로 국외 폼은 반드시 우회해야 한다 — 그렇지 않으면 UI는 통과인데 validate가 «총 양도가액을 입력하세요»로 차단하는 모순). `collectStepIssues`(`:89`)가 `withRedevCarryoverAcqMode`를 거치는 것도 국외 폼에 무해한지 확인(V-9).

| 필드 | 규칙 | UI·API 쪽 대응 |
|---|---|---|
| 거주 연수 | 필수·숫자. 5년 미만은 **경고만**(비차단) | UI 경고 카드 §4.1 |
| 자산 종류 | `foreignAssetKind \|\| "land"` | initial `"land"` · normalize `\|\| "land"` · ④ `\|\| "land"` · ⑧ `\|\| "land"` **전 층 동일 기본값** |
| 소재지 | 필수(이력 키) | ⑤ 필수 `*` 표시 |
| 양도일·취득일 | 필수 · 취득일 ≤ 양도일 · 양도일 하한은 **엔진 범위와 일치**(국내 `isTransferDateBeforeSupported`를 그대로 쓰지 말 것 — V-4) | |
| 외화 양도·취득 금액·환율 | 필수·>0. **환율 빈 칸을 다른 환율로 대체하지 않는다** | 국외 폼에는 «비우면 양도일 환율» 같은 표시 fallback이 없으므로 ④·⑧도 fallback 없음 |
| 자본적지출·양도비 행 | 부분 입력 행 차단 · 행 날짜 ≤ 양도일 · 빈 배열은 허용 | UQ-5 권고(행 환율 필수) 기준 — 주식식 «비우면 양도일 환율»을 택하면 **UI hint·④·⑧ 세 곳 모두 같은 대체**를 해야 한다 |
| 외국납부세액 | ON이면 금액·환율>0 · 방법 `\|\| "credit"` | initial `"credit"` · normalize · ④ · ⑧ 동일 |

- **정책 점검**: ① useEffect→store 미러링 없음(전부 onChange) · ② 자동 안분 fallback 없음(국외 면적·지분 안분 자체가 없다) · ③ API fallback이 생기는 필드는 위 «기본값» 2개(자산 종류·처리 방법)뿐이고 4곳 동일.
- 단계별 오류 → 입력칸 점프: 각 필드에 `data-field`(FieldCard `field` prop) 부여, `IssueField` 타입(`transfer-tax-validate-field.ts`)에 새 키 추가 필요 — **확인 필요**(그 파일은 읽지 않았다 — V-10).
- `collectWizardStepIssues`(`TransferTaxCalculator.tsx:242` 사용)가 `totalSteps=1`일 때 `passesAllSteps`(`:264-275`)를 한 번만 돈다 — 국외 검증은 step 0에 전부 모은다.

---

## 8. 결정·미검증 레지스터

### 8.1 UQ-n — 사용자 결정 필요 (권고 포함)

| ID | 질문 | 선택지 | **권고** |
|---|---|---|---|
| UQ-1 | 국외 구분 단위 | (a) 폼 전역 라디오 (b) 자산 카드 안 토글 (c) 홈 카드에 별도 계산기 | **(a)** — 단계 구조가 통째로 달라진다. (c)는 홈·이력 분기까지 늘어 P1에 과함 |
| UQ-2 | 국외 단계 구성 | (a) P1 1단계 → 가산세는 P3 (b) P1부터 2단계(가산세) (c) 주식식 3단계(식별·금액·경비) | **(a)** — 가산세는 `transfer-calc-actions.ts:121`이 `mode==="single"`만 받아 결과 타입 협의가 먼저다. (c)는 국내 자산 카드 «한 단계 통합» 규약(2026-04-25)과 어긋남 |
| UQ-3 | 연간 합산(다건)과의 관계 | (a) P1 차단(§3.4) (b) 국외 전용 합산 (c) 국내+국외 한 신고서 | **(a)** — 국내 §103②와 국외 §118의7①은 별도 250만원, 외국납부세액 한도 B/C는 국외 합산이 정의. 후속은 엔진 설계 후 |
| UQ-4 | 금액 입력 단위 | (a) 외화+환율만 (b) 원화 직접 입력 토글 추가 (c) 병행 | **(a)** — 환율 선택 오류가 교재의 핵심 함정이라 환산 과정을 숨기는 (b)는 오히려 위험. (b)는 요청 시 `RadioCardGroup` 모드 토글로 후속 |
| UQ-5 | 필요경비 환율 | (a) 행마다 지출일·환율 필수 + 「양도일 환율과 같음」 버튼 (b) 주식식 «비우면 양도일 환율» | **(a)** — 자본적지출은 지출일이 다른 것이 일반적이라 조용한 대체가 틀린 환율이 된다. 정책 2(자동 대체 fallback 금지)와 결이 같다 |
| UQ-6 | 통화 | (a) 한 건에 단일 통화 (b) 항목별 통화 | **(a)** — 한 소재국 거래 한 통화가 일반적, 입력 오류·⑧ 조합 폭발을 줄인다. 외국납부세액만 다른 통화라면 후속 |
| UQ-7 | 환율 자동 조회 | (a) P1 수동 입력 (b) 한국은행 등 자동조회 | **(a)** — 저장소에 환율 조회 인프라 흔적이 없다(grep 0). 자동조회는 출처·일자별 «기준환율/재정환율» 구분부터 확인 필요 |
| UQ-8 | §118의2 5년 요건 입력 | (a) 거주 연수 숫자(주식 동일) (b) 예/아니오 토글 | **(a)** — 주식 UI·⑧ 문구를 그대로 재사용 |
| UQ-9 | 미등기 | (a) 입력 없음 + 안내 카드 (b) 안내도 없음 | **(a)** — 교재가 «미등기여도 기본공제»를 함정으로 두었다. 사용자가 국내 입력 습관으로 칸을 찾는 상황을 한 줄로 해소 |
| UQ-10 | 외국납부세액 단건 포함 | (a) P1 포함(주식 구조 복제) (b) 후속 | **(a)** — 필요경비 산입 택일이 양도차익을 바꾸므로 입력 순서상 ④ 직후에 있어야 한다 |
| UQ-11 | 취득가액 확인 불가 시 시가·추계(§118의4①1호 단서) | (a) P1 실지거래가액만 + 안내 (b) 시가 입력 칸 | **(a)** — 영 위임 방법은 엔진 파트가 확정해야 한다(본 문서 범위 밖) |
| UQ-12 | 자산 종류 노출 | (a) 토지·건물·권리 3종 (b) 토지·건물 2종 | **(a)** — §118의2 1·2호 구분은 라벨일 뿐 계산이 같다면 입력 비용이 낮다(엔진 확인) |

### 8.2 V-n — 미검증(확인 필요)

| ID | 항목 | 방법 |
|---|---|---|
| ~~V-1~~ | ✅ 해소 2026-11-27 — 교재 이미지: 기준환율 1,300/1,100 · 매입률 1,250/1,050 · 매도율 1,350/1,150 (§6.3) | — |
| V-2 | 5년 미만일 때 계산 거동(주식은 세액 0·경고). 부동산도 같은지 | 엔진 계획서 §118의2 처리 |
| V-3 | §118의8 준용 중 §89(비과세)·감면 적용 여부 → 국내 ②·Step5 일부가 필요한지 | 엔진 시니어 + 영 §154·§155 «국내 소재» 요건 본문 확인 |
| V-4 | 국외 양도일 하한(국내 `isTransferDateBeforeSupported`는 국내 범위). §118의5 등 연혁(2019.12.31. 개정 삭제 항 다수) | 엔진 파트 + 연혁 게이트 |
| V-5 | 외화 환산 절사 시점(행별 vs 합계)·환율 소수 자릿수·`applyRate` 사용 | 엔진이 환산 leaf를 export, 사이드바·결과가 import |
| V-6 | 신고서 서식 정본(별지 서식 번호·국외자산 양도명세) + PDF 채널(`ResultPdfDocument`) 필요 여부 | KoreanLaw MCP 서식 조회 + 엔진 파트. 주식 카드는 별지 제84호 — 부동산에 그대로 쓸 수 있는지 **미확인** |
| V-7 | `isTransferFormEmpty`가 국외 입력만 있는 폼을 «빈 폼»으로 읽는지 | throwaway probe |
| V-8 | `resultData` 복원·이력 목록 카드가 `mode:"foreign"`을 모르고 깨지는 곳 | grep `mode === "single"` 전수(`lib/calc/history-*`, 이력 카드) |
| V-9 | `collectStepIssues`의 `withRedevCarryoverAcqMode`(`transfer-tax-validate.ts:89-97`)가 국외 폼에 무해한지 | probe |
| V-10 | `IssueField` 키 타입·`jumpToIssueField` 가 새 `data-field`를 모르면 점프가 «자산 카드 후퇴»만 한다 | `transfer-tax-validate-field.ts` 읽기 |
| V-11 | `RadioCardGroup` inline 라디오의 `description` 미렌더(메모리 «inline 라디오 description 미렌더») — 자산 종류 3종·소재 라디오 설명을 stack 레이아웃으로 둘지 | 컴포넌트 확인 |
| V-12 | 외국납부세액 «납세일 기준환율» 환산일의 법적 근거(주식 UI가 쓰는 규약을 따랐을 뿐) | 영 §178의5 외 조항·엔진 파트 |
| V-13 | 새 조문 인용(§118의2~8·영 §178의5) 상수·`verify:legal` manifest 등록 — UI는 `TRANSFER.*` 상수만 쓴다 | 엔진 파트 `legal-codes`·`additions-transfer.ts` |
| V-14 | 홈 화면·계산기 소개 문구(국외 지원 표기)·이력 목록 라벨 | `app/page.tsx` 등 읽기 |

---

## 9. E2E 시나리오 (교재 사례) — `e2e/foreign-realestate-textbook.spec.ts`(신설)

`e2e/CLAUDE.md` 준수: 날짜는 `fillDateAndVerify`(`_helpers/tax-flow.ts:59`) · 선택지 카드는 `getByRole("radio",{name:"…"})` **부분 매칭**(설명이 accessible name에 합쳐진다) · 라벨 입력은 주식 spec의 `fillByLabel` 패턴(`div:has(> label:has-text(...)) input[type=text]`)이나 FieldCard `data-field` · 결과 라벨 중복은 `data-testid`/`data-print-id`로 스코프 · 셀렉터는 throwaway probe로 실측 후 확정 · hydration 전 클릭 유실 방지(§6)에 따라 `data-testid` 가시성 대기 후 입력 · 외부 API 호출 없음(주소 검색 안 씀).

| # | 시나리오 | 기대 |
|---|---|---|
| E-1 | `/calc/transfer-tax`에서 «국외 부동산» 선택 | 판정 불러오기·함께 양도·자산 카드·조정지역 질문이 **DOM에 없다**(`toHaveCount(0)`), 스테퍼 1단계, 섹션 5장 표시 |
| E-2 | **교재 사례**: 거주 연수 입력 · 토지 · 국가·소재지 · 양도일 2026-07-10 · 취득일 2022-01-15 · 양도 USD 900,000 · 취득 USD 400,000 · 양도비 USD 30,000 · 기준환율 취득 1,300 · 양도 1,100 · 양도비 1,100 | 「세금 계산하기」 → 결과에 양도소득금액 **437,000,000**·과세표준 **434,500,000**, 「장기보유특별공제 적용 배제」 문구, 「기본공제 §118의7」 표기 |
| E-3 | 환율 3종 함정 | 환율 칸 hint에 «대고객 매입률·매도율이 아닙니다» 노출 + 결과 산식 라벨이 「기준환율」 |
| E-4 | 필요경비 행 부분 입력(금액만) → 계산 | ⑧ 차단 + 해당 행 칸으로 점프(V-10 해소 후) |
| E-5 | 5년 미만 거주 | 경고 카드 노출(비차단) |
| E-6 | 국내 회귀 쌍 | «국내» 선택 상태의 1단계가 기존 화면과 동일(FRE-4와 동일 목적) — 4단계 스테퍼 유지 |
| E-7 | 이력 저장·복원 | 계산 → 이력 저장(자동) → 이력에서 편집 열기 → 슬라이스·모드 복원 |
| E-8 | 다건 진입 | `/calc/transfer-tax/multi`에서 국외 선택 블록이 **없다** |
| E-9 | 인쇄 선택 | 전체 선택 후 `print:hidden` 판정(`foreign-track-print-selection.spec.ts` 방식) |

단위·anchor 후보(`__tests__/components/calc/transfer/`): FRE-1 국외 선택 시 국내 자산 카드 부재 · FRE-2 환율 hint 문구 상수 · FRE-3 단계 라벨이 국외 1개·국내 4개(`STEPS_SINGLE` 하드코딩 3곳 회귀 가드) · **FRE-4 국내 단계·검증 불변(양성 짝 — 게이트가 국내를 삼키지 않았는가)** · FRE-5 ⑧이 국외 폼에서 `contractTotalPrice`를 요구하지 않음 · FRE-6 normalize가 비배열 rows를 `[]`로 · FRE-7 기본값 4층 일치(자산 종류·처리 방법) · FRE-8 `mode:"foreign"`이 `transfer-calc-actions`에서 명시 처리 · FRE-9 `result.mode ===` 분기 전수.
mutation probe: 술어를 `!==`로 뒤집어 국내까지 삼킴 → FRE-4 실패 / `STEPS_SINGLE` 3곳 중 하나를 되돌림 → FRE-3 실패.

---

## 10. 엔진·API 파트에 요구하는 계약

1. **result 타입**(후보 `ForeignRealEstateResult`)에 echo: 통화·외화 양도가액·양도일 환율·원화 양도가액 / 외화 취득가액·취득일 환율·원화 취득가액 / 자본적지출·양도비 **행별**(지출일·외화·환율·원화) / 필요경비 합 / 양도차익 / 장특 «배제» 표지 / 양도소득금액 / 기본공제 / 과세표준 / 세율·산출세액 / 외국납부세액(원화)·방법·한도 산식의 A·B·C 숫자 / 지방소득세 / 총 납부세액 / 납세의무 없음(5년 미만) 표지.
2. **환산 leaf export**: UI(사이드바·입력 미리보기)가 import할 순수 함수(절사 규약 포함).
3. 필드명·기본값(자산 종류·처리 방법)·행 타입 확정 → §6.1과 1:1.
4. 가산세(P3)용으로 `determinedTax`·`penaltyDetail` echo(`transfer-calc-actions.ts:127·143`이 읽는 이름).
5. 법령 상수(`TRANSFER.*`)와 `verify:legal` manifest 등록(V-13).

## 11. UI PR 분할 (엔진 PR 뒤)

| PR | 내용 | 선행 | 비고 |
|---|---|---|---|
| **U0** | 주식 쪽 공용 leaf 추출(무동작 리팩터): `FOREIGN_TAX_METHOD_OPTIONS`·`COUNTRY_OPTIONS`·`fxFormula`·`ForeignDatedAmountRows`(← `InstallmentReceiptsMatrix` 일반화) | 없음(엔진 무관 — 엔진 PR과 병행 가능) | 기존 anchor(`foreign-stock-sme-toggle`·`foreign-wizard-step-layout` 계열)로 회귀 0 확인 |
| **U1** | ①②③ 슬라이스·초기·normalize + `assetLocation` 라디오 + 단계 라벨 동적화(3곳) + 국외 5섹션 입력 + ⑧ | 엔진 타입 PR(E1) | 계산 버튼은 아직 API 미연결 가능(⑧ 통과까지) |
| **U2** | ④ 호출 분기 + `mode:"foreign"` + ⑥ 사이드바 + ⑦ 결과 카드 + 인쇄 레지스트리 | 엔진 route/Zod PR(E2) | 브라우저로 Network body 확인 |
| **U3** | 이력(title·dedup·empty 판정) + 다건 차단 문구 + 홈/안내 문구 | U2 | V-7·V-8 해소 |
| **U4** | E2E(교재 사례) + 수동 확인 | U2 | `ui-engine-sync-checker`(14지점) |
| P3 후속 | 가산세 단계(`transfer-calc-actions` 국외 분기) · 장기할부 수령 행 · 원화 직접 입력 토글 · 연간 합산 | 사용자 결정(UQ-2·3·4) | |

---

## 12. 자가 점검 (이 문서 기준)

- [x] 14지점 중 UI 담당(①②③⑤⑥⑦·⑧의 UI 쪽) 전부 명세, ④⑨~⑭는 계약만
- [x] useEffect→store 미러링 없음(§2 D-4 · §7) · 자동 안분/환율 fallback 없음(UQ-5) · ⑧ 동기화 규칙(§7)
- [x] 공용 컴포넌트·톤·라벨 클래스·placeholder 규칙 준수(§4)
- [x] file:line은 이 트리에서 읽은 값 — 읽지 못한 것은 V-n
- [ ] 브라우저·테스트 미수행(계획 문서 — 코드 변경 0)

---

## 13. U1 확정 (2026-11-27 · 구현 PR `feat/foreign-re-ui-inputs`) — §3·§4·§6.1·§7을 이것이 덮는다

> 사용자 결정 C-1(처음부터 여러 건)·C-2(거주 연수 정수 1칸)·C-3(미등기 칸 없음)·Q-9(양도일 ≥ 2020-01-01)과 PR-4 API 계약(`engine.plan.md` §4.2)을 반영한 **실제 구현 결정**이다. 위 본문의 단건 전제(`foreignTransferPrice` 등 평탄 필드 · UQ-3 다건 차단 · 폼 전역 `transferDate`·`filingDate` 재사용)는 폐기됐다.

### 13.1 ①②③ 폼 슬라이스 — `lib/stores/calc-wizard-form-foreign.ts`

| 필드 | 타입 | 비고 |
|---|---|---|
| `assetLocation` | `"domestic"\|"foreign"` | 기본 `"domestic"` · 폼 전역 · 라디오 `AssetLocationBlock`(단건·다건 임베드 모두 노출) |
| `foreignResidenceYears` | string | C-2 — 폼 전역 정수 1칸. 빈 값 = 미입력(⑧ 차단 · 0년으로 읽지 않는다) |
| `foreignAssets` | `ForeignAssetForm[]` | C-1 — 1..`FOREIGN_RE_MAX_ASSETS`(20). 자산별 `transferDate`·통화·양도/취득 외화액·**항목별 기준환율**·`capitalRows`·`costRows`·`taxRows` |
| `foreignTaxEnabled` / `foreignTaxMethod` | boolean / `"credit"\|"expense"` | 신고 단위 택일(§118의6①). 기본 off · `credit` |

- **양도일은 자산별**이다(API가 `assets[].transferDate` · 기본공제 §118의7② 순서) — 폼 전역 `transferDate`·`filingDate`는 국외에서 읽지 않는다. 신고일·가산세·수정신고는 v1 범위 밖(후속).
- 기본값 3중 패턴: 종류 `land` · 처리 방법 `credit` — initial · normalize · ④ 빌더 · ⑧이 같은 상수(`FOREIGN_ASSET_KIND_DEFAULT`·`FOREIGN_TAX_METHOD_DEFAULT`). 환율·국가·소재지는 기본값 없음.
- `createDefaultTransferFormData`는 **결정적**이어야 한다(국외 카드 id를 매번 새로 만들면 `swapSellingHouse` 등 «초기값 대비 변경» 비교가 오고지 — U1 중 실측). 카드 id는 화면 키일 뿐이며 엔진에는 「국외자산 N」 라벨을 id로 보낸다.
- ③ `normalizeForeignRealEstate`는 `migratePersistedTransferForm`(sessionStorage·다건 자산 폼 공통 경로)에서 호출 — 비배열 rows·깨진 enum 보정, 카드 0건이면 빈 카드 1건. `migrateLegacyForm`은 변경 없음.

### 13.2 ⑤ 화면

`Step1Entry`(신설) = 「자산 소재」 라디오 + (`Step1` 그대로 | `ForeignRealEstateStep`). 국외면 판정 불러오기·함께 양도·자산 카드·조정지역을 **마운트하지 않는다**(값은 남는다 · D-4). 국외 1단계 = ① 납세의무(거주 연수 · 5년 미만 amber 경고 · C-2 5년 경계 «확인 필요» · 미등기 안내 sky) → ② 국외자산 카드 N장(각 ①자산 ②양도가액 ③취득가액 ④필요경비) → ③ 외국납부세액(신고 단위 토글·방법 라디오·자산별 납부 행). 자산 종류 3종은 UQ-12대로 노출하되 «권리»는 ⑧이 막는다(API enum에 없음). 통화는 목록 + 「기타」 3자리 직접 입력(⑨ `^[A-Z]{3}$`). 「양도일 환율과 같음」은 클릭 시 환율을 한 번 써 넣는 보조 버튼(fallback 아님). 단계 배열·제목은 `transfer-foreign-wizard-meta.ts`의 `foreignWizardMeta` 하나로 — `TransferTaxCalculator`는 `STEPS_SINGLE`을 직접 쓰지 않는다(가드 테스트).

### 13.3 ⑧ 구조 — `lib/calc/transfer-tax-validate-foreign.ts`

1. 빈 칸·화면 필수(서버가 모르는 «입력 안 함») 2. **서버 ⑩ refine을 그대로 실행**(`FOREIGN_RE_REFINES` × `buildForeignRealEstateBody` — ④와 같은 빌더) 3. ⑨ 기본 모양(종류·통화 형식·건수 상한)은 `FOREIGN_RE_MAX_*` 상수로 같은 규칙. 서버 오류 `path` → 입력칸 `data-field` 매핑(`foreignAsset.*` = 카드 안 · `foreignTaxRow.{자산}.{행}.*` = 카드 밖 납부 행). 같은 칸은 1건만. `collectStepIssuesRaw`가 국외 폼이면 국내 검증을 통째로 우회. 격자: `__tests__/calc/transfer-foreign-validate.parity.test.ts`(refine 완전성 가드 포함).

### 13.4 계산 연결 전 차단 (U2에서 걷었다 — §14)

~~국외 폼은 「세금 계산하기」에서 ⑧까지만 하고 `FOREIGN_CALC_PENDING_MESSAGE`를 보인다.~~ U2가 ④를 연결해 걷었다(§14). `callTransferTaxAPI`는 국외 폼이면 fetch 없이 던지는 가드를 **유지**한다(`FOREIGN_DOMESTIC_PATH_GUARD_MESSAGE`). 다건은 `validateMultiSupportedMode`가 국외 건을 계속 막는다(문구는 §14.5).

### 13.5 U2·U3로 넘기는 것 / 확인 필요

- 다건(`/multi`)에서 국외 건을 **어떻게 계산·합산하는가**는 미결 — 엔진 V-5(국내·국외 과세표준 합산 누진 여부, 예시 차이 30,630,000원)가 먼저다. 한 건이 국외 자산 N개를 품는 구조라 «국외 건 = 별도 국외 계산 1회»가 후보이나 확정 아님.
- 수동 저장(`isTransferFormEmpty`)·이력 제목·dedup 키(`foreignAssets[0].address`)는 U3(V-7·V-8).
- API `toOptionalDate`는 존재하지 않는 달력일(`2026-02-30`)을 3월 2일로 받는다(⑧도 같은 술어라 통과) — `DateInput`이 만들지 못한다고 가정한 상태, 확인 필요.

---

## 14. U2 확정 (2026-11-27 · 구현 PR `feat/foreign-re-ui-result`) — ④⑥⑦ + 인쇄 + 다건 차단 안내

> 사용자 결정(재제안 금지): **C-1** 국외 자산 여러 개는 한 건의 계산 안(`foreignAssets[]` ≤ 20) · **D-M** 다건(연간 합산) 마법사는 국외 건을 계속 막고 «국외 자산은 한 건 계산 안에서 여러 개를 추가하세요» 안내 · 지방소득세 국외 10원 미만 절사·전부 차손 = 세액 0은 엔진에서 확정.

### 14.1 ④⑬ 호출 — `lib/calc/transfer-foreign-call.ts`

- `callForeignRealEstateAPI(form)` = 순수 빌더(`buildForeignRealEstateBody`, ⑧이 서버 refine을 돌리는 것과 같은 함수) → `POST /api/calc/transfer/foreign` → `{ mode: "foreign", result }`로 감싼다(API 응답에 mode 없음). 래핑 타입은 `lib/calc/transfer-foreign-result.ts`(`ForeignTransferResult`)이고 `TransferAPIResult` 유니온에 1줄로 합류한다 — `transfer-tax-api.ts`는 그 줄 + import만 늘었다.
- `TransferTaxCalculator.handleSubmit`이 `isForeignRealEstateForm`으로 국외 호출/국내 호출을 가른다. 국내 `callTransferTaxAPI`의 국외 가드는 유지(빈 국내 자산이 조용히 계산되는 것을 막는다). 단건 자동 백업(`backupSingleToMulti`)은 국외에서 건너뛴다(다건이 국외 건을 막으므로).
- ⑬ 가드: `__tests__/calc/transfer-foreign-body-zod-keys.test.ts` — 모든 선택 칸을 채운 폼으로 빌더 body 키 ↔ Zod 스키마 키 **양방향**(strip 방지 · 스키마에만 있는 키는 차단용 literal 2개뿐) + Zod 파싱 후 값 불변. 뮤테이션(빌더에 키 추가 · 필드 비우기)으로 양쪽이 실제로 빨개짐을 확인했다.
- 오류: 400 `fieldErrors`(점 표기 `assets.0.transfer.exchangeRate` · `foreignTax.items.0.date` · `domesticResidenceYears`) → `foreignFieldErrorsToIssues`가 U1 `data-field` 앵커(`foreignAsset.transferRate` · `foreignTaxRow.{자산}.{행}.rate` · `foreignResidenceYears`)로 되돌린다(⑧의 `locate`를 공유 — `describeServerIssue`). 오류 패널에 항목으로 뜨고 첫 칸으로 바로 이동. `FOREIGN_LOSS_NETTING_UNRESOLVED`는 입력 결함이 아니라 미결 법리라 칸 이슈 없이 「확인 필요: …」 메시지로 보인다(⑧이 같은 refine으로 먼저 막으므로 정상 흐름에서는 서버까지 오지 않는다 — 직접 API 호출 방어).

### 14.2 ⑦ 결과 카드 — `components/calc/results/foreign-realestate/`

`ForeignRealEstateResultView`(출력 패널 + 카드 + 이동 버튼) → `ForeignRealEstateResultCard` → `ForeignAssetGainSection`(자산별) · `ForeignTaxCalcSection` · `ForeignResultNotices`.

| 구역 | 표시 |
|---|---|
| 요약 | 총 납부세액(결정세액 + 지방소득세) · 세율 적용 시점(가장 늦은 양도일) |
| 자산별 | 양도가액 · 취득가액 · 자본적지출 · 양도비 각 행 «외화 × 기준환율(일자) =» + 원화 / (필요경비 산입이면) 외국납부세액 행 / 양도차익 산식(0인 항 생략) / 장기보유특별공제 «적용 배제 — §118의8 단서» 1줄(0 행 없음) / 양도소득금액 / 2건 이상이면 기본공제 배분(§118의7②, 양도일 N번째)·몫의 과세표준 |
| 세액 | 양도소득금액 합 → 기본공제 §118의7① → 과세표준 → 산출세액(과세표준 × 세율 − 누진공제) → (세액공제) 자산별 외국납부세액 환산 행 · 공제한도(산출세액 × 해당 자산 양도소득금액 ÷ 합계) · 공제액(min) · **공제받지 못한 외국납부세액**(amber) / 결정세액 → 지방소득세 산출세액(§92① 세율 = 1/10) · §97③ 공제 · 10원 미만 절사 → 총 납부세액 |
| 납세의무 없음 | 거주 5년 미만: 세액 0 + amber 사유 카드(`NOT_LIABLE_REASON_TEXT`) · 세액 계산 섹션 없음 · 환산·양도차익은 참고로 표시 |
| 확인 필요 | `confirmationNeeded` 코드는 `CONFIRMATION_NOTICES`(`satisfies Record<코드, 문구>` — 엔진이 코드를 늘리면 컴파일이 멈춘다) · `warnings`는 엔진 문구 그대로 · 모르는 코드는 코드 그대로. 전부 amber 「확인 필요」 ToneCard. 적용 법령(`appliedRules`)은 칩으로. |

규약: 금액 칸 `font-mono tabular-nums whitespace-nowrap text-right`(`AmountRow`) · 법령 인용은 `TRANSFER_FOREIGN_RE` 상수만(코드에 «§» 리터럴 없음 — 소스 가드 테스트) · 접힘은 CSS-only `hidden print:block` + 토글 `print:hidden`(useEffect·isPrinting 없음).

### 14.3 ⑥ 사이드바 — `lib/stores/transfer-foreign-summary.ts` + `app/calc/transfer-tax/ForeignSidebarSummary.tsx`

순수 `computeForeignRealEstateSummary(form, result)` + 호출부 `useMemo`. 계산 전 = 자산별 양도가액·취득가액·필요경비(자본적지출 + 양도비)의 원화 환산 합(엔진 leaf `tryToKrw` — 인라인 floor 복제 없음, 환산 불가·미입력 칸은 0으로 두고 숨김). 계산 후 = 엔진 값(양도차익·양도소득금액·기본공제·과세표준·산출세액·외국납부세액공제·지방소득세·총 납부세액). 0·null은 줄을 만들지 않는다. 입력이 하나도 없으면 안내 1줄. 거주 5년 미만은 «납세의무 없음» 1줄. 입력을 고치면 `clearResult`로 결과가 사라져 계산 전 모드로 돌아간다.

### 14.4 인쇄 — `lib/print/transfer-foreign-print-sections.ts`

leaf 4개(`summary` · `asset-gain` · `tax-calc` · `notices`), **pdf 채널 0종**(`ResultPdfDocument`에 국외 부동산 섹션이 없다 — 거짓 선택 방지). `PrintSelectionPanel` + `PrintSection`을 국내와 같은 패턴으로 달고 선택 기본은 «전체 미선택». 거주 5년 미만이면 `tax-calc`는 가용 목록에서 빠진다. Playwright print 미디어로 «접힌 자산 본문이 인쇄에서 자동 펼침 · 패널 숨김 · 미선택 leaf 숨김» 확인.

### 14.5 다건 차단 안내 (D-M)

`MULTI_FOREIGN_UNSUPPORTED_MESSAGE` = 「국외 자산은 한 건 계산 안에서 여러 개를 추가하세요. 연간 합산(다건) 계산에는 국외 건을 넣을 수 없으니, 이 건은 단건 계산기에서 계산하세요.」 — `validateMultiSupportedMode`(합산 계산 검증) · 건 목록의 국외 건 옆 · 건 편집 화면에서 「국외 부동산」을 고르는 자리(`AssetLocationBlock embeddedInMulti`) 세 곳이 한 문구를 쓴다.

### 14.6 결과 모드 경로·이력 (U3로 넘긴 것)

- `TransferAPIResult`에 `mode: "foreign"`이 들어와도 `calc-wizard-store`·`transfer-per-asset-summary`·`classifyAmendableTransfer`·`classifyLoadableTransfer`·`extractGiftResaleDeterminedTax`·`extractRealEstateSide`·이력 목록 `extractTotalTax`는 터지지 않고 «해당 없음»으로 떨어진다(`__tests__/components/foreign-realestate-result-mode-paths.test.tsx`). 이력 목록 납부세액은 국외 `result.totalTax`를 읽는다.
- **이력 저장은 U3까지 보류한다 (→ §15에서 걷었다)**: 자동 저장 `resultData`를 국외면 `null`로 넘기고(저장 안 함) 수동 「저장하기」는 `FOREIGN_HISTORY_SAVE_DEFERRED_MESSAGE` 토스트만 보인다. 이유 — 이력 제목(`generateTitle`은 `assets[0]` 국내 주소)·dedup 키(`extractBusinessKey` 주소 null)·상세 드로어·PDF(`TransferSection`)·복원(`resumeTransferRecord`)이 국외를 모른다. U3이 이 경로들을 국외에 맞춘 뒤 보류를 걷는다(V-7·V-8).

### 14.7 확인 필요 (U2 시점)

- (§15.3에서 해소) 엔진 `warnings`의 지방소득세 문구와 `LOCAL_TAX_WEIGHTING_NOT_EVALUATED` 코드 문구가 같은 취지라 «확인 필요» 카드가 2장 겹친다 — 「하나도 버리지 않는다」를 우선했다. 엔진이 둘 중 하나로 합치면 카드도 따라 한 장이 된다.
- PDF(서버·클라이언트) 국외 부동산 섹션·별지 서식은 없다(V-6) — 출력은 브라우저 인쇄(PDF 저장)뿐.

---

## 15. U3 확정 (2026-11-27 · 구현 PR `feat/foreign-re-history`) — 이력 저장·제목·dedup·재계산 + 확인 필요 중복 제거

> §14.6의 «이력 저장은 U3까지 보류»를 걷었다. V-7·V-8 해소.

### 15.1 저장 — 자동·수동 모두

- 자동 저장(`useAutoSaveCalculation`)은 `resultData`를 `{ mode: "foreign", result }` 그대로 넘긴다(U2의 `null` 보류 제거). 수동 「저장하기」 보류 토스트(`FOREIGN_HISTORY_SAVE_DEFERRED_MESSAGE`)와 상수 삭제.
- 제목·dedup 키·빈 폼 판정·세율 기준일은 **`lib/storage/foreign-history.ts` 한 곳**(`extractForeignRepresentative` · `foreignPlace` · `hasForeignInput` · `foreignTaxLawVersion`). 국외 폼은 국내 `assets[0]`·폼 전역 `transferDate`를 읽지 않는다 — 숨은 국내 입력(D-4)이 제목·키에 새지 않게 `extractAddress`·`extractTransferDate`(다른 세목 공용)는 건드리지 않고 `generateTitle`·`extractBusinessKey`의 `transfer` 분기 맨 앞에서 갈랐다.
- **제목** `양도소득세 (국외 부동산) — {국가} {소재지}[ 외 N건] (양도 YYYY.MM.DD)` — 국가 「기타」·미선택은 생략, 소재지가 비면 국가만, 다 비면 양도일만. 대표 = 첫 국외 자산(자산을 뒤에 추가해도 같은 record를 갱신).
- **dedup 키** `addr:{국가} {소재지}|{대표 양도일}|foreign` — 소재지가 비면 키 없음(content 폴백). `|foreign` 접미로 같은 문자열의 국내 키와 분리. ⑧이 소재지를 필수로 막는 이유(§7)가 이것이다.
- **빈 폼** — 국외는 거주 연수·국가·소재지·양도일·금액 칸·자본적지출/양도비/납부 행 중 하나라도 있으면 비어 있지 않다(통화·종류 기본값은 입력 아님). 숨은 국내 입력은 보지 않는다.
- **세율 기준일**(`taxLawVersion`) — 국외는 자산별 양도일 중 가장 늦은 날(결과 `appliedLawDate`와 같다). 자동·수동 저장이 `transferTaxLawVersion` 하나를 쓴다.

### 15.2 목록·드로어·재계산

- 목록 카드: 주소 자리에 국가+소재지, 날짜는 대표 양도일. 납부세액은 `result.totalTax`(K-1 162,646,000) — U2에서 이미 읽는다.
- 드로어 «계산 결과 요약»: 국외 필드명(양도차익 합계·양도소득금액 합계·기본공제·과세표준·산출세액·외국납부세액공제·결정세액·지방소득세·납부세액, 0원 항목 생략 · 거주 5년 미만은 «납세의무 없음» 1줄) — `lib/calc/transfer-foreign-history.ts`. 수정신고·경정청구·다건 합산 진입은 국외에 열리지 않는다(U2 `classify*` null).
- 「이 조건으로 재계산」: 국외 슬라이스(라디오·거주 연수·자산 행·외국납부세액)를 복원한다. **결과는 되살리지 않고 첫 단계에서 연다** — 국내·비사업용 토지 판정과 같은 규칙(재계산은 입력을 되살려 다시 계산). 저장된 행은 `normalizeForeignRealEstate`(③)를 거친다(국내 이력에는 적용하지 않는다 — 기본 카드 id가 바뀌어 «초기값 대비 변경» 비교가 오고지).
- PDF: 서버·클라이언트 PDF 채널에 국외 섹션은 없다(§14.4). `HistoryPdfDocument`는 호출처가 없다(죽은 코드 — 건드리지 않음). 이력 화면에서 PDF를 만드는 경로는 없어 국외 record가 PDF 경로에 닿지 않는다.

### 15.3 확인 필요 «이중 카드» 해소

엔진이 지방소득세 가중 미평가를 `warnings` 문구와 `confirmationNeeded: LOCAL_TAX_WEIGHTING_NOT_EVALUATED`로 **이중 발행**해 «확인 필요» 카드가 두 장 겹쳤다(§14.7). 엔진에서 문구를 지우고 코드만 남겼다(UI 코드 표 `CONFIRMATION_NOTICES`가 단일 문구). 코드↔문구 쌍은 이것 하나였다 — `FOREIGN_TAX_CREDIT_FX_DATE_NOT_STATUTORY`는 문구가 없고, 한도 초과 `warnings`(이월 규정 없음)는 코드가 없는 별개 취지다. 가드: `__tests__/tax-engine/foreign-realestate/notice-dedupe.test.ts`(코드 표가 `satisfies Record<코드, RegExp>`라 새 코드는 주제어를 정해야 한다).

### 15.4 안내 문구·홈

C-2 한계(`RESIDENCE_BOUNDARY_NOTICE`)·C-3 미등기(`UNREGISTERED_NOTICE`)는 U1에서 이미 입력 화면에 있음을 확인했다. 홈 메뉴 부제는 바꾸지 않았다 — 홈 레이아웃 테스트가 부제 한 줄(CI 글꼴)에 묶여 있고 V-14는 «읽기» 항목이다(국외 표기 요구 근거 없음). **확인 필요**: 홈에 «국외» 표기를 원하면 부제 폭 실측 후 별도 PR.


## 16. U5 확정 (2026-11-27 · 구현 PR `fix/foreign-re-notices`) — 14지점 점검 후속

- **M1 미지원 고지**: 엔진 계획이 «차단+고지»·«고지»로 정한 항목(상속·증여 취득 Q-6 · 외화차입 환차익 V-14 · 국내 양도소득 합산 안 함 Q-8/V-5 · 국외 주택 비과세 불가 V-4 · 장기할부 Q-13 · 시가 모드 Q-5)을 입력 1단계 맨 위 amber 카드(`ForeignUnsupportedNotice`)와 결과 «확인 필요»로 알린다. 문구 단일 소스 = `lib/calc/transfer-foreign-messages.ts`(`FOREIGN_DOMESTIC_NOT_AGGREGATED_TEXT` · `FOREIGN_UNSUPPORTED_ITEMS`). 엔진 코드 2종 — `DOMESTIC_TRANSFER_NOT_AGGREGATED`(국내 합산 안 함 — 납세의무 있는 모든 결과) · `UNSUPPORTED_SITUATIONS_NOT_EVALUATED`(범위 밖 상황 5종을 한 코드로). 납세의무 없음(`not_liable`)은 세액 0이라 코드를 싣지 않는다. 세액 숫자 불변.
- **L2**: 납세의무 없음 결과의 자산별 «양도소득금액»은 «(참고)» 라벨 + «세액에 반영하지 않는 참고 값» 줄(엔진 행 값은 그대로, 합계·세액 0).
- **L3**: 입력 화면(`components/calc/transfer/foreign/*`)·⑧ 문구에서 «§» 리터럴 제거 — `TRANSFER_FOREIGN_RE`·`TRANSFER` 상수. 결과 카드 소스 가드를 입력 쪽까지 넓혔다.
- **L4**: 외국납부세액 행의 «양도일 환율과 같음» 제거(납부일 기준 환율) — 양도비·자본적지출 행은 유지. **L7**: 통화 «기타» 코드 입력 placeholder 제거 → 통화 칸 hint로 이동.

- **V-5 해소 반영(2026-11-27 사용자 승인)**: 국내자산과 국외자산은 양도소득과세표준·산출세액을 **각각 구분하여 산정**(국세청 서면인터넷방문상담4팀-962 2005.6.16.·서면4팀-22 2005.1.4. · 국심2005서3759 2006.7.5. 기각 — §118의8 미준용 §102 배제, 처분 유지). 현행 §118의8 준용 목록에도 §102·§104 없음. → 엔진 코드 `DOMESTIC_TRANSFER_NOT_AGGREGATED` 삭제, 문구는 `FOREIGN_DOMESTIC_SEPARATE_TEXT`로 바꿔 «확인 필요»(amber)가 아닌 일반 안내(sky)로 입력 1단계(`foreign-domestic-separate-input`)와 납세의무 있는 결과(`foreign-domestic-separate`)에 보인다. 위 M1 줄의 `DOMESTIC_TRANSFER_NOT_AGGREGATED`·`FOREIGN_DOMESTIC_NOT_AGGREGATED_TEXT` 서술은 이 줄로 대체한다. 세액 불변.
