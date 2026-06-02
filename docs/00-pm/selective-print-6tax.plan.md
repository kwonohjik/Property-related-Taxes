# 계산 결과 선택 출력 — 6대 세목 공통화 계획서

> 작성일: 2026-06-02 · 브랜치 `feature/selective-print-6tax` ← `feature/selective-print` 기반
> 워크트리: `/Users/mynote/workspace/Property-related-Taxes-6tax`
> 선행: 상속세 선택 출력(PR-1~3c) 완료. 본 계획은 그 패턴을 나머지 5세목으로 일반화.

## 1. 문제 / 목표

상속세에만 구현된 **선택 출력**(PrintSelectionPanel 계층 체크박스 + `PrintSection` 래핑 + 서버 PDF `selectedSectionIds` 필터)을 다른 세목으로 확장한다. 사용자가 각 세목 결과 화면에서도 필요한 항목만 골라 인쇄/PDF로 받게 한다.

**본 계획 주 범위 (결정 §8): 증여·취득·재산·종부 4세목** + 공통 제네릭화(PR-A). 양도세는 기존 `printScoped`(CSS scope) 패턴이 작동 중이고 최복잡(다건·이월과세·필지·CSS)이라 **별도 후속(PR-F)**으로 분리. 상속세는 이미 완료(기준 패턴).

## 2. 현황 (실측 — 6tax 워크트리)

### 2.1 세목별 결과뷰·렌더 위치·인쇄 현황 매트릭스

| 세목 | 결과뷰 컴포넌트 | 렌더 위치 | 현재 인쇄/PDF | 선택 출력 |
|---|---|---|---|---|
| 상속(inheritance) | `InheritanceTaxResultView.tsx` | 마법사 결과 단계 | ✅ PrintSelectionPanel + 서버 PDF POST | ✅ 완료 |
| 양도(transfer) | `TransferTaxResultView.tsx` (784줄) | 마법사 `TransferTaxCalculator.tsx:164` **+ 저장이력 `ResultDetailClient.tsx:119`(완전)** | `printScoped()` CSS scope 7종 + 서버 PDF GET | ⚠️ scope 단일선택(다름) |
| 양도-다건(transfer_multi) | `MultiTransferTaxResultView.tsx` | ResultDetailClient + 마법사 | `printScoped()` scope | ⚠️ scope |
| 증여(gift) | `GiftTaxResultView.tsx` (477줄) | 마법사 + ResultDetailClient **"준비중"** | `window.print()`만 | ❌ |
| 취득(acquisition) | `AcquisitionTaxResultView.tsx` (615줄) | 마법사 + ResultDetailClient **"준비중"** | 인쇄 버튼 **없음** | ❌ |
| 재산(property) | `PropertyTaxResultView.tsx` (238줄) | 마법사 `PropertyTaxForm.tsx:163` + ResultDetailClient **"준비중"** | 인쇄 버튼 **없음** | ❌ |
| 종부(comprehensive) | `ComprehensiveTaxResultView.tsx` (470줄) | 마법사 `comprehensive-tax/page.tsx:688` + ResultDetailClient **"준비중"** | 인쇄 버튼 **없음** | ❌ |

- ⚠️ **양도세만 `ResultDetailClient`(저장이력 `/result/[id]`)에서도 완전 렌더**. 나머지 5세목은 "준비중" → **선택 출력은 마법사 결과뷰에서 동작**(상속세와 동일 경로).

### 2.2 공통 컴포넌트의 상속세 결합도 (제네릭화 선행 필요)

- `components/calc/results/PrintSelectionPanel.tsx`: **`INHERITANCE_PRINT_SECTIONS` 직접 import**(`:6`), `PrintSectionId`/`PrintSectionGroup` 타입 import. registry를 props로 받지 않음 → **상속세 전용**.
- `components/calc/results/shared/PrintSection.tsx`: `PrintSectionId` import + `resolvePrintVisibilityClass`(상속세 파일). `id: PrintSectionId` 결합.
- `lib/print/inheritance-print-sections.ts`: 타입(`PrintSectionNode`/`PrintSectionGroup`)은 일반적이나 파일에 상속세 트리·헬퍼가 혼재.

### 2.3 양도세 `printScoped` 패턴 (기존 부분 선택 출력)

- `TransferTaxResultViewHelpers.tsx:15 printScoped(scope)` → `document.body.dataset.printScope = scope` → `window.print()`.
- scope 7종: `form-table`·`full`·`calculation`·`phd`·`split-detail`·`steps`·`detailed-statement`.
- CSS `app/globals.css:194~249`: `body[data-print-scope="X"] [data-print-section="full"] > *:not([data-print-section="X"]) { display:none }`.
- 결과뷰에 `data-print-section="full|calculation|split-detail"` 부착(`TransferTaxResultView.tsx:73·178·606`).
- ⚠️ **단일 scope 선택**(버튼 1클릭 = 1영역 인쇄). 상속세 PrintSelectionPanel은 **다중 체크 선택** → 두 패턴 상이.

### 2.4 서버 PDF (`lib/pdf/ResultPdfDocument.tsx`)

- 6세목 섹션 함수 모두 존재(Transfer·TransferMulti·Acquisition·InheritanceGift·Property·Comprehensive).
- `selectedSectionIds` 필터는 **상속세만**(`InheritanceGiftSection` `tax-summary`·`heir-allocation-summary` + 별지 5종 `InheritanceSelectedBesshiPages`).
- 양도·취득·재산·종부세 PDF 섹션은 **단일 계산 내역 표**(현재 분할 선택 단위 없음). 양도세 신고서 양식은 `TransferSection`/`TransferMultiSection`에 포함.
- 독립 react-pdf Document는 **상속세 별지만**. 타 세목 독립 Document 없음.

## 3. 핵심 설계 결정 (D1~D4)

### D1. 레지스트리 구조 — **세목별 독립 + 공통 타입·헬퍼 추출** (하이브리드, 권장)
6세목 결과뷰 섹션 구조가 완전히 달라 통합 단일 트리는 부적합. 단 타입·헬퍼는 중복 금지.
- `lib/print/print-sections.types.ts` (신규): `PrintChannel`·`PrintSectionNode`·`PrintSectionGroup`(제네릭 `<Id extends string>`) + 헬퍼 `flattenPrintSectionIds`·`pdfEligibleIds`·`resolvePrintVisibilityClass`·`resolveGroupCheckState`·`selectPdfSections` (id `string` 기반).
- `lib/print/{tax}-print-sections.ts`: 세목별 `XxxPrintSectionId` union + 트리 + (타입·헬퍼는 shared re-export).
- 기존 `inheritance-print-sections.ts`는 shared에서 타입·헬퍼 import하도록 리팩토링(외부 export 100% 보존 — import 사이트 무변경, `feedback_800line_split_export_preservation` 패턴).

### D2. 공통 컴포넌트 제네릭화 — **registry를 props로** (선행 PR)
- `PrintSection`: `id: string`, `selectedIds: ReadonlySet<string>` (이미 selectedIds는 string). `resolvePrintVisibilityClass`를 shared import. → 탈-상속세.
- `PrintSelectionPanel`: **`groups: PrintSectionGroup[]` props 추가**, `INHERITANCE_PRINT_SECTIONS` 하드코딩 제거. id 타입 `string`.
- 헬퍼 `flattenPrintSectionIds`·`pdfEligibleIds`·`resolveGroupCheckState`·`selectPdfSections`(현재 `inheritance-print-sections.ts:115~157`)는 **groups 기본값이 `INHERITANCE_PRINT_SECTIONS`** → shared 이전 시 기본값 제거하고 **groups 명시 인자 필수**화(세목 혼선 차단). `resolvePrintVisibilityClass`만 groups 무관(id·selectedIds).
- 상속세 호출부는 `groups={INHERITANCE_PRINT_SECTIONS}` 명시 → 회귀 0 (anchor로 검증).

### D3. 양도세 `printScoped` 처리 — **단계 분리** (결정 필요, §8)
- **옵션 A (권장)**: 5세목(증여·취득·재산·종부 + 양도)에 PrintSelectionPanel 도입하되, **양도세는 별도 후속 PR**로 미룸. 양도세는 이미 작동하는 scope 인쇄 유지 → 회귀 0, 나머지 5세목 먼저 가치 전달.
- **옵션 B**: 양도세도 이번에 PrintSelectionPanel로 통일 — `printScoped`/CSS `data-print-scope` 제거, `data-print-section`→`data-print-id` 마이그레이션. 일관성↑이나 양도세 결과뷰 784줄 + 다건 + CSS 회귀 위험 大.
- → 양도세는 가장 복잡(다건·이월과세·필지·CSS scope)하므로 **마지막**에. 본 계획 주 범위는 **증여·취득·재산·종부 4세목**, 양도세는 옵션 결정 후.

### D4. 서버 PDF 필터 확대 + savedId 가드
- 각 세목 PDF 섹션(`PropertySection` 등)에 상속세 패턴(`selectedSectionIds.includes(...)`)으로 필터 추가. ⚠️ **UI 디자인 검토 U1 환류**: 취득·재산·종부의 ResultPdfDocument 섹션은 **단일 계산표**(내부 분리 경계 없음) → **세목당 pdf 채널 1개 대표 노드**(취득 `tax-detail`·재산 `computed-tax`·종부 `housing-tax`). 토지분 등은 단일 섹션이라 분리 불가 → 화면 인쇄만(거짓 선택 방지, PR-2 교훈). 증여세만 별지로 다수 pdf 채널.
- 서버 PDF 버튼은 **로그인+savedId** 필요(상속세와 동일). 각 세목 마법사가 `autoSave.savedId`를 결과뷰에 넘기는지 **확인 필요**(§8). 비로그인은 화면 인쇄(브라우저 PDF 저장)로 안내.

## 4. 공통화 아키텍처

```
lib/print/
  print-sections.types.ts     ← 신규: 제네릭 타입 + 헬퍼 (string id)
  inheritance-print-sections.ts ← 리팩토링: 타입·헬퍼 shared import (export 보존)
  gift-print-sections.ts        ← 신규
  acquisition-print-sections.ts ← 신규
  property-print-sections.ts    ← 신규
  comprehensive-print-sections.ts ← 신규
  transfer-print-sections.ts    ← 신규 (옵션 B 채택 시)

components/calc/results/
  shared/PrintSection.tsx       ← 제네릭화 (id:string)
  PrintSelectionPanel.tsx       ← groups props화

lib/pdf/  (증여세 별지 PDF 신규 — PR-B2)
  GiftFilingForm10PdfDocument.tsx   ← 신규: 별지10호 Page (화면 GiftTaxFilingFormTable 대응)
  GiftValuationFormPdfDocument.tsx  ← 신규: 부표1 Page (화면 GiftTaxValuationFormTable 대응)
  gift-besshi-pages.tsx             ← 신규: 증여세 별지 통합 위임(별지10호·부표1·주식 2종 재사용)
  ※ 주식 평가조서(ListedStock/UnlistedStockBesshiPages)는 PR-3b 기존 Page 재사용

lib/pdf/ResultPdfDocument.tsx   ← 각 세목 섹션에 selectedSectionIds 필터 확대
app/api/pdf/result/[id]/route.ts ← 변경 없음 (이미 POST {sections} 범용)
```

각 세목 결과뷰: `selectedPrintIds` state + `availablePrintIds` useMemo(렌더 가드 1:1) + `<PrintSelectionPanel groups={XXX_PRINT_SECTIONS} ...>` + 각 섹션 `<PrintSection>` 래핑. (상속세 `InheritanceTaxResultView` 패턴 복제)

## 5. 세목별 작업 범위 (예상 — leaf는 Design 단계 결과뷰 정독으로 확정)

> 각 세목 결과뷰의 렌더 가드 = 선택 leaf 후보. 아래는 탐색 기반 **예상**, Design에서 인벤토리 표로 확정.

### 5.1 증여세 (gift) — 상속세와 최유사, 단 별지 PDF는 부분 신규
- 예상 leaf: `core-result`·`tax-summary`·`prior-gift`·`gift-credit`·`gen-skip-surcharge`·`filing-form-10`(별지10호)·`valuation-form`(부표1)·`unlisted-stock-besshi`·`listed-stock-besshi`·`installment`·`warnings`.
- ✅ **긍정**: 결과뷰가 `window.print()`만 사용(`GiftTaxResultView.tsx:200`, printScoped/CSS scope 없음) → 양도세 같은 복잡성 없이 상속세 PrintSelectionPanel 패턴 **그대로 도입 가능**.
- ⚠️ **별지 PDF 실측 정정** (검토 #1): 증여세 별지 PDF는 "재사용"이 아니라 **혼합**:
  - **신규 react-pdf 필요 2종**: 별지10호(`GiftTaxFilingFormTable`)·부표1(`GiftTaxValuationFormTable`) — 화면 컴포넌트만 존재, `lib/pdf`에 증여세 전용 Document **없음**. 상속세 별지9호(PR-3a) 규모의 신규 포팅(화면 어댑터 재사용 + Page 신규).
  - **재사용 2종**: 주식 평가조서(`UnlistedStock`/`ListedStockBesshiResultSection` — 상속세와 동일 컴포넌트, PR-3b의 `ListedStockBesshiPages`/`UnlistedStockBesshiPages` Page 그대로 통합).
  - 증여세 PDF 본체는 `ResultPdfDocument`의 `InheritanceGiftSection` gift 분기(현재 계산 내역 표만) → 별지 Page는 상속세처럼 별도 추가.
- `savedId` 전달 확인 필요(§8 D4): SaveButton/autoSave 존재하나 결과뷰 prop 전달 미확인.

### 5.2 취득세 (acquisition)
- 예상 leaf: `core-result`·`tax-detail`(세액 명세)·`deemed-acquisition`·`surcharge-detail`·`reduction`·`installment`·`rate-scenario`·`steps`·`warnings`·`legal-basis`. (간주취득 분기로 다수 섹션 `!isDeemedAcquisition` 가드 — availableIds에 반영)
- 인쇄 버튼 자체가 없음 → 신규 추가.
- ⚠️ **결과뷰 2곳 렌더 (검토 #7)**: `AcquisitionTaxForm.tsx:252`·`:322` 두 분기에서 `AcquisitionTaxResultView` 렌더(추정: 간주취득/일반 또는 단계 분기 — Design 시 확인). **양쪽 모두 PrintSelectionPanel 적용** 필요(양도세 이중경로와 유사 주의).

### 5.3 재산세 (property)
- 예상 leaf: `tax-base`·`computed-tax`·`surtax`·`total-payable`·`installment`·`warnings`·`legal-basis`. (238줄, 단순)

### 5.4 종부세 (comprehensive)
- 예상 leaf: `aggregation-exclusion`·`housing-tax-base`·`housing-tax`·`aggregate-land`·`separate-land`·`grand-total`·`warnings`. (주택분/토지분 섹션 분리)

### 5.5 양도세 (transfer) — 옵션 B 채택 시만
- data-print-section(full/calculation/split-detail/phd/steps) + 다수 상세 카드. printScoped 7종을 leaf로 매핑. 다건(MultiTransferTaxResultView) 별도. **가장 큼**.

## 6. 단계적 PR 분할 (권장)

| PR | 내용 | 의존 |
|---|---|---|
| **PR-A** | 공통 제네릭화: `print-sections.types.ts` 추출 + `PrintSection`/`PrintSelectionPanel` props화 + 상속세 마이그레이션(회귀 0) | 선행 |
| **PR-B1** | 증여세 화면 인쇄 선택 출력 (레지스트리 + 결과뷰 래핑 + 서버 PDF 계산표 필터 + 주식 별지 2종 재사용 통합) | PR-A |
| **PR-B2** | 증여세 별지 PDF 신규 2종 (별지10호·부표1 react-pdf 포팅 + pdf 채널 승격) | PR-B1 |
| **PR-C** | 취득세 (인쇄 버튼 신규 + 레지스트리 + 래핑 + 계산표 PDF 필터) | PR-A |
| **PR-D** | 재산세 | PR-A |
| **PR-E** | 종부세 | PR-A |
| **PR-F** | (후속·D3) 양도세 printScoped→PrintSelectionPanel 통일 | PR-A |
> 증여세는 별지 신규(PR-B2)로 PR-3a 규모 작업이 추가되므로 화면 인쇄(PR-B1)와 분리. 취득·재산·종부는 별지 신규 없음(계산표 필터만) → 각 단일 PR.

각 PR: 레지스트리 anchor(PD 패턴) + 결과뷰 E2E(패널·0건 가드·print 가시성) + 전체 회귀. 단일 응답 완주 가능 크기.

## 7. 리스크 / 검증

- **제네릭화 회귀(PR-A)**: 상속세가 이미 동작 → props화 후 상속세 anchor·E2E 전부 GREEN 유지가 게이트. `INHERITANCE_PRINT_SECTIONS` export 경로 불변.
- **availableIds ↔ 렌더 가드 드리프트**: 세목마다 가드 복잡(취득세 간주취득 분기·종부세 토지분 조건). 결과뷰 JSX 가드와 1:1 매핑 필수 → 누락 시 패널에 빈 항목/선택 무효. anchor "레지스트리 id ⊆ DOM data-print-id".
- **양도세 이중 경로**: 마법사 + ResultDetailClient 양쪽 렌더 → 옵션 B 시 양쪽 다 패널 적용. 회귀 면적 큼.
- **서버 PDF 선택 단위 빈약**: 타 세목 PDF는 계산 내역 표 1개라 분할 선택 실익 낮음 → pdf 채널 노드 최소화, 화면 인쇄 위주. 거짓 선택 방지(PR-2 교훈).
- **세목별 별지 유무**: 증여세만 별지(10호·평가명세·주식)로 PDF 분할 의미 큼. 나머지는 단일.
- **(검토 #1) 증여세 별지 PDF 신규 작업량**: 별지10호·부표1은 react-pdf Document가 없어 신규 포팅(PR-3a 규모) — "재사용"으로 과소평가 금지. 주식 평가조서 2종만 재사용. PR-B2로 분리해 PR-B1(화면)과 회귀 격리.

## 8. 결정 사항 (모두 확정)

- [x] **D3 양도세**: **옵션 A** — 양도세는 본 계획 범위에서 제외(기존 `printScoped` 유지), 별도 후속 PR-F. 본 계획 주 범위 = **증여·취득·재산·종부 4세목**.
- [x] **적용 우선순위**: **증여 → 취득 → 재산 → 종부** (상속세 유사도·별지 가치 순).
- [x] **서버 PDF 범위**: **증여세는 별지 PDF까지 포함** — 별지10호·부표1은 **react-pdf 신규 포팅**(PR-B2, PR-3a 규모), 주식 평가조서 2종은 **상속세 Page 재사용**(§5.1 검토 #1). 취득·재산·종부는 PDF 선택 단위가 거칠어 **화면 인쇄 위주**(서버 PDF는 계산 내역 표 수준 필터만, 별지 신규 없음).
- [x] **ResultDetailClient 활성화**: **범위 제외**. 선택 출력은 4세목 모두 **마법사 결과뷰**에서만 동작(상속세와 동일). 저장이력 "준비중" 해제는 별도 작업.

## 9. 다음 단계 (PDCA)

1. **Design**: PR-A 공통 인터페이스 설계 + 세목별 케이스 인벤토리 표(렌더 가드→leaf, screen/pdf 채널). `_template` 복사.
2. **Pre-Do anchor**: PR-A 상속세 회귀(제네릭화 후 기존 anchor GREEN) + 세목 1개 "선택 0건→print:hidden".
3. **Do**: PR-A→B 순. 각 PR 단일 응답 완주.
4. **Check**: 세목별 E2E + 전체 회귀 + `ui-engine-sync-checker`(해당 시).
5. **Act**: 양도세 통일·ResultDetailClient 활성화 후속.
