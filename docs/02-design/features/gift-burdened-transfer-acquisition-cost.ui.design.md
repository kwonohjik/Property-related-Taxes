# 증여세 마법사 — 부담부증여 양도소득세 취득가액 실지·환산 모드 이식 — UI 설계

> Plan: `docs/00-pm/gift-burdened-transfer-acquisition-cost.plan.md`
> 엔진 설계: `docs/02-design/features/gift-burdened-transfer-acquisition-cost.engine.design.md`
> 작성일: 2026-06-20
> 법령 검증: 조문 인용은 KoreanLaw MCP MST 286211 (소득세법 시행령 2026-05-22 시행) 엔진 설계 확인 기반.
> 아래 법령 조항은 엔진 설계에서 본칙 직접 확인된 것만 인용하며, 미확인 항목은 "확인 필요"로 표기.

---

## 0. 한 줄 요약

`BurdenedGiftTransferSection.tsx`에 **증여재산 평가방식 RadioCardGroup(기준시가/시가)** + 시가 선택 시
**취득가액 산정방식 RadioCardGroup(K-4 실지/K-5 환산)** + 각 방식별 입력 박스를 추가한다.
`BurdenedTransferTaxResultCard.tsx`에 `result.transferBurdenedGiftBreakdown?.acquisitionMethodUsed`
3경로 산식 분기를 추가한다. 신규 UI 컴포넌트 추가 없음 — 기존 `RadioCardGroup`·`ToggleCard`·
`CurrencyInput`·`LandPriceLookupField`·`FieldCard` 재사용.

---

## 1. 배경

증여세 마법사 `BurdenedGiftTransferSection`은 부담부증여 채무인수분 양도소득세를
`/api/calc/transfer`를 재호출해 계산한다(소득세법 §88). 현재는 취득가액이
`valuationMode: "sangjeungbeop_standard"` 고정(소령 §159①1호 A괄호 기준시가 강제)으로
K-1~K-3 경로만 동작한다.

증여재산을 시가(§60②)로 평가한 경우, §100① 일치원칙에 따라 취득가액을
실지취득가(K-4) 또는 환산취득가(K-5)로 선택할 수 있어야 하나, 현재 이 경로가
증여세 탭에서 차단된다.

---

## 2. 14개 동기화 지점

증여세 탭은 `/api/calc/transfer`를 그대로 재사용하므로 Zod·Route·Date 스키마 변경 없음.
단, `buildGiftBurdenedTransferBody`(④)가 body를 올바로 생성해야 한다(⑬에 해당).

| # | 지점 | 파일 | 작업 |
|---|---|---|---|
| ① | 폼 타입 `BurdenedGiftTransferTaxInput` | `lib/tax-engine/types/inheritance-gift-estate.types.ts:571-627` | 평가모드·산정방식·실지가·실비·양도시토지기준시가 7필드 추가 |
| ② | 초기값 `createEmptyBgt()` | `components/calc/inheritance/estate-card/variants/BurdenedGiftTransferSection.tsx:56-61` | 신규 필드 `undefined` 초기값 |
| ③ | normalize | `BurdenedGiftTransferSection.tsx` 내 `set()` 호출 경로 | number 신규 필드 fallback 확인 (Do 시 확인) |
| ④ | API 변환 `buildGiftBurdenedTransferBody` | `lib/calc/gift-burdened-transfer-api.ts:65-207` | `valuationMode` 고정 해제 + K-4/K-5 매핑 + 실비 body 최상위 전달 |
| ⑤ | UI 입력 위젯 | `BurdenedGiftTransferSection.tsx` | 평가모드 RadioCardGroup + 산정방식 RadioCardGroup + K-4/K-5 입력 박스 + land 양도시 기준시가 위젯 |
| ⑥ | 사이드바 합계 | 해당 없음 | 증여세 사이드바에 취득가액 표시 없음 — N/A |
| ⑦ | 결과 카드 산식 | `components/calc/results/BurdenedTransferTaxResultCard.tsx` | `result.transferBurdenedGiftBreakdown?.acquisitionMethodUsed` 3경로 분기 산식 표시 |
| ⑧ | validation | `components/calc/gift-tax-form-shared.tsx:265-317` | 시가 모드 산정방식 필수·K-4 실지 미입력·K-5 land 기준시가 미입력 차단 |
| ⑨ | Zod enum 메인 | 해당 없음 | `/api/calc/transfer` 그대로 재사용 |
| ⑩ | Zod 컴패니언 | 해당 없음 | 동상 |
| ⑪ | `acquisitionDate` fallback | 해당 없음 | 동상 |
| ⑫ | Zod 입력 객체 정의 | 해당 없음 | 단, `capitalExpenditure`·`transferExpense` top-level `transfer-tax-schema.ts:117,119` 이미 존재 확인 필수 (grep 자가점검) |
| ⑬ | body spread | `gift-burdened-transfer-api.ts:buildGiftBurdenedTransferBody` | 실비 2종 body 최상위 spread — ⑧ validation과 동기화 |
| ⑭ | Route handler | 해당 없음 | Route handler 변경 없음 |

**⑧ ↔ ④ API fallback 동기화 원칙**:
- `bgt.valuationMode` 없으면 `"sangjeungbeop_standard"` fallback → validate도 동일하게 undefined/`"sangjeungbeop_standard"`는 표준 경로로 통과.
- `valuationMode` 명시적 미선택(빈 문자열)은 차단 대상 — 기존 자산(valuationMode 없음)은 회귀로 허용.

---

## 3. 케이스 매트릭스

| 경로 | 증여재산 평가 | acquisitionMethod | 취득가액 산식 | 개산공제 | UI 진입 조건 |
|---|---|---|---|---|---|
| K-1~K-3 | 기준시가(§61①②⑤·§66) | 없음 | 취득기준시가 × B/C | 3% | valuationMode 미선택 또는 "sangjeungbeop_standard" |
| K-4 | 시가(§60②) | `"actual"` | 실지취득가 × B/C | 미적용 (+실비 채무비율 안분) | valuationMode="sangjeungbeop_market" + acquisitionMethod="actual" |
| K-5 | 시가(§60②) | `"converted"` | 양도가액 × 취득기준시가/양도기준시가 | 3% | valuationMode="sangjeungbeop_market" + acquisitionMethod="converted" |

- B = `item.assumedDebtForGift` (채무인수액), C = 분모 (기준시가 모드: 자산 기준시가 / 시가 모드: `marketValueAtTransfer`)
- **K-4b(general_building 토지·건물 분리)**: 증여 category에 `general_building`·`commercial_building` 없음 (실측) → `actualLandAcquisitionPrice`·`actualBuildingAcquisitionPrice` 분리 입력 불가. K-4는 `actualAcquisitionTotal`(단일 총액) + 취득기준시가 비율 배분만 유효.

---

## 4. 신규 폼 타입 필드 (①②)

`lib/tax-engine/types/inheritance-gift-estate.types.ts:571-627` `BurdenedGiftTransferTaxInput`에 아래 필드를 optional로 추가:

```ts
// === 신규 추가 (기존 필드 변경 없음) ===

valuationMode?: "sangjeungbeop_standard" | "sangjeungbeop_market";
// 증여재산 평가방식 (§159①1호 A괄호 게이트).
// undefined = 기준시가 fallback (회귀 보존). "" = 명시적 미선택 → ⑧ validation 차단.

marketValueAtTransfer?: number;
// 시가 모드 증여재산 평가액 (분모 C, 총액). sangjeungbeop_market 시 필수.

acquisitionMethod?: "actual" | "converted";
// 취득가액 산정방식. undefined = 미선택 → ⑧ validation 차단 (시가 모드일 때만).

actualAcquisitionTotal?: number;
// K-4 실지취득가액 — 단일 총액 입력 (land·housing·apt·building 전부 이 필드 사용).
// 엔진이 취득기준시가 비율로 토지/건물 자동 배분.
// ★ land 단일 진실 확정: land(real_estate_land)도 actualAcquisitionTotal 단일 필드를 쓴다.
//   land는 buildingStdPriceAtAcquisition=0이므로 엔진 자동배분 시
//   landActualAcquisition=actualAcquisitionTotal·building몫=0으로 귀결되어
//   토지 전액 배분이 성립한다(burdened-gift-apportionment.ts:302-305).
//   엔진 input 타입의 actualLandAcquisitionPrice/actualBuildingAcquisitionPrice는
//   증여(부담부증여) 탭에서는 사용하지 않는다(general_building·commercial_building category 부재).
//   → §5.5 위젯·§6 validation·§10 testid 모두 actualAcquisitionTotal로 일치시킨다.

capitalExpenditure?: number;
// K-4 자본적지출 (§163③).
// ★ API 변환 시 body 최상위로 매핑 (burdenedGiftInfo 안 금지 — Zod 침묵 strip).

transferExpense?: number;
// K-4 양도비 (§163⑤). 동일 주의사항.

landStdPriceAtTransfer?: number;
// land K-5 환산용 양도시 토지기준시가 (총액 원).
// real_estate_land + sangjeungbeop_market + converted 모드 시 필수.
// ★ Zod required(0 허용) + 엔진 0 침묵 이중 함정 → ⑧ val-3에서 미입력(0) 차단 필수.
// ★ 단위: LandPriceLookupField에 area={item.areaSqm} prop 전달 시 총액 자동 산출
//   — area 미전달(또는 존재하지 않는 item.area 참조) 시 단가 저장 결함 (엔진 설계 §토지 단위 비대칭 해결 방침 참조).
//   EstateItem 면적 필드명은 areaSqm (inheritance-gift-estate.types.ts:235) — item.area는 미존재.
```

`createEmptyBgt()` 반환 객체에 신규 필드 초기값:

```ts
function createEmptyBgt(): BurdenedGiftTransferTaxInput {
  return {
    acquisitionDate: undefined as unknown as Date,
    standardPriceAtAcquisition: 0,
    // 신규: 모두 undefined (명시적 미선택과 구분 가능)
    valuationMode: undefined,
    marketValueAtTransfer: undefined,
    acquisitionMethod: undefined,
    actualAcquisitionTotal: undefined,
    capitalExpenditure: undefined,
    transferExpense: undefined,
    landStdPriceAtTransfer: undefined,
  };
}
```

`hasData()` 확장 — OFF 전환 시 경고 판단:

```ts
function hasData(bgt: BurdenedGiftTransferTaxInput): boolean {
  return (
    !!bgt.acquisitionDate ||
    bgt.standardPriceAtAcquisition > 0 ||
    bgt.isHousing !== undefined ||
    bgt.isOneHousehold !== undefined ||
    !!bgt.residencePeriodMonths ||
    !!bgt.householdHousingCount ||
    // 신규 필드
    !!bgt.valuationMode ||
    (bgt.marketValueAtTransfer ?? 0) > 0 ||
    !!bgt.acquisitionMethod ||
    (bgt.actualAcquisitionTotal ?? 0) > 0 ||
    (bgt.capitalExpenditure ?? 0) > 0 ||
    (bgt.transferExpense ?? 0) > 0 ||
    (bgt.landStdPriceAtTransfer ?? 0) > 0
  );
}
```

---

## 5. UI 입력 위젯 설계 (⑤) — `BurdenedGiftTransferSection.tsx`

### 5.1 전체 레이아웃 (토글 ON 후 내부 순서 = 엔진 처리 순서)

```
┌─ ToggleCard "양도소득세 함께 계산 (소득세법 §88)" (sky) ─────────────────────┐
│  기존 안내 문구                                                              │
│                                                                            │
│  ┌─ [신규 ①] 증여재산 평가방식 ─────────────────────────────────────────┐   │
│  │  RadioCardGroup (name="bgtValuationMode", layout="stack")           │   │
│  │  ○ 상증법 기준시가   보충적평가 (개별공시지가 + 건물기준시가)           │   │
│  │  ○ 상증법 시가       매매사례·감정·보상·경매·공매가 (§60②)            │   │
│  └──────────────────────────────────────────────────────────────────┘   │
│                                                                            │
│  [기준시가 모드 or 미선택] ← 아래 K-4/K-5 박스 숨김, 기존 필드만 표시        │
│                                                                            │
│  [시가 모드 선택 시만 표시]                                                  │
│  ┌─ [신규 ②] 시가 평가액 (분모 C) ──────────────────────────────────────┐   │
│  │  FieldCard "시가 평가액 (총액, 원)"                                  │   │
│  │    hint: 증여재산 시가 평가액 — 양도가액 안분의 분모로 사용됩니다.     │   │
│  │    (소령 §159①1호 A괄호 해제 → 시가 평가 시 실지 또는 환산 선택)     │   │
│  │    [CurrencyInput, data-testid="bg-acq-market-value"]              │   │
│  └──────────────────────────────────────────────────────────────────┘   │
│                                                                            │
│  ┌─ [신규 ③] 취득가액 산정방식 ────────────────────────────────────────┐   │
│  │  FieldCard "취득가액 산정방식 (§100① 일치원칙)"                     │   │
│  │    trailing: LawArticleModal "소득세법 §100" + "소령 §176의2"       │   │
│  │  RadioCardGroup (name="bgtAcquisitionMethod", layout="stack")      │   │
│  │  ○ 실지취득가액 안분    증여자의 실제 취득가액 확인 시               │   │
│  │                        실지취득가액 × 채무비율 (§97①1호가목)         │   │
│  │  ○ 환산취득가액          실지취득가 불명 시                          │   │
│  │                        양도가액 × 취득기준시가 ÷ 양도기준시가        │   │
│  │                        (소령 §176의2②2호) + 개산공제 3% 자동 적용   │   │
│  └──────────────────────────────────────────────────────────────────┘   │
│                                                                            │
│  [acquisitionMethod="actual" 시만] K-4 실지취득가 박스                       │
│  [acquisitionMethod="converted" 시만] K-5 환산 안내 박스                     │
│                                                                            │
│  ─── 기존 category별 취득 정보 (취득일·취득기준시가·주택여부 등) ────────────  │
│  ─── [land 신규] 양도시 토지 기준시가 위젯 ────────────────────────────────  │
└────────────────────────────────────────────────────────────────────────┘
```

### 5.2 증여재산 평가방식 RadioCardGroup (①)

```tsx
// BurdenedGiftTransferSection 내부 — ToggleCard children 최상단에 배치
// valuationMode 미선택(undefined)은 기준시가 mode fallback — validation에서 명시적 "" 차단

const BGT_VALUATION_MODE_OPTIONS = [
  {
    value: "sangjeungbeop_standard",
    label: "상증법 기준시가",
    description: "보충적평가 (개별공시지가 + 건물기준시가) — 취득가액 자동 안분",
  },
  {
    value: "sangjeungbeop_market",
    label: "상증법 시가",
    description: "매매사례·감정·보상·경매·공매가 (§60②) — 실지 또는 환산 선택 필요",
  },
] as const;

<FieldCard
  label="증여재산 평가방식"
  hint="소령 §159①1호 A괄호: 기준시가 평가 시 취득가액도 기준시가 강제. 시가 평가 시 실지 또는 환산 선택."
>
  <RadioCardGroup
    name="bgtValuationMode"
    layout="stack"
    value={bgt.valuationMode || ""}
    onChange={(v) => set({ valuationMode: v as "sangjeungbeop_standard" | "sangjeungbeop_market" })}
    options={BGT_VALUATION_MODE_OPTIONS}
  />
</FieldCard>
```

testid: `bg-valuation-mode-std` (기준시가), `bg-valuation-mode-mkt` (시가)

### 5.3 시가 모드 — 시가 평가액 입력 (②)

`bgt.valuationMode === "sangjeungbeop_market"` 시만 표시:

```
FieldCard "시가 평가액 (총액, 원)" required
  hint: "증여재산 시가 평가액 총액 — 양도가액·취득가액 안분의 분모(C)입니다."
  CurrencyInput, data-testid="bg-acq-market-value"
```

### 5.4 시가 모드 — 취득가액 산정방식 RadioCardGroup (③)

`bgt.valuationMode === "sangjeungbeop_market"` 시만 표시:

```tsx
const BGT_ACQUISITION_METHOD_OPTIONS = [
  {
    value: "actual",
    label: "실지취득가액 안분",
    description: "증여자의 실제 취득가액 확인 시 — 실지취득가액 × 채무비율 (§97①1호가목). 개산공제 미적용.",
  },
  {
    value: "converted",
    label: "환산취득가액",
    description: "실지취득가 불명 시 — 양도가액 × 취득기준시가 ÷ 양도기준시가 (§176의2②2호) + 개산공제 3% 자동 적용.",
  },
] as const;

<FieldCard
  label="취득가액 산정방식 (§100① 일치원칙)"
  hint="소득세법 §100①: 양도가액을 시가로 산정한 경우 취득가액도 실지거래가액 또는 환산취득가액으로 산정."
  trailing={
    <div className="flex flex-wrap items-center gap-1.5">
      <LawArticleModal legalBasis="소득세법 §100" label="§100①" />
      <LawArticleModal legalBasis="소득세법 시행령 §176의2" label="시행령 §176의2" />
    </div>
  }
>
  <RadioCardGroup
    name="bgtAcquisitionMethod"
    layout="stack"
    value={bgt.acquisitionMethod || ""}
    onChange={(v) => set({ acquisitionMethod: v as "actual" | "converted" })}
    options={BGT_ACQUISITION_METHOD_OPTIONS}
  />
</FieldCard>
```

testid: `bg-acq-method-actual`, `bg-acq-method-converted`

### 5.5 K-4 실지취득가 박스 (`acquisitionMethod === "actual"` 시만)

amber tone 박스. 기존 `BurdenedGiftBlock.tsx:199-300` 패턴 차용.

```
┌─ K-4 실지취득가액 안분 ──────────────────── (amber tone) ─────────────────┐
│  ⓘ 증여자의 실제 취득가액을 입력합니다. 개산공제는 적용되지 않습니다.      │
│                                                                          │
│  [전 부동산 category 공통 — land 단일 진실 확정 §4]                       │
│  real_estate_land·real_estate_building·real_estate_apartment:            │
│    FieldCard "실지취득가액 (총액, 원)" required                          │
│      hint: "취득 당시 실제 지급한 금액 총액.                             │
│             토지/건물은 취득기준시가 비율로 자동 배분됩니다."             │
│      CurrencyInput, write→actualAcquisitionTotal,                       │
│      data-testid="bg-acq-actual-total"                                 │
│      (land도 동일 필드 — buildingStdPriceAtAcquisition=0이라 토지 전액   │
│       배분 성립. 별도 land 전용 위젯/필드 없음.)                          │
│                                                                          │
│  공통 (선택 — 실비):                                                     │
│    FieldCard "자본적지출 (§163③)" optional                              │
│      hint: "감가상각비 제외 시설개량·증축 등 지출액 (원). 채무비율 안분." │
│      CurrencyInput, data-testid="bg-acq-capex"                         │
│    FieldCard "양도비 (§163⑤)" optional                                 │
│      hint: "중개수수료·광고비·소송비 등 양도에 소요된 비용 (원)."       │
│      CurrencyInput, data-testid="bg-acq-transfer-exp"                  │
│                                                                          │
│  ★ 자본적지출·양도비는 body 최상위로 전달 (burdenedGiftInfo 안 금지)    │
└──────────────────────────────────────────────────────────────────────┘
```

### 5.6 K-5 환산취득가 박스 (`acquisitionMethod === "converted"` 시만)

sky tone 안내 박스. 입력 없음(취득기준시가는 기존 `standardPriceAtAcquisition` 공유).

```
┌─ K-5 환산취득가액 ─────────────────────── (sky tone) ─────────────────────┐
│  양도가액 × (취득시 기준시가 ÷ 양도시 기준시가)로 자동 계산됩니다.         │
│  (소득세법 시행령 §176의2②2호)                                            │
│  개산공제 3%가 자동으로 적용됩니다. (소령 §163⑥)                          │
│                                                                          │
│  필요 입력:                                                              │
│  - 취득시 기준시가: 아래 취득 정보에서 입력 (기존 필드)                  │
│  - 양도시 기준시가: 아래 취득 정보에서 입력 (기존 필드, housing·apt)     │
│    ★ real_estate_land: 양도시 토지 기준시가 — 아래 신규 필드 필수 입력   │
└──────────────────────────────────────────────────────────────────────┘
```

### 5.7 land 분기 — 양도시 토지 기준시가 위젯 신규 추가 (치명 결함 해소)

**현황 (실측)**: 기존 land 분기(`BurdenedGiftTransferSection.tsx:202-246`)에 양도시 기준시가
위젯이 전혀 없어, 표준모드 K-1~K-3 land도 양도차익 안분 분모가 항상 0인 기존 결함이 있다.

신규 `landStdPriceAtTransfer` 필드를 `LandPriceLookupField`로 추가한다.

배치 위치: land 분기 내 취득시 기준시가(`LandPriceLookupField`) 다음, 비사업용 토지 토글 위.

```
[real_estate_land 분기 내]

  FieldCard "취득시 개별공시지가 (원/㎡)" required  ← 기존 (standardPriceAtAcquisition)
    LandPriceLookupField (area={item.areaSqm} prop 전달 — 총액 산출 필수)
      ★ 현행 코드(BurdenedGiftTransferSection.tsx:218-223)는 area 미전달 → 취득시도
        단가 저장 결함 동일. area={item.areaSqm} 추가로 정정.

  [신규] FieldCard "양도시 토지 기준시가 (원)" required  ← 항상 표시 (표준모드 결함 해소 포함)
    hint: "증여일(양도일) 현재 개별공시지가 × 면적 총액.
           §159 양도차익 안분 및 K-5 환산취득가 계산에 사용됩니다."
    <div data-testid="bg-land-std-at-transfer">  ← ★ 래퍼 div에 testid 부착
      <LandPriceLookupField
        pricePerSqm={bgt.landStdPriceAtTransfer > 0 ? String(bgt.landStdPriceAtTransfer) : ""}
        onPricePerSqmChange={(v) => set({ landStdPriceAtTransfer: parseAmount(v) || 0 })}
        referenceDate={dateToStr(증여일)}  // Step 1 또는 item의 증여일자 주입
        jibun={jibun}
        label="양도시(증여일) 개별공시지가 (원/㎡)"
        hint="증여일 기준 개별공시지가 (원/㎡). 면적을 입력하면 총액이 자동 계산됩니다."
        area={item.areaSqm}  // ★ area prop 전달 필수 — 미전달 시 단가 저장(엔진 총액 소비와 불일치)
      />
    </div>

  ToggleCard 비사업용 토지 ← 기존
```

**★ testid는 래퍼 `<div data-testid="bg-land-std-at-transfer">`에 부착** (기존
`BurdenedGiftTransferSection.tsx:215` `<div data-testid="bg-transfer-acq-stdprice">` 패턴과 동일).
`LandPriceLookupFieldProps`(`LandPriceLookupField.tsx:30-47`)에는 `data-testid`가 없고 `...rest`
spread도 없어, 컴포넌트에 직접 prop으로 부착하면 침묵 drop되어 DOM에 도달하지 않는다(E2E
selector 실패). 반드시 래퍼 div로 감쌀 것.

**★ 토지 단위 비대칭 해결 방침 (a) 채택**: `area={item.areaSqm}` prop 전달 + 총액 자동 산출.
EstateItem의 면적 필드명은 `areaSqm`(`inheritance-gift-estate.types.ts:235`)이며 `area` 필드는
존재하지 않는다 — `area={item.area}`로 쓰면 항상 undefined가 되어 `LandPriceLookupField`가
area 미전달 분기(`LandPriceLookupField.tsx:114` `numericPrice > 0 && area && area > 0`)로 떨어져
총액 환산이 일어나지 않고 단가가 그대로 저장된다(엔진 총액 소비와 불일치). 신규(양도시)·기존(취득시)
두 위젯 모두 `area={item.areaSqm}`로 통일. (`feedback_3point_input_consistency`: 다시점 기준시가는
면적-곱 총액 단일 기준)

**★ areaSqm 미입력(undefined) 방어**: areaSqm가 미입력이면 총액 환산이 불가하므로
단가 저장 결함이 재발한다. 증여 자산 카드에 면적(areaSqm) 입력란이 존재하는지 Pre-Do에서
grep 확인하고, land + 시가/표준 모드 시 areaSqm 미입력 차단을 ⑧ validation에 추가할지 Do 시 확정.

---

## 6. validation 추가 규칙 (⑧)

`components/calc/gift-tax-form-shared.tsx:265-317` 기존 부담부증여 validation 블록에 추가.

```
[기존 검사 유지]
  1. 취득일 필수
  2. 취득시 기준시가 필수
  3. 양도시 기준시가 필수 (land 제외 → land 위젯 추가 후 포함으로 변경)

[신규 추가]
  4. valuationMode === "" (명시적 미선택) →
     "증여재산 평가방식을 선택하세요 (기준시가 또는 시가)."

  5. valuationMode === "sangjeungbeop_market" 시:
     a. marketValueAtTransfer 미입력(0) → "시가 모드 — 증여재산 시가 평가액을 입력하세요."
     b. acquisitionMethod === "" or undefined → "시가 모드 — 취득가액 산정방식(실지·환산)을 선택하세요."
     c. acquisitionMethod === "actual" 시:
        - 모든 부동산 category(real_estate_land·real_estate_building·real_estate_apartment): actualAcquisitionTotal 미입력 → "실지취득가액(총액)을 입력하세요."
          (land 단일 진실 확정 §4: land도 actualAcquisitionTotal 단일 필드 사용 — actualLandAcquisitionPrice 미사용)
     d. (삭제) converted + land의 landStdPriceAtTransfer 차단은 검사 6으로 위임 (중복 차단 제거).

  6. [land 표준모드·K-5 converted 공통] real_estate_land + landStdPriceAtTransfer === 0 or undefined →
     "양도시 토지 기준시가를 입력하세요 (§159 양도차익 안분에 필요)."
     (기존 양도시 기준시가 검사 `propertyType!=='land'` 예외 해제 후 대체)
     ★ 표준모드(K-1~K-3)·K-5 환산(converted) 모두 land는 양도시 토지 기준시가가 필수이므로
       단일 검사로 일원화한다. Zod required(0 허용) + 엔진 0 침묵(STEP 4
       landStdPriceAtTransfer===0 → 환산취득가/양도차익 안분 분모 0) 이중 함정을 이 검사 하나로 차단.

[기존 검사 유지]
  7. 1세대1주택 거주기간 필수 (ON 시)
  8. assumedDebt > 0 필수
```

**⑧ ↔ ④ 동기화**:
- `valuationMode` undefined/`"sangjeungbeop_standard"` → 기준시가 모드 fallback 허용 (회귀 보존).
- 시가 모드(`"sangjeungbeop_market"`)에서만 5a~5d 검사 실행.
- K-4 `actualAcquisitionTotal` 미입력 → 차단 (자동 0 처리 금지 — `feedback_no_silent_apportion_fallback`).
- K-5 land `landStdPriceAtTransfer` 미입력 → 차단 (엔진 0 침묵 방어).
- ★ **valuationMode는 Zod required** — `buildGiftBurdenedTransferBody`(④)가 항상
  `sangjeungbeop_standard` 또는 `sangjeungbeop_market` 중 하나를 body에 전송해야 한다(undefined 금지).
  UI 미선택(undefined)은 ④ 변환 내부에서 `"sangjeungbeop_standard"`로 확정 후 전달.
  ⑧↔④ fallback 동기화: UI undefined=기준시가 통과, body=항상 string 중 하나.

---

## 7. 결과 카드 설계 (⑦) — `BurdenedTransferTaxResultCard.tsx`

### 7.1 현황

`result.transferBurdenedGiftBreakdown`을 현재 전혀 참조하지 않는다(grep 0건, 실측).
`result.usedEstimatedAcquisition` + flat 필드만 읽으며, 안내 문구가 '환산취득가액…개산공제'로
고정되어 있다. K-4 actual 경로를 환산·개산공제로 오표시할 위험이 있다.

### 7.2 추가 작업

`SingleTransferResultCard` 내부에서 `acquisitionMethodUsed` 를 읽어 3경로 분기:

```tsx
const acquisitionMethodUsed =
  result.transferBurdenedGiftBreakdown?.acquisitionMethodUsed;

// ★ 실비/개산공제 표시 금액 소스 (치명 결함 정정):
//   부담부증여 경로는 엔진 STEP 0.48에서 useEstimatedAcquisition=false 강제
//   (transfer-tax-burdened-gift-step.ts:57) → transfer-tax.ts:734
//   `estimatedDeduction: usedEstimated ? estimatedDeduction : undefined`에 의해
//   부담부증여 result.estimatedDeduction은 항상 undefined.
//   실비·개산공제 실제 값은 perAsset.{land,building}.estimatedDeduction 합 = result.expenses
//   (transfer-tax.ts:736 = workingInput.expenses = totalEstimatedDeduction, step.ts:54)에 들어간다.
//   따라서 result.estimatedDeduction이 아니라 perAsset 합(또는 result.expenses)을 읽어야 한다.
const perAsset = result.transferBurdenedGiftBreakdown?.perAsset;
const necessaryExpenseTotal =
  (perAsset?.land.estimatedDeduction ?? 0) +
  (perAsset?.building.estimatedDeduction ?? 0);
// (대안: result.expenses 사용 가능 — 동일 값. perAsset 합이 자산별 추적에 더 명확.)

// 방안 (b) 채택 (Simplicity First): BurdenedTransferTaxResultCard 내부 직접 분기
// 코드 중복이 과도하면 Do 시 BurdenedGiftDetailCard 재사용(a)으로 전환

// 기존 usedEstimatedAcquisition 가드 + "환산·개산공제" 고정 문구를 아래 3분기로 교체:
// ★ usedEstimatedAcquisition 기반 legacy fallback 조건은 부담부증여에서 항상 false라
//   영원히 발화하지 않는 dead 조건 → acquisitionMethodUsed 단독 분기로 단순화.

{acquisitionMethodUsed === "actual" && (
  <p className="text-amber-700 dark:text-amber-300">
    ※ 실지취득가액 안분 (소령 §159①1호 본문 · §97①1호가목) — 개산공제 미적용
    {necessaryExpenseTotal > 0 &&
      ` / 실비 안분액 ${formatKRW(necessaryExpenseTotal)}`}
  </p>
)}

{acquisitionMethodUsed === "converted" && (
  <p className="text-amber-700 dark:text-amber-300">
    ※ 환산취득가액 (양도가액 × 취득기준시가 ÷ 양도기준시가) + 개산공제 3% 적용
    {necessaryExpenseTotal > 0 &&
      ` (${formatKRW(necessaryExpenseTotal)})`}
    {" "}(소령 §176의2②2호 · §163⑥)
  </p>
)}

{acquisitionMethodUsed === "standard_price" && (
  <p className="text-xs text-muted-foreground">
    취득가액: 취득시 기준시가 × 채무비율 안분 (소령 §159①1호 A괄호)
  </p>
)}
```

**undefined fallback (breakdown 없음 = legacy 비-부담부증여 result)**: `acquisitionMethodUsed`가
undefined인 것은 `transferBurdenedGiftBreakdown` 자체가 없는 경우(부담부증여 경로 미진입)이므로,
이 경우에만 기존 flat 필드 표시를 유지한다. 부담부증여 경로 result는 항상
`acquisitionMethodUsed`가 채워지므로 위 3분기 중 하나가 발화한다.

### 7.3 산식 표시 원칙

- 산식 한국어 풀어쓰기 (`feedback_result_view_korean_formula`): 변수 약어·`floor()` 금지, 법정 용어.
- "원" 접미사 금지 (`feedback_no_won_suffix`).
- K-4: "실지취득가액 × 채무비율" 표시 + 실비 안분액(자본적지출·양도비) 표시 행.
  ★ 실비 안분액 금액 소스는 `result.estimatedDeduction`이 아니라 `perAsset.{land,building}.estimatedDeduction` 합(= `result.expenses`)이다. 부담부증여 result의 flat `estimatedDeduction`은 항상 undefined.
- K-5: "양도가액 × 취득기준시가/양도기준시가 + 개산공제 3%" 표시.
- K-1~K-3: "취득시 기준시가 × 채무비율 안분" 서브텍스트.

---

## 8. Silent fallback / 자동 안분 식별 (케이스별)

| 필드 | 위험한 자동 처리 | 올바른 처리 | 정책 근거 |
|---|---|---|---|
| `valuationMode` 미선택 | 기준시가로 자동 진행 | undefined/기준시가 → 회귀 허용 / 명시 "" → 차단 | `feedback_no_silent_apportion_fallback` |
| `acquisitionMethod` 미선택 (시가 모드) | K-1~K-3 fallback | 차단 | 동상 |
| K-4 `actualAcquisitionTotal` 미입력 | 0으로 처리 → 취득가 0원 | 차단 | 동상 |
| `landStdPriceAtTransfer` 미입력 (K-5 land) | `item.standardPrice` 자동 대입 | 차단 | 동상 + Zod+엔진 0 침묵 이중 함정 |
| `capitalExpenditure`·`transferExpense` 미입력 | 0 자동 처리 | undefined로 전달 (선택 입력) | 선택 실비 — 차단 불필요 |
| K-4 `actualAcquisitionTotal` 입력 + 토지/건물 분리 미입력 | 에러 처리 | 취득기준시가 비율로 자동 배분 허용 (엔진 `burdened-gift-apportionment.ts:302-306`) | 법적 비율 배분, fallback 금지 대상 아님 |

---

## 9. Cross-field 동기화 — useEffect 금지 선언

| 트리거 필드 | 갱신 대상 | 구현 패턴 |
|---|---|---|
| `valuationMode` 변경 | K-4/K-5 박스 노출 여부 | `isMarketMode` = `bgt.valuationMode === "sangjeungbeop_market"` (파생값, useMemo 또는 조건부 렌더) |
| `acquisitionMethod` 변경 | K-4/K-5 박스 노출 여부 | `isActual`/`isConverted` (파생값, 조건부 렌더) |
| `category` (item) | K-4 입력 필드 분기 | category는 item 레벨, 파생 — onChange 없음 |

**`useEffect → store` 미러링 금지** (`feedback_useeffect_store_mirror_forbidden`). 모든 cross-field
동기화는 `onChange` 직접 호출 또는 `useMemo` 파생값.

---

## 10. 위젯 바인딩 / testid 전체 목록

| 필드 | 위젯 | testid |
|---|---|---|
| [신규] 평가모드 | `RadioCardGroup` | `bg-valuation-mode-std`(기준시가), `bg-valuation-mode-mkt`(시가) |
| [신규] 시가 평가액 | `CurrencyInput` | `bg-acq-market-value` |
| [신규] 산정방식 | `RadioCardGroup` | `bg-acq-method-actual`(실지), `bg-acq-method-converted`(환산) |
| [신규] K-4 실지취득가 (land·building·apt 공통, write→actualAcquisitionTotal) | `CurrencyInput` | `bg-acq-actual-total` |
| [신규] K-4 자본적지출 | `CurrencyInput` | `bg-acq-capex` |
| [신규] K-4 양도비 | `CurrencyInput` | `bg-acq-transfer-exp` |
| [신규] land 양도시 기준시가 | `LandPriceLookupField` | `bg-land-std-at-transfer` |
| [기존] 토글 | `ToggleCard` | `bg-transfer-toggle` |
| [기존] 취득일 | `DateInput` | `bg-transfer-acq-date` |
| [기존] 취득시 기준시가 | `CurrencyInput`/`LandPriceLookupField` | `bg-transfer-acq-stdprice` |
| [기존] 주택 여부 | `ToggleCard` | `bg-transfer-is-housing` |
| [기존] 1세대1주택 | `ToggleCard` | `bg-transfer-one-house` |
| [기존] 세대주택수 | `DecimalInput` | `bg-transfer-house-count` |
| [기존] 양도시 조정지역 | `ToggleCard` | `bg-transfer-regulated` |
| [기존] 취득시 조정지역 | `ToggleCard` | `bg-transfer-regulated-acq` |
| [기존] 거주기간 | `DecimalInput` | `bg-transfer-residence` |
| [기존] 비사업용 토지 | `ToggleCard` | `bg-transfer-nonbiz-land` |

---

## 11. Anchor 기대값 (Pre-Do 검증)

### A-body-K4 (`gift-burdened-transfer-api.test.ts` 신규)

```ts
// 입력
const bgt: BurdenedGiftTransferTaxInput = {
  acquisitionDate: new Date("2015-01-01"),
  standardPriceAtAcquisition: 100_000_000,
  valuationMode: "sangjeungbeop_market",
  marketValueAtTransfer: 500_000_000,
  acquisitionMethod: "actual",
  actualAcquisitionTotal: 200_000_000,
  capitalExpenditure: 5_000_000,
};
const assumedDebt = 200_000_000;

// 기대 body (buildGiftBurdenedTransferBody 산출)
//   burdenedGiftInfo.valuationMode === "sangjeungbeop_market"
//   burdenedGiftInfo.acquisitionMethod === "actual"
//   burdenedGiftInfo.actualAcquisitionTotal === 200_000_000
//   burdenedGiftInfo.marketValueAtTransfer === 500_000_000  ← 분모 C
//   body.capitalExpenditure === 5_000_000                   ← 최상위 (burdenedGiftInfo 밖)
//   body.transferExpense === undefined

// ★ K-4 actual 엔진 result 표시 소스 검증:
//   result.estimatedDeduction === undefined   ← actual도 useEstimatedAcquisition=false → 항상 undefined
//   실비(자본적지출 채무비율 안분액)는 perAsset.{land,building}.estimatedDeduction 슬롯에 반영
//   (= result.expenses) → §7.2 실비 안분액 표시는 perAsset 합(= result.expenses)을 읽어야 함
```

### A-K5 (`__tests__/tax-engine/transfer-tax/gift-burdened-transfer-acq-cost.spec.ts` 신규)

```ts
// 입력: 주택(housing), 시가 모드, 환산
// marketValueAtTransfer=500_000_000 (분모 C)
// assumedDebtForGift=200_000_000 (채무액 B)
// standardPriceAtAcquisition=100_000_000 (취득 기준시가)
// item.standardPrice=400_000_000 (양도시 기준시가)

// 엔진 계산:
//   양도가액 = 500_000_000 × 200_000_000/500_000_000 = 200_000_000
//   환산취득가액 = 200_000_000 × (100_000_000/400_000_000) = 50_000_000
//   개산공제 = floor(50_000_000 × 3/100) = 1_500_000
//   양도차익 = 200_000_000 - 50_000_000 - 1_500_000 = 148_500_000

// ★ 결과 표시 소스 검증 (치명 결함 실증):
//   result.estimatedDeduction === undefined   ← 부담부증여는 항상 undefined (flat 필드 미사용)
//   (result.transferBurdenedGiftBreakdown.perAsset.land.estimatedDeduction
//    + perAsset.building.estimatedDeduction) === 1_500_000  ← 실제 개산공제는 perAsset 합
//   result.expenses === 1_500_000                            ← 동일 값(= totalEstimatedDeduction)
//   → §7.2 결과 카드가 result.estimatedDeduction을 읽으면 항상 빈 값(침묵 미표시)임을 입증.
```

### A-val3 (K-5 land + landStdPriceAtTransfer=0 → 차단)

```ts
// 입력
const item: EstateItem = {
  category: "real_estate_land",
  burdenedGiftTransferTax: {
    valuationMode: "sangjeungbeop_market",
    acquisitionMethod: "converted",
    landStdPriceAtTransfer: 0,  // 미입력
    ...
  }
};
// 기대: ⑧ validation 오류 메시지 반환 (엔진 미도달)
// "양도시 토지 기준시가를 입력하세요 (§159 양도차익 안분에 필요)."
// ★ 검사 6과 동일 문구로 통일 (표준모드·K-5 공통 메시지, §6 참조)
```

### A-회귀 (K-1~K-3 기준시가 모드 회귀)

```
입력: valuationMode=undefined
기대: 기존 K-1~K-3 결과 불변 (기존 anchor 재실행)
      body.burdenedGiftInfo.valuationMode="sangjeungbeop_standard"
```

---

## 12. E2E 시나리오 (`e2e/gift-burdened-transfer.spec.ts` 확장)

기존 spec 확장 — 신규 케이스 추가:

1. **K-4 실지 흐름**:
   - 증여세 마법사 → 아파트 자산 + 채무인수 입력
   - 양도소득세 토글 ON
   - [신규] 증여재산 평가방식 "상증법 시가" 선택 → 시가 평가액 입력
   - [신규] 취득가액 산정방식 "실지취득가액 안분" 선택 → 실지취득가 입력
   - 계산 → 결과 카드 "실지취득가액 안분 (§159①1호)" 표시 확인

2. **K-5 환산 흐름**:
   - 증여재산 평가방식 "상증법 시가" → 시가 평가액 입력
   - 취득가액 산정방식 "환산취득가액" 선택 → K-5 안내 박스 확인
   - 계산 → 결과 카드 "환산취득가액 + 개산공제 3% 적용" 표시 확인

3. **시가 모드 + 산정방식 미선택 → validation 차단 확인**:
   - 증여재산 평가방식 "상증법 시가" 선택 후 산정방식 미선택 → "계산하기" → 오류 메시지

4. **기준시가 모드 회귀** (기존 케이스 재실행 — 회귀 0):
   - 평가방식 미선택 or "상증법 기준시가" → 기존 결과와 동일

5. **land K-5 landStdPriceAtTransfer 미입력 → 차단**:
   - 토지 자산 + 시가 모드 + 환산 선택 + `landStdPriceAtTransfer` 미입력 → 오류 메시지

**★ E2E 함정**:
- `setupTransferApiMock`은 Zod 우회 → body 형상 단위 anchor(`A-body-K4`)로 별도 보호.
- worktree E2E는 `E2E_PORT=3100` 격리 (`feedback_e2e_worktree_port_isolation`).
- `getByLabel("일")` 토글 오매칭 → `textbox` role 한정 (기존 교훈).

---

## 13. 800줄 정책 점검

`BurdenedGiftTransferSection.tsx` 현행 614줄. 신규 추가 분량 예상:
- 평가모드/산정방식 RadioCardGroup + 시가 박스 + K-4 박스 + K-5 박스 + land 양도시 기준시가: ~120줄
- 총 예상: ~730줄 → 800줄 이내.

추가 후 750줄 초과 시 `BgtValuationSection.tsx` (평가모드+K-4/K-5 박스) 분리 추출.

`BurdenedTransferTaxResultCard.tsx` 현행 216줄. 분기 추가 후 ~240줄 → 정책 이내.

---

## 14. Definition of Done 자가 점검 체크리스트

- [ ] 디자인 문서 7개 지점 사전 명세 완료 (본 문서)
- [ ] `BurdenedGiftTransferTaxInput` 7필드 추가 (①②③)
- [ ] `createEmptyBgt()` 신규 필드 undefined 초기화 (②)
- [ ] `buildGiftBurdenedTransferBody` valuationMode 고정 해제 + K-4/K-5 매핑 + 실비 최상위 (④⑬)
- [ ] UI 위젯 평가모드 RadioCardGroup + 시가 평가액 + 산정방식 RadioCardGroup + K-4 박스 + K-5 안내 + land 양도시 기준시가 (⑤)
- [ ] ⑥ 사이드바 N/A 확인
- [ ] 결과 카드 3경로 분기 + actual 오표시 정정 (⑦)
- [ ] validation 4~6번 검사 추가 (⑧)
- [ ] `capitalExpenditure`·`transferExpense` top-level Zod 이미 존재 grep 확인 (⑫)
- [ ] 실비 2종 body 최상위 전달 확인 (⑬)
- [ ] ⑨⑩⑪⑭ N/A 확인
- [ ] land `area={item.areaSqm}` prop 전달 (취득시·양도시 두 위젯) + 총액 산출 단위 통일 확인 (item.area 미존재)
- [ ] land 양도시 기준시가 위젯 testid는 래퍼 div 부착 확인 (LandPriceLookupField 직접 부착 금지)
- [ ] Pre-Do anchor 3건 (A-body-K4, A-K5, A-val3) 작성 → 빨강 확인 → 디자인 환류
- [ ] `npx tsc --noEmit` 0건
- [ ] 기존 부담부증여 anchor·E2E 회귀 0
- [ ] E2E 신규 5케이스 작성·통과
- [ ] 브라우저 수동 확인 또는 미수행 명시

---

## 15. 리스크·함정 (UI 관점)

| 리스크 | UI 대응 |
|---|---|
| 실비 body 최상위 매핑 누락 (⑫⑬⑭ TS 미감지) | ④ API 변환 후 `grep body.capitalExpenditure` 자가점검 |
| RadioCardGroup OFF 상태 tone 배경 소멸 | `ToggleCard`·`RadioCardGroup` 내장 — 별도 처리 불필요 (OFF도 tone 유지) |
| land `areaSqm` 미전달 → 단가 저장 (엔진 총액 소비 불일치) | `LandPriceLookupField`에 `area={item.areaSqm}` prop 전달 필수 (item.area는 미존재 — areaSqm). 취득시·양도시 두 위젯 모두 적용 |
| `LandPriceLookupField`에 testid 직접 부착 → 침묵 drop | 래퍼 `<div data-testid="bg-land-std-at-transfer">`로 감쌈 (Props에 data-testid·...rest 없음) |
| K-4 actual '환산·개산공제' 오표시 | `acquisitionMethodUsed` 분기로 라벨 교체 (⑦) |
| K-5 land `landStdPriceAtTransfer=0` 엔진 침묵 0 계산 | val-3 차단 + A-val3 anchor |
| `valuationMode` 기존 자산 회귀 깨짐 | undefined → 기준시가 fallback 허용 (기존 동작 보존) |
| `useEffect → store` 미러링 무한 루프 | `isMarketMode`·`isActual`·`isConverted` 파생 조건부 렌더만 사용 |

---

## SCOPE OUT

- §114의2 환산취득 5% 가산세.
- §163⑨ 의제취득 케이스 (증여자 당초 취득이 제외 대상 외 상속·증여인 경우).
- 다자산 동시 부담부증여 양도세 (현행 단일 자산 제한 유지).
- 결정 3 공통화 (`gift-burdened-transfer-acquisition-cost.engine.design.md §7`): Do 시 매핑 복잡도 보고 후 결정.
