# UI 설계 — 겸용주택 면적 통합 카드 + 전용/공통 파생 + 부수토지 override

> Status: **UI Design (STEP 12)** · 2026-07-09 · 계획 [`.plan.md`] · 엔진 [`.engine.design.md`]
> D1 확정: override 노출 위치 = **기준시가 계산란(AssetMajor 상가 부수토지)**. 사용자 요청 4항("기준시가 계산란에 자동 반영·수정가능")에 직접 부합.

---

## 1. override 노출 위치 — D1 최종 확정

사용자 요청 4: "안분한 부수토지 면적을 **기준시가 계산란**에 자동 반영(수정가능)". 실측:
- AssetMajor(`MixedUseAssetMajorStdPrice.tsx`)가 표시하는 부수토지 = **상가 부수토지**(`commercialLandArea` `:46-48`). 주택은 개별주택가격 일괄이라 주택 부수토지 미표시.
- 양도/취득 상가 토지 std(`:52`·`:59`) + 상가 섹션 `LandPriceLookupField area=`(`:210·223`)가 이 면적 소비.

→ **override = AssetMajor 상가 섹션의 상가 부수토지 면적을 read-only→editable**. 엔진 축은 `residentialLandAreaOverride`(주택)이므로 **역산 저장** `mixedResidentialLandAreaOverride = round2(전체토지 − 상가입력)`. (계획 개선#9의 "주택칸만"은 화면에 주택 부수토지가 없어 부적합 → 상가칸 editable로 확정. 역산은 mirror onChange 1곳.)

> **⚠️ override는 양시점 적용 (Finding #1)**: 상가 부수토지 칸을 양도 기준시가란에서 수정해도, 엔진은 이 override를 **취득·양도 양시점**에 적용(같은 필지). 즉 상가칸 1회 수정이 → 상가 양도·취득 토지 std + 주택 양도·취득 토지 std(내부 분리) + 개산공제(§163⑥)에 모두 반영. UI 안내 문구에 "취득·양도 공통 부수토지 면적"임을 명시(사용자가 양도만 바뀐다고 오해 방지). 취득 기준시가란에는 별도 override 칸을 두지 않음(단일 값).

**분업**:
- **통합 면적 카드(①)**: 전용/공통 입력 → 연면적 파생. 부수토지는 **참고 표시(read-only)** 만 (자동 안분 결과 미리보기).
- **기준시가 계산란(AssetMajor 상가 섹션)**: 상가 부수토지 **editable**(override). 통합카드 자동값이 기본.

---

## 2. 통합 면적 카드 레이아웃 (섹션 ①)

`MixedUseAreaInputs` 전면 개편. 헤더 중립(slate), 내부 소그룹 tone 분리:

```
┌─ ① 면적·부수토지·지역 정보 (헤더 slate) ─────────────────┐
│                                                          │
│  ┌ 면적 (sky) ────────────────────────────────┐        │
│  │ 주택 전용면적 (㎡)   [DecimalInput]           │        │
│  │ 상가 전용면적 (㎡)   [DecimalInput]           │        │
│  │ 공통면적 (㎡)        [DecimalInput]           │        │
│  │ ┌ 자동 (bg-sky-100/60) ──────────────┐       │        │
│  │ │ 주택 연면적: 72.00㎡  상가: 48.00㎡  │       │        │
│  │ │ 주택연면적 비율: 60.00%             │       │        │
│  │ └────────────────────────────────────┘       │        │
│  │ 건물 정착면적 (㎡)   [DecimalInput]           │        │
│  │ 전체 토지 면적 (㎡)  [DecimalInput]           │        │
│  └──────────────────────────────────────────────┘        │
│  ※ 부수토지(주택/상가)는 아래 상가 기준시가란에서          │
│    자동 표시·수정 (dual display 회피, U2)                 │
│                                                          │
│  ┌ 지역 (rose) ──────────────────────────────┐          │
│  │ 수도권 지역  [ToggleCard rose]  ← ⑤ 흡수    │          │
│  └────────────────────────────────────────────┘          │
└──────────────────────────────────────────────────────────┘
```

- 헤더 중립(slate) → 내부 sky(면적)/rose(지역) 소그룹으로 tone 의미 분리(UI누락 #14).
- 파생 연면적·부수토지 박스는 `bg-sky-100/60 border border-sky-200`, read-only.
- 부수토지 박스에 "수정은 상가 기준시가란에서" 안내(override 위치 D1).

## 3. 위젯 매핑 + testid

| 라벨 | store 필드 | 위젯 | testid | hint |
|---|---|---|---|---|
| 주택 전용면적 | `residentialExclusiveArea` | `DecimalInput`+`parseDecimal` | `mixed-residential-exclusive` | "건축물대장 주택 전용면적" |
| 상가 전용면적 | `commercialExclusiveArea` | `DecimalInput` | `mixed-commercial-exclusive` | "건축물대장 상가(비주택) 전용면적" |
| 공통면적 | `commonArea` | `DecimalInput` | `mixed-common-area` | "공용면적 — 전용면적 비율로 안분" |
| 주택/상가 연면적 | (파생 read-only) | 표시 박스 | `mixed-derived-floor` | — |
| 건물 정착면적 | `buildingFootprintArea` | `DecimalInput` (현행) | 현행 | 현행 |
| 전체 토지 면적 | `mixedUseTotalLandArea` | `DecimalInput` (현행) | 현행 | 현행 |
| 수도권 지역 | `mixedIsMetropolitanArea` | `ToggleCard` rose (현행) | 현행 | 현행 |
| (부수토지는 통합카드에 미표시 — AssetMajor 상가 섹션 단일, U2) | | | | |
| **상가 부수토지 (override)** | `mixedResidentialLandAreaOverride`(역산) | `DecimalInput` editable (AssetMajor 상가 섹션) | `mixed-commercial-land-override` | "자동값 수정 시 주택분 자동 조정" |

- placeholder **숫자예시 금지·한국어**(UI누락 #19).
- override는 PHD OFF일 때만 노출(배타). PHD ON 시 숨김.

## 4. 연면적 파생 onChange (mirror — useEffect 금지)

```tsx
const onExclusiveChange = (patch: Partial<AssetForm>) => {
  const next = { ...asset, ...patch };
  const exR = parseDecimal(next.residentialExclusiveArea) ?? 0;
  const exC = parseDecimal(next.commercialExclusiveArea) ?? 0;
  const common = parseDecimal(next.commonArea) ?? 0;
  const exTotal = exR + exC;
  if (exTotal > 0) {   // gate: 둘 다 빈값이면 연면적 write 안 함 (R1 legacy 보존)
    const r = round2(exR + common * exR / exTotal);
    const c = round2(exTotal + common) - r;   // 잔액흡수
    onChange({ ...patch, residentialFloorArea: String(r), nonResidentialFloorArea: String(c) });
  } else {
    onChange(patch);  // 연면적 미변경
  }
};
```
- `round2`는 leaf `lib/tax-engine/mixed-use-derived-areas.ts` import(단일 소스).
- 같은 patch에 파생 동시 write → useEffect 미러링 없음 [[mirror-pattern]].

## 5. override 상가칸 onChange (역산, mirror)

```tsx
// AssetMajor 상가 섹션 — 상가 부수토지 editable
const onCommercialLandChange = (v: string) => {
  if (v.trim() === "") { onChange({ mixedResidentialLandAreaOverride: "" }); return; }
  const commercialInput = parseDecimal(v) ?? 0;
  const resid = round2(totalLand - commercialInput);   // 역산
  onChange({ mixedResidentialLandAreaOverride: String(resid) });
};
// 표시값: mixedResidentialLandAreaOverride 있으면 (전체−주택), 없으면 자동 commercialLandArea
const displayCommercialLand =
  asset.mixedResidentialLandAreaOverride.trim() !== ""
    ? round2(totalLand - parseDecimal(asset.mixedResidentialLandAreaOverride)!)
    : commercialLandArea;
```
- three-state: 빈값 판정 raw string(`trim()`), override=0(주택 0=상가 전체) 보존.
- **staleness clear (U1)**: 전체 토지면적(`mixedUseTotalLandArea`) onChange 시 `mixedResidentialLandAreaOverride` **클리어**(빈값→자동 복귀). 역산 저장값이 옛 전체토지 기준이라 stale 방지. 전용/공통 변경은 연면적 비율만 바뀌므로 override 유지(엔진설계 D2·계획 §4.3 staleness 정합).

## 6. 섹션 재넘버링

- ⑤ 수도권 인라인(`MixedUseSection.tsx:159-172`) 제거 → ① 통합 카드로 흡수.
- 기준시가 ②③·거주 ④ 그대로. ⑤ 소멸(①로 흡수)이라 번호 공백 없음.
- `MixedUseSection.tsx` 하드코딩 span `5` 제거.

## 7. UI 7 동기화 지점 (①②③⑤⑥⑦⑧)

| # | 지점 | 변경 |
|---|---|---|
| ① 폼 상태 | `calc-wizard-asset-gb.ts` | `residentialExclusiveArea`·`commercialExclusiveArea`·`commonArea`·`mixedResidentialLandAreaOverride` |
| ② initial | `MIXED_USE_DEFAULTS` | 4필드 `""` |
| ③ normalize | `migrateMixedUseFields` | 4필드 가드. **legacy 연면적 보존**(전용/공통 없어도 residentialFloorArea 유지) |
| ⑤ UI 위젯 | `MixedUseAreaInputs.tsx`(통합)·`MixedUseAssetMajorStdPrice.tsx`(상가 override) | 위 §2~§5 |
| ⑥ 사이드바 | `calc-wizard-store.ts:462-484` | leaf `computeDerivedAreas`(override 반영) 소비 |
| ⑦ 결과 카드 | `MixedUseResultCard.tsx` | 부수토지·NBL 배율초과 override 반영 표시 |
| ⑧ validation | `transfer-tax-validate-asset.ts` | 전용/공통 미입력→연면적 0 차단·override `0≤x≤전체토지`(three-state) |

## 8. tone·컴포넌트 규칙 (CLAUDE.md 준수)

- 통합 카드 헤더 중립 slate, 면적 소그룹 sky, 지역 소그룹 rose (tone 의미 분리).
- 신규 면적 필드 전부 `DecimalInput`+`parseDecimal`(CurrencyInput 금지 — 소수 ㎡).
- 자동 박스 `bg-sky-100/60`. override editable은 amber 힌트(수정 모드).
- 800줄: `MixedUseAreaInputs` ~180-200줄 예상, 안전. override는 AssetMajor 상가 섹션 내 소규모 추가.

## 9. E2E (`mixed-use-exclusive-common-area.spec.ts`)

1. 전용R·C·공통 입력 → `mixed-derived-floor` 파생 연면적 렌더 검증(72/48).
2. 상가 부수토지 override(`mixed-commercial-land-override`) 편집 → 주택 역산·상가 토지 std 변화 검증.
3. PHD ON 전환 → override 칸 숨김(배타) 검증.
4. [[feedback_browser_verify_with_playwright]] — 수동안내 금지. ToggleCard=`setChecked(true)` [[feedback_e2e_togglecard_setchecked]].
