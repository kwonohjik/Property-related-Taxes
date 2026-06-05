# 감정평가수수료 공제 (상속 §25①2호·§20의3 / 증여 §55①·§46의2) — 엔진 설계

> 계획서: `docs/00-pm/appraisal-fee-deduction.plan.md` (13단계 자가검토 — 검토×2 + 환류, 정정 9건+§46의2 확정 반영)
> UI 측: `appraisal-fee-deduction.ui.design.md`

## Context

감정평가수수료 공제는 **신고서 양식 칸(상속 별지9호 ⑲ / 증여 별지10호 ㉙)에 라벨만** 존재하고 입력·계산·UI가 전무하여 **항상 0원**이다. 두 엔진의 과세표준 산식이 수수료 차감 자체를 누락하고 있다(`inheritance-tax.ts:500`·`gift-tax.ts:135`). 상속 result엔 `appraisalFeeDeduction` 필드 자체가 부재, 증여 result는 `gift-tax.ts:282`에서 `appraisalFeeDeduction: 0` 하드코딩.

본 작업은 신규 입력(`AppraisalFeeInput`) + 공유 순수 계산 모듈(3종·한도) + 양 엔진 과세표준 STEP 차감 + result·CalculationStep·신고서 연동까지 **법령 정합으로 완성**하는 것이다.

**법령 위임 체인 (KoreanLaw 실측 확정, 2026-06-05)**:
- 상속: 법 **§25①2호** → 상증령 **§20의3**
- 증여: 법 **§55①** → 상증령 **§46의2** → **§20의3 준용**(용어만 상속→증여 치환)
- ∴ 상속·증여 **한도·요건 동일** → 공유 모듈 단일 진실 설계가 준용 구조와 정확히 일치.

---

## ★ 케이스 인벤토리 (필수)

| # | 시나리오 | 법령 근거 | anchor 출처 | 테스트 파일 | 상태 |
|---|---------|----------|-------------|-----------|------|
| AF-1 | 부동산 감정 300만 + 감정가액으로 신고 → 전액 | §20의3①1호·② | 한도 내 | `appraisal-fee-deduction.test.ts` | ☐ TODO |
| AF-2 | 부동산 감정 700만(한도 초과) + 감정가 신고 → **500만 cap** | §20의3③ "500만원 초과 시 500만원" | 경계(cap) | `appraisal-fee-deduction.test.ts` | ☐ TODO |
| AF-3 | 부동산 감정 300만 + **감정가 미신고** → **0 + 경고** | §20의3② "그 가액으로 신고·납부하는 경우에 한하여" | eligibility | `appraisal-fee-deduction.test.ts` | ☐ TODO |
| AF-4 | 비상장주식 신용평가 1,500만(법인1·기관1) → **1천만 cap** | §20의3③ 2호 | 경계(cap) | `appraisal-fee-deduction.test.ts` | ☐ TODO |
| AF-5 | 비상장주식 1,500만(법인2·기관1) → 한도 2천만 → 1,500만 전액 | §20의3③ 2호 "수별로 각각 1천만" | 곱셈 한도 | `appraisal-fee-deduction.test.ts` | ☐ TODO |
| AF-6 | 서화·골동품 700만 → **500만 cap** | §20의3①3호·③ | 경계(cap) | `appraisal-fee-deduction.test.ts` | ☐ TODO |
| AF-7 | 3종 동시(부동산500만+비상장1천만+서화500만) → 합 2,000만 | §20의3 전호 | 합산 | `appraisal-fee-deduction.test.ts` | ☐ TODO |
| AF-8 | 미입력(`appraisalFee=undefined`) → 0 (현행 유지·회귀 가드) | — | 회귀 | `appraisal-fee-deduction.test.ts` | ☐ TODO |
| AF-9 | **(상속 통합·Pre-Do)** 과세가액10억−공제5억−수수료500만 → `taxBase=495,000,000` | 법 §25①2호 | 통합(차감 반영) | `inheritance/*.test.ts` | ☐ TODO |
| AF-10 | **(증여 경계)** 과세가액−공제=60만, 수수료20만 → 40만 → `taxBase=0`(50만 미만) | 법 §55②(과세최저한) | 경계 | `gift-tax*.test.ts` | ☐ TODO |
| AF-11 | **(증여 신고서 정합)** ㉙=수수료, ㉚=`r.taxBase` → ㉚ = `㉔−㉕−㉖−㉗−㉘−㉙` 산식 일치(drift 0) | 별지10호 §55 | self-consistency | `gift-tax*.test.ts` | ☐ TODO |

**규칙**: AF-1~8 = `calcAppraisalFeeDeduction` **단위**(공유 모듈, 호별 한도·§20의3② eligibility·2호 곱셈). AF-9 = 상속 **Pre-Do anchor**(현재 미차감 → 실패 확보 후 환류). AF-10·11 = 증여 **통합**.

---

## 법령 근거

`lib/tax-engine/legal-codes/inheritance-gift.ts` 상수 신규 추가 (문자열 리터럴 금지). 정의는 `INH`(:12)·`GIFT`(:56) 객체:
```ts
// INH 객체 (inheritance-tax.ts는 `import { INH }` — 별칭 없음)
INH.APPRAISAL_FEE      = "상증법 §25①2호"   // 상속 과세표준 차감 근거
INH.APPRAISAL_FEE_ENF  = "상증령 §20의3"     // 상속 수수료 정의·한도
// GIFT 객체 (gift-tax.ts는 `import { GIFT as GIFT_LAW }` — 파일 내 참조는 GIFT_LAW.*)
GIFT.APPRAISAL_FEE     = "상증법 §55①"       // 증여 과세표준 차감 근거
GIFT.APPRAISAL_FEE_ENF = "상증령 §46의2"     // 증여 위임 (§20의3 준용)
```
> ⚠️ 정의는 `GIFT.APPRAISAL_FEE`, gift-tax.ts 내 사용은 별칭 `GIFT_LAW.APPRAISAL_FEE`(E-2 실측).

```
법 §25①(상속세 과세표준): 상속세 과세표준 = 제13조 과세가액
  − [1호] §18~§24 상속공제액
  − [2호] 대통령령으로 정하는 상속재산의 감정평가 수수료

법 §55①(증여세 과세표준): 다음 각 호 금액 − 대통령령으로 정하는 증여재산의 감정평가 수수료
  (4호 일반: §47① 과세가액 − §53·§53의2·§54 공제 / 3호 합산배제: 증여재산가액−3천만 / 1·2호: 명의신탁·증여의제)
법 §55②: 과세표준 50만원 미만이면 증여세 부과하지 아니함.

상증령 §20의3(감정평가 수수료 공제):
  ① 법 §25①2호 "대통령령으로 정하는 상속재산의 감정평가 수수료"란 상속세 신고·납부 위해 평가에 드는 수수료로서:
    1호. 「감정평가 및 감정평가사에 관한 법률」 감정평가법인등 평가 수수료 (상속세 납부목적용 한정)
    2호. §49의2⑨ 평가수수료 (비상장주식 등 신용평가전문기관)
    3호. §52②2호 유형재산(서화·골동품 등) 평가 감정수수료
  ② 1호는 그 가액으로 상속세를 신고·납부하는 경우에 한하여 적용.
  ③ 1호·3호 수수료가 500만원 초과 시 500만원으로 함. 2호는 평가대상 법인의 수 및
     평가 의뢰한 신용평가전문기관의 수별로 각각 1천만원을 한도.
  ④ 공제받으려는 자는 지급사실 입증서류를 상속세 과세표준 신고와 함께 제출.

상증령 §46의2(감정평가 수수료 공제 — 증여):
  법 §55① 각 호 외의 부분 "대통령령으로 정하는 증여재산의 감정평가 수수료"란 §20의3에 따른 수수료.
  이 경우 §20의3 중 "상속재산"→"증여재산", "상속세"→"증여세", "상속세과세표준신고"→"증여세과세표준신고"로 본다.
```

> ⚠️ **인용 정책**([[feedback_korean_law_citation_verify]]): 증여 근거는 **§46의2**로 인용. §20의3은 법문상 "상속재산"이므로 증여 컨텍스트에서 **§20의3 직접 인용 금지** — `ctx.taxType`로 lawRef 분기.

---

## 엔진 input 타입

```ts
// lib/tax-engine/types/inheritance-gift.types.ts — 신설 (상속·증여 공용)
/** 감정평가수수료 입력 (상증령 §20의3 / 증여 §46의2 준용 — 상속·증여 공용) */
export interface AppraisalFeeInput {
  /** §20의3①1호 — 부동산 등 감정평가법인 수수료 (500만 한도, 감정가액 신고 시만 §20의3②) */
  realEstateAppraisalFee?: number;
  /** §20의3①2호 — 비상장주식 등 신용평가전문기관 수수료 (1천만 × 법인수 × 기관수 한도) */
  unlistedStockAppraisalFee?: number;
  /** §20의3③ 2호 한도 산정 — 평가대상 법인 수 (미입력 1) */
  unlistedTargetCount?: number;
  /** §20의3③ 2호 한도 산정 — 신용평가전문기관 수 (미입력 1) */
  unlistedAgencyCount?: number;
  /** §20의3①3호 — 서화·골동품 등 유형재산 감정수수료 (500만 한도) */
  tangibleAppraisalFee?: number;
}

// InheritanceTaxInput (types:1006~) 에 추가
appraisalFee?: AppraisalFeeInput;   // §25①2호 / §20의3
// GiftTaxInput (types:1156~) 에 추가
appraisalFee?: AppraisalFeeInput;   // §55① / §46의2(§20의3 준용)
```

## 엔진 result 타입

> ⚠️ **순환 의존 회피(E-1)**: `AppraisalFeeResult`·`AppraisalFeeBreakdownItem`을 **`types/inheritance-gift.types.ts`에 정의**(AppraisalFeeInput과 같은 파일)하고 공유 모듈이 `import type`. 모듈에 정의하면 `types → 모듈 → types(AppraisalFeeInput)` 순환. (foreign-tax-credit 선례에서도 detail 타입은 import 안 하고 인라인/types 정의로 순환 회피)

```ts
// types/inheritance-gift.types.ts — 신설 (AppraisalFeeInput·Result·BreakdownItem 모두 여기)
export interface AppraisalFeeBreakdownItem { label: string; amount: number; lawRef: string; }
export interface AppraisalFeeResult {
  total: number;
  breakdown: AppraisalFeeBreakdownItem[];   // 호별 한도 적용 내역 (결과 펼침용)
  warnings: string[];                       // 1호 감정가 미신고(§20의3②)·입증서류(§20의3④) 안내
}

// InheritanceTaxResult (types:1047~) — 신규 필드 (현재 부재)
appraisalFeeDeduction?: number;             // 감정평가수수료 공제액 (별지9호 ⑲)
appraisalFeeDetail?: AppraisalFeeResult;    // 호별 내역·경고 (결과 ▼펼침)

// GiftTaxResult (types:1227) — appraisalFeeDeduction?: number 이미 존재 (gift-tax.ts:282 0 대체)
appraisalFeeDetail?: AppraisalFeeResult;    // 신규(증여도 ▼펼침 동일)
```
(공유 모듈 `appraisal-fee-deduction.ts`는 위 3개 타입을 `import type`만 — 타입 재정의 금지)

새 Date 필드 없음 (금액 정수만).

---

## 계산 알고리즘 (단계별)

### `calcAppraisalFeeDeduction(fee, ctx)` — 순수 함수 (`lib/tax-engine/deductions/appraisal-fee-deduction.ts`)
```ts
export const APPRAISAL_FEE_LIMITS = { REAL_ESTATE: 5_000_000, UNLISTED_PER_UNIT: 10_000_000, TANGIBLE: 5_000_000 } as const;

calcAppraisalFeeDeduction(
  fee: AppraisalFeeInput | undefined,
  ctx: { hasAppraisalValuation: boolean; taxType: "inheritance" | "gift" },
): AppraisalFeeResult
```
1. `fee` undefined/falsy → `{ total: 0, breakdown: [], warnings: [] }` 조기 반환 (AF-8).
2. **1호(부동산)** — `ctx.hasAppraisalValuation`(§20의3② eligibility) true일 때만:
   `realEstate = Math.min(fee.realEstateAppraisalFee ?? 0, 5_000_000)` (AF-1·2). false면 0 + warning("감정가액으로 신고한 경우에만 공제 — §20의3②") (AF-3).
3. **2호(비상장)** — `unitLimit = 10_000_000 × Math.max(1, target ?? 1) × Math.max(1, agency ?? 1)`;
   `unlisted = Math.min(fee.unlistedStockAppraisalFee ?? 0, unitLimit)` (AF-4·5).
4. **3호(유형재산)** — `tangible = Math.min(fee.tangibleAppraisalFee ?? 0, 5_000_000)` (AF-6).
5. `total = realEstate + unlisted + tangible` (AF-7). **모두 원 단위 `Math.min` — 절사 불요**(한도 정액). `applyRate`/float 곱 없음.
6. `breakdown` 각 호 push (amount>0 항목만). **`lawRef` 분기**: `ctx.taxType==="inheritance"` → `"상증령 §20의3 N호"`, `"gift"` → `"상증령 §46의2(§20의3 N호 준용)"`. (§20의3 직접 인용 금지)
7. `warnings`: 1호 미적용(§20의3②) + 입증서류 안내(§20의3④, total>0 시).

### 상속 통합 — `inheritance-tax.ts` STEP 7 (`:497~`)
```ts
const hasAppraisalValuation = input.estateItems.some((i) => i.valuationMethod === "appraisal");
const appraisal = calcAppraisalFeeDeduction(input.appraisalFee, { hasAppraisalValuation, taxType: "inheritance" });
const taxBase = Math.max(0, taxableEstateValue - totalDeduction - appraisal.total);  // ← − appraisal.total (AF-9)
// allBreakdown.push({ label: "감정평가수수료 공제", amount: -appraisal.total, lawRef: INH.APPRAISAL_FEE }) — total>0 시
// result.appraisalFeeDeduction = appraisal.total; result.appraisalFeeDetail = appraisal;
```

### 증여 통합 — `gift-tax.ts` STEP 5 (`:132~`)
```ts
const hasAppraisalValuation = input.giftItems.some((i) => i.valuationMethod === "appraisal");
const appraisal = calcAppraisalFeeDeduction(input.appraisalFee, { hasAppraisalValuation, taxType: "gift" });
const rawTaxBase = Math.max(0, aggregatedGiftValue - totalDeduction - appraisal.total);  // ← − appraisal.total
const taxBase = rawTaxBase < TAX_BASE_MIN ? 0 : rawTaxBase;   // §55② 50만 최저한 — 수수료 차감 後 판정 (AF-10)
// result.appraisalFeeDeduction = appraisal.total (line 282 하드코딩 0 대체); result.appraisalFeeDetail = appraisal;
```
- **순서 주의**: §55② 50만 최저한은 수수료 차감 **후** 적용(수수료가 과세표준을 낮춤 → 최저한 판정도 낮아진 값 기준).
- **별지10호 ㉚ self-consistency (AF-11)**: `besshi10.ts:128` ㉚ formula가 이미 `㉙` 차감 표시 → 엔진 `taxBase`도 ㉙ 반영해야 ㉚ 표시값(=`r.taxBase`)과 산식 일치.

---

## Silent fallback / 자동 안분 후보 식별

- **`fee` 미입력 → 0** (AF-8). 자동 채움 아님. 미입력은 공제 0(현행 유지) — 회귀 0.
- **1호 §20의3② 미충족(감정가 미신고) → 0 + 경고** (AF-3). 자동 안분이 아니라 **법령 요건 미충족**([[feedback_no_silent_apportion_fallback]]). 하드 차단 대신 경고(납세자가 다른 호로 신고 가능).
- **`hasAppraisalValuation`은 estateItems/giftItems의 `valuationMethod === "appraisal"` 단일 도출** — 사용자 별도 입력 없음(dual-truth 회피, [[feedback_ui_engine_dual_truth_avoidance]]).
- **2호 법인수·기관수 미입력 → 각 1로 fallback**(한도 1천만). 이는 §20의3③ 최소 단위로, 한도 산정의 법정 기본값(자동 안분 아님).
- validation(⑧): 5개 금액·2개 카운트 음수 차단(Zod `nonnegative`와 동일). UI 통과 ↔ validate 차단 모순 금지.

---

## 테스트 약속

- AF-1~AF-11 전부 anchor. 한도 cap은 원단위 `toBe()` (예: `expect(calcAppraisalFeeDeduction({ realEstateAppraisalFee: 7_000_000 }, { hasAppraisalValuation: true, taxType: "inheritance" }).total).toBe(5_000_000)`).
- AF-9 **Pre-Do 우선**([[pre-do-anchor-verification]]): 현재 미차감 상태에서 `taxBase` 기대 495,000,000이 실패함을 먼저 확보 → 차감 구현 후 GREEN.
- AF-5 곱셈 한도: `unlistedTargetCount=2, unlistedAgencyCount=1` → 한도 2천만 → `min(1500만, 2000만)=1500만`.
- AF-3 eligibility: `hasAppraisalValuation=false` → 1호 0 + warning 포함 검증.
- 전체 회귀 0 — 미입력 시 0이라 기존 케이스 불변. (baseline 수치는 Do 시 `npm test`로 확인 — 추정 금지)

---

## UI 통합 위임

- UI 명세는 `appraisal-fee-deduction.ui.design.md`.
- 상속 14지점 중 **⑫⑬⑭(Zod·api.ts body·route 매핑) 3곳 모두 명시 매핑** — 1곳 누락 시 침묵 strip([[feedback_explicit_prop_mapping_strip]]). 증여는 Zod(⑫)만(route spread 자동).
- 결과 명세: 상속 `InheritanceTaxResultView` CalculationStep + 별지9호 ⑲ / 증여 `GiftTaxResultView` + 별지10호 ㉙·㉚ — `appraisalFeeDetail` ▼펼침(호별 한도 내역).
- 엔진 시니어는 input/result 타입(`AppraisalFeeInput`·`appraisalFeeDeduction`·`appraisalFeeDetail`) + 알고리즘 + legal-codes 상수만. ⑤⑥⑦⑧은 UI 시니어.
