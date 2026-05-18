# 주식 양도소득세 — 양도가액 합계 직접 입력 모드 추가 계획서 v2

> 작성일: 2026-05-18 (v2 정정: 파일 경로·Zod 위치·route 2곳 매핑·calcTransferPriceSimple 함수명·사이드바 실코드 정정)
> 작성자: Claude (Opus 4.7)
> 영향 도메인: `lib/stores/calc-wizard-stock-store.ts` + `lib/tax-engine/stock-transfer/` + `lib/calc/stock-transfer-tax-*.ts` + `lib/api/stock-transfer-tax-schema.ts` + `app/api/calc/stock-transfer/route.ts` + `app/calc/stock-transfer-tax/steps/Step2.tsx` + `components/calc/stock-transfer/StockSidebar.tsx`
> 우선순위: **P1 (UX 개선)** — 단가가 정수 나누어 떨어지지 않는 실거래(예: 비상장 양수도 계약서가 총액으로만 명시) 입력 지원

## 1. 배경

### 1.1 현행 동작 (`Step2.tsx:69-150`)

`transferPriceMode === "actual"` 모드는 **1주당 양도가액 단일 입력**만 허용:

```
양도가액 합계: 44,750 × 5,000주 = 223,750,000
```

엔진 `stock-transfer-tax.ts:112`:
```ts
transferPrice = (input.perShareTransferPrice ?? 0) * shareCount;
```

### 1.2 한계

비상장 양수도 계약서·재무제표·등기부등본의 양도대금이 **총액(round number)**으로 표시되는 경우 — 1주당 단가로 역산 시 소수점 잔돈(예: 250,000,000 ÷ 5,000 = 50,000원 / 250,000,001 ÷ 5,000 = 50,000.0002원)이 발생해 사용자가 입력값을 강제로 잘라야 하고, 엔진 계산값이 계약서 총액과 1~수원 차이를 보임. PDF anchor 회귀에서 round 누락 +1/−1 차이 검증 필요.

### 1.3 요구사항 (사용자, 2026-05-18)

> 양도가액은 사용자가 직접 양도가액을 입력할 수 있는 방법과 지금처럼 주당 단가에 양도 주식수를 곱하여 계산하는 방법을 모두 사용할 수 있도록

→ **양자택일 라디오 + 동일 결과 보장**.

## 2. 설계 결정

### 2.1 enum 확장 vs 서브모드 — 서브모드 채택

**옵션 A 기각**: `transferPriceMode` enum에 `"actual_total"` 추가
- 사유: 엔진 분기·Zod·validate·API 3중 패턴이 모두 "actual"을 가정한 부분(`stock-transfer-tax.ts:111` / `stock-transfer-tax-api.ts:99` / `stock-transfer-tax-validate.ts:285`)이 ramify되어 swap 비교·교환 분기와의 cross-check 비용 증가.

**옵션 B 채택**: `transferPriceMode === "actual"` 내부에 서브토글 `transferActualInputMode: "per_share" | "total"` 추가
- 사유: "actual"이라는 큰 분기 의미(실가)는 유지 + 입력 방식만 sub-branch. exchange 분기와 직교.
- 결과 echo 시 `transferPrice` 값만 의미를 가지므로 엔진은 final amount만 알면 됨 → 분기 최소화.

### 2.2 단가 모드와의 일관성 (자기일관성 표시)

총액 모드라도 화면 미리보기에 **역산된 1주당 단가**(`총액 ÷ 주식수`)를 표시(소수점 4자리). 단가가 정확히 떨어지지 않으면 회색 안내 문구 노출. 엔진 계산에는 사용하지 않음(표시 전용).

```
총액 250,000,001 ÷ 5,000주 = 50,000.0002 (참고)
```

### 2.3 분할 모드(`lotsMode === "split"`) 적용 제외

분할 모드는 lot별 1주당 단가가 의미 있고(매칭·가중평균), 총액 입력은 lot 매칭과 충돌. **분할 모드에서는 총액 모드 선택 disabled**.

### 2.4 교환 모드(`transferPriceMode === "exchange"`) 무관

교환은 부동산·채무·현금 합산이라 총액 입력 토글이 의미 없음. 영향 없음.

### 2.5 부담부증여·세대생략 등 cross-cutting

본 입력은 엔진 `transferPrice` 결과값만 바꾸므로 후속 파이프라인(증여세 통합·세율 적용·LTHD)에 transparent. 추가 분기 불필요.

## 3. 데이터 모델 변경

### 3.1 폼 타입 (`lib/stores/calc-wizard-stock-store.ts`)

```ts
// L113 부근, transferPriceMode 직후
transferActualInputMode: "per_share" | "total";  // 3중 패턴 default: "per_share"
transferTotalPrice: string;                       // 원 (콤마 포맷 저장값은 raw)
```

- `INITIAL_FORM_DATA` (L210): `transferActualInputMode: "per_share"`, `transferTotalPrice: ""`
- `normalize` (L319 부근):
  - `enumField("transferActualInputMode", ["per_share", "total"], "per_share")`
  - `strField("transferTotalPrice")`
- sessionStorage 마이그레이션 (L403 부근): legacy 폼에 없으면 default로 채움.

### 3.2 엔진 Input 타입 (`lib/tax-engine/stock-transfer/types/stock-transfer.types.ts`)

```ts
// L69 부근, perShareTransferPrice 직후
/** 실가 입력 방식 (transferPriceMode === "actual" 한정). default "per_share" */
transferActualInputMode?: "per_share" | "total";
/** 총액 직접 입력 (transferActualInputMode === "total" 시 필수, 원) */
transferTotalPrice?: number;
```

optional + default 처리로 회귀 0 보장.

### 3.3 결과 타입 (변경 없음)

`StockTransferResult.transferPrice`는 final 합산값만 노출. 입력 방식 echo는 별도 필드 없이 `CalculationStep` 산식 문구로만 표시(§4.2).

## 4. 엔진 변경

### 4.1 `stock-transfer-tax.ts:108-120` — 본문 분기

```ts
if (lotMatchingDetail) {
  transferPrice = lotMatchingDetail.totalTransferPrice;
} else if (input.transferPriceMode === "actual") {
  const actualMode = input.transferActualInputMode ?? "per_share";
  if (actualMode === "total") {
    transferPrice = input.transferTotalPrice ?? 0;
  } else {
    transferPrice = (input.perShareTransferPrice ?? 0) * shareCount;
  }
} else {
  // exchange — 무변경
}
```

### 4.1b `calcTransferPriceSimple()` helper (L527-536) — 동일 분기

```ts
function calcTransferPriceSimple(input: StockTransferInput): number {
  if (input.transferPriceMode === "actual") {
    const mode = input.transferActualInputMode ?? "per_share";
    if (mode === "total") return input.transferTotalPrice ?? 0;
    return (input.perShareTransferPrice ?? 0) * input.shareCount;
  }
  return (input.exchangePropertyValue ?? 0)
       + (input.exchangeDebtRelief ?? 0)
       + (input.exchangeCash ?? 0);
}
```

⚠️ v1 표기 오류 정정: 함수명은 `computeTransferPrice`가 아닌 `calcTransferPriceSimple`.

### 4.2 `CalculationStep` 산식 분기

- per_share: `"44,750원 × 5,000주 = 223,750,000원"` (현행)
- total: `"양도가액 합계 직접 입력 = 250,000,000원 (참고: 1주당 50,000원)"`

### 4.3 swap 비교·환산 cross-check

`§97② 2호 단서 swap`은 `transferPrice` final 값만 참조 → 영향 없음.

`acquisitionMode === "estimated"` (상장 환산 §163⑥4 개산공제 1%)는 `transferPrice × 1%` 기반 → 영향 없음.

## 5. UI 변경 (Step2.tsx)

### 5.1 모드 구조

```
양도가액 방식 (RadioCardGroup, tone=emerald)
├ 실가 (actual)
│   ├ 입력 방식 (RadioCardGroup inline, tone=emerald)  ← 신규
│   │   ├ 1주당 단가 (per_share, default) — "1주당 양도가액 × 주식수"
│   │   └ 합계 직접 입력 (total) — "양도가액 총액을 원 단위로 직접 입력"
│   ├ [per_share] 1주당 양도가액 CurrencyInput + 합계 미리보기
│   └ [total]     양도가액 합계 CurrencyInput + 역산 단가 참고
└ 교환 (exchange) — 무변경
```

### 5.2 분할 모드 제약

- `lotsMode === "split"` 시 `transferActualInputMode` 라디오 자체를 노출하지 않거나, "합계 직접 입력" 옵션을 disabled + reason `"분할 모드에서는 lot별 단가만 지원됩니다 (Step1)"`.

### 5.3 사이드바 (`StockSidebar.tsx:38-61`) — 실제 코드 정정

기존 single 분기(L47~60)를 다음과 같이 확장:

```ts
} else {
  // single 모드
  const actualMode = formData.transferActualInputMode || "per_share";
  let transferPrice: number | null = null;
  if (actualMode === "total") {
    const total = parseAmount(formData.transferTotalPrice);
    transferPrice = total > 0 ? total : null;
  } else {
    const perShare = parseAmount(formData.perShareTransferPrice);
    const count = parseInt(formData.shareCount || "0", 10);
    transferPrice = perShare > 0 && count > 0 ? perShare * count : null;
  }
  const exchangeTotal =
    parseAmount(formData.exchangePropertyValue) +
    parseAmount(formData.exchangeDebtRelief) +
    parseAmount(formData.exchangeCash);
  effectiveTransferPrice =
    (formData.transferPriceMode || "actual") === "exchange"
      ? (exchangeTotal > 0 ? exchangeTotal : null)
      : transferPrice;
}
```

⚠️ v1 표기 오류 정정: `transferTotal` 변수명·`?? "per_share"` 미사용 (3중 패턴 `||` 통일).

### 5.4 결과 카드 (변경 없음)

`StockTransferResultView`는 `result.transferPrice` final 값만 표시. CalculationStep 산식이 §4.2에서 분기되어 자동 노출.

## 6. API · validation · Zod (14지점)

### 6.1 `lib/calc/stock-transfer-tax-api.ts:97-110` (지점 ④⑬)

```ts
// ── 양도가액 ──
body.transferPriceMode = transferPriceMode;        // 3중 패턴 default: "actual"
if (transferPriceMode === "actual") {
  const actualMode = form.transferActualInputMode || "per_share";  // 3중 패턴 default
  body.transferActualInputMode = actualMode;
  if (actualMode === "total") {
    const total = parseIntOrUndef(form.transferTotalPrice);
    if (total !== undefined) body.transferTotalPrice = total;
  } else {
    const perShare = parseIntOrUndef(form.perShareTransferPrice);
    if (perShare !== undefined) body.perShareTransferPrice = perShare;
  }
} else {
  // exchange — 무변경 (기존 L104~109)
}
```

→ 한쪽 모드 값만 body에 보내 cross-mode silent overwrite 방지.

### 6.2 Zod 스키마 (지점 ⑨⑫) `lib/api/stock-transfer-tax-schema.ts`

⚠️ v1 표기 오류 정정: Zod는 route.ts inline이 아니라 별도 모듈(`lib/api/stock-transfer-tax-schema.ts`)에 위치.

**(a) 신규 enum schema** — L33 `transferPriceModeSchema` 직후:
```ts
export const transferActualInputModeSchema = z.enum(["per_share", "total"]);
```

**(b) `stockTransferInputSchema` 본문** — L128~133 양도가액 블록 확장:
```ts
// 양도가액
transferPriceMode: transferPriceModeSchema,
transferActualInputMode: transferActualInputModeSchema.optional(),  // default "per_share"
perShareTransferPrice: z.number().min(0).optional(),
transferTotalPrice: z.number().int().min(0).optional(),
exchangePropertyValue: z.number().min(0).optional(),
exchangeDebtRelief: z.number().min(0).optional(),
exchangeCash: z.number().min(0).optional(),
```

**(c) `addStockRefines` superRefine** — L234 분할 모드 게이트 안에 차단 1건 추가 + 단건 mode=total 필수성 1건 추가:
```ts
// 분할 게이트 안 (line 265 directly after exchange 차단):
if (data.transferActualInputMode === "total") {
  ctx.addIssue({
    code: z.ZodIssueCode.custom,
    path: ["transferActualInputMode"],
    message: "분할 모드에서는 양도가액 합계 직접 입력을 지원하지 않습니다 (lot별 단가 사용)",
  });
}

// 분할 게이트 밖 (refine 본문 최상위):
if (
  data.transferPriceMode === "actual" &&
  (data.transferActualInputMode ?? "per_share") === "total" &&
  (!data.transferTotalPrice || data.transferTotalPrice <= 0)
) {
  ctx.addIssue({
    code: z.ZodIssueCode.custom,
    path: ["transferTotalPrice"],
    message: "총액 직접 입력 시 양도가액 합계는 0보다 커야 합니다",
  });
}
```

### 6.3 Route handler 매핑 (지점 ⑭) `app/api/calc/stock-transfer/route.ts`

⚠️ v1 표기 오류 정정: 경로는 `/api/calc/stock-transfer-tax/`가 아닌 `/api/calc/stock-transfer/`. **2곳 매핑 필요**:

**(a) 단건 POST 핸들러** — L121~125 양도가액 블록 확장:
```ts
transferPriceMode: coerced.transferPriceMode as StockTransferInput["transferPriceMode"],
transferActualInputMode: coerced.transferActualInputMode as StockTransferInput["transferActualInputMode"],
perShareTransferPrice: coerced.perShareTransferPrice as number | undefined,
transferTotalPrice: coerced.transferTotalPrice as number | undefined,
exchangePropertyValue: coerced.exchangePropertyValue as number | undefined,
...
```

**(b) 다자산 합산 `buildEngineInput()`** — L200~204 동일 패턴 추가. 누락 시 다자산 경로 silent stripping.

### 6.4 validate (지점 ⑧) `lib/calc/stock-transfer-tax-validate.ts:308-313`

`validateStep2` (L281~) single 모드 양도가액 블록(L309~314) 교체:

```ts
// ── 양도가액 (single 모드) ──
if (transferPriceMode === "actual") {
  const actualMode = form.transferActualInputMode || "per_share";  // 3중 패턴 default
  if (actualMode === "total") {
    if (isEmpty(form.transferTotalPrice) || parseI(form.transferTotalPrice) <= 0) {
      errors.push({ field: "transferTotalPrice", message: "양도가액 합계를 입력하세요", severity: "error" });
    }
  } else {
    if (isEmpty(form.perShareTransferPrice) || parseI(form.perShareTransferPrice) <= 0) {
      errors.push({ field: "perShareTransferPrice", message: "1주당 양도가액을 입력하세요", severity: "error" });
    }
  }
} else if (transferPriceMode === "exchange") {
  // 무변경 (기존 L314~324)
}
```

→ UI/API/validate 3중 패턴 동기화. 분할 모드(L290~307)는 lot 단위 검증이라 `transferActualInputMode` 무관.

## 7. 14지점 동기화 매트릭스

| # | 지점 | 위치 | 변경 |
|---|---|---|---|
| ① | FormData | `lib/stores/calc-wizard-stock-store.ts:113` 부근 | `transferActualInputMode: "per_share" \| "total"` + `transferTotalPrice: string` |
| ② | initial | `INITIAL_FORM_DATA:210` 부근 | `transferActualInputMode: "per_share"`, `transferTotalPrice: ""` |
| ③ | normalize | `normalize:319` 부근 | `enumField("transferActualInputMode", ["per_share","total"], "per_share")` + `strField("transferTotalPrice")` |
| ④ | API 변환 | `lib/calc/stock-transfer-tax-api.ts:97-110` | §6.1 분기 |
| ⑤ | UI 위젯 | `app/calc/stock-transfer-tax/steps/Step2.tsx:91-111` | §5.1 RadioCardGroup + 두 CurrencyInput |
| ⑥ | 사이드바 합계 | `components/calc/stock-transfer/StockSidebar.tsx:47-60` | §5.3 single 분기 확장 |
| ⑦ | 결과 카드 산식 | `lib/tax-engine/stock-transfer/stock-transfer-tax.ts` STEP 2 (CalculationStep 빌드 위치 grep 필요) | §4.2 분기 |
| ⑧ | validate | `lib/calc/stock-transfer-tax-validate.ts:309-313` | §6.4 |
| ⑨ | Zod enum 신규 | `lib/api/stock-transfer-tax-schema.ts:34` 부근 | `transferActualInputModeSchema = z.enum([...])` |
| ⑩ | Zod enum 컴패니언 | (해당 없음 — 자산-수준 아님) | — |
| ⑪ | acquisitionDate fallback | (해당 없음) | — |
| ⑫ | Zod 입력 객체 정의 | `lib/api/stock-transfer-tax-schema.ts:128-133` 양도가액 블록 + `addStockRefines:265+` superRefine 2건 | §6.2 |
| ⑬ | API body spread | `lib/calc/stock-transfer-tax-api.ts` 본문 | `body.transferActualInputMode` + `body.transferTotalPrice` 명시 spread (§6.1) |
| ⑭ | Route handler 엔진 매핑 (**2곳**) | `app/api/calc/stock-transfer/route.ts:121` 단건 + `:200` `buildEngineInput()` 다자산 | §6.3 — 한 곳 누락 시 다자산 silent stripping |

⑫⑬⑭ TypeScript 미감지 위험 — grep 자가 점검 강제. ⑭는 **2곳 모두** 누락 여부 명시 점검.

## 8. 케이스 매트릭스

| # | lotsMode | transferPriceMode | actualInputMode | 양도가액 결정 |
|---|---|---|---|---|
| 1 | single | actual | per_share | `perShare × shareCount` (현행) |
| 2 | single | actual | total | `transferTotalPrice` (신규) |
| 3 | single | exchange | (N/A) | `property + debt + cash` (현행) |
| 4 | split | actual | per_share | `lotMatchingDetail.totalTransferPrice` (현행) |
| 5 | split | actual | total | **차단** (UI disabled + Zod refine 경고) |
| 6 | split | exchange | (N/A) | 현행 (사실상 미사용) |

## 9. 테스트 anchor (Pre-Do 검증 우선)

### 9.1 회귀 보호 (per_share 기존 동작 보존)

기존 모든 stock-transfer anchor → `transferActualInputMode` 미지정 시 default "per_share"로 회귀 0. 별도 신규 anchor 불필요.

### 9.2 신규 anchor

**T-TOTAL-1** — 단순 total 모드
```ts
input: { transferPriceMode: "actual", transferActualInputMode: "total", transferTotalPrice: 250_000_000, shareCount: 5000 }
→ result.transferPrice === 250_000_000
```

**T-TOTAL-2** — per_share와 결과 일치
```ts
A: { ..., transferActualInputMode: "per_share", perShareTransferPrice: 50_000, shareCount: 5000 }
B: { ..., transferActualInputMode: "total", transferTotalPrice: 250_000_000, shareCount: 5000 }
→ A.산출세액 === B.산출세액
```

**T-TOTAL-3** — 단가 정확히 떨어지지 않는 케이스(1원 차이)
```ts
input: { transferActualInputMode: "total", transferTotalPrice: 250_000_001, shareCount: 5000 }
→ result.transferPrice === 250_000_001 (per_share 모드 250_000_000과 1원 차이 보존)
```

**T-TOTAL-4** — split + total 조합 차단 (validate)
```ts
form: { lotsMode: "split", transferActualInputMode: "total" }
→ validate errors 포함: transferActualInputMode | split 모드 미지원
```

**T-TOTAL-5** — exchange 모드는 actualInputMode 무시
```ts
input: { transferPriceMode: "exchange", transferActualInputMode: "total", exchangePropertyValue: 100_000_000 }
→ result.transferPrice === 100_000_000 (exchange 분기 우선)
```

## 10. PDCA 단계별 작업 분배

| 단계 | 담당 | 산출물 |
|---|---|---|
| Plan | (본 문서) | 계획서 확정 |
| Design | `stock-transfer-tax-senior` + `stock-transfer-tax-ui-senior` 병렬 호출 | `docs/02-design/features/stock-transfer-actual-total-input.engine.design.md` + `*.ui.design.md` |
| Do (시퀀셜) | 엔진 시니어 → ①②③④⑧⑨⑩⑪⑫⑭ + anchor 5건<br>UI 시니어 → ⑤⑥⑦ | 엔진 차감/추가 / Step2 라디오 + 사이드바 |
| Check | `ui-engine-sync-checker` + `bkit:gap-detector` | 14지점 read-only + matchRate |
| Act | 회귀 후속 + 디자인 환류 | recent-completions.md 업데이트 |

## 11. 위험·회피

| 위험 | 영향 | 회피 |
|---|---|---|
| per_share 모드 → total 모드 토글 시 stale `perShareTransferPrice` 잔존 → validate 통과 시 엔진 분기로 무시되지만 사용자 혼란 | UX | total 모드 진입 시 `perShareTransferPrice` 입력 필드 숨김(데이터는 보존 — 재토글 시 복원). |
| sessionStorage legacy 폼 마이그레이션 누락 → `transferActualInputMode` undefined → "per_share" default 적용 | 회귀 0 | normalize에서 enumField default 강제 |
| Zod refine 누락 시 total 모드인데 `transferTotalPrice` 0 → 엔진 transferPrice=0 → 세액 0 silent | 데이터 무결성 | §6.2 refine 강제 + ⑧ validate |
| 분할 모드 사용자가 total 옵션 강제 시도 | 데이터 충돌 | UI disabled + Zod refine 양면 차단 |

## 12. 후속 / 비대상

- ❌ split 모드 총액 입력: 본 계획 범위 외 (lot 매칭 의미 충돌)
- ❌ 교환 모드 총액 직접 입력: 부동산·채무·현금 분해가 §96① 요건 → 분리 유지
- ❌ 1주당 단가 자동 역산 저장: 표시 전용만, 폼 필드 미러 금지 (`feedback_useeffect_store_mirror_forbidden`)
- 🔜 부담부증여 Phase 3 cross-check: 총액 입력 시 채무 분 안분도 final transferPrice 기준 → 자동 transparent (별도 작업 불필요)

## 13. Definition of Done 자가 체크

- [ ] 14지점 매트릭스 (§7) 전부 동기화 (⑭ route.ts 단건+다자산 **2곳** grep 확인)
- [ ] anchor 5건(T-TOTAL-1~5) 전부 PASS
- [ ] 기존 stock-transfer 회귀 anchor 0건 FAIL
- [ ] `npx tsc --noEmit` 0건
- [ ] 브라우저 수동 확인: single+actual+per_share / single+actual+total / single+exchange / split+actual+per_share / split+actual+total(=차단 확인) 5분기 입력→계산→결과 (Network 탭 body 신규 필드 확인)
- [ ] `ui-engine-sync-checker` 호출 → 누락 0
- [ ] memory 정책 갱신 — `project_stock_transfer_actual_total_input.md` 신규

## 14. v1 → v2 정정 이력

1. **파일 경로 오류**: `/api/calc/stock-transfer-tax/route.ts` → 실제 `/api/calc/stock-transfer/route.ts`
2. **Zod 위치 오류**: route.ts inline superRefine 가정 → 실제 별도 모듈 `lib/api/stock-transfer-tax-schema.ts` (`transferPriceModeSchema`·`stockTransferInputSchema`·`addStockRefines`)
3. **Route 매핑 2곳 누락**: 단건 L121~125만 명시 → 다자산 `buildEngineInput()` L200~204 추가 매핑 명시
4. **엔진 함수명 오류**: `computeTransferPrice` 가정 → 실제 `calcTransferPriceSimple` (L527)
5. **사이드바 코드 추정 오류**: §5.3을 실제 `StockSidebar.tsx:38-61` 구조에 맞춰 재작성
6. **분할 모드 게이트 일관성**: 신규 refine 별도 생성 → 기존 `addStockRefines` 분할 게이트(L234~) 안에 `transferActualInputMode === "total"` 차단 추가 (일관성 유지)
7. **14지점 매트릭스에 절대 경로·라인 번호 표기**: 시니어가 grep 없이 바로 작업 진입 가능
