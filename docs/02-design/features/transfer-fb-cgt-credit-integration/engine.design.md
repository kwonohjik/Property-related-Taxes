# 가업상속공제 자산 양도 — §97의2④ 의제 취득가액 + §18의2⑩ 양도세 상당액 공제 엔진 설계

> 작성일: 2026-05-22
> 갱신: 2026-05-22 — 케이스 매트릭스 stale 정리 (#1~7 ☑ DONE, #9·10 신규 K10/appliedRate 추가, #8 후속 PR 격리)
> Plan 참조: `docs/00-pm/transfer-fb-cgt-credit-integration.plan.md` (v3)
> KoreanLaw MCP 검증: 2026-05-22 (소령 §163의2 mst=286211, 소법 §97의2④ mst=285523)
> 구현 commit: `8b5a45c` (엔진) · `a6448e1` (UI) · `1ce8820` (appliedRate carry) · `5653bae` (K10 prefill)

## Context

가업상속공제(상증법 §18의2) 적용 자산을 상속인이 이후 양도하면, 소득세법 §97의2④에 따라
**피상속인의 원취득가액과 상속개시일 평가액의 가중평균**을 취득가액으로 의제한다.
이에 따라 일반 §97 산식보다 양도세가 증가할 수 있고, 그 증가분은 상증법 §18의2⑩ + 상증령 §15㉑에 따라
상속세에서 환원 공제된다.

현행 갭:
- `calcFamilyBusinessCgtCredit` 공제 산식 헬퍼는 `lib/tax-engine/credits/family-business-cgt-credit.ts`에 동결됨
- 의제 취득가액 자체 산식이 transfer-tax 엔진에 없음
- `TransferTaxInput.familyBusinessInheritance` 입력 객체 없음
- `calculateTransferTax(input, rates, options)` 시그니처는 사전 PR `b6876cc`로 완료됨

---

## ★ FB-CGT-LAW-1 확정 — 소령 §163의2③ (2026-05-22 KoreanLaw MCP 검증)

### 원문 (소득세법 시행령 mst=286211 시행 2026-05-22)

```
제163조의2(양도소득의 필요경비 계산 특례)
③ 법 제97조의2제4항을 적용할 때 가업상속공제적용률은 다음 각 호의 구분에 따른 비율로 한다.
1. 소득세법을 적용받는 가업(개인가업)의 경우:
   상증법 §18의2①에 따라 상속세 과세가액에서 공제한 금액(가업상속공제금액)을
   같은 항 각 호 외의 부분 전단에 따른 가업상속 재산가액으로 나눈 비율.
   이 경우 가업상속공제가 적용된 자산별 가업상속공제금액은
   가업상속공제금액을 상속 개시 당시의 해당 자산별 평가액을 기준으로 안분하여 계산한다.
2. 법인세법을 적용받는 가업(법인가업)의 경우:
   해당 법인가업의 총자산가액(상속개시일 현재 상증법 §4장에 따라 평가한 가액) 중
   상속개시일 현재 상증령 §15⑤2호에 따른 사업무관자산을 제외한 자산가액이 차지하는 비율
```

### FB-CGT-LAW-1 확정 산식

**개인가업**:
```
가업상속공제적용률 = 가업상속공제금액 / 가업상속 재산가액
```
단, **자산별** 적용률은:
```
자산별 가업상속공제적용률 = (가업상속공제금액 × 자산별 평가액 / 가업상속 재산가액 합계) / 자산별 평가액
                         = 가업상속공제금액 / 가업상속 재산가액 합계
                         = 전체 공제율과 동일
```
즉, 개인가업은 **자산별로 동일한 비율** 적용 (안분 후 자산별 평가액으로 나누면 동일값).

**법인가업**:
```
가업상속공제적용률 = 사업관련자산가액 / 총자산가액  (사업무관자산 제외)
```
법인가업은 자산별 분리가 아닌 **법인 전체** 사업관련자산 비율.

### 본 PR 기본 정책

- 개인가업: `fbDeductionAppliedRate = 가업상속공제금액 / 가업상속재산가액`
- 법인가업: `fbDeductionAppliedRate = 사업관련자산가액 / 총자산가액`
- 사용자가 수동 입력 (상속세 마법사 prefill 가능 — K10)
- 자산별 분리 적용은 본 PR scope에서 단일 자산 기준으로 단순화

---

## ★ 케이스 인벤토리 (Do 단계 진입 조건 — 행 ≥ 1 필수)

| #  | 시나리오                                              | 법령 근거                      | anchor ID            | 상태       | 위치                                             |
|----|------------------------------------------------------|--------------------------------|----------------------|------------|--------------------------------------------------|
| 1  | 적용률 0.8 → 의제 취득가 = 원취득×0.8 + 평가×0.2     | 소법 §97의2④ 1호+2호           | FB-CGT-IMPUTED-1     | ☑ DONE     | `__tests__/tax-engine/transfer-tax/family-business-cgt.test.ts:45` |
| 2  | 적용률 1.0 → 의제 취득가 = 피상속인 원취득가 그대로  | 소법 §97의2④ 1호 (가업 100%)   | FB-CGT-IMPUTED-2     | ☑ DONE     | `family-business-cgt.test.ts:66`                 |
| 3  | 적용률 0.0 → 의제 취득가 = 상속개시일 평가액 그대로  | 소법 §97의2④ 2호 (가업 0%)     | FB-CGT-IMPUTED-3     | ☑ DONE     | `family-business-cgt.test.ts:81`                 |
| 4  | 의제 양도세 < 일반 양도세 → creditAmount=0, 양도세는 의제 강제 | 소법 §97의2④ 본문 + §18의2⑩ 단서 | FB-CGT-CREDIT-NEG-1 | ☑ DONE     | `family-business-cgt.test.ts:167`                |
| 5  | 개인가업 적용률 산식 = 공제액/재산가액               | 소령 §163의2③1호 (FB-CGT-LAW-1) | FB-CGT-LAW-1        | ☑ DONE     | `family-business-cgt.test.ts:107`                |
| 6  | 풀 시나리오 — calculateTransferTax 2회 호출 후 creditAmount 차액 | 소법 §97의2④ + §18의2⑩ + §15㉑ | FB-CGT-FULL-1      | ☑ DONE     | `family-business-cgt.test.ts` + `inheritance-family-business-cgt-credit.test.ts` |
| 7  | familyBusinessInheritance 미제공 → 기존 엔진 동작 그대로 (회귀) | —                             | FB-CGT-BYPASS-1     | ☑ DONE     | `family-business-cgt.test.ts`                    |
| 8  | 법인가업 적용률 산식 = 사업관련자산/총자산            | 소령 §163의2③2호               | FB-CGT-CORP-1       | ☐ 후속 PR  | 자산별 분리 입력 — 본 PR scope 외 (§Context 명시) |
| 9  | K10 자동 prefill — 상속세 이력 → 양도세 4 필드      | 소법 §97의2④ + 소령 §163의2③ + 상증법 §18의2 | FB-K10-1~10 | ☑ DONE | `__tests__/lib/calc/family-business-inheritance-lookup.test.ts` (11 anchor) |
| 10 | appliedRate carry — FamilyBusinessDeductionDetail   | 소령 §163의2③ (Track 3 의존)   | FB-RATE-1~8          | ☑ DONE     | `__tests__/tax-engine/inheritance-family-business.test.ts` (FB-APPLIED-RATE describe 8 anchor) |

---

## 법령 근거

### 소득세법 §97의2④ (mst=285523, 시행 2026-04-21)

```
제97조의2④ 상속세 및 증여세법 제18조의2제1항에 따른 공제(이하 "가업상속공제"라 한다)가
적용된 자산의 양도차익을 계산할 때 양도가액에서 공제할 필요경비는 제97조제2항에 따른다.
다만, 취득가액은 다음 각 호의 금액을 합한 금액으로 한다.
1. 피상속인의 취득가액(제97조제1항제1호에 따른 금액) × 가업상속공제적용률
2. 상속개시일 현재 해당 자산가액 × (1 - 가업상속공제적용률)
```

**핵심 정책**: §97의2② 단서(납세자 유리 선택)는 **①에만** 적용. **④는 본문 강제** — 의제 취득가액이 일반보다
불리해도 그대로 적용. `selectedFormula` 분기 없음.

### 소득세법 시행령 §163의2③ (mst=286211, 시행 2026-05-22)

FB-CGT-LAW-1 확정 — 위 섹션 참조.

### 상증법 §18의2⑩ + 상증령 §15㉑

```
§18의2⑩: 가업상속공제 적용 자산 양도 시 발생하는 양도소득세 상당액을 상속세 산출세액에서 공제.
         다만, 음수인 경우 영으로 본다.
§15㉑ 산식: 양도세 상당액 = 소법 §97의2④ 양도세액 - 소법 §97 일반 양도세액
```

---

## 데이터 모델

### 신규 입력 타입 — `FamilyBusinessInheritanceTransferInput`

```typescript
export interface FamilyBusinessInheritanceTransferInput {
  /** 피상속인의 원취득가액 (소법 §97의2④1호 — 제97조제1항제1호에 따른 금액) */
  decedentAcquisitionPrice: number;
  /**
   * 상속개시일 현재 해당 자산가액 (소법 §97의2④2호).
   * 상증법 §60·§63에 따른 평가가액 (시가 우선, 보충적 평가 차순).
   */
  inheritanceMarketValue: number;
  /**
   * 가업상속공제적용률 (소령 §163의2③ — FB-CGT-LAW-1 확정).
   * 개인가업: 가업상속공제금액 / 가업상속 재산가액 (0~1).
   * 법인가업: 사업관련자산가액 / 총자산가액 (0~1).
   * 사용자 직접 입력 (K10 상속세 마법사 결과 prefill 지원 — 후속 UI PR).
   */
  fbDeductionAppliedRate: number;
  /**
   * 상속개시일 (ISO date string) — 자본적지출 시점 분기용 (피상속인/상속인 구분).
   * 본 PR: 기본 §97② 필요경비 통합. 피상속인/상속인 분리는 후속 PR.
   */
  inheritanceDate: string;
  /** 가업 유형 (개인/법인) — 적용률 산식 분기 안내용. 엔진 계산에는 미영향 (사용자 직접 입력률). */
  businessType?: "individual" | "corporate";
  /**
   * 자본적지출 (선택) — 본 PR 기본: §97② 필요경비 합산.
   * 피상속인 vs 상속인 분리는 후속 PR scope.
   */
  decedentCapitalExpenditure?: number;
  heirCapitalExpenditure?: number;
}
```

`TransferTaxInput`에 optional 추가:
```typescript
/** 가업상속공제 적용 자산 양도 시 §97의2④ 의제 산식 입력 */
familyBusinessInheritance?: FamilyBusinessInheritanceTransferInput;
```

### 결과 타입 확장 — `TransferTaxResult.familyBusinessDetail`

```typescript
familyBusinessDetail?: {
  /** §97의2④ 의제 취득가액 */
  imputedAcquisitionPrice: number;
  /** §97의2④ 의제 산식 양도세액 (결정세액 기준, 본문 강제) */
  cgtUnderSection97_2_4: number;
  /** §97 일반 산식 양도세액 (피상속인 원취득가 그대로 — §15㉑ 분자) */
  cgtUnderSection97: number;
  /**
   * §18의2⑩ + §15㉑ 양도세 상당액 공제 = max(0, 의제 − 일반).
   * 음수 → 0 가드. 양도세 자체는 의제 강제 적용.
   */
  creditAmount: number;
  /** 적용된 가업상속공제적용률 (0~1, 소령 §163의2③) */
  appliedRate: number;
};
```

---

## 헬퍼 함수 — `transfer-tax-family-business.ts` (신규, sibling 격리)

```typescript
// lib/tax-engine/transfer-tax-family-business.ts

/**
 * 소법 §97의2④ 가업상속공제 의제 취득가액 산식.
 *
 * = 피상속인 취득가액 × fbDeductionAppliedRate
 * + 상속개시일 현재 자산가액 × (1 - fbDeductionAppliedRate)
 *
 * 정수 연산: applyRate() 사용. Math.floor 직접 호출 금지.
 */
export function calcFamilyBusinessImputedAcquisitionPrice(
  decedentAcquisitionPrice: number,
  inheritanceMarketValue: number,
  fbDeductionAppliedRate: number,  // 0 ≤ rate ≤ 1
): number {
  // 1호: 피상속인 취득가 × 적용률
  const part1 = applyRate(decedentAcquisitionPrice, fbDeductionAppliedRate);
  // 2호: 상속개시일 평가액 × (1 - 적용률)
  const part2 = applyRate(inheritanceMarketValue, 1 - fbDeductionAppliedRate);
  return part1 + part2;
}
```

**정밀도 주의 (Pre-Do FB-CGT-LAW-1 발견)**: `fbDeductionAppliedRate = 2_000_000_000 / 2_500_000_000` 처럼
분수로 전달 시 부동소수점 표현에서 `applyRate` 두 번 호출 + 합산 시 1원 오차 가능.
호출자가 `fbDeductionAppliedRate`를 정수 분자/분모로 전달하는 경우 ±1원 허용오차 정책 적용
(bigint-round-half-up 스킬 참조). 단순 0.8·1.0·0.0 등 정확한 부동소수점 값은 오차 없음.
FB-CGT-LAW-1 anchor에서 `toBeCloseTo(140_000_000, -1)` 또는 `toBe(139_999_999)` 기준 확인 필요.

---

## 계산 알고리즘

### STEP 0.42 — 가업상속공제 의제 취득가액 분기 (transfer-tax.ts 삽입 위치)

resolveAcquisitionOverride (STEP 0.46) 이전, 상속 의제 (STEP 0.45) 이전에 배치.

```
if (input.familyBusinessInheritance) {
  1. calcFamilyBusinessImputedAcquisitionPrice() → imputedAcq
  2. calculateTransferTax(input, rates, { acquisitionOverride: fb.decedentAcquisitionPrice })
     → baselineCgt (§97 일반 산식 — 피상속인 원취득가)
  3. calculateTransferTax(input, rates, { acquisitionOverride: imputedAcq })
     → imputedCgt (§97의2④ 의제 산식)
  4. creditAmount = max(0, imputedCgt.totalTax - baselineCgt.totalTax)
     (§15㉑: totalTax 기준 — 결정세액 + 지방소득세)
  5. result = imputedCgt (§97의2④ 본문 강제)
  6. result.familyBusinessDetail = { imputedAcquisitionPrice, cgtUnderSection97_2_4, cgtUnderSection97, creditAmount, appliedRate }
}
```

**주의**: `calculateTransferTax` 재귀 호출 시 `familyBusinessInheritance`를 **undefined로 초기화**한 input 사용
(무한 재귀 방지). 패턴: `calcCarryoverScenarios` / `buildMultiHouseSurchargeDetail` 동일 패턴.

### totalTax vs calculatedTax 기준

§15㉑ 산식 원문: "소법 §97의2④ 양도세액 − 소법 §97 양도세액"
→ 상속세 환원 시 납세자가 실제 납부한 차액을 기준으로 해야 하므로 **totalTax (지방소득세 포함) 기준** 사용.
국세청 집행기준 등 별도 확인 전까지 총 납부세액(양도소득세 + 지방소득세) 기준 적용.

---

## Silent fallback / 자동 안분 후보 식별

| 필드 | 자동 안분 가능성 | 정책 |
|------|-----------------|------|
| `fbDeductionAppliedRate` | 상속세 결과에서 자동 도출 가능 | 본 PR: 사용자 수동 입력 강제. K10 prefill은 UI 표시만, validate에서 미입력 오류 |
| `inheritanceMarketValue` | 자동 조회 불가 (상증법 §60·§63 평가) | 사용자 수동 입력 강제 |
| `decedentAcquisitionPrice` | 상속세 마법사 이력에서 prefill 가능 | 본 PR: 사용자 수동 입력 강제 |
| `inheritanceDate` | 상속세 마법사 결과에서 prefill | 본 PR: 사용자 수동 입력 강제 |

법령 명시 외 자동 안분 금지. 4필드 모두 미입력 시 validate 오류로 차단 (`feedback_no_silent_apportion_fallback`).

---

## 800줄 정책 사전 검토

- `transfer-tax.ts` 현재 추정 800줄 — STEP 0.42 삽입 시 분기 추가분 ~30줄 → **family-business 헬퍼는 `transfer-tax-family-business.ts` sibling 분리 확정**.
- 재귀 호출 블록은 transfer-tax.ts 내 10줄 이내로 유지 (헬퍼에 위임).

---

## 14개 동기화 지점 점검표

| # | 지점 | 변경 내용 | 위치 |
|---|------|-----------|------|
| ① | 폼 상태 | `familyBusinessInheritance` 객체 + 4필드 | `TransferFormData` |
| ② | initial | `familyBusinessInheritance: undefined` | `lib/stores/calc-wizard-store.ts` |
| ③ | normalize | 빈 객체 → undefined 처리 | `transfer-tax-api.ts` normalize |
| ④ | API 변환 | body.familyBusinessInheritance 매핑 | `lib/calc/transfer-tax-api.ts` |
| ⑤ | UI 위젯 | ToggleCard + FamilyBusinessInheritanceTransferSection | Step1 자산 카드 |
| ⑥ | 사이드바 | creditAmount 표시 (의제 적용 시) | 사이드바 합계 카드 |
| ⑦ | 결과 카드 | familyBusinessDetail 비교 표 | TaxResult.tsx |
| ⑧ | validation | 4필드 모두 입력 강제. fbDeductionAppliedRate 0~1 범위 | `lib/calc/transfer-validate.ts` |
| ⑨ | Zod enum 메인 | 없음 (수치/날짜만) | — |
| ⑩ | Zod enum 컴패니언 | 없음 | — |
| ⑪ | acquisitionDate fallback | familyBusinessInheritance.inheritanceDate → inheritanceDate | route handler |
| ⑫ | Zod 객체 정의 | `familyBusinessInheritance` 스키마 | API route Zod |
| ⑬ | callTransferTaxAPI body | `familyBusinessInheritance: asset.familyBusinessInheritance` | transfer-tax-api.ts |
| ⑭ | Route handler 매핑 | `coerceDates(fb, ["inheritanceDate"])` | route.ts |

---

## 테스트 약속

파일: `__tests__/tax-engine/transfer-tax/family-business-cgt.test.ts`

Pre-Do anchor 6건 (Do 전 실패 예상):
- FB-CGT-IMPUTED-1~3: 의제 취득가 산식 단위 테스트
- FB-CGT-CREDIT-NEG-1: 음수 가드 + 본문 강제 검증
- FB-CGT-LAW-1: 개인가업 적용률 산식 검증
- FB-CGT-FULL-1: `calculateTransferTax` 2회 호출 통합 시나리오

회귀 anchor:
- FB-CGT-BYPASS-1: `familyBusinessInheritance=undefined` 시 기존 결과 불변

---

## UI 통합 위임

UI 명세 (`transfer-fb-cgt-credit-integration.ui.design.md` — 향후 작성):
- Step1 자산 카드에 emerald tone ToggleCard
- 4필드 입력 + K10 prefill 표시
- 결과 카드 의제/일반 비교 표 (§97의2④ 강제 적용 안내)
- 사이드바 creditAmount 표시

---

## 후속 PR 시그널

- **K10 prefill**: 상속세 마법사 `InheritanceTaxResult.familyBusinessDetail.appliedRate` 필드 추가 → 양도세 마법사 자동 prefill
- **자본적지출 분리**: 피상속인/상속인 지출 §97의2④ 1호/2호 분리 입력
- **법인가업 전용 UI**: `businessType="corporate"` 시 총자산가액 + 사업무관자산 입력 필드
- **LTHD 보유기간 기산일**: 피상속인 vs 상속인 취득일 분기 (K1)
