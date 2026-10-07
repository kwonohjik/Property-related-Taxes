# 토지·건물 별개 취득 — 결과 표시 정합 (Phase C) · UI 설계

- 계획서: `docs/00-pm/transfer-split-acq-per-part-method.plan.md` §2.1(H-1) · §2.2(G-4) · §3(Phase C) · §6 · §4 결정표 Q-F
- 짝(엔진): `docs/02-design/features/transfer-split-acq-result-display.engine.design.md` — transfer-tax-senior 동시 작성. **이 문서는 그 파일을 수정하지 않았다.** 대조 결과는 §10.
- Pre-Do anchor: `__tests__/components/split-acq-result-display.c.predo.anchor.test.tsx` — 활성 **37 passed** · skip **21**(`C_UNSKIP=1`로 실행하면 **20건 RED**, 1건은 실가/실가의 우연 일치 — §7).
- 상태: **UI Design — 소스 수정 0.** 워크트리 `Property-related-Taxes-c` · 브랜치 `feat/transfer-split-acq-result-display` · master `bf789b0d0`(PR #2038 B1 포함).
- 표기: 「실측」 = 이 워크트리에서 dev 서버(`E2E_PORT=3134`) + Playwright로 입력→계산→결과를 직접 실행하고 응답 JSON·화면 텍스트를 기록한 것. 「함수 실행」 = vitest/tsx로 같은 함수를 실행. 「코드 확인」 = 읽기만. 「확인 필요」 = 미검증. file:line은 이 워크트리 기준.
- 원자료(세션 scratchpad라 영속 안 됨 — 필요한 수치는 본문에 옮김): `/private/tmp/claude-501/-Users-mynote-workspace-Property-related-Taxes/4469ebcb-4585-444f-b128-92140436196b/scratchpad/c/` — `H-*`(주택 단건 6조합 + 미등기) · `M-*`(다건 6+환산 토지) · `C-*`(컴패니언 3) · `G-*`(일반건물 6 + stale + 일괄 실가) 각각 `.png`·`.response.json`·`.request.json`·`.sections.json`, 프로브 스크립트 `probe-*.cjs`.

---

## 0. 요약

**계획서 §2.1·§2.2의 결함은 master에서도 유효하다.** 다만 file:line은 B1(#2038)이 같은 파일에 겸용 echo 분기를 넣어 밀렸고(§1.1), **계획서가 모르던 더 큰 결함 5건**이 실측으로 나왔다.

| # | 결함 | 영향 뷰 | 판정 |
|---|---|---|---|
| **H-1** | 단건 상세명세서: 취득가액 = 양도가액 − 양도차익 − `result.expenses`(개산공제 없음) 역산 → 개산공제가 취득가액에 섞이고, 소제목이 항상 「(실제 거래가액)」·필요경비 0 | 단건 명세서 | 6조합 중 **5조합 틀림**(실가/실가만 우연 일치) |
| **H-5 🆕** | **다건·컴패니언 합산: 분리 자산의 `PerPropertyBreakdown.acquisitionPrice = 0`, `necessaryExpense = 취득가액 합 + 개산공제`** — 신고서(합산)·명세서(합계·자산별)·합산 요약 카드·건별 상세 신고서가 전부 따라 틀린다. 실가/실가도 취득 0·필요경비 350,000,000 | 다건·컴패니언 **5곳** | **6조합 전부 틀림**(엔진 echo 정합 문제 — UI만으로 못 닫는다) |
| **G-4** | 집계 소제목이 「자산별 실제 거래가액 합계」·「자산별 양도비 합계」로 고정. 뿌리는 `usedEstimatedAcquisition`이 undefined가 아니라 **어댑터가 `false`로 하드코딩**(`BundledAllocationCard.tsx:70`·`MultiTransferPropertyBreakdown.tsx:88`) | 다건·컴패니언·일반건물 명세서 | **분리 자산만이 아니다** — 평범한 환산 토지 단일 자산도 같은 거짓 소제목(실측 M-L-est) |
| **Q-F** | 일반건물 명세서 자산별 취득가액: **실가 파트에 「양도가액 × 취득시/양도시 기준시가 = 실가」 환산 산식**이 붙는 거짓 등식 4종(§1.5). 가드를 「`acquisitionMode==="actual"`」로만 달면 **정당한 일괄 실가 안분 산식(사례 35)까지 지운다** | 일반건물 명세서 | 현행 echo만으로는 불충분 — 엔진 echo 1필드 요청(E-U2) |
| **H-6 🆕** | 결과 카드 `SplitGainDetailSection`이 개산공제 산식을 **「× 3%」로 하드코딩**(`:119`·`:125`) — 미등기는 엔진이 0.3%를 적용(150,000)해 「50,000,000 × 3%」가 값을 못 만든다 | 단건 카드·다건 건별 상세·컴패니언 | 실측 H-unreg |
| **H-7 🆕** | swap(§97②2호 단서) 파트가 있는 split의 신고서 합계가 항등식을 깬다 — `900,000,000 − 375,000,000 − 400,000,000 = 125,000,000` ≠ 양도차익 350,000,000 | 단건 신고서 | 함수 실행(`buildRows` 직접) — 화면 미실측 |

**수정 방향 한 줄**: 분기 플래그는 `usedEstimatedAcquisition`·`result.expenses`가 아니라 **응답에 실재하는 `splitDetail.land/building.{acqMode,acquisitionPrice,directExpenses,appraisalDeduction,swapApplied}`** (신고서 split-2col이 이미 정본으로 쓰는 값)이다. 엔진이 같은 정의의 leaf(`summarizeSplitGain`, 엔진 설계 E-2)를 낼 예정이므로 **상세명세서·신고서·카드가 같은 leaf를 소비**하게 하고, 다건은 엔진 echo(E-U1)를 고쳐 5곳이 따라오게 한다. 14지점은 입력 신설이 없어 ⑦ 결과 표시만 걸린다(§8).

**사용자 결정 Q-U-1~Q-U-9**(§9, 권장안 포함) · **확인 필요 V-U1~V-U10**(§11).

---

## 1. 재실측

### 1.1 계획서 file:line 재검증 (stale 여부)

| 계획서 인용 | 현재 | 판정 |
|---|---|---|
| `DetailedStatementFormulaBuilders.ts:539-541` 「(실제 거래가액)」 | **`:545-546`**(B1 echo 분기가 `:451-455`에 들어감) | 증상 유효 · 위치 이동 |
| `:446-448`(취득가액 집계 소제목) | **`:446-450`**(`:448` 환산 / `:449` 실가) | 유효 |
| `:573-575`(필요경비 집계 소제목) | **`:577-581`**(`:579` 개산공제 / `:580` 양도비) | 유효 |
| 계획서 G-4 「`usedEstimatedAcquisition` undefined」 | **`false` 상수**: `aggregateToFilingResult` `BundledAllocationCard.tsx:68-70`, `breakdownToFilingResult` `MultiTransferPropertyBreakdown.tsx:88`. 집계 응답(`aggregated`)에는 필드 자체가 없다 | **정정** — 「undefined」가 아니라 어댑터 상수 false |
| `DetailedStatementHelpers.ts` 취득가액 역산 | `singleAcq` `:284-306` · `acqFormula` `:308-315` · `singleExp` `:343-345` · `expFormula` `:350` | 유효(계획서에 line 없음) |
| 신고서 split 정본 | `FilingFormTableHelpers.ts:479-490`(`sp.land/building.acquisitionPrice`, `directExpenses+appraisalDeduction`) | 이미 정본으로 동작 |
| B1 겸용 echo | `DetailedStatementFormulaBuilders.ts:451-455`(취득) · `:582-584`(필요경비) — `separateAcqFormulaText/ExpenseText(result.mixedUseDetail)` | **충돌 없음** — §3.8 |

### 1.2 방법

주택 `housing`(겸용 아님) · 매매 · **토지 취득 2010-03-15 / 건물 취득 2018-06-01** · 양도 2026-02-16 · 양도가액 900,000,000 · 양도시 기준시가 토지 300,000,000/건물 100,000,000 · 취득시 토지 `500,000×200㎡=100,000,000`/건물 50,000,000. sessionStorage 시드(`transfer-tax-wizard`) → 「가산세」 단계 → 「세금 계산하기」 → `/api/calc/transfer` 응답과 결과 화면 텍스트(`[data-print-id]` 섹션 + 「전체 연관 계산 과정 보기」·`▼` 전개)를 기록. 일반건물은 `general-building-part-appraisal.spec.ts`의 시드 값. 다건은 이력(IndexedDB) 시드 → `/calc/transfer-tax/multi` → 「세액 계산」(`transfer-multi-filing-form.spec.ts` 패턴). 컴패니언은 자산 2건 시드(`주 자산(주택)` + 독립 나대지 토지).

### 1.3 단건(주택) — 6조합 × 4뷰 (실측)

엔진 정본 = `splitDetail`(토지/건물 `acqMode`·취득가액·개산공제). 아래 「엔진」 열이 곧 **정답**이다.

| 조합 | 엔진 (토지 / 건물 취득 · 개산공제) | 신고서 합계 취득 / 경비 | 결과 카드 「취득 방식」 | **상세명세서** 취득 / 경비 · 소제목 | 판정 |
|---|---|---|---|---|---|
| 실가/실가 | 200,000,000 / 150,000,000 · 0/0 | 350,000,000 / 0 | 실지취득가액·실지취득가액 | 350,000,000 / 0 · 「(실제 거래가액)」 | ✅ 우연 일치 |
| 실가/환산 | 200,000,000 / 112,500,000 · 0/1,500,000 | 312,500,000 / 1,500,000 | 실지취득가액·환산취득가 | **314,000,000 / 0** · 「(실제 거래가액)」 | ❌ 개산공제가 취득가액에 |
| 환산/실가 | 225,000,000 / 150,000,000 · 3,000,000/0 | 375,000,000 / 3,000,000 | 환산취득가·실지취득가액 | **378,000,000 / 0** · 「(실제 거래가액)」 | ❌ |
| 환산/환산 | 225,000,000 / 112,500,000 · 3,000,000/1,500,000 | 337,500,000 / 4,500,000 | 환산취득가·환산취득가 | **342,000,000 / 0** · 「(실제 거래가액)」 | ❌ |
| 실가/감정 | 200,000,000 / 150,000,000 · 0/1,500,000 | 350,000,000 / 1,500,000 | 실지취득가액·감정가액 | **351,500,000 / 0** · 「(실제 거래가액)」 | ❌ |
| 매매사례/실가 | 210,000,000 / 150,000,000 · 3,000,000/0 | 360,000,000 / 3,000,000 | 매매사례가액·실지취득가액 | **363,000,000 / 0** · 「(실제 거래가액)」 | ❌ |

- 신고서(split-2col)·카드는 엔진과 일치. **상세명세서만** 틀린다. 합계(취득+경비)는 같아서 양도차익은 맞다 — **칸 배분과 소제목이 틀린 표시 결함**이고 세액은 정확.
- 같은 화면의 「전체 양도차익」 산식은 「양도가(900,000,000) - 취득가(0) - 경비(0)」(실측), 장기보유 산식은 「× 0% | 보유 7년×2% = 0%」로 금액(153,000,000)과 어긋난다 — **H-2, 엔진 steps 문구**(엔진 설계 §1·§4가 담당 — 이 문서 §10 I-1).
- 카드 어휘는 「실지취득가액」(`SplitGainDetailSection.tsx:80`), 입력 화면 라디오는 「실거래가」(`PartAcqInputs.tsx:22-25`), 상세명세서는 「(실제 거래가액)」 — **세 가지 어휘**(Q-U-2).

### 1.4 다건·컴패니언 — 같은 6조합 (실측: 다건 6조합·컴패니언 3조합)

다건: 건1 = 주택 split, 건2 = 평범한 토지(취득 100,000,000). 컴패니언: `주 자산(주택)` + `자산 2 (독립 나대지)`.

| 조합 | 건1 `p.acquisitionPrice` / `p.necessaryExpense` (응답) | 신고서(합산) 건1 열 | 명세서 합계 취득 / 경비 | 합산 요약 카드 | 판정 |
|---|---|---|---|---|---|
| 실가/실가 | **0 / 350,000,000** | 0 / 350,000,000 | 100,000,000 / 350,000,000 | 취득 −100,000,000 · 경비 −350,000,000 | ❌ |
| 실가/환산 | **0 / 314,000,000** | 0 / 314,000,000 | 100,000,000 / 314,000,000 | −100,000,000 / −314,000,000 | ❌ |
| 환산/실가 | **0 / 378,000,000** | 〃 | 100,000,000 / 378,000,000 | — | ❌ |
| 환산/환산 | **0 / 342,000,000** | 〃 | 100,000,000 / 342,000,000 | — | ❌ |
| 실가/감정 | **0 / 351,500,000** | 〃 | 100,000,000 / 351,500,000 | — | ❌ |
| 매매사례/실가 | **0 / 363,000,000** | 〃 | 신고서 건1 열 0 / 363,000,000 | — | ❌ |

- 뿌리: `transfer-tax-aggregate.ts:545-553` `effectiveAcquisitionPrice`가 환산 아닌 자산은 `r.singleInput.acquisitionPrice`(분리 입력이면 **0**, 자산 단위 취득가액 칸이 숨음)를 쓰고, `:561-563` `effectiveNecessaryExpense`는 `양도가액 − 취득가액 − 양도차익` **역산**이라 취득가액 합 + 개산공제 전부가 필요경비로 들어간다. 엔진 계산(양도차익·세액)은 정확하고 **표시 echo만 틀리다**(실측: 건1 양도차익 586,000,000 · 세액 불변).
- 응답에는 정본이 **이미 실려 있다** — `properties[0].splitDetail`(`transfer-tax-aggregate-pickers.ts:48`이 통째 복사). 소비층이 안 읽는다: 어댑터 `breakdownToFilingResult`는 `splitDetail`을 싣지 않고(`MultiTransferPropertyBreakdown.tsx:60-117` 직접 확인), 명세서 자산별 행은 `p.acquisitionPrice`를 읽는다(`DetailedStatementGbFormulas.ts:268` 「자산별 취득가액 = 0」).
- 컴패니언도 **같은 `mode:"bundled"` aggregate 경로**라 다건과 동일(응답 `aggregated.properties[].splitDetail` 실재, 건1 acq 0/exp 321,500,000 등).
- 건별 상세(아코디언) 안의 「토지/건물 분리 양도차익」 카드는 **정확**(토지 200,000,000 / 건물 112,500,000, 개산공제 1,500,000) — 같은 아코디언 안의 신고서(취득가액 「-」 · 필요경비 314,000,000)·「양도가(900,000,000) - 취득가(0) - 경비(0)」와 정면 충돌.

### 1.5 일반건물(bundled) — 6조합 (실측) + 부가 3종

엔진 정본 = `aggregated.generalBuildingValuationDetail.assetCards[]`(`acquisitionMode`·`usedEstimatedAcquisition`) · `estimatedDeduction.{land,building}`. 신고서·카드는 정확하고, **상세명세서만 틀린다**(H-1·H-5와 달리 일반건물 취득가액·필요경비 값 자체는 정확).

| 조합 | 신고서 합계 취득 / 경비 | 명세서 집계 소제목 | 명세서 자산별 취득가액 산식 | 판정 |
|---|---|---|---|---|
| 실가/실가 | 700,000,000 / 0 | 「자산별 실제 거래가액 합계」 | 토지: **「0 × 920,550,000 / (920,550,000+20,629,440) = 300,000,000」**, 건물: **「0 - 토지 -400,000,000 = 400,000,000 (잔액 보정)」** | ❌ Q-F-1 |
| 실가/환산 | 305,980,729 / 84,434 | 「자산별 **실제 거래가액** 합계」(G-4) · 필요경비 「**양도비** 합계」 | 토지(실가 300,000,000): **「1,956,162,578 × 238,000,000 / 920,550,000 = 300,000,000」**(좌변 505,748,404) | ❌ Q-F-2 · G-4 |
| 환산/실가 | 905,748,404 / 7,140,000 | 〃 | 건물(실가 400,000,000): **「43,837,422 × 2,814,470 / 20,629,440 = 400,000,000」** | ❌ Q-F-2 · G-4 |
| 환산/환산 | 511,729,133 / 7,224,434 | 〃 (양쪽 환산인데 「실제 거래가액」) | 환산 산식(맞음) | ❌ G-4만 |
| 실가/감정 | 420,000,000 / 84,434 | 〃 | 건물: 감정 가드(A) 정상 · **토지(실가)**: 「1,956,162,578 × 238,000,000 / 920,550,000 = 300,000,000」 | ❌ Q-F-2 (A 가드가 감정 파트만 막음) |
| 매매사례/실가 | 720,000,000 / 7,140,000 | 〃 | 토지: 매매사례 가드 정상 · **건물(실가)**: 환산 산식 = 400,000,000 | ❌ Q-F-2 |

- **Q-F-3 (stale)**: 실가/실가 + 숨은 자산 단위 총액 999,000,000이 폼에 남아 있으면(요청 body `acquisitionPrice: 999000000`이 그대로 전송됨, 엔진은 파트값 사용 — 실측) 응답 `bundledActualAcquisitionPrice = 999,000,000` → 산식 「999,000,000 × … = 300,000,000」. ⇒ **`bundledActualAcquisitionPrice > 0` 가드는 불충분**(anchor로 고정).
- **Q-F-4 (정당 경로의 거짓 등식)**: 같은 취득일 일괄 실가(사례 35, 총액 700,000,000 → 토지 691,818,892)의 토지 산식은 `700,000,000 × 920,550,000 / (920,550,000+20,629,440)`(양도시 기준시가 비율) — 이 식의 값은 **684,656,902**, 표시값은 691,818,892(엔진은 **취득시** 비율 `238,000,000/(238,000,000+2,814,470)` — `general-building-route-actual.ts:463-465` P-2). 계산: `700,000,000×238,000,000÷240,814,470 = 691,818,892`(함수 실행). 코드 `DetailedStatementGbFormulas.ts:288-311`이 P-2 이전 분모를 그대로 쓴다. 건물분 「잔액 보정」은 맞다.
- 필요경비 쪽은 이미 `acquisitionMode`/`usedEstimatedAcquisition` echo로 파트별 분기하고 있어(`:458-486`) **정상**(「필요경비 없음 — 실지거래가액 파트라 §163⑥ 개산공제를 적용하지 않습니다」 실측).

### 1.6 그 밖의 실측

| 항목 | 실측 | 위치 |
|---|---|---|
| **H-6** 미등기 split 카드 | 응답 건물 `appraisalDeduction 150,000 · lumpDeductionBase 50,000,000`인데 카드는 「취득시 기준시가 50,000,000 × 3%」 | `SplitGainDetailSection.tsx:119`·`:125`. 엔진 `transfer-tax-split-gain.ts:239`가 `estimatedDeductionRate(isUnregistered)` 적용 |
| **H-7** swap + split | 토지 환산 + 직접경비 400,000,000: `splitDetail.land.swapApplied=true · acquisitionPrice=225,000,000(미차감) · directExpenses=400,000,000 · gain=275,000,000`. `buildRows` 결과 합계 열: 취득 375,000,000 · 경비 400,000,000 · 양도차익 350,000,000 → 항등식 불성립 | 함수 실행 (`FilingFormTableFinancials.ts:87-115`, `:479-490`은 swap을 안 본다) |
| 플레인 환산 토지의 G-4 | 다건 건1 = 환산 토지 단일: 응답 `filingDisplay {estimatedBase 250,000,000, estimatedDeduction 3,000,000}` · 명세서 소제목 「자산별 **실제 거래가액** 합계」 · 필요경비 「**양도비** 합계」 | 실측 M-L-est |
| 일반건물은 다건 불가 | 「일반건물·상업용건물…은 단건 계산기에서만 지원됩니다」 | 실측 M-G-act-est.FAIL |
| 겸용(B1) | 결과 카드·신고서 4열·명세서 모두 echo 분기(`mixed-use-separate-acq-text.ts`) — 이 Phase의 범위 밖, 충돌 점검만(§3.8) | 코드 확인 |

---

## 2. 응답 플래그 표 — 분기에 쓸 수 있는 **실재 값**

「G-4는 응답에 없는 값으로 분기해서 생긴 문제」(계획서). 아래가 실측으로 확인한 **존재 여부**다.

| 경로 | 값 | 실재? | 실측 | 분기 용도 |
|---|---|---|---|---|
| 단건 `data.result` | `usedEstimatedAcquisition` | 있음, **항상 false**(6조합) | `false` | ❌ 쓰지 말 것 — 분리 조합에서 환산을 못 잡는다 |
| 〃 | `estimatedBase` · `estimatedDeduction` · `estimatedStd*` | **부재**(6조합) | undefined | ❌ |
| 〃 | `expenses` | 있음, **직접경비 합만**(개산공제 제외) | 0 (6조합 전부) | ❌ 역산의 원인 |
| 〃 | `acquisitionPrice` | **부재** | undefined | — |
| 〃 | **`splitDetail.land/building.acqMode`** | **있음, 4값 전부 실재** | actual/estimated/appraisal/salesCase | ✅ 산정방식 |
| 〃 | **`splitDetail.*.acquisitionPrice`·`directExpenses`·`appraisalDeduction`·`swapApplied`·`lumpDeductionBase`·`stdPriceAtAcq`** | 있음 | 위 §1.3 | ✅ 금액·swap·개산공제 base. 신고서가 이미 정본으로 사용 |
| 〃 | `splitDetail.selfOwns` | 있음 | both | ✅ 소유 파트 필터(`FilingFormTableHelpers.ts:479-490`과 동일) |
| 다건·컴패니언 `properties[i]` | `acquisitionPrice` · `necessaryExpense` | 있음, **분리 자산에서 틀림**(0 / 취득 합+개산공제) | §1.4 | ❌ 엔진 echo 정정 필요(E-U1) |
| 〃 | **`splitDetail`** | **있음**(분리 자산) | `'splitDetail' in p` true | ✅ 분리 자산 판별·파트 산정방식 |
| 〃 | `filingDisplay.estimatedBase/estimatedDeduction` | 플레인 환산 자산에만(`{}` for split·GB) | M-L-est vs M-H-* | ✅ 플레인 환산 판별(`FilingFormTableAggregateHelpers.ts:226` 이미 사용) |
| 〃 | `usedEstimatedAcquisition` | **부재**(집계 타입에 없음) | — | ❌ |
| 일반건물 `aggregated.generalBuildingValuationDetail.assetCards[]` | `acquisitionMode` | **있음, 4값 전부**(6조합) | actual/estimated/appraisal/salesCase | ✅ 파트 산정방식 — **단 `actual`이 두 의미**(아래) |
| 〃 | `usedEstimatedAcquisition` | 있음(환산 파트 true) | §1.5 | ✅ 환산 판별(보조) |
| 〃 | `bundledActualAcquisitionPrice` | 실가/실가=**0**, 일괄 실가=700,000,000, **stale 총액 있으면 999,000,000** | §1.5 | ❌ 안분 vs 파트 직접의 판별자로 **불충분**(Q-F-3) |
| 〃 | `estimatedDeduction.{land,building,landBase,buildingBase,landRate,buildingRate}` | 환산·감정·매매사례 파트가 있을 때 | §1.5 | ✅ 필요경비 산식(이미 사용 중) |
| 〃 | **`assetCards[].actualSource`** | **부재 — 엔진 신설 요청 E-U2** | — | 일괄 실가 안분(`bundled_apportion`) vs 파트 직접 입력(`part_input`)을 가르는 유일한 깨끗한 값 |

`acquisitionMode:"actual"`이 갖는 두 의미(실측): ① **파트 직접 입력**(별개 취득 두 파트 가액을 각각 입력 — 예: 실가/환산의 토지) → 산식은 「입력값 그대로」. ② **일괄 실가 안분**(같은 취득일 총액 700,000,000을 취득시 기준시가 비율로 안분 — 카드 mode도 `actual`) → 안분 산식이 맞다. 두 경우 카드 `acquisitionMode`·`usedEstimatedAcquisition`이 **동일**(`actual`·`false`)하다.

---

## 3. 수정 설계

### 3.0 원칙

1. **정본은 엔진 echo다 — 표시층이 산식을 다시 쓰지 않는다**(memory `feedback_aggregate_display_rederives_engine_value` · `feedback_engine_result_display_drift`). 금액은 `splitDetail` 값을 그대로, 소제목은 산정방식 라벨을 그대로 읽는다.
2. **분기 플래그 = 응답에 실재하는 값**(§2 ✅ 행). `usedEstimatedAcquisition`·`result.expenses`·`bundledActualAcquisitionPrice > 0`로 분기하지 않는다.
3. **이미 정본으로 쓰이는 값을 재사용**: 신고서 split-2col(`FilingFormTableHelpers.ts:479-490`)이 쓰는 `splitDetail` 합산 — 이것을 **한 leaf로 올려** 신고서·명세서·(swap)가 공유한다.
4. 새 입력 필드 없음 — 입력·store·API·validate 불변. **「UI 통과 ↔ validate 차단」 모순 발생 불가**, 자동 안분 fallback 없음(표시 전용).

### 3.1 공용 leaf — 정본 값

엔진 설계 §4.5 `summarizeSplitGain(sd)`(`lib/tax-engine/transfer-tax-split-display.ts`, 신규)를 **그대로 import**한다(Q-U-1). 반환(엔진 설계 인용): `{ transferPrice, acquisitionDeducted, necessaryExpense, gain, parts: [{ key:'land'|'building', label, mode, acquisitionPrice, acquisitionDeducted, directExpenses, appraisalDeduction, swapApplied, gain }] }` — **소유 파트만**, `acquisitionDeducted = swap ? 0 : acquisitionPrice`, `necessaryExpense = Σ(direct + ded)`.

UI 파일: 신규 `components/calc/results/transfer/split-acq-text.ts`(순수·JSX 없음, `mixed-use-separate-acq-text.ts`와 같은 규약, ~110줄) —

| export | 입력 | 출력 |
|---|---|---|
| `splitAcqFormulaText(summary)` | `summarizeSplitGain` 결과 | 「토지(실거래가) 200,000,000 + 건물(환산취득가) 112,500,000 — 토지·건물 취득일이 달라 파트별로 산정 (소득세법 §97①1호 가목·나목)」 |
| `splitExpenseText(summary, lumpRate)` | 〃 + 엔진 leaf `estimatedDeductionRate` | 「필요경비 1,500,000 = 토지 실제 필요경비 0 + 건물 개산공제 1,500,000 (취득시 기준시가 50,000,000 × 3%) — 소득세법 §97②2호·시행령 §163⑥」 |
| `aggregateAcqBasis(properties, gb)` | 집계 `PerPropertyBreakdown[]`·일반건물 상세 | 자산·파트 산정방식 집합 → 소제목 분기 |
| `aggregateAcqHeading` · `aggregateExpenseHeading` | 위 집합 | 소제목 문자열 |

- 모드 라벨은 **`sepAcqModeLabel`**(실거래가·환산취득가·감정가액·매매사례가액 — 입력 화면 라디오 `PartAcqInputs.tsx:22-25`와 동일 어휘)를 쓴다. 현재 `components/calc/results/mixed-use/mixed-use-separate-acq-text.ts:17`에 있어 **`components/calc/results/shared/part-acq-mode-label.ts`로 옮기고 겸용 파일이 re-export**한다(import 경로 보존 — 겸용 소비처 무변경).
- 법령 표기: 실거래가 = 「소득세법」 §97①1호 **가목**, 매매사례가액·감정가액·환산취득가액 = **나목**(KoreanLaw MCP 본문 확인 — MST 280405 §97①: 「가목의 실지거래가액을 확인할 수 없는 경우에 한정하여 나목의 금액을 적용」). 필요경비: 실거래가 파트 = §97①2호·3호(자본적지출·양도비), 비실가 파트 = §97②2호 본문 + 시행령 §163⑥ 개산공제(기존 `buildNecessaryExpenseFormula` 문구와 동일 인용 — **신규 조문 인용 0**, `verify:legal` manifest 추가 불요).
- **재도출 금지 확인**: 환산 파트의 「양도가액 × 취득시/양도시 기준시가」 분수는 그리지 않는다 — `SplitPartResult`에 분모(`landStandardPriceAtTransfer`)가 echo되어 있지 않다(코드 확인 `types/transfer-split-gain.types.ts:57-103`). 분모 echo가 없으므로 이 Phase는 「산정방식 + 금액」까지만(후속: 분모 echo 시 Frac 추가).

### 3.2 H-1 — 단건 상세명세서

| 위치 | 변경 |
|---|---|
| `DetailedStatementHelpers.ts:284-306` `singleAcq` | `result.splitDetail && !result.mixedUseDetail && !carryover A`이면 `summary.acquisitionDeducted` (기존 `estimatedNoSwap`/역산 분기 앞에) |
| `:343-345` `singleExp` | 같은 조건이면 `summary.necessaryExpense`(= 직접경비 + 개산공제 합) |
| `DetailedStatementFormulaBuilders.ts:451-455` 뒤 | **신규 분기** `splitAcqFormulaText` — B1 `separateAcqFormulaText`(겸용)와 **`!result.mixedUseDetail` 상호 배타**. 이월과세 A(`:458-`)보다 **뒤**(자산 단위 override가 우선하는 현행 위계 유지) |
| `:582-584` 뒤 | 같은 방식 `splitExpenseText`. **개산공제 파트가 없으면(실가/실가) 기존 문구 유지**(「양도비 N (중개수수료·법무사 비용 등) — §97① 나목」) — 회귀 0 |
| `buildAcquisitionPriceFormula` 시그니처 | 변경 없음(`result.splitDetail`을 읽는다). `lumpRate`는 이미 `buildNecessaryExpenseFormula`에 전달됨(`:350`) |

수정 후 단건 표(§1.3 기준): 취득가액 칸 = 파트 취득가액 합(신고서와 동일), 필요경비 칸 = 개산공제 합, 소제목 = 「토지(실거래가) 200,000,000 + 건물(감정가액) 150,000,000 — …」. 「(실제 거래가액)」 거짓 라벨은 환산·감정·매매사례 파트가 있으면 나오지 않는다(anchor `redUntilDo`).

### 3.3 다건·컴패니언 — H-5 (엔진 echo + UI 소비)

**엔진 요청 E-U1**(엔진 설계에 없음): `transfer-tax-aggregate.ts:545-563` — `r.result.splitDetail`이 있으면 `effectiveAcquisitionPrice = summarizeSplitGain(splitDetail).acquisitionDeducted`로 하고 필요경비는 현행 역산(`transferPrice − 취득 − 양도차익`)을 유지하면 **= Σ(직접경비 + 개산공제)**가 된다(항등식 자동 성립, 세액 불변). 이 한 곳을 고치면 **합산 신고서 · 명세서(합계·자산별) · 합산 요약 카드(`MultiTransferTaxSummaryCard.tsx:50-51`) · 건별 상세 신고서(`breakdownToFilingResult` `expenses: b.necessaryExpense`) 4곳이 코드 변경 없이 따라온다**(§1.4 5곳 중 UI 소비층 수정 불요). UI 단독 대안(어댑터마다 `p.splitDetail`로 override)은 5곳 각각 + 합산 요약까지 번지고 「엔진 echo가 틀린데 표시가 가린다」 구조가 되어 채택하지 않는다(Q-U-3).

UI 변경(E-U1과 별개의 **표시 보강**):

| 위치 | 변경 |
|---|---|
| `DetailedStatementGbFormulas.ts:262-269` `buildGbAcquisitionFormula`의 `!gb` fallback 앞 | `p.splitDetail`이 있으면 `splitAcqFormulaText`(파트별 산정방식·금액) — 현재 「자산별 취득가액 = 0」 |
| `:420-432` `buildGbExpenseFormula`의 `!gb` fallback 앞 | `p.splitDetail`이 있고 개산공제 파트가 있으면 `splitExpenseText` — 현재 「자산별 양도비 합계 = 314,000,000」 |
| `breakdownToFilingResult` | **`splitDetail`을 싣지 않는다**(Q-U-5). 싣으면 `deriveColumns`가 `split-2col`로 바뀌어 건별 신고서에 토지/건물 열이 생기고 `formData`(취득일 열)가 필요 — 같은 아코디언에 `SplitGainDetailSection` 카드가 이미 파트별 값을 보인다. E-U1 후 건별 신고서는 단일 열 합계(취득 312,500,000 / 경비 1,500,000)로 정확 |

### 3.4 G-4 — 집계 소제목

뿌리는 어댑터 상수 `usedEstimatedAcquisition: false`(2곳)이므로, **상수를 지우는 것이 아니라 소제목을 echo 집합에서 파생**한다(`aggregateToFilingResult`는 신고서 합계 열·세율 등 다른 용도 — 의미 변경 시 소비처 다수, 엔진 설계 Q-C5와 같은 판단).

`aggregateAcqBasis`(§3.1)가 자산별 산정방식을 **세 echo 중 하나**에서 읽는다(우선순위):

1. `p.splitDetail` → 소유 파트의 `acqMode`(분리 자산: 주택 split·건물)
2. 일반건물 `generalBuildingValuationDetail.assetCards[]` 중 이 자산(`baseCardId`·`isSameShare` — 기존 `DetailedStatementGbFormulas.ts`의 카드 매칭 leaf 재사용)의 `acquisitionMode`
3. `p.filingDisplay?.estimatedBase !== undefined && !p.filingDisplay.swapApplied` → `estimated`(플레인 환산 자산 — `FilingFormTableAggregateHelpers.ts:226`이 이미 같은 규칙)
4. 그 밖 → `actual`

소제목(한국어 풀어쓰기, 변수 약어·`floor` 없음):

| 집합 | 취득가액 소제목 | 필요경비 소제목 |
|---|---|---|
| 전부 실거래가 | 「자산별 실제 거래가액 합계 (자본적지출은 필요경비 — §97① 2호)」(현행) | 「자산별 양도비 합계 (중개수수료·법무사 비용 등) — §97① 나목」(현행) |
| 전부 환산취득가 | 「자산별 환산취득가 합계 — 시행령 §163·§176의2②」(현행 문구) | 「자산별 개산공제·양도비 합계 — §97① 나목·시행령 §163⑥」(현행) |
| 그 밖(혼합·감정·매매사례) | 「자산별 취득가액 합계 (산정방식: 실거래가·환산취득가 — 자산·파트별로 다름, 소득세법 §97①1호 가목·나목)」 | 「자산별 필요경비 합계 (실거래가 파트는 자본적지출·양도비, 환산취득가·감정가액·매매사례가액 파트는 개산공제 — 소득세법 §97②2호·시행령 §163⑥)」 |

`buildAcquisitionPriceFormula`/`buildNecessaryExpenseFormula`에 선택 인자 `aggBasis?: AggregateAcqBasis`를 추가하고 호출부(`DetailedStatementHelpers.ts:308·350`)가 `aggregateAcqBasis(properties, gbDetail)`를 계산해 넘긴다. 인자가 없으면 현행(회귀 0). **이 변경은 평범한 환산 토지에도 적용된다**(소제목이 현재 거짓) — 범위 확대의 사용자 결정은 Q-U-6.

### 3.5 Q-F — 실가 파트 거짓 등식 가드 (일반건물)

현행 가드 A(`DetailedStatementGbFormulas.ts:277-289`)는 `acquisitionMode ∈ {appraisal, salesCase}`만 막는다. 거짓 등식은 4곳이다(§1.5): Q-F-1(실/실 「0 ×」·「잔액 보정」) · Q-F-2(환산 포함 조합의 실가 파트) · Q-F-3(stale 총액) · Q-F-4(일괄 실가 안분 분모).

**설계**:

| 케이스 | 처리 | 근거 echo |
|---|---|---|
| 실가 파트 직접 입력(Q-F-1·2·3) | 「자산별 취득가액 = 300,000,000 (실거래가 — 소득세법 §97①1호 가목)」 — 환산·안분 식을 그리지 않는다 | `card.acquisitionMode==="actual"` **AND** `card.actualSource==="part_input"` (**E-U2**) |
| 일괄 실가 안분(사례 35) | 안분 산식 유지, 단 **분모를 취득시 기준시가로 교정**(Q-F-4): `buildAllocationFormula(bundledAcq, gb.acqLandStdTotal, [gb.acqLandStdTotal, gb.acqBuilding1StdTotal], …)` — 증축(사례 33) 분기(`:314-346`)가 이미 같은 분모를 쓴다 | `actualSource==="bundled_apportion"` (또는 echo 부재 = 옛 이력 → 현행 유지) |
| echo 부재(옛 이력) | **현행 유지**(감정·매매사례 가드 A와 같은 규약 — 옛 이력은 재계산 시 신규) | — |

- **왜 echo가 필요한가**: `acquisitionMode:"actual"`만으로 가드하면(엔진 설계 §2.4/Q-F 답이 제안) **정당한 일괄 실가 안분**(§1.5 Q-F-4 — 카드 mode 동일 `actual`)의 산식이 같이 지워지고, `bundledActualAcquisitionPrice`로 가르면 stale 총액(999,000,000)에서 틀린다. 폼 값(`asset.hasSeperateLandAcquisitionDate` 등)으로 추론하는 것은 `feedback_ui_mode_flag_not_domain_semantics` 위반. Σ카드 = 총액 항등식 대안은 지분(`#`)·증축 카드에서의 거동을 **측정하지 않았다**(V-U4) — 채택하지 않는다.
- **E-U2**: `GeneralBuildingOutput.assetCards[]`에 `actualSource?: "part_input" | "bundled_apportion"` — `acquisitionMode==="actual"`일 때만. 채우는 곳은 `general-building-route-actual.ts:454-470`(`hasBothPartPrices` 분기 = `part_input`, `actualAcquisitionPrice > 0` 안분 분기 = `bundled_apportion`) — **엔진 산식·값 불변**. 타입은 `types/general-building.types.ts:655` 근처. echo 전달은 `generalBuildingValuationDetail` 객체 복사(`pickValuationDetails` 불요).
- 필요경비 쪽은 이미 정상(§1.5)이라 변경 없음.

### 3.6 H-6 — 결과 카드 개산공제율

카드 `SplitGainDetailSection.tsx:119·125`의 「× 3%」를 엔진이 적용한 율로 교체. **엔진 요청 E-U3**: `SplitPartResult.lumpDeductionRate?: number`(개산공제를 적용한 파트에만, `computeLumpSumDeductionBase`와 같은 자리 `transfer-tax-split-gain.ts:239-251`). 카드는 `formatLumpRate(rate)`(`DetailedStatementFormulaBuilders.ts:553`, export 필요) 또는 동일 규칙으로 「× 0.3%」. echo 부재(옛 이력) → 「× 3%」(현행). 대안(부모가 `formData.isUnregistered`로 `estimatedDeductionRate`를 계산해 prop 전달)은 다건 아코디언·컴패니언 카드 호출처(`ValuationDetailCards.tsx:148`)에 form이 없어 채택하지 않는다.

### 3.7 H-7 — swap 파트

공용 leaf의 `acquisitionDeducted = swap ? 0 : acquisitionPrice`를 **신고서 합계 열도 쓰게** 한다(`FilingFormTableHelpers.ts:479-490`의 인라인 합을 leaf 호출로 교체 — 줄 수 순감소, 파일 746줄이라 800 트리거 방지에도 유리). 결과: 위 실측 시나리오 합계 열 = 취득 150,000,000 · 경비 400,000,000 · 양도가 900,000,000 → 900 − 150 − 400 = 350 = 양도차익 ✓. swap 파트 열은 `AcqCell`(카드)의 「차감 안 됨」 고지와 같은 문구를 rose note로 표기. 파트 단위 열(토지/건물)의 취득가액 셀(`splitTwoColFinancials` `:95-96`)도 `acquisitionDeducted`로(Q-U-4).

### 3.8 B1(겸용 echo) 충돌 점검

| 점검 | 결과 |
|---|---|
| 분기 순서 | `buildAcquisitionPriceFormula`: aggregate → **B1 `separateAcqFormulaText(mixedUseDetail)`** → (이월과세 A) → **신규 split** → swap → 환산 → 실가. 신규 분기는 `!result.mixedUseDetail` 가드 + 겸용은 `splitDetail`을 싣지 않는 현행(코드 확인: `deriveColumns`가 `mu` 우선·`sp` 후순위 — `FilingFormTableColumns.ts:92-143`) |
| 라벨 | B1은 `sepAcqModeLabel` — 신규도 동일 leaf(위치만 `shared/`로 이동, re-export 유지) → **겸용과 split의 어휘가 같다** |
| 소제목 형식 | B1 「토지(실거래가) … + 건물(…) … — 토지·건물 취득일이 달라 파트별로 산정」과 **같은 문형**(주택/상가 4부분이 없을 뿐) |
| 겸용 + splitDetail 동시 존재 | **확인 필요**(V-U1) — `!mixedUseDetail` 가드로 안전하지만 실응답 미확인 |

### 3.9 변경 파일 예고 (Do 단계 — 지금은 수정 안 함)

| 파일 | 변경 | 줄 수(현재 → 예상) |
|---|---|---|
| `components/calc/results/transfer/split-acq-text.ts` | **신규** | — → ~110 |
| `components/calc/results/shared/part-acq-mode-label.ts` | **신규**(`sepAcqModeLabel` 이동) | — → ~20 |
| `components/calc/results/mixed-use/mixed-use-separate-acq-text.ts` | import·re-export | 변동 없음 |
| `DetailedStatementHelpers.ts` | `singleAcq`·`singleExp` 분기 + `aggBasis` 계산 | 695 → ~715 |
| `DetailedStatementFormulaBuilders.ts` | split 분기 2 + 집계 소제목 분기 2 | 643 → ~665 |
| `DetailedStatementGbFormulas.ts` | `!gb` fallback split 2 + Q-F 가드 + 사례 35 분모 교정 | 512 → ~545 |
| `FilingFormTableHelpers.ts` | `:479-490` leaf 호출로 교체 | 746 → ~735 |
| `FilingFormTableFinancials.ts` | `acquisitionDeducted` | ~115 변동 없음 |
| `SplitGainDetailSection.tsx` | 라벨 어휘·율 echo·testid | 227 → ~245 |
| `DetailedCalculationStatementCard.tsx:349` | `data-statement-formula` 속성 | +1 |

800줄 정책: 전부 800 미만. `FilingFormTableHelpers.ts`(746)는 순감소라 위험구간(≥750) 진입 없음.

---

## 4. 결과뷰 대조표 — 수정 전(실측) / 수정 후(기대)

각 칸은 조합 「실가/환산」(토지 200,000,000 + 건물 환산 112,500,000, 개산공제 1,500,000) 기준.

| 뷰 | 현행 취득가액 / 필요경비 | 수정 후 | 수정 원천 |
|---|---|---|---|
| ① 단건 결과 카드(`SplitGainDetailSection`) | 200,000,000·112,500,000 / 0·1,500,000 ✅ · 라벨 「실지취득가액·환산취득가」 | 값 동일 · 라벨 **「실거래가·환산취득가」** · 미등기 율 정정 | Q-U-2 · E-U3 |
| ② 단건 신고서(split-2col) | 312,500,000 / 1,500,000 ✅ | 동일 (swap만 정정) | leaf 공유 |
| ③ 단건 상세명세서 | **314,000,000 / 0** · 「(실제 거래가액)」 | **312,500,000 / 1,500,000** · 「토지(실거래가) 200,000,000 + 건물(환산취득가) 112,500,000 …」 | §3.2 |
| ④ 다건 신고서(합산) 건1 열 | **0 / 314,000,000** | **312,500,000 / 1,500,000** | E-U1 |
| ⑤ 다건 상세명세서 합계·자산별 | **100,000,000 / 314,000,000**(합계)·「자산별 취득가액 = 0」 | 합계 412,500,000 / 1,500,000 · 자산별 「토지(…) + 건물(…)」 | E-U1 + §3.3 |
| ⑥ 다건 합산 요약 카드 | **전체 취득가액 −100,000,000 · 전체 필요경비 −314,000,000** | −412,500,000 / −1,500,000 | E-U1 |
| ⑦ 다건 건별 상세 신고서 | **취득 「-」 / 필요경비 314,000,000** | 312,500,000 / 1,500,000 (단일 열) | E-U1 |
| ⑧ 컴패니언(함께 양도) 신고서·명세서 | 다건과 동일(주 자산 0 / 321,500,000 등) | 동일 정정 | E-U1 |
| ⑨ 일반건물(bundled) 명세서 | 소제목 「실제 거래가액 합계」 · 실가 파트 거짓 산식 | 소제목 혼합 문구 · 실가 파트 「자산별 취득가액 = 300,000,000 (실거래가 …)」 | §3.4·§3.5 |
| ⑩ 겸용(B1) | echo 분기 정상 | **불변** | — |

**4뷰 일치 불변식**(E2E·anchor 단언): 한 분리 자산에 대해 ① 카드 합 = ② 신고서 합계 열 = ③ 명세서 값 = ④⑤⑦ 다건 echo, 그리고 `양도가액 − 취득가액 − 필요경비 = 양도차익`.

---

## 5. UI 설계 — 위젯·testid

입력 위젯 없음(입력 경로 불변). 결과 표시만.

| 대상 | 신규 testid / 속성 | 용도 |
|---|---|---|
| 카드 취득 방식 셀 | `split-card-acq-mode-land` · `split-card-acq-mode-building` | 라벨 어휘 E2E(기존 `split-std-split-*` 선례 `SplitGainDetailSection.tsx:135-150`) |
| 카드 취득가액 셀 | `split-card-acq-land` · `split-card-acq-building` | 4뷰 일치 단언 |
| 카드 개산공제 base 줄 | `split-card-lump-base-land` · `split-card-lump-base-building` | 율 표기(H-6) |
| 명세서 산식 | `data-statement-formula={item.label}` (`DetailedCalculationStatementCard.tsx:349` 래퍼) — 기존 `data-statement-row={item.label}`(`:329`)와 짝 | 취득가액·필요경비 산식 텍스트 |
| 집계 소제목 | 위 `data-statement-formula`가 집계 행에도 동일 적용(행 라벨 「취득가액」·「필요경비」) | G-4 |
| 신고서 표 | 변경 없음 — `[data-print-id="form-table"] tr`+라벨 텍스트(기존 spec 패턴) | — |

톤: 신규 카드·배지 없음 → `ToneCard` 규약 해당 없음. 라벨 크기 정본 클래스 신규 사용 없음. 「원」 표기·내부 id 노출 없음(모든 문자열은 한국어 풀어쓰기·법정 용어).

---

## 6. E2E 계획

신규 `e2e/transfer-split-acq-result-display.spec.ts` (워크트리 실행 `E2E_PORT=3134`). 시드는 본 설계 §1.2 값 — **수치는 vitest anchor가 정본**, E2E는 「입력→계산→**4뷰가 같은 값을 보인다**」 배선 확인.

| ID | 시나리오 | 단언 |
|---|---|---|
| R1~R6 | 단건 6조합(실/실·실/환·환/실·환/환·실/감정·매매사례/실) | request body에 `landAcqMode`/`buildingAcqMode`·가액 · 신고서 합계 취득/경비 · `[data-statement-row="취득가액"]`의 값 = 신고서 합계 · `[data-statement-formula="취득가액"]`에 「토지(…)」「건물(…)」 · 「(실제 거래가액)」 부재(비실가 포함 조합) · 카드 `split-card-acq-mode-*` 라벨 |
| R7 | 4뷰 일치 불변식(R2) | 카드 합 = 신고서 = 명세서, `양도가액 − 취득가액 − 필요경비 = 양도차익`(화면 숫자 파싱) |
| R8 | 미등기(R2 조합) | 카드 「× 0.3%」 · `split-card-lump-base-building` 텍스트 |
| M1 | 컴패니언(자산 2건) R2 조합 | 신고서 주 자산 열 취득/경비 · 명세서 합계 · 소제목 혼합 문구 |
| M2 | 다건(이력 시드 `putCalculationRecord`) R2 조합 | 합산 신고서 건1 열 · 합산 요약 카드 「전체 취득가액」 · 건별 상세 신고서 |
| M3 | 다건 평범한 환산 토지(G-4) | 소제목 「자산별 환산취득가 합계」 |
| G1 | 일반건물 실가/환산 | 토지(실가) 자산별 산식에 「×」 부재·「실거래가」 · 소제목 혼합 문구 |
| G2 | 일반건물 일괄 실가(같은 취득일 700,000,000) | 토지 산식에 **취득시** 기준시가(238,000,000) 사용 — 값 691,818,892을 산식이 만든다 |
| G3 | 일반건물 실가/실가 + stale 총액 | 「0 ×」·「999,000,000 ×」·「잔액 보정」 부재 |
| B1 | 겸용 별개 취득 회귀 | `mixed-use-separate-acq-*` 기존 spec 무변경 통과(분기 충돌 확인) |

⚠️ **기존 spec 영향 역방향 grep**(memory `feedback_display_string_change_needs_reverse_grep`): Do 전 `「(실제 거래가액)」`·`「자산별 실제 거래가액 합계」`·`「자산별 양도비 합계」`·`「실지취득가액」`(카드 헤더) 문자열을 `e2e/`·`__tests__/`에서 필드명이 아닌 **문구 패턴**으로 전수 검색 — 이 설계 시점 `__tests__`·`e2e` grep에서 집계 소제목 문구를 단언하는 곳은 0건(확인), 카드 「실지취득가액」·「× 3%」는 `SplitGainDetailSection`을 렌더하는 기존 테스트 2건(`owner-split-acq-building-std-field.test.tsx`·`sale-split-judgment-display.test.tsx`)과 e2e에서 단언하지 않음(grep 0건 확인). 다만 `buildStatementItems`를 호출하는 기존 anchor 10파일(`__tests__/tax-engine/transfer-tax/*display*`·`__tests__/calc/transfer-swap-acq-row-note-n5.anchor.test.ts` 등)은 split 입력이 아니라 영향 없음(코드 확인, Do 시 전수 실행).

---

## 7. Pre-Do anchor

`__tests__/components/split-acq-result-display.c.predo.anchor.test.tsx` — **활성 37 passed · skip 21**(`C_UNSKIP=1` 실행: **20 failed · 38 passed**, 즉 skip된 21건 중 20건이 현행에서 RED, 1건은 실가/실가의 우연 일치로 GREEN — 「구별력 0 ≠ 그 분기가 맞다」 확인용으로 둔 것).

| 블록 | 활성(현행 고정) | skip(수정 후 기대, `redUntilDo`) |
|---|---|---|
| 단건 6조합 | 엔진 파트값=기대 · `usedEstimatedAcquisition===false`·`estimatedBase` 부재·`result.expenses===0` · 신고서 합계=파트 합 · 명세서 취득값 = 파트 합 + 개산공제·필요경비 0·「(실제 거래가액)」 | 명세서 취득 = 파트 합 · 필요경비 = 개산공제 합 · 소제목 「토지(…) … 건물(…)」 |
| 다건 echo 6조합 | `p.splitDetail` 실재 · `acquisitionPrice===0`·`necessaryExpense===취득합+개산공제` | `acquisitionPrice===Σ파트`·`necessaryExpense===개산공제 합`·항등식 |
| 집계 소제목 | 어댑터 상수 false → 「자산별 실제 거래가액 합계」 | (E2E M3로 갈음 — 소제목 leaf는 신규 export라 anchor에서 import 불가) |
| 일반건물 Q-F | 실응답 발췌 fixture로 4종 거짓 등식(산술 `1,956,162,578×238,000,000÷920,550,000=505,748,404` 포함) | 실가 파트 「×」 부재·「실거래가」 · 실/실 「0 ×」·「잔액 보정」 부재 |
| 카드 H-6 | 엔진 미등기 150,000 · 카드 「× 3%」 | 「× 0.3%」 |

**GB fixture는 응답 발췌**(`aggregated.generalBuildingValuationDetail`·`properties[]` — 손으로 만든 값이 아님). 미포함: H-7(swap)·Q-F-4(일괄 실가 분모)·소제목 leaf — Do 단계에서 leaf가 생긴 뒤 anchor 추가(Q-F-4는 fixture를 실응답 `G-bundled-actual`로 추가 예정).

---

## 8. 14지점 점검 (CLAUDE.md DoD)

| 지점 | 해당 | 비고 |
|---|---|---|
| ① 폼 타입 · ② initial · ③ normalize | ✗ | 신규 입력 필드 0 |
| ④ API 변환 · ⑬ body spread | ✗ | 요청 불변 |
| ⑤ UI 입력 위젯 | ✗ | 입력 위젯 변경 0 |
| ⑥ 사이드바 합계 | ✗ | 결과 화면에 사이드바 없음(실측 스크린샷) — `separateAcqPartsSum` 불변 |
| **⑦ 결과 카드·명세서·신고서** | **✓** | 본 문서 §3·§4 |
| ⑧ validate | ✗ | **UI 통과↔validate 차단 모순 발생 불가**(표시 전용). 자동 안분 fallback 없음 |
| ⑨⑩⑪⑫⑭ Zod·Route | ✗ | 요청 스키마 불변. **결과** echo 추가(E-U1~3)는 route 응답 객체 통과 — `splitDetail`은 `pickValuationDetails`가 이미 복사(`transfer-tax-aggregate-pickers.ts:48`), GB 카드 echo는 `generalBuildingValuationDetail` 복사 |
| 어댑터 화이트리스트(⑦ 부속) | ✓ 점검 | `aggregateToFilingResult`·`breakdownToFilingResult`는 새 필드 싣지 않음(상수 false 유지 — §3.4). `mixedUseToFilingResult` 불변 |
| 정책 3종 | ✓ 준수 | useEffect→store 미러링 없음 · 자동 안분 fallback 없음 · validate 동기화 대상 없음 |

---

## 9. 사용자 결정 (Q-U-n) — 권장안 포함

| # | 질문 | 선택지 | 권장 | 근거 |
|---|---|---|---|---|
| **Q-U-1** | H-1의 정본 값을 어디서 가져오나 | (a) 엔진 leaf `summarizeSplitGain`(엔진 설계 E-2) import (b) UI가 `splitDetail`을 직접 합산 | **(a)** | 신고서가 이미 같은 합을 인라인으로 한다(`:479-490`) — 정의가 갈리면 swap(H-7) 같은 어긋남이 재발. 엔진 Do가 UI Do보다 먼저(시퀀셜)라 의존 가능. 엔진이 leaf를 안 내면 (b)로 후퇴하되 합 정의를 한 파일에 모은다 |
| **Q-U-2** | 4모드 라벨 어휘(현재 3종 혼재: 카드 「실지취득가액」 · 입력 라디오 「실거래가」 · 명세서 「(실제 거래가액)」, 엔진 steps 제안 태그 「실지거래가/감정가/매매사례가」) | (a) 입력 화면 정본 「실거래가·환산취득가·감정가액·매매사례가액」로 **전 뷰 통일**(카드 헤더도 변경) (b) 카드만 현행 유지 | **(a)** | 사용자가 입력한 단어가 결과에 그대로 나와야 검증이 된다(UI 순서=로직 순서 원칙의 표시판). 엔진 설계 Q-C8 승인 요청의 태그도 이 어휘로 맞춰 달라고 §10에 기재 |
| **Q-U-3** | 다건·컴패니언 H-5를 어디서 고치나 | (a) 엔진 echo(E-U1) 정정 + UI는 소제목·자산별 문구만 (b) UI 5곳이 `p.splitDetail`로 override | **(a)** | 합산 요약 카드·건별 신고서까지 한 곳으로 정정. (b)는 엔진 echo가 틀린 채 표시가 가려 다음 소비처가 또 틀린다. 세액 불변이지만 **합산 화면 숫자가 바뀌므로**(취득 0→312,500,000) 승인 필요 |
| **Q-U-4** | swap(§97②2호 단서) 파트가 있는 split의 표시 | (a) 취득가액 0 + 필요경비 = 직접경비(항등식 유지) + rose 고지(권장) (b) 현행(취득가액 미차감값을 그대로 표시 — 신고서 항등식 깨짐) (c) 단건 swap 축처럼 「취득가액 칸 = 나목」 | **(a)** | (c)는 파트에 자본적지출·양도비 구분 echo가 없어 불가능(`directExpenses` 하나뿐 — 코드 확인). (b)는 H-7 그대로. 신고서 split-2col 셀 값이 바뀌는 변경이라 확인 요청 |
| **Q-U-5** | 다건 건별 신고서(아코디언)에 토지/건물 열을 켜나 | (a) 안 켠다(카드가 파트를 이미 보임) (b) `splitDetail`을 어댑터에 실어 split-2col | **(a)** | (b)는 `formData` 의존(취득일 열)·열 구성 변경 — 이 Phase 범위 밖 |
| **Q-U-6** | G-4 소제목 정정 범위 | (a) 분리 자산 한정 (b) **집계 소제목 전체**(평범한 환산 토지 포함) | **(b)** | 같은 어댑터 상수가 원인이라 분리 한정은 같은 줄을 반만 고치는 것. 실측으로 평범한 환산 단일 자산도 거짓(M-L-est) |
| **Q-U-7** | Q-F 가드 방식 | (a) 엔진 echo `actualSource` 신설(E-U2) (b) `acquisitionMode==="actual"` 단독 가드(엔진 설계 답) (c) Σ카드=총액 항등식 | **(a)** | (b)는 일괄 실가 안분 산식(사례 35)을 같이 지움 — 카드 mode 동일(실측). (c)는 지분·증축 거동 미측정 |
| **Q-U-8** | Q-F-4(일괄 실가 안분 산식의 분모가 양도시 → 취득시여야 함)도 이번에 | (a) 포함 (b) 별건 | **(a)** | 같은 branch(`DetailedStatementGbFormulas.ts:288-311`)·같은 가드. 값(691,818,892)은 정확, 산식만 거짓 |
| **Q-U-9** | 신고서 split-2col LTHD의 float 재안분(`FilingFormTableHelpers.ts:627-629`)을 엔진 echo(E-1) 소비로 | (a) 소비 (b) 현행 | **(a)** | 엔진 설계 Q-C4와 동일 입장. 이 문서는 값 표시(취득·경비)만 다루고 LTHD 열은 엔진 echo 도착 후 별 커밋 |

---

## 10. 엔진 설계와의 대조·요청

엔진 설계(`transfer-split-acq-result-display.engine.design.md`)와 **충돌 없음**. 대조·보강 요청:

| # | 엔진 설계 | UI 입장 |
|---|---|---|
| I-1 steps 문구(H-2) | 엔진이 `step.formula` 정정 | ✅ 동의 — UI는 `gainStep.formula`를 그대로 읽는다(`DetailedStatementHelpers.ts:374`). 이 문서 §1.3에서 H-2 증상을 같은 화면에서 재확인(「취득가(0)」·「× 0%」) |
| I-2 H-1 값 | `summarizeSplitGain` 권장 | ✅ 채택(Q-U-1). **요청**: 반환에 `modeLabel`을 넣지 말고(`mode` 원값만) 라벨은 UI `sepAcqModeLabel`로(어휘 단일 — Q-U-2) |
| I-3 신고서 LTHD echo | 소비 권장 | ✅ 동의(Q-U-9) |
| I-4 G-4 | 「E-3 선택」 | **UI는 E-3 불요**: 집계 소제목은 §3.4의 echo 3종에서 파생. 대신 아래 E-U1 필요 |
| Q-F 답 | 「엔진 변경 0, `acquisitionMode` 가드」 | ⚠️ **불충분** — 실응답에서 `actual`이 파트 직접 입력/일괄 안분 두 의미(§2·§1.5). **E-U2 요청** |
| §2.4 「일반건물 별개 취득 해당 없음」 | steps는 정합 | ✅ steps는 맞다. 다만 **명세서 자산별 취득가액 산식(UI)**은 Q-F 4종이 있다 — 엔진 변경 없이 UI+E-U2 |
| Q-C8 어휘 | 태그 「실지거래가/환산취득가/감정가/매매사례가」 | **요청**: 「실거래가·환산취득가·감정가액·매매사례가액」로 통일(Q-U-2) |
| 엔진 설계에 **없는** 요청 | — | **E-U1**(다건 echo, §3.3) · **E-U2**(GB 카드 `actualSource`, §3.5) · **E-U3**(`SplitPartResult.lumpDeductionRate`, §3.6) |

**엔진에 남기는 요청 3건 (계약)**

| # | 대상 | 변경 | 불변 |
|---|---|---|---|
| E-U1 | `transfer-tax-aggregate.ts:545-563` | 분리 자산의 `acquisitionPrice` = `acquisitionDeducted` 합(`splitDetail` 소유 파트) | 세액·`transferGain`·`taxBaseShare` · 환산·swap·이월과세 분기(위에 두어 우선) · 분리 아닌 자산 |
| E-U2 | `general-building-route-actual.ts:454-470` · `types/general-building.types.ts` 카드 | `assetCards[].actualSource?` | 산식·값 |
| E-U3 | `transfer-tax-split-gain.ts:239-251` · `SplitPartResult` | `lumpDeductionRate?` | 산식·값 |

---

## 11. 확인 필요 (V-U)

| # | 내용 | 비고 |
|---|---|---|
| V-U1 | 겸용(`mixedUseDetail`) 응답에 `splitDetail`이 동시에 실리는지 | `!mixedUseDetail` 가드로 안전하나 실응답 미확인 |
| V-U2 | swap + split의 **화면** 실측(함수 실행 `buildRows`만 확인) · 명세서 swap 행 | H-7 |
| V-U3 | E-U1 후 `p.acquisitionPrice` 소비처 전수 — `MultiTransferTaxSummaryCard.tsx:50-51` · `FilingFormTableAggregateHelpers.ts:226` · `DetailedStatementHelpers.ts:262·325` 외 **저장된 이력(IndexedDB `resultData`) 재표시** 거동 | 옛 이력은 echo 값이 옛 것 — 재계산 시 신규. 문구는 저장된 값 그대로 |
| V-U4 | 지분(`#`)·증축 카드가 있는 일반건물에서 `actualSource` 분기 거동 · Σ카드=총액 항등식 대안 | 미측정 |
| V-U5 | 소유자 분리(`selfOwns≠both`) · 12억 초과 안분(1원 경계) × 신규 leaf 합 | 엔진 설계 M-9와 공통 — 합계 단정 금지 |
| V-U6 | 이월과세 A 채택 + split 병용 가능 여부(분기 순서 `:458-` 가정) | 미측정 |
| V-U7 | PDF/인쇄(`장기보유특별공제 (0%)` 엔진 F-3) · 선택 출력 `availablePrintIds` — 신규 섹션 없음이라 영향 없을 것으로 보나 미실행 | 코드 확인만 |
| V-U8 | `sepAcqModeLabel` 이동 후 겸용 소비처(`MixedUseSeparateAcqRows.tsx`) import 무결성 | tsc로 확인 예정 |
| V-U9 | 다건에서 컴패니언 `landNature` 필수 등 시드 전제 — E2E 시드 값이 validate를 통과하는지(M1) | 프로브에서 `landNature:"standalone"`로 통과 확인, spec 이식 시 재확인 |
| V-U10 | 일반건물 명세서 필요경비 쪽 `actualPartFormula`의 실가/감정·매매사례 라벨(「실지거래가액 파트라…」)이 새 어휘(실거래가)와 어긋나는지 | 문구 정합(Q-U-2 영향) — Do에서 점검 |

---

## 12. 자가 점검

- [x] 재실측: 주택 6조합(단건 6 · 다건 6 · 컴패니언 3) · 일반건물 6조합 + stale + 일괄 실가 · 미등기 · 환산 토지(G-4) — 응답 JSON·화면 텍스트 기록
- [x] H-1·G-4 수정안: 분기 플래그 = 응답 실재 값(§2)
- [x] Q-F 가드 설계(E-U2) + 대안 기각 근거(실측)
- [x] 결과뷰 전수: 단건 카드·신고서·명세서·다건 신고서·명세서·요약·건별 상세·컴패니언·일반건물·겸용
- [x] testid · E2E · 사용자 결정 · 확인 필요 · 14지점
- [x] 정책 3종(useEffect 미러링 · 자동 안분 fallback · validate 8번째) 위반 없음 — 표시 전용
- [x] Pre-Do anchor 작성·실행(37 passed · skip 21 · `C_UNSKIP=1` 20 RED)
- 코드 수정 0 · 커밋·push 0

---

## 13. 구현 메모 (Do · 2026-10-07 — 설계 대비 차이만 기록)

계획서 「C-통합」 결정 1~10이 최우선이다. 설계와 다르게 구현한 곳과 그 사유.

| # | 설계 | 구현 | 사유 |
|---|---|---|---|
| 1 | §3.1 `sepAcqModeLabel`을 `shared/part-acq-mode-label.ts`로 이동 | **이동하지 않고** 엔진 leaf `splitAcqModeLabel`을 단일 소스로 삼아 `sepAcqModeLabel = splitAcqModeLabel`로 위임 | 엔진 Do가 같은 어휘의 leaf를 이미 냈다(결정 9) — UI 사본을 새로 만들면 어휘가 두 곳이 된다. 겸용 소비처 import 경로 무변경 |
| 2 | §3.1 문구 꼬리 「토지·건물 **취득일이 달라** 파트별로 산정」 | 「토지·건물 파트별 산정 (소득세법 §97①1호 가목·나목)」 | `splitDetail`은 별개 취득뿐 아니라 소유자 분리·PHD·일반 주택 비-별개(`stdSplit`)에도 실린다 — 「취득일이 다르다」는 후자에서 거짓이 된다. 취득일 판별 echo가 없고 폼 플래그로 추론하지 않는다 |
| 3 | §5 `data-statement-formula` 신설 | **신설하지 않음** — 기존 `data-statement-row` + `textContent`로 단언 | 자산별 펼침이 닫힌 상태에서 `hidden`이라 `innerText`에는 빠지지만 `textContent`에는 있다(인쇄 시 항상 펼침). 속성 추가 없이 같은 단언이 된다 |
| 4 | §3.4 어댑터 상수 `false`는 유지하고 소제목만 파생 | **상수를 echo 파생으로 교체**(`allEstimated(aggregateAcqModes(...))`) — 결정 6 「하드코딩 false 제거」 | `usedEstimatedAcquisition`은 `TransferTaxResult`의 필수 필드라 삭제할 수 없다. 전부 환산일 때만 true — 소비처는 `estimatedBase`를 함께 보므로(어댑터는 싣지 않음) 신고서 환산 분기는 종전과 같이 비활성 |
| 5 | §3.7 H-7 「`FilingFormTableHelpers.ts:479-490` 인라인 합을 leaf 호출로」 | 합계 열은 `summarizeSplitGain`, **열별 셀은 엔진 leaf에 `splitPartAcquisitionDeducted`를 추가**해 소비 | 비소유 파트(취소선 열)까지 같은 정의를 읽어야 열별 항등식이 선다. 합계 leaf와 한 정의(`summarizeSplitGain`도 이 함수를 호출) |
| 6 | 엔진 보고 #2 「`transfer-per-asset-summary.ts` 취득가액을 echo로」 | `splitDetail`이 실린 집계 속성에만 적용 + `depAlreadyDeducted = true`. **파일 749줄이라 직접값 추출부(`parseRaw`·`directAcqRaw`·`directExpenseRaw` 등)를 `transfer-per-asset-direct.ts`로 분리**(749 → 593줄) | 비분리 자산에 일괄 적용하면 §97③ 감가상각비를 이중 공제할 수 있다(엔진 `acquisitionPrice`는 공제 후 값). 800줄 정책 기회주의적 분리 |
| 7 | 엔진 보고 #1 (판단 후 처리) | **포함** — `buildExemptEarlyResult`가 `splitDetail`을 싣는다(`buildTransferResultDetails` 인자로 — 결과 객체에 직접 필드를 쓰면 뒤의 `...buildTransferResultDetails()` 스프레드가 `undefined`로 덮어쓴다) | 화면 실측(§14)으로 비과세 표시와 모순 없음. 세액 불변 |
| 8 | §3.5 Q-F 가드 | 실거래가 파트 직접 입력은 **증축분(건물2) 제외** — 건물2는 별도 「사용자 직접 입력 (증축 실거래가)」 문구가 이미 있다 | 증축 + part_input 조합의 거동은 미측정(V-U4) — 건드리지 않는다 |
| 9 | §11 V-U10 `actualPartFormula` 「실지거래가액 파트라」 | 「**실거래가 파트라**」(결정 9 라벨 통일) | 기존 anchor 1건(`gb-part-appraisal-result.a2`) 문구 추종 |
| 10 | — | 일반건물 3-way 표 배지 「(환산)」 → 「(환산취득가)」 | 결정 9 — 같은 4모드 어휘. 기존 anchor 3건(`gb-extension-4mode-ui`) 문구 추종 |
| 11 | §3.9 `FilingFormTableHelpers.ts` 746 → ~735(순감소 예고) | 합계 블록이 swap 안내 루프·echo 소비로 +13줄 → 759줄(위험구간 ≥750). **날짜·기간·카드 취득일·장특 재안분 헬퍼를 `FilingFormTableDateHelpers.ts`로 분리**(759 → 657줄, 기존 이름 re-export) | 800줄 정책 기회주의적 분리(≤700 착지) |

### 신규 testid
`split-card-acq-mode-land|building` · `split-card-acq-land|building` · `split-card-lump-base-land|building` (`SplitGainDetailSection`).

### 14. 화면 실측 (Do · E2E_PORT=3134, 설계 §1 시드와 같은 값)

비과세(엔진 보고 #1) — 1세대1주택 · 900,000,000 · 토지 실가 200,000,000 + 건물 환산:

| 화면 | 수정 전 | 수정 후 |
|---|---|---|
| 단건 신고서 | 합계 열 1개 · 취득 314,000,000 · 필요경비 「-」 | 토지·건물 열 · 취득 312,500,000 · 필요경비 1,500,000 · 비과세 양도차익 586,000,000 · 과세대상 0 |
| 단건 명세서 | 「취득가액 314,000,000 (실제 거래가액)」 | 「토지(실거래가) 200,000,000 + 건물(환산취득가) 112,500,000 …」 · 필요경비 1,500,000 |
| 단건 카드 | **없음**(`splitDetail` 미탑재) | 파트 값 표시 · 장특공제율 0% · 장특공제액 0 (비과세라 장특 미계산 — 모순 없음) |
| 다건 건1 합산 신고서 | 취득 0 · 필요경비 314,000,000 | 취득 312,500,000 · 필요경비 1,500,000 |
| 다건 합산 요약 | 전체 취득가액 −100,000,000 · 전체 필요경비 −314,000,000 | −412,500,000 · −1,500,000 |
| 세액 | 결정세액 0 · 다건 합산 결정세액 38,390,000 | **동일**(총 납부세액 42,229,000 불변) |
