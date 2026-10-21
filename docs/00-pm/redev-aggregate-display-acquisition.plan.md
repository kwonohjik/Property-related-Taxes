# 함께 양도·다건 결과에서 재개발·입주권(§166) 자산의 취득가액·필요경비 표시 수정 계획서

> 상태: **v0.2 (2026-10-21) 결정 확정** — 사용자 결정 Q-1 = **(a) §166 역산 함수로 통일**, Q-2 = **(b) 전액 비과세도 함께 고침**(설계 §4.1 — 엔진 변경 없이 역산 leaf에서 해결). 코드 변경 없음(Do 전).
> 계기: V5 PR #2325 보고의 남은 확인 필요 «환산 컴패니언에 숨은 `standardPriceAtAcq`·`standardPriceAtTransfer`가 옛 값으로 남으면 표시용 `acquisitionPrice`가 0이 아니다(세액 동일)».
> 검증 방식: throwaway probe(워크트리 `-rcsp`, 커밋 안 함)로 route → `BundledAllocationCard`·`MultiTransferTaxResultView` 렌더까지 실측했다. 인용 file:line은 base `603b4ddfe`(master) 기준.

---

## 0. 한 줄 요약

옛 값은 **원인이 아니라 증상의 한 변형**이다. 함께 양도·다건 결과에서 §166 자산의 «취득가액·필요경비» 표시값은 `resolveDisplayAcquisitionAndExpense`(`lib/tax-engine/transfer-tax-aggregate-display-echo.ts:73`)가 만드는데, 이 함수에 **§166 분기가 없다**. 그래서 옛 값이 **없어도** 단건 신고서와 다른 숫자가 나온다(환산: 취득가액 0 · 필요경비 403,000,000 / 단건 신고서 400,000,000 · 3,000,000). 옛 값이 남으면 그 숫자가 다른 숫자로 바뀔 뿐이다(200,000,000 · 203,000,000).
**세액·양도차익은 모든 경우에 같다**(표시 전용). 수정안은 단건 신고서가 이미 쓰는 §166 역산 leaf(`redevFilingTotals`)를 이 함수도 쓰게 하는 것이다.

---

## 1. 실측

시료(V5 anchor `transfer.route.companion-orig-member-acq-price` fixture와 같은 값): 주택(취득 300,000,000 · 양도 600,000,000) + 원조합원 입주권(양도 1,000,000,000 · 권리가액 900,000,000 · 납부 청산금 100,000,000 · 관리처분 시 주택가격 300,000,000 · 취득 시 주택가격 100,000,000), 함께 양도, 계약 총액 1,600,000,000, 양도일 2024-06-01.
«옛 값»은 화면에 없는 일반 칸 `standardPriceAtAcq` = 100,000,000 · `standardPriceAtTransfer` = 500,000,000.

### 1.1 숨은 칸이 정말 화면에 없는가

- 원조합원 §166 자산(입주권 · 비승계 완공APT)은 컴패니언 취득 블록에서 「취득가액 산정 방식」·「취득시/양도시 기준시가」 영역이 **통째로 렌더되지 않는다** — `components/calc/transfer/CompanionAcqPurchaseBlock.tsx:364-366` 게이트 안에 `CompanionAcqStdPriceSection`(`:472`)이 있다. 값이 남는 경로는 자산 종류를 바꾸기 전 입력뿐이다.
- 단, **안분 모드(`bundledSaleMode = "apportioned"`)의 양도시 기준시가는 화면에 있다** — `AssetSectionTransfer.tsx:127`의 `CompanionSaleModeBlock`(안분 키)이며 ⑧이 필수로 요구한다(`transfer-tax-validate-asset.ts:329`, 비우면 「자산 2: 양도시 기준시가를 입력하세요.」 실측). 안분 모드에서 옛 값이 될 수 있는 것은 **취득시 기준시가 하나**다.

### 1.2 route 결과 — 세액은 같고 표시값만 바뀐다

| # | 경우 | 상태 | 총세액 | §166 자산 표시 취득가액 | 비고 |
|---|---|---|---|---|---|
| C0 | 실가 거래 모드 · 컴패니언 · 숨은 칸 빈 값 | 200 | 304,646,760 | 0 | 기준 |
| C1 | C0 + 숨은 칸 둘 다 옛 값 | 200 | 304,646,760 | **200,000,000** | = 1,000,000,000 × 1억/5억 |
| C2 | C0 + 취득시만 | 200 | 304,646,760 | 0 | |
| C3 | C0 + 양도시만 | 200 | 304,646,760 | 0 | |
| C4 | 완공APT · 둘 다 옛 값 (주택 수 2) | 200 | 266,032,800 | **200,000,000** | C4b 빈 값 266,032,800 · 0 |
| R0/R1 | 입주권이 **주 자산** · 빈 값 / 둘 다 옛 값 | 200 | 304,646,760 | 0 / **200,000,000** | 주 자산도 같다 |
| A3 | 안분 모드 · 양도시 500,000,000(보이는 칸) | 200 | 295,406,760 | 0 | 기준 |
| A1 | A3 + 취득시 옛 값 | 200 | 295,406,760 | **177,777,777** | = 888,888,889 × 1억/5억 |
| AR1 | 안분 모드 · 주 자산 · 취득시 옛 값 | 200 | 295,406,760 | **177,777,777** | |

### 1.3 화면 — 어디에 나오는가 (`BundledAllocationCard` 렌더)

`data-print-id` 섹션별로 값의 출현을 셌다.

| 섹션 | C0(빈 값) | C1(옛 값) |
|---|---|---|
| `allocation` 양도가액 안분 | — | — |
| `form-table` 신고서 양식 표 | 취득가액 **0** · 필요경비 **403,000,000** | 취득가액 **200,000,000** · 필요경비 **203,000,000** |
| `detailed-statement` 계산명세서 | 「자산 2 자산별 취득가액 = 0」 · 「1,000,000,000 − 0 − 403,000,000 = 597,000,000」 | 「= 200,000,000」 · 「1,000,000,000 − 200,000,000 − 203,000,000 = 597,000,000」 |

`MultiTransferTaxResultView`(다건 합산 화면 컴포넌트)에 같은 집계를 넣어도 `form-table`·`summary`·`detailed-statement`에 403,000,000 / 200,000,000이 나온다. `per-property`(건별 상세)에는 나오지 않는다.
⚠️ 다건 «합산 계산» route 자체로 낸 집계는 재지 않았다(같은 컴포넌트·같은 echo 함수라는 것까지만 확인) — **확인 필요**(Do 1단계에서 실측).

**검산 항등식(양도가액 − 취득가액 − 필요경비 = 양도차익)은 두 경우 모두 성립**한다. 필요경비를 취득가액에서 역산하기 때문이다 — 자기검산이 오류를 가린다(같은 함수 `:88-89` 주석이 이미 경고한 현상).

### 1.4 정본은 무엇인가 — 단건 신고서와의 비교

단건 신고서는 §166 자산의 합계 취득가액을 **역산**한다 — `FilingFormTableHelpers.ts:416-427` → `redevFilingTotals`(`components/calc/results/transfer/redev-acquisition-inverse.ts:93`): 취득가액 = 양도가액 − 분기 필요경비 합 − 분기 전체 양도차익 합(memory `feedback_redev_filing_form_acquisition_inverse` — 사용자 지시 2026-05-15). 사이드바도 같은 leaf를 쓴다(C1-04).

| 경우 | 함께 양도 결과(현재) | `redevFilingTotals`(단건 신고서 규칙) |
|---|---|---|
| 환산 · 실가 거래 모드 (C0) | 취득 0 · 경비 403,000,000 | 취득 **400,000,000** · 경비 **3,000,000** · 차익 597,000,000 |
| 환산 · 옛 값 (C1) | 취득 200,000,000 · 경비 203,000,000 | 위와 같음(옛 값 무관) |
| 환산 · 안분 모드 (A1) | 취득 177,777,777 · 경비 225,222,223 | 취득 **400,000,000** · 경비 3,000,000 · 차익 485,888,889 |
| **실가** · 컴패니언/주 자산 (OC-1 시료) | 취득 400,000,000 · 경비 100,000,000 | 취득 **500,000,000** · 경비 **0** · 차익 500,000,000 |

마지막 줄이 중요하다 — **옛 값과 무관한 실가 모드에서도** 같은 자산을 단건 신고서는 «취득 500,000,000(종전 취득가 400,000,000 + 납부 청산금 100,000,000) · 경비 0»으로, 함께 양도 결과는 «취득 400,000,000 · 경비 100,000,000»으로 보인다. 청산금을 어느 칸에 두느냐가 경로마다 다르다.

---

## 2. 원인

`resolveDisplayAcquisitionAndExpense`(`transfer-tax-aggregate-display-echo.ts:73-164`)의 취득가액 선택(`:121-135`)은 이월과세 → split → swap → «`usedEstimatedAcquisition`이면 `estimatedBase` ?? 숨은 기준시가로 재환산, 아니면 `singleInput.acquisitionPrice`» 순이다. §166 분기가 없어서:

1. **환산**: §166 결과는 `usedEstimatedAcquisition: true`만 싣고 `estimatedBase`를 싣지 않는다 → `:133` 재환산식이 **일반 칸** `standardPriceAtAcquisition`/`standardPriceAtTransfer`로 계산한다. 빈 값이면 0, 옛 값이면 그 비율의 값(주 자산 R1 · 안분 AR1).
2. **컴패니언 실가 거래 모드**: `bundled-apportionment.ts:199-215`가 «매매 + 환산 + 두 기준시가 존재»면 사후 환산값을 만들어 `route.ts:462` → `bundled-split-helpers.ts:365`가 엔진 입력 `acquisitionPrice`로 넣는다. §166 엔진은 이 값을 쓰지 않으므로 세액은 같지만, 표시 echo는 `singleInput.acquisitionPrice`를 그대로 읽는다(C1 · C4).
3. **필요경비**는 `:146`에서 «양도가액 − 위 취득가액 − 양도차익»으로 역산된다 → 취득가액이 틀린 만큼 필요경비가 반대로 틀린다.

옛 값을 막아도(②의 사후 환산 차단 등) 1번 경로의 «취득 0 · 경비 403,000,000»과 실가 모드의 청산금 위치 차이는 남는다.

---

## 3. 수정안

### 안 (a) — 표시 echo에 §166 분기를 둔다 (권장)

`resolveDisplayAcquisitionAndExpense`에서 `r.result.redevelopmentDetail`이 있으면 `redevFilingTotals(detail, transferPrice)`의 `acquisition`·`expenses`를 쓴다 — 단건 신고서·계산명세서·사이드바와 **같은 leaf · 같은 인자**.

- **층 위반 해소**: 엔진(`lib/tax-engine/`)은 `components/`를 import할 수 없다. `redev-acquisition-inverse.ts`는 엔진 타입만 import하는 무의존 leaf라 **`lib/tax-engine/redev-acquisition-inverse.ts`로 옮기고**, 기존 경로에는 re-export만 남겨 기존 import 5곳(신고서·명세서 2·비과세 차익·사이드바)을 건드리지 않는다.
- **우선순위**: 이월과세 채택(`adoptedCarryover`)·split보다 아래, swap·일반 분기보다 위. §166과 split·이월과세가 동시에 걸리는지는 Do 1단계에서 확인한다(걸리지 않으면 순서 무관).
- **청산금 수령 동시신고**: `redevFilingTotals`는 양도가액에 `settlementSeparateConsideration`을 더한다. echo의 `transferPrice`도 같은 값으로 맞춰야 항등식이 깨지지 않는다 — Do에서 실측 후 반영.
- **기대값**: C0·C1·C2·C3 모두 «취득 400,000,000 · 경비 3,000,000», A1·A3 «400,000,000 · 3,000,000», 실가 OC-1 «500,000,000 · 0». 세액 불변.
- **장점**: 옛 값 문제와 «취득 0 · 경비 403,000,000» 문제, 실가 모드의 청산금 위치 차이가 한 번에 정리되고, 이 echo를 읽는 소비처(합산 요약 카드·합산 신고서·명세서·건별 신고서·PDF — `:155-156` 주석)가 함께 맞는다.

### 안 (b) — 옛 값만 막는다

§166 자산이면 `:133` 재환산과 `bundled-apportionment.ts:199` 사후 환산을 건너뛴다. C1·A1·R1은 C0과 같아지지만, **표시는 «취득 0 · 경비 403,000,000»으로 남고** 실가 모드의 청산금 위치 차이도 그대로다.

### 채택하지 않는 안 — ④에서 숨은 기준시가를 보내지 않기

V5처럼 «화면에 없는 칸은 보내지 않는다»로 막는 방식이다. 그런데 §166 엔진은 일반 칸 `standardPriceAtAcquisition`·`standardPriceAtTransfer`를 **감면 판정**에 넘긴다 — `transfer-tax-redevelopment.ts:430-431`(감면 계산) · `transfer-tax-redevelopment-steps.ts:365-366`(§97 장기임대 장특 특례). 감면 입력 화면이 이 칸을 쓰는지 아직 모르므로, 막으면 감면 계산이 바뀔 수 있다. 이 계획서 범위에서 제외하고 §6 확인 필요로 남긴다.

---

## 4. 사용자 결정

**Q-1. 수정 범위** — (a) 표시 echo에 §166 분기 **(권장)** / (b) 옛 값만 차단.
(a)는 옛 값이 없을 때의 표시도 바뀐다(«0 · 403,000,000» → «400,000,000 · 3,000,000», 실가 «400,000,000 · 100,000,000» → «500,000,000 · 0»). 단건 신고서와 같은 숫자가 되는 방향이다.

**Q-2. 전액 비과세 §166 자산** — (a) 이번 범위에서 제외 **(권장)** / (b) 함께 고친다.
12억 이하 전액 비과세면 엔진이 분기별 양도차익을 0으로 돌려준다(아래 실측). 그 상태에서 역산하면 «취득가액 = 양도가액 − 경비»가 되어, **단건 신고서도 이미** 취득가액을 1,000,000,000(실가)·997,000,000(환산)으로 보인다. 함께 양도에 (a)를 적용하면 이 값이 그대로 옮아온다. 그래서 (a)를 택하면 비과세 자산은 echo의 현행 비과세 분기(`:144-145`)를 유지하고, 단건까지 포함한 비과세 표시는 별건으로 다룬다. (b)는 엔진이 비과세에서도 분기별 전체 차익을 내도록 바꿔야 해 범위가 커진다.

| 비과세 실측 | `isExempt` | 분기 차익(인가전·인가후·청산금) | `redevFilingTotals` 취득가액 |
|---|---|---|---|
| 단건 · 실가 | true | 0 · 0 · 0 | 1,000,000,000 |
| 단건 · 환산 | true | 0 · 0 · 0 (경비 3,000,000) | 997,000,000 |
| 축 B 50/50 · 실가 · 카드마다 | true | 0 | 500,000,000 (현재 echo: 200,000,000 · 경비 300,000,000) |

### 4.1 결정 (2026-10-21) — Q-1 = (a), Q-2 = (b)

**Q-2 (b)는 엔진을 바꾸지 않아도 된다.** 비과세 마스킹은 분기 차익을 0으로 만들기 **전에** 원래 값을 `gainAfterAllocation`에 보존한다 — `applyOneRightExemption`(`transfer-tax-redevelopment-transforms.ts:329~`, 마스킹 `:394-398`) · `applyAptOneHouseExemption`(`:504~`, `:515-519`). 실측(단건 · 원조합원 입주권 · 양도 1,000,000,000):

| 경우 | `isExempt` | 인가전 분기 `gain` · `gainAfterAllocation` · 경비 | 과세 시(다주택) 같은 분기 `gain` |
|---|---|---|---|
| 실가 | true | 0 · **500,000,000** · 0 | 500,000,000 |
| 환산 | true | 0 · **597,000,000** · 3,000,000 | 597,000,000 |

보존값이 과세 시 차익과 정확히 같다. ⇒ 역산 leaf `redevBranchTotals`의 전체 차익 소스(`grossOf`, `redev-acquisition-inverse.ts:63`)를 `gainBeforeAllocation ?? gain`에서 **`gainBeforeAllocation ?? gainAfterAllocation ?? gain`**으로 바꾸면, 비과세 자산의 역산 취득가액이 실가 **500,000,000**(종전 1,000,000,000) · 환산 **400,000,000**(종전 997,000,000)으로 과세 시와 같아진다.

- 같은 우선순위의 선례가 이미 있다 — 계산명세서 `DetailedStatementRedevelopmentBuilders.ts:401` `detail.gainBeforeAllocation ?? detail.gainAfterAllocation`.
- 12억 초과 안분 + 청산금 비과세(사례 47)는 `gainBeforeAllocation`이 있어 그것이 먼저 잡힌다 — 기존 값 불변(Do 1단계에서 실측 확인).
- **leaf 하나를 바꾸므로 단건 화면도 함께 바뀐다** — 소비처: 단건 신고서 합계 열(`FilingFormTableHelpers.ts:425`) · 계산명세서(`DetailedStatementRedevOverrides.ts`) · 사이드바(`transfer-per-asset-summary.ts`) · 「전체 양도차익」 표시(`exempt-gross-gain.ts:38` `effectiveGrossGain`). 비과세 §166 자산의 «전체 양도차익»이 0에서 실제 차익(500,000,000 등)으로 바뀐다 — 이것이 Q-2 (b)의 의도다.
- ⚠️ 단건 신고서에서 「전체 양도차익」 행을 채우는 `fillRedev*BranchData`(`FilingFormTableRedevRows.ts`)가 같은 소스를 읽는지 Do 1단계에서 확인한다. 다르면 같은 표 안에서 «양도가액 − 취득가액 − 필요경비 = 전체 양도차익»이 깨진다.

---

## 5. Do 계획 (Q-1 = a, Q-2 = b)

1. **사전 실측** → verify: §1.2 표 외에 «다건 합산 계산» route · 청산금 수령 동시신고(사례 46) · 승계조합원 완공APT(사례 48) · 토지 출자(사례 37) · 축 B 과세 지분 · §166 + split/이월과세 동시 여부를 probe로 재고 표에 추가한다.
2. **leaf 이동** `components/.../redev-acquisition-inverse.ts` → `lib/tax-engine/redev-acquisition-inverse.ts`(기존 경로 re-export) → verify: tsc 0 · 기존 import 5곳 무수정 · 관련 테스트 통과.
3. **leaf 전체 차익 소스**(Q-2 b) `redevBranchTotals`의 `grossOf` = `gainBeforeAllocation ?? gainAfterAllocation ?? gain` → verify: §4.1 단건 비과세 2건이 500,000,000 · 400,000,000, 과세 단건·사례 47 값 불변, 단건 신고서 표 항등식 유지.
4. **echo §166 분기** `transfer-tax-aggregate-display-echo.ts` — 비과세 포함(현행 비과세 분기 `:144-145`보다 앞), 청산금 수령이면 표시 양도가액도 같은 leaf 값 → verify: 아래 anchor.
5. **anchor** `__tests__/tax-engine/...` 또는 `__tests__/api/` 신규:
   - RA-1 C0·C1·C2·C3·C4 — 표시 취득가액·필요경비가 «400,000,000 · 3,000,000»(완공APT는 실측값)이고 **옛 값과 무관**, 세액 304,646,760 · 266,032,800 불변.
   - RA-2 주 자산(R0·R1)도 같다.
   - RA-3 안분 모드(A1·A3) 같다.
   - RA-4 실가 OC-1 «500,000,000 · 0» = 단건 신고서 합계 열과 같다(같은 자산을 단건으로 계산해 `buildRows` 합계 열과 대조).
   - RA-5 비과세(Q-2 b): 단건 실가·환산의 역산 취득가액·전체 양도차익이 같은 자산을 다주택(과세)으로 계산한 값과 같다(500,000,000 · 500,000,000 / 400,000,000 · 597,000,000) — 단건 신고서 합계 열과 함께 양도 echo 양쪽.
   - RA-6 렌더: `BundledAllocationCard`의 `form-table`·`detailed-statement`에 옛 값 유래 숫자(200,000,000)가 없다.
   - RA-7 사례 47(12억 초과 안분 + 청산금 비과세)·과세 단건의 단건 신고서 값 불변.
   - 뮤테이션: echo §166 분기를 지우면 RA-1·RA-4 실패, `grossOf`의 `gainAfterAllocation`을 지우면 RA-5 실패, 순서를 `gainAfterAllocation ?? gainBeforeAllocation`으로 바꾸면 RA-7 실패.
6. **기존 단언 갱신** — `transfer.route.companion-orig-member-acq-price.anchor.test.ts` OC-1(`acquisitionPrice` 400,000,000 → 500,000,000 예상) · OC-3 · OC-4(축 B 비과세 — 카드마다 200,000,000에서 역산값으로, 실측 후 확정). 갱신 전 그 단언이 지키던 다른 축(§166 칸에서 읽는다 · 옛 `fixedAcquisitionPrice` 무시)은 `body.companionAssets[0].fixedAcquisitionPrice` 단언으로 남아 있는지 확인한다(memory `feedback_shared_assertion_reversal_erases_sibling_net`). 단건 비과세 §166의 신고서·사이드바·전체 양도차익을 고정한 테스트도 바뀐다 — 전체 실행으로 찾아 각 단언이 무엇을 지키던 것인지 확인한 뒤 갱신한다.
7. pre-push 전체 테스트(엔진 파일 변경) → PR → CI 전건 SUCCESS + head 일치 → 머지.

14지점: 엔진 input·Zod·④ 변경 없음(표시 echo만). ⑥ 사이드바는 이미 같은 leaf를 쓴다(C1-04). ⑦ 결과 카드가 이 echo의 소비처다.

---

## 6. 범위 밖 · 확인 필요

- **§166 엔진이 감면 판정에 일반 기준시가 칸을 쓴다**(`transfer-tax-redevelopment.ts:430-431` · `-steps.ts:365-366`) — 원조합원 §166 자산에서 그 칸이 화면 어디에서 입력되는지, 숨은 옛 값이 감면 세액을 바꾸는지 **확인 필요**(이번 실측 시료는 감면 없음).
- **컴패니언 사후 환산이 §166 자산에도 켜진다**(`bundled-apportionment.ts:199-215`) — 엔진 입력 `acquisitionPrice`에 옛 값 유래 값이 들어간다. 세액 영향은 이번 시료에서 0이었다. 안 (a) 이후 표시에는 닿지 않는다.
- ~~전액 비과세 §166의 단건 신고서 취득가액~~ — Q-2 (b)로 이번 범위에 포함(§4.1).
