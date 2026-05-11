# 양도소득세 사례 31 — 일반건물(토지+건물 일괄) 환산취득가 UI 디자인

**작성일**: 2026-05-08
**작성자**: transfer-tax-ui-senior
**계획서**: `docs/00-pm/case-31-general-building-conversion.plan.md`
**PDCA 단계**: Design
**선행 완료**: 사례 29 (`commercial-building-valuation.ts`, propertyType "commercial_building", cb* 12 필드)

---

## 1. 사용자 시나리오 (9단계)

사례 31 (예제 사례 31): 서울 동작구 사당동 132-10 일반건물(근린생활시설, 철근콘크리트 2층). 1999-05-24 취득, 실거래가 확인 불가 → 환산취득가 적용. 2023-02-19 925,000,000원 일괄 양도.

| 단계 | 사용자 행동 | UI 반응 |
|---|---|---|
| 1 | Step1 → "자산 추가" → 자산종류 **"일반건물(토지+건물 일괄)"** 선택 | `assetKind: "general_building"` 설정. 기본 취득원인 라디오(매매/상속/증여) 표시. |
| 2 | 취득원인 **"매매"** 선택 | `acquisitionCause: "purchase"` |
| 3 | **"환산취득가 사용"** ToggleCard ON | `gbUseEstimatedAcquisition: true`. 일반건물 환산취득가 입력 섹션(GeneralBuildingBlock) 펼침. |
| 4 | 면적 입력: 토지면적 85㎡ / 건물 연면적 180.96㎡ / 층수 2 | DecimalInput × 2 + 정수 입력(층수). NBL 바닥면적 자동 추정(연면적 ÷ 층수 = 90.48㎡). |
| 5 | 양도시 기준시가 입력: 공시지가(원/㎡) 10,830,000 [LandPriceLookupField, 2022년] / 건물기준시가 총액 20,629,440 [CurrencyInput] | emerald 카드 섹션. 공시지가 조회 연도 2022(양도일 전년). |
| 6 | 취득시 기준시가 입력: 공시지가(원/㎡) 2,800,000 [LandPriceLookupField, 1998년] / 건물기준시가 총액 28,144,700 [CurrencyInput] | amber 카드 섹션. 공시지가 조회 연도 1998(취득일 전년). |
| 7 | 양도가액 925,000,000 입력, 취득일 1999-05-24, 양도일 2023-02-19 입력 | 기존 필드 경로. |
| 8 | "계산" 실행 | API 호출. request body에 `generalBuildingValuation` 서브객체 포함. |
| 9 | 결과 화면: 토지·건물 안분 표 + 환산취득가 산식 + 개산공제 + 1차 통산 결과 표시 | 합계 양도소득금액 **456,343,181** 확인. |

---

## 2. 케이스 인벤토리 표

| # | 케이스 | assetKind | 환산 여부 | 자산 수 | UI 분기 | 본 작업 |
|---|---|---|---|---|---|---|
| G-01 ★ | 일반건물·일괄·환산 (사례 31) | `general_building` | true | 2(토지+건물 자동 분리) | 본 사례 31 | ★ 이번 구현 |
| G-02 | 일반건물·일괄·실가 | `general_building` | false | 2 | 취득가액 직접 입력 | 후속 PDCA |
| G-03 | 일반건물·각각 별도 양도 | `general_building` | — | 1(토지 또는 건물만) | 단독 자산 처리 | 후속 PDCA |

> G-01이 Do 단계 primary anchor. G-02·G-03은 후속 PDCA 범위로 명기 — 본 작업 DoD 외.

---

## 3. 폼 상태 타입 변경 명세 (① 폼 상태 타입)

### 3.1 AssetForm.assetKind 확장

**위치**: `lib/stores/calc-wizard-asset.ts` → `AssetForm.assetKind` 타입

```typescript
// 현재 (사례 29 추가 후):
assetKind: "housing" | "land" | "building" | "right_to_move_in" | "presale_right" | "commercial_building";

// 사례 31 추가:
assetKind: "housing" | "land" | "building" | "right_to_move_in" | "presale_right" | "commercial_building" | "general_building";
```

**위치 grep 확인**: `lib/stores/calc-wizard-asset.ts` line 178

### 3.2 AssetForm 신규 gb* 필드 (자산-수준)

**위치**: `lib/stores/calc-wizard-asset.ts` → `AssetForm` 인터페이스, cb* 필드 블록 아래에 추가

```typescript
// ── 일반건물(토지+건물 일괄) 환산취득가 (사례 31, 소득세법 시행령 §176의2④, §163⑥) ──
/**
 * 일반건물 환산취득가 사용 여부.
 * assetKind === "general_building" + true 시 GeneralBuildingBlock 노출 + generalBuildingValuation 서브객체 생성.
 */
gbUseEstimatedAcquisition: boolean;

/**
 * 양도시 토지 공시지가 (원/㎡).
 * LandPriceLookupField로 입력. 양도일 전년 기준연도 기준시가.
 * 안분 분모의 토지 기준시가 산정: gbTransferLandPricePerSqm × gbLandArea.
 */
gbTransferLandPricePerSqm: string;

/**
 * 양도시 건물기준시가 총액 (원).
 * 국세청 기준시가 조회 — 건물 전체 기준시가 합계액.
 * 안분 분모의 건물 기준시가 = 이 값 그대로.
 * 사례 31: 20,629,440 (BigInt 정밀 산출값)
 */
gbTransferBuildingValue: string;

/**
 * 취득시 토지 공시지가 (원/㎡).
 * LandPriceLookupField로 입력. 취득일 전년 기준연도 기준시가.
 * 환산 비율 분자 토지 성분: gbAcqLandPricePerSqm × gbLandArea.
 * 사례 31: 2,800,000 (1998년)
 */
gbAcqLandPricePerSqm: string;

/**
 * 취득시 건물기준시가 총액 (원).
 * 국세청 기준시가 조회 — 취득시점 건물 기준시가 합계액.
 * 환산 비율 분자 건물 성분 + 개산공제 기준액.
 * 사례 31: 28,144,700 (역산: 844,341 ÷ 0.03)
 */
gbAcqBuildingValue: string;

/**
 * 토지 부수면적 (㎡).
 * 안분·환산·개산공제·NBL 판정에 사용.
 * 사례 31: 85
 */
gbLandArea: string;

/**
 * 건물 연면적 (㎡).
 * 안분 시 건물 기준시가가 이미 총액이므로 직접 연산에 미사용.
 * NBL 바닥면적 자동 추정(연면적 ÷ 층수)에 사용.
 * 사례 31: 180.96
 */
gbBuildingArea: string;

/**
 * 건물 층수 (정수).
 * NBL 바닥면적 자동 추정: buildingFootprintArea = gbBuildingArea / gbBuildingFloors.
 * 사례 31: 2
 */
gbBuildingFloors: string;
```

**총 신규 필드 수**: 8개 (gbUseEstimatedAcquisition 포함)

---

## 4. Initial Value 명세 (② initial value)

**위치**: `lib/stores/calc-wizard-asset.ts` → `createInitialAssetForm()` 또는 `lib/stores/calc-wizard-asset-factory.ts` → `makeDefaultAsset()` 반환 객체

```typescript
// general_building 환산취득가 기본값 — AssetForm gb* 필드
gbUseEstimatedAcquisition: false,
gbTransferLandPricePerSqm: "",
gbTransferBuildingValue: "",
gbAcqLandPricePerSqm: "",
gbAcqBuildingValue: "",
gbLandArea: "",
gbBuildingArea: "",
gbBuildingFloors: "",
```

---

## 5. Normalize Fallback 명세 (③ normalize)

**위치**: `lib/stores/calc-wizard-asset.ts` → `normalizeAsset()` 또는 `lib/stores/calc-wizard-asset-factory.ts` → `migrateAsset()`

sessionStorage에 저장된 기존 폼 데이터(gb* 필드 없음) 마이그레이션 시 안전 기본값으로 초기화.

```typescript
// migrateAsset() 내 gb* 필드 누락 보호
asset.gbUseEstimatedAcquisition ??= false;
asset.gbTransferLandPricePerSqm ??= "";
asset.gbTransferBuildingValue ??= "";
asset.gbAcqLandPricePerSqm ??= "";
asset.gbAcqBuildingValue ??= "";
asset.gbLandArea ??= "";
asset.gbBuildingArea ??= "";
asset.gbBuildingFloors ??= "";

// assetKind "general_building" 추가 전 세션 데이터 보호:
const validAssetKinds = ["housing", "land", "building", "right_to_move_in", "presale_right", "commercial_building", "general_building"] as const;
if (!validAssetKinds.includes(asset.assetKind as typeof validAssetKinds[number])) {
  asset.assetKind = "building";
}
```

---

## 6. API 변환 명세 (④ API 변환)

### 6.1 분기 감지

**위치**: `lib/calc/transfer-tax-api.ts` → `callTransferTaxAPI()` 함수 상단 (isCommercialBuilding 감지 블록 근처, line 114~116)

```typescript
const isGeneralBuilding = primary.assetKind === "general_building";
const gbValuation = isGeneralBuilding && primary.gbUseEstimatedAcquisition
  ? buildGeneralBuildingValuation(primary)
  : undefined;
```

### 6.2 `buildGeneralBuildingValuation` 헬퍼 (신규)

**위치**: `lib/calc/transfer-tax-api-helpers.ts` → buildCommercialBuildingValuation 함수 아래에 추가

```typescript
/**
 * AssetForm gb* 필드 → generalBuildingValuation 서브객체 변환.
 * 필수 필드 누락 시 undefined 반환 — validate에서 이미 차단되므로 API 단계 방어용.
 */
export function buildGeneralBuildingValuation(
  asset: AssetForm
): GeneralBuildingValuationInput | undefined {
  const transferLandPricePerSqm = parseAmount(asset.gbTransferLandPricePerSqm);
  const transferBuildingValue = parseAmount(asset.gbTransferBuildingValue);
  const acqLandPricePerSqm = parseAmount(asset.gbAcqLandPricePerSqm);
  const acqBuildingValue = parseAmount(asset.gbAcqBuildingValue);
  const landArea = parseDecimal(asset.gbLandArea);
  const buildingArea = parseDecimal(asset.gbBuildingArea);
  const buildingFloors = parseInt(asset.gbBuildingFloors || "0", 10);

  if (
    !transferLandPricePerSqm ||
    !transferBuildingValue ||
    !acqLandPricePerSqm ||
    !acqBuildingValue ||
    !landArea ||
    !buildingArea ||
    !buildingFloors
  ) return undefined;

  return {
    transferLandPricePerSqm,
    transferBuildingValue,
    acquisitionLandPricePerSqm: acqLandPricePerSqm,
    acquisitionBuildingValue: acqBuildingValue,
    landArea,
    buildingArea,
    buildingFloors,
    estimatedDeductionRate: 0.03,  // 시행령 §163⑥ 등기 자산 3% 고정
  };
}
```

> **타입 참조**: `GeneralBuildingValuationInput`은 엔진 시니어가 `lib/tax-engine/general-building-valuation.ts`에 정의. UI는 1:1 매핑.

### 6.3 toEngineAssetKind 확장

**위치**: `lib/calc/transfer-tax-api-helpers.ts` → `toEngineAssetKind()` 함수 (line 121~124)

```typescript
// 현재:
export function toEngineAssetKind(kind: AssetForm["assetKind"]): "housing" | "land" | "building" | "commercial_building" {
  if (kind === "right_to_move_in" || kind === "presale_right") return "housing";
  return kind;
}

// 변경: 반환 타입에 "general_building" 추가
export function toEngineAssetKind(
  kind: AssetForm["assetKind"]
): "housing" | "land" | "building" | "commercial_building" | "general_building" {
  if (kind === "right_to_move_in" || kind === "presale_right") return "housing";
  return kind;
}
```

### 6.4 body 조립 (⑬ callTransferTaxAPI body spread)

**위치**: `lib/calc/transfer-tax-api.ts` → `body` 객체 (line 260~), commercialBuildingValuation 전달 직후

```typescript
const body = {
  // ... 기존 필드들 ...
  propertyType: isMixed
    ? ("mixed-use-house" as const)
    : (primary.assetKind as "housing" | "land" | "building" | "right_to_move_in" | "presale_right" | "commercial_building" | "general_building"),
  // ... 기존 useEstimatedAcquisition 분기 ...
  useEstimatedAcquisition: hasPre1990 || parcelModeActive || isMixed ? false
    : isCommercialBuilding ? primary.useEstimatedAcquisition
    : isGeneralBuilding ? primary.gbUseEstimatedAcquisition   // ★ 신규
    : isCarryoverGeneral ? true
    : isEstimated,
  // ... 기존 필드들 끝 ...
  ...(cbValuation !== undefined ? { commercialBuildingValuation: cbValuation } : {}),
  ...(gbValuation !== undefined ? { generalBuildingValuation: gbValuation } : {}),  // ⑬ ★ 신규
};
```

> **⑬ 중요**: `generalBuildingValuation` 키를 body에 spread하지 않으면 TypeScript는 에러를 내지 않지만 데이터가 누락됨. grep 자가 점검 필수: `grep -n "generalBuildingValuation" lib/calc/transfer-tax-api.ts`.

---

## 7. Zod 스키마 명세 (⑨⑩⑫ Route/API)

### 7.1 propertyType enum 확장 (⑨ 메인 스키마)

**위치**: `lib/api/transfer-tax-schema.ts` → `propertyBaseShape` 의 `propertyType` enum (line 116)

```typescript
// 현재:
propertyType: z.enum(["housing", "land", "building", "right_to_move_in", "presale_right", "mixed-use-house", "commercial_building"]),

// 변경:
propertyType: z.enum(["housing", "land", "building", "right_to_move_in", "presale_right", "mixed-use-house", "commercial_building", "general_building"]),
```

### 7.2 generalBuildingValuation Zod 스키마 정의 (⑫)

**위치**: `lib/api/transfer-tax-schema.ts` (또는 `transfer-tax-schema-sub.ts` — 800줄 정책 초과 시 sub 파일에 분리)

```typescript
/**
 * ⑫ 일반건물(토지+건물 일괄) 환산취득가 서브객체 Zod 스키마.
 * 미정의 시 request body의 해당 필드가 침묵 stripping됨 — 반드시 명시.
 */
export const generalBuildingValuationSchema = z.object({
  /** 양도시 토지 공시지가 (원/㎡). 안분 분모 토지 성분 산정용. */
  transferLandPricePerSqm: z.number().int().positive(),
  /** 양도시 건물기준시가 총액 (원). 안분 분모 건물 성분. */
  transferBuildingValue: z.number().int().positive(),
  /** 취득시 토지 공시지가 (원/㎡). 환산 비율 분자 토지 성분 산정용. */
  acquisitionLandPricePerSqm: z.number().int().positive(),
  /** 취득시 건물기준시가 총액 (원). 환산 비율 분자 건물 성분 + 개산공제 기준. */
  acquisitionBuildingValue: z.number().int().positive(),
  /** 토지 부수면적 (㎡). */
  landArea: z.number().positive(),
  /** 건물 연면적 (㎡). */
  buildingArea: z.number().positive(),
  /** 건물 층수 (정수). NBL 바닥면적 추정: buildingArea / buildingFloors. */
  buildingFloors: z.number().int().positive(),
  /**
   * 개산공제율 (기본 0.03).
   * 시행령 §163⑥: 등기 자산(토지·건물) 3%, 미등기 0.3%.
   * 클라이언트는 항상 0.03 전송 — 미등기 케이스는 후속 PDCA.
   */
  estimatedDeductionRate: z.number().positive().default(0.03),
});
```

**`propertyBaseShape`에 추가**:

```typescript
/** ⑫ 일반건물 환산취득가 서브객체 (미정의 시 침묵 stripping 방지를 위해 명시 필수) */
generalBuildingValuation: generalBuildingValuationSchema.optional(),
```

### 7.3 서브 스키마 refine (⑩ 컴패니언)

**위치**: `lib/api/transfer-tax-schema-sub.ts` → `addPropertyRefines` 헬퍼

```typescript
// addPropertyRefines 내부 — commercialBuildingValuation 검증 블록 아래에 추가:
if (data.generalBuildingValuation) {
  const gbv = data.generalBuildingValuation;
  // 모든 필드는 base 스키마에서 required로 정의됨.
  // 추가 교차 검증: 건물기준시가 > 0, 토지면적 > 0 (base에서 already positive)
  // 현재는 refine 추가 검증 불필요 — base 스키마 충분.
  // 향후 "양도시 건물기준시가가 취득시보다 0인 경우 환산 불가" 같은 교차 검증 필요 시 여기에 추가.
  void gbv; // 타입 참조 유지
}
```

> 현재는 base 스키마의 `.positive()` 제약으로 충분. 향후 교차 검증 추가 시 이 위치에.

### 7.4 Route Handler 엔진 input 매핑 (⑪⑭)

**위치**: `app/api/calc/transfer/route.ts`

#### [엔진 input 타입 vs UI 헬퍼 합의 — 확정]

엔진 시니어와 합의된 결정: **totalTransferPrice / transferDate / acquisitionDate는 route handler(⑭)에서 주입**.

- `buildGeneralBuildingValuation()` 헬퍼는 `totalTransferPrice` / `transferDate` / `acquisitionDate`를 서브객체에 포함하지 않음.
- `generalBuildingValuationSchema`(Zod ⑫)도 동일 — 단순 유지 (날짜·금액 중복 선언 없음).
- route handler가 최상위 필드를 서브객체에 주입한 뒤 엔진 호출:

```typescript
// ⑭ generalBuildingValuation → 엔진 input 매핑 (route handler 주입 패턴)
const engineInput = validated.generalBuildingValuation
  ? {
      ...validated.generalBuildingValuation,
      totalTransferPrice: body.transferPrice,                        // 최상위 양도가액 주입
      transferDate: toDate(body.transferDate, "transferDate"),       // Date 변환 후 주입
      acquisitionDate: toDate(asset.acquisitionDate, "acquisitionDate"), // 자산 취득일 주입
    }
  : undefined;

// 엔진 input에 전달:
generalBuildingValuation: engineInput,
```

> **⑭ 주입 책임**: route handler가 `totalTransferPrice` / `transferDate` / `acquisitionDate`를 서브객체에 합성. 클라이언트 body에는 이 3개 필드가 최상위에만 존재. Zod 스키마 단순 유지.

> **⑪ acquisitionDate fallback 해당 없음**: general_building은 acquisitionDate를 별도 서브객체로 분리하지 않음. 기존 최상위 `acquisitionDate` 필드로 처리. route handler가 합성 시 참조.

---

## 8. UI 입력 위젯 트리 (⑤ UI 위젯)

### 8.1 자산 종류 옵션 확장

**위치**: `components/calc/transfer/CompanionAssetCard.tsx` → `ASSET_KIND_OPTIONS` (line 36~43) 및 `ASSET_KIND_LABELS` (line 27~34)

```typescript
// ASSET_KIND_LABELS에 추가:
general_building: "일반건물(토지+건물 일괄)",

// ASSET_KIND_OPTIONS에 추가 (commercial_building 다음):
{ value: "general_building", label: "일반건물(토지+건물 일괄)", description: "취득가액 확인 불가 시 환산취득가 적용" },
```

### 8.2 일반건물 환산취득가 입력 섹션 — `GeneralBuildingBlock.tsx` (신규 파일)

**위치**: `components/calc/transfer/GeneralBuildingBlock.tsx` (신규, ~250줄 목표)
**렌더 조건**: `asset.assetKind === "general_building"`
**배치**: `CompanionAssetCard.tsx` 내 `CommercialBuildingBlock` 아래, `assetKind === "general_building"` 조건부 렌더

#### ToggleCard tone 충돌 점검 결과

- 사례 29 `CommercialBuildingBlock`의 "환산취득가 사용" ToggleCard: **tone="amber"** (확인: `CommercialBuildingBlock.tsx` line 69).
- `commercial_building`과 `general_building`은 `assetKind`가 달라 동일 카드에 동시 렌더되지 않음 → 화면 내 동시 표시 충돌 없음.
- 그러나 UX 일관성 및 미래 확장성(동일 자산 내 두 ToggleCard 구분)을 위해 사례 31은 **tone="violet"** 사용 권장.
  - amber = 취득 모드(사례 29 우선 점유), violet = 환산 방식 선택(의미 단위 다름)으로 구분.

**컴포넌트 트리 (4개 서브섹션):**

```
GeneralBuildingBlock
└── ToggleCard (환산취득가 사용, tone="violet")   ← amber → violet 변경 (사례 29 충돌 방지)
    ├── label: "환산취득가 방식으로 취득가액 계산"
    ├── description: "실거래가 확인이 불가한 경우 양도·취득 시점 기준시가 비율로 환산"
    ├── OFF 상태: bg-violet-50/70 배경 유지 (tone 규칙 준수)
    └── [ON 시 펼침]
        ├── ① 면적·층수 섹션 (sky 카드)
        │   ├── 섹션 번호 배지: ①
        │   ├── DecimalInput (토지면적 ㎡, gbLandArea)
        │   │   └── hint: "등기부 또는 토지대장 기재 토지면적"
        │   ├── DecimalInput (건물 연면적 ㎡, gbBuildingArea)
        │   │   └── hint: "건축물대장 기재 연면적(각층 합계)"
        │   └── 정수 입력 (층수, gbBuildingFloors)
        │       └── hint: "건물 총 층수 — 비사업용 토지 판정용 바닥면적 추정에 사용"
        │       ※ CurrencyInput 아님 — 원/DecimalInput 아님 — 정수. Input type="text" + 정규식 정수 허용.
        │
        ├── ② 양도시 기준시가 섹션 (emerald 카드)
        │   ├── 섹션 번호 배지: ②
        │   ├── 섹션 제목: "양도시 기준시가 (안분 분모)"
        │   ├── LandPriceLookupField (양도시 토지 공시지가 원/㎡, gbTransferLandPricePerSqm)
        │   │   └── 기준연도 힌트: "양도일 전년도 공시지가 (예: 2023년 양도 → 2022년 기준)"
        │   └── CurrencyInput (양도시 건물기준시가 총액 원, gbTransferBuildingValue)
        │       └── hint: "국세청 홈택스 → 기준시가 조회 → 건물분 기준시가 → 조회연도·구조·면적 입력 후 나오는 총액"
        │
        ├── ③ 취득시 기준시가 섹션 (amber 카드)
        │   ├── 섹션 번호 배지: ③
        │   ├── 섹션 제목: "취득시 기준시가 (환산 비율 분자 + 개산공제 기준)"
        │   ├── LandPriceLookupField (취득시 토지 공시지가 원/㎡, gbAcqLandPricePerSqm)
        │   │   └── 기준연도 힌트: "취득일 전년도 공시지가 (예: 1999년 취득 → 1998년 기준)"
        │   └── CurrencyInput (취득시 건물기준시가 총액 원, gbAcqBuildingValue)
        │       └── hint: "취득일 기준 건물기준시가 총액 — 개산공제(×3%)의 기준액이기도 함"
        │
        └── [안내 텍스트]
            "개산공제: 취득시 건물기준시가 × 3% / 취득시 공시지가 × 토지면적 × 3%"
            "토지·건물 각각 계산됩니다. 시행령 §163⑥"
```

### 8.3 CompanionAssetCard 연동

**위치**: `components/calc/transfer/CompanionAssetCard.tsx`

- `assetKind === "general_building"` 조건부로 `<GeneralBuildingBlock>` 렌더 (line 501~502의 CommercialBuildingBlock 패턴 동일 위치 아래)
- 양도시 기준시가 안분으로 자산별 양도가액이 결정되므로, 일반건물 선택 시 `actualSalePrice` 필드는 "일괄 양도가액" 라벨로 표시 (토지/건물 합계)

### 8.4 ToggleCard / 섹션 tone 매핑

| 컴포넌트 | tone | 이유 |
|---|---|---|
| "환산취득가 사용" ToggleCard | **violet** | 환산 방식 선택 (amber는 사례 29 commercial_building 우선 점유) |
| 면적·층수 섹션 카드 | sky | 면적·규모 정보 |
| 양도시 기준시가 섹션 카드 | emerald | 양도시점 기준시가 |
| 취득시 기준시가 섹션 카드 | amber | 취득시점 기준시가 |

> **충돌 점검 완료**: 사례 29 CommercialBuildingBlock `tone="amber"`, 사례 31 GeneralBuildingBlock `tone="violet"`. assetKind 분기로 동시 렌더 없음. tone 의미 단위 차이(취득 모드 vs 환산 방식)로 구분.

### 8.5 FieldCard hint 문구 (placeholder 숫자 예시 금지)

| 필드 | hint 문구 |
|---|---|
| 토지면적 | "등기부등본 또는 토지대장 기재 토지면적 (㎡)" |
| 건물 연면적 | "건축물대장 기재 각층 바닥면적 합계 (㎡)" |
| 층수 | "건물 총 층수. 비사업용 토지 판정 시 바닥면적(연면적÷층수)으로 자동 추정" |
| 양도시 공시지가 | "국토교통부 공시지가 — 양도일 전년도 기준. 예: 2023년 양도면 2022년 1월 1일 기준 공시지가를 Vworld 또는 토지이음에서 조회" |
| 양도시 건물기준시가 | "국세청 홈택스 → 기준시가 조회 → 건물분 기준시가. 양도일 기준 건물 전체 기준시가 총액 (원)" |
| 취득시 공시지가 | "취득일 전년도 기준 개별공시지가 (원/㎡). 1999년 취득이면 1998년 기준 공시지가 조회" |
| 취득시 건물기준시가 | "취득일 기준 건물기준시가 총액. 이 금액의 3%가 건물 개산공제액이 됩니다 (시행령 §163⑥)" |

---

## 9. 사이드바 합계 (⑥ 사이드바)

**위치**: `lib/stores/calc-wizard-store.ts` → `computeTransferSummary()` (line 282~)

### 9.1 assetKind 라벨 분기 추가

```typescript
// computeTransferSummary 내 assetKind 라벨 분기에 추가:
case "general_building":
  assetTypeLabel = "일반건물(토지+건물 일괄)";
  break;
```

### 9.2 사이드바 표시 항목

일반건물 환산 모드는 양도가 안분 결과(토지/건물 각각의 양도가액)와 환산취득가가 모두 API 결과 후에야 확정되므로, 사전 계산 가능한 항목만 표시:

| 항목 | 계산 가능 여부 | 사이드바 표시 |
|---|---|---|
| 양도가액(합계) | 가능 (입력값 직접) | 표시 |
| 토지면적 / 건물 연면적 | 가능 (입력값) | 표시 (보조 정보) |
| 보유기간 | 가능 (취득일·양도일) | 표시 |
| 환산취득가 | 불가 (API 결과 후) | 생략 또는 "계산 후 확인" 안내 |
| 양도소득금액 | 불가 | 결과 도착 후 표시 |

---

## 10. Validation 명세 (⑧ validation)

**위치**: `lib/calc/transfer-tax-validate.ts` → `validateStep()` 내 step 0 자산 유효성 검사 블록

```typescript
// commercial_building 검증 블록(line 153~) 아래에 추가:
if (asset.assetKind === "general_building" && asset.gbUseEstimatedAcquisition) {
  const label = `자산 ${assetIndex + 1}`;

  // 면적·층수 필수
  if (!parseDecimal(asset.gbLandArea))
    return `${label}: 토지면적을 입력하세요.`;
  if (!parseDecimal(asset.gbBuildingArea))
    return `${label}: 건물 연면적을 입력하세요.`;
  const floors = parseInt(asset.gbBuildingFloors || "0", 10);
  if (!floors || floors < 1)
    return `${label}: 건물 층수를 입력하세요.`;

  // 양도시 기준시가 필수
  if (!parseAmount(asset.gbTransferLandPricePerSqm))
    return `${label}: 양도시 토지 공시지가를 입력하세요.`;
  if (!parseAmount(asset.gbTransferBuildingValue))
    return `${label}: 양도시 건물기준시가 총액을 입력하세요.`;

  // 취득시 기준시가 필수
  if (!parseAmount(asset.gbAcqLandPricePerSqm))
    return `${label}: 취득시 토지 공시지가를 입력하세요.`;
  if (!parseAmount(asset.gbAcqBuildingValue))
    return `${label}: 취득시 건물기준시가 총액을 입력하세요.`;

  // 교차 검증: 기준시가가 0이면 0으로 나누기 발생 → 차단
  // validation에서의 토지 기준시가 산출은 0 분모 판정 한정.
  // 정밀 계산(anchor 일치)은 엔진이 BigInt(safeMultiplyThenDivide)로 재수행 — UI 부동소수 오차는 영향 없음.
  const transferLandStd = parseAmount(asset.gbTransferLandPricePerSqm) * parseDecimal(asset.gbLandArea);
  const transferBuildingStd = parseAmount(asset.gbTransferBuildingValue);
  if (transferLandStd + transferBuildingStd <= 0)  // <=0 비교만 (0 분모 판정 한정)
    return `${label}: 양도시 기준시가 합계가 0이면 안분이 불가합니다.`;
}
```

> **⑧ 동기화 확인**: `buildGeneralBuildingValuation()`이 `undefined`를 반환하는 조건(필수 필드 누락)과 위 validate 차단 조건이 완전히 일치해야 함. UI validate 통과 → API 헬퍼 undefined 반환 → 서브객체 미도달 패턴 차단.
>
> **자동 안분 fallback 금지 정책 준수**: 미입력 시 자동 계산 금지. validate가 명확한 오류 메시지로 차단.

---

## 11~17. 결과 카드·동기화 매트릭스·엔진 협업·수동 테스트·DoD

> 800줄 정책으로 분리됨. 상세 내용: [`case-31-general-building.ui.result-dod.md`](case-31-general-building.ui.result-dod.md)

### 요약

| 섹션 | 내용 |
|---|---|
| §11 결과 카드 | `GeneralBuildingValuationDetailCard.tsx` (신규). 안분표·환산산식·개산공제·통산표·세액. |
| §12 14개 동기화 매트릭스 | ①~⑭ 전수. ⑫⑬⑭ TS 미감지 — grep 자가 점검 명령어 포함. |
| §13 엔진 협업 | `TransferTaxInput.generalBuildingValuation?` + `GeneralBuildingValuationDetail` echo 필드 목록 |
| §14 케이스 매트릭스 | G-01(★ 본 작업) / G-02·G-03 후속 PDCA |
| §15 수동 테스트 | 입력 절차 16단계 + 결과 기대값 표 + Network 탭 body 확인 |
| §16 사전 정책 점검 | 9개 패턴 + 3대 핵심 정책 (useEffect 금지·안분 fallback 금지·validation 동기화) |
| §17 DoD 체크리스트 | anchor 17종 / 14지점 / tsc 0건 / vitest 612+ / 브라우저 / Network 탭 |

**anchor 목표**: 합계 양도소득금액 **456,343,181** (브라우저 + Network body `generalBuildingValuation` 포함 확인)
- [ ] 양도시 건물기준시가 **20,629,440** (BigInt 정밀 산출값) / 취득시 건물기준시가 **28,144,700** 결과 카드에 표시
- [ ] 산출세액 **155,597,272** / 지방소득세 **15,559,727** anchor 통과
