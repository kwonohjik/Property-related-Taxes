# UI 구현 계획 — 주택 부수토지 명시 입력 전환

> 작성자: transfer-tax-ui-senior  
> 작성일: 2026-05-07  
> 대상: 계획서 `image-44-image-45-joyful-spark.md` UI 파트 전체

---

## 작업 범위 확인 (엔진 시니어와 경계)

**UI 시니어 담당** (본 계획서 대상):
- ① AssetForm 타입에 `landNature` 추가
- ② initial value 갱신 (makeDefaultAsset)
- ③ normalize fallback 갱신 (migrateAsset)
- ④ API 변환 (`transfer-tax-api.ts`) — `landNature` spread, `appurtenantLandRateMode` 제거
- ⑤ UI 위젯 — CompanionAssetCard 토지 블록 RadioCardGroup
- ⑤ Step1 폼-수준 라디오 제거 (`APPURTENANT_LAND_RATE_OPTIONS`, `hasLandAndHousingCombination`, JSX 블록)
- ⑥ 사이드바 합계 — 영향 없음
- ⑦ 결과 표 토지 라벨 — aggregate 헬퍼의 `p.propertyLabel` 생성 로직
- ⑧ Validation — `landNature` 필수 검증 추가

**엔진 시니어 담당** (건드리지 않음):
- `lib/tax-engine/types/transfer.types.ts` (landNature 추가)
- `lib/tax-engine/appurtenant-land-rate.ts` (자동 분기 단순화)
- `lib/tax-engine/transfer-tax-rate-calc.ts` (동적 세율)
- `lib/tax-engine/transfer-tax-helpers.ts` (LTHD 일체)
- `lib/api/transfer-tax-schema.ts` (Zod 메인 — ⑨)
- `lib/api/transfer-tax-schema-sub.ts` (Zod 서브 — ⑩)
- `lib/calc/transfer-tax-api-helpers.ts` (buildAssetPayload — ⑫)
- `app/api/calc/transfer/route.ts` (resolveUserModeOverride 제거 — ⑭)
- anchor 테스트

---

## 파일별 변경 계획

### 1. `lib/stores/calc-wizard-asset.ts` (① 타입)

`AssetForm` 인터페이스에 `// ── companion 토지 세율 수동 오버라이드 ──` 블록 아래에 다음 필드 추가:

```ts
/**
 * 토지 자산의 주택 부수토지 여부 (소득세법 §89·시행령 §154⑦).
 * "appurtenant_to_housing": 함께 양도되는 주택의 마당·정원·진입로 등 사용·효용에 기여
 * "non_business_land":      별도 필지·분리 사용되는 독립 나대지
 * undefined:                미선택 (토지+주택 일괄양도 시 validate에서 차단)
 */
landNature: "appurtenant_to_housing" | "non_business_land" | undefined;
```

위치: L327 (`manualHoldingPeriodOverride` 줄) 바로 다음에 추가.

### 2. `lib/stores/calc-wizard-asset-factory.ts` (② initial, ③ normalize)

**initial (makeDefaultAsset)**:
- 현재 `manualHoldingPeriodOverride: undefined,` 줄(L90) 바로 다음에 추가:
  ```ts
  landNature: undefined,
  ```

**normalize (migrateAsset)**:
- `migrateAsset` 함수 내 기존 마이그레이션 라인들 사이에 추가:
  ```ts
  // landNature — 신규 필드, undefined 보존 (자동 fallback 금지 정책)
  if (a.landNature === undefined) a.landNature = undefined; // no-op: 명시적 보존 주석
  ```
  실제로는 "없으면 건드리지 않는다"는 undefined 보존 패턴이므로 별도 라인 불필요.
  단, 기존 코드에 `a.landNature` 접근이 없으므로 `if (!(a.landNature === "appurtenant_to_housing" || a.landNature === "non_business_land")) a.landNature = undefined;` 형태로 안전 처리.

### 3. `lib/stores/calc-wizard-store.ts` (TransferFormData — `appurtenantLandRateMode` 제거)

**제거 대상 2곳**:
- L110: `appurtenantLandRateMode: "auto" | "unified_short_term_housing" | "individual" | "progressive";`
- L160: `appurtenantLandRateMode: "auto",`

주의: `TransferFormData` 타입에서 이 필드를 제거하면 Step1.tsx의 `form.appurtenantLandRateMode` 참조가 TypeScript 오류가 됨 → Step1.tsx UI 제거와 동시에 수행.

### 4. `lib/calc/transfer-tax-api.ts` (④ API 변환 — ⑬ body spread)

**변경 1** — `appurtenantLandRateMode` 전송 라인 제거 (L551):
```ts
// 제거:
appurtenantLandRateMode: form.appurtenantLandRateMode !== "auto" ? form.appurtenantLandRateMode : undefined,
```

**변경 2** — primary 자산 payload에 `landNature` 추가. primary 자산의 `buildAssetPayload` 호출 또는 직접 spread 영역에 추가.

현재 primary 자산의 직접 spread 패턴 확인 필요. `buildAssetPayload`가 `transfer-tax-api-helpers.ts`에서 처리되므로, **엔진 시니어 담당 헬퍼에 `landNature`를 추가하는 것과 별도로**, 클라이언트 API 변환 함수 내 primary 자산 오브젝트에도 `landNature` spread가 필요한지 확인.

`callTransferTaxAPI`의 bundled 분기에서 primary에 직접 landNature를 spread하는 것은 엔진 시니어 도메인이므로 — UI 시니어는 `form.assets[i].landNature`를 companion payload에 포함하는 로직에서 companion이 `buildAssetPayload`를 통해 전달됨을 확인.

**실제 변경**:
- L551 `appurtenantLandRateMode` 라인 삭제
- companion 변환은 엔진 시니어 `buildAssetPayload`에서 처리 예정 → UI 시니어 확인 후 누락 시 직접 추가

### 5. `app/calc/transfer-tax/steps/Step1.tsx` (⑤ 폼-수준 라디오 제거)

**제거 대상**:
- L18~44: `APPURTENANT_LAND_RATE_OPTIONS` 상수 전체
- L50~53: `hasLandAndHousingCombination` 함수 전체  
  (이 함수가 다른 곳에서 참조되지 않으면 제거. grep으로 확인 필요)
- L232~249: `{hasBundledAssets && hasLandAndHousingCombination(form.assets) && (...)}` JSX 블록 전체

**결과**: `appurtenantLandRateMode`를 참조하는 UI 코드가 모두 제거됨. 이로써 `TransferFormData` 타입에서 해당 필드를 제거해도 TypeScript 오류 없음.

### 6. `components/calc/transfer/CompanionAssetCard.tsx` (⑤ 토지 라디오 추가)

토지 자산 블록(`asset.assetKind === "land"`) 내, 면적 입력 섹션 종료 직후(L352 근방, 환지처분 조건 블록 이후)에 추가.

**추가 위치**: L352 (환지처분 `increase` 조건 블록 닫힘) 다음, 공유 지분율 입력(`OwnershipRatioInput`) 이전.

**추가할 코드**:
```tsx
{/* 주택 부수토지 여부 — 토지 자산 항상 표시 */}
<div className="rounded-lg border border-violet-200/70 bg-violet-50/70 p-3 space-y-2">
  <div className="space-y-0.5">
    <p className="text-sm font-semibold text-violet-900">
      주택 부수토지 여부 (소득세법 §89·시행령 §154⑦)
    </p>
    <p className="text-xs text-muted-foreground">
      토지가 함께 양도되는 주택의 마당·정원·진입로 등 사용·효용에 기여하면
      &apos;주택 부수토지&apos;를 선택하세요. 주택과 별도 필지·별도 사용되는
      토지는 &apos;독립 나대지&apos;를 선택하세요.
    </p>
  </div>
  <RadioCardGroup
    name={`landNature-${asset.assetId}`}
    options={LAND_NATURE_OPTIONS}
    value={asset.landNature}
    onChange={(v) => onChange({ landNature: v })}
    tone="violet"
    layout="stack"
  />
</div>
```

**상수 추가** (컴포넌트 상단):
```ts
const LAND_NATURE_OPTIONS: RadioCardOption<AssetForm["landNature"]>[] = [
  {
    value: "appurtenant_to_housing",
    label: "주택 부수토지",
    description: "함께 양도되는 주택의 마당·정원·진입로 등 사용·효용에 기여하는 토지. 주택과 일체로 과세(§89·영§154⑦).",
  },
  {
    value: "non_business_land",
    label: "독립 나대지",
    description: "주택과 별도 필지로 분리되거나 독립적으로 사용되는 토지. 본래 보유기간 기준 세율 독립 적용.",
  },
];
```

**import 추가**: `RadioCardGroup`, `RadioCardOption` import 확인 및 추가 (이미 존재할 수 있음).

### 7. Validation (⑧) — `lib/calc/transfer-tax-validate.ts`

`validateStep(step === 0)` 내 자산 루프 종료(L561) 이후, `actual 모드 합계 검증` 블록 이전에 추가:

```ts
// ⑧ 주택 부수토지 여부 필수 검증 — 토지+주택 일괄양도 시 (자동 안분 fallback 금지 정책)
const hasLandAsset = form.assets.some((a) => a.assetKind === "land");
const hasHousingAsset = form.assets.some((a) =>
  a.assetKind === "housing" ||
  a.assetKind === "right_to_move_in" ||
  a.assetKind === "presale_right"
);
if (form.assets.length > 1 && hasLandAsset && hasHousingAsset) {
  for (let i = 0; i < form.assets.length; i++) {
    const a = form.assets[i];
    if (a.assetKind !== "land") continue;
    const label = form.assets.length === 1 ? "자산" : `자산 ${i + 1}`;
    if (!a.landNature) {
      return `${label}: 주택 부수토지 여부를 선택하세요. (주택과 함께 양도되는 토지는 부수토지/나대지 구분 필수 — 소득세법 §89·시행령 §154⑦)`;
    }
  }
}
```

### 8. 결과 표 라벨 (⑦)

**`FilingFormTableAggregateHelpers.ts`**:
- `buildAggregateRows` 함수 내 `findAssetByPropertyId` 호출 후 `propertyLabel` 결정 로직에 영향.
- 현재 `propertyLabel`은 `PerPropertyBreakdown.propertyLabel`에서 옴 (엔진이 설정).
- UI 시니어 대응: 컬럼 헤더 라벨을 `assetLabel` 기반으로 보강하는 방식.

**`FilingFormTableHelpers.ts`의 `deriveColumns`**:
- aggregate 모드에서 `aggCols.push({ key: p.propertyId, label })` 이 부분에서 label이 이미 설정됨.
- 엔진이 `p.propertyLabel`에 "토지(부수토지)"/"토지(독립 나대지)"를 넣어야 하지만, UI 시니어는 `findAssetByPropertyId`로 AssetForm을 찾아 `landNature` 기반으로 라벨을 override할 수 있음.

**전략**: `buildAggregateRows` 함수 내 각 자산 컬럼 라벨 생성 시 `findAssetByPropertyId(col).landNature`를 참조하여:
- `"appurtenant_to_housing"` → `"토지(부수토지)"`
- `"non_business_land"` → `"토지(독립 나대지)"`

실제로는 `deriveColumns`에서 컬럼 라벨이 정해지므로 `deriveColumns`의 aggregate 분기에서 AssetForm을 참조해야 함. 그런데 현재 `deriveColumns`는 `formData`를 받지 않음.

**대안**: `deriveColumns`가 이미 `aggregate.properties`의 `propertyLabel`을 그대로 사용하므로, `buildAggregateRows`에서 컬럼을 직접 변경하는 것이 아니라 **TransferTaxCalculator.tsx에서 `ownershipMap` 구성 시 또는 `aggregate` prop 구성 시 `propertyLabel`을 AssetForm의 `landNature`로 보강**하는 것이 가장 깔끔함.

**TransferTaxCalculator.tsx에서 처리**:
```ts
// 자산별 propertyLabel에 landNature suffix 추가
function buildPropertyLabel(asset: AssetForm): string {
  if (asset.assetKind === "land") {
    if (asset.landNature === "appurtenant_to_housing") return `${asset.assetLabel}(부수토지)`;
    if (asset.landNature === "non_business_land") return `${asset.assetLabel}(독립 나대지)`;
  }
  return asset.assetLabel;
}
```

단, 현재 `propertyLabel`은 "양도 1번", "양도 2번" 하드코딩이므로 라벨이 이미 generic함. 실제 자산 라벨 대신 "토지(부수토지)" 같은 명확한 라벨이 필요.

**결론**: 현재 aggregate 헬퍼에서 자산 컬럼 라벨 생성은 `deriveColumns`의 L109-114 `label = p.propertyLabel` 로직. 이 `p.propertyLabel`은 엔진 결과에서 오므로, **UI 시니어는 `FilingFormTableHelpers.ts`의 `deriveColumns`에 formData 옵션 파라미터를 추가하거나, 기존 `aggCols.push` 이전에 AssetForm 참조로 라벨 override**하는 방식을 사용.

가장 최소 침습적 방식: `deriveColumns`에 `formData?: TransferFormData` 파라미터 추가하여 aggregate 모드에서 자산 라벨을 landNature 기반으로 보강.

---

## 9번 자가 점검 누락 패턴 (시작 전)

1. **엔진 input 필드 → AssetForm 미반영**: 이번에는 UI 시니어가 직접 AssetForm에 `landNature` 추가 (충족)
2. **API 변환 미갱신**: `appurtenantLandRateMode` 제거 + (엔진 시니어) `landNature` spread (엔진 담당)
3. **initial value 누락**: `makeDefaultAsset`에 `landNature: undefined` 추가 (충족)
4. **normalize 누락**: `migrateAsset`에 보존 처리 추가 (충족)
5. **결과 노출 누락**: 결과 표 컬럼 라벨에 landNature 표기 (충족)
6. **활성화 조건 누락**: 토지 자산 항상 표시 (계획서 명시)
7. **토글 가시성 미준수**: `RadioCardGroup` 사용, tone="violet" (충족)
8. **산식 숫자 매핑 모호**: 라벨 표기로 충분 (결과 표 라벨)
9. **시점별 분기 누락**: 해당 없음 (부수토지 판정은 면적 한도만)

---

## 실행 순서

1. `lib/stores/calc-wizard-asset.ts` — `landNature` 필드 추가 (① 타입)
2. `lib/stores/calc-wizard-asset-factory.ts` — initial + normalize (② ③)
3. `lib/stores/calc-wizard-store.ts` — `appurtenantLandRateMode` 제거
4. `lib/calc/transfer-tax-api.ts` — `appurtenantLandRateMode` 전송 제거 (④ ⑬ 일부)
5. `app/calc/transfer-tax/steps/Step1.tsx` — 폼-수준 라디오 제거 (⑤)
6. `components/calc/transfer/CompanionAssetCard.tsx` — 토지 RadioCardGroup 추가 (⑤)
7. `lib/calc/transfer-tax-validate.ts` — landNature 필수 검증 (⑧)
8. `components/calc/results/transfer/FilingFormTableHelpers.ts` — 결과 표 라벨 보강 (⑦)
9. `npx tsc --noEmit` 0건 확인
10. 회귀 테스트

---

## 작업 완료 조건 (UI 시니어 도메인)

- [ ] `AssetForm.landNature` 추가 + factory `landNature: undefined` + normalize 보존
- [ ] `TransferFormData.appurtenantLandRateMode` 완전 제거 (타입 + defaultFormData + API 변환)
- [ ] `Step1.tsx` 폼-수준 4옵션 라디오 JSX·상수·함수 완전 제거
- [ ] `CompanionAssetCard.tsx` 토지 블록에 RadioCardGroup 추가 (tone=violet, layout=stack)
- [ ] `transfer-tax-validate.ts` Step0에 landNature 필수 검증 추가 (토지+주택 일괄 시)
- [ ] 결과 표 컬럼 라벨에 "(부수토지)"/"(독립 나대지)" suffix 표기
- [ ] `npx tsc --noEmit` 0건
- [ ] 수동 확인 명시 또는 "수동 확인 미수행" 보고

---

## 위험·주의 사항

1. **TransferFormData에서 appurtenantLandRateMode 제거 시 TypeScript 연쇄 오류**: Step1.tsx, transfer-tax-api.ts, calc-wizard-store.ts defaultFormData 3곳을 같은 커밋에서 동시 수정. 하나씩 수정하면 중간 상태에서 tsc 오류 발생.

2. **companion vs primary 토지**: 현재 `CompanionAssetCard.tsx`는 secondary 자산에만 사용됨. primary 자산도 `assetKind === "land"`일 수 있음 — Step1.tsx에서 primary 자산 카드 렌더 컴포넌트 확인 필요 (아마 `CompanionAssetCard` 동일 컴포넌트 사용).

3. **결과 표 라벨 변경이 `deriveColumns` 인터페이스 변경 필요 여부**: formData를 추가로 전달해야 하면 호출부 `FilingFormTable.tsx`의 `buildRows` 호출도 수정 필요.

4. **엔진 시니어 변경 전 UI 배포 시 Zod schema 미갱신으로 API 400 오류 가능성**: 엔진 시니어가 `appurtenantLandRateMode`를 Zod에서 제거하지 않은 상태에서 UI만 배포하면 OK (필드 미전송 시 schema에서 optional이면 무시). 단, 엔진 시니어가 먼저 제거하면 기존 UI의 `appurtenantLandRateMode` 전송이 Zod에서 unknown field 오류 가능. 동시 배포 권장.
