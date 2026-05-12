# 일반건물 토지/건물 취득원인 분리 — 엔진 설계

> 본 문서는 엔진 측 설계만 다룬다. UI는 `general-building-split-acquisition-cause.ui.design.md` 참조.
> 승인된 plan: `docs/00-pm/general-building-split-acquisition-cause.plan.md`

## Context

사례 32 작업 후 사용자 피드백 — 일반건물 자산종류에서 "취득원인" 단일 필드는 토지/건물의 다른 취득원인(예: 토지 매매 + 건물 신축)을 표현 불가. 예제 UI 패턴(토지/건물 각각 분리 입력)에 정렬한다.

기존 자산-수준 `acquisitionCause`/`acquisitionDate`는 **토지** 의미로 고정하고, 신규 자산-수준 `gbBuildingAcquisitionCause`/`gbBuildingAcquisitionDate` 두 필드로 **건물** 정보를 분리. `gbIsSelfBuilt`는 폐지하여 두 진실 원천 차단.

## ★ 케이스 인벤토리 (스코프 명시)

### 본 PR 스코프 (E-3 반영) — `acquisitionCause` 분리 + 보조 필드 미사용 케이스

| # | 시나리오 | 토지 acqCause | 건물 acqCause | 토지 취득일 의미 | 건물 취득일 | 가산세 | 보조 필드 | 테스트 파일 | 상태 |
|---|---|---|---|---|---|---|---|---|---|
| 1 | 사례 31 본 (토지+건물 동시 매매) | purchase | purchase | 매매 잔금일 1999-05-24 | 동일 | 미적용 | 불필요 | `general-building-case-31.test.ts` | ☑ 회귀 |
| 2 | 사례 32 본 (토지 매매 + 건물 신축) | purchase | newConstruction | 2008-03-17 | 사용승인일 2018-03-31 | 5% | 불필요 | `general-building-case-32.test.ts` | ☑ 회귀 |
| 3 | 토지 매매 + 건물 매매 (취득일 다름) | purchase | purchase | A | B (≠A) | 미적용 | 불필요 | `general-building-acq-cause-matrix.test.ts` | ☐ TODO |
| 5 | 토지 증여(일반) + 건물 매매 | gift | purchase | 증여일 | 매매 취득일 | 미적용 | (LTHD anchor 시 `donorAcqDate` 필요할 수 있음 — anchor 범위 결정) | 동일 | ☐ TODO |
| 8 | (validate) `general_building` + `gbBuildingAcquisitionCause` 미입력 → 차단 | * | undefined | * | undefined | 차단 | — | `transfer-tax-validate.test.ts` | ☐ TODO |

**범위 결정**: #3·#5·#8 신규 anchor (3개) + #1·#2 회귀 보존. **6개 anchor 약속**.

### 후속 PR 스코프 (보조 필드 매핑 필요)

| # | 시나리오 | 보조 필드 의존 | 별도 PR 사유 |
|---|---|---|---|
| 4-a | 토지 상속(일반) + 건물 신축 | `decedentAcquisitionDate` 매핑 | 보조 필드를 일반건물 토지 카드에 어떻게 전달할지 별도 설계 |
| 6 | 토지·건물 모두 상속 | 토지·건물 각자 `decedentAcquisitionDate` | 건물 카드의 상속 보조 필드 매핑 (현재 미존재) |
| 7-a | 토지 증여(일반) + 건물 신축 | `donorAcquisitionDate` (토지) | 토지 카드 증여 보조 필드 매핑 |
| 7-b | **토지 증여이월과세 + 건물 신축** | `carryoverTaxation` 객체 + `donorAcquisitionDate` | §97의2 + §114조의2 cross-cutting — 단독 PR로 anchor 견고화 |

**스코프 분리 이유**:
- 본 PR은 *acquisitionCause·acquisitionDate 두 필드 분리 + 마이그레이션*에 집중.
- 보조 필드(`decedentAcquisitionDate`/`donorAcquisitionDate`/`carryoverTaxation`)를 토지/건물 카드별로 매핑하는 것은 별도 설계 결정(자산-수준 단일 vs 토지/건물 분리). 본 plan에서 결론 미도출.
- `feedback_pdca_session_efficiency.md` 정책 — 한 PR 범위 명확화로 라운드 절약.

### 삭제된 케이스 (E-2 반영)

| 삭제 # | 사유 |
|---|---|
| 4-b (토지 상속이월과세) | §97의2 ①은 "증여받은 자산" 한정. 상속에는 이월과세 없음. enum에 `carryover_inheritance` 부재 → UI/API 표현 자체가 불가 → 가드 불필요 |

## 법령 근거

### 토지 취득시기 (영 §162① 분기)

| 토지 acquisitionCause | 취득시기 (LTHD 기산점) | 환산 분자(취득시 기준시가) 시점 |
|---|---|---|
| `purchase` | 매매계약일·잔금일·등기접수일 (§162①·②) | 동일 |
| `inheritance` | **상속개시일** (영 §162①5호) | 상속개시일 시점 기준시가 |
| `gift` | 증여일 (영 §162①5호) | 증여일 시점 기준시가 |
| `carryover_gift` (§97의2) | **증여자(피이월자) 취득일** | 증여자 취득일 시점 기준시가 |

`carryover_gift`는 **§97의2 ① 본문**상 배우자·직계존비속 간 증여로부터 5년(2023.1.1 이후 증여분 10년) 이내 양도하는 경우에만 적용. 상속에는 이월과세 없음.

### §114조의2 ① (감정가액·환산취득가액 적용 가산세)

> "거주자가 건물을 신축 또는 증축…하고 그 건물의 취득일 또는 증축일부터 5년 이내에 해당 건물을 양도하는 경우로서 §97①1호 나목에 따른 감정가액 또는 환산취득가액을 그 취득가액으로 하는 경우…해당 건물의 환산취득가액의 100분의 5에 해당하는 금액을 양도소득 결정세액에 더한다."

→ **건물 한정**, **건물 acquisitionCause === "newConstruction"** AND 보유 5년 이내 + 환산/감정 모드 시 발동.

### §97의2 ① (배우자·직계존비속 이월과세)

> "거주자가 양도일부터 소급하여 5년 이내에 그 배우자(양도 당시 혼인관계에 있는 자) 또는 직계존비속으로부터 증여받은 토지·건물 등의 자산을 양도하는 경우…그 취득가액은 그 배우자 등의 취득 당시 §97①1호에 따른 가액으로 한다."

→ **토지 acquisitionCause === "carryover_gift"** 시 토지 취득가액·취득시기 = 증여자 시점.

### 표기 통일

- `§97②`·`§114⑦`·`§176의2⑤` 표기 금지 (사례 32 메모 계승).
- 환산 산식 근거는 영 §176의2 ②. 가산세 모법은 §114조의2.

## 엔진 input 타입 변경

### `GeneralBuildingInput` 확장 (`lib/tax-engine/general-building-valuation.ts`)

```ts
export type GeneralBuildingInput = {
  // ... 기존 필드 그대로

  /** 건물 취득일 (영 §162①4호 빠른 날). isSelfBuilt=true 시 사용승인일. */
  buildingAcquisitionDate?: Date;

  /**
   * 신축취득 여부. 라우트 헬퍼에서 `buildingAcquisitionCause === "newConstruction"`로 도출.
   * 엔진 input에는 boolean으로 normalize 후 전달 (단일 진실 원천 유지).
   */
  isSelfBuilt?: boolean;

  // ── 신규 (E-1 반영: required) ──
  /**
   * 건물 취득원인. 토지의 acquisitionCause와 별개.
   * "newConstruction"일 때 isSelfBuilt=true로 도출.
   *
   * **required** — 라우트 헬퍼 진입 전 3중 차단 (Zod·normalizeAsset M-2·validate)으로 항상 정의됨 보장.
   * 엔진 단위 테스트에서도 명시 입력 필수 (silent fallback 없음).
   * Zod 스키마(⑫)와 일관된 진실 원천 유지.
   */
  buildingAcquisitionCause:
    | "purchase"
    | "inheritance"
    | "gift"
    | "carryover_gift"
    | "newConstruction";
};
```

> 엔진 자체는 `buildingAcquisitionCause`를 **참고용**으로만 보유 (현재는 isSelfBuilt 도출에 사용). 향후 건물 상속·증여 보조 필드 매핑(#4-a·#6·#7-b)이 필요하면 이 필드를 분기 키로 사용.

### `AssetCardForAggregate` 확장

```ts
export type AssetCardForAggregate = {
  // ... 기존 필드

  /** 건물 카드만 set. 라우트가 TransferTaxItemInput 매핑 시 사용. */
  isSelfBuilt?: boolean;
  buildingAcquisitionDate?: Date;

  // ── 신규 (optional — 토지 카드는 set 안 함) ──
  /**
   * 건물 카드에만 set. 토지 카드는 undefined.
   * `propertyType === "general_building_unit"` 카드에만 의미 있음.
   * (반면 GeneralBuildingInput.buildingAcquisitionCause는 input 단계에서 항상 required.)
   */
  buildingAcquisitionCause?:
    | "purchase"
    | "inheritance"
    | "gift"
    | "carryover_gift"
    | "newConstruction";
};
```

## 엔진 result 타입

변경 없음. 기존 `TransferTaxResult.penaltyTax` / `penaltyBase` 구조 그대로.

## 계산 알고리즘 (5단 파이프라인)

`buildGeneralBuildingAssetCards()` 본체 알고리즘은 변경 없음. **건물 카드 생성 시점**에만 acquisitionCause 분기 추가:

```ts
// 건물 카드 (line 418 부근)
assetCards.push({
  propertyId: "building",
  propertyLabel: "건물(3001)",
  propertyType: "general_building_unit",
  // ...
  acquisitionDate: input.buildingAcquisitionDate ?? input.acquisitionDate,
  // 신규
  isSelfBuilt: input.isSelfBuilt ?? false,
  buildingAcquisitionDate: input.buildingAcquisitionDate ?? input.acquisitionDate,
  buildingAcquisitionCause: input.buildingAcquisitionCause,  // ← 신규
});
```

토지 카드 3종(land·land_business·land_nbl)은 자체 `acquisitionCause = input.acquisitionCause` (토지) 사용 — 변경 없음.

## 라우트 헬퍼 매핑 (`general-building-route-helper.ts`)

### `dispatchGeneralBuilding()` 변경

```ts
export function dispatchGeneralBuilding(
  gbRaw: Record<string, unknown>,
  totalTransferPrice: number,
  transferDate: Date,
  acquisitionDate: Date,
  // ...
): GeneralBuildingRouteResult {
  // 기존: buildingAcquisitionDate 코어션
  const buildingAcqDate = toOptionalDate(gbRaw.buildingAcquisitionDate);

  // 신규: buildingAcquisitionCause는 Zod·normalizeAsset 통과 후 항상 정의됨
  //       fallback 없음 (silent fallback 금지 — 정책 #1)
  const buildingAcqCause = gbRaw.buildingAcquisitionCause as
    | "purchase" | "inheritance" | "gift" | "carryover_gift" | "newConstruction";
  const isSelfBuilt = buildingAcqCause === "newConstruction";

  const coercedGbRaw = {
    ...gbRaw,
    ...(buildingAcqDate ? { buildingAcquisitionDate: buildingAcqDate } : {}),
    isSelfBuilt,                    // 도출
    buildingAcquisitionCause: buildingAcqCause,
  };

  // ... 이하 기존 분기
}
```

### `buildProperties()` — 건물 카드 매핑

```ts
return cards.map((card) => {
  const isBuilding = card.propertyType === "general_building_unit";
  return {
    // ... 기존
    acquisitionCause: isBuilding
      ? card.buildingAcquisitionCause   // 건물 카드: 자체 acquisitionCause
      : (gbRaw.acquisitionCause as string), // 토지 카드: 토지 acquisitionCause
    isSelfBuilt: isBuilding && (card.isSelfBuilt ?? false),
    constructionDate: isBuilding && card.isSelfBuilt ? card.buildingAcquisitionDate : undefined,
    // 건물 상속·증여 보조 필드 매핑은 본 plan 범위 밖 (#4-a·#6·#7-b 후속 PR)
    decedentAcquisitionDate: undefined,
    donorAcquisitionDate: undefined,
  } as unknown as TransferTaxItemInput;
});
```

> #4-a (토지 상속) 케이스에서 건물은 `acquisitionCause: newConstruction`이므로 토지 분기와 무관하게 §114조의2 가산세 발동. 토지 카드는 `acquisitionCause: inheritance`로 LTHD 기산점이 상속개시일이 됨 (기존 단건 엔진 로직 그대로).

## Silent fallback / 자동 안분 후보 식별 (정책 #1)

### 제거된 fallback

```ts
// ❌ 삭제 (silent fallback 정책 위반)
const buildingAcqCause = coercedGbRaw.buildingAcquisitionCause ?? gbRaw.acquisitionCause;
```

### 유지되는 fallback (사례 31 호환 한정)

- `input.buildingAcquisitionDate ?? input.acquisitionDate` (건물 카드 acquisitionDate)
  - `gbBuildingAcquisitionCause === "newConstruction"` 경로는 validate ⑧이 미입력을 차단하므로 발동 불가
  - 사례 31 호환 경로(buildingAcqCause = purchase/inheritance/gift)에서만 발동 → 토지 취득일 fallback은 의도된 동작

### 3중 차단 보장 (`buildingAcquisitionCause`)

| 단계 | 차단 메커니즘 |
|---|---|
| Zod | `generalBuildingValuationSchema.buildingAcquisitionCause: z.enum([...])` (`.optional()` 없음) |
| normalizeAsset M-2 | sessionStorage legacy 데이터에서 미입력 시 `acquisitionCause` 명시 마이그레이션 |
| validate ⑧ | UI 입력 시 미선택 → 한국어 차단 메시지 |

→ 라우트 헬퍼 진입 시점에 항상 정의됨 보장.

## 테스트 약속

### 신규 파일: `__tests__/tax-engine/transfer-tax/general-building-acq-cause-matrix.test.ts`

본 PR 스코프 (E-3 반영) — **3개 신규 anchor**:

| describe | it (anchor 또는 회귀 가드) |
|---|---|
| 케이스 #3: 토지 매매 + 건물 매매 (취득일 다름) | `gbBuildingAcquisitionCause === "purchase"` + `buildingAcquisitionDate` 다름 → 건물 카드 LTHD 기산점이 토지와 분리됨 검증 |
| 케이스 #5: 토지 증여 + 건물 매매 | 토지 `acquisitionCause: "gift"`, 건물 `gbBuildingAcquisitionCause: "purchase"` → 가산세 미발동, 두 카드 acquisitionCause 분리 검증 |
| 케이스 #8: validate 차단 (`__tests__/calc/transfer-tax-validate.test.ts`) | `general_building` + `!gbBuildingAcquisitionCause` → 한국어 차단 메시지 |

**후속 PR로 미루는 케이스** (#4-a·#6·#7-a·#7-b):
- 보조 필드(`decedentAcquisitionDate`/`donorAcquisitionDate`/`carryoverTaxation`)를 토지·건물 카드별로 매핑하는 별도 설계 필요.
- 본 plan 범위 밖. 후속 plan에서 다음 결정 사항 정리:
  - 자산-수준 단일 보조 필드 vs 토지/건물 분리 보조 필드
  - `carryoverTaxation` 객체를 건물에도 적용할지 (이론상 §97의2는 토지에 한정되지 않음)

### 사례 31 회귀 (`general-building-case-31.test.ts`)

입력값 마이그레이션:
```diff
- isSelfBuilt: false,
+ buildingAcquisitionCause: "purchase",
+ buildingAcquisitionDate: new Date("1999-05-24"),  // 토지와 동일
```

anchor 38개 결과 동일 보장.

### 사례 32 회귀 (`general-building-case-32.test.ts`)

입력값 마이그레이션:
```diff
- isSelfBuilt: true,
+ buildingAcquisitionCause: "newConstruction",
  buildingAcquisitionDate: new Date("2018-03-31"),  // 그대로
```

anchor 30개 결과 동일 보장 (`isSelfBuilt`가 라우트 헬퍼에서 도출).

### validate 회귀 (`__tests__/calc/transfer-tax-validate.test.ts` 또는 동등)

- 케이스 #8 차단 메시지 검증
- 기존 `gbBuildingAcquisitionCause === "newConstruction"` + `!gbBuildingAcquisitionDate` 차단 (사례 32 가드 그대로)

## 800줄 분할 사전 점검 (E-4 결정)

| 파일 | 현재 | 예상 후 | 결정 |
|---|---|---|---|
| `general-building-valuation.ts` | 508 | ~525 | OK |
| `general-building-route-helper.ts` | ~365 | +20 (≈385) | OK |
| `transfer-tax-schema.ts` | 666 | +5 (≈671) | OK |
| `transfer-tax-api-helpers.ts` | ~534 | +5 | OK |
| `transfer-tax-validate.ts` | 768 | +20 (≈788) | **#0-B 채택 — 본 PR 내 +20 허용** |

### `transfer-tax-validate.ts` 결정 — #0-B (788줄 허용)

**이유**:
- 800줄 미만 (788 < 800)
- 분할 PR은 자체로 1주일+ 작업 — 본 PR 지연 위험 큼
- "임계 근접" 신호로 다음 작업자에게 충분히 경고
- 다음 작업이 800 초과 확실하면 그때 분할 (사후적 분할이 사전 분할보다 도메인 분리 명확성 ↑)

**대안 #0-A (분할 선행 PR) 폐기 사유**: validate 파일은 도메인 경계가 명확하지 않음 — 일반건물·겸용주택·다필지 등 cross-cutting 검증이 많아 분리 시 helper 공유 코드 발생 → 분할 효과 제한적. 임계 초과(800+) 시점에 강제 분할이 더 효율적.

## UI 통합 위임

- UI 측 명세는 `general-building-split-acquisition-cause.ui.design.md` 참조.
- 14개 동기화 지점 매트릭스는 plan에 정리됨.
- 핵심 인터페이스: `gbBuildingAcquisitionCause` (5개 enum), `gbBuildingAcquisitionDate` (string YYYY-MM-DD).

## 마이그레이션 스크립트 (요약, E-5 반영)

```ts
// lib/stores/calc-wizard-asset-factory.ts (또는 동등)

// E-5: 화이트리스트 — gbBuildingAcquisitionCause enum 명시
//      향후 acquisitionCause enum이 확장되어도 silent type 부정합 차단
const GB_BUILDING_ACQ_CAUSE_VALUES = [
  "purchase", "inheritance", "gift", "carryover_gift", "newConstruction",
] as const;
type GbBuildingAcqCause = typeof GB_BUILDING_ACQ_CAUSE_VALUES[number];

function isGbBuildingAcqCause(v: unknown): v is GbBuildingAcqCause {
  return typeof v === "string" && (GB_BUILDING_ACQ_CAUSE_VALUES as readonly string[]).includes(v);
}

function normalizeAsset(a: AssetForm): AssetForm {
  // M-1: gbIsSelfBuilt 폐지 — 1회 변환 후 필드 자체 삭제
  if ("gbIsSelfBuilt" in a) {
    const legacy = (a as { gbIsSelfBuilt?: boolean }).gbIsSelfBuilt;
    if (legacy === true && !a.gbBuildingAcquisitionCause) {
      a.gbBuildingAcquisitionCause = "newConstruction";
    }
    delete (a as { gbIsSelfBuilt?: boolean }).gbIsSelfBuilt;
  }

  // M-2: 사례 31 호환 — gbBuildingAcquisitionCause 미입력 시
  //      토지 acquisitionCause로 명시적 채워넣기 (silent fallback 금지)
  //      화이트리스트로 enum 부정합 방어 (E-5)
  if (
    a.assetKind === "general_building"
    && !a.gbBuildingAcquisitionCause
    && a.acquisitionCause
    && isGbBuildingAcqCause(a.acquisitionCause)
  ) {
    a.gbBuildingAcquisitionCause = a.acquisitionCause;
    if (!a.gbBuildingAcquisitionDate && a.acquisitionDate) {
      a.gbBuildingAcquisitionDate = a.acquisitionDate;
    }
  }
  // 화이트리스트 미통과 — UI에서 사용자가 명시 입력 필요 (validate ⑧ 차단)

  return a;
}
```

**E-5 효과**: 향후 `acquisitionCause` enum에 토지 전용 옵션(예: `expropriation` 공익수용) 추가 시 `gbBuildingAcquisitionCause`로 leak 차단. 사용자는 UI에서 명시 입력 강제됨.

## Status

| 단계 | 상태 |
|---|---|
| 1. PM/Plan | ✅ `docs/00-pm/general-building-split-acquisition-cause.plan.md` |
| 2. Design (engine) | ✅ 본 문서 |
| 2. Design (UI) | ☐ TODO |
| 3. Do (engine senior) | ☐ TODO |
| 3. Do (UI senior) | ☐ TODO |
| 4. Check | ☐ TODO |
| 5. Act | ☐ TODO |
