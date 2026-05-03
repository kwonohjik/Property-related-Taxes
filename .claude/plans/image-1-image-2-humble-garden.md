# 후속 작업: 양도시 PHD 검증 fallback + ③ 양도시 4부분 splitMode 확장

**적용 범위 (절대 한정)**: 검용주택 + PHD(`usePreHousingDisclosure === true`) + Case A(`house_to_commercial` AND `firstDisclosureDate < usageChangeDate`). 다른 케이스는 일절 수정하지 않음.

## Context

이전 plan(Case A 4부분 안분)은 구현·검증 완료. 사용자가 실제 입력 시 두 가지 후속 이슈 발견.

### 이슈 1 — 검증 오류 (이미지 7)

사용자가 메인 양도시 섹션에서 "개별주택가격 380,000,000원"을 입력했는데도 `자산: 양도시 개별주택가격을 입력하세요` 오류 발생.

**원인 (`lib/calc/transfer-tax-validate.ts` L83~84)**:
```typescript
if (!asset.phdTransferHousingPrice || parseAmount(asset.phdTransferHousingPrice) <= 0)
  return `${label}: 양도시 개별주택가격을 입력하세요.`;
```

`phdTransferHousingPrice`만 검증하지만, **API 변환은 fallback** 처리(`lib/calc/transfer-tax-api.ts` L305~307):
```typescript
transferHousingPrice:
  parseAmount(primary.phdTransferHousingPrice) ||
  parseAmount(primary.mixedTransferHousingPrice),  // ← 메인 섹션 입력값으로 fallback
```

→ CLAUDE.md ⑧ 동기화 지점 위반("API/UI fallback 추가 시 validation에도 같은 fallback 인식"). 정책에 따라 수정 필수.

### 이슈 2 — ③ 양도시 splitMode 미적용 (이미지 5/6 비교)

현재 ① 취득시·② 최초공시는 splitMode 적용되어 주택분/상가분이 같은 행에 표시되지만, **③ 양도시는 주택분만** 표시됨. 양도시 상가건물 기준시가는 별도의 메인 양도시 섹션에서 입력 → 시점 일관성 깨짐.

사용자 제안: ③ 양도시도 splitMode로 통일하여 주택분/상가분을 같은 행에 표시.

### 사용자 제안에 대한 의견 — 동의

**장점**:
- 시점별 입력 일관성 (① ② ③ 모두 동일 패턴)
- Case A 사용자가 양도시 상가건물·주택건물을 한 곳에서 함께 검토 가능
- 4부분 합산기준시가가 ③에도 자동 표시되어 시점별 비교 직관적

**문제점/주의사항**:
1. **데이터 중복**: 양도시 상가건물 기준시가는 이미 메인 양도시 섹션의 `mixedTransferCommercialBuildingPrice` 필드에 입력됨. ③에서 추가로 노출하면 같은 필드를 두 곳에서 표시·편집 → 사용자 혼란 가능.
   - 해결: **별도 폼 필드 신설 금지**. 기존 `mixedTransferCommercialBuildingPrice`를 직접 read/write 양방향. 같은 필드를 두 곳에서 편집 가능 → 자동 동기화 (mirror 정책 위반 없음, useEffect 미사용).
2. **PHD 비활성 케이스**: 일반 검용주택·Case B 등에서는 ③도 주택분만 표시 — 기존 동작 유지. splitMode prop이 false이면 변경 없음.

## 수정 범위

### 1️⃣ Validation fallback (이슈 1)

**파일**: `lib/calc/transfer-tax-validate.ts`, L83~84

```typescript
// 수정 전
if (!asset.phdTransferHousingPrice || parseAmount(asset.phdTransferHousingPrice) <= 0)
  return `${label}: 양도시 개별주택가격을 입력하세요.`;

// 수정 후 — API와 동일 fallback 인식
const transferHousingValue =
  parseAmount(asset.phdTransferHousingPrice) ||
  parseAmount(asset.mixedTransferHousingPrice);
if (transferHousingValue <= 0)
  return `${label}: 양도시 개별주택가격을 입력하세요. (양도시 기준시가 섹션)`;
```

### 2️⃣ ③ 양도시 splitMode 확장 (이슈 2)

**파일**: `components/calc/transfer/ThreePointStandardPriceInput.tsx`

신규 props 추가:
- `commercialBuildingStdPriceAtTransfer?: string`
- `onCommercialBuildingStdPriceAtTransferChange?: (v: string) => void`

세 번째 PointBlock 호출 시 `splitMode` 전달 + 새 props 라우팅:
```tsx
<PointBlock
  label={transferLabel}
  ...
  splitMode={splitMode}
  housingLandArea={props.housingLandArea}
  commercialLandArea={props.commercialLandArea}
  commercialBuildingStdPrice={props.commercialBuildingStdPriceAtTransfer}
  onCommercialBuildingStdPriceChange={props.onCommercialBuildingStdPriceAtTransferChange}
/>
```

**파일**: `components/calc/transfer/mixed-use/MixedUsePreHousingDisclosureSection.tsx`

`ThreePointStandardPriceInput` 호출 시 양도시 상가건물 props 추가 — **별도 폼 필드 신설 없이** 기존 `mixedTransferCommercialBuildingPrice`를 직접 read/write:
```tsx
commercialBuildingStdPriceAtTransfer={asset.mixedTransferCommercialBuildingPrice}
onCommercialBuildingStdPriceAtTransferChange={(v) =>
  onChange({ mixedTransferCommercialBuildingPrice: v })
}
```

### 3️⃣ 영향 없음 (변경 금지)

- 엔진 로직, API 변환, 폼 타입(`AssetForm`), Zod 스키마, initial value, normalize, 테스트 — 모두 변경 불필요
- 메인 양도시 섹션(`MixedUseStandardPriceInputs`)은 그대로 유지 — Case A 활성 시 메인 섹션과 ③ 양도시 모두에서 상가건물 편집 가능 (같은 필드, 자동 동기화)
- PHD 비활성·Case B 등 다른 모든 케이스: `splitMode === false` → ③ 양도시 단일 컬럼 유지 (변경 없음)

## 검증

1. **타입 체크**: `npx tsc --noEmit` — 0 오류
2. **회귀 테스트**: `npx vitest run __tests__/tax-engine/transfer-tax/` — 325 테스트 통과
3. **수동 확인**: 엑셀 사례(주택일부 용도변경.xlsx) 입력 → 검증 오류 없음, 산출세액 ≈ 320,192,214원 확인
4. **다른 케이스 회귀**: PHD 비활성 검용주택, commercial_to_house, Case B 케이스에서 ③ 양도시 UI 변경 없음 확인

## 핵심 파일

- `lib/calc/transfer-tax-validate.ts` — L83~84 fallback 추가
- `components/calc/transfer/ThreePointStandardPriceInput.tsx` — 신규 2개 props + 세 번째 PointBlock에 splitMode 라우팅
- `components/calc/transfer/mixed-use/MixedUsePreHousingDisclosureSection.tsx` — 양도시 상가건물 props 전달 (`mixedTransferCommercialBuildingPrice` 직접 양방향)
