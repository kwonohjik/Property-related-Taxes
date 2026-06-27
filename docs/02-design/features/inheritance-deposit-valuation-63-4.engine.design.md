# 예금·저금·적금 §63④ 평가 — 엔진 설계문서

> 상위 계획: [`inheritance-deposit-valuation-63-4.design.md`](./inheritance-deposit-valuation-63-4.design.md)
> 본 문서: 순수 엔진(`lib/tax-engine/property-valuation.ts`) input/result 타입·알고리즘·정수연산·케이스 인벤토리.

## 1. 타입 변경 (EstateItem — `types/inheritance-gift-estate.types.ts`)

```typescript
// category === "financial" 전용 (savings* 접두어 — deposit 카테고리 충돌 회피)
savingsValuationMode?: "balance" | "auto" | "manual";   // 미설정 = "balance"(회귀안전)
savingsPrincipal?: number;          // ㉠ 예입원금
// auto 입력
savingsAnnualRate?: number;         // 약정 연이자율 (% 단위, 예: 5)
savingsStartDate?: string;          // 이자기산일 YYYY-MM-DD (date-coerce 대상)
savingsWithholdingRate?: number;    // 원천징수세율 (% 기본 14)
savingsIncludeLocalTax?: boolean;   // 지방소득세 포함 (기본 true)
// auto=클라이언트 주입 / manual=사용자 직접 — 엔진이 읽는 최종 파생값
savingsAccruedInterest?: number;    // ㉡
savingsWithholdingTax?: number;     // ㉢ (= ㉢-1 + ㉢-2)
```

> `savingsValuationDate` 같은 날짜 주입 필드 **없음** — 클라이언트가 산정해 `savingsAccruedInterest`·
> `savingsWithholdingTax`만 주입(지상권 잔존연수 주입 동형). 엔진은 날짜연산 안 함 → validate NaN 차단.

## 2. PropertyValuationResult (기존 타입 재사용)

```typescript
{ estateItemId, method, valuatedAmount, breakdown: PropertyValuationBreakdown[], warnings }
// method 신규: "deposit_statutory"  ← balance 모드는 기존 "market_value" 유지
```

## 3. 순수 헬퍼 `computeSavingsAccrual` (산식 단일 진실)

```typescript
export function computeSavingsAccrual(p: {
  principal: number; annualRate: number;        // annualRate: % (5 → 0.05)
  startDate: Date; valuationDate: Date;
  withholdingRate: number; includeLocalTax: boolean;   // withholdingRate: % (14)
}): {
  elapsedDays: number; accruedInterest: number;
  incomeWithholding: number; localIncomeTax: number; withholdingTax: number;
  valuatedAmount: number;
} {
  const elapsedDays = Math.max(0, differenceInDays(p.valuationDate, p.startDate));   // 음수 가드(case5)
  // ㉡ = (principal × rate%) × days / (100 × 365) — safeMulDivRound (tax-utils.ts:131, 3인자 BigInt round-half-up)
  const accruedInterest = safeMulDivRound(p.principal * p.annualRate, elapsedDays, 100 * 365);
  // ㉢-1 = floor(㉡ × 원천징수율%/100)
  const incomeWithholding = Math.floor(accruedInterest * p.withholdingRate / 100);
  // ㉢-2 = floor(㉢-1 × 10%)  ← 원 단위 확정(국고금관리법 §47: 10원 절사는 국고금 수입·지출 끝수, 평가계산 아님). 지방세법 §103의13①
  const localIncomeTax = p.includeLocalTax ? Math.floor(incomeWithholding / 10) : 0;
  const withholdingTax = incomeWithholding + localIncomeTax;
  const valuatedAmount = p.principal + accruedInterest - withholdingTax;
  return { elapsedDays, accruedInterest, incomeWithholding, localIncomeTax, withholdingTax, valuatedAmount };
}
```

- `differenceInDays`: date-fns. Pre-Do probe로 305 확정(§9-1). 음수→0 가드(case 5).
- `safeMulDivRound`(tax-utils.ts:131): bigint-round-half-up 헬퍼 재사용(분자 1.525e12 안전하나 통일).
- 정수연산: ㉡ round-half-up / ㉢-1·㉢-2 floor (계획서 §1 정책표).

## 4. `evaluateFinancial` 분기 (기존 함수 확장)

```typescript
export function evaluateFinancial(item: EstateItem): PropertyValuationResult {
  if (item.category !== "financial") throw ...;
  const mode = item.savingsValuationMode ?? "balance";

  if (mode === "balance") {
    const amount = item.marketValue ?? 0;          // 현행 100% 동일 (회귀 0)
    return { method: "market_value", valuatedAmount: amount,
             breakdown: [{ label:"금융재산 평가액(잔액·시가)", amount, lawRef: VALUATION.PRINCIPLE }],
             warnings: amount<=0 ? ["금융재산 금액이 0원 — 입력 확인 필요"] : [] };
  }

  // auto | manual — 주입/직접 파생값 합산 (엔진은 날짜 미사용)
  const principal = item.savingsPrincipal ?? item.marketValue ?? 0;
  const accrued = item.savingsAccruedInterest ?? null;
  const wht = item.savingsWithholdingTax ?? null;

  if (mode === "auto" && accrued == null) {        // 코드#3 NaN/dual-truth 가드 (case 9)
    // method는 "deposit_statutory" 유지 — 사용자가 §63④ 선택했는데 "시가" 표시 모순 차단(M-3)
    return { method:"deposit_statutory", valuatedAmount: principal,
             breakdown:[{ label:"예입원금(미수이자 미산정·평가기준일 확인 필요)", amount: principal, lawRef: VALUATION.DEPOSIT }],
             warnings:["미수이자 미주입 — 잔액으로 평가(평가기준일 누락 가능)"] };
  }

  const valuatedAmount = principal + (accrued ?? 0) - (wht ?? 0);
  return { method:"deposit_statutory", valuatedAmount,
    breakdown: [
      { label:"㉠ 예입금액",        amount: principal,       lawRef: VALUATION.DEPOSIT },
      { label:"㉡ 미수이자",        amount: accrued ?? 0,    lawRef: VALUATION.DEPOSIT },
      { label:"㉢ 원천징수세액",     amount: -(wht ?? 0),     lawRef: VALUATION.DEPOSIT },
    ],
    warnings: valuatedAmount<=0 ? ["예금 평가액이 0원 이하 — 입력 확인"] : [] };
}
```

## 5. 케이스 인벤토리 (anchor 테스트 — `__tests__/tax-engine/property-valuation`)

| # | mode | 입력 | 기대 valuatedAmount | 비고 |
|---|---|---|---|---|
| 1 | balance | marketValue 50,000,000 | 50,000,000 | 현행 회귀 |
| 2 | balance | marketValue 0 | 0 + warning | |
| 3 | auto | 원금10억·5%·2007.7.1~2008.5.1·14%·지방세ON | **1,035,346,576** | ±1 tolerance(PDF 575). ★ |
| 3b | helper | computeSavingsAccrual 직접: accrued=41,780,822·wht=6,434,246·days=305 | — | 산식 단위검증 |
| 4 | auto | case3 + 지방세OFF | 1,035,931,507 | localIncomeTax=0 |
| 5 | auto | valuationDate < startDate | principal + 0 − 0 | elapsedDays=0 가드 |
| 6 | auto | accrued=null(미주입) | principal + warning | case9와 동일 가드 |
| 7 | manual | 1억·미수이자50만·원천징수7만 | 100,430,000 | 직접입력 |

> 3·3b·4가 핵심. case 3은 엔진(floor) 1,035,346,576 — PDF 1,035,346,575와 1원은 `expect().toBeCloseTo`
> 또는 `Math.abs(diff)<=1`로 허용. 주석에 "PDF 지방소득세 round / 엔진 지방세 절사 floor" 명기.

## 6. 14 동기화 — 엔진측 (③④⑥⑧⑪⑭ 파생 주입 일관)

`computeSavingsAccrual`는 엔진 export → 클라이언트 4경로(buildInput·buildGiftTaxInput·
computeEffectiveValuation·validate)가 import 호출(single-source-engine-helper). 엔진 내부 dual 정의 금지.

## 7. 미해결 (계획서 §9 참조)
일수 probe·지방세 절사단위·§22 공제영향·validate 주입경로·factory 위치 — Do 전 해소.
