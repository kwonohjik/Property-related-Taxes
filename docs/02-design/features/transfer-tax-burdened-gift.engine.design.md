# 부담부증여 — 양도소득세 엔진 설계 (사례 34)

> 사례 출처: 2023 양도·상속·증여세 이론 및 계산실무 (예제 교재) 사례 34 — 노량진 양코빌딩
> Phase 1 범위: **양도소득세만**. 증여세 통합은 후속 Phase.

---

## Context

부담부증여(burdened gift) = 증여 시 수증자가 증여자의 채무(임대보증금·담보차입금 등)를 인수하는 조건으로 증여 계약을 체결하는 것. **채무인수분은 유상이전 → 양도세(증여자 납세의무)**, 나머지는 무상이전 → 증여세(수증자 납세의무).

**문제**: 현 양도세 엔진은 사례 31(일반건물 환산)·32(신축 단기양도)·33(증축 환산)까지 일반건물 4가지 조합을 지원하지만, 부담부증여 분기가 없다. 취득세 enum에는 `"burdened_gift"`가 정의되어 있으나(`lib/tax-engine/types/acquisition.types.ts:85`), 양도세 파이프라인에는 미연결. 사용자가 "양도가액 = 채무액", "취득가액 = 자산별 기준시가 × 채무비율" 산식을 입력할 수 없다.

**의도한 결과**: 사례 34 PDF/Excel 값을 그대로 입력해 합계 **산출세액 740,074,515 / 지방소득세 74,007,451**을 anchor `toBe()`로 재현. 자산별 양도차익(토지 2,468,955,153 / 건물 93,392,512), 24년 보유 장특공 30% (768,704,298), 양도소득금액 1,793,643,367 모두 일치.

**왜 지금**: 일반건물 4조합 확장(2026-05-11) 완료 직후로, propertyType `"general_building"` 인프라가 안정화. 부담부증여는 이 위에 얹는 **별도 취득원인 분기**로 90% 재사용 가능.

---

## ★ 케이스 인벤토리 (Phase 1)

| # | 시나리오 | propertyType | valuationMode | 법령 근거 | anchor 출처 | 테스트 파일 | 상태 |
|---|---------|--------------|---------------|----------|-------------|------------|------|
| 1 | 부담부증여 + 일반건물 + 상증법 기준시가 평가 (사례 34) | `general_building` | `sangjeungbeop_standard` | 소령 §159①, 상증법 §61(기준시가), 상증령 §50⑦(임대평가) | 사례 34 PDF p.531~538 + Excel | `general-building-case-34-burdened-gift.test.ts` | ☐ TODO |
| 2 | 부담부증여 + 일반건물 + 상증법 시가 평가 (매매사례·감정·보상·경매·공매가) | `general_building` | `sangjeungbeop_market` | 소령 §159①, 상증법 §60②~④ | (PDF 미발견 — 시가 직접 입력 합성 anchor) | (사례 1 파일에 시가 분기 추가) | ☐ TODO |
| 3 | Max(보충적·담보·임대) 자동 선택 — 담보평가 채택 | (어느 케이스든) | `sangjeungbeop_standard` | 상증법 §66(저당권 등 설정 재산 평가특례) | 합성 anchor | (사례 1 파일 보조) | ☐ TODO |
| 4 | Max(보충적·담보·임대) — 임대평가 채택 | (어느 케이스든) | `sangjeungbeop_standard` | 상증법 §61⑤, 상증령 §50⑦ | 합성 anchor | (사례 1 파일 보조) | ☐ TODO |
| 5 | 회귀 가드: 사례 31·32·33 (부담부증여 미선택 시) | `general_building` | — | — | 기존 anchor | 기존 파일 | ✅ DONE (회귀 확인) |

### Phase 1 제외(후속 PR)

| # | 시나리오 | 사유 |
|---|---------|------|
| 6 | 부담부증여 + 1세대1주택 + 장특공 표2 (최대 80%) | propertyType `housing` 부담부증여 — Phase 3 |
| 7 | 임대료 환산율 18% (2009.4.23. 이전) | 사례 34는 2023 양도 — 12% 단일. v2 |
| 8 | (근)저당 설정액 ≠ 실제 채무잔액 분리 케이스 | 사례 34는 동치. `mortgageSetAmount` 필드는 v2 본격 분기 |
| 9 | 부담부증여 신고기한 표시(§105·§110·상증법 §68 교차) | 법령 검토 deferred (plan 쟁점 9) |
| 10 | Phase 2: 증여세 통합 (무상분 → `gift-tax.ts`) | 별도 Phase |

**규칙**: 행 5는 이미 완료된 회귀 가드. 행 1~4가 본 PR의 anchor 약속. 사용자가 새 케이스 제시 → 표에 행 추가 → 그 다음 코드.

---

## 법령 근거 (KoreanLaw MCP 검증 완료)

### 소득세법 시행령 §159 — 부담부증여에 대한 양도차익의 계산

```
①1호 취득가액 = A × B / C
  A: 법 §97①1호에 따른 가액
     (양도가액을 상증법 §61①·②·⑤ 및 §66에 따라 기준시가로 산정한 경우
      → 취득가액도 기준시가로 산정)
  B: 채무액
  C: 증여가액

①2호 양도가액 = A × B / C
  A: 상증법 §60~§66 규정에 따라 평가한 가액
  B: 채무액
  C: 증여가액

②   양도과세 자산 + 비과세 자산 동시 부담부증여 시 채무액 안분
```

**해석**: 사례 34는 "양도(증여)시 평가 유형 = 상증법상 기준시가" 선택 → §159①1호 A 괄호 발동 → **취득가액도 기준시가**로 산정. 정확한 법령 근거 확보.

**핵심 산식**:
- 채무비율 = B/C = 채무액 / 증여가액(상증법 §60~§66 평가액)
- 자산별 양도가액 = 자산별 평가가액 × 채무비율
- 자산별 취득가액 = 자산별 취득시 기준시가 × 채무비율 (양도가액을 기준시가로 산정한 경우)

### 소득세법 §95② 표1 + §95④ **본문** — 보유기간 산정

§95④ 본문: "제2항에서 규정하는 자산의 보유기간은 그 자산의 **취득일부터 양도일까지**로 한다."

부담부증여 채무인수분의 양도자는 **증여자 본인**(§88①1호 후단 "양도"의 정의 포함)이므로, "양도자(=증여자)의 취득일"이 곧 본문의 취득일에 해당 → **§95④ 본문이 그대로 직접 적용**된다.

⚠️ **§95④ 단서 인용 금지**: §95④ 단서("…다만, 제97조의2제1항의 경우에는 증여한 배우자 또는 직계존비속이 해당 자산을 취득한 날부터 기산…")는 **수증자가 양도하는 §97의2 이월과세 케이스 전용**이다. 부담부증여는 양도자가 증여자 본인이라 단서를 거치지 않는다. 결과(증여자 당초 취득일 기산)는 같지만, 디자인 doc과 코드 주석에서 단서를 근거로 끌어오면 안 됨 — 후속 개발자 혼선 차단.

사례 34: 1998-09-07 ~ 2023-02-19 = 24년 5개월 → §95② 표1 (일반자산) 15년 이상 30%.

⚠️ Phase 1 가드: `propertyType === "general_building"` 한정. 1세대1주택(표2, 최대 80%) Phase 3.

### 소득세법 §97 / 시행령 §163⑥ — 필요경비 (개산공제)

기준시가에 의한 취득가액 산정 시 개산공제 = 토지·건물 등기 자산 = 취득당시 기준시가 × **3%**.

부담부증여 자산별 개산공제 = (취득당시 기준시가 × 채무비율) × 3% = 안분된 취득가액 × 3%.

### 소득세법 §97의2 — 이월과세 **미적용**

§97의2(배우자·직계존비속 증여재산 이월과세)는 수증자가 증여 후 5년 내 양도 시 적용. 부담부증여 채무인수분은 **증여자가 양도자**이므로 §97의2 비대상.

엔진 분기 진입부 주석 필수:
```ts
// 부담부증여 채무인수 양도: 양도자 = 증여자. 소득세법 §97의2(이월과세) 미적용.
```

### 상증법 §60~§66 — 증여재산 평가 (Max 규칙)

```
평가액 = Max(
  ① 보충적평가  (상증법 §61 — 기준시가: 개별공시지가 + 건물기준시가),
  ② 담보평가    (상증법 §66 — (근)저당·전세권 설정 채권액·전세금),
  ③ 임대평가    (상증법 §61⑤·시행령 §50⑦ — 임대료 환산가액)
)
```

### 상증령 §50⑦⑧ — 임대료 환산가액

```
임대료 등의 환산가액 = 임대보증금 + (연간 임대료 / 12%)
  (12% = 2009.4.23. 시행 환산율. 그 이전은 18%)
```

§50⑧ 토지·건물 소유자 동일 시: 환산가액을 토지·건물 기준시가 비율로 안분하여 각각의 평가가액으로 함.

⚠️ Plan v1의 "상증령 §51②" 인용은 부정확 → **§50⑦** 이 정조문. 코드 상수에 반영.

### 조문 상수 (legal-codes/burdened-gift.ts 신규)

```ts
export const BURDENED_GIFT = {
  TRANSFER_INCOME_VALUATION_159: "소득세법 시행령 §159 — 부담부증여에 대한 양도차익의 계산",
  HOLDING_PERIOD_95_4: "소득세법 §95④ — 보유기간 산정 (증여자 당초 취득일 기준)",
  ESTIMATED_DEDUCTION_163_6: "소득세법 시행령 §163⑥ — 개산공제 (등기 자산 3%)",
  CARRYOVER_NOT_APPLY_97_2: "소득세법 §97의2 — 이월과세 미적용 (양도자 = 증여자)",
  SANGJEUNGBEOP_VALUATION_60_66: "상증법 §60~§66 — 증여재산 평가 (보충적·담보·임대 Max)",
  SANGJEUNGBEOP_MORTGAGE_66: "상증법 §66 — (근)저당권 등 설정 재산 평가특례",
  SANGJEUNGBEOP_RENTAL_61_5: "상증법 §61⑤ — 임대 부동산 평가",
  SANGJEUNGBEOP_RENTAL_FORMULA_50_7: "상증법 시행령 §50⑦ — 임대료 등의 환산가액",
} as const;

export const ANNUAL_RENT_CAPITALIZATION_RATE_AFTER_2009_04_23 = 0.12; // §50⑦
export const ANNUAL_RENT_CAPITALIZATION_EFFECTIVE_DATE = new Date("2009-04-23");
// v2: ANNUAL_RENT_CAPITALIZATION_RATE_BEFORE_2009_04_23 = 0.18
```

---

## 엔진 input 타입

### `TransferTaxInput` 확장 (lib/tax-engine/types/transfer.types.ts)

```ts
export interface TransferTaxInput {
  // ... 기존 필드
  acquisitionCause?:
    | "purchase"
    | "inheritance"
    | "gift"
    | "carryover_gift"
    | "newConstruction"
    | "burdened_gift";   // ★ 신규

  burdenedGiftInfo?: BurdenedGiftInfo;  // ★ 신규
}
```

### `BurdenedGiftInfo` (신규 sub-form)

```ts
export interface BurdenedGiftInfo {
  /**
   * 양도(증여) 시 평가 모드.
   * - sangjeungbeop_standard: 상증법 §61(기준시가) — 사례 34. 취득가액도 기준시가로 산정(§159①1호 A 괄호).
   * - sangjeungbeop_market:   상증법 §60②~④(시가) — 매매사례·감정·보상·경매·공매가.
   */
  valuationMode: "sangjeungbeop_standard" | "sangjeungbeop_market";

  // === 인수 채무 (양도가액 산정용 — 합산하여 채무액 B 계산) ===
  /** 임대보증금 총액 (채무로 인수). 미입력 시 0. */
  lendingDepositTotal: number;
  /** 담보차입금 (채무로 인수, 실제 채무잔액). 미입력 시 0. */
  mortgageDebtAmount: number;

  // === 임대 평가 보조 (Max 비교용 — 채무 아님) ===
  /** 연간 임대료 총액. 환산가액 산식에만 사용. */
  annualRentTotal: number;

  // === 담보평가 보조 (선택, v2 본격 분기) ===
  /**
   * (근)저당권 설정액. 미입력 시 mortgageDebtAmount로 fallback.
   * Phase 1에서는 사례 34처럼 채무액과 동치인 경우만 검증. v2에서 분리 anchor.
   */
  mortgageSetAmount?: number;

  // === 시가 모드 직접 입력 (sangjeungbeop_market 분기) ===
  /** 양도시 시가 평가액(총액). sangjeungbeop_market 모드에서 필수. */
  marketValueAtTransfer?: number;
  /** 취득시 시가 평가액(총액). sangjeungbeop_market 모드에서 필수. */
  marketValueAtAcquisition?: number;
}
```

⚠️ **14개 동기화 지점 ⑫** — 이 객체를 `lib/api/transfer-tax-schema.ts`에 `burdenedGiftInfoSchema = z.object({...})`로 명시 정의. 침묵 stripping 차단.

---

## 엔진 result 타입

### `TransferTaxResult` 확장

```ts
export interface TransferTaxResult {
  // ... 기존 필드
  burdenedGiftBreakdown?: BurdenedGiftBreakdown;  // ★ 신규 (부담부증여 모드에서만 채워짐)
}
```

### `BurdenedGiftBreakdown` (Phase 2 연결 핵심)

```ts
export interface BurdenedGiftBreakdown {
  /** 인수 채무액 = 임대보증금 + 담보차입금 = 양도가액 (소령 §159) */
  assumedDebtAmount: number;             // 사례 34: 4,120,000,000

  /** 상증법 §60~§66 평가 Max 산정 결과 */
  sangjeungbeopValuation: {
    supplementary: number;                // 보충적평가(§61): 사례 34 = 8,578,295,360
    mortgage: number;                     // 담보평가(§66): 사례 34 = 4,120,000,000
    rental: number;                       // 임대평가(§61⑤·시행령 §50⑦): 사례 34 = 2,083,333,333
    selectedMode: "supplementary" | "mortgage" | "rental";  // 사례 34: "supplementary"
    max: number;                          // = 증여가액 C: 사례 34 = 8,578,295,360
  };

  /** 채무비율 = B / C = 인수채무 / 증여가액 (소령 §159) */
  debtRatio: number;                     // 사례 34: 0.480278051...

  /** 무상이전분 = C − B (Phase 2 증여세 입력 보호) */
  gratuitousPortion: number;             // 사례 34: 4,458,295,360

  /** 양도세 납세의무자 */
  taxpayer: "donor";

  /** 자산-수준 안분 결과 (감사·결과카드 표시용) */
  perAsset: {
    land: { transferPrice: number; acquisitionPrice: number; estimatedDeduction: number };
    building: { transferPrice: number; acquisitionPrice: number; estimatedDeduction: number };
  };
}
```

새 Date 필드 없음 — date-coerce 헬퍼 불필요.

---

## 계산 알고리즘 (단계별)

### Step 0: 진입 조건 가드

```
if (acquisitionCause !== "burdened_gift") → 부담부증여 분기 미진입 (기존 로직 그대로)
assert (propertyType === "general_building")  // Phase 1 가드 — 1주택 등은 Phase 3
assert (burdenedGiftInfo !== undefined)        // M-2 normalize에서 보장
```

### Step 1: 상증법 §60~§66 평가 Max 산정

```
입력:
  - 자산별 양도시 기준시가 (토지: 개별공시지가 × 면적 / 건물: 건물기준시가 합계)
  - lendingDepositTotal, annualRentTotal, mortgageDebtAmount, mortgageSetAmount?

산출:
  supplementary = sum(자산별 양도시 기준시가)            // 사례 34: 8,578,295,360
  mortgage      = lendingDepositTotal
                + (mortgageSetAmount ?? mortgageDebtAmount)  // 사례 34: 1,000,000,000 + 3,120,000,000 = 4,120,000,000
  rental        = lendingDepositTotal
                + (annualRentTotal / 0.12)                   // 사례 34: 1,000,000,000 + 1,083,333,333 = 2,083,333,333

  // sangjeungbeop_market 모드일 때는 supplementary 대신 marketValueAtTransfer로 대체
  // 단, mortgage·rental은 동일하게 비교 (시가 모드에서도 §66·§61⑤ 평가특례 적용)
  candidates = sangjeungbeop_standard
              ? [supplementary, mortgage, rental]
              : [marketValueAtTransfer, mortgage, rental]

  max = Math.max(...candidates)
  selectedMode = argmax (supplementary | market | mortgage | rental)
```

### Step 2: 인수 채무액 B 산정 (소령 §159 양도가액)

```
assumedDebtAmount = lendingDepositTotal + mortgageDebtAmount
  // 사례 34: 1,000,000,000 + 3,120,000,000 = 4,120,000,000

// 채무비율 (소령 §159 B/C)
debtRatio = assumedDebtAmount / max     // 사례 34: 4,120,000,000 / 8,578,295,360 ≈ 0.480278051
```

⚠️ 채무비율의 분모는 **양도가액 산정 평가액(C = 증여가액)**. selectedMode가 supplementary든 mortgage든 rental이든 그 Max 값.

### Step 3: 자산별 양도가액 안분 (소령 §159①2호)

```
landTransferStdPrice     = 토지 면적 × 양도시 개별공시지가      // 사례 34: 1,279 × 6,215,000 = 7,948,985,000
buildingTransferStdPrice = sum(건물 층별 양도시 기준시가)        // 사례 34: 629,310,360

landTransferPrice     = landTransferStdPrice     × debtRatio   // 3,816,625,253 (원 미만 절사)
buildingTransferPrice = buildingTransferStdPrice × debtRatio   // 303,374,747

// 검증: landTransferPrice + buildingTransferPrice ≈ assumedDebtAmount (반올림 오차 ≤ 자산수)
```

### Step 4: 자산별 취득가액 안분 (소령 §159①1호 — 기준시가 모드)

`valuationMode === "sangjeungbeop_standard"` 인 경우 §159①1호 A 괄호에 따라 취득가액도 기준시가로 산정.

```
landAcqStdPrice     = 토지 면적 × 취득시 개별공시지가             // 사례 34: 1,279 × 2,130,000 = 2,724,270,000
buildingAcqStdPrice = sum(건물 층별 취득시 기준시가)              // 사례 34: 424,472,064 (PDF p.535 영역)

landAcquisitionPrice     = landAcqStdPrice     × debtRatio       // 1,308,417,573
buildingAcquisitionPrice = buildingAcqStdPrice × debtRatio       // 203,866,248
```

⚠️ **수학적 동치 주의**: `landAcqStdPrice × debtRatio` = `landTransferPrice × landAcqStdPrice / landTransferStdPrice` (사례 31 환산식). 동치라도 코드 경로는 분리 — 법적 근거가 §159 vs §114⑦로 다름. `useEstimatedAcquisition` flag는 **건드리지 않음**.

`valuationMode === "sangjeungbeop_market"` 인 경우:
```
취득가액 = marketValueAtAcquisition × debtRatio
  // §159①1호 A 본문 = 법 §97①1호에 따른 가액 (= 실가)
  // 시가 모드 미충족 시 validation 차단
```

### Step 5: 필요경비 (개산공제, §163⑥)

```
landEstDeduction     = landAcquisitionPrice     × 0.03    // 39,252,527
buildingEstDeduction = buildingAcquisitionPrice × 0.03    // 6,115,987
totalEstDeduction    = landEstDeduction + buildingEstDeduction  // 45,368,514
```

⚠️ 안분된 자산별 취득가액 × 3%. 전체 기준시가에 3%를 곱하는 게 아님 — 후속 개발자 혼란 차단을 위해 코드에 산식 주석.

### Step 6: 자산별 양도차익

```
landIncome     = landTransferPrice     - landAcquisitionPrice     - landEstDeduction      // 2,468,955,153
buildingIncome = buildingTransferPrice - buildingAcquisitionPrice - buildingEstDeduction  // 93,392,512
totalIncome    = 2,562,347,665
```

### Step 7: 보유기간 & 장기보유특별공제

```
holdingPeriod = transferDate - originalAcquisitionDate   // 1998-09-07 → 2023-02-19 = 24년 5개월
ltDeductionRate = §95② 표1 lookup(holdingPeriod)        // 15년 이상 = 30%

landLTD     = landIncome     × 0.30   // 740,686,545
buildingLTD = buildingIncome × 0.30   // 28,017,753
totalLTD    = 768,704,298
```

⚠️ 가드: `propertyType === "general_building"` → 표1만 사용. 표2(최대 80%)는 Phase 3.

### Step 8: 양도소득금액·과세표준·산출세액

```
taxableIncome  = totalIncome - totalLTD = 1,793,643,367
taxBase        = taxableIncome - 기본공제 2,500,000 = 1,791,143,367
calculatedTax  = §55 누진세율표 적용
                = 1,791,143,367 × 0.45 - 65,940,000
                = 740,074,515
localIncomeTax = floor(calculatedTax × 0.10) = 74,007,451
```

§55 표 자가검증 필수 (외부 자료 추종 금지 — `feedback_transfer_year_tax_rate`).

### Step 9: `BurdenedGiftBreakdown` 채워서 result에 부착

```ts
result.burdenedGiftBreakdown = {
  assumedDebtAmount,
  sangjeungbeopValuation: { supplementary, mortgage, rental, selectedMode, max },
  debtRatio,
  gratuitousPortion: max - assumedDebtAmount,  // Phase 2 증여세 입력
  taxpayer: "donor",
  perAsset: { land: {...}, building: {...} },
};
```

### Step 10: 이월과세 가드

```ts
result.carryoverTaxation = null;  // §97의2 미적용. anchor로 보장.
```

---

## Silent fallback / 자동 안분 후보 식별

부담부증여 분기에서 자동 채우기 위험 영역:

| 필드 | 위험 | 정책 |
|------|------|------|
| `transferPrice` (자산-수준 / 총합) | 사용자가 입력 시 무시되어 침묵 override | UI에서 **disabled + 회색 prefilled** + API 변환 시 `assumedDebtAmount`로 강제 override. validate에서 사용자 직접 입력은 무시 명시 |
| `lendingDepositTotal` / `mortgageDebtAmount` | 0이면 양도가액 0 → 채무비율 NaN | validate 차단: `lendingDepositTotal + mortgageDebtAmount > 0` |
| `annualRentTotal` | 0 허용(임대 없음) | rental = 보증금만으로 계산. 정상 동작 |
| `mortgageSetAmount` | 미입력 시 `mortgageDebtAmount` fallback | display fallback prop + validate fallback의 3중 패턴(mirror-pattern 정책) |
| `marketValueAtTransfer` / `marketValueAtAcquisition` | sangjeungbeop_market 모드에서 미입력 시 NaN | validate required 분기 |
| `originalAcquisitionDate` | 부담부증여 양도분은 증여자 당초 취득일. 사용자가 증여일을 잘못 입력할 위험 | UI 라벨 "원 취득일(증여자 당초 취득일)" 명시 + tooltip |
| `propertyType` | `housing` 등에서 부담부증여 선택 시 장특공률표 잘못 적용 | engine assert: `propertyType === "general_building"`, 위반 시 throw |

**자동 안분 금지 정책 준수** (`feedback_no_silent_apportion_fallback.md`):
- 자산별 양도가액·취득가액 안분은 **소령 §159 명시 산식** — 법령 명시 안분이므로 허용.
- 그 외 미입력 필드(예: 토지면적·공시지가) 면적·시점비율 자동 채우기 **금지**. 검증 오류로 차단.

---

## 테스트 약속

### 파일: `__tests__/tax-engine/transfer-tax/general-building-case-34-burdened-gift.test.ts`

#### 사례 34 정확 재현 (행 1) — anchor 35+개 `toBe()`

**합계 (PDF p.534·537·538)**:
```ts
expect(result.transferPrice).toBe(4_120_000_000);
expect(result.acquisitionPrice).toBe(1_512_283_821);
expect(result.estimatedDeduction).toBe(45_368_514);
expect(result.transferIncome).toBe(2_562_347_665);
expect(result.longTermSpecialDeduction).toBe(768_704_298);
expect(result.taxableTransferIncome).toBe(1_793_643_367);
expect(result.taxBase).toBe(1_791_143_367);
expect(result.calculatedTax).toBe(740_074_515);
expect(result.localIncomeTax).toBe(74_007_451);
```

**자산-수준 (Excel D·E열)**:
```ts
expect(breakdown.perAsset.land.transferPrice).toBe(3_816_625_253);
expect(breakdown.perAsset.land.acquisitionPrice).toBe(1_308_417_573);
expect(breakdown.perAsset.land.estimatedDeduction).toBe(39_252_527);
expect(breakdown.perAsset.building.transferPrice).toBe(303_374_747);
expect(breakdown.perAsset.building.acquisitionPrice).toBe(203_866_248);
expect(breakdown.perAsset.building.estimatedDeduction).toBe(6_115_987);
```

**부담부증여 명세**:
```ts
expect(breakdown.assumedDebtAmount).toBe(4_120_000_000);
expect(breakdown.sangjeungbeopValuation.supplementary).toBe(8_578_295_360);
expect(breakdown.sangjeungbeopValuation.mortgage).toBe(4_120_000_000);
expect(breakdown.sangjeungbeopValuation.rental).toBe(2_083_333_333);
expect(breakdown.sangjeungbeopValuation.selectedMode).toBe("supplementary");
expect(breakdown.sangjeungbeopValuation.max).toBe(8_578_295_360);
expect(breakdown.debtRatio).toBeCloseTo(0.480278051, 8);
expect(breakdown.gratuitousPortion).toBe(4_458_295_360);
expect(breakdown.taxpayer).toBe("donor");
```

**보유기간 & 장특공률 (§95④ 증여자 당초 취득일)**:
```ts
expect(result.holdingPeriod.years).toBe(24);
expect(result.holdingPeriod.months).toBe(5);
expect(result.longTermDeductionRate).toBe(0.30);
```

**이월과세 미적용 보장 (§97의2)**:
```ts
expect(result.carryoverTaxation).toBeNull();
```

**§55 누진세율표 자가검증**:
```ts
// 1,791,143,367 × 0.45 − 65,940,000 = 740,074,515
const expected = Math.floor(1_791_143_367 * 0.45) - 65_940_000;
expect(expected).toBe(740_074_515);
expect(result.calculatedTax).toBe(expected);
```

#### 행 2: 시가 모드 (합성 anchor)

```ts
// 시가가 보충적평가보다 큰 케이스 — selectedMode === "market"
// max = marketValueAtTransfer로 분기, debtRatio·자산별 안분 재계산
```

#### 행 3: 담보평가 채택 (합성)

```ts
// 임대 없음 + 보충적평가 < 담보평가 → selectedMode === "mortgage"
// 사례 34 수치에서 supplementary를 임의로 낮춰 만든 시나리오
```

#### 행 4: 임대평가 채택 (합성)

```ts
// 보충적평가·담보평가 < 임대평가 → selectedMode === "rental"
```

#### 회귀 가드 (행 5)

```bash
npx vitest run __tests__/tax-engine/transfer-tax/general-building-case-31.test.ts
npx vitest run __tests__/tax-engine/transfer-tax/general-building-case-32.test.ts
npx vitest run __tests__/tax-engine/transfer-tax/general-building-extension-case-33.test.ts
```

부담부증여 분기를 거치지 않으므로 결과 0 변화. 938+ 통과 회귀 0 확인.

---

## UI 통합 위임

UI 측 명세는 `transfer-tax-burdened-gift.ui.design.md` (별도 PR) 참조.

### 엔진 시니어 책임 (이 문서)
- `TransferTaxInput.burdenedGiftInfo?` / `TransferTaxResult.burdenedGiftBreakdown?` 타입 정의
- `lib/tax-engine/burdened-gift-apportionment.ts` 순수 함수 구현(예상 ~180줄)
- `lib/tax-engine/transfer-tax.ts` Step 0 가드 + 분기 진입(+ ~50줄)
- `lib/tax-engine/general-building-valuation.ts` 부담부증여 모드에서 §166⑥ 안분 우회(+ ~30줄)
- `legal-codes/burdened-gift.ts` 조문 상수 + 환산율 시행일 상수

### UI 시니어 책임 (별도 문서)
14개 동기화 지점 모두 — 특히:
- ① 폼 상태: `acquisitionCause`에 `"burdened_gift"` + `burdenedGiftInfo?`
- ④ API 변환: `transferPrice = assumedDebtAmount` override + body spread (⑬)
- ⑤ UI 입력: GeneralBuilding 라디오에 5번째 옵션 "부담부증여" + 조건부 sub-block
- **⑥ 사이드바 합계 — 의도적 미표시 (결정 기록)**: 부담부증여 모드는 양도가액·취득가액·필요경비가 모두 엔진 자동 산출(채무비율 안분 결과)이므로 사용자 입력값만으로 사이드바 합계를 정확히 미리 보여줄 수 없다. 부분 미리보기(채무액 합계만)는 오히려 결과 카드의 종합 표시와 정보가 분산되어 혼란을 유발. 본 PR은 사이드바 미표시·결과 카드 단일 진실 원천 원칙을 채택한다. 사례 31·32·33도 동일 패턴이며, 14지점 ⑥ "(해당 시)" 조건 충족 — 본 모드는 미해당.
- ⑦ 결과 카드: "상증법 평가 명세" 섹션(보충적·담보·임대 + Max 채택 표시) + "납세의무자: 증여자" 라벨 + Phase 2 증여세 5행
- ⑧ validation: 평가모드별 required 분기, `lendingDepositTotal + mortgageDebtAmount > 0` 차단
- ⑨⑩⑫ Zod: enum 추가 + `burdenedGiftInfoSchema` 명시 정의 (침묵 stripping 차단)
- ⑭ Route handler: `burdenedGiftInfo` 엔진 input에 spread (Date 변환 없음)

### 14개 동기화 자가 점검 grep 명령

작업 완료 보고 전 필수:
```bash
grep -rn "burdened_gift\|burdenedGiftInfo" lib/ app/ components/ __tests__/
# 14개 지점 모두 hits 확인. ⑫⑬⑭ TypeScript 미감지 영역 강조.
```

---

## 변경 영향 요약

| 파일 | 줄수 변화 | 신규/수정 |
|------|----------|-----------|
| `lib/tax-engine/types/transfer.types.ts` | +30 | TransferTaxInput·Result 확장 + BurdenedGiftInfo·Breakdown |
| `lib/tax-engine/transfer-tax.ts` (681 현재, 800 limit) | +50 → 731 | 여유 69 |
| `lib/tax-engine/general-building-valuation.ts` (382 현재) | +30 → 412 | 여유 충분 |
| `lib/tax-engine/burdened-gift-apportionment.ts` | +180 신규 | — |
| `lib/tax-engine/legal-codes/burdened-gift.ts` | +30 신규 | — |
| `lib/tax-engine/legal-codes/index.ts` | +1 | export 추가 |
| `lib/api/transfer-tax-schema.ts` | +25 | enum + Zod 객체(⑫) |
| `lib/api/transfer-tax-schema-sub.ts` | +10 | refine 분기 |
| `lib/calc/transfer-tax-api.ts` | +40 | 채무액 → transferPrice override + body spread(⑬) |
| `lib/calc/transfer-tax-validate.ts` (776 현재 — **임계**) | +30 → 806 ⚠️ | **분할 선행 PR 필요** |
| `lib/stores/calc-wizard-asset.ts` | +10 | enum + 필드 |
| `lib/stores/calc-wizard-asset-factory.ts` | +15 | normalize |
| `app/api/calc/transfer/route.ts` | +5 | input spread(⑭) |
| `components/calc/transfer/GeneralBuildingAcquisitionCards.tsx` | +50 | 라디오 옵션 + 조건부 sub-block 진입 |
| `components/calc/transfer/BurdenedGiftBlock.tsx` | +250 신규 | sub-form |
| `components/calc/results/transfer/ResultCard*.tsx` | +60 | "상증법 평가 명세" 섹션 |
| `__tests__/tax-engine/transfer-tax/general-building-case-34-burdened-gift.test.ts` | +280 신규 | anchor 35+ |

### 800줄 정책 — 분할 선행 PR 필수

`transfer-tax-validate.ts` 776 → 806 예상 → **800 초과**. PR 1단계로 `transfer-tax-validate-burdened-gift.ts` 분리(부담부증여 검증만 ~30줄 격리). 이미 `validate-gb.ts` 패턴 선례 있음 (`__tests__/tax-engine/general-building-case-33`의 분리 선행 PR 참조).

---

## Verification (PR 직전 체크리스트)

- [ ] 케이스 인벤토리 행 1~4 모두 anchor 작성 + 행 5 회귀 확인
- [ ] anchor 35+ `toBe()` 정확 일치 (사례 34)
- [ ] 14개 동기화 지점 grep 자가 점검 — ⑫⑬⑭ TypeScript 미감지 영역
- [ ] `npx tsc --noEmit` 0건
- [ ] `npx vitest run __tests__/tax-engine/transfer-tax/` 전수 통과 + 회귀 0
- [ ] `npm run verify:legal` — burdened-gift.ts 조문 상수 검증
- [ ] **브라우저 수동**: 사례 34 입력 → Network 탭 request body에 `burdenedGiftInfo` 포함 → 결과 740,074,515 일치 → 결과 카드 "상증법 평가 명세" 섹션 확인
- [ ] `ui-engine-sync-checker` 0 누락
- [ ] `transfer-tax-validate.ts` 분할 선행 PR 머지 완료 (본 PR보다 먼저)

## 후속 PR

- **PR-1 (선행)**: `transfer-tax-validate.ts` 도메인 분할 (800줄 정책)
- **PR-2 (본 PR)**: 부담부증여 양도세 — 본 문서 범위
- **PR-3**: UI 마법사 통합 (`transfer-tax-burdened-gift.ui.design.md` 별도)
- **PR-4 (Phase 2)**: 증여세 통합 — `gift-tax.ts` 호출 + 결과 화면 양도세+증여세 합계. anchor: 자진납부세액 1,691,823,250
- **PR-5 (v2)**: 임대료 환산율 18% (2009.4.23. 이전) + `mortgageSetAmount` 분리 anchor + 시가 모드 자산별 평가액 분리 입력
- **PR-6 (Phase 3)**: 1세대1주택 부담부증여 — 장특공 표2(최대 80%) 분기, propertyType `housing` 가드 해제
- **PR-7 (deferred)**: 신고기한 표시 — §105·§110·상증법 §68 교차 검토 후
