# 겸용주택 신고서 양식 — 토지/건물 열별 취득일자·보유기간 표시 (계획서)

## 0. 요약 (한 줄)

겸용주택 신고서 5열(합계·주택분토지·주택분건물·상가분토지·상가분건물)에서
`취득일자`·`보유기간` 행이 현재 **4개 열 모두 단일값(건물 취득일)** 으로 표기되는 것을,
**토지 열 = 토지 취득일 / 건물 열 = 건물 취득일** 기준으로 열별 표기한다.
**엔진 변경 0 — 순수 UI.** 토지/건물 취득일이 이미 form asset에 존재하고 `buildRows`가 접근 가능하기 때문.
([[project_transfer_mixed_use_filing_form_4col]] PR#593의 R4 한계 후속.)

---

## 1. 배경 · 현황 (실측 근거)

### 1.1 현재 동작 — 4열 단일 취득일

`components/calc/results/transfer/FilingFormTableHelpers.ts` `buildRows` fourpart/mixed-4col 분기(`:461-482`):

```
setStr("acquisitionDate", "housingLand",      fmtDate(acquisitionDate));  // 4열 모두
setStr("acquisitionDate", "housingBuilding",  fmtDate(acquisitionDate));  //  동일한
setStr("acquisitionDate", "commercialLand",   fmtDate(acquisitionDate));  //  단일 값
setStr("acquisitionDate", "commercialBuilding",fmtDate(acquisitionDate));
const hold = holdingPeriodFromDates(acquisitionDate, transferDate);
for (const c of [...4열]) setStr("holdingPeriod", c, hold);              // 보유기간도 단일
```

`acquisitionDate`(`:378-381`)는 `primary.acquisitionDate`(= 건물 취득일). → 토지·건물 취득일이 달라도 표는 동일 표기.

### 1.2 R4 정정 — 엔진 변경 불필요 (per-part 취득일이 이미 form에 존재)

PR#593 계획서 R4는 "엔진 result 필드 추가(대 규모) 필요"라 적었으나 **실측 결과 틀림**:

- **토지/건물 취득일은 form asset에 존재** — `AssetForm`(`lib/stores/calc-wizard-asset.ts`):
  - 건물 취득일 = `acquisitionDate`(`:279`)
  - 토지 취득일 = `landAcquisitionDate`(`:334`), `hasSeperateLandAcquisitionDate`(`:332`) ON 시 별도 입력
- **엔진 매핑과 동일 소스** — `lib/calc/transfer-tax-api.ts:147-148`:
  ```
  landAcquisitionDate: primary.landAcquisitionDate || primary.acquisitionDate,
  buildingAcquisitionDate: primary.acquisitionDate,
  ```
  → 엔진 `MixedUseAssetInput.land/buildingAcquisitionDate`(`transfer-mixed-use.types.ts:25·27`)가 이 값으로 계산.
- **`buildRows`가 이미 접근 가능** — `primary = asset ?? formData?.assets[0]`(`FilingFormTableHelpers.ts:376`). MixedUseResultCard는 asset 미전달이라 `primary = formData.assets[0]` → `primary.landAcquisitionDate`/`acquisitionDate` 모두 가용.
- **엔진은 이미 토지/건물 보유연수를 구분해 장특율 산정** — `transfer-tax-mixed-use-helpers.ts:735-736` `calcLongTermRate(gainSplit.landHoldingYears)` vs `buildingHoldingYears`. 즉 표시만 통합돼 있고, **열별 보유기간 표기는 이 다른 장특 배분의 근거를 드러냄**.

### 1.3 거주기간은 무관 (별개, 유지)

`입주일`·`퇴거일`·`거주기간` 행은 주택 열(housingLand/housingBuilding)에만 채워지고 상가 열은 "-"(`:476-481`). 거주는 주택분(토지+건물) 공통 속성이라 현행 유지 — **본 후속 대상 아님**.

---

## 2. 목표

| 행 | 주택분 토지 / 상가분 토지 | 주택분 건물 / 상가분 건물 |
|---|---|---|
| 취득일자 | 토지 취득일 (`landAcqDate`) | 건물 취득일 (`buildingAcqDate`) |
| 보유기간 | `holdingPeriodFromDates(landAcqDate, transferDate)` | `holdingPeriodFromDates(buildingAcqDate, transferDate)` |

- `landAcqDate = primary.landAcquisitionDate || primary.acquisitionDate` (API `:147` fallback과 **동일** — single-source, `mirror-pattern` 준수)
- `buildingAcqDate = primary.acquisitionDate`
- 합계 열 취득일자·보유기간: **현행 유지**(건물 취득일 기준 — 대표값). 변경 없음.

---

## 3. 설계 결정

### D1. 보유기간 계산 = 기존 UI 헬퍼 `holdingPeriodFromDates` 재사용 (엔진 echo 불요)

- 합계 열이 이미 `holdingPeriodFromDates`로 표기(`:379-381`)하므로 열별도 **같은 헬퍼**로 계산 → 표 내부 일관.
- 엔진 `landHoldingYears`/`buildingHoldingYears` echo 추가는 **불채택**(선택) — 표시용 보유기간은 form 날짜로 충분하고, echo는 result 타입 확장(회귀면 증가) 대비 이득이 작음.
- ⚠️ 단, 장특 배분 근거로서 정합을 강조하려면 후속으로 echo 추가 여지(§7 미결).

### D2. 토지 취득일 fallback = API와 동일 (`landAcquisitionDate || acquisitionDate`)

`hasSeperateLandAcquisitionDate` OFF이거나 `landAcquisitionDate` 미입력이면 `acquisitionDate`로 fallback. → 이 경우 4열 취득일이 모두 동일(현행과 동일 표시) → **무회귀**.

### D3. Case A(`fourpart`)와 분기 공유 유지

mixed-4col과 fourpart는 동일 분기(`:461`)를 공유하므로 Case A 신고서도 열별 취득일로 바뀐다. Case A는 건물 전체가 취득시 주택이던 케이스로 토지/건물 취득일이 다를 수 있어 **동일 로직 적용 타당**. Case A anchor 회귀 확인 필수(§6).

---

## 4. 변경 지점

> 전부 `FilingFormTableHelpers.ts` `buildRows` fourpart/mixed-4col 분기(`:461-482`) 내부. 엔진·타입·API·store·validation 변경 없음.

### C1. 취득일자 per-열

건물 열은 branch 상단 기존 `acquisitionDate` 변수 재사용(`:378-381` = `override ?? primary.acquisitionDate`, total 열 `:432`와 동일 — override·total 정합 보존). 토지 열만 별도 도출:

```ts
const landAcqDate = primary?.landAcquisitionDate || acquisitionDate; // API :147 미러 (single-source)
setStr("acquisitionDate", "housingLand",       fmtDate(landAcqDate));
setStr("acquisitionDate", "housingBuilding",   fmtDate(acquisitionDate));
setStr("acquisitionDate", "commercialLand",    fmtDate(landAcqDate));
setStr("acquisitionDate", "commercialBuilding",fmtDate(acquisitionDate));
```

### C2. 보유기간 per-열

```ts
setStr("holdingPeriod", "housingLand",       holdingPeriodFromDates(landAcqDate, transferDate));
setStr("holdingPeriod", "housingBuilding",   holdingPeriodFromDates(buildingAcqDate, transferDate));
setStr("holdingPeriod", "commercialLand",    holdingPeriodFromDates(landAcqDate, transferDate));
setStr("holdingPeriod", "commercialBuilding",holdingPeriodFromDates(buildingAcqDate, transferDate));
```
- 기존 `for (const c of [...]) setStr("holdingPeriod", c, hold)` 루프(`:472-475`)를 위 4개 명시 set으로 대체.

### C3. 합계 열 — 변경 없음

`:427-429`의 합계 취득일자·보유기간(건물 기준)은 유지.

---

## 5. 5 동기화 지점 해당성

엔진 input/result 미변경 → ⑦(결과 표시)만 해당. `tax-field-add` 14지점 전수 **불요**.

---

## 6. 검증

### 6.1 Pre-Do anchor (unit — `buildRows` 직접 호출)

기존 `__tests__/components/mixed-use-filing-form-4col.anchor.test.tsx`에 케이스 추가 또는 신규 파일:

1. **anchor-A (토지≠건물 취득일)**: `landAcquisitionDate`(예 2010) ≠ `acquisitionDate`(예 2015)인 겸용 breakdown + formData로:
   - `취득일자` 행: housingLand·commercialLand = 2010, housingBuilding·commercialBuilding = 2015.
   - `보유기간` 행: 토지 열 > 건물 열 (기간 문자열 파싱 or 년수 비교).
2. **anchor-B (fallback 무회귀)**: `hasSeperateLandAcquisitionDate` OFF(landAcquisitionDate 미입력) → 4열 취득일·보유기간 모두 = `acquisitionDate` 기준(현행 동일).
3. **anchor-C (합계 불변)**: 합계 열 취득일자·보유기간 = 건물 취득일 기준(변경 없음).

### 6.2 회귀

- Case A anchor: `__tests__/tax-engine/transfer-tax/mixed-use-phd-case-a-fourpart.test.ts` (엔진) + Case A 신고서 표 anchor 있으면 취득일 열별 변경 반영.
- 기존 4col anchor 6종 그린 유지(취득일/보유기간 assert 없으면 무영향).
- `npx tsc --noEmit` 0 · 겸용·신고서 회귀.

### 6.3 E2E (선택)

`e2e/mixed-use-filing-form-4col.spec.ts` 시드에 `hasSeperateLandAcquisitionDate: true` + `landAcquisitionDate`(≠ acquisitionDate) 추가 → 취득일자 행에서 토지 열/건물 열 텍스트가 다름을 assert.

---

## 7. 미결 / 결정

1. **엔진 `landHoldingYears`/`buildingHoldingYears` echo 추가 여부** — 기본 **불채택**(form 날짜로 충분). 장특 배분 근거의 정합 검증을 강하게 걸려면 후속으로 `echo-field-pattern` 적용. → **불필요로 확정 권장**.
2. ~~`acquisitionDateOverride` 상호작용~~ — ✅ 해소: 건물 열이 기존 `acquisitionDate` 변수(override 반영)를 재사용하므로 override·total열과 자동 정합(C1).
3. **합계 열 라벨 명확화(선택)** — 합계 열 취득일자가 "건물 취득일"임을 표에서 구분 표기할지(예 fine-print). 현행 유지 권장(과잉 방지).

---

## 8. 결론

- **작업 성격**: UI-only, `buildRows` fourpart/mixed-4col 분기 취득일자·보유기간 set 8줄 교체. 엔진·타입·API 변경 0.
- **데이터**: 이미 존재하는 `primary.landAcquisitionDate`/`acquisitionDate` (API `:147-148`과 single-source).
- **핵심 검증**: 토지≠건물 취득일 케이스 열별 표기(anchor-A) + fallback 무회귀(anchor-B) + Case A 공유 회귀.
- **규모**: 소.
