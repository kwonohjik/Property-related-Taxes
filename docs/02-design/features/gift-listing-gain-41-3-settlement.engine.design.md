# §41의3 상장이익 증여 정산 — 엔진/데이터 설계

> 계획서: `gift-listing-gain-41-3-settlement.plan.md` · 작성 2026-06-25 · self-review STEP 5 산출물
> 현행 엔진 `lib/tax-engine/gift-deemed/listing-gain.ts` + 본세 `gift-tax.ts` 확장. 법령 인용은 교재 기준(Do 전 KoreanLaw 검증 — 계획서 §6).

## 1. 케이스 인벤토리

| ID | 분기 | 입력 조건 | 기대 결과 | Phase | anchor |
|---|---|---|---|---|---|
| **LG-T1** | 과세 | gain ≥ threshold, gain>0 | direction=taxation, deemedGiftValue=gain | 현행✅ | 사례2 650M |
| **LG-T2** | 미적용 | 0 < gain < threshold | direction=none, value=0 | 현행✅ | LG-FAIL |
| **LG-R1** | 환급 | loss(=-gain) ≥ threshold, gain<0 | direction=refund, value=0, refundBase=loss | **A0 신규** | LG-R1(신규) |
| **LG-R2** | 환급 미달 | 0 < loss < threshold | direction=none, value=0, refundBase=0 | **A0 신규** | LG-R2(신규) |
| **LG-M** | 합병상장 | eventType=merger, 각 분기 | legalBasis §41의5, 동일 산식 | 현행✅+A0 | LG-MERGER |
| **LG-OLD** | 구법 | applyOldLaw=true(2016.2.4 이전) | 과세요건 = 비율 `(A−(B+C))≥B×30%` **OR** 금액 `(A−(B+C))×주식수≥3억`(둘 중 하나) | **B 신규** | LG-OLD |
| **CG-1** | 기업가치 월수산식 | corpGrowthAuto 입력 | perShareCorpGrowth 자동 = 1개월순손익×월수 | **B 신규** | 사례2 C=27,000 |
| **AE-1** | 합산배제 본세 | isAggregationExcludedGift=true | 과세표준=증여이익−감정평가수수료−3천만, §53배제, §47②격리 | **A1 신규** | 사례2 본세 |
| **AE-OFF** | 플래그 OFF | isAggregationExcludedGift=false/undefined | 현행 100% 동일(회귀 0) | **A1 가드** | 증여세 전체 baseline |

## 2. 타입 설계

### 2-1. `ListingGainInput` (gift-deemed/types.ts:598 확장)
```ts
export interface ListingGainInput {
  eventType?: "listing" | "merger";   // 현행
  settlementPerSharePrice: number;     // A/주식수 — 정산기준일 1주당 평가액(§63)
  perShareAcqValue: number;            // B/주식수 — 증여·취득일 1주당 과세가액
  perShareCorpGrowth: number;          // C/주식수 — 1주당 기업가치 실질증가이익(음수 가능)
  shares: number;
  // ── P1 신규(optional, 미지정 시 현행 동작) ──
  corpGrowthAuto?: {                   // 기업가치 월수산식(령§31의3⑤) — 지정 시 perShareCorpGrowth 무시하고 자동계산
    perShareNetIncomeByYear: number[]; // 사업연도별 1주당 순손익액(칙§10의4②)
    monthsBusinessStartToListingPrevDay: number; // 사업연도개시일~상장전일 월수(분모, 1월미만=1월)
    monthsAcqToSettlement: number;     // 증여·취득일~정산기준일 월수(곱수)
  };
  applyOldLaw?: boolean;               // 2016.2.4 이전 증여 — threshold B×30% + OR 판정
}
```

### 2-2. `DeemedGiftResult` (gift-deemed/types.ts:33 확장)
```ts
export interface DeemedGiftResult {
  type: DeemedGiftType;
  applied: boolean;                    // 과세요건 충족(direction==="taxation")
  deemedGiftValue: number;
  breakdown: CalculationStep[];
  exclusionReason?: string;
  legalBasis: string;
  thresholdEcho?: Record<string, number | boolean>;  // 현행 — gain·threshold
  aggregationExcluded?: boolean;       // 현행 필드 재사용 — §47① 합산배제 표식
  // ── 신규 ──
  direction?: "taxation" | "refund" | "none";  // primitive union → JSON 안전
  refundBase?: number;                 // 평가손실 환급 대상액(=loss). direction==="refund"만 >0
}
```
> `direction`·`refundBase`는 primitive — `feedback_engine_result_map_json_loss`(Map 금지) 무관.

### 2-3. `EstateItem`/본세 (A1)
```ts
// 타입: lib/tax-engine/types/inheritance-gift-estate.types.ts (EstateItem)
isAggregationExcludedGift?: boolean;   // §41의3·§41의5 등 합산배제증여재산
```
- ⑫ **Zod 동기화 필수**: `lib/validators/estate-item-schema.ts`에 `.optional()` 추가 — 누락 시 본세 API에서 침묵 strip(TS 미감지).
- ④ prefill: `lib/calc/gift-deemed-api.ts`가 과세 케이스 giftItems[*]에 `isAggregationExcludedGift:true` 세팅.

## 3. 알고리즘

### 3-1. A0 — 환급 방향 (`calcListingGainGift` 확장)
```
perShareGain = settlementPerSharePrice - perShareAcqValue - perShareCorpGrowth
totalGain    = safeMultiply(perShareGain, shares)   // 부호 유지(음수 허용)
deductBase   = max((perShareAcqValue + perShareCorpGrowth) * shares, 0)
// ── 현행(2016.2.5 이후): 단일 threshold = Min((B+C)×30%, 3억) ──
threshold    = min(safeMultiplyThenDivide(deductBase, 30, 100), 3억)

if totalGain > 0 && totalGain >= threshold:
    direction = "taxation"; value = totalGain; refundBase = 0
elif totalGain < 0 && (-totalGain) >= threshold:
    direction = "refund";   value = 0;         refundBase = -totalGain
else:
    direction = "none";     value = 0;         refundBase = 0

applied = direction === "taxation"
```
> ⚠️ **구법(applyOldLaw, 2016.2.4 이전)은 단일 Min threshold 아님**(검토 #13 정정). 교재 이미지3 ②: 과세요건 = ㉮비율기준 `(A−(B+C)) ≥ B×30%` **OR** ㉯금액기준 `(A−(B+C))×주식수 ≥ 3억` — **둘 중 하나** 충족(분모 B, (B+C) 아님). 환급은 `(B−A)` 기준 대칭. → Phase B에서 `passOldLaw = ratioTest || amountTest` 별도 판정 함수로 구현(단일 threshold 변수로 표현 불가).

### 3-2. B/E — 기업가치 월수산식 (신규 헬퍼 `calcPerShareCorpGrowth`)
```
sumNetIncome    = sum(perShareNetIncomeByYear)
perMonthIncome  = floor(sumNetIncome / monthsBusinessStartToListingPrevDay)  // 1개월당(령§31의3⑤1)
perShareCorpGrowth = perMonthIncome * monthsAcqToSettlement                  // (령§31의3⑤2)
```
검증(사례2): `(10,000+15,000+5,000)=30,000 / 30 = 1,000 × 27 = 27,000` ✅

### 3-3. A1 — 합산배제증여재산 본세 (`gift-tax.ts` 신규 분기)
```
aggExclItems = giftItems.filter(i => i.isAggregationExcludedGift)
if aggExclItems.length === 0:  return 현행 경로(회귀 0)   ← AE-OFF 가드

// 상장이익은 calcListingGainGift가 산정한 deemedGiftValue가 prefill 시 marketValue로 이관됨(gift-deemed-api.ts).
// 재평가 아님 — 평가액 = item.marketValue 그대로 합산.
aggExclValue   = sum(aggExclItems.map(i => i.marketValue))
aggExclFee     = 감정평가수수료(해당분)
aggExclTaxBase = max(0, aggExclValue - aggExclFee - 30_000_000)   // §55①3호 — §53·§53의2·§54 미적용(4호 전용)
aggExclTax     = calcInheritanceGiftTax(aggExclTaxBase, brackets) // §56 일반세율
// §57 세대생략 할증: 합산배제재산도 대상 — 적용(KoreanLaw 확인 TODO)
// §69 신고세액공제: 적용(율은 당초 증여시 기준 — 법령해석재산-0311)
finalTax = ordinaryFinalTax + specialStreamFinalTax + aggExclFinalTax
```
> 권장: `calcAggregationExcludedStream()` 별도 헬퍼로 분리(800줄 정책·테스트 격리). 일반/조특법 스트림과 **제3 스트림** 공존.

## 4. anchor (원단위 toBe)

```ts
// 사례2 (상증기준 41의3-31의3-6) — A0/B/A1 통합 anchor
const I = { settlementPerSharePrice: 50_000, perShareAcqValue: 10_000, perShareCorpGrowth: 27_000, shares: 50_000 };
calcListingGainGift(I).deemedGiftValue        === 650_000_000   // LG-T1 ✅현행통과
calcListingGainGift(I).thresholdEcho.threshold === 300_000_000
calcListingGainGift(I).direction              === "taxation"    // A0

// CG-1 — 기업가치 월수산식
calcPerShareCorpGrowth({ perShareNetIncomeByYear:[10_000,15_000,5_000], monthsBusinessStartToListingPrevDay:30, monthsAcqToSettlement:27 }) === 27_000

// LG-R1 — 환급(평가손실): A 하락 케이스
calcListingGainGift({ settlementPerSharePrice: 5_000, perShareAcqValue: 10_000, perShareCorpGrowth: 0, shares: 100_000 })
//  perShareGain=-5,000, totalGain=-500,000,000, threshold=Min(10,000*100,000*0.3, 3억)=Min(3억,3억)=3억
//  loss=500,000,000 ≥ 3억 → direction="refund", refundBase=500,000,000, value=0

// AE-1 — 합산배제 본세(사례2 증여이익 650M, 감정평가수수료 0, 직계존비속 가정)  ※실측 검산 2026-06-25
//  합산배제 경로 과세표준 = 650,000,000 - 0(수수료) - 30,000,000(§55① 3천만) = 620,000,000  [§53 미적용]
//  일반 경로(버그 시) 과세표준 = 650,000,000 - 50,000,000(§53 직계) - 0 = 600,000,000  [3천만 없음]
//  → 두 경로 과세표준 차이 20,000,000. anchor는 620,000,000(합산배제) 고정 + 일반경로 600,000,000 대조로 분기 검증
```

## 5. 동기화 지점 → 계획서 §3 표 참조(A0/A1 분리)

## 6. 미해결(Design→Do 확정)
- §57 세대생략 할증이 합산배제증여재산에 적용되는지 (KoreanLaw)
- 구법 OR 판정의 정확한 비율·금액 기준(상증기준 41의3-31의6-5 원문)
- `calcAggregationExcludedStream` 인라인 vs 분리(800줄)
