# 주식 양도소득세 — 다자산 합산신고 「양도차손 통산」 잔여 종결 계획서 v1

> 작성 2026-09-12 · **기준 commit `58bbc045`** (origin/master · 재핀 2026-09-12, §0.2)
> 초판 핀은 `f61d3dd0`이었다 — 그 사이 머지된 PR #1606~#1608 반영해 재검증했다.
> 트리거: 3단계 화면 ③ 「이월결손금 통산 (PR-3 예정)」 안내 카드 — 사용자 제보 이미지
> 모든 현행 인용은 grep·Read·**vitest probe 실측**이다(추정 0). 미검증은 §6 V-n 레지스터에 명시.
> 정책: `feedback_open_item_audit_stale_rate` · `feedback_pre_change_safety_net_probe` ·
> `feedback_mutation_zero_discrimination_is_not_proof` · `feedback_korean_law_citation_verify`

---

## 0. 착수 전 실측이 전제를 뒤집었다 — 먼저 읽을 것

**화면이 말하는 것과 코드가 하는 것이 다르다.**

```
app/calc/stock-transfer-tax/steps/Step3.tsx:307-313
  {/* ③ 이월결손금 placeholder */}
  <SectionTitle n={3} title="이월결손금 통산 (PR-3 예정)" />
    다른 주식 자산 양도손실 통산은 PR-3 다자산 합산신고에서 지원 예정입니다.
```

이 문장이 주장하는 세 가지를 각각 실측했다.

| 안내문의 주장 | 실측 | 근거 |
|---|---|---|
| 「다자산 합산신고」가 **아직 없다** | ❌ **거짓** — 폼·목록·검증·API·결과카드·신고서 전 축 구현됨 | §0.1 |
| 「양도손실 통산」이 **아직 없다** | ❌ **거짓(주식 그룹)** — §102②·영 §167의2① 엔진 구현 + anchor 28건 | §0.1 |
| 「이월결손금」 | ❌ **용어 자체가 틀렸다** — 양도소득에 결손금 **이월 제도가 없다**(§102① 후단). 잔여 차손은 소멸한다 | §1 |

그러나 같은 자리에 **진짜 미구현 축이 하나 숨어 있다** — 기타자산(§94①4호) 그룹은 통산을
타지 않아 **세액이 과대 산출된다**(실측 3배, §2 G-2).

⇒ **본 계획서는 「다자산 합산신고 신규 구현」이 아니다.** 「거짓 미지원 고지 제거 + 통산이
   닿지 않은 나머지 한 그룹 종결」이다.

> ⚠️ 이 파일을 나중에 읽는 사람에게: 위 표가 이 계획서의 존재 이유다. 「PR-3 예정」이라는
> **압축 라벨을 미결로 읽지 말 것**(`feedback_compressed_label_reads_as_open`). PR-3 본체는
> 2026-05~08에 전건 머지됐고(`docs/00-pm/stock-transfer-pr3-followup-closeout.plan.md` §0),
> 그 사실이 화면 한 곳에만 반영되지 않았다.

### 0.1 이미 구현된 것 (재작업 금지)

| 축 | 실측 현황 | 근거 file:line |
|---|---|---|
| **폼 상태** | `savedItems: StockTransferFormData[]` — 「편집기 1 + 확정 목록 N」 | `lib/stores/calc-wizard-stock-store.ts:127·164·196-222` |
| **입력 UI** | 확정 목록 카드 + 불완전 종목 지목 | `components/calc/stock-transfer/StockItemListCard.tsx` |
| **⑥ 사이드바** | 확정 종목 합계 반영(`filingItemCount`·`isMultiFiling`) | `components/calc/stock-transfer/StockSidebar.tsx:73-79·114` |
| **⑧ 검증** | `validateFilingItems([...savedItems, formData])` 전수 차단 | `app/calc/stock-transfer-tax/StockTransferTaxCalculator.tsx:157-163` |
| **④ API 변환** | `callStockTransferTaxAggregateAPI` — `{ items, deductionMode: "aggregate" }` | `lib/calc/stock-transfer-tax-api.ts:614·621` |
| **⑫ Zod / ⑭ route** | `stockTransferAggregateInputSchema` + `handleAggregate` 분기 | `lib/api/stock-transfer-tax-schema.ts:760` · `app/api/calc/stock-transfer/route.ts:56·115·128·140` |
| **엔진 §103①②** | 그룹별 기본공제 1회 한도 + 양도일 오름차순 배분 | `lib/tax-engine/stock-transfer/stock-transfer-aggregate.ts:150·228·391·398-401` |
| **엔진 §102② (주식 그룹)** | `offsetLossesCore` 호출 + 통산 후 소득 패치 | 같은 파일 `:314-348`·`:485-489` |
| **§102② 코어** | 세목 중립 leaf — 부동산·주식 **공유 단일 소스** | `lib/tax-engine/loss-offset-core.ts` (209줄) |
| **⑦ 결과 카드** | 종목별 표 + 「양도차손 통산 (소득세법 §102②)」 amber 카드 | `components/calc/results/StockAggregateSummaryCard.tsx:135-156` |
| **신고서 별지84호** | 종목별 열 + `18-1. 양도차손 통산` 행 | `components/calc/stock-transfer/StockFilingFormTableHelpers.ts:448-461` |
| **anchor** | `loss-offset-102-2.anchor.test.ts` **28건**(M-1~M-9) | `__tests__/tax-engine/stock-transfer/` |
| **E2E** | 2종목 브라우저 플로우 + `deductionMode` body 단언 | `e2e/stock-multi-item-aggregate.spec.ts:141` |

**`deductionMode`는 UI에서 항상 `"aggregate"`다** — `"each_item"`(통산·합산 미적용, `:228` 조기
반환)은 route가 받을 수 있을 뿐 클라이언트가 보내는 경로가 없다. 즉 **사용자가 종목을 2건
이상 확정하면 통산은 이미 항상 돈다**(주식 그룹 한정).

---

### 0.2 ✅ 인용은 `58bbc045`(origin/master)에 **재핀**됐다 — 드리프트 해소 완료

초판은 `f61d3dd0`에 핀돼 있었고, 작성·검토 중 **다른 세션이 같은 트리의 주식 도메인을
편집**하고 있었다. 워크트리 착수 시점(2026-09-12)에 그 작업이 **머지 완료**되어 재검증했다.

**`f61d3dd0..58bbc045` 실측 — 5커밋**:

| 커밋 | 내용 | 내 경로 영향 |
|---|---|---|
| `de48845f`·`ef6a2a8b` (+머지 2) | 취득세 간주취득 §15② 단서 · §13① 법인 플래그 누수 | **없음** |
| `61757cfc` (#1608) | 주식 **액면가 모드 중복 토글 제거** | 파일 3개 겹침 — 아래 |

**계획서가 «코드를 바꾸겠다»고 지목한 파일 8개는 전부 byte-identical**이다
(`git diff --quiet f61d3dd0 58bbc045` 실측):

```
stock-transfer-aggregate.ts · stock-transfer-aggregate-104-5.ts · loss-offset-core.ts
Step3.tsx · StockAggregateSummaryCard.tsx · StockFilingFormTableHelpers.ts
stock-transfer-rate-calc.ts · types/stock-transfer.types.ts
```

⇒ **§4 설계·§5 Phase 작업은 한 줄도 영향받지 않는다.** §3의 M1·M2·M3 probe 실측치도 유효하다.

액면가 PR이 건드린 3파일은 **§0.1 근거표에만** 인용돼 있었고, 줄번호를 갱신했다:

| 인용 | `f61d3dd0` | **`58bbc045`(현행)** |
|---|---|---|
| `calc-wizard-stock-store.ts` savedItems 선언 | `:128` | **`:127`** |
| 〃 initial | `:165` | **`:164`** |
| 〃 partialize | `:231-234` | **`:230-232`** |
| `stock-transfer-tax-api.ts` aggregate API | `:595·618` | **`:614·621`** |

> ⚠️ **그래도 줄번호가 아니라 식별자로 찾을 것** — `savedItems` · `deductionMode` · `stockIdx` ·
> `offsetIncome` · `otherAssetUsed`. 이 저장소는 하루에 여러 PR이 머지된다
> ([[feedback_external_concurrent_edit_stale_read]] · [[feedback_stale_main_tree_before_not_done_claim]]).
>
> ⚠️ **PR 충돌 주의 해소** — 액면가 축(`fix/stock-face-value-*`)은 #1608로 머지됐다.
> 본 작업은 그 위에서 분기하므로 충돌 표면이 없다. 다만 `.wt-fv2`·`task-a` 워크트리가 아직
> 디스크에 남아 있으니 **그쪽에서 작업하지 말 것**([[feedback_worktree_domain_scope_stay_in_lane]]).

## 1. 법령 — 축자 검증 완료 (KoreanLaw MCP, 2026-09-12 조회)

**「소득세법」 §102** (MST 280405, 시행 2026-01-01) — 축자:

> ① 양도소득금액은 다음 각 호의 소득별로 구분하여 계산한다. 이 경우 소득금액을 계산할 때
> 발생하는 결손금은 다른 호의 소득금액과 합산하지 아니한다.
>  1. **제94조제1항제1호ㆍ제2호 및 제4호**에 따른 소득
>  2. 제94조제1항제3호에 따른 소득
>  3. 제94조제1항제5호에 따른 소득
>  4. 제94조제1항제6호에 따른 소득
> ② 제1항에 따라 양도소득금액을 계산할 때 양도차손이 발생한 자산이 있는 경우에는 **제1항 각
> 호별로** 해당 자산 외의 다른 자산에서 발생한 양도소득금액에서 그 양도차손을 공제한다.
> 이 경우 공제방법은 양도소득금액의 세율 등을 고려하여 대통령령으로 정한다.

**「소득세법 시행령」 §167의2** (MST 286211) — 축자:

> ① 법 제102조제2항의 규정에 의한 양도차손은 다음 각호의 자산의 양도소득금액에서 **순차로**
> 공제한다.
>  1. 양도차손이 발생한 자산과 **같은 세율을 적용받는 자산**의 양도소득금액
>  2. 양도차손이 발생한 자산과 **다른 세율**을 적용받는 자산의 양도소득금액. 이 경우 …
>     각 세율별 양도소득금액의 합계액에서 당해 양도소득금액이 차지하는 비율로 **안분**하여 공제한다.
> ② 법 제90조의 감면소득금액을 계산함에 있어서 … 안분하여 당해 양도차손을 공제한 것으로 보아 …

### 1.1 이 본문에서 곧바로 나오는 세 가지

1. **기타자산(§94①4호)은 §102①「1호」 그룹이다** — 부동산(§94①1호)·부동산권리(2호)와 **같은 호**.
   주식(3호)은 2호 그룹이라 별개다.
2. **§102②의 경계는 「각 호별로」 하나뿐이다.** 건수·자산종류·세율에 관한 **추가 조건이 없다.**
   ⇒ 같은 호 안의 기타자산 2건 사이에도 **통산은 명문상 강제**된다.
3. **이월 규정이 없다.** §102① 후단은 「합산하지 아니한다」이고 §102②·영 §167의2 어디에도
   차기 이월 조항이 없다 ⇒ 통산되지 못한 차손은 **소멸**한다.
   화면의 「**이월**결손금」은 법령에 없는 개념이다(G-1).

> ✅ 영 §167의2②(감면소득금액 안분)는 **본 범위에서 무해**하다 — 조특법 「양도소득세의 감면」
> 조문(§43·§69·§70·§77·§85·§97·§99)이 전부 부동산·토지·주택이고 주식 특례(조특법 §14①·§13)는
> 감면이 아니라 **양도소득 불산입**이다(엔진 주석 `stock-transfer-aggregate.ts:380-382`이 같은
> 근거로 §103② 전단을 배제한 것과 동일). ⇒ **기타자산에도 감면소득금액이 없는지**는 V-2로 남긴다.

---

## 2. 잔여 갭 인벤토리 (실측)

| # | 항목 | 성격 | 세액 영향 | 규모 |
|---|---|---|---|---|
| **G-1** | 3단계 ③ 안내문이 **구현된 기능을 「미지원」이라고 고지** + 법령에 없는 「이월결손금」 용어 | 표시 (거짓 고지) | 없음 | 소 |
| **G-2** | **기타자산 그룹(§102①1호) §102② 통산 미적용** | **법령 미준수** | **과대** (실측 3배) | 중 |
| **G-3** | 합산 결과 카드 **합계행이 산술적으로 자기모순** (G-2의 표면) | 표시 (오해 유발) | 없음 | 소 (G-2 종속) |
| **G-4** | **종목별 차손 흡수액 미노출** — 엔진이 계산해 놓고 버린다. 부동산 정본은 노출한다 | 표시 (설명 불가) | 없음 | 소~중 |
| **G-5** | 설계문서 3곳이 stale (`LossCarryoverBlock` disabled placeholder 등) | 문서 | 없음 | 소 |

---

### G-1 — 화면이 구현된 기능을 「미지원」이라고 고지한다

**현행**: `app/calc/stock-transfer-tax/steps/Step3.tsx:307-313`. 섹션 번호 ③을 차지하며 **단건·다종목
구분 없이 항상** 렌더된다(게이트 없음).

**왜 결함인가**
- 사용자가 이 문장을 읽고 「차손 종목은 넣어도 소용없다」고 판단하면 **실제로는 되는 통산을
  포기**한다. 종목을 2건 확정하면 통산은 이미 돈다(§0.1).
- 「**이월**결손금」은 §1.1-3 대로 법령에 없는 개념이다. 양도소득에는 이월공제가 없다.
- 「PR-3」은 **내부 PR 번호**다 — 사용자에게 아무 의미가 없다. 결과화면 로드맵 카드도 같은
  이유로 2026-08에 폐기됐다(`StockTransferTaxResultViewHelpers.tsx:329-331` 주석).

**역방향 grep 실측** (`feedback_display_string_change_needs_reverse_grep`): 이 문구를 셀렉터로 쓰는
테스트·E2E **0건**. 리터럴·상수 간접·accessible name·정규식 네 형태 모두 확인
(`feedback_selector_axis_has_three_forms`). ⇒ **문구 교체로 깨지는 게이트 없음.**

---

### G-2 — 기타자산 그룹은 통산을 타지 않는다 (세액 과대)

#### 실측 (vitest probe, 2026-09-12)

픽스처: 비상장 **과점주주**(`isQualifyingBlockShareholder: true`) 2종목 ⇒ 둘 다 기타자산
(§94①4호 다목) · `basicDeductionGroup === "real_estate_and_other_asset"` · §104①1호 버킷(§55① 누진).

| 종목 | 주식수 | 양도/취득 단가 | 양도소득금액 |
|---|---|---|---|
| A | 1,000 | 50,000 / 40,000 | **+10,000,000** |
| B | 1,000 | 30,000 / 35,000 | **−5,000,000** |

| | 현행 (실측) | §102② 정합 | 차이 |
|---|---|---|---|
| 통산액 | **0** | 5,000,000 | |
| 합산 양도소득금액 | 5,000,000 | 5,000,000 | |
| 기본공제(§103①1호) | 2,500,000 | 2,500,000 | |
| **합산 과세표준** | **7,500,000** | **2,500,000** | −5,000,000 |
| **산출세액** (§55① 6%) | **450,000** | **150,000** | **과대 300,000 (3배)** |
| `lossOffset` | **`undefined`** | `{ totalOffset: 5,000,000, unusedLoss: 0 }` | 화면 카드 자체가 안 뜬다 |

> 🔴 **차손 종목을 함께 신고해도 세액이 1원도 줄지 않는다** — A 단독 계산의 산출세액도
> 450,000으로 **완전히 동일**했다(같은 probe에서 대조군 실측).
>
> ✅ **정합값 150,000은 추정이 아니다** — §4.2 설계 A를 throwaway로 구현해 **실제로 산출**한
> 값이다(§3 M2). 「§55① 6% × 2,500,000」 손계산과도 일치한다.

#### 원인 — 두 겹이다

**① 코어 호출이 주식 그룹만 필터한다** (`stock-transfer-aggregate.ts:326-341`)

```ts
const stockIdx = rawItems
  .map((r, i) => ({ r, i }))
  .filter((x) => x.r.basicDeductionGroup === "stock")   // ← 기타자산이 여기서 빠진다
  .map((x) => x.i);
const stockOffset = offsetLossesCore(stockIdx.map((i) => ({ ... })));
```

**② 기타자산 분기는 `offsetIncome`을 애초에 읽지 않는다** (`:500-510`)

```ts
} else {
  // 기타자산 그룹: realEstateGroupBasicDeductionUsed로 직접 제어.
  if (isForeignStockItem(input)) return r;
  const adjustedInput = { ...input, realEstateGroupBasicDeductionUsed: otherAssetUsed };
  const recalc = calculateStockTransferTaxInternal(adjustedInput);  // ← 입력에서 통째로 재계산
  otherAssetUsed += recalc.basicDeduction;
  return recalc;
}
```

주식 분기(`:410·485-489`)는 `const income = offsetIncome[i]`를 받아 결과를 **패치**하는데,
기타자산 분기는 **입력에서 다시 돌린다**. 통산 소득을 주입할 자리가 구조적으로 없다.

⇒ **①만 고치면 아무것도 바뀌지 않는다**(§3 mutation M1이 그것을 실측했다). 두 겹을 함께 고쳐야 한다.

#### 이 갭은 코드에 **세 번** 명시돼 있다 (의도된 이연 — 방향 확인됨)

- `stock-transfer-aggregate.ts:320-325` — 「기타자산 그룹은 이번 범위 밖이다 … 별건으로 남긴다」
- `stock-transfer-aggregate-104-5.ts:108-112` — 「차손 통산(§102②)은 이 함수의 범위가 아니다 …
  **기타자산 그룹**(§102①1호)은 아직이라 … 여기 들어오는 값은 종전과 같다」
- `docs/00-pm/cross-engine-104-5-real-estate-other-asset.plan.md:471` — 「차손 통산(§102②) —
  주식 엔진 미구현(PR#1026에서 확인한 별건). 크로스 통산은 더 뒤」

`feedback_deliberate_design_looks_like_the_defect` 적용 — 「원인처럼 보이는 구조」가 **의도된
이연**임을 커밋·주석으로 확인했다. 되돌리는 것이 아니라 **예고된 별건을 착수**하는 것이다.

---

#### G-2 인접 — **검증된 음성** (같은 엔진을 타는 다른 경로)

「무엇이 바뀌는가」가 아니라 **「무엇이 깨지는가」**로 영향 목록을 뽑았다
(`feedback_impact_list_from_what_breaks_not_what_changes`). 같은 aggregate 엔진을 타는 경로가
하나 더 있다:

| 경로 | 판정 | 근거 (실측) |
|---|---|---|
| **부담부증여 주식 다건** `callGiftStockBurdenedTransferAggregateAPI` | ✅ **세액 영향 0** | `lib/calc/gift-burdened-transfer-api.ts:639` 가 `deductionMode: "aggregate"` 로 **같은 엔진**을 탄다. 그러나 ① 시장 선택지가 `kospi\|kosdaq\|konex\|unlisted` **4개뿐**(`components/calc/gift/StockBurdenedDebtSection.tsx:252`)이라 `other_asset`이 없고 ② `isQualifyingBlockShareholder`·`isHeavyRealEstateForRate`가 **`false` 하드코딩**(`gift-burdened-transfer-api.ts:498-499`) ⇒ **기타자산 그룹에 도달할 수 없다** |
| 주식 그룹 통산 | 변화 없음 | 이미 적용 중. A-5 타입 변경도 이 경로는 `json.result.items`만 읽어(`:655-660`) 영향 없음 |

> 📌 이 음성을 **기록으로 남기는 이유**: 「같은 엔진을 타는데 왜 안 봤나」는 나중에 반드시
> 재발하는 의문이다. 확인했고 근거는 위 두 줄이다.

---

### G-3 — 합산 결과 카드의 합계행이 자기모순이다 (G-2의 표면)

`StockAggregateSummaryCard.tsx:64-125`의 표는 `양도소득금액 · 기본공제 · 과세표준` 3열을 나란히
두고 `<tfoot>`에 합계를 찍는다. G-2 픽스처에서 화면에 이렇게 나온다:

| 종목 | 양도소득금액 | 기본공제 | 과세표준 |
|---|---|---|---|
| A | 10,000,000 | 2,500,000 | 7,500,000 |
| B | **−5,000,000** | 0 | 0 |
| **합계** | **5,000,000** | **2,500,000** | **7,500,000** |

**합계행만 보면 `5,000,000 − 2,500,000 = 7,500,000`** 이다. 통산 카드(`:135`)는 `lossOffset`이
`undefined`라 **뜨지도 않으므로**, 사용자는 이 모순을 설명할 단서를 화면에서 얻지 못한다.

> 주식 그룹은 같은 모순이 없다 — `:485-489`가 항등식(`taxBase = transferIncome − basicDeduction`)을
> 지키도록 통산 후 값으로 패치하고, anchor **M-2-6**이 그것을 고정한다. 기타자산에만 없다.

**G-2를 고치면 G-3은 자동 해소된다**(합계 2,500,000 = 5,000,000 − 2,500,000). 별도 표시 작업 불요 —
다만 **항등식 anchor를 기타자산에도** 둬야 재발을 막는다(M-2-6의 기타자산 쌍).

---

### G-4 — 종목별 차손 흡수액을 계산해 놓고 버린다

`offsetLossesCore`는 **자산별** 흡수 내역을 전부 돌려준다(`loss-offset-core.ts:70-80`):
`rows`(from→to·scope)·`fromSame`(§167의2①1호)·`fromOther`(2호 안분).

주식 aggregate가 실제로 읽는 것은 **둘뿐**이다(전수 grep — `stockOffset` 사용처 5곳):

| 필드 | 주식 | 부동산 정본 |
|---|---|---|
| `incomeAfterOffset` | ✅ `:346` | ✅ |
| `rows` | ⚠️ **합계만** `:348` | ✅ `lossOffsetTable` (from→to 테이블) |
| `fromSame` | ❌ **미사용** | ✅ `PerPropertyBreakdown.lossOffsetFromSameGroup` |
| `fromOther` | ❌ **미사용** | ✅ `PerPropertyBreakdown.lossOffsetFromOtherGroup` |
| `unusedLoss` | ✅ `:645` | ✅ |

부동산 표시 정본: `lib/tax-engine/types/transfer-aggregate.types.ts:167·169·391-393` →
`components/calc/results/MultiTransferPropertyBreakdown.tsx:290-306`(자산별 흡수액) ·
`MultiTransferTaxResultView.tsx:271-298`(이전 테이블) · `lib/pdf/ResultPdfTransferSections.tsx:250-251`.

주식 결과는 **총액 1줄**만 말한다. 신고서 18-1행도 합계 열에만 `-totalOffset`을 넣고 종목 열은
`null`이다(`StockFilingFormTableHelpers.ts:459` — `val(0, () => -totalOffset, () => null)`).
⇒ 사용자는 「내 3번 종목이 얼마를 흡수했는가」를 화면에서도 신고서에서도 알 수 없다.

---

### G-5 — 설계문서 stale (문서 전용)

| 파일:line | stale 내용 |
|---|---|
| `docs/02-design/features/stock-transfer-tax.ui.design.md:91` | 「`LossCarryoverBlock` (★ PR-3 disabled placeholder — 다른 주식 자산 양도손실 통산)」 |
| 같은 파일 `:205` | 「PR-3 다자산 신고서 양식 출력 자리에 sky tone placeholder」 — 신고서는 구현됨 |
| 같은 파일 `:239` | 「`LossCarryoverBlock` 신설 (PR-3까지 disabled)」 |
| `docs/02-design/features/stock-transfer-tax.ui.design.md:240` | 「"…PR-3 다자산 합산신고에서 지원 예정" sky tone 카드」 |

⚠️ `LossCarryoverBlock`이라는 **컴포넌트는 실재하지 않는다**(grep 0건) — Step3 인라인 섹션이다.
문서가 없는 파일을 가리킨다.

---

## 3. 안전망 실측 — 바꾸기 전에 재라 (mutation probe, 2026-09-12)

`feedback_pre_change_safety_net_probe`. **「회귀 0건」의 의미를 먼저 확정한다.**
probe 3종을 실행했다. 대상은 매번 `__tests__/tax-engine/stock-transfer/` + `__tests__/calc/`
= **349파일 3,676테스트**(≈38초).

| probe | 무엇을 했나 | 실패 |
|---|---|---|
| **M1** | `stockIdx` 필터 제거 — 두 그룹을 **한 코어**에 넣는다 (법령상 **틀린** 변경) | **2건** |
| **M2** | §4.2 설계 A(A-1+A-2)를 **실제로 구현**한다 (법령상 **옳은** 변경) | **0건** |
| **M3** | M2 위에서 **기타자산 코어**가 주식 차손까지 보게 만든다 (호 경계 위반) | **1건** |

### M1 — 코어를 합치면 무엇이 막는가

```
:328  .filter((x) => x.r.basicDeductionGroup === "stock")  →  .filter(() => true)
```

| 실패한 anchor | 무엇을 지켰나 |
|---|---|
| `loss-offset-102-2.anchor.test.ts` **M-8-3** | 주식 차손이 기타자산으로 넘어가면 `lossOffset`이 `{0, 5,000,000}` → `{5,000,000, 0}`으로 바뀐다 |
| `case-aggregate-multi-stock.test.ts` **MA-02-02** | 호 경계가 깨지면 §103①2호 주식 그룹 기본공제가 오염된다 |

⇒ **§102① 후단(호 경계)은 2건이 지킨다.** 구현 후에도 그대로 통과해야 한다(회귀 게이트 D-3).

### 🔴 M1이 드러낸 것 — **M-8-1은 현재 구별력이 0이다**

M-8 그룹의 대표 anchor **M-8-1**(「주식 차손이 기타자산 소득을 줄이지 않는다」)은 **실패하지
않았다**. 단언 대상이 `withLoss.items[0].taxBase === alone.items[0].taxBase`인데, 기타자산 분기가
`offsetIncome`을 **애초에 읽지 않아**(§2 G-2 원인 ②) 코어를 어떻게 바꾸든 그 값이 움직이지
않기 때문이다.

`feedback_mutation_zero_discrimination_is_not_proof` 정면 사례다 — **「M-8-1이 통과하니까 호
경계가 지켜진다」는 거짓 기록**이었다.

### ✅ M2 — 설계 A를 실제로 구현해 봤다 (실현가능성 + 안전망 동시 실측)

§4.2의 A-1·A-2를 throwaway로 구현해 돌렸다(구현 후 원복, `git status` clean 확인).

| 측정 | 결과 |
|---|---|
| `npx tsc --noEmit` | **0건** |
| 도메인 회귀 (3,676테스트) | **0건 실패** |
| G-2 픽스처 산출세액 | 450,000 → **150,000** (§1 정합값과 일치) |
| 항등식 (G-3) | `5,000,000 − 2,500,000 = 2,500,000` ✅ 자동 해소 |
| echo 5필드 (§4.3) | `clause1BucketTaxBase` 2,500,000 · `clause1BucketTax` 150,000 — **통산 후 값과 일치** |
| §104⑤ 비교과세 (§4.4) | `aggregatedTaxBase` 2,500,000 · `aggregatedTax` 150,000 — **자동 추종**(호출 순서 변경 불요) |
| `lossOffset` | **여전히 `undefined`** — A-5(타입 확장)를 안 했기 때문. **Q-1이 실제로 필요함을 확증** |
| 차손 종목 `transferIncome` | −5,000,000 → **0** (주식 그룹 규약과 동일) |

⇒ 두 가지가 동시에 확정됐다:
1. **설계 A는 drop-in이다** — 타입·회귀 모두 0건. 시그니처 변경 없음.
2. **기타자산 통산 「미적용」을 지키는 anchor는 실측 0건이다.** 추론이 아니라 **구현해서 센 값**이다.
   동시에 **아무도 그 동작을 보고 있지 않았다**는 뜻이기도 하다 — 그래서 3배 과대가 발견되지
   않았다. 구현과 함께 **양방향 anchor**를 반드시 남긴다(Phase 0 P-1~P-4).

### ✅ M3 — 구현 후 M-8-1은 구별력을 얻는다

M2 위에서 **기타자산 코어**의 필터를 `() => true`로 열어 호 경계를 위반시켰다
(M1과 방향이 다르다 — M1은 주식 코어, M3는 기타자산 코어).

```
:354  .filter((x) => x.r.basicDeductionGroup === "real_estate_and_other_asset")  →  .filter(() => true)
```

| 실패 | |
|---|---|
| **M-8-1** | ✅ **이번에는 빨개진다** — 기타자산 분기가 `offsetIncome`을 소비하기 시작했기 때문 |

⇒ **D-2의 정본 뮤테이션은 M1이 아니라 M3다.** 「구현이 실제로 **소비된다**」를 증명하는 것은
기타자산 코어 쪽 누수다(`feedback_fixed_layer_vs_consumed_layer`).

> ⚠️ M1을 M2 위에 다시 얹어도 M-8-1은 **통과한다** — A-1이 기타자산 항목의 `offsetIncome`을
> 두 번째 코어 결과로 **덮어쓰기** 때문이다. 실측으로 확인했다. D-2에 M1을 쓰면 잘못된 초록을 얻는다.

## 4. 설계 — G-2

### 4.1 rateKey 축은 **이미 있다** (신규 설계 불요)

영 §167의2①의 「같은 세율을 적용받는 자산」 판정 축을 코어는 정하지 않고 호출자가 준다
(`loss-offset-core.ts:21-29`). 주식 호출자의 축 함수는 **기타자산까지 이미 정의해 두었다**:

```
lib/tax-engine/stock-transfer/stock-transfer-rate-calc.ts:104-111
  case "other_asset_block_shareholder":
  case "other_asset_heavy_re":            return "other_asset_progressive";       // §104①1호 (§55① 누진)
  case "other_asset_block_shareholder_nbl":
  case "other_asset_heavy_re_nbl":        return "other_asset_progressive_nbl";   // §104①9호 (기본 +10%p)
```

이 두 키는 `computeOtherAssetComparativeTax`의 §104⑤ 버킷(`"104-1-1"` / `"104-1-9"`,
`stock-transfer-aggregate-104-5.ts:131-135`)과 **1:1 대응**한다 ⇒ 통산 축과 비교과세 축이
어긋나지 않는다. **축 설계 논쟁 불요.**

### 4.2 설계 A (권고) — 기타자산 분기를 주식 분기와 **같은 패치 규약**으로

> ✅ **이 설계는 throwaway 구현으로 실측 검증됐다**(§3 M2) — `tsc` 0건 · 도메인 회귀 0건 ·
> G-2 픽스처가 법령 정합값 150,000을 산출. **아래는 추정 설계가 아니라 돌려 본 코드다.**

두 단계 변경. 둘 중 하나만 하면 no-op다(§3 M1 실측).

**A-1. 코어를 그룹마다 따로 돌린다** (`:326-348`)

```ts
const idxOf = (g) => rawItems.map((r,i)=>({r,i})).filter(x=>x.r.basicDeductionGroup===g).map(x=>x.i);
const stockIdx      = idxOf("stock");
const otherAssetIdx = idxOf("real_estate_and_other_asset");
const runOffset = (idx) => offsetLossesCore(idx.map((i) => ({
  income:  rawItems[i].transferIncome,
  rateKey: resolveStockRateKey(rawItems[i].taxCategory, smeFlag(inputs[i]), rawItems[i].isShortTermHolding),
  exempt:  rawItems[i].isExempt,
})));
const stockOffset      = runOffset(stockIdx);
const otherAssetOffset = runOffset(otherAssetIdx);   // ← 신규
```

🔑 **코어를 그룹마다 따로 부르는 것이 §102① 후단의 구현**이다. 하나로 합치면 영 §167의2①2호의
pro-rata가 호 경계를 넘는다(M1이 실측으로 확인 — MA-02-02·M-8-3 빨개짐).

**A-2. 기타자산 분기가 `offsetIncome`을 소비한다** (`:500-510`) — 주식 분기(`:404-497`)와 대칭:

```ts
} else {
  if (isForeignStockItem(input)) return r;
  const income   = offsetIncome[i];
  const remaining  = Math.max(0, BASIC_DEDUCTION_LIMIT - otherAssetUsed);
  const deductThis = Math.min(Math.max(0, income), remaining);
  otherAssetUsed += deductThis;
  const taxBase = Math.floor(Math.max(0, income - deductThis));
  const rateResult = applyStockTaxRate(taxBase, r.taxCategory, smeFlag(input), r.isShortTermHolding, r.isExempt);
  const calculatedTax = floorTen(rateResult.calculatedTax);
  const fin = finalizeStockTax(calculatedTax, input);
  return { ...r, transferIncome: income, basicDeduction: deductThis, taxBase, calculatedTax, ...fin,
           /* §4.3 echo 5필드 재계산 */ };
}
```

> ⚠️ `otherAssetUsed`의 **시드는 그대로 둔다** — `realEstateGroupUsedSeed`(부동산에서 이미 쓴
> 기본공제, `:391`·정의 `:217`)에서 출발해야 §103①1호 그룹 한도가 부동산과 공유된다.

### 4.3 🔴 반드시 함께 재계산해야 하는 echo 5필드 — 놓치면 **조용한 드리프트**

현행 기타자산 분기는 `calculateStockTransferTaxInternal`을 **통째로** 부르므로 아래 필드가
자동으로 일관됐다. 패치 방식으로 바꾸면 **손으로 맞춰야 한다**
(`feedback_aggregate_display_rederives_engine_value` 정면 위험):

| 필드 | 산출 근거 | 의존 |
|---|---|---|
| `clause1BucketTaxBase` / `clause1BucketTax` | `stock-transfer-tax.ts:492-493` | `taxBase` · `calculatedTax` |
| `clause9TaxBase` / `clause9Tax` | 같은 파일 `:494-495` | 〃 |
| `cross1045Adjustment` | 같은 파일 `:464-470` (`computeCross89Adjustment`, `clause9TaxBase: taxBase`) | 〃 |

이 다섯은 **§104⑤ 크로스 조정 레이어**(`lib/tax-engine/comparative-104-5-cross.ts`)가 부동산
§104①8호와 한 버킷으로 재합산할 때 읽는 값이다. 통산으로 `taxBase`가 줄었는데 이 필드만 옛
값이면 **부동산 쪽 합산이 조용히 틀린다** — 주식 신고서에는 아무 흔적도 남지 않는다.

⇒ **Phase A에 전용 anchor를 둔다**(§5 A-4): 통산 전후로
`clause1BucketTaxBase === taxBase`(1호일 때)·`clause9TaxBase === taxBase`(9호일 때) 항등식.

> ✅ M2 probe에서 이 다섯을 **명시 재계산**하니 `clause1BucketTaxBase` 2,500,000 ·
> `clause1BucketTax` 150,000으로 통산 후 값과 일치했다(§3). **명시하지 않으면 옛 값이 남는다** —
> `...recalc` spread가 그대로 덮기 때문이다. anchor 없이는 아무 게이트도 빨개지지 않는다.

### 4.4 §104⑤ 비교과세와의 순서 — **바꾸지 않는다**

`computeOtherAssetComparativeTax(processedItems, inputs)`는 **패치 후 items**를 받는다
(호출부 `:594`). 통산이 `taxBase`를 줄이면 그 값이 그대로 버킷 합계에 반영되므로 **순서 변경
불요**. §92② 순서(양도차익 → 양도소득금액(통산) → 과세표준(기본공제) → 세율)와도 일치한다.

> ✅ M2 probe 실측 — `otherAssetComparativeTax`가 `aggregatedTaxBase` 2,500,000 ·
> `aggregatedTax` 150,000으로 **자동 추종**했다. 호출부·순서 변경 0줄.

`stock-transfer-aggregate-104-5.ts:108-112`의 ⚠️ 주석은 **Phase A에서 함께 정정**한다(G-5와 같은 층위).

### 4.5 ❌ 채택하지 않는 대안 (재제안 금지)

| 대안 | 기각 사유 |
|---|---|
| 두 그룹을 **한 코어 호출**로 합치기 | §102① 후단 위반. M1 실측으로 MA-02-02·M-8-3이 빨개진다 |
| 입력(`perShareTransferPrice` 등)을 조정해 통산을 흉내내기 | 양도가액·필요경비 echo가 전부 거짓이 된다. 신고서 ①②③ 행이 틀어진다 |
| `calculateStockTransferTaxInternal`에 `incomeOverride` 파라미터 신설 | 단건 엔진 시그니처 오염. 주식 분기가 이미 「패치」 규약을 쓰므로 비대칭만 늘어난다 |
| **부동산 ↔ 기타자산 크로스 통산**까지 이번에 | §102①1호는 원래 부동산과 한 그룹이지만 **두 엔진이 분리**돼 경로가 없다. `cross-engine-104-5-…plan.md:471`이 「크로스 통산은 더 뒤」로 명시. **본 계획 범위 외**(§7 비스코프) |

---

## 5. Phase 별 작업

### 5.0 PR 분할 — ✅ Q-3(a) 확정

「세액 / 표시」 분리 결정에 실측 하나를 더했다 — **표시축이 엔진 의존 有/無로 다시 갈린다**(§6.3).

| PR | 내용 | 엔진 의존 | 성격 | 선행 |
|---|---|---|---|---|
| **PR-1** | **B-1**(섹션 삭제 + 번호 재배치) · **C-1~C-3**(문서) | **없음** | 표시·문서 — 세액 불변 | 없음. **즉시 착수 가능** |
| **PR-2** | **Phase 0**(anchor 4) · **Phase A**(A-1~A-7) · **Phase D** 해당분 | — | 🔴 **세액 변경** | 없음(PR-1과 직교) |
| **PR-3** | **B-2~B-6**(종목별 흡수액 노출·카드·신고서) | **A-5 타입** | 표시 — 세액 불변 | **PR-2** |

- **PR-1을 먼저 낸다** — 거짓 고지(§2 G-1)는 지금도 사용자에게 보이고 있고, 엔진과 직교해
  리뷰가 가장 싸다. G-1의 근거(주식 그룹 통산)는 **이미 구현돼 있으므로** PR-2를 기다릴 이유가 없다.
- **PR-2는 단독으로 둔다** — 세액 변경 PR을 표시 변경과 섞지 않는 것이 이 저장소 관례.
  커밋 메시지에 §102②·영 §167의2① 축자 근거를 남긴다(§8 R-3).
- **PR-3은 PR-2 머지 후** — `lossOffset` 그룹별 타입(A-5)에 컴파일 의존한다.
- PR-1과 PR-3을 합쳐도 된다(둘 다 표시·저위험). 다만 그러면 PR-1이 PR-2를 기다리게 된다.

### Phase 0 — Pre-Do anchor (Do 진입 조건 · PR-2)

`feedback_pre_anchor_verification`. **현행 동작을 먼저 고정**하고, 기대값은 법령 정합값으로 쓴다.

- [x] ✅ **P-1** §2 G-2 픽스처(기타자산 2건 +1,000만 / −500만)를 `loss-offset-102-2.anchor.test.ts`에
      `describe("M-10 기타자산 그룹 §102② 통산")`으로 추가. 기대값은 **정합값**
      (`totalTaxBase 2,500,000` · `totalCalculatedTax 150,000` · `lossOffset {5,000,000, 0}`).
      ⇒ **구현 전 실패**해야 한다. 통과하면 픽스처가 기타자산이 아니다
      (`feedback_fixture_default_masks_gate_defect` — `basicDeductionGroup`을 **먼저 단언**하는
      픽스처 가드를 M-9-0 패턴으로 함께 둘 것).
- [x] ✅ **P-2** 항등식 anchor (M-10-3) — ⚠️ **초판 식이 틀렸다.** `Σ max(0, item.transferIncome)`
      로 쓰면 현행(10,000,000−2,500,000=7,500,000)도 구현 후(5,000,000−2,500,000=2,500,000)도
      **양쪽 다 성립**해 구별력이 0이다. 실제로 Phase 0 실행에서 **GREEN 이 나왔다**.
      화면이 실제로 쓰는 값은 **`totalTransferIncome`**(차손을 이미 net 한 값)이므로
      `totalTaxBase === max(0, totalTransferIncome) − Σ기본공제` 로 정정했다.
- [x] ✅ **P-3** 대조군 (M-10-4) — 기타자산 **이익 2건**(차손 없음)에서 세액이 **변하지 않음**을 고정.
      「통산이 없을 때 아무 일도 일어나지 않는다」를 증명하지 않으면 회귀를 못 가른다.
- [x] ✅ **P-4** §104⑤ 교차 (M-10-5 정합값 + M-10-6 대조군) — 기타자산 **1호 1건 + 9호 1건**에 차손을 섞어 `applied`·`aggregatedTax`
      현행값을 **먼저 기록**(구현 후 어떻게 바뀌는지 대조용).

> ✅ **anchor 진입점 판단** — 본 작업은 **신규 사용자 입력이 0건**이라(§7)
> `calculateStockTransferTaxAggregate` **직접 호출**로 충분하다. ⑫Zod·⑬body·⑭route를 건너뛰어도
> **그 층에 새로 생기는 것이 없다**. `feedback_leaf_anchor_skips_zod_layer`가 요구하는
> 폼→④→⑫→⑭ 경로 anchor는 **이번엔 불요**다 — 다음 사람이 재검토하지 않도록 근거를 남긴다.

### Phase A — 엔진 (G-2) · **PR-2**

- [x] ✅ **A-1** `stock-transfer-aggregate.ts` — `runOffset` 헬퍼 + 그룹별 2회 호출 (§4.2 A-1)
- [x] ✅ **A-2** 기타자산 분기를 패치 규약으로 — **분리 파일**
      `stock-transfer-aggregate-other-asset.ts`(`processOtherAssetItem`, 120줄)로 추출했다(A-7)
- [x] ✅ **A-3** ⚠️ **초판 정정 — 코드 변경 불요, 주석만.** `:353-358` `otherAssetGroupIncome`은
      **이미 `offsetIncome`을 읽으므로** A-1만으로 자동 추종한다(M2 probe에서 이 줄을 건드리지
      않고도 기본공제 2,500,000이 정확히 나왔다). 갱신 대상은 `:409` 주석뿐(나머지는 A-6)
- [x] ✅ **A-4** echo 5필드 재계산 — anchor **M-10-5**가 `clause1BucketTaxBase`·`clause1BucketTax`·
      `clause9TaxBase` + `otherAssetComparativeTax` 까지 통산 후 값임을 고정
- [x] ✅ **A-5** **Q-1(b) 적용 완료** — `lossOffset` 타입(`:92-97`)을 **그룹별**로 확장.
      형태·소비자 전수는 **§6.1**. 키는 `basicDeductionByGroup`과 동일
      (`stock` / `real_estate_and_other_asset`), **둘 다 필수**
- [x] ✅ **A-6** 구현으로 **stale이 되는 주석 4곳** 정정 — 역방향 grep 전수 확정
      (`feedback_citation_drift_replicates_across_repo`). 초판은 **2곳만** 적었다:

      | 위치 | 현행 문구 | 초판 |
      |---|---|---|
      | `stock-transfer-aggregate.ts:320-325` | 「기타자산 그룹은 이번 범위 밖이다 … 별건으로 남긴다」 | ✅ |
      | 같은 파일 `:343` | 「통산 후 양도소득금액 — **주식 그룹만** 갈아끼우고 기타자산은 원값 유지」 | 🔴 **누락** |
      | 같은 파일 `:585-586` | 「기타자산 그룹은 **통산 미적용이라 음수가 남을 수 있어** clamp를 유지한다」 | 🔴 **누락** |
      | `stock-transfer-aggregate-104-5.ts:108-112` | 「차손 통산(§102②)은 이 함수의 범위가 아니다 … 기타자산 그룹은 아직이라 …」 | ✅ |

      ⚠️ `:585-586`은 **clamp를 지우라는 뜻이 아니다** — `Math.max(0, …)`는 유지하고 **사유만** 갱신한다
- [x] ✅ **A-7** 800줄 정책 — **분리 수행**.
      657줄 → 구현 직후 **781줄**(예상 717을 넘겨 **750 위험구간 진입**) → 분리 후 **721줄**.
      신설: `stock-transfer-aggregate-other-asset.ts` **120줄**(`processOtherAssetItem`).
      이음매는 **§102①·§103① 「호」 축** — 이 파일이 §103①**1호**(기타자산) 종목 하나를 맡고,
      주식(2호)·국외주식 분기와 오케스트레이션은 원래 파일에 남는다.
      트리거(800) 미달이지만 **이번 PR이 키운 블록**이라 그 김에 정리했다(기회주의적 분리 —
      미래의 분리 전용 PR 고정비 회피). 착지 721 = 목표 700 대비 +21 · 트리거까지 79줄 여유.
      ⚠️ `smeFlag`는 **정본 leaf를 그대로 import** 한다 — 손술어 사본을 만들지 않는다

### Phase B — 표시 (G-1 · G-3 · G-4) · **B-1 = PR-1 / B-2~B-6 = PR-3**

- [x] **B-1** (G-1) ✅ **완료 (PR-1, 2026-09-12)** — 섹션 ③ 삭제 + 번호 재배치.
      결과: `:189` ① · `:249` ② · `:328` ③(국외전출세) · `:354` ③(신고 유형) · `:473` ④(가산세).
      두 ③은 `isExitTax` 상호배타 분기다. 삭제 자리에는 **왜 지웠는지**를 주석으로 남겼다
      (세 주장이 전부 사실과 달랐다는 기록 — 다음 사람이 되돌리지 않도록)
- [x] **B-1a** ✅ **신규 anchor** `__tests__/components/calc/stock-step3-section-numbering.test.tsx`
      (SS-1~SS-5, 5건). 선례 `UnlistedStockV2SectionNumbering.test.tsx` 패턴.
      🔑 **뮤테이션으로 구별력 실증** — ④가산세를 ⑤로 되돌리니 **SS-1·SS-3이 RED**.
      이 anchor가 없으면 번호를 아무렇게나 바꿔도 전부 초록이다(§6.2 구조 근거)
- [x] ✅ **B-2** (G-4) 엔진이 `fromSame`·`fromOther`를 **종목별로 노출** — `StockTransferResult`에
      **optional** echo `lossOffsetFromSameGroup` / `lossOffsetFromOtherGroup`(부동산 정본과
      같은 이름·같은 양수 규약). anchor **M-11-1~6**.
      🔑 **optional이 핵심이다** — 0을 채우면 「0원 흡수」와 「통산 자체가 없음」이 구분되지 않아
      결과 화면이 빈 행을 만든다(M-11-4·5가 그것을 고정).
- [x] ✅ **B-3** (G-4) `StockAggregateSummaryCard` 종목별 표 — 양도소득금액 셀 **아래**에
      「동일그룹 −N」·「타군안분 −N」 서브라인. 열을 늘리지 않는다(이미 6열, 모바일 스크롤).
      전 셀 `align-top`으로 첫 줄 정렬. anchor **AS-6-1~3**
- [x] ✅ **B-4** (G-4) 신고서 18-1행 종목 열 — `null` → **그 종목이 흡수한 합**(1호+2호).
      차손을 **준** 종목은 `null` 유지. **행수 가드 무변경 확인**(행 수가 아니라 값만 바뀌었다).
      anchor **FF-4-1~4**
- [x] ✅ **B-5** (G-3) 확인 — PR-2의 G-2 해소로 자동. **표시 코드 변경 0줄**
- [x] ✅ **B-6** `amount-column-align` — 신규 서브라인은 상위 셀의
      `text-right font-mono tabular-nums whitespace-nowrap` 안에 들어간다

### Phase C — 문서 (G-5) · **PR-1**

- [x] **C-1** ✅ **완료** — `stock-transfer-tax.ui.design.md` 3곳(`:91` 트리 · Step 4 결과 화면 ·
      「#2 이월결손금 placeholder」 항목). 실재하지 않는 `LossCarryoverBlock` 표기를
      **「실재한 적이 없다」는 사실과 함께** 남겼다 — 이름만 지우면 왜 없어졌는지가 사라진다
- [x] **C-2** ✅ **완료** — `stock-transfer-pr3-followup-closeout.plan.md` §0에 역링크.
      그 계획서의 「PR-3 다자산 ✅ 구현」 판정은 **유효함**을 함께 명시(빠진 것은 기타자산 축 하나)
- [x] **C-3** ✅ **완료** — `cross-engine-104-5-real-estate-other-asset.plan.md` §8.
      「주식 엔진 미구현」 → 「주식 그룹은 2026-08-12 구현 · 기타자산은 본 계획서 ·
      **부동산↔기타자산 크로스는 여전히 별건**」

### Phase D — 검증 (게이트) · **PR마다 해당분 실행**

- [ ] **D-1** Phase 0 anchor 전건 GREEN (P-1이 구현 전 RED였다가 GREEN)
- [ ] **D-2** 🔴 **M3 mutation 재실행** — 구현 후 **기타자산 코어**(`otherAssetIdx`) 필터를
      `() => true`로 열어 **M-8-1이 빨개지는지** 확인. 빨개지지 않으면 A-2가 덜 된 것이다.
      ⚠️ **M1(주식 코어)을 쓰면 안 된다** — A-1이 기타자산 `offsetIncome`을 덮어써 M-8-1이
      통과해 버린다(§3 M3 각주, 실측 확인)
- [ ] **D-3** M-8-1·M-8-3·MA-02-02 **그대로 통과**(호 경계 회귀 게이트)
- [ ] **D-4** `npx vitest run __tests__/tax-engine/stock-transfer/ __tests__/calc/` — 3,676건 기준 회귀 0
- [ ] **D-5** `npx tsc --noEmit` 0건 · `npm run lint`
- [ ] **D-6** E2E — `E2E_PORT` 격리 필수(`feedback_worktree_e2e_port_isolation`).
      `e2e/stock-multi-item-aggregate.spec.ts`에 **기타자산 차손 1건 추가**.
      ⚠️ Playwright 요약은 `1 failed` **다음에** `N passed`를 찍는다 — **exit code로 판정**
      (`feedback_playwright_summary_last_passed_line_hides_failures`)
- [ ] **D-7** 브라우저 수동 확인 — 폼 → 2종목 확정 → 계산 → 결과. Network 탭에서
      `deductionMode: "aggregate"` + 응답 `lossOffset` 확인

---

## 6. 미검증 레지스터 · 사용자 결정

### 6.0 Q-n — ✅ **전건 확정** (2026-09-12, 사용자 결정)

| # | 질문 | **결정** | 결정이 바꾸는 것 |
|---|---|---|---|
| **Q-1** | `lossOffset` 타입 확장 | ✅ **(b) 그룹별로 나눈다** | A-5 형태 확정(§6.1). anchor 5건·UI 2곳 수정. **이력 마이그레이션 0** (§6.5 실측) |
| **Q-2** | Step3 섹션 ③ | ✅ **(b) 섹션 자체 삭제** | B-1이 「문구 교체」가 아니라 **삭제 + 번호 재배치**가 된다(§6.2) |
| **Q-3** | PR 분할 | ✅ **(a) 분리** | §5.0 PR 분할표. 실측상 **표시축이 다시 둘로 갈린다**(엔진 의존 有/無) |

---

### 6.1 Q-1 확정 — `lossOffset` 형태

> 🔴 **초판 정정 (검토 2026-09-12)** — 초판은 손으로 쓴
> `{ stock: …; real_estate_and_other_asset: … }` 인터페이스를 제안하고 근거를 「두 키를 필수로
> 두면 그룹이 하나 늘 때 컴파일러가 잡는다」로 적었다. **틀렸다.** 손으로 쓴 필수 키 2개는
> union에 3번째 멤버가 추가돼도 **아무 말도 하지 않는다**
> ([[feedback_satisfies_preserves_keys_annotation_kills_guard]] — 「필수 필드는 컴파일러가 이미
> 잡는다 · 가드가 실제로 버는 것은 **커버리지**다」). ⇒ **union에서 유도**한다.

`basicDeductionGroup`은 **union 타입**이다 — `stock-transfer.types.ts:898`
`"real_estate_and_other_asset" | "stock"`. 그 union에서 키를 유도한다:

```ts
/**
 * §102②·영 §167의2① 양도차손 통산 요약 — **§102① 호별로 나눈다.**
 *
 * 두 호는 서로 통산하지 못하므로(§102① 후단) 합계 1줄로 뭉개면 카드가 법령 구조를 거스른다.
 *
 * 🔑 키를 `basicDeductionGroup` union에서 **유도**한다 — 그룹이 하나 늘면 이 타입과 모든
 *   조립부가 함께 빨개진다. 손으로 두 키를 적으면 union이 늘어도 침묵한다
 *   ([[feedback_satisfies_preserves_keys_annotation_kills_guard]]).
 *
 * 어느 그룹도 통산·소멸이 없으면 필드 자체가 `undefined`(종전 계약 유지).
 * 「그 그룹엔 통산이 없음」은 `{ totalOffset: 0, unusedLoss: 0 }`으로 표현한다(카드는 `> 0` 게이팅).
 */
lossOffset?: Record<
  StockTransferResult["basicDeductionGroup"],
  { totalOffset: number; unusedLoss: number }
>;
```

> 🔑 **optional 키로 만들지 않는다** — 필수 키라야 조립부 누락을 컴파일러가 잡는다.
> 조립부는 **`satisfies`**로 쓴다(같은 메모리 — `: 타입` 주석을 달면 `keyof`가 넓어져 가드가 죽는다).
>
> ⚠️ 같은 객체의 `basicDeductionByGroup`(`stock-transfer-aggregate.ts:77-80`)은 **손으로 쓴 형태**라
> 같은 약점이 있다. **본 계획에서 바꾸지 않는다**(Surgical Changes — 요청 범위 밖). 키 **이름**만 맞춘다.

**소비자 전수 (실측)** — 컴파일러가 잡지 못하는 것은 없다(전부 타입 참조):

| 소비자 | 위치 | 작업 |
|---|---|---|
| 엔진 조립 | `stock-transfer-aggregate.ts:644-646` | 두 그룹 합산 → 그룹별 객체 |
| 결과 카드 | `StockAggregateSummaryCard.tsx:135-146` | 카드 1개 → **호별 2블록**(§102①1호·2호 라벨) |
| 별지84호 18-1행 | `StockFilingFormTableHelpers.ts:452-459` | `totalOffset` → 그룹 합. **행수 가드 `:699`도 같은 조건식** |
| anchor (형태 단언) | `loss-offset-102-2.anchor.test.ts:112·150·192·206·282` | **5건** `.stock` 경유로 |
| anchor (undefined 단언) | 같은 파일 `:85·168·316` | **3건 무변경** |

⚠️ **`:282`(M-8-3)는 단언이 «늘어난다»** — 기타자산 이익 + 주식 차손 조합이므로 구현 후
`stock: { 0, 5,000,000 }` **와** `real_estate_and_other_asset: { 0, 0 }`을 **둘 다** 단언해야
한 항목이 두 대상을 함께 지키던 구조가 반전에 취약해지지 않는다
(`feedback_shared_assertion_reversal_erases_sibling_net`).

### 6.2 Q-2 확정 — 섹션 삭제 + 번호 재배치

**현행 구조** (`Step3.tsx:188-560` 실측):

| 현행 n | 제목 | 분기 | **삭제 후** |
|---|---|---|---|
| ① `:189` | 필요경비 | 항상 | ① (무변경) |
| ② `:249` | 기본공제 (§103①) | 항상 | ② (무변경) |
| ③ `:309` | 이월결손금 통산 (PR-3 예정) | 항상 | **삭제** (`:307-313`) |
| ④ `:318` | 신고·납부 (소득세법 §118의15) | `isExitTax` | **③** |
| ④ `:344` | 신고 유형 (§105① · §110①) | `!isExitTax` | **③** |
| ⑤ `:463` | 가산세 (국세기본법 §47조의2·§47조의3·§47조의4) | `!isExitTax` | **④** |

두 개의 ④는 **상호배타 분기**라 번호가 겹쳐도 맞다. 삭제 후에도 그 관계를 유지한다.

> ✅ **셀렉터 영향 0건 — 열거가 아니라 «구조»로 확정**. `SectionTitle`(`Step3.tsx:45-54`)은
> 번호를 **자식 `<span>`** 안에, 제목을 **형제 텍스트 노드**로 렌더한다. RTL `getNodeText`는
> 요소의 **직계 텍스트 노드만** 이어붙이므로 **번호는 매칭 문자열에 애초에 들어가지 않는다** —
> 번호를 바꿔도 단언이 볼 수 없다. 실제 단언도 전부 제목 텍스트다:
> `e2e/stock-basic-deduction-gate.spec.ts:122` `getByText("기본공제 (§103①)")` ·
> `__tests__/components/stock-filing-type-gating.test.tsx:155·165` `/신고 유형 \(§105① · §110①\)/` ·
> `:156·167` `/신고·납부 \(소득세법 §118의15\)/`.
> **번호를 단언하는 테스트는 0건**이다(`feedback_selector_axis_has_three_forms` 네 형태 전수 확인).

⚠️ 그래도 **번호를 빼먹으면 ①②④⑤가 되어 사용자에게는 버그로 보인다.** 삭제와 재배치는
   **한 커밋**으로 묶는다.

### 6.3 Q-3 확정 — 그리고 실측이 하나 더 갈랐다

「세액(A) / 표시(B)」로 나누라는 결정은 그대로 따른다. 다만 실측 결과 **표시축이 다시 둘로
갈린다** — B-1·C는 엔진 변경에 **의존하지 않고**, B-2~B-6은 **A-5 타입에 의존**한다.
⇒ §5.0 3단 분할. 원하시면 PR-1과 PR-3을 합쳐도 된다(둘 다 표시·저위험).

### 6.4 V-n 레지스터 (Do 중 검증 — 추정으로 착수 금지)

| # | 항목 | 확인 방법 |
|---|---|---|
| **V-1** | ~~기타자산 §104①9호가 「같은 세율」 축을 성립시키는지~~ | ✅ **해소 (검토 2026-09-12)** — §6.6 |
| **V-2** | 기타자산에 **감면소득금액**(영 §167의2②)이 발생할 여지가 있는지 | 조특법 감면 조문 전수 — 주식과 같은 근거로 무해한지 확인. 있으면 안분 로직 필요 |
| **V-3** | `finalizeStockTax`를 기타자산 분기에서 부르는 것이 현행과 **동일 결과**인지 (현행은 `calculateStockTransferTaxInternal` 내부에서 호출) | 가산세 없는/있는 픽스처 2건 대조 |
| **V-4** | §104⑤ `applied`(clause1 vs clause2)가 통산으로 **뒤집히는 케이스**가 있는지 | P-4 anchor 전후 대조 |
| **V-5** | 기타자산 차손 종목의 **증권거래세 echo**가 통산과 무관하게 유지되는지 | `totalSecuritiesTransactionTax` 전후 동일 단언 |
| **V-6** | **기타자산에 비과세가 성립하는가** — 주식은 M-9(K-OTC·장내 비대주주)가 `exempt` 축을 고정하는데 기타자산엔 대응 anchor가 없다. `offsetLossesCore`는 `exempt`를 통산에서 빼므로(상속증여세과-209) 축이 살아 있다면 anchor가 필요하다 | `stock-classification.ts`에서 `basicDeductionGroup === "real_estate_and_other_asset"` 이면서 `isExempt: true`가 되는 분기를 grep. **없으면 「해당 없음」으로 기록**하고 anchor를 만들지 않는다(불가능 시나리오 에러 핸들링 금지) |

### 6.5 레지스터 갱신 — **V-5 유지 · R-5 해소**

| # | 상태 |
|---|---|
| **V-5** (증권거래세 echo 유지) | 유지 — Phase D에서 단언 |
| **R-5** (이력 호환성) | ✅ **해소 — 마이그레이션 불필요**. `aggregateResult`는 store `partialize`에 **없고**(`calc-wizard-stock-store.ts:230-232` — `formData`·`savedItems`만), IndexedDB 이력은 단건 `result`만 저장한다(`StockTransferTaxCalculator.tsx:89` `resultData: result`). `lib/storage`에 `StockTransferAggregateResult` 참조 **0건**(실측) |

---

### 6.6 V-1 해소 — 「같은 세율」은 **세율 «표»** 축이다 (검토 2026-09-12)

영 §167의2①1호의 「같은 세율을 적용받는 자산」이 **과세표준에 따라 달라지는 누진세율**에서
어떻게 성립하는지가 착수 조건이었다. **저장소 안에 이미 답이 세 번 있다**:

| 근거 | 실측 |
|---|---|
| **부동산 정본 `RateGroup`** | `transfer-tax-aggregate-helpers.ts:32-37` — `"progressive"`(일반 누진 **6~45%**)가 **한 그룹**이고 `"non_business_land"`(**+10%p**)가 **별도 그룹**. 즉 **marginal rate가 아니라 세율 표**로 가른다 |
| **주식 축 자체** | `stock-transfer-rate-calc.ts:122` — `"20_25"`(§104①11호가목2) **20∼25% 누진**)를 **한 키**로 둔다. `loss-offset-core.ts:26-27`이 그 축을 별지 제84호서식 작성요령 4번 「주식등 종류코드란의 **세율이 같은 자산**을 합산」으로 근거지었다 |
| **기타자산 키가 이미 그 형태** | `resolveStockRateKey:104-111` — `other_asset_progressive`(§104①1호 = §55① 누진) / `other_asset_progressive_nbl`(§104①9호 = 기본세율 +10%p). §104⑤ 버킷 `"104-1-1"`/`"104-1-9"`와 **1:1** |

⇒ **기타자산 2키는 부동산 `progressive` ↔ `non_business_land` 쌍과 같은 모양**이다. 신규 판정 불요.

> 📌 이 해소로 **PR-2 진입 조건이 3개 → 2개**로 줄었다(§10).

---

## 7. 14 동기화 지점 판정

**신규 사용자 입력 필드는 0건이다.** 통산은 전적으로 파생 계산이다.

| 지점 | 판정 | 근거 |
|---|---|---|
| ① 폼 상태 · ② initial · ③ normalize | **무변경** | 입력 없음 |
| ④ API 변환 | **무변경** | `deductionMode: "aggregate"` 이미 고정 (`stock-transfer-tax-api.ts:618`) |
| ⑤ UI 위젯 | **변경** (B-1 **섹션 삭제+번호 재배치** · B-3 결과 표) — **입력 위젯 신설·삭제는 아님**(③은 정적 안내 div 하나였다 — `Step3.tsx:310-312` 실측) |
| ⑥ 사이드바 | **무변경** — 사이드바는 양도가액 합계 축이라 통산과 무관 (`StockSidebar.tsx:114`) |
| ⑦ 결과 카드 | **변경** (B-3 · B-4 · Q-1 결정 종속) |
| ⑧ validation | **무변경** — 신규 차단 조건 없음 |
| ⑨⑩ Zod enum | **무변경** |
| ⑪ 자산-수준 fallback | **무변경** |
| ⑫ Zod 입력 객체 | **무변경** (입력 없음) |
| ⑬ body spread | **무변경** |
| ⑭ Route 엔진 input 매핑 | **무변경** |

> ⚠️ **출력 타입은 14지점의 대상이 아니지만 소비자 동기화가 필요하다** — `lossOffset`
> 타입 변경(A-5/Q-1(b))의 소비자는 **역방향 grep으로 전수 확정**했다: 엔진 조립 1 ·
> `StockAggregateSummaryCard` 1 · `StockFilingFormTableHelpers` 2(행 + **행수 가드**) ·
> anchor 5. **전부 타입 참조라 `tsc`가 잡는다.** 이력 저장은 소비자가 **아니다**(§6.5 R-5).

---

## 8. 리스크

| # | 리스크 | 완화 |
|---|---|---|
| **R-1** | **echo 5필드 드리프트** (§4.3) — §104⑤ 크로스가 옛 `taxBase`를 읽어도 **주식 쪽은 아무 증상이 없다** | A-4 항등식 anchor. 부동산 크로스 경로 anchor도 함께 실행 |
| **R-2** | **패치 규약 전환 부작용** — `calculateStockTransferTaxInternal`이 채우던 다른 필드를 놓칠 수 있다 | 전환 전후 **결과 객체 전 키 diff**를 픽스처 3건으로 실측(차손 0 케이스는 **완전 동일**해야 함 = P-3) |
| **R-3** | **anchor 기대값 변경을 「테스트 약화」로 오해** | 세액 변경은 **법령 정합 재산정**이다(`feedback_anchor_correction_legal_priority`). 커밋 메시지에 §102②·영 §167의2① 축자 근거 명기 |
| **R-4** | **세액이 줄어드는 변경** — 납세자 유리 방향이라 검증이 느슨해지기 쉽다 | 「유리/불리」는 판단 근거가 아니다(`feedback_no_unfavorable_application_without_legal_basis`의 대칭). §1 축자만이 근거 |
| **R-5** | ~~Q-1(b) 이력 호환성~~ | ✅ **해소 — 실측**. `aggregateResult`는 sessionStorage partialize에 없고 IndexedDB 이력은 단건 `result`만 저장한다. 마이그레이션 불필요(§6.5) |
| **R-6** | **모집단을 좁게 세는 것** — 「기타자산」 픽스처를 `isQualifyingBlockShareholder` 하나로만 만들면 `other_asset_heavy_re`(부동산과다보유법인) 경로를 못 본다 | 4개 `taxCategory`(과점주주 ×2 · 부동산과다 ×2)를 **열거**해 픽스처를 만든다 (`feedback_enumerate_forms_vs_conservative_superset`) |

---

## 9. 비스코프 (본 계획에서 다루지 않음)

- **부동산 ↔ 기타자산 크로스 통산** — §102①1호는 원래 한 그룹이지만 두 엔진이 분리돼 경로가
  없다. `docs/00-pm/cross-engine-104-5-real-estate-other-asset.plan.md:471`의 「더 뒤」를 승계 (§4.5)
- **`deductionMode: "each_item"` 경로** — 클라이언트가 보내지 않는다(§0.1). route가 받을 수
  있을 뿐이라 통산 미적용이 정상 동작이다
- **국외주식 가산세** — `basicDeductionGroup: "stock"`이라 통산은 정상 적용되나, 가산세 0 고정은
  별건(`foreign-stock-aggregate-adapter.ts:27-30`이 「기존 갭」으로 명시)
- **§102①3호·4호 그룹**(파생상품·신탁수익권) — 이 엔진의 범위 밖

---

## 10. Do 진입 조건 / 완료 기준

**진입 조건**

| PR | 조건 | 상태 |
|---|---|---|
| **PR-1** | 없음 — Q-2 확정으로 매핑표(§6.2)까지 나왔다 | ✅ **완료 (2026-09-12)** — §10.1 |
| **PR-2** | ① Q-1 형태 확정(§6.1) ② **V-1** 해소(§6.6) ③ Phase 0 anchor 4건 — **P-1 RED** 확인 | ✅ **완료 (2026-09-12)** — §10.2 |
| **PR-3** | PR-2 머지 | ✅ **완료 (2026-09-12)** — §10.3 |

> ✅ Q-1·Q-2·Q-3 사용자 결정은 **2026-09-12 전건 확보**(§6).

**완료 기준**
1. Phase D **D-1~D-7 전건**
2. 🔴 **D-2**(M3 재실행 시 M-8-1 RED) — 이것이 「구현이 실제로 소비된다」는 유일한 증거다
   (`feedback_fixed_layer_vs_consumed_layer`)
3. **렌더되는** 문자열에 「PR-3」·「이월결손금」 **0건**
   > ⚠️ **초판 정정** — 초판은 「Step3 화면에 … 0건(역방향 grep)」이라고 썼는데, **소스 grep으로는
   > 판정할 수 없다**. 삭제 자리에 남긴 JSX 주석(`{/* … */}`)이 그 두 단어를 **의도적으로**
   > 포함한다(왜 지웠는지의 기록 — 없으면 다음 사람이 되돌린다). 주석은 React가 렌더하지 않는다.
   > ⇒ 판정은 **렌더 결과**로 한다: anchor **SS-5**가 `container.textContent`를 단언한다.
4. **A-6 4곳 전부** 정정 — 「범위 밖」뿐 아니라 `:343`(「주식 그룹만 갈아끼우고」)·
   `:585-586`(「통산 미적용이라 음수가」)까지. 다음 grep이 **0건**이어야 한다:
   `grep -n "주식 그룹만 갈아끼우고\|통산 미적용\|범위 밖\|아직이라" lib/tax-engine/stock-transfer/stock-transfer-aggregate*.ts`

---

### 10.1 PR-1 완료 기록 (2026-09-12)

워크트리 `.claude/worktrees/stock-102-2-loss-offset` · 베이스 `58bbc045` (부록 C).

| 항목 | 결과 |
|---|---|
| **B-1** 섹션 ③ 삭제 + 번호 재배치 | ✅ ① ② ③(×2 상호배타) ④ |
| **B-1a** 신규 anchor SS-1~SS-5 | ✅ 5/5 GREEN · **뮤테이션 RED 실증**(④→⑤ ⇒ SS-1·SS-3) |
| **C-1·C-2·C-3** 문서 정정 | ✅ 3파일 |
| `npx tsc --noEmit` | ✅ **0건** |
| `npm run lint` | ✅ **0 errors** (warning 336 = 기존 baseline, 전부 `scripts/`). `eslint Step3.tsx` 단독 exit 0 |
| `vitest __tests__/components/ __tests__/calc/` | ✅ **631파일 5,412테스트 전건 통과** |
| E2E (포트 3210 격리) | ✅ **17/17** — `stock-basic-deduction-gate`·`stock-multi-item-aggregate`·`stock-penalty-filing-unit`·`stock-transfer-securities-tax`. **exit code 0으로 판정**([[feedback_playwright_summary_last_passed_line_hides_failures]]) |

> 🔑 **세액 불변 확증** — 변경은 JSX 섹션 하나 삭제 + `n={}` 리터럴 3개뿐이다.
> 엔진·④변환·⑧validate·⑫Zod·⑭route 어디도 건드리지 않았고, 5,412테스트가 그것을 증명한다.

---

### 10.2 PR-2 완료 기록 (2026-09-12) — 🔴 세액 변경

**기타자산 그룹(§102①1호)이 §102② 통산을 타기 시작했다.**

| 단계 | 결과 |
|---|---|
| **Phase 0** anchor M-10-0~6 (7건) | ✅ 착수 시 **4 RED**(M-10-1·2·3·5) + **3 GREEN 대조군**(M-10-0 픽스처 가드 · M-10-4 차손 없음 불변 · M-10-6 §104⑤ MAX 불변) |
| **A-1** 그룹별 코어 2회 호출 | ✅ `groupIdx` + `runOffset` |
| **A-2** 기타자산 패치 규약 | ✅ `processOtherAssetItem` (분리 파일) |
| **A-4** §104⑤ echo 5필드 | ✅ M-10-5가 고정 |
| **A-5** `lossOffset` 호별 `Record<>` | ✅ 소비자 **5곳**(엔진 조립 · 결과 카드 · 신고서 18-1 · anchor 5건) — **전부 `tsc`가 잡았다** |
| **A-6** stale 주석 4곳 | ✅ |
| **A-7** 800줄 | ✅ 781 → **721**(신규 파일 120줄) |

**세액 변화 (실측)** — 기타자산 2건, 이익 +1,000만 / 차손 −500만:

| | 구현 전 | 구현 후 |
|---|---|---|
| 합산 과세표준 | 7,500,000 | **2,500,000** |
| 산출세액 | 450,000 | **150,000** |
| `lossOffset` | `undefined` | `{ stock: {0,0}, real_estate_and_other_asset: {5,000,000, 0} }` |

**검증**

| 게이트 | 결과 |
|---|---|
| `tsc --noEmit` | ✅ 0건 |
| `npm run lint` | ✅ 0 errors (warning 336 = 기존 baseline) |
| **vitest 전건** | ✅ **2,015파일 21,098테스트** 통과 (skipped 13 · todo 4) |
| stock 도메인 | ✅ 350파일 3,700테스트 |
| E2E (포트 3210) | ✅ **23/23**, `exit 0` — multi-item-aggregate · basic-deduction-gate · penalty-filing-unit · securities-tax · foreign-stock-da · item-table-view |
| 🔴 **D-2 게이트 (M3)** | ✅ **통과** — 기타자산 코어 필터를 열자 **M-8-1이 RED**. 착수 전에는 같은 뮤테이션에 **아무 반응이 없었다**(§3). 「구현이 실제로 **소비된다**」는 증거다 |

> 🔑 **D-2가 이 PR의 핵심 증거다.** A-1만 고치고 A-2를 빼먹으면 코드는 그럴듯한데 세액은
> 1원도 안 바뀐다 — 그 상태를 구별하는 것은 M3뿐이다
> ([[feedback_fixed_layer_vs_consumed_layer]]).

---

### 10.3 PR-3 완료 기록 (2026-09-12) — 표시 (세액 불변)

**엔진이 계산해 놓고 버리던 종목별 흡수 차손을 드러냈다.**

| 항목 | 결과 |
|---|---|
| **B-2** 엔진 echo | ✅ `StockTransferResult.lossOffsetFromSameGroup?` / `…FromOtherGroup?` — 부동산 정본과 같은 이름·양수 규약. `applyOffset`/`lossOffsetEcho` 로 3개 반환 지점(주식·국외·기타자산)에 실었다 |
| **B-3** 결과 카드 | ✅ 종목별 표의 **양도소득금액 셀 아래** 서브라인. 열을 늘리지 않았다 |
| **B-4** 별지84호 18-1행 | ✅ 종목 열 `null` → 흡수액. **행 수는 그대로** |
| **B-5** G-3 | ✅ PR-2로 자동 해소 — 표시 코드 변경 **0줄** |
| **B-6** 금액 정렬 | ✅ 상위 셀의 `font-mono tabular-nums` 상속 |

**신규 anchor 17건** — M-11-1~6(엔진) · AS-5-1~4·AS-6-1~3(카드) · FF-4-1~4(신고서).

> 🔑 **뮤테이션으로 구별력 실증** — 주식 분기의 `...lossOffsetEcho(i)` 2곳을 지우니
> **M-11-1·2·6 이 RED**. M-11-3(기타자산)은 다른 반환 지점이라 GREEN으로 남았고, 그것이
> **분기별 독립성**을 그대로 보여준다.

**설계 결정 — 왜 `optional`인가**

`0`을 채우면 「0원 흡수」와 「통산 자체가 없음」이 구분되지 않는다. 결과 카드·신고서가 둘 다
`> 0` 게이팅을 쓰므로 표시상으로는 같아 보이지만, **차손을 준 종목**(흡수 0)과 **단건 계산**
(통산 개념 자체가 없음)은 의미가 다르다. anchor M-11-4·5가 그 구분을 고정한다.

**검증**

| 게이트 | 결과 |
|---|---|
| `tsc --noEmit` | ✅ 0건 |
| `npm run lint` | ✅ 0 errors |
| **vitest 전건** | ✅ **2,015파일 21,115테스트** (PR-2 대비 +17 = 신규 anchor) |
| E2E (포트 3210) | ✅ **23/23**, `exit 0` |

> ⚠️ **800줄 경보** — `stock-transfer-aggregate.ts` 721 → **750줄**(echo 배열 +29).
> 트리거(800)까지 **50줄**. 이번엔 분리하지 않았다(A-7에서 막 쪼갠 직후라 과분할 위험).
> **다음에 이 파일을 여는 작업은 분리를 먼저 검토할 것** — 이음매 후보는 STEP 1.5 통산 블록
> (`groupIdx`·`runOffset`·`applyOffset`·`lossOffsetEcho`, 약 60줄)이다.

---

## 부록 A — 재현 커맨드

```bash
# 기존 §102② anchor 28건 (baseline GREEN 확인)
npx vitest run __tests__/tax-engine/stock-transfer/loss-offset-102-2.anchor.test.ts

# G-2 실측 probe — §2 G-2 표의 기타자산 2건 픽스처를 throwaway test로 작성해 console.log 덤프.
#   픽스처 핵심: marketType "unlisted" + isQualifyingBlockShareholder:true (→ 기타자산)
#   ⚠️ vitest 는 기본이 silent 다. `--silent=false --reporter=verbose` 없으면 로그가 안 나온다.
npx vitest run <probe파일> --silent=false --reporter=verbose

# M1 (호 경계 안전망) — stock-transfer-aggregate.ts:328
#   .filter((x) => x.r.basicDeductionGroup === "stock")  →  .filter(() => true)
#   기대: 2건 실패 (M-8-3 · MA-02-02)
npx vitest run __tests__/tax-engine/stock-transfer/ __tests__/calc/

# M3 (구현 후 D-2 게이트) — A-1이 만든 otherAssetIdx 필터를 연다
#   .filter((x) => x.r.basicDeductionGroup === "real_estate_and_other_asset")  →  .filter(() => true)
#   기대: M-8-1 실패
# ⚠️ 원복은 파일 백업 복사로. `git checkout`은 커밋 안 된 작업 변경을 날린다
#    ([[feedback_mutation_probe_git_checkout_destroys_wip]])

# 도메인 회귀
npx vitest run __tests__/tax-engine/stock-transfer/ __tests__/calc/   # 349파일 3,676테스트 ≈ 38초
```

## 부록 C — 작업 워크트리 (2026-09-12 생성)

```
경로     .claude/worktrees/stock-102-2-loss-offset
브랜치   worktree-stock-102-2-loss-offset
베이스   58bbc045 (= origin/master, #1608 액면가 머지 직후 — HEAD 일치 실측)
E2E_PORT 3210   ← 이 워크트리 전용. 3000·3100~3106·3200·3402 는 다른 계획서가 쓴다
```

**격리는 «두 단계»다** ([[feedback_worktree_e2e_port_isolation]]):

1. 워크트리 생성 ✅
2. **`E2E_PORT=3210`** — 빼면 3000의 dev 서버(메인 트리)를 `reuseExistingServer`가 잡아
   **내 브랜치가 아니라 메인 작업 트리를 테스트**한다. 내가 안 건드린 도메인 spec이
   실패하면 거의 항상 이 문제다.

**셋업 실측**:

| 항목 | 상태 |
|---|---|
| `node_modules` | 워크트리에 **없었다** → `npm ci` 수행 (exit 0) |
| `.env.local` | 워크트리에 **없다** — 메인 트리에서 복사 (31줄). 없으면 `/law` 가 안내화면으로 떨어지고 Supabase 세율이 fallback 된다 ([[feedback_worktree_missing_env_local_server_gate]]) |
| 본 계획서 | 메인 트리에서 복사 (거기서는 untracked 였다) — **PR-1에 함께 커밋** |

**명령**:

```bash
# 도메인 회귀 (349파일 3,676테스트 ≈ 38초)
npx vitest run __tests__/tax-engine/stock-transfer/ __tests__/calc/

# E2E — 포트 격리 필수
E2E_PORT=3210 npx playwright test e2e/stock-multi-item-aggregate.spec.ts
# ⚠️ 요약의 마지막 `N passed` 줄만 보지 말 것 — `1 failed` 다음에 찍힌다. **exit code 가 정본**
#    ([[feedback_playwright_summary_last_passed_line_hides_failures]])
```

> ⚠️ **다른 워크트리를 건드리지 말 것** — `.wt-fv2`(액면가, #1608 로 머지됨)·
> `.claude/worktrees/task-a` 가 디스크에 남아 있다
> ([[feedback_worktree_domain_scope_stay_in_lane]]).

---

## 부록 B — 관련 문서

| 문서 | 관계 |
|---|---|
| `docs/02-design/features/stock-102-2-loss-offset-and-103-deduction-order.plan.md` | §102② 주식 그룹 구현 정본 (본 계획은 그 **기타자산 확장**) |
| `docs/00-pm/stock-transfer-pr3-followup-closeout.plan.md` | PR-3 본체 종결 확인 (§0.1의 출처) |
| `docs/00-pm/cross-engine-104-5-real-estate-other-asset.plan.md` | §104⑤ 크로스 — 크로스 통산은 여전히 별건 |
| `docs/02-design/features/stock-transfer-pr3-multi-asset.{engine,ui}.design.md` | PR-3 원설계 (일부 stale) |
