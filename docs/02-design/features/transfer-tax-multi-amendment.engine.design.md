# 양도소득세 다자산(일괄·다건) 수정신고·경정청구 — 엔진 설계

> 계획서: `docs/00-pm/transfer-tax-multi-amendment.plan.md`. UI: `transfer-tax-multi-amendment.ui.design.md`.
> 범위: **일반 다자산**(§166⑥ bundled + multi 직접입력). 부담부증여·겸용주택·general_building 일괄 제외.
> 핵심: 수정신고·경정청구는 **신고서 단위(filing-level)** → 단건 `computeAmendment`/`computeRefundClaim`을 **그대로 재사용**하고, 집계 결정세액(`determinedTaxBeforePenalty`)을 주입 대상으로만 바꾼다. 모든 인용은 실제 코드 실측(추정 금지).

## Context

동일 과세기간에 여러 자산을 합산신고한 건은 §92 양도소득금액 합산 → 통합 과세표준 → **단일 산출·결정세액**으로 귀결한다(`transfer-tax-aggregate.ts`). 당초 신고 후 일부 자산의 양도가액·취득가액·필요경비가 변동되면, **전체 신고서를 재계산**하여 새 총 결정세액을 얻고 당초 총 결정세액과 비교한다:
- 수정신고: `추가납부세액 = max(0, 경정 총결정 − 당초 총결정)`
- 경정청구: `환급세액 = max(0, 당초 총결정 − 경정 총결정)`

단건 엔진은 `finalizeTransferTax` STEP 12.5에서 `computeAmendment`를 주입하지만, **집계 엔진은 finalize를 경유하지 않아**(자체 `determinedTaxBeforePenalty` 산출) 현재 `amendmentDetail`이 생성되지 않는다 — 이 설계가 그 갭을 메운다.

---

## ★ 케이스 인벤토리 (행=anchor 테스트 약속)

| # | 시나리오 | 법령 근거 | anchor 출처 | 테스트 파일 | 상태 |
|---|---------|----------|-------------|-----------|------|
| 1 | 다자산 수정신고 추가납부 | 국세기본법 §45 | 2자산 당초X / 1자산 증액 경정X' → `additionalTax=max(0,X'−X)` | `transfer/multi-amendment.test.ts` M-A1 | ☐ TODO |
| 2 | 다자산 경정청구 환급 | 국기 §45의2① | 취득가↑ 경정<당초 → `refundTax=max(0,당초−경정)` | M-A2 | ☐ TODO |
| 3 | 전액 비과세 다자산 환급 | — | 전 자산 비과세 → `determinedTax=0` → `refundTax=당초 전액` | M-A3 | ☐ TODO |
| 4 | §166⑥ 누수 strip 회귀 | (구현) | amendment 있어도 `properties[0].steps`에 amendment step 미포함 | M-A4 | ☐ TODO |
| 5 | 단건 동형 경계 | — | 자산 1건 aggregate+amendment = 단건 `computeAmendment` 일치 | M-A5 | ☐ TODO |
| 6 | 기존 다자산 회귀 게이트 | — | amendment 미지정 → aggregate 바이트 불변 | M-A6 | ☐ TODO |
| 7 | multi 저장소 3-record | (구현) | 당초·`\|amend`·`\|refund` 3키 상이 공존 | `storage/multi-amendment-dedup.test.ts` M-A7 | ☐ TODO |

**규칙**: 행≥1 없으면 Do 금지. Phase 0에서 M-A1·M-A3·M-A5 우선 작성·실행(실패 확보).

---

## 법령 근거 (신규 조문 없음 — 단건 검증분 재사용)

수정신고·경정청구는 **신고서 단위** 개념이라 다자산이라고 새 조문이 생기지 않는다. 단건에서 이미 법제처 본문 검증한 조문을 재사용:
```
국세기본법 §45 (수정신고) / §45의2①②③ (경정청구 5년·후발3개월·2개월 결정)
국세기본법 §48②1호 (수정신고 §47의3 신고불성실 자동감면 — 1/3/6/12/18/24개월 브래킷)
국세기본법 §48①2호 (정당한 사유 면제)
국세기본법 §52③1호·시행령 §43의3①1호·시행규칙 §19의3 (환급가산금 — 원금만, 안내)
소득세법 §92 (양도소득금액 합산) / §103 (기본공제 연1회) / §104⑤ (비교과세)
```
> `legal-codes/common.ts`의 `AMENDMENT_48_2`·`AMENDMENT_REDUCTION_48_2`·`CORRECTION_CLAIM_45_2` 등 **기존 상수 재사용**. 신규 상수·리터럴 없음.

---

## 엔진 input 타입 — `AggregateTransferInput` 확장 (`lib/tax-engine/types/transfer-aggregate.types.ts:49`)

```ts
export interface AggregateTransferInput {
  taxYear: number;
  properties: TransferTaxItemInput[];
  annualBasicDeductionUsed: number;
  basicDeductionAllocation?: "MAX_BENEFIT" | "FIRST" | "EARLIEST_TRANSFER";
  priorReductionUsage?: { year: number; type: string; amount: number }[];
  amendment?: AmendmentInput;   // ← 신규: 신고서 단위 정정(수정신고·경정청구). lib/tax-engine/types/transfer-amendment.types.ts 재사용
}
```
> `AmendmentInput`은 단건과 **동일 타입**(`originalDeterminedTax`·`correctionKind`·`claimReasonType`·penalty 플래그·Date 필드). Date는 라우트에서 `toDate`/`toOptionalDate` 변환.

## 엔진 result 타입 — `AggregateTransferResult` 확장 (`:234`)

```ts
export interface AggregateTransferResult {
  // ...(기존)
  determinedTax: number;          // = determinedTaxBeforePenalty (:466) — amendment 비교 대상
  amendmentDetail?: AmendmentDetail;   // ← 신규: 재사용 타입(refund 필드 refundTax·claimDeadline 등 포함)
}
```
> **[정책 feedback_engine_result_map_json_loss]** `AmendmentDetail`은 Record/원시값(Map 아님) — JSON 직렬화 안전. `claimDeadline`은 ISO string(Date 아님).

---

## 계산 알고리즘

### 주입 — `calculateTransferTaxAggregate` (`transfer-tax-aggregate.ts`)

> **순환의존 없음(실측)**: `transfer-tax-amendment.ts`는 `date-fns`·`./legal-codes`·`./tax-utils`·`./transfer-tax-penalty`·`./types/transfer.types`만 import(aggregate 미import) → `transfer-tax-aggregate.ts`가 `computeAmendment`를 import해도 순환 없음.

```ts
import { computeAmendment } from "./transfer-tax-amendment";   // 신규 import

// M-1 (:106~114): 자산별 단건 엔진 호출 — singleInput에 amendment strip
const singleInput: TransferTaxInput = {
  ...(item as unknown as TransferTaxInput),
  annualBasicDeductionUsed: 0, skipBasicDeduction: true, skipLossFloor: true,
  amendment: undefined,          // ← 신규 [E4]: 신고서 단위 amendment가 자산별 계산에 누수되지 않도록 strip
};

// M-8 이후 (:334 직후): 집계 결정세액에 대해 정정 계산
const determinedTaxBeforePenalty = Math.max(0, calculatedTax - reductionAmount);   // (:334, 기존)
const amendmentDetail = input.amendment
  ? computeAmendment(input.amendment, determinedTaxBeforePenalty)   // correctionKind ?? "amend" 내부 분기 → refund면 computeRefundClaim
  : undefined;

// 반환 (:446~473): amendmentDetail 추가
return {
  // ...(기존 전 필드)
  determinedTax: determinedTaxBeforePenalty,
  ...(amendmentDetail ? { amendmentDetail } : {}),
};
```

- **주입 대상 = `determinedTaxBeforePenalty`**: 단건 finalize STEP 12.5가 `determinedTax`(가산세 전 결정세액)를 넘기는 것과 **동일 의미**. 다자산 총 결정세액이며, 당초/경정 비교의 기준.
- **refund 자동 분기**: `computeAmendment` 상단 `if ((a.correctionKind ?? "amend") === "refund_claim") return computeRefundClaim(a, determinedTax)` — 단건 코드 그대로. refund 결과필드(`refundTax`·`refundLocalIncomeTax`·`claimDeadline`·`isDeadlineExceeded`) 전부 재사용.
- **[F1 불요]** 집계 함수는 함수 early-return이 없다(실측: `:137~330` return은 전부 reduce/map 콜백 내부 `:168·172·173`). 전액 비과세 다자산도 `calculatedTax=0 → determinedTax=0 → refund=당초 전액` 선형 처리 → 단건의 조기반환 주입([F1]) 불필요.

### [E4] 누수 strip 상세 (Critical — 기존 잠재버그 수정)

현재 route가 `engineInput.amendment`(`route.ts:308~322`)를 primary item에 spread(`route.ts:604~611`)하고, `TransferTaxItemInput`이 `amendment`를 Omit하지 않아(`:37~46`), 집계 M-1의 `calculateTransferTax(primaryItem)`가 **primary 자산의 부정확한(skipBasicDeduction) determinedTax 기준으로 `computeAmendment` 실행** → `amendmentDetail`은 `PerPropertyBreakdown`에 필드 없어 소실되나 **amendment `steps`가 `properties[0].steps`로 누수**(`:441`).
- **수정**: M-1 singleInput에 `amendment: undefined` 명시(위 코드). 이후 amendment는 오직 집계 결정세액에 대해 1회 계산.
- multi 경로는 per-asset item(`multi/route.ts:272` `{...p}`)이 amendment 미보유(top-level `data.amendment`) → 누수 없음. E4는 §166⑥ 방어 + multi 무해.

---

## 라우트 매핑 (Date 변환·2-pass)

### §166⑥ bundled (`route.ts:635~643`)
```ts
const aggregated = calculateTransferTaxAggregate(
  { taxYear: transferDate.getFullYear(), properties: items,
    annualBasicDeductionUsed: data.annualBasicDeductionUsed,
    priorReductionUsage: data.priorReductionUsage ?? [],
    amendment: engineInput.amendment },   // ← 신규 [A1]: 이미 :308~322에서 Date 변환됨
  rates,
);
```

### multi (`multi/route.ts:251` engineInput + 2-pass)
```ts
const engineInput: AggregateTransferInput = {
  taxYear, properties, annualBasicDeductionUsed, priorReductionUsage,
  amendment: data.amendment ? { /* :308~322 동형 Date 변환 */ } : undefined,   // ← 신규 [B5]
};
// 2-pass: baseResult(:264) → finalInput = {...engineInput}(:291~292) → result
```
- **2-pass 무해**: amendment ⊥ 가산세(Zod refine) → filingPenaltyDetails 부재 → 강화 루프 no-op. `determinedTaxBeforePenalty`는 가산세 무관 → 1·2차 동일 → 2차 반환 정확.

---

## 정수 연산

- 재사용 `computeAmendment`/`computeRefundClaim` 내부: `applyRate`(floor)·`truncateToWon`. `Math.round` 금지.
- 집계 `determinedTaxBeforePenalty`는 기존 산식 불변(`Math.max(0, calculatedTax − reductionAmount)`).
- 신규 산식 없음 — 주입만.

---

## Silent fallback / 자동 안분 후보 식별

- `amendment` 미지정 → `amendmentDetail=undefined`(자동 생성 안 함). silent 0 없음.
- `originalDeterminedTax` prefill = 진입 hydration 1회(§166⑥=`aggregated.determinedTax`, multi=`resultData.determinedTax`). 미입력(0) 방지 = validate `>0` 차단.
- 자동 안분 fallback 없음([[feedback_no_silent_apportion_fallback]]). useEffect→store 미러링 금지([[mirror-pattern]]).

---

## finalize→result 명시 plumbing (침묵 strip 방지)

집계 엔진은 finalize처럼 **명시 반환 객체**(`:446~473`)라 spread가 아님 → `amendmentDetail`을 **3지점** 추가해야 채워짐:
1. `AggregateTransferInput`에 `amendment?`(입력).
2. `calculateTransferTaxAggregate` 반환 객체에 `amendmentDetail`.
3. `AggregateTransferResult`에 `amendmentDetail?`(출력 타입).
> `BundledTransferResult.aggregated`·multi `{data: result}`는 `aggregated`/`result` **객체 통째로** 흐르므로 route·API plumbing 추가 불필요(내부 필드 확장). 정책 [[feedback_explicit_prop_mapping_strip]].

---

## 테스트 약속

- 케이스 인벤토리 7행 → M-A1~A7. Phase 0에서 M-A1·M-A3·M-A5 우선(실패 확보 후 타입 동결).
- M-A5(단건 동형)는 신고서 단위 로직 재사용 증명 — 단건 `computeAmendment`와 자산1 aggregate 결과 일치.
- M-A6(회귀 게이트)·M-A4(누수 strip) 필수.
- 금액 원단위 `toBe()`([[feedback_pdf_example_test_anchoring]]).

---

## UI 통합 위임

- UI 명세: `transfer-tax-multi-amendment.ui.design.md`.
- 변경 지점 매트릭스(E·A·B·S3)는 계획서 §6. 엔진은 input/result 타입·집계 주입·누수 strip만 책임.
