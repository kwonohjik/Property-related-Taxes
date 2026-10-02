# 양도세 — 감가상각비 취득가액 차감(§97③) 신설 · 자본적지출 필요경비 표시 전환

- 작성: 2026-10-02 · 브랜치 `fix/transfer-input-ui-gaps` (워크트리 `.claude/worktrees/transfer-input-ui-fix`, 기준 `00b790f08`)
- 요청(사용자):
  1. 사업용 건물 양도 시 사업소득 계산에서 필요경비로 계상한 **감가상각비를 취득가액에서 차감**하는 기능이 없다 →
     **취득가액 입력 단계**에서 감가상각비 계상액을 받아 취득가액에서 제외.
  2. 결과탭 신고서 양식이 **자본적지출을 취득가액에 합산**한다 → 취득가액에 합산하지 말고 **필요경비에 합산**해 표시.
     실측(사용자 화면): 양도 50,000,000 · 취득 28,500,000 · 자본적지출 1,000,000 · 양도비 700,000 →
     신고서 「취득가액 29,500,000 · 필요경비 700,000」. 기대: 「취득가액 28,500,000 · 필요경비 1,700,000」.
- 조사: 엔진(transfer-tax-senior)·UI(transfer-tax-ui-senior) 병렬 read-only 조사 + 본 세션 직접 검증.
  file:line은 `00b790f08` 기준 — **착수 전 현행 코드로 재확인**할 것(머지 후 드리프트).

---

## 0. 구현 현황 (2026-10-02)

| Phase | 상태 | 커밋·검증 |
|---|---|---|
| A 자본적지출 표시 전환 | ✅ 구현 | `3d91f0aac` · anchor 15 · E2E 1 · 뮤테이션 probe(swap·이월과세 예외 leaf) |
| B 감가상각비 — 일반 경로(주택·건물·상가) | ✅ 구현 | 엔진 anchor 25 · 표시 anchor 11 · 클라이언트 anchor 20 · route anchor 4 · E2E 4 |
| B-2 일반건물(토지+건물 일괄) | ✅ 구현 | route anchor 3 · 카드/swap anchor 6 · E2E 2 |
| C 파트 분리 경로(토지·건물 별개 취득 split · 겸용 · PHD · 다필지) | ⏳ 미착수 | validate가 사유와 함께 차단(`depreciation-scope.ts`) |

**구현 중 확정·변경된 설계** (계획서 본문과 다른 점):

- **GB 입력 필드는 새로 만들지 않았다** — 자산 단위 `depreciationAmount` 하나를 쓰고, 일반건물에서는 라벨만 「건물분」이며
  엔진이 **원건물 카드(`building`·`building#n`)에만** 싣는다(`general-building-depreciation.ts`). 토지·증축분(`building2`)은 불변.
  (계획서 §3.2는 `buildingDepreciationAmount` 파트 필드를 가정했다 — 일반건물의 「분리」는 파트별 취득가액·모드이지
  단건 엔진 split 축이 아니라 같은 칸으로 충분했다.)
- **자산 종류 게이트는 한 술어** `lib/calc/depreciation-scope.ts` — ⑤ 입력 칸(`DepreciationField`)·⑧ validate·⑥ 사이드바가 공유.
  받을 수 없는 구조는 칸을 숨기고 사유를 고지하며, 남은 값은 validate가 「0으로 지우세요」로 막는다.
- **엔진 echo** `depreciationAmount`(실제 공제액, swap이면 비어 있음) — 신고서·명세서·다건 자산 열이 공제 전 echo(`estimatedBase`)에서
  이 값을 한 번만 뺀다. `swapComparison.depreciation`은 비교에 쓰인 값.
- **환산 가산세 base(V-2)는 공제 전 `estimatedBase` 유지** — 조문이 「환산취득가액」을 지칭한다.
- **취득가액 초과분은 취득가액까지로 절삭**(엔진) — 실가 매매는 ⑧이 먼저 막고 환산·감정·일반건물은 엔진 절삭만 있다(V-9: 환산에서의
  초과 입력은 사용자에게 알리지 않는다 — Phase C 전에 고지 여부 결정 필요).
- **이월과세·부담부증여** — 엔진은 `depreciationAmount`를 지워(이중 공제 방지) validate가 먼저 막는다.
- **막다른 길 방지(동기화 점검 H-1, 2026-10-02)** — 자산 종류를 바꾸면 값은 남고 칸은 사라진다.
  ① ④(단건·다건·컴패니언·일반건물)는 `depreciationSupport` ≠ ok면 값을 **보내지 않는다**(토지로 바꾼 뒤 stale 값이 엔진에 새면
  토지 취득가액에서 감가상각비가 빠진다). ② **건물 없는 자산**(`not_applicable`)의 남은 값은 validate가 막지 않는다(칸·안내가
  없는 상태에서 막으면 dead-end). ③ **받을 수 없는 구조**(`unsupported`)는 validate가 막되, 안내 카드에 「이전에 입력한 감가상각비
  지우기」 버튼(`data-field="depreciationAmount"`)을 둬 메시지가 가리키는 칸이 실재한다.
- **echo 보강(M-1)** — 양도차손(`transfer-tax-loss-return.ts`)·§155⑳ 장기임대 특례(`transfer-tax-rental-housing-step.ts`) 반환도
  `depreciationAmount`를 싣는다 — 비우면 집계 역산 필요경비가 `E − D`(음수 가능)로 오염된다.
- **결과 카드(M-2·M-3)** — 상가 환산 카드 산식은 `(환산취득가 − 감가상각비)`, swap 안내 카드는 「환산취득가 − 감가상각비 + 개산공제」로
  적는다(`swapComparison.depreciation`, 일반건물은 `resolveGeneralBuildingSwap`이 `depreciationTotal`·파트별 `depreciation`을 싣는다).

**알려진 한계 (동기화 점검 Low — 이번에 고치지 않음)**:
- L-1 `computeTransferSummary`(`calc-wizard-store.ts`)의 `totalAcqPrice`는 공제 후 값이 아니다 — 화면 소비처 없음(죽은 필드로 보임, 확인 필요).
- L-2 `TRANSFER.DEPRECIATION_DEDUCTION` 상수는 manifest 키워드 검증용으로만 있고 코드 사용처가 없다.
- L-3 한도 검증(`감가상각비 ≤ 취득가액`)은 매매 실가에만 있다 — 신축·상속·증여·환산·일반건물은 엔진이 조용히 절삭한다(V-9).
- L-4 `BundledAllocationCard`의 「건물분 취득가액 (상속개시일 평가액)」 라벨에 공제 후 값이 표시될 수 있다.
- L-5 가업상속 override(`transfer-tax-acquisition-override.ts`)는 §97의2④ 의제취득가액에서도 감가상각비를 공제한다 — **법적 타당성 확인 필요**.
- L-6 상가 환산의 절삭 한도는 환산 총액(토지 포함)이다 — 조문·판례는 건물분이다.
- PDF(`lib/pdf/ResultPdfTransferSections.tsx`)의 취득가액은 raw 엔진 값이라 공제 후 값과 일치하는지 **확인 필요**.

---

## 1. 법령 근거 (KoreanLaw MCP로 본문 확인)

| 근거 | 내용 | 이 계획에서의 의미 |
|---|---|---|
| 「소득세법」 §97① | 필요경비 = 1호 취득가액(가목 실지거래가액 / 나목 매매사례·감정·환산) + 2호 자본적지출액 등 + 3호 양도비 등 | 자본적지출은 **취득가액(1호)이 아니라 별개 호(2호)** |
| 「소득세법」 §97③ | 「제2항에 따라 필요경비를 계산할 때 양도자산 보유기간에 그 자산에 대한 **감가상각비**로서 각 과세기간의 사업소득금액을 계산하는 경우 필요경비에 산입하였거나 산입할 금액이 있을 때에는 이를 제1항의 금액에서 공제한 금액을 그 **취득가액**으로 한다.」 | 항목 1의 직접 근거. §97②1호(실가)·2호(그 밖) **양쪽에 걸린다** |
| 「소득세법 시행령」 §163② | 현재가치할인차금 상각액을 필요경비로 산입한 경우 취득가액에서 공제 | 같은 구조의 형제 규정 — **이번 범위 아님** |
| 「소득세법 시행규칙」 별지 제84호서식 **부표3** | ① 매입가액 등 + ③ 가산항목 − **④ 차감항목 「감가상각비」(코드 141)** = **⑤ 계**. 기타필요경비: ⑥ 자본적지출액 + ⑦ 취득후 쟁송비용 + ⑧ 기타비용 = ⑨, 양도비 ⑩+⑪ = ⑫, **⑬ 기타 필요경비 계 = ⑨+⑫** | ④는 취득가액 쪽 차감 · 자본적지출은 ⑬(필요경비) 쪽 |
| 별지 제84호서식 **부표1** 작성방법 9·11 | ⑫ 취득가액 = 부표3 ⑤ / ⑭ 기타필요경비 = **부표3 ⑬**(실가) · 매매사례·감정·환산·기준시가는 「소득세법 시행령」 §163⑥ 참조 | **현행 「자본적지출 → 취득가액 합산」 표시는 서식과 반대** |
| 조세심판원 조심2013서4988(2014.3.19. 기각) | 처분청이 §97③에 따라 **환산가액**에서 임대사업 필요경비에 산입한 **건물분** 감가상각누계액을 공제한 금액을 취득가액으로 한 처분은 잘못 없음. 「매매사례가액·감정가액·환산가액을 적용하는 경우라 하여 이를 달리 적용한다는 규정이 없다」. 환산가액에 잔가율이 이미 반영돼 이중공제라는 주장 배척 | 환산·감정·매매사례 모드에도 차감 / 귀속은 **건물분** |
| 조심 2015중5783(2016.3.10. 기각) | 공장 건물 — 환산취득가액에서 사업소득 필요경비 산입 감가상각비 차감 처분 정당 | 동지 |

> ⚠️ 개산공제(「소득세법 시행령」 §163⑥)는 **취득 당시 기준시가 × 3%**라 취득가액(환산가액) 크기와 무관하다
> — 감가상각비 차감이 개산공제 금액을 바꾸지 않는다. (조사 단계의 「개산공제 기준이 차감 전/후냐」 쟁점은 성립하지 않음)

---

## 2. 현행 동작 (검증된 사실)

### 2.1 항목 2 — 자본적지출 표시

엔진은 정확하다 — 자본적지출은 **필요경비로 차감**된다(`lib/tax-engine/transfer-tax-helpers.ts:262` 실가 `capExp + trExp`).
**표시층만** 「신고서 양식 표시 관행」이라는 주석으로 자본적지출을 취득가액 칸으로 옮긴다. 세액 불변.

| 지점 | 현행 |
|---|---|
| 단건 신고서 실가 분기 `components/calc/results/transfer/FilingFormTableHelpers.ts:529-539` | `displayAcqPrice = 역산 + capExp` · `displayExpenses = max(0, 엔진필요경비 − capExp)` (§97②2호 단서 swap도 이 분기로 떨어짐) |
| 다건·일괄 자산 열 `FilingFormTableAggregateHelpers.ts:221-224` | `p.acquisitionPrice + p.capitalExpenditureForDisplay` / `p.necessaryExpense − capEx` |
| 상세명세서 `DetailedStatementHelpers.ts:256-263·318·327·353` + leaf `exempt-gross-gain.ts:44-55 inverseAcquisitionForDisplay(+capEx)` | 합산 |
| 명세서 산식 문구 `DetailedStatementFormulaBuilders.ts:60-61·428·441-444·537-546·606-609` · `DetailedStatementGbFormulas.ts:238-246·376-381` | 「취득가액 X + 자본적지출 Y」, 「자본적지출(취득가액 흡수)」 등 |
| 엔진 echo 타입 주석 `types/transfer-result.types.ts:136-141` · `types/transfer-aggregate.types.ts:190-194` | 「신고서 양식상 취득가액에 합산되어 표시」를 계약으로 명시 |

**이미 합산하지 않는 곳**(같은 화면에서 표시가 이미 갈려 있다): 환산 본문 분기(`FilingFormTableHelpers.ts:487-526`, 미차감 고지만) ·
토지·건물 split 2열 · 겸용 4열 · 재개발 · `MultiTransferTaxSummaryCard` · PDF(`lib/pdf/ResultPdfTransferSections.tsx` — raw 값) ·
필지 상세(`TransferTaxResultView.tsx:99-105`).
⇒ 전환 후 신고서·명세서가 PDF·요약카드와 **같은 축으로 수렴**한다(PDF·요약카드는 손대지 않는다 —
memory 「PDF·요약카드 신고서 축 통일 재제안 금지」와 충돌 없음).

### 2.2 항목 1 — 감가상각비

양도세 엔진·UI·API 어디에도 없다(`lib/tax-engine/legal-codes/transfer.ts`에 §97③ 상수도 없음).
단건 일반 경로의 취득가액·차익은 `calcTransferGain` 한 곳에서 정해진다(`transfer-tax-helpers.ts:347-400`):

```
acquisitionCostBase = 환산(:347) | 감정(:366) | 매매사례(:378) | 실가(:393)
necessary = calcNecessaryExpense(...)                  // 단서 비교 estimatedSide = estimatedBase + estimatedDeduction (:270)
acqCostForGain = swap ? 0 : acquisitionCostBase         // :399
gain = transferPrice − acqCostForGain − expensesApplied // :400 (클램프 없음)
```

상속·증여 §163⑨·의제취득일 전·가업상속 override·이월과세(재귀)는 여기로 **수렴**한다.
**우회·재구성 지점**(입력을 실가 형태로 다시 짜면서 `capitalExpenditure: undefined`로 지움): 상업용건물 환산
`transfer-tax-commercial-step.ts:155-163` · 부담부증여 `transfer-tax-burdened-gift-step.ts:80-85` · 이월과세
`transfer-tax-carryover.ts:332-337` · 일반건물 카드(`general-building-route-cards.ts:157`).
**별도 산정 경로**: 토지·건물 별개 취득 split(`split-gain.ts`) · PHD · 겸용(`transfer-tax-mixed-use*.ts`) · 다필지 · 재개발.

---

## 3. 설계

### 3.1 항목 2 — 「취득가액 = 부표3 ⑤ / 필요경비 = 부표3 ⑬」으로 표시 규칙 전환 (Phase A)

정본 규칙: **취득가액 칸 = 엔진이 양도차익에서 차감한 취득가액**, **필요경비 칸 = 엔진이 차감한 필요경비 전액**(자본적지출 + 양도비).
항등식 「양도가액 − 취득가액 − 필요경비 = 전체 양도차익」은 그대로 유지된다(capEx를 한쪽에서 빼서 다른 쪽에 더하던 것을 멈출 뿐).

| # | 변경 | 파일 |
|---|---|---|
| A-1 | 단건 신고서 실가 분기에서 `+ capExp` / `− capExp` 제거 | `FilingFormTableHelpers.ts` |
| A-2 | 다건·일괄 자산 열 동일 | `FilingFormTableAggregateHelpers.ts` |
| A-3 | 표시 leaf `inverseAcquisitionForDisplay`에서 `+capEx` 제거 → 명세서 합계·perAsset이 모두 이 leaf를 경유하도록 정리(현재 사본 6곳이 각자 `+capEx`) | `exempt-gross-gain.ts` · `DetailedStatementHelpers.ts` |
| A-4 | 명세서 산식 문구: 취득가액 산식에서 「+ 자본적지출」 제거, **필요경비 산식을 「자본적지출 Y + 양도비 Z」로 풀어쓰기**(§97① 2호·3호 법조문 링크) | `DetailedStatementFormulaBuilders.ts` · `DetailedStatementGbFormulas.ts` |
| A-5 | echo 타입 주석의 「취득가액에 합산 표시」 계약 문구 정정. 필드 `capitalExpenditureForDisplay`는 **유지**(필요경비 산식 분해용) | `types/transfer-result.types.ts` · `types/transfer-aggregate.types.ts` |
| A-6 | 테스트 내부에 표시식을 **복제**한 로컬 헬퍼 갱신(통과해도 stale) | `__tests__/tax-engine/transfer/aggregate-carryover-adopted-acquisition-price.anchor.test.ts:68-80·188·292` |

**§97②2호 단서(swap) 표시 — ✅ 결정(Q-1): 현행 유지.** 전환은 **실가 모드만**이다.
swap은 현재 실가 분기로 떨어지므로(`estimatedDisplay = null`) A-1~A-4의 각 지점에 **`swapApplied`이면 종전 규칙
(취득가액 = 자본적지출 · 필요경비 = 양도비)** 분기를 명시적으로 남긴다. 판정은 엔진 echo(`result.swapApplied` ·
다건 `filingDisplay`)로 하고, 단건·다건·명세서가 같은 술어를 쓰도록 leaf 하나에 둔다(사본마다 판정하면 갈라진다).
⇒ swap anchor 3파일은 **그대로 초록이어야 한다** — 회귀 안전망으로 쓴다:
`__tests__/components/swap-97-2-display-identity.anchor.test.ts` · `__tests__/calc/transfer-swap-acq-row-note-n5.anchor.test.ts` ·
`e2e/transfer-swap-97-2-statement.spec.ts`. 단 swap anchor 헤더의 「현행 단건 신고서가 이미 그 축(관행)」 서술은
「swap은 예외로 유지」로 문구만 정정한다.

### 3.2 항목 1 — 감가상각비 차감 (Phase B: 일반 경로 / Phase C: 파트 분리 경로)

**엔진 (Phase B)**

- 입력: `TransferTaxInput.depreciationAmount?: number` (`types/transfer.types.ts:240` `capitalExpenditure` 옆). 원 정수, 미입력=0.
- 적용 지점: `calcTransferGain`에서 `acquisitionCostBase`가 정해진 직후 **모든 모드**(실가·감정·매매사례·환산 본문)에
  `acquisitionCostBase − depreciationAmount` (§97③ · 조심2013서4988).
- echo(표시 전용, echo-field 패턴): `depreciationDeducted`(차감액) · `acquisitionPriceBeforeDepreciation`(차감 전 취득가액).
  표시층이 재계산하지 않도록 엔진이 싣는다(UI↔엔진 단일 진실).
- **§97②2호 단서 비교 — ✅ 결정(Q-2): 차감 후 값으로 비교.**
  가목 = `(환산취득가액 − 감가상각비) + 개산공제`, 나목 = `자본적지출 + 양도비`. 나목이 크면 swap(나목 채택) — 이때는
  환산취득가액 자체를 차감하지 않으므로(`acqCostForGain = 0`) **감가상각비를 따로 빼지 않는다**(뺄 취득가액이 없다;
  차감 효과는 가목 비교에 이미 반영됨). 이 해석은 사용자 결정이며 근거 해석례는 미확보(V-1) — 코드 주석에 그 사실을 남긴다.
  같은 비교식을 쓰는 **모든 단서 판정 지점**에 동일 적용: `transfer-tax-helpers.ts:270`(`calcNecessaryExpense` — 시그니처에
  감가상각비 전달) · 상업용건물 step `transfer-tax-commercial-step.ts:151` · 일반건물 `general-building-swap.ts:152-165`.
  (split `split-gain.ts:330-352`·겸용·다필지 단서는 Phase C.)
- 하류(장특·고가주택 §89①3호 안분·감면·§102② 통산)는 전부 `transferGain` 기반이라 **자동 추종**(`transfer-tax-taxable-gain.ts:34-73`).
- 우회·재구성 지점 처리:
  - 상업용건물 환산 step — 재구성 후 `useEstimatedAcquisition: false`(실가 축)로 내려가므로, step 안에서
    ① 가목을 차감 후 값으로 비교하고 ② 본문이면 `acquisitionPrice = 환산가 − 감가상각비`, swap이면 `0`으로 재구성한 뒤
    ③ 재구성 입력에서 `depreciationAmount: undefined`로 지워 `calcTransferGain`이 **두 번 빼지 않게** 한다(echo는 step이 싣는다).
  - 부담부증여·이월과세 — Phase B에서는 **validate 차단**(§4). 엔진 재구성부에서도 `depreciationAmount: undefined`로 명시 제거해 이중 차감·미검증 경로 진입을 막는다.
- 집계(다건) echo 역산식: `transfer-tax-aggregate.ts:561-580`의 `effectiveAcquisitionPrice`가 원시 `singleInput.acquisitionPrice`·`estimatedBase`(차감 전)를 쓰므로,
  그대로 두면 필요경비 역산이 `필요경비 − 감가상각비`로 오염된다 ⇒ `effectiveAcquisitionPrice`에서 `depreciationDeducted`를 뺀다
  (서식 ⑤ = ①+③−④와 일치). 단건 환산 표시(`estimatedDisplay.base`)도 같은 이유로 차감 후 값을 써야 한다.
- 법령 상수: `TRANSFER.DEPRECIATION_DEDUCTION = "소득세법 §97 ③"` (`legal-codes/transfer.ts:46-49` 부근) ·
  manifest `additions-transfer.ts:74-79` `NECESSARY_EXPENSES` 키워드에 「감가상각비」 추가 → `npm run verify:legal`로 법문 대조.

**UI·API (Phase B) — 14 동기화 지점** (`capitalExpenditure` 경로를 그대로 따른다)

| 지점 | 위치 |
|---|---|
| ① 폼 타입 `depreciationAmount: string` | `lib/stores/calc-wizard-asset.ts:185` 옆 |
| ② initial `"0"` | `lib/stores/calc-wizard-asset-factory.ts:113` 옆 |
| ③ normalize | `migrateAsset`의 `fillMissingFromFactory` backfill(`calc-wizard-asset-migrate.ts:666·708`) + 접근부 `?? "0"` 방어(V-4) |
| ④ API 변환 | 단건 `lib/calc/transfer-tax-api.ts:316-326`(지분이면 `applyRatio`) · 컴패니언 `transfer-tax-api-companion-payload.ts:333` · 다건 `multi-transfer-tax-api.ts:140·221` · 오류 라벨 `transfer-tax-error-format.ts:40` |
| ⑤ 위젯 | **③ 취득 섹션 끝**에 신규 `DepreciationField`(FieldCard + CurrencyInput, `data-field="depreciationAmount"`). `CompanionAcqPurchaseBlock.tsx`(782줄)에 넣지 않는다 — 별도 컴포넌트. 환산 모드엔 취득가액 금액 칸 자체가 없으므로(`CompanionAcqAmountSection.tsx:38`) 모드와 무관한 독립 위치가 필요 |
| ⑥ 사이드바 | 자산별 행 취득가액 raw `lib/stores/transfer-per-asset-summary.ts:181·241-246`에서 차감(실가 계열). 계산 후는 엔진 값 |
| ⑦ 결과 | 신고서 취득가액 칸 = 차감 후(A의 규칙으로 역산이 자연히 반영) + 단건 rose 고지 「감가상각비 X 차감 후 (소득세법 §97③)」 · 명세서 취득가액 산식 「실지거래가액(또는 환산취득가액) A − 감가상각비 B」 |
| ⑧ validate | 대상 자산·경로 게이트(§4) · 실가 계열 `감가상각비 ≤ 취득가액` · `fieldError("depreciationAmount", …)` + field-jump 케이스 등록(`transfer-validation-field-anchor-coverage.test.ts`·`-jump-cases.test.ts`) |
| ⑫ Zod | `lib/api/transfer-tax-schema-base-shape.ts:82` · 컴패니언 `transfer-tax-schema-companion.ts:221` (`z.number().int().nonnegative().optional()`) |
| ⑬ body | `transfer-tax-api-body-blocks.ts` · 다건 반환 객체 |
| ⑭ Route | 단건 `app/api/calc/transfer/engine-input.ts:47` · **다건 `multi/route.ts:157`(키 자체 열거 — 누락 시 침묵 strip)** · 컴패니언 `bundled-split-helpers.ts:437` |
| 가드 | 다건 키 분류 `lib/api/transfer-tax-schema-multi-refines.ts` + `__tests__/api/transfer.route.multi-key-coverage-f12.test.ts` — base-shape에 키를 넣으면 **먼저 빨개진다**(⑭ 매핑으로 분류) |

**Phase B-2 — 일반건물(토지+건물 일괄) ✅ 결정(Q-3): 1차에 포함.**

감가상각은 **건물분**에 귀속된다(조심2013서4988 「건물분 감가상각누계액」). 일반건물은 자본적지출을 이미
「자산 전체 칸 차단 → 건물·토지 파트 칸」으로 받는다(`transfer-tax-validate-gb.ts:377` · 파트 카드
`GeneralBuildingAcquisitionCardsParts.tsx:154-163` `buildingDirectExpenses`). 감가상각비도 같은 구조로:

- 폼: 파트 필드 `buildingDepreciationAmount`(건물 파트 카드에만 노출, 토지 파트엔 없음). 자산 전체 `depreciationAmount`는 일반건물에서 validate 차단.
- 엔진: 일반건물 카드 빌더가 건물 카드의 취득가액에서 차감 → 카드가 aggregate·`calculateTransferTax` 실가 축으로 들어갈 때는
  이미 차감된 값이어야 하며 `depreciationAmount`를 다시 싣지 않는다(이중 차감 방지). 환산 카드는 단서 비교(`general-building-swap.ts`)에 차감 후 값 사용.
- ④: `transfer-tax-api-gb.ts:504·644` + **지분 스케일 키 목록 `transfer-tax-api-gb-shares.ts:122-135`**(누락 시 지분 카드에서 침묵 소실) ·
  ⑫ `transfer-tax-building-schemas.ts:372` 인근 · ⑭ `general-building-route-actual.ts:116·232·405` · 환산 `general-building-entry.ts:239`.
- ⚠️ 파트 카드 컴포넌트는 토지·건물 **별개 취득(split)**과 공유된다(`LandBuildingSplitSection.tsx:541-547`). split 엔진(`split-gain.ts`)은
  별도라 Phase C — 위젯 게이트가 split에서 칸을 내지 않도록 술어를 분리한다.
- 착수 전 조사(V-8): 일반건물의 카드 생성 경로 전수(실가·환산·통합/분리 카드·지분·이월과세 카드 `general-building-route-carryover.ts`·
  증축 `general-building-extension.ts`·용도변경 주택 `general-building-converted-*.ts`)에서 건물 취득가액이 정해지는 지점.

**Phase C (별도 PR)** — 토지·건물 별개 취득(split, `buildingAcquisitionPrice`에서만 차감) · 겸용(상가 건물 파트) · PHD · 다필지.
자동 안분 fallback 금지. Phase B 동안 이 경로들은 **validate 차단**으로 막는다(§4).

---

## 4. 범위 · 게이트 (Phase B)

| 축 | 허용 | 차단(validate, 사유 고지) |
|---|---|---|
| 자산 종류 | `housing` · `building` · `commercial_building` · `general_building`(건물 파트 칸 — B-2) | `land`(건물 없음 — 칸 미노출) · `right_to_move_in` · `presale_right` · `redevelopment_apt`(권리 — 칸 미노출) |
| 취득 구조 | 일괄 단일 취득가액 · 일반건물 건물 파트 | 토지·건물 별개 취득(split)·겸용·다필지 → Phase C |
| 취득가액 모드 | 실가 · 감정 · 매매사례 · 환산(본문·단서 모두 — 단서 비교는 차감 후 값, Q-2) | — |
| 취득 원인 | 매매 · 상속 · 증여 · 신축 | 이월과세(증여자 감가상각 승계 여부 미확인) · 부담부증여 |

> 차단은 **입력 경로를 없애는 게 아니라** 「이 조합은 아직 지원하지 않습니다 (소득세법 §97③ — 파트별 입력 준비 중)」처럼
> 이유를 알리는 validate다(memory 「계획서 제외엔 코드 가드 필수」). 칸을 숨기는 게이트(⑤)와 막는 게이트(⑧)가
> 같은 술어를 쓰도록 단일 헬퍼로 둔다(memory 「⑤ 두 조건이면 ⑧·④도 두 조건」).

---

## 5. 결정 (사용자 확정 2026-10-02)

| Q | 결정 | 반영 |
|---|---|---|
| Q-1 swap 표시 | **실가 모드만 전환**, §97②2호 단서(swap)는 현행 유지(취득가액 = 자본적지출 · 필요경비 = 양도비) | §3.1 |
| Q-2 감가상각비 × 환산 단서 비교 | **차감 후 값으로 비교** — 가목 = (환산취득가액 − 감가상각비) + 개산공제. swap 채택 시 별도 차감 없음 | §3.2 (근거 해석례 미확보 — V-1, 코드 주석에 명기) |
| Q-3 일반건물 | **1차(Phase B)에 포함** — 건물 파트 칸 | §3.2 Phase B-2 |
| Q-4 순서 | **Phase A(표시) 먼저 머지 → Phase B** | §7 |

## 6. 미검증 (V)

- **V-1** §97③ 「제1항의 금액」의 범위와 §97②2호 단서 비교 시점 — 해석례·판례 미확보. Q-2는 사용자 결정으로 「차감 후 비교」를 채택했으나 법적 근거는 여전히 미확인 — 근거가 반대로 확인되면 단서 판정 지점 3곳(§3.2)만 되돌리면 되도록 비교식을 한 헬퍼에 모은다. 국세청 해석 「양도자산의 취득가액을 기준시가로 계산시 감가상각비의 취득가액 공제여부」(1994.6.21.)는 제목만 확인, 본문 미열람.
- **V-2** 환산 가산세(§114의2, 환산취득가액의 5%) 기준값이 차감 전 환산취득가액인지 — 권고는 **차감 전 유지**(조문이 「환산취득가액」을 지칭). 조문 대조 필요.
- **V-3** 차손 결과 경로(`transfer-tax-loss-return.ts`)는 `expenses`·`capitalExpenditureForDisplay` echo를 싣지 않는다 — 자본적지출 > 0인 차손 사례의 현행 신고서 표시 실측 필요(Phase A에서 확인).
- **V-4** 이력(IndexedDB) 재로드 경로가 `migrateAsset`을 경유하는지 — 호출부 미확인. ④·⑤ 접근부 `?? "0"` 방어는 유지.
- **V-5** 실가 모드 자본적지출 > 0을 실제 `buildRows`·`buildStatementItems`로 단언하는 테스트가 **없다**(조사 결과) — Phase A 착수 전 현행 표시를 고정하는 anchor를 먼저 쓰고(빨강 확인) 전환한다.
- **V-6** swap 외 E2E 중 신고서 취득가액 셀 값을 단언하는 spec 전수(`commercial-building-97-2-swap`·`general-building-97-2-swap`·`general-building-ext-97-2-swap`) — 셀 값 단언 여부 미확인.
- **V-7** 이 계획의 동작 서술은 정적 열람 기반이다. 브라우저·vitest 실측은 Phase별 anchor에서 한다.
- **V-8** 일반건물 카드 생성 경로 전수(§3.2 B-2) — Phase B-2 착수 전 조사.

## 7. 실행 계획 · 검증 기준

```
Phase A (표시 전환, 세액 불변)
 A0. anchor 선작성: 실가 capEx>0 단건·다건 신고서 + 명세서 — 사용자 사례(50,000,000/28,500,000/1,000,000/700,000)
     → 기대 「취득가액 28,500,000 · 필요경비 1,700,000 · 양도차익 19,800,000」 → verify: 현행에서 빨강
 A1~A6 구현 (swap 예외 술어 leaf 1곳) → verify: A0 초록 · 세액(결정세액) 전후 동일 단언 · 항등식(양도−취득−필요경비=양도차익) 4개 결과뷰
     · swap anchor 3파일 **무수정 초록**(회귀 안전망) · swap 예외 분기 뮤테이션 probe(분기 제거 시 swap anchor가 빨개지는지)
 A7. E2E: 단건 실가 capEx 시나리오 1건 (E2E_PORT 격리) · 역방향 grep(「취득가액 흡수」「가목 합산」「합산 표시」)

Phase B (감가상각비 — 일반 경로)
 B0. anchor 선작성(엔진): 실가 / 환산 본문 / 감정 / 상속 각 1건 — 양도차익 = 양도가액 − (취득가액 − 감가상각비) − 필요경비
     + 단서 경계 2건(감가상각비 때문에 본문→swap으로 뒤집히는 케이스 · 상업용건물 step swap에서 이중 차감 없음)
     + 감가상각비 0이면 종전과 완전 동일(긍정 짝) → verify: 현행 빨강
 B1 엔진 필드·차감·echo·legal-codes·manifest → verify: B0 초록 · npm run verify:legal
 B2 ⑫⑬⑭ + 다건 키 분류 → verify: multi-key-coverage 가드 초록 · route 단위 테스트(필드 생략=종전 세액, 값 있음=차감)
 B3 ①②③④⑤⑥⑧ + 차단 게이트 단일 헬퍼 → verify: validate anchor(허용·차단 매트릭스 §4 전 행) · field-jump 케이스
 B4 ⑦ 결과 표시(rose 고지·명세서 산식) → verify: 표시 anchor
 B5 E2E: 폼 입력 → 계산 → 결과 (Network body에 depreciationAmount 확인)
 B6 (B-2 일반건물) V-8 조사 → 건물 파트 칸·카드 빌더 차감·지분 스케일 키 → verify: 일반건물 실가·환산·지분 anchor
     + 일반건물에서 자산 전체 칸 차단 · 토지 파트에 칸 없음
 B7 ui-engine-sync-checker(14지점) · npx tsc --noEmit 0 · npm run test:transfer

Phase C (파트 분리 경로) — 별도 계획
```

공통: 워크트리는 husky 훅이 돌지 않으므로 푸시 전 `FULL_TEST=1 bash .husky/pre-push` 수동 실행 · E2E는 `E2E_PORT` 필수.
