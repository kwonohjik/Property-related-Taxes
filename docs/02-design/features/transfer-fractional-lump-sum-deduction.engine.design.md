# 지분 모드 개산공제 — 엔진 설계 (rev.1)

> 계획서: `transfer-fractional-lump-sum-deduction.plan.md` (rev.2)
> 대상: `tax-utils.ts` · `types/transfer.types.ts` + 계획서 §4.1의 12파일 26지점
> 검증 원칙: file:line·수치는 실측. 미확인은 "확인 필요".

---

## 1. Context

공유지분 자산에서 개산공제(소득령 §163⑥)가 **물건 전체 기준시가**에 3%를 곱해 산출된다.
같은 필요경비 산식의 다른 항인 환산취득가액은 `transferPrice`를 통해 지분 스케일이므로,
§97②2호 가목이 규정한 **합계액**의 두 항이 서로 다른 스케일이 된다.

기준시가 입력 자체는 **물건 전체(100%)로 유지**해야 한다 — 환산 상쇄·§166⑥ 안분 비율·감면 차분 비율이
모두 100%를 전제한다(계획서 §3·§6.5). 따라서 **개산공제 계산 지점에만** 지분율을 적용한다.

---

## 2. 엔진 input / result 타입

### 2.1 input (`types/transfer.types.ts`)

```ts
/**
 * 공유지분율 (0 < r ≤ 1, 기본 1). **개산공제 base 축소 전용**.
 *
 * 기준시가·면적은 물건 전체 값을 유지한다 — 환산 산식에서 분자·분모로 함께 나타나 상쇄되고,
 * §166⑥ 안분 비율(`landStd / total`)과 감면 차분 비율도 100% 스케일을 전제한다.
 * API 변환이 `getOwnershipRatio(asset)`로 파생해 전달한다(엔진 재판정 없음).
 */
ownershipRatio?: number;
```

**서브엔진 7종에도 동일 필드 추가**(계획서 §6.3) — `TransferTaxInput` 하나로는 도달하지 않는다.
전부 grep 실측한 이름·위치다:

| 타입 | 위치 |
|---|---|
| `PreHousingDisclosureInput` | `types/transfer-phd.types.ts:21` |
| `GeneralBuildingInput` | `general-building-valuation.ts` (export) |
| `RedevLandContribInput` | `redevelopment-land-contribution.ts:60` |
| `RedevHousingContribReceiveEstimatedInput` | `redevelopment-housing-contribution.ts:30` |
| `CommercialBuildingValuationInput` | `types/commercial-building.types.ts:15` |
| `MixedUseAssetInput` | `types/transfer-mixed-use.types.ts:45` |
| **`MultiParcelInput`** | `multi-parcel-transfer.ts:160` ⟵ rev.1 누락 |

### 2.2 result — **echo 필드 신설** (표시 drift 차단)

```ts
/** 개산공제 base로 실제 사용된 **지분 기준시가** (= floor(물건 기준시가 × 지분율)). */
lumpSumDeductionBase?: number;
```

계획서 §8.1의 9+ 표시 지점이 「기준시가 × 3%」 산식을 출력하므로, 100% 값을 그대로 쓰면
**표시 산식이 표시 값을 만들지 못한다**(`feedback_engine_result_display_drift`).
UI가 지분율로 재계산하면 dual-truth이므로 **엔진이 echo**한다.

- 대상 result 타입(실측): `SplitPartResult`(`types/transfer-split-gain.types.ts:33`) ·
  `TransferTaxResult`(필드는 `estimatedDeduction`) · `CommercialBuildingValuationResult` ·
  `GeneralBuildingOutput` · `RedevLandContribResult`(`redevelopment-land-contribution.ts:23`) ·
  `RedevHousingContribReceiveEstimatedResult`(`redevelopment-housing-contribution.ts:55`).
- **`DetailedStatementFormulaBuilders.ts:679-684`의 자기일치 판정**(`baseExp === floor(stdAcq × 0.03)`)은
  이 echo 또는 `necessaryExpenseMode`로 대체한다 — UI가 §163⑥ 산식을 재구현하는 것 자체가 dual-truth다.

---

## 3. 알고리즘

### E1. 공용 헬퍼 — 기존 함수 흡수·이동

`computeEstimatedDeduction`(`burdened-gift-apportionment.ts:164`)을 `tax-utils.ts`로 이동하고
파라미터를 확장한다. **신규 함수 생성 금지**(같은 §163⑥ 개념 함수 2개 = dual-truth).

```ts
export function computeEstimatedDeduction(
  standardPriceAtAcq: number,   // 물건 전체(100%) 취득시 기준시가
  rate: number,                 // 3/100 · 미등기 3/1000
  ownershipRatio = 1,
): number {
  return applyRate(applyRatio(standardPriceAtAcq, ownershipRatio), rate);
}
```

- 파라미터명 `assetAcquisitionPrice`는 **오칭**이었다(실제 base는 기준시가) — 이때 정정.
- `applyRatio` = `Math.floor(amount × ratio)`는 현재 `lib/calc/transfer-tax-api-helpers.ts:369-371`에 있다.
  엔진이 `lib/calc/`를 import하는 선례는 5건 존재하나(`gift-simultaneous.ts:26` 등 상속·증여 경로),
  **`applyRatio`는 `tax-utils.ts`로 이동**하고 `transfer-tax-api-helpers.ts`가 재수출한다 —
  3줄 순수 정수 헬퍼라 이동 비용이 없고, 엔진·API 변환이 **같은 절사 규약**을 쓰는 것이
  이 작업의 전제(§6.4 floor 순서 통일)이므로 단일 소스가 필수다.

### E2. **잔액 흡수** — 파트 쌍이 있는 모든 지점 (최중요)

파트별로 각각 지분율을 적용하면 §163⑥2호가목 항등성이 깨진다. 실측 10만건:

| 방식 | 「토지분 + 건물분 = 라목총액 × 3%」 위반 | 최대 편차 |
|---|---|---|
| 파트별 독립 | 50,831 / 100,000 (**50.8%**) | −2원 |
| **잔액 흡수** | **0 / 100,000** | 0 (건물분 음수 0건) |

```
wholeDed    = computeEstimatedDeduction(전체 기준시가, rate, ratio)
landDed     = computeEstimatedDeduction(landStd,       rate, ratio)
buildingDed = wholeDed − landDed          // 별도 floor 금지
```

PR #841의 H10 anchor(`split-acq-std-price-independent.test.ts` — 라목 총액 × 3% 불변식)를
지분 자산에서 스스로 무너뜨리지 않기 위한 필수 조치다(`feedback_floor_residual_absorption`).

**적용 대상**: B1·B2(split) · C1·C2(PHD) · C3(겸용 4부분 — 마지막 1곳 흡수) · D1~D4(겸용 상가·주택 각 쌍) ·
F1·F2 · F3~F5 · G1~G3.

**E1·E2(상가) — 총액 1곳만 교체**: `commercial-building-valuation.ts:306-309`가 **이미 잔액 흡수 구조**다
(`estimatedDeductionBuilding = estimatedDeductionTotal − estimatedDeductionLand`).
총액(`:302`)에만 지분을 적용하면 파트 분리는 자동으로 정합한다.

**미적용 — A1~A3·I1** (근거 실측 확정):
- A1~A3: 단일 값. `:350` `calcNecessaryExpense` 단일 합류점이라 쌍이 없다.
- **I1(다필지)**: 필지 간 항등식이 **존재하지 않는다**. `multi-parcel-transfer.ts`에 개산공제 합계
  심볼(`estimatedDeductionTotal` 등)이 **없고**(grep 0건), 각 필지의 `estimatedDeduction`(`:421`)은
  그 필지 자신의 `transferGain`에만 참여한다(`:127` 주석 "양도차익 = allocatedTransferPrice −
  acquisitionPrice − estimatedDeduction − expenses"). 필지별 독립 적용이 정본.
  ⚠️ STEP 6 검토에서 "합계가 실재한다"는 반대 주장이 있었으나 **실측으로 반증**됨 — 재제기 방지용 기록.

### E3. floor 순서 — 지분 먼저

```
floor(floor(std × ratio) × rate)     ← 채택 (A)
```

- 중간값 `floor(std × ratio)` = **지분 기준시가**가 result echo 대상(§2.2)이므로 필요하다.
- `applyRatio`가 전 엔진의 지분 적용 규약이라 일관.
- ⚠️ 단일 floor(C) 대비 **0.96%에서 1원 작다**(불리 방향). 법령 미규정 영역의 정책 선택이며
  **A 채택 확정**(2026-07-28 사용자 확인, 계획서 §12) — 이 엔진 전체의 정수 절사 규약과 일관.

### E4. 무변경 확정 (회귀 0 대상)

| 항목 | 사유 |
|---|---|
| 기준시가 입력(`standardPriceAtAcquisition` 등) | 100% 유지 — 환산 상쇄·안분 비율·감면 차분 비율 |
| 환산취득가액 산식 | `transferPrice` 선형이라 이미 정확 |
| §166⑥ 안분 비율 `calcAcqStdPair`/`calcApportionRatio` | 양쪽 100%로 일관 |
| 실거래가 모드 | 개산공제 0 — 미도달 |
| 상속·증여 §163⑨ (`splitDeemedExpense` 분기) | 개산공제 미적용 경로 |
| 부담부증여 `burdened-gift-apportionment.ts:171` | 경로 전체 지분 미인지 → 범위 밖 |
| 주식 `stock-transfer-tax.ts:478` | 지분율 개념 부재 |

---

## 4. 케이스 인벤토리

계획서 §7 F1~F17을 정본으로 한다. 엔진 관점 요약:

| 구조 | 지점 | 잔액 흡수 | echo |
|---|---|---|---|
| **합류점 1회** (단일 값) | A1~A3 — `:350` `calcNecessaryExpense` | 불요 | `lumpSumDeductionBase` |
| **루프 내 독립** | I1 — 필지별, 필지 간 항등식 없음 | **불요**(§3 E2 실측) | 필지별 각각 |
| **파트 쌍** | B · D · F · G | **필수** | 파트별 각각 |
| **총액 1회 + 기존 흡수** | E1·E2(상가) | 기존 구조 유지 | 총액 |
| **4부분** | C3 | **필수**(마지막 1곳) | 4부분 각각 |

**anchor 기대값은 산식으로 고정** — 「전체 ÷ 2」는 floor 이중 적용으로 0.48%에서 이탈한다.

---

## 5. 14 동기화 지점

계획서 §8 정본. 엔진 측 요점:

| # | 작업 |
|---|---|
| ⑫ | **2곳** — `propertyBaseShape` + `companionAssetSchema`(`transfer-tax-schema-sub.ts:456`) |
| ⑭ | **2곳** — `route.ts` + `multi/route.ts:101-124` |
| ⑦ | result echo 신설(§2.2) + **엔진 내장 문자열 2곳**(`redevelopment.ts:260,412` `rationale`) |

---

## 6. Silent fallback 판정표

| 위치 | 동작 | 판정 |
|---|---|---|
| `ownershipRatio` 미전달 | 기본값 1 → 종전 동작 | **차단** — 단독소유(ratio=1)와 배관 누락이 구분되지 않아 조용히 틀린다. primary만이 아니라 **companion · multi route · 서브엔진 7종 각각**에 도달 anchor가 필요하다(§7) |
| 서브엔진 타입에 필드 미추가 | 지분 미적용 | **차단** — P2b에서 타입 도달을 먼저 확인 |
| 잔액 흡수 누락 | 항등성 −1~−2원 | **차단** — F8b anchor |
| 사이드바 floor 순서 상이 | 0.49% 1원 차 | **차단** — ⑥에서 A로 통일 |

---

## 7. 테스트 약속

- **Pre-Do anchor (P0)**: F1(환산 50%) · F4(swap 판정) · F6(단독 무변경) · **F8b(항등성)** — 현행 실패 확인.
- **신규**: F2·F3·F7(미등기) · F9b(겸용 PHD 4부분) · F10b(겸용 주택분) · F12b(증축분) · F13b(재개발 인가전) · F16(다필지) · F14(companion).
- **회귀 가드**: F5(사례 27 — 실거래가라 무변경) · F17(상속·증여 §163⑨ 미적용 경로).
- **⑫⑬⑭ 배관**: `ownershipRatio` 전송·도달 anchor (companion·multi route 포함).
- **F16(다필지)**: 필지별 독립 적용 — 필지 간 합계 불변식을 **단언하지 않는다**(존재하지 않음).
- **완료 조건 grep — 의미 기반**(계획서 §4 서두의 실패 교훈): 문자 패턴(`, 0.03)` 등)은
  `? 0.003 : 0.03)`·`* rate` 형태를 놓친다. **`estimatedDeduction|LumpDeduction|AppraisalDed` 대입 지점**을
  훑어 헬퍼 미경유가 0건인지 확인한다.
  ⚠️ `acquisition-tax-rate.ts:61`은 **취득세 세율**이라 오탐 — 제외.
- **경로별 도달 anchor**: primary · companion(`companionAssetSchema`) · multi route · 서브엔진 7종 각각.

---

## 8. UI 통합 위임

→ `transfer-fractional-lump-sum-deduction.ui.design.md`
