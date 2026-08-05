# 주식 양도세 Step 1 — 섹션 재정렬 + 동적 번호 + 분할 매수·분할 양도·산정방법 3종

> **세목**: 주식 양도소득세 (stock-transfer)
> **대상**: Step 1 + Step 2 + 엔진 핵심 계산 파이프라인
> **트리거**: 사용자 요청 (2026-05-18) — 섹션 4 조건부 숨김 점프 + 입력 순서 재정렬 + **분할 매수·분할 양도 + lot별 취득원인 + 산정방법 3종 선택**
> **상태**: ✅ **구현 완료** (커밋 2a4cfc9c · 이동평균 PR#162 · 2026-05-18) — 2026-08-04 코드 실측 · 2026-08-05 인용 PR·커밋 재검증(종전 헤더는 stale이었음).
> ~~종전 표기: Plan v2 (KoreanLaw 사전 검증 + 인터뷰 4문항 반영, 2026-05-18)~~
> **참조 파일**:
> - `app/calc/stock-transfer-tax/steps/Step1.tsx`·`Step2.tsx`
> - `lib/tax-engine/stock-transfer/stock-transfer-tax.ts` (엔진 진입점)
> - `lib/tax-engine/stock-transfer/types/stock-transfer.types.ts`
> - `lib/api/stock-transfer-tax-schema.ts` (Zod)

---

## 0. v2 변경 사유 (Plan v1 → v2)

KoreanLaw MCP 사전 검증 결과 **v1 가정 핵심 오류**:

| v1 가정 | 실제 법령 | v2 대응 |
|---|---|---|
| 시행령 §162의2 = FIFO 원칙 | ❌ §162의2는 **지하수개발·이용권** 조문 (FIFO와 무관) | FIFO 단독 가정 폐기. 산정방법 사용자 선택 3종 채택 |
| FIFO만 지원 | 한국 양도세에서 동일종목 일부 양도의 취득가 인식 **명문 규정 없음** | **개별법·FIFO·이동평균법 3종 사용자 선택** |
| lot 공통 `acquisitionCause` | 본법 §104②는 lot별 기산점 분기 (상속/증여/합병) | **lot별 `acquisitionCause` + 보조 일자** |
| 매도 단일 | 사용자 요청 명시 — 분할 매도 지원 | **`transferLots[]` 배열로 확장** |
| §163①4·5호 (합병·분할 가중평균) | 명문상 평균법은 **합병·분할 1주당 취득원가**에 한정 | 일반 분할매수 평균법은 **실무 관행** 명시 + 명문 부재 footnote |

---

## 1. 배경

### 1-1. 사용자 보고

스크린샷에서 섹션 번호 **3 → 5 → 6** 점프 (섹션 4 조건부 숨김). 동시에 현재 엔진/UI는 **1회 단일 취득·단일 양도** 가정 — 실무의 분할 매수·분할 양도 미대응.

### 1-2. 법령 근거 (KoreanLaw MCP 사전 검증 완료)

| 항목 | 근거 |
|---|---|
| 양도세 세율 표 (단기 30%) | **소득세법 §104①11호 가목 1)** — "1년 미만 보유한 주식등으로서 중소기업 외의 법인의 주식등: 양도소득과세표준의 100분의 30". 가목 단서 = **대주주 + 비중소기업 + 1년 미만** 3중 조건 |
| 보유기간 기산점 | **소득세법 §104②** — 취득일~양도일. 단서 1호=상속(피상속인 취득일), 2호=§97의2 증여(증여자 취득일), 3호=합병·분할(종전 주식 취득일) |
| 양도자산 필요경비 (취득가) | **시행령 §163** — 실지거래가액·자본적지출·양도비. §163⑨ 상속·증여 자산은 평가가액. §163①4·5호 합병·분할 1주당 가중평균 명문 |
| **동일종목 분할매수의 취득가 산정 방법** | **명문 규정 없음** (KoreanLaw 검색·해석례 모두 미발견). 실무는 납세자의 입증책임 → 개별법(증빙) / 이동평균법(보충) / FIFO(K-IFRS 회계 관행) 중 **납세자 선택** |

### 1-3. ★ 본 PR과 다자산 합산(`stockTransferAggregateInputSchema`)의 직교성

`lib/api/stock-transfer-tax-schema.ts:201-210` 기존 `stockTransferAggregateInputSchema`(`items` + `deductionMode`)는 **이종 종목·여러 회사 합산** 용도. 본 PR split은 **동일 종목 N회 분할 매수/양도**로 의미 다름:

| 모드 | 의미 | Schema |
|---|---|---|
| Aggregate | 회사 A 100주 + 회사 B 200주 합산 신고 | `stockTransferAggregateInputSchema.items[]` (기존) |
| Split (본 PR) | 회사 A를 3회 분할 매수 → 2회 분할 양도 (산정방법 3종 중 선택) | `acquisitionLots[]`/`transferLots[]` (신규 — 단일 종목 내부) |

**본 PR 범위**: 단일 종목 split만. multi-asset + split 조합은 후속 PR.

---

## 2. 요구사항

### 2-A. UI — 섹션 동적 번호 재할당

조건부 숨김된 섹션이 있어도 **표시되는 섹션은 1부터 연속 번호**. `useMemo`로 visible section 목록 산출.

### 2-B. UI — 섹션 순서 재정렬

| 신규 # | 신규 섹션 (현재 번호) | 비고 |
|---|---|---|
| 1 | 시장 유형 (현 1) | 유지 |
| 2 | 회사 규모 / K-OTC / 벤처기업 (현 2) | 유지 |
| 3 | **양도·취득 일자 및 주식수** (현 6) | ↑ + split 모드 신규 |
| 4 | **취득원인** (현 5) | ↑ — single 모드 한정. split 모드는 lot별 입력으로 대체되어 **자동 숨김** |
| 5 | **대주주 판정** (현 3) | ↓ |
| 6 (조건부) | **기타자산** (현 4) | ↓ — 표시 조건 유지 |

**근거**:
- 분할 lot 도입 시 일자·수량이 후속 모든 분기의 기반 → 상위 이동
- split 모드에서는 **취득원인이 lot별**로 분리되므로 폼-전역 `acquisitionCause` 섹션 4 자동 숨김 → 동적 번호로 1~5 (또는 1~5+6) 연속
- `feedback_ui_order_follows_logic` 정책 부합

### 2-C. 엔진 + UI — 분할 매수·분할 양도 + 산정방법 3종

#### 2-C-1. 모드 + 산정방법 토글 (사용자 인터뷰 결과)

```typescript
lotsMode: "single" | "split";
// split 모드 활성 시 사용. 산정방법 사용자 선택 (인터뷰 Q2 — RadioCardGroup 3옵션)
costAllocationMethod: "specific" | "fifo" | "moving_avg";
```

- `single` (기본): 현행 동작 100% 유지 (회귀 AT-1~AT-11 보존)
- `split`: lot 배열 + 산정방법 선택
  - `specific` (개별법): **lot별 매칭 명시 입력** — 매도 lot 옆에 "어떤 매수 lot에서 차감?" 행렬
  - `fifo` (선입선출법): 자동 매칭. 먼저 매수한 lot부터 매도된 것으로 추정
  - `moving_avg` (이동평균법): 가중평균 단가 사용 + **보유기간은 FIFO 기준** (인터뷰 Q3)

#### 2-C-2. Lot 데이터 모델 (사용자 인터뷰 Q1·Q4 반영)

```typescript
// 매수 lot — lot별 취득원인 + 보조 일자 (§104② lot별 적용)
//
// donorAcquisitionDate 필드는 제외 — helpers.ts:54-58 명시:
//   "주식은 §97의2 미적용 → donor 무시, acquisitionDate(수증일) 사용".
//   gift cause는 lot.acquisitionDate가 수증일을 직접 의미.
export interface AcquisitionLot {
  id: string;                                  // UUID (key용)
  acquisitionDate: string;                     // "YYYY-MM-DD" (lot 자체 취득일 / gift는 수증일)
  shareCount: string;                          // 주
  perShareAcquisitionPrice: string;            // 원 (상속/증여 lot도 §163⑨ 평가가액을 사용자가 직접 입력)
  acquisitionCause: "purchase" | "inheritance" | "gift" | "merger_split";  // lot별
  decedentAcquisitionDate?: string;            // 상속 시 피상속인 취득일 (§104②1)
  preMergerAcquisitionDate?: string;           // 합병·분할 시 종전 주식 취득일 (§104②3)
}

// 매도 lot — 분할 양도 (인터뷰 Q1)
export interface TransferLot {
  id: string;
  transferDate: string;                        // lot 자체 양도일
  shareCount: string;
  perShareTransferPrice: string;
}

// 개별법 매칭 (specific 모드 한정)
export interface SpecificMatching {
  transferLotId: string;
  acquisitionLotId: string;
  shareCount: string;                          // 이 매칭에서 차감하는 주식수
}

// StockTransferFormData 신규 필드
lotsMode: "single" | "split";
costAllocationMethod: "specific" | "fifo" | "moving_avg";
acquisitionLots: AcquisitionLot[];
transferLots: TransferLot[];
specificMatchings: SpecificMatching[];          // specific 모드만 사용
```

#### 2-C-3. 엔진 입력 확장 (`StockTransferInput`)

```typescript
// 분할 lot (선택 — 미입력 시 단건 모드 호환)
acquisitionLots?: Array<{
  acquisitionDate: Date;
  shareCount: number;
  perShareAcquisitionPrice: number;             // split + actual 모드 필수 (상속/증여 lot도 §163⑨ 평가가액)
  acquisitionCause: "purchase" | "inheritance" | "gift" | "merger_split";
  decedentAcquisitionDate?: Date;
  preMergerAcquisitionDate?: Date;
  // donorAcquisitionDate 제외 — 주식은 §97의2 미적용 (helpers.ts:54-58)
}>;
transferLots?: Array<{
  transferDate: Date;
  shareCount: number;
  perShareTransferPrice: number;
}>;
costAllocationMethod?: "specific" | "fifo" | "moving_avg";
specificMatchings?: Array<{
  transferLotId: string;
  acquisitionLotId: string;
  shareCount: number;
}>;
```

기존 `acquisitionDate`·`shareCount`·`perShareAcquisitionPrice`·`transferDate`·`perShareTransferPrice` 단일 필드는 **유지** (split 미사용 시 fallback).

#### 2-C-4. 엔진 계산 — 산정방법별 분기 (`lot-allocation.ts` 신규 ~320줄, 800줄 정책)

**중요 정정 (v2.1)**: `helpers.ts:40-77` `calcHoldingPeriod(input)`는 **input.acquisitionDate 단일값**만 사용 → split 모드에서는 **재사용 불가**. `lot-allocation.ts` 내부에서 §104② 분기 + `differenceInDays`를 **자체 계산**. helpers.ts `calcHoldingPeriod`는 `single` 모드 전용으로 유지.

**공통 출력 타입**:

```typescript
export interface MatchedSubLot {
  /** 매도 sub-lot (FIFO/개별법은 buy lot에서 차감된 부분, 평균법은 매도 lot 전체) */
  saleDate: Date;
  saleShares: number;
  perShareSalePrice: number;
  /** 매수 측 (lot 매칭 또는 평균값) */
  acquisitionDate: Date;                        // §104② 기산점 (lot별 cause에 따라 분기 적용된 일자)
  buyShares: number;                            // 매칭 수량 (specific/fifo는 sub-lot, 평균법은 sale 총량)
  perShareBuyPrice: number;                     // 단가 (specific/fifo는 lot 단가, 평균법은 가중평균)
  holdingDays: number;
  isShortTerm: boolean;                         // < 365일
  /** 이 sub-lot이 단기 30% 게이트 충족 시 단기 세율 적용 */
  perLotGain: number;                           // (saleP - buyP) × matchedShares
}

export interface LotAllocationResult {
  method: "specific" | "fifo" | "moving_avg";
  matched: MatchedSubLot[];
  totalTransferPrice: number;                   // Σ(saleShares × perShareSalePrice)
  totalAcquisitionPrice: number;                // Σ(matchedShares × perShareBuyPrice)
  totalGain: number;                            // totalTransferPrice - totalAcquisitionPrice
  shortTermGain: number;                        // 단기 sub-lot 양도차익 합 (게이트 충족 시)
  longTermGain: number;                         // 장기 sub-lot 양도차익 합
  warnings: string[];
}

export function allocateLots(
  acquisitionLots: AcquisitionLot[],
  transferLots: TransferLot[],
  method: "specific" | "fifo" | "moving_avg",
  specificMatchings?: SpecificMatching[],
): LotAllocationResult;
```

**알고리즘**:

1. **lot별 보유기간 기산점 결정** (§104②):
   - `cause === "purchase"` → `acquisitionDate`
   - `cause === "inheritance"` → `decedentAcquisitionDate ?? acquisitionDate`
   - `cause === "gift"` → `acquisitionDate` (수증일)
   - `cause === "merger_split"` → `preMergerAcquisitionDate ?? acquisitionDate`

2. **모드별 매칭**:
   - **specific**: `specificMatchings`를 그대로 사용. 매칭되지 않은 잔량은 검증 오류. **매수 lot당 매칭 합계 ≤ lot 수량** 검증 추가 (C-20b)
   - **fifo**: 매수 lot을 acquisitionDate ASC로 정렬 → 매도 lot을 transferDate ASC로 정렬 → 순차 차감. 1 sale을 N buy lot에 분할 매칭 (sub-lot)
   - **moving_avg** (총평균법으로 단순화):
     - 가중평균 단가 = Σ(buyShares × perSharePrice) / Σ(buyShares) — **전체 매수 lot 가중평균** (진정 이동평균은 후속 PR)
     - **보유기간 산정 = FIFO 기준** (인터뷰 Q3): 매도 lot마다 가장 오래된 매수 lot부터 차감하여 보유일수 계산. 단, 단가는 가중평균을 사용
     - sub-lot은 FIFO와 동일한 구조이되 `perShareBuyPrice` 만 가중평균값

3. **단기 30% sub-lot별 적용** (§104①11호 가목 1) + 가목 2)) — **엔진 STEP 8 분기 신설 (v2.2 정정)**:

```typescript
// 메인 엔진 stock-transfer-tax.ts STEP 8 — split 모드 분기
const isMajorAndNonSME =
  !input.isSmallMediumEnterprise &&
  (classification.taxCategory === "listed_major" ||
   classification.taxCategory === "unlisted_major");

if (input.acquisitionLots && lotAllocation) {
  // split 모드: sub-lot별 단기/장기 분리 → 각각 세율 적용 후 합산
  //
  // basicDeduction 안분 (v2.2 정정):
  //   sub-lot별 taxBase = taxBase × (subLot.perLotGain / lotAllocation.totalGain)
  //   합계 = taxBase 보장. transferIncome → basicDeduction은 STEP 6에서 차감 후 안분.
  //
  // 세율 적용 (rate-calc.ts:138-160 패턴):
  //   - 단기 + 대주주 + 비SME: §104①11호 가목 1) → 30% (STOCK_SHORT_TERM_RATE)
  //   - 장기 또는 단기 게이트 미충족: §104①11호 가목 2) → 누진 (STOCK_MAJOR_PROGRESSIVE_BRACKETS — 3억 이하 20%/초과 25%)
  //   - §55 누진세율(종합소득 16%) 아님 — 본 PR v2.1 오기 정정

  let totalCalculatedTax = 0;
  for (const subLot of lotAllocation.matched) {
    const subLotTaxBase = Math.floor(taxBase * subLot.perLotGain / lotAllocation.totalGain);
    if (subLot.isShortTerm && isMajorAndNonSME) {
      // 단기 sub-lot: §104①11호 가목 1) 30%
      totalCalculatedTax += applyRate(subLotTaxBase, STOCK_SHORT_TERM_RATE);
    } else {
      // 장기 또는 단기 게이트 미충족: §104①11호 가목 2) 누진
      const { tax } = calcProgressiveTaxFromBrackets(subLotTaxBase, STOCK_MAJOR_PROGRESSIVE_BRACKETS);
      totalCalculatedTax += tax;
    }
  }
  // §47① 10원 미만 절사는 합산 후 1회 적용 (현행 line 317 패턴)
  const calculatedTax = floorTen(totalCalculatedTax);
} else {
  // single 모드: 현행 로직 (line 297-317) 유지
}
```

- **FIFO 정렬 기준**: `lot.acquisitionDate` ASC (cause별 §104② 기산일 아님 — 실제 매수일이 먼저 매수된 것)
- **사이드 효과**: `result.appliedRate`·`progressiveDeduction`은 split 모드에서 **혼합값** — 가중평균 또는 "혼합" 라벨 표시. LotMatchingDetailCard가 sub-lot별 세율 상세 위임
- **`isShortTermHolding`·`holdingPeriodDays`·`holdingPeriodMonths`** — split 모드에서는 **가장 오래된 매칭 sub-lot 기준** (FIFO 첫 매칭) + footnote "최장 보유 lot 기준"
- **`valuationDetail.method`** — split 모드에서 "actual_acquisition" 통일. 산정방법은 `lotMatchingDetail.method`(specific/fifo/moving_avg)에 노출

4. **양도가액·취득가액·양도소득금액 분기 신설** (v2.1 정정):

   - **STEP 2 transferPrice** (stock-transfer-tax.ts:64-76): split 모드 시 `lotAllocation.totalTransferPrice` 사용. single 유지
   - **STEP 3 acquisitionPrice**: split 모드 시 `lotAllocation.totalAcquisitionPrice` 사용. single 유지
   - **STEP 5 transferIncome** (line 261): split 모드 시 `lotAllocation.totalGain - expenses`

5. **결과 echo**:
   - `StockTransferResult.lotMatchingDetail?` 최상위 신규 optional 필드
   - **`appliedRules` enum 확장 (v2.1 정정)** — `types.ts:240-253` closed union에 **3 enum 추가**: `"로트개별법"` · `"로트선입선출"` · `"로트이동평균"`. 산정방법별 1개 push
   - 결과 화면 `StockTransferTaxResultView.tsx` `appliedRules` 배지 라벨 매퍼에 신규 3 enum 라벨 추가

#### 2-C-5. 본 PR 범위 한정 (호환성 매트릭스)

| 조합 | 본 PR | 처리 방식 |
|---|---|---|
| `acquisitionMode === "actual"` + split | ✅ 허용 | lot.perShareAcquisitionPrice 직접 입력 |
| `acquisitionMode === "estimated"` + split | ❌ 차단 | RadioCardGroup `disabled + disabledReason` + Validate 오류 |
| `acquisitionMode === "face_value"` + split | ❌ 차단 | 동상 (장부분실 §99①4는 단건 가정) |
| `acquisitionMode === "sale_case"` + split | ❌ 차단 | 동상 |
| `acquisitionMode === "appraisal"` + split | ❌ 차단 | 동상 |
| `transferPriceMode === "exchange"` + split | ❌ 차단 | 교환은 단건 가정 |
| `cause === "inheritance"` lot 포함 | ✅ 허용 | lot.decedentAcquisitionDate 입력 필수 |
| `cause === "gift"` lot 포함 | ✅ 허용 | lot.acquisitionDate가 수증일 |
| `cause === "merger_split"` lot 포함 | ✅ 허용 | lot.preMergerAcquisitionDate 입력 필수 |
| 다양한 cause 혼재 (예: 매매 + 상속 혼재) | ✅ 허용 | lot별 §104② 기산점 분리 적용 |
| `stockTransferAggregateInputSchema`(다종목 합산) + split | ❌ 본 PR 범위 외 | 직교 모드 |

**UX 사전 차단**: split 모드 토글 노출 시 위 비호환 조합을 RadioCardGroup·ToggleCard의 `disabled + disabledReason`으로 알림.

### 2-C-6. lotsMode 토글 전환 시 폼 마이그레이션 (v2.2 누락 1 보강)

- **single → split**: 폼-전역 `acquisitionDate`·`transferDate`·`shareCount`·`perShareAcquisitionPrice`·`perShareTransferPrice`·`acquisitionCause`·`decedentAcquisitionDate`·`preMergerAcquisitionDate` 값이 있으면 **첫 lot 1개로 자동 마이그레이션** (확인 다이얼로그 없이 즉시 — 데이터 보존)
- **split → single**: 사용자 확인 다이얼로그 ("분할 lot 데이터가 삭제됩니다"). 첫 lot 1개를 폼-전역으로 복원하거나 빈값으로 초기화 (옵션 선택)
- `useEffect` 미러링 금지 — `onChange({ lotsMode: "split" })` 콜백 wrapper에서 마이그레이션 patch 동시 적용

### 2-D. UI — `SplitLotsBlock.tsx` 신규 (~350줄, 800줄 정책)

split 모드 활성 시 Step1 섹션 3에 노출:

- **매수 lot 행렬** ("+ 매수 행 추가" 버튼):
  - 일자(DateInput) · 주식수(DecimalInput) · 1주당 단가(CurrencyInput) · 취득원인(Select: 매매/상속/증여/합병) · cause별 보조 일자(조건부 — 상속이면 피상속인 취득일, 합병이면 종전 주식 취득일) · 삭제 버튼
- **매도 lot 행렬** ("+ 매도 행 추가" 버튼):
  - 일자(DateInput) · 주식수(DecimalInput) · 1주당 단가(CurrencyInput) · 삭제 버튼
- **산정방법 RadioCardGroup** (3옵션, 인터뷰 Q2):
  - 개별법 (specific) · 선입선출법 (fifo) · 이동평균법 (moving_avg)
  - 옵션별 description으로 의미 안내
- **개별법 매칭 행렬** (`specific` 선택 시만):
  - 매도 lot당 행, "어떤 매수 lot에서 차감?" 매수 lot ID 드롭다운 + 매칭 주식수 입력. 다중 매칭 지원 (1 sale → N buy)
- **합계 미리보기**:
  - 총 매수 수량 / 총 매도 수량 / 불일치 경고 (매도 > 매수 시 차단)
  - 산정방법별 자동 산출 미리보기 (개별법은 매칭 부족 시 경고)
- **UX 안내 카드** (v2.2 개선 2):
  - FIFO 모드 선택 시: "매수 lot이 매수일 오름차순으로 자동 정렬되어 매칭됩니다"
  - moving_avg 모드 선택 시: "전체 매수 lot의 가중평균 단가를 사용합니다 (총평균법). 매도 시점별 직전까지의 진정 이동평균은 후속 PR로 지원 예정"
  - specific 모드 선택 시: "매도 lot 옆에서 어떤 매수 lot에서 차감할지 명시 입력하세요"

### 2-E. UI — Step1 섹션 4 `AcquisitionCauseBlock` 분기

split 모드 활성 시 **자동 숨김** (lot별로 cause 입력 받기 때문). single 모드에서는 현행 그대로.

### 2-F. UI — Step2 비활성화·안내 (split 모드 활성 시)

- `perShareTransferPrice`(Step2:82-98) → disabled + violet 안내 "분할 매도 lot에서 자동 산출 중"
- `perShareAcquisitionPrice`(Step2:187-195) → disabled + 안내
- `transferPriceMode` / `acquisitionMode` 비호환 옵션 → `disabled + disabledReason`
- `expenseMode` (필요경비)는 split 모드와 무관 → 그대로 노출

### 2-G. UI — 사이드바 합계 영향

`StockSidebar.tsx`(L34-98 useMemo) split 모드 분기:

- **양도가액**: result 도착 전 = `Σ(transferLots[i].shareCount × transferLots[i].perShareTransferPrice)`. result 도착 후 = result 우선
- **취득가액**: result 도착 전 미리보기 = 산정방법별 임시 계산 (또는 미표시). result 도착 후 result 우선
- 0원 항목 제외 규칙 유지

### 2-H. UI — 결과 화면 `LotMatchingDetailCard` 신규

`StockTransferTaxResultView.tsx`(L211 보유기간 카드 직후) split 모드만 노출:

| 컬럼 | 내용 |
|---|---|
| 매수일 (cause 라벨) | lot 취득일 + cause 배지 (매매/상속/증여/합병) |
| §104② 기산일 | cause별 분기 일자 (예: 상속 → 피상속인 취득일) |
| 매도일 | 매도 sub-lot의 transferDate |
| 매칭 주식수 | sub-lot 수량 |
| 매수 단가 (방법) | specific/fifo는 lot 단가, moving_avg는 가중평균 |
| 매도 단가 | 원 |
| 보유일수 / 단기·장기 | < 365일 / ≥ 365일 |
| sub양도차익 | (매도단가 − 매수단가) × 매칭주식수 |
| 적용세율 | 단기 30% (게이트 충족) 또는 §55 누진 |

합계 행 + expand/collapse. **본 PR은 골격만, 풍부화(CSV·정렬·시각화)는 후속 PR**.

---

## 3. 정책 선검토

| 정책 메모리 | 적용 |
|---|---|
| `feedback_useeffect_store_mirror_forbidden` | lot 합계·산출 미리보기는 `useMemo`. store 미러링 금지 |
| `feedback_store_default_vs_ui_display_fallback` | `lotsMode="single"` / `costAllocationMethod="fifo"` factory default + normalize 3중 일치. lot 배열 default `[]` |
| `feedback_api_zod_schema_sync` (14지점) | ⑨⑩⑫⑬⑭ 모두 lot 배열 + cause 보조 일자 + matchings 처리. `coerceDates`는 dot-notation + `[]` 배열 표기 단일 호출 |
| `feedback_no_silent_apportion_fallback` | lot 미입력 자동 채움 금지. split 모드 활성 시 최소 1행 필수 |
| `feedback_ui_input_path_enumeration` | 케이스 매트릭스 §4 전수 enumerate |
| `feedback_pre_anchor_verification` | Pre-Do anchor 4건 (산정방법 3종 + lot별 cause 혼재) 우선 작성 |
| `feedback_engine_comment_vs_impl_drift` | `lot-allocation.ts` 상단 주석에 §104② + 산정방법 명문 부재 footnote 명시 |
| `feedback_anchor_correction_legal_priority` | 단기 30% 게이트·cause별 기산일 변경 시 cross-cutting anchor 재산정 |
| `feedback_enum_substring_match_forbidden` | `cause === "purchase"` 등 exact 비교. substring 매칭 금지 |

---

## 4. 케이스 매트릭스

| 케이스 | lotsMode | 매수 lot | 매도 lot | costMethod | acquisitionMode | cause 혼재 | 기대 동작 |
|---|---|---|---|---|---|---|---|
| C-1 | single | — | — | — | actual | — | 현행 (회귀 AT-1~AT-11 보존) |
| C-2 | single | — | — | — | estimated | — | 현행 환산 모드 (회귀) |
| C-3 | split | 1 | 1 | fifo | actual | 매매 | 단건과 동일 결과 (cross-check) |
| C-4 | split | 2 | 1 | fifo | actual | 매매 | 1 sale → 2 buy 자동 매칭 |
| C-5 | split | 1 | 2 | fifo | actual | 매매 | 분할 양도 |
| C-6 | split | 3 | 2 | fifo | actual | 매매 | N:M FIFO |
| C-7 | split | 2 (대주주+비SME, 365일 미만+이상 혼재) | 1 | fifo | actual | 매매 | 단기 30% sub-lot별 분리 적용 |
| C-7b | split | 1 (비대주주) | 1 (< 365일) | fifo | actual | 매매 | **단기 30% 미적용** (게이트 미충족) → 누진세율만 |
| C-8 | split | 1 | 1 | fifo | estimated | — | 사전 차단 + Validate 오류 |
| C-9 | split | 1 | 1 | fifo | actual | 매매 | 매도수량 > 매수수량 합 → Validate 오류 |
| C-10 | split | 0 행 | 1 | fifo | actual | — | Validate 오류 ("매수 lot 1행 이상 입력하세요") |
| C-11 | split | 2 (lot1=매매, lot2=상속) | 1 | fifo | actual | 혼재 | lot별 §104② 기산점 분리 (lot2는 피상속인 취득일 사용) |
| C-12 | split | 2 (lot1=매매, lot2=증여) | 1 | fifo | actual | 혼재 | lot별 §104② 기산점 분리 (lot2는 수증일) |
| C-13 | split | 2 (lot1=매매, lot2=합병·분할) | 1 | fifo | actual | 혼재 | lot2는 종전 주식 취득일 사용 |
| C-14 | split | 3 | 2 | **specific** | actual | 매매 | 사용자 명시 매칭. 잔량/불일치 시 Validate 오류 |
| C-15 | split | 2 | 1 | **moving_avg** | actual | 매매 | 가중평균 단가 적용. 보유기간은 FIFO 기준 |
| C-16 | split | 2 (단가 동일·취득일 다름) | 1 (< 365일) | moving_avg | actual | 매매 | 평균 단가 = lot 단가 동일. FIFO 기준 보유일수 산정 |
| C-17 | split | 2 | 2 (매도일 다름) | fifo | actual | 매매 | **lot별 매도일자 다름** → §104② lot별 보유기간 |
| C-18 | split + aggregate | — | — | — | — | — | 사전 차단 (직교 모드) |
| C-19 | split | 1 (cause=inheritance, decedentDate 미입력) | 1 | fifo | actual | 상속 | **Validate 오류** ("상속 lot의 피상속인 취득일 입력 필수") |
| C-20 | split | 2 | 1 | specific | actual | 매매 | 매칭 합계 ≠ 매도수량 → Validate 오류 |
| C-20b | split | 2 (buy1=100주) | 2 | specific | actual | 매매 | buy1에 매칭 합 120주 (lot 수량 초과) → Validate 오류 |
| C-21 | split | 2 | 2 (매도일자 다중·신고기한 다름) | fifo | actual | 매매 | **확정신고 통합 가정** (단순화). 가산세 영향은 후속 PR로 차단 |
| C-19b | split | 1 (cause=merger_split, preMergerDate 미입력) | 1 | fifo | actual | 합병·분할 | **Validate 오류** ("합병·분할 lot의 종전 주식 취득일 입력 필수") |
| C-22 | split | 1 (perShareAcquisitionPrice=0) | 1 | fifo | actual | 매매 | **Validate 오류** ("매수 lot의 1주당 단가는 0보다 커야 합니다") — 무상취득 예외는 후속 PR |
| C-23 | split | 1 | 1 (perShareTransferPrice=0) | fifo | actual | 매매 | **Validate 오류** ("매도 lot의 1주당 단가는 0보다 커야 합니다") |

---

## 5. 14개 동기화 지점 (정정 반영)

| # | 지점 | 위치 | 변경 |
|---|---|---|---|
| ① | FormData 타입 | `lib/stores/calc-wizard-stock-store.ts` | + `lotsMode`·`costAllocationMethod`·`acquisitionLots`·`transferLots`·`specificMatchings`. `AcquisitionLot.donorAcquisitionDate` **제외** (주식은 §97의2 미적용) |
| ② | initial | `createInitialStockFormData` | + default(`"single"`/`"fifo"`/`[]`/`[]`/`[]`) |
| ③ | normalize | `normalizeStockFormData` | + enumField × 2 + 배열 sanitizer (요소별 strField·enumField + 빈 row 필터) |
| ④ | API 변환 | `lib/calc/stock-transfer-tax-api.ts` 의 **`buildStockTransferApiBody`** (api.ts:39-176) | split 모드 시 lot 배열·matchings spread. single 시 단일 필드 |
| ⑤ | UI 위젯 | `Step1.tsx` (재정렬·동적 번호) + 신규 **`SplitLotsBlock.tsx`** + `AcquisitionCauseBlock` 조건부 숨김 + **Step2.tsx perShare disable 분기** | |
| ⑥ | 사이드바 합계 | `StockSidebar.tsx` (L34-98 useMemo) | split 모드 분기 |
| ⑦ | 결과 카드 | `StockTransferTaxResultView.tsx` | 신규 `LotMatchingDetailCard` + **`appliedRules` 배지 라벨 매퍼에 신규 3 enum 추가** (로트개별법/로트선입선출/로트이동평균) + 산정방법 배지 + footnote ("산정방법은 납세자 입증책임 — 세법 명문 부재") + `appliedRate` "혼합" 라벨 분기 |
| ⑧ | Validation | `lib/calc/stock-transfer-tax-validate.ts` (`validateStep1`/`validateStep2`) | split 모드 분기. **validate.ts:214·232 `perShareTransferPrice`·`perShareAcquisitionPrice` 필수 검증을 `lotsMode === "single"` 한정**. split 모드에서는 lot 단위 검증(`> 0` 강제 — C-22·C-23). `shareCount` 필수 single 한정. cause별 보조 일자 필수(C-19·C-19b). specific 매칭 합계 ≤ 매도수량 + 매수 lot당 매칭 합 ≤ lot 수량 검증(C-20·C-20b) |
| ⑨ | Zod enum 메인 | **`lib/api/stock-transfer-tax-schema.ts`** | `lotsModeSchema`·`costAllocationMethodSchema` enum + lot 배열 |
| ⑩ | Zod refines | `addStockRefines` superRefine | split 모드 호환성 게이트 + matchings 무결성 + cause별 보조 일자 필수 refine |
| ⑪ | acquisitionDate fallback | `buildStockTransferApiBody` | split 모드 시 가장 오래된 매수 lot 일자를 단건 `acquisitionDate`에도 채움 (legacy fallback + STT 호환) |
| ⑫ | **Zod 입력 객체 정의** | `stock-transfer-tax-schema.ts` | `acquisitionLotSchema` (cause + 보조 일자) · `transferLotSchema` · `specificMatchingSchema` z.object 명시 (TypeScript 미감지) |
| ⑬ | **body spread** | `buildStockTransferApiBody` 내부 | `acquisitionLots`·`transferLots`·`costAllocationMethod`·`specificMatchings` 명시 spread |
| ⑭ | **Route handler 매핑** | `app/api/calc/stock-transfer/route.ts` (L27-36 STOCK_DATE_FIELDS) | dot-notation **4개 추가** (donorAcquisitionDate 제외 — 주식 미사용): `"acquisitionLots[].acquisitionDate"`, `"acquisitionLots[].decedentAcquisitionDate"`, `"acquisitionLots[].preMergerAcquisitionDate"`, `"transferLots[].transferDate"` |

---

## 6. Pre-Do Anchor (Do 진입 전 4건 우선 실행)

`__tests__/tax-engine/stock-transfer/lot-allocation.anchor.test.ts` 신규:

### AT-LOT-1 (specific 개별법 N:M)

```typescript
//  buy1: 2023-01-15, 100주 @ 10,000, cause=purchase
//  buy2: 2024-09-01, 200주 @ 12,000, cause=purchase
//  sell: 2025-03-10, 250주 @ 15,000
//  매칭: {sell ← buy1 100주, sell ← buy2 150주} (사용자 명시)
//  → 양도가 3,750,000 / 취득가 2,800,000 / 양도차익 950,000
//  → buy1 sub-lot: 100주 × (15,000-10,000) = 500,000 (보유 786일 = 장기)
//  → buy2 sub-lot: 150주 × (15,000-12,000) = 450,000 (보유 190일 = 단기)
```

### AT-LOT-2 (fifo 자동 매칭 + 단기 30% 게이트) — v2.2 세율 정정

AT-LOT-1과 동일 lot 구성 + costMethod="fifo" + 대주주(listed_major) + 비SME:
```typescript
//  basicDeduction 안분: subLotTaxBase = taxBase × (perLotGain / totalGain)
//  단기 sub-lot 450,000 × 30% = 135,000 (§104①11호 가목 1))
//  장기 sub-lot 500,000 × 20% = 100,000 (§104①11호 가목 2) 누진 3억 이하)
//  총 산출세액 235,000 (§55 종합소득 누진 아님 — STOCK_MAJOR_PROGRESSIVE_BRACKETS)
//  (basicDeduction 250만원이 차감되면 sub-lot별 안분 후 세율 적용)
```

### AT-LOT-3 (moving_avg **총평균법** + FIFO 보유기간) — 대주주+비SME 산출세액 검증

```typescript
//  buy1: 2023-01-15, 100주 @ 10,000
//  buy2: 2024-09-01, 200주 @ 13,000
//  sell: 2025-03-10, 250주 @ 15,000
//  가중평균 단가 = (100×10,000 + 200×13,000) / 300 = 3,600,000/300 = 12,000
//  취득가 = 250 × 12,000 = 3,000,000
//  양도차익 = 3,750,000 - 3,000,000 = 750,000
//  보유기간(FIFO 기준): buy1 100주 (786일 장기) + buy2 150주 (190일 단기)
//  → 단기 sub-lot: 150 × (15,000 - 12,000) = 450,000
//  → 장기 sub-lot: 100 × (15,000 - 12,000) = 300,000
//  (sub-lot은 단가는 평균값, 보유기간은 FIFO)
//
//  대주주+비SME 산출세액 (v2.2):
//  → 단기 sub-lot 450,000 × 30% = 135,000
//  → 장기 sub-lot 300,000 × 20% = 60,000
//  → 총 195,000 (basicDeduction 250만원 차감 후 안분 시 별도 계산)
```

### AT-LOT-4 (cause 혼재 — 매매 + 상속)

```typescript
//  buy1: 2024-09-01, 200주 @ 12,000, cause=purchase
//  buy2: 2024-12-01, 100주 @ 14,000, cause=inheritance, decedentAcquisitionDate=2020-03-15
//  sell: 2025-04-10, 300주 @ 16,000
//  costMethod="fifo"
//  → buy1 200주: 보유 §104② = 양도일 - 2024-09-01 = 221일 (단기)
//  → buy2 100주: 보유 §104② = 양도일 - 2020-03-15 (피상속인 취득일) = 1,852일 (장기)
//  cause별 §104② 기산점 분기 검증
```

### Pre-Do FAIL 시 디자인 환류

- 산정방법별 보유기간 정의 차이 발견 → KoreanLaw 추가 해석례 추적
- §104② 기산점 cause별 분기가 lot 단위로 적용되지 않으면 → lot 공통 cause로 단순화 검토

---

## 7. 작업 분해

1. **Plan v2 확정** (본 문서 — KoreanLaw 검증 + 인터뷰 4문항 반영)
2. **Pre-Do anchor 4건 작성·실행** (AT-LOT-1~4) — `lot-allocation.ts` 미존재로 fail → 디자인 환류 검토 후 진행
3. **Do — 엔진**
   1. `lib/tax-engine/stock-transfer/lot-allocation.ts` 신규 (~280줄, 800줄 정책) — `allocateLots()` 순수 함수 + 산정방법 3분기 + lot별 §104② 기산점 적용 + 상단 주석에 §104② + 명문 부재 footnote
   2. `types/stock-transfer.types.ts` — `acquisitionLots?`·`transferLots?`·`costAllocationMethod?`·`specificMatchings?` optional + 결과 `lotMatchingDetail?` 신규 최상위 필드
   3. `stock-transfer-tax.ts` — Input 정규화 (lot 미입력 시 단일 lot 1건 변환) + `allocateLots()` 호출 + 단기 30% sub-lot별 게이트 적용 + `appliedRules.push("로트식별적용:{method}")` + lotMatchingDetail echo
4. **Do — store + UI**
   1. store ①②③ — `lotsMode`·`costAllocationMethod`·`acquisitionLots`·`transferLots`·`specificMatchings` + 배열 sanitizer
   2. `Step1.tsx` 섹션 재정렬 + 동적 번호 (visible sections `useMemo`) + split 모드 시 섹션 4(`AcquisitionCauseBlock`) 자동 숨김
   3. `components/calc/stock-transfer/SplitLotsBlock.tsx` 신규 (~350줄) — 매수/매도 lot 행렬 + RadioCardGroup 산정방법 + specific 매칭 행렬 + 호환성 사전 차단
   4. `Step2.tsx` 분기 — split 활성 시 perShare 위젯 disable + violet 안내 카드
   5. `StockSidebar.tsx` 분기 — split lot 합계 미리보기
5. **Do — API/Zod/Route ④⑨⑩⑪⑫⑬⑭**:
   - `lib/api/stock-transfer-tax-schema.ts` — lot/matching z.object × 3 + `addStockRefines` 호환성 게이트
   - `lib/calc/stock-transfer-tax-api.ts` `buildStockTransferApiBody` — lot 배열 spread + acquisitionDate FIFO fallback
   - `app/api/calc/stock-transfer/route.ts` — STOCK_DATE_FIELDS에 dot-notation 4건 추가
6. **Validate ⑧** — `validateStep1` split 모드 분기 (C-7~C-20). `shareCount`·`acquisitionDate`·`transferDate` 필수 single 한정. cause별 보조 일자 필수. matchings 합계 검증
7. **UI 결과 카드 ⑦** — `LotMatchingDetailCard` 신규 (골격만)
8. **Test** — anchor 20건+ (LOT-1~LOT-20) + 회귀 AT-1~AT-11 보존
9. **Check** — `ui-engine-sync-checker` (14지점 read-only) + `npx tsc --noEmit` + 전체 vitest + 브라우저 수동
10. **Commit + Report + MEMORY.md** + 후속 PR 트리거 명시

---

## 8. 동적 번호 재할당 구체 패턴

```tsx
const sections = useMemo(() => {
  const items: Array<{key: string; title: string; render: () => ReactNode}> = [
    { key: "market", title: "시장 유형", render: () => <MarketTypeBlock ... /> },
    { key: "company", title: "회사 규모 / K-OTC / 벤처기업", render: () => <CompanyTypeBlock ... /> },
    { key: "dates", title: form.lotsMode === "split"
        ? "양도·취득 lot (분할 모드)"
        : "양도·취득 일자 및 주식수",
      render: () => <DatesAndLotsBlock form={form} onChange={onChange} /> },
  ];
  // single 모드에서만 cause 섹션 표시 (split은 lot별 cause 입력)
  if (form.lotsMode === "single") {
    items.push({ key: "cause", title: "취득원인 (단기 30% 기산점 §104②)",
      render: () => <AcquisitionCauseBlock ... /> });
  }
  items.push({ key: "major", title: "대주주 판정 (시행령 §157)",
    render: () => <MajorShareholderBlock ... /> });
  if (form.marketType === "other_asset" || form.isQualifyingBlockShareholder || form.isHeavyRealEstateForRate) {
    items.push({ key: "other", title: "기타자산 해당 여부 (§94①4)",
      render: () => <OtherAssetBlock ... /> });
  }
  return items;
}, [form, onChange]);

return (
  <div className="space-y-8">
    {sections.map((s, idx) => (
      <section key={s.key}>
        <SectionTitle n={idx + 1} title={s.title} />
        {s.render()}
      </section>
    ))}
  </div>
);
```

- single 모드 + 기타자산 OFF → **5개 섹션** (1~5)
- single 모드 + 기타자산 ON → **6개 섹션** (1~6)
- split 모드 + 기타자산 OFF → **4개 섹션** (1~4, cause 자동 숨김)
- split 모드 + 기타자산 ON → **5개 섹션** (1~5)

---

## 9. 위험 / 후속

- **산정방법 명문 부재 위험**: §104②·§163 어디에도 일반 분할매수 취득가 산정 명문 없음. 본 PR은 **납세자 선택**으로 책임 이전. UI hint 카드 + 결과 화면 footnote ("산정방법은 납세자 입증책임")
- **단기 30% sub-lot별 분리 적용의 법령 정당성**: §104①11호 가목 1) "1년 미만 보유한 주식등"을 sub-lot별로 판정. 해석례 추가 추적 권장
- **이동평균법 = 총평균법으로 단순화** (v2.1 정정): 전체 매수 lot 가중평균. 진정 이동평균(매도 시점별 직전까지의 평균)은 후속 PR
- **이동평균법의 보유기간 = FIFO 기준** (인터뷰 Q3 채택): 가중평균 보유기간을 사용하지 않음. 사용자에게 명시 안내
- **`isShortTermHolding`·`holdingPeriodDays`·`holdingPeriodMonths` (result 단일값) — split 모드 처리**: **가장 오래된 매칭 sub-lot 기준** (FIFO 첫 매칭) + 결과 화면 footnote "최장 보유 lot 기준". 상세는 LotMatchingDetailCard에 위임
- **`appliedRate`·`progressiveDeduction` (result 단일값) — split 모드 처리**: 단기+장기 sub-lot 혼합 시 "혼합" 라벨 또는 가중평균. LotMatchingDetailCard에 sub-lot별 세율 위임
- **분할 양도 시 신고기한 단순화**: §105 예정신고는 매도 건마다 기한 별개이나 본 PR은 **확정신고 통합 가정** (`filingDate` 단일 유지). 가산세 영향은 후속 PR로 명시 차단
- **STT(증권거래세) lot별 분리**: 본 PR은 단순화 — STT 합계 사용. lot별 매도일자가 시장 세율 변동기 겹치면 후속 PR
- **개별법 매칭 UX 복잡도**: 매수 3개·매도 2개 시 매칭 행이 N×M 행렬화. "FIFO 자동 채우기" 보조 버튼은 후속 PR
- **결과 화면 부담**: N×M 매칭 detail. 본 PR은 골격만. CSV·정렬·시각화는 후속 PR
- **회귀 가드**: AT-1~AT-11이 default `lotsMode="single"`로 그대로 통과
- **`stockTransferAggregateInputSchema` 직교성**: 본 PR은 단일 종목 split만. multi-asset 분기에서는 split 옵션 사전 차단
- **`appliedRules` enum 확장**: closed union에 3 enum 추가 — 결과 화면 라벨 매퍼·validate·SplitLotsBlock 모두 동기화 누락 가능

## 9-A. 후속 PR 트리거 (본 PR 명시 차단 항목)

1. `LotMatchingDetailCard` 풍부화 (PDF·CSV·정렬·시각화)
2. 환산취득가 모드 + split (`acquisitionMode === "estimated"` lot별 환산)
3. 부담부증여·교환 + split
4. 가중평균 보유기간 옵션 (이동평균법 + 가중평균 보유기간)
5. **진정 이동평균법** (매도 시점별 직전까지의 평균)
6. 개별법 매칭 자동 보조 버튼 ("FIFO로 자동 채우기" + 수동 수정)
7. lot별 STT 분리 (시장 세율 변동기 대응)
8. **분할 양도 시 매도일자별 예정신고 기한 분리** (가산세 영향 분석)
9. multi-asset aggregate + split 조합

---

## 10. Definition of Done

- [ ] 케이스 매트릭스 C-1~C-20 모든 분기 enumerate 완료
- [ ] KoreanLaw 사전 검증 결과 (§104②·§163·산정방법 명문 부재) plan §1-2에 footnote 인용
- [ ] Pre-Do anchor AT-LOT-1~4 작성·실행 (디자인 환류 0 또는 1회)
- [ ] anchor LOT-1~LOT-20 (산정방법 3종·cause 혼재·단기 분리·검증오류) 모두 toBe
- [ ] 14지점 ⑨⑩⑫⑬⑭ grep 자가 점검 통과
- [ ] **호환성 사전 차단**: estimated/face_value/sale_case/appraisal/exchange + split 조합 RadioCardGroup `disabled` 확인
- [ ] **lot별 cause 보조 일자 필수 검증** (C-19) — 상속 lot에 decedentDate 누락 시 차단
- [ ] **specific 매칭 합계 = 매도수량 검증** (C-20)
- [ ] **specific 매수 lot당 매칭 합계 ≤ lot 수량 검증** (C-20b)
- [ ] **`appliedRules` enum 3종 추가** (로트개별법/로트선입선출/로트이동평균) + 결과 화면 라벨 매퍼 동기화
- [ ] **`AcquisitionLot.donorAcquisitionDate` 미포함 확인** (주식은 §97의2 미적용)
- [ ] **단기 30% sub-lot별 분리 적용** — 엔진 STEP 8 분기 + 세율 합산 동작 확인
- [ ] **장기 sub-lot 세율 = §104①11호 가목 2) 누진** (3억 이하 20%/초과 25%) — `STOCK_MAJOR_PROGRESSIVE_BRACKETS` 사용. §55(종합소득) 아님
- [ ] **basicDeduction 안분 산식** — `subLotTaxBase = taxBase × (subLot.perLotGain / lotAllocation.totalGain)`. 합계 = taxBase 보장
- [ ] **floorTen 적용** sub-lot 합산 후 1회 (§47①)
- [ ] **result `appliedRate`·`holdingPeriodDays` split 모드 분기 처리** ("혼합" 라벨 또는 가장 오래된 sub-lot 기준)
- [ ] **valuationDetail.method** split 모드에서 "actual_acquisition" + lotMatchingDetail.method 노출
- [ ] **lotsMode 토글 전환 시 폼 마이그레이션** (single↔split 시 데이터 손실 방지)
- [ ] **lot per-share 단가 > 0 검증** (C-22·C-23) — 무상취득은 후속 PR
- [ ] **validateStep2 split 분기** — perShareTransferPrice·perShareAcquisitionPrice single 한정, split 시 lot 단위 검증
- [ ] **merger_split lot의 preMergerAcquisitionDate 필수 검증** (C-19b)
- [ ] **Step1 동적 번호**: split 모드·기타자산 토글 4조합(4~6개 섹션) 모두 1~N 연속 표시
- [ ] **Step2 비활성화 분기** 동작 확인 (split 모드 활성 시 perShare 위젯 disabled + 안내 카드)
- [ ] **사이드바 합계** split 모드 분기 동작 확인
- [ ] `npx tsc --noEmit` 0 errors
- [ ] `npx vitest run` 전체 통과 (회귀 0)
- [ ] AT-1~AT-11 기존 anchor 보존 확인 (default `lotsMode="single"`)
- [ ] **법령 정합 cross-cutting anchor 갱신** (단기 30% 게이트·cause별 기산일 변경 시)
- [ ] 브라우저 수동: single↔split 토글, 산정방법 3 모드 전환, lot 추가/삭제, cause 혼재 매수, 매도 다중, 호환성 사전 차단, 결과 카드 lotMatchingDetail
- [ ] `ui-engine-sync-checker` 14지점 누락 0

---

## 11. 참고

### 법령 (KoreanLaw 사전 검증 완료 2026-05-18)
- 소득세법 §104①11호 가목 1) (단기 30%, 대주주 + 비중소기업 + 1년 미만)
- 소득세법 §104② (보유기간 기산점, cause별 분기)
- 시행령 §163 (양도자산 필요경비) + §163⑨ (상속/증여 평가가액)
- 시행령 §163①4·5호 (합병·분할 1주당 가중평균 — 일반 분할매수 평균법과는 다른 케이스)
- **산정방법 명문 부재**: KoreanLaw 해석례 검색 NOT_FOUND. 납세자 선택으로 처리

### 정책 메모리 (8건)
- `feedback_pdca_session_efficiency` · `feedback_pre_anchor_verification` · `feedback_engine_comment_vs_impl_drift` · `feedback_anchor_correction_legal_priority` · `feedback_no_silent_apportion_fallback` · `feedback_useeffect_store_mirror_forbidden` · `feedback_store_default_vs_ui_display_fallback` · `feedback_api_zod_schema_sync` · `feedback_enum_substring_match_forbidden`

### 코드 참조
- `MajorShareholderBlock.tsx` (RadioCardGroup + 분기 입력 패턴)
- `lib/calc/transfer-tax-api.ts` `ParcelInput` (다필지 배열 선례)
- `lib/api/date-coerce.ts:76-86` (배열 dot-notation 지원)
- `lib/api/stock-transfer-tax-schema.ts:201-210` (aggregate schema 직교 모드)

---

## 12. 변경 로그

| 일자 | 버전 | 변경 |
|---|---|---|
| 2026-05-18 | v1 초안 | 초안 작성. §162의2 FIFO 가정. lot 공통 cause |
| 2026-05-18 | v1.1 | 코드 대조 검증 정정 7건 (단기 30% 게이트·결과 echo·Zod 경로·body 빌더·coerceDates·aggregate 직교성) + 누락 6건 + 개선 5건 |
| 2026-05-18 | **v2 전면 재작성** | KoreanLaw 검증으로 §162의2 FIFO 가정 폐기. 인터뷰 4문항 반영: ①매수·매도 양쪽 다중 ②산정방법 3종 RadioCardGroup ③평균법 보유기간 = FIFO 기준 ④상속·증여 lot 단가 직접 입력. lot별 cause + 보조 일자 추가. 케이스 13→20개로 확장. anchor 1→4건. Step1 섹션 4(`AcquisitionCauseBlock`) split 모드 자동 숨김 추가 |
| 2026-05-18 | **v2.1 코드 대조 정정** | 코드 검증 기반 15건 정정: 🔴 ①`appliedRules` enum 확장 3종(로트개별법/로트선입선출/로트이동평균) ②`calcHoldingPeriod` single 한정·split은 `lot-allocation.ts` 자체 계산 ③메인 엔진 STEP 2/3/5/8 split 분기 명시 ④단기 30% sub-lot별 분리 적용 의사코드 ⑤분할 양도 신고기한 통합 가정 ⑥`donorAcquisitionDate` 제거 (§97의2 미적용). 🟡 ⑦specific 매수 lot당 매칭 합계 검증(C-20b) ⑧appliedRules 라벨 매퍼 동기화 ⑨result 단일값 필드 분기 처리. 🟢 ⑩moving_avg=총평균법 단순화 ⑪결과 카드 산정방법 배지+footnote ⑫후속 PR 9건 ⑬DoD 6건 추가 ⑭anchor 보강 ⑮입력 순서 명시. 케이스 20→22개 (C-20b, C-21 추가) |
| 2026-05-18 | **v2.2 세율·검증 정정** | 코드 재검증 기반 13건 정정: 🔴 ①장기 sub-lot 세율 = **§104①11호 가목 2) 누진**(3억 이하 20%/초과 25%, `STOCK_MAJOR_PROGRESSIVE_BRACKETS`). §55 종합소득 누진 아님 ②basicDeduction sub-lot 안분 산식 명시 (`subLotTaxBase = taxBase × subLotGain/totalGain`) ③AT-LOT-2 산출세액 215,000→**235,000** 정정 + AT-LOT-3 산출 195,000 추가. 🟡 ④lotsMode 토글 전환 시 폼 마이그레이션(§2-C-6) ⑤lot 단가 > 0 검증(C-22·C-23) ⑥validateStep2 split 분기 명시 ⑦valuationDetail.method "actual_acquisition" 통일 ⑧merger_split lot preMergerAcquisitionDate 필수(C-19b) ⑨floorTen 합산 후 1회 ⑩FIFO 정렬 기준 lot.acquisitionDate 명시. 🟢 ⑪SplitLotsBlock UX 안내 카드 (3 모드별) ⑫DoD 10건 추가 ⑬변경 로그 entry. 케이스 22→25개 (C-19b, C-22, C-23 추가) |
