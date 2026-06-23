# 복합구조 조정률 건물특성 자동계산 — UI Design

> Engine: `building-std-price-composite-adjustment.engine.design.md`
> 대상 파일: `components/calc/building-std-price/{BuildingStdPriceForm,CompositePartsSection,AdjustmentRateModal}.tsx`
> 폼: `lib/calc/building-std-price-form.ts`

## UX 개요

복합구조(상증) 입력에서 조정률을 **2계층**으로 입력한다:

1. **건물 전체 특성** — 복합 섹션 상단, 1회 입력(전 부분 공유):
   I 지붕재료, II 최고층수, II 연면적(자동 표시), II 지능형, III 주택유형 + 주거용/아파트.
2. **부분별 특성** — 각 부분 카드 내, "특성으로 계산 / 직접입력(%·번호)" 라디오:
   IV 상가층, IV 부속·주차, V 개축, VI 무벽, VII 구조진단·화재.

단일구조 조정률 UX(라디오 `건물 특성으로 계산` / `직접 입력`, `AdjustmentRateModal`)와 일관.

## 1. `AdjustmentRateModal` — `categoryScope` prop 추가 (DRY 재사용)

기존 7구분 모달을 부분집합으로 재사용:

```ts
interface Props {
  // ... 기존
  /** 표시할 구분 범위 — "all"(단일, 기본) / "building"(I·II·III) / "part"(IV·V·VI·VII) */
  categoryScope?: "all" | "building" | "part";
}
```

- `"building"`: I 지붕, II 최고층수, II 연면적(자동), II 지능형, III 주택유형, 주거용/아파트 토글 표시. IV~VII 숨김.
- `"part"`: IV 상가층, IV 부속·주차, V 개축, VI 무벽, VII 구조진단, VII 화재멸실 표시. I·II·III·주거용 토글 숨김.
- `"all"`: 현행 전체(단일구조 — 무변경).
- 구현: 각 `FieldCard` 블록을 `scope` 조건부 렌더(`scope !== "part"` / `scope !== "building"`).
- **onApply scope 필터(정정 B2, Critical)**: scope별 키셋(`BUILDING_WIDE_FEATURE_KEYS`/`PART_FEATURE_KEYS`)으로
  draft를 추려 반환 → 숨긴 구분의 잔존 draft가 곱해지는 오염 차단. (엔진 §1.2 `toEngineInput` 필터와 2중 방어.)
- **미리보기 structureIndex/floorArea(정정 G·H, High)**:
  - `building` scope 미리보기: `structureIndex = 100` 고정 전달 → I 지붕이 **자동 제외**(지붕은 부분 구조지수<100일 때만 — 엔진이 per-part 적용). 미리보기 레이블 "건물 전체 특성 조정률(지붕 제외·부분 적용)".
  - `part` scope 미리보기: `floorArea = 0` 전달 → `selectSpecialAdjustment`의 II 연면적 후보(`!isResidential && floorArea>0`) **오발동 차단**. 레이블 "부분 특성 조정률 — 건물 전체 특성과 곱해 최종 적용".

## 2. 폼 상태 (`building-std-price-form.ts`) — 8지점 ①②③④⑧

### ① 폼 상태
- `CompositePartForm`에 추가:
  ```ts
  /** 부분별 조정률 입력 방식 — "manual"(번호/%) / "features"(건물특성 자동) */
  adjustmentMode: "manual" | "features";
  /** "features" 모드 부분 특성(IV·V·VI·VII) */
  specialFeatures: SpecialAdjustmentFeatures | null;
  ```
- **건물 전체 특성은 기존 폼 필드 재사용**: `f.adjustmentFeatures`(복합 모드에서는 I·II·III 부분집합) +
  `f.isResidentialUse` + `f.isApartmentUse`. 신규 필드 없음.

### ② initial — `emptyCompositePart()`
```ts
adjustmentMode: "manual",  // 하위호환 기본
specialFeatures: null,
```

### ③ normalize — sessionStorage 마이그레이션
- 기존 저장 폼에 신규 필드 부재 → `adjustmentMode ?? "manual"`, `specialFeatures ?? null` 기본.
- `compositeParts` 로드 시 부분마다 보강(스프레드 기본값).

### ④ toEngineInput — `toCompositePart` + 복합 분기
```ts
function toCompositePart(p, forTransfer) {
  // ... 기존
  if (!forTransfer) {
    if (p.adjustmentMode === "features") {
      part.specialFeatures = p.specialFeatures ?? undefined;
      // 수동 필드는 전달 안 함(엔진 수동 우선 분기 회피)
    } else {
      part.adjustmentRate = p.adjustmentRate ? parseDecimal(p.adjustmentRate) : undefined;
      part.adjustmentNos = parseNos(p.adjustmentNos);
    }
    // 공용은 기존대로 항상
    part.sharedAdjustmentRate = ...; part.sharedAdjustmentNos = ...;
  }
}
```
- 복합(상증) 분기(L335-338): 건물 전체 특성 전달
  ```ts
  if (f.compositeMode) {
    base.compositeParts = f.compositeParts.map((p) => toCompositePart(p, false));
    applyAncillary(base, f);
    if (f.adjustmentFeatures) base.specialFeatures = f.adjustmentFeatures; // 건물 전체
    base.isResidentialUse = f.isResidentialUse || undefined;
    base.isApartmentUse = f.isApartmentUse || undefined;
  }
  ```
  주의: 현행 L340 `if (!f.compositeMode)` 블록과 분리 — 복합에서도 건물전체 특성을 전달하도록 구조 조정.

### ⑧ Validation — `validateCompositeParts`
- `adjustmentMode === "manual"`: 기존 번호 1~36·음수 검증 유지.
- `adjustmentMode === "features"`: 부분 특성 자유 입력(검증 불필요 — 미선택=1.0). 단 특성·수동 동시 입력 모순 없음(모드 배타).
- UI 통과 ↔ validate 차단 모순 금지: features 모드는 특성 0개여도 통과(1.0 적용).

## 3. 입력 위젯 (⑤) — `CompositePartsSection` + `BuildingStdPriceForm`

### 3.1 건물 전체 특성 블록 (`CompositePartsSection` 상단, `!forTransfer`만)

부분 목록 위에 violet 카드 1개:
```tsx
{!forTransfer && (
  <div className="rounded-md border border-violet-200 bg-violet-50/40 p-2.5 space-y-2">
    <p className="text-xs font-semibold text-violet-700">건물 전체 특성 (전 부분 공통)</p>
    {/* 적용된 특성 칩 + "건물 특성으로 계산" 버튼 → buildingWide scope 모달 오픈 */}
    {/* 예상 building factor % 표시(calcSpecialAdjustmentRate building subset, 엔진 단일출처) */}
  </div>
)}
```
- 모달 오픈 콜백·상태는 부모(`BuildingStdPriceForm`)가 보유(기존 `adjOpen`/`setAdjOpen`와 별도 `buildingAdjOpen`).
- 모달 `categoryScope="building"`, `structureIndex={100}`(지붕 미리보기 제외 — §1 정정 G), `onApply`로 `f.adjustmentFeatures`·`isResidentialUse`·`isApartmentUse` set.
- II 연면적 안내: "연면적은 부분 면적 합계 + 부속으로 자동 적용". `floorArea` prop = **부분 면적 합 + 부속 면적 합**(엔진 `buildingTotalArea`와 동일 — 미리보기 일치용. `f.floorArea`는 복합 모드에서 비어 있으므로 사용 금지).

### 3.2 부분별 조정률 — 라디오 + 모달 (`CompositePartsSection`, 각 부분, `!forTransfer`)

현행 L106-119(조정률 % / 번호 칸)을 교체:
```tsx
<RadioCardGroup
  name={`partAdjMode-${i}`} tone="violet" layout="inline"
  value={p.adjustmentMode}
  onChange={(v) => update(i, { adjustmentMode: v as "manual" | "features" })}
  options={[
    { value: "features", label: "특성으로 계산" },
    { value: "manual", label: "직접 입력(%·번호)" },
  ]}
/>
{p.adjustmentMode === "features" ? (
  /* 적용 특성 칩 + "부분 특성으로 계산" 버튼 → part scope 모달(부분 index 보유) */
) : (
  <>
    <FieldCard label="조정률(%)" ...>{/* 기존 */}</FieldCard>
    <FieldCard label="조정률 번호" ...>{/* 기존 */}</FieldCard>
  </>
)}
```
- 부분 모달: `categoryScope="part"`, `structureKey={p.structureKey}`,
  `structureIndex`=부분 구조·연도 기준(`resolveStructureIndex(year, p.structureKey)`),
  `floorArea={0}`(part 미리보기 II 연면적 오발동 차단 — §1 정정 H).
- **manual 모드 안내(정정 D)**: manual 선택 시 "직접 입력 시 건물 전체 특성도 이 부분엔 적용되지 않습니다(완전 수동)" hint 표기.
- 모달 상태는 "열린 부분 index"를 부모/섹션이 보유(`openPartIdx: number | null`). 적용 시 `update(idx, { specialFeatures })`.
- 공용 조정률(번호/%) 칸(L120-140)은 **현행 유지**(수동) — features 모드와 무관하게 항상.

### 3.3 양도 복합(`forTransfer`)
- 변경 없음. 건물 전체 특성 블록·부분 라디오 모두 미표시(조정률 미적용).

## 4. 결과/사이드바 (⑥⑦)

- ⑥ 사이드바: 이 도구 결과는 기준시가 총액 — 기존 동작. 추가 변경 없음.
- ⑦ NTS 계산서: `adjustmentItems` echo가 엔진에서 부분별로 채워짐 → Ⅲ "조정률(번호)" 칸 자동 표시.
  `nts-report-adapter.ts` 변경 불필요(기존 `adjustmentItems` 소비 경로 재사용).
  - 검증: features 모드 복합 anchor의 report 모델에 부분별 번호(예 "1.1(6) 1.2(20)") 노출 확인.

## 5. 8 동기화 지점 자가 점검

| # | 지점 | 변경 |
|---|---|---|
| ① | 폼 상태 | `CompositePartForm.adjustmentMode`·`specialFeatures` |
| ② | initial | `emptyCompositePart` 기본값 |
| ③ | normalize | 마이그레이션 기본(`?? "manual"` / `?? null`) |
| ④ | API 변환 | `toCompositePart` 분기 + 복합 건물전체 특성 전달 |
| ⑤ | UI 위젯 | 건물전체 블록 + 부분 라디오·모달 + `categoryScope` |
| ⑥ | 사이드바 | 변경 없음 |
| ⑦ | 결과(NTS) | `adjustmentItems` echo(엔진 자동) |
| ⑧ | validation | features 모드 통과·manual 모드 기존 검증 |

## 6. E2E (Playwright)

`e2e/building-standard-price.spec.ts` 보강:
- 복합 모드 on → 건물 전체 특성 모달(최고층수 입력) → 부분1 "특성으로 계산" → IV 상가1층 → 계산 →
  결과 NtsBuildingStdPriceReport 조정률(번호) 칸에 번호 노출 확인.
- RadioCardGroup name=label+description → testId 셀렉터(기존 함정 회피, memory 참고).

## 7. 함정 / 주의

- **building 전체 특성 폼 필드 재사용**(`f.adjustmentFeatures`)이 단일 모드와 공유 — `compositeMode` 토글 시
  의미가 바뀌므로, 모드 전환 시 잔존 값 처리 정책 명시(전환 시 유지하되 모달 scope가 표시 구분을 제한).
- 모달 `categoryScope` 부분집합 렌더 시 `previewRate`가 표시 구분만 곱하는지 확인(숨긴 구분이 draft에 남아 곱해지면 오류).
  → scope별로 draft를 필터하거나, 숨긴 필드는 set하지 않도록 보장.
- `useEffect → store` 미러링 금지 — 모달 onApply 직접 set만.
