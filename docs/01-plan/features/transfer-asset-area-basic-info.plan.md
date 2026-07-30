# 양도소득세 — 기본정보 면적 축 전 자산유형 확대 (계획서)

> 작성일: 2026-07-30
> 브랜치: `feat/transfer-asset-area`
> 상위 정본: [`docs/02-design/area-taxonomy.md`](../../02-design/area-taxonomy.md) (2026-04-24 v1.0)
> 사용자 확정 방향: **(a) 기존 자산별 블록의 면적을 기본정보로 승격·단일화** — 겸용주택 등은 **전체 면적 기준**

---

## 0. 요약 — 이 작업은 "신규 추가"가 아니라 "게이트 해제 + 승격"이다

착수 전 실측 결과, 요청된 기능의 **절반은 이미 구현되어 있었다.**

- `AssetForm.acquisitionArea` · `transferArea` · `areaScenario` + 환지 3필드는 **이미 자산-수준 폼 필드로 존재**한다 (`lib/stores/calc-wizard-asset.ts:91~110`).
- 기본정보(① 섹션) 안에 **면적 시나리오 섹션이 이미 완성되어 있다** — 시나리오 Select 4종(same·partial·reduction·increase) + 시나리오별 입력 분기 + ⓘ 툴팁까지 (`components/calc/transfer/asset-sections/AssetSectionBasic.tsx:298~441`).
- 단, 그 전체가 **`asset.assetKind === "land"` 단일 게이트 안에 갇혀 있다** (`AssetSectionBasic.tsx:298`, 주석도 "면적 정보 — 토지 자산만 표시").

따라서 실제 작업은 **① land 게이트 해제(전 자산유형 확대) + ② 특례 섹션에 흩어진 중복 면적 입력을 기본정보로 승격·단일화 + ③ 겸용주택 전체 면적 기준 정합**이다.

이 정정 덕분에 범위가 taxonomy 로드맵의 **Phase 2-2 완결 + Phase 3 부분**으로 축소된다. 신규 폼 필드·엔진 필드 추가는 **0건**이 목표다(14 동기화 지점 중 ①②③⑨⑩⑫⑬⑭ 무변경).

---

## 1. 실측 결과 (전부 file:line 확인 — 추정 없음)

### 1.1 taxonomy 로드맵 진행 상태

| Phase | 항목 | 실측 상태 |
|---|---|---|
| 2-1 | `AssetForm`에 면적 3+3필드 추가 | ✅ 완료 — `calc-wizard-asset.ts:91,93,102,106,108,110` |
| 2-1 | `AssetForm.landAreaM2` 제거 | ✅ 완료 — 마이그레이션에서 삭제 (`calc-wizard-asset-migrate.ts:25~29`) |
| 2-1 | `TransferFormData.pre1990AreaSqm` 제거 | ✅ 완료 — 잔존 3곳 전부 마이그레이션 주석·delete (`calc-wizard-asset-migrate.ts:4,20,30`) |
| 2-2 | 자산 카드에 시나리오 드롭다운 | 🟠 **land 전용** — `AssetSectionBasic.tsx:298` 게이트 |
| 3 | 라벨 표준화·툴팁 | 🟡 부분 — land 섹션에만 적용 (`:371~378`, `:392~399`, `:409~416`) |

> `landAreaM2`가 52개 파일에 잔존하지만, 이는 **엔진·API 파라미터 이름**(`building-std-price-form.ts:85`의 대지지분면적, `transfer-tax-api-inheritance.ts:78`의 엔진 입력 키)이며 `AssetForm` 필드가 아니다. taxonomy가 제거 대상으로 지목한 것은 후자이며 이미 제거됐다. **엔진 파라미터명 rename은 본 작업 범위 밖**(Surgical Changes).

### 1.2 면적 소비 지점 (엔진)

| 소비처 | 참조 필드 | 인용 |
|---|---|---|
| 비사업용토지 판정 | `asset.acquisitionArea` → `NonBusinessLandInput.landArea` | `lib/tax-engine/non-business-land/form-mapper.ts:70` · `types.ts:462` |
| 토지 기준시가 | `standardPricePerSqmAtAcquisition × acquisitionArea` | `lib/tax-engine/types/transfer.types.ts:543,551` |
| 양도 당시 면적 | `transferArea` | `transfer.types.ts:109` |
| NBL 목장 기준면적 초과 안분 | `input.landArea` vs `resolvedStandardArea` | `non-business-land/pasture.ts:152~167` |
| NBL 면적 안분 비율 | `nonBusinessAreaRatio` (엔진 파생) | `non-business-land/engine.ts:275` · `transfer.types.ts:151` |

**핵심**: NBL은 `acquisitionArea` **단일 필드**를 자산 전체 면적으로 소비한다. 즉 사용자가 이 값을 입력할 수 없으면 `landArea = 0`으로 판정에 들어간다(`form-mapper.ts:70`의 `?? 0`).

### 1.3 중복 입력 경로 (같은 `acquisitionArea`를 쓰는 UI 지점)

| 입력 위치 | 노출 조건 | 인용 |
|---|---|---|
| 기본정보 면적 섹션 | `assetKind === "land"` | `AssetSectionBasic.tsx:298` |
| 취득시 기준시가 위젯 (단가×면적) | `acqStdPriceRequired && !showAcqStdReadonly` | `CompanionAcqPurchaseBlock.tsx:594~601` |
| 양도시 기준시가 위젯 | `useEstimatedAcquisition` | `CompanionAcqPurchaseBlock.tsx:639~646` |
| PHD §164⑦ 섹션 | PHD 토글 ON | `PreHousingDisclosureSection.tsx:112~113` |
| 환지 시나리오 | `areaScenario === "increase"` 라벨 분기 | `CompanionAcquisitionCauseSection.tsx:146~151` |
| 토지·건물 분리 | 분리 모드 | `LandBuildingSplitSection.tsx:139~140` |
| 일반건물 취득 카드 | `general_building` | `GeneralBuildingAcquisitionCards.tsx:127~128` |
| NBL 기타토지 | **읽기 전용** (입력 없음) | `nbl/OtherLandDetailSection.tsx:599` |

→ 같은 폼 필드를 **7개 위치에서 write**한다. 사용자에게는 "면적 칸이 여기저기 또 나온다"로 보이고, 어느 특례도 켜지 않으면 **입력 칸이 사라진다**.

### 1.4 실측으로 확인한 결함 — validate가 없는 칸을 가리킨다

`lib/calc/transfer-tax-validate-asset.ts:457~459`:

```
// 일반 자산: acquisitionArea 직접 입력 필요 (겸용주택은 면적 자동 계산이므로 제외)
if (!asset.acquisitionArea || parseFloat(asset.acquisitionArea) <= 0)
  return `${label}: 토지 면적(㎡)을 입력하세요. (자산 기본 정보)`;
```

- 이 검증은 **PHD(§164⑦) 경로**에서 걸린다 → PHD 대상은 `housing`.
- 오류 메시지는 "**(자산 기본 정보)**"에서 입력하라고 안내한다.
- 그러나 기본정보 면적 섹션은 `assetKind === "land"` 전용이므로 **housing에서는 그 칸이 존재하지 않는다.**
- 실제 입력은 PHD 섹션 내부(`PreHousingDisclosureSection.tsx:112`)에서만 가능 → **안내와 실제 입력 위치 불일치.**

`transfer-tax-validate-nbl.ts:32`도 동일하게 `acquisitionArea > 0`을 요구한다.

이 두 지점이 본 작업의 회귀 방지 anchor 기준점이다 (memory `feedback_ui_gate_removes_sole_input_path`).

### 1.5 겸용주택 — 현행은 파트별 면적, 자동 계산

겸용주택은 파트별 면적 필드를 별도로 갖는다 (`lib/stores/calc-wizard-asset-mixed-use.ts:74~80`):

`residentialExclusiveArea` · `commercialExclusiveArea` · `commonArea` · `residentialFloorArea` · `nonResidentialFloorArea` · `buildingFootprintArea` · `mixedUseTotalLandArea`

그리고 validate는 겸용주택을 `acquisitionArea` 요구에서 **명시적으로 제외**한다(`validate-asset.ts:457` 주석: "겸용주택은 면적 자동 계산이므로 제외", `validate-mixed-use-asset.ts:90`).

사용자 확정 방향 (a)에 따라 **겸용주택의 기본정보 면적은 "전체 면적"**을 받고, 파트별 면적은 겸용 전용 섹션에 그대로 둔다(용도별 안분의 정본은 파트별 면적이므로 폐지하지 않는다).

---

## 2. 범위

### 2.1 In scope

1. **`housing`의 `acquisitionArea` 입력 경로 확보** — 최우선. 현재 PHD 섹션에만 있어 PHD를 끄면 입력 불가. 기본정보 면적 섹션의 `assetKind === "land"` 게이트를 `land` + `housing`으로 확대.
2. **환지 시나리오(reduction·increase)는 토지 한정 유지** — 환지처분은 토지 제도(소득령 §162의2)이므로 게이트 확대 시 시나리오 옵션을 자산유형별로 제한.
3. **상가·일반건물·재개발·겸용의 전용 면적 필드를 기본정보로 승격(위치 이동)** — 필드는 그대로, 렌더 위치만 ① 기본정보로. **필드 통합 금지**(§3.2 — §164⑥ 3축 산식).
4. **중복 입력 경로 단일화** — 지점별 결정(§1.3 7곳). `StandardPriceInput` 계열은 같은 필드 양방향 read/write 유지, 파생 표시 가능 지점은 `SplitAcqStdReadonlyPanel` 선례 적용.
5. **validate 정합** — ⑧ 지점. `:393` stale 메시지 정정(§3.4) + `partial` 불변식 추가(§3.3).
6. **라벨 표준화** — taxonomy 원칙 C(`[세법 역할] + [기준 시점] + "면적 (㎡)"`). 재개발 "토지면적 (㎡)" 등 비준수 라벨 교체.

### 2.2 Out of scope (명시적 제외)

- 엔진 파라미터명 `landAreaM2` rename (52파일 영향, 기능 무변화 — Surgical Changes 위반).
- NBL 세부 면적 필드(`nblVilla*Area`·`nblOther*Area` 등 18개) 통합 — 각각 독립 법령 요건 면적이며 자산 전체 면적과 별개(`non-business-land/types.ts:213` 주석 명시).
- 다필지(`parcels[]`) 면적 체계 — taxonomy가 "이미 최종 형태"로 판정(§6.1).
- 기준시가 자동조회 로직 변경.

---

## 3. Phase 0 — 실측 완료 (rev.2에서 전건 해소)

anchor: `__tests__/lib/calc/transfer-asset-area-axis.anchor.test.ts` (12건) · `__tests__/components/asset-section-basic-area-gate.anchor.test.tsx` (6건) — **18건 전부 green**.

### 3.1 해소 결과

| # | 항목 | 결과 |
|---|---|---|
| U-1 | 겸용 전체 면적 | ✅ **`mixedUseTotalLandArea`가 이미 담당** — API `totalLandArea`로 전달(`transfer-tax-api-mixed-use.ts:54`), 전용 위젯(`MixedUseAreaInputs.tsx:213`), 전용 검증(`validate-mixed-area.ts:24`). **신규 필드 불필요** |
| U-2 | `validate-asset.ts:392~394` 정체 | ✅ 증환지(`increase`) 시나리오 — land 전용 |
| U-4 | 상가·일반건물 면적 사용 | ✅ **사용함, 전용 3축** — 상가 `cbLandArea`+`cbExclusiveArea`+`cbSharedArea`(`commercial-building-valuation.ts:62,196,245`) / 일반건물 `gbLandArea`+`gbBuildingArea`+`gbBuildingFootprintArea`(`calc-wizard-asset-gb.ts:19,21,23`) |
| U-5 | 재개발 면적 개념 | ✅ **있음** — `redevLandArea`(`RedevelopmentValuationSection.tsx:161`), 라벨 "토지면적 (㎡)" — 원칙 C 비준수 |
| U-6 | `StandardPriceInput` uncontrolled 위험 | ✅ **현행 위험 없음** — `isAreaMode`는 `land`·`building_non_residential` 한정(`StandardPriceInput.tsx:98~100`). `area` 미전달 양도세 호출부 3곳은 전부 `house_individual` → area 미사용 |
| U-7 | 면적 초기값 | ✅ `areaScenario: "same"`, 면적 2필드 `""` (`calc-wizard-asset-factory.ts:86~88`) |
| U-8 | `area-scenario-select` testid | ✅ **사용 중** — `e2e/transfer-replot-increase-estimated.spec.ts:30` → **변경 금지 계약** |
| R4 | NBL 면적 검증 현행 차단 | ✅ **버그 아님** — `validate-nbl.ts:25`가 `assetKind !== "land"`에서 즉시 null. land에는 기본정보 면적 칸 존재 |

### 3.2 rev.2 핵심 정정 — 각 자산유형은 이미 전용 전체면적 필드를 갖는다

실측 결과 **"필드를 하나로 통합"은 불가능하며 불필요하다.** `assetKind`는 8종이고(`calc-wizard-asset.ts:62`), 겸용주택은 `assetKind`가 아니라 `isMixedUseHouse` 플래그다(`calc-wizard-asset-mixed-use.ts:37,73`).

| assetKind | 전체 토지면적 필드 | 건물 면적 필드 | 현행 입력 위치 |
|---|---|---|---|
| `land` | `acquisitionArea`/`transferArea` | — | **① 기본정보** ✅ |
| `housing` (일반) | `acquisitionArea` | — (개별주택가격 총액) | 🟠 **PHD 섹션에만** |
| `housing` + `isMixedUseHouse` | `mixedUseTotalLandArea` | `residentialExclusiveArea`·`commercialExclusiveArea`·`commonArea` 외 | 겸용 전용 섹션 |
| `commercial_building` | `cbLandArea` | `cbExclusiveArea`+`cbSharedArea` | 상가 전용 섹션 |
| `general_building` | `gbLandArea` | `gbBuildingArea`·`gbBuildingFootprintArea` | 일반건물 전용 섹션 |
| `redevelopment_apt`·`right_to_move_in` | `redevLandArea` | — | 재개발 전용 섹션 |

- 상가는 §164⑥ 산식이 **대지·전유·공용 3축**을 각각 요구한다(`commercial-building-valuation.ts:196` `floorAreaTotal = exclusiveArea + commonArea`, `:245` `landPriceAtAcquisition × landArea`). 이를 `acquisitionArea` 하나로 합치면 산식이 깨진다.
- 따라서 사용자 확정 방향 (a)의 실행 형태는 **"필드 통합"이 아니라 "입력 위치를 ① 기본정보로 승격 + `acquisitionArea` 입력 경로 확보"**다.

### 3.3 신규 발견 — 자산-수준 면적 검증이 전무하다

throwaway probe 실측: `land` + `purchase` + 취득가액 입력 상태에서 `same`/`partial` × 면적 4조합(100/150, 150/100, 빈/빈, 100/100) **8조합 전부 `null`(통과)**.

- taxonomy §4.1이 요구하는 `partial: acquisitionArea >= transferArea` 불변식이 **자산-수준에 미구현**. 검증은 다필지 `parcels[]` 경로에만 존재(`validate-asset.ts:73~79`).
- 면적을 소비하지 않는 경로(실지거래가 + NBL 미사용)에서 면적을 요구하지 않는 것 자체는 **정상**이다 — 과도 차단 금지.
- → Phase 5에서 `partial` 불변식만 추가. anchor A-6이 뒤집힐 대상으로 고정됨.

### 3.4 신규 발견 — validate 메시지가 같은 필드를 두 위치로 안내

| 위치 | 메시지 | 실제 위치 |
|---|---|---|
| `validate-asset.ts:393` (증환지) | "종전토지 면적(**③ 취득정보**의 취득 당시 면적)" | ① 기본정보 |
| `validate-asset.ts:459` (PHD) | "토지 면적(㎡)을 입력하세요. (**자산 기본 정보**)" | ① 기본정보 (단 land 전용 게이트) |

`:393`이 stale이다 — 면적 섹션은 `AssetSectionBasic.tsx:298`, 즉 ① 기본정보에 있다. Phase 5에서 통일한다. anchor A-5가 이 드리프트를 고정한다.

---

## 4. 성공 기준 (검증 가능)

1. `assetKind`별 케이스 매트릭스 전 분기에서 기본정보 면적 입력 → NBL `landArea` 도달 anchor 통과.
2. PHD(housing) 경로에서 기본정보 면적만 입력하고 PHD 섹션 면적 칸을 건드리지 않아도 `validate-asset.ts:458` 검증 통과 (안내↔입력 위치 일치).
3. 같은 자산에서 면적 입력 칸이 **화면상 2개 이상 나타나지 않음** (E2E로 `data-testid` 카운트).
4. `npx tsc --noEmit` 0건 · `npm run test:transfer` 회귀 0건.
5. Pre-Do anchor 우선 작성 (memory `feedback_pre_anchor_verification`) — 특히 P0-1·P0-5.

---

## 5. 단계 계획

```
Phase 0  ✅ 완료 — U-1~U-8·R4 실측 해소 + anchor 18건 green
Phase 1  ✅ 완료 — AREA_SCENARIOS_BY_ASSET_KIND 상수화 + 환지 land 전용 제한 (R-2 green)
Phase 2  ✅ 완료 — 게이트 land → land+housing 확대 (RTL 13건 + E2E 2건 green)
Phase 3  ✅ 완료 — 중복 0이 이미 충족임을 실측·계약화 (이동 불필요, 아래 §5.1)
Phase 4  ✅ 완료 — 재개발 라벨 2건 원칙 C 정정 (GB·상가는 대상 아님, §5.2)
Phase 5  ✅ 완료 — :393 메시지 정정 + partial 불변식 추가 (A-5·A-6 뒤집힘)
```

### 5.1 Phase 3 — "이동"이 아니라 "중복 0 계약"으로 완결

Phase 3의 성공 기준은 "면적 칸 중복 0"이었다. 실측 결과 **이미 충족 상태**이며, 전용 면적 섹션들이 상호배타 게이트 아래 있기 때문이다:

| 자산유형 | 상호배타 근거 |
|---|---|
| 상가 | `AssetSectionAcquisition.tsx:293` `acquisitionCause !== "inheritance"` → `CommercialBuildingBlock` / `CommercialInheritanceStdPriceSection.tsx:38~44` `=== "inheritance"` → 상속 전용. **두 「면적 정보 (㎡)」 카드는 동시 렌더 불가** |
| 재개발 | `RedevelopmentValuationSection.tsx:174` `isLand ? <LandContrib…> : <main>` 삼항 |
| 일반건물 | `GeneralBuildingBlock.tsx:299~313` 단일 위치 |
| land·housing | 기본정보 면적 섹션 단독 (Phase 2) |

→ 전용 섹션을 ① 기본정보로 **물리적 이동**하는 것은 (a) 성공 기준을 개선하지 못하고, (b) 면적을 그것이 쓰이는 곳(단가×면적 총액 표시·`BuildingStdPriceModalButton` prefill)에서 분리시키며, (c) 각 블록의 `sectionNum` 번호 체계를 깨뜨린다. **Simplicity·Surgical 원칙상 수행하지 않는다.**

대신 상호배타성을 회귀로부터 지키는 계약을 테스트로 고정했다 — `__tests__/components/asset-area-input-no-duplication.anchor.test.tsx` 3건. 게이트를 잘못 완화하면(예: 상속 조건 제거) 같은 필드를 두 곳에서 입력받게 되고 사용자는 어느 값이 반영되는지 알 수 없다.

> 위치 통일(모든 면적을 ① 기본정보로)을 UX 목표로 별도 추진하려면 독립 과제로 다루어야 한다 — 본 작업의 결함 해소 범위 밖이다.

### 5.2 Phase 4 — 재개발 2건만 대상

| 위치 | 변경 | 근거 |
|---|---|---|
| `RedevelopmentValuationSection.tsx:239` | "토지면적 (㎡)" → "취득·양도 당시 토지 면적 (㎡)" | hint가 "시점별 동일 가정" 명시 → `same` 라벨 형식 |
| `RedevelopmentValuationSection.tsx:402` | 동상 | hint "§166③ 분자·분모 공통 면적. 취득·관리처분 시점 동일 가정." |

**대상 아님** (원칙 C 적용이 오표시가 되는 경우):

- 상가 "전용면적"·"공유면적"·"대지면적" — 물건 고유 속성이며 시점 개념이 없다.
- GB "토지면적"(등기부·토지대장 기재)·"건물 연면적"(건축물대장)·"건물 수평투영면적"(§168의12 판정) — 대장 기재 속성. "취득 당시 건물 수평투영면적"은 의미를 왜곡한다.
- ~~GB "토지면적"은 미검증 → 보류~~ → **후속 실측으로 해소, 정정 완료** (§5.3).

### 5.3 후속 실측 (2026-07-30, PR #907 이후)

**GB `gbLandArea` = 재개발과 동일 구조 → 원칙 C 적용 확정.** 단일 필드가 취득·양도 양쪽 곱셈 인자로 쓰인다:

```
general-building-valuation.ts:499  transferLandPricePerSqm    × input.landArea   (양도시)
general-building-valuation.ts:528  acquisitionLandPricePerSqm × input.landArea   (취득시)
general-building-valuation.ts:644~650  §168의12 비사업용 배율 판정 분모
```

→ `GeneralBuildingBlock.tsx:298` "토지면적" → **"취득·양도 당시 토지 면적"**, hint에 "취득시·양도시 기준시가 양쪽의 곱셈 인자 — 시점별 동일 가정" 명시.

**여전히 대상 아님**: 상가 전용·공유·대지면적(물건 속성), GB "건물 연면적"·"건물 수평투영면적"(건축물대장 기재 속성 — 시점 표기가 의미를 왜곡).

### Phase 1~2 구현 결과 (2026-07-30)

`components/calc/transfer/asset-sections/AssetSectionBasic.tsx` (454 → 514줄, 800 정책 여유):

| 추가 | 내용 |
|---|---|
| `AREA_SCENARIOS_BY_ASSET_KIND` | `Partial<Record<assetKind, AreaScenario[]>>` — **키 부재 = 미렌더**. `land`(4종)·`housing`(same·partial)만 등재 |
| `AREA_SCENARIO_LABEL` | 시나리오 라벨 단일 소스 — 트리거·옵션 중복 문자열 제거 |
| `areaScenarioOptions(asset)` | 겸용(`isMixedUseHouse`)은 빈 배열 반환 → 전용 섹션이 정본 |
| `areaResetPatchForAssetKind()` | assetKind 변경 시 허용 외 `areaScenario` + 환지 3필드를 **단일 배치**로 리셋. 허용되면 패치 없음(불필요 리셋 금지) |

| 변경 | 위치 |
|---|---|
| 게이트 `assetKind === "land"` → `areaScenarioOptions(asset).length > 0` | 면적 섹션 진입 |
| Select 옵션 하드코딩 4개 → 허용 목록 `.map()` | 시나리오 Select |
| `same` 라벨 주택 분기 "취득·양도 당시 **토지** 면적 (㎡)" | 원칙 C |
| assetKind 버튼 `onChange`에 리셋 패치 병합 | 자산 종류 |

검증: `tsc` 0건 · 전체 vitest **12,331건 통과**(1,105 파일) · lint 0 errors · 폰트·톤 게이트 통과 · E2E 4건(신규 2 + 환지·겸용 회귀 2) 통과.

신규 테스트: `__tests__/components/asset-section-basic-area-gate.anchor.test.tsx` 13건(R-1·R-2·R-3·R-4·R-5·R-6) · `e2e/transfer-housing-area-basic-info.spec.ts` 2건.

Phase 2와 Phase 3은 성격이 다르다 — Phase 2는 **없던 입력 경로를 만드는 것**(기능 결함 해소, 우선), Phase 3은 **있는 입력을 옮기는 것**(UX 통일). Phase 2만으로도 사용자 요청의 핵심(비사업용토지 판정·기준시가 계산에 면적 활용)은 충족된다. Phase 3~4는 독립 PR로 분리 가능.

---

## 6. 리스크

| # | 리스크 | 완화 |
|---|---|---|
| R1 | 게이트 해제로 기존 housing·상가 화면에 면적 칸이 새로 등장 → 기존 E2E 셀렉터·스냅샷 깨짐 | Phase 2 직후 전체 E2E 1회 (memory `feedback_blocking_validation_full_e2e_regression`) |
| R2 | 특례 섹션 면적을 읽기 전용으로 바꾸면 그 섹션 단독 사용 플로우가 입력 불가로 전환 | 지점별로 read/write 양방향 vs 읽기전용 결정 — 일괄 적용 금지 |
| R3 | ~~겸용 전체 면적 신설이 파트별과 불일치~~ | ✅ **해소** — 신규 필드 없음(`mixedUseTotalLandArea` 재사용, §3.1 U-1) |
| R4 | ~~NBL 검증이 게이트 해제 전 차단~~ | ✅ **해소** — `validate-nbl.ts:25` assetKind 게이트로 현행 버그 아님 |
| R5 | `area-scenario-select` testid 변경 시 기존 E2E 파손 | **보존 계약** — `e2e/transfer-replot-increase-estimated.spec.ts:30` (§3.1 U-8) |
| R6 | 게이트 확대로 신규 `StandardPriceInput` 호출이 `land`/`building_non_residential` propertyKind에 `area` 미전달 → uncontrolled 내부 state로 store 미저장(dual-truth) | 신규 호출부는 `area`+`onAreaChange` 동시 전달 강제. `isAreaMode` 조건(`StandardPriceInput.tsx:98~100`) 확인 후 배선 |

---

## 7. 변경 이력

| 날짜 | 버전 | 변경 |
|---|---|---|
| 2026-07-30 | v1.0 | 최초 작성 — 실측 기반. "신규 추가" 가정을 "게이트 해제 + 승격"으로 정정 |
| 2026-07-30 | v1.1 (rev.2) | Phase 0 완료. U-1~U-8·R4 전건 해소(anchor 18건). **핵심 정정: 자산유형별 전용 면적 필드가 이미 존재 → 필드 통합 불가·불필요, (a)는 "입력 위치 승격"으로 확정.** 겸용 신규 필드 폐기. 신규 발견 2건(자산-수준 검증 전무 · validate 메시지 드리프트). 단계 6→6 재편, R3·R4 해소·R5·R6 추가 |
| 2026-07-30 | v1.2 | Phase 1~5 전건 완료. **Phase 3 정정: "이동"이 아니라 "중복 0 계약"으로 완결** — 전용 섹션이 상호배타 게이트 아래 있어 중복이 이미 0이며, 물리적 이동은 기준을 개선하지 못하고 면적↔사용처를 분리시킨다(§5.1). Phase 4 대상을 재개발 2건으로 한정(§5.2 — GB·상가 라벨은 대장·물건 속성이라 원칙 C 적용이 오표시). Phase 5 partial 불변식은 면적 섹션 노출 전 자산유형 공통 적용 |
