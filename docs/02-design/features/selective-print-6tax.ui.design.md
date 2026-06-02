# 계산 결과 선택 출력 6대 세목 공통화 — UI 디자인 문서

> 계획서: [`docs/00-pm/selective-print-6tax.plan.md`](../../00-pm/selective-print-6tax.plan.md) · 브랜치 `feature/selective-print-6tax`
> 주 범위: 증여·취득·재산·종부 4세목 + 공통 제네릭화(PR-A). 양도세 후속(PR-F). 상속세 완료(기준).
> 엔진 무변경(UI·레지스트리·PDF만) → `.engine.design.md` 해당 없음. 본 문서가 설계 단일 출처.
> 모든 섹션·가드는 각 결과뷰 실측 인용.

## 1. 공통 제네릭 인터페이스 (PR-A — 선행)

### 1.1 `lib/print/print-sections.types.ts` (신규 — shared)
```ts
export type PrintChannel = "screen" | "pdf";
export interface PrintSectionNode<Id extends string = string> {
  id: Id; label: string; channel: PrintChannel[];
}
export interface PrintSectionGroup<Id extends string = string> {
  id: `group:${string}`; label: string; children: PrintSectionNode<Id>[];
}
export type GroupCheckState = "all" | "partial" | "none";

// 헬퍼 — groups를 명시 인자로 (기본값 제거: 세목 혼선 차단)
export function flattenPrintSectionIds(groups: PrintSectionGroup[]): string[];
export function pdfEligibleIds(groups: PrintSectionGroup[]): string[];
export function selectPdfSections(groups: PrintSectionGroup[], selectedIds: ReadonlySet<string>, availableIds?: ReadonlySet<string>): string[];
export function resolveGroupCheckState(group: PrintSectionGroup, selectedIds: ReadonlySet<string>): GroupCheckState;
export function resolvePrintVisibilityClass(id: string, selectedIds: ReadonlySet<string>): "" | "print:hidden"; // groups 무관
```
- 기존 `inheritance-print-sections.ts`는 타입·헬퍼를 여기서 import + **외부 export 100% re-export 보존**(import 사이트 무변경).
- ⚠️ 현재 `selectPdfSections`/`pdfEligibleIds`는 groups **기본값 INHERITANCE** → shared 이전 시 기본값 제거, 호출부(`PrintSelectionPanel`)는 groups 명시.

### 1.2 `PrintSection` 제네릭화
```tsx
function PrintSection({ id, selectedIds, children, className }: {
  id: string; selectedIds: ReadonlySet<string>; children: ReactNode; className?: string;
})
```
- `resolvePrintVisibilityClass`를 shared에서 import. `PrintSectionId` 결합 제거. 동작 불변.

### 1.3 `PrintSelectionPanel` registry props화
```tsx
function PrintSelectionPanel({ groups, selectedIds, availableIds, onChange, onPrintPdf, pdfReady, pdfBusy }: {
  groups: PrintSectionGroup[];          // ← 신규 props (INHERITANCE 하드코딩 제거)
  selectedIds: Set<string>;
  availableIds: ReadonlySet<string>;
  onChange: (next: Set<string>) => void;
  onPrintPdf?: (pdfSections: string[]) => void;
  pdfReady?: boolean; pdfBusy?: boolean;
})
```
- 상속세 호출부: `groups={INHERITANCE_PRINT_SECTIONS}` 명시 → 회귀 0.
- 내부 `pdfEligibleIds()`·`selectPdfSections()`에 `groups` 전달.

## 2. 세목별 케이스 인벤토리 (실측 — 렌더 가드 → leaf → 채널)

### 2.1 증여세 (gift) — `GiftTaxResultView.tsx` (477줄). 인쇄: `window.print()`만(`:200`).
| data-print-id | 라벨 | 그룹 | 렌더 가드 (실측) | screen | pdf |
|---|---|---|---|---|---|
| `core-result` | 핵심 결과(결정세액) | 요약 | 항상(`:210`) | ✓ | ✗ |
| `tax-summary` | 증여세 과세 요약 | 요약 | 항상(`:279`) | ✓ | **✓** |
| `gen-skip-surcharge` | §57 세대생략 할증 근거 | 요약 | `generationSkipSurchargeDetail`(`:327`) | ✓ | ✗ |
| `tax-credit` | 세액공제 상세(§28·§69) | 요약 | `totalTaxCredit>0`(`:337`) | ✓ | ✗ |
| `prior-gift` | 사전증여 합산 내역 | 자료 | `priorGifts.length>0`(`:246`) | ✓ | ✗ |
| `filing-form-10` | 별지 제10호서식 | 신고서식 | `hasFilingFormTable`(`:243`) | ✓ | **✓ 신규** |
| `valuation-form` | 증여재산 평가명세서(부표1) | 신고서식 | `valuationResults.length>0` — 펼침 토글(`showValuation` `:348`, 상속세 valuation-detail과 동일 패턴) | ✓ | **✓ 신규** |
| `unlisted-stock-besshi` | 비상장주식 별지4 부표3 | 평가 | estateItems V2(`:406`) | ✓ | **✓ 재사용** |
| `listed-stock-besshi` | 상장주식 평가조서 | 평가 | estateItems 상장(`:409`) | ✓ | **✓ 재사용** |
| `installment` | 연부연납 안내 | 기타 | InstallmentGuide 내부 eligible | ✓ | ✗ |
| `warnings` | 주의 사항 | 기타 | `warnings.length>0` | ✓ | ✗ |
- **11 leaf**. pdf 채널 5: tax-summary(계산표)·filing-form-10·valuation-form(신규)·주식 2종(재사용).

### 2.2 취득세 (acquisition) — `AcquisitionTaxResultView.tsx` (615줄). 인쇄 버튼 **없음**(신규). 결과뷰 2곳 렌더(`AcquisitionTaxForm:252·322`).
| data-print-id | 라벨 | 그룹 | 렌더 가드 (실측) | screen | pdf |
|---|---|---|---|---|---|
| `deemed-acquisition` | 간주취득 판정 카드 | 요약 | `isDeemedAcquisition`(`:368`) | ✓ | ✗ |
| `tax-info` | 과세 정보 요약 | 요약 | 항상(`:370`) | ✓ | ✗ |
| `tax-detail` | 세액 상세 명세 | 요약 | 항상(`:415`) | ✓ | **✓ (PDF 계산표 대표)** |
| `surtax-detail` | 부가세 상세 | 요약 | `additionalTaxDetail` | ✓ | ✗ |
| `installment` | 연부취득 신고 일정 | 기타 | InstallmentResultCard | ✓ | ✗ |
| `reduction-panel` | 감면·배제 가능성 | 분석 | `!isDeemedAcquisition`(영역) | ✓ | ✗ |
| `surcharge-detail` | 중과 사유·배제·흐름도 | 분석 | `isSurcharged`·`!isDeemed` | ✓ | ✗ |
| `house-count` | 실효 주택 수·검산·시뮬 | 분석 | `!isDeemedAcquisition` | ✓ | ✗ |
| `steps` | 계산 과정 | 기타 | `steps.length>0`(`:570`) | ✓ | ✗ |
| `warnings` | 경고 메시지 | 기타 | `warnings.length>0` | ✓ | ✗ |
| `legal-basis` | 법령 근거 | 기타 | `legalBasis`(`:605`) | ✓ | ✗ |
- **11 leaf**(분석 섹션은 간주취득 시 availableIds 제외). ⚠️ **pdf 채널 1**(검토 U1): `AcquisitionSection`은 단일 "계산 내역" 표(분리 경계 없음, `ResultPdfDocument.tsx:393~`) → `tax-detail` 1개만 pdf 대표(선택 시 계산표 PDF 포함). `tax-info`는 screen만(PDF 분리 불가). 비과세(`isExempt`)는 전용 화면(`:350`) → 선택 트리 비대상.

### 2.3 재산세 (property) — `PropertyTaxResultView.tsx` (237줄). 인쇄 버튼 **없음**.
| data-print-id | 라벨 | 그룹 | 렌더 가드 (실측) | screen | pdf |
|---|---|---|---|---|---|
| `tax-base` | 과세표준 | 계산 | 항상(`:98`) | ✓ | ✗ |
| `computed-tax` | 산출세액 | 계산 | 항상(`:121`) | ✓ | **✓ (PDF 계산표 대표)** |
| `surtax` | 부가세 | 계산 | 항상(`:155`) | ✓ | ✗ |
| `total-payable` | 총 납부세액 | 계산 | 항상(`:187`) | ✓ | ✗ |
| `installment` | 분납 안내 | 기타 | `installment.eligible`(`:197`) | ✓ | ✗ |
| `warnings` | 경고 | 기타 | `warnings.length>0`(`:88`) | ✓ | ✗ |
| `legal-basis` | 법령 근거 | 기타 | `legalBasis.length>0`(`:218`) | ✓ | ✗ |
- **7 leaf**. ⚠️ **pdf 채널 1**(검토 U1): `PropertySection`은 단일 계산표 → `computed-tax` 1개 대표. 단순.

### 2.4 종부세 (comprehensive) — `ComprehensiveTaxResultView.tsx` (470줄). 인쇄 버튼 **없음**.
| data-print-id | 라벨 | 그룹 | 렌더 가드 (실측) | screen | pdf |
|---|---|---|---|---|---|
| `aggregation-exclusion` | 합산배제 적용 내역 | 자료 | `excludedCount>0`(`:96`) | ✓ | ✗ |
| `housing-tax-base` | 주택분 과세표준 | 주택분 | 항상(`:128`) | ✓ | ✗ |
| `housing-tax` | 주택분 세액 계산 | 주택분 | `isSubjectToHousingTax`(`:176`) | ✓ | **✓ (PDF 계산표 대표)** |
| `aggregate-land` | 토지분 종합합산(§11) | 토지분 | `aggregateLandTax`(`:284`) | ✓ | ✗ |
| `separate-land` | 토지분 별도합산(§12) | 토지분 | `separateLandTax`(`:339`) | ✓ | ✗ |
| `grand-total` | 최종 합계 | 합계 | 항상(GrandTotal) | ✓ | ✗ |
| `warnings` | 경고 | 기타 | warnings 배너 | ✓ | ✗ |
- **7 leaf**. ⚠️ **pdf 채널 1**(검토 U1): `ComprehensiveSection`은 주택분 계산표만 단일 렌더(토지분 PDF 없음) → `housing-tax` 1개 대표. 토지분은 화면 인쇄로만.

### 2.5 양도세 (transfer, 단일 자산) — `TransferTaxResultView.tsx`. 기존 printScoped(`body[data-print-scope]` CSS scope) → PrintSelectionPanel 통일 (PR-F1).
| data-print-id | 라벨 | 그룹 | 렌더 가드 (실측) | screen | pdf |
|---|---|---|---|---|---|
| `form-table` | 신고서 양식 표 | 신고서식 | 항상(FilingFormTable·이월과세 비교 또는 일반) | ✓ | ✗ |
| `detailed-statement` | 계산결과 상세명세서 | 신고서식 | 항상(DetailedCalculationStatementCard) | ✓ | ✗ |
| `calculation` | 핵심 결과·계산 내역 | 계산 | 항상 | ✓ | **✓ (PDF 계산표 대표)** |
| `phd` | 개별주택가격 미공시 환산 | 계산 | `preHousingDisclosureDetail` | ✓ | ✗ |
| `split-detail` | 토지/건물 분리 양도차익 | 계산 | `splitDetail` | ✓ | ✗ |
- **5 leaf**(2그룹: 신고서식2·계산3). pdf 채널 1: `calculation`(TransferSection). 기존 printScoped scope 중 5종이 leaf(full=전체·steps=미사용 제외).
- ⚠️ **printScoped(CSS body scope) 완전 제거** — PrintSection(print:hidden)과 공존 불가(미선택 시 scope 인쇄 무효). 하위 컴포넌트 onPrint prop 제거(PHD는 필수→optional化+가드).
- ⚠️ 다중(Multi)·주식(Stock)·겸용(MixedUse)은 **F2~F4**(별도 PR). CSS scope 규칙(globals.css)은 그들이 공유하므로 F1에서 유지.

### 2.6 양도세 (transfer_multi, 다중 자산) — `MultiTransferTaxResultView.tsx`. 기존 자체 printScoped → PrintSelectionPanel 통일 (PR-F2).
| data-print-id | 라벨 | 그룹 | 렌더 가드 (실측) | screen | pdf |
|---|---|---|---|---|---|
| `summary` | 합산 결과 | 합산 | 항상(MultiTransferTaxSummaryCard) | ✓ | **✓ (PDF 계산표 대표)** |
| `detailed-statement` | 계산결과 상세명세서 | 합산 | 항상 | ✓ | ✗ |
| `reduction-recalc` | 감면세액 합산 재계산 | 상세 | sub 내부 가드(ReductionRecalculationSection) | ✓ | ✗ |
| `group-tax` | 세율군별 분리 산출 | 상세 | sub 내부 가드(GroupTaxCards) | ✓ | ✗ |
| `loss-offset` | 차손 통산 표 | 상세 | sub 내부 가드(LossOffsetTable) | ✓ | ✗ |
| `per-property` | 건별 상세 (자산별 신고서) | 상세 | `properties.map` | ✓ | ✗ |
- **6 leaf**(2그룹: 합산2·상세4). pdf 채널 1: `summary`(TransferMultiSection 다건 합산 계산).
- ⚠️ 자체 printScoped 정의(L58) + sub(PropertyBreakdownAccordion) 자산별 form-table 버튼 제거. 기존 GET 전체 PDF 버튼 → 패널 POST(`downloadSelectedPdf` 재사용). savedId 이미 마법사 전달(L589, 수동저장 state).
- availablePrintIds: sub 컴포넌트 내부 가드라 6개 항상(빈 섹션은 화면 불변·인쇄 미선택 숨김).

### 2.7 주식 양도세 (stock-transfer) — `StockTransferTaxResultView.tsx`. 기존 printScoped("full"/"form-table") → PrintSelectionPanel 통일 (PR-F3).
| data-print-id | 라벨 | 그룹 | 렌더 가드 (실측) | screen | pdf |
|---|---|---|---|---|---|
| `calculation` | 핵심 결과 (분류·결과표·양도가액 산식) | 계산 내역 | 항상(헤더·분류배지·결과표·양도가액 산식) | ✓ | ✗ |
| `detail-cards` | 상세 분해·판정 (환산·누진·평가·가산세·대주주) | 계산 내역 | 항상(과세=보유기간, 비과세=대주주판정 통상 존재) | ✓ | ✗ |
| `filing-form` | 주식 신고서 양식 표 (32행) | 신고서식 | 항상(StockFilingFormTable 32행 고정) | ✓ | ✗ |
- **3 leaf**(2그룹: 계산2·신고서식1). **pdf 채널 0** — ResultPdfDocument에 stock-transfer 섹션 부재(taxType 매칭: transfer·transfer_multi·acquisition·inheritance·gift·property·comprehensive_property). PR-2 거짓 선택 방지 → 전부 SCREEN, window.print(브라우저 PDF 저장)만.
- ⚠️ printScoped 호출 4곳(full L73·form-table L81·312·473) + `PdfActions` 컴포넌트 + data-print-section 2곳(L241·324) 완전 제거. 비과세·과세 2경로 각 3 PrintSection.
- ⚠️ onPrintPdf 미전달 → "선택 항목 PDF" 버튼 숨김. savedId·downloadSelectedPdf·hooks·Step4·ResultPdfDocument 수정 **불요**(F1/F2와 결정적 차이). StockFilingFormTable onPrint 이미 optional+가드 → 미전달만.
- CSS scope 규칙(globals.css)은 겸용(F4)이 공유하므로 F3에서 유지.

### 2.8 겸용주택 양도세 (mixed-use) — `MixedUseResultCard.tsx`. 기존 자체 printScoped → PrintSelectionPanel 통일 (PR-F4, 마지막 사용처).
| data-print-id | 라벨 | 그룹 | 렌더 가드 (실측) | screen | pdf |
|---|---|---|---|---|---|
| `calculation` | 분리계산 (안분·주택·상가·비사업용·합산세액) | 계산 내역 | 항상(①②③ ResultSection·합산세액·계산경로, ④는 nb 조건부) | ✓ | ✗ |
| `filing-form` | 신고서 양식 표 (32행) | 신고서식 | 항상(FilingFormTable) | ✓ | ✗ |
| `detailed-statement` | 계산결과 상세명세서 | 신고서식 | 항상(DetailedCalculationStatementCard) | ✓ | ✗ |
- **3 leaf**(2그룹: 계산1·신고서식2). **pdf 채널 0** — ResultPdfDocument에 mixed-use 섹션 부재(taxType transfer는 calculation만 렌더, mixedUseDetail 미렌더). PR-2 거짓 선택 방지 → 전부 SCREEN, window.print.
- MixedUseResultCard는 TransferTaxCalculator(:499 `result.mode==="mixed-use"`)에서 **독립 렌더** — TransferTaxResultView와 별개 경로. pre-2022-rejected는 에러 카드 조기 return(패널 없음, hook은 return 전 선언).
- ⚠️ 자체 printScoped 정의(L16~25)+호출 2곳(form-table·full 버튼 div) 제거. data-print-section wrapper 원래 없음. useState/useMemo 추가(순수 컴포넌트였음).
- ⚠️ **F4 = 마지막 printScoped 사용처** → globals.css `body[data-print-scope]` CSS 규칙(@page form-landscape 포함)·Helpers printScoped 정의(dead code)도 함께 제거.

## 3. 세목별 결과뷰 통합 패턴 (상속세 복제)

각 결과뷰에:
```tsx
const [selectedPrintIds, setSelectedPrintIds] = useState<Set<string>>(() => new Set());
const availablePrintIds = useMemo<Set<string>>(() => { /* §2 가드 1:1 */ }, [result, ...]);
// 상단:
<PrintSelectionPanel groups={GIFT_PRINT_SECTIONS} selectedIds={...} availableIds={...} onChange={...}
  onPrintPdf={handlePrintPdf} pdfReady={!!savedId} pdfBusy={pdfBusy} />
// 각 섹션:
<PrintSection id="..." selectedIds={selectedPrintIds}>{...}</PrintSection>
```
- 기존 `window.print()` 버튼(증여세 `:200`)은 패널로 대체. 취득·재산·종부는 패널 신규.
- 취득세는 **2곳 렌더(`:252·322`) 모두** 동일 패턴 적용.
- `savedId`: 각 마법사(`GiftTaxForm`·`AcquisitionTaxForm`·`PropertyTaxForm`·`comprehensive page`)가 `autoSave.savedId`를 결과뷰에 prop 전달하는지 **Do 진입 시 확인**(미전달 시 PDF 버튼 비활성 — 화면 인쇄는 무관).

## 4. 증여세 별지 PDF (PR-B2 — 신규 2 + 재사용 2)

| 별지 | 화면 컴포넌트 | PDF | 데이터 |
|---|---|---|---|
| 별지10호 | `GiftTaxFilingFormTable` | **신규** `lib/pdf/GiftFilingForm10PdfDocument.tsx`(`FilingForm10PdfPage` export) | `result.besshi10Rows`(FilingFormRow[]) — 화면 동일(filingFormRows 아님, §7-4 정정) |
| 부표1 | `GiftTaxValuationFormTable` | **신규** `lib/pdf/GiftValuationFormPdfDocument.tsx` | `result.valuationResults`·grossGiftValue·exemptAmount·aggregatedGiftValue (화면 `:360-365` 동일 props) |
| 비상장 | `UnlistedStockBesshiResultSection` | **재사용** `UnlistedStockBesshiPages`(PR-3b) | estateItems V2 |
| 상장 | `ListedStockBesshiResultSection` | **재사용** `ListedStockBesshiPages`(PR-3b) | estateItems 상장 |
- 통합 위임: `lib/pdf/gift-besshi-pages.tsx` `GiftSelectedBesshiPages`(상속세 `inheritance-besshi-pages.tsx` 패턴). ResultPdfDocument `InheritanceGiftSection` gift 분기에서 호출.
- 화면=PDF 상수·산식 공유, 산식 재계산 금지. PR-3a 패턴.

## 5. 서버 PDF 필터 확대 (`ResultPdfDocument.tsx`)
- `InheritanceGiftSection` gift 분기: `selectedSectionIds` 필터(tax-summary→계산표) + `GiftSelectedBesshiPages`.
- `AcquisitionSection`·`PropertySection`·`ComprehensiveSection`: 각 **단일 계산표** → pdf 대표 노드 1개(`tax-detail`/`computed-tax`/`housing-tax`)가 selectedSectionIds에 포함될 때만 섹션 렌더(미포함 시 null). 미지정(GET)=전체. ⚠️ 계산표 내부 분리 불가(검토 U1) — 대표 노드 1개로 on/off.
- route 변경 없음(POST `{sections}` 이미 범용).

## 6. Pre-Do anchor (`__tests__/print/`)
- **PD-A (PR-A)**: 상속세 제네릭화 회귀 — `INHERITANCE_PRINT_SECTIONS`로 기존 anchor 7건 GREEN 유지(groups 인자 전달).
- **PD-gift**: `GIFT_PRINT_SECTIONS` flatten 11 leaf·pdf 5종·0건→print:hidden·1개 선택.
- **PD-acq/prop/comp**: 각 레지스트리 leaf 수·pdf 채널·selectPdfSections.
- E2E: 세목별 `selective-print-{tax}.spec.ts`(패널·0건 가드·print 가시성) — 상속세 spec 패턴.

## 7. UI 명세 (상속세 재사용 — 변경 없음)
- 패널 위치: 결과뷰 최상단, `print:hidden`. 기본 전체 미선택 + "전체 선택/해제" + 0건 가드.
- "선택 항목 인쇄"(항상) + "선택 항목 PDF"(로그인+savedId 시). pdf 채널 노드만 PDF 반영.
- 색상 sky·`section-card-numbering`. 화면 표시 불변(미선택도 화면엔 보이고 인쇄만 제외).

## 7-2. PR-A 갭 분석 (공통 제네릭화 — 구현 완료)

| 항목 | 설계 | 구현 | 판정 |
|---|---|---|---|
| shared 타입·헬퍼 | `print-sections.types.ts` 제네릭(groups 인자) | 신규 — `PrintSectionNode<Id>`·`PrintSectionGroup<Id>` + 헬퍼 5종 | ✓ |
| inheritance 리팩토링 | shared import + export 보존 | 헬퍼를 **INHERITANCE 바인딩 래퍼**로(기존 시그니처 100% 보존) → 기존 anchor·호출부 **무변경** | ✓ |
| `PrintSection` | id:string, shared import | 완료(PrintSectionId 결합 제거) | ✓ |
| `PrintSelectionPanel` | groups props | `allGroups` props 신설, INHERITANCE 하드코딩·import 제거, id `string` | ✓ |
| 상속세 호출부 | groups 전달 | `allGroups={INHERITANCE_PRINT_SECTIONS}` + `selectedPrintIds: Set<string>`(제네릭 정합) | ✓ |
| 회귀 | 상속세 0 | anchor 12(제네릭 5+상속세 7) + 전체 5964 + E2E 1 PASS | ✓ |

**deviation(설계 보강)**: 설계 §1.1은 "헬퍼 기본값 제거"였으나, 상속세 회귀 0을 위해 **inheritance-print-sections.ts에 기존 시그니처 래퍼 유지**(shared는 groups 필수, inheritance 래퍼는 INHERITANCE 바인딩). 기존 anchor·PrintSelectionPanel 외 호출부 무변경. `selectedPrintIds`는 제네릭 패널(`Set<string>`) 정합 위해 `Set<PrintSectionId>`→`Set<string>` 완화(add는 PrintSectionId 리터럴, 레지스트리 anchor가 정합 방어).

## 7-3. PR-B1 갭 분석 (증여세 화면 인쇄 — 구현 완료)

| 항목 | 설계 | 구현 | 판정 |
|---|---|---|---|
| `GIFT_PRINT_SECTIONS` 11 leaf | §2.1 (요약4·자료1·서식2·평가2·기타2) | `gift-print-sections.ts` 11 leaf + 바인딩 래퍼(inheritance 패턴) | ✓ |
| pdf 채널 | §2.1·§8 "5종" | **PR-B1=`tax-summary`(계산표) 1종만**. 별지4는 PR-B2 승격 | ⚠️ 단계 분할 |
| `GiftTaxResultView` 통합 | §3 상속세 복제 | 11 `PrintSection` + 패널 + `savedId` + `handlePrintPdf` + `availablePrintIds`(렌더 가드 1:1) | ✓ |
| `window.print()` 버튼 | §3 패널로 대체 | 제거 → "선택 항목 인쇄"(패널) | ✓ |
| `savedId` 전달 | §3 "Do 진입 시 확인" | `GiftTaxForm` `savedId={autoSave.savedId ?? undefined}` 추가 | ✓ |
| ResultPdfDocument gift 필터 | §5 gift 분기 필터 | `filtered`에서 `isInheritance` 제거 → gift도 `tax-summary` 필터. GET(전체) 회귀 0 | ✓ |
| 별지 PDF | §4 신규2+재사용2 | PR-B2로 분리(gift 위임·react-pdf 미구현) | → PR-B2 |
| anchor | §6 PD-gift | `gift-print-sections.test.ts` 7 + 전체 5971 + 상속세·증여세 E2E 2 PASS | ✓ |

**deviation(거짓 선택 방지)**: §2.1·§8 표는 **PR-B2 완료 후 최종 상태**(pdf 5종) 기술. PR-B1 시점엔 ResultPdfDocument가 실제 분리 렌더 가능한 `tax-summary`(계산표) 1종만 pdf 채널. 별지 4종(filing-form-10·valuation-form·주식2)은 PR-B2(별지10·부표1 react-pdf 신규 + `gift-besshi-pages` 위임)에서 pdf 승격. (PR-2 교훈: 미구현 노드를 pdf로 표시하면 빈 PDF 위험 → screen 유지)

## 7-4. PR-B2 갭 분석 (증여세 별지 PDF — 구현 완료)

| 항목 | 설계 | 구현 | 판정 |
|---|---|---|---|
| 별지10호 PDF | §4 신규 `GiftFilingForm10PdfDocument`(FilingForm10PdfPage) | `result.besshi10Rows`(FilingFormRow[]) → 별지9호 `CalcRow` 템플릿 좌(⑰~㊱)·우(㊲~㊼) 순차 | ✓ |
| 부표1 PDF | §4 신규 `GiftValuationFormPdfDocument` | landscape 10컬럼 + 계 ⑨~⑮. 화면과 동일 헬퍼·산식 | ✓ |
| 주식2 PDF | §4 재사용 `ListedStock`·`UnlistedStock`BesshiPages(PR-3b) | `gift-besshi-pages` 위임에서 estateItems(giftItems+stockItems) 필터 후 재사용 | ✓ |
| 위임 | §4 `GiftSelectedBesshiPages` | 신규 — inheritance-besshi-pages 패턴, selectedSectionIds 조건부 4 Page | ✓ |
| 산식 단일출처 | (dual-truth 0) | `lib/calc/gift-valuation-besshi.ts`(computeRow10·14·LABEL) 추출 — 화면·PDF 공유, 화면 RTL anchor 회귀 0 | ✓ |
| ResultPdfDocument | §5 gift 분기 위임 호출 | `taxType==="gift"` → GiftSelectedBesshiPages | ✓ |
| 채널 승격 | §2.1 pdf 5종 | filing-form-10·valuation-form·주식2 → SCREEN_PDF (PR-B1 tax-summary + 4 = 5) | ✓ |
| anchor | §6 | gift-valuation 3 + gift-print 5종 + 전체 5974 + tsc 0 | ✓ |

**정정(§4 실측)**: §4 표는 별지10호 데이터를 "result.filingFormRows"로 기술했으나, 화면(`GiftTaxFilingFormTable`)·엔진 실측 결과 **`result.besshi10Rows`(FilingFormRow[])** 가 정확(filingFormRows는 구 12/18행, besshi10Rows로 대체). §4 표 정정 반영.

**deviation(렌더러 중복 허용)**: 별지10호 `CalcRow`는 별지9호와 동일 패턴이나 별지9호 무변경(회귀 0) 위해 복제. dual-truth 0의 핵심은 **데이터(besshi10Rows·valuationResults)**가 단일 — 렌더러(화면 HTML/PDF) 중복은 허용([[ui_engine_dual_truth_avoidance]]). 부표1 산식(computeRow10·14)·라벨은 `gift-valuation-besshi` 단일 출처로 추출.

## 7-5. PR-C 갭 분석 (취득세 선택 출력 — 구현 완료)

| 항목 | 설계 | 구현 | 판정 |
|---|---|---|---|
| `ACQUISITION_PRINT_SECTIONS` 11 leaf | §2.2 (요약4·분석3·기타4) | `acquisition-print-sections.ts` 11 leaf 3그룹 + 바인딩 래퍼 | ✓ |
| pdf 채널 | §2.2 tax-detail 1종 | `tax-detail` SCREEN_PDF (AcquisitionSection 단일 계산표 대표) | ✓ |
| 결과뷰 통합 | §3 상속세 복제 | 11 `PrintSection` + 패널 + `savedId` + `handlePrintPdf` + `availablePrintIds`. isExempt early return 유지 | ✓ |
| 인쇄 버튼 | §2.2 신규(없음) | `window.print` 없던 결과뷰에 `PrintSelectionPanel` 신규 도입(인쇄·PDF 버튼 제공) | ✓ |
| 결과뷰 2곳 렌더 | §3 :252·322 양쪽 | `const autoSave` + 2곳 `savedId` 전달(replace_all) | ✓ |
| `savedId` | §3 Do 진입 확인 | `useAutoSaveCalculation` 반환 미할당 → `const autoSave` 할당 후 전달 | ✓ |
| ResultPdfDocument 필터 | §5 tax-detail 대표 | AcquisitionSection `selectedSectionIds` 필터(미포함 시 null) + 호출부 | ✓ |
| 분석 3섹션 간주취득 제외 | §2.2 | availableIds: reduction-panel·house-count = !isDeemed, surcharge-detail = !isDeemed‖특례 | ✓ |
| anchor | §6 PD-acq | acquisition 7 + 전체 5981 + tsc 0 | ✓ |
| E2E | §6 세목별 spec | **생략**(취득세 마법사 6단계 입력 복잡도) — 제네릭 패널 PR-B1 E2E + anchor 7 | ⚠️ |

**deviation 1 (보조카드 묶음)**: 설계 §2.2 11 leaf에 없는 보조 카드(선형보간 그래프·세율특례·법인중과·자경농지)는 **인접 leaf PrintSection 연속 구간에 포함** — linear→`reduction-panel`, specialRate·corp·selfCultivation→`surcharge-detail`. PrintSection이 연속 블록을 감싸므로 경계만 정하면 자동 포함. 다중 카드 PrintSection은 `className="space-y-4"`로 내부 간격 유지.

**deviation 2 (surcharge-detail availableIds)**: 설계 가드 "isSurcharged·!isDeemed"이나, 구간에 specialRate/corp/selfCultivation(isDeemed 무관)이 포함되므로 `available = !isDeemedAcquisition ‖ specialRateDetail ‖ corpSurchargeDetail ‖ selfCultivationReductionDetail`로 확장.

**deviation 3 (E2E 생략)**: 취득세 마법사는 6단계 + native select 2개 + RadioCardGroup + 취득일 위젯으로 안정적 E2E 입력에 비용 과다. 선택 패널·`PrintSection`·`print:hidden` 가시성은 **PR-A 제네릭 컴포넌트**로 **PR-B1 증여세 E2E**(패널 노출·0건 가드·print 미디어 토글)가 실브라우저 검증 — 취득세는 `allGroups={ACQUISITION_PRINT_SECTIONS}`만 주입(컴포넌트 동작 세목 무관). 취득세 고유(11 leaf·availableIds·PDF 필터)는 anchor 7로 검증. 후속 PR에서 취득세 전용 E2E 추가 가능.

## 7-6. PR-D 갭 분석 (재산세 선택 출력 — 구현 완료)

| 항목 | 설계 | 구현 | 판정 |
|---|---|---|---|
| `PROPERTY_PRINT_SECTIONS` 7 leaf | §2.3 (계산4·기타3) | `property-print-sections.ts` 7 leaf 2그룹 + 바인딩 래퍼 | ✓ |
| pdf 채널 | §2.3 computed-tax 1종 | `computed-tax` SCREEN_PDF (PropertySection 단일 계산표 대표) | ✓ |
| 결과뷰 통합 | §3 상속세 복제 | 7 `PrintSection` + 패널 **신규** + `savedId` + `handlePrintPdf` + `availablePrintIds` (useState/useMemo 신규 import — 기존 순수 컴포넌트) | ✓ |
| 결과뷰 1곳 렌더 | §3 :163 | `const autoSave` + `savedId` 전달 (취득세 2곳과 달리 1곳) | ✓ |
| ResultPdfDocument 필터 | §5 computed-tax 대표 | PropertySection `selectedSectionIds` 필터(미포함 시 null) + 호출부 | ✓ |
| anchor | §6 PD-prop | property 7 + 전체 회귀 + tsc 0 | ✓ |
| E2E | §6 세목별 spec | **생략**(PR-C 동일) — 제네릭 패널 PR-B1 E2E + anchor 7 | ⚠️ |

**단순성**: 재산세는 isExempt 전용 화면 없음 + 모든 섹션 단일 카드(보조 카드 묶음 불필요) → PR-C 대비 단순. 각 `<section>`을 1:1로 PrintSection 래핑(className 불요). E2E는 PR-C와 동일 사유로 생략(제네릭 패널은 PR-B1 E2E 검증).

## 7-7. PR-E 갭 분석 (종합부동산세 선택 출력 — 구현 완료)

| 항목 | 설계 | 구현 | 판정 |
|---|---|---|---|
| `COMPREHENSIVE_PRINT_SECTIONS` 7 leaf | §2.4 (자료1·주택분2·토지분2·합계1·기타1) | `comprehensive-print-sections.ts` 7 leaf **5그룹** + 바인딩 래퍼 | ✓ |
| pdf 채널 | §2.4 housing-tax 1종 | `housing-tax` SCREEN_PDF (주택분 계산표 대표, 토지분 PDF 없음) | ✓ |
| 결과뷰 통합 | §3 상속세 복제 | 7 `PrintSection` + 패널 **신규** + `savedId` + `handlePrintPdf` + `availablePrintIds` (useState/useMemo 신규 import). sub 컴포넌트 6종 1:1 래핑 | ✓ |
| 마법사 = page | §3 `comprehensive page` | `app/calc/comprehensive-tax/page.tsx:688` — `const autoSave` + `savedId` 전달 (form 아닌 page) | ✓ |
| ResultPdfDocument 필터 | §5 housing-tax 대표 | ComprehensiveSection `selectedSectionIds` 필터(미포함 시 null) + 호출부 | ✓ |
| anchor | §6 PD-comp | comprehensive 7 + 전체 회귀 + tsc 0 | ✓ |
| E2E | §6 세목별 spec | **생략**(PR-C/D 동일) — 제네릭 패널 PR-B1 E2E + anchor 7 | ⚠️ |

**토지분 PDF 부재(설계 명시)**: ComprehensiveSection은 주택분 계산표만 렌더(토지분 종합합산·별도합산 PDF 없음). aggregate-land·separate-land는 `screen`만 채널 — 화면 인쇄로만 출력. housing-tax 1종이 pdf 대표(검토 U1). sub 컴포넌트 null 가드(excludedCount===0·!isSubjectToHousingTax·!aggregateLandTax·!separateLandTax)와 availablePrintIds 1:1 일치.

## 7-8. PR-F1 갭 분석 (양도세 단일 자산 — 구현 완료)

| 항목 | 설계 | 구현 | 판정 |
|---|---|---|---|
| `TRANSFER_PRINT_SECTIONS` 5 leaf | §2.5 (신고서식2·계산3) | `transfer-print-sections.ts` 5 leaf 2그룹 | ✓ |
| pdf 채널 | §2.5 calculation 1종 | `calculation` SCREEN_PDF (TransferSection 계산 내역) | ✓ |
| printScoped 제거 | §2.5 완전 제거 | printScoped import·호출 9곳·data-print-section 3곳 전부 제거(잔존 0). PrintSection 5/5 균형 | ✓ |
| 하위 onPrint 제거 | §2.5 | FilingFormTable·CarryoverScenarioB·DetailedStatement(optional, prop 제거) / PHD(필수→optional化+가드) | ✓ |
| 결과뷰 통합 | §3 | 5 PrintSection + 패널 + savedId + hooks. 상단 printScoped 버튼·계산/분할 자체 버튼 제거 | ✓ |
| 마법사 | §3 :479 | `const autoSave` + `savedId` 전달(result.result wrapper) | ✓ |
| ResultPdfDocument | §5 | TransferSection `selectedSectionIds` 필터(calculation) + isExempt null 유지 | ✓ |
| 800줄 정책 | 강제 | handlePrintPdf → Helpers `downloadSelectedPdf` 추출(815→794) | ✓ |
| anchor | §6 PD-tr | transfer 7 + 전체 회귀 + tsc 0 | ✓ |

**CSS scope 유지(F1 한정)**: globals.css `body[data-print-scope]` 규칙은 다중/주식/겸용(F2~F4)이 공유하므로 F1에서 제거하지 않음. printScoped 호출이 없어진 TransferTaxResultView는 data-print-scope 미설정 → CSS scope 규칙 비활성(무해). F4 완료 시 CSS 규칙 제거 예정.

**deviation(E2E 생략)**: PR-C~E와 동일 — 제네릭 패널은 PR-B1 E2E + anchor 7로 검증. 양도세 마법사 입력 복잡도(자산 카드)로 E2E 생략, 후속 가능.

## 7-9. PR-F2 갭 분석 (양도세 다중 자산 — 구현 완료)

| 항목 | 설계 | 구현 | 판정 |
|---|---|---|---|
| `MULTI_TRANSFER_PRINT_SECTIONS` 6 leaf | §2.6 (합산2·상세4) | `multi-transfer-print-sections.ts` 6 leaf 2그룹 | ✓ |
| pdf 채널 | §2.6 summary 1종 | `summary` SCREEN_PDF (TransferMultiSection 다건 합산) | ✓ |
| 자체 printScoped 제거 | §2.6 | printScoped 정의(L58)·호출·data-print-section 전부 제거(잔존 0). PrintSection 6/6 균형 | ✓ |
| sub form-table 버튼 제거 | §2.6 | PropertyBreakdownAccordion 자산별 신고서 버튼 div 제거(printScoped) | ✓ |
| 결과뷰 통합 | §3 | 6 PrintSection + 패널 + selectedPrintIds·hooks | ✓ |
| GET→POST PDF | §2.6 | 기존 handlePdfDownload(GET 전체) → handlePrintPdf(POST sections, `downloadSelectedPdf` 재사용) | ✓ |
| 마법사 savedId | §3 :589 | 이미 전달(수동저장 state) — 수정 불요 | ✓ |
| ResultPdfDocument | §5 | TransferMultiSection `selectedSectionIds` 필터(summary) | ✓ |
| 800줄 정책 | 강제 | 755줄(printScoped·sub 버튼 제거로 감소) | ✓ |
| anchor | §6 PD-mtr | multi-transfer 7 + 전체 회귀 + tsc 0 | ✓ |

**availablePrintIds 6개 항상(deviation)**: reduction-recalc·group-tax·loss-offset은 sub 컴포넌트 내부 null 가드(result만으로 판단 어려움)라 availablePrintIds에 6개 항상 추가. sub가 null이면 빈 PrintSection(화면 불변, 인쇄 미선택 숨김) — 패널엔 항상 표시되나 무해. F1과 달리 가드 1:1 대신 sub 위임.

**E2E 생략**: PR-F1·C~E 동일 — 제네릭 패널 PR-B1 E2E + anchor 7.

## 7-10. PR-F3 갭 분석 (주식 양도세 — 구현 완료)

| 항목 | 설계 | 구현 | 판정 |
|---|---|---|---|
| `STOCK_TRANSFER_PRINT_SECTIONS` 3 leaf | §2.7 (계산2·신고서식1) | `stock-transfer-print-sections.ts` 3 leaf 2그룹 | ✓ |
| pdf 채널 | §2.7 **0종** | 전부 SCREEN — ResultPdfDocument에 stock-transfer 섹션 부재(PR-2 거짓 선택 방지) | ✓ |
| printScoped 제거 | §2.7 완전 제거 | printScoped import·호출 4곳(full·form-table×3)·`PdfActions` 컴포넌트·data-print-section 2곳 전부 제거(코드 잔존 0, 주석 설명만) | ✓ |
| 결과뷰 통합 | §3 | 비과세·과세 2경로 각 3 PrintSection + 패널 + selectedPrintIds·useMemo. onPrintPdf 미전달 | ✓ |
| StockFilingFormTable | §2.7 | onPrint 미전달(이미 optional+`{onPrint && ...}` 가드) — 컴포넌트 수정 0 | ✓ |
| Step4·savedId | — | PDF 채널 0 → savedId·downloadSelectedPdf·hooks·Step4 수정 **불요**(F1/F2와 차이) | ✓ |
| ResultPdfDocument | §5 | stock 섹션 부재 → **수정 0**(거짓 선택 방지) | ✓ |
| 800줄 정책 | 강제 | 789줄(PdfActions 제거로 감소) | ✓ |
| anchor | §6 PD-st | stock-transfer 7(pdf 0종·selectPdf 항상 빈) + 전체 회귀 + tsc 0 | ✓ |

**pdf 채널 0(F1/F2와 결정적 차이)**: ResultPdfDocument의 taxType 매칭은 transfer·transfer_multi·acquisition·inheritance·gift·property·comprehensive_property — **stock-transfer 부재**. 서버 PDF가 stock 본문을 렌더하지 못하므로 PR-2 거짓 선택 방지 원칙에 따라 어떤 leaf에도 pdf 채널 미부여. `onPrintPdf` 미전달 → "선택 항목 PDF" 버튼 자동 숨김(PrintSelectionPanel `{onPrintPdf && ...}`), "선택 항목 인쇄"(window.print → 브라우저 PDF 저장)만 노출. 기존 printScoped("full") 동작과 본질적으로 동일. **후속**: stock 서버 PDF 섹션 신규 시 calculation/filing-form에 pdf 채널 승격 가능(증여 별지 PR-B2 패턴).

**availablePrintIds 3개 항상(deviation)**: calculation·detail-cards·filing-form 모두 항상 가용. detail-cards 내부는 전부 조건부 카드(환산·로트·취득후상장·사례49 등)지만 과세 화면은 최소 보유기간, 비과세는 대주주판정이 통상 존재. 완전히 빈 경우는 화면 불변+인쇄 미선택 숨김으로 무해(F2 동일 패턴).

**CSS scope(F1~F3 공유)**: globals.css `body[data-print-scope]` 규칙은 겸용(F4)이 아직 printScoped 사용 → 유지. F3에서 stock printScoped 호출 제거로 본 결과뷰는 규칙 비활성(무해). F4 완료 시 제거 예정.

**E2E 생략**: PR-F1·F2·C~E 동일 — 제네릭 패널 PR-B1 E2E + anchor 7.

## 7-11. PR-F4 갭 분석 (겸용주택 양도세 + CSS scope 정리 — 구현 완료)

| 항목 | 설계 | 구현 | 판정 |
|---|---|---|---|
| `MIXED_USE_PRINT_SECTIONS` 3 leaf | §2.8 (계산1·신고서식2) | `mixed-use-print-sections.ts` 3 leaf 2그룹 | ✓ |
| pdf 채널 | §2.8 **0종** | 전부 SCREEN — ResultPdfDocument에 mixed-use 섹션 부재(PR-2 거짓 선택 방지) | ✓ |
| printScoped 제거 | §2.8 자체 정의 완전 제거 | 자체 printScoped 정의(L16~25)·호출 2곳(버튼 div) 제거(코드 잔존 0, 주석만). PrintSection 3/3 균형 | ✓ |
| 결과뷰 통합 | §3 | 독립 렌더(TransferTaxCalculator:499) — 3 PrintSection + 패널 + useState/useMemo. onPrintPdf 미전달 | ✓ |
| Helpers·Calculator·PDF | — | PDF 채널 0 → savedId·hooks·Calculator·ResultPdfDocument 수정 **불요** | ✓ |
| **CSS scope 전면 제거** | F4=마지막 | globals.css `body[data-print-scope]` 토글 블록(L223~252)·`@page form-landscape`+`page` 규칙 제거. 일반 `@media print`(print:hidden)는 유지 | ✓ |
| **Helpers printScoped 정의 제거** | dead code | `TransferTaxResultViewHelpers` printScoped export 제거(호출처 0 — F1~F3에서 import 전부 제거). tsc 0 확인 | ✓ |
| 800줄 정책 | 강제 | 725줄 | ✓ |
| anchor | §6 PD-mu | mixed-use 7(pdf 0종·selectPdf 항상 빈) + 전체 회귀 + tsc 0 | ✓ |

**printScoped 전면 폐지 완료(시리즈 종결)**: 양도세 4 결과뷰(단일 F1·다중 F2·주식 F3·겸용 F4)가 모두 PrintSelectionPanel로 통일 → printScoped 코드 호출·정의·CSS 규칙 전부 0(주석만 잔존). data-print-scope 토글 메커니즘 완전 폐지.

**data-print-section dead attribute(deviation·무해)**: 하위 컴포넌트(FilingFormTable·StockFilingFormTable·DetailedCalculationStatementCard·CarryoverScenarioBFilingCard·CarryoverComparisonCard·PreHousingDisclosureDetailSection·StockTaxpayerHeaderCard) 7곳에 `data-print-section` 속성 잔존. CSS scope 규칙 제거로 어떤 selector에도 미매칭 → 인쇄 무영향(dead attribute). PrintSection은 `data-print-id`로 동작(별개). F1~F3과 동일하게 하위 컴포넌트 미수정 — 후속 정리 가능(StockTaxpayerHeaderCard:10 주석도 stale).

**pdf 채널 0(F3과 동일)**: mixedUseToFilingResult 어댑터로 화면은 FilingFormTable/DetailedStatement 재사용하나, 저장 시 원본 MixedUseGainBreakdown이라 ResultPdfDocument TransferSection(calculation만)이 렌더 못 함. 후속: mixed-use 서버 PDF 섹션 신규 시 pdf 승격 가능.

**E2E 생략**: PR-F1~F3·C~E 동일 — 제네릭 패널 PR-B1 E2E + anchor 7.

## 8. 케이스 인벤토리 요약 (leaf·pdf 채널 수 — 검토 U1 반영)
| 세목 | leaf | pdf 채널 | 별지 PDF |
|---|---|---|---|
| 증여 | 11 | 5 (tax-summary·filing-form-10·valuation-form·주식2) — **PR-B1=tax-summary 1, 별지4 PR-B2 승격** | 신규 2 + 재사용 2 |
| 취득 | 11 | 1 (tax-detail = 계산표 대표) | 없음 |
| 재산 | 7 | 1 (computed-tax = 계산표 대표) | 없음 |
| 종부 | 7 | 1 (housing-tax = 주택분 계산표 대표) | 없음 |
| 양도(단일) | 5 | 1 (calculation = 계산 내역 대표) | 없음 — printScoped→PrintSelectionPanel 통일(F1). 다중/주식/겸용 F2~F4 |
| 양도(다중) | 6 | 1 (summary = 다건 합산 대표) | 없음 — printScoped→PrintSelectionPanel 통일(F2). 주식/겸용 F3~F4 |
| 양도(주식) | 3 | **0** (서버 PDF 섹션 부재 — 전부 SCREEN, window.print) | 없음 — printScoped→PrintSelectionPanel 통일(F3). 겸용 F4 |
| 양도(겸용) | 3 | **0** (서버 PDF 섹션 부재 — 전부 SCREEN, window.print) | 없음 — printScoped→PrintSelectionPanel 통일(F4, 마지막). **CSS scope 규칙 전면 제거** |
> pdf 채널 = ResultPdfDocument에서 **실제 분리 렌더 가능한 단위만**(거짓 선택 방지, PR-2 교훈). 취득·재산·종부 계산표는 단일 표라 대표 1노드.
> **시리즈 종결(PR-A~F4)**: 6대 세목 + 양도세 4 결과뷰(단일·다중·주식·겸용) = 8 결과뷰 모두 PrintSelectionPanel 통일. printScoped·data-print-scope CSS 전면 폐지(dead `data-print-section` 속성만 무해 잔존). 다음: feature/selective-print-6tax → master 머지.
