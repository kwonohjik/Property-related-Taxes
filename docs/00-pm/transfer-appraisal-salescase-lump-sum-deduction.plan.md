# 감정가액·매매사례가액 취득가액에서 필요경비 개산공제(§163⑥)가 0으로 계산되는 결함 — 수정 계획

- 작성: 2026-09-15
- 기준 커밋: `79af3e8b` (master) — **아래 모든 `file:line` 인용은 이 커밋 기준**이다. 머지 후 재검토 시 전수 대조할 것([[feedback_merged_plan_citations_drift]]).
- 제보: 사용자 화면 실측 — 「취득가액 = 매매사례가액 + 미등기 양도」에서 신고서 양식의 **필요경비가 `-`(0)**.

> ## ✅ 구현 완료 (2026-09-15) — 브랜치 `fix/appraisal-salescase-lump-sum-deduction`
>
> | 커밋 | 내용 |
> |---|---|
> | `0401a668` | **D-1** ④ 3지점 — 감정·매매사례에 개산공제 base 전송 |
> | `86115000` | **D-4** ⑧ 취득시 기준시가 필수화 + ⑤ `*`·hint + 게이트 leaf 분리 |
> | `c59da58b` | **D-2** ⑥ 사이드바 — 매매사례 분기 누락 + 율 leaf 통일 |
> | `db0d4539` | **D-3** 산식 `× 3%` 하드코딩 제거 |
> | `794f36c6` | E2E 2건 신설 |
>
> **최종 게이트**: `npm run check:pre-pr` — typecheck 0건 · lint 0 errors · vitest **2039파일 21,376 passed**.
> **E2E 전건**: 1179 passed + 1 skipped = `--list` **1180과 일치** ⇒ 회귀 0건.
>
> ### 착수 후 실측으로 바뀐 것
> 1. **컴패니언은 감정만 대상**이다. 매매사례는 F41(`companion-sales-case-single-only-*`)이 ⑧에서
>    이미 명시 차단하므로 ④에 도달하지 않는다 — 도달 불가 조건을 적으면 「지원된다」는 거짓 신호가 된다.
> 2. **V-1·V-2·V-4·V-5 전건 종결** — §9 표 참조. 분양권(§163⑥**4호 1%**)과 상업용건물이 대상에
>    포함됐고, 일반건물·재개발·입주권·겸용주택은 범위 밖으로 확정됐다.
> 3. **Q-2는 「표시층 재계산」 채택**(엔진 변경 0). 다만 anchor를 빌더 직접 호출이 아니라
>    `buildStatementItems`를 통해 세워 **호출부 배선까지** 잠갔다.
> 4. ⑧ 게이트 술어는 `lib/calc/transfer-lump-sum-base-gate.ts` leaf로 분리했다 —
>    `transfer-tax-validate-acquisition.ts`가 752줄(위험구간 ≥750)에 들어갔기 때문이다(→712줄).
>
> ### 뮤테이션 구별력 (7종 전건 빨간불)
> | # | 되돌린 것 | 빨간불 |
> |---|---|---|
> | MUT-1 | ⑥ `\|\| a.isSalesCaseAcquisition` | A-7·A-7b·A-8a (3건) |
> | MUT-2 | ⑥ 율 leaf → 손술어 | A-8b 분양권 1% (1건) |
> | MUT-3 | ⑦ 호출부가 `lumpRate` 미전달 | A-9a·A-9b·A-9c (3건) |
> | MUT-4 | ④ 단건 `\|\| isAppraisal \|\| isSalesCase` | **E2E 2건** + anchor 3건 |
> | MUT-5 | ④ 다건 `\|\| undefined` | A-3b (1건) |
> | MUT-6 | ⑧ 분리취득 면제 | A-11 (1건) |
> | MUT-7 | F41 차단을 primary까지 확대 | SC-2 — **픽스처 보정 후에도 원래 것을 잡는다** |

---

## 1. 제보와 실측의 차이 — 미등기는 원인이 아니다

제보는 「매매사례가액 **+ 미등기**」 조합을 지목했다. 실측하면 **미등기 여부는 이 결함과 무관**하다.
등기 상태에서도 똑같이 0이고, 오히려 **과대과세액은 등기 쪽이 더 크다**(3% vs 0.3%).

| 취득가액 산정 방식 | 등기 | 미등기 | 개산공제 |
|---|---|---|---|
| 환산취득가 (`estimated`) | 정상 | 정상 | 3,000,000 / 300,000 |
| **감정가액 (`appraisal`)** | **0** | **0** | — |
| **매매사례가액 (`salesCase`)** | **0** | **0** | — |
| 실거래가 (`actual`) | 해당 없음 | 해당 없음 | (개산공제 대상 아님) |

⇒ 사용자가 물은 **「환산취득가액·감정가액을 선택 + 미등기인 경우도 같은 버그가 있는가」의 답**:
- **환산취득가액 — 없다.** 등기·미등기 모두 정상 동작한다(0.3% 단서까지 적용).
- **감정가액 — 있다.** 매매사례가액과 **완전히 같은 결함**이며, 등기·미등기 모두 발생한다.

---

## 2. 원인 — ④ API 변환이 「환산 모드일 때만」 취득시 기준시가를 보낸다

개산공제 base인 `standardPriceAtAcquisition`을 ④가 **환산 모드에서만** 엔진에 전달한다.
감정·매매사례는 ⑤ UI에 입력칸이 **있는데도**(값이 store에 저장된다) ④에서 잘려 나가
엔진이 base 0으로 개산공제를 계산한다 → 0원.

| 층 | 파일:행 | 현행 게이트 | 판정 |
|---|---|---|---|
| ⑤ UI (주 자산 감정) | `components/calc/transfer/CompanionAcqAmountSection.tsx:162` | `isAppraisalAcquisition` | 입력칸 **있음** |
| ⑤ UI (주 자산 매매사례) | `components/calc/transfer/SalesCaseSection.tsx:124` | salesCase 섹션 상시 | 입력칸 **있음** |
| **④ 단건** | `lib/calc/transfer-tax-api.ts:331` | `isEstimated \|\| isSplitActive` | 🔴 **감정·매매사례 누락** |
| **④ 다건** | `lib/calc/multi-transfer-tax-api.ts:209` | `isEstimated ? … : undefined` | 🔴 **누락** |
| **④ 컴패니언** | `lib/calc/transfer-tax-api-companion-payload.ts:257-259` | `useEstimatedAcquisition` | 🔴 **누락** |
| ⑫ Zod | `lib/api/transfer-tax-schema-base-shape.ts:86` | `z.number().int().positive().optional()` | 통과 — 고칠 것 없음 |
| ⑭ Route | `app/api/calc/transfer/engine-input.ts:47` | 그대로 매핑 | 통과 |
| 엔진 | `lib/tax-engine/transfer-tax-helpers.ts:364-390` | 감정·매매사례 모두 개산공제 적용 | **이미 정답** |

**엔진은 이미 맞게 구현돼 있다.** 감정(`:364`)·매매사례(`:375`) 분기가 각각
`computeEstimatedDeduction(input.standardPriceAtAcquisition ?? 0, …)`을 부른다 —
막힌 것은 ④ 한 층뿐이다([[feedback_fixed_layer_vs_consumed_layer]]의 역방향 사례).

이미 전송되는 예외 경로(= 정상 동작):
- **토지·건물 분리(split) 모드** — `isSplitActive`로 전송(2026-08 P1에서 같은 결함을 분리 축에 한해 해소했다. `__tests__/calc/transfer-split-acq-stdprice-gate.test.ts`).
- **승계조합원 입주권** — `isSuccessorRight && (isEstimated || isAppraisal || isSalesCase)`(`transfer-tax-api.ts:329`)로 **세 방식 모두** 전송. ⇒ 같은 파일 **바로 윗줄이 이미 올바른 형태**인데 일반 자산 갈래만 규칙 밖에 있었다.

---

## 3. 법령 근거 (KoreanLaw MCP 본문 확인 — 2026-09-15)

**소득세법 §97②2호 본문**(mst 280405, 시행 2026-01-01):

> 그 밖의 경우의 필요경비는 **제1항제1호나목**(…) … 의 금액에 **자산별로 대통령령으로 정하는 금액**을 더한 금액

**§97①1호 나목** = 「대통령령으로 정하는 **매매사례가액, 감정가액 또는 환산취득가액**을 순차적으로 적용한 금액」
(위임 내용은 **시행령 §163⑫** → §176의2②~④).

⇒ **매매사례가액·감정가액·환산취득가액 셋 모두** §97②2호 본문의 적용 대상이고,
「자산별로 대통령령으로 정하는 금액」 = **개산공제**를 더한다. 셋을 가를 근거가 본문에 없다.

**소득세법 시행령 §163⑥**(mst 286211, 시행 2026-07-01) — 개산공제율:

| 호 | 대상 | 율 | 미등기(§104③) |
|---|---|---|---|
| 1호 | 토지 | 3/100 | **3/1000** |
| 2호 | 건물·주택 | 3/100 | **3/1000** |
| 3호 | §94①2호 나목·다목(지상권·전세권·등기된 임차권) | 7/100 | (미등기 제외 → 4호) |
| 4호 | 그 밖의 자산(입주권·분양권 등) | 1/100 | (단서 없음 — 미등기도 1%) |

**단서(swap, §97②2호 단서)는 「환산취득가액으로 하는 경우」에 한정**된다 ⇒ 감정·매매사례는 swap 대상이 아니다.
현행 엔진·일반건물 경로가 이미 그렇게 구현돼 있다(`lib/tax-engine/general-building-swap.ts:180`).

---

## 4. 세액 영향 — 실측

엔진 직접 호출 실측(양도가 2억 / 취득가(추계) 1억 / 취득시 기준시가 1억 / 2017-03-09 취득 · 2026-02-16 양도 · 2주택):

| 조건 | 현행(개산공제 0) | 정상 | **과대과세** |
|---|---|---|---|
| 감정·매매사례 **등기** | 15,180,000 | 14,514,720 | **+665,280** |
| 감정·매매사례 **미등기** | 77,000,000 | 76,769,000 | **+231,000** |

감정가액과 매매사례가액은 **완전히 동일한 수치**를 낸다(같은 코드 경로).
제보 화면(미등기)은 +231,000원 과대였고, **등기였다면 오차가 2.9배 컸다**.

---

## 5. 함께 발견한 인접 결함 2건 (D-2·D-3)

### D-2 — ⑥ 사이드바가 매매사례를 개산공제 분기에서 빠뜨린다 (`lib/stores/calc-wizard-store.ts:363-374`)

분기 조건이 `a.useEstimatedAcquisition || a.isAppraisalAcquisition`이라 **`isSalesCaseAcquisition`이 없다.**
그래서 매매사례 모드 사이드바는 개산공제가 아니라 **실경비(자본적지출+양도비) fallback**을 합계에 싣는다.

실측(자본적지출 5,000,000 · 양도비 2,000,000 입력 시):

| 모드 | 사이드바 필요경비 | 엔진(결과탭) | 법정 정답 |
|---|---|---|---|
| 환산 등기/미등기 | 3,000,000 / 300,000 | 동일 | ✅ |
| 감정 등기/미등기 | 3,000,000 / 300,000 | **0** | 사이드바가 맞고 **결과가 틀림** |
| 매매사례 등기/미등기 | **7,000,000 / 7,000,000** | **0** | **양쪽 다 틀림** |

같은 줄의 율도 손으로 적혀 있다 — `const rate = formData.isUnregistered ? 0.003 : 0.03`.
**§163⑥4호(입주권·분양권 1%)를 보지 않는다.** 엔진은 `estimatedDeductionRate()` leaf를 쓰는데
사이드바만 손 술어 사본이 남았다([[feedback_leaf_unification_leaves_one_handwritten_predicate]]).

### D-3 — 결과 산식 표시의 `× 3%` 하드코딩 (이미 활성 결함)

`components/calc/results/transfer/DetailedStatementFormulaBuilders.ts:540` · `:562` 두 곳이 율을 문자열로 박아 두었다.
**환산 + 미등기에서 지금 당장 거짓 등식이 출력된다** — 실측:

```
[산식] 미등기=true 개산공제=300000
  → "개산공제 300,000 = 취득시 기준시가 100,000,000 × 3% — 소득세법 §97① 나목·시행령 §163⑥"
```

100,000,000 × 3% = 3,000,000이지 300,000이 아니다. §163⑥4호 자산(1%)에서도 같다.
D-1을 고치면 감정·매매사례 + 미등기에서도 이 거짓 등식이 **새로 노출**되므로 함께 고친다
([[feedback_aggregate_display_rederives_engine_value]]와 같은 층위 — 표시가 율을 다시 적었다).

---

## 6. 안전망 실측 — **0건이다**

수정안을 임시 적용(④ 3곳)한 상태로 회귀를 측정했다:

```
npx tsc --noEmit                                              → 0건
npx vitest run __tests__/calc/ __tests__/lib/calc/ __tests__/tax-engine/transfer-tax/
  → Test Files 635 passed (635) / Tests 6602 passed, 3 skipped, 4 todo
```

**깨진 테스트가 하나도 없다.** 즉 「감정·매매사례에서 개산공제가 0이다」를 잠그는 안전망이 애초에 **없었다** —
그래서 결함이 여기까지 살아남았다. 수정 시 회귀 걱정보다 **anchor를 새로 만드는 것이 본 작업의 실질**이다.

> ⚠️ 위 수치는 **④만 고친 상태**의 vitest 범위 실행이다. **⑧ 필수화(D-4)까지 얹은 전건 실측은 §7.5.3**에 따로 있다
> (vitest 3건 · E2E 0건). 두 측정을 섞어 읽지 말 것 — 차단 validation은 회귀 성격이 완전히 다르다
> ([[feedback_blocking_validation_full_e2e_regression]]).

---

## 7. 수정 범위

### 7.1 D-1 — ④ 3개 지점 (세액 변경)

| # | 파일:행 | 변경 |
|---|---|---|
| ④-a | `lib/calc/transfer-tax-api.ts:331` | `isEstimated \|\| isSplitActive` → `isEstimated \|\| isSplitActive \|\| isAppraisal \|\| isSalesCase` |
| ④-b | `lib/calc/multi-transfer-tax-api.ts:209` | `isEstimated ?` → `(isEstimated \|\| isAppraisal \|\| isSalesCase) ?` **+ `\|\| undefined`**(§7.2) |
| ④-c | `lib/calc/transfer-tax-api-companion-payload.ts:258` | `asset.useEstimatedAcquisition` → `(asset.useEstimatedAcquisition \|\| asset.isAppraisalAcquisition \|\| asset.isSalesCaseAcquisition)` |

컴패니언도 ⑤에서 4개 모드를 모두 제공한다(`CompanionAcquisitionCauseSection.tsx:164-174`,
`CompanionAcqAmountSection.tsx:41` salesCase → `SalesCaseSection` 렌더 = 기준시가 칸 포함) ⇒ 같은 결함이 성립한다.

### 7.2 🔴 함정 — 다건은 미입력 시 **0을 보낸다 → Zod 400**

`multi-transfer-tax-api.ts:209`는 `parseAmount(… ?? "")`라 **미입력 시 `0`**이다(실측 확인).
⑫ 스키마가 `.positive()`이므로 **0은 거부**된다. 환산 모드는 ⑧ validate가 기준시가를 필수로 막아
(`lib/api/transfer-tax-schema-refines.ts:66`) 이 경로에 도달하지 않았을 뿐이다.

감정·매매사례는 **⑧이 막지 않으므로 그대로 도달한다** ⇒ 게이트만 넓히면
「기준시가를 비워 둔 기존 사용자」가 계산 자체를 못 하게 된다(400). 반드시 `|| undefined`를 함께 넣는다.
단건(`:336`)·컴패니언(`:259`)은 이미 `|| undefined` / truthy 가드가 있어 안전하다.

### 7.3 D-2 — ⑥ 사이드바 (`lib/stores/calc-wizard-store.ts:363-374`)

1. 분기 조건에 `a.isSalesCaseAcquisition` 추가.
2. `const rate = formData.isUnregistered ? 0.003 : 0.03` → **`estimatedDeductionRate(formData.isUnregistered, a.assetKind에 대응하는 propertyType)`** 로 교체([[single-source-engine-helper]]).
   - ⚠️ leaf의 2번째 인자는 **엔진 `propertyType`**이다. 폼의 `assetKind`를 그대로 넘기면 §163⑥4호 판정이 조용히 빗나간다 — ④가 쓰는 변환과 **같은 leaf**를 거칠 것. 변환 지점을 Do 착수 시 grep으로 확정한다(V-2).

### 7.4 D-3 — 산식 표시 (`DetailedStatementFormulaBuilders.ts:540` · `:562`)

율을 엔진 결과에서 **역산하지 말고**(등식이 스스로를 만들게 하는 함정), 엔진이 쓴 율을 그대로 표시한다.
현행 result에 율 echo가 없다면 `estimatedDeductionRate()`를 표시층에서 같은 인자로 부르되,
**표시용 재계산이 엔진 값과 어긋나지 않는지 자기일관 anchor로 잠근다**
(`개산공제 === floor(lumpBase × 표시율)`). echo 필드 추가가 더 안전하면 [[echo-field-pattern]]을 쓴다 — Q-2.

### 7.5 D-4 — ⑧ 취득시 기준시가 **필수화** (Q-1 확정)

#### 7.5.1 차단 술어의 경계 — 실측으로 확정한 도달 범위

⑧ `validateAssetAcquisition`은 자산 종류별로 **앞에서 빠져나간다**. salesCase 분기(`:369`)에 도달하는 것만 대상이다:

| 자산 종류 | salesCase 분기 도달 | 근거 |
|---|---|---|
| 주택·토지 | **도달** | — |
| **상업용건물** | **도달** | `:167·:176`은 상속·환산만 걸러낸다 ⚠️ V-5 |
| 일반건물 | 미도달 | `:181` → `transfer-tax-validate-gb.ts` 위임 |
| 재개발APT·입주권 | 미도달 | `:203` early return |
| 겸용주택 | 미도달 | `:320` → `:353` early return |

⇒ **일반건물·재개발·겸용은 이 필수화의 영향을 받지 않는다**(각자 기준시가 체계가 따로 있다).

#### 7.5.2 술어는 ⑤ 렌더 조건과 **같아야 한다** — dead-end 금지

⑤의 입력칸 게이트는 `CompanionAcqAmountSection.tsx:38`의 early return이다:

```ts
if (props.useEstimatedAcquisition || isSeparateAcq || props.hideAssetAcqAxis) return null;
```

⑧이 이보다 넓으면 **화면에 없는 칸을 채우라고 막는 상태**가 된다([[feedback_ui_gate_removes_sole_input_path]]).
같은 파일 `:640-646`이 이미 그 교훈을 주석으로 남기고 `isSeparateAcquisition(asset)`으로 총액 요구를 면제한다 — **같은 헬퍼를 쓴다.**

**필수화 조건(초안)**: `(isSalesCase || isAppraisal) && !isSeparateAcquisition(asset) && !hasPre1990 && !usesPhd`

- `isSeparateAcquisition` — 분리 축은 파트별 필수가 이미 `validateSplitDirectInputs`에서 걸린다(이중 차단 금지).
- `hasPre1990`·`usesPhd` — ④가 `standardPriceAtAcquisition`을 **undefined로 보내는** 경로다(`transfer-tax-api.ts:323`). 쓰지 않는 값을 요구하면 거짓 요구다.
- ⚠️ 상업용건물은 **V-5로 남긴다**(§9). ④가 CB에서 이 값을 실제로 소비하는지 확인 전에는 조건에 넣지 않는다.

#### 7.5.3 차단 범위 실측 — vitest **3건** · E2E **0건**

필수화를 임시 적용(⑧ 2곳)해 **전건**을 돌렸다:

```
npx tsc --noEmit        → 0건
npx vitest run          → Test Files 2 failed | 2033 passed (2036) / Tests 3 failed | 21344 passed
npx playwright test     → 1177 passed | 1 skipped  (총 1178 = --list 전건과 일치 ⇒ 실패 0)
```

> ⚠️ E2E 판정은 **`--list` 전건 수(1178)와 passed+skipped 합이 일치하는지**로 했다.
> 파이프 뒤의 `$?`는 `tail`의 것이라 신뢰할 수 없고, Playwright는 `1 failed`를 `N passed` **앞에** 찍는다
> ([[feedback_playwright_summary_last_passed_line_hides_failures]]). `test-results/`가 비어 있는 것도 함께 확인했다.

**깨진 3건은 전부 「픽스처가 기준시가를 안 넣었을 뿐」이다** — 결함을 지키던 안전망이 아니다:

| 파일 | 케이스 | 성격 |
|---|---|---|
| `__tests__/lib/calc/transfer-sales-case-wiring.test.ts:87` | ⑧ salesCase 통과 단언 | 픽스처에 `standardPriceAtAcq` 추가 |
| `__tests__/calc/companion-sales-case-single-only-review-2026-08-f41.test.ts` | SC-2 (primary만 salesCase는 통과) | 〃 |
| 〃 | SC-3 (단건 salesCase는 차단 대상 아님) | 〃 |

> 🔴 **F41의 SC-2·SC-3은 「over-block 금지」를 잠그는 anchor다.** 픽스처만 고치면 통과하지만,
> 그 뒤에도 **원래 지키던 것**(컴패니언 전용 차단이 단건까지 번지지 않음)을 여전히 잡는지
> 뮤테이션으로 재확인한다 — 새 가드가 형제 anchor의 구별력을 흡수하는 전형적 자리다
> ([[feedback_new_guard_absorbs_sibling_anchor_discriminance]]).

#### 7.5.4 함께 바꿀 것

| 층 | 변경 |
|---|---|
| ⑤ hint | `SalesCaseSection.tsx:127` · `CompanionAcqAmountSection.tsx:167` — 「미입력 시 0% 적용」 **삭제**(필수가 되므로 거짓 고지다). 율도 `3%` 하드코딩이라 D-3과 **같은 축** ⇒ 함께 정리한다 |
| ⑤ 필수 표시 | 라벨에 `*` — 기존 testid `acq-std-required-mark` 패턴 재사용(분리 축과 같은 형태) |
| ⑧ 주석 | 되돌린 과거 결정(`aa810766`)과 이유를 그 자리에 남긴다 |
| ⑫ Zod | **넣지 않는다**(권고). `.positive().optional()` 그대로 두고 차단은 ⑧ 단일 지점. ⑫에 refine을 넣으면 **기준시가 없이 저장된 기존 이력의 재계산이 400**이 된다 — 사용자가 화면에서 고칠 기회를 잃는다. ⑧은 칸을 지목해 막으므로 복구 경로가 있다 |

> ⚠️ ⑫를 넣지 않으므로 **④의 `|| undefined`(§7.2)는 여전히 필수**다. ⑧을 우회하는 stale 폼·직접 API 호출에서 `0`이 나가면 400이 된다.

---

## 8. 사용자 결정 항목 (Q)

### ✅ Q-1 — **필수 입력으로 확정** (사용자 결정 2026-09-15)

감정·매매사례 모드에서 취득시 기준시가를 **⑧ validate 필수**로 한다. 상세 설계는 **§7.5**.

- 법령: §97②2호 본문은 개산공제를 **더하도록 정한다**. 미입력을 0으로 처리하면 납세자에게 **불리한 방향으로** 조용히 과대과세된다.
- **저장소 일관성이 이 결정을 뒷받침한다**: 분리(split) 축은 **이미 감정·매매사례의 기준시가를 필수로 요구**한다 —
  `requiresAcqStdPricePart`(`lib/calc/transfer-tax-split-acq-mode.ts:367`)의 1절이 `mode !== "actual"`이면 true이고
  (`PartAcqMode`는 `actual|estimated|appraisal|salesCase`), 주석이 그 이유를 「**② 개산공제 base**(§163⑥)」라고 명시한다.
  ⑤도 그때는 `*` 필수 표시를 렌더한다(`CompanionAcqPurchaseBlock.tsx:590-596`, testid `acq-std-required-mark`).
  ⇒ **비-분리 단일 자산 경로만 그 규칙 밖에 있었다.** 필수화는 새 규칙이 아니라 **기존 규칙의 누락분 적용**이다.

**뒤집는 과거 결정**([[feedback_deliberate_design_looks_like_the_defect]] — 커밋을 읽고 확인했다):

> `// 단, 아예 검증 차단보다는 사용자 확인 유도 힌트만 제공 (추계는 기준시가 불확실 케이스가 많음)`

이 주석은 **`aa810766`(2026-06-15, RTMS 매매사례가액 자동조회 확대)** 에서 들어왔다(현 위치는 `78c53f4b` 800줄 분리로 이동된 것).
매매사례 기능을 붙이면서 내린 **부수 결정**이고, 「기준시가가 불확실하다」는 전제는 개별공시지가·주택공시가격이
공시자료라는 점과 맞지 않는다. 사용자 결정으로 뒤집되, **되돌린 사실과 이유를 그 자리에 주석으로 남긴다**.

### Q-2 (미결) — D-3(산식 표시) 수정 방식: 표시층 재계산 vs 엔진 echo 필드

권고는 **표시층에서 leaf 호출 + 자기일관 anchor**(엔진 변경 0). echo가 필요하면 별건.

### Q-3 (미결) — D-2·D-3·D-4를 D-1과 **같은 PR**에 넣을 것인가?

권고는 **같은 PR**. 넷 다 같은 조문(§163⑥)의 같은 축이다.
- D-1을 고치면 D-3의 거짓 등식이 감정·매매사례 + 미등기에서 **새로 노출**된다.
- **D-4(필수화)와 D-1은 반드시 함께 간다.** D-4만 먼저 나가면 「입력을 강제하는데 그 값이 계산에
  쓰이지 않는」 상태가 되고, D-1만 먼저 나가면 미입력 시 조용한 과대과세가 남는다.
- 실측상 전건 회귀가 vitest 3건·E2E 0건이라 한 PR로 묶어도 리뷰 부담이 크지 않다.

---

## 9. 미검증 항목 (V) — 착수 시 **실측으로 먼저 닫을 것**

| ID | 내용 | 확인 방법 |
|---|---|---|
| ~~V-1~~ | ~~GB·CB·겸용·재개발 경로~~ — **닫힘**. ⑧ 도달 여부 + ④ payload + 엔진 소비를 자산 종류별로 실측: **CB는 대상**(일반 경로를 타고 std를 소비한다), GB·재개발·입주권·겸용은 **범위 밖**(각 early return / ④가 `acqMethod="actual"` 강제). | 완료 2026-09-15 |
| ~~V-2~~ | ~~분양권~~ — **닫힘**. ⑤에서 선택 가능하고 ⑧도 통과하며 ④가 미전송이었다 ⇒ **대상**. 엔진은 §163⑥4호 **1%**를 정확히 적용한다(미등기여도 1% — 4호에 단서가 없다). A-1c·A-6b·A-8b가 잠근다. | 완료 2026-09-15 |
| ~~V-3~~ | ~~E2E 회귀~~ — **닫힘**. D-1 + D-4를 함께 얹은 상태로 전건 실행: 1177 passed / 1 skipped = `--list` 1178과 일치(§7.5.3). | 완료 2026-09-15 |
| ~~V-5~~ | ~~상업용건물~~ — **닫힘**. 추계 모드는 `useEstimatedAcquisition=false`라 STEP 0.35(CB 전용 밸류에이션)에 **진입하지 않고** 일반 경로를 탄다 ⇒ std를 개산공제로 소비한다(실측 3,000,000). **대상 확정**, 필수화도 거짓 요구가 아니다. A-6c가 잠근다. | 완료 2026-09-15 |
| ~~V-4~~ | ~~assetKind→propertyType 변환 leaf~~ — **닫힘**. 변환이 **없다**. 폼 `assetKind`가 그대로 엔진 `propertyType`이 된다(단건 `transfer-tax-api.ts:251`은 겸용·재개발 예외만, 다건 `:174`는 그대로). ⇒ 사이드바·산식 표시가 `a.assetKind`를 그대로 leaf에 넘긴다. | 완료 2026-09-15 |

> ⚠️ V-1이 「결함 있음」으로 나오면 **범위를 넓히지 말고 이 PR은 일반 자산으로 닫고 별건으로 분리**할 것.
> GB·CB는 기준시가 체계 자체가 다르다([[feedback_design_rationale_measured_on_one_case]]).

---

## 10. 테스트 계획

### 10.1 anchor (vitest) — **수정 전에 먼저 작성해 빨간불을 확인**([[pre-do-anchor-verification]])

| ID | 대상 | 단언 |
|---|---|---|
| A-1 | ④ 단건 | 감정·매매사례 각각 `standardPriceAtAcquisition === 100_000_000` 전송 |
| A-2 | ④ 단건 | 실거래가 모드는 **여전히 미전송**(`undefined`) — 넓히기 오판정 방지 |
| A-3 | ④ 다건 | 동일 + **미입력 시 `undefined`**(0이 아님 — §7.2 Zod 400 가드) |
| A-4 | ④ 컴패니언 | 동일 |
| A-5 | 엔진 e2e | 감정 등기 → 개산공제 3,000,000 · 총세액 14,514,720 |
| A-6 | 엔진 e2e | 매매사례 **미등기** → 개산공제 **300,000** · 총세액 76,769,000 (§163⑥1호 단서) |
| A-7 | ⑥ 사이드바 | 매매사례 → 개산공제(실경비 7,000,000 **아님**) |
| A-8 | ⑥ 사이드바 | 미등기 0.3% · §163⑥4호 자산 1% — 손 술어 재발 가드 |
| A-9 | D-3 산식 | 미등기 산식 문자열에 `× 3%`가 **없고** 등식이 자기일관(`개산공제 === floor(base × 표시율)`) |
| **A-10** | ⑧ D-4 | 감정·매매사례 + 기준시가 미입력 → **차단**(에러 문구가 「취득 당시 기준시가」를 지목) |
| **A-11** | ⑧ D-4 | **분리 취득**은 이 차단을 타지 않는다(파트별 검증이 담당 — 이중 차단·거짓 요구 금지) |
| **A-12** | ⑧ D-4 | `hasPre1990`·PHD 경로도 타지 않는다(④가 값을 안 보내는 경로) |
| **A-13** | ⑧ D-4 | 일반건물·재개발·겸용주택은 **영향 없음**(early return 경계 고정 — §7.5.1 표의 트립와이어) |
| **A-14** | ⑤ D-4 | 감정·매매사례에서 라벨에 필수 표시(`*`)가 렌더되고, hint에 「미입력 시 0% 적용」이 **없다** |

### 10.2 E2E

「매매사례 + 미등기」 1건, 「감정 + 등기」 1건. **결과 화면의 필요경비 금액을 단언**한다
(`toContainText("0")` 같은 substring 단언 금지 — PR#1008 무력화 전례).

### 10.3 뮤테이션 probe (수정 후)

- ④-a의 `|| isAppraisal`만 되돌린다 → A-1·A-5가 빨개져야 한다.
- ④-b의 `|| undefined`를 되돌린다 → A-3이 빨개져야 한다.
- ⑥의 `isSalesCaseAcquisition`만 되돌린다 → A-7이 빨개져야 한다.
- D-3의 율을 `3%` 문자열로 되돌린다 → A-9가 빨개져야 한다.
- ⑧ 필수화 조건에서 `!isSeparateAcquisition(asset)`을 뺀다 → **A-11이 빨개져야 한다**(거짓 요구 가드).
- **F41 SC-2·SC-3 재확인**: 픽스처에 기준시가를 넣어 초록으로 되돌린 뒤, 컴패니언 전용 차단을 단건까지
  넓히는 뮤테이션을 넣어 **그 둘이 여전히 빨개지는지** 본다. 초록이면 새 가드가 형제 anchor의
  구별력을 먹은 것이다([[feedback_new_guard_absorbs_sibling_anchor_discriminance]]).

**하나라도 초록이면 그 anchor는 구별력이 0이다** — 단언을 고치지 말고 **무엇을 관측하는지**를 다시 잡는다
([[feedback_mutation_zero_discrimination_is_not_proof]]).

---

## 11. 작업 순서

```
1. V-1·V-2·V-4·V-5 실측         → verify: probe 로그로 범위 확정
                                   (V-5가 「CB는 안 쓴다」면 ⑧ 조건에서 CB 제외)
2. A-1~A-14 anchor 작성          → verify: 수정 전 전건 빨간불 (구별력 확인)
3. D-1 ④ 3곳 수정                → verify: A-1~A-6 초록
4. D-4 ⑧ 필수화 + ⑤ `*`·hint     → verify: A-10~A-14 초록
5. 기존 픽스처 3건 보정           → verify: transfer-sales-case-wiring · F41 SC-2·SC-3 초록
6. D-2 ⑥ 사이드바 (leaf 통일)     → verify: A-7·A-8 초록
7. D-3 산식 표시                 → verify: A-9 초록
8. E2E 2건 신설 + 전건            → verify: passed+skipped == `--list` 전건 수 (파이프 `$?` 금지)
9. 뮤테이션 6종                  → verify: 전건 빨간불 (F41 구별력 보존 포함)
10. npm run check:pre-pr         → verify: typecheck + lint + test 전건
```

> 📌 **3번과 4번을 한 커밋에 묶지 말 것** — ④(값이 도달한다)와 ⑧(값을 요구한다)은 서로 다른 축이고,
> 뮤테이션 probe에서 한쪽만 되돌려야 anchor의 구별력을 잴 수 있다. 커밋은 나누되 **PR은 하나**다(Q-3).

---

## 12. 범위 밖 (건드리지 않는다)

- §97②2호 **단서(swap)** — 환산 전용이 맞다(§3 법문). 감정·매매사례에 swap을 붙이지 않는다.
- 취득가액 override(`resolveAcquisitionOverride`) — 추계를 실가로 강제하는 별도 축이고 이미 정정됐다(2026-07-29 #591 R7).
- GB·CB·겸용·재개발 기준시가 체계 — V-1 결과와 무관하게 **본 PR 범위 밖**.
- 미등기 70% 세율·기본공제 배제 — 정상 동작을 실측으로 확인했다(총세액 77,000,000 = 1억 × 70% + 지방소득세).
