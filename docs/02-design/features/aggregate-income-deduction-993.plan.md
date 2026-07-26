# 수정 계획서 — 다건(집계) 모드에서 §99의3 등 소득금액차감 감면 누락 (과다과세 + 표시 0)

**작성일**: 2026-07-27
**세목**: 양도소득세 — 다건 집계(`transfer-tax-aggregate.ts`)의 income-deduction 감면(§99의3·§99·§98의8·하이브리드 5년후)
**심각도**: 🔴 **계산 버그(과다과세)** — 표시 문제 아님

---

## 1. 증상 (probe 실측)

같은 §99의3 자산을 단건 vs 다건(집계, 1자산)으로 계산:

| | 단건 | 다건(집계) |
|---|---|---|
| 결정세액 | **37,934,000** | **77,150,000** |
| 과세표준 | 152,300,000 | 255,500,000 |
| §99의3 reducible 반영 | ✅ 103,200,000 차감 | ❌ 미반영 |
| per-asset income / incomeAfterOffset | — | 258,000,000 / 258,000,000 (미차감), reducibleIncome=0 |
| 농어촌특별세 | 산정됨 | **결과에 필드 없음(미산정)** |

- 다건 결정세액 77,150,000 = **감면 없음(reductions=[]) 케이스와 정확히 동일** → §99의3 완전 누락, 약 **39,216,000 과다과세**.
- 표시("소득금액 감면대상")가 0인 것은 표면 증상일 뿐, **엔진 계산 자체가 §99의3를 빠뜨림**.

## 2. 근본 원인 (실측 file:line)

`transfer-tax-aggregate.ts`:
- **`:153`** `const income = taxableGain - lthd;` — 자산별 income을 **§99의3 차감 前** 값으로 재계산. `pa.result`(단건, `skipBasicDeduction=true`)에는 §99의3가 이미 적용돼 있으나(`pa.result.taxBase` = §99의3 차감 후 income), 집계는 이를 무시하고 `taxableGain − lthd`만 사용.
- `income` → `offsetLosses`(`:157`) → `incomeAfterOffset`(`:250-254`) → 기본공제(`:179`)·group tax(`:199,201`)·general(`:208`) 전부의 base. 즉 §99의3 미차감 income이 세액 전 과정에 전파.
- **세액감면 경로(`reducibleByType`, `:242~303`)는 `r.result.reducibleIncome` 사용** — §99의3는 income-deduction이라 `reducibleIncome`을 세팅하지 않음(→0). 따라서 이 경로에도 안 걸림. **income 차감 경로·세액감면 경로 양쪽 모두 누락**.
- **농특세 미산정**: 집계는 finalize를 거치지 않고 자체 세액 계산(`:352,375`) — finalize STEP 7.5의 income-deduction 농특세 2-pass가 집계에 **없음**. 집계 결과 타입에 `ruralSurtax` 필드 부재(grep 확인).

## 3. 영향 범위 (전 income-deduction 감면)

같은 메커니즘으로 **모든 income-deduction 감면**이 다건 모드에서 누락:
- §99의3(`new993Detail.reducibleTransferIncome`) · §99(`new99Detail.reducibleTransferIncome`) · §98의8(`unsold988Detail.reducibleTransferIncome`) · 하이브리드 5년후(`effectCategory === "income_deduction"`, `reducibleTransferIncome`).
- 세액감면(§77·§69 등, `reducibleByType` 경로)은 정상 — 본 버그 무관.
- **단건 모드는 정상**(finalize STEP 4.6·7.5). 다건 전용 결함.

## 4. 설계 — 집계에 income-deduction 차감 + 농특세 2-pass

### 4-a. 자산별 income-deduction 차감액 추출 (헬퍼)

`pa.result`에서 적용된 income-deduction 감면의 `reducibleTransferIncome`을 뽑는 순수 헬퍼:
```ts
function incomeDeductionReducibleOf(r: TransferTaxResult): number {
  if (r.isExempt) return 0;
  // 전용 detail(§99의3·§99·§98의8) + 하이브리드(effectCategory === "income_deduction"만)
  const hybrids = [r.unsold987Detail, r.unsold992Detail, r.unsold983Detail, r.unsold985Detail,
    r.unsold986Detail, r.unsold982Detail, r.unsold984Detail, r.unsold98Detail]
    .find((d) => d?.isEligible && d.effectCategory === "income_deduction");
  return Math.max(0,
    r.new993Detail?.reducibleTransferIncome ??
    r.new99Detail?.reducibleTransferIncome ??
    r.unsold988Detail?.reducibleTransferIncome ??
    hybrids?.reducibleTransferIncome ?? 0);
}
```
- 필드 실측: `new993Detail`·`new99Detail`·`unsold988Detail` + 하이브리드 `unsold98X Detail`(`UnsoldHybridResult`, `effectCategory`·`reducibleTransferIncome` 보유) 전부 `transfer-result.types.ts:232-250`에 존재 확인.
- §127⑦ 택일이라 자산당 최대 1건 → `??` 체인으로 충분(합산 아님). `unsold989Detail`(Unsold989Result)은 effectCategory 없음 — Do 시 income-deduction 여부 확인 후 포함/제외.
- **대안(교차검증)**: `pa.result`가 `skipBasicDeduction=true`이므로 `(taxableGain − lthd) − pa.result.taxBase`로 역산 가능 — anchor로 두 방식 일치 확인.

### 4-b. 세액 계산용 "감면후 income" 분리 (표시 income 보존) — ⚠️ 정정된 핵심

**`income`(`:153`)·`incomeAfterOffset`는 pre-§99의3로 그대로 유지**한다. 이유(실측): 집계 DetailedStatement에서 **양도소득금액**(`incomeAmount`)·차손통산·농특세 "감면 前" 기준이 모두 `incomeAfterOffset`를 소스로 쓴다(`DetailedStatementHelpers.ts:542-543`). `:153`에서 직접 차감하면 **양도소득금액 표시까지 감면후 값으로 오염**("양도소득금액 − 감면대상 ≠ 감면후" 모순).

→ 세액 계산 경로에만 쓰는 **신규 배열** 도입:
```ts
const reducible = assetRecords.map((pa) => incomeDeductionReducibleOf(pa.result));
const taxableAfterReduction = incomeAfterOffset.map((v, i) => Math.max(0, v - reducible[i]));
```
그리고 **세액 계산 소비처만** `incomeAfterOffset` → `taxableAfterReduction`로 교체:
- 기본공제 배분 `eligibleForBasic`(`:179`) income·`income>0` 판정 → post-reduction(전액 제외 자산은 기본공제 대상 아님).
- `aggregateByGroup(assetRecords, taxableAfterReduction, allocatedBasic, rates)`(`:199-204`).
- `generalTaxBase = Σ taxableAfterReduction − totalBasicDeduction`(`:208-209`).
- `taxBaseShare = max(0, taxableAfterReduction[i] − allocatedBasic[i])`(`:434`).

**보존(무변경)**: `incomeAfterOffset` 자체(양도소득금액 표시·차손통산 입력·농특세 감면前 기준).

> ⚠️ **법령 순서(§102② 차손통산 vs §99의3 제외)**: 본 정정안은 **통산 後 제외**(통산은 pre-§99의3 income으로, 이후 과세단계에서 §99의3 제외). 단건 모드가 "income 확정 → STEP 4.6 차감" 순서라 이와 정합하고, 양도소득금액 표시도 보존됨. 통산 前 제외안은 양도소득금액 표시를 깨뜨림 → 부적합. **다자산+차손 동시 케이스만 값이 갈리므로 KoreanLaw/집행기준으로 최종 확인 후 anchor 고정**(1자산·무차손은 동일).
> **엣지**: `reducible[i] > incomeAfterOffset[i]`(큰 차손 흡수 후) → `max(0, …)` 클램프로 감면 일부 소실 가능 — 엣지 anchor로 고정.

### 4-c. 농특세 2-pass (집계) — taxableAfterReduction 분리로 단순화

§4-b의 두 배열로 자연스럽게 2-pass:
1. **감면 후 산출세액** = `taxableAfterReduction` 기반 파이프라인(group+general+비교과세) = 실제.
2. **감면 전 산출세액** = 동일 파이프라인을 `incomeAfterOffset`(감면 미차감)로 1회 더.
3. `농특세 = max(0, 감면 전 − 감면 후) × 20%`(농특세법 §3·§5). isExempt(§98의3·§98의5) echo 시 0.
4. 집계 결과 타입 `AggregateTransferResult`에 `ruralSurtax` 추가(현재 부재 — grep 0매치 확인) + `totalTax`(`:376`)에 가산. **지방소득세 base에는 미포함**(`localIncomeTax`는 결정세액+건물가산세만, 농특세 제외 — 단건과 동일, `:375`).
> group+general+비교과세 산출세액 계산부(`:198-234`)를 **함수 추출**해 두 배열로 2회 호출(중복·drift 방지). Do 시 단건 농특세와 1자산 parity 검증.

### 4-d. PerPropertyBreakdown echo + 표시 연동

- `PerPropertyBreakdown`에 `incomeDeductionReducible?: number` 추가, 자산 record 조립(`:455` 부근)에서 `reducible[idx]` 세팅. `taxBaseShare`(`:434`)도 §4-b대로 taxableAfterReduction 기준.
- **DetailedStatement**(`DetailedStatementHelpers.ts`):
  - `reductionTargetIncome2`(집계): 하드코딩 0 → `Σ p.incomeDeductionReducible`.
  - `incomeAmountAfter`(집계, `:607`): 현행 `Σ incomeAfterOffset` → **`Σ (incomeAfterOffset − incomeDeductionReducible)`**로 변경(= taxableAfterReduction 합, 감면후 소득금액).
  - `incomeAmount`(양도소득금액, `:542-543`): `Σ incomeAfterOffset` **무변경**(pre-§99의3).
  - 정합: 양도소득금액 − 소득금액 감면대상 = 감면후 소득금액.
- **FilingFormTableAggregateHelpers**(`:182,255`): `reductionTargetIncome2` 0 → `Σ incomeDeductionReducible`, `incomeAmountAfter`도 감면후로 정합.

## 5. 트레이드오프

| 옵션 | 내용 | 채택 |
|---|---|---|
| **A (권장)** | `incomeAfterOffset` 보존 + 세액용 `taxableAfterReduction` 분리(§4-b) + 농특세 2-pass(§4-c) + PerProperty echo·표시(§4-d) | 계산·표시(양도소득금액 pre 보존)·농특세 전부 정합. 전 income-deduction 조문 커버 | ✅ |
| A′ | `:153` income 직접 차감 | 세액은 맞으나 **양도소득금액 표시 오염**(모순) — 반려 | ✗ |
| B | 표시만 수정(reductionTargetIncome2 sum) | **과다과세 계산 버그 잔존** — 반려 | ✗ |
| C | 다건에 income-deduction 감면 있으면 차단(validation) | 정당한 시나리오 차단·회피 | ✗ |

- reducible 추출은 명시적 `incomeDeductionReducibleOf`(§4-a)를 단일 소스로. `pa.result.taxBase`(skipBasicDeduction) 역산은 **교차검증 anchor**로만.

## 6. 성공 기준 (verify — anchor)

1. **1자산 parity(강): 단건 == 다건(1자산)** — §99의3 자산 하나로 `calculateTransferTax` vs `calculateTransferTaxAggregate`의 `determinedTax`·`taxBase`·`localIncomeTax`·`ruralSurtax` **완전 일치**. probe 값: 단건 determined **37,934,000**(현 집계 77,150,000 → 37,934,000으로 정정).
2. **표시 정합(다건)**: 양도소득금액(= Σ incomeAfterOffset, pre) − 소득금액 감면대상(Σ reducible) = 감면후 소득금액(Σ taxableAfterReduction). 세 행 산술 일치.
3. **다자산 세액**: §99의3 자산 + 일반 자산 2건 → §99의3 자산 taxBaseShare가 reducible만큼 감소, 일반 자산 무영향.
4. **농특세**: 집계 `ruralSurtax` = 단건 농특세와 1자산 일치·`totalTax`·지방세 base 반영.
5. **회귀**: income-deduction 없는 다건(세액감면·NBL·중과·차손통산 조합) 결과 **무변화**(기존 aggregate 테스트 GREEN — incomeAfterOffset 보존이라 무영향 기대).
6. **차손통산 순서 anchor**: §99의3 자산 + 차손 자산 케이스로 확정값 고정(법령 확인 후) + `reducible > incomeAfterOffset` 클램프 엣지.
7. `npx tsc --noEmit` 0 · `npx vitest run __tests__/tax-engine/transfer-tax/` + aggregate 테스트 통과.

## 7. 리스크·확인 필요

- **차손통산 선후**(§4-b): 통산 後 제외(양도소득금액 표시 보존)로 구현. 다자산+차손 동시일 때만 값 영향 — KoreanLaw/집행기준 확인 후 anchor로 고정.
- **농특세 "감면 전 산출세액" 정의**(§4-c): 비교과세·중과와의 상호작용 — 단건 parity로 검증.
- 집계는 finalize 미경유라 STEP 7.5 로직을 **중복 구현** → 단건과 drift 위험. 공용 헬퍼 추출 검토(단, surgical 우선).

## 8. 관련 메모리·정책
- `feedback_numeric_impact_verify_before_bug_claim` ★★★ (probe 실측 완료)
- `feedback_engine_result_display_drift` ★★★ · `feedback_ui_engine_dual_truth_avoidance` ★★★
- `feedback_floor_residual_absorption` · `feedback_progressive_deduction_accuracy`
- 관련 완료 건: `detailed-statement-993-income-deduction.plan.md`(단건 표시 — 본 건의 다건 대응)
