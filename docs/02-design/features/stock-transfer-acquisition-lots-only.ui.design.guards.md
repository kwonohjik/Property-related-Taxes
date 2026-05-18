# 주식 양도세 — 취득가액 다건 입력 모드 UI 설계 (차단 정책·위험·DoD)

> **상위 파일**: [`stock-transfer-acquisition-lots-only.ui.design.md`](stock-transfer-acquisition-lots-only.ui.design.md) — §1~§6 (시나리오·UI 명세·케이스 인벤토리·14지점·컴포넌트·onChange 패턴)
> **본 파일**: §7~§12 (차단 정책·Zod refine·3중 패턴·위험·DoD·참조)

---

## 7. 분할 모드 차단 — `lotsMode === "split"` 시 서브토글 미노출

### 이유

- split 모드는 Step1 SplitLotsBlock에서 매수·매도 lot 모두 입력
- Step2에서 `acquisitionActualInputMode` 서브토글 노출 시 의미 없음 + 혼란 유발

### 구현

```tsx
// Step2.tsx 취득가액 섹션 내
{acquisitionMode === "actual" && !isSplitMode && (
  // 서브토글 + per_share/lots 분기 전체 (상위 파일 §5 참조)
)}

{acquisitionMode === "actual" && isSplitMode && (
  // 기존 disabled CurrencyInput 단독
  <CurrencyInput
    label="1주당 취득가액"
    required
    disabled
    hint="분할 모드에서는 매수 lot에서 자동 산출됩니다 (Step1 참조)"
    value={form.perShareAcquisitionPrice}
    onChange={(v) => onChange({ perShareAcquisitionPrice: v })}
  />
)}
```

**normalize 처리**: split 모드 전환 시 `acquisitionActualInputMode` 값 리셋 불필요 — 서브토글 미노출로 충분. normalize에서 값 보존 (단순 무시 패턴, 계획서 §4.2).

---

## 8. total 모드 차단 — `transferActualInputMode === "total"` 시 lots 옵션 disabled

### 이유 (계획서 §2.3)

`transferActualInputMode === "total"` 상태에서 합성 transferLot의 `perShareTransferPrice`는 `transferTotalPrice / shareCount`로 역산되어야 하는데, 정수 나눗셈 잔돈 발생 가능 → 엔진 결과 1원 오차 위험.

### UI 구현

```tsx
options={[
  { value: "per_share", label: "1주당 단가", description: "1주당 취득가액 × 주식수" },
  {
    value: "lots",
    label: "일자별 다건",
    description:
      transferActualInputMode === "total"
        ? "양도가액 합계 모드에서는 지원하지 않습니다 (역산 잔돈 발생)"
        : "여러 시점 분할 매수 lot별 입력",
    disabled: transferActualInputMode === "total",
  },
]}
```

### Zod refine 이중 차단 (⑨⑩) — 엔진 시니어 책임

```typescript
// addStockRefines 내 추가 refine (L-4 차단)
.refine(
  (data) => !(
    (data.transferActualInputMode ?? "per_share") === "total" &&
    (data.acquisitionActualInputMode ?? "per_share") === "lots"
  ),
  {
    message: "양도가액 합계 모드와 취득 다건 입력 모드를 동시에 사용할 수 없습니다",
    path: ["acquisitionActualInputMode"],
  }
)
```

### ⑫ Zod 입력 객체 정의 — 엔진 시니어 책임

```typescript
// stockTransferInputSchema 객체에 추가 (누락 시 침묵 stripping)
acquisitionActualInputMode: acquisitionActualInputModeSchema.optional(),
```

### ⑭ Route handler 엔진 input 매핑 — 엔진 시니어 책임

**선결 버그 수정 (계획서 §0)**: 단건 POST 핸들러 + `buildEngineInput()` 2곳 모두 split 필드 4종 매핑 추가.

```typescript
// buildEngineInput() 에 추가 (Date 변환 — lib/api/date-coerce.ts toDate/toOptionalDate)
if (parsed.acquisitionLots && parsed.acquisitionLots.length > 0) {
  engineInput.acquisitionLots = parsed.acquisitionLots.map((lot) => ({
    ...lot,
    acquisitionDate: toDate(lot.acquisitionDate, "acquisitionLots[].acquisitionDate"),
    decedentAcquisitionDate: toOptionalDate(lot.decedentAcquisitionDate),
    preMergerAcquisitionDate: toOptionalDate(lot.preMergerAcquisitionDate),
  }));
}
if (parsed.transferLots && parsed.transferLots.length > 0) {
  engineInput.transferLots = parsed.transferLots.map((lot) => ({
    ...lot,
    transferDate: toDate(lot.transferDate, "transferLots[].transferDate"),
  }));
}
if (parsed.costAllocationMethod) {
  engineInput.costAllocationMethod = parsed.costAllocationMethod;
}
if (parsed.specificMatchings) {
  engineInput.specificMatchings = parsed.specificMatchings;
}
```

---

## 9. `feedback_store_default_vs_ui_display_fallback` 정책 — 3중 패턴 일치 표

신규 필드 `acquisitionActualInputMode`의 default `"per_share"` 전수 점검.

| Layer | 위치 | 코드 | default 값 |
|---|---|---|---|
| ① FormData 타입 | `calc-wizard-stock-store.ts` | `acquisitionActualInputMode: "per_share" \| "lots"` | (타입 정의) |
| ② INITIAL factory | `createInitialStockFormData()` | `acquisitionActualInputMode: "per_share"` | `"per_share"` |
| ③ normalize | `normalizeStockFormData()` | `enumField("acquisitionActualInputMode", [...], defaults.acquisitionActualInputMode)` | `"per_share"` |
| ⑤ UI localvar | `Step2.tsx` | `const acquisitionActualInputMode = form.acquisitionActualInputMode \|\| "per_share"` | `"per_share"` |
| ⑥ Sidebar | `StockSidebar.tsx` | `const acqInputMode = formData.acquisitionActualInputMode \|\| "per_share"` | `"per_share"` |
| ④ API 변환 | `stock-transfer-tax-api.ts` | `const acqInputMode = form.acquisitionActualInputMode \|\| "per_share"` | `"per_share"` |
| ⑧ validate | `stock-transfer-tax-validate.ts` | `(form.acquisitionActualInputMode \|\| "per_share") === "lots"` | `"per_share"` |

**모두 `"per_share"` 일치** — UI display fallback 단독 + store 실값 `""` 유지 패턴 발생 없음. factory default `"per_share"` 명시가 single source of truth.

---

## 10. 위험·회피 (계획서 §8 인용 + UI 추가)

| # | 위험 | 회피 |
|---|---|---|
| R-0 | **선결 — route.ts split 매핑 누락** (pre-existing) | §0 선결: 단건 + buildEngineInput 2곳 split 필드 4종 매핑 추가 + LO-PRE-1 anchor |
| R-1 | lots + total 양도 조합 잔돈 오차 | Zod refine 차단 + UI disabled + validate 이중 차단 |
| R-2 | 양도 주식수 > 매수 lot 합계 | validate Step2에서 오류 차단 (≤ 시 통과) |
| R-3 | costAllocationMethod undefined 시 엔진 split 분기 미진입 | API 변환에서 `\|\| "fifo"` default 강제 |
| R-4 | specific 매칭 UI 누락 | specific 옵션 disabled + disabledReason + Zod refine 차단 |
| R-5 | 합성 transferLot ID 충돌 | 명시적 prefix `"__synth_single_transfer__"` |
| R-6 | lots 진입 시 빈 배열 → UI 공백 → 사용자 혼란 | RadioCardGroup onChange 시점 자동 1행 추가 (useEffect 금지) |
| R-7 | split 모드 + `acquisitionActualInputMode="lots"` 충돌 | split 모드 시 서브토글 미노출 (UI 차단) |
| R-8 | 800줄 정책 — Step2.tsx 증분 | Step2 현행 338줄 + 약 80줄 = ~418줄. AcquisitionLotsMatrix 별도 파일 분리로 최소화 |
| R-9 | ⑫⑬⑭ TypeScript 미감지 침묵 stripping | Zod schema `acquisitionActualInputMode` 명시 + body spread 명시 + Route handler 2곳 grep 자가 점검 |
| R-10 | 사이드바 lots 미리보기 vs FIFO 불일치 | 사이드바는 가중평균 근사치 표시 목적으로 허용. 정확 결과는 result 우선 |
| R-11 | normalize — lots 상태 유지 후 split 모드 전환 | split 모드 시 서브토글 미노출 + normalize에서 값 보존 |
| R-12 | `createInitialAcquisitionLot` 팩토리 중복 | `SplitLotsBlock` 내 `addAcquisitionLot` 로직과 동일 → store 파일에 `export function createEmptyAcquisitionLot()` 단일화 권장 |

---

## 11. Definition of Done 체크리스트

### UI 시니어 책임 항목

- [ ] `StockTransferFormData` 인터페이스 `acquisitionActualInputMode: "per_share" | "lots"` 1필드 추가 (①)
- [ ] `createInitialStockFormData()` `acquisitionActualInputMode: "per_share"` 추가 (②)
- [ ] `normalizeStockFormData()` `enumField("acquisitionActualInputMode", ...)` 추가 (③)
- [ ] `Step2.tsx` 취득가액 실가 섹션 서브토글 + 분기 렌더링 구현 (⑤)
- [ ] `AcquisitionLotsMatrix.tsx` 신규 컴포넌트 작성 (⑤)
- [ ] `StockSidebar.tsx` single 모드 취득가액 계산 분기 추가 (⑥)
- [ ] `npx tsc --noEmit` 0건
- [ ] `npx vitest run __tests__/tax-engine/stock-transfer/` 회귀 통과
- [ ] 브라우저 수동 확인: L-1~L-5 5분기 정상 동작 + L-4·L-6 차단 확인 + 자동 1행 추가 UX

### 엔진 시니어 책임 항목 (참조)

- [ ] `§0 선결`: route.ts 단건 POST + buildEngineInput 2곳 split 필드 4종 매핑 추가
- [ ] `LO-PRE-1 anchor`: API 경로 split 모드 회귀 보호
- [ ] API 변환 ④ lots-only 분기 추가 + 합성 transferLot (⑬)
- [ ] Zod schema `acquisitionActualInputMode` 등록 (⑨⑫)
- [ ] Zod refine L-4 차단 (⑩)
- [ ] validate ⑧ lots 모드 검증 추가
- [ ] Route handler ⑭ lots 매핑 + Date 변환
- [ ] anchor LO-1 ~ LO-5 통과

---

## 12. 참조 파일

| 파일 | 역할 |
|---|---|
| `lib/stores/calc-wizard-stock-store.ts` | ①②③ 동기화 지점 |
| `app/calc/stock-transfer-tax/steps/Step2.tsx` | ⑤ 입력 위젯 (현행 338줄) |
| `components/calc/stock-transfer/AcquisitionLotsMatrix.tsx` | ⑤ 신규 sub-component |
| `components/calc/stock-transfer/SplitLotsBlock.tsx` | 재사용 패턴 참조 (445줄) |
| `components/calc/stock-transfer/StockSidebar.tsx` | ⑥ 사이드바 합계 (148줄) |
| `lib/calc/stock-transfer-tax-api.ts` | ④⑬ API 변환 |
| `lib/api/stock-transfer-tax-schema.ts` | ⑨⑩⑫ Zod schema |
| `app/api/calc/stock-transfer/route.ts` | ⑭ Route handler |
| `lib/calc/stock-transfer-tax-validate.ts` | ⑧ validation |
| `components/calc/stock-transfer/StockTransferTaxResultView.tsx` | ⑦ 결과 카드 (변경 없음) |
