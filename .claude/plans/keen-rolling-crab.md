# Plan: 양도소득세 누락 법령 근거 조항 삽입

## Context
양도소득세 계산 결과 화면(`TransferTaxResultView`)은 각 `CalculationStep.legalBasis`를 뱃지로
표시한다. 현재 STEP 8(감면세액)·STEP 9(결정세액)·STEP 11(총 납부세액) 3개 스텝에
`legalBasis`가 없어 근거 조문이 표시되지 않는다.

## 파일 구조 파악

| 역할 | 파일 |
|------|------|
| 법령 상수 | `lib/tax-engine/legal-codes.ts` — `TRANSFER` 객체 |
| 계산 엔진 | `lib/tax-engine/transfer-tax.ts` — `calculateTransferTax()` |
| 결과 UI | `components/calc/results/TransferTaxResultView.tsx` — `step.legalBasis` 표시 |

## 누락 현황 (3개)

| STEP | label | 현재 | 추가할 조문 |
|------|-------|------|-----------|
| 8 | 감면세액 | 없음 | 감면 유형별 동적 참조 (조특법 §69 / §97 / §99 / §98의3) |
| 9 | 결정세액 | 없음 | `소득세법 §107 ①` |
| 11 | 총 납부세액 | 없음 | `소득세법 §107 ① + 지방세법 §92` |

### 감면 유형별 조문
- `self_farming` (자경농지): `조특법 §69`
- `long_term_rental` (장기임대주택): `조특법 §97`
- `new_housing` (신축주택): `조특법 §99`
- `unsold_housing` (미분양주택): `조특법 §98의3`
- 감면 없음: legalBasis 생략

## 구현 계획

### 1. `lib/tax-engine/legal-codes.ts`
`TRANSFER` 객체에 5개 상수 추가:
```typescript
REDUCTION_SELF_FARMING:   "조특법 §69",        // 자경농지 감면
REDUCTION_LONG_RENTAL:    "조특법 §97",        // 장기임대주택 감면
REDUCTION_NEW_HOUSING:    "조특법 §99",        // 신축주택 감면
REDUCTION_UNSOLD_HOUSING: "조특법 §98의3",     // 미분양주택 감면
FINAL_TAX:                "소득세법 §107 ①",  // 결정세액 결정·경정
```

### 2. `lib/tax-engine/transfer-tax.ts`

**STEP 8 감면세액** (line ~1120):
```typescript
// reductionType(한글 표시명) → 법령 조문 매핑
const reductionLawMap: Record<string, string> = {
  "자경농지":     TRANSFER.REDUCTION_SELF_FARMING,
  "장기임대주택": TRANSFER.REDUCTION_LONG_RENTAL,
  "신축주택":     TRANSFER.REDUCTION_NEW_HOUSING,
  "미분양주택":   TRANSFER.REDUCTION_UNSOLD_HOUSING,
};
steps.push({
  label: "감면세액",
  formula: ...,
  amount: reductionAmount,
  legalBasis: reductionType ? reductionLawMap[reductionType] : undefined,
});
```

**STEP 9 결정세액** (line ~1128):
```typescript
steps.push({
  label: "결정세액",
  formula: ...,
  amount: determinedTax,
  legalBasis: TRANSFER.FINAL_TAX,
});
```

**STEP 11 총 납부세액** (line ~1145):
```typescript
steps.push({
  label: "총 납부세액",
  formula: ...,
  amount: totalTax,
  legalBasis: `${TRANSFER.FINAL_TAX} + ${TRANSFER.LOCAL_INCOME_TAX}`,
});
```

## 검증
```bash
npx tsc --noEmit          # 타입 오류 없음
npx vitest run            # 531개 테스트 통과
```
UI: 결과 화면에서 각 스텝의 법령 뱃지 표시 확인
