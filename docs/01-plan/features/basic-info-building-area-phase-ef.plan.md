# 양도소득세 — 기본사항에 건물 면적(연면적·바닥면적) 추가 (Phase E 실측 + Phase F 계획)

> 작성일: 2026-07-30
> 브랜치: `feat/basic-info-area-single-source` (PR #912 후속)
> 선행: [`basic-info-area-single-source.plan.md`](basic-info-area-single-source.plan.md) — 46필드 인벤토리·3축 모델·Phase A~D
> 사용자 지적(2026-07-30): 기본정보 면적 입력에 **토지만 있고 건물(연면적·바닥면적)이 없다.** 기준시가 계산이 여기 입력한 면적을 참조해야 한다.

---

## 0. 요약

선행 계획서가 남긴 **Phase E**(축 C "확인 필요" 6건 실측)를 완료했다. 결과:

- 축 C 6건 중 **배선 누락은 0건**이었다. 선행 계획서의 "미배선 의심"은 `form-mapper.ts`만 grep한 오판이며 실제 매핑은 `form-mapper-helpers.ts`에 있다.
- 대신 **다른 두 결함**이 확정됐다 — 둘 다 사용자가 지적한 지점이다.

| # | 결함 | 방향 |
|---|---|---|
| **F-1** | 주택 **바닥면적** 입력 경로가 겸용 ON·취득원인 신축일 때만 존재 → 일반 주택은 §154⑦ 부수토지 한도 검증이 **침묵 스킵** | 과다·과소 미정(한도 검증 자체가 안 돌음) |
| **F-2** | 주택 **건물 연면적**이 폼에 없어 건물기준시가 계산 모달에 `floorArea` prefill 미배선 → 시점별 모달에서 각각 수동 입력 → **3시점 불일치** | 기준시가 오답 |

축 C 통합 가능 필드는 **2개뿐**(`buildingFootprintArea`·`gbBuildingFootprintArea`)이고 나머지 4개는 법령상 통합 불가임을 확정했다(§1).

---

## 1. Phase E 실측 결과 — 축 C "확인 필요" 6건

전부 폼→Zod→엔진 배선을 코드로 확인했다. `form-mapper-helpers.ts`가 NBL 상세 필드의 실제 매핑 지점이다.

| # | 필드 | 법령 근거 | 배선 | 성격 | 통합 가능? |
|---|---|---|---|---|---|
| E-1 | `nblOtherBuildingFloorArea` | 「지방세법 시행령」 제101조 제1항 제2호 나목 | ✅ `form-mapper-helpers.ts:240` → `other-land.ts:504` | 바닥면적이지만 **배율 미적용** carve-out(2% 미달 시 이 면적만 별도합산) | ⚠️ 개념 동일·용도 상이 |
| E-2 | `nblOtherMixedUseSpecificFootprint` / `TotalFootprint` | 「소득세법 시행령」 제168조의11 제6항 제2호 | ✅ `:245~246` → `other-land.ts:204~205` | **비율의 분자·분모**(여러 건물 바닥면적비) | 🔴 불가 |
| E-3 | `parcels[].buildingFootprintArea` | 연접 다필지 (동조 제5항 제2호) | ✅ `:223` → `contiguous-parcel-proportioning.ts:46` | **필지별** 값 | 🔴 불가 |
| E-4 | `gbBuildingFootprintArea` | 「지방세법 시행령」 제101조 제1항 제2호·제2항 | ✅ `transfer-tax-api-gb.ts:109,164,241` | 자산-수준 단일 바닥면적 | ✅ **가능** |
| E-5 | `buildingFootprintArea` | 「소득세법 시행령」 제154조 제7항 + 겸용 안분 | ✅ `transfer-tax-api.ts:683` 등 | 자산-수준 단일 바닥면적 — **이미 공유 필드** | ✅ **이미 공유** |
| E-6 | 별장 부속토지 | 「소득세법 시행령」 제168조의13 제1항 | — | `nblVillaBuildingFloorArea`는 **연면적 150㎡ 법정요건**(농어촌주택)이며 정착면적 배율이 **없다** | 🔴 **가설 오류** — 축 B로 재분류 |

### 1.1 선행 계획서 정정 2건

| 항목 | 선행 서술 | 실측 |
|---|---|---|
| §5.3 "별장 부속토지 10배 — 미확인" | 축 C 후보로 등재 | 🔴 **그런 배율 규정 없음.** `villa-land.ts:105~114`는 연면적 ≤150㎡ · 부속토지 ≤660㎡ · 기준시가 ≤2억의 **요건 판정**이다. 축 C 목록에서 제거 |
| §5.3 3건 "확인 필요" | 배선 미확인 | ✅ 전부 배선됨 |

→ **축 C 필드는 7개가 아니라 6개**이고, 그중 통합 대상은 **2개**다.

---

## 2. 🔴 결함 F-1 — 주택 바닥면적의 입력 경로가 게이트에 갇혔다

### 2.1 소비처는 자산 종류를 가리지 않는다

`buildingFootprintArea`(AssetForm 최상위 필드)의 소비처 3곳:

| 소비처 | 용도 |
|---|---|
| `lib/tax-engine/appurtenant-land-rate.ts:220` | **「소득세법 시행령」 제154조 제7항 부수토지 한도** — `limitArea = buildingFootprintArea × 배율(3/5/10)` |
| `lib/tax-engine/transfer-tax-mixed-use-helpers.ts:92` | 겸용 주거분 정착면적 안분 |
| `lib/calc/transfer-tax-api.ts:683` | 값이 있으면 무조건 전송(자산 종류 무관) |

### 2.2 그런데 입력 UI는 2곳뿐이고 둘 다 게이트 뒤에 있다

| 입력 위치 | 진입 조건 |
|---|---|
| `components/calc/transfer/mixed-use/MixedUseAreaInputs.tsx:201` | `isMixedUseHouse === true` (겸용주택 분리계산 ON) |
| `components/calc/transfer/NewConstructionFootprintSection.tsx:135` | `acquisitionCause === "newConstruction"` **AND** `assetKind === "housing"` (`CompanionAssetCardNewConstruction.tsx:60`) |

→ **스크린샷의 자산 1(주택 · 겸용 OFF · 취득원인 매매)은 바닥면적 입력 칸이 없다.**

### 2.3 결과 — 침묵 스킵

`appurtenant-land-rate.ts:204`:
```ts
const hasFootprintArea =
  primary.buildingFootprintArea !== undefined && primary.buildingFootprintArea > 0;
...
if (hasFootprintArea) { /* §154⑦ 한도 계산 → 초과분 분리 */ }
// else: 한도 검증 없이 전량 부수토지 인정 경로로 진행
```

정착면적이 0이면 **한도 초과 판정 자체가 일어나지 않는다.** 오류 메시지도 없다.

memory `feedback_ui_gate_removes_sole_input_path`와 동일 패턴이다 — 공유 필드의 유일 입력 경로가 특정 모드 게이트 안에 있어서, 그 모드가 아니면 필드가 영구 공백이 된다.

**⚠️ 미검증**: §154⑦ 한도 검증이 실제 세액을 바꾸는 시나리오(부수토지가 한도를 초과하는 companion 자산 구성)를 anchor로 재현해야 한다. `applied: false` 경로에서 초과분이 어떻게 처리되는지 확인 전이다 — Phase F 착수 전 probe 필수(§6).

---

## 3. 🔴 결함 F-2 — 주택 건물 연면적이 없어 건물기준시가 모달이 매번 재입력을 요구한다

### 3.1 국세청 건물기준시가는 연면적 곱셈이다

`BuildingStdPriceModalButton`의 `prefill`은 `floorArea`(연면적) + `landAreaM2`를 받는다(`:54~55`). 이 모달이 계산한 값이 곧 취득·양도 시 건물 기준시가다.

### 3.2 `floorArea` prefill 배선 현황 — 주택만 빠져 있다

| 호출부 | `landAreaM2` | `floorArea` |
|---|---|---|
| `GeneralBuildingBlock.tsx:344,372` | `gbLandArea` | ✅ `gbBuildingArea` |
| `CommercialBuildingBlock.tsx:241,271` | `cbLandArea` | ✅ `totalFloorArea`(전유+공용 파생) |
| `CommercialInheritanceStdPriceSection.tsx:115` | `cbLandArea` | ✅ |
| `mixed-use/MixedUseAssetMajorStdPrice.tsx:368` · `MixedUseLegacyStdPrice.tsx:205,334` | — | ✅ `nonResidentialFloorArea` |
| **`TransferStdPriceCards.tsx:139`** (주택·토지 주 경로) | `transferArea` | 🔴 **없음** |
| **`LandBuildingSplitSection.tsx:207`** | `acquisitionArea` | 🔴 **없음** |
| **`ReductionPhdInput.tsx:227,255`** | `value.landAreaSqm` | 🔴 **없음** |

### 3.3 왜 세액이 틀어지는가 — 시점별 스냅샷 분리

모달의 `floorArea`는 **로컬 state**(`:90 useState(0)`)이고, 폼 복원은 `snapshotKey`별로 갈린다(`:98~100`). 스냅샷 키는 시점별로 다르다(`bsp-${assetId}-gb-acq` vs `-gb-transfer`).

→ GB·상가는 **같은 폼 필드를 두 시점 모달에 모두 주입**해 일관성이 강제된다. 주택은 prefill이 없으니 사용자가 취득·최초공시·양도 3시점 모달에서 연면적을 각각 손으로 넣는다 → **불일치가 검증 없이 통과**한다.

memory `feedback_3point_input_consistency`가 정확히 이 위험을 기록하고 있다.

---

## 4. 승격 판정 기준 (통합 금지 원칙의 구체화)

선행 계획서 §6 "통합 금지"를 판정 가능한 규칙으로 정리한다.

> **자산-수준 단일 값**이면 기본사항으로 승격한다. **분해값**(용도별·시점별·필지별·비율 분자/분모)이면 전용 필드로 유지한다.

| 분류 | 필드 | 판정 |
|---|---|---|
| 자산-수준 단일 (승격 후보) | `gbLandArea` · `cbLandArea` · `mixedUseTotalLandArea` · `redevLandArea` (축 A) | 승격 후보 — **F2** |
| | `gbBuildingArea` (축 B) · `gbBuildingFootprintArea` · `buildingFootprintArea` (축 C) | 승격 후보 — **F1·F2** |
| 용도별 분해 | `residentialFloorArea` / `nonResidentialFloorArea` (합=연면적) · `cbExclusiveArea` / `cbSharedArea` (다른 단가) | **전용 유지** |
| 비율 분자/분모 | `nblOtherMixedUseSpecific*` / `Total*` | **전용 유지** |
| 필지별 | `parcels[].landArea` · `parcels[].buildingFootprintArea` | **전용 유지** |
| 법정 요건 면적 | `nblVillaBuildingFloorArea`(150㎡) · `nblOtherBuildingFloorArea`(배율 미적용 carve-out) · 감면 조문 면적(135·149㎡ 등) | **전용 유지** — 같은 물리량이라도 요건 판정용이라 승격 시 의미가 흐려진다 |
| 별개 사건 | `extensionFloorArea` · `gbExtensionArea` (증축 — 가산세 게이트) | **전용 유지** |

### 4.1 승격 방식 — 필드 이동이 아니라 **입력 위치 추가**

`useEffect → store` 미러링 금지 정책 하에서 안전한 패턴은 이미 확립돼 있다(components/calc/CLAUDE.md "같은 의미 폼 필드의 양방향 read/write 통합"):

- **같은 폼 필드를 두 위치에서 직접 read/write** — 자동 동기화, 미러링 불필요
- 전용 블록의 입력칸은 **제거하지 않는다**(그 블록만 보고 작업하는 사용자 경로 보존)
- API·validate는 fallback 없이 **단일 필드**를 읽으므로 ⑧ 모순이 생기지 않는다

→ F1은 **신규 필드 1개**(축 B)만 필요하고, 축 C는 기존 `buildingFootprintArea` 재사용이다.

---

## 5. Phase F 단계 계획

```
F1  주택 최소 — 사용자 지적 직접 해소
    F1-a  기본사항 면적 섹션에 「건물 연면적」 입력 추가 (신규 필드 buildingFloorArea)
    F1-b  기본사항 면적 섹션에 「건물 바닥면적(정착면적)」 입력 추가
          → 기존 buildingFootprintArea 재사용 (F-1 입력경로 소멸 해소)
    F1-c  주택 경로 3곳에 floorArea prefill 배선 (F-2 3시점 불일치 해소)
          TransferStdPriceCards · LandBuildingSplitSection · ReductionPhdInput

F2  승격 후보 확대 — GB·상가·겸용·재개발의 자산-수준 면적을 기본사항과 단일 필드로 통합
    (전용 블록 입력칸은 같은 필드 read/write로 유지)

F3  NBL 정착면적 통합 판단 — nblHousingFootprint ↔ buildingFootprintArea
    두 필드가 같은 "정착면적"인지 확정 후 통합 여부 결정
```

### 5.1 F1 상세 — 표시 대상 assetKind

`AREA_SCENARIOS_BY_ASSET_KIND`(`AssetSectionBasic.tsx`)에 등재된 3종만 면적 섹션이 렌더된다. 축별 표시 여부:

| assetKind | 축 A 토지 | 축 B 연면적 | 축 C 바닥면적 | 근거 |
|---|---|---|---|---|
| `housing` | ✅ 현행 | **신설** | **신설** | 건물기준시가(B) + §154⑦·NBL 주택부수토지(C) |
| `land` | ✅ 현행 | ❌ | ⚠️ **판단 필요** | 나대지면 건물 없음. 단 NBL 주택부수토지·건물부수토지는 토지 위 건물의 정착면적을 쓴다 → 현행 `nblHousingFootprint`가 담당(F3에서 통합 판단) |
| `building` | ❌ (토지 제외 자산) | ✅ 현행(`acquisitionArea`) | ❌ | 부수토지 판정 없음 |

**⚠️ `building`의 라벨 재검토**: 현행 `AREA_LABEL_BY_ASSET_KIND.building = "취득·양도 당시 건물 연면적 (㎡)"`이 `acquisitionArea`를 가리킨다. F1에서 별도 `buildingFloorArea`를 신설하면 **같은 물리량이 두 필드에 갈린다**. 두 안:

| 안 | 내용 | 평가 |
|---|---|---|
| **F1-α** | `building`은 현행 `acquisitionArea` 유지, `housing`만 `buildingFloorArea` 신설 | 🔴 축 B가 두 필드로 갈림 — 후속 소비처가 어느 것을 읽을지 매번 분기 |
| **F1-β** (권장) | `buildingFloorArea`를 축 B **단일 정본**으로 신설하고 `building`도 이 필드로 이전. `acquisitionArea`는 축 A(토지) 전용으로 의미 확정 | 축 의미가 필드와 1:1. `building`은 마이그레이션 1건(`acquisitionArea` → `buildingFloorArea`) |

F1-β는 PR #912(Phase A)에서 `building`을 `acquisitionArea`에 실었던 결정을 되돌린다. Phase A 당시엔 축 B 전용 필드가 없어 불가피했으나, 신설하는 지금이 정정 시점이다.

---

## 6. Pre-Do anchor 설계 (착수 전 필수)

「검증 기준」 정책상 아래를 **Do 전에** 실측·고정한다.

| # | anchor | 확인 대상 |
|---|---|---|
| A-1 | §154⑦ 한도 초과 시나리오 재현 | `buildingFootprintArea` 有/無로 세액이 실제로 갈리는지. **갈리지 않으면 F-1은 결함이 아니다**(memory `feedback_numeric_impact_verify_before_bug_claim`) |
| A-2 | `applied: false` 경로 거동 | 한도 초과분이 어떤 세율로 처리되는지 — 초과분 40%(`excessRate`)가 어디서 소비되는지 |
| A-3 | 주택 건물기준시가 모달 3시점 불일치 재현 | 서로 다른 연면적을 넣으면 취득·양도 기준시가가 어긋나고 환산취득가가 틀어지는지 |
| A-4 | `building` assetKind 현행 면적 소비 | `acquisitionArea`가 실제로 `StandardPriceInput` 곱셈 인자로 도달하는지(F1-β 마이그레이션 안전성) |
| A-5 | 축 C 6건 배선 회귀 가드 | E-1~E-5 각 매핑이 살아있음을 고정 — F2·F3 리팩터 시 침묵 파손 방지 |

---

## 7. 14 동기화 지점 (F1)

신규 필드 `buildingFloorArea` 1개 + 기존 `buildingFootprintArea` 입력 위치 추가.

| # | 지점 | F1 조치 |
|---|---|---|
| ① | `AssetForm` | `buildingFloorArea: string` 추가 |
| ② | `makeDefaultAsset` | `""` |
| ③ | `migrateAsset` | `undefined → ""`. **F1-β 시 `building` 자산의 `acquisitionArea` → `buildingFloorArea` 이전 마이그레이션 추가** |
| ④ | `transfer-tax-api*.ts` | 축 B 소비처 전송 |
| ⑤ | `AssetSectionBasic.tsx` | 축 B·C 입력칸 (assetKind별 조건부) |
| ⑥ | 사이드바 | 면적은 합계 대상 아님 — 무변경 |
| ⑦ | 결과 카드 | 정착면적·연면적 표시 지점 확인 필요 |
| ⑧ | `transfer-tax-validate-asset.ts` | 축 B·C 필수 여부 판정 — **소비하지 않는 경로에서 필수화 금지**(Phase 5 선례) |
| ⑨⑩ | Zod enum | 신규 enum 없음 |
| ⑪ | 자산-수준 fallback | 해당 없음 |
| **⑫** | `transfer-tax-schema-sub.ts` | `buildingFloorArea: z.string().optional()` |
| **⑬** | `callTransferTaxAPI` body spread | grep 자가점검 |
| **⑭** | Route handler 엔진 input 매핑 | 축 B 소비 엔진(건물기준시가 경로) 확인 |

---

## 8. 리스크

| # | 리스크 | 완화 |
|---|---|---|
| R1 | F-1이 실제로는 세액 무영향(§154⑦ companion 경로가 드묾) | **A-1 anchor 선행** — 무영향이면 F1-b를 "입력 편의"로 격하하고 결함 주장 철회 |
| R2 | F1-β 마이그레이션이 기존 `building` 자산 sessionStorage를 깨뜨림 | `migrateAsset`에 이전 로직 + 마이그레이션 회귀 테스트. memory `feedback_new_asset_field_stale_sessionstorage_guard` |
| R3 | 기본사항에 입력칸이 늘어 ① 섹션이 비대해짐 | assetKind별 조건부 렌더 유지(현행 `AREA_SCENARIOS_BY_ASSET_KIND` 패턴) |
| R4 | 전용 블록 입력칸을 남기면 사용자가 두 곳을 다르게 채운 것으로 오인 | 같은 필드 read/write이므로 물리적으로 불가능 — 다만 두 위치에 같은 값이 보이는 것에 대한 hint 필요 |
| R5 | 축 C 통합(F3)이 `nblHousingFootprint`와 `buildingFootprintArea`의 법령 개념 차이를 지움 | F3 착수 전 두 조문 원문 대조 필수 — 「소득세법」 제104조의3 제1항 제5호(NBL) vs 「소득세법 시행령」 제154조 제7항(비과세 한도) |
| R6 | F1-c prefill 추가가 기존 스냅샷 복원과 충돌(`prefill` vs `restoredForm` 우선순위) | `BuildingStdPriceModalButton`의 병합 규칙 실측 후 배선 — **현재 미확인**(§9) |

---

## 9. 미검증 항목

| # | 항목 | 상태 |
|---|---|---|
| U-1 | §154⑦ 한도 검증의 실제 세액 영향 | 🔴 **미검증** — A-1 anchor로 확인 (R1) |
| U-2 | `prefillForm` ↔ `restoredForm` 병합 우선순위 | 🔴 미검증 — F1-c 배선 방식을 결정한다 (R6) |
| U-3 | `nblHousingFootprint` ↔ `buildingFootprintArea` 개념 동일성 | 🔴 미검증 — F3 전제 (R5) |
| U-4 | 축 B(연면적) 표시가 필요한 결과 카드 지점 | 미확인 — ⑦ |
| U-5 | `land` assetKind에 축 C가 필요한지 | 미확인 — §5.1 |

---

## 10. 변경 이력

| 날짜 | 버전 | 변경 |
|---|---|---|
| 2026-07-30 | v1.0 | 최초 작성 — **Phase E 완료**(축 C 6건 전부 배선 확인, 선행 계획서의 "미배선 의심" 2건·"별장 10배" 1건 정정) + **결함 2건 확정**(주택 바닥면적 입력경로 게이트 갇힘 · 주택 연면적 부재로 건물기준시가 3시점 불일치) + 승격 판정 기준·Phase F 3단계·anchor 5건·리스크 6건·미검증 5건 |
