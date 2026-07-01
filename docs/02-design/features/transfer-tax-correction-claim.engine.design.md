# 양도소득세 경정청구(세액 감소·환급) — 엔진 설계

> 계획서: `docs/00-pm/transfer-tax-correction-claim.plan.md`. UI: `transfer-tax-correction-claim.ui.design.md`.
> 범위: **양도소득세 단건(single)만**. 모든 인용은 KoreanLaw 본문 검증(추정 금지).
> 자매(수정신고): `transfer-tax-amendment.engine.design.md`. 본 기능은 그 **거울상** — `correctionKind` 판별자로 `computeAmendment`에 통합.

## Context

당초 신고를 마친 양도건의 정당 세액이 당초보다 **작아진** 경우(양도가액 과다·취득가액/필요경비 과소·감면 누락·수용재결 감액 등) → **경정청구(환급)**. 계산기는 당초 양도일·세율·감면 축을 두고 과다신고 항목을 정정해 재계산 → **당초 결정세액 − 경정 결정세액 = 환급세액**. 국세환급가산금은 세무서가 산정(지급결정일 미정)하므로 원금만 산출·안내. 수정신고(§45, 세액 증가·가산세)와 legally 구분되나(§45의2, 세액 감소·환급), 재계산·이력·저장소·plumbing 인프라를 공유해 `correctionKind: "amend" | "refund_claim"`로 방향만 분기(기존 amend 경로 바이트 불변).

---

## ★ 케이스 인벤토리 (행=anchor 테스트 약속)

| # | 시나리오 | 법령 근거 | anchor 출처 | 테스트 파일 | 상태 |
|---|---------|----------|-------------|-----------|------|
| R1 | 환급만(정상 감액) | 국기 §45의2① | 당초50M/경정30M→환급20M·지방2M | `transfer/correction-claim.test.ts` | ☐ TODO |
| R2 | 경정≥당초(역방향 가드) | — | 환급=0(max0) | 〃 | ☐ TODO |
| R3 | ordinary 청구기한(5년) | 국기 §45의2① | 기한2022-05-31→2027-05-31, 청구2026-07-01 → 미도과 | 〃 | ☐ TODO |
| R4 | ordinary 도과 | 국기 §45의2① | 기한2019-05-31→2024-05-31, 청구2026 → 도과 | 〃 | ☐ TODO |
| R5 | posterior 청구기한(3개월) | 국기 §45의2② | 사유2026-06-01→2026-09-01, 청구2026-07-01 → 미도과 | 〃 | ☐ TODO |
| R6 | posterior 도과 | 국기 §45의2② | 사유2026-01-01→2026-04-01, 청구2026-07-01 → 도과 | 〃 | ☐ TODO |
| R7 | 통합 파이프라인(과세) | — | `calculateTransferTax` refundTax | 〃 | ☐ TODO |
| R8 | **기존 amend 회귀(핵심 게이트)** | — | `amendment.test.ts` A1~A9 재실행 green(바이트 불변) | `transfer/amendment.test.ts` | ☐ TODO |
| R9 | 저장소 3-record | (구현) | 당초·수정(`\|amend`)·경정(`\|refund`) 3건 공존 | `storage/correction-claim-dedup.test.ts` | ☐ TODO |
| R10 | **비과세/손실 조기반환 전액환급** | — | `computeAmendment({refund},0)`→환급=당초 전액(단위 우선) | `transfer/correction-claim.test.ts` | ☐ TODO |

**규칙**: 행≥1 없으면 Do 금지. Phase 0에서 R1·R3·R10 우선 작성·실행(실패 확보).

---

## 법령 근거 (KoreanLaw 본문 검증 — 시행 20260701)

```
국세기본법 §45의2① (검증): 신고 과세표준·세액이 세법상 세액을 초과할 때
  → 법정신고기한 후 5년 이내 경정청구.  [청구기한 = 법정신고기한 + 5년]
  ※[G4] ①단서(증액 결정·경정 통지 후 3개월, 5년 한정)=제3의 청구창 — 당초 과다신고→감액만 대상이라 scope-out.
국세기본법 §45의2② (검증): 후발적 사유(1호 판결·심판·화해로 거래가 다르게 확정,
  2호 귀속 변경, 3호 상호합의, 4호 연동 경정, 5호 대통령령) 발생을 안 날부터 3개월 이내
  (5년 지나도 가능).  [청구기한 = 사유 안 날 + 3개월]
국세기본법 §45의2③ (검증): 세무서장은 청구받은 날부터 2개월 이내 결정·경정 또는 이유없음 통지.
국세기본법 §52①·③1호 (검증): 경정청구(§45의2) 환급은 국세환급가산금 대상
  (§52③은 "경정청구·불복 없이 고충민원으로 환급 시 미가산" → 경정청구는 정상 가산 대상).
국세기본법 시행령 §43의3①1호 (검증): 환급가산금 기산일 = 국세 납부일의 다음 날
  (납부 후 그 납부의 기초가 된 신고를 경정함에 따라 발생한 환급금). 분할납부=마지막 납부일 소급(scope-out).
국세기본법 시행규칙 §19의3 (검증): 환급가산금 이율 = 연 1천분의 31 = 연 3.1% (현행).
소득세법 §110① (자매 검증): 확정신고 = 다음 연도 5.1~5.31 → 법정신고기한(ordinary 5년 기산점).
```

> **★ 환급가산금 금액 미산정**: 종점=지급결정일(§45의2③ 세무서 2개월 내 결정)=청구 시점 미래·미정. 이율(3.1%)도 기간별 변동 가능. → 원금(환급세액)만 정확 산출, 가산금은 **UI 안내 callout**. (수정신고 납부지연가산세는 종점을 납세자가 정해 계산 가능했던 것과 **비대칭** — 배제가 정확.)
> **후발적 매핑**: 수용보상금 **감액**이 수용재결·판결로 확정 = §45의2②1호("거래가 판결·화해로 다르게 확정").

`legal-codes/common.ts` 신규 상수:
```ts
export const CORRECTION_CLAIM_45_2 = "국세기본법 §45의2";
export const REFUND_GAIN_52 = "국세기본법 §52";       // 환급가산금 안내
export const CLAIM_PERIOD_ORDINARY_YEARS = 5;          // §45의2① 5년
export const CLAIM_PERIOD_POSTERIOR_MONTHS = 3;        // §45의2② 3개월
export const REFUND_GAIN_RATE_ANNUAL = 0.031;          // [G2] 시행규칙 §19의3 — 안내 표기 전용(display-only). 시행규칙 변동 → 계산화 시 기간별 이율 테이블 필요
```

---

## 엔진 input 타입 (`types/transfer-amendment.types.ts` — `AmendmentInput` 확장, 전부 additive)

```ts
correctionKind?: "amend" | "refund_claim";   // 미지정 = "amend"(기존 수정신고 불변)
claimReasonType?: "ordinary" | "posterior";  // refund_claim 전용
posteriorEventDate?: Date;                    // posterior 3개월 기산점 (date-coerce)
// 재사용: originalDeterminedTax, statutoryFilingDeadline(ordinary 5년), amendedFilingDate(경정청구일=도과 종점)
// [F2] originalPaymentDate 미포함 — 계산 미사용, form-only(환급가산금 안내 표시용)
```
> Date 필드는 라우트에서 `toOptionalDate`(`lib/api/date-coerce.ts`) 변환. **엔진 plumb 신규 입력 = 3필드**(correctionKind·claimReasonType·posteriorEventDate).

## 엔진 result 타입 (`types/transfer-amendment.types.ts` — `AmendmentDetail` 확장, 전부 additive optional)

```ts
correctionKind?: "amend" | "refund_claim";   // 미지정/"amend" = 기존(비파괴)
// ── refund_claim 전용 ──
refundTax?: number;                // 환급세액 = max(0, 당초 − 경정) — hero
refundLocalIncomeTax?: number;     // 참고 — 지방소득세 환급(환급세액×10%, 지자체 별도)
claimReasonType?: "ordinary" | "posterior";
claimDeadline?: string;            // 청구기한 ISO "YYYY-MM-DD" — ⚠️ Date 금지(JSON 드리프트)
isDeadlineExceeded?: boolean;      // 도과 경고
```
> **[정책 feedback_engine_result_map_json_loss]** `claimDeadline`은 **string**(Date를 result에 실으면 JSON 경유 string 드리프트). `correctionKind` optional → **기존 amend return 무수정**(undefined ⇒ amend). `refundTax`/`isDeadlineExceeded`를 노출해 UI가 엔진 단일진실 추종(dual-truth 회피). **[F3·F4]** `totalRefund`(=refundTax 중복)·`refundInterestBasisDate` 불채택.

---

## 계산 알고리즘

### resolveClaimDeadline(reasonType, statutoryFilingDeadline, posteriorEventDate) → Date | undefined
> import: `import { addMonths, addYears, isAfter } from "date-fns"`.
```ts
if (reasonType === "posterior")
  return posteriorEventDate ? addMonths(posteriorEventDate, 3) : undefined;   // §45의2② 3개월
return statutoryFilingDeadline ? addYears(statutoryFilingDeadline, 5) : undefined; // §45의2① 5년
```
- **[날짜 비교]** `addYears`/`addMonths` 사용. `differenceInCalendarMonths`/일수환산 금지(자매 E1과 동일 — 일 버림→경계 오판정).
- 도과 = `claimDeadline && amendedFilingDate ? isAfter(amendedFilingDate, claimDeadline) : false`. (amendedFilingDate=경정청구일, UI가 오늘 prefill — F7.)

### computeRefundClaim(input.amendment, determinedTax) → AmendmentDetail
```
refundTax = max(0, originalDeterminedTax − determinedTax)        // 환급세액. 음수가드=amend 영역
refundLocalIncomeTax = applyRate(refundTax, 0.1)                 // [G5] 참고 근사(지자체 별도). 엄밀=floor(당초×.1)−floor(경정×.1)이나 참고표시라 refund×10% 채택(자매 E4 동일)
claimDeadline = resolveClaimDeadline(claimReasonType, statutoryFilingDeadline, posteriorEventDate)
isDeadlineExceeded = claimDeadline && amendedFilingDate ? isAfter(amendedFilingDate, claimDeadline) : false
steps = [ 당초 결정세액 / 경정 결정세액 / 환급세액(§45의2) / 참고 지방소득세 환급(지방세법 §103의, "지자체 별도") ]
return { correctionKind:"refund_claim", originalDeterminedTax, amendedDeterminedTax:determinedTax,
  additionalTax:0, underReportingReductionRate:0, underReportingPenalty:0, latePaymentPenalty:0,
  additionalLocalIncomeTax:0, totalPayable:0,   // amend 필드 0
  refundTax, refundLocalIncomeTax, claimReasonType,
  claimDeadline: claimDeadline ? toISODateUTC(claimDeadline) : undefined, isDeadlineExceeded, steps }
```
- **국세환급가산금 미산정**(UI callout). **[G1·H1]** `claimDeadline` ISO는 **`toISODateUTC`** = `` `${d.getUTCFullYear()}-${pad(d.getUTCMonth()+1)}-${pad(d.getUTCDate())}` `` — **`getUTC*`** 사용(date-coerce가 `new Date("YYYY-MM-DD")`=UTC 자정으로 파싱 실측 → 로컬 getter·`format`·`toISOString`은 UTC-음수 tz −1일). `isDeadlineExceeded`(isAfter)는 instant 비교라 tz 무관. 엔진 순수(`new Date()` 직접 금지 — 입력 Date만). 헬퍼는 `transfer-tax-amendment.ts` 내부 정의(client `validate` import 금지).

### computeAmendment 상단 분기 (`transfer-tax-amendment.ts:52`)
```ts
export function computeAmendment(a, determinedTax) {
  if ((a.correctionKind ?? "amend") === "refund_claim") return computeRefundClaim(a, determinedTax);
  // …기존 amend 경로 이하 전부 바이트 불변…
}
```

### 오케스트레이터 통합
- **정상(과세) 경로**: `transfer-tax-finalize.ts:374` `input.amendment ? computeAmendment(input.amendment, determinedTax) : undefined` — **분기 불필요**(correctionKind 내부 처리). plumbing 5지점 기존 재사용(`amendmentDetail` 객체 통째 흐름 → 내부 refund 필드 추가는 **신규 plumbing 0**).
- **[F1 — Critical] 비과세·손실 조기반환 주입**: 경정 재계산이 전액 비과세(`transfer-tax.ts:275~282` `isExempt`) 또는 손실(`:411` §114조의2① 산출세액 0)이면 `finalizeTransferTax`(`:679`) 미경유 → STEP 12.5 미실행 → `amendmentDetail` 미생성. **refund의 최대 케이스(전액 환급) 누락.**
  - **정정**: 두 조기반환 객체에 `amendmentDetail: input.amendment ? computeAmendment(input.amendment, 0) : undefined` 추가(determinedTax=0). refund→`refundTax=당초 전액`. amend→`additionalTax=0`(무해·정확).
  - `transfer-tax.ts`에 `import { computeAmendment } from "./transfer-tax-amendment"` 추가.
  - **[G3 회귀 명시]** amend+비과세도 이제 `amendmentDetail`(additionalTax 0)를 채우나 ResultView는 F13로 🎉비과세 유지(`correctionKind!=="refund_claim"`) → **시각적 회귀 0**. 기존 amend anchor(A1~A9=taxable)는 무영향.
  - **Do 필수**: `transfer-tax.ts` **모든 `return {` grep**(재개발 STEP 0.65 등 finalize 미경유 분기 전수) → refund 미도달 0. (R10)
- **[F13 — High] ResultView 분기 재정렬**: `TransferTaxResultView`는 `result.isExempt ?`(:270 🎉비과세)를 `result.amendmentDetail ?`(:278)보다 **선행** → 비과세 경정이 refund 카드를 가림. `:270` 조건을 `result.isExempt && result.amendmentDetail?.correctionKind !== "refund_claim"`로 변경(refund_claim은 refund 카드 우선, amend·비amendment 비과세는 🎉 유지). (엔진 F1과 짝 — 둘 다 있어야 비과세 전액환급 표시.)
- **2-pass 불필요**: 당초세액=입력, 경정세액=이번 run. 라우트 penalty 2-pass 미진입(amendment ↔ filingPenaltyDetails 상호배타 refine).

### 상호배타 (기존 재사용, 무변경)
- Zod refine(`transfer-tax-schema.ts:478`): `amendment && (filingPenaltyDetails||delayedPaymentDetails)` 금지 — refund도 amendment 하위라 자동 커버.
- API 빌더 게이트(`:504·518·528`): `!form.amendmentMode`로 penalty 블록 skip / `form.amendmentMode`로 amendment 조립.
- **[F6]** refund일 때 payload `applyUnderReportingPenalty:false`·`applyLatePaymentPenalty:false` 강제(stale 누출 차단).

---

## 정수 연산

- `refundTax`·`refundLocalIncomeTax` 전부 `applyRate`(floor)·`truncateToWon`. `Math.round` 금지.
- `refundLocalIncomeTax = applyRate(refundTax, 0.1)` — 참고 근사(지자체 별도 신고).

---

## Silent fallback / 자동 안분 후보 식별

- `statutoryFilingDeadline`·`amendedFilingDate` 자동값 = **hydration 1회 세팅**(handleRefundClaim). `transferDate`→기한 파생을 **useEffect→store 미러링 금지**. 정책 `mirror-pattern`·`feedback_useeffect_store_mirror_forbidden`.
- `originalDeterminedTax` 미입력(0)이면 refund 과대 → **validate에서 amendmentMode 시 >0 필수 차단**(기존 규칙 :251 재사용).
- **[F5]** `refund_claim && posterior && !posteriorEventDate` → validate 차단(청구기한 산정 불가). amend 전용 검증(:253·259)은 penalty 게이트라 refund 미발동(실측).
- 도과·환급 0은 **비차단 경고**(collectStepWarnings 또는 UI display) — 하드 차단 아님(§45의2 특례·연장 edge).
- 자동 안분 fallback 없음.

---

## 테스트 약속

- 케이스 인벤토리 10행 → anchor R1~R10. Phase 0에서 R1·R3·R10 우선(실패 확보 후 결과 타입 동결).
- **R8(기존 amend A1~A9 회귀)** = 핵심 게이트: refund 확장이 수정신고를 깨지 않음.
- R10(비과세/손실 전액환급) = F1 주입 검증. 금액 원단위 `toBe()`.

---

## UI 통합 위임

- UI 명세: `transfer-tax-correction-claim.ui.design.md`.
- 14 동기화 지점 + 저장소 ⓢ1~3은 계획서 §6. 엔진은 input/result 타입·`computeRefundClaim`·`resolveClaimDeadline`·조기반환 주입·legal-codes 상수만 책임. **[F13] ResultView 분기 재정렬은 UI 문서에서 상술.**
