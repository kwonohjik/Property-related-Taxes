# 버그 수정계획서 — 겸용주택 모드 좌측 사이드바 「취득가액 이후」 미표시

- 작성일: 2026-07-19
- 대상: 양도소득세 마법사 좌측 사이드바 자산별 요약(양도가액·취득가액·필요경비·공제감면)
- 유형: 버그 수정 (신규 엔진 input/result 타입 없음 — 기존 엔진 결과 재사용)
- 규모: 중 (핵심 수정 파일 1개 `lib/stores/transfer-per-asset-summary.ts` + 테스트)

---

## 1. 증상

겸용주택 분리계산(§160①단서) 토글 ON 상태에서, 좌측 사이드바가
**양도가액만 정상 표시**하고 그 아래 **취득가액·필요경비**는 값 대신
「계산 후 표시」(환산모드) 또는 「-」로만 나온다. 공제·감면도 사실상 비어 보인다.

- Image #8: 취득정보 「매매·환산취득가」인 겸용주택 자산 — 취득가액 = 「계산 후 표시」.

---

## 2. 근본 원인 (실측 — file:line)

사이드바 값은 순수 함수 `computeTransferPerAssetSummary(formData, result)`
(`lib/stores/transfer-per-asset-summary.ts:123`)가 도출하고, 오케스트레이터
`app/calc/transfer-tax/TransferTaxCalculator.tsx:398-444`가 렌더한다.
값 렌더 3분기: `value>0`→금액 / `pending`→「계산 후 표시」 / else→「-」
(`TransferTaxCalculator.tsx:387-393`).

### 원인 A — 취득가액 base가 겸용주택 분리 필드를 전혀 읽지 않음
`directAcqRaw`(`transfer-per-asset-summary.ts:73-75`)는
`fixedAcquisitionPrice`/`similarSalesValue`만, `directExpenseRaw`(`:78-81`)는
`capitalExpenditure`/`transferExpense`/`directExpenses`만 읽는다.
겸용주택 취득가액은 이 단일 필드가 아니라 **주택분/상가분 기준시가 환산**으로
엔진이 산출한다(`mixedAcqHousingPrice`·`mixedAcqCommercialBuildingPrice`·
`mixedAcqLandPricePerSqm`은 취득시 기준시가이지 취득가액이 아님 —
`lib/calc/transfer-tax-api-mixed-use.ts:64-84`, 필드 정의 `lib/stores/calc-wizard-asset-mixed-use.ts:53-55`).
→ `mixed` 문자열이 `transfer-per-asset-summary.ts` 내 **참조 0건**(grep 실증).
결과적으로 `acqBase=0`으로 출발(`:179-180`).

### 원인 B — 환산 프리뷰 게이트가 겸용주택을 이중 배제
`canPreviewEstimated`(`transfer-per-asset-summary.ts:137-145`)가
`!primary.isMixedUseHouse` **및** `!primary.hasSeperateLandAcquisitionDate`를 요구.
겸용 토글은 `hasSeperateLandAcquisitionDate:true`를 강제
(`components/calc/transfer/MixedUseSection.tsx:47-48`)하므로 이중으로 막힌다.
→ 입력 단계 프리뷰 산출 불가 → `acqPrice=0`, 환산모드면 `acqPending=true`(`:208`)
→ 「계산 후 표시」.

### 원인 C (결정적) — 결과 `mode:"mixed-use"`가 요약 함수에서 미처리 → 계산 후에도 누락
겸용주택 결과는 별도 모드다:
`type TransferAPIResult = SingleTransferResult | BundledTransferResult | MixedUseTransferResult`
이고 `MixedUseTransferResult = { mode: "mixed-use"; result: MixedUseGainBreakdown }`
(`lib/calc/transfer-tax-api.ts:38-39`, 엔진 `calcMixedUseTransferTax` `transfer-tax-mixed-use.ts:60`).

그런데 `computeTransferPerAssetSummary`는:
- `bundledResult = result?.mode === "bundled"` → 겸용은 null (`:128`)
- `singleResult = result?.mode === "single"` → 겸용은 null (`:129`)

따라서 취득가액 fallback 체인(`:182-212`)의 `bundledMatch`·`singleResult` 경로가
전부 비활성. 결과가 존재하므로(`!result`=false) `acqPending`은 false로 남고
`acqPrice=0` → **계산 후에는 「-」**로 표시된다.

> **정정**: 사전 조사(서브에이전트)는 "결과 도착 후 `singleResult`로 값이 채워진다 —
> 버그는 입력 단계 프리뷰에 국한"이라 보고했으나, 직접 실측 결과 겸용주택은
> `mode:"mixed-use"`라 single/bundled 어느 경로에도 걸리지 않는다. **버그는 입력 단계뿐
> 아니라 계산 완료 후에도 지속**된다. 이 정정이 수정 범위를 결정한다 — 원인 C(결과 처리)가
> 유일 필수 수정이며, 입력 단계 라이브 프리뷰(구 B안)는 rates 미보유로 기각(§4).

---

## 3. 케이스 매트릭스 (수정 전 현행 동작)

| 시점 | 취득방식 | 현행 취득가액 표시 | 원인 |
|---|---|---|---|
| 입력(결과 전) | 환산취득 | 「계산 후 표시」 | A+B → acqPending |
| 입력(결과 전) | 실지/감정 | 「-」(값 미반영) | A (분리 실가 필드 미读) |
| **계산 후** | 환산/실지/감정 | **「-」** | **C (mode:"mixed-use" 미처리)** |

필요경비도 동일 3케이스로 누락(`directExpenseRaw`·`expensePending` `:215-246`).
공제·감면(`:417-431`)은 `reductionTypes` 직접 읽어 별개 — 이 버그 무관.

---

## 4. 수정 방안

### 채택안 (single-source 엔진 재사용)

`computeTransferPerAssetSummary`에 **겸용주택 전용 분기**를 추가한다. 산식 재구현
금지(memory `feedback_ui_engine_dual_truth_avoidance`) — 기존 엔진/어댑터를 그대로 호출.

**C 수정 (유일 채택 — 계산 후 결과 재사용)**: `result.mode === "mixed-use"`를 우선 처리.
`result.result`(MixedUseGainBreakdown)에서 구조화 필드 추출:
- 취득가액 = `housingPart.estimatedAcquisitionPrice + commercialPart.estimatedAcquisitionPrice`
  (`types/transfer-mixed-use.types.ts:194,242`)
- 필요경비 = 주택·상가 각 토지·건물분 개산공제(§163⑥) 합
  `housingPart.landAppraisalDed(:210) + housingPart.buildingAppraisalDed(:218) +
  commercialPart.landAppraisalDed(:254) + commercialPart.buildingAppraisalDed(:262)`
- 양도가액 = 기존 경로 유지(actualSalePrice) — 정상 동작 중이므로 무변경.
- 라벨 매칭·steps 파싱 금지 — 구조화 필드만 사용(`feedback_no_internal_id_in_result`).
- 단일 자산 전제: 겸용은 `assets.length===1`(`transfer-tax-api.ts:6,129`) → `rows.map` 단일 행에 적용.
- **3중 패턴 무관**: C는 엔진 결과를 읽어 표시만 하는 **표시 전용(⑥)** 변경이라 API 변환(④)·
  validate(⑧) fallback 동기화가 불요하다(`feedback_store_default_vs_ui_display_fallback`은
  UI display fallback이 *입력값*을 대체할 때 적용 — 여기선 서버 결과 표시라 해당 없음).
  순수 함수(consumer useMemo) 유지 → useEffect→store 미러링 없음.

> **C만으로 보고된 버그(계산 후 취득가액 미표시)가 완결**된다. 결과 도착 후 값이 채워지고,
> 입력 단계는 「계산 후 표시」로 남아 라벨과 동작이 정합한다.

### 기각안 (STEP 1 검토 M-1 반영)

- **입력 단계 라이브 프리뷰(구 B안, 기각)**: 결과 도착 전에도 겸용 취득가액을 미리 보이려
  클라이언트에서 엔진을 직접 호출하는 방안은 **실행 불가**. `calcMixedUseTransferTax`
  (`transfer-tax-mixed-use.ts:60-66`)는 `rates: TaxRatesMap`을 필수 인자로 받고
  `:78 parseRatesFromMap(rates)`에서 즉시 사용하는데, `rates`는 Supabase preload(서버 API route
  전용)라 사이드바 요약 함수(클라이언트)에는 없다(클라이언트 `TaxRatesMap`/`preloadTaxRates`
  참조 0건). 라이브 프리뷰를 원하면 STEP 2/3 안분·환산(rates 불요 구간)만 뽑은 rates-free
  헬퍼 `computeMixedUseAcquisition(asset)`를 엔진에서 추출해 엔진·프리뷰가 공유해야 하나
  (single-source-engine-helper 리팩터) 비자명 → **별도 후속 이슈로 분리**. 핵심 버그와 무관.
- **경량 산식 재구현**(사이드바 전용 겸용 환산 축약식): dual-truth 유발 —
  엔진과 프리뷰가 어긋나면 사용자가 두 값을 보게 됨. **금지**.
- **현행 유지 + 안내문("겸용주택은 계산 후 표시")**: C가 실제 버그(계산 후에도 「-」)를
  방치하므로 부적합.

---

## 5. 구현 단계 (verify 포함)

1. **anchor 우선**: 겸용주택 입력(주택+상가, 환산모드) fixture로
   `computeTransferPerAssetSummary(formData, mixedResult)` 호출 → 취득가액/필요경비가
   `housingPart+commercialPart` 합과 일치하는지 실패 테스트 작성
   → verify: 수정 전 red(취득가액 0), 수정 후 green.
2. **C 구현**: `computeTransferPerAssetSummary` 초입에 `result.mode==="mixed-use"` 분기 —
   해당 자산(단일) 행의 acqPrice/expense를 breakdown 구조화 필드에서 채움
   → verify: 1의 anchor green + `npx tsc --noEmit` 0건.
3. **회귀**: `npx vitest run __tests__/tax-engine/transfer/` + 사이드바 관련 유닛 전체
   → verify: 비-겸용(single/bundled) 요약 무변경(회귀 0).
4. **E2E**: 겸용주택 입력→계산 후 사이드바 취득가액이 「-」 아닌 금액 노출 확인
   (기존 `e2e/` 겸용 스펙에 assertion 추가)
   → verify: Playwright green.

---

## 6. 리스크·비적용 범위

- **다건(bundled) 내 겸용주택**: 현행 아키텍처상 겸용은 단건(single-asset) 전제
  (`transfer-tax-api.ts:129` primary만 판정). C 분기도 단일 자산 행에 한정 —
  다건 겸용 혼합은 별도 이슈(본 계획 범위 밖, 명시).
- **입력 단계 라이브 프리뷰 부재**: C만 채택하므로 결과 도착 전 취득가액은 「계산 후 표시」로
  남는다(라벨·동작 정합). 라이브 프리뷰는 rates-free 엔진 헬퍼 추출을 요하는 후속 이슈(§4 기각안).
- **개산공제 필드 정확성**: 필요경비를 개산공제(§163⑥) 합으로 산출 — swap(§97②2호) 발동 시
  실제 필요경비는 자본적지출·양도비로 대체될 수 있음. breakdown의 `*AppraisalDed`는 "산식 표시용"
  필드(`types/transfer-mixed-use.types.ts` 주석)이므로, 겸용 엔진의 swap 플럼 여부를 Do 진입 전
  재확인(미확인 시 "필요경비는 개산공제 기준" 주석 명시). 참고 memory `feedback_97_2_swap_...`.
- **14 동기화 지점**: 신규 엔진 필드 없음(기존 result 재사용) → ⑫⑬⑭ 무관.
  변경은 **⑥ 사이드바 합계 표시 계층에만 국한**(⑦ 결과카드 `MixedUseResultCard.tsx`는
  이미 환산취득가액 표시 → 무변경).

---

## 7. Definition of Done

- [ ] 겸용주택 계산 후 사이드바 취득가액·필요경비가 breakdown 합계로 표시(핵심 C).
- [ ] anchor 테스트: 취득가액 = housingPart+commercialPart estimatedAcquisitionPrice.
- [ ] 비-겸용 요약 회귀 0.
- [ ] `npx tsc --noEmit` 0건 · 관련 vitest 전체 green.
- [ ] E2E: 겸용 계산 후 취득가액 금액 노출.
