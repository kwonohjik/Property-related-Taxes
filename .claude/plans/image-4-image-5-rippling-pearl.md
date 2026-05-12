# §161 비과세 양도소득금액 분리 표시 — 결과 표 산식 순서 정정

## Context (왜 이 변경이 필요한가)

사용자가 결과 표(이미지8)와 안분 미리보기(이미지9)를 비교하여 다음 모순을 발견했다:

- 입력 폼 미리보기: "이 비율(75%)만큼이 과세 대상이며, 나머지는 비과세입니다"
- 결과 표(현재):
  - 비과세 양도차익 138,395,000 ← ❌ 양도차익 단계에 §161 결과가 잘못 매핑
  - 과세대상 양도차익 172,605,000 ← ❌ 사실은 양도소득금액 단계 값
  - 양도소득금액 91,745,000 ← ❌ 172,605,000 − 80,860,000 으로 산출되어 장기보유공제가 두 번 차감된 것처럼 보임
  - 소득금액 감면대상 0

법령상 소득세법 §95①은 양도소득금액을 "양도차익 − 장기보유특별공제"로 정의하고, 시행령 §161①은 이 §95① 양도소득금액에 안분 비율을 곱하도록 명문화한다. 즉 안분은 양도차익이 아니라 양도소득금액 단계에서 이뤄져야 한다. 따라서 비과세 양도차익은 0이고, 비과세는 양도소득금액 단계에서 분리되어야 한다.

산출세액 자체는 분배법칙(`gain × ratio × (1 − ltc%) ≡ gain × (1 − ltc%) × ratio`)으로 사례 PDF#1과 우연히 일치하지만, 중간 표기는 산식 순서를 위반하므로 사용자에게 혼란을 준다.

### 사용자 결정 (옵션 B + 추가 정정 사항)

1. **별도 행 신설**: "비과세 양도소득금액 (§161①)"을 양도소득금액 행 아래에 신규 행으로 추가 (옵션 B)
2. **비과세 양도차익 = 0**으로 표시 (양도차익 단계 비과세 분리 제거)
3. **과세대상 양도차익 = 전체 양도차익**과 동일 표시 (예: 311,000,000)
4. **양도소득금액 = 양도차익 − 장기보유공제 = 230,140,000**으로 정정 (장기보유공제 이중 차감 형태 제거)
5. 신규 비과세 양도소득금액 차감 표기 (= 57,535,000) → 과세대상 양도소득금액 172,605,000 → 기본공제 차감 → 과세표준 170,105,000 → 산출세액 44,699,900 (불변)

### 적용 범위

- **§161 적용 시(`rentalHousingExceptionDetail.applied === true`)에만** 위 정정을 적용
- 일반 1세대1주택 §156 고가주택·환산취득가·이월과세 등 기존 분기는 영향 없음 (회귀 0건)

---

## 수정 범위 (4개 파일 + anchor 보강)

### 1. `lib/tax-engine/types/transfer.types.ts`

`TransferTaxResult`에 신규 옵셔널 필드 추가:

```ts
/**
 * 비과세 양도소득금액 — §161①·② 안분 결과 비과세 부분
 * 장기임대주택 거주주택 비과세 특례(§155⑳ + §161) 적용 시에만 채워짐
 * 결과 표의 "비과세 양도소득금액" 행에 표시
 */
nontaxableGainAmount?: number;
```

기존 `reducibleIncome?` 필드(`reductionTargetIncome2` 행 = "소득금액 감면대상")는 그대로 유지. 비과세는 감면과 법적 성격이 다르므로 별도 필드로 분리.

### 2. `lib/tax-engine/transfer-tax.ts:520-545`

RentalHousingException early return 분기에서 `nontaxableGainAmount` 계산 후 채움:

```ts
const nontaxableGainAmount = Math.max(0, rhe.formulaTrace.gain95Table1 - rhe.taxableGain);
return {
  ...
  transferGain,            // 311,000,000 (양도차익 전체) — 변경 없음
  taxableGain: rhe.taxableGain,  // 172,605,000 (§161 적용 후 과세대상 양도소득금액) — 변경 없음
  longTermHoldingDeduction: ...,  // 80,860,000 (전체 양도차익에 표1·26%) — 변경 없음
  nontaxableGainAmount,    // 57,535,000 (신규)
  ...
};
```

수치 계산은 이미 `rhe.exemptGain`(엔진 모듈 내 `gain95Table1 − taxableGain`)에 동일하므로 재사용 검토.

### 3. `components/calc/results/transfer/FilingFormTableHelpers.ts`

`§161 적용 분기` 신설 — `result.rentalHousingExceptionDetail?.applied === true`일 때:

#### 3-1. 행 값 설정 분기 (라인 420~475 부근)

```ts
const isRH = result.rentalHousingExceptionDetail?.applied === true;

if (isRH) {
  // §161 적용 — 비과세는 양도소득금액 단계에서 분리
  setNum("transferGain", "total", result.transferGain);                  // 311M
  setNum("exemptGain", "total", 0);                                       // 0 (비과세 양도차익 없음)
  setNum("taxableGain", "total", result.transferGain);                    // 311M (= 양도차익 전체)
  setNum("ltDeduction", "total", result.longTermHoldingDeduction);        // 80.86M
  // 양도소득금액 = 양도차익 − 장기보유공제 = §95① 양도소득금액
  const incomeAmount = result.transferGain - result.longTermHoldingDeduction; // 230.14M
  setNum("incomeAmount", "total", incomeAmount);
  // 신규 행: 비과세 양도소득금액 (§161① 안분 비율 적용 결과)
  setNum("nontaxableIncome", "total", result.nontaxableGainAmount ?? 0);  // 57.535M
} else {
  // 기존 로직 유지
  setNum("transferGain", "total", result.transferGain);
  setNum("exemptGain", "total", Math.max(0, result.transferGain - result.taxableGain));
  setNum("taxableGain", "total", result.taxableGain);
  setNum("ltDeduction", "total", result.longTermHoldingDeduction);
  setNum("incomeAmount", "total", result.taxableGain - result.longTermHoldingDeduction);
  // nontaxableIncome 행은 채우지 않음 → 빈 셀 또는 0
}
```

#### 3-2. `rowOrder` 배열 (라인 491~522)

`incomeAmount` 행 다음에 신규 행 삽입:

```ts
["incomeAmount", "양도소득금액"],
["nontaxableIncome", "비과세 양도소득금액 (소령 §161①)", { indent: true }],  // 신규
["reductionTargetIncome2", "소득금액 감면대상"],  // 기존
```

§161 미적용 케이스에서는 빈 셀 또는 0으로 표시되어 자연스러움. `indent: true`로 들여쓰기하여 "양도소득금액의 차감 항목"임을 시각적으로 표현.

### 4. `components/calc/results/transfer/RentalHousingExceptionDetailCard.tsx`

기존 결과 카드는 이미 "비과세 양도소득금액" `exemptGain`을 표시하므로 라벨만 정정:

- 현재: "비과세 양도소득금액 = {gain95Table1 − taxableGain}" 식 표기 유지
- 변경: 산식 표기를 신고서 표 표기와 일관되도록 "양도소득금액(§95①) − 비과세 양도소득금액(§161①) = 과세대상 양도소득금액" 흐름 명시

### 5. anchor 테스트 보강

`__tests__/tax-engine/transfer-tax/rental-housing-exception/rh-b1-prhp-under-12.test.ts`에 anchor 추가:

```ts
it("anchor 18: result.nontaxableGainAmount = 57,535,000 (§161① 비과세 양도소득금액)", () => {
  // calculateTransferTax 진입점 통합 테스트로 별도 작성 또는
  // RentalHousingExceptionResult.exemptGain 검증으로 대체
  expect(result.exemptGain).toBe(57_535_000);  // 이미 anchor 8에 존재
});
```

추가로 `__tests__/tax-engine/transfer-tax/` 디렉터리에 통합 테스트 신설 (선택):
- `rental-housing-exception-integration.test.ts` — `calculateTransferTax`를 직접 호출하여 `result.nontaxableGainAmount === 57_535_000` 검증

---

## 영향받지 않는 영역 (회귀 0건 보장)

- 일반 1세대1주택 비과세, §156 고가주택, 환산취득가, 이월과세, 다필지·겸용주택 — `isRH === false` 분기 유지로 기존 표시 동일
- 산출세액·과세표준·결정세액 — **불변** (분배법칙으로 동일 결과)
- 사례문제 PDF#1 anchor 17개 — **불변·일치** (172,605,000 / 0.75 / 80,860,000 / 44,699,900)
- 14개 동기화 지점 — input 타입 변경 없음, result 표면 표시만 정정

---

## 핵심 수정 파일 (절대 경로)

| # | 파일 | 변경 내용 |
|---|---|---|
| 1 | `lib/tax-engine/types/transfer.types.ts` | `TransferTaxResult.nontaxableGainAmount?: number` 추가 |
| 2 | `lib/tax-engine/transfer-tax.ts:520-545` | `nontaxableGainAmount = Math.max(0, gain95Table1 − taxableGain)` 계산 + return에 추가 |
| 3 | `components/calc/results/transfer/FilingFormTableHelpers.ts` | `isRH` 분기 신설 (라인 420~475), `rowOrder`에 `nontaxableIncome` 행 추가 (라인 507 근처) |
| 4 | `components/calc/results/transfer/RentalHousingExceptionDetailCard.tsx` | 산식 표기를 "§95① 양도소득금액 − 비과세 양도소득금액" 흐름으로 정정 |
| 5 | `__tests__/tax-engine/transfer-tax/rental-housing-exception/` | `nontaxableGainAmount` anchor 추가 (선택적으로 integration 테스트 신설) |

## 재사용하는 기존 자산

- `RentalHousingExceptionResult.exemptGain` — 엔진 모듈에서 이미 `gain95Table1 − taxableGain` 계산되어 있음 (`lib/tax-engine/transfer-tax/rental-housing-exception/index.ts`)
- `setNum`/`rowOrder` 패턴 — `FilingFormTableHelpers.ts:319, 491` 기존 헬퍼 그대로 사용
- `RowDef` 타입 — 기존 행 정의 형식 그대로 (`{ indent?: boolean }` 옵션 활용)

---

## 검증 (End-to-End)

### 1. 자동 테스트
- `npx tsc --noEmit` → 0건
- `npx vitest run __tests__/tax-engine/transfer-tax/rental-housing-exception/` → 8 파일 / 62+ 테스트 통과
- `npx vitest run __tests__/tax-engine/transfer-tax/` → 양도세 39 파일 회귀 0건
- 사례문제 PDF#1 anchor 17개 불변 (특히 산출세액 44,699,900)

### 2. 표 출력 검증 (수동)
- `npm run dev` → 사례문제 입력 → 거주기간 24 이상 → 결과 표 확인:
  - 양도가액 800,000,000
  - 취득가액 480,000,000
  - 필요경비 9,000,000
  - **전체 양도차익 311,000,000**
  - **비과세 양도차익 0**
  - **과세대상 양도차익 311,000,000** (전체와 동일)
  - 장기보유특별공제 80,860,000
  - **양도소득금액 230,140,000** (양도차익 − 장기보유공제, 정정됨)
  - **비과세 양도소득금액 (소령 §161①) 57,535,000** (신규 행)
  - 소득금액 감면대상 0
  - 과세표준 170,105,000
  - 산출세액 44,699,900
  - 결정세액 44,699,900
  - 지방세 결정세액 4,469,990

### 3. 회귀 시나리오
- 토글 OFF / 일반 1세대1주택 / 고가주택 §156 / 환산취득가 / 이월과세 — 비과세 양도차익 행 표시 그대로, "비과세 양도소득금액" 행은 0 또는 빈 셀
- 토글 ON 거주기간 0개월 (적용 불가) — `isRH === false`로 기존 표시 + amber 경고 카드

### 4. PDF·신고서 출력 호환성
- `FilingFormTable`을 사용하는 PDF·인쇄 출력에서 새 행이 자연스럽게 표시되는지 확인
