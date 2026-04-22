# 작업계획서 — PDF 사례 "08 합산과 8년 이상 자경 농지 감면세액의 재계산" 재현

> **출처**: 2023 양도·상속·증여세 이론 및 계산실무 / 제6편 / 제3장 / 08 (pp. 392–402)
>
> **기준 코드베이스**: 2026-04-22 (커밋 `f32427a` + 워킹트리 WIP 포함).
>
> **정책**: 서브 CLAUDE.md 3종 (`lib/tax-engine/CLAUDE.md`·`components/calc/CLAUDE.md`·`__tests__/tax-engine/CLAUDE.md`) 규약 준수. `.claude/settings.json`의 **800줄 초과 경고 hook** 발동 대비 — 새 파일은 800줄 미만 유지.

---

## 1. Context

교재 PDF 사례는 **동일 연도(2023) 2건 부동산 양도 합산 + 8년 자경농지 편입일 부분감면 + 환지토지 감환지**가 얽힌 복합 케이스다. 현재 엔진은 합산·환지 다필지·1990.8.30 이전 환산은 구현 완료되어 있으나, 3개 핵심 로직이 빠져 PDF 앵커값(과세표준 718,591,598 / 산출세액 265,868,471 / 감면세액 100,000,000 / 납부할 72,739,993)을 재현할 수 없다:

1. **자경농지 편입일 부분감면** (조특법 §69, 시행령 §66⑤⑥) — 현재 "전액 or 0" 이분법
2. **환지 감환지 분기** (소득세법 시행령 §162의2) — `ParcelInput`에 권리면적/교부면적 필드 부재
3. **합산 시 감면세액 비율 재계산** — 현재 건별 감면을 단순 합산만 (공익수용만 비율 재계산)

추가 개선: **§133 종합한도 그룹화**(자경 1억 / 수용 2억), **Multi UI의 자산별 `parcelMode`·`pre1990Enabled` 노출 검증**.

---

## 2. 프로젝트 최근 업그레이드 영향 분석 (2026-04-21 ~ 04-22)

### 2-1. 완료된 리팩터링 (master 반영)

| 커밋 | 요지 | 우리 작업 영향 |
|---|---|---|
| `02afba5` | **5개 God file 분리** — `legal-codes` 세목별, `types/*.types.ts` 분리, `transfer-tax.ts` 1,470→706줄(+`transfer-tax-helpers.ts` 846줄), Calculator Step 분리 | 파일 경로·라인 전면 정정 필요 |
| `068fe24` | **테스트 시나리오 분할** — `multi-house-surcharge.test` 4파일, `qa-validation.test` 3파일 | 신규 앵커 테스트 배치 관행 확립 |
| `fe11ae9` | **CLAUDE.md 4계층 개편 + 800줄 초과 경고 Hook** | 새 파일 800줄 미만 제약 |
| `f32427a` | **Step4.tsx 보조 섹션 3개 분리** — 821→390줄 + `step4-sections/{NblDetailSection, HousesListSection, MergeDateSection}.tsx` | Step4 수정 영역 조정 |
| (후속 분리) | `transfer-tax-helpers.ts` 846→393줄 **재분리** → `transfer-tax-rate-calc.ts` 365줄 신설 (H-6.5~H-8, **`calcReductions`가 여기로 이동**) | **자경농지 분기 경로 변경** |

### 2-2. ⚠️ 워킹트리 미커밋 WIP (병렬 진행 중 — 다른 PDF 사례)

**별개의 PDF 사례** "1매매계약 일괄양도 + 상속 자경농지"가 진행 중이며, **우리 작업과 독립**이지만 **같은 파일 영역을 수정**한다. 커밋 완료 후 우리 작업 착수가 병합 충돌 최소화에 유리.

**신규 파일 (WIP)**
- `lib/tax-engine/bundled-sale-apportionment.ts` (209줄) — 1매매계약 N자산 기준시가 비율 안분 (소득세법 시행령 §166⑥). 우리 PDF는 **별건 합산**이므로 이 모듈 직접 사용하지 않음
- `lib/tax-engine/inheritance-acquisition-price.ts` — 상속개시일 직전 공시가격으로 취득가액 자동 산정
- `lib/tax-engine/types/bundled-sale.types.ts` / `inheritance-acquisition.types.ts`

**수정 중인 `TransferFormData`** (`lib/stores/calc-wizard-store.ts`)
- `companionAssets: CompanionAssetForm[]` 신규 배열 — 1매매 동반 자산
- `decedentFarmingYears` / `inheritanceValuationMode` / `inheritanceLandPricePerM2` / `inheritanceHousePrice` 신규
- `result: TransferTaxResult` → **`result: TransferAPIResult | null`** 로 타입 교체 (engine 결과 + API 결과 통합 래퍼)

**수정 중인 다른 파일**
- `app/calc/transfer-tax/steps/Step3.tsx` (+71줄) — 상속 취득가액 모드 UI
- `app/calc/transfer-tax/steps/Step5.tsx` (+39줄) — 자산별 감면 유형 (우리 작업도 이 영역 추가 필요 → **충돌 주의**)
- `app/calc/transfer-tax/steps/Step1.tsx` (+70줄), `step4-sections/NblDetailSection.tsx` (+11줄)
- `components/calc/inputs/ParcelListInput.tsx` (+6줄, 경미)
- `lib/api/transfer-tax-schema.ts` (+124줄) — `companionAssetSchema`·`inheritanceValuationSchema` 추가 추정
- `lib/calc/transfer-tax-api.ts` (+81줄) — `TransferAPIResult` 타입 도입
- `lib/calc/transfer-tax-validate.ts` (+13줄)
- `lib/tax-engine/transfer-tax-helpers.ts` (추가 감축 -134줄)
- `lib/tax-engine/multi-house-surcharge.ts` (**-1,102줄** 대폭 축소 → 헬퍼로 추가 이관)
- `lib/tax-engine/comprehensive-tax.ts` (-787줄 대폭 축소)
- `__tests__/tax-engine/transfer-tax/reductions-and-exempt.test.ts` (수정 — 자경농지 관련 케이스 조정 가능성)

### 2-3. 우리 작업과 WIP의 관계

- **계산 로직 독립**: 우리는 `self-farming-reduction.ts` 신설 + `transfer-tax-rate-calc.ts:327-330` 분기 교체. WIP는 `bundled-sale-apportionment.ts` 신설 + `inheritance-acquisition-price.ts` 신설. 호출 경로 분리.
- **UI 충돌점**:
  - `Step5.tsx`: WIP가 자산별 감면 유형을 `companionAssets` 각 항목에 추가 중. 우리는 주 자산 자경농지에 편입일 입력 추가. **같은 영역, 다른 필드 → 병합 시 수작업**.
  - `Step3.tsx`: WIP는 상속 취득가액 모드. 우리 Phase는 Step3 수정 없음 (parcelMode·pre1990 기존 그대로). **충돌 없음**.
  - `ParcelListInput.tsx`: WIP는 경미 (+6줄). 우리는 감환지 필드 3개 추가. **병렬 가능**.
- **타입 충돌점**:
  - `TransferFormData`: WIP가 감면 섹션 근처에 `companionAssets` 배열 추가. 우리는 자경 섹션 내 단일 필드 4개 추가. **독립 필드이므로 충돌 경미**.
  - `TransferTaxResult` vs `TransferAPIResult`: 우리 작업의 `reducibleIncome`·`selfFarmingReductionDetail`은 **`TransferTaxResult`에 추가**하면 `TransferAPIResult`도 자동 상속 (WIP의 통합 래퍼 구조).
- **권장 순서**: WIP 커밋 완료 후 우리 작업 시작. 또는 WIP 마스터 머지 전후 rebase 필수.

---

## 3. PDF 앵커값 (회귀 테스트 기준)

### 3-1. 토지1 (거제 장승포동 농지 661㎡) — 단건
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

### 3-2. 토지2 (구리 토평동 환지토지) — 단건
| 항목 | 값 |
|---|---|
| 권리면적 / 교부면적 / 종전면적 | 651.7㎡ / 595㎡ / 773.25㎡ |
| **계산된 취득면적** | **705.9748㎡** (= 773.25 × 595/651.7) |
| 양도가액 | 325,000,000 |
| 환산취득가액 | 75,621,758 |
| 양도차익 | 247,414,940 |
| 장기보유특별공제 (30%) | 74,224,482 |
| 양도소득금액 | 173,190,458 |

### 3-3. 합산 (2023년)
| 항목 | 값 |
|---|---|
| 합산 양도차익 | 1,030,130,854 |
| 합산 장특공제 | 309,039,256 |
| 합산 양도소득금액 | 721,091,598 |
| 과세표준 | 718,591,598 |
| 산출세액 (42%) | 265,868,471 |
| **감면세액** (재계산 + §133 한도) | **100,000,000** |
| 기신고차감세액 | 93,128,478 |
| **납부할세액** | **72,739,993** |
| 지방소득세 | 7,274,000 |

---

## 4. 현재 구현 상태 (업그레이드 이후 정확한 파일 맵)

### 4-1. 양도소득세 엔진 계층 (`lib/tax-engine/`)

| 파일 | 현재 크기 | 역할 |
|---|---|---|
| `transfer-tax.ts` | ~29.7KB / 710줄 | Orchestrator (STEP 0~12) |
| `transfer-tax-helpers.ts` | ~15.2KB / **393줄** | H-1~H-6: `parseRatesFromMap`·`checkExemption`·`calcTransferGain`·`calcOneHouseProration`·`calcLongTermHoldingDeduction`·`calcBasicDeduction` |
| **`transfer-tax-rate-calc.ts`** | ~15.0KB / **365줄** | H-6.5~H-8: `calculateBuildingPenalty`·`calcTax`·**`calcReductions`** ← 자경농지 분기 L327-330 |
| `transfer-tax-aggregate.ts` | ~27.3KB / 752줄 | 다건 오케스트레이션 (§92·§102②·§103·§104의2) |
| `transfer-tax-penalty.ts` | ~11.0KB / 321줄 | 신고불성실·지연납부 |
| `multi-parcel-transfer.ts` | ~11.1KB / 301줄 | 다필지 분리·환지 |
| `multi-house-surcharge.ts` | ~11.9KB / 356줄 (**WIP -1102 이후 더 축소**) | 다주택 중과세 (main) |
| `multi-house-surcharge-helpers.ts` | ~32.1KB / 795줄 | 다주택 중과 헬퍼 |
| `pre-1990-land-valuation.ts` | ~12.7KB / 308줄 | 1990.8.30 이전 토지 환산 |
| `rental-housing-reduction.ts` | ~17.4KB / 529줄 | 장기임대 V2 |
| `new-housing-reduction.ts` | ~14.6KB / 410줄 | 신축·미분양 V2 |
| `public-expropriation-reduction.ts` | ~8.4KB / ~240줄 | 공익수용 §77 |
| **`bundled-sale-apportionment.ts`** (WIP) | ~8.9KB / 209줄 | 1매매 N자산 안분 (우리 작업 무관) |
| **`inheritance-acquisition-price.ts`** (WIP) | ~3.7KB | 상속 취득가액 자동 (우리 작업 무관) |
| `non-business-land/` (15 파일) | — | 비사업용 토지 판정 |
| `legal-codes/` (6 파일) | — | 세목별 조문 상수 (barrel `legal-codes.ts` 1.1KB) |
| `types/` (9 파일, WIP +2) | — | `transfer.types.ts` 305줄 · `bundled-sale.types.ts`·`inheritance-acquisition.types.ts` (신규) |

### 4-2. 자경농지 감면 분기 정확 위치

**`lib/tax-engine/transfer-tax-rate-calc.ts`** `calcReductions()` 내부 (L251-365), **L327-330**:
```ts
if (reduction.type === "self_farming" && selfFarmingRules) {
  if (reduction.farmingYears >= selfFarmingRules.conditions.minFarmingYears) {
    amount = Math.min(applyRate(calculatedTax, selfFarmingRules.maxRate), selfFarmingRules.maxAmount);
  }
}
```

**호출 지점 (2곳)**:
- `transfer-tax.ts:540-576` — STEP 8 일반 경로
- `transfer-tax.ts:292-310` — STEP 1.5 다필지 분기 내 별도 호출 (**Phase A 구현 시 양쪽 모두 수정**)

### 4-3. UI·API·Store 계층

| 파일 | 현재 | 비고 |
|---|---|---|
| `app/calc/transfer-tax/TransferTaxCalculator.tsx` | 412줄 (+48 WIP) | 오케스트레이터 |
| `app/calc/transfer-tax/multi/MultiTransferTaxCalculator.tsx` | **661줄** (+5 WIP) | 다건 마법사 |
| `app/calc/transfer-tax/steps/Step1.tsx` | 90줄 (+70 WIP) | 물건 유형 |
| `app/calc/transfer-tax/steps/Step2.tsx` | 129줄 | 양도 정보 |
| `app/calc/transfer-tax/steps/Step3.tsx` | 613줄 (+71 WIP) | 취득 정보 |
| `app/calc/transfer-tax/steps/Step4.tsx` | **390줄** (분리 후) | 보유 상황 |
| `app/calc/transfer-tax/steps/step4-sections/NblDetailSection.tsx` | 213줄 (+11 WIP) | NBL 상세 |
| `app/calc/transfer-tax/steps/step4-sections/HousesListSection.tsx` | 185줄 | 다주택 목록 |
| `app/calc/transfer-tax/steps/step4-sections/MergeDateSection.tsx` | 55줄 | 합가일 |
| `app/calc/transfer-tax/steps/Step5.tsx` | **206줄 (+39 WIP)** | 감면 — **WIP 충돌점** |
| `app/calc/transfer-tax/steps/Step6.tsx` | 208줄 | 가산세 |
| `components/calc/inputs/ParcelListInput.tsx` | 253줄 (+6 WIP) | 다필지 UI |
| `components/calc/inputs/Pre1990LandValuationInput.tsx` | 201줄 | 1990 이전 UI |
| `components/calc/results/TransferTaxResultView.tsx` | 418줄 (+2 WIP) | 단건 결과 |
| `components/calc/results/MultiTransferTaxResultView.tsx` | 613줄 | 다건 결과 |
| `components/calc/transfer/AggregateSettingsPanel.tsx` | 236줄 | 다건 공통설정 |
| `lib/api/transfer-tax-schema.ts` | 445줄 (**+124 WIP**) | Zod |
| `lib/calc/transfer-tax-api.ts` | 279줄 (**+81 WIP** — `TransferAPIResult` 도입) | API 호출 |
| `lib/calc/transfer-tax-validate.ts` | 90줄 (+13 WIP) | 검증 |
| `lib/calc/multi-transfer-tax-api.ts` | ~199줄 | 다건 API |
| `lib/stores/calc-wizard-store.ts` | 330줄 (**+54 WIP** — `companionAssets`·`TransferAPIResult`) | store |
| `lib/stores/multi-transfer-tax-store.ts` | 183줄 | 다건 store |

### 4-4. 테스트 계층 (`__tests__/tax-engine/`)

| 파일 | 줄수 | 주제 |
|---|---|---|
| `transfer-tax/basic.test.ts` | 674 | 기본 계산 |
| `transfer-tax/reductions-and-exempt.test.ts` | 588 (**WIP 수정 중**) | 감면·비과세 |
| `transfer-tax/edge-and-overlap.test.ts` | 521 | 경계·중복 |
| `transfer-tax/integration.test.ts` | 509 | 통합 |
| `transfer-tax/multi-house-and-nbl.test.ts` | 227 | 다주택·NBL |
| `transfer-tax-aggregate.test.ts` | 612 (미분할) | 다건 합산 |
| `transfer-tax-penalty.test.ts` | 280 | 가산세 |
| `multi-parcel-transfer.test.ts` | 305 | 다필지 |
| `exchange-land-integration.test.ts` | 264 | **기존 환지 통합 테스트 — PDF 앵커는 별도 파일로 분리 권장** |
| `pre-1990-land-valuation.test.ts` | 425 | 1990 이전 |
| `public-expropriation-reduction.test.ts` | 267 | 공익수용 |
| `rental-housing-reduction.test.ts` | 783 | 장기임대 |
| `new-housing-reduction.test.ts` | 737 | 신축주택 |
| `multi-house-surcharge/` (4 파일) | 2,117 | 다주택 중과 |
| `non-business-land/` (15 파일) | 2,692 | 비사업용 토지 |
| `_helpers/mock-rates.ts` | 300 | 공용 Mock |
| `_helpers/multi-house-mock.ts` | ~96 | 다주택 Mock |

### ❌ 미구현 / ⚠️ 개선 필요
| # | 항목 | 구분 | 법령 |
|---|---|---|---|
| G1 | 자경농지 편입일 부분감면 | ❌ 미구현 | 조특법 §69, 시행령 §66⑤⑥ |
| G2 | 환지 감환지 면적 분기 | ❌ 미구현 | 소득세법 시행령 §162의2 |
| G3 | 합산 시 일반 감면 비율 재계산 | ❌ 미구현 | 조특법 §69 + §127의2 |
| G4 | §133 종합한도 그룹화 (자경 1억 / 수용 2억) | ⚠️ 부분 | 조특법 §133 |
| G5 | Multi UI의 자산별 `parcelMode`·`pre1990Enabled` 노출 | ⚠️ 검증 필요 | — |
| G6 | `TransferTaxResult.reducibleIncome` + `TransferAPIResult` 전파 | ⚠️ 부재 | — |

---

## 5. 작업 순서 및 의존성

```
WIP 커밋 완료 (다른 PDF 사례) ──┐
                                 ▼
Phase 1  B  (감환지 필드)            ← 독립 · 토지2 취득면적 705.9748㎡
Phase 2  A  (자경 편입일 부분감면)   ← G6 (reducibleIncome + TransferAPIResult)
Phase 3  C  (합산 감면 비율 재계산)  ← A의 reducibleIncome 전제
Phase 4  D  (Multi UI 결과뷰 + 기본값)
Phase 5  E  (PDF 앵커 통합 테스트)
Phase 6  F  (§133 통합한도 정리)     ← 선택
```

의존성: **WIP 선행**(또는 rebase 준비) → B ⊥ A → C → D → E; F는 C·D 완료 후.

---

## 6. 상세 설계

### 6-1. Phase 1 — 환지 감환지 분기 (B)

**수정 파일**
- `lib/tax-engine/multi-parcel-transfer.ts` **L30-65** `ParcelInput` 확장 (옵션 필드 3개)
- `lib/tax-engine/multi-parcel-transfer.ts` **L224-245** P-2 `estimated` 분기에서 취득면적 자동 산정
- `lib/api/transfer-tax-schema.ts`: `parcelSchema` Zod 필드 추가
- `lib/stores/calc-wizard-store.ts` **L174-186** `ParcelFormItem`에 3개 필드 추가
- `components/calc/inputs/ParcelListInput.tsx` (253줄): `useDayAfterReplotting` 토글 아래 "환지 면적 입력" 서브 섹션

**신규 `ParcelInput` 필드**
```ts
entitlementArea?: number;    // 권리면적
allocatedArea?: number;      // 교부면적
priorLandArea?: number;      // 종전토지면적
```

**산정 규칙** (L224-245 `estimated` 분기)
```ts
// 감환지 판정: entitlementArea > allocatedArea
if (parcel.entitlementArea && parcel.allocatedArea && parcel.priorLandArea &&
    parcel.entitlementArea > parcel.allocatedArea) {
  // 773.25 × (595 / 651.7) = 705.9748
  acqArea = parcel.priorLandArea * parcel.allocatedArea / parcel.entitlementArea;
} else {
  acqArea = parcel.acquisitionArea;
}
// 이후 기존: standardAtAcq = Math.floor(acqArea × standardPricePerSqmAtAcq)
```

- `transferArea`는 교부면적 중 이번 양도분 (변경 없음)
- 감환지 별건(56.7㎡)은 과거 별건 신고 간주 → 현재 계산 제외 (주석)
- 증환지(entitlement < allocated) 시 `warnings.push()`만
- 소수 면적 safe divide는 `tax-utils.ts`에 `safeMultiplyThenDivideFloat` 추가 (선택)

**앵커 테스트**: `__tests__/tax-engine/multi-parcel-transfer.test.ts` (305줄)에 **MP-9** — 취득면적 705.9748㎡ 소수 4자리 매칭.

---

### 6-2. Phase 2 — 자경농지 편입일 부분감면 (A)

**신규 파일**: `lib/tax-engine/self-farming-reduction.ts` (예상 200줄, 800줄 정책 안전)
- 명명 관행: `rental-housing-reduction.ts`·`new-housing-reduction.ts`·`public-expropriation-reduction.ts` 플랫 구조 준수

```ts
export interface SelfFarmingReductionInput {
  transferIncome: number;        // 장특공제 후 양도소득금액 (§95 ①)
  farmingYears: number;
  acquisitionDate: Date;
  transferDate: Date;
  // 편입일 부분감면 (2002-01-01 이후 주거/상업/공업 편입 시)
  incorporationDate?: Date;
  incorporationZoneType?: "residential" | "commercial" | "industrial";
  // 기준시가 3점값 (총액 또는 ㎡당)
  standardPriceAtAcquisition?: number;
  standardPriceAtIncorporation?: number;
  standardPriceAtTransfer?: number;
  priceUnit?: "per_sqm" | "total";
}

export interface SelfFarmingReductionResult {
  qualifies: boolean;
  reducibleIncome: number;
  reducibleRatio: number;
  nonReducibleIncome: number;
  partialReductionApplied: boolean;
  incorporationGraceExpired: boolean;
  legalBasis: string;
  breakdown: string[];
}
```

**공식** (시행령 §66⑤⑥)
```
if incorporationDate && incorporationDate >= 2002-01-01:
  if transferDate > incorporationDate + 3년:
    qualifies = false, reducibleIncome = 0     // 3년 경과 → 감면 상실
  else:
    ratio = (stdAtIncorp - stdAtAcq) / (stdAtTransfer - stdAtAcq)
    reducibleIncome = transferIncome × ratio
else:
  reducibleIncome = transferIncome             // 편입 없으면 전액
```

**PDF 역산**: `547,901,140 × ratio = 318,216,369` → `ratio ≈ 0.58080`.

**법령 상수** — `lib/tax-engine/legal-codes/transfer.ts`에 추가:
```ts
REDUCTION_SELF_FARMING_INCORP: "조특법 시행령 §66 ⑤ ⑥"
```

**타입 확장** — `lib/tax-engine/types/transfer.types.ts`
- `TransferReduction` union **L190-201** `self_farming` variant:
  ```ts
  | { type: "self_farming";
      farmingYears: number;
      incorporationDate?: Date;
      incorporationZoneType?: "residential" | "commercial" | "industrial";
      standardPriceAtIncorporation?: number;
    }
  ```
- `TransferTaxResult` **L216-305**에 추가:
  ```ts
  reducibleIncome?: number;
  reductionTypeApplied?: string;  // 내부 ID (기존 reductionType은 표시용)
  selfFarmingReductionDetail?: SelfFarmingReductionResult;
  ```
- **WIP `TransferAPIResult`는 `TransferTaxResult`를 상속/통합 래핑**하므로 위 필드 자동 전파.

**엔진 수정** — `lib/tax-engine/transfer-tax-rate-calc.ts`
- **L246-267** `ReductionsResult`·`calcReductions` 시그니처: 반환에 `reducibleIncome`·`selfFarmingReductionDetail` 추가 (현재 `transferIncome`·`basicDeduction`·`taxBase`는 공익수용용으로 이미 입력 존재)
- **L327-330** 자경농지 분기 교체:
  ```ts
  if (reduction.type === "self_farming" && selfFarmingRules) {
    if (reduction.farmingYears >= selfFarmingRules.conditions.minFarmingYears) {
      const sfResult = calculateSelfFarmingReduction({
        transferIncome: transferIncome ?? 0,
        farmingYears: reduction.farmingYears,
        acquisitionDate: /* input.acquisitionDate */,
        transferDate: transferDate!,
        incorporationDate: reduction.incorporationDate,
        incorporationZoneType: reduction.incorporationZoneType,
        standardPriceAtAcquisition: /* input.standardPriceAtAcquisition */,
        standardPriceAtIncorporation: reduction.standardPriceAtIncorporation,
        standardPriceAtTransfer: /* input.standardPriceAtTransfer */,
      });
      // 감면세액 = 산출세액 × (감면대상소득 / 과세표준)
      const rawAmount = taxBase! > 0
        ? safeMultiplyThenDivide(calculatedTax, sfResult.reducibleIncome, taxBase!)
        : 0;
      amount = Math.min(rawAmount, selfFarmingRules.maxAmount);
      selfFarmingDetail = sfResult;
    }
  }
  ```
- `calcReductions`는 `input.standardPriceAtAcquisition`·`input.standardPriceAtTransfer`를 받기 위한 추가 파라미터 필요 (혹은 `reduction`에 모두 포함)

**엔진 수정** — `lib/tax-engine/transfer-tax.ts`
- **L540-576** STEP 8: `calcReductions` 반환값에서 `reducibleIncome`·`selfFarmingReductionDetail` 수신 → 결과 객체로 전파
- **L292-310** STEP 1.5 다필지 분기의 `calcReductions` 호출도 동일하게 수정 (2곳!)
- **L670-710** 결과 반환부에 새 필드 전달

**API·Store·UI**
- `lib/api/transfer-tax-schema.ts`: `reductionSchema`의 `self_farming` variant에 필드 추가 (WIP `companionAssets`와 별개 위치에 추가 → 충돌 최소)
- `lib/calc/transfer-tax-api.ts` (L14-52 감면 변환): `form.reductionType === "self_farming"` 분기에 매핑. **`TransferAPIResult`의 새 필드 전파** 확인.
- `lib/stores/calc-wizard-store.ts` `TransferFormData` (감면 섹션 L77-91)에 필드 추가:
  ```ts
  incorporationDate: string;
  incorporationZoneType: "residential" | "commercial" | "industrial" | "";
  standardPriceAtIncorporation: string;
  ```
  - `standardPriceAtAcquisitionInput`·`standardPriceAtTransferInput`은 이미 pre1990 경로에서 관리 중이므로 재사용
- **UI 신규**: `components/calc/inputs/SelfFarmingIncorporationInput.tsx` (예상 100줄 미만)
  - `DateInput` + Select(편입지역구분) + `CurrencyInput` × 3
- `app/calc/transfer-tax/steps/Step5.tsx` (206 + WIP 39 = 245줄 예상): `reductionType === "self_farming"` 분기 아래에 위 컴포넌트 노출. **WIP가 이 파일을 이미 수정 중이므로 충돌 불가피 — WIP 커밋 후 rebase 시 수작업 머지**.

---

### 6-3. Phase 3 — 합산 감면 비율 재계산 (C)

**수정 파일**: `lib/tax-engine/transfer-tax-aggregate.ts` (752줄) — M-8 감면 합산부

**교체 로직**
```ts
// 1) 건별 reducibleIncome을 유형별로 집계
const reducibleByType = new Map<string, number>();
for (const asset of perAsset) {
  const type = asset.result.reductionTypeApplied;
  if (!type || !asset.result.reducibleIncome) continue;
  reducibleByType.set(type, (reducibleByType.get(type) ?? 0) + asset.result.reducibleIncome);
}

// 2) 합산 재계산 (분모 = 합산 taxBase)
const rawByType = new Map<string, number>();
for (const [type, income] of reducibleByType) {
  const raw = taxBase > 0 ? safeMultiplyThenDivide(calculatedTax, income, taxBase) : 0;
  rawByType.set(type, raw);
}

// 3) §133 한도 그룹 적용 (Phase F에서 모듈화)
const cappedByType = applyAnnualLimits(rawByType);
```

**중요 보정**
- **분모 = `taxBase`** (합산 과세표준). 합산양도소득금액 사용 시 과대감면.
- §127② 중복배제는 **자산 내에서만** (`transfer-tax-rate-calc.ts:344-348` 유지).
- `comparedTaxApplied === "groups"` 혼재 시 → `warnings.push()` 후 전체 기준 fallback (PDF 범위는 `"none"`).

**타입 확장**: `PerPropertyBreakdown` (L76-108)·`AggregateTransferResult` (L139-181)에 `reductionBreakdown` 섹션 추가 (섹션 5-3 이전 계획과 동일).

---

### 6-4. Phase 4 — Multi UI 확장 (D)

**임베딩 구조 이점**: `MultiTransferTaxCalculator.tsx` (661줄)의 `edit` 단계가 단건 `TransferTaxCalculator.tsx`를 임베딩하므로 Phase 1·2에서 추가한 Step3·Step5 입력 자동 노출. **작업은 노출 검증만** (G5).

**수정 파일**
- `app/calc/transfer-tax/multi/MultiTransferTaxCalculator.tsx` **L32-100** `makeDefaultForm()`: A·B의 새 필드 기본값 (WIP가 이미 이 파일 +5줄 수정 — 충돌 주의)
- `lib/stores/multi-transfer-tax-store.ts` (183줄): `PropertyItem.form`이 `TransferFormData` 임베딩 → **변경 불필요**
- `components/calc/results/MultiTransferTaxResultView.tsx` (613줄): `SummaryCard`(L50-122)와 `LossOffsetTable`(L141~) 사이에 **`ReductionRecalculationTable`** 섹션

**결과 표시 컬럼** (PDF 11쪽 레이아웃)
| 유형 | 건별 산출세액 | 건별 단독감면 | 감면대상소득 | 합산 재계산 raw | §133 한도 | 최종 감면 |
|---|---|---|---|---|---|---|
| 자경농지 | 193,128,478 | 100,000,000 | 318,216,369 | (계산값) | 100,000,000 | **100,000,000** |

---

### 6-5. Phase 5 — 테스트 (E)

**신규 파일**
- 단위 A: `__tests__/tax-engine/self-farming-reduction.test.ts` (플랫 관행)
  - A1 편입 없음 → 전액 (ratio=1)
  - A2 2002.1.1 이후 편입 + 3년 내 → 부분감면
  - A3 2002.1.1 이후 편입 + 3년 경과 → 감면 상실
  - A4 2002.1.1 이전 편입 → 전액
  - A5 PDF 토지1 앵커 (ratio ≈ 0.58080, `reducibleIncome === 318,216,369`)
- 통합 앵커: `__tests__/tax-engine/transfer-tax/pdf-ex08-aggregation-self-farming.test.ts`
  - **주의**: `exchange-land-integration.test.ts` (264줄)가 이미 환지 통합 주제 → **별도 파일로 분리** 필수

**수정 파일**
- `__tests__/tax-engine/multi-parcel-transfer.test.ts` (305줄): **MP-9** 감환지 705.9748㎡ 앵커
- `__tests__/tax-engine/transfer-tax-aggregate.test.ts` (612줄): 감면 재계산 반영으로 감면 관련 기대값 재작성 (미분할 유지 — 1,500줄 미달)
- `__tests__/tax-engine/transfer-tax/reductions-and-exempt.test.ts` (588줄, **WIP 수정 중**): 자경 전액 감면 회귀 확인 (편입일 미지정 경로). **WIP 커밋 후 rebase 시 충돌 가능**.
- `__tests__/tax-engine/_helpers/mock-rates.ts` (300줄): `SELF_FARMING_INCORP_FIXTURE` 추가 (선택)

**테스트 계층**
1. **B-unit** (MP-9): 취득면적 705.9748㎡
2. **A-unit**: 편입일 부분감면 `reducibleIncome === 318,216,369`
3. **단건 토지1**: 양도차익 782,715,914 / 장특공제 234,814,774 / 산출세액 193,128,478 / 감면 100,000,000 / 납부 93,128,478
4. **단건 토지2**: 양도차익 247,414,940 / 장특공제 74,224,482 / 양도소득금액 173,190,458
5. **합산 (최종)**: 과세표준 718,591,598 / 산출세액 265,868,471 / 감면 100,000,000 / 기신고차감 93,128,478 / 납부 72,739,993 / 지방세 7,274,000

**앵커 원칙** (MEMORY `feedback_pdf_example_test_anchoring.md`): 모든 값 `toBe()` 원단위 고정.

**회귀 순서** (`__tests__/tax-engine/CLAUDE.md` 규정)
```bash
npx vitest run __tests__/tax-engine/self-farming-reduction.test.ts
npx vitest run __tests__/tax-engine/multi-parcel-transfer.test.ts
npx vitest run __tests__/tax-engine/transfer-tax/
npx vitest run __tests__/tax-engine/transfer-tax-aggregate.test.ts
npx vitest run __tests__/tax-engine/exchange-land-integration.test.ts
npm test   # 72 파일 / 1,407+ tests, 회귀 허용치 0
```

---

### 6-6. Phase 6 — §133 통합한도 정리 (F, 선택)

**신규 파일**: `lib/tax-engine/aggregate-reduction-limits.ts` (예상 150줄 미만)
- 유형별 한도 그룹 정의 + `applyAnnualLimits(Map<type, amount>): Map<type, cappedAmount>` 순수 함수
- 기존 `public-expropriation-reduction.ts`의 2억원 상수 + `selfFarmingRules.maxAmount` 1억원을 통합 관리
- Phase C의 M-8에서 호출

---

## 7. 영향 받는 파일 요약 (WIP 충돌도 포함)

| 파일 | 수정 유형 | Phase | WIP 충돌 |
|---|---|---|---|
| `lib/tax-engine/multi-parcel-transfer.ts` (ParcelInput L30-65, P-2 L224-245) | 필드·로직 | B | 없음 |
| `lib/tax-engine/self-farming-reduction.ts` | **신규** | A | 없음 |
| `lib/tax-engine/transfer-tax-rate-calc.ts` (L246-267 시그니처, L327-330 자경 분기) | 교체 | A | 없음 |
| `lib/tax-engine/transfer-tax.ts` (L540-576 STEP 8, L292-310 STEP 1.5 내부, L670-710 결과) | 반환 전파 | A | 없음 |
| `lib/tax-engine/transfer-tax-aggregate.ts` (M-8 + 타입 L76-108·L139-181) | 로직 교체 | C | 없음 |
| `lib/tax-engine/aggregate-reduction-limits.ts` | **신규** | F | 없음 |
| `lib/tax-engine/types/transfer.types.ts` (L190-201, L216-305) | union·result 확장 | A, C | ⚠️ WIP 수정 중 — rebase |
| `lib/tax-engine/legal-codes/transfer.ts` | 상수 추가 | A | ⚠️ WIP 수정 중 (+10줄) |
| `lib/tax-engine/tax-utils.ts` (선택) | `safeMultiplyThenDivideFloat` | B | 없음 |
| `lib/api/transfer-tax-schema.ts` (445줄, **WIP +124**) | Zod 필드 추가 | A, B | ⚠️ 큰 WIP 충돌 — rebase 수작업 |
| `lib/calc/transfer-tax-api.ts` (L14-52, **WIP +81**) | 편입일 매핑 | A | ⚠️ `TransferAPIResult` 존재 검증 |
| `lib/calc/multi-transfer-tax-api.ts` | 변경 없음 | — | 없음 |
| `lib/stores/calc-wizard-store.ts` (L77-91, L174-186, **WIP +54**) | 필드 추가 | A, B | ⚠️ WIP `companionAssets` 근처 |
| `lib/stores/multi-transfer-tax-store.ts` | 변경 없음 | — | 없음 |
| `components/calc/inputs/ParcelListInput.tsx` (253줄, WIP +6) | 감환지 UI | B | ⚠️ 경미 |
| `components/calc/inputs/SelfFarmingIncorporationInput.tsx` | **신규** | A | 없음 |
| `app/calc/transfer-tax/steps/Step5.tsx` (206줄, **WIP +39**) | 편입일 입력 노출 | A | ⚠️ WIP 충돌점 — rebase |
| `app/calc/transfer-tax/steps/Step3.tsx` (613줄, WIP +71) | 검증만 | — | ⚠️ WIP 주시 |
| `app/calc/transfer-tax/multi/MultiTransferTaxCalculator.tsx` (661줄, WIP +5) | 기본값 추가 | D | ⚠️ 경미 |
| `components/calc/results/MultiTransferTaxResultView.tsx` (613줄) | 섹션 신설 | D | 없음 |
| `components/calc/results/TransferTaxResultView.tsx` (418줄, WIP +2) | 자경 세부 | A | ⚠️ 경미 |
| `__tests__/tax-engine/transfer-tax/pdf-ex08-aggregation-self-farming.test.ts` | **신규** | E | 없음 |
| `__tests__/tax-engine/self-farming-reduction.test.ts` | **신규** | A, E | 없음 |
| `__tests__/tax-engine/multi-parcel-transfer.test.ts` (305줄) | MP-9 추가 | B, E | 없음 |
| `__tests__/tax-engine/transfer-tax-aggregate.test.ts` (612줄) | 기대값 재작성 | C, E | 없음 |
| `__tests__/tax-engine/transfer-tax/reductions-and-exempt.test.ts` (588줄, **WIP 수정**) | 회귀 확인 | E | ⚠️ WIP 충돌 가능 |

---

## 8. 검증 방법

### 8-1. 엔진 단위 & 통합
```bash
npx vitest run __tests__/tax-engine/self-farming-reduction.test.ts
npx vitest run __tests__/tax-engine/multi-parcel-transfer.test.ts
npx vitest run __tests__/tax-engine/transfer-tax/pdf-ex08-aggregation-self-farming.test.ts
npx vitest run __tests__/tax-engine/transfer-tax-aggregate.test.ts
```

### 8-2. 전체 회귀
```bash
npm test   # 72 파일 / 1,407+ tests. 회귀 허용치 0.
```

### 8-3. API 통합 (수동)
- `POST /api/calc/transfer/multi` PDF 입력 JSON → `reductionBreakdown.cappedAggregateReduction === 100_000_000`, `totalTax === 72_739_993 + 7_274_000 = 80_013_993` 일치 확인

### 8-4. UI E2E (수동)
- `/calc/transfer-tax/multi` → 자산 2건 (토지1 자경+편입일 3점값, 토지2 환지 감환지 권리/교부/종전면적) → `ReductionRecalculationTable`이 PDF 11쪽과 일치
- `DateInput` 6자리 연도 표시, `SelectOnFocusProvider` 전체선택 자동

---

## 9. 범위 밖 (Non-goals)

- **개별공시지가 이력 DB 연동**: 수동 입력. 다음 사이클 국토부 Open API 시드
- **증환지 (entitlement < allocated)**: `warnings.push()`만
- **§69의2 축산업·§69의3 어업**: F에서 그룹 구조만 준비
- **세율군 혼재 시 감면 세율군별 안분**: PDF 범위 단일 progressive → 혼재 시 `warnings.push()`만
- **감환지 별건 신고 내부 연동**: 56.7㎡분(2002.4.26)은 과거 별건 간주
- **`MultiTransferTaxCalculator.tsx` 분리**: 661줄 정책 미달
- **WIP 기능(일괄양도·상속 취득가액)과의 통합**: 각자 독립 기능, 통합 UI는 별도 계획

---

## 10. 위험 요소 & 완화

| 위험 | 완화 |
|---|---|
| **WIP 커밋 전 우리 작업 착수 시 병합 충돌** | **WIP 커밋 완료 후 시작 권장**. 불가 시 Step5·transfer-tax-schema·calc-wizard-store는 WIP 쪽에 맞춰 rebase |
| `TransferTaxResult` 확장 → DB `saved_calculations` JSONB 불일치 | 신규 필드 모두 optional, JSONB 누락 허용 |
| `TransferAPIResult`가 `TransferTaxResult` 필드를 자동 전파하는지 불확실 | Phase A 착수 시 `lib/calc/transfer-tax-api.ts`의 타입 정의 1회 확인 (WIP 정착 후) |
| `transfer-tax-aggregate.test.ts` 기대값 재작성 규모 | Phase 3 착수 전 감면 관련 케이스 grep 후 선별 |
| 편입일 기준시가 vs pre1990 자동주입 충돌 | STEP 0.4 → STEP 8 순서로 후자가 전자 값 사용만. 충돌 없음 |
| STEP 1.5 다필지 분기 (`transfer-tax.ts:292-310`)와 일반 STEP 8이 별도로 `calcReductions` 호출 | Phase A 시 **두 호출부 모두** 동일 반환값 처리 필요 |
| 800줄 초과 경고 Hook 발동 | `self-farming-reduction.ts` 200줄, `SelfFarmingIncorporationInput.tsx` 100줄, `aggregate-reduction-limits.ts` 150줄 — 모두 안전 |
| 1,407+ 기존 테스트 회귀 | phase별 부분 실행 → 최종 `npm test` |

---

## 11. 참고 법령

- 소득세법 §89, §95, §97, §100, §103, §104, §104의2
- 소득세법 시행령 §162①6호(환지처분확정일), §162의2(감환지/증환지), §166⑥(일괄안분 — WIP 전담), §176의2(1990.8.30 이전)
- 조세특례제한법 §69(자경농지), §77(공익수용), §127(중복배제), §133(종합한도)
- 조세특례제한법 시행령 §66(자경 편입일 안분)

법령 조문은 `lib/tax-engine/legal-codes/transfer.ts`의 `TRANSFER.*` 상수 사용 (barrel import: `from "./legal-codes"` 그대로 유효).
