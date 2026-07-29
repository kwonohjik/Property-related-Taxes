# 겸용주택 수정신고·경정청구 — 엔진 설계

계획서: [`mixed-use-amendment-correction.plan.md`](./mixed-use-amendment-correction.plan.md) (rev.2) — **가드·UI 결정의 정본**
선행 설계: [`transfer-tax-amendment.engine.design.md`](./transfer-tax-amendment.engine.design.md) ·
[`transfer-tax-correction-claim.engine.design.md`](./transfer-tax-correction-claim.engine.design.md) ·
[`transfer-tax-mixed-use-house.engine.design.md`](./transfer-tax-mixed-use-house.engine.design.md)

> 검토 이력: STEP 6 2-way fork(오류+모순 / 정책+개선+UI) → 정정 반영(rev.2).
> 반영: 테스트 경로 정정(G-1) · date-coerce 전제 명시(G-2) · 가드 섹션 축약(G-3, dual-truth 제거).

## Context

`computeAmendment()`(`transfer-tax-amendment.ts:154`)는 이미 완성된 순수 함수다. 3개 오케스트레이터가
각자 **자기 본세 기준값**으로 호출한다 — 단건 `determinedTax`(`transfer-tax-finalize.ts:376-380`) ·
재개발 `determinedTax`(`transfer-tax-redevelopment.ts:236-241`) ·
다건 `determinedTaxBeforePenalty`(`transfer-tax-aggregate.ts:357-358`).
**겸용주택 오케스트레이터만 이 호출이 없다.**

본 설계는 **신규 세법 로직 0** — 4번째 오케스트레이터에 동일 append를 붙이는 작업이다.
설계 대상은 (1) 기준값 정의, (2) 부착 지점, (3) 부착 **금지** 지점(거부 경로) 3가지다.

## ★ 케이스 인벤토리 (행 = anchor 테스트 약속)

법령 근거는 전 행 공통(국세기본법 §45·§45의2 — 아래 §법령 근거). 테스트 파일 경로는 **G-1 실측 반영**:
겸용 6형제가 `__tests__/tax-engine/transfer-tax/`에 있으므로 신규 앵커도 동거시킨다.

| # | 시나리오 | `amendment` | 양도일 | 기대 결과 | anchor | 테스트 파일 | 상태 |
|---|---|---|---|---|---|---|---|
| C1 | 비-정정 겸용주택 (기존 전 시나리오) | 미전달 | ≥ 2022-01-01 | `amendmentDetail === undefined` · `total` 전 필드 **바이트 불변** | A5 | `transfer-tax/mixed-use-amendment.test.ts` | ☑ |
| C2 | 수정신고 · 세액 증가 | `"amend"`, 당초 < 수정 | ≥ 2022-01-01 | `additionalTax === total.transferTax − 당초` | A3 | 동상 | ☑ |
| C3 | 수정신고 · 세액 감소(실익 없음) | `"amend"`, 당초 > 수정 | ≥ 2022-01-01 | `additionalTax === 0` (`max(0,…)` — `amendment.ts:164`) | A3 | 동상 | ☑ |
| C4 | 경정청구 · 환급 | `"refund_claim"`, 당초 > 경정 | ≥ 2022-01-01 | `refundTax === 당초 − total.transferTax` (`:88`) | A4 | 동상 | ☑ |
| C5 | 경정청구 · 실익 없음 | `"refund_claim"`, 당초 ≤ 경정 | ≥ 2022-01-01 | `refundTax === 0` | A4 | 동상 | ☑ |
| C6 | **거부 경로 + amendment** | 전달 | **< 2022-01-01** | **`amendmentDetail === undefined`** (부착 금지 — D8) | A6 | 동상 | ☑ |
| C7 | 거부 record 이력 가드 | — | < 2022-01-01 | `classifyAmendableTransfer` → `null` (버튼 미노출) | A7 | `lib/calc/classify-amendable-transfer.test.ts` | ☑ |
| C8 | NBL 배율초과 동반 수정신고 | `"amend"` | ≥ 2022-01-01 | 기준값에 `nonBusinessSurcharge` **포함**(= `transferTax`) | A3 확장 | `transfer-tax/mixed-use-amendment.test.ts` | ☑ |

> **C8 주의**: `transferTax = taxByBasicRate + nonBusinessSurcharge`(`transfer-tax-mixed-use-totals.ts:56-57`).
> 부수토지 배율초과 시 NBL 중과 10%p가 본세에 합류하므로 기준값에서 빠지면 추가납부세액이 과소 산출된다.
>
> **C9(전체 비과세) 불요 — 실측 판정**: 겸용주택에는 단건 같은 whole-result 비과세 조기반환이 **없다**.
> `housingPart.isExempt`(`types/transfer-mixed-use.types.ts:198`, `helpers.ts:654`)는 주택분 과세대상을 0으로 만들 뿐
> 상가분·NBL분은 계속 과세된다(`transfer-tax-mixed-use.ts:263`의 `isExempt`는 `calculationRoute` 메타 라벨용 — 세액 분기 아님).
> `total.transferTax === 0`은 `aggregateIncome ≤ 250만원` 극단뿐이며, 그때 `refundTax = 당초 전액`은
> **법적으로 정확**(경정 결과 세액 0 → 전액 환급). 결함 아님.

## 법령 근거 (자산종류 무관 — 신규 해석 없음)

| 조문 | 내용 | 겸용주택 특칙 |
|---|---|---|
| 국세기본법 §45 | 수정신고 — 추가납부세액 | **없음** (과세표준신고서 단위 규정, 자산종류 무관) |
| 국세기본법 §45의2 | 경정청구 — ①일반 5년 / ②후발적 3개월 | **없음** |
| 국세기본법 §47의3·§47의4 | 신고불성실·납부지연 가산세 | **없음** |
| 국세기본법 §48②1호 | 경과기간별 자동감면 | **없음** |
| 소득세법 시행령 §160① 단서 | 겸용주택 분리계산 (2022.1.1~) | **당초 계산의 근거** — 정정 규정이 아니다 |

⇒ 겸용주택이라서 달라지는 정정 규정은 **없다**. 기존 `computeAmendment()`를 그대로 재사용한다.
(KoreanLaw 재검증 불요 — 선행 설계 `transfer-tax-amendment.engine.design.md` §법령근거 검증분 승계.)

## 엔진 input — 시그니처 확장

`lib/tax-engine/transfer-tax-mixed-use.ts`

```ts
import type { AmendmentInput } from "./types/transfer-amendment.types";   // [신규]

export function calcMixedUseTransferTax(
  transferPrice: number,
  transferDate: Date,
  asset: MixedUseAssetInput,
  rates: TaxRatesMap,
  /** [신규] 신고서 단위 수정신고·경정청구 (국세기본법 §45·§45의2). 미전달 시 기존 경로 불변. */
  amendment?: AmendmentInput,
): MixedUseGainBreakdown
```

- **자산-수준 아님**: `MixedUseAssetInput`에 넣지 않는다. `amendment`는 **신고서 단위**(폼-전역)이고
  asset은 자산-수준 — 축이 다르다. route·Zod도 이미 폼-전역으로 취급(`transfer-tax-schema.ts:481` vs `:313`).
- **기존 호출 전건 무영향**: 프로덕션 호출부 1곳(`route.ts:692`) + 테스트 호출부 약 40곳
  (`mixed-use-house.test.ts` 11 · `mixed-use-partial-usage-change.test.ts` 20 · `mixed-use-usage-period-split.test.ts` 7 ·
  `mixed-use-phd-case-a-fourpart.test.ts` 1 · 컴포넌트 앵커 2) — **전부 4인자**라 optional 5번째는 컴파일·동작 무영향.
- **순환 없음(실측)**: `transfer-tax-amendment.ts` → {date-fns, legal-codes, tax-utils, transfer-tax-penalty, types/*}.
  체인 전체에 `transfer-tax-mixed-use` 참조 0건.

## 엔진 result — echo 필드 추가

`lib/tax-engine/types/transfer-mixed-use.types.ts` · `MixedUseGainBreakdown`

```ts
import type { AmendmentDetail } from "./transfer-amendment.types";   // [신규] types/ 내 형제 파일

export interface MixedUseGainBreakdown {
  splitMode: "post-2022" | "pre-2022-rejected";
  // … 기존 필드 전부 불변 …
  /**
   * [신규] 수정신고·경정청구 상세 (국세기본법 §45·§45의2).
   * `amendment` 미전달 시 undefined — 캐시된 구 결과(IndexedDB)도 안전 통과.
   * `splitMode === "pre-2022-rejected"`면 amendment 전달 여부와 무관하게 항상 undefined (D8).
   */
  amendmentDetail?: AmendmentDetail;
}
```

- **JSON 안전**: `AmendmentDetail`은 순수 object + `steps: CalculationStep[]` — Map/Record 미사용
  (정책 `feedback_engine_result_map_json_loss` 해당 없음).
- **`steps` 미합류**: `MixedUseStep[]`(id/title/legalBasis/values)와 `CalculationStep[]`은 형태가 다르다.
  `AmendmentResultCard`가 `detail.steps`를 **양 분기 모두 자체 렌더**한다
  (refund `:94-113` / amend `:158-177`) → `breakdown.steps`에 push하면 중복.
  (단건은 `finalize:379-380`이 push **하면서** 카드도 렌더 → 실제로 중복 표시 중 — 답습 금지.)

## 계산 알고리즘

### 기준값 — `determinedTax = total.transferTax`

```
total.transferTax = taxByBasicRate + nonBusinessSurcharge   (transfer-tax-mixed-use-totals.ts:57)
                  = 겸용주택 본세 (지방소득세 제외)
```

**단건 대조 실측**:

| | 단건 | 겸용 |
|---|---|---|
| 기준값 | `truncateToWon(max(0, calculatedTax − cappedReduction))` (`finalize.ts:314`) | `transferTax` (`totals.ts:57`) |
| 지방소득세 | `:346`에서 **이후** 산출 → 제외 | `localTax` 별도 필드 → 제외 |
| 가산세 | `determinedTaxWithPenalty`(`:343`) 별도 → 제외 | 경로 자체 없음 → 제외 |
| 감면 | `cappedReductionAmount` 차감 | **겸용 경로에 감면 없음**(실측: `transfer-tax-mixed-use{,-totals,-helpers}.ts`에 `reduction` 참조 0건) → `산출세액 = 결정세액` |
| 절사 | `truncateToWon` | `applyRate`=`Math.floor`(`tax-utils.ts:43`) + 정수 deduction(`tax-utils.ts:28`) → **이미 정수**, `truncateToWon`(`:78-80`) no-op |

⇒ **의미 동일**. `totalPayable`(= `transferTax + localTax`)을 쓰면 단건과 기준이 어긋나 동일 세액인데
겸용/단건 추가납부액이 달라진다 → **금지**(A3 뮤테이션이 감시).

### 오케스트레이터 통합 — 정상 조립 직전 append

`calcMixedUseTransferTax` 내부, `return {…}`(`:213`) **직전**:

```ts
import { computeAmendment } from "./transfer-tax-amendment";   // [신규] 엔진 루트 기준

// ─ 수정신고(경정)·경정청구 — 끝단 append (국세기본법 §45·§45의2) ─
// amendment 없으면 undefined → 무영향(additive). finalize STEP 12.5 · redevelopment Step H.5와 동일 패턴.
const amendmentDetail = amendment
  ? computeAmendment(amendment, total.transferTax)
  : undefined;

return {
  splitMode: "post-2022",
  // … 기존 필드 …
  amendmentDetail,
};
```

`transfer-tax-mixed-use.ts` 501줄 → ~510줄 (800 정책 여유).

### ⚠️ route 전달 — `engineInput.amendment` (raw `data.amendment` 금지 · G-2)

`AmendmentInput`은 **Date 필드 4개**(`statutoryFilingDeadline`·`amendedFilingDate`·`amendedPaymentDate`·
`posteriorEventDate`)를 갖는다. Zod 출력은 **string**이다.

- **전달 대상**: `engineInput.amendment` — `route.ts:317-331`에서 `toOptionalDate()`로 Date 변환 완료분.
  bundled 선례(`route.ts:650-651`)와 동일.
- **금지**: raw `data.amendment` 전달. Date 필드가 string으로 도달하면 `computeAmendment` 내부
  `isAfter(filingDate, addMonths(deadline, …))`가 **§48② 감면율을 침묵 오작동**시킨다
  (CLAUDE.md 명시 함정 — "`Date < string` silent false").

### ⚠️ 부착 **금지** 지점 — `buildRejectionResult` (D8, Critical)

`calcMixedUseTransferTax` 함수 본문(`:56-226`) 내 return은 **정확히 2개**(실측):

```
:64    if (transferDate < MIXED_USE_EFFECTIVE_DATE) return buildRejectionResult(...)   ← 거부(조기반환)
:213   return { splitMode: "post-2022", … }                                            ← 정상 조립
```

(`:275` return은 `buildCalculationRoute`(`:232-283`) 소속 — 별개 함수.
겸용은 단건과 달리 **whole-result `isExempt` 조기반환이 없다** — 위 C9 판정 참조.)

`buildRejectionResult`(`:332-`)는 `total` 전 필드를 **0**으로 채운다(undefined 아님 → 크래시 없음).

- **금지 이유**: `computeAmendment(amendment, 0)` 부착 시 →
  `refundTax = max(0, 당초 − 0) = 당초 전액` → 경정청구 화면에 **"전액 환급" 오표시**(법적 위험).
- **단건 `[F1]` 선례 답습 금지**: `transfer-tax.ts:402-403`은 조기반환에도 `computeAmendment(input.amendment, 0)`을
  부착하지만, 그 조기반환 조건은 `if (transferGain <= 0)`(`:377`, "양도 손실(또는 0)") = **유효한 계산 결과**다.
  겸용 rejection은 **"계산 불가(범위 외) 에러 상태"** — 의미가 다르므로 부착하지 않는다.
- **구조적 보장**: append를 정상 조립 지점에만 두면 거부 경로는 자연 배제된다. A6가 이를 고정한다.

### 이력 진입 가드 — **정본은 계획서** (G-3, 중복 제거)

엔진이 UI·mediator에 제공하는 **계약**만 여기 남긴다:

| 계약 | 값 |
|---|---|
| 당초 결정세액 소스 | `resultData.result.total.transferTax` (본세 — 위 기준값과 동일 축) |
| 거부 record 식별 | `resultData.result.splitMode === "pre-2022-rejected"` |
| `fullTotalTax`(UI) | `breakdown.total.totalPayable` — 단건 `result.totalTax`와 의미 동일(겸용은 가산세·농특세 부재) |

가드 구현(반환 union `"mixed-use"` 신설 · `"single"` 재사용 금지 · `rd` 지역 타입 확장 · splitMode 차단)은
**계획서 D5·D8·§4 H1·H2가 정본** — 여기 병기하지 않는다(문서 드리프트 방지).

## 정수 연산

- 신규 산술 **0건** — `computeAmendment` 내부의 기존 `applyRate`/`truncateToWon`만 사용.
- 기준값 `total.transferTax`는 이미 정수(위 표) → 추가 절사 불요.
- `Math.round()` 미사용 ✓.

## Silent fallback / 자동 안분 후보 식별

| 후보 | 판정 |
|---|---|
| `amendment` 미전달 시 `determinedTax=0` 대입 | **금지** — D8. `undefined` 반환(계산 안 함) |
| 겸용 `total.transferTax` 부재 시 `totalPayable` 대체 | **금지** — 기준값 드리프트. 타입상 항상 존재 |
| 거부 경로에서 `amendment` 무시 | **의도된 동작** — 침묵 아님. `splitMode`·`warnings[]`가 사유를 노출하고 가드(D8)가 진입을 차단 |

자동 안분 fallback 신설 **없음**(정책 `feedback_no_silent_apportion_fallback` 해당 없음).

## 테스트 약속

| 파일 | 앵커 | 비고 |
|---|---|---|
| `__tests__/tax-engine/transfer-tax/mixed-use-amendment.test.ts` (**신규**) | A3·A4·A5·A6 (C1~C6·C8) | **`transfer-tax/`에 둘 것** — 겸용 6형제 동거 디렉터리. `transfer/`에는 겸용 테스트 0건(G-1 실측) |
| `__tests__/lib/calc/classify-amendable-transfer.test.ts` | A1(기존 앵커 **반전**)·A2·A7 | |
| `__tests__/lib/calc/transfer-multi-load-entry.test.ts` (**신규 파일**) | A8 | `classifyLoadableTransfer` 기존 앵커 0건 |

**회귀 명령(G-1 정정)**: `npx vitest run __tests__/tax-engine/transfer-tax/ __tests__/tax-engine/transfer/`
— 겸용 회귀는 `transfer-tax/`, amendment 회귀는 `transfer/`. **양쪽 필요**.

**뮤테이션 역검증(강제)**:
1. `computeAmendment(amendment, total.totalPayable)` → A3 **실패**해야 함 (기준값 고정).
2. H1을 `return "single"` → A8 **실패**해야 함 (D5 회귀 방지).

## UI 통합 위임

⑦ 결과 카드 배치(D9 print leaf 편승 · D10 Row 라벨 전환)와 A9(`extractTotalTax` 앵커)는
[`mixed-use-amendment-correction.ui.design.md`](./mixed-use-amendment-correction.ui.design.md)로 위임.

**14 동기화 지점**: 신규 엔진 필드는 `MixedUseGainBreakdown.amendmentDetail` **1개**(result-side echo).
input-side 신규 필드 0(기존 `AmendmentInput` 재사용) → ①~⑬ 전부 무변경, **⑭(route 1줄)·⑦(결과 카드)만 해당**.
근거는 계획서 §4.2 실측 표.
