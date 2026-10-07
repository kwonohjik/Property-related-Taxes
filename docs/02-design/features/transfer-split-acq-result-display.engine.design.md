# 토지·건물 별개 취득 — 결과 표시 정합 (Phase C) · 엔진 설계

- 계획서: `docs/00-pm/transfer-split-acq-per-part-method.plan.md` §2.1(H-1·H-2·H-4) · §2.2(G-4) · §3(Phase C) · §6 · 결정표 Q-F
- 짝: UI 설계(`transfer-split-acq-result-display.ui.design.md`, transfer-tax-ui-senior 동시 작성 — **파일 충돌 없음**: 이 문서는 엔진 파일·엔진 anchor만 다룬다)
- Pre-Do anchor: `__tests__/tax-engine/transfer/split-acq-result-display.c.predo.anchor.test.ts` (활성 32 · skip 23 · todo 5)
- 상태: **설계 단계 — 코드 수정 0**. 워크트리 `Property-related-Taxes-c` · 브랜치 `feat/transfer-split-acq-result-display` · master `bf789b0d0`(PR #2038 B1 포함)에서 실측.
- 실측 방법: 폼 → ④(`callTransferTaxAPI` body 캡처) → Route(`POST`)를 vitest에서 끝까지 돌리는 throwaway probe(`axis-b-commercial.anchor.test.ts` 패턴, mock 세율). 엔진 직접 호출 probe 병행. **probe 6종은 삭제했다**(남은 파일은 anchor 1개뿐). 수치는 mock 세율표 기준이고 fixture는 가상이다.

---

## 0. 결론

| # | 결론 | 근거 |
|---|---|---|
| 1 | **H-2는 master에서도 유효하다. 그리고 계획서보다 넓다.** 「감정·환산 조합」만이 아니라 **split 경로 전체**(실가/실가 포함)가 「양도가 − 취득가(0) − 경비(0)」를 찍는다 | §2.1 — 6조합 × 2시나리오 12건 전부 |
| 2 | 장기보유 문구는 `× 0%`·**건물 보유연수 하나**(「보유 7년×2% = 0%」)이고, 표2에서는 보유·거주 **sub-step의 금액**까지 건물 연수 단일율로 안분돼 **신고서와 다른 값**을 낸다(보유분 76,816,000 vs 신고서 split-2col 로직을 독립 재현한 87,916,000 — 화면 렌더 실측은 아님, V-C7) | §2.1·§2.3 |
| 3 | 이 문구는 **렌더된다** — 상세명세서 「전체 양도차익」·「장기보유특별공제」·보유/거주분 행(기본 펼침)·「전체 엔진 계산 과정」(인쇄 시 항상 표시)·다건 자산별 행. **우선순위를 낮출 근거가 없다** | §3 |
| 4 | 일반건물(general_building) 별개 취득은 **해당 없음**(파트 카드가 각각 단건 계산이라 6조합 정합 실측). **겸용(B1)** `MixedUseStep` 문구는 부정확하지만 **어떤 결과뷰도 렌더하지 않는다**(어댑터가 `steps: []`) → 수정 보류 권장 | §2.4·§6 |
| 5 | 수정은 **엔진 steps 문구 규격 + 보유/거주 sub-step 금액 정정 + 파트 echo 4필드 + leaf 2함수**. **세액 불변**(표시 전용). 결과 단일 플래그(`usedEstimatedAcquisition`·`expenses`·`longTermHoldingRate`)의 의미는 **바꾸지 않는다** | §4 |
| 6 | 조사 중 **별건 3건** 발견: **F-1**(split 장특 파트 공제액 부동소수 1원 과소 — 실엔진 재현), F-2(결과 단일 `swapApplied` 미채움), F-3(PDF 「장기보유특별공제 (0%)」) | §5 |
| 7 | 사용자 결정 **Q-C1~Q-C8** — 권장안 포함(§9) | §9 |

---

## 1. 실측 요약표 (H-2) — 현행 문구 vs 금액

### 1.1 fixture

양도 2026-07-01 · 토지 취득 2011-06-01(보유 15년) · 건물 취득 2019-06-01(보유 7년) · 양도시 기준시가 토지:건물 = 3:1 → 양도가 토지 675,000,000 / 건물 225,000,000 · 취득시 기준시가 토지 150,000,000(㎡당 1,000,000 × 150㎡) / 건물(나목) 50,000,000.
**N**: 다주택 비조정(표1, 안분 없음) · **H**: 1세대1주택 · 양도 15억(토지 1,125,000,000 / 건물 375,000,000, 양도시 기준시가 450M:150M) · 거주 84개월(표2, 12억 초과 안분).
body 실측(폼 → ④): `useEstimatedAcquisition:false` · `acquisitionPrice:0` · `expenses:0` · `isSeparateAcquisition:true` — **파트 모드가 환산이어도 자산 단위 플래그는 false**다(`transfer-tax-api.ts:345` `isEstimated`는 상단 라디오 값이고 별개 취득에서 상단 라디오는 숨는다).

### 1.2 시나리오 N — 금액(정상) vs 현행 문구

| 조합(토지/건물) | 양도차익(금액) | 장특 합(금액) | 현행 「양도차익 계산」 문구 | 현행 「장기보유특별공제」 문구 |
|---|---:|---:|---|---|
| A 실가/환산 | 586,000,000 | 158,040,000 | `양도가(900,000,000) - 취득가(0) - 경비(0)` | `586,000,000 × 0% \| 보유 7년×2% = 0% (30% 한도) \| 보유기간 7년 1개월` |
| B 환산/실가 | 408,000,000 | 110,400,000 | 동일 | `408,000,000 × 0% \| …` |
| C 환산/환산 | 444,000,000 | 115,440,000 | 동일 | `444,000,000 × 0% \| …` |
| D 감정/실가 | 535,500,000 | 148,650,000 | 동일 | 동일 형식 |
| E 매매사례/환산 | 571,500,000 | 153,690,000 | 동일 | 동일 형식 |
| F 실가/실가 | 550,000,000 | 153,000,000 | 동일 — **파트 모드 조합과 무관** | 동일 형식 |

금액 분해(독립 산식으로 검산 — anchor R-1): A = 토지 475,000,000(30% → 142,500,000) + 건물 111,000,000(14% → 15,540,000).
문구를 그대로 계산하면 양도차익은 900,000,000이고 공제율은 0%다. **어느 숫자도 금액을 만들지 못한다.**

### 1.3 시나리오 H(표2) — sub-step 금액

| 조합 | 장특 합 | **현행** 보유분 / 거주분 (sub-step) | **파트 합(정상)** 보유분 / 거주분 | 비고 |
|---|---:|---|---|---|
| A | 153,632,000 | 76,816,000 / 76,816,000 | **87,916,000 / 65,716,000** | 토지 15년(보유 40%+거주 28%) · 건물 7년(28%+28%) |
| B | 126,588,000 | 63,294,000 / 63,294,000 | 72,240,000 / 54,348,000 | |
| C | 129,220,000 | 64,610,000 / 64,610,000 | 73,556,000 / 55,664,000 | |
| D | 149,028,000 | 74,514,000 / 74,514,000 | 85,440,000 / 63,588,000 | |
| E | 151,660,000 | 75,830,000 / 75,830,000 | 86,756,000 / 64,904,000 | |
| F | 151,000,000 | 75,500,000 / 75,500,000 | 86,600,000 / 64,400,000 | |

**합은 항상 같다**(배분만 틀렸다). 현행은 총액 × 28/56(건물 7년 기준 한 가지 율)이다.

---

## 2. 불일치 지점 — file:line + 실측값

### 2.1 단계 문구 (`result.steps`)

| # | 위치 | 원인 | 실측 |
|---|---|---|---|
| S1 | `transfer-tax-taxable-gain.ts:138-143` (else 갈래) | `buildGainFormula`가 `effectiveInput.acquisitionPrice`(=0)·`appliedExpenses`(=직접경비 합)를 쓴다. 호출은 `transfer-tax.ts:386-394` | N·H 12건 전부 `취득가(0)` — 금액 586,000,000 vs 문구값 900,000,000 |
| S2 | `transfer-tax-helpers.ts:313·322·325` | split 반환의 `expenses`는 **직접경비 합만**(개산공제 `estimatedDeduction`은 별도 필드이고 `transfer-tax.ts:346`이 받지 않는다) | 건물 환산 개산공제 1,500,000이 문구에 없다 · 자본적지출 5,000,000만 있으면 `경비(5,000,000)` (금액 581,000,000 = 900M − 312.5M − 6.5M) |
| S3 | `transfer-tax-helpers.ts:314-320` | `usedEstimated`가 **자산 단위 입력 플래그**에서만 온다(split 파트 모드를 안 본다) | 파트가 환산이어도 `usedEstimatedAcquisition:false`·`estimatedBase:0` → 환산 갈래(`:132-137`)로 안 간다 |
| S4 | **PHD**(§164⑤) `transfer-tax-split-gain.ts:385-` | PHD는 `useEstimatedAcquisition:true`라 환산 갈래를 타지만 `경비`는 S2의 직접경비 합 | `양도가(715,000,000) - 취득가(환산 552,874,340) - 경비(개산공제 0)` — 개산공제 실제 **14,544,847**(양도가 − 환산취득가 − 양도차익 항등식). 취득가 합은 정확, **경비가 틀렸다** |
| S5 | 소유자 분리 `transfer-tax.ts:395-401` + S1 | 「본인 신고분」 step 뒤 양도차익 문구는 일괄 총액 | `selfOwns=land_only`: `양도가(900,000,000) - 취득가(0) - 경비(0)` = **475,000,000**(토지 파트만) |
| S6 | `transfer-tax-split-gain.ts:275-276` · S1 | §97②2호 단서(swap) 파트는 취득가를 차감하지 않는데 문구는 모른다 | 건물 자본적지출 150,000,000: `…취득가(0) - 경비(150,000,000)` = 550,000,000 — **문구와 금액이 우연히 같아** 보이지만 토지 취득 200,000,000이 빠졌다(900M − 150M = 750M ≠ 550M) |
| L1 | `transfer-tax-lthd-steps.ts:138` + `transfer-tax-lthd.ts:424` | split 분기가 `rate: 0`을 돌려준다(「단일 공제율 없음」) → `Math.round(rate*100)%` = 0% | 전 조합 `× 0%` |
| L2 | `transfer-tax-lthd-steps.ts:88-90` · `transfer-tax-lthd.ts:418-425` | 보유기간·연수가 **건물 취득일 기준 하나**(`anchorDate`) | 토지 15년 파트의 공제를 「보유 7년」으로 설명 |
| L3 | `transfer-tax-lthd-steps.ts:129-131` | 표1 문구 `보유 N년×2% = r%` — 위 0%·건물 연수 | `보유 7년×2% = 0% (30% 한도)` (금액은 30%·14%의 합) |
| L4 | `transfer-tax-lthd-steps.ts:130` (표2) | 같음 | `보유 7년×4%=28% + 거주 7년×4%=28% = 0%` (토지 실제 40%+28%=68%) |
| L5 | `transfer-tax-lthd-steps.ts:155-177` (sub-step) | `holdingPct`·`residencePct`가 **건물 연수 단일값**(`:106-117`)이고 총액을 그 비로 안분 | §1.3 — 금액이 파트 합과 다르다. **문구가 아니라 금액**이다 |

### 2.2 변하지 않은 것(정합 확인)

- `과세 양도차익 (12억 초과분)` step(`transfer-tax-taxable-gain.ts:95-100`)은 합계 기준이라 정합하다(anchor R-8, 독립 산식 일치).
- `양도소득금액`·`기본공제`·`과세표준`·`산출세액`(파트별 세율 §104⑤ 문구 포함)·`지방소득세`는 split-aware이거나 합계 기준으로 정합하다.
- `buildingStandardPriceAtAcquisition` 등 입력은 건드리지 않는다.

### 2.3 추가 확인(계획서에 없던 것)

- **`propertyType: "building"`(건물, 토지 제외)도 같은 `calcSplitGain` 경로**라 문구가 같다(6조합 실측 — 같은 12건).
- **1원 경계**: 12억 초과 안분을 파트별로 floor하므로 Σ 파트 과세 양도차익이 `taxableGain`과 **1원** 다를 수 있다. 실측 — 양도 1,500,000,001 · 토지 취득 200,000,001 · 건물 취득 150,000,003: Σ 파트 229,999,999 ≠ 전체 230,000,000, 장특은 파트 값 기준(anchor R-10). **문구는 「파트 합 = 전체」를 단정하면 안 된다.**
- **부동소수 float 불일치 위험**: 신고서 split-2col(`FilingFormTableHelpers.ts:627-629`)은 파트 공제액을 `splitLtDeduction`(**float** `totalAmount × residenceRate ÷ totalRate`)으로 다시 안분한다. 엔진은 정수 분수연산으로 낼 것이므로 무작위 격자에서 **약 2.8%(5,534/198,324)** 가 1원 갈린다(함수 재현 — 실화면 실측 아님). §4.4 E-1을 신고서가 소비하면 닫힌다(Q-C4).

### 2.4 해당 없음 확인

| 대상 | 결과 |
|---|---|
| 일반건물(`general_building`) 별개 취득 6조합(AA·AE·EA·EE·감정/실가·매매사례/환산) | 각 파트 카드가 **독립 단건 계산**이라 문구 정합(`양도가(1,956,162,578) - 취득가(270,936,645) - 경비(3,825,000)` 등 — 취득가·경비 값은 환산/개산공제 값이 들어 있고 합이 맞다). 다만 환산 파트에 「환산」·「개산공제」 어휘가 없을 뿐이다(수치는 맞다). **엔진 변경 0** |
| 일반건물 카드 echo | `assetCards[].acquisitionMode`가 4모드 전부 실재(감정 `appraisal`·매매사례 `salesCase` 실측) — **Q-F(UI 거짓 등식 가드)에 필요한 엔진 값은 이미 있다** |
| 일반건물 `usedEstimatedAcquisition`(G-4) | `assetCards[].usedEstimatedAcquisition`는 실재(환산 파트 true). **집계 단계에는 없다** — `aggregateToFilingResult`(`BundledAllocationCard.tsx:70`)가 `usedEstimatedAcquisition: false`를 **하드코딩**하고 `AggregateTransferResult`에도 필드가 없다. G-4의 뿌리는 UI 어댑터다(다건 `MultiTransferTaxResultView.tsx:561`도 같은 어댑터). §4.7 E-3 참조 |

---

## 3. steps 소비처 전수 (결과뷰 4개 + PDF)

`steps`는 **단건 엔진이 만든 CalculationStep[]** 이고 다건(`transfer-tax-aggregate-asset-records.ts:648` `steps: r.result.steps`)·컴패니언(`BundledAllocationCard.tsx:104` `steps: a.steps`)이 그대로 싣는다 — **엔진에서 고치면 세 경로가 한꺼번에 고쳐진다.**

| 결과뷰 | 컴포넌트:줄 | 읽는 step · 용도 | 화면 노출 | 이 문구가 깨지는가 |
|---|---|---|---|---|
| **단건 결과 카드 + 상세명세서** | `TransferTaxResultView.tsx:362` → `DetailedCalculationStatementCard.tsx` | ① `DetailedStatementHelpers.ts:366·371-376` 「전체 양도차익」 행 `formula = gainStep.formula` ② `DetailedStatementLthdItems.ts:71-83` 「장기보유특별공제」 행 `lthStep.formula` ③ `:133-134·202-216` 보유/거주 기간분 행 `value = sub-step.amount`·`formula` ④ `DetailedCalculationStatementCard.tsx:178·193-250` 「전체 엔진 계산 과정」 전 step | 그룹 **기본 펼침**(`:90-91`) · 엔진 step 토글은 접힘이나 **인쇄 시 항상 표시**(`:209·216` `hidden print:block`) | **예 — ①②③④ 전부** |
| **신고서 표** | `FilingFormTableHelpers.ts:605-650` | **step 문구는 읽지 않는다.** sub-step은 단일열 분기에서만(`resolveLthdSplit`·`isTable2Applied` — **존재·`거주분>0`이 표2 신호**). split-2col 분기(`:627-629`)는 파트값으로 **자체 재안분(float)** | 값만 | 문구 영향 0. **sub-step 라벨·존재·`거주분>0` 계약은 유지해야 한다**(anchor R-5·R-6) |
| **상세명세서(다건)** | `MultiTransferTaxResultView.tsx:569` → 같은 카드 | 합산 step만 | 기본 펼침 | split 문구 직접 영향 없음 |
| **다건 자산별 행** | `MultiTransferPropertyBreakdown.tsx:196-197·279-301` | `breakdown.steps` 첫 일치 `양도차익`·`장기보유특별공제` `formula`를 `DetailRow`에 | 카드 펼침 시 · **인쇄 CSS-only 항상 표시**(`:268-272`) | **예** (자산별 split 문구) |
| **컴패니언(함께양도)** | `BundledAllocationCard.tsx:104·450` → 같은 카드 | `steps: a.steps` 전체 | 기본 펼침 | **예** (코드 확인 — 화면 실측 미수행) |
| **겸용 결과 카드** | `MixedUseResultCard.tsx:150` ← 어댑터 `MixedUseResultCardAdapter.ts:122` | **`steps: []`** | — | **해당 없음** — `MixedUseStep`은 어떤 컴포넌트도 읽지 않는다(`components/`·`lib/print/` grep 0건) |
| **PDF**(`downloadSelectedPdf`) | `lib/pdf/ResultPdfTransferSections.tsx:67` | step이 아니라 **`r.longTermHoldingRate`** | 「장기보유특별공제 (0%)  - 158,040,000」 | split에서 `rate:0` → **F-3**. step 변경으로는 안 닫힌다(§5) |

**렌더되지 않는 문구**: 겸용 `MixedUseStep` 5종(`step-2/5/6/7/9`)뿐이다. 나머지는 모두 화면·인쇄에 나온다 → **우선순위 낮출 근거 없음.**
**1단 확인 사항**: 문구를 바꿔도 **step 개수·순서·라벨은 불변**이므로 `findStepByLabel` 첫 일치(`양도차익`·`장기보유`)·`prorationFormulaAsFrac`·`isTable2Applied`·`MultiTransferPropertyBreakdown`의 정규식(`/과세 양도차익 \(\d+억 초과분\)/`)은 그대로 동작한다(anchor R-7).
**FormulaText 주의**(`components/calc/results/shared/FormulaParts.tsx:43-45`): 문구 안 `숫자 / 숫자`가 **분수로 치환**된다. 새 문구는 `/`·`÷`를 쓰지 않는다.

---

## 4. 수정안 (엔진)

원칙: **엔진 산식·금액 불변. 문구와 표시용 echo만.** step 개수·순서·라벨 불변(새 step을 만들지 않는다 — 「N개 step」 표시·first-match 계약 보존). 조문 번호를 문구에 새로 넣지 않는다(신규 인용은 `legal-codes` 상수 + `verify:legal` manifest 등록 의무 — 이번 범위에서 새 인용 0).

### 4.1 「양도차익 계산」 규격 (`buildGainFormula` — split 분기)

```
양도가({토지 X} + {건물 Y}) - 취득가({파트 취득가 합}) - 경비({파트 경비 합})
```

- 파트 순서 토지 → 건물. 소유 파트만(`splitDetail.selfOwns` — `land_only`면 건물 제외). 합 항이 비면 `0`.
- **양도가**: `{파트} {part.transferPrice}`.
- **취득가**: `{파트} {태그} {part.acquisitionPrice}` — 태그 = 모드별 고정 어휘 `실지거래가`/`환산취득가`/`감정가`/`매매사례가`(`part.acqMode`). **§97②2호 단서(swap) 파트는 취득가 항에서 뺀다**(엔진이 `swapApplied ? 0 : acquisitionPrice`로 차감 — `transfer-tax-split-gain.ts:275-276`).
- **경비**: 파트당 **한 갈래만** 나온다(불변식 — `applyAssetSwap`: 실가는 직접경비만·비실가 비swap은 개산공제만·swap은 직접경비만. 동시에 둘이 양수일 수 없다 — 코드 확인).
  - `{파트} 자본적지출·양도비 {part.directExpenses}` (직접경비 > 0, swap 아님)
  - `{파트} 개산공제 {part.appraisalDeduction}` (> 0)
  - swap: `{파트} 자본적지출·양도비 {n} — 환산취득가액·개산공제 대신 적용`
  - 전부 0이면 `0`.
- 불변식: `양도가 합 − 취득가 합 − 경비 합 = 단계 amount`(항등식 — 파트 정의 `landGain = tp − (swap?0:acq) − direct − ded`와 같다). 문구를 글자 그대로 계산하면 금액이 나온다(anchor S-1~S-6, `evalGainFormula`).

예 — N:A: `양도가(토지 675,000,000 + 건물 225,000,000) - 취득가(토지 실지거래가 200,000,000 + 건물 환산취득가 112,500,000) - 경비(건물 개산공제 1,500,000)` → 586,000,000.
예 — swap: `양도가(토지 675,000,000 + 건물 225,000,000) - 취득가(토지 실지거래가 200,000,000) - 경비(건물 자본적지출·양도비 150,000,000 — 환산취득가액·개산공제 대신 적용)` → 550,000,000.

비-split(단건 일반) 문구는 **한 글자도 바꾸지 않는다**(`splitDetail` 없으면 종전 분기).

### 4.2 「장기보유특별공제」 규격 (`pushLongTermHoldingSteps` — split 분기)

파트별 **과세 양도차익 × 파트별 공제율 = 파트 공제액**의 합. 한 줄:

```
토지분 {part.taxableGainAfterProration} × {율}% = {part.longTermDeduction} ({사유}) + 건물분 … ({사유})
```

| 사유(파트별) | 형식 |
|---|---|
| 표1 | `보유 15년×2% = 30%, 30% 한도` |
| 표1 · 보유 3년 미만 | `보유 1년 — 3년 미만은 공제 없음` (율 0%) |
| 표2 | `보유 15년×4%=40% + 거주 7년×4%=28%` (율 = 합) |
| 표2 단일축 시기(2009~2020 양도, OH-31) | `표2 보유 15년×8% = 80%, 80% 한도 — 2020.12.31. 이전 양도분` |
| 배율초과 부수토지(비사업용 분리분) | `배율초과 부수토지분 {gain} × {율}% = {ded} (표1 보유 N년×2% = r%, 30% 한도)` 추가 항 |

- 소유 파트만. **`보유기간 N년 M개월`·`× 0%` 꼬리를 쓰지 않는다**(연수는 사유에 파트별로 있다).
- 율 = `Math.round(part.longTermRate × 100)`. 보유·거주 분해는 §4.4 echo(정수 %)에서 읽는다 — 표시 계층이 `calcLongTermRate`를 재구현하지 않는다.
- **「합 = 전체 과세 양도차익」 등식을 쓰지 않는다**(§2.3 1원 경계). 각 항은 **자기 값을 만든다**(`× 율 = 공제액`이 파트 정의 그대로).
- 표2 판정 플래그(`isOneHouseSpecial`·`singleAxisTable2`)는 **기존 표시 계층 로직 그대로**(자산 단위 — 두 파트 동일).
- **후퇴 가드**: 아래 중 하나라도 거짓이면 **종전 문구로 후퇴**한다(거짓말보다 종전이 낫다).
  1. `splitDetail`이 있고 소유 파트 전부에 echo가 있다
  2. Σ(소유 파트 공제액) + (배율초과분) = `longTermHoldingDeduction` — §98의2 특칙(`transfer-tax.ts:565-580` — `lthd982Applied`)이 총액을 재할당하는 경우를 거른다
  3. `usageConversionDetail`(§95⑤)은 split과 병용되지 않는다(`transfer-tax-lthd.ts:300` `!splitDetail`)·`fbLthdFormula`(가업상속)는 split 분기가 먼저 반환(`:371`~`:426` ↔ `:464`)해 채워지지 않는다 — **`lthd982Applied`는 병용 가능 여부 미실측(V-C3)이라 가드 2가 유일한 방어**
  - 후퇴 시 anchor T-3.

### 4.3 sub-step(「보유 기간분 장특」·「거주 기간분 장특」) — **금액 정정**

표2에서만 나온다(조건 `(isOneHouseSpecial || conv) && !singleAxisTable2 && 공제 > 0` 그대로). 라벨·`sub:true`·`legalBasis` **불변**. 금액·문구만 바뀐다.

```
보유 기간분 장특 = Σ 파트 보유분 · 문구: 토지분 74,000,000 (보유 15년×4% = 40%) + 건물분 13,916,000 (보유 7년×4% = 28%)
거주 기간분 장특 = Σ 파트 거주분 · 문구: 토지분 51,800,000 (거주 7년×4% = 28%) + 건물분 13,916,000 (거주 7년×4% = 28%)
```

- 파트 거주분 = `floor(파트 공제액 × 거주% ÷ (보유% + 거주%))`(정수 분수연산), 보유분 = 잔액 흡수 — 겸용 echo(`buildHousingLthdEcho`, `transfer-tax-mixed-use-inheritance.ts:64-95`)와 **같은 규약**(합 = 총액 불변식).
- 곱셈 등식(`185,000,000 × 40% = 74,000,000`)을 **문구에 쓰지 않는다** — 잔액 흡수로 1원 어긋날 수 있다. 금액과 율을 나란히 적을 뿐 `=`로 잇지 않는다.
- Σ보유 + Σ거주 = `longTermHoldingDeduction`(R-6 불변식). 값: §1.3 우열.
- **소비처 영향**: `DetailedStatementLthdItems.ts:202-216`(값·문구) — 자동 반영. `isTable2Applied`(`lthd-split-display.ts:46-`)는 거주분 `amount > 0` 신호 — 유지됨. 신고서 split-2col은 이 값을 안 읽는다(Q-C4).

### 4.4 echo — E-1 (`SplitPartResult`, optional 4필드, 표시 전용)

`types/transfer-split-gain.types.ts:55`의 `SplitPartResult`에 추가 — 이름은 겸용 echo와 동일(`transfer-tax-mixed-use-inheritance.ts:64`) → UI가 한 이름으로 읽는다.

```ts
holdingDeductionRate?: number;     // 보유기간분 공제율(표2: min(보유×4%,40%) · 단일축: 보유×8% · 표1: 총율)
residenceDeductionRate?: number;   // 거주기간분 공제율(표2만 > 0)
holdingDeductionAmount?: number;   // 보유분 공제액 = longTermDeduction − 거주분 (잔액 흡수)
residenceDeductionAmount?: number; // 거주분 = floor(longTermDeduction × 거주% ÷ (보유%+거주%)), 정수 퍼센트
```

- 채우는 곳: `transfer-tax-lthd.ts:371-402`(split 분기 — `splitDetail.land.longTermRate/Deduction`을 이미 역기입하는 자리). 보유분 율은 **`calcLongTermRate(years, 0, useTable2, false, transferDate)`**(공제율 정본 — 거주 0으로 부르면 보유분만 나온다), 거주분 율 = 총율 − 보유분 율(**정수 %로 환산한 뒤 뺀다** — `0.68 − 0.4` 같은 float 뺄셈 금지).
- 소유하지 않는 파트·배율초과분(표1 전용)은 채우지 않는다(`undefined`).
- 구 `resultData`(IndexedDB 이력)에는 없다 → **소비처는 `undefined`를 견딘다**(문구는 저장된 step 텍스트라 이력은 옛 문구 유지, 재계산 시 신규).
- 직렬화: Map 없음·number만 — JSON 소실 위험 없음. `transfer-tax-aggregate-pickers.ts:48`이 `splitDetail`을 통째 복사하므로 다건 자산별로도 따라간다.

### 4.5 leaf — E-2 (`lib/tax-engine/transfer-tax-split-display.ts`, 신규 ~120줄, 순수)

| export | 시그니처 | 소비 |
|---|---|---|
| `summarizeSplitGain` | `(sd: SplitGainResult) => { transferPrice; acquisitionDeducted; necessaryExpense; gain; parts: {key:'land'\|'building'; label; mode; transferPrice; acquisitionPrice; acquisitionDeducted; directExpenses; appraisalDeduction; swapApplied; gain}[] }` — 소유 파트만, `acquisitionDeducted = swap ? 0 : acquisitionPrice`, `necessaryExpense = Σ(direct + ded)` | 엔진 문구(§4.1) **+ UI H-1(상세명세서 취득가액·필요경비 행)** — 같은 정의를 쓰면 dual-truth가 없다 |
| `buildSplitGainFormula` | `(sd) => string` | `buildGainFormula` |
| `buildSplitLthdFormula` | `(args: {sd; isTable2; singleAxis; residenceYears}) => string \| null` — 가드 실패 시 `null`(호출부가 종전 문구) | `pushLongTermHoldingSteps` |
| `buildSplitLthdSubFormulas` | `(…) => {holding: {formula, amount}, residence: {formula, amount}} \| null` | 같음 |

`summarizeSplitGain`의 불변식: `gain = Σ part.gain`(= `transferGain`, 소유 파트 기준) · `양도가 합 − acquisitionDeducted − necessaryExpense = gain`.
UI는 import해서 쓰는 것을 권장(Q-C4). **이 leaf를 쓰지 않아도 §4.1~§4.3 문구는 완결**이다(UI 설계가 다른 길을 택해도 막지 않는다).

### 4.6 변경 파일 (Do 예고 — 지금은 수정 안 함)

| 파일 | 변경 | 줄 수 영향 |
|---|---|---|
| `types/transfer-split-gain.types.ts` | `SplitPartResult` +4 optional | 195 → ~215 |
| `transfer-tax-lthd.ts:371-402` | split 분기에서 echo 산출(+~15줄) | 589 → ~605 |
| `transfer-tax-split-display.ts` | **신규** leaf | ~120 |
| `transfer-tax-taxable-gain.ts` `buildGainFormula` | `splitDetail?` 인자 + 위임 분기 | 146 → ~160 |
| `transfer-tax-lthd-steps.ts` `LthdStepArgs` | `splitDetail?` + split 분기 | 180 → ~215 |
| `transfer-tax.ts:386·581` | 두 호출에 `splitDetail` 전달(+2줄) | **745 → ~747** (≤750 위험구간 직전 — 더 얹지 말 것) |
| 주석 정정(§7 H-4) | `transfer-tax-split-gain.ts:53-56`·`transfer-tax-helpers.ts:328` 외 | — |

14지점: **입력 필드 신설 0** → ①~⑥·⑧~⑭ 해당 없음(⑧ validate 신규 규칙 없음). 결과 타입(echo)·⑦(UI가 소비하면 UI 설계 담당)만 걸린다.

### 4.7 UI와의 인터페이스 계약 (UI 설계서와 대조 필요)

| # | 항목 | 엔진 제공 | UI가 할 일(권장) |
|---|---|---|---|
| I-1 | 상세명세서 「전체 양도차익」·「장기보유특별공제」·보유/거주분 행 | step 문구·금액 정정 | **재도출하지 않는다** — `gainStep`/`lthStep` 그대로 읽는다(현행 코드 변경 0) |
| I-2 | H-1 취득가액·필요경비 행(`DetailedStatementFormulaBuilders.ts:539-541`) | `summarizeSplitGain`(E-2) 또는 `splitDetail.land/building` 직접 | split이면 파트별 취득가액·산정방식 태그 + 필요경비(개산공제) — **`result.usedEstimatedAcquisition`·`result.expenses`로 분기하지 않는다**(split에서 false/직접경비뿐이라 거짓 — R-4) |
| I-3 | 신고서 split-2col LTHD(`FilingFormTableHelpers.ts:627-629`) | echo 4필드(E-1) | float 재안분 대신 echo 소비(§2.3 2.8%) |
| I-4 | G-4 소제목(`:446-448·573-575`) | gb: `assetCards[].usedEstimatedAcquisition`·`acquisitionMode` **이미 실재** · 다건: **E-3(선택)** | `aggregateToFilingResult`의 `usedEstimatedAcquisition: false` 하드코딩 제거 — 파트/자산 echo에서 파생 |
| I-5 | PDF 「장기보유특별공제 (0%)」 | 없음(F-3) | split이면 율 대신 파트별 율 또는 율 생략 |

**E-3(선택)**: `PerPropertyBreakdown`에 `usedEstimatedAcquisition?: boolean`(= `r.result.usedEstimatedAcquisition`) 1줄(`transfer-tax-aggregate-asset-records.ts:648` 근처). 다만 split 자산에서는 이 값이 여전히 false이므로 **UI가 split 파트 echo와 함께 파생해야** 한다 — UI 설계에서 필요하다고 확정되면 추가. 엔진 단독으로는 넣지 않는다(Q-C5).

### 4.8 바꾸지 않는 것(명시)

- `usedEstimatedAcquisition`·`estimatedBase`·`expenses`·`longTermHoldingRate`·`swapApplied`(결과 단일 필드) — 의미 변경은 신고서·명세서·PDF·집계 소비처가 줄줄이 걸린다(Q-C5).
- 세액 산식·절사·기본공제·세율 — 전부.
- `MixedUseStep`(겸용) — 미렌더(Q-C6).

---

## 5. 별건 발견 (이번 Phase의 「문구만」 범위 밖)

| # | 내용 | 실측 | 권장 |
|---|---|---|---|
| **F-1** | **split 장특 파트 공제액이 부동소수로 1원 과소** — `transfer-tax-lthd.ts:391·392·412`가 `applyRate`(`Math.floor(금액 × 율)`)에 **double로 합산한 율**을 넘긴다. 같은 파일의 다른 지점(`:235·259·540·557·566·584`)은 D10-06(`applyLthdRate`, `:75-91`)으로 정수 분수연산을 쓰는데 **split 분기만 빠졌다** | 실엔진: 1세대1주택 · 토지 2017-06-01·건물 2017-07-01(보유 9년) · 거주 96개월 · 양도 30억. 율 `0.6799999999999999` → 토지 **652,799,999**(정확 652,800,000) · 건물 **448,799,999**(정확 448,800,000) · 합 1,101,599,998(정확 1,101,600,000). **2원 과소**. 함수 단독: `applyRate(2,596,851,600, calcLongTermRate(9,8,true,…)) = 1,765,859,087` vs 정확 …088 | **납세자 불리 방향 단방향**(D10-06 주석). Q-C2: 별 커밋으로 선행(`applyRate` → `applyLthdRate` 3곳). anchor `F-1`(skip 해제 + 현행 표식 삭제) |
| **F-2** | split 자산에서 **결과 단일 `swapApplied`·`swapComparison`이 비어 있다**(파트에만 `swapApplied`). 그래서 단건 카드의 「필요경비 swap 적용」 안내(`TransferTaxResultView.tsx:485-497`)가 split에서 안 뜬다 | 실측(건물 자본적지출 150,000,000): 파트 `swapApplied:true`, 결과 `swapApplied: undefined`(anchor D-0e). 낡은 주석 `transfer-tax-helpers.ts:328` 「calcSplitGain 내부 처리는 별도 PR」이 이 지점을 가리킨다 | **별건**. 계획서에 항목 추가 후 별도 판단 |
| **F-3** | PDF 「장기보유특별공제 (0%)」 — split에서 `longTermHoldingRate: 0`(`transfer-tax-lthd.ts:424`) | 코드 확인(`ResultPdfTransferSections.tsx:67`·`fmtRate(0)="0%"`). **PDF 렌더 실측 미수행** | UI/PDF 설계(I-5). 엔진이 유효율을 싣는 안은 **기각**(`longTermHoldingRate`는 `TransferTaxResultView.tsx:667`·`BurdenedTransferTaxResultCard` 등 소비처가 단일 공제율로 읽는다 — 의미 변경) |

---

## 6. 겸용(B1) 확인

- **`MixedUseStep` 5종**(`transfer-tax-mixed-use-steps.ts:243-340`)은 실가 파트 모델에서도 라벨이 「주택 **환산**취득가액」·「상가 **환산**취득가액」이고 값은 파트 취득가 합이다(실측 AA: `주택 환산취득가액=570,000,000`(=250M+320M) · `상가 환산취득가액=330,000,000`). 장기보유 라벨 「(표1, 28%)」은 4부분 가중과 다르다(주택분 공제 318,710,344 ÷ 과세 1,085,172,413 = 29.37% ≠ 28%). `calculationRoute.acquisitionConversionRoute`는 설계상 갱신하지 않아 `section97_direct`로 나온다(B1 설계 §표 5행).
- **그러나 렌더되지 않는다**: 어댑터 `MixedUseResultCardAdapter.ts:121-122`가 `steps: []`로 내리고, `MixedUseStep`을 읽는 컴포넌트·인쇄 섹션이 없다(grep 0건). 다건은 겸용을 차단한다(`multi-transfer-tax-validate.ts:136`).
- **판정**: 같은 부류의 결함이 **존재하되 사용자에게 도달하지 않는다** → **수정 보류**(Q-C6). 결과 카드가 쓰는 echo(`separateAcquisition`·`housingPart.holdingDeductionAmount` 등)는 B1에서 정합 확인됨(UI 설계 §0.1).
- 만약 후일 `MixedUseStep`을 렌더하게 되면 라벨 3개·율 문구를 같은 규격으로 정정해야 한다 — anchor T-5(todo)가 그 가드다.

---

## 7. H-4 낡은 주석·설계서 (존재 확인 — C에 포함 제안)

| # | 위치 | 낡은 내용 | 사실(근거) | 제안 |
|---|---|---|---|---|
| H4-1 | `lib/tax-engine/transfer-tax-split-gain.ts:53-56` | 「[알려진 한계] 단기세율 혼합 케이스 … 미구현」 | `transfer-tax-split-rate.ts` G-1 구현(비주택 파트별 세율 · 주택 `max(토지, 주택)` 기산일) · `transfer-split-part-rate-shortterm.plan.md:19·25` 「전 항목 종결」 · `split-part-rate.anchor.test.ts` 37건 통과(이번 세션 실행) | **정정** — 4줄 삭제 또는 「구현됨(G-1) — `transfer-tax-split-rate.ts`」로 교체 |
| H4-2 | `components/calc/transfer/NewConstructionLandAcqBlock.tsx:21` | 「`transfer-tax-split-gain.ts:350-353` 『단기세율 혼합 케이스 미구현』」 + 「상속 토지 §104②1호 통산 미반영」 | 위와 같고 `engine-input.ts:317-319`(`landDecedentAcquisitionDate`·`landDonorAcquisitionDate`)·`transfer-tax-appurtenant-land.ts:63`에 통산 구현 흔적 — **연결 실측은 안 했다(V-C9)** | **UI 파일 — UI 설계 담당과 합의**. 최소: 줄 번호 인용 삭제 |
| H4-3 | `transfer-tax-helpers.ts:328` | 「토지/건물 split swap은 자산 단위 적용 — calcSplitGain 내부 처리는 별도 PR」 | `calcSplitGain`이 파트별 `applyAssetSwap`을 이미 한다(`transfer-tax-split-gain.ts:359-383`). **결과 단일 플래그만 비어 있다**(F-2) | 주석을 사실대로 정정(「파트별 swap은 calcSplitGain 내부에서 처리 — 결과 단일 swapApplied는 미반영(F-2)」) |
| H4-4 | `docs/02-design/features/transfer-separate-acq-date-per-part-completion.plan.md:365·415·447` | 「다건은 `multi-transfer-tax-validate.ts:87-89`가 split 전면 차단」 | 현행 `:87-89`는 `calcPropertyCompletion`이고, **`:176-177` 주석이 「차단하지 않는다(F-12, 2026-09-19)」** 명시 | 해당 3곳에 **정정 각주**(문서 본문 재작성 금지 — 이력 문서) |
| H4-5 | `docs/02-design/features/transfer-part-acquisition-cause.plan.md:30` · `…independent-valuation-mode.plan.md:378` · `transfer-split-part-rate-shortterm.plan.md:200` | 같은 「단기세율 혼합 미구현」 인용 | `…shortterm.plan.md:200`은 **G-1 계획 스스로 그 주석을 고치기로 한 표**인데 코드에 반영이 안 됐다(H4-1이 그 미이행분) | 각주 정정(H4-4와 같은 처리) |

**C에 포함 권장**: H4-1·H4-3(코드 주석 2건 — 같은 PR의 엔진 파일을 이미 여는 김에) + H4-4·H4-5 각주. H4-2는 UI 파일이라 UI 설계와 합의. **줄 번호 드리프트 실측**: 계획서 「:51-55」는 현행 **:53-56**(+2).

---

## 8. 케이스 매트릭스

문구 축(양도차익 §4.1 · 장특 §4.2 · sub-step §4.3). ✅ = anchor 있음(R 활성 / S skip) · ⬜ = 실측 미수행.

| # | 축 | 조건 | 기대 | anchor |
|---|---|---|---|---|
| M-1 | 모드 조합 | 실가/환산 · 환산/실가 · 환산/환산 · 감정/실가 · 매매사례/환산 · 실가/실가 | §4.1 규격 · 값 = 금액 | R-1 · S-1(×6) ✅ |
| M-2 | 시나리오 | N(표1) · H(표2 + 12억 안분) | 장특 §4.2 표1/표2 | R-1 · S-7 · S-8 ✅ |
| M-3 | sub-step | H × 6조합 | Σ 파트 보유/거주 · 합 = 총액 | R-5·R-6 · S-9(×6) ✅ |
| M-4 | 자본적지출(실가 파트) | 토지 5,000,000 | `경비(토지 자본적지출·양도비 5,000,000 + 건물 개산공제 1,500,000)` | D-0c · S-2 ✅ |
| M-5 | 소유자 분리 | `land_only` / `building_only` | 소유 파트만 | D-0d · S-3 · S-11 ✅(building_only ⬜) |
| M-6 | §97②2호 단서 | 건물 직접경비 150,000,000 | swap 파트 취득가 제외 + 경비 대체 | D-0e · S-4 ✅ |
| M-7 | PHD(§164⑤) | 환산/환산 | 취득가 합 552,874,340 · 경비 합 14,544,847 | D-0f · S-5 ✅ |
| M-8 | 보유 3년 미만 파트 | 건물 2024-08-01 | `× 0% = 0 (보유 1년 — 3년 미만은 공제 없음)` | S-12 ✅ |
| M-9 | 1원 경계 | 양도 1,500,000,001 | 합 등식 단정 금지 · 장특은 파트 기준 | R-10 ✅ · T-4 todo |
| M-10 | `propertyType:"building"` | 6조합 | housing과 동일 | 실측 12건 ✅ (anchor 미포함 — 같은 `calcSplitGain`) |
| M-11 | 일반건물 split | 6조합 | 변경 없음 | 실측 ✅ |
| M-12 | 겸용 B1 | AA·AE·EA·EE·PA | 미렌더 — 변경 없음 | 실측 ✅ · T-5 todo |
| M-13 | §98의2 특칙 × split | `lthd982Applied` | 가드 2 → 종전 문구 | ⬜ T-3 todo |
| M-14 | 단일축 시기(2009~2020) × split | `singleAxisTable2` | §4.2 단일축 사유 | ⬜ |
| M-15 | 공유지분 × split | 파트값은 지분 스케일 후 금액 | Σ 정합 예상 | ⬜ |
| M-16 | 다건·컴패니언 화면 | 자산별 행·카드 | steps 그대로 노출(코드) | ⬜ (코드 확인만) |
| M-17 | 비-split 단건 | — | **문구 불변** | 기존 전수 테스트 |

---

## 9. 사용자 결정 (Q-C)

| # | 쟁점 | 선택지 | **권장** | 근거 |
|---|---|---|---|---|
| **Q-C1** | 어디서 고치나 | (a) 엔진 step 문구 (b) UI가 재도출 (c) 둘 다 | **(a)** | 소비처가 단건·다건 자산별·컴패니언·인쇄 4곳이고 모두 `step.formula`를 그대로 읽는다. UI 재도출은 4곳 각각 + 다건은 `splitDetail` 전달 경로 의존 |
| **Q-C2** | **F-1**(split 장특 1원 과소)을 C에서 어떻게 | (a) C 선행 별 커밋 (b) 별건 PR (c) 안 함 | **(a)** | 같은 줄(`transfer-tax-lthd.ts:391·392`) 근처에 echo를 넣는다. 다만 **세액이 바뀌므로** R 그룹 「금액 불변」과 분리된 커밋·anchor(F-1)로 |
| **Q-C3** | sub-step **금액**을 정정하나(표시 금액이 바뀜 — 세액 불변) | (a) 정정 (b) 문구만 | **(a)** | 현행 금액이 파트 합과 달라 같은 화면 신고서(split-2col 로직)와 다르다(76,816,000 vs 87,916,000 — anchor D-0h·D-0i). 문구만 고치면 「합계 산식이 금액을 못 만드는」 거짓이 sub-step에 남는다 |
| **Q-C4** | 신고서 split-2col이 echo를 소비하나(UI) | (a) 소비 (b) 현행 유지 | **(a)** | float 재안분이 정수 엔진과 ~2.8% 1원 갈린다. UI 설계서에서 확정 |
| **Q-C5** | 결과 단일 플래그(`usedEstimatedAcquisition` 등) 의미 변경 | (a) 변경 (b) 유지 + split echo로 소비 | **(b)** | 소비처 다수(신고서 `estimatedDisplay` 게이트·명세서·집계). E-3 per-property echo는 UI가 필요 확정 시에만 |
| **Q-C6** | 겸용 `MixedUseStep` | (a) 수정 (b) 보류 | **(b)** | 어떤 화면에도 안 나온다. 렌더하게 되는 날 anchor T-5 |
| **Q-C7** | H-4 범위 | (a) 코드 주석 2건 + 문서 각주 (b) 안 함 | **(a)** | 같은 PR이 엔진 파일을 연다. `NewConstructionLandAcqBlock.tsx:21`은 UI와 합의 |
| **Q-C8** | 문구 어휘 승인 | 태그 `실지거래가`/`환산취득가`/`감정가`/`매매사례가` · `자본적지출·양도비` · `개산공제` · 파트명 `토지분`/`건물분` | **승인 요청** | 기존 결과뷰 어휘와 대조 — UI 설계와 충돌하지 않게 |

(계획서 **Q-F** 엔진 측 답: 일반건물 카드 `acquisitionMode` echo가 4모드 모두 실재하므로 **엔진 변경 0** — UI가 `acquisitionMode ∈ {actual,appraisal,salesCase}` 가드를 달면 된다.)

---

## 10. Do 순서 · 자가 점검

```
C-E0  F-1 수정(applyRate → applyLthdRate 3곳) + anchor F-1 해제·표식 삭제      → verify: 장특 관련 vitest
C-E1  타입 echo 4필드 + lthd split echo 산출 + leaf(E-2) + steps 배선(4곳)      → verify: anchor S 해제, D-0 삭제
C-E2  H-4 주석 정정(엔진 파일)
(UI)  UI 설계 Do — echo/leaf 소비, H-1·G-4·신고서 split-2col·PDF
검증  npx vitest run __tests__/tax-engine/transfer/ __tests__/components/ (+ lthd-split-parity · DetailedCalculationStatementCard)
```

- **금액 불변 게이트**: R 그룹(활성 32건 중 R-1 12건 포함)이 C-E1 전후 통과해야 한다. C-E0만 의도적으로 금액이 바뀐다(F-1 fixture 한정).
- **3대 정책**: ① `useEffect`→store 미러링 — 해당 없음(엔진). ② 자동 안분 fallback — **신규 입력 안분 없음**. sub-step 보유/거주 안분은 **표시용 분해**(합 = 총액 불변식)이고 입력 빈 값을 메우는 것이 아니다. ③ validate 8번째 — 입력 필드 0 → 동기화 대상 없음.
- **14지점**: 입력 변경 0 → ①~⑥·⑧~⑭ 해당 없음. 결과 echo는 `TransferTaxResult.splitDetail`(타입)·집계 pickers 복사로 전파 확인.
- 이 단계에서 `tsc --noEmit` 0건 · anchor eslint 0건 · anchor 실행 32 passed / 23 skipped / 5 todo.

---

## 11. 확인 필요 (V-C)

| # | 내용 | 상태 |
|---|---|---|
| V-C1 | 다건(`MultiTransferPropertyBreakdown`)·컴패니언(`BundledAllocationCard`)에서 split 자산 steps가 **실제 화면에** 나오는지 | 코드 확인만(`:648`·`:104`). 화면·E2E 실측 미수행 |
| V-C2 | PHD × 표2(1세대1주택 고가) sub-step 정정 후 값 | 현행 실측만(보유 59,081,667 / 거주 73,852,082). 정정 후 미실측 |
| V-C3 | §98의2 특칙(`lthd982Applied`) × split 병용 가능 여부 · 가드 2 동작 | 미실측 |
| V-C4 | 2009~2020 양도(표2 단일축) × split | 미실측 |
| V-C5 | `selfOwns` × 표2 echo · 비소유 파트 undefined | 미실측 |
| V-C6 | 공유지분(지분 스케일) × split 문구 합 | 미실측 |
| V-C7 | 신고서 split-2col 1원 불일치 **실화면** 재현 | 함수 재현(2.8%)뿐 |
| V-C8 | F-1이 과세표준(천원 절사)·세액에 미치는 실제 영향 | 미실측(2원 수준) |
| V-C9 | `transfer-part-acquisition-cause.plan.md:30` 「§104②1호 통산 미반영」이 현행인지 | `transfer-tax-appurtenant-land.ts:63`·`engine-input.ts:317-319` 흔적만 — split 경로 연결 미실측 |
| V-C10 | 새 문구가 `FormulaText`에서 분수 치환되지 않는지 | 정규식상 `/`·`÷` 없음(정적) — 렌더 미실측 |
| V-C11 | PDF 「(0%)」 실제 출력 | 코드 확인만 |
| V-C12 | e2e·테스트가 **현행 split 문구를 단언**하는 곳 | grep(`취득가(0)`·`× 0% \|`·`보유 N년×2% = 0%`) 0건 — 패턴 한계 있음. Do 때 전수 실행으로 확인 |
| V-C13 | 12억 초과 안분의 `taxableGainAfterProration ??=`(`transfer-tax-taxable-gain.ts:77-78`)가 `isPartialExempt`일 때만 채워지는 점 — 비과세 아닌 split에서는 `calcLongTermHoldingDeduction`이 `gain`으로 후퇴(`:383`) | 코드 확인(문구는 `taxableGainAfterProration ?? gain`을 읽어야 한다) |

---

## 12. 구현 메모 (Do · 2026-10-07 — 설계 대비 차이만 기록)

| # | 설계 | 구현 | 사유 |
|---|---|---|---|
| 1 | F-1: `applyRate` → `applyLthdRate` 3곳(split `:391·392·412`) | **split 2곳 + 가업상속 후단 3항 + 장기임대 §97의3 2항**. 배율초과 부수토지(`nbDed`)·`rentalGainRatio`는 유지 | 같은 파일 `:468-470`·`:502-504` 실측 — 율 격자 6,396조합 × 양도차익 6,000건: 가업상속의 `residencePart = rate − heirHoldRate`(double 뺄셈)는 모든 양도차익에서 1원 과소, 임대분 0.7은 167,796,000 등에서 1원 과소. `rentalGainRatio`는 기준시가 비율(임의 소수)이라 `applyLthdRate`(소수 4자리 반올림)를 쓰면 세액이 달라져 제외. `nbDed`(표1)는 격자에서 어긋남 0건. D10-06 커밋(77e627537)은 「6곳」만 열거하고 제외 근거를 적지 않았다 — 누락 |
| 2 | echo 율 단위 | **분수**(0.4 = 40%) — `longTermRate`·겸용 echo(`buildHousingLthdEcho`)와 같은 단위. 정수 %로 나눈 뒤 /100 | UI가 한 이름으로 읽는다 |
| 3 | 문구 태그 `실지거래가/감정가/매매사례가` (Q-C8) | **`실거래가/환산취득가/감정가액/매매사례가액`** | 사용자 확정 결정 9(입력 라디오 어휘 통일). Pre-Do anchor의 `TAG`도 같이 정정 |
| 4 | 양도차익 문구 가드 없음(§4.1) | 항등식(`양도가 − 취득가 − 경비 = 양도차익`)·파트 모드 부재 시 `null` → 종전 문구 | 사용자 지시 「합계 불변식이 깨지면 종전 문구로 후퇴」 |
| 5 | E-U1 위치 `transfer-tax-aggregate.ts:545-563` | 집계 본체가 773줄(≥750)이라 **`transfer-tax-aggregate-display-echo.ts`로 분리**(본체 667줄) | 800줄 정책 기회주의적 분리 |
| 6 | E-U1 필요경비 | 역산 대신 `summarizeSplitGain().necessaryExpense`(직접경비 + 개산공제) | 소유자 분리에서 역산은 일괄 총액 양도가액의 비소유 파트분이 섞인다. 소유 파트 둘 다면 역산값과 같다 |
| 7 | E-U2 `actualSource` 채우는 곳 `:454-470` | 실가 경로(`general-building-route-actual.ts`) + **환산 경로의 실가 파트**(`general-building-valuation.ts` 카드 5곳) | 환산 경로의 실가 파트도 `acquisitionMode: "actual"`이다 — 둘 다 파트 직접 입력 |
| 8 | E-U3 PHD 경로 | PHD 파트도 `lumpDeductionRate`(= `phd.estimatedDeductionRate`) | `stdPriceAtAcq`가 있는 파트는 율이 항상 실린다 |

