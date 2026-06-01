# 엔진·데이터 어댑터 설계 — 상속세 3개 서식 재현 (부표3·별지5호·별지1호)

> feature: `inheritance-deduction-besshi-forms` · 계획: `docs/00-pm/inheritance-deduction-besshi-forms.plan.md`
> 소관: `inheritance-gift-tax-senior`. **엔진 변경 0** — `lib/calc/deduction-besshi-data.ts` 신규 어댑터(집계·분류·도출만). 별지9호 `filing-form-9-data.ts` 패턴 동일.
> 검증: KoreanLaw MCP(계획서 §1) · 타입 실측(`inheritance-gift.types.ts`·`inheritance-deduction-detail.types.ts`·`inheritance-family-business.types.ts`).

---

## 1. 어댑터 단일 게이트웨이 원칙

별지9호 `buildFilingForm9Data(result, heirs, deathDate)`와 동일하게, **화면·PDF가 어댑터 결과만 소비** → 재계산 0, dual-truth 0. `lib/calc/`에서 엔진 detail(`financialDeductionDetail`·`familyBusinessDetail`) 직접 read 허용(`single-source-engine-helper`), `lib/tax-engine/` 내부 중간 함수 직접 import 금지.

```ts
// lib/calc/deduction-besshi-data.ts (신규)
export function buildBuppyo3Data(
  result: InheritanceTaxResult,
  debtItems: DebtItem[] | undefined,
  legacy?: { funeralExpense: number; funeralIncludesBongan: boolean; debts: number },  // debtItems 미입력 fallback
): Buppyo3Data;

export function buildBesshi5Data(
  result: InheritanceTaxResult,
): Besshi5Data | null;   // 금융재산공제 미적용 시 null. 가-2 = rows 채무 → debtItems 불요 (Do deviation)

export function buildBesshi1Data(
  result: InheritanceTaxResult,
  estateItems: EstateItem[] | undefined,
  familyBusinessInput?: FamilyBusinessInheritanceInput,
): Besshi1Data | null;   // 가업상속공제 deduction<=0 시 null (렌더 가드)
```

---

## 2. 타입 설계

### 2-1. 부표3 (서식 A)

```ts
/** 가. 채무 행 — debtItems(category∈{financial,personal}) */
export interface Buppyo3DebtRow {
  kindLabel: string;        // ① name.trim() || DEBT_CATEGORY_LABEL[category] (name 우선 — 자유텍스트 종류 "은행채무" 등, 내부 id 금지)
  incurredDate?: string;    // ② 발생연월일 (DebtItem.incurredDate, optional)
  endDate?: string;         // ② 종료(예정)연월일 — 미수집 → undefined(공란)
  creditorName?: string;    // ③ 미수집 → undefined
  creditorId?: string;      // ④ 미수집 → undefined
  creditorAddress?: string; // ⑤ DebtItem.creditorAddress (optional)
  amount: number;           // ⑥
}
/** 나. 공과금 행 — debtItems(category="tax") */
export interface Buppyo3UtilityRow {
  codeLabel?: string;       // ⑧ 미수집(코드표 01~06) → undefined
  year?: string;            // ⑨ 미수집
  quarter?: string;         // ⑩ 미수집
  detailName?: string;      // 비고용 — name (코드 공란 보완 표시, 금액 영향 0)
  amount: number;           // ⑪
}
/** 다. 장례비용 행 — debtItems(category="funeral") */
export interface Buppyo3FuneralRow {
  payeeId?: string;         // ⑬ 미수집
  payeeName?: string;       // ⑭ 미수집
  detail: string;           // ⑮ name + (isBongan ? " (봉안시설)" : "")
  amount: number;           // ⑯
}
/** 라. 상속공제 14항목 — null = 공란(dash), number = 값 */
export interface Buppyo3DeductionValues {
  basic: number | null;        // ⑱ (R-1 분기)
  child: null;                 // ⑲ 개별 미노출 → 항상 공란
  minor: null;                 // ⑳
  elderly: null;               // ㉑
  disabled: null;              // ㉒
  lumpSum: number | null;      // ㉓ (R-1 분기)
  familyBusiness: number;      // ㉔
  farming: number;             // ㉕
  spouse: number;              // ㉖
  financial: number;           // ㉗
  disaster: number;            // ㉘ deductionLimitDetail?.disasterLossDeduction ?? 0
  cohabit: number;             // ㉙
  ceiling: number | null;      // ㉚ deductionLimitDetail?.ceiling ?? null
  total: number;               // ㉛
}
export interface Buppyo3Data {
  debtRows: Buppyo3DebtRow[];      debtTotal: number;     // ⑦
  utilityRows: Buppyo3UtilityRow[]; utilityTotal: number; // ⑫
  funeralRows: Buppyo3FuneralRow[]; funeralTotal: number; // ⑰
  deduction: Buppyo3DeductionValues;
  selectedMethod: "lump_sum" | "itemized";  // lumpSumComparisonDetail.selectedMethod (R-1)
}
```

### 2-2. 별지5호 (서식 C)

```ts
export interface Besshi5AssetRow {
  kindLabel: string;     // 종류 (rows[].label)
  account?: string;      // 계좌번호 등 — 미수집
  institution?: string;  // 상호 — 미수집
  bizNo?: string;        // 사업자등록번호 — 미수집
  unitPrice?: number;    // 단가 — 미수집
  amount: number;        // 가액 (rows[].amount)
}
export interface Besshi5DebtRow {
  kindLabel: string;     // "금융채무" (DEBT_CATEGORY_LABEL.financial)
  account?: string; institution?: string; bizNo?: string; unitPrice?: number;
  amount: number;
}
export interface Besshi5Data {
  assetRows: Besshi5AssetRow[]; assetTotal: number;  // ① = Σ assetRows (= financialDeductionDetail 자산 rows)
  debtRows: Besshi5DebtRow[];   debtTotal: number;   // ② = Σ debtRows
  netFinancial: number;  // ③ = financialDeductionDetail.netFinancial (= ① − ② 자기일관)
  capLimit: number;      // ④ = financialDeductionDetail.cappedDeduction
  deduction: number;     // ⑤ = result.deductionDetail.financialDeduction (= min(③,④))
}
```

### 2-3. 별지1호 (서식 B)

```ts
export interface Besshi1AssetRow {
  kindLabel: string;   // FAMILY_BUSINESS_CATEGORY_LABEL[familyBusinessCategory]
  quantity?: string;   // 수량(면적) — 미수집
  unitPrice?: number;  // 단가 — 미수집
  amount: number;      // 가액 (EstateItem 평가액)
  note?: string;       // 비고 — name (자산명, 내부 id 금지)
}
export interface Besshi1Data {
  // 가. 가업현황 — 대부분 미수집(undefined)
  businessName?: string; representativeName?: string; openDate?: string; industry?: string;
  baseSalary?: number; baseHeadcount?: number; bizNo?: string; residentId?: string;
  // 나. 중소·중견·상장 (familyBusinessInput prop 전달 시)
  isSme?: boolean; isMedium?: boolean; isListed?: boolean; listingDate?: string; avgRevenue3Y?: number;
  // 다. 피상속인
  operatingYears: number;            // familyBusinessDetail.operatingYears (필수)
  isMajorShareholder?: boolean;      // familyBusinessInput.decedentMajorShareholdingMet
  decedentName?: string; decedentResidentId?: string; ceoTenure?: string; shareRatio?: string; // 미수집
  // 라. 가업상속인 — 미수집
  heirName?: string; heirEngagement?: string; officerAppointDate?: string; heirAddress?: string;
  // 마. 가업상속 재산가액
  assetRows: Besshi1AssetRow[];
  // 바. 신고액
  declaredAmount: number;            // familyBusinessDetail.deduction (>0 — null 가드 통과 전제)
  appliedCap?: number;               // familyBusinessDetail.appliedCap — 양식 칸 없음(가~바). 화면 보조 표시만(양식 외)
}
```

---

## 3. 산식·도출 로직 (자체 계산 0 — 집계·분기만)

### 3-1. 부표3 `buildBuppyo3Data`

```
items = debtItems ?? []
debtRows    = items.filter(category ∈ {financial, personal}).map(→ Buppyo3DebtRow)
utilityRows = items.filter(category === "tax").map(→ Buppyo3UtilityRow)
funeralRows = items.filter(category === "funeral").map(→ Buppyo3FuneralRow)
// legacy fallback (items 비었고 legacy 제공 시): funeralRows = [{detail:"장례비"+(bongan?"(봉안시설)":""), amount: legacy.funeralExpense}], 가/나 빈 배열
debtTotal/utilityTotal/funeralTotal = Σ amount

d = result.deductionDetail
method = d.lumpSumComparisonDetail?.selectedMethod ?? d.chosenMethod   // R-1
deduction = {
  basic:   method === "itemized" ? d.basicDeduction : null,   // ⑱ (AN-A1로 확정)
  child/minor/elderly/disabled: null,                          // ⑲~㉒ 개별 미노출
  lumpSum: method === "lump_sum" ? d.lumpSumDeduction : null,  // ㉓
  familyBusiness: d.familyBusinessDeduction,                   // ㉔
  farming: d.farmingDeduction,                                 // ㉕
  spouse:  d.spouseDeduction,                                  // ㉖
  financial: d.financialDeduction,                             // ㉗
  disaster:  d.deductionLimitDetail?.disasterLossDeduction ?? 0, // ㉘
  cohabit: d.cohabitationDeduction,                            // ㉙
  ceiling: d.deductionLimitDetail?.ceiling ?? null,            // ㉚ (R-2)
  total:   d.totalDeduction,                                   // ㉛
}
```

> ★ R-1 확정 전제: AN-A1로 `d.basicDeduction`이 일괄 채택 시 0/2억 실측. 만약 항상 2억이면 `method` 분기 유지(미채택이면 dash). `d.lumpSumDeduction`도 항목별 채택 시 0인지 실측. **추정 금지** — anchor 메시지로 확정 후 산식 동결.

### 3-2. 별지5호 `buildBesshi5Data`

```
fdd = result.deductionDetail.financialDeductionDetail
if (!fdd || (fdd.netFinancial <= 0 && result.deductionDetail.financialDeduction <= 0)) return null  // 렌더 가드 (C-6)

// 가-1 금융재산: fdd.rows 중 자산 (label ∈ {예금·상장주식·보험금·기타금융}, !isDebtLabel — inheritance-tax.ts:453-456 실측)
assetRows = fdd.rows.filter(r => !isDebtLabel(r.label)).map(→ Besshi5AssetRow)
assetTotal = Σ assetRows.amount                                  // ①

// 가-2 금융채무: fdd.rows 중 채무 (label === "금융채무" 1행 합산 — inheritance-tax.ts:457 실측). 자기일관 보장
debtRows = fdd.rows.filter(r => isDebtLabel(r.label)).map(→ Besshi5DebtRow)
debtTotal = Σ debtRows.amount                                    // ② (= fdd 금융채무 합)
// 자기일관 검증(anchor): assetTotal − debtTotal === fdd.netFinancial (±0)

return {
  assetRows, assetTotal,
  debtRows, debtTotal,
  netFinancial: fdd.netFinancial,                  // ③
  capLimit: fdd.cappedDeduction,                   // ④
  deduction: result.deductionDetail.financialDeduction,  // ⑤
}
```

> ★ AN-C1 (확정 — `inheritance-tax.ts:453-457` 실측): `fdd.rows` label = 자산 `{예금·상장주식·보험금·기타금융}` + 채무 `{금융채무}`(1행 합산). `isDebtLabel(label) = label === "금융채무"`. 가-1 = 자산 rows, 가-2 = 채무 rows 1행. `assetTotal − debtTotal === fdd.netFinancial` 자기일관. AN-C1 anchor는 계산사례 4건 + 자기일관 회귀 방지로 유지.

### 3-3. 별지1호 `buildBesshi1Data`

```
fbd = result.deductionDetail.familyBusinessDetail
if (!fbd || fbd.deduction <= 0) return null   // 렌더 가드 (C-8)

fbi = familyBusinessInput   // optional prop
assetRows = (estateItems ?? []).filter(e => e.familyBusinessCategory != null)
  .map(e => ({ kindLabel: FAMILY_BUSINESS_CATEGORY_LABEL[e.familyBusinessCategory], amount: valuatedAmountOf(e.id), note: e.name.trim() || undefined }))

return {
  // 가: 전부 undefined (미수집)
  // 나
  isSme:  fbi ? fbi.enterpriseSize === "sme" : undefined,
  isMedium: fbi ? fbi.enterpriseSize === "medium" : undefined,
  isListed: fbi?.isListedOnExchange,
  avgRevenue3Y: fbi?.averageRevenue3Y,
  // 다
  operatingYears: fbd.operatingYears,
  isMajorShareholder: fbi?.decedentMajorShareholdingMet,
  // 라: undefined
  // 마
  assetRows,
  // 바
  declaredAmount: fbd.deduction,
  appliedCap: fbd.appliedCap,
}
```

`valuatedAmountOf(id)` = `result.valuationResults.find(v => v.estateItemId === id)?.valuatedAmount ?? 0` (**최종 평가액** — `PropertyValuationResult.valuatedAmount` `inheritance-gift.types.ts:338` 실측. `e.marketValue`는 입력값이라 부정확 — 정정). 별지5호 가-1은 `financialDeductionDetail.rows`(이미 평가액 집계)라 무관.

---

## 4. 코드 매핑 (`enum-verification-before-mapping` — `Record<EnumType,…>` 강제)

```ts
// DebtCategory — grep 확인: inheritance-gift.types.ts:687
export const DEBT_CATEGORY_LABEL: Record<DebtCategory, string> = {
  financial: "금융채무",
  tax: "공과금",
  personal: "개인사채",
  funeral: "장례비",
};

// 공과금종류코드 — KoreanLaw 작성방법 §3 (표시 전용; 소스 미수집이라 도출 안 함)
export const UTILITY_TYPE_CODE_LABEL = [
  { code: "01", label: "국세" }, { code: "02", label: "지방세" }, { code: "03", label: "공공요금" },
  { code: "04", label: "과태료/범칙금" }, { code: "05", label: "회비" }, { code: "06", label: "기타" },
] as const;

// FamilyBusinessCategory — grep 확인: inheritance-family-business.types.ts:21
export const FAMILY_BUSINESS_CATEGORY_LABEL: Record<FamilyBusinessCategory, string> = {
  business_real_estate: "가업용 부동산",
  business_equipment: "기계장치·설비",
  corporate_stock: "법인 주식",
  intangible_asset: "무형자산",
  inventory: "재고자산",
  other: "기타",
};
```

> `Record<DebtCategory,…>`·`Record<FamilyBusinessCategory,…>` 타입으로 enum 추가 시 컴파일러가 누락 catch. **별지5호 rows label은 엔진 하드코딩 문자열**(`inheritance-tax.ts:457` `"금융채무"`)이므로 상수 `FINANCIAL_DEBT_ROW_LABEL = "금융채무"` 단일화 + `isDebtLabel(label) = label === FINANCIAL_DEBT_ROW_LABEL` (AN-C1 확정). 엔진 label 문자열 변경 시 본 상수도 동기화(드리프트 주의).

---

## 5. 케이스 인벤토리 (Do 진입 게이트 — 행 ≥ 1 충족)

| # | 입력 | 어댑터 | 기대 출력 | 검증 |
|---|---|---|---|---|
| E-1 | debtItems=[financial 745M, financial 400M, tax 55M, funeral 10M, funeral(bongan) 5M] | `buildBuppyo3Data` | debtRows.length=2·debtTotal=1,145M · utilityTotal=55M · funeralRows.length=2·funeralTotal=15M · funeral[1].detail "…(봉안시설)" | 이미지1 재현 (AN-A3) |
| E-2 | deductionDetail{chosenMethod:"lump_sum", lumpSumDeduction:500M} | `buildBuppyo3Data` | deduction.lumpSum=500M · deduction.basic=null(R-1 실측) · total=㉛ | AN-A1 |
| E-3 | deductionDetail{chosenMethod:"itemized", basicDeduction:200M} | `buildBuppyo3Data` | deduction.basic=200M · lumpSum=null · child/minor/elderly/disabled=null | AN-A1 |
| E-4 | deductionLimitDetail=undefined (단순) | `buildBuppyo3Data` | deduction.ceiling=null · disaster=0 | AN-A2 |
| E-5 | deductionLimitDetail{ceiling:5,965M, disasterLossDeduction:0} | `buildBuppyo3Data` | deduction.ceiling=5,965M | AN-A2 |
| E-6 | financialDeductionDetail{netFinancial:1,100M, cappedDeduction:200M} + financialDeduction:200M | `buildBesshi5Data` | ③=1,100M · ④=200M · ⑤=200M (계산사례 라) | AN-C1 / BF |
| E-7 | financialDeductionDetail{netFinancial:120M, cappedDeduction:24M} | `buildBesshi5Data` | ③=120M · ④=24M · ⑤=24M (계산사례 다) | AN-C1 |
| E-8 | financialDeductionDetail{netFinancial:15M(2천만↓), cappedDeduction:15M} | `buildBesshi5Data` | ③=15M · ④=15M · ⑤=15M (계산사례 가) | AN-C1 |
| E-9 | financialDeductionDetail=undefined | `buildBesshi5Data` | **null** (렌더 가드) | C-6 |
| E-10 | assetRows ① − debtRows ② === netFinancial | `buildBesshi5Data` | 자기일관 (±0) | AN-C1 |
| E-11 | familyBusinessDetail{deduction:500M, operatingYears:25, appliedCap:40,000M} + estateItems[corporate_stock 500M] + familyBusinessInput{enterpriseSize:"sme", isListedOnExchange:false} | `buildBesshi1Data` | declaredAmount=500M · operatingYears=25 · isSme=true · isListed=false · assetRows[0].kindLabel="법인 주식" | AN-B1 / C-7 |
| E-12 | familyBusinessDetail{deduction:0} | `buildBesshi1Data` | **null** (렌더 가드) | C-8 |
| E-13 | familyBusinessInput=undefined | `buildBesshi1Data` | isSme/isMedium/isListed=undefined(공란) · operatingYears·declaredAmount 채움 | R-B2 |
| E-14 | familyBusinessCategory enum 6종 전수 | `buildBesshi1Data` | 각 → FAMILY_BUSINESS_CATEGORY_LABEL 정확 | 코드매핑 |

---

## 6. Pre-Do Anchor (계획서 §6 = 본 케이스표)

`__tests__/calc/deduction-besshi-data.test.ts` (`afterEach(cleanup)` 필수):
- AN-A1 = E-2·E-3 (⑱/㉓ 분기 — `basicDeduction`·`lumpSumDeduction` 채택 시 0/값 실측 → 산식 동결)
- AN-A2 = E-4·E-5 (㉚·㉘ 한도 detail optional)
- AN-A3 = E-1 (가/나/다 carve-out + 합계 + 봉안 병기)
- AN-C1 = E-6·E-7·E-8·E-10 (계산사례 4건 + 자기일관 ①−②=③ + rows label 분리)
- AN-B1 = E-11·E-12·E-13 (렌더 가드 + prop 유무 분기)
- 코드매핑 = E-14 (`Record` 전수)

**실패 시 환류**: R-1(⑱/㉓ 분기)·R-2(㉚ optional)·R-C1(rows 분리)·R-B2(prop 경로)를 anchor 메시지로 확정 후 §3 산식 동결. "현행 일치 예상" 가정 금지(`pre-do-anchor-verification`).

---

## 7. 800줄 정책

- `lib/calc/deduction-besshi-data.ts`: 어댑터 3종 + 타입 + 코드매핑 ≈ 350줄 (안전). 초과 시 `deduction-besshi-types.ts` 분리.
- 엔진(`lib/tax-engine/`) 변경 0 — 본 PR은 `lib/calc/` 어댑터 + `components/` UI + `__tests__/calc/` anchor만.
