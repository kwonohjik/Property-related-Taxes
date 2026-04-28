# Design: 양도소득세 — 상속 부동산 취득 실거래가 특례 (의제취득일 분기)

**Plan**: `docs/01-plan/features/transfer-tax-inherited-acquisition.plan.md`
**작성일**: 2026-04-28
**상태**: Design 단계 — 함수 시그니처·데이터 흐름·UI props·테스트 매트릭스 확정

## 1. 파일 구조

```
lib/tax-engine/
├── inheritance-acquisition-price.ts          (수정) — case A/B 분기 추가, 104→약 280줄
├── types/inheritance-acquisition.types.ts    (수정) — 입력 7필드·출력 1필드 확장
├── types/transfer.types.ts                   (수정) — TransferTaxInput.inheritedAcquisition?
├── transfer-tax.ts                           (수정) — STEP 0.45 신설
├── legal-codes/transfer.ts                   (수정) — 4개 상수 추가
├── data/cpi-rates.ts                         (신규) — 연도별 CPI 정적 테이블
└── inheritance-acquisition-helpers.ts        (신규, 선택) — case A 환산·CPI 계산 helper

app/api/calc/transfer-tax/
└── route.ts                                  (수정) — inheritedAcquisitionSchema 추가

lib/api/
└── transfer-tax-schema.ts                    (수정 또는 위 route 내 정의)

lib/stores/
├── calc-wizard-asset.ts                      (수정) — AssetForm 신규 필드 11개
└── calc-wizard-migration.ts                  (수정) — migrateLegacyForm 분기

components/calc/transfer/
├── CompanionAcqInheritanceBlock.tsx          (수정) — 분기 + 입력 필드
├── InheritanceValuationPreviewCard.tsx       (신규) — 결과 미리보기 카드
└── inheritance/
    ├── PreDeemedInputs.tsx                   (신규) — case A 전용 입력
    └── PostDeemedInputs.tsx                  (신규) — case B 전용 입력

__tests__/tax-engine/
├── inheritance-acquisition-price.test.ts     (수정) — 기존 5케이스 + 신규 12케이스
├── transfer-tax/inherited-acquisition.test.ts (신규) — e2e 통합 테스트
└── _helpers/inheritance-fixture.ts           (신규) — 케이스 픽스처
```

> **수정 우선 / 신규 최소** 원칙. 800줄 정책에 따라 case A/B helper가 단일 파일에서 임계 도달 시 `inheritance-acquisition-helpers.ts`로 분리.

## 2. 데이터 모델

### 2-A. 입력 타입 — `InheritanceAcquisitionInput` (확장)

```ts
// lib/tax-engine/types/inheritance-acquisition.types.ts
export const DEEMED_ACQUISITION_DATE = new Date("1985-01-01");

export type InheritanceAcquisitionMethod =
  | "market_value"          // 매매사례 (시가)
  | "appraisal"             // 감정평가
  | "auction_public_sale"   // 수용·경매·공매 (신규)
  | "similar_sale"          // 유사매매사례 (신규)
  | "supplementary"         // 보충적평가
  | "pre_deemed_max";       // 의제취득일 전 — max(환산, 실가×CPI) (신규)

export interface InheritanceAcquisitionInput {
  /** 상속개시일 (의제취득일 분기 기준) */
  inheritanceDate: Date;

  /** 자산 종류 */
  assetKind: InheritanceAssetKind; // "land" | "house_individual" | "house_apart"

  // ── 보조 입력 (보충적평가용, case B 보조계산) ──
  landAreaM2?: number;
  publishedValueAtInheritance?: number; // 보충적평가 자동 산출 시
  marketValue?: number;
  appraisalAverage?: number;

  // ── 케이스 B (post-deemed): 상속세 신고가액 ──
  reportedValue?: number;
  reportedMethod?: InheritanceAcquisitionMethod;

  // ── 케이스 A (pre-deemed): 환산 + 물가상승률 ──
  decedentAcquisitionDate?: Date;
  decedentActualPrice?: number;
  transferDate?: Date;
  transferPrice?: number;
  standardPriceAtDeemedDate?: number;
  standardPriceAtTransfer?: number;
}
```

### 2-B. 출력 타입 — `InheritanceAcquisitionResult` (확장)

```ts
export interface InheritanceAcquisitionResult {
  acquisitionPrice: number;
  method: InheritanceAcquisitionMethod;
  legalBasis: string;
  formula: string;

  /** case A 전용: 환산 vs 실가×CPI 비교 내역 */
  preDeemedBreakdown?: {
    convertedAmount: number;             // 환산취득가
    inflationAdjustedAmount: number | null; // 실가 × CPI비율 (null = 미입증)
    selectedMethod: "converted" | "inflation_adjusted";
    cpiFromYear: number;
    cpiToYear: number;
    cpiRatio: number;                    // 양도시점 ÷ 취득시점
  };

  /** 경고 (CPI 범위 외, 입력 누락 fallback 등) */
  warnings?: string[];
}
```

### 2-C. `AssetForm` 신규 필드 (`calc-wizard-asset.ts`)

```ts
// 모두 optional + 빈 문자열/false/null 기본값 (마이그레이션 호환)
inheritanceMode?: "pre-deemed" | "post-deemed" | null;     // 자동 분기 결과 (UI read-only)
inheritanceStartDate?: string;                              // ISO yyyy-mm-dd
decedentAcquisitionDate?: string;                           // 기존 필드 재사용 가능
decedentAcquisitionPrice?: string;                          // CurrencyInput 입력값(string)
hasDecedentActualPrice?: boolean;                           // 입증 가능 여부

// case B
inheritanceReportedValue?: string;
inheritanceValuationMethod?: InheritanceAcquisitionMethod;  // 5종 enum
inheritanceValuationEvidence?: string;
useSupplementaryHelper?: boolean;
supplementaryLandArea?: string;
supplementaryLandUnitPrice?: string;
supplementaryBuildingValue?: string;
```

> **하위호환 보장**: 모든 신규 필드 optional. 기존 sessionStorage에서 로드된 폼은 자동으로 `inheritanceMode = null`로 들어옴 → UI에서 분기 미적용 = 기존 동작 그대로.

## 3. Pure Engine — `inheritance-acquisition-price.ts`

### 3-A. 진입 분기

```ts
export function calculateInheritanceAcquisitionPrice(
  input: InheritanceAcquisitionInput,
): InheritanceAcquisitionResult {
  validateInput(input);

  const deemed = DEEMED_ACQUISITION_DATE;
  const isPreDeemed =
    input.inheritanceDate.getTime() < deemed.getTime();

  if (isPreDeemed) return calcPreDeemed(input);
  return calcPostDeemed(input);
}
```

### 3-B. case A — `calcPreDeemed()`

```ts
function calcPreDeemed(input: InheritanceAcquisitionInput): InheritanceAcquisitionResult {
  const warnings: string[] = [];

  // 1. 환산취득가 (입력 누락 시 0 처리)
  const converted =
    input.transferPrice && input.standardPriceAtDeemedDate && input.standardPriceAtTransfer
      ? calculateEstimatedAcquisitionPrice(
          input.transferPrice,
          input.standardPriceAtDeemedDate,
          input.standardPriceAtTransfer,
        )
      : 0;

  // 2. 실가 × CPI 환산 (피상속인 실가 입증된 경우만)
  let inflationAdjusted: number | null = null;
  let cpiFromYear = 0, cpiToYear = 0, cpiRatio = 1;

  if (
    input.decedentActualPrice && input.decedentActualPrice > 0 &&
    input.decedentAcquisitionDate && input.transferDate
  ) {
    cpiFromYear = input.decedentAcquisitionDate.getFullYear();
    cpiToYear = input.transferDate.getFullYear();
    cpiRatio = getCpiRatio(input.decedentAcquisitionDate, input.transferDate);
    if (cpiRatio === 1 && (cpiFromYear < CPI_MIN_YEAR || cpiToYear > CPI_MAX_YEAR)) {
      warnings.push(`CPI 데이터 범위 외 (${cpiFromYear}-${cpiToYear})`);
    }
    inflationAdjusted = Math.floor(input.decedentActualPrice * cpiRatio);
  }

  // 3. max 선택
  const isInflationWin =
    inflationAdjusted !== null && inflationAdjusted > converted;
  const acquisitionPrice = Math.max(converted, inflationAdjusted ?? 0);

  // 4. 경고 — 두 산정 모두 0인 경우
  if (acquisitionPrice === 0) {
    warnings.push("환산·물가상승률 산정 정보가 모두 부족합니다");
  }

  return {
    acquisitionPrice,
    method: "pre_deemed_max",
    legalBasis: `${TRANSFER.INHERITED_BEFORE_DEEMED} · ${TRANSFER.LAND_VALUATION_BY_RATIO}`,
    formula: buildPreDeemedFormula(converted, inflationAdjusted, isInflationWin, cpiRatio),
    preDeemedBreakdown: {
      convertedAmount: converted,
      inflationAdjustedAmount: inflationAdjusted,
      selectedMethod: isInflationWin ? "inflation_adjusted" : "converted",
      cpiFromYear,
      cpiToYear,
      cpiRatio,
    },
    warnings: warnings.length > 0 ? warnings : undefined,
  };
}
```

**산식 표시 (한국어, 메모리 `feedback_result_view_korean_formula` 준수)**:
```
환산취득가:        920,000,000원 × (의제취득일 기준시가) ÷ (양도시 기준시가) = 18,400,000원
취득실가×물가상승률: 5,000,000원 × 25.0배 = 125,000,000원
→ 적용 (큰 금액):    125,000,000원
```

### 3-C. case B — `calcPostDeemed()`

```ts
function calcPostDeemed(input: InheritanceAcquisitionInput): InheritanceAcquisitionResult {
  // 신고가액 + 신고방법이 모두 입력된 경우
  if (input.reportedValue && input.reportedValue > 0 && input.reportedMethod) {
    return {
      acquisitionPrice: Math.floor(input.reportedValue),
      method: input.reportedMethod,
      legalBasis: postDeemedLegalBasis(input.reportedMethod),
      formula: postDeemedFormula(input.reportedMethod, input.reportedValue),
    };
  }

  // 신고가액 미입력 — 기존 보충/시가/감정 폴백 (하위호환)
  return legacyPostDeemedFallback(input);
}

function postDeemedLegalBasis(m: InheritanceAcquisitionMethod): string {
  switch (m) {
    case "market_value": return `${TRANSFER.INHERITED_AFTER_DEEMED} · 상증법 §60 ①`;
    case "appraisal": return `${TRANSFER.INHERITED_AFTER_DEEMED} · 상증법 §60 ⑤`;
    case "auction_public_sale": return `${TRANSFER.INHERITED_AFTER_DEEMED} · 상증법 §60 ② (수용·경매·공매)`;
    case "similar_sale": return `${TRANSFER.INHERITED_AFTER_DEEMED} · 상증법 시행령 §49 (유사매매)`;
    case "supplementary": return `${TRANSFER.INHERITED_AFTER_DEEMED} · 상증법 §61`;
    default: return TRANSFER.INHERITED_AFTER_DEEMED;
  }
}
```

**`legacyPostDeemedFallback()`**: 기존 우선순위(시가 → 감정 → 보충) 그대로. 기존 테스트 5건 그대로 통과해야 함.

### 3-D. 입력 검증 — `validateInput()`

| 조건 | 처리 |
|---|---|
| `inheritanceDate` 미입력 | throw `"inheritanceDate가 필수입니다"` |
| case A + `standardPriceAtTransfer === 0` | 환산 = 0, warnings에 기록, throw 하지 않음 |
| case A + decedent 입력 일관성 (`decedentActualPrice` 있는데 `decedentAcquisitionDate` 없음) | throw `"피상속인 실가 입증 시 취득일이 필수입니다"` |
| case B + `reportedValue < 0` | throw |
| case B + `reportedMethod` invalid enum | throw |
| `assetKind === "land"`인 case B에서 `useSupplementaryHelper`인데 `landAreaM2`/`publishedValueAtInheritance` 누락 | throw `"보충적평가 보조계산은 면적·단가가 필수입니다"` |

## 4. CPI 데이터 — `data/cpi-rates.ts`

```ts
/**
 * 연도별 소비자물가지수(CPI) 정적 테이블.
 * 출처: 통계청 KOSIS, 기준년도 2020 = 100.
 * 의제취득일 전 상속(소령 §176조의2 ④) 물가상승률 환산용.
 *
 * 주의:
 * - 본 테이블은 "연평균" 기준. 월별 정밀화는 Phase 2 검토.
 * - 1965년 이전·당해 발표 전(N+1년 5월) 데이터는 누락.
 */
export const CPI_MIN_YEAR = 1965;
export const CPI_MAX_YEAR = 2026; // 발표 시 매년 갱신 (2025년치는 2026.5월 확정)

export interface CpiEntry {
  year: number;
  annual: number; // 2020 = 100
}

export const CPI_TABLE: ReadonlyArray<CpiEntry> = Object.freeze([
  { year: 1965, annual: 4.580 },
  // ... 1965~2026 (약 62 행)
  { year: 2020, annual: 100.000 },
  { year: 2026, annual: 116.500 }, // placeholder, 실제 값으로 채울 것
]);

export function getCpiAnnual(year: number): number | null {
  const e = CPI_TABLE.find((x) => x.year === year);
  return e ? e.annual : null;
}

export function getCpiRatio(fromDate: Date, toDate: Date): number {
  const from = getCpiAnnual(fromDate.getFullYear());
  const to = getCpiAnnual(toDate.getFullYear());
  if (from == null || to == null || from === 0) return 1;
  return to / from;
}
```

> 실제 CPI 값은 별도 시딩 PR에서 통계청 KOSIS 데이터로 채움. 본 design 단계에서는 인터페이스만 확정.

## 5. transfer-tax.ts STEP 0.45 통합

```ts
// transfer-tax.ts: STEP 0.4 (pre1990Land) 직후, STEP 0.5 직전.
// ── STEP 0.45: 상속 부동산 취득가액 의제 (소령 §176의2④·§163⑨) ──
let inheritedAcquisitionResult: InheritanceAcquisitionResult | null = null;
if (rawInput.inheritedAcquisition) {
  inheritedAcquisitionResult = calculateInheritanceAcquisitionPrice(
    rawInput.inheritedAcquisition,
  );
  input = {
    ...input,
    acquisitionPrice: inheritedAcquisitionResult.acquisitionPrice,
    // case A에서 환산이 채택된 경우, 이후 단계의 환산 흐름과 일치시키기 위해
    // useEstimatedAcquisition + standardPriceAtAcquisition을 주입한다.
    ...(inheritedAcquisitionResult.preDeemedBreakdown?.selectedMethod === "converted" && {
      useEstimatedAcquisition: true,
      acquisitionMethod: "estimated" as const,
      standardPriceAtAcquisition: rawInput.inheritedAcquisition.standardPriceAtDeemedDate ?? 0,
      standardPriceAtTransfer: rawInput.inheritedAcquisition.standardPriceAtTransfer ?? 0,
    }),
  };

  steps.push({
    id: "inherited-acquisition",
    label: "상속 취득가액 의제",
    legalBasis: inheritedAcquisitionResult.legalBasis,
    formula: inheritedAcquisitionResult.formula,
    output: inheritedAcquisitionResult.acquisitionPrice,
  });
}
```

**전후 단계 의존성**:
- STEP 0.4 `pre1990LandResult`가 산출한 `standardPriceAtAcquisition`은 의제취득일(1985.1.1.) 시점의 토지 기준시가에 해당. 본 STEP 0.45에서 `standardPriceAtDeemedDate`로 그대로 전달 가능 → 사용자가 두 입력을 따로 안 해도 됨.
- 결합 시 `transfer-tax.ts` 내부:
  ```ts
  if (pre1990LandResult && rawInput.inheritedAcquisition?.assetKind === "land") {
    rawInput = {
      ...rawInput,
      inheritedAcquisition: {
        ...rawInput.inheritedAcquisition,
        standardPriceAtDeemedDate:
          rawInput.inheritedAcquisition.standardPriceAtDeemedDate
          ?? pre1990LandResult.standardPriceAtAcquisition,
      },
    };
  }
  ```

## 6. 법령 코드 상수 — `legal-codes/transfer.ts`

```ts
export const TRANSFER = {
  // ... 기존
  INHERITED_BEFORE_DEEMED: "소득세법 시행령 §176조의2 ④",
  INHERITED_AFTER_DEEMED: "소득세법 시행령 §163 ⑨",
  DEEMED_ACQUISITION_DATE_BASIS: "소득세법 부칙 1985.1.1. 개정",
  INHERITANCE_VALUATION_PRINCIPLE: "상증법 §60 · §61",
};
```

`LawArticleModal`에서 위 키로 조회되도록 `/api/law/article` 매핑 테이블 갱신.

## 7. API 스키마 — `app/api/calc/transfer-tax/route.ts`

```ts
const inheritedAcquisitionSchema = z.discriminatedUnion("mode", [
  // case A
  z.object({
    mode: z.literal("pre-deemed"),
    inheritanceStartDate: z.string().date(),
    assetKind: z.enum(["land", "house_individual", "house_apart"]),

    // 환산 보조
    standardPriceAtDeemedDate: z.number().int().nonnegative().optional(),
    standardPriceAtTransfer: z.number().int().positive().optional(),

    // 실가 × CPI 보조
    hasDecedentActualPrice: z.boolean().default(false),
    decedentAcquisitionDate: z.string().date().optional(),
    decedentActualPrice: z.number().int().nonnegative().optional(),
  }).refine(
    (v) => !v.hasDecedentActualPrice || (v.decedentAcquisitionDate && v.decedentActualPrice && v.decedentActualPrice > 0),
    { message: "피상속인 실가 입증 시 취득일·취득가가 필수입니다" },
  ),

  // case B
  z.object({
    mode: z.literal("post-deemed"),
    inheritanceStartDate: z.string().date(),
    assetKind: z.enum(["land", "house_individual", "house_apart"]),

    reportedValue: z.number().int().nonnegative(),
    reportedMethod: z.enum([
      "market_value", "appraisal", "auction_public_sale",
      "similar_sale", "supplementary",
    ]),
    evidenceMemo: z.string().max(200).optional(),

    // 보충적평가 보조계산
    useSupplementaryHelper: z.boolean().default(false),
    landAreaM2: z.number().nonnegative().optional(),
    publishedValueAtInheritance: z.number().int().nonnegative().optional(),
    buildingPublishedValue: z.number().int().nonnegative().optional(),
  }),
]);
```

**자산 → 엔진 매핑** (route.ts 내):
```ts
function buildInheritedAcquisition(
  asset: AssetForm,
  transferDate: Date,
  transferPrice: number,
): InheritanceAcquisitionInput | undefined {
  if (!asset.inheritanceStartDate) return undefined;
  const inheritanceDate = new Date(asset.inheritanceStartDate);
  const isPreDeemed = inheritanceDate.getTime() < DEEMED_ACQUISITION_DATE.getTime();

  if (isPreDeemed) {
    return {
      inheritanceDate,
      assetKind: asset.assetKind === "land" ? "land" : "house_individual",
      standardPriceAtDeemedDate: parseInt(asset.standardPriceAtDeemedDate ?? "0", 10) || undefined,
      standardPriceAtTransfer: parseInt(asset.standardPriceAtTransfer ?? "0", 10) || undefined,
      transferDate,
      transferPrice,
      decedentAcquisitionDate: asset.hasDecedentActualPrice && asset.decedentAcquisitionDate
        ? new Date(asset.decedentAcquisitionDate)
        : undefined,
      decedentActualPrice: asset.hasDecedentActualPrice && asset.decedentAcquisitionPrice
        ? parseInt(asset.decedentAcquisitionPrice, 10)
        : undefined,
    };
  }

  // post-deemed
  return {
    inheritanceDate,
    assetKind: asset.assetKind === "land" ? "land" : "house_individual",
    reportedValue: parseInt(asset.inheritanceReportedValue ?? "0", 10),
    reportedMethod: asset.inheritanceValuationMethod,
  };
}
```

## 8. UI 설계

### 8-A. 데이터 흐름

```
┌──────────────────────────────────────────────────────────┐
│  Step1 (자산정보)                                         │
│    AssetForm.acquisitionCause === "inheritance" 선택      │
│       ↓                                                   │
│  CompanionAcqInheritanceBlock                            │
│       ├─ 상속개시일 입력 (DateInput)                      │
│       │     └─ onChange → inheritanceMode 자동 결정      │
│       │                                                   │
│       ├─ inheritanceMode === "pre-deemed"                │
│       │     └─ <PreDeemedInputs />                       │
│       │           ├─ 의제취득일 기준시가 입력            │
│       │           ├─ 양도시 기준시가 입력                │
│       │           ├─ [☑] 피상속인 실가 입증              │
│       │           │     └─ 취득일 + 취득가 입력          │
│       │           └─ <InheritanceValuationPreviewCard /> │
│       │                                                   │
│       └─ inheritanceMode === "post-deemed"               │
│             └─ <PostDeemedInputs />                      │
│                   ├─ 평가방법 Select (5종)                │
│                   ├─ 신고가액 CurrencyInput              │
│                   ├─ 평가 근거 메모 (선택)                │
│                   ├─ [☑] 보충적평가 보조계산 (조건부)    │
│                   │     └─ 토지 면적·단가 / 건물 가격    │
│                   └─ <InheritanceValuationPreviewCard /> │
└──────────────────────────────────────────────────────────┘
```

### 8-B. `PreDeemedInputs` props

```ts
interface PreDeemedInputsProps {
  asset: AssetForm;
  onChange: (patch: Partial<AssetForm>) => void;
  // 1990 토지 환산 결과(있다면) 자동 주입
  pre1990LandStandardPrice?: number;
}
```

**필드 배치 순서 (계산 로직 순서 = UI 순서)**:
1. 의제취득일(1985.1.1.) 시점 기준시가 — 토지/건물별 입력
   - 토지: Vworld API + 1990.8.30. 환산 결과 자동 주입 버튼
2. 양도시 기준시가 (자산정보 기존 필드와 동일하면 자동 동기화)
3. 피상속인 실가 입증 토글
4. (토글 ON 시) 피상속인 취득일 + 취득가
5. → 미리보기 카드 자동 업데이트

### 8-C. `PostDeemedInputs` props

```ts
interface PostDeemedInputsProps {
  asset: AssetForm;
  onChange: (patch: Partial<AssetForm>) => void;
}
```

**필드 배치 순서**:
1. 상속세 신고 시 평가방법 Select (5종)
2. 신고가액 CurrencyInput
3. 평가 근거 메모 (TextInput, optional)
4. 보충적평가 선택 시: [☑] 보조계산 사용 토글
   - ON: 토지 면적·개별공시지가 + 건물 공시가격 입력 → 자동 합계 → 신고가액 필드 동기화 (사용자가 수정 가능)

### 8-D. `InheritanceValuationPreviewCard` props

```ts
interface InheritanceValuationPreviewCardProps {
  mode: "pre-deemed" | "post-deemed";
  preDeemedPreview?: {
    converted: number;
    inflationAdjusted: number | null;
    cpiRatio: number;
    selected: "converted" | "inflation_adjusted";
  };
  postDeemedPreview?: {
    method: InheritanceAcquisitionMethod;
    reportedValue: number;
  };
  legalArticleKey: keyof typeof TRANSFER; // FieldCard trailing에 LawArticleModal 배지
}
```

**산식 표기 규칙**:
- 한국어 풀어쓰기 (`floor`·`P_F` 같은 약어 금지).
- 중요도 차등 highlight: 최종 적용 금액은 강조, 후보는 회색.
- 중간 산술 결과는 표시 X (양도가 × 비율 결과만 표기).

### 8-E. `WizardSidebar` 합계

| 표시 항목 | 시점 | 계산 |
|---|---|---|
| 상속 취득가액 | API 응답 후 | `result.steps.find(s => s.id === "inherited-acquisition").output` |
| 환산 후보 (case A) | API 응답 후 | `preDeemedBreakdown.convertedAmount` |
| 실가×CPI 후보 (case A) | 클라이언트 즉시 | `decedentActualPrice * getCpiRatio()` (frontend도 cpi-rates를 import) |
| 신고가액 (case B) | 사용자 입력 즉시 | `inheritanceReportedValue` |

## 9. 계산 흐름 다이어그램

```
[사용자 입력 — Step1 자산]
     │
     ├─ inheritanceStartDate
     │      ↓ (클라이언트)
     │  inheritanceMode 분기
     │      ↓
     ├─ case A 입력 / case B 입력
     │
     └─ "다음" → POST /api/calc/transfer-tax
                       │
                       │ zod 검증
                       │
                       ↓
                  buildEngineInput()
                       │
                       │ inheritedAcquisition 빌드
                       │
                       ↓
                  calculateTransferTax()
                       │
                       ├─ STEP 0.4 pre1990Land  ───┐
                       │                            │ standardPrice 주입
                       ├─ STEP 0.45 inherited      ←┘
                       │      └─ calculateInheritanceAcquisitionPrice()
                       │            ├─ case A: max(converted, inflationAdjusted)
                       │            └─ case B: reportedValue or fallback
                       │                  → acquisitionPrice 결정
                       │
                       ├─ STEP 0.5 multi-house
                       ├─ STEP 0.6 NBL
                       ├─ STEP 1 비과세
                       ├─ STEP 2 양도차익 (acquisitionPrice 사용)
                       ├─ STEP 3 장특공제
                       ├─ STEP 4 누진세율
                       ├─ STEP 5 중과
                       ├─ STEP 6 감면
                       └─ STEP 7 부가세 (지방소득세 등)
                              ↓
                       TransferTaxResult
                              ↓
                       [클라이언트 결과 화면]
                              └─ InheritanceValuationPreviewCard
                                    + 산출세액 + 사이드바 합계
```

## 10. 테스트 매트릭스

### 10-A. `inheritance-acquisition-price.test.ts` 확장

| ID | 케이스 | 입력 핵심 | 기대값 |
|---|---|---|---|
| L-1 | 기존 보충 (토지) | landArea + 개별공시지가 | 기존 anchor 유지 |
| L-2 | 기존 보충 (개별주택) | 공시가격 | 기존 anchor 유지 |
| L-3 | 기존 시가 우선 | marketValue 5억 | 5억 |
| L-4 | 기존 감정평가 | appraisalAverage 4.8억 | 4.8억 |
| L-5 | (기존 5번째) | (기존) | (기존) |
| **A-1** | case A 환산만 | converted=18.4억 / inflation 미입력 | 18.4억, method=`pre_deemed_max`, selected=`converted` |
| **A-2** | case A 실가×CPI 우세 | converted=18.4억 / inflation=25억 | 25억, selected=`inflation_adjusted` |
| **A-3** | case A 환산 우세 | converted=30억 / inflation=22억 | 30억, selected=`converted` |
| **A-4** | case A 양쪽 0 | 입력 모두 누락 | acquisitionPrice=0, warnings 비어있지 않음 |
| **A-5** | case A standardPriceAtTransfer=0 | 환산 분모 0 | converted=0, throw 하지 않음, inflation으로 fallback |
| **A-6** | PDF 시나리오 | 1983.7.26. 상속 / 2023.2.16. 양도 920백만 / 토지 184.2㎡ / 1990 등급 218 / 1990.1.1. 공시 1,100,000 | 책 본문값 원 단위 anchor (별도 검증) |
| **A-7** | CPI 범위 외 | decedentAcquisitionDate=1960 | warnings에 "CPI 데이터 범위 외" |
| **A-8** | decedent 일관성 검증 | actualPrice 있고 acquisitionDate 없음 | throw |
| **B-1** | case B 시가 | reportedMethod=market_value, value=5억 | 5억, method=`market_value`, legalBasis에 §60 ① |
| **B-2** | case B 감정 | appraisal, 4.8억 | 4.8억, §60 ⑤ |
| **B-3** | case B 보충적평가 | supplementary, 1,069,096,800원 | 1,069,096,800, §61 |
| **B-4** | case B 수용·경매 | auction_public_sale, 6억 | 6억, §60 ② |
| **B-5** | case B 유사매매 | similar_sale, 5.5억 | 5.5억, 시행령 §49 |
| **B-6** | case B fallback | reportedValue 미입력, marketValue=5억 | 기존 폴백 → 5억, method=`market_value` |
| **D-1** | 경계 1984-12-31 | inheritanceDate=1984-12-31 | case A 분기 |
| **D-2** | 경계 1985-01-01 | inheritanceDate=1985-01-01 | case B 분기 |

### 10-B. `transfer-tax/inherited-acquisition.test.ts` (e2e)

| ID | 케이스 | 검증 |
|---|---|---|
| E-1 | case A + 1990 토지 결합 | pre1990LandResult.standardPriceAtAcquisition가 inheritedAcquisition.standardPriceAtDeemedDate로 자동 주입되는지 |
| E-2 | case A 환산 채택 → useEstimatedAcquisition=true 흐름 | STEP 0.45 후 STEP 2(양도차익)에서 동일 acquisitionPrice 사용 |
| E-3 | case B 보충적평가 선택 | 최종 산출세액까지 계산되며 결과의 `steps`에 inherited-acquisition step 포함 |
| E-4 | PDF 시나리오 e2e | 산출세액 anchor (책 본문 결과값 매칭) |

### 10-C. anchor 테스트 정책

`feedback_pdf_example_test_anchoring.md` 메모리 적용. PDF 사례(첨부 이미지)는 원 단위 `toBe()` 고정 — 회귀 시 즉시 알람.

## 11. 마이그레이션 — `calc-wizard-migration.ts`

```ts
export function migrateLegacyForm(legacy, defaultFormData) {
  // ... 기존 로직 ...

  for (const asset of primaryAsset.companionAssets ?? [primaryAsset]) {
    if (asset.acquisitionCause === "inheritance") {
      // 신규 필드 기본값 주입 (undefined가 아닌 명시적 빈 값으로)
      asset.inheritanceMode ??= null;
      asset.inheritanceStartDate ??= "";
      asset.hasDecedentActualPrice ??= false;
      asset.decedentAcquisitionPrice ??= "";
      asset.inheritanceReportedValue ??= "";
      asset.inheritanceValuationMethod ??= undefined;
      asset.inheritanceValuationEvidence ??= "";
      asset.useSupplementaryHelper ??= false;
      asset.supplementaryLandArea ??= "";
      asset.supplementaryLandUnitPrice ??= "";
      asset.supplementaryBuildingValue ??= "";

      // 기존 사용자가 보충적평가 단가 입력해뒀던 경우 → case B / supplementary로 자동 분류
      if (asset.publishedValueAtInheritance && !asset.inheritanceValuationMethod) {
        asset.inheritanceValuationMethod = "supplementary";
        asset.inheritanceMode = null; // 자동 분기를 UI에서 다시 결정
      }
    }
  }
}
```

## 12. 800줄 정책 점검

| 파일 | 현재 | 변경 후 예상 | 정책 |
|---|---|---|---|
| `inheritance-acquisition-price.ts` | 104 | ~280 | OK (≤ 800) |
| `transfer-tax.ts` | 759 | ~795 | 임계 — 추가 시 helper 분리 검토 |
| `CompanionAcqInheritanceBlock.tsx` | (확인 필요) | +200 예상 | 800 임박 시 `inheritance/PreDeemedInputs.tsx` + `PostDeemedInputs.tsx` 분리 (이미 design에 반영) |

`transfer-tax.ts`가 위험 — STEP 0.45 추가 시 STEP 0.4 결합 로직(약 30줄)까지 합쳐 임계. 동시에 helper로 분리:

```
inheritance-acquisition-helpers.ts (신규)
├─ resolveInheritedAcquisitionInput(rawInput, pre1990Result): InheritanceAcquisitionInput | undefined
└─ buildInheritedAcquisitionStep(result): CalculationStep
```

→ `transfer-tax.ts`의 STEP 0.45는 5줄 이내로 유지.

## 13. 의존성 그래프 (단방향 보장)

```
transfer-tax.ts
    ↓ (import)
inheritance-acquisition-price.ts
    ↓ (import)
data/cpi-rates.ts
legal-codes/transfer.ts
types/inheritance-acquisition.types.ts
```

**금지**: `inheritance-acquisition-price.ts → transfer-tax.ts` (순환 금지).
**확장 시 검사 명령**:
```bash
grep -r "from.*transfer-tax['\"]" lib/tax-engine/inheritance-acquisition-price.ts
# 결과 비어있어야 함
```

## 14. 산출물 체크리스트 (Design 단계 완료 기준)

- [x] 입력 타입 시그니처 확정 (§2-A)
- [x] 출력 타입 시그니처 확정 (§2-B)
- [x] AssetForm 신규 필드 11개 정의 (§2-C)
- [x] 진입 분기·case A·case B 의사코드 (§3)
- [x] CPI 데이터 인터페이스 (§4)
- [x] STEP 0.45 통합 의사코드 (§5)
- [x] 법령 상수 (§6)
- [x] zod 스키마 (§7)
- [x] UI 컴포넌트 props · 데이터 흐름 (§8)
- [x] e2e 다이어그램 (§9)
- [x] 테스트 매트릭스 (§10)
- [x] 마이그레이션 시나리오 (§11)
- [x] 800줄 정책 점검 (§12)
- [x] 단방향 의존성 (§13)

## 15. 다음 단계

1. **P1 (데이터·상수)**: `cpi-rates.ts` 신규 + `legal-codes/transfer.ts` 4상수 추가. CPI 실측치는 별도 시딩 task.
2. **P2 (타입)**: `inheritance-acquisition.types.ts` + `transfer.types.ts` 확장.
3. **P3 (엔진)**: `inheritance-acquisition-price.ts` case A/B 분기 + `transfer-tax.ts` STEP 0.45 (+ 필요 시 helper 분리).
4. **P4 (테스트)**: §10 매트릭스 모두 작성, anchor 통과.
5. **P5 (API)**: `route.ts` zod + 매핑.
6. **P6 (UI)**: `CompanionAcqInheritanceBlock.tsx` 확장 + 신규 컴포넌트 3개.
7. **P7 (Store/Migration)**: `AssetForm` 필드 + `migrateLegacyForm` 분기.
8. **P8 (검증)**: gap-detector 90%+, `transfer-tax-qa` 회귀.

각 Phase는 별도 commit. P3·P4는 페어로 진행(엔진 작성 ↔ anchor 추가) 권장.
