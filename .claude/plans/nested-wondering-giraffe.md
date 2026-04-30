# 검용주택 부분 용도변경(주택→상가) — `fallback_apportion` 자동 안분 로직 제거

## Context

현재 `MixedUseStandardPriceInputs` 의 "취득시 상가건물 기준시가" 필드가 비어 있으면 엔진이 **취득시 개별주택공시가격을 양도시 면적비율로 자동 안분(`fallback_apportion`)** 하여 취득시 상가부분 기준시가를 산정한다. 이 로직은 다음 이유로 **세법상 부정확**하므로 전면 제거한다.

- 취득시점에 주택이었던 건물의 개별주택공시가격은 **건물 + 토지 일괄가액**이며, 이를 단순 양도시 면적비율로 가르면 취득시점의 토지/건물 비율과 무관한 임의값이 산출됨.
- `집행기준 99-164-10` 원문은 양도시 안분 원칙을 다루며, 자동 fallback 산식을 보장하지 않음.
- 사용자(세무사)가 취득 당시 동일 건물의 국세청 고시 기준시가를 **직접 조회·입력**하는 것이 유일한 정확한 경로.

**목표**: `fallback_apportion` 분기·UI 안내·테스트를 모두 제거하고, `취득시 상가건물 기준시가` 와 `취득시 개별공시지가` 를 **`house_to_commercial` 시 필수 입력 필드**로 승격한다. 미입력 시 검증 단계에서 명확한 오류 메시지를 노출.

---

## 변경 대상 파일

### 엔진

| 파일 | 변경 |
|---|---|
| `lib/tax-engine/transfer-tax-mixed-use-helpers.ts` | `calcCommercialGainSplit` 의 `house_to_commercial && !userHasInput` 분기(L449~487) 제거. 입력 검증 강화: `commercialBuildingPrice <= 0` 또는 `landPricePerSqm <= 0` 인 경우 명확한 한국어 메시지로 `throw`. 단일 직접 입력 경로만 유지 (`userHasInput` 검사 자체가 삭제 대상이 됨 — 단, `commercial_to_house` 미러 분기는 별도 로직이므로 영향 없음). |
| `lib/tax-engine/transfer-tax-mixed-use.ts` | `partialUsageChangeReason` 빌더(L283~302)에서 `fallback_apportion` 분기 제거. 직접 입력 경로 안내 텍스트만 유지. |
| `lib/tax-engine/types/transfer-mixed-use.types.ts` | `acqStandardSource: "user_input" \| "fallback_apportion"` → `"user_input"` 단일 리터럴로 축소. `fallback_apportion` 케이스 코멘트 삭제 (이슈 17 잔재). |

### 검증·API

| 파일 | 변경 |
|---|---|
| `lib/calc/transfer-tax-validate.ts` | `validateAssetAcquisition` 검용주택 분기(L87~104)에 필수 검증 추가: `hasPartialUsageChange === true && partialChangeDirection === "house_to_commercial"` 시 ① `mixedAcqCommercialBuildingPrice` > 0 ② `mixedAcqLandPricePerSqm` > 0 모두 충족하지 않으면 한국어 오류 반환. |
| `lib/calc/transfer-tax-api.ts` | API 매핑 자체는 그대로 (이미 사용자 입력값을 통째로 전달). 별도 변경 불요. |

### UI

| 파일 | 변경 |
|---|---|
| `components/calc/transfer/mixed-use/MixedUseStandardPriceInputs.tsx` | (1) placeholder L190~194: `house_to_commercial` 시 `"비워두면 개별주택공시가격 면적비율로 자동 안분"` → `"취득시 상가건물 기준시가 (필수)"`. (2) hint L180~184: "양도시 상가연면적 비율로 안분한 값" → "취득 당시 동일 건물의 국세청 고시 기준시가". (3) 안내 박스 L215~226: 두 번째 문단(`미입력 시 엔진이 …자동 안분 합니다`) 전체 삭제, 첫 문단의 "안분한 값" 표현도 "동일 건물의 국세청 고시 기준시가" 로 교체. (4) 개별공시지가 hint도 "필수" 명시. |
| `components/calc/results/mixed-use/MixedUseResultCard.tsx` | `acqStandardSource === "fallback_apportion"` 분기 라벨 제거(L200~207). 단일 라벨 `"취득시 상가부분 기준시가 합계"` 만 유지. |

### 테스트

| 파일 | 변경 |
|---|---|
| `__tests__/tax-engine/transfer-tax/mixed-use-partial-usage-change.test.ts` | (1) `"acqStandardSource = 'user_input' 으로 분기됨"` 케이스(L179~) 유지하되 단순화. (2) `"직접 입력 경로 vs fallback 경로 결과가 다름"`(L244~271) 삭제. (3) `"부분 입력(건물만) → fallback"`(L334~349) 삭제 후 **신규 케이스로 대체**: `commercialBuildingPrice = 0` 또는 `landPricePerSqm = 0` 시 `expect(() => calcMixedUseTransferTax(...)).toThrow(/취득시 상가건물 기준시가/)`. (4) `"partialUsageChangeReason — 직접 입력 경로 안내 문구"`(L294~310) 유지. (5) PHD ON + 직접 입력 케이스(L312~332) 유지. |
| `__tests__/tax-engine/_helpers/mixed-use-fixture.ts` | `mixedUsePdfGap` default 가 `commercialBuildingPrice` / `landPricePerSqm` 를 양수로 채우도록 갱신 (현재 의도적으로 `undefined` 두는 fallback 시연용 → 이제 의미 없음). 코멘트 갱신: "엔진이 자동 안분 …" 제거. PDF 갑氏 anchor 값을 사용자가 입력한 것으로 가정하고 합리적 추정값 채움. anchor 결과값(양도세·지방세 등)이 변동되면 함께 갱신. |

### 설계 문서

| 파일 | 변경 |
|---|---|
| `docs/02-design/features/transfer-tax-mixed-use-partial-change.engine.design.md` | §2-A 의 fallback 알고리즘 블록(L143~189) 제거. §6 에지 케이스 표에서 `housingPrice === 0 & usePreHousingDisclosure === false` 행 갱신: "엔진에서 명시적 throw" → "검증 단계에서 사전 차단". §0 Change Log 에 "2026-05-01 v2 — fallback_apportion 제거, 직접 입력 필수화" 추가. |

---

## 핵심 변경 — 엔진 코드 스케치

```ts
// lib/tax-engine/transfer-tax-mixed-use-helpers.ts
// calcCommercialGainSplit (L440 부근)

// 사용자 입력값 (양수 검증)
const userBuildingStd = asset.acquisitionStandardPrice.commercialBuildingPrice;
const userLandPerSqm  = asset.acquisitionStandardPrice.landPricePerSqm;

if (userBuildingStd <= 0 || userLandPerSqm <= 0) {
  throw new Error(
    "보유 중 일부 용도변경(주택→상가): 취득시 상가건물 기준시가와 개별공시지가를 모두 입력하세요. " +
    "취득 당시 동일 건물의 국세청 고시 기준시가에서 양도시 상가연면적 비율로 안분한 값을 직접 입력해야 합니다."
  );
}

// house_to_commercial 일 땐 acqDerived.commercialLandArea = 0 이므로 양도시 면적 사용
const landAreaForUserInput =
  asset.partialUsageChange?.direction === "house_to_commercial"
    ? derived.commercialLandArea
    : effectiveAcqDerived.commercialLandArea;

const acqLandStd     = userLandPerSqm * landAreaForUserInput;
const acqBuildingStd = userBuildingStd;
const acqStandardSource = "user_input" as const;
// (이하 §97 환산취득가 로직은 기존 그대로)
```

검증은 사용자 폼 → API 진입 직전 `validateAssetAcquisition` 에서도 동일 메시지로 사전 차단해, 엔진 throw 까지 도달하기 전에 친절한 폼 에러로 표시한다.

---

## 작업 순서 (의존 그래프)

1. **타입 축소** — `transfer-mixed-use.types.ts` 의 `acqStandardSource` 리터럴 좁힘. `npx tsc --noEmit` 으로 영향 위치 자동 발견.
2. **엔진 분기 제거** — `transfer-tax-mixed-use-helpers.ts` `calcCommercialGainSplit` 단순화 + throw.
3. **Orchestrator 사유 빌더** — `transfer-tax-mixed-use.ts` `fallback_apportion` 분기 삭제.
4. **검증 함수** — `transfer-tax-validate.ts` 에 `house_to_commercial` 필수 검증 추가.
5. **UI** — placeholder/hint/안내 박스 정리, 결과 카드 라벨 단일화.
6. **픽스처** — `mixedUsePdfGap` default 채움.
7. **테스트** — 시나리오 갱신 + 신규 throw 케이스 추가.
8. **설계 문서** — Change Log + §2-A 갱신.

각 단계 후 `npx tsc --noEmit` 재확인, 마지막 단계에 `npx vitest run __tests__/tax-engine/transfer-tax/mixed-use-partial-usage-change.test.ts` → 그린 확인 → `npm test` 전체 회귀.

---

## 검증 (Verification)

| 시나리오 | 기대 |
|---|---|
| 둘 다 입력 (정상 경로) | 환산취득가 기존 user_input 경로 결과 그대로 |
| 건물만 입력 / 토지만 입력 | 검증 단계에서 폼 오류 → 엔진 미도달 |
| 둘 다 미입력 | 검증 단계에서 폼 오류 → 엔진 미도달 |
| 검증 우회(엔진 직접 호출) | `Error("…직접 입력해야 합니다")` throw |
| `commercial_to_house` (미러) | 영향 없음 — 별도 분기 |
| `partialUsageChange === undefined` (일반 검용주택) | 영향 없음 |
| PHD ON + house_to_commercial + 직접 입력 | 주택분 PHD 환산 + 상가분 user_input — 기존과 동일 |

수동 확인 (브라우저):
1. `/calc/transfer-tax` → 검용주택 토글 → 보유 중 일부 용도변경 토글 → 주택→상가 선택.
2. "취득시 상가건물 기준시가" 비워둔 채 다음 단계 시도 → 한국어 오류 메시지 표시.
3. 양수 입력 후 정상 진행 → 결과 카드의 "취득시 상가부분 기준시가 합계" 값이 입력 기반 산출인지 확인.

---

## 영향 받지 않는 영역

- `commercial_to_house` 미러 분기 (별도 코드 경로, 별도 fallback)
- 일반 검용주택 (`partialUsageChange === undefined`)
- PHD §164⑤ 3-시점 알고리즘 (주택분 환산 — 본 변경과 무관)
- 다른 세목·다른 자산 종류
