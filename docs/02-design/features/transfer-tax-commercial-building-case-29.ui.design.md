# 양도소득세 사례 29 — 상업용건물·오피스텔 환산취득가 UI 디자인

**작성일**: 2026-05-08
**작성자**: transfer-tax-ui-senior
**계획서**: `docs/00-pm/transfer-tax-commercial-building-case-29.plan.md`
**PDCA 단계**: Design

---

## 1. 사용자 시나리오 (7단계)

사례 29 (예제 PDF): 서울 동대문구 경동프라자 1층 11호(소매점)를 2000년 취득 후 2022년 양도한 케이스. 2005년 최초 호별 고시 전 취득이므로 토지·건물 ㎡당 기준시가 비율로 역환산.

| 단계 | 사용자 행동 | UI 반응 |
|---|---|---|
| 1 | Step1 → "자산 추가" → 자산종류 **"상업용건물·오피스텔"** 선택 | `assetKind: "commercial_building"` 설정. 취득원인 라디오 그룹(매매/상속/증여) 표시. |
| 2 | 취득원인 **"매매"** 선택 → **"환산취득가 사용"** ToggleCard ON | `useEstimatedAcquisition: true`. 호별고시 시점 분기 RadioCardGroup 노출. |
| 3 | 호별고시 시점 분기: **"호별 고시 전 취득 (~2004.12)"** 선택 | `cbEra: "pre_disclosure"`. 면적 카드(전용·공유·대지), 호별고시가 카드(2시점), 건물기준시가 카드(3시점), 개별공시지가 카드(3시점) 모두 표시. |
| 4 | 면적 입력: 전용 36㎡ / 공유 33.52㎡ / 대지 12.57㎡ | DecimalInput으로 입력. 연면적 = 전용+공유 = 69.52㎡ 자동 계산 표시. |
| 5 | 호별고시가: 양도시(2022) 69,200원/㎡ / 최초고시(2005) 30,000원/㎡ 입력 | CurrencyInput. hint: "국세청 홈택스 → 기준시가 조회 → 오피스텔·상업용건물 호별공시가" |
| 6 | 건물 ㎡당 기준시가 3시점: 취득시·최초고시시·양도시 입력 / 개별공시지가 3시점: LandPriceLookupField로 입력 | 취득시·최초고시시는 amber 카드, 양도시는 emerald 카드로 시점별 색상 구분. |
| 7 | 결과 화면: 환산취득가 산정 근거 표(엑셀 B33~E41 재현) + 토지·건물 분리 양도차익·장특공·산출세액 합산 | 135,155,041 / 3,588,219 / 401,256,740 / 120,377,022 / **85,844,292** (2022 적용 소법 §55 정확 세율) |

---

## 2. 케이스 인벤토리 표 (행 ≥ 3, 필수)

| # | 케이스 | 자산종류 | 취득시점 | 모드 | 필요 입력 데이터 | 분기 조건 | 비고 |
|---|---|---|---|---|---|---|---|
| C-01 ★ | 호별고시 전 취득 (사례 29 anchor) | commercial_building | ~2004.12.31 | 환산 | 호별고시가 2시점 + 건물기준시가 3시점 + 개별공시지가 3시점 + 면적 3종 | `cbEra: "pre_disclosure"` | 역환산 로직 사용 (시행령 §164⑧) |
| C-02 | 호별고시 후 취득 | commercial_building | 2005.1.1~ | 환산 | 호별고시가 2시점(취득시·양도시) + 개별공시지가 2시점 + 면적 3종 | `cbEra: "post_disclosure"` | 건물기준시가·최초고시가 불필요 |
| C-03 | 실가 모드 | commercial_building | 모든 시점 | 실가 | 취득가액 직접 입력 (기존 경로) | `useEstimatedAcquisition: false` | 환산 분기 미진입, 기존 building 처리 경로 준용 |

> C-01이 Do 단계 primary anchor. C-02·C-03은 경계·회귀 anchor.

---

## 3. 폼 상태 타입 변경 명세

### 3.1 AssetForm 신규 필드 (① 폼 상태 타입)

**위치**: `lib/stores/calc-wizard-asset.ts` → `AssetForm` 인터페이스 끝에 추가

```typescript
// ── 상업용건물·오피스텔 환산취득가 (사례 29, 소득세법 시행령 §164⑧, §176조의2②2호) ──
/**
 * 상업용건물·오피스텔 호별고시 시점 분기.
 * - "pre_disclosure": 호별고시 전 취득(~2004.12) → 건물기준시가 3시점 + 역환산 필요
 * - "post_disclosure": 호별고시 후 취득(2005.1~) → 호별고시가만으로 환산 가능
 * commercial_building + useEstimatedAcquisition=true 시만 의미 있음.
 */
cbEra: "pre_disclosure" | "post_disclosure" | "";
/** 전용면적 (㎡) */
cbExclusiveArea: string;
/** 공유면적 (㎡) */
cbSharedArea: string;
/** 대지면적 (㎡) */
cbLandArea: string;
/**
 * 호별 ㎡당 고시가 — 양도시 (원/㎡).
 * 국세청 기준시가 조회 시 "㎡당 가액" 입력.
 * 호별고시 전/후 취득 공통 사용.
 */
cbUnitPriceAtTransfer: string;
/**
 * 호별 ㎡당 고시가 — 최초고시(2005) 또는 취득시 (원/㎡).
 * cbEra === "pre_disclosure": 최초고시(2005) 시점 가액.
 * cbEra === "post_disclosure": 취득시 호별고시가.
 */
cbUnitPriceAtFirstOrAcq: string;
/**
 * 건물 ㎡당 기준시가 — 취득시 (원/㎡). cbEra === "pre_disclosure" 시만 필수.
 * 소득세법 시행령 §164①: 국세청 고시 건물기준시가.
 */
cbBuildingStdPriceAtAcq: string;
/**
 * 건물 ㎡당 기준시가 — 최초고시시(2005) (원/㎡). cbEra === "pre_disclosure" 시만 필수.
 */
cbBuildingStdPriceAtFirst: string;
/**
 * 건물 ㎡당 기준시가 — 양도시 (원/㎡).
 * cbEra === "pre_disclosure": 필수 (역환산 분모의 건물 성분).
 * cbEra === "post_disclosure": 불필요 (호별고시가가 건물+토지 통합).
 */
cbBuildingStdPriceAtTransfer: string;
/**
 * 개별공시지가 — 취득시 (원/㎡). LandPriceLookupField로 입력.
 * cbEra === "pre_disclosure": 필수. 취득시 ㎡당기준시가합의 토지 성분.
 * cbEra === "post_disclosure": 취득시 기준시가 산정용.
 */
cbLandPricePerSqmAtAcq: string;
/**
 * 개별공시지가 — 최초고시시(2005) (원/㎡). LandPriceLookupField로 입력.
 * cbEra === "pre_disclosure" 시만 필수.
 */
cbLandPricePerSqmAtFirst: string;
/**
 * 개별공시지가 — 양도시 (원/㎡). LandPriceLookupField로 입력.
 * cbEra === "pre_disclosure" / "post_disclosure" 공통 필수.
 */
cbLandPricePerSqmAtTransfer: string;
```

### 3.2 AssetForm.assetKind 확장

**위치**: `lib/stores/calc-wizard-asset.ts` → `AssetForm.assetKind` 타입에 `"commercial_building"` 추가.

```typescript
// 기존:
assetKind: "housing" | "land" | "building" | "right_to_move_in" | "presale_right";

// 변경:
assetKind: "housing" | "land" | "building" | "right_to_move_in" | "presale_right" | "commercial_building";
```

> **주의**: `commercial_building`은 Zod 스키마 `propertyType` enum과 다름.
> API 변환 시 `"commercial_building"` → `"building"` (propertyType) + `commercialBuildingValuation` 서브객체로 분리 전달.

---

## 4. Initial Value 명세 (② initial value)

**위치**: `lib/stores/calc-wizard-asset-factory.ts` → `makeDefaultAsset()` 반환 객체에 추가

```typescript
// commercial_building 환산취득가 기본값 — AssetForm cb* 필드
cbEra: "",
cbExclusiveArea: "",
cbSharedArea: "",
cbLandArea: "",
cbUnitPriceAtTransfer: "",
cbUnitPriceAtFirstOrAcq: "",
cbBuildingStdPriceAtAcq: "",
cbBuildingStdPriceAtFirst: "",
cbBuildingStdPriceAtTransfer: "",
cbLandPricePerSqmAtAcq: "",
cbLandPricePerSqmAtFirst: "",
cbLandPricePerSqmAtTransfer: "",
```

---

## 5. Normalize Fallback 명세 (③ normalize)

**위치**: `lib/stores/calc-wizard-asset-factory.ts` → `migrateAsset()` 또는 `lib/calc/transfer-tax-api-helpers.ts`의 normalize 경로

sessionStorage에 저장된 기존 폼 데이터(cb* 필드 없음)를 마이그레이션할 때 빈 문자열로 초기화.

```typescript
// migrateAsset() 내 cb* 필드 누락 보호
asset.cbEra ??= "";
asset.cbExclusiveArea ??= "";
asset.cbSharedArea ??= "";
asset.cbLandArea ??= "";
asset.cbUnitPriceAtTransfer ??= "";
asset.cbUnitPriceAtFirstOrAcq ??= "";
asset.cbBuildingStdPriceAtAcq ??= "";
asset.cbBuildingStdPriceAtFirst ??= "";
asset.cbBuildingStdPriceAtTransfer ??= "";
asset.cbLandPricePerSqmAtAcq ??= "";
asset.cbLandPricePerSqmAtFirst ??= "";
asset.cbLandPricePerSqmAtTransfer ??= "";
// assetKind "commercial_building" 추가 전 세션 데이터 처리:
if (!(["housing","land","building","right_to_move_in","presale_right","commercial_building"] as const)
    .includes(asset.assetKind as never)) {
  asset.assetKind = "building";
}
```

---

## 6. API 변환 명세 (④ API 변환)

**위치**: `lib/calc/transfer-tax-api.ts` → `callTransferTaxAPI()` body 빌드 섹션

### 6.1 상업용건물 분기 감지

```typescript
const isCommercialBuilding = primary.assetKind === "commercial_building";
const cbValuation = isCommercialBuilding && primary.useEstimatedAcquisition
  ? buildCommercialBuildingValuation(primary)
  : undefined;
```

### 6.2 `buildCommercialBuildingValuation` 헬퍼 (신규)

**위치**: `lib/calc/transfer-tax-api-helpers.ts`

```typescript
export function buildCommercialBuildingValuation(
  asset: AssetForm
): CommercialBuildingValuationInput | undefined {
  const exclusiveArea = parseDecimal(asset.cbExclusiveArea);
  const sharedArea = parseDecimal(asset.cbSharedArea);
  const landArea = parseDecimal(asset.cbLandArea);
  const unitPriceAtTransfer = parseAmount(asset.cbUnitPriceAtTransfer);
  const unitPriceAtFirstOrAcq = parseAmount(asset.cbUnitPriceAtFirstOrAcq);
  const landPriceAtTransfer = parseAmount(asset.cbLandPricePerSqmAtTransfer);

  if (!exclusiveArea || !sharedArea || !landArea || !unitPriceAtTransfer
      || !unitPriceAtFirstOrAcq || !landPriceAtTransfer) return undefined;

  const base = {
    exclusiveArea,
    sharedArea,
    landArea,
    unitPriceAtTransfer,
    unitPriceAtFirstOrAcq,
    landPricePerSqmAtTransfer: landPriceAtTransfer,
    era: asset.cbEra as "pre_disclosure" | "post_disclosure",
  };

  if (asset.cbEra === "pre_disclosure") {
    const buildingAtAcq = parseAmount(asset.cbBuildingStdPriceAtAcq);
    const buildingAtFirst = parseAmount(asset.cbBuildingStdPriceAtFirst);
    const buildingAtTransfer = parseAmount(asset.cbBuildingStdPriceAtTransfer);
    const landAtAcq = parseAmount(asset.cbLandPricePerSqmAtAcq);
    const landAtFirst = parseAmount(asset.cbLandPricePerSqmAtFirst);
    if (!buildingAtAcq || !buildingAtFirst || !buildingAtTransfer
        || !landAtAcq || !landAtFirst) return undefined;
    return {
      ...base,
      buildingStdPricePerSqmAtAcq: buildingAtAcq,
      buildingStdPricePerSqmAtFirst: buildingAtFirst,
      buildingStdPricePerSqmAtTransfer: buildingAtTransfer,
      landPricePerSqmAtAcq: landAtAcq,
      landPricePerSqmAtFirst: landAtFirst,
    };
  }
  // post_disclosure: 취득시 호별고시가 + 개별공시지가 2시점만
  const landAtAcq = parseAmount(asset.cbLandPricePerSqmAtAcq);
  return { ...base, landPricePerSqmAtAcq: landAtAcq || undefined };
}
```

### 6.3 body 조립 (⑬ callTransferTaxAPI body spread)

```typescript
const body = {
  // 기존 필드들 ...
  propertyType: isCommercialBuilding
    ? ("building" as const)        // 엔진 타입은 "building"으로 전달
    : primary.assetKind,
  // ...
  commercialBuildingValuation: cbValuation,  // ⑫ Zod 객체 정의 필수
};
```

> **⑫ 중요**: `commercialBuildingValuation` 필드는 TypeScript 정적 타입 검사에서 누락을 감지하지 못함.
> Zod 스키마(`lib/api/transfer-tax-schema.ts`)에 명시적으로 `commercialBuildingValuation: commercialBuildingValuationSchema.optional()` 추가 필수 — 미정의 시 침묵 stripping.

---

## 7. Zod 스키마 명세 (⑨⑩⑫ Route/API)

### 7.1 메인 스키마 (`lib/api/transfer-tax-schema.ts`) — ⑨

**`propertyBaseShape`에 추가** (line 72 `propertyType` enum 확장 포함):

```typescript
// ⑨ propertyType enum은 변경하지 않음 — "commercial_building"은 API로 전달 시 "building"으로 변환됨.
// propertyType 확장 불필요. 단, 아래 서브객체를 propertyBaseShape에 추가:

/** ⑫ 상업용건물·오피스텔 환산취득가 서브객체 (미정의 시 침묵 stripping 방지) */
commercialBuildingValuation: commercialBuildingValuationSchema.optional(),
```

`commercialBuildingValuationSchema` Zod 정의:

```typescript
export const commercialBuildingValuationSchema = z.object({
  era: z.enum(["pre_disclosure", "post_disclosure"]),
  exclusiveArea: z.number().positive(),
  sharedArea: z.number().positive(),
  landArea: z.number().positive(),
  /** 양도시 ㎡당 호별고시가 (원/㎡) */
  unitPriceAtTransfer: z.number().int().positive(),
  /** 최초고시(2005) 또는 취득시 ㎡당 호별고시가 (원/㎡) */
  unitPriceAtFirstOrAcq: z.number().int().positive(),
  /** 양도시 개별공시지가 (원/㎡) — pre/post 공통 필수 */
  landPricePerSqmAtTransfer: z.number().int().positive(),
  /**
   * 취득시 개별공시지가 (원/㎡) — pre/post 공통 필수.
   * - pre_disclosure: 취득시 토지·건물 ㎡당기준시가합 산정용
   * - post_disclosure: 환산 비율 산정용
   * base 스키마는 .optional()이며 era 무관 필수 검증은 § 7.2 addPropertyRefines가 담당.
   */
  landPricePerSqmAtAcq: z.number().int().positive().optional(),
  // ── pre_disclosure 전용 (era === "pre_disclosure" 시 필수) ──
  buildingStdPricePerSqmAtAcq: z.number().int().positive().optional(),
  buildingStdPricePerSqmAtFirst: z.number().int().positive().optional(),
  buildingStdPricePerSqmAtTransfer: z.number().int().positive().optional(),
  /** 최초고시시(2005) 개별공시지가 (원/㎡) — pre_disclosure 시 필수 */
  landPricePerSqmAtFirst: z.number().int().positive().optional(),
});
```

> **위치 권장**: `lib/api/transfer-tax-schema.ts` import 섹션 또는 `transfer-tax-schema-sub.ts`에 정의 후 export. 800줄 정책 초과 시 sub 파일에 분리.

### 7.2 서브 스키마 (`lib/api/transfer-tax-schema-sub.ts`) — ⑩

`addPropertyRefines` 헬퍼에 `commercial_building` 환산모드 검증 추가:

```typescript
// addPropertyRefines 내부:
if (data.commercialBuildingValuation) {
  const cbv = data.commercialBuildingValuation;

  // ── era 무관 공통 필수 (base 스키마가 .optional()이므로 refine에서 강제) ──
  if (!cbv.landPricePerSqmAtAcq)
    ctx.addIssue({ code: z.ZodIssueCode.custom,
      path: ["commercialBuildingValuation", "landPricePerSqmAtAcq"],
      message: "취득시 개별공시지가 필수" });

  // ── pre_disclosure 전용 ──
  if (cbv.era === "pre_disclosure") {
    if (!cbv.buildingStdPricePerSqmAtAcq)
      ctx.addIssue({ code: z.ZodIssueCode.custom,
        path: ["commercialBuildingValuation", "buildingStdPricePerSqmAtAcq"],
        message: "호별고시 전 취득: 취득시 건물 ㎡당 기준시가 필수" });
    if (!cbv.buildingStdPricePerSqmAtFirst)
      ctx.addIssue({ code: z.ZodIssueCode.custom,
        path: ["commercialBuildingValuation", "buildingStdPricePerSqmAtFirst"],
        message: "호별고시 전 취득: 최초고시시 건물 ㎡당 기준시가 필수" });
    if (!cbv.buildingStdPricePerSqmAtTransfer)
      ctx.addIssue({ code: z.ZodIssueCode.custom,
        path: ["commercialBuildingValuation", "buildingStdPricePerSqmAtTransfer"],
        message: "호별고시 전 취득: 양도시 건물 ㎡당 기준시가 필수" });
    if (!cbv.landPricePerSqmAtFirst)
      ctx.addIssue({ code: z.ZodIssueCode.custom,
        path: ["commercialBuildingValuation", "landPricePerSqmAtFirst"],
        message: "호별고시 전 취득: 최초고시시 개별공시지가 필수" });
  }

  // ── post_disclosure 전용 (현재는 추가 필수 필드 없음. era 무관 공통만 적용) ──
  // 향후 호별고시가 검증 분기 필요 시 여기에 추가.
}
```

> **§7.2 핵심 원칙**: § 10 UI validate / § 4 API fallback / § 7.2 Zod refine 3중 동기화 — 같은 값이 한쪽에서만 통과되는 빈틈 차단. API 직접 호출(외부 클라이언트·테스트 픽스처)에서 Zod가 마지막 방어선이므로 era 무관 필수 필드는 refine에 반드시 포함.

### 7.3 Route Handler 엔진 input 매핑 (⑪⑭)

**위치**: `app/api/calc/transfer/route.ts`

```typescript
// ⑭ commercialBuildingValuation → 엔진 input 매핑
commercialBuildingValuation: validated.commercialBuildingValuation
  ? {
      ...validated.commercialBuildingValuation,
      // Date 변환 불필요 — 날짜 필드 없음
    }
  : undefined,
```

---

## 8. UI 입력 위젯 트리 (⑤ UI 위젯)

### 8.1 자산 종류 옵션 확장

**위치**: `components/calc/transfer/CompanionAssetCard.tsx` (또는 Step1 자산 카드 내 `ASSET_KIND_OPTIONS`)

```typescript
const ASSET_KIND_OPTIONS = [
  { value: "housing", label: "주택" },
  { value: "land", label: "토지·농지" },
  { value: "building", label: "건물(토지 외)" },
  { value: "right_to_move_in", label: "입주권" },
  { value: "presale_right", label: "분양권" },
  { value: "commercial_building", label: "상업용건물·오피스텔" },   // 신규 추가
] as const;
```

ASSET_KIND_LABELS에도 추가:
```typescript
commercial_building: "상업용건물·오피스텔",
```

### 8.2 상업용건물 취득가 입력 섹션 — `CommercialBuildingBlock.tsx` (신규 파일)

**위치**: `components/calc/transfer/CommercialBuildingBlock.tsx`
**렌더 조건**: `asset.assetKind === "commercial_building"`
**배치**: CompanionAssetCard 내 취득원인 섹션 아래, `useEstimatedAcquisition` ToggleCard 내부

**컴포넌트 트리 (7개 서브섹션):**

```
CommercialBuildingBlock
├── ToggleCard (환산취득가 사용, tone="amber")
│   └── [ON 시 펼침]
│       ├── RadioCardGroup (호별고시 시점 분기, tone="amber")
│       │   ├── "호별 고시 전 취득 (~2004.12)" → cbEra = "pre_disclosure"
│       │   └── "호별 고시 후 취득 (2005.1~)"  → cbEra = "post_disclosure"
│       │
│       ├── [cbEra 선택 후 공통 노출]
│       │   └── ① 면적 섹션 (sky 카드)
│       │       ├── DecimalInput (전용면적 ㎡)
│       │       ├── DecimalInput (공유면적 ㎡)
│       │       ├── DecimalInput (대지면적 ㎡)
│       │       └── [자동 계산] 연면적 = 전용 + 공유 표시
│       │
│       ├── [cbEra 선택 후 공통 노출]
│       │   └── ② 호별 ㎡당 고시가 섹션 (emerald 카드 — 양도시 / amber 카드 — 취득·최초고시)
│       │       ├── CurrencyInput (양도시 ㎡당 고시가, emerald)
│       │       └── CurrencyInput (취득시 또는 최초고시(2005) ㎡당 고시가, amber)
│       │           └── [cbEra === "pre_disclosure"] 라벨: "최초고시(2005) ㎡당 호별고시가"
│       │               [cbEra === "post_disclosure"] 라벨: "취득시 ㎡당 호별고시가"
│       │
│       ├── [cbEra === "pre_disclosure" 시만 노출]
│       │   └── ③ 건물 ㎡당 기준시가 3시점 섹션 (amber+emerald 혼합)
│       │       ├── CurrencyInput (취득시 건물 ㎡당 기준시가, amber)
│       │       ├── CurrencyInput (최초고시시(2005) 건물 ㎡당 기준시가, amber)
│       │       └── CurrencyInput (양도시 건물 ㎡당 기준시가, emerald)
│       │
│       └── ④ 개별공시지가 3시점 섹션 (amber+emerald)
│           ├── LandPriceLookupField (취득시 개별공시지가 — cbEra="pre_disclosure": 필수 / "post_disclosure": 필수)
│           ├── LandPriceLookupField (최초고시시(2005) 개별공시지가 — cbEra="pre_disclosure": 필수)
│           └── LandPriceLookupField (양도시 개별공시지가 — 공통 필수)
```

### 8.3 섹션별 FieldCard hint 문구 (placeholder 숫자 예시 금지)

| 섹션 | 필드 | hint 문구 |
|---|---|---|
| 호별고시가 | 양도시 ㎡당 | "국세청 홈택스 → 기준시가 조회 → 오피스텔 및 상업용건물 기준시가 → 호별로 고시된 ㎡당 가액 입력" |
| 호별고시가 | 최초고시(2005)/취득시 ㎡당 | "2005.1.1 최초 고시 시점 ㎡당 가액. 국세청 고시 이력에서 확인." |
| 건물기준시가 | 3시점 공통 | "국세청 기준시가 조회 → 건물분 ㎡당 가액 (원/㎡). 오피스텔·상가는 국세청 홈택스 > 세금신고 > 양도소득세 > 기준시가 조회" |
| 개별공시지가 | 3시점 공통 | LandPriceLookupField 내장 hint 사용 (Vworld 자동 조회 안내) |
| 면적 | 전용면적 | "건물 전용면적 (분양면적에서 공유면적 제외)" |
| 면적 | 공유면적 | "계단·복도 등 공유부분 면적" |
| 면적 | 대지면적 | "이 호에 귀속되는 대지권 면적 (등기부 기재 면적)" |

### 8.4 ToggleCard / RadioCardGroup tone 매핑

| 컴포넌트 | tone | 이유 |
|---|---|---|
| "환산취득가 사용" ToggleCard | amber | 취득 모드 분기 |
| 호별고시 시점 RadioCardGroup | amber | 취득시점 구분 |
| 면적 섹션 색상 카드 | sky | 면적·규모 정보 |
| 호별고시가·건물기준시가 (취득시·최초고시) | amber | 취득 시점 기준시가 |
| 호별고시가·건물기준시가 (양도시) | emerald | 양도시점 기준시가 |
| 개별공시지가 (취득시·최초고시) | amber | 취득 시점 |
| 개별공시지가 (양도시) | emerald | 양도시점 |

---

## 9. 사이드바 합계 (⑥ 사이드바)

**위치**: `lib/stores/calc-wizard-store.ts` → `computeTransferSummary()`

상업용건물 환산 모드는 취득가액이 API 결과 후에야 결정되므로 사이드바에 취득가액을 0원으로 표시하거나 생략.
환산취득가 입력값(호별고시가 등)으로 사전 계산은 불필요 — 결과 도착 후 `양도소득금액` 행에 반영됨.

현행 `computeTransferSummary` 는 `assetKind`가 "housing" | "land" | "building" 를 기준으로 라벨을 분기. `"commercial_building"` 케이스 추가:
```typescript
// computeTransferSummary 내 자산종류 라벨 분기
case "commercial_building":
  assetTypeLabel = "상업용건물·오피스텔";
  break;
```

---

## 10. Validation 명세 (⑧ validation)

**위치**: `lib/calc/transfer-tax-validate.ts` → `validateStep()` step 0 (자산 목록) 검증

```typescript
// commercial_building 환산 모드 전용 검증 — validateStep step 0 내부
if (asset.assetKind === "commercial_building" && asset.useEstimatedAcquisition) {
  const label = `자산 ${assetIndex + 1}`;

  // cbEra 선택 필수
  if (!asset.cbEra) {
    return `${label}: 상업용건물·오피스텔 — 호별고시 취득 시점을 선택하세요.`;
  }
  // 면적 3종 필수
  if (!parseDecimal(asset.cbExclusiveArea))
    return `${label}: 전용면적을 입력하세요.`;
  if (!parseDecimal(asset.cbSharedArea))
    return `${label}: 공유면적을 입력하세요.`;
  if (!parseDecimal(asset.cbLandArea))
    return `${label}: 대지면적을 입력하세요.`;
  // 호별고시가 공통 필수
  if (!parseAmount(asset.cbUnitPriceAtTransfer))
    return `${label}: 양도시 ㎡당 호별고시가를 입력하세요.`;
  if (!parseAmount(asset.cbUnitPriceAtFirstOrAcq))
    return `${label}: ${asset.cbEra === "pre_disclosure" ? "최초고시(2005)" : "취득시"} ㎡당 호별고시가를 입력하세요.`;
  // 양도시 개별공시지가 공통 필수
  if (!parseAmount(asset.cbLandPricePerSqmAtTransfer))
    return `${label}: 양도시 개별공시지가를 입력하세요.`;

  if (asset.cbEra === "pre_disclosure") {
    // 건물기준시가 3시점 필수
    if (!parseAmount(asset.cbBuildingStdPriceAtAcq))
      return `${label}: 취득시 건물 ㎡당 기준시가를 입력하세요.`;
    if (!parseAmount(asset.cbBuildingStdPriceAtFirst))
      return `${label}: 최초고시시(2005) 건물 ㎡당 기준시가를 입력하세요.`;
    if (!parseAmount(asset.cbBuildingStdPriceAtTransfer))
      return `${label}: 양도시 건물 ㎡당 기준시가를 입력하세요.`;
    // 개별공시지가 3시점 필수
    if (!parseAmount(asset.cbLandPricePerSqmAtAcq))
      return `${label}: 취득시 개별공시지가를 입력하세요.`;
    if (!parseAmount(asset.cbLandPricePerSqmAtFirst))
      return `${label}: 최초고시시(2005) 개별공시지가를 입력하세요.`;
  }
  // post_disclosure: 취득시 개별공시지가 필수
  if (asset.cbEra === "post_disclosure") {
    if (!parseAmount(asset.cbLandPricePerSqmAtAcq))
      return `${label}: 취득시 개별공시지가를 입력하세요.`;
  }
}
```

> **⑧ 동기화 확인**: API 변환에서 `buildCommercialBuildingValuation`이 `undefined`를 반환하는 조건(필수 필드 누락)과 validate가 차단하는 조건이 완전히 일치해야 함. UI 통과 → API fallback undefined → 엔진에 서브객체 미도달 패턴 차단.

---

## 11. 결과 카드 산식 표시 (⑦ 결과 카드)

### 11.1 환산취득가 산정 근거 표 (엑셀 B33~E41 재현)

**위치**: `components/calc/results/TransferTaxResultView.tsx` 또는 신규 `CommercialBuildingValuationDetailCard.tsx`

결과 객체의 `commercialBuildingValuationDetail` (엔진이 result에 추가해야 할 필드 — 엔진 시니어에게 결과 타입 확장 요청)에서 읽음.

```
┌──────────────────────────────────────────────────────────────────┐
│ 상업용건물·오피스텔 환산취득가 산정 근거 (소득세법 시행령 §164⑧, §176조의2②2호) │
├────────────────┬────────────┬─────────────┬──────────────────────┤
│ 구분           │ 토지       │ 건물        │ 합계                 │
├────────────────┼────────────┼─────────────┼──────────────────────┤
│ 양도시 기준시가│ 토지기준시가 (양도시 공시지가 × 대지면적) │ 건물기준시가 (양도시 ㎡당 기준시가 × 연면적) │ 합계                 │
│ 최초고시시      │ ...         │ ...          │ ...                  │
│ 취득시         │ ...         │ ...          │ ...                  │
├────────────────┼────────────┼─────────────┼──────────────────────┤
│ 양도시 호별총액 │ (colspan 3) 양도시 ㎡당 호별고시가 × 연면적     │
│ 최초고시 호별총액│ (colspan 3) 최초고시 ㎡당 호별고시가 × 연면적   │
│ 취득시 환산기준시가│ INT(최초고시 호별총액 × 취득시합계 / 최초고시시합계) — 시행령 §164⑧ │
│ 환산취득가 합계 │ INT(양도가액 × 취득시 환산기준시가 / 양도시 호별총액) — §176조의2②2호 │
│ 환산취득가(토지)│ INT(환산취득가합계 × 취득시 토지기준시가 / 취득시 환산기준시가) │
│ 환산취득가(건물)│ 환산취득가합계 − 환산취득가(토지)          │
└────────────────┴────────────┴─────────────┴──────────────────────┘
```

### 11.2 산식 표기 규칙 (plan §7-1 강제)

모든 산식에서 숫자 옆에 변수명 라벨 표시:

```
환산취득가 합계
= INT(양도가액 540,000,000 × 취득시 환산기준시가 X,XXX,XXX / 양도시 호별총액 X,XXX,XXX)
= 135,155,041
  ↳ 근거: 소득세법 §114⑦, 시행령 §176조의2②2호

개산공제 = INT(환산취득가 135,155,041 × 3%)
= 3,588,219
  ↳ 근거: 소득세법 §97②2호 + 시행령 §163⑥ (토지·건물 3%)

장기보유특별공제
  = INT(양도차익 401,256,740 × 30%)
  = 120,377,022
보유기간: 만 21년 2개월 (1년 미만 절사 → 21년, 소법 §95④)
장특공률: MIN(15, 21) × 2% = 30% (상한, 소법 §95② 표1 일반자산)
  ↳ 15년 이상이면 30% 상한 적용.

양도소득금액
  = 양도차익 − 장기보유특별공제
  = 401,256,740 − 120,377,022
  = 280,879,718

과세표준
  = 양도소득금액 − 양도소득기본공제 2,500,000
  = 280,879,718 − 2,500,000
  = 278,379,718  (절사 규정 없음 — 그대로 누진세율표 대입)

산출세액 (★ 양도연도 2022 적용 소법 §55 / §104 누진세율)
  - 적용 구간: 1.5억~3억, 세율 38%, 누진공제 19,940,000 (2021 시행 표)
  = INT(278,379,718 × 0.38 − 19,940,000)
  = 85,844,292
  ↳ 양도연도의 법정 세율표를 사용. 예제·엑셀 등 외부 산출값을 anchor로 따르지 않음.

지방소득세
  = calculateLocalIncomeTaxOnTransfer(278,379,718, 양도연도=2022)
  - 적용 구간: 1.5억~3억, 세율 3.8%, 누진공제 1,994,000 (지방세법 §103조의3)
  = INT(278,379,718 × 0.038 − 1,994,000)
  = 8,584,429
  ↳ 지방세법 §103조의3 양도소득분 누진세율표 직접 호출
  ↳ "산출세액 × 10%" 또는 "3.8% 단일세율" 가정 금지

총 납부세액 = 85,844,292 + 8,584,429 = 94,428,721
```

> **외부 자료와의 차이**: 예제 PDF/엑셀은 산출세액 86,384,292·지방세 8,638,429·총 95,022,721을 제시하나, 이는 누진공제 19,400,000(2020년 이전 표)을 적용한 결과로 추정. **본 프로젝트는 양도연도 정확 세율표 우선** — anchor·결과 화면 모두 법령 기준값으로 통일.

**금지 표기**:
- "보유 22년 → 30%" (절사 생략)
- **"장특공 = 양도소득금액 × 30%"** (양도차익 × 30%가 정확. 양도소득금액은 장특공 차감 **이후** 값)
- "지방소득세 3.8% 단일세율" / "산출세액 × 10%" (§103조의3 누진 직접 호출)
- "환산취득가 × 7%" (토지·건물 개산공제율은 3%)
- 변수 약어 (`P_F`, `Sum_A`) 직접 표기
- 과세표준 천원 절사 (소법·지방세법에 절사 규정 없음)

### 11.3 토지·건물 분리 결과 표시

```
┌─────────────────────────────────────────────────────┐
│ 구분             │ 토지       │ 건물       │ 합계    │
├─────────────────┼────────────┼────────────┼─────────┤
│ 양도가액         │ XXX        │ XXX        │ 540,000,000 │
│ 환산취득가       │ XX         │ XX         │ 135,155,041 │
│ 기타필요경비(개산공제) │ XX   │ XX         │ 3,588,219   │
│ 양도차익         │ XX         │ XX         │ 401,256,740 │
│ 장기보유특별공제 │ XX         │ XX         │ 120,377,022 │
│ 양도소득금액     │ XX         │ XX         │ 280,879,718 │
│ 산출세액(합산)   │ (colspan 3) │            │ 85,844,292  │
│ 지방소득세       │ (colspan 3) │            │ 8,584,429   │
│ 총 납부세액      │ (colspan 3) │            │ 94,428,721  │
└─────────────────┴────────────┴────────────┴─────────┘
```

---

## 12. 엔진 시니어 협업 요청 사항

### 12.1 엔진 신규 input 필드 (`TransferTaxInput`)

엔진 시니어가 다음을 `TransferTaxInput`에 추가해야 UI ⑭ route handler 매핑이 완성됨:

```typescript
/**
 * 상업용건물·오피스텔 환산취득가 계산 입력 (선택).
 * 제공 시 commercial-building-valuation.ts로 환산취득가 계산.
 * propertyType === "building" + useEstimatedAcquisition=true 시 의미 있음.
 */
commercialBuildingValuation?: CommercialBuildingValuationInput;
```

### 12.2 엔진 결과 필드 (`TransferTaxResult`) — 산식 표시용 echo

```typescript
/**
 * 상업용건물·오피스텔 환산취득가 산정 근거 상세 결과.
 * commercialBuildingValuation 제공 시만 포함.
 */
commercialBuildingValuationDetail?: CommercialBuildingValuationResult;
```

`CommercialBuildingValuationResult`에 최소 포함:
- `floorAreaTotal`: 연면적 (전용+공유, ㎡)
- `landStdAtTransfer`, `landStdAtFirst`, `landStdAtAcq`: 시점별 토지 기준시가 합계
- `buildingStdAtTransfer`, `buildingStdAtFirst`, `buildingStdAtAcq`: 시점별 건물 기준시가 합계
- `combinedStdAtTransfer`, `combinedStdAtFirst`, `combinedStdAtAcq`: 시점별 합계 기준시가
- `unitPriceTotalAtTransfer`: 양도시 호별총액
- `unitPriceTotalAtFirst`: 최초고시 호별총액
- `estimatedBasisAtAcq`: 취득시 환산기준시가 (§164⑧ 역환산 결과)
- `estimatedAcquisitionTotal`: 환산취득가 합계
- `estimatedAcquisitionLand`: 환산취득가(토지)
- `estimatedAcquisitionBuilding`: 환산취득가(건물)
- `estimatedDeductionTotal`: 개산공제 합계

---

## 13. 14개 동기화 지점 매트릭스

| # | 지점 | 파일 위치 | 신규 내용 | 상태 |
|---|---|---|---|---|
| ① | 폼 상태 타입 | `lib/stores/calc-wizard-asset.ts` → `AssetForm` | `assetKind` 확장 + `cb*` 12개 필드 추가 | Design 완료 |
| ② | initial value | `lib/stores/calc-wizard-asset-factory.ts` → `makeDefaultAsset()` | `cb*` 12개 필드 `""` 초기값 | Design 완료 |
| ③ | normalize fallback | `lib/stores/calc-wizard-asset-factory.ts` → `migrateAsset()` | `cb*` `??= ""` 보호 + `assetKind` fallback | Design 완료 |
| ④ | API 변환 | `lib/calc/transfer-tax-api.ts` + `transfer-tax-api-helpers.ts` | `buildCommercialBuildingValuation()` 헬퍼 + body.commercialBuildingValuation 추가 | Design 완료 |
| ⑤ | UI 입력 위젯 | `components/calc/transfer/CommercialBuildingBlock.tsx` (신규) + `CompanionAssetCard.tsx` | ASSET_KIND_OPTIONS 확장 + 위젯 트리 (§8 명세) | Design 완료 |
| ⑥ | 사이드바 합계 | `lib/stores/calc-wizard-store.ts` → `computeTransferSummary()` | `"commercial_building"` 라벨 케이스 추가 | Design 완료 |
| ⑦ | 결과 카드 | `components/calc/results/TransferTaxResultView.tsx` 또는 신규 `CommercialBuildingValuationDetailCard.tsx` | 환산취득가 근거 표 + 토지·건물 분리 표 | Design 완료 |
| ⑧ | Validation | `lib/calc/transfer-tax-validate.ts` → `validateStep()` step 0 | `assetKind === "commercial_building"` 분기 (§10 명세) | Design 완료 |
| ⑨ | Zod enum (메인) | `lib/api/transfer-tax-schema.ts` → `propertyBaseShape` | `commercialBuildingValuation: commercialBuildingValuationSchema.optional()` 추가 | Design 완료 |
| ⑩ | Zod enum (서브) | `lib/api/transfer-tax-schema-sub.ts` → `addPropertyRefines` | `commercialBuildingValuation` era별 필수 필드 검증 | Design 완료 |
| ⑪ | acquisitionDate fallback | `app/api/calc/transfer/route.ts` | commercial_building은 acquisitionDate 별도 분기 없음 — 기존 경로 유지 | 해당 없음 |
| ⑫ | Zod 객체 정의 | `lib/api/transfer-tax-schema.ts` (또는 sub) | `commercialBuildingValuationSchema` 신규 Zod 객체 정의 | Design 완료 |
| ⑬ | callTransferTaxAPI body spread | `lib/calc/transfer-tax-api.ts` → `body` 객체 | `commercialBuildingValuation: cbValuation` 추가 — TypeScript 미감지 영역 | Design 완료 |
| ⑭ | Route handler 엔진 input 매핑 | `app/api/calc/transfer/route.ts` | `commercialBuildingValuation` → 엔진 input 전달 | Design 완료 |

> **⑫⑬⑭ 주의**: TypeScript 정적 타입 검사 미감지 영역. 엔진 타입에 `commercialBuildingValuation?` 추가 후, Zod 스키마 정의(⑫), body spread(⑬), route 매핑(⑭) 순으로 grep 자가 점검 필수.

---

## 14. 사전 확인 정책 (작업 시작 전 점검)

다음 9개 패턴 점검 완료:

| # | 패턴 | 본 작업 해당 여부 | 처리 방식 |
|---|---|---|---|
| 1 | 엔진 input 필드 → AssetForm 미반영 | 해당 — cb* 12개 신규 필드 | § 3 AssetForm 명세에서 처리 |
| 2 | API 변환 미갱신 | 해당 — commercialBuildingValuation 서브객체 | § 6 API 변환 명세에서 처리 |
| 3 | initial value 누락 | 해당 | § 4 initial value 명세에서 처리 |
| 4 | normalize 누락 | 해당 | § 5 normalize fallback 명세에서 처리 |
| 5 | 결과 노출 누락 | 해당 | § 11 결과 카드 명세 + 엔진 시니어 echo 요청 |
| 6 | 산식 숫자 매핑 모호 | 해당 | § 11.2 산식 표기 규칙에서 변수명 라벨 명시 |
| 7 | 활성화 조건 누락 | 해당 | assetKind === "commercial_building" 조건부 렌더 |
| 8 | 토글 가시성 미준수 | 해당 | ToggleCard(amber) + RadioCardGroup(amber) 사용 |
| 9 | 시점별 분기 누락 | 해당 — pre/post_disclosure 분기 | cbEra 기반 조건부 표시 명세 |

3대 핵심 정책 점검:
- [x] useEffect → store 미러링 금지: cb* 필드는 onChange 직접 처리, 자동 동기화 없음
- [x] 자동 안분 fallback 금지: cbEra 미선택·면적·기준시가 미입력 시 validation 오류로 차단
- [x] Validation 8번째 동기화: API fallback(buildCommercialBuildingValuation returns undefined) 조건과 validate 차단 조건 일치 명시 (§ 10)

---

## 15. Definition of Done 셀프 체크 (Do 단계 종료 시)

- [ ] 케이스 매트릭스 표 3행(C-01·C-02·C-03) enumerate 완료 + 추가 경계 케이스
- [ ] anchor ≥ 15개 (산출세액 **85,844,292** / 지방세 **8,584,429** / 총 **94,428,721** — 양도연도 2022 적용 §55·§103조의3 정확 세율, 보유기간 만 21년 2개월 절사 검증)
- [ ] 14개 동기화 지점 모두 (특히 ⑫⑬⑭ grep 자가 점검)
- [ ] `npx tsc --noEmit` 0건
- [ ] `npx vitest run __tests__/tax-engine/transfer-tax/` 612+ 통과 + 신규 anchor 통과
- [ ] 브라우저 수동: 폼 → 계산 → 결과, Network body에 `commercialBuildingValuation` 포함 확인
- [ ] 결과 화면 산식 라벨: "지방세법 §103조의3 양도소득분 누진세율" (3.8% 단일세율 금지)
- [ ] 결과 화면 산식 라벨: "만 21년 2개월 (1년 미만 절사 → 21년)" 형식
- [ ] placeholder 숫자 예시 없음 — FieldCard hint prop으로 대체
- [ ] OFF 상태 ToggleCard tone 배경(bg-amber-50/70) 유지 확인
