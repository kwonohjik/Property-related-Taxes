# 분할 매수 + 자본조정(무상증자·형식감자) — 엔진 설계 (A-2)

> 계획: `docs/00-pm/stock-transfer-split-capital-adjustments-a2.plan.md` · 작성 2026-06-12
> 법령: 소득세법 §17②(의제배당 범위, MST 285523 실측) · §162(취득시기) · 집행기준 97-163-12(무상주, 법령 아님)

## 1. 케이스 인벤토리

| # | 케이스 | 엔진 경로 | 변경 | anchor |
|---|---|---|---|---|
| CA-1 | lot 1건 + 무상증자 100%(발생일>취득일) | `applyCapitalAdjustmentsToLots` → `allocateLots` | 신규 함수 | CA-ENGINE-1 |
| CA-2 | lot 2건(취득일 상이) + 무상증자 1건(중간일) | 발생일 이전 lot만 희석 | 신규 | CA-ENGINE-2 |
| CA-3 | 형식감자(reduction_proportional) | shares×(1−ratio) | 신규 | CA-ENGINE-3 |
| CA-4 | 의제배당 2종 | skip + warning | 신규 | CA-ENGINE-4 |
| CA-5 | 무상증자 + specific(A-1) | 희석 후 매칭. 배정 합 검증은 희석 전 | 신규 | CA-ENGINE-5 |
| CA-6 | 무상증자 + fifo | 희석 lot FIFO 차감 | 신규 | CA-ENGINE-6 |
| CA-7 | 무상증자 + moving_avg | weightedAvg가 희석 반영 | 신규 | CA-ENGINE-7 |
| CA-8 | 무상증자 후 형식감자(다건) | 시계열 순차 | 신규 | CA-ENGINE-8 |
| CA-9 | 발생일 ≤ 취득일 | 미적용 + warning | 신규 | CA-ENGINE-9 |
| CA-P | floor 잔차 | lot 300@10k·증자50%→450·잔차 300원 | 신규 | CA-PRECISION-1 |

## 2. 신규 순수 함수 — `lib/tax-engine/stock-transfer/lot-capital-adjustments.ts`

```ts
type CapitalAdjustment = NonNullable<StockTransferInput["capitalAdjustments"]>[number];

export interface LotCapitalAdjustmentDetail {
  lotId?: string;
  beforeShares: number;
  afterShares: number;
  baseTotalCost: number;          // 불변
  adjustedPerShareCost: number;   // floor(baseTotalCost / afterShares)
  appliedTypes: CapitalAdjustment["type"][];  // 적용된(skip 아닌) 조정 유형
  skippedReasons: string[];       // 의제배당·발생일≤취득일
}

export interface LotCapitalAdjustmentsResult {
  adjustedLots: AcquisitionLot[];
  perLotApplied: LotCapitalAdjustmentDetail[];  // [STEP8-15] 전 lot 포함(무영향 lot은 before==after) — UI에서 변동 lot만 표시
  warnings: string[];
  appliedRules: string[];   // [STEP6-12] 호출부에서 warnings로 병합(appliedRules union 미변경)
}

export function applyCapitalAdjustmentsToLots(
  lots: AcquisitionLot[],
  adjustments: CapitalAdjustment[],
): LotCapitalAdjustmentsResult
```

### 2.1 알고리즘 (lot 독립)
```
sorted = adjustments 시계열 ASC
각 lot:
  baseTotalCost = lot.shareCount × lot.perShareAcquisitionPrice    // 불변
  shares = lot.shareCount
  for adj of sorted:
    if adj.eventDate <= lot.acquisitionDate: skip(warning "발생일≤취득일") ; continue   // ★ `>`
    switch adj.type:
      bonus_capital_reserve  : shares = floor(shares × (1 + adj.ratio)) ; appliedTypes++
      reduction_proportional : shares = floor(shares × (1 − adj.ratio)) ; appliedTypes++
      bonus_retained_earnings: skip(의제배당 §17②2호 본문)
      reduction_capital_return: skip(의제배당 §17②1호)
  adjustedPerShareCost = shares>0 ? floor(baseTotalCost / shares) : 0
  adjustedLot = { ...lot, shareCount: shares, perShareAcquisitionPrice: adjustedPerShareCost }
        // lot.acquisitionDate·cause·decedent/preMerger 보존 → §104² 무상주=원주
```

### 2.2 가드
- 형식감자 100% 등 afterShares ≤ 0: adjustedPerShareCost = 0 · warning("자본조정 후 주식수 0 — 비율 확인") · adjustedLot은 shareCount 0으로 전달 → `allocateLots:147` totalBuyShares 분모 가드가 처리.
- adjustments empty: no-op (호출부에서 분기 — 함수 미호출).

## 3. 통합 — `stock-transfer-tax.ts`

### 3.1 split 분기 (:129)
```ts
let lotCapitalAdjustmentsDetail: LotCapitalAdjustmentDetail[] | undefined;
if (isSplitMode(input)) {
  let lots = input.acquisitionLots!;
  if (input.capitalAdjustments?.length) {
    const adj = applyCapitalAdjustmentsToLots(lots, input.capitalAdjustments);
    lots = adj.adjustedLots;
    lotCapitalAdjustmentsDetail = adj.perLotApplied;
    warnings.push(...adj.warnings);
    // [STEP6-12] 자본조정 규칙은 warnings로 전달 — 단일모드(pr2-detail.ts:84-87) 패턴 일치.
    //   appliedRules union 타입 미변경(타입 안전). adj.appliedRules도 warnings로.
    for (const r of adj.appliedRules) if (!warnings.includes(r)) warnings.push(r);
  }
  lotMatchingDetail = allocateLots(lots, input.transferLots!, method, isMajorAndNonSME, isSME, input.specificMatchings);
}
```

### 3.2 ★ 이중적용 차단 (:383 — STEP1-1 Critical)
```ts
// split 모드: 자본조정은 lot 전처리에서 이미 반영 → buildPr2Detail 글로벌 display 제외
const pr2Input = isSplitMode(input)
  ? { ...input, capitalAdjustments: undefined }
  : input;
const pr2 = buildPr2Detail(pr2Input, shareCount, acquisitionPrice, acquisitionMode);
```

### 3.3 result 조립 (:559 부근)
```ts
lotCapitalAdjustmentsDetail,   // 신규 echo
```

## 4. result 타입 — `types/stock-transfer.types.ts`
```ts
lotCapitalAdjustmentsDetail?: {
  lotId?: string;
  beforeShares: number;
  afterShares: number;
  baseTotalCost: number;
  adjustedPerShareCost: number;
  appliedTypes: ("bonus_capital_reserve" | "reduction_proportional" | "bonus_retained_earnings" | "reduction_capital_return")[];
  skippedReasons: string[];
}[];
```

## 5. anchor 사전 계산 (원단위 toBe — 비상장 대주주·SME·과세 경로 base)

| # | 입력 | 기대 |
|---|---|---|
| CA-ENGINE-1 | lot a(2020-01-01, 100@10,000)·무상증자 100%(2022, ratio 1.0)·양도 200@8,000 specific(a 200) | a 희석 200주@5,000·취득가 1,000,000·양도가 1,600,000·차익 600,000 |
| CA-ENGINE-2 | a(2020, 100@10,000)·b(2023, 100@20,000)·무상증자 100%(2022)·양도 200@8,000 specific(a:200) | **a만** 200@5,000(b 100@20,000 불변·미매칭)·취득가 1,000,000·차익 600,000 |
| CA-ENGINE-3 | a(2020, 200@5,000)·형식감자 50%(2022)·양도 specific(a 100) | a 100@10,000(총원가 1,000,000 불변) |
| CA-ENGINE-4 | a + bonus_retained_earnings | skip·주식수 불변·warning |
| CA-ENGINE-9 | a(2022-06-01)·무상증자(2022-01-01, 발생일<취득일) | 미적용·warning |
| CA-PRECISION-1 | a(300@10,000)·무상증자 50%→450·full 매도 | adjustedPerShareCost 6,666·재구성 2,999,700·**잔차 300** |

## 5.5 차단 해제 5곳 (실측 — STEP13)
| # | 파일·라인 | 현행 | 변경 |
|---|---|---|---|
| ⑫ Zod | `schema.ts:335-344` | split+capital 차단 | 제거 |
| ⑧ validate A | `validate:68` (split 블록) | split+capital 차단 | 제거 |
| ⑧ validate B | `validate:380-386` (R-2 블록) | split+capital 차단 중복 | 제거 |
| ⑧ validate C | `validate:403-407` | eventDate vs 폼-전역 날짜 | split 시 gate(단일 전용) |
| **④⑬ API** | `api.ts:481` | `&& lotsMode !== "split"` strip | **조건 제거(split 전송)** ★ |
| ⑤ UI | `CapitalAdjustmentsBlock.tsx:61·87·93·97` | `!isSplit` 게이트 입력 숨김 | flip(split 입력 허용) |

## 5.6 Do deviation — 수량 정합 검증 gate (환류)

**발견**: 무상증자로 매도(희석 후) > 원 매수(raw)가 정당하나, Zod/validate의 raw 수량 정합 검증이 차단(CA-ZOD-1 실패).
- 희석은 엔진 전처리(allocateLots 직전)에서 발생 → lot 입력(raw)과 매도/매칭(희석 후) 단위 불일치.
- **결정**: capitalAdjustments 존재 시 raw 수량 정합 검증을 **엔진 가드에 위임**(dual-truth 회피 — 희석 재계산 미수행).
  - Zod: `매수 lot별 매칭 ≤ lot 수량`(:470)·`총 매도 ≤ 총 매수`(:487) → `!hasCapitalAdjustments` gate.
  - validate: lots-only `transferShareCount > totalAcqLots`(:141)·specific `배정합=양도`·`배정 ≤ lot 보유`(:150~) → `!hasCapitalAdj` gate.
  - 엔진 가드: matchSpecific 잔여 초과 warning·skip(`lot-allocation.ts:243`)·matchFifo 소진 정지·allocateLots 분모 가드(`:147`).
- specific 매도별 합 = 매도 수량(Zod :455) 검증은 **유지**(양쪽 희석 후 단위 일치).

## 6. 회귀 (0 허용)
- 단일 모드 자본조정 기존 테스트 **불변**(split 분기만 추가).
- split LO-*·A-1 — capitalAdjustments 미입력 시 전처리 no-op → 불변.
- lot-allocation anchor 전수.
- buildPr2Detail 단일모드 capitalAdjustmentsDetail echo 불변(gate는 split만).
