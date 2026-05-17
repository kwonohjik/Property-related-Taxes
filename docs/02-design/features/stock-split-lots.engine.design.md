# 주식 양도세 분할 매수·분할 양도 — 엔진 설계

> **세목**: 주식 양도소득세 (stock-transfer)
> **참조 Plan**: `docs/00-pm/stock-step1-reorder-split-lots.plan.md` v2.2
> **상태**: Design v1 (2026-05-18)
> **UI 측 명세**: `stock-split-lots.ui.design.md`

## Context

### 동기

현행 엔진(`lib/tax-engine/stock-transfer/stock-transfer-tax.ts`)은 **1회 단일 취득·단일 양도** 가정. 실무는:

1. **분할 매수**: 동일 종목을 여러 차례에 걸쳐 매수 (시기별·취득원인별 lot 분리)
2. **분할 양도**: 1년 내 여러 차례 매도 (예정신고 통합 신고)
3. **취득원인 혼재**: 매매 lot + 상속 lot + 증여 lot 혼합 보유

→ 동일 종목 일부 양도 시 **취득가 인식 방법**(개별법/선입선출법/이동평균법) + **lot별 §104② 보유기간 기산점** + **단기 30% sub-lot별 적용**이 필요.

### 이전 한계

- 폼-전역 `acquisitionDate`·`shareCount`·`perShareAcquisitionPrice` 단일 필드 — 다중 lot 불가
- `acquisitionCause` 폼-전역 단일값 — lot별 cause 혼재 불가
- 단기 30% 판정이 단일 보유기간 기반 — sub-lot별 단기/장기 분리 불가

---

## ★ 케이스 인벤토리

| # | 시나리오 | 법령 근거 | anchor 출처 | 테스트 파일 | 상태 |
|---|---------|----------|-------------|-----------|------|
| C-1 | single 모드 actual (회귀) | §104①11호 가목 | AT-1~AT-11 보존 | `__tests__/.../*.test.ts` | ☐ 회귀 통과 |
| C-2 | single 모드 estimated (회귀) | §99·§176의2 | 기존 anchor | 동상 | ☐ 회귀 통과 |
| C-3 | split 매수1·매도1·fifo (cross-check) | §104② | LOT-3 | `lot-allocation.test.ts` | ☐ TODO |
| C-4 | split 매수2·매도1·fifo (N:1 매칭) | 시행령 명문 부재(실무) | LOT-4 | 동상 | ☐ TODO |
| C-5 | split 매수1·매도2·fifo (1:N 매도) | 동상 | LOT-5 | 동상 | ☐ TODO |
| C-6 | split 매수3·매도2·fifo (N:M) | 동상 | LOT-6 | 동상 | ☐ TODO |
| C-7 | split 매수2·매도1·fifo (대주주+비SME, 단기/장기 혼재) | §104①11호 가목 1)·2) | **AT-LOT-2 (Pre-Do)** | `lot-allocation.anchor.test.ts` | ☐ Pre-Do 필수 |
| C-7b | split 매수1·매도1·fifo (비대주주 → 단기 30% 미적용) | §104①11호 나목 | LOT-7b anchor | `lot-allocation.test.ts` | ☐ TODO |
| C-24 | split + 비과세 (K-OTC 비대주주·중소·벤처) | 조특법 §14①7호 | LOT-24 anchor | 동상 | ☐ TODO |
| C-25 | split + 양도손실 (매도단가 < 매수단가) | sub-lot perLotGain 음수 | LOT-25 anchor | 동상 | ☐ TODO |
| C-26 | split + 비대주주 (단기 30% 게이트 미충족 → 나목 단일 세율) | §104①11호 나목 | LOT-26 anchor | 동상 | ☐ TODO |
| C-8 | split + estimated 차단 | (호환성) | LOT-8 | 동상 | ☐ TODO |
| C-9 | split + 매도수량 > 매수수량 차단 | (검증) | LOT-9 | 동상 | ☐ TODO |
| C-10 | split + 매수 lot 0행 차단 | (검증) | LOT-10 | 동상 | ☐ TODO |
| C-11 | split + cause 혼재 (매매+상속) lot별 §104② 기산점 | §104②1 | **AT-LOT-4 (Pre-Do)** | `lot-allocation.anchor.test.ts` | ☐ Pre-Do 필수 |
| C-12 | split + cause=gift lot 포함 (수증일=acquisitionDate) | §104② 본문 | LOT-12 | 동상 | ☐ TODO |
| C-13 | split + cause=merger_split lot 포함 | §104②3 | LOT-13 | 동상 | ☐ TODO |
| C-14 | split + specific 사용자 명시 매칭 (N:M) | **AT-LOT-1 (Pre-Do)** | 동상 | `lot-allocation.anchor.test.ts` | ☐ Pre-Do 필수 |
| C-15 | split + moving_avg 총평균법 + FIFO 보유기간 | **AT-LOT-3 (Pre-Do)** | 동상 | `lot-allocation.anchor.test.ts` | ☐ Pre-Do 필수 |
| C-16 | split + moving_avg (lot 단가 동일, 취득일 다름) | (의사 검증) | LOT-16 | 동상 | ☐ TODO |
| C-17 | split + 매도일자 다중 (lot별 보유기간) | §104② | LOT-17 | 동상 | ☐ TODO |
| C-18 | split + multi-asset aggregate 차단 | (직교성) | LOT-18 | 동상 | ☐ TODO |
| C-19 | split + cause=inheritance + decedentDate 누락 차단 | §104②1 | LOT-19 | 동상 | ☐ TODO |
| C-19b | split + cause=merger_split + preMergerDate 누락 차단 | §104②3 | LOT-19b | 동상 | ☐ TODO |
| C-20 | split + specific 매칭 합계 ≠ 매도수량 차단 | (검증) | LOT-20 | 동상 | ☐ TODO |
| C-20b | split + specific 매수 lot당 매칭 합 > lot 수량 차단 | (검증) | LOT-20b | 동상 | ☐ TODO |
| C-21 | split + 매도일자 다중 신고기한 (확정신고 통합 가정) | §105 | LOT-21 | 동상 | ☐ TODO |
| C-22 | split + AcquisitionLot.perShareAcquisitionPrice = 0 차단 | (검증) | LOT-22 | 동상 | ☐ TODO |
| C-23 | split + TransferLot.perShareTransferPrice = 0 차단 | (검증) | LOT-23 | 동상 | ☐ TODO |

**규칙**:
- Pre-Do anchor 4건(C-7·C-11·C-14·C-15) 미실행 시 Do 단계 진입 금지.
- 사용자가 추가 케이스 제시 → 먼저 이 표에 행 추가 → 그 다음 코드.

---

## 법령 근거 (KoreanLaw MCP 사전 검증 완료 2026-05-18)

```
소득세법 §104①11호 가목:
  대주주가 양도하는 주식등
  1) 1년 미만 보유한 주식등으로서 중소기업 외의 법인의 주식등: 양도소득과세표준의 100분의 30
  2) 1)에 해당하지 아니하는 주식등: STOCK_MAJOR_PROGRESSIVE_BRACKETS 누진 (3억 이하 20%/초과 25%)

소득세법 §104②:
  보유기간은 해당 자산의 취득일부터 양도일까지로 한다. 다만,
  1. 상속받은 자산은 피상속인이 그 자산을 취득한 날
  2. §97의2 (주식 미적용)
  3. 합병·분할: 피합병법인·분할법인·소멸한 분할·합병의 상대방 법인의 주식등을 취득한 날

소령 §163⑨:
  상속·증여받은 자산은 상속개시일·증여일 현재 §60-66 평가가액을 취득당시 실지거래가액으로 본다.

소령 §163①4·5호:
  합병·분할 시 1주당 취득원가 = 종전 주식 총취득가 / 교부 주식수 (가중평균)

분할매수 취득가 산정방법:
  명문 규정 없음. 납세자 입증책임. 본 PR은 사용자 선택 3종 지원:
  - specific (개별법): 매도 lot당 매수 lot 명시 매칭
  - fifo (선입선출법): lot.acquisitionDate ASC 순차 차감
  - moving_avg (총평균법으로 단순화): 전체 매수 lot 가중평균
```

법령 상수: `lib/tax-engine/legal-codes/stock-transfer.ts` (신규)
- `STOCK.SECTION_104_1_11_GA_1_SHORT_TERM = "소득세법 §104①11호 가목 1) — 단기 30%"`
- `STOCK.SECTION_104_1_11_GA_2_PROGRESSIVE = "소득세법 §104①11호 가목 2) — 누진세율"`
- `STOCK.SECTION_104_2_1_INHERITANCE_START` (기존)
- `STOCK.SECTION_104_2_3_MERGER_START` (기존)
- `STOCK.LOT_ALLOCATION_NO_STATUTE = "분할매수 취득가 산정방법 — 세법 명문 부재 (납세자 입증책임)"` (신규)

---

## 엔진 input 타입

```ts
// types/stock-transfer.types.ts — 신규 추가 (기존 필드는 유지, optional 확장)

export interface AcquisitionLot {
  /** UI key 용 UUID — 엔진은 사용 안 함 */
  id?: string;
  acquisitionDate: Date;                                    // lot 자체 취득일 (gift는 수증일)
  shareCount: number;
  /** 1주당 단가 (원). 상속/증여 lot도 §163⑨ 평가가액을 사용자가 직접 입력 */
  perShareAcquisitionPrice: number;
  acquisitionCause: "purchase" | "inheritance" | "gift" | "merger_split";
  /** 상속 lot: 피상속인 취득일 (§104②1) */
  decedentAcquisitionDate?: Date;
  /** 합병·분할 lot: 종전 주식 취득일 (§104②3) */
  preMergerAcquisitionDate?: Date;
  // donorAcquisitionDate 제외 — 주식은 §97의2 미적용 (helpers.ts:54-58)
}

export interface TransferLot {
  id?: string;
  transferDate: Date;
  shareCount: number;
  perShareTransferPrice: number;
}

export interface SpecificMatching {
  transferLotId: string;                                    // UI에서 부여한 ID 참조
  acquisitionLotId: string;
  shareCount: number;
}

// StockTransferInput 확장 (기존 필드 유지)
export type StockTransferInput = {
  // ... 기존 필드 (acquisitionDate, transferDate, shareCount, perShareAcquisitionPrice, perShareTransferPrice 등) ...

  // ── split 모드 (선택) ──
  acquisitionLots?: AcquisitionLot[];
  transferLots?: TransferLot[];
  costAllocationMethod?: "specific" | "fifo" | "moving_avg";
  specificMatchings?: SpecificMatching[];
};
```

## 엔진 result 타입

```ts
// types/stock-transfer.types.ts — StockTransferResult 확장

export interface MatchedSubLot {
  saleDate: Date;
  saleShares: number;
  perShareSalePrice: number;
  /** §104② lot별 기산점 적용된 일자 */
  acquisitionDate: Date;
  buyShares: number;
  perShareBuyPrice: number;
  holdingDays: number;
  isShortTerm: boolean;                                     // < 365일
  perLotGain: number;
  /** sub-lot별 세율 (단기 0.30 또는 누진 rate) */
  appliedRate: number;
  /** 산출세액 sub-lot 단위 (절사 전) */
  subLotTax: number;
}

export interface LotMatchingDetail {
  method: "specific" | "fifo" | "moving_avg";
  matched: MatchedSubLot[];
  totalTransferPrice: number;
  totalAcquisitionPrice: number;
  totalGain: number;
  shortTermGain: number;                                    // 단기 sub-lot 차익 합
  longTermGain: number;                                     // 장기 sub-lot 차익 합
  /** moving_avg 단가 (해당 모드만) */
  weightedAvgPerShare?: number;
  warnings: string[];
}

// StockTransferResult 확장
export type StockTransferResult = {
  // ... 기존 필드 ...
  /** split 모드 활성 시 echo. single 모드는 undefined */
  lotMatchingDetail?: LotMatchingDetail;

  // appliedRules enum 3 추가 (closed union 확장)
  appliedRules: Array<
    | (기존 12종)
    | "로트개별법"
    | "로트선입선출"
    | "로트이동평균"
  >;
};
```

**Date 변환**: `lib/api/date-coerce.ts` 의 `coerceDates` + dot-notation 배열 표기 사용:
```
"acquisitionLots[].acquisitionDate"
"acquisitionLots[].decedentAcquisitionDate"
"acquisitionLots[].preMergerAcquisitionDate"
"transferLots[].transferDate"
```

---

## 계산 알고리즘 (단계별)

### 신규 모듈 `lot-allocation.ts` (~320줄, 800줄 정책)

```ts
export function allocateLots(
  acquisitionLots: AcquisitionLot[],
  transferLots: TransferLot[],
  method: "specific" | "fifo" | "moving_avg",
  isMajorAndNonSME: boolean,                                // 단기 30% 게이트 적용 여부
  specificMatchings?: SpecificMatching[],
): LotMatchingDetail
```

**핵심 알고리즘**:

1. **lot별 §104② 기산일 결정** (helpers.ts:40-77 재구현):
   - `cause === "purchase"` → `lot.acquisitionDate`
   - `cause === "inheritance"` → `lot.decedentAcquisitionDate ?? lot.acquisitionDate`
   - `cause === "gift"` → `lot.acquisitionDate` (수증일)
   - `cause === "merger_split"` → `lot.preMergerAcquisitionDate ?? lot.acquisitionDate`

2. **모드별 매칭**:
   - **specific**: `specificMatchings`를 그대로 sub-lot으로 변환
   - **fifo**: 매수 lot을 `lot.acquisitionDate` ASC로 정렬 → 매도 lot을 `lot.transferDate` ASC로 정렬 → 순차 차감
   - **moving_avg**: 가중평균 단가 = `Σ(buyShares × perSharePrice) / Σ(buyShares)`. sub-lot은 FIFO 기준 매칭 + 단가만 평균값

3. **sub-lot별 보유일수·단기/장기 산정**:
   - `holdingDays = differenceInDays(saleDate, §104②기산일)`
   - `isShortTerm = holdingDays < 365`

4. **sub-lot별 세율 적용** (메인 엔진 STEP 8 분기) — **taxCategory별 3분기**:
   ```
   subLotTaxBase = floor(taxBase × subLot.perLotGain / lotMatchingDetail.totalGain)

   // 분기 1: 비과세 (K-OTC 비대주주·중소·벤처) — STEP 1 조기 반환 + lotMatchingDetail echo
   //   buildExemptResult() 패스에서도 input.acquisitionLots 존재 시 allocateLots() 사전 호출하여
   //   lotMatchingDetail을 결과 객체에 포함 (검산용). 산출세액·세율은 0 / 비과세.
   //   stock-transfer-tax.ts:46-59 비과세 분기 진입 직전에 lotMatchingDetail 계산 호출 추가.

   // 분기 2: 대주주 (listed_major / unlisted_major) — sub-lot별 단기/장기 분리
   if (isMajorAndNonSME):
     if (subLot.isShortTerm):
       subLotTax = applyRate(subLotTaxBase, STOCK_SHORT_TERM_RATE = 0.30)        // §104①11호 가목 1)
     else:
       subLotTax = calcProgressiveTaxFromBrackets(subLotTaxBase, STOCK_MAJOR_PROGRESSIVE_BRACKETS)
                                                                                  // §104①11호 가목 2) — 3억 이하 20%/초과 25%

   // 분기 3: 비대주주 (listed_non_major_in_market / unlisted_non_major / listed_otc_non_major) — 단일 세율
   //   §104①11호 나목: 중소기업 10% / 그 외 20%
   //   sub-lot 단기/장기 무관 동일 세율 — 안분 불필요
   //   nonMajorRate 결정:
   //     - taxCategory === "listed_otc_non_major" && isSmallMediumEnterprise → 0.10 (STOCK_NON_MAJOR_SME_RATE)
   //     - 그 외 비대주주 → 0.20 (STOCK_NON_MAJOR_GENERAL_RATE)
   else:
     const nonMajorRate = (isSmallMediumEnterprise && taxCategory === "listed_otc_non_major")
       ? STOCK_NON_MAJOR_SME_RATE       // 0.10
       : STOCK_NON_MAJOR_GENERAL_RATE;  // 0.20
     calculatedTax = applyRate(taxBase, nonMajorRate)                              // 합산 단일 세율 적용

   // 분기 4: 양도손실 (totalGain < 0) — 과세표준 0
   //   transferIncome < 0 → basicDeduction 0 → taxBase 0 → calculatedTax 0
   //   lotMatchingDetail.matched에 음수 perLotGain 그대로 echo (검산용)
   ```

5. **합산 후 §47① 적용**: `calculatedTax = floorTen(Σ subLotTax)` (1회 적용)

### moving_avg 분기 0으로 나누기 가드

```typescript
const totalBuyShares = acquisitionLots.reduce((s, l) => s + l.shareCount, 0);
if (totalBuyShares === 0) {
  // validate에서 차단되어야 하지만 방어 코드
  return { method, matched: [], ..., warnings: ["매수 lot 수량 합이 0입니다"] };
}
const weightedAvgPerShare = Math.floor(
  acquisitionLots.reduce((s, l) => s + l.shareCount * l.perShareAcquisitionPrice, 0) / totalBuyShares
);
```

### 메인 엔진 `stock-transfer-tax.ts` 분기 (split vs single)

| STEP | single 모드 | split 모드 |
|---|---|---|
| 2 transferPrice | `(perShareTransferPrice ?? 0) × shareCount` | `lotMatchingDetail.totalTransferPrice` |
| 3 acquisitionPrice | 기존 분기 (actual/estimated/...) | `lotMatchingDetail.totalAcquisitionPrice` (actual만 허용) |
| 5 transferIncome | `transferPrice - acquisitionPrice - expenses` | `lotMatchingDetail.totalGain - expenses` (음수 가능 — C-25) |
| 6 basicDeduction | `calcBasicDeduction(...)` (현행) | 동일 (transferIncome 합산값 기반. 음수 시 0) |
| 7 taxBase | `floorTaxBase(transferIncome - basicDeduction)` | 동상 (합산 단일 taxBase. 음수 시 0) |
| 8 calculatedTax | `calcStockRate(input, classification, taxBase, isShortTerm)` (현행 시그니처) | **분기**: 대주주+비SME → sub-lot별 안분·세율·sum·floorTen / 비대주주 → 합산 단일 세율 (calcStockRate 우회 또는 직접 호출) |
| 9 finalize | 동상 | 동상 |

**holding period 결과 필드** (split 모드):
- `isShortTermHolding` / `holdingPeriodDays` / `holdingPeriodMonths` = **가장 오래된 매칭 sub-lot 기준** (FIFO 첫 매칭). footnote "최장 보유 lot 기준"
- `appliedRate` / `progressiveDeduction` = **혼합값 또는 가중평균**. LotMatchingDetailCard에 위임
- `valuationDetail.method` = `"actual_acquisition"` 통일. 산정방법은 `lotMatchingDetail.method`에 노출

**appliedRules push**:
- `method === "specific"` → `"로트개별법"`
- `method === "fifo"` → `"로트선입선출"`
- `method === "moving_avg"` → `"로트이동평균"`
- **단기 30% 추가 조건**: `isMajorAndNonSME === true` AND sub-lot 중 `isShortTerm === true`가 1건 이상이면 `"단기30%"` push. 비대주주(C-26) 분기에서는 push **안 함** (단일 세율 적용)
- **비과세 분기**: 비과세 케이스는 STEP 1 조기 반환 — appliedRules에 비과세 enum(`"KOTC중소중견비과세"`/`"KOTC벤처비과세"`)만 push. 로트 enum은 추가하되 산출세액 0

---

## Silent fallback / 자동 안분 후보 식별

- **매수/매도 lot 빈 행** 자동 채움 금지. validate에서 차단 (C-10)
- **specific 모드 매칭 누락** 자동 FIFO 보충 금지. validate에서 차단 (C-20)
- **lot.perShareAcquisitionPrice·perShareTransferPrice = 0** 자동 채움 금지 (C-22·C-23)
- **lot.decedentAcquisitionDate·preMergerAcquisitionDate 누락** 시 `lot.acquisitionDate` fallback 금지 (validate 오류 — C-19·C-19b)
- **lotsMode 토글 시 폼 마이그레이션**은 데이터 보존 목적 (자동 채움 아님) — single→split 전환 시 폼-전역 값을 첫 lot으로 명시 이전

---

## 테스트 약속

### Pre-Do anchor 4건 (Do 진입 전 우선 실행)

**파일**: `__tests__/tax-engine/stock-transfer/lot-allocation.anchor.test.ts`

| anchor | 케이스 | 핵심 검증 |
|---|---|---|
| AT-LOT-1 | C-14 specific N:M | 사용자 명시 매칭 적용 + sub-lot 차익 합 |
| AT-LOT-2 | C-7 fifo + 단기 30% | 단기 sub-lot 135,000 + 장기 sub-lot 100,000 = **235,000** (§104①11호 가목 2) 누진 3억 이하 20%) |
| AT-LOT-3 | C-15 moving_avg + FIFO 보유기간 | 가중평균 12,000 + sub-lot 단가 평균값·보유기간 FIFO + 산출세액 **195,000** |
| AT-LOT-4 | C-11 cause 혼재 | lot별 §104② 기산점 분기 (lot1=매매 acquisitionDate, lot2=상속 decedentDate) |

### 본 Do 단계 anchor 21건+ (LOT-3~LOT-23)

케이스 인벤토리 표의 모든 행에 anchor 1건+ 대응. 회귀: AT-1~AT-11 default `lotsMode="single"` 통과.

### 법령 정합 cross-cutting

- 장기 sub-lot 세율 = **§104①11호 가목 2) 누진** (`STOCK_MAJOR_PROGRESSIVE_BRACKETS`). §55 종합소득 아님
- basicDeduction 안분 산식: `subLotTaxBase = taxBase × (subLot.perLotGain / lotMatchingDetail.totalGain)`. 합계 = taxBase 보장
- `appliedRules` 신규 3 enum이 결과에 정확히 echo

---

## UI 통합 위임

UI 측 명세는 `stock-split-lots.ui.design.md` 참조.

14개 동기화 지점 (Plan §5):
| # | 위치 | 핵심 |
|---|---|---|
| ① | `calc-wizard-stock-store.ts` | + 5 신규 필드 |
| ② | `createInitialStockFormData` | default 5종 |
| ③ | `normalizeStockFormData` | enum + 배열 sanitizer |
| ④ | `buildStockTransferApiBody` | lot 배열 spread + FIFO fallback |
| ⑤ | `Step1.tsx` + `SplitLotsBlock.tsx` + `Step2.tsx` 분기 | 동적 번호 + RadioCard 3 + perShare disable |
| ⑥ | `StockSidebar.tsx` | split 합계 분기 |
| ⑦ | `StockTransferTaxResultView.tsx` + 신규 `LotMatchingDetailCard` | 산정방법 배지 + 라벨 매퍼 3 enum |
| ⑧ | `stock-transfer-tax-validate.ts` | split 분기 + lot 단위 검증 |
| ⑨ | `stock-transfer-tax-schema.ts` enum 메인 | lotsModeSchema·costAllocationMethodSchema |
| ⑩ | `addStockRefines` superRefine | 호환성 게이트 + cause별 보조 일자 |
| ⑪ | `buildStockTransferApiBody` | acquisitionDate FIFO fallback |
| ⑫ | `stock-transfer-tax-schema.ts` z.object | 3종 lot/matching 명시 |
| ⑬ | `buildStockTransferApiBody` body spread | acquisitionLots·transferLots·matchings |
| ⑭ | `route.ts` STOCK_DATE_FIELDS | dot-notation 4건 |

엔진 시니어는 input/result 타입 정의·핵심 알고리즘 작성. UI 위젯·산식 표시·zustand 통합은 UI 시니어 책임.

---

## 변경 로그

| 일자 | 버전 | 변경 |
|---|---|---|
| 2026-05-18 | v1 | Plan v2.2 기반 엔진 디자인 초안 작성 |
| 2026-05-18 | **v1.1 1차 정정** | UI 디자인 동시 검토 반영. 케이스 매트릭스 C-24/C-25/C-26 추가. STEP 8 분기를 taxCategory별 3분기(대주주/비대주주/양도손실) + 비과세 echo 의사코드 명시. moving_avg 0 가드. STEP 8 시그니처 정정. |
| 2026-05-18 | **v1.2 2차 정정** | `nonMajorRate` 변수 명시(SME 0.10/일반 0.20). `appliedRules.단기30%` 적용 조건 정확화. 비과세 분기에서도 `buildExemptResult` 사전에 `allocateLots()` 호출 명시. |
