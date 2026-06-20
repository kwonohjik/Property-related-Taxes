# 증여세 마법사 — 부담부증여 양도소득세 취득가액 실지·환산 모드 이식 — 엔진 설계

> Plan 참조: `docs/00-pm/gift-burdened-transfer-acquisition-cost.plan.md`
> 작성일: 2026-06-20
> 법령 검증: KoreanLaw MCP MST 286211 (소득세법 시행령 2026-05-22 시행) 직접 확인

---

## Context

증여세 마법사 `BurdenedGiftTransferSection`은 부담부증여 채무인수분 양도소득세를 `/api/calc/transfer` 를
재호출하여 계산한다(소득세법 §88). 현재는 `valuationMode: "sangjeungbeop_standard"` 고정 —
증여재산을 상증법 기준시가(§61①②⑤·§66)로 평가한 경우에만 동작한다. 이때 취득가액은
§159①1호 A괄호에 따라 취득시 기준시가 × 채무비율(B/C)로 강제된다(K-1~K-3 경로).

증여재산을 시가(§60②)로 평가한 경우, 취득가액은 §100① 일치원칙에 따라 실지취득가(K-4) 또는
환산취득가(K-5)를 선택해야 하나 현재 차단된다.

**본 기능**: 시가 평가 모드를 해제하고, 증여세 탭에 K-4/K-5 취득가액 경로를 이식한다.
전이 엔진 로직은 PR #313에서 `burdened-gift-apportionment.ts:278-351`에 이미 완전 구현됐으므로
신규 엔진 계산은 0건이다.

**이전 한계**:
- `gift-burdened-transfer-api.ts:152` — `valuationMode: "sangjeungbeop_standard"` 하드코딩으로
  시가 평가 자산의 실지·환산 취득가액 경로가 증여세 탭에서 전혀 동작하지 않음.
- 토지의 양도시 기준시가 입력란이 없어 K-5 환산 산식 자체가 불성립.

---

## 법령 근거 (KoreanLaw MCP 검증 완료)

> 아래 인용은 MST 286211 (소득세법 시행령 2026-05-22 시행) 본칙을 직접 확인한 것이다.
> 재차 법령이 개정되면 `npm run verify:legal` 로 재확인할 것.

### 소득세법 시행령 §159① (부담부증여 양도차익 — KoreanLaw 확인)

```
§159①1호 취득가액 = A × B/C
  A: 법 §97①1호에 따른 가액
     (단서: 양도가액을 §61①·②·⑤ 및 §66 기준시가로 산정한 경우 → 취득가액도 기준시가 강제)
  B: 채무액
  C: 증여가액

§159①2호 양도가액 = A × B/C
  A: 상증법 §60~§66에 따라 평가한 가액
  B: 채무액
  C: 증여가액
```

**K-4/K-5 ↔ K-1~K-3 분기의 게이트**: §159①1호 A 괄호 단서.
- 양도가액을 §61①②⑤·§66 기준시가로 산정 → 취득가액도 기준시가 강제 = K-1~K-3.
- 양도가액을 §60② 시가로 산정 → A 괄호 단서 미발동 → K-4(실지) 또는 K-5(환산) 선택 가능.

### 소득세법 시행령 §176의2②2호 (환산취득가액 — KoreanLaw 확인)

```
환산취득가액 = 양도당시 실지거래가액 × (취득당시 기준시가 ÷ 양도당시 기준시가)
  토지·건물·부동산 취득권 적용.
  PHD 단서: 최초공시 전 취득 주택·부수토지는 취득당시 기준시가 = §164⑦ 산식.
```

### 소득세법 시행령 §163⑥ (개산공제 — KoreanLaw 확인)

```
§163⑥1호 토지: 취득당시 개별공시지가 × 3/100
§163⑥2호가목 건물(부수토지 포함·주택): 취득당시 기준시가 × 3/100
```

- K-1~K-3·K-5: 개산공제 적용.
- K-4 실지취득가: 개산공제 미적용. 실비(자본적지출 §163③·양도비 §163⑤)를 채무비율 안분 후
  취득기준시가 비율로 자산 배분하여 estimatedDeduction 슬롯에 반영.

### 소득세법 시행령 §163⑨ (의제취득 — KoreanLaw 확인)

```
"상속 또는 증여(법 §88①각목외부분후단에 따른 부담부증여의 채무액에 해당하는 부분도 포함하되,
 상증법 §34~§39·§39의2·§39의3·§40·§41의2~§41의5·§42·§42의2·§42의3에 따른 증여는 제외)받은
 자산에 대하여 법 §97①1호가목을 적용할 때에는 상속개시일 또는 증여일 현재 상증법 §60~§66 규정에
 따라 평가한 가액을 취득당시 실지거래가액으로 본다."
```

- §163⑨은 **부담부증여 채무액분에도 명시적으로 적용**된다(종전 '수증자 재양도 전용' 단정은 오류).
- 증여자의 당초 취득 자체가 (제외 대상 외) 상속·증여인 경우 K-4 실지취득가 = §163⑨ 의제평가액.
- **SCOPE OUT**: 본 작업은 증여자의 당초 취득이 일반 유상취득(매매)인 경우를 전제한다.
  §163⑨ 의제취득 케이스는 §8 SCOPE OUT 항목.

---

## ★ 케이스 인벤토리

| # | 시나리오 | 법령 근거 | 취득가액 경로 | 개산공제 | anchor 출처 | 테스트 파일 | 상태 |
|---|---|---|---|---|---|---|---|
| K-1~K-3 | 기준시가 평가 + (현행 기본) | §159①1호 A괄호 | 취득기준시가 × B/C | 3% | 기존 anchor 재실행 | `gift-burdened-transfer.spec.ts` | ☐ 회귀 확인 |
| K-4a | 시가 평가 + 실지 + housing/building/apt 단일 | §159①1호 본문·§97①1호가목 | 실지취득가(단일) × B/C | 미적용 | 가공 케이스 (단일 자산) | `gift-burdened-transfer-acq-cost.spec.ts` | ☐ TODO |
| ~~K-4b~~ (증여 탭 범위 제외) | ~~시가 평가 + 실지 + general_building 토지·건물 분리~~ | — | — | — | — | — | ✖ 제외 (아래 ★ 참조) |
| K-4c | 시가 평가 + 실지 + land 토지 단독 | §159①1호 본문 | 토지 실지취득가 × B/C | 미적용 | 가공 케이스 (토지) | 동상 | ☐ TODO |
| K-4d | 시가 평가 + 실지 + K-4 실비(자본적지출+양도비) 입력 | §163③·§163⑤·§159①1호 | 실비 채무비율 안분 후 취득기준시가 비율 배분 | 미적용 | 가공 케이스 | 동상 | ☐ TODO |
| K-5a | 시가 평가 + 환산 + housing (단일 기준시가) | §176의2②2호 | 자산별 양도가액 × 취득기준시가 / 양도기준시가 | 3% | 가공 케이스 (주택) | 동상 | ☐ TODO |
| K-5b | 시가 평가 + 환산 + land (토지 기준시가 2시점) | §176의2②2호·§163⑥1호 | 토지 양도가액 × 취득공시지가 / 양도공시지가 | 3% | 가공 케이스 (토지) | 동상 | ☐ TODO |
| K-5c | 이중 floor ±1원 허용 (자산별 독립 환산) | §176의2②2호 | 자산별 독립 환산, 합산 ±1원 법적 허용 | 3% | 기존 apportionment floor 잔액 흡수 anchor | 동상 | ☐ TODO |
| body-K4 | `buildGiftBurdenedTransferBody` K-4 body 형상 검증 | — | `acquisitionMethod:"actual"` + `actualAcquisitionTotal` 전달, `capitalExpenditure`·`transferExpense` body 최상위 | — | 단위 테스트 body 매핑 | `gift-burdened-transfer-api.test.ts` | ☐ TODO |
| body-K5 | `buildGiftBurdenedTransferBody` K-5 body 형상 검증 | — | `acquisitionMethod:"converted"` + `burdenedGiftInfo.valuationMode:"sangjeungbeop_market"` | — | 단위 테스트 body 매핑 | 동상 | ☐ TODO |
| val-1 | 시가 모드 + 산정방식 미선택 → validation 차단 | feedback_no_silent_apportion_fallback | — | — | 오류 메시지 검증 | `gift-validate.test.ts` | ☐ TODO |
| val-2 | K-4 + 실지 미입력 → validation 차단 | feedback_no_silent_apportion_fallback | — | — | 오류 메시지 검증 | 동상 | ☐ TODO |
| val-3 | K-5 + 양도시 토지 기준시가 미입력 → validation 차단 | — | — | — | 오류 메시지 검증 | 동상 | ☐ TODO |
| reg-1 | 기준시가 모드(현행) 기존 anchor → 회귀 0 | §159①1호 A괄호 | 현행 K-1~K-3 불변 | — | 기존 테스트 | 기존 spec | ☐ 회귀 확인 |

> **★ K-4b(general_building 토지·건물 실지 분리) 증여 탭 제외 (실측 정정)**:
> **제외 근거**: 증여 부동산은 `real_estate_land`·`real_estate_building`·`real_estate_apartment`
> 3종 단일 슬롯으로만 매핑된다. `general_building`처럼 한 자산 내 토지+건물을 동시에 보유하는
> category가 증여 탭에 존재하지 않아, 토지·건물 동시 실지가 **분리 입력 시나리오 자체가 없다**.
> 따라서 `actualLandAcquisitionPrice`/`actualBuildingAcquisitionPrice` 분리 입력 경로는
> 증여 탭에서 도달 불가 — K-4는 **`actualAcquisitionTotal`(단일) + 취득기준시가 비율 배분**
> (엔진 `burdened-gift-apportionment.ts:302-305`) 경로만 유효하다.
> (소득세법 시행령 §159①1호 — A×B/C, A는 §97①1호 가액. KoreanLaw MST 286211 확인.)
> 엔진 input 타입의 `actualLandAcquisitionPrice`/`actualBuildingAcquisitionPrice`는 양도세 스키마
> 호환 위해 타입 보존하며, 증여 변환·validation·UI에서는 미사용.

---

## 갭 분석 — 이미 완비 vs 추가 필요

### 이미 완비 (신규 엔진 계산 0건)

| 레이어 | 위치 | 확인 |
|---|---|---|
| 엔진 K-4/K-5/standard 3-way 분기 | `burdened-gift-apportionment.ts:278-351` | 코드 실측 |
| 엔진 input 타입 `acquisitionMethod` 외 4필드 | `transfer-burdened-gift.types.ts:BurdenedGiftInfo` | 코드 실측 |
| 엔진 result echo `acquisitionMethodUsed` | `transfer-burdened-gift.types.ts:226,272-286` | 코드 실측 |
| Zod 입력 `acquisitionMethod`·`actual*` | `lib/api/transfer-tax-burdened-gift-schema.ts` (양도세 스키마, 실측) | 코드 실측 |
| Zod 입력 `capitalExpenditure`·`transferExpense` (실비 2종) | `lib/api/transfer-tax-schema.ts:117,119` (base 최상위, 실측) | 코드 실측 |
| `BurdenedGiftInfoPayload` 타입 | `transfer-tax-api-burdened-gift.ts:14-57` | 코드 실측 |
| 양도세 AssetForm bg* 슬라이스 | `calc-wizard-asset-bg.ts:BurdenedGiftFormSlice` | 코드 실측 |
| 양도세 validation K-4/K-5 규칙 | `transfer-tax-validate-bg.ts:59-120` | 코드 실측 |
| `BurdenedGiftDetailCard` 3경로 표시 | `results/transfer/BurdenedGiftDetailCard.tsx:132-162` | 코드 실측 |
| `calculateEstimatedAcquisitionPrice` 헬퍼 | `tax-utils.ts` | 코드 실측 |

### 증여세 탭에 추가 필요 (이번 작업 범위)

| 동기화 지점 | 파일 | 작업 내용 |
|---|---|---|
| ① 폼 타입 `BurdenedGiftTransferTaxInput` | `lib/tax-engine/types/inheritance-gift-estate.types.ts:571-627` | 평가모드·산정방식·실지가·실비·양도시토지기준시가 필드 추가 |
| ② 초기값 `createEmptyBgt()` | `BurdenedGiftTransferSection.tsx:56-61` | 신규 필드 `undefined`/`0` 초기값 |
| ③ normalize | `BurdenedGiftTransferSection.tsx` 또는 store normalize 경로 | string 신규 필드 fallback (Do 시 확인) |
| ④ API 변환 `buildGiftBurdenedTransferBody` | `lib/calc/gift-burdened-transfer-api.ts:65-207` | `valuationMode` 고정 해제 + K-4/K-5 매핑 + 실비 body 최상위 전달 |
| ⑤ UI 위젯 | `components/calc/inheritance/estate-card/variants/BurdenedGiftTransferSection.tsx` | 평가모드 RadioCardGroup + 산정방식 RadioCardGroup + K-4/K-5 입력 박스 |
| ⑦ 결과 카드 | `components/calc/results/BurdenedTransferTaxResultCard.tsx` | `transferBurdenedGiftBreakdown?.acquisitionMethodUsed` 3경로 표시 |
| ⑧ validation | `components/calc/gift-tax-form-shared.tsx:265-317` | 시가 모드 산정방식 필수·K-4 실지 미입력·K-5 기준시가 미입력 차단 |

> ⑥ 사이드바: 증여세 사이드바는 취득가액 표시가 없으므로 해당 없음.
> ⑨-⑭ Zod/Route/Date: 증여세 탭은 `/api/calc/transfer`를 그대로 재사용하므로 Zod·Route 스키마 변경 없음.
> 단, `buildGiftBurdenedTransferBody`가 body를 올바로 생성해야 함 (⑬에 해당).

---

## 엔진 input 타입 변경 (`BurdenedGiftTransferTaxInput`)

> 위치: `lib/tax-engine/types/inheritance-gift-estate.types.ts:571-627`
> 현재 `BurdenedGiftTransferTaxInput`에는 `valuationMode`·`acquisitionMethod` 등이 없음.
> 아래 필드를 optional로 추가한다.

```ts
export interface BurdenedGiftTransferTaxInput {
  // ===== 기존 필드 (변경 없음) =====
  acquisitionDate: Date;
  standardPriceAtAcquisition: number;
  isHousing?: boolean;
  householdHousingCount?: number;
  isOneHousehold?: boolean;
  isRegulatedArea?: boolean;
  wasRegulatedAtAcquisition?: boolean;
  residencePeriodMonths?: number;
  temporaryTwoHouse?: { previousAcquisitionDate: Date; newAcquisitionDate: Date };
  isNonBusinessLand?: boolean;
  isUnregistered?: boolean;

  // ===== 신규 추가 필드 =====

  /**
   * 증여재산 평가방식 (§159①1호 A괄호 게이트).
   * undefined = 미선택 → ⑧ validation 차단.
   * "sangjeungbeop_standard" = 기준시가 모드 (기본 회귀 보존).
   * "sangjeungbeop_market" = 시가 모드 → K-4/K-5 선택 필요.
   */
  valuationMode?: "sangjeungbeop_standard" | "sangjeungbeop_market";

  /**
   * 시가 모드 증여재산 평가액 (분모 C, 총액).
   * sangjeungbeop_market 시 필수.
   * 양도세 `bgMarketValueAtTransfer`에 대응.
   */
  marketValueAtTransfer?: number;

  /**
   * 취득가액 산정방식 (§100① 일치원칙).
   * undefined = 미선택 → ⑧ validation 차단 (시가 모드일 때만 검사).
   * "actual" = K-4 실지취득가 (§159①1호 본문).
   * "converted" = K-5 환산취득가 (§176의2②2호).
   */
  acquisitionMethod?: "actual" | "converted";

  /**
   * K-4 실지취득가액 — 토지 분리 입력 슬롯.
   * 증여 탭 미사용 (land도 actualAcquisitionTotal 단일 필드 사용).
   * 양도세 스키마 호환을 위해 타입 보존; 증여 변환·validation·UI 미사용.
   */
  actualLandAcquisitionPrice?: number;

  /**
   * K-4 실지취득가액 — 건물 분리 입력 슬롯.
   * 증여 탭 도달 불가 — 양도세 스키마 호환 위해 타입 보존, 증여 변환·validation·UI 미사용.
   * (증여 category에 general_building·commercial_building 없어 토지+건물 동시 분리 시나리오 자체 없음.)
   */
  actualBuildingAcquisitionPrice?: number;

  /**
   * K-4 실지취득가액 — 단일자산 총액 (housing·apartment·building).
   * acquisitionMethod==="actual" + 토지/건물 분리 미입력 시 취득기준시가 비율로 자동 배분.
   */
  actualAcquisitionTotal?: number;

  /**
   * K-4 실지취득가 경로 자본적지출 (§163③).
   * ★ 필드는 BurdenedGiftTransferTaxInput에 보관하나 API 변환 시 transfer body 최상위로 매핑.
   * `burdenedGiftInfo` 안에 넣지 말 것 — Zod가 침묵 strip한다(⑫⑬⑭ TS 미감지).
   */
  capitalExpenditure?: number;

  /**
   * K-4 실지취득가 경로 양도비 (§163⑤).
   * 동일 주의사항: body 최상위(`body.transferExpense`)로 전달.
   */
  transferExpense?: number;

  /**
   * 양도시 토지 기준시가.
   * K-5 환산 산식: 토지 양도가액 × (취득 토지기준시가 / 양도 토지기준시가).
   * real_estate_land 자산 + sangjeungbeop_market + converted 모드 시 필수.
   *
   * ★ Zod required + 엔진 0 침묵 이중 함정 (실측):
   *   - Zod `transfer-tax-burdened-gift-schema.ts:34`에서 REQUIRED
   *     (`z.number().int().nonnegative()` — optional 아님). 기존 buildGiftBurdenedTransferBody는
   *     land 아닌 자산에도 항상 0을 전달해 Zod를 통과시킨다.
   *   - 정정 2 매핑(`isMarketMode ? bgt.landStdPriceAtTransfer ?? 0 : stdAtTransfer`)은 0을 허용 →
   *     Zod 통과. 그러나 K-5 land에서 0이면 엔진(`burdened-gift-apportionment.ts` STEP 4
   *     `landStdPriceAtTransfer === 0 ? 0`)이 환산취득가를 **0으로 침묵 계산**한다.
   *   - 따라서 K-5 land는 ⑧ val-3에서 미입력 차단 필수(Zod·엔진·validate 3중 정합).
   *
   * ★ 단위 확인 필수 (실측 — 단가 저장 결함): 현행 UI `LandPriceLookupField.onPricePerSqmChange`는
   *   원/㎡(단가)를 그대로 반환하며 `BurdenedGiftTransferSection`은 이 위젯에 `area` prop을
   *   전달하지 않아(grep 결과 area 0건) 총액 환산이 일어나지 않는다 → 저장값은 **단가**다.
   *   그러나 엔진은 landStd*를 **총액("개별공시지가 × 면적")**으로 소비한다
   *   (`burdened-gift-apportionment.ts:45`·standardPriceAtAcquisition 동일 결함).
   *   → ⑤ UI 설계에서 area prop 전달 + 총액 자동 산출(원/㎡ × 면적)을 명시하거나,
   *     저장 단위를 단가로 통일하고 엔진/API에서 면적을 곱해 총액화하는 단일 기준을 확정할 것.
   *   `feedback_3point_input_consistency`(다시점 기준시가=면적-곱 총액 단일 기준) 준수.
   */
  landStdPriceAtTransfer?: number;
}
```

---

## 엔진 result 타입 변경 없음

`TransferBurdenedGiftBreakdown.acquisitionMethodUsed` (`transfer-burdened-gift.types.ts:226`)는
이미 `"standard_price" | "actual" | "converted"` 로 정의됐다.
`BurdenedTransferTaxResultCard`가 `result.transferBurdenedGiftBreakdown?.acquisitionMethodUsed`를
읽어 3경로 산식 표시를 추가하는 것이 ⑦ 결과 카드의 전부다.

---

## 계산 알고리즘 (엔진 기준 — 신규 없음, 매핑만 추가)

증여세 탭에서 `/api/calc/transfer`에 올바른 body를 전달하면 기존 엔진이 그대로 계산한다.
엔진 내부 흐름은 `burdened-gift-apportionment.ts:278-451` 참조.

```
[증여세 폼 입력]
  item.burdenedGiftTransferTax.valuationMode
  └─ "sangjeungbeop_standard" (기본)
      → burdenedGiftInfo.valuationMode="sangjeungbeop_standard"
      → 엔진 K-1~K-3: landStdAtAcq × B/C, buildingStdAtAcq × B/C
  └─ "sangjeungbeop_market"
      + acquisitionMethod="actual"
        → burdenedGiftInfo.valuationMode="sangjeungbeop_market"
        → burdenedGiftInfo.acquisitionMethod="actual"
        → burdenedGiftInfo.actualAcquisitionTotal (증여 탭 단일 진실 — actualLandAcquisitionPrice·actualBuildingAcquisitionPrice 증여 탭 미사용)
        → body.capitalExpenditure / body.transferExpense (★ 최상위)
        → 엔진 K-4: actualAcquisitionTotal 기준 취득기준시가 비율로 land/building 자동 배분 (개산공제 미적용)
      + acquisitionMethod="converted"
        → burdenedGiftInfo.valuationMode="sangjeungbeop_market"
        → burdenedGiftInfo.acquisitionMethod="converted"
        → burdenedGiftInfo.landStdPriceAtTransfer (real_estate_land 시 bgt.landStdPriceAtTransfer 사용)
        → 엔진 K-5: landTransferPrice × landStdAtAcq / landStdAtTransfer (§176의2②2호)
```

### ★ 핵심 매핑 정정 사항

**정정 1 — `capitalExpenditure`·`transferExpense` 위치**

이 두 필드는 `BurdenedGiftInfoPayload`의 멤버가 아니다
(`transfer-tax-api-burdened-gift.ts:14-57` 실측 확인). 엔진은
`params.capitalExpenditure`·`params.transferExpense` — 즉 **top-level `rawInput`**에서 읽는다
(`burdened-gift-apportionment.ts:342`).

양도세 참조구현도 이 두 필드를 body 최상위로 전달한다.
따라서 `buildGiftBurdenedTransferBody`에서도 `body.capitalExpenditure`·`body.transferExpense`로
최상위 전달해야 한다. `burdenedGiftInfo` 객체 안에 넣으면 Zod가 침묵 strip하여
엔진이 실비를 영원히 읽지 못한다(K-4 결과 오류, TS 미감지 함정 — ⑫⑬⑭).

**정정 2 — 토지 양도시 기준시가 신규 매핑**

현재 `buildGiftBurdenedTransferBody:91`:

```ts
const landStdAtTransfer = isLandType ? stdAtTransfer : 0;
// → stdAtTransfer = item.standardPrice (증여재산 보충적 평가 기준시가)
```

K-1~K-3에서는 `item.standardPrice`가 양도시 토지기준시가로 기능하나,
시가 모드 K-5에서는 별도의 `bgt.landStdPriceAtTransfer`가 필요하다.
매핑 확장:

```ts
const landStdAtTransfer = isLandType
  ? (isMarketMode ? (bgt.landStdPriceAtTransfer ?? 0) : stdAtTransfer)
  : 0;
```

★ 경계조건 (실측): `landStdPriceAtTransfer`는 Zod `transfer-tax-burdened-gift-schema.ts:34`에서
**REQUIRED**(0 허용)다. 위 매핑은 0을 허용하므로 Zod는 통과하나, **K-5 land에서
landStdPriceAtTransfer=0이면 엔진(STEP 4 `landStdPriceAtTransfer === 0 ? 0`)이
환산취득가를 0으로 침묵 계산**한다. 따라서 K-5 land는 ⑧ val-3에서 미입력(0) 차단이 필수다
(Zod required + 엔진 0 침묵 이중 함정 — Zod·엔진·validate 3중 정합으로 보장).

**정정 3 — `burdenedGiftInfo.marketValueAtTransfer` (분모 C — 시가 Max 패턴)**

시가 모드에서는 분모 C = Max(marketValueAtTransfer, 담보평가, 임대평가) (상증법 §60②~§66, giftValuation.max)이다.
`marketValueAtTransfer`는 보충적평가 슬롯 주입으로 시가를 표현하며, 통상 최댓값이나 담보·임대가 클 수 있다.
★ anchor A-K5는 담보·임대 0 가정이므로 결과 불변이나 일반 케이스에서 Max 로직이 개입할 수 있음을 명시.
현재 코드는 이 필드가 없으므로 엔진이 `giftValuation`을 기준시가(max)로만 계산한다.
`burdenedGiftInfo.marketValueAtTransfer = bgt.marketValueAtTransfer`를 추가한다.

---

## Silent fallback / 자동 안분 후보 식별

다음 항목은 자동 fallback 금지 — 미입력 시 ⑧ validation에서 차단한다.

| 필드 | 잘못된 자동 처리 | 올바른 처리 |
|---|---|---|
| `valuationMode` (시가/기준시가 미선택) | 기준시가로 자동 진행 | validation 차단 |
| `acquisitionMethod` (K-4/K-5 미선택, 시가 모드) | K-1~K-3 fallback | validation 차단 |
| K-4 실지취득가 미입력 | `0`으로 자동 처리 → 취득가 0원 | validation 차단 |
| `landStdPriceAtTransfer` (토지, K-5) | `item.standardPrice` 자동 대입 | validation 차단 |

예외 (자동 처리 허용):
- K-4 `actualAcquisitionTotal` 입력 → 엔진이 취득기준시가 비율로 토지/건물 자동 배분
  (엔진 `burdened-gift-apportionment.ts:302-306`).
  이것은 법적으로 자연스러운 비율 배분이며 `feedback_no_silent_apportion_fallback`의
  금지 대상인 "빈 값으로 세금 계산"이 아니다.
  ★ `actualLandAcquisitionPrice`는 증여 탭 미사용 필드이므로 "미입력" 개념 자체가 없음.
  land를 포함한 모든 category가 `actualAcquisitionTotal` 단일 경로를 사용한다.

---

## 14개 동기화 지점 점검

| 지점 | 해당 여부 | 파일 | 비고 |
|---|---|---|---|
| ① 폼 타입 | 해당 | `inheritance-gift-estate.types.ts` | `BurdenedGiftTransferTaxInput` 필드 추가 |
| ② 초기값 | 해당 | `BurdenedGiftTransferSection.tsx:createEmptyBgt` | 신규 필드 `undefined` 초기화 |
| ③ normalize | 해당 | `BurdenedGiftTransferSection.tsx` 내 patch 헬퍼 | number 필드 fallback 확인 |
| ④ API 변환 | 해당 (핵심) | `gift-burdened-transfer-api.ts:buildGiftBurdenedTransferBody` | valuationMode 고정 해제 + K-4/K-5 매핑 |
| ⑤ UI 위젯 | 해당 | `BurdenedGiftTransferSection.tsx` | RadioCardGroup 2개 + 박스 추가 |
| ⑥ 사이드바 | 해당 없음 | — | 증여세 사이드바에 취득가액 표시 없음 |
| ⑦ 결과 카드 | 해당 | `BurdenedTransferTaxResultCard.tsx` | `transferBurdenedGiftBreakdown?.acquisitionMethodUsed` 3경로 |
| ⑧ validation | 해당 | `gift-tax-form-shared.tsx:283-317` | 시가 모드 + 산정방식 필수·미입력 차단 추가 |
| ⑨ Zod enum | 해당 없음 | — | 증여세 탭은 `/api/calc/transfer` 재사용 (양도세 Zod 그대로) |
| ⑩ Zod 컴패니언 | 해당 없음 | — | 동상 |
| ⑪ acquisitionDate fallback | 해당 없음 | — | 동상 |
| ⑫ Zod 입력 객체 정의 | 해당 없음 | — | 동상. ★ 단, body 최상위 `capitalExpenditure`·`transferExpense` 필드가 이미 Zod에 존재하는지 grep 자가점검 필수 |
| ⑬ body spread | 해당 (핵심) | `gift-burdened-transfer-api.ts` | 실비 2종 body 최상위 spread 확인 |
| ⑭ Route handler | 해당 없음 | — | 증여세 탭은 Route handler 변경 없음 |

**⑫ grep 자가점검 (Do 전 필수)**:
```bash
# capitalExpenditure·transferExpense — top-level base 스키마에 이미 존재 (실측: 117,119)
grep -n "capitalExpenditure\|transferExpense" \
  /Users/mynote/workspace/Property-related-Taxes/lib/api/transfer-tax-schema.ts
# acquisitionMethod·actual*·marketValueAtTransfer·landStdPriceAtTransfer — 부담부증여 스키마
grep -n "acquisitionMethod\|actual\|marketValueAtTransfer\|landStdPriceAtTransfer" \
  /Users/mynote/workspace/Property-related-Taxes/lib/api/transfer-tax-burdened-gift-schema.ts
```
★ 정정 (실측 확인): 부담부증여 Zod 스키마는 `lib/tax-engine/schemas/`가 아니라
`lib/api/transfer-tax-burdened-gift-schema.ts`에 있다(`lib/tax-engine/schemas/` 경로는 존재하지 않음).
그리고 `capitalExpenditure`·`transferExpense`는 부담부증여 스키마가 아니라 top-level base 스키마
`lib/api/transfer-tax-schema.ts:117,119`에 **이미 존재**한다 → body 최상위로 전달하면 strip 위험 없다.
이 두 필드를 부담부증여 스키마(`burdenedGiftInfo`) 안에 **절대 추가하지 말 것**(정정 1과 일관 —
`burdenedGiftInfo` 안에 넣으면 Zod 침묵 strip → 엔진 미도달). 부담부증여 스키마를 grep하면 당연히
0건이며, 그것이 스키마에 추가해야 한다는 뜻이 아니다.

---

## 증여세 ⑧ validation 추가 규칙

> 위치: `gift-tax-form-shared.tsx:283-317` (기존 부담부증여 validation 블록 확장)

기존 검사 이후 아래 검사를 순서대로 추가한다:

```
1. 기존: 취득일 필수 (변경 없음)
2. 기존: 취득시 기준시가 필수 (변경 없음 — K-1~K-3·K-5 공통)
3. 기존: 양도시 기준시가 필수 (현행 land 제외 — ★ 재검토 필요)
   ★ 결함 (실측): 현행 `gift-tax-form-shared.tsx:301`은 `propertyType!=='land'` 조건으로 land를
     양도시 기준시가 검사에서 제외한다. 그러나 land 분기는 양도시 기준시가 위젯이 없어
     `item.standardPrice`가 항상 0 → **표준모드 land 양도차익 안분 분모가 0으로 침묵**된다.
     land 위젯 추가(⑤)와 함께 land도 양도시 토지기준시가 미입력 차단으로 전환할 것.
4. [신규] valuationMode 미선택 시 → "증여재산 평가방식(기준시가·시가)을 선택하세요." 차단
5. [신규] valuationMode==="sangjeungbeop_market" 시:
   a. marketValueAtTransfer 미입력 → "시가 모드 — 증여재산 시가 평가액을 입력하세요." 차단
   b. acquisitionMethod 미선택 → "시가 모드 — 취득가액 산정방식(실지·환산)을 선택하세요." 차단
   c. acquisitionMethod==="actual" 시:
      - 모든 부동산 category(real_estate_land·real_estate_building·real_estate_apartment): actualAcquisitionTotal 미입력 차단
        ★ land 단일 진실 확정: land도 actualAcquisitionTotal 단일 필드를 사용한다.
          actualLandAcquisitionPrice는 증여 탭 미사용 — 분리 입력 경로 자체 없음
          (일반 유상취득 전제 + category에 general_building 없어 토지+건물 동시 분리 시나리오 없음).
          엔진이 buildingStdPriceAtAcquisition=0(land의 건물기준시가=0) 조건으로 토지 전액 배분.
          → validation·UI·API 변환 모두 actualAcquisitionTotal 단일 필드로 통일(핵심 일관성 규칙).
   d. acquisitionMethod==="converted" 시:
      - category==="real_estate_land" → landStdPriceAtTransfer 미입력(0) 차단
        ("토지 K-5 환산 — 양도시 토지 기준시가를 입력하세요.")
        ★ Zod required(0 허용) + 엔진 0 침묵(STEP 4 `landStdPriceAtTransfer===0 ? 0`) 이중 함정 →
          val-3 차단 필수. anchor에 'K-5 land + landStdPriceAtTransfer=0 → validation 차단(엔진 미도달)' 추가.
      ★ housing·apt는 기존 item.standardPrice(양도시 기준시가) 위젯이 있어 검사 3에서 검사됨.
        단, land는 양도시 기준시가 위젯이 없으므로(★ ⑤ UI 결함 참조) 위젯 추가 후
        표준모드·K-5 양쪽에서 land 양도시 토지기준시가 미입력 차단이 함께 필요.
6. 기존: 1세대1주택 거주기간 필수 (변경 없음)
7. 기존: assumedDebt>0 필수 (변경 없음)
```

**⑧ ↔ ④ API fallback 동기화**:
- `buildGiftBurdenedTransferBody`에서 `bgt.valuationMode` 미입력 시 `"sangjeungbeop_standard"` fallback
  → validate도 동일하게 `valuationMode` 없으면 기준시가 모드로 통과(기존 회귀)하거나 차단.
  **권장**: 기존 증여세 자산(valuationMode 없음)은 기준시가 모드 회귀이므로
  `valuationMode === undefined || valuationMode === "sangjeungbeop_standard"` 를 표준 경로로 허용.
  `valuationMode === ""` (명시적 미선택) 시만 차단.
- ★ **valuationMode는 Zod required** — `buildGiftBurdenedTransferBody`가 항상
  `sangjeungbeop_standard` 또는 `sangjeungbeop_market` 중 하나를 전송해야 한다(undefined 전송 금지).
  `undefined` fallback은 ④ API 변환 내부에서 기준시가 모드 값으로 확정 후 전달.
  ⑧↔④ fallback 규칙과 일관: UI는 undefined=기준시가 fallback, body는 항상 string 중 하나.

---

## ⑦ 결과 카드 설계 (`BurdenedTransferTaxResultCard`)

현재 카드는 `TransferTaxResult[]`를 받아 flat 필드(`usedEstimatedAcquisition`·`transferGain` 등)만 읽는다.
`result.transferBurdenedGiftBreakdown`은 참조 0건(grep 실측).

**추가 작업**:
- `result.transferBurdenedGiftBreakdown?.acquisitionMethodUsed` 읽기 (undefined 가드).
- 3경로 산식 표시:
  - `"standard_price"` (undefined fallback 포함): 현행 "취득시 기준시가 안분" 표시 유지.
  - `"actual"`: "실지취득가액 × 채무비율 (§159①1호 본문 · §97①1호가목)" 한국어 산식 표시 + 실비(자본적지출 §163③·양도비 §163⑤)
    안분액 표시 행. ★ 개산공제(§163⑥) 미적용 — 카드 라벨에 §163⑧(삭제 조문) 인용 절대 금지.
  - `"converted"`: "환산취득가액 = 양도가액 × 취득기준시가/양도기준시가 (§176의2②2호) + 개산공제 3% (§163⑥)" 표시.
    ★ §163⑧은 삭제된 조문 — converted 경로 라벨은 §176의2②2호+§163⑥으로 인용, §163⑧ 인용 제거.
- `breakdown` undefined(기준시가 모드 / legacy): 기존 flat 필드 표시 유지(회귀 보존).
- **★ 작업항목 (finding 7 — K-4/K-5 라벨 정정)**: Do 시 현행 카드 내 §163⑧ 인용이 있으면
  `acquisitionMethodUsed` 분기 연동과 함께 §176의2②2호(환산) · §163⑥(개산공제) 교정.
  §163⑧은 삭제 조문이므로 신규·기존 코드 어디에도 인용 금지.

**★ K-4 actual 실비 표시 + 라벨 오표시 정정 (실측)**:
- 엔진 result는 `perAsset.{land,building}.estimatedDeduction` 슬롯에 K-4 안분 실비를 반영한다
  (`transfer-burdened-gift.types.ts` 주석 'K-4(actual)는 안분 실비').
- 그러나 현행 `BurdenedTransferTaxResultCard`는 `transferBurdenedGiftBreakdown`을 **전혀 읽지 않고**
  (grep 0건) flat 필드 `result.estimatedDeduction`만 표시하며, 그 안내 문구가
  '환산취득가액 ... 개산공제'로 **고정**되어 있다(`BurdenedTransferTaxResultCard.tsx:173-180` 부근,
  `result.usedEstimatedAcquisition` 가드 + "※ 취득가액 불분명 — 환산취득가액 ... + 개산공제").
- 따라서 actual(K-4) 경로의 안분 실비가 '환산·개산공제'로 **오표시될 위험**이 있다.
- → ⑦에서 `acquisitionMethodUsed==='actual'`일 때 '환산취득가액/개산공제' 문구를 노출하지 않도록
  `BurdenedTransferTaxResultCard.tsx:173-180` 분기 조건을 `acquisitionMethodUsed`에 연동하고,
  actual 경로에는 실비(자본적지출·양도비) 안분액 표시 행과 별도 라벨을 추가할 것.
  (§163③ 자본적지출·§163⑤ 양도비 — actual; §163⑥ 개산공제 — actual 미적용.)

**방안 선택 (Do 시 결정)**:
- (a) `breakdown`이 있으면 `BurdenedGiftDetailCard`를 `result.transferBurdenedGiftBreakdown`으로 렌더.
  → 코드 재사용 최대, 단 prop 형상이 다르므로 타입 맞춤 필요.
- (b) `BurdenedTransferTaxResultCard` 내부에 `acquisitionMethodUsed` 분기 행 직접 추가.
  → Surgical Changes 원칙에 부합, 기존 표시 유지 용이.

Simplicity First 원칙상 (b)를 우선 검토하고, 코드 중복이 과도하면 (a)로 전환.

---

## ⑤ UI 설계 (`BurdenedGiftTransferSection`)

> UI 상세는 UI 시니어가 `gift-burdened-transfer-acquisition-cost.ui.design.md`에 별도 작성.
> 엔진 시니어 책임은 아래 제약 조건 전달에 한정.

**엔진 제약 조건**:
1. 평가모드 RadioCardGroup은 기준시가/시가 2선택. 기준시가 = 기존 default 회귀.
2. 시가 선택 시만 `marketValueAtTransfer` 입력란 + 산정방식 RadioCardGroup(K-4/K-5) 표시.
3. K-4 박스: category 분기 (★ 증여 category는 land/building/apt 3종 — general_building 없음)
   - **전 부동산 category 공통**: `actualAcquisitionTotal` 단일 입력 (land 단일 진실 확정)
     - land도 `actualAcquisitionTotal` 사용. `buildingStdPriceAtAcquisition=0`이므로 엔진이
       취득기준시가 비율 배분 시 토지 전액 배분으로 귀결.
     - `actualLandAcquisitionPrice`는 증여 탭 미사용 — 위젯·validation 모두 제외.
   - 공통: `capitalExpenditure`·`transferExpense` (amber 박스, "개산공제 미적용" 안내)
4. K-5 박스:
   - `real_estate_land`: `landStdPriceAtTransfer`(양도시 토지 기준시가) 추가 입력란 필요 (기존 취득기준시가 외)
   - 나머지: "개산공제 3% 자동 적용" 안내 텍스트만 (입력 없음)
   ★ 치명 결함 (실측 — land 양도시 기준시가 위젯 부재):
     현행 `BurdenedGiftTransferSection.tsx:202-246` land 분기는 취득일·취득공시지가·비사업용토지
     토글만 렌더하고 **양도시 기준시가(`transferStdPrice`/`onTransferStdPriceChange`) 위젯이 전혀 없다**
     (land 외 분기에만 285-318 전달). 그런데:
     - K-5 land 환산은 `landStdPriceAtTransfer`(양도시 토지기준시가)가 0이면 취득가를 0으로 침묵 처리.
     - **표준모드(K-1~K-3) land도** ④ API 변환에서 `landStdAtTransfer = item.standardPrice`를 쓰는데
       (`gift-burdened-transfer-api.ts:89,91`) land에는 `item.standardPrice` 위젯이 없어
       **표준모드 land 양도차익 안분 분모가 항상 0인 기존 결함**이 그대로 남는다.
     - 즉 §8 검사 3 '양도시 기준시가 필수(land 제외)'와 "★ housing·apt는 기존 item.standardPrice가
       양도시 기준시가로 이미 검사됨"은 land에는 위젯 자체가 없다는 사실을 누락한 것.
     → land 분기에 '양도시 토지 기준시가' 입력 위젯을 추가하고(표준모드·K-5 양쪽에서
       동일 필드 또는 landStdPriceAtTransfer를 통해 입력), ⑧에서 land도 미입력 차단을 재검토할 것.
5. 기준시가 모드 → 기존 UI 그대로(신규 입력란 없음).
6. `RadioCardGroup`·`ToggleCard` 필수, native 금지 (components/calc CLAUDE.md).
7. `LandPriceLookupField` 필수 (토지 기준시가 입력, components/calc CLAUDE.md).

**`standardPriceAtAcquisition` (기존 필드) 역할**:
- K-1~K-3·K-5: 취득기준시가 (A 또는 환산 분자). 필수 유지.
- K-4: 취득기준시가 비율 배분용(총액 실지취득가를 토지/건물로 배분). K-4에서도 필수.

---

## §7 공통화 전략 결정 기준

양도세 `buildBurdenedGiftInfo`와 증여세 `buildGiftBurdenedTransferBody`의
`acquisitionMethod`·`actual*` 매핑 로직은 구조적으로 동일하나, 입력 소스 필드명이 다르다.
- 양도세: `AssetForm.bgActualAcquisitionLand`/`bgActualAcquisitionBuilding` (분리 입력)
- 증여세: `BurdenedGiftTransferTaxInput.actualAcquisitionTotal` (단일 입력 — land 단일 진실 확정)
이 구조적 차이 때문에 공통 헬퍼 추출 시 증여세는 단일 총액을 전달하는 어댑터가 필요하다.

**Do 시 판단 기준**:
- 매핑이 단순(3~5줄) → 복제 + anchor 동치 보장(Simplicity First).
- 매핑이 복잡(10줄 이상, 분기 다수) → 공통 헬퍼 함수 추출 (드리프트 방지).

실비 2종(`capitalExpenditure`·`transferExpense`)은 `BurdenedGiftInfoPayload` 외부이므로
공통 헬퍼 범위에 포함하지 않는다.

---

## 토지 단위 비대칭 해결 방침

**현황 (실측 — ★ 단가↔총액 불일치 결함 확인됨)**:
- 엔진은 토지 기준시가(`standardPriceAtAcquisition`·`landStdPriceAtTransfer`)를
  **총액(원, "개별공시지가 × 면적")**으로 소비한다(`burdened-gift-apportionment.ts:45`·292).
- 그러나 현행 UI는 그 값을 **단가(원/㎡)**로 저장한다(아래 실측):
  - `LandPriceLookupField.onPricePerSqmChange`는 원/㎡(단가)를 그대로 반환
    (`LandPriceLookupField.tsx:34,99,191`).
  - `BurdenedGiftTransferSection.tsx:218-223`은 `set({ standardPriceAtAcquisition: parseAmount(v) })`로
    단가를 그대로 저장하며, 이 위젯에 `area` prop을 **전혀 전달하지 않는다**(grep area 0건).
  - `LandPriceLookupField`는 `area`가 주어질 때만 총액(`Math.floor(numericPrice × area)`)을 산출하므로
    (`:114-115`) area 미전달 = 총액 환산 없음 = 저장값 단가.
- 결과: land 환산 분모/분자가 **면적 배수만큼 어긋난다**(엔진 총액 소비 ↔ UI 단가 저장).
  신규 `landStdPriceAtTransfer`를 같은 `LandPriceLookupField` 패턴으로 설계하면 동일 결함을 상속한다.

**★ 해결 방침 (택1, Do 시 확정)**:
- (a) 토지 기준시가 위젯에 `area`(면적) prop 전달 + 총액 자동 산출(원/㎡ × 면적) → 저장값을 총액으로 통일.
- (b) `standardPriceAtAcquisition`·`landStdPriceAtTransfer` 저장 단위를 단가로 통일하고
  엔진/API에서 면적을 곱해 총액화하는 단일 기준 확정.
`feedback_3point_input_consistency`: 다시점 기준시가는 면적-곱 총액(원) 단일 기준 준수.

**★ 단위 통일 범위 — 취득시·양도시 양 시점 동시 적용 필수**:
토지 기준시가 단위 정정은 취득시(`standardPriceAtAcquisition`)와 양도시(`landStdPriceAtTransfer`)
**양 시점을 반드시 동시에** 통일해야 한다(한쪽만 총액 전환 시 K-5 환산 분모/분자 단위 불일치 재발).
단일 작업항목으로 처리: "취득시·양도시 두 LandPriceLookupField 위젯에 `area={item.areaSqm}` 동시 전달
+ 저장값 총액(원) 통일(타입 주석 '총액' 명시)". `feedback_3point_input_consistency` 준수.

**★ 확인 grep (근거)**:
```bash
grep -n "onPricePerSqmChange\|area" \
  /Users/mynote/workspace/Property-related-Taxes/components/calc/inputs/LandPriceLookupField.tsx
grep -n "standardPriceAtAcquisition\|area\|LandPriceLookupField" \
  /Users/mynote/workspace/Property-related-Taxes/components/calc/inheritance/estate-card/variants/BurdenedGiftTransferSection.tsx
```

---

## Anchor 기대값

아래 기대값은 가공 케이스이다(공개 예제 미발견). anchor 실행 전 법령 산식 대조로 재확인한다.

### A-K4 (K-4 body 매핑 anchor)

```
입력: valuationMode="sangjeungbeop_market", acquisitionMethod="actual"
      marketValueAtTransfer=500_000_000, actualAcquisitionTotal=200_000_000
      assumedDebtForGift=200_000_000, capitalExpenditure=5_000_000

기대 body:
  burdenedGiftInfo.valuationMode = "sangjeungbeop_market"
  burdenedGiftInfo.acquisitionMethod = "actual"
  burdenedGiftInfo.actualAcquisitionTotal = 200_000_000
  burdenedGiftInfo.marketValueAtTransfer = 500_000_000  ← 분모 C
  body.capitalExpenditure = 5_000_000                   ← 최상위 (burdenedGiftInfo 밖)
  body.transferExpense = undefined (미입력)
```

### A-K5 (K-5 환산 anchor — 주택)

```
입력: valuationMode="sangjeungbeop_market", acquisitionMethod="converted"
      marketValueAtTransfer=500_000_000 (분모 C)
      assumedDebtForGift=200_000_000 (채무액 B)
      standardPriceAtAcquisition=100_000_000 (취득 기준시가)
      item.standardPrice=400_000_000 (양도시 기준시가)
      → 전체 자산이 단일 건물(housing 가정) — 토지 0, 건물 전체

엔진 계산:
  양도가액(채무안분) = 500_000_000 × 200_000_000/500_000_000 = 200_000_000
  환산취득가액 = 200_000_000 × (100_000_000/400_000_000) = 50_000_000
  개산공제 = floor(50_000_000 × 3/100) = 1_500_000
  양도차익 = 200_000_000 − 50_000_000 − 1_500_000 = 148_500_000

★ 이중 floor 주의: 엔진 `calculateEstimatedAcquisitionPrice`는 내부에서 floor한다.
   결과 카드 표시 산식에서 floor를 명시하지 말 것(feedback_result_view_korean_formula).
```

### A-회귀 (K-1~K-3 기준시가 모드 회귀)

```
입력: valuationMode=undefined 또는 "sangjeungbeop_standard"
      standardPriceAtAcquisition=100_000_000
      item.standardPrice=400_000_000 (양도시 기준시가)
      assumedDebtForGift=200_000_000

기대: 기존 K-1~K-3 결과와 동일 → 기존 anchor 재실행으로 확인.
     acquisitionMethodUsed="standard_price", body.burdenedGiftInfo.valuationMode="sangjeungbeop_standard"
```

### A-val3 (K-5 land + landStdPriceAtTransfer=0 → 차단)

```
입력: category="real_estate_land", valuationMode="sangjeungbeop_market"
      acquisitionMethod="converted", landStdPriceAtTransfer=0 (미입력)

기대: ⑧ validation 차단 (엔진 미도달).
     오류 메시지: "양도시 토지 기준시가를 입력하세요 (§159 양도차익 안분에 필요)."
     ★ Zod required(0 허용) + 엔진 0 침묵(STEP 4 `landStdPriceAtTransfer===0 ? 0` →
       환산취득가 0) 이중 함정을 validate에서 선차단함을 확인.
     Zod·엔진·validate 3중 정합 검증 포인트.
     ★ 메시지는 §6 검사6(ui.design.md)·A-val3(ui.design.md) 문구와 일치시킨다.
```

---

## 리스크·함정

| 리스크 | 관련 정책 | 대응 |
|---|---|---|
| 실비 `capitalExpenditure`·`transferExpense` `burdenedGiftInfo` 안에 넣음 | ⑫⑬⑭ TS 미감지 — Zod 침묵 strip | body 최상위 전달 강제. grep `body.capitalExpenditure` 자가점검. |
| 시가 모드 + 산정방식 미선택 자동 K-1~K-3 fallback | feedback_no_silent_apportion_fallback | validation 차단 (검사 5b) |
| K-5 이중 floor ±1원 오차 | feedback_floor_residual_absorption | 자산별 독립 환산 허용, ±1원 anchor 통과 처리 |
| 토지 양도시 기준시가 단위 불일치 (★ 실측 확정 — UI 단가 저장 ↔ 엔진 총액 소비) | feedback_3point_input_consistency | area prop 전달 총액화 또는 단가 통일 단일 기준 확정(§토지 단위 비대칭 (a)/(b)) |
| land 양도시 기준시가 위젯 부재 → 표준모드 land 양도차익 분모 0 침묵 (★ 치명) | feedback_no_silent_apportion_fallback | land 분기 '양도시 토지 기준시가' 위젯 추가 + 표준모드·K-5 land 미입력 차단 |
| `landStdPriceAtTransfer` Zod required(0 허용) + 엔진 0 침묵 이중 함정 | feedback_no_silent_apportion_fallback | val-3 차단(A-val3 anchor). Zod·엔진·validate 3중 정합 |
| K-4 actual 실비 '환산·개산공제'로 오표시 (현행 카드 flat 필드 고정 문구) | feedback_engine_result_display_drift | ⑦ `acquisitionMethodUsed` 분기 라벨 + 실비 안분액 표시 행 추가 |
| 기존 `valuationMode` 없는 자산 회귀 깨짐 | feedback_no_silent_apportion_fallback | `undefined`/`""` → 기준시가 모드 fallback 허용 (기존 동작 보존) |
| 명시 prop 매핑 신규 optional 누락 | feedback_explicit_prop_mapping_strip | spread 우선 + `BurdenedGiftTransferTaxInput` grep |
| `LandPriceLookupField` 저장 단위 미확인 | feedback_3point_input_consistency | Pre-Do anchor: grep + 실측 확인 후 진행 |
| §163⑨ 의제취득 케이스 혼동 | feedback_korean_law_citation_verify | SCOPE OUT 명시. K-4 실지취득가는 일반 유상취득 전제 |

---

## 작업 순서 (Do — 시퀀셜)

1. **Pre-Do anchor**: `LandPriceLookupField` 저장 단위 grep + K-4/K-5 body 형상 anchor 작성·실행 → 실패 확보 → 디자인 환류.
2. ① `BurdenedGiftTransferTaxInput` 필드 추가 + ② `createEmptyBgt` 초기값 + ③ normalize. **verify: tsc 0**.
3. ④ `buildGiftBurdenedTransferBody` 수정 (valuationMode 게이트 해제 + K-4/K-5 매핑 + 실비 최상위). **verify: body anchor 통과**.
4. ⑧ `gift-tax-form-shared.tsx` validation 추가. **verify: 미입력 차단 테스트**.
5. ⑤ `BurdenedGiftTransferSection.tsx` UI (UI 시니어). **verify: E2E**.
6. ⑦ `BurdenedTransferTaxResultCard.tsx` 3경로 산식. **verify: 표시 anchor**.
7. 전체 `npm test` + `tsc --noEmit` + 14지점 grep + baseline 대조. **verify: 회귀 0**.

---

## SCOPE OUT

- §114의2 환산취득 5% 가산세.
- §163⑨ 의제취득 케이스 (증여자 당초 취득이 제외 대상 외 상속·증여인 경우).
- 다자산 동시 부담부증여 양도세 (현행 단일 자산 제한 유지, `gift-tax-form-shared.tsx:280`).
- 결정 3(공통화 §7): Do 시 매핑 복잡도 보고 후 결정.
- ★ **표준모드 land 분모 0 기존 결함 수정은 SCOPE IN(본 작업 범위)**:
  land 양도시 기준시가 위젯 추가 + ⑧ 검사 6(표준모드·K-5 공통 land 차단) 신설.
  기존 "land 제외" 예외 해제로 기존 0-통과 입력이 차단됨 — 이를 회귀로 오인하지 말 것.

---

## 테스트 약속

- **body 매핑 단위**: `gift-burdened-transfer-api.test.ts` — K-4/K-5/standard 3경로 body 매핑 anchor (원단위 `toBe()`).
- **엔진 통합**: 실지·환산 1건씩 + 회귀 1건 `calculateTransferTax` 결과 anchor.
- **validation**: 미입력 차단 메시지 정확성 (val-1~val-3).
- **E2E**: `e2e/gift-burdened-transfer.spec.ts` 확장 — 시가 라디오 → 산정방식 라디오 → K-4/K-5 입력.
  ★ `setupTransferApiMock`은 Zod 우회이므로 body 형상은 단위 anchor로 별도 보호.
  ★ worktree E2E는 `E2E_PORT=3100` 격리 (`feedback_e2e_worktree_port_isolation`).

---

## UI 통합 위임

- UI 상세 명세는 `gift-burdened-transfer-acquisition-cost.ui.design.md` 참조 (UI 시니어 작성).
- 8개 동기화 지점 ⑤⑥⑦은 UI 시니어 책임. 엔진 시니어는 ①②③④⑧ 담당.
- `ui-engine-sync-checker` 호출로 최종 14지점 매핑 누락 점검.
