# 양도소득세 — 면적 입력 전 자산유형 통일 (계획서)

> 상태: **Plan 확정 (미결 O-1~O-4 전건 해소 · Do 착수 가능)** · 작성 2026-08-04 · **rev.3**
> rev 이력: rev.2 자가검토 1사이클(오류 1·누락 4·모순 1 정정) → rev.3 미결 4건 사용자 확정
> 트리거: 사용자 요청 — "면적 부분을 이미지1(주택)과 같이 기본 정보 섹션으로 옮기는 작업을 했는데 주택 섹션에만 되었다. 모든 섹션이 주택처럼 되도록 통일"
> 선행 계획서: [`docs/01-plan/features/transfer-asset-area-basic-info.plan.md`](../01-plan/features/transfer-asset-area-basic-info.plan.md) (2026-07-30) — **본 계획은 그 §2.1-3 미완분의 완결**
> 상위 정본: [`docs/02-design/area-taxonomy.md`](../02-design/area-taxonomy.md) (2026-04-24 v1.0)
> 검증 원칙: 모든 file:line·법령·수치는 실측/조문 확인. 미확인은 "확인 필요" 명시.

---

## 0. 한 줄 요약

① 기본정보의 면적 섹션이 `land`·`housing`·`building` **3종 게이트**에 갇혀 있어, 나머지 5종(상가·일반건물·재개발APT·입주권·분양권)은 면적을 ③ 취득정보의 **전용 블록**에서 입력한다. 이 위치 분산을 해소하고, **토지 축 필드를 공통화**하며, 축 B·C 위젯과 시나리오를 전 자산으로 확대한다.

---

## 1. 배경 — "주택만 됐다"의 실제 원인

사용자가 본 현상은 정확하다. 다만 원인은 "주택만 작업했다"가 아니라 **다른 자산은 면적 입력이 다른 섹션에 이미 있다**는 것이다.

### 1.1 현행 면적 입력 위치 (실측)

| assetKind | 토지 축(A) | 건물 축(B) | 정착 축(C) | 현행 입력 위치 |
|---|---|---|---|---|
| `land` | `acquisitionArea`/`transferArea` | — | `nblHousingFootprint`(별개 개념) | **① 기본정보** ✅ |
| `housing` (일반) | `acquisitionArea`/`transferArea` | `buildingFloorArea` | `buildingFootprintArea` + `appurtenantLandZone` | **① 기본정보** ✅ |
| `building` (토지제외) | `acquisitionArea` (`same` 단일) | `buildingFloorArea` | — (토지 없음) | **① 기본정보** ✅ |
| `commercial_building` | `cbLandArea` | `cbExclusiveArea` + `cbSharedArea` | — | ③ `CommercialBuildingBlock` |
| `general_building` | `gbLandArea` | `gbBuildingArea` | `gbBuildingFootprintArea`(**별개 개념**) | ③ `GeneralBuildingBlock` |
| `redevelopment_apt`·`right_to_move_in` | `redevLandArea` | — | — | `RedevelopmentValuationSection` |
| `housing` + `isMixedUseHouse` | `mixedUseTotalLandArea` | `residentialFloorArea` 외 | `buildingFootprintArea` | `MixedUseSection` |
| `presale_right` | **없음** | 없음 | 없음 | — |

필드 정의: `calc-wizard-asset.ts:117`(`buildingFloorArea`)·`:637`(`nblHousingFootprint`)·`calc-wizard-asset-gb.ts:46`(`gbBuildingFootprintArea`)·`:197`(`buildingFootprintArea`)

### 1.2 현행 게이트 (`AssetSectionBasic.tsx`)

```ts
// :84-107  축 A — 3종만 등재
AREA_SCENARIOS_BY_ASSET_KIND = {
  land:    ["same", "partial", "reduction", "increase"],  // 4종
  housing: ["same", "partial"],                            // 2종
  building:["same"],                                       // 1종
}
// :133  축 B(연면적)
FLOOR_AREA_KINDS = new Set(["housing", "building"]);
// :137~  축 C(정착면적) — housing 단독
```

`:67-80` 주석이 제외 사유를 명시한다 — *"자산유형마다 전용 전체면적 필드가 이미 존재하므로 … 이들을 등재하면 같은 면적을 두 곳에서 입력받게 된다."*

### 1.3 선행 계획서와의 관계

`transfer-asset-area-basic-info.plan.md`(2026-07-30)의 **§2.1 In scope 항목 3**이 바로 본 요청이었다:

> 3. 상가·일반건물·재개발·겸용의 전용 면적 필드를 기본정보로 승격(위치 이동) — 필드는 그대로, 렌더 위치만 ① 기본정보로.

그러나 실행 결과 **`housing` 게이트 확대(항목 1)까지만** 반영되고 항목 3은 미실행으로 남았다. 본 계획은 그 미완분을 완결한다.

---

## 2. 사용자 확정 방향 (2026-08-04)

| # | 질문 | 사용자 선택 |
|---|---|---|
| **D1** | 통일 수준 | 필드까지 공통화 → **O-4 승인으로 「토지 축 한정」 확정** (§3) |
| **D2** | 축 C 위젯(정착면적·부수토지 소재지 구분) | **전 자산에 노출** (§4) |
| **D3** | 면적 시나리오 드롭다운 | **전 자산 확장** (§5) |

---

## 3. D1 확정 — 토지 축만 공통화 (O-4 승인, 2026-08-04)

### 3.1 토지 축 — 통합 **가능** (자산마다 정확히 1개)

각 자산의 토지 면적은 모두 **개별공시지가 × 면적** 하나의 산식 인자다. 의미가 동일하다.

| 자산 | 필드 | 엔진 소비 (실측) |
|---|---|---|
| 상가 | `cbLandArea` | `commercial-building-valuation.ts:245` `landPriceAtAcquisition × landArea` |
| 일반건물 | `gbLandArea` | `general-building-valuation.ts:506·535` `transferLandPricePerSqm × landArea` |
| 재개발·입주권 | `redevLandArea` | `transfer-tax-api-redev.ts:65·123·134` |
| 겸용 | `mixedUseTotalLandArea` | `transfer-tax-api-mixed-use.ts:54` `totalLandArea` |
| land·housing·building | `acquisitionArea`/`transferArea` | `transfer.types.ts:543·551` |

⇒ **`acquisitionArea`/`transferArea`로 흡수한다.** 이것이 D1의 본체다.

### 3.2 건물 축 — 통합 **불가** (자산마다 축 수·의미가 다름)

| 자산 | 축 | 산식 (실측) |
|---|---|---|
| 상가 | 전유 + 공용 **2축** | `commercial-building-valuation.ts:196` `floorAreaTotal = exclusiveArea + commonArea` → `:199` `unitPriceAtTransfer × floorAreaTotal` |
| 일반건물 | 연면적 + 바닥 **2축** | `gbBuildingArea`(환산 인자) · `gbBuildingFootprintArea`(NBL 배율 `:663` `allowedLandArea = buildingFootprintArea × multiplier`) |
| 주택 | 연면적 + 정착 **2축** | `buildingFloorArea`(건물분 기준시가) · `buildingFootprintArea`(§154⑦ 한도) |

상가의 `exclusiveArea`와 `commonArea`를 합치면 `floorAreaTotal` 합산 자체가 사라진다. 선행 계획서 §3.2의 "통합 불가" 판정은 **건물 축에 대해 유효**하다.

---

## 4. D2 — 축 C 전 자산 노출

### 4.1 🔴 정정 (rev.2) — 「정착면적」은 **서로 다른 3개 법령 개념**이다

rev.1은 `gbBuildingFootprintArea`를 주택 `buildingFootprintArea`와 같은 축으로 취급했다. **오류다.** 코드가 통합을 명시적으로 금지한다.

| 필드 | 법령 개념 | 정의 | 소비처 |
|---|---|---|---|
| `buildingFootprintArea` (housing·겸용) | 「소득세법」 §89①3호 **「건물이 정착된 면적」** | **1층 정착면적** | §154⑦ 부수토지 한도(3·5·10배) |
| `gbBuildingFootprintArea` (GB) | 「건축법 시행령」 §119①3호 **「바닥면적」** | 지하층 포함 **각 층 중 가장 넓은 값** | 「소득세법」 §104의3①4호나목 NBL 배율 |
| `nblHousingFootprint` (land) | 「소득세법」 §104의3①5호 **「주택이 정착된 면적」** | 주택 정착분 | NBL 주택부수토지 판정 |

`calc-wizard-asset-gb.ts:36-45` 실측 인용:

> ⚠️ 「건축법 시행령」 제119조 제1항 제3호의 「바닥면적」이며, 지하층을 포함한 각 층의 바닥면적 중 가장 넓은 값이다(대법원 2015.6.24. 2012두7073 · 대법원 1994.5.13. 93누18242 · 조심 2011지505 · 조심 2025지0451). … 「소득세법」 제89조 제1항 제3호의 「건물이 **정착**된 면적」(`buildingFootprintArea`, 1층 정착면적)과도 **다른 개념**이다 — **통합 금지**.

⇒ **세 필드는 각각 유지한다.** ①로 위치를 옮기더라도 라벨·hint에 근거 법령을 각각 표기해 사용자가 같은 값으로 오인하지 않게 한다.

### 4.2 축 C 소비처 실측

| 자산 | 정착면적 | `appurtenantLandZone`(3·5·10배) | 축 C 렌더 (O-1 확정) |
|---|---|---|---|
| `housing`(일반·겸용) | ✅ `buildingFootprintArea` → §154⑦ | ✅ | **렌더 (활성)** |
| `general_building` | 🟡 `gbBuildingFootprintArea` — **다른 개념**(NBL 배율) | ❌ §154⑦ 미적용 | **렌더 (활성)** |
| `land` | 🟡 `nblHousingFootprint` — **다른 개념** | ❌ | 현행 유지 |
| `commercial_building` | ❌ 현재 소비처 없음 | ❌ | **렌더 (장래 사용 예정)** |
| `building`(토지제외) | ❌ 현재 소비처 없음 | ❌ | **렌더 (장래 사용 예정)** |
| `redevelopment_apt`·`right_to_move_in`·`presale_right` | ❌ | ❌ | **미렌더** |

### 4.3 설계 — O-1 확정 (2026-08-04 사용자)

> **확정**: 「상가·건물은 면적을 앞으로 사용 예정이며, 재개발·입주권·분양권은 면적이 필요 없음」

- **소비처 있는 자산**(housing·general_building): 기존 전용 필드에 배선하고 **근거 법령을 라벨·hint에 표기**(§4.1 3개 개념 구분).
- **장래 사용 예정 자산**(commercial_building·building): 위젯을 렌더하되 **현재 세액에 반영되지 않음을 `hint`에 명시**한다. 값은 폼·저장소에 보존되어 장래 엔진 배선 시 그대로 쓰인다.
  - ⚠️ 엔진 소비처가 생기기 전까지 **validate에서 필수로 만들지 않는다** — 계산을 막으면 안 된다.
- **미렌더 자산**(redevelopment_apt·right_to_move_in·presale_right): 축 C 위젯을 렌더하지 않는다.
  - ⚠️ **축 A는 별개다** — 재개발·입주권의 `redevLandArea`는 엔진이 실제 소비하므로(`transfer-tax-api-redev.ts:65·123·134`) §3.1 토지 축 통합 대상으로 **유지**한다. O-1의 "면적 불필요"는 **축 C(정착면적·부수토지 배율) 한정** 해석이다.
- `land`는 `appurtenantLandZone`에 **절대 배선하지 않는다** — `nblHousingFootprint`와 별개 유지(합치면 겸용 오답, 선행 계획서 U-3).

> ⚠️ 정책 정합: 「법령 정확성 최우선」상 엔진이 쓰지 않는 값을 입력받으면 오해를 낳는다. 장래 사용 예정 2종은 **hint 명시 + validate 비강제**로 이 긴장을 해소한다.

---

## 5. D3 — 시나리오 확대

### 5.1 선례 — 기계적 복사가 버그를 냈다

`AssetSectionBasic.tsx:100-104` 실측:

> ⚠️ **`same` 단일**이다. 종전 `["same","partial"]`(PR #912)은 land·housing 패턴을 기계적으로 복사한 것으로, `partial`은 취득·양도에 **서로 다른 면적**을 기준시가 곱셈에 넣어 환산비율을 왜곡했다(면적비가 단가비를 상쇄해 양도차익 0). anchor: `basic-info-building-area.anchor.test.ts` A-6.

안전 조건도 명시 — *"`land`·`housing`처럼 `resolveAcqAreaForStdPrice`(B-4)를 태우면 `partial`도 안전해진다."*

### 5.2 확대의 전제 조건

| 시나리오 | 대상 | 전제 |
|---|---|---|
| `same` | 면적 섹션 렌더 자산 전부 | 없음 |
| `partial` | 면적 섹션 렌더 자산 전부 | **`resolveAcqAreaForStdPrice`(`transfer-tax-api-helpers.ts:407`)를 자산별로 태울 것** — 미이행 시 A-6 재발 |
| `reduction`·`increase` (감·증환지) | **`land` 한정 유지** (O-2 확정) | 환지처분은 토지 제도(「소득세법 시행령」 §162의2) |

### 5.3 O-2 확정 (2026-08-04 사용자)

> **확정**: 「감·증환지는 비토지에는 필요 없는 사항」

`reduction`·`increase`는 **`land` 전용 현행 게이트를 그대로 유지**한다. 확대 대상은 `same`·`partial` 2종뿐이다.

⇒ 자산별 최종 시나리오 구성:

| assetKind | 시나리오 | 변화 |
|---|---|---|
| `land` | same · partial · reduction · increase | 현행 유지 |
| `housing` | same · partial | 현행 유지 |
| `building` | same · partial | 1종 → **2종** |
| `commercial_building`·`general_building`·`redevelopment_apt`·`right_to_move_in` | same · partial | **신규 2종** |
| `presale_right` | — | 면적 섹션 미렌더 (O-3) |

---

## 6. 케이스 매트릭스 (전 분기 anchor 대상)

| # | assetKind | 축 A 통합 | 축 B | 축 C | 시나리오 | 비고 |
|---|---|---|---|---|---|---|
| 1 | `land` | 현행 유지 | — | `nblHousingFootprint` 별개 유지 | 4종(현행) | 회귀 0 필수 |
| 2 | `housing` 일반 | 현행 유지 | `buildingFloorArea` | **활성** §154⑦ | 2종(현행) | 기준선 |
| 3 | `housing`+겸용 | `mixedUseTotalLandArea`→`acquisitionArea` | 주거/상가 분리 유지 | **활성** `buildingFootprintArea` | 2종 | dual-truth anchor 재작성 |
| 4 | `building` | 현행 유지 | `buildingFloorArea` | **렌더(장래 예정·미소비)** | 1→**2종** | A-6 재발 감시 |
| 5 | `commercial_building` | `cbLandArea`→`acquisitionArea` | 전유·공용 **2축 유지** | **렌더(장래 예정·미소비)** | **신규 2종** | §164⑥ 산식 불변 필수 |
| 6 | `general_building` | `gbLandArea`→`acquisitionArea` | `gbBuildingArea` | **활성** `gbBuildingFootprintArea` **별개 개념** | **신규 2종** | `:663` 배율 판정 불변 필수 |
| 7 | `redevelopment_apt` | `redevLandArea`→`acquisitionArea` | — | **미렌더** | **신규 2종** | 라벨 원칙 C 정정 동반 |
| 8 | `right_to_move_in` | `redevLandArea`→`acquisitionArea` | — | **미렌더** | **신규 2종** | 7과 동일 |
| 9 | `presale_right` | **면적 섹션 미렌더** | — | — | — | O-3 확정 — 신설 없음 |

---

## 7. 14개 동기화 지점 (토지 축 통합 기준)

| 지점 | 대상 | 규모 |
|---|---|---|
| ① 폼 상태 | `calc-wizard-asset.ts` — `cbLandArea`·`gbLandArea`·`redevLandArea`·`mixedUseTotalLandArea` **deprecated 표기** | 소 |
| ② initial | `calc-wizard-asset-factory.ts` | 소 |
| ③ normalize·**마이그레이션** | `calc-wizard-asset-migrate.ts`·`-phase3.ts` — 구 필드→`acquisitionArea` 이관. **IndexedDB 기존 이력 보존 필수** | **중** |
| ④ API 변환 | `transfer-tax-api-helpers.ts:135`·`-gb.ts:108`·`-redev.ts:65`·`-mixed-use.ts:54`·`-inheritance.ts:103`·`-burdened-gift.ts:125`·`commercial-164-6-proviso.ts:62`·`transfer-pre1990-commercial-bridge.ts:60`·`transfer-pre1990-phd-bridge.ts:43` | **대** |
| ⑤ UI 위젯 | `AssetSectionBasic.tsx` 게이트 3종→8종 · 전용 블록 4개에서 면적 칸 제거 | **대** |
| ⑥ 사이드바 | ✅ **영향 없음** — `lib/stores/` 요약 경로에 면적 참조 0건(실측) | — |
| ⑦ 결과 카드 | ✅ **폼 필드 직접 참조 0건**(실측). `CommercialBuildingValuationDetailCard`·`GeneralBuildingValuationDetailCard`는 **엔진 `detail.*`** 표시 → 값 정합만 P0 anchor로 보장 | 소 |
| ⑧ validation | `validate-asset.ts:120·154·156`·`validate-gb.ts:47·61·63·134`·`validate-mixed-area.ts:24` + `:393` stale 메시지 정정 | **대** |
| ⑨⑩ Zod enum | `areaScenario` 자산별 허용값 refine | 중 |
| ⑪ 자산-수준 fallback | — | 소 |
| ⑫ Zod 입력 객체 | `transfer-tax-schema*.ts` — 구 필드 optional 유지 + 신 필드. **누락 시 침묵 strip** | 중 |
| ⑬ body spread | `callTransferTaxAPI` | 소 |
| ⑭ Route 매핑 | `route.ts` + GB·재개발·겸용 route helper | 중 |

**참조 규모 실측** (`.ts`/`.tsx` 전 코드베이스):

| 필드 | 참조 | 파일 |
|---|---|---|
| `acquisitionArea` | 398건 | 132 |
| `transferArea` | 202건 | 63 |
| `areaScenario` | 131건 | 27 |
| `residentialFloorArea` | 104건 | 62 |
| `mixedUseTotalLandArea` | 61건 | 44 |
| `gbLandArea` | 38건 | 18 |
| `cbLandArea` | 35건 | 19 |
| `redevLandArea` | 26건 | 10 |

---

## 8. Phase 계획

| Phase | 내용 | verify |
|---|---|---|
| **P0** | **Pre-Do anchor** — 현행 동작 고정: 상가 §164⑥ 3축 세액 · GB `:663` NBL 배율 · 재개발 landArea · 겸용 totalLandArea | anchor 전건 green |
| **P0.5** | `AssetSectionBasic.tsx` **분리 선행** (§10 파일 크기) | ≤700줄 착지 |
| **P1** | 토지 축 통합 — 구 4필드 → `acquisitionArea`/`transferArea`. ③ 마이그레이션 + ④ API 9곳 | P0 anchor **불변** |
| **P2** | ⑤ UI 이전 — 전용 블록에서 면적 칸 제거, ① 게이트 8종 확대 | 화면상 면적 칸 중복 0 (E2E testid 카운트) |
| **P3** | D3 시나리오 확대 — `same`+`partial`, `resolveAcqAreaForStdPrice` 자산별 배선 | A-6 재발 0 |
| **P4** | D2 축 B·C 확대 + 3개 정착 개념 라벨 구분 + 소비처 없는 자산 안내 | §154⑦·NBL 배율 판정 불변 |
| **P5** | ⑧ validation 정합 + `:393` stale 메시지 정정 + 라벨 원칙 C 통일 | UI 통과↔validate 차단 모순 0 |
| **P6** | 회귀 | tsc 0 · `npm run test:transfer` 회귀 0 · E2E |

---

## 9. 결정 사항 — **전건 확정 (2026-08-04 사용자)**

| ID | 항목 | 확정 내용 |
|---|---|---|
| ~~O-1~~ | 소비처 없는 자산의 축 C 위젯 | ✅ **상가·건물(토지제외) = 렌더**(장래 사용 예정·hint로 미소비 명시·validate 비강제) / **재개발·입주권·분양권 = 미렌더**. 축 A는 별개로 통합 유지(§4.3) |
| ~~O-2~~ | 환지 2종의 비-토지 확대 | ✅ **불필요 — `land` 한정 현행 유지**. 확대는 `same`·`partial` 2종뿐(§5.3) |
| ~~O-3~~ | `presale_right` 면적 신설 | ✅ **불필요 — 신설 없음**. 면적 섹션 자체를 렌더하지 않는다 |
| ~~O-4~~ | D1 범위 | ✅ **토지 축 한정 승인**(§3) |

**⇒ 미결 0건. Do 착수 가능.**

---

## 10. 리스크 · 정책 정합

| 리스크 | 완화 |
|---|---|
| **🔴 엔진 input 이름 충돌** — 폼 `gbBuildingFootprintArea` → 엔진 input **`buildingFootprintArea`**(`transfer-tax-api-gb.ts:109·164`)인데, 주택 폼 필드도 **같은 이름** `buildingFootprintArea`(§154⑦). **법령 개념이 다른데 이름이 같다** | 통합 작업 중 최대 함정. P0 anchor로 GB `:663` 배율과 주택 §154⑦ 한도를 **각각** 고정 |
| **기준시가 곱셈 인자 왜곡** — 축 A는 전 자산 환산·NBL의 곱셈 인자 | P0 anchor를 통합 **전에** 확보(`feedback_pre_anchor_verification` ★★★) |
| **IndexedDB 기존 이력 손실** | ③ 마이그레이션 + 구 필드 optional 유지. 롤백 가능하게 |
| **anchor 전제 붕괴** — `asset-area-input-no-duplication.anchor.test.tsx`가 "전용 섹션 상호배타"를 계약으로 고정 중 | **재작성 대상**. 새 계약 = "① 기본정보 단일 입력" |
| **dual-truth** | `mixed-use-area-dual-truth.anchor.test.ts` 유지·확장 (`feedback_ui_engine_dual_truth_avoidance` ★★★) |
| **UI 게이트가 유일 입력 경로 제거** | `feedback_ui_gate_removes_sole_input_path` ★★★ — 전용 블록 제거 전 ①에서 입력 가능함을 anchor로 증명 |
| **E2E testid 계약** — `area-scenario-select`를 **3개 spec이 사용** | 변경 금지: `transfer-partial-acq-apportion.spec.ts:20` · `transfer-replot-increase-estimated.spec.ts:30` · `transfer-housing-area-basic-info.spec.ts:37·69` |
| **파일 크기** | `AssetSectionBasic.tsx` **714줄**(실측) — 트리거 800 · 착지목표 ≤700. 8종 확대 시 초과 위험 → **P0.5에서 분리 선행** |

### 10.1 인접 발견 (범위 밖 — 언급만)

`GeneralBuildingValuationDetailCard.tsx:395` 라벨이 **"건물 수평투영면적"**인데, `calc-wizard-asset-gb.ts:40` 주석은 이 값이 「건축법 시행령」 §119①3호 **바닥면적**이며 *"건축면적(외벽 중심선 **수평투영면적**)이 아니다"*(조심 2025지0451에서 건축면적 주장 배척)라고 명시한다. **라벨 드리프트 의심** — 본 계획 범위 밖이므로 수정하지 않는다.

---

## 11. 관련 문서 · 기존 anchor

- 선행 계획서: `docs/01-plan/features/transfer-asset-area-basic-info.plan.md`
- 정본: `docs/02-design/area-taxonomy.md`
- 기존 anchor:
  - `__tests__/lib/calc/transfer-asset-area-axis.anchor.test.ts` (12건)
  - `__tests__/components/asset-section-basic-area-gate.anchor.test.tsx` (6건)
  - `__tests__/components/asset-area-input-no-duplication.anchor.test.tsx` (**재작성 대상**)
  - `__tests__/tax-engine/transfer-tax/basic-info-building-area.anchor.test.ts` (A-6 — `partial` 왜곡 고정)
  - `__tests__/lib/calc/mixed-use-area-dual-truth.anchor.test.ts`
  - `__tests__/components/gb-footprint-max-floor-area.anchor.test.tsx`
  - `__tests__/lib/calc/partial-area-acq-std-price.anchor.test.ts`

---

## 12. rev.2 자가검토 로그

| 유형 | 내용 |
|---|---|
| **🔴 오류 1** | §4 표에서 `general_building`의 정착면적 소비처를 "✅"로 표기 → **정정**. `gbBuildingFootprintArea`는 「건축법 시행령」 §119①3호 바닥면적이고 주택 §89①3호 정착면적과 **다른 개념**(코드가 "통합 금지" 명시). §4.1에 3개 개념 구분표 신설 |
| **누락 1** | §1.1 표에 축 C 필드명 부재 → `buildingFootprintArea`·`gbBuildingFootprintArea`·`nblHousingFootprint` 명시 |
| **누락 2** | E2E testid 계약을 1개 spec으로 기재 → **3개**로 정정(실측) |
| **누락 3** | ⑥⑦를 "확인 필요"로 방치 → 실측해 **영향 없음**으로 확정(결과카드는 엔진 `detail.*` 표시) |
| **누락 4** | anchor 파일 경로 미기재 → §11에 전건 경로 확정 |
| **모순 1** | O-4를 미결로 둔 채 §3에서 이미 축소 설계 → 승인 반영해 §3을 확정 서술로 변경 |
| **근거 보강** | "800줄 초과 확실"(추정) → 실측 714줄 + 트리거/착지 기준 명시, P0.5 분리 단계 신설 |
| **신규 리스크** | 엔진 input `buildingFootprintArea` ↔ 주택 폼 `buildingFootprintArea` **이름 충돌** 발견 → §10 최상단 등재 |

### rev.3 (2026-08-04) — 미결 4건 사용자 확정

| 항목 | 반영 |
|---|---|
| O-1 | §4.2 표에 「축 C 렌더」 열 신설 · §4.3 확정 서술 — 상가·건물 렌더(장래 예정) / 재개발·입주권·분양권 미렌더 |
| O-1 파생 | **축 A ≠ 축 C 경계 명시** — 재개발·입주권의 `redevLandArea`는 엔진 실소비이므로 토지 축 통합 대상 **유지**. "면적 불필요"를 축 A로 확대 해석하면 기능 회귀가 된다 |
| O-1 파생 | 장래 사용 예정 2종은 **validate 비강제** 규칙 신설 — 소비처 없는 필드를 필수화하면 계산이 막힌다 |
| O-2 | §5.2 표 확정 + §5.3 자산별 최종 시나리오 구성표 신설 |
| O-3 | §6 매트릭스 9행 — 분양권 면적 섹션 미렌더 확정 |
| 전반 | §9를 「미결」 → 「결정 사항(전건 확정)」으로 전환. 상태 헤더 **Plan 확정** |
