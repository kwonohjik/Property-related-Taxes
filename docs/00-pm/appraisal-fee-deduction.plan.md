# 감정평가수수료 공제 구현 (상속세·증여세) (Plan)

> 작성 2026-06-05 · 세목: 상속세·증여세 · 조문: 상증법 §25①2호 / §55① / 시행령 §20의3
> 대상: `lib/tax-engine/inheritance-tax.ts`·`gift-tax.ts` + 신규 공유 모듈 + 타입 + UI(상속 Step4·증여 공제단계) + 신고서(별지9호 ⑲·별지10호 ㉙)
> 정책 참조: [[feedback_korean_law_citation_verify]] · [[feedback_tax_calculation_principle]] · [[feedback_api_zod_schema_sync]] · [[feedback_no_silent_apportion_fallback]] · [[feedback_engine_result_display_drift]] · [[mirror-pattern]] · [[pre-do-anchor-verification]] · [[single-source-engine-helper]]

---

## 0. 요약 (TL;DR)

감정평가수수료 공제(상증법 §25①2호·§55①·시행령 §20의3)는 **신고서 양식 칸(별지10호 ㉙ / 별지9호 ⑲)에 라벨만 존재**하고 입력·계산·UI가 전무하여 **항상 0원**이다. 이를 실제 입력·한도계산·과세표준 차감까지 구현한다.

- **법령**: 과세표준 = 과세가액 − 공제 − **감정평가수수료**. 수수료는 3종(① 부동산 등 감정 500만 한도 / ② 비상장주식 신용평가 1천만×법인수×기관수 한도 / ③ 서화·골동품 등 유형재산 감정 500만 한도). ①은 **감정가액으로 신고한 경우만**(§20의3②).
- **갭**: 양 엔진의 과세표준 산식에서 누락 (`inheritance-tax.ts:500`, `gift-tax.ts:135`). 상속 result엔 필드 자체 부재, 증여 result는 `gift-tax.ts:282`에서 0 하드코딩.
- **법령 근거 (실측 확정)**: 상속 = 상증령 **§20의3**(법 §25①2호 위임), 증여 = 상증령 **§46의2**(법 §55① 위임 — §20의3 **준용**, 한도·요건 동일). 공유 모듈 단일 진실이 준용 구조와 일치. ⚠️ §20의3 법문 자체는 "상속재산"이므로 증여 근거는 §46의2로 인용(§20의3 직접 인용 금지).
- **🔴 구조 주의 (실측)**: 상속·증여 API 경로 **비대칭** — 상속은 Zod·`inheritance-api.ts` body·`route.ts` **3곳 모두 명시 매핑**(strip 위험 3중), 증여는 Zod + `buildGiftTaxInput` return(route는 spread 자동). §5 참조.
- **변경**: ① 입력 타입(`AppraisalFeeInput`) 신설 + 양 Input에 추가 ② 공유 순수 계산 모듈(`appraisal-fee-deduction.ts`) — 3종 한도 적용 ③ 양 엔진 과세표준 STEP에 차감 1줄 + result·CalculationStep 반영 ④ UI 입력 섹션(상속 Step4·증여 공제단계) ⑤ 신고서 ㉙·㉚·⑲ 실값 연동 ⑥ 상속 ⑫⑬⑭ 3지점 동기화.
- **법령 정확성 최우선**([[feedback_tax_calculation_principle]]): 절감·유불리 표현 금지, 한도·요건 중립 서술. 자동 fallback 금지([[feedback_no_silent_apportion_fallback]]) — 미입력은 0, 한도는 명시 계산.

---

## 1. 법령 근거 (KoreanLaw MCP 검증 완료 — 2026-06-05)

> 상증법 mst=276123(시행 20260102) · 상증령 mst=283637(시행 20260227). 조문 전문 직접 조회.

### §25① (상속세 과세표준)
> ① 상속세 과세표준 = 제13조 과세가액 − [1호] §18~§24 상속공제액 − **[2호] 대통령령으로 정하는 상속재산의 감정평가 수수료**.

### §55① (증여세 과세표준)
> ① 증여세 과세표준 = [1~4호 각 금액] − **대통령령으로 정하는 증여재산의 감정평가 수수료**.
> (4호 일반: §47① 과세가액 − §53·§53의2·§54 공제. 3호 합산배제: 증여재산가액 − 3천만. 1·2호: 명의신탁·증여의제.)

### 시행령 §20의3 (감정평가 수수료 공제) — 3종·한도 확정
> ⚠️ **§20의3①은 법문상 「상속」 전용** — KoreanLaw 실측(2026-06-05): 본문이 "법 **제25조제1항제2호**에서 «대통령령으로 정하는 **상속재산**의 감정평가 수수료»란…"으로 시작. 증여세 §55① 위임 조문이 **아님**.

| 호 | 대상 | 한도(§20의3③ 문언) | 추가 요건 |
|---|---|---|---|
| **1호** | 「감정평가 및 감정평가사에 관한 법률」 감정평가법인등 평가 수수료 (상속세 납부목적용으로 한정) | **500만원**(§20의3③ "500만원을 초과하는 경우 500만원") | **§20의3② — 그 가액으로 신고·납부하는 경우에 한하여 적용** |
| **2호** | §49의2⑨ 평가수수료 (비상장주식 등 신용평가전문기관) | §20의3③ "**평가대상 법인의 수(數) 및 평가를 의뢰한 신용평가전문기관의 수별로 각각 1천만원**을 한도" | — |
| **3호** | §52②2호 유형재산(서화·골동품 등) 평가 감정수수료 | **500만원**(1호와 동일 항) | — |
| §20의3④ | 공제받으려는 자는 수수료 지급사실 입증서류를 상속세 과세표준 신고와 함께 제출 | — | 입증서류(안내만) |

### ✅ 증여세(§55①) 위임 시행령 = **상증령 §46의2 (§20의3 준용) — 확정**
> KoreanLaw 실측 확정(2026-06-05):
> **상증령 §46의2(감정평가 수수료 공제)**: "법 제55조제1항 각 호 외의 부분에서 «대통령령으로 정하는 증여재산의 감정평가 수수료»란 **제20조의3에 따른 수수료**를 말한다. 이 경우 §20의3 중 «상속재산»은 «증여재산»으로, «상속세»는 «증여세»로, «상속세과세표준신고»는 «증여세과세표준신고»로 본다."
>
> - ∴ 증여세 감정평가수수료는 **§20의3을 그대로 준용** — 3종·한도(500만/1천만)·§20의3② eligibility(감정가액 신고 시만 1호)·§20의3④ 입증서류 **모두 동일 적용**. 용어만 상속→증여 치환.
> - **공유 모듈 설계 정당성 확보**: `appraisal-fee-deduction.ts` 단일 진실이 법령 준용 구조(§46의2 → §20의3)와 정확히 일치.
> - **D-5 BLOCKING 해소** → 상속·증여 **동시 구현 가능**.
> - **legal-codes 상수**: 상속 근거 `§20의3`, 증여 근거 `§46의2`(준용 표기) 양쪽 등록.

---

## 2. 현행 구현 갭 진단 (file:line 실측)

| 구성 | 상태 | 위치 |
|---|---|---|
| §25① 과세표준 산식 | **수수료 차감 누락** | `inheritance-tax.ts:500` `taxBase = max(0, taxableEstateValue − totalDeduction)` |
| §55① 과세표준 산식 | **수수료 차감 누락** | `gift-tax.ts:135` `rawTaxBase = max(0, aggregatedGiftValue − totalDeduction)` |
| 증여 result.appraisalFeeDeduction | **0 하드코딩** | `gift-tax.ts:282` `appraisalFeeDeduction: 0` |
| 상속 result.appraisalFeeDeduction | **필드 자체 부재** | `InheritanceTaxResult`(types:1047) 미정의 |
| 별지10호 ㉙ (증여) | 라벨만, 값 0 | `gift-tax-filing-form-besshi10.ts:127` `r.appraisalFeeDeduction ?? 0` |
| 별지9호 ⑲ (상속) | 0 하드코딩 | `filing-form-9-data.ts:102` `const b19 = 0; // 현 상속세 result 미보유` |
| 별지10호 ㉚ formula | **잠복 모순** | `besshi10.ts:128` ㉚ 과세표준 `formula:"㉔−㉕−㉖−㉗−㉘−㉙"` (이미 ㉙ 차감 표시) — 엔진이 ㉙ 미차감 시 ㉚=`r.taxBase`와 산식 불일치. 현재 ㉙=0이라 잠복 |
| 입력 필드 | **전무** | `InheritanceTaxInput`(1006)·`GiftTaxInput`(1156) |
| UI 위젯 | **전무** | `components/calc/` 0건 |
| **상속 Zod** | **전무** | `lib/validators/property-valuation-input.ts` `inheritanceTaxInputSchema`(732) top-level |
| **증여 Zod** | **전무** | 동 파일 `giftTaxInputSchema`(767) top-level |
| **상속 route ⑭** | **strip 위험** | `app/api/calc/inheritance/route.ts:69-90` **명시 매핑** `const input:InheritanceTaxInput={…}` — `appraisalFee` 미추가 시 Zod 통과해도 **침묵 strip** |
| **상속 api.ts body ⑬** | strip 위험 | `inheritance-api.ts:68-89` body **명시 spread**(통째 spread 아님) |
| 증여 route ⑭ | spread 자동(안전) | `gift/route.ts:62` `parsed.data as GiftTaxInput` — Zod만 추가하면 통과 |

**결론**: 과세표준 산식 누락 → 현재 모든 케이스에서 감정평가수수료가 과세표준을 줄이지 못함(항상 −0). **상속은 Zod·api.ts body·route 3곳 모두 명시 매핑** → 침묵 strip 위험 3중. 증여는 route가 spread라 Zod만 추가하면 통과(비대칭).

---

## 3. 변경 설계

### 3-1. 입력 타입 — `AppraisalFeeInput` 신설 (공유)

`types/inheritance-gift.types.ts`:
```ts
/** 감정평가수수료 입력 (상증령 §20의3 — 상속·증여 공용) */
export interface AppraisalFeeInput {
  /** §20의3①1호 — 부동산 등 감정평가법인 수수료 (500만 한도, 감정가액 신고 시만 §20의3②) */
  realEstateAppraisalFee?: number;
  /** §20의3①2호 — 비상장주식 등 신용평가전문기관 수수료 */
  unlistedStockAppraisalFee?: number;
  /** §20의3①2호 한도 산정 — 평가대상 법인 수 (미입력 1) */
  unlistedTargetCount?: number;
  /** §20의3①2호 한도 산정 — 신용평가전문기관 수 (미입력 1) */
  unlistedAgencyCount?: number;
  /** §20의3①3호 — 서화·골동품 등 유형재산 감정수수료 (500만 한도) */
  tangibleAppraisalFee?: number;
}
```
- `InheritanceTaxInput.appraisalFee?: AppraisalFeeInput` 추가 (line 1046 인근).
- `GiftTaxInput.appraisalFee?: AppraisalFeeInput` 추가 (line 1180 인근).
- `InheritanceTaxResult.appraisalFeeDeduction?: number` 추가 (현재 부재) + 선택적 `appraisalFeeDetail?` (호별 내역) — 결과 표시용.

### 3-2. 공유 순수 계산 모듈 `lib/tax-engine/deductions/appraisal-fee-deduction.ts`

[[single-source-engine-helper]] — 상속·증여 단일 진실:
```ts
export const APPRAISAL_FEE_LIMITS = { REAL_ESTATE: 5_000_000, UNLISTED_PER_UNIT: 10_000_000, TANGIBLE: 5_000_000 } as const;

export function calcAppraisalFeeDeduction(
  fee: AppraisalFeeInput | undefined,
  ctx: { hasAppraisalValuation: boolean; taxType: "inheritance" | "gift" },   // §20의3② eligibility + 근거조문 분기
): { total: number; breakdown: { label: string; amount: number; lawRef: string }[]; warnings: string[] } {
  // lawRef 분기: 상속 = "상증령 §20의3", 증여 = "상증령 §46의2(§20의3 준용)" — 법문 "상속재산"이므로 증여는 §20의3 직접 인용 금지
  if (!fee) return { total: 0, breakdown: [], warnings: [] };
  // 1호: 감정가 신고 시만 (§20의3②). 미충족 시 0 + 경고.
  const realEstate = ctx.hasAppraisalValuation
    ? Math.min(fee.realEstateAppraisalFee ?? 0, APPRAISAL_FEE_LIMITS.REAL_ESTATE) : 0;
  // 2호: 1천만 × 법인수 × 기관수
  const unitLimit = APPRAISAL_FEE_LIMITS.UNLISTED_PER_UNIT
    * Math.max(1, fee.unlistedTargetCount ?? 1) * Math.max(1, fee.unlistedAgencyCount ?? 1);
  const unlisted = Math.min(fee.unlistedStockAppraisalFee ?? 0, unitLimit);
  // 3호: 500만
  const tangible = Math.min(fee.tangibleAppraisalFee ?? 0, APPRAISAL_FEE_LIMITS.TANGIBLE);
  const total = realEstate + unlisted + tangible;
  // ... breakdown push(호별 한도 적용 라벨) + warnings(1호 감정가 미신고 시·입증서류 §20의3④ 안내)
  return { total, breakdown, warnings };
}
```
- **정수 연산**: 모두 원 단위 `Math.min`. 절사 불요(한도는 정액).
- **§20의3② eligibility — 실측 확정**: `hasAppraisalValuation` = estateItems(상속)·giftItems(증여) 중 `valuationMethod === "appraisal"` 자산 존재 여부. 근거: `EstateItem.valuationMethod?: ValuationMethod`(types:230) + Zod enum(`property-valuation-input.ts:54-63` `"appraisal"` 포함). 상속·증여 Input 모두 `EstateItem[]` 보유(estateItems:1010 / giftItems:1164) → 동일 헬퍼로 도출.

### 3-3. 엔진 통합

**상속 (`inheritance-tax.ts` STEP 7, line 498~)**:
```ts
const appraisal = calcAppraisalFeeDeduction(input.appraisalFee, { hasAppraisalValuation, taxType: "inheritance" });
const taxBase = Math.max(0, taxableEstateValue - totalDeduction - appraisal.total);  // ← − appraisal.total 추가
// CalculationStep "감정평가수수료 공제" push + result.appraisalFeeDeduction = appraisal.total
```
**증여 (`gift-tax.ts` STEP 5, line 135~)**:
```ts
const appraisal = calcAppraisalFeeDeduction(input.appraisalFee, { hasAppraisalValuation, taxType: "gift" });
const rawTaxBase = Math.max(0, aggregatedGiftValue - totalDeduction - appraisal.total);  // ← 추가
const taxBase = rawTaxBase < TAX_BASE_MIN ? 0 : rawTaxBase;
// result.appraisalFeeDeduction = appraisal.total  (line 282 하드코딩 0 대체)
```
- **순서 주의**: §55① 50만원 최저한(`TAX_BASE_MIN`=500,000, `gift-tax.ts:48`)은 수수료 차감 **후** 적용 (수수료가 과세표준을 낮춤 → 최저한 판정도 낮아진 값 기준). 현행 순서 유지하되 차감을 `rawTaxBase` 산식에 포함.
- ✅ **증여 차감 즉시 가능**: 상증령 §46의2(§20의3 준용)로 법적 근거 확정 — 상속·증여 동시 구현. `GIFT_LAW.TAX_BASE` 근거에 §46의2 반영.
- **별지10호 ㉚ self-consistency**: `besshi10.ts:128` ㉚ formula가 이미 `㉙` 차감 표시 → 엔진 `taxBase`도 ㉙ 반영해야 ㉚ 표시값(=`r.taxBase`)과 산식 일치. 현재 ㉙=0이라 잠복, 구현 후 정합 필수(R-2).
- **상속 ⑭ route 매핑**: `inheritance/route.ts:69-90` 명시 객체에 `appraisalFee: parsedData.appraisalFee` 1줄 추가 필수(누락 시 Zod 통과해도 strip). 증여 route는 `parsed.data` spread라 추가 불요.

### 3-4. 신고서 연동
- 증여 별지10호 ㉙: `gift-tax-filing-form-besshi10.ts:127` 이미 `r.appraisalFeeDeduction ?? 0` → 엔진 계산값 자동 반영(코드 변경 0).
- 상속 별지9호 ⑲: `filing-form-9-data.ts:102` `b19 = 0` → `b19 = result.appraisalFeeDeduction ?? 0`로 연동 (result 필드 추가 후).

### 3-5. UI 입력 섹션
- **상속**: Step4(공제·세액공제) 하단에 "감정평가수수료 공제 (§25①·시행령 §20의3)" 색상 카드(violet) — 3종 `CurrencyInput`(원) + 2호 법인수·기관수 `DecimalInput`(정수). `ToggleCard`로 optional 펼침(기본 OFF, 미해당 시 0). §20의3② 안내 hint("부동산 감정수수료는 감정가액으로 신고한 경우만 공제").
- **증여**: 증여 마법사 공제 단계에 동일 섹션.
- placeholder 숫자 예시 금지 — hint 한국어 서술. 금액 정렬 `text-right font-mono tabular-nums`.

---

## 4. 결정 필요 사항 (Design 확정)

| # | 항목 | 기본안 | 비고 |
|---|---|---|---|
| D-1 | 2호 한도 산정 — 법인수·기관수 입력 vs 단순 1천만 고정 | **법인수·기관수 입력** (default 1×1=1천만) | §20의3③ "수별로 각각 1천만". 단순화 시 다건 비상장 과소공제 |
| D-2 | §20의3② 1호 eligibility(감정가 신고 시만) | **hasAppraisalValuation 자동판정 + 미충족 시 0 + 경고** | 하드 차단 대신 경고. `valuationMethod==="appraisal"` 존재 여부(실측 확정) |
| D-3 | UI 위치 | 상속 Step4 / 증여 공제단계 (과세표준 직전 차감) | §25① 산식 순서(공제 다음) |
| D-4 | 합산배제·명의신탁(증여 §55①1~3호) 수수료 적용 | 본 작업은 일반(**4호**) 경로 우선, 1~3호는 후속 | 현 엔진 `aggregatedGiftValue` 경로(§55①4호=과세가액−§53·§53의2·§54). 1·2호(명의신탁·증여의제)·3호(합산배제−3천만)는 별도 경로 |
| **D-5** | 증여 §55① 위임 시행령 조문 | ✅ **확정: 상증령 §46의2 (§20의3 준용)** | 한도·요건 동일. BLOCKING 해소 — 상속·증여 동시 구현. 증여 근거 인용은 §46의2 |
| D-6 | 상속 ⑭ route 명시 매핑 | `route.ts:69-90`에 `appraisalFee` 1줄 추가 | 누락 시 침묵 strip(Critical) |

---

## 5. Touch Point — ⚠️ 상속·증여 **비대칭** (실측 확정)

> 양도세 14지점 프레임을 그대로 쓰지 않는다. 상속·증여는 폼→input 빌더·fetch body·route 매핑 구조가 다름(실측):
> - **상속**: 폼(`InheritanceTaxForm.tsx`) → `buildInput()`(동 파일 :334) → `callInheritanceTaxAPI` body **명시 spread**(`inheritance-api.ts:68-89`) → Zod(`inheritanceTaxInputSchema`) → route **명시 매핑**(`route.ts:69-90`) → 엔진. **명시 지점 3곳(body·Zod·route) 모두 strip 위험**.
> - **증여**: 폼(`GiftTaxForm.tsx`) → `buildGiftTaxInput()`(`gift-api.ts:37`) → fetch body `JSON.stringify(buildGiftTaxInput(form))`(`GiftTaxForm.tsx:128`, **통째 전달**) → Zod(`giftTaxInputSchema`) → route `parsed.data as GiftTaxInput`(`route.ts:62`, **spread 자동**) → 엔진. **명시 지점 2곳(빌더 return·Zod)만**.

### 상속 (11 지점)
| # | 지점 | 위치 |
|---|---|---|
| ① 폼 타입 | `AppraisalFeeInput` 신설 + `InheritanceTaxInput.appraisalFee?` (types:1044 인근) |
| ② initial | `InheritanceTaxForm.tsx` 폼 상태 initial (undefined) |
| ③ normalize | sessionStorage 호환 (optional, 미입력 무해) |
| ④ 폼→input 빌더 | **`InheritanceTaxForm.tsx:334 buildInput()`** 에 `appraisalFee` 추가 |
| ⑤ UI 위젯 | 신규 `AppraisalFeeSection` (상속 Step4) |
| ⑥ 사이드바 | (선택) 과세표준 차감 반영 |
| ⑦ 결과 카드 | `InheritanceTaxResultView` CalculationStep "− 감정평가수수료" + `result.appraisalFeeDeduction` + 별지9호 ⑲(`b19`) |
| ⑧ Validation | **`inheritance-validate.ts`** `validateInheritanceTaxInput`(:300) — 음수 차단·optional |
| **⑫ Zod** | `inheritanceTaxInputSchema`(732)에 `appraisalFee` 객체 추가 ⚠️ |
| **⑬ api.ts body** | `inheritance-api.ts:68-89` body 명시에 `appraisalFee: input.appraisalFee` 추가 ⚠️ |
| **⑭ route 매핑** | `inheritance/route.ts:69-90` 명시 객체에 `appraisalFee: parsedData.appraisalFee` 추가 ⚠️ **Critical** |

### 증여 (8 지점 — ⑥ 사이드바·route ⑭ 없음)
| # | 지점 | 위치 |
|---|---|---|
| ① 폼 타입 | `GiftTaxInput.appraisalFee?` (types:1178 인근) — `AppraisalFeeInput` 공용 |
| ② initial | `GiftTaxForm`/`gift-tax-form-shared` FormState initial |
| ③ normalize | sessionStorage 호환 (optional) |
| ④ 폼→input 빌더 | **`gift-api.ts:61 buildGiftTaxInput` return 객체**에 `appraisalFee` 추가 |
| ⑤ UI 위젯 | 신규 `AppraisalFeeSection` (증여 공제 단계) |
| ⑦ 결과 카드 | 별지10호 ㉙(기연동) + `result.appraisalFeeDeduction`(`gift-tax.ts:282` 0 대체) + ㉚ 정합 |
| ⑧ Validation | **`gift-tax-form-shared.tsx validateStep`** (⚠️ `gift-validate.ts` 부재 — cite 정정) |
| **⑫ Zod** | `giftTaxInputSchema`(767)에 `appraisalFee` 객체 추가 ⚠️ |
| (route ⑭) | 불요 — `gift/route.ts:62` spread 자동 |

### 공유
| 지점 | 위치 |
|---|---|
| 공유 모듈 | `lib/tax-engine/deductions/appraisal-fee-deduction.ts` 신설 (상속·증여 단일 진실) |
| 상속 엔진 | `inheritance-tax.ts` STEP7(:500) 차감 + result + CalculationStep |
| 증여 엔진 | `gift-tax.ts` STEP5(:135) 차감 + result(:282) — 상속과 동시 |
| legal-codes | `legal-codes/inheritance-gift.ts`: 상속 §20의3 / 증여 §46의2(§20의3 준용) 상수 |
| Zod 객체 스키마 | `property-valuation-input.ts`에 `appraisalFeeSchema`(z.object) 신설 후 양 Input 스키마에 부착 |

⚠️ **침묵 strip**([[feedback_api_zod_schema_sync]]·[[feedback_explicit_prop_mapping_strip]]): 상속은 ⑫⑬⑭ **3곳 모두** 추가해야 엔진 도달. 1곳이라도 누락 시 TypeScript 미감지 silent strip. grep 자가점검: `appraisalFee` 가 Zod·api.ts·route 3파일에 모두 등장하는지.
⚠️ **result display drift**([[feedback_engine_result_display_drift]]): 산식 차감 반영해도 `result.appraisalFeeDeduction`·CalculationStep·별지(⑲/㉙·㉚) 미반영 시 "0 표시 모순". 자기일관성 anchor 강제.

---

## 6. 케이스 인벤토리 (Do 진입 전 행≥1 필수)

| # | 시나리오 | 입력 | 기대 공제 |
|---|---|---|---|
| AF-1 | 부동산 감정 300만 + 감정가 신고 | realEstate=3,000,000, hasAppraisal=true | 3,000,000 |
| AF-2 | 부동산 감정 700만 (한도 초과) + 감정가 신고 | realEstate=7,000,000 | **5,000,000** (500만 cap) |
| AF-3 | 부동산 감정 300만 + **감정가 미신고** | realEstate=3,000,000, hasAppraisal=false | **0** + 경고(§20의3②) |
| AF-4 | 비상장주식 신용평가 1,500만 (법인1·기관1) | unlisted=15,000,000, target=1, agency=1 | **10,000,000** (1천만 cap) |
| AF-5 | 비상장주식 1,500만 (법인2·기관1) | unlisted=15,000,000, target=2, agency=1 | 15,000,000 (한도 2천만) |
| AF-6 | 서화·골동품 700만 | tangible=7,000,000 | **5,000,000** (500만 cap) |
| AF-7 | 3종 동시 (부동산500만+비상장1천만+서화500만) | 각 한도 내 | 합 20,000,000, 과세표준 −2천만 |
| AF-8 | 미입력 | appraisalFee=undefined | 0 (현행 유지) |
| AF-9 | 과세표준 차감 통합 (상속) | 과세가액10억−공제5억−수수료500만 | taxBase=495,000,000 |
| AF-10 | 증여 50만 최저한 경계 | 과세가액−공제 = 60만, 수수료 20만 → 40만 | taxBase **0** (50만 미만) |
| AF-11 | 별지10호 ㉚ self-consistency (증여) | ㉙=수수료 입력, ㉚=r.taxBase | ㉚ = `㉔−㉕−㉖−㉗−㉘−㉙` 산식과 일치 (drift 0, R-2) |

---

## 7. Anchor 계획 ([[pre-do-anchor-verification]])

> Pre-Do 우선 anchor: AF-9(상속 과세표준에 수수료 차감 반영 — 현재 미차감 실패 확보) → 설계 환류.

- `__tests__/tax-engine/appraisal-fee-deduction.test.ts`(공유 계산): AF-1~AF-8 (호별 한도·§20의3② eligibility·2호 법인수×기관수).
- `__tests__/tax-engine/inheritance/`: AF-9 (과세표준 −수수료) + result.appraisalFeeDeduction 일관성 + 별지9호 ⑲ 연동.
- `__tests__/tax-engine/gift-tax*`: 증여 과세표준 −수수료(§46의2 준용) + AF-10(50만 최저한) + result:282 0 대체 + 별지10호 ㉙ + **AF-11 ㉚ self-consistency**.
- **상속 ⑫⑬⑭ strip 방지 roundtrip**: `appraisalFee` 객체가 Zod·`inheritance-api.ts` body·`route.ts` 매핑 3곳 모두 통과해 엔진 도달하는지 (1곳 누락 시 0 회귀로 탐지).
- 증여 Zod roundtrip: `giftTaxInputSchema` `appraisalFee` 보존(strip 방지).
- 전체 회귀 0 (현행 PASS 유지 — 미입력 시 0이므로 기존 케이스 불변. ※ 실제 baseline 수치는 Do 시 `npm test`로 확인, 계획 단계 추정 금지).

---

## 8. 작업 순서 (PDCA Do — 시퀀셜)

0. ✅ **(선결 완료) D-5 확정**: 증여 §55① = 상증령 **§46의2**(§20의3 준용). 상속·증여 동시 구현. `legal-codes/inheritance-gift.ts`에 상속 §20의3·증여 §46의2 상수 추가.
1. (엔진) `AppraisalFeeInput` 타입 + `InheritanceTaxResult.appraisalFeeDeduction` 추가(현 부재) + legal-codes 상수(상속 §20의3·증여 §46의2) + 공유 모듈 `deductions/appraisal-fee-deduction.ts` + Pre-Do anchor AF-9 **실패 확보**.
2. (엔진) 상속 STEP7(:500) 차감 1줄 + result·CalculationStep + 별지9호 ⑲(`b19`) 연동 / 증여 STEP5(:135) 차감 + result(:282) — 동시 진행.
3. (API 3지점, 상속) **⑫ Zod**(`inheritanceTaxInputSchema`) + **⑬ api.ts body**(`inheritance-api.ts:68-89`) + **⑭ route 매핑**(`route.ts:69-90`) — grep 3파일 자가점검. (증여) ⑫ Zod(`giftTaxInputSchema`)만(route spread 자동).
4. (UI) 상속 Step4 + 증여 공제단계 `AppraisalFeeSection` + 폼→input 빌더(상속 `InheritanceTaxForm.tsx:334 buildInput`·증여 `gift-api.ts:61 buildGiftTaxInput`) + validate(상속 `inheritance-validate.ts`·증여 `gift-tax-form-shared.tsx validateStep`).
5. Check: `ui-engine-sync-checker` + `tax-qa-lead`(상속·증여) + **Playwright E2E**([[feedback_browser_verify_with_playwright]]: 입력→과세표준 차감→별지 ㉙·㉚·⑲ 반영).
6. Act: 디자인 환류 + D-5 확정 결과 기록.

**완료 게이트**: AF-1~AF-11 GREEN · `tsc` 0 · 전체 회귀 0 · E2E spec 통과 · 별지 ㉙·㉚·⑲ 실값 정합 · `appraisalFee` grep 상속 3파일(Zod·api·route) 모두 존재.

---

## 9. 리스크 / 회피

- **R-1 과세표준 차감 회귀**: 기존 케이스에 수수료 차감이 잘못 발동. → 미입력 시 0 보장(AF-8) + 전체 회귀 0.
- **R-2 result drift**([[feedback_engine_result_display_drift]]): 산식만 반영하고 표시 필드·별지 미반영 → 0 표시 모순. → 자기일관성 anchor(AF-9) + 별지 ⑲·㉙ 검증.
- **R-3 §20의3② 오적용**: 감정가 미신고인데 1호 공제. → hasAppraisalValuation 자동판정(D-2) + AF-3 anchor.
- **R-4 침묵 strip**: appraisalFee Zod 누락. → ⑧ + roundtrip anchor.
- **R-5 법령 근거 확정**: 상속 §20의3 / 증여 **§46의2**(§20의3 준용) — 한도·요건 동일 실측 확정. BLOCKING 해소. ⚠️ 증여 근거 인용은 §46의2(§20의3 직접 인용 금지 — 법문 "상속재산"). legal-codes에 양 조문 등록.
- **R-6 절감 표현**: "수수료 공제로 세금 절감" 등 금지([[feedback_tax_calculation_principle]]) — 중립 산식 서술.
- **R-7 상속 ⑭ route 침묵 strip(Critical)**: `route.ts:69-90` 명시 매핑에 `appraisalFee` 누락 시 Zod·body 통과해도 엔진 미도달. TypeScript 미감지. → 작업3 grep 3파일 자가점검([[feedback_explicit_prop_mapping_strip]]).
- **R-8 cite 오류**: `gift-validate.ts`·`inheritance-api.ts buildInput` 등 부정확 cite로 작업 누락. → §5 실측 위치로 정정 완료(`gift-tax-form-shared.tsx validateStep`·`InheritanceTaxForm.tsx:334`).
