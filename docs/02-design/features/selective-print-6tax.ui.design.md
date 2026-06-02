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

## 8. 케이스 인벤토리 요약 (leaf·pdf 채널 수 — 검토 U1 반영)
| 세목 | leaf | pdf 채널 | 별지 PDF |
|---|---|---|---|
| 증여 | 11 | 5 (tax-summary·filing-form-10·valuation-form·주식2) — **PR-B1=tax-summary 1, 별지4 PR-B2 승격** | 신규 2 + 재사용 2 |
| 취득 | 11 | 1 (tax-detail = 계산표 대표) | 없음 |
| 재산 | 7 | 1 (computed-tax = 계산표 대표) | 없음 |
| 종부 | 7 | 1 (housing-tax = 주택분 계산표 대표) | 없음 |
> pdf 채널 = ResultPdfDocument에서 **실제 분리 렌더 가능한 단위만**(거짓 선택 방지, PR-2 교훈). 취득·재산·종부 계산표는 단일 표라 대표 1노드.
