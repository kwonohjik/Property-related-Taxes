# 양도소득세 오류 검증 및 수정 계획

## Context

3개 Explore agent가 양도소득세 구현 전반(계산 엔진·서브 엔진·UI/API/테스트)을 감사했고, 코드 직독으로 교차 검증했다.
P0→P1→P2 순서로 전부 수정한다. (오탐 제거: 개산공제 3%·상속 differenceInYears·기본공제 LTHD 연쇄·비사업용 80% 비율·양도손실은 기존 구현이 올바름)

---

## P0 — 법적·세액 오류 (즉시 수정)

### P0-1. `calculateProration` 부동소수점 → `safeMultiplyThenDivide` 대체
- **파일**: `lib/tax-engine/tax-utils.ts:103–112`
- **현황**: 비율(ratio = numerator/denominator)을 부동소수점으로 계산 후 amount에 곱함 → P0-2 원칙(세율×금액은 정수 연산) 위반
- **영향**: 12억 초과분 안분 세액에서 최대 수백 원 오차 발생 가능
- **수정**:
  ```typescript
  // 기존
  const ratio = Math.min(numerator / denominator, 1.0);
  return Math.floor(amount * ratio);

  // 수정: 정수 연산 유지
  if (numerator >= denominator) return amount;   // 상한(비율 1.0) 가드
  return Math.floor(safeMultiplyThenDivide(amount, numerator, denominator));
  ```
- **호출 위치**: `transfer-tax.ts:533` `calcOneHouseProration()` — 변경 없이 그대로 사용

### P0-2. 미등기 양도 시 장기보유특별공제(LTHD) 배제 누락
- **파일**: `lib/tax-engine/transfer-tax.ts` `calcLongTermHoldingDeduction()` (L-1 블록)
- **현황**: isSurcharge·isNonBusinessLand 배제는 있으나 `isUnregistered` 배제 로직 없음 → 미등기 시에도 LTHD가 적용될 수 있음 (소득세법 §95② 단서 위반)
- **수정**: 함수 맨 앞에 미등기 배제 추가
  ```typescript
  // 기존 L-1 이전에 삽입
  // L-0: 미등기 — 장기보유특별공제 배제 (소득세법 §95② 단서)
  if (input.isUnregistered) {
    return { deduction: 0, rate: 0, holdingPeriod: { years: 0, months: 0 } };
  }
  ```

### P0-3. UI Step 0 (물건유형) · Step 3 (보유상황) 검증 누락
- **파일**: `app/calc/transfer-tax/TransferTaxCalculator.tsx:865–884` `validateStep()`
- **현황**: step 1(양도정보), step 2(취득정보)만 검증. step 0(물건유형 미선택)·step 3(주택수 미입력) 시 다음 단계로 이동 가능
- **수정**:
  ```typescript
  function validateStep(step: number, form: TransferFormData): string | null {
    if (step === 0) {
      if (!form.propertyType) return "양도하는 부동산 유형을 선택하세요.";
    }
    if (step === 1) { /* 기존 유지 */ }
    if (step === 2) { /* 기존 유지 */ }
    if (step === 3) {
      if (!form.householdHousingCount) return "세대 보유 주택 수를 선택하세요.";
    }
    return null;
  }
  ```

---

## P1 — 심각한 버그 (이번 사이클 수정)

### P1-1. `safeMultiplyThenDivide` BigInt branch에서 중간값에 `Math.round` 적용
- **파일**: `lib/tax-engine/tax-utils.ts:88–93`
- **현황**: `BigInt(Math.round(a)) * BigInt(Math.round(b)) / BigInt(Math.round(c))` — 소수점이 있는 입력(환산취득가액 중간 계산 등)에서 피연산자를 반올림한 뒤 곱하므로 정밀도 손실
- **수정**: 피연산자를 `Math.floor`로 정수화한 뒤 BigInt 변환
  ```typescript
  if (Math.abs(product) > Number.MAX_SAFE_INTEGER) {
    return Number(
      BigInt(Math.floor(a)) * BigInt(Math.floor(b)) / BigInt(Math.floor(c))
    );
  }
  ```
  - 동일하게 `safeMultiply` (tax-utils.ts:72–77) 도 `Math.round` → `Math.floor` 교체

### P1-2. 장기임대 의무기간 계산: `Math.floor(days/365)` → 달력 기반 `differenceInYears`
- **파일**: `lib/tax-engine/rental-housing-reduction.ts:163–177` `calcEffectiveRentalYears()`
- **현황**: `Math.floor(effectiveDays / 365)` — 윤년 포함 구간에서 실제 달력 연수와 최대 ±1일 오차 가능. 8년 의무기간 경계에서 오판 위험
- **수정**: 공실일 차감된 날짜 기준 달력 연수 계산으로 전환
  ```typescript
  // effectiveDays를 rentalStartDate에 더해 effective 종료일 추산 → differenceInYears
  const effectiveEndDate = addDays(rentalStartDate, effectiveDays);
  return differenceInYears(effectiveEndDate, rentalStartDate);
  ```
  - `addDays`는 이미 import 되어 있음 (`date-fns`)

### P1-3. `multi-house-surcharge.ts` Date 변이 (`setFullYear` → `addYears`)
- **파일**: `lib/tax-engine/multi-house-surcharge.ts:328–329` (혼인합가·동거봉양 특례 기한 계산)
- **현황**: `deadline.setFullYear(...)` 방식은 Date 객체를 직접 변이시켜 참조 공유 시 사이드 이펙트 위험
- **수정**: `addYears(baseDate, years)` (date-fns) 사용으로 불변 처리
  ```typescript
  // 기존
  const deadline = new Date(mergeDate);
  deadline.setFullYear(deadline.getFullYear() + deadlineYears);

  // 수정
  const deadline = addYears(mergeDate, deadlineYears);
  ```
  - `addYears`는 이미 import 되어 있음

### P1-4. UI: 환산취득가 `standardPriceAtTransfer` 필드 gating 누락
- **파일**: `app/calc/transfer-tax/TransferTaxCalculator.tsx` Step3 (취득정보)
- **현황**: `useEstimatedAcquisition=true` 시 "양도 당시 기준시가" 입력 필드가 바로 표시되나 "취득 당시 기준시가"가 입력되지 않아도 진행 가능. API에서 Zod 에러로 거절되지만 UX상 즉각 안내가 없음
- **수정**: 취득 당시 기준시가 유효값이 있을 때만 양도 당시 필드 활성화 (disabled 상태로 표시하고 안내 문구 추가)

### P1-5. `annualBasicDeductionUsed` Zod 상한 검증 누락
- **파일**: `app/api/calc/transfer/route.ts:84`
- **현황**: `z.number().int().nonnegative()` — 연간 한도 250만 원 초과 값 허용
- **수정**: `superRefine`에 V-4 추가
  ```typescript
  // V-4: 당해연도 기사용 기본공제는 연간 한도(250만 원) 이하
  if (data.annualBasicDeductionUsed > 2_500_000) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["annualBasicDeductionUsed"],
      message: "연간 기본공제 한도(2,500,000원)를 초과할 수 없습니다",
    });
  }
  ```

### P1-6. `new-housing-reduction.ts` 5년 안분 일수 overflow 방어 누락
- **파일**: `lib/tax-engine/new-housing-reduction.ts:121` (5년 안분 계산)
- **현황**: `Math.floor(totalCapitalGain * reductionDays / totalDays)` — reductionDays 계산 오류 시 음수/초과 가능
- **수정**: 
  ```typescript
  const clampedDays = Math.max(0, Math.min(reductionDays, totalDays));
  const fiveYearGain = Math.floor(safeMultiplyThenDivide(totalCapitalGain, clampedDays, totalDays));
  ```

---

## P2 — 개선 사항

### P2-1. `non-business-land.ts:279–280` 인접 구간 merge 경계 처리
- **파일**: `lib/tax-engine/non-business-land.ts` `mergeOverlappingPeriods()`
- **현황**: `cur.start <= last.end` 조건으로 인접(touching) 구간을 병합 → 경계일이 두 번 카운트될 가능성
- **수정**: `cur.start < last.end` 또는 `cur.start <= last.end` 의미를 주석으로 명확히 문서화 (실제 영향 미미, 명확성 개선)

### P2-2. `multi-house-surcharge.ts:484` Dead code 제거
- **파일**: `lib/tax-engine/multi-house-surcharge.ts:484`
- **현황**: `surchargeType: isSuspended ? surchargeType : surchargeType` — 양 분기 동일
- **수정**: 단순 `surchargeType` 으로 축약

### P2-3. `rental-housing-reduction.ts:371` 환산율 하드코딩 제거
- **파일**: `lib/tax-engine/rental-housing-reduction.ts`
- **현황**: `const CONVERSION_RATE = 0.04` 소스 하드코딩
- **수정**: `LongTermRentalRuleSet` 타입에 `jeonseConversionRate?: number` 추가, 미제공 시 0.04 기본값 사용

### P2-4. sessionStorage reset 미정리
- **파일**: `lib/stores/calc-wizard-store.ts`
- **현황**: `reset()` 호출 시 메모리 상태만 초기화, sessionStorage의 persist 데이터는 유지 → 페이지 새로고침 후 이전 입력값 재출현
- **수정**: `reset()`에 `sessionStorage.removeItem("transfer-tax-wizard")` 추가 (브라우저 환경 guard 포함)

### P2-5. 일시적 2주택 UI 입력 필드 누락
- **파일**: `app/calc/transfer-tax/TransferTaxCalculator.tsx` Step 4 (보유상황)
- **현황**: API는 `temporaryTwoHouse` 필드를 지원하나 UI에 입력 필드 없음
- **수정**: Step 4에 선택적 섹션 추가
  - "일시적 2주택 특례 해당" 체크박스
  - 체크 시: 종전 주택 취득일 / 신규 주택 취득일 입력 (DateInput 사용)

### P2-6. 에러 복구 UI — 재시도 버튼 누락
- **파일**: `app/calc/transfer-tax/TransferTaxCalculator.tsx:1010–1012`
- **현황**: API 실패 시 에러 메시지만 표시, 재시도 경로 없음
- **수정**: 에러 상태에서 "다시 계산하기" 버튼 표시 (이전 단계로 복귀)

### P2-7. 누락 테스트 케이스 추가
- **파일**: `__tests__/tax-engine/transfer-tax.test.ts`, `rental-housing-reduction.test.ts`
- 추가 케이스:
  - 윤년 2020-02-29 취득 → 2024-02-28·2024-02-29·2024-03-01 양도 경계값 (보유기간 만 4년 분기)
  - 중과세 유예 만료 경계: `transferDate = "2026-05-10"` → 유예 종료, 중과세 부활 확인
  - 환산취득가 overflow: `transferPrice=1_000_000_000_000, standardPriceAtAcquisition=1_000_000_000_000` 큰 값 정밀도 유지
  - 정확 break-even: `transferPrice === acquisitionPrice + expenses` → `totalTax = 0`
  - 미등기 + 장기보유공제 배제 확인 (P0-2 수정 검증용 회귀 테스트)
  - 12억 초과 안분 경계: 12억 정확히 vs 12억+1원 (P0-1 수정 검증)
  - 임대 의무기간 8년 ±1일 경계 (P1-2 수정 검증)

### P2-8. Accessibility — form input aria 레이블 보완
- **파일**: `app/calc/transfer-tax/TransferTaxCalculator.tsx:416+`
- 라디오 버튼·체크박스에 `aria-labelledby` 또는 `aria-label` 추가

---

## 수정 순서 및 파일 목록

| 순서 | 우선순위 | 파일 | 변경 내용 |
|------|----------|------|-----------|
| 1 | P0-1 | `lib/tax-engine/tax-utils.ts:103–112` | `calculateProration` 정수 연산 전환 |
| 2 | P0-2 | `lib/tax-engine/transfer-tax.ts` (LTHD 함수) | 미등기 배제 추가 |
| 3 | P0-3 | `app/calc/transfer-tax/TransferTaxCalculator.tsx:865–884` | Step 0/3 검증 추가 |
| 4 | P1-1 | `lib/tax-engine/tax-utils.ts:72–93` | BigInt branch Math.round → Math.floor |
| 5 | P1-2 | `lib/tax-engine/rental-housing-reduction.ts:163–177` | 의무기간 달력 기반 계산 |
| 6 | P1-3 | `lib/tax-engine/multi-house-surcharge.ts:328–329` | `setFullYear` → `addYears` |
| 7 | P1-4 | `app/calc/transfer-tax/TransferTaxCalculator.tsx` Step3 | 기준시가 필드 gating |
| 8 | P1-5 | `app/api/calc/transfer/route.ts:84` | annualBasicDeductionUsed Zod 상한 |
| 9 | P1-6 | `lib/tax-engine/new-housing-reduction.ts:121` | 안분 overflow 방어 |
| 10 | P2-1 | `lib/tax-engine/non-business-land.ts:279–280` | 구간 merge 주석 명확화 |
| 11 | P2-2 | `lib/tax-engine/multi-house-surcharge.ts:484` | Dead code 제거 |
| 12 | P2-3 | `lib/tax-engine/rental-housing-reduction.ts:371` | 환산율 파라미터화 |
| 13 | P2-4 | `lib/stores/calc-wizard-store.ts` | sessionStorage 초기화 |
| 14 | P2-5 | `app/calc/transfer-tax/TransferTaxCalculator.tsx` Step4 | 일시적 2주택 입력 UI |
| 15 | P2-6 | `app/calc/transfer-tax/TransferTaxCalculator.tsx` | 에러 재시도 버튼 |
| 16 | P2-7 | `__tests__/tax-engine/*.test.ts` | 누락 테스트 케이스 7종 |
| 17 | P2-8 | `app/calc/transfer-tax/TransferTaxCalculator.tsx:416+` | aria 레이블 |

---

## 검증 방법

```bash
# 1. 단위 테스트 전체 실행
npm test

# 2. 수정된 엔진별 테스트
npx vitest run __tests__/tax-engine/transfer-tax.test.ts
npx vitest run __tests__/tax-engine/rental-housing-reduction.test.ts
npx vitest run __tests__/tax-engine/multi-house-surcharge.test.ts

# 3. TypeScript 타입 검사
npm run build

# 4. 개발 서버 실행 후 UI 동작 확인
npm run dev
# - Step 0에서 유형 미선택 → "다음" 클릭 시 에러 표시 확인
# - Step 3에서 주택 수 미선택 → "다음" 클릭 시 에러 표시 확인
# - 미등기 + 보유기간 5년 입력 → LTHD=0 확인
# - 환산취득가 사용 시 취득 기준시가 미입력 → 양도 기준시가 비활성 확인
```
