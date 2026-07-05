# 다건 양도세 연간 합산 — 기납부세액 정산 + 이력 불러오기 — UI 설계

> 계획서: `docs/00-pm/transfer-multi-prepaid-settlement-history-load.plan.md`
> 엔진 설계: `docs/02-design/features/transfer-multi-prepaid-settlement.engine.design.md`
> 대상: `/calc/transfer-tax/multi` (`MultiTransferTaxCalculator` · `AggregateSettingsPanel` · `MultiTransferTaxResultView`)

## 사용자 시나리오

1. 1월 자산A 양도 → 3월 예정신고·납부(기납부 T_A). 5월 자산B 양도 → 7월 예정신고. 이듬해 5월 **확정신고**: A·B 합산 → 총결정세액 재계산(비교과세·§133·차손통산) − 기납부 = 추가납부/환급.
2. 사용자는 각 자산을 **처음부터 재입력하지 않고**, 이전에 계산·저장한 이력(단건 A·B 또는 이미 만든 다건)을 **불러와** 합산한다.
3. 3회 이상 양도: 직전 다건 결과를 불러와 자산 추가(§2-B telescoping — 단건 합으론 재현 불가).

---

## 진입 — 불러오기 버튼 (2 지점, D7)

마운트 useEffect(`MultiTransferTaxCalculator.tsx:366-368`)가 신규 진입 시 blank property auto-add + `setStep("edit")` → **StepList가 가려짐**. 따라서 불러오기 진입점을 **StepList + edit 헤더 양쪽**에 둔다.

### 판별 헬퍼 `classifyLoadableTransfer(record)` → `"single" | "multi" | null`
`classifyAmendableTransfer`(`transfer-amendment-entry.ts:30`) 재사용/래핑. ⚠️ **classifyAmendableTransfer는 bundled를 `"bundled"`로 반환**(null 아님, `:41-45`) → 로드 래퍼에서 **명시적으로 bundled→null 매핑**(§166⑥ companion을 다건 편입하는 복잡성 배제). single·multi만 loadable. 부담부증여·general_building·stub(`:49`)은 기존 가드로 자연 배제.

### 버튼 배치
```
[StepList 상단]                         [edit 헤더 / AssetTabBar]
 ┌─────────────────────────────┐         ← 자산 목록으로   [📂 이력에서 불러오기]
 │ 양도 자산 목록                │
 │  + 양도 건 추가   📂 불러오기 │        (data-testid="multi-load-history-btn")
 └─────────────────────────────┘
```

### 모달 `MultiTransferHistoryLoadModal` (신규, `PriorGiftHistoryModal` 패턴 차용)
```
┌── 이력에서 불러오기 ──────────────────────────┐
│ [단건] 2025 아파트 양도  결정세액 12,340,000  ⟳ │  ← 클릭=append (자산 1건 추가)
│ [단건] 2025 상가 양도    결정세액  8,900,000  ⟳ │
│ [다건] 2025 합산(2건)    결정세액 21,500,000  ⟳ │  ← 클릭=replace (전체 교체)
│ ─────────────────────────────────────────── │
│ ⚠️ 다건 불러오기는 현재 입력을 대체합니다.       │
└──────────────────────────────────────────────┘
```
- **필터**: `taxType==="transfer"` + `classifyLoadableTransfer≠null` + **활성 clientId**(세무사 모드 격리) + **동일 taxYear만**(D3, 다른 연도 비활성+사유). 이미 세션에 있는 record는 "불러옴" 배지(dedup 경고).
- **단건 선택** → `appendSingleRecordAsProperty(record)`: `addProperty(form=record.inputData)`, `priorPaidTax` 자동값 `+= String(record.resultData.result.determinedTax)`, `sourceCalculationId` 메타. ⚠️ **stray blank 정리(STEP 13 High)**: 마운트 useEffect(`MultiTransferTaxCalculator:366-368`)가 신규 진입 시 빈 property 1건 auto-add → append 전 **미입력 빈 property는 제거/재사용**(빈+로드 자산 중복 방지). ⚠️ **append도 `priorPaidTaxEdited=true`면 Dialog 확인**(replace와 동일 — 수동편집값에 침묵 가산 방지).
- **폐기 Dialog 발동조건**(구현): **다건 replace**만 기존 properties(비-blank)>0 OR priorPaidTaxEdited=true 시 Dialog. **단건 append**는 Dialog 대신 `edited=true`면 **자동채움 skip(수동값 보존)** — 데이터 손실 없어 확인 불필요(설계 대비 완화, 의도=수동편집 존중 동일).
- **다건 선택** → `loadMultiRecordIntoSession(record)`: `enterMultiAmendment` 골격 재사용(정정 플래그 없이), properties[] **replace** hydrate, `priorPaidTax` 자동값 `= String(record.determinedTax)`, `priorPaidTaxEdited=false`, `setActiveClientId`. **기존 편집값 존재 시 폐기 확인 Dialog**(feedback_dialog_data_discard_confirm, native confirm 금지).
- **참고 배너**(모달 하단·설정 패널): "자동값은 참고입니다. 실제 예정신고 납부액으로 확인하세요." (§2-A 확정 basis≠예정 basis).

---

## 입력 패널 — `AggregateSettingsPanel` (기납부세액 필드)

filing-level 배치 정당(이미 taxYear·annualBasicDeductionUsed 보유 `AggregateSettingsPanel.tsx:50`).

```
공통 설정
 ├ 과세연도            [ 2025 ]
 ├ 기 사용 기본공제    [ 0 ] 원
 └ 예정신고 기납부세액  [ 21,500,000 ] 원   🔵자동   [§111③ ↗]
    └ ⓘ 확정신고 시 결정세액에서 공제됩니다. 자동값은 참고 — 실제 예정신고 납부액으로 확인하세요.
       (양도소득세 국세분. 지방소득세 예정납부분은 별도)
```
- **위젯**: 국세 기납부 `CurrencyInput` + **지방소득세 기납부** `CurrencyInput`(D5 포함) 2필드. select-on-focus 자동, 문자열 바인딩. `data-testid="prior-paid-tax-input"`·`prior-paid-local-tax-input`.
- **⚠️ onChange가 edited 플래그 동반 필수(STEP 13 High)**: 기존 패널 관례 `onChange({ field: v })`(`AggregateSettingsPanel.tsx:53`)를 그대로 모방하면 `priorPaidTaxEdited` 미갱신 → 배지 잔존 + 편집존중 붕괴(수동편집이 다음 불러오기에 소실). **명시**: `onChange={(v)=>onChange({ priorPaidTax: v, priorPaidTaxEdited: true })}`. 자동채움(불러오기 핸들러)만 `edited:false`.
- **배지**: `priorPaidTaxEdited===false && priorPaidTax!=="0"` → 🔵"자동". 사용자 편집 시 `edited=true`로 배지 제거. **자동값은 불러오기 이벤트 핸들러에서 1회 기록**(useEffect→store 미러 금지 — mirror-pattern).
- **법조문 링크**: `LawArticleModal` §111③.

---

## 결과 카드 — `MultiTransferTaxSummaryCard` **리팩터**(approach A, 신규 아님)

⚠️ **STEP 13 발견**: 정산 행(기납부세액·이번 납부할세액·지방세 기납부·납부할세액)이 **이미** `MultiTransferTaxSummaryCard:182-197`에 렌더 중. 단 **UI 자체계산**(`currentTaxDue`·`currentLocalTaxDue`·`totalDue` `:122-129`) + **`autoPriorPaid`=앞 자산 결정세액 단순합**(`:116-119`, §107 위반·refDeterminedTax 부정확). approach A로 **엔진 result read로 이관**:

- **제거**: `autoPriorPaid`·`effectivePriorPaid`·`currentTaxDue`·`currentLocalTaxDue`·`totalDue` 계산 로직(`:112-129`) + `getRefDeterminedTax` 정산 용도.
- **read**: `result.settlementAdditionalPayable`(이번 납부할세액)·`result.settlementLocalPayable`(지방)·`result.settlementTotalDue`(납부할세액)·`result.priorPaidTax`·`result.priorPaidLocalTax`. 기존 렌더 행 레이아웃 유지, 소스만 엔진.
- **caller 배선**: `MultiTransferTaxCalculator`가 사용자 입력 `priorPaidTax`/`priorPaidLocalTax`를 폼→API→엔진으로 흘려보냄(현재 `:597` 미전달 → 폼 필드 추가). 카드는 override prop 대신 `result.*` read로 단순화.

엔진값 read-only(UI 재계산 금지, feedback_ui_engine_dual_truth_avoidance).

```
┌── 확정신고 정산 ──────────────────────────────┐
│ 결정세액            21,500,000                 │
│ − 예정신고 기납부세액 18,000,000                │  ← result.priorPaidTax
│ ══════════════════════════════                │
│ 추가납부세액         3,500,000                  │  ← result.settlementAdditionalPayable
│   (환급 시: 환급세액 N — result.settlementRefund)│
│                                                │
│ ⚠️ 감면 종합한도(§133) 초과 4,000,000 배제       │  ← reductionBreakdown.cappedByLimit (상시)
│    → 예정신고분보다 추가납부 발생                 │  ← priorPaidTax>0 시에만 (2단 분리)
│ ⓘ 정산액은 양도소득세(국세)분. 지방소득세 별도.  │  ← 지방 별도 고지 (v1 D5 미포함)
└────────────────────────────────────────────────┘
```
- **totalTax 정합**: `totalTax`(결정+가산+지방, gross)는 표시 유지하되, **P>0 시 headline 실납부 = `settlementAdditionalPayable`**. `AmendmentResultCard fullTotalTax={result.totalTax}`(`:694`)와 충돌 회피 — prepaid 존재 시 정산 카드가 실납부 진실(feedback_engine_result_display_drift).
- **신고서 양식**: `FilingFormTable`(별지 제84호, `:19,507`)에 **기납부세액·납부할세액 행 추가**(besshi-form-replica).
- 산식 한국어 풀어쓰기(feedback_result_view_korean_formula), amount 우측정렬 font-mono(amount-column-align).

---

## testid (E2E 앵커)

| testid | 위치 |
|---|---|
| `multi-load-history-btn` | StepList·edit 헤더 불러오기 버튼 |
| `load-record-{id}` | 모달 record 행 |
| `prior-paid-tax-input` | 기납부세액 CurrencyInput |
| `prior-paid-tax-auto-badge` | 자동 배지 |
| `settlement-card` | 정산 카드 |
| `settlement-additional-payable` / `settlement-refund` | 정산 금액 |

E2E: 이력 시드(IndexedDB, Dexie DB 생성 후 `waitForFunction`) → 불러오기 실플로우(client router, reload無) — feedback_e2e_client_nav_no_reload_vs_sessionstorage_race. `.click()` 안 먹으면 `setChecked`(ToggleCard).

---

## 14 동기화 지점 (UI 파트)

| # | 지점 | 내용 |
|---|---|---|
| ① 폼 | `MultiTransferFormData.priorPaidTax: string`("0") + `priorPaidTaxEdited: boolean` |
| ② initial | store initial(`:58-62`) `priorPaidTax:"0"`, `priorPaidTaxEdited:false` |
| ③ normalize | persist rehydrate/migrate 동일 기본값 |
| ④ API | `multi-transfer-tax-api.ts` 문자열→number, **filing-level** body(per-property 매퍼 아님) |
| ⑤ 위젯 | AggregateSettingsPanel CurrencyInput + 자동 배지 |
| ⑥ 사이드바 | 정산액 result 후에만 |
| ⑦ 결과 | 정산 카드(P>0시) + §133 2단 + besshi 행 |
| ⑧ validate | 음수 **차단** + 과대 경고, API fallback(`?? 0`) 동기화 |
| ⑫ Zod | `lib/api/transfer-tax-schema.ts` `multiInputSchema`(route.ts inline 아님!) |
| ⑬ body | ④와 동일 filing-level |
| ⑭ Route | `multi/route.ts` → `AggregateTransferInput.priorPaidTax`(number) |

⑨⑩⑪(자산-수준 enum·companion·acqDate) — filing-level이라 해당 없음.

---

## 정책 준수 체크

- ✅ **mirror-pattern**: 자동값=이벤트 핸들러 1회 기록, useEffect→store 금지. `edited` 플래그로 편집 존중.
- ✅ **dual-truth 회피**: 정산액·추가납부는 엔진 result read-only. UI/사이드바 재계산 금지.
- ✅ **dialog 폐기확인**: 다건 replace 시 Dialog(native confirm 금지).
- ✅ **validation 동기화**: 음수 차단 API=UI 동일 fallback(⑧).
- ✅ **select-on-focus / CurrencyInput**: 전역 규칙 자동.
- ✅ **explicit prop strip**: AggregateSettingsPanel 신규 prop spread+grep 자가점검.
- ✅ **besshi-form-replica / amount-column-align**: 신고서 행·금액 정렬.
