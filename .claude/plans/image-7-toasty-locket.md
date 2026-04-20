# 공익사업 수용 감면(조특법 §77) 감면세액 산식 정정

## Context

이미지 제시 사례를 검증한 결과, 현재 구현은 **산출세액 × 가중평균 감면율** 방식(=12,098,394원)이지만, 법령이 요구하는 정식 산식은 **양도소득금액 안분 → 자산별 기본공제(감면율 낮은 순서) → 감면대상소득금액 / 과세표준 비율로 산출세액 안분** 방식(=**12,125,580원**)입니다. 차이는 27,186원이지만 법적 근거(소득세법 §103②) 미반영이 핵심 결함입니다.

### 이미지 정답 산식 (3단계)

```
① 양도소득금액을 보상액 비율로 안분
   현금분소득 = floor(양도소득금액 × 현금보상 / 총보상)
             = floor(290,841,229 × 168,287,470 / 560,287,470) = 87,356,825
   채권분소득 = 양도소득금액 − 현금분소득
             = 290,841,229 − 87,356,825 = 203,484,404

② 기본공제를 감면율 낮은 자산(현금 10% < 채권 15%)에서 먼저 차감 (§103②)
   현금 감면금액 = (87,356,825 − 2,500,000) × 0.10 = 8,485,682
   채권 감면금액 = 203,484,404 × 0.15 = 30,522,660
   감면대상소득금액 = 8,485,682 + 30,522,660 = 39,008,342

③ 감면세액 = 산출세액 × 감면대상소득금액 / 과세표준
            = 89,629,667 × 39,008,342 / 288,341,229 = 12,125,580
```

## 데이터 흐름 (사전 조사 완료)

현재 `lib/tax-engine/transfer-tax.ts` 내 필요한 값 모두 확보:

| 변수 | 라인 | 값(이미지) | 설명 |
|---|---|---|---|
| `taxableGain` | 1329, 1351 | 290,841,229 | 양도차익 − 장특공제 (= 양도소득금액) |
| `basicDeduction` | 1379 | 2,500,000 | 실제 적용된 기본공제 (연간 한도 내) |
| `taxBase` | 1398 | 288,341,229 | `taxableGain − longTermDed − basicDeduction` (천원 절사 없음) |
| `taxResult.calculatedTax` | — | 89,629,667 | 산출세액 |

다건 양도(`transfer-tax-aggregate.ts`)는 건별로 `calculateTransferTax()`를 호출하므로 **단건 수정만으로 자동 전파**됨.

## 수정 범위

### 1) `lib/tax-engine/public-expropriation-reduction.ts` (Pure Engine)

**Input 확장**
```ts
interface PublicExpropriationReductionInput {
  cashCompensation: number;
  bondCompensation: number;
  bondHoldingYears?: 3 | 5 | null;
  businessApprovalDate: Date;
  transferDate: Date;
  calculatedTax: number;
  transferIncome: number;    // NEW — 양도소득금액 (= taxableGain)
  basicDeduction: number;    // NEW — 실제 적용된 기본공제
  taxBase: number;           // NEW — 과세표준 (분모)
}
```

**Result 확장** (breakdown에 세부 필드 추가)
```ts
breakdown: {
  cashRate, bondRate,
  cashAmount, bondAmount,
  cashIncome: number;        // NEW — 현금분 감면소득금액
  bondIncome: number;        // NEW — 채권분 감면소득금액
  basicDeductionOnCash: number;  // NEW — 현금에 배정된 기본공제
  basicDeductionOnBond: number;  // NEW — 채권에 배정된 기본공제
  cashReduction: number;     // = floor((cashIncome − basicOnCash) × cashRate)
  bondReduction: number;     // = floor((bondIncome − basicOnBond) × bondRate)
  reducibleIncome: number;   // NEW — 감면대상소득금액 (cash+bond)
}
```

**산식 교체** (`calculatePublicExpropriationReduction`)
```
1. 보상액 안분
   totalComp = cash + bond
   cashIncome = safeMultiplyThenDivide(transferIncome, cash, totalComp)
   bondIncome = transferIncome − cashIncome

2. 기본공제 배분 (낮은 감면율 자산 우선)
   lowRateIsCash = cashRate < bondRate
   낮은쪽 소득 ≥ basicDeduction → 전액 낮은쪽
   낮은쪽 소득 < basicDeduction → 낮은쪽에 소득만큼 + 나머지 높은쪽
   cash만 있음 → 전액 cash, bond만 있음 → 전액 bond

3. 자산별 감면액
   cashReduction = floor(max(0, cashIncome − basicOnCash) × cashRate)
   bondReduction = floor(max(0, bondIncome − basicOnBond) × bondRate)
   reducibleIncome = cashReduction + bondReduction

4. 감면세액
   rawReduction = floor(calculatedTax × reducibleIncome / taxBase)  // safeMultiplyThenDivide
   reductionAmount = min(rawReduction, ANNUAL_LIMIT, calculatedTax)

5. 방어: taxBase ≤ 0 → isEligible=false
```

**재사용**: `applyRate`, `safeMultiplyThenDivide`, 기존 `ANNUAL_LIMIT` / `LEGACY_*` 상수 / `PUBLIC_EXPROPRIATION_RATES` 그대로.

### 2) `lib/tax-engine/transfer-tax.ts`

- `calcReductions()` 시그니처에 `transferIncome`, `basicDeduction`, `taxBase` 3개 인자 추가
- STEP 8 호출부(약 1423라인)에서 해당 로컬 변수 전달
- R-5 분기 내부에서 `calculatePublicExpropriationReduction` 호출 시 3개 인자 전파
- 기존 R-1~R-4(기타 감면 엔진)는 영향 없음

### 3) `components/calc/results/TransferTaxResultView.tsx`

§77 breakdown 카드에 추가 표시:
- 양도소득금액 안분: "현금분 소득 87,356,825 / 채권분 소득 203,484,404"
- 기본공제 배정: "현금분에서 기본공제 2,500,000 차감 (§103②, 감면율 낮은 자산 우선)"
- 자산별 감면금액: "현금 감면 8,485,682 / 채권 감면 30,522,660"
- 감면대상소득금액 39,008,342 / 과세표준 288,341,229 표시
- 가중율 표시는 유지하되 `weightedRate = reductionAmount / calculatedTax` (표시 전용)

### 4) 테스트 앵커 갱신

**`__tests__/tax-engine/public-expropriation-reduction.test.ts`**
- R77-1~R77-4 (단일 보상 케이스): 기본공제 0 또는 소득 전체에서 차감 후 검증
- **R77-5 (이미지 사례 원단위)**: 
  - `cashIncome = 87_356_825`
  - `bondIncome = 203_484_404`
  - `basicDeductionOnCash = 2_500_000`
  - `cashReduction = 8_485_682`
  - `bondReduction = 30_522_660`
  - `reducibleIncome = 39_008_342`
  - `rawReductionAmount = 12_125_580` (산출세액 89,629,667 × 39,008,342 / 288,341,229)
  - `reductionAmount = 12_125_580`
- R77-7 (한도 capping): `transferIncome`·`taxBase`·`basicDeduction`를 capping 발생하도록 조정
- R77-8 (입력 유효성): `transferIncome ≤ 0` 또는 `taxBase ≤ 0` 시 비적격 분기 추가

**`__tests__/tax-engine/transfer-tax.test.ts` — T-IMG-1 스냅샷**
- `reductionAmount: 12_098_394` → **`12_125_580`**
- `determinedTax: 77_531_273` → **`89_629_667 − 12_125_580 = 77_504_087`**
- `totalTax: 85_284_273` → 지방소득세 재계산 (`결정세액 × 10% 천원절사` + 결정세액)
  - 지방세 = truncateToThousand(77,504,087 × 0.10) = 7,750,000
  - totalTax = 77,504,087 + 7,750,000 = **85,254,087**

T-IMG-2 (부칙 §53 경계)는 `useLegacyRates` 분기 + `cashRate` 검증만 하므로 새 필드 영향 없음 (유지).

## 검증 방법

1. **단위**: `npx vitest run __tests__/tax-engine/public-expropriation-reduction.test.ts` — R77-5 포함 전 케이스 통과
2. **통합**: `npx vitest run __tests__/tax-engine/transfer-tax.test.ts -t "T-IMG"` — 앵커 8/8
3. **다건 전파 확인**: `npx vitest run __tests__/tax-engine/transfer-tax-aggregate.test.ts` (만약 §77 시나리오 존재) — 회귀 0
4. **타입**: `npx tsc --noEmit` EXIT=0
5. **전체 회귀**: `npx vitest run` — 1299 (현재) → 1299 (신규 필드는 기존 테스트 통과, 앵커 갱신만)
6. **UI 수동 확인**: `npm run dev` → `/calc/transfer` → 임야 수용 시나리오 입력 → 결과 카드에 "현금분 87,356,825 / 채권분 203,484,404 / 감면대상 39,008,342" 노출, 결정세액 77,504,087 확인

## 범위 외 (후속 과제)

- **다건 양도 §103② 완전 구현**: 현재 단건 엔진은 "감면자산 외 소득이 있을 때 그쪽에서 기본공제 먼저"를 모름(스코프가 단건). 다건에서 이를 구현하려면 `transfer-tax-aggregate.ts`의 기본공제 배분 로직(라인 251-270)에서 감면 자산 여부를 고려해야 함 → 별도 티켓
- 조특법 §133 5년 누적 3억 한도 (현재 1년 2억 capping만 구현)
- 환지·잔여지 특례 §77의2 이후
