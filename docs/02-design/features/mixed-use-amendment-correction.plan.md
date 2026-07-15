# 겸용주택 수정신고·경정청구 지원 (계획서)

> 검토 이력: STEP 1 4-way fork 병렬 검토(오류/누락/모순+정책/개선+UI) → 정정 반영(rev.2).
> 반전된 결정 1건(§3 D5 — 분류값), 신규 Critical 2건(거부 경로·⑦ 배치) 반영.

## 0. 요약 (한 줄)

겸용주택(`mode === "mixed-use"`) 이력에서 **수정신고·경정청구 버튼이 노출되지 않고**, 노출시켜도 엔진이
`amendment`를 소비하지 않아 계산이 되지 않는다. **엔진(amendment 수용) → route(전달) → 결과 카드 →
이력 진입 가드** 4곳을 열어 단건(`single`)·재개발(`redevelopment`)과 동일하게 지원한다.
**세법 신규 해석 없음** — 국세기본법 §45·§45의2는 자산 종류와 무관하며, 기존 `computeAmendment()` 재사용.

---

## 1. 배경 · 현황 (실측 근거)

### 1.1 증상 (스크린샷)

| 이력 레코드 | 수정신고 | 경정청구 | 납부세액 |
|---|---|---|---|
| 13 상속주택 (`mode: "single"`) | ✅ 노출 | ✅ 노출 | 219,902,989 |
| 14 겸용주택 (`mode: "mixed-use"`) | ❌ 미노출 | ❌ 미노출 | **`-`** |

겸용주택 카드는 정정 버튼 2개가 없을 뿐 아니라 **납부세액도 `-`로 표시**된다(§1.5 — 같은 뿌리).

### 1.2 저장 형태 실측 — `resultData.mode === "mixed-use"` 확정 (전제 성립)

가드가 `rd.mode`를 검사하므로 **저장 형태가 §1.3 가드 반전·§1.5 진단·§4 H2·H3의 공통 전제**다. 실측 결과 봉투가
전 구간 무가공 통과함을 확인했다(rev.2에서 미결 O2 → 해소):

| 단계 | 위치 | 동작 |
|---|---|---|
| API 응답 언래핑 | `lib/calc/transfer-tax-api.ts:654` | `return json.data as TransferAPIResult` — `.data`만 벗김, `mode` 보존 |
| store → 저장 훅 인자 | `app/calc/transfer-tax/TransferTaxCalculator.tsx:99-102` | `useAutoSaveCalculation({ resultData: result })` — 가공 없음 |
| 저장 | `lib/storage/use-auto-save-calculation.ts:85,104` | `const target = resultData` → `resultData: target` — 그대로 |

`TransferAPIResult`(`transfer-tax-api.ts:39`)는 `mode` 태그 union이고 `MixedUseTransferResult`(`:38`)는
`{ mode: "mixed-use"; result: MixedUseGainBreakdown }`. 수동 저장 경로(`TransferTaxCalculator.tsx:113-117`)도 동일 `result` 전달.
`lib/storage/CLAUDE.md`가 이 계약을 명문화("`{mode, result}` 구조 … 이력 화면 추출 시 mode별 분기 필수").

⇒ **`rd.mode === "mixed-use"` ✓ / `rd.result.total.transferTax` ✓ / `rd.result.total.totalPayable` ✓** — H1·H2·H3 경로 전부 확정.

### 1.3 가드가 명시적으로 배제 중 (`classifyAmendableTransfer`)

`lib/calc/transfer-amendment-entry.ts:30-53`:

```ts
if (rd.mode === "single") return "single";
if (rd.mode === "bundled") { ... }
if (rd.mode === undefined && Array.isArray(rd.properties)) { ... }
return null; // mixed-use·부담부증여·general_building 등   ← :52
```

- **소비처 4곳**(전수 grep — §3 D7): `app/history/HistoryClient.tsx:567`(카드 버튼) ·
  `components/history/HistoryDetailDrawer.tsx:298,309`(드로어 버튼) ·
  **`lib/calc/transfer-multi-load-entry.ts:21`(`classifyLoadableTransfer` — 다건 이력 불러오기)**.
- **가드를 고정하는 앵커 존재**: `__tests__/lib/calc/classify-amendable-transfer.test.ts:61-63`
  `it("제외: mixed-use", ...) → toBeNull()`. → 정책 반전이므로 **이 앵커는 반드시 반전**(§5.1 A1).

### 1.4 엔진이 `amendment`를 받지 않음 (근본 원인)

`lib/tax-engine/transfer-tax-mixed-use.ts:56-61`:

```ts
export function calcMixedUseTransferTax(
  transferPrice: number, transferDate: Date, asset: MixedUseAssetInput, rates: TaxRatesMap,
): MixedUseGainBreakdown
```

- 4번째 인자까지 `amendment` 파라미터 없음 → `computeAmendment()` 미호출.
- `MixedUseGainBreakdown`(`types/transfer-mixed-use.types.ts:340-`)에 `amendmentDetail` 필드 **없음**.
- **return이 2개**: 정상 조립(`:213`) / 2022.1.1 이전 양도 거부(`:64` → `buildRejectionResult`, `:332-`, 전 필드 0). → §3 D8.

### 1.5 route가 `amendment`를 mixed-use 분기에 전달하지 않음

`app/api/calc/transfer/route.ts:669-702` (5-a-2 겸용주택 분기):

```ts
const mixedResult = calcMixedUseTransferTax(
  data.transferPrice, new Date(data.transferDate), mixedAsset, rates,
);   // ← engineInput.amendment 미전달
```

대조 — bundled 분기는 `:650-651`에서 `amendment: engineInput.amendment` 전달 중.

**중요(실측)**: 상류 층은 **이미 열려 있다**(§4 표에서 지점별 재검증):

| 층 | 위치 | 상태 |
|---|---|---|
| ⑤ UI 입력 | `steps/Step6.tsx:40-41` — `form.amendmentMode ? <AmendmentBlock/> : <가산세>` | ✅ 자산종류 무관 |
| ⑧ validate | `lib/calc/transfer-tax-validate.ts:262-284` — `step === 3 && form.amendmentMode` | ✅ 자산종류 무관 |
| ⑬ body | `lib/calc/transfer-tax-api.ts:417-438` — `...(form.amendmentMode ? { amendment: {...} } : {})` | ✅ **폼-전역**(자산-수준 아님) |
| ⑫ Zod | `lib/api/transfer-tax-schema.ts:481` `amendment: amendmentSchema.optional()` | ✅ `mixedUse`(:313)와 동일 레벨 → strip 없음 |

→ **겸용주택 수정신고 body는 이미 route까지 도달하고 있으며, route가 조용히 버리는 상태.**

### 1.6 이력 카드 납부세액 `-` (동일 뿌리, 함께 수정)

`app/history/HistoryClient.tsx:160-178` `extractTotalTax()`:

- `resultData.result.totalTax` / `.finalTax` / `resultData.aggregated.totalTax` / top-level `totalTax`·`totalPayable` 순 탐색.
- 겸용주택 실제 납부세액은 **`result.total.totalPayable`**(한 단계 더 깊음) → 전 분기 미스 → `"-"`.
- `extractOriginalDeterminedTax()`(`transfer-amendment-entry.ts:56-62`)도 동일 —
  `rd.result?.determinedTax ?? rd.aggregated?.determinedTax` → 겸용주택 `undefined` →
  가드만 풀면 **당초 결정세액이 빈 값으로 진입**. 가드와 **반드시 함께** 수정.

### 1.7 겸용주택 "결정세액"의 정의 — 코드 선례 + 단건 대조 실측

`MixedUseTotalTax`(`transfer-tax-mixed-use-totals.ts:60-71`): `taxByBasicRate`·`nonBusinessSurcharge`·
`transferTax`(= 앞 둘의 합) · `localTax` · `totalPayable`(= `transferTax + localTax`).

`MixedUseResultCard.tsx:42,46`가 명세서 카드용 어댑터에서 이미 확정해 둔 매핑:

```ts
determinedTax: t.transferTax,   // 본세(기본세율분 + NBL 중과분), 지방소득세 제외
totalTax:      t.totalPayable,  // 본세 + 지방소득세
```

**단건 대조(실측)**: `transfer-tax-finalize.ts:314`
`determinedTax = truncateToWon(max(0, calculatedTax − cappedReductionAmount))`,
`localIncomeTax`는 `:346`에서 그 **이후** 산출, 가산세 포함분은 `determinedTaxWithPenalty`(`:343`) 별도 필드.
⇒ 단건 `determinedTax`는 **지방소득세·가산세 제외**. `:377`이 이 값으로 `computeAmendment` 호출.

⇒ 겸용주택 `total.transferTax`와 **의미 일치**. → **`amendment` 기준값 = `total.transferTax`**(§3 D2).

---

## 2. 목표

1. 겸용주택 이력 카드·드로어에 **수정신고·경정청구 버튼 노출** (단건과 동일 UX).
2. 진입 시 **당초 결정세액 = `result.total.transferTax`** 자동 채움.
3. 재계산 시 엔진이 `amendment`를 소비 → `amendmentDetail` 산출 → 결과 화면에 `AmendmentResultCard` 노출
   (수정신고=추가납부 hero / 경정청구=환급 hero).
4. 겸용주택 이력 카드 **납부세액 `-` → 실제 금액** 표시.
5. **비-amendment 겸용주택 계산 경로는 바이트 불변**(additive) — `amendment` 미전달 시 기존 산식 그대로.
   (※ **엔진 계산 경로** 한정. §4 H1은 이력 진입 분류값을 바꾸는 **동작 변경**이며, 그 파급은 D5·D7에서 통제.)

**비목표(범위 외)**: D4(신고서 양식)·D6(타 자산종류 가드) 참조.

---

## 3. 설계 결정

### D1. 엔진 시그니처 확장 — 5번째 optional 인자 (재개발 선례 차용)

```ts
export function calcMixedUseTransferTax(
  transferPrice: number, transferDate: Date, asset: MixedUseAssetInput, rates: TaxRatesMap,
  amendment?: AmendmentInput,   // ← 신규 optional
): MixedUseGainBreakdown
```

**근거**: `transfer-tax-redevelopment.ts:236-241`가 동일 패턴(별도 오케스트레이터 + 끝단 append)의 선례.
`computeAmendment(amendment: AmendmentInput, determinedTax: number): AmendmentDetail`
(`transfer-tax-amendment.ts:154-157`)와 정합. 현재 호출부는 4인자 1곳(`route.ts:692`)뿐이라 **기존 호출 무영향**.

**대안 기각**: `MixedUseAssetInput`에 `amendment`를 넣는 안 — `amendment`는 **신고서 단위**(폼-전역) 개념이고
asset은 **자산-수준**이다. 축이 다르므로 오염. route·Zod가 이미 폼-전역으로 취급(§1.5)하는 것과도 어긋난다.

### D2. `determinedTax` 기준값 = `total.transferTax` (지방소득세 제외)

§1.7 실측 근거. `totalPayable`(지방세 포함)을 쓰면 단건 경로와 기준이 어긋나 동일 세액인데 겸용/단건에서
추가납부액이 달라진다.

- **절사 동등성**: 단건은 `truncateToWon`(`finalize.ts:314`)을 통과하지만, 겸용 `transferTax`는
  `applyRate`=`Math.floor`(`tax-utils.ts:43`) + 정수 `deduction` 조합이라 **이미 정수** →
  `truncateToWon`(=`Math.floor`, `tax-utils.ts:78-80`)는 no-op. **기준값 동일성 성립**.
- 지방소득세는 `AmendmentDetail.additionalLocalIncomeTax`(= 추가본세 × 10%, 참고 표시)가 이미 담당.
  경정청구도 `refundLocalIncomeTax`(환급세액 × 10%, 지자체 별도) 동일 구조.
- **어댑터 주의**: `MixedUseResultCard.tsx:42` 어댑터가 같은 기준값을 쓰게 되므로, 향후 어댑터가
  `breakdown.amendmentDetail`을 **재계산하지 않도록** 할 것(dual-truth 방지).

### D3. `MixedUseGainBreakdown.amendmentDetail?` optional 추가 (echo 필드 패턴)

- 기존 필드 전부 불변 → 캐시된 구 결과(IndexedDB)도 `undefined`로 안전 통과.
- **`steps` 미합류**: `MixedUseStep[]`와 `CalculationStep[]`은 형태가 다르고(`MixedUseResultCard.tsx:47-50` 주석),
  `AmendmentResultCard:93-113`이 `detail.steps`를 **자체 렌더**한다. 합류시키면 단건(`finalize:379-380`이 push
  **하면서** 카드도 렌더 → 실제로 중복 표시 중)과 같은 중복이 발생. → 미합류가 옳다.

### D4. 신고서 양식(`mixed-4col`)에는 수정신고를 반영하지 않음 — 범위 외

겸용주택 신고서 replica(PR#593~#595)는 **당초 신고 서식** 재현이다. 수정신고 서식은 별지 서식이 별도이며
단건 경로도 현재 미지원. → 본 작업은 **계산·결과 카드까지**.

- **구현 경계(강제)**: 어댑터 `mixedUseToFilingResult`(`MixedUseResultCard.tsx:20-52`)에 `amendmentDetail`
  **전달 금지**. 실측상 `FilingFormTable`·`DetailedCalculationStatementCard` 모두 `amendmentDetail` 미참조(grep 0건)이라
  전달해도 현재는 무해하나, D4 경계를 코드로 지키기 위해 명시 금지한다.

### D5. 분류값은 **신규 `"mixed-use"`** — `"single"` 재사용 금지 ⚠️ (rev.2 반전)

> rev.1은 `"single"` 반환(1줄)을 택하고 "신규 값은 파급이 크다"고 기각했다. **실측 결과 근거가 정반대여서 반전한다.**

`classifyLoadableTransfer`(`transfer-multi-load-entry.ts:20-24`)가 **같은 가드를 재사용**한다:

```ts
const kind = classifyAmendableTransfer(record);
if (kind === "single" || kind === "multi") return kind;
return null; // bundled·null → 불러오기 불가
```

- `"single"` 반환 시 → 겸용주택이 **다건 "이력 불러오기" 후보로 자동 편입**
  (`MultiTransferHistoryLoadModal.tsx:77` 필터 통과 → `:123` → `buildPropertyFromSingleRecord`).
  그런데 **다건 경로는 겸용주택 미지원**(`multi-transfer-tax-api.ts`·`transfer-tax-aggregate.ts`·
  `transfer-aggregate.types.ts`에 `mixedUse`/`isMixedUseHouse` 참조 **0건** — 전수 grep 실측)
  → 겸용주택이 일반 자산으로 편입되어 **§160①단서 분리계산이 조용히 소실**. 추가로
  `extractLoadPriorPaid:37-39`가 `rd.result?.determinedTax` → `undefined` → **기납부세액 0** 오채움.
- `"mixed-use"` 신규 값 → 위 두 조건 모두 불일치 → `null` = **불러오기 불가**(안전한 기본값). **무변경으로 올바르게 배제**.

**파급 실측 = 2줄·1파일**: `enterAmendment:68`·`enterRefundClaim:97`의
`if (kind !== "single" && kind !== "bundled") return;` → `&& kind !== "mixed-use"` 추가.
두 버튼 소비처(`HistoryClient:567`·`HistoryDetailDrawer:298,309`)는 `!== null`이라 **무변경**.

**정책 근거**: `project_transfer_multi_amendment_correction`의 🔴 E4 누수(amendment strip)와 **동형** —
"타입/값의 재사용이 무관한 소비처를 침묵 활성화"라는 같은 뿌리. 그 메모리가 스코프를
"일반 다자산만(부담부증여·**mixed-use**·general_building 일괄 제외)"로 명시했고, 그 배제가
`classifyLoadableTransfer`의 안전성을 **암묵 전제**하고 있었다.

### D6. 부담부증여·general_building 가드는 그대로 유지

`classifyAmendableTransfer`의 다른 배제(부담부증여 bundled·단일물건 bundled·구 stub multi)는 **미변경**.
겸용주택만 해제. (각각 별도 결정세액 추출 문제가 있어 동일 작업이 아님 — §6 O2.)

### D7. 분류값 변경 시 **소비처 전수 grep 후 결정** (신설 · 재발방지)

`classifyAmendableTransfer`의 반환값은 4곳이 소비한다(§1.3). 신규 분류값 추가·기존 값 재사용은
**반드시 4곳 전부의 분기를 확인한 뒤** 결정한다. rev.1의 오판(D5)이 이 절차 부재에서 나왔다.

### D8. 거부 경로(`pre-2022-rejected`)는 amendment 미부착 ⚠️ (신설 Critical)

`calcMixedUseTransferTax`는 STEP 1에서 `buildRejectionResult()`(`:64`, `:332-`)로 **조기반환**하며
`total` 전 필드가 0이다(undefined 아님 → 크래시는 없음).

- **부착 금지**: 이 경로는 "계산 불가 에러 상태"이지 유효한 계산 결과가 아니다.
  `computeAmendment(amendment, 0)`을 부착하면 `refundTax = 당초 결정세액 전액` →
  경정청구 화면에 **"219,902,989 전액 환급" 오표시**(법적 위험).
- **단건 `[F1]` 선례 미적용**: `transfer-tax.ts:402-403`은 조기반환 시
  `computeAmendment(input.amendment, 0)`을 부착하지만, 그건 "양도차손 → 산출세액 0"이라는 **유효한 계산 결과**다.
  겸용 rejection과 의미가 다르므로 **답습 금지**.
- **가드 차단**: `classifyAmendableTransfer`가 `rd.result?.splitMode === "pre-2022-rejected"`면 `null` 반환
  (버튼 미노출). 부착 금지만으로는 버튼 → 진입 → `originalDeterminedTax=0` → validate 차단(`transfer-tax-validate.ts:263`)
  = **막다른 UX**가 남는다. 1줄로 차단.

### D9. print leaf 미신설 — `calculation` leaf 편승

`AmendmentResultCard`는 `<PrintSection id="calculation">`(`MixedUseResultCard.tsx:141`) **내부**에 넣는다.

- **근거**: 단건도 amendment 전용 leaf가 **없다**(`lib/print/transfer-print-sections.ts` grep `amend` 0건 —
  `calculation` PrintSection 내부 `TransferTaxResultView.tsx:270,283`에 편승). 동형 유지.
- **최상단(모든 PrintSection 밖) 배치 금지**: 인쇄 선택과 무관하게 **항상 인쇄**되어
  "선택은 인쇄 대상만 제어" 계약(`lib/print/mixed-use-print-sections.ts:7-8`) 위반 + 인쇄 패널(`:104-111`)보다 위에 놓이는 UX 결함.
- **결과**: `MixedUsePrintSectionId`(`:35-38`)·`MIXED_USE_PRINT_SECTIONS`(`:47-63`)·`availablePrintIds`
  (`MixedUseResultCard.tsx:84-85`)·`__tests__/print/mixed-use-print-sections.test.ts:25 ALL_LEAVES`·`:81` **전부 불변**
  (정책 `feedback_print_leaf_add_unit_test_sync` 대상 아님).

### D10. "총 납부세액" Row는 **존치 + 라벨 전환** (3-way 판정)

> 검토 fork 3개가 각각 "추가 존치" / "라벨 전환" / "Row 교체"로 갈렸다. 다음으로 판정한다.

겸용주택의 총 납부세액은 hero 카드가 아니라 `ResultSection "합산 세액"` 내부의
`<Row highlight large>`(`MixedUseResultCard.tsx:435-441`) — **세액표의 결론 행**이다.
단건의 배타 교체(`TransferTaxResultView.tsx:282-284`)는 hero 카드가 대상이라 1:1 대응이 없다.

- **Row 교체 기각**: 표에서 결론을 제거하면 **수정 결정세액의 산출근거가 끊긴다**.
- **그대로 추가 기각**: "총 납부세액"(전체 재계산액)과 hero "추가 납부세액"이 동시 노출되어 오독.
  `AmendmentResultCard:86-88`이 이미 "참고 · 경정 후 전체 세액"을 muted로 표시 → 3중 표시.
- **채택**: `breakdown.amendmentDetail` 존재 시 Row 라벨만 전환(`highlight large`·금액 불변).
  카드는 D9대로 `calculation` PrintSection **첫 자식**으로 추가.
  → 표 완결성·라벨 무충돌·print 계약·bundled 선례(`TransferTaxCalculator.tsx:521-528` = 추가 패턴) 모두 충족.

**⚠️ 라벨은 `correctionKind` 3분기 — 단일 라벨 금지**: `AmendmentResultCard`가 분기별로 다른 문구를 쓴다
(refund `:87` "참고 · **경정** 후 전체 세액" / amend `:155` "참고 · **수정** 후 전체 세액").
`"경정 후"` 단일 고정 시 수정신고(더 흔한 케이스)에서 카드와 **같은 숫자·다른 라벨** 충돌이 재발한다.

```
amendmentDetail 없음                    → "총 납부세액"
amendmentDetail.correctionKind==="refund_claim" → "경정 후 전체 세액"
그 외(=amend)                           → "수정 후 전체 세액"
```

실측 근거: `computeAmendment`의 amend 반환(`transfer-tax-amendment.ts:257-267`)은 `correctionKind`를
**설정하지 않고**(undefined), refund 반환(`:128`)만 `"refund_claim"`을 명시 → `=== "refund_claim"` 비교가 정확.

---

## 4. 변경 지점 (14 동기화 지점 대조)

### 4.1 변경 필요

| # | 파일 | 변경 |
|---|---|---|
| E1 | `lib/tax-engine/types/transfer-mixed-use.types.ts` | `MixedUseGainBreakdown.amendmentDetail?: AmendmentDetail` 추가 (+`import type`) |
| E2 | `lib/tax-engine/transfer-tax-mixed-use.ts` | 5번째 인자 `amendment?`; **정상 조립(`:213`) 직전에만** `computeAmendment(amendment, total.transferTax)` 부착. **`buildRejectionResult` 경로(`:64`)는 미부착**(D8) |
| ⑭ | `app/api/calc/transfer/route.ts:692-697` | `calcMixedUseTransferTax(..., rates, **engineInput.amendment**)` — **raw `data.amendment` 전달 금지**. `AmendmentInput`의 Date 4필드는 `route.ts:317-331`에서 `toOptionalDate()` 변환 완료분만 유효; Zod 출력(string)이 그대로 가면 `computeAmendment` 내부 `isAfter()`가 **§48② 감면율을 침묵 오작동**(CLAUDE.md "`Date < string` silent false"). bundled 선례 `:650-651`과 동일 |
| ⑦ | `components/calc/results/mixed-use/MixedUseResultCard.tsx` | (a) `<PrintSection id="calculation">`(`:141`) **직후**에 `breakdown.amendmentDetail && <AmendmentResultCard detail fullTotalTax={t.totalPayable} />` (D9) · (b) `:435-441` Row 라벨 조건부 전환 (D10) · (c) 어댑터에 `amendmentDetail` 전달 금지 (D4). **현재 728줄 → ~745줄, 800 미만 유지**(추가 확장 시 분리 신호) |
| H1 | `lib/calc/transfer-amendment-entry.ts:30-53` | 반환 union에 `"mixed-use"` 추가; `if (rd.mode === "mixed-use") return rd.result?.splitMode === "pre-2022-rejected" ? null : "mixed-use";` (D5·D8) + JSDoc 갱신. **지역 `rd` 타입 선언(`:34-38`) 확장 필수** — 현재 `{mode?, transferBurdenedGiftBreakdown?, properties?}`뿐이라 `result?: { splitMode?: string; total?: { transferTax?: number } }`를 추가해야 D8 가드·H2 fallback이 타입 통과 |
| H1b | 동 `:68`, `:97` | `if (kind !== "single" && kind !== "bundled" && kind !== "mixed-use") return;` (2줄 — D5) |
| H2 | 동 `:56-62` | `extractOriginalDeterminedTax`에 `rd.result?.total?.transferTax` fallback 추가 + **export**(앵커용, §5.1 A2) |
| H3 | `app/history/HistoryClient.tsx:160-178` | `extractTotalTax`의 `inner` 블록(`:162-166`) 내부에 `inner.total.totalPayable` 분기 추가 + **export**(앵커용). 주석 `// 겸용주택 — result.total 한 단계 깊음` |

### 4.2 변경 불필요 — 실측 확인 (Do 재조사 금지)

| 지점 | 근거 |
|---|---|
| ①②③ 폼·initial·normalize | `amendmentMode`·`correctionKind` = 폼-전역(`calc-wizard-store.ts:183,201,268,279`), 자산종류 무관 |
| ④⑬ API 변환·body | `callTransferTaxAPI`(`transfer-tax-api.ts:43`) **단일 함수**가 `amendment`(`:417-438`)·`mixedUse`(`:597`)를 같은 body에 주입 |
| ⑤ UI 위젯 | `Step6.tsx:40-41` — 자산종류 분기 없음 |
| ⑥ 사이드바 | `computeTransferSummary`(`calc-wizard-store.ts:452-457`)는 **테스트에서만 소비**(라이브 참조 0건 — 사이드바는 `transfer-per-asset-summary.ts`로 교체됨). 단건도 amendment 시 `estimatedTax=totalTax` 동일 |
| ⑧ validate | `transfer-tax-validate.ts:262` — 자산종류 무관 |
| ⑨⑩ Zod enum | `propertyBaseShape.propertyType`(`transfer-tax-schema.ts:89`)에 `"mixed-use-house"` 이미 포함 |
| ⑪ acquisitionDate fallback | 겸용은 `mixedUse.landAcquisitionDate`/`buildingAcquisitionDate` 별도 경로(`route.ts:681-682`) |
| ⑫ Zod 입력객체 | `propertySchema`(= route `inputSchema`, `route.ts:36,75`) 단일 스키마가 겸용 포함 전 자산 처리. `amendmentSchema`(sub `:397-411`) 12필드가 `AmendmentInput` 12필드 **전수 일치**. superRefine(`:487`, amendment+filingPenaltyDetails 동시 금지)은 `transfer-tax-api.ts:393,407`의 `!form.amendmentMode` 가드로 미전송 → 충돌 없음 |
| 이력 제목·중복키 | `title-generator.ts:118-131`·`business-key.ts:37-52` 모두 `inputData.amendmentMode` 기준(= `resultData.mode` 무관) → 겸용 amendment record도 "수정신고/경정청구" 제목 + `\|amend`·`\|refund` 접미 **무변경 동작** |
| print leaf | D9 — `ALL_LEAVES` 불변 |
| CorrectionModeBanner | `TransferTaxCalculator.tsx:448-451` — `isResult` 분기 밖·`formData` 기반 → 겸용주택도 정상 노출 |
| 경정청구 `amendedFilingDate` | `transfer-amendment-entry.ts:114` `todayISO()` — 청구기한 도과 경고 목적, 자산종류 무관 |

---

## 5. 검증

### 5.1 Pre-Do anchor (Do 진입 전 우선 작성 — 정책 `feedback_pre_anchor_verification`)

| ID | 파일 | 단언 |
|---|---|---|
| A1 | `__tests__/lib/calc/classify-amendable-transfer.test.ts:61` | **기존 앵커 반전** — `제외: mixed-use` → `mixed-use = "mixed-use"` / `toBe("mixed-use")` |
| A2 | 동상 (신규) | `extractOriginalDeterminedTax`(export 후 직접 앵커) — 겸용 record에서 `result.total.transferTax` 반환 |
| A3 | `__tests__/tax-engine/**transfer-tax**/mixed-use-amendment.test.ts` (신규 — 겸용 6형제 동거 디렉터리. `transfer/`에는 겸용 테스트 **0건** 실측) | `amendment` 전달 시 `amendmentDetail.additionalTax === max(0, total.transferTax − 당초)` |
| A4 | 동상 | `correctionKind: "refund_claim"` 시 `refundTax === max(0, 당초 − total.transferTax)` |
| A5 | 동상 | **비파괴**: `amendment` 미전달 시 `amendmentDetail === undefined` + `total` 전 필드 기존값 불변 |
| A6 | 동상 | **D8**: 양도일 < 2022-01-01 + `amendment` 전달 → `splitMode === "pre-2022-rejected"` && `amendmentDetail === undefined` |
| A7 | `__tests__/lib/calc/classify-amendable-transfer.test.ts` (신규) | **D8 가드**: `mode:"mixed-use"` + `result.splitMode:"pre-2022-rejected"` → `toBeNull()` |
| A8 | `__tests__/lib/calc/transfer-multi-load-entry.test.ts` (**신규 파일** — `classifyLoadableTransfer` 기존 앵커 0건 실측) | **D5 회귀**: `classifyLoadableTransfer(겸용 record)` → `null` (다건 불러오기 미편입) |
| A9 | `__tests__/lib/storage/` 또는 HistoryClient 앵커 | `extractTotalTax`(export 후) — 겸용 record에서 `result.total.totalPayable` 반환 |

### 5.2 역검증 (뮤테이션)

- A3 통과 후 `computeAmendment(amendment, total.totalPayable)`로 바꿔 A3가 **실패**하는지 (D2 기준값 고정 확인).
- A8 통과 후 H1을 `return "single"`로 바꿔 A8이 **실패**하는지 (D5 회귀 방지 확인 — 이번 rev.2의 핵심 결함).

### 5.3 회귀

```bash
# ⚠️ 경로 주의(실측): 겸용 6형제는 transfer-tax/, amendment는 transfer/ — 양쪽 필요.
#    transfer/ 에는 겸용 테스트가 0건이라 단독 실행 시 C1(바이트 불변)이 전혀 검증되지 않는다.
npx vitest run __tests__/tax-engine/transfer-tax/ __tests__/tax-engine/transfer/
npx vitest run __tests__/lib/calc/ __tests__/print/
npx tsc --noEmit
```

### 5.4 E2E (필수 — 정책 `feedback_browser_verify_with_playwright`)

**신규 스펙**: `e2e/mixed-use-amendment.spec.ts`.

- **시딩 재사용**: `mixed-use-filing-form-4col.spec.ts:16-36`의 `mixedUseAsset()`(`makeDefaultAsset` +
  `sessionStorage("transfer-tax-wizard")` 시드 + reload — 일반 겸용주택 §97 직접환산) +
  `transfer-amendment.spec.ts:61-79`의 amendmentMode 주입 패턴 결합(동일 키·동일 방식).
- **셀렉터**: 이력 카드 버튼은 `transfer-amendment.spec.ts:255`
  (`getByRole("button", {name:"수정신고", exact:true})`), 드로어는 `drawer-amend`/`drawer-correction` testid 재사용.
  **결과측은 선례 0** — `AmendmentResultCard`에 `data-testid` 없음(grep 0건) → **testid 추가 필요**
  (또는 텍스트 매칭 `환급 청구세액`(`AmendmentResultCard.tsx:55`) — e2e/CLAUDE.md §3 스코프 한정 준수).

시나리오:
1. 겸용주택 계산 → 이력 저장 → `/history`에서 **납부세액이 숫자로 표시**(H3).
2. **수정신고** 클릭 → 마법사 진입 → Step "가산세"에 `AmendmentBlock` + **당초 결정세액 prefill** 확인(H1·H2).
3. 양도가액 수정 → 계산 → `calculation` 섹션 선두 **추가납부 hero** + 표 마지막 행 라벨 **"수정 후 전체 세액"**(D10 amend 분기).
4. **경정청구** → 환급 hero(emerald) + 청구기한 표시 + 표 마지막 행 라벨 **"경정 후 전체 세액"**(D10 refund 분기).
5. **D5 회귀**: 다건 마법사 "이력 불러오기" 모달에 **겸용주택 record가 나타나지 않음**.

---

## 6. 미결 / 확인 필요

- **O1**(해소): `resultData.mode` 저장 형태 — §1.2에서 실측 확정.
- **O2**: 부담부증여·general_building 정정 미지원(D6)이 겸용주택과 같은 "결정세액 추출 경로 부재" 문제인지 미확인 — 별도 트랙.
- **O3**: `extractLoadPriorPaid`(`transfer-multi-load-entry.ts:37-40`)도 `rd.result?.determinedTax`만 읽어 겸용은 `0` 반환.
  H2와 동일 뿌리이나 **D5 채택 시 도달 불가 경로**가 되어 수정 불필요. (D5를 뒤집으면 되살아남 — A8이 감시.)
- **O4**: 겸용주택은 §114조의2 환산가액적용가산세 로직이 없다(`MixedUseResultCard.tsx:43-44` "가산세 미적용 경로").
  본 작업 범위 외이며 **수정신고 가산세와 별개 조문** — 혼동 금지.
- **O5**(범위 밖): `computeTransferSummary`의 mixed-use `estimatedTax` 분기(`calc-wizard-store.ts:452-457`)는
  라이브 소비처 0건 死코드 — 별도 정리 후보.

---

## 7. 결론

법령 신규 해석 0건. 기존 `computeAmendment()`를 겸용주택 오케스트레이터에 **끝단 append**로 붙이고,
route에서 이미 도달해 있는 `amendment`를 넘기고, 이력 가드·결정세액·납부세액 추출을 여는 **additive 변경**.

**rev.2 핵심 교훈**: 분류값 재사용(`"single"`)은 1줄로 싸 보였지만 실측하면 무관한 소비처
(`classifyLoadableTransfer`)를 침묵 활성화해 §160①단서 분리계산을 소실시킨다. 신규 값이 오히려 무파급(2줄)이다.
잔여 위험은 (a) 기존 배제 앵커 반전(A1 — 의도된 정책 변경), (b) D8 거부 경로 오부착(A6·A7이 감시).
