# 엔진설계 — 겸용주택 전용/공통면적 안분 + 양도시 부수토지 override + 안분 leaf 헬퍼

> Status: **Design (STEP 5)** · 2026-07-09 · 계획서 [`mixed-use-exclusive-common-area-apportion.plan.md`]
> 세목: 양도소득세 겸용주택. 근거: 소득세법 시행령 §160①·§164⑤⑫. Q5=안B·Q6=세법무관 확정 반영.

---

## 1. 엔진 변경 범위 (요약)

| 변경 | 파일 | 성격 |
|---|---|---|
| **leaf 모듈 신규** `computeDerivedAreas`+`round2` 추출 | `lib/tax-engine/mixed-use-derived-areas.ts` | 리팩터(무동작변경) + override 파라미터 추가 |
| `MixedUseAssetInput` override 1필드 | `types/transfer-mixed-use.types.ts` | 신규 optional input |
| `computeDerivedAreas` override 반영 | leaf 모듈 (from `transfer-tax-mixed-use-helpers.ts:38-58`) | 안분 분기 |
| 전용/공통→연면적 파생 | **UI 전용** (`MixedUseAreaInputs.tsx`) — 엔진 미도달 | store만 |

**엔진 무변경 영역**: 연면적 파생(전용+공통)은 UI에서 `residentialFloorArea`·`nonResidentialFloorArea`로 store write → 엔진은 기존과 동일하게 연면적만 받음(Q6: 세법 계산 무관). 엔진이 실제로 바뀌는 건 **override 1필드 + leaf 추출** 둘뿐.

---

## 2. 케이스 인벤토리

| # | usePHD | 전용R·C | 공통 | 전체토지 | override | 기대 (엔진 산출) |
|---|---|---|---|---|---|---|
| C1 | OFF | 60·40 | 20 | — | — | 연면적 R=72·C=48 (공통20을 6:4 안분, UI) |
| C2 | OFF | 60·40 | 0 | 200 | — | `residentialLandArea=120`·`commercialLandArea=80` (현행 안분 불변) |
| C3 | OFF | 60·40 | 20 | 200 | R=100 | `residentialLandArea=100`(override)·`commercialLandArea=100`(=200−100) |
| C6 | OFF | 60·40 | 20 | 200 | R=0 | `residentialLandArea=0`(override, three-state)·`commercialLandArea=200` |
| C4 | OFF | 0·0 | 0 | — | — | 연면적 0, `total<=0` early return → `residentialLandArea=0`·`commercialLandArea=round2(totalLandArea)` |
| C5 | OFF | 100·0 | 30 | 200 | — | 상가0(순수주택 취급) → `residentialRatio=1`·`residentialLandArea=200`·`commercialLandArea=0`. 겸용 판정 상호작용 확인 |
| C7 | OFF | 60·40 | 0 | 300 | R=250 | override→`commercialLandArea=50`→상가 토지 std·양도가액 안분·NBL 배율초과 파급 |
| P1 | **ON** | 60·40 | 0 | 200 | R=150(via phd) | **override 미노출** — `phdResidentialLandArea`가 3시점 담당. 신규 override 무시 |
| R1 | OFF | (legacy 이력, 전용/공통 없음) | — | 200 | — | migrate가 전용/공통 `""`. 파생 gate로 연면적 보존 → 엔진 입력 불변 (회귀 0) |

(계획서 §8 = C1~C7, 엔진설계 §2 = +P1(PHD ON)·R1(legacy 회귀) 추가. 양 문서 케이스 정합.)

**핵심 불변식**: `residentialLandArea + commercialLandArea = totalLandArea` (방식 B). override는 주택 축만, 상가는 항상 `전체−주택` 파생.

---

## 3. Input 타입 변경

### 3.1 `MixedUseAssetInput` (엔진 공개 타입)

```ts
export interface MixedUseAssetInput {
  // ... 기존 필드 ...
  residentialFloorArea: number;      // 기존 — UI에서 전용+공통 파생 결과가 흐름
  nonResidentialFloorArea: number;   // 기존 — 동상
  totalLandArea: number;             // 기존

  /**
   * [신규] 주택 부수토지 면적 수동 지정 (㎡) — PHD OFF(일반 §97) 전용.
   * ⚠️ 취득·양도 양시점 공통 필지 면적(용도변경 없으면 acqDerived=derived). 시점 무관.
   * 미제공(undefined) 시 엔진이 `totalLandArea × 주택연면적비율`로 자동 산출.
   * 0은 적법(주택부수토지 0) — undefined와 구분(three-state).
   * ⚠️ PHD ON 경로는 phdResidentialLandArea(preHousingDisclosure.landArea)가 담당하므로
   *    이 필드와 배타 — API 변환에서 usePreHousingDisclosure=false일 때만 주입.
   */
  residentialLandAreaOverride?: number;
}
```

- **store 필드명**: `mixedResidentialLandAreaOverride`(시점중립 — Finding #4: 양시점 적용이라 "Transfer" 명명 오해 방지). API 변환에서 엔진 `residentialLandAreaOverride`로 매핑.
- **phdResidentialLandArea와 별개** (Q5 확정): PHD 필드는 `preHousingDisclosure.landArea`로 3시점 공통 도달, 신규 필드는 `computeDerivedAreas` 경로. 배타.

### 3.2 `MixedUseDerivedAreas` (결과) — 변경 없음

기존 4필드(`residentialRatio`·`residentialLandArea`·`commercialLandArea`·`residentialFootprintArea`) 그대로. override는 `residentialLandArea` 값에만 반영(파생 구조 불변).

---

## 4. 알고리즘

### 4.1 leaf 모듈 `lib/tax-engine/mixed-use-derived-areas.ts` (신규)

번들 오염 회피(Q4): `computeDerivedAreas`를 무거운 `transfer-tax-mixed-use-helpers.ts`(NBL·PHD·fourpart·progressive import)에서 **순수 leaf로 추출**. UI(`use client`)·사이드바·bridge·엔진 helpers 5곳이 이 leaf만 import.

```ts
/** 소수점 2자리 반올림 (UI toFixed(2) 표시값과 엔진 일치) */
export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** 면적 파생 — override(주택 부수토지) 우선, 상가는 항상 전체−주택 (방식 B) */
export function computeDerivedAreas(input: {
  residentialFloorArea: number;
  nonResidentialFloorArea: number;
  buildingFootprintArea: number;
  totalLandArea: number;
  residentialLandAreaOverride?: number;   // 신규 (undefined=자동, 0=적법)
}): MixedUseDerivedAreas {
  const total = input.residentialFloorArea + input.nonResidentialFloorArea;
  if (total <= 0) {
    return { residentialRatio: 0, residentialLandArea: 0,
             commercialLandArea: round2(input.totalLandArea), residentialFootprintArea: 0 };
  }
  const residentialRatio = input.residentialFloorArea / total;
  const autoResidentialLand = round2(input.totalLandArea * residentialRatio);
  // ⚠️ ?? 로 override=0 보존 (|| 금지 — three-state)
  const residentialLandArea = input.residentialLandAreaOverride ?? autoResidentialLand;
  const commercialLandArea = round2(input.totalLandArea - residentialLandArea);  // 항상 합=전체
  return {
    residentialRatio,
    residentialLandArea,
    commercialLandArea,
    residentialFootprintArea: round2(input.buildingFootprintArea * residentialRatio),
  };
}
```

- **override 미제공 시 = 현행과 100% 동일** (회귀 0). C2 anchor.
- **⚠️ override 영향 범위 — 취득·양도 양시점 (실측 정정, Finding #1·#2)**: `transfer-tax-mixed-use.ts:76` `computeDerivedAreas(asset)` + `computeAcqDerivedAreas`(`helpers:70-74`)가 **용도변경 없으면 `derived` 그대로 반환**(`if(!partialUsageChange) return transferDerived`) → override(`residentialLandArea`)가 **취득·양도 양시점 자동 적용**. 같은 필지이므로 **물리적으로 정당**. 구체 영향:
  1. **주택 양도 토지 std** `transferLandStd = landPricePerSqm × derived.residentialLandArea` (`helpers:368`) → 양도가액 주택 토지/건물 안분(`:415`)
  2. **주택 취득 토지 std** `acqLandStd = landPricePerSqm × effectiveAcqDerived.residentialLandArea` (`helpers:404`) → 취득가액 안분(`:419`) + **개산공제 3%**(`:423`, 환산 모드)
  3. **상가 토지 std** `commercialLandArea = 전체−주택` → `helpers:118`·`:524-528`
  4. **NBL §168의12 배율초과** `MixedUseResultCard:326-340`·`types:245` (`excessArea`)
- **⚠️ 주택 std "총액"은 불변, 내부 분리는 변동 (Finding #2)**: 개별주택공시가격 **총액**(`transferHousingTotal`)은 override와 무관하나, override가 주택 토지/건물 **내부 분리**(`transferBuildingStd = housing − transferLandStd`, `helpers:371`)와 취득 개산공제를 바꿈. "주택 std 무관"은 오류였음.
- **UI 노출 칸 (D1, STEP12 확정)**: 엔진 축은 `residentialLandAreaOverride`(주택) **단일 불변**. UI가 (a)상가칸 editable→`residentialLandArea = round2(전체−상가입력)` 역산 저장 vs (b)주택칸 노출 중 무엇으로 노출할지는 STEP12 UI설계에서 위젯 보고 확정. 면적 섹션(①)은 취득·양도 공통 필지 면적이라 시점중립 배치가 양시점 적용과 정합.

### 4.2 연면적 파생 (UI 전용 — 엔진 밖)

`MixedUseAreaInputs`의 전용/공통 onChange 핸들러(엔진 아님):
```
exR = parseDecimal(residentialExclusiveArea) ?? 0
exC = parseDecimal(commercialExclusiveArea)  ?? 0
common = parseDecimal(commonArea) ?? 0
exTotal = exR + exC
if (exTotal > 0) {   // gate: 둘 다 빈값이면 write 안 함 (R1 legacy 보존)
  residentialFloorArea = round2(exR + common × exR/exTotal)
  nonResidentialFloorArea = round2(exTotal + common) − residentialFloorArea  // 잔액흡수
}
```
→ 같은 patch에 동시 write (mirror 정책, useEffect 금지). 엔진은 결과 연면적만 수신.

### 4.3 override 엔진 도달 경로 (배타 확정)

```
API 변환 (transfer-tax-api.ts):
  usePreHousingDisclosure === false:
     residentialLandAreaOverride = mixedResidentialLandAreaOverride.trim()==="" ? undefined : parseDecimal(...)
     → computeDerivedAreas 경로
  usePreHousingDisclosure === true:
     preHousingDisclosure.landArea = phdResidentialLandArea>0 ? ... : undefined  (기존 유지)
     → PHD 3시점 경로 (신규 override 미주입 — 배타)
```

---

## 5. 14 동기화 지점 (엔진측 ④⑫⑬⑭)

| # | 위치 | 변경 |
|---|---|---|
| ④ | `transfer-tax-api.ts` mixedUsePayload | `residentialLandAreaOverride` three-state 주입 (PHD OFF 게이트). 전용/공통 미전달 |
| ⑫ | `transfer-tax-schema-mixed-use.ts` | Zod `residentialLandAreaOverride: z.number().min(0).optional()` |
| ⑬ | `callTransferTaxAPI` body spread | override 1필드 (mirror-pattern: display fallback ↔ body 동일) |
| ⑭ | route handler 엔진 input 매핑 | override → `MixedUseAssetInput.residentialLandAreaOverride` (Date 무관) |

- ⑫⑬⑭는 TS 미감지 침묵 strip → grep 자가점검 필수.
- 전용/공통 3필드는 ④⑫⑬⑭ **미포함**(엔진 미전달). ①②③(store)만.

---

## 6. anchor 매핑 (Pre-Do)

| anchor | 케이스 | 검증 |
|---|---|---|
| `mixed-use-derived-areas.test.ts` | C2·C3·C6·C4·C5 | leaf `computeDerivedAreas` override·three-state(0보존)·합=전체·early return·상가0 |
| 연면적 파생 UI anchor(RTL) | C1 | 공통면적 전용비율 안분 정확값(72/48) — UI 전용 |
| `mixed-use-exclusive-common-baseline.anchor.test.ts` | R1 | legacy 페이로드(전용/공통·override 없음) 엔진 입력 불변 (회귀 0) |
| (엔진 통합) | C7 | override→**양시점** 파급: 상가 토지 std + 주택 취득 토지 std·개산공제(§163⑥) + 주택 양도 토지/건물 안분 + NBL 배율초과. 취득·양도 양쪽 결과값 검증 (Finding #1) |
| leaf 리팩터 무동작 | 기존 겸용 전체 | helpers→leaf 전환 후 기존 anchor 전량 통과 |

---

## 7. 리스크·주의

- **R-leaf**: `computeDerivedAreas`를 helpers에서 leaf로 옮길 때 helpers는 leaf import로 전환 — 기존 호출부(`transfer-tax-mixed-use-helpers.ts` 내부) 시그니처 유지. 기존 anchor 전량 통과로 무동작 검증.
- **R-round2**: 현재 `round2`는 helpers 내부 미export. leaf로 옮기며 export. bridge(`transfer-pre1990-phd-bridge.ts`)·UI가 자체 `toFixed(2)` 재구현 중이던 것도 leaf `round2`로 통일 ([[feedback_area_rounding_consistency]]).
- **R-PHD배타**: API 변환에서 `usePreHousingDisclosure` 게이트 누락 시 override와 phd `landArea` 동시 주입 → 이중. 게이트 anchor 필요.
- **R-acqDerived (Finding #1 정정)**: 이 기능 스코프(용도변경無)에선 `computeAcqDerivedAreas`가 `derived` 반환 → override가 **취득·양도 양시점 자동 적용**(정당, 같은 필지). ⚠️ 단 **용도변경(partialUsageChange) 케이스**는 `computeAcqDerivedAreas`가 별도 취득 면적(`acqResidentialArea` 등) 사용 → override는 양도 `derived`에만 반영, 취득은 용도변경 로직 유지. 스코프가 non-PHD·용도변경無라 실무상 이 분기 미도달이나, leaf에 override 넣을 때 acqDerived 경로가 override를 이중 적용하지 않는지 anchor 확인.
- **R-phd-toggle-stale (D2)**: PHD ON 전환 시 `mixedResidentialLandAreaOverride` store 값 잔존 → 엔진 미주입(API `usePreHousingDisclosure` 게이트)이라 **세액 무해**. UI는 PHD ON일 때 override 입력 숨김, OFF 복귀 시 재노출. clear 여부는 UX 판단(STEP12) — 세액엔 영향 없음.
