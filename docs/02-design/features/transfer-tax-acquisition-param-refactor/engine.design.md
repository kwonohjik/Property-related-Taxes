# calculateTransferTax STEP 2 취득가액 매개변수화 — 엔진 설계

> **Plan**: `docs/00-pm/transfer-tax-acquisition-param-refactor.plan.md`
> **상위 목적**: 가업상속공제 §97의2④ 의제 산식 도입을 위한 사전 리팩토링 (K7)
> **작성일**: 2026-05-22
> **상태**: Design Phase

---

## Context

`transfer-fb-cgt-credit-integration` PR은 양도세 엔진을 **2회 호출**해야 함:
- 1회: §97 일반 산식 (피상속인 취득가액)
- 2회: §97의2④ 의제 산식 (상속세 과세가액 기준 의제 취득가액)

현재 `calculateTransferTax(input, rates)` 는 input.acquisitionPrice 등 취득가액 결정 로직을
**엔진 내부 STEP 0.4~0.65** 에서 결정·변환하므로 외부에서 override 불가.

---

## ★ 케이스 인벤토리 (5분기 — 행≥1 필수)

| # | 시나리오 | STEP 2 결정 로직 | override 적용 위치 | anchor 파일 | 상태 |
|---|---------|----------------|-----------------|-----------|------|
| 1 | **일반 단건** 주택·건물·토지 실가 취득 | `input.acquisitionPrice` | override 우선, 없으면 input 사용 | `transfer-tax-acquisition-override.test.ts` TRP-OVERRIDE-1 | ☐ TODO |
| 2 | **환산취득가** (`useEstimatedAcquisition=true`) | `calculateEstimatedAcquisitionPrice` 호출 (STEP 0.35/1.0) | **override 시 환산 로직 우회 강제** — 의제·환산 동시 적용 차단 | `transfer-tax-acquisition-override.test.ts` TRP-OVERRIDE-2 | ☐ TODO |
| 3 | **다필지** (multi-parcel, `handleMultiParcelBranch`) | `parcels[].acquisitionPrice` 합 | `acquisitionOverridesByAssetId`로 필지 ID별 override (합산 후 통합) | `transfer-tax-acquisition-override.test.ts` TRP-OVERRIDE-3 | ☐ TODO |
| 4 | **재개발 입주권** (`isRedevelopmentActive=true`) | `redevelopmentInfo.rightsValue` 등 별도 분기 | override는 합계만 적용, 분배(인가전/인가후) 는 기존 로직 보존 | `transfer-tax-acquisition-override.test.ts` TRP-OVERRIDE-CROSS-1 | ☐ TODO |
| 5 | **감정가액** (`acquisitionMethod="appraisal"`, `isAppraisalAcquisition=true`) | `appraisalValue` | override 우선 (appraisalValue 무시) | `transfer-tax-acquisition-override.test.ts` TRP-OVERRIDE-CROSS-2 | ☐ TODO |

**회귀 케이스** (options 미입력 시 기존 1,237 anchor와 byte-identical):

| # | 시나리오 | anchor | 상태 |
|---|---------|--------|------|
| R1 | options 미입력 — 비과세 단건 | TRP-REGRESSION-1 | ☐ TODO |
| R2 | options=undefined 명시 | TRP-REGRESSION-2 | ☐ TODO |
| R3 | options.acquisitionOverride=undefined 명시 | TRP-REGRESSION-3 | ☐ TODO |

---

## 법령 근거

본 리팩토링은 순수 함수 시그니처 확장이므로 새 조문 추가 없음.

의제 취득가액 본체 (후속 PR):
- 소득세법 §97의2 ④ — "상속·증여 재산가액 기준 의제 취득가액"
- 소득세법 시행령 §163 ③ — 상속·증여 재산가액 계산 기준

---

## 신규 함수 시그니처

```typescript
// lib/tax-engine/transfer-tax.ts

export interface TransferTaxAcquisitionOptions {
  /**
   * 단건 양도 시 취득가액 강제 (override).
   * - undefined: 기존 동작 (input 그대로 사용) — 회귀 0건 보장
   * - number: STEP 2 결정 결과 무시하고 본 값 강제
   * - 환산취득가 모드(`useEstimatedAcquisition=true`)에서 override 설정 시:
   *   환산 계산 우회 + override 값 직접 사용 (의제·환산 동시 적용 차단)
   */
  acquisitionOverride?: number;

  /**
   * 다자산 모드 — 자산 ID별 취득가액 강제.
   * key: parcel.id (TransferParcelInput.id 또는 자산 고유 식별자)
   * value: 해당 자산 취득가액 override
   */
  acquisitionOverridesByAssetId?: Record<string, number>;
}

export function calculateTransferTax(
  rawInput: TransferTaxInput,
  rates: TaxRatesMap,
  options?: TransferTaxAcquisitionOptions,
): TransferTaxResult;
```

---

## STEP 2 결정 진입점 분리 설계

### 핵심 헬퍼: `resolveAcquisitionPrice`

단일 진입점으로 통일. 위치: `transfer-tax-helpers.ts` (새 export 함수).

```typescript
/**
 * STEP 2 취득가액 결정 — 우선순위:
 * 1. options.acquisitionOverride (명시적 override)
 * 2. 기존 input 결정 로직 (useEstimatedAcquisition / appraisalValue / acquisitionPrice)
 *
 * 환산 우회 정책:
 *   acquisitionOverride가 있을 때 useEstimatedAcquisition=true인 경우
 *   → 환산 계산 없이 override 값 직접 사용
 *   → input.useEstimatedAcquisition=false로 재바인딩 (calcTransferGain 경로 통일)
 */
export function resolveAcquisitionOverride(
  input: TransferTaxInput,
  options: TransferTaxAcquisitionOptions | undefined,
): TransferTaxInput;
// 반환: override 적용 후 TransferTaxInput (불변 객체 스프레드)
```

### 적용 위치 (transfer-tax.ts 파이프라인)

```
STEP 0 (세율 파싱)
STEP 0.4 (pre-1990 토지)
STEP 0.45 (상속 의제)
  ↓
★ STEP 0.46 — resolveAcquisitionOverride(input, options) 호출 (신규)
  → acquisitionOverride 있으면 input.acquisitionPrice 교체
  → 환산 모드이면 useEstimatedAcquisition=false 교체
  ↓
STEP 0.475 (이월과세)
STEP 0.48 (부담부증여)
STEP 0.5 (다주택 판정)
...
STEP 0.65 (재개발 분기 — 재개발은 내부 처리)
STEP 2 (calcTransferGain)
```

### 재개발 분기 처리

`calculateRedevelopmentTax` 내부에서 `options`를 전달받아 동일 로직 적용.
현재 시그니처: `calculateRedevelopmentTax(effectiveInput, parsedRates, steps)`
확장: `calculateRedevelopmentTax(effectiveInput, parsedRates, steps, options?)`

### 다필지 분기 처리

`handleMultiParcelBranch` 내부에서 `options.acquisitionOverridesByAssetId`를
각 parcels에 매핑 후 개별 acquisitionPrice override.
현재 시그니처: `handleMultiParcelBranch({ rawInput, effectiveInput, ... }, steps)`
확장: context에 `options` 추가.

---

## 800줄 정책 판단

| 파일 | 현재 줄수 | 예상 추가 | 예상 결과 |
|------|---------|---------|---------|
| `transfer-tax.ts` | **800** | +40 (resolveAcquisitionOverride 호출 + options 전파 3곳) | **840 → 분할 필요** |
| `transfer-tax-helpers.ts` | 799 | +30 (resolveAcquisitionOverride 함수) | **829 → 분할 필요** |
| `transfer-tax-rate-calc.ts` | 739 | +15 (handleMultiParcelBranch context 확장) | 754 (OK) |
| `transfer-tax-finalize.ts` | 254 | 0 | 254 (OK) |
| `transfer-tax-redevelopment.ts` | (확인 필요) | +20 (options 전파) | TBD |

**결론**: `transfer-tax.ts` (800줄)와 `transfer-tax-helpers.ts` (799줄) 양쪽 모두 신규 코드 추가 시 **800줄 정책 초과** 예상.

**분할 전략**:
- `resolveAcquisitionOverride` → `transfer-tax-acquisition-override.ts` **신규 파일** (~50줄)로 격리
- 이로 인해 `transfer-tax.ts`에서 import 1줄 추가만 발생 (본체 증가 없음)
- `transfer-tax-helpers.ts`는 resolveAcquisitionOverride 제외 시 추가 분할 불필요

---

## Silent fallback / 자동 안분 후보 식별

- `options.acquisitionOverride = 0` 허용 (외부에서 명시적 0 지정 — 의도된 override)
- `options.acquisitionOverride = undefined`: 기존 input 그대로 (fallback 없음)
- `options.acquisitionOverridesByAssetId` key가 parcel.id에 없는 경우: 기존 parcel.acquisitionPrice 그대로 (명시 override만 적용)
- **자동 안분 fallback 금지**: override 값이 없으면 기존 로직 그대로, 빈 값 자동 보정 없음

---

## 계산 알고리즘 (단계별)

### 일반 단건 (분기 1, 5)

```
1. options.acquisitionOverride 유무 확인
2. 있으면: input = { ...input, acquisitionPrice: options.acquisitionOverride, useEstimatedAcquisition: false }
3. 없으면: input 그대로 (기존 동작 보장)
```

### 환산취득가 (분기 2)

```
1. options.acquisitionOverride 유무 확인
2. 있으면: 환산 계산(calculateEstimatedAcquisitionPrice) 건너뜀
           input = { ...input, acquisitionPrice: options.acquisitionOverride, useEstimatedAcquisition: false }
           → STEP 0.35 commercial building 환산도 건너뜀
3. 없으면: 기존 환산 경로 그대로
```

### 다필지 (분기 3)

```
1. options.acquisitionOverridesByAssetId 유무 확인
2. 각 parcel에 대해: overridesByAssetId[parcel.id] 있으면 parcel.acquisitionPrice 교체
3. 없는 parcel: 기존 parcel.acquisitionPrice 그대로
4. 합산 후 기존 다필지 로직 진행
```

### 재개발 (분기 4)

```
1. calculateRedevelopmentTax 호출 시 options 전달
2. redevelopmentInfo.rightsValue 기반 내부 로직에서 options.acquisitionOverride 확인
3. override 있으면: rightsValue 무시, override 강제
4. override 없으면: 기존 로직
```

---

## 테스트 약속

- **TRP-REGRESSION-1~3**: options 미입력 시 기존 anchor와 byte-identical (회귀 보장)
- **TRP-OVERRIDE-1**: 단건 + acquisitionOverride → acquisitionPrice 교체 확인
- **TRP-OVERRIDE-2**: 환산 모드 + acquisitionOverride → 환산 우회 확인 (`usedEstimatedAcquisition=false`)
- **TRP-OVERRIDE-3**: 다필지 + acquisitionOverridesByAssetId → 필지별 override 확인
- **TRP-OVERRIDE-CROSS-1**: 재개발 + acquisitionOverride → rightsValue 무시 확인
- **TRP-OVERRIDE-CROSS-2**: 감정가액 + acquisitionOverride → appraisalValue 무시 확인

Pre-Do anchor 파일: `__tests__/tax-engine/transfer-tax/transfer-tax-acquisition-override.test.ts`

---

## Do 작업 분해 (day 1~5)

| Day | 작업 | 파일 | 예상 줄수 |
|-----|------|------|---------|
| 1 | `TransferTaxAcquisitionOptions` 타입 정의 + `resolveAcquisitionOverride` 신규 파일 | `transfer-tax-acquisition-override.ts` (신규) | ~60 |
| 1 | `calculateTransferTax` 시그니처 확장 + STEP 0.46 진입점 삽입 | `transfer-tax.ts` | +15 |
| 2 | 환산취득가 (STEP 0.35) override 우회 처리 | `transfer-tax.ts` | +10 |
| 2 | commercial building STEP 0.35 override 연동 | `transfer-tax.ts` | +5 |
| 3 | 다필지 (`handleMultiParcelBranch`) context 확장 | `transfer-tax-rate-calc.ts` | +25 |
| 4 | 재개발 (`calculateRedevelopmentTax`) options 전달 | `transfer-tax-redevelopment.ts` | +20 |
| 5 | 감정가액 분기 확인 + cross-cutting 회귀 전수 검증 | (회귀 검증) | - |

---

## 위험 및 대응

| ID | 위험 | 대응 |
|----|------|------|
| R1 | 다필지·재개발·환산 분기 누락 | §4 케이스 매트릭스 + TRP-OVERRIDE-CROSS anchor |
| R2 | 회귀 1,237 anchor 중 누락 | `npx vitest run __tests__/tax-engine/transfer-tax/` 전수 |
| R3 | calcCarryoverScenarios에 calculateTransferTax 주입 → options 미전달 | STEP 0.475 재귀 호출 시 options 전달 누락 주의 |
| R4 | 800줄 정책 초과 | `resolveAcquisitionOverride` 신규 파일 분리 (설계 반영) |

---

## UI 통합 위임

본 PR은 순수 엔진 리팩토링 — UI 변경 없음.
14개 동기화 지점 ①~⑭ 변경 없음.
후속 `transfer-fb-cgt-credit-integration` PR에서 route handler(⑭)만 options 주입.
