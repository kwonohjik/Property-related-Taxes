# 상속세·증여세 분납(分納) §70② — 엔진 설계

> 계획서: [`docs/00-pm/inheritance-gift-installment-split.plan.md`](../../00-pm/inheritance-gift-installment-split.plan.md)
> UI 설계: [`inheritance-gift-installment-split.ui.design.md`](./inheritance-gift-installment-split.ui.design.md)

## Context

납부할 세액(결정세액)이 1천만원을 초과할 때 신고기한 경과 후 **2개월 이내 2회 분할납부**(상증법 §70② · 시행령 §66②)하는 기능을 상속·증여에 추가한다.

**이전 한계**: 분납은 신고서의 "칸"과 분납기한 날짜만 존재(상속 별지9호 ㊶ `amount:0`, 증여 별지10호 ㊼ `cashDeferred ?? 0` 항상 0)하고, 분납액 산출·입력·결과 표시가 전무했다. 연부연납(§71)과는 **법령상 배타 제도**(§70② 단서)이며, 기존 §71은 결과뷰 투영 패턴으로 구현돼 있다.

---

## ★ 케이스 인벤토리 (필수 — 비어 있으면 Do 단계 진입 금지)

| # | 시나리오 | 법령 근거 | anchor 출처 | 테스트 파일 | 상태 |
|---|---------|----------|-------------|-----------|------|
| CS-01 | 납부세액 800만 (1천만 이하) → 분납 불가 | §70② 본문 "초과" | 산식 직접 | `installment-split.test.ts` | ☐ TODO |
| CS-02 | 정확히 1천만 → 불가 ("초과" 아님) | §70② 본문 | 경계값 | 〃 | ☐ TODO |
| CS-03 | 1,000만 1원 → split 1, 1차 1,000만 | 시행령 §66②1호 | 경계 +1원 | 〃 | ☐ TODO |
| CS-04 | 1,500만 → maxSplit 500만 (초과분) | §66②1호 | 산식 직접 | 〃 | ☐ TODO |
| CS-05 | 2,000만 → maxSplit 1,000만 (구간1 상단) | §66②1호 | 경계값 | 〃 | ☐ TODO |
| CS-06 | 2,000만 1원 → maxSplit 1,000만 (구간2 진입, floor) | §66②2호 | 경계값 | 〃 | ☐ TODO |
| CS-07 | 5,000만 → maxSplit 2,500만 (50%) | §66②2호 | 산식 직접 | 〃 | ☐ TODO |
| CS-08 | 5,000만 + 희망액 1,000만 → split 1,000만, 1차 4,000만 | §66②2호 "이하" | 희망액 선택 | 〃 | ☐ TODO |
| CS-09 | 5,000만 + 희망액 3,000만(>최대) → clamp 2,500만 + 경고 | §66②2호 한도 | clamp | 〃 | ☐ TODO |
| CS-10 | 5,000만 + 미신청 → eligible=true, applied=false, 전액 1차 | §70② "할 수 있다" | 신청제 | 〃 | ☐ TODO |
| CS-11 | 5,000만 + §71 연부연납 허가 → 분납 불가 + 경고 | §70② 단서 | 배타 | 〃 | ☐ TODO |
| CS-13 | 1억 1원 → floor(×0.5)=5,000만, 1차 50,000,001 (항등식) | §66②2호 + 정수연산 | 홀수 floor | 〃 | ☐ TODO |

**규칙**: 행≥1 없으면 Do 진입 금지. CS-12는 계획서 표에서 짝수 중복으로 제거(누락 아님). 모든 행 항등식 `1차 + 2차 = payableTax` 성립.

---

## 법령 근거

`lib/tax-engine/legal-codes/inheritance-gift.ts`(§71 `INSTALLMENT`:267 인접)에 상수 추가:
```ts
SPLIT_PAYMENT:     "상증법 §70②",   // 분납 (연부연납 INSTALLMENT 키와 구분)
SPLIT_PAYMENT_ENF: "상증령 §66②",   // 분납액 산식
```

```
상증법 §70②: 제1항에 따라 납부할 금액이 1천만원을 초과하는 경우에는 대통령령으로
  정하는 바에 따라 그 납부할 금액의 일부를 납부기한이 지난 후 2개월 이내에 분할납부
  할 수 있다. 다만, 제71조에 따라 연부연납을 허가받은 경우에는 그러하지 아니하다.

상증령 §66②: 분납할 수 있는 세액은
  1. 납부할 세액이 2천만원 이하인 때: 1천만원을 초과하는 금액
  2. 납부할 세액이 2천만원을 초과하는 때: 그 세액의 100분의 50 이하의 금액
```

**기준액**: `payableTax = finalTax` (가산세·징수유예 §74 미차감). §70① "납부할 금액" 차감항목은 신고세액공제·연부연납·납부유예(§72의2)·물납(§73) 4종뿐 — 징수유예는 명문 부재(징수 시기 유예일 뿐 세액 불변). **Do 진입 전 KoreanLaw §70① 본문 최종 확인.**

---

## 엔진 input 타입

분납 산출에 `finalTax`(엔진 계산 결과)가 필요하므로 **금액(splitAmount)을 input으로 받을 수 없다**(순환 의존). 의사·희망액만 받는다.

```ts
// lib/tax-engine/credits/installment-split.ts (신규 — 상속·증여 공용 순수 함수)
export interface InstallmentSplitInput {
  payableTax: number;                 // = finalTax (엔진 내부에서 주입, 원 정수)
  applyInstallmentSplit: boolean;     // 분납 신청 의사
  requestedSplitAmount?: number;      // 분납 희망액 (미입력 시 maxSplit)
  applyLongTermInstallment?: boolean; // §71 연부연납 허가 → true면 분납 불가
}
```

**증여 `GiftTaxInput` 확장** (별지10호용 — `lib/tax-engine/types/inheritance-gift.types.ts`):
```ts
applyInstallmentSplit?: boolean;     // §70② 분납 신청
requestedSplitAmount?: number;       // 분납 희망액
// cashDeferred 는 input 아님 — 엔진이 calcInstallmentSplit 결과로 echo
```
상속 엔진 input은 변경 없음(별지9호는 클라이언트 빌드 투영).

새 Date 필드 없음 (분납기한은 신고기한 파생, UI 레이어 산출).

## 엔진 result 타입

```ts
// GiftTaxResult (기존 cashDeferred?: number 재활용, types/inheritance-gift.types.ts:1319)
cashDeferred?: number;  // ㊼ §70② 현금 분납 = calcInstallmentSplit(...).splitAmount echo
```

`calcInstallmentSplit` 반환:
```ts
export interface InstallmentSplitResult {
  eligible: boolean;       // payableTax > 1천만 && 연부연납 아님
  applied: boolean;        // eligible && applyInstallmentSplit
  maxSplitAmount: number;  // 구간별 최대 분납액
  splitAmount: number;     // 실제 분납액 (2차)
  firstPayment: number;    // 1차 (= payableTax - splitAmount) ≡ 별지 신고납부칸
  secondPayment: number;   // 2차 (= splitAmount)
  warnings: string[];
}

export function isInstallmentSplitEligible(finalTax: number): boolean; // finalTax > 10_000_000 단일 진실
```

> 상속 `InheritanceTaxResult`는 신규 필드 없음 — 별지9호 ㊶·결과뷰 카드 모두 클라이언트가 `calcInstallmentSplit(result.finalTax, form)` 투영.

---

## 계산 알고리즘 (단계별)

`calcInstallmentSplit(input)`:

1. **연부연납 배타** (§70② 단서): `applyLongTermInstallment === true` → `{eligible:false, applied:false, maxSplitAmount:0, splitAmount:0, firstPayment:payableTax, secondPayment:0, warnings:["§70② 단서: §71 연부연납 허가 시 분납 불가"]}`.
2. **임계 판정** (§70② "초과"): `payableTax <= 10_000_000` → `{eligible:false, …, firstPayment:payableTax}`.
3. **구간별 maxSplit** (§66②):
   - 구간1 `payableTax <= 20_000_000` → `maxSplit = payableTax - 10_000_000`
   - 구간2 → `maxSplit = applyRate(payableTax, 0.5)` (= `Math.floor(payableTax * 0.5)`)
4. **미신청**: `!applyInstallmentSplit` → `{eligible:true, applied:false, maxSplitAmount, splitAmount:0, firstPayment:payableTax}`.
5. **희망액 clamp**: `desired = requestedSplitAmount ?? maxSplit`. `desired > maxSplit` → `desired=maxSplit` + 경고. `desired <= 0` → `desired=maxSplit`.
6. **확정**: `splitAmount=desired`, `firstPayment=payableTax-splitAmount`, `secondPayment=splitAmount`.

**증여 엔진 통합** (`gift-tax.ts:309` 부근): finalTax 산출 직후
```ts
const split = calcInstallmentSplit({
  payableTax: finalTax,
  applyInstallmentSplit: input.applyInstallmentSplit ?? false,
  requestedSplitAmount: input.requestedSplitAmount,
  applyLongTermInstallment: false, // 증여 §71 미구현
});
// cashDeferred: split.splitAmount  → besshi10 자동 (reportPay = finalTax - 0 - cashDef = firstPayment)
```

**정수 연산**: `applyRate`(`tax-utils.ts:42`) 사용, `Math.round` 금지. 2회 분할이라 BigInt 불필요. `firstPayment = payableTax - splitAmount`로 항등식 보장(홀수 원은 1차 흡수, CS-13).

---

## Silent fallback / 자동 안분 후보 식별

- `requestedSplitAmount` **미입력 시 maxSplit auto-fill**: 자동 안분 아님 — "이하" 범위 납세자 default이며 `applyInstallmentSplit=true`일 때만 적용(신청 명시 전제). 미신청(`applyInstallmentSplit=false`)은 절대 분납액 산출 안 함.
- 희망액 `> maxSplit` clamp는 법령 한도 강제이며 `warnings`로 고지.
- 빈 form 값으로 분납 강제 금지 — `splitPaymentEnabled` OFF면 엔진 호출 자체 skip.

---

## 테스트 약속

- 케이스 인벤토리 CS-01~CS-13 전부 anchor (`__tests__/tax-engine/inheritance/installment-split.test.ts`).
- **Pre-Do anchor 우선**: IS-01(CS-04)·IS-03(CS-11 배타) 먼저 작성·실행해 실패 확보 후 설계 환류 (메모리 `feedback_pre_anchor_verification`).
- 원단위 `toBe()`, 항등식 `firstPayment + secondPayment === payableTax` 전 행 검증.
- 증여 통합 anchor: `gift-tax.ts`가 `cashDeferred = splitAmount` echo → 별지10호 ㊼·reportPay 검증 (`__tests__/tax-engine/gift/`).

---

## UI 통합 위임

- UI 명세: [`inheritance-gift-installment-split.ui.design.md`](./inheritance-gift-installment-split.ui.design.md).
- **세목 비대칭**: 상속 = 전부 클라이언트 투영(API 불필요). 증여 = 별지10호용 input 2필드(`applyInstallmentSplit`·`requestedSplitAmount`) → ④⑨⑫⑬⑭ + result echo (엔진 시니어 담당).
- 엔진 시니어 = 퓨어 함수 + `isInstallmentSplitEligible` + anchor + 증여 input/Zod/route/echo. UI 시니어 = 폼·위젯·결과카드·별지9호·validation.
