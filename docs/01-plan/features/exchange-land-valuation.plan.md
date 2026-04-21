# Plan: 환지된 토지 취득가액 환산 — 다필지 분리 계산

- Feature: `exchange-land-valuation`
- Status: Plan
- Updated: 2026-04-20

## 1. 법령 매트릭스

| 조문 | 내용 |
|---|---|
| 소득세법 §94 ① | 양도소득 과세대상 (단건 = 1건) |
| 소득세법 §97 ① 1호 나목, 시행령 §163 ⑨ | 환산취득가액 = 양도가 × (취득시 기준시가 / 양도시 기준시가) |
| 소득세법 시행령 §162 ① 6호 | 환지처분확정일 **익일**을 취득일로 본다 (청산금 수령·지불분) |
| 소득세법 §95 ② | 장기보유특별공제 (일반 토지 3년+ × 2%, 30% 한도) — **필지별** 보유기간 산정 |
| 소득세법 §103 | 기본공제 250만원 (연 1회, 다필지여도 1회만) |
| 조특법 §97의3 준용 안함 | 본 케이스는 감면 대상 아님 |

## 2. 데이터 모델

### 2-A. 엔진 입력 확장
```ts
// lib/tax-engine/transfer-tax.ts
export interface TransferTaxInput {
  // ... 기존 필드 유지 ...
  /** 다필지 분리 계산 (환지·인접지 합병 등). 제공 시 기존 단필지 필드 무시 */
  parcels?: ParcelInput[];
}

export interface ParcelInput {
  /** 필지 ID (UI 표시용, "parcel-1") */
  parcelId: string;
  /** 필지 라벨 (예: "종전 권리분", "과도 취득분") */
  parcelLabel?: string;
  /** 취득일 */
  acquisitionDate: Date;
  /** 취득 원인 */
  acquisitionMethod: "actual" | "estimated";
  /** 실가 취득가액 (actual 방식만) */
  acquisitionPrice?: number;
  /** 취득 면적 (㎡) — 환산 방식 분자 계산용 */
  acquisitionArea: number;
  /** 양도 면적 (㎡) — 양도가액 안분·환산 분모 계산용 */
  transferArea: number;
  /** 취득시 ㎡당 개별공시지가 (환산 방식 필수) */
  standardPricePerSqmAtAcq?: number;
  /** 양도시 ㎡당 개별공시지가 (환산 방식 필수) */
  standardPricePerSqmAtTransfer?: number;
  /** 필요경비 (실가 방식) — 환산 시에는 자동 개산공제 3% 적용되므로 무시 */
  expenses?: number;
  /** 환지확정일 익일 자동 보정 (UI 편의) */
  useDayAfterReplotting?: boolean;
  /** 원본 환지확정일 (useDayAfterReplotting=true일 때) */
  replottingConfirmDate?: Date;
}
```

### 2-B. 엔진 결과 확장
```ts
export interface ParcelResult {
  parcelId: string;
  parcelLabel?: string;
  transferPrice: number;          // 안분된 양도가
  transferArea: number;
  acquisitionArea: number;
  acquisitionPrice: number;       // 실가 or 환산
  acquisitionMethod: "actual" | "estimated";
  estimatedDeduction: number;     // 환산 시 개산공제
  expenses: number;
  transferGain: number;
  holdingYears: number;
  longTermHoldingDeduction: number;
  longTermHoldingRate: number;
  transferIncome: number;         // 필지별 양도소득금액
}

export interface TransferTaxResult {
  // ... 기존 필드 ...
  parcelDetails?: ParcelResult[];  // parcels 제공 시만
}
```

## 3. 알고리즘 (Pure Engine)

### STEP P-1: 양도가액 안분 (면적비)
```
totalTransferArea = Σ parcels[i].transferArea
→ 반드시 totalTransferArea > 0 체크
parcels[i].allocatedTransferPrice = calculateProration(
  input.transferPrice,
  parcels[i].transferArea,
  totalTransferArea,
)   // 마지막 필지는 잔여값 할당으로 원단위 정확 일치
```

### STEP P-2: 필지별 취득가액·필요경비
```
if acquisitionMethod === "actual":
    parcel.acquisitionPrice = 입력값
    parcel.expenses = 입력 필요경비
    parcel.estimatedDeduction = 0

if acquisitionMethod === "estimated":
    standardAtAcq = acquisitionArea × standardPricePerSqmAtAcq
    standardAtTransfer = transferArea × standardPricePerSqmAtTransfer
    parcel.acquisitionPrice = safeMultiplyThenDivide(
      parcel.allocatedTransferPrice,
      standardAtAcq,
      standardAtTransfer,
    )
    parcel.estimatedDeduction = floor(standardAtAcq × 0.03)  // 개산공제 3%
    parcel.expenses = parcel.estimatedDeduction
```

### STEP P-3: 필지별 양도차익
```
parcel.transferGain = max(0,
  parcel.allocatedTransferPrice − parcel.acquisitionPrice − parcel.expenses
)
```

### STEP P-4: 필지별 장기보유특별공제
- `calculateHoldingPeriod(parcel.acquisitionDate, input.transferDate)` 재사용
- 기존 `calcLongTermHoldingDeduction` 재사용하되 **필지별 input** 구성해 호출
- 30% 한도, 일반자산 (1세대1주택 특례는 주택에만 적용되므로 토지는 30% 한도)

### STEP P-5: 합산
```
합계 양도차익       = Σ parcel.transferGain
합계 장특공제       = Σ parcel.longTermHoldingDeduction
합계 양도소득금액   = Σ (transferGain − longTermHoldingDeduction)
기본공제(1회)       = calcBasicDeduction(합계 양도차익, 합계 장특공제, annualUsed, ...)
과세표준            = 합계 양도소득금액 − 기본공제
산출세액            = calculateProgressiveTax(과세표준, brackets)  // 기존 재사용
```

### STEP P-6: 환지확정일 익일 보정
```
parcel 구성 시 useDayAfterReplotting=true이면
  acquisitionDate = addDays(replottingConfirmDate, 1)
```

## 4. 수정·신규 파일

### 신규
- `lib/tax-engine/multi-parcel-transfer.ts` — Pure Engine (STEP P-1 ~ P-5)
- `__tests__/tax-engine/multi-parcel-transfer.test.ts` — 단위 테스트
- `__tests__/tax-engine/exchange-land-integration.test.ts` — PDF 원단위 앵커
- `components/calc/inputs/ParcelListInput.tsx` — 필지 배열 입력 UI
- `docs/04-report/exchange-land-valuation.report.md` (Report 단계)

### 수정
- `lib/tax-engine/transfer-tax.ts` — STEP 0.5 추가: `parcels` 제공 시 multi-parcel 경로로 분기, 결과를 기존 steps 배열에 변환해 주입
- `lib/tax-engine/legal-codes.ts` — `TRANSFER.REPLOTTING_ACQ_DATE` ("소득령 §162 ① 6호") 상수 추가
- `lib/api/transfer-tax-schema.ts` — `parcelSchema[]` 확장 + `propertyBaseShape.parcels?: array` 추가
- `app/api/calc/transfer/route.ts` + `multi/route.ts` — parcels 필드 Date 변환
- `lib/stores/calc-wizard-store.ts` — `parcels` 필드 + reset 포함
- `app/calc/transfer-tax/TransferTaxCalculator.tsx` — Step2·Step3에 다필지 토글 + ParcelListInput 삽입
- `components/calc/results/TransferTaxResultView.tsx` — 필지별 breakdown 카드

## 5. 테스트 계획

| ID | 시나리오 | 기대값 |
|---|---|---|
| MP-1 | 단필지 parcels=[1건]로 동일 결과 재현 | 기존 단건 엔진과 일치 |
| MP-2 | 면적 안분 잔여값 정확성 | Σ allocatedTransferPrice = transferPrice |
| MP-3 | 환산 방식 필지 면적 차이 | 취득가액 = 양도가 × (취득면적·단가) / (양도면적·단가) |
| MP-4 | 개산공제 3% = 취득시기준시가 × 3% | 정확 일치 |
| MP-5 | 환지확정일 익일 보정 | acquisitionDate +1 |
| MP-6 | 필지별 장특공제 독립 계산 | 각각 30% 한도 |
| MP-7 | 기본공제 1회만 적용 | 기본공제 = 250만 (연 1회) |
| **EX-1** | **PDF 사례 전체 파이프라인 원단위 앵커** | 양도차익 422,038,174 / 산출 91,372,154 / 지방세 9,137,215 |
| EX-2 | 취득면적 < 양도면적 (과도면적) 시 동작 | 정상 |
| EX-3 | 1세대1주택 + 다필지 주택 토지 | 장특 특례율 80% 한도 (추후 확장) |

## 6. 범위 외 (후속 과제)

- PDF [문제2] (권리면적 > 교부면적 → 환지확정일 2007.4.26 일부 양도 + 잔여분 2023 양도) — 2단계 양도 시나리오
- 환지 이전 **종전 토지의 일부 양도** (취득면적 = 490 × 305/396.8 = 376.64㎡로 환산) — 면적 환산 유틸 확장
- **1세대1주택 특례 + 다필지 주택부속토지** (거주기간 기준 80% 장특공제) — Phase 2
- 다필지 모드에서 **비사업용 토지 판정** 필지별 개별 처리
