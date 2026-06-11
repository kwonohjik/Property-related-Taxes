# 조특법 §30의5·§30의6 증여세 과세특례 엔진 드리프트 정정 설계

> 작성: 2026-06-11  
> 워크트리: fix-special-treatment  
> 대상 파일: `lib/tax-engine/credits/special-tax-treatment.ts` + `lib/tax-engine/inheritance-gift-tax-credit.ts` + `lib/tax-engine/types/inheritance-tax-credit.types.ts` + `lib/validators/gift-aux-schemas.ts`

---

## 1. 배경 — 확정 드리프트 5건

KoreanLaw MCP로 조특법 §30의5·§30의6 현행 본문(시행 20260602) 검증 완료. 현행 코드의 법문 드리프트 5건을 정정한다.

| ID | 조문 | 현행 코드 | 법문 정합값 |
|---|---|---|---|
| D1 | §30의5 세율 | 50억 이하 10% / 초과 20% (2단계) | **단일 10%** |
| D2 | §30의5 과세가액 한도 | 한도 없음 (전액 특례) | 50억 (10인 이상 고용 시 100억) |
| D3 | §30의6 세율 | 단일 10% | 120억 이하 10% / **초과분 20%** |
| D4 | §30의6 20년 구간 한도 | 500억 | **400억** |
| D5 | §69 신고세액공제 배제 | 특례 선택 시에도 filingCredit 3% 적용 | **특례 적격 시 filingCredit = 0** |

---

## 2. Pre-Do anchor 실측 결과

anchor 파일: `__tests__/tax-engine/anchor-special-treatment-drift.test.ts`

| 드리프트 | 입력 | 현행 실측값 | 법령 정합 기대값 |
|---|---|---|---|
| D1 | 창업자금 60억 | 특례세액 **600,000,000** (6억: 50억×10%+5억×20%) | **550,000,000** (55억×10%) |
| D2 | 60억, 고용=false | 특례 대상 가액 = 60억 (한도 미적용) | 특례 대상 = 50억, 초과 10억 일반과세 |
| D3 | 가업승계 150억·30년 | 특례세액 **1,400,000,000** (14억: 140억×10%) | **1,600,000,000** (16억: 120억×10%+20억×20%) |
| D4 | getFamilyBusinessLimit(20) | **50,000,000,000** (500억) | **40,000,000,000** (400억) |
| D4(경계) | 가업승계 450억·20년 | 특례세액 4,400,000,000 (44억, 한도 초과 없음) | 정정 후: 400억 한도 → 한도초과 50억 일반과세 |
| D5 | startup 10억, 기한내 신고 | filingCredit = **1,500,000** (0이 아님) | **0** |
| D5(미적격) | startup, 투자미완료 | specialTreatmentCredit = 0, filingCredit = 4,200,000 | 동일 (미적격 폴백 → §69 정상 적용) |
| D5(가업) | family_business 20억 | filingCredit = **3,000,000** (0이 아님) | **0** |

5건 드리프트 전건 실증 완료. "기대" 테스트 5건 현재 실패 상태.

---

## 3. 케이스 매트릭스

### 3-1. D1·D2 §30의5 창업자금 — 세율 + 한도

| 케이스 | giftAmount | newHires≥10 | 투자완료 | 한도 적용 | 과세표준(=eligible-5억) | 특례세액 |
|---|---|---|---|---|---|---|
| M-1 | 3억 | any | true | 50억 (초과없음) | max(0, 3억-5억) = 0 | **0** |
| M-2 | 10억 | false | true | 50억 (초과없음) | 10억-5억=5억 | 5억×10% = **5천만** |
| M-3 | 60억 | false | true | 50억 (초과 10억 일반과세) | 45억 | 45억×10% = **4억5천만** |
| M-4 | 60억 | true | true | 100억 (초과없음) | 55억 | 55억×10% = **5억5천만** |
| M-5 | 120억 | true | true | 100억 (초과 20억 일반과세) | 95억 | 95억×10% = **9억5천만** |
| M-6 | 10억 | false | false | (투자미완료 → 특례 불적용) | - | **0** (특례 불적용) |
| M-7 | 5억 (한도=5억) | false | true | 50억 (초과없음) | max(0,5억-5억)=0 | **0** |

> D1 정정: `STARTUP_LOW_RATE_LIMIT`, `STARTUP_RATE_HIGH` 상수 및 분기 삭제 → 단일 `applyRate(taxBase, 0.1)`.  
> D2 신규: `startupNewHiresAtLeast10?: boolean` 입력 추가 → `eligibleAmount = min(giftAmount, newHires≥10 ? 100억 : 50억)`.  
> 초과분(`excessAmount = giftAmount - eligibleAmount`)은 현행 "절감액 공제" 구조에서 별도 표시만 함 — 실제 일반과세 세액 계산은 엔진 상위(gift-tax.ts)의 normalComputedTax에 이미 반영되어 있으므로, `eligibleAmount` 기준으로 특례세액만 계산하면 됨. `excessAmount > 0` 시 breakdown에 "한도 초과분 {excessAmount}원은 일반 증여세 적용" 경고 추가.

### 3-2. D3 §30의6 가업승계 — 120억 초과 세율

| 케이스 | giftAmount | businessYears | 한도 내/초과 | 과세표준 | 특례세액 |
|---|---|---|---|---|---|
| M-8 | 20억 | 15년 | 한도 300억 초과없음 | 10억 | 10억×10% = **1억** |
| M-9 | 150억 | 30년 | 한도 600억 초과없음 | 140억 | 120억×10%+20억×20% = 12억+4억 = **16억** |
| M-10 | 150억 | 20년 | 한도 400억 초과없음 | 140억 | 120억×10%+20억×20% = **16억** |
| M-11 | 500억 | 20년 | 한도 400억 → 초과 100억 일반과세 | 390억 | 120억×10%+270억×20% = 12억+54억 = **66억** |
| M-12 | 5억 | 8년 | 10년 미만 → 특례 불가 | - | **0** |
| M-13 | 130억 | 30년 | 600억 초과없음 | 120억 | 120억×10%+0×20% = **12억** (경계 120억) |

> D3 정정: `FAMILY_BUSINESS_RATE_HIGH = 0.2`, `FAMILY_BUSINESS_120B_THRESHOLD = 120_000_000_000` 상수 신규 추가. 120억 이하 10%, 초과분 20% 2단계 적용.

### 3-3. D4 §30의6 영위 기간별 한도

| 영위 기간 | 현행 한도 | 법령 정합 한도 | 비고 |
|---|---|---|---|
| 10년 이상 15년 미만 | 300억 | **300억** | 변경 없음 |
| 20년 이상 30년 미만 | **500억** | **400억** | D4 정정 |
| 30년 이상 | 600억 | **600억** | 변경 없음 |
| 10년 미만 | 0 (불가) | **0** | 변경 없음 |

> D4 정정: `if (businessYears >= 20) return 50_000_000_000` → `return 40_000_000_000`.

### 3-4. D5 §30의5⑪·§30의6⑤ 신고세액공제 배제

| 케이스 | 특례 선택 | 적격 여부 | isFiledOnTime | 현행 filingCredit | 정정 후 filingCredit |
|---|---|---|---|---|---|
| M-14 | startup | 적격 (투자완료) | true | **1,500,000** | **0** |
| M-15 | startup | 적격 (투자완료) | false | 0 (기한 외) | **0** |
| M-16 | startup | 미적격 (투자미완료) | true | 4,200,000 | **4,200,000** (§69 정상 적용) |
| M-17 | family_business | 적격 (businessYears≥10) | true | **3,000,000** | **0** |
| M-18 | family_business | 미적격 (businessYears<10) | true | (현행 specialCredit=0, §69 적용) | (변경 없음, §69 정상) |
| M-19 | 없음 | - | true | §69 정상 3% | **정상 유지** |

> D5 법문 해석: §30의5⑪ "신고세액공제를 **적용하지 아니한다**" → 특례를 **적용받는** 경우에만 배제. 즉 특례 적격(specialTreatmentCredit > 0) 시 filingCredit = 0. 미적격 폴백(투자미완료·10년미만) 시 specialTreatmentCredit = 0이므로 §69 정상 적용. 이 해석이 법문 "적용받는 경우" 문언에 정합함.  
> 구현 위치: `calcGiftTaxCredits` 내 신고세액공제 계산 직전에 `const isSpecialTreatmentApplied = specialTreatmentCredit > 0` 판정 → `calcFilingCredit(isFiledOnTime && !isSpecialTreatmentApplied, ...)`.

---

## 4. 신규 입력 설계

### 4-1. 엔진 타입 변경 (`GiftTaxCreditInput`)

파일: `lib/tax-engine/types/inheritance-tax-credit.types.ts`

```typescript
export interface GiftTaxCreditInput {
  foreignTaxPaid?: number;
  isFiledOnTime: boolean;
  specialTreatment?: "startup" | "family_business";
  startupInvestmentCompleted?: boolean;
  /** §30의5① 창업자금 과세가액 한도 기준: 10인 이상 신규 고용 여부 (true → 100억, false/undefined → 50억) */
  startupNewHiresAtLeast10?: boolean;   // ← D2 신규
}
```

### 4-2. `StartupFundTaxInput` 변경

파일: `lib/tax-engine/credits/special-tax-treatment.ts`

```typescript
export interface StartupFundTaxInput {
  giftAmount: number;
  normalComputedTax: number;
  startupInvestmentCompleted?: boolean;
  /** D2: 10인 이상 신규 고용 여부 (default false → 한도 50억) */
  startupNewHiresAtLeast10?: boolean;
}
```

### 4-3. Zod 스키마 변경 (`giftTaxCreditInputSchema`)

파일: `lib/validators/gift-aux-schemas.ts`  
위치: ⑩ (Zod enum 컴패니언)

```typescript
export const giftTaxCreditInputSchema = z.object({
  foreignTaxPaid: z.number().nonnegative().optional(),
  isFiledOnTime: z.boolean(),
  specialTreatment: z.enum(["startup", "family_business"]).optional(),
  startupInvestmentCompleted: z.boolean().optional(),
  startupNewHiresAtLeast10: z.boolean().optional(),   // ← D2 신규
});
```

---

## 5. 14개 동기화 지점 — 엔진 책임 명세

이 드리프트 정정은 엔진 레이어(Layer 2) 내부 수정이 주체. UI 노출 여부는 별도 스코프(아래 후속 항목).

| 지점 | 파일 | 변경 내용 | 담당 |
|---|---|---|---|
| 엔진 핵심 | `credits/special-tax-treatment.ts` | D1·D2·D3·D4 계산 로직 정정 | 엔진 |
| 엔진 핵심 | `inheritance-gift-tax-credit.ts` | D5 filingCredit 배제 조건 추가 | 엔진 |
| ① 폼 상태 | `lib/stores/gift-wizard-store.ts` | `startupNewHiresAtLeast10?: boolean` 필드 추가 | UI |
| ② initial | `lib/stores/gift-wizard-store.ts` | 초기값 `false` | UI |
| ③ normalize | `lib/calc/gift-api.ts` 인근 normalize 함수 | `startupNewHiresAtLeast10` 전달 | UI |
| ④ API 변환 | `lib/calc/gift-api.ts` `buildGiftTaxApiInput()` | `creditInput.startupNewHiresAtLeast10` 매핑 | UI |
| ⑤ UI 위젯 | 증여세 마법사 특례 섹션 | "10인 이상 신규 고용" toggle (startup 선택 시만 노출) | UI |
| ⑥ 사이드바 합계 | - | 특례 절감액 echo (현행 유지) | - |
| ⑦ 결과 카드 | 증여세 결과뷰 세액공제 섹션 | §69 배제 사유 텍스트 표시 | UI |
| ⑧ validation | `lib/calc/gift-validate.ts` | startupNewHiresAtLeast10 미입력 허용 (optional) | UI |
| ⑨ Zod 메인 | `lib/validators/property-valuation-input.ts` | `giftTaxCreditInputSchema` 재사용, 직접 변경 없음 | - |
| ⑩ Zod 컴패니언 | `lib/validators/gift-aux-schemas.ts` | `startupNewHiresAtLeast10: z.boolean().optional()` | 엔진 |
| ⑫ Zod 입력 정의 | `lib/validators/gift-aux-schemas.ts` | 위 ⑩과 동일 파일 | 엔진 |
| ⑭ Route 매핑 | `app/api/calc/gift/route.ts` | `giftTaxInputSchema` 통과 시 자동 반영 (타입캐스트 구조) | - |

> 이번 PR 스코프: **엔진(⑩⑫) + 타입** 변경만. ①②③④⑤⑦⑧은 후속 UI PR에서 처리.  
> `startupNewHiresAtLeast10`가 엔진에 전달되지 않으면 기본 false(50억 한도)로 동작 — UI PR 이전에도 엔진은 안전.

---

## 6. 정수 연산 설계

### §30의5 창업자금 (D1·D2 정정 후)

```
eligibleAmount = min(giftAmount, newHires≥10 ? 100억 : 50억)
excessAmount = max(0, giftAmount - eligibleAmount)   // 한도 초과분 (일반과세)
taxBase = max(0, eligibleAmount - 5억)
specialTax = applyRate(taxBase, 0.1)                 // 단일 10% (D1)
creditAmount = max(0, normalComputedTax - specialTax)
```

주의: `excessAmount > 0` 시 breakdown 경고 추가. 초과분에 대한 별도 일반세 계산은 이 함수 책임 외 (normalComputedTax에 이미 반영).

### §30의6 가업승계 (D3·D4 정정 후)

```
limit = getFamilyBusinessLimit(businessYears)          // D4: 20년 → 400억
eligibleAmount = min(giftAmount, limit)
taxBase = max(0, eligibleAmount - 10억)
// D3: 120억 초과 2단계
if taxBase <= 120억:
  specialTax = applyRate(taxBase, 0.1)
else:
  specialTax = applyRate(120억, 0.1) + applyRate(taxBase - 120억, 0.2)
            = 12억 + applyRate(taxBase - 120억, 0.2)
```

`applyRate` 2회 독립 호출 후 합산 — 중간 절사 2회 적용 (세법 관행).

### §69 배제 (D5 정정 후)

```typescript
// calcGiftTaxCredits 내부
const isSpecialTreatmentApplied = specialTreatmentCredit > 0;
const filingResult = calcFilingCredit({
  isFiledOnTime: creditInput.isFiledOnTime && !isSpecialTreatmentApplied,
  taxBeforeFilingCredit: Math.max(0, remainingTax),
});
```

`isSpecialTreatmentApplied` 플래그가 true면 `isFiledOnTime=false`로 강제 → `calcFilingCredit` 내부에서 자연스럽게 0 반환.  
breakdown에 `"§30의5⑪ 적용 — 신고세액공제 배제"` 사유 추가 (isSpecialTreatmentApplied && creditInput.isFiledOnTime 조건).

---

## 7. 기존 테스트 영향 분석

### 영향 파일 및 재산정값

파일: `__tests__/tax-engine/tax-credit.test.ts`

| 테스트 ID | 현행 anchor | 정정 후 anchor | 사유 |
|---|---|---|---|
| [C18] 창업자금 10억 | `specialTax=50_000_000` | **유지 50_000_000** | 10억-5억=5억 ≤ 50억 → 한도 내, D1 단일10% 일치 |
| [C19] 가업승계 10년 → 한도 300억 | `toBe(30_000_000_000)` | **유지** | D4 미영향 |
| [C20] 가업승계 30년 → 한도 600억 | `toBe(60_000_000_000)` | **유지** | D4 미영향 |
| [C21] 5년 → 특례 불가 | `toBe(0)` | **유지** | D4 미영향 |
| [C22] 가업승계 20억·15년 | `specialTax=100_000_000` | **유지 100_000_000** | 20억-10억=10억 ≤ 120억 → 단일 10% 일치 |

파일: `__tests__/tax-engine/inheritance-gift/gift-tax-credit-formula.test.ts`

| 테스트 ID | 현행 anchor | 정정 후 anchor | 사유 |
|---|---|---|---|
| F-7: filingCreditBase | `toBe(300M - result.specialTreatmentCredit)` | **D5 정정으로 깨짐** | 정정 후 `isSpecialTreatmentApplied=true` → filingCredit=0, filingCreditBase echo 변경 필요 |

> F-7은 `filingCreditBase` echo 검증인데, D5 정정 후 `isSpecialTreatmentApplied=true` 이면 `calcFilingCredit`이 `isFiledOnTime=false`로 호출되어 breakdown 내용이 변경됨. `filingCreditBase` echo는 여전히 `max(0, remainingTax)`이므로 숫자 자체는 유지되지만, filingCredit이 0으로 바뀌므로 F-7 마지막 줄 `expect(result.filingCreditBase).toBe(300_000_000 - result.specialTreatmentCredit)` 은 통과. **단 `result.filingCredit > 0`을 암묵적으로 가정하는 하위 구조가 있으면 회귀 가능.** F-7 전체를 실측 후 재판정 필요.

파일: `__tests__/lib/calc/gift-api.test.ts`

| 테스트 ID | 영향 |
|---|---|
| GA-5, GA-6, GA-6b | `startupNewHiresAtLeast10` 필드 추가 시 Zod 통과 여부 확인 필요. 현행 미포함 → 기본 false → 엔진 50억 한도 적용. **테스트 값은 50억 미만 케이스라 숫자 영향 없음.** |

### 수정이 필요한 기존 테스트 목록

| 파일 | 테스트 | 조치 |
|---|---|---|
| `__tests__/tax-engine/inheritance-gift/gift-tax-credit-formula.test.ts:F-7` | D5 정정 후 `filingCredit` 값 변화 확인 후 재산정 | Do 단계에서 실행 후 결정 |
| `__tests__/tax-engine/tax-credit.test.ts:C18~C22` | 수치 유지 확인됨 — **재산정 불필요** | - |

---

## 8. 스코프 제외 (후속 항목)

다음은 이번 PR 스코프 밖. 설계 문서에 후속 항목으로 기록.

1. **§30의5⑪ 동일인 합산(§47②) 배제** — 창업자금은 §47② 10년 합산 규정 적용 제외. 분리과세 구조 재설계 필요 (§47⑤의 명시 배제 조항 확인 필요). 별도 PR.
2. **특례를 "절감액 공제" 방식이 아닌 완전 분리신고 재현** — 현행 구조(normalComputedTax - specialTax = creditAmount) 유지. 완전 분리 재현은 v2.0 별지 계산 확장 시.
3. **§30의5⑪ 주석 오기("100억/120억 1인 창업")** — D2 정정 시 주석도 법문 정합으로 수정 포함 (minor, Do 단계에서 같이).
4. **UI §30의5 "10인 이상 신규 고용" 토글** — startupNewHiresAtLeast10 필드를 증여세 마법사에 노출. 별도 UI PR.

---

## 9. 구현 순서 (Do 단계)

1. **`special-tax-treatment.ts`**: D1(§30의5 단일 10%)·D2(한도 50억/100억)·D3(§30의6 120억 2단계)·D4(20년→400억) 정정
2. **`inheritance-gift-tax-credit.ts`**: D5 `isSpecialTreatmentApplied` 플래그 + filingCredit 배제
3. **`inheritance-tax-credit.types.ts`**: `GiftTaxCreditInput.startupNewHiresAtLeast10?: boolean` 추가
4. **`gift-aux-schemas.ts`**: Zod 스키마에 `startupNewHiresAtLeast10` 추가 (⑩)
5. **anchor 테스트 확정**: `anchor-special-treatment-drift.test.ts` 의 "기대" 테스트 5건 통과 확인
6. **F-7 회귀 조사**: gift-tax-credit-formula.test.ts F-7 실측 후 재산정
7. **`npx tsc --noEmit`**: 0건 확인
8. **`npx vitest run __tests__/tax-engine/`**: 전체 통과 확인
