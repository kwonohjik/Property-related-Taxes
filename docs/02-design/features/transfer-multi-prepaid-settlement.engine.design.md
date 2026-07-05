# 다건 양도세 연간 합산 — 기납부세액 정산 엔진 설계

> 계획서: `docs/00-pm/transfer-multi-prepaid-settlement-history-load.plan.md`
> UI 설계: `docs/02-design/features/transfer-multi-prepaid-settlement.ui.design.md` (STEP 12)
> 대상 엔진: `lib/tax-engine/transfer-tax-aggregate.ts` (Layer 2)
> self-review: STEP 5 생성 → STEP 6~7 정정(fork 3-way, 14건 반영)

## Context

연간 합산 과세(다건) 집계 엔진은 총결정세액(비교과세§104⑤·§133 감면종합한도·양도차손통산§102·기본공제 연1회)을 이미 산출하나, **예정신고 기납부세액을 차감하지 않는다**. 확정신고 실무(소득세법 §111③)는 결정세액에서 예정신고 산출세액을 공제해 **추가납부/환급**을 확정한다. 이 설계는 집계 엔진에 **기납부세액 정산 1 스텝**을 추가한다(나머지 통합요소는 구현 완료 — 계획서 §3).

**핵심 제약(계획서 §2-A)**: 우리 엔진 `determinedTax`는 확정 basis(비교과세·§133 반영)로 §107② 예정신고 산출세액과 다를 수 있다 → 기납부세액은 **엔진 입력(사용자 확정값)** 이며, 엔진은 예정신고 산출세액을 재현하지 않는다(자동채움은 UI의 참고 편의, 엔진 무관).

---

## ★ 케이스 인벤토리 (필수)

| # | 시나리오 | 법령 근거 | anchor 출처 | 테스트 파일 | 상태 |
|---|---------|----------|-------------|-----------|------|
| 1 | 기납부 < 결정세액 → 추가납부 | 소득세법 §111③ | `settlementAdditionalPayable = D−P` | `multi-prepaid-settlement.test.ts` | ☐ TODO |
| 2 | 기납부 > 결정세액 → 환급 (예정 감면 미신청→확정 첫 감면 등) | §111③ | `settlementRefund = P−D` | 〃 | ☐ TODO |
| 3 | §133 종합한도 초과로 확정감면<예정감면 → 확정결정>예정합계 → 추가납부 | 조특법 §133 + §111③ | 자경농지 2건 합 >1억 capping | 〃 | ☐ TODO |
| 4 | 기납부 = 결정세액 → 정산 0 (추가납부·환급 모두 0) | §111③ | 경계값 | 〃 | ☐ TODO |
| 5 | priorPaidTax 미지정 → 신규필드 P=0 의미로 추가, **기존 필드 비트 동일**(회귀) | — | 기존 다건 anchor 재실행 | 〃 | ☐ TODO |
| 6 | priorPaidTax < 0 → validate 차단 (엔진 도달 전) | — | (validate 레이어) | `multi-transfer-tax-validate.test.ts` | ☐ TODO |
| 7 | 전액 비과세 자산 포함 → 해당 자산 determinedTax 0 기여, 정산 정상 | 소득세법 §89 | 비과세+과세 혼합 | `multi-prepaid-settlement.test.ts` | ☐ TODO |
| 8 | 양도차손 통산(§102)으로 D=0 인데 P>0 → 전액환급(`settlementRefund = P`) | §102 + §111③ | 차손통산 D=0 + P>0 | 〃 | ☐ TODO |
| 9 | amendment 지정 + priorPaidTax 지정 동시 → validate 차단(v1 상호배타 UX 가드) | — | (validate) | `multi-transfer-tax-validate.test.ts` | ☐ TODO |

**범위 외(별 anchor 불요, §10)**: penalty>0 정산 순서·amendment×prepaid **동시 계산**·지방소득세 기납부.

---

## 법령 근거

```
소득세법 §111③ (확정신고납부):
  확정신고납부를 하는 경우 제107조에 따른 예정신고 산출세액, 제114조에 따라 결정·경정한
  세액 또는 제82조·제118조에 따른 수시부과세액이 있을 때에는 이를 공제하여 납부한다.
  → v1은 §107 예정신고 산출세액(priorPaidTax) 공제만 대상. §114·§82 후단은 범위 외.

소득세법 §111① (확정신고납부):
  과세표준에 대한 산출세액에서 감면세액과 세액공제액을 공제한 금액(= 결정세액)을 납부.
  → 우리 결정세액 = AggregateTransferResult.determinedTax (구현 완료).

소득세법 §107② (예정신고 산출세액 2회 이후 합산): [(A+B−C)×D] − E
  → 예정신고 자체는 러닝 합산이나 비교과세·§133 확정정산 미반영(계획서 §2-A).
     엔진은 이를 재현하지 않음. priorPaidTax는 사용자 확정 입력.
```
**법령 상수 위치**: `lib/tax-engine/legal-codes/common.ts`(기존 §110 확정신고·§105 예정신고 상수 인접 `:25-27`, PENALTY 도메인)에 `FINAL_RETURN_SETTLEMENT = "소득세법 §111③"` 추가(문자열 리터럴 금지 정책 — transfer.ts 아님, 일관성).

---

## 엔진 input 타입

`lib/tax-engine/types/transfer-aggregate.types.ts` — `AggregateTransferInput` 확장:

```ts
export interface AggregateTransferInput {
  // ...기존 필드(taxYear·properties·annualBasicDeductionUsed·priorReductionUsage·amendment)...

  /**
   * 예정신고 기납부세액 총액 (양도소득세 국세분, 원). 확정신고 정산 시 결정세액에서 공제(§111③).
   * 미지정 시 0 — 자동 안분·추정 없음(feedback_no_silent_apportion_fallback).
   * 명칭은 transfer-tax-penalty.ts:40 priorPaidTax(동일 개념)와 일관.
   * ⚠️ v1: amendment 와 동시 지정 시 validate/UI가 입력 차단(상호배타). 단 이는 **UX 가드**이지
   *    데이터모델 제약이 아니며, 엔진은 priorPaidTax를 항상 처리(스텝 skip 없음 — 아래 알고리즘).
   */
  priorPaidTax?: number;
  /** 예정신고 기납부 지방소득세 (원). 미지정 0. (D5 — 기존 SummaryCard priorPaidLocalTax 이관) */
  priorPaidLocalTax?: number;
}
```

## 엔진 result 타입

`AggregateTransferResult` 확장 (전부 **required** 원시 `number` — 정산 스텝 항상 실행이라 undefined 없음. Record/Map 금지, feedback_engine_result_map_json_loss):

```ts
export interface AggregateTransferResult {
  // ...기존 필드...

  /** [echo] 예정신고 기납부세액 (국세, §111③). 미지정 0 */
  priorPaidTax: number;
  /** [echo] 예정신고 기납부 지방소득세. 미지정 0 (D5 — 기존 SummaryCard priorPaidLocalTax 이관) */
  priorPaidLocalTax: number;
  /** 국세 이번 납부할세액 = max(0, determinedTax + penaltyTax − priorPaidTax) */
  settlementAdditionalPayable: number;
  /** 국세 환급 = max(0, priorPaidTax − (determinedTax + penaltyTax)) */
  settlementRefund: number;
  /** 지방 이번 납부할세액 = max(0, localIncomeTax − priorPaidLocalTax) */
  settlementLocalPayable: number;
  /** 최종 납부할세액 = settlementAdditionalPayable + settlementLocalPayable (기존 카드 totalDue) */
  settlementTotalDue: number;
}
```
※ **approach A(D8) — 기존 `MultiTransferTaxSummaryCard`의 UI 자체계산(`currentTaxDue`·`currentLocalTaxDue`·`totalDue` `:122-129`)을 엔진으로 이관, `autoPriorPaid` 제거.** 국세 base는 기존 카드와 동일하게 `determinedTax + penaltyTax`(v1 penalty=0 → determinedTax와 동일, penalty>0 납부지연 base 정밀화는 §10). 명칭 `settlement*` — amendment `refundTax`(`transfer-amendment.types.ts:65`)·`additionalTax`(:50)와 분리. 부호 분리는 amendment 관례·UI 색상과 일치.

---

## 계산 알고리즘 (단계별)

**순수 헬퍼 `computeSettlement` 신설**(amendment의 `computeAmendment` 구조 미러 → orchestrator 경량화):

```ts
// lib/tax-engine/transfer-tax-settlement.ts (신규) — 기존 SummaryCard :122-129 로직 이관
export function computeSettlement(args: {
  determinedTax: number;   // 확정 결정세액(국세, 비교과세·§133 반영)
  penaltyTax: number;      // 가산세(국세). v1 정상신고=0
  localIncomeTax: number;  // 지방소득세 결정세액
  priorPaidTax: number;    // 예정신고 기납부(국세). 호출부 ?? 0
  priorPaidLocalTax: number; // 예정신고 기납부(지방). 호출부 ?? 0
}): {
  priorPaidTax: number; priorPaidLocalTax: number;
  settlementAdditionalPayable: number; settlementRefund: number;
  settlementLocalPayable: number; settlementTotalDue: number; step: CalculationStep;
} {
  const nationalDue = args.determinedTax + args.penaltyTax;      // 기존 카드와 동일 base
  const settlementAdditionalPayable = Math.max(0, nationalDue - args.priorPaidTax);
  const settlementRefund            = Math.max(0, args.priorPaidTax - nationalDue);
  const settlementLocalPayable      = Math.max(0, args.localIncomeTax - args.priorPaidLocalTax);
  const settlementTotalDue          = settlementAdditionalPayable + settlementLocalPayable;
  const step: CalculationStep = {
    label: "예정신고 기납부세액 정산",
    formula: `국세 ${nationalDue.toLocaleString()} − 기납부 ${args.priorPaidTax.toLocaleString()} = `
      + (args.priorPaidTax <= nationalDue
          ? `추가납부 ${settlementAdditionalPayable.toLocaleString()}`
          : `환급 ${settlementRefund.toLocaleString()}`),
    legalBasis: FINAL_RETURN_SETTLEMENT, // 소득세법 §111③
  };
  return { priorPaidTax: args.priorPaidTax, priorPaidLocalTax: args.priorPaidLocalTax,
    settlementAdditionalPayable, settlementRefund, settlementLocalPayable, settlementTotalDue, step };
}
```

**orchestrator(`transfer-tax-aggregate.ts`) — `determinedTaxBeforePenalty`(`:338`)·`penaltyTax`·`localIncomeTax`(`:361`) 산출 직후, `computeAmendment(:344)` 병렬 위치에 삽입, 항상 실행**(기존 분기 삽입 금지):

```
1. P = input.priorPaidTax ?? 0 ; PL = input.priorPaidLocalTax ?? 0   // 미지정 0, 자동추정 없음
2. computeSettlement({ determinedTax: D(:338), penaltyTax, localIncomeTax, priorPaidTax:P, priorPaidLocalTax:PL })
3. result에 6필드 대입 + steps.push(step)
```
**dual-truth 이관(approach A)**: 기존 SummaryCard의 `currentTaxDue`·`currentLocalTaxDue`·`totalDue` UI 계산과 `autoPriorPaid`를 **제거**하고, 카드는 `result.settlement*`를 read. `localIncomeTax`(`:361`)는 penaltyTax 포함 base(`determinedTaxBeforePenalty + perAssetBuildingPenalty`)로 이미 산출됨 — 정산은 그 값을 그대로 사용.

- **정산 스텝 항상 실행** → 정산 필드는 항상 정의(required 타입 안전). `amendment` 존재 여부와 무관하게 엔진은 `P ?? 0`로 계산(P=0이면 additionalPayable=D·refund=0). **amendment×priorPaidTax 상호배타는 validate/UI 책임**(동시 입력 차단), 엔진 skip 아님.
- **정산 base = `determinedTax`(국세 결정세액)**. 가산세(`penaltyTax`)·지방소득세(`localIncomeTax`)는 정산 대상 아님(v1: penalty=0 전제, 지방 기납부는 D5 후속). `totalTax`(결정+가산+지방)는 **gross 표시용으로 불변** — 단, 실제 납부액은 P>0 시 `settlementAdditionalPayable`이므로 결과 hero/신고서 표시는 이를 반영(§UI통합위임).
- **정수 연산**: P·D 원 단위 정수 → `Math.max`만, 절사 불요.
- **penalty 교차참조**: `transfer-tax-penalty.ts:169-177`도 `결정−…−기납부`로 동일 납부세액 개념 보유(가산세 base). 완전 통합은 과설계(항 5개↑, Simplicity First) → 별도 헬퍼 유지 + 주석 교차참조.

---

## Silent fallback / 자동 안분 후보 식별

- `priorPaidTax` 미지정 → **0**(자동 안분·건별 추정 금지). 자동채움은 UI 레이어의 참고 편의이며 엔진은 관여하지 않는다.
- per-property 기납부 표시가 필요하면 **기존 `refDeterminedTax`**(`types:126-132`) 참고. ⚠️ 단 `refDeterminedTax`는 집계 컨텍스트서 `skipBasicDeduction=true`로 산출돼(`aggregate:405` 주석) **진짜 단독 예정신고세액이 아닌 근사** — "참고 추정"으로만 표기, 정확 기납부는 사용자 확정(§2-A 일관).
- 음수/과대 입력은 validate에서 차단·경고(엔진은 방어적 `?? 0`·`Math.max`).

---

## 테스트 약속

- 케이스 인벤토리 1~9 전 행 anchor(원 단위 `toBe()`).
- **회귀(#5)**: priorPaidTax 미지정 다건 → 기존 필드 **비트 동일** + 신규 3필드(P=0) 추가. 기존 `transfer*aggregate*` 스위트 전량 통과 게이트.
- **Pre-Do anchor 우선**(pre-do-anchor-verification): #1(추가납부)·#3(§133 초과→추가납부)를 Do 전 먼저 작성·실행해 설계 환류.
- 파일: `__tests__/tax-engine/transfer/multi-prepaid-settlement.test.ts` (신규), 음수차단·상호배타(#6·#9)는 `multi-transfer-tax-validate.test.ts`.

---

## UI 통합 위임 (approach A — 기존 카드 리팩터, STEP 12가 승계)

**approach A(D8)**: 기존 `MultiTransferTaxSummaryCard`가 이미 정산 행을 렌더하나 UI 자체계산(dual-truth) + `autoPriorPaid`(§107 위반 단순합). 엔진이 정산을 계산하고 카드는 read하도록 리팩터:

1. **SummaryCard 리팩터**: `currentTaxDue`·`currentLocalTaxDue`·`totalDue`·`autoPriorPaid` **제거**(`:112-129`), `result.settlementAdditionalPayable`/`settlementLocalPayable`/`settlementTotalDue` **read**(dual-truth 해소, feedback_ui_engine_dual_truth_avoidance). 기존 렌더 행(기납부세액·이번 납부할세액·지방세 기납부·납부할세액 `:182-197`)은 유지하되 소스만 엔진으로.
2. **caller 배선**: `MultiTransferTaxCalculator`가 `MultiTransferTaxResultView`에 정산값 전달 — 단 approach A는 값이 `result.*`에 있으므로 override prop 대신 **result read**로 단순화. 사용자 입력 `priorPaidTax`/`priorPaidLocalTax`는 폼→API→엔진으로 흐름.
3. **입력 위젯**: 국세 기납부 + 지방 기납부 두 필드(AggregateSettingsPanel). 자동채움+수동편집(mirror-pattern, edited 플래그).
4. **신고서 양식**: `FilingFormTable`(별지 제84호, `:19,507`)에 기납부세액·납부할세액 행(besshi-form-replica).
5. 14 동기화 지점·불러오기 진입점 D7 등은 `transfer-multi-prepaid-settlement.ui.design.md`.
- 엔진 시니어 책임: input(priorPaidTax·priorPaidLocalTax)/result(6필드) + `computeSettlement` 헬퍼 + 상수. 카드 리팩터·폼/위젯·신고서 행은 UI 시니어.
