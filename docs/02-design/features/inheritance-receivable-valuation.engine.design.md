# 채권가액 평가 — 엔진/데이터 설계

> 상위 계획서: [`inheritance-receivable-valuation.plan.md`](./inheritance-receivable-valuation.plan.md)
> 대상: 상증령 §58② / 상증칙 §18의2② / 상증칙 §18의3(적정할인율). EstateItem `receivable` 신규 카테고리.
> 기준 코드: worktree `receivable-valuation` (origin/master `feda7d0f`). 인용 file:line 실측 확인.

## 1. 케이스 인벤토리 (행 ≥ 1 강제)

| ID | 케이스 | 조건 | 산식 | anchor |
|---|---|---|---|---|
| RC-A1 | 기타채권 단순 | 회수기간 ≤5년 | 원본 + 미수이자상당액 | 1억 + 300만 = 103,000,000 |
| RC-A2 | 미수이자 0 | 무이자 단기채권 | 원본만 | 5천만 = 50,000,000 |
| RC-B1 | 정리채권 현가 | 회사정리 변경·5년초과 | Σ 회수금액×25ⁿ/27ⁿ (8%, round) | **2,837,396,278** (교재) |
| RC-B2 | 시대표 6.5% | 평가기준일 2010.6.1 | rate=65/1000, (1.065)=213/200 | 산식검증 anchor |
| RC-C1 | 회수불가 전부 | 전액 회수불능 | 0 | 0 |
| RC-C2 | 회수불가 일부(simple) | 원본 5천만 − 불능 2천만 | 3천만(+미수이자) | 30,000,000(+i) |

> RC-B1은 §2 즉석 실측으로 재현 검증 완료(round-half-up 25ⁿ/27ⁿ). 나머지는 Pre-Do anchor에서 작성.

## 2. 입력 타입 (EstateItem 확장)

`lib/tax-engine/types/inheritance-gift-estate.types.ts` — `AssetCategory`(:36)에 추가, EstateItem 필드(:226 superficies 다음 인접).

```ts
export type ReceivableKind = "loan" | "trade" | "note" | "reorg" | "other";
//  loan 대여금·대부금 / trade 외상매출금 / note 받을어음 / reorg 정리채권 / other 기타

export interface ReceivableInstallment {
  recoverDate: Date | string;   // 회수일 — n 산정 기준 (⚠️ 중첩 Date: Route map 변환)
  amount: number;               // 그 해 회수금액 = 원본분 + 이자상당액 (사용자 직접 입력)
}

// EstateItem 추가 필드 (전부 optional — discriminated by category)
receivableKind?: ReceivableKind;
receivablePrincipal?: number;              // 원본(원금) — simple 필수
receivableAccruedInterest?: number;        // 평가기준일까지 미수이자상당액 — simple
receivableMode?: "simple" | "discounted";  // 회수기간 5년 이내 / 초과·변경
receivableSchedule?: ReceivableInstallment[];        // discounted 필수(≥1행)
receivableDiscountRateOverride?: RateFraction;       // gift-deemed-rates.ts:9 import
receivableUncollectible?: number;          // 회수불가능 차감 (simple 전용 — §4.1(가))
receivableUncollectibleReason?: string;
```

> `RateFraction`은 `lib/tax-engine/data/gift-deemed-rates.ts:9` 정의(공유타입 아님). import 경로 주의.

## 3. 출력 타입 — 기존 `PropertyValuationResult` 재사용

`property-valuation.ts` 기존 인터페이스 그대로(`estateItemId`/`method`/`valuatedAmount`/`breakdown`/`warnings`). 신규 result 필드 불요.
- `method`: **두 모드 모두 `"standard_price"`**(보충적 평가, 지상권 §61③과 동일). ValuationMethod enum 실측 결과
  `present_value`/`supplementary` **부재** → 신규 enum 추가는 과설계(Simplicity First). 현가할인도 보충적평가의 일종.

## 4. 알고리즘

### 4.1 `evaluateReceivable(item: EstateItem): PropertyValuationResult`
`property-valuation.ts` 신규 + `evaluateEstateItem` switch(:541, `financial:551`/`deposit:553`/`superficies:555` 다음) `case "receivable"` 추가.

```
mode = item.receivableMode ?? "simple"

[simple]  RC-A·RC-C2
  principal = max(0, receivablePrincipal ?? 0)
  uncollectible = max(0, receivableUncollectible ?? 0)
  usablePrincipal = max(0, principal − uncollectible)        // §58② 단서
  interest = max(0, receivableAccruedInterest ?? 0)
  valuated = usablePrincipal + interest                      // 원본 + 미수이자
  breakdown: 원본 / (−)회수불가능 / (+)미수이자상당액 / 합계

[discounted]  RC-B
  rate = receivableDiscountRateOverride ?? resolveReceivableDiscountRate(valuationDateISO)
  base = rate.denom              // 8% → numer80/denom1000 → (1+r)=1080/1000=27/25
  step = rate.denom + rate.numer //  = 1080
  valuated = 0
  for k in schedule:
    n = recoveryYearN(valuationDate, k.recoverDate)          // 정수 연수
    pv = bigRoundHalfUp(k.amount, base, step, n)             // amount × baseⁿ / stepⁿ, round-half-up
    valuated += pv
  breakdown: 연도별 (회수금액 / (1+할인율)ⁿ = pv) 행 + 합계
```

### 4.2 현가 round-half-up BigInt 헬퍼 (RC-B1 정밀도 동결)
```ts
// amount × baseⁿ / stepⁿ, round-half-up (0.5 이상 올림). 부동소수 금지.
function pvRoundHalfUp(amount: number, base: number, step: number, n: number): number {
  const num = BigInt(Math.round(amount)) * (BigInt(base) ** BigInt(n));
  const den = BigInt(step) ** BigInt(n);
  const q = num / den;
  const r = num - q * den;
  return Number(r * 2n >= den ? q + 1n : q);   // round-half-up
}
```
> 신탁 `trustIncomePV`(`gift-deemed/trust-benefit.ts`)는 **floor**(BigInt 절사). 채권은 **round-half-up**으로
> RC-B1 교재값 정확 일치(floor는 9년항 −1원 → 합계 1원 부족). `tax-utils.ts:131 safeMulDivRound` 라운딩 로직 차용,
> 단 거듭제곱 `baseⁿ/stepⁿ`은 별도. (메모리 `bigint-round-half-up`, `feedback_applyrate_fractional_rate_one_won_error`)

### 4.3 회수기간 단일 헬퍼 (dual-truth 회피)
```ts
// 스케줄 최종 회수일 − 평가기준일 (정수 연수). UI 임계안내·엔진 공용 단일 export.
export function resolveReceivableRecoveryYears(
  schedule: ReceivableInstallment[], valuationDate: Date,
): number  // = max(recoveryYearN) — 지상권 differenceInYears 패턴
```
- `recoveryYearN(valuationDate, recoverDate)`: `differenceInYears`(date-fns, `property-valuation.ts:12` 기존 import) 기반. **비정수 잔여월 처리는 §9 예규 확정 후** 동결(교재 정수년만 검증).

### 4.4 시대표 — `resolveReceivableDiscountRate(valuationDateISO): RateFraction`
`gift-deemed-rates.ts:27 resolveFreeLoanRate` 패턴(≥from 누적 lookup). 위치: `data/gift-deemed-rates.ts` 또는 신규 `data/receivable-rates.ts`.
```ts
export const RECEIVABLE_DISCOUNT_RATE_HISTORY: ReadonlyArray<{from:string; rate:RateFraction}> = [
  { from: "2001-01-01", rate: { numer: 75, denom: 1000 } }, // 7.5%  (1+r)=1075/1000
  { from: "2002-07-10", rate: { numer: 70, denom: 1000 } }, // 7.0%
  { from: "2002-11-08", rate: { numer: 65, denom: 1000 } }, // 6.5%
  { from: "2011-07-26", rate: { numer: 80, denom: 1000 } }, // 8.0% (현행, 2016.3.21 §18의3 동일)
];
```
> 경계·율 KoreanLaw MCP 재검증 후 동결(§9). 역사값 단정 금지(`feedback_historical_statute_value_via_tribunal`).

## 5. 조문 상수
`lib/tax-engine/legal-codes/inheritance-gift.ts` `VALUATION` 객체에 추가(리터럴 금지):
- `RECEIVABLE` → 상증령 §58②
- `RECEIVABLE_DISCOUNT` → 상증칙 §18의2②1가목 / §18의3

## 6. 클라이언트 평가 진입 (valuationDate 주입)
`lib/calc/estate-item-valuation.ts` `computeEffectiveValuation` — receivable·discounted는 **valuationDate 필요**.
지상권 `injectSuperficiesRemainingYears(item, valuationDate)`처럼 evaluateReceivable에 valuationDate 전달 경로 필요
(스케줄 n 산정·시대표 lookup). 부분입력 try/catch 0 가드 유지.

> factory initial(②, R3): 신규 카테고리 선택 시 필드 리셋은 `CategoryChangeDialog`가 담당(지상권과 동일). 별도 factory 불요.

## 7. 동기화 지점 — 계획서 §5 참조 (엔진측 4 + 시대표 1)
type(:36 enum, :226 필드) · property-valuation(evaluateReceivable + dispatch) · 시대표 · legal-codes. 클라이언트·UI·API는 UI 설계 문서.

## 8. anchor 테스트 매핑
`__tests__/tax-engine/property-valuation/receivable-58-2.test.ts`:
- RC-B1 = 2,837,396,278 (교재, round-half-up 동결)
- RC-A1 = 103,000,000 / RC-A2 = 50,000,000
- RC-C1 = 0 / RC-C2 = 30,000,000(+미수이자)
- RC-B2 = 6.5% 시대표 분기(평가기준일 2010.6.1)
- `resolveReceivableRecoveryYears` 단위(5년 경계)

## 9. 동결 전 확인 (계획서 §9 동기화)
- ✅ ValuationMethod — `standard_price` 재사용 확정(STEP6 E2, 신규 enum 불요)
- 비정수 n 처리 규칙 (잔여월)
- 시대표 from 경계·율 (KoreanLaw)
- 별지2호 receivable type 코드 (코드표)
- 회사정리 변경채권 discounted 근거 인용
