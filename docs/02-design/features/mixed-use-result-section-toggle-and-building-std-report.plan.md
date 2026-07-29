# 겸용주택 결과뷰 — 세션별 접기/펼치기 + 건물 기준시가 계산서 결과탭 출력

> 작성일 2026-07-17 · 대상: 겸용주택(mixed-use) 양도소득세 결과뷰
> 상태: **계획(Plan) rev.2** — 아래 file:line은 전부 현재 코드 실측. Do 진입 전 pre-anchor 우선.
> rev.2 변경(2026-07-17): 조건부 카드(공익수용·용도변경·LTHD 분할) 3종을 접기/펼치기 대상에 **포함**(사용자 지시). §3 1-C 신설·§5·§6·§9·자가검토(§10) 갱신.

## 1. 배경 · 현황 (실측)

### 1.1 결과뷰 실제 구조

겸용주택 결과뷰는 `MixedUseResultCard`(`components/calc/results/mixed-use/MixedUseResultCard.tsx`, 현재 750줄)가 단독 담당하며, 진입점은 `app/calc/transfer-tax/TransferTaxCalculator.tsx:489-491`(`result.mode === "mixed-use"` 분기, 단건 `TransferTaxResultView`를 **우회**).

최상위는 `PrintSelectionPanel` 1개 + `PrintSection` 3개로만 구성된다:

| 사용자 이미지 | PrintSection | 위치 | 내용 |
|---|---|---|---|
| 이미지 1 상단 표 | `id="filing-form"` | `MixedUseResultCard.tsx:116-140` | `FilingFormTable` = 신고서 양식 32행 (5열) |
| 이미지 1 하단 카드 | `id="calculation"` | `MixedUseResultCard.tsx:143-468` | 분리계산 본문(①안분·②주택·③상가·④비사업용·합산세액 + 조건부 카드) |
| **이미지 2** | `id="detailed-statement"` | `MixedUseResultCard.tsx:472-478` | `DetailedCalculationStatementCard` = 상세명세서(1~7단계 GroupSection) |

**핵심 정정**: 사용자 이미지 2의 "2단계 장기보유특별공제 / 3단계 양도소득금액 / 5단계 세액산정 / 6단계 가산세 / 7단계 부가·지방세" 단계 카드는 별개 화면이 아니라 **세 번째 PrintSection(상세명세서)** 내부의 `GroupSection`(`DetailedCalculationStatementCard.tsx:223-253`)이다. 단계 정의는 `DetailedStatementHelpers.ts`의 `STATEMENT_GROUPS`.

### 1.2 `calculation` PrintSection 내부(이미지 1 하단) 세부

전부 `bg-card` 무채색 `ResultSection`(`MixedUseResultCard.tsx:532-550`, **토글 없음**) 또는 안내 div:

| 세션 | 위치 | 조건 |
|---|---|---|
| (조건부) 수정신고 hero `AmendmentResultCard` | `:146-151` | `breakdown.amendmentDetail` — **자체 토글 보유** |
| (조건부) 공익수용 `MixedUseExpropriationValuationCard` | `:153-155` | `breakdown.expropriationDetail` |
| (조건부) 경고 div | `:157-161` | `breakdown.warnings.length > 0` |
| (조건부) 일부 용도변경 `PartialUsageChangeCard` | `:164-169` | `breakdown.partialUsageChange` |
| (조건부) 용도변경 LTHD 분할 `UsagePeriodSplitCard` | `:172-177` | `breakdown.usagePeriodSplit && partialUsageChange` |
| 1세대1주택 비과세 안내 div | `:180-195` | 항상 |
| ① 양도가액 안분 `ResultSection` | `:198-227` | 항상 |
| ② 주택부분 `ResultSection` | `:230-321` | 항상 (장특공제·양도소득금액 Row 포함) |
| ③ 상가부분 `ResultSection` | `:324-366` | 항상 |
| ④ 비사업용토지 `ResultSection` | `:369-399` | 조건부 |
| 합산 세액 `ResultSection` | `:402-464` | 항상 (기본공제·산출세액·가산세·지방세·총납부 Row 포함) |
| 계산 경로 메타 `CalculationRouteCard` | `:467` | 항상 |

### 1.3 상세명세서(이미지 2) 현황

`DetailedCalculationStatementCard`(`components/calc/results/transfer/DetailedCalculationStatementCard.tsx`)는 **단건·다건·겸용이 공유하는 공용 컴포넌트**다. 소비처:
- 겸용: `MixedUseResultCard.tsx:473`
- 단건: `TransferTaxResultView`
- 다건: `MultiTransferTaxResultView` 계열

`GroupSection`(`:223-253`)은 tone별 색상 카드(§배지 + `group.title`)이며 **접기/펼치기 없음**. 내부 `ItemRow`(`:257-`)만 `hasPerAsset`일 때 자산별 미세 토글. 이미 `expandToggleClass`/`expandToggleLabel` import(`:22`) 사용 중이고, `EngineStepsSubToggle`(`:156-`)이 헤더 클릭 + `open ? "block" : "hidden print:block"` 표준 패턴을 이미 구현.

### 1.4 건물 기준시가 계산서 현황

`BuildingStdPriceReportSection`(`components/calc/results/BuildingStdPriceReportSection.tsx`, 97줄)은 스냅샷 스토어(`useBuildingStdSnapshotStore`)에서 `inputData` 소속 스냅샷을 클라이언트 재유도해 국세청 서식(`NtsBuildingStdPriceReport`)으로 출력. 현재 소비처는 **단건·상속·증여 결과뷰뿐**:
- `TransferTaxResultView`(`inputData={{ assets: formData?.assets }}`)
- `GiftTaxResultView` / `InheritanceTaxResultView`(`inputData={{ estateItems }}`)

**겸용 결과뷰(`MixedUseResultCard`)는 이 컴포넌트를 import·렌더하지 않음**(751줄 참조 0건). `availablePrintIds` 하드코딩 3종(`:86-89`)에 `building-std-report` 없음. `lib/print/mixed-use-print-sections.ts`에도 leaf 없음.

**스냅샷 생성은 이미 됨**: 겸용 입력폼 `MixedUsePreHousingDisclosureSection` → `ThreePointStandardPriceInput`(`enableBatchCalc`, `stdPriceSnapshotPrefix={`bsp-${asset.assetId}-phd`}`) → `PhdBuildingStdPriceModalButton` `handleApplyAll` → `replaceSnapshotsByPrefix(prefix, phdBatchToSnapshots(...))`가 `bsp-{assetId}-phd-{acq|first|transfer}[-commercial]` 스냅샷을 스토어에 저장. **소비처(결과뷰 렌더)만 끊겨 있어** 화면·PDF 어디에도 나오지 않는다.

소속 판정: `hasBuildingStdReport(inputData)`(`BuildingStdPriceReportSection.tsx:22-32`)가 `idOfSnapshotKey(key)`(`lib/calc/building-std-snapshot-keys.ts`)로 키에서 `assetId`를 뽑아 `JSON.stringify(inputData).includes(id)` 판정. 겸용 스냅샷 키 접미사 `-phd-{...}`는 정규식으로 제거되어 `bsp-{assetId}`→`assetId`가 남으므로, `inputData={{ assets: formData?.assets }}`에 `assetId`가 포함되면 매칭된다(단건 결과뷰와 동일 형태 — **Do 시 assetId 매칭 재확인**).

## 2. 목표 · 성공 기준

1. 겸용 결과뷰에서 **신고서 양식(filing-form)을 제외한 모든 세션**에 접기/펼치기 버튼. (사용자 확정: 계산 세션 + 상세명세서 단계 **둘 다**, 기본 **펼침**)
2. 건물 기준시가 계산서를 겸용 결과뷰에 배선해 화면 + (브라우저) PDF로 출력.
3. 표준 준수: 모든 토글은 `ExpandToggleButton`/`expandToggleClass`/`expandToggleLabel` 단일 출처, 본문은 `open ? "block" : "hidden print:block"`(인쇄 항상 펼침).
4. 회귀 0: 엔진·API·계산값 무변경(순수 UI). 상세명세서 공용 변경은 단건·다건 회귀 검증 통과.

## 3. 작업 1 — 세션별 접기/펼치기

### 1-A. `calculation` 계산 카드 토글 (겸용 전용)

`ResultSection`(`MixedUseResultCard.tsx:532-550`)에 접기 기능 내장:
- `useState(open, 기본 true)` 추가. 헤더(title + basis)를 클릭 영역으로 하거나, 우측에 `ExpandToggleButton` 배치. `ResultSection`은 `bg-card` 무채색이므로 tone은 `slate` 고정(색상 카드 아님).
- 본문 `children`을 `<div className={open ? "block" : "hidden print:block"}>`로 래핑.
- 적용 대상: ① 양도가액 안분 · ② 주택부분 · ③ 상가부분 · ④ 비사업용토지 · 합산 세액 (모두 `ResultSection` 사용 → **컴포넌트 1곳 수정으로 5개 동시 적용**).

보조 카드 처리 방침:
- `AmendmentResultCard`: 이미 자체 토글 → **무변경**.
- `CalculationRouteCard`(`:501`, 계산 경로 메타, tone `blue`): "왜 이 세액인지" 학습용 → 접기 대상 포함. `ResultSection`이 아니므로 아래 1-C와 동일한 독립 `ExpandToggleButton` 패턴 적용.
- 1세대1주택 비과세 안내 div(`:180`), 경고 div(`:157`): 단문 안내(1~2줄) → 접기 미적용(현행 유지).

### 1-C. 조건부 특수 카드 토글 (rev.2 — 사용자 지시 포함)

세 카드 모두 **헤더가 이미 `flex ... justify-between` + 우측 배지** 구조라, 헤더 전체 클릭(중첩 button 금지)이 배지와 충돌한다. → **독립 `ExpandToggleButton({open, onClick, tone})`을 헤더 우측 배지 묶음 옆(또는 배지 아래 줄)에 배치**하는 방식으로 통일. 본문(제목·배지 아래 전부)을 `open ? "block" : "hidden print:block"`로 래핑. 각 카드에 `useState(open, 기본 true)`.

| 카드 | 위치 | tone | 제목 |
|---|---|---|---|
| 공익수용 `MixedUseExpropriationValuationCard` | 별도 파일 `.../mixed-use/MixedUseExpropriationValuationCard.tsx:43-61`(루트 `:45` amber) | `amber` | `:47` |
| 일부 용도변경 `PartialUsageChangeCard` | `MixedUseResultCard.tsx:592-667`(루트 `:603` amber, 헤더 flex `:604`+배지 `:608-624`) | `amber` | `:605` |
| 용도변경 LTHD 분할 `UsagePeriodSplitCard` | `MixedUseResultCard.tsx:674-`(루트 `:687` violet, 헤더 flex `:688`+배지 `:692-694`) | `violet` | `:689` |

- tone `amber`·`violet`·`blue`(계산경로)·`slate`(ResultSection) 전부 `ExpandToggleButton` 표준 tone 7종(`sky·violet·slate·rose·emerald·amber·blue`, 메모리 `feedback_result_expand_toggle_standard`)에 **존재 → `EXPAND_TONE_CLASS` 추가 불필요**(Do 시 grep 최종 확인).
- `PartialUsageChangeCard`의 `isCommToHouse` "⚠ 법령 적용에 보수 검토 필요" 배지(`:619-623`)는 접힘 상태에서도 사용자가 봐야 하는 신호 → **헤더(항상 표시)에 유지**, 본문만 접는다.

### 1-B. `detailed-statement` 단계 토글 (전 세목 공통 — 사용자 확정)

`GroupSection`(`DetailedCalculationStatementCard.tsx:223-253`)에 접기 기능 내장:
- `useState(open, 기본 true)`. 헤더(§배지 + `group.title`) div를 클릭 영역(중첩 `<button>` 금지 — `expandToggleClass`를 `<span>` 배지로). tone은 `group.tone`(sky/emerald/amber/violet/rose/slate) 그대로 `ExpandTone`에 매핑(모두 `EXPAND_TONE_CLASS` 표준 tone에 존재).
- 본문(`items.map` 컨테이너)을 `open ? "block" : "hidden print:block"`.
- **영향 범위**: 단건·다건·겸용 결과뷰의 상세명세서 1~7단계 GroupSection 전부. → 회귀 검증에 단건·다건 결과뷰 포함 필수.

## 4. 작업 2 — 건물 기준시가 계산서 겸용 결과뷰 배선

순수 UI 배선(엔진·API·스냅샷 생성 무변경). 단건 결과뷰 패턴을 그대로 복제:

1. **타입**: `lib/print/mixed-use-print-sections.ts`
   - `MixedUsePrintSectionId`(`:35-38`)에 `"building-std-report"` 추가.
   - `MIXED_USE_PRINT_SECTIONS`(`:47-63`) `group:forms` children에 `{ id: "building-std-report", label: "건물 기준시가 계산서", channel: SCREEN }` 추가.
2. **결과뷰**: `MixedUseResultCard.tsx`
   - import: `BuildingStdPriceReportSection`, `hasBuildingStdReport`.
   - `availablePrintIds`(`:86-89`)를 조건부로 확장: `hasBuildingStdReport({ assets: formData?.assets })` true면 `"building-std-report"` 포함. (단건 `TransferTaxResultView`와 동일 판정 로직)
   - 상세명세서 PrintSection(`:472-478`) 뒤(또는 신고서 양식 뒤)에 추가:
     ```tsx
     {hasBuildingStdReport({ assets: formData?.assets }) && (
       <PrintSection id="building-std-report" selectedIds={selectedPrintIds}>
         <BuildingStdPriceReportSection inputData={{ assets: formData?.assets }} />
       </PrintSection>
     )}
     ```
3. **PDF**: 겸용은 서버 PDF 채널 0(`mixed-use-print-sections.ts:14-17` 주석). 계산서 출력은 기존 겸용 방식 그대로 **"선택 항목 인쇄"(window.print → 브라우저 PDF 저장)** + `print:block`으로 충족. `handlePrintPdf`(서버 PDF) 신설 안 함. → 사용자 "화면 및 PDF" 요구는 브라우저 PDF 저장으로 충족(단건 서버 PDF도 계산서는 SCREEN 채널이라 window.print 경로 동일).

**소속 필터 검증(Do 필수)**: 겸용 스냅샷 키 `bsp-{assetId}-phd-*` → `idOfSnapshotKey` → `assetId`가 `formData.assets[].assetId`와 일치해 `inputData` JSON에 포함되는지 실측 확인. 불일치 시 계산서 미표시(빈 렌더, graceful). 겸용 PHD 배치 스냅샷은 `taxType=inheritance_gift` valuation 모드로 재구성되어 `titleOverride`/`markCellOverride`(양도 맥락 정정)가 필요한데, 이는 `BuildingStdPriceReportSection` 내부 `reports` useMemo가 이미 처리 — 배선만으로 단건과 동일 동작하는지 pre-anchor로 확인.

## 5. 파일별 변경 목록

| 파일 | 변경 | 작업 |
|---|---|---|
| `components/calc/results/mixed-use/MixedUseResultCard.tsx` | `ResultSection`·`CalculationRouteCard`·`PartialUsageChangeCard`·`UsagePeriodSplitCard` 토글 내장 + 계산서 PrintSection·availableIds·import | 1-A, 1-C, 2 |
| `components/calc/results/mixed-use/MixedUseExpropriationValuationCard.tsx` | 공익수용 카드 토글 내장(amber) | 1-C |
| `components/calc/results/transfer/DetailedCalculationStatementCard.tsx` | `GroupSection` 토글 내장(tone→ExpandTone) | 1-B |
| `lib/print/mixed-use-print-sections.ts` | `building-std-report` leaf id + 레지스트리 | 2 |

**800줄 정책 (Do 실측 정정 — 추출 불요)**: rev.2는 "800줄 초과 확실시 → 서브컴포넌트 추출 Do 필수"로 예측했으나, **Do 실측 결과 토글 5종 + 계산서 배선 완료 후 `MixedUseResultCard.tsx` = 790줄로 800 이하**. 예측이 과대였음(토글당 ~4줄·계산서 배선 ~14줄, 총 ~40줄 → 750+40=790). → **`MixedUseResultSections.tsx` 추출 생략**. 서브컴포넌트는 기존대로 `MixedUseResultCard.tsx` 내부 유지. (향후 카드 추가로 800 근접 시 그때 추출.)

## 6. 케이스 매트릭스 (검증 대상)

| # | 케이스 | 기대 |
|---|---|---|
| C1 | 겸용 기본(12억 초과 안분) | ①②③·합산·계산경로 각 접기 토글, 기본 펼침. 신고서 양식 토글 없음(항상 펼침) |
| C2 | 비사업용토지 有 | ④ 카드도 접기 토글 |
| C3 | 상세명세서 1~7단계 | 각 GroupSection 접기 토글, 기본 펼침 |
| C4 | 접힘 상태 인쇄(window.print) | 모든 세션 `print:block`로 자동 펼침 |
| C5 | 겸용 PHD 배치 스냅샷 有 | 계산서 PrintSection 렌더 + 선택 패널 leaf 노출 |
| C6 | PHD 스냅샷 無 | 계산서 미렌더(availableIds 미포함), 선택 패널 leaf 없음 |
| C7 | 단건 결과뷰 상세명세서(회귀) | GroupSection 토글 동작, 기존 값·산식·per-asset 미세토글 무회귀 |
| C8 | 다건 결과뷰 상세명세서(회귀) | 동상 |
| C9 | 공익수용 특례 有(`expropriationDetail`) | `MixedUseExpropriationValuationCard` 접기 토글(amber), 기본 펼침 |
| C10 | 일부 용도변경 有(`partialUsageChange`) | `PartialUsageChangeCard` 접기 토글(amber). "⚠ 보수 검토 필요" 배지는 접힘에도 헤더 유지 |
| C11 | 용도변경 LTHD 분할 有(`usagePeriodSplit`) | `UsagePeriodSplitCard` 접기 토글(violet), 기본 펼침 |
| C12 | 서브컴포넌트 추출 후 | `MixedUseResultCard.tsx` 800줄 이하, 기존 렌더·값 무회귀(anchor·E2E) |

## 7. anchor · 검증 계획

- **Pre-Do anchor 우선**(정책 `pre-do-anchor-verification`): 
  1. 계산서 배선 — 겸용 PHD 스냅샷 시드 후 `hasBuildingStdReport({ assets })` true·`BuildingStdPriceReportSection` 인스턴스 렌더 anchor(RTL). "assetId 매칭·titleOverride 정상" 확인이 목적. **여기서 실패하면 소속 필터 형태를 Do 전에 정정.**
  2. GroupSection 토글 — 접힘 시 본문 `hidden print:block`, 펼침 시 표시 anchor.
- **회귀**: `npx vitest run __tests__/components/`(상세명세서 공용 변경 → 단건·다건 anchor 전수), 양도세 엔진 `npx vitest run __tests__/tax-engine/transfer-tax/`(무변경 확인).
- **E2E**(정책 `feedback_browser_verify_with_playwright`): 겸용 결과 화면 → 각 세션 접기/펼치기 클릭 → 인쇄 미리보기 자동 펼침 확인. 계산서 leaf 선택 출력. 셀렉터는 `data-print-id`(PrintSection)·표준 라벨 정규식(`/펼치기|접기/`) 사용.
- **tsc**: `npx tsc --noEmit` 0건.

## 8. 리스크 · 정책 준수

- **공용 컴포넌트 회귀(1-B)**: `DetailedCalculationStatementCard` 전 세목 공유 → 단건·다건 상세명세서 회귀가 가장 큰 리스크. anchor 전수 + E2E로 방어. 사용자가 "전 세목 공통 적용" 확정했으므로 prop 분기 없이 직접 내장.
- **표준 토글 단일 출처**(`feedback_result_expand_toggle_standard`): `ExpandToggleButton`/`expandToggleClass`/`expandToggleLabel`만 사용. 신규 lucide Chevron·인라인 화살표 금지. 자가 점검 grep 필수.
- **print-only-css-toggle**: `open ? "block" : "hidden print:block"` 단일 패턴, 토글 버튼 `print:hidden`. useEffect·isPrinting 상태 추적 금지.
- **엔진·API 무변경**: 14 동기화 지점 신규 없음(순수 표시). `feedback_no_silent_apportion_fallback`·mirror-pattern 무관.
- **금액 칼럼 정렬**: 계산서·상세명세서 기존 정렬 유지(변경 없음).

## 9. 범위 밖 (SCOPE OUT)

- 다건(bundled) `MultiTransferTaxResultView`에 계산서 배선 — 별건(메모리 `project_transfer_phd_3point_batch_stdprice` SCOPE OUT 유지). (상세명세서 GroupSection 토글은 공용 변경이라 다건에도 적용되나, 계산서 배선은 별개.)
- 겸용 서버 PDF(`ResultPdfDocument` mixed-use 섹션) 신설 — 현행 window.print(브라우저 PDF 저장) 유지.
- 1세대1주택 비과세 안내 div·경고 div 접기 — 단문이라 제외.
- 엔진·스냅샷 생성 로직·계산값 변경 일절 없음.

## 10. 자가 검토 (rev.2 — 오류·누락·모순·정책위반)

- **F1 (누락→반영)**: `PartialUsageChangeCard`·`UsagePeriodSplitCard`가 별도 파일이 아니라 `MixedUseResultCard.tsx` **내부** 정의임을 rev.1이 파일 목록에 누락 → §5에 반영. 공익수용만 별도 파일.
- **F2 (모순→해소)**: rev.1은 조건부 카드를 SCOPE OUT(§9)에 두면서 §6 매트릭스엔 미기재 → 사용자 지시로 포함, §9에서 제거하고 C9~C11 신설. 모순 해소.
- **F3 (정책 확인)**: 조건부 카드 tone(amber·violet)·계산경로(blue)·ResultSection(slate)이 전부 표준 tone 7종에 존재 → `EXPAND_TONE_CLASS` 신규 추가 불필요. rev.1 §5의 "필요 시 tone 추가" 항목은 삭제(불필요 판명).
- **F4 (Do 실측 정정)**: rev.2 계획 시 "800줄 초과 확실시"로 추출을 Do 필수로 승격했으나, **Do 실측 790줄(800 이하)** → 추출 불요로 재평가(§5 갱신). C12(추출 후 무회귀)는 추출 미실시로 **N/A**.
- **F5 (헤더 배지 충돌)**: 세 조건부 카드는 헤더에 이미 우측 배지가 있어 `ResultSection`식 헤더-전체-클릭 불가 → 독립 `ExpandToggleButton` 패턴으로 명시(§3 1-C). "보수 검토 필요" 경고 배지는 접힘에도 유지(C10).
- **F6 (검증 범위 재확인)**: 1-B(GroupSection)는 공용 → 단건·다건 회귀 필수(C7·C8, §7 유지). 1-A/1-C는 겸용 전용이라 겸용 anchor·E2E로 충분.
- **F7 (표준 준수)**: 모든 신규 토글 `ExpandToggleButton`/`expandToggleClass`/`expandToggleLabel` 단일 출처 + `open ? "block" : "hidden print:block"`. lucide Chevron·인라인 화살표 금지 — Do 후 자가 grep(`ChevronUp|ChevronDown|▶|▼|▲` in `components/calc/results/mixed-use/`) 0건 확인.
