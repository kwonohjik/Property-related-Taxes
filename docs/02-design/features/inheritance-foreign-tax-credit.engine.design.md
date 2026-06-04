# 상속세 외국납부세액공제 (§29 / 상증령 §21①) — 엔진 설계

> 계획서: `docs/00-pm/inheritance-foreign-tax-credit.plan.md` (검토×2 완료, 정정 8건 반영)
> UI 측: `inheritance-foreign-tax-credit.ui.design.md`

## Context

외국납부세액공제(§29)는 골격만 있는 **반쪽 구현**이다. 현재 외국납부세액(`foreignTaxPaid`) 1칸만 입력받고, 한도 변수 `foreignPropertyRatio`는 API·Zod·UI 어디서도 세팅되지 않아 항상 `undefined`(도달 불가 dead code) → 한도 분기가 늘 비활성 → **외국납부세액 전액이 산출세액 한도 내에서 무제한 공제**되는 과다공제 상태. 상증령 §21①이 정한 **국외재산 과세표준 점유비 한도**가 누락돼 있다. 또 엔진 주석(foreign-tax-credit.ts:7-8)은 한도를 "재산가액 비율"로 적었는데, 이는 1997.11.9 이전 구법 표현 — 현행(1997.11.10~)은 **과세표준 점유비**(드리프트).

본 작업은 신규 구현이 아니라 상증령 §21① Min 한도 + 결과 명세 펼침을 **법령 정합으로 완성**하는 것이다.

---

## ★ 케이스 인벤토리 (필수)

| # | 시나리오 | 법령 근거 | anchor 출처 | 테스트 파일 | 상태 |
|---|---------|----------|-------------|-----------|------|
| FTC-01 | 교재 공식 사례 — 한도①(3.75억) < 외국세액②(4억) → 공제 = ① | 상증령 §21① 본문 | 교재 460–461p (산출 15억·국외과표 10억·전체과표 40억) | `foreign-tax-credit.test.ts` | ☐ TODO |
| FTC-02 | 외국세액②(3억) < 한도①(3.75억) → 공제 = ② | 상증령 §21① 단서 | 교재 변형 | `foreign-tax-credit.test.ts` | ☐ TODO |
| FTC-03 | 국외 과세표준 미입력(undefined) → 한도 0 → 공제 0 | §21① (분자 부재) | 경계 | `foreign-tax-credit.test.ts` | ☐ TODO |
| FTC-04 | 전체 과세표준 = 0 → c=0 방어 → 공제 0 | safeMultiplyThenDivide | 경계 | `foreign-tax-credit.test.ts` | ☐ TODO |
| FTC-05 | 국외과표 ≥ 전체과표(비율 100%) → 한도 = 산출세액 전액 | §21① (점유비 1.0) | 경계 | `foreign-tax-credit.test.ts` | ☐ TODO |
| FTC-06 | 외국세액 = 0 → 조기 반환, "해당 없음", detail undefined | §29 (대상 없음) | 경계 | `foreign-tax-credit.test.ts` | ☐ TODO |
| FTC-07 | 소액 floor 검증 (1001×1÷3 = 333) | 정수연산 (Math.round 금지) | 경계 | `foreign-tax-credit.test.ts` | ☐ TODO |
| FTC-08 | **(통합·R1)** §28 증여세액공제 존재 시 — 한도가 `totalComputedTax`(원 산출세액) 기준 + 공제 후보가 `remainingTax`(§28 차감 후) 초과 시 잔액 클램핑 | §21①(한도) + 순차공제 | 교재+§28 합성 | `inheritance-foreign-credit-integration.test.ts` | ☐ TODO |
| FTC-09 | **(회귀·D1)** gift §59 — `overallTaxBase` 미전달 → 한도 = computedTax 전액(기존 동작 보존) | calcForeignTaxCredit mode 분기 | 회귀 가드 | `foreign-tax-credit.test.ts` | ☐ TODO |

**규칙**: FTC-01~07 = `calcForeignTaxCredit` **단위**(클램핑 전, `computedTax`=산출세액 원본 직접 입력, "기대 공제"=`Min(외국세액, 한도①)`). FTC-08 = `calcInheritanceTax` **통합**(호출부 잔액 클램핑 검증).

---

## 법령 근거

`lib/tax-engine/legal-codes/inheritance-gift.ts` 상수 사용 강제 (`TAX_CREDIT.INH_FOREIGN = "상증법 §29"`, 신규 `INH_FOREIGN_LIMIT = "상증령 §21①"`).

```
상증법 §29 (외국 납부세액 공제):
  거주자의 사망으로 상속세를 부과하는 경우에 외국에 있는 상속재산에 대하여
  외국의 법령에 따라 상속세를 부과받은 경우에는 대통령령으로 정하는 바에 따라
  그 부과받은 상속세에 상당하는 금액을 상속세산출세액에서 공제한다.

상증령 §21① (외국납부세액공제):
  법 제29조에 따라 상속세산출세액에서 공제할 외국납부세액은 다음 계산식에 따라
  계산한 금액으로 한다. 다만, 그 금액이 외국의 법령에 따라 부과된 상속세액을
  초과하는 경우에는 그 상속세액을 한도로 한다.

  [계산식 = 교재 460–461p 정식 표현 (법전엔 수식 이미지)]
    공제액 = Min( ① , ② )
      ① = 상속세 산출세액 × ( 외국 법령에 따라 상속세가 부과된 상속재산의 과세표준
                            ÷ 상증법 §25① 상속세 과세표준 )
      ② = 외국 법령에 따라 부과된 상속세액

  ※ "상속세 산출세액"은 §28 증여세액공제 등 세액공제 차감 前 원 산출세액 (R1).
  ※ 개정연혁: 1997.11.9 이전 = 재산가액 점유비 → 1997.11.10~ 과세표준 점유비.
```

---

## 엔진 input 타입

```ts
// lib/tax-engine/credits/foreign-tax-credit.ts
export interface ForeignTaxCreditInput {
  /** 외국에서 부과된 상속·증여세액 (= 한도 비교 대상 ②) */
  foreignTaxPaid: number;
  /** 상속세 산출세액 — §28 차감 前 원본(R1). 한도① 계산 기준. (구: remainingTax 전달 → 정정) */
  computedTax: number;
  /** 국외 상속재산 과세표준 (§21① 한도식 분자). 미입력/0 → 한도 0 → 공제 0 (FTC-03) */
  foreignInheritanceTaxBase?: number;
  /**
   * §25① 상속세 전체 과세표준 (분모). calcInheritanceTaxCredits이 엔진 taxBase 주입.
   * undefined(gift §59 호출부 — 미전달) → 한도 = computedTax 전액(기존 동작 보존, D1 회귀 방지).
   * number(inheritance 호출부 — taxBase ?? 0) → §21① 점유비 한도.
   */
  overallTaxBase?: number;
  /** @deprecated 도달 불가 dead code — 제거. (구 한도 분기) */
  foreignPropertyRatio?: number;
  mode: "inheritance" | "gift";
}

// lib/tax-engine/types/inheritance-tax-credit.types.ts — InheritanceTaxCreditInput에 추가
foreignInheritanceTaxBase?: number;  // 국외 상속재산 과세표준 (§21① 분자)
```

## 엔진 result 타입

```ts
// foreign-tax-credit.ts
export interface ForeignTaxCreditDetail {
  computedTax: number;               // 산출세액(원본) — 산식 "산출세액 × ..." 표시용 (P1)
  foreignTaxPaid: number;            // ②
  foreignInheritanceTaxBase: number; // 분자
  overallTaxBase: number;            // 분모
  creditLimit: number;               // 한도① = floor(computedTax × 분자/분모)
  creditAmount: number;              // Min(②, 한도①) — 클램핑 前 (호출부에서 최종 덮어씀)
}
export interface ForeignTaxCreditResult {
  creditAmount: number;
  breakdown: CalculationStep[];
  detail?: ForeignTaxCreditDetail;   // foreignTaxPaid>0 일 때만
}

// types/inheritance-tax-credit.types.ts — TaxCreditResult에 추가
foreignCreditDetail?: {
  computedTax: number;
  foreignTaxPaid: number;
  foreignInheritanceTaxBase: number;
  overallTaxBase: number;
  creditLimit: number;
  creditAmount: number;  // 최종(잔액 클램핑 후) — calcInheritanceTaxCredits이 조립
};
```

새 Date 필드 없음 (금액 정수만).

---

## 계산 알고리즘 (단계별)

### `calcForeignTaxCredit(input)` — 순수 함수
1. `foreignTaxPaid <= 0` → `{ creditAmount: 0, breakdown: ["해당 없음"], detail: undefined }` 조기 반환 (FTC-06).
2. 한도 분기 (D1 — gift 회귀 방지):
   - `overallTaxBase === undefined` (gift §59 호출부) → `creditLimit = computedTax` (기존 전액 공제 동작 보존, FTC-09).
   - `overallTaxBase !== undefined` (inheritance 호출부, `taxBase ?? 0`) → `creditLimit = safeMultiplyThenDivide(computedTax, foreignInheritanceTaxBase ?? 0, overallTaxBase)`.
   - 분자 0 → 0 (FTC-03), 분모 0 → `c===0` 방어로 0 (FTC-04), 1.5e18 → BigInt 경로 (FTC-01), 점유비≥1 → computedTax로 수렴 (FTC-05), floor 적용 (FTC-07).
   - **`applyRate`(float 비율 곱) 금지** — overflow·정밀도 손실.
3. `creditAmount = Math.min(foreignTaxPaid, creditLimit)`.
4. `detail`은 **`overallTaxBase !== undefined`(inheritance)일 때만** 조립 (D5): `{ computedTax, foreignTaxPaid, foreignInheritanceTaxBase ?? 0, overallTaxBase, creditLimit, creditAmount }`. gift(undefined)는 `detail: undefined` — 점유비 한도 미적용이라 §21① 산식이 무의미.
5. `breakdown`:
   - inheritance(overallTaxBase 전달) = Min(①,②) 3단계 (① 외국세액 / ② 한도계산식+note / ③ 공제=Min). lawRef: §29 + 상증령 §21①.
   - gift(undefined) = 기존 breakdown 유지(한도=산출세액 전액). lawRef §59. mode 분기 (D6, 범위 밖).

### `calcInheritanceTaxCredits(...)` STEP 2 호출부 — R1 정정
```
const foreignResult = calcForeignTaxCredit({
  foreignTaxPaid: creditInput.foreignTaxPaid ?? 0,
  computedTax: totalComputedTax,                          // R1: remainingTax → totalComputedTax(원본)
  foreignInheritanceTaxBase: creditInput.foreignInheritanceTaxBase,
  overallTaxBase: taxBase ?? 0,                           // 엔진 보유 과세표준 주입
  mode: "inheritance",
});
const foreignTaxCredit = Math.min(foreignResult.creditAmount, remainingTax);  // 잔액 클램핑 (§30 패턴)
const foreignCreditDetail = foreignResult.detail
  ? { ...foreignResult.detail, creditAmount: foreignTaxCredit }               // 최종으로 덮어씀 (P1·P3)
  : undefined;
remainingTax -= foreignTaxCredit;
```
`foreignPropertyRatio` 전달(`:233`) 제거. result에 `foreignCreditDetail` 노출.

**gift(§59) 호출부(`:404-410`) — 범위 밖, 회귀 방지만 (D1·D2)**: `computedTax: totalComputedTax`(이미 원본) 유지, `foreignPropertyRatio`(`:408`) 전달 제거. `overallTaxBase` 미전달 → 한도 = computedTax 전액(기존 동작 보존). §59 점유비 한도 본격 구현은 후속(계획서 §10).

---

## Silent fallback / 자동 안분 후보 식별

- **`foreignInheritanceTaxBase` 미입력 → 한도 0 → 공제 0** (FTC-03). 자동 안분이 아니라 **한도 조건 미충족**(memory `feedback_no_silent_apportion_fallback`). 빈값을 전체 과세표준 등으로 자동 채우지 **않음**.
- **분모(전체 과세표준)는 엔진 `taxBase` 단일 주입** — 사용자 입력 없음(dual-truth 회피, `feedback_ui_engine_dual_truth_avoidance`).
- validation(⑧): `foreignInheritanceTaxBase` 음수 차단(V-29-2). "외국세액만 입력+과표 미입력"은 hint 안내(차단 아님 — 납세자가 한도 없이 신고 가능), "과표만 입력+외국세액 미입력"은 무의미 입력 안내(V-29-3). UI 통과 ↔ validate 차단 모순 금지.

---

## 테스트 약속

- 케이스 인벤토리 FTC-01~08 전부 anchor. 교재 수치는 **법정 산식 직접 계산값**으로 원단위 `toBe()` (memory `feedback_pdf_example_test_anchoring`·`feedback_transfer_year_tax_rate`).
- FTC-01: `expect(calcForeignTaxCredit({ foreignTaxPaid: 400_000_000, computedTax: 1_500_000_000, foreignInheritanceTaxBase: 1_000_000_000, overallTaxBase: 4_000_000_000, mode: "inheritance" }).creditAmount).toBe(375_000_000)`.
- FTC-08(통합): §28 증여세액공제 존재 입력 → §29 한도가 `totalComputedTax` 기준임을 검증 + 공제 후보가 `remainingTax` 초과 시 클램핑.
- BigInt 경로(FTC-01, 1.5e18 > MAX_SAFE)와 NUMBER 경로(FTC-07) 분리 검증.

---

## UI 통합 위임

- UI 명세는 `inheritance-foreign-tax-credit.ui.design.md`.
- 14개 동기화 지점 중 ⑤⑥⑦⑧은 UI 시니어 책임. 엔진 시니어는 input/result 타입(`foreignInheritanceTaxBase`, `foreignCreditDetail`) + 알고리즘만.
- 결과 명세: `TaxCreditBreakdownCard`의 §29 `CreditRow`에 `formula` 연결(`buildSection29Formula(foreignCreditDetail)`) + 카드를 상속세 결과뷰에 렌더(숨김 해제) — §28·§30·§69와 동일한 ▼펼침 (사용자 요구).
