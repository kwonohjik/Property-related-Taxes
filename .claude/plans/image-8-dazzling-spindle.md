# 검용주택 PHD validation — house_to_commercial fallback 인식 (이미지 18 버그)

## Context

검용주택 + 보유 중 일부 용도변경(주택→상가) 시나리오에서 사용자가 PHD ① 패널에 전체 건물 기준시가와 공시지가를 입력했는데도, 화면 하단에 "취득시 개별공시지가(상가)를 입력하세요" 오류가 표시되는 버그.

UI/API는 모두 fallback이 적용되어 정상 동작:
- API 레이어: `mixedAcqLandPricePerSqm`이 0이면 `phdLandPricePerSqmAtAcq`로 fallback
- API 레이어: `mixedAcqCommercialBuildingPrice`가 0이면 `phdBuildingStdPriceAtAcq × (상가면적/전체면적)` 자동 안분
- UI 표시: `LandPriceLookupField`에서 PHD 값 fallback 표시
- 합계: `acqLandPerSqm = mixedAcqLandPricePerSqm || phdLandPricePerSqmAtAcq`

그러나 `lib/calc/transfer-tax-validate.ts` 라인 104-117의 `house_to_commercial` 검증이 **direct 입력 필드만 체크**하고 PHD fallback을 인식하지 못해 검증 단계에서 차단됨.

## 적용된 수정 (완료)

### `lib/calc/transfer-tax-validate.ts` 라인 103-125

`house_to_commercial` 검증 로직을 PHD fallback 인식하도록 수정:

```typescript
if (asset.partialChangeDirection === "house_to_commercial") {
  // 상가건물 기준시가: 직접 입력 또는 PHD ① 전체 건물 기준시가 × (상가면적/전체면적) 자동 안분
  const directBuilding = parseAmount(asset.mixedAcqCommercialBuildingPrice);
  const phdBuilding = parseAmount(asset.phdBuildingStdPriceAtAcq);
  const resArea = parseFloat(asset.residentialFloorArea) || 0;
  const nonResArea = parseFloat(asset.nonResidentialFloorArea) || 0;
  const totalFloor = resArea + nonResArea;
  const autoBuilding =
    phdBuilding > 0 && totalFloor > 0
      ? Math.floor((phdBuilding * nonResArea) / totalFloor)
      : 0;
  if (directBuilding <= 0 && autoBuilding <= 0) {
    return `${label}: 보유 중 일부 용도변경(주택→상가) — 취득시 상가건물 기준시가를 입력하세요. PHD ① 전체 건물 기준시가 입력 시 자동 안분, 또는 직접 조회·입력해야 합니다.`;
  }
  // 개별공시지가(상가): 직접 입력 또는 PHD ① 공시지가 fallback
  const directLandPerSqm = parseAmount(asset.mixedAcqLandPricePerSqm);
  const phdLandPerSqm = parseAmount(asset.phdLandPricePerSqmAtAcq);
  if (directLandPerSqm <= 0 && phdLandPerSqm <= 0) {
    return `${label}: 보유 중 일부 용도변경(주택→상가) — 취득시 개별공시지가(상가)를 입력하세요.`;
  }
}
```

## 검증 (대기)

```bash
npx tsc --noEmit
npx vitest run __tests__/tax-engine/transfer-tax/
```

브라우저 수동:
- PHD ①에 전체 건물 기준시가 + 공시지가만 입력 → 오류 메시지 사라짐 확인
- 둘 다 비어있는 상태 → 정상 오류 표시

## 영향 없음 확인

- `commercial_to_house` 케이스는 별도 검증 흐름이라 영향 없음
- direct 입력만 한 경우(기존 사용자 흐름)도 그대로 통과
- API/UI fallback과 검증 일관성 확보 — Definition of Done 통일
