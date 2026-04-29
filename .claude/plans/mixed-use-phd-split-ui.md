# 겸용주택 + 토지/건물 분리 + PHD 결합 케이스 UI 보완 계획

## 0. 시나리오

이미지(image-1)의 사례는 다음 4가지 모드가 동시에 활성화된 케이스다.

| 모드 | 값 |
|---|---|
| 자산 종류 | 주택 (검용주택 분리계산 ON) |
| 면적 | 주택연면적 333.06㎡ / 상가연면적 277.6㎡ / 정착 100㎡ / 전체토지 168.3㎡ |
| 토지/건물 분리 | 토지 1992-01-01 · 건물 1997-09-12 |
| 취득가액 산정 | 환산취득가 |
| 개별주택가격 | 취득시 미공시 (1996년 최초 고시 이전) → §164⑤ PHD 환산 필요 |
| 양도가액 | 2,300,000,000원 / 거주 30년 / 수도권 |

엔진(`transfer-tax-mixed-use.ts`)은 검용주택 분리계산 메인 함수가 구현되어 있고 `usePreHousingDisclosure` 옵션 필드도 타입에 존재하지만, **실제 PHD 환산 분기가 미구현(주택부분 환산 계산 시 `acquisitionStandardPrice.housingPrice ?? 0`로 fallback)** 이며 UI도 4-way 결합을 명확히 지원하지 못한다.

---

## 1. 현재 구현 상태 (코드 인벤토리)

| 영역 | 파일 | 상태 |
|---|---|---|
| 검용주택 토글·면적·기준시가·거주기간 | `components/calc/transfer/MixedUseSection.tsx` 외 3종 | ✅ 구현 |
| PHD 3-시점 환산 패널 | `components/calc/transfer/PreHousingDisclosureSection.tsx` | ✅ 구현 (단, 일반 자산 전용) |
| 토지/건물 분리 직접입력 | `components/calc/transfer/LandBuildingSplitSection.tsx` | ✅ 구현 |
| 검용주택 엔진 | `lib/tax-engine/transfer-tax-mixed-use.ts` + `-helpers.ts` | ✅ 본체 / ⚠ PHD 분기 미구현 |
| PHD 호출 위치 | `CompanionAcqPurchaseBlock.tsx:392-415` | ⚠ `isSplit && useEstimatedAcquisition`에서만 노출 — 검용주택 분기 없음 |

---

## 2. 누락 UI / 코드 갭

### 갭 A. 검용주택 + 환산모드 + 토지·건물 분리 → 일반 자산용 환산 입력이 중복 노출
- 이미지의 "취득시 기준시가 1991년 / 양도시 기준시가 2021년" 카드는 일반 `StandardPriceInput`이 그대로 출력된 것.
- 검용주택 모드(`isMixedUseHouse=true`)에서는 `MixedUseStandardPriceInputs`가 검용주택 전용 6필드(양도/취득 × 개별주택가격·상가건물·공시지가/㎡)를 받음 → 엔진은 이쪽 데이터를 사용.
- 두 입력 영역이 동시에 보여 사용자가 어느 값이 계산에 쓰이는지 알 수 없음.

### 갭 B. 검용주택 + 개별주택가격 미공시 (PHD) 결합이 UI/엔진 양쪽에서 미연결
- `CompanionAcqPurchaseBlock`의 PHD 토글은 일반 자산용 분기 안쪽에 있어 **검용주택에서는 영영 노출되지 않는다.**
- 엔진 `calcHousingEstimatedAcq`(transfer-tax-mixed-use-helpers.ts:92)는 `acquisitionStandardPrice.housingPrice ?? 0` fallback이라 미공시 케이스에서 환산취득가가 0이 되어 양도차익이 비정상 폭증.
- PHD 토지면적은 일반 자산에서 `asset.acquisitionArea`를 사용하지만, 검용주택에서는 **주택부수토지 면적** = `totalLandArea × residentialRatio` 가 들어가야 한다.

### 갭 C. 토지/건물 취득일 분리 정보가 검용주택 입력과 중복
- 검용주택 타입(`MixedUseAssetInput`)은 자체 필드 `landAcquisitionDate`/`buildingAcquisitionDate`를 보유.
- 그러나 일반 자산 토글 `hasSeperateLandAcquisitionDate`도 별도로 켜야 하는 구조.
- 한 번 입력하면 양쪽이 동기화되도록 단일 진실 출처(SOT) 정리 필요.

### 갭 D. 사이드바 미리보기 누락
- 입력만으로 즉시 산출 가능한 지표(주택연면적 비율, 주택/상가 부수토지 면적, 안분 양도가액)가 사이드바에 미노출.
- 환산취득가/양도차익은 API 결과 후 표시(정상)이지만, 안분 양도가액은 입력만으로 산출 가능 → 사이드바에 추가 가능.

### 갭 E. 자본적지출 귀속 단일 칸
- 현재 `directExpenses`(직접 귀속 필요경비) 한 칸 → 검용주택 분리 시 주택분/상가분/비사업용토지분 귀속이 모호.
- 엔진은 `directExpenses`를 어디에 적용하는지 명확하지 않음(검용주택 helpers에서 미사용).

### 갭 F. 결합 모드 가이드 박스 부재
- "검용주택 + 환산 + 토지/건물분리 + PHD" 4-way 활성화 시 어떤 알고리즘으로 분기되는지 사용자에게 안내하는 패널 없음.

### 갭 G. 양도일 입력 누락(사용자 미입력 상태)
- 이미지 최상단 "양도일" 빈 상태 — UI는 존재하므로 사용자가 채우면 됨. **누락 아님**.

---

## 3. 수정 계획 (우선순위 순)

### P0 — 엔진: 검용주택 PHD 분기 구현 (블로커)

**파일**: `lib/tax-engine/transfer-tax-mixed-use-helpers.ts`

```typescript
export function calcHousingEstimatedAcq(
  housingTransferPrice: number,
  asset: MixedUseAssetInput,
  derived: MixedUseDerivedAreas,
): { estimatedAcq: number; phdAcqHousingPrice?: number; phdAcqLandStd?: number; phdAcqBuildingStd?: number } {
  if (asset.usePreHousingDisclosure && asset.phd) {
    // §164⑤ 3-시점 알고리즘으로 취득시 주택가격 역산
    return calcEstimatedAcqViaPhd(housingTransferPrice, asset, derived);
  }
  // 기존 §97 직접 환산
  ...
}
```

PHD 분기 시 토지면적 = 주택부수토지(`totalLandArea × residentialRatio`)를 자동 적용. 환산된 취득시 개별주택가격은 후속 토지/건물 분리 계산의 `acquisitionStandardPrice.housingPrice` 자리로 주입.

### P1 — 입력 UI 정리: 검용주택 모드 시 일반 환산 입력 숨김

**파일**: `components/calc/transfer/CompanionAcqPurchaseBlock.tsx`

- `isMixedUseHouse=true`일 때 일반 자산용 "취득시/양도시 기준시가" 영역과 일반 PHD 토글을 모두 숨긴다.
- 안내 문구: "검용주택 분리계산 모드에서는 위 면적·기준시가 영역에서 입력합니다."

### P2 — 검용주택 모드 전용 PHD 토글 신설

**파일**: `components/calc/transfer/mixed-use/MixedUseStandardPriceInputs.tsx` 확장 + 신설 `MixedUsePreHousingDisclosureSection.tsx`

- "취득시 개별주택공시가격" 필드 위에 토글: "취득 당시 개별주택가격 미공시 (§164⑤ 3-시점 환산)"
- 토글 활성화 시 PHD 패널 노출. 토지면적은 자동(주택부수토지) 표기.

### P3 — 토지/건물 취득일 SOT 정리

검용주택 모드 ON 시 `hasSeperateLandAcquisitionDate=true` 자동 설정. 토지/건물 취득일은 자산-수준 `landAcquisitionDate`/`acquisitionDate`(건물)와 일관 사용.

### P4 — 사이드바 합계 보강

검용주택 모드일 때만:
- 주택연면적 비율
- 주택부수토지 / 상가부수토지 면적
- 안분 양도가액 (주택/상가) — 입력값으로 즉시 계산 가능 시

### P5 — 자본적지출 귀속 분리 (선택사항, 후속)

P0~P3 안정화 후 별도 PR.

### P6 — 결합 모드 가이드 패널

조합 활성화 시 노란 인포 박스로 4-way 알고리즘 단계 설명.

---

## 4. 작업 순서·산출물

| 순서 | 작업 | 산출물 | 검증 |
|---|---|---|---|
| 1 | P0 엔진 PHD 분기 | helpers + types 수정 | unit test |
| 2 | P1 일반 입력 숨김 | `CompanionAcqPurchaseBlock` 분기 | 시각 회귀 |
| 3 | P2 검용주택 PHD 토글 + 패널 | `MixedUseStandardPriceInputs` 확장 | 통합 테스트 |
| 4 | P3 취득일 SOT | `MixedUseSection` + 동기화 | 회귀 |
| 5 | P4 사이드바 | `computeTransferSummary` + `WizardSidebar` | 사이드바 검증 |
| 6 | P6 가이드 박스 | `MixedUseSection` 상단 | — |
| 7 | P5 자본적지출 분리(옵션) | 후속 | — |

---

## 5. 테스트 계획

이미지 케이스를 anchor 테스트로 고정 (`__tests__/tax-engine/transfer-tax/mixed-use-house.test.ts`):
- 주택연면적 333.06 / 상가 277.6 / 정착 100 / 토지 168.3
- 양도 2,300,000,000 / 거주 30년 / 수도권
- 토지 1992-01-01 / 건물 1997-09-12
- 취득시 개별주택가격 미공시 → PHD 분기
- 검증: 주택비율, 안분 양도가액, PHD 환산 결과, 주택/상가 양도차익, 합산 세액

---

## 6. 미해결 이슈 / 후속 검토

1. **PHD 적합성 경고**: 엔진에 "검용주택의 PHD 적합성은 사례별 검토 필요" 경고가 이미 있음. 본 케이스는 §164⑤ 환산이 정확히 적용되어야 하는지 세무 전문가 확인 필요.
2. **자본적지출 안분 알고리즘**: 검용주택 helpers에서 `directExpenses` 미사용 — 별도 PR로 보강.
3. **상가건물 1990 환산**: 상가건물 취득시 기준시가가 1990 이전이면 별도 환산 — 현재 미지원.
