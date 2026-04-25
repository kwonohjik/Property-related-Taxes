# 토지/건물 취득일 분리 입력 기능 개발

---

## TODO LIST (단계별 작업 순서)

### PHASE 1 — 타입·스토어 기반 준비
- [x] **T1** `lib/tax-engine/types/transfer.types.ts` — `TransferTaxInput`에 분리 필드 11종 추가
- [x] **T2** `lib/stores/calc-wizard-store.ts` — `AssetForm`에 분리 필드 11종 추가 + `makeDefaultAsset()` 기본값 + `migrateAsset()` fallback (calc-wizard-asset.ts로 분리)

### PHASE 2 — 엔진 핵심 모듈
- [x] **T3** `lib/tax-engine/transfer-tax-split-gain.ts` 신규 생성 — `calcSplitGain()` 순수 함수 구현
- [x] **T4** `lib/tax-engine/transfer-tax-helpers.ts` — `calcTransferGain()` 수정
- [x] **T5** `lib/tax-engine/transfer-tax-helpers.ts` — `calcLongTermHoldingDeduction()` 수정
- [x] **T6** `lib/tax-engine/transfer-tax.ts` — orchestrator에서 `splitDetail` 연결

### PHASE 3 — API 연결
- [x] **T7** `lib/calc/transfer-tax-api.ts` — 분리 필드 전달 로직 추가
- [x] **T8** `lib/api/transfer-tax-schema.ts` + `app/api/calc/transfer/route.ts` — Zod 스키마 + 라우트 매핑

### PHASE 4 — UI 구현
- [ ] **T9** `components/calc/transfer/LandBuildingSplitSection.tsx` 신규 생성
- [ ] **T10** `components/calc/transfer/CompanionAcqPurchaseBlock.tsx` 수정
- [ ] **T11** `components/calc/transfer/CompanionAssetCard.tsx` — 새 props 콜백 연결

### PHASE 5 — 테스트
- [x] **T12** `__tests__/tax-engine/transfer-tax/land-building-split.test.ts` — 16 tests 모두 통과
- [x] **T13** `npm test` 전체 회귀 통과 (84 files / 1545 tests)

### PHASE 6 — 수동 검증 (개발 서버)
- [ ] **T14** `npm run dev` 후 UI 수동 검증
  - housing + 토글 ON + 안분 모드 → 결과 splitDetail note 확인
  - housing + 토글 ON + 실제 모드 → 입력값 그대로 사용 확인
  - building 자산 → 동일 동작 확인
  - 토글 OFF → 기존 단일 결과와 동일 확인

---

## Context

토지와 건물의 취득일이 다른 케이스(원시취득·신축·승계취득 시점 차이 등)는
양도소득세 계산 전반에서 공통적으로 발생합니다.

**적용 대상 (모두 포함)**
- **주택 (housing)**
  - 1세대1주택자 — L-3 거주공제 포함 장기보유공제 (최대 80%)
  - 2주택 이상 다주택자 — L-4 일반 장기보유공제 (최대 30%)
- **일반건물 (building)** — 상가·오피스·공장 등 비주거 건물
  - L-4 일반 장기보유공제 (최대 30%)

현재 시스템은 단일 `acquisitionDate` 필드만 있어
토지·건물 각각의 보유기간을 반영한 정밀 계산이 불가합니다.

이 기능을 추가하면 "일괄양도 + 개별취득" 케이스를
세법에 맞게 토지/건물 각각의 양도차익을 계산할 수 있습니다.

---

## 세법 처리 원칙 (소득세법 §95②, 소득령 §166⑥·§168②)

### 핵심 원칙
> **양도가액·취득가액·필요경비(자본적지출)·개산공제액을 토지와 건물 각각 구분하여 계산**
> 실제 가액이 확인되면 그 가액을 사용하고, 확인되지 않으면 **기준시가 비율로 안분**.

### 단계별 산식

**1단계: 토지/건물 안분 비율 결정 (기준시가 기준)**
```
토지 안분비율 = 토지 기준시가 / 전체 기준시가
건물 안분비율 = 건물 기준시가 / 전체 기준시가
```
- 토지 기준시가 = 개별공시지가(원/㎡) × 토지면적(㎡)
- 전체 기준시가 = housing의 경우 개별주택가격, building의 경우 토지+건물 기준시가 합계
- 건물 기준시가 = 전체 - 토지 (음수 방지로 max 0 클램핑)

**2단계: 토지/건물 양도가액**
```
토지 양도가액 = 입력값(있으면) 또는 전체 양도가액 × 토지 안분비율
건물 양도가액 = 입력값(있으면) 또는 전체 양도가액 × 건물 안분비율
```

**3단계: 토지/건물 취득가액**

(a) 실거래가 모드:
```
토지 취득가액 = 입력값(있으면) 또는 전체 취득가액 × 토지 안분비율
건물 취득가액 = 입력값(있으면) 또는 전체 취득가액 × 건물 안분비율
```

(b) 환산취득가 모드 (각각 환산 — 소득령 §176조의2):
```
토지 환산취득가 = 토지 양도가액 × (토지 취득시 기준시가 / 토지 양도시 기준시가)
건물 환산취득가 = 건물 양도가액 × (건물 취득시 기준시가 / 건물 양도시 기준시가)
```

(c) 감정가액 모드:
```
입력된 감정가액을 토지/건물 각각 입력 (실제 모드) 또는 안분 비율로 분리
```

**4단계: 토지/건물 필요경비(자본적지출)**
```
토지 자본적지출 = 입력값(있으면) 또는 전체 자본적지출 × 토지 안분비율
건물 자본적지출 = 입력값(있으면) 또는 전체 자본적지출 × 건물 안분비율
```

**5단계: 토지/건물 개산공제 (환산/감정 모드 전용 — 소득령 §163⑥)**
```
토지 개산공제 = 토지 취득시 기준시가 × 3% (토지는 §163⑥1호)
건물 개산공제 = 건물 취득시 기준시가 × 별도 비율 (건물은 §163⑥3호 등)
```
※ 단순화 위해 일단 토지·건물 모두 3% 적용 (현행 엔진 동작 유지)

**6단계: 토지/건물 양도차익**
```
토지 양도차익 = 토지 양도가액 - 토지 취득가액 - 토지 자본적지출 - 토지 개산공제
건물 양도차익 = 건물 양도가액 - 건물 취득가액 - 건물 자본적지출 - 건물 개산공제
```

**7단계: 토지/건물 장기보유특별공제 (각각 보유기간 적용)**
```
토지 보유연수 = landAcquisitionDate ~ transferDate
건물 보유연수 = acquisitionDate (= 건물 취득일/완공일) ~ transferDate

토지 공제율 = f(토지 보유연수, 거주연수*)
건물 공제율 = f(건물 보유연수, 거주연수*)

토지 장특공제 = 토지 양도차익 × 토지 공제율
건물 장특공제 = 건물 양도차익 × 건물 공제율
총 장특공제 = 토지 장특공제 + 건물 장특공제
```
*거주연수: housing 1세대1주택(L-3) 케이스에만 가산. 일반건물·다주택은 미적용

**공제율 산식**
| 케이스 | 자산종류 | 공제율 산식 | 상한 |
|-------|---------|-----------|------|
| **L-3 (1세대1주택)** | housing | `min(보유연수×4% + 거주연수×4%, 80%)` (보유≥3, 거주≥2) | 80% |
| **L-4 (일반/다주택/일반건물)** | housing·building | `min(보유연수×2%, 30%)` (보유≥3) | 30% |

**8단계: 합산 양도차익 → 후속 계산**
```
합산 양도차익 = 토지 양도차익 + 건물 양도차익
합산 장특공제 = 토지 장특공제 + 건물 장특공제
과세표준 = 합산 양도차익 - 합산 장특공제 - 기본공제(연 250만)
```

---

## 변경 파일 목록

| 레이어 | 파일 | 변경 내용 |
|--------|------|---------|
| **Store** | `lib/stores/calc-wizard-store.ts` | AssetForm에 토지/건물 분리 필드 9종 추가 |
| **UI** | `components/calc/transfer/CompanionAcqPurchaseBlock.tsx` | 토글 + 토지 취득일 + (옵션) 실제 분리 입력 모드 |
| **UI 신규** | `components/calc/transfer/LandBuildingSplitSection.tsx` | 토지/건물 각각 가액 입력 섹션 (실제 모드 전용) |
| **API 변환** | `lib/calc/transfer-tax-api.ts` | 토지/건물 분리 필드 전달 |
| **타입** | `lib/tax-engine/types/transfer.types.ts` | TransferTaxInput에 분리 필드 추가 |
| **엔진 신규** | `lib/tax-engine/transfer-tax-split-gain.ts` | 토지/건물 양도차익 분리 계산 모듈 |
| **엔진 수정** | `lib/tax-engine/transfer-tax-helpers.ts` | calcTransferGain·calcLongTermHoldingDeduction 분리 케이스 분기 |
| **테스트 신규** | `__tests__/tax-engine/transfer/land-building-split.test.ts` | 5종 시나리오 회귀 테스트 |

---

## 구현 상세

### 1. Store (`lib/stores/calc-wizard-store.ts`)

AssetForm 인터페이스에 필드 추가 (isSelfBuilt 인근):

```typescript
// 토지/건물 분리 (housing·building 공통)
hasSeperateLandAcquisitionDate: boolean;  // 분리 활성화 토글
landAcquisitionDate: string;              // 토지 취득일 (YYYY-MM-DD)

// 분리 입력 방식
landSplitMode: "apportioned" | "actual";  // 안분(기본) | 실제 분리 입력

// 실제 분리 입력 모드 — 모두 선택적, 미입력 시 안분 fallback
landTransferPrice: string;                // 토지 양도가액
buildingTransferPrice: string;            // 건물 양도가액
landAcquisitionPrice: string;             // 토지 취득가액
buildingAcquisitionPrice: string;         // 건물 취득가액
landDirectExpenses: string;               // 토지 자본적지출/필요경비
buildingDirectExpenses: string;           // 건물 자본적지출/필요경비

// 환산취득가 모드 시 토지/건물 양도시 기준시가 (분리 환산용)
landStandardPriceAtTransfer: string;      // 토지 양도시 기준시가
buildingStandardPriceAtTransfer: string;  // 건물 양도시 기준시가 (전체 - 토지로 자동 계산 가능)
```

`makeDefaultAsset()` 기본값:
```typescript
hasSeperateLandAcquisitionDate: false,
landAcquisitionDate: "",
landSplitMode: "apportioned",
landTransferPrice: "",
buildingTransferPrice: "",
landAcquisitionPrice: "",
buildingAcquisitionPrice: "",
landDirectExpenses: "",
buildingDirectExpenses: "",
landStandardPriceAtTransfer: "",
buildingStandardPriceAtTransfer: "",
```

`migrateAsset()`에 `?? 기본값` fallback 추가 (기존 데이터 호환).

---

### 2. UI 토글 + 토지 취득일 (`CompanionAcqPurchaseBlock.tsx`)

위치: 취득일 `DateInput` 필드(라인 148~158) 바로 아래.

**렌더 조건**: `assetKind === "housing"` 또는 `assetKind === "building"`

```tsx
{(props.assetKind === "housing" || props.assetKind === "building") && (
  <>
    <label className="flex items-center gap-2 text-sm cursor-pointer">
      <input
        type="checkbox"
        checked={props.hasSeperateLandAcquisitionDate}
        onChange={(e) => props.onHasSeperateLandAcquisitionDateChange(e.target.checked)}
      />
      토지와 건물의 취득일이 다른가요?
      <span className="text-xs text-muted-foreground">(원시취득·신축·승계취득 시점 차이)</span>
    </label>

    {props.hasSeperateLandAcquisitionDate && (
      <>
        <FieldCard label="토지 취득일" hint="등기부등본상 등기접수일 (소득령 §162①1호)">
          <DateInput
            value={props.landAcquisitionDate}
            onChange={props.onLandAcquisitionDateChange}
            onFocus={(e) => e.target.select()}
          />
        </FieldCard>

        <FieldCard label="가액 분리 방식" hint="실제 가액 미확인 시 기준시가 비율로 자동 안분">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => props.onLandSplitModeChange("apportioned")}
              className={props.landSplitMode === "apportioned" ? "...active" : "..."}
            >
              기준시가 비율 안분 (기본)
            </button>
            <button
              type="button"
              onClick={() => props.onLandSplitModeChange("actual")}
              className={props.landSplitMode === "actual" ? "...active" : "..."}
            >
              실제 분리 입력
            </button>
          </div>
        </FieldCard>

        {props.landSplitMode === "actual" && (
          <LandBuildingSplitSection {...분리 입력 props} />
        )}
      </>
    )}
  </>
)}
```

기존 `acquisitionDate` 레이블 조건부 변경:
- 분리 OFF → "취득일"
- 분리 ON → "건물 취득일 (사용승인일/매매 등기접수일)"

---

### 3. UI 신규 — 실제 분리 입력 (`LandBuildingSplitSection.tsx`)

```tsx
export function LandBuildingSplitSection(props: Props) {
  return (
    <div className="space-y-4 rounded-md border border-border p-4 bg-muted/30">
      <h4 className="text-sm font-semibold">토지/건물 각 가액 입력</h4>

      <div className="grid grid-cols-2 gap-3">
        {/* 양도가액 */}
        <FieldCard label="토지 양도가액">
          <CurrencyInput value={props.landTransferPrice} onChange={...} />
        </FieldCard>
        <FieldCard label="건물 양도가액">
          <CurrencyInput value={props.buildingTransferPrice} onChange={...} />
        </FieldCard>

        {/* 취득가액 — 실거래가 모드일 때만 */}
        {!props.useEstimatedAcquisition && (
          <>
            <FieldCard label="토지 취득가액">
              <CurrencyInput value={props.landAcquisitionPrice} onChange={...} />
            </FieldCard>
            <FieldCard label="건물 취득가액">
              <CurrencyInput value={props.buildingAcquisitionPrice} onChange={...} />
            </FieldCard>
          </>
        )}

        {/* 환산취득가 모드 시 토지/건물 양도시 기준시가 */}
        {props.useEstimatedAcquisition && (
          <>
            <FieldCard label="토지 양도시 기준시가">
              <CurrencyInput value={props.landStandardPriceAtTransfer} onChange={...} />
            </FieldCard>
            <FieldCard label="건물 양도시 기준시가" hint="전체 - 토지로 자동 계산 가능">
              <CurrencyInput value={props.buildingStandardPriceAtTransfer} onChange={...} />
            </FieldCard>
          </>
        )}

        {/* 필요경비 */}
        <FieldCard label="토지 자본적지출">
          <CurrencyInput value={props.landDirectExpenses} onChange={...} />
        </FieldCard>
        <FieldCard label="건물 자본적지출">
          <CurrencyInput value={props.buildingDirectExpenses} onChange={...} />
        </FieldCard>
      </div>

      <p className="text-xs text-muted-foreground">
        ※ 미입력 항목은 기준시가 비율로 자동 안분됩니다.
      </p>
    </div>
  );
}
```

---

### 4. API 변환 (`lib/calc/transfer-tax-api.ts`)

`buildSingleAssetInput()` 변환 시 추가:

```typescript
landAcquisitionDate: asset.hasSeperateLandAcquisitionDate && asset.landAcquisitionDate
  ? asset.landAcquisitionDate
  : undefined,
landSplitMode: asset.landSplitMode,
landTransferPrice: parseAmount(asset.landTransferPrice),         // undefined if empty
buildingTransferPrice: parseAmount(asset.buildingTransferPrice),
landAcquisitionPrice: parseAmount(asset.landAcquisitionPrice),
buildingAcquisitionPrice: parseAmount(asset.buildingAcquisitionPrice),
landDirectExpenses: parseAmount(asset.landDirectExpenses),
buildingDirectExpenses: parseAmount(asset.buildingDirectExpenses),
landStandardPriceAtTransfer: parseAmount(asset.landStandardPriceAtTransfer),
buildingStandardPriceAtTransfer: parseAmount(asset.buildingStandardPriceAtTransfer),
```

서버 라우트 Zod 스키마에 동일 필드 추가 (모두 optional).

---

### 5. 엔진 타입 (`lib/tax-engine/types/transfer.types.ts`)

`TransferTaxInput`에 추가:

```typescript
/** 토지 취득일 — housing·building에서 토지/건물 취득일이 다를 때 */
landAcquisitionDate?: Date;
/** 분리 입력 방식 */
landSplitMode?: "apportioned" | "actual";

/** 실제 분리 입력 (선택, 미제공 시 안분 fallback) */
landTransferPrice?: number;
buildingTransferPrice?: number;
landAcquisitionPrice?: number;
buildingAcquisitionPrice?: number;
landDirectExpenses?: number;
buildingDirectExpenses?: number;
landStandardPriceAtTransfer?: number;
buildingStandardPriceAtTransfer?: number;
```

---

### 6. 엔진 신규 모듈 (`lib/tax-engine/transfer-tax-split-gain.ts`)

토지/건물 분리 양도차익 계산 전담:

```typescript
export interface SplitGainResult {
  land: {
    transferPrice: number;
    acquisitionPrice: number;
    directExpenses: number;
    appraisalDeduction: number;
    gain: number;             // 양도차익
    holdingYears: number;
  };
  building: {
    transferPrice: number;
    acquisitionPrice: number;
    directExpenses: number;
    appraisalDeduction: number;
    gain: number;
    holdingYears: number;
  };
  apportionRatio: { land: number; building: number };
  note: string;
}

export function calcSplitGain(input: TransferTaxInput): SplitGainResult | null {
  if (!input.landAcquisitionDate) return null;
  if (input.propertyType !== "housing" && input.propertyType !== "building") return null;

  // ① 안분 비율 (기준시가)
  const landStdAtAcq = Math.floor(
    (input.standardPricePerSqmAtAcquisition ?? 0) * (input.acquisitionArea ?? 0)
  );
  const totalStdAtAcq = input.standardPriceAtAcquisition ?? 0;
  const buildingStdAtAcq = Math.max(totalStdAtAcq - landStdAtAcq, 0);
  const landRatio = totalStdAtAcq > 0 ? landStdAtAcq / totalStdAtAcq : 0.5;
  const buildingRatio = 1 - landRatio;

  // ② 양도가액
  const landTransferPrice = input.landTransferPrice
    ?? Math.floor(input.transferPrice * landRatio);
  const buildingTransferPrice = input.buildingTransferPrice
    ?? input.transferPrice - landTransferPrice;

  // ③ 취득가액 (실가/환산/감정 분기)
  let landAcqPrice: number, buildingAcqPrice: number;

  if (input.useEstimatedAcquisition) {
    // 환산취득가 — 토지/건물 각각 환산
    const landStdAtTransfer = input.landStandardPriceAtTransfer
      ?? Math.floor((input.standardPriceAtTransfer ?? 0) * landRatio);
    const buildingStdAtTransfer = input.buildingStandardPriceAtTransfer
      ?? Math.max((input.standardPriceAtTransfer ?? 0) - landStdAtTransfer, 0);

    landAcqPrice = landStdAtTransfer > 0
      ? Math.floor(landTransferPrice * (landStdAtAcq / landStdAtTransfer))
      : 0;
    buildingAcqPrice = buildingStdAtTransfer > 0
      ? Math.floor(buildingTransferPrice * (buildingStdAtAcq / buildingStdAtTransfer))
      : 0;
  } else if (input.acquisitionMethod === "appraisal") {
    landAcqPrice = input.landAcquisitionPrice
      ?? Math.floor((input.appraisalValue ?? input.acquisitionPrice) * landRatio);
    buildingAcqPrice = input.buildingAcquisitionPrice
      ?? (input.appraisalValue ?? input.acquisitionPrice) - landAcqPrice;
  } else {
    // 실거래가
    landAcqPrice = input.landAcquisitionPrice
      ?? Math.floor(input.acquisitionPrice * landRatio);
    buildingAcqPrice = input.buildingAcquisitionPrice
      ?? input.acquisitionPrice - landAcqPrice;
  }

  // ④ 필요경비 (자본적지출)
  const landDirectExp = input.landDirectExpenses
    ?? Math.floor((input.directExpenses ?? 0) * landRatio);
  const buildingDirectExp = input.buildingDirectExpenses
    ?? (input.directExpenses ?? 0) - landDirectExp;

  // ⑤ 개산공제 (환산취득가/감정가액 시)
  const usesEstOrAppraisal = input.useEstimatedAcquisition || input.acquisitionMethod === "appraisal";
  const landAppraisalDed = usesEstOrAppraisal ? applyRate(landStdAtAcq, 0.03) : 0;
  const buildingAppraisalDed = usesEstOrAppraisal ? applyRate(buildingStdAtAcq, 0.03) : 0;

  // ⑥ 양도차익
  const landGain = landTransferPrice - landAcqPrice - landDirectExp - landAppraisalDed;
  const buildingGain = buildingTransferPrice - buildingAcqPrice - buildingDirectExp - buildingAppraisalDed;

  // ⑦ 보유연수
  const { years: landYears } = calculateHoldingPeriod(input.landAcquisitionDate, input.transferDate);
  const { years: buildingYears } = calculateHoldingPeriod(input.acquisitionDate, input.transferDate);

  return {
    land: { transferPrice: landTransferPrice, acquisitionPrice: landAcqPrice, directExpenses: landDirectExp, appraisalDeduction: landAppraisalDed, gain: landGain, holdingYears: landYears },
    building: { transferPrice: buildingTransferPrice, acquisitionPrice: buildingAcqPrice, directExpenses: buildingDirectExp, appraisalDeduction: buildingAppraisalDed, gain: buildingGain, holdingYears: buildingYears },
    apportionRatio: { land: landRatio, building: buildingRatio },
    note: `토지 ${landYears}년 + 건물 ${buildingYears}년 분리 (안분비 토지 ${(landRatio*100).toFixed(1)}% : 건물 ${(buildingRatio*100).toFixed(1)}%)`,
  };
}
```

---

### 7. 엔진 수정 (`lib/tax-engine/transfer-tax-helpers.ts`)

#### (a) `calcTransferGain()` 수정
```typescript
export function calcTransferGain(input: TransferTaxInput): TransferGainResult {
  const splitResult = calcSplitGain(input);
  if (splitResult) {
    const totalGain = splitResult.land.gain + splitResult.building.gain;
    return {
      taxableGain: totalGain,
      splitDetail: splitResult,           // 신규 필드
      acquisitionCost: splitResult.land.acquisitionPrice + splitResult.building.acquisitionPrice,
      necessaryExpense: splitResult.land.directExpenses + splitResult.building.directExpenses,
      appraisalDeduction: splitResult.land.appraisalDeduction + splitResult.building.appraisalDeduction,
      // 기타 기존 필드 유지
    };
  }
  // 기존 단일 계산 경로
  return calcTransferGainOriginal(input);
}
```

#### (b) `calcLongTermHoldingDeduction()` 수정
`splitDetail`이 있으면 토지/건물 각각 공제율 적용:

```typescript
function calcLongTermHoldingDeduction(taxableGain, input, rules, isSurcharge, isSuspended, longTermRentalRules, splitDetail?) {
  // L-0/L-1/L-1c 배제 — 그대로

  const isOneHouseSingle =
    input.propertyType === "housing" &&
    input.isOneHousehold &&
    input.householdHousingCount === 1;
  const residenceYears = input.residencePeriodMonths
    ? Math.floor(input.residencePeriodMonths / 12) : 0;

  const rateForYears = (years: number): number => {
    if (years < 3) return 0;
    if (isOneHouseSingle && residenceYears >= 2) {
      return Math.min(years * 0.04 + residenceYears * 0.04, 0.80);
    }
    return Math.min(years * 0.02, 0.30);
  };

  // 분리 케이스
  if (splitDetail) {
    const landRate = rateForYears(splitDetail.land.holdingYears);
    const buildingRate = rateForYears(splitDetail.building.holdingYears);
    const landDed = applyRate(Math.max(splitDetail.land.gain, 0), landRate);
    const buildingDed = applyRate(Math.max(splitDetail.building.gain, 0), buildingRate);
    return {
      rate: null,
      deduction: landDed + buildingDed,
      note: `토지(${splitDetail.land.holdingYears}년 ${(landRate*100).toFixed(0)}%) + 건물(${splitDetail.building.holdingYears}년 ${(buildingRate*100).toFixed(0)}%)`,
    };
  }

  // 단일 케이스 — 기존 로직
  const { years } = calculateHoldingPeriod(input.acquisitionDate, input.transferDate);
  const rate = rateForYears(years);
  return { rate, deduction: applyRate(taxableGain, rate), note: null };
}
```

#### (c) Orchestrator 흐름
`transfer-tax.ts`에서 `calcTransferGain` 결과의 `splitDetail`을 그대로 `calcLongTermHoldingDeduction`에 전달.

---

### 8. 회귀 테스트 (`__tests__/tax-engine/transfer/land-building-split.test.ts`)

5종 시나리오:

```typescript
describe("토지/건물 분리 양도차익·장기보유공제", () => {
  it("S1: housing 1세대1주택 + 환산취득가 + 안분 모드 (이미지 케이스)", () => {
    // 토지 9년/건물 8년/거주 8년 → L-3 적용
    // 양도가액·취득가액·필요경비 모두 기준시가 비율 안분
    // 토지 양도차익 + 건물 양도차익 합산 검증
  });

  it("S2: housing 다주택 + 실거래가 + 실제 분리 입력", () => {
    // 토지/건물 각 가액 직접 입력 → 안분 fallback 미적용 확인
    // L-4 일반공제 적용
  });

  it("S3: building 일반건물 + 환산취득가", () => {
    // L-4 일반공제, 토지 12년 / 건물 5년
  });

  it("S4: 안분 fallback — 일부만 입력", () => {
    // landTransferPrice만 입력 → 건물 양도가액은 안분으로 보충
  });

  it("S5: landAcquisitionDate 미제공 → 기존 단일 로직 회귀", () => {
    // splitDetail = null, 결과가 기존과 동일
  });
});
```

`npm test` 전체 회귀 통과 (1,484 + 5 신규).

---

## 사용 방법 (이미지 케이스 입력 흐름)

```
Step 1: 자산 등록
  자산 종류: 개별주택 (housing)
  양도일: 2023-02-16
  양도가액: 715,000,000
  자본적지출: 34,000,000

  취득 정보:
  취득원인: 매매
  건물 취득일: 2014-09-14   ← 사용승인일

  [✓ 토지와 건물의 취득일이 다른가요?]
  토지 취득일: 2013-06-01   ← 등기접수일
  가액 분리 방식: ◉ 기준시가 비율 안분 (기본)

  취득가액: 환산취득가
  취득시 기준시가: 483,000,000        ← 2014.1.1. 개별주택가격
  양도시 기준시가: 627,000,000        ← 2022.1.1. 개별주택가격
  취득시 토지 단위 기준시가: 2,369,000 ← 2014.1.1. 개별공시지가/㎡
  토지면적: 212

  신축: ✓
  완공일: 2014-09-14

Step 2: 보유 상황
  1세대: 예
  주택 수: 2채
  거주기간: 101개월 (2014.9 ~ 2023.2)
  조정대상지역: 예
  다른 주택: 취득일 2009-03-15, 공시가격 100,000,000

Step 3: 감면·공제 — 해당 없음
```

엔진 자동 처리:
1. 토지 기준시가 = 2,369,000 × 212 = 502,228,000
2. 안분비 = 토지 502M / 전체 483M (음수 방지로 클램핑 → 토지 100% / 건물 0% 또는 데이터 재검토)
3. 양도가액 안분 → 토지 + 건물
4. 환산취득가 각각 계산
5. 자본적지출 안분
6. 개산공제 토지/건물 각각
7. 양도차익 토지/건물 각각
8. 장특공제 토지(9년) + 건물(8년) 분리 적용 → 합산

---

## 검증

1. **시나리오 회귀** — 위 5종 시나리오 (`npm test land-building-split`)
2. **전체 회귀** — `npm test` 통과 (기존 1,484 + 신규 5)
3. **UI 수동 검증** — `/calc/transfer-tax`:
   - housing 토글 ON + 안분 모드 → 결과의 `splitDetail` note 표시 확인
   - housing 토글 ON + 실제 모드 → 입력값 그대로 사용 확인
   - building 토글 ON → L-4 적용 확인
   - 토글 OFF → 기존 단일 로직 결과와 동일
4. **음수·경계값 안전성** — 토지 기준시가 > 전체 시 buildingStdPrice = 0, 양도차익 음수 시 max(0) 처리
5. **혼합 입력** — landTransferPrice만 입력 시 건물은 안분으로 보충되는 fallback 동작
6. **개산공제 분리** — 환산/감정 모드에서 토지/건물 각각의 취득시 기준시가 × 3% 합계 확인
