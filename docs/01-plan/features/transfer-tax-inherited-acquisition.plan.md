# 양도소득세 — 상속 부동산 취득 실거래가 특례 (의제취득일 분기)

**Plan ID**: `transfer-tax-inherited-acquisition`
**작성일**: 2026-04-28
**대상 세목**: 양도소득세
**연관 PRD**: `docs/00-pm/korean-tax-calc.prd.md` (양도세 §97 취득가액 영역)
**관련 기존 모듈**: `lib/tax-engine/inheritance-acquisition-price.ts` (보충적평가 부분 구현됨, 104줄)

## 1. 배경

상속받은 부동산을 양도하는 경우, **상속개시일이 의제취득일(1985.1.1.) 전인지 후인지**에 따라 양도소득세 계산상의 취득가액 산정 방법이 달라진다. 현재 양도세 엔진은 보충적평가가액 1가지 경로만 지원하므로, 다음 두 케이스가 누락되어 있다:

1. **의제취득일 전 상속**: `취득가액 = max(환산가액, 취득실가 × 물가상승률)`
2. **의제취득일 이후 상속**: 상속세 신고 시의 평가방법(매매사례·감정평가·수용/경매·유사매매·보충적평가) **중 신고한 가액**을 그대로 취득가로 인정. 보충적평가가액만이 답이 아님.

이번 작업은 두 케이스를 모두 양도세 엔진·UI·API·테스트에 반영하는 것이다.

## 2. 법령 근거

| 조문 | 내용 | 비고 |
|---|---|---|
| 소득세법 §97 ① | 양도소득 필요경비 — 취득가액 결정 | 양도세 진입 |
| 소득세법 시행령 §163 ⑨ | 상속·증여 자산 취득가액 의제 | **이미 상수에 등재**: `TRANSFER.ACQ_INHERITED_SUPPLEMENTARY` |
| 소득세법 시행령 §176조의2 ④ | 의제취득일 전 상속 자산 취득가액 환산 (물가상승률 적용 허용) | 신규 상수 추가 필요 |
| 소득세법 시행령 §164 ⑤ | 환산취득가 공식 | 기존 `calculateEstimatedAcquisitionPrice` 재사용 |
| 소득세법 시행령 §163 ⑥ | 개산공제(취득시 기준시가 × 3%) | 환산 시 자동 적용 |
| 상증법 §60 ① ⑤ | 시가주의·감정·매매사례 우선 | 신규 상수 추가 |
| 상증법 §61 | 부동산 보충적평가 방법 | 신규 상수 추가 |
| 부칙(시행령 1985.1.1. 개정) | 의제취득일 정의: 1984.12.31. 이전 취득은 1985.1.1. 취득으로 본다 | 신규 상수 추가 |

## 3. 케이스별 사양

### 3.1 케이스 A — 의제취득일 전 상속 (`상속개시일 < 1985-01-01`)

**산식**:
```
취득가액 = max(
  환산취득가액(소령 §164⑤),
  피상속인 취득실가 × (양도시점 CPI ÷ 피상속인 취득시점 CPI)
)
```

- **환산취득가액**: `양도가액 × 취득시 기준시가 ÷ 양도시 기준시가`
  - 토지: 의제취득일(1985.1.1.) 시점 기준시가 사용 또는 사용자가 1990.8.30. 이전 토지등급가액 환산을 별도 적용한 경우 그 결과 사용 (PHD·1990 환산 기존 인프라와 결합 가능).
  - 건물: 의제취득일 시점의 기준시가가 없으면 환산 불가 → 비활성화 후 `취득실가 × 물가상승률`만 인정.
- **취득실가 × 물가상승률**:
  - 피상속인의 실제 취득가가 입증되는 경우만 적용 (선택적).
  - 물가상승률 = `CPI(양도일 또는 비교시점) ÷ CPI(피상속인 취득일)`.
  - 비교시점 정책: **의제취득일(1985.1.1.) 시점이 아닌 양도일 시점 CPI**를 사용 (집행기준 97-176의2-① 해석).
- **개산공제(§163⑥)**: 환산취득가액이 선택된 경우 자동 적용 (`취득시 기준시가 × 3%`).

**입력 흐름**:
1. 사용자가 "상속" + 상속개시일(1984-12-31) 입력 → 자동으로 케이스 A 분기.
2. 사용자에게 "피상속인 취득실가를 입증할 수 있는가?" 토글.
3. Yes: 피상속인 취득일·취득가 입력 → 물가상승률 환산값 산출.
4. No: 환산취득가액만 사용 (또는 보충적평가 fallback 옵션).
5. 엔진이 `max(...)` 선택 후 결과 + 산식 표시.

### 3.2 케이스 B — 의제취득일 이후 상속 (`상속개시일 ≥ 1985-01-01`)

**산식**:
```
취득가액 = 상속세 신고 시 평가가액
```

- 상속세 신고 시 적용된 평가방법에 따라 그대로 취득가로 인정 (상증법 §60 + 양도세 §97).
- 평가방법 5종:
  1. **시가**(매매사례가액)
  2. **감정평가가액** (2개 이상 평균, 단 10억 이하 자산 1개 가능)
  3. **수용·경매·공매가액**
  4. **유사매매사례가액**
  5. **보충적평가가액** (시가가 없을 때 — 토지 개별공시지가×면적 / 주택 공시가격)

**입력 흐름**:
1. 자동으로 케이스 B 분기 (상속개시일 ≥ 1985-01-01).
2. 사용자가 평가방법 5종 중 선택 → 신고가액 입력.
3. (선택) "보충적평가 보조계산 사용" 토글: ON 시 토지/건물 입력 폼 노출 → 자동 산출 후 신고가액 필드 채움.
4. (선택) 평가 근거 메모(감정평가서 번호·매매사례 일자) 입력.

### 3.3 결합 케이스

| 조합 | 처리 |
|---|---|
| 케이스 A + 1990.8.30. 이전 토지 | 환산 산정 시 기존 `pre-1990-land-valuation` 결과를 취득시 기준시가로 사용. 케이스 A의 환산 항목과 동일 인프라 공유. |
| 케이스 A + PHD(개별주택가격 미공시) | 1985년 시점 기준시가가 토지·건물 분리 공시되어 있다면 PHD 3-시점 환산 인프라 재활용. 이번 단계에서는 **결합 불요**(드문 케이스)로 가드 처리하고 Phase 2 이슈로 이관. |
| 케이스 B + 일괄취득(토지·건물) | 신고가액 단일 합계로 입력하거나, 토지·건물 각각 입력해 합산. UI에서 분리 입력 옵션 제공. |
| 협의분할 후 일부 재상속·증여 | 본 plan에서는 단순화 — `상속개시일 = 최초 상속개시일` 기준. 재상속·재분할은 별도 Phase 이슈. |

## 4. Decision Log

| # | 결정 | 사유 |
|---|---|---|
| D1 | 새 helper 파일을 만들지 않고 **기존 `inheritance-acquisition-price.ts`를 확장** | 현재 104줄, 800줄 정책 여유. 단일 책임(상속·증여 취득가) 유지가 더 명확. |
| D2 | 자산-수준(`AssetForm`) 필드로 추가, 폼-전역 추가하지 않음 | 2026-04-25 자산-수준 마이그레이션 정책 준수. 다건 양도 시 자산별 다른 평가방법 입력 가능. |
| D3 | 물가상승률은 `lib/tax-engine/data/cpi-rates.ts`에 정적 상수로 보관 | 1990 토지등급가액 패턴 모델. 통계청 CPI는 발표 후 사실상 불변. DB로 갈 가치 낮음. |
| D4 | 양도세 → 상속·증여 평가 모듈 의존은 **import만** (단방향) | `lib/tax-engine/CLAUDE.md` 규칙. 보충적평가 보조계산은 `inheritance-gift/property-valuation` 모듈을 양도세에서 호출하는 형태로만. |
| D5 | UI는 기존 `CompanionAcqInheritanceBlock.tsx` 확장 | 이미 상속 입력 블록이 있으므로 신규 카드 분리하지 않고 그 안에서 의제취득일 분기. 단, 800줄 임박 시 `InheritanceValuationCard.tsx` 분리. |
| D6 | API zod 스키마는 `discriminatedUnion("inheritanceMode", [...])`로 모드별 검증 | 기존 감면 스키마 패턴과 동일. case A/B 필드 누락을 컴파일타임에 차단. |
| D7 | 기존 `useEstimatedAcquisition` + 보충적평가 흐름은 그대로 유지(deprecated 표기 X) | 일반 매매 환산은 그대로 동작해야 함. 상속 분기는 이를 덮어쓰는 STEP 0.45만 추가. |
| D8 | 결과 뷰 산식은 한국어·중간 산술 결과 미표기 | 기존 PHD/1990 결과 뷰 패턴 따름 (메모리 `feedback_result_view_korean_formula`). |

## 5. 데이터 모델 변경

### 5.1 `AssetForm` 신규 필드 (`lib/stores/calc-wizard-asset.ts`)

```ts
// === 상속 취득가액 의제 (소령 §176의2④·§163⑨) ===
/** 의제취득일 전/후 자동 분기 결과 (UI에서 read-only 표시용) */
inheritanceMode?: "pre-deemed" | "post-deemed" | null;

/** 상속개시일 (피상속인 사망일) */
inheritanceStartDate?: string; // ISO yyyy-mm-dd

/** 피상속인 취득일 (case A: 환산·물가상승률 산식 시점 결정) */
decedentAcquisitionDate?: string; // 기존 필드 활용 검토 — 이미 존재

/** 피상속인 실지취득가액 (case A 전용, 입증 가능 시) */
decedentAcquisitionPrice?: string;

/** 피상속인 실가 입증 여부 (case A 전용) */
hasDecedentActualPrice?: boolean;

// --- case B 전용 ---
/** 상속세 신고가액 (취득가) */
inheritanceReportedValue?: string;

/** 상속세 신고 시 평가방법 */
inheritanceValuationMethod?:
  | "market_transaction"  // 매매사례
  | "appraisal"           // 감정평가
  | "auction_public_sale" // 수용·경매·공매
  | "similar_sale"        // 유사매매사례
  | "supplementary";      // 보충적평가

/** 평가 근거 메모 (감정평가서 번호 등) */
inheritanceValuationEvidence?: string;

/** 보충적평가 보조계산 사용 (case B + supplementary 일 때만) */
useSupplementaryHelper?: boolean;

/** 보충적평가 보조: 토지면적 / 개별공시지가 / 건물 공시가격 등 */
supplementaryLandArea?: string;
supplementaryLandUnitPrice?: string;
supplementaryBuildingValue?: string;
```

> 기존 필드 중복 검토 후 통폐합: `decedentAcquisitionDate`가 이미 있다면 그대로 사용. 신규 필드는 모두 optional, 기본값 `undefined`. 마이그레이션 시 자동으로 `null`/`""` 초기화.

### 5.2 `lib/stores/calc-wizard-migration.ts`

기존 `migrateLegacyForm` 안에 신규 필드 기본값 주입 분기 추가. 기존 sessionStorage 사용자에게 `inheritanceMode = null`, `inheritanceValuationMethod = undefined`로 노출 → UI에서 자동 분기 결정.

## 6. 엔진 변경

### 6.1 `lib/tax-engine/types/inheritance-acquisition.types.ts`

기존 타입을 확장:

```ts
export type InheritanceAcquisitionMethod =
  | "market_value"        // 시가(매매사례)
  | "appraisal"
  | "auction_public_sale" // 신규
  | "similar_sale"        // 신규
  | "supplementary"
  | "pre_deemed_max";     // 신규: 케이스 A — max(환산, 실가×CPI) 결과

export interface InheritanceAcquisitionInput {
  // 기존
  assetKind: InheritanceAssetKind;
  landAreaM2?: number;
  publishedValueAtInheritance: number;
  marketValue?: number;
  appraisalAverage?: number;

  // 신규 — 케이스 분기
  inheritanceStartDate?: Date;          // 상속개시일
  deemedAcquisitionDate?: Date;         // 의제취득일 (default: 1985-01-01)
  decedentAcquisitionDate?: Date;       // 피상속인 취득일
  decedentActualPrice?: number;         // 피상속인 실지취득가액
  reportedValue?: number;               // 상속세 신고가액 (case B)
  reportedMethod?: InheritanceAcquisitionMethod;

  // 케이스 A 환산 산정 보조
  transferDate?: Date;                  // 양도일
  transferPrice?: number;               // 양도가액
  standardPriceAtDeemedDate?: number;   // 1985.1.1. 시점 기준시가 (또는 의제취득일 적용가)
  standardPriceAtTransfer?: number;     // 양도시 기준시가
}

export interface InheritanceAcquisitionResult {
  acquisitionPrice: number;
  method: InheritanceAcquisitionMethod;
  legalBasis: string;
  formula: string;

  /** case A 전용: 후보별 비교 내역 */
  preDeemedBreakdown?: {
    convertedAmount: number;
    inflationAdjustedAmount: number | null;
    selectedMethod: "converted" | "inflation_adjusted";
    cpiFromYear: number;
    cpiToYear: number;
    cpiRatio: number;
  };
}
```

### 6.2 `lib/tax-engine/inheritance-acquisition-price.ts` 확장

기존 `calculateInheritanceAcquisitionPrice`를 다음 분기 추가:

```
1. 케이스 분기 (deemedAcquisitionDate 기본 1985-01-01):
   if (inheritanceStartDate < deemedAcquisitionDate) → case A
   else → case B (또는 입력값 부재 시 기존 보충/시가/감정 폴백)

2. case A:
   - converted = calculateEstimatedAcquisitionPrice(transferPrice, standardPriceAtDeemedDate, standardPriceAtTransfer)
   - if (decedentActualPrice && decedentAcquisitionDate):
       cpiRatio = getCpiRatio(decedentAcquisitionDate, transferDate)
       inflationAdjusted = floor(decedentActualPrice * cpiRatio)
   - acquisitionPrice = max(converted, inflationAdjusted ?? 0)
   - method = "pre_deemed_max"
   - legalBasis = "소령 §176조의2 ④ · §164⑤"

3. case B:
   - if (reportedValue && reportedMethod): acquisitionPrice = floor(reportedValue), method = reportedMethod
   - else: 기존 시가/감정/보충 폴백 (현재 우선순위 그대로)

4. 입력 검증:
   - case A에서 standardPriceAtDeemedDate가 0인 경우 환산 불가 — converted=0, inflation만 인정.
   - inflation 계산 시 decedentAcquisitionDate가 CPI 테이블 범위 밖이면 경고.
```

파일 줄수 예상: 104 → ~280줄 (800줄 정책 여유).

### 6.3 `lib/tax-engine/data/cpi-rates.ts` (신규)

```ts
/**
 * 연도별 소비자물가지수(CPI) 정적 테이블.
 * 출처: 통계청 KOSIS, 기준년도 2020 = 100.
 * 의제취득일 전 상속 자산의 물가상승률 환산(소령 §176의2 ④)에 사용.
 */
export interface CpiEntry {
  year: number;
  monthly?: number[]; // 12개월 평균이 필요 시
  annual: number;     // 연평균
}

export const CPI_TABLE: CpiEntry[] = [
  { year: 1965, annual: 4.6 },
  // ... 1965 ~ 2026 (대략 60개 행)
];

export function getCpiAnnual(year: number): number | null { /* ... */ }
export function getCpiRatio(fromDate: Date, toDate: Date): number {
  // 연평균 기준 (월별이 필요하면 추후 확장)
  const from = getCpiAnnual(fromDate.getFullYear());
  const to = getCpiAnnual(toDate.getFullYear());
  if (from == null || to == null || from === 0) return 1;
  return to / from;
}
```

### 6.4 `lib/tax-engine/transfer-tax.ts` STEP 0.45 신설

```ts
// STEP 0.4(pre1990Land) 직후, STEP 0.5 직전:
if (rawInput.inheritedAcquisition) {
  const r = calculateInheritanceAcquisitionPrice(rawInput.inheritedAcquisition);
  input = {
    ...input,
    acquisitionPrice: r.acquisitionPrice,
    // 케이스 A 환산 선택 시 useEstimatedAcquisition + standardPrice 주입
    ...(r.preDeemedBreakdown?.selectedMethod === "converted" && {
      useEstimatedAcquisition: true,
      standardPriceAtAcquisition: rawInput.inheritedAcquisition.standardPriceAtDeemedDate,
      standardPriceAtTransfer: rawInput.inheritedAcquisition.standardPriceAtTransfer,
      acquisitionMethod: "estimated",
    }),
  };
  // CalculationStep 기록
}
```

### 6.5 `lib/tax-engine/types/transfer.types.ts`

`TransferTaxInput`에 `inheritedAcquisition?: InheritanceAcquisitionInput` 추가.

### 6.6 `lib/tax-engine/legal-codes/transfer.ts` 신규 상수

```ts
export const TRANSFER = {
  // ... 기존
  INHERITED_BEFORE_DEEMED: "소득세법 시행령 §176조의2 ④",
  INHERITED_AFTER_DEEMED: "소득세법 시행령 §163 ⑨ · 상증법 §60",
  DEEMED_ACQUISITION_DATE: "1985-01-01 (소득세법 부칙 1985.1.1. 개정)",
  INHERITANCE_VALUATION_PRINCIPLE: "상증법 §60 · §61",
};
```

## 7. UI 변경

### 7.1 `components/calc/transfer/CompanionAcqInheritanceBlock.tsx` 확장

기존 블록 안에 다음 섹션 추가:

```
┌─────────────────────────────────────────────────────┐
│ 상속 취득가액 산정                                   │
│   • 상속개시일: [DateInput]                          │
│   • 의제취득일 분기: 자동 표시 (전/후)               │
└─────────────────────────────────────────────────────┘

[상속개시일 < 1985-01-01인 경우]
┌─────────────────────────────────────────────────────┐
│ 의제취득일 이전 상속 (소령 §176의2 ④)               │
│   • 의제취득일(1985.1.1.) 기준시가:                 │
│       - 토지: 개별공시지가 자동조회 + 면적          │
│       - 건물: 기준시가 입력                         │
│   • [☑] 피상속인 실지취득가액 입증 가능             │
│       - 피상속인 취득일: [DateInput]                │
│       - 피상속인 취득가: [CurrencyInput]            │
│   • 결과:                                            │
│       환산취득가:        ___,___,___원              │
│       실가×물가상승률:   ___,___,___원              │
│       → 적용 (큰 금액):  ___,___,___원              │
└─────────────────────────────────────────────────────┘

[상속개시일 ≥ 1985-01-01인 경우]
┌─────────────────────────────────────────────────────┐
│ 의제취득일 이후 상속 (소령 §163 ⑨)                  │
│   • 상속세 신고 시 평가방법: [Select]               │
│       (시가 / 감정평가 / 수용·경매 / 유사매매 /     │
│        보충적평가)                                  │
│   • 신고가액: [CurrencyInput]                       │
│   • 평가 근거 메모: [TextInput] (선택)              │
│   • [☑] 보충적평가 보조계산 사용                    │
│       (보충적평가 선택 시만)                        │
│       - 토지: 개별공시지가 × 면적                   │
│       - 건물: 공시가격 입력                         │
│       → 자동 합산 후 신고가액 필드 자동 채움        │
└─────────────────────────────────────────────────────┘
```

UI 작성 원칙(`CLAUDE.md` 7항):
- 상속개시일을 가장 먼저 입력 → 분기 결정 → 후속 필드 노출 (계산 로직 순서 = UI 순서).
- `FieldCard` `trailing` prop에 `LawArticleModal` 배지로 §176의2④, §163⑨, §60, §61 조문 링크.
- 결과는 한국어 산식 (`floor()`·`P_F` 같은 약어 금지).

### 7.2 `components/calc/transfer/InheritanceValuationPreviewCard.tsx` (선택, 800줄 임박 시 분리)

상속 취득가액 산정 결과를 미리보기 카드로 보여주는 컴포넌트. 케이스 A에서는 `max(...)` 후보 비교를 시각화.

### 7.3 `WizardSidebar` 합계 표시

- 케이스 A: 환산 결과는 엔진 후 결정 → API 응답 후 표시. 실가×CPI는 클라이언트에서 즉시 계산 가능.
- 케이스 B: 신고가액은 사용자 입력값이므로 즉시 표시.

### 7.4 자산정보 마법사 단계 통합

`Step1` (자산정보) 안에서 `acquisitionCause === "inheritance"` 선택 시 위 블록이 자동 노출되도록 기존 conditional rendering에 분기만 추가.

## 8. API 변경

### 8.1 `app/api/calc/transfer-tax/route.ts` zod 스키마

```ts
const inheritedAcquisitionSchema = z.discriminatedUnion("mode", [
  // case A
  z.object({
    mode: z.literal("pre-deemed"),
    inheritanceStartDate: z.string().date(),
    decedentAcquisitionDate: z.string().date().optional(),
    decedentActualPrice: z.number().int().nonnegative().optional(),
    standardPriceAtDeemedDate: z.number().int().nonnegative(),
    standardPriceAtTransfer: z.number().int().positive(),
  }),
  // case B
  z.object({
    mode: z.literal("post-deemed"),
    inheritanceStartDate: z.string().date(),
    reportedValue: z.number().int().nonnegative(),
    reportedMethod: z.enum([
      "market_transaction", "appraisal", "auction_public_sale",
      "similar_sale", "supplementary",
    ]),
    evidenceMemo: z.string().max(200).optional(),
  }),
]);
```

자산-수준 스키마(`assetSchema`)에 `inheritedAcquisition: inheritedAcquisitionSchema.optional()` 추가.

### 8.2 자산 → 엔진 변환 함수

`route.ts` 내 자산 매핑 로직에 `assetForm.inheritanceMode`에 따라 위 객체를 빌드해 `engineInput.inheritedAcquisition`에 주입.

## 9. 테스트 계획 (`__tests__/tax-engine/`)

신규 테스트 파일: `__tests__/tax-engine/inheritance-acquisition-price.test.ts` (기존 파일 확장 또는 시나리오 분할).

### 9.1 케이스 A — 의제취득일 전 상속

- **A-1 환산만**: 피상속인 실가 미입증, 1985.1.1. 토지 기준시가만 입력 → 환산취득가만 인정. 양도가 920,000,000 / 1985 기준시가 / 양도시 기준시가 비율로 anchor.
- **A-2 실가×CPI 우세**: 피상속인 실가 1억 + CPI 비율 25배 = 25억 vs 환산 18억 → 25억 채택, `selectedMethod = "inflation_adjusted"`.
- **A-3 환산 우세**: 환산 30억 vs 실가×CPI 22억 → 30억 채택, `selectedMethod = "converted"`.
- **A-4 1990.8.30. 이전 토지 결합**: pre1990 결과 + case A 결합. 의제취득일(1985.1.1.) 시점 기준시가는 1990 토지등급가액 환산식의 부산물로 산출.
- **A-5 양도시 기준시가 0 가드**: 0/0 division 방지. 환산값 = 0 또는 에러 처리.
- **A-6 첨부 이미지 PDF 시나리오**: 1983.7.26. 상속 / 2023.2.16. 양도 920백만 / 토지등급·공시가 표대로 환산. 원 단위까지 anchor (PDF 검증).

### 9.2 케이스 B — 의제취득일 이후 상속

- **B-1 시가**: 매매사례가액 5억 신고 → 5억 채택, method=`market_transaction`.
- **B-2 감정평가**: 4억8천 신고 → 그대로. 평가 근거 메모 통과.
- **B-3 보충적평가**: 토지 184.2㎡ × 개별공시지가 5,804,000 = 1,069,096,800원 (이미지 표 참조) → 결과값 anchor.
- **B-4 보충적평가 보조도구**: `useSupplementaryHelper=true` → 자동계산값이 신고가액 필드와 일치.
- **B-5 미입력 fallback**: reportedValue/method 미입력 시 기존 보충적평가 자동 폴백 (하위호환).

### 9.3 케이스 분기 가드

- **D-1 1985-01-01 경계**: 1984-12-31 → case A, 1985-01-01 → case B.
- **D-2 mode 누락**: zod 스키마 거부.
- **D-3 양도세 통합 e2e**: `transfer-tax.test.ts`에 케이스 A/B 각각 1건 추가, 최종 산출세액까지 검증.

### 9.4 anchor 테스트 정책

`feedback_pdf_example_test_anchoring.md` 메모리 따름 — PDF 예제값은 원 단위 `toBe()` 고정. 회귀 시 즉시 알림.

## 10. 작업 분해 (Phase)

| Phase | 산출물 | 예상 작업량 | 의존 |
|---|---|---|---|
| **P1: 데이터·상수** | `data/cpi-rates.ts` 신규(약 100줄) + `legal-codes/transfer.ts` 상수 +5줄 | 0.5d | — |
| **P2: 타입 확장** | `types/inheritance-acquisition.types.ts` 확장 + `types/transfer.types.ts`에 필드 추가 | 0.5d | P1 |
| **P3: 엔진 확장** | `inheritance-acquisition-price.ts` case A/B 분기 + `transfer-tax.ts` STEP 0.45 + helper 확장 | 1d | P2 |
| **P4: 테스트** | 위 9.1~9.4 시나리오 테스트 (목표 20+ anchor) | 1d | P3 |
| **P5: API** | zod 스키마 확장 + route 매핑 | 0.5d | P3 |
| **P6: UI** | `CompanionAcqInheritanceBlock.tsx` 확장 + 결과 미리보기 + 사이드바 합계 | 1.5d | P5 |
| **P7: Store·Migration** | `AssetForm` 필드 추가 + `migrateLegacyForm` 분기 | 0.5d | P6 |
| **P8: e2e·검증** | gap-detector 90%+ 목표, transfer-tax-qa 에이전트 검증 | 0.5d | P7 |

**총 예상**: 6일 (1인 기준). 작업 시 `transfer-tax-senior` + `inheritance-gift-tax-senior` 협업, QA는 `transfer-tax-qa`.

## 11. 리스크 / 미해결 이슈

| # | 이슈 | 처리 방향 |
|---|---|---|
| R1 | CPI 데이터의 정확한 기준(연평균 vs 월평균) — 양도일·취득일이 월 단위로 차이날 때 | 기본은 연평균. 월별 옵션은 Phase 2. 통계청 KOSIS 출처 명시. |
| R2 | 1985.1.1. 시점 토지·건물 기준시가 입력 — 사용자가 모를 수 있음 | Vworld API + 1990 토지등급가액 환산 결과 자동 주입 옵션. 건물은 직접 입력 가이드. |
| R3 | 보충적평가 보조계산 = 양도세에서 상증법 평가 모듈 호출 | `inheritance-gift/property-valuation` 모듈이 양도세에서 import 가능한지 확인. 단방향 의존 위반 없음 (transfer → inheritance-gift). |
| R4 | 협의분할 후 일부 재상속·증여 / 6개월 평가기간 외 매매사례 | 본 plan 범위 외. follow-up issue로 등록. |
| R5 | 케이스 B에서 보충적평가 신고했더라도 실제로는 시가 평가 가능했던 경우(과세관청이 시가 인정한 경우) | 본 plan은 "사용자가 신고한 값"을 신뢰. 사후 시가 인정·경정 케이스는 별도 가이드 필요. |
| R6 | 1990.8.30. 이전 토지 환산과의 우선순위 충돌 | `inheritedAcquisition.mode === "pre-deemed"`이고 토지인 경우, `pre1990Land` 입력이 있으면 그 결과를 `standardPriceAtDeemedDate`로 사용. transfer-tax.ts STEP 0.4 → 0.45 순서 보장. |
| R7 | 기존 `inheritance-acquisition-price.ts` 호출하는 곳이 양도세 외에 있는지 | 보고서상 직접 호출 없음. grep으로 재확인 후 진행. 확장 시 기존 시그니처 하위호환 유지(모든 신규 필드 optional). |
| R8 | UI 800줄 정책 — `CompanionAcqInheritanceBlock.tsx`가 임박할 가능성 | 임박 시 `InheritanceValuationCard.tsx` 별도 분리 (D5). |

## 12. 수용 기준 (Acceptance Criteria)

- [ ] 케이스 A 환산·실가×CPI 두 후보 모두 산출되고 큰 값이 채택된다 (단위 테스트 anchor 통과).
- [ ] 케이스 B 5종 평가방법 모두 입력·반영되고, 보충적평가 보조도구가 신고가액에 동기화된다.
- [ ] 1984-12-31 ↔ 1985-01-01 경계에서 모드가 정확히 갈린다.
- [ ] PDF 첨부 시나리오(1983.7.26. 상속·2023.2.16. 양도 920백만)가 원 단위 anchor를 통과한다.
- [ ] `app/api/calc/transfer-tax` zod가 `inheritedAcquisition` discriminatedUnion으로 양 케이스 모두 검증한다.
- [ ] `Asset` 마법사에서 상속개시일 입력 → 자동 분기 → 후속 필드 노출까지 사용자 흐름이 끊기지 않는다.
- [ ] 결과 뷰에 한국어 산식이 표시되고 법령 조문 링크(`LawArticleModal`)로 §176의2④·§163⑨·§60·§61 조문이 열린다.
- [ ] gap-detector match rate 90%+.
- [ ] `transfer-tax-qa` 에이전트 검증 통과 (회귀 없음).
- [ ] `inheritance-acquisition-price.ts` ≤ 800줄, `CompanionAcqInheritanceBlock.tsx` ≤ 800줄.

## 13. 후속 이슈 (Out of Scope)

- 협의분할 후 재상속·재증여
- 6개월 평가기간 외 매매사례·감정 사용 (사후 경정)
- 월별 CPI 적용 (현재는 연평균)
- 사후 시가 경정 케이스의 자동 안내
- PHD(개별주택가격 미공시)와 케이스 A 결합 (현재는 가드만)
- 인포그래픽 형태의 결과 비교 카드 (UI 고도화)

---

## 부록 A — 첨부 PDF 사례 매핑

이미지 사례:
- 갑氏 1983.7.26. 상속 → 의제취득일 전 (case A)
- 양도 2023.2.16., 양도가 920,000,000원
- 토지 184.2㎡, 건물 253.75㎡, 1982.1.3. 사용승인
- 개별공시지가·개별주택가격·토지등급 변천 표 제공
- 책 본문: "의제취득일 이전 상속이므로 일반 취득과 동일하게 취득가액을 환산한다"

→ 본 plan의 case A 시나리오로 그대로 매핑됨. 환산 산식은 기존 `calculateEstimatedAcquisitionPrice` + 1990.8.30. 토지등급가액 환산을 결합.

## 부록 B — 영향 받는 파일 목록 (체크리스트)

```
[엔진]
□ lib/tax-engine/inheritance-acquisition-price.ts  (확장)
□ lib/tax-engine/types/inheritance-acquisition.types.ts  (확장)
□ lib/tax-engine/types/transfer.types.ts  (필드 추가)
□ lib/tax-engine/transfer-tax.ts  (STEP 0.45 추가)
□ lib/tax-engine/legal-codes/transfer.ts  (상수 추가)
□ lib/tax-engine/data/cpi-rates.ts  (신규)

[API]
□ app/api/calc/transfer-tax/route.ts  (zod 확장 + 매핑)
□ lib/api/transfer-tax-schema.ts  (있다면 동일)

[UI]
□ components/calc/transfer/CompanionAcqInheritanceBlock.tsx  (확장)
□ components/calc/transfer/InheritanceValuationPreviewCard.tsx  (신규, 800줄 임박 시)
□ components/calc/transfer/wizard/Step1*.tsx  (분기 추가)

[Store]
□ lib/stores/calc-wizard-asset.ts  (필드 추가)
□ lib/stores/calc-wizard-migration.ts  (마이그레이션 분기)

[테스트]
□ __tests__/tax-engine/inheritance-acquisition-price.test.ts  (확장 또는 시나리오 분할)
□ __tests__/tax-engine/transfer-tax/inherited-acquisition.test.ts  (e2e, 신규)
□ __tests__/tax-engine/_helpers/inheritance-fixture.ts  (신규)

[문서]
□ docs/02-design/features/transfer-tax-inherited-acquisition.design.md  (Phase P3 진입 시 작성)
```
