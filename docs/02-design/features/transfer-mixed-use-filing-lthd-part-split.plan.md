# 겸용주택 신고서 토지·건물 열 — 장기보유특별공제·보유분·거주분 분해 정밀화 계획서 v1.0

작성 2026-10-18 · 워크트리 `filing-lthd-split` · 브랜치 `plan/filing-mixed-lthd-part-split` · **기준 #2243**(겸용 통칙 95-0…1, 미머지 — 이 브랜치는 그 위에 쌓았다) · 선행 계획서 `transfer-mixed-use-lthd-circular-95-0-1.plan.md` Q-2

> **표기 규약** — 측정은 throwaway probe(`__tests__/_probe/filing.probe.test.ts`, 커밋하지 않음)로 했다. 엔진 → `mixedUseToFilingResult` → `buildRows`(화면·인쇄 신고서가 쓰는 함수)를 관통했다. 폼 데이터는 거주 「직접 입력」 모드다. 픽스처는 `mixedUseCase14()`(토지 1992-01-01)·30억·양도 2026-06-01·`makeMockRates()`이다. «정답»은 엔진과 같은 leaf(`calcLongTermRate`·`resolveAppurtenantLandLthdRate`·`applyFairMarketRatio`·`deriveSplitLthdEcho`)로 파트마다 따로 계산한 값이다. 각 케이스에서 파트 합이 엔진 합계(`proratedTaxableGain`·`longTermDeductionAmount`·상가 장특)와 같음을 확인했다.

> **📌 요약**
>
> - **세액은 바뀌지 않는다.** 신고서 표시만의 문제다.
> - **원인**: 엔진은 주택분·상가분의 토지·건물 장특을 **파트별 공제율로 따로 계산해 더하지만** 결과에는 합계만 싣는다(재산세제과-915 회신 방식일 때만 예외). 그래서 신고서(`FilingFormTableFinancials.ts` `fourPartFinancials` · `FilingFormTableHelpers.ts:565-597`)가 열 값을 다시 만든다. ① 장특·양도소득금액은 **양도차익 비율로** 토지·건물 열에 나누고, ② 보유분·거주분은 **건물 보유개월·거주개월로 다시 계산한 비율**(`splitLtDeduction`)로 나눈 뒤 다시 양도차익 비율로 나눈다.
> - **어긋남은 보유·거주분보다 넓다.** 토지·건물 공제율이 다르면 열별 장특·양도소득금액부터 틀린다. 상가분 열도 같다. 거주분 **합계 열**까지 틀리는 경우가 있다(아래 B: 35,423,601 vs 엔진 28,177,494).
> - **결정(사용자 2026-10-18)**: Q-1~Q-4 권고대로. 구현 기록 §7.
> - **방향**: 엔진이 파트별 과세 양도차익·공제율·공제액·보유분·거주분을 echo하고, 신고서는 그것을 그대로 읽는다. 일반 분리취득 경로(`split-2col`)가 이미 이렇게 한다(`FilingFormTableHelpers.ts:599-`).

---

## 1. 현행

### 1.1 신고서가 열 값을 만드는 방식

| 행 | 주택분 토지·건물 열 | 상가분 토지·건물 열 | 근거 |
|---|---|---|---|
| 과세대상 양도차익 | `floor((토지 차익 − 비사토) × 과세비율)` · `floor(건물 차익 × 과세비율)`. 과세비율 = `proratedTaxableGain ÷ (주택 차익 − 비사토)` | 차익 그대로 | `FilingFormTableFinancials.ts:63-79` |
| 장기보유특별공제 | `floor(주택 장특 합계 × 토지 차익 ÷ 주택 차익)` 등 | `floor(상가 장특 합계 × 토지 차익 ÷ 상가 차익)` 등 | 같은 파일 `:85-113` |
| 양도소득금액 | 같은 비율로 소득금액 합계를 나눔 | 같음 | `:97-117` |
| 보유 기간분 · 거주 기간분 | `splitLtDeduction(주택 장특 합계, 건물 보유개월, 거주개월, 표2)` → 그 결과를 다시 양도차익 비율로 나눔 | 장특 전부 보유분, 양도차익 비율로 나눔 | `FilingFormTableHelpers.ts:565-597`, `FilingFormTableDateHelpers.ts:100-120` |

예외 두 가지는 이미 엔진 값을 읽는다: 915 회신 방식(`highValueExcessRuling` echo), 나중 취득 토지 비과세 제외(`laterLandExemptExcluded` — 토지 장특 0).

### 1.2 엔진이 가진 값(내보내지 않는 것)

- 주택분: `buildHousingPart`가 `landDedRate`·`buildingDedRate`·`landDeductionAmount`·`buildingDeductionAmount`·파트별 과세 양도차익(`proratedLandGain`·`proratedBuildingGain`)을 계산한다(`transfer-tax-mixed-use-helpers.ts`). 결과에는 합계 `longTermDeductionAmount`와 대표 공제율(건물) `longTermDeductionRate`, 합계 보유·거주분 echo만 실린다.
- 상가분: `buildCommercialPart`가 `landDedRate`·`buildingDedRate`로 따로 계산하고 `landIncomeAmount`·`buildingIncomeAmount`를 이미 echo한다(`transfer-tax-mixed-use-helpers.ts:532-536`). 세율 파트(`transfer-tax-mixed-use-rate-parts.ts:25`)는 이 echo를 읽지만 신고서는 읽지 않는다.

---

## 2. 실측 (#2243 기준 엔진)

### 2.1 열별 장기보유특별공제 (정답 → 신고서)

| # | 조건 | 공제율(주택 토지/건물 · 상가 토지/건물) | 주택 토지 | 주택 건물 | 상가 토지 | 상가 건물 |
|---|---|---|---|---|---|---|
| A | 건물 2019·거주 7년·1주택 | 56/56 · 30/14 | 27,052,133 → 27,052,133 | 131,494,973 → 131,494,972 | **252,980,205 → 247,773,861** | **4,738,393 → 9,944,736** |
| B | 건물 2023·거주 3년·1주택 | 30(표1)/24 · 30/6 | **14,492,214 → 12,088,319** | **56,354,988 → 58,758,882** | **252,980,205 → 245,170,690** | **2,030,740 → 9,840,254** |
| C | 토지 2015·건물 2020·다주택(표1) | 22/12 · 22/12 | **51,125,240 → 31,851,610** | **135,550,631 → 154,824,260** | **185,518,817 → 182,264,852** | **4,061,480 → 7,315,444** |
| D | CASE14 원본·거주 10년(대조군) | 80/80 · 30/30 | 38,645,905 → 38,645,905 | 187,849,961 → 187,849,960 | 252,980,205 → 252,980,204 | 10,153,700 → 10,153,700 |

- 공제율이 같은 쌍(A 주택·D 전체)은 1원 이내로 맞는다(`floor`를 두 번 해 잔액이 흡수되지 않을 뿐). 공제율이 다른 쌍은 **수백만~1,900만 원** 어긋난다.
- 양도소득금액 열도 같은 크기로 어긋난다(C 주택 토지: 정답 181,262,216 → 신고서 200,535,845).
- 과세대상 양도차익 건물 열은 4건 모두 1원 작다(정답 234,812,452 → 234,812,451). 과세비율을 소수로 다시 곱하기 때문이다.

### 2.2 보유 기간분 · 거주 기간분 (주택분 토지/건물)

| # | 정답 보유분 | 신고서 보유분 | 정답 거주분 | 신고서 거주분 | 거주분 합계 열(신고서) vs 엔진 echo |
|---|---|---|---|---|---|
| A | 13,526,067 / 65,747,487 | 13,526,066 / 65,747,486 | 13,526,066 / 65,747,486 | 같음 | 79,273,553 vs 79,273,552 |
| B | **14,492,214 / 28,177,494** | 6,044,159 / 29,379,441 | **0 / 28,177,494** | 6,044,159 / 29,379,441 | **35,423,601 vs 28,177,494** |
| C | 51,125,240 / 135,550,631 | 31,851,610 / 154,824,260 | 0 / 0 | 0 / 0 | 0 vs 0 |
| D | 19,322,953 / 93,924,981 | 19,322,952 / 93,924,980 | 19,322,952 / 93,924,980 | 같음 | 113,247,933 vs 113,247,932 |

- B는 토지분이 표1(통칙 95-0…1)이라 토지 거주분이 0이어야 하는데 신고서는 6,044,159를 싣는다. 거주분 합계 열도 건물 보유 3년·거주 3년 비율(12% : 12%)로 주택 장특 합계 전체를 나눠 **7,246,107 과다**하다.
- 열 합과 합계 열이 1~2원 어긋난다(A: 보유분 열 합 336,992,149 vs 합계 336,992,151). 열마다 따로 `floor`하기 때문이다.

---

## 3. 수정 설계

### 3.1 엔진 echo (표시 전용 — 세액 불변)

`MixedUseHousingPart`·`MixedUseCommercialPart`에 같은 형태의 파트 echo를 추가한다(가칭 `partLthd`).

```ts
partLthd?: {
  land: MixedPartLthdEcho;
  building: MixedPartLthdEcho;
};
interface MixedPartLthdEcho {
  taxableGain: number;          // 장특을 곱한 과세 양도차익(주택분: 12억 안분 후 · 비사토 제외)
  longTermRate: number;
  longTermDeduction: number;
  holdingDeductionRate: number;
  residenceDeductionRate: number;
  holdingDeductionAmount: number;
  residenceDeductionAmount: number;
}
```

- 주택분: `buildHousingPart`의 파트 값을 그대로 싣는다. 보유·거주 분해는 일반 분리취득 경로와 같은 `deriveSplitLthdEcho`(정수 % 분해, `거주분 = floor(공제액 × 거주% ÷ 총%)`, 보유분 = 잔액)를 쓴다. 표2 승 토지분의 보유분 공제율은 #2243 규칙(표1 승이면 전부 보유분, 표2 승이면 건물 연수 보유분)을 따른다.
- 상가분: 표1이라 거주분 0. `taxableGain` = 차익(음수면 0), 장특은 이미 계산한 파트 값.
- 합계 보유·거주분 echo(`holdingDeductionAmount`·`residenceDeductionAmount`)는 **파트 합**으로 바꾼다(Q-2). 4개 실측 케이스에서는 현행 값과 원 단위까지 같았다(§2.2 정답 합 = 엔진 echo). 그러나 정수 % 분해와 현행 `applyRate(차익, 거주율)`은 규약이 달라 1원 차이가 날 수 있다 → Do에서 스캔한다.

### 3.2 신고서

- `fourPartFinancials`: `partLthd`가 있으면 과세대상 양도차익·장특·양도소득금액 열을 echo에서 읽는다. 주택분 토지 열에는 종전대로 비사토 몫(차익·장특·소득금액)을 더한다.
- `FilingFormTableHelpers.ts:565-597`: `partLthd`가 있으면 보유분·거주분 열을 echo에서 읽고, **합계 열 = 열 합**으로 만든다(1~2원 불일치 해소).
- 915 회신 방식·나중 취득 토지 분기는 `partLthd`가 같은 값을 담으므로 echo 우선으로 합친다. 종전 분기는 아래 fallback으로만 남는다.
- **fallback**: `partLthd`가 없는 결과(이력에 저장된 옛 `resultData`)는 종전 근사를 그대로 쓴다. 이력 화면이 옛 결과를 다시 그리므로 지울 수 없다.
- `FilingFormTableHelpers.ts`는 730줄이다. 늘어나는 분기는 `FilingFormTableFinancials.ts`(213줄)로 모아 Helpers가 700줄을 넘지 않게 한다.

### 3.3 영향 지점(확인)

- 신고서는 화면·인쇄 모두 `FilingFormTable` → `buildRows` 한 경로다(`fourpart`·`mixed-4col` 두 모드가 같은 코드).
- 다건(함께 양도) 신고서는 겸용을 파트 카드(자산별 열)로 그려 이 경로를 타지 않는다.
- 현재 겸용 신고서 열 값을 단언하는 테스트 파일(grep): `__tests__/components/mixed-use-filing-form-4col.anchor.test.tsx` · `mixed-use-later-land-exempt-display.anchor.test.tsx` · `mixed-use-high-value-row-oh61-oh17.anchor.test.tsx` · `mixed-use-burdened-gift-result.test.tsx` · `__tests__/tax-engine/transfer/mixed-use-appurtenant-excess-filing-form-f35.test.ts` · `__tests__/calc/one-house-dec-pr5/dec17-2b-high-value-excess-915-paths.anchor.test.ts` 외. **어느 단언이 바뀌는지는 Do에서 실측한다**(값이 바뀌는 것은 공제율이 다른 파트가 있는 픽스처뿐이어야 한다).

---

## 4. 검증 계획

- 신규 anchor: §2 A~D를 신고서 행까지 관통해 원 단위로 고정한다. 단언은 ① 열별 장특·소득금액·과세대상 양도차익 = 엔진 파트 echo, ② 보유분 + 거주분 = 열 장특, ③ 열 합 = 합계 열, ④ 합계 장특 = `result.longTermHoldingDeduction`.
- 비사토(배율 초과)·915 회신·나중 취득 토지·§154③ 본문(상가 주택 의제)·부담부증여 겸용 각 1건씩 신고서 행 항등식을 고정한다.
- 옛 결과 fallback: `partLthd`를 지운 결과로 종전 값이 그대로 나오는지 고정한다.
- 뮤테이션: echo 미사용(종전 근사로 되돌림)·비사토 몫 누락·합계 열을 열 합 대신 종전 식으로·보유/거주 분해 규약 교체.
- 범위 테스트(양도 엔진·결과 컴포넌트·calc) · tsc · lint.

---

## 5. 한계

| # | 내용 |
|---|---|
| L-1 | 상세명세서(`DetailedStatementLthdItems.ts:170-188`)의 주택분 장특 산식 문구는 «대표 연수 = 건물 보유연수» 한 줄이다. 토지·건물 공제율이 다르면 문구가 실제 공제율을 설명하지 못한다. 이번 범위 밖(Q-3) |
| L-2 | 겸용 주택분은 §104 세율 판정에서 한 파트(보유연수 = 토지·건물 중 짧은 쪽)로 취급된다(`transfer-tax-mixed-use-rate-parts.ts:32-38`). 세율 축이라 이 계획과 무관하며, 판정하지 않았다 |

---

## 6. 결정 필요

| Q | 질문 | 권고 → **결정(2026-10-18 사용자: 권고대로)** |
|---|---|---|
| Q-1 | 범위를 보유·거주분 행으로 한정할지, 같은 원인인 열별 장특·양도소득금액·과세대상 양도차익(주택·상가)까지 넓힐지 | **넓힌다.** 원인과 고칠 함수가 같고, 보유·거주분만 고치면 「보유분 + 거주분 ≠ 그 열 장특」이 된다 |
| Q-2 | 보유·거주 분해 규약 — 일반 분리취득 경로와 같은 정수 % 분해로 통일하고 합계 echo를 파트 합으로 바꿀지 | **통일한다.** 한 화면의 두 표가 같은 규약을 써야 한다. 1원 차이가 생기는 입력은 Do에서 스캔해 기록한다 |
| Q-3 | 상세명세서 주택분 장특 산식 문구(L-1)도 파트별로 풀어 쓸지 | **별건.** 금액은 이미 엔진 합계라 맞고 문구만의 문제다 → 2026-10-19 사용자 지시로 처리(§8) |
| Q-4 | #2243 머지 전에 진행할지 | **#2243 머지 후 rebase해서 진행한다.** 토지분 표1 승(B) 같은 사례가 #2243에서 생긴다 |

---

## 7. Do 기록 (2026-10-18)

| 지점 | 변경 |
|---|---|
| `lib/tax-engine/types/transfer-mixed-use.types.ts` | `MixedPartLthdEcho`·`MixedPartLthd` 추가. `MixedUseHousingPart.partLthd?`·`MixedUseCommercialPart.partLthd?` |
| `lib/tax-engine/transfer-tax-mixed-use-inheritance.ts` `buildHousingLthdEcho` | 파트마다 `deriveSplitLthdEcho`(일반 분리취득 경로와 같은 정수 % 분해)로 나누고 합계 보유·거주분 = 파트 합. 대표 율 echo도 정수 % 값(종전 double 뺄셈). 새 `mixedPartLthdEcho`(주택·상가 공용). 고아가 된 `applyRate` import 제거 |
| `lib/tax-engine/transfer-tax-mixed-use-helpers.ts` | 주택분: 파트 공제액을 넘겨 `partLthd`를 받는다. 상가분: 파트 공제액을 변수로 빼서 `landIncomeAmount`·`buildingIncomeAmount`와 `partLthd`가 같은 값을 쓴다. `exemptCommercialPartAsHouse`(OH-17)는 스프레드로 실려 온 상가 `partLthd`를 지운다(장특 0인데 낡은 값이 남는 것을 막음) |
| `components/calc/results/transfer/FilingFormTableFinancials.ts` | `fourPartFinancials`: `partLthd`가 있으면 주택분 과세대상 양도차익·장특·양도소득금액 열과 상가분 장특·양도소득금액 열을 echo에서 읽는다. 상가 소득금액 열 = 그 열 양도차익(음수 그대로) − 파트 장특. 새 `fourPartLthdSplitRows`: 보유·거주 기간분 열을 echo에서 읽고 합계 = 열 합. echo가 없으면 종전 근사(코드는 Helpers에서 옮김) |
| `components/calc/results/transfer/FilingFormTableHelpers.ts` | 보유·거주분 블록을 `fourPartLthdSplitRows` 호출로 대체(730 → 699줄) |

**계획 대비 변경**

- 계획서 §3.1의 «상가분 불변식 가드»는 넣었다가 뺐다. 상가 한쪽 차익이 음수면 가드가 돌려보내는 비율 근사가 토지 비율 > 1로 더 틀린 값을 냈다(뮤테이션 M-7이 살아남아 발견). 대신 상가 소득금액 열을 「열 양도차익 − 파트 장특」으로 계산해 열 합 = 상가 소득금액이 되게 했다(상가 합계가 음수라 0으로 막힌 경우만 예외).
- Q-2 1원 스캔: 6개 조합 × 400개 양도가액 = 2,400건 중 **77건(3.2%)**에서 합계 거주분이 종전 규약(`차익 × (총율 − 보유율)`, double 뺄셈)보다 1~2원 작다. 전부 공제율이 double 0.68(보유 36% + 거주 32%)인 조합(건물 2017·거주 8년)이었다. 예: 양도가액 2,387,487,543 → 종전 1,613,311 · 새 1,613,310.

**검증**

- 신규 `__tests__/components/mixed-use-filing-lthd-part-split.anchor.test.ts` 12건: §2 A~D 열 값(원 단위) · A~C 항등식(열 합 = 합계, 열마다 보유 + 거주 = 장특, 합계 장특 = 결과) · 옛 결과 fallback(§2 «신고서» 값 그대로) · 상가 건물 차익 음수 · OH-17(echo 삭제·상가 열 0) · 엔진 파트 합 = 합계.
- 기존 갱신 `mixed-use-appurtenant-excess-filing-form-f35.test.ts`: 상가 열 1원(열 합이 합계와 맞게 됨) 4건 · B-5 보유분 합계(종전엔 테스트가 폼 데이터 없이 그려 장특 전부를 보유분으로 표시 → 엔진 echo의 표2 거주분이 분리됨).
- 뮤테이션 8종 전부 KILLED.
- **사람의 브라우저 수동 확인은 하지 않았다.**

---

## 8. Q-3 처리 기록 (2026-10-19)

종전 상세명세서 주택분 장특 문구는 대표 연수·율(건물 기준) 한 줄이었다. 금액은 엔진 합계라 맞지만, 토지·건물 공제율이 다르면 산식이 그 금액을 설명하지 못했다(CASE14 · 30억 · 양도 2026-06-01 실측).

| 사례 | 종전 문구 | 문구대로 계산하면 | 실제 공제액 |
|---|---|---|---|
| B 건물 2023·거주 3년(토지분 통칙 표1 승) | 주택분 과세대상 양도차익 × 표2 [보유 3년 12% + 거주 3년 12%] | 283,119,834 × 24% = 67,948,760 | 70,847,202 |
| C 건물 2019·거주 0(표1) | 주택분 과세대상 양도차익 × 표1 [보유 7년 14%] | 283,119,834 × 14% = 39,636,776 | 47,365,957 |

| 지점 | 변경 |
|---|---|
| `MixedPartLthdEcho.holdingYears?` | 파트 자신의 보유연수 echo(표시 전용). `mixedPartLthdEcho`가 받는다 — 주택분은 `buildHousingLthdEcho`의 새 입력 `landHoldingYears`, 상가분은 `gainSplit`의 두 연수 |
| `DetailedStatementLthdItems.ts` 주택분 | `partLthd`가 있고 토지·건물의 총 공제율 또는 보유분 공제율이 다르면 주택분 장특·보유 기간분·거주 기간분 세 줄을 토지분·건물분으로 풀어 쓴다. 통칙 95-0…1이 적용됐으면(`appurtenantLthd`) 토지분 표1·표2 비교를 덧붙이고, 표가 섞이면 근거를 「표1·표2」로 적는다. 공제율이 같거나 echo가 없는 옛 결과는 종전 한 줄 그대로 |

- 보유·거주 기간분 줄은 «양도차익 × 율» 꼴로 쓰지 않고 율과 금액만 적는다. 분해가 정수 % 규약(거주분 절사·보유분 잔액)이라 곱셈으로 쓰면 1원이 어긋날 수 있다.
- #2247 이후·이 변경 전 저장된 결과는 파트 보유연수가 없다 → 토지분은 연수 없이 공제율만, 건물분은 대표 연수(건물 기준)로 적는다.
- **범위 밖(같은 결함 꼴)**: 상세명세서 상가분 장특 문구(`상가분 과세대상 양도차익 × 표1 [보유 max연수 율]`)와 결과 카드·계산 단계의 「장기보유공제 (표N, 건물 기준 율)」 라벨(`MixedUseCalculationSections.tsx:515`·`transfer-tax-mixed-use-steps.ts:278`)도 대표 율 하나다. 지시 범위가 주택분 상세명세서라 손대지 않았다.

**검증**

- 신규 `__tests__/components/mixed-use-statement-lthd-part-text.anchor.test.ts` 6건: B·C 문구 전문과 «차익 × 율 = 공제액» 손 계산 · D(통칙 동률 — 총 공제율 같고 분해만 다름) · A(공제율 같음 → 종전 한 줄) · 파트 연수 없는 결과 · echo 없는 옛 결과.
- 뮤테이션 7종 전부 KILLED(처음엔 «보유분 공제율 비교 제거»가 살아남아 D 사례를 추가했다).
- **사람의 브라우저 수동 확인은 하지 않았다.**
