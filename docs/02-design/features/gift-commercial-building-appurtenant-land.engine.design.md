# 증여세·상속세 상업용 건물 — 부수토지 보충평가 합산 — 엔진 설계

> v2 정정(2026-06-22): 위젯 StandardPriceInput·단일 총액 필드·§159 포함 반영
> Plan: `docs/00-pm/gift-commercial-building-appurtenant-land.plan.md`
> 작성일: 2026-06-22
> 법령 검증: KoreanLaw MCP MST 276123 (상증법 §61, 2026-01-02 시행) / MST 283637 (상증령 §50, 2026-02-27 시행) 직접 확인.
> 검증 원칙: 인용 file:line 실측. 미확인은 "🔎 확인 필요"로 표기 — 추정 금지.

---

## Context

증여·상속 마법사 Step 2의 상업용 건물(`real_estate_building`)은 단일 평가액 1개(`standardPrice`)만 받는다.

현행 보충평가(기준시가) 경로(`property-valuation.ts:228 evaluateDetachedHouse` → `resolveValuationAmount` → `standardPrice`)는 **건물분 기준시가만** 계산하고 **부수토지(개별공시지가 × 대지면적)는 합산하지 않는다**.

§61①3호 일괄고시 대상 건물(오피스텔·국세청이 지정한 대규모 상가)은 토지가 이미 포함된 단일 고시가를 입력하므로 현행으로 충분하다. 그러나 §61①2호 + §61①1호 대상 건물(일괄고시 비대상)은 건물 기준시가와 부수토지 개별공시지가를 **각각 산출 후 합산**해야 한다. 이 합산 로직이 현재 누락되어 보충평가 시 과소평가된다.

**변경 범위**: `real_estate_building` 카테고리의 보충평가(`method === "standard_price"`) 경로에서 §61①2호 + §61①1호 분리 모드만 추가. **엔진 `evaluateDetachedHouse`에서 `appurtenantLandStandardPrice` 합산 로직을 추가**하고, 부수토지 입력은 EstateItem 신규 필드(`appurtenantLandStandardPrice?: number` 총액)에 저장한다. 시가·감정가·매매사례가 경로는 무변경.

---

## ★ 케이스 인벤토리 (법령 본문·단서·각호 전수 enumerate)

§61①각호별로 두 경로를 열거하고 §61⑤(임대료환산), §66(담보하한), 부담부증여와의 교차를 포함.

| # | 시나리오 | 법령 근거 | anchor 기대값 | 테스트 파일 | 상태 |
|---|---------|----------|--------------|-----------|------|
| C-A1 | §61①3호 일괄고시 + 보충평가 (현행 유지) | §61①3호 본문 | `standardPrice`(7억) = 7억 | `property-valuation/commercial-building.test.ts` | ☐ TODO |
| C-B1a | §61①2호+1호 분리 — **신규 UI 합산** 단위 테스트(갭 해소): 건물 5억 + floor(개별공시지가 × 면적) 2억 | §61①2호(건물)+§61①1호(토지) | UI 합산 산식 = 700,000,000 | UI 합산 단위 테스트 | ☐ TODO |
| C-B1b | §61①2호+1호 분리 — **엔진 무변경 회귀**: 합산 후 standardPrice 7억 in | §61①2호+§61①1호 | `valuatedAmount` = 700,000,000 | 동상 | ☐ TODO |
| C-B2 | §61①2호+1호 분리 — 건물 0·부수토지 2억 (건물 0 방어) | §61①2호+§61①1호 | `valuatedAmount` = 200,000,000 | 동상 | ☐ TODO |
| C-B3 | §61①2호+1호 분리 — 건물 5억·부수토지 미입력(0) | §61①2호+§61①1호 | `valuatedAmount` = 500,000,000 | 동상 | ☐ TODO |
| C-MV | 시가 입력 시 부수토지 필드 **무시** (통합 시가 우선) | §60② + §61① 보충평가 배제 | `valuatedAmount` = `marketValue` | 동상 | ☐ TODO |
| C-R1 | §61⑤ 임대료환산 MAX — 합산액(건물+부수토지) 기준 비교 | §61⑤ + 상증령 §50⑦ | `max(7억, 임대료환산)` | 동상 | ☐ TODO |
| C-F1 | §66 담보하한 — 합산액 기준 MAX | §66 + 상증령 §63② | `max(7억, 저당금액)` | 동상 | ☐ TODO |
| C-BD-a | 부담부증여 + §61①2호 분리 — §159①2호 양도가액 분모 | 소령 §159①2호 | 양도가액 분모 C = 합산 7억 (건물분 5억 아님) | `gift-burdened-commercial.test.ts` | ☐ TODO |
| C-BD-b | 부담부증여 + 경로 B — 건물/토지 기준시가 분리 안분: **해결책 (b) 채택 → split anchor 보류(별도 과제) · 경고 표시로 대체** | 소령 §159①1호·2호 + 상증법 §61①2호·1호 | (현행) `buildingStdPriceAtTransfer` = 합산 7억(왜곡 잔존, `gift-burdened-transfer-api.ts:105-106` `isLandType ? 0 : stdAtTransfer`) + UI 경고 노출 검증. **split 5억/2억 기대값 제거** | UI 경고 노출 E2E(`UI-3`) | ☐ TODO |
| C-S1 | 상속세 동일 EstateItem — §61①2호 분리 보충평가 | §61①2호+§61①1호 (상속 공유) | `valuatedAmount` = 700,000,000 | `inheritance-valuation.test.ts` | ☐ TODO |
| C-SD | 사이드바 dual-truth 회귀 — `computeEffectiveValuation` 합산 반영 | `estate-item-valuation.ts:23` | `totalEstate` 사이드바 = 7억 (5억 아님) | `sidebar-summary.test.ts` | ☐ TODO |
| C-VD | 협의분할 validate — expected = 합산 7억으로 통과 | `inheritance-validate.ts:~155` | `validateEstateItemAllocations` 7억 입력 시 통과 | `allocation-validate.test.ts` | ☐ TODO |

**규칙**:
- 행 없으면 Do 진입 금지.
- anchor 출처 미확인 행은 ☐ 유지. 발견 즉시 anchor 추가.
- C-BD(부담부증여 교차 케이스)는 분모(C-BD-a)와 건물/토지 split(C-BD-b)을 **두 anchor로 분리** 작성. **split 해결책 (b) 경고 표시 확정** (UI 설계 §7.6·§12 일치) — C-BD-a는 분모 합산 anchor 유지, C-BD-b는 split anchor 보류(별도 과제) + 현행 왜곡 잔존 + UI 경고 노출 검증으로 대체. (a) 분리 입력은 향후 별도 PR.

---

## 법령 근거 (KoreanLaw MCP MST 276123 직접 확인 — 2026-06-22)

### 상증법 §61① (부동산 보충적 평가 — 전문)

```
§61①1호  토지: 개별공시지가 (없으면 인근 유사 토지 기준, 배율방법 지역 제외)
§61①2호  건물(3·4호 제외): 건물의 신축가격·구조·용도·위치·신축연도 등을 고려하여
          매년 1회 이상 국세청장이 산정·고시하는 가액
§61①3호  오피스텔 및 상업용 건물: "건물에 딸린 토지를 공유(共有)로 하고 건물을
          구분소유하는 것으로서 건물의 용도·면적 및 구분소유하는 건물의 수(數) 등을
          고려하여 대통령령으로 정하는 오피스텔 및 상업용 건물(이들에 딸린 토지를
          포함한다)에 대해서는 건물의 종류, 규모, 거래 상황, 위치 등을 고려하여
          매년 1회 이상 국세청장이 토지와 건물에 대하여 일괄하여 산정·고시한 가액"
§61①4호  주택: 개별주택가격 및 공동주택가격
§61⑤    사실상 임대차계약 재산: §61①~④ 평가액과 임대료환산가액(상증령 §50⑦) 중 큰 금액
```

### 상증령 §50③ (§61①3호 "대통령령으로 정하는" 범위)

```
§50③  국세청장이 해당 건물의 용도·면적 및 구분소유하는 건물의 수(數) 등을 고려하여
       지정하는 지역에 소재하는 오피스텔 및 상업용 건물(이들에 부수되는 토지를 포함한다)
```

### 핵심 결론 — §61① 두 경로

| 경로 | 조문 | 평가 방법 | 부수토지 |
|------|------|----------|---------|
| A (일괄고시) | §61①3호 | 국세청장 일괄 산정·고시 가액 ("딸린 토지를 포함한다") | **고시 가액에 포함** — 별도 합산 금지(이중계상) |
| B (분리) | §61①2호(건물) + §61①1호(토지) | 건물 기준시가 + 개별공시지가 × 면적 **각각 후 합산** | **별도 합산 필요 — 현재 누락** |

> §61⑤ 임대료환산·§66 담보하한은 §61①~④ 평가액 **합산 후** 비교. `applyCollateralFloor`에 합산액을 전달하면 자동 정합.

### `lib/tax-engine/legal-codes/inheritance-gift.ts` 현황

현행 `VALUATION.REAL_ESTATE_SUPP = "상증법 §61"` (file:163) — 포괄 인용. 본 기능에서 경로 A/B 구분 상수를 추가한다.

```ts
// 추가 상수 (확정 후 legal-codes/inheritance-gift.ts 에 추가)
BUILDING_STD_LUMP:       "상증법 §61①3호",   // 경로 A — 일괄고시 (토지 포함)
BUILDING_STD_SEPARATED:  "상증법 §61①2호",   // 경로 B — 건물 기준시가 (부수토지 별도)
LAND_STD_APPURTENANT:    "상증법 §61①1호",   // 경로 B 부수토지 — 개별공시지가
```

---

## 설계 결정 — 저장 방식 확정

Plan v2 §0·§3-2에서 **신규 영구 필드 방식(대안 B)**으로 확정. (v1이 채택했던 "대안 A — 단일 `standardPrice` UI 합산"은 plan v2에서 폐기됨.)

### 확정: 신규 필드 방식 — `appurtenantLandStandardPrice?: number` 1필드 추가

근거 (plan §0·§3-2 실측 확인):

1. **`BuildingStdPriceModalButton`은 건물분 기준시가만 주입하며 부수토지 가액을 합산하지 않는다** (`BuildingStdPriceModalButton.tsx:78·83·88`은 `result.valuation/acquisition/transfer.standardPrice` 단일 건물분 값 1개만 `onApply`). plan v2 §0 must-fix #1이 이를 사실오류로 확정 후 대안 A를 폐기.
2. **보충평가 입력 위젯**: 기존 설계가 `LandPriceLookupField`를 전제했으나, **실제 위젯은 `StandardPriceInput`**이다(`EstateBodyRealEstate.tsx:252`, `resolvePropertyKind`가 `real_estate_building`→`building_non_residential` 매핑, area-mode에서 단가×면적→총액을 `onTotalPriceChange`로 emit). 부수토지용 `StandardPriceInput`을 `propertyKind="land"` area-mode로 추가하면 내부에서 `Math.floor(단가 × 면적)`을 계산해 총액만 emit하므로(**`:77~78·109·122·145`** 실측), **면적 별도 저장 필드 불필요**.
3. **저장 필드**: `appurtenantLandStandardPrice?: number` **총액 1필드**만 추가. `StandardPriceInput`의 `onTotalPriceChange` 콜백이 총액(원)을 emit하므로 dual-truth 없음.
4. **엔진 수정 필요**: `evaluateDetachedHouse`(`property-valuation.ts:228`)에서 `method === "standard_price"`이면 `amount = (item.standardPrice ?? 0) + (item.appurtenantLandStandardPrice ?? 0)` 합산. breakdown에 "건물 기준시가" / "부수토지 개별공시지가" 2행 분리.
5. **§159 부담부증여**: 경로 B 분리 필드(`standardPrice`=건물분, `appurtenantLandStandardPrice`=토지분)를 §159 건물/토지 안분에 각각 공급. **이번 범위 포함** (plan v2 §3-3).

> ❌ **폐기된 대안 A 전제 정정**: "UI에서 합산 후 단일 `standardPrice` 저장 → 엔진 무변경"은 plan v2 §0에서 사실오류로 확정 후 폐기. 하단 "계산 알고리즘" 절과 "14개 동기화 지점" 절의 "대안 A" 기준 내용도 v2 기준으로 정정됨.

---

## 타입 변경 (EstateItem)

**확정 필드 1개** (plan §4 ①):

```ts
// lib/tax-engine/types/inheritance-gift-estate.types.ts — standardPrice(:55) 인접 추가
/** §61①1호 부수토지 개별공시지가 총액 (경로 B 분리 모드 전용) */
appurtenantLandStandardPrice?: number;
```

UI 상태 보존용 optional 필드는 UI 시니어 판단에 따라 추가 가능하다:

```ts
/** 상업용 건물 §61① 평가 경로 선택 (UI 상태 보존용) */
commercialBuildingValuationRoute?: "lump" | "separated";
```

> ⚠️ 추가하는 모든 필드는 Zod `estate-item-schema.ts`에도 동일 필드 추가 필수(⑫ 침묵 strip 방지).
> `appurtenantLandStandardPrice`는 엔진 계산에 직접 사용되므로 **Zod 추가 필수** (누락 시 silent strip).

---

## 계산 알고리즘 (단계별)

### 현행 (`evaluateDetachedHouse` — 변경 전)

```
STEP 1: resolveValuationAmount(item)
  → method = resolveValuationMethod(item):
      market_value > appraisal > similar_sales > standard_price
  → amount = method에 따른 평가액 (standard_price 시 standardPrice 그대로)

STEP 2: applyCollateralFloor(amount, item, method)
  → method === "standard_price" 시: MAX(amount, 임대료환산가액 §61⑤)
  → MAX(result, 담보채권액 §66)

STEP 3: breakdown 반환
```

### v2 확정 — `evaluateDetachedHouse` 합산 + 신규 필드

```
[사용자 입력]
  건물 기준시가 (§61①2호):                   500,000,000  → standardPrice
  부수토지 개별공시지가 총액 (§61①1호):       200,000,000  → appurtenantLandStandardPrice
  (StandardPriceInput area-mode: Math.floor(단가 × 면적) 총액 emit)

[엔진 — evaluateDetachedHouse 수정 (property-valuation.ts:228)]
  method === "standard_price" 이면:
    amount = (item.standardPrice ?? 0) + (item.appurtenantLandStandardPrice ?? 0)
           = 500,000,000 + 200,000,000 = 700,000,000
  method !== "standard_price" 이면:
    appurtenantLandStandardPrice 무시 (통합 시가/감정가에 이미 포함)

  applyCollateralFloor(700,000,000, item, method)
    → MAX(700,000,000, 임대료환산가액 §61⑤)
    → MAX(result, 담보채권액 §66)

  breakdown:
    { label: "건물 기준시가 (§61①2호)", amount: 500,000,000 }
    { label: "부수토지 개별공시지가 (§61①1호)", amount: 200,000,000 }
    { label: "평가액(합계)", amount: 700,000,000 }
```

> ⚠️ 부수토지 `StandardPriceInput`의 면적 곱셈은 위젯 **내부**에서 `Math.floor(단가 × parseFloat(면적.toFixed(2)))`로 처리 (`StandardPriceInput.tsx:109·122·145` 실측). 엔진은 총액만 받음.
> 정수 연산: `Math.floor()` — `Math.round()` 금지 (CLAUDE.md 원칙).

### §61⑤ 임대료환산 정합 (케이스 C-R1)

`applyCollateralFloor`의 `method === "standard_price"` 게이트에 **합산액(7억)**이 전달되므로, 건물+부수토지 합산 후 §61⑤ 비교가 자동으로 이루어진다. (`evaluateDetachedHouse`에서 합산 후 `applyCollateralFloor` 호출 — plan §3-2.)

```
합산 표준가액 = 7억
임대료환산   = (월세 × 12 ÷ 0.12) + 보증금  (상증령 §50⑦, §15의2 12%)
valuatedAmount = max(7억, 임대료환산)
```

### §66 담보하한 정합 (케이스 C-F1)

동일 게이트. `securedClaim = mortgageNet + leaseDeposit`.
```
valuatedAmount = max(max(7억, 임대료환산), securedClaim)
```

---

## Silent fallback / 자동 안분 후보 식별

아래 항목은 **자동 채움 금지** (memory `feedback_no_silent_apportion_fallback`).

| 필드 | 미입력 처리 | 비고 |
|------|-----------|------|
| 건물 기준시가 (`standardPrice`) | 0 (표준가액 = 부수토지만) | C-B2 케이스 — 음수 방어 포함 |
| 부수토지 개별공시지가 총액 (`appurtenantLandStandardPrice`) | 0 (부수토지 가액 = 0) | C-B3 케이스. `StandardPriceInput` area-mode 내부에서 면적 미입력 시 0 emit |
| 경로 A 선택 시 부수토지 필드 | 무시 (`standardPrice` 그대로) | 이중계상 방지 — 경로 선택이 분기 게이트 |

> 경로 B 선택 후 부수토지 미입력은 **검증 오류가 아니라 0 처리**가 법령에 부합한다
> (건물만 있고 부수토지가 없는 건물도 존재). validation에서 차단하지 않는다.
>
> ⚠️ v1 설계의 "부수토지 대지면적(㎡) — `DecimalInput`·`parseDecimal`" 항목은 **삭제**:
> `StandardPriceInput`(area-mode)이 면적을 위젯 내부 state로 관리하므로(`StandardPriceInput.tsx:84`) 면적 전용 저장 필드 불필요. 엔진은 총액(`appurtenantLandStandardPrice`)만 받는다.

---

## 14개 동기화 지점 분석

신규 필드(`appurtenantLandStandardPrice`) + 엔진 수정에 따른 지점별 영향:

| # | 지점 | 파일 | 영향 | 상태 |
|---|------|------|------|------|
| ① | 폼 상태 타입 | `lib/tax-engine/types/inheritance-gift-estate.types.ts` (`standardPrice` :55 인접) | `appurtenantLandStandardPrice?: number` 추가. optional UI 상태 필드(`commercialBuildingValuationRoute`) 선택 추가 | **수정 필요** |
| ② | initial | EstateItem 팩토리 | optional → 명시 기본값 불필요. 🔎 팩토리 위치 확인(`grep category:.*real_estate`) | 🔎 확인 필요 |
| ③ | normalize | sessionStorage 마이그레이션 | optional → 자동 호환 | ✅ 자동 |
| **Zod** | **입력 스키마(침묵 strip 게이트)** | `lib/validators/estate-item-schema.ts` (`standardPrice` :30) | `appurtenantLandStandardPrice: z.number().nonnegative().optional()` **필수 추가**. 누락 시 silent strip | **수정 필요 — 우선순위 최상위** |
| ④ | API 변환 | `lib/calc/gift-api.ts` `buildGiftTaxInput`(`giftItems` :43·88, `.map` spread 보존) / `lib/calc/inheritance-api.ts:71` `estateItems` passthrough | spread/passthrough → 신규 optional 자동 생존. **Zod 통과가 진짜 게이트** | ✅ 자동(Zod 통과 후) |
| ⑤ | UI 위젯 | `EstateBodyRealEstate.tsx:252` (보충평가 `StandardPriceInput` 인근) | §61 경로 `RadioCardGroup` + 경로 B에 **부수토지 `StandardPriceInput`**(propertyKind=토지, area-mode) → `onTotalPriceChange` → `appurtenantLandStandardPrice` 저장. `BuildingStdPriceModalButton`은 건물분만 — **재사용 불가** → **UI 시니어 담당** | UI 시니어 |
| ⑥ | 사이드바·평가액 직접읽기 | `lib/calc/estate-item-valuation.ts:32~35 computeEffectiveValuation` (`standardPrice` 직접 read) · `lib/tax-engine/valuation/resolve-estate-item-value.ts:141` · `inheritance-deduction-suggest.ts` (`getValuatedAmount` `item.standardPrice` 직접) · `lib/stores/inheritance-summary.ts` (:100·125) | **자동 반영 아님 — dual-truth 위험.** `method === "standard_price"`일 때 `standardPrice + appurtenantLandStandardPrice` 합산을 이 지점들에 동일 게이트로 추가하거나, `resolveEngineValuatedAmount` 단일 진실로 위임. **silent 실패 위험 최상위** | **수정 필요 — grep 전수 enumerate 후 갱신** |
| ⑦ | 결과 카드 | `PropertyValuationResult.breakdown` | 엔진 breakdown 2행("건물 기준시가"/"부수토지 개별공시지가") 자동 반영. 평가조서 양식 영향 🔎 확인 필요 | 엔진 수정으로 자동 / 평가조서 🔎 |
| ⑧ | validation | **증여**: `components/calc/gift-tax-form-validate.ts` (※`lib/calc/gift-validate.ts`는 **부재 파일 — 인용 오류**) / **상속**: `lib/calc/inheritance-validate.ts:148~162` `validateEstateItemAllocations` | **증여**: 단일 수증자라 협의분할 validate 없음 → **신규 차단 없음**. 부수토지 optional(미입력=0). **상속**: `expected = resolveEngineValuatedAmount(item)`(:155)에 부수토지 합산 포함 필요 → **⑥ 통일이 곧 ⑧ 해결** | ✅ 증여 무차단 / 상속 ⑥ 종속 |
| ⑨⑩ | Zod enum | `ValuationMethod`, category enum | 무변경 | ✅ |
| ⑪ | acqDate fallback | N/A | 해당 없음 | ✅ |
| ⑫ | Zod 입력객체 | `estate-item-schema.ts` | `appurtenantLandStandardPrice` **필수 추가** (침묵 strip 방지). UI 상태 필드 추가 시 동기화 필수 | **수정 필요** |
| ⑬ | body spread | `gift-api.ts`, `inheritance-api.ts` | passthrough — 자동(Zod 통과 후) | ✅ 자동 |
| ⑭ | Route 매핑 | `app/api/calc/{inheritance,gift}/route.ts` | `appurtenantLandStandardPrice`는 number — Date 변환 무관 | ✅ |

**핵심**: ①·Zod·⑤·⑥가 **수정 필수**. ⑥의 `computeEffectiveValuation`·`resolveEstateItemValue`·deduction-suggest 직접읽기 지점은 `grep item.standardPrice` 전수 enumerate 후 표 갱신 필요 — plan §4 ⑥ 주석 참조.

---

## 부담부증여 §159 교차 분석 (케이스 C-BD)

**이번 범위 포함** (plan v2 §3-3·§0 사용자 결정).

`gift-burdened-transfer-api.ts:101~106`:

```ts
const stdAtTransfer = item.standardPrice ?? 0;
// ...
const landStdAtTransfer     = isLandType ? stdAtTransfer : 0;  // real_estate_building → 현행 0
const buildingStdAtTransfer = isLandType ? 0 : stdAtTransfer;  // real_estate_building → 현행 합산 전액
```

### v2 확정 — 분리 필드로 각각 공급

경로 B 분리 모드에서는 `standardPrice`=건물 기준시가(5억), `appurtenantLandStandardPrice`=부수토지 개별공시지가 총액(2억)이 **분리 저장**되므로, §159 건물/토지 안분에 **각각 정밀하게 공급**할 수 있다:

```ts
// gift-burdened-transfer-api.ts 수정 (경로 B 케이스)
const buildingStdAtTransfer = item.standardPrice ?? 0;             // 건물분만 (5억)
const landStdAtTransfer     = item.appurtenantLandStandardPrice ?? 0; // 토지분만 (2억)
// 양도가액 분모 C = 합산 7억 (C-BD-a)
const totalStdAtTransfer    = buildingStdAtTransfer + landStdAtTransfer;
```

- **C-BD-a**: §159①2호 양도가액 분모 `C` = 합산 7억 — **정합** (분리 필드 합산으로 명시적 처리)
- **C-BD-b**: 건물/토지 split = 건물 5억 / 부수토지 2억 각각 귀속 — **왜곡 없음**

> 🔎 **Do 착수 전 실측 필요**: `BurdenedGiftTransferSection`에서 토지분 기준시가를 현재 어디서 read하는지(현행 단일 `standardPrice` 전제 코드) 확인 후, `appurtenantLandStandardPrice` 배선 지점을 확정. plan §3-3·§6 §159 실행 순서 7번 참조.
>
> ⚠️ `real_estate_building`의 `isLandType=false` 분기가 현행에서는 `landStdAtTransfer=0`을 산출하여 build/토지 split 왜곡을 발생시켰으나, v2에서는 분리 필드 직접 배선으로 해결. C-BD-b split anchor(건물 5억·토지 2억 각각 귀속)를 Do 단계에서 작성·검증.

---

## `resolveEstateItemValue` 및 `computeEffectiveValuation` 영향 분석

⚠️ **v2 정정 — "자동 반영" 전제 철회 (plan §4 ⑥)**: v1 설계는 "대안 A(UI 합산 후 단일 `standardPrice` 저장)"를 채택해 이 지점들이 모두 자동 반영된다고 서술했으나, v2는 `appurtenantLandStandardPrice` 신규 필드를 사용하므로 아래 각 지점은 **별도 합산 게이트 추가 필요**.

**`computeEffectiveValuation`** (`lib/calc/estate-item-valuation.ts:32~35`):

```ts
// 현행 — standardPrice 직접 read
const explicit =
  item.marketValue ??
  item.appraisedValue ??
  item.similarSalesValue ??
  item.standardPrice;           // ← 부수토지 미포함 → 5억(갭)
```

`method === "standard_price"` + `appurtenantLandStandardPrice > 0`일 때 합산 게이트 추가 필요:

```ts
// 수정 방향 (엔진과 동일 게이트)
const stdAmount =
  item.standardPrice != null
    ? (item.standardPrice ?? 0) + (item.appurtenantLandStandardPrice ?? 0)
    : undefined;
const explicit =
  item.marketValue ??
  item.appraisedValue ??
  item.similarSalesValue ??
  stdAmount;
```

또는 `resolveEngineValuatedAmount` 헬퍼(엔진 권위값)를 단일 진실로 import하여 위임. **dual-truth 차단이 목표.**

**`resolveEstateItemValue`** (`lib/tax-engine/valuation/resolve-estate-item-value.ts:141`):

```ts
// 현행
if (typeof item.standardPrice === "number" && item.standardPrice > 0) {
  return item.standardPrice;   // ← 부수토지 미포함 → 5억(갭)
}
```

동일한 합산 게이트 추가 또는 엔진 단일 진실 위임 필요.

**`deriveCohabitHouseStdPrice`** (`lib/calc/inheritance-deduction-suggest.ts:615`):

```ts
const stdPrice = h.standardPrice ?? 0;   // ← 부수토지 미포함
```

동거주택 §23의2 공제 기준도 합산값이어야 한다. 동일 게이트 추가 필요. (상업용 건물이 동거주택으로 지정되는 케이스는 실무상 희소하나 타입 레벨 제약은 없으므로 포함.)

**`lib/stores/inheritance-summary.ts`** (:100·125):

사이드바 `totalEstate` 합계도 `standardPrice` 직접 읽으면 부수토지가 누락되어 "엔진 7억 ↔ 사이드바 5억" 괴리 발생. 동일 게이트 추가.

**결론**: ⑥ 4지점(`computeEffectiveValuation`·`resolveEstateItemValue`·`deriveCohabitHouseStdPrice`·`inheritance-summary`)은 **모두 수정 필요**. Do 착수 전 `grep -r "item\.standardPrice\|h\.standardPrice"` 전수 enumerate 후 표 갱신 (plan §4 ⑥ 🔎 주석).

---

## Pre-Do Anchor (디자인 환류 — Do 착수 전 1건 우선 실행)

plan §5 기준. **v2 엔진 수정이 있으므로 현행 실패 확보가 핵심.**

```ts
// __tests__/tax-engine/property-valuation/commercial-building.test.ts

// [Pre-Do Anchor] C-B1: 현행 실패 확보 — 엔진 합산 미구현
// 현행: evaluateDetachedHouse(standardPrice=5억, appurtenantLandStandardPrice=2억)
//       → 부수토지 합산 없음 → valuatedAmount = 5억 (갭)
// 신규: evaluateDetachedHouse 수정 후 → valuatedAmount = 7억 (갭 해소)
it("C-B1 [Pre-Do]: 경로 B — 건물 5억 + 부수토지 2억 → 현행 실패(5억) 확보", () => {
  // 코드베이스에 createEstateItem 팩토리는 없음(grep 0건).
  // 기존 테스트 패턴인 makeItem 헬퍼 또는 인라인 EstateItem 리터럴 사용.
  const item = makeItem({
    category: "real_estate_building",
    standardPrice: 500_000_000,
    appurtenantLandStandardPrice: 200_000_000,
  });
  const result = evaluateDetachedHouse(item);
  // 현행: 500_000_000 (실패) → 엔진 수정 후 7억으로 통과
  expect(result.valuatedAmount).toBe(700_000_000);
});

// C-A1: 경로 A 일괄고시 — 부수토지 미입력 시 standardPrice 그대로 (이중계상 없음 회귀 가드)
it("C-A1: 경로 A 일괄고시 — standardPrice 7억, 부수토지 없음 → 7억 그대로", () => {
  const item = makeItem({
    category: "real_estate_building",
    standardPrice: 700_000_000,
    // appurtenantLandStandardPrice 미입력 (undefined)
  });
  const result = evaluateDetachedHouse(item);
  expect(result.valuatedAmount).toBe(700_000_000);
});
```

추가 anchor (Do 중 작성 — plan §5):
- C-B2: 건물 0 + 부수토지 2억 → `valuatedAmount` = 200,000,000
- C-B3: 건물 5억 + 부수토지 미입력 → `valuatedAmount` = 500,000,000
- C-MV: `marketValue` 있으면 `appurtenantLandStandardPrice` 무시 (시가 우선 §60)
- C-R1: 임대료환산 MAX — `applyCollateralFloor`에 합산 7억이 전달됨을 검증
- C-F1: 담보하한 MAX — 동일
- C-SD: `computeEffectiveValuation` 부수토지 합산 반영 (⑥ dual-truth 해소 검증)
- C-VD: `validateEstateItemAllocations`에서 `expected` = 합산 7억 → 협의분할 7억 입력 시 통과
- C-BD-a: §159 분모 = 합산 7억
- C-BD-b: §159 건물분 = 5억·토지분 = 2억 각각 귀속

---

## 엔진 result 타입 변경

`PropertyValuationResult` (`property-valuation.ts` 기반 타입) 구조는 **무변경**:

```ts
interface PropertyValuationResult {
  estateItemId: string;
  method: ValuationMethod;
  valuatedAmount: number;      // 합산값(7억)이 반영됨
  breakdown: CalculationStep[];
  warnings: string[];
}
```

`evaluateDetachedHouse` 수정으로 `valuatedAmount`가 합산값을 반환. `breakdown`에 경로 B 시 2행("건물 기준시가" / "부수토지 개별공시지가")이 자동 추가되므로 결과뷰 ⑦에서 별도 렌더 없이 반영 가능.

---

## 법령 상수 추가 (`legal-codes/inheritance-gift.ts`)

`VALUATION` 객체에 아래 3개 상수를 추가한다 (`property-valuation.ts`의 `breakdown` label·lawRef에 사용):

```ts
/** 상증법 §61①3호 — 오피스텔·상업용 건물 일괄고시 기준시가 (토지 포함) */
BUILDING_STD_LUMP:        "상증법 §61①3호",
/** 상증법 §61①2호 — 건물 기준시가 (3·4호 제외) */
BUILDING_STD_SEPARATED:   "상증법 §61①2호",
/** 상증법 §61①1호 — 토지 개별공시지가 (부수토지 합산용) */
LAND_STD_APPURTENANT:     "상증법 §61①1호",
```

---

## 실행 순서 (PDCA Do — 시퀀셜)

plan §7 기준으로 v2 확정 순서:

1. **법령 상수** (`legal-codes/inheritance-gift.ts`) — BUILDING_STD_LUMP·SEPARATED·LAND_STD_APPURTENANT 3개 추가.
2. **타입 ①** (`inheritance-gift-estate.types.ts`) — `appurtenantLandStandardPrice?: number` 1필드 추가.
3. **Zod (침묵 strip 게이트)** (`estate-item-schema.ts`) — `appurtenantLandStandardPrice: z.number().nonnegative().optional()` 추가 → roundtrip 테스트 갱신.
4. **Pre-Do anchor** (`__tests__/tax-engine/property-valuation/commercial-building.test.ts`) — C-B1 현행 실패 확보 → 디자인 환류 기회 확보.
5. **엔진 ③** (`property-valuation.ts:228 evaluateDetachedHouse`) — `method === "standard_price"` 시 `appurtenantLandStandardPrice` 합산 + breakdown 2행 추가.
6. **사이드바·직접읽기 ⑥** — `computeEffectiveValuation`·`resolveEstateItemValue`·`deriveCohabitHouseStdPrice`·`inheritance-summary.ts` 합산 게이트 추가 (grep 전수 enumerate 후). dual-truth 차단.
7. **§159 배선** — `BurdenedGiftTransferSection` 토지분 read 지점 실측 후 `appurtenantLandStandardPrice` 배선 (plan §3-3).
8. **UI ⑤** (`EstateBodyRealEstate.tsx:252`) — §61 경로 `RadioCardGroup` + 경로 B 부수토지 `StandardPriceInput`(propertyKind=토지) → `onTotalPriceChange` → `appurtenantLandStandardPrice`. → UI 시니어 담당.
9. **validation ⑧** — 증여 무차단 확인. 상속은 ⑥ 통일로 협의분할 expected 모순 제거.
10. **결과뷰 ⑦** — breakdown 2행 자동 반영 확인. 평가조서 양식 영향 확인.
11. **게이트**:
    - `npx tsc --noEmit` 0건
    - `npx vitest run __tests__/tax-engine/property-valuation/`
    - 증여·상속 전체 회귀 (`npx vitest run __tests__/tax-engine/gift/` + `inheritance/`)
    - E2E (증여 상업용 건물 경로 B)
12. **검증**: Network 탭 request body에 `appurtenantLandStandardPrice` 도달 확인.

---

## 미해결 / 결정 필요 (UI 시니어 확인 필요)

- **경로 A/B 라디오 기본값**: 경로 A(일괄고시) 기본 권장(plan §3-1). 통계상 오피스텔·대형 상가(일괄고시 대상)가 다수. 확정 전 사용자 확인.
- **경로 B 부수토지 위젯**: `StandardPriceInput`(propertyKind=토지, area-mode)을 기존 건물 `StandardPriceInput` 옆에 추가. 위젯 내부가 `Math.floor(단가 × 면적)`을 계산해 총액 emit하므로 면적 저장 필드 불필요. mirror-pattern 준수: `useEffect → store` 미러링 금지.
- **⑥ grep 전수 enumerate**: Do 착수 전 `grep -r "item\.standardPrice\|h\.standardPrice" lib/calc lib/stores lib/tax-engine/valuation`으로 직접 읽기 지점 전수 확인 후 동기화 지점 표 갱신 필수.
- **§159 토지분 read 지점 실측**: `BurdenedGiftTransferSection` 현행 `item.standardPrice` 전제 코드에서 `appurtenantLandStandardPrice` 배선 지점 실측(plan §3-3).
- **UI 표시용 `commercialBuildingValuationRoute`**: 경로 선택 상태 sessionStorage 보존 필요 시 추가 후 Zod 동기화 필수.
- **상속세 동시 적용 회귀**: EstateItem은 상속·증여 공유 → 상속 마법사 E2E 회귀 포함. memory `project_inheritance_stale_e2e_specs`(사전존재 실패 6종) 주의.

---

## 범위 밖 (Scope Out)

- `evaluateBuilding`(`property-valuation.ts:262`) dead code 삭제 — 전역 dead code 정리 금지 정책(plan §9 명시).
- 국세청 일괄고시 기준시가 자동 조회 API 연동 — 수동 입력 합산까지가 본 계획 범위.
- 양도세 `commercial_building` 3시점 안분 이식 — 증여는 평가기준일 단일시점.
- §61①3호 "대통령령으로 정하는" 건물 목록 자동 판별 — 수동 경로 선택으로 충분.

---

## 자가 점검 체크리스트 (Do 완료 보고 전 필수)

- [ ] 3대 핵심 정책 위반 없음: useEffect→store 미러링 금지·자동 안분 fallback 금지·validation 8번째 동기화
- [ ] 14지점 ①~⑭ 누락 없음 (v2: ① 타입·Zod·⑤ UI 위젯·⑥ 직접읽기 4지점·엔진 수정 **모두 필수**)
- [ ] ⑥ grep 전수 enumerate 완료 + 합산 게이트 추가 확인
- [ ] API fallback ↔ validation 동기화 (부수토지 optional=0 처리 → 증여 ⑧ 무차단 확인)
- [ ] `appurtenantLandStandardPrice` Zod 필드 누락 없음 (silent strip 방지)
- [ ] `npx tsc --noEmit` 0건
- [ ] `npx vitest run __tests__/tax-engine/property-valuation/` 통과 (C-A1·C-B1~C-BD-b 전수)
- [ ] 증여·상속 전체 vitest 회귀 통과
- [ ] E2E (경로 B 보충평가 → Network body `appurtenantLandStandardPrice` 도달 확인)
- [ ] 브라우저 수동 확인 또는 미수행 명시
