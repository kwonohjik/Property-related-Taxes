# 계산결과 상세명세서 카드 추가

## Context

양도세 결과 페이지(`TransferTaxResultView.tsx`)는 현재 신고서 양식 표(32행)와 "계산 과정 상세 보기" 토글을 노출하지만 두 가지 한계가 있다.

1. **신고서 양식 표**는 결과값(숫자)만 보여줄 뿐 "왜 이 값인가"의 산식·법령·중간 변수가 보이지 않는다.
2. **"계산 과정 상세 보기" 토글**은 단건 모드의 `result.steps[]`만 렌더하며, **사례 33 일괄+증축처럼 aggregate 모드의 자산별 step(`PerPropertyBreakdown.steps[]`)은 표시되지 않는다**. 토지·건물·증축건물 각각의 양도차익·장특공제·결정세액을 검증할 수 없다.

사용자 요구는 신고서 양식 32행 모든 항목(양도가액~지방세 결정세액)이 어떻게 계산되었는지를 산식·실제 변수값과 함께 노출하여, **납세자가 로직과 계산 과정을 1:1로 검증**할 수 있게 하는 것이다.

UX 결정 (사용자 확정):
- 별도 **"계산결과 상세명세서"** 카드를 신고서 양식 표 아래 추가
- 32행 항목을 **5~7 단계 그룹**으로 묶어 항목별 산식·변수값·법령을 항상 펼친 상태로 표시
- 다건 모드(사례 33 등)는 **합계 + 자산별 펼침** 패턴 (자산별 토글로 토지/건물(3001)/증축건물(3002) 상세 노출)
- **엔진 변경 0** — 기존 `result.steps[]`·`result.splitDetail`·`PerPropertyBreakdown`·`AggregateMeta`를 UI에서 가공하여 32 항목 매핑

## 신규 파일

### `components/calc/results/transfer/DetailedCalculationStatementCard.tsx`
- 메인 카드 컴포넌트. props: `{ result, formData, aggregate? }` (FilingFormTable과 동일 시그니처)
- 5~7개 그룹 섹션을 `<section>`으로 렌더 (각 섹션 헤더 + 항목 리스트)
- 다건 모드 분기: `aggregate?.properties.length > 0` → 자산별 펼침 영역 마운트
- 인쇄 지원: `data-print-section="detailed-statement"` 속성 + 🖨 PDF 버튼

### `components/calc/results/transfer/DetailedStatementHelpers.ts`
- 32 항목 매핑 로직 분리 (800줄 정책)
- 핵심 export:
  - `STATEMENT_GROUPS: GroupDef[]` — 항목 그룹 정의 (예: `{ id: "gain", title: "1단계: 양도차익 산정", items: ["transferPrice", "acquisitionPrice", "expenses", "transferGain"] }`)
  - `buildStatementItems(result, formData, aggregate?): Map<itemKey, StatementItem>` — 32개 항목 = `{ label, formula, value, legalBasis, perAssetBreakdown? }` 객체로 변환
  - `findStepByLabel(steps, keyword)` — `result.steps[]`에서 label 부분일치로 step 찾기 (label·formula·legalBasis 재사용)
  - `buildPerAssetBreakdown(properties, itemKey)` — aggregate 자산별 값 추출 (예: `transferPrice` → `properties.map(p => ({ label: p.propertyLabel, value: p.transferPrice }))`)

### `components/calc/results/transfer/DetailedStatementGroups.tsx`
- 그룹별 렌더 컴포넌트 (DetailedStatementSection)
- 항목 행 렌더 (`StatementItemRow`):
  - 좌측: 항목 라벨 + 산식 텍스트 + `LawArticleModal` (재사용)
  - 우측: `formatKRW(value)` (`@/lib/calc/format` 재사용)
  - 자산별 펼침 토글 (clickable disclosure): `PerAssetBreakdownList` 서브 컴포넌트

## 수정 파일

### `components/calc/results/TransferTaxResultView.tsx`
- 라인 ~141 근처 (FilingFormTable 직후) 또는 라인 ~694 근처 (계산 과정 토글 직전) 위치 결정 후 카드 마운트:
  ```tsx
  <DetailedCalculationStatementCard
    result={result}
    formData={formData}
    aggregate={aggregate}
  />
  ```
- 단건/다건 모두 표시. 비과세 자산은 항목별 0/N/A 처리.

## 32 항목 → 5~7 그룹 매핑

| 그룹 | 항목 | 데이터 출처 |
|---|---|---|
| **1. 일자·기간** | 양도일자·취득일자·보유기간·퇴거일·입주일·거주기간 (6) | `formData.transferDate`·`asset.acquisitionDate`·`gbBuildingAcquisitionDate`·`gbExtensionDate` (FilingFormTableAggregateHelpers의 `getAcqDateForCard` 재사용) + `holdingPeriodFromDates` (`FilingFormTableHelpers.ts:199`) |
| **2. 양도차익 산정** | 양도가액·취득가액·필요경비·전체 양도차익·비과세 양도차익·과세대상 양도차익 (6) | `result.steps[]` (STEP 3 양도차익·STEP 4 비과세) + `result.transferPrice`·`acquisitionPrice`·`expenses`·`transferGain`·`exemptGain` |
| **3. 장기보유공제** | 장기보유특별공제·보유 기간분·거주 기간분 (3) | `result.steps[]` (STEP 5) + `result.splitDetail`·`result.longTermHoldingDeduction` (보유/거주분 산식은 helpers에서 holdingYears×rate 계산) |
| **4. 소득금액** | 양도소득금액·비과세 양도소득금액·세액감면대상금액·소득금액 감면대상·감면후 소득금액·기신고 양도소득금액·기본공제 (7) | `result.incomeAmount`·`reducibleIncome`·`reductionAmount`·`priorIncome`·`basicDeduction` + STEP 6.5 |
| **5. 세액 산정** | 과세표준·산출세액·감면세액·결정세액 (4) | STEP 7·8·9 + `result.taxBase`·`calculatedTax`·`reductionAmount`·`determinedTax` (산출세액은 `taxBase × rate - progressiveDeduction`, 다건 비교과세 분기는 `aggregated.steps`) |
| **6. 가산세·총결정세액** | 가산세액·총결정세액 (2) | STEP 10.5 (§114조의2)·STEP 12 (신고불성실·납부지연)·STEP 11 + `result.penaltyTax`·`filingDelayedPenaltyTax`·`totalTax` |
| **7. 부가세** | 농어촌특별세·지방소득세 산출세액·지방세 감면세액·지방세 결정세액 (4) | `result.new993Detail?.ruralSurtax`·`result.localIncomeTax` + 산식 `(determinedTax + penaltyTax) × 10%` 표기 |

## 다건 모드 자산별 펼침

`aggregate?.properties.length > 0` 시 항목별 disclosure(`<details>`) 토글 활성:
- **표시 가능 항목**: 양도가액·취득가액·필요경비·양도차익·과세대상양도차익·장특공제·양도소득금액·산출세액·감면세액·결정세액·가산세액·총결정세액 (PerPropertyBreakdown 필드 존재 항목)
- **합계 only 항목**: 과세표준·기본공제·지방소득세 (자산별 산정 의미 없음 — 합계만 표시)
- 자산별 행 라벨: `propertyLabel` (예: "토지(1001)"·"건물(3001)"·"증축건물(3002)" — 일반건물 토지·건물·증축건물 분해)
- 자산별 산식: 단건 산식과 동일 (예: 양도차익 = 양도가액 - 취득가액 - 필요경비)

## 재사용 자원 (신규 코드 최소화)

| 자원 | 위치 | 용도 |
|---|---|---|
| `CalculationStep` 타입 | `lib/tax-engine/types/transfer.types.ts:476` | step.label·formula·amount·legalBasis 그대로 사용 |
| `LawArticleModal` | `components/calc/results/LawArticleModal.tsx` | 법령 조문 모달 |
| `formatKRW()` | `lib/calc/format.ts` | 금액 포맷 (`330,000,000`) |
| `holdingPeriodFromDates`·`fmtPeriod`·`fmtDate` | `components/calc/results/transfer/FilingFormTableHelpers.ts:177~199` | 일자·기간 표시 |
| `getAcqDateForCard` | `FilingFormTableAggregateHelpers.ts` (이번 세션 추가) | GB 카드별 정확한 취득일 |
| 인쇄 헬퍼 | `printScoped("steps")` 패턴 | `data-print-section` |
| `PerPropertyBreakdown` 타입 | `lib/tax-engine/types/transfer-aggregate.types.ts:57` | 자산별 값 |

## Definition of Done

- 단건 모드(사례 31 등) 결과 페이지에 카드가 마운트되어 32 항목 모두 표시
- 다건 모드(사례 33·27·28 등) 결과 페이지에 카드가 마운트되며 자산별 펼침 동작
- 비과세 자산도 적절한 N/A·0 표시 (구멍 없음)
- 인쇄(🖨 PDF) 시 카드 단독 인쇄 가능
- 800줄 정책 준수 (3개 파일 분할)

## 검증 절차

1. **typecheck**: `npx tsc --noEmit` 0건
2. **단위 테스트**: `__tests__/components/calc/DetailedCalculationStatementCard.test.tsx` 신규 (단건·다건 fixture로 항목 라벨·금액 렌더 검증). vitest + @testing-library/react.
3. **회귀**: 양도세 전체 (`npx vitest run __tests__/tax-engine/transfer-tax/`) — 엔진 변경 0이므로 회귀 없어야 함
4. **브라우저 수동 확인** (필수):
   - `npm run dev` 실행
   - 사례 31 (실거래가 단건) 입력 → 결과 페이지에서 32 항목이 카드에 정확히 표시
   - 사례 33 (일괄 + 증축) 입력 → 자산별 펼침 토글 동작, 토지(1001)·건물(3001)·증축건물(3002) 양도차익·산출세액 분리 표시
   - 신고서 양식 표 행과 명세서 항목 값이 일치 (32행 모두)
5. **법령 조문 클릭**: `LawArticleModal` 정상 동작 확인 (§95·§103·§114조의2·§161·농특세법 §3 등)

## 비포함(후속 PR 후보)

- 엔진 측 보유분/거주분 장특 sub-step 정식 emit (현재는 splitDetail 가공)
- 비과세 양도소득금액(§161①) 정식 step emit
- 다건 차손통산·기본공제 배분 step emit (현재는 aggregated.steps 가공)
- "계산 과정 상세 보기" 기존 토글 폐지 또는 명세서 카드와 통합 검토 (현재는 양립)
