# 1990.8.30. 이전 토지 환산이 환산 가격 미리보기에 반영되지 않음 — 0원 회귀

## Context

이전 작업에서 1990 이전 토지의 등급가액 환산 결과를 `inhHouseValLandPricePerSqmAtInheritance` 필드에 **총액(total)으로 저장**하던 이중 곱셈 버그를 막기 위해, 콜백 결과를 **로컬 state(`pre1990LandTotal`)**로만 보관하고 store에는 쓰지 않도록 변경했음.

이로 인해 새 회귀가 발생: `HouseValuationSection`의 환산 가격(§164⑤) 미리보기에서 "취득시 토지기준시가"가 0원으로 표시됨 (이미지 #11). 결과 산식: `341,000,000 × (0 + 38,135,580) ÷ ... = 39,408,915` (정상은 `(110,246,831 + 38,135,580)`을 기대).

**근본 원인**: 로컬 state `pre1990LandTotal`은 컴포넌트 마운트별 라이프사이클로 한정되어 있어서 단계 이동·페이지 새로고침 시 null로 초기화됨. `Pre1990LandValuationInput` 내부 `useEffect`가 콜백을 fire하기 위해서는 모든 의존성(`form.pre1990Enabled`, `acquisitionDate`, `transferDate`, `area`, `price1990`, 3개 등급의 previews)이 truthy여야 하는데, 사용자 시나리오에 따라 이 useEffect가 늦게 fire되거나 fire되지 않을 수 있음. 결과적으로 미리보기 첫 렌더에서 `pre1990LandTotal === null` → `landStdA = 0`.

엔진(API) 흐름은 별개로 정상: 클라이언트가 `inheritedHouseValuation.pre1990` 등급 데이터를 보내면 엔진이 자체적으로 `calculatePre1990LandValuation`을 실행해 정확한 per-sqm을 계산. 따라서 **결과 화면의 환산취득가는 정상**이지만, **미리보기만** 0원으로 보임.

---

## 핵심 파일·라인

| 파일 | 라인 | 역할 |
|---|---|---|
| `components/calc/transfer/inheritance/HouseValuationSection.tsx` | 170-175 | `pre1990LandTotal` 로컬 state + `handlePre1990Calculated` 콜백 |
| `components/calc/transfer/inheritance/HouseValuationSection.tsx` | 358-403 | 환산 가격 미리보기 — `landStdA` 계산 분기 |
| `components/calc/inputs/Pre1990LandValuationInput.tsx` | 90-124 | useEffect로 `calculatePre1990LandValuation` 자동 실행 후 `onCalculatedPrice(result.standardPriceAtAcquisition)` 호출. 반환값은 **total(원, =per-sqm × area)** |
| `lib/tax-engine/pre-1990-land-valuation.ts` | 128-130, 262-267 | `pricePerSqmAtAcquisition` (per-sqm) + `standardPriceAtAcquisition` (total) 둘 다 반환 |

---

## 수정 방안 — store에 per-sqm으로 저장 (이중 곱셈 방지 + 영구 보관)

`handlePre1990Calculated`가 받은 `total`을 `area`로 나눠 **per-sqm**으로 변환하여 `inhHouseValLandPricePerSqmAtInheritance` store 필드에 저장. 이렇게 하면:
- store는 영구 보관소가 되어 마운트 라이프사이클과 무관
- UI 미리보기: `parseAmount(perSqm) × area` = total → 정상 표시
- 엔진(API): 동일 per-sqm을 `landPricePerSqmAtInheritance`로 전달 → 엔진이 area를 곱해 total → 정상
- 이중 곱셈 없음: 저장 단위가 per-sqm이므로 곱셈은 한 번만

### `HouseValuationSection.tsx` 수정

**(1) `handlePre1990Calculated`** — total → per-sqm 변환 후 store에 저장
```typescript
function handlePre1990Calculated(price: number) {
  const area = parseFloat(asset.inhHouseValLandArea) || 0;
  if (area <= 0) return;
  const perSqm = Math.floor(price / area);
  // store에 per-sqm 저장: UI/엔진 모두 area 곱셈 시 정상 total로 환산
  if (String(perSqm) !== asset.inhHouseValLandPricePerSqmAtInheritance) {
    onChange({ inhHouseValLandPricePerSqmAtInheritance: String(perSqm) });
  }
  setPre1990LandTotal(price);  // 즉시 미리보기용 (선택적)
}
```

**(2) 미리보기 `landStdA` 계산 분기 통합** — 1990이전·이후 동일 흐름
```typescript
// 1990이전·이후 모두 store의 per-sqm × area로 계산 (per-sqm이 정의된 단위)
const landPricePerSqmAtInheritance = parseAmount(asset.inhHouseValLandPricePerSqmAtInheritance);
const landStdA = Math.floor(landPricePerSqmAtInheritance * area);
```

`pre1990LandTotal` 로컬 state는 즉시 반영용으로 유지하되 fallback 경로로만 사용:
```typescript
const landStdA = (() => {
  const fromStore = Math.floor(parseAmount(asset.inhHouseValLandPricePerSqmAtInheritance) * area);
  if (fromStore > 0) return fromStore;
  return isBefore1990 ? (pre1990LandTotal ?? 0) : 0;
})();
```

(또는 `pre1990LandTotal`을 완전히 제거하고 store 단일 소스로 통일해도 됨 — 더 깔끔. 권장.)

**(3) 계산식 표시 분기 갱신** — 1990이전 경로의 라벨 유지
```typescript
const landStdAFormula = isBefore1990
  ? `취득시 토지기준시가 = 등급가액 환산 ${landStdA.toLocaleString()}원`
  : `취득시 토지기준시가 = 공시지가(${landPricePerSqmAtInheritance.toLocaleString()}원/㎡) × ${area}㎡ = ${landStdA.toLocaleString()}원`;
```

---

## 변경 불필요한 파일

- `Pre1990LandValuationInput.tsx` — 콜백 인자(total) 그대로 사용
- `lib/calc/transfer-tax-api.ts` — store의 `inhHouseValLandPricePerSqmAtInheritance`는 per-sqm이 됨. API에서 `landPriceAtInheritance = parseAmount(...)`은 그대로 per-sqm으로 엔진에 전달 (이중 곱셈 없음)
- `inheritance-house-valuation.ts` — `landPricePerSqmAtInheritance` 받아 area 곱하는 정상 흐름 유지
- 엔진의 1990이전 등급가액 환산은 클라이언트가 동시에 `pre1990` 페이로드도 보내고 있어서, 엔진의 `resolveLandPriceAtInheritance`에서 `landPricePerSqmAtInheritance !== undefined` → override 경로로 per-sqm을 직접 사용. 이전 픽스처 회귀 없음.

---

## 검증

### 1. 자동 회귀
```bash
npx vitest run __tests__/tax-engine/inheritance-house-valuation.test.ts
npx vitest run __tests__/tax-engine
```
기존 1,474개 모두 통과 유지.

### 2. UI 시나리오 (이미지 #11 재현)
- 양도가 920,000,000 / 상속개시일 1983-07-26 / 자산구분 개별주택가격 / 양도일 2023-02-19
- HouseValuationSection 토지면적 184.2㎡ + 3시점 공시지가 + 1990 등급(218/205/200, 1,100,000원/㎡) 입력
- 기대값:
  - 환산 가격 미리보기 산식: `341,000,000 × (110,246,831 + 38,135,580) ÷ (287,352,000 + 42,630,000)` = 153,336,855원
  - "취득시 토지기준시가 = 등급가액 환산 110,246,831원" 표시
- 페이지 새로고침 후에도 미리보기 정확히 표시됨 (store 기반이므로 영구 유지)

### 3. 엔진 측 정합성
- 결과 화면의 환산취득가 = 109,611,427원 (Excel C9), 개산공제 = 4,600,105원 (Excel C10) — 이미 검증 완료된 anchor와 동일
