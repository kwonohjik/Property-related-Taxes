# 양도소득세 수정신고·경정청구 — 미구현 6건 구현 계획서

> 브랜치: `transfer-amendment-remaining-cases` · 워크트리: `/Users/mynote/workspace/PRT-transfer-amendment-cases`
> 기준 커밋: `d3abc365` (origin/master) · 작성 2026-08-27
>
> ⚠️ 본 계획서의 모든 인용은 실파일 `file:line` 실측이다. 미검증 항목은 **§6 V-n**에 분리했다 —
> **V-1·V-2 미해소 상태에서 Do 착수 금지**(세액 경로를 가르는 값이다).

---

## 0. 요약

이력 화면에서 양도세 8건 중 **2건만** 「수정신고·경정청구」 버튼이 뜬다. 나머지 6건은
**법령상 배제 사유가 없고**(§3), **엔진도 이미 계산할 수 있다**(§2). 막고 있는 것은
**배관 3개 층**뿐이다 — 게이트 1줄, route ⑭ 인자 1개, 결과뷰 배선 1건.

즉 이 작업은 「신규 기능 구현」이 아니라 **이미 있는 기능이 특정 자산 종류에서만 도달하지
못하는 것을 잇는 작업**이다.

🔴 **정정 이력 — 「§166⑥ 결과뷰도 결함」은 철회한다 (2026-08-27 코드리뷰).**

자가검토 단계에서 「§2 표가 §166⑥ 결과뷰를 `✕`로 적었으니 그 경로도 라이브 결함」이라고
범위를 넓혔다. **틀렸다.** 렌더 소유자는 `BundledAllocationCard`가 아니라 **부모**다 —
`TransferTaxCalculator.tsx:534-541`이 그 카드 **바로 위에서** `aggregated.amendmentDetail`을
보고 `AmendmentResultCard`를 띄운다(origin/master부터 존재).
⇒ **§166⑥ 일괄양도는 원래부터 정상 동작했고, Phase C는 불필요했다**(중복 카드를 만들어 되돌림).

**왜 놓쳤나**: `BundledAllocationCard` 한 파일에 `amendment` 참조가 0건인 것만 보고
「화면에 안 나온다」고 단정했다. **렌더 지점은 파일이 아니라 부모 체인에서 세어야 한다.**
초기 조사에서 `AmendmentResultCard` grep 결과에 `TransferTaxCalculator.tsx`가 **이미 있었는데**
따라가지 않았다.

⇒ **실제 범위는 처음 서술대로 「general_building 6건」이다.** 끊긴 층은 **2개**(route ⑭ · 이력 게이트)이고
결과뷰는 배관이 이어지면 부모가 알아서 렌더한다.

---

## 1. 현황 — 실측

| # | 이력 제목 | 자산 경로 | 버튼 |
|---|---|---|---|
| 40 | 아파트 납부 실가 | 단건 | ✅ |
| 30 | 주거용으로 용도 변경 | 단건 | ✅ |
| 35-1 | 주택을 상가로(환산) | **general_building** | ❌ |
| 35 | 주택을 상가로 | **general_building** | ❌ |
| 34 | 부담부 증여 | **부담부증여** | ❌ |
| 33 | 증축 환산 | **general_building** | ❌ |
| 32 | 신축 환산 | **general_building** | ❌ |
| 31 | 취득 실거래가 환산 | **general_building** | ❌ |

**6건 전부가 general_building이다**(§6-1 V-1 실측). 34(부담부증여)도 GB 실가 분기이며,
「5+1」로 나눴던 초판 분류는 **정정됐다** — 별개 원인이 아니라 같은 배관의 다른 갈래다.

### 사례 번호 ↔ 자산 경로 근거 (실측)

- 사례 31·32 — `app/api/calc/transfer/route.ts:429` 주석이 **「비증축(사례 31·32)」**로 직접 명시.
- 사례 33 — 증축(`extensionMode`), 같은 general_building 분기.
- 사례 34 — 부담부증여 §159(`transferBurdenedGiftBreakdown`).
- 사례 35 — `lib/stores/calc-wizard-asset-gb.ts:221` 「주택→상가 단일 용도변경 토글 **(general_building 한정)**」.
  ⚠️ 엔진 단위테스트 `case-35-house-to-commercial.test.ts:35`는 `propertyType: "building"`이지만
  이는 **순수 엔진 leaf 직접호출**이라 route 분기를 타지 않는다(메모리 `feedback_leaf_anchor_skips_zod_layer`).
  **UI 경로의 정본은 general_building이다.**

---

## 2. 근본 원인 — 4계층 실측표

`○`=이미 동작 · `✕`=끊김

| 계층 | 단건 | §166⑥ 일괄 | 겸용주택 | **general_building** | 다건 |
|---|---|---|---|---|---|
| ⑤ 입력 UI (`AmendmentBlock`) | ○ | ○ | ○ | **○** | ○ |
| ⑫ Zod (`data.amendment`) | ○ | ○ | ○ | **○** | ○ |
| ⑭ route → 엔진 인자 | ○ | ○ `:305` | ○ `:416` | **✕ 미전달** | ○ |
| 엔진 `computeAmendment` | ○ | ○ | ○ | **○** `aggregate:386` | ○ |
| 결과뷰 렌더 | ○ `TransferTaxResultView:321` | ○ | ○ | **○** | ○ |
| ⑧ validate | ○ | ○ | ○ | **○** | ○ |
| 이력 저장(dedup·제목) | ○ | ○ | ○ | **○** | ○ |
| 이력 게이트 | ○ | ○ | ○ | **✕ `assets.length>1` 탈락** | ○ |

> ⑧·이력 저장은 **실측 결과 asset-kind 비의존이라 무변경**이다 —
> `transfer-tax-validate.ts:499`는 `step===3 && form.amendmentMode`만 보고,
> `business-key.ts:46`·`title-generator.ts:123`은 `inputData.amendmentMode`를 직접 읽는다.
> (「확인했고 무변경」을 남긴다 — 안 적으면 재검토 때 다시 판다.)
>
> ⑤도 실측했다 — `Step6.tsx:40`이 `form.amendmentMode ? <AmendmentBlock/> : <가산세 UI>`이고
> `Step6`은 `TransferTaxCalculator.tsx:345`에서 **고정 인덱스**라 자산 종류로 갈리지 않는다.

### 2-1. 게이트 (`lib/calc/transfer-amendment-entry.ts:35-63`)

```
if (rd.mode === "bundled") {
  const assets = (record.inputData as {assets?: unknown[]}|null)?.assets;
  if ((assets?.length ?? 0) > 1 && !rd.transferBurdenedGiftBreakdown) return "bundled";
  return null;                                    // ← general_building·부담부증여 여기서 탈락
}
```

general_building은 route가 `mode:"bundled"`로 응답하지만 **물건이 1개**라 `assets.length>1`에서
탈락한다. 게이트 주석(`:26-27`)이 이를 **「자연 배제」**라고 스스로 적고 있다 — 즉
**법적 판단이 아니라 §166⑥ 가드의 부수 효과**다. 이것이 이 작업의 핵심 근거다.

### 2-2. route ⑭ 누락 (`app/api/calc/transfer/route.ts:425-510`)

`dispatchGeneralBuilding(...)` 호출의 ⑭ 객체는 `reductions` · `filingPenaltyDetails` ·
`delayedPaymentDetails` · `carryoverTaxation`을 넘기지만 **`amendment`가 없다**.
대비: `:305`(§166⑥)와 `:416`(겸용)은 `engineInput.amendment`를 명시적으로 넘긴다.

⇒ GB에서는 수정신고를 켜도 **세액이 1원도 안 움직인다**(F17 감면·F27 이월과세가 같은 자리에서
같은 이유로 버려졌던 것과 **동일 결함 구조** — `:475`·`:494` 주석에 그 사고 기록이 남아 있다).

### 2-3. 결과뷰 — ✅ **결함 아님** (2026-08-27 정정)

`BundledAllocationCard`에 `amendment` 참조는 0건이 맞다. 그러나 **부모가 렌더한다** —
`TransferTaxCalculator.tsx:534-541`이 `<BundledAllocationCard>` 바로 위에서
`aggregated.amendmentDetail`을 조건으로 `AmendmentResultCard`를 띄운다.
그 파일은 이 카드의 **유일한 프로덕션 렌더러**다(`grep "<BundledAllocationCard"` → 1곳).

⇒ Phase A·B로 `amendmentDetail`이 생기기만 하면 **결과 카드는 자동으로 뜬다.**

> ⚠️ 다만 **인쇄 위치는 단건과 다르다** — 부모 배치는 `PrintSection` **바깥**이라 정정 카드가
> 인쇄·PDF에 포함되지 않는다(단건은 `calculation` 그룹 **안**). 세액·화면에는 영향이 없고
> 이번 범위 밖이라 **손대지 않는다** → §9 후속 R-1.

---

## 3. 법령 검토 — 배제 사유 없음 (KoreanLaw 실측, MST 288571)

**국세기본법 §45①**(수정신고): 요건은 「**과세표준신고서를 법정신고기한까지 제출한 자**
(…) 및 §45의3①에 따른 기한후과세표준신고서를 제출한 자」 + 기한(결정·경정 통지 전 ·
§26의2 제척기간 내).

**국세기본법 §45의2①**(경정청구): 요건은 「**과세표준신고서를 법정신고기한까지 제출한 자**
및 기한후신고자」 + 「법정신고기한이 지난 후 **5년** 이내」.

⇒ **두 조문 모두 요건이 「신고 주체」와 「기한」이며, 자산 종류·평가 방법(환산·실가)·
양도 유형(부담부증여)을 가르는 문언이 본문에도 각 호에도 없다.**
따라서 general_building·부담부증여를 배제할 **법령상 근거가 존재하지 않는다.**

> 메모리 `feedback_no_statute_claim_needs_requirement_article` 준수 — 「명문 없음」을
> 요건 조항 **본문과 각 호를 직접 읽어** 확인했다(전문 인용 위 참조).

---

## 4. 케이스 매트릭스

| K | 대상 | mode | 차단 지점 | 필요 작업 |
|---|---|---|---|---|
| **K-1** | general_building 비증축 환산 (31·32) | bundled | 게이트 + ⑭ + 결과뷰 | 3층 전부 |
| **K-2** | general_building 증축 (33) | bundled | 상동 | K-1과 동일 배관 |
| **K-3** | general_building 주택→상가 (35·35-1) | bundled | 상동 | K-1과 동일 배관 |
| **K-4** | 부담부증여 (34) — **GB 실가** | bundled | 게이트 `!transferBurdenedGiftBreakdown` | K-1과 동일 배관 |

**K-1~K-4 전부 general_building이며 동일 배관 1건으로 함께 풀린다**(V-1 실측).
K-4는 경로가 아니라 **실가 분기(#2)**라는 점만 다르고, 당초세액 축도 이미 올바르다(V-4).

---

## 5. 구현 방안

### Phase 0 — Pre-Do anchor — ✅ **완료 (2026-08-27 실측)**

#### P-0 안전망 실측 — Δ = 0 **실증됨**

GB 경로에 `amendment` payload를 실어 route를 호출했다. 두 경로 **모두** `aggregated.amendmentDetail`이
**`undefined`**였다 ⇒ §2-2의 「route가 amendment를 버린다」가 **실측으로 확증**됐다.
기준세액(실가 204,930,000 · 환산 115,332,000)은 F17-A와 일치해 픽스처 유효성도 함께 확인됐다.

#### 🔑 안전망은 **0건이 아니다** — 기존 2건이 현행 배제를 고정한다

F17-A 때는 안전망이 0건이었으나 이번은 다르다.
`__tests__/lib/calc/classify-amendable-transfer.test.ts`의 **2건**이 현행 동작을 단언한다:

- `:33` 「제외: general_building 등 단일물건 bundled(assets.length===1)」 → `toBeNull()`
- `:40` 「제외: 부담부증여 bundled(transferBurdenedGiftBreakdown)」 → `toBeNull()`

⇒ **Phase B는 이 2건을 함께 갱신해야 한다.** 이들은 법적 계약이 아니라
**결함의 characterization**이다(게이트 주석이 스스로 「자연 배제」라 적었다 — §2-1).
갱신 시 「배제」가 아니라 「전용 값으로 통과」를 단언하도록 **의도를 바꿔 쓴다**.

#### 작성된 anchor (전부 의도대로 실패)

| anchor | 파일 | 결과 |
|---|---|---|
| **A-1** route ⑭ | `__tests__/api/transfer.route.gb-amendment.predo.anchor.test.ts` | 4건 중 **3 실패** · GBA-04(본세 불변)는 통과 |
| **A-2** 게이트 | `__tests__/lib/calc/gb-amendment-gate.predo.anchor.test.ts` | 5건 중 **2 실패** · GBG-03·04·05(불변식)는 통과 |
| **A-3** 결과뷰 | `__tests__/components/gb-amendment-result-view.predo.anchor.test.tsx` | 2건 중 **1 실패** · GBV-02(대조군)는 통과 |

**통과한 6건이 중요하다** — 고치면 안 되는 불변식을 미리 고정한다:
본세 불변(정정은 echo) · 당초세액=양도세분 단독 · 다건 로더 누수 없음 · §166⑥ 대조군 · 미지정 시 미생성.

**기준선 회귀**: 관련 7파일 46건 **전건 통과**(정정 엔진·이력 dedup·F17 배관) — 기존 기능은 온전하다.

#### V-5 ✅ 해소 — 인쇄 목록 변경 **불필요**

`AmendmentResultCard`는 단건 뷰에서 `<PrintSection id="calculation">` **안**에 있고
「총 납부세액」 카드를 **대체**하는 3항 분기다(`TransferTaxResultView.tsx:309·313·321`).
**별도 print leaf가 아니다** — 단건 뷰 `availablePrintIds`(`:199-209`)에도 amendment 항목이 없다.
`calculation`은 bundled `availablePrintIds`(`:392`)에 **이미 포함**.

> 🔴 **이 절의 전제는 뒤집혔다** — Phase C 자체가 불필요했다(부모가 렌더). 기록만 남긴다.

> (철회됨 — §Phase C 참조)

### Phase A — route ⑭ 배선

`route.ts:425-510` `dispatchGeneralBuilding` ⑭ 객체에 `amendment: engineInput.amendment` 추가.

⚠️ **raw `data.amendment` 금지** — Zod 출력은 일자가 string이라 기한 비교(§45의2① 5년 ·
§26의2 제척기간)가 침묵 오작동한다. `:415` 주석이 같은 경고를 명시한다.
⚠️ `dispatchGeneralBuilding` → aggregate 주입 지점 확인 필요 → **V-2**.

### Phase B — 게이트 확장

`transfer-amendment-entry.ts:51-55`에서 general_building을 통과시킨다.

**GB 판별자(F-3 확정)**: `aggregated.generalBuildingValuationDetail`.
GB 3경로가 **전부** 이 키를 세팅한다 — `general-building-fractional.ts:364` ·
`general-building-route-helper.ts:258` · `general-building-route-actual.ts:679`.
`mode==="bundled"` 단독으로는 §166⑥ 일괄과 구분되지 않으므로 이 키가 정본이다.

**전용 반환값 `"general-building"`을 추가**한다.

> 🔴 **초판 정정 (자가검토)** — 초판은 「게이트를 넓히면 다건 로더로 누수된다」고 적고
> 「로더 측 명시적 배제」를 작업으로 지정했다. **과장이었다** —
> `classifyLoadableTransfer:20-24`는 **allow-list**다:
> `if (kind === "single" || kind === "multi") return kind; return null;`
> ⇒ **신규 반환값은 자동으로 배제된다. 로더 수정은 불필요하다.**
>
> 다만 결론은 유지된다 — **기존 값(`"single"`·`"bundled"`)을 재사용하면 실제로 누수**되므로
> 전용 값이 맞다. (근거가 바뀐 것이지 방향이 바뀐 것이 아니다.)

부담부증여는 `!rd.transferBurdenedGiftBreakdown` 조건에서 풀어준다(V-1·V-4로 안전 확인).

### Phase C — 결과뷰 — ⛔ **불필요 (착수 후 철회)**

초판은 `BundledAllocationCard`에 `AmendmentResultCard`를 배선하도록 했다. **실제로 배선했고,
코드리뷰에서 중복이 드러나 되돌렸다** — 부모(`TransferTaxCalculator.tsx:534-541`)가 이미
같은 카드를 띄우고 있어 정정 모드에서 **hero 카드가 두 번** 떴고,
`data-testid="amendment-result"`가 비유일해져 Playwright strict 로케이터도 깨질 상태였다.

⇒ 코드 변경 **0**. 대신 같은 착오가 재발하지 않도록 두 가지를 남긴다:
1. `BundledAllocationCard`에 **소유권 주석** — 「여기에 추가하지 말 것, 부모가 렌더한다」
2. **소유권 anchor** — 이 카드가 정정 카드를 직접 렌더하지 **않음**을 단언(중복 재도입 시 실패)

### Phase D — 진입 헬퍼

`enterAmendment` / `enterRefundClaim`의 `kind !== "single" && ...` 화이트리스트(`:82`·`:111`)에
신규 값 추가. `extractOriginalDeterminedTax`는 `aggregated.determinedTax`를 이미 읽으므로
(`:74`) GB에서 그대로 동작할 것으로 보이나 **실측 필요 → V-4**.

### 5-4. K-4(부담부증여) — V-1·V-4 해소 후 정정

당초 「당초 결정세액 축이 다를 수 있다」는 우려는 **실측으로 해소됐다**(§6-3) —
`aggregated.determinedTax`는 양도세분 단독이라 이미 올바른 축이다.

⇒ K-4는 **별도 아키텍처가 아니다.** 게이트에서 `!transferBurdenedGiftBreakdown` 조건만
풀면 K-1~K-3과 같은 배관을 탄다(실가 분기 #2를 지나는 것만 다름).

⚠️ 다만 **결과 화면 의미론**은 확인이 남는다 — 부담부증여 결과 카드는 양도세·증여세를 함께
보여주므로, 추가납부세액 카드가 **양도세분에만 걸린다는 것이 화면에서 분명해야** 한다.
⇒ §9 후속 R-2로 이관(아래).

## 6. 미검증 항목 (V-n) — **V-1·V-2·V-3·V-4 해소 완료 (2026-08-27 실측)**

| V | 내용 | 결과 |
|---|---|---|
| **V-1** | 사례 34가 GB-부담부증여인지 단건인지 | ✅ **GB 확정** — 근거 아래 |
| **V-2** | amendment의 aggregate 주입 지점 | ✅ **확정** — 아래 §6-2 |
| **V-3** | GB 종착지가 `BundledAllocationCard`인지 | ✅ `TransferTaxCalculator.tsx:486-542` 3분기 실측 |
| **V-4** | `extractOriginalDeterminedTax`가 GB에서 값을 주는지 | ✅ **줌** — `aggregated.determinedTax`(`aggregate.ts:624`) |
| **V-5** | `availablePrintIds` 동기화 필요 여부 | ✅ **불필요** — 애초에 결과뷰를 안 건드린다(Phase C 철회) |
| **V-6** | 사용자 이력에 **지분 GB**(`shares.length>1`) 케이스가 실재하는지 | 🟠 **미해소** — 이력은 브라우저 IndexedDB라 코드로 못 읽는다 ⇒ **Q-1로 승격** |

### 6-1. V-1 — 사례 34도 general_building이다

`transferBurdenedGiftBreakdown`이 **응답에 실리는 지점은 `route.ts:507` 단 하나**이며,
그 자리는 **general_building 분기(L425-510) 내부**다(`general-building-route-actual.ts:411`에서 생성).

⇒ 단건 부담부증여라면 `mode:"single"`이 되어 게이트 `:46`이 즉시 `"single"`을 반환하고
**버튼이 보였을 것이다.** 보이지 않으므로 34는 단건 경로가 아니다.

⇒ **6건 전부가 general_building이다.** 계획 §4의 「5+1」은 **「6건 단일 원인 + K-4의 추가 의미론」**으로 정정.

### 6-2. V-2 — 주입 지점 확정

**`AggregateTransferInput.amendment`는 이미 존재한다**(`transfer-aggregate.types.ts:71`).
GB가 **채우지 않을 뿐**이다. `aggregate.ts:163`의 `amendment: undefined`는 **자산별 누수 차단**이고,
소비는 **top-level 1회**(`:386~387`)다 ⇒ **신고서 단위 필드**로 넣으면 된다.

전례가 바로 옆에 있다 — 같은 자리의 `filingPenaltyDetails`·`delayedPaymentDetails`가
「**신고서 단위 가산세 — 카드마다 실으면 같은 신고의 가산세가 카드 수만큼 배가된다**」는
주석과 함께 정확히 그 방식으로 전달된다. `amendment`는 **동일 성격**이다.

🔴 **주입 지점은 1곳이 아니라 3곳이다**(메모리 `feedback_enumerate_all_write_sites_before_fixing`):

| # | 파일:line | 경로 | `assetLevel` 수신 | 6건 해당 |
|---|---|---|---|---|
| 1 | `general-building-route-helper.ts:243` | **환산** | ○ | 31·32·33·35-1 |
| 2 | `general-building-route-actual.ts:656` | **실가**(부담부증여 K-4 포함) | ○ | 34·35 |
| 3 | `general-building-fractional.ts:339` | **지분**(`shares.length>1`) | **✕ 없음** | 해당 없음(추정) |

⇒ **필요 변경 4곳**:
1. `general-building-route-cards.ts:47` `GbAssetLevelInputs`에 `amendment?: AmendmentInput` 추가
2. `route.ts` GB 분기 ⑭ 객체에 `amendment: engineInput.amendment` 추가 (**raw `data.amendment` 금지**)
3. 위 표 #1·#2 두 호출부에 `amendment: assetLevel?.amendment` 추가
4. #3(지분)은 `assetLevel`을 아예 안 받고 `route.ts:146`도 amendment를 안 넘긴다
   → **범위 밖으로 두되 계획서에 명시**(6건에 지분 케이스 없음. ⚠️ **미실측 추정** —
   지분 GB 이력이 있으면 같은 증상이 남는다). ⇒ **V-6**으로 등록해 Phase 0에서 확인한다

### 6-3. V-4 — 당초 결정세액 축

`extractOriginalDeterminedTax:74`가 `rd.aggregated?.determinedTax`를 읽고, GB는 그 값을 채운다
(`aggregate.ts:624`). 값은 `determinedTaxBeforePenalty = max(0, calculatedTax − reductionAmount)`
(`:381`)로 **양도소득세분 단독**이며 **증여세(`transferBurdenedGiftBreakdown.giftTax.finalTax`)를
포함하지 않는다.**

⇒ 양도소득세 수정신고의 당초 결정세액 축으로 **정확하다**(증여세는 별개 세목·별개 신고).
K-4에서 우려했던 「증여세 포함 여부」는 **기존 코드가 이미 올바른 축**이다.

## 6-4. 결정 게이트 Q-1 — 지분 GB(`fractional`) 경로를 범위에 넣는가

V-6은 **코드로 해소할 수 없다**(이력이 브라우저 IndexedDB에 있다). 선택지:

| 안 | 작업량 | 위험 |
|---|---|---|
| **(a) 함께 고친다** | `calculateGeneralBuildingFractional`에 인자 1개 추가 + `route.ts:146` 분기 1줄 | 낮음. **같은 결함의 4번째 재발을 예방** |
| (b) 범위 밖 | 0 | 지분 GB 이력이 있으면 **증상이 그대로 남는다** — 사용자가 다시 제보 |

> 이 결함은 같은 파일·같은 분기에서 **이미 3번 반복**됐다
> (`isUnregistered` 하드코딩 → F17 `reductions`·가산세 → 이번 `amendment`).
> 「해당 없을 것」이라는 추정으로 남기면 네 번째가 된다.

**⇒ 권고: (a).** 사용자 결정 필요.

## 7. 검증 기준 (Definition of Done)

- [ ] Phase 0 안전망 실측 Δ=0 확인 후 착수
- [ ] anchor A-1·A-2·A-3 **먼저 실패** → 배선 후 통과
- [ ] **뮤테이션 프로브**: 배선을 되돌리면 anchor가 실제로 실패하는지 확인
      (메모리 `feedback_negative_assertion_needs_mutation_probe`)
- [ ] 14 동기화 지점 자가 grep (⑫⑬⑭)
- [ ] E2E는 **경로별로** — 최소 **3건**: ① GB 환산(31·32·33·35-1) ② GB 실가·부담부증여(34·35)
      ③ **§166⑥ 일괄양도**(기존 결함 회귀 — 초판 누락분). 단건 spec 재사용은 커버리지 착시
- [ ] `npx tsc --noEmit` 0건 · `npm run test:transfer` 통과
- [ ] 브라우저 수동 확인 (이력→버튼→마법사→결과 카드, Network `data` 확인)
      ⚠️ 워크트리 E2E는 **`E2E_PORT=3100` 필수**(미지정 시 메인 트리 서버 재사용)

## 7-1. 구현 결과 — ✅ **완료 (2026-08-27)**

| Phase | 변경 | 파일 |
|---|---|---|
| **A** | `GbAssetLevelInputs.amendment` + route ⑭ + **3경로** 주입 | `-route-cards.ts` · `route.ts`(2곳) · `-route-helper.ts` · `-route-actual.ts` · `-fractional.ts` |
| **B** | 게이트 전용 반환값 `"general-building"` + 진입 화이트리스트 | `transfer-amendment-entry.ts` |
| **C** | ⛔ **철회** — 부모가 이미 렌더(코드 변경 0, 소유권 주석·anchor만) | `BundledAllocationCard.tsx` |
| **D** | anchor 3파일 12건 + 뮤테이션 7종 + E2E 2건 | `__tests__/` · `e2e/` |

### 🔑 뮤테이션 프로브 실측

| P-n | 무력화 | 실패 anchor |
|---|---|---|
| P-1 | route ⑭ GB 분기 | GBA-01·02·03 |
| P-2 | 환산 경로 주입 | GBA-02 |
| P-3 | 실가 경로 주입 | GBA-01·03 |
| P-4 | **지분 경로 주입** | GBA-05 |
| P-5 | 게이트 GB 분기 | GBG-01·02 |
| P-7 | **정정 카드 중복 재도입** | GBV-01 |

> 🔴 **P-4는 처음에 0건이었다.** 지분 배선을 지운 채 1,196건이 전건 통과했다 —
> `route.ts:146` 분기는 `assetLevel`을 안 받아 다른 두 경로의 anchor가 대신 지켜주지 못한다.
> GBA-05 추가로 0 → 1.

### 회귀

`tsc` 0건 · lint 0 errors · E2E 2건 · 전체 vitest 통과.

## 9. 후속 — ✅ **R-1·R-2 해소 (2026-08-27)**

| R | 내용 | 근거 |
|---|---|---|
| **R-1** | ✅ **해소** — 렌더를 부모에서 `BundledAllocationCard`의 `calculation` 섹션 **안**으로 옮겨 인쇄·PDF에 포함시키고 단건과 정합. 렌더 지점은 여전히 1곳 | anchor GBV-01(1개만)·GBV-02(`data-print-id="calculation"` 안) |
| **R-2** | ✅ **해소** — `AmendmentResultCard`에 선택 prop `totalScopeNote` 추가, 부담부증여에서만 「전체 세액 **(양도세분)**」으로 한정. **금액은 불변**(비교 기준 `determinedTax`가 정본). 미지정이면 종전 문구라 **기존 3뷰 바이트 불변** | anchor GBV-04·05 |

> R-2는 공용 leaf라 **선택 prop**으로 처리했다 — 미지정 시 종전 동작이므로 다른 뷰에 파급이 없다.

## 8. 리스크## 8. 리스크

| 리스크 | 완화 |
|---|---|
| 게이트 확장이 다건 로더로 누수 (§Phase B) | 전용 반환값 + 로더 측 명시 배제 + 회귀 anchor |
| 결과뷰 한쪽만 배선 (2회 재발 이력) | 공용 leaf 재사용 + 경로별 E2E |
| K-4 당초세액 축 오판 | V-1 선행, 별도 PR 분리 |
| 인쇄 목록 누락 | V-5 선행 확인 |

## 9. PR 분할

V-1·V-2·V-4 해소로 **6건을 1개 PR로 묶을 수 있다**(동일 배관).

1. **PR-1** K-1~K-4 (general_building 6건) **+ §166⑥ 일괄양도 결과뷰 결함** — Phase 0·A·B·C·D
2. (선택) **PR-2** 지분 GB 경로(`fractional`) — §6-2 #3, 해당 이력 확인 후

