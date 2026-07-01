# 양도소득세 경정청구(세액 감소·환급) 기능 — 작업 계획서

> 작성 2026-07-02. 대상: **양도소득세 단건(single) 경로만**.
> 트리거 사례: 당초 신고 후 **양도가액 과다·취득가액/필요경비 과소·감면 누락·수용재결 감액** 등으로 정당 세액이 당초보다 **작아진** 경우 → **경정청구(환급)**.
> PR #459 **수정신고(amendment, 세액 증가)** 의 **거울상**. 재계산·이력 hydration·저장소·14 plumbing 인프라를 **재사용**하고 `correctionKind` 판별자로 방향만 분기.
> 이 계획서의 모든 file:line·수치·법령은 **실제 코드/법제처 본문 실측** 기반(추정 없음).
> 자매 계획서: [`transfer-tax-amendment.plan.md`](transfer-tax-amendment.plan.md). 설계 문서(engine/ui)는 self-review-loop STEP 5·12에서 생성 예정.

---

## 0. 목적

당초 신고를 마친 양도건에 대해 **양도가액·취득가액·필요경비를 정정**하여 다시 계산하고,
**당초 결정세액에서 경정 결정세액을 차감**해 **환급받을 세액(환급세액)** 을 산출한다.
국세환급가산금은 **세무서가 산정·지급**(지급결정일이 청구 시점엔 미정)하므로 **원금만 계산하고 안내 문구로 표기**한다.
경정청구 **사유 유형(일반/후발적)** 과 **청구기한(5년 / 3개월)** 을 표시하고 도과 시 **경고(비차단)** 한다.

## 1. 요구사항

1. 1차(당초) 신고서를 입력·저장한다. *(기존 — 재사용)*
2. 1차 신고서를 **불러와서** 정정(양도가액·취득가액·필요경비 등)한 경정청구서를 작성한다.
3. **당초 결정세액에서 경정 결정세액을 차감**해 환급세액을 산출한다.
4. 경정청구 **사유 유형**(일반 5년 / 후발적 3개월)을 선택하고, **청구기한**을 표시·도과 경고한다.
5. **국세환급가산금**은 안내만(세무서 산정, 원금만 계산).
6. **양도소득세만** 대상, **단건(single)만**.

---

## 2. 법령 검증 (법제처 [현행] 본문 직접 조회 — 추정 없음)

| 근거 | 내용 | 출처(mst·시행일) |
|---|---|---|
| **국세기본법 §45의2①** | 신고 과세표준·세액이 세법상 세액을 **초과**할 때 **법정신고기한 후 5년 이내** 경정청구 | 001586·20260701 |
| **국세기본법 §45의2②** | **후발적 사유**(1호 판결·심판·화해로 거래가 다르게 확정 등) 발생을 **안 날부터 3개월 이내**(5년 지나도) | 〃 |
| **국세기본법 §45의2③** | 세무서장은 청구받은 날부터 **2개월 이내** 결정·경정 또는 이유없음 통지 | 〃 |
| **국세기본법 §52①·③1호** | 경정청구(§45의2) 환급은 **국세환급가산금 대상**(고충민원 없이 경정청구로 환급 시 가산) | 〃 |
| **국세기본법 시행령 §43의3①1호** | 환급가산금 **기산일 = 국세 납부일의 다음 날**(신고를 경정함에 따라 발생한 환급금) | 002884·20260701 |
| **국세기본법 시행규칙 §19의3** | 환급가산금 이율 = **연 1천분의 31 = 연 3.1%** (현행) | 006741·20260320 |
| **소득세법 §110①** | 양도세 확정신고기한 = **양도 다음해 5.1~5.31** → 법정신고기한(경정청구 5년 기산점) | (수정신고 계획서에서 검증) |

> **핵심 판단(환급가산금 정확 산정 불가)**: §52 가산금 종점 = **지급결정일**(§45의2③ 세무서가 청구받은 날부터 2개월 이내 결정) → **청구 작성 시점엔 미래·미정**. 이율(연 3.1%)도 기간별 변동 가능. → **원금만 정확 산정, 가산금은 안내**(결정 ②). 수정신고의 납부지연가산세는 종점(수정신고 납부일)을 납세자가 정하므로 계산 가능했으나, 경정청구 환급가산금은 종점을 **세무서가** 정하므로 비대칭 — 계산 배제가 정확.
> **후발적 사유 매핑**: 수용보상금 **감액**이 수용재결·판결로 확정된 경우 = §45의2②1호 후발적 사유(안 날부터 3개월). (증액보상금은 §48①2호 정당한 사유 — 수정신고 축과 별개.)

---

## 3. 현행 코드 실측 — 재사용 자산 (PR #459 병합분, 라인 재확인 완료)

| 영역 | 위치 | 현황(재사용) |
|---|---|---|
| 정정 엔진 진입 | `transfer-tax-finalize.ts:374~378` | `input.amendment ? computeAmendment(input.amendment, determinedTax) : undefined` — **분기 없이 correctionKind 내부 처리** |
| 엔진 코어 | `transfer-tax-amendment.ts:52` `computeAmendment` | `additionalTax = max(0, determined − original)`(:58) — refund는 이미 0. **음수 가드 = 경정청구 영역**(자매 계획 §4 A4) |
| result plumbing | `transfer-tax-finalize.ts:113,415` + `transfer-tax.ts:732,789` | `amendmentDetail` **객체 전체**가 통째로 흐름 → **내부 필드 추가는 신규 plumbing 불필요**(Option A 이점) |
| 입력/결과 타입 | `types/transfer-amendment.types.ts` | `AmendmentInput`(17~36)·`AmendmentDetail`(38~55) — 필드 추가 |
| 이력 hydrate | `HistoryDetailDrawer.tsx:122` `handleResume` / `:157` `handleAmend`(버튼 `:301~305`) | `updateFormData(record.inputData)` + 정정 필드 세팅 — **버튼 1개 추가** |
| 폼 상태 | `calc-wizard-store.ts:176~187`(타입)·`247~254`(default) | amendment 필드 존재 → 신규 4필드 추가 |
| Zod | `transfer-tax-schema-sub.ts:376` `amendmentSchema` + `-schema.ts:472,478` 상호배타 refine | `.extend()` 로 신규 optional 필드 |
| API 변환 | `transfer-tax-api.ts:528~530` `form.amendmentMode ? {amendment:{…}}` | payload에 신규 필드 |
| Route 매핑 | `route.ts:344~354` amendment→engineInput | 신규 date `toOptionalDate` |
| validate | `transfer-tax-validate.ts:250~251` amendmentMode 블록 | refund_claim 분기 |
| 저장소 dedup | `business-key.ts:42` `amendmentMode → \|amend` | correctionKind별 `\|amend`/`\|refund` |
| 이력 라벨 | `title-generator.ts:102` `amendmentMode → "수정신고"` | refund_claim → "경정청구" |
| 법정신고기한 도출 | `lib/calc/transfer-amendment-helpers.ts` `deriveStatutoryDeadline` | `(양도연도+1)-05-31` — **재사용**(경정청구 5년 기산) |
| 결과 카드 | `AmendmentResultCard.tsx` + `TransferTaxResultView.tsx`(hero swap) | correctionKind 분기 |
| 입력 패널 | `AmendmentBlock.tsx`(Step6 `amendmentMode` 조건부) | correctionKind 분기 |
| 배너 | `TransferTaxCalculator.tsx` `amendmentMode` 배너 | correctionKind 문구 분기 |

> `correctionKind`/`refund_claim`/`refundTax` 전역 grep = **부재** → 신규 심볼 충돌 없음.

---

## 4. 핵심 설계 판단 (결정 반영)

### 4.1 아키텍처 — 기존 `amendment` 확장 (결정 ①)
`amendment` 입력/결과에 **`correctionKind: "amend" | "refund_claim"` 판별자**(optional, 미지정=amend) 추가.
- `computeAmendment`가 `correctionKind ?? "amend"`로 분기 → refund_claim이면 신규 `computeRefundClaim`.
- **기존 수정신고(amend) 경로는 바이트 불변** — 기존 anchor A1~A9 전부 pass가 회귀 게이트(§8 R8).
- `amendmentMode`(boolean) = "정정 작성 중", `correctionKind` = 방향. 저장소·plumbing·hydration 전부 재사용.

### 4.2 환급세액 = first-class (결정 ②)
```
환급세액 = max(0, 당초 결정세액 − 경정 결정세액)
```
- 경정 결정세액 = 이번 엔진 run의 `determinedTax`. 당초 결정세액 = 입력(자동추출+수정). **2-pass 불필요**.
- **국세환급가산금**: 원금만 산정. 가산금은 카드 **안내 callout**("납부일 다음날부터 지급결정일까지 연 3.1%, 세무서가 산정·지급"). `originalPaymentDate` 입력 시 기산일(납부일 다음날)만 구체 표기. **금액 미계산**(지급결정일 미정).
- **참고 지방소득세 환급 = 환급세액 × 10%** — "지자체 별도 경정청구" 라벨(당초 지방소득세분도 과다납부 → 별도).

### 4.3 경정청구 사유·기한 (결정 ③ — 비차단 경고)
- `claimReasonType: "ordinary" | "posterior"`:
  - **ordinary(일반, §45의2①)**: 청구기한 = **법정신고기한 + 5년**.
  - **posterior(후발적, §45의2②)**: 청구기한 = **후발적 사유 안 날 + 3개월**.
- 도과 판정 = `경정청구일(amendedFilingDate 재사용) > 청구기한`. **경고만**(하드 차단 X — 특례·연장 edge 존재).
- 환급액 0(경정세액 ≥ 당초세액) → "경정청구 실익 없음" 경고(비차단).

---

## 5. 데이터 모델 (신규 필드 — 전부 additive·비파괴)

### 5.1 폼 (`TransferFormData`, `calc-wizard-store.ts:176~`)
```ts
// ── 정정 방향(경정청구 확장) ──
correctionKind: "amend" | "refund_claim";      // default "amend" (기존 수정신고 불변)
claimReasonType: "ordinary" | "posterior";     // 경정청구 사유 유형, default "ordinary"
posteriorEventDate: string;                     // 후발적 사유 안 날(YYYY-MM-DD) — posterior 3개월 기산
originalPaymentDate: string;                     // 당초 납부일(YYYY-MM-DD, 선택) — [F2] form-only. 엔진 미plumb, AmendmentBlock 기산일 안내에만 사용
```
- **재사용**: `amendmentMode`(정정 모드), `originalDeterminedTax`(당초 결정세액), `statutoryFilingDeadline`(법정신고기한 = ordinary 5년 기산), `amendedFilingDate`(→ **경정청구일**로 재사용, 도과 판정 종점).
- `defaultFormData`(`:247~`): `correctionKind:"amend"`, `claimReasonType:"ordinary"`, `posteriorEventDate:""`, `originalPaymentDate:""`.
- **[F2] `originalPaymentDate`는 form-only**: 계산에 미사용(환급가산금 안내용) → 엔진 input·Zod·Route·API payload·result에 **미포함**. AmendmentBlock에서 "납부일 다음날 = 기산일" 표시에만. IndexedDB inputData로 자동 보존.
- ⚠️ **[정책 mirror-pattern]** 자동값(당초세액·법정신고기한)은 진입 hydration **1회 세팅**. `transferDate`→기한 파생을 **useEffect→store 미러링 금지**(무한루프). 도과 경고·청구기한 표시는 useMemo display(엔진 단일진실 우선).

### 5.2 엔진 입력 (`AmendmentInput`, `types/transfer-amendment.types.ts:17`)
```ts
correctionKind?: "amend" | "refund_claim";   // 미지정 = "amend"(기존 불변)
claimReasonType?: "ordinary" | "posterior";  // refund_claim 전용
posteriorEventDate?: Date;                    // posterior일 때 3개월 기산점
// [F2] originalPaymentDate 미포함 — 계산 미사용, form-only
```
> 재사용: `originalDeterminedTax`, `statutoryFilingDeadline`(ordinary 5년), `amendedFilingDate`(경정청구일 = 도과 종점). **엔진 plumb 신규 입력 = 3필드**(correctionKind·claimReasonType·posteriorEventDate).

### 5.3 엔진 결과 (`AmendmentDetail`, `types/transfer-amendment.types.ts:38`)
```ts
correctionKind?: "amend" | "refund_claim";   // 미지정/"amend" = 기존 수정신고(비파괴)
// ── refund_claim 전용(모두 optional) ──
refundTax?: number;                // 환급세액 = max(0, 당초 − 경정) — hero 값
refundLocalIncomeTax?: number;     // 참고 — 지방소득세 환급(환급세액×10%)
claimReasonType?: "ordinary" | "posterior";
claimDeadline?: string;            // 청구기한(ISO "YYYY-MM-DD") — ⚠️ Date 아님(JSON 직렬화 안전)
isDeadlineExceeded?: boolean;      // 도과 경고 플래그
```
> 기존 amend 필드(`additionalTax`·penalties·`totalPayable`)는 refund 시 **0/미사용**. `correctionKind` optional → **기존 amend return 무수정**(undefined ⇒ amend). `claimDeadline`은 **string**(Date를 result에 실으면 JSON 경유 string 드리프트 — memory `feedback_engine_result_map_json_loss` 계열 함정 회피).
> **[F3·F4]** `totalRefund` 삭제(= `refundTax` 중복). `refundInterestBasisDate` 삭제(카드는 form 미접근·안내 generic → 기산일 표시는 AmendmentBlock에서 form.originalPaymentDate로).

---

## 6. 14 동기화 지점 + 저장소 (신규 4필드 기준)

| # | 지점 | 파일:line | 작업 |
|---|---|---|---|
| ① | 폼 상태 | `calc-wizard-store.ts:176` | 5.1 4필드 |
| ② | initial | `calc-wizard-store.ts:247` | 기본값 |
| ③ | normalize/merge | store merge 스프레드 | 신규 default 병합 확인 |
| ④ | API 변환 | `transfer-tax-api.ts:528~530` | amendment payload += `correctionKind`·`claimReasonType`·`posteriorEventDate`(3). **[F6] refund일 때 `applyUnderReportingPenalty:false`·`applyLatePaymentPenalty:false` 강제**(stale 누출 차단). `originalPaymentDate` 미전송 |
| ⑤ | UI 위젯 | `AmendmentBlock.tsx`·`HistoryDetailDrawer.tsx`·`TransferTaxCalculator.tsx` | correctionKind 분기 + 진입 버튼 |
| ⑥ | 사이드바 합계 | `computeTransferSummary` | (선택) 환급세액 미리보기 |
| ⑦ | 결과 카드 | `AmendmentResultCard.tsx`·`TransferTaxResultView.tsx` | refund 분기 hero + **[F13] 비과세 분기 재정렬**(:270) |
| ⑧ | validation | `transfer-tax-validate.ts:250` | **당초세액>0은 기존 규칙(:251)이 amendmentMode 전체 커버**. 신규 = **[F5]** `refund_claim && posterior && !posteriorEventDate` 차단 1건만 추가. amend 전용 검증(:253·259)은 penalty 게이트→refund 미발동(실측 확인) |
| ⑨ | Zod main | `transfer-tax-schema.ts:472` | `amendment.optional()` — **기존 유지**(상호배타 refine `:478` 불변) |
| ⑩⑪ | companion·asset fallback | — | **N/A**(신고서 단위, 자산-수준 아님) |
| ⑫ | **Zod 입력객체** | `transfer-tax-schema-sub.ts:376` | `amendmentSchema.extend({correctionKind·claimReasonType enum().optional(), posteriorEventDate date().optional()})`. (선택 hardening) refund_claim+posterior→posteriorEventDate superRefine |
| ⑬ | **body spread** | `transfer-tax-api.ts` `callTransferTaxAPI` | amendment 이미 body 포함(내부 필드 확장) |
| ⑭ | **Route 매핑(Date)** | `route.ts:344~354` | += `correctionKind`·`claimReasonType` 전달 + `posteriorEventDate` `toOptionalDate`. (`originalPaymentDate` [F2] 미매핑) |

> ⑫⑬⑭ TS 미감지 → 누락 시 침묵 strip. grep 자가점검(`feedback_api_zod_schema_sync`).

### 6.1 저장소 (14 밖 — Critical)
| 지점 | 파일:line | 작업 |
|---|---|---|
| ⓢ1 dedup | `business-key.ts:42` | `amendmentMode ? (correctionKind==="refund_claim" ? "\|refund" : "\|amend") : ""` → 당초·수정신고·경정청구 **3-record 공존**(같은 물건) |
| ⓢ2 라벨 | `title-generator.ts:102` | `correctionKind==="refund_claim" ? "경정청구" : (amendmentMode ? "수정신고" : "")` 접미 |
| ⓢ3 진입 | `HistoryDetailDrawer.tsx` `handleRefundClaim`(신규) | 당초세액·법정신고기한 1회 세팅(useEffect 아님) |

---

## 7. 엔진 설계

### 7.1 청구기한 도출 — `resolveClaimDeadline`
```ts
import { addMonths, addYears, isAfter } from "date-fns";
export function resolveClaimDeadline(
  reasonType: "ordinary" | "posterior" | undefined,
  statutoryFilingDeadline: Date | undefined,
  posteriorEventDate: Date | undefined,
): Date | undefined {
  if (reasonType === "posterior")
    return posteriorEventDate ? addMonths(posteriorEventDate, 3) : undefined; // §45의2② 3개월
  return statutoryFilingDeadline ? addYears(statutoryFilingDeadline, 5) : undefined; // §45의2① 5년
}
```
> **날짜연산**(`addMonths`/`addYears`) — 일수환산·`differenceInCalendarMonths` 금지(§48② 정정과 동일 원칙). 도과 = `amendedFilingDate && claimDeadline ? isAfter(amendedFilingDate, claimDeadline) : false`.

### 7.2 환급 계산 — `computeRefundClaim`(신규, `transfer-tax-amendment.ts`)
```ts
function computeRefundClaim(a: AmendmentInput, determinedTax: number): AmendmentDetail {
  const refundTax = Math.max(0, a.originalDeterminedTax - determinedTax);        // 환급세액
  const refundLocalIncomeTax = applyRate(refundTax, 0.1);                        // 참고(지자체 별도)
  const claimDeadline = resolveClaimDeadline(a.claimReasonType, a.statutoryFilingDeadline, a.posteriorEventDate);
  const isDeadlineExceeded = !!(claimDeadline && a.amendedFilingDate && isAfter(a.amendedFilingDate, claimDeadline));
  const steps: CalculationStep[] = [ /* 당초·경정 결정세액 / 환급세액(legalBasis 국기법 §45의2) / 참고 지방소득세 환급(legalBasis 지방세법 §103의, "지자체 별도 경정청구") */ ];
  return {
    correctionKind: "refund_claim",
    originalDeterminedTax: a.originalDeterminedTax,
    amendedDeterminedTax: determinedTax,
    additionalTax: 0, underReportingReductionRate: 0, underReportingPenalty: 0,
    latePaymentPenalty: 0, additionalLocalIncomeTax: 0, totalPayable: 0, // amend 필드 0
    refundTax, refundLocalIncomeTax, claimReasonType: a.claimReasonType,
    claimDeadline: claimDeadline ? toISODateUTC(claimDeadline) : undefined,
    isDeadlineExceeded, steps,   // [F3·F4] totalRefund·refundInterestBasisDate 삭제
  };
}
```
- `computeAmendment` 상단 분기: `if ((a.correctionKind ?? "amend") === "refund_claim") return computeRefundClaim(a, determinedTax);` — **기존 amend 경로 이하 전부 불변**.
- 정수: `applyRate`(floor)·`truncateToWon`. `Math.round` 금지.
- **[I2 — 설계 H1 동기화]** `toISODateUTC(d)` = `` `${d.getUTCFullYear()}-${pad(d.getUTCMonth()+1)}-${pad(d.getUTCDate())}` `` — **`getUTC*`**(date-coerce `new Date("YYYY-MM-DD")`=UTC 자정 실측). `format`·`toISOString`·로컬 getter 금지(UTC-음수 tz −1일). `transfer-tax-amendment.ts` 내부 헬퍼(client validate import 금지). 엔진 순수(`new Date()` 직접 금지).
- **[I1] legal-codes 상수**(`legal-codes/common.ts`): `CORRECTION_CLAIM_45_2`·`REFUND_GAIN_52`·`CLAIM_PERIOD_ORDINARY_YEARS(5)`·`CLAIM_PERIOD_POSTERIOR_MONTHS(3)`·`REFUND_GAIN_RATE_ANNUAL(0.031 안내표기)`. steps `legalBasis`는 **상수 참조**(리터럴 금지 `feedback_legal_codes`).
- **국세환급가산금 금액 미산정**(안내 callout은 UI). 산식 한국어 풀어쓰기.

### 7.3 [F1 — Critical] 비과세·손실 조기반환 주입 (refund 전용 필수)
경정 재계산이 **전액 비과세(`transfer-tax.ts:275~282` `isExempt`)** 또는 **양도차손(`:411` §114조의2① 산출세액 0)** 이면 `finalizeTransferTax`(`:679`) **미경유** → STEP 12.5의 `amendmentDetail` 미생성. **이때가 refund의 최대 케이스(전액 환급)** — 반드시 처리.
- **정정**: 두 조기반환 객체(`:282`·`:411`)에 `amendmentDetail: input.amendment ? computeAmendment(input.amendment, 0) : undefined` 추가(determinedTax=0). refund → `refundTax = max(0, 당초 − 0) = 당초 전액`. amend → `additionalTax=max(0,0−당초)=0`(무해·정확: 비과세면 추가납부 없음).
- `transfer-tax.ts`에 `import { computeAmendment } from "./transfer-tax-amendment"` 추가(현재 finalize만 import).
- **Do 필수**: `transfer-tax.ts` **모든 `return {` grep**(재개발 STEP 0.65 등 finalize 미경유 분기 전수) → refund 미도달 지점 0 확인. (anchor R10)
- 정책 `feedback_explicit_prop_mapping_strip` — 조기반환은 명시 return 객체라 침묵 strip 아님, **명시 추가**해야 채워짐.

### 7.4 상호배타·2-pass
- `amendment`(refund 포함) ↔ penalty details 상호배타 refine(`schema.ts:478`) **불변** — refund도 amendment 하위라 자동 적용.
- Route 2-pass 주입(`route.ts` penalty 블록) **미진입**(amendment 존재 시) — 기존 게이트 재사용.

---

## 8. UI 설계

### 8.1 진입 — `HistoryDetailDrawer` (버튼 2개)
- 기존 **"수정신고 작성"**(`:301` `handleAmend`) 옆에 **"경정청구 작성"**(`data-testid="drawer-correction"`, `handleRefundClaim`).
- **노출 가드**(양쪽 공통): `record.taxType==="transfer"` **AND** `resultData.mode==="single"`.
- `handleRefundClaim()`(hydration 1회):
  ```ts
  updateFormData({
    ...(record.inputData as …),
    amendmentMode: true,
    correctionKind: "refund_claim",
    applyUnderReportingPenalty: false, applyLatePaymentPenalty: false, // [F6] amend 플래그 차단
    amendmentSourceId: record.id,
    originalDeterminedTax: String(record.resultData.result.determinedTax ?? ""),
    statutoryFilingDeadline: deriveStatutoryDeadline(record.inputData.transferDate),
    amendedFilingDate: todayLocalISO(),  // [F7] 경정청구일 기본=오늘 → isDeadlineExceeded 활성(engine 단일진실)
    // originalPaymentDate·posteriorEventDate = 사용자 입력(빈값)
  });
  setStep(0); router.push(route);
  ```
  > `todayLocalISO()`는 `transfer-tax-validate.ts`에 이미 존재(재사용). 클라이언트 hydration이라 엔진 순수성 무관. 사용자 수정 가능.
- 기존 `handleAmend`에 `correctionKind: "amend"` 명시 1줄 추가(default와 일치, 명확성).
- **[F12]** 수정신고 record(`inputData.amendmentMode===true`)에도 버튼 노출 가능 — 이때 `originalDeterminedTax`=수정 결정세액(법적으로 경정청구 대상=최종 결정세액이라 유효). single 가드만 유지.

### 8.2 배너 (`TransferTaxCalculator`)
- `amendmentMode` 시 문구 분기: refund_claim → **"📄 경정청구 작성 중 — 당초 신고 기준 불러옴. 과다신고 항목(양도가액·취득가액·필요경비)을 정정하세요."**(sky/blue), amend → 기존 amber.

### 8.3 Step 6 — `AmendmentBlock` (correctionKind 분기)
refund_claim일 때 **가산세 토글 대신**:
- **당초 결정세액**(CurrencyInput, prefill·수정) — "당초 신고·납부한 양도소득세 본세"
- **경정청구 사유 유형** `RadioCardGroup`(native 금지):
  - `ordinary` — "일반(법정신고기한 후 5년)" → **법정신고기한** DateInput(자동도출 prefill)
  - `posterior` — "후발적 사유(§45의2②, 안 날부터 3개월)" → **후발적 사유 안 날** DateInput
- **경정청구일** DateInput(`amendedFilingDate` 재사용, 도과 판정) — "청구서 제출(예정)일", 기본=오늘(F7)
- **당초 납부일**(선택) DateInput(`originalPaymentDate`, form-only) — 입력 시 "**환급가산금 기산일 = {납부일+1일}**" 표시(AmendmentBlock가 form 접근 → 기산일 계산·표시. F4)
- **청구기한·도과 경고** — 엔진 산출 `claimDeadline`·`isDeadlineExceeded` 표시(단일진실): "청구기한 2027-05-31 — 청구 가능" / (도과) "⚠️ 청구기한 경과 — 경정청구 불가 가능(개별 확인)"
- **국세환급가산금 안내 callout**: "환급금에는 국세환급가산금(납부일 다음날~지급결정일, **연 3.1%**)이 가산되며 **세무서가 산정·지급**합니다."
- `DateInput`(type=date 금지)·`RadioCardGroup` 필수.

### 8.4 결과 — `AmendmentResultCard` (correctionKind 분기)
refund_claim일 때:
- **[Hero 전환]** `TransferTaxResultView`(실측): `result.isExempt ?`(:270 🎉비과세) → `result.amendmentDetail ?`(:278 카드) → normal(:280) 순. refund 카드는 `additionalTax` 게이트 없이 `amendmentDetail`만으로 진입. 카드 내부 `detail.correctionKind==="refund_claim"`이면 hero=**`refundTax`("환급 청구세액")**. `fullTotalTax`(=`result.totalTax`)는 "참고"로 강등.
- **[F13 — High] 비과세 경정 분기 재정렬**: `:270` 조건을 `result.isExempt && result.amendmentDetail?.correctionKind !== "refund_claim"`로 변경. 비과세 경정(전액환급)은 🎉비과세 hero 대신 refund 카드로 진입(F1 엔진 주입과 짝). amend·비amendment의 비과세는 기존 🎉 유지(회귀 0). 손실(:411, isExempt=false)은 기존 :278이 이미 포착.
- 표(우측정렬): 당초 결정세액 / 경정 결정세액 / **환급세액** / 참고 지방소득세 환급("지자체 별도 경정청구") / 청구기한(+도과 tone) / 국세환급가산금 안내 callout(**generic** — 카드는 form 미접근, 기산일 없이 "납부일 다음날~지급결정일 연 3.1%, 세무서 산정").
- 산식 한국어 풀어쓰기. 펼치기 `ExpandToggleButton`, 인쇄 CSS-only.

---

## 9. 검증

### 9.1 Pre-Do anchor (`__tests__/tax-engine/transfer/correction-claim.test.ts`)
- **R1**: 당초 50,000,000 / 경정 30,000,000, refund_claim → `refundTax=20,000,000`, `refundLocalIncomeTax=2,000,000`, `totalRefund=20,000,000`, penalties 0.
- **R2(역방향 가드)**: 당초 30,000,000 / 경정 50,000,000 → `refundTax=0`(max0), 경고 영역.
- **R3(ordinary 기한)**: 법정신고기한 2022-05-31, ordinary → `claimDeadline="2027-05-31"`. 경정청구일 2026-07-01 → `isDeadlineExceeded=false`.
- **R4(ordinary 도과)**: 법정신고기한 2019-05-31 → `claimDeadline="2024-05-31"`, 청구일 2026-07-01 → `isDeadlineExceeded=true`.
- **R5(posterior 기한)**: `posteriorEventDate` 2026-06-01, posterior → `claimDeadline="2026-09-01"`, 청구일 2026-07-01 → false.
- **R6(posterior 도과)**: `posteriorEventDate` 2026-01-01 → `claimDeadline="2026-04-01"`, 청구일 2026-07-01 → true.
- **R7(통합)**: `calculateTransferTax` 전체 파이프라인(과세 경로)에서 `amendmentDetail.refundTax` 실측.
- **R10(F1 — 비과세 조기반환 전액환급)**: `computeAmendment({correctionKind:"refund_claim", originalDeterminedTax:X, …}, 0)` **단위 테스트 우선**(fixture 불요) → `refundTax = X`(당초 전액). (선택) 통합은 1세대1주택 비과세 fixture로 `calculateTransferTax` → `amendmentDetail.refundTax=X` 실측(F14). 손실(§114조의2①, determinedTax 0) 경로도 동일.
- **R8(기존 amend 회귀 — 핵심 게이트)**: **신규 test 아님** — 기존 `__tests__/tax-engine/transfer/amendment.test.ts`(A1~A9) 재실행. `correctionKind` 미지정 → amend 경로 **바이트 불변, 전부 green**.
- **R9(저장소 3-record)**: 당초(false) → 수정신고(`|amend`) → 경정청구(`|refund`) → `extractBusinessKey` 3키 상이 → `list()` **3건** 공존(당초·수정 미소실).

> anchor는 **실행 후 실패 확보**(현행 미구현 자연 실패) → 결과 타입 동결. "현행 일치 예상" 금지.

### 9.2 E2E (`e2e/transfer-correction-claim.spec.ts`)
1. 당초 신고 입력→계산→이력 저장
2. 드로어 **"경정청구 작성"** → hydrate + 경정 배너 노출
3. 양도가액 **하향** 수정 → 당초 결정세액 자동 prefill 확인
4. ordinary 계산 → **환급세액 hero** 표시 + 청구기한 노출
5. Network body에 `amendment.correctionKind:"refund_claim"` 포함(⑬⑭ 실증)

### 9.3 회귀
- `npx vitest run __tests__/tax-engine/transfer/amendment.test.ts`(**수정신고 A1~A9 불변 = R8 게이트**)
- `npx vitest run __tests__/tax-engine/transfer/` + `npm test` + `npx tsc --noEmit` 0건

---

## 10. 작업 단계 (Phase)

```
Phase 0  R1·R3·R10 anchor 작성·실행(실패 확보)            → verify: 결과 타입 동결
Phase A  타입(input/result 신규필드) + resolveClaimDeadline + computeRefundClaim
                + computeAmendment 상단 분기
                + [F1] 조기반환 2지점(:282·:411) computeAmendment(_,0) 주입 + 전체 return grep
                                                        → verify: R1~R7·R10 green + amendment.test.ts(A1~A9=R8) 회귀 green
Phase B  Zod extend(⑫) + API payload(④⑬) + Route 매핑(⑭)  → verify: tsc 0, body grep
Phase C  폼 4필드(①②③) + validate refund 분기(⑧)          → verify: refund validation
Phase Cs 저장소 |refund(ⓢ1) + "경정청구" 라벨(ⓢ2)          → verify: R9 3-record green
Phase D  UI — 진입 버튼(handleRefundClaim, ⓢ3) + 배너 분기
                + AmendmentBlock refund 분기 + ResultCard refund hero(⑤⑥⑦) → verify: E2E 1~5 green
Phase E  회귀 전체 + 자가점검(14지점 + ⓢ1~3 + R8 grep)      → verify: npm test green, tsc 0
```

## 11. 결정 사항 (사용자 확정 2026-07-02)

1. ✅ **아키텍처 = 기존 amendment 확장**(`correctionKind` 판별자). 기존 수정신고 default(amend) 불변, 회귀 0.
2. ✅ **환급가산금 = 원금만 계산 + 안내 문구**(지급결정일 미정으로 정확 산정 불가). 참고 지방소득세 환급 병기.
3. ✅ **경정청구 사유 유형(일반 5년/후발적 3개월) + 청구기한 경고(비차단)** 포함.
4. ✅ **범위 = 단건(single) only**(수정신고와 동일). bundled/mixed-use/multi/부담부증여 scope-out.

## 12. Scope Out

- 국세환급가산금 **금액 자동 계산**(세무서 산정 — 안내만).
- 지방소득세 **본세 경정청구서**(참고 표시만, 지자체 별도).
- 당초 납부 **가산세 과다분 환급**(본세 환급만 — 가산세 환급은 edge, 안내).
- bundled/mixed-use/multi-transfer/부담부증여 경정청구.
- 세무서 결정(2개월)·불복(이의·심사·심판) 절차 — 안내 문구 수준.
- 국세부과 제척기간과 경정청구 5년의 상호작용 판정(안내만).
- **[F10]** §45의2①**단서**(증액 결정·경정 통지받은 후 3개월) — 제3의 청구창. 당초 과다신고→감액만 대상이라 제외(안내).
- **[F11]** 시행령 §43의3①1호 **분할납부**(마지막 납부일 기산·소급) — 환급가산금 미계산이라 무영향, 안내만.

---

### 요약 — 재사용 vs 신규
- **재사용**: 이력 hydrate·재계산 파이프라인·`amendment` 14 plumbing·저장소 골격·`deriveStatutoryDeadline`·결과카드 골격.
- **신규**: `correctionKind` 판별자, `computeRefundClaim`·`resolveClaimDeadline`, refund 결과필드 7종, "경정청구 작성" 버튼, AmendmentBlock/ResultCard refund 분기, Zod extend·validate·저장소 `|refund`.
- **불변(Surgical)**: 기존 **수정신고(amend) 엔진·UI·anchor A1~A9** 전부(R8 게이트).
