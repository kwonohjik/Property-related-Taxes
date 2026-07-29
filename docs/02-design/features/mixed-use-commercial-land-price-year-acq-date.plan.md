# 겸용주택 상가부수토지 취득시 공시지가 연도 기준일 정정 (계획서)

## 0. 요약 (한 줄)

토지·건물 취득일이 다를 때(§166⑥), 겸용주택 **상가부수토지 개별공시지가**의 **취득시 공시지가 연도** 자동 추천이
건물 취득일(예 1997) 기준으로 잘못 표시되는 버그를, **토지 취득일**(예 1991) 기준으로 정정한다.
주택분은 이미 토지 취득일 기준(정상). **UI-only — 상가 부수토지 `referenceDate`만 토지 취득일로.**

---

## 1. 배경 · 현황 (실측 근거)

### 1.1 증상 (스크린샷)

| 부분 | 취득시 공시지가 연도 | 기준일 | 판정 |
|---|---|---|---|
| ① 주택분 부수토지 | **1991년 (자동)** | 토지 취득일 1991 | ✅ 정상 |
| ③ 상가분 부수토지 | **1997년 (자동)** | 건물/상가 취득일 1997 | 🔴 버그 (1991이어야) |

같은 필지의 부수토지인데 주택분·상가분의 취득시 공시지가 연도가 다르게 나온다. 상가부수토지도 **토지 취득일** 기준이어야 한다.

### 1.2 공시지가 연도 자동 추천 메커니즘

- `LandPriceLookupField`(`components/calc/inputs/LandPriceLookupField.tsx`)가 `referenceDate` prop에서 연도 자동 추천:
  - `:76` `landPriceYearOptions(referenceDate)` · `:77-79` `recommendedYear = recommendLandPriceYear(referenceDate)` · `:82` `effectiveYear = fixedYear ?? selectedYear || recommendedYear`.
- `recommendLandPriceYear(referenceDate)`(`lib/utils/land-price-year.ts:22`): 월 ≤ 5 → 전년도, 아니면 당해(개별공시지가 5/31 공시 기준). "(자동)" 라벨 = 이 값.
- → **연도 자동값은 전적으로 `referenceDate`에 의존.** 상가부수토지의 referenceDate가 건물 취득일이면 연도도 건물 취득 연도.

### 1.3 주택분(정상) 경로 — 토지 취득일 기준

- `MixedUsePreHousingDisclosureSection.tsx:81` `const acqDate = asset.landAcquisitionDate || asset.acquisitionDate;` (=1991)
- `:253` `acqLandReferenceDate={acqDate || undefined}` → `ThreePointStandardPriceInput.tsx:686` `referenceDate={props.acqLandReferenceDate ?? props.acquisitionDate}` → 1991.
- `ThreePointStandardPriceInput` prop 주석(`:41-45`): "취득시 **부수토지 개별공시지가** 추천 연도는 **토지 취득일** 기준이어야 한다(§166⑥). ※ 건물 위치지수용은 acquisitionDate(건물 취득일) 유지." → **부수토지=토지일 / 건물=건물일** 원칙 명문.
- 이 `acqLandReferenceDate` 분리는 2026-07-11 B안(memory 7846)에서 주택 PHD 경로에만 적용됨.

### 1.4 상가분(버그) 경로 — 건물 취득일 기준 (분리 미적용)

상가부수토지 개별공시지가 위젯은 **두 레이아웃** 모두 `acqReferenceDate = asset.acquisitionDate`(건물 취득일)를 씀:

| 레이아웃 | `acqReferenceDate` 정의 | 상가부수토지 취득시 사용(버그) | 주택 개별주택공시가격(§164⑦ 건물기준·유지) |
|---|---|---|---|
| `MixedUseAssetMajorStdPrice.tsx` | `:86` `= asset.acquisitionDate` | `:270` `referenceDate={acqReferenceDate}` (LandPriceLookupField "개별공시지가") | `:164` (StandardPriceInput "개별주택공시가격") |
| `MixedUseLegacyStdPrice.tsx` | `:70` `= asset.acquisitionDate` | `:279` `referenceDate={acqReferenceDate}` (LandPriceLookupField "개별공시지가") | `:238` (StandardPriceInput "개별주택공시가격") |

- 양도시 상가부수토지(`AssetMajor:257`·`Legacy:160`)는 `referenceDate={transferDate}` → 정상(양도일은 토지·건물 동일).
- **버그 지점**: 취득시 상가부수토지가 `acqReferenceDate`(건물 취득일)를 referenceDate로 사용 → 상가 B안 분리 미적용.

### 1.5 영향 (표시 + 계산)

- 표시: "(자동)" 연도 라벨 오표시(1997).
- 계산: 사용자가 그 연도로 "공시지가 조회"(Vworld) 시 **잘못된 연도(1997)의 공시지가**를 가져옴 → 취득시 상가 토지기준시가·상가 취득가액 오류. (수기 입력 시엔 라벨만 오류.) → **정확도 영향 있음.**

---

## 2. 목표

- 상가부수토지 **취득시** 공시지가 연도 자동 추천 기준일 = **토지 취득일**(`landAcquisitionDate || acquisitionDate`, 주택분과 동일).
- 주택 개별주택공시가격 취득시(§164⑦ 건물 위치지수)는 **건물 취득일 유지**(불변).
- 양도시 상가부수토지(transferDate)는 불변.

---

## 3. 설계 결정

### D1. 분리 변수 `acqLandReferenceDate` 신설 (기존 `acqReferenceDate` 오염 금지)

`acqReferenceDate`(건물 취득일)는 주택 개별주택공시가격(`:164`/`:238`, §164⑦ 건물기준 의도적)에도 재사용된다. 따라서 `acqReferenceDate`를 통째로 바꾸면 주택 개별주택공시가격 연도까지 토지일로 오변경된다. → **별도 변수 신설**:
```ts
const acqLandReferenceDate = asset.landAcquisitionDate || asset.acquisitionDate;
```
주택분 경로(`MixedUsePreHousingDisclosureSection.tsx:81`)와 **동일 산식**(single-source 일관).

### D2. 적용 지점 = 상가부수토지 취득시 LandPriceLookupField `referenceDate`만

- `MixedUseAssetMajorStdPrice.tsx:270` `referenceDate={acqReferenceDate}` → `referenceDate={acqLandReferenceDate}`
- `MixedUseLegacyStdPrice.tsx:279` `referenceDate={acqReferenceDate}` → `referenceDate={acqLandReferenceDate}`
- `:164`/`:238`(주택 개별주택공시가격)·양도시(transferDate) **불변**.

### D3. `hasSeperateLandAcquisitionDate` 무관 — `||` fallback로 충분

`landAcquisitionDate` 미입력(토글 OFF) 시 `|| acquisitionDate`로 건물일 fallback → 토지·건물 취득일 동일 케이스 무회귀. 주택분과 동일 패턴이라 별도 토글 검사 불필요.

---

## 4. 변경 지점

| # | 파일 | 변경 |
|---|---|---|
| C1 | `MixedUseAssetMajorStdPrice.tsx` | `:86` 아래 `acqLandReferenceDate` 변수 추가 + `:270` `referenceDate` 교체 |
| C2 | `MixedUseLegacyStdPrice.tsx` | `:70` 아래 `acqLandReferenceDate` 변수 추가 + `:279` `referenceDate` 교체 |

**엔진·타입·API·validation 무변경** (UI referenceDate 표시/조회 연도만).

---

## 5. 검증

### 5.1 Pre-Do anchor (컴포넌트 렌더)

RTL로 `MixedUseAssetMajorStdPrice`(및 Legacy)를 `landAcquisitionDate="1991-xx"`, `acquisitionDate="1997-xx"`, `hasSeperateLandAcquisitionDate=true`, 겸용 asset으로 렌더:

1. **anchor-A (상가 취득시 = 토지 연도)**: 상가부수토지 취득시 공시지가 연도 자동 라벨 = **1991년 (자동)** (현재 RED=1997).
2. **anchor-B (주택 개별주택공시가격 불변)**: 주택 개별주택공시가격 취득시 연도는 **건물일 1997** 유지(§164⑦).
3. **anchor-C (양도시 불변)**: 상가 양도시 연도 = 양도일 기준(불변).
4. **anchor-D (fallback 무회귀)**: `landAcquisitionDate` 미입력 → 상가 취득시 연도 = `acquisitionDate` 연도(동일값).

※ 셀렉터: `recommendLandPriceYear`가 순수 함수이므로, 컴포넌트 렌더 없이 `referenceDate` 도출 로직만 검증하는 경량 anchor도 가능(연도 = `recommendLandPriceYear(landAcquisitionDate)` 단언). 렌더 anchor가 어려우면 이 경로.

### 5.2 회귀

- 겸용 기준시가 관련 회귀(`__tests__` mixed-use std price) 그린.
- 기존 겸용 E2E(`mixed-use-asset-major-commercial-modal.spec.ts` 등)에서 상가 취득시 연도 assert 있으면 1991로 갱신(grep 후).
- `npx tsc --noEmit` 0 · lint 0.

### 5.3 E2E (권장)

토지 1991 / 건물 1997 겸용 시드 → 상가부수토지 취득시 공시지가 연도 셀렉트가 "1991년 (자동)" 표시 확인.

---

## 6. 미결 / 범위

1. ~~비-겸용 CommercialBuildingBlock/GeneralBuildingBlock 동일버그~~ — ✅ 실측 해소(둘 다 버그 아님):
   - `GeneralBuildingBlock:361` `referenceDate={asset.acquisitionDate}` — GB는 `acquisitionDate`=**토지 취득일**, 건물=`gbBuildingAcquisitionDate`(별도). 취득시 토지 공시지가에 토지일 쓰는 게 **정상**.
   - `CommercialBuildingBlock:268` `referenceDate={asset.acquisitionDate}` — 표준 상가는 **단일 취득일**(landAcquisitionDate/hasSeperate 미사용) → 토지/건물 구분 없음, **정상**.
   - 겸용만 `acquisitionDate`=건물 & `landAcquisitionDate`=토지 이원 구조라 유일 버그. **범위=겸용 2파일 완결**, 후속 불요.
2. **어느 레이아웃이 스크린샷인지** — 이미지는 asset-major(주택분/상가분 분리). Legacy(용도변경)도 동일 버그라 **둘 다 수정**(범위 포함).
3. **`recommendLandPriceYear` 렌더 anchor 난이도** — Radix Select 연도 라벨 추출이 복잡하면 E2E(§5.3, 실제 렌더)로 검증 우선. baseline anchor(`mixed-use-asset-major-baseline.anchor.test.ts`)는 **payload** assert(referenceDate 무관)라 무영향.

---

## 7. 결론

- **작업 성격**: UI-only 버그 정정. 분리 변수 `acqLandReferenceDate` 신설 + 상가부수토지 취득시 `referenceDate` 2곳(AssetMajor·Legacy) 교체. 주택분 PHD 경로의 `acqLandReferenceDate` 패턴을 상가에 동일 적용.
- **핵심 검증**: 상가 취득시 연도=토지일(anchor-A) + 주택 개별주택공시가격 건물일 불변(anchor-B) + fallback 무회귀(anchor-D).
- **규모**: 소.
