# 비상장주식 자기주식 보유 평가 — 엔진 설계 (Engine Design)

> Feature: `inheritance-unlisted-stock-treasury-stock`
> Plan: [`inheritance-unlisted-stock-treasury-stock.plan.md`](./inheritance-unlisted-stock-treasury-stock.plan.md)
> Layer 2 Pure Engine. 신규 순수 함수 `solveSelfReferentialValuation` + 오케스트레이터 분모 주입.
> 근거: 상증령 §54·§55①·§56③ / 상증규 §17의3⑤ / 해석례 재재산-1494·자본거래-2616·재재산-616·재산-240 (교재 이미지 4~8)

---

## 1. 케이스 인벤토리 (전 분기 enumerate — 단순 → 복합)

| ID | treasuryStock | purpose | 법인유형 | netAssetOnlyReason | 경로 | 기대 1주당 평가액(⑥) | 근거 |
|---|---|---|---|---|---|---|---|
| C-01 | undefined | — | 일반 | 없음 | 현행 그대로 | (현행값 불변) | 회귀 |
| C-02 | t=6,000 | temporary_holding | 일반 | 없음 | solver 일반 | **71,739** | 이미지 ① |
| C-03 | t=6,000 | temporary_holding | 일반 | 없음 | solver 검증식 round-trip | 71,739 | 이미지 ① 검증 |
| C-04 | t=6,000 | cancellation | 일반 | 없음 | denominator N−t + 기존경로 | **72,000** | 이미지 ② |
| C-05 | t=6,000 | temporary_holding | 일반 | 없음 (p=0) | solver 80%재계산 | ㉠26,086·㉡65,217·NA80 71,428·**최종 57,142** | 이미지 ③ |
| C-06 | t=6,000 | temporary_holding | 부동산과다 | 없음 | solver 부동산과다 | **72,727** | 이미지 수식 ㉯ |
| C-07 | t=6,000 | temporary_holding | — | 순자산단독(예: liquidation) | solver 순자산단독 | `A/(N−t)`=**75,000** | 이미지 ㉰ |
| C-08 | t=6,000 | cancellation | — | 순자산단독 | denominator N−t + net-asset-only 분기 | `A/(N−t)`=**75,000** | §54④ + 이미지 ② |
| C-09 | t≥N | (any) | — | — | 검증 차단 (분모≤0) | 검증오류 | 방어 |
| C-10 | t=6,000 | temporary_holding | 일반 | 없음, 최대주주 | solver + §63③ 할증 | 71,739 → ⑧ `floor(71,739×1.2)`=86,086 | §63③ |

> **공통 기준값(이미지 사례)**: A=1,800,000,000(영업권 포함 후=제자산2,000,000,000−제부채200,000,000, 영업권 0),
> N=30,000, t=6,000, 1주당 순손익액=7,000 → p=70,000. (C-05만 p=0)

---

## 2. 입력/결과 타입 (sync ①②③④⑫)

### 2-1. Input — `UnlistedStockValuationInput` (types/unlisted-stock-valuation.types.ts)
```ts
/** 자기주식 보유 여부·목적. undefined = 자기주식 없음(현행 동작 100% 보존). */
treasuryStock?: {
  shares: number;                                    // 자기주식 수 (주). 0 < shares < totalShares
  purpose: "temporary_holding" | "cancellation";     // 일시보유 | 소각·감자
};
```
> 가액 필드 없음 — 자기주식은 contra-equity라 `bsTotalAssets` 미포함, `calcNetAssetTotal` 출력이 곧 A (plan §9-④).

### 2-2. Result — `UnlistedStockValuationResult`
```ts
treasuryStockApplied?: {
  purpose: "temporary_holding" | "cancellation";
  shares: number;
  effectiveTotalShares: number;          // 일시보유=N, 소각·감자=N−t
  selfReferentialValue?: number;         // 일시보유 X(=⑥). 소각은 undefined
  floor80SelfReferentialApplied?: boolean;
  floor80NetAssetValue?: number;         // NA80 = floor(A/(N−0.8t))
};
```
- 목적별 기존필드 의미: 일시보유 `netAssetPerShare`(④)=`(A+t·X_w)/N`, 소각 ④=`A/(N−t)`.
- `premiumPerShare`(⑦⑧⑨)·`totalValuation`(⑨×ownedShares) = treasury 무관 기존 로직.

---

## 3. 신규 순수 함수 — `property-valuation/treasury-stock.ts` (일시보유 전용)

```ts
export interface SelfRefInput {
  netAssetTotal: number;        // A (영업권 포함 후 ③)
  treasuryShares: number;       // t
  totalShares: number;          // N
  netIncomeValuePerShare: number; // p = ⑤ (1주당 순손익가치)
  isRealEstateHeavy: boolean;
  netAssetOnly: boolean;        // §54④ 순자산단독 여부
}
export interface SelfRefResult {
  finalPerShareValue: number;   // ⑥ (X)
  selfRefNetAssetPerShare: number; // 일시보유 ④ = floor((A+t·X_w)/N)
  weightedSelfRef: number;      // X_w (㉠)
  floor80Applied: boolean;
  floor80NetAssetValue?: number; // NA80
}
export function solveSelfReferentialValuation(i: SelfRefInput): SelfRefResult;
```

### 3-1. 알고리즘 (정수연산 — Math.round 금지, floor 절사)

```
N = totalShares, t = treasuryShares, A = netAssetTotal, p = netIncomeValuePerShare
[가중치] 일반: (na,ni)=(2,3)  부동산과다: (na,ni)=(3,2)   // na=순자산, ni=순손익

① 순자산단독(netAssetOnly = §54④ **무조건 사유** liquidation/lt3y/remaining_3y 한정):
     X = floor(A / (N − t))                       // 이미지 ㉰
     return { finalPerShareValue: X, selfRefNetAssetPerShare: X, weightedSelfRef: X, floor80Applied: false }
     // ⚠️ 단서 사유(real_estate_80/stock_holding_80, "가중평균<순자산일 때만") + 일시보유 조합은
     //    이미지 미수록 + 극희소 → MVP 범위 외(한계 §7). orchestrator는 이 조합 시 일반 가중평균 경로로
     //    fallback(단서 미발동) — 납세자 불리 아님(가중평균이 순자산보다 크면 가중평균 채택은 동일 결과).

② 일반/부동산과다 가중평균 (자기참조):
     X_w = floorDiv( na·A + ni·(p·N), 5N − na·t )  // 폐형 정수해
     // 검산 일반: (2·A + 3·p·N)/(5N−2t);  부동산과다: (3·A + 2·p·N)/(5N−3t)
     // ⚠️ 분자 ni·p·N 은 대형법인(p·N ≈ 2^53 근방)에서 부동소수 곱 정밀도 소실 →
     //    분자/분모를 BigInt(또는 safeMultiply) 정수곱으로 산출 후 floorDiv (메모리 safemul·applyrate).

③ 일시보유 ④ (self-ref 순자산가치, treasury를 X_w로 평가):
     na4 = floor( (A + t·X_w) / N )

④ 80% 하한 판정·재계산:
     if (X_w < floor(na4 × 0.8)):                  // 미달
         NA80 = floor( 10·A / (10N − 8t) )         // = floor(A/(N−0.8t))
         X    = floor( NA80 × 0.8 )                // 최종 (이중 floor)
         floor80Applied = true
     else:
         X = max( X_w, floor(na4 × 0.8) )
         floor80Applied = false
     return { finalPerShareValue: X, selfRefNetAssetPerShare: na4, weightedSelfRef: X_w, floor80NetAssetValue: NA80? }
```

### 3-2. 정수해 유도 검산 (anchor)
- C-02 일반: `(2·1,800,000,000 + 3·70,000·30,000)/(5·30,000 − 2·6,000)` = `9,900,000,000/138,000` = 71,739.13 → **71,739**
- C-06 부동산과다: `(3·1,800,000,000 + 2·70,000·30,000)/(5·30,000 − 3·6,000)` = `9,600,000,000/132,000` = 72,727.27 → **72,727**
- C-05 80%: X_w=`3,600,000,000/138,000`=26,086 / na4=`floor((1,800,000,000+6,000·26,086)/30,000)`=65,217 / `26,086 < floor(65,217·0.8=52,173.6→52,173)` 미달 → NA80=`floor(18,000,000,000/252,000)`=71,428 → X=`floor(71,428·0.8=57,142.4)`=**57,142**
- C-07 순자산단독: `floor(1,800,000,000/24,000)`=**75,000**

> ⚠️ `safeMultiplyThenDivide` 사용 검토: 분자 `na·A + ni·p·N` 이 2^53 초과 가능(A·N 대형). 분자/분모 정수곱은
> `safeMultiply`+BigInt fallback 경유로 정밀도 보장(메모리 `safemul_decimal_apportion_precision`·`applyrate_fractional_rate_one_won_error`).

---

## 4. 오케스트레이터 배선 (`unlisted-orchestrator.ts` — 실측 라인)

```
[도출]  effectiveTotalShares = treasuryStock?.purpose==="cancellation"
            ? totalShares − treasuryStock.shares : totalShares     // 일시보유·미보유 = N

L101  calcConvertedShares({ totalShares: effectiveTotalShares, ... })  // ⑤ 분모 (소각만 N−t)
L191  netAssetPerShare = calcNetAssetPerShare(netAssetTotal, effectiveTotalShares) // ④ 분모

[일시보유 override]  if (treasuryStock?.purpose==="temporary_holding"):
    const sr = solveSelfReferentialValuation({ netAssetTotal, treasuryShares, totalShares, 
                  netIncomeValuePerShare: netIncomePerShare, isRealEstateHeavy, 
                  netAssetOnly: !!input.netAssetOnlyReason });
    weightedAvgPerShare = sr.weightedSelfRef;     // ㉠ 표시용
    netAssetPerShare    = sr.selfRefNetAssetPerShare; // 일시보유 ④
    netAssetFloor80     = floor(sr.selfRefNetAssetPerShare × 0.8);
    finalPerShareValue  = sr.finalPerShareValue;  // ⑥ (L194~230 기존 분기 우회)

[소각·감자]  override 없음 — L194~230 기존 weighted/floor80/net-asset-only 분기가 N−t 기준으로 그대로 동작.

L267  calcMaxShareholderPremium({ finalPerShareValue, ... })  // ⑦⑧⑨ 무변경
[결과] treasuryStockApplied 채움 + appliedRules/warnings push
```

> **Surgical Changes**: `calcConvertedShares`·`calcNetAssetPerShare`·`weighted-avg.ts` 3함수 **시그니처·본문 무변경**.
> 변경 = 오케스트레이터 호출부 인자 주입 + 일시보유 override 분기 + 신규 `treasury-stock.ts`.

---

## 5. 14 동기화 지점 커버리지 (신규필드 `treasuryStock`)

| 지점 | 위치 | 상태 |
|---|---|---|
| ① 폼 상태 | unlisted-stock-v2 form data | 추가 |
| ② initial | factory(보유 안 함=undefined) | 추가 |
| ③ normalize | undefined 보존 | 추가 |
| ④ API 변환 | `lib/calc/*` 평가 입력 변환 | 추가 |
| ⑤ UI 위젯 | `CorporateInfoSection` 토글·라디오 | 추가 |
| ⑥ 사이드바 합계 | 평가 단계 — 합계 영향 없음 | N/A |
| ⑦ 결과 카드 | `PerShareValuationResultCard` | 추가 |
| ⑧ validation | shares>0·purpose·0<t<N | 추가 (U3) |
| ⑨⑩ Zod enum | purpose 2값 enum | 추가 |
| ⑪ 자산-수준 fallback | 해당 없음 | N/A |
| ⑫ Zod 입력객체 | `treasuryStock` 중첩객체 스키마 | **추가(TS 미감지 — grep)** |
| ⑬ body spread | fetch body에 `treasuryStock` | **추가(TS 미감지 — grep)** |
| ⑭ Route 엔진 매핑 | route handler input 매핑 | **추가(TS 미감지 — grep)** |

> ⑫⑬⑭ 침묵 strip 방지 — Do 후 `grep -rn "treasuryStock"` 로 전 경로 도달 확인.

---

## 6. 테스트 (anchor)

`__tests__/tax-engine/property-valuation-stock-treasury.test.ts`
- solver 단위: C-02·C-05·C-06·C-07 (각 중간값 단정 — C-05는 X_w·na4·NA80·최종 4값)
- 오케스트레이터 통합: C-04(소각 72,000)·C-08(소각 순자산단독 75,000)·C-10(할증)
- 회귀: C-01 (treasuryStock undefined → 기존 U케이스 정확값 불변)
- 경계: C-09 (t≥N validation 차단)
- 상수화: 기준값(A·N·t·p) 파일 상단 const (메모리 `pdf_example_test_anchoring`)

---

## 7. 범위 한계 (MVP scope-out — 명시)

| 항목 | 사유 | 처리 |
|---|---|---|
| 일시보유 + §54④ **단서 사유**(real_estate_80·stock_holding_80) 조합 | 이미지 미수록 + 극희소(부동산80%/주식80% 법인이 동시에 일시보유 자기주식) | solver netAssetOnly는 무조건 사유 한정. 단서+일시보유는 일반 가중평균 경로(단서 미발동) — 납세자 불리 아님 |
| 환산주식수 윈도우 밖 자본변동 + 자기주식 동시 | 기존 §56③ 단서 환산 한계 그대로 승계 | 기존 경고 메시지 재사용 |
| 자기주식 취득가액의 순자산 별도 차감 | contra-equity라 이미 A에서 제외(plan §9-④·⑤) | 가액 입력 필드 없음 — 차단 |

> 한계는 `warnings`로 사용자 고지하거나(단서+일시보유 시) validation 차단(t≥N). 침묵 누락 금지(메모리 `silent_omission_full_input_enforcement`).
