# 증여세 재차증여 — 증여자 사망 합산제외 엔진 설계

> 계획서: `gift-prior-deceased-donor-aggregation.plan.md` (rev.2)
> 대상 엔진: `lib/tax-engine/gift-prior-aggregation.ts` · `gift-tax.ts` (STEP 6.5/7/8)
> 근거: 상증법 §47② · §58 / 예규 재산-58(2010.2.1)·재삼46014-1228(1999.6.25)·서일46014-11750(2003.12.3)·재산-1658(2008.7.15)

## 1. 케이스 인벤토리 (anchor 1:1)

| ID | 시나리오 | 입력 핵심 | 기대 출력 | anchor |
|---|---|---|---|---|
| C0 | 무사망·무cutoff | donorDeceasedDate 전무 | 현행 합산 100% 보존 | 기존 회귀 spec |
| C1 | 사례4 — 1차 10년 경과 | 1차 2012부820k·2차 2021모600k·3차 2023모420k | ⑧217M·⑨135,882,352·**⑫92,264,119**(✅실측 GREEN) | `prior-deceased-cutoff` C1 5/5 |
| C2 | 사례3 — 부 사망 안분 | 1차 2018부620k(사망2022)·2차 2020모400k·3차 2023모180k | ③400k·**⑧90,588**·⑨78,620·⑩78,620·⑫34,319 | C2 ✅분모 동결 |
| C3 | 사망+cutoff 동시 | 사망자가 10년도 경과 | 사망 안분 우선, cutoff 중복 무영향 | C3 가드 |
| C4a | 직전회차 본인 사망 | matched[0]이 사망자 | 합산 없음(빈 matched) | C4a 가드 |
| C4b | 사망자 독립회차 | 직전 미합산 사망자 | 단순 제외, marginal 불요 | C4b 가드 |
| C5 | 타그룹 사망자 | 그룹 불일치 + 사망 | 영향 없음(기존 그룹필터) | C5 |

> ✅ C2 ⑧ = 90,588 동결(서일46014-11750: 분모 = 부·모 합산 증여재산가액 gross 1,020,000). PDF 92,400은 교재 분모 오기이나 ⑨ 한도(78,620)에 막혀 ⑩·⑫ 무영향.

## 2. 입력 타입 (PriorGift 확장 — 1필드)

```ts
// lib/tax-engine/types/inheritance-prior-gift.types.ts
donorDeceasedDate?: string; // ISO "YYYY-MM-DD". opt-in. 미설정=현행(C0 무회귀).
```
- 효력: `donorDeceasedDate && isBefore(parseISO(donorDeceasedDate), parseISO(giftDate))`. 사망일 ≥ 증여일=무효(합산 유지).
- `new Date(x)` 직접 호출 금지 → `parseISO`(date-fns) 사용.

## 3. 결과 타입 확장

### 3-1. `PriorAggregationResult` (gift-prior-aggregation.ts)
```ts
priorRoundHadDeceasedExclusion: boolean; // C2: 직전회차에 합산됐던 사망자분 존재
deceasedMarginalComputedTax: number;     // 곱셈 안분 ⑧
deceasedSurvivingPriorAmount: number;    // 분자(생존 증여자 가액)
deceasedAggregationDenominator: number;  // 분모(§1-1 동결값)
```

### 3-2. `PriorGiftCreditDetail` (inheritance-gift-form-detail.types.ts:63 — interface, JSON 소실 무관)
```ts
deceasedExclusion?: boolean;          // 사례4 뺄셈과 구분 플래그(결과카드 분기)
deceasedMarginalNumerator?: number;
deceasedMarginalDenominator?: number;
```

## 4. 알고리즘

### 4-1. `aggregatePriorGiftsForGift` — 사망 제외 + C4a 가드
```
1. 기존 matched 필터에 사망 제외 추가:
   for gift in priorGifts:
     if gift.donorDeceasedDate && isBefore(parseISO(gift.donorDeceasedDate), parseISO(giftDate)):
        warnings.push(재산-58 사망 제외); continue   // §47② 합산 제외
     ... (기존 specialTreatment·cutoff·donor·group 필터)
2. matched 정렬·totalAmount 등 기존 산출
3. 사망 안분 보정 (C2):
   deceasedDropped = priorGifts.filter(사망제외 && 동일그룹 && matched[0] 합산창 내 && < matched[0].giftDate)
   if matched[0] 존재 && deceasedDropped 존재:    // C4a면 matched[0] 없음 → skip
     priorRoundHadDeceasedExclusion = true
     deceasedSurvivingPriorAmount   = priorAggregatedValue(matched[0])              // 생존분(모친 2차) = 분자
     deceasedAggregationDenominator = deceasedSurvivingPriorAmount                  // 분모 = 부+모 gross 합계
                                      + Σ(사망제외 prior giftAmount)                //   (서일46014-11750 동결)
     deceasedMarginalComputedTax    = safeMultiplyThenDivide(
                                        matched[0].computedTax,           // 직전회차 ⑦(부·모 합산 산출세액)
                                        deceasedSurvivingPriorAmount,     // 분자 = 모 가액
                                        deceasedAggregationDenominator)   // 분모 = 부+모 gross 가액 합계
```
> ⚠️ `matched[0].computedTax`는 사망 제외 **전** 직전회차 신고의 산출세액(부·모 합산 231,000). 사망 prior는 금번 matched에서만 빠지고, 직전회차 신고값 자체는 불변 → 그 안에서 생존분만 안분 추출.

### 4-2. `gift-tax.ts` STEP 6.5 — 배타 분기 (사례4 무회귀 핵심)
```ts
const effectivePriorAggregation =
  priorAggregation.priorRoundHadDeceasedExclusion
    ? { ...priorAggregation,
        totalComputedTax: priorAggregation.deceasedMarginalComputedTax,
        priorAddedTaxBase: safeMultiplyThenDivide(
          taxBase, priorAggregation.totalAmount,
          priorAggregation.totalAmount + netCurrentGiftValue) }  // ⑨ 한도 분자(과표 기반)
    : priorAggregation.priorRoundHadDropout
    ? { /* 기존 R-6 뺄셈 — 변경 금지 */ }
    : priorAggregation;
```
- **사례4 무회귀**: deceasedExclusion=false → `else if dropout` 기존 경로 그대로. anchor C1 재실행으로 검증.

### 4-3. STEP 8 §58 한도 — echo 주입
`priorGiftCreditDetail`에 `deceasedExclusion`·`deceasedMarginalNumerator`·`deceasedMarginalDenominator` 채움.

## 5. 동기화 지점 (엔진측 ⑨⑩⑫⑬⑭)

| 지점 | 파일 | 변경 |
|---|---|---|
| ⑫ | `lib/validators/prior-gift-schema.ts` | `donorDeceasedDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()` (strip 방지) |
| ⑨ | `giftTaxInputSchema.priorGiftsWithin10Years` | priorGiftSchema 배열 — ⑫ 자동연동 |
| ⑩ | 상속세 `preGiftsWithin10Years` (property-valuation-input.ts:478) | **동일 priorGiftSchema** — 필드 노출되나 **상속세 엔진 미사용**(무해). strip만 방지 |
| ⑬ | `lib/calc/gift-api.ts:95` | 명시 키 `donorDeceasedDate`(...rest 의존 지양) |
| ⑭ | `app/api/calc/gift/route.ts:79` | string pass-through. 엔진서 parseISO |

## 6. 정밀도·정책

- `safeMultiplyThenDivide` 입력 전부 정수(원) → BigInt 소수부 버림 무해(`feedback_safemul`).
- PDF 천원 단위 ↔ 엔진 원 단위: anchor `×1,000` 환산, **1천원 tolerance**.
- §58 한도는 **과세표준 기반**(가액 아님). 사례3 우연일치 주의.
- 800줄 정책: gift-prior-aggregation.ts 현재 줄수 확인 후 초과 시 사망 로직 sibling 분리.

## 7. 동결 완료 / 잔여
- ✅ 분모 = 부·모 합산 증여재산가액(gross). 서일46014-11750 원문(ulex/casenote WebFetch) 확보. C2 anchor ⑧=90,588.
- ✅ PDF 92,400 교재 오기 — `feedback_anchor_correction_legal_priority` 적용, 법령정합 90,588 동결. ⑩·⑫ 한도 무영향.
- 🔲 C3 우선순위는 논리 도출(예규 명문 부재) — 코드 주석 "도출" 명시.
