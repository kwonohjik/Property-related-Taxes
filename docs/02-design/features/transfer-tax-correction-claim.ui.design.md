# 양도소득세 경정청구(세액 감소·환급) — UI 설계

> 작성 2026-07-02. 대응 엔진: `transfer-tax-correction-claim.engine.design.md`. 계획: `docs/00-pm/transfer-tax-correction-claim.plan.md`.
> 범위: 양도소득세 단건(single)만. 자매(수정신고): `transfer-tax-amendment.ui.design.md`.
> 정책: `mirror-pattern`·`feedback_useeffect_store_mirror_forbidden`·`feedback_ui_engine_dual_truth_avoidance`·`feedback_result_view_korean_formula`·`amount-column-align`·`feedback_no_unfavorable_application_without_legal_basis`.

## 1. 사용자 시나리오

1. 사용자가 당초 양도를 계산·저장(당초 신고서, 이력 record A).
2. 사후 **과다신고 발견**(양도가액 과다·취득가액/필요경비 과소·감면 누락·수용재결 감액 등) → `/history`에서 record A 드로어 → **"경정청구 작성"** 클릭.
3. 마법사가 당초 입력으로 hydrate + 상단 **경정청구 배너** + 당초 결정세액·법정신고기한·경정청구일(오늘) 자동 채움.
4. 사용자가 과다신고 항목(양도가액 하향·취득가액/필요경비 상향)을 정정.
5. Step 6에서 **경정청구 사유 유형**(일반 5년 / 후발적 3개월) 선택.
6. 계산 → **환급 청구세액** 결과 카드(당초 vs 경정 비교 + 청구기한 + 환급가산금 안내).
7. 저장 시 당초 record A·수정신고 record는 **보존**, 경정청구는 별도 record(`|refund`)로 저장.

## 2. 진입 — `HistoryDetailDrawer` (버튼 2개)

```
┌ 이력 상세 (양도소득세) ─────────────────────────────┐
│ 서울 강남구 …  2022-05-01                            │
│ 결정세액  50,000,000원                               │
│ ─────────────────────────────────────────────────── │
│ [ 이 조건으로 재계산 ]                                │
│ [ 수정신고 작성 ]        [ 경정청구 작성 ]★신규       │
│ [ 내보내기 ]  [ 삭제 ]                                │
└──────────────────────────────────────────────────────┘
```
- **[가드]** 두 버튼 공통: `record.taxType==="transfer"` **AND** `record.resultData.mode==="single"`. (`drawer-amend`·`drawer-correction` testid.)
- `handleRefundClaim()` — hydration 1회(**useEffect 미러링 아님**):
  ```ts
  updateFormData({
    ...(record.inputData as ...),
    amendmentMode: true,
    correctionKind: "refund_claim",
    applyUnderReportingPenalty: false, applyLatePaymentPenalty: false, // [F6] amend 플래그 차단
    amendmentSourceId: record.id,
    originalDeterminedTax: String(record.resultData.result.determinedTax ?? ""),
    statutoryFilingDeadline: deriveStatutoryDeadline(record.inputData.transferDate),
    amendedFilingDate: todayLocalISO(),   // [F7] 경정청구일=오늘 → 도과 경고 활성
  });
  setStep(0); router.push("/calc/transfer-tax");
  ```
- 기존 `handleAmend`에 `correctionKind:"amend"` 명시 1줄 추가(default 일치).

## 3. 상단 배너 (마법사 전 스텝 공통 — `TransferTaxCalculator`)

`amendmentMode` 시 `correctionKind` 분기:
```
┌ 📄 경정청구 작성 중 ────────────────────────── sky ┐
│ 당초 신고(서울 강남구 · 2022-05-01) 기준으로 불러왔습니다. │
│ 과다신고 항목(양도가액·취득가액·필요경비)을 정정하세요.     │
│ 당초 결정세액 50,000,000원과 비교해 환급세액을 계산합니다.  │
└──────────────────────────────────────────────────────┘
```
> amend는 기존 amber "📝 수정신고 작성 중" 유지. `correctionKind==="refund_claim"`이면 sky 문구.

## 4. 입력 위젯 — Step 6 `AmendmentBlock` (correctionKind 분기)

**[U1]** Step6 렌더 분기는 기존 그대로: `{form.amendmentMode ? <AmendmentBlock/> : <penalty 패널/>}`. `AmendmentBlock` **내부에서** `correctionKind` 분기.

refund_claim일 때 (rose→**sky** 톤, 제목 "⑤ 경정청구", "…환급세액을 계산합니다 (국세기본법 §45의2)"):
```
┌ ⑤ 경정청구 ─────────────────────────────── sky ┐
│ 당초 결정세액 *          [ 50,000,000 ] 원          │  ← prefill·수정가능
│                                                     │
│ 경정청구 사유 유형:                                  │  RadioCardGroup
│   (●일반 — 법정신고기한 후 5년)                      │
│     └ 법정신고기한 * [ 2023-05-31 ]  ← 파생·수정가능 │
│   (○후발적 사유 — 안 날부터 3개월, §45의2②)         │
│     └(선택 시) 후발적 사유 안 날 [ 2026-06-01 ]      │
│                                                     │
│ 경정청구일 *            [ 2026-07-02 ]  ← 오늘 기본  │
│ 당초 납부일(선택)       [ 2022-08-31 ]              │
│   → "환급가산금 기산일 = 2022-09-01 (납부일 다음날)" │  form 계산·표시
│                                                     │
│ ┌ 청구기한 ─────────────────────────────────────┐  │  엔진 단일진실
│ │ 청구기한 2028-05-31 — 청구 가능                 │  │  (도과 시 rose)
│ └───────────────────────────────────────────────┘  │
│ ⓘ 환급금에는 국세환급가산금(납부일 다음날~지급결정일,│
│    연 3.1%)이 가산되며 세무서가 산정·지급합니다.      │  callout
└─────────────────────────────────────────────────────┘
```
- **[U2 dual-truth 회피]** 청구기한·도과 프리뷰는 **엔진 헬퍼 `resolveClaimDeadline` import**(AmendmentBlock가 `resolveAmendmentReductionRate` import하는 패턴 그대로). UI 재구현 금지(`feedback_ui_engine_dual_truth_avoidance`). display only, store 미러링 아님.
- **[F2]** "당초 납부일 → 기산일" 표시는 **AmendmentBlock 내부 계산**(form.originalPaymentDate + 1일). form-only(엔진 미전송).
- `ToggleCard`/`RadioCardGroup`(native 금지)·`DateInput`(type=date 금지)·`CurrencyInput`.
- 톤: refund=**sky**(면적·일반 tone, 환급=중립긍정). 신고불성실/납부지연 ToggleCard는 refund에서 **미렌더**.

## 5. 결과 카드 — `AmendmentResultCard` (correctionKind 분기)

**[F13 — Hero 분기 재정렬]** `TransferTaxResultView`:
```tsx
{result.isExempt && result.amendmentDetail?.correctionKind !== "refund_claim" ? (
  <🎉 비과세 hero />                       // amend·비amendment의 비과세만
) : result.amendmentDetail ? (
  <AmendmentResultCard detail={..} fullTotalTax={result.totalTax} />  // refund/amend
) : ( <총 납부세액 normal /> )}
```
> 비과세 경정(전액환급)이 🎉에 가리지 않도록 refund_claim을 최상단 승격(엔진 F1 조기반환 주입과 짝).

refund_claim일 때 (amber→**emerald** 톤, hero "환급 청구세액"):
```
┌ 환급 청구세액 ─────────────────────────────── emerald ┐
│                         20,000,000 원                 │  ← Hero = refundTax
│ ──────────────────────────────────────────────────── │
│ 당초 결정세액                        50,000,000 원   │  우측정렬 tabular-nums
│ 경정 결정세액                        30,000,000 원   │
│ 환급세액                             20,000,000 원   │  bold
│ ──────────────────────────────────────────────────── │
│ 청구기한 (일반 5년)                  2028-05-31      │  도과 시 rose + "경과"
│ 참고 · 지방소득세 환급(지자체 별도)    2,000,000 원   │  muted
│ 참고 · 경정 후 전체 세액             30,000,000 원   │  muted(fullTotalTax)
│ ⓘ 환급금에는 국세환급가산금(납부일 다음날~지급결정일,  │
│    연 3.1%)이 가산되며 세무서가 산정·지급합니다.        │  generic callout
│ [ ▾ 산출근거 펼치기 ]                                 │  print:자동펼침
└───────────────────────────────────────────────────────┘
```
- Hero·rows는 `detail.correctionKind==="refund_claim"` 분기. amend는 기존 amber "수정신고 추가 납부세액" 유지.
- **[J3] 환급액 0 케이스**(`detail.refundTax === 0`, 경정 ≥ 당초): hero "환급 청구세액 0" 아래 muted 안내 "환급액 없음 — 경정 결정세액이 당초 결정세액 이상입니다(경정청구 실익 없음)". 계산·표시는 허용(하드 차단 아님).
- 청구기한 = `detail.claimDeadline`(ISO string) + `detail.claimReasonType` 라벨("일반 5년"/"후발적 3개월"). `detail.isDeadlineExceeded`면 rose tone + "⚠️ 청구기한 경과 — 개별 확인".
- **[J1 톤]** 입력=sky(중립)·결과=emerald(긍정 환급)·배너=sky. amend rose→amber 선례와 평행(의도적). **[J4]** AmendmentBlock section 래퍼 className은 `correctionKind` 조건부(refund=sky, amend=rose 하드코딩 대체).
- **환급가산금 callout = generic**(카드 form 미접근 — 기산일 없이 안내. `REFUND_GAIN_RATE_ANNUAL` 참조 "연 3.1%").
- 산식 한국어 풀어쓰기(`feedback_result_view_korean_formula`). 금액칸 `font-mono tabular-nums text-right`. 펼침 `ExpandToggleButton`, 인쇄 CSS-only.

## 6. 14 동기화 지점 (UI 측)

| # | 지점 | 처리 |
|---|---|---|
| ① FormState | `TransferFormData` += `correctionKind`·`claimReasonType`·`posteriorEventDate`·`originalPaymentDate`(4, 계획 §5.1) |
| ② INITIAL | `defaultFormData`: correctionKind:"amend"·claimReasonType:"ordinary"·나머지 "" |
| ③ normalize | merge 스프레드 흡수(신규 default 병합 확인) |
| ④ API 변환 | refund일 때 `amendment` payload += correctionKind·claimReasonType·posteriorEventDate, **penalty flags false 강제**(F6). originalPaymentDate·penalty 블록 미전송 |
| ⑤ UI 위젯 | `AmendmentBlock` refund 분기(§4) + 배너(§3) + 진입버튼(§2) |
| ⑥ 사이드바 | (선택) 환급세액 프리뷰 — **result 도착 후만**(경정결정세액=엔진 산출) |
| ⑦ 결과 카드 | `AmendmentResultCard` refund 분기(§5) + **[F13] ResultView 분기 재정렬** |
| ⑧ validation | §7 |
| ⑫ Zod | `amendmentSchema.extend` correctionKind·claimReasonType enum·posteriorEventDate date(선택 posterior refine) |
| ⑬ body | `callTransferTaxAPI` body에 amendment(내부 필드 확장) |
| ⑭ Route | correctionKind·claimReasonType 전달 + posteriorEventDate `toOptionalDate` |
| ⓢ1~3 저장소 | businessKey `\|refund`·title "경정청구"·`handleRefundClaim`(계획 §6.1) |

## 7. Validation 규칙 (`lib/calc/transfer-tax-validate.ts`)

`amendmentMode === true` 블록(기존 `:250`) 확장(`feedback_validation_sync_8th_point`):
- `originalDeterminedTax > 0` — **기존 규칙(:251) 재사용**(amendmentMode 전체 커버, refund 포함).
- **[F5 신규]** `correctionKind==="refund_claim" && claimReasonType==="posterior" && !posteriorEventDate` → 차단("후발적 사유 안 날을 입력하세요").
- amend 전용(`:253` auto_48_2, `:259` 납부지연)은 penalty 게이트 → refund(플래그 false)에서 **미발동**(실측 확인, 조치 불요).
- **[J2] 비차단 경고 채널**(하드 차단 아님): **도과** = AmendmentBlock 청구기한 프리뷰(rose, 입력 시점 — 날짜 있으면 판정 가능) + 결과 카드. **환급액 0** = 결과 카드만(계산 후 확정). `collectStepWarnings`는 선택(도과를 step 3 경고로 노출 가능).

## 8. E2E (`e2e/transfer-correction-claim.spec.ts`)

1. 당초 신고 입력→계산→이력 저장 확인.
2. 이력 드로어 **"경정청구 작성"**(`drawer-correction`, single record) → sky 배너 노출 + 당초 결정세액 prefill 확인.
3. 양도가액 **하향** 수정 → 계산 → **환급 청구세액** 카드 표시.
4. ordinary 사유 → 청구기한 노출. (posterior 선택 시 후발적 사유 안 날 필드 노출.)
5. **Network 탭 request body에 `amendment.correctionKind:"refund_claim"` 포함** 확인(⑫⑬⑭ 실증).
6. 저장 후 `/history`에 당초·경정청구 **각 record** 존재(`|refund` — 당초 미소실, R9).
> 셀렉터: RadioCardGroup·ToggleCard=`role=switch`/`role=radio`, 배너=텍스트 `/경정청구 작성 중/`, 결과=`/환급 청구세액/`.
