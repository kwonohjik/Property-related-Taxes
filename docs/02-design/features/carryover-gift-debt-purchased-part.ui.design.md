# 이월과세 — 당초 증여 때 인수한 채무 부분(매입분) 시나리오 A 분할 · UI 설계서

> 작성 2026-10-27 · 계획서 [`docs/00-pm/carryover-gift-debt-purchased-part.plan.md`](../../00-pm/carryover-gift-debt-purchased-part.plan.md)(Q-1 a · Q-2 a · Q-3 b · Q-4 a 확정) 및
> 선행 [`carryover-gift-tax-numerator-net.plan.md`](../../00-pm/carryover-gift-tax-numerator-net.plan.md) §10(V-7)의 UI 쪽 설계.
> 엔진 설계는 별도 문서(`carryover-gift-debt-purchased-part.engine.design.md`)가 정한다 — 이 문서는 엔진 설계에 기대는 항목을 §9에 모았다.
> 범위: **PR-1 = E1(단건·함께 양도, 일반건물·주택 분리 파트 제외)**. E2·E3·E4는 입력을 바꾸지 않고 안내만 붙인다(§2.6).
> 모든 file:line은 2026-10-27 worktree(branch `docs/carryover-gift-debt-purchased-part-plan`) 실측이다. 미검증은 「확인 필요」.

## 0. 요약

| 항목 | 결정(안) | 비고 |
|---|---|---|
| 입력 위치 | `CarryoverGiftBlock`의 **새 섹션 ⑤ 「당초 증여 때 인수한 채무」**(④ 비교과세 기준 뒤 · 적용배제 카드 앞). 토글 `ToggleCard` + 켜면 칸 | §2.2 |
| 토글·칸 키 | 기존 `carryover.giftDebtAssumed` · `carryover.giftAssumedDebt` **재사용**(①②③ 변경 0) | §3 |
| 노출·전송·필수 술어 | **하나**: `carryoverPurchasedPartScope(asset, {isNonPrimary})` → `apply` / `numerator_only` / `unsupported` | §2.1 · §6 |
| E4(지금 양도도 부담부증여) + 채무 토글 | 주택·토지·건물·상업용: 토글을 숨기고 안내. 남은 값(stale ON)이 있으면 토글을 켜진 채로 보여 끄게 하고 ⑧이 막는다(Q-3 b). 일반건물: **V-3 두 안**을 §2.5에 | 결정 Q-UI-3 |
| ⑥ 사이드바 | 입력 단계: **영향 없음**(probe 실측). 계산 후: 엔진이 결과 모양을 정한 뒤 확인 | §4 |
| ⑧ validate | 켜면 칸 필수(0 허용) · 채무 ≤ 평가액 · 음수 불가 · `unsupported`에서 켜져 있으면 차단. 기존 `assumedDebtIssue`를 공용 leaf로 올려 재사용 | §5 |
| ⑦ 결과 | 비교 카드 A 열에 「증여분 · 매입분」 두 블록(양도가액·취득가액·취득일·보유기간·양도차익) + 산식 + 방법 고지. 표시 문장은 공용 view 한 곳 | §7 |
| E2E | `e2e/carryover-gift-debt-purchased-part.spec.ts` (CDPP-1~9) | §8.3 |

**기존 안전망 반전 주의**: `__tests__/components/carryover-gift-assumed-debt-fields.anchor.test.tsx:74-80`이 「주택 이월과세 → 토글 없음」을 단언한다. PR-1은 이 단언을 정면으로 뒤집는다. 반전하면서 「범위 밖(E4) 주택 → 토글 없음·안내」 단언을 **같은 describe에 새로 둔다**(공유 단언 반전 = 형제 안전망 소실 방지).

## 1. 실측 (현행)

### 1.1 E1 화면 (throwaway 렌더 probe · probe 파일은 삭제함)
`<CarryoverGiftBlock asset={housing·carryover_gift}>` 렌더 결과:
- 섹션 머리글: 「증여 기본 정보」 · 「증여자 취득가액」 · 「필요경비 가산」 · 「비교과세 기준 (미적용 시나리오)」 · (적용배제 카드 안) 「증여자와의 관계」 · 「증여자와 같은 세대 여부」 · 「이월과세 적용배제 선언」.
- `data-field` 앵커 순서: `carryover.giftRegistryDate` → `carryoverDonorSplit` → `carryover.donorAcquisitionDate` → `carryover.donorAcquisitionPrice` → `carryover.giftTaxAmount` → `carryover.donorCapitalExpenditure` → `carryover.giftDateValuation` → `carryover.donorRelation` → `carryover.donorSameHousehold`.
- **`carryover.giftDebtAssumed`·`carryover.giftAssumedDebt` 앵커 없음** — 토글·칸이 E1에 없다(계획서 §3.1 E1 행 그대로).
- 토글이 있는 곳: 일반건물 분기 `components/calc/transfer/CarryoverGiftBlock.tsx:397-406`(`isEventBlock`일 때 · testid `carryover-gift-debt-assumed`) · 주택 분리 `components/calc/transfer/SplitCarryoverParts.tsx:130-137`(testid `split-carryover-gift-debt-assumed`).
- E1의 「증여세 상당액」 칸(`CarryoverGiftBlock.tsx:408-425`) 안내는 이미 「양도한 해당 자산의 증여세 과세가액(당초 증여 때 인수한 채무를 뺀 금액)」이다(V-7 Q-4 a). 이 칸은 **증여분의 상당액**으로 그대로 둔다(§2.3).

### 1.2 ⑥ 사이드바 (probe)
단건 주택 이월과세(양도가액 15억 · 증여자 취득가액 1억 · 증여 당시 평가액 10억)에서 `computeTransferPerAssetSummary`·`computeTransferSummary`를 토글 OFF / ON(채무 4억)으로 비교:

| | 양도가액 | 취득가액 | 필요경비 |
|---|---|---|---|
| OFF | 1,500,000,000 | 0 (숨김) | 0 |
| ON(채무 4억) | 1,500,000,000 | 0 (숨김) | 0 |

→ 입력 단계에서는 값이 **같다**. 이월과세 E1의 취득가액은 계산 후에야 알 수 있는 값이라 0원 제외 정책으로 숨는다(`lib/stores/transfer-per-asset-direct.ts:75-140` `directAcqRaw`는 이월과세 자산에서 `fixedAcquisitionPrice`(비어 있음)로 떨어진다 · `isPlainLumpSumAsset`은 이월과세를 제외 `lib/stores/transfer-per-asset-summary.ts:153`).

### 1.3 결과 표시 면
조각이 생기면 A의 취득가액·취득일·양도차익이 한 쌍이 아니게 된다. A를 그리는 모든 면:

| # | 면 | 위치 | 현재 A 표시 |
|---|---|---|---|
| S1 | 이월과세 비교 카드 | `components/calc/results/transfer/CarryoverComparisonCard.tsx:99-170`(`ScenarioAContent`) · 열 배치 `:311` · 인쇄 속성 `data-print-section="carryover"` | 취득가액 1줄·보유기간 1줄·양도차익 1줄 + 증여세 상당액·자본적지출 가산 |
| S2 | 신고서 양식 [A] | `components/calc/results/TransferTaxResultView.tsx:189-289`. A 채택이면 `FilingFormTable`(취득일 `acquisitionDateOverride={…carryover.donorAcquisitionDate}` `:203`), 미채택이면 `CarryoverScenarioAFilingCard.tsx:49-77`(취득일자 1줄) | 취득일 1개 |
| S3 | 상세명세서 | `DetailedStatementFormulaBuilders.ts:486-515`(취득가액 산식) · `:622-652`(필요경비 산식) | 「증여자 취득 당시 취득가액 X — 이월과세 §97의2①」 |
| S4 | 보유기간·장특 기산 표시 | `FilingFormTableDateHelpers.ts:100-112`(일반건물 BG 한정 echo 읽기) | 이월과세 단건은 `acquisitionDateOverride`로 처리 |
| S5 | PDF | `lib/pdf/ResultPdfTransferSections.tsx:98-130` 「신고서 양식」(최상위 `r.acquisitionPrice` 등) — **`scenarioA`·`carryoverTaxationDetail`를 읽는 곳이 `lib/pdf`에 0건**(grep) | 비교 카드 없음 |
| S6 | 함께 양도·다건 | `MultiTransferPropertyBreakdown.tsx:86`(`carryoverTaxationDetail: b.carryoverTaxationDetail`) · `BundledAllocationSubCards.tsx:147` → `ValuationDetailCards.tsx:134` → 같은 `CarryoverComparisonCard` | 자산별 카드 |

비교 카드는 단건 결과에서 `PrintSection id="calculation"`(`TransferTaxResultView.tsx:316-524`) 안에 있다(`:424`). 신고서 양식은 `id="form-table"`(`:189-289`).

## 2. ⑤ 입력 위젯

### 2.1 범위 술어 — 노출 = 전송 = 필수 = 차단이 **하나**

`lib/calc/carryover-gift-assumed-debt.ts`(기존 leaf `carryoverAssumedDebt`가 있는 파일)에 추가한다.

```ts
export type PurchasedPartScope =
  | { kind: "apply" }                                   // E1 — 시나리오 A 조각 규칙 적용
  | { kind: "numerator_only" }                          // E2·E3·E4(일반건물) — 현행 V-7(분자에서만 뺌). PR-2·3에서 apply로 승격
  | { kind: "unsupported"; reason: string };            // 조각 규칙 미지원 — reason은 ⑤ 안내·⑧ 메시지가 같이 쓴다

export function carryoverPurchasedPartScope(asset: AssetForm, opts?: { isNonPrimary?: boolean }): PurchasedPartScope
/** ④가 보내는 값: scope === apply ∧ 토글 ON ∧ 채무 > 0 일 때만 > 0, 아니면 0 */
export function carryoverPurchasedPartDebt(asset: AssetForm, opts?: { isNonPrimary?: boolean }): number
```

판정 순서(위에서 먼저 걸리는 쪽):

| 순서 | 조건 | kind | 근거(코드) |
|---|---|---|---|
| 0 | `acquisitionCause !== "carryover_gift"` | (해당 없음 — 블록 자체가 안 뜬다) | `CompanionAcquisitionCauseSection.tsx:400-408` |
| 1 | `assetKind === "general_building"` | `numerator_only` (E2·일반건물 E4 포함) | 토글이 이미 있다 `CarryoverGiftBlock.tsx:397` |
| 2 | `anyPartCarryover(asset, {isNonPrimary})` (C 통째 · A 토지만 · B 건물만) | `numerator_only` (E3) | `lib/calc/transfer-land-part-cause.ts:436`(`anyPartCarryover`). 컴패니언은 C를 꺼진 것으로 읽는다(`neutralizeCarryoverDonorSplitForCompanion` `:419`) — `opts.isNonPrimary`를 반드시 넘긴다 |
| 3 | `transferType === "burdened_gift"` (일반건물 제외) | `unsupported` — reason 「지금 양도하는 자산도 부담부증여입니다」 | 계획서 Q-3 b · E4 |
| 4 | **엔진 설계가 확정하는 제외 조건** (확인 필요) | `unsupported` | §9 D-3 |
| 5 | 그 밖 | `apply` | E1 |

제외 후보(엔진 설계가 정하면 4번 줄에 넣는다 — UI는 같은 술어를 import만 한다): 소유자 분리(`effectiveSelfOwns ≠ both`), 증여자 환산 중 PHD·APD(`carryoverPhdMode`), 1990.8.30. 전 토지 환산, 겸용주택(`isMixedUseHouse`), 다필지(`parcelMode`), 증여자 신축·증축(`donorBuilt`), 재개발·입주권·분양권. **UI는 이 목록을 자기 판단으로 만들지 않는다** — 엔진 설계의 분기표와 같은 leaf를 쓴다(이중 진실 금지).

### 2.2 위치와 구조 — 새 섹션 ⑤

계산 로직 순서: 비율 r의 분모(증여 당시 평가액)가 ④에 있고, 증여자 취득가액·취득일(②·①)과 증여세 상당액·증여자 자본적지출(③)은 모두 **증여분에만** 쓰인다(계획서 §4.1 표). 그러므로 채무는 **④ 뒤**에 받는다.
- ④ 섹션 제목이 「비교과세 기준 (미적용 시나리오)」라 시나리오 A의 토글을 거기 넣으면 제목과 어긋난다 → ④ 안에 끼우지 않고 **새 섹션 ⑤**를 둔다.
- 구성: `<ToneCard tone="amber" sectionNum={5} title="당초 증여 때 인수한 채무" bodyClassName="space-y-3">`(`components/calc/shared/ToneCard.tsx`). 적용배제 카드(rose)는 그 뒤에 그대로 둔다. 파일 머리 주석(`CarryoverGiftBlock.tsx:9-14`)의 「⑤ 적용배제」는 「⑥」으로 고친다.
- 새 컴포넌트 파일 `components/calc/transfer/CarryoverGiftDebtSection.tsx`로 분리한다(`CarryoverGiftBlock.tsx`는 552줄 — 800줄 정책상 여유는 있으나 섹션이 독립이다). props: `asset`, `onChange`, `isNonPrimaryAsset`, `shareMode`.
- 삽입 위치: `CarryoverGiftBlock.tsx:521`(④ 섹션 닫힘) 바로 뒤 · `:523` `</>)}` 앞 — 즉 `!splitMode` 분기 안이다. 일반건물(`isGeneralBuilding`)은 이 섹션을 그리지 않는다(자기 토글이 ③에 있다).
- 섹션 안 내용은 `kind`로 갈린다:

| kind | 토글 상태 | 그리는 것 |
|---|---|---|
| `apply` | OFF·ON | `ToggleCard`(amber · `data-testid="carryover-gift-debt-assumed"` · `data-field="carryover.giftDebtAssumed"`). ON이면 `children`으로 채무 `FieldCard` |
| `unsupported` | OFF | 토글 없이 안내 `ToneCard`(amber · `data-testid="carryover-debt-unsupported-note"`) |
| `unsupported` | **ON(남은 값)** | 토글을 **켜진 채로** 보이고(끌 수 있게) 설명을 rose 안내로 바꾼다 — 끌 길이 없으면 ⑧이 막는 막다른 길이 된다. 같은 패턴: `CarryoverGiftBlock.tsx:281`(부담부증여 일반건물에서 켜져 있을 때만 보이는 환산 토글) |
| `numerator_only` | — | 이 섹션을 그리지 않는다(자기 위치의 토글을 쓴다) |

`disabled` ToggleCard는 쓰지 않는다 — disabled는 회색 톤(`ToggleCard.tsx` `bg-muted/40`)이라 「OFF도 tone 유지」 규칙과 어긋난다(`components/calc/CLAUDE.md` 토글 가시성 원칙).

### 2.3 문구 (확정 대기 Q-UI-1)

모든 문구는 법령명 + 법/령 + 조항호 형식, 조어 금지. 「증여분」·「매입분」은 사용자 결정 어휘이므로 결과 표시에서 괄호 정의와 함께 쓴다(§7.3).

**토글** — `title="당초 증여 때 채무를 인수했다"`(기존 두 토글과 같은 제목 · Switch `aria-label`이 제목이므로 E2E `getByRole("switch", { name })`가 그대로 통한다)
- `description`: 「당초 증여가 부담부증여여서 채무를 인수했으면 켭니다. 부담부증여에서 수증자가 부담하는 채무액에 해당하는 부분은 양도로 보는 부분이라(「소득세법」 제88조 제1호 후단) 증여받은 자산에서 떼어, 시나리오 A에서 증여분과 채무 인수 부분으로 나누어 따로 계산합니다.」
  - 인용 검증: KoreanLaw MCP `get_law_text(mst=280405, jo=제88조)` 2026-10-27 현행 — 「대통령령으로 정하는 부담부증여 시 수증자가 부담하는 채무액에 해당하는 부분은 양도로 보며」(제88조 제1호 후단). 같은 조회로 제97조의2 제1항 제1·2·3호(취득가액·자본적지출·증여세 상당액)도 확인했다. 새 조문 상수 도입은 없다(`TRANSFER.TRANSFER_DEFINITION_88` 이미 존재 `lib/tax-engine/legal-codes/burdened-gift.ts:47`, 매니페스트 §88 `lib/legal-verification/manifest/additions-transfer.ts:19`) — manifest 추가 없음.
  - 계획서 §4.4 초안(「채무 부분은 산 것으로 보아 … (제88조 제1호 후단)」)은 「산 것으로 본다」까지 제88조 제1호 후단이 말하는 것처럼 읽힌다. 그 조문이 정하는 것은 「양도로 보는 부분」뿐이고 나누는 비율·취득가액·취득일은 사용자 결정이다(계획서 §1 마지막 줄) — 위 문구는 둘을 갈랐다.

**칸** — `FieldCard label="당초 증여 때 인수한 채무"` · `field="carryover.giftAssumedDebt"` · `CurrencyInput`(`data-testid="carryover-gift-assumed-debt"` · `placeholder="없으면 0"` — 숫자 예시 아님)
- `hint`: 「당초 증여 때 인수해 증여세 과세가액에서 뺀 채무 금액입니다(「상속세 및 증여세법」 제47조 제1항). 증여 당시 평가액에서 이 금액이 차지하는 만큼이 채무 인수 부분입니다. 채무 인수 부분은 증여 등기접수일을 취득일로, 이 금액을 취득가액으로 계산합니다 — 법령에 나누는 방법이 정해져 있지 않아 이 계산기가 정한 방법입니다. 없으면 0」
- 지분(공유) 모드(`shareMode`)면 끝에 「 지분 모드 — 증여 당시 평가액과 같은 100% 기준으로 입력합니다.」(증여세 3칸과 달리 이 칸은 평가액과 같은 기준이라 위 `SHARE_MODE_GIFT_TAX_HINT`의 예외 문구를 붙이지 않는다 — ④가 평가액과 같이 지분율로 스케일한다 §3).
- 비율을 입력 중에 미리 보이는 줄(「채무 비율 40%」)은 **두지 않는다** — 엔진의 정수 안분과 표시 값이 둘이 되는 이중 진실이다. 비율의 근거는 결과 카드가 엔진 echo로 보인다(§7).

**unsupported 안내**(OFF) — 「이 자산은 당초 증여 때 인수한 채무 부분을 시나리오 A에서 나누어 계산하지 못합니다(${reason}). 증여세 상당액에는 인수한 채무를 뺀 과세가액 기준으로 계산한 금액을 입력하세요.」

**unsupported 켜진 토글**(남은 값) — `description`을 「이 자산에서는 채무 인수 부분을 나누어 계산하지 못합니다(${reason}) — 이 토글을 끄세요.」로 바꾼다. ⑧ 메시지(§5.1 M3)와 같은 reason 문자열(술어 leaf가 준다).

### 2.4 같은 화면의 다른 칸에 붙는 안내 (`apply` ∧ 토글 ON일 때만)
조각 규칙(계획서 §4.1)이 칸의 뜻을 바꾸는 곳이다. 지금 그대로면 사용자가 「이 칸 전체가 계산에 들어간다」고 읽는다.

| 칸 | 위치 | hint 덧붙임 |
|---|---|---|
| 증여자 취득가액 | `CarryoverGiftBlock.tsx:299-311` | 「당초 증여 때 채무를 인수했으면 이 금액은 증여분(증여 당시 평가액 중 채무 인수 부분을 뺀 몫)에만 적용합니다.」 |
| 취득시·양도시 기준시가(환산) | `CarryoverEstimationSection.tsx:140-163` | 같은 문장 |
| 증여세 상당액 | `CarryoverGiftBlock.tsx:408-425` | 「증여분에만 산입합니다 — 채무 인수 부분은 증여받은 자산이 아니라 「소득세법」 제97조의2 제1항 제3호(증여세 상당액)의 대상이 아닙니다.」 |
| 증여자 자본적지출 | `CarryoverGiftBlock.tsx:428-447` | 「증여분에만 산입합니다(「소득세법」 제97조의2 제1항 제2호).」 |
| 본인 자본적지출·양도비(Q-2 a) | `AssetSectionExpense.tsx:107`(자본적 지출)·`:144`(양도비) 두 칸 아래, `:192` 안내 문단 앞에 안내 `ToneCard amber`(testid `carryover-debt-expense-split-notice`) | 「당초 증여 때 채무를 인수했으면 이 칸의 금액은 증여분과 채무 인수 부분에 같은 몫(증여 당시 평가액 − 인수한 채무 : 인수한 채무)으로 나누어 적용합니다.」 |

- 노출 조건은 모두 `carryoverPurchasedPartDebt`가 아니라 **scope=apply ∧ 토글 ON**(채무 칸이 비어도 토글 ON이면 안내는 보인다 — 칸 필수는 ⑧). 값 자체는 새 필드가 아니라 prop(`debtOn: boolean`)이며 store에 쓰지 않는다(useEffect→store 금지 준수).
- `AssetSectionExpense`는 `isNonPrimaryAsset`을 받지 않는다(`CompanionAssetCard.tsx:463-468`에 `isSingleAsset`만 있다). 컴패니언의 C 잔재가 술어 결과를 가르므로 prop을 추가해야 한다 — 부모가 그 값을 아는지 **확인 필요**.
- 숫자 입력 placeholder 규칙: 새 `placeholder`는 「없으면 0」뿐이다.

### 2.5 부담부증여(지금 양도) 표시 — 계획서 Q-3 b · §8 V-3

| 자산 | 현재 토글 | PR-1 표시 |
|---|---|---|
| 주택·토지·건물·상업용 부담부증여 (E1 블록이 뜬다) | **없다**(V-7은 일반건물만) | `unsupported`(§2.1 3번). OFF: 안내만. 남은 ON: 토글 + ⑧ 차단 |
| 일반건물 부담부증여 | **있다** — V-7 분자 토글 `CarryoverGiftBlock.tsx:397`. P0 사례(과세가액 6억)는 채무 칸 없이는 ⑧이 막힌다(`carryover-gift-tax-numerator-net.plan.md` §1) | **V-3 두 안** ↓ |

V-3 두 안(**결정 Q-UI-3**, 권장 a):
- **(a) 안내만 붙이고 계산은 현행 유지** — 토글 설명에 한 줄 덧붙인다: 「이 입력에서는 당초 증여 때 인수한 채무를 증여세 상당액 안분의 분자에서만 뺍니다. 시나리오 A에서 채무 인수 부분을 따로 나누는 계산은 아직 지원하지 않습니다.」(testid `carryover-debt-numerator-only-note`). 일반건물 E2(일반 양도 파트)·E3(주택 분리 `SplitCarryoverParts.tsx:130`)에도 같은 줄(PR-2·3에서 제거). 이유: 막으면 V-7이 열어 둔 입력(P0)이 다시 막다른 길이 된다.
- **(b) ⑧·⑫로 차단** — 일반건물 E4에서 토글 ON이면 계산을 막는다. 사용자는 채무를 뺀 값을 「증여 당시 평가액」에 넣는 옛 방식으로 돌아가야 하는데 그러면 R1(B 취득가액 오염)이 되살아난다(`carryover-gift-tax-numerator-net.plan.md` §1 R1n). UI는 토글을 켜진 채로 노출 + rose 안내 + ⑧ 메시지(M3과 같은 모양)를 준비한다.

(a)에서도 결과 화면이 「채무가 있었는데 매입분으로 나누지 않았다」를 말해야 하는가는 §7.6.

### 2.6 E2·E3 — 입력 변경 없음
계획서 §4.4 그대로다(파트 입력은 이미 있다). PR-1에서는 §2.5 (a)의 안내 줄만 붙인다. PR-2·3에서 `numerator_only → apply`로 승격할 때 술어 한 곳만 바꾸면 ⑤·④·⑧이 같이 따라온다.

## 3. ①②③④ — 폼·초기값·정규화·API 변환

| 지점 | 상태 | 근거 |
|---|---|---|
| ① 타입 | **변경 없음** — `CarryoverTaxationForm.giftDebtAssumed: boolean`·`giftAssumedDebt: string` | `lib/stores/calc-wizard-asset-carryover.ts:104-106` |
| ② initial | 변경 없음 — `false`·`""` | `:173-174` (`CARRYOVER_DEFAULTS`) |
| ③ normalize | 변경 없음 — `raw.giftDebtAssumed === true` · `typeof raw.giftAssumedDebt === "string"` (옛 이력 = OFF·"" = 종전 세액) | `:236-237` |
| ④ API 변환 | **`buildCarryoverPayload` 한 함수만** — `carryoverPurchasedPartDebt(asset, …) > 0`이면 `carryoverTaxation`에 채무 키를 싣는다. 지분 모드는 `scale()`(= `applyRatio`)로 `giftDateValuation`과 같은 기준 | `lib/calc/transfer-tax-api-carryover.ts:87-140`(`giftDateValuation: scale(...)` `:140`) |

- 호출부가 3곳이다 — 주 자산 `lib/calc/transfer-tax-api.ts:728` · 컴패니언 `transfer-tax-api-companion-payload.ts:654` · 일반건물 지분 `transfer-tax-api-gb-shares.ts:230`. 셋 다 같은 함수를 부르므로 한 곳만 고치면 된다. 단, **일반건물 지분(`gb-shares:230`)은 scope가 `numerator_only`라 새 키가 가지 않아야 한다** — 술어가 막아야 하는 지점이고 anchor로 단언한다(§8.1).
- `opts.isNonPrimary`: `buildCarryoverPayload`는 컴패니언 여부를 인자로 받지 않는다. 컴패니언은 호출 전에 C가 중화되어 있는지(`neutralizeCarryoverDonorSplitForCompanion`) **확인 필요** — 아니면 시그니처에 옵션을 더한다.
- 채무 0은 보내지 않는다(조각 없음 = OFF와 같은 세액). ⑧은 0을 허용한다(계획서 §4.4).
- **와이어 키 이름은 엔진 설계가 정한다.** 현재 `CarryoverTaxationInput.giftAssumedDebt`는 E2·E3 합성기가 만든 **표시 전용 echo**다(`lib/tax-engine/types/transfer-carryover.types.ts:116` — 「계산에는 다시 쓰지 않고」). 같은 이름으로 E1 입력을 받으면 echo가 입력으로 읽히는 충돌이다 → §9 D-1.
- ⑬(`callTransferTaxAPI` body)·⑫(Zod `lib/api/transfer-tax-schema-base-shape.ts:551` 근처 `carryoverTaxation` 객체에 채무 키 없음 — 침묵 strip 위험)·⑭ Route는 엔진 시니어 소관이며 같은 PR에서 grep 자가 점검한다.

## 4. ⑥ 사이드바

- 입력 단계: §1.2 probe로 **영향 없음**이다. 이월과세 E1의 취득가액·필요경비는 계산 전에 확정되지 않는 값이라 이미 숨는다 — 토글·채무 값으로 숨김/표시가 바뀌지 않는다. 코드 변경 0.
- 계산 후: 엔진이 결과를 어떤 모양으로 돌려주는지에 달렸다(확인 필요 — §9 D-2).
  - 결과가 `mode: "single"`이고 조각이 `scenarioA` echo 안에만 있으면 사이드바 변경 0.
  - 결과가 `mode: "bundled"`(조각을 함께 양도 2건으로 집계)이면 `computeTransferPerAssetSummary`의 `bundledMatch`(폼 `assetId`/`primary` 일치 `lib/stores/transfer-per-asset-summary.ts:352-353`)가 조각 id를 못 찾는다. **자산 1건**이면 `bundledCards` 합산 분기(`:366`)가 조각을 합쳐 주므로 우연히 맞지만, **함께 양도 N건**에서는 매칭이 없어 양도가액이 「계산 후 표시」에 갇힌다. 조각 id에 지분 분할과 같은 접미사 규약(`SHARE_ID_SEPARATOR` `lib/tax-engine/general-building-share-id.ts`)을 쓰고 사이드바에 `gbShareBgCards`(`:380`) 같은 접미사 합산을 더해야 한다.
  - 어느 쪽이든 사이드바 합계 정책(계산 가능 항목만·0원 제외·이중 계산 금지)은 그대로다. 합계의 취득가액은 엔진이 실제로 차감한 값(조각 합)이어야 「양도가 = 취득가 + 경비 + 차익」이 선다.

## 5. ⑧ validate

위치: `lib/calc/transfer-tax-validate-carryover-asset.ts` `validateCarryoverAsset`(`:26`) 의 E1 경로(`:41` 이후). 화면 순서(① → ② → ③ → ④ → **⑤ 새 섹션** → 적용배제) 대로 **(f-2) PHD 차단(`:140-145`) 다음 · (g) 세대 사실(`:147-149`) 앞**에 `(f-3)`으로 둔다. 기존 (c)(`:74-76`)이 평가액 > 0을 먼저 요구하므로 채무 ≤ 평가액 비교의 전제가 선다.

### 5.1 규칙·메시지

`label`은 호출자가 붙이는 자산 라벨(「자산 1」 등)이다. 앵커는 리터럴 삼항·리터럴 문자열이어야 한다(`__tests__/lib/calc/transfer-validation-field-anchor-coverage.test.ts:41-48` 정규식이 `fieldError("…")`·`fieldError(cond ? "a" : "b", …)`만 잡는다).

| # | 조건(scope=apply ∧ 토글 ON) | field | 메시지 |
|---|---|---|---|
| M1 | `giftAssumedDebt` 공백 | `carryover.giftAssumedDebt` | 「${label}: 당초 증여 때 인수한 채무를 입력하세요 — 증여세 과세가액에서 빠진 그 자산의 채무입니다. 없으면 0을 입력하세요 (「상속세 및 증여세법」 제47조 제1항).」 — 기존 `assumedDebtIssue`(`transfer-tax-validate-gb-carryover.ts:194-201`)와 **같은 문장**이다 |
| M2 | 채무 > 증여 당시 평가액 | `carryover.giftAssumedDebt` | 「${label}: 당초 증여 때 인수한 채무가 증여 당시 평가액보다 큽니다.」(기존과 같은 문장 · 채무 = 평가액은 허용 — r = 1) |
| M2′ | 채무 < 0 | `carryover.giftAssumedDebt` | 「${label}: 당초 증여 때 인수한 채무는 음수일 수 없습니다.」 — UI로 도달 불가(⑫와 대칭, `unreachableInUi`) |
| M3 | scope=unsupported ∧ 토글 ON | `carryover.giftDebtAssumed` | 「${label}: 이 자산(${reason})에서는 당초 증여 때 인수한 채무 부분을 시나리오 A에서 나누어 계산하지 못합니다 — «당초 증여 때 채무를 인수했다»를 끄세요. 채무를 뺀 과세가액 기준으로 계산한 금액은 «증여세 상당액»에 입력합니다.」 |

- M1·M2는 **공용 leaf로 올린다**: 기존 `assumedDebtIssue`를 `lib/calc/transfer-tax-validate-carryover-debt.ts`(파일명이 `transfer-tax-validate*`라 앵커 커버리지 게이트가 스캔한다 `…anchor-coverage.test.ts:36-49`)로 옮겨 GB와 E1이 같은 함수를 쓴다. 메시지가 두 벌이 되면 한쪽만 고쳐지는 드리프트가 난다. 이동은 동작 불변 리팩터이고 GB 앵커 테스트가 그대로 통과해야 한다.
- M3은 토글 앵커 `carryover.giftDebtAssumed`가 화면에 있어야 한다(§2.2 `data-field`). `ToggleCard`는 `data-field` prop을 받는다(`ToggleCard.tsx` props). 없으면 앵커 커버리지 게이트가 빨개진다.
- 안내문이 토글 제목 「당초 증여 때 채무를 인수했다」를 인용하므로 E2E는 `getByText`로 토글을 찾지 말고 `getByRole("switch", { name })`를 쓴다(메모리 `feedback_hint_quoting_toggle_title_breaks_selector`).
- `scope === numerator_only`: ⑧ 변경 없음(기존 파트별 규칙 그대로). §2.5 (b)를 고르면 일반건물 E4 + 토글 ON에 M3을 같은 모양으로 더한다.
- 자동 안분·자동 채움 없음. 채무 빈칸은 차단이다(「미입력은 validation 단계에서 명확한 오류로 차단」).

### 5.2 E2E 필드 이동 케이스 (`e2e/_helpers/validation-field-jump-cases-acq.ts`의 `carry` 헬퍼, `:41-52`)
- `carryover.giftAssumedDebt` M1 · M2 · M2′(`unreachableInUi: NEGATIVE`) · `carryover.giftDebtAssumed` M3(부담부증여 주택 + 토글 ON 시드). 한 메시지 = 한 케이스 규약(`:3-4`).

## 6. 3중 패턴 표 (⑤ 노출 = ④ 전송 = ⑧ 필수 — 술어 하나)

| 층 | 읽는 것 | 위치 |
|---|---|---|
| ⑤ 노출 | `carryoverPurchasedPartScope(asset, {isNonPrimary})` + `giftDebtAssumed` | `CarryoverGiftDebtSection.tsx` · `AssetSectionExpense` 안내 · 2.4의 hint 덧붙임 |
| ④ 전송 | `carryoverPurchasedPartDebt(asset, …)` | `buildCarryoverPayload` |
| ⑧ 필수·차단 | scope + 토글 + 같은 leaf | `validateCarryoverAsset (f-3)` |
| ⑫ Zod | 엔진 설계 | 채무 ≤ 평가액 refine이 ⑧과 같은 규칙이어야 한다(`transfer-tax-schema-companion-refines.ts:325` 근처 `giftDateValuation` refine 옆) |

- 토글 기본값 fallback은 없다(OFF = false = 조각 없음). UI display fallback이 없으므로 「UI 통과 ↔ validate 차단」 모순 지점은 **scope=unsupported 남은 ON**뿐이고 §2.2가 토글을 켜진 채로 보여 해소한다.
- stale 방어: 값은 지우지 않는다(D0 G-6 관례 `transfer-land-part-cause.ts:390`·`:412`). 읽는 쪽(④·⑧)이 scope로 걸러 쓴다. 일반건물로 바꾼 뒤 남은 ON은 `numerator_only`로 V-7 분자에 읽히는데 **토글이 화면에 보이므로** 조용하지 않다.
- `useEffect → store` 미러링 없음 — 채무 칸은 `onCheckedChange`로 토글만 쓰고, 토글 OFF 때 채무 문자열을 지우지 않는다.

## 7. ⑦ 결과

### 7.1 엔진 설계에 기대는 echo (제안 — 이름·모양은 엔진 설계가 확정)
비교 카드는 **채택과 무관하게 A 열을 항상 그린다**(`CarryoverComparisonCard.tsx:105-110` 주석 — B 채택이면 최종 결과에 A 상세가 없다). 그래서 조각 echo는 `CarryoverScenarioADetail` 안에 있어야 한다(`transfer-carryover.types.ts` — `giftTaxApportionment`가 같은 이유로 A에 있다).

```ts
// CarryoverScenarioADetail.purchasedPartSplit?: CarryoverPurchasedPartSplit   (없으면 조각 없음 = 현행 표시)
interface CarryoverPurchasedPartSplit {
  debtAmount: number;            // 당초 증여 때 인수한 채무 (지분 스케일 후)
  giftValuation: number;         // 증여 당시 평가액 (지분 스케일 후)
  transferPrice: number;         // 자산 양도가액 합계(조각 분할 전)
  donorAcquisitionPrice: number; // 당초 증여자 취득가액(분할 전 · 환산이면 환산취득가액)
  gift: CarryoverPieceEcho;      // 증여분
  purchased: CarryoverPieceEcho; // 매입분
}
interface CarryoverPieceEcho {
  transferPrice: number; acquisitionPrice: number;
  acquisitionDate: string;       // "YYYY-MM-DD" — Date 금지(JSON 경유 string 도달 함정)
  holdingPeriodYears: number; transferGain: number;
  appliedRateLabel?: string;     // 있으면 표시 — 단기 70% 같은 세율 구분
}
```

요구 불변식(엔진 anchor로 확인): `gift.transferPrice + purchased.transferPrice = transferPrice` · `gift.transferGain + purchased.transferGain = scenarioA.transferGain` · `purchased.acquisitionPrice = debtAmount` · `purchased.acquisitionDate = giftRegistryDate`.

`scenarioA.acquisitionPrice`가 조각 후 합인지 분할 전 증여자 취득가액인지도 엔진 설계가 정한다 — 카드 산식이 「당초 증여자 취득가액 × …」을 보여야 하므로 `donorAcquisitionPrice`를 별도로 요청한다.

### 7.2 표시 문장 정본 — 공용 view (결과 4뷰가 같은 문장)
`lib/tax-engine/transfer-tax-carryover-purchased-part-display.ts`(순수 함수 · 새로 계산하지 않고 echo만 읽는다). 같은 패턴: `lib/tax-engine/transfer-tax-carryover-donor-display.ts`(`donorBuiltPenaltyView` — 카드·상세명세서·신고서·PDF·경고가 같은 문장을 쓴다). 반환: `{ pieces: [gift, purchased] 각 행 목록, formulaLines: string[], notice: string }`. S1 카드 · S2 미채택 A 카드 · S3 상세명세서 · S5 PDF가 이 view를 부른다. 산식 문장은 한국어 풀어쓰기 — 변수 약어·`floor()` 금지, 숫자마다 변수명 라벨, 중간 산술 결과 미표시(`components/calc/CLAUDE.md` 결과 뷰 산식).

### 7.3 S1 — 비교 카드 A 열 (`CarryoverComparisonCard.tsx`)
`purchasedPartSplit`이 있으면 `ScenarioAContent`(`:99-170`)의 취득가액·보유기간·양도차익 3줄 자리를 **조각 두 블록**으로 바꾼다. 없으면 현행 그대로(회귀 0). 새 파일 `components/calc/results/transfer/CarryoverPurchasedPartRows.tsx`로 뺀다(카드 366줄).

```
[A] 이월과세 적용                                   ✓ 채택
 ┌ 증여분 (당초 증여자 기준)  ─────────────────────────
 │ 양도가액   [양도가액 × 증여분 몫]                 900,000,000
 │ 취득가액   [당초 증여자 취득가 × 증여분 몫]          60,000,000
 │ 취득일     [당초 증여자 취득일]                      2000-06-01
 │ 보유기간   [당초 증여자 기산]                              26년
 │ 양도차익                                         840,000,000
 ├ 매입분 (채무 인수 부분)  ───────────────────────────
 │ 양도가액   [양도가액 − 증여분 양도가액]            600,000,000
 │ 취득가액   [당초 증여 때 인수한 채무]              400,000,000
 │ 취득일     [증여 등기접수일]                         2023-06-01
 │ 보유기간   [증여 등기접수일 기산]                          2년
 │ 양도차익                                         200,000,000
 └ (세율 구분 — echo가 있을 때만: 「단기 보유 70%」)
  + 증여세 상당액 가산 [§163의2] (증여분)   …   (기존 줄 · 라벨에 「증여분」)
  + 당초 증여자 자본적지출 [§97조의2 ① 2호] (증여분)
  * 증여분 양도가액 = 양도가액 1,500,000,000 × (증여 당시 평가액 1,000,000,000 − 인수한 채무 400,000,000) ÷ 증여 당시 평가액 1,000,000,000
  * 증여분 취득가액 = 당초 증여자 취득가액 100,000,000 × (같은 몫)
  * 매입분 양도가액 = 양도가액 1,500,000,000 − 증여분 양도가액 900,000,000
  * (방법 고지 — §7.4)
 결정세액                                           293,970,000
```
(숫자는 계획서 §2 사례의 손계산 값이다. 위 도식의 증여분 양도차익은 증여세 상당액 0·자본적지출 0 가정 — 실제 값은 엔진 echo다.)

- 행은 기존 `InfoRow`(`:86` · `font-mono tabular-nums whitespace-nowrap` 금액 정렬 규약)를 그대로 쓴다. 조각 블록 외곽은 `rounded-md border p-2`에 `data-testid="carryover-piece-gift"` · `"carryover-piece-purchased"`. 행 값은 `data-testid="carryover-piece-{gift|purchased}-{transfer-price|acquisition-price|acquisition-date|holding-years|transfer-gain}"`.
- 몫의 분수 표기는 기존 안분 산식(`:148-158`)과 같은 `Frac`(`components/calc/results/shared/FormulaParts`)을 쓴다: `Frac top="증여 당시 평가액 − 인수한 채무액" bottom="증여 당시 평가액"` — 숫자는 각 항 옆에 변수명 라벨로(`:148-158` 방식). 「증여분 몫」이라는 이름의 중간 값(60%)은 **표시하지 않는다**.
- 증여분 = 0(r = 1 · 채무 = 평가액): 증여분 블록을 숨기지 않고 한 줄 「증여분 없음 — 인수한 채무가 증여 당시 평가액 전액입니다」로 접는다(조용히 사라지면 A가 B와 같아 보이는 이유를 설명할 수 없다).
- 열은 `flex-1`로 B와 나란하다(`:311`). 조각 때문에 A 열이 길어지는 건 허용하고 가로 배치는 바꾸지 않는다. 폭이 좁은 화면 처리는 현행 한계 그대로(별건).
- 색: 새 안내줄은 `text-micro text-muted-foreground`(기존 `:148-158`). 톤 글자를 쓰면 다크 짝(`text-amber-700 dark:text-amber-300`)을 단다 — `check-dark-pairs.mjs` pre-push 게이트.
- B 채택일 때도 A 열은 조각 두 블록을 그린다(채택 배지만 B에). 신고 단위 비교(`filingUnitComparison`)가 있으면 기존 안내가 이미 「A·B 금액은 이 자산만 떼어낸 값」이라고 말한다.

### 7.4 방법 고지 (확정 대기 Q-UI-2)
비율·취득가액·취득일은 법령에 정한 방법이 없고 사용자 결정이다(계획서 §1 마지막 줄). 엔진이 만든 다른 사용자 결정 계산과 같은 규약(`DONOR_BUILT_APPLIED_NOTICE` 「정면 해석례 미확보 — 확인 필요」 `transfer-tax-carryover-donor-display.ts`)으로 카드에 한 줄을 둔다.
- 문구안: 「채무 인수 부분의 몫·취득가액·취득일은 법령에 정해져 있지 않아 다음 방법으로 계산했습니다 — 몫: 인수한 채무 ÷ 증여 당시 평가액, 취득가액: 인수한 채무, 취득일: 증여 등기접수일. 이 방법에 대한 해석례는 확인하지 못했습니다 — 확인 필요.」
- 상수 `CARRYOVER_PURCHASED_PART_METHOD_NOTICE`를 위 display leaf에 둔다. 고지에서 유불리·절감 표현은 쓰지 않는다.
- 사용자가 이 고지 자체를 원치 않으면 입력 단계 hint(§2.3)에만 남기는 안이 있다 — 결정 사항.

### 7.5 S2~S5 — 같은 echo를 읽는 다른 면
| 면 | 변경 |
|---|---|
| S2 [A] 신고서 양식 미채택 카드 `CarryoverScenarioAFilingCard.tsx:49-77` | `rows`의 「취득일자」·「취득가액」 자리에 조각 두 줄씩(`SummaryRow`). 행 수가 늘 뿐 구조 변경 없음 |
| S2 [A] 채택 `FilingFormTable`(`TransferTaxResultView.tsx:197-215`) | 최상위 `result`가 무엇을 담는지(조각 합? 증여분만?)가 엔진 설계에 달렸다 → **확인 필요**(§9 D-2). 취득일 칸은 `acquisitionDateOverride`가 1개 날짜만 받는다(`:203`) — 두 날짜면 서식 부제로 「취득일 2000-06-01 · 2023-06-01(채무 인수 부분)」을 적는 안이 필요하다 |
| S3 상세명세서 `DetailedStatementFormulaBuilders.ts:486-515`(취득가액) · `:622-652`(필요경비) | A 채택 분기에서 `purchasedPartSplit`이 있으면 view의 `formulaLines`를 반환. 필요경비 줄: 증여세 상당액·증여자 자본적지출은 증여분에만, 본인 자본적지출·양도비는 같은 몫으로 나눠 적었다는 문장 |
| S5 PDF `lib/pdf/ResultPdfTransferSections.tsx:98-130` | 「신고서 양식」은 최상위 값만 읽고 비교 카드가 없다. 최소안: 가산세 view(`donorViews` `:118-125`)와 같은 자리에 `purchasedPartView.formulaLines`와 고지를 `lblSub` 행으로 추가(A 채택일 때만). 비교 카드를 PDF에 넣는 것은 별건 — **결정 Q-UI-5** |
| 인쇄(print) | 카드는 `PrintSection id="calculation"`(`TransferTaxResultView.tsx:316-524`) 안이고 새 블록에 접힘·토글이 없다(항상 렌더) → 별도 처리 없이 인쇄에 포함된다. 접힘 UI를 넣으면 `block / hidden print:block` 패턴(`print-only-css-toggle`)을 따라야 하므로 넣지 않는다 |

### 7.6 조각을 나누지 않은 경우의 고지 (V-3 (a) 선택 시)
E2·E3·E4(일반건물)에서 채무 토글 ON인데 조각을 나누지 않은 결과를 인쇄·PDF가 침묵하면 입력 화면의 안내줄(§2.5)만 증거가 된다. 결과에 한 줄(「당초 증여 때 인수한 채무는 증여세 상당액 안분의 분자에서만 뺐고, 채무 인수 부분을 나누어 계산하지 않았습니다.」)을 싣는 안은 echo(`debtAmount` 있고 `purchasedPartSplit` 없음)가 필요하다 — **결정 Q-UI-4**(PR-1 범위에 넣을지 PR-2·3 승격 때까지 입력 안내만 둘지).

## 8. 테스트

### 8.1 vitest (`npx vitest run __tests__/calc/ __tests__/components/ __tests__/lib/calc/`)
- **반전**: `carryover-gift-assumed-debt-fields.anchor.test.tsx:74-80` 「주택 이월과세 → 토글 없음」 → 「토글 있음(OFF) · 채무 칸 없음 · ON이면 `carryover.giftAssumedDebt` 칸 1개」. 같은 describe에 「부담부증여 주택 → 토글 없음 · `carryover-debt-unsupported-note` 있음」 · 「부담부증여 주택 + 남은 ON → 토글 켜짐」을 추가한다(범위 밖 안전망 유지).
- 범위 술어 격자: `kind`를 (자산 종류 × 양도형태 × 분리 토글 × 컴포넌트 `isNonPrimary`) 전수로 단언 → ⑤·④·⑧ 세 층이 같은 kind를 읽는지(같은 입력으로 세 함수를 부르는 anchor 한 파일).
- ④: `buildCarryoverPayload` — scope=apply ∧ ON ∧ 채무>0만 키 존재 · OFF·채무0·numerator_only(일반건물·주택 분리)·unsupported(부담부증여)는 키 없음 · 지분 1/2는 채무 ×ratio · stale(OFF인데 값 남음)은 키 없음.
- ⑧: M1·M2·M2′·M3 각각 메시지와 `field`. GB 쪽 기존 anchor 불변(함수 이동 회귀).
- 뮤테이션(계획서 §7 보강): ⑤에서 scope 무시 / ④에서 토글 무시 / ⑧에서 scope 무시 / 공용 leaf에서 `giftAssumedDebt.trim() === ""` 제거 / `AssetSectionExpense` 안내를 scope 없이 노출.
- ⑦: `CarryoverComparisonCard` 렌더 — echo 있음(두 블록 testid·행 값·산식 숫자 라벨·고지) / echo 없음(현행 3줄 그대로) / 증여분 0 / B 채택에서도 A 열 조각.

### 8.2 정합 게이트 (자동)
`__tests__/lib/calc/transfer-validation-field-anchor-coverage.test.ts`(검증 field ⊆ 화면 앵커) — `carryover.giftDebtAssumed`·`carryover.giftAssumedDebt` 앵커가 §2.2에 있어야 통과. `transfer-validation-field-jump-cases.test.ts`는 §5.2 케이스를 요구할 수 있다(확인 필요).

### 8.3 E2E — `e2e/carryover-gift-debt-purchased-part.spec.ts`
시드: `makeDefaultAsset` + `CARRYOVER_DEFAULTS`(`e2e/carryover-d45-spouse-legacy.spec.ts:20-55`와 같은 sessionStorage 시드) · `seedWizard`·`calculate`(`e2e/_helpers/split-acq-display.ts`, 요청 body 가로채기) · 카드 접근 `e2e/_helpers/expandAssetSection.ts`. 계산 값은 vitest anchor와 같은 사례(계획서 §2: 주택·다주택·비조정·양도 2026-03-01 15억·증여 2023-06-01·평가액 10억·채무 4억·증여자 취득 2000-06-01 1억).

| ID | 시나리오 | 셀렉터·단언 |
|---|---|---|
| CDPP-1 | 입력 노출 | 이월과세 주택 → `getByRole("switch", { name: "당초 증여 때 채무를 인수했다" })` 보임(OFF) · `[data-field="carryover.giftAssumedDebt"]` 0개. ON → 1개 · OFF 복귀 → 0개이고 입력값은 남아 있다(sessionStorage 값) |
| CDPP-2 | ⑧ 차단·이동 | ON + 빈칸 → 계산(「계산하기」/「다음」) 차단 · 오류 클릭 시 `[data-field="carryover.giftAssumedDebt"] input` 포커스. 채무 > 평가액 → 차단. 0 입력 → 통과 |
| CDPP-3 | 요청 body | ON·4억 → `body.carryoverTaxation.<키>` = 400000000(키는 엔진 설계). OFF → 키 없음. ON 후 OFF → 키 없음(stale). 지분 50/100 → 200000000 |
| CDPP-4 | 결과 — 매입분 장기보유 | §2 사례 → `[data-testid="carryover-piece-gift"]`·`…-purchased` 값(증여분 900,000,000 · 60,000,000 · 2000-06-01 / 매입분 600,000,000 · 400,000,000 · 2023-06-01) · 채택 A · `[data-print-id="form-table"]`에 `293,970,000`. OFF → `374,610,000` · 조각 블록 0개 |
| CDPP-5 | 결과 — 단기 | 증여 2025-06-01 → `349,270,000` · 매입분 보유기간 행 · 고지 문구 |
| CDPP-6 | 부담부증여(지금 양도) 주택 | `carryover-debt-unsupported-note` 보임 · 토글 0개. 남은 ON 시드 → 토글 켜짐 · 계산 차단(M3 문구) · 끄면 통과 |
| CDPP-7 | 일반건물 회귀 | 기존 `GBGT-E10`(`e2e/gb-bg-carryover-gift-tax-input.spec.ts:247-262` — 상당액 12,000,000 · 107,454,000) 불변 + `carryover-debt-numerator-only-note` 보임(§2.5 a) |
| CDPP-8 | 함께 양도 | 자산 2를 이월과세 주택 + 토글 ON → request body의 컴패니언 `carryoverTaxation` 채무 키 · 사이드바 자산 2 양도가액이 「계산 후 표시」에 갇히지 않는다(§4) |
| CDPP-9 | 인쇄 | 「출력 항목 선택」에서 **전체 선택 먼저**(메모리 `feedback_print_media_needs_section_selection`) 후 `emulateMedia({ media: "print" })` → 조각 두 블록이 보인다 |

- 브라우저 실측은 Playwright로 한다(메모리 `feedback_browser_verify_with_playwright`). 워크트리에서는 `E2E_PORT` 지정.
- 공유 카드는 `data-testid`를 전달하지 않는 경우가 있다 — `ToggleCard`는 전달한다(`ToggleCard.tsx` `"data-testid"` prop). 새 `FieldCard`/`CurrencyInput`의 testid는 `CurrencyInput`이 전달하는지 구현 때 DOM으로 확인한다(확인 필요 — 메모리 `feedback_shared_card_testid_not_forwarded`).

## 9. 엔진 설계에 기대는 항목

| # | 항목 | 이 문서의 의존 지점 |
|---|---|---|
| D-1 | **와이어 키 이름**과 `CarryoverTaxationInput.giftAssumedDebt`(표시 전용 echo `:116`)와의 충돌 해소 | §3 ④ · §6 ⑫ |
| D-2 | 조각을 신고 단위 집계에 넣은 뒤 **결과 모양**(`mode: "single"` 유지 / `bundled`)과 조각 id 규약, 최상위 `result`가 조각 합인지 | §4 ⑥ · §7.5 S2 |
| D-3 | **범위 제외 조건 목록**(소유자 분리·PHD·APD·1990 토지·겸용·다필지·donorBuilt·재개발·분양권)과 같은 leaf 위치 | §2.1 4번 줄 |
| D-4 | echo `CarryoverScenarioADetail.purchasedPartSplit` 이름·필드 · 불변식 · `scenarioA.acquisitionPrice` 의미 | §7.1 |
| D-5 | 조각 echo가 **B 채택일 때도 A 안에** 남는지(A 열을 항상 그리는 규칙) | §7.3 |
| D-6 | 세율 구분 echo(`appliedRateLabel`)를 줄지 — 단기 매입분의 근거 표시 | §7.3 |
| D-7 | E4 + 토글 ON 차단의 ⑫ 메시지 문장(⑧ M3과 같은 reason) — Q-3 b | §5 M3 |
| D-8 | 조각 취득일 = `giftRegistryDate`(증여 등기접수일)임을 echo가 `string`으로 준다(Date 금지) | §7.1 |
| D-9 | 컴패니언에서 `buildCarryoverPayload` 호출 전 C 중화 여부 | §3 |

## 10. 결정 요청

> ✅ 2026-10-27 Q-UI-1~5 권장안 확정.

| # | 질문 | 선택지 | 권장 |
|---|---|---|---|
| **Q-UI-1** | 토글·칸 문구(§2.3) — 「산 것으로 본다」를 빼고 「양도로 보는 부분이라 … 나누어 따로 계산」으로 쓴 점 | a 이 문서의 문구 / b 계획서 §4.4 초안 그대로 | a — 제88조 제1호 후단이 말하는 것과 사용자 결정(비율·취득가액·취득일)을 가른다 |
| **Q-UI-2** | 결과 카드의 방법 고지(§7.4) | a 둔다(「확인 필요」 규약) / b 입력 hint에만 | a |
| **Q-UI-3** | 일반건물 E4·E2·E3 토글 ON(V-3, §2.5) | a 안내만 · 계산 현행 / b 차단 | a — V-7이 연 입력(P0)을 다시 막지 않는다 |
| **Q-UI-4** | 조각을 나누지 않은 결과 화면 고지(§7.6) | a PR-1에 넣는다(echo 필요) / b 입력 안내만 | b — 엔진 echo 부담을 PR-2·3 승격으로 미룬다. 단 (a)이면 인쇄물이 침묵한다는 점을 안다 |
| **Q-UI-5** | PDF(§7.5 S5) | a 최소안(고지·산식 행) / b 후속 | a |

## 11. 파일 변경 목록 (Do 단계 · 800줄 점검 포함)

| 파일 | 변경 | 현재 줄 수 |
|---|---|---|
| `lib/calc/carryover-gift-assumed-debt.ts` | `PurchasedPartScope` · `carryoverPurchasedPartScope` · `carryoverPurchasedPartDebt` 추가 | 23 |
| `lib/calc/transfer-tax-validate-carryover-debt.ts` (신규) | `assumedDebtIssue` 이동 + M3 | — |
| `lib/calc/transfer-tax-validate-gb-carryover.ts` | `assumedDebtIssue` import로 교체 | — |
| `lib/calc/transfer-tax-validate-carryover-asset.ts` | (f-3) 호출 | 162 |
| `lib/calc/transfer-tax-api-carryover.ts` | 채무 키 1개 | — |
| `components/calc/transfer/CarryoverGiftDebtSection.tsx` (신규) | §2.2 섹션 | — |
| `components/calc/transfer/CarryoverGiftBlock.tsx` | 섹션 삽입 · hint 덧붙임 · 머리 주석 | 552 |
| `components/calc/transfer/CarryoverEstimationSection.tsx` · `asset-sections/AssetSectionExpense.tsx` · `CompanionAssetCard.tsx` | hint·안내·`isNonPrimaryAsset` prop | 238 · — · — |
| `components/calc/transfer/SplitCarryoverParts.tsx` · 일반건물 토글(`CarryoverGiftBlock.tsx:397`) | §2.5 (a) 안내 줄 | 151 |
| `lib/tax-engine/transfer-tax-carryover-purchased-part-display.ts` (신규) | §7.2 view·고지 상수 | — |
| `components/calc/results/transfer/CarryoverComparisonCard.tsx` + `CarryoverPurchasedPartRows.tsx`(신규) | §7.3 | 366 |
| `CarryoverScenarioAFilingCard.tsx` · `DetailedStatementFormulaBuilders.ts` · `lib/pdf/ResultPdfTransferSections.tsx` | §7.5 | — |
| `__tests__/components/carryover-gift-assumed-debt-fields.anchor.test.tsx` 외 · `e2e/carryover-gift-debt-purchased-part.spec.ts` · `e2e/_helpers/validation-field-jump-cases-acq.ts` | §8 | — |

엔진 쪽 ⑨⑩⑫⑬⑭와 `lib/tax-engine/types/transfer-carryover.types.ts`는 엔진 설계서 소관이다.

## 12. 완료 보고 전 자가 점검 (Do 단계)
- [ ] §6 표 — ⑤ 노출 · ④ 전송 · ⑧ 필수 · ⑫ refine이 **같은 술어** (grep으로 `carryoverPurchasedPartScope` 호출 지점 전수)
- [ ] 기존 단언 반전(§0)과 범위 밖 단언 신설이 한 PR 안에 같이 있다
- [ ] 새 `data-field` 2개(`carryover.giftDebtAssumed`·`carryover.giftAssumedDebt`)가 앵커 커버리지 게이트를 통과
- [ ] `npx tsc --noEmit` 0건 · `npx vitest run __tests__/tax-engine/transfer-tax/ __tests__/calc/ __tests__/components/`
- [ ] 브라우저(Playwright) — 폼→계산→결과, Network 탭 request body에 새 키 (미수행 시 명시)
- [ ] 다크 짝·라벨 폰트 크기(`text-micro`/`text-caption` 정본)·임의 px 금지
