# 상속세 §69 신고세액공제 산출근거 echo — 엔진 설계

> 상위 계획: `docs/00-pm/inheritance-remaining-credit-deduction-gaps.plan.md` §2 (그룹 ②, 권장 PR 1순위)
> 단계: Design (1순위 항목 선행 디자인) · 도메인: 상속세 세액공제
> KoreanLaw 검증: 상증법 §69(신고세액공제 3%) — 계획서 §7-2에서 전문 대조 완료

## Context

증여세 경로(`calcGiftTaxCredits`)는 `filingCreditBase`·`totalComputedTaxWithSurcharge` 2개 echo 필드를 반환하여 `TaxCreditBreakdownCard`의 §69 산출근거 펼침을 활성화한다. **상속세 경로(`calcInheritanceTaxCredits`)는 이 echo를 반환하지 않아** 상속세 결과뷰에서 §69 펼침이 비활성(산식 노출 불완전)이다.

본 작업은 상속세 경로에 동일 echo 2필드를 추가하고, 카드 빌더의 §69 역산 표시에 **단기재상속공제(§30)** 항목을 추가한다(증여세엔 없는 상속세 전용 공제 — 1차 검토 C-2).

**numeric 무영향**: echo·카드 분기는 표시 전용. `totalCredit`·`finalTax` 불변.

## ★ 케이스 인벤토리 (필수)

| # | 케이스 | §28 증여세액공제 | §29 외국납부 | §30 단기재상속 | filingCreditBase 역산 | 카드 §69 표시 |
|---|---|---|---|---|---|---|
| EC-1 | 선행공제 전무 | 0 | 0 | 0 | totalWithSurcharge − 0 | `base = totalWithSurcharge`, 항목 0 |
| EC-2 | §28만 | >0 | 0 | 0 | tWS − giftCredit | `− 증여세액공제` 1줄 |
| EC-3 | §28+§29 | >0 | >0 | 0 | tWS − gift − foreign | `− 증여 − 외국납부` |
| EC-4 | **§30 포함** | ≥0 | ≥0 | **>0** | tWS − gift − foreign − **shortTerm** | **`− 단기재상속공제` 줄 추가 필수** |
| EC-5 | 법정기한 외 신고 | — | — | — | echo 유지, filingCredit=0 | **증여세 기존 동작과 동일** — 본 PR은 echo 반환만, 미신고 표시 로직 신규 변경 없음 |
| EC-6 | 회귀: 증여세 카드 | — | — | shortTerm=0 | 증여세 echo 불변 | §30 분기 비활성(무영향) |

> EC-4가 핵심 — 증여세 기준 카드 산식은 §30이 없어 상속세에서 항목 합 ≠ base 표시 불일치 발생.

## 법령 근거

- 상증법 §69 ①: 신고세액공제 = (산출세액 + 세대생략 할증 − §28·§29·§30 공제) × 3%. (법정신고기한 내 신고 시.)
- echo 필드는 §69 산식의 **분모(신고분 세액)**와 **산출세액 합계(할증 포함)** 노출 전용. 법령 계산값 변동 없음.

## 엔진 input 타입

변경 없음. `InheritanceTaxCreditParams`(기존) 그대로.

## 엔진 result 타입

`TaxCreditResult`(기존 정의, `types/inheritance-tax-credit.types.ts:46~61`) — optional echo 2필드는 **이미 정의됨**. 상속세 경로가 채우지 않을 뿐.

```ts
filingCreditBase?: number;              // = Math.max(0, remainingTax)  (§28·§29·§30 차감 후)
totalComputedTaxWithSurcharge?: number; // = computedTax + generationSkipSurcharge
```

## 계산 알고리즘 (단계별)

1. `calcInheritanceTaxCredits` 내 `remainingTax`는 §28(line 195)·§29(208)·§30(227) 차감을 이미 누적. `filingResult` 계산 후의 `remainingTax`(= filingCredit 차감 전 base) 사용.
2. return 객체(line 247~256)에 2줄 추가:
   ```ts
   filingCreditBase: Math.max(0, remainingTax),     // 단, §30 차감 후·§69 적용 전 값
   totalComputedTaxWithSurcharge: totalComputedTax,
   ```
   ⚠️ 정합 주의: `remainingTax`가 line 230 §69 계산 직전 값(= §28·§29·§30 차감 후)인지 확인. `calcFilingCredit`의 `taxBeforeFilingCredit`와 동일해야 함(현재 line 233 `Math.max(0, remainingTax)` 전달과 일치).

## Silent fallback / 자동 안분 후보 식별

- 없음. echo는 명시 값. fallback 도입 금지.

## 테스트 약속

- INH-ECHO-1: 상속세 결과 `creditDetail.filingCreditBase`·`totalComputedTaxWithSurcharge` 정의 + 값 일치 (원단위 toBe).
- INH-ECHO-2: `filingCreditBase × 3% === filingCredit` (법정기한 내 신고 케이스).
- INH-ECHO-3 (C-2): EC-4 §30>0 케이스 `totalComputedTaxWithSurcharge − giftTaxCredit − foreignTaxCredit − shortTermReinheritCredit === filingCreditBase` 역산 일치.
- 회귀: 기존 상속세 anchor 전수 `finalTax`·`totalCredit` 불변 (`npx vitest run __tests__/tax-engine/inheritance/`).

## UI 통합 위임 (inheritance-gift-tax-ui-senior)

- **카드 빌더 §30 분기 추가**: `components/calc/TaxCreditBreakdownCard.tsx` `buildSection69Formula`(line 78~)의 역산 표시에 `shortTermReinheritCredit > 0` 분기 추가:
  - 텍스트 줄: `… − 증여세액공제 [− 외국납부세액공제] [− 단기재상속공제] [− 조특 특례공제]`
  - 금액 줄: `… − <Amt shortTerm/>` 조건부.
  - 증여세는 `shortTermReinheritCredit` 항상 0 → 분기 비활성(무영향, EC-6).
  - ⚠️ **(E-2)** `allOthersZero` 변수(현재 `foreign === 0 && special === 0`)도 `&& shortTerm === 0`을 추가해야 함. 미수정 시 §30>0·foreign/special=0 상속세 케이스에서 "(외국납부·조특 특례 미적용)" 문구가 §30 적용 사실과 모순되게 표시됨.
- 결과뷰(`InheritanceTaxResultView`)는 `creditDetail` 그대로 전달 — 신규 위젯 불필요.
- 동기화: ⑦ 결과 카드만. ①~⑥·⑧~⑭ 변경 없음(입력 불변).
