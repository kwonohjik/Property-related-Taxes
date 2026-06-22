# 주식 부담부증여 양도소득세 계산 — 계획서

> 작성일: 2026-06-22 · 세목: 증여세(gift) ↔ 주식양도세(stock-transfer) 연동 · 유형: 신규 기능
> 상태: Plan (Do 미착수) · 워크트리 `feat/gift-stock-burdened-transfer` (slot 4, DEV 3004 / E2E 3104)
> 선행: 부동산 부담부증여 양도세(PR#309~#316·#324), 세부담 비교 카드(`f0e72728`)
> **13단계 자가검토 1차 정정 반영**: marketType·totalTax·estimated 안분·렌더 게이트·S-04 법령 오류 등 12건(아래 §0 정정 로그)

## 0. 13단계 자가검토 1차 정정 로그 (독립 검토 3인 + KoreanLaw 실측)

| # | 카테고리 | 정정 |
|---|---|---|
| F1 | 오류(Critical) | `marketType: "listed"` **부재** → 실제 enum `kospi\|kosdaq\|konex\|unlisted\|other_asset`(`stock-transfer.types.ts:20`). 상장은 3시장 분기. **EstateItem에 시장구분 필드 없음** → 양도세 입력에 marketType 선택 신규 |
| F2 | 오류(Critical) | `StockTransferResult.totalTax` **부재**. 총세부담 = `finalTax`(657)+`localIncomeTax`(659). 776행 `stx.totalTax`는 **증권거래세**(합산 금지 정보성) — 오독 삭제 |
| F3 | 정책위반(Critical) | "estimated 양도가 기반 자동 안분 불요" **단정 제거**. estimated 경로별 상이: 상장·취득후상장(§176의2②1호, 272·424행)=양도가 기반 자동 안분 O / **비상장 §165④ 보충평가(338-341행)=순손익·순자산 평가, 양도가 무관 → §159 취득가액 안분 안 됨** → 엔진 후처리 필요(§5-1 재설계) |
| F4 | 누락(High) | 14지점 ⑫⑬⑭ 한 줄 뭉뚱 → 분리 enumerate(§7) |
| F5 | 모순(High) | 증여 양도세·비교 카드 렌더 게이트가 `transferTaxResults.length>0`(부동산 전용, `GiftTaxResultView:509·517). 주식-only 미렌더 → `\|\| stockTransferTaxResults.length>0` 확대 |
| F6 | 누락(High) | 양도세 토글 3-state optional(undefined OFF/객체 ON) + 3중 일치 명시(§5-2) |
| F7 | 누락(Medium) | 비교함수 시그니처 변경 caller 2지점(`BurdenedGiftComparisonCard`·`GiftTaxResultView`) |
| F8 | 법령(High) | **S-04 오류**: 상장 소액주주 부담부증여 = "증권시장 거래에 의하지 아니하고 양도"(§94①3가목2) = **장외양도 → 과세**(비과세 아님) |
| F9 | 누락(Medium) | 양도가액 A(상증법 평가액) 출처 — 증여세 엔진 `valuationResults` 재사용(dual-truth 회피), 클라이언트 재계산 금지 |
| F10 | 개선(Low) | 결과 카드 — 기존 `StockTransferResultView`/주식 결과 카드 재사용 우선, 신규는 산식 import·shell만 |
| F11 | 개선(Low) | 경로 `lib/tax-engine/stock-transfer/types/stock-transfer.types.ts` |
| L1 | 법령(확정) | §88①1호 본문 "부담부증여 시 수증자가 부담하는 채무액 부분은 양도로 보며" = 자산무관(주식 포함). §63은 §159①1호 A괄호(§61①②⑤·§66)에 미포함 → 주식 취득가액 기준시가 안분 미적용 |

## 1. 목표

증여 마법사에서 **상장·비상장 주식의 부담부증여** 시, 채무인수분(유상양도, 소법 §88①1호·소령 §159)에 대한 **양도소득세를 함께 계산**한다. 부동산 부담부증여 양도세 모델을 주식양도세(`stock-transfer`) 엔진으로 확장한다.

**현재 한계**: 주식 부담부증여는 증여세 §47① 채무 차감만 구현. 양도세는 `StockBurdenedDebtSection.tsx:107` 안내 문구만. 양도세 루프(`GiftTaxForm.tsx:165`)가 `form.giftItems`(부동산)만 스캔, `form.stockItems` 제외.

**성공 기준(검증 가능)**: 비상장(또는 상장) 주식에 채무인수액·증여자 취득정보·시장구분을 입력하고 양도세 토글 ON → 계산 시, 결과탭에 주식 양도세 결과 카드 렌더, §159 안분(양도가액·취득가액)·양도차익·산출세액이 anchor 수기값과 원단위 일치. 세부담 비교 카드에 주식 양도세(`finalTax+localIncomeTax`) 합산.

## 2. 인터뷰 확정사항 (2026-06-22)

| 항목 | 확정 |
|---|---|
| **자산 범위** | **상장(kospi/kosdaq/konex) + 비상장(unlisted) 모두** |
| **취득가액 산정** | **실지 + 환산취득가액 선택** (단 비상장 환산 안분 제약 — §5-1) |

## 3. 법령 근거 (KoreanLaw 직접 확인 — 소법 MST 285523, 소령 MST 286211, 상증법 MST 276123)

### 소법 §88①1호 — 부담부증여 양도 의제 (주식 포함 확정)
> "양도란 … 유상으로 사실상 이전하는 것. 이 경우 대통령령으로 정하는 **부담부증여 시 수증자가 부담하는 채무액에 해당하는 부분은 양도로 보며**…"

자산 종류 제한 없음 → 주식(§88②2호 "주식등")도 부담부증여 채무인수분은 양도 의제. ✓

### 소령 §159① — 부담부증여 양도차익 (자산 무관 공통)
- **양도가액** = A × B/C. A=상증법 **§60~66 평가액**, B=채무액, C=증여가액.
- **취득가액** = A × B/C. A=소법 **§97①1호 가액**(실지/환산). 단서: 양도가액을 상증법 **§61①②⑤·§66 기준시가**로 산정한 경우만 취득가액도 기준시가.
- **★ 주식 결론**: 주식 평가는 상증법 **§63**(유가증권)이며 §159①1호 A괄호의 §61①②⑤·§66에 **미포함**(§159 본문 직접 확인) → **주식 취득가액은 기준시가 안분 없이 §97①1호 실지/환산가액**. 부동산의 "취득시 기준시가" 신규 필드 불요.

### 소법 §94①3 — 주식 양도소득 범위 & §63 평가
- 가목 상장: 1) 대주주 양도 / **2) 대주주 아닌 자가 "증권시장에서의 거래에 의하지 아니하고" 양도** → 둘 다 과세.
- 나목 비상장: 원칙 과세(중소·중견 K-OTC 일부 제외).
- **★ S-04 정정(L1·F8)**: 부담부증여 의제양도는 **증권시장 장내거래가 아님(장외 유상이전)** → 상장 **소액주주라도 §94①3가목2)로 과세**. (소액주주 장내양도 비과세는 부담부증여에 적용 안 됨.)
- 상증법 §63①1호가목 상장(평가기준일 전후 2개월 종가평균), 나목 비상장(시행령 보충평가), §63③ 최대주주 20% 할증.

> ★ Do 진입 전 §104①11(대주주 세율)·소령 §157(대주주 범위·시가총액 50억)·상증법 §63 시행령 평가방식 재확인 후 anchor 고정.

## 4. 현황 (조사 실측)

### 4-1. 부동산 부담부증여 양도세 경로 (재사용 모델)
- `lib/calc/gift-burdened-transfer-api.ts`: `buildGiftBurdenedTransferBody`(65) → `callGiftBurdenedTransferAPI`(281, `Promise<TransferTaxResult>`) → `/api/calc/transfer`(**transfer 엔진**). `burdenedGiftTransferPrice = assumedDebtForGift`(84). 토글 = `EstateItem.burdenedGiftTransferTax`(estate.types:409, `BurdenedGiftTransferTaxInput` 571).
- 오케스트레이션 `GiftTaxForm.tsx:165`: `form.giftItems.filter(burdenedGiftTransferTax !== undefined)` → `transferTaxResults: TransferTaxResult[]`.

### 4-2. 주식양도세 엔진 (stock-transfer) — ★ 별개 엔진·별개 결과타입
- `app/api/calc/stock-transfer/route.ts`: `calculateStockTransferTax(input): StockTransferResult`. `stockTransferInputSchema`+`coerceDates`.
- 입력(`lib/tax-engine/stock-transfer/types/stock-transfer.types.ts`): `marketType`("kospi"|"kosdaq"|"konex"|"unlisted"|"other_asset", 20), `transferPriceMode`("actual"|"exchange", 125)+`perShareTransferPrice`/`transferTotalPrice`, `acquisitionMode`("actual"|"sale_case"|"estimated"|"face_value", 141), `acquisitionPrice`, `acquisitionDate`, `isMajorShareholder`, `unlistedValuation*`(V1/V2), `expenseMode`.
- 결과(`StockTransferResult`): **`finalTax`(657)+`localIncomeTax`(659)** = 총세부담. `totalTax` 필드 **없음**(F2). `securitiesTransactionTax`(증권거래세, 합산금지).
- **부담부증여 채무 필드 없음**(grep 0) → 신규.
- **★ estimated 환산 경로(STEP3 257행~)**: 취득후상장/상장 §176의2②1호(272·424행)=`apply163_9Conversion(transferPrice, …)` 양도가 기반 / **비상장 §165④ 보충평가(338-341)=순손익·순자산, 양도가 무관**.

### 4-3. 주식 자산 입력
- `EstateItem`(estate.types): 상장 `listedStockAvgPrice`(68)·`listedStockShares`(69)·`listedStockCode` / 비상장 `unlistedStockValuationV2`(158)·`unlistedValuationMode`. **시장구분(kospi/kosdaq/konex) 필드 없음** → 신규 입력.
- `StockBurdenedDebtSection.tsx`(상장·비상장 공용, 33-114): `assumedDebtForGift`·`burdenedGiftDebtConfirmed`만 노출. 양도세 토글·증여자 취득정보 미노출.

## 5. 설계

### 5-1. §159 안분 — 양도가액은 클라이언트, 취득가액은 경로별 (★ F3 재설계)

**양도가액**(transferTotalPrice) = 평가액 A × 채무액 B / 증여가액 C. 단일 자산 C=평가액 → **= 채무액 B**(`assumedDebtForGift`). 클라이언트가 `transferTotalPrice = B` 주입.

**취득가액 — acquisitionMode별**:
| 모드 | §159 취득가액 안분 | 처리 |
|------|------------------|------|
| **실지(actual)** | 증여자 당초취득가 × B/C | **클라이언트가 명시 안분** → `acquisitionPrice` 주입(엔진 actual 모드는 입력값 그대로 사용) |
| **환산-상장/취득후상장**(§176의2②1호) | 양도가(B) × 취득기준시가/양도기준시가 | 엔진이 `transferPrice=B` 기반 환산 → **자동 안분 O**(272·424행) |
| **환산-비상장 보충평가**(§165④) | 보충평가액(취득시점 전체) × B/C | ⚠️ **엔진 산출 보충평가는 양도가 무관** → 자동 안분 **불가**. 엔진 출력에 B/C 후처리 필요 |

**★ 비상장 환산 안분 해법 (엔진 설계 STEP5에서 확정)**:
- (A) **엔진에 부담부 채무비율 입력 추가** — `burdenedGiftDebtRatio`(=B/C) optional. 엔진이 §165④ 보충평가 `acquisitionPrice` 산출 후 × 비율. 부동산 transfer 엔진과 대칭. **권고**.
  - **★ 적용 범위(STEP3 파급)**: 비율은 **엔진이 자체 산출하는 acquisitionPrice(환산-비상장 보충평가·환산-상장)에만** 적용. **실지(actual) 모드는 클라이언트가 이미 B/C 안분한 값을 주입**하므로 엔진 비율 **미적용**(이중 안분 방지). 엔진은 `acquisitionMode === "actual"`이면 `burdenedGiftDebtRatio` 무시. 상장 §176의2②1호 환산은 transferPrice(=B)로 이미 안분되므로 비율 미적용(또는 1.0).
  - **★ Zod 동기화(STEP3 파급)**: (A) 채택 시 `burdenedGiftDebtRatio`는 신규 필드 → `stockTransferInputSchema`(⑨)·body(⑫⑬)·route(⑭)에 추가. §7 ⑨가 "기존 필드 재사용"이라 단정했으나 (A) 채택 시 **이 신규 필드만 예외**.
- (B) 비상장 환산 SCOPE OUT(실지만) — 사용자 "실지+환산" 요구 부분 미충족 → 비권고.
- **Pre-Do anchor-2가 (A) 미구현 시 비상장 환산 과대 취득가(양도차익 음수)를 적발**하도록 설계. 엔진 변경 최소 원칙이나 비상장 환산은 엔진 후처리 불가피.

> §159 양도가액 A(평가액 §63)는 **`computeEffectiveValuation(stockItem, form.giftDate)`**(`lib/calc/estate-item-valuation.ts:23`) — 증여세 엔진과 **동일 클라이언트 순수함수**로 form 단계 도출(D3 정정). 별도 재구현 금지(dual-truth)지만 동일 함수 호출이라 정합. result 불요(부동산 부담부 경로와 동일 form-only 호출).

### 5-2. 입력 — `BurdenedGiftStockTransferInput` (신규, EstateItem 확장, 3-state)

```ts
// EstateItem.burdenedGiftTransferTax?: BurdenedGiftStockTransferInput
//   undefined = 양도세 OFF / 객체 = ON (3-state optional, feedback_three_state_optional_mode_toggle)
//   length>0 derive 금지. createEmpty=undefined / normalize 보존 / UI display fallback 3중 일치(②③⑤)
interface BurdenedGiftStockTransferInput {
  marketType: "kospi" | "kosdaq" | "konex" | "unlisted"; // 시장구분(EstateItem 미보유 → 신규)
  acquisitionDate: Date | string;        // 증여자 당초 취득일(§95 보유기간·§157 대주주)
  acquisitionMode: "actual" | "estimated"; // 실지 | 환산
  actualAcquisitionPrice?: number;        // 실지: 증여자 당초취득가(안분 전 전체)
  isMajorShareholder?: boolean;           // 상장 대주주(§104①11). 비상장은 항상 과세(소액주주 비과세 무관)
}
```

- 양도가액 A·증여가액 C는 기존 증여 평가에서 도출(신규 평가 입력 없음).
- §114의2 환산 5% 가산세는 **Phase 2 SCOPE OUT**.

### 5-3. 오케스트레이션 (`GiftTaxForm.tsx`)

```
추가: stockBurdenedItems = form.stockItems.filter(it => it.burdenedGiftTransferTax !== undefined)
      → callGiftStockBurdenedTransferAPI(item, form) → /api/calc/stock-transfer
      → stockTransferTaxResults: StockTransferResult[]  (★ 별도 상태, TransferTaxResult와 다른 타입)
      → 직렬 호출, txErrors 동일 패턴
```
- 단순증여 baseline `hasBurdenedDebt`는 이미 `engineInput.giftItems`(병합분)로 주식 채무 포함 → 변경 불요. 비교 카드 게이트만 확대(F5).

### 5-4. UI — `StockBurdenedDebtSection.tsx` 확장
기존 §47① 섹션 아래 양도세 토글 섹션 추가(amber tone):
- 토글 ON 시: marketType `RadioCardGroup`(상장 kospi/kosdaq/konex·비상장 unlisted) + 증여자 취득일 `DateInput` + 실지/환산 `RadioCardGroup` + (실지) 증여자취득가 `CurrencyInput` + (상장) 대주주 `ToggleCard`.
- validation(⑧): 토글 ON 시 marketType·acquisitionDate 필수, 실지 모드 시 actualAcquisitionPrice 필수. UI/validate 동기.

### 5-5. 결과 — ★ StockTransferResult 별도 처리
- 주식 결과 = `StockTransferResult`. **기존 `StockTransferResultView`/주식 결과 카드 재사용 우선**(F10), 신규 wrapper 시 산식 import·shell만.
- `GiftTaxResultView`에 `stockTransferTaxResults?: StockTransferResult[]` prop + PrintSection 신규 id `burdened-stock-transfer-tax`.
- **렌더 게이트 확대(F5)**: 양도세/비교 카드 게이트를 `transferTaxResults.length>0 || stockTransferTaxResults.length>0`로. `GiftTaxResultView:509·517·295·297` 4지점.
- **세부담 비교 합산 확대(F2·F7)**: `computeBurdenedGiftComparison`에 주식 배열 인자 추가. 주식 totalTax = **`finalTax + localIncomeTax`**(totalTax 필드 없음). caller 2지점: `BurdenedGiftComparisonCard`(props·호출), `GiftTaxResultView`(전달).

## 6. 케이스 매트릭스 (정정)

| # | 케이스 | marketType | 취득 | 대주주 | 과세 | 비고 |
|---|--------|-----------|------|--------|------|------|
| S-01 | 비상장 부담부 + 실지 | unlisted | actual | N/A | 과세 | 기본. 클라이언트 B/C 안분 |
| S-02 | 비상장 부담부 + 환산 | unlisted | estimated | N/A | 과세 | ⚠️ §165④ 보충평가 → 엔진 후처리 안분(§5-1 A안) |
| S-03 | 상장 대주주 부담부 + 실지 | kospi/kosdaq/konex | actual | true | 과세 | §104①11 |
| S-04 | 상장 **소액주주** 부담부 | kospi/kosdaq/konex | actual | false | **과세** | ★정정: 장외양도 §94①3가목2 (비과세 아님) |
| S-05 | 상장 부담부 + 환산 | kospi 등 | estimated | — | 과세 | §176의2②1호 양도가 자동 안분 |
| S-06 | 채무 ≥ 평가액 | any | — | — | 음수 가드 | 양도차익 0 |
| S-07 | 양도세 토글 OFF(채무만) | any | — | — | 미계산 | §47① 차감만 |
| S-08 | 부동산+주식 혼재 부담부 | mixed | — | — | 양쪽 합산 | transferTaxResults + stockTransferTaxResults |

## 7. 14 동기화 지점 (신규 input — ⑫⑬⑭ 분리 enumerate, F4)

| 지점 | 작업 |
|---|---|
| ① 폼/EstateItem | `BurdenedGiftStockTransferInput` 타입 + `burdenedGiftTransferTax`(주식 변형, 3-state) |
| ② initial | `createEmptyStockBgt` = undefined (OFF) — store=UI=API 일치 |
| ③ normalize | sessionStorage 복원 시 Date 필드 보존 |
| ④ API 변환 | `buildGiftStockBurdenedTransferBody`(§159 양도가액 안분 + 실지 취득가 안분) 신규 |
| ⑤ UI 위젯 | `StockBurdenedDebtSection` 양도세 섹션(marketType·취득일·실지/환산·대주주) |
| ⑥ 사이드바 | N/A(결과 후 파생) |
| ⑦ 결과 카드 | 주식 결과 카드 재사용 + ResultView prop + 비교 합산 확대 + 렌더 게이트 |
| ⑧ validation | 토글 ON 시 marketType·acquisitionDate 필수, 실지 시 actualAcquisitionPrice 필수 |
| ⑨ Zod enum 메인 | stock route 기존 `stockTransferInputSchema` 재사용 — 안분값은 기존 필드(transferTotalPrice·acquisitionPrice·marketType·acquisitionMode)에 매핑. **단 §5-1 (A)안 채택 시 `burdenedGiftDebtRatio` 신규 필드만 schema 추가**(비상장 환산 안분용) |
| ⑩ Zod 컴패니언 | N/A(주식은 단일 input) |
| ⑪ acqDate fallback | acquisitionDate 필수 — fallback 없음(자동 안분 금지) |
| **⑫ Zod 입력객체** | `buildGiftStockBurdenedTransferBody`가 채우는 필드가 `stockTransferInputSchema`를 **전수 통과**하는지 1:1 점검(신규 안분값이 schema에 정의된 필드인지 — 침묵 strip 방지) |
| **⑬ body spread** | callGiftStockBurdenedTransferAPI fetch body에 안분 필드 누락 없는지(명시 매핑 strip 주의) |
| **⑭ Route 매핑** | stock route `coerceDates`(STOCK_DATE_FIELDS)가 `acquisitionDate`·`transferDate` 변환하는지 — 신규 경로 Date 도달 확인 |

> ★ ⑫⑬⑭는 TS 미감지 침묵 strip. `buildGiftStockBurdenedTransferBody` 필드 ↔ `stockTransferInputSchema` ↔ `coerceDates` 1:1 표를 엔진 설계서에 작성.

## 8. 엣지·리스크

- **결과 타입 이원화**: StockTransferResult(주식, finalTax+localIncomeTax) vs TransferTaxResult(부동산, totalTax). 합산·게이트·prop 경로 분리. 공통 추출 헬퍼 `stockTotalTax = finalTax+localIncomeTax`.
- **비상장 환산 §159 안분(F3)**: 엔진 후처리(§5-1 A) 없으면 양도차익 음수(과대 취득가). Pre-Do anchor-2 필수.
- **marketType 미보유**: EstateItem에 시장구분 없음 → 입력 강제(validation). 자동판정(종목코드) 금지(자동 안분 정책).
- **양도가액 A 출처(F9·D3)**: `computeEffectiveValuation(stockItem, form.giftDate)` form-only 순수함수(증여세 엔진과 동일 함수). result 불요·dual-truth 아님.
- **단일 자산 제약**: 부동산 부담부 양도세 단일 자산 제약 → 주식도 동일 적용 검토(혼재 S-08 시 부동산1+주식1).
- **증여가액 C 분모**: 단일 자산 C=평가액. 복수 안분 SCOPE OUT.

## 9. Pre-Do anchor (Do 진입 전 우선)

1. **비상장 실지 §159 안분(S-01)**: 평가액 10억·채무 4억·증여자취득가 2억 → 양도가액 4억(=B), 취득가액 = 2억×4억/10억 = 8천만. **양도차익 = 4억−8천만−0(actual 모드 개산공제 미발동, D2) = 3.2억**. stock 엔진 결과 finalTax+localIncomeTax 원단위 `toBe()`.
2. **★ 비상장 환산(S-02)**: acquisitionMode=estimated → 엔진 §165④ 보충평가가 **B/C 안분 없이 전체 취득시점 평가액**을 acquisitionPrice로 산출함을 **실측**(양도차익 음수/과대 확인) → §5-1 (A)안(엔진 채무비율) 필요성 확정·환류.
3. **상장 환산(S-05)**: §176의2②1호 → 양도가(B) 기반 환산취득가 자동 안분 확인.
4. **상장 소액주주 과세(S-04)**: isMajorShareholder=false + 부담부 → **과세**(비과세 아님) anchor.

> ★ anchor-2가 §5-1 핵심 쟁점(비상장 환산 안분)을 실측 적발. "현행 일치 예상" 금지.

## 10. 작업 순서 (Do)
1. KoreanLaw §104①11·소령 §157·상증령 §63 재확인 + Pre-Do anchor 1~4 작성·실행(실측) → §5-1 (A/B) 확정 환류.
2. (필요 시) stock 엔진 §159 채무비율 후처리(`burdenedGiftDebtRatio`) — anchor-2 결과 따라. `BurdenedGiftStockTransferInput` 타입 + `buildGiftStockBurdenedTransferBody`(안분) + anchor 통과.
3. `callGiftStockBurdenedTransferAPI` + `GiftTaxForm` 오케스트레이션(stockBurdenedItems 루프 + state).
4. `StockBurdenedDebtSection` 양도세 토글 섹션 + validation.
5. 주식 결과 카드 재사용 + `GiftTaxResultView` prop·삽입·렌더 게이트 확대 + 비교 합산 확대 + PrintSection 3곳.
6. `npx tsc --noEmit` 0 → `npx vitest run __tests__/tax-engine/stock-transfer/ __tests__/tax-engine/inheritance-gift/` → E2E(worktree `E2E_PORT=3104`, testId 셀렉터).
7. 브라우저 수동 확인 또는 미수행 명시.

## 11. SCOPE OUT
- §114의2 환산 5% 가산세 주식 적용(Phase 2)
- 복수 주식 자산 동시 부담부(증여가액 C 복수 분모)
- 기타자산(§94①4 부동산과다보유법인)·외국주식(foreign_stock)·exit_tax
- 수증자 재양도

## 12. 다음 단계
STEP 3 재검토(정정 파급) → STEP 5 엔진 설계(`*.engine.design.md`) → STEP 12 UI 설계(`*.ui.design.md`) → Pre-Do anchor → Do.
