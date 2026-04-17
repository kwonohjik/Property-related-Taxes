# Plan: 신축·증축 건물 환산취득가액/감정가액 가산세 구현 (소득세법 §114조의2)

## Context

**문제**: 현재 양도소득세 엔진에 **소득세법 §114조의2** 가산세(환산취득가액 또는 감정가액의 5%)가 미구현.
- 대상: 거주자가 건물을 **신축 또는 증축**(증축은 바닥면적 합계 85㎡ 초과에 한정)한 후, **5년 이내**에 양도하면서 **환산취득가액 또는 감정가액**을 취득가액으로 신고하는 경우
- 가산세 = (환산취득가액 or 감정가액) × 5%
- 산출세액이 없어도 부과 (§114조의2 ②)

**시기별 적용**:
- 2018.1.1. 이후 양도: 신축 + 환산취득가액
- 2020.1.1. 이후 양도: 신축 + 증축(85㎡ 초과) + 환산취득가액 + 감정가액

**미지원 필드**:
- 신축/증축 여부·일자
- 증축 바닥면적(85㎡ 판정)
- 감정가액 취득가 방식 (현재는 실거래 / 환산취득가 2가지만)

## 구현 범위

### 1. 타입 · 스토어 확장 — `lib/stores/calc-wizard-store.ts`

```ts
interface TransferFormData {
  // 기존 필드 …
  useEstimatedAcquisition: boolean;  // 환산취득가 (유지)

  // [신규] 취득가 산정 방식 — "actual" | "estimated" | "appraisal"
  acquisitionMethod: "actual" | "estimated" | "appraisal";
  /** 감정가액 (acquisitionMethod === "appraisal" 시 필수) */
  appraisalValue: string;

  // [신규] §114조의2 가산세 판정용
  /** 본인이 신축/증축한 건물 여부 */
  isSelfBuilt: boolean;
  /** "new" = 신축, "extension" = 증축 */
  buildingType: "new" | "extension" | "";
  /** 신축일 또는 증축일(완공일) */
  constructionDate: string;
  /** 증축 바닥면적 합계 (㎡) — buildingType === "extension" 시 필수 */
  extensionFloorArea: string;
}
```

기존 `useEstimatedAcquisition`은 하위 호환 유지(기본값 `false`)하되 신규 `acquisitionMethod`로 점진 치환.

### 2. API 입력 스키마 — `app/api/calc/transfer/route.ts`

Zod 스키마에 위 필드 추가 + superRefine 검증:
- `acquisitionMethod === "appraisal"` → `appraisalValue > 0`
- `isSelfBuilt && buildingType === "extension"` → `extensionFloorArea > 0`
- `isSelfBuilt` → `constructionDate` 유효
- `constructionDate <= transferDate`

### 3. 엔진 — `lib/tax-engine/transfer-tax.ts`

#### 3.1 입력 타입 확장
```ts
interface TransferTaxInput {
  // …
  acquisitionMethod?: "actual" | "estimated" | "appraisal";
  appraisalValue?: number;
  isSelfBuilt?: boolean;
  buildingType?: "new" | "extension";
  constructionDate?: Date;
  extensionFloorArea?: number;
}
```

#### 3.2 취득가 산정 분기 (`calculateAcquisitionPrice` 근처)
- `appraisal` → `appraisalValue`를 `acquisitionPrice`로 사용
- `estimated` → 현재 환산취득가 로직
- `actual` → 실거래가

#### 3.3 가산세 판정 순수 함수 (신규)
```ts
// H-8 헬퍼: 소득세법 §114조의2 판정
function calculateBuildingPenalty(
  input: TransferTaxInput,
  acquisitionPriceForPenalty: number,  // 환산취득가 본체 or 감정가액
): { penalty: number; note: string } | null {

  // 1. propertyType === "building" 또는 "housing"(자가 건축)
  if (!input.isSelfBuilt) return null;

  // 2. 취득가 산정 방식 확인
  const method = input.acquisitionMethod;
  const isPenaltyMethod =
    method === "estimated" ||
    (method === "appraisal" && isAfter(input.transferDate, "2020-01-01"));
  if (!isPenaltyMethod) return null;

  // 3. 2018.1.1 이후 양도분부터 적용
  if (isBefore(input.transferDate, "2018-01-01")) return null;

  // 4. 증축의 경우: 2020.1.1 이후 + 85㎡ 초과
  if (input.buildingType === "extension") {
    if (isBefore(input.transferDate, "2020-01-01")) return null;
    if ((input.extensionFloorArea ?? 0) <= 85) return null;
  }

  // 5. 건축일(신축일/증축일)로부터 5년 이내 양도
  if (!input.constructionDate) return null;
  const yearsHeld = diffYears(input.constructionDate, input.transferDate);
  if (yearsHeld >= 5) return null;

  // 6. 가산세 = 대상가액 × 5%
  const penalty = applyRate(acquisitionPriceForPenalty, 0.05);
  const typeLabel = input.buildingType === "extension" ? "증축" : "신축";
  const methodLabel = method === "appraisal" ? "감정가액" : "환산취득가액";
  return {
    penalty,
    note: `${typeLabel} 5년 이내 양도 + ${methodLabel} 적용`,
  };
}
```

#### 3.4 STEP 10.5 삽입 (결정세액 다음, 지방소득세 이전)
```ts
// STEP 10.5: §114조의2 가산세
const penaltyResult = calculateBuildingPenalty(
  effectiveInput,
  input.useEstimatedAcquisition ? acquisitionPriceBase : (input.appraisalValue ?? 0),
);
const penaltyTax = penaltyResult?.penalty ?? 0;
if (penaltyTax > 0) {
  steps.push({
    label: "신축·증축 가산세",
    formula: `${대상가액.toLocaleString()}원 × 5% (${penaltyResult!.note})`,
    amount: penaltyTax,
    legalBasis: TRANSFER.BUILDING_PENALTY,
  });
}
```

#### 3.5 결정세액 합산 조정
- §114조의2 ①: 가산세는 **결정세액에 더함**
- 지방소득세 계산 기준: 결정세액(가산세 포함) × 10%
  ```ts
  const determinedTaxWithPenalty = determinedTax + penaltyTax;
  const localIncomeTax = truncateToThousand(applyRate(determinedTaxWithPenalty, 0.1));
  ```

### 4. 법령 코드 추가 — `lib/tax-engine/legal-codes.ts`

```ts
/** 소득세법 §114조의2 — 감정가액·환산취득가액 적용 시 가산세(5%) */
BUILDING_PENALTY: "소득세법 §114조의2",
```

### 5. UI 업데이트 — `app/calc/transfer-tax/TransferTaxCalculator.tsx`

**Step3 (취득 정보)**:
- 기존 "환산취득가액 사용" 체크박스 → 3지선다 라디오로 변경
  - `○ 실거래가` `○ 환산취득가액` `○ 감정가액`
- `감정가액` 선택 시 `appraisalValue` 입력 필드 표시
- 항상 표시: "본인이 신축/증축한 건물입니까?" 체크박스
  - 체크 시: 신축/증축 라디오 + 신축·증축일(DateInput) + 증축 시 바닥면적 입력

**Step5 결과 화면**: 기존 steps 배열에 자동 포함되어 별도 수정 불필요

### 6. 호출 함수 업데이트 — `lib/calc/transfer-tax-api.ts`

`callTransferTaxAPI`에서 body에 신규 필드 직렬화:
```ts
acquisitionMethod: form.acquisitionMethod,
appraisalValue: form.acquisitionMethod === "appraisal" ? parseAmount(form.appraisalValue) : 0,
isSelfBuilt: form.isSelfBuilt,
buildingType: form.buildingType || undefined,
constructionDate: form.isSelfBuilt ? form.constructionDate : undefined,
extensionFloorArea: form.buildingType === "extension" ? parseFloat(form.extensionFloorArea) : undefined,
```

### 7. 테스트 — `__tests__/tax-engine/transfer-tax.test.ts`

신규 describe 블록 "T-17: §114조의2 신축·증축 가산세":
- ✅ 신축 + 환산취득가 + 5년 이내 → 5% 가산세
- ✅ 증축 85㎡ 초과 + 환산취득가 + 5년 이내 → 5% 가산세
- ❌ 증축 85㎡ 이하 → 가산세 0
- ❌ 5년 초과 → 가산세 0
- ❌ 실거래가 사용 → 가산세 0
- ✅ 감정가액 + 2020.1.1 이후 양도 → 5% 가산세
- ❌ 감정가액 + 2019년 양도 → 가산세 0 (시기 미적용)
- ❌ 2017년 양도 → 가산세 0
- ✅ 산출세액 0 + 가산세만 부과되는 케이스 (§114조의2 ②)
- ✅ 지방소득세 계산 시 가산세 포함한 결정세액 × 10%

## 수정 파일 목록

| 파일 | 역할 |
|------|------|
| `lib/stores/calc-wizard-store.ts` | 폼 필드 6개 추가 |
| `app/api/calc/transfer/route.ts` | Zod 스키마 + 입력 정규화 |
| `lib/tax-engine/transfer-tax.ts` | TransferTaxInput 확장 + `calculateBuildingPenalty` + STEP 10.5 삽입 |
| `lib/tax-engine/legal-codes.ts` | `BUILDING_PENALTY` 상수 추가 |
| `app/calc/transfer-tax/TransferTaxCalculator.tsx` | Step3 UI (3지선다 + 신축 섹션) |
| `lib/calc/transfer-tax-api.ts` | body 직렬화 |
| `__tests__/tax-engine/transfer-tax.test.ts` | T-17 케이스 9개 |

## 검증 방법

1. `npm test` — T-17 전체 통과 확인
2. `npm run dev`에서 수동 검증:
   - 건물 신축 2023.1.1 / 양도 2026.3.1(3년 보유) / 환산취득가 5억 → 가산세 2,500만원 표시
   - 건물 증축 60㎡ / 5년 이내 → 가산세 0 (바닥면적 미달)
   - 감정가액 3억 + 양도 2019.6.1 → 가산세 0 (2020년 이전은 환산취득가만)
3. 결과 화면에서 "신축·증축 가산세" step 표시 + "소득세법 §114조의2" 링크 클릭 → 조문 팝업 정상
4. 지방소득세 계산: (결정세액 + 가산세) × 10% 로 변경되는지 확인

## 향후 확장 (현 단계 범위 밖)

- 상증세·취득세 등 타 세목의 §114조의2 유사 가산세는 본 PR 범위 제외
- 조특법 §33(신축주택 감면)과 §114조의2의 상호작용은 별도 검토 필요
