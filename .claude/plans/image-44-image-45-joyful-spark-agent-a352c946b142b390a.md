# Plan: landNature 자산-수준 필드 도입 + appurtenantLandRateMode 폼-전역 제거

## 목표
- 토지 자산의 주택 부수토지 여부를 자산 카드에서 명시적으로 입력받는다 (`landNature`)
- 폼-전역 `appurtenantLandRateMode` RadioCardGroup(Step1 하단)을 완전 제거한다
- 결과 표 토지 자산 컬럼 라벨에 부수토지/나대지 suffix를 추가한다

## 변경 파일 목록 (8개)

1. `lib/stores/calc-wizard-asset.ts` — AssetForm에 `landNature` 필드 추가
2. `lib/stores/calc-wizard-asset-factory.ts` — initial + migrate fallback
3. `lib/stores/calc-wizard-store.ts` — TransferFormData에서 `appurtenantLandRateMode` 완전 제거
4. `lib/calc/transfer-tax-api.ts` — `landNature` 매핑 추가 + `appurtenantLandRateMode` 라인 제거
5. `app/calc/transfer-tax/steps/Step1.tsx` — 상수·함수·JSX 블록 제거
6. `components/calc/transfer/CompanionAssetCard.tsx` — 토지 자산 카드에 RadioCardGroup 추가
7. `lib/calc/transfer-tax-validate.ts` — Step1(step 0) landNature 미입력 차단
8. `components/calc/results/transfer/FilingFormTableHelpers.ts` 또는 `FilingFormTableAggregateHelpers.ts` — 토지 컬럼 라벨 suffix

## 상세 변경 명세

### 1. lib/stores/calc-wizard-asset.ts
AssetForm 인터페이스에 `manualHoldingPeriodOverride` 직후 추가:
```ts
/**
 * 토지 자산의 주택 부수토지 여부 (assetKind === "land" 전용).
 * - "appurtenant_to_housing": 주택의 마당·정원·진입로 등 — 주택과 일체과세 가능
 * - "non_business_land": 독립 나대지 — 별도 필지로 분리·독립 사용
 * - undefined: 미선택 (단독 토지 양도 시는 선택 불필요)
 * 소득세법 §89·시행령 §154⑦ 기준.
 */
landNature: "appurtenant_to_housing" | "non_business_land" | undefined;
```

### 2. lib/stores/calc-wizard-asset-factory.ts
makeDefaultAsset에 `manualHoldingPeriodOverride: undefined` 줄 직후:
```ts
landNature: undefined,
```

migrateAsset에 `manualHoldingPeriodOverride` 마이그레이션 직후:
```ts
if (a.landNature === undefined) a.landNature = undefined; // undefined 보존
// 알 수 없는 값이면 undefined fallback
const validLandNatures = ["appurtenant_to_housing", "non_business_land"];
if (a.landNature && !validLandNatures.includes(a.landNature as string)) {
  a.landNature = undefined;
}
```

### 3. lib/stores/calc-wizard-store.ts
TransferFormData에서 `appurtenantLandRateMode` 필드 완전 제거.
defaultFormData에서 `appurtenantLandRateMode: "auto"` 라인 제거.

### 4. lib/calc/transfer-tax-api.ts
bundled 블록(`form.assets.length > 1` spread) 내:
- `appurtenantLandRateMode: form.appurtenantLandRateMode !== "auto" ? ...` 라인 완전 제거
- primary body에 `landNature: primary.landNature` 추가

### 5. app/calc/transfer-tax/steps/Step1.tsx
- `APPURTENANT_LAND_RATE_OPTIONS` 상수 제거
- `hasLandAndHousingCombination` 함수 제거 (Step1에서만 사용 확인됨)
- `hasBundledAssets && hasLandAndHousingCombination(form.assets) && (...)` JSX 블록 완전 제거

### 6. components/calc/transfer/CompanionAssetCard.tsx
파일 상단 상수 신설:
```ts
const LAND_NATURE_OPTIONS = [
  {
    value: "appurtenant_to_housing" as const,
    label: "주택 부수토지",
    description: "주택의 마당·정원·진입로 등 사용·효용에 기여하는 토지",
  },
  {
    value: "non_business_land" as const,
    label: "독립 나대지",
    description: "주택과 별도 필지로 분리·독립 사용되는 토지",
  },
];
```

`assetKind === "land"` 블록 내 면적 입력 직후에 RadioCardGroup 추가:
```tsx
{/* 주택 부수토지 여부 (일괄양도 시만 표시 — 단독 토지 양도는 불필요) */}
{isMultiBundled && (
  <div className="space-y-1.5">
    <p className="text-sm font-semibold">
      주택 부수토지 여부 (소득세법 §89·시행령 §154⑦)
    </p>
    <p className="text-xs text-muted-foreground">
      함께 양도되는 주택과 한 묶음으로 사용·관리되면 &apos;주택 부수토지&apos;, 별도 필지로
      분리·독립 사용되면 &apos;독립 나대지&apos;를 선택하세요.
    </p>
    <RadioCardGroup
      name={`landNature-${asset.assetId}`}
      options={LAND_NATURE_OPTIONS}
      value={asset.landNature ?? ""}
      onChange={(v) => onChange({ landNature: v as AssetForm["landNature"] })}
      tone="violet"
      layout="stack"
    />
  </div>
)}
```

### 7. lib/calc/transfer-tax-validate.ts
step === 0 검증 블록에서 자산 배열 순회 시 추가:
```ts
// 일괄양도 + land + housing 조합 시 land 자산의 landNature 미입력 차단
const hasHousingLike = form.assets.some(
  (a) => a.assetKind === "housing" || a.assetKind === "right_to_move_in" || a.assetKind === "presale_right"
);
if (hasHousingLike) {
  for (const a of form.assets) {
    if (a.assetKind === "land" && !a.landNature) {
      const label = a.assetLabel || "토지 자산";
      return `${label}: 주택 부수토지 여부를 선택하세요. (주택과 함께 양도되는 토지는 부수토지/나대지 구분 필수 — 소득세법 §89·시행령 §154⑦)`;
    }
  }
}
```

### 8. 결과 표 라벨 (FilingFormTableHelpers.ts 또는 FilingFormTableAggregateHelpers.ts)
`deriveColumns` 함수의 aggregate 모드 컬럼 라벨 생성 시, 또는 buildAggregateRows에서 자산 컬럼 라벨 지정 시:
- `findAssetByPropertyId(col)?.landNature === "appurtenant_to_housing"` → label에 `(부수토지)` suffix
- `findAssetByPropertyId(col)?.landNature === "non_business_land"` → label에 `(독립 나대지)` suffix

구체적으로 `deriveColumns`의 aggregate 컬럼 생성 루프:
```ts
// 토지 자산 라벨에 landNature suffix 추가
const assetForm = formData?.assets.find(a => a.assetId === p.propertyId || (p.propertyId === "primary" && formData.assets[0]?.assetId === a.assetId));
if (assetForm?.assetKind === "land" && assetForm.landNature) {
  const suffix = assetForm.landNature === "appurtenant_to_housing" ? "(부수토지)" : "(독립 나대지)";
  label = `${p.propertyLabel} ${suffix}`;
}
```

단, `deriveColumns`는 현재 `formData`를 받지 않으므로 `FilingFormTableHelpers.ts`의 `deriveColumns` 시그니처를 변경하거나, 호출부에서 라벨을 직접 조작해야 한다.

더 간단한 대안: `buildAggregateRows` 내 컬럼 라벨은 `deriveColumns`에서 결정되므로, `FilingFormTable.tsx`에서 `deriveColumns` 결과를 받아 컬럼을 post-process하는 방식으로 구현.

또는, `FilingFormTableAggregateHelpers.ts`의 `buildAggregateRows`는 formData를 받으므로 `findAssetByPropertyId`를 활용하여 자산 컬럼 헤더 정보를 별도로 반환하는 방식.

실용적 해결책: `FilingFormTableHelpers.ts`의 `deriveColumns`에 optional `formData` 파라미터를 추가하여 aggregate 모드에서 토지 자산의 landNature를 읽어 라벨에 suffix를 붙인다.

## 타입 주의사항
- `CompanionAssetCardNewConstruction.tsx`에서 `appurtenantLandRateMode` 참조가 없는지 확인 필요
- route.ts에서 `appurtenantLandRateMode` 엔진 매핑은 **엔진 시니어 병렬 작업** 영역이므로 건드리지 않음
  - 단, `form.appurtenantLandRateMode`를 읽는 API 변환 라인만 제거 (route.ts는 엔진 영역)

## 작업 순서
1. AssetForm 타입 추가 (① 타입)
2. initial + migrate (② ③)
3. TransferFormData 필드 제거
4. API 변환 갱신 (④)
5. Step1.tsx UI 제거 (⑤)
6. CompanionAssetCard.tsx UI 추가 (⑤)
7. validate 추가 (⑧)
8. 결과 표 라벨 (⑦)
9. tsc --noEmit 확인

## 주의: 엔진 영역 불가침
- `app/api/calc/transfer/route.ts` — `appurtenantLandRateMode` route handler 매핑은 유지 (엔진 시니어 작업)
- `lib/api/transfer-tax-schema.ts` — Zod schema 변경 금지
- anchor 테스트 (`__tests__/tax-engine/`) — 변경 금지
