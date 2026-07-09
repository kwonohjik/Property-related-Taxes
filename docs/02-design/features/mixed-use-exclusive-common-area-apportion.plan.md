# 겸용주택 면적 섹션 개편 — 전용/공통면적 안분 + 부수토지 override + 섹션 통합

> Status: **Plan (Do 미착수)** · 작성 2026-07-09 · 세목: 양도소득세(transfer) 겸용주택(mixed-use)
> 선행 완료: PR#541(자산-우선 전치)·#543(Case A)·#544(applyTimePoint). 관련 메모리 [[project_transfer_mixed_use_asset_major_stdprice]]

---

## 1. 목표 (사용자 요청 4항)

1. **섹션 통합**: ① 「면적 정보(건축물대장 기준)」 + ⑤ 「부수토지 배율 지역」을 **한 카드**로 통합하고, 이후 섹션 번호(②③④)를 재라벨링.
2. **전용/공통 → 연면적 자동계산**: 주택전용면적·상가전용면적·공통면적을 입력받아, **공통면적을 각 전용면적 비율로 안분**해 주택연면적·상가연면적을 자동 산출.
3. **토지 안분**: 전체 토지면적을 주택연면적·상가연면적 비율로 안분(주택/상가 부수토지). **※ 이미 구현되어 있음** (아래 §3).
4. **기준시가란 자동반영 + 수정가능**: 자동 안분한 주택연면적·상가연면적·부수토지 면적을 기준시가 계산란에 자동 반영하되 **사용자가 수정 가능**하게.

### 확정 결정 (2026-07-09 인터뷰)

| # | 결정 | 선택 |
|---|---|---|
| D1 | 연면적 입력 방식 | **전용+공통으로 완전 대체** — 주택/상가 연면적은 read-only 파생 표시, 직접입력 폐지 |
| D2 | 부수토지 "수정가능" 구현 | **non-PHD 경로 부수토지 수정 지원** (PHD는 `phdResidentialLandArea`로 이미 구현). 주택 부수토지 1칸 override, mirror 3중 패턴. 필드 전략(재사용 안A/신규 안B)은 🔴Q5 STEP5 확정 |
| D3 | 통합 섹션 배치 | **한 카드에 순서대로** — 전용/공통 → 파생 연면적 → 정착면적 → 전체토지 → (부수토지 자동/override) → 수도권 토글 |
| Q1 | 부수토지 override 합 처리 | **합=전체토지 강제 (방식 B)** — 한 칸 수정 시 나머지 = 전체토지 − 수정값 자동. 항상 주택+상가=전체토지 보장 |

---

## 2. 범위 경계 (⚠️ 최근 PR과 다름)

- PR#541~#544는 **UI-only**(엔진 무변경)였음. **본 작업은 엔진 변경 포함** — non-PHD 경로 부수토지 수정값을 세액 계산에 반영하려면 안분 로직(엔진 leaf 헬퍼로 추출, §5-A)과 엔진 입력 타입 변경이 필요.
- 따라서 **14 동기화 지점 전수** 대상 (①~⑭). "UI만 고치면 됨" 가정 금지.
- 전용/공통은 **면적 산출 보조 입력**일 뿐 세법상 독립 개념이 아님 → 엔진 입력에는 **연면적(파생 결과)만** 전달. 전용/공통 raw 3필드는 store에만 보관(엔진 미전달).
- **전용/공통 raw persist (N7)**: 전용/공통 3필드는 `AssetForm` 필드이므로 sessionStorage `partialize`(`calc-wizard-store.ts:370`, assets 포함)로 **자동 persist**됨 → 이력 재현 보존됨. "엔진 미전달 = 미보존"이 아님(엔진 전달만 제외, 저장은 됨).

---

## 3. 현행 사실 (file:line 실측)

### 3.1 면적 입력 — `MixedUseAreaInputs.tsx` (85줄, 섹션 ①)
- 4개 직접입력 필드 (모두 `AssetForm` string, `DecimalInput`):
  - 주택 연면적 → `residentialFloorArea` (`:37-38`)
  - 상가 연면적 → `nonResidentialFloorArea` (`:49-50`)
  - 건물 정착면적 → `buildingFootprintArea` (`:61-62`)
  - 전체 토지 면적 → `mixedUseTotalLandArea` (`:70-71`)
- 하단 "주택연면적 비율" 표시용 계산 (`:15-19`, store write 없음).

### 3.2 수도권 지역 — `MixedUseSection.tsx` (인라인, 섹션 ⑤)
- `MixedUseExpandedPanel` 내 인라인 렌더 (`:159-172`), 별도 컴포넌트 없음.
- "수도권 지역" `ToggleCard` tone="rose" → `mixedIsMetropolitanArea` (boolean, default `true`).

### 3.3 섹션 번호 — 하드코딩
- `MixedUseExpandedPanel`(`MixedUseSection.tsx:81-175`)이 `sectionNum` 리터럴 주입:
  ①면적(`:137`)·1-A용도변경(`:141`)·②③기준시가(`:145-153`)·④거주(`:156`)·⑤수도권(인라인 `5`, `:161`).
- 자동 넘버링 아님 → **재라벨링은 수동**.

### 3.4 부수토지 안분 — **이미 구현됨** + PHD 경로엔 override 존재 (⚠️ 사실 정정)
- 엔진 정본 `computeDerivedAreas` (`transfer-tax-mixed-use-helpers.ts:38-58`):
  - `residentialRatio = residentialFloorArea / (residentialFloorArea + nonResidentialFloorArea)`
  - `residentialLandArea = round2(totalLandArea × residentialRatio)`
  - `commercialLandArea = round2(totalLandArea − residentialLandArea)`
  - `residentialFootprintArea = round2(buildingFootprintArea × residentialRatio)`
- **동일 안분 산식이 5곳에 중복 재구현** (프리뷰·단가곱셈용, 모두 `parseFloat(toFixed(2))`):
  1. 엔진 `computeDerivedAreas` (`transfer-tax-mixed-use-helpers.ts:38-58`) — 정본
  2. `MixedUseAssetMajorStdPrice.tsx:40-48`
  3. `MixedUseLegacyStdPrice.tsx:40-48`
  4. `MixedUsePreHousingDisclosureSection.tsx:44-53`
  5. 사이드바 `calc-wizard-store.ts:462-484`
  6. **`transfer-pre1990-phd-bridge.ts:28-37 derivePhdResidentialLandArea`** (N2 신규 발견 — 컴포넌트 표시·API·validate 공용 헬퍼)
- **⚠️ 사실 정정 (Critical #1)**: 부수토지 override는 **"전혀 없음"이 아님**. **PHD(§164⑤ 환산) 경로엔 주택 부수토지 수동 override `phdResidentialLandArea`가 완전 구현**되어 있음 (실측):
  - store 정의 `calc-wizard-asset.ts:386` (주석 "겸용주택 PHD 주택부수토지 면적 수동 지정") · factory `calc-wizard-asset-factory.ts:136` · migrate `calc-wizard-asset-migrate.ts:322`
  - UI 입력 `MixedUsePreHousingDisclosureSection.tsx:114-132` ("주택부수토지 면적 (수정 가능)"), override-or-auto `:53` (`parseDecimal(phdResidentialLandArea) || autoLandArea`)
  - 엔진 도달 `transfer-tax-api.ts:207-208` (`phdResidentialLandArea>0 ? {landArea}`)
- **미구현 = non-PHD 경로**(일반 겸용 AssetMajor/Legacy)의 부수토지 수정. **단 `phdResidentialLandArea`는 취득 시점(PHD 역산용, `usePreHousingDisclosure` ON 배타) 필드**이고, 사용자 요청은 **양도시 기준시가 계산의 부수토지** 수정 → **시점이 다름**. 필드 재사용 vs 신규분리는 §4.1·STEP5에서 확정.

### 3.5 store / 타입 / API / validate
- 필드 타입: `calc-wizard-asset-gb.ts:147-173` (`GeneralBuildingFormSlice`).
- default·migrate: `calc-wizard-asset-mixed-use.ts` (`MIXED_USE_DEFAULTS`·`migrateMixedUseFields`).
- API 변환: `transfer-tax-api.ts:135-165` (면적 parseFloat 주입, `:229` `isMetropolitanArea`).
- validate: `transfer-tax-validate-asset.ts:318·385`.
- Zod: `lib/api/transfer-tax-schema-mixed-use.ts`.
- 엔진 입력 타입: `types/transfer-mixed-use.types.ts` (`MixedUseAssetInput`).

---

## 4. 데이터 모델 변경

### 4.1 신규 store 필드

**확정 (3개)** — 전용/공통 raw. 모두 `AssetForm` string, `DecimalInput`:

| 필드 | 용도 | 성격 |
|---|---|---|
| `residentialExclusiveArea` | 주택전용면적 | 1차 입력 |
| `commercialExclusiveArea` | 상가전용면적 | 1차 입력 |
| `commonArea` | 공통(공용)면적 | 1차 입력 |

**부수토지 override — ✅ Q5 확정 = 안 B (신규분리)** (STEP5 코드 실측):
- 신규 필드 **`mixedResidentialLandAreaOverride`**(주택 부수토지 수동 지정, 시점중립) 1개. **PHD OFF(일반 §97) 전용**. ⚠️ **취득·양도 양시점 공통 적용**(STEP6 실측 Finding #1: `computeAcqDerivedAreas`가 용도변경無 시 `derived` 반환 → override가 취득·양도 토지 std·개산공제·안분 전부에 반영, 같은 필지라 정당). "Transfer" 명명은 양도전용 오해 유발이라 시점중립명 채택.
- **재사용(안 A) 기각 근거** (실측): `phdResidentialLandArea`는 ①PHD 전용(OFF 시 엔진 미도달 — 일반 §97 경로 커버 불가) ②PHD 내부에서 **취득·양도 겸용 단일 `landArea`**(`transfer-tax-pre-housing-disclosure.ts:73-81` 3시점 fallback)라 이를 양도 override로 쓰면 **취득 역산(Sum_A) 동반 오염 = footgun**. → dual-truth 우려보다 **시점 오염이 더 치명적** → 별도 필드가 정답.
- **PHD ON일 땐 override 미노출**(배타): `usePreHousingDisclosure` ON이면 `phdResidentialLandArea`가 이미 주택 부수토지 담당. non-PHD override는 **PHD OFF 게이트**.
- 기본값은 두 필드 동일(양도시 주택연면적 비율 = `derived.residentialLandArea`)이나 경로·시점이 달라 별개.

**Q1=방식 B → override 1칸** (합=전체토지 강제): 엔진 축은 주택 부수토지(`residentialLandAreaOverride`) 단일 저장, 상가 = `전체토지 − 주택` 파생. **UI 노출 칸 = STEP12 확정 → 상가 부수토지 칸(AssetMajor 기준시가란)**: AssetMajor가 화면에 표시하는 부수토지가 상가뿐(주택=개별주택가격 일괄 미표시)이고, 사용자 요청 4("**기준시가 계산란**에 반영·수정")에 부합. 상가칸 editable → `residentialLandAreaOverride = round2(전체−상가입력)` 역산(mirror onChange 1곳). ⚠️ 개선#9 초안("주택칸만·역산제거")은 화면에 주택 부수토지가 없어 부적합 → 상가칸으로 정정(ui.design.md §1). 상세 UI [`.ui.design.md`].

- 기존 `residentialFloorArea`·`nonResidentialFloorArea`는 **store 유지**(엔진/API/사이드바가 읽음). 단 UI에서 직접입력 폐지 → 전용/공통 onChange가 **같은 patch에** 파생값을 함께 write (D1, mirror 정책 준수 §6).
- 3점 동기화: 타입 선언(`calc-wizard-asset-gb.ts`) + default `""`(`MIXED_USE_DEFAULTS`) + migrate 가드(`migrateMixedUseFields`). 전용/공통 3개 + (안 B 채택 시 override 1개).

### 4.2 연면적 파생 산식 (공통면적 안분)

```
exR = parseDecimal(residentialExclusiveArea) ?? 0
exC = parseDecimal(commercialExclusiveArea)  ?? 0
common = parseDecimal(commonArea) ?? 0
exTotal = exR + exC

residentialFloorArea = exTotal>0 ? round2(exR + common × exR/exTotal) : 0
nonResidentialFloorArea = exTotal>0 ? round2(exC + common × exC/exTotal) : 0
```
- **잔액 흡수**(floor 정책 [[feedback_floor_residual_absorption]]): `nonResidentialFloorArea = round2(exTotal + common) − residentialFloorArea`로 두 연면적 합 = 전용합+공통 보장. round2 이중오차 방지.
- **⚠️ 세법 근거 확인 필요 (정책위반 #11, `feedback_tax_calculation_principle`)**: 현행 hint(`MixedUseAreaInputs.tsx:33-34`)는 주택 연면적 = **개별주택가격확인서의 '산정면적'**. 파생 연면적(전용+공통안분)이 이 **'산정면적' 정의와 일치하는지 미검증** — 불일치 시 부수토지 안분·기준시가 전체가 잘못된 연면적 위에 계산됨. **STEP5 엔진설계 전 KoreanLaw/집행기준으로 '산정면적' 정의 실측 후 단정**. 현재는 "확인 필요" 상태. (공통면적을 전용비율로 안분하는 것이 산정면적 산출 방식과 같은지가 핵심.)

### 4.3 부수토지 override 반영 (엔진) — Q1=방식 B

- `MixedUseAssetInput`에 optional override 필드 **1개만** 추가 (안 B 채택 시 가칭 `mixedResidentialLandArea` — §4.1과 동일명; 안 A면 기존 `landArea` 경로 재사용). ※ 실제 필드명은 🔴Q5 STEP5 확정.
- `computeDerivedAreas` 수정: override 존재 시 주택 우선, 상가는 항상 `전체 − 주택`.
  ```
  residentialLandArea = override_R ?? round2(totalLandArea × ratio)   // ?? 로 0 보존
  commercialLandArea  = round2(totalLandArea − residentialLandArea)   // 항상 합=전체토지
  ```
- **합=전체토지 항상 성립** → 경고배지 불필요. 자동 안분 fallback 금지 정책 [[feedback_no_silent_apportion_fallback]] 위배 아님 — override는 명시적 사용자 입력, 미입력은 기존 안분 유지(신규 강제 아님).

**⚠️ three-state 빈값 판정 (정책위반 #7·#8, `feedback_three_state_optional_mode_toggle` + [[mirror-pattern]] 3중)** — 엔진 `??`와 UI/API의 빈값 처리를 통일:
- override=0(주택부수토지 0)은 **적법 입력** → `||`/`parseFloat(x)||0`은 0을 빈값과 붕괴시켜 금지.
- **3중 패턴 전부 raw string 빈값 판정으로 통일**:
  - UI display: `overrideStr.trim() !== "" ? parseDecimal(overrideStr) : auto`
  - API 변환(④): `override.trim() === "" ? undefined : parseDecimal(override)` (빈값→undefined, 0→0)
  - 엔진: `override_R ?? auto` (undefined→auto, 0→0 보존)
- 기존 PHD `landArea` 경로(`transfer-tax-api.ts:207` `parseFloat(x)>0`)는 0을 배제 — 안 A 재사용 시 이 경로도 three-state로 정정 필요.

**⚠️ override 엔진 도달 경로 단일화 (오류 #10)**: override 도달이 두 갈래 — non-PHD=`computeDerivedAreas`(신규), PHD=`preHousingDisclosure.landArea`(`transfer-tax-api.ts:207-208`, 기존). **값 원천은 단일 store 필드**로 유지하되 경로가 갈리므로, STEP5에서 두 경로가 같은 override를 이중 적용하지 않도록 배타(`usePreHousingDisclosure` 게이트) 확인.

**스코프 경계 (누락 #13, Finding #1 정정)**: override는 **non-PHD·용도변경無 겸용**에 한정하되, 그 안에서 **취득·양도 양시점 공통 적용**(`computeAcqDerivedAreas`가 `derived` 반환 → 취득 토지 std·개산공제·안분 + 양도 토지 std·안분 전부). ⚠️ **용도변경(partialUsageChange) 케이스**는 `computeAcqDerivedAreas`가 별도 취득 면적(`helpers:270·387`, `housRatio × totalLandArea`) 사용 → 그 경로에선 취득에 override 미반영(양도 `derived`만). 실무상 asset-major=용도변경無라 이 분기 미도달.

**staleness (모순 #15)**: override는 절대㎡ 저장 → 전체토지·전용/공통을 나중에 바꾸면 override는 stale. **전체 토지면적 onChange 시 override 클리어**(auto로 복귀). 전용/공통 변경은 연면적→비율만 바뀌므로 override 유지 여부 STEP5 확정.

- **가드**: `0 ≤ override_R ≤ totalLandArea` (음수·초과 시 validate 차단, §8).

---

## 5. 14 동기화 지점 매핑

신규 필드 = 전용/공통 3개 + (안 B 채택 시 override 1개). override는 안 A(재사용)면 ①②③⑫⑬⑭ 신규 없음(기존 `phdResidentialLandArea` 경로 확장).

| # | 지점 | 변경 |
|---|---|---|
| ① 폼 상태 | `calc-wizard-asset-gb.ts` | 전용/공통 3필드 (+안B: override 1) 타입 |
| ② initial | `MIXED_USE_DEFAULTS` | 3(+1)필드 `""` |
| ③ normalize | `migrateMixedUseFields` | 3(+1)필드 가드 |
| ④ API 변환 | `transfer-tax-api.ts:135-165` | override three-state 주입 `trim===""?undefined:parseDecimal` (전용/공통은 **미전달**) |
| ⑤ UI 위젯 | `MixedUseAreaInputs.tsx` 전면개편 + 수도권 흡수 | 통합 카드·파생 표시·**주택 부수토지 override 1칸**(상가 read-only) |
| ⑥ 사이드바 | `calc-wizard-store.ts:462-484` | override 반영 — **leaf 헬퍼 소비**(§5-A) |
| ⑦ 결과 카드 | `MixedUseResultCard.tsx` | 부수토지 표시 + **NBL §168의12 배율초과 파급**(누락 #12): `:326-340` "④ 비사업용토지(주택부수토지 배율초과)", `excessArea = 주택부수토지 − 정착×배율`(types `:245`) → override가 NBL 세액까지 파급, 결과 anchor 검증 |
| ⑧ validation | `transfer-tax-validate-asset.ts` | 전용/공통 미입력→연면적 0 차단·override `0≤x≤전체토지` 가드(three-state) + **error-format 라벨**(`transfer-tax-error-format.ts:68-69`, 누락 #17) |
| ⑨⑩ Zod enum | `transfer-tax-schema-mixed-use.ts` | (enum 아님, 입력객체) |
| ⑪ 자산 fallback | — | 해당 없음 |
| ⑫ Zod 입력객체 | `transfer-tax-schema-mixed-use.ts` | (안B) override 1필드 optional number (전용/공통 미포함) |
| ⑬ body spread | `callTransferTaxAPI` body | (안B) override 1필드 |
| ⑭ Route 매핑 | route handler | (안B) override 1필드 엔진 input 매핑 |

### §5-A. 안분 로직 leaf 헬퍼 추출 — **필수** (개선 #5·#6, 정책위반 #6)

- **현행 5곳 중복**(§3.4): 엔진 `computeDerivedAreas` + UI 3곳 + 사이드바 + `derivePhdResidentialLandArea`. override 분기 추가 시 **5곳 갈라짐 = dual-truth 드리프트** [[feedback_ui_engine_dual_truth_avoidance]].
- **Q4 실측 확정 (번들 오염)**: `computeDerivedAreas`는 자체 순수(round2+asset 필드만)이나 **소속 파일 `transfer-tax-mixed-use-helpers.ts:8-26`이 `non-business-land/urban-area`·`transfer-tax-pre-housing-disclosure`·`transfer-tax-mixed-use-fourpart`·`calculateProgressiveTax` import** → UI(`use client`)가 import하면 엔진 모듈 그래프 전체가 client 번들 유입. **현재 UI import 0건 → 신규 오염**. `round2`는 미export.
- **결정**: leaf 순수 모듈 **`lib/tax-engine/mixed-use-derived-areas.ts` 신규**로 `round2` + `computeDerivedAreas`(override 파라미터 수용) 추출 → helpers·UI 3곳·사이드바·bridge **5곳 모두 이 leaf import** [[single-source-engine-helper]]. `feedback_area_rounding_consistency`(toFixed(2) 반올림 일치)도 단일화로 자동 보장.

---

## 6. mirror-pattern 준수 (D1·D2 핵심)

- **연면적 파생(D1)**: `useEffect → store` 미러링 **금지**. 전용/공통 `onChange` 핸들러가 파생 연면적을 **같은 patch 객체**에 계산해 함께 `onChange({residentialExclusiveArea: v, residentialFloorArea: derivedR, nonResidentialFloorArea: derivedC})` write. → onChange 시점 계산, 무한루프 없음 [[mirror-pattern]].
- **단일 writer 불변식 (모순 fork 판정)**: `residentialFloorArea`·`nonResidentialFloorArea` writer는 현재 `MixedUseAreaInputs` **단일 지점**(grep 확인). 개편 후에도 파생 write를 **전용/공통 핸들러 한 곳으로 유지** → dual-truth 없음. 다른 컴포넌트에서 연면적을 write하지 않음을 Do 시 grep 재확인.
- **부수토지 override(D2)**: display fallback + API/validate 동일 fallback의 **3중 패턴**. store엔 override raw만 저장, auto는 파생.
  - ⚠️ fallback은 `override || auto`가 **아니라** raw string 빈값 판정(`overrideStr.trim() !== "" ? … : auto`) — override=0 보존 (§4.3 three-state).
  - UI는 **주택 부수토지 override 1칸만** editable, 상가는 read-only 파생(`전체−주택`). 상가칸 역산 write 없음 → writer 단순.

---

## 7. UI 레이아웃 (통합 카드, D3)

`MixedUseAreaInputs`를 통합 오케스트레이터로 확장 (또는 `MixedUseAreaAndRegionInputs`로 개명). 순서:

```
① 면적·부수토지·지역 정보 (통합 카드, 헤더 중립 slate — UI누락 #14)
├─ 주택 전용면적 (㎡)        [DecimalInput]  ← 1차 입력
├─ 상가 전용면적 (㎡)        [DecimalInput]  ← 1차 입력
├─ 공통면적 (㎡)             [DecimalInput]  ← 1차 입력
├─ [자동] 주택 연면적: NN.NN㎡ / 상가 연면적: NN.NN㎡ (파생 박스 bg-sky-100/60)
├─ 건물 정착면적 (㎡)        [DecimalInput]  ← 현행 유지 (배율초과 판정용, 안분 대상 아님)
├─ 전체 토지 면적 (㎡)       [DecimalInput]  ← 현행 유지
├─ [자동] 주택 부수토지 / 상가 부수토지 — override 1칸 editable (엔진 축=주택 residential). ⚠️ 어느 칸을 노출할지 STEP12 확정: AssetMajor는 현재 **상가 부수토지**를 표시(주택=개별주택가격 일괄) → 상가칸 editable(→주택 역산) vs 주택칸 신규표시 중 실제 위젯 보고 결정 (엔진설계 D1)
└─ ┌ 소그룹: 지역 정보 (rose) ┐
    └ 수도권 지역 [ToggleCard rose]  ← ⑤에서 이동
```
- **tone 충돌 회피 (UI누락 #14)**: 통합 카드 헤더는 **중립(slate)**. 면적=sky 파생박스, 지역=rose 소그룹으로 **시각 분리** — sky 카드 안에 rose 토글 직접 중첩(의미 혼재) 금지. CLAUDE.md tone 의미규칙(sky=면적/rose=지역) 준수.
- **위젯 규칙 (UI누락 #19)**: 신규 면적 필드는 전부 `DecimalInput`+`parseDecimal`(면적㎡ — CurrencyInput 금지). placeholder **숫자예시 금지·한국어 설명**만(예: "주택 전용면적"), 형식 안내는 FieldCard `hint`. 파생·override 박스는 `bg-sky-100/60 border border-sky-200`.
- override 입력은 "자동값 수정" **접기 토글**(과밀 방지, Q3 초안) — 주택 부수토지 1칸만. 세부 UI 설계 단계.
- 섹션 재넘버링: ⑤ 제거 → 기준시가 ②③·거주 ④는 그대로(⑤가 ①로 흡수되므로 번호 공백 없음). `MixedUseSection.tsx` 하드코딩 span 제거.
- **정착면적·수도권은 전용/공통 안분과 무관** — 배치만 이동, 로직 불변 (Q2 확인).

---

## 8. 케이스 매트릭스 (anchor 대상)

| # | 전용R | 전용C | 공통 | 전체토지 | override | 기대 |
|---|---|---|---|---|---|---|
| C1 | 60 | 40 | 20 | — | — | 연면적 R=72, C=48 (공통20을 6:4) |
| C2 | 60 | 40 | 0 | 200 | — | 부수토지 R=120, C=80 (기존 안분 동일) |
| C3 | 60 | 40 | 20 | 200 | R=100 | 부수토지 R=100(override), C=100(=200−100). 합=전체토지 |
| C4 | 0 | 0 | 0 | — | — | 연면적 0, 안분 0 (early return) |
| C5 | 100 | 0 | 30 | 200 | — | 순수주택 취급? (상가0) — 겸용 판정과 상호작용 확인 |
| C6 | 60 | 40 | 20 | 200 | R=0 | override=0 적법(주택부수토지 0) → 빈값과 구분(three-state). 상가=200 |
| C7 | 60 | 40 | 0 | 300 | R=250 | override→NBL §168의12 배율초과 파급: `excessArea = 250 − 정착×배율` 재계산 (누락 #12) |
| P1 | 60 | 40 | 0 | 200 | (PHD ON) | **override 미노출** — `phdResidentialLandArea`가 3시점 담당(배타). 엔진설계 §2 |
| R1 | (legacy 이력) | | | 200 | — | migrate 전용/공통 `""` → 파생 gate로 연면적 보존, 엔진 입력 불변(회귀 0) |

- **회귀 anchor**: 기존 케이스(직접 연면적 입력)는 sessionStorage/DB 이력에 `residentialFloorArea`만 있고 전용/공통 없음 → migrate가 전용/공통 `""`로 채움. **이때 파생이 연면적을 0으로 덮으면 기존 이력 파손** → migrate 시 "전용/공통 모두 빈값이면 파생 skip, 기존 연면적 보존" 규칙 필수 (§9 R1).

---

## 9. 리스크

- **R1 (High) 기존 이력 회귀**: 전용/공통 없는 legacy 이력. 파생 로직이 `exTotal===0`일 때 연면적을 덮어쓰면 안 됨 → **전용/공통 둘 다 빈값이면 연면적 write 자체를 하지 않음**(파생 gate). anchor로 legacy 페이로드 불변 검증.
- **R2 (High→해소경로) dual-truth 드리프트**: 안분 5곳(§3.4) + override 분기. **§5-A leaf 헬퍼 `mixed-use-derived-areas.ts` 추출 필수**로 5곳 단일화. Q4(번들 오염) 실측 확정 → leaf 모듈이 유일 해법.
- **R3 (Critical→해소경로) 기존 `phdResidentialLandArea` dual-truth**: 신규 override 필드가 기존 PHD override와 같은 "주택 부수토지" → §4.1 안A/B 중 시점 실측으로 확정. STEP5 결정 전까지 Critical.
- ~~**R3-old override 합≠전체토지**~~: **해소** — Q1=방식 B. 상가=`전체−주택` 파생.
- **R4 (Med) three-state 붕괴**: override=0이 `||`/`||0`로 빈값과 붕괴 → §4.3 raw string 판정 3중 통일로 방지. anchor C6.
- **R5 (Low) Case A/용도변경 경로**: 용도변경(legacy)은 `partialChangeAcqResidentialArea` 별도 필드. 전용/공통 개편이 이 경로와 충돌 없는지 확인(면적 원천=양도시 연면적 공유, override는 non-PHD 스코프 한정 §4.3).

---

## 10. Pre-Do anchor 계획 (Do 전 필수)

1. `mixed-use-exclusive-common-baseline.anchor.test.ts` — legacy 페이로드(전용/공통 없음)가 개편 후에도 동일 엔진 입력 산출 (R1 검증) + leaf 리팩터 무동작(기존 겸용 anchor 전량 통과).
2. `mixed-use-derived-areas.test.ts` — leaf `computeDerivedAreas`: C2(override 없음)=현행값, C3(override)=override 우선, **C6(override=0)=0 보존**(three-state), C4(early return)·C5(상가0).
3. 연면적 파생 UI anchor(RTL) — C1 공통면적 안분 정확값(72/48).
4. **override 양시점 파급 anchor** — C7 override→취득 토지 std·개산공제 + 양도 토지/건물 안분 + 상가 std + NBL `excessArea`(`MixedUseResultCard.tsx:326-340`) 전부 검증 (Finding #1·누락 #12).
5. **E2E (UI누락 #16)**: `mixed-use-exclusive-common-area.spec.ts` — 전용/공통 입력→파생 연면적 렌더 + override 편집→부수토지 재계산. 신규 필드 testid 명명(`residentialExclusiveArea` 등). [[feedback_browser_verify_with_playwright]] (수동안내 금지).

(엔진설계 §6과 파일명·케이스 정합: anchor 2 = `mixed-use-derived-areas.test.ts`, C1 연면적은 UI RTL.)

→ anchor 우선 작성·실패 확보 후 Do 진입 [[feedback_pre_anchor_verification]].

---

## 11. 미해결 질문 (Do 전 확정)

- ~~**Q1**~~: **확정 — 방식 B(합=전체토지 강제)**. override 주택 1칸, 상가는 `전체−주택` read-only 파생. §4.3.
- ~~**Q4**~~: **확정 — `computeDerivedAreas`는 순수하나 소속 파일이 무거운 엔진 import → UI 직접 import 시 번들 오염**. leaf 모듈 `lib/tax-engine/mixed-use-derived-areas.ts`로 `round2`+`computeDerivedAreas` 추출 후 공유(§5-A). **직접 import 불가, leaf 추출이 답.**
- **Q2**: 정착면적도 전용/공통 안분? → **아니오**(현행 직접입력 유지, 요청에 없음). 확인만.
- **Q3**: override 입력 항상 노출 vs 접기? (초안: 접기 — 과밀 방지) → UI 설계 단계 확정.
- ~~**🔴 Q5**~~: **✅ 확정 = 안 B(신규분리)** — `mixedResidentialLandAreaOverride`(시점중립), PHD OFF 전용, 취득·양도 양시점 적용. 재사용은 취득 역산 오염 footgun이라 기각. §4.1.
- ~~**🔴 Q6**~~: **✅ 확정 = 세법 계산 무관** — 겸용 주택/상가 구분 근거 소득세법 시행령 §160①("주택 외 부분은 주택으로 보지 않음")·부수토지 배율 §164⑫ 확립. "공통면적 전용비율 안분"은 세법 명시 조문 없는 **면적 산출 실무**(개별주택가격 '산정면적' 정의는 부동산 가격공시법·국토부 산정지침 소관). **엔진은 연면적만 사용 → 전용+공통→연면적 파생은 UI 편의**. 파생 연면적이 실제 산정면적과 다르면 사용자가 전용/공통 조정으로 재구성(hint 명시). §4.2.

---

## 12. 예상 파일 변경

| 파일 | 변경 |
|---|---|
| **`lib/tax-engine/mixed-use-derived-areas.ts`** | **신규 leaf 모듈** — `round2`+`computeDerivedAreas`(override 파라미터). §5-A 필수 |
| `calc-wizard-asset-gb.ts` | 전용/공통 3필드 (+안B: override 1) 타입 |
| `calc-wizard-asset-mixed-use.ts` | default·migrate 3(+1)필드 |
| `MixedUseAreaInputs.tsx` | 전면 개편 (전용/공통·파생·주택 override 1칸·수도권 흡수). ~180-200줄 예상, **800 안전(분할 불요)** |
| `MixedUseSection.tsx` | ⑤ 인라인 제거, sectionNum 재조정 |
| `transfer-tax-mixed-use-helpers.ts` | leaf `computeDerivedAreas` 재사용으로 전환 |
| `MixedUseAssetMajorStdPrice.tsx`·`MixedUseLegacyStdPrice.tsx`·`MixedUsePreHousingDisclosureSection.tsx` | 자체 안분 → leaf import (5곳 단일화) |
| `transfer-pre1990-phd-bridge.ts` | `derivePhdResidentialLandArea` → leaf 소비 |
| `types/transfer-mixed-use.types.ts` | (안B) `MixedUseAssetInput` override 1필드 |
| `transfer-tax-api.ts` | override three-state 주입 |
| `transfer-tax-schema-mixed-use.ts` | (안B) Zod override 1필드 |
| `transfer-tax-validate-asset.ts` | 전용/공통·override 검증 + error-format 라벨 |
| `calc-wizard-store.ts` | 사이드바 안분 leaf 소비 |
| `MixedUseResultCard.tsx` | 부수토지·NBL 배율초과 표시 확인 |
| 테스트·E2E | anchor 5종 + `mixed-use-exclusive-common-area.spec.ts` |

---

## 다음 단계 제안

이 계획서 확정 후 **STEP 5(엔진설계 `.engine.design.md`)** — 여기서 🔴 **Q5(필드 전략 안A/B)·Q6('산정면적' 세법 검증)** 를 KoreanLaw/코드 실측으로 확정 → STEP 12(UI설계) → Pre-Do anchor 5종 → Do.

### 자가검토 정정 이력 (STEP 1~4, plan-design-self-review-loop)
- 4-way fork 병렬 검토 → **20건 병합** (Critical 3·High 7·Medium 4·Low 4 상당).
- **Critical**: ①기존 `phdResidentialLandArea` override 미발견(dual-truth) ②필드 수 잔재 ③파일 끝 아티팩트 태그.
- **High**: 5번째 안분 지점·번들 오염(leaf 추출)·헬퍼 필수격상·three-state 붕괴·상가칸 단순화·경로 이원화.
- 전 항목 §2~§12 반영. 미해결은 Q5·Q6(STEP5 실측 확정).
