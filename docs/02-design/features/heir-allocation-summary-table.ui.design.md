# 상속인별 상속세부담액 집계 표 — UI 설계

> 계획서: [`docs/01-plan/heir-allocation-summary-table.plan.md`](../../01-plan/heir-allocation-summary-table.plan.md) · 엔진 설계: [`heir-allocation-summary-table.engine.design.md`](./heir-allocation-summary-table.engine.design.md)
> 핵심 원칙: **엔진 echo 단일 진실** — UI는 자체 계산 금지, `lib/calc/heir-allocation-summary.ts` 헬퍼로 변환만. [[feedback_ui_engine_dual_truth_avoidance]]
> 입력 신규 필드 0 → 14 동기화 지점 ①~③·⑨~⑭ 변경 없음. ⑤UI 위젯·⑦결과 카드·PDF만 신규.

## Context

PDF 사례 이미지 8 "상속인별 상속세부담액 집계" 표 = 25행 × N열(가변 상속인 + 합계). 결과 화면·PDF 양쪽에 동일 렌더. 본 작업은 입력 폼 변경 0 — 출력 전용 UI.

---

## 7개 동기화 지점 (입력 신규 0 → ⑤⑦⑪만 영향)

| # | 지점 | 변경 | 비고 |
|---|---|---|---|
| ① | FormData 타입 | 변경 없음 | 입력 신규 0 |
| ② | initial 값 | 변경 없음 | |
| ③ | normalize | 변경 없음 | |
| ④ | API body 변환 (`lib/calc/inheritance-api.ts`) | 변경 없음 | result 방향만 echo 추가 — `app/api/calc/inheritance/route.ts:98` `NextResponse.json({result})` 전체 직렬화로 자동 통과 (grep 확정) |
| ⑤ | UI 위젯 | 신규 `HeirAllocationSummaryTable.tsx` + `lib/calc/heir-allocation-summary.ts` 변환 헬퍼 | |
| ⑥ | 사이드바 합계 | 무관 | |
| ⑦ | 결과 카드 (`InheritanceTaxResultView`) | 신규 섹션 추가 | |
| ⑧ | validation | 변경 없음 | |
| ⑨~⑭ | Zod·Route·body spread | 변경 없음 | input 신규 0 |
| **PDF** | `lib/pdf/sections/inheritance-heir-allocation-section.tsx` 신설 + `ResultPdfDocument.tsx` import | 신규 섹션 | D-1 결론: entry point 기존 활용 |

---

## ★ 사용자 시나리오 인벤토리 (UI)

| # | 시나리오 | 진입 | 표시 | 상태 |
|---|---|---|---|---|
| 1 | PDF 사례 5인 (배우자·자2·corp·legatee) — 가로 스크롤 sticky 라벨열 | InheritanceTaxResultView | 25행 × 6열(합계+5인) | ☐ |
| 2 | 단독 상속 (자녀 1인) — 합계열·상속인열 동일 값 | 동상 | 25행 × 2열 | ☐ |
| 3 | corp 미포함 — ⑩a/b/c 행 모두 — 표시 | 동상 | ⑩ 행 빈셀 안내 | ☐ |
| 4 | legatee 미포함 — *4 행 모두 0 표시 | 동상 | *4 행 빈셀 안내 | ☐ |
| 5 | ㉠과세제외 비∅ — `summaryTable.totalExcludedFromTaxation > 0` | 동상 | ㉠ 행 값 표시 | ☐ |
| 6 | N≥6열 (상속인 5+합계) — 가로 분할 / 모바일 horizontal scroll | 동상 + PDF | scroll + page-split | ☐ |
| 7 | PDF 출력 — 화면과 동일 매트릭스 | `/api/pdf/result/[id]` | A4 가로·NanumGothic fallback | ☐ |
| 8 | 가변 상속인 입력 추가/삭제 — 표 자동 재구성 | StepWizard 후 결과 화면 | heirOrder 재정렬 | ☐ |

---

## 신규 컴포넌트

### Import 경로 (U-15 — V1·V2 grep 검증 완료)
```ts
import {HorizontalScrollContainer} from "@/components/calc/shared/HorizontalScrollContainer";     // V1 ✓
import {LawArticleModal} from "@/components/ui/law-article-modal";                                  // V2 정정 (kebab-case)
import {buildSummaryTable, fmt, labelOf} from "@/lib/calc/heir-allocation-summary";
import {InheritanceHeirAllocationSection} from "@/lib/pdf/sections/inheritance-heir-allocation-section";
```

**LawArticleModal 시그니처** (V2 확정):
```ts
interface Props {
  legalBasis: string;           // 필수 — "상증법 §27" / "민법 §1009" 등
  label?: string;               // 옵션 — 짧은 레이블, 미제공 시 legalBasis 전체 표시
  className?: string;
}
// 사용 예: <LawArticleModal legalBasis="상증법 §3의2②" label="§3의2②" className="ml-1" />
```

**번호 배지 패턴** (V3 정정 — `circle-badge` className 부재):
```tsx
<span className="inline-flex items-center rounded-full bg-violet-200 px-2 py-0.5 text-xs font-bold text-violet-800 dark:bg-violet-700 dark:text-violet-100">
  8
</span>
```
StockTransferTaxResultView.tsx:533·LotMatchingDetailCard.tsx:43 패턴 차용. 별도 추출 컴포넌트 없음 — inline className 사용.

**PDF heirs 접근** (V4 정정 — `r._heirs` 별도 echo 불필요):
- `app/api/pdf/result/[id]/route.ts:68` 가 `inputData: record.input_data`를 그대로 전달
- `ResultPdfDocument` props에 `inputData` 이미 존재 → `InheritanceGiftSection`에서 `inputData.heirs` 직접 접근 가능
- 디자인의 `r._heirs` 우려 해소

### 1. `lib/calc/heir-allocation-summary.ts` (단일 진실 변환 헬퍼)
```ts
import type { InheritanceTaxResult, Heir } from "@/lib/tax-engine/types/inheritance-gift.types";

export type SummaryTableRow = {
  rowId: string;                   // testid 동결 (e.g. "row-4-taxableEstate")
  groupId: "asset" | "value" | "deduction" | "taxBase" | "computedTax" | "credit10" | "allocation" | "credit12" | "final";
  label: string;                   // PDF 표 표기 (예: "① 총상속재산 (채무공제 전)")
  rowNo?: string;                  // ①·㉠·*1 등
  total: number | null;            // 합계열 (null = 빈셀)
  perHeir: Record<string, number | null>;
  formulaHint?: string;            // ⑥㉡·*5 등 산식 인용 (펼침 토글용)
  isHeaderGroup?: boolean;         // 그룹 시작 행 (강조)
  isBoldFinal?: boolean;           // ⑮ 강조
};

export type SummaryTableData = {
  heirOrder: string[];             // 표 열 순서 (배우자→자→legatee→corp 정책 — UI 일관)
  rows: SummaryTableRow[];         // 25행
  hasCorporate: boolean;           // corp 행 표시 여부
  hasGenerationSkip: boolean;      // *4 행 표시 여부
  usedLegalShareFallback: boolean; // 안내 카드 표시
};

export function buildSummaryTable(
  result: InheritanceTaxResult,
  heirs: Heir[],
): SummaryTableData {
  // ... 25행 매트릭스 조립 (엔진 echo만 소비, 자체 계산 금지)
}
```

**heirOrder 정책** (U-10 정정): **배우자 → 자녀(child) → 직계존속 → 형제자매 → other → corporate → legatee**.
- PDF 표8 헤더 순서: 배우자·장남·차남·수증자(영리법인)·수유자(손녀) — **corp가 legatee 앞**
- 입력 순서 무관 (UI 일관성 보장)
- 같은 relation 내부는 입력 순서 유지

### 2. `components/calc/results/HeirAllocationSummaryTable.tsx`
```tsx
type Props = { result: InheritanceTaxResult; heirs: Heir[] };

export function HeirAllocationSummaryTable({result, heirs}: Props) {
  const data = useMemo(() => buildSummaryTable(result, heirs), [result, heirs]);

  return (
    <section
      className="rounded-2xl border border-violet-200 bg-violet-50 p-4 dark:border-violet-800 dark:bg-violet-950 print:border-violet-300 print:bg-white"
      aria-labelledby="heir-allocation-summary-title"
    >
      <h3 id="heir-allocation-summary-title" className="text-base font-semibold text-violet-900 dark:text-violet-100">
        <span className="inline-flex items-center rounded-full bg-violet-200 px-2 py-0.5 text-xs font-bold text-violet-800 dark:bg-violet-700 dark:text-violet-100 mr-2">8</span>
        상속인별 상속세부담액 집계
      </h3>
      {data.usedLegalShareFallback && (
        <p className="mt-2 text-xs text-violet-700">
          ⓘ 협의분할 미입력 자산·채무·추정상속은 법정상속분 자동 안분 적용. 영리법인·수유자(자연인)는 안분 대상에서 제외됩니다.
        </p>
      )}
      <HorizontalScrollContainer className="mt-3">
        <table
          role="table"
          className="min-w-full text-right text-sm tabular-nums"
          data-testid="heir-allocation-summary-table"
        >
          <thead className="sticky top-0 bg-violet-100 dark:bg-violet-900">
            <tr>
              <th scope="col" className="sticky left-0 bg-violet-100 text-left dark:bg-violet-900">구분</th>
              <th scope="col">합계</th>
              {data.heirOrder.map(id => <th key={id} scope="col">{labelOf(id, heirs)}</th>)}
            </tr>
          </thead>
          <tbody>
            {data.rows.map(row => (
              <tr key={row.rowId} data-testid={`heir-summary-row-${row.rowId}`} className={row.isBoldFinal ? "font-bold" : ""}>
                <th scope="row" className="sticky left-0 text-left bg-violet-50 dark:bg-violet-950">
                  {row.rowNo} {row.label}
                </th>
                <td>{fmt(row.total)}</td>
                {data.heirOrder.map(id => (
                  <td key={id} data-testid={`heir-summary-cell-${id}-${row.rowId}`}>
                    {fmt(row.perHeir[id])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </HorizontalScrollContainer>
    </section>
  );
}

// fmt() 는 `lib/calc/heir-allocation-summary.ts` 에 함께 export — 화면·PDF 공유.
export function fmt(v: number | null | undefined): string {
  if (v === null || v === undefined) return "—";
  if (v === 0) return "0";
  return v.toLocaleString();
}

// labelOf() 도 동일 모듈
export function labelOf(heirId: string, heirs: Heir[]): string {
  const h = heirs.find(x => x.id === heirId);
  if (!h) return heirId;
  return h.name ?? defaultLabelByRelation(h.relation);
}
```

### 3. PDF 섹션 `lib/pdf/sections/inheritance-heir-allocation-section.tsx`
```tsx
import {View, Text, StyleSheet} from "@react-pdf/renderer";
import {buildSummaryTable} from "@/lib/calc/heir-allocation-summary";
import {PDF_FONT_FAMILY} from "@/lib/pdf/fonts";

export function InheritanceHeirAllocationSection({result, heirs}) {
  const data = buildSummaryTable(result, heirs);   // 화면과 동일 헬퍼
  // N≥6 시 첫 페이지 합계+1~4 · 다음 페이지 나머지
  const pages = chunkHeirs(data.heirOrder, 4);
  return pages.map((heirIds, pi) => (
    <View key={pi} break={pi > 0} style={s.section}>
      <Text style={s.title}>상속인별 상속세부담액 집계 {pages.length > 1 ? `(${pi+1}/${pages.length})` : ""}</Text>
      <View style={s.table}>
        <Row label="구분" cells={["합계", ...heirIds.map(id => labelOf(id, heirs))]} isHeader />
        {data.rows.map(row => (
          <Row key={row.rowId}
            label={`${row.rowNo ?? ""} ${row.label}`.trim()}
            cells={[fmt(row.total), ...heirIds.map(id => fmt(row.perHeir[id]))]}
            isBold={row.isBoldFinal} />
        ))}
      </View>
    </View>
  ));
}
```

### 4. `ResultPdfDocument.tsx`의 `InheritanceGiftSection`에 import + 렌더 (D2 — V4 검증 후 정정)
```tsx
// 시그니처 변경: inputData를 InheritanceGiftSection prop으로 전달 받음
function InheritanceGiftSection({r, taxType, inputData}: {r: R; taxType: string; inputData?: R}) {
  // ... 기존 렌더
  return <View>
    {/* 기존 섹션 */}
    {taxType === "inheritance" && r.heirAllocationResult && inputData?.heirs && (
      <InheritanceHeirAllocationSection
        result={r as InheritanceTaxResult}
        heirs={inputData.heirs as Heir[]}
      />
    )}
  </View>;
}
```
**V4 확정**: `app/api/pdf/result/[id]/route.ts:68`이 `inputData: record.input_data` 전달 중 → `InheritanceGiftSection` 호출 시점에 `inputData` prop을 추가로 forward만 하면 됨. 별도 echo·재fetch 불요.

---

## 표 매트릭스 사양 (PDF 표8 1:1 = 25행)

> 모든 row의 `rowId`는 testid 동결 ([[besshi-form-replica]])

| # | rowId | 라벨 | total source | perHeir source | groupId |
|---|---|---|---|---|---|
| 1 | row-asset-financial | 상속재산 — 금융 | summaryTable.categoryTotals.financial | perHeir[x].categoryBreakdown.financial | asset |
| 2 | row-asset-realEstate | 상속재산 — 부동산 | (real estate) | (real estate) | asset |
| 3 | row-asset-stock | 상속재산 — 주식 | (stock) | (stock) | asset |
| 4 | row-asset-other | 상속재산 — 기타 (퇴직·보험 포함) | (other) | (other) | asset |
| 5 | row-1-gross | ① 총상속재산 (채무공제 전) | Σ categoryTotals | perHeir.grossInheritance | asset (header) |
| 6 | row-a-excluded | ㉠ 과세제외 재산 | summaryTable.totalExcludedFromTaxation | perHeir.excludedFromTaxation | value |
| 7 | row-b-debt | ㉡ 채무·공과·장례비 공제 | Σ perHeir.debtShare | perHeir.debtShare | value |
| 8 | row-2-priorGift | ② 사전증여재산 | Σ perHeir.priorGiftAmount | perHeir.priorGiftAmount | value |
| 9 | row-3-presumed | ③ 추정상속재산 | Σ perHeir.presumedAmount | perHeir.presumedAmount | value |
| 10 | row-4-taxableEstate | ④ 상속세 과세가액 | result.taxableEstateValue | perHeir.taxableValueShare | value (header) |
| 11 | row-s1-distributableBase | *1 과세표준 배부대상 과세가액 | summaryTable.distributableTaxBase | perHeir.taxableValueShare − perHeir.priorGiftAmount | value |
| 12 | row-s2-surchargeTarget | *2 할증과세 대상 과세가액 | summaryTable.surchargeTargetTaxableValue | perHeir.taxableValueShare (corp 제외) | value |
| 13 | row-5-deduction | ⑤ 상속공제 | result.totalDeduction | 빈셀 (합계만) | deduction |
| 14 | row-6a-direct | ⑥ ㉠ 직접배부 | Σ directTaxBaseShare | perHeir.directTaxBaseShare | taxBase |
| 15 | row-6b-indirect | ⑥ ㉡ 간접배부 | Σ indirectTaxBaseShare | perHeir.indirectTaxBaseShare | taxBase |
| 16 | row-6c-total | ⑥ ㉢ 과세표준상당액 계 | result.taxBase | perHeir.taxBaseShare | taxBase (header) |
| 17 | row-s3-afterCorpGifts | *3 상속인등 과세표준상당액 (영리법인 제외) | summaryTable.distributableTaxBaseAfterGifts | perHeir.taxBaseShare (corp → —) | taxBase |
| 18 | row-7-computedTax | ⑦ 산출세액 | result.computedTax | 빈셀 (합계만) | computedTax |
| 19 | row-8-generationSkip | ⑧ 세대생략가산액 | result.generationSkipSurcharge | 빈셀 (합계만) | computedTax |
| 20 | row-9-computedTaxSum | ⑨ 산출세액 소계 | computedTax + generationSkipSurcharge | 빈셀 (합계만) | computedTax (header) |
| 21 | row-10a-corpGiftTax | ⑩ a 증여세 산출세액 | perHeir[corp].priorGiftComputedTax | corp만 값, 나머지 — | credit10 |
| 22 | row-10b-corpLimit | ⑩ b 공제 한도 | summaryTable.corporateExemptionLimitDisplay | corp: perHeir[corp].priorGiftCreditLimit | credit10 |
| 23 | row-10c-corpCredit | ⑩ c 공제할 증여세액 = Min(⑩a, ⑩b) | result.corporateExemption.amount | corp: **`result.corporateExemption.amount`** (U-9 정정: `perHeir[corp].priorGiftCredit`는 엔진이 corp 분기에서 항상 0 반환 — `inheritance-allocation.ts:337`. 실제 면제액은 `corporateExemption.amount`에서 도출) | credit10 |
| 24 | row-11-allocation | ⑪ 상속인등 산출세액 배부 | Σ computedTaxShare | perHeir.computedTaxShare | allocation |
| 25 | row-s4-genSkip | *4 세대생략가산액 | generationSkipSurcharge | perHeir.generationSkipSurcharge | allocation |
| 26 | row-s5-burdenRatio | *5 상속인등 상속세부담 비율 | 1.0000 | perHeir.burdenRatio | allocation |
| 27 | row-allocation-subtotal | 소계 (⑪ + *4) | Σ (⑪ + *4) | perHeir.computedTaxShare + perHeir.generationSkipSurcharge | allocation (header) |
| 28 | row-12a-priorGiftTax | ⑫ a 증여세 산출세액 | Σ heir.priorGiftComputedTax | perHeir.priorGiftComputedTax (corp → —) | credit12 |
| 29 | row-12b-limit | ⑫ b 공제 한도 | Σ heir.priorGiftCreditLimit | perHeir.priorGiftCreditLimit (corp → —, 별도 ⑩b에 표시) | credit12 |
| 30 | row-12c-credit | ⑫ c 사전증여세액공제 = Min(⑫a, ⑫b) | Σ heir.priorGiftCredit (corp 제외) | perHeir.priorGiftCredit (corp → —) | credit12 |
| 31 | row-13-preFiling | ⑬ 차가감세액 | Σ perHeir.preFilingCreditTax | perHeir.preFilingCreditTax | final |
| 32 | row-14-filingCredit | ⑭ 신고세액공제(⑬×0.03) | Σ perHeir.filingCredit | perHeir.filingCredit | final |
| 33 | **row-15-finalTax** | **⑮ 차감자진납부세액** | **Σ perHeir.finalTax** | **perHeir.finalTax** | **final (bold)** |

> ⚠️ 33행 명세 — 계획서 §0.8 매트릭스와 1:1 일치 (자산 4행 + ①·㉠·㉡·②·③·④·*1·*2·⑤·⑥㉠/㉡/㉢·*3·⑦·⑧·⑨·⑩a/b/c·⑪·*4·*5·소계·⑫a/b/c·⑬·⑭·⑮ = 33행).

### corp 행 셀별 정책 (U-11)

영리법인 행은 셀마다 표시 정책이 다름 — 매트릭스로 명시:

| rowId 그룹 | corp 표시 | 출처 |
|---|---|---|
| 자산 4행 (financial·realEstate·stock·other) | "—" (categoryBreakdown 모두 0) | perHeir[corp].categoryBreakdown |
| row-1-gross / row-a-excluded / row-b-debt / row-3-presumed | "—" (corp는 본래·간주·추정·채무 없음) | perHeir[corp].grossInheritance=0 → fmt(null) |
| row-2-priorGift (② 사전증여) | **값 700,000,000** | perHeir[corp].priorGiftAmount |
| row-4-taxableEstate (④ 과세가액) | **값 700,000,000** | perHeir[corp].taxableValueShare (= 사전증여만) |
| row-s1-distributableBase (*1) / row-s2-surchargeTarget (*2) / row-s3-afterCorpGifts (*3) | "—" (corp 제외 행) | UI 강제 null |
| row-5-deduction (⑤) | "—" (합계만) | UI 강제 null |
| row-6a-direct (⑥㉠ 직접배부) | **값 700,000,000** | perHeir[corp].directTaxBaseShare |
| row-6b-indirect (⑥㉡) | "—" 또는 0 | perHeir[corp].indirectTaxBaseShare=0 |
| row-6c-total (⑥㉢) | **값 700,000,000** | perHeir[corp].taxBaseShare |
| row-7~row-9 (⑦⑧⑨) | "—" (합계만) | UI 강제 null |
| row-10a/b/c (⑩) | **값 (corp 전용)** | perHeir[corp].priorGiftComputedTax / priorGiftCreditLimit / `result.corporateExemption.amount` |
| row-11~row-15 (⑪ 산출세액배부 / *4 / *5 / 소계 / ⑫ / ⑬ / ⑭ / ⑮) | **"—"** (corp는 면제로 finalTax=0이지만 표시는 — — PDF와 일치) | UI 강제 null |

`buildSummaryTable`이 corp 분기로 null 강제 매핑하여 단일 진실 유지.

---

## 빈셀 (—) 정책

| 조건 | 표시 |
|---|---|
| 합계행 라벨 + 상속인 셀 | "—" |
| corp의 자산 4분류 | "—" (categoryBreakdown 모두 0) |
| corp의 ⑫ a/b/c | "—" (heir 전용) |
| heir의 ⑩ a/b/c | "—" (corp 전용) |
| legatee의 ② 사전증여 (없음) | "0" 또는 "—" (값 0이면 0, undefined면 —) |
| 값 0 | "0" 명시 (PDF와 일치) |
| 값 undefined | "—" |

`fmt(v)` 헬퍼 단일 처리. [[print-only-css-toggle]] 불필요 (인쇄 시 항상 펼침).

---

## 안내 카드·법령 링크

- **법정상속분 fallback 안내** (`usedLegalShareFallback === true`): violet-100 카드, 1줄. "협의분할 미입력 항목은 법정상속분(민법 §1009·§1003·§1000) 자동 안분 적용. 영리법인·수유자(자연인) 제외." `LawArticleModal`로 §1009 링크 제공.
- **⑥ ㉡ 간접배부 산식** ([[formula-display-builder]]): 펼침 토글로 "지정값 × (상속인별 과세가액상당액 − 사전증여가액) ÷ 배부대상 과세가액 (**원 미만 절사**)" — [[feedback_result_view_korean_formula]] 정책 준수 (U-12 정정: `floor()` → "원 미만 절사").
- **⑩b 두 산식 박스** (D-8): "합계행 277,943,123은 PDF 표시값(할증 포함), 영리법인 행 272,874,251은 실제 면제 한도 적용값(할증 미포함)." 작은 글씨 fine-print.
- **출처 라벨**: 표 하단 "산출 근거: 상증법 §3·§13·§27·§28·§3의2②, 집행기준 19-17-1" — LawArticleModal 링크 3건.

---

## 결과뷰 통합 위치 (⑦ 결과 카드)

`components/calc/results/InheritanceTaxResultView.tsx` — 기존 섹션 순서:
1. 종합 결과 카드
2. 단계별 계산 내역
3. 공제 상세
4. 상속재산 평가 결과
5. 추정상속재산 (있을 때)
6. 영리법인 면제 (있을 때)
7. **(신규)** 상속인별 상속세부담액 집계 ← **여기 추가**
8. 별지 서식 (있을 때)

`section_card_numbering` 정책: 보라(violet) tone 카드. 헤더 원형 번호 = 다음 번호 사용.

---

## E2E 테스트 약속

`e2e/inheritance-summary-table.spec.ts`:
- T-1: PDF 사례 5인 입력 → ⑮ 5셀 모두 PDF anchor와 일치 (toLocaleString 포함)
- T-2: corp 미포함 사례 → ⑩a/b/c 행 빈셀 (testid `heir-summary-cell-corp_M-row-10a-corpGiftTax` 부재 또는 "—")
- T-3: legatee 미포함 → *4 행 0 표시
- T-4: 가로 스크롤 — 첫 열 sticky 동작
- T-5: PDF 다운로드 → **react-pdf snapshot test 또는 시각 비교** (U-16 정정: react-pdf 출력 텍스트 추출은 단순 라이브러리로 불가 — `@react-pdf/renderer`의 PDFRenderer 인스턴스를 직접 검증하거나 chromium headless로 PDF 페이지 텍스트 비교). 1차 구현: 시각 비교 + 매트릭스 testid 화면 anchor로 보강
- T-6: 다크모드 토글 시 violet-50/950 대비 검증 (U-13)
- T-7: 스크린리더 (`role="table"`/`scope`) — `axe-core` 0 violation (U-14)

---

## 자가 검토 이력 (Step 6·8 + 통합 비교 Step 10)

### 1차 검토 (작성 후 즉시) — 발견 4건
| # | 발견 | 정정 |
|---|---|---|
| U-1 | `r._heirs` route echo 단정 | "검증 필요 (Pre-Do)" 명시 — heirs를 result에 echo하거나 PDF route에서 별도 fetch |
| U-2 | heirOrder 정책 미명시 | 배우자→자→직계존속→형제→other→legatee→corp 명시 |
| U-3 | 빈셀 vs 0 vs undefined 처리 모호 | fmt() 헬퍼 + 빈셀 정책 표 추가 |
| U-4 | 25행 → 실제 표는 PDF 그룹 헤더 포함 33행 | 33행 매트릭스 sec 추가, 계획서 25행과 명세 일치 보강 |

### 2차 검토 — 발견 4건
| # | 발견 | 정정 |
|---|---|---|
| U-5 | row-12b/⑫b — corp 행은 — 표시인데 ⑩b에 같은 필드 표시 — 사용자 혼동 위험 | row-10b·row-12b 표 셀에 작은 글씨 라벨 ("§3의2②" vs "§28") 추가 권장 — fine-print 가능성 |
| U-6 | corp.priorGiftCredit 의미 = §3의2② 면제액 (`amount`) vs heir의 priorGiftCredit = §28 공제액 | ⑩c는 corp의 priorGiftCredit, ⑫c는 heir의 priorGiftCredit — 동일 필드 두 의미 (이미 엔진 명세 D-8과 일관) |
| U-7 | PDF 책 ⑪ 행 손녀(legatee) 68,182,324 — *4 가산 후 소계 98,414,522. 분기 검증 anchor 필요 | T-1에 손녀 ⑪·*4·소계 분리 검증 추가 |
| U-8 | ⑭ 신고세액공제 영리법인 행 — corp.finalTax=0이고 corp.filingCredit도 0. UI 표시는 "0" or "—"? | corp는 모든 ⑪~⑮ 빈셀 정책 → "—" (이미 정책표에 반영) |

### Step 10 통합 비교 — 추가 발견 2건
| # | 발견 | 정정 대상 |
|---|---|---|
| UI-I-1 | UI에서 corp 행 ⑪~⑮ 빈셀 처리는 명세화. 엔진 perHeir[corp]는 모든 필드 0으로 반환 — UI가 "0 → '—' 변환" 필요 | UI fmt() 헬퍼: corp는 ⑪~⑮ undefined로 매핑하거나 강제 — | 처리 |
| UI-I-2 | T-5 PDF 텍스트 추출 anchor — react-pdf 출력 검증 가능 여부 미확인 | 실제 e2e 환경에서 PDF 텍스트 추출 가능 시만 유지, 불가 시 시각 비교로 대체 |

### 3차 검토 — 발견 8건 (추가 자가 점검)

| # | 카테고리 | 발견 | 정정 |
|---|---|---|---|
| U-9 | 데이터 모순 | row-10c `perHeir[corp].priorGiftCredit` source — 엔진 corp 분기에서 항상 0 반환 (`inheritance-allocation.ts:337`) | source를 `result.corporateExemption.amount`로 정정 + perHeir[corp].priorGiftCredit는 무관 명시 |
| U-10 | PDF 헤더 순서 모순 | "spouse→child→legatee→corp" 단정 — PDF 표8 헤더는 corp가 legatee 앞 | heirOrder 정책 정정: spouse → child → ascendant → sibling → other → **corporate → legatee** |
| U-11 | corp 행 셀별 정책 미명세 | corp는 ⑥㉠/⑥㉢/⑩a/b/c는 값, ⑪~⑮·⑫a/b/c는 — — 정책 부재 | corp 행 셀 매트릭스 표 신설 (13행 표) — buildSummaryTable이 null 강제 매핑 |
| U-12 | 정책 위반 | ⑥㉡ 산식 안내 "floor(...)" — [[feedback_result_view_korean_formula]] 위반 (변수 약어·floor 금지) | "원 미만 절사" 한국어로 정정 |
| U-13 | 다크모드 호환 누락 | `bg-violet-50` 단독 | `dark:bg-violet-950`·`dark:border-violet-800`·`dark:text-violet-100` 추가 + T-6 anchor |
| U-14 | 접근성 누락 | `role="table"`·`scope="col"`/`scope="row"`·`aria-labelledby` 모두 누락 | 코드 예시에 모두 추가 + T-7 axe-core anchor |
| U-15 | import 경로 미명시 | `HorizontalScrollContainer`·`LawArticleModal` 경로 + `fmt()` `labelOf()` 위치 | Import 경로 블록 신설 + Pre-Do grep 확인 표시 |
| U-16 | T-5 검증 도구 오류 | "jsPDF text 추출"은 출력 lib 이름 (react-pdf 무관) | 시각 비교 + react-pdf snapshot 또는 chromium headless 정정 |

### 3차 검증 통과 (단정 정확)
- 33행 매트릭스 — 계획서 §0.8 (자산 4 + ① + ㉠ + ㉡ + ② + ③ + ④ + *1 + *2 + ⑤ + ⑥㉠/㉡/㉢ + *3 + ⑦ + ⑧ + ⑨ + ⑩a/b/c + ⑪ + *4 + *5 + 소계 + ⑫a/b/c + ⑬ + ⑭ + ⑮ = 33) ✓ 일치
- [[feedback_no_won_suffix]] 정책 — fmt() "원" 미부착 ✓
- [[feedback_macos_scrollbar_autohide_workaround]] — HorizontalScrollContainer 사용 ✓
- [[print-only-css-toggle]] 불필요 (인쇄 시 표 항상 펼침) ✓

### 잔여 위험 (Pre-Do 시 추가 확인) — V1~V5 grep 검증 완료

| # | 항목 | 결과 |
|---|---|---|
| V1 | HorizontalScrollContainer 경로 | ✅ `components/calc/shared/HorizontalScrollContainer.tsx` 확인 |
| V2 | LawArticleModal 경로·props | ✅ `@/components/ui/law-article-modal` (kebab) · `{legalBasis, label?, className?}` |
| V3 | circle-badge className | ✅ 부재 — inline `rounded-full bg-violet-200 ...` 패턴 사용 |
| V4 | r._heirs 또는 별도 fetch | ✅ `inputData` prop forward만 — `app/api/pdf/result/[id]/route.ts:68` `inputData` 전달 중 |
| V5 | corp 행 null 매핑 동기화 | ✅ Phase B4 D-6 분기 (corp는 ⑥㉠/⑥㉢/⑩a/b/c 값, 나머지 0)·UI buildSummaryTable null 강제 매핑 — 1:1 일치 |

모든 잔여 위험 해소 — Phase C 진입 가능.
