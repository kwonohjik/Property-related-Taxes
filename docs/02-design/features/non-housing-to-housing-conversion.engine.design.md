# 비주택 → 주택 용도변경 양도 — 엔진 설계

> 계획서: [`non-housing-to-housing-conversion.plan.md`](non-housing-to-housing-conversion.plan.md) v3
> **정본 구분**: 엔진 구현 세부(타입·알고리즘·전파 경로)는 **이 문서가 정본**, 범위·케이스 매트릭스·Phase는 **plan이 정본**. 구현 중 변경은 **양쪽 동시 갱신**.
> 세목 양도소득세 · 진입 `assetKind === "housing"` (primary 자산 한정)
> ⚠️ 행 번호 앵커는 **Phase A-0 선분리 이후 무효** — A-0 verify에서 재실측·갱신한다.
> **v2 (2026-08-04)** — STEP 6 검토 29건 반영. 변경점 말미.

## Context

주택이 아닌 건물(오피스텔·근린생활시설 등)을 취득해 보유 중 **건물 전부**를 주거용으로 전환한 뒤 양도하는 케이스.

| 항목 | 근거 | 게이트 | Phase |
|---|---|---|---|
| R-1 LTHD 혼합 산식 | 「소득세법」 §95⑤·⑥ | 양도일 ≥ 2025-01-01 (부칙 제19933호 제7조) | A·B |
| R-2 비과세 보유기간 기산 | 「소득세법 시행령」 §154⑤ 단서 | 양도일 ≥ 2024-03-01 (대통령령 제34265호) | C |
| R-3 거주요건 판정 시점 | 서면-2020-부동산-5098 [부동산납세과-1247] | **원문 확보 — 착수 가능** | D |

**Phase 대응**: 헬퍼(§계산 알고리즘 1·2)·게이트 상수·법령 상수 = **A** / R-1 분기 + echo 전파 = **B** / R-2 = **C** / R-3 = **D** / 거주 클램프(API 계층) = **E**

---

## ★ 케이스 인벤토리

`I-*`는 **엔진이 직접 분기**하는 케이스다. 폼·validation 차단 케이스(plan C-8·C-9·C-14·C-16·C-18~C-21·C-24·C-26)는 엔진에 도달하지 않는다.

| # | 조건 | LTHD 보유공제율 | LTHD 거주공제율 | 비과세 보유기산 | plan | 법령 | anchor 출처 | 테스트 | 상태 |
|---|---|---|---|---|---|---|---|---|---|
| **I-1** | `nonHousingToHousingConversion === undefined` | 현행 `rateForYears` | 현행 | `acquisitionDate` | C-1 | — | 기존 회귀 | 기존 전건 | ☑ |
| **I-2** | 활성 · 2024-03-01 ≤ 양도일 < 2025-01-01 | 현행 | 현행 | **주거용 사용일** | C-2 | §154⑤ | (미발견) | anchor.test | ☐ |
| **I-3** | 활성 · 양도일 < 2024-03-01 | 현행 | 현행 | `acquisitionDate` | C-2 | 부칙 | (미발견) | anchor.test | ☐ |
| **I-4** | 활성 · ≥ 2025-01-01 · 표2 대상 · **`!splitDetail`** | **`calcConversionHoldingRate`** | 아래 §거주공제율 | 주거용 사용일 | C-3 | §95⑤ | **PDF 537p** | anchor.test | ☐ |
| ↳ I-4a | 비주택 기간 < 3년 | `0 + 표2(주택)` | 〃 | 〃 | C-6 | §95②표1 | (미발견) | anchor.test | ☐ |
| ↳ I-4b | 주택 기간 < 3년 | `표1(비주택) + 0` | 〃 | 〃 | C-5 | §95②표2 | (미발견) | anchor.test | ☐ |
| ↳ I-4c | 표1+표2 > 40% | **`min(합, 40%)`** | 〃 | 〃 | C-7 | §95⑤1호 단서 | (미발견) | anchor.test | ☐ |
| **I-5** | 활성 · ≥ 2025-01-01 · **표2 대상 아님** | 현행 표1 (취득일~양도일 전기간) | 0 | 주거용 사용일 | C-4 | §95④ | (미발견) | anchor.test | ☐ |
| **I-9** | 활성 · 미등기(L-0) 또는 중과(L-1) | **0** | 0 | **해당 없음**(비과세 경로 무관) | C-22 | §95②본문괄호 | (미발견) | anchor.test | ☐ |
| **I-10** | 활성 · 주거용 사용일 기준 보유 < 2년 | (LTHD 정상) | 〃 | → **비과세 불가** | C-11 | §154⑤ | (미발견) | anchor.test | ☐ |
| **I-11** | 활성 · 취득시 조정 · 용도변경시 비조정 | 〃 | 〃 | 거주요건 **미적용** | C-12 | 서면-2020-5098 | **PDF 534p** | anchor.test | ☐ |
| **I-12** | 활성 · 취득시 비조정 · 용도변경시 조정 | 〃 | 〃 | 거주요건 **적용** (회신 일반명제 포섭) | C-13 | 〃 | (미발견) | anchor.test | ☐ |
| **I-13** | 활성 · 공동소유 지분 | 지분 안분과 직교 | 〃 | 〃 | C-25 | — | (미발견) | anchor.test | ☐ |
| **I-14** | 활성 · 고가주택 12억 초과 | 12억 안분 **후** 적용 | 〃 | 〃 | C-15 | §95③ | **PDF 537p** | anchor.test | ☐ |
| **I-15** | 활성 · **`splitDetail` 있음**(토지/건물 분리) | **§95⑤ 미적용** — 현행 split 경로 | 현행 | 주거용 사용일 | C-19 | — | (미발견) | anchor.test | ☐ |
| **I-16** | 활성 · **거주 클램프 후 거주 < 2년** | (LTHD 정상) | 클램프된 값 | → **비과세 탈락** | **C-10c** | ⚠️명문없음(R-G) | (미발견) | anchor.test | ☐ |
| **I-17** | 활성 · 혼합 공제율이 **홀수 0.02 배수 조합** | 분수 정수 연산 필수 | 〃 | 〃 | — | §95⑤ | probe | anchor.test | ☐ |

**anchor 케이스 = I-4 ∩ I-11 ∩ I-14** (PDF 사례 30). I-4a~c는 I-4의 **산술 결과**이지 독립 분기가 아니다(한 함수가 셋을 모두 낸다).

---

## 법령 근거

| 조문 | 내용 | 검증 |
|---|---|---|
| 「소득세법」 §95⑤1호 | 비주택 기간 표1 + 주택 기간 표2 보유공제율, **40% 상한** | ✅ KoreanLaw |
| 「소득세법」 §95⑤2호 | 거주공제율 = **주택으로 보유한 기간 중** 거주한 기간 표2 | ✅ |
| 「소득세법」 §95⑥ | 주택 보유기간은 **사실상 주거용 사용일**부터(불분명 시 공부상 용도변경일) | ✅ |
| 「소득세법」 부칙 제19933호 제1조 3호·제7조 | §95⑤·⑥은 **2025-01-01 이후 양도분** | ✅ |
| 「소득세법 시행령」 §154⑤ 단서 | 비과세 보유기간 = 주거용 사용일 ~ 양도일 | ✅ |
| 「소득세법 시행령」 §154⑥ | 거주기간 = 전입일 ~ 전출일 (**주택기간 제한 없음**) | ✅ |
| 대통령령 제34265호 (2024-02-29 공포) | §154⑤ 단서 **2024-03-01 시행** | ✅ 이분 탐색 |
| 서면-2020-부동산-5098 [부동산납세과-1247] | 「거주요건은 **주택 취득시점을 기준으로 판단**하는 것으로 … 조정대상지역에서 해제된 후 주택으로 용도변경하여 양도한 경우 **「소득세법 시행령」 제154조제1항의 거주요건을 적용하지 않는 것**입니다」 | ✅ **원문 확보** (2026-08-04) |
| 「소득세법 시행령」 §159의4 | §95⑤의 "대통령령으로 정하는 1세대 1주택" = 1주택(의제 포함) + **보유기간 중 거주 2년 이상** → 현행 게이트와 1:1 대응 | ✅ 본문 확인 |
| §95⑤ 하 표2 거주 "(보유기간 3년 이상 한정)"의 지시 대상 | 총 보유기간 vs 주택 보유기간 | 🔶 **미확인 (V-4)** — §159의4의 "보유기간"이 총 보유기간인 점이 잠정 근거 |

**법령 상수** — `legal-codes/transfer.ts`에 기존 표기 규칙(조·항 사이 공백)으로 추가하고 **문자열 리터럴 사용 금지**:

```ts
LONG_TERM_DEDUCTION_CONVERSION:       "소득세법 §95 ⑤",   // sub-step legalBasis 분기용
LONG_TERM_DEDUCTION_CONVERSION_BASIS: "소득세법 §95 ⑥",   // 기산일
ONE_HOUSE_CONVERSION_HOLDING:         "소득세법 시행령 §154 ⑤",
```

**manifest 등록 불요** — §95는 조 단위 기커버(`verifier-manifest.ts:35·99`), 시행령은 커버리지 기제 대상 밖(plan R-J).

---

## 엔진 input 타입 (Phase A)

`lib/tax-engine/types/transfer.types.ts` — `TransferTaxInput`에 optional 추가.

```ts
/** 비주택 → 주택 용도변경 (「소득세법」 §95⑤·⑥ · 「소득세법 시행령」 §154⑤ 단서). undefined = I-1. */
nonHousingToHousingConversion?: {
  /** 사실상 주거용으로 사용한 날. 불분명 시 공부상 용도변경일(§95⑥ 단서). */
  residentialUseStartDate: Date;
  /** §95⑤2호·D-6 클램프로 잘려나간 거주 개월. ⚠️ API 변환 계층에서 산출. */
  residenceMonthsTrimmed: number;
};
```

**판정 입력 타입 확장 (선행)** — `transfer-tax-exemption.ts:119-131` `ResidenceReqInput` Pick에 `"nonHousingToHousingConversion"` 추가. `ExemptionReqInput`(:142)·`DeemedOneHouseReqInput`(:153)은 교집합 파생이라 **자동 전파**.

---

## 엔진 result 타입 (Phase B)

```ts
/** §95⑤·⑥ 적용 내역 echo — 미적용 시 undefined. 계산 로직 불변(echo-field-pattern). */
usageConversionDetail?: {
  /** ⚠️ Date 아님 — IndexedDB resultData JSON 왕복 후 깨진다.
   *  엔진 echo 조립부에서 format(d, "yyyy-MM-dd") (date-fns)로 변환. */
  residentialUseStartDate: string;   // §9.2 안내 문구
  nonHousingYears: number;           // §9.2 산식
  housingYears: number;              // §9.2 산식
  table1Pct: number;                 // 정수 % (8 = 8%)
  table2HoldingPct: number;          // 정수 %
  residencePct: number;              // 정수 %
  holdingRateCapped: boolean;        // 40% 상한 발동
  residenceMonthsTrimmed: number;    // > 0 → §9.2 절사 안내
};
```

> **필드는 UI 소비처가 있는 것만 남겼다** — v1의 `exemptionHoldingStartDate`·`regulatedJudgmentDate`·`residenceMonthsClamped`는 소비처가 없어 제거(후자는 `input.residencePeriodMonths`의 파생 중복).
> **공제율을 정수 %로 노출**하는 이유는 아래 §분수 정수 연산 참조.

### ★ 전파 6지점 — 하나라도 빠지면 화면에 안 뜬다

선례 `rental97LthdDetail`(역시 `calcLongTermHoldingDeduction`이 낳는 echo)의 실측 경로를 그대로 따른다.

| # | 지점 | 파일 | 선례 |
|---|---|---|---|
| ⓐ | **`LongTermHoldingResult`에 필드 추가** | `transfer-tax-helpers.ts:428-436` (⚠️ **비-export private interface**) | `rental97LthdDetail?` `:433` |
| ⓑ | `calcLongTermHoldingDeduction` 각 return | 동상 | |
| ⓒ | **`transfer-tax.ts:428` 구조분해 목록** | `let { deduction, rate, holdingPeriod, rental97LthdDetail, exclusionReason } = …` | 5개만 분해 중 |
| ⓓ | **`transfer-tax.ts:654` result 조립** | | |
| ⓔ | `TransferTaxResult` 타입 | `transfer-result.types.ts:215` 부근 | `:370` |
| ⓕ~ⓖ | Pick 목록 + pick 함수 | ⚠️ **`TransferReductionDetailSource` / `pickReductionDetails`(`aggregate.ts:93-110`)** — `rental97LthdDetail`이 이쪽을 쓴다(`aggregate.ts:98`). LTHD 축이므로 정합 | |

> ⓐ 없이 의사코드대로 return하면 **컴파일 에러**, ⓒⓓ 없으면 값이 result에 실리지 않아 §9.2 결과 카드·§9.3 문구 분기가 **전부 동작 불가**다.
> `pickValuationDetails`(`aggregate.ts:52-68`)는 **13필드**이며 이번 echo의 대상이 아니다.

**기존 `lthdStartDate`는 `acquisitionDate` 유지** — §95⑤에는 단일 기산일이 없다. UI는 `usageConversionDetail` 존재로 분기.

---

## 계산 알고리즘

### 헬퍼 1 — 기간 분해 (Phase A · 정본 위임)

`calcUsagePeriodInfo`(`transfer-tax-mixed-use-period-split.ts:58-84`)가 이미 동일 산식 + C-8·C-9 방어(`changeMs <= acqMs || changeMs >= transferMs → null`, `:67`)를 한다.

**추출 방법 (구체)**: 신규 leaf `lib/tax-engine/usage-period-info.ts`로 **`:37-84`(인터페이스 `UsagePeriodInfo` + 함수)를 이동**한다. 본체는 `calculateHoldingPeriod`만 쓰므로 leaf 조건을 만족하고 **클라이언트 import도 안전**하다(UI 미리보기가 직접 쓴다 — 이것이 추출의 유일한 목적).

- `transfer-tax-mixed-use-period-split.ts`는 `import type { UsagePeriodInfo }`(남는 `applyUsagePeriodSplit`(`:106`)이 파라미터로 쓴다) + **`export { calcUsagePeriodInfo } from "./usage-period-info";` re-export**
- ⇒ 기존 import 2곳(`transfer-tax-mixed-use.ts:45` · `__tests__/…/mixed-use-usage-period-split.test.ts:11`)은 **값만** 참조하므로 **무변경**(Surgical). `UsagePeriodInfo` 타입의 외부 importer는 **0건 확인** — period-split.ts에서 타입 재export 불요

검증(date-fns probe): `2018-02-10 ~ 2022-11-25` = **4년** / `2022-11-25 ~ 2026-01-27` = **3년**

### 헬퍼 2 — 공제율 (Phase A · **정본 위임 — 신규 추출 없음**)

🔴 **v1의 `table1Rate`/`table2HoldingRate`/`table2ResidenceRate` 신설은 취소한다.** 정본이 이미 있다:

```ts
// transfer-tax-mixed-use-inheritance.ts:26-47 (exported leaf — applyRate + 타입만 import)
export function calcLongTermRate(
  holdingYears: number, residenceYears: number, useTable2: boolean, lthdExcluded = false,
): number {
  if (lthdExcluded) return 0;
  if (holdingYears < 3) return 0;            // ← 3년 가드 내장
  if (useTable2) return Math.min(holdingYears*0.04, 0.40) + Math.min(residenceYears*0.04, 0.40);
  return Math.min(holdingYears*0.02, 0.30);
}
```

`rateForYears`(`transfer-tax-helpers.ts:536-547`)와 **완전 동일 로직** + `lthdExcluded` 파라미터. 호출부 **13곳**, `transfer-tax-mixed-use-helpers.ts:404`가 re-export, 테스트 보유(`audit-fixes.anchor.test.ts:110-124`), 클라이언트 import 실증. `transfer-tax-helpers.ts`가 import해도 **순환 없음**.

⇒ **3년 가드가 함수에 내장이라 plan R-D(가드 소실 회귀) 위험이 원천 소멸**한다. 호출부 가드 불필요.

**G-8 흡수 (정본 위임)** — 같은 규칙의 사본 3벌을 `calcLongTermRate`로 치환:
- `transfer-tax-helpers.ts:496-501`(L-1b 부수토지) → `calcLongTermRate(primaryHoldingYears, residenceYears, isOneHouseSingleForCompanion && table2ResidenceYears >= 2)`. 외곽 `:483` `if (ctx.holdingMonths < 36) return`이 `holdingYears < 3`과 등가라 안전
- `transfer-tax-helpers.ts:599`(splitDetail NBL 파트) → `calcLongTermRate(nb.holdingYears, 0, false)`
- ⚠️ **두 위임 모두 `lthdExcluded` 생략(기본 `false`)** — L-0(`:447`)이 미등기를 이미 return하므로 불필요하다. mixed-use 호출부(`:508`·`:534`)가 `isUnregistered`를 넘기는 것을 흉내내지 말 것
- `DetailedStatementHelpers.ts:453-454`(UI) — §9.3에서 처리
- (`rateForYears` 자체도 `calcLongTermRate` 위임으로 대체 가능 — 동작 완전 동일. **Phase A 선택 작업**)

> ⚠️ **plan R-H**: `transfer-rate-seed.ts:45-57`에 `ratePerYear` 시딩이 있는데 `rateForYears`·`calcLongTermRate` 모두 `rules`를 쓰지 않는다(`helpers.ts:441` 인자 dead). 정본 위임이 이 드리프트를 **고착**시킨다 — 별건 정리 대상.

### ★ 분수 정수 연산 (Phase A·B — **필수**)

🔴 **소수 rate 합산이 1원 오차를 낸다 — 이번 기능이 새로 만드는 결함이다.**

probe: 비주택 3년(6%) + 주택 4년(16%) = `0.22`, 거주 3년 = `0.12` → **`0.22 + 0.12 = 0.33999999999999997`** → `applyRate(178_540_000, …)` = **60,703,599** (정확값 **60,703,600**). 전 조합 스캔 **17,576건 중 78건**이 1원 과소이며 문제 rate는 `0.28·0.34·0.38·0.66·0.68·0.70`.

**현행 표2 경로는 두 항이 모두 0.04 배수라 이 값이 나오지 않는다**(21개 조합 전부 정확 — 실측). §95⑤이 표1(0.02 배수) + 표2(0.04 배수)를 합치면서 **홀수 0.02 배수**가 새로 생기며 발생한다. anchor 32%(`0.08+0.12+0.12`)는 우연히 정확해 **anchor로는 잡히지 않는다** → I-17 경계 테스트 필수.

⇒ §95⑤ 경로는 **공제율을 정수 %로 유지**하고 `applyRateFraction`(`tax-utils.ts:181`)으로 적용한다. 법문이 **"100분의 N"**이므로 분수 정수 연산이 문언에도 부합한다(memory `feedback_applyrate_fractional_rate_one_won_error`).

```ts
/** §95⑤1호 — 보유기간 공제율(정수 %). 40% 상한은 합산 후(§95⑤1호 단서). */
export function calcConversionHoldingPct(nonHousingYears: number, housingYears: number): {
  table1Pct: number; table2HoldingPct: number; holdingPct: number; capped: boolean;
} {
  // Math.round는 소수 rate → 정수 분자 변환용 (applyFairMarketRatio 선례와 동일 — "세법은 floor" 위반 아님)
  const table1Pct       = Math.round(calcLongTermRate(nonHousingYears, 0, false) * 100); // I-4a 가드 내장
  const table2HoldingPct = Math.round(calcLongTermRate(housingYears, 0, true)  * 100);   // I-4b 가드 내장
  const raw = table1Pct + table2HoldingPct;
  return { table1Pct, table2HoldingPct, holdingPct: Math.min(raw, 40), capped: raw > 40 }; // I-4c
}
```

### 게이트 상수 (Phase A)

⚠️ **위치는 `lib/tax-engine/tax-utils.ts`**(397줄)다. `transfer-tax-helpers.ts`에 두면 `transfer-tax-exemption.ts`(R-2)가 import해야 하는데 **helpers → exemption 단방향**(`helpers.ts:26`)이라 순환이 된다. `tax-utils.ts`는 **helpers·exemption(`:14`) 양쪽이 이미 import**해 순환이 없다.

> ~~`legal-codes/transfer.ts`~~ — **부적합**: `Date` export 선례 **0건**(법령 조문 문자열 전용 모듈)이고 **856줄로 이미 800 hard cap 초과**다. 그 파일에는 **법령 상수 3종만** 추가한다.

```ts
/** §95⑤·⑥ 적용 개시 — 부칙 제19933호 제7조. 값은 공익수용 AMENDED_2025_TRANSFER_CUTOFF와
 *  같으나 근거가 무관하므로 별도 선언한다. */
export const LTHD_CONVERSION_95_5_CUTOFF = new Date("2025-01-01T00:00:00");
/** 「소득세법 시행령」 §154⑤ 단서 시행 — 대통령령 제34265호. */
export const CONVERSION_EXEMPTION_CUTOFF = new Date("2024-03-01T00:00:00");
```

> 🔴 `new Date("2025-01-01")`은 **UTC 파싱**이라 KST 로컬 자정 Date와 비교하면 **당일 양도가 게이트에서 누락**된다. 반드시 `"T00:00:00"`.

### R-1 — LTHD 혼합 분기 (Phase B)

**삽입 위치: `transfer-tax-helpers.ts:533`(`table2ResidenceYears` 산출) 직후, `rateForYears` 정의(`:536`) 직전.** 그보다 앞이면 `isOneHouseSingle`(`:529`)·`residenceYears`(`:531`)·`table2ResidenceYears`(`:533`)가 아직 없다.

L-0(미등기 `:447`)·L-0a(`:452`·`:456` — presale_right·승계입주권 **2개**)·L-1(중과 `:460`)·L-1b(`:469`)·L-1c(`:512`)는 그보다 앞에서 return하므로 **I-9는 자동 배제**된다. **L-1c 조합은 validation(C-18)이 차단하고, L-1b는 구조적으로 성립 불가**(plan D-8 보충 — `propertyType === "land"` 요구 vs 토글은 `housing` 전용).

```ts
if (input.nonHousingToHousingConversion
    && input.transferDate >= LTHD_CONVERSION_95_5_CUTOFF
    && isOneHouseSingle && table2ResidenceYears >= 2
    && !splitDetail) {                                          // ← I-15 (엔진측 이중 방어)

  const conv = input.nonHousingToHousingConversion;
  const info = calcUsagePeriodInfo(input.acquisitionDate, conv.residentialUseStartDate, input.transferDate);
  // 구조적 위반은 throw — 시그니처는 (code, message, details?) 실측(aggregate.ts:288)
  // ⚠️ transfer-tax-helpers.ts:22는 TaxRateNotFoundError만 import → TaxCalculationError 추가 필요
  if (!info) throw new TaxCalculationError(
    "INVALID_CONVERSION_DATE",
    "용도변경일이 취득일 이후·양도일 이전이어야 합니다 (「소득세법」 제95조 제6항)");

  const { table1Pct, table2HoldingPct, holdingPct, capped } =
    calcConversionHoldingPct(info.t1HoldingYears, info.t2HoldingYears);

  // 거주공제율 — V-4 미해소: 총 보유기간 ≥ 3년이면 지급(명문 부재 시 유리 적용)
  const totalYears  = calculateHoldingPeriod(input.acquisitionDate, input.transferDate).years;
  const residencePct = totalYears < 3 ? 0 : Math.min(residenceYears * 4, 40);

  const totalPct = holdingPct + residencePct;
  return {
    deduction: applyRateFraction(taxableGain, totalPct, 100),   // ← 분수 정수 연산
    rate: totalPct / 100,                                        // 표시용
    holdingPeriod: calculateHoldingPeriod(input.acquisitionDate, input.transferDate),  // 총 보유기간
    usageConversionDetail: {
      residentialUseStartDate: format(conv.residentialUseStartDate, "yyyy-MM-dd"),
      nonHousingYears: info.t1HoldingYears,
      housingYears: info.t2HoldingYears,
      table1Pct, table2HoldingPct, residencePct,
      holdingRateCapped: capped,
      residenceMonthsTrimmed: conv.residenceMonthsTrimmed,
    },
  };
}
```

> **`holdingPeriod`는 총 보유기간**이다 — `transfer-tax-lthd-steps.ts:84`(sub-step 표시)과 산식 문구가 소비하므로 분해 기간을 넣으면 표시가 왜곡된다.
> **적용 순서 불변**: 12억 안분(`transfer-tax.ts:390` STEP 3) → taxableGain 확정 → LTHD(`:424` STEP 4) — I-14.

### R-2 — 비과세 보유기간 기산 (Phase C)

`resolveExemptionHoldingStartDate`(`transfer-tax-exemption.ts:334-344`)에 기존 §154⑧3호 backdate와 **병렬** 분기:

```ts
if (input.nonHousingToHousingConversion
    && input.transferDate >= CONVERSION_EXEMPTION_CUTOFF) {
  return input.nonHousingToHousingConversion.residentialUseStartDate;   // I-2·I-4
}
// 기존 §154⑧3호 (상속 동일세대 backdate) — 동시 성립 조합은 C-21로 validate 차단
return input.acquisitionDate;                                          // I-1·I-3
```

이 값이 `meetsOneHouseHoldingResidence`(`:349`)의 보유 판정에 들어가 **I-10**을 만든다.

### R-3 — 거주요건 판정 시점 (Phase D)

`resolveWasRegulatedAtAcquisition`(`:241-249`)의 `input.acquisitionDate` 고정을 **판정 기준일 인자**로. 호출부가 `nonHousingToHousingConversion?.residentialUseStartDate ?? acquisitionDate`를 넘긴다.

**호출부 3곳이 같은 기준일을 봐야 한다** (memory `feedback_shared_predicate_argument_parity`): `transfer-tax-exemption.ts:308`(엔진) · `transfer-tax-api-residence.ts:12-48` `buildResidenceReqInput` → `Step4.tsx:86`(UI 안내) · `Step4.tsx:440-448` 수동 토글(fallback의 실질 입력값).

### 거주기간 클램프 (Phase E — API 변환 계층)

엔진 input `residencePeriodMonths`는 **스칼라**다(`transfer-tax-api.ts:358`이 `deriveResidencePeriodMonths()`로 배열을 접는다). 배열이 살아 있는 유일한 지점에서 클램프한다.

**신규 헬퍼는 `deriveResidencePeriodMonths`와 같은 소스에 둔다** — 별도 파일에 만들면 UI/엔진 인자 불일치가 생긴다.

```ts
// lib/stores/calc-wizard-asset-residence.ts (deriveResidencePeriodMonths 옆)
export function clampResidenceToHousingPeriod(
  primary: { residenceInputMode; residencePeriods; residencePeriodMonthsAsset },
  transferDate: string, formFallbackMonths: string,
  residentialUseStartDate: string | undefined,
): { months: number; trimmed: number };
// interval 모드 + 구간 有: 각 구간을 max(moveInDate, residentialUseStartDate)로 재계산, trimmed = 원합 − 클램프합
// direct 모드: 클램프 불가(스칼라) → { months: 원값, trimmed: 0 } (C-10b — UI 안내로 처리)
```

`transfer-tax-api.ts:358`이 이를 호출한다. **Step4 안내 메시지가 같은 값을 보는지는 §9.1b와 함께 결정**(plan §13).

> `resolveExemptionResidenceMonths`(`transfer-tax-exemption.ts:282`)는 `consolidateResidenceMonths(input.residencePeriodMonths, input)` **순수 pass-through**라 클램프가 자동 전파된다. **개조 금지**(이중 클램프).
> blast radius **확인만**: 표2 대상 판정 3지점 — `transfer-tax.ts:432` · `transfer-tax-helpers.ts:492` · `:533`.
>
> **I-16 판정 경로**: 클램프된 `residencePeriodMonths`가 `meetsOneHouseResidenceRequirement`(`transfer-tax-exemption.ts:294~`)의 2년 판정에 그대로 들어가 비과세 탈락을 만든다 (I-10의 보유 판정 `meetsOneHouseHoldingResidence:349`와 대응).

---

## Silent fallback / 자동 안분 후보

| 후보 | 판정 | 근거 |
|---|---|---|
| 주거용 사용 개시일 미입력 → 취득일 대체 | ❌ **금지** | 용도변경 없음과 구분 불가 → C-16 차단 |
| 주거용 사용 개시일 ≤ 취득일 시 무시 | ❌ **금지** → **`TaxCalculationError` throw** | C-8이 폼 경로를 막지만 **엔진 단독 호출**(단위 테스트·`transfer-tax-aggregate.ts`의 자산별 직접 호출)은 validate를 거치지 않는다. 선례 `transfer-tax-split-gain.ts:130·326·402` |
| `direct` 모드 거주기간 비율 안분 | ❌ **금지** | 자동 안분 fallback 금지. UI 안내로만 (C-10b) |
| `splitDetail` 있을 때 §95⑤ 미적용 | ✅ **엔진 가드**(`!splitDetail`) | validation(C-19)과 이중 방어 — I-15 |
| V-4 미해소 상태의 거주공제율 | ✅ **총 보유기간 기준(유리)** | 명문 부재 = default 유리 (memory `feedback_no_unfavorable_application_without_legal_basis`) |
| D-6 비과세 거주요건 클램프 | ⚠️ **적용하되 불리** | 명문 없음. 사용자 재확인 후 유지 — plan R-G. **I-16 테스트로 고정 필수** |

---

## 테스트 약속

`__tests__/tax-engine/transfer/non-housing-to-housing-conversion.anchor.test.ts`
**fixture**: `baseTransferInput(overrides)` + `makeMockRates()` (`__tests__/tax-engine/_helpers/mock-rates.ts`) — 선례 `commercial-building-97-2-swap.anchor.test.ts:20-46`

| 케이스 | 단언 |
|---|---|
| **anchor (I-4∩I-11∩I-14)** | 장특 `57,132,800` · 양도소득금액 `121,407,200` · 산출세액 `26,177,520` · 지방소득세 `2,617,752` |
| 〃 echo | `nonHousingYears=4` · `housingYears=3` · `table1Pct=8` · `table2HoldingPct=12` · `residencePct=12` · `holdingRateCapped=false` |
| **I-17** (분수 정수 연산) | 비주택 3년·주택 4년·거주 3년 → 34% → 장특 **60,703,600** (소수 연산이면 60,703,599) |
| I-4a | 비주택 2년·주택 4년 → `0 + 16% = 16%` |
| I-4b | 비주택 5년·주택 2년 → `10% + 0 = 10%` (거주분 별도 — V-4) |
| I-4c | 비주택 15년·주택 10년 → `min(30+40, 40) = 40%` · `holdingRateCapped=true` |
| I-2·I-3 경계 | 양도일 `2024-02-29` / `2024-03-01` → R-2 미적용 / 적용 |
| I-4 경계 | 양도일 `2024-12-31` / `2025-01-01` → R-1 미적용 / 적용 |
| I-5 | 1세대1주택 아님 → 표1 전기간 |
| I-9 | 미등기 → LTHD 0 |
| I-10 | 주거용 사용일 기준 보유 1년 11개월 → `isExempt === false` |
| **I-16** (D-6) | 클램프 후 거주 23개월 → **비과세 탈락** |
| I-11·I-12 | 조정대상지역 판정 기준일 전환 |
| I-13 | 지분 50% → 공제율 동일, 세액만 안분 |
| I-15 | `splitDetail` 있음 → §95⑤ 미적용 |
| 다자산 전파 | `__tests__/api/transfer.route.bundled-swallows-special.test.ts` — echo가 일괄 결과에 실림 |

**anchor 주석**: PDF 533p 지문의 거주 "2년 11개월"은 536p 화면 입력(3년)·537p 계산(12%)과 어긋나며 역산(32% = 20% + 12%)으로 **3년 확정**. 지문 오기 — 재논쟁 금지.

**Phase A·B verify**는 `npm run test:transfer`(`package.json:14`)로 돌린다.

---

## UI 통합 위임

[`non-housing-to-housing-conversion.ui.design.md`](non-housing-to-housing-conversion.ui.design.md)로 위임. 엔진 계약:

| 항목 | 계약 |
|---|---|
| 입력 | `nonHousingToHousingConversion` — **④ API 변환이 생성 게이트**(토글 ON AND 날짜 유효) |
| 거주 클램프 | **API 변환 계층 책임**(`clampResidenceToHousingPeriod`) — 엔진은 클램프된 스칼라만 받는다 |
| 출력 | `usageConversionDetail` (전 필드 string/number — Date 없음, **공제율은 정수 %**) |
| 미리보기 공유 | `calcUsagePeriodInfo`(신규 leaf) · `calcConversionHoldingPct`를 **UI가 직접 import**(재구현 금지) |
| 노출 조건 | primary 자산(index 0) · `assetKind === "housing"` — Step4가 `assets[0]` 전용이므로 |
| sub-step 라벨 | `"보유 기간분 장특"`·`"거주 기간분 장특"` **유지**(신고서·상세명세서가 라벨로 소비). 🔴 **문구·`legalBasis`뿐 아니라 「금액 산출식」도 교체**해야 한다 — 아래 §표시 계층 |
| 다자산 | primary만 활성(C-26)이므로 자산별 분기 불요 — 전파 ⓕⓖ로 충분 |

---

## ★ 표시 계층 — 본 step 산식 + sub-step 금액 (Phase G)

🔴 **§95⑤ 케이스에서도 `isOneHouseSpecial`(`transfer-tax-lthd-steps.ts:52-56`)이 참**이므로, 표시 코드가 총 보유기간 기준 표2를 그대로 렌더한다. 문구만이 아니라 **금액이 틀린다.**

| 대상 | 현행 동작 (anchor 기준) | 조치 |
|---|---|---|
| **`transfer-tax-lthd-steps.ts:57-65` `lthdFormulaRate`** | `hPart = min(holdingPeriod.years*4, 40)` = **28%**, `rPart = 12%` → `"보유 7년×4%=28% + 거주 3년×4%=12% = 32%"`. **28+12=40 ≠ 32**로 인쇄된 합계와 자기모순 | §95⑤ 분기 시 echo의 `table1Pct`/`table2HoldingPct`/`residencePct`로 문자열 재구성: `"비주택 4년×표1=8% + 주택 3년×표2=12% (보유 20%) + 거주 3년×표2=12% = 32%"` |
| **`transfer-tax-lthd-steps.ts:71-79`** | 위 문자열 사용 | 동상 |
| **`transfer-tax-lthd-steps.ts:81-107` sub-step 금액** | `:84-85` `hPart=28`·`rPart=12` → `:90` `residenceAmt = floor(deduction × 12/40)` = **30%** 배분. §95⑤ 정확 배분은 보유 20 : 거주 12 → **12/32 = 37.5%** ⇒ 신고서 「보유/거주 기간분 장특」 **행 금액이 어긋난다**(합계는 보존) | §95⑤ 분기 시 **`hPart = table1Pct + table2HoldingPct`(=20), `rPart = residencePct`(=12)로 치환** |
| `transfer-tax-lthd-steps.ts:96`·`:103` `legalBasis` | `TRANSFER.LONG_TERM_DEDUCTION`(`"소득세법 §95 ②"`) — `DetailedStatementHelpers.ts:523`·`:535`가 그대로 인쇄 | `TRANSFER.LONG_TERM_DEDUCTION_CONVERSION`(`"소득세법 §95 ⑤"`)로 분기 |

**Phase G verify**: anchor 케이스에서 「보유 기간분 장특」·「거주 기간분 장특」 **금액**을 단언한다 — 보유분 `floor(57,132,800 × 20/32)` = **35,708,000**, 거주분 = `57,132,800 − 35,708,000` = **21,424,800**.

---

## v2 변경점 (STEP 6 검토 29건)

- 🔴 **`calcLongTermRate` 정본 위임** — `table1Rate`/`table2HoldingRate`/`table2ResidenceRate` 신설 취소. 3년 가드가 함수 내장이라 **plan R-D 회귀 위험 소멸**
- 🔴 **분수 정수 연산** — 소수 rate 합산의 1원 오차(78/17,576 조합) probe 실증. `applyRateFraction` + 정수 % 유지. I-17 경계 테스트
- 🔴 **전파 3지점 → 6지점** — `LongTermHoldingResult`(비-export) · `transfer-tax.ts:428` 구조분해 · `:783` 조립 추가. Pick 함수는 `pickReductionDetails`(`rental97LthdDetail` 선례)
- 게이트 상수 위치를 **`legal-codes/transfer.ts`**로 (helpers→exemption 단방향 순환 회피) + §95⑤ 전용 이름
- **I-15**(splitDetail) 신설 + 엔진 가드 `!splitDetail` · **I-16**(C-10c) · **I-17**(분수) 신설
- 인벤토리에 템플릿 필수 컬럼 4개(법령·anchor 출처·테스트·상태) 추가, I-4a~c를 하위 행으로
- 삽입 위치를 **`:533` 직후**로 정정(변수 선언 후)
- `calcUsagePeriodInfo` 추출 방법 구체화(신규 파일명·타입 동반·re-export로 기존 import 무변경)
- 클램프 헬퍼 시그니처·배치 확정(`calc-wizard-asset-residence.ts`)
- **`TaxCalculationError` 경로 추가** — 엔진 단독 호출은 validate를 거치지 않는다
- 법령 상수명 3개 확정(문자열 리터럴 금지) · plan R-H 각주 · L-1b 서술 정정 · L-0a 2개 · 13필드 정정 · echo 필드 10→8 정리 · fixture 명시 · 정본 구분·Phase 대응 명기
