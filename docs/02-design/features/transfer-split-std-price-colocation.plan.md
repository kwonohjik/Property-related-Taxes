# 양도세 토지·건물 분리 — 기준시가 입력의 "쓰는 자리" 배치 계획서

> 상태: Plan (Do 미착수) · 작성 2026-07-30 · **자가검토 1회차 반영(28건)**
> 선행 계획서: `transfer-land-building-independent-valuation-mode.plan.md` (축 A/B 분리) ·
> `transfer-split-input-flow-reorder.plan.md` (축 A 선행 배치) ·
> `transfer-split-acq-std-gate-relaxation.plan.md` (`requiresAcqStdPrice` 술어)

## 1. 요구사항 (사용자 이미지 6·7)

| 이미지 | 양도가액 결정 | 토지 취득 | 건물 취득 | 요구 |
|---|---|---|---|---|
| 6 | 구분양도(실가 직접입력) | **환산취득** | 실거래가 | 「양도시 기준시가」 카드를 **양도가액 결정 방식 아래에서 제거**하고, **토지 취득시 기준시가 카드 아래**에 **토지 양도시 기준시가만** 노출. 건물 기준시가 계산 기능은 비노출 |
| 7 | 구분양도(실가 직접입력) | 실거래가 | **환산취득** | 「양도시 기준시가」 카드를 양도가액 결정 방식 아래에서 제거하고, **건물 취득가액 섹션 아래**에 건물 기준시가 계산서(취득시·양도시)를 노출. 토지 기준시가 계산 기능은 비노출 |

**일반 규칙(사용자 요약)**: 기준시가 계산 기능은 **그 값을 실제로 쓰는 섹션 아래에만** 노출한다.

## 2. 현행 구조 (실측 file:line)

```
CompanionAcqDateSection.tsx:199-216
  └ 축 A  LandBuildingSaleSplitSection            ← 양도가액 결정 방식
      · :205-214  구분/일괄 라디오 (sale-split-mode)
      · :215-224  토지·건물 양도가액 2칸 (구분양도 시)
      · :227-235  TransferStdPriceCard            ← ★ 문제의 카드
          - :96-106  양도시 토지 공시지가 (LandPriceLookupField, testid split-land-std-transfer)
          - :108-114 토지 면적(양도 당시)         (testid split-land-std-transfer-area)
          - :118-133 양도시 건물 기준시가 + 계산 런처 (testid split-building-std-transfer,
                     snapshotKey `bsp-${assetId}-split-transfer`, applyTimePoint="transfer")

CompanionAcqPurchaseBlock.tsx:680-719
  └ 축 B  LandBuildingSplitSection                ← 취득가액 파트별
      · :322-361 ① 토지 취득가액 방식 라디오 → PartAcqStdPrice(land) → PartAcqInputs(land)
      · :383-416 ② 건물 취득가액 방식 라디오 → PartAcqStdPrice(building) → PartAcqInputs(building)
      · :418-426 자본적지출 2칸
```

**현행 노출 게이트** (`LandBuildingSaleSplitSection.tsx:183-186`):

```ts
const needsSaleStdPrice =
  props.saleSplitMode === "apportioned" ||
  props.landAcqMode === "estimated" ||
  props.buildingAcqMode === "estimated";
```

→ **한쪽 파트만 환산이어도 토지·건물 양도시 기준시가 카드가 통째로**, 그것도 양도가액 결정
방식 바로 아래에 뜬다. 이미지 6·7이 지적한 그 상태다.

## 3. 법령·엔진 근거 — 요구가 옳은가

`lib/tax-engine/transfer-tax-split-gain.ts` 실측:

| 소비 지점 | 코드 | 무엇을 쓰는가 |
|---|---|---|
| 파트 환산취득가 | `:258-262` `calcOnePart` case `"estimated"`<br>`partTransferPrice × (partStdAtAcq / partStdAtTransfer)` | **그 파트의 양도시 기준시가만** |
| 환산 분모 파생 | `:212-216` `landStdAtTransferBase` / `buildingStdAtTransfer` | 파트별 독립 |
| 양도가액 안분 비율 | `:162-171` `calcSaleApportionRatio` — `landStd == null \|\| buildingStd == null → null` | **양쪽 모두** 필요 |
| 양도가액 분리 | `:409-420` `splitPair(totalTransfer, landTransferPrice, buildingTransferPrice, effectiveSaleLandRatio)` | 양도가액 2칸이 **모두 비면** 위 비율로 안분 |

즉 **구분양도(직접입력) + 한쪽 파트만 환산**이면 반대쪽 파트의 양도시 기준시가는 **환산 분모로는**
등장하지 않는다. 사용자 요구는 엔진 소비 구조와 일치한다 — UI가 과잉 노출 중이었다.
다만 마지막 행(양도가액 안분 fallback)이 **비가시 잔존값 위험**을 만든다 → §5.5 M1에서 차단한다.

일괄양도(`apportioned`)는 반대다. 양도가액을 기준시가 비율로 나누므로 **토지·건물 둘 다** 필요하고
(소득령 §166⑥ → 부가가치세법 시행령 §64①1호 준용), 그 값은 특정 파트가 아니라 **양도가액 축**에
속한다 → 축 A 유지가 맞다.

## 4. 케이스 매트릭스 (분리 활성 · `isSeparateAcquisition = true` 기준)

`selfOwns = "both"`:

| # | saleSplitMode | landMode | buildingMode | 축 A 카드 | 토지 섹션 양도시 | 건물 섹션 양도시 | validate 요구 |
|---|---|---|---|---|---|---|---|
| 1 | apportioned | actual | actual | **토지+건물** | – | – | 토지·건물 |
| 2 | apportioned | estimated | actual | **토지+건물** | – | – | 토지·건물 |
| 3 | apportioned | estimated | estimated | **토지+건물** | – | – | 토지·건물 |
| 4 | actual | actual | actual | 없음 | – | – | 없음 |
| 5 | actual | **estimated** | actual | 없음 | **토지** | – | 토지만 ← **이미지 6** |
| 6 | actual | actual | **estimated** | 없음 | – | **건물** | 건물만 ← **이미지 7** |
| 7 | actual | estimated | estimated | 없음 | **토지** | **건물** | 토지·건물 |
| 8 | actual | appraisal / salesCase | actual | 없음 | – | – | 없음 |

`selfOwns ≠ "both"` (파트 라디오 자체가 비노출 — `LandBuildingSplitSection.tsx:306-307,323,384`,
두 파트 모드가 legacy 단일 플래그에서 같은 값으로 파생됨):

| # | selfOwns | 파생 모드 | 토지 섹션 | 건물 섹션 | validate 요구 |
|---|---|---|---|---|---|
| 9 | building_only | estimated | 섹션 없음(취득시 카드만 :372-381) | **건물** | **건물만** |
| 10 | land_only | estimated | **토지** | 섹션 없음 | **토지만** |
| 11 | * | actual | – | – | 없음 |

**PHD 변형** (`usePreHousingDisclosure` + 양쪽 환산 — #3·#7의 PHD 케이스): 엔진이 `:345-347`에서
`calcSplitGainPreDisclosure`로 early-return하고, 그 본문(`:594-697`)에는
`landStandardPriceAtTransfer` · `buildingStandardPriceAtTransfer` · `calcSaleApportionRatio`
참조가 **0건**이다(실측) — 즉 엔진이 이 값을 버린다.

→ 원칙적으로는 `needsSaleStdPart`에 PHD-both-estimated 예외를 넣어 **UI·validate에 동시 적용**하면
dead-end 없이 불필요 입력을 없앨 수 있다(한쪽에만 넣으면 dead-end). 다만 이는 **현행 동작 변경이자
요구 범위 밖**이므로 이번 PR에서는 채택하지 않는다 — 양쪽 환산이라 두 파트 카드가 모두 노출되어
현행과 동일하게 입력 가능하고 dead-end도 없다. 후속 과제로 §11에 등재한다.

## 5. 설계

### 5.0 숨기는 위젯 내부 필드 × 다른 입력 경로 (memory `feedback_ui_gate_removes_sole_input_path` 1항)

노출 조건을 좁히는 것은 **입력 경로를 제거하는 것**이기도 하다. 축 A 카드가 담은 4필드를 전수 확인한다.

| 필드 | 축 A 카드 위치 | 다른 입력 경로(실측) | 그 경로의 게이트 |
|---|---|---|---|
| `standardPricePerSqmAtTransfer` | `:96-106` | `AssetSectionTransfer.tsx:114-115`(→`CompanionSaleModeBlock`) · `CompanionAcquisitionCauseSection.tsx:154-155` · `ParcelListInput.tsx:431-433` · `ExpropriationBlock.tsx:98`(읽기, §164⑨) | 각기 다른 assetKind·원인 게이트 |
| `transferArea` | `:108-114` | `AssetSectionBasic.tsx:380-382,420-421` · `AssetSectionTransfer.tsx:100-106` | assetKind 게이트 |
| `landStandardPriceAtTransfer` | `:89`(파생 기록, 입력 칸 없음) | 없음 — 단가×면적 파생 전용 | – |
| `buildingStandardPriceAtTransfer` | `:118-133` | 없음 — **이 카드가 유일 입력 경로** | – |

**판정**: 신규로 입력 경로가 사라지는 조합은 **없다**. 근거 —

- 케이스 #4(구분양도 + 양쪽 실가)는 **현행 `needsSaleStdPrice`도 이미 false**라 축 A 카드가 뜨지
  않는다. 이번 변경으로 새로 숨겨지는 것은 케이스 #5·#6·#9·#10뿐이고, 그 케이스들은 **필요한 파트의
  카드를 파트 섹션에 그대로 옮겨** 노출한다(제거가 아니라 이동).
- 숨겨지는 반대쪽 파트의 값은 그 케이스에서 엔진이 소비하지 않는다(§3 표) → 입력 칸 불요.
- **값은 지우지 않는다**(표시 게이트만). 모드를 되돌리면 입력값과 함께 복귀한다.
- 단, 보존된 값이 **비가시 상태로 엔진에 소비되는 경로**가 §3 마지막 행에 있다 → §5.5 M1이 차단.

**부수 영향 1건(기능 손실 없음, 편의 저하)**: 양도시 **건물** 모달의 prefill이 양도시 **토지** 필드에
커플링돼 있다 — `landAreaM2: asset.transferArea`(`:167`) · `transferLandPricePerSqm:
asset.standardPricePerSqmAtTransfer`(`:170`). 케이스 #6(건물만 환산)에서는 토지 양도시 카드가
없으므로 이 두 값이 비어 모달이 빈 prefill로 열린다. 모달 폼에 자체 입력 칸이
**둘 다 존재**하므로(`BuildingStdPriceForm.tsx:350,362` `landAreaM2` · `building-std-price-form.ts:144`
`transLandPrice`) 계산은 가능하다. 파트 카드 hint에 "위치지수·부속토지 값은 계산기 안에서 입력"을
덧붙여 안내한다.

### 5.1 배치 술어 — 단일 소스 신설

`lib/calc/transfer-tax-split-acq-mode.ts`(현재 **205줄** → 약 250줄, 정책 여유)에 추가한다.
이 파일은 이미 `effectivePartAcqMode` · `isSeparateAcquisition` · `requiresAcqStdPrice`를 담은
**파트 모드 술어 단일 소스**이며, UI·validate·API·엔진이 공유하는 규약이다.

```ts
export interface SaleStdPlacementCtx {
  saleSplitMode: "actual" | "apportioned";
  landMode: PartAcqMode;
  buildingMode: PartAcqMode;
  selfOwns: "both" | "building_only" | "land_only";
}

/** 양도시 기준시가를 **어디에** 두는가 — 축 A(양도가액) vs 파트 섹션(축 B). */
export function saleStdPlacement(ctx: SaleStdPlacementCtx): {
  saleAxis: boolean;      // 축 A: 양도가액 안분 비율 — 토지·건물 한 카드
  landPart: boolean;      // 축 B 토지 섹션: 토지 환산 분모
  buildingPart: boolean;  // 축 B 건물 섹션: 건물 환산 분모
};

/** 그 파트의 양도시 기준시가가 계산에 실제로 쓰이는가 = 입력 필수 여부 */
export function needsSaleStdPart(part: "land" | "building", ctx: SaleStdPlacementCtx): boolean;
//  = saleAxis || (part === "land" ? landPart : buildingPart)
```

규칙:

- `apportioned` → `{ saleAxis: true, landPart: false, buildingPart: false }`
- `actual` → `saleAxis: false`,
  `landPart = landMode === "estimated" && selfOwns !== "building_only"`,
  `buildingPart = buildingMode === "estimated" && selfOwns !== "land_only"`

**`saleSplitMode` fallback 3중 통일 (memory `feedback_store_default_vs_ui_display_fallback`)**:
`AssetForm.saleSplitMode`는 타입상 required(`calc-wizard-asset.ts:384`)지만 stale sessionStorage
마이그레이션 자산에서 `undefined`가 올 수 있어, UI(`CompanionAcqDateSection.tsx:202`)와
API(`transfer-tax-api-split.ts:67`)는 이미 `?? "apportioned"` fallback을 쓴다. 반면 현행 validate
`:207`은 fallback 없이 `=== "apportioned"`로 비교해 **undefined면 요구가 꺼지는** 미세 불일치가 있다.
`ctx` 생성 시 **세 계층 모두 `asset.saleSplitMode ?? "apportioned"`** 로 통일한다.

**불변식**: `saleAxis`와 두 파트 값은 **상호배타**다 — `saleAxis && (landPart || buildingPart)`가
참이 되는 조합이 없다. (`landPart`와 `buildingPart`는 케이스 #7에서 **동시에 참**이며, 이는 정상이다 —
서로 다른 섹션의 서로 다른 카드다.) 이 불변식이 같은 `data-testid`가 화면에 2개 존재해
E2E strict mode가 깨지는 사고를 차단한다.

**호출부가 1회 계산해 양축에 주입한다 — 하위 재파생 금지.** 축 A·축 B가 각자 `saleStdPlacement()`를
호출하면 두 호출의 인자가 어긋나는 순간 위 불변식이 **관례적 보증**으로 전락한다. 두 축의 공통 조상은
`CompanionAcqPurchaseBlock`이며(축 A는 `:200-201` → `CompanionAcqDateSection:199-216`, 축 B는 `:685`),
이미 `effLandAcqMode`·`effBuildingAcqMode`·`selfOwns`·`asset`·`acqStdPriceRequired`를 **모두 보유**한다.
→ 거기서 한 번 계산해 양축에 `placement` prop으로 내려준다(기존 `acqStdPriceRequired` 주입과 동일 패턴,
`LandBuildingSplitSection.tsx:705-707`의 "호출부가 계산해 주입 — 재파생 금지" 규약 준수). 그러면
`LandBuildingSplitSection`에 `saleSplitMode` prop을 신설할 필요도 없고, 불변식이 **단일 계산으로 구조
보증**된다.

### 5.2 카드 컴포넌트 추출 — 공유(복제 금지)

신규 `components/calc/transfer/TransferStdPriceCards.tsx` (~160줄). **래퍼까지 이 파일에 둔다** —
축 A는 `TransferStdPriceCard` 1심볼만 import해 조립 규약이 한 파일에 모인다.

| export | 내용 | testid |
|---|---|---|
| `TransferLandStdFields` | 양도시 토지 공시지가(`LandPriceLookupField`) + 토지 면적(양도 당시, `DecimalInput`) + 단가×면적 자동 기록(`writeLandStd`) | `split-land-std-transfer`(총액 div) · `split-land-std-transfer-area`(면적) · **신규** `split-land-std-transfer-persqm`(㎡당 입력 칸) |
| `TransferBuildingStdFields` | 양도시 건물 기준시가 칸(`CurrencyInput hideUnit`) + 「양도시 건물 기준시가 계산」 런처 | `split-building-std-transfer` |
| `TransferStdPriceCard` | 위 둘을 `ToneCard tone="emerald" title="양도시 기준시가 (§99①1호 가목·나목)" noDark`로 감싼 축 A용 래퍼 | **신규** `split-sale-std-card`(wrapper) |

**`noDark` 필수**: 현행 3카드가 전부 `noDark`다(축 A `:95`, 취득시 토지 `:121`, 취득시 건물 `:158`).
누락하면 신규 양도시 카드만 다크모드 톤이 달라진다.

**필드 컴포넌트 배선은 `asset` + `onChange` 단일 경로**로 통일한다. 축 A 체인을 끝까지 추적하면
`CompanionAcquisitionCauseSection.tsx:218-220`에서 `buildingStandardPriceAtTransfer={asset.…}` /
`onChange({buildingStandardPriceAtTransfer: v})`로 귀결되어 축 B가 쓸 `asset`/`onAssetChange`와
**동일 필드·동일 스토어**다. 별도 `value`/`onValueChange` prop을 두면 두 호출부의 배선이 갈려
향후 드리프트 여지가 생기므로 두지 않는다.

**이전 대상 props 전수**(오배선 방지 — 특히 `referenceDate`에 취득일을 넣으면 hint "양도일 직전
고시"와 어긋난다):

- `LandPriceLookupField`: `label="양도시 토지 공시지가"` · `pricePerSqm` · `onPricePerSqmChange` ·
  `area={parseDecimal(asset.transferArea) || undefined}` · `onAreaChange` ·
  `referenceDate={transferDate}` · `jibun={asset.addressJibun}` ·
  `hint="양도일 직전 고시 개별공시지가 (원/㎡) — 취득일이 아니다 (소득령 §164③)"` ·
  `landStdPriceTestId="split-land-std-transfer"`
- `FieldCard`(면적): `label="토지 면적 (양도 당시)"` · `unit="㎡"` ·
  `hint="양도시 토지 기준시가 = ㎡당 공시지가 × 이 면적"`
- `FieldCard`(건물): `label="양도시 건물 기준시가"` · `unit="원"` · hint는 **배치별 분기**(아래)
- 런처: `lockedTaxType="transfer"` · `buttonLabel="양도시 건물 기준시가 계산"` ·
  `initialAddress`(7필드) · `snapshotKey={bsp-${assetId}-split-transfer}` ·
  `applyTimePoint="transfer"` · `prefill{landAreaM2, acquisitionDate, transferDate,
  transferLandPricePerSqm}` · `onApply`

**건물 hint 배치별 분기** (구분양도에서는 안분이 없으므로 현행 문구가 사실과 다르다):

| 배치 | hint |
|---|---|
| 축 A(`saleAxis`) | `안분 분모 겸 환산취득가 분모 — 계산기로 산정 (§99①1호 나목)` (현행 유지) |
| 파트 섹션(`buildingPart`) | `환산취득가 분모 — 계산기로 산정 (§99①1호 나목). 위치지수·부속토지 값은 계산기 안에서 입력합니다` |

- `writeLandStd`의 **단일 배치 `onChange`** 규약을 그대로 옮긴다(다중 키 분리 호출 시 stale spread
  덮어쓰기 — `feedback_multikey_patch_stale_spread_overwrite`).
- `snapshotKey`·`applyTimePoint`는 **불변** → 키 규약(`building-std-snapshot-keys.ts:23,43`)에 이미
  `split-transfer`가 등록돼 있어 계산서 서식·PDF 경로 변경이 없다.
- 라목 역산 금지 경고문(`LandBuildingSaleSplitSection.tsx:58-61`, docblock `:55-65`)과
  건물분 편집 가능 사유 주석(`:115-117`)을 신규 파일로 함께 이전한다.

### 5.3 축 A — `LandBuildingSaleSplitSection.tsx`

- `needsSaleStdPrice` → `saleStdPlacement(...).saleAxis`.
- `TransferStdPriceCard`·`TransferBuildingStdPriceButton` 정의를 §5.2 파일로 이전, 축 A는 import만.
- **orphan 정리 — 3파일 6줄**(연쇄 고아까지):
  1. `LandBuildingSaleSplitSection.tsx` Props의 `landAcqMode` · `buildingAcqMode` 선언·주석(`:46-48`)
  2. `CompanionAcqDateSection.tsx:43-44` Props 선언(`effLandAcqMode` · `effBuildingAcqMode`)
  3. `CompanionAcqDateSection.tsx:210-211` 전달
  4. `CompanionAcqPurchaseBlock.tsx:200-201` 상위 전달
  ⚠️ `CompanionAcqPurchaseBlock.tsx:138-139,162-163`의 **원본 파생(`effLandAcqMode` 로컬 변수)은
  유지** — `:445,688,690,710-711`에서 축 B·술어가 계속 쓴다. 제거 대상은 `CompanionAcqDateSection`
  으로의 전달 경로뿐이다.

### 5.4 축 B — `LandBuildingSplitSection.tsx`

토지 섹션(`:341-359`)·건물 섹션(`:402-414`) 각각에서 **취득시 기준시가 카드 바로 뒤,
`PartAcqInputs` 앞**에 삽입:

```
① 토지 취득가액 방식 (라디오)
  └ [취득시] amber ToneCard "토지 취득시 기준시가 (§99①1호 가목)"   ← 기존
              wrapper testid split-land-std-acq-card
  └ [양도시] emerald ToneCard "토지 양도시 기준시가 (§99①1호 가목)"  ← 신규 (placement.landPart)
              wrapper testid split-land-std-transfer-card
  └ 환산 안내 / 금액 칸                                              ← 기존
② 건물 취득가액 방식 (라디오)
  └ [취득시] amber ToneCard "건물 취득시 기준시가 (§99①1호 나목)"    ← 기존(assetKind==="building")
              wrapper testid split-building-std-acq-card
              런처 buttonLabel="취득시 건물 기준시가 계산"  ← ★ 신규 지정(아래)
  └ [양도시] emerald ToneCard "건물 양도시 기준시가 (§99①1호 나목)"  ← 신규 (placement.buildingPart)
              wrapper testid split-building-std-transfer-card
              런처 buttonLabel="양도시 건물 기준시가 계산"
  └ 환산 안내 / 금액 칸                                              ← 기존
```

- **`ToneCard title` 리터럴은 위 도식대로 고정**한다. 축 A 제목("…가목·나목")을 파트 카드에 복사하면
  무관한 목이 붙는다.
- **wrapper `data-testid` 필수**: 기존 취득시 카드가 wrapper에 testid를 두는 이유(`:118-120` 주석 —
  "내부 면적 input으로 카드 존재를 대리 판정하면 카드가 남고 면적 칸만 빠졌을 때 거짓 통과")가
  양도시 카드에도 그대로 적용된다.
- **취득시 런처 라벨 지정 필수**: 현행 취득시 런처는 `buttonLabel` 미지정이라 기본값
  "건물 기준시가 계산"(`BuildingStdPriceModalButton.tsx:79`)이다. 두 런처가 같은 ② 섹션에 인접하면
  (a) 사용자가 앞 버튼의 시점을 알 수 없고 (b) Playwright `getByRole("button",{name})`은 부분일치라
  "건물 기준시가 계산"이 두 버튼을 모두 잡는다 → 취득시에 `buttonLabel="취득시 건물 기준시가 계산"`을
  명시해 대칭을 만든다. (기존 spec `split-mode-gating.spec.ts:153,172`는 `/양도시 …/`라 무영향.)
- 톤은 **취득시 amber / 양도시 emerald**(components/calc/CLAUDE.md 색상 가이드). 카드는 `<ToneCard>`만
  사용(인라인 톤 하드코딩 금지 — `tones.ts` 단일 소스).
- **면적 칸 2개 인접**(취득 당시 `acquisitionArea` / 양도 당시 `transferArea`)이 토지 섹션에 생긴다.
  서로 다른 시점 값이므로 통합하지 않고 기존 라벨로 구분한다.

**`PartAcqInputs` 안내 문구 — prop 배선 + 3경우 리터럴**

현행 `PartAcqInputs` props는 8개뿐(`:193-204`)이라 배치 정보를 받을 통로가 없다.
`saleStdInPart: boolean` prop을 신설하고, `LandBuildingSplitSection`이 **조상에게서 받은
`placement`**(§5.1 — `CompanionAcqPurchaseBlock`이 1회 계산)에서 파트별 값을 꺼내 내려준다.
`LandBuildingSplitSection`도 `PartAcqInputs`도 **직접 `saleStdPlacement()`를 호출하지 않는다**
(dual-truth 회피 — 술어 호출은 조상 1곳).

| 경우 | `· 양도시 기준시가 →` 이후 문구 |
|---|---|
| 파트 섹션 배치(`saleStdInPart === true`) | `위 「{토지\|건물} 양도시 기준시가」 카드` |
| 축 A 배치(`saleStdInPart === false`) | `위 「양도시 기준시가」 카드(양도가액 결정 방식 아래)` |

취득시 소스 문구(`acqSource`, `:258-261`)의 주택 역산 분기는 **현행 유지**.

### 5.5 validate — dead-end 차단 + 비가시 안분 차단 (⑧ 규칙, **필수 동반 수정**)

#### M1 — **철회됨** (Do 단계 실측으로 전제 반증, 2026-07-30)

> 아래 초안은 이 경로를 Critical 결함으로 판단해 V4의 `hasSaleRatio`를 노출 기준으로 좁히려 했다.
> **구현 중 기존 anchor 4건이 깨지면서 전제가 틀렸음이 드러났다**:
> 구분양도 + **양쪽 실지거래가액**에서는 현행 `needsSaleStdPrice`
> (`LandBuildingSaleSplitSection.tsx:183-186`)도 false라 축 A 카드가 **이미** 숨는다. 즉
> "화면에 없는 기준시가로 안분"은 이번 배치 변경이 만드는 상황이 **아니라**, 2026-07-29에
> §166⑥ → 부가세령 §64①1호 근거로 "정당한 입력"이라 확정한 기존 경로다(S1 해소,
> `split-sale-std-price-transmit.test.ts` · `transfer-tax-validate-split.test.ts` V4/V5 그룹).
> 사용자가 **직접 입력한** 기준시가로 법정 안분하는 것은 `feedback_no_silent_apportion_fallback`이
> 금지하는 "시스템이 값을 지어내는" 자동 안분이 아니며, 값은 모드를 되돌리면 화면에 복귀한다.
> → **V4는 무변경**(`hasSaleRatio` 유지), V4 메시지도 원복. anchor A6는 회귀 가드로 기대를 반전해
> 존치한다(잔존값 안분이 **통과**하는 것이 현행 정책임을 고정).

<details><summary>초안(철회) — 비가시 잔존값으로 양도가액이 갈리는 경로 차단</summary>

§3 마지막 행의 실측: `splitPair(totalTransfer, landTransferPrice, buildingTransferPrice,
effectiveSaleLandRatio)`(`:409-420`)는 양도가액 2칸이 **모두 비면** `calcSaleApportionRatio` 비율로
안분한다. API는 `saleStdPriceActive = isSplitActive`로 **항상 전송**하므로(`transfer-tax-api-split.ts:87`),
케이스 #5에서 화면에서 사라진 건물 양도시 기준시가 **잔존값**이 안분 분모로 살아남는다.
현행은 그 값이 화면에 있어 문제가 아니었으나 **이 계획이 비가시화한다** →
`feedback_no_silent_apportion_fallback` 정면 위반.

**정정**: V4(`transfer-tax-validate-split.ts:177-186`)의 `hasSaleRatio`만 **노출 기준으로 좁힌다**.

```ts
// :166 현행 — 엔진 parity 용도(requiresAcqStdPrice 인자, :125·:149·:199)로 그대로 유지.
//   엔진은 전송값 기준(calcSaleApportionRatio(input) != null)이고 전송은 항상 하므로,
//   잔존값을 포함한 이 정의가 엔진과 일치한다(feedback_shared_predicate_argument_parity).
const hasSaleRatio = landStd != null && buildingStd != null;

// 신규 — V4(:181) 전용. 두 파트 카드가 실제로 화면에 있는 배치에서만 참.
const hasVisibleSaleRatio =
  hasSaleRatio && needsSaleStdPart("land", ctx) && needsSaleStdPart("building", ctx);
```

V4가 `hasVisibleSaleRatio`를 쓰면 케이스 #5·#6에서 "양도가액을 1칸 이상 입력"이 강제되고,
그러면 `splitPair`가 비율 분기(`:103`)에 도달하지 않는다 → 비가시 안분 경로가 **구조적으로 닫힌다**.

</details>

#### 파트별 필수 검증 분해

`:206-213` 현행:

```ts
const needsTransferStd =
  asset.saleSplitMode === "apportioned" || landMode === "estimated" || buildingMode === "estimated";
if (needsTransferStd) {
  if (landStd == null || buildingStd == null) return `${label}: … 토지·건물 양도시 기준시가가 필요 …`;
}
```

→ **한쪽만 환산이어도 양쪽을 요구**한다. UI만 고치면 "입력 칸이 없는데 차단"이 된다
(`feedback_ui_gate_removes_sole_input_path` 3항). 파트별로 분해한다:

```ts
if (needsSaleStdPart("land", ctx) && landStd == null)
  return `${label}: 일괄양도 안분·환산취득가 계산에는 양도시 기준시가 중 토지분(㎡당 공시지가 × 면적)이 필요합니다 (§99①1호 가목).`;
if (needsSaleStdPart("building", ctx) && buildingStd == null)
  return `${label}: 일괄양도 안분·환산취득가 계산에는 양도시 기준시가 중 건물분이 필요합니다 — 「건물 기준시가 계산」으로 산정해 입력하세요 (§99①1호 나목).`;
```

**메시지에 `양도시 기준시가` 연속 토큰을 보존**한다 — 기존 anchor 4곳
(`__tests__/calc/transfer-tax-validate-split.test.ts:78,86,537,550`)이 `toContain("양도시 기준시가")`로
단언하므로, 파트명을 앞에 붙이면(`양도시 토지 기준시가`) 4건이 전부 깨진다. 위 문안은 토큰을 유지해
기존 단언을 살리면서 파트를 구분한다.

`ctx.selfOwns`가 술어에 들어가므로 케이스 #9·#10(비소유 파트)의 dead-end도 함께 닫힌다
(`validateSplitDirectInputs`는 `:54`에서 이미 `asset.selfOwns ?? "both"`를 쓴다 — 주입 실현 가능).

#### V4 메시지 정정

`:185` 메시지가 `"… 또는 양도시 토지 공시지가·면적과 건물 기준시가를 입력하세요"`라고 안내하는데,
구분양도에서는 (양쪽 환산이 아닌 한) 그 두 칸이 화면에 없다. 실제 입력 가능한 경로(토지·건물
양도가액)만 안내하도록 수정한다. V4의 판정 로직은 위 `hasVisibleSaleRatio` 교체 외에는 변경하지 않는다.

### 5.6 변경하지 않는 것

- **API 변환** `transfer-tax-api-split.ts:87` `saleStdPriceActive = isSplitActive` — 유지.
  좁히면 계층 간 `hasSaleRatio` 비대칭이 재발한다(2026-07-29 S1). 비가시 안분 위험은 §5.5 M1이
  validate 층에서 닫으므로 전송 게이트를 건드릴 필요가 없다.
- **엔진** `transfer-tax-split-gain.ts` — 산식·게이트 무변경(회귀 0).
- **폼 필드** — 4필드 모두 그대로. 필드 신설 0건.
- **스냅샷 키** — `bsp-${assetId}-split-transfer` 유지.

## 6. 요구 중 그대로 적용하지 않는 부분 (근거 명시)

**이미지 7의 "취득시 및 양도시 건물기준시가 계산서"** — 이미지 7의 자산은 **주택**이다
(토지 카드에 `derivedBuildingNote` 문구가 보이며, 이는 `LandBuildingSplitSection.tsx:305`
`showBuildingStdPrice = showLandStdPrice && !isHousingAsset`의 주택 분기다).

주택(§99①1호 **라목**)의 개별·공동주택가격은 **부수토지를 포함한 결합 공시**라 건물분 단독 공시가
없다. `결합 총액 − 토지분` 역산만이 `토지분 + 건물분 ≡ 라목 총액` 항등성을 지켜 개산공제 합계를
법정액(소득령 §163⑥2호가목 = 라목 가액 × 3/100)에 맞춘다. 주택에 **취득시** 건물 기준시가 계산서를
열면 그 항등성이 깨진다.

| 자산 | 건물 섹션 취득시 | 건물 섹션 양도시 |
|---|---|---|
| 주택(housing) | 직접 입력·계산서 **없음**. 대신 **역산 결과를 읽기 전용으로 표시**(2026-07-30 추가 — 아래) | **신규 노출** |
| 일반건물(building) | 계산서 있음(현행) | **신규 노출** → 요구대로 "취득시 + 양도시" 둘 다 |

**주택 건물분 파생 표시 추가 (사용자 보고 2026-07-30, 이미지 8)**: 주택 + 건물 환산 조합에서
「취득시 건물기준시가」가 **화면 어디에도 보이지 않아** 사용자가 환산 분자를 확인할 수 없었다.
입력 경로는 존재했지만(상단 결합 총액 + 토지 카드의 ㎡당 공시지가·면적) 건물 섹션에는 표시가 없어
양도시 카드와 짝이 맞지 않았다. → 입력은 그대로 두고 **결과만** 건물 섹션에 읽기 전용으로 표시한다
(`HousingBuildingStdDerivedCard`, testid `split-building-std-acq-derived-card`).
산식은 신규 헬퍼 `calcDerivedBuildingStdAtAcq(total, landStd)`로 추출해 **엔진 `calcAcqStdPair`와
공유**한다(재구현 시 clamp 규약 드리프트). 총액 미입력이면 `null` → "어디를 채워야 하는지" 안내.

즉 **일반건물에서는 요구가 그대로 충족**되고, 주택에서는 양도시만 추가된다. 양도시 축은 라목 역산을
쓰지 않으므로(부가세령 §64①1호는 각 파트의 고유 기준시가) 주택에서도 양도시 계산서는 정당하다.

## 7. Definition of Done — 14 동기화 지점

신규 필드 0건이므로 해당 지점만 표기한다.

| # | 지점 | 조치 |
|---|---|---|
| ①②③ | 폼 타입·initial·normalize | 해당 없음(필드 불변) |
| ④ | API 변환 | **무변경**(§5.6 근거) |
| ⑤ | UI 위젯 | §5.2·5.3·5.4 — 배치 이동 + 술어 게이트 |
| ⑥ | 사이드바 합계 | 해당 없음 |
| ⑦ | 결과 카드 | **조건부 — 신규 위험 0**. `BuildingStdPriceReportSection`은 카드 노출과 무관하게 **스냅샷 존재 + `inputData`에 assetId 포함**이면 계산서를 렌더한다(`:45-69`). 따라서 카드를 숨겨도 이전에 저장한 `bsp-…-split-transfer` 계산서는 결과·PDF에 남는다. 다만 이는 **현행에도 이미 존재하는 성질**이다 — 케이스 #4(구분양도+양쪽 실가)에서 현행 `needsSaleStdPrice`도 false라 같은 상황이 발생한다. 이번 변경이 새로 만드는 위험이 아니므로 스냅샷 정리는 하지 않는다(§5.0 "값 보존" 원칙과도 충돌). §9 리스크 표에 등재 |
| ⑧ | **validation** | §5.5 — M1(비가시 안분 차단) + 파트별 분해 **필수** |
| ⑨~⑭ | Zod·body spread·Route 매핑 | 해당 없음 |

## 8. 검증 계획

### 8.1 Pre-Do anchor (Do 착수 **전** 작성·실행 — 현행 실패 확인)

`__tests__/calc/split-sale-std-part-gate.test.ts` (신규):

| ID | 케이스 | 기대 | 현행 예상 |
|---|---|---|---|
| A1 | 구분양도 + 토지만 환산 + 토지 std만 입력 + 양도가액 1칸 | validate 통과 | 🔴 실패(양쪽 요구) |
| A2 | 구분양도 + 건물만 환산 + 건물 std만 입력 + 양도가액 1칸 | validate 통과 | 🔴 실패 |
| A3 | 일괄양도 + 한쪽만 입력 | 차단 유지 | ✅ 통과 |
| A4 | 구분양도 + 양쪽 실가 | 요구 없음 | ✅ 통과 |
| A5 | `selfOwns="building_only"` + 환산 | 건물 std만 요구 | 🔴 실패 |
| **A6** | 구분양도 + 토지만 환산 + 양도가액 2칸 공백 + 건물 std 잔존 | **통과**(§64①1호 법정 안분 — M1 철회 후 회귀 가드) | ✅ 통과 |
| A7 | 케이스 #7(양쪽 환산) + 양도가액 2칸 공백 + std 2필드 입력 | V4 통과(S1 시나리오 보존) | ✅ 통과 |
| A8 | `saleStdPlacement` 불변식 — 전 조합에서 `saleAxis && (landPart‖buildingPart)` 거짓 | 통과 | (신규 술어) |
| A9 | 기존 메시지 토큰 보존 — 새 메시지가 `"양도시 기준시가"`를 포함 | 통과 | (신규) |

**A6가 이 PR의 핵심 anchor**다 — 사용자에게 보이지 않는 값으로 양도가액이 갈리는 경로를 막는다.

### 8.2 컴포넌트 테스트

기대가 뒤집히거나 tsc가 깨지는 기존 파일(실측 전수):

| 파일 | 영향 | 조치 |
|---|---|---|
| `__tests__/components/split-transfer-std-price-auto.test.tsx` | `:32-47` Harness가 `landAcqMode`/`buildingAcqMode`를 축 A에 전달 → prop 제거 시 **tsc 실패**. `:135-138` "환산 파트 → 노출"은 기대 반전 | Harness prop 정리 + C 그룹 갱신. (이 파일이 `LandBuildingSaleSplitSection`의 유일한 테스트 소비처 — import처는 `CompanionAcqDateSection.tsx:22`와 이 파일 2곳) |
| `__tests__/calc/transfer-tax-validate-split.test.ts` | `:78,86,537,550` `toContain("양도시 기준시가")` 4곳 | §5.5 문안이 토큰을 보존하므로 **무변경 통과 예상** — anchor A9로 보증 |
| `split-part-std-card-gating.test.tsx` · `split-input-flow-reorder.test.tsx` · `transfer-tax-api-split-gate.test.ts` · `split-sale-std-price-transmit.test.ts` | 취득시 카드·API 전용 — **기대 뒤집힘 없음**(실측 확인) | 회귀 확인만 |

**취득시 런처 `buttonLabel` 변경의 파급 — 전수 확인 결과 무영향**(재조사 방지용 기록):

| 참조처 | 셀렉터 | 판정 |
|---|---|---|
| `e2e/building-stdprice-modal-prefill.spec.ts:56` | `getByRole("button",{name:"건물 기준시가 계산"}).first()` | **무영향** — 이 spec은 분리 토글을 켜지 않아(`isSplit === false`) 축 A·축 B가 렌더되지 않는다. 잡는 버튼은 `GeneralBuildingBlock` 런처다 |
| `e2e/transfer-phd-building-stdprice-calculator.spec.ts:94,569` | `phd.getByRole(...)` `toHaveCount(0)` | **무영향** — PHD 섹션 스코프 내부 단언, 축 B 카드는 스코프 밖 |
| `e2e/mixed-use-commercial-stdprice-landprice-prefill.spec.ts:128` | `commercialSection.…first()` | **무영향** — 겸용(`isMixedUse`)은 축 A·축 B 모두 제외 |
| `split-mode-gating.spec.ts:153,172` | `/양도시 건물 기준시가 계산/` | **무영향** — 접두 명시 |

신규 `__tests__/components/split-std-price-colocation.test.tsx`:

- 이미지 6 재현(#5): 축 A에 `split-land-std-transfer-card` 없음 / 토지 섹션에 있음 /
  `split-building-std-transfer-card` 화면 전체 0건
- 이미지 7 재현(#6): 건물 섹션에 `split-building-std-transfer-card` + "양도시 건물 기준시가 계산"
  런처 / 토지 양도시 카드 0건
- 케이스 #7: 두 파트 카드 동시 노출, 축 A 카드 0건
- **testid 유일성**: 모든 조합에서 `queryAllByTestId(...).length <= 1`
  (`getAllBy*`는 0건일 때 throw하므로 `queryAllBy*`를 쓴다)

### 8.3 E2E

`e2e/split-mode-gating.spec.ts`:

- 기존 일괄양도 시나리오(`:124-131,143-158`)는 축 A 유지라 로직 무변경.
- ⚠️ **셀렉터 스코프 재지정 필수**: 케이스 #5에서 토지 섹션에 `LandPriceLookupField`가 2개
  (취득시·양도시) 공존한다. 이 컴포넌트는 인스턴스마다 `placeholder="원/㎡"` 입력 + "공시지가 조회"
  버튼을 렌더하고 **입력 칸에는 testid가 없다**(`LandPriceLookupField.tsx:72,214,229`). 기존 E2E는
  `page.getByPlaceholder("원/㎡")`를 무스코프로 쓴다(`:142`) → strict mode 충돌.
  → 신규 `split-land-std-transfer-persqm` testid(§5.2) 사용 + 기존 셀렉터를 wrapper testid로 스코프.
- 구분양도 + 파트 환산 시나리오 2건 추가(이미지 6·7 경로).

### 8.4 게이트

- `npx tsc --noEmit` 0건
- `npx vitest run __tests__/tax-engine/transfer/ __tests__/calc/ __tests__/components/`
- `npm run test:transfer`
- pre-push는 `lib/calc/**` 변경으로 **전체 판정** → `npm run check:pre-pr`
- 브라우저 확인: 이미지 6·7 조합 재현(Playwright E2E로 대체 — `feedback_browser_verify_with_playwright`)

## 9. 리스크

| 리스크 | 영향 | 완화 |
|---|---|---|
| 잔존 기준시가로 양도가액 안분 | 화면에 없는 값이 안분 비율에 참여 | **현행과 동형**(케이스 #4에서 이미 발생) — 2026-07-29 §64①1호 정당 입력으로 확정. M1 철회(§5.5), anchor A6가 그 정책을 회귀 가드로 고정 |
| validate 미동반 수정 | 입력 칸 없는 차단(dead-end) | §5.5 파트별 분해 — A1·A2·A5 anchor |
| 중간 커밋의 입력 경로 공백 | 축 A 축소만 커밋된 상태에서 #5·#6은 입력 칸이 없고, validate는 이미 완화돼 차단도 안 되며, 엔진은 `partStdAtTransfer > 0` 실패로 **취득가액 0을 조용히 산출**(`:258-262`) | §10에서 축 B 삽입을 축 A 축소보다 **먼저** 수행 |
| 같은 testid 2곳 노출 | E2E strict mode 실패 | §5.1 불변식 + A8·§8.2 유일성 테스트 |
| `원/㎡` placeholder 2개 공존 | 기존 E2E strict mode 실패 | §5.2 신규 testid + §8.3 셀렉터 재지정 |
| 두 건물 런처 라벨 부분일치 | E2E 오매칭·사용자 혼동 | §5.4 취득시 런처 `buttonLabel` 대칭 지정 |
| 안내 문구가 없는 카드를 가리킴 | 사용자가 입력 위치를 못 찾음 | §5.4 3경우 리터럴 표 + `saleStdInPart` prop 배선 |
| 잔존 스냅샷의 계산서 출력 | 숨긴 카드의 계산서가 결과·PDF에 남음 | **현행과 동형**(케이스 #4에서 이미 발생) — 신규 위험 아님(§7 ⑦) |
| 케이스 #6 모달 prefill 공백 | 위치지수·부속토지 재입력 | 기능 손실 없음(모달 자체 입력 칸 존재) — §5.0 hint 안내 |

## 10. 작업 순서

1. **anchor 먼저**: §8.1 A1~A9 작성·실행 → 현행 실패 확인(특히 **A6**, 디자인 환류 기회)
2. `transfer-tax-split-acq-mode.ts` — `saleStdPlacement` · `needsSaleStdPart` 추가 → A8 통과
2-b. `CompanionAcqPurchaseBlock` — `saleStdPlacement()` 1회 계산 + 양축 `placement` prop 주입 배선
3. `transfer-tax-validate-split.ts` — `hasVisibleSaleRatio`(M1) + 파트별 분해 + V4 메시지
   → A1~A7·A9 통과
4. `TransferStdPriceCards.tsx` 추출(래퍼 포함) — 축 A는 아직 기존 게이트 유지
5. **축 B 파트 카드 삽입 + `saleStdInPart` 배선 + 취득시 런처 라벨** — 입력 경로를 **먼저 만든다**
6. **축 A 게이트 축소(`saleAxis`) + orphan 3파일 6줄 정리** — 5와 **한 커밋**으로 묶어도 무방하나,
   순서를 뒤집지 않는다(§9 "중간 커밋의 입력 경로 공백")
7. 컴포넌트·E2E 테스트 갱신·추가(§8.2·8.3)
8. 전체 게이트(§8.4) → `scripts/ship.sh`

## 11. 후속 과제 (이번 PR 범위 밖)

- **PHD 양쪽 환산의 불필요 입력 제거**: `needsSaleStdPart`에 PHD-both-estimated 예외를 UI·validate에
  **동시** 적용하면 엔진이 버리는 값(`:594-697` 참조 0건)의 입력 강제를 없앨 수 있다. 현행 동작 변경
  이라 별도 PR로 분리(§4 각주).
