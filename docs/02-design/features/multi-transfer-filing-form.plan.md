# 다건 양도세 결과탭 상단 신고서 양식 (합계 + 자산별) — 계획서

- **작성일**: 2026-07-06
- **세목**: 양도소득세(transfer) 다건(multi/aggregate)
- **요청**: 다건 계산 결과탭에 단건과 마찬가지로 **맨 위에 신고서 양식**을 출력. 컬럼 = **합계 · 자산1 · 자산2 …**
- **인터뷰 결정**:
  - Q1 배치/중복 → **기존 유지 + 위에 추가** (단건과 동일 패턴, 합산 요약 카드·자산별 아코디언 그대로 존치)
  - Q2 출력 범위 → **인쇄·PDF 모두 포함**

---

## 1. 핵심 결론 — 신규 엔진/타입 작업 0

조사(Explore 2건 + 실측) 결과, 목표 달성에 필요한 인프라가 **이미 완비**되어 있고 일부는 다른 화면에서 검증되어 동작 중이다.

| 인프라 | 상태 | 위치 |
|---|---|---|
| 자산별 개별 결과 배열 | ✅ 완전 보존 | `AggregateTransferResult.properties[]` (`lib/tax-engine/types/transfer-aggregate.types.ts:254`) |
| 합계+자산별 **가로 컬럼** 신고서 표 | ✅ 구현됨 (aggregate 모드) | `FilingFormTable` + `FilingFormTableAggregateHelpers.ts:25` `buildAggregateRows` |
| 합계 열 어댑터 | ✅ export됨 | `aggregateToFilingResult` (`BundledAllocationCard.tsx`) |
| 동일 패턴 실동작 레퍼런스 | ✅ | `BundledAllocationCard.tsx:546-577` (묶음매매 케이스) |
| `aggregateMeta` 구성 예시 | ✅ **이미 이 파일 안에 존재** | `MultiTransferTaxResultView.tsx:713-718` (detailed-statement에서 사용 중) |
| PDF 합산+자산별 신고서 양식 | ✅ 이미 렌더 (세로형) | `ResultPdfDocument.tsx:321` "합산 신고서 양식", `:361` "자산별 신고서 양식" |

→ **작업의 본질은 "화면 상단에 aggregate FilingFormTable 한 블록을 배선 + PrintSection/PDF 채널 등록"**. 계산 로직·엔진·result 타입은 손대지 않는다. (memory `feedback_ui_engine_dual_truth_avoidance` 준수 — UI 재계산 없이 엔진 어댑터 재사용)

---

## 2. 현재 vs 목표

### 현재 `MultiTransferTaxResultView` 렌더 순서 (`:684-758`)
1. `AmendmentResultCard` (수정신고 hero, 조건부)
2. `PrintSelectionPanel`
3. **`summary`** → `MultiTransferTaxSummaryCard` (17행 단순 합계 요약, 자산별 컬럼 없음)
4. `detailed-statement` → `DetailedCalculationStatementCard` (aggregate 메타 주입, 32항목 산식 명세)
5. `reduction-recalc` / `group-tax` / `loss-offset`
6. `per-property` → 자산별 `PropertyBreakdownAccordion` (아코디언 내부에 자산별 **단건** FilingFormTable)

### 목표 순서 (신규 `form-table` 삽입)
1. `AmendmentResultCard` (그대로)
2. `PrintSelectionPanel` (그대로)
3. **🆕 `form-table` → `FilingFormTable` aggregate 모드, `title="신고서 양식 (합산)"` (합계 | 자산1 | 자산2 … 가로 컬럼)** ← 첫 콘텐츠 섹션
4. `summary` (그대로 유지)
5. 이하 전부 그대로

> title 접미 "(합산)": per-property 아코디언 내부 자산별 단건 `FilingFormTable`도 기본값 `"신고서 양식"`을 쓰므로(`:503`, title 미전달), 상단 합산 표는 `"신고서 양식 (합산)"`로 구분해 중복 표기 회피 (검토 C4).

→ 단건 `TransferTaxResultView`가 `form-table`을 첫 콘텐츠 섹션으로 두는 구조(`TransferTaxResultView.tsx:183`)와 대칭.

---

## 3. 변경 지점 (4개 파일)

### ① `lib/print/multi-transfer-print-sections.ts` — leaf 등록
- `MultiTransferPrintSectionId` union에 `"form-table"` 추가 (6종 → 7종)
- `MULTI_TRANSFER_PRINT_SECTIONS`의 `group:summary` children **맨 앞**에
  `{ id: "form-table", label: "신고서 양식", channel: SCREEN_PDF }` 삽입
- 파일 상단 주석(line 13-14 "pdf 채널 = summary 1종") → "form-table·summary 2종"으로 정정

### ② `components/calc/results/MultiTransferTaxResultView.tsx` — 화면 배선
- `availablePrintIds`(`:660`) Set에 `"form-table"` 추가
- **sub-component 추출** (검토 C2 — 현재 775줄, 800줄 회피): 상단 신고서 양식 블록을 `MultiTransferFilingFormSection`로 분리한다. 상단 블록을 MultiView 밖으로 빼므로 본체 라인이 순증하지 않는다.
  - ⚠️ **detailed-statement의 기존 IIFE(`:713-728`)는 불변**(STEP 3 blast-radius): "form-table·detailed-statement 공유"로 detailed-statement를 리팩터하면 surgical 원칙 위반 + 회귀 위험. `aggregateToFilingResult`는 경량 순수함수라 이중호출 무해 → **상단 sub-component만 자체 계산, detailed-statement는 건드리지 않는다.**
  - 신규 파일 또는 동일 파일 내 sub-component `MultiTransferFilingFormSection({ result, properties })`:
    ```tsx
    // aggregateMeta 1회 계산 (detailed-statement와 공유 — 이중계산 제거)
    const adapted = aggregateToFilingResult(result);
    // ownershipMap / landNatureMap — multi 구조 변환 차용 (검토 C1, ↓§3-④)
    const ownershipMap = new Map<string, { numerator: number; denominator: number }>();
    const landNatureMap = new Map<string, "appurtenant" | "standalone">();
    for (const p of result.properties) {
      const asset = properties.find((x) => x.propertyId === p.propertyId)?.form?.assets[0];
      // asset에서 지분·토지성격 도출해 p.propertyId key로 put (자산2 이후 포함 전체 순회)
    }
    const aggregateMeta = { properties: result.properties, aggregated: result, ownershipMap, landNatureMap };
    return (
      <FilingFormTable result={adapted} aggregate={aggregateMeta}
        formData={properties[0]?.form} title="신고서 양식 (합산)" />
    );
    ```
- `PrintSelectionPanel` 직후·`summary` PrintSection **앞**에 `<PrintSection id="form-table" selectedIds={selectedPrintIds}><MultiTransferFilingFormSection .../></PrintSection>` 삽입
- import 추가 **불필요** (검토 C6): `FilingFormTable`(`:19`)·`aggregateToFilingResult`(`:22`)·`PrintSection`(`:25`) 3종 모두 이미 import됨
- ⚠️ `ownershipMap`은 **firstProperty 기준 금지** — 반드시 `result.properties` 전체 순회로 구성(자산2 이후 라벨 소실 방지, 검토 C1·모순 #2)

### ③ `lib/pdf/ResultPdfDocument.tsx` — PDF 채널 확장 (회귀 0)
- `TransferMultiSection` gating(`:296`)을 **OR**로 확장:
  ```ts
  // 기존: summary 미포함 시 null
  // 변경: summary·form-table 둘 다 미포함일 때만 null
  if (selectedSectionIds !== undefined
      && !selectedSectionIds.includes("summary")
      && !selectedSectionIds.includes("form-table")) return null;
  ```
  - 단일 컴포넌트 렌더라 summary·form-table 동시 선택해도 **중복 없음**
  - `summary`만 선택 → 기존과 동일 렌더 → **회귀 0**
  - `form-table` 선택 → PDF에 합산+자산별 신고서 양식 출력 (신규)
- **PDF 신고서 양식의 1차 소유 leaf = `form-table`**; `summary`는 회귀호환 별칭(기존 summary-only PDF 사용자 무손실). 의미만 고정, 구현 영향 없음 (검토 C5).
- ⚠️ PDF는 react-pdf 폭 제약상 화면처럼 "합계|자산1|자산2" **가로 다컬럼**이 아니라, 기존 **세로형(합산 표 → 자산별 표 순차)** 유지. 자산 다수 시 페이지 폭 초과 방지. (화면=가로 컬럼 / PDF=세로 순차 — **동일 `result`에서 파생**, dual-truth 아님. 표현만 매체별 최적화) **사용자 확정 (2026-07-06).**

### ④ `ownershipMap` / `landNatureMap` 구성 — **구조 변환 차용 (High, 검토 C1)**
- `AggregateMeta`의 optional 필드, 타입 = **`Map<propertyId, ...>`** (plain object 아님):
  - `ownershipMap?: Map<string, { numerator: number; denominator: number }>`
  - `landNatureMap?: Map<string, "appurtenant" | "standalone">`
- ⚠️ **`BundledAllocationCard.tsx:539-544`를 "그대로" 차용 금지**: Bundled은 **1 formData + N `assets[]`** 구조라 `assetId === "primary"` 하드코딩 매칭을 쓴다. multi는 **N개 개별 filing**이고 `propertyId = generatePropertyId()`(store:167)라 **"primary"가 절대 안 나오며**, 각 property가 자기 `.form`을 가진다. 패턴을 그대로 쓰면 `find`가 전부 `undefined` → 지분·토지성격 라벨이 **침묵 소실**(크래시 없음, memory `feedback_bundled_primary_assetid_hardcoded`).
- **multi 구조 변환**: `result.properties` 전체를 순회하며 `properties.find(x => x.propertyId === p.propertyId)?.form?.assets[0]`에서 자산 접근 → `p.propertyId`를 key로 두 맵에 put. (§3-② 코드 스켈레톤 참조)
- 맵 부재 시 `FilingFormTableHelpers.ts:145`가 `label = p.propertyLabel` 기본값으로 graceful → MVP 렌더는 안전하나, 자산 구분 가독성을 위해 **구성 권장**. Pre-Do anchor에서 라벨 실렌더 확인.

---

## 4. 케이스 매트릭스 (화면 aggregate 표 렌더 검증 대상)

| # | 케이스 | 기대 |
|---|---|---|
| C1 | 자산 2건, 동일 세율군 | 합계 + 자산1 + 자산2 3컬럼, 32행 |
| C2 | 자산 3건 이상 | 컬럼 증가. 가로 스크롤은 `FilingFormTable` **내장**(`:62,127,155` `overflow-x-auto`+`sticky left-0`) → `HorizontalScrollContainer` **불필요**(검토 U5, 단건·Bundled과 일관) |
| C3 | 자산 중 비과세 1건 포함 | 비과세 자산 컬럼 처리 (rose/echo 필드) |
| C4 | 세율군 2개 이상 (방법 B) | 합계 컬럼이 방법 B 반영 (aggregateToFilingResult 책임) |
| C5 | 차손 통산 발생 | 자산별 컬럼에 통산 반영 (기존 aggregate 빌더 책임) |
| C6 | 수정신고/경정청구 모드 | amendment hero 유지 + 신고서 양식 정상 |
| C7 | 인쇄 (form-table만 선택) | 화면 인쇄에 가로 컬럼 표만 |
| C8 | PDF (form-table 선택) | PDF에 합산+자산별 세로 신고서 양식 |
| C9 | PDF (summary만 선택) | **기존과 동일** (회귀 0 검증) |

---

## 5. Pre-Do Anchor (Do 진입 전 우선 실행 — memory `feedback_pre_anchor_verification`)

"현행 일치 예상" 가정 금지. 아래를 Do 착수 전 먼저 확인한다:

1. **실렌더 스모크**: 다건 2자산 결과에 `FilingFormTable aggregate` 블록을 임시 삽입 → 합계+자산별 컬럼이 실제로 그려지는지, `formData`/`ownershipMap` 없이도 깨지지 않는지 확인. (조사 기반 가정의 실증)
2. **E2E**: 기존 다건 E2E(`e2e/` 다건 스펙) 패턴 재사용. ⚠️ **assert 대상 특정 주의**(검토 C3): `FilingFormTable`이 자체 `data-print-section="form-table"`를 부착하고 per-property 아코디언에 자산별로 N개 더 존재 → 마커가 상단 1 + N 공존. **첫 매치가 상단 합산 표가 아닐 수 있다.** assert는 `PrintSection id="form-table"` 래퍼(`data-print-id`) 또는 `title="신고서 양식 (합산)"` 텍스트로 **상단 합산 표를 명시 특정**하고, "summary 요약 카드보다 DOM 앞에 위치"를 검증. (memory `feedback_browser_verify_with_playwright` — 수동 안내 금지)

---

## 6. 회귀·검증 게이트

- [ ] `npx tsc --noEmit` 0건
- [ ] `npx vitest run __tests__/tax-engine/transfer/` (엔진 무변경이므로 전건 유지 확인)
- [ ] 다건 E2E 통과 + 신규 form-table assert
- [ ] PDF C9(summary만) 회귀 0 — react-pdf 스냅샷/수동
- [ ] 800줄 정책: `MultiTransferTaxResultView.tsx` 현재 **775줄** → 상단 블록을 `MultiTransferFilingFormSection` sub-component로 추출(§3-②)하여 본체 라인 순증 억제. 추출 후 본체·신규 sub 둘 다 800 이하 확인
- [ ] `PrintSelectionPanel`에 "신고서 양식" 항목 노출 + 선택 동작

---

## 7. 열린 설계 판단 (계획 검토 시 확인받을 항목)

1. **PDF gating OR 방식** (§3-③): summary·form-table 어느 쪽을 선택해도 PDF에 신고서 양식이 나오게 함 → 회귀 0이 최우선. 대안(신고서 양식을 summary에서 완전 분리)은 기존 summary-only PDF 사용자에게 회귀 유발하므로 배제. **확정** (form-table=1차 소유, summary=회귀호환 별칭, 검토 C5).
2. **PDF 세로형 유지** (§3-③): 화면=가로 컬럼, PDF=세로 순차. 매체별 최적화. **사용자 확정 (2026-07-06).**
3. **`ownershipMap` 라벨 suffix**: **구성 확정** — multi 구조 변환 차용(§3-④, 검토 C1). 라벨 실렌더만 Pre-Do anchor에서 확인.

### 검토로 종결된 열린 질문 (STEP 1)
- **접기/펼치기 토글**: 불필요 — 단건 form-table도 토글 없이 항상 표시. **항상 표시 확정** (검토 U4).
- **가로 스크롤 래퍼**: 불필요 — `FilingFormTable` 내장 (검토 U5).
- **`formData={properties[0]?.form}`**: aggregate 모드에서 라벨 fallback만 영향(합계=result·자산별=properties 파생), 유지 무해 (검토 I2). 실질 라벨 소스는 §3-④ 두 맵.
