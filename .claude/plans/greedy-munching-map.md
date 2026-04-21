# 작업계획서 — PDF 사례 "08 합산과 8년 이상 자경 농지 감면세액의 재계산" 재현

> **출처**: 2023 양도·상속·증여세 이론 및 계산실무 / 제6편 양도코리아 프로그램을 이용한 양도소득세 계산사례 / 제3장 토지의 계산사례 / 08 (pp. 392–402)

---

## 1. Context

교재 PDF 사례는 **동일 연도(2023) 2건 부동산 양도 합산 + 8년 자경농지 편입일 부분감면 + 환지토지 감환지**가 얽힌 복합 케이스다. 현재 우리 엔진은 합산(`transfer-tax-aggregate.ts`)·환지 다필지(`multi-parcel-transfer.ts`)·1990.8.30 이전 환산(`pre-1990-land-valuation.ts`)은 구현 완료되어 있으나, 다음 3개 핵심 로직이 빠져 있어 PDF 앵커값을 재현할 수 없다:

1. **자경농지 편입일 부분감면** (조특법 §69, 시행령 §66⑤⑥) — "전액 또는 0" 이분법뿐
2. **환지 감환지 분기** (소득세법 시행령 §162의2) — 권리면적/교부면적 필드 자체 부재
3. **합산 시 감면세액 비율 재계산** — 건별 감면액 단순 합산에 머묾 (공익수용만 재계산 구현)

이와 더불어 **조특법 §133 종합한도(자경 1억/수용 2억 구분)**, **Multi UI의 `parcelMode`·`pre1990` 미지원** 개선이 필요하다.

**목표**: PDF 11쪽 합산 납부계산서의 원단위 앵커값(과세표준 718,591,598 / 산출세액 265,868,471 / 감면세액 100,000,000 / 납부할세액 72,739,993)을 엔진·UI·API 전 계층에서 재현.

---

## 2. PDF 앵커값 (회귀 테스트 기준)

### 2-1. 토지1 (거제 장승포동 농지, 661㎡) — 단건 기준
| 항목 | 값 |
|---|---|
| 양도가액 | 826,000,000 |
| 환산취득가액 | 43,246,191 |
| 기타필요경비(개산공제 3%) | 37,895 |
| 양도차익 | 782,715,914 |
| 장기보유특별공제 (30%) | 234,814,774 |
| 양도소득금액 | 547,901,140 |
| **감면대상 양도소득금액** | **318,216,369** |
| 과세표준 | 545,401,140 |
| 산출세액 (42%) | 193,128,478 |
| 감면세액 (1억 한도) | 100,000,000 |
| 납부할세액 | 93,128,478 |

### 2-2. 토지2 (구리 토평동 환지토지) — 단건 기준
| 항목 | 값 |
|---|---|
| 권리면적 / 교부면적 / 종전면적 | 651.7㎡ / 595㎡ / 773.25㎡ |
| **계산된 취득면적** | **705.9748㎡** (= 773.25 × 595/651.7) |
| 양도가액 | 325,000,000 |
| 환산취득가액 | 75,621,758 |
| 양도차익 | 247,414,940 |
| 장기보유특별공제 (30%) | 74,224,482 |
| 양도소득금액 | 173,190,458 |

### 2-3. 합산 (2023년)
| 항목 | 값 |
|---|---|
| 합산 양도차익 | 1,030,130,854 |
| 합산 장특공제 | 309,039,256 |
| 합산 양도소득금액 | 721,091,598 |
| 감면대상 양도소득금액 | 318,216,369 |
| 과세표준 | 718,591,598 |
| 산출세액 (42%) | 265,868,471 |
| **감면세액** (재계산 후, §133 한도) | **100,000,000** |
| 기신고차감세액 | 93,128,478 |
| **납부할세액** | **72,739,993** |
| 지방소득세 납부 | 7,274,000 |

---

## 3. 현재 구현 상태 스캔

### ✅ 이미 구현됨
- 합산 오케스트레이션: `lib/tax-engine/transfer-tax-aggregate.ts` (§92·§102②·§103·§104의2·§127②)
- 환지처분확정일 의제: `lib/tax-engine/multi-parcel-transfer.ts:136-150`
- 다필지 면적 안분 + 필지별 장특공제: 동일 파일 `calculateMultiParcelTransfer()` (182-301)
- 1990.8.30 이전 환산: `lib/tax-engine/pre-1990-land-valuation.ts` (CAP-1/CAP-2, 5유형)
- 환산취득가액: `tax-utils.ts` + `multi-parcel-transfer.ts:224-240`
- 공익수용 감면 비율 재계산 + §133 2억원: `lib/tax-engine/public-expropriation-reduction.ts:86-240`
- 자경 감면 기본 구조 (8년 / 전액·0 이분법): `transfer-tax.ts:854-857`

### ❌ 미구현 / ⚠️ 개선 필요
| # | 항목 | 구분 | 법령 |
|---|---|---|---|
| G1 | 자경농지 편입일 부분감면 | ❌ 미구현 | 조특법 §69, 시행령 §66⑤⑥ |
| G2 | 환지 감환지 면적 분기 | ❌ 미구현 | 소득세법 시행령 §162의2 |
| G3 | 합산 시 일반 감면 비율 재계산 | ❌ 미구현 | 조특법 §69 + §127의2 |
| G4 | §133 종합한도 구분 (자경 1억 / 수용 2억) | ⚠️ 부분 | 조특법 §133 |
| G5 | Multi UI의 자산별 `parcelMode`·`pre1990Enabled` 노출 | ⚠️ 부재 | — |
| G6 | `TransferTaxResult.reducibleIncome` 필드 노출 (재계산 분자) | ⚠️ 부재 | — |

---

## 4. 작업 순서 및 의존성

```
Phase 1  B  (감환지 필드)            ← 독립. 토지2 취득면적 앵커 검증
Phase 2  A  (자경 편입일 부분감면)   ← TransferTaxResult.reducibleIncome 노출 (G6 포함)
Phase 3  C  (합산 감면 비율 재계산)  ← A의 reducibleIncome 전제
Phase 4  D  (Multi UI 결과뷰 + Step2 parcel/pre1990 확장)
Phase 5  E  (PDF 앵커 통합 테스트)
Phase 6  F  (§133 통합한도 정리)     ← C 이후 리팩터
```

의존성: B ⊥ A → C → D → E; F는 C·D 완료 후 정합성 리팩터.

---

## 5. 상세 설계

### 5-1. Phase 1 — 환지 감환지 분기 (B)

**수정 파일**
- `lib/tax-engine/multi-parcel-transfer.ts:30-65` — `ParcelInput` 확장
- `lib/tax-engine/multi-parcel-transfer.ts:210-245` — P-3 `estimated` 분기에서 취득면적 자동 산정
- `components/calc/inputs/ParcelListInput.tsx:120-180` — 환지 면적 입력 UI 추가
- `lib/api/transfer-tax-schema.ts` — `parcelSchema` 필드 추가
- `lib/stores/calc-wizard-store.ts:167-170` — `parcels[]` 필드 확장

**`ParcelInput` 신규 필드** (옵션, 기존 `acquisitionArea`와 병존)
```ts
entitlementArea?: number;    // 권리면적 (환지 지정 시)
allocatedArea?: number;      // 교부면적 (환지 확정 후 받은 면적)
priorLandArea?: number;      // 종전토지면적
```

**산정 규칙** (감환지: entitlement > allocated)
```
effectiveAcquisitionArea = priorLandArea × (allocatedArea / entitlementArea)
  // 예: 773.25 × (595 / 651.7) = 705.9748
```
- `transferArea`는 그대로 교부면적 중 실제 이번 양도분
- 감환지 별건 분(56.7㎡)은 **과거 별건 신고로 간주하여 현재 계산 대상 제외** (주석으로 명시)
- 증환지(entitlement < allocated) 시 별도 취득으로 보아 분리 입력 권장 (이번 범위 외; 경고만 출력)

**앵커 테스트**: `__tests__/tax-engine/multi-parcel-transfer.test.ts`에 MP-9(PDF 토지2) 추가 — `effectiveAcquisitionArea === 705.9748`

---

### 5-2. Phase 2 — 자경농지 편입일 부분감면 (A)

**신규 파일**: `lib/tax-engine/self-farming-reduction.ts`

```ts
export interface SelfFarmingReductionInput {
  transferIncome: number;              // 장특공제 후 양도소득금액
  farmingYears: number;                // 자경 기간
  acquisitionDate: Date;
  transferDate: Date;
  // 편입일 부분감면 (2002-01-01 이후 주거/상업/공업 편입 시)
  incorporationDate?: Date;
  incorporationZoneType?: "residential" | "commercial" | "industrial";
  standardPriceAtAcquisition?: number; // 취득시 기준시가 (총액 또는 ㎡당)
  standardPriceAtIncorporation?: number;
  standardPriceAtTransfer?: number;
  priceUnit?: "per_sqm" | "total";
}

export interface SelfFarmingReductionResult {
  qualifies: boolean;
  reducibleIncome: number;       // 감면대상 양도소득금액
  reducibleRatio: number;        // 감면비율 (0~1)
  nonReducibleIncome: number;
  partialReductionApplied: boolean; // 편입일 부분감면 발동 여부
  incorporationGraceExpired: boolean; // 편입일부터 3년 내 양도 아님
  legalBasis: string;
  breakdown: string[];
}
```

**공식** (시행령 §66⑤⑥)
```
if incorporationDate && incorporationDate >= 2002-01-01:
  // 편입일부터 3년 내 양도한 경우만 감면
  if transferDate > incorporationDate + 3년:
    qualifies = false  // 감면 전혀 안 됨
  else:
    ratio = (standardAtIncorporation - standardAtAcquisition)
          / (standardAtTransfer    - standardAtAcquisition)
    reducibleIncome = transferIncome × ratio
    partialReductionApplied = true
else:
  reducibleIncome = transferIncome   // 편입 없으면 전액
```

**PDF 역산 검증**: `547,901,140 × ratio = 318,216,369` → `ratio ≈ 0.58080`. 기준시가 3점값(취득/편입/양도)은 테스트 fixture로 제공해 재현.

**`TransferReduction.self_farming` union 확장** (`types/transfer.types.ts:190-201`)
```ts
| { type: "self_farming";
    farmingYears: number;
    incorporationDate?: Date;
    incorporationZoneType?: "residential" | "commercial" | "industrial";
    standardPriceAtIncorporation?: number;
  }
```
- `standardPriceAtAcquisition`·`standardPriceAtTransfer`는 기존 `TransferTaxInput` 루트 필드 재사용 (pre1990이 자동주입한 값과 호환)

**`transfer-tax.ts:854-857` 교체**
- `incorporationDate` 있으면 `self-farming-reduction.ts` 호출
- 감면세액 = `min(safeMultiplyThenDivide(calculatedTax, reducibleIncome, taxBase), 100_000_000)`
- `TransferTaxResult`에 **`reducibleIncome`·`reductionTypeApplied` 필드 추가 노출** (G6 해결, C의 전제)

---

### 5-3. Phase 3 — 합산 감면 비율 재계산 (C)

**수정 파일**: `lib/tax-engine/transfer-tax-aggregate.ts:315-319` (M-8 섹션)

**교체 로직**
```
// 1) 건별 reducibleIncome을 유형별로 집계
reducibleByType: Map<type, Σ reducibleIncome>

// 2) 합산 기준 재계산 (분모 = 합산 taxBase, 분자 = 유형별 reducibleIncome 합)
for each type:
  rawAggregateReduction = safeMultiplyThenDivide(
    calculatedTax,         // 비교과세 MAX 결과 265,868,471
    reducibleByType[type], // 318,216,369
    totalTaxBase           // 718,591,598
  )

// 3) §133 한도 적용 (유형별 묶음)
selfFarmingGroup = ["self_farming", "livestock", "fishing"]
  → min(Σ rawAggregateReduction in group, 100_000_000)  // 조특법 §133 ①
expropriationGroup = ["public_expropriation"]
  → min(Σ rawAggregateReduction in group, 200_000_000)  // 조특법 §133 ①
etc.

// 4) 총감면세액 = Σ capped
// 5) 건별 배분 (UI 표시용): 
//    perAssetAllocation[i] = cappedTotal × (asset.reducibleIncome / totalReducible)
```

**중요 보정**
- 분모는 **반드시 `totalTaxBase`** (기본공제·차손통산 후 과세표준). 합산양도소득금액을 분모로 하면 과대감면.
- §127② 중복배제는 **자산 내에서만** (자산 간 아님). 기존 `calcReductions` 자산별 선택 로직은 그대로.
- 비교과세 `comparedTaxApplied`가 `"groups"`인 경우 → 감면대상이 속한 세율군의 groupTax만 분자 기준이어야 정확. **현재 PDF 범위는 `"none"`이므로 1단계는 전체 `calculatedTax` 기준**으로 구현하고, 혼재 시 경고 플래그 발행.

**`AggregateTransferResult` 확장**
```ts
reductionBreakdown: Array<{
  type: TransferReduction["type"];
  legalBasis: string;                 // e.g. "조특법 §69, §133 ①"
  perAsset: Array<{
    propertyId: string;
    standaloneTax: number;            // 건별 산출세액 (PDF 193,128,478)
    standaloneReduction: number;      // 건별 단독 감면 (100,000,000)
    reducibleIncome: number;          // 318,216,369
  }>;
  totalReducibleIncome: number;
  aggregateTaxBase: number;           // 718,591,598
  aggregateCalculatedTax: number;     // 265,868,471
  rawAggregateReduction: number;
  annualLimit: number;                // 100,000,000
  cappedAggregateReduction: number;   // 100,000,000
  cappedByLimit: boolean;
}>;
```

**`PerPropertyBreakdown` 확장** (`transfer-tax-aggregate.ts:76-108`)
```ts
reductionType?: TransferReduction["type"];
reductionStandalone: number;
reducibleIncome: number;
reductionAggregated: number;          // 합산 재계산 후 이 건 배분액
reductionAllocationRatio: number;
```

---

### 5-4. Phase 4 — Multi UI 확장 (D)

**수정 파일**
- `app/calc/transfer-tax/multi/MultiTransferTaxCalculator.tsx` — Step2(자산별 편집)에 `parcelMode`·`pre1990Enabled` 토글 반영
- `components/calc/results/MultiTransferTaxResultView.tsx` — `ReductionRecalculationTable` 섹션 추가 (SummaryCard 하단, PropertyBreakdown 상단)
- `lib/stores/multi-transfer-tax-store.ts` — `PropertyItem.form` 내부에 이미 필드 존재하는지 검증 (`TransferFormData` 재사용이므로 구조적 지원 가능성 높음)

**UI 신설 컴포넌트**
- `components/calc/inputs/SelfFarmingIncorporationInput.tsx` — 편입일 / 편입지역구분 / 편입일기준시가 입력 (Step5 감면 확인에서 `reductionType === "self_farming"` 선택 시 노출)

**결과 표시 컬럼** (PDF 11쪽 레이아웃 미러)
| 유형 | 건별 산출세액 | 건별 단독감면 | 감면대상소득 | 합산 재계산 raw | §133 한도 | 최종 감면 |
|---|---|---|---|---|---|---|
| 자경농지 | 193,128,478 | 100,000,000 | 318,216,369 | 117,653,... | 100,000,000 | **100,000,000** |

---

### 5-5. Phase 5 — 테스트 (E)

**신규 파일**: `__tests__/tax-engine/pdf-ex08-aggregation-self-farming.test.ts`

**테스트 계층**
1. **B-unit**: 감환지 취득면적 705.9748㎡ 재현 (P1 포함)
2. **A-unit**: 편입일 부분감면 `reducibleIncome === 318,216,369` 앵커
3. **단건 토지1**: 양도차익 782,715,914 / 장특공제 234,814,774 / 산출세액 193,128,478 / 감면 100,000,000 / 납부 93,128,478
4. **단건 토지2**: 양도차익 247,414,940 / 장특공제 74,224,482 / 양도소득금액 173,190,458
5. **합산 (최종 앵커)**: 과세표준 718,591,598 / 산출세액 265,868,471 / 감면 100,000,000 / 기신고차감 93,128,478 / 납부 72,739,993 / 지방세 7,274,000

**앵커 원칙** (MEMORY: `feedback_pdf_example_test_anchoring.md`): 모든 값을 `toBe()`로 원단위 고정.

**회귀 범위**
- `__tests__/tax-engine/multi-parcel-transfer.test.ts` — B의 `ParcelInput` 확장으로 MP-1~MP-8 통과 유지 (옵션 필드)
- `__tests__/tax-engine/transfer-tax-aggregate.test.ts` — C의 감면 재계산 반영으로 T-M01~T-M15 중 감면 관련 기대값 재작성 필요
- `__tests__/tax-engine/public-expropriation-reduction.test.ts` — 공식 동일하므로 그대로 통과

---

### 5-6. Phase 6 — §133 통합한도 정리 (F)

**수정 파일**: 신규 `lib/tax-engine/aggregate-reduction-limits.ts`

**역할**: 유형별 한도 그룹 정의 + `applyAnnualLimits(reductions)` 순수 함수 제공. 기존 `public-expropriation-reduction.ts:189-203`의 하드코딩 2억원도 이 모듈로 이관하여 단일 소스 원칙 확보.

---

## 6. 영향 받는 파일 요약

| 파일 | 수정 유형 | Phase |
|---|---|---|
| `lib/tax-engine/multi-parcel-transfer.ts` | 필드·로직 추가 | B |
| `lib/tax-engine/self-farming-reduction.ts` | 신규 | A |
| `lib/tax-engine/transfer-tax.ts` (854-857, STEP 8 전체) | 라우팅·결과 확장 | A |
| `lib/tax-engine/types/transfer.types.ts` | union·result 확장 | A, C |
| `lib/tax-engine/transfer-tax-aggregate.ts` (M-8) | 로직 교체 | C |
| `lib/tax-engine/aggregate-reduction-limits.ts` | 신규 | F |
| `lib/api/transfer-tax-schema.ts` | Zod 필드 추가 | A, B |
| `lib/calc/transfer-tax-api.ts` | 폼→API 변환 확장 | A, B |
| `lib/calc/multi-transfer-tax-api.ts` | 폼→API 변환 확장 | A, B, D |
| `lib/stores/calc-wizard-store.ts` | 필드 추가 | A, B |
| `lib/stores/multi-transfer-tax-store.ts` | 검증 (변경 가능성 낮음) | D |
| `components/calc/inputs/ParcelListInput.tsx` | 감환지 UI | B |
| `components/calc/inputs/SelfFarmingIncorporationInput.tsx` | 신규 | A |
| `app/calc/transfer-tax/steps/Step5.tsx` | 자경감면 세부 입력 노출 | A |
| `app/calc/transfer-tax/multi/MultiTransferTaxCalculator.tsx` | Step2 확장 | D |
| `components/calc/results/MultiTransferTaxResultView.tsx` | 감면재계산 섹션 | D |
| `components/calc/results/TransferTaxResultView.tsx` | 단건 감면 세부 | A |
| `__tests__/tax-engine/pdf-ex08-aggregation-self-farming.test.ts` | 신규 | E |
| `__tests__/tax-engine/multi-parcel-transfer.test.ts` | MP-9 추가 | B, E |
| `__tests__/tax-engine/transfer-tax-aggregate.test.ts` | T-Mxx 재작성 | C, E |

---

## 7. 검증 방법 (End-to-End)

### 7-1. 엔진 단위
```bash
npx vitest run __tests__/tax-engine/self-farming-reduction.test.ts
npx vitest run __tests__/tax-engine/multi-parcel-transfer.test.ts
npx vitest run __tests__/tax-engine/transfer-tax-aggregate.test.ts
npx vitest run __tests__/tax-engine/pdf-ex08-aggregation-self-farming.test.ts
```

### 7-2. 전체 회귀
```bash
npm test   # 339개 기존 + 신규. 전건 PASS 확인.
```

### 7-3. API 통합 (수동)
- `POST /api/calc/transfer/multi`로 PDF 입력 JSON 전송 → 응답 JSON의 `reductionBreakdown.cappedAggregateReduction === 100_000_000` 및 `totalTax` 합치 확인

### 7-4. UI E2E (수동)
- `/calc/transfer-tax/multi` 진입 → 자산2건 입력 (토지1 자경+편입일, 토지2 환지 감환지) → 결과 뷰 PDF 11쪽 레이아웃과 일치 확인
- 개별 입력 필드 포커스 시 전체 선택(`SelectOnFocusProvider`) 작동 확인
- DateInput으로 편입일(2020-02-14) / 환지확정일(2002-04-26) 6자리 연도 표시 확인

---

## 8. 범위 밖 (Non-goals) — 별도 계획 필요

- **개별공시지가 이력 DB 연동** (`landStandardPriceHistory`): 이번엔 수동 입력만, 다음 사이클에 국토부 Open API 시드
- **증환지(entitlement < allocated)**: 경고만 출력. 별도 취득 분리 입력 가이드는 별건
- **다른 자경감면(§69의2 축산업·§69의3 어업)**: §133 한도 그룹 구조만 준비(F), 개별 감면 엔진은 이후
- **세율군 혼재 시 감면 세율군별 안분**: 경고 플래그만. PDF 범위가 단일 progressive이므로 1단계 skip
- **감환지 별건 신고의 내부 연동**: 감환지 56.7㎡분(2002.4.26 양도)은 현재 과거 별건 신고로 간주. 이후 "양도이력 합산" 기능에서 처리

---

## 9. 위험 요소 & 완화

| 위험 | 완화 |
|---|---|
| `TransferTaxResult` 타입 확장으로 DB `saved_calculations` 레코드 스키마 불일치 | 신규 필드는 모두 optional. JSONB 저장이므로 누락 허용 |
| `transfer-tax-aggregate.test.ts` 기대값 재작성 범위 불확실 | Phase 3 착수 전 기존 테스트 전수 스캔, 감면 관련 케이스만 선별 재작성 |
| 편입일 기준시가 3점값이 `standardPriceAtAcquisition`(pre1990 자동주입)과 충돌 | STEP 0.4(pre1990) → STEP 8(감면) 순서 덕분에 후자가 전자 값을 "사용"만. 충돌 없음 (Plan agent 검증 완료) |
| UI Multi 모드의 자산별 `pre1990Enabled` 필드가 `TransferFormData`에 이미 있는지 미확인 | Phase 4 착수 시 최초 확인. 이미 있다면 UI 토글 노출만 추가 |

---

## 10. 참고 법령

- 소득세법 §89, §95, §97, §100, §103, §104, §104의2
- 소득세법 시행령 §162①6호(환지처분확정일 의제), §162의2(감환지/증환지), §176의2(1990.8.30 이전 토지 환산)
- 조세특례제한법 §69(자경농지), §77(공익수용), §127(중복배제), §133(종합한도)
- 조세특례제한법 시행령 §66(자경 편입일 안분)

법령 조문 참조는 `lib/tax-engine/legal-codes.ts`의 `TRANSFER.*` 상수 사용 (MEMORY: `feedback_legal_codes.md`).
