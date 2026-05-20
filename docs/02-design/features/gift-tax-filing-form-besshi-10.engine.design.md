# 증여세 신고서 양식 — 별지 제10호서식 [2020.03.13 개정] 재현 — 엔진·UI 디자인

> **범위 제한**: 증여세 결과 화면 전용. 양도세·상속세·재산세·종부세·취득세는 diff 0건.
> 계획서: [`docs/00-pm/gift-tax-filing-form-besshi-10.plan.md`](../../00-pm/gift-tax-filing-form-besshi-10.plan.md)

- 작업 일자: 2026-05-20
- 담당: inheritance-gift-tax-senior (엔진) + inheritance-gift-tax-ui-senior (UI)
- 사례: PDF 별지 제10호서식 [2020.03.13. 개정] / "증여세과세표준신고 및 자진납부계산서 (기본세율 적용 증여재산 신고용)"

---

## 1. 개요

`GiftTaxResult` 에 별지 표시 전용 13개 optional 필드를 추가하고, `lib/tax-engine/gift-tax-filing-form-besshi10.ts` 신규 빌더가 ⑰~㊼ + 납부방법 헤더 + 신고납부 도출 행을 좌·우 두 컬럼 배열로 생성한다. UI는 2-column grid로 PDF 양식과 동형으로 렌더한다.

기존 `aggregatedGiftValue`·`taxBase`·`computedTax`·`finalTax` 산식 **불변**. 신규 13 필드는 모두 default 0이라 회귀 0건.

---

## 2. PDF ↔ 변수명 1:1 매핑 (★ 동결 표)

### 2.1 좌측 컬럼 — 과세가액·과세표준·산출세액

| 행 | 라벨 (PDF 그대로) | 값 / 산식 | 엔진 변수 (실측) | 출처 / 근거 |
|---|---|---:|---|---|
| ⑰ | 증여재산가액 | grossGiftValue | `result.grossGiftValue` | 상증법 §60 |
| ⑱ | 비과세재산가액 | exemptAmount | `result.exemptAmount` (기존) | §46·§46의2 |
| ⑲ | 공익법인 출연재산가액 (불산입) | 0 default | **신규** `result.publicInterestExclusion` | §48 |
| ⑳ | 공익신탁 재산가액 (불산입) | 0 default | **신규** `result.publicTrustExclusion` | §52 |
| ㉑ | 장애인 신탁 재산가액 (불산입) | 0 default | **신규** `result.disabledTrustExclusion` | §52의2 |
| ㉒ | 채무액 | 0 default (부담부증여 후속 PR) | **신규** `result.debtAssumed` | §47 |
| ㉓ | 증여재산가산액 | 사전증여 합산분 = aggregatedGiftValue − (grossGiftValue − exemptAmount) | **도출** 빌더 내부 | §47② |
| ㉔ | 증여세과세가액 | ⑰−⑱−⑲−⑳−㉑−㉒+㉓ ≡ `aggregatedGiftValue` (현 PR ⑲⑳㉑㉒=0이면 자기일관) | `result.aggregatedGiftValue` | §47 |
| ㉕ | 배우자 공제 | donor==spouse 시 relationDeduction, 그 외 0 | **도출** (§2.3 헬퍼) | §53 |
| ㉖ | 직계존비속 공제 | donor==직계 시 relationDeduction + marriageBirthDeduction, 그 외 0 | **도출** (§2.3 헬퍼) | §53·§53의2 |
| ㉗ | 그 밖의 친족 공제 | donor==sibling/other_relative 시 relationDeduction, 그 외 0 | **도출** (§2.3 헬퍼) | §53 |
| ㉘ | 재해손실공제 | 0 default | **신규** `result.disasterLossDeduction` | §54 |
| ㉙ | 감정평가수수료 | 0 default — 500만원 한도 | **신규** `result.appraisalFeeDeduction` | 시행령 §52의2 (Do 진입 전 KoreanLaw MCP 확정) |
| ㉚ | 과세표준 | ㉔−㉕−㉖−㉗−㉘−㉙ ≡ `taxBase` (현 PR ㉘㉙=0이면 자기일관) | `result.taxBase` | §55 |
| ㉛ | 세율 (단계) | 누진세율 단계 라벨 ("40%" 등) | **도출** (§2.3 헬퍼 `resolveBracketLabel`) | §56 |
| ㉜ | 산출세액 | computedTax = taxBase × 누진세율 − 누진공제 | `result.computedTax` | §56 |
| ㉝ | 세대생략가산세 | §57 surchargeAmount (그룹 B만 not null) | `result.generationSkipSurchargeDetail?.surchargeAmount ?? 0` | §57 |
| ㉞ | 산출세액계 | ㉜+㉝ | **도출** | — |
| ㉟ | 이자상당액 | 0 default | **신규** `result.interestEquivalent` | §41의5·§71⑤ 등 (KoreanLaw MCP 확정) |
| ㊱ | 박물관자료 등 징수유예세액 | 0 default | **신규** `result.museumDeferredTax` | §75 |

### 2.2 우측 컬럼 — 세액공제·가산세·자진납부

| 행 | 라벨 (PDF 그대로) | 값 / 산식 | 엔진 변수 (실측) | 출처 / 근거 |
|---|---|---:|---|---|
| ㊲ | 세액공제 합계 (㊳+㊴+㊵+㊶) | totalTaxCredit ≡ creditDetail.totalCredit | `result.totalTaxCredit` | — |
| ㊳ | 기납부세액 | 사전증여분 §58 안분 한도 후 — 코드 필드명은 `giftTaxCredit` (상속·증여 공통 구조) | `result.creditDetail.giftTaxCredit` | §58 |
| ㊴ | 외국납부세액공제 | foreignTaxCredit | `result.creditDetail.foreignTaxCredit` | §59 |
| ㊵ | 신고세액공제 | filingCredit (= 산출세액 × 3% 단, 한도) | `result.creditDetail.filingCredit` | §69 |
| ㊶ | 그 밖의 공제·감면세액 | specialTreatmentCredit (조특법 §30의5·§30의6) | `result.creditDetail.specialTreatmentCredit` (기존) | 조특법 §30의5·§30의6 |
| ㊷ | 신고불성실가산세 | 0 default — 자동계산 후속 PR | **신규** `result.underreportPenalty` | 국기법 §47의2·§47의3 |
| ㊸ | 납부지연가산세 | 0 default | **신규** `result.latePaymentPenalty` | 국기법 §47의4 |
| ㊹ | 공익법인 등 관련 가산세 | 0 default | **신규** `result.publicInterestPenalty` | §78 |
| ㊺ | 자진납부할 세액(합계액) | ㉞+㉟−㊱−㊲+㊷+㊸+㊹ ≡ finalTax (현 PR ㉟㊱㊷㊸㊹=0이면 자기일관) | `result.finalTax` | — |
| (헤더) | 납부방법 | column=right, display="header", 금액 무 | — | — |
| ㊻ | 연부연납 | 0 default — 6년 분납 (1천만원 초과) | **신규** `result.installmentPayment` | §71 |
| ㊼ | 현금 분납 | 0 default — 1천만원 초과 시 2개월 내 | **신규** `result.cashDeferred` | §70② |
| (도출) | 신고납부 | ㊺−㊻−㊼ | **도출** | — |

### 2.3 도출 헬퍼 (빌더 내부 함수)

```ts
// gift-tax-filing-form-besshi10.ts 내부 헬퍼 (export 없이)
// ★ GiftDonorRelation 실측 8값: father·mother·grandparent·spouse·lineal_descendant·sibling·other_relative·other
//   (lineal_ascendant 는 enum 에 없음 — 직계비속이 증여하는 케이스는 lineal_descendant)

const LINEAL_ASCENDANT_DONORS: GiftDonorRelation[] = ["father", "mother", "grandparent"];
const LINEAL_DESCENDANT_DONORS: GiftDonorRelation[] = ["lineal_descendant"];
const OTHER_RELATIVE_DONORS: GiftDonorRelation[] = ["sibling", "other_relative"];

function deriveRelationDeductionSplit(
  donor: GiftDonorRelation,
  d: GiftDeductionResult,
): { spouse: number; lineal: number; other: number } {
  const rel = d.relationDeduction;
  const mb = d.marriageBirthDeduction; // §53의2 — 직계존속(father/mother/grandparent) 으로부터 받을 때만 not 0
  if (donor === "spouse") return { spouse: rel, lineal: 0, other: 0 };
  if (LINEAL_ASCENDANT_DONORS.includes(donor)) {
    return { spouse: 0, lineal: rel + mb, other: 0 };
  }
  if (LINEAL_DESCENDANT_DONORS.includes(donor)) {
    return { spouse: 0, lineal: rel, other: 0 }; // 직계비속 → 직계존속 증여 (§53의2 미적용)
  }
  if (OTHER_RELATIVE_DONORS.includes(donor)) {
    return { spouse: 0, lineal: 0, other: rel };
  }
  return { spouse: 0, lineal: 0, other: 0 }; // "other" 등 비공제 그룹
}

function derivePriorGiftAddition(r: GiftTaxResult): number {
  // 사전증여 합산분만 (현재 증여 본체 제외)
  const netCurrent = Math.max(0, r.grossGiftValue - r.exemptAmount);
  return Math.max(0, r.aggregatedGiftValue - netCurrent);
}

function resolveBracketLabel(taxBase: number, brackets: TaxBracket[]): string {
  // brackets 구조: { min: number, max: number | null, rate: number, deduction: number }
  // (inheritance-gift-common.ts DEFAULT_INHERITANCE_GIFT_BRACKETS)
  const b = brackets.find((br) => taxBase >= br.min && (br.max === null || taxBase <= br.max));
  return `${Math.round((b?.rate ?? 0) * 100)}%`;
}
```

---

## 3. 타입 변경 명세

### 3.1 `FilingFormRow` 확장 (`lib/tax-engine/types/inheritance-gift.types.ts`)

```ts
export interface FilingFormRow {
  /** "⑰" ~ "㊼" PDF 표 행 번호. 도출 행(신고납부)은 빈 문자열, 헤더(납부방법)도 빈 문자열 */
  number: string;
  label: string;
  amount: number;
  /** "header" = 그룹 머리글 행 (납부방법) — 단일 신호로 통일 (groupHeader 중복 필드 X) */
  display: "amount" | "dash" | "rate" | "header";
  formula?: string;
  lawRef?: string;
  // ===== 별지 제10호서식 표시 전용 (신규) =====
  /** 2-column grid 배치 — "left" = 좌측 20행, "right" = 우측 13행 */
  column?: "left" | "right";
}
```

기존 `display: "amount" | "dash" | "rate"` → `"header"` 추가 (literal union 확장). 기존 사례 1·2 (`buildFilingFormRows` in `gift-filing-form-rows.ts`)는 `display: "amount"|"dash"|"rate"`만 사용하므로 호환. `column` 은 신규 빌더만 사용 (구 빌더는 undefined → UI 단일 컬럼 fallback).

### 3.2 `GiftTaxResult` 신규 13 필드 (모두 optional, default 미설정 시 0)

```ts
export interface GiftTaxResult extends TaxResultMeta {
  // ...기존 필드 모두 유지

  // ===== 별지 제10호서식 표시 전용 (default 0, 회귀 영향 없음) =====
  publicInterestExclusion?: number;    // ⑲ §48
  publicTrustExclusion?: number;       // ⑳ §52
  disabledTrustExclusion?: number;     // ㉑ §52의2
  debtAssumed?: number;                // ㉒ §47 (부담부증여 — 본 PR 범위 외)
  disasterLossDeduction?: number;      // ㉘ §54
  appraisalFeeDeduction?: number;      // ㉙ 시행령 §52의2
  interestEquivalent?: number;         // ㉟
  museumDeferredTax?: number;          // ㊱ §75
  underreportPenalty?: number;         // ㊷ 국기법 §47의2/§47의3
  latePaymentPenalty?: number;         // ㊸ 국기법 §47의4
  publicInterestPenalty?: number;      // ㊹ §78
  installmentPayment?: number;         // ㊻ §71
  cashDeferred?: number;               // ㊼ §70②
}
```

### 3.3 `gift-tax.ts` 변경

`calcGiftTax()` 결과 객체에 13 필드 echo (전부 0 default) + 별지 양식 행 배열 attach:

```ts
import { buildBesshi10Rows } from "./gift-tax-filing-form-besshi10";

// ...기존 STEP 1~10 (filingFormRows 빌드까지)

const besshi10Rows = buildBesshi10Rows(input, partialResult, brackets);
// ↑ partialResult = 위에서 만든 result (besshi10Rows 제외 모든 필드 채워진 상태)

return {
  // ...기존 필드들 (filingFormRows: legacy 그대로 유지)

  // 별지 양식 표시 전용 — 본 PR 모두 0
  publicInterestExclusion: 0,
  publicTrustExclusion: 0,
  disabledTrustExclusion: 0,
  debtAssumed: 0,
  disasterLossDeduction: 0,
  appraisalFeeDeduction: 0,
  interestEquivalent: 0,
  museumDeferredTax: 0,
  underreportPenalty: 0,
  latePaymentPenalty: 0,
  publicInterestPenalty: 0,
  installmentPayment: 0,
  cashDeferred: 0,
  // 별지 양식 행 배열 (UI는 본 배열만 읽음)
  besshi10Rows,
};
```

추가로 `GiftTaxResult`에 `besshi10Rows: FilingFormRow[]` 필드(non-optional, 빌더 결과 직접 echo) 신설. `filingFormRows`는 본 PR에서 **유지** (호환). 후속 PR에서 제거.

**빌더 호출 위치 결정**: 엔진 attach 채택 (UI 호출 옵션 기각). 이유:
- `brackets`(`TaxBracket[]`)는 엔진 내부 상수 — UI에 노출하지 않는 게 더 단순.
- UI는 `result.besshi10Rows`만 읽음 — 컴포넌트 props 최소화.
- 후속 PR에서 `besshi10Rows`가 default 양식이 되고 `filingFormRows` 제거 시 자연스러운 전환.

---

## 4. 빌더 시그니처 — `gift-tax-filing-form-besshi10.ts` (신규)

```ts
/**
 * 별지 제10호서식 [2020.03.13. 개정] 행 빌더.
 * 좌측 20행 (⑰~㊱) + 우측 13행 (㊲~㊺ 9 + 납부방법 헤더 1 + ㊻㊼ 2 + 신고납부 도출 1) = 총 33행.
 *
 * 호출처: gift-tax.ts 의 calcGiftTax() 마지막 단계 (엔진 attach).
 * UI 는 result.besshi10Rows 만 읽는다.
 *
 * 매개변수 partialResult: besshi10Rows 제외 모든 필드가 채워진 GiftTaxResult.
 */
export function buildBesshi10Rows(
  input: GiftTaxInput,
  partialResult: Omit<GiftTaxResult, "besshi10Rows">,
  brackets: TaxBracket[],
): FilingFormRow[] {
  const result = partialResult; // alias for readability below
  const split = deriveRelationDeductionSplit(input.donor, result.deductionDetail);
  const priorAddition = derivePriorGiftAddition(result);
  const computedTaxTotal =
    result.computedTax + (result.generationSkipSurchargeDetail?.surchargeAmount ?? 0);
  const rateLabel = resolveBracketLabel(result.taxBase, brackets);

  return [
    // ===== LEFT 20행 (⑰~㊱) =====
    { number: "⑰", column: "left", label: "증여재산가액", amount: result.grossGiftValue, display: "amount", lawRef: "§60" },
    { number: "⑱", column: "left", label: "비과세재산가액", amount: result.exemptAmount, display: "amount", lawRef: "§46" },
    { number: "⑲", column: "left", label: "공익법인 출연재산가액 (불산입)", amount: result.publicInterestExclusion ?? 0, display: "amount", lawRef: "§48" },
    { number: "⑳", column: "left", label: "공익신탁 재산가액 (불산입)", amount: result.publicTrustExclusion ?? 0, display: "amount", lawRef: "§52" },
    { number: "㉑", column: "left", label: "장애인 신탁 재산가액 (불산입)", amount: result.disabledTrustExclusion ?? 0, display: "amount", lawRef: "§52의2" },
    { number: "㉒", column: "left", label: "채무액", amount: result.debtAssumed ?? 0, display: "amount", lawRef: "§47" },
    { number: "㉓", column: "left", label: "증여재산가산액", amount: priorAddition, display: "amount", formula: "(상증법 §47② 동일인 10년 합산)", lawRef: "§47②" },
    { number: "㉔", column: "left", label: "증여세과세가액", amount: result.aggregatedGiftValue, display: "amount", formula: "⑰−⑱−⑲−⑳−㉑−㉒+㉓", lawRef: "§47" },
    { number: "㉕", column: "left", label: "증여재산공제 — 배우자", amount: split.spouse, display: "amount", lawRef: "§53" },
    { number: "㉖", column: "left", label: "증여재산공제 — 직계존비속", amount: split.lineal, display: "amount", lawRef: "§53·§53의2" },
    { number: "㉗", column: "left", label: "증여재산공제 — 그 밖의 친족", amount: split.other, display: "amount", lawRef: "§53" },
    { number: "㉘", column: "left", label: "재해손실공제", amount: result.disasterLossDeduction ?? 0, display: "amount", lawRef: "§54" },
    { number: "㉙", column: "left", label: "감정평가수수료", amount: result.appraisalFeeDeduction ?? 0, display: "amount", lawRef: "시행령 §52의2" },
    { number: "㉚", column: "left", label: "과세표준", amount: result.taxBase, display: "amount", formula: "㉔−㉕−㉖−㉗−㉘−㉙", lawRef: "§55" },
    { number: "㉛", column: "left", label: "세율", amount: 0, display: "rate", formula: rateLabel, lawRef: "§56" },
    { number: "㉜", column: "left", label: "산출세액", amount: result.computedTax, display: "amount", lawRef: "§56" },
    { number: "㉝", column: "left", label: "세대생략가산세", amount: result.generationSkipSurchargeDetail?.surchargeAmount ?? 0, display: "amount", lawRef: "§57" },
    { number: "㉞", column: "left", label: "산출세액계", amount: computedTaxTotal, display: "amount", formula: "㉜+㉝" },
    { number: "㉟", column: "left", label: "이자상당액", amount: result.interestEquivalent ?? 0, display: "amount" },
    { number: "㊱", column: "left", label: "박물관자료 등 징수유예세액", amount: result.museumDeferredTax ?? 0, display: "amount", lawRef: "§75" },

    // ===== RIGHT 13행 (㊲~㊺ 9 + 납부방법 헤더 1 + ㊻ + ㊼ 2 + 신고납부 도출 1) =====
    { number: "㊲", column: "right", label: "세액공제 합계", amount: result.totalTaxCredit, display: "amount", formula: "㊳+㊴+㊵+㊶" },
    { number: "㊳", column: "right", label: "기납부세액", amount: result.creditDetail.giftTaxCredit, display: "amount", lawRef: "§58" },
    { number: "㊴", column: "right", label: "외국납부세액공제", amount: result.creditDetail.foreignTaxCredit, display: "amount", lawRef: "§59" },
    { number: "㊵", column: "right", label: "신고세액공제", amount: result.creditDetail.filingCredit, display: "amount", lawRef: "§69" },
    { number: "㊶", column: "right", label: "그 밖의 공제·감면세액", amount: result.creditDetail.specialTreatmentCredit, display: "amount", lawRef: "조특법 §30의5·§30의6" },
    { number: "㊷", column: "right", label: "신고불성실가산세", amount: result.underreportPenalty ?? 0, display: "amount", lawRef: "국기법 §47의2·§47의3" },
    { number: "㊸", column: "right", label: "납부지연가산세", amount: result.latePaymentPenalty ?? 0, display: "amount", lawRef: "국기법 §47의4" },
    { number: "㊹", column: "right", label: "공익법인 등 관련 가산세", amount: result.publicInterestPenalty ?? 0, display: "amount", lawRef: "§78" },
    { number: "㊺", column: "right", label: "자진납부할 세액(합계액)", amount: result.finalTax, display: "amount", formula: "㉞+㉟−㊱−㊲+㊷+㊸+㊹" },
    { number: "", column: "right", label: "납부방법", amount: 0, display: "header" },
    { number: "㊻", column: "right", label: "연부연납", amount: result.installmentPayment ?? 0, display: "amount", lawRef: "§71" },
    { number: "㊼", column: "right", label: "현금 분납", amount: result.cashDeferred ?? 0, display: "amount", lawRef: "§70②" },
    { number: "", column: "right", label: "신고납부", amount: Math.max(0, result.finalTax - (result.installmentPayment ?? 0) - (result.cashDeferred ?? 0)), display: "amount", formula: "㊺−㊻−㊼" },
  ];
}
```

예상 줄수: ~250줄 (헬퍼 + 빌더 + JSDoc). 800줄 정책 준수.

---

## 5. UI 명세 — `GiftTaxFilingFormTable.tsx` 리렌더

### 5.1 레이아웃

```
┌─────────────────────────────────────────────────────────────────────┐
│ 증여세 신고서 양식 (별지 제10호서식 [2020.03.13. 개정])  [조문 표시] │
│ 증여세과세표준신고 및 자진납부계산서 (기본세율 적용)                │
├──────────────────────────────────┬──────────────────────────────────┤
│ LEFT  (과세가액·과세표준·산출)   │ RIGHT (세액공제·가산세·납부)     │
│ ⑰ 증여재산가액              510M │ ㊲ 세액공제 합계             234M │
│ ⑱ 비과세재산가액              0  │ ㊳ 기납부세액                228M │
│ ⑲ 공익법인 출연재산가액      0   │ ㊴ 외국납부세액공제            0 │
│ ⑳ 공익신탁 재산가액           0  │ ㊵ 신고세액공제               6M │
│ ㉑ 장애인 신탁 재산가액        0  │ ㊶ 그 밖의 공제·감면세액       0 │
│ ㉒ 채무액                      0  │ ㊷ 신고불성실가산세            0 │
│ ㉓ 증여재산가산액         1,010M │ ㊸ 납부지연가산세              0 │
│ ㉔ 증여세과세가액         1,520M │ ㊹ 공익법인 등 관련 가산세     0 │
│ ㉕ 증여재산공제 — 배우자       0  │ ㊺ 자진납부할 세액(합계액)  194M │
│ ㉖ 증여재산공제 — 직계존비속  50M │ ─── 납부방법 ───                 │
│ ㉗ 증여재산공제 — 그 밖의 친족 0  │ ㊻ 연부연납                    0 │
│ ㉘ 재해손실공제                0  │ ㊼ 현금 분납                  97M │
│ ㉙ 감정평가수수료              0  │    신고납부                  97M │
│ ㉚ 과세표준               1,470M │                                  │
│ ㉛ 세율                     40%  │                                  │
│ ㉜ 산출세액                 428M │                                  │
│ ㉝ 세대생략가산세              0  │                                  │
│ ㉞ 산출세액계               428M │                                  │
│ ㉟ 이자상당액                  0  │                                  │
│ ㊱ 박물관자료 등 징수유예      0  │                                  │
└──────────────────────────────────┴──────────────────────────────────┘
```

### 5.2 마크업 골격

```tsx
<div className="rounded-lg border-2 border-gray-300 bg-white print:border-black p-4 space-y-3">
  <header className="border-b-2 border-gray-400 pb-2">
    <h3 className="text-base font-bold text-center">증여세 신고서 양식 (별지 제10호서식 [2020.03.13. 개정])</h3>
    <p className="text-xs text-center text-gray-600">증여세과세표준신고 및 자진납부계산서 (기본세율 적용 증여재산 신고용)</p>
    <button onClick={...} className="print:hidden">{showLaw ? "조문 숨김" : "조문 표시"}</button>
  </header>
  <div className="grid grid-cols-1 md:grid-cols-2 gap-0 border-t border-gray-300">
    <BesshiColumn rows={leftRows} side="left" showLaw={showLaw} />
    <BesshiColumn rows={rightRows} side="right" showLaw={showLaw} />
  </div>
  {result.warnings.length > 0 && <WarningsBlock warnings={result.warnings} />}
</div>
```

`BesshiColumn` — 행 구조:

```tsx
function BesshiRow({ row, showLaw }: { row: FilingFormRow; showLaw: boolean }) {
  if (row.display === "header") {
    return (
      <tr className="bg-gray-100 border-t border-b border-gray-400">
        <td colSpan={showLaw ? 4 : 3} className="py-1.5 px-2 text-center font-bold text-sm">
          {row.label}
        </td>
      </tr>
    );
  }
  return (
    <tr className="border-b border-gray-200">
      <td className="py-1.5 px-2 text-center w-10 font-semibold tabular-nums">{row.number}</td>
      <td className="py-1.5 px-2 text-sm">
        {row.label}
        {row.formula && row.display !== "rate" && (
          <span className="ml-1 text-[10px] text-gray-500">({row.formula})</span>
        )}
      </td>
      <td className="py-1.5 px-2 text-right tabular-nums">
        {row.display === "rate" ? (
          <span className="font-bold">{row.formula}</span>
        ) : row.display === "dash" ? (
          <span className="text-gray-400">—</span>
        ) : (
          row.amount.toLocaleString("ko-KR")
        )}
      </td>
      {showLaw && (
        <td className="py-1.5 px-2 text-[10px] text-gray-500 w-24">{row.lawRef ?? ""}</td>
      )}
    </tr>
  );
}
```

### 5.3 인쇄 스타일

```css
@media print {
  /* 결과 페이지 내 다른 카드 숨김 */
  .print\\:hidden { display: none !important; }
  /* 양식 표는 A4에 맞도록 폰트 축소·여백 최소 */
  .besshi-form { font-size: 10.5px !important; line-height: 1.3; }
  .besshi-form td { padding: 2px 6px !important; }
  /* 좌우 컬럼이 한 페이지에 나란히 — 페이지 분할 방지 */
  .besshi-form { page-break-inside: avoid; }
  /* 격자 강조 */
  .besshi-form, .besshi-form td { border-color: black !important; }
}
```

### 5.4 14개 동기화 지점 영향 평가

| # | 지점 | 변경 |
|---|---|---|
| ① 폼 상태 | — | 영향 없음 (입력 변화 0) |
| ② initial | — | 영향 없음 |
| ③ normalize | — | 영향 없음 |
| ④ API 변환 (`lib/calc/gift-tax-api.ts`) | — | 영향 없음 (input 변화 0) |
| ⑤ UI 위젯 | **변경** | `GiftTaxFilingFormTable.tsx` 2열 grid 리렌더 |
| ⑥ 사이드바 합계 | — | 영향 없음 (계산값 불변) |
| ⑦ 결과 카드 산식 | **변경** | 본 신고양식 카드 — 산식 표기 PDF 그대로 |
| ⑧ validation | — | 영향 없음 |
| ⑨ Zod enum 메인 | — | 영향 없음 |
| ⑩ Zod enum 컴패니언 | — | 영향 없음 |
| ⑪ `acquisitionDate` fallback | — | N/A (증여세) |
| ⑫ Zod 입력 객체 | — | 영향 없음 |
| ⑬ API body spread | — | 영향 없음 |
| ⑭ Route handler 엔진 입력 매핑 | — | 영향 없음 |

⑤⑦ 외 12개 지점 변경 없음. **고위험 ⑫⑬⑭ 누락 가능성 0**.

---

## 6. 케이스 매트릭스 (테스트 anchor 매핑)

> 사례 1 PDF 기준 14개 값-있는 행 + 4개 산식 자기일관성 anchor.

| ID | 행 | 시나리오 (사례 1) | 기대값 | 검증 산식 |
|---|---|---|---|---|
| B10-1 | ⑰ | grossGiftValue | 510,000,000 | === result.grossGiftValue |
| B10-2 | ㉓ | priorGiftAddition | 1,010,000,000 | === aggregatedGiftValue − (grossGiftValue − exemptAmount) |
| B10-3 | ㉔ | aggregatedGiftValue | 1,520,000,000 | === result.aggregatedGiftValue |
| B10-4 | ㉖ | linealDeduction (donor=father) | 50,000,000 | === split.lineal |
| B10-5 | ㉚ | taxBase | 1,470,000,000 | === result.taxBase |
| B10-6 | ㉛ | rateLabel | "40%" | resolveBracketLabel(1.47B) |
| B10-7 | ㉜ | computedTax | 428,000,000 | === result.computedTax |
| B10-8 | ㉞ | computedTaxTotal | 428,000,000 | === computedTax + 0 (세대생략 없음) |
| B10-9 | ㊲ | totalTaxCredit | 234,000,000 | === result.totalTaxCredit |
| B10-10 | ㊳ | giftTaxCredit (기납부) | 228,000,000 | === result.creditDetail.giftTaxCredit |
| B10-11 | ㊵ | filingCredit | 6,000,000 | === result.creditDetail.filingCredit |
| B10-12 | ㊺ | finalTax | 194,000,000 | === result.finalTax |
| B10-13 | ㊼ | cashDeferred | 97,000,000 | (UI 입력 후속 — 본 PR에선 anchor 미적용. 사례 1 시나리오만 별도 mock) |
| B10-14 | 신고납부 | finalTax − installment − cashDeferred | 97,000,000 | (anchor 미적용 — 후속) |
| B10-SC1 | 산식 ㉔ | 자기일관성 | — | row.㉔.amount === row.⑰.amount − row.⑱.amount + row.㉓.amount |
| B10-SC2 | 산식 ㉚ | 자기일관성 | — | row.㉚.amount === row.㉔.amount − row.㉕.amount − row.㉖.amount − row.㉗.amount |
| B10-SC3 | 산식 ㉞ | 자기일관성 | — | row.㉞.amount === row.㉜.amount + row.㉝.amount |
| B10-SC4 | 산식 ㊺ | 자기일관성 | — | row.㊺.amount === row.㉞.amount + row.㉟ − row.㊱ − row.㊲ + row.㊷ + row.㊸ + row.㊹ |

B10-13 / B10-14 는 본 PR에서 anchor 적용 불가(입력 UI 없음). 후속 PR에서 ㊻㊼ 입력 도입 시 추가.

---

## 7. PDCA Do 단계 분담 (시퀀셜)

1. **엔진 시니어** (선행):
   - 타입 확장 (`FilingFormRow.display="header"` 추가, `column?: "left" | "right"` 추가, `GiftTaxResult` 13 필드 + `besshi10Rows: FilingFormRow[]` 추가).
   - `lib/tax-engine/gift-tax-filing-form-besshi10.ts` 신규 (~250줄).
   - `gift-tax.ts` 결과 객체에 13 필드 0 echo.
   - anchor 작성 + 실행 (B10-1~12, B10-SC1~4).
   - KoreanLaw MCP로 ㉟ 이자상당액·㉙ 감정평가수수료·㊳ 기납부세액 인용 확정.

2. **UI 시니어** (엔진 시니어 작업 결과 받아 후행):
   - `GiftTaxFilingFormTable.tsx` 2-column grid 리렌더 (~150줄 예상, 800줄 미만 보장).
   - 인쇄 스타일 CSS.
   - `GiftTaxResultView.tsx` 본 컴포넌트 호출만, 다른 카드 영역 무변경.
   - 브라우저 수동 — PDF 사례 1과 한 화면 나란히, 인쇄 미리보기 1장/2장 확인.

3. **Check**: `ui-engine-sync-checker` (증여세 한정) + 기존 anchor 100% 보존 검증.

---

## 8. 비범위 (Design 명시)

- ★ 다른 5개 세목 신고서 양식 — 본 디자인은 증여세 `GiftTaxFilingFormTable.tsx` + 신규 `gift-tax-filing-form-besshi10.ts` 만 다룬다. 양도세 `FilingFormTable.tsx`·상속세·재산세·종부세·취득세 결과 카드는 코드 변경 0.
- ★ 인적사항 헤더 ①~⑯ — 본 PR은 본문(⑰~㊼)만. 입력 마법사에서 수집한 정보는 이미 있으나 양식에 출력하는 작업은 후속 PR.
- ★ ⑲⑳㉑㉒㉘㉙㉟㊱㊷㊸㊹㊻㊼ 의 입력 UI — 본 PR은 0 default 출력. 각 항목별 입력 마법사 단계 추가는 별도 PDCA.
- ★ 가산세 자동 계산 — 본 PR은 0 default. 국기법 §47의2~의4 통합 모듈은 별도 PDCA.

---

## 9. 리스크

- ★ ㉟ 이자상당액 / ㉙ 감정평가수수료 / ㊳ 기납부세액 — KoreanLaw MCP 검증 Plan 미완료. Do 진입 전 확정 의무 (memory `feedback_korean_law_82_vs_81_2_drift`).
- ★ 별지 제10호서식 개정 이력 — "[2020.03.13. 개정]" 이후 최신 양식 확인 필요. 더 최신이면 그것을 기준으로.
- ⚠ 산식 자기일관성 — 현 PR ⑲⑳㉑㉒㉘㉙㉟㊱㊷㊸㊹가 모두 0이므로 PDF 산식 ≡ 엔진 산식. 향후 이들이 0이 아닌 값을 가질 때는 별도 PDCA로 엔진 산식 재정합.
- ⚠ `display="header"` 신규 literal — 기존 `buildFilingFormRows` 호환 확인 (사용 안 함).

---

## 10. 산출물 체크리스트

- [x] 본 디자인 문서
- [x] 케이스 매트릭스 행 ≥ 1 (B10-1 ~ B10-SC4 = 18행)
- [ ] KoreanLaw MCP 검증 (㉟·㉙·㊳ 인용 확정) — Do 진입 전
- [ ] 엔진 타입 + 빌더 + echo
- [ ] UI 2-column grid + 인쇄 CSS
- [ ] anchor 16건 본 PR 적용 (값 11개[B10-1·2·3·4·5·7·8·9·10·11·12] + 라벨 1개[B10-6 "40%"] + 산식 자기일관성 4개[B10-SC1~4]). B10-13(㊼)·B10-14(신고납부)는 입력 UI 미존재로 본 PR 비적용 — 후속 PR에서 추가
- [ ] `ui-engine-sync-checker` 통과
- [ ] 다른 5개 세목 diff 0건
