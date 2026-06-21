# 부담부증여 §114의2 환산취득가 5% 가산세 — 엔진 설계

> Plan 참조: `docs/00-pm/burdened-gift-114-2-penalty.plan.md`
> 작성일: 2026-06-21
> 법령 검증: KoreanLaw MCP MST 285523 (소득세법 시행 2026-04-21) §114조의2 직접 확인
> 전제 PR: #315 증여세 부담부증여 K-4/K-5 취득가액 모드 이식 (`gift-burdened-transfer-acquisition-cost.engine.design.md`)
>
> **13단계 자가검증 정정 반영(2026-06-21): mustFix 4 + residual 9** — mustFix 3(B경로 함수 스코프 정정: `calculateGeneralBuildingActualTransfer:413` payload+디스패처+내부도출 3단계, `:240` 오인용 제거)·residual(C-1c·C-6 양도세 탭 한정·legal-codes 기존 `BUILDING_PENALTY` 재사용·anchor-2 케이스C 구체수치·isSelfBuiltForCard 출처 부기·breakdown 변수명 grep 확정). mustFix 1(transferGain≤0 조기반환)·mustFix 2(item.standardPrice 0-base 차단)은 D-2 보강·Silent fallback 표에 기존 반영됨.

---

## Context

부담부증여 "양도분"(채무인수분=유상양도)이 신축 건물의 환산취득가(K-5)로 취득가액을 산정할 때,
소득세법 §114조의2 5% 가산세가 현재 발동하지 않는 갭을 해소한다.

**현황 (실측 — 3대 원인)**:

1. 신축 4필드(`isSelfBuilt`/`buildingType`/`constructionDate`/`extensionFloorArea`)가
   부담부증여 입력 경로에서 penalty 게이트 함수(`rate-calc.ts:55`)까지 도달하지 않는다.
2. K-5 환산은 `burdenedGiftInfo.acquisitionMethod === "converted"` (부담부증여 전용 enum)로만
   표현되고, 이 값이 `"estimated"` 로 변환되어 엔진 게이트에 도달하지 않는다.
3. **★ 핵심 원인**: `lib/tax-engine/transfer-tax-finalize.ts:313-314`의 `isEstimatedMode` ·
   `effectiveEstimatedBase` · `penaltyBase` 산정은 `FinalizeArgs.input`(= rawInput,
   `transfer-tax.ts:91`)을 읽는다. step override는 `workingInput`(=effectiveInput)만
   변경하고 원본 `input`은 미변경 → `isEstimatedMode=false` · `penaltyBase=0` →
   `penalty=floor(0×0.05)=0`. **step override를 어떻게 고쳐도 finalize 게이트를 동시에 결선하지
   않으면 penalty는 영구 0이다.**

**목표**: finalize penaltyBase 게이트 결선 + step/route-helper 전파로 양도세·증여세 두 탭 모두
§114조의2 가산세를 발동시킨다. Phase 1은 신축(`buildingType: "new"`)만; 증축은 SCOPE OUT.

---

## 법령 근거 (KoreanLaw MCP MST 285523 직접 확인)

### 소득세법 §114조의2 전문 (현행 원문 — KoreanLaw MST 285523, 시행 2026-04-21 확인)

```
제114조의2(감정가액 또는 환산취득가액 적용에 따른 가산세)
① 거주자가 건물을 신축 또는 증축(증축의 경우 바닥면적 합계가 85제곱미터를 초과하는 경우에
   한정한다)하고 그 건물의 취득일 또는 증축일부터 5년 이내에 해당 건물을 양도하는 경우로서
   제97조제1항제1호나목에 따른 감정가액 또는 환산취득가액을 그 취득가액으로 하는 경우에는
   해당 건물의 감정가액(증축의 경우 증축한 부분에 한정한다) 또는 환산취득가액(증축의 경우
   증축한 부분에 한정한다)의 100분의 5에 해당하는 금액을 제92조제3항제2호에 따른 양도소득
   결정세액에 더한다.
② 제1항은 제92조제3항제1호에 따른 양도소득 산출세액이 없는 경우에도 적용한다.
```

### 법령 검증 결론표

| 항목 | 판정 | 근거 |
|---|---|---|
| base = 건물 환산취득가(토지 제외) | 확정 | §114조의2① "해당 건물의 … 환산취득가액의 100분의 5". 토지는 신축·증축 대상 아님 |
| 부담부증여 채무분 양도에 §114조의2 적용 | 확정 | 조심2019서3934(948844, 2019.12.26): 부담부증여 신축건물 환산취득가 5% 가산세 적법(기각) |
| K-4 실지취득가 선택 시 미발동 | 확정 | 조심2019서3934 부연 — §159① A=실지(§97①1호가목) 선택 시 가산세 미부담 |
| 부담부증여 base = 안분 후(양도분=채무액분) 건물 환산취득가 | 강한 해석(재결 직접 판시 아님) | §114조의2①이 §159① 양도차익 계산 체계 안에서 건물 환산취득가에 부착 → 양도분 안분 후 값이 그 체계의 건물 환산취득가라는 §159① 체계 도출 논리. 재결 본문은 금액 'OOO' 마스킹 → 직접 판시 없음 |
| 산출세액 0이어도 부과 (법령) | 확정 | §114조의2② "양도소득 산출세액이 없는 경우에도 적용" |
| 산출세액/양도차익 ≤ 0 시 구현 발동 | **D-2에 조기반환 경로 포함 필요** | `transfer-tax.ts:385-404` `if (transferGain <= 0)` 분기는 finalize를 경유하지 않고 별도 penalty 산정. `pb0`(`:386-388`)이 원본 `input`(step override 미반영, `useEstimatedAcquisition=false`)+`estimatedBase`(K-5는 `calcTransferGain`가 0 반환)을 읽어 `pb0=0` → penalty=0. **이 경로를 D-2 fix에 포함하지 않으면 §114조의2② zero-tax 발동 불가** |
| 신축 기산일 = 취득일, 증축 기산일 = 증축일 | 확정 | §114조의2① 본문 |
| 2018.1.1 환산취득가 시행 | 확정 | 조심2019서3934 구조문(§93) 인용 실증 |
| 증축 = 증축부분 한정 + 바닥면적 합계 85㎡ 초과 | 확정 | §114조의2① 괄호 |
| 2020.1.1 감정가액 게이트 | 본 작업 비대상 | 증여 부담부증여(appraisal enum 부재)·양도세 신축(본 PR 신축만) 모두 비경유 |
| 2020.1.1 증축 추가 시행일 부칙 | 후속 PR 이관 | 증축은 Phase1 SCOPE OUT — 후속 PR에서 KoreanLaw 연혁 MST로 검증 |

---

## ★ 케이스 인벤토리 (법령 본문·단서·각호 전수)

| # | 시나리오 | 자산종류 | 취득방식 | 신축/증축 | §114조의2 발동 | penaltyBase | 상태 |
|---|---|---|---|---|---|---|---|
| C-1 | 부담부증여 + 비-land + K-5 + 신축 + 5년 이내 | building / housing | K-5 환산 | 신축(취득일~5년 이내) | **발동** | `perAsset.building.acquisitionPrice` × 5% | ☐ TODO |
| C-1c | 부담부증여 + **commercial_building** + K-5 + 신축 + 5년 이내 (**양도세 탭 한정**) | commercial_building | K-5 환산 | 신축 | **발동** (양도세 탭만) | `perAsset.building.acquisitionPrice` × 5% (C-1 동형) | ☐ 양도세 탭 회귀 |
| C-2 | 부담부증여 + 비-land + K-5 + 신축 + 5년 초과 | building / housing | K-5 환산 | 신축 5년 초과 | 미발동 | — (rate-calc.ts:77-78 게이트) | ☐ TODO |
| C-3 | 부담부증여 + land + K-5 + 신축(비현실) | land | K-5 환산 | (전부) | **미발동** | — (§114조의2① "건물" 신축만) | ☐ TODO |
| C-4 | 부담부증여 + 비-land + K-4 실지 + 신축 | building / housing | K-4 실지 | 신축 | 미발동 | — (K-4=§97①1호가목, 환산 아님) | ☐ TODO |
| C-5 | 부담부증여 + 비-land + K-5 + isSelfBuilt=false | building / housing | K-5 환산 | 해당없음 | 미발동 | — (rate-calc.ts:55 isSelfBuilt 게이트) | ☐ TODO |
| C-6 | 부담부증여 + general_building(B경로) + 신축 + **K-5 환산** | general_building | K-5 환산 (건물카드 usedEstimatedAcquisition) | 신축 5년 이내 | **발동** | 건물카드 estimatedBase(=buildingAcq) × 5%, 토지카드 미포함 | ☐ TODO |
| C-6a | 부담부증여 + general_building(B경로) + 신축 + **K-4 실지** | general_building | K-4 실지 | 신축 | **미발동** | — (K-4=§97①1호가목, 환산 아님 → §114의2 비대상) | ☐ 회귀 확인 |
| C-6b | **비-부담부** 실거래가 general_building + newConstruction(isSelfBuilt=true) | general_building | 실지취득가 (`:478`) | 신축 | **미발동** | — (실지거래가 §97①1호가목, 환산 아님 → §114의2 비대상) | ☐ 회귀 확인 |
| C-7 | 부담부증여 + 비-land + K-5 + 증축(85㎡초과·5년이내) | building / housing | K-5 환산 | 증축 85㎡초과 | **(Phase1 미지원)** | 증축부분 한정 base 미구현 → SCOPE OUT | ⛔ |
| C-8 | 부담부증여 + 비-land + K-5 + 증축(85㎡이하) | building / housing | K-5 환산 | 증축 85㎡이하 | 미발동 | — (rate-calc.ts:69 게이트) | ☐ TODO |
| C-9 | 부담부증여 + 비-land + K-5 + 신축 + transferDate < 2018-01-01 | building / housing | K-5 환산 | 신축 | 미발동 | — (rate-calc.ts:60 게이트) | ☐ TODO |
| C-10 | 일반 양도세(비-부담부증여) + 신축 + K-5 — 기존 경로 회귀 | housing/building | K-5 환산 | 신축 5년 이내 | 발동(기존 경로 회귀) | 기존 estimatedBase(엔진 calcTransferGain 반환) | ☐ 회귀 확인 |
| C-11 | 증여세 탭 부담부증여 + housing + K-5 + 신축 + 5년 이내 | housing (증여탭) | K-5 환산 | 신축 | **발동** | `perAsset.building.acquisitionPrice` × 5% | ☐ TODO |

> **C-7(증축) 증여 탭도 동일**: 증여세 탭의 경우 building 단일슬롯에서 신축은 C-11과 동일.
> 증축은 Phase1 buildingType RadioCardGroup에서 extension disabled → 미도달.
>
> **★ propertyType enum 정합 (Finding 4 + residual medium)**: 부담부증여 안분 엔진 SUPPORTED는
> `["housing", "land", "building", "general_building", "commercial_building"]`
> (`burdened-gift-apportionment.ts:494` 실측). **"apt"/"apartment" 라벨은 enum에 없다** → 위 표는
> 실제 enum(housing·building·general_building·commercial_building)으로 표기. §114조의2① "건물"에
> 해당하는 건물형(building·general_building·commercial_building·housing)이 K-5 신축 시 발동 대상.
>
> **★ 증여세 탭 vs 양도세 탭 도달 자산 구분(residual medium — C-1c 정렬)**: 증여세 탭은
> `resolvePropertyType`(`gift-burdened-transfer-api.ts:38-46`)이 폼 카테고리를 **land/housing/building 3종만**
> 산출한다(`real_estate_apartment`→housing·`real_estate_building` 주택→housing/비주택→building·`real_estate_land`→land).
> 따라서 **commercial_building·general_building은 증여세 탭에 미도달** — C-1c(commercial_building)·C-6(general_building)은
> **양도세 탭 한정** 케이스다. UI 설계(land/building/housing)가 증여세 탭의 진실이며, 본 engine 설계는 거기에 정렬한다.
> 신축 4필드(아래 D-5·`:282`·`:315`)의 "건물형 대상" 주석도 **증여세 탭에서는 building·housing만**(general/commercial은 양도세 경로)으로 한정 표기한다.

---

## 갭 분석 — 이미 완비 vs 추가 필요

### 이미 완비

| 항목 | 파일:line | 확인 |
|---|---|---|
| `calculateBuildingPenalty` (5% applyRate·5년·85㎡ 게이트) | `lib/tax-engine/transfer-tax-rate-calc.ts:51-87` | 실측 |
| penalty → 결정세액·지방소득세·totalTax 반영 | `lib/tax-engine/transfer-tax-finalize.ts:320,323,343` | 실측 |
| 일반 양도세 신축 4필드 Zod `propertyBaseShape` | `lib/api/transfer-tax-schema.ts:175-178` | 실측 (⑨⑫ 신규 0) |
| Route 엔진 매핑 `constructionDate` toOptionalDate | `app/api/calc/transfer/route.ts:268-271` | 실측 (⑭ 신규 0) |
| 부담부증여 K-5 건물 환산취득가 자산별 독립 산출 | `lib/tax-engine/burdened-gift-apportionment.ts:309-321`, `perAsset.building.acquisitionPrice:458` | 실측 |
| general_building 비-부담부 `usedEstimatedAcquisition:true`+`estimatedBase` 설정 (mirror 원형) | `lib/tax-engine/general-building-valuation.ts:679-693` | 실측 |
| `cardToItemInput` 건물카드 `acquisitionMethod`(`:124`)·`isSelfBuilt`(`:125`)·`constructionDate`(`:127`)·`estimatedBase`(`:112`) 자동 매핑 | `app/api/calc/transfer/general-building-route-helper.ts:108-133` | 실측 |
| 양도세 AssetForm 신축 4필드·body 송신·validate·SelfBuiltSection UI | 조사 완료 — plan §6.2 참조 | 조사 |
| 양도세 결과뷰 penalty Row | `components/calc/results/TransferTaxResultView.tsx:420-421` `{result.penaltyTax > 0 && <Row label="환산가액적용가산세 (§114조의2)" … />}` | 실측 — **양도세 ⑦ 신규 0건** |
| `BurdenedGiftTransferTaxInput` K-4/K-5 필드 | `lib/tax-engine/types/inheritance-gift-estate.types.ts:571-686` | PR#315 완료 |

### 추가 필요 (본 작업 범위)

| 항목 | 파일:line | 분류 |
|---|---|---|
| **★ finalize penaltyBase 게이트 결선 (D-2 핵심, 단일안 (a))** | `lib/tax-engine/transfer-tax-finalize.ts:313-314` `input` → `effectiveInput` 변경 | 엔진 공통 |
| **★ 조기반환(transferGain≤0) 경로 결선 (mustFix 1·§114조의2② zero-tax)** | `lib/tax-engine/transfer-tax.ts:385-404` `pb0`(`:386-388`) `input` → `effectiveInput` + `usedEstimatedAcquisition` 포함 | 엔진 공통 |
| **엔진 A경로: step.ts 신축 게이트 전파** | `lib/tax-engine/transfer-tax-burdened-gift-step.ts:50-59` override 확장 | 엔진 공통 |
| **엔진 B경로: general-building route-helper 건물카드 (mustFix 3 — 3단계)** | (1) payload 타입 `GeneralBuildingActualPricePayload`(`:34-61`) self-built 4필드 추가 + (2) 디스패처 `actualPriceMode` 분기(`:301-322`) forward + (3) `calculateGeneralBuildingActualTransfer`(`:413`) 내부 `isSelfBuilt` 도출 후 건물카드(`:538-543`) 하드코딩 교체 | 엔진 공통 |
| **증여세 ① 폼타입 신축 4필드** | `lib/tax-engine/types/inheritance-gift-estate.types.ts` `BurdenedGiftTransferTaxInput`에 4필드 추가 | 증여세 측 |
| **증여세 ② initial** | `components/calc/inheritance/estate-card/variants/BurdenedGiftTransferSection.tsx:57` `createEmptyBgt` | 증여세 측 |
| **증여세 ③ normalize** | `components/calc/inheritance/normalize-restored-form-dates.ts:85-99` `toOptionalDate(bgt.constructionDate)` | 증여세 측 |
| **증여세 ④⑬ API변환** | `lib/calc/gift-burdened-transfer-api.ts:153-218` body 최상위 4필드(시가+K-5 모드 한정) | 증여세 측 |
| **증여세 ⑤ UI위젯** | `components/calc/inheritance/estate-card/variants/BurdenedGiftValuationModeSection.tsx:217` (`isMarketMode && isConverted && !isLandType`) | 증여세 측 |
| **증여세 ⑦ 결과카드 penalty Row** | `components/calc/results/BurdenedTransferTaxResultCard.tsx` Row sub-component(`:63`~) | 증여세 측 |
| **증여세 ⑧ validate** | `components/calc/gift-tax-form-shared.tsx:246,302-322` | 증여세 측 |

---

## 핵심 설계 결정

### D-1. 건물분 base 배선

`lib/tax-engine/burdened-gift-apportionment.ts:458`의 `perAsset.building.acquisitionPrice`
(채무비율 안분 후·자산별 독립 환산된 양도분 건물 환산취득가)를 penalty base로 결선한다.
별도 재계산 불요. `perAsset.land.acquisitionPrice`(`:448`)는 §114조의2① "건물" 신축 조항상
토지 무관이므로 제외.

**판정 근거**: §2.2 검증 결론표(§159① 체계 도출 + 조심2019서3934). plan §2.3에서 "강한 해석"으로
명기한 사항이나, 실제 numeric 결선은 이미 안분 후 값인 `perAsset.building.acquisitionPrice`를
그대로 사용하므로 구현 영향 없음.

### D-2. finalize penaltyBase 게이트 결선 — 단일안 (a) 확정

**문제**: `finalize.ts:313`의 `isEstimatedMode = input.useEstimatedAcquisition || input.usedEstimatedAcquisition`
에서 `input`은 rawInput(`transfer-tax.ts:91`)이다. step override는 `workingInput`(=effectiveInput)만
바꾸므로 이 라인은 step override를 보지 못한다.

**단일안 (a)**: `finalize.ts:313-314`에서 `input` → `effectiveInput`으로 변경한다.

**★ fix 범위 명확화 (Finding 3 — 흐름도↔fix 범위 모순 해소)**: fix는 **313-314 두 줄만**
변경한다. `penaltyBase`(`315-317`)의 `input.acquisitionMethod`·`input.appraisalValue`는
**변경하지 않는다**(아래 코드블록·계산 흐름도 모두 `input.` 유지로 일치). 부담부증여 scope에서는
`acquisitionMethod === "estimated"`라 appraisal 분기를 타지 않아 numeric 결과 동일하며,
일반 양도세 회귀를 피하기 위해 315-317은 건드리지 않는다.

```ts
// 변경 전
const isEstimatedMode = input.useEstimatedAcquisition || input.usedEstimatedAcquisition;
const effectiveEstimatedBase = estimatedBase || (input.usedEstimatedAcquisition ? (input.estimatedBase ?? 0) : 0);

// 변경 후
const isEstimatedMode = effectiveInput.useEstimatedAcquisition || effectiveInput.usedEstimatedAcquisition;
const effectiveEstimatedBase = estimatedBase || (effectiveInput.usedEstimatedAcquisition ? (effectiveInput.estimatedBase ?? 0) : 0);
```

**회귀 안전성**: aggregate 경로(general_building 등)에서 `effectiveInput === input`이므로
(FinalizeArgs 기존 패턴 — aggregate는 cardToItemInput이 단건 input을 생성, step override 미경유)
input → effectiveInput 변경이 aggregate 경로에 무영향임을 anchor-3 + 전체 vitest로 확인.

**기존 aggregate 패턴과의 동형성**: `general-building-valuation.ts:685-686`이 카드에
`usedEstimatedAcquisition:true`+`estimatedBase` 설정 → `cardToItemInput`이 단건 input으로 전달 →
finalize에서 `input.usedEstimatedAcquisition`(변경 전)이 읽는다. 변경 후에는 effectiveInput을 읽되,
단건 경로에서 `effectiveInput === input`이므로 동일 값을 읽는다. **즉 기존 aggregate 패턴과 정확히 동형.**

**★ D-2 보강 — 조기반환(양도차익 ≤ 0) 경로 동시 결선 (Finding 2 critical)**:
finalize.ts:313-314 외에 **`transfer-tax.ts:385-404`의 `if (transferGain <= 0)` 분기**도 fix 대상이다.
이 분기는 finalize를 경유하지 않고 별도로 penalty를 산정하며, `pb0`(`:386-388`):
```ts
// 변경 전 (transfer-tax.ts:386-388)
const pb0 = input.acquisitionMethod === "appraisal"
  ? (input.appraisalValue ?? 0)
  : (input.useEstimatedAcquisition ? estimatedBase : 0);
```
부담부증여 K-5는 `effectiveInput.useEstimatedAcquisition=false`(차익 산식 불변 유지)이고
`calcTransferGain(effectiveInput)`가 `estimatedBase=0` 반환(`transfer-tax-helpers.ts:289-325` 실측)
→ `pb0=0` → penalty=0. **finalize(D-2)만 고쳐도 양도차익 ≤ 0(환산취득가가 높아 손실/0인 정상
시나리오)에서는 §114조의2② 가산세가 여전히 0이다.**

```ts
// 변경 후 (finalize:313-314와 동일 로직 — effectiveInput + usedEstimatedAcquisition 포함)
const effectiveEstimatedBase0 =
  effectiveInput.usedEstimatedAcquisition ? (effectiveInput.estimatedBase ?? 0) : 0;
const pb0 = effectiveInput.acquisitionMethod === "appraisal"
  ? (effectiveInput.appraisalValue ?? 0)
  : (effectiveInput.useEstimatedAcquisition ? estimatedBase : effectiveEstimatedBase0);
```
anchor에 `transferGain ≤ 0` 케이스(부담부증여 K-5 신축 + 환산취득가가 양도가보다 높아 손실)를
추가해 회귀 고정한다.

**(b) FinalizeArgs 전용 base 주입안**: 신규 전용 필드 + 호출부 주입 + finalize 분기 추가로
코드량이 많아짐 → Simplicity First 위반으로 SCOPE OUT.

### D-3. step override 신축 게이트 전파 (A경로)

`transfer-tax-burdened-gift-step.ts:50-59` override 확장:

- 발동 조건: `rawInput.isSelfBuilt === true` AND `rawInput.burdenedGiftInfo.acquisitionMethod === "converted"` AND `rawInput.buildingType === "new"` (증축 SCOPE OUT)
- 발동 시 `workingInput` 스프레드에 추가:
  - `acquisitionMethod: "estimated"` (K-5 = estimated 인식)
  - `usedEstimatedAcquisition: true`
  - `estimatedBase: building.acquisitionPrice` (토지 제외, `perAsset.building.acquisitionPrice`)
  - `isSelfBuilt: rawInput.isSelfBuilt`
  - `buildingType: rawInput.buildingType`
  - `constructionDate: rawInput.constructionDate`
  - `extensionFloorArea: rawInput.extensionFloorArea`
- `useEstimatedAcquisition: false`(차익 산식 변경 방지) 유지
- **단 step override 단독으로는 penaltyBase가 0 → D-2 finalize 결선이 반드시 동반되어야 penalty 발동**

### D-4. general_building route-helper 건물카드 (B경로)

`general-building-route-helper.ts:538-543` 건물카드 현행:
```ts
usedEstimatedAcquisition: false, estimatedBase: 0
```

부담부증여 분기(`if (burdenedGiftInfo)`, `:453`)에서 `buildingAcq`(= `breakdown.perAsset.building.acquisitionPrice`, `:474`)가 이미 도출되어 있다.

**★ 게이트는 `isSelfBuilt === true` 단독으로는 안 됨 (critical — 회귀·법령 오류 차단)**:
`calculateGeneralBuildingActualTransfer`(`:405-412` 주석: "환산취득가는 사용하지 않으며 개산공제도 없음")는
`actualPriceMode`(실거래가 경로) 공유 카드로, **부담부증여 분기(`:453`, K-1~K-5 가능)와
비-부담부 실지취득가 분기(`:478`)가 모두 도달**한다. `isSelfBuilt`만으로 게이트하면:

- (1) **비-부담부 실거래가 general_building + `buildingAcquisitionCause==="newConstruction"`**
  (`:240` `isSelfBuilt=true`) 케이스가 `usedEstimatedAcquisition:true`+`estimatedBase=buildingAcq(실지가)`로
  설정 → `cardToItemInput:124`가 `acquisitionMethod:"estimated"`로 매핑 → finalize가 **실지취득가에 5% 가산세 오부과(회귀)**.
- (2) **부담부증여 K-4(실지) 신축**도 동일 오발동 → C-6(K-5 한정) 범위 및 조심2019서3934
  (KoreanLaw ID 948844: K-4 실지 선택 시 §114의2 미부담)에 정면 위배.

§114조의2①은 §97①1호**나목(환산·감정)에만** 적용되고 **가목(실지)에는 적용되지 않으므로**
실지가에 부과는 명백한 법령 오류다.

**★ mustFix 3 — 함수 스코프 정정**: `calculateGeneralBuildingActualTransfer`(`:413` 함수 정의·실거래가/감정가 모드 공유)는 진입 타입 `GeneralBuildingActualPricePayload`(`:34-61`)에 self-built 필드가 **부재**하고, 디스패처 `actualPriceMode` 분기(`:301-322`)도 self-built 필드를 forward하지 않으며, 함수 내부에 `isSelfBuilt` 도출(`buildingAcqCause === "newConstruction"`)이 **grep 0건**이다. 즉 기존 설계의 "`:240` 이미 도출됨" 가정은 K-5 standalone/dispatch 스코프의 것으로, 본 함수 스코프에는 적용되지 않는다. 따라서 **3단계로 신설**한다:

- **(1) payload 타입 확장** — `GeneralBuildingActualPricePayload`(`:34-61`)에 `isSelfBuilt?`·`buildingType?`·`buildingAcquisitionCause?`·`buildingAcquisitionDate?` 추가.
- **(2) 디스패처 forward** — `actualPriceMode` 분기(`:301-322`)의 `calculateGeneralBuildingActualTransfer(...)` 호출 객체에 위 4필드 forward(기존 `acquisitionLandPricePerSqm`·`burdenedGiftInfo` forward와 동형).
- **(3) 함수 내부 도출 + 건물카드 설정** — `calculateGeneralBuildingActualTransfer` 내부에서 `isSelfBuilt = buildingAcquisitionCause === "newConstruction"` 도출 후, 건물카드(`:538-543`, `propertyId:"building"`, 현재 `usedEstimatedAcquisition:false`·`estimatedBase:0` 하드코딩)를 아래 mirror로 교체.

**발동 조건 (보강·필수 AND 게이트 — 오발동 방지)**:
`isSelfBuilt === true`(위 (3)에서 `buildingAcquisitionCause === "newConstruction"` 도출)
**AND** `transferBurdenedGiftBreakdown != null`(부담부 분기)
**AND** `transferBurdenedGiftBreakdown.perAsset.building.acquisitionMethod === "converted"`(K-5 한정).
비-부담부 실거래가 분기와 부담부 K-1~K-4 분기는 기존대로 `usedEstimatedAcquisition:false` 유지(실지가에 가산세 오부과 차단 — C-6a·C-6b 회귀).
> `transferBurdenedGiftBreakdown`의 실제 로컬 변수명·접근 라인은 Do 진입 시 grep으로 확정(추정 금지) — 본 문서의 `breakdown`/`buildingAcq`는 가독성 약칭.

**mirror 원칙** — `general-building-valuation.ts:679-693`의 기존 비-부담부 설정과 정확히 동형:
```ts
// 비-부담부 경로 (mirror 원형)
usedEstimatedAcquisition: true,
estimatedBase: acquisition.building,
isSelfBuilt: isSelfBuiltForCard,        // ★ 엔진측(general-building-valuation.ts) 도출 변수
buildingAcquisitionDate: buildingAcqDate,
buildingAcquisitionCause: input.buildingAcquisitionCause,
```
> **★ residual low — `isSelfBuiltForCard` 출처 부기**: `isSelfBuiltForCard`는 **엔진측 도출 변수**(`general-building-valuation.ts`)다. route-helper의 `calculateGeneralBuildingActualTransfer`에서는 이 엔진측 변수를 직접 가져오는 게 아니라, 위 (1)~(2) **payload forward로 동일 값을 확보**한 뒤 함수 내부에서 `isSelfBuilt`를 도출한다.

부담부 건물카드에 이 패턴을 mirror하되 `estimatedBase`만 `buildingAcq`로 교체:
```ts
// 부담부 건물카드 (mirror 적용)
usedEstimatedAcquisition: true,
estimatedBase: buildingAcq,   // transferBurdenedGiftBreakdown.perAsset.building.acquisitionPrice
isSelfBuilt: isSelfBuilt,     // (3)에서 buildingAcquisitionCause === "newConstruction" 도출
buildingAcquisitionDate: buildingAcquisitionDate,  // (2) payload forward
buildingAcquisitionCause: buildingAcquisitionCause, // (2) payload forward
```
→ `cardToItemInput:108-133`이 `acquisitionMethod`(`:124` `isBuilding && usedEstimatedAcquisition ? "estimated" : "actual"`)·`isSelfBuilt`(`:125`)·`constructionDate`(`:127`)·`estimatedBase`(`:112`)를 자동 매핑. 작업자는 위 (1)~(3) 건물카드 설정만 추가.

**B경로 `buildingType`/`extensionFloorArea` 미전파(SCOPE OUT)**: `AssetCardForAggregate` 타입·
`cardToItemInput:124-164` 매핑에 `buildingType`/`extensionFloorArea`가 전파되지 않음(grep 0건).
B경로 신축은 `buildingType` undefined → `calculateBuildingPenalty:67` extension 분기 skip → 신축(default) 취급.
**Phase1 신축만이라 무해**. 증축 정밀화는 후속.

**B경로는 finalize 단건 게이트(D-2)를 경유하지 않고** `cardToItemInput` → 자산별 item input으로
penalty가 산정(aggregate 경로는 effectiveInput===input → finalize:313-314 영향 없음).

### D-5. 신축 4필드 증여세 타입 확장

`BurdenedGiftTransferTaxInput`(`inheritance-gift-estate.types.ts:571-686`)에 4필드 추가:
```ts
/** §114조의2 신축 여부. 증여세 탭 대상은 building·housing만(general_building·commercial_building은 양도세 경로). land 제외 */
isSelfBuilt?: boolean;
/** 신축("new") 또는 증축("extension"). Phase1 신축만 UI 지원. */
buildingType?: "new" | "extension";
/** 신축일(취득일). 5년 기산점. toOptionalDate 필수. */
constructionDate?: Date;
/** 증축 바닥면적 합계(㎡). buildingType==="extension" 시만 적용. Phase1 미노출. */
extensionFloorArea?: number;
```

### D-6. 이중 floor 회피

`calculateEstimatedAcquisitionPrice`(안분 환산)에서 1회 floor →
`applyRate(base, 0.05)`(`rate-calc.ts:80`)에서 1회 floor.
`perAsset.building.acquisitionPrice`가 이미 안분 후 값이므로 재차 채무비율 곱 금지.

### D-7. 증축 Phase 1 SCOPE OUT

`perAsset.building.acquisitionPrice`는 건물 전체 환산취득가.
§114조의2① 증축은 "증축한 부분에 한정한다"이므로 전체 base를 적용하면 과대 부과.
Phase 1은 `buildingType: "new"`(신축)만. UI에서 extension disabled로 차단.

---

## 엔진 input 타입 변경

### A경로 (`BurdenedGiftTransferTaxInput` 신축 4필드 추가)

```ts
// lib/tax-engine/types/inheritance-gift-estate.types.ts:686 직후 추가

// ===== §114조의2 신축 가산세 (K-5 환산 + isMarketMode 한정) =====
/**
 * 신축 여부. **증여세 탭 대상은 building·housing만**(부담부증여 안분 SUPPORTED 건물형 중
 * general_building·commercial_building은 resolvePropertyType 미산출 → 양도세 경로 한정).
 * (burdened-gift-apportionment.ts:494 SUPPORTED 참고). land는 §114조의2 대상 아님 → UI에서 !isLandType 게이트로 미노출.
 */
isSelfBuilt?: boolean;
/**
 * 신축("new") 또는 증축("extension").
 * Phase 1: "new"만 지원. "extension"은 buildingType RadioCardGroup에서 disabled.
 * 증축은 "증축부분 한정" base 분리 미구현(Phase 1 SCOPE OUT) → extension 발동 방지.
 */
buildingType?: "new" | "extension";
/**
 * 신축일(취득일). §114조의2① "취득일부터 5년 이내" 기산점.
 * isSelfBuilt===true + isMarketMode + acquisitionMethod==="converted" 시 필수.
 * ★ normalize에서 toOptionalDate 반드시 적용(Date 침묵 함정).
 */
constructionDate?: Date;
/**
 * 증축 바닥면적 합계 (㎡). buildingType==="extension" 시만 게이트 검사.
 * Phase 1 UI 미노출, 방어 값만 유지.
 */
extensionFloorArea?: number;
```

---

## 엔진 result 타입 변경 없음

`TransferTaxResult.penaltyTax`(`lib/tax-engine/types/transfer.types.ts:636`)·
`penaltyBase`(`:642`)는 이미 존재. 결과 카드 산식 표시에 충분.

지방소득세는 `determinedTaxWithPenalty × 10%`(`finalize.ts:323`) — 가산세 포함분.
결과 카드에 "지방소득세 = (결정세액 + 환산가액적용가산세) × 10%" 주석 표시로 정합 안내 필요(D-8).

---

## 계산 알고리즘

### 전체 흐름 (부담부증여 K-5 신축 케이스)

```
[엔진 진입 — transfer-tax.ts]
  rawInput: isSelfBuilt=true, buildingType="new", constructionDate=T,
            burdenedGiftInfo.acquisitionMethod="converted"

  STEP 0.48 — transfer-tax-burdened-gift-step.ts
    ① burdened-gift-apportionment.ts STEP4 K-5 실행
       → perAsset.building.acquisitionPrice = buildingAcq (안분 후 환산취득가)
    ② workingInput(=effectiveInput)에 추가:
       acquisitionMethod: "estimated"
       usedEstimatedAcquisition: true
       estimatedBase: buildingAcq          ← D-2 결선 핵심
       isSelfBuilt: true
       buildingType: "new"
       constructionDate: T
       useEstimatedAcquisition: false     (차익 산식 불변)

  STEP 10.5 — transfer-tax-finalize.ts:313-318 (D-2 결선 후)
    isEstimatedMode = effectiveInput.useEstimatedAcquisition || effectiveInput.usedEstimatedAcquisition
                    = false || true = true
    effectiveEstimatedBase = estimatedBase || (effectiveInput.usedEstimatedAcquisition ? effectiveInput.estimatedBase : 0)
                           = 0 || buildingAcq = buildingAcq
    penaltyBase = input.acquisitionMethod === "appraisal"   ← D-2 fix 범위(313-314만) 외 → input. 유지
                  ? (input.appraisalValue ?? 0)             (appraisal 아님 — 부담부증여는 estimated)
                  : (isEstimatedMode ? effectiveEstimatedBase : 0)
                = buildingAcq
    calculateBuildingPenalty(effectiveInput, buildingAcq):
      isSelfBuilt=true ✓, transferDate≥2018-01-01 ✓
      isPenaltyMethod: acquisitionMethod==="estimated" ✓
      buildingType!=="extension" ✓
      constructionDate=T, addYears(T,5)≥양도일 ✓
      penalty = applyRate(buildingAcq, 0.05) = floor(buildingAcq × 0.05)
    → penaltyTax = floor(buildingAcq × 0.05)

  STEP 10: localIncomeTax = applyRate(determinedTax + penaltyTax, 0.1)
  STEP 11: totalTax = determinedTax + penaltyTax + localIncomeTax + …
```

### 정수 연산 규칙

- `penaltyBase` = `perAsset.building.acquisitionPrice` — 이미 안분 후 floor 1회
- `penaltyTax` = `applyRate(penaltyBase, 0.05)` = `Math.floor(penaltyBase × 0.05)` — floor 1회
- 이중 floor 금지: base를 다시 채무비율 곱 절대 금지 (D-6)
- `localIncomeTax` = `applyRate(determinedTax + penaltyTax, 0.1)` — 가산세 포함분 기준

---

## 14개 동기화 지점 점검

### 양도세 측 (8지점) — 신규 0건

| # | 지점 | 파일 | 상태 |
|---|---|---|---|
| ① 폼 상태 | AssetForm `isSelfBuilt`/`buildingType`/`constructionDate`/`extensionFloorArea` | `lib/stores/calc-wizard-asset.ts` | ✅ 기존 |
| ② initial | factory 4필드 | 동상 | ✅ 기존 |
| ③ normalize | migration 4필드 | `calc-wizard-migration.ts` | ✅ 기존 |
| ④ API변환 | body 최상위 송신(transferType 무관) | `lib/calc/transfer-tax-api.ts` | ✅ 기존 |
| ⑤ UI위젯 | `SelfBuiltSection` (`components/calc/transfer/CompanionAcqPurchaseBlock.tsx:673-689`, 부담부+매매취득 노출) | 동상 | ✅ 기존 |
| ⑥ 사이드바 | 해당없음 (penalty는 API 결과 후) | — | — |
| ⑦ 결과카드 | `TransferTaxResultView.tsx:420-421` `result.penaltyTax > 0` Row | 실측 확인 | ✅ 기존 (신규 0) |
| ⑧ validate | `acquisitionCause === "purchase"` 게이트 | `lib/calc/transfer-tax-validate.ts` | ✅ 기존 |
| ⑨ Zod enum | `lib/api/transfer-tax-schema.ts:175-178` propertyBaseShape 4필드 | 실측 확인 | ✅ 기존 |
| ⑩ Zod 컴패니언 | 동상 | 동상 | ✅ 기존 (신규 enum 없음) |
| ⑪ acqDate fallback | — | — | — (신축 무관) |
| ⑫ Zod 입력객체 | propertyBaseShape spread 수용 | `lib/api/transfer-tax-schema.ts:175-178` | ✅ 기존 |
| ⑬ body spread | 4필드 최상위 송신 | `lib/calc/transfer-tax-api.ts` | ✅ 기존 |
| ⑭ Route 매핑 | `app/api/calc/transfer/route.ts:268-271` isSelfBuilt·buildingType·constructionDate·extensionFloorArea | 실측 확인 | ✅ 기존 |

**양도세 측 실제 신규 작업**: 엔진 A경로(step.ts) + finalize 결선(D-2) + B경로(route-helper)만.

### 증여세 측 (14지점) — 신규 7지점

| # | 지점 | 파일 (repo-root 절대경로) | 작업 |
|---|---|---|---|
| ① 폼타입 | `lib/tax-engine/types/inheritance-gift-estate.types.ts` `BurdenedGiftTransferTaxInput` | 4필드 추가 (D-5) |
| ② initial | `components/calc/inheritance/estate-card/variants/BurdenedGiftTransferSection.tsx:57` `createEmptyBgt` | 4필드 `undefined` 초기값 + `hasData` OR 조건 추가 |
| ③ normalize | `components/calc/inheritance/normalize-restored-form-dates.ts:85-99` `normalizedAcq` 패턴 | `toOptionalDate(bgt.constructionDate)` 추가 (Date 침묵 함정 방지) |
| ④ API변환 = ⑬ | `lib/calc/gift-burdened-transfer-api.ts:153-218` | body 최상위 신축 필드(isMarketMode + isConverted 한정 spread). **Phase1: 3필드(isSelfBuilt·buildingType·constructionDate) 매핑** — extensionFloorArea는 Phase2(extension disabled로 Phase1엔 값이 채워지지 않음, UI 설계 §13 기준). 타입(①)은 4필드 선언, 매핑(④⑬)은 3필드 |
| ⑤ UI위젯 | `components/calc/inheritance/estate-card/variants/BurdenedGiftValuationModeSection.tsx:217` | `!isLandType && isMarketMode && isConverted` 게이트 → `isSelfBuilt` ToggleCard(amber) + `buildingType` RadioCardGroup(new만; extension disabled) + `constructionDate` DateInput |
| ⑥ 사이드바 | — | 해당없음 (증여세 사이드바는 본세만) |
| ⑦ 결과카드 | `components/calc/results/BurdenedTransferTaxResultCard.tsx` Row sub-component(`:63`~) | `result.penaltyTax > 0` Row 삽입 (결정세액↔지방소득세 사이) + 산식 `건물 환산취득가 ${formatKRW(result.penaltyBase)} × 5%` + 지방소득세 base 정합 주석(D-8) |
| ⑧ validate | `components/calc/gift-tax-form-shared.tsx:246,302-322` | `isMarketMode && isConverted && !isLandType && isSelfBuilt===true` 시: `buildingType` 미선택 차단·`constructionDate` 필수 차단·**`item.standardPrice>0` 필수 차단 (Finding 5/mustFix 2 — 현행 `:318` land-only `landStdPriceAtTransfer` 검사와 대칭. 검증 필드는 `item.standardPrice`(양도시 건물 기준시가)이며 `bgt.buildingStdPriceAtTransfer`는 타입에 부재. 미입력 시 `buildingAcquisitionPrice=0`→penaltyBase=0→penalty 침묵 0. 근거 소령 §176의2②2호)** |
| ⑨ Zod enum | `lib/api/transfer-tax-schema.ts:175-178` | **0건** — propertyBaseShape에 이미 존재 |
| ⑩ Zod 컴패니언 | 동상 | **0건** — 신규 enum 없음 |
| ⑪ acqDate fallback | — | **0건** — 신축 무관 |
| ⑫ Zod 입력객체 | `lib/api/transfer-tax-schema.ts:175-178` | **0건** — body 최상위 배치로 propertyBaseShape spread 수용 |
| ⑬ body spread | `lib/calc/gift-burdened-transfer-api.ts:177-218` (=④ 동일 위치) | 명시 매핑 추가(spread 아님 → TS 미감지·침묵 strip 위험. **grep 자가점검 필수**) |
| ⑭ Route 매핑 | `app/api/calc/transfer/route.ts:268-271` | **0건** — 이미 4필드 매핑 |

**★ ⑬(body) 함정**: `gift-burdened-transfer-api.ts`는 명시 매핑(spread 아님). 신규 4필드 누락 시
TS 미감지·침묵 strip → 엔진 미도달. grep 자가점검:
```bash
grep -n "isSelfBuilt\|buildingType\|constructionDate\|extensionFloorArea" \
  /Users/mynote/workspace/Property-related-Taxes/lib/calc/gift-burdened-transfer-api.ts
```
결과가 4필드 모두 존재해야 완료.

**★ D-2 활성화는 ⑬ body로 해결 불가**: `usedEstimatedAcquisition`/`estimatedBase`는
Zod·route handler 엔진 매핑에 미정의 → body 전송해도 strip. 진짜 활성화는 finalize 결선(D-2)만.
⑬은 신축 게이트 4필드(isSelfBuilt 등) 누락 방지 용도로만 한정.

### D-8. ⑦ 지방소득세 base 정합 표시

`BurdenedTransferTaxResultCard`의 지방소득세 행은 `result.localIncomeTax`를 표시하되,
penalty Row를 결정세액↔지방소득세 사이에 삽입할 때 사용자가 `determinedTax × 10%`와
불일치한다고 오인하지 않도록 다음 중 1가지 적용:
- (a) penalty Row 직후 "지방소득세 = (결정세액 + 환산가액적용가산세) × 10%" 주석/툴팁, 또는
- (b) "총결정세액(결정세액 + 환산가액적용가산세)" 중간 행 추가

Do 시 (a)를 우선 검토, 코드 최소 변경으로 충분하면 (a)로 확정(Simplicity First).

---

## Silent fallback / 자동 안분 후보 식별

| 위치 | 위험 | 처리 |
|---|---|---|
| `constructionDate` 미입력 | 침묵 null → `addYears(null, 5)` 오동작 | ⑧ validate 차단: isSelfBuilt=true + isConverted 시 필수 |
| `buildingType` 미선택 | 증축 발동 시 과대 부과 | ⑧ validate 차단: isSelfBuilt=true 시 buildingType 선택 필수. extension disabled로 2중 차단 |
| `extensionFloorArea` 미입력 | Phase1 UI 미노출이므로 undefined → 0 → rate-calc.ts:69 게이트 통과 | Phase1 신축만 UI 노출이므로 문제 없음. 방어적으로 extension 비활성 |
| `isSelfBuilt=false`(기본)에서 자동 발동 | OFF 상태에서 발동 | `isSelfBuilt` false 기본값 → rate-calc.ts:55 게이트가 null 반환. 자동 fallback 불발 |
| penalty base에 토지분 합산 | 과대 부과 | `perAsset.building.acquisitionPrice`만(토지 `:448` 제외). 이중 floor 금지(D-6). |
| **K-5 건물 양도시 기준시가(분모) 미입력** (Finding 5 / mustFix 2) | 엔진 측 `buildingStdPriceAtTransfer`(BurdenedGiftInfo)는 `item.standardPrice`에서 wiring(`gift-burdened-transfer-api.ts:99·:164`) → `item.standardPrice=0`이면 `burdened-gift-apportionment.ts:318-321`에서 `buildingAcquisitionPrice=0` → penaltyBase=0 → `penalty=floor(0×0.05)=0` 침묵 미발동 | ⑧ validate 차단: `isMarketMode && isConverted && !isLandType && isSelfBuilt===true` 시 **`item.standardPrice>0` 필수**(현행 `:318` land-only `landStdPriceAtTransfer` 검사와 대칭). **검증 필드는 `item.standardPrice` — `bgt.buildingStdPriceAtTransfer`는 타입 부재**. 자동 안분 fallback 금지 정책상 미입력은 검증 오류로 차단. 근거 소령 §176의2②2호 |

---

## Anchor 기대값

### anchor-1: 부담부증여 K-5 신축 건물 5% 가산세 발동 (핵심 — 가장 먼저 실행)

**파일**: `__tests__/tax-engine/transfer/burdened-gift-penalty.test.ts` (신설)

단계 1 — 현행 실패 확보:
```
입력: transferType="burdened_gift", propertyType="building"
      burdenedGiftInfo.acquisitionMethod="converted"
      isSelfBuilt=true, buildingType="new"
      constructionDate=2021-01-01, transferDate=2025-01-01 (4년 이내)
      채무액·기준시가 설정

현행 기대: result.penaltyTax === 0  (미발동 실증)
```

단계 2 — step override만 적용 시 여전히 0 확인:
```
step.ts override 수정 후(finalize 결선 미적용):
기대: result.penaltyTax === 0  (D-2 실측 — step 단독 미작동)
```

단계 3 — finalize 결선 후 발동 확인:
```
finalize.ts:313-314 input→effectiveInput 적용 후:
기대: result.penaltyTax === applyRate(perAsset.building.acquisitionPrice, 0.05)
      result.penaltyTax > 0
      result.penaltyBase === perAsset.building.acquisitionPrice  (토지 미포함)
      result.localIncomeTax === applyRate(result.determinedTax + result.penaltyTax, 0.1)
      result.totalTax === result.determinedTax + result.penaltyTax + result.localIncomeTax + …
```

### anchor-2: 5년 초과 미발동 + land 무관 + 양도차익 ≤ 0 zero-tax 발동

```
케이스 A: constructionDate=2019-01-01, transferDate=2025-01-01 (6년 초과)
기대: result.penaltyTax === 0  (rate-calc.ts:77-78 게이트)

케이스 B: propertyType="land", K-5 모드, isSelfBuilt=true (비현실 방어 케이스)
기대: result.penaltyTax === 0  (토지는 §114조의2 대상 아님)

케이스 C (Finding 2 + residual low — §114조의2② zero-tax): 부담부증여 K-5 신축 + 환산취득가가
        양도가보다 높아 transferGain ≤ 0 (손실/0), 5년 이내
구체 수치 예(원단위 toBe 고정용 — Do 중 안분 결과로 정밀 확정):
   양도가액(채무액분) 90,000,000 < 환산취득가(채무액분) 100,000,000 → transferGain = -10,000,000 (≤0)
   perAsset.building.acquisitionPrice = 100,000,000 (전액 건물·토지 없음 단일슬롯)
기대: result.transferGain ≤ 0 (조기반환 경로 `transfer-tax.ts:385-404` 진입)
      result.penaltyTax === applyRate(100_000_000, 0.05) === 5_000_000 > 0
      (조기반환 경로 결선 후 — §114조의2② 산출세액 없어도 부과)
      ※ D-2 finalize 결선만 적용하고 조기반환 경로(pb0) 미결선 시 이 케이스는 0(회귀 실증용 단계)

케이스 C' (동치 — 양도차익>0 & 산출세액=0): 양도차익은 양수이나 장기보유공제·기본공제 등으로
        산출세액(determinedTax)=0인 케이스도 §114조의2②로 동일하게 가산세 부과.
기대: result.penaltyTax > 0 (산출세액 0이어도 부과)
```

### anchor-3: general_building (B경로) 건물카드 발동

```
입력: propertyType="general_building", transferType="burdened_gift"
      buildingAcquisitionCause="newConstruction"
      K-5 환산 모드, transferDate=2025-01-01, constructionDate=2022-01-01

기대: aggregate result.penaltyTax > 0
      base = 건물카드 estimatedBase (= breakdown.perAsset.building.acquisitionPrice)
      토지카드 penaltyBase = 0
```

**anchor-3 회귀 케이스 (Finding 1 — B경로 게이트 보강 검증)**:
```
케이스 C-6b: 비-부담부 actualPriceMode general_building + newConstruction(isSelfBuilt=true)
기대: result.penaltyTax === 0  (실지취득가 §97①1호가목 → §114의2 비대상, 실지가 가산세 오부과 방지)

케이스 C-6a: 부담부증여 general_building + K-4 실지 + 신축
기대: result.penaltyTax === 0  (K-4=§97①1호가목, 환산 아님 → 미발동)
```

### anchor-4: 일반 양도세 회귀

```
케이스: 부담부증여 아닌 일반 양도세 + 신축 + K-5 + 5년 이내
기대: 기존 penaltyTax 불변 (finalize input→effectiveInput 변경 무영향 — effectiveInput===input)
```

### anchor-5: 증여세 탭 route 통합 (penalty 포함 response)

```
입력: 증여세 탭 시가 모드 + K-5 + housing + isSelfBuilt=true + constructionDate=T(5년 이내)
기대: POST /api/calc/transfer → result.penaltyTax > 0
      penaltyBase === perAsset.building.acquisitionPrice
```

---

## 법령 상수 (`lib/tax-engine/legal-codes/transfer.ts`) — ★ 기존 상수 재사용 (residual low — 신규 SCOPE OUT)

**신규 상수 추가 SCOPE OUT (Simplicity First).** §114조의2 penalty step의 legalBasis는 **기존 `TRANSFER.BUILDING_PENALTY`**(`legal-codes/transfer.ts:250` = `"소득세법 §114조의2"`, KoreanLaw MST 285523 자구 일치)를 그대로 재사용한다. 지방소득세 step은 기존 `TRANSFER.LOCAL_INCOME_TAX`(`:204` = `"지방세법 §103의3"`)를 재사용. 실제 사용처도 이미 기존 상수를 쓴다 — `transfer-tax.ts:396`(`legalBasis: TRANSFER.BUILDING_PENALTY`)·`:401`(`TRANSFER.LOCAL_INCOME_TAX`)·`rate-calc.ts`·`finalize.ts` penalty step.

> 항·호 세분 상수(§114조의2①/②)·`BURDENED_GIFT_PENALTY_BASIS` 등 신규 4상수는 **추가하지 않는다**(speculative). 만약 후속에서 추가가 정말 필요해지면 그 시점에 **사용처 file:line을 명시**하여 도입한다(미사용 상수 금지).

---

## 테스트 약속

### 단위 엔진 테스트

**파일**: `__tests__/tax-engine/transfer/burdened-gift-penalty.test.ts` (신설)

- anchor-1·2·3: 위 anchor 기대값 기준 `toBe()` (원단위 정확, `feedback_pdf_example_test_anchoring`)
- C-1~C-11 케이스 매트릭스 전수
- `calculateBuildingPenalty` 직접 호출: null 반환 케이스(isSelfBuilt=false/K-4/5년초과/land)
- 이중 floor 검증: `penaltyBase`가 안분 후 1회 floor된 값과 일치

### 통합 테스트 (route)

- 양도세 route: 부담부증여 + 매매취득 + 신축 + K-5 → `penaltyTax > 0`, `totalTax` 반영
- general_building route: B경로 aggregate penalty

### E2E

**양도세 탭**: `e2e/transfer-burdened-gift-penalty.spec.ts` (신설)
- 부담부증여 → 매매취득 → 신축 토글 ON → buildingType new → constructionDate → K-5 → 계산 → `TransferTaxResultView` 가산세 Row 표시

**증여세 탭**: `e2e/gift-burdened-transfer-penalty.spec.ts` (신설)
- 부담부증여 자산 모달 → K-5 시가모드 → 신축 위젯 ON → constructionDate → 계산 → `BurdenedTransferTaxResultCard` 가산세 Row 표시
- E2E 함정: 모달 닫기(backdrop)·자산명 필수·getByLabel 오매칭(textbox role 한정) — `project_stock_item_table_modal_plan` 패턴

---

## 리스크·함정

| 리스크 | 관련 정책 | 대응 |
|---|---|---|
| step override 단독으로 penalty 미발동 | D-2 — finalize:313-314 원본 input 참조 | finalize 결선(D-2)을 step override와 동시 적용. anchor-1 단계 2로 step 단독=0 실측 확보 |
| finalize input→effectiveInput 변경 → 일반 양도세 회귀 | aggregate 경로는 effectiveInput===input | anchor-4 회귀 확인 + 전체 vitest |
| ③ normalize Date 침묵 함정 | `feedback_engine_result_map_json_loss` 류 | `normalize-restored-form-dates.ts`에 `toOptionalDate(bgt.constructionDate)` 반드시 추가 |
| ⑬ 명시 매핑 누락 (TS 미감지·침묵 strip) | `feedback_explicit_prop_mapping_strip` | grep 4필드 자가점검 |
| 증축 base 과대 (건물 전체 vs 증축부분) | D-7 | Phase1 신축만 `buildingType="new"` RadioCard. extension disabled 2중 차단 |
| 이중 floor | `feedback_floor_residual_absorption` / D-6 | base 재차 채무비율 곱 금지. `perAsset.building.acquisitionPrice`가 이미 안분 후 |
| auto fallback 금지 | `feedback_no_silent_apportion_fallback` | ⑧ validate: isSelfBuilt=true + isConverted 시 buildingType·constructionDate 미입력 차단 |
| useEffect store 미러링 금지 | `feedback_useeffect_store_mirror_forbidden` | isSelfBuilt OFF 시 constructionDate clear 등은 onChange `set()`. display fallback prop. useEffect 금지 |
| 양도세 결과뷰 penalty Row selector 오인 | plan §6.2 ⑦ 확정 | 양도세 탭은 `TransferTaxResultView` 기존 Row 경유(실측 확인 완료, 신규 0건) |
| 지방소득세 base 불일치 오인 | D-8 | penalty Row 인접에 "지방소득세 = (결정세액 + 가산세) × 10%" 명시 |

---

## 작업 순서 (Do — 시퀀셜)

```
1. ★ anchor-1 작성·실행 → verify: penaltyTax===0 현행 실패 확보
   → step override만 적용 시 여전히 0 확인 (D-2 실측 고정)
2. 엔진 공통 (finalize D-2 결선 + 조기반환 경로 + step.ts A경로):
   - finalize.ts:313-314 input → effectiveInput (단일안 (a))
   - **transfer-tax.ts:386-388 `pb0` 조기반환 경로 input → effectiveInput + usedEstimatedAcquisition 포함 (Finding 2)**
   - step.ts:50-59 override 확장 (isSelfBuilt/buildingType/constructionDate/usedEstimatedAcquisition/estimatedBase/acquisitionMethod)
   → verify: anchor-1 단계3 penaltyTax>0, anchor-4 일반 양도세 회귀 0
3. anchor-2·3 작성·실행 → verify: 5년초과·land=0, general_building>0
4. 엔진 B경로 (general-building-route-helper 건물카드 mirror)
   → verify: anchor-3 통과
5. 증여세 ① 폼타입 4필드 → verify: tsc 0
6. 증여세 ② initial + ③ normalize → verify: grep toOptionalDate constructionDate
7. 증여세 ④⑬ API변환 (body 최상위 4필드) → verify: grep 4필드 + tsc 0
8. 증여세 ⑤ UI위젯 (!isLandType+isConverted+isSelfBuilt) → verify: 렌더 확인
9. 증여세 ⑧ validate (buildingType·constructionDate·**`item.standardPrice>0`**(mustFix 2 — `bgt.buildingStdPriceAtTransfer` 부재) 차단) → verify: 신축 ON + 미입력 차단 / UI통과↔validate 모순 없음
10. 증여세 ⑦ 결과카드 penalty Row + D-8 지방소득세 정합 표시 → verify: penaltyTax>0 Row 표시
11. E2E 양 탭 작성·실행 → verify: 두 spec 통과
12. npx tsc --noEmit / npx vitest run __tests__/tax-engine/transfer/ / npm test 전체 → verify: 0건·통과
13. 14지점 ⑫⑬⑭ grep 자가점검 → verify: 누락 0
```

---

## SCOPE OUT

- **(b) FinalizeArgs 전용 base 주입안**: 신규 필드 + 호출부 주입 + finalize 분기 추가로 코드 과다. Simplicity First.
- **증축(extension) 부분 한정 base**: "증축한 부분에 한정한다"(§114조의2①) 미구현 → 증축 발동 시 과대 부과. Phase1 신축만.
- **B경로 `buildingType`/`extensionFloorArea` 전파**: `AssetCardForAggregate`·`cardToItemInput` 매핑에 미전파. Phase1 신축만이라 무해. 후속.
- **감정가액(`appraisal`) 경로**: 증여세 부담부증여는 K-4/K-5만(appraisal enum 없음). 2020.1.1 게이트 비경유.
- **2020.1.1 증축 시행일 부칙 재검증**: 증축 Phase1 SCOPE OUT → 후속 PR에서 KoreanLaw 연혁 MST로 검증.
- **echo 필드**: `penaltyTax`·`penaltyBase` 이미 `TransferTaxResult`에 노출되어 있어 별도 echo 불요.
- **이력 자동저장·PDF 별지 서식 penalty 칸**: 결과카드 표시까지만. 신고서 칸 반영 후속.
- **§159① 안분 계산식 원문 수식 검증**: 엔진 기구현이라 base 선택만 결선(§2.2 확인필요). 영향 없음.

---

## UI 통합 위임

- 엔진 시니어(`transfer-tax-senior`): ①②③④⑧(증여세 측) + 엔진 A·B경로 + finalize 결선
- UI 시니어(`inheritance-gift-tax-ui-senior`): ⑤⑦(증여세 측) 컴포넌트 구현
  - `BurdenedGiftValuationModeSection.tsx` 신축 위젯 추가 (`SelfBuiltSection` 패턴 차용)
  - `BurdenedTransferTaxResultCard.tsx` penalty Row + D-8 지방소득세 정합 표시
- 양도세 UI 측(`transfer-tax-ui-senior`): 신규 0건 (기존 `TransferTaxResultView` 가산세 Row 경유 확인 완료)

---

## ★ 자가 점검 체크리스트 (완료 보고 전)

- [ ] anchor-1 단계1·2·3 모두 통과 (0→0→>0 순서 확인)
- [ ] `finalize.ts:313-314` `input` → `effectiveInput` 변경 확인 (`input.` 잔존 0건)
- [ ] `transfer-tax.ts:386-388` `pb0` 조기반환 경로 `input` → `effectiveInput` 변경 확인 (Finding 2 — §114조의2② zero-tax)
- [ ] anchor-2 케이스 C(transferGain ≤ 0) penaltyTax>0 통과
- [ ] `burdened-gift-step.ts` override에 `usedEstimatedAcquisition:true`+`estimatedBase` 설정 확인
- [ ] `general-building-route-helper.ts` B경로 mustFix 3 확인: (1) `GeneralBuildingActualPricePayload`(`:34-61`) self-built 4필드 추가 (2) 디스패처 `actualPriceMode`(`:301-322`) forward (3) `calculateGeneralBuildingActualTransfer`(`:413`) 내부 `isSelfBuilt` 도출 + 건물카드(`:538-543`) `usedEstimatedAcquisition:false` 제거(K-5+breakdown+isSelfBuilt 3중 AND)
- [ ] ③ normalize `toOptionalDate(bgt.constructionDate)` grep 확인
- [ ] ⑬ grep: `gift-burdened-transfer-api.ts`에 isSelfBuilt·buildingType·constructionDate 존재 (extensionFloorArea는 Phase2 — UI 설계 §13 기준 Phase1 미매핑)
- [ ] ⑧ validate: `isSelfBuilt=true + isConverted + !isLandType` 시 buildingType·constructionDate·**`item.standardPrice(>0)`**(mustFix 2 — `bgt.buildingStdPriceAtTransfer` 타입 부재) 차단, `isLandType=true` 시 위젯 미노출 연동
- [ ] `npx tsc --noEmit` 0건
- [ ] `npx vitest run __tests__/tax-engine/transfer/` 통과
- [ ] 3대 핵심 정책(useEffect 금지·자동 fallback 금지·validation 8번째 동기화) 위반 없음
