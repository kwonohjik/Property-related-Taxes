# §114조의2 Phase 2 — 증축(extension) + general_building 엔진 설계

> Plan 참조: `docs/00-pm/burdened-gift-114-2-penalty-phase2.plan.md`
> 작성일: 2026-06-21
> 선행: Phase 1 PR#316 (`1d65c74e`) — 신축 K-5 환산 5% 가산세, 증여세 탭
> 법령 검증: KoreanLaw MCP MST 285523 (소득세법 2026-04-21 시행) §114조의2 직접 확인
>            KoreanLaw MCP MST 286211 (소득세법 시행령 2026-05-22 시행) §176의2②2호 직접 확인
>
> **기반 현황(base `e75e8f22` 실측 반영)**: Phase 1 설계의 finalize 결선 D-2는 실제 커밋에서
> `effectiveInput.usedEstimatedAcquisition`을 OR-추가(`:315-316`)하는 방식으로 완료됨.
> 전체 흐름 재확인 후 Phase 2 갭만 정밀 설계.

---

## Context

Phase 1은 신축(`buildingType: "new"`)만 지원하고, 증축(`buildingType: "extension"`)과
`general_building` 자산 일부 경로를 SCOPE OUT 처리했다.

Phase 2에서 해소할 갭:

1. **Feature A — 증축 지원**: 증축부분 한정 base 분리산출(§114조의2① "증축한 부분에 한정") 미구현.
   현행 K-5 증축 발동 시 건물 **전체** 환산취득가에 5%를 부과 → 법문과 다른 과대 부과.
2. **Feature B — general_building 증축 케이스 33 게이트 보완**: `general-building-extension.ts`의
   건물2 카드에 `buildingType`/`extensionFloorArea` 미설정 → 85㎡ 게이트가 신축 분기로 처리됨.

---

## 법령 근거 (KoreanLaw MCP 직접 확인)

### 소득세법 §114조의2 (MST 285523, 2026-04-21 시행 확인)

```
① 거주자가 건물을 신축 또는 증축(증축의 경우 바닥면적 합계가 85제곱미터를 초과하는
  경우에 한정한다)하고 그 건물의 취득일 또는 증축일부터 5년 이내에 해당 건물을 양도하는
  경우로서 제97조제1항제1호나목에 따른 감정가액 또는 환산취득가액을 그 취득가액으로 하는
  경우에는 해당 건물의 감정가액(증축의 경우 증축한 부분에 한정한다) 또는 환산취득가액
  (증축의 경우 증축한 부분에 한정한다)의 100분의 5에 해당하는 금액을 제92조제3항제2호에
  따른 양도소득 결정세액에 더한다.
② 제1항은 제92조제3항제1호에 따른 양도소득 산출세액이 없는 경우에도 적용한다.
```

### 소득세법 시행령 §176조의2②2호 환산취득가 산식 (MST 286211, 2026-05-22 시행 확인)

```
토지·건물 및 부동산을 취득할 수 있는 권리의 경우:
  환산취득가 = 양도가액 × (취득당시 기준시가 ÷ 양도당시 기준시가)
```

### 법령 해석 확정표

| 항목 | 판정 | 근거 |
|---|---|---|
| 증축 base = **증축한 부분에 한정한** 환산취득가 | **확정** | §114조의2① 괄호 직접 명시 |
| 증축 게이트 = 바닥면적 합계 **85㎡ 초과** | **확정** | §114조의2① 괄호 직접 명시 |
| 증축 기산일 = **증축일** | **확정** | §114조의2① 본문 "취득일 또는 증축일" |
| 5년 이내 판정 = 취득일/증축일부터 양도일 | **확정** | §114조의2① 본문 |
| 신축 2018-01-01 게이트 | **실측 확인** | 현행 `rate-calc.ts:60` + 조심2019서3934 실증(Phase 1) |
| 증축 2020-01-01 게이트 | **🔍 부칙 연혁 API 미응답** — 현행 `rate-calc.ts:68` 값 신뢰 | 연혁 MST 조회 불가, 현행 구현값 유지 |
| 85㎡ = 증축 바닥면적 합계 (전체면적 아님) | **확정** | §114조의2① "증축의 경우 바닥면적 합계" |
| §176의2②2호 증축부분 환산취득가 상쇄 | **수학 검증 완료** — 아래 A-1 산식 참조 | 수치 검증 (하단) |

---

## ★ 케이스 인벤토리 (법령 본문·단서·각호 전수)

| # | 시나리오 | 탭 | 취득 방식 | 신축/증축 | §114조의2 발동 | penaltyBase | 상태 |
|---|---|---|---|---|---|---|---|
| C-A1 | 부담부증여 K-5 + 증축 + extensionFloorArea>85 + 5년 이내 (building/housing) | 양 탭(부담부) | K-5 환산 | 증축 | **발동** | 증축부분 환산취득가 × 5% | ☐ TODO |
| C-A1b | **양도세 단독(비-부담부)** K-5 + 증축 + extensionFloorArea>85 + 5년 이내 | 양도세 단독 | K-5 환산 | 증축 | **발동** (공용 헬퍼 적용 후) | 증축부분 환산취득가 × 5% | ☐ TODO (a 확정) |
| C-A2 | K-5 + 증축 + extensionFloorArea=85 (경계값) | 양 탭 | K-5 환산 | 증축 | **미발동** | — (`(85??0)<=85` 게이트) | ☐ TODO |
| C-A3 | K-5 + 증축 + extensionFloorArea>85 + 5년 초과 | 양 탭 | K-5 환산 | 증축 | **미발동** | — (5년 게이트) | ☐ TODO |
| C-A4 | K-5 + 증축 + extensionFloorArea>85 + transferDate<2020-01-01 | 양 탭 | K-5 환산 | 증축 | **미발동** | — (`2020-01-01` 게이트, 🔍 부칙 미검증) | ☐ TODO |
| C-A5 | 신축 K-5 회귀 (Phase 1 기존 동작) | 양 탭 | K-5 환산 | 신축 | **발동(회귀)** | 건물 전체 환산취득가 × 5% | ☐ 회귀 확인 |
| C-A6 | K-4 실지 + 증축 | 양 탭 | K-4 실지 | 증축 | **미발동** | — (§97①1호가목, §114조의2 비적용) | ☐ 회귀 확인 |
| C-A9 | salesCase 매매사례가액 모드(신축/증축) | 양도세 | salesCase | — | **미발동** | — (§114조의2① 나목 한정, 매매사례가액 제외. 부담부증여 경로 미노출 = 항상 0) | ☐ 회귀 확인 |
| C-B1 | general_building 사례 33 증축 건물2 + extensionFloorArea>85 + 5년 이내 | 양도세 | K-5 환산 | 증축 | **발동** | 건물2 환산취득가 × 5% | ☐ TODO |
| C-B2 | general_building 사례 33 증축 건물2 + extensionFloorArea≤85 | 양도세 | K-5 환산 | 증축 | **미발동** | — (85㎡ 게이트 — 현행 미설정 버그 fix) | ☐ TODO |
| C-B3 | general_building 사례 33 증축 건물2 + extensionAcquisitionCause=purchase | 양도세 | K-5 환산 | 증축(매수) | **미발동** | — (isSelfBuilt=false) | ☐ 회귀 확인 |
| C-B4 | general_building 신축(사례 31 환산, buildingAcquisitionCause=newConstruction) 회귀 | 양도세 | K-5 환산 | 신축 | **발동(회귀)** | 건물 환산취득가 × 5% | ☐ 회귀 확인 |
| C-B5 | general_building K-5 부담부증여 신축 회귀 (Phase 1 완료, C-6) | 양도세 | K-5 환산 | 신축 | **발동(회귀)** | 건물카드 estimatedBase × 5% | ☐ 회귀 확인 |
| C-B6 | general_building 사례 33 증축 건물2 + extensionFloorArea>85 + 부담부 K-5 | 양도세 | K-5 환산(부담부) | 증축 | **발동** | 건물2 환산취득가 × 5% | ☐ TODO |

> **증여세 탭 general_building 카테고리 신설(D-1 결정)**: Plan §5.B-3에서 "대규모·별도 PR"으로
> 분류. 본 설계에서는 범위 외 — 별도 설계 문서로 분리 예정. plan과 경계 일치.

> **C-A1 "양 탭" 정정 완료 (reconcile 2026-06-21)**: C-A1b를 별행으로 추가해 비-부담부 경로를
> 명시. 결정 (a) 확정에 따라 양 경로 모두 증축부분 base 분리. 공용 헬퍼(`calcExtensionEstimatedBase`)로
> 단일진실 보장. C-A9(salesCase)를 인벤토리에 추가(plan P2-9 대응).

---

## Feature A — 증축 엔진 (부담부증여 K-5 경로)

### A-1. 증축부분 환산취득가 산식 — 단일 필드 확정

**§176의2②2호 산식 + 기준시가 비율 안분 조합 수학 검증 (수치 실측 완료):**

```
증축부분 양도가액 = 채무안분 건물양도가 × (ExtTransferStd ÷ TotalBuildingTransferStd)
증축부분 환산취득가 = 증축부분 양도가액 × (ExtAcqStd ÷ ExtTransferStd)
                  = 채무안분 건물양도가 × (ExtAcqStd ÷ TotalBuildingTransferStd)
                                           ↑ ExtTransferStd 분자·분모에서 상쇄
```

`ExtTransferStd`(증축부분 양도기준시가)가 상쇄되므로 **신규 입력 필드는 1개만 필요**:

| 신규 필드 | 단위 | 의미 | 비고 |
|---|---|---|---|
| `extensionStdPriceAtAcquisition` | 원 | 증축완공(증축일)당시 증축부분 기준시가 | **신규 필수** |

`TotalBuildingTransferStd`(건물전체 양도기준시가)는 K-5 입력 기존 필드에서 획득.
`ExtTransferStd` 별도 입력 불필요 — **2필드 안 SCOPE OUT (Simplicity First)**.

**정수 연산:**
```
extensionEstimatedBase = floor(buildingTransferPrice × extensionStdPriceAtAcquisition / buildingStdPriceAtTransfer)
penaltyTax = floor(extensionEstimatedBase × 0.05)   // applyRate(base, 0.05)
```

`buildingTransferPrice` = 채무안분 후 건물 양도가 (`perAsset.building.transferPrice`)
`buildingStdPriceAtTransfer` = K-5 입력의 건물 양도기준시가 (`buildingStdPriceAtTransfer`)

**수치 예 (anchor P2-1 기반):**
```
채무액=150M, 증여평가=300M, 채무비율=0.5
valuationMode="sangjeungbeop_market", marketValueAtTransfer=200M  ← K-5(converted) 진입 + 양도가 안분 분모 C
토지양도기준시가=80M, 건물양도기준시가=120M(TotalBuildingTransferStd, 시가 안분 비율용)
채무안분 건물양도가 = 150M × (120M/200M) = 90M   (분모 C=marketValueAtTransfer=200M)
extensionStdPriceAtAcquisition = 36M
extensionEstimatedBase = floor(90M × 36M / 120M) = floor(27M) = 27,000,000
penaltyTax = floor(27,000,000 × 0.05) = 1,350,000
```

> ⚠️ **분모 정정 (실측 2026-06-21)**: K-5(`acquisitionMethod="converted"`) 분기는
> `valuationMode !== "sangjeungbeop_standard"`(즉 `sangjeungbeop_market`)일 때만 진입한다
> (`burdened-gift-apportionment.ts:289` standard 분기가 우선이며 그 경로는 `acquisitionMethodUsed=
> "standard_price"`로 converted 미도달). market 모드에서 양도가 안분 분모는
> `marketTotal = info.marketValueAtTransfer`(:264, :273-274)이므로, 건물양도가=90M이 성립하려면
> `marketValueAtTransfer=200M`을 명시해야 한다. (기존 K-5 테스트
> `gift-burdened-transfer-acquisition-method.test.ts:112,115`도 동일하게 market 모드 + 분모 C로 설정.)
비교: 건물 전체 base × 5% = floor(27M × 5%) ≠ 1,350,000 → 증축부분 한정이 전체보다 작음 ✓

### A-2. 증축부분 한정 base 산출 — 데이터 경로 통일 (실측 정정 2026-06-21)

> ⚠️ **현행 params에 buildingType·extensionStdPriceAtAcquisition 부재 (실측)**.
> `buildBurdenedGiftBreakdown`의 params 타입(`burdened-gift-apportionment.ts:183-194`)은
> `landStdPriceAtTransfer`·`buildingStdPriceAtTransfer`·`landStdPriceAtAcquisition`·
> `buildingStdPriceAtAcquisition`·`info`·`giftDate`·`capitalExpenditure`·`transferExpense`만
> 받으며 `buildingType`·`extensionStdPriceAtAcquisition`는 없다. 호출부
> `transfer-tax-burdened-gift-step.ts:31-42`도 이 두 값을 넘기지 않는다. 따라서 원안의
> `params.buildingType`/`params.extensionStdPriceAtAcquisition` 접근은 컴파일 불가이며 데이터에도
> 도달 못 한다. 아래 **안1(step.ts 내부 산출)을 채택**해 데이터가 실제 존재하는 곳에서 산출한다.

**채택안 (안1) — `runBurdenedGiftStep` 내부 산출** (`transfer-tax-burdened-gift-step.ts`):
breakdown 산출(:42) 직후, override 블록(:66-72) 직전에 추가. 여기서는
`rawInput.buildingType`·`rawInput.burdenedGiftInfo.buildingStdPriceAtTransfer`·
`transferBurdenedGiftBreakdown.perAsset.building.transferPrice`가 모두 접근 가능하다.
신규 입력 필드는 **`rawInput.extensionStdPriceAtAcquisition`(최상위 단일 경로)**에서 읽는다.
기존 §114조의2 형제 필드(`isSelfBuilt`·`buildingType`·`constructionDate`·`extensionFloorArea`)가
모두 `gift-burdened-transfer-api.ts:226-232`에서 gift body 최상위로 전송되고
`rawInput.buildingType`·`rawInput.extensionFloorArea`(최상위)로 읽히므로, 신규 1필드도
동일하게 최상위 단일 경로로 통일한다(burdenedGiftInfo 서브객체 경유 금지 — 형제 필드와
다른 경로로 분리 시 14지점 추적 비용 증가 및 strip 위험).

```ts
// 증축부분 한정 base (§114조의2 ①) — 신규 1필드 extensionStdPriceAtAcquisition (최상위)
const buildingTransferPrice = transferBurdenedGiftBreakdown.perAsset.building.transferPrice;
const extStdAtAcq = rawInput.extensionStdPriceAtAcquisition;   // ← 최상위 단일 경로
const buildingStdPriceAtTransfer = rawInput.burdenedGiftInfo.buildingStdPriceAtTransfer;
const extensionEstimatedBase: number | undefined =
  rawInput.buildingType === "extension" &&
  (extStdAtAcq ?? 0) > 0 &&
  buildingStdPriceAtTransfer > 0
    ? Math.floor(buildingTransferPrice * extStdAtAcq! / buildingStdPriceAtTransfer)
    : undefined;
// undefined = 신축이거나 extensionStdPriceAtAcquisition 미입력 → override에서 전체 base 사용
```

> (대안 안2: `buildBurdenedGiftBreakdown` params 타입에 `buildingType?`·
> `extensionStdPriceAtAcquisition?`를 추가하고 step.ts:31-42 호출부에서 rawInput으로부터 명시 전달
> 후 `perAsset.building.extensionEstimatedBase`로 반환. 채택 시 A-3·타입 정의 섹션도 안2 경로로 통일할 것.
> **A-2·A-3·타입 정의는 반드시 한 가지 데이터 경로로 일치시킨다.** 본 설계는 안1 기준.)

> ★ 신규 입력 필드는 **최상위 경로**로 통일하므로 `BurdenedGiftInfo` 타입에 추가하지 않는다.
> `BurdenedGiftInfo`(`lib/tax-engine/types/transfer-burdened-gift.types.ts:31`)는 채무안분
> 전용 타입이며, 증여 폼 입력 타입은 별개인 `BurdenedGiftTransferTaxInput`
> (`lib/tax-engine/types/inheritance-gift-estate.types.ts:687-707`)에 추가한다. 양도세 단독 경로는 아래 별도 갭 참조.

### A-3. transfer-tax-burdened-gift-step.ts step override 보강

**파일**: `lib/tax-engine/transfer-tax-burdened-gift-step.ts:54-72`

현행 `isK5SelfBuilt` 블록:
```ts
...(isK5SelfBuilt
  ? {
      acquisitionMethod: "estimated" as const,
      usedEstimatedAcquisition: true,
      estimatedBase: building.acquisitionPrice,   // ← 전체 base
    }
  : {}),
```

**증축 시 base 교체**:
```ts
...(isK5SelfBuilt
  ? {
      acquisitionMethod: "estimated" as const,
      usedEstimatedAcquisition: true,
      estimatedBase:
        rawInput.buildingType === "extension" && extensionEstimatedBase !== undefined
          ? extensionEstimatedBase           // 증축부분 한정 base
          : building.acquisitionPrice,       // 신축 = 건물 전체 base (기존 동작)
      buildingType: rawInput.buildingType,
      extensionFloorArea: rawInput.extensionFloorArea,
    }
  : {}),
```

`extensionEstimatedBase`는 A-2 안1에 따라 **같은 `runBurdenedGiftStep` 함수 내부**(breakdown 산출 직후)에서
계산한 지역 변수이므로 override 블록에서 직접 참조한다(별도 전달 불요).

**`buildingType`/`extensionFloorArea` 명시 전달 필수**: `calculateBuildingPenalty` (`:67-69`)의
85㎡ 게이트가 `input.extensionFloorArea`를 읽으므로 step override에서 `effectiveInput`에 포함해야 함.
현행 `rawInput` spread 파생이더라도 명시 전달이 안전. override 블록(`:66-72`)에
`buildingType: rawInput.buildingType`·`extensionFloorArea: rawInput.extensionFloorArea`를 추가한다.

### A-4. rate-calc 게이트 (변경 불요)

`transfer-tax-rate-calc.ts:51-87`의 `calculateBuildingPenalty` 함수는 변경 없음:
- `:67` `if (input.buildingType === "extension")` — 증축 분기 이미 존재
- `:69` `if ((input.extensionFloorArea ?? 0) <= 85) return null` — 85㎡ 게이트 이미 정확
- `:68` `if (transferDate < new Date("2020-01-01")) return null` — 증축 2020 게이트 이미 존재

A-3에서 `extensionFloorArea`를 step override에 포함하면 이 함수가 자동으로 정확히 동작함.

---

## Feature B — general_building 증축 케이스 33 게이트 보완

### B-1. 갭 확인 (실측)

`lib/tax-engine/general-building-extension.ts:343-360` 건물2 카드:
```ts
const building2IsSelfBuilt = ext.extensionAcquisitionCause === "newConstruction";
assetCards.push({
  ...
  isSelfBuilt: building2IsSelfBuilt,          // ✅ 설정됨
  buildingAcquisitionDate: ext.extensionDate, // ✅ 5년 기산점 설정됨
  buildingAcquisitionCause: ext.extensionAcquisitionCause,
  // ❌ buildingType: "extension" 미설정 → calculateBuildingPenalty :67에서 extension 분기 미진입
  // ❌ extensionFloorArea 미설정 → 85㎡ 게이트 미동작 (extension 분기 미진입이라 무해하지만 불완전)
});
```

**현상**: 건물2 `isSelfBuilt=true` + `buildingType` 미설정 → `calculateBuildingPenalty`에서
`buildingType !== "extension"` → 신축 분기 진입 → 2018-01-01 게이트(`:60`)만 통과하면
**85㎡ 미검사** + **2020-01-01 증축 게이트 미적용** → 모든 증축 면적이 5%를 부과받는 오류.

### B-2. 수정 방법

> ⚠️ **결선 3단계 모두 필요 (실측 정정 2026-06-21)**. 카드에 필드를 추가하는 것만으로는
> 85㎡ 게이트가 동작하지 않는다. ① `AssetCardForAggregate` 타입에 두 필드가 없어 카드 push가
> tsc 거부(실측: `general-building-valuation.ts:264-350`에 `buildingType`/`extensionFloorArea`
> 필드·인덱스 시그니처 부재), ② route helper `general-building-route-helper.ts:96-164`의
> card→item 매핑(`buildBurdenedGiftBreakdown` 아님 — `buildProperties`)이 `isSelfBuilt`·
> `constructionDate`·`acquisitionCause`만 명시 매핑하고 `buildingType`/`extensionFloorArea`는
> 매핑하지 않음 → penalty item의 `buildingType`이 undefined로 남아 `rate-calc.ts:67`
> `if (input.buildingType === "extension")`가 false → 신축 분기로 빠져 85㎡(:69)·2020-01-01(:68)
> 게이트가 영구 미적용. 따라서 아래 3단계를 모두 반영해야 anchor P2-7(미발동)이 통과한다.

**(1) 타입 추가** — `lib/tax-engine/general-building-valuation.ts:264-` `AssetCardForAggregate`:
```ts
/** 건물 카드만 set. §114조의2① 증축 분기(rate-calc.ts:67) 진입용. */
buildingType?: "new" | "extension";
/** 건물 카드만 set. §114조의2① 85㎡ 게이트(rate-calc.ts:69)용 — 증축부분 바닥면적 합계. */
extensionFloorArea?: number;
```

**(2) route helper card→item 매핑 추가** — `general-building-route-helper.ts:124-127` 인근
(`buildProperties` 내 `isSelfBuilt`/`constructionDate` 매핑 직후):
```ts
buildingType: isBuilding ? card.buildingType : undefined,
extensionFloorArea: isBuilding ? card.extensionFloorArea : undefined,
```

**(3) 건물2 카드 push** — `lib/tax-engine/general-building-extension.ts:344-361` push 블록:
```ts
assetCards.push({
  ...
  isSelfBuilt: building2IsSelfBuilt,
  buildingAcquisitionDate: ext.extensionDate,
  buildingAcquisitionCause: ext.extensionAcquisitionCause,
  buildingType: building2IsSelfBuilt ? "extension" : undefined,   // ← 신규 추가
  extensionFloorArea: building2IsSelfBuilt ? ext.extensionFloorArea85 : undefined, // ← 신규 (아래 참조)
});
```

**`ext.extensionFloorArea85` 신규 필드**: `GeneralBuildingInput["extensionInfo"]` 타입
(`lib/tax-engine/general-building-valuation.ts:150` 내 inline 타입)에
`extensionFloorArea85?: number` 추가.
현행 `extensionArea?: number`(`:154`, "정보용, 산식 미사용")와 **별도 필드**로 분리.
이름 혼동 방지: 기존 `extensionArea`는 연면적 정보용, 신규 `extensionFloorArea85`는 §114조의2 85㎡ 게이트 전용.

> 🔍 **확인 필요**: UI에서 `extensionArea`(연면적)와 `extensionFloorArea85`(85㎡ 게이트) 중
> 어느 것이 사용자에게 의미 있는 입력인지. 통상 85㎡ 게이트는 증축 부분 **바닥면적 합계**이며
> 연면적(건물 전체 면적)과 다를 수 있음. UI 시니어가 실측 후 필드 통합 여부 결정.

---

## 신규 입력 필드 — 타입 정의

### A. 양도세 `TransferTaxInput` 신규 필드 (기존 4필드에 추가)

```ts
// lib/tax-engine/types/transfer.types.ts:264 직후 추가
/**
 * 증축부분 취득(증축완공)당시 기준시가 총액 (원).
 * buildingType==="extension" + K-5 환산 시 §114조의2 증축부분 한정 base 산출용.
 * ★ extensionStdPriceAtTransfer(증축부분 양도기준시가)는 §176의2②2호 산식에서 상쇄되므로 입력 불필요.
 */
extensionStdPriceAtAcquisition?: number;
```

### B. 증여세 신규 필드 — 2타입 분리 기재 (실측 2026-06-21 정정)

> ★ **BurdenedGiftInfo** (`lib/tax-engine/types/transfer-burdened-gift.types.ts:31`) — 채무안분
> 전용 엔진 내부 타입. `extensionStdPriceAtAcquisition` **추가 없음** (최상위 단일 경로 채택).
>
> 증여 폼 입력 타입은 별개의 **`BurdenedGiftTransferTaxInput`**
> (`lib/tax-engine/types/inheritance-gift-estate.types.ts:687-707`)에 추가한다.

```ts
// lib/tax-engine/types/inheritance-gift-estate.types.ts:706 직후 추가
/**
 * 증축부분 취득(증축완공)당시 기준시가 총액 (원).
 * buildingType==="extension" + acquisitionMethod==="converted"(K-5) 시만 사용.
 * extensionStdPriceAtTransfer는 산식 상쇄로 불필요 — 1필드만 신규.
 * ★ 전송 경로: gift body 최상위 → route.ts rawInput 최상위 (burdenedGiftInfo 서브객체 아님).
 */
extensionStdPriceAtAcquisition?: number;
```

### C. `GeneralBuildingInput["extensionInfo"]` 신규 필드

```ts
// lib/tax-engine/general-building-valuation.ts:150 inline 타입 내 추가
/**
 * 증축부분 바닥면적 합계 (㎡) — §114조의2① 85㎡ 초과 게이트 전용.
 * extensionArea(연면적 정보용)와 별도. extensionAcquisitionCause==="newConstruction" 시만 유효.
 */
extensionFloorArea85?: number;
```

### D. `AssetForm` (양도세 폼 상태) 신규 필드

```ts
// lib/stores/calc-wizard-asset.ts (SelfBuiltSection props 옆)
extensionStdPriceAtAcquisition: string;   // CurrencyInput 값 — parseAmount 변환
```

---

## 엔진 result 타입 — ⑦ 라벨 분기 데이터 경로 (실측 정정 2026-06-21)

`TransferTaxResult.penaltyTax`·`penaltyBase`는 Phase 1에서 이미 존재.
증축 시 `penaltyBase` = 증축부분 환산취득가(건물전체보다 작음).

> ⚠️ **"buildingType echo로 라벨 분기"는 현행 데이터 흐름상 불가 (실측)**. `buildingType`은
> 입력 타입(`transfer.types.ts:260`)에만 있고 `TransferTaxResult`(:636-)에는 `penaltyTax`·
> `penaltyBase`·`penaltyDetail`만 있어 echo가 없다. 결과 카드 `SingleTransferResultCard`
> (`components/calc/results/BurdenedTransferTaxResultCard.tsx:59-65`)는 `result`만 prop으로 받고
> `input`은 받지 않으므로, result만으로 신축/증축을 구분해 라벨 분기할 수단이 없다.

**결정 확정: (b) 중립 라벨** — Simplicity First. 엔진 result 타입 변경 없음(echo 필드 추가 0).

- **(b) 중립 라벨 확정**: 라벨 표제를 법문 §114조의2①에 따라 **"감정가액 또는 환산취득가액 적용 가산세 (§114조의2①)"**로 통일. `penaltyBase`는 신축이면 건물전체, 증축이면 증축부분 환산취득가이므로 "환산취득가액" 단일 표기로 법문(§114조의2① "감정가액 또는 환산취득가액의 100분의 5")에 정합.
- 수정 대상: `BurdenedTransferTaxResultCard.tsx:139` "건물 환산취득가 × 5%" → "감정가액 또는 환산취득가액 적용 가산세 (§114조의2①)". `TransferTaxResultView.tsx:421` "환산가액적용가산세" → 동일 표현.
- (a) echo 필드 안(`penaltyBuildingType`) SCOPE OUT. 엔진 작업 0건.

---

## 계산 알고리즘 (단계별)

### Feature A: 부담부증여 K-5 증축 흐름

```
[엔진 진입 — transfer-tax.ts]
  rawInput: isSelfBuilt=true, buildingType="extension"
            extensionFloorArea=100(>85), extensionStdPriceAtAcquisition=36M
            burdenedGiftInfo.acquisitionMethod="converted"
            constructionDate=T(증축일)

  STEP 0.48 — burdened-gift-apportionment.ts K-5 분기
    ① K-5 환산: buildingAcquisitionPrice = buildingTransferPrice × buildingAcqStd / buildingTransferStd
    ② 증축부분 base 신규 산출:
       extensionEstimatedBase = floor(buildingTransferPrice × extensionStdPriceAtAcquisition / buildingStdPriceAtTransfer)

  STEP 0.48 — transfer-tax-burdened-gift-step.ts
    workingInput 추가:
      acquisitionMethod: "estimated"
      usedEstimatedAcquisition: true
      estimatedBase: extensionEstimatedBase   ← 증축부분 한정 base
      buildingType: "extension"
      extensionFloorArea: 100
      constructionDate: T

  STEP 10.5 — transfer-tax-finalize.ts (Phase 1 결선 기준으로 동작)
    isEstimatedMode = ... || effectiveInput.usedEstimatedAcquisition = true
    effectiveEstimatedBase = ... || extensionEstimatedBase = extensionEstimatedBase
    penaltyBase = isEstimatedMode ? effectiveEstimatedBase : 0 = extensionEstimatedBase
    calculateBuildingPenalty(effectiveInput, extensionEstimatedBase):
      isSelfBuilt=true ✓
      buildingType="extension" → extension 분기 진입:
        transferDate >= 2020-01-01 ✓
        (extensionFloorArea ?? 0) = 100 > 85 ✓
      constructionDate=T, addYears(T,5) >= transferDate ✓
      penalty = applyRate(extensionEstimatedBase, 0.05) = floor(extensionEstimatedBase × 0.05)
```

### Feature B: general_building 사례 33 증축 건물2 카드 흐름

```
[buildGeneralBuildingAssetCardsWithExtension 진입]
  ext.extensionAcquisitionCause = "newConstruction"
  ext.extensionFloorArea85 = 120 (>85)

  building2 카드 push:
    isSelfBuilt: true
    buildingType: "extension"         ← Phase 2 신규 추가
    extensionFloorArea: 120           ← Phase 2 신규 추가 (ext.extensionFloorArea85)
    buildingAcquisitionDate: ext.extensionDate  (5년 기산점, 기존)
    usedEstimatedAcquisition: true    (기존)
    estimatedBase: building2Acq       (기존 — 건물2 환산취득가 전체)

  [cardToItemInput → calculateTransferTax 단건]
  calculateBuildingPenalty(input, building2Acq):
    buildingType="extension" → extension 분기:
      extensionFloorArea=120 > 85 ✓
      transferDate >= 2020-01-01 ✓
    penaltyTax = floor(building2Acq × 0.05)
```

**주의**: 사례 33 증축의 `building2Acq`는 건물2(증축부분) 환산취득가이므로
§114조의2① "증축한 부분에 한정"한 base와 이미 일치함 — 별도 base 분리 불필요.

---

## 14개 동기화 지점

### Feature A — 증축 신규 필드 `extensionStdPriceAtAcquisition`

#### 양도세 측 (기존 4필드 외 1필드 추가)

| # | 지점 | 파일 | 변경 |
|---|---|---|---|
| ① | `AssetForm` 폼 상태 | `lib/stores/calc-wizard-asset.ts` | `extensionStdPriceAtAcquisition: string` 추가 |
| ② | 초기값 | `calc-wizard-asset-factory.ts`·`calc-wizard-store.ts` (2곳 모두) | `extensionStdPriceAtAcquisition: ''` |
| ③ | normalize | `lib/stores/calc-wizard-migration.ts` | 금액 필드(string) — Date 변환 불필요. `extensionStdPriceAtAcquisition: form.extensionStdPriceAtAcquisition ?? ''` |
| ④⑬ | API변환·body | `lib/calc/transfer-tax-api.ts:384-387` 옆 | `buildingType==="extension"` 게이트 시 `parseAmount(primary.extensionStdPriceAtAcquisition)` 전송 |
| ⑤ | UI 위젯 | `SelfBuiltSection.tsx` | extension 선택 시 "증축부분 취득시 기준시가" CurrencyInput 추가 |
| ⑥ | 사이드바 | 해당 없음 | — |
| ⑦ | 결과 카드 라벨 | `components/calc/results/TransferTaxResultView.tsx:421` + `BurdenedTransferTaxResultCard.tsx:139` | **(b) 중립 라벨 확정** — "감정가액 또는 환산취득가액 적용 가산세 (§114조의2①)"로 통일(신축·증축·감정 모두 포괄). echo 필드(`penaltyBuildingType`) 추가 없음 → **엔진 result 타입 변경 0**. (증여세 ⑦행·"엔진 result 타입" 절과 동일) |
| ⑧ | validate | `lib/calc/transfer-tax-validate.ts` | **실측: 현행 self-built 검증 전무**(`isSelfBuilt`/`buildingType`/`constructionDate`/`extension` grep 0건 — 주석 1줄뿐). 증여세 측 `gift-tax-form-shared.tsx:339` 패턴(`isSelfBuilt===true && !constructionDate` 차단) 대응을 신규 도입: 자산 루프 내 (a) `isSelfBuilt===true` 시 `constructionDate` 필수 차단, (b) `buildingType==="extension"` 시 `extensionFloorArea>0` + `extensionStdPriceAtAcquisition>0` 필수 차단. **삽입 함수·자산 루프 위치 명시 지정 필요** |
| ⑨ | Zod enum | `lib/api/transfer-tax-schema.ts:175-178` | `extensionStdPriceAtAcquisition: z.number().nonnegative().optional()` 추가 |
| ⑩ | Zod 컴패니언 | 동상 | 신규 enum 없음 — 0건 |
| ⑪ | acquisitionDate fallback | — | 0건 (신축 무관) |
| ⑫ | Zod 입력 객체 | `lib/api/transfer-tax-schema.ts` propertyBaseShape | ⑨와 동일 위치 — 1필드 추가 |
| ⑬ | body spread | `lib/calc/transfer-tax-api.ts` | ④와 동일 위치 — 명시 매핑 (침묵 strip 방지) |
| ⑭ | Route 매핑 | `app/api/calc/transfer/route.ts:271` 직후 | **명시 매핑 필수** — `extensionStdPriceAtAcquisition: data.extensionStdPriceAtAcquisition,` 추가. 실측: route handler가 §114조의2 필드를 필드별 명시 매핑(`:268-271` `buildingType: data.buildingType`·`extensionFloorArea: data.extensionFloorArea`)하며 spread/passthrough 아님 → 명시 추가 안 하면 침묵 strip. (`z.coerce.number().optional()`은 ⑫ Zod 문법이며 ⑭ route 매핑 코드가 아님) |

#### 증여세 측 (기존 4필드 외 1필드 추가)

| # | 지점 | 파일 | 변경 |
|---|---|---|---|
| ① | `BurdenedGiftTransferTaxInput` | `lib/tax-engine/types/inheritance-gift-estate.types.ts:706` (폼 입력 타입) | `extensionStdPriceAtAcquisition?: number` — **`BurdenedGiftInfo`(`transfer-burdened-gift.types.ts:31`) 추가 없음** (최상위 경로 채택) |
| ② | createEmpty / hasData | `BurdenedGiftTransferSection.tsx:56-` | `undefined` 초기값 + hasData OR 조건 추가 |
| ③ | normalize | `normalize-restored-form-dates.ts` | 금액 필드 — 정규화 불필요(Date 아님). 타입 spread 확인만 |
| ④⑬ | API변환·body | `lib/calc/gift-burdened-transfer-api.ts:219-234` **§114조의2 최상위 블록** | `buildingType==="extension"` 게이트 시 `extensionStdPriceAtAcquisition` **최상위 body에** 추가 전송(기존 4필드 동일 경로). `burdenedGiftInfoMarket` 서브객체 경유 금지. **명시 매핑 필수**(침묵 strip 위험) |
| ⑤ | UI 위젯 | `BurdenedGiftValuationModeSection.tsx` | extension RadioCard 활성화(`:310` `disabled:true` 제거) + `extensionFloorArea` DecimalInput + `extensionStdPriceAtAcquisition` CurrencyInput 추가 |
| ⑦ | 결과 카드 라벨 | `components/calc/results/BurdenedTransferTaxResultCard.tsx:139` | **(b) 중립 라벨 확정** — "감정가액 또는 환산취득가액 적용 가산세 (§114조의2①)"로 통일. echo 필드 추가 없음(엔진 result 타입 변경 0) |
| ⑧ | validate | `components/calc/gift-tax-form-shared.tsx:342` (TODO 위치) | `buildingType==="extension"` 시 `extensionFloorArea>0` + `extensionStdPriceAtAcquisition>0` 필수 차단 |
| ⑫ | Zod 입력 객체 | `lib/api/transfer-tax-schema.ts:175-178` **propertyBaseShape (최상위)** | ⑨⑫ 동일 위치 — 기존 4필드와 동일 schema 블록. `extensionStdPriceAtAcquisition: z.number().nonnegative().optional()` 추가 |
| ⑭ | Route 매핑 | `app/api/calc/transfer/route.ts:271` 직후 | **명시 매핑 1건** (0건 아님). 증여세 부담부 양도세도 동일 route(`POST /api/calc/transfer`, `gift-burdened-transfer-api.ts:281`)를 거치므로 양도세 ⑭와 동일하게 `extensionStdPriceAtAcquisition: data.extensionStdPriceAtAcquisition,` 명시 매핑 필요 |

**★ ⑬ grep 자가점검 (증여세)**:
```bash
grep -n "isSelfBuilt\|buildingType\|constructionDate\|extensionFloorArea\|extensionStdPriceAtAcquisition" \
  lib/calc/gift-burdened-transfer-api.ts
```
5필드 모두 존재해야 완료 (기존 4 + 신규 1). 모두 최상위 body 매핑 확인 (`burdenedGiftInfo` 내부 아님).

### Feature B — general_building 사례 33 `extensionFloorArea85`

> ⚠️ **경로 정정 + 결선 행 보강 (실측 2026-06-21)**. extensionInfo 변환은 `transfer-tax-api.ts`가
> 아니라 `transfer-tax-api-helpers.ts`의 `buildExtensionInfo`에 있고(실측: `transfer-tax-api.ts`에
> extensionInfo/extensionArea/extensionDate 매핑 grep 0건), extensionInfo는 route helper를 거쳐
> 엔진에 도달한다(`buildExtensionInfo:165` 주석 "route handler에서 toOptionalDate 변환(⑭)"). 또한
> 카드→item 매핑(route helper) 행이 누락되어 있었다. 아래 표에 5단 결선 전체를 enumerate한다.

| # | 지점 | 파일 | 변경 |
|---|---|---|---|
| 엔진 타입(extensionInfo) | `lib/tax-engine/general-building-valuation.ts:150` inline 타입 | `extensionFloorArea85?: number` 추가 |
| 엔진 타입(카드) | `lib/tax-engine/general-building-valuation.ts:264-` `AssetCardForAggregate` | `buildingType?: "new"\|"extension"`·`extensionFloorArea?: number` 추가 (B-2 (1)) |
| 건물2 카드 | `lib/tax-engine/general-building-extension.ts:344-361` | `buildingType: "extension"`, `extensionFloorArea: ext.extensionFloorArea85` 추가 (B-2 (3)) |
| **카드→item 매핑** | `app/api/calc/transfer/general-building-route-helper.ts:124-127` `buildProperties` | `buildingType: isBuilding ? card.buildingType : undefined`·`extensionFloorArea: isBuilding ? card.extensionFloorArea : undefined` 명시 매핑 추가 (B-2 (2) — **누락 시 침묵 strip**) |
| ④⑬ API | `lib/calc/transfer-tax-api-helpers.ts` `buildExtensionInfo`(:163-169 base 객체) | base 객체에 `...(extensionFloorArea85 ? { extensionFloorArea85 } : {})` 추가 (UI `gbExtensionFloorArea85` 입력 연결). `transfer-tax-api.ts`는 이 헬퍼 호출만 — 무변경 |
| ⑤ UI | `GeneralBuildingBlock.tsx` extensionInfo 섹션 | 증축부분 바닥면적(85㎡ 게이트용) 입력 위젯 추가 |
| ⑧ validate | `lib/calc/transfer-tax-validate.ts` general_building 증축 분기 | `extensionAcquisitionCause==="newConstruction"` 시 `extensionFloorArea85` 입력 안내 (차단 vs 경고 — 🔍 결정 필요) |
| ⑭ Route(extensionInfo) | `general-building-route-helper.ts` extensionInfo Zod 스키마/payload 디스패처 | `extensionFloorArea85` passthrough 결선 (plan §5.B-1·3.2 payload 3단계). **명시 추가 필요** |

**★ Feature B grep 자가점검**: 카드 push(general-building-extension.ts)뿐 아니라
`general-building-route-helper.ts`에 `buildingType`·`extensionFloorArea` 매핑이 존재하는지 grep으로 확인(⑤⑬ 결선).

---

## Silent fallback / 자동 안분 후보 식별

| 위치 | 위험 | 처리 |
|---|---|---|
| `extensionStdPriceAtAcquisition` 미입력 | `extensionEstimatedBase=undefined` → step override에서 전체 base(신축 취급)로 fallback | ⑧ validate 차단: `buildingType==="extension"` + `isSelfBuilt` 시 필수 |
| `extensionFloorArea` 미입력 | `(undefined??0)<=85` → 85㎡ 게이트 미통과 → penalty=0 침묵 | ⑧ validate 차단: `buildingType==="extension"` 시 필수 |
| 증축인데 `extensionStdPriceAtAcquisition=0` 명시 | `extensionEstimatedBase=0` → penalty=0 | ⑧ validate: `>0` 필수 |
| `ext.extensionFloorArea85` 미입력 (B경로) | 건물2 카드에 `extensionFloorArea: undefined` → `(undefined??0)<=85` → 85㎡ 게이트 미통과 | ⑤⑧: UI 안내 또는 차단 (🔍 결정 필요) |
| 자동 안분 fallback | §114조의2 증축부분 base를 연면적 비율로 자동 안분하는 로직 **절대 금지** | 미입력 = 검증 오류로 차단 (정책 `feedback_no_silent_apportion_fallback`) |

---

## Anchor 기대값

**파일**: `__tests__/tax-engine/transfer-tax/burdened-gift-114-2-penalty-phase2.test.ts` (신설)

### P2-1: 증축 K-5 부담부증여 + extensionFloorArea>85 + 5년 이내

```
입력:
  transferType="burdened_gift", propertyType="building"
  burdenedGiftInfo.valuationMode="sangjeungbeop_market"   ← K-5(converted) 진입 필수
  burdenedGiftInfo.acquisitionMethod="converted"
  burdenedGiftInfo.marketValueAtTransfer=200_000_000       ← 양도가 안분 분모 C (실측 정정)
  isSelfBuilt=true, buildingType="extension"
  extensionFloorArea=100 (>85)
  constructionDate=2022-01-01, transferDate=2025-06-01 (3년 이내)
  assumedDebt=150_000_000, giftValuation=300_000_000
  landStdPriceAtTransfer=80_000_000, buildingStdPriceAtTransfer=120_000_000
  landStdPriceAtAcquisition=60_000_000
  buildingStdPriceAtAcquisition=90_000_000 (전체 — K-5 전체 환산 기준)
  extensionStdPriceAtAcquisition=36_000_000 (증축부분)
  standardPrice=120_000_000 (item.standardPrice, K-5 분모)

기대:
  채무안분 건물양도가 = floor(150M × 120M / 200M) = 90,000,000   (분모 C=marketValueAtTransfer=200M)
  extensionEstimatedBase = floor(90M × 36M / 120M) = 27,000,000
  result.penaltyTax = floor(27,000,000 × 0.05) = 1,350,000
  result.penaltyBase = 27,000,000
  result.penaltyTax < (건물전체 base × 5%) = floor(27M × 5%) 확인 (단, 건물전체 K-5와 별도 확인)
```

> ⚠️ **P2-2~P2-5·P2-8 공통**: 모두 K-5(converted) 경로이므로 위 P2-1과 동일하게
> `valuationMode:"sangjeungbeop_market"` + `marketValueAtTransfer:200_000_000`을 명시해야
> converted 분기에 진입하고 분모 C=200M이 확보된다. (P2-8은 acquisitionMethod="actual"로 변경하되
> valuationMode/marketValueAtTransfer는 동일 유지 — K-4 실지도 market 모드 분기에서만 actual 도달.)

### P2-2: extensionFloorArea = 85 (경계값 — 미발동)

```
입력: P2-1 동일, extensionFloorArea=85
기대: result.penaltyTax === 0  (85 <= 85 → 게이트 미통과)
```

### P2-3: 증축 5년 초과 (미발동)

```
입력: P2-1 동일, constructionDate=2019-01-01, transferDate=2025-06-01 (6.4년)
기대: result.penaltyTax === 0
```

### P2-4: 증축 transferDate < 2020-01-01 (시행일 게이트 미발동)

```
입력: P2-1 동일, constructionDate=2017-01-01, transferDate=2019-12-31 (2년 이내이나 시행 전)
기대: result.penaltyTax === 0  (transferDate < 2020-01-01)
```

### P2-5: 신축 회귀 (Phase 1 불변)

```
입력: P2-1 동일, buildingType="new" (extensionFloorArea/extensionStdPriceAtAcquisition 없음)
기대: result.penaltyTax === Phase 1 기댓값 (건물전체 환산취득가 × 5%)
```

### P2-6: general_building 사례 33 증축 건물2 + extensionFloorArea>85

```
입력: propertyType="general_building", gbHasExtension=true
      extensionAcquisitionCause="newConstruction"
      extensionFloorArea85=120 (>85), extensionDate=2022-01-01
      transferDate=2025-06-01
기대: aggregate result.penaltyTax > 0
      penaltyBase = 건물2(증축부분) 환산취득가 (전체 아님 — 이미 건물2만 범위)
```

### P2-7: general_building 사례 33 증축 건물2 + extensionFloorArea=80 (미발동)

```
입력: P2-6 동일, extensionFloorArea85=80
기대: result.penaltyTax === 0  (Phase 2 fix 이후 85㎡ 게이트 정상 차단)
      (fix 전: buildingType 미설정 → 신축 취급 → 85㎡ 게이트 미적용 → penalty 오발동)
```

> ⚠️ **P2-7 통과 전제 = B-2 결선 3단계 모두 반영 (실측 2026-06-21)**. 건물2 카드 push에 두 필드를
> 추가하는 것만으로는 부족하다. ① `AssetCardForAggregate` 타입에 `buildingType`/`extensionFloorArea`
> 추가, ② route helper `general-building-route-helper.ts:124-127` card→item 매핑에 두 필드 명시 전달이
> 함께 되어야 penalty item의 `buildingType="extension"`이 rate-calc.ts:67에 도달해 85㎡ 게이트가
> 동작한다. ②가 빠지면 P2-7은 fix 후에도 penalty 오발동(0 미달)으로 여전히 실패한다. (B-2 참조.)

### P2-8: K-4 실지 증축 (미발동)

```
입력: P2-1 동일, burdenedGiftInfo.acquisitionMethod="actual" (K-4)
기대: result.penaltyTax === 0  (§97①1호가목 실지, §114조의2 비적용)
```

---

## 법령 상수 (`lib/tax-engine/legal-codes/transfer.ts`)

신규 상수 추가 SCOPE OUT (Simplicity First).
기존 `TRANSFER.BUILDING_PENALTY` (= `"소득세법 §114조의2"`, `:250`) 재사용.
증축부분 한정 단서는 결과 카드 라벨에 한국어로 풀어 표시.

---

## 테스트 약속

### 단위 엔진 테스트

**파일**: `__tests__/tax-engine/transfer-tax/burdened-gift-114-2-penalty-phase2.test.ts` (신설)

- P2-1~P2-8 anchor: 원단위 `toBe()` 고정 (`feedback_pdf_example_test_anchoring`)
- C-A1~C-A6, C-B1~C-B6 케이스 매트릭스 전수
- `calculateBuildingPenalty` 직접 호출: buildingType="extension" 85㎡ 경계값
- Phase 1 회귀: P2-5(신축)·P2-8(K-4) 기존 기댓값 불변 확인

### E2E

**증여세 탭**: `e2e/gift-burdened-transfer.spec.ts` P2 시리즈
- 증축 RadioCard 활성화(disabled:true 제거 확인)
- extensionFloorArea·extensionStdPriceAtAcquisition 입력
- body 검증: `buildingType:"extension"·extensionFloorArea·extensionStdPriceAtAcquisition`
- RadioCardGroup testId 셀렉터 (`bg-building-type-extension`)

**양도세 탭**: SelfBuiltSection 증축 경로 E2E (신규 spec)
- extensionFloorArea>85 + extensionStdPriceAtAcquisition → penaltyTax > 0 row 표시

---

## 리스크·함정

| 리스크 | 관련 정책 | 대응 |
|---|---|---|
| `extensionStdPriceAtAcquisition` 미입력 → 전체 base fallback | `feedback_no_silent_apportion_fallback` | ⑧ validate 차단: extension + isSelfBuilt 시 필수. 자동 fallback 절대 금지 |
| 건물2 카드 `buildingType` 미설정 → 신축 취급(85㎡ 미검사) | Phase 1 SCOPE OUT 잔재 | B-2 fix로 `buildingType:"extension"` + `extensionFloorArea:ext.extensionFloorArea85` 추가 |
| `extensionFloorArea85` vs `extensionArea` 명칭 혼동 | Simplicity First | 별도 필드 분리 + 주석 명시. UI 설계에서 사용자 입력 레이블 구분 |
| ⑫⑬⑭ 침묵 strip (`extensionStdPriceAtAcquisition` 누락) | `feedback_explicit_prop_mapping_strip` | ⑬ grep 자가점검(위 명시). 명시 매핑 필수 |
| Step override `extensionFloorArea` 미전달 → 85㎡ 게이트 미적용 | A-3 설계 | step override 블록에 `buildingType·extensionFloorArea` 명시 추가 |
| 증축부분 환산취득가 `ExtTransferStd` 상쇄 불확실 | 수학 검증 완료 | 상쇄 확인(수치 실측)·anchor P2-1 고정 |
| 부칙 시행일(2020-01-01) 미검증 | 연혁 API 미응답 | 현행 구현 게이트값 유지. "확인 필요" 명시. 실무 영향 없음(이미 구현된 게이트) |
| useEffect store 미러링 | `feedback_useeffect_store_mirror_forbidden` | extensionFloorArea ON 시 extensionStdPriceAtAcquisition 초기화는 onChange만 |
| 자동 안분 fallback | `feedback_no_silent_apportion_fallback` | 빈 값 = 검증 오류 차단. 면적 비율 자동 안분 절대 금지 |

---

## 작업 순서 (Do — 시퀀셜)

```
1. Pre-Do anchor P2-7 작성 → 실행 → 현행 penalty 오발동(extension 건물2 신축 취급) 실패 확보
   verify: P2-7에서 penaltyTax>0 (fix 전 오발동 실증)
2. [B] 결선 3단계: ① AssetCardForAggregate 타입에 buildingType·extensionFloorArea 추가
   ② general-building-route-helper.ts:124-127 card→item 매핑에 두 필드 명시 전달
   ③ general-building-extension.ts 건물2 카드에 buildingType:"extension" + extensionFloorArea 추가
   → verify: P2-7 통과(미발동), P2-6 통과(발동), C-B3·B4·B5 회귀 확인. ②누락 시 P2-7 여전히 오발동
3. Pre-Do anchor P2-1 작성 → 실행 → 현행 전체 base(과대) 실패 확보
   verify: penaltyTax = 건물전체 × 5% ≠ 1,350,000 (현행 실증)
4. [A] burdened-gift-apportionment.ts K-5 분기에 extensionEstimatedBase 산출 로직 추가
5. [A] transfer-tax-burdened-gift-step.ts override에 extensionEstimatedBase·buildingType·extensionFloorArea 전달
   → verify: P2-1 통과(1,350,000), P2-2~P2-5 통과
6. [A] 양도세 14지점: ①AssetForm·②initial·③normalize·④⑬API·⑤SelfBuiltSection·⑧validate·⑨⑫Zod
   → verify: tsc 0 + 양도세 E2E spec
7. [A] 증여세 14지점: ①타입·②hasData·④⑬API·⑤UI(disabled:true 제거·필드 추가)·⑧validate
   → verify: tsc 0 + 증여세 E2E spec
8. ⑦ 결과 카드 라벨 분기 (양 탭 공용 — UI 시니어 담당)
9. npm test 전체 회귀 0 + tsc 0 + code-review High/Med 0
   → verify: 게이트 통과
```

**PR 분할**: PR-B(general_building 증축 케이스 33 게이트 fix) → PR-A(증축 K-5 신규 base + 14지점).
PR-B가 더 작고 회귀 위험이 없어 먼저 머지 권장.

---

## SCOPE OUT

- **증여세 탭 general_building 카테고리 신설(D-1)**: 대규모(14지점 + enum 신설 + UI variant) → 별도 PR·설계 문서
- **`ExtTransferStd`(증축부분 양도기준시가) 별도 입력 필드**: 수학 상쇄 확인으로 불필요 (1필드 방식 확정)
- **부칙 시행일 2020-01-01 공식 검증**: 연혁 API 미응답. 현행 `rate-calc.ts:68` 게이트값 유지.
  🔍 부칙 시행일 미검증·확인 필요 — KoreanLaw eflaw(시행일자별) 재조회를 공통 후속과제로 등록.
  현행 구현값이 부칙 정합임을 증명 못 함 명시. 단정 금지.
- **감정가액(appraisal) 증축 경로**: 증여세 부담부증여에 appraisal enum 부재. 양도세 탭은 별도 검토 대상이나 현 Phase 외
- **`extensionFloorArea85`(85㎡ 게이트 전용 필드) vs `extensionArea`(연면적 정보용, 기존 `extensionInfo.extensionArea`)**:
  양 문서(plan·engine)가 동일 명칭 `extensionFloorArea85`를 사용한다(기존 `extensionArea`와 별도 필드).
  `extensionArea`(calc-wizard-asset.ts에서 "정보용, 산식 미사용")와 명시 구분.
  UI 입력 의미 미결(연면적 vs 바닥면적 일치 여부)은 양 문서에 동일하게 "🔍 UI 시니어 확정" 표기.

### 확정 결정 (2026-06-21 reconcile)

- **양도세 단독(비-부담부) 자가건축 증축 K-5**: **(a) 함께 수정 확정** — `transfer-tax.ts` +
  `transfer-tax-helpers.ts` `calcTransferGain`의 estimatedBase 산출 부근에 증축부분 한정 base
  분리 로직을 추가. 부담부(`burdened-gift-apportionment.ts`)와 통상 경로가 동일한 증축부분 환산취득가
  산식을 **공용 헬퍼**(single-source-engine-helper 정책)로 추출하여 양 경로에서 호출.
  dual-truth 금지. plan A-6의 양도세 14지점은 부담부·비-부담부 양쪽 경로를 포함.
  비-부담부 증축 anchor 케이스(C-A1 non-burdened) 신규 추가. (위 C-A1 "양 탭" 정정 참조)
- **⑦ 결과 카드 라벨 분기**: **(b) 중립 라벨 확정** — "감정가액 또는 환산취득가액 적용 가산세
  (§114조의2①)". echo 필드(`penaltyBuildingType`) 추가 없음. 엔진 result 타입 변경 0.
  (위 "엔진 result 타입" 절 참조)
- **Feature B 위젯 게이트**: 🔍 결정 필요 — (a) 부담부 확장 vs (b) 비-부담부 case 33. 본 reconcile 범위 밖.
- **`gbExtensionFloorArea85` 미입력 차단 vs 경고**: 🔍 결정 필요. Do 전 확정.
- **부칙 시행일 2020-01-01 검증**: 🔍 현행 `rate-calc.ts:68` 게이트값 유지. 연혁 API 미응답으로
  부칙 정합 미증명 — KoreanLaw eflaw(시행일자별) 재조회를 공통 후속과제로 등록.

---

## UI 통합 위임

- **엔진 시니어**: ①②③④⑧(증여·양도) + A-2(apportionment) + A-3(step.ts) + B-2(extension.ts) 카드 fix
- **UI 시니어(`inheritance-gift-tax-ui-senior`)**: 증여세 ⑤ UI(extension RadioCard 활성화 + 신규 CurrencyInput) + ⑦ 결과 카드 라벨 분기
- **UI 시니어(`transfer-tax-ui-senior`)**: 양도세 ⑤ SelfBuiltSection 신규 CurrencyInput + ⑦ 결과 카드 라벨 분기 (양 탭 공용)

---

## ★ 자가 점검 체크리스트 (완료 보고 전)

- [ ] P2-7 pre-anchor: 현행 오발동 실증 (fix 전 penalty>0 → fix 후 0)
- [ ] P2-1 pre-anchor: 현행 전체 base 실증 → fix 후 1,350,000
- [ ] `general-building-extension.ts` 건물2 카드 `buildingType:"extension"` + `extensionFloorArea` 추가
- [ ] `AssetCardForAggregate` 타입(general-building-valuation.ts:264-)에 `buildingType`·`extensionFloorArea` 추가 (없으면 카드 push tsc 거부)
- [ ] **route helper grep**: `general-building-route-helper.ts` card→item 매핑(:124-127)에 `buildingType`·`extensionFloorArea` 명시 전달 존재 확인 (없으면 P2-7 fix 후에도 오발동)
- [ ] `burdened-gift-apportionment.ts` K-5 분기에 `extensionEstimatedBase` 산출 로직
- [ ] `transfer-tax-burdened-gift-step.ts` override에 `extensionEstimatedBase·buildingType·extensionFloorArea` 명시
- [ ] 증여 ⑬ grep: `gift-burdened-transfer-api.ts`에 5필드 존재 확인 (`extensionStdPriceAtAcquisition` 포함)
- [ ] 양도 ⑫⑬⑭ grep: Zod·body·route 3곳 `extensionStdPriceAtAcquisition` 존재 확인
- [ ] ⑧ validate: `buildingType==="extension"` 시 `extensionFloorArea>0` + `extensionStdPriceAtAcquisition>0` 양 탭 차단
- [ ] 자동 안분 fallback 없음 확인 (`feedback_no_silent_apportion_fallback`)
- [ ] `useEffect → store` 미러링 없음 확인
- [ ] `npx tsc --noEmit` 0건
- [ ] `npx vitest run __tests__/tax-engine/transfer-tax/` 통과
- [ ] P2-1~P2-8 anchor 전수 원단위 toBe() 통과 (파일: `__tests__/tax-engine/transfer-tax/burdened-gift-114-2-penalty-phase2.test.ts`)
- [ ] 3대 핵심 정책(useEffect 금지·자동 fallback 금지·validation 8번째 동기화) 위반 없음
