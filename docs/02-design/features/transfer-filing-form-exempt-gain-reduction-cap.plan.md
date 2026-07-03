# 양도세 신고서 양식(일괄양도) per-asset 컬럼 — 비과세 양도차익 미산출 + 감면세액 미cap 버그 수정 (계획서)

> 작성일 2026-07-03 · 브랜치 `feat/filing-form-per-asset-fixes` (worktree `transfer-work`, base origin/master `2e4f0f95`)
> 범위: **일괄양도 + 단건 «신고서 양식» 표의 양도차익·감면세액 표시.** 버그①은 비과세 gross 양도차익을 엔진 **echo 필드(`exemptGrossGain`)**로 노출(세액 로직·`transferGain` 불변) + 표시 소비. 버그②는 집계 표시 cap. 세액(결정세액) 산출 로직 무변경.

---

## 1. 문제 정의 (사용자 보고 2건)

일괄양도(companion·aggregate) 결과의 «신고서 양식» 표(`FilingFormTable`, 컬럼 = 합계 / 주 자산(주택) / 농지)에서:

- **버그 ①** — 주택은 1세대 1주택 **비과세**인데 주택 컬럼의 **전체 양도차익·비과세 양도차익이 0**으로 산출된다. (실제 주택 양도차익 = 125,011,376 − 109,250,000 = **15,761,376**, 전액 비과세여야 함.) 합계 전체 양도차익도 농지분(90,187,144)만 나와 주택분이 누락됨.
- **버그 ②** — 농지는 8년 자경 감면(§69) 대상인데 농지 컬럼의 **감면세액(9,153,937)이 산출세액(8,791,440)보다 크다.** 결정세액은 0으로 맞지만 «감면 > 산출»은 자기모순. **합계 컬럼은 제대로 표시됨**(감면세액 8,791,440 = 산출세액, cap 적용).

두 버그 모두 **자산별 컬럼 표시값**의 문제이며, 세액 계산(합계·결정세액)은 정확하다.

---

## 2. 근본 원인 (실측 확인)

### 버그 ① — 비과세 자산 양도차익 0

- 엔진: `buildExemptEarlyResult` (`lib/tax-engine/transfer-tax-finalize.ts:494`)가 비과세 자산 결과에 **`transferGain: 0`**(및 `taxableGain: 0`)을 세팅. 비과세 판정 시 양도차익을 계산하지 않고 조기 반환.
- 집계: `transfer-tax-aggregate.ts:411` `transferGain: r.result.transferGain` → 비과세 자산은 0. 또한 `:386-387` `effectiveNecessaryExpense = isExempt ? 0 : …`, `:405-406` `transferPrice`·`effectiveAcquisitionPrice`는 정상 노출.
- 표시: `FilingFormTableAggregateHelpers.ts:132` `const transferGain = p.transferGain;`(=0) → `:138` 전체 양도차익=0, `:137,139` `assetExemptGain = max(0, 0−0) = 0` → 비과세 양도차익=0. `:195` `sumTransferGain += transferGain`(=0)라 합계도 주택분 누락.
- **정확한 표시**: 비과세 자산도 전체 양도차익 = `transferPrice − acquisitionPrice − necessaryExpense`(gross)를 표시하고, 전액 비과세이면 비과세 양도차익 = 그 gross, 과세대상 양도차익 = 0.

### 버그 ② — 감면세액 미cap (감면 > 산출)

- 표시: `FilingFormTableAggregateHelpers.ts:174` `setNum("reductionTax", col, p.reductionAggregated > 0 ? p.reductionAggregated : 0)` — `reductionAggregated`(§133 재배분 후 자산별 감면 share, `transfer-tax-aggregate.ts:366-376,428`)를 **cap 없이** 그대로 표시. 농지 = 9,153,937.
- 그런데 결정세액 행(`:175` `p.refDeterminedTax`)은 `transfer-tax-aggregate.ts:398` `refDeterminedTax = max(0, refCalculatedTax − standalone)` — **`standalone`**(=`r.result.reductionAmount`, `:363`) 기반. 즉 **감면세액 표시(reductionAggregated) ≠ 결정세액 산정 기준(standalone)** → 컬럼 내 «산출 − 감면 = 결정»이 성립하지 않음.
- 합계 컬럼은 `:236` `aggregated.reductionAmount`(= `Math.min(calculatedTax, Σ)`, `transfer-tax-aggregate.ts:312`)로 cap되어 정확.
- **정확한 표시**: 자산별 감면세액도 **산출세액 이하**여야 하고, 컬럼 내 «산출 − 감면 = 결정»이 성립해야 한다.

---

## 3. 수정 설계 (표시 레이어 — 엔진 세액 로직 무변경)

두 버그 모두 `FilingFormTableAggregateHelpers.ts`의 per-property 루프(`:93~`)에서 수정. 엔진(`buildExemptEarlyResult`·aggregate 세액)은 **무변경**(surgical) — 결정세액·합계는 이미 정확하고, 엔진 `transferGain=0` 변경은 blast radius가 큼(다수 소비처·테스트). 표시값 재구성은 `engine-formula-reverse-derive` 스킬 패턴(다른 result 필드 조합으로 표시값 역산, 엔진 불변) + 자기일관 anchor로 검증.

### 버그 ① 수정 — 비과세 자산 gross 양도차익 (echo-field, 집계+단건 통합)

**설계 결정(재검토 반영)**: 단건 신고서는 취득가액을 `engineAcqPrice = transferPrice − result.transferGain − expenses`(`FilingFormTableHelpers.ts:659`)로 **역산**하므로, `transferGain=0`이면 취득가액까지 틀어진다(= 양도가액 − 필요경비). 비과세 결과엔 gain·취득가액 정보가 아예 없어(STEP 2 양도차익 계산 `transfer-tax.ts:324`이 비과세 조기반환 `:276-283` **이후**) **표시-only 복원 불가**. → 엔진이 gross 양도차익을 **echo 필드로 노출**해야 집계·단건이 모두 정합.

`transferGain`을 **직접 바꾸지 않는다**(blast radius 회피): `transfer-tax-aggregate.ts:444` `totalTransferGain`(exempt 미가드 합산)이 PDF 총양도차익(`ResultPdfDocument.tsx:323`)에서 소비되고, 비과세+transferGain assert 테스트 10+개 존재. → **`echo-field-pattern`**: `transferGain: 0` 유지 + 신규 optional 필드.

**1) 엔진** (`transfer-tax-finalize.ts` `buildExemptEarlyResult` + 타입):
```ts
// TransferTaxResult 신규 optional echo 필드
exemptGrossGain?: number; // [echo] 비과세 자산 gross 양도차익 (표시 전용, transferGain=0 유지)

// buildExemptEarlyResult 내부 — calcTransferGain은 순수함수(effectiveInput만 수신, :273)
const g = calcTransferGain(p.effectiveInput);
// ...
transferGain: 0,               // 불변 (blast radius 0)
exemptGrossGain: Math.max(0, g.gain),
```

**2) 집계** (`transfer-tax-aggregate.ts` `PerPropertyBreakdown`): `exemptGrossGain: r.result.exemptGrossGain` 패스스루 추가. `transferGain`은 `r.result.transferGain`(0) **유지** → `:444` `totalTransferGain` 불변(PDF·테스트 무영향).

**3) 집계 표시** (`FilingFormTableAggregateHelpers.ts:132-140`):
```ts
const transferGain = p.isExempt ? (p.exemptGrossGain ?? 0) : p.transferGain;
const assetTaxableGain = p.isExempt
  ? 0                                            // 전액 비과세 → 과세대상 0
  : transferGain > 0
    ? Math.min(transferGain, Math.max(0, p.income) + p.longTermHoldingDeduction)
    : transferGain;
const assetExemptGain = Math.max(0, transferGain - assetTaxableGain);
```
합계는 루프 누적(`:195-197,207-209`) 자동 보정 → 전체 양도차익 105,948,520·비과세 15,761,376.

**4) 단건 표시** (`FilingFormTableHelpers.ts`): 비과세 시 echo 사용.
- `:659` `const effGain = result.isExempt ? (result.exemptGrossGain ?? 0) : result.transferGain;` → `engineAcqPrice = totalTransferPrice − effGain − totalEngineExpenses` (취득가액 정상 복원).
- `:674-676` `transferGain = effGain`, `exemptGain = Math.max(0, effGain − result.taxableGain)`(=effGain, taxableGain=0), `taxableGain = result.taxableGain`(0).

- **부분 비과세(고가주택 12억 초과)**: `p.isExempt`(및 `result.isExempt`)는 **전액 비과세만** true — `transfer-tax.ts:275-276` 「전액 비과세 시 조기 반환」 실측. 고가주택 과세분은 `isExempt=false` → echo 분기 미적용, 정상 transferGain 사용(회귀 없음).

### 버그 ② 수정 — 감면세액 컬럼 cap (자기일관)

`FilingFormTableAggregateHelpers.ts:174`:

```ts
// 감면세액 ≤ 산출세액, 그리고 컬럼 내 «산출 − 감면 = 결정» 자기일관.
setNum("reductionTax", col, Math.max(0, p.refCalculatedTax - p.refDeterminedTax));
```

- 농지: `refCalculatedTax`(8,791,440) − `refDeterminedTax`(0) = **8,791,440** (≤ 산출, 결정=0과 정합).
- 주택(비과세): 0 − 0 = 0.
- 컬럼 합 = 8,791,440 = 합계 감면세액(`:236` aggregated.reductionAmount). ✔
- **대안**: `Math.min(p.reductionAggregated, p.refCalculatedTax)` — 동일 결과(8,791,440)이나 «산출−감면=결정» 자기일관을 보장하지 못하는 경우가 있어 **비권장**. 권장은 `refCalculatedTax − refDeterminedTax`.

---

## 4. 케이스 매트릭스 (검증 분기)

| # | 케이스 | 전체 양도차익 | 비과세 | 과세대상 | 감면세액 |
|---|---|---|---|---|---|
| E-1 | 비과세 자산(1세대1주택, 12억↓) | `exemptGrossGain`(echo) | = gross | 0 | 0 |
| E-2 | 고가주택 부분과세(12억↑, `isExempt=false`) | 엔진 transferGain(정상) | 엔진 비과세분 | 엔진 과세분 | 정상 | ← **회귀 금지 확인** |
| E-3 | 과세 자산 + §69 감면(cap 발동, standalone≥산출) | 엔진 transferGain | 0 | = gain | 산출−결정 = 산출 (농지 8,791,440) |
| E-4 | 과세 자산 + 감면 부분(standalone<산출) | 정상 | 0 | 정상 | 산출−결정 = standalone (≤산출) |
| E-5 | 양도차손 자산(transferGain<0) | 음수 유지 | 0 | 음수 | 0 |
| E-6 | 합계 컬럼(집계) | Σ per-asset(비과세 gross 포함) | Σ 비과세 | Σ 과세 | aggregated.reductionAmount(기존) |
| E-7 | **단건 비과세**(1세대1주택, non-aggregate) | `exemptGrossGain`(echo) | = gross | 0 | 0 | + 취득가액 정상 복원(`:659`) |

> 버그② 표시 감면세액 = `refCalculatedTax − refDeterminedTax`(= `min(산출, standalone)`), **`reductionAggregated` 아님**. 결정세액 컬럼(`p.refDeterminedTax`, `:175`)과 «산출−감면=결정» 자기일관. 합계 컬럼은 `aggregated.reductionAmount`(`:236`) 무변경. 버그②는 **집계 전용**(단건은 감면 cap 로직 상이 — E-7은 비과세라 감면 무관).

---

## 5. 변경 파일 & 동기화

버그①은 엔진 echo 필드 1개 + 소비 3곳, 버그②는 집계 표시 1곳. **input·API·Zod·validation·사이드바 무변경**(result echo 필드는 JSON 통과, plumbing 불요 — 단 echo 누락 가드 §7 R-6).

| # | 파일 | 변경 |
|---|---|---|
| 버그①-엔진 | `lib/tax-engine/types/transfer-result.types.ts` | `exemptGrossGain?: number` echo 필드 추가(주석: 표시 전용, transferGain=0 유지) |
| 버그①-엔진 | `lib/tax-engine/transfer-tax-finalize.ts` `buildExemptEarlyResult` | `calcTransferGain(p.effectiveInput)` 호출 → `exemptGrossGain: Math.max(0, g.gain)`. import 추가(`calcTransferGain`) |
| 버그①-집계 | `lib/tax-engine/transfer-tax-aggregate.ts` | `PerPropertyBreakdown`에 `exemptGrossGain` 패스스루(`:400~` return + 타입 `transfer-aggregate.types.ts`). `transferGain`·`:444` 불변 |
| 버그①-집계표시 | `components/calc/results/transfer/FilingFormTableAggregateHelpers.ts` | `:132-140` `transferGain = isExempt ? exemptGrossGain : p.transferGain` + `assetTaxableGain` 비과세 0 |
| 버그①-단건표시 | `components/calc/results/transfer/FilingFormTableHelpers.ts` | `:659` `effGain` 도입(비과세=exemptGrossGain) → 취득가액 복원; `:674-676` echo 사용 |
| 버그② | `components/calc/results/transfer/FilingFormTableAggregateHelpers.ts` | `:174` 감면세액 cap(`refCalculatedTax − refDeterminedTax`) |
| anchor | `__tests__/tax-engine/transfer-tax/` + `__tests__/components/` | 아래 §6 |

> 실측 존재 확인: `PerPropertyBreakdown` 필드(`transfer-tax-aggregate.ts:400-434`), 단건 acq 역산(`FilingFormTableHelpers.ts:659`), `calcTransferGain` 순수함수(`transfer-tax-helpers.ts:273`), echo 대상 타입(`types/transfer-result.types.ts`).

---

## 6. Anchor 테스트 (Pre-Do 우선)

이미지 시나리오(주택 비과세 + 농지 §69) 재현. `calculateTransferTaxAggregate` 결과 + `buildAggregateRows`(FilingFormTableAggregateHelpers) 조합 검증. 값은 이미지 실측 고정:

- **A-0 (엔진 echo)**: 단건 1세대1주택 비과세 → `result.exemptGrossGain === gross`(price−acq−exp), `result.transferGain === 0`(불변), `result.taxableGain === 0`. (엔진 레벨, `calculateTransferTax`.)
- **A-1 (버그① 집계)**: 비과세 주택 컬럼 → 전체 양도차익 = 15,761,376, 비과세 = 15,761,376, 과세대상 = 0.
- **A-2 (버그① 집계 합계)**: 합계 전체 양도차익 = 105,948,520(=15,761,376+90,187,144), 비과세 = 15,761,376, 과세대상 = 90,187,144.
- **A-3 (버그②)**: 농지 컬럼 감면세액 = 8,791,440 (≤ 산출세액 8,791,440), 산출−감면=결정(0) 자기일관.
- **A-4 (합계 회귀)**: 합계 감면세액 = 8,791,440 (기존 유지).
- **A-5 (E-2 회귀)**: 고가주택 부분과세(`isExempt=false`) 자산은 transferGain/과세대상이 엔진값 그대로(echo 분기 미적용).
- **A-6 (E-7 단건)**: 단건 비과세 신고서 → 전체 양도차익 = gross, 비과세 = gross, 과세대상 = 0, **취득가액 = 실제 취득가액**(`:659` 역산 정상, `양도가액−필요경비` 아님).
- **A-7 (blast radius 회귀)**: `exemptGrossGain` 추가 후 `aggregated.totalTransferGain`(PDF·`:444`) 불변(비과세 자산 0 유지) — 기존 비과세 anchor 회귀 0.

> Pre-Do: A-0·A-1·A-3을 먼저 작성·실행(현행 RED: exemptGrossGain undefined·집계 0·감면 9,153,937) → 수정 → GREEN. 이미지 실측값이 anchor 소스.

---

## 7. 정책 준수 · 리스크

- `echo-field-pattern`: gross 양도차익을 `exemptGrossGain` optional echo 필드로 노출(엔진 세액 로직 불변·`transferGain:0` 유지·음수 가드). `feedback_engine_result_display_drift`: 컬럼 자기일관(산출−감면=결정, 전체=양도−취득−필요경비) 확보.
- **R-1 (E-2 회귀) — 해소됨**: `buildExemptEarlyResult`는 `transfer-tax.ts:275-276` 전액 비과세 경로 전용(실측). 고가주택 과세분은 `isExempt=false` → echo 분기 미적용, 회귀 없음. anchor A-5.
- **R-2 (echo blast radius) — 최소**: `transferGain:0` 불변이므로 `transfer-tax-aggregate.ts:444` `totalTransferGain`(PDF `ResultPdfDocument.tsx:323` 소비)·비과세 transferGain assert 테스트 10+개 **무영향**. `exemptGrossGain`은 신규 필드라 기존 소비처 없음. anchor A-7로 확인.
- **R-3 (버그②)**: 감면세액을 `refCalculatedTax−refDeterminedTax`로 바꿔도 합계 컬럼(`:236`)은 무변경이라 «합계 정확» 유지. 컬럼 합이 합계와 미세 불일치할 수 있으나(참고 컬럼 특성) 감면 ≤ 산출·자기일관이 우선.
- **R-4 (echo 계산 안전)**: `calcTransferGain(effectiveInput)`은 순수함수(`:273`, side-effect 없음)이며 비과세 조기반환 시점(`:283`)에 `effectiveInput` 준비 완료(STEP 0.x 통과). split/환산/감정/capex를 이미 처리하므로 gross가 정확. 단, `skipLossFloor` 없는 일반 호출이라 손실은 0 floor(비과세 자산 손실은 어차피 표시 0).
- **R-5 (F2) — 해소됨(Do 확인)**: `DetailedCalculationStatementCard`는 비과세 시 «전액 비과세 — 납부세액 0» 배너 + 값 0/N/A 명시(`:108-115`)로 표시하며 per-asset 양도차익 breakdown을 오표시하지 않음 → **추가 수정 불필요**.
- **R-6 (echo 누락 가드)**: 소비 측은 `result.exemptGrossGain ?? 0`으로 undefined 안전(구 이력·비-비과세). 엔진 세액·결정세액·합계 무변경 → 회귀 위험 낮음. 전체 양도세 회귀 스위트로 확인.

---

## 8. 완료 기준 (DoD)

- [ ] A-0~A-7 통과 (A-0·A-1·A-3 RED→GREEN 선확인)
- [ ] 집계 비과세 주택 컬럼 전체·비과세 양도차익 정상 표시(버그①)
- [ ] **단건** 비과세 신고서 전체·비과세 양도차익 + 취득가액 정상(F3, E-7)
- [ ] 농지 감면세액 ≤ 산출세액 + 산출−감면=결정 자기일관(버그②)
- [ ] `transferGain:0`·`totalTransferGain`·PDF·기존 비과세 anchor 무변경(회귀 0)
- [ ] `npx tsc --noEmit` 0 · 양도세 전체 회귀 통과
- [ ] E2E 또는 브라우저: 이미지 시나리오(집계) + 단건 비과세 재현 후 표 확인
