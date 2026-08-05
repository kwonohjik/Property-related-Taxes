# 배우자등 이월과세 + 비교과세 (§97조의2) — UI 설계

> Feature: `transfer-tax-carryover-taxation`
> 작성일: 2026-05-04
> 작성자: transfer-tax-ui-senior
> 참조: `docs/00-pm/transfer-tax-carryover-taxation.plan.md`
> **상태**: ✅ **구현됨** (2026-08-05 코드 실측) — `components/calc/transfer/CarryoverGiftBlock.tsx` 실재 + 엔진 `transfer-tax-carryover.ts` 연동 — 이월과세 UI 구현됨.
> ⚠️ **산출물 실재까지만 확인했다** — 개별 Phase 완주 여부는 감사하지 않았다.
> ~~종전 표기: Design (Do 진입 전)~~

---

## 1. 사용자 시나리오 (입력 흐름)

### 1.1 진입 경로

```
Step 1 (자산 목록)
  → 자산 카드 내 "취득원인" 셀렉트
  → "이월과세(증여)" 선택
  → CarryoverGiftBlock 펼침 (증여자 정보 입력)
  → 환산취득가 토글 ON 시 PHD/APD 입력 (PreHousingDisclosureSection 재사용)
  → 적용배제 체크박스 섹션 (③ 하단)
  → "계산하기" 실행
  → 결과 화면: CarryoverComparisonCard (A·B 나란히 + 채택 배지)
```

### 1.2 시나리오별 분기

| 시나리오 | 분기 조건 | UI 표현 |
|---|---|---|
| 기본 이월과세 (실거래가 직접 입력) | `useEstimatedAcquisition === false` | 증여자 취득가액 CurrencyInput 표시 |
| 환산취득가 사용 (PHD/APD) | `useEstimatedAcquisition === true` | PHD/APD 입력 패널 펼침 (PreHousingDisclosureSection 재사용) |
| 적용배제 — 수용 (②1호) | `exclusionDeclared.expropriationWithin2Years === true` | 경고 배너 표시, 비교과세 미표시 |
| 적용배제 — 1세대1주택 (②2호) | `exclusionDeclared.oneHouseExemptionApplies === true` | 경고 배너 표시, 비교과세 미표시 |
| 가업상속공제 (④항) | `exclusionDeclared.isFamilyBusinessInheritedAsset === true` | validation 차단 + "v1 미지원" 안내 |
| 양도일 ≥ 2024.1.1 | `transferDate >= "2024-01-01"` | 증여자 자본적지출 필드 활성화 |
| 양도일 < 2024.1.1 | `transferDate < "2024-01-01"` | 증여자 자본적지출 필드 비활성 + 안내 표시 |

---

## 2. 컴포넌트 구조

### 2.1 신규 파일 — 분리 신규 (CompanionAcqGiftBlock 확장 금지)

**권장: CarryoverGiftBlock.tsx 신규 파일 생성**

근거:
- `CompanionAcqGiftBlock`은 "증여 신고가액 단순 입력" 전용. 기존 `acquisitionCause === "gift"` 흐름과 인터페이스 불일치 없이 격리.
- 이월과세 블록은 필드 수가 7+개로 기존 블록의 3배 이상. 한 파일 내 분기로 구현하면 800줄 정책 즉시 위반.
- 기존 `gift` 흐름 회귀 영향 제로. `acquisitionCause === "carryover_gift"` 조건에서만 진입.

```
components/calc/transfer/
  CarryoverGiftBlock.tsx            # 신규 — 이월과세(증여) 전용 블록
  CarryoverGiftExclusionSection.tsx # 신규 — 적용배제 체크박스 섹션 (분리)

components/calc/results/transfer/
  CarryoverComparisonCard.tsx       # 신규 — A·B 나란히 비교 결과 카드
```

### 2.2 재사용 컴포넌트

| 용도 | 컴포넌트 | 비고 |
|---|---|---|
| 증여 등기접수일 입력 | `DateInput` | "증여 등기접수일" 라벨 (주의: "사실상 취득일" 금지) |
| 증여자 취득일 입력 | `DateInput` | "증여자 취득일" |
| 증여자 취득가액 | `CurrencyInput` | 환산 미사용 시만 표시 |
| 환산취득가 토글 | `ToggleCard` (tone="amber") | `useEstimatedAcquisition` 연동 |
| PHD/APD 입력 패널 | `PreHousingDisclosureSection` | 증여자 기준으로 asset props 재매핑 |
| 증여세 상당액 | `CurrencyInput` + `LawArticleModal` | §163의2 산식 안내 배지 |
| 증여자 자본적지출 | `CurrencyInput` | 시행시기 가드 `disabled` + `disabledReason` |
| 증여 당시 평가액 | `CurrencyInput` | B 시나리오 취득가 — 항상 표시 |
| 적용배제 체크박스 | `ToggleCard` (tone="rose") | 3종 (②1·②2·④항) |
| 법령 안내 배지 | `LawArticleModal` | §97조의2, §163의2 |

### 2.3 취득원인 셀렉트 옵션 추가 위치

파일: `app/calc/transfer-tax/steps/Step1.tsx` (또는 자산 카드 내 취득원인 Select가 위치한 컴포넌트)

현재 옵션:
```
purchase | inheritance | gift
```

변경 후:
```
purchase | inheritance | gift | carryover_gift
```

라벨 표기: `"이월과세(증여)"` — 괄호 내 "증여" 명시로 일반 증여(`gift`)와 구분.

---

## 3. 입력 필드 명세

### 3.1 CarryoverGiftBlock — 필드 목록

> 배치 순서 = 엔진 계산 로직 순서 (§97조의2 ① 적용 판정 → 취득일·취득가 → 증여세·capex → 비교용 B 취득가)

#### 섹션 ① — 증여 기본 정보 (amber 카드)

| 필드 | 라벨 | 타입 | 컴포넌트 | 힌트/안내 | 검증 |
|---|---|---|---|---|---|
| `carryover.giftRegistryDate` | 증여 등기접수일 | `string` (YYYY-MM-DD) | `DateInput` | 소득세법 §97조의2 ③ 등기부 소유기간 기산일 | 필수 |
| `carryover.donorAcquisitionDate` | 증여자 취득일 | `string` (YYYY-MM-DD) | `DateInput` | 보유기간·장기보유공제 기산일 (§95 ④) | 필수 |
| `carryover.donorAcquisitionCause` | 증여자 취득원인 | `"purchase" \| "inheritance" \| "gift"` | `RadioCardGroup` (inline) | 증여자의 취득 경위 (환산 방식 결정) | 필수 |

**라벨 명확화 규칙**:
- "증여 등기접수일": §97조의2 ③에서 "등기부에 기재된 소유기간" 명시. "사실상 취득일" / "잔금일" 사용 절대 금지.
- hint: `"소득세법 §97조의2 ③ — 이월과세 적용기간 기산일 (등기부 기재일)"` + 법령 배지

#### 섹션 ② — 증여자 취득가액 (amber 카드)

| 필드 | 라벨 | 타입 | 컴포넌트 | 힌트/안내 | 검증 |
|---|---|---|---|---|---|
| `carryover.useEstimatedAcquisition` | 환산취득가 사용 (PHD/APD) | `boolean` | `ToggleCard` (tone="amber") | "증여자 취득 당시 개별주택가격 미공시 시 3-시점 환산" | — |
| `carryover.donorAcquisitionPrice` | 증여자 취득가액 | `number?` | `CurrencyInput` | "증여자의 실제 취득가액 (매매계약서 등)" | 환산 미사용 시 필수 |

**환산 ON 시**: `PreHousingDisclosureSection` 또는 공동주택 APD 입력 패널 펼침 (기존 PHD 컴포넌트를 "증여자 기준" 라벨로 재사용). asset props는 증여자 정보(`donorAcquisitionDate`, `phdFirstDisclosureDate` 등)로 매핑.

#### 섹션 ③ — 필요경비 가산 (amber 카드)

| 필드 | 라벨 | 타입 | 컴포넌트 | 힌트/안내 | 검증 |
|---|---|---|---|---|---|
| `carryover.giftTaxAmount` | 증여세 상당액 | `number` | `CurrencyInput` + `LawArticleModal` (§163의2) | `"증여세 × (해당 자산가액 ÷ 증여재산총액). 산식 안내 ?"` | 필수 (0 허용, 미신고 시 0 입력) |
| `carryover.donorCapitalExpenditure` | 증여자 자본적지출 | `number?` | `CurrencyInput` | 아래 시행시기 가드 참조 | 선택 (양도일 ≥ 2024.1.1. 시만 활성) |

**증여세 상당액 LawArticleModal 표시 위치**:
- `FieldCard` `trailing` 슬롯에 `?` 배지 → 클릭 시 모달
- 모달 내용: `§163의2 산식: 증여세 × (해당 자산가액 / 증여재산총액)` + 법제처 원문 링크

**증여자 자본적지출 시행시기 가드**:
- `양도일(transferDate) < "2024-01-01"` 시:
  - `ToggleCard disabled={true}` `disabledReason="2024.1.1. 이후 양도분부터 적용 (2023.12.31. 신설)"`
  - 또는 `CurrencyInput disabled` 상태로 표시 + hint에 안내 텍스트
- `양도일 >= "2024-01-01"` 시: 활성화, 선택 입력

#### 섹션 ④ — 비교과세 기준 (Scenario B 취득가)

| 필드 | 라벨 | 타입 | 컴포넌트 | 힌트/안내 | 검증 |
|---|---|---|---|---|---|
| `carryover.giftDateValuation` | 증여 당시 평가액 | `number` | `CurrencyInput` | "비교과세 미적용(B) 시나리오의 취득가액. 보충적평가액 또는 시가" | 필수 |

hint 상세: `"이월과세 미적용 시나리오에서 수증자의 취득가액으로 사용됩니다 (보충적평가액·시가·감정가 중 해당 금액)"`

### 3.2 CarryoverGiftExclusionSection — 적용배제 (rose 카드)

> 이월과세 블록 하단에 배치. 사용자가 명시적으로 선언하는 항목.

| 필드 | 라벨 | 타입 | 컴포넌트 | 선택 시 효과 |
|---|---|---|---|---|
| `carryover.exclusionDeclared.expropriationWithin2Years` | 사업인정고시일 2년 이전 증여 토지·건물의 협의매수·수용 (§97조의2 ② 1호) | `boolean` | `ToggleCard` (tone="rose", variant="card") | ON → validation: 이월과세 미적용 안내, 일반 양도세 계산 |
| `carryover.exclusionDeclared.oneHouseExemptionApplies` | 이월과세 적용 시 1세대1주택 비과세 해당 (§97조의2 ② 2호, **12억 초과 고가주택 포함**) | `boolean` | `ToggleCard` (tone="rose", variant="card") | ON → validation: 이월과세 미적용 안내 |
| `carryover.exclusionDeclared.isFamilyBusinessInheritedAsset` | 가업상속공제 적용 자산 (§97조의2 ④) | `boolean` | `ToggleCard` (tone="rose", variant="card") | ON → validation 차단 + "v1 미지원, 수동 계산 필요" 오류 메시지 |

**UI 주의사항**:
- `②2호` 라벨에 `"고가주택 포함"` 괄호 명시 필수 (Plan §3.4 확정)
- 3개 토글은 각각 독립 — 복수 선택 가능 (단, ④항 ON이면 validation 차단 우선)
- 각 ToggleCard에 법조문 배지 포함 (`LawArticleModal` 연결)

---

## 4. 8개 동기화 지점 매핑표

### ① AssetForm 타입 확장

**파일**: `lib/stores/calc-wizard-asset.ts`

```typescript
// AssetForm 인터페이스에 추가
/** 이월과세(증여) 서브객체 — acquisitionCause === "carryover_gift" 시만 사용 */
carryover?: {
  /** 증여 등기접수일 (YYYY-MM-DD) — §97조의2 ③ 기산일 */
  giftRegistryDate: string;
  /** 증여자 취득일 (YYYY-MM-DD) — 보유기간·LTHD 기산 §95④ */
  donorAcquisitionDate: string;
  /** 증여자 취득원인 */
  donorAcquisitionCause: "purchase" | "inheritance" | "gift";
  /** 환산취득가 사용 여부 (true = PHD/APD 입력) */
  useEstimatedAcquisition: boolean;
  /** 증여자 취득가액 — 환산 미사용 시 */
  donorAcquisitionPrice: string;
  /** 증여세 상당액 (사용자 입력, §163의2 산식 기반) */
  giftTaxAmount: string;
  /** 증여자 자본적지출 (§97조의2 ① 2호 후단, 2024.1.1~ 양도분) */
  donorCapitalExpenditure: string;
  /** 증여 당시 평가액 — Scenario B 취득가 */
  giftDateValuation: string;
  /** 적용배제 선언 */
  exclusionDeclared: {
    expropriationWithin2Years: boolean;
    oneHouseExemptionApplies: boolean;
    isFamilyBusinessInheritedAsset: boolean;
  };
};

// acquisitionCause 유니언 타입 확장
acquisitionCause: "purchase" | "inheritance" | "gift" | "carryover_gift"; // carryover_gift 추가
```

### ② initial value

**파일**: `lib/stores/calc-wizard-asset.ts` — `makeDefaultAsset()` 팩토리

```typescript
// makeDefaultAsset() 반환 객체에 추가
carryover: {
  giftRegistryDate: "",
  donorAcquisitionDate: "",
  donorAcquisitionCause: "purchase" as const,
  useEstimatedAcquisition: false,
  donorAcquisitionPrice: "",
  giftTaxAmount: "",
  donorCapitalExpenditure: "",
  giftDateValuation: "",
  exclusionDeclared: {
    expropriationWithin2Years: false,
    oneHouseExemptionApplies: false,
    isFamilyBusinessInheritedAsset: false,
  },
},
```

### ③ normalize fallback

**파일**: `lib/stores/calc-wizard-asset.ts` — `migrateAsset()` 함수

```typescript
// migrateAsset() 내 추가
// acquisitionCause 유니언 guard — 신규 값 추가로 인한 legacy 데이터 호환
const validCauses = ["purchase", "inheritance", "gift", "carryover_gift"];
if (!validCauses.includes(a.acquisitionCause as string)) {
  a.acquisitionCause = "purchase";
}

// carryover 서브객체: carryover_gift 이외 취득원인에서는 stripping
if (a.acquisitionCause !== "carryover_gift") {
  // carryover 객체가 있어도 무시 (storage 잔재 정리)
  a.carryover = {
    giftRegistryDate: "",
    donorAcquisitionDate: "",
    donorAcquisitionCause: "purchase",
    useEstimatedAcquisition: false,
    donorAcquisitionPrice: "",
    giftTaxAmount: "",
    donorCapitalExpenditure: "",
    giftDateValuation: "",
    exclusionDeclared: {
      expropriationWithin2Years: false,
      oneHouseExemptionApplies: false,
      isFamilyBusinessInheritedAsset: false,
    },
  };
} else {
  // carryover_gift: 각 서브필드 개별 migrate
  const c = (a.carryover ?? {}) as Record<string, unknown>;
  a.carryover = {
    giftRegistryDate: typeof c.giftRegistryDate === "string" ? c.giftRegistryDate : "",
    donorAcquisitionDate: typeof c.donorAcquisitionDate === "string" ? c.donorAcquisitionDate : "",
    donorAcquisitionCause: ["purchase","inheritance","gift"].includes(c.donorAcquisitionCause as string)
      ? (c.donorAcquisitionCause as "purchase"|"inheritance"|"gift")
      : "purchase",
    useEstimatedAcquisition: typeof c.useEstimatedAcquisition === "boolean" ? c.useEstimatedAcquisition : false,
    donorAcquisitionPrice: typeof c.donorAcquisitionPrice === "string" ? c.donorAcquisitionPrice : "",
    giftTaxAmount: typeof c.giftTaxAmount === "string" ? c.giftTaxAmount : "",
    donorCapitalExpenditure: typeof c.donorCapitalExpenditure === "string" ? c.donorCapitalExpenditure : "",
    giftDateValuation: typeof c.giftDateValuation === "string" ? c.giftDateValuation : "",
    exclusionDeclared: {
      expropriationWithin2Years: !!(c.exclusionDeclared as Record<string,unknown>)?.expropriationWithin2Years,
      oneHouseExemptionApplies: !!(c.exclusionDeclared as Record<string,unknown>)?.oneHouseExemptionApplies,
      isFamilyBusinessInheritedAsset: !!(c.exclusionDeclared as Record<string,unknown>)?.isFamilyBusinessInheritedAsset,
    },
  };
}
```

### ④ API 변환

**파일**: `lib/calc/transfer-tax-api.ts` — `buildAssetPayload()` 및 단건 API 요청 본체

```typescript
// buildAssetPayload() 내 추가 (기존 donorAcquisitionDate 분기 교체)

// carryover_gift 처리: carryoverTaxation 객체 빌드
const carryoverTaxation =
  asset.acquisitionCause === "carryover_gift" && asset.carryover
    ? {
        giftRegistryDate: asset.carryover.giftRegistryDate || undefined,
        donorAcquisitionDate: asset.carryover.donorAcquisitionDate || undefined,
        donorAcquisitionPrice: parseAmount(asset.carryover.donorAcquisitionPrice) > 0
          ? parseAmount(asset.carryover.donorAcquisitionPrice)
          : undefined,
        useEstimatedAcquisition: asset.carryover.useEstimatedAcquisition,
        giftTaxAmount: parseAmount(asset.carryover.giftTaxAmount),
        // 시행시기 가드: 양도일 < 2024-01-01 이면 0으로 처리
        donorCapitalExpenditure: (() => {
          const capex = parseAmount(asset.carryover.donorCapitalExpenditure);
          const isAfter2024 = form.transferDate >= "2024-01-01";
          return isAfter2024 && capex > 0 ? capex : 0;
        })(),
        giftDateValuation: parseAmount(asset.carryover.giftDateValuation),
        exclusionDeclared: asset.carryover.exclusionDeclared,
      }
    : undefined;

// 기존 donorAcquisitionDate 분기 수정:
donorAcquisitionDate:
  asset.acquisitionCause === "gift" && asset.donorAcquisitionDate
    ? asset.donorAcquisitionDate
    : asset.acquisitionCause === "carryover_gift" && asset.carryover?.donorAcquisitionDate
    ? asset.carryover.donorAcquisitionDate
    : undefined,

// 반환 객체에 추가:
carryoverTaxation,
```

**단건 API 요청 본체 (`callTransferTaxAPI`)**: carryoverTaxation은 `buildAssetPayload`를 통해 이미 포함됨. 별도 최상위 처리 불필요.

### ⑤ UI 입력 위젯

**파일**: 신규 `components/calc/transfer/CarryoverGiftBlock.tsx`

활성화 조건:
```typescript
// 자산 카드 내 취득원인 Select 조건
{asset.acquisitionCause === "carryover_gift" && (
  <CarryoverGiftBlock
    asset={asset}
    transferDate={form.transferDate}
    onChange={(patch) => updateAsset(asset.assetId, patch)}
  />
)}
```

컴포넌트 내부 구조 (800줄 정책 준수):
```
CarryoverGiftBlock.tsx        # 메인 (섹션 ①②③④ 구성, 목표 < 350줄)
  └ CarryoverGiftExclusionSection.tsx  # 적용배제 섹션 분리 (< 150줄)
```

취득원인 Select 옵션 위치: `components/calc/transfer/CompanionAssetCard.tsx` (또는 자산 카드 컴포넌트) 내 `acquisitionCause` Select

```typescript
const ACQUISITION_CAUSE_OPTIONS = [
  { value: "purchase", label: "매매" },
  { value: "inheritance", label: "상속" },
  { value: "gift", label: "증여" },
  { value: "carryover_gift", label: "이월과세(증여)" }, // 신규 추가
];
```

### ⑥ 사이드바 합계

**파일**: `lib/stores/calc-wizard-store.ts` — `computeTransferSummary()` 함수

표시 가능 항목 (입력값으로 즉시 계산 가능):
- 증여세 상당액: `carryover.giftTaxAmount` → 사이드바 "필요경비 가산 (증여세)" 항목으로 표시
- 증여자 자본적지출: `carryover.donorCapitalExpenditure` → "증여자 자본적지출" 항목 (양도일 ≥ 2024 시만)
- 증여 당시 평가액: 사이드바에는 표시 안 함 (B 시나리오 취득가 — 비교과세 결과 후 확인)

```typescript
// computeTransferSummary() 내 필요경비 산정 시 추가
if (primary.acquisitionCause === "carryover_gift" && primary.carryover) {
  const giftTax = parseRaw(primary.carryover.giftTaxAmount);
  const isAfter2024 = form.transferDate >= "2024-01-01";
  const donorCapex = isAfter2024 ? parseRaw(primary.carryover.donorCapitalExpenditure) : 0;
  if (giftTax > 0 || donorCapex > 0) {
    // 사이드바 totalNecessaryExpense에 가산 (단, API 결과 도착 전 미리보기 목적)
    totalNecessaryExpense += giftTax + donorCapex;
  }
}
```

### ⑦ 결과 카드 산식·표시

**파일**: 신규 `components/calc/results/transfer/CarryoverComparisonCard.tsx`

**표시 조건**: `result.carryoverTaxationDetail?.isEligible === true || result.carryoverTaxationDetail?.exclusionReason !== undefined`

**레이아웃**: 아래 §5 와이어프레임 참조.

통합 위치: `components/calc/results/TransferTaxResultView.tsx` 내 결과 상단에 삽입 (요약 카드 직후).

### ⑧ Validation

**파일**: `lib/calc/transfer-tax-validate.ts` — `validateAssetAcquisition()` 함수 내

```typescript
// carryover_gift 전용 검증 블록 — validateAssetAcquisition() 초입에 추가
if (asset.acquisitionCause === "carryover_gift") {
  const c = asset.carryover;
  
  // (a) 가업상속공제 차단 (최우선)
  if (c?.exclusionDeclared?.isFamilyBusinessInheritedAsset === true) {
    return `${label}: 가업상속공제 적용 자산은 v1에서 지원하지 않습니다. 세무사에게 수동 계산을 의뢰하세요 (소득세법 §97조의2 ④).`;
  }
  
  if (!c) return `${label}: 이월과세 증여 정보를 입력하세요.`;
  
  // (b) 필수 필드 검증
  if (!c.giftRegistryDate) return `${label}: 증여 등기접수일을 입력하세요.`;
  if (!c.donorAcquisitionDate) return `${label}: 증여자 취득일을 입력하세요.`;
  if (parseAmount(c.giftDateValuation) <= 0) return `${label}: 증여 당시 평가액을 입력하세요.`;
  
  // (c) 취득가 — 환산 미사용 시 직접 입력 필수
  if (!c.useEstimatedAcquisition && parseAmount(c.donorAcquisitionPrice) <= 0) {
    return `${label}: 증여자 취득가액을 입력하세요. (환산취득가 사용 시 토글 켜기)`;
  }
  
  // (d) 환산 사용 시 PHD 필드 검증 (PreHousingDisclosureSection과 동일 로직)
  if (c.useEstimatedAcquisition) {
    if (!asset.phdFirstDisclosureDate) return `${label}: 증여자 기준 최초 고시일을 입력하세요.`;
    if (parseAmount(asset.phdFirstDisclosureHousingPrice) <= 0)
      return `${label}: 최초 고시 개별주택가격을 입력하세요.`;
    // 양도시 기준시가 fallback: phdTransferHousingPrice || standardPriceAtTransfer
    const transferPrice = parseAmount(asset.phdTransferHousingPrice) || parseAmount(asset.standardPriceAtTransfer);
    if (transferPrice <= 0) return `${label}: 양도시 개별주택가격을 입력하세요.`;
  }
  
  // (e) 음수 차단
  if (parseAmount(c.donorCapitalExpenditure) < 0) {
    return `${label}: 증여자 자본적지출은 음수일 수 없습니다.`;
  }
  if (parseAmount(c.giftTaxAmount) < 0) {
    return `${label}: 증여세 상당액은 음수일 수 없습니다.`;
  }
  
  // carryover_gift 검증 완료 — 일반 취득일 검증 스킵 (acquisitionDate = giftRegistryDate 이 됨)
  return null;
}
```

---

## 5. 결과 카드 와이어프레임 (텍스트 기반)

```
┌─────────────────────────────────────────────────────────────────┐
│  이월과세 비교과세 결과 (소득세법 §97조의2)                          │
│  ┌──────────────────────────┐  ┌──────────────────────────┐    │
│  │ [A] 이월과세 적용        │  │ [B] 미적용 (비교과세)    │    │
│  │  취득가액                │  │  취득가액                │    │
│  │    증여자 취득가          │  │    증여 당시 평가액       │    │
│  │    XX,XXX,XXX            │  │    XX,XXX,XXX            │    │
│  │  보유기간                │  │  보유기간                │    │
│  │    X년 X개월 (증여자 기산) │  │    X년 X개월 (수증자 기산)│    │
│  │  필요경비 가산            │  │                         │    │
│  │    증여세 상당액          │  │                         │    │
│  │    +XX,XXX,XXX           │  │                         │    │
│  │    증여자 자본적지출 *     │  │                         │    │
│  │    +XX,XXX,XXX           │  │                         │    │
│  │  양도차익                │  │  양도차익                │    │
│  │    XX,XXX,XXX            │  │    XX,XXX,XXX            │    │
│  │  결정세액                │  │  결정세액                │    │
│  │  ┌──────────────────┐   │  │  ┌──────────────────┐   │    │
│  │  │ XX,XXX,XXX       │   │  │  │ XX,XXX,XXX       │   │    │
│  │  └──────────────────┘   │  │  └──────────────────┘   │    │
│  │  ✓ 채택 (더 큰 세액)     │  │                         │    │
│  └──────────────────────────┘  └──────────────────────────┘    │
│                                                                 │
│  * 증여자 자본적지출 가산: 2024.1.1. 이후 양도분 적용            │
│                                                                 │
│  ─────────────────────────────────────────────────────         │
│  채택 시나리오: A (이월과세 적용)          §97조의2 ② 3호        │
│  신고세액: max(A결정세액, B결정세액) = XX,XXX,XXX               │
└─────────────────────────────────────────────────────────────────┘
```

### 5.1 채택 시나리오별 표현

| 상태 | A 컬럼 | B 컬럼 | 하단 설명 |
|---|---|---|---|
| A 채택 (A ≥ B) | `✓ 채택 (더 큰 세액)` 배지 (emerald) | 표시만 (배지 없음) | "이월과세 적용 — §97조의2 ② 3호 비교과세 미해당" |
| B 채택 (A < B) | 표시만 (배지 없음) | `✓ 채택 (더 큰 세액)` 배지 (emerald) | "이월과세 적용배제 — §97조의2 ② 3호 비교과세 (세액 역전)" |

### 5.2 숫자 옆 변수명 라벨 규칙

결과 카드 내 모든 숫자 옆에 변수명 라벨 표기:

```
증여자 취득가 [이월과세 적용 취득가액]  356,171,284
증여 당시 평가액 [비교과세 취득가액]    457,000,000
증여세 상당액 [§163의2]                5,000,000
증여자 자본적지출 [§97조의2 ① 2호 후단] 3,000,000
```

`Math.floor()` 묵시 처리 — 산식에 floor 표기 금지.
숫자 단위: "원" 접미 금지 (보고서 규칙), 단위 행에만 `(단위: 원)` 헤더.

### 5.3 적용기간 표시

```
적용기간 판정
  증여일 (등기접수일): 2018.06.19
  양도일:            2023.02.16
  기간:              4년 7개월 → 5년 이내 (종전 5년 룰 적용, 증여일 ~2022.12.31.)
  → 이월과세 적용 요건 충족
```

증여일 ≥ 2023.1.1 이면:
```
기간: X년 X개월 → 10년 이내 (신 10년 룰 적용, 2022.12.31. 개정)
```

### 5.4 적용배제 사유 표시 (배제 시)

```
┌───────────────────────────────────────────┐
│ 이월과세 적용배제 — 사용자 선언             │
│ 사유: §97조의2 ② 1호 — 사업인정고시일 2년  │
│       이전 증여받은 토지·건물의 협의매수·수용 │
│ → 일반 양도소득세 계산 적용               │
└───────────────────────────────────────────┘
```

---

## 6. 법조문 링크 (LawArticleModal 패턴)

### 6.1 적용 위치

| 위치 | 법조문 | 모달 내용 |
|---|---|---|
| `증여 등기접수일` FieldCard trailing | §97조의2 ③ | "등기부에 기재된 소유기간" 기산 규정 |
| `증여세 상당액` FieldCard trailing | §163의2 | 산식: `증여세 × (해당 자산가액 / 증여재산총액)` + 예시 |
| `증여자 자본적지출` FieldCard trailing | §97조의2 ① 2호 후단 | "2023.12.31. 신설, 2024.1.1. 이후 양도분 적용" |
| 결과 카드 섹션 헤더 | §97조의2 | 이월과세 본문 + 비교과세 조항 |
| 적용배제 토글 각각 | §97조의2 ② 1호 / 2호 / ④항 | 해당 조문 원문 |

### 6.2 LawArticleModal 기존 패턴 재사용

```typescript
// FieldCard trailing 슬롯에 배치
trailing={
  <LawArticleModal
    article="소득세법 §163의2"
    label="산식 안내"
  />
}
```

---

## 7. 회귀 영향 분석

### 7.1 기존 `gift` 취득원인 흐름 격리

**영향 없음** — 설계 근거:

1. `CompanionAcqGiftBlock`은 `acquisitionCause === "gift"` 조건에서만 렌더. `carryover_gift`는 별도 컴포넌트(`CarryoverGiftBlock`).
2. `buildAssetPayload()` 내 `donorAcquisitionDate` 분기: `gift` 조건 유지, `carryover_gift` 조건 별도 추가.
3. `fixedAcquisitionPrice` 분기: 기존 `gift` 조건 (`asset.acquisitionCause === "gift" && asset.fixedAcquisitionPrice`) 유지.
4. `AssetForm.carryover` 서브객체는 `carryover_gift` 이외 취득원인에서 normalize 시 stripping → 기존 sessionStorage 데이터에 `carryover` 키가 잔재해도 자동 정리.
5. validation에서 `carryover_gift` 분기는 `gift` 분기와 완전 분리.

### 7.2 AssetForm 타입 확장 영향

- `acquisitionCause` 유니언 타입에 `"carryover_gift"` 추가 → TypeScript exhaustive check (`_never: never`) 패턴이 있는 곳에서 케이스 추가 필요.
- 점검 필요 파일: `transfer-tax-api.ts` `toEngineReductions()`, `transfer-tax-validate.ts` `validateAssetAcquisition()`, `CompanionAssetCard.tsx`.

---

## 8. 케이스 인벤토리 UI 매핑

Plan §5 케이스별 UI 입력 시나리오:

| 케이스 ID | 진입 조건 | 활성 필드 | 결과 카드 표시 |
|---|---|---|---|
| C-01 (PDF 사례 24) | carryover_gift + APD 환산 ON | 증여 등기접수일·증여자 취득일·APD 입력·증여세 상당액·증여 당시 평가액 | A 64,684,518 / B 64,062,800 → A 채택 |
| C-02 (10년 룰) | carryover_gift + 증여일 ≥ 2023.1.1 | 전 필드 | 10년 이내 → 이월과세 적용 표시 |
| C-03 (5년 초과) | carryover_gift | — | 기간 초과로 이월과세 미적용 배너 → 일반 양도세 결과 |
| C-04 (10년 초과) | carryover_gift | — | 기간 초과 → 일반 양도세 |
| C-05 (A < B 비교과세) | carryover_gift | 전 필드 | B 채택 + 역전 표시 |
| C-06 (1세대1주택 배제) | ② 2호 ToggleCard ON | 적용배제 섹션만 | 일반 양도세 + 배제 배너 |
| C-06b (고가주택) | 동상 | 동상 | ②2호 라벨에 "고가주택 포함" 표시 |
| C-07 (수용 배제) | ② 1호 ToggleCard ON | 적용배제 섹션만 | 일반 양도세 + 배제 배너 |
| C-08 (사망으로 혼인 소멸) | carryover_gift + 관계 선언 | — (v1 단순화: 사용자가 carryover_gift 선택 안 함) | — |
| C-09 (실거래가 직접) | carryover_gift + 환산 OFF | 증여자 취득가액 직접 입력 | A vs B 비교 |
| C-10 (APD 환산) | carryover_gift + 환산 ON | APD 패널 | C-01과 동일 흐름 |
| C-11 (증여세 상당액) | carryover_gift | 증여세 상당액 CurrencyInput | 필요경비 가산 반영 확인 |
| C-12 (분양권) | carryover_gift + assetKind="presale_right" | 동일 필드 | 분양권 세율 적용 |
| C-13 (증여자 capex, 2024+) | carryover_gift + transferDate ≥ 2024-01-01 | 증여자 자본적지출 활성 | capex 가산 표시 |
| C-13b (capex 시행시기 경계) | carryover_gift + transferDate < 2024-01-01 | 증여자 자본적지출 disabled | "2024.1.1. 이후 양도분부터 적용" 안내 |
| C-14 (역전 패턴) | carryover_gift | 전 필드 | B 채택 (단기세율 70%) + "비교과세 세액 역전" 라벨 |
| C-15 (가업상속공제 차단) | ④항 ToggleCard ON | validation 차단 | "v1 미지원" 오류 (진행 불가) |

---

## 9. PHD 환산 재사용 (증여자 기준) 상세

`carryover.useEstimatedAcquisition === true` 시 `PreHousingDisclosureSection`을 재사용하되, 라벨을 증여자 기준으로 재매핑:

| 원본 라벨 | 이월과세 맥락 라벨 |
|---|---|
| "최초 고시일" | "최초 고시일 (증여자 취득 시점 기준)" |
| "취득당시 개별공시지가" | "증여자 취득당시 개별공시지가" |
| "취득당시 건물 기준시가" | "증여자 취득당시 건물 기준시가" |

Props 매핑:
```typescript
// CarryoverGiftBlock 내부에서 PreHousingDisclosureSection 호출 시
<PreHousingDisclosureSection
  asset={{
    ...asset,
    // PHD 필드는 asset에서 직접 읽기 (AssetForm 내 phdXxx 필드 공유)
    acquisitionDate: asset.carryover?.donorAcquisitionDate ?? "",
  }}
  transferDate={transferDate}
  onChange={onChange}
  targetLabel="증여자 기준"  // prop이 있으면 전달, 없으면 직접 라벨 오버라이드
/>
```

PHD 입력에 사용되는 `AssetForm.phdXxx` 필드들은 기존 위치 그대로 사용 (별도 carryover 서브객체로 이동 불필요). carryover_gift 취득원인 시 이 필드들이 "증여자 기준" 환산에 사용됨을 API 변환 주석에 명시.

---

## 10. 자가 점검 (DoD 8개 동기화)

- [ ] ① `AssetForm.carryover` 서브객체 + `acquisitionCause: "carryover_gift"` 타입 반영
- [ ] ② `makeDefaultAsset()` 내 `carryover` initial value 추가
- [ ] ③ `migrateAsset()` 내 `carryover_gift` 이외 취득원인에서 `carryover` stripping
- [ ] ④ `buildAssetPayload()` 내 `carryoverTaxation` 객체 매핑 + 시행시기 가드
- [ ] ⑤ 취득원인 셀렉트에 `carryover_gift` 옵션 추가 + `CarryoverGiftBlock` 신규 구현
- [ ] ⑥ `computeTransferSummary()` 내 증여세 상당액 + 증여자 capex 사이드바 표시
- [ ] ⑦ `CarryoverComparisonCard` 신규 구현 (A·B 나란히 + ✓ 배지 + 채택 설명)
- [ ] ⑧ `validateAssetAcquisition()` 내 `carryover_gift` 전용 검증 + 가업상속공제 차단

---

## 11. 핵심 결정 사항 요약

### 컴포넌트 분리 방식

`CompanionAcqGiftBlock` 확장 금지 — `CarryoverGiftBlock.tsx` 신규 파일. 이유: 인터페이스 불일치·800줄 정책·기존 `gift` 흐름 격리. 적용배제 섹션은 `CarryoverGiftExclusionSection.tsx`로 추가 분리 (< 150줄 목표).

### 비교 카드 레이아웃

A·B 2컬럼 나란히 배치. 채택 컬럼에 `✓ 채택 (더 큰 세액)` 배지 (emerald). 결정세액 행을 강조박스로 구분. 하단에 "채택 시나리오" + "신고세액" 요약 1행. A < B 역전 시 "비교과세 세액 역전" 라벨 추가.

### 시행시기 가드 UI 표현

`transferDate < "2024-01-01"` 조건 시 증여자 자본적지출 `CurrencyInput`을 `disabled` 상태로 표시 + `disabledReason="2024.1.1. 이후 양도분부터 적용 (§97조의2 ① 2호 후단, 2023.12.31. 신설)"` → 사용자가 비활성 이유를 즉시 인지. API 변환에서도 동일 조건으로 capex = 0 처리 (⑧ 정책 동기화).
