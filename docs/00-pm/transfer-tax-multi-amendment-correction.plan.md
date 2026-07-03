# 양도소득세 다자산(일괄·다건) 수정신고·경정청구 기능 — 작업 계획서

> 작성 2026-07-03. 대상: **양도소득세 다자산(합산신고) 경로** — ①§166⑥ 일괄양도(bundled) + ②다건 직접입력 계산기(multi).
> 기존 **단건(single)** 수정신고(PR#459·`|amend`)·경정청구(PR#460·`|refund`)의 **다자산 확장**.
> 수정신고·경정청구는 **신고서 단위(filing-level)** 개념 — 당초/경정 **총 결정세액** 비교. 다자산도 동일 구조이며, 신고서 단위 산식은 단건과 **바이트 동형**.
> 이 계획서의 모든 file:line·수치·법령은 **실제 코드/법제처 본문 실측** 기반(추정 없음). 미검증 항목은 "확인 필요(Pre-Do)"로 명시.
> 자매 계획서: [`transfer-tax-amendment.plan.md`](transfer-tax-amendment.plan.md) · [`transfer-tax-correction-claim.plan.md`](transfer-tax-correction-claim.plan.md).

---

## 0. 목적

한 해에 **여러 자산을 함께 양도(합산신고)** 한 건에 대해, 당초 신고 후 양도가액·취득가액·필요경비가 변동(증액보상금·취득가액 정정 등)될 때 **수정신고(세액 증가)** 또는 **경정청구(세액 감소·환급)** 를 작성한다.

- **당초 총 결정세액**(합산 신고서 기준)과 **경정 총 결정세액**을 비교 → `추가납부세액 = max(0, 경정 − 당초)` / `환급세액 = max(0, 당초 − 경정)`.
- 다자산은 **신고서 단위 1건**(양도세는 §92 양도소득금액 합산 → 통합 과세표준 → 단일 산출세액). 자산별 분해는 참고표시일 뿐, 수정신고·경정청구는 **합산 결정세액 1개**에 대해 작동.
- §48②(수정신고 신고불성실 자동감면)·§45의2(경정청구 사유·기한)는 **단건과 동일** 재사용.

## 1. 요구사항

1. 다자산 당초 신고서를 입력·계산·저장한다. *(기존 — 재사용)*
2. 이력에서 **다자산 건**에도 `[수정신고][경정청구]` 버튼을 노출한다. *(현재 `mode==="single"` 가드로 숨김)*
3. 당초 신고서를 **불러와서**(모든 자산 hydrate) 정정 후 재계산한다.
4. 당초 총 결정세액 대비 **추가납부세액 / 환급세액**을 산출·표시한다.
5. **양도세만** 대상, **일반 다자산만**(부담부증여·겸용주택 제외).

---

## 2. 스코프 결정 (사용자 확정 2026-07-03)

| 축 | 결정 | 포함 | 제외 |
|---|---|---|---|
| **다자산 경로** | **두 경로 모두 (완전 커버)** | ① §166⑥ 일괄양도(bundled, `mode:"bundled"`) ② 다건 직접입력(multi, `AggregateTransferResult` 직접) | — |
| **특수 자산** | **일반 다자산만** | companionAssets 일반 자산 합산건 | 부담부증여(§159)·겸용주택(mixed-use)·general_building 토지+건물 일괄 |

> 두 경로는 **동일 집계 엔진 `calculateTransferTaxAggregate`** 를 공유 → **엔진 주입은 1곳**. 진입점·가드·결과뷰·폼은 경로별로 분리.

---

## 3. 현행 코드 실측 — 두 경로의 구조 (파일:line 재확인 완료)

### 3.1 다자산 경로 2종 — 응답 형태가 다름 (핵심)

| 경로 | 진입 | route | 응답 형태(`resultData`) | 총 결정세액 위치 |
|---|---|---|---|---|
| **§166⑥ bundled** | 메인 마법사 "함께 양도" 토글(splitMode="companion") | `route.ts:635` `calculateTransferTaxAggregate(...)` → `route.ts:645` | `{ mode:"bundled", apportionment, aggregated }` (`transfer-tax-api.ts:31~37`) | `resultData.aggregated.determinedTax` |
| **multi 직접입력** | 별도 계산기 `/calc/transfer-tax/multi` | `multi/route.ts:292` `calculateTransferTaxAggregate(...)` → `:293` `{ data: result }` | `AggregateTransferResult` **직접**(mode 래퍼 **없음**) | `resultData.determinedTax` |
| (참고) single | 메인 마법사 단일 자산 | `route.ts:753` `calculateTransferTax` → `:754` | `{ mode:"single", result }` | `resultData.result.determinedTax` |

> 두 다자산 경로 모두 `useAutoSaveCalculation({ taxType:"transfer" })` 로 **동일 이력**에 저장(§166⑥=`TransferTaxCalculator.tsx:98`, multi=`MultiTransferTaxCalculator.tsx:269~272`).

### 3.2 집계 엔진 = finalize 미경유 (∴ 현재 amendmentDetail 미생성)

- `calculateTransferTaxAggregate`(`transfer-tax-aggregate.ts:95`)는 M-1에서 자산별 `calculateTransferTax`를 **반복 호출**(`:106~114`, `skipBasicDeduction:true`)하되, **합산 결정세액은 자체 산출**: `determinedTaxBeforePenalty = max(0, calculatedTax − reductionAmount)`(`:334`), 반환 `determinedTax: determinedTaxBeforePenalty`(`:466`).
- **`finalizeTransferTax` 미호출** → 단건 finalize STEP 12.5의 `computeAmendment` 주입이 **집계 결정세액엔 실행 안 됨** → bundled/multi 결과에 `amendmentDetail` **부재**(확정).
- ✅ **집계 함수는 선형(함수 early-return 없음 — 실측 확정)** → 단건의 [F1] 비과세·손실 **조기반환 우회 문제 없음**(전액 비과세면 `calculatedTax=0` → `determinedTax=0` → `환급=당초 전액` 자연 처리). `:137~330` 구간의 `return`은 전부 `.reduce()`/`.map()` 콜백 내부(`:168·172·173` 등)이며 함수 본체 early-return은 없음.

### 3.3 🔴 기존 누수 버그 — primary item이 amendment를 자산별 계산에 흘림

- route `route.ts:308~322`가 `engineInput.amendment`를 매핑. bundled primary item은 `{ ...engineInput }`(≈`route.ts:604~611`)로 조립되며, `TransferTaxItemInput`이 `amendment`를 **Omit 안 함**(Omit=annualBasicDeductionUsed·skipBasicDeduction·skipLossFloor·priorReductionUsage뿐, `transfer-aggregate.types.ts:37~46`).
- ∴ 집계 M-1의 `calculateTransferTax(primaryItem)`가 **primary 자산의 부정확한(skipBasicDeduction) determinedTax 기준으로 `computeAmendment` 실행** → 결과 `amendmentDetail`은 `PerPropertyBreakdown`에 필드 없어 침묵 소실되나, **amendment `steps`가 `properties[0].steps`로 누수**됨(`transfer-tax-aggregate.ts:441`).
- **Do 필수 수정**: 집계 M-1 singleInput 조립 시 `amendment: undefined` 명시 strip. **양 경로 방어**.
- ✅ **multi 경로는 누수 없음(실측 확정)**: multi per-asset item은 `{ ...p }`(`multi/route.ts:272` 인접)이며 `p`(property)는 **filing-level `amendment`를 미보유**(amendment는 `data.amendment` top-level). ∴ E4 strip은 §166⑥ 방어용 + multi에는 무해.

### 3.4 재사용 자산 (단건 PR#459·#460 병합분)

| 영역 | 위치 | 재사용 |
|---|---|---|
| 정정 엔진 코어 | `transfer-tax-amendment.ts` `computeAmendment`·`computeRefundClaim`·`resolveClaimDeadline`·`resolveAmendmentReductionRate` | **그대로** — 신고서 단위라 다자산 무관 |
| 입력/결과 타입 | `lib/tax-engine/types/transfer-amendment.types.ts` `AmendmentInput`·`AmendmentDetail` | **그대로** |
| 법정신고기한 도출 | `lib/calc/transfer-amendment-helpers.ts` `deriveStatutoryDeadline` | 양도일→(연+1)-05-31 |
| §48② 상수·§45의2 상수 | `legal-codes/common.ts` | **그대로** |
| 결과 카드 | `AmendmentResultCard.tsx`(correctionKind hero 분기) | **그대로** — result 위치만 다르게 주입 |
| 입력 패널 | `AmendmentBlock.tsx`(amendmentMode 조건부) | §166⑥=Step6 재사용 / multi=settings 이식 |
| 진입 공유 소스 | `lib/calc/transfer-amendment-entry.ts` `enterAmendment`·`enterRefundClaim` | 3-way 분기로 확장 |
| 저장소 dedup·라벨 | `business-key.ts` `\|amend`/`\|refund` · `title-generator.ts` "수정신고"/"경정청구" | **bundled=동작**(assets[0] 추출) / **multi=갭**(properties[] 미인식 → S3 확장). §6.4 참조 |

### 3.5 진입점·가드 현행 (변경 대상)

- 진입 함수 `enterAmendment`/`enterRefundClaim`(`transfer-amendment-entry.ts:18,47`): `record.resultData.result.determinedTax`에서 당초세액 추출(`:25,32`·`:54,68`) → **bundled/multi엔 `.result` 부재라 빈값**. 라우트 `/calc/transfer-tax` 고정(`:13`) → multi는 `/calc/transfer-tax/multi` 필요.
- 버튼 가드 3곳 전부 `mode==="single"`:
  - 카드 `HistoryClient.tsx:568`
  - 드로어 수정신고 `HistoryDetailDrawer.tsx:287`
  - 드로어 경정청구 `HistoryDetailDrawer.tsx:299`

---

## 4. 핵심 설계 판단

### 4.1 아키텍처 = 신고서 단위 amendment의 다자산 확장

수정신고·경정청구 산식(`추가납부 = max(0, 경정−당초)` / `환급 = max(0, 당초−경정)`)은 **총 결정세액 1개**에 대한 연산이라 단건·다자산 **동형**. 다자산 확장 = "당초/경정 총 결정세액을 집계 엔진에서 뽑아 `computeAmendment`에 주입"할 뿐, **정정 로직·타입·결과카드는 재사용**.

### 4.2 엔진 주입 = `calculateTransferTaxAggregate` 내부 1곳 (양 경로 공유)

두 경로 모두 이 함수를 거치므로 **여기 1곳** 주입이 §166⑥·multi 동시 커버:
```
determinedTaxBeforePenalty 산출(:334) 직후
→ amendmentDetail = input.amendment ? computeAmendment(input.amendment, determinedTaxBeforePenalty) : undefined
→ 반환 객체(:466 인접)에 amendmentDetail 추가
```
- `AggregateTransferInput` += `amendment?: AmendmentInput`, `AggregateTransferResult` += `amendmentDetail?: AmendmentDetail`(`transfer-aggregate.types.ts`).
- `computeAmendment`가 `correctionKind ?? "amend"` 내부 분기 → refund_claim이면 `computeRefundClaim` 자동 호출(단건과 동일 경로). **refund 결과필드(refundTax·claimDeadline 등) 전부 재사용.**
- `import { computeAmendment } from "./transfer-tax-amendment"` 추가.

### 4.3 누수 버그 수정 (§3.3) — surgical

집계 M-1 singleInput(`transfer-tax-aggregate.ts:107~112`)에 `amendment: undefined` 추가. 자산별 계산이 신고서 단위 amendment를 이중처리·steps 누수하지 않도록 차단. (route에서 아예 안 넘기는 것보다 **엔진 내부에서 strip이 방어적**.)

### 4.4 진입점 3-way 분기 + originalDeterminedTax 소스

`transfer-amendment-entry.ts`에서 record 형태로 분기:
| record | 라우트 | store | 당초세액 소스 |
|---|---|---|---|
| single(`mode:"single"`) | `/calc/transfer-tax` | calc-wizard-store | `resultData.result.determinedTax` *(기존)* |
| §166⑥ bundled(`mode:"bundled"`) | `/calc/transfer-tax` | calc-wizard-store | `resultData.aggregated.determinedTax` |
| multi(mode 부재·`properties[]`) | `/calc/transfer-tax/multi` | multi-transfer-tax-store | `resultData.determinedTax` |

- single·§166⑥은 **동일 메인 마법사·calc-wizard-store** → `enterAmendment`/`enterRefundClaim`에 당초세액 소스 fallback만 추가(`result?.determinedTax ?? aggregated?.determinedTax`). companionAssets는 `...record.inputData` spread로 자동 hydrate.
- multi는 **별도 store·마법사** → 신규 `enterMultiAmendment`/`enterMultiRefundClaim`(multi-store `setForm` hydrate + `/calc/transfer-tax/multi` 라우팅).

### 4.5 가드 판별자 (일반 다자산만 노출)

버튼 노출 판정을 헬퍼로 단일화(`transfer-amendment-entry.ts`에 `classifyAmendableTransfer(record)` 신규 → `"single"|"bundled"|"multi"|null`):
- **single**: `mode==="single"` *(기존)*.
- **bundled(§166⑥)**: `mode==="bundled"` **AND** `(inputData.assets?.length ?? 0) > 1` **AND** `!resultData.transferBurdenedGiftBreakdown`.
  - **실측 확정(V1)**: 폼은 자산을 `form.assets[]`에 저장하고 `assets.length > 1`이면 bundled(`transfer-tax-api.ts:6,662,684` companionAssets=`assets.slice(1)`). **general_building은 단일 물건이라 `assets.length === 1`** → 이 판별자로 **자연 배제**(응답 `generalBuildingValuationDetail`은 실지 모드에서 undefined 가능 → 판별자로 쓰지 않음).
- **multi**: `taxType==="transfer"` **AND** `mode===undefined` **AND** `Array.isArray(resultData.properties)`(top-level). bundled은 properties가 `resultData.aggregated.properties`(중첩)라 오탐 없음.
- mixed-use(`mode:"mixed-use"`)·부담부증여·general_building → `null`(버튼 숨김).

> 3개 렌더 지점(`HistoryClient:568`·`HistoryDetailDrawer:287,299`)은 `classifyAmendableTransfer(record) !== null`로 교체(로컬 중복 판정 제거).

---

## 5. 데이터 모델 (신규 필드 — 전부 additive·비파괴)

### 5.1 엔진 (공유)
```ts
// AggregateTransferInput (transfer-aggregate.types.ts:49) +=
amendment?: AmendmentInput;              // lib/tax-engine/types/transfer-amendment.types.ts 재사용

// AggregateTransferResult (transfer-aggregate.types.ts:234) +=
amendmentDetail?: AmendmentDetail;       // 재사용 — refund 필드까지 통째로 흐름
```

### 5.2 §166⑥ 경로 — **신규 store 필드 0**
calc-wizard-store `TransferFormData`가 이미 amendment 필드 보유(단건 구현분: `amendmentMode`·`correctionKind`·`originalDeterminedTax`·`statutoryFilingDeadline`·`amendedFilingDate`·`claimReasonType`·`posteriorEventDate`·penalty 플래그). **companionAssets 있는 채로 그대로 재사용.** AmendmentBlock(Step6)이 companionAssets 유무와 무관하게 렌더되는지만 확인.

### 5.3 multi 경로 — `MultiTransferFormData` += filing-level amendment 필드
`multi-transfer-tax-store.ts:23` `MultiTransferFormData`에 amendment는 **신고서 단위**(자산별 아님)로 신설:
```ts
amendmentMode: boolean;                  // default false
correctionKind: "amend" | "refund_claim";
originalDeterminedTax: string;           // 당초 총 결정세액
statutoryFilingDeadline: string;         // (양도연도+1)-05-31
amendedFilingDate: string;
applyUnderReportingPenalty: boolean; underReportingReason: PenaltyReason; underReductionMode: "exempt"|"auto_48_2"; priorAssessmentNotified: boolean;
applyLatePaymentPenalty: boolean; amendedPaymentDate: string;
claimReasonType: "ordinary"|"posterior"; posteriorEventDate: string;
```
> 다자산의 "양도연도"는 `taxYear`(단일). §48②·§45의2 기산은 신고서 단위 1개라 filing-level이 정확.
> ⚠️ **필드명은 단건 `TransferFormData`와 동일해야** `AmendmentBlock`(컨트롤드 `form: TransferFormData`/`onChange`)을 캐스팅 재사용 가능(UI설계 B2, 실측 U2).

---

## 6. 변경 지점 매트릭스

### 6.1 공유(엔진)
| # | 지점 | 파일:line | 작업 |
|---|---|---|---|
| E1 | 집계 입력 타입 | `transfer-aggregate.types.ts:49` | `amendment?: AmendmentInput` |
| E2 | 집계 결과 타입 | `transfer-aggregate.types.ts:234` | `amendmentDetail?: AmendmentDetail` |
| E3 | 집계 주입 | `transfer-tax-aggregate.ts:334`직후·`:466`인접 | `computeAmendment` 호출 + 반환 추가 + import |
| E4 | 누수 strip | `transfer-tax-aggregate.ts:107` | singleInput `amendment: undefined` |

### 6.2 §166⑥ bundled (Track A)
| # | 지점 | 파일:line | 작업 |
|---|---|---|---|
| A1 | route 주입 | `route.ts:635~643` | AggregateTransferInput에 `amendment: engineInput.amendment` |
| A2 | API body | `transfer-tax-api.ts:528~` | **이미 amendment 포함**(단건과 동일 body). 변경 불필요 — 확인만 |
| A3 | 진입 당초세액 | `transfer-amendment-entry.ts:25,54` | `result?.determinedTax ?? aggregated?.determinedTax` fallback |
| A4 | 결과 카드 | `TransferTaxCalculator.tsx:522` `BundledAllocationCard` | `aggregated.amendmentDetail` 있으면 `AmendmentResultCard` 상단 렌더(hero) |
| A5 | 가드 | `HistoryClient:568`·`Drawer:287,299` | `classifyAmendableTransfer` |
| A6 | validate | `transfer-tax-validate.ts:250` | 신고서 단위라 companionAssets 무관 — 회귀 확인 |
| A7 | Zod | `route.ts` Zod(amendment optional) | **기존 그대로**(amendment는 이미 main schema optional) |

### 6.3 multi 직접입력 (Track B)
| # | 지점 | 파일:line | 작업 |
|---|---|---|---|
| B1 | store 필드 | `multi-transfer-tax-store.ts:23,38` | §5.3 filing-level amendment 필드 + default |
| B2 | 마법사 입력 | `MultiTransferTaxCalculator.tsx` settings step | `AmendmentBlock`(multi form 바인딩) — amendmentMode 시 노출 |
| B3 | API 변환 | `lib/calc/multi-transfer-tax-api.ts:217` `callMultiTransferTaxAPI` body | body에 `amendment` 조립(단건 payload 로직 재사용). fetch `/api/calc/transfer/multi` |
| B4 | Zod | `lib/api/transfer-tax-schema.ts` `multiInputSchema` | `amendment: amendmentSchema.optional()` 추가(`multi/route.ts:24,61` 참조) |
| B5 | route 주입 | `multi/route.ts:251` `engineInput` | `amendment` 매핑(Date `toOptionalDate`). 2-pass는 무해(§7.4) |
| B6 | 결과 카드 | `MultiTransferTaxResultView.tsx:650` | `result.amendmentDetail` 있으면 `AmendmentResultCard` 렌더 |
| B7 | 진입 함수 | `transfer-amendment-entry.ts` 신규 | `enterMultiAmendment`/`enterMultiRefundClaim`(multi-store hydrate) |
| B8 | validate | `lib/calc/multi-transfer-tax-validate.ts` | 단건 `transfer-tax-validate.ts:250~` amendment 블록 이식(originalDeterminedTax>0·refund posterior 등) |

### 6.4 저장소 (공유)
| 지점 | 파일:line | 작업 |
|---|---|---|
| S1 dedup(bundled) | `business-key.ts:34~44` | **이미 amendmentMode→`\|amend`/`\|refund` 처리**. bundled inputData는 `assets[]`·top-level `transferDate` 보유 → `extractAddress`(`title-generator.ts:28`, assets[0] 인식)·`extractTransferDate`(`:44`) **동작** → 변경 불필요(확인만) |
| S2 라벨(bundled) | `title-generator.ts:100~106` | **이미 amendmentMode→"수정신고"/"경정청구"**. bundled 동작 → 변경 불필요 |
| **S3 dedup·라벨(multi)** 🔴 | `title-generator.ts:28,44` | **multi 갭(실측)**: MultiTransferFormData는 `assets[]`·top-level `transferDate` **부재**(`properties[]`) → `extractAddress`/`extractTransferDate` **null 반환** → business-key null → **3-record dedup·"수정신고" 라벨 실패**. 두 헬퍼에 `properties[0].form.assets[0].address*`·`properties[0].form.transferDate` fallback 분기 추가(또는 multi 전용 추출 헬퍼) |

> ⚠️ TS 미감지 지점: E4(누수 strip)·A1·A4·B3·B5·B6·S3은 침묵 누락 위험 → Do 점검서 grep 자가검증([[feedback_api_zod_schema_sync]] [[feedback_explicit_prop_mapping_strip]]).

### 6.5 14 동기화 지점 커버리지 (신규 필드 `amendment`/`amendmentDetail`)

신고서 단위 정정이라 자산-수준 지점(⑩⑪)은 N/A. §166⑥은 단건 인프라 재사용이 대부분, multi는 병렬 신설.

| # | 지점 | §166⑥ (Track A) | multi (Track B) |
|---|---|---|---|
| ① | 폼 상태 | calc-wizard-store amendment 필드 **재사용** | `MultiTransferFormData` 신설(B1) |
| ② | initial | 재사용 | default 신설(B1) |
| ③ | normalize | 재사용 | store merge(B1) |
| ④ | API 변환 | `transfer-tax-api.ts:528` amendment payload **재사용**(bundled body 동일) | `multi-transfer-tax-api.ts:217` 신설(B3) |
| ⑤ | UI 위젯 | Step6 `AmendmentBlock` **재사용** | settings `AmendmentBlock` 이식(B2) |
| ⑥ | 사이드바 | N/A(신고서 단위) | N/A |
| ⑦ | 결과 카드 | `BundledAllocationCard`에 `AmendmentResultCard` 주입(A4) | `MultiTransferTaxResultView` 주입(B6) |
| ⑧ | validation | `transfer-tax-validate.ts:250` **재사용** | `multi-transfer-tax-validate.ts` 이식(B8) |
| ⑨ | Zod main | amendment optional **재사용** | `multiInputSchema` += amendment(B4) |
| ⑩⑪ | companion·asset fallback | **N/A**(신고서 단위) | **N/A** |
| ⑫ | Zod 입력객체 | `amendmentSchema`(transfer-tax-schema-sub.ts:376) **재사용** | 동일 `amendmentSchema` import(B4) |
| ⑬ | body spread | 재사용 | `callMultiTransferTaxAPI` body(B3) |
| ⑭ | Route 매핑 | `route.ts:635` aggregate 전달(A1) | `multi/route.ts:251` engineInput(B5) |
| E | **엔진(공유)** | `AggregateInput.amendment`·`Result.amendmentDetail`·집계 주입·누수 strip(E1~E4) — **양 경로 공통** | 〃 |
| S | 저장소 | S1·S2 **재사용**(bundled 동작) | S3 multi 추출헬퍼 신설 |
| 진입 | entry | `enterAmendment` fallback(A3) | `enterMultiAmendment` 신설(B7) |

> §166⑥은 **⑭(A1)·⑦(A4)·E·A3·A5**만 신규(나머지 재사용). multi는 ①②③④⑤⑦⑧⑨⑫⑬⑭ 전부 신설(단건 로직 이식).

---

## 7. 엔진 설계

### 7.1 집계 주입 (`transfer-tax-aggregate.ts`)
```ts
import { computeAmendment } from "./transfer-tax-amendment";
// ...(:334 이후)
const amendmentDetail = input.amendment
  ? computeAmendment(input.amendment, determinedTaxBeforePenalty)
  : undefined;
// 반환 객체(:446~473)에 추가:
//   ...(amendmentDetail ? { amendmentDetail } : {}),
```
- `determinedTaxBeforePenalty` = 신고서 단위 총 결정세액(가산세 전). 단건 finalize의 `determinedTax`와 동일 의미 → 비교 대상 정합.
- refund 전액(전액 비과세 다자산)도 `determinedTax=0`으로 자연 처리 → **[F1] 조기반환 주입 불필요**(단건과 차별점).

### 7.2 누수 strip (§4.3)
```ts
const singleInput: TransferTaxInput = {
  ...(item as unknown as TransferTaxInput),
  annualBasicDeductionUsed: 0, skipBasicDeduction: true, skipLossFloor: true,
  amendment: undefined,   // ← 신규: 자산별 계산에 신고서 단위 amendment 누수 차단
};
```

### 7.3 정수·법령
- 재사용 `computeAmendment` 내부(applyRate·truncateToWon). 신규 산식 없음.
- legal-codes 상수(`AMENDMENT_48_2`·`CORRECTION_CLAIM_45_2` 등) 재사용 — 리터럴 신규 금지([[feedback_legal_codes]]).

### 7.4 multi 2-pass와 amendment (무해 확인)
`multi/route.ts`는 가산세 determinedTax 주입용 2-pass(`:264` baseResult → `:292` result). amendment는 **가산세와 상호배타**(Zod refine)라 amendment 있으면 자산별 filingPenaltyDetails 부재 → 2-pass 강화 루프가 no-op(`finalInput ≈ engineInput`). `computeAmendment` 비교 대상 `determinedTaxBeforePenalty`는 **가산세 무관**이라 1·2차 pass 동일값 → 2차 반환값 정확. (1차 pass에서도 계산되나 중복·무해.)

---

## 8. UI 설계

### 8.1 진입 (공유 소스 `transfer-amendment-entry.ts`)
- `classifyAmendableTransfer(record)` → `"single"|"bundled"|"multi"|null`(§4.5).
- `enterAmendment`/`enterRefundClaim`: single·bundled 공용(당초세액 fallback §4.4). 라우트 `/calc/transfer-tax`.
- `enterMultiAmendment`/`enterMultiRefundClaim`(신규): multi-store `setForm({ ...inputData(properties[]), amendmentMode:true, correctionKind, originalDeterminedTax: resultData.determinedTax, statutoryFilingDeadline: deriveStatutoryDeadline(\`${inputData.taxYear}-12-31\`), ... })` + `/calc/transfer-tax/multi`.
  - **[개선]** `deriveStatutoryDeadline`은 date 문자열 인자 → (연+1)-05-31 도출. multi는 개별 transferDate가 없고 `taxYear` 단일이므로 `${taxYear}-12-31`(연내 임의일)로 호출 → (taxYear+1)-05-31 동일 산출. (신고서 단위 법정신고기한은 과세연도 1개.)
- clientId 관문 스킵(`setActiveClientId`) 3-way 공통.
- ⚠️ [[mirror-pattern]] 당초세액·기한 자동값은 **hydration 1회** 세팅(useEffect→store 미러링 금지).

### 8.2 결과 카드 (재사용 `AmendmentResultCard`)
- **§166⑥**: `BundledAllocationCard` 상단에 `aggregated.amendmentDetail` → `AmendmentResultCard`(hero=추가납부/환급). 자산별 안분 표는 아래 유지(참고).
- **multi**: `MultiTransferTaxResultView` 상단에 `result.amendmentDetail` → 동일 카드.
- hero 전환·correctionKind 분기·refund emerald·청구기한 도과 경고 전부 **단건 카드 로직 재사용**.

### 8.3 입력 패널
- **§166⑥**: Step6 `AmendmentBlock`(기존) — companionAssets 무관 렌더 확인.
- **multi**: settings step에 `AmendmentBlock` 이식(multi form 필드 바인딩). "정정 작성 중" 배너 재사용.

---

## 9. 검증

### 9.1 Pre-Do anchor (`__tests__/tax-engine/transfer/multi-amendment.test.ts`)
- **M-A1(수정신고 통합)**: 2자산 합산 → 당초 총 결정세액 X, 한 자산 양도가액 증액 재계산 → 경정 X' → `aggregated.amendmentDetail.additionalTax = max(0, X'−X)`.
- **M-A2(경정청구 환급)**: 한 자산 취득가액 상향 → 경정 < 당초 → `refundTax = max(0, 당초−경정)`.
- **M-A3(전액 비과세 다자산 환급)**: 전 자산 비과세 → `determinedTax=0` → `refundTax=당초 전액`(조기반환 우회 없음 확인).
- **M-A4(누수 strip 회귀)**: amendment 있는 다자산 계산 시 `properties[0].steps`에 amendment step **미포함**(§3.3 누수 수정 검증).
- **M-A5(경계=단건 동형)**: 자산 1건 aggregate + amendment = 단건 `computeAmendment` 결과와 일치(신고서 단위 동형 증명).
- **M-A6(기존 다자산 회귀 게이트)**: amendment 미지정 시 `calculateTransferTaxAggregate` **바이트 불변**(기존 aggregate 테스트 전부 green).
- **M-A7(multi 저장소 3-record, S3)**: multi inputData(`properties[]`)로 당초→수정신고(`|amend`)→경정청구(`|refund`) → `extractBusinessKey` 3키 상이 → 이력 3건 공존. **S3 헬퍼 확장 전엔 자연 실패**(null 반환) → 확장 후 green. `__tests__/storage/multi-amendment-dedup.test.ts`.

> anchor **실행 후 실패 확보**(현행 미구현 자연 실패) → 결과 타입 동결. "현행 일치 예상" 금지([[feedback_pre_anchor_verification]]).

### 9.2 E2E
- `e2e/transfer-multi-amendment.spec.ts`: ①§166⑥ 2자산 계산→저장 ②이력 카드 [수정신고] 노출·클릭 ③hydrate(2자산 복원)+배너 ④증액→추가납부 hero ⑤Network `amendment.correctionKind` 포함.
- multi 경로 동등 spec 1종.
- ⚠️ 워크트리 E2E는 `E2E_PORT=3101`(slot1).

### 9.3 회귀
- `npx vitest run __tests__/tax-engine/transfer/`(기존 aggregate·amendment·correction 전부) + `npm test` + `npx tsc --noEmit` 0.
- 단건 amendment/correction anchor(A1~A9·R1~R10) **불변**(신고서 단위 로직 공유 → 회귀 0 게이트).

---

## 10. 작업 단계 (Phase)

```
Phase 0  M-A1·M-A3·M-A5 anchor 작성·실행(실패 확보)          → verify: 결과타입 동결
          (§4.5 판별자·§3.2 early-return·§3.3 누수·위치는 STEP 1에서 실측 확정 — 재확인 불요)
Phase E  엔진 공유: E1~E4(타입·주입·누수 strip)              → verify: M-A1~A6 green
Phase A  §166⑥: A1(route)·A3(진입 fallback)·A4(결과카드)·
          A5(가드 classifyAmendableTransfer)·A6(validate 회귀) → verify: bundled E2E, 단건 회귀0
Phase B  multi: B1(store)·B2(입력)·B3(API)·B4(Zod amendmentSchema)·
          B5(route)·B6(결과카드)·B7(진입)·B8(validate)        → verify: multi E2E
Phase S  저장소: S3 multi 추출헬퍼(properties[] 처리) + M-A7  → verify: multi 당초·수정·경정 3-record
          (S1·S2 bundled은 이미 동작 — 회귀 확인만)
Phase C  회귀 전체 + 자가점검(E1~E4·A·B·S3 grep)              → verify: npm test green, tsc0
```

## 11. 결정 사항 (사용자 확정 2026-07-03)

1. ✅ **다자산 경로 = 두 경로 모두**(§166⑥ bundled + multi 직접입력).
2. ✅ **특수 자산 = 일반 다자산만**(부담부증여·겸용주택·general_building 일괄 제외).
3. ✅ **아키텍처 = 신고서 단위 amendment 재사용**(집계 엔진 1곳 주입 + correctionKind 판별자). 기존 단건·다자산 회귀 0.

## 12. Scope Out

- **부담부증여(§159)** 다자산 수정신고·경정청구(`transferBurdenedGiftBreakdown`).
- **겸용주택(mixed-use)**·**general_building 토지+건물 일괄**(단일 물건 분리) 정정.
- **자산-수준 부분 수정신고**(양도세 수정신고는 신고서 단위 1건이 정확 — 자산별 분해 정정 불요).
- 국세환급가산금 금액 자동 계산(세무서 산정 — 안내만, 단건과 동일).
- 지방소득세 본세 경정청구서(참고 표시만).

---

### 요약 — 재사용 vs 신규
- **재사용**: `computeAmendment`·`computeRefundClaim`·`AmendmentInput/Detail`·`AmendmentBlock`·`AmendmentResultCard`·§48②·§45의2 상수·`deriveStatutoryDeadline`·저장소 골격.
- **신규(공유)**: `AggregateTransferInput.amendment`·`AggregateTransferResult.amendmentDetail`·집계 주입 1곳·누수 strip 1곳.
- **신규(§166⑥)**: route 1줄·진입 fallback·결과카드 주입·가드 classify.
- **신규(multi)**: store amendment 필드·settings AmendmentBlock·multi API/Zod/route·결과카드·진입 함수 2종·validate.
- **불변(Surgical)**: 단건 amendment/correction 엔진·UI·anchor 전부(회귀 게이트).
