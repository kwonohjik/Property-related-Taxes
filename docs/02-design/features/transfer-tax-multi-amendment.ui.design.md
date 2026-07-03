# 양도소득세 다자산(일괄·다건) 수정신고·경정청구 — UI 설계

> 계획서: `docs/00-pm/transfer-tax-multi-amendment.plan.md`. 엔진: `transfer-tax-multi-amendment.engine.design.md`.
> 범위: **일반 다자산**(§166⑥ bundled + multi 직접입력). 부담부증여·겸용주택·general_building 일괄 제외.
> 단건 수정신고·경정청구 UI(`AmendmentBlock`·`AmendmentResultCard`·`CorrectionModeBanner`)를 **재사용**하고, 진입 판별·결과카드 주입 위치만 다자산으로 확장. 모든 file:line은 실측(추정 금지).

## 사용자 시나리오

1. 세무사가 2자산을 함께 양도해 **일괄양도(§166⑥)** 로 계산·저장 → 이후 한 자산에 증액보상금 수령.
2. 이력 목록에서 그 다자산 카드의 **[수정신고]** 클릭 → 메인 마법사가 **2자산 모두 복원** + "수정신고 작성 중" 배너.
3. 해당 자산 양도가액 상향 → 재계산 → **추가납부세액 hero**(당초 총결정 대비) + 자산별 안분 표(참고).
4. 별도 **다건 직접입력 계산기**로 만든 신고서도 이력 카드에서 동일하게 진입(→ `/calc/transfer-tax/multi` 재진입).
5. 경정청구는 방향만 반대(환급세액 hero + 청구기한).

---

## 진입 — 이력 버튼 (공유 판별자)

### 판별 헬퍼 `classifyAmendableTransfer(record)` → `"single"|"bundled"|"multi"|null`
`lib/calc/transfer-amendment-entry.ts` 신규. 3개 렌더 지점의 `mode==="single"` 로컬 판정을 대체(단일 소스).
```ts
export function classifyAmendableTransfer(record: CalculationRecord): "single"|"bundled"|"multi"|null {
  if (record.taxType !== "transfer") return null;
  const rd = record.resultData as { mode?: string; transferBurdenedGiftBreakdown?: unknown; properties?: unknown };
  if (rd.mode === "single") return "single";
  if (rd.mode === "bundled") {
    const assets = (record.inputData as { assets?: unknown[] }).assets;
    if ((assets?.length ?? 0) > 1 && !rd.transferBurdenedGiftBreakdown) return "bundled"; // general_building=단일물건 배제·부담부증여 배제
    return null;
  }
  if (rd.mode === undefined && Array.isArray(rd.properties)) return "multi"; // AggregateTransferResult 직접(mode 래퍼 없음)
  return null; // mixed-use 등
}
```

### 버튼 렌더 (3지점 — `mode==="single"` → `classifyAmendableTransfer(record) !== null`)
- 카드 `HistoryClient.tsx:568`, 드로어 `HistoryDetailDrawer.tsx:287`(수정신고)·`:299`(경정청구).
- 클릭 핸들러: `const kind = classifyAmendableTransfer(record)` → `kind==="multi" ? enterMultiAmendment(record, router) : enterAmendment(record, router)`. (경정청구도 동일 분기.)

### 진입 함수 (3-way, `transfer-amendment-entry.ts`)
- **single·bundled 공용** `enterAmendment`/`enterRefundClaim`: 당초세액 소스 fallback
  `const rd = record.resultData; const originalDeterminedTax = String(rd.result?.determinedTax ?? rd.aggregated?.determinedTax ?? "")`.
  companionAssets는 `...record.inputData` spread로 자동 복원. 라우트 `/calc/transfer-tax`.
- **multi 신규** `enterMultiAmendment`/`enterMultiRefundClaim`: multi-store `setForm({ ...(inputData as MultiTransferFormData), amendmentMode:true, correctionKind, originalDeterminedTax: String(rd.determinedTax ?? ""), statutoryFilingDeadline: deriveStatutoryDeadline(`${inputData.taxYear}-12-31`), amendedFilingDate:(refund만 오늘), applyUnderReportingPenalty:false, applyLatePaymentPenalty:false })` + `/calc/transfer-tax/multi`.
- clientId 관문 스킵(`setActiveClientId`) 3-way 공통.
- ⚠️ [[mirror-pattern]] 당초세액·기한 = **hydration 1회**(useEffect→store 금지).

---

## 입력 패널

### §166⑥ (메인 마법사 — 재사용)
- Step6 `AmendmentBlock`(`TransferTaxCalculator.tsx:448` `amendmentMode` prop)이 **companionAssets 유무 무관 렌더**. 변경 없음.
- **Do 확인**: 자산 2건(bundled)일 때 마법사가 AmendmentBlock 포함 step까지 도달하는지(입력 step은 single·bundled 공유).
- 배너 `CorrectionModeBanner`(재사용) — refund_claim=sky / amend=amber.

### multi (다건 계산기 — settings step 이식)
- `MultiTransferTaxCalculator.tsx` STEP `"settings"`에 `AmendmentBlock` 추가(amendmentMode 시 노출).
- **바인딩(실측 U2)**: `AmendmentBlock`은 `{ form: TransferFormData; onChange: (d: Partial<TransferFormData>) => void }` **컨트롤드**. multi 재사용 = `MultiTransferFormData`에 **단건과 동일 이름**의 amendment 필드(§엔진 §5.3)를 두고 `<AmendmentBlock form={form as unknown as TransferFormData} onChange={(d) => setForm(d)} />`. AmendmentBlock이 읽는 필드(`originalDeterminedTax`·`correctionKind`·`claimReasonType`·`statutoryFilingDeadline`·`posteriorEventDate`·`amendedFilingDate`·penalty 플래그)만 매칭되면 동작. ∴ **필드명 동일성이 재사용 전제**.
- ```
  ┌ 정정 신고 (settings) ────────────────────────┐
  │ [배너] 📄 경정청구 작성 중 — 당초 신고 불러옴  │
  │ 당초 결정세액  [ 123,456,789 ] (prefill·수정)  │
  │ ○ 수정신고  ● 경정청구   (correctionKind)      │
  │  └ 사유: ○일반(5년) ○후발적(3개월)             │
  │ 청구기한 2027-05-31 — 청구 가능                 │
  └───────────────────────────────────────────────┘
  ```
- `DateInput`(type=date 금지)·`RadioCardGroup`(native 금지) 필수. select-on-focus 준수.

---

## 결과 카드 (재사용 `AmendmentResultCard`)

### §166⑥ — `BundledAllocationCard` 상단 주입 (A4)
`TransferTaxCalculator.tsx:522` else 분기에서, `aggregated.amendmentDetail` 있으면 `AmendmentResultCard`를 `BundledAllocationCard` **위**에 렌더:
```tsx
{result.mode === "bundled" && result.aggregated.amendmentDetail && (
  <AmendmentResultCard detail={result.aggregated.amendmentDetail} fullTotalTax={result.aggregated.totalTax} />
)}
<BundledAllocationCard ... />   {/* 자산별 안분 표 = 참고로 유지 */}
```
- hero = `additionalTax`(수정신고) / `refundTax`(경정청구, emerald). correctionKind 분기·청구기한 도과 경고는 카드 내부 로직 **재사용**.

### multi — `MultiTransferTaxResultView` 상단 주입 (B6)
`MultiTransferTaxResultView.tsx:650`에서 `result.amendmentDetail` 있으면 동일 카드 상단 렌더. 자산별 그룹세액 표는 아래 유지(참고).

> 표시 금액 우측정렬·`font-mono`([[amount-column-align]]). 산식 한국어 풀어쓰기. 펼치기 `ExpandToggleButton`, 인쇄 CSS-only([[print-only-css-toggle]]).

---

## testid (E2E 앵커)

| 요소 | testid | 위치 |
|---|---|---|
| 카드 수정신고 | (기존 재사용, 없으면) `card-amend-{id}` | HistoryClient |
| 카드 경정청구 | `card-correction-{id}` | HistoryClient |
| 드로어 수정신고 | `drawer-amend`(기존) | HistoryDetailDrawer:287 |
| 드로어 경정청구 | `drawer-correction`(기존) | HistoryDetailDrawer:299 |
| 다자산 정정 hero | `amendment-hero`(기존 카드) | AmendmentResultCard |
| multi settings amendment | `multi-amendment-block` | MultiTransferTaxCalculator |

---

## 14 동기화 지점 (UI 파트)

계획서 §6.5 표 참조. UI 책임 = ①②③⑤⑦⑧(Track A는 대부분 재사용, Track B는 신설) + 진입(A3·B7). 엔진(E)·저장소(S3)·Zod/route(⑨⑫⑬⑭)는 엔진/route 파트.

## 정책 준수 체크
- [[mirror-pattern]] hydration 1회(useEffect→store 금지).
- [[feedback_no_silent_apportion_fallback]] 당초세액 미입력 → validate 차단(silent 0 금지).
- [[feedback_ui_engine_dual_truth_avoidance]] 청구기한·환급세액 = 엔진 `amendmentDetail` 단일진실(UI 재계산 금지).
- native 토글/날짜 금지, select-on-focus, "원" 접미 금지.
