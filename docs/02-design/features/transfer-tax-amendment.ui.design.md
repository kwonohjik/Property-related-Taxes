# 양도소득세 수정신고(경정) — UI 설계

> 작성 2026-07-01. 대응 엔진: `transfer-tax-amendment.engine.design.md`. 계획: `docs/00-pm/transfer-tax-amendment.plan.md`.
> 범위: 양도소득세 단건(single)만. 정책 준수: `mirror-pattern`·`feedback_useeffect_store_mirror_forbidden`·`feedback_result_view_korean_formula`·`amount-column-align`·`tax-field-add`.

## 1. 사용자 시나리오

1. 사용자가 2022년 수용 양도를 계산·저장(당초 신고서, 이력 record A).
2. 2026년 증액보상금 수령 → `/history`에서 record A 드로어 → **"수정신고 작성"** 클릭.
3. 마법사가 당초 입력으로 hydrate + 상단 **수정신고 배너** + 당초 결정세액·법정신고기한 자동 채움.
4. 사용자가 양도가액(증액분 포함)·필요경비 수정.
5. Step 6에서 가산세 적용 여부 선택(증액보상금 → 기본 OFF/면제).
6. 계산 → **수정신고 추가 납부세액** 결과 카드(당초 vs 수정 비교).
7. 저장 시 당초 record A는 **보존**, 수정신고는 별도 record B로 저장.

## 2. 진입 — `HistoryDetailDrawer`

```
┌ 이력 상세 (양도소득세) ─────────────────────┐
│ 서울 강남구 …  2022-05-01                    │
│ 결정세액  30,000,000원                       │
│ ─────────────────────────────────────────── │
│ [ 이 조건으로 재계산 ]  [ 수정신고 작성 ]★신규│
│ [ 내보내기 ]  [ 삭제 ]                        │
└──────────────────────────────────────────────┘
```
- **[High 가드]** "수정신고 작성"은 `record.taxType==="transfer"` **AND** `record.resultData.mode==="single"`일 때만. (mixed-use/bundled/multi는 `resultData.result.determinedTax` shape 부재.)
- `handleAmend()` — hydration 1회 store 세팅(**useEffect 미러링 아님**):
  ```ts
  updateFormData({
    ...(record.inputData as ...),
    amendmentMode: true,
    amendmentSourceId: record.id,
    originalDeterminedTax: String(record.resultData.result.determinedTax ?? ""),
    statutoryFilingDeadline: deriveStatutoryDeadline(record.inputData.transferDate), // (양도연도+1)-05-31
  });
  setStep(0); router.push("/calc/transfer-tax");
  ```

## 3. 상단 배너 (마법사 전 스텝 공통)

`amendmentMode`일 때:
```
┌ 📝 수정신고 작성 중 ───────────────────────── amber ┐
│ 당초 신고(서울 강남구 · 2022-05-01) 기준으로 불러왔습니다. │
│ 양도가액·취득가액·필요경비를 수정하세요. 당초 결정세액       │
│ 30,000,000원은 자동 차감됩니다.                          │
└──────────────────────────────────────────────────────┘
```

## 4. 입력 위젯 — Step 6 `AmendmentBlock`

**[U1]** Step6.tsx 렌더 분기 — 조건부 교체(상호배타):
```tsx
{form.amendmentMode
  ? <AmendmentBlock form={form} onChange={onChange} />
  : <기존 무신고/과소신고 penalty 패널 /> }
```
`amendmentMode` 시 기존 `enablePenalty`/`filingType` 패널은 미노출(API ④에서도 generic penalty skip → 이중 전송 차단).

```
┌ ⑤ 수정신고 ──────────────────────────────── rose ┐
│ 당초 결정세액 *          [ 30,000,000 ] 원          │  ← prefill·수정가능
│ 법정신고기한 *           [ 2023-05-31 ]             │  ← transferDate 파생·수정가능
│                                                     │
│ ▸ 신고불성실가산세 적용            ( OFF )  ToggleCard│  기본 OFF
│   └(ON 시)                                          │
│     부정행위: (●일반 10% ○부정 40% ○역외 60%)        │  RadioCardGroup
│     감면 방식:                                       │
│       (●정당한 사유 면제 §48①2호)  ← 증액보상금 기본   │
│       (○§48② 자진수정 감면)                          │
│         └(선택 시) 수정신고일 [ 2026-06-30 ]         │
│            → "법정신고기한 후 약 3년 → 감면 없음(0%)"  │  자동 표시
│       ☐ 세무서 경정 예고 후 수정신고(감면 배제)        │
│                                                     │
│ ▸ 납부지연가산세 적용             ( OFF )  ToggleCard │  기본 OFF
│   └(ON 시) 수정신고 납부(예정)일 [ 2026-06-30 ]      │
│      ⓘ 납부지연가산세는 §48② 감면 대상이 아닙니다.    │
└─────────────────────────────────────────────────────┘
```
- `ToggleCard`/`RadioCardGroup` 필수(native 금지). `DateInput`(type=date 금지). `CurrencyInput`(포커스 전체선택 내장).
- **감면율 표시는 엔진 단일진실**: 계산 전 프리뷰는 `resolveAmendmentReductionRate` **엔진 헬퍼 import**(UI 재구현 금지 — `feedback_ui_engine_dual_truth_avoidance`·`single-source-engine-helper`). display fallback + validate 동일(3중), useEffect→store 금지.
- **[U2] `deriveStatutoryDeadline` 단일소스**: `handleAmend`(§2)·validate(§7)·(선택)프리뷰가 모두 사용 → 공용 `lib/calc/transfer-amendment-helpers.ts`에 1개 정의, 3곳 import. 재정의 금지(dual-truth).

## 5. 결과 카드 — `AmendmentResultCard`

**Hero 전환**: `result.amendmentDetail` 존재 시 `TransferTaxResultView:279` "총 납부세액"을 아래로 교체.

```
┌ 수정신고 추가 납부세액 ────────────────────────────┐
│                         22,000,000 원               │  ← Hero
│ ────────────────────────────────────────────────── │
│ 당초 결정세액                       30,000,000 원   │  우측정렬 tabular-nums
│ 수정 결정세액                       50,000,000 원   │  (amount-column-align)
│ 추가 납부 본세                      20,000,000 원   │
│ 신고불성실가산세 (10%, 감면 0%)      2,000,000 원   │
│ 납부지연가산세 (…일 × 0.022%)                0 원   │  OFF면 행 숨김
│ ────────────────────────────────────────────────── │
│ 수정신고 총 납부세액                22,000,000 원   │
│ 참고: 추가 지방소득세(지자체 별도)    2,000,000 원   │
│ 참고: 수정 후 전체 세액             55,000,000 원   │  강등 표기
│ [ ▾ 산출근거 펼치기 ]                               │  print:자동펼침
└─────────────────────────────────────────────────────┘
```
- 산식 한국어 풀어쓰기(`feedback_result_view_korean_formula` — 변수약어·`floor()` 금지).
- 감면 적용 시 산식: `추가납부세액 2,000만 × 10% × (1 − 감면율 50%) = 100만`.
- 금액칸 `font-mono tabular-nums text-right`(`amount-column-align`). 펼침 `ExpandToggleButton`, 인쇄 CSS-only(`print-only-css-toggle`).

## 6. 14 동기화 지점 (UI 측)

| # | 지점 | 처리 |
|---|---|---|
| ① FormState | `TransferFormData` += amendment 10필드(계획 §4.1) |
| ② INITIAL | `defaultFormData` 기본값 |
| ③ normalize | 폼-전역 optional → merge 스프레드 흡수(신규 default 병합 확인) |
| ④ API 변환 | `amendmentMode` 시 `amendment` payload, generic penalty skip |
| ⑤ UI 위젯 | `AmendmentBlock`(§4) + 배너(§3) + 진입버튼(§2) |
| ⑥ 사이드바 | (선택) 추가납부세액 프리뷰 — **result 도착 후만**(수정결정세액=엔진 산출, 입력만으론 불가). `computeTransferSummary(formData, result)` |
| ⑦ 결과 카드 | `AmendmentResultCard`(§5) + Hero 전환 |
| ⑧ validation | §7 |
| ⑨⑩⑫ Zod | `amendmentSchema` + 상호배타 refine |
| ⑬ body | `callTransferTaxAPI` body에 amendment |
| ⑭ Route | Date 변환(`toOptionalDate`) |
| ⓢ1~3 저장소 | businessKey `\|amend`·title·hydration(계획 §5.1) |

## 7. Validation 규칙 (`lib/calc/transfer-tax-validate.ts`)

`amendmentMode === true`일 때(정책 `feedback_validation_sync_8th_point` — UI fallback ↔ validate 동기):
- `originalDeterminedTax` > 0 필수 ("당초 결정세액을 입력하세요").
- `applyUnderReportingPenalty && underReductionMode==="auto_48_2"` → `statutoryFilingDeadline`·`amendedFilingDate` 필수.
- `applyLatePaymentPenalty` → `statutoryFilingDeadline`·`amendedPaymentDate` 필수, `amendedPaymentDate >= statutoryFilingDeadline` 권고(이전이면 경과일 0).
- **UI 통과 ↔ validate 차단 모순 금지**: display fallback(법정신고기한 자동도출)이 있으면 validate도 동일 fallback 후 판정.

## 8. E2E (`e2e/transfer-amendment.spec.ts`)

1. 당초 신고 입력→계산→이력 저장 확인(toast).
2. 이력 드로어 "수정신고 작성"(single record) → 배너 노출 + 당초 결정세액 prefill 확인.
3. 양도가액 증액 수정 → 계산 → 추가 납부 본세 카드 표시.
4. 가산세 OFF → 신고불성실·납부지연 행 0/숨김.
5. §48② ON + 수정신고일 입력 → 감면율 자동 표시 + 결과 반영.
6. **Network 탭 request body에 `amendment` 필드 포함** 확인(⑬⑭ 실증).
7. 저장 후 `/history`에 당초·수정 **2건** 존재(A9 — 당초 미소실).
> 셀렉터: ToggleCard=`role=switch`, 배너=텍스트 `/수정신고 작성 중/`, 결과=`/수정신고 추가 납부세액/`.
