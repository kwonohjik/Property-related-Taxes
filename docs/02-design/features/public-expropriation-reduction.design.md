# Design: 공익사업용 토지 수용 감면 (조특법 §77)

## 1. 파일 구조

```
lib/tax-engine/
├── public-expropriation-reduction.ts   (신규) — Pure Engine
├── transfer-tax.ts                      (수정) — R-5 분기 추가
├── non-business-land.ts                 (수정) — §168의14 분기 정밀화
└── legal-codes.ts                       (수정) — TRANSFER.§77 / §133 상수 추가
lib/api/
└── transfer-tax-schema.ts               (수정) — reductionSchema discriminatedUnion 확장
app/calc/transfer-tax/
└── TransferTaxCalculator.tsx            (수정) — 양도사유 단계 + 보상구성 입력 + 결과 카드
__tests__/tax-engine/
└── public-expropriation-reduction.test.ts (신규)
docs/04-report/
└── public-expropriation-reduction.report.md (Report 단계 생성)
```

## 2. Pure Engine (public-expropriation-reduction.ts)

```ts
export const PUBLIC_EXPROPRIATION_RATES = Object.freeze({
  CURRENT: { cash: 0.10, bond: 0.15, bond3y: 0.30, bond5y: 0.40 },
  LEGACY:  { cash: 0.20, bond: 0.25, bond3y: 0.40, bond5y: 0.50 },
});
export const ANNUAL_LIMIT = 200_000_000;
export const LEGACY_APPROVAL_CUTOFF = new Date("2015-12-31T23:59:59");
export const LEGACY_TRANSFER_CUTOFF = new Date("2017-12-31T23:59:59");

export interface PublicExpropriationReductionInput { /* §2-A */ }
export interface PublicExpropriationReductionResult { /* §2-B */ }

export function calculatePublicExpropriationReduction(
  input: PublicExpropriationReductionInput,
): PublicExpropriationReductionResult {
  // STEP 1: 적용 여부 체크 (보상액 > 0)
  // STEP 2: 부칙 §53 판정 → CURRENT | LEGACY 선택
  // STEP 3: 채권 적용율 결정 (bond | bond3y | bond5y)
  // STEP 4: 가중평균 감면율 = (cash×cashRate + bond×bondRate) / total
  // STEP 5: rawReduction = floor(calculatedTax × weightedRate)
  // STEP 6: ANNUAL_LIMIT 적용 → min(raw, 2억)
  // STEP 7: breakdown/warnings/legalBasis 조립
}
```

- 순수 함수: DB 호출·I/O 없음
- `applyRate()` / `Math.floor()` 사용 — 중간 절사 원칙
- BigInt fallback 불필요 (2억 한도 이하)

## 3. transfer-tax.ts 연동

### 3-1. 타입 확장
```ts
export type TransferReduction =
  | { type: "self_farming"; farmingYears: number }
  | { type: "long_term_rental"; rentalYears: number; rentIncreaseRate: number }
  | { type: "new_housing"; region: "metropolitan" | "non_metropolitan" }
  | { type: "unsold_housing"; region: "metropolitan" | "non_metropolitan" }
  | { type: "public_expropriation";
      cashCompensation: number;
      bondCompensation: number;
      bondHoldingYears?: 3 | 5 | null;
      businessApprovalDate: Date;
    };
```

### 3-2. calcReductions 분기 (R-5)
후보 배열에 추가:
```ts
if (reduction.type === "public_expropriation") {
  const result = calculatePublicExpropriationReduction({
    ...reduction,
    transferDate: input.transferDate,
    calculatedTax,
  });
  if (result.isEligible && result.reductionAmount > 0) {
    candidates.push({ amount: result.reductionAmount, type: "public_expropriation" });
  }
}
```

### 3-3. reductionTypeLabel / reductionLawMap 확장
```ts
public_expropriation: "공익사업용 토지 수용(§77)"
public_expropriation: "조세특례제한법 §77"
```

## 4. non-business-land.ts 분기 정밀화

기존 (895~911):
```ts
if (u.isPublicExpropriation && u.publicNoticeDate) {
  const yearsBefore5 = addYears(u.publicNoticeDate, -5);
  const yearsBefore2 = addYears(u.publicNoticeDate, -2);
  if (
    input.acquisitionDate <= u.publicNoticeDate ||
    input.acquisitionDate <= yearsBefore5 ||
    input.acquisitionDate <= yearsBefore2
  ) { ... }
}
```

변경:
```ts
if (u.isPublicExpropriation && u.publicNoticeDate) {
  const CUTOFF = new Date("2021-05-03T23:59:59");
  const yearsBefore = u.publicNoticeDate <= CUTOFF ? 2 : 5;
  const boundary = addYears(u.publicNoticeDate, -yearsBefore);
  if (input.acquisitionDate <= boundary) {
    return {
      isExempt: true,
      reason: "public_expropriation",
      detail: `공익사업 수용 (고시일 ${u.publicNoticeDate.toISOString().slice(0,10)} / ${yearsBefore}년 전 이전 취득)`,
    };
  }
}
```

## 5. API 스키마 (lib/api/transfer-tax-schema.ts)

`reductionSchema` discriminatedUnion에 추가:
```ts
z.object({
  type: z.literal("public_expropriation"),
  cashCompensation: z.number().nonnegative(),
  bondCompensation: z.number().nonnegative(),
  bondHoldingYears: z.union([z.literal(3), z.literal(5), z.null()]).optional(),
  businessApprovalDate: z.coerce.date(),
}).refine((v) => v.cashCompensation + v.bondCompensation > 0, {
  message: "현금 또는 채권 보상액 중 최소 하나는 양수여야 합니다",
}),
```

## 6. UI 입력 플로우

### 6-1. 양도 단계 확장
기존 "양도가액 입력" 단계 위에 **양도 사유** 토글:
- `[●] 일반 양도`
- `[○] 수용·협의매수 (조특법 §77 감면)`

수용 선택 시 입력 블록:
- 현금 보상액 (CurrencyInput)
- 채권 보상액 (CurrencyInput)
- 채권 만기 특약: `없음` | `3년` | `5년` (RadioGroup)
- 사업인정고시일 (DateInput)

### 6-2. 양도가액 자동 합산
`transferPrice = cashCompensation + bondCompensation` 자동 계산 (수정 가능).

### 6-3. 결과 카드
`TransferTaxResultView.tsx` 감면 섹션에 `public_expropriation` 라벨 + breakdown 표시:
- 현금 보상 × 10% / 채권 보상 × 15%(30%/40%)
- 가중평균 감면율
- §133 한도 초과 시 빨간 경고
- 부칙 §53 적용 시 회색 안내

## 7. 테스트 앵커 (이미지 사례)

- 양도 560,287,470 / 취득 138,000,000 / 경비 6,800,000
- 현금 168,287,470 + 채권 392,000,000 (특약 없음)
- 고시 2017-04-23, 양도 2023-02-16, 취득 2002-05-24
- 가중 감면율: (168,287,470×0.10 + 392,000,000×0.15) / 560,287,470 = (16,828,747 + 58,800,000) / 560,287,470 = 75,628,747 / 560,287,470 ≈ **0.134986...** (≈13.5%)
- 부재지주 임야이지만 §168의14 ③ 3호로 **당연사업용** → 장특공제 30% 한도 적용

## 8. 체크리스트

- [ ] Pure Engine 작성 + 단위 테스트 9건 통과
- [ ] `TransferReduction` 유니온 확장 (타입 오류 0)
- [ ] `calcReductions` 분기 추가 (기존 테스트 회귀 0)
- [ ] `non-business-land.ts` 분기 정밀화 (기존 public_expropriation 테스트 회귀 0)
- [ ] API zod 스키마 확장 (single/multi 라우트 통과)
- [ ] UI 입력/결과 카드
- [ ] 이미지 사례 통합 테스트 원단위 앵커
- [ ] gap-detector ≥ 90%
