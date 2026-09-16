# 단건 양도차손이 **0으로 지워져** 신고서가 취득가액을 거짓으로 역산한다 (수정 계획서)

> 상태: **Plan** — 미착수
> 세목: 양도소득세 / 단건(`/calc/transfer-tax`)
> 작성일: 2026-09-16 · 기준 커밋: `f1f84d49`

---

## 0. 한 줄 요약

취득가액이 양도가액보다 크면 **단건 엔진이 양도차익을 `0`으로 바닥 처리**한다. 그 결과 신고서 양식이 취득가액을 「양도가액 − 양도차익 − 필요경비」로 **역산**해 **취득가액 = 양도가액**이라는 값을 만들어낸다 — 사용자가 입력한 120,000,000과 무관한 숫자다.

**다건 합산의 §102② 통산은 이미 정확히 동작한다**(§3에서 실측). 사용자가 우려한 「합산 시 통산이 안 될 것」은 **실측으로 반증**됐다. 고칠 것은 단건 축 하나다.

---

## 1. 제보 재현

**입력**(이미지 15 — 사이드바):

| 항목 | 값 |
|---|---|
| 양도가액 | 100,000,000 |
| 취득가액 | **120,000,000** |
| 필요경비 | − |

사이드바는 **입력값을 정확히 표시한다**(120,000,000). 결함은 사이드바가 아니다.

**결과**(이미지 16 — 신고서 양식):

| 행 | 화면 | 참값 |
|---|---|---|
| 양도가액 | 100,000,000 | 100,000,000 ✓ |
| **취득가액** | **100,000,000** | **120,000,000** ✗ |
| 전체 양도차익 | 0 | **−20,000,000** ✗ |
| 과세대상 양도차익 | 0 | −20,000,000 ✗ |
| 양도소득금액 | 0 | −20,000,000 ✗ |

### 실측 재현 (throwaway probe · `calculateTransferTax`)

```
SINGLE transferGain = 0   taxableGain = 0
SINGLE gain step: { formula: "양도가(100,000,000) - 취득가(120,000,000) - 경비(0)",
                    amount: 0 }
SINGLE keys w/ loss?  []        ← 결과 어디에도 차손 금액이 없다
```

🔴 **산식과 금액이 어긋난다** — 산식은 `100,000,000 − 120,000,000`(= −20,000,000)이라고 적어 놓고 금액은 `0`이다. PR #1640에서 고친 「산출세액 근거 항등식」과 **같은 종류**의 결함이 한 단계 앞에 또 있었다.

---

## 2. 근본 원인 — 바닥이 **세 곳**이고, 범인은 주석이 없는 쪽이다

### 2-1. 🔴 가장 눈에 띄는 한 줄은 **제보 케이스의 범인이 아니다**

`lib/tax-engine/transfer-tax.ts:391`에는 친절한 주석과 함께 바닥이 있다:

```ts
// STEP 2a: 손실 → 0 (aggregate 엔진에서 skipLossFloor=true 시 음수 허용 — §102② 통산용)
const transferGain = input.skipLossFloor ? ownerRawGain : Math.max(0, ownerRawGain);
```

**이 줄만 걷어내면 제보 케이스는 여전히 `0`이다** — 실측으로 확인했다:

```
(line 391만 제거) SINGLE transferGain = 0     ← 변화 없음
```

이유는 `ownerRawGain`이 `calcTransferGain()`에서 **이미 바닥 처리돼서 온다**는 것이다. line 391은 `splitDetail`(토지·건물 소유자 분리) 경로에서만 실효가 있다. 진짜 범인은 주석이 없는 쪽이다:

| # | 위치 | 담당 경로 | 제보 케이스 |
|---|---|---|---|
| ① | `transfer-tax-helpers.ts:398` | **일반 단건** (`calcTransferGain` 본체) | 🔴 **범인** |
| ② | `transfer-tax-helpers.ts:300` | 토지·건물 **취득일 분리** 합산 | 동종 |
| ③ | `transfer-tax.ts:391` | 소유자 분리(`selfOwns`) | 동종 |

세 곳 모두 `input.skipLossFloor ? raw : Math.max(0, raw)` **같은 형태**다. 셋을 함께 걷어내야 제보 케이스가 고쳐진다:

```
(세 곳 모두 제거) SINGLE transferGain = -20000000  taxableGain = -20000000
                  gain step amount = -20000000      ← 산식과 일치
```

> ⚠️ **이 계획서의 핵심 경고.** 「STEP 2a」라는 라벨과 §102② 주석 때문에 line 391이 정본처럼 보인다. 거기만 고치고 전체 테스트가 초록인 것(§4에서 3건만 실패)을 보면 **고쳤다고 착각하기 쉽다**. 제보 수치로 재현 확인 없이 종결하면 사용자 화면은 그대로다. (memory `feedback_enumerate_all_write_sites_before_fixing`)

### 2-2. 표시층은 그 거짓을 **증폭**한다 — 취득가액 역산

`components/calc/results/transfer/FilingFormTableHelpers.ts:528`:

```ts
const effGainForAcq = result.isExempt ? (result.exemptGrossGain ?? 0) : result.transferGain;
const engineAcqPrice = totalTransferPrice - effGainForAcq - totalEngineExpenses;
//                   = 100,000,000 - 0 - 0 = 100,000,000        ← 이미지 16
```

같은 파일의 주석이 **이미 이 함정을 알고 있었다** — 비과세 자산에 대해서만:

> 비과세 자산은 transferGain=0 → exemptGrossGain echo로 취득가액 역산 (그렇지 않으면 취득가액=양도가액−경비로 왜곡).

`exempt-gross-gain.ts`는 그 축(비과세)과 재개발 축을 단일 소스로 묶어 놓았다. **차손은 세 번째 축인데 빠져 있었다.**

🔑 **역산 자체는 고치지 않아도 된다.** `transferGain`이 참값 `−20,000,000`이 되면 역산이 자동으로 맞는다:

```
100,000,000 − (−20,000,000) − 0 = 120,000,000   ✓
```

이것이 **엔진을 고치는 쪽을 택하는 이유**다. 표시층 5곳을 개별 보정하는 대신 근원 한 곳을 참값으로 만들면 소비자 전부가 따라온다. (memory `feedback_aggregate_display_rederives_engine_value` — 표시층이 엔진 값을 다시 적으면 드리프트한다)

---

## 3. 다건 합산 §102② 통산은 **이미 동작한다** (실측·반증)

사용자 제보의 후반부는 「양도차손까지 계산해 놓아야 다른 자산과 합산할 때 통산할 수 있을 것」이다. **실측 결과 통산은 이미 정확히 동작한다.**

probe: 차익 자산(양도 300,000,000 / 취득 100,000,000) + 차손 자산(양도 100,000,000 / 취득 120,000,000), 둘 다 토지·2020-04-01 취득·2026-06-03 양도:

```
AGG lossOffsetTable = [{ from: "LOSS", to: "GAIN", amount: 20000000, scope: "same_group" }]
AGG properties      = [ { id: "GAIN", gain:  200000000, incomeAfterOffset: 156000000 },
                        { id: "LOSS", gain: -20000000, incomeAfterOffset:         0 } ]
AGG taxBase = 153500000
```

손계산으로 검산한다:

```
GAIN 양도차익 200,000,000 − 장특 12%(6년 이상 7년 미만, §95② 표1) 24,000,000 = 176,000,000
차손 통산(§102②)                                              − 20,000,000 = 156,000,000
기본공제(§103①)                                                − 2,500,000 = 153,500,000  ✓
```

**왜 다건만 멀쩡한가**: `transfer-tax-aggregate-asset-records.ts:70`이 자산별 단건 호출에 `skipLossFloor: true`를 실어 바닥을 끈다. 그래서 §2-1의 세 바닥이 전부 no-op이 되고 음수가 `offsetLosses`까지 살아 도달한다.

**이력에서 진입해도 안전하다**: `buildPropertyFromSingleRecord`(`transfer-multi-load-entry.ts:44`)는 `record.inputData`만 읽고 **저장된 결과값을 쓰지 않는다**. 즉 이력에 `transferGain: 0`으로 저장돼 있어도 합산은 입력에서 재계산하므로 오염되지 않는다. PR #1637의 이력→합산 진입도 이 경로다.

⇒ **§102② 통산 로직은 이 작업에서 한 줄도 바뀌지 않는다.** 계획서에 반영하라는 요청에 대한 답은 「이미 되어 있고, 실측으로 확인했다」이다.

> 📌 다만 **단건 결과를 고치면 통산의 «설명 가능성»이 올라간다** — 차손 자산을 단건으로 먼저 계산해 본 사용자가 화면에서 −20,000,000을 볼 수 있어야, 합산 후 과세표준이 왜 줄었는지 추적할 수 있다. 사용자의 직관은 «통산이 깨진다»는 결론은 틀렸지만 «차손이 계산돼 있어야 한다»는 전제는 옳다.

---

## 4. 영향 범위 — **실측**

세 바닥을 모두 제거하고 **vitest 전건**(2,048 파일 / 21,482 테스트)을 돌렸다.

| | 결과 |
|---|---|
| 실패 | **9건 / 4파일** |
| **세액을 단언하는 실패** | **0건** |
| 통과 | 21,456 |

실패 9건은 **전부 같은 형태**다 — `expect(...transferGain).toBe(0)`인데 실제는 음수:

| 파일 | 건수 | 실제값 | 성격 |
|---|---|---|---|
| `transfer-tax/owner-split-case12.test.ts` | 3 | −11,215,066 | 결함 고정 단언 |
| `transfer/same-adjustment-period-engine.anchor.test.ts` | 4 | −4,830,000 | 결함 고정 단언 |
| `transfer-tax/basic.test.ts` (T-19) | 1 | −20,000,000 | 결함 고정 단언 |
| `transfer/review-2026-08-f33.test.ts` | 1 | −100,000,000 | 결함 고정 단언 |

**9건 모두 「세액 0」은 그대로 통과했다.** 실패한 것은 「차익도 0」이라는 곁다리 단언뿐이다. 예: `owner-split-case12.test.ts:205`는 테스트 이름이 「건물 분 손실 시 **세액** = 0」인데 단언은 `expect(building.transferGain).toBe(0)`이다 — 이름이 말하는 것과 단언이 지키는 것이 다르다.

### 4-1. §164⑧ anchor 4건은 주석의 산술이 틀렸다

```ts
expect(r.transferGain).toBe(0); // 취득당시 기준시가 그대로 → 분자=분모 → 차익 0
```

분자=분모면 환산취득가액 = 양도가액이므로 **차익 = 0 − 필요경비개산공제 = −4,830,000**이다. 주석이 개산공제(§163⑥)를 빠뜨렸고, 바닥이 그 오차를 가려 왔다. **단언을 −4,830,000으로 고치는 것이 법령 정합**이다(memory `feedback_anchor_correction_legal_priority`).

---

## 5. 법령 근거 (본문 확인 완료 — KoreanLaw MCP, 시행 2026-01-01)

**소득세법 §102** (양도소득금액의 구분 계산 등):

> ② 제1항에 따라 양도소득금액을 계산할 때 **양도차손이 발생한 자산이 있는 경우**에는 제1항 각 호별로 해당 자산 외의 다른 자산에서 발생한 양도소득금액에서 그 양도차손을 공제한다.

🔑 조문이 **「양도차손이 발생한 자산」의 존재를 전제**한다. 자산 단계에서 차손이 계산돼 있지 않으면 이 조문이 작동할 대상 자체가 없다. **바닥 처리는 이 구조와 충돌한다.**

**소득세법 §95①**: 양도소득금액 = 양도차익 − 장기보유 특별공제액. 차손이면 음수가 그대로 양도소득금액이다.

**소득세법 §95②**: 장특공제는 「보유기간이 **3년 이상**인 것 ... 그 자산의 **양도차익**에 ... 공제율을 곱하여 계산한 금액」 — 차손에 공제율을 곱하면 음수가 되어 공제가 오히려 불리해지므로 **0으로 본다**. 현행 코드가 이미 그렇게 동작한다(`DetailedStatementFormulaBuilders.ts:88` 「차손 자산 — 장특공제 미적용」).

**소득세법 §92**: 과세표준은 양도소득금액에서 기본공제를 뺀 것 — **0 바닥은 여기(과세표준·양도소득금액 단계)에 남는다**. 이 작업이 걷어내는 것은 **양도차익 단계**의 바닥뿐이다.

---

## 6. 수정 범위

### 6-1. 엔진 — 양도차익 단계의 바닥 3곳 제거

| # | 파일:라인 | 변경 |
|---|---|---|
| ① | `transfer-tax-helpers.ts:398` | `input.skipLossFloor ? gain : Math.max(0, gain)` → `gain` |
| ② | `transfer-tax-helpers.ts:300` | `... totalGain` 동일 |
| ③ | `transfer-tax.ts:391` | `... ownerRawGain` 동일 |

**`skipLossFloor` 플래그는 무의미해진다** — 세 소비 지점이 전부 사라지기 때문이다. 처리 방안은 §8 Q1.

`transfer-tax.ts:421`의 `if (transferGain <= 0)` 조기반환은 **그대로 둔다**. 음수도 이 분기가 흡수해 `taxBase: 0` · `calculatedTax: 0` · `determinedTax: 0`을 낸다 — 세액은 바뀌지 않는다(§4 실측).

### 6-2. ⛔ 건드리지 않는 바닥 — **양도소득금액·과세표준 단계**

grep으로 찾은 `Math.max(0, ...)` 중 **다음은 법령상 정당하므로 남긴다**:

| 위치 | 대상 | 근거 |
|---|---|---|
| `transfer-tax.ts:567` | `transferIncomeBefore993` | §92 과세표준 0 바닥 |
| `transfer-tax-mixed-use-totals.ts:48` · `-helpers.ts:590,661` | `incomeAmount` | 동 |
| `redevelopment-branches.ts:181,349,619` · `redevelopment-successor.ts:165` | `taxableIncome` | 동 |
| `transfer-tax-rental-housing-step.ts:160` · `transfer-tax-appurtenant-land.ts:196-197` | 파트별 안분 gain | 특례 안분 분자 — 별도 축 |
| `multi-parcel-transfer.ts:442` | — | **이미 차손 보존**(`rawGain > 0 ? ... : rawGain`) |

### 6-3. 🔴 표시 정합 — 두 카드가 갈린다 (신규 발생)

바닥을 걷으면 **같은 화면의 두 카드가 「양도소득금액」을 다르게 표시한다**:

| 카드 | 코드 | 값 |
|---|---|---|
| 신고서 양식 | `FilingFormTableHelpers.ts:619-621` — `result.taxableGain - LTHD` | **−20,000,000** |
| 상세명세서 | `DetailedStatementHelpers.ts:526` — `Math.max(0, result.taxableGain - LTHD)` | **0** |

**권고: 둘 다 음수를 표시한다**(신고서 쪽에 맞춘다). 근거는 §95① — 양도소득금액은 양도차익에서 장특공제를 뺀 금액이고, 차손이면 음수다. 과세표준(0)과 산출세액(0)이 아래 행에서 바닥을 담당하므로 **정보가 손실되지 않으면서 §102② 통산 대상 금액이 화면에 드러난다**.

⇒ `DetailedStatementHelpers.ts:526`의 `Math.max(0, ...)`를 제거해 신고서와 축을 맞춘다. (memory `feedback_ui_engine_dual_truth_avoidance`)

### 6-4. 안내 문구 (사용자 의도에 대한 직접 응답)

차손 자산의 결과 화면에 **행 고지**를 추가한다. 기존 `setRoseNote` 패턴을 그대로 쓴다:

> 양도차손 20,000,000원이 발생했습니다. 같은 과세연도에 양도한 다른 자산이 있으면 **연간 합산** 화면에서 통산할 수 있습니다 (소득세법 §102②).

**4개 결과뷰 전부**에 닿는지 확인한다(memory `feedback_transfer_result_view_is_not_one`) — 단건·일반건물 일괄·다건·겸용주택. 엔진 수정은 `result.transferGain`을 읽는 모든 뷰에 자동 전파되지만, **고지 문구는 전파되지 않는다**.

---

## 7. Pre-Do anchor (구현 **전에** 작성 — 전부 실패해야 착수)

`__tests__/tax-engine/transfer-tax/single-loss-gain-preservation.predo.anchor.test.ts`

| ID | 단언 | 착수 전 |
|---|---|---|
| A-0 | 제보 재현 — 양도 100,000,000 / 취득 120,000,000 → `transferGain === -20_000_000` | 🔴 실패(0) |
| A-1 | `taxableGain === -20_000_000` | 🔴 실패 |
| A-2 | **세액 불변** — `totalTax === 0` · `taxBase === 0` · `calculatedTax === 0` | 🟢 통과(회귀 감시) |
| A-3 | **항등식** — 「양도차익 계산」 step의 `amount` === `transferPrice − acquisitionPrice − expenses` | 🔴 실패 |
| A-4 | 신고서 역산 — `buildFilingFormRows` 취득가액 행 === **120,000,000** | 🔴 실패(100,000,000) |
| A-5 | 취득일 분리(②) 경로 차손 보존 | 🔴 실패 |
| A-6 | 소유자 분리(③ `selfOwns`) 경로 차손 보존 | 🔴 실패 |
| A-7 | 장특공제 === 0 (§95② — 차손엔 미적용) | 🟢 통과(회귀 감시) |
| A-8 | **합산 회귀** — 차익+차손 2자산 → `lossOffsetTable` 20,000,000 · `taxBase === 153,500,000` | 🟢 통과(§3 보존 감시) |
| A-9 | **두 카드 정합** — 신고서 `incomeAmount` === 상세명세서 `incomeAmount` | 🔴 실패 |

⚠️ A-2·A-7·A-8은 **통과 상태로 시작한다** — 이 수정이 세액과 통산을 건드리지 않음을 고정하는 안전망이다. 「실패해야 착수」는 A-0·A-1·A-3~A-6·A-9에만 적용한다.

### 뮤테이션 계획 (구현 후 — 구별력 실측)

| M | 되돌릴 것 | 기대 |
|---|---|---|
| M1 | ①만 복원 | A-0·A-3·A-4 실패 |
| M2 | ②만 복원 | A-5 실패 |
| M3 | ③만 복원 | A-6 실패 |
| M4 | `DetailedStatementHelpers.ts` `Math.max(0,…)` 복원 | A-9 실패 |
| M5 | `transfer-tax-aggregate-asset-records.ts:70` `skipLossFloor` 제거 | **A-8 불변 예상** — 바닥이 없어졌으므로 플래그가 무의미해진다. Q1의 실측 근거가 된다 |

> 🔑 구별력 0이 나오면 **왜 0인지 손으로 따진다**. 「통과했으니 그 분기가 맞다」로 종결 금지 (memory `feedback_mutation_zero_discrimination_is_not_proof`).

---

## 8. 사용자 결정이 필요한 항목

**Q1. `skipLossFloor` 플래그를 어떻게 할 것인가?**
세 소비 지점이 사라지면 플래그는 죽는다. 선택지: **(A) 제거** — `types/transfer.types.ts:679` · `transfer-aggregate.types.ts:49` · `transfer-tax-aggregate-asset-records.ts:70` · `transfer-tax-preliminary-filing.ts:84` + 테스트 4파일. 죽은 코드를 남기지 않는다. / **(B) 존치** — Surgical Changes 원칙상 내 변경이 만든 고아만 치우는 것이 원칙이나, 이 플래그는 **정확히 이 변경이 고아로 만든 것**이라 (A)가 원칙에 부합한다. **권고: (A)**, 단 별도 커밋으로 분리해 diff를 읽기 쉽게 한다.

**Q2. 음수 표기 방식** — `-20,000,000` / `△20,000,000` / `(20,000,000)`. 다건 경로가 이미 음수를 렌더하고 있으므로 **그 규약을 따르는 것**이 정합이다(신규 규약 도입 금지). 착수 시 다건 화면 실측으로 확정한다.

**Q3. §6.4 안내 문구를 넣을 것인가** — 사용자 의도에 대한 직접 응답이라 권고하나, 범위를 「계산 정확성」으로 한정하려면 뺄 수 있다.

---

## 9. 검증 게이트

- [ ] A-0~A-9 전건 통과 · 뮤테이션 M1~M5 구별력 실측
- [ ] §4의 기존 단언 9건을 **법령 정합 방향으로** 갱신(0 → 실제 차손액). 세액 단언은 손대지 않는다
- [ ] `npx tsc --noEmit` 0건 · `npm run lint` 0 error
- [ ] `npm test` 전건 — **세액 회귀 0건**
- [ ] **브라우저 실측**(Playwright): 제보 입력 그대로 → 신고서 취득가액 **120,000,000** · 전체 양도차익 **−20,000,000** 확인
- [ ] 4개 결과뷰 경로별 확인(단건·일반건물 일괄·다건·겸용주택)
- [ ] 다건 합산 화면에서 §3 시나리오 재실행 — 과세표준 **153,500,000** 불변

---

## 10. 범위 밖 (발견했으나 고치지 않음)

- **합산 후보 선택 모달**(`HistoryAggregateSelectModal.tsx:57`)은 「결정세액」만 표시한다. 차손 자산과 비과세 자산이 **둘 다 0**으로 보여 구별되지 않는다. 결함은 아니나 합산 대상을 고를 때 판단 근거가 부족하다 — 별도 항목.
- `transfer-tax-preliminary-filing.ts:84`의 `skipLossFloor: false` 명시는 Q1 (A) 선택 시 함께 정리된다.
