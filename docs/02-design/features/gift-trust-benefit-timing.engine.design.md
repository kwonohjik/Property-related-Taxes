# 신탁이익의 증여(§33) 증여시기 분리 — 엔진 설계

> 계획서: [`docs/00-pm/gift-trust-benefit-timing.plan.md`](../../00-pm/gift-trust-benefit-timing.plan.md)
> 대상: `lib/tax-engine/gift-deemed/trust-benefit.ts` · `types.ts`. 법령 KoreanLaw 본문 실측(상증법§33 / 령§25·§61·§62 / 칙§19의2).

## 1. 범위
원본권·수익권 증여시기 분리(D2) + giftTimingType 평가기준일 결선(B1) + 할인 연수 일반화(B3) + §61② 정기금 연수(B4). per-회차 개별 실제지급일은 Phase2.

## 2. 법령 근거 (실측 요약)
- **§33①**: 1호 원본권·2호 수익권 **각각 증여**, 증여일=실제지급일 등(§25①).
- **령§25①**: 증여시기 = 실제지급일 / 위탁자 사망일 / 약정일 / 분할 최초지급일(3호) / 분할단서 실제지급일. **②** 분할 시 §1항 증여시기 기준 §61 준용.
- **령§61①**: 평가기준일 현재. 1호 동일수익자=신탁재산 가액 / 2호 다른수익자(가.원본권=재산−수익권 / 나.수익권=장래 각 연도 수익 현가합, 원천징수 고려). **단서**: 전체 해지 일시금 > 평가액 → 일시금. **②** 수익시기 미정 → §62 2호(무기 20년)·3호(종신 기대여명) 연수.
- **령§62**: 1호 유기(20배 cap, §61 미준용) / 2호 무기=20년 / 3호 종신=기대여명 **floor**.
- **칙§19의2**: ① 이자율 3%(30/1000) / ② 미확정 시 원본×3% / ③ §62 이자율 3%.

> **핵심 가정 (D2, 검토 시 재확인)**: `same`(동일수익자)를 **원본권(신탁재산 가액) + 수익권(현가합) = 997M**로 분리 산출하는 것은 §61①1호 문언("동일수익자 = 신탁재산 가액", 단일 800M)과 **표면상 상이**하나, **교재 p.557이 원본·수익을 분리(997M)** 한다는 사용자(전문가) 확인에 근거(D2 확정). 즉 동일수익자라도 원본 받을 권리·수익 받을 권리를 §33①1·2호 별개 증여로 보고 각 평가 후 합산. 이 가정이 깨지면 `same` 산식 전면 재검토 필요.

## 3. 케이스 인벤토리 (행 ≥ 3)

| # | beneficiaryType | 정기금유형 | 증여시기 | 산출 | 비고 |
|---|---|---|---|---|---|
| C1 | same(동일) | finite(유기) | 원본·수익 동일일 | 원본권(재산) + 수익권(현가합) **2건** | **A1 회귀**: 800M + 197M=997M |
| C2 | same | finite | 원본일 ≠ 수익일 | 2건 각 다른 증여시기 | **A2 분리** |
| C3 | diff_income(수익만) | finite | 수익 최초지급일 | 수익권 1건(현가합) | §61①2호나목 |
| C4 | diff_principal(원본만) | finite | 원본 지급일 | 원본권 1건(재산−수익권) | §61①2호가목 |
| C5 | same | perpetual(무기) | — | 수익권 = 20년 현가합 + 원본권 | §62 2호 |
| C6 | diff_income | lifetime(종신) | — | 수익권 = 기대여명(floor) 현가합 | §62 3호·2023표 |
| C7 | any | — | — | 전체 해지 일시금 > 합계 → 일시금 | §61① 단서(전체 Max) |
| C8 | finite·간격>1 | finite | 평가기준일 ≠ 첫수익시기 | nₖ = k×간격 (예 0,2,4) | **A3 연수 일반화** |

## 4. Input 타입 (`TrustBenefitInput` 확장)
```ts
export interface TrustBenefitInput {
  beneficiaryType: "same" | "diff_principal" | "diff_income";
  trustPropertyValue: number;
  yieldRate?: { numer: number; denom: number };      // 미확정 → undefined → 원본×3%(칙§19의2②)
  withholdingRate: { numer: number; denom: number };
  // ── 증여시기 분리 (신규) ──
  incomeGiftDate?: Date;       // 수익권 증여시기(§25①, 분할=최초지급일). diff_income/same 필수
  principalGiftDate?: Date;    // 원본권 증여시기(§25①, 원본 실제지급일). diff_principal/same 필수
  giftTimingType?: "actual" | "decedent_death" | "agreed" | "first_installment"; // 평가기준일 의미(B1)
  // ── 수익권 연수 (신규) ──
  incomeAnnuityType?: "finite" | "perpetual" | "lifetime";  // §61②→§62. 엔진 `?? "finite"`(하위호환)
  installments?: number;       // finite: 회차 수
  incomeIntervalYears?: number; // 회차 간 연수(기본 1)
  expectedRemainingYears?: number; // lifetime: 기대여명(미입력 시 2023표 조회·floor)
  beneficiaryGender?: "male" | "female"; beneficiaryAge?: number; // lifetime 기대여명 조회용
  surrenderValue?: number;     // §61① 단서(전체 해지 일시금)
}
```
> `installments`(현행 필수)→ `incomeAnnuityType="finite"`일 때만 의미. 마이그레이션: 기존 입력은 `finite`+`installments` 기본.

## 5. Result 타입 (`DeemedGiftResult` 확장)
```ts
// 추가 (deemedGiftValue=합계 유지, 하위호환)
subGifts?: {
  right: "principal" | "income";
  giftDate?: Date;     // 권리별 증여시기
  value: number;
  lawRef: string;      // GIFT.TRUST_BENEFIT_VALUATION
}[];
```
- `subGifts`는 신탁 전용. 표시(⑦)·prefill(⑬)이 이를 사용해 **별개 증여시기 2건** 노출. 일시금 단서 적용 시 subGifts를 합계 1건으로 축약 + 표기.

## 6. 알고리즘 (의사코드)
```
principal = max(0, trustPropertyValue)
y = yieldRate ?? {30,1000}                          // 칙§19의2①/② 미확정 원본×3%
grossIncome   = applyRateFraction(principal, y.numer, y.denom)
withholding   = applyRateFraction(grossIncome, withholdingRate.numer, withholdingRate.denom)
afterTaxIncome= max(0, grossIncome - withholding)

// 연수 (§61②→§62)
periods = incomeAnnuityType==="finite"    ? max(0, floor(installments))
        : incomeAnnuityType==="perpetual" ? 20
        : floor(expectedRemainingYears ?? getLifeExpectancyByGender(gender, age))   // §62 3호 floor
interval = incomeIntervalYears ?? 1

// 수익권 현가합 — nₖ = k×interval (연1회·평가기준일=첫수익시기면 0,1,2 → A1 보존)
incomeRight = Σ_{k=0}^{periods-1} trustIncomePV(afterTaxIncome, k*interval)   // BigInt 100ⁿ/103ⁿ floor

// 권리별 평가액
incomeValue    = incomeRight
principalValue = beneficiaryType==="diff_principal" ? max(0, principal - incomeRight) : principal

// 분리 2건 (§61①1·2호)
subGifts = beneficiaryType==="diff_income"    ? [income]
         : beneficiaryType==="diff_principal" ? [principal]
         : [principal, income]                                   // same → 2건 분리(D2)
total = Σ subGifts.value

// §61① 단서 — 전체 해지 일시금 Max (권리별 아님)
if (surrenderValue ?? 0) > total: deemedGiftValue=surrenderValue, subGifts→합계1건 표기
else deemedGiftValue = total
```

## 7. 정수 연산
- `applyRateFraction`(floor) · `trustIncomePV`(BigInt `R×100ⁿ/103ⁿ`, 0방향 절사=양수 floor) 재사용. `n`만 `k*interval`로 일반화. 기대여명 floor(§62 3호).

## 8. anchor (원단위 toBe)
- **A1**(C1 회귀): same·8억·10%·15.4%·finite 3회·간격1 → 수익권 197,183,628(PV [67,680,000 / 65,708,737 / 63,794,891]) + 원본권 800,000,000, deemedGiftValue 997,183,628.
- **A2**(C2): principalGiftDate ≠ incomeGiftDate → subGifts 2건 각 giftDate 분리.
- **A3**(C8): interval=2 → nₖ=0,2,4 할인(인덱스 아님).
- **A4**(C5 무기): perpetual → 20년 현가합.
- **A5**(C6 종신): lifetime·gender/age → 기대여명 floor 연수 현가합.
- **A6**(C7 단서): surrenderValue > total → 일시금, subGifts 합계 축약.

## 9. 엔진 측 동기화
- `legal-codes/inheritance-gift.ts`: GIFT.TRUST_* 유지 + (필요시) §25 증여시기 상수.
- `types.ts`: TrustBenefitInput·DeemedGiftResult 확장(§4·§5).
- `trust-benefit.ts`: 알고리즘(§6) — **800줄 정책** 여유(현 120줄 → ~200줄). 기대여명 조회는 `data/life-expectancy-2023.ts` `getLifeExpectancyByGender` import (반환형 소수 여부 Do 시 확인 → §62 3호 **floor** 적용; §20③ ceil과 구분).
- **기존 테스트 갱신**: `__tests__/tax-engine/gift-deemed/trust-benefit.test.ts`(997M·thresholdEcho.incomeRight=197M) — subGifts 2건·신규 anchor(A2~A6) 추가. deemedGiftValue 합계 997M·PV 회차값 보존 확인.
