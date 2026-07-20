# 겸용주택 상속 취득가액 엔진 정합 — 수정 계획서

- **작성일**: 2026-07-20
- **세목**: 양도소득세 (겸용주택 분리계산 × 상속 취득)
- **수정 방향(확정)**: **B — 엔진 정합** (사용자 결정 2026-07-20). 겸용 엔진에 상속개시일 평가액을 실제 취득가액으로 쓰는 경로 신설. 현행 "환산" 대체, 미공시만 §164 환산 fallback.
- **관련 계획**: [[inherited-acquisition-ui-unification.plan.md]](일반 자산 상속 취득 UI 통합 PR#701) · [[transfer-mixed-use-same-household-inheritance-table2-gap.plan.md]](§154⑧3호 표2 통산 PR#704) · [[transfer-tax-mixed-use-house.engine.design.md]](겸용 원설계)

> ⚠️ **본 문서의 모든 file:line·수치는 실측**(2026-07-20). 법령 조문 중 "확인 필요" 표기 항목은 Design 단계에서 KoreanLaw MCP로 위임 체인 검증 후 단정한다(memory `feedback_korean_law_citation_verify`).

---

## 1. 배경 — 확증된 문제 (실측 근거)

겸용주택(주택 + 상가)을 **상속**으로 취득해 양도하는 경우, 현재 화면(이미지9)은 "취득정보 — 상속·실지거래" 아래에 **자산 구분(토지/개별주택/공동주택)** + **취득가액 의제 특례(소령 §176조의2④·§163⑨)**를 입력받는다. 그러나:

### 1-1. 겸용주택은 완전히 별도 엔진 경로를 탄다
- `app/api/calc/transfer/route.ts:676` — `data.propertyType === "mixed-use-house"`면 `calcMixedUseTransferTax`(별도 엔진)만 호출.
- 일반 상속 취득가액 경로(`inheritedAcquisition`, `route.ts:290` → `buildInheritedAcquisition`)는 **비-겸용 입력에서만** 소비. 겸용 분기는 `data.mixedUse` 페이로드만 사용.

### 1-2. 겸용 엔진은 취득가액을 "환산"으로만 계산 (실지거래 취득가액 필드 부재)
- `MixedUseAssetInput`(`types/transfer-mixed-use.types.ts:44`)에는 `acquisitionPrice`·`fixedAcquisitionPrice` 류 필드가 **없다**. 취득가액은 전부 파생(환산):
  - 주택분: `calcHousingEstimatedAcq`(`transfer-tax-mixed-use-helpers.ts:285`) = `calculateEstimatedAcquisitionPrice(주택양도가액, 취득시 개별주택가격, 양도시 개별주택가격)`.
  - 상가분: `calcCommercialGainSplit`(`:550`) = `calculateEstimatedAcquisitionPrice(상가양도가액, acqTotalStd, transferTotalStdConv)`.
- 결과 타입도 전부 `estimatedAcquisitionPrice`(환산취득가액) 라벨(`types:204·252`).

### 1-3. 이미지의 상속 취득 입력은 겸용 경로에서 **dead**(엔진 미도달)
- `buildMixedUsePayload`(`lib/calc/transfer-tax-api-mixed-use.ts:20`)는 상속 필드(`inheritanceAssetKind`·`publishedValueAtInheritance`·의제 pre/post·보충적평가 보조계산)를 **하나도 읽지 않는다**. 소비하는 상속 관련 필드는 오직 `decedentSameHouseholdBeforeInheritance`·`decedentCohabitationResidenceMonths`(§154⑧3호 표2 통산, `:157-159`)뿐.
- 그런데 `CompanionAcqInheritanceBlock`은 `acquisitionCause === "inheritance"`면 **`isMixedUseHouse` 게이팅 없이 무조건 렌더**(`CompanionAcquisitionCauseSection.tsx:215`). → 사용자는 "자산 구분"·"취득가액 의제 특례"를 입력하지만 겸용 계산에 반영되지 않는다(misleading dead UI).

### 1-4. 법령 정밀성 결함 (핵심)
- 상속 취득 자산의 취득가액 = **상속개시일 현재 상증법 §60~66 평가액**을 취득 당시 실지거래가액으로 의제(소령 §163⑨). 일반 엔진은 이 값으로 `acquisitionPrice`를 override(`inheritance-acquisition-price.ts:141` `calcPostDeemed`).
- 겸용 엔진은 이를 무시하고 **환산**을 쓴다. 환산취득가 = 양도가액 × (취득시 기준시가 ÷ 양도시 기준시가)는 양도가액에 비례해 **상속개시일 평가액보다 통상 크다** → 양도차익 과소 → **세액 과소**(법령 위반, 납세자 유리 방향). [[feedback_no_unfavorable_application_without_legal_basis]]의 역방향(무근거 유리)이므로 시정 대상.
- 추가: 환산 모드는 **개산공제(§163⑥ 취득시 기준시가 × 3%)**를 적용(`types:220·228`)하나, 상속은 실지거래가액 의제라 **개산공제 미적용**(실제 필요경비 공제 — `inheritance-acquisition-price.ts:143` 주석 "실지거래가액 의제 → 개산공제 없음").

---

## 2. 핵심 설계 통찰 — 엔진은 이미 필요한 값을 갖고 있다

**겸용 엔진의 `acquisitionStandardPrice`(취득시 기준시가)는, 상속의 경우 곧 상속개시일 보충적평가액 그 자체다.**

| 부분 | 상속개시일 평가액(§60~66 보충적평가) | 엔진이 이미 수집 중인 값 |
|---|---|---|
| 주택분 | 상속개시일 개별주택가격(건물+부수토지 일괄, §61) | `acquisitionStandardPrice.housingPrice` |
| 상가분 건물 | 상속개시일 상가건물 국세청 기준시가 | `acquisitionStandardPrice.commercialBuildingPrice` |
| 상가분 토지 | 상속개시일 개별공시지가 × 상가부수토지면적 | `acquisitionStandardPrice.landPricePerSqm × commercialLandArea` (`helpers.ts:558`의 `acqTotalStd`) |

**즉 수정의 본질은 "새 값 수집"이 아니라, 이미 수집한 값을 환산(양도가액 스케일)에 태우지 않고 취득가액으로 직접 쓰는 분기 추가**다. 미공시(§164) 케이스도 PHD 경로가 이미 `phdResult.estimatedHousingPriceAtAcquisition`(역산된 상속개시일 개별주택가격)을 산출하므로(`helpers.ts:244`), 상속이면 그 값을 **직접** 취득가액으로 쓰면 된다(현행은 스케일된 `totalEstimatedAcquisitionPrice` 사용).

---

## 3. 법령 근거

| 조문 | 내용 | 검증 상태 |
|---|---|---|
| 소령 §163⑨ | 상속·증여 자산 취득가액 = 상속개시일 현재 상증법 §60~66 평가액(실지거래가액 의제) | ✅ 일반 엔진 구현·주석 확증. Design서 원문 재확인 |
| 소령 §160①단서 | 2022.1.1 이후 겸용주택 강제 분리(주택/상가/비사업용토지) | ✅ 엔진 상수 `MIXED_USE_EFFECTIVE_DATE` |
| 상증법 §60·§61 | 시가 우선·부동산 보충적평가(개별주택가격·개별공시지가·국세청 건물기준시가) | ✅ 일반 엔진 참조 |
| 소령 §164② / §164⑤(PHD) | 취득 당시 개별주택가격 미공시 → 3-시점 환산으로 상속개시일 주택가격 추정 | ⚠️ **확인 필요** — §164② vs §164⑤ 적용 조문·시점, "미공시 상속주택" 취득가액 산정 근거를 Design서 확정 |
| 소령 §163⑨2호 / §164⑦ | 미공시 상속주택: max(상증법 평가액, §164⑦ 취득당시 기준시가) | ⚠️ **확인 필요** — 겸용 주택분에 동일 적용 여부(`calcPostDeemed` houseValuationStdPrice 분기 재사용 가능성) |
| 소득세법 §97②2호 단서 | 환산취득가 모드 필요경비 swap — 상속(실가) 모드는 **대상 아님** | ✅ 실가 취득이므로 swap 미적용 |

> **법령 쟁점(Design 확정 대상)**: 상속세 신고가액이 **시가(매매사례·감정)**인 경우 취득가액 = 그 시가(§60①). 보충적평가(기준시가)로 신고한 경우 취득가액 = 기준시가. 겸용 부분별로 신고가액이 시가/보충적으로 갈릴 수 있으므로 **부분별 상속개시일 평가액 입력**을 허용할지, 기준시가 보충적평가만 지원할지 결정 필요(§7 열린 질문).

---

## 4. 엔진 변경 설계

### 4-1. 입력 타입 확장 (`MixedUseAssetInput`)

```ts
// types/transfer-mixed-use.types.ts — MixedUseAssetInput에 추가
/** 상속 취득 여부 — true면 취득가액을 환산이 아닌 상속개시일 평가액(직접)으로 산정. §163⑨ */
acquisitionByInheritance?: boolean;

/** 상속개시일 주택분 평가액(원). 미제공 시 취득시 개별주택가격(보충적평가) 자동 사용.
 *  시가·감정·매매사례로 상속세 신고한 경우 그 신고가액. */
housingInheritedValue?: number;

/** 상속개시일 상가분 평가액(원). 미제공 시 (취득시 상가건물 기준시가 + 개별공시지가 × 상가부수토지면적) 자동. */
commercialInheritedValue?: number;

/** 상속(실가) 모드 실제 필요경비 — 자본적지출·양도비(원). 개산공제 대체. 미제공 0. */
inheritedNecessaryExpense?: number;
```

> **단일 소스 재사용 우선**([[single-source-engine-helper]] 스킬): 부분별 취득가액 산정은 가능한 한 일반 엔진 `calculateInheritanceAcquisitionPrice`(부분별 2회 호출) 또는 `calcPostDeemed`/`computeSupplementary` 재사용. 상가분 보충적평가(건물+토지)는 `computeSupplementary`가 land/house 단일만 지원하므로 소폭 확장 또는 인라인 산정.

### 4-2. 주입 지점 (분기 추가 — 기존 환산 경로 불변)

| 함수 | 위치 | 상속 분기 |
|---|---|---|
| `calcHousingEstimatedAcq` | `helpers.ts:285`(§97 환산) · `:239`(PHD) | `acquisitionByInheritance` 시 `estimatedAcq` = **주택 상속개시일 평가액 직접**. 공시=`housingInheritedValue ?? acquisitionStandardPrice.housingPrice`. 미공시(PHD)=`housingInheritedValue ?? phdResult.estimatedHousingPriceAtAcquisition`(스케일 안 함) |
| `calcCommercialGainSplit` | `helpers.ts:550` | `acquisitionByInheritance` 시 `estimatedAcqPrice` = **`commercialInheritedValue ?? acqTotalStd` 직접**(환산 미적용) |
| `calcHousingGainSplit` | `helpers.ts:315` | 취득가액을 취득시 토지/건물 기준시가 비율로 재안분하는 로직은 유지(직접 취득가액을 안분). **개산공제 항 0 처리**(실지거래가액 의제) |
| `buildHousingPart`/`buildCommercialPart` | `helpers.ts:669·765` | `landAppraisalDed`/`buildingAppraisalDed` = 0, 대신 `inheritedNecessaryExpense` 반영. 필요경비 산식 라벨 분기 |

> **개산공제 제거 주의**: 현행 환산 경로는 취득시 기준시가 × 3% 개산공제를 필요경비로 차감. 상속(실가) 모드는 이를 제거하고 실제 필요경비만 차감. 미적용 시 양도차익 과대(반대 방향 오류) — anchor로 검증(§6).

### 4-3. 결과 타입·표시

- `MixedUseHousingPart`/`MixedUseCommercialPart`에 취득가액 산정 방식 메타 추가(선택): `acqPriceSource: "estimated" | "inheritance_valuation"`.
- `MixedUseCalculationRoute.acquisitionConversionRoute`에 `"inheritance_direct"` 케이스 추가 → 결과 카드에 "상속개시일 평가액(상증법 §60~66)을 취득가액으로 적용" 안내.
- 결과 Step 라벨 "환산취득가액" → 상속 시 "상속개시일 평가액(취득가액)"으로 분기(`transfer-tax-mixed-use.ts:469·491`).

---

## 5. UI 변경 설계

### 5-1. 겸용주택 상속 시 dead 블록 정리
- `CompanionAcqInheritanceBlock` 렌더를 **`isMixedUseHouse` 게이팅**: 겸용이면 단일자산용 "자산 구분(토지/개별주택/공동주택)" + "취득가액 의제 특례(pre/post)" 블록을 **숨김**(엔진 미도달·오해 유발). 헤더(상속개시일·피상속인 취득일)와 §154⑧3호 통산 토글은 **유지**(엔진 소비 중).
  - 구현 후보: `CompanionAcqInheritanceBlock`에 `isMixedUse` prop 추가 → 자산구분·의제섹션 조건부 숨김. 또는 `CompanionAcquisitionCauseSection.tsx:215`에서 겸용 시 별도 경량 블록 렌더.

### 5-2. 겸용 취득가액 입력을 "상속개시일 기준"으로 명확화
- 겸용 섹션의 "취득시 기준시가"(`MixedUseStandardPriceInputs`·`MixedUseAssetMajorStdPrice`) 라벨·안내를 상속 시 **"상속개시일 기준"**으로 전환(취득일=상속개시일).
- 상속 시 부분별 상속개시일 평가액 override 입력(선택) 노출: 주택분·상가분 각각 "상속세 신고가액(시가·감정·매매사례로 신고 시)". 미입력이면 기준시가 보충적평가 자동.
- **미공시 처리**: 이미지의 "취득 당시 개별주택가격 미공시(§164② 3-시점 환산)" 토글은 상속에서도 유지 — 미공시 상속주택의 상속개시일 개별주택가격을 3-시점으로 추정. 라벨을 상속 문맥으로 정정.

### 5-3. 정책 준수
- 토글/라디오 `ToggleCard`/`RadioCardGroup` 사용, 톤 `tones.ts` 단일 소스([[project_ui_color_tone_tokenization]]).
- fallback은 **display prop + API/validate 3중 미러**([[mirror-pattern]] 스킬) — `useEffect → store` 미러링 금지.
- 라벨 정본 클래스·`text-[Npx]` 금지(pre-push 게이트).

---

## 6. Pre-Do Anchor (Design 환류용 — Do 진입 전 우선 작성)

[[pre-do-anchor-verification]] 정책: "현행 일치 예상" 가정 금지. 다음 1~2건을 먼저 작성·실행해 설계 환류.

1. **A-golden(상속 겸용 직접취득가액)**: 이미지9 케이스 근사(양도가액 33억, 상속개시일 2017-09-15, 주택+상가). 기대값 = 양도차익이 **상속개시일 평가액**(개별주택가격·상가 기준시가) 기준으로 산정됨을 golden으로 고정. 현행 엔진(환산)으로 돌리면 **불일치(fail)** 나야 정상 — 그 delta가 세액 과소분.
2. **A-개산공제 제거**: 상속 모드에서 `landAppraisalDed==0`·`buildingAppraisalDed==0` 확인.
3. **A-regression**: 비상속(purchase) 겸용은 환산·개산공제 경로 **불변**(회귀 0).

경로: `__tests__/tax-engine/transfer/mixed-use-inheritance-acquisition.anchor.test.ts`.

> anchor 실측값은 KoreanLaw 검증 + 소책자/집행기준 사례로 확정(추정 금지). 1원 오차는 [[bigint-round-half-up]] 정책 적용.

---

## 7. 열린 질문 (Design 단계 결정)

1. **부분별 신고가액 override 범위**: 주택분·상가분 각각 시가/감정/매매사례 신고가액을 별도 입력받을지(완전), 기준시가 보충적평가만 지원할지(최소). → **권장: override 입력 + 기준시가 자동 fallback**(일반 엔진 `reportedValue` 우선 패턴 미러).
2. **미공시 상속주택 §164 근거**: §164②(3-시점) vs §163⑨2호·§164⑦ max(평가액, 취득당시 기준시가) 중 겸용 주택분에 적용할 조문·산식. → KoreanLaw 검증 필요.
3. **필요경비**: 상속(실가) 모드에서 자본적지출·양도비를 부분별로 받을지(주택/상가 분리), 자산 단위 단일 입력 후 안분할지.
4. **의제취득일 전(1985 이전) 상속 겸용**: pre-deemed max(①상증법 평가액, ③환산)을 부분별로 적용할지. 희소 케이스 — 후속 Phase로 분리 가능.
5. **가업상속공제(§97의2②)·공익수용(§164⑨1호) 조합**: 기존 겸용 특례와 상속 취득가액 경로의 상호작용. 우선 범위 밖, 회귀만 확인.

---

## 8. 14개 동기화 지점 (Definition of Done)

신규 필드(`acquisitionByInheritance`·`housingInheritedValue`·`commercialInheritedValue`·`inheritedNecessaryExpense`)는 [[tax-field-add]] 스킬 14지점 전수 점검. 겸용은 **`buildMixedUsePayload` 명시 매핑**이라 ⑫⑬⑭ 침묵 strip 위험 높음(memory `feedback_explicit_prop_mapping_strip`).

| # | 지점 | 파일 | 비고 |
|---|---|---|---|
| ① | AssetForm 타입 | `lib/stores/calc-wizard-asset.ts` | 이미 있는 상속 필드 재사용 여부 확인 |
| ② | initial | `makeDefaultAsset` | |
| ③ | normalize | `calc-wizard-asset-migrate.ts` | 세션 호환 |
| ④ | API 변환 | `lib/calc/transfer-tax-api-mixed-use.ts` `buildMixedUsePayload` | **명시 매핑 추가**(spread 아님) + `acquisitionCause==="inheritance"` 게이트 |
| ⑤ | UI 위젯 | `CompanionAcqInheritanceBlock`·`MixedUseStandardPriceInputs` | 5-1·5-2 |
| ⑥ | 사이드바 | `computeTransferSummary`(겸용 취득가액 preview) | 상속 시 평가액 직접 표시([[mixed-use-sidebar-acq-preview.bugfix.plan]] 경로 참조) |
| ⑦ | 결과 카드 | `MixedUseResultCard`·`transfer-tax-mixed-use.ts` Step 라벨 | "상속개시일 평가액" 분기 |
| ⑧ | validation | `lib/calc/transfer-tax-validate-mixed-area.ts` 등 | API/UI fallback ↔ validate 동일 fallback |
| ⑫ | Zod 입력 | `lib/api/transfer-tax-schema-mixed-use.ts` | 신규 필드 추가(미추가 시 strip) |
| ⑬ | body spread | `callTransferTaxAPI` | mixedUse는 `...data.mixedUse`(route.ts:686) 자동 — 확인 |
| ⑭ | Route 매핑 | `route.ts:676-699` | Date/number 변환·엔진 input 주입 |

> ⑨⑩⑪은 겸용 단일자산 특성상 일부 N/A — grep 자가 점검으로 확정.

---

## 9. Phase 계획

| Phase | 내용 | verify |
|---|---|---|
| **P0** | Pre-Do anchor(§6) 작성·실행 → 현행 환산 delta 확인, 설계 환류 | anchor fail이 기대 방향(세액 과소 delta) |
| **P1 엔진** | 타입 확장(§4-1) + `calcHousingEstimatedAcq`·`calcCommercialGainSplit` 상속 분기(§4-2) + 개산공제 0 + 필요경비 | anchor A-golden pass, A-regression 회귀 0 |
| **P2 결과** | Step 라벨·`calculationRoute` 분기(§4-3) + 결과 카드 | RTL·회귀 |
| **P3 API/Zod/Route** | ④⑫⑬⑭ 배선 + validation ⑧ | tsc 0, grep 자가점검 |
| **P4 UI** | dead 블록 게이팅(5-1) + 상속개시일 라벨(5-2) + override 입력 | 브라우저 수동(Network body 신규 필드 확인) |
| **P5 검증·ship** | 전 세목 회귀 + E2E(Playwright) + `ui-engine-sync-checker` | `check:pre-pr` GREEN |

**800줄 정책 주의**: `transfer-tax-mixed-use-helpers.ts`는 이미 802줄(만성 초과·경고 전용). 상속 분기 추가 시 별도 파일(`transfer-tax-mixed-use-inheritance-acq.ts`) 분리 검토.

---

## 10. 리스크·회귀 방어

- **회귀 최우선**: 비상속 겸용(purchase)은 환산+개산공제 경로 **완전 불변**. 상속 분기는 `acquisitionByInheritance` 게이트로 격리. anchor A-regression으로 강제.
- **PHD/4부분/공익수용/§154⑧3호 표2 조합**: 상속 분기와 상호작용. 우선 순수 상속(비-PHD·비-수용) 완결 후 조합 확장. 조합은 회귀만 우선 보장.
- **fork 임무혼동 재발 방지**([[feedback_fork_context_inheritance_task_confusion]]): 설계 검토는 fork 금지 — 메인 인라인 또는 비상속 전문에이전트(`transfer-tax-qa`). 서브에이전트 완료보고 비판적 정독([[feedback_subagent_completion_report_scrutiny]]).
- **plan-design-self-review-loop**: 본 계획서 완성 직후 자가검토 루프 적용 → 엔진.design.md·ui.design.md 생성·검토(전문 시니어 병렬).

---

## 11. 다음 단계

1. 본 계획서 자가검토(`plan-design-self-review-loop`).
2. `transfer-tax-senior` + `transfer-tax-ui-senior` 병렬 호출 → `transfer-mixed-use-inheritance-acquisition.engine.design.md` + `.ui.design.md` 생성(§7 열린 질문 확정 + KoreanLaw 검증).
3. Pre-Do anchor(P0) 작성.
4. Do(P1~P5) 시퀀셜.
