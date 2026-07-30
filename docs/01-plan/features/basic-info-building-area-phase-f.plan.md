# 양도소득세 — 기본사항에 건물 면적(연면적·바닥면적) 추가 · Phase F

> 작성일: 2026-07-30 (분할본 v1.0 — `basic-info-building-area-phase-ef.plan.md` rev.7에서 F1만 추출)
> 브랜치: `feat/basic-info-area-single-source` (PR #912 후속)
> 선행: [`basic-info-area-single-source.plan.md`](basic-info-area-single-source.plan.md) — 46필드 인벤토리·3축 모델·Phase A~E
> 별건 분리: [`transfer-partial-area-apportionment.plan.md`](transfer-partial-area-apportionment.plan.md) — 일부양도 면적 안분(B-4)
> 사용자 지적(2026-07-30): 기본정보 면적 입력에 **토지만 있고 건물(연면적·바닥면적)이 없다.**

---

## 0. 확정 결론 (구현자는 이 절만 보면 된다)

7차 검토·anchor 20건·법령 조회를 거쳐 확정된 사항이다. **다른 절과 충돌하면 이 절이 유효하다.**

| # | 결정 | 근거 |
|---|---|---|
| D-1 | 축 B(건물 연면적)를 **신규 단일 필드 `buildingFloorArea`**로 신설한다 (β-2) | §3.2 · A-6 |
| D-2 | `acquisitionArea`/`transferArea`는 **축 A(토지) 전용**으로 의미 확정. `building` 자산의 축 B를 `buildingFloorArea`로 **이전**(마이그레이션) | §3.1 |
| D-3 | `building`의 면적 시나리오를 **`["same"]`으로 축소**한다 | §3.2 · A-6 |
| D-4 | 축 C(바닥면적)는 **기존 `buildingFootprintArea` 재사용** — 신규 필드 0개 | §2.2 |
| D-5 | 축 C 입력칸을 기본사항에 추가한다 (`housing` 대상) | §2 |
| D-6 | 주택 경로 **3곳**에 `floorArea` prefill을 배선한다 | §2.2 |
| D-7 | **⑦ 결과 카드는 변경하지 않는다** | §4 U-4 |
| D-8 | **`land`에 축 C를 추가하지 않는다** | §4 U-5 |
| D-9 | **F3(NBL 정착면적 통합)은 폐기** — 법령 개념이 달라 통합 불가. "이중 입력 UX 개선"으로 격하 | §4 U-3 |

**착수 조건**: A-1·A-6 ✅ 해소. **A-3·A-4는 미작성 — Do 전 필요**(§5).

---

## 1. 해소하는 결함 2건

### 1.1 F-1 — 주택 바닥면적의 입력 경로가 게이트에 갇혔다

`buildingFootprintArea`(AssetForm 최상위 필드)의 소비처는 자산 종류를 가리지 않는다:

| 소비처 | 용도 |
|---|---|
| `lib/tax-engine/appurtenant-land-rate.ts:220` | **「소득세법 시행령」 제154조 제7항 부수토지 한도** — `limitArea = buildingFootprintArea × 배율(3/5/10)` |
| `lib/tax-engine/transfer-tax-mixed-use-helpers.ts:92` | 겸용 주거분 정착면적 안분 |
| `lib/calc/transfer-tax-api.ts:683` | 값이 있으면 무조건 전송(자산 종류 무관) |

그런데 **입력 UI는 2곳뿐이고 둘 다 게이트 뒤**에 있다:

| 입력 위치 | 진입 조건 |
|---|---|
| `mixed-use/MixedUseAreaInputs.tsx:201` | `isMixedUseHouse === true` (겸용 분리계산 ON) |
| `NewConstructionFootprintSection.tsx:135` | `acquisitionCause === "newConstruction"` **AND** `assetKind === "housing"` (`CompanionAssetCardNewConstruction.tsx:60`) |

→ **주택 · 겸용 OFF · 취득원인 매매**인 자산에는 바닥면적 입력 칸이 없다.

미입력 시 거동(`appurtenant-land-rate.ts:204,267~279` 실측 인용):
```ts
const hasFootprintArea =
  primary.buildingFootprintArea !== undefined && primary.buildingFootprintArea > 0;
if (hasFootprintArea) { /* §154⑦ 한도 → excessArea 분리, 초과분 excessRate 0.40 */ }

// 정착면적 미입력 시 fallback — 한도 검증 생략, 전량 부수토지로 가정
return {
  applied: true,
  unifiedRate: rateDecision,
  excessArea: 0,                      // ← 초과분 없음으로 확정
  appliedReason: appliedReason + " (정착면적 미입력 — 전량 부수토지로 가정)",
};
```

**성격 — 침묵이 아니라 "고칠 수 없는 명시된 가정"**: `appliedReason`은 `shortTermNote`로 승격(`transfer-tax-rate-calc.ts:225`)돼 신고서 서식 주석(`FilingFormTableHelpers.ts:695`)·상세명세서(`DetailedStatementHelpers.ts:691`)·다건 자산별 주석(`FilingFormTableAggregateHelpers.ts:200`)에 **출력된다**. 사용자는 그 가정을 보지만 **고칠 입력 수단이 없다**.

두 가지가 결함이다:
1. **입력 경로 부재** — memory `feedback_ui_gate_removes_sole_input_path`
2. **자동 fallback 정책 위반 방향** — 「미입력은 검증 오류로 차단」인데 납세자 유리 쪽(전량 부수토지 인정)으로 가정한다

**영향 범위**: `resolveCompanionLandRate(companion, primaryCtx)`는 companion 토지 자산의 세율을 결정하고 정착면적은 primary(주택) 자산에서 온다(`transfer-tax-rate-calc.ts:192~204` · `route.ts:496~505`). → **주택 + 부수토지를 별개 자산 2건으로 입력한 구성**(사례 28 계열)에서 발동한다.

**A-1 실측 — 세액 결함 확정** (anchor `basic-info-building-area.anchor.test.ts`):

| | 정착면적 100㎡ | 미입력 |
|---|---|---|
| `limitArea` | **500㎡** (100 × 5배 도시지역) | **`undefined`** |
| `excessArea` | **200㎡** (700 − 500) | **0** |
| `excessRate` | **0.40** | `undefined` |
| `unifiedRate` | 주택 세율 | 주택 세율 (동일) |

차이는 "초과 200㎡를 40%로 뗄지"다. 방향은 케이스 의존(이 구성은 주택 70%·토지 40%라 미입력이 과다과세, 주택이 비과세·장기보유면 반대)이나 **세액이 달라지는 것은 확정**이다.

배율 3단계가 한도를 결정한다 — 같은 정착면적 100㎡가 zone별로 한도 300/500/1000㎡(초과 400/200/0㎡). 정착면적이 없으면 **이 축 전체가 무력화**된다.

### 1.2 F-2 — 주택 건물 연면적이 없어 건물기준시가 모달이 매번 재입력을 요구한다

국세청 건물기준시가는 **㎡당 × 연면적**이고, `BuildingStdPriceModalButton`의 `prefill`이 `floorArea`를 받는다(`:54~55`). 배선 현황:

| 호출부 | `landAreaM2` | `floorArea` |
|---|---|---|
| `GeneralBuildingBlock.tsx:344,372` | `gbLandArea` | ✅ `gbBuildingArea` |
| `CommercialBuildingBlock.tsx:241,271` | `cbLandArea` | ✅ `totalFloorArea`(전유+공용 파생) |
| `CommercialInheritanceStdPriceSection.tsx:115` | `cbLandArea` | ✅ |
| `mixed-use/MixedUseAssetMajorStdPrice.tsx:368` · `MixedUseLegacyStdPrice.tsx:205,334` | — | ✅ `nonResidentialFloorArea` |
| **`TransferStdPriceCards.tsx:139`** (주택·토지 주 경로) | `transferArea` | 🔴 **없음** |
| **`LandBuildingSplitSection.tsx:207`** | `acquisitionArea` | 🔴 **없음** |
| **`ReductionPhdInput.tsx:227,255`** | `value.landAreaSqm` | 🔴 **없음** |

**왜 세액이 틀어지나**: 모달의 `floorArea`는 로컬 state(`:90 useState(0)`)이고 폼 복원은 `snapshotKey`별로 갈린다(`:98~100`, 키가 시점별로 다름 — `bsp-${assetId}-gb-acq` vs `-gb-transfer`). GB·상가는 같은 폼 필드를 두 시점 모달에 모두 주입해 일관성이 강제되지만, 주택은 prefill이 없어 사용자가 3시점 모달에서 각각 손으로 넣고 **불일치가 검증 없이 통과**한다(memory `feedback_3point_input_consistency`).

**U-2 해소 — 배선 안전**: `initialForm={{ ...restoredForm, ...prefillForm }}`(`:184`)이므로 **prefill이 승리**한다. 부작용 점검 2건:

| 항목 | 결론 |
|---|---|
| 기존 자산의 모달 입력이 지워지나 | ❌ 아니다. `prefillForm`은 `...(prefill.floorArea ? {...} : {})` — **빈 값 미주입**(`:121`) |
| 사용자가 모달에서 고쳐도 재오픈 시 폼 값으로 되돌아감 | ✅ 의도된 동작. 폼이 정본이어야 3시점 일관성이 성립한다(GB·상가 선례) |

**⚠️ A-3 미작성**: F-2가 실제로 세액을 바꾸는 수치 증거가 아직 없다. F-1은 A-1으로 검증했으므로 **같은 기준을 적용해야 한다**(§5).

---

## 2. 승격 판정 기준

### 2.0 Phase E 실측 결과 — 축 C "확인 필요" 6건 (승격 판정의 근거)

선행 계획서 §5.3이 "확인 필요"로 남긴 6건. 폼→Zod→엔진 배선을 전부 코드로 확인했다 — **배선 누락 0건**(선행 계획서의 "미배선 의심"은 `form-mapper.ts`만 grep한 오판이며 실제 매핑은 `form-mapper-helpers.ts`에 있다).

| # | 필드 | 법령 근거 | 배선 | 성격 | 통합? |
|---|---|---|---|---|---|
| E-1 | `nblOtherBuildingFloorArea` | 「지방세법 시행령」 제101조 제1항 제2호 나목 | ✅ `form-mapper-helpers.ts:240` → `other-land.ts:504` | 바닥면적이지만 **배율 미적용** carve-out(2% 미달 시 이 면적만 별도합산) | ⚠️ 개념 동일·용도 상이 |
| E-2 | `nblOtherMixedUseSpecificFootprint` / `TotalFootprint` | 「소득세법 시행령」 제168조의11 제6항 제2호 | ✅ `:245~246` → `other-land.ts:204~205` | **비율의 분자·분모** | 🔴 불가 |
| E-3 | `parcels[].buildingFootprintArea` | 동조 제5항 제2호 (연접 다필지) | ✅ `:223` → `contiguous-parcel-proportioning.ts:46` | **필지별** 값 | 🔴 불가 |
| E-4 | `gbBuildingFootprintArea` | 「지방세법 시행령」 제101조 제1항 제2호·제2항 | ✅ `transfer-tax-api-gb.ts:109,164,241` | 자산-수준 단일 바닥면적 | ✅ 가능 (⚠️U-13) |
| E-5 | `buildingFootprintArea` | 「소득세법 시행령」 제154조 제7항 + 겸용 안분 | ✅ `transfer-tax-api.ts:683` 등 | 자산-수준 단일 바닥면적 — **이미 공유 필드** | ✅ 이미 공유 |
| E-6 | 별장 부속토지 | 「소득세법 시행령」 제168조의13 제1항 | — | `nblVillaBuildingFloorArea`는 **연면적 150㎡ 법정요건**(농어촌주택)이며 정착면적 배율이 **없다** | 🔴 **가설 오류** → 축 B 재분류 |

**선행 계획서 정정 2건**: (1) "별장 부속토지 10배"는 **그런 배율 규정이 없다** — `villa-land.ts:105~114`는 연면적 ≤150㎡ · 부속토지 ≤660㎡ · 기준시가 ≤2억의 **요건 판정**이다. 축 C 목록에서 제거. (2) "확인 필요" 3건은 전부 배선돼 있었다.

→ **축 C 필드는 7개가 아니라 6개**이고, 통합 대상은 **2개**(E-4·E-5)다.

### 2.1 판정 규칙

선행 계획서 §6 "통합 금지"를 판정 가능한 규칙으로 정리한다.

> **자산-수준 단일 값**이면 기본사항으로 승격한다. **분해값**(용도별·시점별·필지별·비율 분자/분모)이면 전용 필드로 유지한다.

| 분류 | 필드 | 판정 |
|---|---|---|
| 자산-수준 단일 (승격 후보) | `gbLandArea` · `cbLandArea` · `mixedUseTotalLandArea` · `redevLandArea` (축 A) | **F2** |
| | `gbBuildingArea` (축 B) · `gbBuildingFootprintArea` · `buildingFootprintArea` (축 C) | **F1·F2** |
| 용도별 분해 | `residentialFloorArea` / `nonResidentialFloorArea` (합=연면적) · `cbExclusiveArea` / `cbSharedArea` (다른 단가) | 전용 유지 |
| 비율 분자/분모 | `nblOtherMixedUseSpecific*` / `Total*` | 전용 유지 |
| 필지별 | `parcels[].landArea` · `parcels[].buildingFootprintArea` | 전용 유지 |
| 법정 요건 면적 | `nblVillaBuildingFloorArea`(150㎡) · `nblOtherBuildingFloorArea`(배율 미적용 carve-out) · 감면 조문 면적(135·149㎡ 등) | 전용 유지 — 같은 물리량이라도 요건 판정용이라 승격 시 의미가 흐려진다 |
| 별개 사건 | `extensionFloorArea` · `gbExtensionArea` (증축 — 가산세 게이트) | 전용 유지 |

**⚠️ U-13 (미검증)**: `buildingFootprintArea`(「소득세법」 제89조①3호 → 시행령 제154조⑦)와 `gbBuildingFootprintArea`(「소득세법」 제104조의3①4호나목 → 「지방세법 시행령」 제101조)는 **근거 법령이 완전히 다르다**. 물리량은 둘 다 "건물 전체 바닥면적"으로 보이지만, U-3에서 배율표가 같아도 곱셈 대상("건물" ↔ "주택")이 달랐던 선례가 있다. **F2 착수 전 두 조문의 "건축면적" 정의 대조 필수.** F1은 이 둘을 통합하지 않으므로 영향 없다.

### 2.2 승격 방식 — 필드 이동이 아니라 **입력 위치 추가**

`useEffect → store` 미러링 금지 정책 하에서 안전한 패턴은 이미 확립돼 있다(components/calc/CLAUDE.md "같은 의미 폼 필드의 양방향 read/write 통합"):

- **같은 폼 필드를 두 위치에서 직접 read/write** — 자동 동기화, 미러링 불필요
- 전용 블록의 입력칸은 **제거하지 않는다**(그 블록만 보고 작업하는 사용자 경로 보존)
- API·validate는 fallback 없이 **단일 필드**를 읽으므로 ⑧ 모순이 생기지 않는다

→ 축 C는 기존 `buildingFootprintArea` 재사용이므로 **신규 필드 0개**(D-4).

### 2.3 F1 작업 목록

```
F1-a  기본사항 면적 섹션에 「건물 연면적」 입력 추가 (신규 필드 buildingFloorArea)
      + building 자산의 축 B를 acquisitionArea → buildingFloorArea 이전 (§3.1)
      + building 면적 시나리오를 ["same"]으로 축소 (D-3)

F1-b  기본사항 면적 섹션에 「건물 바닥면적(정착면적)」 입력 추가
      → 기존 buildingFootprintArea 재사용 (F-1 입력경로 소멸 해소)

F1-c  주택 경로 3곳에 floorArea prefill 배선 (F-2 3시점 불일치 해소)
      TransferStdPriceCards · LandBuildingSplitSection · ReductionPhdInput
```

**F2**(승격 후보 확대 — GB·상가·겸용·재개발의 자산-수준 면적 통합)는 **F1 이후 별도**로 다룬다. **F3는 폐기**(D-9).

---

## 3. 축 B 필드 설계

### 3.1 왜 `acquisitionArea`에서 이전해야 하는가

PR #912(Phase A)에서 `assetKind === "building"`을 기본사항 면적 섹션에 올릴 때 축 B 전용 필드가 없어 `acquisitionArea`에 실었다. 그 결과 같은 필드가 자산 종류에 따라 축이 갈린다:

```
AREA_LABEL_BY_ASSET_KIND (AssetSectionBasic.tsx)
  land     → "취득·양도 당시 면적 (㎡)"          ← acquisitionArea = 축 A
  housing  → "취득·양도 당시 토지 면적 (㎡)"     ← acquisitionArea = 축 A
  building → "취득·양도 당시 건물 연면적 (㎡)"   ← acquisitionArea = 축 B 🔴
```

**이 이원성이 이미 실제 결함을 만들고 있다 (U-6 확정)**:
```ts
// CompanionAcqPurchaseBlock.tsx:116~117
const isSplitable =
  props.assetKind === "housing" || props.assetKind === "building";
```
`building`("건물(토지 제외)")에서도 "토지·건물 취득일 다름"을 켤 수 있고, 그러면 `LandBuildingSplitSection.tsx:207`이 `landAreaM2: asset.acquisitionArea`를 넘긴다 — **연면적이 토지면적 자리로 들어간다.**

→ `acquisitionArea`를 축 A 전용으로 확정하면 이 혼동이 **구조적으로 불가능**해진다(D-2).

**⚠️ U-12 (별건)**: "건물(토지 제외)" 자산에 토지·건물 분리가 왜 허용되는가 — 라벨과 `isSplitable`이 모순이다. β 이전 후에도 별건으로 확인 필요.

### 3.2 단일 필드 확정 (β-2) — A-6 근거

`acquisitionArea`/`transferArea`는 **2시점 쌍**으로 소비된다(`transfer-tax-api-burdened-gift.ts:141~145` 시점별 단가 × 시점별 면적 · `StandardPriceInput` `area={acquisitionArea}`/`area={transferArea}`). 따라서 축 B를 단일 필드로 옮기면 `building`의 `partial` 시나리오가 깨진다.

**A-6 실측 — `partial`은 보존할 기능이 아니라 오답 생성 구조다.** partial 전용 안분 로직이 **없다**(`areaScenario`는 API까지 전달되지만 엔진이 소비하지 않는다 — `transfer-tax-api-helpers.ts:341`):

취득 ㎡당 100만 · 양도 ㎡당 200만 · 양도가액 5억:

| 시나리오 | 취득 기준시가 | 양도 기준시가 | 환산비율 | 환산취득가 | 양도차익 |
|---|---|---|---|---|---|
| `same` (100·100㎡) | 1억 | 2억 | 0.5 | 250,000,000 | 250,000,000 |
| **`partial` (200·100㎡)** | **2억** | 2억 | **1.0** | **500,000,000** | **0** 🔴 |

면적비가 단가 상승을 상쇄해 양도가액 전액이 취득가액이 된다(과소과세).

→ **β-2 확정**: 축 B를 단일 `buildingFloorArea`로 신설(GB `gbBuildingArea` 선례 일치) + `building` 시나리오를 `["same"]`으로 축소(D-1·D-3). 연면적의 취득↔양도 차이는 **증축 전용 필드**(`extensionFloorArea`·`gbExtensionArea`)가 담당한다는 기존 설계와 정합하다.

> 같은 왜곡이 `land`·`housing`의 `partial`에도 있다 — **별건**으로 분리했다: [`transfer-partial-area-apportionment.plan.md`](transfer-partial-area-apportionment.plan.md). β-2가 `building` 경로 하나를 자동 소멸시킨다.

### 3.3 표시 대상 assetKind

| assetKind | 축 A 토지 | 축 B 연면적 | 축 C 바닥면적 | 근거 |
|---|---|---|---|---|
| `housing` | ✅ 현행 | **신설** | **신설** | 건물기준시가(B) + §154⑦(C) |
| `land` | ✅ 현행 | ❌ | ❌ **추가 안 함** | `nblHousingFootprint`가 담당하고 그 필드는 법 제104조의3①5호 전용 개념 (D-8·§4 U-5) |
| `building` | ❌ (토지 제외 자산) | **`buildingFloorArea`로 이전** | ❌ | 부수토지 판정 없음 |

### 3.4 마이그레이션

`migrateAsset`에 이전 로직을 추가한다. 선례: `gbBuildingFloors → gbBuildingFootprintArea` 흡수 + `delete`(`calc-wizard-asset-migrate.ts:509~520`).

```ts
// β-2: building 자산의 축 B를 acquisitionArea → buildingFloorArea 로 이전 (2026-07-30)
// ⚠️ 순서 — assetKind normalize(:429~430)보다 뒤에 두어야 한다(fallback "building" 확정 후).
if (a.assetKind === "building" && !a.buildingFloorArea && a.acquisitionArea) {
  a.buildingFloorArea = a.acquisitionArea;
  a.acquisitionArea = "";   // 축 A(토지) 전용으로 의미 확정
  a.transferArea = "";      // β-2 — 시나리오가 ["same"]으로 축소되므로 쌍이 불필요
}
```

---

## 4. 검증 완료 항목 (U-1~U-11 전건 해소)

| # | 항목 | 결론 |
|---|---|---|
| U-1 | §154⑦ 한도의 세액 영향 | ✅ 초과 200㎡ ↔ 0㎡로 갈린다 — **세액 결함 확정** (§1.1) |
| U-2 | `prefillForm` ↔ `restoredForm` 우선순위 | ✅ prefill 승리, 빈 값 미주입 → F1-c 배선 안전 (§1.2) |
| **U-3** | `nblHousingFootprint` ↔ `buildingFootprintArea` 동일성 | ✅ **다르다.** 「소득세법」 제89조①3호 "**건물**이 정착된 면적"(비과세 한도) ↔ 제104조의3①5호 "**주택**이 정착된 면적"(NBL). 배율표는 동일(3/5/5/10)하나 곱셈 대상이 갈려 겸용에서 값이 다르다. 코드도 이미 구분한다 — `residentialFootprintArea = round2(buildingFootprintArea × 주택연면적비율)`(`mixed-use-helpers.ts:92`), NBL 판정은 이 값을 쓴다(`:425`) → **F3 폐기**(D-9) |
| **U-4** | 축 B 결과 카드 표시 필요성 | ✅ **불필요.** 정본 표시는 「건물 기준시가 계산서」 서식(`components/calc/building-std-price/`). 상가(`CommercialBuildingValuationDetailCard.tsx:123,125`)·겸용(`MixedUseResultCardParts.tsx:141,145`)은 있으나 **GB조차 결과 카드에 연면적 미표시** → **⑦ 무변경**(D-7) |
| **U-5** | `land`에 축 C 필요성 | ✅ **추가 안 함.** `nblHousingFootprint`로 NBL 섹션에서 이미 받고(`NblSectionContainer.tsx:200`), U-3에 따라 범용 바닥면적과 합치면 안 된다(D-8) |
| **U-6** | `building`에서 split 토글이 보이는지 | ✅ **보인다.** `isSplitable = housing \|\| building`(`CompanionAcqPurchaseBlock.tsx:116`) → §3.1. β-2가 해소 |
| U-7 | `building` + `partial` downstream 지원 | ✅ 안분 로직 없음, 환산비율 왜곡 → **β-2 확정** (§3.2) |
| U-8~U-11 | 일부양도 안분 (B-4 계열) | ✅ 별건 문서로 이관 → [`transfer-partial-area-apportionment.plan.md`](transfer-partial-area-apportionment.plan.md) |

### 남은 미검증 (F1 착수를 막지 않음)

| # | 항목 | 처리 |
|---|---|---|
| U-12 | "건물(토지 제외)" ↔ `isSplitable` 모순 | 별건 — β-2 이전 후 확인 (§3.1) |
| U-13 | `buildingFootprintArea` ↔ `gbBuildingFootprintArea` 법령 개념 동일성 | **F2 착수 전 필수** — F1 무관 (§2) |

---

## 5. anchor 현황 — **A-3·A-4 미작성**

anchor 파일: `__tests__/tax-engine/transfer-tax/basic-info-building-area.anchor.test.ts` (20건)

| # | anchor | 상태 |
|---|---|---|
| A-1 | §154⑦ 한도 초과 시나리오 — 정착면적 有/無 세액 차이 | ✅ 작성 (5건) |
| A-2 | `applied: false` 경로 거동 | ⚠️ 부분 — `excessArea: 0` 고정. 초과분 40%의 하류 소비 지점 미추적 |
| **A-3** | 주택 건물기준시가 3시점 불일치 재현 | 🔴 **미작성 — Do 전 필수.** F-1을 A-1으로 검증했으므로 F-2도 같은 기준을 적용해야 한다(§1.2) |
| **A-4** | `building` `acquisitionArea`가 기준시가 곱셈 인자로 도달하는지 | 🔴 **미작성 — Do 전 필수.** β-2 마이그레이션 안전성의 전제(§3.4) |
| A-5 | 축 C 6건 배선 회귀 가드 | 🔴 미작성 — F2 착수 시 필요(F1 무관) |
| A-6 | `building` + `partial` 지원 여부 | ✅ 작성 (4건) |
| A-7 | β 마이그레이션 회귀 | 🔴 미작성 — **F1 Do에서 함께 작성**(정상) |

**A-6 외 B-4 계열 anchor 11건**(B-4 5건 · U-9 4건 · U-10 3건 중 일부)은 별건 문서 소관이나 같은 파일에 있다. 파일 분리는 하지 않는다 — 같은 면적 축을 다루므로 응집도가 높고, describe 제목에 소관이 명시돼 있다.

---

## 6. 14 동기화 지점 (F1)

신규 필드 `buildingFloorArea` 1개 + 기존 `buildingFootprintArea` 입력 위치 추가.

| # | 지점 | F1 조치 |
|---|---|---|
| ① | `AssetForm` | `buildingFloorArea: string` 추가 |
| ② | `makeDefaultAsset` | `""` |
| ③ | `migrateAsset` | `undefined → ""` + **`building` 자산 축 B 이전**(§3.4) |
| ④ | `transfer-tax-api*.ts` | 축 B 소비처 전송 |
| ⑤ | `AssetSectionBasic.tsx` | 축 B·C 입력칸 (assetKind별 조건부) + `building` 시나리오 `["same"]` 축소 |
| ⑥ | 사이드바 | 면적은 합계 대상 아님 — **무변경** |
| ⑦ | 결과 카드 | **무변경** (D-7) |
| ⑧ | `transfer-tax-validate-asset.ts` | 축 B·C 필수 여부 판정 — **소비하지 않는 경로에서 필수화 금지**(Phase 5 선례) |
| ⑨⑩ | Zod enum | 신규 enum 없음 |
| ⑪ | 자산-수준 fallback | 해당 없음 |
| **⑫** | `transfer-tax-schema-sub.ts` | `buildingFloorArea: z.string().optional()` |
| **⑬** | `callTransferTaxAPI` body spread | grep 자가 점검 |
| **⑭** | Route handler 엔진 input 매핑 | 축 B 소비 엔진(건물기준시가 경로) 확인 |

**F1-c는 14지점 밖**이다 — 폼 필드 신설이 아니라 기존 모달 prefill 배선이다.

---

## 7. 리스크

| # | 리스크 | 완화 |
|---|---|---|
| R2 | β 마이그레이션이 기존 `building` 자산 sessionStorage를 깨뜨림 | `migrateAsset` 이전 로직 + **A-7 anchor**. memory `feedback_new_asset_field_stale_sessionstorage_guard` |
| R3 | 기본사항 입력칸이 늘어 ① 섹션이 비대해짐 | assetKind별 조건부 렌더 유지(현행 `AREA_SCENARIOS_BY_ASSET_KIND` 패턴) |
| R4 | 전용 블록 입력칸을 남기면 두 곳을 다르게 채운 것으로 오인 | 같은 필드 read/write이므로 물리적으로 불가능 — 두 위치에 같은 값이 보이는 것에 대한 hint 필요 |
| R8 | β 마이그레이션이 `assetKind` 정규화보다 앞서면 fallback `building` 케이스를 놓침 | 배치 순서를 `:429~430` 뒤로 고정 + A-7 (§3.4) |
| **R9** | `building` 시나리오 `["same"]` 축소가 기존 partial 사용자 데이터를 무효화 | 마이그레이션에서 `transferArea` 정리(§3.4). 실사용 데이터는 PR #912 이후라 거의 없다 |

> 해소된 리스크(R1·R5·R6·R7)는 변경 이력 참조.

---

## 8. 변경 이력

| 날짜 | 버전 | 변경 |
|---|---|---|
| 2026-07-30 | v1.0 | **분할본** — `basic-info-building-area-phase-ef.plan.md` rev.7(651줄)에서 **F1만 추출**. 폐기된 처방 3세대(rev.4 B4-1/2/3 · rev.5 §8.7.3 · rev.6 §8.8.4)를 제거하고 유효 결론을 §0 「확정 결론」으로 통합. stale 4건 정정(F-1 "침묵 스킵" → "고칠 수 없는 명시된 가정" · F3 → 폐기 · 리스크 R1·R5·R7 해소 반영 · anchor "착수 전 필수" → **A-3·A-4 미작성 명시**). 신규 U-13(`buildingFootprintArea` ↔ `gbBuildingFootprintArea` 법령 개념 — F2 전제)·R9 |

### 통합 전 문서의 정정 이력 (요약)

| rev | 정정 내용 |
|---|---|
| rev.1 | 최초 — Phase E 완료(축 C 6건 배선 확인, "별장 10배" 가설 오류 정정) + 결함 2건 |
| rev.2 | F-1이 "침묵 스킵"이 아님(신고서에 출력됨) · β는 "단일 필드"로 끝나지 않음(2시점 쌍 소비) · U-2 해소 · U-6 신규 |
| rev.3 | A-1·A-6 실측 — F1-b는 세액 결함 확정 · **β-2 확정** |
| rev.4 | B-4 실측 — partial 왜곡이 `land`·`housing`에도 있다(별건 분리) |
| rev.5 | U-9 — 실거래가 모드는 성격이 다르다(별건) |
| rev.6 | U-10 — 안분 기준은 면적비가 아니다(별건) |
| rev.7 | U-3·U-4·U-5·U-6·U-11 — **F3 폐기** · "감정가액 안분 배척" 정정(별건) |
