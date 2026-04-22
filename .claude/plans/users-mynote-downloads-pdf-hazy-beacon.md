# 상속 주택+농지 일괄양도 안분 계산 구현 계획

## Context

PDF 사례(2023 양도·상속·증여세 이론 및 계산실무 p387~391)의 "상속받은 주택과 농지의 양도가액 안분 / 수정신고" 케이스를 현 프로젝트에서 원 단위까지 재현 가능하게 한다.

**사례 핵심**
- 1세대 1주택(주택+부속토지) + 별도 필지 농지(밭)를 하나의 매매계약으로 **일괄양도**
  - 상속 2005-04-07, 부친 취득 1999-10-21 (150,000,000원), 양도 2023-02-15 (총 225,000,000원)
- 주택분: 2년 이상 보유 → **1세대 1주택 비과세**
- 농지분: 8년 이상 자경 → **조특법 §69 100% 감면**
- 양도가액 안분(소득령 §166⑥): 기준시가 비율 (주택 116백만 : 농지 92.781백만) → **농지 99,988,624원 / 주택 125,011,376원**
- 상속 취득가액: 소득령 §163⑨ → 상속개시일 **상증법상 보충적평가액**
- 농지 과세표준 60,631,001원 → 산출세액 8,791,440원 → 100% 감면 → 납부 0원

**프로젝트에 없는 기능(실측 탐색 결과)**
1. 🔴 일괄양도 기준시가 비율 안분 로직 — 다필지 안분(`multi-parcel-transfer.ts`)은 있으나 자산 종류가 다른 일괄양도 안분은 없음
2. 🔴 상속·증여 취득가액 = 상속개시일 보충적평가액 산정 — `propertyBaseShape` L364 `acquisitionMethod: "actual" | "estimated" | "appraisal"`에 보충적평가 선택지 없음
3. 🔴 피상속인 경작기간 합산(조특령 §66⑪) — 스키마·UI·`calcReductions` L327 모두 본인 자경만 판정
4. 🟡 자경농지 감면 5년 누적한도(2억) — Zod 스키마에 필드는 있으나 UI 반영 없음

**이미 구현된 것(재사용 대상)**
- `transfer-tax.ts` + `transfer-tax-helpers.ts` + `transfer-tax-rate-calc.ts`: 1세대 1주택 비과세(12억 기준 부분과세), 장특공 표1/표2, 기본 자경농지 감면, `acquisitionCause: inheritance` 분기
- `transfer-tax-aggregate.ts` 다건 엔진(§92/§102②/§103/§104의2/§127②)
- `types/transfer.types.ts` L86 `acquisitionCause`, L92 `decedentAcquisitionDate` 필드
- `calc-wizard-store.ts` L56/L60/L78/L79 관련 폼 필드
- Step3.tsx L295~L310 상속 선택 시 `decedentAcquisitionDate` 입력 UI
- Step5.tsx L54~L62 자경농지 감면 선택 + `farmingYears` 입력 UI
- `/api/address/standard-price` (Vworld NED) 연도별 공시지가·개별주택가격 실시간 조회
- `multi-parcel-transfer.ts` L178~L200 안분 + 말단 잔여값 보정 패턴

**사용자 결정사항 (AskUserQuestion 반영)**
- UI: **기존 단건 `/calc/transfer-tax`에 '함께 양도된 자산 추가' 확장** (다건 마법사 분리 X)
- 자경 합산: **상속인 본인 자경만으로 8년 판정 → 미충족 시 피상속인 기간 합산**
- 상속 취득가액: **수동 입력 + 주소검색 자동채움 옵션**
- 범위: **Phase 1~3 전체** (Engine + API + UI)

---

## 아키텍처 — 호출 흐름

```
[기존 단건 UI] /calc/transfer-tax
  ├─ 기본 1자산 입력(현재 그대로)
  └─ NEW: "함께 양도된 자산 추가" 섹션
       ├─ 자산 종류(주택/토지/건물) + 주소 + 면적 + 기준시가
       ├─ 상속이면 상속 취득가액(보충적평가액) 자동/수동
       └─ 자경농지면 피상속인 자경기간
  │
  ▼ POST /api/calc/transfer (기존 경로, 입력 스키마에 bundled 필드 선택적 추가)
  │
  ▼ companionAssets 존재시 → Orchestrator 분기 (route.ts 내부)
  │     (1) apportionBundledSale  — 기준시가 비율 안분
  │     (2) calculateInheritanceAcquisitionPrice — 자산별 상속 취득가액
  │     (3) calculateTransferTaxAggregate — 기존 다건 엔진 재사용
  │   companionAssets 없으면 → 기존 단건 경로 그대로
  │
  ▼ 결과: 자산별 결과 + 합산 결정세액
```

단건 API 하나로 통합되, `companionAssets` 필드 존재 시에만 내부적으로 다건 엔진으로 escalate. 기존 프론트엔드가 `companionAssets`를 보내지 않으면 100% 하위호환.

---

## 현재 프로젝트 분리 구조 (2026-04 리팩터링 후, 실측 확인)

```
lib/tax-engine/
├── transfer-tax.ts                   # Orchestrator — calculateTransferTax() L141
├── transfer-tax-helpers.ts           # H-1~H-6 기초 계산 (parseRatesFromMap, checkExemption, calcTransferGain…)
├── transfer-tax-rate-calc.ts         # H-6.5~H-8 세액·감면 계산 ★
│   └── calcReductions() L251         # ★ self_farming 분기 L327~L330 (수정 대상)
├── transfer-tax-penalty.ts           # 가산세
├── transfer-tax-aggregate.ts         # 다건 엔진 (재사용 대상)
├── multi-parcel-transfer.ts          # 다필지 안분 — 말단 잔여값 패턴 L178~L200 (레퍼런스)
├── types/
│   └── transfer.types.ts
│       ├── TransferTaxInput L41 (acquisitionCause L86, decedentAcquisitionDate L92)
│       ├── TransferReduction L190 (self_farming variant L191)
│       └── TransferTaxResult L216
├── legal-codes/
│   ├── transfer.ts                   # TRANSFER.*, NBL.*, MULTI_HOUSE.* (3개 상수 추가 대상)
│   └── index가 없으면 ../legal-codes.ts 가 barrel
└── non-business-land/ (14 파일 서브엔진)

lib/api/transfer-tax-schema.ts
├── reductionSchema L150 (discriminatedUnion)
│   └── self_farming L152~L154 (decedentFarmingYears 추가 대상)
├── propertyBaseShape L334~L372 ★  (acquisitionCause L340, decedentAcquisitionDate L341 이미 존재)
│   → companionAssets 필드를 여기에 추가하면 propertySchema·propertyItemSchema 양쪽 자동 반영
├── propertySchema L376 (단건)
├── propertyItemSchema L387 (다건 개별)
└── multiInputSchema L397 (다건 집합)

app/api/calc/transfer/
├── route.ts                          # 단건 — propertySchema 사용 (companionAssets 분기 추가 대상)
└── multi/route.ts                    # 다건 — 건드리지 않음

app/calc/transfer-tax/
├── TransferTaxCalculator.tsx         # Orchestrator 412줄 (최소 수정 — API 호출 분기만)
├── multi/MultiTransferTaxCalculator.tsx
└── steps/
    ├── Step1.tsx (물건 유형)         # ← "함께 양도된 자산" 토글 추가
    ├── Step2.tsx (양도 정보)
    ├── Step3.tsx (취득 정보)         # ← L264 "상속" 버튼 / L295~L310 decedentAcquisitionDate 이미 있음
    │                                   → "보충적평가액 자동/수동 토글"만 추가
    ├── Step4.tsx (보유 상황)
    ├── Step5.tsx (감면)              # ← L54 self_farming / L61 farmingYears 이미 있음
    │                                   → decedentFarmingYears 필드만 조건부 추가
    └── Step6.tsx (가산세)

lib/stores/calc-wizard-store.ts
└── TransferFormData L29
    ├── acquisitionCause L56 ✅ 있음
    ├── decedentAcquisitionDate L60 ✅ 있음
    ├── reductionType L78 ✅ 있음
    └── farmingYears L79 ✅ 있음
    → 추가 대상: companionAssets, decedentFarmingYears, inheritanceValuationMode 등

__tests__/
├── tax-engine/
│   ├── _helpers/
│   │   ├── mock-rates.ts             # baseTransferInput(overrides) L167
│   │   └── multi-house-mock.ts
│   ├── transfer-tax/
│   │   ├── basic.test.ts
│   │   ├── multi-house-and-nbl.test.ts
│   │   ├── reductions-and-exempt.test.ts  # ← 피상속인 자경 합산 회귀 추가 대상
│   │   ├── edge-and-overlap.test.ts
│   │   └── integration.test.ts      # ← PDF end-to-end 추가 후보
│   └── (단일 주제 테스트는 이 레벨, 분할 아님)
└── api/                              # API 라우트 테스트
```

---

## 파일별 작업 목록 (분리 구조 반영)

### Phase 1 — Pure Engine

| # | 파일 | 작업 | 주요 변경 |
|---|------|------|-----------|
| 1 | `lib/tax-engine/types/bundled-sale.types.ts` | **신규 (공개 타입)** | `BundledAssetInput`, `BundledApportionmentInput`, `BundledApportionedAsset`, `BundledApportionmentResult` export. 엔진·API·UI·테스트 공유 |
| 2 | `lib/tax-engine/bundled-sale-apportionment.ts` | **신규 (서브엔진)** | `apportionBundledSale()` — 소득령 §166⑥ 기준시가 비율 안분. 말단 잔여값 보정, `safeMultiplyThenDivide` 활용. 공개 타입은 `types/bundled-sale.types.ts`에서 import |
| 3 | `lib/tax-engine/types/inheritance-acquisition.types.ts` | **신규 (공개 타입)** | `InheritanceAcquisitionInput`, `InheritanceAcquisitionResult` export |
| 4 | `lib/tax-engine/inheritance-acquisition-price.ts` | **신규 (서브엔진)** | `calculateInheritanceAcquisitionPrice()` — 소득령 §163⑨. 시가 > 감정가 > 보충적평가(토지: 공시지가×면적, 주택: 개별주택가격) 우선순위 |
| 5 | `lib/tax-engine/legal-codes/transfer.ts` | **수정** (TRANSFER 상수에 추가) | `REDUCTION_SELF_FARMING_INHERITED: "조특령 §66⑪ (피상속인 경작기간 합산)"`, `ACQ_INHERITED_SUPPLEMENTARY: "소득세법 §97 · 시행령 §163⑨"`, `BUNDLED_APPORTIONMENT: "소득세법 시행령 §166⑥"` 추가 (barrel `legal-codes.ts` 변경 불필요 — re-export 자동) |
| 6 | `lib/tax-engine/types/transfer.types.ts` | **수정** (L190 `TransferReduction` 유니온의 self_farming 변형) | `{ type: "self_farming"; farmingYears: number; decedentFarmingYears?: number }` — optional 추가로 하위호환 |
| 7 | `lib/tax-engine/transfer-tax-rate-calc.ts` | **수정** (L251 `calcReductions()` L327~L330 self_farming 분기) | 본인 자경 `reduction.farmingYears >= minFarmingYears` 선판정 → 미충족 시 `effective = farmingYears + (decedentFarmingYears ?? 0)` 재판정. `legalBasis` 라벨은 합산 경로일 때 `TRANSFER.REDUCTION_SELF_FARMING_INHERITED`, 아니면 기존 `TRANSFER.REDUCTION_SELF_FARMING` |
| 8 | `__tests__/fixtures/pdf-bundled-farmland.ts` | **신규 (테스트 fixture)** | PDF 고정 상수 centralization (입력·정답값 `toBe()` 앵커) |
| 9 | `__tests__/tax-engine/bundled-sale-apportionment.test.ts` | **신규 (비분할 단일 주제)** | 2자산 PDF 수치(125,011,376 / 99,988,624), 3자산 말단 잔여, 0 기준시가 엣지 케이스 |
| 10 | `__tests__/tax-engine/inheritance-acquisition-price.test.ts` | **신규** | 토지 보충적평가 / 주택 개별주택가격 / 시가·감정가 우선순위 |
| 11 | `__tests__/tax-engine/transfer-tax/reductions-and-exempt.test.ts` | **확장** (기존 파일) | 피상속인 자경기간 합산 회귀 describe 추가 (`P0-F 회귀`). 본인 8년 충족 시 합산 X 확인 + 본인 6년 + 피상속인 3년 = 9년 충족 확인 |

### Phase 2 — API Layer

| # | 파일 | 작업 | 주요 변경 |
|---|------|------|-----------|
| 12 | `lib/api/transfer-tax-schema.ts` | **수정** | (1) L150 `reductionSchema`의 `self_farming` variant(L152~L154)에 `decedentFarmingYears: z.number().int().nonnegative().optional()` 추가. (2) L334 `propertyBaseShape`에 `companionAssets?`, `totalSalePrice?`, `apportionmentMethod?` 추가 → propertySchema·propertyItemSchema 동시 반영. (3) 파일 상단 섹션에 `companionAssetSchema` 신규 정의 (`assetKind`, `standardPriceAtTransfer`, `standardPriceAtAcquisition?`, `fixedAcquisitionPrice?`, `directExpenses?`, `inheritanceValuation?`, `reductions?: z.array(reductionSchema).default([])`). (4) `propertySchema.superRefine`에 companionAssets 유효성(총양도가 > 0, 자산 2개 이상 시 totalSalePrice 필수) 추가 |
| 13 | `app/api/calc/transfer/route.ts` | **수정** (Orchestrator 분기, 다건 `multi/route.ts`는 건드리지 않음) | L15 `propertySchema as inputSchema` 유지. Zod 통과 후 `data.companionAssets`가 비어있지 않으면 분기: (1) `inheritanceValuation` 있는 자산에 대해 `calculateInheritanceAcquisitionPrice` 호출해 `fixedAcquisitionPrice` 주입 (2) `apportionBundledSale` 실행 (3) 기본 자산 + companionAssets를 `TransferTaxItemInput[]`로 조립 (4) `calculateTransferTaxAggregate` 호출. 응답: `mode: "bundled"` + `apportionment` + `aggregated`. companionAssets 없으면 L203 `parcels` 매핑 포함 기존 단건 경로 그대로 |
| 14 | `__tests__/api/transfer.route.bundled.test.ts` | **신규** | PDF end-to-end: 주택 `isExempt=true`, 농지 `determinedTax=0`, 총 결정세액 0 |
| 15 | 회귀 | **확인** | 기존 `__tests__/api/` 하위 모든 route 테스트 통과 (companionAssets 미지정 시 기존 경로 유지) |

### Phase 3 — UI Layer

| # | 파일 | 작업 | 주요 변경 |
|---|------|------|-----------|
| 16 | `lib/stores/calc-wizard-store.ts` | **수정** (L29 `TransferFormData` + L188 `defaultFormData` + L174 `ParcelFormItem` 옆에 `CompanionAssetForm` 신규) | 추가 필드: `companionAssets: CompanionAssetForm[]` (기본 []), `decedentFarmingYears: string` (기본 "0"), `inheritanceValuationMode: "manual" \| "auto"` (기본 "auto"), `inheritanceLandPricePerM2: string`, `inheritanceHousePrice: string`. 기존 `acquisitionCause`(L56)/`decedentAcquisitionDate`(L60)/`farmingYears`(L79)는 그대로 재사용. `result` partialize 제외 정책 유지 |
| 17 | `lib/calc/transfer-tax-api.ts` | **수정** | `callTransferTaxAPI()`에 `companionAssets` → API 페이로드 매핑 추가. 기존 단일 자산 매핑과 공존 |
| 18 | `lib/calc/transfer-tax-validate.ts` | **수정** | 일괄양도 모드용 step별 유효성: Step1에서 `companionAssets.length > 0`이면 `totalSalePrice > 0` + 자산별 `standardPriceAtTransfer > 0` 필수 |
| 19 | `components/calc/transfer/CompanionAssetsSection.tsx` | **신규** | 자산 추가/삭제 UI. `AddressSearch` + Vworld NED API 호출로 공시가격 자동 채움. 상속 취득가액 "자동(주소+상속일)" / "수동 입력" 토글. Props: `{ assets, onChange }` |
| 20 | `components/calc/transfer/BundledAllocationPreview.tsx` | **신규** | 안분 결과 실시간 테이블 — PDF p388 표 재현(구분/기준시가/안분계산/양도가액 안분액). `apportionBundledSale` client-side 호출로 미리보기 |
| 21 | `components/calc/results/BundledAllocationCard.tsx` | **신규** | 결과 화면 안분 내역 카드 — 자산별 비과세/감면 상세 + `legalBasis` 표시 |
| 22 | `app/calc/transfer-tax/steps/Step1.tsx` | **수정** (L25~L89 options 그리드 뒤) | 물건 유형 선택 하단에 "함께 양도된 다른 자산이 있음" 토글 + 총 양도가 입력 + `CompanionAssetsSection` 조건부 렌더. L51 `right_to_move_in` 조건부 UI 패턴 참조. Props에 onChange 통해 companionAssets 배열 관리 |
| 23 | `app/calc/transfer-tax/steps/Step3.tsx` | **수정** (L295~L310 `acquisitionCause === "inheritance"` 블록 내부) | 기존 `decedentAcquisitionDate`(L301) 아래에 "상속 취득가액 산정" 라디오(자동/수동) 추가. 자동 선택 시 `inheritanceLandPricePerM2`·`inheritanceHousePrice`를 주소검색 + Vworld NED로 자동 채움. 수동 선택 시 직접 입력 필드 노출 |
| 24 | `app/calc/transfer-tax/steps/Step5.tsx` | **수정** (L54 `reductionType === "self_farming"` 블록 / L61 farmingYears 입력 바로 뒤) | 조건: `form.acquisitionCause === "inheritance"` + `form.reductionType === "self_farming"` → "피상속인 자경기간(년)" 입력(`decedentFarmingYears`) 노출. 본인 자경 ≥ 8년이면 "합산 불필요" 회색 안내. 본인 + 피상속인 합산 실시간 표시 |
| 25 | `app/calc/transfer-tax/TransferTaxCalculator.tsx` | **수정** (Orchestrator, 최소 변경) | `companionAssets` 존재 시 API 호출 분기 유지. Step 흐름은 기존 6단계 유지 (Step1·3·5만 내부 수정) |
| 26 | `components/calc/results/TransferTaxResultView.tsx` | **수정** | 결과에 `mode: "bundled"` 있으면 `BundledAllocationCard` 렌더. 자산별 결과 탭 또는 아코디언 |

---

## 핵심 인터페이스

### `bundled-sale-apportionment.ts`

```ts
export interface BundledAssetInput {
  assetId: string;
  assetLabel: string;
  assetKind: "housing" | "land" | "building";
  /** 양도시점 기준시가 (안분 키) — 주택: 개별주택가격, 토지: 공시지가×면적 */
  standardPriceAtTransfer: number;
  /** 취득시점 기준시가 — 취득가액 안분용(일괄취득 경우) */
  standardPriceAtAcquisition?: number;
  /** 자산 직접 귀속 필요경비 */
  directExpenses?: number;
  /** 상속·증여로 이미 자산별 취득가액이 확정된 경우 주입 — 안분 건너뜀 */
  fixedAcquisitionPrice?: number;
}

export interface BundledApportionmentInput {
  totalSalePrice: number;
  totalAcquisitionPrice?: number;
  commonExpenses?: number;
  assets: BundledAssetInput[];           // min 2
  method?: "standard_price_transfer";     // v1 고정
}

export interface BundledApportionedAsset {
  assetId: string;
  allocatedSalePrice: number;             // Σ = totalSalePrice 보장 (말단 잔여값 보정)
  allocatedAcquisitionPrice: number;
  allocatedExpenses: number;
  displayRatio: number;                   // 표시용 (계산 미사용)
}

export function apportionBundledSale(input: BundledApportionmentInput): {
  apportioned: BundledApportionedAsset[];
  totalStandardAtTransfer: number;
  residualAbsorbedBy: string;
  legalBasis: string;                     // "소득세법 시행령 §166⑥"
  warnings: string[];
};
```

**안분 알고리즘 핵심**
- 분모 = Σ standardPriceAtTransfer
- 각 자산 양도가 = `Math.floor(safeMultiplyThenDivide(total, num, denom))`
- **말단 자산 = total − Σ(이전 자산들)** → 원 단위 오차 완벽 흡수
- 취득가액: `fixedAcquisitionPrice` 있으면 그대로(상속 케이스), 없으면 `totalAcquisitionPrice` 비율 안분
- 공통경비: 양도가 비율과 동일 키로 안분 + 자산별 직접경비 합산

### `inheritance-acquisition-price.ts`

```ts
export interface InheritanceAcquisitionInput {
  inheritanceDate: Date;
  assetKind: "land" | "house_individual" | "house_apart";
  landAreaM2?: number;                    // land 필수
  /** 상속개시일 직전 공시된 단가(원/㎡) 또는 공시가격(원 총액) */
  publishedValueAtInheritance: number;
  marketValue?: number;                   // 시가 우선
  appraisalAverage?: number;              // 감정가 평균
}

export interface InheritanceAcquisitionResult {
  acquisitionPrice: number;
  method: "market_value" | "appraisal" | "supplementary";
  legalBasis: string;                     // "소득령 §163⑨ · 상증법 §60~§61"
  formula: string;
}

export function calculateInheritanceAcquisitionPrice(
  input: InheritanceAcquisitionInput,
): InheritanceAcquisitionResult;
```

**우선순위**: `marketValue` > `appraisalAverage` > `supplementary` (= 공시가격×면적 또는 공시가격)

### 자경농지 피상속인 합산 로직 (`transfer-tax.ts` 수정)

```ts
// 기존
if (reduction.farmingYears >= selfFarmingRules.conditions.minFarmingYears) {
  amount = Math.min(applyRate(calculatedTax, selfFarmingRules.maxRate), ...);
}

// 변경
const ownFarmingYears = reduction.farmingYears;
const needsDecedent = ownFarmingYears < selfFarmingRules.conditions.minFarmingYears;
const effectiveFarmingYears = needsDecedent
  ? ownFarmingYears + (reduction.decedentFarmingYears ?? 0)
  : ownFarmingYears;

if (effectiveFarmingYears >= selfFarmingRules.conditions.minFarmingYears) {
  amount = Math.min(applyRate(calculatedTax, selfFarmingRules.maxRate), selfFarmingRules.maxAmount);
  legalBasis = needsDecedent
    ? TRANSFER.REDUCTION_SELF_FARMING_INHERITED
    : TRANSFER.REDUCTION_SELF_FARMING;
}
```

→ PDF 사례(상속인 본인 자경 ~18년)는 `needsDecedent = false`, 기존 경로로 통과. 피상속인 합산은 본인 자경 8년 미달 시에만 활성화.

### API route.ts 분기 (의사코드)

```ts
export async function POST(req) {
  // ... rate limit + zod
  const input = parsed.data;
  const rates = await preloadTaxRates({...});

  if (input.companionAssets && input.companionAssets.length > 0) {
    // 1. 안분
    const apportion = apportionBundledSale({
      totalSalePrice: input.totalSalePrice ?? input.transferPrice,
      assets: [toBundledAsset(input, "primary"), ...input.companionAssets.map(toBundledAsset)],
    });

    // 2. 자산별 상속 취득가액(선택)
    for (const a of apportion.apportioned) {
      if (needsInheritanceValuation(a)) {
        a.allocatedAcquisitionPrice = calculateInheritanceAcquisitionPrice(...).acquisitionPrice;
      }
    }

    // 3. 다건 엔진 호출
    const items: TransferTaxItemInput[] = apportion.apportioned.map(a => toItem(a, input));
    const aggregated = calculateTransferTaxAggregate({ taxYear: input.taxYear, properties: items, annualBasicDeductionUsed: 0 }, rates);

    return NextResponse.json({ mode: "bundled", apportionment: apportion, aggregated });
  }

  // 기존 단건 경로
  const result = calculateTransferTax(toEngineInput(input), rates);
  await saveCalculation(...);  // 기존
  return NextResponse.json({ mode: "single", result });
}
```

---

## PDF 수치 검증 테스트 케이스

`__tests__/fixtures/pdf-bundled-farmland.ts`에 고정 상수 centralization:

```ts
export const PDF_P387_INHERITED_BUNDLED = {
  // 입력
  inheritanceDate: new Date("2005-04-07"),
  decedentAcqDate: new Date("1999-10-21"),
  transferDate: new Date("2023-02-15"),
  totalSalePrice: 225_000_000,
  houseStd: 116_000_000,              // 2022 개별주택가격
  landStd: 92_781_000,                // 793㎡ × 117,000
  landAreaM2: 793,
  landPricePerM2_2022: 117_000,
  // 상속개시일 직전 공시가격 (PDF 명시: 2004.1.1 개별공시지가 12,000원/㎡, 2005.1.1 개별주택가격 108,000,000원)
  inheritLandPricePerM2: 12_000,      // 2004.1.1 고시(2005.4.7 직전)
  inheritHousePrice: 108_000_000,     // 2005.1.1 고시
  houseInheritExpense: 1_250_000,
  landInheritExpense: 285_480,
  // 정답
  ans_houseAlloc: 125_011_376,
  ans_landAlloc:  99_988_624,
  ans_landTaxBase: 60_631_001,
  ans_landCalcTax: 8_791_440,
  ans_landReduction: 8_791_440,       // 100% 감면
  ans_landDetermined: 0,
  ans_localIncomeTax: 0,
};
```

**검증 테스트**
1. 안분: `allocatedSalePrice[0] = 125,011,376`, `[1] = 99,988,624`, Σ = 225,000,000 — `toBe()` 고정
2. 상속 취득가액 (토지): `12,000 × 793 = 9,516,000원` — `toBe()`
3. 농지 양도차익: `99,988,624 − (상속취득가액 + 필요경비 285,480 + 등록비용) = …`
4. 장특공 30% (17년 보유) 적용 후 양도소득금액
5. 기본공제 2,500,000 차감 후 과세표준 `60,631,001` — `toBe()` ※ PDF 재확인 필요
6. 산출세액 `8,791,440`, 감면세액 `8,791,440`, 결정세액 `0` — 모두 `toBe()`
7. 지방소득세 0 (결정세액 기반)
8. 주택 `isExempt = true`, 주택분 결정세액 0

**회귀 보증**
- 기존 `transfer-tax.test.ts` T-13 (자경농지 1억 한도) — `decedentFarmingYears` 미지정 → 기존 수치 불변 확인
- 기존 `transfer-tax-aggregate.test.ts` 전부 통과

---

## 상세 Todo List & 검증 게이트

**실행 원칙**
- 각 태스크는 TaskCreate로 생성, 시작 시 `in_progress`, **검증 통과 후에만** `completed`
- 한 태스크가 `completed`되기 전에는 다음 태스크 시작 금지 (dependency chain 엄격)
- 각 Phase 끝에 **Gate 검증** 통과 필수. Gate 실패 시 해당 Phase 내로 되돌아가 수정
- 기존 테스트 회귀 발생 시 즉시 중단하고 원인 분석

### Phase 1 — Pure Engine (DB·UI·Network 무관)

| ID | 태스크 | 검증 방법 | Gate |
|----|--------|-----------|------|
| T1-1 | `lib/tax-engine/types/bundled-sale.types.ts` 신규 (공개 타입) | `npx tsc --noEmit` | 타입 오류 0 |
| T1-2 | `lib/tax-engine/bundled-sale-apportionment.ts` 신규 — `types/bundled-sale.types.ts`에서 타입 import. `safeMultiplyThenDivide`·`Math.floor` 사용, 말단 잔여값 보정 | `npx tsc --noEmit` | 타입 오류 0 |
| T1-3 | `__tests__/fixtures/pdf-bundled-farmland.ts` PDF 고정 상수 fixture 작성 | 파일 존재 확인 | — |
| T1-4 | `__tests__/tax-engine/bundled-sale-apportionment.test.ts` 신규 (`_helpers` 미사용 — 단일 주제) | `npx vitest run __tests__/tax-engine/bundled-sale-apportionment.test.ts` | ✅ `toBe(125_011_376)` / `toBe(99_988_624)` + Σ `toBe(225_000_000)` |
| T1-5 | `lib/tax-engine/types/inheritance-acquisition.types.ts` 신규 | `npx tsc --noEmit` | 타입 오류 0 |
| T1-6 | `lib/tax-engine/inheritance-acquisition-price.ts` 신규 | `npx tsc --noEmit` | 타입 오류 0 |
| T1-7 | `__tests__/tax-engine/inheritance-acquisition-price.test.ts` 신규 | `npx vitest run __tests__/tax-engine/inheritance-acquisition-price.test.ts` | ✅ 전 테스트 통과 |
| T1-8 | `lib/tax-engine/legal-codes/transfer.ts` 상수 3개 추가 (barrel 자동 재수출) | `grep "REDUCTION_SELF_FARMING_INHERITED\|ACQ_INHERITED_SUPPLEMENTARY\|BUNDLED_APPORTIONMENT" lib/tax-engine/legal-codes/transfer.ts` | 3개 모두 히트 |
| T1-9 | `lib/tax-engine/types/transfer.types.ts` L190 — `self_farming` variant에 `decedentFarmingYears?: number` 추가 | `npx tsc --noEmit` | 타입 오류 0 (기존 호출자는 optional 미지정으로 통과) |
| T1-10 | `lib/tax-engine/transfer-tax-rate-calc.ts` L327~L330 `calcReductions()` self_farming 분기 수정 — 본인 자경 8년 판정 → 미충족 시 `effective = farmingYears + (decedentFarmingYears ?? 0)`로 재판정. `reductionTypeLabel`과 `legalBasis` 라벨 분기 | `npx tsc --noEmit` | 타입 오류 0 |
| T1-11 | `__tests__/tax-engine/transfer-tax/reductions-and-exempt.test.ts` 확장 — 피상속인 합산 ON/OFF 회귀 describe 추가. 기존 T-13(자경 1억 한도) 수치 불변 확인 | `npx vitest run __tests__/tax-engine/transfer-tax/reductions-and-exempt.test.ts` | ✅ 기존 + 신규 **전부 통과** |
| T1-12 | Phase 1 전체 회귀 | `npx vitest run __tests__/tax-engine/` | ✅ transfer-tax 하위 4개 파일 + 단일 주제 모두 통과 |

**Gate-1 (Phase 1 종료 조건)**
```bash
npx vitest run __tests__/tax-engine/          # 양도세 관련 전부 ✅
npx tsc --noEmit                              # 타입 에러 0
```
→ 통과 시 Phase 2 착수.

### Phase 2 — API Layer

| ID | 태스크 | 검증 방법 | Gate |
|----|--------|-----------|------|
| T2-1 | `lib/api/transfer-tax-schema.ts` — `self_farming` variant에 `decedentFarmingYears?` 추가 + 최상위에 `companionAssets?`, `totalSalePrice?`, `apportionmentMethod?` 추가 + `companionAssetSchema` 신규 정의 | `npx tsc --noEmit` | 타입 오류 0 |
| T2-2 | `app/api/calc/transfer/route.ts` Orchestrator 분기 — `companionAssets` 유무로 단건/일괄 처리 | `npx tsc --noEmit` | 타입 오류 0 |
| T2-3 | `__tests__/api/transfer.route.bundled.test.ts` 신규 — PDF end-to-end (주택 비과세 + 농지 100% 감면 + 결정세액 0) | `npx vitest run __tests__/api/transfer.route.bundled.test.ts` | ✅ 주택 `isExempt=true`, 농지 `determinedTax=0` |
| T2-4 | 기존 단건 API 회귀 (companionAssets 미지정 시) | `npx vitest run __tests__/api/` | ✅ 기존 전부 통과 |

**Gate-2 (Phase 2 종료 조건)**
```bash
npm test                                      # 전체 72파일 / 1,407+ tests ✅
npx tsc --noEmit
```
→ 통과 시 Phase 3 착수. Gate-2 실패 시 회귀 원인 분석 후 해당 태스크 `in_progress`로 되돌림.

### Phase 3 — UI Layer

| ID | 태스크 | 검증 방법 | Gate |
|----|--------|-----------|------|
| T3-1 | `lib/stores/calc-wizard-store.ts` `TransferFormData` 확장 — `companionAssets`, `decedentFarmingYears`, `inheritanceValuationMode`, `inheritanceLandPricePerM2`, `inheritanceHousePrice`. partialize 검토 | `npx tsc --noEmit` | 타입 오류 0 |
| T3-2 | `lib/calc/transfer-tax-api.ts` — `callTransferTaxAPI()`에 `companionAssets` 매핑 추가 | `npx tsc --noEmit` | — |
| T3-3 | `lib/calc/transfer-tax-validate.ts` — 일괄양도 모드 step별 유효성 | `npx tsc --noEmit` | — |
| T3-4 | `components/calc/transfer/CompanionAssetsSection.tsx` 신규 — 자산 추가/삭제, AddressSearch 연동, 상속 취득가액 자동/수동 토글 | `npx tsc --noEmit` | — |
| T3-5 | `components/calc/transfer/BundledAllocationPreview.tsx` 신규 — client-side `apportionBundledSale` 호출, PDF p388 표 재현 | `npx tsc --noEmit` | — |
| T3-6 | `components/calc/results/BundledAllocationCard.tsx` 신규 — 결과 화면 자산별 상세 + `legalBasis` 표시 | `npx tsc --noEmit` | — |
| T3-7 | `app/calc/transfer-tax/steps/Step1.tsx` — "함께 양도된 다른 자산" 토글 + `CompanionAssetsSection` 조건부 렌더 | `npx tsc --noEmit` | — |
| T3-8 | `app/calc/transfer-tax/steps/Step3.tsx` — 상속 선택 시 "보충적평가액 자동/수동" 토글 노출 | `npx tsc --noEmit` | — |
| T3-9 | `app/calc/transfer-tax/steps/Step5.tsx` — self_farming + 상속 취득 시 `decedentFarmingYears` 입력 노출 + 본인 8년 충족 시 "합산 불필요" 안내 | `npx tsc --noEmit` | — |
| T3-10 | `app/calc/transfer-tax/TransferTaxCalculator.tsx` — Orchestrator 최소 수정 (API 호출 분기만, Step 흐름 불변) | `npx tsc --noEmit` | — |
| T3-11 | `components/calc/results/TransferTaxResultView.tsx` — `mode: "bundled"` 분기하여 `BundledAllocationCard` 렌더 | `npx tsc --noEmit` | — |
| T3-12 | 전체 회귀 | `npm test && npm run lint && npm run build` | ✅ 전부 통과 |
| T3-13 | 개발 서버 수동 검증 (Verification Plan 5단계) | `npm run dev` + 브라우저 | ✅ PDF 수치 정확 표시 |

**Gate-3 (Phase 3 종료 조건)**
```bash
npm test                                      # 72파일 / 1,407+ tests ✅
npm run lint                                  # 경고 0
npm run build                                 # 빌드 성공
# 수동: http://localhost:3000/calc/transfer-tax 에서 PDF 시나리오 재현
```
→ 통과 시 작업 완료.

### 각 Phase 공통 원칙
1. **태스크 `in_progress` 진입 전** → TaskList로 이전 태스크가 모두 `completed`인지 확인
2. **태스크 `completed` 전** → 해당 태스크의 검증 방법 실행 및 통과 확인
3. **실패 시** → 태스크를 `in_progress` 상태로 유지하며 원인 수정, 테스트 재실행
4. **하위호환 위반 감지 시** (기존 테스트 실패) → 즉시 중단, 사용자에게 보고
5. 각 Phase 종료 게이트 통과 전에는 다음 Phase 진입 금지

---

## Critical Files (분리 구조 반영 경로)

**신규 생성**
- `lib/tax-engine/types/bundled-sale.types.ts`
- `lib/tax-engine/bundled-sale-apportionment.ts`
- `lib/tax-engine/types/inheritance-acquisition.types.ts`
- `lib/tax-engine/inheritance-acquisition-price.ts`
- `components/calc/transfer/CompanionAssetsSection.tsx`
- `components/calc/transfer/BundledAllocationPreview.tsx`
- `components/calc/results/BundledAllocationCard.tsx`
- `__tests__/fixtures/pdf-bundled-farmland.ts`
- `__tests__/tax-engine/bundled-sale-apportionment.test.ts`
- `__tests__/tax-engine/inheritance-acquisition-price.test.ts`
- `__tests__/api/transfer.route.bundled.test.ts`

**수정**
- `lib/tax-engine/legal-codes/transfer.ts` — TRANSFER 상수 3개 추가 (barrel `legal-codes.ts` 자동 재수출)
- `lib/tax-engine/types/transfer.types.ts` L191 — `self_farming` variant에 `decedentFarmingYears?` 추가
- `lib/tax-engine/transfer-tax-rate-calc.ts` L251 `calcReductions()` L327~L330 self_farming 분기 — 피상속인 자경 합산
- `lib/api/transfer-tax-schema.ts` L150 `reductionSchema`·L334 `propertyBaseShape`·L376 `propertySchema.superRefine` — self_farming 확장 + companionAssets + `companionAssetSchema` 신규
- `app/api/calc/transfer/route.ts` L15 (inputSchema) L203 (parcels 매핑) 근방 — Orchestrator 분기 (`multi/route.ts`는 건드리지 않음)
- `lib/stores/calc-wizard-store.ts` L29 `TransferFormData` + L188 `defaultFormData` — 5개 필드 추가
- `lib/calc/transfer-tax-api.ts` — companionAssets API 페이로드 매핑
- `lib/calc/transfer-tax-validate.ts` — 일괄양도 step별 유효성
- `app/calc/transfer-tax/steps/Step1.tsx` L25~L89 — 컴패니언 토글 + 총양도가 입력
- `app/calc/transfer-tax/steps/Step3.tsx` L295~L310 (상속 블록 내부) — 보충적평가액 자동/수동 토글
- `app/calc/transfer-tax/steps/Step5.tsx` L54~L62 (self_farming 블록 내부) — decedentFarmingYears 조건부 입력
- `app/calc/transfer-tax/TransferTaxCalculator.tsx` — API 호출 분기만 (Step 흐름 불변)
- `components/calc/results/TransferTaxResultView.tsx` — `mode: "bundled"` 분기하여 BundledAllocationCard 렌더
- `__tests__/tax-engine/transfer-tax/reductions-and-exempt.test.ts` — 피상속인 자경 합산 회귀 describe 추가

**참고(재사용 — 변경 없음)**
- `lib/tax-engine/transfer-tax.ts` — Orchestrator `calculateTransferTax()` L141. 직접 수정 없음 (rate-calc.ts만 수정)
- `lib/tax-engine/transfer-tax-helpers.ts` — H-1~H-6 기초 계산. 변경 없음
- `lib/tax-engine/transfer-tax-aggregate.ts` — 호출 대상 다건 엔진. 인터페이스·결과 shape 변경 없음
- `lib/tax-engine/multi-parcel-transfer.ts` L178~L200 — 안분 + 말단 잔여값 보정 패턴 레퍼런스 (apportionBundledSale 구현 시 이 패턴 복제)
- `lib/tax-engine/tax-utils.ts` — `safeMultiplyThenDivide`, `applyRate`, `calculateProration`
- `__tests__/tax-engine/_helpers/mock-rates.ts` L167 `baseTransferInput()` — 테스트 입력 팩토리
- `app/api/address/standard-price/route.ts` — Vworld NED 연도별 공시가격 (UI 자동채움용, 이미 존재)
- `app/api/calc/transfer/multi/route.ts` — 다건 경로. **변경하지 않음** (일괄양도는 단건 경로에 escalate)

---

## Verification Plan

**엔진 단위 테스트**
```bash
npx vitest run __tests__/tax-engine/bundled-sale-apportionment.test.ts
npx vitest run __tests__/tax-engine/inheritance-acquisition-price.test.ts
npx vitest run __tests__/tax-engine/transfer-tax.test.ts   # 회귀
```

**API E2E**
```bash
npx vitest run __tests__/api/transfer.route.bundled.test.ts
```

**전체 회귀**
```bash
npm test                # 339+ 테스트 모두 통과
npm run lint
npm run build
```

**UI 수동 테스트** (localhost:3000/calc/transfer-tax)
1. 주소검색으로 주택 입력, 취득원인 "상속" 선택 → 상속개시일 입력
2. "함께 양도된 자산 추가" 클릭 → 농지 선택, 주소검색, 면적 793, 자경 18년 입력
3. 총 양도가 225,000,000 입력
4. 안분 미리보기: 주택 125,011,376 / 농지 99,988,624 표시 확인
5. 제출 → 결과: 주택 비과세 + 농지 100% 감면 + 총 결정세액 0 확인

**PDF 사례 재현 확인**
- 농지 과세표준 60,631,001원 정확히 표시
- 산출세액 8,791,440원 표시
- 감면세액 8,791,440원 표시
- 납부세액 0원
- 지방소득세 0원

---

## 하위호환성 (회귀 방지)

| 항목 | 보증 |
|------|------|
| 단건 `/api/calc/transfer` (기존 페이로드) | `companionAssets` undefined → 기존 경로 100% 유지 |
| 단건 결과 응답 shape | 기존 필드 유지, bundled 모드는 `mode: "bundled"` + 추가 필드만 |
| `TransferTaxItemInput` | 필드 추가만(옵셔널) → 기존 다건 호출자 영향 없음 |
| `decedentFarmingYears` 미지정 | 기존 T-13 자경농지 테스트 수치 불변 |
| `tax_rates` DB | 변경 없음 |
| 공시가격 역사 데이터 | Vworld NED API 실시간 조회만 사용, 로컬 하드코딩 금지 |

---

## 리스크 / 미결 사항

1. **PDF 상속개시일 직전 공시가격 값**
   - PDF 본문에 "2004.1.1 개별공시지가 12,000원/㎡", "2005.1.1 개별주택가격 108,000,000원"으로 추정되나 직전 고시 기준 재확인 필요(Phase 1-2 구현 전 PDF 재독해)
2. **PDF 과세표준 60,631,001원 역산**
   - 양도가 99,988,624 − 취득가액 9,516,000 − 필요경비 285,480(등기비용) − 개산공제? = 양도차익 90,187,144
   - 장특공 30% (15년 이상 보유) 27,056,143 차감 → 양도소득금액 63,131,001
   - 기본공제 2,500,000 → 과세표준 60,631,001 ✓
   - 산출세액 60,631,001 × 24% − 5,760,000(누진공제) = 8,791,440 ✓ (2023년 기본세율 24% 구간)
3. **"개산공제"**
   - PDF 본문에 등장하나 농지 취득가액 9,516,000 × 3% ≈ 285,480 (필요경비 명목)? 또는 별도 필요경비 285,480(PDF 명시)인지 확인 필요
   - → 테스트에서 해당 값을 그대로 고정해 양도차익이 PDF 숫자와 일치하도록 조정
4. **지방소득세 표현**
   - PDF p391: "산출세액 879,144원 전액 감면" → 감면 전 지방소득세도 표시 필요할 수 있음
   - YAGNI 원칙상 v1은 결정세액 기반 지방소득세만 반환(=0), 감면 전 지방소득세는 후속 PR
5. **농특세**
   - 조특법 §69 감면은 농특세법 §4 12호 비과세 — 현 엔진은 양도 농특세 로직 자체가 없음
   - v1은 응답에서 농특세 언급 생략(기존 동일). PDF와 완전 일치하므로 문제 없음
