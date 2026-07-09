# §114조의2 Phase 2 계획서 — 증축(extension) + 일반건물(general_building) · 양도세·증여세 양 탭

> **선행**: Phase 1 PR#316(`1d65c74e`) — 신축 K-5 환산 5% 가산세, 증여세 탭.
> 선행 문서: [`burdened-gift-114-2-penalty.plan.md`](./burdened-gift-114-2-penalty.plan.md) · `.engine.design.md` · `.ui.design.md`
> **작업 브랜치**: `feat/gift-burdened-114-2-phase2` (격리 worktree, slot 1 · DEV 3001 / E2E 3101)
> **분기 base**: origin/master `e75e8f22` (PR#317 머지 포함)
>
> **검증 기준(강제)**: 본 문서의 모든 `file:line`·현행 동작은 6-에이전트 병렬 검증(2026-06-21, base `e75e8f22`) **실측**. 미검증 항목은 "🔍 확인 필요"로 명시. 추정·"현행 일치 예상" 금지.

---

## 0. 사용자 확정 결정 (2026-06-21)

| # | 결정 항목 | 선택 | 영향 |
|---|---|---|---|
| D-1 | general_building 부담부증여 §114의2 범위 | **증여세 탭에도 general_building 카테고리 신설** | 양 탭 완전 동등. 증여 `EstateItem.category` enum + 14지점 + 신규 UI variant (대규모, 별도 PR 권장) |
| D-2 | 증축 가산세 base 산출 방식 | **증축부분 별도 입력 (정밀)** | §114의2① "증축한 부분에 한정한 환산취득가" 법문 정합. 증축부분 기준시가 입력 필드 신설. 면적비율 안분(간이) 미채택 |

---

## 1. 법령 근거 (KoreanLaw MST285523 검증 완료)

소득세법 **§114조의2①** 원문 (법제처, 행위시법 확인):

> "거주자가 건물을 **신축 또는 증축**(증축의 경우 바닥면적 합계가 **85제곱미터를 초과**하는 경우에 한정한다)하고 그 건물의 취득일 또는 증축일부터 **5년 이내**에 해당 건물을 양도하는 경우로서 **제97조제1항제1호나목**에 따른 **감정가액 또는 환산취득가액**을 그 취득가액으로 하는 경우에는 해당 건물의 감정가액(**증축의 경우 증축한 부분에 한정한다**) 또는 환산취득가액(**증축의 경우 증축한 부분에 한정한다**)의 **100분의 5**에 해당하는 금액을 … 양도소득 결정세액에 더한다.
> ② 제1항은 … 양도소득 **산출세액이 없는 경우에도 적용**한다."

법문 확정 사항(해석 아님 — 괄호 직접 명시):
1. **신축 = 건물 전체** 환산취득가 × 5% / **증축 = 증축한 부분에 한정**한 환산취득가 × 5%
2. **증축만 85㎡ 초과** 게이트 (신축은 면적 무관)
3. 적용 대상 = **§114조의2① 본문 감정가액·환산취득가액만**(§97①1호나목 = "매매사례가액·감정가액·환산취득가액"이나, §114조의2①은 그중 **감정가액·환산취득가액만** 명시 → **매매사례가액 salesCase 제외**) → K-5 환산·K-감정 발동 / **K-4 실지(가목) 미적용** / **매매사례가액(salesCase) 미적용**. (현행 엔진 `transfer-tax-rate-calc.ts:62-65`는 `estimated`/`appraisal`만 통과 → salesCase 자동 배제. 부담부증여 경로는 converted/actual/standard만 노출하여 numeric 영향 없음 — 매트릭스 전수성 측면 명시.)
4. 취득일·증축일부터 **5년 이내** 양도
5. ② **산출세액 0이어도 부과** (양도차익 ≤ 0인 부담부증여 경로 포함)
6. 환산취득가액 산식: **§176의2②2호** (양도가액 × 취득당시 기준시가 ÷ 양도당시 기준시가)
7. **시행일 게이트**: 현행 엔진은 신축 `transferDate<2018-01-01 return null`(`transfer-tax-rate-calc.ts:60`)·증축 `transferDate<2020-01-01 return null`(`:68`)을 사용. 두 일자가 §114조의2 신설(신축)·증축확대 개정의 **부칙(시행일·적용례)**에 정합하는지 본칙만으로는 확정 불가. **현행 게이트값 유지 + 🔍 부칙 시행일 미검증·확인 필요** — 연혁 API 미응답으로 KoreanLaw eflaw 재조회를 공통 후속과제로 등록. 현행 구현값이 부칙 정합임을 증명 못 함 명시. 단정 금지.

---

## 2. Phase 2 범위 — 2 feature × 2 tab 매트릭스

| Feature | 양도세 탭 | 증여세 탭 | 엔진 |
|---|---|---|---|
| **A. 증축(extension)** | building 자산 SelfBuiltSection 증축 UI 기존 존재(`SelfBuiltSection.tsx:60-102`) → 증축부분 기준시가 2필드만 추가 | real_estate_building K-5 증축 RadioCard 활성화 + 증축부분 입력 | **공통** — base 분리산출 신규 |
| **B. general_building** | 환산취득가 경로 카드 빌더(`general-building-valuation.ts:678-711`) 결선 + 증축은 사례 33(`general-building-extension.ts`) 기존 구현 보강 + UI 신축/증축 선택 위젯 신설 | **카테고리 신설**(enum+14지점+UI variant) | 환산 경로 카드 결선 (route handler 계층 — 실지/감정 경로 `calculateGeneralBuildingActualTransfer`는 §114조의2 비적용) |

**원칙**: Feature A(증축)는 엔진 공통 — **부담부증여(burdened_gift) 경로와 양도세 단독(비-부담부) 경로 양쪽에 적용**. (a) 확정: `transfer-tax.ts` + `transfer-tax-helpers.ts` 통상 converted 경로에도 증축부분 base 분리 로직을 추가하며, 부담부(`burdened-gift-apportionment.ts`)와 통상 경로가 동일 산식을 공용 헬퍼 `calcExtensionEstimatedBase`로 단일 소스화(dual-truth 금지). Feature B(general_building)는 경로가 탭별로 다름(양도세=B경로 aggregate / 증여=신규 카테고리) → 독립 작업.

---

## 3. 검증된 현행 상태 (base `e75e8f22` 실측)

### 3.1 이미 구현됨 — 재사용 (변경 불요)

| 항목 | file:line | 현행 | 검증 |
|---|---|---|---|
| `calculateBuildingPenalty` 신축·증축 게이트 | `lib/tax-engine/transfer-tax-rate-calc.ts:51-87` | `if buildingType==="extension" { if transferDate<2020-01-01 return null; if (extensionFloorArea ?? 0)<=85 return null }` + 5년 기산 + `applyRate(base,0.05)` | ✅ |
| 결선 ① step override (K-5 신축) | `lib/tax-engine/transfer-tax-burdened-gift-step.ts:54-72` | `isK5SelfBuilt` → `acquisitionMethod:"estimated"·usedEstimatedAcquisition:true·estimatedBase:building.acquisitionPrice` | ✅ |
| 결선 ② finalize penaltyBase 게이트 | `lib/tax-engine/transfer-tax-finalize.ts:313-324` | `isEstimatedMode` 3-OR(`effectiveInput.usedEstimatedAcquisition` 포함)·`effectiveEstimatedBase` fallback 체인·`calculateBuildingPenalty(effectiveInput, penaltyBase)` | ✅ |
| 결선 ③ transfer-tax 조기반환(§114의2②) | `lib/tax-engine/transfer-tax.ts:385-425` | `transferGain≤0` 시 `pb0` effectiveInput 인식 + 가산세/지방소득세 steps + `penaltyTax:pt0` | ✅ |
| 타입(양도) buildingType/extensionFloorArea/constructionDate | `lib/tax-engine/types/transfer.types.ts:259-264` | 3필드 모두 optional 선언 | ✅ |
| 타입(증여) 신축 4필드 | `lib/tax-engine/types/inheritance-gift-estate.types.ts:687-707` | `isSelfBuilt·buildingType·constructionDate·extensionFloorArea` | ✅ |
| Zod propertyBaseShape 신축 4필드 | `lib/api/transfer-tax-schema.ts:175-178` | `z.enum(["new","extension"])` 등 4필드 optional | ✅ |
| 결과뷰 penalty Row (양 탭 공용) | `components/calc/results/BurdenedTransferTaxResultCard.tsx:136-142` | `result.penaltyTax>0` 시 "신축·증축 가산세 (§114조의2…)" Row | ✅ |
| 증여 14지점 신축 매핑 | `lib/calc/gift-burdened-transfer-api.ts:219-234`(④⑬) · `BurdenedGiftTransferSection.tsx:56-96`(①②) · `normalize-restored-form-dates.ts:83-93`(③) · `gift-tax-form-shared.tsx:338-343`(⑧) | 신축 4필드 게이트 전송·createEmpty·hasData·normalize·validation | ✅ |
| 증여 UI 신축 토글/증축 disabled | `BurdenedGiftValuationModeSection.tsx:266-314` | `bg-self-built` ToggleCard + `bg-building-type` RadioCard(**extension `disabled:true`**) + 전환 시 초기화(77-82·148-154·274-283) | ✅ |
| **general_building 증축 §114조의2 (사례 33)** | `lib/tax-engine/general-building-extension.ts:343·352·358·359` | 헤더(`:19`) "§114조의2① 건물2 가산세". 건물2 카드에 `isSelfBuilt`(`:343` `extensionAcquisitionCause==='newConstruction'`)·`estimatedBase:building2Acq`(증축분, `:352`)·`buildingAcquisitionDate:ext.extensionDate`(5년 기산점, `:359`) 설정. `transfer-tax-aggregate.ts`의 `spread(...item)`로 카드 필드가 엔진 input 전달 → penalty 발동 | ✅ (단 건물2 카드에 `buildingType`/`extensionFloorArea` 미설정 → 85㎡ 게이트 미적용 의심: 3.2 갭 참조) |
| 양도세 building 자산 증축 UI (신축·증축 구분 + extensionFloorArea) | `components/calc/transfer/SelfBuiltSection.tsx:60-102` | `['new','extension']` 구분 버튼(`:60-74`) + `buildingType==='extension'` 시 "증축 부분 바닥면적(㎡)" input(`:86-101`). `CompanionAcqPurchaseBlock.tsx:673-689`가 housing/building에 렌더 | ✅ (증축 base용 기준시가 2필드만 추가 필요) |

### 3.2 Phase 2 실제 갭

| 갭 | file:line | 현행 문제 | Feature |
|---|---|---|---|
| **증축부분 한정 base 미구현** | `lib/tax-engine/burdened-gift-apportionment.ts:309-321` | base = `perAsset.building.acquisitionPrice`(건물 **전체** 환산취득가) → 증축 발동 시 과대부과 | A |
| step override 신호 전달 | `transfer-tax-burdened-gift-step.ts:54-72` | **✅ P2-1 Pre-Do 실증(2026-06-21)**: `...workingInput` spread가 `rawInput`의 `buildingType`·`extensionFloorArea` 보존 → `effectiveInput`까지 passthrough 작동 확정. **핵심 갭은 신호 도달이 아니라 base 값 교체(건물전체→증축부분)뿐**. 명시 전달은 선택적 안전 강화 | A |
| 증여 증축 RadioCard disabled | `BurdenedGiftValuationModeSection.tsx:310` | `disabled:true` → 증축 입력 차단 | A |
| 증여 증축 validation 미구현 | `gift-tax-form-shared.tsx:342` | `// TODO(Phase 2 증축): extensionFloorArea>0 필수 차단 추가` | A |
| 증여 hasData에 extensionFloorArea 누락 | `BurdenedGiftTransferSection.tsx:88-96` | `hasData`가 `isSelfBuilt===true \|\| constructionDate`만 체크 | A |
| 양도세 general_building **신축** UI 입력 부재(엔진은 발동) | `CompanionAcqPurchaseBlock.tsx:673-689` | `(assetKind==="housing"\|\|"building")`만 SelfBuiltSection → **general_building 제외**. 단 **엔진은 미발동 아님**: A경로 환산 카드 빌더 `general-building-valuation.ts:685-691`가 신축 시 이미 `usedEstimatedAcquisition:true·estimatedBase:acquisition.building·isSelfBuilt` 설정. 진짜 갭은 `buildingAcquisitionCause='newConstruction'` 선택 위젯(UI)뿐 | B |
| 양도세 general_building 부담부 메시지 | `GeneralBuildingBlock.tsx:260-276` | `isBurdenedGift` 시 "§159 자동산정…방식 선택 불필요" — 신축 위젯 없음 | B |
| B경로(실지/감정) payload 신축필드 부재 | `app/api/calc/transfer/general-building-route-helper.ts:34-61` (route handler 계층, lib/tax-engine 아님) | `GeneralBuildingActualPricePayload`에 isSelfBuilt/buildingType/constructionDate 없음 | B |
| B경로(실지/감정) 디스패처 신축필드 미전달 | `app/api/calc/transfer/general-building-route-helper.ts:301-325` | `actualPriceMode=true` 시 burdenedGiftInfo만 전달 | B |
| B경로(실지/감정) 건물카드 하드코딩 | `app/api/calc/transfer/general-building-route-helper.ts:538-543` | `usedEstimatedAcquisition:false·estimatedBase:0` → 가산세 base=0. **단 이 경로는 §97①1호가목(실지) → §114조의2 법적 비적용. 감정(나목)만 별도 검토 필요** | B |
| 증여 general_building 카테고리 부재 | `gift-burdened-transfer-api.ts:38-46`(resolvePropertyType) · `BurdenedGiftTransferSection.tsx:127-132` | `category`에 general_building 없음(land/housing/building만) | B |
| **general_building 증축(사례 33) 건물2 카드 85㎡ 게이트 미적용 의심** | `lib/tax-engine/general-building-extension.ts:344-361` | 건물2 카드에 `buildingType`/`extensionFloorArea` 미설정 → `calculateBuildingPenalty`의 증축 85㎡ 게이트(`transfer-tax-rate-calc.ts:67-69`)가 `buildingType!=='extension'` → 신축 분기로 처리될 가능성. **base(증축분)·5년 기산은 이미 정확**(3.1 참조). 진짜 갭은 면적 게이트뿐 — Read 후 실측 확정 | B |

**핵심 경로 사실(검증, 정정)**: general_building은 두 함수로 분리(둘 다 `app/api/calc/transfer/general-building-route-helper.ts` — route handler 계층, lib/tax-engine 아님):
- **A경로 = 환산취득가 모드** `calculateGeneralBuildingTransfer`(`:360`, 주석 "경로 A: 환산취득가 모드" `:351`) → 카드 생성은 `general-building-valuation.ts:678-711`. **§114조의2 적용 대상**(§97①1호나목 환산취득가). 신축은 `general-building-valuation.ts:685-691`에서 `usedEstimatedAcquisition:true·estimatedBase:acquisition.building·isSelfBuilt`(:673 `buildingAcquisitionCause==='newConstruction'`)를 **이미** 설정 → 현행 발동.
- **B경로 = 실거래가/감정가 모드** `calculateGeneralBuildingActualTransfer`(`:413`, 주석 "경로 B: 실거래가/감정가 모드" `:405`). 실지(actual)는 §97①1호**가목** → **§114조의2 법적 비적용**. 감정가액(appraisal)은 나목 포함 → 적용 대상이나 별도 분기 검토 필요.

⚠️ **B-1 편집 대상 정정**(아래 5.B-1 참조): §114조의2 신호는 **실지 경로(`calculateGeneralBuildingActualTransfer`)가 아니라 환산취득가 경로 카드 빌더(`general-building-valuation.ts:678-711`)**에 심어야 한다. 실지 카드에 신호를 심어도 `calculateBuildingPenalty`(`transfer-tax-rate-calc.ts:62-65`)가 `method==='actual'`에서 null → 가산세 0이거나, 강제 estimated 전환 시 법적 근거 없는 환산 가산세 부과가 된다.

aggregate 흐름(공통): 두 경로 모두 `calculateTransferTaxAggregate` 직접 호출 → 자산별 `calculateTransferTax` 건별 → 단건 엔진 → finalize. 따라서 **환산 카드에 신축/증축 신호가 있으면** 결선 ②③(finalize/transfer-tax)는 자동 발동.

---

## 4. Feature A — 증축(extension) · 엔진 공통 → 양 탭

### A-1. 엔진: 증축부분 한정 base 분리산출 (D-2 정밀 방식)

**법문**: 증축 base = 증축한 부분에 한정한 환산취득가액. 환산취득가(§176의2②2호) = 양도가액 × (취득당시 기준시가 ÷ 양도당시 기준시가).

**신규 입력 필드 후보** (증여 `BurdenedGiftTransferTaxInput` / 양도 `TransferTaxInput` 공통 의미):

| 필드 | 단위 | 의미 | 비고 |
|---|---|---|---|
| `extensionFloorArea` | ㎡ | 증축 바닥면적 합계 | **기존 존재** — 85㎡ 게이트 |
| `extensionStdPriceAtAcquisition` | 원 | 증축부분 **취득(증축완공)당시** 기준시가 | 신규 **(기본안: 단일 추가 필드)** |
| `extensionStdPriceAtTransfer` | 원 | 증축부분 **양도당시** 기준시가 | **조건부 신규** — 산식 상쇄 시 삭제(아래 기본안 참조) |

**산식 후보 (🔍 plan-design-self-review-loop에서 engine-senior + KoreanLaw §176의2②2호로 최종 검증)**:

```
증축부분 환산취득가 = 증축부분 양도가액 × (extensionStdPriceAtAcquisition ÷ extensionStdPriceAtTransfer)
   where 증축부분 양도가액 = 채무안분 건물양도가 × (extensionStdPriceAtTransfer ÷ 건물전체 양도기준시가)
가산세 = 증축부분 환산취득가 × 5%
```

- **기본안 = 단일 입력 필드(`extensionStdPriceAtAcquisition`만)**: 위 식 전개 시 `extensionStdPriceAtTransfer`가 분자·분모에서 상쇄되어 `증축부분 환산취득가 = 채무안분 건물양도가 × (증축취득기준시가 ÷ 건물전체 양도기준시가)`로 단순화된다(신축 K-5가 이미 전체 양도가·전체 양도기준시가를 보유). 별도 `extensionStdPriceAtTransfer`를 명시 입력으로 두는 것은 단일사용 추상화이며 입력 부담·14지점·Zod·E2E 동기화 비용을 1필드분 증가시킨다. **plan-design-self-review-loop에서 KoreanLaw §176의2②2호로 상쇄를 먼저 확정**하고, 상쇄가 확인되면 `extensionStdPriceAtTransfer` 필드를 삭제하여 입력을 1필드로 최소화한다. (상쇄 미확인 시에 한해 2필드 유지 — 추정 단정 금지.)
- **삽입 위치**: `burdened-gift-apportionment.ts` K-5 분기(`:309-321`) 또는 그 직후. 신축(buildingType≠"extension")은 기존 `perAsset.building.acquisitionPrice` 유지, 증축만 별도 base 산출.
- **base 전달**: step override(`transfer-tax-burdened-gift-step.ts:66-72`)의 `estimatedBase`를 증축 시 위 값으로 교체.

**검증 기준(verify)**: 증축 anchor에서 가산세가 `증축부분 환산취득가 × 5%`와 일치(건물 전체 base × 5%보다 작음).

### A-2. 결선: step override가 buildingType/extensionFloorArea 명시 전달

- `transfer-tax-burdened-gift-step.ts:54-72` `isK5SelfBuilt` 블록. **✅ P2-1 Pre-Do 실증(2026-06-21)**: `workingInput`이 `rawInput` spread 파생이라 `buildingType`·`extensionFloorArea`가 이미 `effectiveInput`까지 흐름(passthrough 작동). 발동 자체엔 추가 작업 불요 — 핵심은 `estimatedBase`를 증축부분(`extensionEstimatedBase`)으로 **교체**하는 것. spread 의존 제거용 명시 추가(`buildingType`·`extensionFloorArea`·`extensionStdPriceAt*`)는 선택적 안전 강화.
- 신축(buildingType="new"/undefined)은 `calculateBuildingPenalty`의 extension 게이트를 통과하지 않으므로 현행 유지(회귀 0).

### A-3. rate-calc 게이트 (변경 불요, 정합 확인만)

`transfer-tax-rate-calc.ts:67-70`의 85㎡·2020·5년 게이트는 이미 정확. 🔍 확인 필요: 85㎡ 기준이 **증축부분 면적**(extensionFloorArea)임을 법령으로 재확인 — 현행 코드는 `extensionFloorArea`를 봄(전체면적 아님) → 법문 "증축의 경우 바닥면적 합계 85㎡ 초과"와 정합 추정, plan-design-self-review-loop에서 KoreanLaw 확정.

### A-4. 증여세 14지점 (증축 신규필드)

| 지점 | file | 변경 |
|---|---|---|
| ① 타입 | `inheritance-gift-estate.types.ts:687-707` | `extensionStdPriceAtAcquisition?·extensionStdPriceAtTransfer?` 추가 |
| ② createEmpty | `BurdenedGiftTransferSection.tsx:56-` | 신규 2필드 undefined |
| ② hasData | `BurdenedGiftTransferSection.tsx:88-96` | `extensionFloorArea`·증축 기준시가 조건 추가 |
| ③ normalize | `normalize-restored-form-dates.ts` | (Date 아님 → 금액 필드, 정규화 불요·확인) |
| ④⑬ body | `gift-burdened-transfer-api.ts:219-234` | extension 게이트(`buildingType==="extension"`) 시 신규 2필드 + extensionFloorArea 전송 |
| ⑤ UI | `BurdenedGiftValuationModeSection.tsx` | A-5 |
| ⑦ 결과 | `BurdenedTransferTaxResultCard.tsx:137-143` | **필수 수정**: penalty Row 라벨이 `:139`에 "신축·증축 가산세 (§114조의2 · 건물 환산취득가 × 5%)"로 하드코딩 — 증축 base는 "증축부분 환산취득가"(법문 §114조의2① "증축한 부분에 한정")라 산식 모순. result에 buildingType echo 노출(echo-field-pattern) 또는 penalty 분기에서 `buildingType==='extension'` → "증축부분 환산취득가 × 5%" / 신축 → "건물 환산취득가 × 5%" 라벨 분기. **양 탭 공용**(`GiftTaxResultView.tsx:575`도 사용) → 양 탭 영향. 결과 산식 한국어 정확성 규칙 준수 |
| ⑧ validate | `gift-tax-form-shared.tsx:342`(TODO) | `buildingType==="extension"` 시 `extensionFloorArea>0`·증축 기준시가 필수 차단 |
| ⑫ Zod | `transfer-tax-schema.ts:175-178` | 신규 2필드 `z.number().nonnegative().optional()` |

### A-5. 증여세 UI (extension RadioCard 활성화)

- `BurdenedGiftValuationModeSection.tsx:310` `disabled:true` 제거.
- `isSelfBuilt && buildingType==="extension"` 시 `constructionDate` 아래(`:327` 이후)에 추가:
  - `extensionFloorArea` — `DecimalInput`(parseDecimal, unit "㎡") [memory `feedback_decimal_input`]
  - `extensionStdPriceAtAcquisition`·`extensionStdPriceAtTransfer` — `CurrencyInput`(증축부분 기준시가, 원)
- 전환 초기화(`:77-82·148-154·274-283`)에 신규 2필드 포함.
- select-on-focus·hint(placeholder 숫자 금지) 공통 규칙 준수.

### A-6. 양도세(transfer) 탭 14지점 (증축 신규필드 — 부담부·비-부담부 양쪽 포함)

> **확정(검증 완료)**: SelfBuiltSection 증축 UI는 이미 존재(`SelfBuiltSection.tsx:60-102` — 신축/증축 구분 버튼 + extensionFloorArea input). 따라서 증축부분 기준시가 **2필드만 추가**(부재 분기 삭제). 양도세 측 신규 필드 `extensionStdPriceAtAcquisition`·`extensionStdPriceAtTransfer`는 침묵 strip(⑫⑬⑭) 위험이 있으므로 증여 A-4와 동일하게 전수 동기화한다.
>
> **(a) 확정 — 비-부담부 K-5 증축도 동일 엔진 필드 사용**: `transfer-tax.ts` + `transfer-tax-helpers.ts` 통상 converted 경로에 공용 헬퍼 `calcExtensionEstimatedBase` 호출 추가. 양 경로가 동일 산식·동일 필드를 읽으므로 14지점은 **부담부·비-부담부 공통 적용**이며 별도 분기 없음.

| 지점 | file:line | 변경 |
|---|---|---|
| ① AssetForm 타입 | `lib/stores/calc-wizard-asset.ts:278-284` (isSelfBuilt~extensionFloorArea 옆) · `calc-wizard-store.ts:69-72` | `extensionStdPriceAtAcquisition: string`·`extensionStdPriceAtTransfer: string` 추가 |
| ② 초기값 | `calc-wizard-asset-factory.ts:105-108` **AND** `calc-wizard-store.ts:185-188` (**2곳 모두**) | 신규 2필드 `''` |
| ④ API 변환 | `lib/calc/transfer-tax-api.ts:384-387` (extension 게이트) | `buildingType==="extension"` 시 `parseAmount`로 신규 2필드 전송 |
| ⑤ UI 위젯 | `SelfBuiltSection.tsx` | extension 시 "증축부분 취득당시/양도당시 기준시가" CurrencyInput 2개 props 추가 |
| ⑧ validation | `lib/calc/transfer-tax-validate.ts` | extension 시 두 기준시가 > 0 필수 (UI/API fallback ↔ validate 동기화) |
| ⑫ Zod | `lib/api/transfer-tax-schema.ts:178` 옆 | 신규 2필드 `z.number().nonnegative().optional()` |

- dual-truth 회피: 증여·양도 양 UI가 동일 엔진 필드(`extensionStdPriceAt*`)에 쓰기.

---

## 5. Feature B — general_building · 양 탭

### B-1. 양도세 general_building §114조의2 결선 (환산취득가 경로, 증축 위주)

> ⚠️ **편집 대상 정정(검증 완료)**: 종전 계획은 실지/감정 경로 `calculateGeneralBuildingActualTransfer`(`app/api/calc/transfer/general-building-route-helper.ts:413`)에 신호를 결선하려 했으나, 이는 §97①1호**가목(실지)** 경로로 §114조의2 **법적 비적용**(KoreanLaw MST285523 §114조의2① "나목" 한정 검증). 따라서 신축·증축 신호는 **환산취득가 경로 카드 빌더 `general-building-valuation.ts:678-711`**에 심어야 한다.
>
> ⚠️ **기존 구현 발견(검증 완료)**: general_building 증축 §114조의2는 이미 `lib/tax-engine/general-building-extension.ts`(사례 33)에 구현되어 있음 — 헤더 `:19`, 건물2 카드 `:343·352·358·359`. **Do 진입 전 이 모듈 + `__tests__/general-building-extension-case-33.test.ts` + `__tests__/general-building-case-34-burdened-gift.test.ts` Read 필수**(3.1·3.2 갭 참조). 신축은 `general-building-valuation.ts:685-691`이 이미 발동.

**실제 잔여 작업**(현행 실측 후 확정):

1. **신축**: `general-building-valuation.ts:685-691`이 이미 처리 → **변경 불요**(회귀 검증 대상, anchor P2-5/P2-7).
2. **증축(2-way 비증축 카드)**: A경로 카드 빌더 `general-building-valuation.ts:678-711`이 `buildingType`/`extensionFloorArea`/증축부분 base를 미설정 → 증축 시나리오에서 미발동. 단 별도 증축 케이스는 `general-building-extension.ts`(사례 33) 경로로 처리되므로, 양 경로의 책임 경계를 실측 후 결정.
3. **증축(사례 33 건물2 카드) 85㎡ 게이트**: `general-building-extension.ts:344-361`이 `buildingType`/`extensionFloorArea` 미설정 → 85㎡ 게이트 미적용 의심. base(증축분)·5년 기산은 정확. **이 두 필드만 추가**가 진짜 갭일 가능성 — Read 후 anchor로 확정.
   - **필드명 통일(engine.design.md 동일)**: general_building 증축 §114조의2 85㎡ 게이트 전용 UI 입력 필드명 = `extensionFloorArea85`. 기존 `extensionArea`(연면적 정보용, 산식 미사용)와 별도 필드. 카드 push 시 `extensionFloorArea: ext.extensionFloorArea85`로 엔진 penalty 함수에 전달. 🔍 UI 시니어 확정: "바닥면적 합계"와 "연면적" 일치 여부(법문 "바닥면적 합계"는 §114조의2① 명시).

🔍 확인 필요(open):
- 사례 33(`general-building-extension.ts`) 건물2 카드에 `buildingType:"extension"`·`extensionFloorArea` 추가 시 85㎡ 게이트 정합 — anchor P2-6 실측.
- 부담부증여 general_building이 aggregate 경로에서 채무안분(§159)을 어디서 적용하는지 — A경로/step·사례 34(`general-building-case-34-burdened-gift.test.ts`)와 일관성.
- 실지/감정 경로 카드(`app/api/calc/transfer/general-building-route-helper.ts:538-543`)는 §97①1호가목(실지)이면 §114조의2 비적용 → 현행 base=0 유지가 정답. **감정가액(appraisal) 분기만** 나목 포함이므로 별도 결선 필요 여부를 KoreanLaw로 재확정.

### B-2. 양도세 탭 general_building UI 신설

- 현행 `CompanionAcqPurchaseBlock.tsx:673-689`는 housing/building만 SelfBuiltSection → general_building에 신축/증축 선택 **UI 입력 위젯이 부재**. 단 **엔진은 미발동 아님**: 환산 카드 빌더 `general-building-valuation.ts:685-691`가 신축 시 이미 발동하므로 갭은 UI 입력(`buildingAcquisitionCause='newConstruction'` 선택)뿐. ("엔진 미발동"과 "UI 입력 부재"를 구분.)
- `GeneralBuildingBlock.tsx`에 신축/증축 입력 추가. 노출 조건:
  - **일반양도**: 신축/증축 입력 노출(§114의2는 부담부 무관, 모든 양도 적용) — 🔍 일반양도 누락이 의도인지 갭인지 확인 후 포함 결정.
  - **부담부증여 K-5**: `isBurdenedGift && bgValuationMode==="sangjeungbeop_market" && bgAcquisitionMethod==="converted"` 시 노출(`:260-276` 메시지 영역 대체/보강).
- 컴포넌트 재사용 검토: SelfBuiltSection 조건 확장 vs `GeneralBuildingSelfBuiltSection` 신설.

### B-3. 증여세 탭 general_building 카테고리 신설 (D-1 — 후속 Phase · 별도 PR)

> ⚠️ **본 Phase 2 엔진 설계 범위 외**. engine.design.md SCOPE OUT과 동일. 토지+건물 일괄을 단일 EstateItem으로 모델링(양도세 mirror). 14지점 + enum 신설 + UI variant가 모두 필요하여 대규모. **별도 plan/design + 독립 PR**로 분리 예정. 작업 순서 8단계(아래)에서 "후속 Phase"로 분리 표기.

- `EstateItem.category` enum + `"general_building"` (`inheritance-gift-estate.types.ts`).
- `resolvePropertyType`(`gift-burdened-transfer-api.ts:38-46`) 확장 → `"general_building"` → propertyType.
- 신규 평가 UI variant(토지+건물 일괄 시가/보충적평가) — estate-card variant 신설.
- `BurdenedGiftTransferSection.tsx:127-132` 분기 추가.
- 14지점 전수(①~⑭) + 부담부 K-5 신축/증축 입력.
- 🔍 확인 필요: 증여 평가체계에서 토지+건물 일괄을 단일 자산으로 둘지, 기존처럼 분리(land+building) 유지하고 일괄만 신규로 둘지 — **개념 중복** 검토(증여는 통상 분리 입력). plan-design-self-review-loop에서 inheritance-gift-tax-ui-senior 판정.

---

## 6. Anchor 계획 (pre-do-anchor-verification — Do 진입 전 동결)

`__tests__/tax-engine/transfer-tax/burdened-gift-114-2-penalty-phase2.test.ts` (신규):

> anchor 번호·시나리오는 engine.design.md 케이스 인벤토리(C-A1~C-B6)를 단일 진실로 하며, 아래 표는 그 대응관계. 두 문서 1:1 일치.

| anchor | 케이스 | 시나리오 | 기대 |
|---|---|---|---|
| P2-1 | C-A1 | 부담부증여 K-5 증축, extensionFloorArea>85, 5년내 | 가산세 = **증축부분** 환산취득가 × 5% (수치: 1,350,000 — engine.design.md A-1 예 기준) |
| P2-1b | C-A1b | **양도세 단독(비-부담부)** K-5 증축, extensionFloorArea>85, 5년내 | 가산세 = 증축부분 환산취득가 × 5% (공용 헬퍼 통해 부담부와 동일 산식) |
| P2-2 | C-A2 | K-5 증축, extensionFloorArea=85 (경계값) | 가산세 0 (85㎡ 게이트) |
| P2-3 | C-A3 | K-5 증축, 5년 초과 양도 | 가산세 0 |
| P2-4 | C-A4 | K-5 증축, transferDate<2020-01-01 | 가산세 0 (🔍 2020 시행일 게이트 — 부칙 미검증·현행값 유지) |
| P2-5 | C-A5 | 신축 K-5 (Phase 1 회귀) | Phase 1 값 불변 |
| P2-6 | C-B1 | general_building 부담부/비-부담부 K-5 증축, extensionFloorArea>85 | 증축부분 base × 5% 발동 |
| P2-7 | C-B2 | general_building 증축, extensionFloorArea≤85 (fix 후 정상 차단) | 가산세 0 (85㎡ 게이트 fix 확인) |
| P2-8 | C-A6 | K-4 실지(증축/신축) | 가산세 0 (§97①1호가목 미적용) |
| P2-9 | C-A9 | salesCase 매매사례가액 모드 | 가산세 0 (§114조의2① 나목 한정). 부담부증여 경로 salesCase 미노출이면 "노출 없음" 명시 처리 |

**Pre-Do 우선 실행**: P2-1 또는 P2-5 1건을 먼저 작성→실패 확보→설계 환류. anchor 기대값은 `effort:'max'` 서브에이전트로 환산취득가·증축부분 산식 실측 후 동결(메모리 `feedback_anchor_correction_legal_priority`).

---

## 7. E2E 계획

- 증여세: `e2e/gift-burdened-transfer.spec.ts`에 P2 시리즈 — 증축 RadioCard 활성화→extensionFloorArea·증축 기준시가 입력→body 검증(`buildingType:"extension"`·`extensionStdPriceAt*`·`extensionFloorArea`). RadioCardGroup testId 셀렉터·transferResponse 명시 대기(Phase 1 함정 재적용).
- 양도세: general_building 부담부 K-5 신축/증축 spec(신규). worktree `E2E_PORT=3101`.

---

## 8. 작업 순서 (Do 시퀀스 · verify 기준)

```
1. Pre-Do anchor (P2-1 or P2-7) 작성 → 실패 확보         → verify: 실패 재현
2. [A] 공용 헬퍼 calcExtensionEstimatedBase 추출
   + burdened-gift-apportionment 증축 base 분리산출        → verify: P2-1 통과
3. [A] 통상 converted 경로(transfer-tax.ts) 공용 헬퍼 호출  → verify: P2-1b 통과(비-부담부)
4. [A] step override forward(buildingType/extensionFloorArea) → verify: P2-2·P2-3·P2-4 통과
5. [A] 증여 14지점 + UI(extension 활성화)                  → verify: tsc 0 + 증여 E2E
6. [A] 양도 building 증축 UI + validate                    → verify: 양도 building 증축 E2E
7. [B1] B경로 3단계 결선(타입·route helper·건물2 카드)      → verify: P2-6·P2-7 통과
8. [B2] 양도 general_building UI 신설                      → verify: 양도 general_building E2E
9. 전체 npm test 회귀 0 + tsc 0 + code-review High/Med 0   → verify: 게이트 통과

[후속 Phase — 별도 PR]
B-3: 증여 general_building 카테고리 신설 (별도 plan/design + 독립 PR)
```

**PR 분할 권장**: PR-A(증축, 양 탭 — 부담부+비-부담부) → PR-B1B2(general_building 양도세) → PR-B3(general_building 증여세, 후속 Phase). 단계 2~6은 PR-A, 7~8은 PR-B1B2.

---

## 9. 위험 · 결정 필요 · 미검증(🔍) 종합

| 항목 | 구분 | 처리 |
|---|---|---|
| 증축부분 환산취득가 산식 확정 | 🔍 미검증 | plan-design-self-review-loop에서 engine-senior + KoreanLaw §176의2②2호 |
| step override buildingType/extensionFloorArea 흐름 | 🔍 미검증 | Pre-Do anchor 실증 |
| 85㎡ = 증축부분 면적 기준 | 🔍 미검증 | KoreanLaw 확정 |
| 신축 2018-01-01·증축 2020-01-01 시행일 게이트 부칙(시행일·적용례) | 🔍 현행값 유지·부칙 미검증 | 현행 `rate-calc.ts:60·68` 게이트값 유지. 연혁 API 미응답 → KoreanLaw eflaw 재조회 후속과제 등록. 단정 금지 |
| 양도세 단독(비-부담부) 증축 K-5 경로 — (a) 확정 | ✅ 결정 완료 | 공용 헬퍼 `calcExtensionEstimatedBase`로 부담부·통상 경로 단일진실. anchor P2-1b 추가 |
| 양도 SelfBuiltSection 증축 현황 | ✅ 검증 완료(3.1) | `SelfBuiltSection.tsx:60-102` 신축/증축 구분 버튼 + extensionFloorArea input 존재 — 증축부분 기준시가 2필드만 추가 |
| general_building 증축(사례 33) 기존 구현 | ✅ 검증 완료(3.1·3.2) | `general-building-extension.ts:343·352·358·359` 건물2 §114조의2 발동 — 잔여 갭은 건물2 카드 85㎡ 게이트(buildingType/extensionFloorArea)뿐 |
| 양도 general_building 일반양도 신축 누락 = 의도 vs 갭 | 결정 필요 | 사용자/설계 — 본 Phase 포함 여부 |
| 증여 general_building 개념 중복(분리 vs 일괄) | 결정 필요 | plan-design-self-review-loop UI-senior |
| 과대부과(증축 전체 base) | 위험 | A-1 분리산출로 차단, anchor P2-1 가드 |
| 회귀(신축·K-4·일반양도) | 위험 | P2-4·P2-8 + 전체 npm test |
| 침묵 strip(⑫⑬⑭) | 위험 | 신규 필드 Zod+body+route grep 자가점검 |

---

## 10. 후속 단계

1. **plan-design-self-review-loop** 13단계 — 본 계획서 입력, 엔진·UI 설계 생성 + 증축 산식·증여 general_building 모델 독립 검토. (fork 기반 스킬로 실행. 설계 문서 '생성'이 필요하면 `docs/00-pm/feature-workflow.md`의 엔진+UI 시니어 병렬 호출. 구 Workflow 도구는 폐기됨.)
2. `.engine.design.md` · `.ui.design.md` 생성(증축 산식·B경로·증여 카테고리).
3. **pre-do-anchor-verification** → P2-1/P2-5 우선 실증.
4. **single-response-do-execution** Do (PR 분할).
