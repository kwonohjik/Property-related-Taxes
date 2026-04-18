# 취득 원인(매매·상속·증여) 입력 + 단기보유 세율 판정 보유기간 통산

## Context

소득세법 §95④(상속자산의 보유기간 통산)에 따르면, 상속받은 자산의 양도 시 단기보유 단일세율(주택·입주권·분양권 70%/60%, 일반 토지·건물 50%/40%)을 적용할 보유기간은 **상속개시일이 아닌 피상속인의 취득일**부터 양도일까지로 계산한다. 사용자 요구에 따라 증여(이월과세 패턴)에도 동일하게 증여자 취득일을 통산하도록 단순화 적용한다.

현재 `lib/tax-engine/transfer-tax.ts`의 `calcTax()` (L837~849)는 항상 `input.acquisitionDate`로만 보유기간을 계산하므로, 상속 자산의 단기보유 단일세율이 잘못 적용될 가능성이 있다. 또한 UI Step3에 "취득 원인" 입력 자체가 없다.

본 변경의 목표:
1. UI Step3에 취득 원인(매매/상속/증여) 라디오를 추가하고, 상속·증여 선택 시 피상속인/증여자 취득일을 추가 입력받는다.
2. **단기보유 단일세율 판정에만** 통산 보유기간(피상속인·증여자 취득일 기산)을 적용한다.
3. **장기보유특별공제(LTHD)는 그대로 상속개시일/증여일(=취득일) 기산** — 절대 변경하지 않는다.

## Files to modify

### 1. `lib/tax-engine/transfer-tax.ts`
- **L83~187 (TransferTaxInput)** — `temporaryTwoHouse` 다음 위치에 옵셔널 3개 필드 추가:
  ```ts
  /** 취득 원인 (매매·상속·증여). 미지정 시 매매로 간주. */
  acquisitionCause?: "purchase" | "inheritance" | "gift";
  /** 상속 시 피상속인 취득일 — 단기보유 단일세율 판정 보유기간 통산용 (소득세법 §95④) */
  decedentAcquisitionDate?: Date;
  /** 증여 시 증여자 취득일 — 단기보유 단일세율 판정 보유기간 통산용 (이월과세 패턴) */
  donorAcquisitionDate?: Date;
  ```
- **L837~849 (calcTax 내 단기보유 판정)** — `calculateHoldingPeriod` 호출 직전에 통산 기산일 결정 헬퍼 추가:
  ```ts
  const rateBasisAcquisitionDate =
    input.acquisitionCause === "inheritance" && input.decedentAcquisitionDate
      ? input.decedentAcquisitionDate
      : input.acquisitionCause === "gift" && input.donorAcquisitionDate
        ? input.donorAcquisitionDate
        : input.acquisitionDate;
  const holdingForRate = calculateHoldingPeriod(rateBasisAcquisitionDate, input.transferDate);
  ```
- **L630 / L642 (LTHD 내 보유기간)** — **변경 금지**. `input.acquisitionDate`를 그대로 유지.

### 2. `lib/stores/calc-wizard-store.ts`
- **TransferFormData (L29~)** — Step3 그룹에 필드 추가:
  ```ts
  // Step 3: 취득 정보
  acquisitionCause: "purchase" | "inheritance" | "gift";
  /** 상속 시 피상속인 취득일 (YYYY-MM-DD) */
  decedentAcquisitionDate: string;
  /** 증여 시 증여자 취득일 (YYYY-MM-DD) */
  donorAcquisitionDate: string;
  ```
- **defaultFormData (L128~)** — 초기값:
  ```ts
  acquisitionCause: "purchase",
  decedentAcquisitionDate: "",
  donorAcquisitionDate: "",
  ```

### 3. `lib/calc/transfer-tax-api.ts`
- L97~ body 객체에 다음 필드 전달:
  ```ts
  acquisitionCause: form.acquisitionCause,
  decedentAcquisitionDate:
    form.acquisitionCause === "inheritance" && form.decedentAcquisitionDate
      ? form.decedentAcquisitionDate
      : undefined,
  donorAcquisitionDate:
    form.acquisitionCause === "gift" && form.donorAcquisitionDate
      ? form.donorAcquisitionDate
      : undefined,
  ```

### 4. `app/api/calc/transfer/route.ts`
- Zod 스키마에 옵셔널 필드 추가 (acquisitionDate 인접 위치):
  ```ts
  acquisitionCause: z.enum(["purchase", "inheritance", "gift"]).optional(),
  decedentAcquisitionDate: z.string().date().optional(),
  donorAcquisitionDate: z.string().date().optional(),
  ```
- 엔진 인풋 매핑부 (L355~)에서 Date 변환 추가:
  ```ts
  acquisitionCause: data.acquisitionCause,
  decedentAcquisitionDate: data.decedentAcquisitionDate
    ? new Date(data.decedentAcquisitionDate)
    : undefined,
  donorAcquisitionDate: data.donorAcquisitionDate
    ? new Date(data.donorAcquisitionDate)
    : undefined,
  ```
- superRefine 검증 추가:
  - `acquisitionCause === "inheritance"` 시 `decedentAcquisitionDate` 필수 + `decedentAcquisitionDate < acquisitionDate`
  - `acquisitionCause === "gift"` 시 `donorAcquisitionDate` 필수 + `donorAcquisitionDate < acquisitionDate`

### 5. `app/calc/transfer-tax/TransferTaxCalculator.tsx`
- **Step3 (L174~)** — 취득일 입력(L375~381) **위에** "취득 원인" 라디오 그룹 추가:
  - 옵션 3개: `매매` / `상속` / `증여` (버튼 스타일 — 기존 propertyType 라디오와 일관)
  - 변경 시 `onChange({ acquisitionCause: ... })`
  - **상속 선택 시:** `acquisitionDate` 라벨을 "상속개시일"로 표기 + 그 아래 **피상속인 취득일** DateInput 노출 + 안내문 ("※ 단기보유 세율 판정 시 피상속인 취득일부터 보유기간을 통산합니다 — 소득세법 §95④")
  - **증여 선택 시:** `acquisitionDate` 라벨을 "증여일(취득일)"로 표기 + 그 아래 **증여자 취득일** DateInput 노출 + 안내문
  - **매매 선택 시:** 기존 그대로 ("취득일")
- **acquisitionCause 변경 시 부수 필드 초기화 useEffect** — 상속 외로 바뀌면 `decedentAcquisitionDate`, 증여 외로 바뀌면 `donorAcquisitionDate`를 ""로 reset

### 6. `lib/calc/transfer-tax-validate.ts`
- Step 2(`step === 2`) 검증에 추가:
  - `form.acquisitionCause === "inheritance"` && `!form.decedentAcquisitionDate` → "피상속인 취득일을 선택하세요."
  - `form.acquisitionCause === "gift"` && `!form.donorAcquisitionDate` → "증여자 취득일을 선택하세요."
  - 추가 일관성: 두 날짜 모두 `< form.acquisitionDate` 여야 함 (안 그러면 "피상속인/증여자 취득일은 취득일보다 이전이어야 합니다.")

### 7. `__tests__/tax-engine/transfer-tax.test.ts`
- 신규 테스트 케이스 (T-16 인근에 추가):
  - **T-INH-RATE-LONG**: 상속, 상속개시일 6개월 전 양도지만 **피상속인 취득일은 5년 전** → 단기보유 단일세율 미적용 (누진세율 적용)
    - acquisitionDate: 2023-07-01 (상속개시일), transferDate: 2024-01-01, decedentAcquisitionDate: 2019-01-01, acquisitionCause: "inheritance"
    - 기대: `appliedRate`가 0.50/0.70이 아닌 누진세율 (e.g. 0.24~0.42)
  - **T-GIFT-RATE-LONG**: 증여, 증여일 6개월 전 양도지만 **증여자 취득일은 5년 전** → 단기보유 단일세율 미적용
  - **T-INH-LTHD-UNCHANGED**: 상속, 상속개시일 6개월 전 양도 + 피상속인 취득일 10년 전 → LTHD는 0% (3년 미만 — 상속개시일 기산 그대로 유지) 회귀 테스트

## Reused utilities

- `calculateHoldingPeriod()` (`lib/tax-engine/tax-utils.ts:128`) — 그대로 사용, 기산일만 분기 결정
- `DateInput` (`components/ui/date-input.tsx`) — 새 날짜 입력 UI 재사용 (CLAUDE.md 규칙 준수)

## Verification

1. **단위 테스트** — `npx vitest run __tests__/tax-engine/transfer-tax.test.ts` 통과 (기존 78건 + 신규 3건)
2. **전체 회귀** — `npm test` 1051+신규 모두 통과
3. **타입체크** — `npx tsc --noEmit` 통과
4. **수동 UI 검증** (`npm run dev` 후 `/calc/transfer-tax`):
   - Step3에서 "상속" 선택 → 라벨이 "상속개시일"로, 피상속인 취득일 입력란 노출
   - 피상속인 취득일을 5년 전, 상속개시일을 6개월 전으로 입력 → 결과 화면에서 누진세율 적용 확인 (단기 70%가 아님)
   - 동일 입력으로 LTHD = 0% (상속개시일 6개월 < 3년) 확인
   - "증여" 선택 → 라벨 "증여일", 증여자 취득일 입력란
   - "매매"로 변경 → 부수 필드 빈값으로 reset, 라벨 "취득일" 복귀

## Out of scope

- 1세대1주택 비과세 2년 보유 요건의 상속 특례 (별도 §155 규정 — 현 작업 범위 밖)
- 배우자·직계존비속 증여 이월과세(소득세법 §97의2)의 5년 요건·취득가액 변경 — 향후 별도 task
- 상속·증여 시 취득가액(시가) 자동 계산 — 별도 task
- LTHD 보유기간 통산 — 의도적 제외 (LTHD는 상속개시일·증여일 기산 유지)
