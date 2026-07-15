# 겸용주택 면적 단일 소스화 — 엔진·데이터 설계

- 계획서: [`mixed-use-area-single-source-editable.plan.md`](./mixed-use-area-single-source-editable.plan.md)
- 작성일: 2026-07-15 (STEP 5)
- 확정 결정: §2-A=A안 · §2-A2=가(전용/공통 클리어) · §2-C2=가(주택 정착면적 역산)
- **엔진 산식 변경 0** — override 미설정 시 기존 자동 안분과 **비트 단위 동일**해야 한다(회귀 anchor로 동결)

---

## 1. 케이스 인벤토리

`R` = 주택 override, `C` = 상가 override. 미설정 = `undefined`(3-state).

> **예시 전제 (X5 — 초안 누락)**: 이하 수치는 **`T`(`totalLandArea`) = 200㎡ · `F`(`buildingFootprintArea`) = 100㎡ · `ratio`(주택연면적비율) = 0.5** 기준.

### 1-1. 부수토지 (`residentialLandAreaOverride` · `commercialLandAreaOverride`)

| # | R | C | `residentialLandArea` | `commercialLandArea` | Σ = T? | V2 |
|---|---|---|---|---|---|---|
| L1 | ∅ | ∅ | `round2(T × ratio)` | `residualArea(T, 주택)` | ✅ | 통과 (**현행 = 회귀 0**) |
| L2 | 90.29 | ∅ | `90.29` | `residualArea(T, 90.29)` = 109.71 | ✅ | 통과 |
| L3 | ∅ | 78.01 | `residualArea(T, 78.01)` = 121.99 | `78.01` | ✅ | 통과 |
| L4 | 90.29 | 109.71 | `90.29` | `109.71` | ✅ | 통과 |
| **L5** | **90.29** | **78.01** | **`90.29`** | **`78.01`** | ❌ 168.30 | **차단** |
| L6 | 0 | ∅ | `0` | `residualArea(T, 0)` = 200 | ✅ | 통과 (0 적법 — three-state) |
| L7 | ∅ | 0 | `residualArea(T, 0)` = 200 | `0` | ✅ | 통과 |
| L8 | 200 | 0 | `200` | `0` | ✅ | 통과 |
| L9 | ∅ | ∅ | T=0 → 0 | T=0 → 0 | — | **게이트 skip**(P1 — `T > 0`일 때만 검증) |

> **L5가 유일한 차단 경로**다. 한쪽만 설정하면 나머지가 잔액을 흡수해 항상 일치한다(§2-B 규칙표).

### 1-2. 정착면적 (`residentialFootprintOverride` — 1개, 상가는 역산)

`F` = `buildingFootprintArea`.

| # | R_fp | UI 상가 입력 | `residentialFootprintArea` | 상가 정착(표시) | 비고 |
|---|---|---|---|---|---|
| F1 | ∅ | — | `round2(F × ratio)` | `residualArea(F, 주택)` | 현행 = 회귀 0 |
| F2 | 53.65 | — | `53.65` | `residualArea(F, 53.65)` = 46.35 | 주택 직접 입력 |
| F3 | (역산) | 46.35 | `residualArea(F, 46.35)` = 53.65 | `46.35` | **§2-C2 "가"** — 상가 입력 → 주택 override write |
| F4 | 0 | — | `0` | `residualArea(F, 0)` = F | 0 적법 |

> **V1 없음** — 상가가 항상 역산이라 `Σ = F` 불변식이 구조적으로 성립.

### 1-3. 연면적 (실필드 — 신규 필드 0)

| # | 전용R | 전용C | 공통 | 연면적R | 연면적C | V3 |
|---|---|---|---|---|---|---|
| A1 | 300 | 259.2 | 51.46 | `onExclusiveChange` 파생 327.61 | 283.05 | 게이트 통과·일치 |
| A2 | ∅ | ∅ | ∅ | 사용자 직접 327.61 | 직접 283.05 | **게이트 skip**(`exR + exC = 0`) |
| A3 | 300 | 259.2 | 51.46 | 사용자가 400으로 수동 편집 | — | **§2-A2 "가" → 전용/공통 클리어** → A2로 전이 → 경고 소멸 |

> **V3는 §2-A2 "가" 채택으로 사실상 도달 불가**(수동 편집 즉시 전용/공통이 비므로). 오타 방지용 잔존.

### 1-4. 용도변경(§166⑥) 경로 — ✅ **D3 해소(버그 아님)**

| # | 상태 | `computeDerivedAreas`(양도시) | `computeAcqDerivedAreas`(취득시) |
|---|---|---|---|
| P1 | 용도변경 OFF | override 반영 | **호출됨** — `helpers.ts:53` `if (!asset.partialUsageChange) return transferDerived;` **early return**으로 override 반영분 그대로 반환 → **자동 관철 ✅** (S1 정정 — 초안 "미호출"은 거짓) |
| **P2** | **용도변경 ON + override 설정** | override 반영 | **`acqResidentialArea`/`acqCommercialArea` 기반 자체 안분 — override 미반영(정당 — 아래)** |

> **⚠️ 초안 문구 정정 (X1 — fork 지적 일부 수용)**: 초안은 "① 카드 override는 **양도시** 개념"이라 썼으나 부정확하다.
> 기존 타입 계약(`types:47-53`)은 이 필드를 **"취득·양도 양시점 공통 필지 면적 · 시점 무관"**으로 명문화한다.
>
> **다만 fork의 "설계 전제가 거짓 → D3는 버그" 결론은 과잉 주장이다.** 실측(`helpers.ts:53`):
> ```ts
> if (!asset.partialUsageChange) return transferDerived;   // 용도변경 OFF → 양도시 파생 그대로
> ```
> ⇒ **용도변경 OFF면 `acqDerived === derived`** 이므로 override가 **양시점에 이미 적용된다**(기존 계약대로 ✅).
> JSDoc `:49`의 괄호 "(용도변경 없으면 acqDerived=derived)"가 정확히 이를 뜻한다.
>
> **용도변경 ON일 때만** 취득시 면적 구성(`acqResidentialArea`/`acqCommercialArea`, `types:106,108`)으로 별도 안분한다.
> 이때 override(= **양도시 면적 구성** 기준으로 사용자가 지정한 값)를 적용하면 **오히려 틀린다** —
> 예: `house_to_commercial`이면 취득시 건물이 100% 주택이라 주택 부수토지 = 전체 토지이고, 양도시 상가 안분값과 무관하다.
>
> **⇒ 기본값 확정: 용도변경 ON 경로에서 취득시 override 미적용(현행 유지) — 법령·기존 코드와 정합.**
> D3는 **버그가 아니다**. 남는 것은 아래 `:79` `residualArea` 미사용 1건뿐(E7-a).

---

## 2. 엔진 input 타입 변경

`lib/tax-engine/types/transfer-mixed-use.types.ts`

```ts
export interface MixedUseAssetInput {
  residentialFloorArea: number;            // :40 (기존)
  nonResidentialFloorArea: number;         // :42 (기존)
  buildingFootprintArea: number;           // :44 (기존)
  totalLandArea: number;                   // :46 (기존)

  /**
   * 주택 부수토지 수동 지정 (㎡). 미제공 시 `totalLandArea × 주택연면적비율` 자동 산출.
   * 0은 적법(three-state) — `??`로 보존. PHD ON 경로는 preHousingDisclosure.landArea가 담당(배타).
   */
  residentialLandAreaOverride?: number;    // :54 (기존)

  /**
   * ▼ 신규 1 — 상가 부수토지 수동 지정 (㎡).
   * 미제공 시 `residualArea(totalLandArea, 주택부수토지)` 잔액.
   * 주택·상가 **둘 다 제공**되면 각 값을 그대로 사용(잔액 미적용) → 합계 불일치 가능 → validate가 차단.
   */
  commercialLandAreaOverride?: number;

  /**
   * ▼ 신규 2 — 주택 정착면적 수동 지정 (㎡).
   * 미제공 시 `buildingFootprintArea × 주택연면적비율` 자동 산출.
   * 상가 정착면적은 항상 `residualArea(buildingFootprintArea, 주택정착)` 잔액 — 별도 필드 없음
   * (엔진 소비처 0건 — helpers.ts:615는 주택분만 사용).
   */
  residentialFootprintOverride?: number;
}
```

**⚠️ three-state 계약**: 인자 타입이 `number | undefined`이므로 **`??`가 정본**이다. 단 **호출부(UI·API)가 `parseDecimal`/`parseAmount`를 거치면 빈값이 `0`이 되어 계약이 깨진다**(`DecimalInput.tsx:93` — `parseDecimal("") === 0`) → 호출부는 **반드시 문자열 수준 분기 후** 조건부로 필드를 넣는다.

### 2-1. store 축 ①②③ (S7 — 초안 누락)

| # | 파일 | 내용 |
|---|---|---|
| ① | `lib/stores/calc-wizard-asset-gb.ts:147-167` | `mixedCommercialLandAreaOverride: string;` · `mixedResidentialFootprintOverride: string;` (기존 `mixedResidentialLandAreaOverride` 명명 관례) |
| ② | `lib/stores/calc-wizard-asset-mixed-use.ts:11-57` | `MIXED_USE_DEFAULTS`의 `Pick<AssetForm, ...>` **union에 필드명 등재 필수** + 값 `""` |
| ③ | 동 `migrateMixedUseFields:75` 패턴 | `if (!a.mixedCommercialLandAreaOverride) a.mixedCommercialLandAreaOverride = "";` (2줄) |

> ①②③ 누락 시 sessionStorage 복원 자산에서 `undefined` → ④의 가드가 `?.trim()`이면 오분기(B1 재현).

### 2-2. ⑫ Zod 스키마 (S2 — 초안 누락, **단일 게이트**)

`lib/api/transfer-tax-schema-mixed-use.ts:44` 옆:
```ts
commercialLandAreaOverride: z.number().nonnegative().optional(),
residentialFootprintOverride: z.number().nonnegative().optional(),
```
- **`z.object`는 기본 strip 모드**(`.passthrough()` 없음) → 여기 없으면 **Zod가 조용히 제거**한다. ⑭ Route가 `spread`(`route.ts:679`)라 자동 전파되므로 **⑫가 진짜 단일 게이트**.
- **`.positive()` 금지** — `0`이 적법(L6·L7·F4) → `.nonnegative()` 필수(기존 `:44`와 동일 패턴).

### 2-3. ④=⑬ API 명시 매핑 (S3 — 초안이 산문으로만 언급)

`lib/calc/transfer-tax-api.ts:136-146` `mixedUsePayload`는 **명시 필드 매핑**(spread 아님 — `feedback_explicit_prop_mapping_strip`):
```ts
...((primary.mixedCommercialLandAreaOverride ?? "").trim() !== ""
  ? { commercialLandAreaOverride: parseFloat(primary.mixedCommercialLandAreaOverride) || 0 }
  : {}),
...((primary.mixedResidentialFootprintOverride ?? "").trim() !== ""
  ? { residentialFootprintOverride: parseFloat(primary.mixedResidentialFootprintOverride) || 0 }
  : {}),
```
> **🚫 `?.trim()` 금지** — 기존 `:144`의 B1 버그(`undefined?.trim() !== ""` → `undefined !== ""` → **true**)를 복제하게 된다. **`?? "" ` 선행 필수**.

---

## 3. 알고리즘 — `computeDerivedAreas` 개정

`lib/tax-engine/mixed-use-derived-areas.ts`

```ts
export function computeDerivedAreas(input: {
  residentialFloorArea: number;
  nonResidentialFloorArea: number;
  buildingFootprintArea: number;
  totalLandArea: number;
  residentialLandAreaOverride?: number;
  commercialLandAreaOverride?: number;   // 신규
  residentialFootprintOverride?: number; // 신규
}): MixedUseDerivedAreas {
  const total = input.residentialFloorArea + input.nonResidentialFloorArea;
  if (total <= 0) {
    return { residentialRatio: 0, residentialLandArea: 0,
             commercialLandArea: round2(input.totalLandArea), residentialFootprintArea: 0 };
  }
  const residentialRatio = input.residentialFloorArea / total;

  // ── 부수토지 — 4분기 (§2-B 규칙표) ──
  const rSet = input.residentialLandAreaOverride !== undefined;
  const cSet = input.commercialLandAreaOverride !== undefined;
  let residentialLandArea: number;
  let commercialLandArea: number;
  if (rSet && cSet) {
    // ⚠️ 잔액 흡수 의도적 미적용 — feedback_area_apportion_residual_absorption 규칙2의 **정당한 예외**.
    //    정책 목적은 "Σ안분면적 = 전체" 불변식인데, 여기서는 그 위반을 **사용자에게 보여주기 위해 일부러 보존**한다
    //    (V2 차단의 유일한 발동 경로 = L5). 잔액을 적용하면 오류가 침묵 교정돼 검증 자체가 죽는다.
    //    validate가 차단하므로 **엔진 계산에 도달하는 시점에는 Σ=T가 보장**된다.
    residentialLandArea = input.residentialLandAreaOverride!;
    commercialLandArea = input.commercialLandAreaOverride!;
  } else if (rSet) {
    residentialLandArea = input.residentialLandAreaOverride!;
    commercialLandArea = residualArea(input.totalLandArea, residentialLandArea);
  } else if (cSet) {
    commercialLandArea = input.commercialLandAreaOverride!;
    residentialLandArea = residualArea(input.totalLandArea, commercialLandArea);
  } else {
    residentialLandArea = round2(input.totalLandArea * residentialRatio);
    commercialLandArea = residualArea(input.totalLandArea, residentialLandArea);
  }

  // ── 정착면적 — override(주택) ?? 자동 ──
  const residentialFootprintArea =
    input.residentialFootprintOverride ?? round2(input.buildingFootprintArea * residentialRatio);

  return { residentialRatio, residentialLandArea, commercialLandArea, residentialFootprintArea };
}
```

**회귀 불변식**: `rSet = cSet = false` AND `residentialFootprintOverride === undefined` → **현행 코드와 완전 동일 경로**(L1·F1). 기존 anchor 전량 무변경 통과해야 한다.

### 3-1. 결과 타입 — 상가 정착면적 노출 여부

현행 `MixedUseDerivedAreas`(`types:123-131`)에 **상가 정착면적이 없다**. UI가 `MixedUseAreaInputs.tsx:155`에서 인라인 계산한다.

- **결정**: `MixedUseDerivedAreas`에 `commercialFootprintArea` **추가하지 않는다**. 인라인 유지.
- 근거: 엔진 소비처 0건 · echo 필드를 늘리면 14지점이 넓어짐 · UI 인라인은 **`residualArea(buildingFootprintArea, derived.residentialFootprintArea)`** 로 정본화(현행 `round2(footprint − 주택정착)`은 정본 이탈). ⚠️ **`derived.residentialFootprintArea`를 읽을 것** — `round2(F × ratio)`로 재계산하면 override가 무시돼 D-계열 결함을 재생산한다(S10).

---

## 4. 기존 결함 수정 (PR ① — 본 기능과 독립)

| # | 파일:line | 현행 | 수정 | 동작 변경 |
|---|---|---|---|---|
| E4 (D1) | `MixedUseLegacyStdPrice.tsx:49-50` | 자체 비율 계산, override 무시 | `computeDerivedAreas` 호출로 통일 | **있음** — legacy 경로에서 override가 처음으로 반영됨 |
| E5 (D2) | `transfer-pre1990-phd-bridge.ts:35` | `parseArea(phdResidentialLandArea) \|\| autoLandArea` | `const raw = asset.phdResidentialLandArea?.trim() ?? ""; return raw !== "" ? parseArea(raw) : autoLandArea;` | **있음** — `0` 입력이 살아남음 |
| E6 (B2) | `transfer-tax-api.ts:216-217` | `parseFloat(phd...) > 0`일 때만 전송 | `.trim() !== ""` 문자열 분기 | **있음** — `0` 전송 허용 |
| E7-a (D3-adjacent) | `helpers.ts:79` | `round2(asset.totalLandArea - acqResLand)` | `residualArea(asset.totalLandArea, acqResLand)` | **실측(S5 — 30만건 브루트포스): `totalLandArea` 3자리 소수 입력 시 2.309%에서 ±0.01㎡**(예 `T=21.015, x=17.76` → 현행 3.25 / 정본 3.26). `mixedUseTotalLandArea`는 `DecimalInput` 자유 입력이라 **도달 가능**. 0.01㎡ × 공시지가 = 수만원대. ⚠️ 초안의 "미미"는 **미측정 단정**이었다(`feedback_numeric_impact_verify_before_bug_claim` 역방향 위반) |
| ~~E7-b~~ | ~~`helpers.ts:248-250`~~ | — | **삭제 (S4)** — 이 라인은 **면적 안분이 아니라 금액(기준시가) 안분**(`acqCommTotal × housRatio → Math.floor`)이다. **금액은 `Math.floor`가 정본**이고 `residualArea`/`round2`는 면적 전용 → 초안의 "헬퍼 통일"은 **정책을 거꾸로 적용**하는 것. 본 계획 무관 | — |
| B1 | `transfer-tax-api.ts:144` | `primary.x?.trim() !== ""` | `(primary.x ?? "").trim() !== ""` | 없음(방어적 — migrate가 `""` 보장해 현재 미도달) |

> ⚠️ **E5·E6는 `??`가 아니라 문자열 분기**다. `parseArea`/`parseFloat`가 항상 number를 반환하므로 `??`는 미발동한다(E-1 Critical).

---

## 5. anchor 계획

### 5-1. 회귀 동결 (최우선 — Pre-Do)

| anchor | 내용 |
|---|---|
| `AREA-REG-01` | override 미설정 → **현행과 비트 동일**(L1·F1). **실측 완료**: 기존 `mixed-use-derived-areas.test.ts` **7케이스 전량 통과** — C2(둘 다 미설정→else) · C3(rSet만→L2 경로) · **C6(override=0 → `0 !== undefined` = true → rSet 분기 → three-state 보존)** · C4(early return) · C5(ratio=1) · 정착면적 · round2 export. **C6가 rSet 판정(`!== undefined`)의 three-state 정확성을 이미 동결**한다 |
| `AREA-REG-02` | 엔진 통합 — 겸용 fixture로 계산한 세액이 **변경 전후 동일** |

### 5-2. 신규 동작

| anchor | 케이스 |
|---|---|
| `AREA-L2/L3` | 한쪽만 설정 → 나머지 잔액 |
| `AREA-L4` | 둘 다 설정 + 합 일치 → 통과 |
| **`AREA-L5`** | **둘 다 설정 + 합 불일치 → validate 차단** ← 핵심 |
| `AREA-L6/L7/L8` | 0 override 보존(three-state) |
| `AREA-L9` | `T = 0` → 검증 skip (P1 — E2E 3개 보호) |
| `AREA-F2/F3` | 정착면적 주택 직접 / 상가 역산 |
| `AREA-3STATE` | **문자열 `""` → 필드 미전송**(P2 — `parseDecimal("")=0` 함정 방어) |

### 5-3. 기존 결함 (PR ①)

| anchor | 케이스 |
|---|---|
| `AREA-D1` | Legacy 경로에서 override가 자동합계에 반영 |
| `AREA-D2` | `phdResidentialLandArea = "0"` → 자동 안분으로 덮어써지지 않음 |
| `AREA-D2-NEG` | `phdResidentialLandArea = ""` → 자동 안분 **유지**(E5 정정이 이걸 깨지 않는지 — `??` 오적용 방어) |

---

## 6. 확인 필요

2. **§160①·§164⑫ 인용** — `mixed-use-derived-areas.ts:8` 주석 기반. **KoreanLaw MCP 미검증**
4. **U2 PHD 배타** — `phdResidentialLandArea` ↔ ① 카드 override 관계
