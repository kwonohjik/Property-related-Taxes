# 상속세 종합사례 — 엔진 디자인 매트릭스

> **Plan**: `docs/00-pm/inheritance-comprehensive-case.plan.md`
> **Status**: Design (작성중) → Pre-Do anchor 다음 세션
> **Owner**: inheritance-gift-tax-senior 외 4 sub
> **Created**: 2026-05-20

---

## 1. 케이스 인벤토리 표 (Case Matrix — Do 진입 게이트)

> CLAUDE.md 정책: 케이스 인벤토리 표 행 ≥ 1 필수. 본 사례는 26 케이스.

| ID | 케이스 | 입력 단서 | 기대 동작 | 법령 | 우선순위 |
|---|---|---|---|---|---|
| **C1** | 본래상속재산 — 예금(소액주주은행) | `EstateItem(financial, 1.1B)` | grossEstate += 1.1B, 순금융 가산 | §60 | P0 |
| **C2** | 본래상속재산 — 저축은행 예금 (협의분할 3분할) | `EstateItem(financial, 1.0B, heirAllocations=[장남500M, 손녀500M])` | 직접 분배 | §3 | P0 |
| **C3** | 본래상속재산 — 아파트 (매매사례가액 8억) | `EstateItem(apt, marketValue=800M, heirAllocations=[차남800M])` | similar_sales 채택 | §60 ② | P0 |
| **C4** | 본래상속재산 — 임야 (기준시가) | `EstateItem(land, standardPrice=450M, heir=장남)` | standard_price 채택 | §61 | P0 |
| **C5** | 본래상속재산 — 농지 (기준시가 11.5억) | `EstateItem(land, standardPrice=1.15B, heir=배우자)` | standard_price | §61 | P0 |
| **C6** | 본래상속재산 — 공장건물 (기준시가 3.3억) | `EstateItem(building, standardPrice=330M, heir=차남)` | standard_price | §61 | P0 |
| **C7** | 본래상속재산 — 공장부지 (1물건 비율분할) | `EstateItem(land, 800M, heirAllocations=[배우자500M(2500㎡), 차남300M(1500㎡)])` | **자산-수준 분할** | §3 | P0 ★ |
| **C8** | 본래상속재산 — 상장주식 (소액주주) | `EstateItem(listed_stock, 2개월 평균 150M, heir=배우자)` | 평가 = 150M | §63 ① | P0 |
| **C9** | 본래상속재산 — 비상장주식 (가업승계) | `EstateItem(unlisted_stock, 기준시가 500M, heir=차남, isFamilyBusinessAsset=true)` | 500M | §63 ② | P0 |
| **C10** | 기타재산 — 골프회원권 (매매사례 8천만) | `EstateItem(other, marketValue=80M, heir=배우자)` | similar_sales | §60 | P0 |
| **C11** | 기타재산 — 차량 3천만 | `EstateItem(other, 30M, heir=배우자)` | 표시 | §60 | P0 |
| **C12** | 기타재산 — 임차보증금·현금·공탁금·골동품·대여금·급여 (배우자 일괄) | 6 items × 배우자 | 합 226M (배우자) | §60 | P0 |
| **C13** | 간주상속재산 — 퇴직금 124M | `EstateItem(category="other", deemedCategory="retirement", 124M, heirAllocations=[배우자])` | grossEstate += 124M, 결과 카드 "간주상속재산" 섹션 분리 노출 | §10 ②3호 | P0 |
| **C14** | 간주상속재산 — 생명보험금 50M | `EstateItem(category="financial", deemedCategory="insurance", 50M, heirAllocations=[배우자])` | grossEstate += 50M, **순금융재산 가산 X** (§22 ①에서 보험금은 제외) | §10 ②1호 | P0 |
| **C15** | **추정상속재산 — 부동산처분** A토지(2년 5억 임계) + B아파트 | `presumed[부동산]({385M_1Y, 500M_2Y, verified=600M})` | (885−600)−Min(885×20%, 200M)=108M | §15 ① | P0 ★★★ |
| **C16** | **추정상속재산 — 예금인출 (1년 1.5B 임계)** | `presumed[예금]({1500M_2Y, verified=1200M})` | (1500−1200)−200M=100M | §15 ① | P0 ★★★ |
| **C17** | **추정상속재산 — 기타재산처분 (소명대상 미달)** | `presumed[기타]({영업권 180M_1Y})` | 1년 이내 200M 미만 → 0 | §15 ② | P0 ★★★ |
| **C18** | **추정상속재산 — 금융기관채무 (1년 1B 임계)** | `presumed[채무]({1000M_2Y, verified=658M})` | (1000−658)−Min(1000×20%, 200M)=142M | §15 ① | P0 ★★★ |
| **C19** | **추정상속재산 귀속자별 분배** | 각 카테고리 heirAllocations[] | 배우자 150M + 장남 100M + 차남 100M = 350M | §15 | P0 |
| **C20** | 채무 — K은행 (장남 변제) + S저축은행 (배우자 5억 + 차남 245M) | `debtItems=[{category:"financial", 400M, alloc=[장남]}, {category:"financial", 745M, alloc=[배우자500M,차남245M]}]` | 채무 합 1,145M, 상속인별 분담 | §14 | P0 |
| **C21** | 공과금 — 종합소득세 55M (차남 변제) | `debtItems=[{category:"tax", 55M, alloc=[차남]}]` | 55M, 차남 분담 | §14 | P0 |
| **C22** | 장례비 — 식대 18M (한도 10M) + 봉안 15M (한도 5M) | `debtItems=[{category:"funeral", 18M, isBongan:false, alloc=[배우자]}, {category:"funeral", 15M, isBongan:true, alloc=[배우자]}]` | 엔진 한도 자동 적용 = Min(18M,10M) + Min(15M,5M) = 15M | §14 ②4호 | P0 |
| **C23** | **사전증여 — 영리법인 M사 채무면제 700M (5년 이내)** | `PriorGift(donee=corporate, 700M, 2021-08-10)` | 합산 700M + 면제 150M | §3의2② / §13② | P0 ★★★ |
| **C24** | 사전증여 — 배우자 현금 760M (1년 이내) | `PriorGift(donee=spouse, 760M, 2022-06-10, giftTaxPaid=22M, giftTaxBase=160M)` | 합산 + §28 공제 | §13① | P0 |
| **C25** | 사전증여 — 장남 상가 15억 (5년 이내) | `PriorGift(donee=son, 1.5B, 2018-08-17, giftTaxPaid=420M, giftTaxBase=1.45B)` | 합산 + §28 공제 | §13① | P0 |
| **C26** | 상속인별 배부 + 안분 + 세대생략 + 신고세액공제 | (5가지 합산) | PDF 자진납부세액 일치 | §3 + §28 + §69 | P0 ★★★ |

---

## 2. 신규/변경 타입 명세

### 2-0. `Heir` 타입 확장 — 상속인·수유자·영리법인 통합 배열

> Plan §6-2 결정 (A): 단일 배열로 통합. `heirAllocations[].heirId`가 일관되게 참조.

```ts
export type HeirRelation =
  | "spouse"
  | "child"
  | "lineal_ascendant"
  | "sibling"
  | "other"
  // ===== 신규 =====
  | "legatee"         // 비상속인 수유자 (자연인, 예: 손녀)
  | "corporate";      // 비상속인 영리법인 수증자 (사전증여 한정)

export interface Heir {
  id: string;
  relation: HeirRelation;
  name?: string;
  birthDate?: string;
  isDisabled?: boolean;
  actualShareRatio?: number;
  isCohabitant?: boolean;

  // ===== 신규 =====
  /** 상속인 vs 수유자·영리법인 구분 (relation에서 도출 가능하나 명시 권장). 미입력 시 relation으로 자동 추론. */
  isHeir?: boolean;
  /** 세대생략 수유자 여부 (직계비속 손자녀, §27 ② 30%/40% 할증 대상) */
  isGenerationSkipBeneficiary?: boolean;
  /** 영리법인 수증자만 사용: 사전증여 당시 증여세 산출세액 (§3의2② 면제 한도 계산용) */
  corporateGiftComputedTax?: number;
}
```

### 2-1. `EstateItem` 확장

```ts
export interface EstateItem {
  id: string;
  category: AssetCategory;
  name: string;
  marketValue?: number;
  standardPrice?: number;
  appraisedValue?: number;
  // ... (기존)

  // ===== 신규 =====
  /** 협의분할 — 상속인별 분배 (총합 = valuatedAmount) */
  heirAllocations?: HeirAllocation[];
  /**
   * 간주상속재산 표시 분류 (§10).
   * "deemed_retirement" | "deemed_insurance" | "deemed_trust" 가 들어오면 결과 카드에 분리 노출.
   */
  deemedCategory?: "retirement" | "insurance" | "trust";
  /** 가업상속재산 여부 — 가업상속공제 직접입력 모드에서 표시용 */
  isFamilyBusinessAsset?: boolean;
}

export interface HeirAllocation {
  heirId: string;
  /** 분배 금액 (원). 합이 평가액과 일치해야 함 (validation) */
  amount: number;
  /** 분배 면적 (선택, 표시용) */
  areaM2?: number;
}
```

### 2-2. `PriorGift` 확장

```ts
export interface PriorGift {
  giftDate: string;
  /** @deprecated beneficiaryType 사용 권장. 미설정 시 beneficiaryType="heir"에서 true로 자동 도출. */
  isHeir?: boolean;
  giftAmount: number;
  giftTaxPaid: number;
  giftTaxBase?: number;
  doneeRelation?: DonorRelation;

  // ===== 신규 =====
  /**
   * 수증자 ID — Heir.id 참조 (영리법인·수유자도 §2-0에서 Heir 배열에 포함됨).
   * 상속인별 배부에 필수. 미설정 시 배부 단계에서 균등분배 fallback 또는 검증 차단.
   */
  doneeId: string;
  /**
   * 수증자 유형 — Heir.relation·isHeir에서 도출 가능하지만 명시적 입력 권장.
   *   - "heir": 상속인 (§13 ① 10년)
   *   - "legatee": 비상속인 수유자 (§13 ② 5년) — 자연인
   *   - "corporate": 비상속인 영리법인 (§13 ② 5년 + §3의2② 면제)
   *
   * backward compat: legacy `isHeir: boolean`만 입력된 경우 자동 추론.
   * 신규 코드는 beneficiaryType 사용 필수.
   */
  beneficiaryType: "heir" | "legatee" | "corporate";
  /** 영리법인 사전증여 당시 증여세 산출세액 (§3의2② 면제 한도 계산용). beneficiaryType="corporate" 시 필수. */
  corporateGiftComputedTax?: number;
}
```

### 2-3. `PresumedInheritanceInput` 신규

```ts
export type PresumedCategory =
  | "real_estate"      // 부동산 및 부동산권리
  | "deposit"          // 예금 인출
  | "other_asset"      // 기타재산
  | "financial_debt";  // 금융기관채무

export interface PresumedInheritanceItem {
  id: string;
  category: PresumedCategory;
  /** 1년 이내 처분·인출·차입 금액 (원) */
  amountWithin1Y: number;
  /** 1년 초과 ~ 2년 이내 처분·인출·차입 금액 (원) */
  amountWithin2Y: number;
  /** 사용처가 객관적으로 확인된 금액 */
  verifiedUseAmount: number;
  /** 상속인별 분배 — 미입력 시 결과 카드에서 협의분할 미반영 */
  heirAllocations?: HeirAllocation[];
}

export interface PresumedInheritanceItemResult {
  category: PresumedCategory;
  /** 임계 발동 여부 (1년 2억 OR 2년 5억 — 부동산/예금/채무 기준; 기타재산도 동일) */
  thresholdTriggered: boolean;
  /** 소명대상 합계 = 1Y + 2Y (임계 미만 시 0) */
  scrutinyAmount: number;
  /** 미소명 = 소명대상 − 확인금액 */
  unverifiedAmount: number;
  /** Min(처분금액 × 20%, 2억) */
  baseDeduction: number;
  /** 추정상속재산 = max(0, 미소명 − baseDeduction) */
  addedAmount: number;
  breakdown: CalculationStep[];
}
```

### 2-3-1. `DebtItem` / `ExpenseItem` 신규 — 채무·공과금·장례비 협의분할

> Plan §5-3-1 표 반영. 단순 `debts: number` → 협의분할 가능한 배열로 확장.

```ts
export type DebtCategory =
  | "financial"      // 금융기관 채무 (은행 대출 등)
  | "tax"            // 공과금 (소득세·재산세 등)
  | "personal"       // 사적 채무
  | "funeral";       // 장례비 (§14 ②4호 한도 적용)

export interface DebtItem {
  id: string;
  category: DebtCategory;
  /** 채권자명·내용 (PDF 표 표시용) */
  name: string;
  /** 금액 (원). 장례비는 한도 적용 전 금액 — 엔진이 한도 적용. */
  amount: number;
  /** 장례비 봉안시설 사용료 여부 (true 시 한도 500만, false 시 한도 1,000만) */
  isBongan?: boolean;
  /** 채무 협의분할 — 상속인별 변제 분배 (합 = amount) */
  heirAllocations?: HeirAllocation[];
}
```

**InheritanceTaxInput 변경**:
```ts
export interface InheritanceTaxInput {
  // ... (기존)

  // ===== 변경 =====
  /** @deprecated debtItems 사용 권장. 미입력 시 협의분할 불가 (총액 단위만). */
  debts?: number;
  /** 채무·공과금·장례비 통합 배열 (신규). debts 입력 시 fallback 합산. */
  debtItems?: DebtItem[];

  /** @deprecated funeralExpense + funeralIncludesBongan 통합 — debtItems(category="funeral")로 이전 */
  funeralExpense?: number;
  funeralIncludesBongan?: boolean;
}
```

### 2-4. `InheritanceDeductionInput` 확장

```ts
export interface InheritanceDeductionInput {
  // ... (기존)

  // ===== 신규 (Phase E) =====
  /** 가업상속공제 직접 입력 (요건 판정 생략). 제공 시 입력값 그대로 적용. */
  familyBusinessDirectAmount?: number;
  /** 동거주택공제 직접 입력 (요건 판정 생략). 제공 시 입력값 그대로 적용. */
  cohabitDirectAmount?: number;

  // ===== 신규 (Phase D) =====
  /** §19 법정상속분 분자 보정: 상속외 자가 받은 유증 금액 (분자에서 차감) */
  legateeAmountNonHeir?: number;
  /** §19 분자 보정: 상속포기 후순위 상속분 (분자에서 차감) */
  postRenunciationAmount?: number;
  /** §24 분자 보정: 신고기한 내 재해손실공제 */
  disasterLossDeduction?: number;
  /** §24 분자 보정: 사전증여재산 공제 합계 (PriorGift별 증여공제 합) */
  priorGiftDeductionTotal?: number;
}
```

### 2-5. `InheritanceTaxResult` 확장

```ts
export interface InheritanceTaxResult {
  // ... (기존)

  // ===== 신규 =====
  /** 추정상속재산 §15 결과 */
  presumedInheritanceDetail?: {
    items: PresumedInheritanceItemResult[];
    total: number;
  };
  /** 영리법인 §3의2② 면제세액 */
  corporateExemption?: {
    amount: number;
    limit: number;
    breakdown: CalculationStep[];
  };
  /** 상속인별 배부 결과 (Phase C 핵심) */
  heirAllocationResult?: HeirAllocationResult;
}

export interface HeirAllocationResult {
  /**
   * Heir.id 별 산출 결과.
   * - 상속인·수유자(자연인): 모든 필드 채워짐
   * - 영리법인: directEstateAmount=0, priorGiftAmount만 채워짐. finalTax=0 (§3의2② 면제, 별도 corporateExemption에서 처리)
   * - sum(perHeir.values().finalTax)은 영리법인 0이므로 PDF "합계 1,033,760,232"와 일치 (4명 합)
   */
  perHeir: Map<string, HeirTaxBreakdown>;
  /** 배부대상 산출세액 (= 상속세 산출세액 − 영리법인 면제. **할증세액 미포함** — 손녀에게만 별도 가산) */
  distributableTax: number;
  /** 간접배부 대상 과세표준 = 과세표준 − 직접배부 합계 − 영리법인 가산과세표준 */
  indirectDistributionBase: number;
  /** 증여재산 제외 과세가액 = 과세가액 − 가산 증여재산 가액 (영리법인 포함 시/제외 옵션) */
  taxableValueExGifts: number;
  breakdown: CalculationStep[];
}

export interface HeirTaxBreakdown {
  heirId: string;
  /** 본래상속재산 직접 분배 */
  directEstateAmount: number;
  /** 가산된 사전증여 가산가액 */
  priorGiftAmount: number;
  /** 추정상속재산 분배 */
  presumedAmount: number;
  /** 과세가액상당액 */
  taxableValueShare: number;
  /** 직접배부 과세표준 (사전증여 과세표준 − 증여공제) */
  directTaxBaseShare: number;
  /** 간접배부 과세표준 */
  indirectTaxBaseShare: number;
  /** 과세표준상당액 = 직접 + 간접 */
  taxBaseShare: number;
  /** 산출세액상당액 (배부대상 산출세액 × 비율) */
  computedTaxShare: number;
  /** 세대생략 할증액 (수유자별) */
  generationSkipSurcharge: number;
  /** 사전증여세액공제 (안분 한도 Min) */
  priorGiftCredit: number;
  /** 차가감세액 */
  preFilingCreditTax: number;
  /** 신고세액공제 (3%) */
  filingCredit: number;
  /** 자진납부세액 */
  finalTax: number;
}
```

---

## 3. 14개 동기화 지점 (Definition of Done — Do 진입 전 결정)

> 참고: CLAUDE.md ⑫⑬⑭ TypeScript 미감지 항목 강조

| # | 지점 | 작업 위치 | 상태 |
|---|---|---|---|
| ① | FormState 타입 | `components/calc/InheritanceTaxForm.tsx` + 추후 `inheritance/shared.ts` 분리 | Phase G |
| ② | INITIAL_FORM | 위 동일 | Phase G |
| ③ | normalize fallback | 위 동일 | Phase G |
| ④ | API 변환 | **`lib/calc/inheritance-api.ts` 신규** | Phase G |
| ⑤ | UI 입력 위젯 | **800줄 정책 — 폼 분할 강제**. `components/calc/inheritance/{shared.ts, Step0~6.tsx}` 분할 + 추정상속재산 카드(4종) + HeirAllocationInput 위젯 + DebtAllocationInput 위젯 + 사전증여 영리법인 토글 + 가업·동거 직접입력 토글 | Phase G |
| ⑥ | 사이드바 합계 | `computeInheritanceSummary` 신규 | Phase G |
| ⑦ | 결과 카드 — 상속인별 표 | `InheritanceTaxResultView` 확장 + `HeirAllocationTable` 신규 | Phase G |
| ⑧ | Validation | **`lib/calc/inheritance-validate.ts` 신규** | Phase G |
| ⑨ | Zod enum (메인) | `app/api/calc/inheritance/route.ts` Zod schema — 신규 enum 5종: `HeirRelation`(legatee·corporate 추가), `beneficiaryType`, `DebtCategory`, `PresumedCategory`, `deemedCategory` | Phase G |
| ⑩ | Zod enum (companion) | n/a (단건) | — |
| ⑪ | acquisitionDate fallback | n/a (deathDate만) | — |
| ⑫ | **Zod 입력 객체 정의** | route.ts — `PresumedInheritanceItemSchema`, `HeirAllocationSchema`, `DebtItemSchema`, `PriorGiftSchema(beneficiaryType+doneeId+corporateGiftComputedTax 포함)`, `HeirSchema(isHeir·isGenerationSkipBeneficiary·corporateGiftComputedTax 포함)` | ★ |
| ⑬ | **callInheritanceTaxAPI body spread** | `lib/calc/inheritance-api.ts` (신규) — `presumedItems`, `debtItems`, `priorGifts` 신규 필드(`doneeId`/`beneficiaryType`/`corporateGiftComputedTax`), `Heir` 신규 필드 모두 body에 포함 | ★ |
| ⑭ | **Route handler 엔진 input 매핑** | route.ts — 엔진 input 빌더에 `presumedItems`/`debtItems` spread + Date 변환 (`deathDate` + `priorGifts[].giftDate`) | ★ |

---

## 4. Pre-Do Anchor 6건 (다음 세션 첫 작업)

Pre-Do anchor 정책(`feedback_pre_anchor_verification`)에 따라 Plan/Design 완료 후 Do 진입 전 핵심 anchor 우선 실행하여 디자인 환류.

### 4-0. 함수 시그니처 정의 위치 (신규 모듈 export)

| 함수 | 모듈 | export 여부 |
|---|---|---|
| `evaluatePresumedInheritance(items: PresumedInheritanceItem[]): { items: PresumedInheritanceItemResult[]; total: number }` | `lib/tax-engine/presumed-inheritance.ts` (신규) | export |
| `calcCorporateExemption({ corporateGiftComputedTax, corporateGiftTaxBase, totalComputedTax, totalTaxBase }): { amount: number; limit: number; breakdown: CalculationStep[] }` | `lib/tax-engine/inheritance-corporate-exemption.ts` (신규) | export |
| `calcGenerationSkipSurcharge({...})` 기존 함수에 옵션 `nonHeirNonLegateeGifts?: number` 추가 (Plan Phase F) | `lib/tax-engine/inheritance-gift-common.ts` (확장) | 기존 export |
| `calcHeirAllocation(input, intermediates): HeirAllocationResult` | `lib/tax-engine/inheritance-allocation.ts` (신규) | export |
| `calcHeirTaxBaseShare(heirInput, intermediates): { directTaxBaseShare; indirectTaxBaseShare; taxBaseShare }` | 위 모듈 내부 헬퍼 | internal (테스트용 export) |

### 4-1. Fixture 정의 위치

```
__tests__/tax-engine/inheritance/
├── fixtures/
│   └── comprehensive-case-pdf.fixture.ts   ← EXAMPLE_PRESUMED, EXAMPLE_INPUT, SPOUSE_INPUT 등 PDF 사례 입력 상수
├── comprehensive-case-pre.test.ts          ← Pre-Do anchor 6건
└── comprehensive-case-pdf.test.ts          ← Phase H 최종 anchor 50개
```

### 4-2. Anchor 6건

```ts
// __tests__/tax-engine/inheritance/comprehensive-case-pre.test.ts
import { EXAMPLE_PRESUMED, EXAMPLE_INPUT, SPOUSE_INPUT } from "./fixtures/comprehensive-case-pdf.fixture";

describe("Pre-Do anchors — 종합사례 PDF", () => {
  it("PRE-1 추정상속재산 4종 합계 350M", () => {
    const result = evaluatePresumedInheritance(EXAMPLE_PRESUMED);
    expect(result.total).toBe(350_000_000);
  });

  it("PRE-2 영리법인 면제 = Min(150M, 한도 272,874,251) = 150M", () => {
    const exempt = calcCorporateExemption({
      corporateGiftComputedTax: 150_000_000,
      corporateGiftTaxBase: 700_000_000,
      totalComputedTax: 1_627_500_000,
      totalTaxBase: 4_175_000_000,
    });
    expect(exempt.amount).toBe(150_000_000);
    expect(exempt.limit).toBe(272_874_251);
  });

  it("PRE-3 세대생략할증 = 30,232,198 (분모 8,075M)", () => {
    const surcharge = calcGenerationSkipSurchargeWithAdjustment({
      computedTax: 1_627_500_000,
      generationSkipAssetAmount: 500_000_000,
      grossEstateWithGifts: 8_775_000_000,
      nonHeirNonLegateeGifts: 700_000_000,
      rate: 0.30,
    });
    expect(surcharge.amount).toBe(30_232_198);
  });

  it("PRE-4 배우자 과세표준상당액 = 1,101,319,862", () => {
    // 직접 160M + 간접 941,319,862
    const share = calcHeirTaxBaseShare(SPOUSE_INPUT);
    expect(share.taxBaseShare).toBe(1_101_319_862);
  });

  it("PRE-5 상속인별 자진납부세액 합계 = 1,033,760,232 (영리법인 finalTax=0이므로 자동 제외)", () => {
    const result = calcInheritanceTax(EXAMPLE_INPUT);
    const sum = Array.from(result.heirAllocationResult!.perHeir.values())
      .reduce((s, h) => s + h.finalTax, 0);
    expect(sum).toBe(1_033_760_232);
    // 추가 검증: 영리법인 항목 finalTax 0
    expect(result.heirAllocationResult!.perHeir.get("corporate_msa")!.finalTax).toBe(0);
  });

  it("PRE-6 손녀 자진납부세액 = 95,462,086 (할증포함)", () => {
    const result = calcInheritanceTax(EXAMPLE_INPUT);
    expect(result.heirAllocationResult!.perHeir.get("granddaughter")!.finalTax)
      .toBe(95_462_086);
  });
});
```

각 anchor 실패 시 → 디자인 환류 (산식·분모·임계 등 재검토) → 본 문서 §2·§5 정정 → 재실행.

---

## 5. 산출 순서 (Algorithm Pseudocode)

```
INPUT: InheritanceTaxInput (estateItems[], presumedItems[], priorGifts[], heirs[], ...)

STEP 1: evaluate estateItems → 본래상속재산 valuationResults[]
         grossEstateValue = Σ valuatedAmount
STEP 2: evaluate exemptions → exemptAmount
STEP 3: 채무·공과금·장례비 합산 (debtItems[])
   3a: 장례비 한도 적용 — Min(식대총액, 1,000만) + Min(봉안총액, 500만)
   3b: 금융채무·공과금·사적채무 합산 — 한도 없음
   ※ heirAllocations[]는 STEP 13-2 상속인별 과세가액 계산에서 분담 차감용. STEP 3은 총액 합산만.
STEP 4: evaluatePresumedInheritance(presumedItems) → presumedTotal (G1)
         grossEstateValueWithPresumed = grossEstateValue + presumedTotal
STEP 5: aggregatePriorGifts(priorGifts, deathDate) → priorGiftAggregated
         (포함: heir 10년 + legatee/corporate 5년)
STEP 6: taxableEstateValue = max(0,
           grossEstateValueWithPresumed - exemptAmount - funeral - debts + priorGiftAggregated)
STEP 7: calcInheritanceDeductions(input, taxableEstateValue, priorGiftsAdjusted...)
         (Phase D: §19 정확 산식, Phase E: directAmount 적용, G10: §24 분자 보정)
STEP 8: taxBase = max(0, taxableEstateValue - totalDeduction)
STEP 9: computedTax = progressive(taxBase, brackets)
STEP 10: corporateExemption (G4) = Min(corporateGiftComputedTax,
            computedTax × corporateGiftTaxBase / taxBase)
STEP 11: generationSkipSurcharge (G5) = floor(
            computedTax × generationSkipAssetAmount / (grossEstateWithGifts - nonHeirNonLegateeGifts) × surchargeRate)
         ※ nonHeirNonLegateeGifts = 상속인·수유자 외 자(영리법인 등)가 받은 사전증여 가산가액 합계
         PDF: floor(1,627,500,000 × 500M / 8,075M × 0.30) = 30,232,198
STEP 12: distributableTax = computedTax - corporateExemption (★ 할증 미포함)
         PDF: 1,627,500,000 - 150,000,000 = 1,477,500,000
STEP 13: 상속인별 배부 (G6) — heirAllocationResult
   13-1: per-heir 자산-수준 분배 집계
         (estateItems[].heirAllocations + presumedItems[].heirAllocations
          + debtItems[].heirAllocations + priorGifts[].doneeId)
   13-2: 상속인별 과세가액상당액
         = (상속인별 본래상속재산 분배 + 간주상속재산 분배 + 추정상속재산 분배 + 사전증여 가액)
           − 상속인별 채무·공과금·장례비 분담 (STEP 3 한도 적용 후 금액 기준 안분)
           − 상속인별 비과세 분담
         ※ STEP 3의 총액 차감은 grossEstate 계산용. STEP 13-2의 상속인별 차감은 별개 — 동일 차감을 두 번 적용하지 않음.
         PDF 검증: 합 = 8,775,000,000 = 과세가액
   13-3: 직접배부 과세표준 = max(0, 상속인별 사전증여 과세표준 - 상속인별 증여공제)
         PDF: 배우자 160M / 장남 1,450M / 차남·손녀·영리법인 0
   13-4: 간접배부 분모 = grossEstateWithGifts - Σ(상속인·수유자 외 자가 받은 사전증여 가산가액)
         PDF: 8,775M - 760M - 1,500M - 700M = 5,815M (단, PDF는 상속인·수유자·영리법인 모두 증여가액 차감)
         ※ PDF 책 1864 표 산식 그대로 적용: "(증여재산가액을 제외한 상속세 과세가액)"
   13-5: 간접배부 분자 = taxBase - Σ직접배부 - corporateGiftTaxBase
         PDF: 4,175M - 160M - 1,450M - 700M = 1,865M
   13-6: 상속인별 간접배부 = floor(간접분자 × (상속인별 과세가액상당액 - 상속인별 사전증여 가액) / 간접분모)
         PDF 배우자: 1,865M × (3,695M - 760M) / 5,815M = 941,319,862
   13-7: 상속인별 과세표준상당액 = 직접 + 간접
         PDF 배우자: 160M + 941,319,862 = 1,101,319,862
   13-8: 상속인별 산출세액상당액 = floor(distributableTax × 과세표준상당액 / (taxBase - corporateGiftTaxBase))
         분모 = 4,175M - 700M = 3,475M
         PDF 배우자: 1,477,500,000 × 1,101,319,862 / 3,475,000,000 = 468,259,021
   13-9: 세대생략 수유자 할증 가산
         - isGenerationSkipBeneficiary === true 인 상속인에게만 generationSkipSurcharge 가산
         - PDF: 손녀 산출세액상당액 68,182,324 + 할증 30,232,198 = 98,414,522
   13-10: 상속인별 사전증여세액공제 (§28)
         한도_i = floor(상속인별 산출세액상당액(13-9 결과) × 상속인별 사전증여 과세표준 / 상속인별 과세표준상당액)
         공제_i = Min(상속인별 증여세 산출세액, 한도_i)
         PDF 배우자: Min(22M, floor(468,259,021 × 160M / 1,101,319,862)) = Min(22M, 68,028,777) = 22M
   13-11: 상속인별 차가감세액 = 산출세액상당액(13-9 결과) - 사전증여세액공제(13-10)
   13-12: 상속인별 신고세액공제 = floor(차가감 × 0.03)  (isFiledOnTime=true 시)
   13-13: 상속인별 자진납부세액 = floor(차가감 - 신고세액공제)
   13-14: 영리법인 perHeir 항목: finalTax = 0 (면제), 다른 필드는 0 또는 사전증여 가액만 채워짐
STEP 14: 결과 조립 — 합계 sum(perHeir.values().finalTax) === PDF 1,033,760,232
```

---

## 6. 결과 카드 (UI) — 상속인별 표

PDF 책 1859의 "상속인별 상속세부담액 집계" 표를 1:1 재현:

```
| 구분                  | 합계        | 배우자      | 장남        | 차남        | 손녀     | 영리법인 |
|----------------------|------------:|-----------:|-----------:|-----------:|--------:|--------:|
| 금융재산              | 2,100M     | 1,100M     | 500M       | -          | 500M    | -      |
| 부동산                | 3,530M     | 1,650M     | 450M       | 1,430M     | -       | -      |
| 주식                  | 650M       | 150M       | -          | 500M       | -       | -      |
| 기타                  | 400M       | 400M       | -          | -          | -       | -      |
| 채무·공과금·장례비     | -1,215M    | -515M      | -400M      | -300M      | -       | -      |
| 사전증여              | +2,960M    | 760M       | 1,500M     | -          | -       | 700M   |
| 추정상속재산          | +350M      | 150M       | 100M       | 100M       | -       | -      |
| 과세가액              | 8,775M     | 3,695M     | 2,150M     | 1,730M     | 500M    | 700M   |
| 상속공제              | -4,600M    |             |             |             |         |         |
| 과세표준              | 4,175M     |             |             |             |         |         |
| ⑤상속인별 과세표준상당액 |  4,175M   | 1,101.3M   | 1,658.5M   | 554.8M     | 160.4M  | -      |
| ⑦산출세액             | 1,627.5M   |             |             |             |         |         |
| ⑧세대생략할증          | 30.2M      |             |             |             |         | -      |
| ⑨산출세액 소계        | 1,657.7M   |             |             |             |         |         |
| ⑩영리법인 면제        | -150M      |             |             |             |         | 150M   |
| ⑪배부대상            | 1,477.5M   | 468.3M     | 705.1M     | 235.9M     | 98.4M   | -      |
| ⑫사전증여세액공제     | -442M      | 22M        | 420M       | -          | -       | -      |
| ⑬차가감              | 1,065.7M   | 446.3M     | 285.1M     | 235.9M     | 98.4M   | -      |
| ⑭신고세액공제 3%      | -31.97M    | 13.4M      | 8.5M       | 7.1M       | 2.95M   | -      |
| **⑮자진납부세액**     |**1,033.8M**|**432.9M** |**276.6M** |**228.8M** |**95.5M**| -      |
```

---

## 7. 위험 완화 (Design 단계 결정)

| 위험 | 결정 | 근거 |
|---|---|---|
| 영리법인 합산 vs 면제 처리 순서 | **§13 ②로 합산 (과세가액·과세표준 포함) → §28 (또는 별도 항목) 단계에서 면제 차감** | PDF 본문 ⑤ "면제세액 150M" 위치가 산출세액 → 면제 → 배부 순. 면제는 세액 단계. |
| 상속인별 §28 분모 | **상속인별 산출세액상당액 + 상속인별 사전증여 과세표준 / 상속인별 과세표준상당액** | PDF 책 1867 ① 배우자 산식 명시 |
| 손녀 할증세액 30.2M 배부 위치 | **distributableTax에서 제외 (1,477.5M, 할증 전 산출세액 − 영리법인 면제). 손녀 산출세액상당액 계산 후 직접 가산** | PDF 책 1865 ④ 손녀 = 68,182,324 (배부분) + 30,232,198 (할증) = 98,414,522 |
| 원 미만 절사 정책 | 모든 floor 연산 — 산출세액상당액·간접배부·신고세액공제 등. 지방소득세는 10원 미만 절사가 아닌 **원 미만 절사**. | 상증법 §65 (1원 단위) |
| perHeir Map 영리법인 항목 | finalTax=0으로 포함 (sum 영향 없음). corporateExemption.amount는 별도 노출 | PDF 표 6열 컬럼 유지 |
| 케이스 매트릭스 단위 정확성 | 모든 anchor amount는 **원 단위 정수** (₩단위). PDF는 백만원 단위 약식 표기 — Plan §1 표는 약식, Design anchor는 원 단위 정수 | feedback_pdf_example_test_anchoring |
| `taxBase=0` 인 상속인 안분 | **간접배부 분모가 0이면 균등분배 fallback (warning)** | 디자인 시점에서 corner-case 정의. PDF 사례는 분모 ≠ 0. |
| `heirAllocations[].amount` 합 ≠ `valuatedAmount` | **validation 차단** + 자동 안분 fallback 금지 | feedback_no_silent_apportion_fallback 정책 |

---

## 8. 다음 세션 작업 시작 신호

본 Design 문서가 confirm되면 다음 세션은 아래 순으로 진행:

1. **Pre-Do anchor 작성** (§4) — `comprehensive-case-pre.test.ts` 6건
2. anchor 실행 → 전부 fail 예상 (엔진 미구현) → 메시지 확인 → 디자인 환류
3. **Phase A 구현** (추정상속재산 §15) → PRE-1 통과
4. **Phase B 구현** (영리법인 면제) → PRE-2 통과
5. **Phase F 구현** (세대생략 분모) → PRE-3 통과
6. **Phase C/D 구현** (상속인별 배부 + 배우자공제 산식) → PRE-4·5·6 통과
7. **Phase E 구현** (가업·동거 직접 입력)
8. **Phase G 구현** (UI 14지점)
9. **Phase H 구현** (종합 anchor 50개)

각 Phase 완료마다 회귀 0건 + matchRate ≥ 90 + 14지점 sync 0누락 확인.
