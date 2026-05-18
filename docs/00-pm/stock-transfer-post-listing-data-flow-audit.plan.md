# 취득 후 상장 환산취득가 — 전 코드 데이터 흐름 감사 + Validation 강화 계획서

> 사용자 보고 — image 24에서 `transferDatePriceAvg1Month=8,659` 입력했음에도 결과 카드(image 25)에 취득가액 29,120,000 표시. 엔진 단위테스트(PL-1)는 정답 30,098,625를 정확히 반환하지만, 사용자 화면은 여전히 버그값. **데이터 흐름 어딘가에서 transferDatePriceAvg1Month가 엔진까지 도달하지 못하는 것이 확실**.
>
> 작성일 2026-05-18 · 대상: 전체 stock-transfer 데이터 흐름 + 결과 카드 + Validation

## 1. 사용자 요구

### 1.1 요구사항 #1 — Validation 강화

- `transferDatePriceAvg1Month` 미입력 시 "다음" 버튼 클릭하면 **즉시 오류 메시지 표시 + 계산 진행 차단**.
- 현재 validate.ts line 395에 검증 있지만 `acquiredBeforeListing=true + full mode` 경로에서 우회되는 것으로 추정.

### 1.2 요구사항 #2 — 전 코드 재검토 + 환산 버그 수정

사용자 입력값(8,659)이 엔진까지 정확히 도달하지 못하는 데이터 흐름 버그. **결과 카드 포함 전 path 감사 필요**.

## 2. 증거

| 항목 | 값 | 분석 |
|---|---|---|
| UI 입력 (image 24) | `transferDatePriceAvg1Month = 8,659` | 사용자 입력 명확 확인 |
| Engine 단위테스트 PL-1 | `30,098,625` PASS | 엔진 산식 정확 |
| 실제 결과 (image 25) | `취득가액 29,120,000` | **엔진은 fallback path를 탔거나 transferStd가 다른 값** |
| 사이드바 산출세액 | `1,283,880` | 12,838,800 × 10% (중소 비대주주 세율) — 비과세 echo |
| §163⑨ 계산 가설 | `44,750,000 × 5,824 / 8,950 = 29,120,000` | 분모가 1주당 양도가(fallback) = 8,950일 때만 일치 |

**결론**: transferDatePriceAvg1Month=8,659이 엔진까지 도달하지 못함. 데이터 흐름 어딘가에서 누락·overwrite·strip.

## 3. 전 코드 데이터 흐름 감사 대상 (10개 path)

| # | 경로 | 검증 의무 |
|---|---|---|
| **P-1** | `app/calc/stock-transfer-tax/steps/Step2.tsx` | UI input element의 onChange가 store에 8,659를 정확히 저장하는가? |
| **P-2** | `components/calc/stock-transfer/PostListingValuationCard.tsx` | FieldCard 안의 CurrencyInput onChange가 `transferDatePriceAvg1Month` key를 정확히 update하는가? |
| **P-3** | `lib/stores/calc-wizard-stock-store.ts` | store의 `transferDatePriceAvg1Month` field가 정확히 정의·initial·normalize되었는가? sessionStorage 잔류 데이터로 8,659이 overwrite되는가? |
| **P-4** | `lib/calc/stock-transfer-tax-api.ts:185` | callAPI가 `body.transferDatePriceAvg1Month = parseIntOrUndef(form.transferDatePriceAvg1Month)`를 정확히 set하는가? acquiredBeforeListing+full mode 분기에서 누락되는가? |
| **P-5** | `lib/tax-engine/stock-transfer/post-listing-flat-adapter.ts:adaptFlatToApiBody` | adapter가 body의 `transferDatePriceAvg1Month`를 silent overwrite하는가? |
| **P-6** | `lib/api/stock-transfer-tax-schema.ts` | Zod schema가 body의 `transferDatePriceAvg1Month`를 strip하는가? `.optional()` 기본값 0 reset 되는가? |
| **P-7** | `app/api/calc/stock-transfer/route.ts:133`(단건) | `coerced.transferDatePriceAvg1Month`가 engine input으로 정확히 매핑되는가? |
| **P-8** | `app/api/calc/stock-transfer/route.ts:221`(buildEngineInput) | 다자산 경로의 매핑은 동기화되었는가? |
| **P-9** | `lib/tax-engine/stock-transfer/stock-transfer-tax.ts:STEP 3` | acquiredBeforeListing 분기에서 `apply163_9Conversion` 정확히 호출되는가? `resolveTransferStd`가 8,659를 정확히 반환하는가? |
| **P-10** | `lib/tax-engine/stock-transfer/exempt-informational-acquisition.ts` | 비과세 echo 경로도 동일 산식 적용되는가? |

### 3.1 결과 카드 영역 (5개 컴포넌트)

| # | 컴포넌트 | 검증 의무 |
|---|---|---|
| **R-1** | `components/calc/results/StockTransferTaxResultView.tsx` | result.acquisitionPrice 또는 다른 path로 표시 — 자체 계산 코드 존재 여부 |
| **R-2** | `components/calc/results/PostListingDetailCard.tsx` | post.totalAcquisitionPrice를 echo하는가? 자체 계산이 result.acquisitionPrice와 불일치 가능성 |
| **R-3** | `components/calc/stock-transfer/StockFilingFormTable.tsx` + Helpers | 11행 취득가액(②) = result.acquisitionPrice 확인 (확인됨) |
| **R-4** | 사이드바 selector (`lib/stores/calc-wizard-stock-store.ts`의 computeStockSummary 등) | result.acquisitionPrice 사용 검증 |
| **R-5** | `lib/pdf/HistoryPdfDocument.tsx` | PDF 출력 시 취득가액 source |

## 4. 핫스팟 우선 검증 — adaptFlatToApiBody (P-5)

`adaptFlatToApiBody(form, true)` 함수는 full/listing_only 모드에서 호출되어 `body.postListingDetail` + 4개 필드 overwrite. **만약 adapter가 transferDatePriceAvg1Month를 새 값으로 overwrite한다면 사용자 입력 8,659이 silent drop**.

확인 의무:
```ts
const adapted = adaptFlatToApiBody(form, true);
// 확인 항목:
// 1. adapted.transferDatePriceAvg1Month 가 존재하는가? (있으면 body.transferDatePriceAvg1Month overwrite)
// 2. adapter 내부 어딘가에서 listingDatePriceAvg1Month → transferDatePriceAvg1Month 잘못 매핑?
```

## 5. 핫스팟 우선 검증 — 결과 카드 (R-2)

`PostListingDetailCard`는 `post.totalAcquisitionPrice` (= `finalPerShareValue × shareCount` = 29,120,000)를 echo. **만약 결과 카드가 result.acquisitionPrice(엔진 결과) 대신 post.totalAcquisitionPrice를 표시한다면**:
- 엔진은 30,098,625 반환
- 결과 카드는 29,120,000 표시
- 사용자가 본 증상과 일치

→ **이게 진짜 버그일 가능성 매우 큼**. PostListingDetailCard의 표시값 source 즉시 확인.

## 6. 수정 계획

### 6.1 항목 #1 — Validation 강화

`lib/calc/stock-transfer-tax-validate.ts`:

```ts
// 현재 line 395 (이미 있음)
if (acquisitionMode === "estimated") {
  const isListed = ["kospi", "kosdaq", "konex"].includes(form.marketType);
  if (isListed) {
    if (isEmpty(form.transferDatePriceAvg1Month) || parseInt(form.transferDatePriceAvg1Month.replace(/,/g, ""), 10) <= 0) {
      errors.push({
        field: "transferDatePriceAvg1Month",
        message: "양도일 직전 1개월 종가 평균을 입력하세요 (§163⑨ 환산 분모 — 미입력 시 환산 미적용)",
        severity: "error",
      });
    }
  }
}
```

**추가 강화**:
- `acquiredBeforeListing=true` 분기에서 명시적으로 한 번 더 검증 (defense in depth).
- StockTransferTaxCalculator.tsx handleNext에서 validateStep2 통과 못하면 `window.scrollTo({top:0})` + 에러 배너 강조 (이미 적용됨).
- 입력값이 빈 문자열이거나 "0"인 경우 모두 차단.

### 6.2 항목 #2 — 결과 카드 + 데이터 흐름 전수 감사

#### Step 1: 결과 카드 표시 source 검증 (R-2 가장 의심)

`PostListingDetailCard.tsx` line 67-69 현행:
```tsx
<p className="font-medium text-violet-900">
  §163⑨ 환산취득가 = 양도가 × (1주당 취득기준 ÷ 1주당 양도기준)
  = {result.transferPrice} × ({result.valuationDetail?.conversionAcqStdPerShare ?? post.finalPerShareValue} ÷ {result.valuationDetail?.conversionTransferStd ?? 0}) = {result.acquisitionPrice}
</p>
```

→ result.acquisitionPrice 직접 표시 (정상). 만약 사용자 화면에 29,120,000이 보인다면 **엔진이 진짜로 29,120,000을 반환**.

#### Step 2: 사이드바 — computeStockSummary 또는 동등 selector 확인

`lib/stores/calc-wizard-stock-store.ts`의 사이드바 selector가 `result.acquisitionPrice`를 직접 사용하는지 확인. 자체 계산 코드가 있다면 fix.

#### Step 3: API 변환 — callAPI body 로깅 / 진단

`lib/calc/stock-transfer-tax-api.ts:185` 부근에 임시 console.log 추가 (개발용):
```ts
console.log("[DIAG] callAPI transferDatePriceAvg1Month input:", form.transferDatePriceAvg1Month);
const transferAvg = parseIntOrUndef(form.transferDatePriceAvg1Month);
console.log("[DIAG] callAPI transferAvg parsed:", transferAvg);
if (transferAvg !== undefined) body.transferDatePriceAvg1Month = transferAvg;
console.log("[DIAG] callAPI body.transferDatePriceAvg1Month:", body.transferDatePriceAvg1Month);
```

브라우저 콘솔에서 실제 값을 확인하면 원인 path 즉시 식별.

#### Step 4: route.ts 진단

route.ts의 coerced.transferDatePriceAvg1Month 로깅 추가. Zod parse 결과 확인.

#### Step 5: 엔진 진단

`stock-transfer-tax.ts STEP 3`에서 `console.log("[DIAG] engine STEP 3 transferDatePriceAvg1Month:", input.transferDatePriceAvg1Month)` 추가. 엔진까지 도달하는 값 확인.

#### Step 6: 결과 화면에 진단 표시 (이미 PR 84e4370에 추가됨)

`PostListingDetailCard`의 `conversionTransferStd` 표시. 사용자가 실제 분모값을 직접 확인 가능 (이미 적용).

### 6.3 우선순위

1. **즉시**: Validation 강화 (요구사항 #1). 5분.
2. **즉시**: PostListingDetailCard의 result.acquisitionPrice 표시 진단 확인 + 사용자에게 분모값 알려달라고 요청.
3. **그 다음**: callAPI/route.ts/엔진에 임시 console.log 추가 + 사용자 브라우저 콘솔 출력 요청.
4. **최후 수단**: 사용자 form data sessionStorage 초기화 안내 (`localStorage.clear()` 또는 시크릿 탭).

## 7. 가장 가능성 큰 원인 (사용자에게 확인 요청)

### 시나리오 A — adaptFlatToApiBody가 transferDatePriceAvg1Month 누락 (Code Bug)

`adaptFlatToApiBody(form, true)`가 listingDatePriceAvg1Month와 혼동하여 transferDatePriceAvg1Month를 잘못 매핑하거나 누락. 코드 audit 필수.

### 시나리오 B — sessionStorage 잔류 / dev server HMR 미반영 (Environment)

사용자가 PR 4299c5b 이전 dev server를 보고 있어, 새로운 UI 입력 필드는 보이지만 store update가 잘못된 path로 갈 가능성. sessionStorage 초기화 + dev server 재시작 필요.

### 시나리오 C — store key mismatch

form.transferDatePriceAvg1Month가 정의되지 않은 key였거나, normalize fallback에서 ""로 reset됨.

## 8. Definition of Done

- [ ] Validation 강화 — `transferDatePriceAvg1Month` 미입력 시 acquiredBeforeListing 분기에서도 명시 차단
- [ ] P-1~P-10 10개 경로 전수 코드 grep + 데이터 흐름 진단
- [ ] R-1~R-5 결과 카드 5개 컴포넌트 표시 source 검증 (result.acquisitionPrice 사용 확인)
- [ ] adaptFlatToApiBody의 transferDatePriceAvg1Month 처리 확인 (silent overwrite 차단)
- [ ] 진단 console.log 일시 삽입 → 사용자 브라우저 콘솔 출력으로 실제 데이터 흐름 추적
- [ ] 원인 path 식별 후 즉시 fix
- [ ] sessionStorage 마이그레이션 안내 (사용자 환경 이슈인 경우)
- [ ] 사용자 환경에서 30,098,625 정확 표시 확인
- [ ] anchor 추가 — full mode + acquiredBeforeListing + transferDatePriceAvg1Month=8,659 조합 직접 anchor

## 9. 후속 위험 회피

- 진단 로그 삽입 시 prod 빌드 영향 — `if (process.env.NODE_ENV === "development")` 가드
- 결과 카드 산식 표시는 진단 echo 필드 사용 (이미 PR 84e4370 적용)
- 다음에 같은 증상 발생 시 진단 화면 자동 노출

## 10. 후속 PR 후보

- 환산 모드 전체 경로 통합 anchor (PR 5b91463·c067338·84e4370 모두 cross-cutting)
- adaptFlatToApiBody 결과 타입에 명시적 Omit/Pick 선언으로 silent overwrite 차단
- store sessionStorage version bump으로 강제 마이그레이션
