# §24③·§19 분자 §53의2(혼인·출산 증여재산공제) 자동 차감 — 엔진 설계

> 계획서: `docs/00-pm/inheritance-section24-marriage-birth-deduction.plan.md`
> UI 설계: `docs/02-design/features/inheritance-section24-marriage-birth-deduction.ui.design.md`
> 작성일: 2026-06-07 / 13단계 자가검토 STEP 5

## Context

상속세 §24③(공제 한도) + §19(배우자공제) 분자에서 **사전증여 가산가액 − 증여재산공제**를 계산할 때, 법문상 §53·§53의2·§54를 모두 빼야 하나 자동 도출(`giftTaxBase` 미설정 분기)이 **§53만 반영하고 §53의2(혼인·출산, 직계존속, 통합 1억)를 누락**한다. 결과적으로 분자 차감 과소 → §24 ceiling 과소 → 상속공제 과소 → **세액 과대(납세자 불리)**. `giftTaxBase` 명시 분기는 이미 정확(과세표준에 §53의2 포함). 같은 갭이 §24 분자(`inheritance-deduction-limit.ts`)와 §19 배우자 분자(`inheritance-tax.ts`) 두 곳에 존재.

---

## ★ 케이스 인벤토리 (필수)

| # | 시나리오 | 법령 근거 | anchor 출처 | 테스트 파일 | 상태 |
|---|---------|----------|-------------|-----------|------|
| 1 | §24 분자 §53의2 반영 — 혼인증여 1.5억(§53 5천만+§53의2 1억)·giftTaxBase 미설정 → `computePriorGiftDeductionForLimit` 반환 **1.5억**(현행 5천만) | §24③(§53·§53의2·§54) | 산식 도출 | `section24-marriage-birth.test.ts` | ☐ TODO |
| 2 | branch1 이중차감 0 (회귀) — giftTaxBase 명시 + marriageBirthDeduction 동시 → giftTaxBase만 사용 | §24③ branch 1 | 회귀 | 〃 | ☐ TODO |
| 3 | per-gift 통합 1억 캡 — marriageBirthDeduction 1.5억 오입력 → 1억 | §53의2③ | 방어 | 〃 | ☐ TODO |
| 4 | §24 단서(과세가액 ≤ 5억) — netPriorGiftDeducted 0 → 무해 | §24 단서 | 경계 | 〃 | ☐ TODO |
| 5 | §19 배우자 분자 §53의2 — 배우자가 직계존속(친정)으로부터 혼인증여 1.5억(doneeId=배우자·doneeRelation=lineal_ascendant·marriageBirthDeduction=1억) → spouseGiftTaxBase = max(0, 1.5억−5천만−1억)=**0**(현행 1억) | §19·§53의2① | 정합 | 〃 | ☐ TODO |
| 6 | 회귀 — marriageBirthDeduction undefined → 기존(§53만) 결과 완전 동일 | (회귀) | 회귀 | 〃 | ☐ TODO |

**규칙**: 행≥1 충족. MB-01 Pre-Do anchor(현행 RED — §53만 반영).

---

## 법령 근거 (KoreanLaw MCP mst 276123 검증)

```
§24 3호: 가산 증여재산가액 − (§53·§53의2·§54 공제받은 금액)  [과세가액 5억 초과 시만]
§53의2① 직계존속→혼인일 전후 2년 증여 → 1억 (§53 별개)
§53의2② 직계존속→출생·입양일부터 2년 증여 → 1억 (§53 별개)
§53의2③ ①+② 합산 1억 한도 (수증자별 통합, 초과 불공제)
§19 배우자공제 법정상속분 한도 분자도 사전증여 과세표준 차감 시 동일 적용
```

기존 헬퍼: `calcMarriageBirthDeduction`(`gift-deductions.ts:116`), `isMarriageBirthEligibleRelation`(`:99`), `calcRelationDeduction`(`:58`, §53).

---

## 엔진 input 타입

```ts
// types/inheritance-prior-gift.types.ts — PriorGift 에 추가
/**
 * 그 사전증여에 적용된 §53의2 혼인·출산 증여재산공제액 (직계존속, 통합 1억 한도).
 * §24③·§19 분자에서 giftTaxBase 미설정 분기에서만 사용 (giftTaxBase 명시 시 무시 — 이미 반영).
 * 값은 증여 시점에 1억 캡 적용된 실액.
 */
marriageBirthDeduction?: number;
```

## 엔진 result 타입

변경 없음. §53의2 포함 합계가 기존 `priorGiftDeductionTotal` → `DeductionLimitCeilingDetail.priorGiftDeductionTotal` echo 경로로 자동 흐름. 배우자 분자 변화는 `§19 배우자 법정상속분` breakdown note에 자동 반영.

---

## 계산 알고리즘

### A. §24 분자 — `inheritance-deduction-limit.ts` branch 2 (`:136~141`)
```
} else if (g.doneeRelation) {
  relationSums.set(g.doneeRelation, (relationSums.get(g.doneeRelation) ?? 0) + g.giftAmount);
  if (g.marriageBirthDeduction && g.marriageBirthDeduction > 0) {
    explicitTotal += Math.min(g.marriageBirthDeduction, 100_000_000);  // §53의2 (per-gift 캡)
  }
}
```
→ 반환 `explicitTotal + groupedTotal`에 §53의2 포함.

### B. §19 배우자 분자 — `inheritance-tax.ts:305~309` branch 2
```
const ded = calcRelationDeduction({ donorRelation: g.doneeRelation, priorUsedDeduction: 0 }, g.giftAmount).relationDeduction;
const mbDed = Math.min(g.marriageBirthDeduction ?? 0, 100_000_000);  // §53의2 동일 규칙
return s + Math.max(0, g.giftAmount - ded - mbDed);
```

### 불변식
- branch 1(`giftTaxBase !== undefined`): 즉시 return → `marriageBirthDeduction` 미참조 (이중차감 0).
- §24 단서: `applyDeductionLimit`이 과세가액 ≤ 5억 시 `netPriorGiftDeducted=0`으로 차단.
- 영리법인(giftTaxBase=giftAmount): 공제 0, §53의2 미해당.
- 정수 연산(`Math.min`/`Math.max`), floor 불요.

---

## Silent fallback / 자동 안분 후보 식별

- `marriageBirthDeduction` 미입력(undefined) → 0 처리 = 기존 동작(§53만). **자동 안분 아님** — 미입력은 "§53의2 없음" 또는 giftTaxBase 경로 의미. 보수적(과대공제 방지).
- **per-donee 집계 1억 캡 미적용**(v1 한계): per-gift `min(x,1억)`만. 정상 입력(실액 모델)은 합산 ≤1억. validation per-gift로 갈음.

---

## 테스트 약속

- 케이스 1~6 anchor. MB-01 **Pre-Do 우선**(RED 확보 — 현행 §53만).
- MB-02·MB-06 회귀(이중차감 0·미입력 불변).
- 전체 `npm test` 회귀 0 (사전증여·배우자공제 기존 anchor 불변).

---

## UI 통합 위임

- UI 명세: `inheritance-section24-marriage-birth-deduction.ui.design.md`.
- 엔진 시니어: `PriorGift.marriageBirthDeduction` 타입 + 두 분기 수정 + anchor.
- UI 시니어: GiftRowEditor 위젯·validation·Zod·makeEmptyGift.
- 엔진 선행 → UI 후행.
