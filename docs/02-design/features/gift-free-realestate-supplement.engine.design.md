# [엔진 설계] 부동산 무상사용·담보 §37 보완 — 경정청구·다기간

> 계획서: `docs/00-pm/gift-free-realestate-supplement.plan.md`
> 대상 엔진: `lib/tax-engine/gift-deemed/free-realestate-use.ts` `calcFreeRealEstateGift()`
> 법령: 상증법 §37·§79②1호 / 시행령 §27③⑤·§81⑤⑥⑨ (KoreanLaw 실측 — 본칙 mst=276123·시행령 mst=283637)

## 1. 케이스 인벤토리 (전수 — 엔진 분기 1:1)

| ID | 모드 | 입력 조건 | 분기 | 기대 결과 | anchor |
|---|---|---|---|---|---|
| S-U | free_use 단일 | `periods` 미입력, `propertyValue` | 기존 경로(무변경) | 5년 현가합, 1억 기준 | (기존 회귀) |
| S-C | collateral 단일 | `periods` 미입력, `loanAmount` | 기존 경로(무변경) | 차입이익, 1천만 기준 | (기존 회귀) |
| M-U | free_use 다기간 | `periods=[{startDate,propertyValue}...]` | window 루프(5년·1억) | window별 표 + **첫 window 세액연결**(합산 X) | FRE-MULTI-1·2 |
| M-C | collateral 다기간 | `periods=[{startDate,loanAmount,actualInterestPaid}...]` | window 루프(1년·1천만) | window별 표 + 첫 window 연결(합산 X) | COL-MULTI-1 |
| R-U | free_use 경정 | `rectification`(free_use) | 경정 분기(분모 60) | floor(산출세액×잔여월/60) | RECT-1·2·3 |
| R-C | collateral 경정 | `rectification`(collateral) | 경정 분기(분모 12) | floor(산출세액×잔여월/12) | COL-RECT-1·2·3 ✅(§81⑤ 도출) |
| F-1 | 비특수+정당사유 | `!isRelatedParty && hasJustifiableReason` | `_fail()`(기존) | 비적용 | (기존 회귀) |

> 다기간·경정은 **독립 optional**. 둘 다 입력 가능(다기간 산정 + 그중 특정 증여의 경정). 단 MVP는 분리 표시. **`rectification`은 자체 `giftDate`로 만료일·월수 산정 → `periods`와 독립**(periods의 window 증여일에 자동 연동하지 않음 — 사용자가 경정 대상 증여일을 직접 지정).

## 2. 입력 타입 (`gift-deemed/types.ts` `FreeRealEstateInput` 확장 — `:109`)

```ts
export interface FreeRealEstateInput {
  subType: "free_use" | "collateral";
  // 단일기간 (기존 — 무변경)
  propertyValue?: number;
  loanAmount?: number;
  actualInterestPaid?: number;
  isRelatedParty: boolean;
  hasJustifiableReason?: boolean;
  // 다기간 (G2/G3) — undefined=단일 / [...]=다기간 (빈 []는 validate 차단)
  periods?: FreeUsePeriod[];
  // 경정청구 (G1)
  rectification?: RectificationInput;
}

export interface FreeUsePeriod {
  startDate: string;            // ISO. 이 window 개시일(=증여일). free_use 5년·collateral 1년 단위
  propertyValue?: number;       // free_use: window 증여일 기준 §4장 평가가액
  loanAmount?: number;          // collateral
  actualInterestPaid?: number;  // collateral
}

export interface RectificationInput {
  giftTaxCalculated: number;    // 증여세 산출세액(§57 세대생략 할증 가산 포함) — 직접입력
  giftDate: string;             // ISO. 당초 증여일(=무상사용/담보 개시일)
  terminationDate: string;      // ISO. 중단사유 발생일(소유자 사망·토지 양도 등 §81⑥)
}
```

> 날짜 = ISO 문자열(증여세 컨벤션, date-coerce N/A). 분모(60/12)는 `subType`으로 도출 — RectificationInput에 분모 미보관(단일 진실).

## 3. 결과 타입 (`DeemedGiftResult` 확장)

```ts
periodBreakdown?: {            // plain 배열 (Map 금지)
  index: number;
  giftDate: string;           // window 증여일
  baseValue: number;          // free_use 부동산가액 / collateral 차입금
  benefit: number;            // free_use 5년 현가합 / collateral 차입이익
  applied: boolean;           // 기준금액(1억/1천만) 충족
}[];
rectification?: {             // plain 객체 (Map 금지)
  giftTaxCalculated: number;  // echo
  expiryDate: string;         // giftDate + 5년/1년
  remainingMonths: number;    // max(0, 역산 월수; 1개월 미만 일수→1)
  totalMonths: number;        // 60(free_use) / 12(collateral)
  refundableTax: number;      // floor(산출세액 × remainingMonths/totalMonths) — "경정청구 가능 세액"
  steps: CalculationStep[];   // 결과뷰 산식: 산출세액·잔여월/기간월·경정세액 (lawRef: §79②1호·§81⑨)
};
```

## 4. 알고리즘

### 4.1 다기간 (M-U / M-C)
```
if (periods?.length) {
  const breakdown = [];
  for (const [i, p] of periods.entries()) {
    // 기존 단일계산 함수를 window 단위로 재위임 (현가합/차입이익 + 기준금액 판정)
    const r = calcSinglePeriod(subType, p);   // free-realestate-use 내부 추출 헬퍼
    breakdown.push({ index:i, giftDate:p.startDate, baseValue:r.base, benefit:r.benefit, applied:r.applied });
  }
  periodBreakdown = breakdown;
  // ⚠️ Critical: 각 window는 별개 증여일의 **별개 증여** → 합산 금지(합산 시 누진세율 세액 과대).
  //    세액연결(grossGiftValue 단발주입)용 deemedGiftValue = **첫 window(=현재 증여)** 고정.
  //    첫 window가 기준금액 미달이면 0(현재 증여 과세제외). 후속 window는 미래 별건 →
  //    find(applied)로 후속을 집으면 '미래 증여를 현재로' 연결하는 오류 → breakdown[0]만 사용.
  deemedGiftValue = breakdown[0]?.applied ? breakdown[0].benefit : 0;
}
```
- `calcSinglePeriod`: 현재 `calcFreeRealEstateGift` 본문의 현가합/차입이익 계산을 **순수 헬퍼로 추출**(기존 단일 경로도 이 헬퍼 재사용 → dual-truth 회피, 회귀 0).
- window별 증여일 자동 도출(startDate 미입력 시): `addYears/addMonths(firstStart, unit*i)`.

### 4.2 경정청구 (R-U / R-C)
```
totalMonths = subType==="free_use" ? 60 : 12      // collateral 12 = §81⑤(§27⑤후단 1년) 도출·COL-RECT-1~3 검증
expiryDate  = subType==="free_use" ? addYears(giftDate,5) : addYears(giftDate,1)
diff        = differenceInMonths(expiryDate, terminationDate)   // date-fns 4.1.0
residual    = addMonths(terminationDate, diff) < expiryDate     // 1개월 미만 일수
remainingMonths = Math.max(0, residual ? diff+1 : diff)
refundableTax   = safeMultiplyThenDivide(giftTaxCalculated, remainingMonths, totalMonths)  // floor(a×b/c)
```
- 정수경로 검증: `floor(55,815,740 × 20 / 60) = 18,605,246` ✓ (image4, 실측).
- 음수 가드: terminationDate ≥ expiryDate → `diff≤0` → `max(0,..)=0`.

## 5. 정수 연산 (CLAUDE.md)
- 현가합: `safeMultiplyThenDivide(annual, 10**n, 11**n)` (기존 유지).
- 경정 비율: `safeMultiplyThenDivide(tax, rem, total)` — `a×b < 2^53`(55.8M×20=1.1G) 안전, 그래도 BigInt fallback 보유.
- `Math.round` 금지. 부동소수 월수 금지(date-fns 정수 월).

## 6. 동기화 지점 (엔진측)
- legal-codes: `GIFT.FREE_REALESTATE` 재사용. 경정 근거 신규 상수 `GIFT.RECTIFICATION_79_2 = "상증법 §79②1호"` + `GIFT.RECTIFICATION_FORMULA_81_9 = "상증령 §81⑨"` 추가(legal-codes/inheritance-gift.ts). rectification.steps의 lawRef에 사용.
- router(`router.ts:34`): 시그니처 무변경(`calcFreeRealEstateGift(input)`).
- 상수(`data/gift-deemed-rates.ts`): `RECT_MONTHS_FREE_USE=60`, `RECT_MONTHS_COLLATERAL=12` 추가(매직넘버 제거).

## 7. anchor (Pre-Do 우선)
| ID | 입력 | 기대 | 검증 |
|---|---|---|---|
| FRE-MULTI-1 | 50억×2 window(동일) | periodBreakdown[0].benefit=[1].benefit=379,078,675 / **deemedGiftValue=379,078,675(첫 window만, 합산 아님)** | 현가합·합산금지 |
| FRE-MULTI-2 | window2 1.2억 | 현가합 9,097,887 < 1억 → applied=false | node 실측✓ |
| RECT-1 | 55,815,740 / 2020-03-15 / 2023-07-20 / free_use | 18,605,246 | image4·date-fns 실측✓ |
| RECT-2 | 중단 2025-04-01 ≥ 만료 2025-03-15 | 0 | 음수가드 실측✓ |
| RECT-3 | 2020-01-10 / 중단 2024-06-05 | 잔여 8개월 → floor(tax×8/60) | date-fns 실측✓ |
| S-U/S-C/F-1 | (기존 입력) | 기존값 동일 | 회귀 0 |
| COL-RECT-1·2·3 | 담보 경정(분모 12) | 25,000,000(6/12)·0·29,166,666(7/12) | ✅ §81⑤ 도출·실측 |

## 8. 회귀 불변식
- `periods` undefined & `rectification` undefined → **기존 코드 경로·출력 비트 동일**. 기존 `__tests__/tax-engine/gift-deemed/` 전체 green 유지가 머지 게이트.
