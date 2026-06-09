# 비상속인 사전증여 수증자 배부·공제 수정 · 엔진 설계

- 계획서: `docs/01-plan/inheritance-non-heir-prior-gift-allocation-fix.plan.md`
- 작성일: 2026-06-09
- 범위: P0 버그(비상속인 ⑪·⑫ 오분류) 수정. 대습상속인 제외(후속).

## Context

후순위 "기타(other)"·인척(며느리)이 사전증여만 받았을 때 ⑪ 산출세액 배부·⑫ 증여세액공제에 상속인으로 잘못 포함. 민법 §1000 순위 자동판정(`computeLegalShares.shares` 멤버십)을 납세의무자 단일진실로 삼아, 영리법인(§3의2②) 처리를 비상속인 자연인(§28② 본문)까지 일반화한다. 두 면제·공제는 **동일 산식**(`corporate-exemption.ts:7`).

## ★ 케이스 인벤토리 (Do 진입 전 필수)

| ID | 입력 | 기대 | 판정 |
|---|---|---|---|
| C-1 | 자녀2 + 며느리(other) 사전증여 250M(과표 240M), 증여세 38M | 며느리 `computedTaxShare=0`, `priorGiftCredit=0`, ⑩ 자연인 공제=Min(38M, floor(computedTax×240M/taxBase)) | 버그→정상 |
| C-2 | 자녀2 + 며느리 — distributableTax | `computedTax − corpExemption − nonPayerNaturalGiftCredit`. ⑪ 합계 38M 감소 | 정합 |
| C-3 | **4촌 방계(other) 단독상속**(1~3순위·배우자 부재) | other가 `shares` 멤버 → `isInheritanceTaxPayer=true` → ⑪·⑫ **정상 포함** | 회귀(자동판정 정확성) |
| C-4 | 영리법인 사전증여(기존 corporateExemption) | 불변 | 회귀 |
| C-5 | 수유자(legatee) 유증 | `isInheritanceTaxPayer=true`(legatee OR절) → ⑪ 배부 정상 | 회귀 |
| C-6 | 며느리 증여세>한도 | ⑩ 공제 = 한도(Min) | 경계 |
| C-7 | 자녀2만(비상속인 없음) | nonPayer*=0, 기존 동작 불변 | 회귀 |

## 법령 근거 (KoreanLaw 검증 2026-06-09)

- 민법 §1000 순위 / §1003 배우자 — `inheritance-legal-share.ts:50-63` 구현
- 상증법 §3의2① 납부의무자=상속인∪수유자(영리법인 제외) → 비상속인 ⑪ 제외
- §28② 후단(상속인·수유자) per-heir 공제=⑫ / 본문(비상속인) 전체 공제=⑩
- §3의2②(영리법인)·§28②본문(자연인 비상속인) **동일 산식**: `Min(증여세, floor(computedTax × 증여과세표준 / taxBase))` (`inheritance-corporate-exemption.ts:7,102-105`)

## 엔진 input/result 타입

### 1. 신규 헬퍼 — `inheritance-gift-common.ts`

```ts
import type { LegalShareResult } from "./inheritance-legal-share";
/**
 * 상속세 납부의무자(§3의2①) = 민법 §1000 순위상 실제 상속인(legalShares.shares 멤버) ∪ 수유자.
 * 영리법인 제외. 며느리 등 후순위 other(사전증여만)는 false.
 */
export function isInheritanceTaxPayer(h: Heir, legalShares: LegalShareResult): boolean {
  if (isForProfitCorporate(h)) return false;
  if (h.relation === "legatee" && h.isHeir !== false) return true;
  return legalShares.shares.some((s) => s.heirId === h.id);
}
```

### 2. `HeirTaxBreakdown` echo (`types/inheritance-allocation-result.types.ts`)

```ts
/** 상속세 납부의무자(§3의2① 상속인∪수유자) 여부 — 표시 레이어 필터용 (summary는 legalShares 없음) */
isTaxPayer?: boolean;
/** ⑩ 비상속인 자연인 §28②본문 증여세액공제 (corp 면제와 평행, optional echo) */
nonHeirGiftCredit?: number;
/** ⑩ 비상속인 자연인 §28②본문 공제 한도 = floor(computedTax × giftTaxBase / taxBase) */
nonHeirGiftCreditLimit?: number;
```

> `isTaxPayer`는 모든 분기(corp=false·비상속인 자연인=false·상속인·수유자=true)에서 명시 set → summary가 `HEIR_NO_CORP`(corp만 제외) 대신 **`isTaxPayer===true` 필터**로 *1·*2·⑪·소계·⑬⑭⑮ 일괄 교체. corp는 기존에도 이 행들에서 0/빈칸이었으므로 회귀 없음.

## 계산 알고리즘 (`inheritance-allocation.ts` 내부)

### B-1. 비상속인 자연인 집계 (legalShares 계산 직후, `:391` 이후)

```ts
const nonPayerNaturals = heirs.filter(
  (h) => !isForProfitCorporate(h) && !isInheritanceTaxPayer(h, legalShares),
);
// 비상속인 자연인 사전증여 과세표준 합 (영리법인 corporateGiftTaxBase와 평행)
const nonPayerNaturalGiftTaxBase = nonPayerNaturals.reduce(
  (s, h) => s + (taxBaseByDonee.get(h.id) ?? 0), 0,
);
// §28②본문 공제 합 = Σ Min(증여세 산출세액, floor(computedTax × giftTaxBase / taxBase))
const nonPayerNaturalGiftCredit = nonPayerNaturals.reduce((s, h) => {
  const gtb = taxBaseByDonee.get(h.id) ?? 0;
  const giftTax = computedTaxByDonee.get(h.id) ?? 0;
  const limit = taxBase > 0 && gtb > 0 ? Math.floor((computedTax * gtb) / taxBase) : 0;
  return s + Math.min(giftTax, limit);
}, 0);
```

### B-2. 분모·분자·distributableTax 일반화 (영리법인 경로에 추가)

```ts
// 직접배부 합산(:402-407): isForProfitCorporate → !isInheritanceTaxPayer
for (const heir of heirs) {
  if (!isInheritanceTaxPayer(heir, legalShares)) continue; // 영리법인+비상속인 자연인 제외
  totalHeirDirectTaxBase += taxBaseByDonee.get(heir.id) ?? 0;
}
const indirectNumerator =
  taxBase - totalHeirDirectTaxBase - corporateGiftTaxBase - nonPayerNaturalGiftTaxBase;
const distributableTax =
  computedTax - corporateExemption - nonPayerNaturalGiftCredit;
const computedTaxShareDenominator =
  taxBase - corporateGiftTaxBase - nonPayerNaturalGiftTaxBase;
```

### B-3. per-heir 분기 — corp 분기 불변 + 자연인 비상속인 분기 신설 (STEP 6 정정)

기존 corp 분기(`:425 if (isCorporate)`)는 **불변**(`isTaxPayer: false`만 추가). 그 다음에 자연인 비상속인 분기 신설(corp 분기와 동일 구조, 전 필드 명시):

```ts
if (isCorporate) { ...기존 corp 분기 불변..., isTaxPayer: false, continue; }

// 자연인 비상속인 (며느리 등 후순위 other): ⑪·⑫ 제외, ⑩ §28②본문 echo
if (!isInheritanceTaxPayer(heir, legalShares)) {
  const limit = taxBase > 0 && giftTaxBase > 0 ? Math.floor((computedTax * giftTaxBase) / taxBase) : 0;
  const giftTax = computedTaxByDonee.get(heir.id) ?? 0;
  perHeir[heir.id] = {
    heirId: heir.id, directEstateAmount: 0, priorGiftAmount: giftAmount, presumedAmount: 0,
    debtShare: 0, taxableValueShare: giftAmount,
    directTaxBaseShare: giftTaxBase, indirectTaxBaseShare: 0, taxBaseShare: giftTaxBase, // ⑥ 표시 echo
    computedTaxShare: 0, generationSkipSurcharge: 0, priorGiftCredit: 0, // ⑪·⑫ 제외
    preFilingCreditTax: 0, filingCredit: 0, finalTax: 0,
    categoryBreakdown: emptyCategoryBreakdown(), grossInheritance: 0,
    isTaxPayer: false,
    nonHeirGiftCreditLimit: limit, nonHeirGiftCredit: Math.min(giftTax, limit), // ⑩ §28②본문
    priorGiftComputedTax: giftTax, // ⑩a
  };
  continue;
}
// ... 기존 상속인·수유자 배부 (불변) — perHeir에 isTaxPayer: true 추가
```

### B-4. ⑫ 가드

상속인·수유자 분기(`isTaxPayer: true`)에서만 `priorGiftCredit` 계산 → 비상속인은 B-3 분기에서 0. 추가 가드 불요.

## 표시 (`heir-allocation-summary.ts`)

- **`isTaxPayer` 가드 (buildPerHeir 시그니처 불변, STEP 8 정정)**: `HEIR_NO_CORP` 사용 행(*1·*2·⑪·소계·*3·*4·*5·⑬⑭⑮)의 accessor를 `(h) => get(h.id)?.isTaxPayer === false ? null : get(h.id)?.X`로 교체. corp(isTaxPayer=false)도 자동 제외 → `HEIR_NO_CORP` 인자 제거 가능. **total 합산**(`taxAllocTotal` 등 Object.values reduce)도 `p.isTaxPayer !== false` 가드로 동기화. 비상속인 없는 기존 케이스는 모든 상속인 isTaxPayer=true → 동작 불변(C-7).
- ⑩(`:436-499`): a/b/c **3행 고정**(행 추가 X, STEP 13 정정). accessor `["corporate"]` 필터 제거 → "corp ∪ 비상속인 자연인(`perHeir.nonHeirGiftCredit != null`)" 가드로 며느리 **열**에 표시. a=priorGiftComputedTax(공통), b=nonHeirGiftCreditLimit(자연인)·priorGiftCreditLimit(corp) 분기, c=nonHeirGiftCredit(자연인)·corporateExemption(corp) 분기. total=corp 합+자연인 합.
- ⑥ 직접배부(row-6a): directTaxBaseShare echo 유지 → 비상속인 자연인 표시(corp 평행, 분모는 B-2에서 제외).

## Silent fallback / 자동 안분

- 없음. 순위 판정은 기존 `computeLegalShares.shares`(명시적 순위 로직). 새 fallback 미도입.

## 테스트 약속 (Pre-Do anchor)

- C-1·C-3 우선 작성·실행(메모리 `feedback_pre_anchor_verification`): C-1=버그 실증, C-3=자동판정이 진짜 상속인(4촌 단독) 보존 확인
- C-2·C-4·C-5·C-7 회귀 / C-6 경계

## 800줄 정책

- `inheritance-allocation.ts` 현재 ~675줄. B-1~B-3 +30~40줄 → ~710. 800 이내. 초과 시 nonPayer 산출(B-1)을 `inheritance-allocation-deductions.ts`로 추출.

## 의존성

- `inheritance-allocation.ts` → `isInheritanceTaxPayer`(inheritance-gift-common.ts 신규), `computeLegalShares`(기존 내부)
- orchestrator(`inheritance-tax.ts`) **변경 없음**

## 자가 검토 이력 (STEP 6·8)

### STEP 6 (1차) — 정정 3건
1. (오류 High) B-3 `...zeroBreakdown` 헬퍼 부재 → corp 분기 **불변 유지 + 자연인 비상속인 별도 분기 신설**(전 필드 명시, 회귀 안전)
2. (누락 High) summary는 legalShares 없음 → perHeir에 **`isTaxPayer` echo** 추가, `HEIR_NO_CORP` 다수 행 일괄 교체
3. (확인) directTaxBaseShare echo 유지(corp 평행, ⑥ 표시)

### STEP 8 (2차 — 정정 파급) — 정정 2건
1. (모순 Medium) buildPerHeir는 relation 기반, isTaxPayer는 값 기반 → **accessor 내부 가드**(시그니처 불변)
2. (누락 Medium) ⑪ total·*3·*4·*5·⑬⑭⑮ 합산도 isTaxPayer 동기화
