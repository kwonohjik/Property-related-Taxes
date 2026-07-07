# 계획서 — 결과탭 「건물 기준시가 계산서」를 PHD 3시점 일괄 계산 경로까지 출력

- 세목: 양도소득세 (transfer)
- 상태: **Plan (착수 전)** · 작성 2026-07-07
- 관련 메모리: [[project_transfer_phd_3point_batch_stdprice]] · [[project_selective_print_6tax_series]] · [[feedback_engine_result_display_drift]] · [[feedback_print_leaf_add_unit_test_sync]] · [[mirror-pattern]]

---

## §0 목적 (한 줄)

건물 기준시가를 **3시점 일괄 계산기**로 산출한 경우에도, 그 산출 근거(신축가격기준액·구조/용도/위치지수·잔가율·면적·㎡당액)를 결과탭의 **국세청 「건물 기준시가 계산서」 서식**으로 출력해 계산 정확성을 검증할 수 있게 한다.

## §0.1 핵심 반전 (조사 결과)

**"기준시가계산서" 기능은 이미 존재한다.** 새로 만드는 것이 아니라, **PHD/일괄 경로에서만 끊겨 있는 파이프라인을 잇는 작업**이다.

이미 구현·배선된 것(실측):
- 화면 서식: `components/calc/results/BuildingStdPriceReportSection.tsx` → `NtsBuildingStdPriceReport` (국세청 서식). `TransferTaxResultView.tsx:499-501`에서 `<PrintSection id="building-std-report">`로 렌더.
- 선택 출력 leaf: `lib/print/transfer-print-sections.ts`의 `building-std-report`(`:66`, channel screen+pdf).
- PDF: `lib/pdf/BuildingStdReportPdfPages.tsx` + `lib/pdf/ResultPdfDocument.tsx` 게이트.
- 데이터: `useBuildingStdSnapshotStore`(sessionStorage) 스냅샷 → `calcBuildingStandardPrice`로 **클라이언트 재유도**. 이력 자동저장 시 `inputData.buildingStdSnapshots`로 동봉(`use-auto-save-calculation.ts:98-99`), 이력 복원 시 re-hydrate(`app/history/HistoryClient.tsx:264-271`).
- 엔진은 이미 인자별 상세(`BuildingStdPriceBreakdown`: `basePrice`·`structureIndex`·`usageIndex`·`locationIndex`·`residualRate`·`floorArea`·`pricePerM2`·`compositeBreakdowns`·`ancillaryApportionment`)를 반환(`lib/tax-engine/types/building-standard-price.types.ts:212-256`). **엔진·API 무변경.**

**결론: "현재 없어"의 원인은 기능 부재가 아니라, 일괄/PHD 경로가 스냅샷 파이프라인에 연결되지 않은 3개 갭이다.**

---

## §1 현재 상태 (실측, file:line)

| 경로 | 계산서 출력 여부 | 근거 |
|---|---|---|
| 일반건물(`GeneralBuildingBlock`)·상가(`CommercialBuildingBlock`) 필드별 모달 | ✅ 정상 | 키 `bsp-{assetId}-{gb\|cb}-{acq\|transfer}` → 정규식 매칭 → 렌더 |
| 상속·증여 재산 모달 | ✅ 정상 | 키 `bsp-estate-{id}` → 매칭 |
| PHD 필드별 모달 | (해당 없음) | `enableBatchCalc=true`로 **현행 UI 도달 불가**(C2) — 스냅샷 생성 자체 없음 |
| **PHD 3시점 일괄 모달**(`PhdBuildingStdPriceModalButton`) | ❌ 안 뜸 | GAP 1(스냅샷 저장 안 함) + GAP 2(키 인식) + C1(라벨) |
| 결과탭 **클라이언트 PDF 다운로드**(단건) | ❌ 빈 페이지 | GAP 3 (inputData 미전달) |
| 다건(bundled) 결과뷰 | (미지원) | building-std-report 자체 미배선 → SCOPE OUT(C3) |

## §2 문제 = 3개 갭 (모두 실측 확정)

### GAP 1 — 3시점 일괄 모달이 산출 근거를 저장하지 않음 (핵심)
`components/calc/building-std-price/PhdBuildingStdPriceModalButton.tsx`:
- `snapshotKey` prop 없음, `useBuildingStdSnapshotStore`/`saveSnapshot` 호출 없음(Props `:49-62`).
- 입력(`builtYear`·부분행 `rows`·시점별 `landPrices`)은 로컬 `useState`(`:92-100`).
- `handleApplyAll`(`:163-172`)은 **산출 금액만** `onApply`로 전달 후 닫힘.
- `handleOpen`(`:186-193`)은 열 때마다 입력을 리셋.
→ 일괄 계산으로 넣은 값의 구조·용도·연면적·신축연도·공시지가는 **모달을 닫는 즉시 소실**. AssetForm엔 최종 금액(원)만 남음(`lib/stores/calc-wizard-asset.ts`의 `phdBuildingStdPriceAt*`).
→ 게다가 일괄(`enableBatchCalc`) 활성 시 필드별 계산기 버튼은 숨김(`ThreePointStandardPriceInput.tsx` `hideBuildingCalcButton`) → 스냅샷을 남길 다른 경로도 없음.

### GAP 2 — 스냅샷 소속 판정 정규식이 `phd`·`-commercial` 키 미인식
동일 로직이 **2곳에 중복**(단일 출처 아님):
- `lib/storage/use-auto-save-calculation.ts:24-28` — `k.replace(/^bsp-/,"").replace(/-(gb|cb)-(acq|transfer)$/, "")`
- `components/calc/results/BuildingStdPriceReportSection.tsx:21-25` — 동일 `idOfSnapshotKey`

`bsp-{assetId}-phd-acq`·`bsp-{assetId}-phd-transfer-commercial` 등은 이 정규식에 매칭되지 않아 `id`가 `{assetId}-phd-acq`로 남고, `inputStr.includes(id)`가 항상 false(inputData엔 `{assetId}`만 존재) → **이력 동봉·결과 렌더에서 탈락**.

### GAP 3 — 결과탭 클라이언트 PDF가 inputData 미전달 → 빈 페이지
`components/calc/results/TransferTaxResultView.tsx:145-155` `handlePrintPdf`가 `downloadSelectedPdf`에 `resultData`만 전달. `ResultPdfDocument`의 building-std 블록은 `inputData`에서 재유도(`lib/pdf/ResultPdfDocument.tsx:788-794` → `lib/calc/building-std-pdf-data.ts`의 `buildBuildingStdReportsFromInput`)하므로, inputData 없으면 `[]` → 빈 렌더. (화면 인쇄·이력/서버 PDF 경로는 정상 — 이 갭은 결과탭 클라이언트 PDF 다운로드 전용.)

---

## §3 범위

### 확정 범위 (사용자 결정 2026-07-07: **전체 화면+PDF**)
GAP 1 + GAP 2 + GAP 3 **전부**. 결과: 3시점 일괄 및 PHD 필드별로 산출한 건물 기준시가가 결과탭에 국세청 계산서로 **화면·PDF 모두** 출력.
- 세목: **양도세 전용** (일괄 모달은 transfer PHD에서만 사용. 상증은 estate 키로 이미 정상).
- GAP 2 정규식 수정은 **일괄·PHD 필드별 두 경로를 동시에** 살린다(같은 키 네임스페이스).

### 대안(협소) — 필요 시 사용자 선택
- **A. 화면만**: GAP 1+2만, GAP 3(PDF) 제외 → 화면 인쇄는 되나 클라이언트 PDF 다운로드는 빈 페이지 유지.
- **B. 일괄만**: GAP 1만 + 정규식은 phd 일괄 키만 → PHD 필드별 경로는 계속 미출력(권장 안 함, 정규식은 어차피 phd 전체를 커버하는 게 자연스러움).

> 권장 = 전체. GAP 2는 정규식 1줄 수정으로 두 경로를 동시에 살리므로 협소화 실익이 없고, GAP 3까지 해야 "출력"이 화면·PDF로 완결된다.

### 명시적 SCOPE OUT
- **§164⑤ 3시점 환산 종합 계산서**(토지+건물 3시점을 묶어 `P_A_est = 최초공시주택가격 × sum취득/sum최초` 산식을 보이는 별지)는 이 계획 밖. 본 계획은 **각 시점 건물 기준시가의 산출 계산서**(구조×용도×위치×잔가율×면적)에 한정. (3시점 환산 자체는 `result.preHousingDisclosureDetail` 결과 카드가 별도 담당 — 후속 검토 항목.)
- 일괄 모달에 스냅샷을 **역복원(재오픈 시 입력 복원)** 하는 UX는 SCOPE OUT(후속). 본 계획은 저장→결과탭 렌더까지만. (필드별 모달의 `initialForm` 복원과 달리, 일괄 모달은 `handleOpen`이 리셋하므로 복원은 별도 설계 필요.)
- **≤2000년 취득 시점 계산서**(단일부분 acqBase 경로)는 후속. 배치의 `acqBaseStdPrice`는 `taxType:"transfer"`+`transferYear=2001` 고정 산식이라 valuation 모드 스냅샷으로 재현 불가(§4.1 C조건). 이 경우 **취득 시점만 계산서 생략**(최초공시·양도는 정상 표시)하고, 필요 시 transfer 모드 스냅샷으로 별도 지원. (다부분 ≤2000은 배치가 애초에 unsupported → 대상 없음.)
- **다건(bundled/multi) 결과뷰**는 SCOPE OUT(C3). `MultiTransferTaxResultView`는 building-std-report를 화면·PDF 모두 미배선 → 별도 후속(레지스트리 leaf 추가 + property별 assets 병합 + 화면 섹션 + PDF). 본 계획은 **단건(single) 양도세 결과뷰 전용**.

## §3.5 자가검토 결과 (2026-07-07, 실측 3건 종합)

**판정: 계획 유효 — 치명적 결함 0. 아래 정밀화를 §4에 반영.**

| # | 확인 항목 | 결과 |
|---|---|---|
| V1 | `toEngineInput`이 taxType을 강제하는가 | ❌ 강제 안 함(`building-std-price-form.ts:327`). `"inheritance_gift"` 세팅 가능 → 배치 호출과 동일형 재현 가능 |
| V2 | valuation(1시점)+compositeParts 공존 지원 | ✅ `toEngineInput:340·353` — valuation.landPricePerM2 + compositeParts 동시 세팅(배치 `:94-102`와 동형) |
| V3 | 재유도 계산서 합계 = 배치 적용금액 | ✅ `buildNtsReportModel`이 단일=`valuation.standardPrice`/복합=`compositeTotal` 그대로 → 일치(규율조건 준수 시) |
| V4 | 스냅샷 스토어 삭제 API | ❌ **없음**(`saveSnapshot` 단일, `building-std-snapshot-store.ts:16-19`) → stale 정리용 delete 액션 추가 필요 |
| V5 | `downloadSelectedPdf` inputData 수용 | ✅ **이미 `inputData?` 받음**(`TransferTaxResultViewHelpers.tsx:27`) → 시그니처 변경 불필요(R5 해소) |
| V6 | 클라이언트 PDF가 읽는 키 | `inputData.buildingStdSnapshots`(`building-std-pdf-data.ts:17`, **필터 없이 전량 렌더**) → 사전필터 스냅샷 전달 필요 |
| V7 | prefix 배선(단독·겸용) | ✅ 둘 다 `bsp-${assetId}-phd` 주입(`PreHousingDisclosureSection.tsx:172`·`MixedUsePreHousingDisclosureSection.tsx:224`) |
| V8 | GAP 2 정규식 안전성 | ✅ 정의 정확히 2곳, gb/cb/phd 전수 커버·estate 별도분기·회귀 0. `assetId`(`asset-{ts}-{idx}`) 오절단 불가 |
| V9 | `hasBuildingStdReport` 소비처 | 양도·증여·상속 3결과뷰(`TransferTaxResultView:165`·`GiftTaxResultView:213`·`useInheritanceResultDerived:79`) — 공유유틸화 시 자동 추종(estate 무영향) |

---

## §3.6 자가검토 2회차 (2026-07-07, 심층 재점검 — 표시·도달·다건)

**판정: 계획 유효하나 정정 3건·신규 설계 1건 추가.** 1회차가 놓친 표시/도달/범위 문제를 실측으로 포착.

| # | 발견 | 조치 |
|---|---|---|
| **C1** ⚠신규 | `NtsBuildingStdPriceReport` valuation(inheritance_gift) 제목은 **항상 "상속/증여 건물 기준시가 계산"**(양도 맥락 부정확), 취득/최초공시/양도 **시점 라벨 없음** — 연도(`valuationYear`)만 구분신호(`nts-report-adapter.ts:247`·`NtsBuildingStdPriceReport.tsx:17-29`) | **§4.5 신규**: 시점 라벨 + 양도 맥락 제목 확장 |
| **C2** ✏정정 | `enableBatchCalc`는 PHD에서 **항상 true**(`PreHousingDisclosureSection.tsx:174`·`MixedUsePreHousingDisclosureSection.tsx:222`) → 필드별 PHD 버튼 **항상 숨김** → 필드별 PHD 스냅샷 **현행 UI 생성 불가** | §4.2 "필드별 PHD도 살린다" 주장 **철회**. 정규식은 **GAP 1 배치 키 인식 전용** |
| **C3** ✏범위 | `MultiTransferTaxResultView`는 building-std-report를 **화면·PDF 전무**(레지스트리·availablePrintIds·PrintSection 없음) | **다건 SCOPE OUT**(후속). §4.3 다건 PDF 수정 철회 |
| **C4** ✅확인 | 복합 valuation은 부분별 행 정상 렌더(`fillBody`·`ReportEvalTable`), valuation part는 `usageNo`만(=`toCompositePart(_, false)`, `acqUsageNo` 무시) | 변경 불요 |
| Q4 | 헤더/소재지/토지/일자는 빈칸 graceful. **builtYear·valuationYear·구조/용도/공시지가는 계산성공 필수**(실패 시 스냅샷 통째 미표시, `BuildingStdPriceReportSection.tsx:55-60` try/catch) | §4.1 재구성이 이 필드 정확 세팅 — anchor(P2)가 담보 |

## §4 설계

### 4.1 GAP 1 — 일괄 모달이 시점×카테고리별 스냅샷 저장 (Option A: 스냅샷 패리티)

**원칙**: AssetForm/엔진에 산출 근거를 넣지 않는다(기존 아키텍처 준수 — 근거는 스냅샷 스토어 단일 책임). 일괄 모달이 **적용 시** 각 (시점, 카테고리)마다 `BuildingStdPriceFormState`를 재구성해 `saveSnapshot(key, snap)` 한다. 그러면 **기존 `BuildingStdPriceReportSection` 파이프라인이 그대로** 재유도·렌더.

- **키 규약**(기존 PHD 컨벤션 준수):
  - 주택: `bsp-{prefix}-{acq|first|transfer}`
  - 상가: `bsp-{prefix}-{acq|first|transfer}-commercial`
  - `{prefix}` = `ThreePointStandardPriceInput`가 이미 보유한 `stdPriceSnapshotPrefix`(`bsp-${assetId}-phd`)에서 `bsp-` 제거한 `${assetId}-phd`. → 일괄 모달에 **신규 prop `snapshotPrefix?: string`** 추가.
- **재구성 함수** `phdBatchToSnapshots(input, prefix): Record<string, BuildingStdPriceFormState>` (신규, `lib/calc/`): 각 산출된 (시점, 카테고리)마다 valuation 모드 `BuildingStdPriceFormState` 생성. 필드 세팅(실측 확정):
  - `taxType:"inheritance_gift"`, `compositeMode:(parts.length>1)`, `builtYear`, `valuationYear=point.year(문자열)`, `valLandPrice=point.landPricePerM2(문자열)`, `landParcelMode:false`, `isMechanicalParking:false`, `adjustmentMode:"manual"`, `adjustmentFeatures:null`.
  - 단일부분: `valStructureKey/valUsageNo=part`, `floorArea=part.floorArea`. 다부분: `compositeParts=parts.map(→CompositePartForm)`(각 `{structureKey,usageNo,floorArea}`, 조정필드 공란).
  - 키: `${prefix}-${point}` (주택) / `${prefix}-${point}-commercial` (상가). `prefix`=`bsp-${assetId}-phd`(그대로, `bsp-` 유지 — 정규식·추출이 `bsp-` 시작 요구).
- **재구성 규율 조건 4개(실측 — 위반 시 값 불일치)**:
  - **(A) 카테고리별 면적**: 단일부분에서 `floorArea`는 load-bearing(`building-std-price.ts:273`). 스냅샷 floorArea는 **해당 카테고리 부분 면적**(주택 소계/상가 소계)이어야 함 — 건물 전체 연면적 넣으면 불일치. (다부분은 top-level floorArea 무시, 각 part 면적 사용 → 안전.)
  - **(B) 시점당 1스냅샷**: inheritance_gift 폼은 valuation 단일시점만 담음 → 취득·최초공시·양도는 **각각 별도 스냅샷**(각기 다른 landPrice/year).
  - **(C) ≤2000 취득 = valuation 모드로 재현 불가**: 배치 `acqBaseStdPrice`는 `taxType:"transfer"`+transferYear=2001 고정. valuation 재구성은 validation(≥2001)에서 막힘 → **취득 시점 계산서 생략**(§3 SCOPE OUT) 또는 transfer 모드 스냅샷(후속).
  - **(D) Case A 상가 취득·최초공시 usageNo**: 배치가 `acqFirstUsageNo`(당시 주택 용도)로 매핑(`phd-building-std-batch.ts:195`). 스냅샷 part의 `usageNo`도 **그 시점 당시 용도값**(주택)이어야 동일 — 상가 용도번호 넣으면 다른 용도지수로 불일치. [[project_transfer_mixed_use_usage_change_acq_stdprice_usage_index]]
- **자기일관성(필수 anchor)**: `calcBuildingStandardPrice(toEngineInput(phdBatchToSnapshots(...)[key]))`의 합계(단일=`valuation.standardPrice`/복합=`compositeTotal`)가 **배치 적용 금액과 정확히 일치**해야 함(V3 확인). 위 A~D 규율을 anchor로 전 케이스 고정. [[feedback_engine_result_display_drift]]
- **스냅샷 정리(stale 방지)**: 스토어에 **삭제 API 없음(V4)** → `deleteSnapshot(key)` 액션 신규 추가. 적용 시 이번 산출 키만 저장하고, 같은 prefix의 이전 6키 중 미산출분은 삭제(부분 제거·시점 축소 시 잔존 계산서 차단).
- **배선(V7 확인)**: 일괄 모달에 신규 prop `snapshotPrefix?: string` 추가. `ThreePointStandardPriceInput`가 `snapshotPrefix={props.stdPriceSnapshotPrefix}` 전달(단독·겸용 모두 `bsp-${assetId}-phd` 주입 확인됨). 미주입 세션은 스냅샷 없이 종전 동작(무해).

### 4.2 GAP 2 — 정규식 확장 + 단일 출처화
- `idOfSnapshotKey`를 **공유 유틸로 추출**(예: `lib/stores/building-std-snapshot-store.ts` 또는 `lib/calc/building-std-price-form.ts`)하고 두 소비처(`use-auto-save-calculation.ts:27`·`BuildingStdPriceReportSection.tsx:24`)가 import → 중복 제거([[mirror-pattern]]).
- 정규식을 `phd`·`-commercial`·`first`까지 포함하도록 확장:
  `key.replace(/^bsp-/, "").replace(/-(?:gb|cb|phd)-(?:acq|first|transfer)(?:-commercial)?$/, "")`
  → 모든 `bsp-{assetId}-...` 키에서 `id = {assetId}` 도출. estate 분기는 유지.
- 영향: `hasBuildingStdReport`(`BuildingStdPriceReportSection.tsx:28-38`)도 같은 유틸을 쓰므로 자동 수정 → 일괄/PHD 자산이 `availablePrintIds`에 `building-std-report` 포함(패널 노출).
- **목적 정정(C2)**: 이 정규식 수정은 **GAP 1이 새로 쓸 배치 스냅샷 키(`bsp-{assetId}-phd-{point}[-commercial]`)를 인식시키기 위한 것**이다. (필드별 PHD 모달은 `enableBatchCalc=true`로 항상 숨겨져 현행 UI로 도달 불가 → "필드별 PHD를 살린다"는 별도 효과는 없음.) 즉 GAP 2는 **GAP 1의 전제조건**이며 단독으로는 사용자 가시 효과가 없다.

### 4.3 GAP 3 — 클라이언트 PDF에 사전필터 스냅샷 전달 (시그니처 변경 없음)
- `downloadSelectedPdf`는 **이미 `inputData?`를 받음**(V5, `TransferTaxResultViewHelpers.tsx:27` → `generateResultPdf`로 전달 `:40`). 클라이언트 PDF 렌더러 `buildBuildingStdReportsFromInput`는 `inputData.buildingStdSnapshots`를 **필터 없이 전량** 렌더(V6, `building-std-pdf-data.ts:17`).
- `extractRelevantBuildingStdSnapshots`(`use-auto-save-calculation.ts:15-31`)를 **export**(또는 공유 유틸로 이동)해 재사용.
- **단건 `TransferTaxResultView.tsx:146-155`만** `handlePrintPdf`에 사전필터 스냅샷 전달:
  `inputData: { buildingStdSnapshots: extractRelevantBuildingStdSnapshots({ assets: formData?.assets }) }`
  - `assets`는 PDF 렌더에 불필요(렌더러가 `buildingStdSnapshots`만 읽음). 필터 인자로만 사용.
- **다건 `MultiTransferTaxResultView`는 SCOPE OUT(C3)**: 화면에도 building-std-report를 렌더하지 않아(레지스트리·availablePrintIds·PrintSection·`hasBuildingStdReport` 전무) PDF만 고쳐도 무의미. 다건 지원은 후속(화면 섹션 추가 4단계 + property별 assets 병합 선행 필요).
- 전제: GAP 2(§4.2) 정규식 수정 후 phd 키가 `extractRelevantBuildingStdSnapshots`의 소속판정을 통과해야 추출됨.

### 4.4 leaf 동기화 (신규 leaf 아님 — 기존 `building-std-report` 재사용)
`building-std-report` leaf는 이미 존재하므로 **신규 leaf 추가·테스트 배열 변경 불필요**. 단, PHD/일괄 자산에서 `hasBuildingStdReport`가 true가 되면 기존 leaf가 자동 노출되는지 E2E로 확인. (`__tests__/print/transfer-print-sections.test.ts`의 `ALL_LEAVES`/`PDF_LEAVES`는 변경 없음.)

### 4.5 PHD 시점 라벨링 + 양도 맥락 제목 (C1 대응 — 신규 필수)
**문제(실측)**: valuation(inheritance_gift) 모드로 재유도하면 `NtsBuildingStdPriceReport`가 (a) 제목을 **"상속(또는 증여) 건물 기준시가 계산"** 으로 표기(양도세 결과에 부정확), (b) **취득/최초공시/양도 시점 라벨을 표시하지 않음**(연도만 구분) — `INSTANCE_TITLE`/`markCell`(`nts-report-adapter.ts:247`·`NtsBuildingStdPriceReport.tsx:17-29`)에 시점·양도 항목이 없음.

**설계(최소 침습)**: 시점·세목 라벨을 스냅샷 **키에서 도출**해 `BuildingStdPriceReportSection`이 각 계산서 위에 **헤딩**으로 렌더.
- `BuildingStdPriceReportSection`은 이미 각 스냅샷의 `key`를 알고 있음(`:52` `for (const [key, snap] of ...)`). 키 suffix로 라벨 도출:
  `-phd-acq`→"취득시", `-phd-first`→"최초공시일", `-phd-transfer`→"양도시", `+-commercial`→" (상가분)" / 없으면 "(주택분)".
- 각 `NtsBuildingStdPriceReport` 위에 `<h_ >양도소득세 · 취득시 (2003년) 건물 기준시가 계산서</h_>` 헤딩 삽입. 연도는 `snap.valuationYear`.
- 재구성 스냅샷은 시점별로 **서로 다른 `valuationYear`**(취득/최초공시/양도 각 연도)를 세팅(§4.1) → 일자 칸도 갈림.
- **내부 제목 "상속…" 억제**: `NtsBuildingStdPriceReport`(또는 어댑터)에 PHD/transfer 컨텍스트 플래그를 주입해 상속/증여 제목을 숨기거나 중립화("건물 기준시가 계산서"). 최소안 = 섹션 헤딩으로 맥락을 덮고 내부 부제만 유지하되, 상속세 칸 `○` 표기가 오해되지 않도록 헤딩에 "양도소득세" 명시. (구현 시 `INSTANCE_TITLE`에 transfer/phd 항목 추가 여부 판단 — 어댑터 소폭 확장 가능.)
- ⚠️ 범위 주의: 이 라벨링은 `BuildingStdPriceReportSection`(양도·상속·증여 공용)을 건드리므로 **상속·증여 기존 렌더 회귀 0** 확인 필수(estate 키는 헤딩 미적용 분기). [[feedback_800line_split_export_preservation]]

---

## §5 Phase 분해

> P1(사전 실측)은 §3.5 자가검토로 **완료** — 재구성 매핑·스토어 API·PDF 시그니처·prefix 배선 확정. 잔여는 구현.

```
P1. ✅(자가검토 완료) 재구성 매핑 확정 — §4.1 필드세팅 + 규율 A~D. store 삭제 API 부재/PDF inputData 수용/prefix 배선 확인.
P2. (anchor) 라운드트립 등가 테스트 작성(실패 확보) — 매직넘버 금지, calcBuildingStandardPrice 직접호출 등가:
    phdBatchToSnapshots(input,prefix) 각 키 → calcBuildingStandardPrice(toEngineInput(snap)) 합계 === 배치 적용금액.
    케이스: 단독 단일·단독 다부분(A조건 면적)·겸용 Case B(양도 상가)·겸용 Case A(취득·최초공시 상가=주택용도 D조건)·≤2000 취득 생략(C조건).
    verify: 신규 테스트 red → P4 후 green
P3. GAP 2 — idOfSnapshotKey 공유 유틸 추출(1곳 정의) + 정규식 `/-(?:gb|cb|phd)-(?:acq|first|transfer)(?:-commercial)?$/`.
    소비처 2곳(use-auto-save:27·BuildingStdPriceReportSection:24) import 교체. verify: gb/cb/estate 회귀 0 + phd 키 매칭 단위테스트 green
P4. GAP 1 — phdBatchToSnapshots 신규 + 스토어 deleteSnapshot 액션 + 일괄 모달 snapshotPrefix prop·적용 시 저장·stale 정리.
    ThreePointStandardPriceInput가 snapshotPrefix 전달. verify: P2 anchor green
P5. C1 라벨링 — BuildingStdPriceReportSection이 키 suffix에서 시점 라벨(취득/최초공시/양도 + 주택/상가) 도출해 각 계산서 위 헤딩("양도소득세 · 취득시 (2003년) …") 렌더 + 내부 "상속…" 제목 억제/중립화.
    verify: 양도 3시점이 화면에서 시점 구분 표시 + 상속·증여 기존 렌더 회귀 0
P6. GAP 3 — extractRelevantBuildingStdSnapshots export + **단건** handlePrintPdf에 inputData:{buildingStdSnapshots:filtered} 전달(다건 SCOPE OUT).
    verify: 단건 클라이언트 PDF에 계산서 페이지 실제 렌더(빈 페이지 아님)
P7. tsc 0 · 회귀 vitest 전체 green (특히 __tests__/print/transfer-print-sections.test.ts 무변경 확인 + 상증 계산서 회귀)
P8. E2E — 단독 일괄 산출 → 결과탭 「건물 기준시가 계산서」 노출 + 계산서 합계=결과 필드값 + 시점 라벨 구분 + PrintSelectionPanel 항목 노출.
    (겸용 Case A: 주택 3시점 + 상가 3시점). verify: E2E green
P9. 코드 품질 게이트(bkit:code-analyzer diff) → 커밋/PR/머지(사용자 확인 후)
```

## §6 검증 계획

- **anchor(P2)**: 라운드트립 등가 — 매직넘버 금지, `calcBuildingStandardPrice` 직접호출 등가로 고정(기존 `phd-building-std-batch-mixed.test.ts` 패턴 차용). 단독 다부분(2부분)·겸용 Case A(취득·최초공시 상가=주택 용도)·Case B 각각.
- **단위(P3)**: `idOfSnapshotKey` 신·구 키 표 전수(gb/cb/estate/phd/-commercial/first).
- **회귀**: gb/cb/estate 경로 계산서가 종전대로 렌더되는지(정규식 확장이 기존 매칭을 깨지 않음).
- **E2E**: 단독 일괄 → 결과탭 `building-std-report` 서식 노출 + 계산서 합계 = 결과 필드값. PrintSelectionPanel에 항목 노출. (기존 `transfer-phd-building-stdprice-calculator.spec.ts`에 결과탭 검증 추가 또는 신규 spec.)
- **자기일관성 필수**: 계산서에 표시된 최종 건물기준시가 = 결과 계산에 실제 투입된 값. 불일치 시 검증 도구로서 실격.

## §7 리스크·미해결

- **R1 (재구성 정합) — 해소(조건부).** 재유도 파이프라인은 배치와 **동일한 `calcBuildingStandardPrice`를 동일 입력형**(valuation+compositeParts, taxType="inheritance_gift")으로 호출하므로 §4.1 규율 A~D를 지키면 합계가 배치 적용금액과 일치(V1~V3). 잔여 위험은 **A~D 위반**뿐 → P2 anchor로 전 케이스 강제.
- **R2 (스냅샷 세션 스코프)**: sessionStorage라 새로고침 생존·탭 종료 소멸. 이력 저장 시 `inputData.buildingStdSnapshots` 동봉으로 영속(기존 메커니즘) — GAP 2 수정 후 phd 키도 동봉 대상 포함(V8 정규식) — P5에서 확인.
- **R3 (stale 스냅샷)**: 부분 제거·재계산 시 이전 키 잔존 → 계산서 중복. 스토어 `deleteSnapshot` 신규(V4) + P4의 prefix 정리로 차단.
- **R4 (겸용 Case A 상가 라벨)**: 취득·최초공시 상가 계산서는 "당시 주택 용도"로 산출되므로(§4.1 D), 서식 라벨이 오해를 부르지 않게 표기 확인(재일46014-2396 근거 각주). [[project_transfer_mixed_use_usage_change_acq_stdprice_usage_index]]
- **R5 (downloadSelectedPdf 시그니처) — 해소.** 이미 `inputData?` 수용(V5) → 시그니처 변경 불필요. 호출부 2곳(단건·다건)에 인자만 추가.
- **R6 (신규 — 저장 필터 이중경로)**: 화면 렌더(`BuildingStdPriceReportSection` useMemo)와 이력 저장(`extractRelevantBuildingStdSnapshots`)이 **같은 소속판정 로직 2곳**(V9)에 의존 → 공유 유틸 단일화로 드리프트 방지([[mirror-pattern]]). 클라이언트 PDF도 같은 필터 재사용.

## §8 Definition of Done

- [ ] 단독/겸용 일괄 계산 값이 결과탭 「건물 기준시가 계산서」로 화면 출력
- [ ] 계산서 최종 건물기준시가 = 결과 계산 투입 필드값 (자기일관성 anchor green)
- [ ] 각 계산서에 시점 라벨(취득시/최초공시일/양도시 + 주택/상가) 표시(C1) — 연도만으로 구분되지 않음
- [ ] 상속·증여 기존 계산서 렌더 회귀 0 (공유 컴포넌트 변경)
- [ ] 결과탭 **단건** 클라이언트 PDF에 계산서 페이지 실제 렌더(빈 페이지 아님) — 다건은 SCOPE OUT
- [ ] 이력 저장→복원 시 계산서 재현(phd 키 동봉 확인)
- [ ] tsc 0 · vitest 전체 green · E2E green
- [ ] 코드 품질 게이트 High/Medium 0
