# 검용주택 — 보유 중 일부 용도변경 (House⇄Commercial) 기능 구현

## Context

**왜 필요한가**: 양도 시점에는 검용주택(주택+상가 혼재)이지만 **취득 시점에는 전체가 단독주택(또는 전체가 상가)**이었던 사례를 처리하지 못함. 예제 PDF(갑氏 사례, 2026-04-30 수령): 1985.1.1 의제취득한 단독주택을 2011.8.5에 일부면적(80.23㎡)을 근린생활시설로 용도변경 → 2023.2.16에 13억원 양도. 양도세 계산 시 양도가액 안분(양도시 비율)과 취득가액 안분(취득시 전체 주택 → 양도시 면적비율)이 달라 시행령 §166⑥의 "양도가액 비율 ≠ 취득가액 비율" 분기를 명시적으로 사용해야 함.

**기존 자산을 그대로 쓸 수 없는 이유**: 기존 검용주택 입력은 "취득시 상가건물 기준시가"·"취득시 상가공시지가"를 모두 받지만, 용도변경 케이스에서는 그 값들이 **취득시점에 존재하지 않음**(0원). 단순히 0을 넣으면 환산취득가가 어긋남 — 취득시 상가부분 환산취득가는 양도시 면적비율로 주택공시가격을 안분해 산정해야 함.

**의도된 결과**: "보유 중 일부 용도변경" 토글로 양/음방향 케이스 모두 정확히 계산 + 기존 검용주택(취득·양도 모두 검용) 동작 100% 보존(additive 변경).

---

## 핵심 설계 원칙

1. **엔진 신설 금지**. `transfer-tax-mixed-use-helpers.ts`(581줄, 시행령 §166⑥ 분기 이미 보유)에 분기만 추가.
2. **Backward compat**: `hasPartialUsageChange === false`이면 기존 코드 경로 그대로 (additive only).
3. **양방향 enum**: `partialChangeDirection: "house_to_commercial" | "commercial_to_house"` — 향후 enum 확장 가능 구조.
4. **취득시 면적 자동 + 수정 가능**: 양도시 (주택+상가) 합계로 자동, 사용자가 수정 가능한 `DecimalInput` 노출.
5. **UI 순서 = 엔진 변수 사용 순서** + ToggleCard tone amber(취득·분리계산) 통일.

---

## A. 데이터 모델

**파일**: `lib/stores/calc-wizard-asset.ts` (L487~514 검용주택 블록 말미)

```typescript
hasPartialUsageChange: boolean;
partialChangeDirection: "" | "house_to_commercial" | "commercial_to_house";
partialChangeAcqResidentialArea: string;   // 자동 도출, 사용자 수정 가능
partialChangeAcqCommercialArea: string;
partialChangeDate: string;                 // (선택) 용도변경일 메모용
```

- `makeDefaultAsset` (L687~) 디폴트: `false` / `""` / `""` / `""` / `""`.
- `lib/stores/calc-wizard-migration.ts` `migrateLegacyForm`에서 `?? false` / `?? ""` 가드 추가 — 기존 sessionStorage 폼은 토글 OFF 유지.

**파일**: `lib/tax-engine/types/transfer-mixed-use.types.ts` (L75 직전)

```typescript
partialUsageChange?: {
  direction: "house_to_commercial" | "commercial_to_house";
  acqResidentialArea?: number;   // 미주입 시 양도시 합계로 자동 도출
  acqCommercialArea?: number;
};
```

`MixedUseGainBreakdown`에 `partialUsageChange?: { direction, autoAcqRes, autoAcqComm }` 메타 추가(결과 카드 표시용).

---

## B. 엔진 변경 (`lib/tax-engine/transfer-tax-mixed-use-helpers.ts`)

### B1. 신규 헬퍼 `computeAcqDerivedAreas` (L54 이후)

```typescript
export function computeAcqDerivedAreas(
  asset: MixedUseAssetInput,
  transferDerived: MixedUseDerivedAreas,
): MixedUseDerivedAreas {
  if (!asset.partialUsageChange) return transferDerived;
  // direction별 취득시 면적 산출 — house_to_commercial이면 전체가 주택,
  // commercial_to_house면 전체가 상가. 부수토지·정착면적도 동일 비율로.
}
```

### B2. `calcCommercialGainSplit` (L285~356) 분기 삽입 — **이슈 2 반영**

L292~295의 `acqLandStd` / `acqBuildingStd` 산정 부분에:
```typescript
if (asset.partialUsageChange?.direction === "house_to_commercial") {
  // 취득시 상가가 없었음 → 취득시 개별주택공시가격을 면적비율로 안분 (집행기준 99-164-10)
  const housingTotal = asset.acquisitionStandardPrice.housingPrice ?? 0;
  const totalFloor = asset.residentialFloorArea + asset.nonResidentialFloorArea;
  const commRatio = totalFloor > 0 ? asset.nonResidentialFloorArea / totalFloor : 0;
  const acqCommercialTotal = Math.floor(housingTotal * commRatio);

  // 토지/건물 내부 분리 — 취득시점에 상가 분리값이 없으므로 양도시 비율 차용
  // (acqLandStd=0 두면 acqLandRatio=0이 되어 토지 환산취득가가 0이 되는 버그 방지)
  const transferLandRatio = transferTotalStd > 0 ? transferLandStd / transferTotalStd : 0.5;
  acqLandStd = Math.floor(acqCommercialTotal * transferLandRatio);
  acqBuildingStd = acqCommercialTotal - acqLandStd;
} else { /* 기존 L292~295 */ }
```

**산식 근거 (집행기준 99-164-10)**:
- 환산취득가 = 양도가액(상가) × (취득시 상가 기준시가 / 양도시 상가 기준시가) — §97 그대로
- 취득시 상가 기준시가 = **취득시 개별주택공시가격 × (양도시 상가연면적 / 합계연면적)** ← 면적비율 안분
- 양도시 상가 기준시가 = 양도시 (상가건물 기준시가 + 공시지가 × 상가부수토지면적)
- 토지/건물 내부 분리 = 양도시 비율 fallback (취득시 분리값 없음)

### B3. `calcHousingGainSplit` (L168~264) 미러 분기 — **이슈 2 동일 반영**

L209~213 부근에 `direction === "commercial_to_house"` 분기 추가:
```typescript
if (asset.partialUsageChange?.direction === "commercial_to_house") {
  // 취득시 주택이 없었음 → 취득시 상가 기준시가를 면적비율로 안분
  const acqCommBuilding = asset.acquisitionStandardPrice.commercialBuildingPrice;
  const acqLandPerSqm = asset.acquisitionStandardPrice.landPricePerSqm;
  const acqCommTotal = acqCommBuilding + Math.floor(acqLandPerSqm * asset.totalLandArea);
  const totalFloor = asset.residentialFloorArea + asset.nonResidentialFloorArea;
  const housRatio = totalFloor > 0 ? asset.residentialFloorArea / totalFloor : 0;
  const acqHousingTotal = Math.floor(acqCommTotal * housRatio);

  // 토지/건물 내부 분리 — 양도시 토지/건물 비율 차용
  const transferLandRatio = transferTotal > 0 ? transferLandStd / transferTotal : 0.5;
  acqLandStd = Math.floor(acqHousingTotal * transferLandRatio);
  acqBuildingStd = acqHousingTotal - acqLandStd;
}
```

### B4. 오케스트레이터 (`transfer-tax-mixed-use.ts` L70~76)

`computeDerivedAreas` 호출 직후 `computeAcqDerivedAreas` 추가 산출 → 두 split 헬퍼에 `acqDerived` 옵셔널 인자로 전달. 시그니처는 backward compat 위해 마지막 인자에 옵셔널 추가.

### B5. `apportionTransferPrice` (L62~97) — 변경 없음

양도시 비율은 변동 없음. 양도가액 안분 산식 그대로 유지.

---

## C. UI

### C1. 토글 행 그리드화 (`components/calc/transfer/MixedUseSection.tsx` L33~52)

`<div className="mt-4 border-t pt-4 grid grid-cols-1 sm:grid-cols-2 gap-2">`로 변경. 우측에 새 ToggleCard:

```tsx
<ToggleCard tone="amber" title="보유 중 일부 용도변경"
  description="취득시 자산 구성이 양도시와 다른 경우 (시행령 §166⑥ + 집행기준 99-164-10)"
  checked={!!asset.hasPartialUsageChange}
  disabled={!asset.isMixedUseHouse}
  disabledReason="검용주택 분리계산 활성화 시 사용 가능"
  onCheckedChange={(c) => onChange({ hasPartialUsageChange: c,
    ...(c && !asset.partialChangeDirection ? { partialChangeDirection: "house_to_commercial" } : {}) })}
/>
```

### C2. 신규 컴포넌트 `components/calc/transfer/mixed-use/PartialUsageChangeInputs.tsx` — **이슈 7 반영**

- amber 카드 + 섹션 번호 패턴(`bg-amber-50/40 border-amber-200`).
- **방향 Select** (Recommended): `Select` 컴포넌트로 "취득시 자산 구성" → 옵션 라벨(양도시점과 혼동 방지):
  - `house_to_commercial` → **"취득시 전체 주택"** (양도시 검용 = 일부 상가화)
  - `commercial_to_house` → **"취득시 전체 상가"** (양도시 검용 = 일부 주택화)
  - 명시적 한국어 라벨(SelectValue 단독 사용 금지 — `feedback_select_component.md`).
- **자동 도출 표시 박스**: 양도시 합계 → 자동 면적값 표시.
- **"수정하기" ToggleCard** (variant="chip", tone="amber", size="sm") → ON 시 두 `DecimalInput` (`partialChangeAcqResidentialArea`, `partialChangeAcqCommercialArea`) 노출.
- **이슈 4 반영 — 면적 자동값 안내**: amber 박스에 *"증축·일부 멸실 등으로 취득시 면적이 양도시 합계와 다른 경우 직접 수정하세요"* 항상 노출.
- (선택) `DateInput` 용도변경일 — 메모용.

### C3. `MixedUseStandardPriceInputs.tsx` (L122~204 취득시 카드) 조건 분기 — **이슈 5 반영**

- `direction === "house_to_commercial"` → L170~188 (취득시 상가건물 기준시가, 취득시 공시지가) hidden + 안내 박스 "취득시점에 상가가 존재하지 않음 — 자동 안분 처리" 표시.
- `direction === "commercial_to_house"` → L160~167 (취득시 개별주택공시가격) hidden. **PHD 토글은 hidden/disabled하지 않음** — 사용자 직전 상태 보존(예: PDF 갑氏는 1985년 의제취득=1996년 개별주택가격 고시 이전이므로 PHD가 필수일 수 있음). 대신 amber 경고 박스 "취득시 상가 자산에 PHD 적용 시 효과 검토 필요"만 표시.
- 자동 산정된 환산 단가를 amber/100 박스에 미리보기.

### C4. `MixedUseAreaInputs.tsx` 취득시 면적 표시

`hasPartialUsageChange === true`일 때만 양도시 면적 카드 하단에 sub-block "취득시 면적" 자동값 표시. 사용자 수정값(B필드)이 있으면 우선.

### C5. `MixedUseExpandedPanel` (L70~125) 마운트

`MixedUseAreaInputs` 직후 (L94 다음 줄)에:
```tsx
{asset.hasPartialUsageChange && (
  <PartialUsageChangeInputs asset={asset} onChange={onChange} sectionNum="1-A" />
)}
```
나머지 섹션 ②~⑤ 그대로 — 충돌 방지 위해 신규 섹션은 `1-A`로 표기.

---

## D. API · 검증

### D1. API 매핑 (`lib/calc/transfer-tax-api.ts` L237~289) — **이슈 8 반영**

`mixedUsePayload`에 추가:
```typescript
// 명시적 throw — silent skip 금지 (토글 ON & direction "" 상태로 제출 시 일반 검용주택으로
// 잘못 계산되는 것 방지)
if (primary.hasPartialUsageChange && !primary.partialChangeDirection) {
  throw new Error("보유 중 일부 용도변경: 취득시 자산 구성을 선택하세요.");
}

partialUsageChange: primary.hasPartialUsageChange && primary.partialChangeDirection
  ? { direction: primary.partialChangeDirection,
      acqResidentialArea: parseFloat(primary.partialChangeAcqResidentialArea) || undefined,
      acqCommercialArea: parseFloat(primary.partialChangeAcqCommercialArea) || undefined }
  : undefined,
```

### D2. Zod 스키마

`app/api/calc/transfer/route.ts` 또는 `lib/api/transfer-tax-schema-sub.ts`의 `mixedUseSchema`에:
```typescript
partialUsageChange: z.object({
  direction: z.enum(["house_to_commercial", "commercial_to_house"]),
  acqResidentialArea: z.number().nonnegative().optional(),
  acqCommercialArea: z.number().nonnegative().optional(),
}).optional(),
```

### D3. 검증 (`lib/calc/transfer-tax-validate.ts` L63~87) — **이슈 5 반영**

검용주택 분기 안에:
- `hasPartialUsageChange && !partialChangeDirection` → "취득시 자산 구성을 선택하세요."
- 사용자 수정 면적 음수·NaN 검증.
- **PHD 강제 변경 금지** — `direction === "commercial_to_house"` & `usePreHousingDisclosure === true` 시 경고만 추가, false로 변경하지 않음 (사용자 직전 상태 보존).

---

## E. 결과 카드 (`components/calc/results/mixed-use/MixedUseResultCard.tsx`) — **이슈 9 반영**

- `breakdown.partialUsageChange` 존재 시 첫 step 위에 **"취득시점 자산 구성"** 카드 추가 — direction 라벨 + 자동/수정 면적 비교표.
- `commercialPart` / `housingPart` 산식 캡션에 "취득시점 개별주택공시가격을 양도시 면적비율로 안분 (집행기준 99-164-10)" 추가.
- `MixedUseCalculationRoute`에 `partialUsageChangeReason: string` 필드 추가 — **사전 정의 템플릿** 사용:
  ```typescript
  const PARTIAL_USAGE_CHANGE_REASONS = {
    house_to_commercial:
      "양도시점에는 검용주택이나 취득시점에는 전체 주택이었으므로 시행령 §166⑥ 및 양도소득세 집행기준 99-164-10에 따라 환산취득가 산정 시 취득시 개별주택공시가격을 양도시 면적비율로 안분",
    commercial_to_house:
      "양도시점에는 검용주택이나 취득시점에는 전체 상가였으므로 시행령 §166⑥에 따라 환산취득가 산정 시 취득시 상가 기준시가(건물+토지)를 양도시 면적비율로 안분 — 직접 사례 제한적, 보수 검토 필요",
  } as const;
  ```
- `direction === "commercial_to_house"` 시 결과 카드 상단에 **"법령 적용에 보수 검토 필요"** 노란색 배지 표시 — PDF 직접 사례 부재 안내.

---

## F. 결정 메모

- **취득시 환산취득가 안분 산식 결정**: PDF "개별주택가격을 기준으로 안분" → 취득시점에 상가가 존재하지 않으므로 **양도시 면적비율 = 양도시 개별주택공시가격에 면적비율을 곱한 값**을 안분 단가로 사용. 시행령 §166⑥의 "양도가액 안분비율 ≠ 취득가액 안분비율" 원칙을 그대로 적용 — 양도시는 양도시 기준시가 비율, 취득시는 면적 비율 fallback.
- **1985 의제취득과의 결합**: `calculateEstimatedAcquisitionPrice` (§97 환산)는 acquisitionDate를 기준으로만 동작 → 의제취득일 1985-01-01 정규화는 호출부에서 이미 처리. **추가 작업 불필요**.
- **PHD 호환성**: `direction === "commercial_to_house"`에서는 의미 없음 → API 빌더에서 강제 `false`, UI 토글 비활성. `direction === "house_to_commercial"`에서는 PHD 사용 가능.
- **역사적 토지등급가액**: 1985년 의제취득의 1990 환산 로직(`pre-1990-land-valuation.ts`)은 토지 자산(`assetKind === "land"`) 전용. 검용주택은 housing이므로 별도 적용 안 됨 — 단, 환산취득가 산정의 취득시 기준시가는 사용자가 직접 입력(=PDF 예제처럼 토지등급가액 + 건물 환산 기준).

---

## G. 테스트

**파일**: `__tests__/tax-engine/transfer-tax/mixed-use-partial-usage-change.test.ts` (신규)

- **케이스 1 (PDF 갑氏)**: 1985.1.1 의제취득, 2023.2.16 양도가액 1,300,000,000원, 양도시 주택 63.5/37.79㎡ + 상가 134.8/80.23㎡ — 양도세·지방세·총납부세액 원단위 anchor (`toBe()`).
- **케이스 2 (역방향)**: `commercial_to_house` 미러 케이스.
- **경계**: `acqResidentialArea`만 입력 / 둘 다 입력 / 둘 다 미입력(자동) / 토글 ON & direction 미선택 → API 검증 실패.
- **회귀**: 기존 `mixed-use-house.test.ts` 전 케이스 그린 (토글 OFF backward compat).
- **픽스처**: `__tests__/tax-engine/_helpers/mixed-use-fixture.ts`에 `partialUsageChangeFixture` factory 추가.

---

## Critical Files

| 영역 | 파일 |
|---|---|
| 타입 | `lib/tax-engine/types/transfer-mixed-use.types.ts` |
| 엔진 | `lib/tax-engine/transfer-tax-mixed-use-helpers.ts` (L168~264, L285~356) |
| 오케스트레이터 | `lib/tax-engine/transfer-tax-mixed-use.ts` (L70~76) |
| 스토어 | `lib/stores/calc-wizard-asset.ts` (L487~514, L687, L784) |
| 마이그레이션 | `lib/stores/calc-wizard-migration.ts` |
| API | `lib/calc/transfer-tax-api.ts` (L236~289) |
| Zod | `app/api/calc/transfer/route.ts` (L582 부근) |
| 검증 | `lib/calc/transfer-tax-validate.ts` (L63) |
| UI 토글 | `components/calc/transfer/MixedUseSection.tsx` (L33~52) |
| UI 신규 | `components/calc/transfer/mixed-use/PartialUsageChangeInputs.tsx` (신규) |
| UI 면적 | `components/calc/transfer/mixed-use/MixedUseAreaInputs.tsx` |
| UI 기준시가 | `components/calc/transfer/mixed-use/MixedUseStandardPriceInputs.tsx` (L122~204) |
| 결과 카드 | `components/calc/results/mixed-use/MixedUseResultCard.tsx` |

---

## H. 단계별 작업 순서 (검증 가능한 마일스톤)

1. **타입·스토어** — `types/transfer-mixed-use.types.ts` + `calc-wizard-asset.ts` + `calc-wizard-migration.ts`. **검증**: `npm run build` 컴파일 그린.
2. **엔진** — `computeAcqDerivedAreas` 신설 → `calcCommercialGainSplit` / `calcHousingGainSplit` 분기 → 오케스트레이터 배선. **검증**: `npx vitest run __tests__/tax-engine/transfer-tax/mixed-use-partial-usage-change.test.ts` (PDF 갑氏 케이스 anchor 통과).
3. **API · Zod · 검증** — 3파일 동시 패치. **검증**: 라우트 e2e (vitest API mock).
4. **UI** — 토글 그리드화 → `PartialUsageChangeInputs.tsx` 신설 → `MixedUseStandardPriceInputs` 조건 hidden → `MixedUseAreaInputs` 자동 면적 → `MixedUseExpandedPanel` 마운트. **검증**: `npm run dev`로 브라우저에서 PDF 갑氏 입력 → 결과 화면에서 양도세 일치 확인.
5. **결과 카드** — `MixedUseResultCard` 산식 라벨 + 신규 "취득시점 자산 구성" 섹션. **검증**: 결과 화면 시각 확인.
6. **회귀** — `npm test` 전체 (기존 mixed-use-house.test.ts 포함 1,714+ tests 그린).

---

## Verification (E2E)

- **PDF 갑氏 케이스**: 마법사에서 검용주택 ON → 보유 중 일부 용도변경 ON → 방향 "전체 주택" → 면적·기준시가·취득가 입력 → 결과의 총 납부세액이 PDF 명시값과 원단위 일치.
- **역방향 케이스**: direction을 "전체 상가"로 토글 → 동일 입력 mirror → 결과의 합산 양도소득금액이 대칭되는지 확인.
- **회귀**: 기존 검용주택 시나리오 (사례14 등) 토글 OFF로 동일 결과 산출.
- **법령 근거 확인**: 결과 카드의 "취득시점 자산 구성" 섹션에 시행령 §166⑥ + 양도소득세 집행기준 99-164-10 표기 확인.
