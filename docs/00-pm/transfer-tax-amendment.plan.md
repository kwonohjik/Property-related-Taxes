# 양도소득세 수정신고(경정) 기능 — 작업 계획서

> 작성 2026-07-01. 대상: **양도소득세 단건(single) 경로만**.
> 트리거 사례: 2022년 수용 양도 신고 후 2026년 증액보상금 수령 → 당초 양도연도 귀속 수정신고.
> 이 계획서의 모든 file:line·수치는 실제 코드 실측 기반(추정 없음).
> 설계 문서: [`transfer-tax-amendment.engine.design.md`](../02-design/features/transfer-tax-amendment.engine.design.md) · [`.ui.design.md`](../02-design/features/transfer-tax-amendment.ui.design.md). 본 계획서는 plan-design-self-review-loop 13단계 검토 완료(정정 25건, Critical 2 해소).

---

## 0. 목적

당초 신고를 마친 양도건에 대해 **양도가액·취득가액·필요경비를 수정**하여 다시 계산하고,
**당초 납부세액을 자동 차감**해 **추가 납부할 세액**을 산출한다.
신고불성실·납부지연 가산세는 **선택 적용**(증액보상금처럼 가산세 면제 케이스 지원).

## 1. 요구사항 (사용자 스펙 그대로)

1. 1차(당초) 신고서를 입력·저장한다.
2. 1차 신고서를 **불러와서** 수정(양도가액·취득가액·필요경비 등)한 수정신고서를 작성한다.
3. **당초 납부세액을 자동 차감**한다.
4. 가산세(신고불성실·납부지연) **적용 여부는 선택 사항**.
5. 수정신고 시 **납부세액**을 계산한다.
6. **양도소득세만** 대상.

---

## 2. 현행 코드 실측 — 재사용 자산 (검증 완료)

| 영역 | 위치 | 현황 |
|---|---|---|
| 이력 저장 레코드 | `lib/storage/types.ts:59` `CalculationRecord` | `inputData`=TransferFormData 전체, `resultData`=`{mode,result}` 직렬화 |
| **불러오기(hydrate)** | `components/history/HistoryDetailDrawer.tsx:122` `handleResume()` | transfer는 `useCalcWizardStore.updateFormData(record.inputData)` 후 라우팅 → **이미 동작** |
| 폼 상태 penalty 필드 | `lib/stores/calc-wizard-store.ts:163~173` | `enablePenalty·filingType·priorPaidTax·originalFiledTax·paymentDeadline·actualPaymentDate` 이미 존재 |
| 가산세 순수 엔진 | `lib/tax-engine/transfer-tax-penalty.ts` | `calculateFilingPenalty`(§47의2·3), `calculateDelayedPaymentPenalty`(§47의4) 완성·테스트됨 |
| **당초세액 차감 산식** | `transfer-tax-penalty.ts:169` | `penaltyBase = max(0, 결정세액 − 감면 − 기납부 − 당초신고 − 이자 + 초과환급)` → 과소신고 base = **추가납부세액과 동일 구조** |
| **결정세액 2-pass 주입** | `app/api/calc/transfer/route.ts:754~770` | 가산세 없이 1차 계산→`determinedTax`·`reductionAmount` 확보→penalty details에 주입→2차 계산. **버그 아님(검증됨)** |
| API 변환 | `lib/calc/transfer-tax-api.ts:503~525` | `enablePenalty && filingType!=="correct"` 게이트로 `filingPenaltyDetails`·`delayedPaymentDetails` 조립 |
| Zod 스키마 | `lib/api/transfer-tax-schema-sub.ts:358~372` + `-schema.ts:469` | `filingPenaltyDetailsSchema`·`delayedPaymentDetailsSchema` |
| 라우트 Date 변환 | `route.ts:331~344` | `paymentDeadline`/`actualPaymentDate` → `new Date()` |
| 결과 표시 | `components/calc/results/TransferTaxResultView.tsx:279~291` | 총납부세액 hero + 결정세액/가산세 breakdown |

### 2.1 현행 가산세 경로의 구조적 한계 (수정신고엔 부적합)

- 당초세액 차감(`originalFiledTax`)이 **`filingType="under"`(과소신고)에 결합** → 차감을 쓰려면 10% 신고불성실이 강제된다.
- 정상신고(`"correct"`) 선택 시 `originalFiledTax` 입력 필드 자체가 미노출(`Step6.tsx:97`).
- **추가납부세액(=penaltyBase)이 first-class 결과 필드가 아님** — `penaltyDetail.filingPenalty.penaltyBase`에 매몰, 가산세 OFF면 산출 안 됨.
- 납부지연 base가 `unpaidTax===0`이면 **전체 결정세액**으로 자동충전(`route.ts:768`) → 수정신고에선 **추가납부세액(delta)** 이어야 하는데 과다.

→ 결론: 기존 penalty 경로를 재사용하되 **수정신고 전용 입력/결과를 분리 신설**(Surgical, 기존 무신고·과소신고 UI 불변).

---

## 3. 핵심 설계 판단

### 3.1 진입점 — 이력 드로어에 "수정신고 작성" 버튼 신설 (권장)
`HistoryDetailDrawer`에 transfer 전용 버튼 추가. 클릭 시:
1. `updateFormData(record.inputData)` — 기존 `handleResume`와 동일 hydrate
2. **추가로** 수정신고 필드 세팅: `amendmentMode=true`, `originalDeterminedTax = record.resultData.result.determinedTax`(당초 결정세액 자동 추출), `amendmentSourceId=record.id`
3. 계산기로 라우팅

> 기존 "이 조건으로 재계산"은 그대로 두고 **버튼만 1개 추가**(재사용 극대화).

### 3.2 당초 납부세액
- **자동 추출**: `record.resultData.result.determinedTax`(양도세 본세 결정세액). storage CLAUDE.md 기준 `resultData.result` 경로.
- 사용자 수정 가능(prefill). 실제 납부액이 다를 수 있으므로.

### 3.3 추가납부세액 = first-class
```
추가납부세액 = max(0, 수정결정세액 − 당초결정세액)
```
- **가산세 ON/OFF와 무관하게 항상 산출·표시**.
- 수정결정세액은 이번 엔진 run이 계산(`finalize.ts:308` `determinedTax`), 당초결정세액은 입력 → **2-pass 불필요**(기존 penalty보다 단순).

### 3.4 가산세 = 독립 토글 + §48② 자동감면 (결정 반영)
- `applyUnderReportingPenalty`(신고불성실), `applyLatePaymentPenalty`(납부지연) 각각 boolean. 기본 OFF.
- base = **추가납부세액(delta)**. `calculateFilingPenalty`/`calculateDelayedPaymentPenalty` 내부 재사용.
- 기본값 OFF (증액보상금 = 판결확정 후 신고 → 국세기본법 **§48①2호 "정당한 사유"** 전액 면제가 정상. 법 근거 없이 불리 적용 금지 정책).

#### §48② 자동감면 (국세기본법 [현행] 본문 직접 검증 — 시행 20260701)
법정신고기한 경과 후 자진 수정신고 시 **신고불성실가산세를 감면**. `underReductionMode = "exempt" | "auto_48_2"`:
| 경과기간(법정신고기한 → 수정신고일) | 감면율 | §48②1호 |
|---|---|---|
| 1개월 이내 | 90% | 가 |
| 1개월 초과 3개월 이내 | 75% | 나 |
| 3개월 초과 6개월 이내 | 50% | 다 |
| 6개월 초과 1년 이내 | 30% | 라 |
| 1년 초과 1년6개월 이내 | 20% | 마 |
| 1년6개월 초과 2년 이내 | 10% | 바 |
| 2년 초과 | 0% (감면 없음) | — |

- **핵심 제약(검증)**: §48②1호 감면은 **"제47조의3에 따른 가산세만 해당"** → **신고불성실(과소신고)에만 적용. 납부지연(§47의4)엔 절대 미적용.** (과다감면 방지 — QA anchor 필수.)
- **"경정할 것을 미리 알고 제출한 경우 제외"**: 세무서 경정 예고 후 수정신고는 감면 배제 → UI 안내 문구 + (선택) 배제 토글.
- 최종 신고불성실 = `추가납부세액 × 기본율(10/40/60%) × (1 − 감면율)`, `truncateToWon`.

### 3.5 지방소득세
- 양도세 수정신고는 국세만. 지방소득세는 별도(지자체).
- **추가 지방소득세 = 추가납부세액 × 10%** 를 **참고 표시**(당초 지방소득세는 이미 납부 가정). 본세 가산세와 별개.

---

## 4. 데이터 모델 (신규 필드)

### 4.1 폼 (`TransferFormData`, `calc-wizard-store.ts`)
```ts
// ── 수정신고 ──
amendmentMode: boolean;              // 수정신고 작성 모드
originalDeterminedTax: string;       // 당초 결정세액(=당초 납부 본세), 자동 prefill·수정가능
amendmentSourceId: string;           // 불러온 당초 이력 id(표시·추적용, 선택)
statutoryFilingDeadline: string;     // 법정신고기한(YYYY-MM-DD) — 양도일로 자동도출·수정가능. §48②·납부지연 기산점
amendedFilingDate: string;           // 수정신고일(YYYY-MM-DD) — §48② 경과기간 산정
applyUnderReportingPenalty: boolean; // 신고불성실가산세 적용
underReportingReason: "normal" | "fraudulent" | "offshore_fraud"; // 기본율(10/40/60%), 기본 normal
underReductionMode: "exempt" | "auto_48_2"; // 면제 vs §48② 자동감면. applyUnderReportingPenalty ON일 때만 의미
priorAssessmentNotified: boolean;    // 경정 예고 후 수정신고(§48② 감면 배제), 기본 false
applyLatePaymentPenalty: boolean;    // 납부지연가산세 적용 (§48② 감면 대상 아님)
amendedPaymentDate: string;          // 수정신고 납부(예정)일(YYYY-MM-DD) — 납부지연 경과일 종점
```
`defaultFormData`: `amendmentMode:false`, boolean 기본 `false`, 문자열 `""`, `underReportingReason:"normal"`, `underReductionMode:"exempt"`.

> **법정신고기한 자동도출**: 양도소득세 확정신고기한 = **(양도연도+1)-05-31** (소득세법 §110① **검증** — 과세기간 다음 연도 5.1~5.31). `transferDate`로 파생, 사용자 수정 허용(수용·토지거래허가 §110①단서 예외 대비).
> ⚠️ **전제**: 당초 **확정신고 완료** 후 수정. §110④ 예정신고만 하고 확정신고 미이행 케이스는 법정신고기한이 상이 → scope 밖(안내만).
> ⚠️ **[정책 — mirror-pattern·useeffect 미러링 금지]** `originalDeterminedTax`·`statutoryFilingDeadline` 자동값은 **`handleAmend` hydration 시 1회 store 세팅**(§7.1). 마법사 내부에서 `transferDate`→기한 파생을 **useEffect→store로 미러링 금지**(무한루프). 표시 파생이 필요하면 useMemo display fallback + validate 동일 fallback(3중 패턴). 세 지점(factory default·hydration·display)의 기본값 일치 강제.

### 4.2 엔진 입력 (`TransferTaxInput`, `types/transfer.types.ts`)
```ts
amendment?: {
  originalDeterminedTax: number;
  applyUnderReportingPenalty: boolean;
  underReportingReason: PenaltyReason;
  underReductionMode: "exempt" | "auto_48_2"; // §48② 자동감면 여부
  statutoryFilingDeadline?: Date;   // auto_48_2일 때 필수 (경과기간 기산점)
  amendedFilingDate?: Date;         // auto_48_2일 때 필수
  priorAssessmentNotified?: boolean;// true면 §48② 감면율 0 강제
  applyLatePaymentPenalty: boolean;
  amendedPaymentDate?: Date;        // 납부지연 ON일 때 필수 (경과일 종점)
};
```
> 납부지연 기산점(당초 납부기한)은 `statutoryFilingDeadline` 재사용(양도세 확정신고 납부기한 = 신고기한과 동일).

### 4.3 엔진 결과 (`TransferTaxResult`, `types/transfer-result.types.ts`)
```ts
amendmentDetail?: {
  originalDeterminedTax: number;
  amendedDeterminedTax: number;      // = determinedTax
  additionalTax: number;             // 추가납부 본세(delta)
  underReportingReductionRate: number; // 적용 §48② 감면율(0~0.9) — UI 산식 단일진실(dual-truth 회피)
  underReportingPenalty: number;     // 0 if OFF
  latePaymentPenalty: number;        // 0 if OFF
  additionalLocalIncomeTax: number;  // 참고(delta × 10%)
  totalPayable: number;              // 추가 본세 + 가산세 합계
  steps: CalculationStep[];          // Record/원시값만 (Map 금지 — feedback_engine_result_map_json_loss)
};
```

---

## 5. 14 동기화 지점 매핑 (강제)

| # | 지점 | 파일 | 작업 |
|---|---|---|---|
| ① | 폼 상태 | `calc-wizard-store.ts:41` | 4.1 필드 추가 |
| ② | initial | `calc-wizard-store.ts:176` `defaultFormData` | 기본값 |
| ③ | normalize/migrate | `calc-wizard-store.ts:321` merge | 폼-전역 optional → 기존 merge 스프레드로 흡수(신규 default 병합 확인) |
| ④ | API 변환 | `lib/calc/transfer-tax-api.ts` | `amendmentMode` 시 `amendment` payload 조립 (§②③④) |
| ⑤ | UI 위젯 | `steps/Step6.tsx` + 신규 `AmendmentBlock.tsx` + `HistoryDetailDrawer.tsx` | 진입 버튼 + 수정신고 패널 |
| ⑥ | 사이드바 합계 | `calc-wizard-store.ts:358` `computeTransferSummary` | (선택) 추가납부세액 미리보기 |
| ⑦ | 결과 카드 | `TransferTaxResultView.tsx` + 신규 `AmendmentResultCard.tsx` | 당초/수정 비교 + 추가납부 |
| ⑧ | validation | `lib/calc/transfer-tax-validate.ts` | amendmentMode 시 `originalDeterminedTax`>0 필수, 납부지연 ON 시 `amendmentOriginalDeadline` 필수 |
| ⑨ | Zod enum 메인 | `lib/api/transfer-tax-schema.ts:469` 부근 | `amendment: amendmentSchema.optional()` 추가 |
| ⑩ | Zod companion | `-schema.ts:694` | **N/A** — amendment는 신고서(return) 단위, 자산-수준 아님. 단건 top-level만 |
| ⑪ | 자산 acquisitionDate fallback | — | N/A |
| ⑫ | **Zod 입력객체 정의** | `lib/api/transfer-tax-schema-sub.ts:358` 부근 | `amendmentSchema` 신설 (date=`z.string().date()`) |
| ⑬ | **body spread** | `transfer-tax-api.ts` `callTransferTaxAPI` | body에 `amendment` 포함 |
| ⑭ | **Route 엔진 매핑(Date)** | `app/api/calc/transfer/route.ts:331` 부근 | `amendment` → `originalPaymentDeadline`/`amendedPaymentDate` `toOptionalDate` 변환 |

> ⑫⑬⑭는 TS 미감지 → 누락 시 침묵 strip. grep 자가 점검 필수(정책 `feedback_api_zod_schema_sync`).

### 5.1 저장소 touch point (14 UI 지점 밖 — Critical, 별도 명시)
| 지점 | 파일 | 작업 |
|---|---|---|
| ⓢ1 이력 dedup | `lib/storage/business-key.ts:37` transfer case | `inputData.amendmentMode===true` 시 키 `\|amend` 접미 → 당초 record 미소실 |
| ⓢ2 이력 라벨 | `lib/storage/title-generator.ts` transfer | amendmentMode 시 "수정신고" 접두 |
| ⓢ3 진입 hydration | `components/history/HistoryDetailDrawer.tsx` `handleAmend` | 당초세액·법정신고기한 1회 세팅(useEffect 아님) |

---

## 6. 엔진 설계

### 6.0 법령 상수 — `legal-codes/common.ts` (PENALTY 확장)
```ts
// 국세기본법 §48②1호 수정신고 신고불성실가산세 감면율 (시행 20260701 검증)
export const AMENDMENT_REDUCTION_48_2 = [
  { maxMonths: 1,    rate: 0.90 }, // 가
  { maxMonths: 3,    rate: 0.75 }, // 나
  { maxMonths: 6,    rate: 0.50 }, // 다
  { maxMonths: 12,   rate: 0.30 }, // 라
  { maxMonths: 18,   rate: 0.20 }, // 마
  { maxMonths: 24,   rate: 0.10 }, // 바
] as const; // 24개월 초과 = 0
export const AMENDMENT_48_2 = "국세기본법 §48②1호";
```
`resolveAmendmentReductionRate(deadline, filingDate, notified)`: `notified`면 0. 아니면 **`addMonths` 날짜비교**(`filingDate <= addMonths(deadline, N)` 순차) — "N개월 이내" 세법해석 정확. **`differenceInCalendarMonths`/일수환산 금지**(일 버림→경계 오판정). **2년 초과 0**. (설계 §알고리즘 E1)

### 6.1 위치 — `transfer-tax-finalize.ts` STEP 12.5 (끝 append, 설계 E2)
STEP 11 총납부세액 이후 끝에 append(`determinedTax` line 308은 이미 확보). 신규 헬퍼 `lib/tax-engine/transfer-tax-amendment.ts`:
```ts
export function computeAmendment(input, determinedTax): AmendmentDetail | undefined
```
- `additionalTax = max(0, determinedTax − amendment.originalDeterminedTax)` (음수 가드 = 경정청구 영역)
- **신고불성실**(ON일 때):
  - `grossUnder = calculateFilingPenalty({determinedTax: additionalTax, originalFiledTax:0, reductionAmount:0, priorPaidTax:0, excessRefundAmount:0, interestSurcharge:0, filingType:"under", penaltyReason: underReportingReason}).filingPenalty` (= 추가납부세액 × 10/40/60%)
  - `reductionRate = underReductionMode==="auto_48_2" ? resolveAmendmentReductionRate(statutoryFilingDeadline, amendedFilingDate, priorAssessmentNotified) : 0`
  - `underReportingPenalty = truncateToWon(grossUnder × (1 − reductionRate))`
- **납부지연**(ON일 때): `calculateDelayedPaymentPenalty({unpaidTax: additionalTax, paymentDeadline: statutoryFilingDeadline, actualPaymentDate: amendedPaymentDate}).delayedPaymentPenalty`
  - ⚠️ **§48② 감면 미적용**(§48②1호는 §47의3만 해당 — 검증). 납부지연엔 reductionRate 곱하지 말 것.
- `additionalLocalIncomeTax = applyRate(additionalTax, 0.1)` (참고 — 지자체 별도 신고)
- `totalPayable = additionalTax + underReportingPenalty + latePaymentPenalty`
- `steps`: 당초/수정 결정세액·추가납부·(감면율 표기)신고불성실·납부지연·총납부 순으로 한국어 산식.

### 6.2 orchestrator/결과
- `finalize`가 `amendmentDetail`을 결과에 실어 반환(기존 `determinedTax`·`totalTax`는 **수정 후 전체값** 그대로 유지 — 참고용).
- amendment 모드에서는 결과뷰 헤드라인을 `amendmentDetail.totalPayable`로 전환(§7).
- **[Medium] 기존 무신고·과소신고 penalty 경로와 상호 배타 — 강제 지점 3곳**:
  1. **API 빌더(④)**: `form.amendmentMode===true`이면 `amendment` payload만 조립하고 `filingPenaltyDetails`/`delayedPaymentDetails` 블록은 **skip**(§2.2 기존 게이트 `enablePenalty && filingType!=="correct"` 위에 `!form.amendmentMode` AND 추가).
  2. **Zod refine(⑨)**: `amendment`와 `filingPenaltyDetails`/`delayedPaymentDetails` **동시 존재 금지**(`.refine`).
  3. **Route(⑭)**: `engineInput.amendment` 존재 시 기존 2-pass 주입 블록(`route.ts:757`) **미진입**(amendment는 finalize 내부 산정, 2-pass 불필요).
- **[High] finalize→result 명시 plumbing 5지점 (침묵 strip 방지, 설계 E6)**: `transfer-tax.ts:705~732`는 finalize를 **명시 구조분해+명시 재조립**(spread 아님) → `amendmentDetail`을 ①`FinalizeResult` 타입 ②finalize return ③`transfer-tax.ts:705` 구조분해 ④`:733` return ⑤`TransferTaxResult` **전부** 추가. TS 미감지 → Do 점검서 5지점 grep. 정책 `feedback_explicit_prop_mapping_strip`. (exempt·loss 조기반환 `:282`·`:411`은 finalize 미경유 → 경정청구 영역 delta=0, MVP 허용.)

### 6.3 정수 연산
- 모든 세액 `truncateToWon`, 율 적용 `applyRate`(floor). `Math.round` 금지.

---

## 7. UI 설계

### 7.1 진입 — `HistoryDetailDrawer`
- transfer 레코드에 **"수정신고 작성"** 버튼(기존 "이 조건으로 재계산" 옆). `handleAmend()`.
- **[High] 노출 가드**: `record.taxType==="transfer"` **AND** `record.resultData.mode==="single"` 일 때만 버튼 노출. mixed-use/bundled/multi는 `resultData.result.determinedTax` shape 부재 → 비노출(scope-out 일치).
- `handleAmend()` (hydration 1회 세팅 — useEffect 미러링 아님):
  ```ts
  updateFormData({
    ...(record.inputData as ...),          // 기존 handleResume hydrate
    amendmentMode: true,
    amendmentSourceId: record.id,
    originalDeterminedTax: String((record.resultData as any).result.determinedTax ?? ""),
    statutoryFilingDeadline: deriveStatutoryDeadline(record.inputData.transferDate), // (양도연도+1)-05-31
  });
  setStep(0); router.push(route);
  ```

- **[Critical] 이력 dedup 충돌 방지**: 자동저장은 `saveOrUpdateByBusinessKey`(`use-auto-save-calculation.ts:101`) 사용. transfer businessKey=`addr:주소|양도일`(`business-key.ts:40`) → **수정신고는 주소·양도일이 당초와 동일해 당초 record를 덮어씀(소실)**.
  - **정정**: `extractBusinessKey`의 transfer 케이스에 `inputData.amendmentMode===true`이면 키에 **`|amend` 접미** 추가 → 당초와 별도 record 유지. (같은 물건 재수정은 1건 갱신 = 허용.)
  - `title-generator`도 amendmentMode 시 "수정신고" 접두 라벨 → 이력 목록 구분.
  - **회귀 anchor**: 당초 저장 → 수정 저장 후 `list()`에 **2건** 존재 검증(당초 미소실).

### 7.2 계산기 상단 배너
- `amendmentMode` 시 amber 배너: "📝 수정신고 작성 중 — 당초 신고 기준으로 불러옴. 양도가액·취득가액·필요경비를 수정하세요."

### 7.3 Step 6 — 수정신고 패널(`AmendmentBlock`)
`amendmentMode`일 때 기존 무신고/과소신고 penalty 패널 **대신** 노출:
- **당초 결정세액**(CurrencyInput, prefill·수정가능) — "당초 신고·납부한 양도소득세 본세"
- **법정신고기한**(DateInput, `transferDate`로 자동도출 prefill·수정가능) — "확정신고기한 = 양도 다음해 5.31"
- **신고불성실가산세 적용** ToggleCard(기본 OFF)
  - ON 시: 부정행위 라디오(normal 10%/부정 40%/역외 60%) + **감면 방식 라디오**(`underReductionMode`):
    - `exempt` — "정당한 사유 면제(§48①2호)" [증액보상금 등 기본]
    - `auto_48_2` — "§48② 자진수정 감면" → 선택 시 **수정신고일** DateInput 노출 → 경과기간·감면율 자동 표시(예: "법정신고기한 후 4개월 → 50% 감면")
  - `priorAssessmentNotified` 체크박스: "세무서 경정 예고 후 수정신고(감면 배제)" + 안내
  - 안내: "판결·재결 확정 증액보상금은 통상 §48①2호 면제 대상"
- **납부지연가산세 적용** ToggleCard(기본 OFF) → ON 시 수정신고 납부(예정)일 DateInput
  - 안내: "납부지연가산세는 §48② 감면 대상이 아님(§47의4)"
- `ToggleCard`/`RadioCardGroup` 필수(native 금지 정책), `DateInput` 사용(type=date 금지 정책).

### 7.4 결과 — `AmendmentResultCard`
- **[Medium] Hero 전환**: `result.amendmentDetail` 존재 시 `TransferTaxResultView` 상단 "총 납부세액"(`:279`)을 **`amendmentDetail.totalPayable`("수정신고 추가 납부세액")로 교체**. 기존 전체 수정세액(`result.totalTax`)·지방소득세는 카드 내부 "참고 — 수정 후 전체 세액"으로 강등 표기(오해 방지).

표(금액 우측정렬 `amount-column-align`):
- 당초 결정세액 / 수정 결정세액 / **추가 납부 본세**
- (ON) 신고불성실가산세 (감면 적용 시 `× (1−감면율)` 산식 노출) / (ON) 납부지연가산세
- 참고: 추가 지방소득세(= 추가본세×10%) — **"지자체 별도 신고" 라벨**
- **수정신고 총 납부세액** = 추가본세 + 가산세
- 산식 한국어 풀어쓰기(변수 약어·`floor()` 금지 정책). 펼치기/접기 `ExpandToggleButton`, 인쇄 CSS-only 펼침.

---

## 8. 검증

### 8.1 Pre-Do anchor (Do 진입 전 1~2건 우선 작성·실행 — 정책 `pre-do-anchor-verification`)
`__tests__/tax-engine/transfer/amendment.test.ts` (추가납부 본세 delta 고정 = 20,000,000 기준):
- **A1**: 당초 30,000,000 / 수정 50,000,000, 가산세 OFF → `additionalTax=20,000,000`, `totalPayable=20,000,000`.
- **A2**: 동일 + 신고불성실 ON(normal, `underReductionMode:"exempt"`) → `underReportingPenalty=2,000,000`(20M×10%), `totalPayable=22,000,000`.
- **A3**: 동일 + 납부지연 ON(법정신고기한 2023-05-31 → 납부 2026-06-30, 현행 0.022%/일) → `latePaymentPenalty = truncateToWon(20M×경과일수×0.00022)` anchor(경과일수 실측 고정).
- **A4**: 수정세액 < 당초세액(경정청구 영역) → `additionalTax=0`(음수 가드), 모든 가산세 0.
- **A5**: 통합 — `calculateTransferTax` 전체 파이프라인에서 `amendmentDetail.totalPayable` 실측 anchor.
- **A6 (§48② 자동감면)**: 신고불성실 ON + `auto_48_2`, 법정신고기한 2024-05-31 → 수정신고일 2024-09-15(경과 3개월 초과 6개월 이내) → 감면율 50% → `underReportingPenalty = truncateToWon(2,000,000 × 0.5)=1,000,000`. 경계값 각 브래킷(1·3·6·12·18·24개월 경계) 별도 case.
- **A7 (§48② 납부지연 미적용 — 과다감면 방지 회귀)**: 신고불성실 `auto_48_2`(50% 감면) + 납부지연 동시 ON → **납부지연에는 감면율 미적용** 검증(납부지연 penalty가 A3와 동일해야 함).
- **A8 (경정 예고 배제)**: `auto_48_2` + `priorAssessmentNotified:true` → 감면율 0 → 신고불성실 = 2,000,000(A2와 동일).
- **A9 (저장소 — 당초 미소실, `__tests__/storage/`)**: 당초 신고(`amendmentMode:false`) 저장 → 동일 주소·양도일 수정신고(`amendmentMode:true`) 저장 → `extractBusinessKey` 두 키 상이(`|amend` 유무) → `list()` **2건** 유지. 당초 record 조회 성공(불러오기 원본 보존).

> anchor는 **실행 후 실패 확보**(현행 미구현이므로 자연 실패) → 설계 환류 기회. "현행 일치 예상" 금지.

### 8.2 E2E (`e2e/transfer-amendment.spec.ts`)
1. 당초 신고 입력→계산→이력 저장 확인
2. 이력 드로어 "수정신고 작성" → 폼 hydrate + 배너 노출 확인
3. 양도가액 수정 → 당초 결정세액 자동 prefill 확인
4. 가산세 OFF로 계산 → 추가 납부 본세만 표시
5. Network 탭 request body에 `amendment` 필드 포함 확인(⑬⑭ 실증)

### 8.3 회귀
- `npx vitest run __tests__/tax-engine/transfer-tax-penalty.test.ts`(기존 penalty 불변)
- `npx vitest run __tests__/tax-engine/transfer/` + `npm test`
- `npx tsc --noEmit` 0건

---

## 9. 작업 단계 (Phase)

```
Phase 0  Pre-Do anchor A1~A2 작성·실행(실패 확보)         → verify: 실패 메시지로 결과 타입 확정
Phase A  엔진 — 타입(input/result) + legal-codes §48②상수 + resolveAmendmentReductionRate
                + transfer-tax-amendment.ts + finalize STEP 12.5 + result plumbing 5지점 → verify: A1~A8 green
Phase B  Zod(⑫) + amendment↔penalty 상호배타 refine(⑨) + API 변환(④⑬) + Route 매핑(⑭)
                                                        → verify: tsc 0, body grep로 amendment 확인
Phase C  폼(①②③) + deriveStatutoryDeadline 헬퍼 + validate(⑧)  → verify: amendmentMode validation
Phase Cs 저장소 — extractBusinessKey `|amend`(ⓢ1) + title-generator "수정신고"(ⓢ2)
                                                        → verify: 2-record 회귀 anchor(A9) green
Phase D  UI — HistoryDetailDrawer 버튼(single-guard)+handleAmend(ⓢ3) + 배너
                + AmendmentBlock + AmendmentResultCard(hero swap)(⑤⑥⑦)  → verify: E2E 1~5 green
Phase E  회귀 전체 + 완료 자가점검(14지점 + ⓢ1~3 grep)   → verify: npm test green, tsc 0
```

## 10. 결정 사항 (사용자 확정 2026-07-01)

1. ✅ **범위 = 단건(single) only**. bundled/mixed-use/multi-transfer/부담부증여는 scope-out.
2. ✅ **§48② 경과기간별 자동감면 포함** (§3.4·6.0·6.1 반영). 단, 납부지연엔 미적용(검증). `exempt`(정당한 사유 면제) 옵션도 병행 유지 — 증액보상금 기본.
3. ✅ **당초 납부세액 = `resultData.result.determinedTax` 자동 추출 + 사용자 수정 허용**.

## 11. Scope Out (이번 미포함)

- 지방소득세 **본세**의 별도 수정신고서(참고 표시만).
- 경정청구(세액 감소) 전용 화면 — 추가납부세액 음수 가드만(§4 A4). 환급 신고서는 별도.
- bundled/mixed-use/multi-transfer/부담부증여 수정신고.
- 지방소득세 자동 delta 표시는 **참고값만**(지자체 별도 수정신고서 미생성).
- 국세부과 제척기간·특례제척기간 판정(안내 문구 수준만 고려).
- §48②3호다(예정신고 과소→확정신고기한 내 수정) 특례 — 확정신고 후 수정 전제라 제외, 안내만.

---

### 요약 — 재사용 vs 신규
- **재사용**: 이력 hydrate(`handleResume`), 가산세 순수 엔진(`calculateFilingPenalty`/`calculateDelayedPaymentPenalty`), 결과뷰 골격.
- **신규**: 수정신고 진입 버튼, `amendment` 입력/`amendmentDetail` 결과, `transfer-tax-amendment.ts`, `AmendmentBlock`/`AmendmentResultCard`, Zod `amendmentSchema`, validate·API·Route 매핑.
- **불변(Surgical)**: 기존 무신고·과소신고 penalty UI/엔진/2-pass 경로.
