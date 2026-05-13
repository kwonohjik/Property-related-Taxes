# 사례 35 — 주택을 상가로 용도변경 (LTHD 기산일 이동) — 엔진 설계

> 본 문서는 사례 35의 **엔진 측 설계**만 다룬다. UI 설계는 `case-35-house-to-commercial.ui.design.md`(별도) 참조.
> 작성일: 2026-05-13
> 작성자: transfer-tax-senior
> PDCA 단계: Design
> 선행 완료: 사례 31(일반건물 환산), 사례 32(신축 단기양도), 사례 33(증축 3-asset), 사례 34(부담부증여)

---

## Context

**갑氏 2주택자(조정대상지역)** 가 A주택을 상가로 용도변경 후 양도. 다주택 상태에서 용도변경이 이루어진 경우, 변경일 전 기간은 장기보유특별공제(LTHD) 보유기간에서 배제된다.

본 사례(PDF p.539–544)의 핵심:
- 취득일 2008-05-02, 변경일 2020-08-07, 양도일 2023-02-19
- 변경일 ~ 양도일 ≈ 2년 6개월 → **만 2년 → 3년 미만 → 장특공제 0%**
- 양도일(2023-02-19)이 중과배제기간(2022-05-10 ~ 2024-05-09) 내 → 기본 누진세율 적용

사례 31~33과의 차이: 새 자산 카드 구조·안분 로직 없음. **`calcLongTermHoldingDeduction` 에서 `acquisitionDate` 대신 `conversionDate`를 보유기간 기산점으로 교체하는 1개 분기만 추가**.

---

## ★ 케이스 인벤토리 (필수 — 비어 있으면 Do 단계 진입 금지)

| # | 시나리오 | 변환 토글 | wasMultiHouse | LTHD 기산일 | 기대 LTHD | anchor 출처 | 상태 |
|---|---|---|---|---|---|---|---|
| 35-1 | **PDF 메인** — 다주택 + 중과배제기간 양도 | ON | true | 변경일(2020-08-07) | **0** (만 2년, 3년 미만) | 양도코리아 PDF p.539–544 | ☐ TODO |
| 35-2 | 1주택 케이스 — 변경일 무시, 당초 취득일 기산 14년 | ON | false | 취득일(2008-05-02) | **28%** (표1 14년×2%) | §95② 별표1 직접 계산 | ☐ TODO |
| 35-3 | 다주택 케이스 — conversionDate=2015-01-01, transferDate=2020-01-15 → years=5 | ON | true | conversionDate | **10%** (표1 5년×2%) | §95② 별표1 직접 계산 | ☐ TODO |
| 35-4 | validate 차단 — houseToCommercialConversion=true ∧ conversionDate 누락 | ON | any | — | 오류 반환 | 정책 `feedback_no_silent_apportion_fallback.md` | ☐ TODO |
| 35-5 | **경계값 ★** — 다주택 + 변경일 기준 만 3년 0일 | ON | true | 변경일 기준 | **6%** (표1 정확히 3년→진입) | §95② 표1 3년 경계 가드 | ☐ TODO |
| 35-6 | **(skip)** 다주택 + 중과배제기간 직전(2022-05-09) 양도 → 중과세율 적용 | ON | true | 변경일 | 중과세율 분기 | 본 PR 범위 밖 — 후속 PR | ☐ SKIP |
| 35-7 | 변경일 무시 보장 — 1주택 + conversionDate 설정, 당초 취득일 우선 | ON | false | 취득일 | 14년 기준 LTHD | 변경일 영향 zero 회귀 가드 | ☐ TODO |

**규칙 준수**: 행 7개 enumerate 완료 — Do 단계 진입 조건 충족. 35-6은 `.skip` 마킹 후 후속 PR 트리거 주석 필수.

---

## 법령 근거

```
소득세법 §95② — 장기보유특별공제 (별표1·별표2 보유기간 구간별 공제율)
소득세법 §103 — 양도소득 기본공제 연 250만원
소득세법 §104①1호 — 세율 (누진세율표 8구간 자체 규정; 구조상 §55 종합소득세 세율과 동일하나 §55 준용 아님, 중과세율)

소득세법 집행기준 99-164-10 — 주택에서 상가로 용도변경 시 취득가액 환산 산정 기준
  → 취당 환산주택가격 = 최초공시주택가격 × (취득시 토지+건물 기준시가) / (최초공시 당시 토지+건물 기준시가)
  → 본 PR에서는 실가 보유 케이스만 다룸. 환산 분기는 후속 PR.

서울행정법원 2012구단26961 (2013.04.24) — 다주택자가 주택을 근린생활시설로 용도변경 후 양도 시
  변경일 전 기간은 장특공제 배제. 변경일부터 보유기간 기산.

사전법령해석재산 2021-939 (2021.11.08) — 동일 취지 확인.

사전법규재산 2022-684 (2022.11.28)
사전법규재산 2022-881 (2022.12.28) — 조정대상지역 다주택자가 중과배제기간 중 양도 시
  장특공제 보유기간 기산일 = 용도변경일.
```

**법령 조문 상수 (단일 source)**: 신규 상수는 `lib/tax-engine/legal-codes/transfer.ts`의 `TRANSFER` 객체에 추가.

```ts
// lib/tax-engine/legal-codes/transfer.ts 에 추가할 상수
export const TRANSFER = {
  // ... 기존 상수
  HOUSE_TO_COMMERCIAL_LTHD_START: "사전법규재산 2022-684·881, 서울행법 2012구단26961",
} as const;
```

**중과배제기간 윈도우 상수 (single source of truth)**:
`lib/tax-engine/legal-codes/transfer.ts`에 `SURCHARGE_EXCLUSION_WINDOW` 단독 export로 정의 (TRANSFER 객체에 별도 START/END 필드 중복 금지 — 본 상수만이 단일 source).
Do 단계에서 **본 PR에서 한 번에** 아래 2곳 하드코딩 날짜를 상수로 치환한다 (별도 PR로 미루지 않음):
- `lib/tax-engine/multi-house-surcharge-helpers.ts` line 613: `new Date("2022-05-10")`
- `lib/tax-engine/acquisition-surcharge/multi-house.ts` line 312: `new Date("2022-05-10")`

Do 단계 진입 전 `grep -rn "2022-05-10\|2024-05-09" lib/tax-engine/` 으로 전체 하드코딩 위치 재확인 후 일괄 치환.

```ts
// lib/tax-engine/legal-codes/transfer.ts
// 근거: 조세특례제한법 시행령 §167조의3 (대통령령 제32672호, 2022-05-31 개정)
// 다주택자 양도소득세 중과 한시적 배제 (2022-05-10 ~ 2024-05-09)
export const SURCHARGE_EXCLUSION_WINDOW = {
  start: "2022-05-10",
  end: "2024-05-09",
} as const;
```

> 주의: `scripts/seed-transfer-tax-rates-historical.ts`의 `suspended_until` 값은 법령 개정으로 연장될 수 있는 DB 값이며 별개. 상수는 원 조특법 시행령의 입법 원래 종료일 기준.

---

## 엔진 input 타입 — 신규 필드 3개

신규 필드는 `lib/tax-engine/types/transfer.types.ts`의 `TransferTaxInput` 에 추가.
`GeneralBuildingInput`(`general-building-valuation.ts`)에는 **추가하지 않음** — 이 필드들은 단건 엔진(`transfer-tax.ts`) STEP 4 진입 직전 LTHD 기산일 결정에서만 쓰인다.

```ts
// lib/tax-engine/types/transfer.types.ts — TransferTaxInput 에 추가 (optional)

/**
 * 주택 → 상가 용도변경 여부.
 * true + wasMultiHouseAtConversion=true → LTHD 기산일을 conversionDate로 이동.
 * propertyType="general_building" 에서만 유효.
 */
houseToCommercialConversion?: boolean;

/**
 * 용도변경일 (해당 부동산 건축물대장 변경일).
 * houseToCommercialConversion=true 시 필수.
 * LTHD 보유기간 기산점 후보 — wasMultiHouseAtConversion=true일 때만 실제 기산점으로 사용.
 */
conversionDate?: Date;

/**
 * 용도변경 당시 다주택자(조정대상지역 중과대상) 여부.
 * true → conversionDate를 LTHD 기산일로 사용.
 * false → 당초 acquisitionDate 기산일 유지 (1주택 케이스).
 */
wasMultiHouseAtConversion?: boolean;
```

**폼 상태(AssetForm) 필드명 단일 source** (UI 시니어가 이 이름으로 폼·Zod·API 변환·validation을 동기화):

| AssetForm 필드 | 타입 | TransferTaxInput 매핑 |
|---|---|---|
| `gbHouseToCommercialConversion` | `boolean` | `houseToCommercialConversion` |
| `gbConversionDate` | `string` (YYYY-MM-DD) | `conversionDate` (toOptionalDate 변환) |
| `gbWasMultiHouseAtConversion` | `boolean` | `wasMultiHouseAtConversion` |

---

## 엔진 result 타입 — `lthdStartDate` 필드 추가

기존 `TransferTaxResult.longTermDeduction` / `longTermRate` / `holdingPeriod` 재사용.
LTHD 기산일이 변경일로 이동하면 보유연수가 줄고 자동으로 0%가 산출됨.

**신규 필드 추가 (본 PR 필수)**:

```ts
// lib/tax-engine/types/transfer.types.ts — TransferTaxResult 에 추가
/**
 * 장기보유특별공제 보유기간 실제 기산일.
 * - 기본값: acquisitionDate (용도변경 미적용 시)
 * - 다주택 용도변경 적용 시: conversionDate
 * UI ⑦ 결과 카드에서 `result.lthdStartDate !== input.acquisitionDate` 비교로
 * override 여부를 자가 판정 후 "보유기간 기산일: 용도변경일" 안내 표시에 사용.
 */
lthdStartDate: Date;
```

`lthdStartDateOverrideReason?: string` 문자열 필드는 추가하지 않음 — `lthdStartDate`와 `acquisitionDate` 비교만으로 UI 자가 판정 가능.

---

## 계산 알고리즘 — STEP 단위

### STEP 0: 전처리 (기존)

- `propertyType="general_building"` 진입 시 `buildGeneralBuildingAssetCards()` 호출 → 자산 카드 2~3장 생성.
- 카드별 단건 엔진(`calcTransferTax`) 진입. 본 사례는 사용자가 취득가액 실가 입력 → 카드 2장(토지/건물).

### STEP 4 직전: `resolveLTHDStartDate()` 호출 — **신규 함수**

`transfer-tax-helpers.ts`에 순수 함수로 추가:

```ts
/**
 * 장기보유특별공제 보유기간 기산일 결정.
 *
 * 사전법규재산 2022-684·881 / 서울행법 2012구단26961:
 * - 다주택 상태에서 주택을 상가로 용도변경한 경우, 변경일 이전 기간은 LTHD 배제.
 * - 1주택 상태 용도변경은 당초 취득일 기산.
 *
 * 주의: 이 함수는 acquisitionDate를 교체하는 것이 아니라
 *       calcLongTermHoldingDeduction에서만 사용되는 "보유기간 기산점"을 반환한다.
 *       취득가액·양도차익 계산에는 영향 없음.
 */
export function resolveLTHDStartDate(input: TransferTaxInput): Date {
  if (!input.houseToCommercialConversion) {
    return input.acquisitionDate;            // ① 미적용 → 당초 취득일
  }
  if (!input.wasMultiHouseAtConversion) {
    return input.acquisitionDate;            // ② 1주택 케이스 → 당초 취득일 (변경일 무시)
  }
  // ③ 다주택 케이스 → 변경일 기산 (conversionDate 필수 — validate에서 보장)
  return input.conversionDate!;
}
```

### STEP 4: 장기보유특별공제 — 기산일 교체 + result 필드 emit

`calcLongTermHoldingDeduction` 내 단일 취득일 케이스(line 596 부근):

```ts
// 기존:
// const holding = calculateHoldingPeriod(input.acquisitionDate, input.transferDate);

// 변경 후:
const lthdStartDate = resolveLTHDStartDate(input);
const holding = calculateHoldingPeriod(lthdStartDate, input.transferDate);
```

엔진 최종 result 조립 시 `lthdStartDate` 필드 emit:

```ts
// transfer-tax.ts 또는 transfer-tax-finalize.ts 결과 객체에 추가
lthdStartDate: resolveLTHDStartDate(input),
```

**핵심**: `acquisitionDate`는 건드리지 않는다. 취득가액·양도차익·LTHD 이외 모든 계산은 원래 `acquisitionDate` 사용.

**사례 31~34와의 정합성**: `houseToCommercialConversion` 미설정 시 `resolveLTHDStartDate`가 `acquisitionDate`를 반환하므로 `lthdStartDate === acquisitionDate`. 기존 anchor 동작 100% 보존. `calculateHoldingPeriod`는 §95④ "취득일부터 양도일까지"를 초일불산입(민법 §157)으로 구현 — 사례 31~34에서 동일 방식 사용.

### STEP 4 이후: 3년 미만 처리

별도 early-return 분기 추가 금지. 기존 `rateForYears(years)` 헬퍼가 `years < 3 → return 0`을 이미 처리. `resolveLTHDStartDate`가 변경일을 반환하면 보유연수가 자동으로 줄고 3년 미만 시 0%가 산출된다.

---

## §95② 표1 라우팅 — 회귀 보장

`propertyType="general_building"` 자산은 양도 시점 기준 **비주택(상가)**이므로:
- 1세대1주택 여부(`isOneHouseSingle`) = false → 표1(일반, 연 2%, 최대 30%) 자동 라우팅.
- 표2(1세대1주택 최대 80%) 진입 조건 미충족 → 기존 `rateForYears` 로직 그대로 유지.

본 PR은 표 라우팅 코드를 건드리지 않으므로 사례 31~33 anchor가 그대로 통과해야 한다. Do 단계에서 `npx vitest run __tests__/tax-engine/transfer-tax/` 전체 회귀 0건 필수.

---

## 중과배제기간 + LTHD 연산 (35-1 PDF 메인 케이스 상세)

```
취득일:   2008-05-02
변경일:   2020-08-07
양도일:   2023-02-19

LTHD 기산일 결정:
  houseToCommercialConversion = true
  wasMultiHouseAtConversion   = true
  → lthdStartDate = conversionDate = 2020-08-07

보유연수 계산 (calculateHoldingPeriod 초일불산입):
  2020-08-08 (기산일 다음날) ~ 2023-02-19
  = 2년 6개월 ≈ 만 2년 → years = 2

표1 공제율: rateForYears(2) → 2 < 3 → 0%
장기보유특별공제 = 0원  ← PDF anchor

세율 경로:
  propertyType = general_building (비주택 일반 세율)
  isSurcharge = false (중과 미적용 — isSurchargeSuspended 또는 非조정지역 상가 기준)
  양도일 2023-02-19 ≤ suspended_until → 일반 누진세율 적용

과세표준 산출:
  양도가액      800,000,000
- 취득가액      400,000,000
- 필요경비             0
= 양도차익     400,000,000
- LTHD                 0
= 양도소득금액  400,000,000
- 기본공제       2,500,000
= 과세표준     397,500,000  (천원 미만 절사 없음 — 397,500,000 이미 천원 단위)

누진세율 (2023년 §104①1호 — 구조상 §55와 동일하나 §55 준용 아님):
  397,500,000 → 3억~5억 구간: 세율 40%, 누진공제 25,940,000
  산출세액 = floor(397,500,000 × 0.40) - 25,940,000
           = 159,000,000 - 25,940,000
           = 133,060,000  ← PDF anchor ★

지방소득세 = floor(133,060,000 × 0.10)
           = floor(13,306,000.0)
           = 13,306,000  ← PDF anchor ★
```

---

## Anchor 테스트 명세

파일: `__tests__/tax-engine/transfer-tax/case-35-house-to-commercial.anchor.test.ts` (신규)

### 35-1: PDF 메인 케이스 (다주택 + 중과배제기간)

```ts
describe("사례 35-1: 주택→상가 용도변경 + 다주택 + 중과배제기간 양도 (PDF 메인)", () => {
  // 입력 fixture
  const input: Partial<TransferTaxInput> = {
    propertyType: "general_building",
    acquisitionDate: new Date("2008-05-02"),
    transferDate: new Date("2023-02-19"),
    transferPrice: 800_000_000,
    actualAcquisitionPrice: 400_000_000,
    expenses: 0,
    houseToCommercialConversion: true,
    conversionDate: new Date("2020-08-07"),
    wasMultiHouseAtConversion: true,
    // 중과배제기간(2022-05-10 ~ 2024-05-09) 내 양도
    // → isSurchargeSuspended = true → 일반 누진세율
  };

  it("양도차익", () => expect(result.capitalGain).toBe(400_000_000));
  it("장기보유특별공제 = 0", () => expect(result.longTermDeduction).toBe(0));        // ★ PDF anchor
  it("양도소득금액", () => expect(result.taxableIncome).toBe(400_000_000));
  it("기본공제", () => expect(result.basicDeduction).toBe(2_500_000));
  it("과세표준", () => expect(result.taxBase).toBe(397_500_000));
  it("산출세액", () => expect(result.calculatedTax).toBe(133_060_000));              // ★ PDF anchor
  it("지방소득세", () => expect(result.localIncomeTax).toBe(13_306_000));            // ★ PDF anchor
});
```

### 35-2: 1주택 케이스 — 당초 취득일 기산 14년 = 28%

```
입력:
  acquisitionDate = 2008-05-02
  transferDate    = 2023-02-19  (만 14년: 초일불산입 기산 → years=14)
  houseToCommercialConversion = true
  wasMultiHouseAtConversion   = false        ← 1주택
  conversionDate = 2020-08-07 (있어도 무시)

LTHD 기산일: acquisitionDate (1주택 분기)
보유연수: calculateHoldingPeriod(2008-05-02, 2023-02-19)
  = 2008-05-03 ~ 2023-02-19 = 14년 9개월 → years = 14

rateForYears(14) = min(14 × 0.02, 0.30) = 0.28 → 28%

expect(lthdRate).toBe(0.28)
expect(longTermDeduction).toBe(applyRate(taxableGain, 0.28))
```

### 35-3: 다주택 케이스 — 변경일 기산 5년 = 10%

```
입력:
  acquisitionDate = 2010-01-01
  conversionDate  = 2015-01-01      ← 기산일
  transferDate    = 2020-01-15      ← conversionDate 기준 5년 이상 충족
  houseToCommercialConversion = true
  wasMultiHouseAtConversion   = true

LTHD 기산일: conversionDate = 2015-01-01
보유연수: calculateHoldingPeriod(2015-01-01, 2020-01-15)
  기산: 2015-01-02 (초일불산입) ~ 2020-01-15 = 5년 13일 → years = 5

rateForYears(5) = min(5 × 0.02, 0.30) = 0.10

expect(lthdRate).toBe(0.10)                // ★ anchor
```

<!-- 구버전 시나리오 강등 (수치 혼선 방지 — anchor로 사용하지 않음):
  conversionDate = 2015-01-02, transferDate = 2020-01-02 → years=4 → 8%
  → 초일불산입 보정 후 5년 미달하므로 8%가 맞으나 앵커 가독성 저하. 위 실용 앵커로 일원화.
-->

### 35-4: validate 차단

```ts
it("houseToCommercialConversion=true + conversionDate 누락 → 오류", () => {
  const errors = validateTransferTax({
    ...baseInput,
    gbHouseToCommercialConversion: true,
    gbConversionDate: "",             // 누락
    gbWasMultiHouseAtConversion: true,
  });
  expect(errors["gbConversionDate"]).toBeTruthy();
});
```

### 35-5: 경계값 ★ — 변경일 기준 만 3년 0일 = 6% 진입

```
// 기준일 = 기산일 + 3년 (date-fns differenceInYears 반환값 = 3 도달 시점)
// §95② 별표1: "3년 이상 4년 미만 → 6%" — 아래 날짜 쌍이 그 경계 진입을 정확히 검증

3년 "이상" 경계 진입 anchor:
  conversionDate = 2017-06-01
  transferDate   = 2020-06-02
  기산: 2017-06-02 (초일불산입) → 2020-06-02 = 3년 0일 → differenceInYears = 3
  rateForYears(3) = 0.06
  expect(lthdRate).toBe(0.06)   ← 표1 첫 진입 anchor ★

경계 미진입 (3년 미만 → 0%) anchor:
  conversionDate = 2017-06-01
  transferDate   = 2020-06-01
  기산: 2017-06-02 → 2020-06-01 = 2년 364일 → differenceInYears = 2
  rateForYears(2) = 0 (3년 미만)
  expect(lthdRate).toBe(0)      ← 3년 미만 0% 가드 anchor
```

### 35-6: skip 마킹 (중과세율 케이스 — 본 PR 범위 밖)

```ts
it.skip("35-6: 다주택 + 중과배제기간 직전(2022-05-09) 양도 → 중과세율 분기 [후속 PR]", () => {
  // transferDate = 2022-05-09 → suspended_until 2022-05-10 직전 → 중과세율 적용
  // TODO: 후속 PR — 중과 적용 케이스 + 장특공제 0 (중과 시 배제) 재확인
});
```

### 35-7: 1주택 케이스 변경일 무시 보장

```ts
it("35-7: wasMultiHouseAtConversion=false → acquisitionDate 기산, conversionDate 무영향", () => {
  // conversionDate를 양도일 직전으로 설정해도 lthdStartDate는 acquisitionDate 유지
  // resolveLTHDStartDate 분기 ② 회귀 가드
  expect(result.lthdStartDate).toEqual(input.acquisitionDate);
  // 35-2와 동일 입력: acquisitionDate=2008-05-02, holdingYears=14, lthdRate=0.28
});
```

---

## 14개 동기화 지점 — 엔진 측 항목

엔진 시니어 담당 항목만 명시. UI 측(①②③⑤⑥⑦⑧)은 UI 시니어 책임.

### ⑫ Zod 입력 객체 정의 (침묵 stripping 방지)

`app/api/calc/transfer/route.ts` 또는 관련 Zod 스키마 파일에서 단건 입력 객체에 추가:

```ts
// 기존 TransferTaxInput Zod 스키마에 추가 (침묵 stripping 방지)
houseToCommercialConversion: z.boolean().optional(),
conversionDate: z.string().optional(),          // YYYY-MM-DD 문자열
wasMultiHouseAtConversion: z.boolean().optional(),
```

미정의 시 Zod가 unknown key를 stripping → 엔진에 값이 전달되지 않음. TypeScript 미감지 영역.

### ⑭ Route handler 엔진 input 매핑 + Date 변환

`app/api/calc/transfer/route.ts`의 엔진 input 조립 부분:

```ts
// ⑭ Date 변환 필수 (lib/api/date-coerce.ts toOptionalDate 사용)
// new Date() 직접 호출 금지 — JSON 경유 후 string 도달 시 Date < string silent false 함정

houseToCommercialConversion: data.houseToCommercialConversion,
conversionDate: toOptionalDate(data.conversionDate),      // ← Date 변환 필수
wasMultiHouseAtConversion: data.wasMultiHouseAtConversion,
```

---

## 800줄 분할 사전 점검

| 파일 | 현재 | 예상 증가 | 예상 후 | 여유 | 분할 필요 |
|---|---:|---:|---:|---:|---|
| `transfer-tax-helpers.ts` | ~650 | +30 (resolveLTHDStartDate + 기산일 교체) | ~680 | 120줄 | 안전 |
| `transfer-tax.ts` | 800 | +5 (resolveLTHDStartDate 호출 1줄 + 결과 산식 보충) | ~805 | -5 | **경고** — ⑭ route 매핑 위치 따라 분할 신호 발동 가능. Do 단계 시작 전 확인 필수 |
| `lib/calc/transfer-tax-validate-gb.ts` | 184 | +20 (35-4 validate) | ~204 | 596줄 | 안전 |
| `lib/calc/transfer-tax-api-helpers.ts` | ~400 | +15 (③ normalize + ④ API 변환) | ~415 | 385줄 | 안전 |
| `lib/tax-engine/legal-codes/transfer.ts` | ~200 | +10 (SURCHARGE_EXCLUSION_WINDOW + HOUSE_TO_COMMERCIAL_LTHD_START) | ~210 | 590줄 | 안전 |

> **800줄 컷 회피 전략 (Do 진입 전 필수)**:
> 1. Do 시작 직전 `wc -l lib/tax-engine/transfer-tax.ts` 실행.
> 2. `resolveLTHDStartDate()` 함수 본체는 **반드시 `transfer-tax-helpers.ts`에 배치** — `transfer-tax.ts` 본류는 import + 호출 1~2줄만.
> 3. `lthdStartDate` result emit도 `transfer-tax-finalize.ts` 쪽에 배치하여 `transfer-tax.ts` 변경을 최소화.
> 4. 추가 후 `wc -l` 재확인 — 800줄 초과 시 추가 분리(orchestrator + helper) 선행 후 커밋.

---

## Silent fallback / 자동 안분 후보 식별

| 후보 | 처리 |
|---|---|
| `houseToCommercialConversion=true` + `conversionDate` 미입력 | validate ⑧에서 오류 차단 — fallback 금지 |
| `wasMultiHouseAtConversion` 미입력 | validate ⑧에서 오류 차단 (토글 ON 시 필수). 기본값 false silently 채우기 금지 |
| `conversionDate`가 `acquisitionDate`보다 이른 경우 | validate ⑧에서 오류 차단 ("용도변경일은 취득일 이후여야 합니다") |
| `conversionDate`가 `transferDate` 이후인 경우 | validate ⑧에서 오류 차단 ("용도변경일은 양도일 이전이어야 합니다") |

---

## 회귀 보호 — 사례 31~33 anchor

본 PR은 `calcLongTermHoldingDeduction` 단일 취득일 경로(line 596)의 기산점만 교체한다. 이 함수의 다른 분기(split, 일체과세, 장기임대, 1세대1주택 표2, 중과 배제)는 건드리지 않는다.

Do 단계에서 필수 실행:
```bash
npx vitest run __tests__/tax-engine/transfer-tax/general-building-case-31.test.ts
npx vitest run __tests__/tax-engine/transfer-tax/general-building-case-32.test.ts
npx vitest run __tests__/tax-engine/transfer-tax/general-building-extension-case-33.test.ts
```

사례 31~33에서는 `houseToCommercialConversion` 필드가 undefined → `resolveLTHDStartDate`가 `acquisitionDate`를 그대로 반환 → 기존 동작 100% 보존.

---

## 정책 적용 매트릭스

| # | 정책 메모리 | 본 설계 적용 |
|---|---|---|
| 1 | `feedback_no_silent_apportion_fallback.md` | conversionDate 미입력 시 자동 채우기 금지. validate에서 차단. |
| 2 | `feedback_useeffect_store_mirror_forbidden.md` | 변환 토글 ON/OFF 연동은 onChange 핸들러. UI 디자인 문서에 명시. |
| 3 | `feedback_transfer_year_tax_rate.md` | 산출세액(133,060,000)·지방세(13,306,000)는 §55 직접 계산 검증. 외부 PDF 산출값 추종 금지. |
| 4 | `feedback_validation_sync_8th_point.md` | validate도 동일 분기 인식: `gbHouseToCommercialConversion=true → gbConversionDate 필수 + gbWasMultiHouseAtConversion 필수`. |
| 5 | `feedback_api_zod_schema_sync.md` | ⑫ Zod 객체 3 필드 명시 + ⑭ route handler Date 변환. TypeScript 미감지 — grep 자가 점검 의무. |
| 6 | `feedback_no_yangdo_korea_brand.md` | anchor 시나리오명·변수명에 "양도코리아" 미사용. |
| 7 | `feedback_ui_input_path_enumeration.md` | 케이스 매트릭스 7행 enumerate 완료. 분기별 입력 가능 자가 시뮬 필수 (특히 35-7: 1주택+변경일 입력 조합). |

---

## 후속 PR 트리거

| # | 시나리오 | 참조 |
|---|---|---|
| 후속-1 | **환산취득가 분기 (§99-164-10·집행기준)** — 취득가액 불명 케이스. `general-building-valuation.ts`에 "주택→상가 용도변경" 환산 산식 추가. 취당 환산주택가격 = 최초공시주택가격 × (취득시 기준시가) / (최초공시 당시 기준시가). | Plan §9 후속-1 |
| 후속-2 | **중과배제기간 미적용 케이스** — 다주택 + 조정대상 + 중과배제기간 外 양도(예: 2022-05-09 이전). 중과세율 + 장특공제 0 복합 검증. | 케이스 35-6 skip |
| 후속-3 | **세대원 주택 수 자동 판정** — `wasMultiHouseAtConversion` 현재 수동 토글. 향후 세대원 주택 수 데이터 자동 도출. | Plan §9 후속-3 |
| ~~후속-4~~ | ~~SURCHARGE_EXCLUSION_WINDOW 상수 통합~~ → **본 PR 포함으로 확정**. Do 단계에서 한 번에 치환: `multi-house-surcharge-helpers.ts` line 613 + `acquisition-surcharge/multi-house.ts` line 312. 별도 PR 금지. | §법령근거 섹션 참조 |

---

## UI 통합 위임

UI 측 14개 동기화 지점 중 ①②③⑤⑥⑦⑧는 `case-35-house-to-commercial.ui.design.md`(별도)에 정의.
엔진 시니어가 확정한 인터페이스:

| 동기화 지점 | 내용 |
|---|---|
| ① 폼 상태 타입 | `AssetForm`에 `gbHouseToCommercialConversion`, `gbConversionDate`, `gbWasMultiHouseAtConversion` 3필드 추가 |
| ② initial state | `gbHouseToCommercialConversion: false`, `gbConversionDate: ""`, `gbWasMultiHouseAtConversion: false` |
| ③ normalize | `gbHouseToCommercialConversion=false` 시 `gbConversionDate`, `gbWasMultiHouseAtConversion` 무시 |
| ⑤ UI 위젯 | `ToggleCard`(gbHouseToCommercialConversion) → `DateInput`(gbConversionDate) + `RadioCardGroup`(gbWasMultiHouseAtConversion) |
| ⑥ 사이드바 | 영향 없음 (LTHD 금액 변화 → 기존 사이드바 합계가 자동 반영) |
| ⑦ 결과 카드 산식 | 장특공제 0원 시 "보유기간 기산일: 용도변경일(YYYY-MM-DD), 변경일~양도일 X년 = 3년 미만 → 0%" 표시 |
| ⑧ validate | `gbHouseToCommercialConversion=true` → `gbConversionDate` 필수 + `gbWasMultiHouseAtConversion` 필수 + 날짜 순서(acqDate ≤ convDate < transferDate) |
| ④ API 변환 | `lib/calc/transfer-tax-api-helpers.ts`에 3필드 → `GeneralBuildingInput` body 매핑 추가 |
| ⑨ Zod enum | 해당 없음 (boolean 필드) |
| ⑩ Zod 컴패니언 + refine | `gbHouseToCommercialConversion=true` 시 `conversionDate` 필수 refine |
| ⑪ acquisitionDate fallback | 변경 없음 |
| ⑫ Zod 입력 객체 | 엔진 설계 §14개 동기화 ⑫ 참조 |
| ⑬ callTransferTaxAPI body spread | `gbHouseToCommercialConversion`, `gbConversionDate`, `gbWasMultiHouseAtConversion` 3필드 포함 확인 |
| ⑭ Route handler | 엔진 설계 §14개 동기화 ⑭ 참조 + `toOptionalDate(data.conversionDate)` |

---

## Status

| 단계 | 상태 |
|---|---|
| 1. PM/Plan | ✅ 완료 (`docs/00-pm/case-35-house-to-commercial-conversion.plan.md`) |
| 2. Design (engine) | ✅ 본 문서 |
| 2. Design (UI) | ☐ TODO (`case-35-house-to-commercial.ui.design.md`) |
| 3. Do (engine senior) | ☐ TODO |
| 3. Do (UI senior) | ☐ TODO |
| 4. Check | ☐ TODO |
| 5. Act | ☐ TODO |
