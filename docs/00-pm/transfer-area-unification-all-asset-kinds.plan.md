# 양도소득세 — 면적 입력 전 자산유형 통일 (계획서)

> 상태: **Plan 확정 (P0 완료 · Do 착수 가능)** · 작성 2026-08-04 · **rev.4**
> rev 이력: rev.2 자가검토(오류 1·누락 4·모순 1) → rev.3 미결 4건 확정 → **rev.4 P0 환류로 D1 철회·D3 축소**
> 트리거: 사용자 요청 — "면적 부분을 이미지1(주택)과 같이 기본 정보 섹션으로 옮기는 작업을 했는데 주택 섹션에만 되었다. 모든 섹션이 주택처럼 되도록 통일"
> 선행 계획서: [`transfer-asset-area-basic-info.plan.md`](../01-plan/features/transfer-asset-area-basic-info.plan.md) §2.1-3 미완분 · [`basic-info-building-area-phase-f.plan.md`](../01-plan/features/basic-info-building-area-phase-f.plan.md) §11(F2 폐기 — **본 계획이 준수**)
> 상위 정본: [`docs/02-design/area-taxonomy.md`](../02-design/area-taxonomy.md)
> 검증 원칙: 모든 file:line·법령·수치는 실측/조문 확인. 미확인은 "확인 필요" 명시.

---

## 0. 한 줄 요약

면적 입력 **위치**를 ① 기본정보로 통일한다. **필드는 건드리지 않는다** — 전용 필드(`cbLandArea`·`gbLandArea`·`redevLandArea`·`mixedUseTotalLandArea`)를 그대로 둔 채 렌더 위치만 옮긴다. 14지점 중 **⑤ UI·⑧ validate 2개만** 변경한다.

---

## 1. 배경 — "주택만 됐다"의 실제 원인

### 1.1 현행 면적 입력 위치 (실측)

| assetKind | 토지 축(A) | 건물 축(B) | 정착 축(C) | 현행 입력 위치 |
|---|---|---|---|---|
| `land` | `acquisitionArea`/`transferArea` | — | `nblHousingFootprint`(별개 개념) | **① 기본정보** ✅ |
| `housing` (일반) | `acquisitionArea`/`transferArea` | `buildingFloorArea` | `buildingFootprintArea` + `appurtenantLandZone` | **① 기본정보** ✅ |
| `building` (토지제외) | `acquisitionArea` (`same` 단일) | `buildingFloorArea` | — | **① 기본정보** ✅ |
| `commercial_building` | `cbLandArea` (**단일**) | `cbExclusiveArea` + `cbSharedArea` | — | ③ `CommercialBuildingBlock` |
| `general_building` | `gbLandArea` (**단일**) | `gbBuildingArea` | `gbBuildingFootprintArea`(**별개 개념**) | ③ `GeneralBuildingBlock` |
| `redevelopment_apt`·`right_to_move_in` | `redevLandArea` (**단일**) | — | — | `RedevelopmentValuationSection` |
| `housing` + `isMixedUseHouse` | `mixedUseTotalLandArea` (**단일**) | `residentialFloorArea` 외 | `buildingFootprintArea` | `MixedUseSection` |
| `presale_right` | 없음 | 없음 | 없음 | — |

필드 정의: `calc-wizard-asset.ts:117`·`:637` · `calc-wizard-asset-gb.ts:46`·`:197`

### 1.2 현행 게이트 (`AssetSectionBasic.tsx`)

```ts
// :84-107  축 A 시나리오 — 3종만 등재
AREA_SCENARIOS_BY_ASSET_KIND = {
  land:    ["same", "partial", "reduction", "increase"],
  housing: ["same", "partial"],
  building:["same"],
}
// :133  축 B  FLOOR_AREA_KINDS = new Set(["housing", "building"]);
// :137~ 축 C  housing 단독
```

`:67-80` 주석이 제외 사유를 명시한다 — *"자산유형마다 전용 전체면적 필드가 이미 존재하므로 … 이들을 등재하면 같은 면적을 두 곳에서 입력받게 된다."*

---

## 2. 확정 방향 (사용자 2026-08-04)

| # | 항목 | 확정 |
|---|---|---|
| **D1** | 필드 통합 | ❌ **철회** — 위치만 이전. 필드 변경 0 (§3) |
| **D2** | 축 C 위젯 | 상가·건물 **렌더**(장래 사용 예정) / 재개발·입주권·분양권 **미렌더** (§4) |
| **D3** | 시나리오 | **`same`만** — 전용 자산은 면적 1칸(취득=양도). 드롭다운 미확대 (§5) |

---

## 3. D1 철회 — F2 폐기 결정 준수 (P0 환류, 2026-08-04)

### 3.1 철회 경위

rev.3까지 「토지 축을 `acquisitionArea`/`transferArea`로 통합」을 확정했으나, **P0에서 이 방향이 2026-07-30에 이미 정식 폐기된 것**임을 발견했다 — `basic-info-building-area-phase-f.plan.md` §11 「F2 폐기 — 승격이 개선이 아니라 회귀 위험이다」, anchor 6건으로 고정.

### 3.2 폐기 근거 (실측 인용)

| 근거 | 내용 |
|---|---|
| **정확성** | 전용 4필드는 **단일 면적**, 기본정보는 **2시점 쌍**이다. 엔진이 시점별 **단가**에 **같은 면적**을 곱하므로 환산 산식에서 **면적이 약분**되고 비율은 단가비만 반영한다(`general-building-valuation.ts:506·535` · `commercial-building-valuation.ts:245·249·258` 3시점 동일 `landArea` · `transfer-tax-mixed-use-helpers.ts:246·262` 명시 대입 · `calc-wizard-asset-redev.ts:107` "시점별 동일 가정"). 2시점으로 쪼개면 취득 300㎡/양도 100㎡에서 **환산취득가 = 양도가액 전액 → 양도차익 0** 경로가 신설된다 |
| **이득 없음** | 🔴 **중복이 애초에 없다** — 4종이 `AREA_SCENARIOS_BY_ASSET_KIND`에 미등재라 기본정보 면적 섹션이 렌더되지 않는다 |
| **성격** | *"시점 축이 다른 것을 억지로 맞추는 것이라 일관성이 아니라 **위험 전파**"* |

### 3.3 사용자 원 요구와의 관계

원 요구는 **"면적 입력을 ① 기본정보로 모아 화면을 통일"**이며, 이는 **필드를 합치지 않아도 달성된다**. 선행 계획서 §2.1-3이 이미 그 형태였다 — *"필드는 그대로, 렌더 위치만 ① 기본정보로."*

⇒ **본 계획은 위치 이전만 수행한다.** `area-axis-single-field-invariant.anchor.test.ts` 6건은 **그대로 유효**하며 재작성하지 않는다.

---

## 4. D2 — 축 C 전 자산 노출

### 4.1 「정착면적」은 서로 다른 3개 법령 개념이다 (rev.2 정정)

| 필드 | 법령 개념 | 정의 | 소비처 |
|---|---|---|---|
| `buildingFootprintArea` (housing·겸용) | 「소득세법」 §89①3호 **「건물이 정착된 면적」** | **1층 정착면적** | §154⑦ 부수토지 한도(3·5·10배) |
| `gbBuildingFootprintArea` (GB) | 「건축법 시행령」 §119①3호 **「바닥면적」** | 지하층 포함 **각 층 중 가장 넓은 값** | 「소득세법」 §104의3①4호나목 NBL 배율 |
| `nblHousingFootprint` (land) | 「소득세법」 §104의3①5호 **「주택이 정착된 면적」** | 주택 정착분 | NBL 주택부수토지 판정 |

`calc-wizard-asset-gb.ts:36-45` 실측 인용:

> ⚠️ 「건축법 시행령」 제119조 제1항 제3호의 「바닥면적」이며, 지하층을 포함한 각 층의 바닥면적 중 가장 넓은 값이다(대법원 2015.6.24. 2012두7073 · 대법원 1994.5.13. 93누18242 · 조심 2011지505 · 조심 2025지0451). … 「소득세법」 제89조 제1항 제3호의 「건물이 **정착**된 면적」(`buildingFootprintArea`, 1층 정착면적)과도 **다른 개념**이다 — **통합 금지**.

⇒ **세 필드는 각각 유지**하고, 라벨·hint에 근거 법령을 각각 표기해 사용자가 같은 값으로 오인하지 않게 한다.

### 4.2 축 C 렌더 대상 (O-1 확정)

| 자산 | 정착면적 소비처 | `appurtenantLandZone` | 축 C 렌더 |
|---|---|---|---|
| `housing`(일반·겸용) | ✅ §154⑦ | ✅ | **렌더 (활성)** |
| `general_building` | 🟡 NBL 배율(**다른 개념**) | ❌ | **렌더 (활성)** |
| `land` | 🟡 `nblHousingFootprint`(**다른 개념**) | ❌ | 현행 유지 |
| `commercial_building` | ❌ 현재 없음 | ❌ | **렌더 (장래 예정)** |
| `building`(토지제외) | ❌ 현재 없음 | ❌ | **렌더 (장래 예정)** |
| `redevelopment_apt`·`right_to_move_in`·`presale_right` | ❌ | ❌ | **미렌더** |

### 4.3 설계

- **장래 사용 예정 2종**(commercial_building·building): 위젯을 렌더하되 **현재 세액에 반영되지 않음을 `hint`에 명시**. 값은 폼·저장소에 보존해 장래 엔진 배선 시 그대로 쓰인다.
  - ⚠️ 엔진 소비처가 생기기 전까지 **validate에서 필수로 만들지 않는다** — 계산을 막으면 안 된다.
- `land`는 `appurtenantLandZone`에 **절대 배선하지 않는다**(합치면 겸용 오답, 선행 계획서 U-3).

---

## 5. D3 — `same`만 확대

### 5.1 확정 내용

전용 자산(상가·GB·재개발·입주권)은 **면적 입력 1칸**(취득=양도)으로 유지한다. 이는 §3.2 단일 면적 안전장치와 정확히 일치한다.

**⇒ 시나리오 드롭다운(`area-scenario-select`)은 확대하지 않는다.** 선택지가 `same` 하나뿐이면 드롭다운을 노출할 이유가 없다 — 면적 입력 칸만 ①로 이전한다.

### 5.2 자산별 최종 시나리오 구성

| assetKind | 시나리오 | 드롭다운 | 변화 |
|---|---|---|---|
| `land` | same · partial · reduction · increase | 표시 | 현행 유지 |
| `housing` | same · partial | 표시 | 현행 유지 |
| `building` | same | 미표시(현행) | 현행 유지 |
| `commercial_building`·`general_building`·`redevelopment_apt`·`right_to_move_in` | same (단일 필드) | **미표시** | 위치만 이전 |
| `presale_right` | — | — | 면적 섹션 미렌더 |

### 5.3 partial을 확대하지 않는 이유

`partial`은 「취득≠양도 면적」이므로 §3.2의 2시점 위험을 그대로 공유한다. `resolveAcqAreaForStdPrice`(`transfer-tax-api-helpers.ts:407`) 보정을 전 자산에 배선하면 기술적으로는 가능하나, **이득이 없고**(전용 자산은 단일 면적 가정으로 엔진이 이미 설계됨) 위험만 늘어난다.

---

## 6. 케이스 매트릭스

| # | assetKind | 축 A | 축 B | 축 C | 시나리오 | 작업 |
|---|---|---|---|---|---|---|
| 1 | `land` | 현행 | — | `nblHousingFootprint` 별개 | 4종 | **변경 없음** |
| 2 | `housing` 일반 | 현행 | `buildingFloorArea` | 활성 §154⑦ | 2종 | **변경 없음**(기준선) |
| 3 | `housing`+겸용 | `mixedUseTotalLandArea` 유지 | 주거/상가 분리 유지 | `buildingFootprintArea` | same | **위치 이전** |
| 4 | `building` | 현행 | `buildingFloorArea` | **렌더 신설**(장래 예정) | same | 축 C 추가 |
| 5 | `commercial_building` | `cbLandArea` 유지 | 전유·공용 2축 유지 | **렌더 신설**(장래 예정) | same | **위치 이전** + 축 C |
| 6 | `general_building` | `gbLandArea` 유지 | `gbBuildingArea` | `gbBuildingFootprintArea` 활성 | same | **위치 이전** |
| 7 | `redevelopment_apt` | `redevLandArea` 유지 | — | 미렌더 | same | **위치 이전** + 라벨 원칙 C |
| 8 | `right_to_move_in` | `redevLandArea` 유지 | — | 미렌더 | same | 7과 동일 |
| 9 | `presale_right` | 섹션 미렌더 | — | — | — | 변경 없음 |

---

## 7. 14개 동기화 지점 — **⑤⑧ 2개만 변경**

| 지점 | 영향 | 사유 |
|---|---|---|
| ① 폼 상태 | **변경 0** | 필드 유지 |
| ② initial | **변경 0** | 〃 |
| ③ normalize·마이그레이션 | **변경 0** | 필드 유지 → **IndexedDB 마이그레이션 불필요** |
| ④ API 변환 | **변경 0** | 필드 유지 → 9개 브리지 파일 무변경 |
| **⑤ UI 위젯** | **본체** | `AssetSectionBasic.tsx` 면적 렌더 확대 · 전용 블록 4개에서 면적 칸 제거 |
| ⑥ 사이드바 | 영향 없음(실측 — `lib/stores/` 요약 경로 면적 참조 0건) | |
| ⑦ 결과 카드 | 영향 없음(실측 — 엔진 `detail.*` 표시) | |
| **⑧ validation** | **변경** | `validate-asset.ts:393` stale 안내 위치 정정 등 — 메시지가 가리키는 섹션이 바뀐다 |
| ⑨⑩ Zod enum | **변경 0** | 시나리오 미확대 |
| ⑪ 자산-수준 fallback | **변경 0** | |
| ⑫ Zod 입력 객체 | **변경 0** | 필드 유지 |
| ⑬ body spread | **변경 0** | |
| ⑭ Route 매핑 | **변경 0** | |

> D1 철회로 rev.3 대비 **④(9개 파일)·③(마이그레이션)·⑨⑩⑫가 전부 범위에서 빠졌다.**

---

## 8. Phase 계획

| Phase | 내용 | verify |
|---|---|---|
| ~~P0~~ | **✅ 완료 (2026-08-04)** — 기존 anchor 49건 green 확인 + **D1 철회 환류** | 4파일 49건 pass |
| **P1** | `AssetSectionBasic.tsx` 크기 관리 — 현재 **714줄**. 전용 블록을 **호출**하는 방식이면 증가폭이 작다. 750 초과 시 분리 | ≤700 착지 또는 증가폭 실측 후 판단 |
| **P2** | ⑤ 위치 이전 — 자산별 순차(상가 → GB → 재개발/입주권 → 겸용) | 자산별 E2E: 면적 칸이 ①에 1개, ③에 0개 |
| **P3** | D2 축 C 확대 — 상가·건물 렌더 + hint("현재 세액 미반영") + 3개 정착 개념 라벨 구분 | §154⑦·NBL 배율 판정 **불변** |
| **P4** | ⑧ validate 안내 위치 정정 + 라벨 원칙 C 통일(재개발 "토지면적 (㎡)" 등) | UI 통과↔validate 차단 모순 0 |
| **P5** | 회귀 | tsc 0 · `npm run test:transfer` 회귀 0 · E2E |

---

## 9. 결정 사항 — 전건 확정

| ID | 확정 |
|---|---|
| ~~O-1~~ | 상가·건물 = 축 C 렌더(장래 예정·hint·validate 비강제) / 재개발·입주권·분양권 = 미렌더 |
| ~~O-2~~ | 감·증환지는 `land` 한정 유지 |
| ~~O-3~~ | 분양권 면적 신설 없음 |
| ~~O-4~~ | **D1 철회** — 필드 통합하지 않고 위치만 이전 (P0 환류) |

---

## 10. 리스크 · 정책 정합

D1 철회로 rev.3의 최대 리스크 3건(엔진 input 이름 충돌 · 기준시가 곱셈 인자 왜곡 · IndexedDB 마이그레이션)이 **범위에서 제거**됐다. 남은 리스크:

| 리스크 | 완화 |
|---|---|
| **UI 게이트가 유일 입력 경로 제거** — 전용 블록에서 면적 칸을 빼는데 ①에서 안 보이면 **입력 불가 dead-end** | `feedback_ui_gate_removes_sole_input_path` ★★★ — 자산별로 ① 렌더를 **먼저** 넣고 전용 블록 제거는 **그 다음**. 각 자산 E2E로 증명 |
| **중복 입력(dual-truth)** — 이전 중 두 곳에 동시 노출 | `asset-area-input-no-duplication.anchor.test.tsx` **유지·확장**. 새 계약 = "① 기본정보 단일 입력". `feedback_ui_engine_dual_truth_avoidance` ★★★ |
| **상속 분기 누락** — 상가는 `acquisitionCause === "inheritance"`면 `CommercialInheritanceStdPriceSection`이 별도 면적 카드를 렌더(상호배타 게이트) | 이전 시 **양 경로 모두** 처리. 게이트를 잘못 완화하면 중복 입력 발생 |
| **E2E testid 계약** — `area-scenario-select`를 3개 spec이 사용 | 변경 금지: `transfer-partial-acq-apportion.spec.ts:20` · `transfer-replot-increase-estimated.spec.ts:30` · `transfer-housing-area-basic-info.spec.ts:37·69` |
| **파일 크기** | `AssetSectionBasic.tsx` **714줄** — 트리거 800·착지 ≤700. P1에서 증가폭 실측 후 판단 |
| **겸용 파생 필드** | `residentialFloorArea`는 전유+공용 안분 **파생 결과(read-only)** — 이전 대상 아님(선행 anchor "승격 후보 아님") |

### 10.1 인접 발견 (범위 밖 — 언급만)

`GeneralBuildingValuationDetailCard.tsx:395` 라벨이 **"건물 수평투영면적"**인데, `calc-wizard-asset-gb.ts:40`은 이 값이 「건축법 시행령」 §119①3호 **바닥면적**이며 *"건축면적(외벽 중심선 수평투영면적)이 아니다"*(조심 2025지0451에서 건축면적 주장 배척)라고 명시한다. **라벨 드리프트 의심** — 본 계획 범위 밖이므로 수정하지 않는다.

---

## 11. 관련 문서 · anchor

- 선행: `docs/01-plan/features/transfer-asset-area-basic-info.plan.md` §2.1-3 · `basic-info-building-area-phase-f.plan.md` §11(F2 폐기 — 본 계획이 준수)
- 정본: `docs/02-design/area-taxonomy.md`
- **P0에서 green 확인한 anchor 49건**:
  - `__tests__/tax-engine/transfer/area-axis-single-field-invariant.anchor.test.ts` (**단일 면적 불변식 — 그대로 유효**)
  - `__tests__/lib/calc/transfer-asset-area-axis.anchor.test.ts`
  - `__tests__/components/asset-section-basic-area-gate.anchor.test.tsx`
  - `__tests__/components/asset-area-input-no-duplication.anchor.test.tsx` (**유지·확장 대상**)
- 참고: `__tests__/tax-engine/transfer-tax/basic-info-building-area.anchor.test.ts` (A-6) · `mixed-use-area-dual-truth.anchor.test.ts` · `gb-footprint-max-floor-area.anchor.test.tsx`

---

## 12. rev 이력 로그

### rev.2 — 자가검토 1사이클

| 유형 | 내용 |
|---|---|
| 🔴 오류 1 | `gbBuildingFootprintArea`를 주택 정착면적과 동일 축으로 취급 → **3개 법령 개념 구분표**(§4.1) 신설 |
| 누락 4 | 축 C 필드명 · E2E testid 3개 spec · ⑥⑦ 영향 실측 · anchor 경로 |
| 모순 1 | O-4 미결인데 §3은 확정 서술 |

### rev.3 — 미결 4건 사용자 확정

O-1(상가·건물 렌더 / 재개발·입주권·분양권 미렌더) · O-2(환지 land 한정) · O-3(분양권 미신설) · O-4(토지 축 통합 승인).

### rev.4 — **P0 환류 (2026-08-04)**

| 항목 | 내용 |
|---|---|
| 🔴 **누락 발견** | rev.2·rev.3 자가검토가 `basic-info-building-area-phase-f.plan.md` §11(**F2 폐기**)을 찾지 못했다. D1은 2026-07-30에 이미 정식 폐기된 방향이었고 anchor 6건이 가드로 존재했다 |
| **D1 철회** | 사용자 재결정 — 필드 통합 없이 **위치만 이전**. `area-axis-single-field-invariant` 6건 **재작성 불필요·그대로 유효** |
| **D3 축소** | `partial` 확대 철회 → `same`만. 전용 자산은 면적 1칸, 시나리오 드롭다운 미확대 |
| **범위 축소** | 14지점 중 변경이 **⑤⑧ 2개**로 축소(rev.3은 ③④⑤⑧⑨⑩⑫ 7개). IndexedDB 마이그레이션·API 변환 9곳·Zod 변경이 전부 빠짐 |
| **리스크 소멸** | 엔진 input 이름 충돌 · 기준시가 곱셈 인자 왜곡 · 마이그레이션 — 3건 모두 범위 밖으로 |
| P0 검증 | 기존 anchor 4파일 **49건 전건 green**(2026-08-04 실행) |
