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
| 별지10호 | `GiftTaxFilingFormTable` | **신규** `lib/pdf/GiftFilingForm10PdfDocument.tsx`(`FilingForm10PdfPage` export) | `result.filingFormRows` 등 화면 동일 |
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

## 8. 케이스 인벤토리 요약 (leaf·pdf 채널 수 — 검토 U1 반영)
| 세목 | leaf | pdf 채널 | 별지 PDF |
|---|---|---|---|
| 증여 | 11 | 5 (tax-summary·filing-form-10·valuation-form·주식2) | 신규 2 + 재사용 2 |
| 취득 | 11 | 1 (tax-detail = 계산표 대표) | 없음 |
| 재산 | 7 | 1 (computed-tax = 계산표 대표) | 없음 |
| 종부 | 7 | 1 (housing-tax = 주택분 계산표 대표) | 없음 |
> pdf 채널 = ResultPdfDocument에서 **실제 분리 렌더 가능한 단위만**(거짓 선택 방지, PR-2 교훈). 취득·재산·종부 계산표는 단일 표라 대표 1노드.
