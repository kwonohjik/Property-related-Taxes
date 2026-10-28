# 이월과세 — 당초 증여 때 인수한 채무 부분(매입분) PR-2(E2 일반건물 일반 양도 파트 · E3 주택 분리 계산 파트) · UI 설계서

> 작성 2026-10-28 · 워크트리 `feat/carryover-debt-pieces-parts`(master 7b99968a0) · 코드는 고치지 않았다(설계서 + throwaway probe 3건, 모두 삭제함).
> 계획서 [`docs/00-pm/carryover-gift-debt-purchased-part.plan.md`](../../00-pm/carryover-gift-debt-purchased-part.plan.md) §4.4 「E2·E3: 입력은 그대로(파트 채무 칸이 이미 있다). 조각 규칙만 파트마다 적용」 · Q-4 a(결과 A 열에 증여분·매입분 두 줄).
> 선행 [`carryover-gift-debt-purchased-part.ui.design.md`](carryover-gift-debt-purchased-part.ui.design.md)(PR-1, 머지됨) §2.5 (a) · §2.6 · §7.6 · Q-UI-3·4. **Q-UI-n은 이 문서 안에서 1부터 다시 센다**(PR-1 서의 Q-UI-1~5와 별개).
> 짝 문서 [`carryover-gift-debt-purchased-part-parts.engine.design.md`](carryover-gift-debt-purchased-part-parts.engine.design.md)(268줄)를 쓰는 도중에 읽고 대조했다. 엔진 설계서가 이후 바뀌면 §9를 다시 대조한다. 엔진 설계서의 핵심: **E2 전부 지원(R1~R5) · E3는 조각을 만들지 않고 현행 유지 + 결과 고지(c1, 권장)**.
> 검증 표기: 「실측」 = probe·실행 · 「코드」 = file:line을 읽어 확인 · 「확인 필요」 = 미검증. 법령 인용은 PR-1 설계서 §2.3·엔진 설계서 §1.2에서 KoreanLaw MCP로 확인한 문구를 쓰며 이 문서는 새 조문을 인용하지 않는다.

## 0. 요약

| 항목 | E2 (일반건물 일반 양도) | E3 (주택 분리 C·A·B) |
|---|---|---|
| ①②③ | 변경 0 — `giftDebtAssumed`·`giftAssumedDebt` 재사용 (`lib/stores/calc-wizard-asset-carryover.ts:104-106,173-174,236-237`) | 변경 0 |
| ④ | part 모양은 변경 0. **증여세 두 칸을 비우거나 산출세액 0이면 채무가 와이어에 안 실린다 → 변경 필요**(실측 §1.3) | 변경 0 |
| ⑤ | 안내줄 제거 + 토글 설명 교체 + 증여분 한정 hint. 차단 조합(감면·용도변경·건물 감가상각·증여자 신축)은 E1 패턴 | 갈래별(§4) — 권장(N)은 현행 유지 |
| ⑥ | **변경 필요 — 조각과 무관하게 이미 어긋난다**(실측 §3.5: 계산 후 취득가액 5억 vs 엔진 4억) | 0 (N) |
| ⑦ | PR-1 카드가 그대로 렌더되나 **일반건물 결과 소비자 6개 파일 19개 지점이 카드 id에 묶여 있다** | PR-1 컴포넌트가 렌더되지 않는 별개 카드. (N)은 `splitCarryoverNotices`에 T2 한 문장 |
| ⑧ | r = 1 규칙 + 차단 조합 거울 + 증여세 두 칸 규칙 | (S)일 때만 r = 1 |
| ⑬ | 변경 0 (`transfer-tax-api.ts:662`) | 변경 0 (`:451`) |
| ⑫ | 엔진 설계서 R5(refine 추가, shape 변경 없음). **증여세 칸 처리에 따라 달라진다 — Q-UI-6** | 0 (N) |
| 결과 고지 | T1(나눔) 카드 A 열 + PDF 한 줄 | T2(나누지 않음)는 **엔진 변경 없이** 가능 — echo가 이미 있다 |
| 사용자 결정 | Q-UI-1~8 (§7) | |

**PR-1 이월 사실 정정**: PR-1 UI 설계서 §7.5가 정한 S3(상세명세서)·S5(PDF)는 구현되지 않았다. `git show --stat 1baa255bd`에 해당 파일이 없고 `lib/pdf`의 `purchasedPartSplit` 검색이 0건이다(코드). §5가 이를 PR-2로 가져온다(Q-UI-4).

**엔진 설계서와 어긋나는 한 곳(합의 필요)**: 엔진 설계서 §3.1은 「와이어 입력은 그대로」라고 하나 이는 **part 모양에만** 참이다. 증여세 두 칸이 비면 ④가 engine 모양(`landCarryoverTaxation`)으로 내려가고 거기에는 채무가 없다(§1.3 실측). 엔진 설계서는 engine 모양 거부를 유지하므로(`rejectDebtPiecesKeyRefine`) 이 경로는 채무를 **조용히 버린다**. §3.3과 Q-UI-6이 두 해법을 낸다.

## 1. 실측 — PR-1 이후 E2·E3 현황

### 1.1 경로별 현재 상태

| 경로 | 범위 술어 | 토글 위치 | 채무 칸 | 안내 | ④ | ⑧ | ⑫ |
|---|---|---|---|---|---|---|---|
| E1 주택·토지·상업용 | `apply` | `CarryoverGiftDebtSection.tsx:65-113` | 〃 | — | `transfer-tax-api-carryover.ts:146` | `transfer-tax-validate-carryover-debt.ts:28-52` | `transfer-tax-schema-base-shape.ts:556` |
| **E2** 일반건물 일반 양도 | `numerator_only` | `CarryoverGiftBlock.tsx:412-427`(③ 필요경비 가산, 사건 블록에만) | `:499-512`(④, 토지 또는 단일 파트) · `:529-542`(분리 OFF 건물분) | `DebtNumeratorOnlyNote` | `transfer-tax-api-gb-carryover.ts:85,94`(**part 모양만**) | `transfer-tax-validate-gb-carryover.ts:105,172,179` | `transfer-tax-building-schemas.ts:116`(part) · `:66`+`:399,:404`(engine 모양은 **거부**) |
| **E3** 주택 분리 파트(C·A·B) | `numerator_only` | `SplitCarryoverParts.tsx:131-143`(`SplitCarryoverGiftTaxCard`, C·A·B 공용 — A·B는 `LandCarryoverCard.tsx:97-109`) | `:144-154` | 〃 | `transfer-tax-api-split-carryover.ts:99,106` | `transfer-tax-validate-split-carryover.ts:251-258` | `transfer-tax-schema-split-carryover.ts:81,218-222` |
| E4 일반건물 부담부증여 | `numerator_only` | E2와 같은 코드(`CarryoverGiftBlock.tsx:412`) | 〃 | 〃 | `gb-bg-gift-tax-return` 경로 | `validateGbBgGiftTax`(`transfer-tax-validate-gb-carryover.ts:154-185`) | — |

술어: `lib/calc/carryover-gift-assumed-debt.ts:43-48`(타입) · `:56-73`(`carryoverPurchasedPartScope`) · `:77-80`(`carryoverPurchasedPartDebt`). 일반건물은 부담부증여 여부를 가르지 않고 한꺼번에 `numerator_only`다(`:58`) — **E2만 승격하려면 이 줄을 가르는 것이 첫 변경이다**(§2).

### 1.2 엔진이 지금 이 값을 쓰는 곳 (코드)
- E2: `lib/tax-engine/general-building-entry.ts:68-100` `composeGbCarryover.fromPart` — `giftTaxedValue(assetValue, part.giftAssumedDebt)`로 증여세 상당액 안분의 분자만 만든다. 만든 서브객체에는 채무를 싣지 않는다(엔진 설계서 R1이 고친다). `legacy()`(`:102-`)는 `...ct` 스프레드.
- E3: `lib/tax-engine/transfer-split-carryover-compose.ts:92`(분자) · `:96`(서브객체 echo) → `SplitPartCarryoverEcho.giftAssumedDebt`(`lib/tax-engine/types/transfer-split-gain.types.ts:109-112`) → 결과 view `transfer-tax-split-carryover-display.ts:126,167`이 이미 「증여 신고가액 − 당초 증여 때 인수한 채무」를 그린다.
- 단건 엔진 G1 가드 `transfer-tax-carryover.ts:672-673`은 최상위 `carryoverTaxation.giftAssumedDebt > 0`만 거부한다. 파트 서브객체의 같은 이름은 echo다.

### 1.3 probe — E2 와이어 모양 (실측, `callTransferTaxAPI` body 캡처)
일반건물 · 일반 양도 · 환산 · 토지만 이월과세(증여 2021-03-01 · 증여자 2005-06-15 · 평가액 4억) · 토글 ON · 토지 채무 1억. ⑧ `collectStepIssues`는 세 경우 모두 `[]`(통과).

| 증여세 두 칸 | `gbCarryoverUsesPartShape` | 와이어 | 채무 |
|---|---|---|---|
| 산출세액 3천만 · 과세가액 10억 | true | `landCarryoverPart` + `carryoverGiftEvent` | `giftAssumedDebt: 100000000` **실림** |
| 둘 다 비움 | false | `landCarryoverTaxation`(engine 모양) | **없음** |
| 산출세액 0 · 과세가액 10억 | false(`calculated > 0` 요구, `transfer-tax-api-gb-carryover.ts:320-322`) | `landCarryoverTaxation` | **없음** |

현행(분자 전용)에서는 두 번째·세 번째가 무해하다 — 산출세액 0이면 상당액도 0이라 분자에서 뺄 일이 없다. **조각 규칙에서는 침묵 누락**이다: 채무 인수 부분은 증여세가 없어도 존재하고(계획서 §2 사례의 증여세 상당액이 0이다) 증여재산공제 안의 증여가 오히려 흔하다. 3중 패턴 위반(④ ≠ ⑧ = ⑤).

### 1.4 결과 면 (코드 + K-16)

| 면 | E2 | E3 |
|---|---|---|
| 결과 뷰 | `mode:"bundled"` → `BundledAllocationCard`(`app/calc/transfer-tax/TransferTaxCalculator.tsx:449-510`) → `PropertyCard` → `ValuationDetailCards.tsx:133-135` → **PR-1 `CarryoverComparisonCard`**(`e2e/general-building-carryover.spec.ts` K-16이 「이월과세 비교과세 결과」 렌더를 단언) | `mode:"single"` → `SplitGainDetailSection.tsx:368` → **`SplitCarryoverComparisonCard.tsx:126`**. PR-1 컴포넌트(`CarryoverPurchasedPartRows`)는 `CarryoverComparisonCard`만 import한다 → **E3에서는 렌더되지 않는다** |
| 신고서 양식 | 집계 모드(`FilingFormTableAggregateHelpers.ts`) — 카드 id별 열 | `FilingFormTableHelpers.ts:206` `split-2col` + `FilingFormTableSplitCarryover.ts` |
| 상세명세서 | `DetailedStatementGbFormulas.ts`(카드 id 규약) | `DetailedStatementLateStages.ts:326` · `DetailedStatementDateItems.ts:48` · `split-acq-text.ts:132-176` |
| PDF(서버) | `aggregateToFilingResult`(`BundledAllocationCard.tsx:104-130`) 어댑터 → `lib/pdf/ResultPdfTransferSections.tsx:90-125` | 같은 파일 `:164,272-279` |
| 사이드바 | `lib/stores/transfer-per-asset-summary.ts:352-379` | `:544-550,:692` `summarizeSplitGain` |

## 2. 범위 술어 — 하나로 ⑤·④·⑧·⑫ 모두 읽는다

### 2.1 PR-2 판정표 (PR-1 `carryoverPurchasedPartScope` 확장)

| 순서 | 조건 | PR-1 | PR-2 안 |
|---|---|---|---|
| 0 | `acquisitionCause !== "carryover_gift"` | `none` | 동일 |
| 1 | `general_building` ∧ `transferType === "burdened_gift"` (E4) | `numerator_only` | `numerator_only` 유지(계획서 Q-3 b) + `reason`「지금 양도하는 자산도 부담부증여입니다」 |
| 2 | `general_building` 일반 양도 (E2) | `numerator_only` | 엔진 R5 차단 조합이면 `unsupported{reason}`(Q-UI-2 b), 그 밖 `apply` |
| 3 | `anyPartCarryover` (E3 C·A·B) | `numerator_only` | Q-UI-1: (N) `numerator_only` 유지 · (S) 지원 시 `apply` · (H) `unsupported` |
| 4 | 이하 | E1 그대로 | 동일 |

- E2 `unsupported` 조건은 엔진 설계서 §3.6 R5와 **같은 키 목록**이다. 폼 기준 술어와 사유(`lib/tax-engine/carryover-debt-pieces-scope.ts`의 `DEBT_PIECES_REASON`):
  - 조특법 등 감면 선택(`asset.reductions`) → `reductions`
  - 주택→상가 용도변경(`gbHouseToCommercialConversion`, `lib/stores/calc-wizard-asset-gb.ts:231`) → `acquisitionFacts`
  - 건물 파트 증여자 신축·증축(`donorBuiltGbActive`, `lib/calc/donor-built-gb-scope.ts:39`) → `donorBuilt`
  - **건물 파트에 채무가 있고 건물 감가상각(`depreciationSupport(asset).status === "ok"` ∧ `depreciationAmount > 0`)** → `depreciation`. 이 한 건은 **카드 쌍 단위**다(토지 파트 채무 + 건물 감가상각은 엔진이 통과시킨다, 엔진 설계서 P8) → 자산 단위 술어가 아니라 ⑧의 파트 규칙으로 둔다(§3.4 M-E2-3).
- `reason`은 `unsupported`에만 있으면 된다(PR-1 타입 `:43-48` 그대로). `numerator_only`는 E4 일반건물·E3(N)에 남는다.
- **`DEBT_PIECES_REASON.propertyType` 문구** 「분양권·입주권·재개발·겸용·일반건물은 지원하지 않습니다」는 E2 지원 후 거짓이 된다 — ⑤ 안내·⑧·⑫ 메시지가 같은 문자열을 쓴다(D-6).
- **토글 값의 출처가 경로마다 다르다**(코드): E1 `asset.carryover` · E2 `gbCarryoverEventSource(asset)`(`transfer-tax-api-gb-carryover.ts:309-314`: 토지가 이월과세면 `carryover`, 건물만이면 `buildingCarryover`) · E3 `splitCarryoverEventSource(asset)`(`transfer-tax-api-split-carryover.ts:80-84`: 호스트가 이월과세면 `carryover`, 아니면 `landCarryover`). PR-1의 `AssetSectionExpense.tsx:67`은 `asset.carryover?.giftDebtAssumed`를 직접 읽는다 → E2 건물만·E3 A에서 거짓이다. **술어 파일에 출처 함수 한 개(`carryoverGiftEventForm(asset)`)를 두고 ⑤의 모든 지점이 그것을 쓴다.**

### 2.2 3중 패턴

| 층 | 읽는 것 | 위치 |
|---|---|---|
| ⑤ 노출 | `carryoverPurchasedPartScope` + `carryoverGiftEventForm(asset).giftDebtAssumed` | `CarryoverGiftBlock.tsx:173`(`debtPiecesOn`) · 토글 설명 · `AssetSectionExpense.tsx:67` · 파트 칸 hint · `capexHint` |
| ④ 전송 | 파트마다 `carryoverAssumedDebt(event, part)`(`carryover-gift-assumed-debt.ts:23`) — `numerator_only`와 `apply`가 **같은 와이어** | `transfer-tax-api-gb-carryover.ts:85` · `transfer-tax-api-split-carryover.ts:99` |
| ⑧ 필수·상한·차단 | 같은 두 함수 + scope | `validate-gb-carryover.ts:105` · `validate-split-carryover.ts:251` |
| ⑫ | 엔진 설계서 R5 | `lib/api/transfer-tax-schema-required-refines-gb.ts:253-297` `refineGbCarryover` |

와이어가 같으므로 「조각을 켠다」는 별도 신호가 없다 — 지원되는 조합에서는 토글 ON + 채무 > 0이 곧 조각이다. 그래서 지원하지 않는 조합은 **막아야** 조용한 전환이 없다(Q-UI-2 b). 폼 술어와 ⑫ 술어는 입력 모양이 달라 별개 함수이므로 E1과 같이 **⑧↔⑫ 격자 anchor**로 정합을 잠근다.

## 3. E2 — 일반건물 일반 양도 파트

### 3.1 지점 점검

| 지점 | 판정 | 내용 / 위치 |
|---|---|---|
| ① ② ③ | 변경 0 | 사건 토글은 사건 출처 서브폼, 금액은 파트 서브폼(`asset.carryover` = 토지 또는 단일, `asset.buildingCarryover` = 건물분) |
| ④ part 모양 | 변경 0 | `transfer-tax-api-gb-carryover.ts:78-102`. 지분 스케일 `PART_SCALE.giftAssumedDebt: true`(`:202`) 유지 |
| ④ 모양 선택 | **변경 필요** | `gbCarryoverUsesPartShape`(`:320-322`)와 `buildEngineShaped`(`:110-150`) — §3.3 |
| ⑤ | 변경 | §3.2 |
| ⑥ | **변경 필요** | §3.5 |
| ⑦ | 변경 | §3.6 |
| ⑧ | 변경 | §3.4 |
| ⑨ ⑩ ⑪ | 변경 없음 | enum 없음 · 조각 취득일은 `carryoverGiftEvent`·파트 `donorAcquisitionDate`에서 나온다 |
| ⑫ | 엔진 설계서 R5 | `refineGbCarryover`에 r = 1 + 차단 4건. **K-1을 택하면** `landCarryoverTaxation`·`buildingCarryoverTaxation`의 `rejectDebtPiecesKeyRefine`(`transfer-tax-building-schemas.ts:97-100,399,404`) 해제가 더 든다. 일반건물 지분 ct(`transfer-tax-building-share-schemas.ts:140`)는 부담부증여 전용이라 거부 유지 |
| ⑬ | 변경 0 | `transfer-tax-api-gb.ts:397`(환산) · `:613`(실가)가 `buildGbCarryoverPayload(asset)`를 스프레드, `transfer-tax-api.ts:662`가 `generalBuildingValuation`을 통째로 싣는다 |
| ⑭ | 엔진 R1 | `composeGbCarryover.fromPart`(`general-building-entry.ts:68-100`)는 필드를 **하나씩 옮기는 갈래**라 빠지면 침묵 strip — 엔진 설계서가 grep 점검 |

### 3.2 ⑤ 위젯

**노출 조건 = `scope.kind === "apply"` ∧ 사건 토글 ON**(`carryoverGiftEventForm(asset)`). 기존 위치는 옮기지 않는다(Q-UI-5) — 토글은 ③ 필요경비 가산 안(`CarryoverGiftBlock.tsx:412-427`), 파트 채무 칸은 ④ 평가액 아래(`:499-512`, 분리 OFF 건물분 `:529-542`). 앵커(`carryover.giftDebtAssumed`·`carryover.giftAssumedDebt`·`buildingCarryover.giftAssumedDebt`)와 E2E·anchor가 이 위치에 묶여 있다.

| 위치 | 변경 |
|---|---|
| 토글 `title` | 유지 「당초 증여 때 채무를 인수했다」(셀렉터 보존) |
| 토글 `description` (`:416-421`) | `apply`이면 `DebtNumeratorOnlyNote`를 빼고 E1과 같은 어휘의 설명으로 교체. `numerator_only`(E4)는 노트 유지. `unsupported` ∧ 토글 ON이면 토글을 **켜진 채** 보이고(끌 수 있게) 설명을 「…(${reason}) — 이 토글을 끄세요」로 바꾼다(E1 `CarryoverGiftDebtSection.tsx:70-96` 패턴, `data-field="carryover.giftDebtAssumed"`는 이미 있다 `:425`) |
| 파트 채무 칸 hint (`:503`, `:533`) | `apply`: 「…이 금액이 위 증여 당시 평가액에서 차지하는 만큼이 ${토지분·건물분}의 채무 인수 부분입니다 — 증여 등기접수일을 취득일로, 이 금액을 취득가액으로 계산합니다(법령에 나누는 방법이 정해져 있지 않아 이 계산기가 정한 방법입니다). 증여세 상당액 안분의 분자에서도 이 금액을 뺍니다. 비교과세 시나리오 B의 취득가액은 평가액 그대로입니다. 없으면 0」 |
| 증여자 취득가액 hint (`:317`) · 취득 당시 기준시가(`CarryoverEstimationSection.tsx:147,160`, prop 이름 `debtPiecesOn`) · 증여자 자본적지출 hint (`:458`) · 증여세 산출세액 hint (`:380-385`) | E1용 상수(`CarryoverGiftDebtSection.tsx` 상단 `DEBT_GIFT_PART_ONLY_HINT` 등)를 재사용. `debtPiecesOn`의 정의를 `!isGeneralBuilding && …`(`CarryoverGiftBlock.tsx:173`)에서 **`scope.kind === "apply" ∧ 사건 토글(debtAssumed, :151)`** 로 바꾼다. **건물 파트 블록은 `c`가 `buildingCarryover`라 `c.giftDebtAssumed`가 거짓이다 — 반드시 `:151`의 사건 값을 쓴다**. 산출세액 hint 끝에 「증여세 상당액은 증여분에만 산입합니다(「소득세법」 제97조의2 제1항 제3호)」 |
| 건물 파트 채무 칸 + 건물 감가상각 | 〈차단 조합 M-E2-3〉이 걸리는 경우만 rose `ToneCard`로 사유(⑧ 메시지와 같은 문자열) |
| 본인 자본적지출·양도비 (Q-2 a) | 분리 OFF: `AssetSectionExpense.tsx:180-186` 안내가 scope=apply이면 뜬다(출처 함수만 교체). **분리 ON: 파트 카드 `GeneralBuildingAcquisitionCardsParts.tsx:249-256`의 자본적지출 칸에 안내가 없다** → `capexHint`(`components/calc/transfer/capexHint.ts:14` — 일반건물 파트 카드 · `LandBuildingSplitSection` · `SplitPartCapexFields` 세 파일 공유)에 선택 인자 `debtSplits?: boolean`을 더해 한 곳에서 문장을 붙인다. **환산 파트는 문구를 확정하지 않는다**: 환산 카드의 `expenses`는 사용자 입력이 아니라 개산공제이고 매입분이 그 몫을 받는 방식(엔진 설계서 §3.5·Q-3·V-1·V-2)이 미결이다 — 실가 파트만 「같은 몫으로 나눕니다」를 쓴다 |
| 증여 당시 평가액 hint (`:481-489`) | 변경 없음 |

컴포넌트: 새 컴포넌트 없음(`ToggleCard`·`FieldCard`·`ToneCard`). placeholder는 「없으면 0」뿐. 새 hint 상수는 `CarryoverGiftDebtSection.tsx`(114줄 → 약 150줄).

### 3.3 ④ 모양 선택 — 채무 누락 (Q-UI-6)

`buildGbCarryoverPayload`는 `gbCarryoverUsesPartShape`(산출세액 > 0 ∧ 과세가액 > 0)가 거짓이면 engine 모양으로 내려간다(`:366-373`). engine 모양에는 채무가 없고(`GbCarryoverEngineShapedPayload` `:48-66`), ⑫는 그 모양의 채무 키를 거부한다.

| 안 | 내용 | 평가 |
|---|---|---|
| **K-2 (권장)** | 토글 ON일 때만 모양 선택을 완화한다: `part 모양 = (산출세액 > 0 ∧ 과세가액 > 0) ∨ (토글 ON ∧ 과세가액 > 0 ∧ 산출세액 입력됨)`. ⑧은 토글 ON이면 증여세 두 칸을 모두 요구한다(산출세액 0 허용). 엔진 이벤트 shape는 `giftTaxCalculated` 0을 받고 `giftTaxBase`는 양수여야 하며(`transfer-tax-schema-split-carryover.ts:36-38`), `apportionGiftTax`는 산출세액 0이면 0을 돌려준다(`lib/tax-engine/carryover-gift-tax-apportion.ts` `apportionGiftTax` 첫 줄 `if (!(event.giftTaxCalculated > 0) …) return 0`) | **엔진·⑫ shape 변경 0** — 엔진 설계서 R1만으로 닫힌다. 토글 OFF 사용자의 와이어는 그대로(회귀 0). 부담부증여로 채무를 인수한 증여는 증여세 신고서가 있으므로 과세가액을 요구하는 것이 과하지 않다. `gbCarryoverUsesPartShape`를 `validateDonorBuiltGb`도 읽으므로(함수 주석) 같은 함수를 고친다 |
| K-1 | `GbCarryoverEngineShapedPayload`에 `giftAssumedDebt?` 추가 + `buildEngineShaped`가 싣고 `ENGINE_SHAPED_SCALE`(`:208-222`, `Record<keyof …>`라 키 추가 시 tsc가 분류를 강제)에 `true` + ⑫ engine 모양 거부 해제 | 증여세 칸을 비워도 된다. 대신 **엔진·⑫ 변경이 늘고**(거부 refine이 막고 있던 키를 풀면서 지분 ct는 계속 막는 비대칭) engine 모양 경로의 채무 의미(분자에는 안 쓰인다: `giftTaxAmount`가 사용자 입력)를 새로 정의해야 한다 |

### 3.4 ⑧ validate

위치 `transfer-tax-validate-gb-carryover.ts` 파트 루프(`:99-126`)의 `assumedDebtIssue`(`:105`, 공용 leaf `transfer-tax-validate-carryover-debt.ts:18-24`) 바로 뒤. 앵커는 리터럴 삼항·리터럴 문자열(`__tests__/lib/calc/transfer-validation-field-anchor-coverage.test.ts:41-48`).

| # | 조건 | field | 메시지 |
|---|---|---|---|
| M-E2-1 | 파트의 채무 = 평가액(r = 1) ∧ 그 파트 증여자 자본적지출 > 0 ∧ 양도일 ≥ 2024-01-01(그 전은 엔진 가드가 0 처리 — `donorCapexGuardApplied`) | 토지 `carryover.donorCapitalExpenditure` · 건물 `buildingCarryover.donorCapitalExpenditure` | E1 `validateCarryoverDebt`(`transfer-tax-validate-carryover-debt.ts:44-51`)와 같은 문장 — 「…증여받은 부분이 없어 증여자 자본적지출을 적용할 곳이 없습니다(「소득세법」 제97조의2 제1항 제2호) — 이 칸을 비우세요」. 증여세 상당액은 칸이 없고 엔진이 분자 0으로 0을 만든다 |
| M-E2-2 | scope = `unsupported`(감면 · 용도변경 · 건물 파트 증여자 신축·증축) ∧ 토글 ON | `carryover.giftDebtAssumed` | E1 M3 문장 + 사유 — 「이 자산(${reason})에서는 당초 증여 때 인수한 채무 부분을 시나리오 A에서 나누어 계산하지 못합니다 — «당초 증여 때 채무를 인수했다»를 끄세요」 |
| M-E2-3 | 건물 파트 채무 > 0 ∧ 건물 감가상각 > 0 | `buildingCarryover.giftAssumedDebt` | 같은 모양, 사유 `depreciation`. 토지 파트 채무만 있으면 통과(엔진 P8) |
| M-E2-4 (K-2일 때) | 토글 ON ∧ 증여세 과세가액 비어 있음 / 산출세액 비어 있음 | `carryover.giftTaxBase` · `carryover.giftTaxCalculated`(건물만 이월과세면 `buildingCarryover.*`) | 「당초 증여 때 채무를 인수했으면 증여세 신고서의 과세가액과 산출세액을 입력하세요 — 산출세액이 없으면 0입니다(「소득세법 시행령」 제163조의2 제2항 제1호·제3호)」. 기존 `giftTaxPairIssue`(`:196-206` 일대: 산출세액만 있고 과세가액 없음 / 과세가액만 있고 산출세액 빈칸)와 한 함수에 둔다 |

- **자동 안분·자동 채움 금지**: 채무가 빈 칸이면 차단(기존), 파트 채무를 비율로 채우지 않는다.
- 증여자 취득가액(`donorAcquisitionPrice`) 필수는 r = 1에서도 유지한다(증여분이 없으면 쓰이지 않는 칸이지만 칸별 예외 규칙이 늘어난다 — E1과 같은 입장, V-9).
- 엔진 throw는 400이지만 필드 오류가 아니다(엔진 설계서 §3.6) — ⑫가 필드 위치로 먼저 막아야 한다.

### 3.5 ⑥ 사이드바 — 조각과 무관하게 이미 어긋나 있다 (실측)

**probe** (경로 2 anchor 픽스처, 토글 **OFF**, 화면 경로 폼 → ④ → route → 클라이언트 `computeTransferPerAssetSummary`, 결정세액 156,620,000 = 기존 anchor와 일치):

| | 양도가액 | 취득가액 | 필요경비 |
|---|---|---|---|
| 엔진이 차감한 값(`aggregated.properties`: 토지 A 채택 취득가액 1.5억 + 건물 2.5억 / 필요경비 1,200만 + 300만) | 10억 | **4억** | **1,500만** |
| 사이드바(계산 후) | 10억 | **5억** | **600만** |

사이드바는 일반건물 단건에서 `apportionment.apportioned` 행을 합한다(`transfer-per-asset-summary.ts:369-379` `bundledCards`). 이 행은 `buildApportionment`가 **집계 이전 카드**로 만들어(엔진 설계서 §3.4) 이월과세 A 채택 시 증여자 기준 취득가액이 반영되지 않는다 — 수증자 환산 카드 값(토지 2.5억)이 남는다. **조각 이전부터 있는 어긋남**이고, 조각이 생기면 꼬리 카드(`land__purchased`)가 `aggregated.properties`에만 있어(엔진 설계서 §3.4: 「꼬리 행은 `aggregated.properties`에만 있다」) 더 벌어진다.

- 해법: 일반건물 카드가 `carryoverTaxationDetail`을 가진 자산에서는 `bundledCards`의 취득가액·필요경비 소스를 **`aggregated.properties`(엔진이 실제로 차감한 값)** 로 바꾼다. 같은 파일 `:355`의 원칙(「엔진이 이 자산에 **실제로 쓴** 취득가액·필요경비」)과 같고 PR-1이 E1에서 필요경비에 이미 적용했다(`bundledProperty?.necessaryExpense`, `:648`). 양도가액은 어느 쪽이나 같다.
- **회귀 위험**: 이월과세가 아닌 일반건물은 소스를 바꾸지 않는다(조건 한정). 환산 swap·감가상각 카드에서 두 소스가 같은지는 격자로 확인(V-13).
- 이 변경은 **토글 OFF인 기존 이월과세 일반건물의 사이드바 숫자도 바꾼다**(맞는 값으로) — Q-UI-8.
- 800줄: `lib/stores/transfer-per-asset-summary.ts` **754줄**(트리거 800, 착지 ≤700). 이 블록(`:352-390`)을 건드리면 `transfer-per-asset-debt-pieces.ts`(29줄) 옆 신규 파일로 빼면서 고친다(기회주의적 분리).
- 입력 단계: 환산 프리뷰 `previewGeneralBuildingEstimated`(`lib/calc/transfer-estimated-preview.ts:141-`)는 카드 조립까지만 보고 집계를 거치지 않는다(엔진 설계서 ⑥) → 조각이 보이지 않는다. 입력 단계 사이드바가 이월과세 일반건물에서 증여자 기준인지 수증자 기준인지는 별건(V-5).
- 함께 양도 일반건물: 카드 id가 자산 접미사로 태깅되고(`app/api/calc/transfer/general-building-part-cards.ts:252-262` `tagGbCards`), 안분 표 행은 자산 단위다. 위 소스 전환이 어떻게 닿는지 **확인 필요**(V-3).

### 3.6 ⑦ 결과

#### 3.6.1 이미 되는 것
`ValuationDetailCards.tsx:133-135`가 카드별 `carryoverTaxationDetail`을 `CarryoverComparisonCard`에 넘긴다 → 엔진이 `purchasedPartSplit`(`lib/tax-engine/types/transfer-carryover.types.ts:235,331`)을 부모 카드 detail에 싣는다(엔진 설계서 §3.4: 채무가 있는 **부모 카드마다** — 토지·건물 각각, 사업용·비사업용 분할이면 2장 각각) → A 열에 「증여분 · 매입분」 두 블록 + 산식 + 방법 고지가 그려진다(`CarryoverComparisonCard.tsx:116-178`). **카드 컴포넌트 변경 0.**

#### 3.6.2 깨지는 것 — 일반건물 결과 소비자 6개 파일 19개 지점이 카드 id에 묶여 있다 (코드)
엔진 설계서 R4(Q-6 a)가 꼬리 id를 `base__purchased#N`으로 정한다(단건은 `land__purchased`). `baseCardId`(`#` 앞만 자른다)는 이를 벗기지 않으므로 **꼬리 카드는 어느 분류에도 안 걸린다**(엔진 설계서 §3.4가 의도로 밝힌다 — 부모의 환산 산식 카드로 오인하는 것보다 안전).

| 소비자 | 위치 | 꼬리 카드가 들어오면 |
|---|---|---|
| 3-자산 요약 표 | `GeneralBuilding3WayTable.tsx:20-22` | `props.length !== 3`이면 **표 전체가 사라진다**(증축 케이스 + 조각 = 4장). 침묵 소실 |
| 파트 취득가액 블록 | `gb-result-block-views.ts:57-60`(`apportioned.find`로 첫 행만) · `:118-120` | 파트 값이 증여분만(꼬리 미합산) |
| 상세명세서 산식 | `DetailedStatementGbFormulas.ts:36,42,48,65,80,306,385,472,503,638` | 분류 불가 카드의 처리 — **렌더 미확인**(V-11) |
| 신고서 열 메타 | `FilingFormTableAggregateHelpers.ts:45,125,201` · `FilingFormTableDateHelpers.ts:78,114` | 취득일 메타 누락 가능(PR-1이 E1용 `__purchased` 접미사 해석은 `:132`에 이미 넣었다) |
| 취득 방식 문구 | `split-acq-text.ts:250` | 같음 |
| 부담부증여 비교 카드 | `GbBurdenedGiftCarryoverCard.tsx:29` | E4 전용 — 영향 없음 |

**제안**: `lib/tax-engine/general-building-share-id.ts`(`baseCardId`·`shareIndexOf`·`cardSuffixOf`·`isSameShare` 소재)에 조각 판정 한 벌(`isPurchasedPieceId` · 꼬리 id → 부모 id)을 두고 소비자를 두 부류로 가른다 — (가) 카드 산식·환산 근거를 **찾는** 곳(상세명세서 · 신고서 열 메타 · 취득 방식 문구)은 꼬리를 **건너뛰고**(꼬리의 취득가액은 채무 그대로이며 환산 산식 대상이 아니다; 근거는 echo `purchasedPartSplit.purchased`가 대신한다), (나) 합계를 **보이는** 곳(3-자산 표 카드 수 판정 · 파트 취득가액 · 사이드바)은 꼬리를 **부모에 합친다**. 라벨은 `부모 라벨 + "(증여분)"/"(매입분)"`이고 3-자산 표가 `propertyLabel.includes("1001"|"3001"|"3002")`로 열을 찾으므로(`GeneralBuilding3WayTable.tsx:22-27`) 라벨에 부동산 코드가 남아야 한다(D-1).

### 3.7 일반건물 하위 경로 × UI 노출 조합 (엔진 설계서 §2 매트릭스 대조)

「UI 노출」은 사용자가 폼에서 이 조합을 만들 수 있는 근거(코드). 「엔진」은 엔진 설계서 §2 판정(O 지원 · △ 추가 설계 · X 차단).

| # | 조합 | UI 노출 근거 | 엔진 | 막는/내리는 경우 ⑤ 안내 | ⑧ |
|---|---|---|---|---|---|
| 1 | 분리 OFF · 토지·건물 둘 다 이월과세 | 건물 원인이 토지를 따른다(`GeneralBuildingAcquisitionCards.tsx:259-262` `toBuildingCause`) | O | — | M-E2-1·4 |
| 2 | 분리 ON · 토지만 이월과세, 건물 매매·상속·신축 | `transfer-tax-api-gb-carryover.ts:346-347` | O | — | M-E2-1·4 |
| 3 | 분리 ON · 건물만 이월과세 | 사건 출처 = `buildingCarryover`(`:309-314`) — 토글은 건물 블록 ③ | △ 엔진 Q-1(건물 파트 포함 여부, a 권장) | — | M-E2-1·4 · 앵커 `buildingCarryover.*` |
| 4 | 분리 ON · 둘 다 이월과세 | 사건 블록 = 토지(`CarryoverGiftBlock.tsx:149`), 건물 블록은 채무 칸만 | O | — | 파트별 `assumedDebtIssue` |
| 5 | 증여자 취득가액 환산(일반 기준시가) | `carryoverEstimationModeSupported`(`phd-toggle-scope.ts:118`) — 일반건물은 `general`만 | O | — | 기존 분자 필수 |
| 6 | 증여세 두 칸 비움 · 산출세액 0 | §1.3 | — | — | M-E2-4 / K-1 |
| 7 | 건물 파트 환산 + 증여자 신축·증축(§114조의2) | `donorBuiltGbActive`(`donor-built-gb-scope.ts:39`) | **X** | 토글 rose 사유(`donorBuilt`) | M-E2-2 |
| 8 | 증축(`gbHasExtension`) — 건물1에만 이월과세 | `general-building-extension.ts:613-615` | O | — | — |
| 9 | 비사업용 초과분 자동 분할(`land_business`/`land_nbl`) | 면적·용도지역으로 자동(`general-building-extension.ts:519,540`) — 사용자가 끌 수 없다 | **O**(엔진 R2: 채무를 면적 비율로 자른다) | — (엔진이 지원하므로 입력 단계 예측·차단 불필요) | — |
| 10 | 지분(공유) 단건 · 축 B 다지분 | `applyGbCarryoverShareScale`(`transfer-tax-api-gb-carryover.ts:277`) | △ R4(`#N` 앞) | — | 지분 r 불변(V-8) |
| 11 | 함께 양도(일반건물이 주 자산 또는 컴패니언) | `general-building-part-cards.ts:279-` | △ R4 | — | — |
| 12 | 부담부증여(E4 일반건물) | `buildGbCarryoverPayload`가 BG에는 `{}`(`:331-345` 주석) | 제외(Q-3 b) | `DebtNumeratorOnlyNote` 유지 | — |
| 13 | 조특법 감면 선택 | `asset.reductions` | **X** | 토글 rose 사유(`reductions`) | M-E2-2 |
| 14 | 주택→상가 용도변경 | `gbHouseToCommercialConversion` | **X** | 〃(`acquisitionFacts`) | M-E2-2 |
| 15 | 건물 감가상각(§97③) + 건물 파트 채무 | `depreciationSupport(asset)` | **X**(같은 카드 쌍만) | 건물 채무 칸 아래 rose | M-E2-3 |
| 16 | 미등기 · 구분 기재 양도가액(§100②) · 공익수용 | 카드별 축 | O | — | — |
| 17 | §97②2호 swap(환산 파트 + 자본적지출·양도비) | 기존 | O(기존 동작 승계) | **환산 파트 필요경비 문구는 확정하지 않는다**(§3.2, 엔진 V-1·V-2) | — |
| 18 | 의제취득일 전 상속·증여 파트(`resolveGbPreDeemedRoute`) | — | 확인 필요(엔진 V-5) | — | — |

차단 조합(7·13·14·15)은 PR-1 E1 패턴이다: **OFF이면** 토글을 평소처럼 두고 **ON이면** 켜진 채 보여 끌 수 있게 하고 ⑧이 앵커 `carryover.giftDebtAssumed`로 이동시킨다. 사유 문자열은 `DEBT_PIECES_REASON`과 공유한다.

## 4. E3 — 주택 분리 계산 파트 (C · A · B)

세 변형 모두 같은 `SplitCarryoverGiftTaxCard`를 쓴다(`SplitCarryoverParts.tsx:83-156`; A·B는 `LandCarryoverCard.tsx:97-109`). 사건 출처: C·B = `carryover`, A = `landCarryover`. 변형: C 토지·건물 둘 다 증여받음 · A 토지만 · B 건물만. 함께 양도 둘째 이후 자산은 파트 이월과세가 꺼진 것으로 읽혀(`lib/calc/transfer-land-part-cause.ts:419`) E1 `apply`로 간다.

### 4.1 세 갈래
- **N 비지원 · 안내 (엔진 설계서 c1, 권장)**: `numerator_only` 유지. 입력 안내는 PR-1 그대로, 결과 고지(T2)만 추가. 근거(엔진 설계서 §5.2): `calcSplitGain`이 고정 2파트이고 소비처가 11파일 83곳이며, 한 파트 안에 날짜가 둘이 생기고, 집계로 보내면 주택 일체 판정이 깨진다. **V-7이 연 입력이 막히지 않는다.**
- **S 지원 (엔진 설계서 a안 = 별건 계획서)**: 파트마다 조각 규칙. 엔진이 N파트 해결자로 일반화한 뒤에야 가능하다 — UI 변경량은 §4.3.
- **H 하드 차단 (엔진 설계서 c2)**: 토글 ON을 ⑧·⑫가 막는다. V-7 입력(`__tests__/api/transfer.route.carryover-gift-tax-numerator-net.anchor.test.ts` 경로 3)이 다시 막다른 길이 된다 → 권장하지 않음.

### 4.2 지점별 변경 (갈래별 — 바뀌는 지점만)

| 지점 | S | N | H |
|---|---|---|---|
| ①②③ | 0 | 0 | 0 |
| ④ | 0 (`transfer-tax-api-split-carryover.ts:99,106` — 사건 토글 ∧ 파트 채무 > 0이 이미 와이어) | 0 | 0 |
| ⑤ 토글 설명 | `SplitCarryoverParts.tsx:131-143` 교체(`DebtNumeratorOnlyNote` 제거), `partsLabel`별 문구 | **노트 유지**. 문구는 이미 정확하다(「…증여분과 따로 나누는 계산은 이 입력에 적용하지 않습니다」, `CarryoverGiftDebtSection.tsx` `DebtNumeratorOnlyNote`) | 〃 + 토글 `data-field` 신설(**현재 `data-testid`만 있고 `data-field`가 없다**, `SplitCarryoverParts.tsx:142`) — A `landCarryover.giftDebtAssumed` · C·B `carryover.giftDebtAssumed` |
| ⑤ 파트 채무 칸 hint | `:150` 「분자에서만 뺍니다」 → 조각 문장 | 유지 | 유지 |
| ⑤ 파트 입력 hint | `SplitPartCarryoverCard.tsx:69,94,127,141`에 「증여분에만 적용」 — 스코프는 `apply ∧ 사건 토글` | 0 | 0 |
| ⑤ 본인 필요경비 | 파트 자본적지출 `capexHint` 인자(§3.2) — `LandBuildingSplitSection.tsx:552,557` · `SplitPartCapexFields.tsx:29,40` · 양도비는 `AssetSectionExpense` | 0 | 0 |
| ⑥ | 엔진 결과 모양에 달림(V-6) | 0 | 0 |
| ⑦ | §4.3 | **T2 고지만**(§5) | 0 |
| ⑧ | 파트 루프에 r = 1 규칙(§4.4) | 0 | 토글 앵커 + M3형 메시지 |
| ⑫ | 엔진 | 0 | 엔진 |
| 안전망 반전 | `carryover-debt-purchased-part-input.anchor.test.tsx:110-132,144` · `carryover-purchased-part-scope.anchor.test.ts:26-29,60-63` · `carryover-gift-assumed-debt-fields.anchor.test.tsx` | **0** | 〃 |

### 4.3 ⑦ (S일 때만 — N·H는 해당 없음)
`SplitCarryoverComparisonCard`의 `PartBlock`(`:29-123`)은 값을 전부 `splitCarryoverView`(`lib/tax-engine/transfer-tax-split-carryover-display.ts`)가 읽는 echo로 그린다. 네 면(카드 · 신고서 · 상세명세서 · PDF)이 **같은 view**를 읽으므로 view 한 곳을 확장하면 따라오지만 구조가 **2열(토지·건물)** 이다:

| 면 | 위치 | 조각이 생기면 |
|---|---|---|
| 카드 `PartBlock` | `SplitCarryoverComparisonCard.tsx:29-123` | 파트 안에 「증여분 · 매입분」 행 추가 |
| 분리 양도차익 표 | `SplitGainDetailSection.tsx`(2열 표) | 파트 열의 장기보유특별공제율·세율이 조각마다 다르다 → 합친 열은 「공제율 × 양도차익 = 공제액」 등식이 거짓. 조각 하위 행/부열 필요 |
| 신고서 `split-2col` | `FilingFormTableHelpers.ts:206`(**732줄**) · `FilingFormTableSplitCarryover.ts`(45줄) | 열 구조를 건드리면 800줄 트리거 — 분리 동반 |
| 상세명세서 · PDF | `DetailedStatementLateStages.ts:326` · `DetailedStatementDateItems.ts:48` · `split-acq-text.ts:132-176` · `ResultPdfTransferSections.tsx:164,272-279` | view 확장으로 따라오되 취득일·보유기간 문구가 조각마다 둘 |
| 사이드바 | `transfer-per-asset-summary.ts:544-550,:692` `summarizeSplitGain` | 파트가 합산형 echo로 남으면 0, 조각이 별도 행이면 확장 |

→ E3 S는 UI 변경량이 E2의 2배 이상이고 엔진이 N파트 해결자를 만든 뒤에 설계해야 한다. 이 PR에서 설계를 확정하지 않는다.

### 4.4 ⑧ (S일 때만)
`transfer-tax-validate-split-carryover.ts` 파트 루프의 채무 검사(`:251-258`) 바로 뒤에 r = 1 규칙 — 파트 채무 = 평가액 ∧ 그 파트 증여자 자본적지출 > 0 ∧ 양도일 ≥ 2024-01-01 → `${p.keyPrefix}.donorCapitalExpenditure`(`landCarryover`/`carryover`)로 이동하는 차단. Σ 검사(`:267-275` `valuationSum`)는 분자 기준이라 변경 없음.

## 5. 결과 고지 — 조각을 나눈 결과와 나누지 않은 결과를 구분 (Q-UI-4 승격)

### 5.1 원칙
- 구분의 근거는 **엔진 echo 하나**다(폼 입력에서 유도하면 이력·재열람에서 어긋난다 — 이중 진실). 순수 view 한 곳(`lib/tax-engine/transfer-tax-carryover-purchased-part-display.ts`, 98줄 → 약 150줄)에 `carryoverDebtTreatment`를 두고 모든 면이 부른다.
- 세 상태: **T0** 채무 없음(고지 없음, 회귀 0) · **T1** 조각 적용 · **T2** 채무가 있으나 조각을 나누지 않음(분자에서만 뺌).
- 어느 경로가 어느 상태를 만드는가: E1·E2 → T0/T1 (차단 조합은 계산 자체를 막으므로 T2가 없다) · **E3(N) → T2** · E4 일반건물 → T2(echo 신설이 필요 — BG 경로 와이어에 채무 키가 없다, PR-1 엔진 설계서 §5.2; **PR-3로 미룬다**).
- 유불리·절감 표현 금지. 「확인 필요」 규약은 PR-1 방법 고지(`CARRYOVER_PURCHASED_PART_METHOD_NOTICE`)를 그대로 쓴다.

### 5.2 문장 (제안)
- **T1**: 기존 A 열 두 블록 + 방법 고지(PR-1). 인쇄·PDF용 한 줄 — 「당초 증여 때 인수한 채무 ${금액}는 양도로 보는 부분(매입분)으로 나누어 계산했습니다 — 증여분은 당초 증여자의 취득가액·취득일, 매입분은 인수한 채무·증여 등기접수일 기준입니다.」
- **T2**: 「당초 증여 때 인수한 채무 ${금액}는 증여세 상당액 안분의 분자(증여 당시 평가액 − 인수한 채무)에서만 뺐습니다. 채무 인수 부분을 증여분과 나누어 계산하지는 않았습니다.」

### 5.3 면별 표지 (구분 방법)

| 면 | T1 (나눔) — E2 | T2 (나누지 않음) — E3(N) | 필요한 echo |
|---|---|---|---|
| 화면 비교 카드 | A 열 두 블록(`data-testid="carryover-piece-*"`) | E3 카드(`SplitCarryoverComparisonCard`)의 「확인 필요」 `ToneCard`에 문장 1개 — `splitCarryoverNotices`(`transfer-tax-split-carryover-display.ts:277-301`)에 push | T1: `purchasedPartSplit` 있음 · T2: `SplitPartCarryoverEcho.giftAssumedDebt`(`> 0` ∧ 조각 echo 없음) **이미 있음 → 엔진 변경 0** |
| 인쇄(`calculation` 그룹) | 같은 카드 — 접힘이 없어 자동 포함(`print-only-css-toggle` 불필요) | 같음 | 〃 |
| 상세명세서 | 취득가액 산식에 조각 산식 줄(PR-1 §7.5 S3) | `DetailedStatementLateStages.ts:326`이 `splitCarryoverNotices`를 읽는다 → 자동 | view `formulaLines` |
| 신고서 양식 | 집계 모드는 열 라벨 「(증여분)/(매입분)」이 표지 | 표지 없음(상세명세서·PDF가 맡는다) | 라벨 규약(D-1) |
| PDF(서버) | 어댑터 `aggregateToFilingResult`(`BundledAllocationCard.tsx:104-130`)에 조각 echo 목록을 싣고(`donorBuiltPenaltyEchoes`와 같은 방식, `lib/tax-engine/types/transfer-result.types.ts:316` 곁) `ResultPdfTransferSections.tsx:90-125`의 `donorViews` 자리에 `lblSub` 행 | E3 PDF는 `:279`가 `splitCarryoverNotices`를 이미 그린다 → 자동 | E2: 어댑터 신설 필드 1개 |

PDF 채널: 서버 PDF는 `calculation` 그룹 1종(`lib/print/transfer-print-sections.ts` — 신고서식·명세서·분리표는 화면 인쇄 전용 `SCREEN`)이고 비교 카드는 PDF에 들어가지 않는다 → **E2에서 PDF가 T1을 알리는 유일한 방법은 위 한 줄**이다. 카드를 PDF에 넣는 것은 별건.

### 5.4 범위 선택
Q-UI-4: a 카드 + 상세명세서 + 인쇄 + PDF 한 줄 / b 카드·상세명세서만(PDF 후속) / c 입력 안내만(현행). 권장 a — E3 T2는 엔진 변경이 없고, E2 PDF는 어댑터 필드 1개로 끝나며, 「나누지 않았다」를 입력 안내만으로 두면 인쇄물이 침묵한다(PR-1 §7.6이 이미 경고).

## 6. 테스트 · E2E

### 6.1 vitest
- **반전(같은 PR 안에서 형제 단언 동반)**: `carryover-purchased-part-scope.anchor.test.ts:26-29`(일반건물 → numerator_only)를 「일반 양도 → apply · 부담부증여 일반건물 → numerator_only · 감면/용도변경/건물 신축 → unsupported」로 갈라 다시 쓴다; `carryover-debt-purchased-part-input.anchor.test.tsx:110-122`(노트)·`:137-160` 격자; 엔진 설계서 §6의 route anchor `157,460,000 → 141,690,000`(손계산 ✓)와 같은 PR이어야 ⑤가 거짓말하지 않는다.
- 범위 술어 × ⑧ × ⑫ 격자: 증여세 칸 3상태(채움 / 비움 / 산출세액 0) × 토글 × 파트(토지·건물) × 분리 OFF/ON × 차단 조합 — 같은 입력으로 ⑤ 노출 · ④ 와이어 · ⑧ 이슈 · ⑫ 수락을 대조(`feedback_fe8_vs_12_parity_grid`).
- ④: K-2 모양 선택(토글 ON ∧ 산출세액 0 ∧ 과세가액 > 0 → part 모양 + `giftAssumedDebt`) · 토글 OFF 와이어 불변 · 지분 1/2 스케일 · stale(OFF인데 값 남음)은 키 없음.
- ⑥: §3.5 격자 — 이월과세 일반건물 `Σ aggregated.properties == 엔진 차감`, 이월과세 아닌 일반건물은 소스 불변(V-13).
- 뮤테이션: `debtPiecesOn`을 건물 블록에서 `c.giftDebtAssumed`로 되돌림 → 건물 파트 hint 소실이 잡혀야 한다 · `AssetSectionExpense`가 `asset.carryover`를 읽도록 되돌림 → 건물만 이월과세(E2)·A(E3)에서 안내 소실 · M-E2-3을 전 카드로 넓힘(토지 채무 + 건물 감가상각이 막히면 합법 입력 차단) · `GeneralBuilding3WayTable`의 카드 수 판정에 꼬리 포함 → 증축 표 소실.
- 결과: `CarryoverComparisonCard`(echo 있음/없음) · `GeneralBuilding3WayTable`(증축 + 꼬리 4장에서도 표가 남는다) · `splitCarryoverNotices` T2 · PDF 어댑터 필드.

### 6.2 E2E — 새 spec `e2e/carryover-gift-debt-purchased-part-parts.spec.ts` (기존 CDPP-1~10은 `e2e/carryover-gift-debt-purchased-part.spec.ts`)
시드·헬퍼는 PR-1 spec과 같다(`makeDefaultAsset` + `CARRYOVER_DEFAULTS`, `seedWizard`/`calculate` — `e2e/_helpers/split-acq-display.ts`, 카드 접근 `expandAssetSection`). 숫자는 엔진 anchor와 같은 사례를 쓴다.

| ID | 시나리오 | 단언 |
|---|---|---|
| CDPP-11 | **E2 기본**: 일반건물 · 일반 양도 · 환산 · 토지만 이월과세(평가액 4억) · 산출세액 3천만 · 과세가액 10억 · 토글 ON · 토지 채무 1억 | `getByRole("switch", { name: "당초 증여 때 채무를 인수했다" })` ON → 채무 칸 · `carryover-debt-numerator-only-note` 0개 · 증여자 취득가액·산출세액 hint에 「증여분」 문구 · 요청 body `generalBuildingValuation.landCarryoverPart.giftAssumedDebt = 100000000` · 결과 토지 카드 `carryover-piece-gift`·`carryover-piece-purchased` + `carryover-piece-method-notice` · **결정세액 141,690,000**(엔진 설계서 P9, mock 세율) · OFF 156,620,000 · **사이드바 취득가액 = 엔진 차감 합**(§3.5, OFF에서도 4억) · 인쇄: 「출력 항목 선택」에서 **전체 선택 먼저**(`feedback_print_media_needs_section_selection`) 후 `emulateMedia({ media: "print" })` → 조각 블록 보임 |
| CDPP-12 | **E2 증여세 칸 규칙 + 차단**: (a) 토글 ON · 과세가액 비움 → 계산 차단, 오류 클릭 시 `[data-field="carryover.giftTaxBase"]`로 이동 (b) 산출세액 0 · 과세가액 10억 → 통과, body가 part 모양이고 `giftAssumedDebt` 실림(K-2) (c) 같은 시드에 조특법 감면 선택 → 차단 문구 · 토글이 켜진 채 보임 · 끄면 통과 (d) 채무 = 평가액 + 증여자 자본적지출 입력 → `carryover.donorCapitalExpenditure`로 이동 | 건물만 이월과세로 바꾼 변형에서 앵커가 `buildingCarryover.*`로 가는지 한 건 |
| CDPP-13 | **E3 N**: 주택 분리 · 토지만 이월과세(A) · 토지 채무 1억 | 노트 유지 · 요청 body `landCarryoverPart.giftAssumedDebt` 불변 · 결과 `split-carryover-notice-*`에 T2 문장 · 인쇄에서도 보임 · 175,110,000 불변. S로 가면 이 시나리오를 파트 블록 조각 단언으로 바꾼다(H는 만들지 않는다) |
| 회귀 | `GBGT-E10`(`e2e/gb-bg-carryover-gift-tax-input.spec.ts:247`) 불변 · E4 일반건물에 노트 유지 · CDPP-1~6·9·10 불변 | |

필드 이동 케이스(`e2e/_helpers/validation-field-jump-cases-acq.ts`의 `carry` 헬퍼 규약, 한 메시지 = 한 케이스): M-E2-1 · M-E2-2 · M-E2-3 · M-E2-4. 브라우저 확인은 Playwright, 워크트리에서는 `E2E_PORT` 지정.

## 7. 사용자 결정 레지스터 — ✅ 2026-10-28 확정: 전부 권장안(Q-UI-1 b · 2 b · 3 a · 4 a · 5 a · 6 a(K-2) · 7 a(E3 고지는 2a에 합류 → PR 하나) · 8 a)

| # | 질문 | 선택지 | 권장 |
|---|---|---|---|
| **Q-UI-1** | E3(주택 분리 파트) 범위 | **a** 지원(S) — 엔진이 N파트 해결자를 만든 뒤 별건 · **b** 이번 PR 비지원, 현행 `numerator_only` 유지 + 결과 고지 T2(N) · **c** 하드 차단(H) | **b** — 엔진 설계서 c1과 같다. UI는 `splitCarryoverNotices` 한 문장 + 안전망 반전 0. c는 V-7이 연 입력을 다시 막는다 |
| **Q-UI-2** | E2에서 엔진이 막는 조합(감면 · 용도변경 · 건물 파트 증여자 신축·증축 · 건물 파트 채무 + 건물 감가상각)에서 토글 ON | **a** `numerator_only`로 내려 계산하고 사유를 입력·결과에 표시 · **b** `unsupported` — ⑧·⑫ 차단, 토글을 켜진 채 보여 끄게 함 | **b** — 엔진 R5가 이미 차단이고(와이어가 같아 분자 전용으로 내릴 신호가 없다), 차단 조합이 4개로 작고 드물다. a는 같은 입력이 조합에 따라 다른 세법 처리가 되는 침묵 전환이다 |
| **Q-UI-3** | 이미 저장된 입력의 의미 변경 — V-7 시절에 토글 ON으로 저장한 E2 폼·이력을 다시 계산하면 분자 전용에서 조각 규칙으로 세액이 바뀐다(경로 2 anchor 157,460,000 → 141,690,000) | **a** 새 의미를 그대로 적용 + 결과의 조각 표시가 사유를 설명 · **b** 새 필드로 분리해 옛 값은 분자 전용 고정 · **c** 버전 플래그 | **a** — 엔진 설계서 Q-5와 같다. 토글이 말하는 사실은 같고 분자 전용은 계획서가 정한 임시 단계. 저장된 `resultData`는 그대로 남고 「다시 계산」할 때만 바뀐다(V-10) |
| **Q-UI-4** | 결과 고지 범위(§5) | **a** 카드 + 상세명세서 + 인쇄 + PDF 한 줄 · **b** 카드·상세명세서만 · **c** 입력 안내만(현행) | **a** |
| **Q-UI-5** | E2 토글 위치 | **a** 현 위치(③) 유지 · **b** E1처럼 ④ 뒤 별도 섹션 | **a** — 앵커·E2E·anchor 보존 |
| **Q-UI-6** | E2에서 증여세 두 칸이 비었을 때 채무 와이어(§3.3) | **a (K-2)** 토글 ON이면 증여세 두 칸 필수(산출세액 0 허용) + part 모양 선택 완화 — 엔진·⑫ 변경 0 · **b (K-1)** engine 모양에 채무 필드 + ⑫ 거부 해제 | **a** — 엔진 설계서의 「⑫ shape 변경 없음·engine 모양 거부 유지」와 맞고, 자동 채움 없이 명시 입력을 요구한다. **엔진 시니어와 합의 필요**(엔진 설계서 §3.1의 「와이어 입력은 그대로」가 이 경로에서는 거짓이다) |
| **Q-UI-7** | PR 나눔 | **a** PR-2a = E2 + 공통(술어 · 결과 고지 · PDF · 사이드바 소스) / PR-2b = E3(N이면 고지만이라 2a에 합쳐도 작다) · **b** 한 PR | **a** (E3가 N이면 2a에 합류) |
| **Q-UI-8** | ⑥ 사이드바 소스 전환(§3.5) — 토글 OFF인 기존 이월과세 일반건물의 계산 후 사이드바 숫자도 바뀐다(맞는 값으로) | **a** PR-2a에 포함 · **b** 별건 | **a** — 조각이 생기면 어긋남이 커지고, 소스가 같은 `aggregated.properties`라 한 번에 고치는 편이 작다. 이월과세가 아닌 일반건물은 불변 |

## 8. 미검증 레지스터

| # | 항목 | 상태 |
|---|---|---|
| V-1 | 엔진 설계서는 작성 중인 판을 읽었다 — R1~R5·Q-1~Q-6이 바뀌면 §2·§3·§9 재대조 | 확인 필요 |
| V-2 | (해소) 조각 행이 `apportionment.apportioned`에 들어오는지 — 엔진 설계서 §3.4가 **들어오지 않는다**고 명시, §3.5가 소스 전환으로 대응 | 해소 |
| V-3 | 함께 양도 일반건물의 사이드바 행(자산 단위 안분 행) 매칭과 소스 전환 | 확인 필요 |
| V-4 | (해소) 비사업용 분할 예측 leaf — 엔진 R2가 지원해 입력 단계 예측·차단 불필요 | 해소 |
| V-5 | 이월과세 일반건물의 입력 단계 환산 프리뷰가 수증자 기준인지 증여자 기준인지 | 확인 필요(별건) |
| V-6 | E3(S)의 결과 모양(`single`+`splitDetail` 유지 / `bundled`) | 엔진 의존 — N이면 무관 |
| V-7 | PR-1의 상세명세서(S3)·PDF(S5) 미구현이 의도인지 누락인지 | 확인 필요 — PR #2653 설명 열람 필요 |
| V-8 | E2 지분(공유) 모드에서 r이 스케일 floor로 흔들리는 폭 | 확인 필요(엔진 V-3) |
| V-9 | r = 1일 때 증여자 취득가액 필수 유지 | 의도 — 완화 가능 |
| V-10 | 이력 복원 → 「다시 계산」 시 새 의미 적용(Q-UI-3 a) | **해소(2026-10-28 실측)** — 경로는 `/history` 카드 「편집」(`resume-{id}`) → `resumeTransferRecord`(`lib/calc/transfer-resume-entry.ts`: assets를 `migrateAsset`·`clearInheritedStaleAcqInputs`에 통과 → `reset()` + `updateFormData`) → 마법사 → 계산. 증여세 두 칸이 채워진 옛 입력은 값이 그대로 복원돼 141,690,000(저장된 옛 세액 157,460,000은 화면에 없다), 두 칸이 비어 있던 옛 입력은 「다음」에서 막히되 `carryover.giftTaxBase` 칸으로 이동하고 채우면 통과한다. e2e CDPP-16 · vitest `__tests__/calc/carryover-debt-parts-history-restore.anchor.test.ts`(토지만/건물만/분리 OFF × 이력 편집·세션 복원) |
| V-11 | `DetailedStatementGbFormulas.ts` 10개 지점이 꼬리 카드를 만났을 때 구체 동작 | 확인 필요 — 정확 비교임만 코드로 확인 |
| V-12 | 브라우저 수동 확인 | **미수행**(설계서 단계) |
| V-13 | §3.5 소스 전환의 회귀 격자(이월과세 아닌 일반건물: 환산 swap · 감가상각 · 증축 · 지분에서 `Σ aggregated.properties` = `Σ apportioned`) | 확인 필요 |
| V-14 | 환산 파트의 본인 필요경비 안내 문구(엔진 V-1·V-2·Q-3 결정 대기) | 확인 필요 |

## 9. 엔진 설계서와의 대조 (D-n)

| # | 항목 | 엔진 설계서 | 이 문서의 의존 |
|---|---|---|---|
| D-1 | 꼬리 카드 id · 라벨 | R4 / Q-6 a: `base__purchased#N`. 라벨 `부모 라벨(증여분/매입분)` 필요(부동산 코드 유지) | §3.6.2 — 라벨 규약은 엔진 설계서에 명시가 없다 → **요청** |
| D-2 | E2 차단 조합 | R5 / §2 행 10~13: 감면 · 용도변경 · 건물 감가상각(같은 카드 쌍) · 증여자 신축 | §2.1 · §3.4 |
| D-3 | 와이어 술어 | R3: `SUPPORTED_PROPERTY_TYPES`에 `general_building_unit` 추가 | 폼 술어와 ⑧↔⑫ 격자 |
| D-4 | **증여세 칸이 비었을 때 와이어** | 「와이어 입력은 그대로」(part 모양만 참) | §1.3 · §3.3 · **Q-UI-6** |
| D-5 | T2 echo | E3: 이미 있음(c1) · E4 일반건물: 와이어에 채무 키가 없어 PR-3 | §5 |
| D-6 | `DEBT_PIECES_REASON.propertyType` 문구 개정 | 언급 없음 → **요청** | §2.1 |
| D-7 | E3 | c1 현행 유지 + 결과 고지 권장 | §4 |
| D-8 | 본인 필요경비 | §3.5 · Q-3 · V-1·V-2 미결 | §3.2 환산 파트 문구 보류 |
| D-9 | `purchasedPartSplit` 부착 | 채무가 있는 부모 카드마다(토지·건물·사업용/비사업용 각각) | §3.6.1 |

## 10. 파일 변경 목록 (Do 단계 · 800줄 점검)

| 파일 | 변경 | 현재 줄 수 |
|---|---|---|
| `lib/calc/carryover-gift-assumed-debt.ts` | scope 분기(일반건물 일반 양도 / 부담부증여) · `unsupported` 조건 · `carryoverGiftEventForm` | 80 |
| `lib/calc/transfer-tax-api-gb-carryover.ts` | `gbCarryoverUsesPartShape` 완화(K-2) | 401 |
| `lib/calc/transfer-tax-validate-gb-carryover.ts` | M-E2-1~4 | 206 |
| `components/calc/transfer/CarryoverGiftDebtSection.tsx` | hint·설명 상수 | 114 |
| `components/calc/transfer/CarryoverGiftBlock.tsx` | `debtPiecesOn` 정의 · 토글 설명 · 파트 hint | 578 |
| `components/calc/transfer/asset-sections/AssetSectionExpense.tsx` · `capexHint.ts` · 파트 자본적지출 3곳 | 출처 함수 · `debtSplits` 인자 | 232 · 25 |
| `lib/tax-engine/transfer-tax-carryover-purchased-part-display.ts` | `carryoverDebtTreatment` view | 98 |
| `lib/tax-engine/transfer-tax-split-carryover-display.ts` | T2 문장(`splitCarryoverNotices`) | 301 |
| `lib/tax-engine/general-building-share-id.ts` + 일반건물 결과 소비자 6개 파일 | 조각 id leaf · 두 부류 처리 | — |
| `components/calc/results/BundledAllocationCard.tsx` · `lib/pdf/ResultPdfTransferSections.tsx` · `lib/tax-engine/types/transfer-result.types.ts` | PDF 한 줄 | 480 · 513 · — |
| `lib/stores/transfer-per-asset-summary.ts` | §3.5 소스 전환 — **754줄: 수정하면 블록 분리 동반(≤700 착지)** | 754 |
| `components/calc/results/transfer/FilingFormTableHelpers.ts` | E3 S일 때만 — 732줄, 분리 동반 | 732 |
| 테스트 · E2E | §6 | — |

## 11. 완료 보고 전 자가 점검 (Do 단계)
- [ ] ⑤ 노출 · ④ 전송 · ⑧ 필수 · ⑫ 수락이 **같은 술어 + 같은 출처 함수**(`carryoverGiftEventForm`)를 읽는다 — `carryoverPurchasedPartScope` 호출 지점 전수 grep
- [ ] 증여세 칸 3상태 × ④ 모양 × ⑧ × ⑫ 격자 anchor (Q-UI-6 결정대로)
- [ ] 건물 파트 블록의 `debtPiecesOn`이 사건 토글을 읽는다(`c.giftDebtAssumed` 아님)
- [ ] 안전망 반전(§6.1)이 형제 단언·엔진 route anchor 반전과 한 PR 안에 있다
- [ ] 꼬리 카드가 들어와도 3-자산 표가 남고 사이드바 합이 엔진 차감과 같다
- [ ] T1/T2 고지가 카드 · 상세명세서 · 인쇄 · PDF에서 구분된다
- [ ] `npx tsc --noEmit` 0건 · `npx vitest run __tests__/tax-engine/transfer-tax/ __tests__/calc/ __tests__/components/ __tests__/stores/`
- [ ] 다크 짝 · 라벨 폰트 정본 클래스 · 임의 px 금지 · placeholder 숫자 예시 금지
- [ ] 브라우저(Playwright) — 폼 → 계산 → 결과, Network 탭 request body (미수행 시 명시)

## 12. Do 단계 환류 (2026-10-28 구현 중 발견 — 설계서와 달라진 곳)

| # | 설계서 | 구현에서 확인한 사실 · 결정 |
|---|---|---|
| F-1 | §3.4 M-E2-3(건물 감가상각 + 건물 파트 채무)을 ⑧에 둔다 | `depreciationSupport`(`lib/calc/depreciation-scope.ts`)가 일반건물 이월과세에서 감가상각 칸을 닫고 ④도 싣지 않는다 — **화면에서 만들 수 없는 조합**이다. ⑧에 두지 않고 ⑫(`refineGbValuationRequired`)만 막는다(API 직접 호출). 범위 술어·⑤ 안내에도 넣지 않았다 |
| F-2 | §2.1 건물 파트 증여자 신축·증축을 자산 단위 술어(`unsupported{donorBuilt}`)로 | 그 조합은 **건물 파트에 채무가 있을 때만** 막힌다(토지 파트만 채무면 통과 — 엔진 R5). 자산 단위 술어에 넣으면 토글이 거짓으로 막힌다 → 술어는 `gbCarryoverDebtUnsupportedReason(asset, false)`(감면·용도변경), 건물 채무 + 증여자 신축은 ⑧(`validateGbCarryoverDebt`)과 건물 채무 칸 경고(`gbCarryoverBuildingDebt`)가 실제 채무로 가른다 |
| F-3 | §3.4 M-E2-2 위치 미지정 | unsupported 토글 ON 차단을 **파트 채무 칸 필수 검사보다 앞**에 둔다(`validateGbCarryoverDebtScope`). 이 상태의 UI는 채무 칸을 숨기므로(E1과 같은 패턴) 뒤에 두면 숨은 칸으로 이동시키는 막다른 길이 된다. 토글 ON + 채무 0 + 감면은 ⑧만 막는다(⑫는 채무 > 0일 때만 — E1 규칙과 같은 비대칭) |
| F-3b | 엔진이 쓴 `validateGbCarryoverDebt` 문구 | 「채무를 뺀 과세가액 기준으로 계산한 금액은 «증여세 상당액»에 입력합니다」는 E1 칸 안내다 — 일반건물에는 그 칸이 없어(산출세액·과세가액을 엔진이 안분) 거짓 안내였다. E2에서는 뺐다 |
| F-4 | §5.3 E3 T2를 `splitCarryoverNotices`에 push | 그 목록은 「확인 필요」(해석례 미확인) 자리라 계산 사실을 섞으면 의미가 어긋난다 → `splitCarryoverDebtNotices` 별도 함수(카드 별도 문단 · 상세명세서 취득가액 note · PDF 접두 없는 행) |
| F-5 | §3.6.2 상세명세서 꼬리 카드 「렌더 미확인」(V-11) | 실측: 증여분 카드의 양도가액 산식이 「1,000,000,000 × 200,000,000 / 400,000,000 = 375,000,000」(거짓 등식), 취득가액 문구가 「증여자 취득 당시 취득가액 112,500,000」(증여자 가액은 150,000,000), 꼬리는 산식 없음 → echo 기반 조각 산식(`purchasedPartPieceFormula`)으로 증여분·매입분 양도가액·취득가액 행을 대체 |
| F-6 | §3.5 ⑥ 소스 전환 | 구현은 `aggregated.properties` 합(`carryoverCardTotals`). 이월과세 카드(`carryoverTaxationDetail`)가 하나라도 있을 때만 — 비이월과세 일반건물은 환산·실가·swap·감가상각·지분 격자에서 두 소스가 같아(관측 불가) 보수적으로 불변 |
| F-7 | §3.6.2 신고서 열 | 꼬리 열이 일반건물 계산 파트 열로 판정되지 않아(`GB_CARD_BASE_IDS.has(baseCardId(col))`) 증여분 열은 비우는 세율·산출세액 칸이 꼬리 열에만 채워졌다 → 부모 id로 푼다 |
| F-8 | T1 고지 | A 채택일 때만(B 채택이면 A′ 조각은 세액에 반영되지 않았다 — echo는 B여도 붙는다). B 채택에서 PDF·상세명세서는 조각 고지를 내지 않는다(카드는 두 열을 비교로 그린다) |

### 12.1 남은 미검증 (V-n)
| # | 항목 | 상태 |
|---|---|---|
| V-15 | 입력 단계(계산 전) 사이드바가 이월과세 일반건물에서 수증자 기준(취득가액 5억 · 필요경비 600만)을 보인다 — 계산 후엔 엔진 값(4억·1,500만 또는 4.625억·1,275만)으로 바뀐다(2026-10-28 브라우저 실측) | V-5와 같은 별건 |
| V-16 | A 채택 일반건물 토지 카드의 **필요경비 산식**이 「취득시 토지기준시가 100,000,000 × 3% = 9,000,000」(3% × 1억 = 3,000,000 ≠ 9,000,000 — 값은 증여세 상당액) — 채무 OFF에서도 같은 거짓 등식(12,000,000)이 **이미** 있다. 이번 범위 밖 | 기존 결함 후보 · 별건 |
| V-17 | 감면·용도변경이 있는 일반건물에서 채무를 인수한 이월과세는 이제 입력할 방법이 없다(종전 분자 전용 입력이 막힘 — Q-UI-2 b 확정) | 사용자 확정 사항의 귀결 — 알림 |
| V-18 | 지분·컴패니언 일반건물의 감면 + 채무는 ⑫가 아니라 엔진 방어선 400(`carryoverTaxation.giftAssumedDebt`)으로만 막힌다 — ⑧은 막는다(화면은 문제 없음) | 엔진 V-10 잔여 |


## Do 환류 (2026-10-28 — PR-2 본인 지출 소실 수정과의 상호작용)

엔진 설계서 §11 참조. 일반건물 매입분 카드의 필요경비에서 환산 개산공제가 빠져 수치가 바뀐다: CDPP-11 결과 141,690,000 → **141,960,000**, ⑥ 사이드바 필요경비 12,750,000 → **12,000,000**(취득가액 462,500,000 불변), CDPP-14(지분 40%) 96,460,000 → **96,580,000**(신고서 필요경비 행 합계 33,100,000 → 32,800,000 · 매입분 열 300,000 → 0), CDPP-15(함께 양도) 181,431,000 → **181,746,000**(필요경비 행 합계 73,750,000 → 73,000,000 · 매입분 열 750,000 → 0). 매입분 블록의 표시 항목(양도가액·취득가액=채무·취득일·보유기간·양도차익)은 그대로이고 양도차익만 +개산공제만큼 커진다(브라우저 실측: 24,250,000 → 25,000,000). 위 표의 값은 당시 실측으로 두었다. V-16(토지 카드 필요경비 산식 거짓 등식)은 이번 변경과 무관하게 남는다.
