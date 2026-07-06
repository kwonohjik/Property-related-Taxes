# PHD 3시점 건물기준시가 일괄 계산 — Phase 2: 겸용주택(층별 구조·용도 상이) 배선

> 선행: `phd-building-stdprice-3point-batch-calculator.plan.md`(Phase 1, PR#520·#521 배포 완료).
> 트리거: 사용자 질문 "층별 구조·용도가 다른 경우에는 어떻게 계산해?" → 범위 확정 **"겸용주택(mixed-use) 일괄 배선 전체"**.
> 법령: 소득세법 시행령 §164⑤(PHD 3시점 환산) + 국세청 건물기준시가 고시(복합건물 부분별 산정 합산).

> ## ✅ 확정 범위 (2026-07-07, 재점검 3회차 F8 대응) — **Option B: 부분 자동**
> 배치가 자동 산출: **housing(주택분) 3시점** + **양도시 commercial(상가분)**. 이 구간은 용도 불변 → 정확·tax 리스크 0.
> 배치 미산출(수동 유지): **Case A 취득시·최초공시 상가건물**(당시 주택 용도 = F8 세법 미확정) → **필드별 버튼 유지**(회귀 0).
> housing은 **compositeParts로 층별 구조·용도 상이 지원**(사용자 원 질문 "층별 상이" = housing 복합으로 충족). Option A(6필드 완전 자동)는 tax-senior가 C4 규칙 확정 시 후속 Phase 2.1.
> 이 배너가 아래 모든 §를 지배 — Option A 전용 서술(acq/first commercial 자동 산출)은 **Phase 2.1 조건부**로 읽는다.

---

## 0. 문제 정의

Phase 1 일괄 모달은 **구조·용도·연면적을 1세트만** 입력받아 건물 전체를 **단일 구조·용도**로 가정한다(`PhdBuildingStdPriceModalButton` — `valuation` 단일 point). 따라서:

1. **층별 구조·용도가 다른 건물**(예: 1층 상가 철골조·근린생활시설 / 2~3층 주택 철근콘크리트조)은 정확히 산출 불가 — 국세청 산정은 **부분별 독립 산정 후 합산**이 정답.
2. **겸용주택**(`MixedUsePreHousingDisclosureSection`)은 아직 `enableBatchCalc` **미주입** → PR#519 필드별 버튼을 그대로 사용 중(Phase 1 §3.3 게이팅으로 회귀 0 유지). 겸용은 **주택분/상가분 건물기준시가가 별도 필드**로 갈리므로 Phase 1 단일-필드 apply와 상이하다.

Phase 2 = 위 둘을 해결한다: **부분(층/구역) 목록 입력 + 주택분/상가분 카테고리 산출 + 겸용주택 3시점 위젯 배선**.

---

## 1. 목표 · 성공 기준

- G1. 일괄 모달에서 **부분(층/구역)을 N개 입력**(구조·용도·연면적 각각) → 각 시점 건물기준시가 = Σ(부분별 산정). ← 엔진 `compositeParts`.
- G2. 각 부분에 **주택/상가 카테고리** 태그 → **주택분 3시점 + 상가분 양도시** 분리 산출(Option B).
- G3. `MixedUsePreHousingDisclosureSection`에 `enableBatchCalc` 주입 → 일괄 버튼 1개로 주택분 3시점·양도 상가분을 산출·적용. PR#519 필드별 버튼은 **배치가 채우는 필드만** 숨김(취득/최초공시 상가건물 버튼은 존치, F9).
- G4. **Phase 1(단독) 회귀 0** — `enableCommercial` 미설정 시 모달 UX·산출·apply가 현행과 완전 동일.

**검증 기준(강제)**: 아래 §7 anchor를 Do 전에 확보(실패 확인)·동결. "현행 일치 예상"·미확인 인용 금지. ([[feedback_pre_anchor_verification]] · [[feedback_ui_input_path_enumeration]])

---

## 2. 검증된 엔진 사실 (file:line 실측 — 2026-07-07)

| # | 사실 | 근거 |
|---|---|---|
| E1 | valuation(상증) 복합: `compositeParts[]` 활성 시 `calcCompositeValuation` 호출 → 결과는 **`compositeTotal`** 반환(단일 point의 `.valuation.standardPrice` **아님**). | `building-standard-price.ts:263-264`, `:116-118` |
| E2 | 복합 위치지수 공시지가는 **`input.valuation.landPricePerM2` 단일값**(다필지면 `landParcels` 가중평균). 부분마다 다르지 않음 — 시점별 1개. | `:92-98` |
| E3 | valuation 복합은 `input.floorArea` 무시(부분별 `floorArea` 합산). 단, 비복합 진입 가드(`:252`)를 통과하려면 `compositeParts.length>0`이면 `floorArea` 없어도 OK(`hasComposite`). | `:65-66`, `:252` |
| E4 | 양도(transfer) 복합(≤2000 acqBase 경로에서만 필요): **부분별 `acqUsageNo` 필수**(`:161` 미입력=throw), **동일연도 양도 미지원**(`:324` throw), ≤2000은 **단일 산정기준율 그룹만**(`:200` 그룹 상이=throw). | `:322-327`, `:159-163`, `:196-202` |
| E5 | 단일 point 경로(현행 Phase 1)는 그대로 유효 — 부분 1개·카테고리 단일이면 기존 `plainStdPrice`/`acquisitionStdPrice` 사용 가능. | `phd-building-std-batch.ts:57-82` |
| E6 | 현재 `applyBatch`는 housing만 라우팅(`onBuildingStdPriceAt{Acq,First,Transfer}Change`). commercial 콜백 미사용. | `ThreePointStandardPriceInput.tsx:643-647` |
| E7 | Case A(splitMode)에서 PointBlock은 **주택건물+상가건물 2필드** 렌더(`:483-536`), commercial 콜백은 이미 존재(`onCommercialBuildingStdPriceChange`). Case A는 `hideTransferColumn=true`(양도시는 `MixedUseStandardPriceInputs` 담당). | `:483-536`, `:707` |
| E8 | 겸용 commercial 콜백은 시점별로 다른 필드에 매핑(acq→`mixedAcqCommercialBuildingPrice`, first→`phdCommercialBuildingStdPriceAtFirst`, transfer→`mixedTransferCommercialBuildingPrice`). 배치는 **같은 콜백을 호출**하면 됨(필드 신설 X). | `MixedUsePreHousingDisclosureSection.tsx:247-262` |
| E9 | **양도시 필드 공유(재점검 확정)**: Case A에서 양도시 입력은 `MixedUseStandardPriceInputs`가 표시하지만 store 필드는 주택건물=`phdBuildingStdPriceAtTransfer`(`:153`)·상가건물=`mixedTransferCommercialBuildingPrice`(`:172`) — **PHD transfer 콜백이 쓰는 바로 그 필드**. → 배치가 3시점 전부 채워도 올바른 필드에 도달(hideTransfercolumn render와 무관). | `MixedUseStandardPriceInputs.tsx:153,172` |
| E10 | **취득시 담당 컴포넌트(재점검 확정)**: Case A에서 `MixedUseStandardPriceInputs` 취득시 블록은 `!isCaseA`로 **숨김** — 취득시 4부분은 **PHD ① 블록 전담**. commercial 콜백 3종(`onCommercialBuildingStdPriceAt{Acq,First,Transfer}Change`)은 props에 실재(`:25,30,36`). | `MixedUseStandardPriceInputs.tsx:282-283`, `ThreePointStandardPriceInput.tsx:25,30,36` |
| E11 | Case A split은 **양도시(현재) 면적 기준**("양도시 면적 기준 분리" 라벨) → 3시점 공통 building 구성 1개, 연도·공시지가만 상이. 위치지수 공시지가는 카테고리 무관(개별공시지가 = 필지 단위, 시점당 1개). | `ThreePointStandardPriceInput.tsx:624-631` |
| E12 | **6필드 엔진 소비 실측(재점검 확정)**: acq-H→`buildingStdPriceAtAcquisition`(`:195`)·first-H→`buildingStdPriceAtFirstDisclosure`(`:198`)·transfer-H→`buildingStdPriceAtTransfer`(`:204`). acq-C→`commercialBuildingStdPriceAtAcq`(`:217`, fallback `mixedAcqCommercialBuildingPrice`)·**first-C→`commercialBuildingStdPriceAtFirstDisclosure`(`:220`)**·transfer-C→`mixedTransferCommercialBuildingPrice`(mixed split). | `transfer-tax-api.ts:195-223` |
| E13 | **Case A 4부분 활성 게이트**: `(acq-C \|\| mixedAcq-C) > 0 AND first-C > 0`일 때만 4부분 안분 활성(`:213-215`). first-C는 **Case A 전용 필드**("일반 겸용주택 흐름에 없음" `:212`). validate도 Case A(house_to_commercial + first<용도변경)에서만 두 필드 필수(`validate-asset.ts:344-360`). → **배치가 이 게이트 2필드를 정확히 채운다**(설계 정당성). | `transfer-tax-api.ts:210-223`, `validate-asset.ts:344-360` |
| E14 | **엔진은 상가건물 std를 직접 합산(재점검 확정)**: `commercialBuildingStdAtAcq = commercialBuildingStdPriceAtAcq!`(`:161`) 직접 사용, `sumAtAcq4 = housingLand + housingBuilding + commercialLand + commercialBuilding`(`:175`) 단순 합. **내부 안분·용도 재판정 없음** → 배치가 각 시점 상가건물 std **최종값을 정확히** 산출해야 함. UI 힌트: "양도시 상가 부분 면적의 **당시** 건물 기준시가"(`ThreePointStandardPriceInput:488,514`). | `transfer-tax-pre-housing-disclosure.ts:160-175` |

> **결론**: 엔진은 복합·카테고리 분리를 이미 지원한다. Phase 2는 **엔진 변경 없음** — (a) 배치 헬퍼가 부분 목록을 받아 카테고리별로 엔진을 호출, (b) 모달 UI가 부분·카테고리를 입력받고 결과를 카테고리별로 표시, (c) `applyBatch`가 카테고리별로 라우팅, (d) 겸용 섹션에 `enableBatchCalc` 주입. **14 동기화 지점 신규 작업 없음** — 산출값은 기존 필드(`phdBuildingStdPriceAt*`·`mixedAcqCommercialBuildingPrice` 등, 이미 14지점 배선 완료)로 흘러들어간다.

---

## 3. 설계

### 3.1 배치 헬퍼 — 카테고리별 복합 산출 (`lib/calc/phd-building-std-batch.ts`)

입력 타입을 부분 목록 + 카테고리로 확장. **부분 1개·전부 housing이면 현행 단일-point 경로로 폴백**(E5, Phase 1 산출값 불변 보장).

```ts
export type PhdPartCategory = "housing" | "commercial";

export interface PhdBatchPart {
  structureKey: string;
  usageNo: number;        // 해당 시점 용도(옵션연도 기준). ≤2000 acqBase 다부분은 acqUsageNo 필요(§3.5 제약)
  floorArea: number;
  category: PhdPartCategory;
}

export interface PhdBatchBuilding {
  builtYear: number;
  parts: PhdBatchPart[];   // ← 신규. Phase 1 단일 필드(structureKey/usageNo/floorArea)는 parts[0]로 흡수
}

/** 시점별 카테고리 소계 — 산출된 카테고리만 채워짐(원 정수). */
export interface PhdPointResult { housing?: number; commercial?: number; }

export interface PhdBatchResult {
  acquisition?: PhdPointResult;
  firstDisclosure?: PhdPointResult;
  transfer?: PhdPointResult;
  unsupported: { point: PointKey; category: PhdPartCategory; reason: string }[];
}
```

**시점×카테고리 산출 규칙**(각 시점 독립 — Phase 1 원칙 유지):

- `parts_C` = 그 카테고리의 부분들. 비어 있으면 그 카테고리 skip.
- **≥2001 시점(취득/최초공시/양도 공통)**: valuation 모드.
  - `parts_C.length === 1` → 기존 `plainStdPrice`(단일 point, `.valuation.standardPrice`). ← Phase 1 폴백.
  - `parts_C.length >= 2` → `compositeParts: parts_C` + `valuation.landPricePerM2 = 시점 공시지가` → 결과 **`compositeTotal`**(E1).
- **취득 ≤2000**: acqBase(transfer 콜, `transferYear=2001`).
  - 단일 부분 → 기존 `acquisitionStdPrice`(`.acquisition.standardPrice`).
  - 다부분 → 양도 복합 경로 필요(`acqUsageNo`·단일 그룹 제약, E4) → **본 Phase 비지원**(unsupported에 사유 기록, 수동 입력 유지). §5-C1.
- **최초공시/양도 ≤2000** → 고시표 부재로 미지원(Phase 1과 동일, `preGosiReason`).

> **🎯 Option B 스코프(확정)**: 위 규칙을 **housing 부분엔 3시점 전부** 적용, **commercial 부분엔 양도시(transfer)에만** 적용한다. **취득·최초공시 commercial은 산출하지 않는다**(C4의 당시 주택 용도 세법 미확정 — Option A/Phase 2.1로 이월). 헬퍼는 `PhdPointResult.commercial`을 acq/first에서 **항상 undefined**로 두고, transfer에서만 채운다. (Case B의 acq commercial도 본 Phase는 배치 미산출 — 기존 `MixedUseStandardPriceInputs` 수동 유지.)

> 단일/복합 반환 필드 상이(E1)를 헬퍼가 흡수한다 — 호출부(모달)는 카테고리별 숫자만 받는다.
>
> **시그니처 변경(F4)**: 기존 `plainStdPrice(b, p)`/`acquisitionStdPrice(b, p)`는 `b.floorArea`를 참조했다. `PhdBatchBuilding`에서 `floorArea`가 `parts[i].floorArea`로 이동하므로, 단일-부분 폴백 호출 시 `floorArea = parts_C[0].floorArea`를 넘긴다. 내부 로직·산출값 불변(Phase 1 등가, anchor A2).

### 3.2 모달 UI (`PhdBuildingStdPriceModalButton.tsx`)

신규 prop `enableCommercial?: boolean`(겸용 전용). **미설정(단독) 시 현행 UI·동작 완전 유지**(G4).

> **부분 목록의 의미(E11)**: parts는 **양도시(현재) 건물 구성**을 뜻한다(기존 Case A "양도시 면적 기준 분리" 모델과 동일). 하나의 parts 목록이 3시점 공통으로 쓰이고, 시점마다 **연도·공시지가만** 달라진다(위치지수 공시지가는 카테고리 무관, 시점당 1개).

- **부분 목록**: `parts: {structureKey, usageNo, floorArea, category}[]` 상태. 첫 행은 항상 표시(현행 단일 입력과 동형). `enableCommercial` 시 각 행에 **카테고리 라디오(주택/상가)** + **"+ 부분 추가" / 행 삭제** 노출. 미설정 시 카테고리 칸·추가 버튼 숨김 → 단일 행 = housing 고정(현행).
- **신축연도·시점별 공시지가**: 건물 공통(현행 유지). 위치지수는 시점당 1개(E2).
- **결과 표시(Option B)**: `enableCommercial` 시 **취득·최초공시=주택분 1줄, 양도시=주택분+상가분 2줄**(상가는 양도만 산출). 취득/최초공시 상가는 "수동 입력(홈택스)" 안내. 미설정(단독) 시 현행 단일 줄. `unsupported`는 카테고리·사유 함께.
- **apply**: `onApply(PhdThreePointApply)` — 아래 확장 형태.

`buttonLabel` 기본은 겸용 시 "3시점 주택·상가 건물기준시가 일괄 계산", 단독은 현행 유지.

### 3.3 Apply 형태 확장 + 라우팅 (`PhdThreePointApply` · `applyBatch`)

```ts
export interface PhdThreePointApply {
  acquisition?: PhdPointResult;      // { housing?, commercial? }
  firstDisclosure?: PhdPointResult;
  transfer?: PhdPointResult;
}
```

> Phase 1 단독 모달은 `{ acquisition: { housing } , ... }`만 방출 → 하위호환(commercial undefined → skip).

`ThreePointStandardPriceInput.applyBatch` 필드 매핑(값이 있을 때 가는 곳 — 매핑은 불변). **Option B는 아래 ✅ 표시 셀만 실제 라우팅**:

| 카테고리 | 취득 | 최초공시 | 양도 |
|---|---|---|---|
| housing | ✅ `onBuildingStdPriceAtAcqChange`(→`phdBuildingStdPriceAtAcq`) | ✅ `onBuildingStdPriceAtFirstChange`(→`phdBuildingStdPriceAtFirst`) | ✅ `onBuildingStdPriceAtTransferChange`(→`phdBuildingStdPriceAtTransfer`) |
| commercial | ✖ 수동(C4) `mixedAcqCommercialBuildingPrice` | ✖ 수동(C4) `phdCommercialBuildingStdPriceAtFirst` | ✅ `onCommercialBuildingStdPriceAtTransferChange`(→`mixedTransferCommercialBuildingPrice`) |

- **housing 3시점 전부 라우팅(F1)**: `hideTransferColumn`은 PHD 위젯의 **render만** 숨긴다. `phdBuildingStdPriceAtTransfer`는 `MixedUseStandardPriceInputs` 양도시 주택건물이 편집하는 **동일 필드**(E9: `:153`) → 양도 housing 라우팅이 그 섹션을 정확히 채운다.
- **transfer-commercial 라우팅**: `mixedTransferCommercialBuildingPrice`(E9: `:172`) = 양도 상가건물, 겸용 상태 = 상가 용도 정확. 콜백 존재 시 라우팅.
- **acq-commercial·first-commercial 라우팅 안 함(Option B·C4)**: 배치 미산출 → 해당 필드별 버튼 유지(F9). Option A(자동)는 Phase 2.1.
- **콜백 정의·값 non-null만 호출**. 단독 PHD는 commercial 콜백 미전달 → housing만(회귀 0).
- **4부분 활성 게이트(E13)는 수동으로 채워짐**: 게이트 `acq-C + first-C > 0`는 사용자가 취득/최초공시 상가건물을 **수동 입력**할 때 활성(Option B). 배치는 housing 3 + 양도 commercial을 채워 수동 부담을 줄인다(게이트 자체는 미충족→사용자 2필드 입력 유도).

### 3.4 게이팅 (`enableCommercial` · `enableBatchCalc` 전달)

`ThreePointStandardPriceInput`에서 모달로 `enableCommercial` 전달 = **commercial 콜백이 하나라도 정의됐는가**(`onCommercialBuildingStdPriceAtAcqChange != null` 등) 또는 `splitMode`. 단독 PHD는 commercial 콜백 미전달 → `enableCommercial=false` → 현행 UI.

`batchPoints`(시점 연도·공시지가 prefill)는 현행 유지. 부분 목록은 모달 내부 상태(부모 면적과 무관 — 사용자가 층별 면적 입력).

### 3.5 겸용 섹션 주입 (`MixedUsePreHousingDisclosureSection.tsx`)

`<ThreePointStandardPriceInput>` 호출에 `enableBatchCalc` 추가(단독 PHD와 동일 1줄). commercial 콜백·`splitHousingCommercialForAcqAndFirst`·`hideTransferColumn`은 이미 전달 중(E7·E8) → `applyBatch`가 이를 이용해 라우팅.

> **🟠 게이팅 회귀 방지(F9·Option B 확정)**: `hideBuildingCalcButton`을 **필드 단위로 조건화**. 배치가 채우는 필드만 숨긴다:
> - 숨김(배치 산출): housing 3시점(acq·first·transfer 주택건물), **양도 상가건물**.
> - **유지(수동)**: **취득·최초공시 상가건물**(C4 미산출). → PointBlock의 commercial 버튼 게이팅은 `hideBuildingCalcButton && timepoint==="transfer"`처럼 시점 조건 추가. housing 버튼은 3시점 모두 숨김.
> 구현: 현행 boolean 단일 `hideBuildingCalcButton`를 **housing용/commercial용 2개**로 분리하거나, PointBlock에 `hideCommercialCalcButton`(transfer만 true) 추가. 단독 PHD는 commercial 필드 자체가 없으므로 무관.

---

## 4. 케이스 매트릭스 (전수 — 설계 전 enumerate, [[feedback_ui_input_path_enumeration]])

**Option B 확정** — 배치 산출 열 = 실제 채우는 필드(수동 유지 필드는 필드별 버튼 존치):

| 케이스 | splitMode | hideTransfer | 배치 산출(Option B) | 라우팅 |
|---|---|---|---|---|
| **단독/일반 PHD** (Phase 1) | — | false | 부분 N개 housing, 3시점(compositeParts 층별 지원) | housing 3필드 (현행). commercial 없음 → 회귀 0 |
| **겸용 Case B** (전 시점 겸용) | false | false | **housing 3시점 + 양도 commercial** (양도 겸용=상가 용도 정확) | housing → `phdBuildingStdPriceAt*`(§164⑤ 주택 환산). 양도 commercial → `mixedTransferCommercialBuildingPrice`(E12 Case B 소비). 취득 commercial은 배치 미산출 → `MixedUseStandardPriceInputs` 수동(현행 유지) |
| **겸용 Case A** (최초공시<용도변경, 4부분) | true | true | **housing 3시점 + 양도 commercial** | 취득 H→`phdBuildingStdPriceAtAcq`, 최초공시 H→`phdBuildingStdPriceAtFirst`, 양도 H→`phdBuildingStdPriceAtTransfer`, 양도 C→`mixedTransferCommercialBuildingPrice`(E9). **취득·최초공시 C = 수동 유지**(C4·F8, 필드별 버튼 존치) |
| **≤2000 취득 + 카테고리 내 다부분** | any | any | 그 카테고리 취득만 산출 불가 | **unsupported**(§5-C1) — 단일-부분 카테고리는 정상 |
| **≤2000 최초공시/양도** | any | any | 미지원(고시표 부재) | unsupported(현행 Phase 1과 동일) |

---

## 5. 제약 · 비범위

- **C1. ≤2000 취득 + 카테고리 내 다부분**: 양도 복합 경로의 `acqUsageNo`·단일 산정기준율 그룹 제약(E4)으로 본 Phase 비지원 → **그 카테고리의 취득만** `unsupported`(사유 노출)·수동 입력 유지. **단일-부분 카테고리 ≤2000은 지원**(전형적 겸용=주택 1구조+상가 1구조가 여기 해당 → 대부분 커버). 무단 축소 금지 — 모달에 사유 노출.
- **C2. 동일연도 양도(§164⑧) + 복합**: 엔진이 명시적으로 throw(E4, `:324`). 배치는 ≥2001 각 시점을 **독립 valuation**으로 산출하므로 §164⑧ 경로를 타지 않는다(취득=양도 동일연도라도 각각 별도 valuation) — 단, acqBase(≤2000)는 예외로 위 C1에 귀속.
- **C3. 조정률(건물특성)**: 양도 복합은 조정률 금지(E4, `:143-155`). 배치 valuation 경로는 조정률 미입력(현행 Phase 1과 동일) → 무관.
- **C4. Case A 취득시·최초공시 상가건물 = 본 Phase 배치 미산출(Option B 확정)**: 그 면적이 당시 주택이었으므로(F8, UI 힌트 `:488,514` "당시") 상가 용도지수 평가는 오류이고 당시 주택 용도 평가 규칙은 **세법 미확정**. → **배치는 이 2필드를 산출하지 않고**, 기존 필드별 홈택스 버튼을 **유지**(수동, 회귀 0). 완전 자동(Option A)은 tax-senior/KoreanLaw로 "당시 주택 용도 평가" 규칙 확정 후 **Phase 2.1**([[feedback_tax_calculation_principle]] · [[feedback_no_unfavorable_application_without_legal_basis]]).
- **NON-GOAL**: 부속시설 안분(`ancillaryFacilities`)·다필지 위치지수 가중평균은 본 Phase 비대상(모달은 시점당 단일 공시지가·부분 목록만). 필요 시 후속.

---

## 6. Phase 분해 (Do 순서 · 각 단계 verify)

```
P2-1. 배치 헬퍼 확장(parts·category·per-category compute) → verify: anchor(§7-A) 통과, tsc 0
P2-2. PhdThreePointApply 형태 확장 + 단독 방출 하위호환 → verify: 기존 unit(단독) green + tsc 0
P2-3. 모달 UI(부분 목록·카테고리·add/삭제 · housing 3+transfer-C 결과) — enableCommercial 게이팅 → verify: tsc 0, 단독 UX 불변(수동)
P2-4. applyBatch 라우팅(housing 3 + transfer-C, §3.3) + enableCommercial 전달(§3.4) → verify: tsc 0
P2-5. MixedUsePHD enableBatchCalc 주입 + **필드별 버튼 필드단위 게이팅**(F9: 취득/최초공시 상가건물 버튼 존치) → verify: tsc 0, lint
P2-6. 회귀: npx vitest run __tests__/tax-engine/building-standard-price/ + __tests__/calc/ + 전체 test → 0 회귀
P2-7. E2E(§7-C): 겸용 Case A(4필드 채움 + acq/first 상가 버튼 존치) + 단독 게이팅 회귀 → verify: 3 spec green
P2-8. 코드 품질 게이트(bkit:code-analyzer, 변경 diff) → High/Medium 0(또는 수정) 후 커밋
```

> Do는 단일 응답 완주(fan-out 금지). 어려운 산식 재유도만 max 서브에이전트 위임. ([[feedback_pdca_session_efficiency]] · single-response-do-execution)
>
> **⚠ 800줄 정책 주의**: `ThreePointStandardPriceInput.tsx`는 현재 **736줄**. applyBatch 라우팅·`enableCommercial` 파생 추가 시 800 초과 위험 → P2-4에서 줄 수 확인, 초과 시 `applyBatch`/`batchPoints` 헬퍼를 sibling 파일(`three-point-batch-wiring.ts` 등)로 추출. 산출 로직은 이미 `phd-building-std-batch.ts`에 있으므로 추출은 wiring만. ([[feedback_800line_split_export_preservation]])

## 7. 테스트 (Do 전 anchor 우선 — 실패 확인·동결)

**A. 배치 헬퍼 anchor** (`__tests__/calc/phd-building-std-batch-mixed.test.ts`) — **Option B 동작**:
- A1. 다부분 housing(주택 RC조 120㎡ 2개 층 상이 구조) ≥2001 3시점 → `housing` 3시점 산출(compositeTotal), `commercial` **취득·최초공시 undefined**(Option B 미산출). **기대값은 엔진 실측으로 산정**(max effort 서브에이전트 위임 가능, [[feedback_numeric_impact_verify_before_bug_claim]]).
- A2. 단일 부분 housing(Phase 1 회귀) → `housing`만, 값 = 기존 `plainStdPrice`와 **동일**(경로 등가성 assert).
- A3. ≤2000 취득 + housing 다부분 → 취득 `housing` `unsupported`(C1 사유), 최초공시/양도(≥2001)는 정상 산출.
- A4. commercial 부분 존재 → **transfer만 `commercial` 산출**(겸용 양도 상태), acq/first `commercial` undefined(C4 미산출 검증).

**B. 모달/라우팅 unit**(선택 — RTL 가능 시): apply 방출 형태 `{housing,commercial}`, acq/first는 `commercial` undefined. applyBatch가 **콜백 정의·값 non-null인 시점·카테고리만** 호출 → housing 3 + transfer-commercial. 단독(commercial 콜백 없음)은 housing만.

**C. E2E**(`e2e/transfer-phd-building-stdprice-calculator.spec.ts` 확장):
- T4. 겸용 Case A 진입(용도변경 house_to_commercial + 최초공시<용도변경) → 일괄 버튼 1개 노출 → 모달에서 주택·상가 부분 입력 → 계산 → "모두 적용" → **취득·최초공시 주택건물(2) + 양도시 주택건물·상가건물(2, `MixedUseStandardPriceInputs` E9) = 4필드 채움**. **취득·최초공시 상가건물 필드는 빈 값 유지 + 필드별 버튼 존치**(Option B·C4 검증).
- T5. 단독 PHD 게이팅 회귀(현행 T1 유지 확인) — enableCommercial=false 경로 불변, housing 3필드만.

## 8. Definition of Done

- [ ] §7-A anchor Do 전 실패 확인 후 통과·동결
- [ ] 케이스 매트릭스(§4) 전 분기 산출 or unsupported 명시
- [ ] Phase 1 단독 회귀 0(A2 경로 등가 + T5)
- [ ] `npx tsc --noEmit` 0
- [ ] `npx vitest run` 전체 green(회귀 0)
- [ ] E2E T4·T5 green
- [ ] 코드 품질 게이트 High/Medium 0
- [ ] 브라우저 수동/E2E 확인(겸용 Case A: housing 3 + 양도 상가 채움, 취득/최초공시 상가 버튼 존치) — [[feedback_browser_verify_with_playwright]]
- [ ] 14 동기화 지점: **신규 없음**(기존 필드 재사용, §2 결론) — grep 자가확인만
- [ ] C4(취득/최초공시 상가건물) 배치 미산출·필드별 버튼 존치 확인(회귀 0, F9)

---

## 부록-결정 — ✅ Option B 확정 (2026-07-07, 사용자 선택)

Case A **취득시·최초공시 상가건물 기준시가**는 그 면적이 당시 **주택 용도**였다(C4·F8) → 세법 미확정으로 **배치 미산출·수동 유지**.

- ~~Option A (완전 자동)~~ → **Phase 2.1로 이월**: tax-senior/KoreanLaw로 "당시 주택 용도 평가" 규칙 확정 후. acq/first commercial을 주택 용도지수로 산출 + 모달에 시점별 용도 개념.
- **✅ Option B (부분 자동) — 채택**: 배치 = **housing 3시점(compositeParts 층별 지원) + 양도시 commercial**. Case A 취득/최초공시 상가건물 = 필드별 버튼 유지(수동). tax 리스크 0·회귀 0.
- ~~Option C (Case A 제외)~~ → 미채택(양도 commercial 자동화 가치 포기).

> "겸용 일괄 배선 전체" 취지는 Option B로 충족: 사용자 원 질문 "층별 구조·용도 상이"는 **housing compositeParts**로 해결, 겸용 3시점 주택 환산 + 양도 상가가 자동. 잔여 수동 2필드는 Phase 2.1에서 자동화.

---

## 부록 — 미해결/Do 확인 항목

1. ~~**Case A 양도-commercial 라우팅 필드 확정**~~ → **해결(E9)**: 양도시 주택건물=`phdBuildingStdPriceAtTransfer`(`:153`)·상가건물=`mixedTransferCommercialBuildingPrice`(`:172`) = PHD transfer 콜백과 동일 필드 + 엔진 소비(E12). 충돌 없음 → Option B에서 **양도 housing·commercial 라우팅**(취득/최초공시 commercial은 C4로 미산출).
2. ~~**Case B first-commercial 엔진 소비 여부**~~ → **해결(E12·E13)**: `phdCommercialBuildingStdPriceAtFirst`는 API `:220`에서 소비되나 **Case A 4부분 게이트 전용**(`:212` "일반 겸용주택 흐름에 없음"). → Case B에선 skip, Case A에선 필수 라우팅(F7).
3. ~~**Case B main mixed 상가 필드 자동채움 UX**~~ → **해결(E12)**: acq/transfer commercial은 Case B 일반 흐름에서 실제 소비(`mixedAcqCommercialBuildingPrice`·`mixedTransferCommercialBuildingPrice`) → 자동채움이 유효 입력(phantom 아님). 같은 필드 양방향 read/write 패턴 준수.
4. **부분 용도번호 연도군**(잔여 — 실 위험 낮음): 모달 카테고리 부분의 `usageNo`는 `optionYear`(양도 우선) 기준. ≤2000 acqBase 다부분은 C1로 비지원이므로 `acqUsageNo` 입력 UI는 본 Phase 미도입. Do에서 optionYear 용도번호가 각 시점 valuation에 유효한지 anchor로 확인(연도군 상이 시 부분 재입력 유도).
