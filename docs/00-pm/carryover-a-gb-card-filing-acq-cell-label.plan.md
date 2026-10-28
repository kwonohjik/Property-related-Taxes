# 이월과세(§97의2) 시나리오 A — 일반건물 카드 신고서·명세서 「취득가액」 칸에 본인 양도비 몫이 섞여 표시되는 현상

- 작성: 2026-10-28 · 브랜치 `docs/carryover-a-filing-acq-label-plan`(origin/master f29e24a08 기반) · 제품 코드 무변경(계획서만 · throwaway probe는 제거함)
- 출처: `gb-estimated-carryover-scenario-a-capex.plan.md` §11-5 「Q-4 합산의 부작용(별건 후보)」 — 그때는 「라벨만 정밀하지 않고 세액·항등식은 정확」으로 범위 밖 처리했다. 이번에 실측하니 **라벨 외에 명세서 산식 문구와 값이 어긋나는 것도 같은 원인**이다(§2.3).
- 결정: ✅ 2026-10-28 확정 — Q-1 O1(본인 자본적지출만 이동) · Q-2 산식 문구 포함 (사용자 「권고안으로 진행해」).
- 판정: **표시 결함(세액 무관)**. 법문 해석 문제가 아니다(§4) — 질의·해석례 불요.
- 검증 방식: 모든 수치는 mock 세율(`makeMockRates()`) 로 `POST /api/calc/transfer` 와 표시 leaf(`capExInAcquisitionColumnOfProperty`)·산식 빌더(`buildGbAcquisitionFormula`)를 직접 호출한 probe 실측. 인용 file:line은 이 워크트리 실파일.

---

## 1. 요약

| 항목 | 결론 |
|---|---|
| 현상 | 이월과세 A 채택 일반건물 카드에서 **본인 양도비 몫이 「취득가액」 칸에 얹힌다.** 양도비만 입력해도 취득가액 칸이 증여자 취득가액보다 커진다(50,000,000 → 54,122,020). |
| 또 하나 | 같은 카드의 **명세서 취득가액 산식**은 「증여자 취득 당시 취득가액 50,000,000」만 적는데 **값은 54,122,020**이다(§2.3). 자본적지출만 입력해도 어긋난다(52,473,212). |
| 원인 | `#2676`이 일반건물 카드에 본인 직접귀속 나목을 `capitalExpenditure` **한 칸에 합산**해 싣는다(`general-building-route-cards.ts:324`, 결정 Q-4 합산). 표시 leaf는 A 채택 시 `capitalExpenditureForDisplay`(= 그 값)를 통째로 취득가액 칸으로 옮긴다(`exempt-gross-gain.ts:81-86`). 단건 경로는 자본적지출만 그 칸에 실리므로 정상이다. |
| 세액 | **불변.** 필요경비 합계(= 취득가액 칸 이동분 + 필요경비 칸)와 항등식은 그대로다. 표시 분류와 산식 문구만 틀린다. |
| 범위 | 이월과세 A 채택 **일반건물 카드**(환산·실가·증축·지분·묶음·파트). 단건(주택·토지·건물 단독)·함께양도 접기(`expenses`)·legacy `directExpenses` 는 정상 — §3. |
| 권고 | **O1** — 카드가 본인 자본적지출과 양도비를 **나눠 싣는다**(`capitalExpenditure` · `transferExpense`). 표시 leaf·엔진 세액식은 손대지 않는다. 명세서 산식 문구는 단건과 같이 「+ 자본적지출 N」을 덧붙인다. |

---

## 2. 재현 (probe 실측)

### 2.1 픽스처
`gb-carryover-a-own-expense` anchor 와 같은 환산 경로: 양도 2024-10-11 · 양도가액 330,000,000 · 토지 57㎡ · 증여 등기 2020-03-17 · 증여자 취득 1995-06-15 취득가액 50,000,000 · 증여세 상당액 50,000,000 · 증여 당시 평가액 200,000,000. 토지만 이월과세, 건물은 일반 환산 카드. 표의 「취득가액 칸」 = `acquisitionPrice + capExInAcquisitionColumnOfProperty(p)`, 「필요경비 칸」 = `necessaryExpense − 이동분`(신고서·명세서가 쓰는 식, `FilingFormTableHelpers.ts:522-525`·`DetailedStatementHelpers.ts:275`).

### 2.2 토지 카드 (A 채택)

| 입력 (자본적지출 / 양도비) | 카드 `capitalExpenditureForDisplay` | **취득가액 칸** | 필요경비 칸 | 비고 |
|---|---|---|---|---|
| 0 / 5,000,000 | 4,122,020 | **54,122,020** | 50,000,000 | 양도비 **만** 입력했는데 취득가액이 늘었다 |
| 3,000,000 / 0 | 2,473,212 | 52,473,212 | 50,000,000 | 자본적지출 몫 → 이 칸이 맞다 (관행) |
| 3,000,000 / 5,000,000 | 6,595,232 | **56,595,232** | 50,000,000 | 6,595,232 = 2,473,212(자본적지출) + 4,122,020(양도비) |
| 150,000,000 / 5,000,000 | 127,782,635 | **177,782,635** | 50,000,000 | |
| 증여자 자본적지출 20,000,000 / 본인 0 | 0 | 50,000,000 | 70,000,000 | 증여자 지출은 필요경비 칸에 머문다(현행) |

세 행의 합 6,595,232 = 2,473,212 + 4,122,020 로 **두 지출의 카드 몫이 가산적**이다(같은 배분 규칙 — `general-building-swap.ts:171` `allocateWithinGroup`).

### 2.3 명세서 취득가액 산식 vs 값 (`buildGbAcquisitionFormula`)

| 입력 | 값(취득가액 칸) | 산식 문구 |
|---|---|---|
| 0 / 5,000,000 | 54,122,020 | 「증여자 취득 당시 취득가액 50,000,000 — 이월과세 §97의2① (증여자 취득가액 승계)」 |
| 3,000,000 / 0 | 52,473,212 | 같은 문구 |
| 3,000,000 / 5,000,000 | 56,595,232 | 같은 문구 |

이월과세 A 분기(`DetailedStatementGbFormulas.ts:276-286`)가 이동분을 문구에 싣지 않고 곧바로 return 한다. 단건 경로는 같은 자리에 `capExStr`(「+ 자본적지출 N」)을 붙인다(`DetailedStatementFormulaBuilders.ts:461·516`). 즉 **자본적지출만 입력해도 값≠산식**이고, 양도비는 거기에 더해 분류까지 틀린다. 이 어긋남은 `#2676`이 카드에 값을 싣기 전에는 이동분이 0이라 드러나지 않았다.

### 2.4 정상 경로 대조 (단건 · 접기)

| 경로 | 입력 | `capitalExpenditureForDisplay` | 결과 |
|---|---|---|---|
| 단건 주택 A (선언 채널) | 자본적지출 10M · 양도비 4M | 10,000,000 | 취득가액 칸 +10M, 양도비 4M 은 필요경비 칸 ✓ (`capex-actual-mode-display.anchor.test.ts` A0-5 가 「자본적지출만 취득가액 칸」을 고정) |
| 단건 주택 A | 양도비 4M 만 | 0 | 필요경비 칸 34,000,000 (= 증여세 30M + 양도비 4M) ✓ |
| 단건 주택 A (legacy `expenses` 10M · PR-1 접기) | | 0 | 필요경비 칸 40,000,000 ✓ |
| 함께양도 컴패니언 (공통 양도비 접기) | FOLD-1 | 0 | 필요경비 칸 35,714,286 ✓ |

→ **서식 관행은 이미 정해져 있다**: 이월과세 A 의 「취득가액 칸 이동분」 = **본인 자본적지출만**, 양도비는 필요경비 칸. 일반건물 카드만 합산값을 실어 이 관행을 벗어났다.

---

## 3. 원인 · 데이터 흐름

1. 환산 경로: `resolveGeneralBuildingSwap`(`general-building-swap.ts:216-226`)이 단서를 강제한 2차 실행으로 카드별 `ownDirect`(자본적지출 + 양도비를 **합한** 금액의 배분)를 만든다 → `buildProperties`가 이월과세 카드의 `capitalExpenditure`로 싣는다(`general-building-route-cards.ts:318-324`).
2. 실가 경로: 카드 `expenses`(= `apportionExpenses`의 `capexLand + transferLand`, `general-building-route-actual.ts:189-203`)를 같은 자리에 싣는다. 이 함수 안에서는 자본적지출 몫(취득시 기준시가 비례)과 양도비 몫(적용 자산가액 비례)이 **이미 따로 계산된 뒤 합쳐진다.**
3. 엔진: `capitalExpenditure`는 A 입력 `capitalExpenditure = effectiveCapex + ownDirect`(`transfer-tax-carryover.ts:316`)로 들어가고, 결과의 `capitalExpenditureForDisplay` = `min(singleInput.capitalExpenditure, 필요경비)`(`transfer-tax-aggregate-once.ts:519`).
4. 표시: `capExInAcquisitionColumn`은 A 채택이면 `capitalExpenditureForDisplay`를 취득가액 칸으로 옮긴다. 이름은 자본적지출인데 카드에는 합산값이 들어 있다.

`transferExpense`는 B 입력(`buildInputB`, `transfer-tax-carryover-inputs.ts:61-68`)도 `...rawInput`으로 그대로 흘리고 A 입력도 `...rawInput`이라, 두 칸으로 나눠 실어도 필요경비 **합계**는 같다(`calcNecessaryExpense`가 선언 채널에서 자본적지출 + 양도비를 더한다 — `gb-estimated-carryover-scenario-a-capex.plan.md` §2.6).

---

## 4. 법령·서식 근거 (해석 쟁점 없음)

- 「소득세법」 제97조제1항은 필요경비를 1호 취득가액 · **2호 자본적지출액** · **3호 양도비**로 가른다. 이월과세 A 는 제97조의2제1항 본문 「필요경비는 제97조제2항에 따르되」이므로 본인 자본적지출(2호)·양도비(3호)는 합계에 들어간다 — **세액은 이미 맞다**(#2675·#2676).
- 어느 **칸**에 적느냐는 법문이 아니라 서식 표시 관행이다: 실가 모드 자본적지출은 필요경비 칸(별지 제84호서식 부표3 ⑥ → ⑬, `exempt-gross-gain.ts:65` 주석), 이월과세 A·§97②2호 단서는 「종전 표시」로 자본적지출을 취득가액 칸에 얹는 예외(`exempt-gross-gain.ts:70-76`). 예외의 내용은 **자본적지출**이고 양도비가 아니다(A0-5 · §2.4).
- 따라서 이 건은 법문이 명확한 사안에 해석례를 찾을 일이 아니다 — 필요한 것은 관행(자본적지출만 이동)에 일반건물 카드를 맞추는 일이다.

---

## 5. 수정안

| 안 | 내용 | 평가 |
|---|---|---|
| **O1 (권고)** | 이월과세 카드가 본인 자본적지출은 `capitalExpenditure`, 양도비는 `transferExpense`로 **나눠 싣는다.** 환산: `swap`에 자본적지출 전용·양도비 전용 몫 맵을 만든다. 실가: `apportionExpenses`가 이미 따로 구한 두 몫을 그대로 낸다. | 표시 leaf·산식 빌더·엔진 세액식 **무수정**(산식 문구 한 줄 제외). 나눠 실어도 필요경비 합계는 같다 → 세액 불변. 변경은 route 카드 계층에 모인다. 이월과세 카드에만 적용(OFF 카드 불변). |
| O2 | 합산값은 그대로 두고 카드에 「양도비 몫」 echo 를 추가해 표시 leaf 가 빼도록 한다 | 카드별 양도비 몫을 구해야 하는 일은 O1 과 같다(환산은 `ownDirect` 재계산, 실가는 `apportionExpenses` 분해). 추가 필드·echo 14지점 부담만 늘어 O1 보다 이득이 없다. |
| O3 | 일반건물 이월과세 카드는 이동분을 0으로(자본적지출도 필요경비 칸) | route·엔진 무변경으로 작지만, 같은 입력의 단건 경로(자본적지출 → 취득가액 칸)와 **칸이 갈린다.** 이월과세 A 의 「종전 표시」 관행(A0-5)을 일반건물만 깨는 결과. |
| O4 | 이월과세 A 예외 자체를 폐지(모든 경로 자본적지출을 필요경비 칸) | 일관되지만 단건 A 화면이 바뀌고 A0-5·`aggregate-carryover-adopted-acquisition-price` 등 anchor 다수를 재작성한다. 이번 건의 문제 범위를 넘는다. |

### 5.1 O1 상세 (권고)

1. **환산 경로** — `resolveGeneralBuildingSwap`의 `own` 2차 실행을 한 번 더 한다: `(capex, 0)` → `ownCapex`(합산 실행은 기존 `ownDirect`). 양도비 몫 = `ownDirect − ownCapex`(잔액 흡수). 이렇게 하면 합 불변식 `ownCapex + ownTransfer = ownDirect` 가 **정의상** 성립하고, 양도비 전용 실행을 따로 돌리지 않으므로 그 반올림 차이로 세액이 1원 움직일 일이 없다(합산 몫이 기존과 같다).
2. **실가 경로** — `apportionExpenses`(`general-building-route-actual.ts:189`)와 파트 직접귀속 분기(`resolvePartExpenses` :218-240)가 `capexLand·transferLand`를 따로 구하고 있다. 이를 카드 `expenses`뿐 아니라 `capex`·`transfer` 두 필드로 낸다. 사업용·비사업용 분할(`apportionLandByBusinessArea` :399-402)도 두 성분에 같은 규칙을 적용한다. **legacy `directExpenses`(두 성질이 섞인 한 덩어리)는 나눌 근거가 없으므로 분리하지 않는다** — 이 경우는 현행처럼 필요경비 칸 전액이다(접기 경로와 같은 취급).
3. **카드** — `buildProperties`는 이월과세 카드에 `capitalExpenditure`(자본적지출 몫, 0 명시) + `transferExpense`(양도비 몫)를 싣는다. 분리 불가(legacy `directExpenses`)면 `capitalExpenditure`를 0 으로 명시하고 합산값을 `transferExpense`에 둔다 — 합계는 같고 이동분이 0 이라 전액이 필요경비 칸에 남는다(접기 경로와 같은 표시). 이 선택은 V-3 에서 확인한다.
4. **명세서 산식** — `DetailedStatementGbFormulas.ts:276-286` 이월과세 A 분기에 `capExShift`(이동분)이 있으면 「+ 자본적지출 N」을 단건 분기(`DetailedStatementFormulaBuilders.ts:516`)와 같은 형태로 덧붙인다. 필요경비 칸 산식(`buildGbExpenseFormula`)은 이월과세 A 분기가 없어 어떤 문구가 나오는지 **확인 필요**(V-2).
5. **불변식(anchor 로 고정)** — ① 결정세액 전후 동일 ② `necessaryExpense` 동일 ③ 취득가액 칸 이동분 = 본인 **자본적지출** 몫만 ④ 양도가액 − 취득가액 칸 − 필요경비 칸 = 양도차익 ⑤ `ownCapex + ownTransfer = ownDirect`.

### 5.2 동기화 지점 (CLAUDE.md 14지점)
입력·폼 필드는 **추가하지 않는다**(사용자 입력은 이미 자본적지출·양도비로 분리되어 있다). 바뀌는 것은 route 가 엔진 item 에 싣는 값뿐이다 → ①~⑧ 해당 없음. ⑫ Zod 입력 객체·⑬ body spread·⑭ Route 매핑도 해당 없음(카드 item 은 내부 구성). ⑦ 결과 표시는 명세서 산식 문구 1곳. `transferExpense`가 item 에 실려 새로 도달하는 소비처가 없는지는 Pre-Do 확인(V-1).

---

## 6. 사용자 결정

| # | 질문 | 권고 |
|---|---|---|
| Q-1 | 일반건물 이월과세 카드의 「취득가액 칸 이동분」을 **본인 자본적지출만**으로 맞추는가(관행 유지, O1) / 이월과세 A 예외를 폐지하는가(O4) / 현행 합산 유지(O3 변형)인가 | **자본적지출만(O1).** 단건 경로와 같은 칸, anchor A0-5 무수정. 서식 관행은 이미 정해져 있어 일반건물 카드를 맞추는 일이다. |
| Q-2 | 명세서 산식 문구에 「+ 자본적지출 N」을 단건과 같은 형태로 넣는가 | **넣는다.** 값≠산식은 이미 결함이다(§2.3) — 결정 사항이라기보다 O1 의 일부다. 다른 문구 형태를 원하시면 알려 주세요. |

---

## 7. 검증 계획

1. **Pre-Do anchor** (수정 전, 현행에서 적색이어야 한다):
   - 양도비만(0/5M) 입력: 이동분이 0 이어야 하는데 4,122,020 → 적색.
   - 자본적지출만(3M/0): 산식 문구가 「+ 자본적지출 2,473,212」를 포함해야 한다 → 적색.
2. **세액 불변** — `transfer.route.gb-carryover-a-own-expense*.anchor.test.ts`·`gb-fractional-cases` 전건이 수정 전후 무수정 초록. 새 anchor 로 환산(2-way·증축 3-way·지분)·실가·사업용/비사업용 분할 카드에서 `ownCapex + ownTransfer = ownDirect` 와 결정세액 동일을 고정한다.
3. **뮤테이션** — (a) 양도비 몫을 `capitalExpenditure`에 합산하도록 되돌리면 이동분 anchor 적색 (b) 산식 문구 분기 제거 시 적색 (c) legacy 분리 불가 분기를 합산으로 바꾸면 적색.
4. **표시 전수** — 신고서(단건·다건)·명세서 합계·자산별·산식 4곳이 같은 leaf 를 쓰므로(`exempt-gross-gain.ts:81-103`) 이동분 값이 바뀌면 함께 바뀌는지 E2E 1건(`gb-carryover-a-own-expense.spec.ts` 의 165,000,000 → 증여자 150M + **자본적지출 몫만**)으로 확인한다.
5. **브라우저 수동 확인** — 폼→계산→결과(신고서 A 열·명세서 산식)까지. 이월과세 일반건물 카드에 양도비만 입력.

## 8. 레지스터

| # | 항목 | 상태 |
|---|---|---|
| V-1 | 카드 item 에 `transferExpense`를 싣는 것이 합계 필요경비 외 다른 소비처(총 양도비 O-9 규칙·집계 단계)에 영향 없는지 | 🟠 **확인 필요** — `lib/tax-engine/transfer-tax-aggregate*.ts`에서 `transferExpense` 직접 참조는 grep 0건이나, 단건 엔진 단계의 참조(공통 양도비·`appliedFormTotalTransferExpense` 등)는 Pre-Do 에서 anchor 로 확인한다. |
| V-2 | 일반건물 A 카드의 **필요경비 칸 산식**(`buildGbExpenseFormula`, gb 있음 분기)이 이동분을 어떻게 쓰는지 | 🟠 **확인 필요** — gb 없는 fallback 은 「필요경비 − 자본적지출(취득가액 흡수) = 양도비」(:585-592)라 이동분이 정확하면 맞게 읽힌다. gb 있는 분기는 미실측. |
| V-3 | legacy `directExpenses`(분리 불가) 카드의 이월과세 필요경비 표시를 어떻게 싣는가 | 🟠 **미결(Do 에서 결정)** — 합산값을 `transferExpense` 쪽에 두면 필요경비 칸 전액이다. 합계 불변은 anchor 로 확인한다. |
| V-4 | 증축(3-way)·지분(%)·파트(감정·매매사례) 카드에서 자본적지출 전용·양도비 전용 2차 실행이 합산 실행과 항상 가산적인가(분기 `forceOwn` :362·:462·:469·:488) | 🟠 **확인 필요** — 환산 2-way 는 §2.2 로 실측(2,473,212 + 4,122,020 = 6,595,232). 나머지 모양은 Pre-Do 에서 격자 전수. 잔액 흡수 정의(§5.1-1)라 합 불변은 정의상 서지만 각 성분이 음수가 아닌지는 확인한다. |

## 9. 범위 밖 (별건)
- 증여자 자본적지출이 취득가액 칸이 아니라 필요경비 칸에 머무는 것(§2.2 마지막 행): `exempt-gross-gain.ts:70-76` 주석은 「증여자 자본적지출 승계를 취득가액 칸에 적는다」고 하나 실측은 필요경비 칸이다. 세액·항등식은 맞다. 주석과 실측이 어긋나므로 정리는 별건 후보다 — 이번 수정에서는 건드리지 않는다.
  → ✅ 후속 `fix/carryover-a-donor-capex-display-note`(2026-10-28)에서 정리: **값은 그대로**(증여자 자본적지출은 필요경비 칸 — 비교과세 카드 「당초 증여자 자본적지출」 행·서식 부표3 ⑥→⑬ 관행과 같은 분류) · 주석을 실측대로 정정(그 주석은 2026-10-02 `3d91f0aac` 에서 쓰였고 `capitalExpenditureForDisplay` 는 처음부터 본인 입력뿐이라 증여자 자본적지출을 취득가액 칸에 적는 구현은 없었다) · 명세서 **문구 두 곳**을 값에 맞췄다: ① 취득가액 산식의 「(증여자 자본적지출 N 포함 §97의2①2호)」 삭제(단건·일반건물 카드 — 값이 포함하지 않는다) ② 필요경비 산식이 증여자 자본적지출을 「양도비 등 N (중개수수료·법무사 비용 등)」으로 적던 것을 「증여자 자본적지출 N — 이월과세 §97의2①2호」로 따로 적는다(단건 · **증여자 취득이 실가일 때만** — 칸이 정확히 분해된다). 남은 한계: 증여자 취득이 환산이고 단서(나목)가 발동한 구간은 칸이 「취득가액 = 환산취득가 · 필요경비 = 역산 나머지」(실측: 증여자 자본적지출 500,000,000 → 필요경비 칸 250,000,000)라 자본적지출이 두 칸에 걸쳐 분해되지 않아 종전 「양도비 등」 문구를 둔다 · 일반건물 카드의 필요경비 칸 산식(`buildGbExpenseFormula`)에는 이월과세 A 분기가 없다(V-2).
- 감정가액·매매사례 파트 카드의 화면 `capexHint`(「자본적지출·양도비는 반영되지 않는다」)가 이월과세 카드에서는 A·B 모두 본인 지출을 쓰는 지금 사실과 다를 수 있다(§97②2호 본문 안내) — 이전 계획서 §11-7 의 미점검 항목 그대로다.
- Q-5(선언 채널 컴패니언 공통 양도비 소실)·GB 부담부증여 본인 지출(V-2)은 이전 계획서의 별건이다.

---

## 10. Do 환류 (2026-10-28 구현 결과 — 계획서와 달라진 점)

구현: 브랜치 `fix/gb-carryover-a-card-capex-split`. Pre-Do anchor(양도비만 입력 이동분 0 · 산식 문구) 6건이 현행에서 적색임을 먼저 확인했다.

1. **「가산적」은 ±1원이다 (§2.2·§5.1-1 정정)** — 3,000,000/5,000,000 은 2,473,212 + 4,122,020 = 6,595,232 로 정확히 맞았지만, 150,000,000/5,000,000 은 자본적지출 123,660,614(손계산 floor) + 양도비 4,122,020 = 127,782,634 로 합산 몫 127,782,635 와 **1원** 어긋난다(`floor(a)+floor(b) ≤ floor(a+b)`). 계획서 §5.1-1 의 「양도비 몫 = ownDirect − ownCapex」(잔액 흡수) 정의 덕에 합은 그대로이고 그 1원은 양도비가 흡수한다(필요경비 칸 +1원). 세액·필요경비 합계 불변.
2. **구현 모양** — 환산: `GeneralBuildingSwapDecision.ownCapex`(`general-building-swap.ts`, 자본적지출만으로 `decideSwap` 한 번 더 · `partAxis.transferExpense`는 제외, 몫은 `ownDirect` 이하로 자름). 실가: `AssetCardForAggregate.expensesCapex`(신규 optional) — `general-building-route-actual.ts`의 `apportionExpenses`·`resolvePartExpenses`가 이미 따로 구하던 자본적지출 몫(파트 직접귀속 포함)을 내고, 사업용·비사업용 분할 카드에도 같은 규칙. `buildProperties`는 `capitalExpenditure`(자본적지출 몫) + `transferExpense`(나머지)로 나눠 싣는다. 명세서 `buildGbAcquisitionFormula` 이월과세 A 분기에 「+ 자본적지출 N」(단건 `capExStr` 와 같은 형태).
3. **V-1 해소** — `transferExpense`가 카드 item 에 실려도 관련 회귀 전수(`__tests__/tax-engine/transfer`·`api`·`components`·`calc` **2,512 파일 · 30,175 테스트**)에서 반전 0건. 세액은 새 anchor 에서 현행 값(0/5M 34,478,553 — 수정 前 실측 · 나머지는 GBCO-1 값)과 같다.
4. **V-3 결정** — legacy `directExpenses` 덩어리는 `expensesCapex`가 없어 자본적지출 몫 0 · 전액 `transferExpense`(= 필요경비 칸). anchor CS-3 이 고정한다.
5. **V-4 부분 해소** — 환산 2-way(CS-1)·지분(CS-4: 자본적지출 10,000,000 → 이동분 5,000,000)·채무 매입분 증여분 조각(CS-5: 이동분 900,000 · 조각 규칙 `carryover-debt-pieces.ts:89·109`이 두 필드를 따로 자른다)·실가(CS-3: 16,488,081 + 4,825,066 = 21,313,147 — 손계산이 수정 前 합과 일치)를 실측. **증축(3-way)·파트 축(감정·매매사례) 전용 anchor 는 만들지 않았다** — 같은 `decideSwap` 경로를 타고 기존 GBCO·증축 anchor 가 세액 불변을 지키지만 이동분 값 자체는 미고정. → ✅ 후속(`test/gb-carryover-a-extension-part-shift-anchor`)에서 고정했다: 단위 `general-building-swap-own-capex.anchor.test.ts` CX-1~12(파트 축 환산·실가·감정·매매사례·단서 발동, 증축 5개 조합, 자산총액 판정 + `ExtensionCapexInput`; 합산 몫과 ±1원이 갈리는 CX-8 포함, 모양마다 `Σ ownCapex = 자본적지출 · Σ(ownDirect − ownCapex) = 양도비` 보존) + 라우트 `transfer.route.gb-carryover-a-card-capex-split-ext-part.anchor.test.ts`(증축 실가 × 증축분 환산·실가 / 환산 × 환산, 파트 축 3모양 — 이동분·필요경비 칸·명세서 산식·항등식). 손계산이 전부 첫 실행에서 구현과 일치했고, 뮤테이션 3종(양도비 미제거 18건 · 증축 입력 누락 1건 · 자산총액 양도비 미제거 4건)이 적색이다. 라우트 증축 픽스처는 증여자 취득가액을 30,000,000 으로 낮춰야 A 가 채택된다(비교과세는 세액으로 가르며 380,000,000·100,000,000 은 B 채택 — 짝 anchor `gb-carryover-a-own-expense-ext` 의 A·B 양도차익은 B 채택 상태의 값이다). `Math.min(capexRaw, ownDirect)` 방어는 여전히 그 분기를 만드는 입력을 못 찾아 뮤테이션으로 고정하지 못했다. `Math.min(capexRaw, ownDirect)` 방어는 합산 실행보다 큰 자본적지출 몫이 생기는 경우(마지막 카드 잔액 흡수의 ±n원)용인데 그런 입력을 못 만들어 뮤테이션으로 고정하지 못했다.
6. **V-2 미해소(표시 문구)** — 일반건물 A 카드의 필요경비 칸 산식(`buildGbExpenseFormula` gb 분기)은 이월과세 A 분기가 없다. 값(필요경비 칸 = 필요경비 − 이동분)은 맞고 이 PR 에서 문구는 바꾸지 않았다.
   → ✅ 후속 `fix/gb-card-carryover-a-expense-formula`(2026-10-28)에서 해소. 실측(수정 前): 이월과세 A 카드는 개산공제 분기로 떨어져 「취득시 토지기준시가 79,800,000 × 3% = 50,000,000」(실제 2,394,000 — **적힌 산식이 값을 못 만든다**, 일반건물 토지 카드 「3% × 1억 ≠ 9백만」 류 결함의 이월과세 구간) · 실가 파트는 「0 × 339,492,000 / (339,492,000+12,308,310) = 54,825,066」. **비교과세(B) 채택 카드도 #2676 이후 개산공제가 없는데 같은 개산공제 산식**이었다(그 회귀를 같은 PR 에서 정리). 새 파일 `DetailedStatementGbCarryoverFormulas.ts`(단방향 import — `DetailedStatementGbFormulas`가 호출): A = 본인 양도비 + 증여자 자본적지출(증여자 실가) + 증여세 상당액(칸 = 필요경비 − 취득가액 칸 이동분) · 증여자 환산 본문 = 개산공제(증여자 취득시 기준시가 `lumpDeductionBase` × 율) + 증여세 · 증여자 환산 + 단서 = 칸이 환산취득가/역산 나머지라 산술이 맞는 합계만(「필요경비 140,261,350 − 자본적지출 123,660,614(취득가액 칸에 표시) = 16,600,736」) · B = 자본적지출 + 양도비. 값·세액 불변. 앵커 `transfer.route.gb-carryover-expense-formula.anchor.test.ts` 9건(Pre-Do 7건 적색 확인 · 뮤테이션 5종 적색) · 관련 회귀 2,522 파일 통과. 남은 한계: 채무 매입분 조각 중 **매입분 카드**의 필요경비 산식은 종전부터 없다(`undefined` — 값만 표시, 거짓 등식은 아님). → ✅ 후속 `fix/gb-purchased-piece-expense-formula` 에서 해소: `purchasedPartPieceFormula(…, "expense")`(증여분 카드의 `purchasedPartSplit` echo 로 매입분 카드를 찾는다 — 양도가액·취득가액 산식과 같은 경로)가 「자본적지출 600,001 + 양도비 1,000,000 = 1,600,001 (§97① 2호·3호) ※ 매입분은 취득가액이 인수한 채무(실지거래가액)라 개산공제를 적용하지 않습니다 (§97② 1호)」를 적는다. 증여분이 없는(r = 1) 매입분은 부모(A) 카드가 이미 올바른 산식을 그려 건드리지 않는다. 앵커 `transfer.route.gb-purchased-piece-expense-formula.anchor.test.ts` 6건(상세명세서 `buildStatementItems` 배선 포함 · 뮤테이션 5종 적색) · 관련 회귀 2,525 파일 통과.
7. **BG(부담부증여) 일반건물 카드의 부수 변화** — 이 경로는 카드 `expenses`가 §159 개산공제(`landExp = estimatedDeduction`, `general-building-route-actual.ts:315`)라 `expensesCapex`가 없다 → 이월과세 A 에서 이동분 0(전액 필요경비 칸). 종전에는 개산공제가 「자본적지출」로 취득가액 칸에 얹혔다. 회귀 전수에서 반전 0건이라 기존 anchor 가 이 표시를 고정하지 않았음을 확인했다. 세액 불변.
8. **뮤테이션 5종 전부 적색** — M1 합산값을 `capitalExpenditure` 로(10건) · M2 산식 문구 제거(2건) · M3 legacy 덩어리를 자본적지출로(3건) · M4 `ownCapex` 미분리(7건) · M5 실가 자본적지출 몫 0(1건).
9. **E2E** — `e2e/gb-carryover-a-own-expense.spec.ts` GBCO-E3 추가(신고서 토지 취득가액 = 150,000,000 + 10,000,000 = 160,000,000 · 165,000,000 부재 — 수정 前 값은 계획서 §11-5 기존 실측). 3 건 통과.
10. **파일 크기** — `lib/tax-engine/types/general-building.types.ts` 787 → 793줄(타입 전용 파일 — 분리 대상 아님으로 판단 · 800 미만).
