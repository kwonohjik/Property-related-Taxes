# PHD §164⑤ 환산 산식 — 검용주택 + 부분 용도변경 케이스 분기 적용

## Context

이미지 3~5 사례(2026-05-01 사용자 보고): 1985.1.1 의제취득 → 2005.4.30 개별주택가격 최초고시 → **2011.8.5 일부 용도변경** → 2023.2.16 양도. 이 케이스에서 현재 PHD 3-시점 환산 알고리즘이 **세법상 부정확**한 결과를 산출.

**문제 본질**:
현재 `lib/tax-engine/transfer-tax-pre-housing-disclosure.ts` 의 `Sum_F`·`Sum_A` 는 항상 "주택부수토지 면적 + 주택건물 기준시가"(주택분만)로 계산. 그러나 위 사례에서는 최초고시일(2005)에 건물 전체가 아직 주택이었으므로 P_F = 150,000,000원이 **건물 전체(미래 상가가 될 부분 포함)**의 가격이다. 분모(Sum_F)와 분자(P_F·Sum_A) 가 가리키는 영역이 일치하지 않아 P_A_est 가 부정확.

**정확한 산식** (사용자 제시 + 합의된 재정의):

```
P_A_est = P_F × (취득시 전체 토지 기준시가 + 취득시 전체 건물 기준시가)
              ÷ (최초공시 당시 전체 토지 기준시가 + 최초공시 당시 전체 건물 기준시가)
```

여기서 "전체 토지 기준시가" = 그 시점의 공시지가/㎡ × 전체 토지면적, "전체 건물 기준시가" = 그 시점에 존재한 모든 건물 부분의 국세청 고시 기준시가 합계.

**분기 조건**:
- **Case A**: `firstDisclosureDate < usageChangeDate` → 위의 새 산식 적용 (최초공시 시점에 건물 전체가 주택)
- **Case B**: `firstDisclosureDate ≥ usageChangeDate` → 현재 산식 유지 (최초공시 시점에 이미 검용)
- **partialUsageChange 미사용** (일반 검용주택) → 현재 산식 유지

**의도 결과**: `usePreHousingDisclosure` + `partialUsageChange.usageChangeDate` 조합에서 시점별 면적·기준시가 의미를 정확히 반영. 결과 카드에 분기 배지 노출. 시점별 면적은 자동 계산하되 사용자 수정 가능.

---

## 사용자 결정 사항 (확정)

| # | 결정 |
|---|---|
| Q1 | `usageChangeDate` 미입력 + PHD ON + partialUsageChange ON → **검증 단계에서 차단** |
| Q2 | 시점별 토지면적은 **자동 계산 (사용자 수정 가능)** |
| Q3 | 건물 기준시가 입력 라벨은 **"전체 건물 기준시가"** (Case A 시점에 한정 동적 변경) |
| Q4 | 결과 카드에 **"최초공시일 < 용도변경일 — 전체 건물 기준 환산" 배지 + 산식** (a 안) |
| Q5 | 기존 anchor 는 Case A 산식으로 재산출 + **Case B 별도 anchor 케이스 추가** (후자) |

---

## 변경 대상 파일

### 엔진

| 파일 | 변경 |
|---|---|
| `lib/tax-engine/types/transfer.types.ts` | `PreHousingDisclosureInput` 에 시점별 **건물 기준시가 모드** 필드 추가:<br/>`buildingScopeAtAcquisition: "whole" \| "housing_only"` (default `"housing_only"`)<br/>`buildingScopeAtFirstDisclosure: "whole" \| "housing_only"` (default `"housing_only"`)<br/>`buildingScopeAtTransfer: "whole" \| "housing_only"` (default `"housing_only"`)<br/>의미: 해당 시점의 `buildingStdPrice*` 입력값이 "전체 건물(주택+상가 합계)"인지 "주택분만"인지. Case A 진입 시 acq·first = `"whole"`, transfer = `"housing_only"`. `PreHousingDisclosureResult.inputs` 에 동일 echo 필드 추가. |
| `lib/tax-engine/transfer-tax-pre-housing-disclosure.ts` | `Sum_A`·`Sum_F`·`Sum_T` 산식의 의미는 동일하지만, 입력 면적·기준시가 의미가 호출자 책임으로 옮겨감 (mode 필드는 결과 메타데이터 echo 용도이며 산식 자체는 그대로 — 면적·건물값을 "전체"로 주입하면 자연스럽게 정확한 산식이 됨). docstring 갱신: "검용주택 + Case A 진입 시 호출자가 acq·first 시점에 전체 토지면적·전체 건물 기준시가를 주입해야 함" 명시. `landHousingAtAcquisition` 등 안분값 산식 의미 재검토 → Case A 에서 P_A_est 자체가 "취득시점 전체 합계 대 최초공시 전체 합계 비율" 이므로, 안분 시 분모가 Sum_A 이면 그대로 자연스럽게 동작 (P_A_est 와 Sum_A 가 같은 영역을 가리킴). |
| `lib/tax-engine/transfer-tax-mixed-use-helpers.ts` | `calcHousingEstimatedAcq` 내 `usageChangeDate`·`firstDisclosureDate` 비교 분기(L184~193) 강화: <br/>① Case A 식별 (`firstDisclosureDate < usageChangeDate`) <br/>② Case A 시 `landAreaAtAcquisition = landAreaAtFirstDisclosure = totalLandArea` (현재 `acqDerived.residentialLandArea` 잘못 사용) <br/>③ Case A 시 `buildingStdPriceAtAcquisition`/`AtFirstDisclosure` 는 사용자 입력값(폼이 "전체 건물 기준시가" 의미로 받음)을 그대로 전달 — 폼 변환 책임은 API 레이어 <br/>④ `landAreaAtTransfer` = `derived.residentialLandArea` (양도시 주택부수토지) 그대로 <br/>⑤ Case A·B 식별 결과를 `phdResult` 메타에 추가해 결과 카드가 배지 표시 가능 |
| `lib/tax-engine/types/transfer-mixed-use.types.ts` | `MixedUseGainBreakdown.partialUsageChange` 메타에 `phdScopeBranch?: "case_a_whole_building" \| "case_b_housing_only"` 추가 — 결과 카드 배지용 |

### 검증

| 파일 | 변경 |
|---|---|
| `lib/calc/transfer-tax-validate.ts` | 검용주택 + `usePreHousingDisclosure === true` + `hasPartialUsageChange === true` 시 `partialChangeUsageChangeDate` 필수 검증 추가. 한국어 메시지: "보유 중 일부 용도변경 + 개별주택가격 미공시 환산 동시 사용 시 용도변경일이 필수입니다." |

### API 변환

| 파일 | 변경 |
|---|---|
| `lib/calc/transfer-tax-api.ts` | mixedUsePayload 에서 `preHousingDisclosure` 매핑 시: `firstDisclosureDate < usageChangeDate` 인 경우 `buildingScopeAtAcquisition = buildingScopeAtFirstDisclosure = "whole"`, 그 외 모두 `"housing_only"`. (mode 필드는 echo 메타이고 실제 산식은 입력값 그대로 통과.) |

### UI

| 파일 | 변경 |
|---|---|
| `components/calc/transfer/mixed-use/MixedUsePreHousingDisclosureSection.tsx` | (1) `firstDisclosureDate < usageChangeDate` 감지해 Case A 진입 시 폼 상단에 안내 박스 추가: "최초공시일 < 용도변경일 — 취득시·최초공시 시점 입력란은 '전체 건물 기준시가'(주택 + 상가 부분 합계, 당시 전체 주택)로 입력하세요. 양도시점은 주택분만." <br/>(2) 시점별 토지면적 자동값 표시 + "수정" 토글 (수정 시 사용자 직접 입력 받음, 양수 검증). <br/>(3) 시점별 라벨 동적 변경: Case A — acq·first 의 "주택 건물기준시가" → "전체 건물 기준시가 (당시 전체 주택)"; transfer 는 그대로 "주택분 건물기준시가". Case B 또는 partialUsageChange OFF — 모든 시점 "주택분 건물기준시가". |
| `components/calc/results/mixed-use/MixedUseResultCard.tsx` | PHD 결과 섹션에 `phdScopeBranch === "case_a_whole_building"` 일 때 "최초공시일 < 용도변경일 — 전체 건물 기준 환산" 배지 + 한국어 산식 노출:<br/>`P_A_est = P_F × (취득시 전체 토지+건물 기준시가) ÷ (최초공시 당시 동일)`<br/>Case B 일 땐 기존 산식 그대로. |

### 테스트

| 파일 | 변경 |
|---|---|
| `__tests__/tax-engine/transfer-tax/mixed-use-partial-usage-change.test.ts` | (1) **기존 PDF 갑氏 anchor (SC-1) 재산출** — Case A 적용 후 새 결과로 잠금. 이 케이스는 1985 의제취득 + 2005 최초공시 + 2011 용도변경 → Case A 진입. anchor 모든 값 (housing/commercial transferGain·incomeAmount·세액) 새로 계산. <br/>(2) **신규 SC-A: Case A vs Case B 분기 비교** — 동일 입력에서 `usageChangeDate` 만 2004-12-01(Case B) 로 바꿔 P_A_est 가 두 산식에서 다르게 산출됨을 검증. <br/>(3) **신규 SC-B: usageChangeDate 미입력 + PHD ON → 검증 실패** — `validateAssetAcquisition` 검증이 한국어 오류 반환함을 단위 테스트로 확인. <br/>(4) **신규 SC-C: 시점별 면적 사용자 수정** — `landAreaAtAcquisition` override 가 자동값보다 우선 적용됨. |
| `__tests__/tax-engine/_helpers/mixed-use-fixture.ts` | `mixedUsePdfGap` 픽스처에 `partialUsageChange.usageChangeDate = new Date("2011-08-05")` 추가. 1985 시점 `buildingStdPriceAtAcquisition` (지금 0) 을 Case A 가정에 맞게 추정값 입력 (예: 1985 시점 건물 기준시가 추정). 2005 시점 `buildingStdPriceAtFirstDisclosure` 도 추정값. anchor 8개 재산출. 신규 fixture `mixedUsePdfGap_caseB` 추가 — `usageChangeDate = 2004-12-01` 로 Case B 시연. |
| `__tests__/tax-engine/transfer-tax/transfer-tax-pre-housing-disclosure.test.ts` (있다면) | `buildingScopeAt*` 필드가 `inputs` echo 에 포함됨을 검증하는 테스트 1건 추가. |

### 설계 문서

| 파일 | 변경 |
|---|---|
| `docs/02-design/features/transfer-tax-mixed-use-partial-change.engine.design.md` | Change Log v3 추가 (2026-05-01) — Case A/B 분기 도입, 산식 재정의. §2 알고리즘 섹션에 분기 결정 트리 다이어그램 추가. §6 에지 케이스에 `firstDisclosureDate < usageChangeDate` 행 추가. §7 PDF 갑氏 데이터 추적표 갱신. |
| `docs/02-design/features/transfer-tax-mixed-use-partial-change.ui.design.md` | UI 라벨 동적 전환 규칙 + Case A 진입 안내 박스 명세. |

---

## 핵심 변경 — 엔진 코드 스케치

```ts
// lib/tax-engine/transfer-tax-mixed-use-helpers.ts
// calcHousingEstimatedAcq (PHD 분기 내부)

if (asset.usePreHousingDisclosure && asset.preHousingDisclosure) {
  const usageChangeDate = asset.partialUsageChange?.usageChangeDate;
  const firstDate = asset.preHousingDisclosure.firstDisclosureDate;

  // Case A 식별: 최초공시 시점에 아직 용도변경 전 (전체 주택)
  const isCaseA = !!usageChangeDate && firstDate < usageChangeDate;

  let landAreaAtAcquisition: number | undefined;
  let landAreaAtFirstDisclosure: number | undefined;
  let landAreaAtTransfer: number | undefined;

  if (isCaseA) {
    // 취득·최초공시 시점에는 건물 전체가 주택 → 전체 토지면적 사용
    landAreaAtAcquisition = asset.totalLandArea;
    landAreaAtFirstDisclosure = asset.totalLandArea;
    landAreaAtTransfer = derived.residentialLandArea;
  } else if (usageChangeDate && acqDerived) {
    // Case B: 용도변경이 최초공시 이전 — 시점별 검용 면적
    landAreaAtAcquisition = acqDerived.residentialLandArea;
    landAreaAtTransfer = derived.residentialLandArea;
    landAreaAtFirstDisclosure = derived.residentialLandArea;
  }
  // partialUsageChange 미사용 시 단일 landArea fallback (현재 동작)

  const phdResult = calcPreHousingDisclosureGain(housingTransferPrice, {
    ...asset.preHousingDisclosure,
    landArea: derived.residentialLandArea,
    landAreaAtAcquisition,
    landAreaAtFirstDisclosure,
    landAreaAtTransfer,
  });

  return {
    estimatedAcq: phdResult.totalEstimatedAcquisitionPrice,
    phdAcqHousingPrice: phdResult.estimatedHousingPriceAtAcquisition,
    phdResult,
    phdScopeBranch: isCaseA ? "case_a_whole_building" : "case_b_housing_only",
  };
}
```

> **포인트**: 산식 자체(`P_A_est = P_F × Sum_A / Sum_F`)는 불변. **호출자가 시점별로 어떤 영역(전체 vs 주택분만)에 해당하는 면적·기준시가를 주입**하느냐가 분기. UI 라벨은 사용자가 "전체 건물 기준시가"를 입력하도록 안내하고, 그 값이 그대로 `buildingStdPriceAtAcquisition` 등에 들어가면 됨.

---

## 작업 순서 (의존 그래프)

1. **타입 확장** — `PreHousingDisclosureInput.buildingScopeAt*` echo 필드 추가, `MixedUseGainBreakdown.partialUsageChange.phdScopeBranch` 추가.
2. **엔진 분기** — `calcHousingEstimatedAcq` 시점별 면적 자동 결정 로직 강화. `phdScopeBranch` 메타 산출.
3. **검증** — `validateAssetAcquisition` 에 `usageChangeDate` 필수 검증.
4. **API** — `transfer-tax-api.ts` 의 `buildingScopeAt*` 산출 (echo 만).
5. **UI 폼** — Case A 진입 안내 박스, 시점별 라벨 동적 변경, 시점별 면적 자동 계산 + "수정" 토글.
6. **결과 카드** — 분기 배지 + 한국어 산식.
7. **픽스처** — `mixedUsePdfGap` 에 `usageChangeDate` 추가, 추정 건물 기준시가 채움. anchor 재산출. `mixedUsePdfGap_caseB` 신규.
8. **테스트** — 기존 anchor 재계산, 새 SC-A/B/C 추가.
9. **설계 문서** — engine.design Change Log + ui.design 라벨 규칙.

각 단계 후 `npx tsc --noEmit` → `npx vitest run __tests__/tax-engine/transfer-tax/mixed-use-partial-usage-change.test.ts` → 마지막 `npm test` 전체 회귀.

---

## 검증 (Verification)

### 단위/회귀 테스트

| 시나리오 | 기대 |
|---|---|
| Case A — PDF 갑氏 (1985 → 2005 → 2011 → 2023) | P_A_est, 환산취득가, 양도차익, 세액 모두 새 anchor 값과 일치 |
| Case B — usageChangeDate < firstDisclosureDate | 현재 산식 결과와 동일 (회귀 0건) |
| 일반 PHD (partialUsageChange 미사용) | 현재 산식 결과와 동일 (회귀 0건) |
| 일반 검용주택 (PHD 미사용) | 영향 없음 |
| usageChangeDate 미입력 + PHD ON + partial ON | 검증 단계에서 한국어 오류 반환 |
| 시점별 면적 사용자 수정 | override 값이 자동값보다 우선 |

### 수동 확인 (브라우저)

1. `/calc/transfer-tax` → 검용주택 ON → PHD ON → 보유 중 일부 용도변경 ON → 주택→상가 → 용도변경일 2011-08-05 → 최초고시일 2005-04-30
2. 폼 상단에 "최초공시일 < 용도변경일 — 전체 건물 기준시가 입력 안내" 박스 노출 확인
3. acq·first 시점 라벨이 "전체 건물 기준시가" 로 변경됨 확인
4. 시점별 토지면적 자동값 표시 (acq/first = 198.3㎡, transfer = 63.5㎡) 확인
5. 결과 카드에 "Case A — 전체 건물 기준 환산" 배지 + 한국어 산식 노출 확인
6. 용도변경일 비워둔 채 진행 → 한국어 오류 메시지 노출 확인

---

## 영향 받지 않는 영역

- `commercial_to_house` 미러 분기 (별도 코드 경로, 향후 별도 검토)
- 일반 검용주택 (PHD 미사용)
- 일반 PHD (partialUsageChange 미사용)
- 다른 세목·다른 자산 종류
- `commercialBuildingPrice`·`landPricePerSqm` 직접 입력 필수 정책 (직전 PR 에서 확정)

---

## Open Questions / 사용자 후속 검토 필요

- **추정 건물 기준시가 (1985, 2005)**: PDF 미명시 — 픽스처에서 합리적 추정값 사용. 사용자가 실제 NTS 조회값으로 교체 시 anchor 재잠금 필요.
- **분필·합필 케이스**: 시점별 토지면적 자동값이 `totalLandArea` 라는 가정. 사용자 수정 토글로 처리 가능하지만 분필 이력 입력 UI 는 본 PR 범위 외.
- **2회 이상 용도변경**: 본 분기는 최초·최종 한 번 변환만 가정. 다단계 용도변경은 별도 검토.
