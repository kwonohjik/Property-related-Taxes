# 상속세 배부·증여세액공제 계산 근거 펼침 — 엔진 설계

> Plan: `docs/00-pm/inheritance-allocation-calc-basis-breakdown.plan.md`
> UI: `docs/02-design/features/inheritance-allocation-calc-basis-breakdown.ui.design.md`
> 작성일: 2026-06-01

## Context

상속세 결과 화면의 집계 표(`HeirAllocationSummaryTable`, 이미지8)는 *1·*2·⑥·⑦⑧⑨·⑩·⑫ 행의
**결과값**을 표시한다. 그러나 교재(이미지5~7)처럼 각 값이 **어떤 산식·중간값으로 산출됐는지**는
보여주지 않는다. 사용자는 "상속공제 상세 내역"(`DeductionBreakdownSection`)과 **같은 펼침(▼) 방식**으로
6개 항목 계산 근거를 그 아래에서 조회하고 싶어 한다.

이 기능은 본질적으로 **detail 노출 패턴**(`project_inheritance_deduction_breakdown`)이다 — 엔진이 이미
계산한 중간값을 result echo로 끌어올려 UI가 산식으로 재조립한다. **계산 로직 변경 0**. 단,
⑦ 산출세액의 적용세율·누진공제만 echo가 없어 **echo 2필드 신설**(계산 영향 0)이 필요하다(Plan R1).

---

## ★ 케이스 인벤토리 (필수)

> **[D8] 테스트 파일 분리**: 엔진 echo anchor = `__tests__/tax-engine/inheritance/allocation-calc-basis-echo.test.ts`
> (node 환경). RTL 카드/조건부 = `__tests__/components/calc/AllocationBreakdownSection.test.tsx`(jsdom).

| # | 시나리오 | 표시 카드 | anchor 출처 | 테스트 파일 | 상태 |
|---|---------|----------|-------------|-----------|------|
| 1 | 종합사례: 영리법인+세대생략+사전증여(상속인·법인) 풀케이스 | *1·*2·⑥·⑦⑧⑨⑪·⑩·⑫ 6카드 전부 | 이미지5~7 + `comprehensive-case-pdf.fixture` | echo.test.ts + Section.test.tsx | ☐ TODO |
| 2 | ⑥㉡ 간접배부 분수 산식 | ⑥ 카드 | 이미지5 배우자 941,319,862 = 1,865M×2,935M/5,815M | echo.test.ts | ☐ TODO |
| 3 | ⑦ 산출세액 세율·누진공제 echo | ④ 카드 | 이미지6_c 1,627.5M=4,175M×50%−460M | echo.test.ts | ☐ TODO |
| 4 | ⑩ 영리법인 공제: ⑩a/⑩b(할증미포함)/합계⑩b(할증포함) | ⑤ 카드 | 이미지7 272,874,251 / 277,943,123 | echo.test.ts | ☐ TODO |
| 5 | ⑫ 한도 분수: ⑪×직접배부/⑥㉢ | ⑥ 카드 | 이미지7 배우자 68,028,777 | echo.test.ts | ☐ TODO |
| 6 | ⑥㉠ 증여공제 역산 (UI) | ⑥ 카드 | 배우자 600M=760M−160M / 맏아들 50M | Section.test.tsx | ☐ TODO |
| 7 | **영리법인 없는** 케이스 → ⑩ 카드 미표시 | (⑩ 숨김) | fixture 변형(corp 제거) | Section.test.tsx | ☐ TODO |
| 8 | **상속인 사전증여 없는**(영리법인만) → ⑫ 카드 미표시 (R2) | (⑫ 숨김) | fixture 변형 | Section.test.tsx | ☐ TODO |
| 9 | **단일 상속인·사전증여 0·영리법인 0** → *1/*2/⑥/⑦ 4카드만 | 4카드 | 단순 fixture(신규 생성, D5) | Section.test.tsx | ☐ TODO |

**규칙**: 행≥1 충족. 행 1 = anchor 1개 이상. 사용자 신규 케이스 → 먼저 행 추가 후 코드.

---

## 법령 근거

`lib/tax-engine/legal-codes/inheritance-gift.ts` 상수 사용 (문자열 리터럴 금지).

```
상증법 §26      : 상속세 세율 (10~50% 5단계 누진) — ⑦ 산출세액            → INH.TAX_RATE
상증법 §27①     : 세대생략 할증 / 할증과세 대상 과세가액(*2)
상증법 §28      : 증여세액공제 (사전증여 — 상속인·수유자, ⑫)
상증법 §3의2②   : 영리법인 면제 / 상속인·수유자 아닌 자 증여세액공제(⑩)
집행기준 19-17-1: 직접배부·간접배부 안분 산식 (⑥)
```

---

## 엔진 result 타입 — echo 매핑 (신규 계산 0)

### 기존 echo (그대로 소비 — Plan §1 probe 실측 확정)

| 항목 | echo 경로 | 종합사례 실측 |
|---|---|--:|
| *1 합계 | `summaryTable.distributableTaxBase` | 5,815,000,000 |
| *1 상속인별 | `perHeir[h].taxableValueShare − perHeir[h].priorGiftAmount` | 배우자 2,935M |
| *2 합계 | `summaryTable.surchargeTargetTaxableValue` | 8,075,000,000 |
| *2 상속인별 | `perHeir[h].taxableValueShare` (영리법인 제외) | — |
| ⑥㉠ | `perHeir[h].directTaxBaseShare` | 배우자 160M |
| ⑥㉡ | `perHeir[h].indirectTaxBaseShare` | 배우자 941,319,862 |
| ⑥㉡ 분자 | `heirAllocationResult.indirectNumerator` | 1,865,000,000 |
| ⑥㉡ 분모 | `heirAllocationResult.indirectDistributionBase` | 5,815,000,000 |
| ⑥㉢ | `perHeir[h].taxBaseShare` | 배우자 1,101,319,862 |
| *3 분모 | `heirAllocationResult.computedTaxShareDenominator` (=`summaryTable.distributableTaxBaseAfterGifts`, 동일 출처 `inheritance-tax.ts:745` 실측) | 3,475,000,000 |
| ⑦ | `computedTax` | 1,627,500,000 |
| ⑧ | `generationSkipSurcharge` | 30,232,198 |
| ⑨ | `computedTax + generationSkipSurcharge` | 1,657,732,198 |
| 배부대상 산출세액 | `heirAllocationResult.distributableTax` | 1,477,500,000 |
| ⑪ | `perHeir[h].computedTaxShare` | 배우자 468,259,020 |
| *5 | `perHeir[h].burdenRatio` | 배우자 0.3169 |
| ⑩a | `perHeir[corp].priorGiftComputedTax` ※ | 150,000,000 |
| ⑩b 영리법인 | `perHeir[corp].priorGiftCreditLimit` (=`corporateExemption.limit`) | 272,874,251 |
| ⑩b 합계 | `summaryTable.corporateExemptionLimitDisplay` (할증 포함) | 277,943,123 |
| ⑩c | `corporateExemption.amount` | 150,000,000 |
| ⑫a | `perHeir[h].priorGiftComputedTax` | 배우자 22,000,000 |
| ⑫b | `perHeir[h].priorGiftCreditLimit` | 배우자 68,028,777 |
| ⑫c | `perHeir[h].priorGiftCredit` | 배우자 22,000,000 |

> ※ **[Plan R11 의존성]** ⑩a `perHeir[corp].priorGiftComputedTax`=150M은 `corporate-10a-source-fix`
> (현재 작업트리 uncommitted) PriorGift 단일진실 수정에 의존. 선행 커밋 후 본 작업 진행. 미커밋 시 0 회귀 위험.
>
> **역산 항목** (echo 없음 — `engine-formula-reverse-derive`, UI 계산):
> - ⑩b 분자 영리법인 과세표준(700M) = `taxBase − computedTaxShareDenominator` (R4)
> - ⑥㉠ 증여재산공제 = `priorGiftAmount − directTaxBaseShare` (R8)

### 신규 echo 2필드 (R1 — STEP 8 산출세액)

```ts
// InheritanceTaxResult 에 optional 추가 (lib/tax-engine/types/inheritance-gift.types.ts)
/** ⑦ 산출세액 적용 한계세율 (§26) — 산식 표시용 echo. 예: 0.5 */
computedTaxAppliedRate?: number;
/** ⑦ 산출세액 누진공제액 (§26) — 산식 표시용 echo. 예: 460_000_000 */
computedTaxProgressiveDeduction?: number;
```

> **[D1 정정] 구현 방법 — 신설 순수 헬퍼로 bracket 조회** (실측 기반):
> STEP 8(`inheritance-tax.ts:521`)은 `calcInheritanceGiftTax(taxBase, brackets)`를 호출하는데 이 함수는
> **`number`(computedTax)만 반환** — rate·누진공제는 `calculateProgressiveTax` 내부 지역값이라 노출 안 됨.
> 따라서 `inheritance-gift-common.ts`에 **순수 헬퍼 신설**:
> ```ts
> export function findApplicableBracket(taxBase: number, brackets = DEFAULT_INHERITANCE_GIFT_BRACKETS) {
>   if (taxBase <= 0) return { rate: 0, deduction: 0 };
>   const b = brackets.find((x) => x.max === null || taxBase <= x.max) ?? brackets[brackets.length - 1];
>   return { rate: b.rate, deduction: b.deduction };
> }
> ```
> STEP 8에서 `const { rate, deduction } = findApplicableBracket(taxBase, brackets);` →
> `computedTaxAppliedRate = rate`·`computedTaxProgressiveDeduction = deduction` echo.
> **`calcInheritanceGiftTax`·`calculateProgressiveTax` 불변, computedTax 산정 불변 → 계산 영향 0.**
> bracket 구조 실측: `{min,max,rate,deduction}`. echo는 STEP 8 적용 `brackets`
> (`options.brackets ?? DEFAULT_INHERITANCE_GIFT_BRACKETS`, `inheritance-tax.ts:85`)에서 추출 →
> DB 주입 시 자동 추종(single-source, D6). 종합사례는 옵션 미주입 → DEFAULT → 과세표준 4,175M(30억 초과)
> `rate 0.5·deduction 460M`(`DEFAULT_INHERITANCE_GIFT_BRACKETS[4]`, 이미지6_c 정확히 일치).

- **fallback**: echo undefined(레거시·미구현)면 ④ 카드는 "§26 누진세율"(`LawArticleModal`)만 표시,
  ×rate−누진공제 산식 줄 생략. (dual-truth 회피 — UI가 세율표 재정의 금지)

---

## 계산 알고리즘 — 신규 순수 헬퍼 1개 (계산 영향 0)

- 엔진 변경은 **`findApplicableBracket` 순수 헬퍼 신설 + STEP 8 echo 2줄**뿐 (D1). computedTax 산정·배부
  산식 전부 불변.
- 나머지 22개 표시값은 기존 echo·UI 역산(R4 corporateGiftTaxBase, R8 증여공제)으로 충당.
- 배부 산식 자체(§3의2②·§28·집행기준 19-17-1)는 `inheritance-allocation.ts`에 이미 구현·검증됨
  (`heir-allocation-summary-table.engine.design.md`).

---

## Silent fallback / 자동 안분 — 해당 없음

- 입력(Input) 신규 0 → 자동 안분·빈값 채움 로직 없음.
- echo 2필드만 추가. validation 영향 0 (UI 표시 전용 result echo).
- ⑦ echo undefined 시 산식 줄 생략(앞 fallback) — 자동 보정 아닌 명시적 미표시.

---

## 테스트 약속

- 케이스 인벤토리 9행 → anchor (엔진 echo 4건 + RTL 카드/조건부 5건).
- echo 2필드 anchor: 종합사례 `computedTaxAppliedRate===0.5`·`computedTaxProgressiveDeduction===460_000_000`.
- 자기일관 anchor: 6카드 표시값 == `buildSummaryTable` 동일 행 값(동일 echo 소비).
- 1원 차이는 PDF trade-off 유지(`feedback_pdf_example_test_anchoring` — echo 값 기준 `toBe`).

---

## UI 통합 위임

- UI 명세: `inheritance-allocation-calc-basis-breakdown.ui.design.md` (단계 12 생성) — **분수 산식 줄
  표시 형식·카드 색조·섹션 번호·접힘 trigger·print 자동 펼침은 ui.design 책임** (D4).
- 엔진 시니어: `findApplicableBracket` 헬퍼 + echo 2필드(R1·D1) + anchor(`rate 0.5`·`deduction 460M`, D3).
- UI 시니어: 6 DetailCard + AllocationBreakdownSection + 결과뷰 통합 + RTL.

---

## 자가 검토 이력 (디자인)

### 검토 1차 — 4건
| # | 카테고리 | 우선순위 | 발견 → 정정 |
|---|---|---|---|
| D1 | 오류 | High | echo "보유값 노출" 부정확 → `findApplicableBracket` 신설 헬퍼로 정정 |
| D2 | 확인 | — | denominator 동일 출처(L745) 확인 — 정정 불요 |
| D3 | 개선 | Low | echo anchor 출처(`DEFAULT_INHERITANCE_GIFT_BRACKETS[4]`) 명시 |
| D4 | UI누락 | Medium | 표시 형식·색조·번호 ui.design 위임 명시 보강 |

### 검토 2차 — 4건
| # | 카테고리 | 우선순위 | 발견 → 정정 |
|---|---|---|---|
| D5 | 개선 | Low | 케이스9 단순 fixture 미존재 → ☐ TODO 유지, anchor 시 신규 생성 |
| D6 | 개선 | Low | echo는 `brackets`(options ?? DEFAULT) 적용값 추출 — DB 추종 명시 |
| D7 | 확인 | — | `findApplicableBracket` 기존 없음 — 신설 OK |
| D8 | 오류 | Medium | 테스트 파일 엔진(.test.ts)/RTL(.test.tsx) 분리 |

→ 엔진 디자인 검토 종결. 통합 비교(단계 10) 진입.
