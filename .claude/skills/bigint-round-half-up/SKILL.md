---
name: bigint-round-half-up
description: 다단계 안분 산식(분자×분자/분모)에서 JS Number 2^53 한계 초과 시 정밀도 손실로 1원 오차가 발생하는 문제를 BigInt round-half-up 헬퍼로 해결. PDF anchor와 1원 차이 발생 시 PDF 자체 round 일관성 오기 판정·1원 toleranc 적용 정책 포함.
trigger: BigInt, round half up, 안분, 정밀도, 1원 차이, PDF anchor, 분자 분모, allocation, proration, precision loss, 2^53, Number.MAX_SAFE_INTEGER, floor 분자 곱셈, Math.floor 곱셈
---

# bigint-round-half-up — 안분 산식 정밀도 + PDF round 처리

세금 안분 산식(`분자 × 비율수 / 분모`) 결과가 PDF anchor와 1원씩 어긋날 때 적용. JS Number 산식 결과 정밀도 손실 + PDF 자체 round 정책 차이를 동시에 해결.

## 적용 시점

- 안분 산식 결과 anchor가 PDF 값과 정확히 ±1원 차이로 실패
- 분자가 두 정수의 곱으로 2^53(약 9 × 10^15) 초과 — 예: `1,477,500,000 × 1,101,319,862 ≈ 1.6 × 10^18`
- PDF 책 표에서 "산출세액 × 비율" 식이 여러 분기에 등장하는데 일부만 +1 round 처리되어 일관성 없음 (PDF 오기)

## 1. BigInt round-half-up 헬퍼

`lib/tax-engine/{module}.ts` 내 모듈-국지 헬퍼로 정의 (export 불요):

```ts
/**
 * BigInt round-half-up 나눗셈 — JS Number 2^53 초과 곱셈 정밀도 손실 + PDF round 정책 대응.
 *
 * Math.floor(numer / denom)이 아닌 사사오입(round half up):
 *   - 잔여 × 2 >= 분모 → +1
 *   - 그 외 → 그대로
 *
 * PDF 책 1864 안분식이 .9956 → +1 처리하는 패턴과 일치.
 *
 * @param numer 분자 (BigInt) — 두 정수 곱의 결과 등 큰 값 허용
 * @param denom 분모 (BigInt) — 0이면 0 반환 (방어)
 * @returns 사사오입된 정수 (Number 범위로 안전 캐스트)
 */
function bigIntRoundDiv(numer: bigint, denom: bigint): number {
  if (denom === 0n) return 0;
  const q = numer / denom;
  const r = numer - q * denom;
  return r * 2n >= denom ? Number(q) + 1 : Number(q);
}
```

## 2. 호출 패턴 (안분 산식 일반화)

```ts
// 양도세·증여세·상속세·종부세 안분 — 모두 동일 패턴
const allocated = bigIntRoundDiv(
  BigInt(distributableAmount) * BigInt(weightNumerator),
  BigInt(weightDenominator),
);
```

**금지 패턴** (정밀도 손실):
```ts
// ❌ 2^53 초과 곱셈 시 1원 오차 발생
const allocated = Math.floor((distributableAmount * weightNumerator) / weightDenominator);

// ❌ 부동소수점 분리 후 곱셈 — 더 큰 오차
const ratio = weightNumerator / weightDenominator;
const allocated = Math.floor(distributableAmount * ratio);
```

## 3. PDF anchor 1원 차이 처리 정책

PDF 책의 안분식이 round 일관성 부족 (예: .46 → +1 vs .87 → 0)으로 1원 오차 발생 시:

### 옵션 A — anchor toleranc 적용 (권장)
```ts
// PDF 432,871,250 vs 우리 계산 432,871,249 (1원 차이, PDF 산식 .46<.5에도 +1 round — 다른 사례 .45→0과 비일관성)
expect(Math.abs(result - 432_871_250)).toBeLessThanOrEqual(1);
```

### 옵션 B — anchor 정정 + 주석
```ts
// PDF 책 1867 ① 배우자 산식 .46 → round-half-up 정확 결과 = 432,871,249
// PDF 표 432,871,250은 round 일관성 오기 (다른 사례 동일 .X 처리와 불일치)
expect(result).toBe(432_871_249);
```

**옵션 선택 기준**:
- 합계 anchor가 강제되는 경우 → A (1원 toleranc + 명시 주석)
- 단일 anchor만 검증 → B (정확값으로 정정 + PDF 오기 명시)

## 4. 실제 사례 (본 프로젝트 inheritance-allocation.ts)

`lib/tax-engine/inheritance-allocation.ts` 의 3개 호출 위치:

```ts
// 13-6: 간접배부 = floor(indirectNumerator × (taxableValueShare − giftAmount) / indirectDenominator)
const indirectTaxBaseShare = indirectDenominator > 0
  ? bigIntRoundDiv(
      BigInt(indirectNumerator) * BigInt(indirectBase),
      BigInt(indirectDenominator),
    )
  : 0;

// 13-8: 산출세액상당액
const computedTaxShare = computedTaxShareDenominator > 0
  ? bigIntRoundDiv(
      BigInt(distributableTax) * BigInt(taxBaseShare),
      BigInt(computedTaxShareDenominator),
    )
  : 0;

// 13-10: 사전증여세액공제 한도
const limit = bigIntRoundDiv(
  BigInt(computedTaxShare) * BigInt(directTaxBaseShare),
  BigInt(taxBaseShare),
);
```

검증:
- PDF 손녀 indirect = `1,865M × 500M / 5,815M = 160,361,134.9956...` → round = **160,361,135** ✓
- PDF 장남 산출세액상당액 = `1,477.5M × 1,658,469,476 / 3,475M = 705,147,812.something` → round = **705,147,813** ✓
- PDF 배우자 산출세액상당액 = `1,477.5M × 1,101,319,862 / 3,475M = 468,259,020.46` → round = 468,259,020 ↔ PDF 468,259,021 (1원 toleranc)

## 5. 신고세액공제 등 추가 round 위치

PDF는 신고세액공제도 round-half-up (×0.03):
```ts
// 13-12: 신고세액공제 = round(차가감 × 3%)
const filingCredit = isFiledOnTime
  ? Math.round(preFilingCreditTax * 0.03)
  : 0;
```

이 경우 `preFilingCreditTax × 0.03`은 부동소수점 곱셈이지만 결과가 2^53 미만이라 `Math.round` 안전.

## 6. CLAUDE.md 정책과 관계

- **세법 표준 floor** (CLAUDE.md 정수 연산 정책)와 **PDF 안분 round** 의 차이를 모듈 주석에 명시
- 안분 산식만 round 적용, 세율 적용·천원미만 절사 등은 floor 유지
- `lib/tax-engine/tax-utils.ts`의 기존 `safeMultiply`는 BigInt fallback이지만 round 안 함 — 안분 전용 헬퍼 별도 정의

## 7. anchor 작성 체크리스트

- [ ] 분자가 두 큰 수의 곱이면 — 손계산으로 정확 값 산출 (BigInt 또는 Python `(a*b)//c + (1 if (a*b)%c*2 >= c else 0)`)
- [ ] PDF 값과 차이 발견 시 — 다른 사례의 round 처리와 비교 (일관성 확인)
- [ ] 1원 차이 발견 시 — 옵션 A·B 명시적 결정 + 주석에 PDF 오기 판단 근거
- [ ] 합계 anchor도 같은 toleranc 적용 (배우자 1원 차이가 4명 합계에 그대로 전파됨)

## 8. 회귀 보호

`bigIntRoundDiv` 헬퍼 단위 테스트 anchor 1건 추가 권장:

```ts
it("bigIntRoundDiv .9956 → +1 (PDF 안분 round)", () => {
  expect(bigIntRoundDiv(932_500_000_000_000_000n, 5_815_000_000n)).toBe(160_361_135);
});

it("bigIntRoundDiv .46 → 그대로 (round-half-up 표준)", () => {
  expect(bigIntRoundDiv(46n, 100n)).toBe(0);
});

it("bigIntRoundDiv 분모 0 → 0 방어", () => {
  expect(bigIntRoundDiv(100n, 0n)).toBe(0);
});
```
