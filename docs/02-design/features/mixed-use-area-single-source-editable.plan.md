# 겸용주택 면적 — ① 카드 단일 소스화 + 안분 면적 직접 수정 + 합계 검증

- 작성일: 2026-07-15
- 대상: 양도소득세 > 겸용주택 마법사 > ① 면적·부수토지·지역 정보 (`MixedUseAreaInputs.tsx`)
- 규모 판정: **대** — 엔진 input 신규 필드 **2개**(§2-C 확정) → 14 동기화 지점 + 설계 문서 필요
- 상태: **13단계 자가 검토 완주 — 정정 54건 반영**(STEP1 25 · STEP6 18 · STEP13 11). 결정 3건 확정(§2-A=A · §2-A2=가 · §2-C2=가)
- 산출물: [`.engine.design.md`](./mixed-use-area-single-source-editable.engine.design.md) · [`.ui.design.md`](./mixed-use-area-single-source-editable.ui.design.md)
- **verdict: `clean`** — Critical/High 전부 해소. **U2(PHD 배타)는 범위 밖 확정**(2026-07-15 사용자) → §7. KoreanLaw 미검증 인용 1건은 §6에 잔존(Do 무관)
- §2-A = A안 확정(2026-07-15 사용자)

## 0. 사용자 요구 (2026-07-15)

1. 겸용주택 등 면적 안분계산을 **① 카드로 통일**
2. 현재 읽기전용인 6개 파생값을 **수정 가능**하게
3. 사용자 입력 안분 면적의 **합계가 전체면적과 다르면 오류 표시**
4. 이후 **모든 후속 화면이 ① 카드 값을 조회**해 사용

인터뷰 결과(선택):
- 수정 범위: **6개 전부** (→ §2-C2에서 상가 정착면적 재확인 필요)
- 오류 강도: **계산 차단** → **A안 확정 후: V2 차단 / V3 경고 / V1 없음**(§2-A·§2-C)
- 통일 범위: **4개 전부** — 상가 기준시가란 부수토지 입력칸 제거 · PHD 3-시점 패널 면적도 ①에서 조회 · 건물기준시가 모달 연면적 prefill · 엔진 API 전달값도 ① 기준

---

## 1. 현황 실측 — 6개 값의 저장 상태가 제각각

화면(`MixedUseAreaInputs.tsx:128-171`)의 6열은 성격이 다르다:

| # | 표시값 | 코드 | store 필드 | 엔진 input | 편집 경로 |
|---|---|---|---|---|---|
| 1 | 주택 연면적 | `:136` `residential` | ✅ `residentialFloorArea` | ✅ `types:40` | ❌ 표시만(전용/공통에서 write) |
| 2 | 상가 연면적 | `:142` `commercial` | ✅ `nonResidentialFloorArea` | ✅ `types:42` | ❌ 표시만 |
| 3 | 주택 정착면적 | `:148` `derived.residentialFootprintArea` | ❌ **없음** | ❌ **없음**(엔진이 파생) | ❌ 불가 |
| 4 | 상가 정착면적 | `:155` `round2(footprint − 주택정착)` | ❌ **없음** | ❌ **없음** | ❌ 불가 |
| 5 | 주택 부수토지 | `:162` `derived.residentialLandArea` | ✅ `mixedResidentialLandAreaOverride`(three-state) | ✅ `types:54` | ⚠️ **상가 기준시가란**에서 역산 |
| 6 | 상가 부수토지 | `:168` `derived.commercialLandArea` | ❌ 잔액 파생 | ❌ 잔액 | ⚠️ 상가란 입력 → 주택 override 역산 |

**⇒ 신규 엔진 필드 = 2개** (§2-C 확정 — 초안의 "1개"·"3개" 서술은 오류였다. 잔액 유지 가정 시 1개 / 3쌍 전부 독립 시 3개 / **쌍별 실태 반영 시 2개**).

### 파생 계산 단일 소스 — `computeDerivedAreas` (실측)

호출처 — 초안은 "4곳 전부 같은 leaf"라 했으나 **실제 7축**(§3-2-1 대조표). leaf를 쓰는 것은 4곳뿐:
- `components/calc/transfer/mixed-use/MixedUseAreaInputs.tsx:32` (① 카드 표시)
- `components/calc/transfer/mixed-use/MixedUseAssetMajorStdPrice.tsx:50` (③ 상가란)
- `lib/stores/calc-wizard-store.ts:469` (사이드바 합계)
- **`lib/tax-engine/transfer-tax-mixed-use.ts:76` (엔진)** ← 핵심

### ⚠️ dual-truth 2건 + 잠재 버그 2건 (조사 실측 — 본 작업 착수 전 판단 필요)

**D1. `MixedUseLegacyStdPrice.tsx:49-50` — override 무시 (실제 버그 후보)**
```ts
const residentialLandArea = round2(totalFloor > 0 ? totalLand * (residential / totalFloor) : 0);
const commercialLandArea = totalFloor > 0 ? residualArea(totalLand, residentialLandArea) : 0;
```
산식은 `computeDerivedAreas`와 같지만 **`mixedResidentialLandAreaOverride`를 읽지 않는다**. 용도변경(legacy) 경로에서 사용자가 부수토지를 수정해도 이 화면의 기준시가 자동합계는 자동 안분값으로 계산된다.

**D2. `lib/calc/transfer-pre1990-phd-bridge.ts:30-35` — three-state 0 파괴**
```ts
return parseArea(asset.phdResidentialLandArea) || autoLandArea;
```
`computeDerivedAreas` 미사용(비율 로직 자체 재구현 — `round2`는 `:19`에서 import해 `:34`에서 사용) + **`||`** → `phdResidentialLandArea = 0`(적법한 값)이 자동 안분값으로 덮어써진다.

⚠️ **정정(E-1)**: 여기서 **`??`는 정본이 아니다** — `parseArea`(`:22-23`)가 항상 number를 반환하므로 `??`는 미발동한다. `??`가 정본인 곳은 인자가 `number | undefined`인 `computeDerivedAreas`(`mixed-use-derived-areas.ts:42` 주석)뿐. **문자열 수준 분기**가 정답 → E5 박스 참조.

**B1. `transfer-tax-api.ts:144` — optional chaining 오류 후보**
`primary.mixedResidentialLandAreaOverride?.trim() !== ""`는 `undefined !== ""` → **true** → override 분기 진입 → `parseFloat(undefined) || 0` → **0 전송**. 다만 마이그레이션이 항상 `""`을 보장(`calc-wizard-asset-mixed-use.ts:75`)해 실현 안 될 수 있음 → **확인 필요**.

**B2. `transfer-tax-api.ts:216-217` — `> 0` 게이트**
`parseFloat(phdResidentialLandArea) > 0`일 때만 전송 → **0 입력이 침묵 무시**. D2와 같은 계열.

**C1. 인라인 중복 2건**: `transfer-tax-api.ts:166-167` ↔ `transfer-tax-validate-asset.ts:398-403` — 동일 안분("PHD 전체건물 기준시가 × 상가면적/전체면적")을 각각 인라인 재구현. 현재 산식은 일치.

**C2. `hasOverride` 조건 3곳 중복**: `MixedUseAssetMajorStdPrice.tsx:49` · `MixedUseAreaInputs.tsx:31` · `calc-wizard-store.ts:467`

### "①에서 조회"의 진짜 의미 (중요)

엔진은 `computeDerivedAreas(asset)`로 **부수토지·정착면적을 스스로 재계산**한다(`transfer-tax-mixed-use.ts:76`). 즉 현재 구조는 이미 "단일 소스"이되 **소스가 leaf 헬퍼이지 ① 카드가 아니다**. ① 카드 값이 권위를 가지려면 그 값이 **엔진 input으로 전달**되어야 한다.

- 연면적·부수토지: 이미 엔진 input(`residentialFloorArea`·`residentialLandAreaOverride`) → **자동 관철** ✅
- 정착면적: 엔진 input 부재 → **신규 필드 없이는 관철 불가** ❌

---

## 2. 설계 판단

### 2-A. ✅ **A안 확정 (2026-07-15 사용자 결정)** — "6개 전부 수정" ↔ "합계 차단" 모순 해소

두 선택이 **연면적에서 충돌**한다:

- 검증 대상: `주택 연면적 + 상가 연면적 = 전용합 + 공통`
- 연면적을 직접 수정하는 **순간** 이 등식이 깨진다 → 차단 → **연면적 수정이 구조적으로 불가능**

정착면적·부수토지는 모순이 없다(비교 대상인 `buildingFootprintArea`·`mixedUseTotalLandArea`가 **독립 입력 필드**라 사용자가 양쪽을 맞출 수 있다). 연면적만 비교 대상이 **다른 입력(전용/공통)에서 파생**되기 때문에 문제다.

**해법 후보**:

| 안 | 내용 | 장 | 단 |
|---|---|---|---|
| **A안 (권장)** | 전용/공통을 **선택적 보조 입력**으로 강등. 연면적이 진실. 전용/공통 입력 시 연면적을 덮어씀(현행 유지). 연면적 직접 수정 시 전용/공통과의 불일치는 **경고만**(차단 아님) | 건축물대장과 실제가 다른 실무 대응 · 연면적 수정이 실제로 동작 | 검증 3개 중 1개만 경고 → 강도 불균일 |
| B안 | 연면적 수정 시 **공통면적을 자동 역산**(주택연면적+상가연면적−전용합) | 항상 일치 → 차단 유지 가능 | 공통면적이 사용자 의도와 무관하게 바뀜 · 전용합 > 연면적합이면 음수 |
| C안 | 연면적은 **read-only 유지**(현행). 전용/공통으로만 조정 | 모순 없음 · 변경 최소 | 사용자 요구 "6개 전부" 미충족 |

> **A안 채택 근거**: 건축물대장 전용/공통과 실제 안분이 다른 경우가 실무에 존재하고, 그때 연면적을 직접 넣는 것이 사용자의 요구다. 전용/공통은 "연면적을 편하게 구하는 계산기"로 두는 것이 역할에 맞다.

**A안 확정 사양**:
- 전용/공통 = **선택적 보조 입력**. 값을 바꾸면 연면적을 같은 patch로 덮어씀(`onExclusiveChange` **유지** — P2 제약).
- 연면적 = **진실**. 직접 편집 가능. 편집 시 **전용/공통을 클리어**한다(§2-A2 "가" 확정 — 초안의 "그대로 두고 덮어쓰지 않음"은 M2 Critical로 폐기).
- V3(연면적합 = 전용합+공통) = **경고**. 차단 아님. **§2-A2 "가" 채택으로 V3는 사실상 도달 불가**(수동 편집 시 전용/공통이 비므로 게이트 false) → **오타 방지용 잔존 검증**.
- V2(부수토지) = **차단**. V1(정착)은 §2-C2 "가" 채택 시 항상 일치 → **삭제**.
- 전용/공통이 **둘 다 비어 있으면** V3 검증 자체를 건너뜀(보조 도구 미사용).

### 2-A2. ✅ **"가" 확정 (2026-07-15 사용자)** — 연면적 덮어쓰기 충돌 (M2 Critical)

**확정 사양**: 연면적을 수동 편집하면 **전용/공통을 같은 patch로 클리어**한다(`onChange({ residentialFloorArea: v, residentialExclusiveArea: "", commercialExclusiveArea: "", commonArea: "" })`). 추가 필드 0 · `useEffect` 미러링 없음(같은 patch write — 기존 `onExclusiveChange` 패턴과 동형). 클리어 후 V3 게이트(`exR + exC > 0`)가 false가 되어 경고도 자동 소멸한다.

A안은 "연면적이 진실"인데, `onExclusiveChange`(`MixedUseAreaInputs.tsx:47-50`)는 **전용면적이 0보다 크면 두 연면적을 무조건 덮어쓴다**. 즉 사용자가 연면적을 손으로 고친 뒤 전용/공통 칸을 **한 번만 건드려도 수동 입력이 소실**된다. A안이 이대로는 **동작하지 않는다**.

| 안 | 내용 | 판단 |
|---|---|---|
| **가 (권장)** | 연면적을 수동 편집하면 **전용/공통을 클리어**(빈칸) | 보조 도구 역할과 정합 · "진실은 하나" 명확 · 추가 필드 0 |
| 나 | `areaManualEdited` 플래그로 `onExclusiveChange` 억제 | 전용/공통 값 보존 · **신규 플래그 필드 1개** · 플래그 해제 UX 필요 |
| 다 | 덮어쓰기 전 확인 다이얼로그 | 데이터 폐기 확인 정책(`feedback_dialog_data_discard_confirm`)과 정합 · 입력 흐름 마찰 |

### 2-B. 편집 모델 — "잔액 자동조정 폐지"의 정확한 의미 (M1 Critical 정정)

> **⚠️ 초안 오류**: "잔액 자동조정 폐지"라 썼으나 문서 4곳(§2-B display fallback · §3-1 E2 · §4 C2/C3)과 충돌했다. 더 중요하게는 **현행 헬퍼가 상가를 항상 `residualArea`로 계산**(`mixed-use-derived-areas.ts:45`)하므로 합이 언제나 전체와 같아 **V2 차단이 절대 발동하지 않는다**(C5 도달 불가 = 죽은 코드).

**정정 — 폐지 대상은 "역산 write"이지 "잔액 display"가 아니다**:
- 폐지: `onCommercialLandChange`(`MixedUseAssetMajorStdPrice.tsx:60-67`)의 **상가 입력 → 주택 override 역산 저장**
- 유지: 미입력 칸의 자동 안분·잔액 **표시**

**헬퍼 규칙 확정 (E2 사양)** — 3-state × 2칸:

| 주택 override | 상가 override | 결과 | V2 발동 |
|---|---|---|---|
| 미설정 | 미설정 | 자동 비율 + 잔액 (**현행 동작 = 회귀 0**) | 불가(항상 일치) |
| 설정 | 미설정 | 주택=입력, 상가=`residualArea(전체, 주택)` | 불가 |
| 미설정 | 설정 | 상가=입력, 주택=`residualArea(전체, 상가)` | 불가 |
| **설정** | **설정** | **각 override 그대로 사용(잔액 미적용)** | **가능 ← C5** |

즉 **두 칸 모두 입력했을 때만** 합계 불일치가 성립하고 V2가 발동한다.

미입력 칸은 **자동 안분값을 display fallback**으로 표시(현행 `computeDerivedAreas` 유지).

> **정책 판정 — 위반 아님** (근거는 P1 정정 반영):
> `feedback_no_silent_apportion_fallback`의 금지 대상은 **"기준시가·취득가액·공시지가"** 입력 필드이며 **면적 안분은 대상에 해당하지 않는다**.
> 부수토지 면적 안분의 법령 근거는 `mixed-use-derived-areas.ts:8` 주석의 **시행령 §160①·§164⑫**(부수토지 배율)이다.
> ⚠️ 초안이 근거로 든 **§166⑥은 토지/건물 분리 양도차익 안분 조문**이라 부수토지 면적 안분 근거로 부적절했다.
> **KoreanLaw MCP 미검증 → 확인 필요**(§6-2).

### 2-C. 신규 필드 — **쌍별로 다르게 판단** (G1·G2 Critical 정정)

> **⚠️ 초안 오류**: "3쌍 전부 독립 편집 → 필드 3개"라 했으나, **쌍마다 엔진 소비 실태가 다르다**(실측).

**엔진 소비처 실측** (`grep -rn "residentialFootprintArea\|commercialFootprint" lib`):

| 값 | 엔진 소비처 | 세액 영향 |
|---|---|---|
| 주택 정착면적 | `transfer-tax-mixed-use-helpers.ts:615` `allowedArea = derived.residentialFootprintArea × multiplier` (§168의12 배율초과 → NBL) · `transfer-tax-mixed-use.ts:476`(표시) | **있음** |
| **상가 정착면적** | **0건** — 필드·타입 자체가 없고 `MixedUseAreaInputs.tsx:155`에서 `round2(footprint − 주택정착)` **표시 전용 인라인** | **없음** |
| 주택/상가 부수토지 | `derived.residentialLandArea`·`commercialLandArea` — 안분·PHD·fourpart 다수 | 있음 |

**⇒ 상가 정착면적을 편집칸으로 만들면 사용자가 입력해도 세액이 안 바뀌는데 바뀌는 것처럼 보인다** (오해 유발 — Critical).

| 쌍 | 모델 | 신규 필드 | 검증 |
|---|---|---|---|
| **연면적** | 둘 다 **실필드**(`residentialFloorArea`·`nonResidentialFloorArea`) 이미 존재 → 편집칸으로 바꾸기만 | **0개** | V3 경고 |
| **정착면적** | 주택만 override(엔진 소비 有), **상가는 잔액**(역산 = 주택 override write) | **1개** `residentialFootprintOverride` | **V1 없음**(항상 일치 → 죽은 코드) |
| **부수토지** | 둘 다 독립 override | **1개** `commercialLandAreaOverride`(주택은 기존 필드) | **V2 차단** |

**⇒ 신규 엔진 input 필드 = 2개** (`residentialFootprintOverride`, `commercialLandAreaOverride`)

### 2-C2. ✅ **"가" 확정 (2026-07-15 사용자)** — 상가 정착면적 편집 (G1)

**확정 사양**: 편집칸으로 만들되 **주택 정착면적을 역산**해 저장 — `residentialFootprintOverride = residualArea(buildingFootprintArea, 입력된 상가정착)`. 편집이 되고 세액에도 반영된다(주택 정착면적 → §168의12 배율초과 NBL). **V1 검증 불필요**(항상 일치). 신규 필드는 `residentialFootprintOverride` 1개뿐.

"6개 전부 수정 가능"이라 하셨으나 상가 정착면적은 **엔진이 읽는 곳이 0건**입니다.

| 안 | 내용 |
|---|---|
| **가 (권장)** | 편집칸으로 만들되 **주택 정착면적을 역산**해 저장(= 상가를 줄이면 주택이 늘어남). 편집은 되고 세액에도 반영됨. V1 검증은 불필요(항상 일치) |
| 나 | read-only 잔액 유지 → "6개 전부" 미충족이지만 오해 없음 |
| 다 | 독립 override 신설(`commercialFootprintOverride`) + V1 차단 → **그 값은 엔진 어디에도 도달하지 않음**(오타 방지용 검증 전용) |



---

## 3. 변경 지점 (A안 + 2-B 독립편집 + 2-C 가 기준)

### 3-1. 엔진 (Layer 2)

| # | 파일 | 변경 |
|---|---|---|
| E1 | `lib/tax-engine/types/transfer-mixed-use.types.ts:54` 부근 | **2필드** `commercialLandAreaOverride?`·`residentialFootprintOverride?` 추가 (three-state — 엔진 인자는 `number \| undefined`라 `??` 정본. **§2-C2 "다" 채택 시에만** `commercialFootprintOverride?` 3번째 추가) |
| E2 | `lib/tax-engine/mixed-use-derived-areas.ts:24-52` | `computeDerivedAreas`가 신규 override 3개 반영. **잔액 흡수 규칙 유지**(`residualArea` — 둘 다 미입력 시) |
| E3 | `lib/tax-engine/transfer-tax-mixed-use.ts:76` | 호출부는 `computeDerivedAreas(asset)` 그대로 → 자동 전파 (무변경 예상, 확인 필요) |
| E4 | `MixedUseLegacyStdPrice.tsx:49-50` **dual-truth D1 제거** | 자체 계산 → `computeDerivedAreas` 사용으로 통일. **override 반영 회복 = 동작 변경**이므로 anchor 필수 |
| E5 | `lib/calc/transfer-pre1990-phd-bridge.ts:30-35` **dual-truth D2 제거** | ⚠️ **초안 정정** — 아래 박스 참조 |
| E6 | `transfer-tax-api.ts:216-217` **B2** | `> 0` 게이트 → `.trim() !== ""` 문자열 분기로 three-state 보존 (0 전송 허용) |
| **E7** | `transfer-tax-mixed-use-helpers.ts:79` | ✅ **D3는 버그 아님**(engine.design §1-4). 남는 것은 `:79` `round2(T − x)` → `residualArea(T, x)` 1건 — **실측: `T` 3자리 소수 시 2.3%에서 ±0.01㎡**. `:248-250`은 **금액 안분**이라 대상 아님(S4) |

> **🚨 E5 초안 오류 (fork 검토가 발견 — Critical)**
>
> 초안은 `||` → `??`로 바꾸라 했으나 **코드를 망가뜨린다**. `parseArea`(`transfer-pre1990-phd-bridge.ts:22-23`)는
> `parseFloat((raw ?? "").replace(/,/g, "")) || 0` — **항상 number를 반환하고 null/undefined를 절대 반환하지 않는다**.
> `??`는 **영원히 미발동** → 미입력 시 `autoLandArea` 대신 **0이 반환**되어 자동 안분이 통째로 죽는다.
>
> **이번 세션 PR①에서 겪은 `parseAmount` + `??` 함정과 정확히 같은 계열**인데 초안이 그 교훈을 반영하지 못했다.
> §1 D2의 "정본은 `??`" 서술도 **이 파일에서는 거짓** — `??`가 정본인 곳은 `computeDerivedAreas`(인자가 `number | undefined`)뿐이다.
>
> **정정 사양** — 원시 문자열 수준 분기(`hasOverride` 패턴과 동형):
> ```ts
> const raw = asset.phdResidentialLandArea?.trim() ?? "";
> return raw !== "" ? parseArea(raw) : autoLandArea;
> ```

> **🚨 D3 — 엔진의 두 번째 파생 경로 누락 (fork 2건 수렴 — Critical)**
>
> 초안 §1은 "호출처 **4곳** 전부 같은 leaf를 쓴다"고 단정했으나 **5번째가 있다**:
> `transfer-tax-mixed-use.ts:78` `computeAcqDerivedAreas(asset, derived)` — §166⑥ **취득시** 안분.
> 이 함수(`helpers.ts:49-82`)는 `computeDerivedAreas`를 쓰지 않고 **알고리즘을 인라인 재구현**하며 override를 읽지 않는다.
>
> ⇒ E1/E2가 `computeDerivedAreas`에만 신규 override를 추가하면 **용도변경(§166⑥) ON 경로에서 침묵 무시**된다.
> 초안 §1의 "부수토지: 자동 관철 ✅"도 이 경로에서 거짓.
>
> **단, 이것이 곧 버그는 아니다** — 취득시 안분은 `acqResidentialArea`/`acqCommercialArea`(취득시 면적 구성, `types:106,108`)
> 기반의 **법령상 별개 파생**이고, ① 카드 override는 **양도시** 개념이다. 양시점에 같은 override를 적용하는 것이
> §166⑥상 옳은지는 **법령 검토 필요**(§6).
>
> **확정 버그 1건**: `helpers.ts:79` `round2(asset.totalLandArea - acqResLand)` — 정본 `residualArea(total, acqResLand)`
> 미사용. 이번 세션 `MixedUseAreaInputs.tsx:48`에서 고친 것과 **동일 버그 클래스**(`feedback_area_apportion_residual_absorption`).
> `helpers.ts:248-250`의 인라인 비율 재계산도 같은 계열.

**엔진 산식 영향 0**: override 미입력 시 기존 자동 안분과 동일값 → 회귀 없음(anchor로 동결).

### 3-2. 14 동기화 지점 (신규 **2필드** × 각 지점)

> **필드명 확정 (STEP 10 정합축 — engine.design §2-1)**: store는 `mixed*` 접두사 관례를 따른다.
> **store** `mixedCommercialLandAreaOverride` · `mixedResidentialFootprintOverride` (string)
> **엔진 input** `commercialLandAreaOverride` · `residentialFootprintOverride` (number?)
> 기존 `mixedResidentialLandAreaOverride`(store) ↔ `residentialLandAreaOverride`(엔진)과 동일 매핑 규칙.

| # | 지점 | 파일 |
|---|---|---|
| ① | 폼 상태 | `lib/stores/calc-wizard-asset-gb.ts:147-167` — `mixed*Override: string` 2필드 |
| ② | initial | `calc-wizard-asset-mixed-use.ts:11-57` `MIXED_USE_DEFAULTS` — **`Pick<AssetForm,...>` union에 필드명 등재 필수** + `""` |
| ③ | normalize | 동 `migrateMixedUseFields:75` 패턴 — `if (!a.x) a.x = "";` 2줄. **누락 시 sessionStorage 복원 자산이 `undefined` → ④ 가드 오분기(B1 재현)** |
| ④ | API 변환 | `lib/calc/transfer-tax-api.ts:136-146` `mixedUsePayload` — **명시 매핑**(spread 아님) → 2필드 추가 필수. **⚠️ `.trim() !== ""` 가드를 `parseDecimal` 앞에** (P2) |
| ⑤ | UI 위젯 | `MixedUseAreaInputs.tsx:128-171` — 6열 표시 → 입력칸 (§3-3 위젯 명세) |
| ⑥ | 사이드바 | `lib/stores/calc-wizard-store.ts:469` — `computeDerivedAreas` 인자에 2필드 |
| ⑦ | 결과 카드 | **해당 없음 — 실측 확정**. 결과뷰는 **100% 엔진 result 경유**(asset/form 면적 직접 read **0건**). `MixedUseResultCard`·`FilingFormTable*`·`DetailedCalculationStatementCard`·`lib/pdf/`·`lib/storage/` 전부. → **U4 자동 충족** |
| ⑧ | validation | `lib/calc/transfer-tax-validate-asset.ts` — **325행 직후·327행 앞** 삽입 |
| ⑨⑩⑪ | Zod enum·fallback | 해당 없음 |
| **⑫** | **Zod 입력 객체** | `lib/api/transfer-tax-schema-mixed-use.ts:37-49` — `z.object` **기본 strip 모드**(`.passthrough()` 없음) → **⑭가 spread여도 ⑫가 단일 게이트**. 2필드 `z.number().nonnegative().optional()` |
| **⑬** | **body spread** | `transfer-tax-api.ts:725` `...(mixedUsePayload ? { mixedUse: mixedUsePayload } : {})` → `:763` `JSON.stringify`. **④와 동일 지점** → ④ 이행 시 자동 충족 |
| **⑭** | **Route 매핑** | `app/api/calc/transfer/route.ts:679` `...data.mixedUse` — **spread → 자동 전파 ✅ 별도 작업 불요**(게이트 `:669` `propertyType === "mixed-use-house" && data.mixedUse`) |

### 3-2-1. ⚠️ **파생 계산 6축 대조표 (P4 — 이번 세션 PR#603 교훈)**

PR#603에서 "5축 중 파생계산 1축을 놓쳐 입력칸만 고쳐지고 자동합계는 '—'로 남는" 사고가 있었다. 신규 2필드도 **`computeDerivedAreas` 인자를 넘기는 축 전부**에 동일 우선순위로 전달되어야 한다.

| # | 축 | file:line | 신규 2필드 전달 |
|---|---|---|---|
| 1 | ① 카드 표시 | `MixedUseAreaInputs.tsx:32` | 필수 |
| 2 | ③ 상가란 | `MixedUseAssetMajorStdPrice.tsx:50` | 필수 |
| 3 | 사이드바 | `calc-wizard-store.ts:469` | 필수 |
| 4 | 엔진 양도시 | `transfer-tax-mixed-use.ts:76` | 필수(asset spread — 자동) |
| 5 | **엔진 취득시** | `transfer-tax-mixed-use.ts:78` → `helpers.ts:53` | ✅ **early return으로 자동**(용도변경 OFF). ON은 별도 안분이 정당 |
| 6 | Legacy | `MixedUseLegacyStdPrice.tsx:49-50` | **D1 — E4에서 헬퍼로 통일** |
| 7 | PHD bridge | `transfer-pre1990-phd-bridge.ts:30-35` | **D2 — E5에서 통일** |

### 3-3. UI 통일 (사용자 선택 4개)

| # | 항목 | 변경 |
|---|---|---|
| U1 | 상가 기준시가란 부수토지 입력칸 **제거** | `MixedUseAssetMajorStdPrice.tsx:238-252` FieldCard(testid `mixed-commercial-land-override` — `:249` 실측) + `onCommercialLandChange`(`:60-67`) 삭제. ① 카드 안내문(`MixedUseAreaInputs.tsx:173-175`) 삭제. **헤더 주석 `MixedUseAreaInputs.tsx:18-19` 갱신 필수**(L2 — "연면적 자동 파생(read-only)" · "부수토지는 아래 상가 기준시가란에서 수정"이 전부 거짓이 됨, `feedback_engine_comment_vs_impl_drift`). **E2E `e2e/mixed-use-exclusive-common-area.spec.ts:44-45` 수정 필수**(실측 확정 — `getByTestId` + `toBeVisible`) |
| ~~U2~~ | ~~PHD 3-시점 패널 면적 ①에서 조회~~ | **범위 밖 확정(2026-07-15 사용자)** — 배타를 풀면 §164⑦ 환산의 법정 입력을 ① 카드가 덮어쓴다. 법령 검토 필요 → 별건. **본 작업은 PHD OFF 경로 한정** |
| U3 | 건물기준시가 모달 연면적 prefill | 이미 `asset.nonResidentialFloorArea` 경로(2026-07-15 확인) → **동결 테스트만** |
| U4 | 엔진 API 전달값 ① 기준 | ⑫⑬⑭ 완료 시 자동 충족 |

### 3-3-1. ⑤ 위젯 명세 (G3~G8 — 초안에 전무했음)

**컴포넌트**: `DecimalInput`(면적㎡ 필수 — `components/calc/CLAUDE.md`. `CurrencyInput` 금지 — 333.06 → 33306 버그) + `FieldCard`(`badge`·`warning` 슬롯 보유 — 실측)

| 칸 | 라벨 | placeholder(숫자 예시 금지) | unit | testid | 편집 |
|---|---|---|---|---|---|
| 주택 연면적 | 주택 연면적 (㎡) | 주택 연면적 | ㎡ | `mixed-area-residential-floor` | ✅ 실필드 |
| 상가 연면적 | 상가 연면적 (㎡) | 상가 연면적 | ㎡ | `mixed-area-commercial-floor` | ✅ 실필드 |
| 주택 정착면적 | 주택 정착면적 (㎡) | 주택 정착면적 | ㎡ | `mixed-area-residential-footprint` | ✅ override |
| 상가 정착면적 | 상가 정착면적 (㎡) | 상가 정착면적 | ㎡ | `mixed-area-commercial-footprint` | §2-C2 결정 |
| 주택 부수토지 | 주택 부수토지 (㎡) | 주택 부수토지 | ㎡ | `mixed-area-residential-land` | ✅ 기존 override |
| 상가 부수토지 | 상가 부수토지 (㎡) | 상가 부수토지 | ㎡ | `mixed-area-commercial-land` | ✅ 신규 override |

- **컨테이너 testid `mixed-derived-floor`(`:131`) 유지** — 회귀 최소화. 단 `e2e/mixed-use-exclusive-common-area.spec.ts:37-39`의 `toContainText("72.00㎡")` → **`toHaveValue`로 수정 필수**(표시 텍스트가 input value로 이동 + `㎡` 접미사 소멸).
- **자동/수동 배지 (G4)** — 정본 패턴 `LandPriceLookupField.tsx:158-175` 재사용: `자동`(green-100/green-700) / `수동`(amber-100/amber-700) + `↻ 자동` 리셋 버튼. `FieldCard`의 `badge` 슬롯에 배치. 리셋 = override를 `""`로 write(`onCommercialLandChange:61-64` 빈값→클리어 패턴과 동형).
- **레이아웃 (G8)** — 현행 `grid grid-cols-3 sm:grid-cols-6`(`:130`)에 `DecimalInput` 6개는 **데스크톱 1칸 폭이 부족**(단위 + 소수). → `sm:grid-cols-2` **3행(쌍별 그룹)** 또는 `sm:grid-cols-3` 2행. 라벨은 `text-caption`(11px) → **`text-xs`(12px)** — 인접 전용/공통 입력 라벨(`:75`)과 통일.
- **경고·오류 표시 (G5)** — V2 차단은 validate 반환 → **상단 에러 배너**(기존 경로). V3 경고는 6칸 박스 **직하 인라인**. **톤은 `components/calc/shared/tones.ts`의 `TONE` 상수 사용**(인라인 하드코딩 금지 — pre-push `check-tone-classes.sh` 하드블록). ⚠️ **rose 충돌 주의**: 이 카드에 이미 rose 소그룹(`:179-191` "부수토지 배율 지역")이 있어 rose가 경고/섹션성격 2역 충돌(`components/calc/CLAUDE.md` "2축 주의") → **amber(주의) 검토**.

### 3-4. 합계 검증 (⑧)

**삽입 위치 (실측)**: `transfer-tax-validate-asset.ts` 면적 블록 **325행 직후**(기본 4필드 검증 뒤) · **327행 앞**(override 범위 검증 앞).

| 검증 | 조건 | 게이트 | 강도 |
|---|---|---|---|
| ~~V1~~ | ~~정착합 = buildingFootprintArea~~ | — | **삭제** — §2-C2 "가" 채택 시 상가=역산이라 **항상 일치 → 죽은 코드** |
| V2 | `주택 부수토지 + 상가 부수토지 = mixedUseTotalLandArea` | `totalLand > 0` **필수(P1)** · **두 override 모두 설정 시만 발동**(§2-B) | **차단** |
| V3 | `주택 연면적 + 상가 연면적 = 전용합 + 공통` | `exR + exC > 0` (`onExclusiveChange:47` 게이트와 동일 — 공통 0 허용) | **경고**(A안) |

- **허용오차**: `round2` 정책상 면적은 소수 2자리 확정 → 비교도 `round2` 후 **정확 일치**. 오차 허용 불필요.
- 두 칸 모두 미입력이면 자동 안분 → 항상 일치 → **기존 사용자 영향 0**.

**기존 검증 메시지 정정 필요 (실측)**: `:318-321`은 **파생 필드(`residentialFloorArea`)를 검사하면서 메시지는 "주택 전용면적(㎡)을 입력하세요"**라고 안내한다. ① 카드 편집가능화로 "전용면적을 비우고 연면적만 직접 입력"하는 경로가 생기면 이 메시지가 **오도적**이 된다 → 문구 조정 대상.

---

## 4. 케이스 매트릭스

| # | 주택 | 상가 | 전체 | 기대 |
|---|---|---|---|---|
| C1 | 미입력 | 미입력 | 200 | 자동 안분 표시, 합=200, 통과 (**기존 동작 — 회귀 0**) |
| C2 | 90.29 | 미입력 | 200 | 상가=잔액 109.71 자동, 통과 |
| C3 | 미입력 | 78.01 | 200 | 주택=잔액 121.99 자동, 통과 |
| C4 | 90.29 | 109.71 | 200 | 합=200 통과 |
| C5 | 90.29 | 78.01 | 200 | 합=168.30 ≠ 200 → **차단** |
| C6 | 0 | 200 | 200 | 통과 (0은 적법 — three-state) |
| C7 | 200 | 0 | 200 | 통과 |
| C8 | 90.29 | 109.71 | 미입력 | 전체 토지 미입력 → 기존 검증이 선행 차단 (확인 필요) |
| C9 | PHD ON + override | — | — | **배타 정책 결정 필요** (U2) |

정착면적도 동형 매트릭스(전체 = `buildingFootprintArea`).

---

## 5. 작업 순서

0. ✅ **결정 3건 확정 완료** — §2-A=A안 · §2-A2=가(전용/공통 클리어) · §2-C2=가(주택 역산)
1. **PR 분리** (G9) — **PR① 기존 결함 수정**(E4 D1 · E5 D2 · E6 B2 · E7 `helpers.ts:79` residualArea + anchor) → **PR② 신규 필드·편집·검증**. 본 기능과 독립이며 각각 동작 변경 → 섞으면 회귀 시 bisect 격리 불가. **순차 머지**(스택 PR 금지 — 이번 세션에 `--delete-branch`가 하위 PR을 자동 닫은 사례)
2. **Pre-Do anchor** — C1(회귀 0: override 미입력 시 기존 엔진 결과 불변) + C5(차단) 먼저 작성·실행, **현행에서 C5가 실패**함을 확인
3. 엔진 E1~E2 → anchor 통과
4. E4 dual-truth 제거 → Legacy anchor
5. 14지점 ①②③ → ④⑫⑬⑭ → ⑤ → ⑥ → ⑧
6. U1 제거 → U2 결정 반영 → U3 동결 테스트
7. 게이트: `tsc` · `lint` · `npm test` · 톤/폰트 게이트
8. **차단 validation 전체 E2E 회귀 (필수)**
9. 코드 품질 게이트 → 커밋

### 5-1. 차단 validation 영향 — **실측 완료**

`feedback_blocking_validation_full_e2e_regression` 정책상 착수 전 실측 필요 → 완료:

**면적을 입력하는 E2E spec 5개**:
- `e2e/mixed-use-exclusive-common-area.spec.ts` ← 본 기능 최근접
- `e2e/mixed-use-asset-major-commercial-modal.spec.ts`
- `e2e/mixed-use-case-a-asset-major.spec.ts`
- `e2e/transfer-phd-building-stdprice-calculator.spec.ts`
- `e2e/mixed-use-transfer-landprice-fallback.spec.ts`

**차단 규칙 자체의 위험은 낮다** — 5개 모두 override 미입력 → C1(자동 안분 → 합 일치) 경로. 단 **조건 2개가 반드시 지켜져야** 한다:

> **🚨 필수 설계 제약 (조사 실측)**
>
> **P1. `totalLand = 0` 게이트 필수** — `전체 토지 면적`을 입력하지 **않는 spec이 3개**(`mixed-use-asset-major-commercial-modal` · `transfer-phd-building-stdprice-calculator` · `mixed-use-case-a-asset-major`). 부수토지 합계 규칙이 `totalLand = 0`에서도 발동하면 **이 3개가 전부 차단**된다. → 검증은 `totalLand > 0`일 때만.
> (정착면적도 동형 — `buildingFootprintArea = 0` 게이트)
>
> **P2. `onExclusiveChange` 자동 write 유지 필수** — `MixedUseAreaInputs.tsx:41-55`가 전용/공통 입력 시 연면적을 **같은 patch로 자동 write**하기 때문에 합계가 항상 정합 상태로 생성된다. 편집가능화하면서 이 자동 write를 **제거하면 5개 spec 전부 깨진다**. → **자동 write 유지 + 사용자가 직접 편집할 때만 override로 승격**하는 설계가 안전(A안과 정합).

**⑤ 표시→입력 전환의 셀렉터 파괴 (실측)**:
- `testid="mixed-derived-floor"`(`MixedUseAreaInputs.tsx:131`) 6열 박스의 DOM 구조가 바뀌면 `e2e/mixed-use-exclusive-common-area.spec.ts:16,37,44`가 깨진다(연면적 72/48 + 상가 부수토지 override 노출 검증).
- `__tests__/components/mixed-use-area-inputs-residual.anchor.test.tsx:42` — 연면적 합 불변식 (이번 세션 신설)
- `__tests__/components/mixed-use-stdprice-point-order.anchor.test.tsx:135` — `override: "200"` → 상가 부수토지 0 경계 (이번 세션 신설)
- `__tests__/components/phd-modal-housing-floor-area-prefill.test.tsx:21` · `__tests__/tax-engine/transfer-tax/mixed-use-derived-areas.test.ts`(헬퍼 anchor 전체)

**U1(상가란 입력칸 제거) 셀렉터 영향**: testid `mixed-commercial-land-override`(`MixedUseAssetMajorStdPrice.tsx:249` — 실측 확인) 사용처 확인 필요.

**면적 파생 표시를 검증하는 테스트 11개**(⑤ 변경 시 셀렉터 영향):
`__tests__/components/{mixed-use-area-inputs-residual,mixed-use-stdprice-point-order,phd-modal-housing-floor-area-prefill,transfer-multicard-tonecard}` · `__tests__/tax-engine/transfer-tax/mixed-use-derived-areas.test.ts` · `__tests__/tax-engine/non-business-land/{housing-land,qa-land-type-flow}` · fixtures 3건 · `e2e/mixed-use-exclusive-common-area.spec.ts`

> ⑤에서 표시 `<span>` → `DecimalInput`으로 바뀌면 `getByText("327.61㎡")` 류 셀렉터가 전부 깨진다. **표시 단위(`㎡`) 접미사도 사라진다** → 위 11개 중 표시값을 assert하는 것 전수 수정 필요.

---

## 6. 확인 필요 (미검증)

2. **§166⑥ 인용 재검토 (P1)** — `feedback_no_silent_apportion_fallback`의 금지 대상은 "기준시가·취득가액·**공시지가**"이고 §166⑥ 예외는 "**전체 건물 기준시가**를 면적 비율로 안분"에 대한 것 — **면적 안분 자체가 아니다**. 결론(위반 아님)은 유지하되 근거는 "면적 안분은 금지 대상에 해당 없음 + 부수토지 안분 근거는 `mixed-use-derived-areas.ts:8`의 **§160①/§164⑫**"로 교체. §166⑥은 토지/건물 분리 양도차익 조문이라 부수토지 면적 안분 근거로 부적절. **KoreanLaw MCP 미검증 → 확인 필요**
3. ~~D3 취득시 override 적용 여부~~ — ✅ **해소(engine.design §1-4)**: `helpers.ts:53` early return으로 **용도변경 OFF면 override가 양시점 자동 관철**. ON일 때만 취득시 면적 구성으로 별도 안분하는데, 양도시 기준 override를 적용하면 오히려 틀림 → **현행 유지가 정답. D3는 버그 아님**
4. **U2 PHD 배타 정책** — PHD ON이면 override 배타(`MixedUseAreaInputs.tsx:31`)하고 `phdResidentialLandArea`(직접입력, `calc-wizard-asset.ts:392`)가 담당. "PHD 면적도 ①에서 조회"하려면 배타를 풀어야 하는데 PHD는 §164⑦ 환산의 법정 입력 → **법령 검토 필요**. ①카드 파생값과의 정확한 관계 미확정.
3. **⑬⑭ 실제 위치** — `callTransferTaxAPI` body spread·Route 매핑 라인 미확인
4. **⑦ 결과뷰·신고서·PDF·print 면적 소비처** — 조사 미완(에이전트가 이 레이어 미도달). **U1~U4 통일 범위에 영향** → Do 전 필수 조사
5. **`transfer-tax-mixed-use-helpers.ts` 내부 소비 지점** — re-export(`:37`)만 확인, 내부 재소비 미확인
6. **E3** — 엔진 호출부(`transfer-tax-mixed-use.ts:76`) 무변경 가정 미검증
7. **B1 실현 가능성** — `transfer-tax-api.ts:144` optional chaining 버그가 런타임에 도달하는지 (마이그레이션이 `""` 보장 → 미도달 가능)
8. **C8** — 전체 토지 미입력 시 선행 검증(`:322-323`)이 차단하므로 도달 불가로 보이나 미검증
9. **testid `mixed-commercial-land-override` 사용처** — U1 제거 시 영향

---

## 7. 범위 밖

- **U2 — PHD 3-시점 패널 면적 통일 (2026-07-15 사용자 결정)**. PHD ON이면 `phdResidentialLandArea`가 §164⑦ 환산의 법정 입력이고 ① 카드 override는 배타된다(`MixedUseAreaInputs.tsx:31`·`types:51-52`). 배타 해제는 법령 검토가 선행돼야 하므로 별건. **⇒ 본 작업의 6칸 편집은 PHD OFF 경로 한정**(PHD ON이면 현행대로 부수토지 override 배타 유지)

- 겸용주택 외 자산(`GeneralBuildingBlock`·`CommercialBuildingBlock`)의 면적 — 본 계획은 겸용주택 한정
- 면적 안분 `round2`/`residualArea` 정책 자체 — 무변경
- 상가 기준시가·공시지가 로직 — 무변경

---

## 8. 규모·비용 메모

- **엔진 input 2필드 신규 → "대" 규모** — `plan-design-self-review-loop` 상 `.engine.design.md` + `.ui.design.md` **생성 강제**
- 표시 → 입력 전환으로 **테스트 셀렉터 11개 파일** 수정
- 잔액 자동조정 폐지는 **기존 UX 변경** — 상가란에서 부수토지를 고치던 사용자 흐름이 사라짐(U1)
