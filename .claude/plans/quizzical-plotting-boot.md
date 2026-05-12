# `house_to_commercial` 취득시 상가 기준시가 — 입력+자동계산 하이브리드 전환

## Context

겸용주택 `partialUsageChange.direction === "house_to_commercial"` (취득시 전체 주택 → 양도시 일부 상가화) 케이스에서 현재는 **취득시 상가부분 기준시가를 엔진이 자동 안분**한다.

**현재 로직** (`transfer-tax-mixed-use-helpers.ts:433-468`):
- 취득시 개별주택공시가격(`mixedAcqHousingPrice` 또는 PHD 역산값)을 양도시 면적비율(`commRatio = 상가/(주택+상가)`)로 자동 안분
- 토지/건물 내부 분리도 양도시 비율로 fallback
- UI에서는 `취득시 상가건물 기준시가` + `취득시 개별공시지가` 입력 필드 hidden (`MixedUseStandardPriceInputs.tsx:177`)

**문제점**:
- 취득 당시 전체 주택이었더라도, **그 건물 자체의 국세청 고시 기준시가는 존재**하므로 양도시 면적비율 단순 안분보다 **취득시 동일 건물 기준시가 기반의 직접 입력**이 정확
- 토지분은 `취득시 개별공시지가 × 상가부수토지 면적` 으로 산출 가능 — 자동 안분이 불필요
- 결과 화면 산식에서 사용된 `취득시 상가부분 기준시가` 의 출처가 사용자에게 불투명

**개선 목표**:
1. UI: `house_to_commercial` 에서도 `취득시 상가건물 기준시가` + `취득시 개별공시지가` 입력 노출
2. 엔진: 입력값으로 직접 계산 (`acqLandStd = pricePerSqm × commercialLandArea`, `acqBuildingStd = commercialBuildingPrice`)
3. 자동 안분 로직은 **사용자 미입력 시 fallback**으로 유지 (backward compat — PDF 갑氏 테스트 anchor 보존)
4. 안내 문구·결과 카드 산출 근거 텍스트 갱신

법령 근거: 시행령 §166⑥ + 집행기준 99-164-10 — 명시적 입력값이 있으면 그것이 더 정확한 산정 근거.

---

## 변경 범위 — UI 통합 7개 동기화 지점

### ① 폼 상태 타입 — **변경 없음**
`mixedAcqCommercialBuildingPrice` / `mixedAcqLandPricePerSqm` 이미 `AssetForm` (`lib/stores/calc-wizard-asset.ts:518-537`)에 존재.

### ② initial value — **변경 없음**
`MIXED_USE_DEFAULTS` (`calc-wizard-asset-mixed-use.ts:31-51`) 이미 `""` 초기화.

### ③ normalize fallback — **변경 없음**
`migrateMixedUseFields` 이미 처리.

### ④ API 변환 — **변경 없음**
`transfer-tax-api.ts:257-261` 이미 `commercialBuildingPrice` / `landPricePerSqm` 전달.

### ⑤ UI 입력 위젯 — **핵심 변경**

**파일**: `components/calc/transfer/mixed-use/MixedUseStandardPriceInputs.tsx`

**변경 1** (라인 176~199): `house_to_commercial` 시 hidden 조건 제거

```tsx
// 변경 전
{asset.partialChangeDirection !== "house_to_commercial" && (
  <>
    <FieldCard label="취득시 상가건물 기준시가">...</FieldCard>
    <LandPriceLookupField .../>
  </>
)}

// 변경 후
<>
  <FieldCard
    label="취득시 상가건물 기준시가"
    hint={
      asset.partialChangeDirection === "house_to_commercial"
        ? "취득시 동일 건물의 국세청 기준시가 × (양도시 상가연면적 ÷ 전체연면적)"
        : "토지 제외 — 국세청 홈택스 > 기준시가 조회"
    }
  >
    <CurrencyInput
      value={asset.mixedAcqCommercialBuildingPrice}
      onChange={(v) => onChange({ mixedAcqCommercialBuildingPrice: v })}
      placeholder={
        asset.partialChangeDirection === "house_to_commercial"
          ? "비워두면 개별주택공시가격 면적비율로 자동 안분"
          : "취득시 상가건물 기준시가"
      }
    />
  </FieldCard>
  <LandPriceLookupField
    pricePerSqm={asset.mixedAcqLandPricePerSqm}
    onPricePerSqmChange={(v) => onChange({ mixedAcqLandPricePerSqm: v })}
    area={commercialLandArea > 0 ? commercialLandArea : undefined}
    referenceDate={acqReferenceDate}
    jibun={jibun}
    label="취득시 개별공시지가(상가)(원/㎡)"
    hint="상가부수토지 기준시가 자동 계산용"
    placeholder="취득시 개별공시지가 /㎡"
  />
</>
```

**변경 2** (라인 202~206): `house_to_commercial` 안내 박스 문구 갱신

```tsx
// 변경 전: "ℹ 취득시점에 상가가 존재하지 않음 — 상가건물 기준시가·공시지가 입력 불필요. 엔진이 취득시 개별주택공시가격을 양도시 면적비율로 자동 안분합니다 (집행기준 99-164-10)."

// 변경 후
ℹ 취득시점에는 전체가 주택이었으므로 상가 부분 기준시가가 직접 존재하지 않음.
   취득 당시 동일 건물의 국세청 고시 기준시가에서 양도시 상가연면적 비율로 안분한 값을 입력하세요.
   미입력 시 엔진이 취득시 개별주택공시가격을 양도시 면적비율로 자동 안분합니다 (집행기준 99-164-10 fallback).
```

**변경 3** (라인 213~226): 자동 계산 박스가 `house_to_commercial` 에서도 표시되도록 조건 그대로 유지 (이미 `acqCommercialLandStd > 0 || acqCommercialBuilding > 0` 만으로 제어).

### ⑥ 사이드바 합계 — **변경 없음**

### ⑦ 결과 카드 — **소폭 변경**

**파일**: `components/calc/results/mixed-use/MixedUseResultCard.tsx` (라인 440~489 partial usage change 카드)

`house_to_commercial` 분기 설명 텍스트 갱신 — 입력값 사용 시 vs fallback 시 분기:

```tsx
// 사용자 입력값을 사용한 경우
"§166⑥: 사용자가 입력한 취득시 상가건물 기준시가와 개별공시지가로 직접 산정"
// fallback 경로 (입력값 0 또는 미주입)
"§166⑥ + 집행기준 99-164-10: 취득시 개별주택공시가격을 양도시 면적비율로 자동 안분 (사용자가 직접 입력 미제공)"
```

판단 근거를 결과 step의 산식 문자열에 노출 (`commercialPart.acqStandardSource: "user_input" | "fallback_apportion"`).

### 엔진 — **핵심 변경**

**파일**: `lib/tax-engine/transfer-tax-mixed-use-helpers.ts` (라인 412~474)

**변경 후 분기 로직**:

```typescript
if (asset.partialUsageChange?.direction === "house_to_commercial") {
  // 1순위: 사용자가 취득시 상가 기준시가를 직접 입력했는가?
  const userBuildingStd = asset.acquisitionStandardPrice.commercialBuildingPrice;
  const userLandPerSqm = asset.acquisitionStandardPrice.landPricePerSqm;
  const userLandStd = userLandPerSqm * effectiveAcqDerived.commercialLandArea;
  const hasUserInput = userBuildingStd > 0 && userLandPerSqm > 0;

  if (hasUserInput) {
    // 직접 입력 경로 — 일반 겸용주택 분기와 동일
    acqLandStd = userLandStd;
    acqBuildingStd = userBuildingStd;
  } else {
    // 기존 자동 안분 fallback (집행기준 99-164-10)
    const housingTotal =
      asset.usePreHousingDisclosure && housingAcqResult?.phdAcqHousingPrice
        ? housingAcqResult.phdAcqHousingPrice
        : (asset.acquisitionStandardPrice.housingPrice ?? 0);

    if (housingTotal === 0) {
      throw new Error(
        "용도변경(주택→상가): 취득시 상가 기준시가 또는 개별주택공시가격 중 하나는 입력해야 합니다. " +
          "직접 입력하거나 PHD 토글을 활성화하세요.",
      );
    }
    const totalFloor = asset.residentialFloorArea + asset.nonResidentialFloorArea;
    const commRatio = totalFloor > 0 ? asset.nonResidentialFloorArea / totalFloor : 0;
    const acqCommercialTotal = Math.floor(housingTotal * commRatio);
    const transferLandRatioForFallback =
      transferTotalStd > 0 ? transferLandStd / transferTotalStd : 0.5;
    acqLandStd = Math.floor(acqCommercialTotal * transferLandRatioForFallback);
    acqBuildingStd = acqCommercialTotal - acqLandStd;
  }
} else {
  // 일반 겸용주택 + commercial_to_house — 기존 그대로
  acqLandStd = asset.acquisitionStandardPrice.landPricePerSqm * effectiveAcqDerived.commercialLandArea;
  acqBuildingStd = asset.acquisitionStandardPrice.commercialBuildingPrice;
}
```

**산출 근거 추적**: `CommercialGainSplit` 결과 객체에 `acqStandardSource: "user_input" | "fallback_apportion" | "general"` 필드 추가 (`types/transfer-mixed-use.types.ts`). 결과 카드와 step 산식 문자열 분기에 사용.

### 테스트

**파일**: `__tests__/tax-engine/transfer-tax/mixed-use-partial-usage-change.test.ts`

**SC-1 (PDF 갑氏)** — anchor 보존:
- 기존 fixture는 `mixedAcqCommercialBuildingPrice` / `mixedAcqLandPricePerSqm` 미입력 상태 → fallback 경로 진입 → 기존 anchor (`commercialEstimatedAcq: 70_823_852` 등) 그대로 통과.

**신규 테스트 (SC-1B)** 추가 — 직접 입력 경로:
- SC-1과 동일 입력 + `acquisitionStandardPrice.commercialBuildingPrice = X`, `landPricePerSqm = Y` 명시
- X, Y 는 fallback 안분 결과(`acqLandStd`, `acqBuildingStd`)를 역산해 동일한 `acqTotalStd` 가 되도록 설정 → anchor 동등성 검증
- 별도 케이스: X, Y 가 fallback 결과와 다른 값일 때 환산취득가가 다르게 산출되는지 검증

**테스트 추가**: 직접 입력 + PHD 토글 ON 조합에서 PHD가 주택부분만 영향, 상가는 입력값 사용되는지 검증.

---

## Files to Modify

1. `components/calc/transfer/mixed-use/MixedUseStandardPriceInputs.tsx` — 입력 필드 노출 + 안내 문구
2. `lib/tax-engine/transfer-tax-mixed-use-helpers.ts` — `calcCommercialGainSplit` 분기 재구성
3. `lib/tax-engine/types/transfer-mixed-use.types.ts` — `CommercialGainSplit` 에 `acqStandardSource` 필드 추가 (선택, 결과 카드에서 분기 표시용)
4. `lib/tax-engine/transfer-tax-mixed-use.ts` — step 산식 문자열에 산출 근거 분기 (선택)
5. `components/calc/results/mixed-use/MixedUseResultCard.tsx` — partial usage change 카드 분기 텍스트 (선택)
6. `__tests__/tax-engine/transfer-tax/mixed-use-partial-usage-change.test.ts` — SC-1B 신규 케이스 추가

## Reused Functions / Patterns

- `LandPriceLookupField` (`components/calc/inputs/LandPriceLookupField.tsx`) — 취득일 reference + 면적 자동 곱셈 — 이미 `commercial_to_house` / 일반 케이스에서 동일하게 사용
- `calculateEstimatedAcquisitionPrice` (`lib/tax-engine/tax-utils.ts`) — §97 환산 공식 변경 없이 재사용
- `effectiveAcqDerived.commercialLandArea` — 이미 `acqDerived` 로 분리 계산 (자산-수준 `partialChangeAcqResidentialArea/CommercialArea` 입력 반영)

## Verification

1. **타입체크**: `npx tsc --noEmit` (오류 0건)
2. **회귀 테스트**: `npx vitest run __tests__/tax-engine/transfer-tax/mixed-use-partial-usage-change.test.ts` — 기존 anchor 통과 + 신규 SC-1B 통과
3. **전체 회귀**: `npm test` (1,714 케이스 + 신규 케이스)
4. **브라우저 수동 확인**:
   - `npm run dev` 실행 → 양도세 마법사 → 겸용주택 자산 추가
   - "보유 중 일부 용도변경" 토글 ON → "취득시 전체 주택" 선택
   - `취득시 상가건물 기준시가` + `취득시 개별공시지가` 입력 필드가 노출되는지 확인
   - 값 입력 시 결과 카드 ③ 상가부분 산식의 `취득시 상가부분 기준시가` 가 입력값×면적+건물가로 계산되는지
   - 값 미입력 시 fallback 안분 경로로 빠지는지 (안내 박스 문구 확인)
5. **`ui-engine-sync-checker` 호출** (read-only) — 7개 동기화 지점 매핑 누락 점검
