# 양도세 신고서 양식 — 토지·건물 소유자 분리(`selfOwns`) 표시 버그 수정 계획서

작성일: 2026-07-07
대상 파일: `components/calc/results/transfer/FilingFormTableHelpers.ts` (UI 표시 레이어 only)
엔진 무변경 (엔진은 `selfOwns`를 이미 정확히 처리).

---

## 1. 증상 (사용자 리포트)

취득정보에서 **"건물만 본인 소유 (토지는 타인)"** 토글(`selfOwns="building_only"`)을 켜고 계산하면, 결과 탭의 **"신고서 양식 — 항목별 자산-분할 계산 내역"** 표에서:

1. **버그 ①**: 본인은 건물만 양도하는데 **토지 컬럼까지 값이 표시**된다. (토지는 타인 소유 → 표시되면 안 됨)
2. **버그 ②**: 장기보유특별공제·양도소득금액·과세표준의 **합계 컬럼은 정확**하나 **토지·건물 구분 컬럼 값이 엉터리**.

사용자 확인 사항:
- 건물 컬럼의 **양도가액·취득가액·필요경비는 정확**함.
- 합계 컬럼의 장기보유특별공제·양도소득금액·과세표준은 정확함.

> **행별 실측(사용자 이미지)**: 실제 오염된 분할 행은 **과세대상양도차익**(토지 5,915,906 / 건물 39,714 — 뒤바뀜)과 **양도소득금액**(건물 −1,746,972 음수)뿐. **장기보유특별공제 분할은 이미 정상**(토지 0 / 건물 1,786,686). **과세표준**은 애초에 분할되지 않고 토지·건물 칸이 "−"(빈칸) — "엉터리"가 아니라 미분할(총계만). → 근본 해결은 토지 컬럼 제거(수정 1) + 과세비율 분모 교정(수정 2).

---

## 2. 근본 원인 (실측 검증 완료)

### 2.1 엔진은 정상 — `selfOwns`를 존중함

`lib/tax-engine/transfer-tax-helpers.ts:521-561`:

```ts
const selfOwns = splitDetail.selfOwns ?? "both";
const ownsLand = selfOwns !== "building_only";       // building_only → false
const ownsBuilding = selfOwns !== "land_only";
...
const landDed = ownsLand ? applyRate(...) : 0;
splitDetail.land.longTermDeduction = landDed;        // building_only → 0
```

`transfer-tax.ts:327-330`에서 `result.transferGain / taxableGain / longTermHoldingDeduction / taxBase`는 **건물분만** 반영. → 합계 컬럼이 정확한 이유.

### 2.2 UI 표시 레이어가 `selfOwns`를 무시 — 3개 결함 지점

**결함 A — 컬럼 결정 (버그 ①)** · `FilingFormTableHelpers.ts:252-261` `deriveColumns()`:

```ts
if (sp) {
  return { mode: "split-2col", columns: [
    { key: "total", label: "합계" },
    { key: "land", label: "토지" },     // ← selfOwns 무관하게 항상 렌더
    { key: "building", label: "건물" },
  ] };
}
```
`sp = result.splitDetail`가 존재하기만 하면 무조건 토지+건물 2컬럼. `selfOwns` 미검사.

**결함 B — 과세비율 오염 (버그 ②)** · `FilingFormTableHelpers.ts:608-610`:

```ts
const totalSplitGain = sp.land.gain + sp.building.gain;              // ← building_only인데 land.gain 포함
const taxableRatio = totalSplitGain > 0 ? result.taxableGain / totalSplitGain : 1;
splitTwoColFinancials(sp.land, sp.building, taxableRatio, setNum);
```
분모(`sp.land.gain + sp.building.gain`)는 토지분을 포함하는데, 분자(`result.taxableGain`)는 **건물분만**. → `taxableRatio`가 실제 건물 과세비율보다 축소 왜곡.

이 왜곡된 비율이 `splitTwoColFinancials()`(443-456)로 전달되어:
```ts
const landTaxable = Math.floor(land.gain * taxableRatio);       // 토지: 0이어야 하는데 nonzero
const buildingTaxable = Math.floor(building.gain * taxableRatio); // 건물: 비율 축소로 과소
```
토지·건물 **양쪽** 과세대상양도차익·양도소득금액이 모두 틀어짐.

**결함 C — 합계 양도가액/취득가액/필요경비가 토지분 포함** · `FilingFormTableHelpers.ts:613, 644-649`:

```ts
setNum("transferPrice", "total", totalTransferPrice || null);       // 613: 계약 전체가(토지+건물)
...
} else if (mode === "split-2col" && sp) {
  setNum("acquisitionPrice", "total", sp.land.acquisitionPrice + sp.building.acquisitionPrice); // 645
  setNum("expenses", "total", sp.land.directExpenses + ... + sp.building.directExpenses + ...);  // 646-649
}
```
합계 양도가액/취득가액/필요경비는 토지+건물을 더하지만, 합계 양도차익 이하는 건물분만 → **합계 컬럼 자기모순** (양도가액 − 취득가액 − 필요경비 ≠ 양도차익). 사용자 이미지에서 확인: 합계 양도가액 1,500,000,000 − 취득가액 598,628,482 − 필요경비 8,261,072 ≠ 전체양도차익 5,955,621(건물분).

> 사용자는 ①②만 명시했으나, C까지 고치지 않으면 "건물만 소유" 신고서의 합계 컬럼이 법적으로 자기모순인 채 남는다. **동일 원인(`selfOwns` 미반영)의 한 세트**로 함께 수정한다.

---

## 3. 설계 결정 — "building_only ⇒ 신고서 전체가 건물분"

본인이 건물만 양도하는 경우, 양도소득세 신고 대상은 **건물분 단독**이다 (토지는 과세객체 아님). 따라서 신고서 표 전체를 건물분으로 표기하고 토지 컬럼을 제거한다. `land_only`는 대칭.

- 소유하는 파트의 값 = 합계 값 (엔진 result가 이미 소유 파트 단독으로 산출).
- 컬럼: `building_only` → **[합계, 건물]**, `land_only` → **[합계, 토지]**, `both` → [합계, 토지, 건물] (현행 유지).
  - (합계 == 건물이 되어 두 컬럼 값이 동일하지만, 표 형태 일관성·"합계" 라벨 명확성을 위해 소유 파트 컬럼을 유지. 단일 컬럼으로 축약하지 않음.)

---

## 4. 수정 상세 (파일 1개 · 3개 지점)

`sp.selfOwns`는 `SplitGainResult.selfOwns`로 항상 채워짐(`transfer-split-gain.types.ts:29`) — 접근 안전.

### 수정 1 — `deriveColumns()` (결함 A, 버그 ①) · line 252-261

`selfOwns` 분기로 소유하지 않는 컬럼 제거:

```ts
if (sp) {
  const selfOwns = sp.selfOwns ?? "both";
  const columns = [{ key: "total", label: "합계" }];
  if (selfOwns !== "building_only") columns.push({ key: "land", label: "토지" });
  if (selfOwns !== "land_only") columns.push({ key: "building", label: "건물" });
  return { mode: "split-2col", columns };
}
```
컬럼이 렌더되지 않으면 해당 `setNum(..., "land", ...)` 호출은 표시에 영향 없음(무해). 단, 합계 정합을 위해 수정 3 병행.

### 수정 2 — split-2col 과세비율 분모 (결함 B, 버그 ②) · line 608-610

**`splitTwoColFinancials` 시그니처 무변경.** 오직 `taxableRatio`의 분모만 소유 파트로 교정:

```ts
// line 608-610 대체
const ownedGain =
  (sp.selfOwns === "building_only" ? 0 : sp.land.gain) +
  (sp.selfOwns === "land_only" ? 0 : sp.building.gain);
const taxableRatio = ownedGain > 0 ? result.taxableGain / ownedGain : 1;
splitTwoColFinancials(sp.land, sp.building, taxableRatio, setNum);
```

- `building_only`: 분모 = `sp.building.gain`, 분자 = `result.taxableGain`(건물분) → 건물 셀 `building.gain × ratio = result.taxableGain` ✓.
- 비소유 파트(토지) 셀은 여전히 `land.gain × ratio` garbage로 채워지지만, **수정 1에서 토지 컬럼이 제거되어 미표시**·미집계(splitTwoColFinancials는 셀만 설정, 총계·LTHD합 재계산에 미참여). → 별도 zero 처리 불필요(최소침습).
- `both`: `ownedGain = land.gain + building.gain` → 기존과 동일 → **무회귀**.
- (`splitTwoColFinancials`는 610에서만 호출됨 — grep 확인 완료. 시그니처 유지가 안전·최소.)

### 수정 3 — 합계 양도가액/취득가액/필요경비 (결함 C) · line 644-649 (split-2col 분기 한정)

**⚠️ `both`는 기존 코드 그대로 유지 (회귀 방지).** `totalTransferPrice`는 지분 모드(`ownRatio < 1.0`)에서 `× ownRatio`가 적용된 값(502-505)이라, `both`에서 엔진 split 파트 합으로 바꾸면 지분 케이스가 틀어질 수 있다. → **`building_only`/`land_only`에서만** 합계를 소유 파트로 override:

```ts
} else if (mode === "split-2col" && sp) {
  if (sp.selfOwns === "building_only" || sp.selfOwns === "land_only") {
    const p = sp.selfOwns === "building_only" ? sp.building : sp.land;
    setNum("transferPrice", "total", p.transferPrice || null);   // 613의 totalTransferPrice 덮어쓰기
    setNum("acquisitionPrice", "total", p.acquisitionPrice);
    setNum("expenses", "total", p.directExpenses + p.appraisalDeduction);
  } else {
    // both — 기존 645-649 그대로 (토지+건물 합)
    setNum("acquisitionPrice", "total", sp.land.acquisitionPrice + sp.building.acquisitionPrice);
    setNum("expenses", "total",
      sp.land.directExpenses + sp.land.appraisalDeduction +
      sp.building.directExpenses + sp.building.appraisalDeduction);
  }
}
```

> line 613 `setNum("transferPrice", "total", totalTransferPrice)`는 split 분기 **전** 실행 → `building_only`/`land_only`만 위에서 덮어씀. `both`는 613 값(지분 반영) 유지. 자기정합 검산(사용자 케이스): 건물 17,019,850 − 10,913,622 − 150,607 = 5,955,621 = 합계 양도차익(건물분) ✓.

### 수정 4 — LTHD 분할 행 (검증만, 코드 변경 없음) · line 449-450, 725-733

LTHD 분할은 `sp.land.longTermDeduction`(building_only 시 엔진이 **이미 0**)·`sp.building.longTermDeduction`을 그대로 사용 → 값 정확(사용자 이미지: 토지 0 / 건물 1,786,686로 **이미 정상**). 합계 행(728-729)은 land 파트 0 합산이라 정상. → **코드 변경 없음, GREEN 검증만.**

---

## 5. 케이스 매트릭스 (전수)

| selfOwns | 컬럼(수정1) | 합계 양도가/취득가/경비(수정3) | taxableRatio 분모(수정2) | 기대 |
|---|---|---|---|---|
| `both` (기존) | 합계·토지·건물 | **613 + 645-649 그대로**(지분 반영 유지) | land.gain+building.gain | **무회귀** (전 수정에서 기존과 동일값) |
| `building_only` | 합계·건물 | building 파트 | building.gain | 토지 컬럼 제거·건물=합계 자기정합 |
| `land_only` | 합계·토지 | land 파트 | land.gain | 건물 컬럼 제거·토지=합계 자기정합 |

`both`는 세 수정 모두 기존 코드 경로를 **그대로 통과**(분기 조건이 building_only/land_only에만 매칭) → 회귀 위험 없음(A3 anchor로 확증). 특히 지분 모드(`ownRatio<1.0`) 합계 양도가액은 `both` 경로에서 `totalTransferPrice`(×ownRatio) 유지.

---

## 6. Anchor 테스트 (Pre-Do 우선 작성)

`__tests__/components/` 하위 신규 스펙 `filing-form-self-owns-split.test.tsx`:

1. **A1 (building_only)**: split result + `selfOwns="building_only"` → `deriveColumns`가 `[total, building]`만 반환(토지 없음). RED 확인 후 수정.
2. **A2 (building_only 정합)**: `buildRows` 결과에서 합계 양도가액 = building.transferPrice, 합계 − 취득가 − 경비 = 합계 양도차익(자기정합). 토지 taxableGain 셀 없음/0.
3. **A3 (both 무회귀)**: `selfOwns="both"` → 컬럼 3개 + 수치가 수정 전과 동일(스냅샷/직접값 대조).
4. **A4 (land_only 대칭)**: `[total, land]`만, 합계 = land 파트.

Pre-Do로 A1·A2를 먼저 작성·실행하여 RED 확인 → 설계 환류 기회 확보.

---

## 7. 영향 범위 / 비영향

- **엔진**: 무변경. (`selfOwns` 이미 정확)
- **집계(다자산) 경로** `FilingFormTableAggregateHelpers.ts`: split-2col 미사용(자산별 단일 컬럼) → 무영향. 단, 다자산에 building_only 자산이 섞인 경우는 별도 확인(현행도 자산 컬럼 단위라 이번 버그와 무관 추정 — **Do 시 grep 확인 필요**).
- **PDF 출력** `ResultPdfDocument`: 동일 `buildRows`/`deriveColumns` 소비 → 자동 반영(추가 작업 없음, **확인 필요**).
- **14 동기화 지점**: 신규 엔진 필드 없음(표시 로직만) → 해당 없음.

---

## 8. DoD 체크리스트

- [ ] A1~A4 anchor 작성, A1·A2 Pre-Do RED 확인
- [ ] 수정 1(deriveColumns selfOwns 분기)·2(taxableRatio 분모만, 시그니처 무변경)·3(합계 3행 building_only/land_only 한정) 구현
- [ ] 수정 4(LTHD)는 검증만 — 코드 변경 없음 확인
- [ ] `both` 경로 코드 무변경 확인 (지분 모드 합계 양도가액 회귀 없음)
- [ ] `both` 무회귀 anchor GREEN (A3)
- [ ] `npx tsc --noEmit` 0건
- [ ] `npx vitest run __tests__/components/` + 양도세 신고서 관련 스펙 통과
- [ ] 집계 경로·PDF 출력 building_only 영향 grep 확인
- [ ] 브라우저 수동 확인: building_only 계산 → 결과탭 토지 컬럼 없음·합계 자기정합 (Playwright E2E 또는 미수행 명시)

---

## 9. 미결 / 확인 요청 사항

- **설계 결정 §3** ("building_only ⇒ 신고서 전체 건물분, 합계=건물")이 사용자 의도와 일치하는지. 대안(합계는 계약 전체 1.5B 유지 + 토지 컬럼만 숨김)은 합계 자기모순이 남아 채택하지 않음. → **§3 방식으로 진행 예정, 이견 시 회신 요망**.
