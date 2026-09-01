# 양도소득세 × 조세특례제한법 감면·과세특례 — 코드 리뷰 2026-08-31

> 대상: `origin/master` `f437f4b9` · worktree `review/transfer-reduction`  
> 방법: 다중 에이전트 리뷰 — 정찰 2 + 탐지 12차원 + 결함별 적대적 반증(critical·high는 3렌즈) + 누락점검 2  
> 규모: 189 에이전트 · 27.4M 토큰 · 5,742 tool use

## 집계

| 구분 | 건수 |
|---|---|
| 제기 | 111 |
| 적대적 반증으로 기각 | 12 |
| 확정(원시) | 99 |
| 중복 병합 | −14 |
| **고유 확정** | **85** |

**심각도**: 🔴 Critical 3 · 🟠 High 22 · 🟡 Medium 37 · ⚪ Low 23

**유형**: legal-accuracy 40 · wiring 16 · display 8 · citation 8 · arithmetic 6 · reachability 6 · test-gap 1

---


# 🔴 Critical (3건)

## [D3-01] §99의3 양도시 기준시가 미입력 시 분모 음수 → 「전액 감면」 오분류

- **위치**: `lib/tax-engine/transfer-reductions/new-99-3.ts:432`
- **조문**: 조특법 §99의3① · 조특령 §99의3②2호
- **유형**: legal-accuracy · **차원**: §99·§99의2·§99의3 신축 · **검증**: 생존 3/3

**결함**

결함은 성립한다. 다만 세 곳을 정정·보강한다.

① 「자산-수준 standardPriceAtTransfer도 실지거래가액 모드에서는 필수가 아니다」 → 더 강하게: 실지거래가액(actual)·감정·매매사례 모드에서는 ④ 변환이 그 값을 **전송 자체를 하지 않는다**(`lib/calc/transfer-tax-api.ts:416-425` 최종 `: undefined`, `lib/calc/multi-transfer-tax-api.ts:156` `isEstimated ? … : undefined`). 따라서 「사용자가 선택 필드를 비웠고 자산 카드도 비었을 때」라는 우연한 조합이 아니라, **환산 모드가 아닌 모든 §99의3 5년 후 양도가 기본값으로 이 경로를 탄다**. New993InputForm.tsx:302의 hint("미입력 시 자산의 양도시 기준시가 사용")는 그 모드에서 사실과 다르다.

② 「조용한 오분류」가 아니라 **틀린 법적 근거가 붙은 오분류**다. `new-99-3.ts:474-479`가 formulaStep에 "분자 양수·분모 음수 — 부동산-525(2010.4.7.) 해석으로 양도소득금액 전체 감면"을 싣고, 분모 스텝은 "0 − 200,000,000 = −200,000,000"을 그대로 표시한다. 결과 화면이 미입력을 예규 사안으로 제시한다.

③ 세액 영향 서술 보정: 양도소득세 산출세액은 215,010,000 과소가 맞으나 「결정세액 0」은 정확하지 않다 — §99의3 경로는 감면세액의 20%를 농특세로 과세하므로(`New993Result.ruralSurtax`) 전액감면 시 농특세가 오히려 증액되어 순 국세 손실은 215,010,000보다 작다. 양도소득세 자체가 0으로 붕괴한다는 핵심은 유지된다.

④ 형제 가드는 §99 하나가 아니라 넷이다: `new-99.ts:257-263` · `unsold-98-8.ts:291-295` · `unsold-hybrid.ts:265-273` · `new-99-4.ts:96`. §99의3만 예외다.

⑤ 법령상 허용되는 유일한 대체값은 조특령 §99의3② 본문 단서의 「직전의 기준시가」이며 0이 아니다 — 따라서 처방은 자동 대입이 아니라 형제와 동일한 MISSING_STD_PRICE 차단(+⑧ validate 동기화)이어야 한다.

**근거**

`new-99-3.ts:431-432` 원문: `const numerator = input.standardPriceAt5Years - input.standardPriceAtAcquisition;` / `const denominator = input.standardPriceAtTransfer - input.standardPriceAtAcquisition;` → `calcSignedAllocation`(:338-344) `if (numerator > 0 && denominator < 0) { return { ratio: 1, signCase: "pos_neg", reducibleIncome: Math.max(0, transferIncome) }; }`. 형제 조문 `new-99.ts:257-263`은 같은 자리에서 `if (stdAtAcq <= 0 || stdAtTransfer <= 0 || (needs5Y && stdAt5Y <= 0)) { return ineligible([{ code: "MISSING_STD_PRICE", ... }]) }`로 차단한다. 입력 경로: `components/calc/transfer/New993InputForm.tsx:297` 원문 `label="양도시 기준시가 (선택)"` + `hint="미입력 시 자산의 양도시 기준시가 사용"`, 그리고 라우터 `income-deduction-router.ts:203-204` `(r993.standardPriceAtTransfer993 as number|undefined) ?? ctx.standardPriceAtTransfer ?? 0`. 자산-수준 `standardPriceAtTransfer`도 실지거래가액 모드에서는 필수가 아니다(`lib/calc/transfer-tax-validate-asset.ts:479-484` — `if (isEstimated && !hasPre1990 && !usesPhd)` 조건부). ⑧ `transfer-tax-validate-reductions.ts:118-152`의 new_99_3 블록에는 `standardPriceAtTransfer993` 검사가 없다(파일 전체 grep 결과 해당 키 0건). 실측(tsx probe, 무수정 소스 직접 import): transferIncome 800,000,000 · 취득시 200,000,000 · 5년시점 300,000,000 · 양도시 0 → `signCase="pos_neg", reducibleTransferIncome=800000000, ratio=1`; 같은 입력에 양도시 600,000,000을 넣으면 `all_positive, 200000000, 0.25`.

**실패 시나리오**

입력: §99의3 선택 · 계약일 2002-01-10 · 취득일 2003-06-30 · 양도일 2024-06-30(5년 후) · 양도소득금액 800,000,000 · 취득시 기준시가 200,000,000 · 5년시점 300,000,000 · 「양도시 기준시가(선택)」 공란(실제 6억) → 현재 출력: 감면대상 양도소득금액 800,000,000(전액), 과세표준 0, 산출세액 0. 올바른 출력: 조특령 §99의3②2호 안분 (300,000,000−200,000,000)/(600,000,000−200,000,000)=0.25 → 감면대상 200,000,000, 과세표준 597,500,000(기본공제 2,500,000 가정), 산출세액 215,010,000(42%·누진공제 35,940,000).

**세액 영향**: 위 시나리오 기준 산출세액 215,010,000원 과소(지방소득세 21,501,000원 추가 과소). 일반적으로 양도소득금액 전액이 차감되므로 결정세액 0으로 붕괴.

**처방**

`new-99-3.ts` STEP 3의 5년 후 분기 진입 전에 `new-99.ts:257-263`과 동일한 `MISSING_STD_PRICE` 가드(`standardPriceAtAcquisition <= 0 || standardPriceAtTransfer <= 0 || standardPriceAt5Years <= 0`)를 두고, ⑧ `transfer-tax-validate-reductions.ts`의 new_99_3 블록에도 「양도시 기준시가(자산-수준 fallback 포함)」 필수 검증을 추가한다(⑤ 라벨의 「(선택)」도 함께 정정).

---

## [D7-01] §77 공익수용 감면율 상향(15/20/35/45)을 2025-01-01부터 적용 — 실제 시행일은 2026-01-01

- **위치**: `lib/tax-engine/public-expropriation-reduction.ts:32`
- **조문**: 조특법 §77①
- **유형**: legal-accuracy · **차원**: §69·§70·§77·§77의2·§77의3 · **검증**: 생존 2/3

**결함**

주장은 성립하나 **범위가 과소 기술**돼 있다. 정정판:

**(A) 원 주장 — 확정.** `public-expropriation-reduction.ts:32` `AMENDED_2025_TRANSFER_CUTOFF = 2025-01-01`이 틀렸다. 조특법 §77① 15/20/35/45는 **법률 제21223호(공포 2025-12-23), 조문시행일 2026-01-01**부터다(MCP MST 280409). 2025년 전 기간의 정본은 **10/15/30/40**(MST 267555, 조문시행일 2025-01-01). 코드 주석의 「2025.3.14 개정」은 두 실측본 어디에도 대응하지 않는다. 경계는 **2026-01-01**이어야 한다.

**(B) 누락된 동종 결함 — 같은 파일, 더 큰 금액.** `getInvoluntaryTransferLimits(:24-30)`가 `transferYear >= 2025`에 `{annual: 2억, fiveYear: 3억}`을 반환하고 :22 주석이 이를 「§133② … 2025.3.14 개정」이라 적었다. 실측: **§133②는 2026-01-01 시행본에서 신설**됐고, 2025-01-01 시행본에서는 §77·§77의2·§77의3이 **§133①**에 들어 있어 **연 1억 / 5년 2억**이다. 따라서 2025년 양도분의 한도도 2배로 열려 있다(probe: `appliedAnnualLimit = 200,000,000`). 이 팩토리는 §77 외에 **§77의2**(`replacement-land-reduction.ts:83`)·**§77의3**(`gb-designated-land-reduction.ts:127`)도 소비하므로 영향 조문이 3개다. 감면세액이 1억을 넘는 사안에서는 (B)의 금액 영향이 (A)를 넘는다.

**(C) 인용·표시 오류 — 결과 화면까지.** `app/calc/transfer-tax/steps/Step5.tsx:91`이 동일한 「2025.3.14 개정 … 2025.1.1 이후 양도분 상향」 주석과 `transferDate >= "2025-01-01"` 경계를 갖고 있어, 2025년 양도 사용자에게 개정 후 율 라벨을 표시한다.

**(D) 실패 시나리오 정정.** 제보 수치는 probe로 원단위 재현됐다(감면세액 30,000,000 vs 20,000,000). 다만 「채권 5년 만기면 45% vs 40%로 같은 방향 확대」는 5%p로 동일하고, 실제로 영향이 더 크게 벌어지는 축은 채권 만기가 아니라 **(B) 한도 2배**다.

**(E) 안전망 서술 보강.** 기존 anchor `__tests__/tax-engine/public-expropriation-reduction.test.ts:291`은 이름이 「2025.1.1 이후 양도분」이지만 `transferDate: 2026-02-16`만 사용해 **결함 구간을 한 번도 밟지 않는다**. 수정 시 2025년 양도 케이스(율 10% + 한도 1억)와 2026년 케이스를 함께 고정할 것.

**(F) 미검증으로 남긴 것.** 법률 제21223호 **부칙 적용례 원문**은 확인하지 못했다(`get_law_text(jo="부칙")` NOT_FOUND). 경계를 2026-01-01로 고칠 때 부칙 적용례가 「이 법 시행 이후 양도하는 분부터」인지 별도 확인이 필요하다 — 다만 조문시행일 20260101과 §133 항 번호 삽입 구조는 직접 관측했으므로 2025-01-01 경계가 틀렸다는 결론 자체는 흔들리지 않는다.

**근거**

코드 원문 `lib/tax-engine/public-expropriation-reduction.ts:8-9` — `// 2025-01-01 이후 양도분 (2025.3.14 개정, 조특법 §77① — 현행 원문 확정)` / `AMENDED_2025: Object.freeze({ cash: 0.15, bond: 0.20, bond3y: 0.35, bond5y: 0.45 })`, `:32` `export const AMENDED_2025_TRANSFER_CUTOFF = new Date("2025-01-01T00:00:00");`, `:173` `const isAmended2025 = input.transferDate >= AMENDED_2025_TRANSFER_CUTOFF;`.
KoreanLaw MCP 실측 2건으로 갈랐다.
(1) MST 267555(공포 20241231, **조문시행일 20250101**) 제77조① 원문: 「… 양도소득세의 **100분의 10**[… 채권으로 받는 부분에 대해서는 **100분의 15**로 하되, … **100분의 30**(만기가 5년 이상인 경우에는 **100분의 40**)]에 상당하는 세액을 감면한다.」
(2) MST 280409(공포 20251223, **조문시행일 20260101**) 제77조① 원문: 「… **100분의 15**[… **100분의 20** … **100분의 35**(만기가 5년 이상인 경우에는 **100분의 45**)] …」
⇒ 15/20/35/45는 **2026-01-01 시행**이고, 2025년 전 기간의 양도분은 10/15/30/40이다. 코드 주석의 「2025.3.14 개정」은 두 실측본 어디에도 대응하지 않는다. (과거 시행본은 efYd 조회가 NOT_FOUND라 MST 직접 조회로 확인했다.)

**실패 시나리오**

토지, 양도일 2025-06-01, 사업인정고시일 2022-01-01, 취득일 2015-01-01, 전액 현금보상. 양도소득금액 700,000,000 · 기본공제 2,500,000 · 과세표준 697,500,000 · 산출세액 200,000,000.
현재: cashReduction = floor(697,500,000 × 0.15) = 104,625,000 → 감면세액 = floor(200,000,000 × 104,625,000 / 697,500,000) = **30,000,000**.
조문(시행 2025-01-01본 10%): floor(697,500,000 × 0.10) = 69,750,000 → 감면세액 = **20,000,000**.

**세액 영향**: 감면세액 10,000,000 과다 → 결정세액 10,000,000 과소 + 지방소득세 1,000,000 과소 (합계 11,000,000 과소). 채권 5년 만기특약이면 45% vs 40%로 같은 방향 확대.

**처방**

`AMENDED_2025_TRANSFER_CUTOFF`을 `new Date("2026-01-01T00:00:00")`으로 바꾸고 상수명·주석·`rateSetApplied` 라벨(`components/calc/results/transfer/TransferReductionRows.tsx:70` 「2025 개정율」)도 함께 2026으로 정정. `CURRENT_2018` 적용 구간 주석을 「2018-01-01 ~ 2025-12-31」로 확장.

---

## [D8-01] 다건 합산 M-8이 §97 시리즈 감면율(50%)을 잃고 100%로 재계산한다

- **위치**: `lib/tax-engine/transfer-tax-aggregate-reduction-step.ts:101`
- **조문**: 조특법 §97① 본문 (50% 감면) · §127⑦ · §133
- **유형**: arithmetic · **차원**: §133 한도·§127⑦ · **검증**: 생존 3/3
- **중복 병합**: CB-03 (같은 결함을 다른 차원이 독립 발견)

**결함**

**§97 시리즈 4종 전부가 아니라 `rental_97_main`(§97① 본문, 50%) 하나만 결함이다. 대신 §97 밖의 두 유형이 같은 결함을 공유한다.**

M-8이 사실상 「reducibleIncome에 감면율이 이미 반영돼 있다」를 전제하므로, 감면율이 1.0이면 결과가 우연히 맞는다:
- `rental_97_proviso`(§97① 단서 = **면제** 100%, `rental-97-main.ts:143` `rate = isProviso ? 1.0 : 0.5`) → M-8 100% = **정확**
- `rental_97_2`(§97의2, `rental-97-2.ts:93-95` `reductionRate: 1.0`, `rentalGainRatio: 1`) → **정확**
- `rental_97_5`(§97의5, `rental-97-5.ts:154·161-163` — reductionAmount·reducibleIncome 양쪽에 동일 `rentalGainRatio`를 곱하고 rate는 1.0) → 분자·감면세액이 같은 비율로 스케일되므로 **정확**. 주장의 「§97의5 등 안분비율<1인 경우도 감면율만큼 과다」는 틀렸다.
- `rental_97_main`(§97① 본문 **50%**, `rate = 0.5`인데 `rentalGainRatio: 1`이라 분자는 전액) → **2배 과다감면. 이것 하나가 결함이다.**

반대로 주장이 놓친 동일 결함 유형(코드 수준 확인, UI 도달성은 확인 필요):
- `new_housing`: `transfer-tax-reductions-calc.ts:190-196`이 `reducibleIncome: transferIncome`(전액)을 넣지만 `new-housing-reduction.ts:378-406`의 `reductionRate`는 1.0 미만일 수 있다. 다건 차단집합(`ALL_INCOME_DEDUCTION_IDS`)에 `new_housing`은 없다.
- `long_term_rental`: `:110-116`이 `reducibleIncome: transferIncome`을 넣는데 `rental-housing-reduction.ts:291·295·298`의 tier `reductionRate`가 **0.7·0.5**일 수 있다. 역시 차단집합에 없다.
- 하이브리드 tax_amount(`unsold_98_7`·`unsold_99_2` 등)는 `:170-178`에서 동일 패턴이지만 **다건 validate가 차단**(`ALL_INCOME_DEDUCTION_IDS` 11종 포함)하므로 UI 경로로는 도달 불가 — 주장의 근거로 쓸 수 없다.

또한 실패 시나리오의 구체 수치(감면 100,422,641 / 정답 50,211,320)는 `aggregateReductions` **직접 호출** 값이라 내 E2E 재현값(raw 170,985,625 / 정답 85,492,812, 입력이 다름)과 다르지만, **2배 구조는 동일하게 재현**된다.

부수 관찰(이 주장 범위 밖, 별건): 내 E2E 실측에서 breakdown의 `legalBasis`가 `rental_97_main`에 대해 **"조특법 §127⑦"**(중복배제 조항)으로 인쇄됐다 — `:126-134`의 `info?.legalBasis` 미존재 분기에서 `resolveTypeLegalBasis(type)`가 반환한 값. 감면 근거 자리에 중복배제 조항이 오는 #048과 같은 계열의 표시 문제일 수 있어 별도 확인이 필요하다.

**근거**

재계산식 `transfer-tax-aggregate-reduction-step.ts:99-103`:
```ts
const raw =
  aggregateTaxBase > 0
    ? safeMultiplyThenDivide(calculatedTax, entry.income, aggregateTaxBase)
    : 0;
```
분자 `entry.income`의 출처는 `transfer-tax-reductions-calc.ts:142-149`:
```ts
candidates.push({
  amount: rental97Result.reductionAmount,
  type: rental97Result.id,
  reducibleIncome:
    transferIncome === undefined
      ? undefined
      : applyRate(transferIncome, rental97Result.rentalGainRatio),
});
```
`rentalGainRatio`는 **임대기간 안분비율**이지 감면율이 아니다 — `rental-97-main.ts:143·150-151`:
```ts
const rate = isProviso ? 1.0 : 0.5;
...
reductionAmount: applyRate(input.calculatedTax!, rate),
rentalGainRatio: 1, // §97은 임대기간 안분 없음
```
⇒ §97① 본문은 `reducibleIncome = 양도소득금액 전액`.

대조군(§77·§77의2·§77의3)은 감면율이 박혀 있다 — `public-expropriation-reduction.ts:243-245` `const cashReduction = applyRate(cashTaxable, cashRate); ... const reducibleIncome = cashReduction + bondReduction;` / `gb-designated-land-reduction.ts:155` `const reducibleIncome = applyRate(taxableIncome, rate);` / `replacement-land-reduction.ts:142` `applyRate(replacementTaxableIncome, REPLACEMENT_LAND_RATE)`. 즉 같은 재계산식 아래 §97 계열만 규칙이 갈린다.

자산별 단건 결과(정확한 50%)는 버려진다 — `:167` `if (r.result.reductionTypeApplied && (r.result.reducibleIncome ?? 0) > 0) return s;` 가 레거시 단순합에서 제외하기 때문.

**도달성 실측**: 다건 차단 목록은 `ALL_INCOME_DEDUCTION_IDS` 11종뿐이고(`lib/calc/multi-transfer-tax-validate.ts:18·102-108`) 그 배열(`income-deduction-router.ts:42-54`)에 `rental_97_*`는 **없다**. 변환도 살아 있다 — `lib/calc/multi-transfer-tax-api.ts:27` `toEngineReductions(...)`, `lib/calc/transfer-tax-api-reductions.ts:169`가 `rental_97_main`을 처리.

**실측(esbuild 번들 후 node 직접 호출, worktree 무수정 — `git status --porcelain` 공백)**: `aggregateReductions`에 자산A(rental_97_main, reducibleIncome 300,000,000)·자산B(감면없음 100,000,000), calculatedTax 133,060,000, totalBasicDeduction 2,500,000, taxYear 2025 투입 →
```
aggregate reductionAmount = 100422641
§97① 본문 50% 정답 = 50211320
과다 = 50211321
```

**실패 시나리오**

2025년 한 과세기간에 자산 A(임대주택, §97① 본문 50% 감면, 양도소득금액 3억)와 자산 B(감면 없음, 양도소득금액 1억)를 다건(합산) 계산기로 신고. 합산 과세표준 397,500,000 · 산출세액 133,060,000. → 현재 출력: 감면세액 100,422,641(=산출세액 × 3억/3.975억, 즉 A분 세액의 100%), 결정세액 32,637,359. → 조특법 §97① 본문상 올바른 값: 감면세액 50,211,320(A분 세액의 50%), 결정세액 82,848,680. 단건 계산기로 A만 돌리면 50%가 정상 적용되므로 같은 사실관계가 경로에 따라 갈린다.

**세액 영향**: 50,211,321원 과소납부(위 사례). 일반화하면 §97① 본문은 항상 2배 감면, §97의5 등 안분비율<1인 경우도 감면율만큼 과다. 부수로 농특세도 부풀려진 감면액 기준으로 계산된다(`transfer-tax-rural-surtax.ts:87` `rental_97_main: "taxable"`).

**처방**

`calcReductions`가 §97 계열 후보에 넣는 `reducibleIncome`을 §77 계열과 같은 의미(감면율 반영 후 감면대상소득)로 통일하거나 — 즉 `applyRate(applyRate(transferIncome, rentalGainRatio), rental97Result.reductionRate)` — 또는 M-8 재계산이 유형별 감면율을 별도로 받아 곱하도록 `ReductionBreakdownEntry`에 감면율을 실어 보낼 것. 어느 쪽이든 별지84호 부표1 ⑲(감면율 별도 칸) 표시 계약이 깨지지 않게 표시용 값과 계산용 값을 분리해야 한다. 회귀 anchor: 「단건 A 단독 = 다건 A+B의 A 배분액」 항등식.

---


# 🟠 High (22건)

## [CA-01] §97의5 감면에 국민주택규모·기준시가 6억/3억 요건이 없다 (§97의3③2·4호 준용 누락)

- **위치**: `lib/tax-engine/transfer-reductions/rental-97-5.ts:88`
- **조문**: 조특법 §97의5①3호 → §97의3①2호 → 조특령 §97의3③2호·4호
- **유형**: legal-accuracy · **차원**: 누락점검(조문축) · **검증**: 생존 1/1

**결함**

결함 자체는 성립. 다만 서술 두 곳을 정정한다.

(1) **「officialPriceAtStart·region 둘 다 평가기가 한 번도 읽지 않는 dead pass-through」는 부정확하다.** `region`은 `rental-97-5.ts` 전체에서 0건이 맞지만, `officialPriceAtStart`는 **:123에서 읽힌다** — `stdPriceAtRentalStart: input.stdPriceAtRentalStart ?? input.officialPriceAtStart`로 조특령 §97의5② 안분의 「임대기간 개시일 기준시가」 fallback으로 쓰인다. 즉 「6억/3억 한도 검증에는 쓰이지 않는다」가 정확한 서술이고, 필드 자체가 사문(死文)인 것은 `region` 하나다.

(2) **실패 시나리오의 「2018-06-01 취득 + 기준시가 5억」 부분은 근거가 반쪽이다.** 조특령 §97의3③4호(기준시가 6억/3억)의 신설 시점과 부칙 적용례를 확인하지 못했다(`get_law_text(mst=287181, jo="제97조의3", efYd="20180901")` → NOT_FOUND. 과거 시행본 조회 불가). 2018년 중 취득분에 4호가 그대로 적용되는지는 **확인 필요**다. 그러나 같은 시나리오의 **전용 120㎡ > 국민주택규모(2호)** 만으로 §97의5①3호 미충족이 성립하므로 「감면 0원 / 결정세액 200,000,000원」이라는 결론과 200,000,000원의 세액 영향은 그대로 유지된다.

(3) 정정된 결함 서술: **§97의5①3호가 준용하는 「§97의3①2호의 요건」은 조특령 §97의3③ 1~4호 전부인데, `rental-97-5.ts:78-97`은 1호(임대료 5% 증액 제한)만 검증한다. 2호(국민주택규모 이하)는 §97의5 variant에 입력 필드조차 없고(`transfer-reductions-stub.types.ts:72-75`), 4호(임대개시일 당시 기준시가 6억/수도권 밖 3억)는 UI·validate·Zod·router가 값을 끝까지 나르지만(`Rental975InputForm.tsx:130-138` hint가 「6억(수도권 밖 3억) 이하 요건 확인용」이라 명시) 엔진이 한도 비교를 하지 않는다.** 형제 `rental-97-3.ts:94-119`에 동일 규칙이 이미 구현돼 있으므로 수정은 그 술어를 공용화하는 방향이 자연스럽다(단, 4호의 시기 적용례는 `rental-97-3.ts`도 무조건 적용 중이라 별건 확인 대상).

(4) 안전망: `rental-97-evaluators.test.ts:115-133` `base975()`가 면적·기준시가·소재지를 넣지 않고도 `isEligible=true`를 단언하므로, 이 결함에 대한 회귀 테스트는 **0건**이다. 수정 시 anchor 선행 필요.

**근거**

조특법 §97의5①3호(MST 280409, 시행 2026-01-01 실독): 「임대기간 중 제97조의3제1항제2호의 요건을 준수할 것」. 조특령 §97의3③(MST 287181 실독): 「법 제97조의3제1항제2호에서 "대통령령으로 정하는 임대보증금 또는 임대료 증액 제한 요건 등"이란 다음 각 호의 요건을 말한다. 1. …증가율이 100분의 5를 초과하지 않을 것 2. 「주택법」 제2조제6호에 따른 국민주택규모 이하의 주택일 것 3. …임대개시일부터 10년 이상 임대할 것 4. …기준시가의 합계액이 해당 주택의 임대개시일 당시 6억원(수도권 밖의 지역인 경우에는 3억원)을 초과하지 아니할 것」. 코드 rental-97-5.ts:80~97은 `validateRentIncrease`(1호)만 호출한다. `grep -n "국민주택|officialPriceAtStart|region" lib/tax-engine/transfer-reductions/rental-97-5.ts` → 히트는 :14 주석과 :123(안분용) 둘뿐이며 `region`은 0건. 반대로 sibling인 rental-97-3.ts:38-39는 `OFFICIAL_PRICE_LIMIT_CAPITAL = 600_000_000` / `OFFICIAL_PRICE_LIMIT_NON_CAPITAL = 300_000_000`을 두고 :94(2호 국민주택규모)·:103(4호 기준시가 한도)을 모두 차단한다 — 같은 규칙이 형제 경로에 이미 구현돼 있다. 더욱이 rental-97-router.ts:83 `case "rental_97_5": return { ...base, officialPriceAtStart: r.officialPriceAtStart, region: r.region };` 는 두 필드를 §97의5 평가기에 넘기지만 평가기가 한 번도 읽지 않는 dead pass-through다(의도는 있었으나 배선이 끊겼다는 방증). 코드 주석 rental-97-5.ts:14 「전용면적 요건: 본조·시행령 모두 없음 (R-2 확정 — 국민주택규모 요건은 §97의3 전용)」은 §97의5①3호의 준용 사슬을 끝까지 읽지 않은 결론이다.

**실패 시나리오**

수도권 밖 소재, 임대개시일 당시 주택+부속토지 기준시가 합계 5억원, 전용 120㎡(국민주택규모 초과) 매입임대주택. 2018-06-01 취득, 2018-08-01 등록·임대개시, 10년 계속 임대 후 2028-09-01 양도. 산출세액 200,000,000원. → 현재 코드: 조특령 §97의3③2호·4호를 보지 않으므로 §97의5 적격 → 임대기간 분(안분비율 1) 산출세액 100% 감면 = 200,000,000원 감면, 결정세액 0원. → 조문상: 기준시가 5억 > 3억(수도권 밖) 이고 전용 120㎡ > 국민주택규모 이므로 §97의5①3호 요건 미충족 → 감면 0원, 결정세액 200,000,000원.

**세액 영향**: 위 시나리오에서 세액 과소 200,000,000원(감면 전액). 일반적으로 임대기간 분 산출세액 전액.

**처방**

rental-97-5.ts에 §97의3과 동일한 2호·4호 게이트를 추가하되 상수를 rental-97-shared-helpers.ts로 끌어올려 단일 소스화한다(§97의3·§97의5가 같은 령 조항을 준용하므로 복제하면 dual truth가 된다 — D1-08과 같은 실패). 라우터가 이미 넘기는 `officialPriceAtStart`·`region`을 소비하고, `isNationalHousingScale`을 §97의5 케이스에도 추가한다. rental-97-5.ts:14의 「요건 없음」 주석은 준용 사슬(법 §97의5①3호 → 법 §97의3①2호 → 령 §97의3③)을 적어 정정한다.

---

## [CA-02] §97의5 임대기간 10년을 임대개시일부터 세어 「등록일 임대개시 의제」(령 §97의5③ 후단)를 무시한다

- **위치**: `lib/tax-engine/transfer-reductions/rental-97-5.ts:103`
- **조문**: 조특법 §97의5①2호 · 조특령 §97의5①·③ 후단
- **유형**: legal-accuracy · **차원**: 누락점검(조문축) · **검증**: 생존 1/1

**결함**

결함은 성립한다. 다만 처방 범위를 두 가지 정정한다.

**(a) 클램프 대상은 `registrationDate` 하나가 아니다.** 조특령 §97의5③ 후단은 ①「소득세법 §168 사업자등록」 ②「민특법 §5 임대사업자등록」 ③「장기일반민간임대주택등 등록」 **셋을 모두 마치고 임대하는 날**을 개시일로 의제한다. 따라서 법문상 기산일 = `max(사업자등록일, 임대사업자등록일, 장기일반민간임대주택등 등록일, 실제 임대개시일)`이다. 그런데 현행 입력 축에는 **사업자등록이 날짜가 아니라 boolean `isTaxRegistered`로만 존재**한다(`rental-97-5.ts:60-66`, UI `Rental975InputForm.tsx:110-118` ToggleCard). `registrationDate`만으로 클램프하면 「부분 이행」이며, 완전 이행에는 사업자등록일 필드 신설(14 동기화 지점)이 따른다. 어느 쪽을 택하든 계획서에 명시할 것.

**(b) 위치 표기.** 제보 위치가 `rental-97-5.ts:103`으로 적혔으나 결함 호출은 `:101-106` 블록이고 `:103`은 `input.transferDate` 인자 줄이다(제보 근거란은 101-106으로 올바르게 적었다). 구조적 원인은 헬퍼 시그니처 `rental-97-shared-helpers.ts:34-38`이 등록일을 받지 않는 것이므로, 수정 지점은 **헬퍼 시그니처 또는 각 호출부 6곳**(§97 본문 `rental-97-main.ts:72`, §97의2 `:58`, §97의3 `:147`, §97의4 `:99`, §97의5 `:101`, 레거시 `rental-housing-reduction.ts:363·464`)이다. 첫 히트에서 멈추면 「고쳤는데 그대로」가 된다.

**(c) 파급 주의.** `calcRentalGainRatio`(`rental-97-shared-helpers.ts:108-127`)도 같은 `rentalStartDate`를 안분 기산점으로 쓴다. 10년 카운트만 클램프하고 안분을 그대로 두면 두 값이 서로 다른 「임대개시일」을 쓰게 되므로, 조특령 §97의5②·§97의3⑤(C = 「실제 임대기간의 개시일의 기준시가」)의 **「실제」** 문언과 대조해 어느 쪽에 의제일을 적용할지 별도 판정이 필요하다 — 이 판정 없이 일괄 치환하면 안분이 조용히 틀어진다.

**근거**

조특령 §97의5①(MST 287181 실독): 「…10년 이상 계속하여 …임대한 경우는 장기일반민간임대주택등으로 10년 이상 계속하여 등록하고, 그 등록한 기간 동안 계속하여 10년 이상 임대한 경우로 한다」. 같은 조 ③ 후단: 「…장기일반민간임대주택등으로 등록하여 임대하는 날부터 임대를 개시한 것으로 본다」. 코드 rental-97-5.ts:101-106 `eligibleRentalYears = calculateEffectiveRentalPeriod(input.rentalStartDate, input.transferDate, input.vacancyPeriods ?? [])` — 인자에 `registrationDate`가 없다. 헬퍼 rental-97-shared-helpers.ts:34-53 `calculateEffectiveRentalPeriod(rentalStartDate, transferDate, vacancyPeriods)`도 `const totalDays = differenceInDays(transferDate, rentalStartDate)`로 시작해 등록일을 알지 못한다. `grep -n "registrationDate" lib/tax-engine/transfer-reductions/rental-97-5.ts` → :51(존재 검증), :73(3개월 내 등록 검증) 두 곳뿐이고 기산일 계산에는 쓰이지 않는다. 라우터도 원본 그대로 넘긴다(rental-97-router.ts:57 `rentalStartDate: r.rentalStartDate`). 조특령 §97의3④ 후단에도 동일한 의제 문구가 있어 §97의3(rental-97-3.ts:147-151)도 같은 구조적 결함을 공유한다(§97의3 쪽 「10년 이상 계속 등록」 미검증은 D2-02가 이미 지적).

**실패 시나리오**

2018-12-01 매입임대주택 취득 → 2018-12-05 임대 개시 → 2019-02-20 장기일반민간임대주택 등록(취득일부터 3개월 이내라 §97의5①1호는 충족) → 2028-12-10 양도. 산출세액 150,000,000원. → 현재 코드: 임대개시일 2018-12-05 기준 10년 0개월 5일 ≥ 10년 → 적격 → 100% 감면 150,000,000원. → 조문상: 등록일 2019-02-20을 임대개시일로 의제하므로 등록 후 임대기간 9년 9개월 20일 < 10년 → §97의5①2호 미충족 → 감면 0원.

**세액 영향**: 위 시나리오에서 세액 과소 150,000,000원. 일반적으로 「실제 임대개시 ~ 등록」 사이 기간만큼 요건 판정이 느슨해져 감면 과다.

**처방**

`calculateEffectiveRentalPeriod` 호출 전에 기산일을 `max(rentalStartDate, registrationDate)`로 의제하고(령 §97의5③ 후단), 그 값을 안분비율 `calcRentalGainRatio`의 `rentalStartDate`에도 동일하게 쓴다(령 §97의5②의 「제1항에 따른 임대기간」과 정합). 헬퍼에 `registrationDate` 인자를 추가해 §97의3(령 §97의3④ 후단)과 공유하되, §97의3 쪽은 D2-02와 함께 처리한다.

---

## [CA-03] §133 5년 감면이력 입력의 연도 선택지가 「오늘」 기준이라 과거연도 양도에서는 5년 누적한도가 절대 발동하지 않는다

- **위치**: `app/calc/transfer-tax/steps/Step5.tsx:452`
- **조문**: 조특법 §133①2호 · §133②2호
- **유형**: wiring · **차원**: 누락점검(조문축) · **검증**: 생존 1/1

**결함**

결함은 실재하나 제목의 「과거연도 양도에서는 절대 발동하지 않는다」는 과장이다. 정확히는 — **UI 선택지 집합 {C-1, C-2, C-3, C-4}(C=오늘 연도)와 엔진 필터 창 [T-4, T-1](T=양도연도)이 T≠C인 순간부터 어긋난다**. 전면 무력화(교집합 공집합)는 **T ≤ C−4**일 때만이고, T ∈ {C−1, C−2, C−3}에서는 **부분 어긋남**이다 — (a) 창의 하단 연도(T−4 등)를 입력할 수단이 아예 없고, (b) 선택 가능한 상단 연도(C−1 등)를 입력하면 `aggregate-reduction-limits.ts:242-244` 필터에서 **경고 없이 탈락**한다. 두 방향 모두 `priorGroupSum`을 과소계상시켜 §133 5년 한도를 과소 적용(=감면 과다 인정)한다. 또한 다건(aggregate) 경로는 `components/calc/transfer/AggregateSettingsPanel.tsx:44`가 `taxYear`를 **최근 10년**까지 고르게 해 T ≤ C−4 조합을 UI만으로 만들 수 있다.

**근거**

UI: app/calc/transfer-tax/steps/Step5.tsx:451-452 `const currentYear = new Date().getFullYear(); const yearOptions = [currentYear - 1, currentYear - 2, currentYear - 3, currentYear - 4];` (Select는 :497-501에서 이 배열만 렌더). 기본행도 :455 `{ year: currentYear - 1, ... }`. 엔진: lib/tax-engine/aggregate-reduction-limits.ts:241-245 `const minYear = transferYear - 4; const maxYear = transferYear - 1; const priorFiltered = priorReductionUsage.filter((r) => r.year >= minYear && r.year <= maxYear && r.amount > 0);`. transferYear는 실제 양도연도다 — lib/tax-engine/transfer-tax-finalize.ts:335 `transferYear: input.transferDate.getFullYear()`, 다건은 lib/tax-engine/transfer-tax-aggregate-reduction-step.ts:106 `const transferYear = input.taxYear`. `grep -rn "priorReductionUsage" components app` 결과 입력 UI는 Step5.tsx 한 곳뿐이므로 우회 경로가 없다. 저장소가 최근(커밋 ffabbaea)에 주식 대주주 판정에서 폐기한 「기준일 오늘-fallback」과 동일한 패턴이다.

**실패 시나리오**

오늘이 2026-08-31일 때 2022년 양도분 신고를 계산한다. 납세자는 2018~2021년에 자경농지(§69) 감면을 합계 180,000,000원 받았고, 2022년 양도분 §69 감면세액은 100,000,000원(연간 한도)이다. → 현재 코드: UI가 2025·2024·2023·2022년만 선택지로 주므로 2018~2021 이력을 입력할 수 없다. 어떤 행을 넣어도 엔진 필터 `year >= 2018 && year <= 2021`에 걸리지 않아 `priorGroupSum = 0` → 5년 한도 미발동 → 감면 100,000,000원 전액 인정. → 조문상(2024-01-01 시행본 §133①2호나목, MST 257993 efYd=20240101 실독): 5개 과세기간 합계 2억 한도 − 직전 4개 과세기간 1.8억 = 잔여 20,000,000원 ⇒ 감면 20,000,000원만 인정.

**세액 영향**: 위 시나리오에서 감면 과다 80,000,000원 = 세액 과소 80,000,000원(지방소득세 8,000,000원 별도). 최대 과다폭은 그룹 연간한도 전액(§133① 1억 / §133② 2억).

**처방**

`yearOptions`를 폼의 양도일(`form.transferDate`)에서 파생시킨다 — `const ty = new Date(form.transferDate).getFullYear(); yearOptions = [ty-1, ty-2, ty-3, ty-4]`. 양도일 미입력 시에는 목록을 비우고 「양도일을 먼저 입력하세요」로 차단한다(오늘-fallback 금지). 양도일 변경 시 기존 행의 year가 창을 벗어나면 경고를 띄운다. 회귀 anchor: 양도연도 ≠ 현재연도인 케이스에서 `priorGroupSum > 0`이 실제로 관측되는지 세액으로 단언.

---

## [CB-01] §97의4 시한 게이트 「등록일 2014.1.1 이후」는 법·령 어디에도 없다 — 불리 적용

- **위치**: `lib/tax-engine/transfer-reductions/period-check.ts:66`
- **조문**: 조특법 §97의4① · 조특령 §97의4① · 소득세법 시행령 §167의3①2호 가목·다목
- **유형**: legal-accuracy · **차원**: 누락점검(배관축) · **검증**: 생존 1/1

**결함**

결함은 성립한다. 다만 서술 3곳을 정정·보강한다.

(1) **범위 정정 — 엔진 전용이 아니라 UI 게이트이기도 하다.** 주장은 "UI 표시용이 아니라 엔진 차단"이라 했으나, 같은 술어가 `lib/tax-engine/transfer-reductions/index.ts:279`(`countActiveReductionsByCategory`)·`:296`(`evaluateAllPeriods`)를 통해 **감면 항목 disabled/enabled 판정에도** 쓰인다. 정확히는 **엔진 차단 + UI 비활성 이중**이다.

(2) **근거 서술 정정 — "법·령 어디에도 없다"에 대조군과 오주석을 추가.** 단순 부존재가 아니라 **방향이 반대**다: 소령 §167의3①2호 가목·다목은 「2018년 3월 31일까지 사업자등록등을 한 주택으로 한정」이라는 **상한**만 둔다. 더해 같은 파일 `period-check.ts:80-83` 주석이 「§97의4(:66)의 registrationDate 사용은 조문이 등록 시한을 직접 규정한 것이라 정당하다」고 적었는데 이는 **사실과 다르다** — 「…까지 등록」 문언은 §97의3①에만 있고 §97의4①에는 「등록」 단어 자체가 없다. 코드 수정 시 이 주석도 함께 정정해야 한다.

(3) **부수 결함 1건 추가 — failReason 문구가 경계와 어긋난다(off-by-one).** `period-check.ts:67`은 「임대 등록일이 **2014.1.1 이전**」이라 하지만 술어는 `>= 2014-01-01`이라 2014.1.1 등록은 **통과**한다(probe 실측). 문구대로면 2014.1.1도 배제되는 것으로 읽힌다. 게이트를 제거하지 않고 축만 고치는 경우에도 이 문구는 별도로 정정 대상이다.

(4) **미확인 항목 명시.** 조특법 §97의4 신설 부칙(적용례)의 축(양도일/등록일)은 MCP로 조회 불가(NOT_FOUND·EXTERNAL_API_ERROR) — **확인 필요**. 부칙 본문이 확보되기 전에는 하한을 등록일에 거는 현행 구현을 정당화할 수 없다.

**근거**

period-check.ts:64-68 원문 — `rental_97_4: { label: "임대등록 2014.1.1~", check: (c) => c.registrationDate !== undefined && c.registrationDate >= D("2014-01-01"), failReason: "임대 등록일이 2014.1.1 이전 — 조특법 §97의4 적용 시한 외" }`. 이 술어는 UI 표시용이 아니라 엔진 차단이다 — rental-97-4.ts:55-63 `// 0) 시한 — 등록 2014.1.1~` / `const period = checkReductionPeriod("rental_97_4", input); if (!period.inPeriod) { reasons.push({ code: "OUT_OF_PERIOD", ... }) }` 이고, reasons가 1건이라도 있으면 :114-122가 `isEligible:false`를 반환한다.

위임 체인을 끝까지 읽었다(KoreanLaw MCP 실측):
· 조특법 §97의4① (MST 280409, 시행 2026-01-01) — 「…민간건설임대주택, …민간매입임대주택, …공공건설임대주택 또는 …공공매입임대주택으로서 대통령령으로 정하는 주택을 6년 이상 임대한 후 양도하는 경우…」 **등록일 하한 문구 없음**.
· 조특령 §97의4① (MST 287181, 시행 2026-07-01) — 「법 제97조의4제1항에서 "대통령령으로 정하는 주택"이란 「소득세법 시행령」 제167조의3제1항제2호가목 및 다목에 따른 장기임대주택…을 말한다」 **날짜 없음**.
· 소령 §167의3①2호 가목·다목 (MST 286211) — 두 목 모두 「다만, **2018년 3월 31일까지** 사업자등록등을 한 주택으로 한정한다」. 즉 조문이 정한 것은 **상한 2018-03-31**이고, 하한은 존재하지 않는다. 코드의 2014-01-01은 방향이 반대다.

안전망: 정찰 실측(M4 「시한 항상 통과」 뮤테이션)에서 rental_97_4는 실효 커버 규칙에 들어 있으나 전부 **술어 단언**이고 세액 anchor는 0건이다.

**실패 시나리오**

2013-05-01 사업자등록·임대사업자등록을 마치고(소령 §167의3①2호가목의 2018-03-31 상한 내), 임대개시 2013-06-01, 기준시가 5억(수도권), 임대료 증액 5% 이내로 11년 임대한 민간매입임대주택을 2026년에 양도 → 조문상 §97의4① 표의 「10년 이상 = 100분의 10」 추가공제율이 §95② 보유기간별 공제율에 가산되어야 한다. 현재 코드: `checkReductionPeriod("rental_97_4")` false → `OUT_OF_PERIOD` → `isEligible:false` → transfer-tax-lthd.ts:436의 additional 분기 미진입 → 추가공제율 0%. 즉 장특공제가 조문 대비 양도차익 × 10%p 만큼 과소 계상된다.

**세액 영향**: 양도차익 5억·보유 13년(표1 26%) 가정 시 장특공제 130,000,000 → 조문상 180,000,000(36%)이어야 하므로 공제 50,000,000 과소 → 과세표준 50,000,000 증가. 40% 구간이면 세액 약 20,000,000 과다(지방소득세 별도). 산식은 transfer-tax-lthd.ts:441 `const combined = rate + rental97Eval.additionalRate;`에서 직접 도출했다(실행 측정 아님 — 읽기 전용 제약).

**처방**

`rental_97_4`의 시한 규칙에서 2014-01-01 하한을 제거하고, 조문이 실제로 정한 축(소령 §167의3①2호 가목·다목 단서의 「2018년 3월 31일까지 사업자등록등」 상한)으로 대체한다. 부칙 적용례가 「시행 후 양도분」이라면 그것은 **양도일** 게이트이지 등록일 게이트가 아니므로 `transferDate` 축에 둔다. ⚠️ 법률 제12173호 부칙 원문은 본 리뷰에서 확인하지 못했다 — 「2014.1.1」의 출처가 부칙 시행일이라면 축(등록일→양도일)을 바꾸는 것이 정정 방향이다. 하한을 제거·이동하는 anchor(2013년 등록 + 10년 임대 → additionalRate 0.10)를 같은 PR에 넣을 것.

---

## [CB-02] 재개발·겸용·§155⑳ 경로에서 §97의3(70%)·§97의4 장특 특례가 침묵 소실

- **위치**: `lib/tax-engine/transfer-tax-redevelopment.ts:10`
- **조문**: 조특법 §97의3① · 조특령 §97의3②(후단 재개발·재건축 임대의제) · 조특법 §97의4①
- **유형**: reachability · **차원**: 누락점검(배관축) · **검증**: 생존 1/1

**결함**

결함은 성립한다. 다만 세 가지를 정정·한정한다.

**정정 1 — 「입주권」은 대상이 아니다.** 주장 제목·본문이 「재개발·입주권」이라 적었으나, `asset-kind-gate.ts:35`의 `RENTAL_HOUSING_KINDS`는 `{housing, redevelopment_apt}`이고 `right_to_move_in`·`presale_right`은 **rental 카테고리에서 이미 배제**된다(`__tests__/tax-engine/transfer-tax/reduction-asset-kind-gate.test.ts:23-24`가 그 배제를 단언). 축 일원화(#1245) 이후 입주권은 assetKind `right_to_move_in`이므로 ⑤ UI에서 §97의3 라디오 자체가 뜨지 않는다. **영향 자산은 `redevelopment_apt`(완공 신축 APT) 하나**다 — 그리고 그것이 조특령 §97의3② 후단이 상정하는 「준공일 후」 양도와 정확히 겹치므로 결함의 실질은 오히려 그대로다.

**정정 2 — 세 경로의 무게가 다르다.**
- **재개발(`redevelopment_apt`) — high, 핵심.** 조특령 §97의3② 후단이 재개발 임대의제를 명문화해 §97의3 적용을 전제하고, 엔진은 그 경로에서 70%를 한 번도 평가하지 않는다.
- **겸용주택 — medium.** 침묵 소실은 동일하되(오히려 taxCredit 버킷 오분류로 차감형 고지에도 안 걸린다), 겸용주택이 §97의3③2호의 「국민주택규모 이하의 주택」 요건을 갖춘 장기일반민간임대주택으로 등록되는 조합은 확인하지 않았다 — **적용 가능성은 확인 필요**.
- **§155⑳ — low.** 이 경로에서 양도되는 자산은 **거주주택**이고 §97의3은 **임대주택**에 붙는 특례라, 사용자가 §97의3을 고르는 것 자체가 통상 오선택이다. 그럼에도 「선택은 되는데 계산엔 없다」는 침묵은 동일하게 성립한다.

**정정 3 — 겸용·§155⑳의 실패 양상은 「STEP 4 건너뜀」이 아니라 「버킷 오분류」다.** 두 경로는 `!ALL_INCOME_DEDUCTION_IDS.has(r.type)`라는 **이분법**으로 감면을 가르는데(`transfer-tax-mixed-use-totals.ts:340` / `transfer-tax-rental-housing-step.ts:461`), 감면 효과는 실제로 **3종**(차감형·세액감면형·**LTHD 계열**)이다. 세 번째가 이분법에 자리가 없어 세액감면형으로 흘러 들어가 `calcReductions`에서 조용히 사라진다. 따라서 수정 시 「LTHD 계열도 세 경로에서 평가한다」와 별개로, **최소한 이분법을 3분류로 고쳐 차감형과 같은 고지를 붙이는 것**이 침묵을 없애는 최소 조치다(계산 반영 여부와 무관하게).

**근거**

① 호출부 전수: `grep -rn "calcLongTermHoldingDeduction" lib/tax-engine` → 실제 호출은 `transfer-tax.ts:630` 1건뿐(나머지는 주석·re-export). `grep -rn "evaluateRental97Lthd"` → 정의부 rental-97-router.ts:111 + 호출 transfer-tax-lthd.ts:403 1건.
② 재개발 분기: transfer-tax.ts:239-247이 `isRedevelopmentActive(...)`에서 `calculateRedevelopmentTax`로 갈라지고 :371에서 조기반환한다. transfer-tax-redevelopment.ts:10 헤더 원문 — `* - STEP 4 (calcLongTermHoldingDeduction) skip — 분기별 LTHD 이미 산정`. 같은 파일에서 `grep -n "rental_97\|rental97"` 결과는 `:498`·`:730`의 `rental97TaxDetail`(세액감면 계열)뿐이고 `rental97LthdDetail`은 **0건**이다.
③ 게이트는 명시적으로 허용한다: asset-kind-gate.ts:35 `const RENTAL_HOUSING_KINDS = new Set<ReductionAssetKind>(["housing", "redevelopment_apt"]);` — `redevelopment_apt`가 rental 카테고리에 들어 있고, isReductionAllowedForAssetKind(:117-126)가 ⑧ validate(transfer-tax-validate-reductions.ts:56)와 ⑤ UI(UnifiedReductionPanel.tsx:348)에서 그대로 쓰인다.
④ 겸용주택도 같다: buildMixedUsePayload(lib/calc/transfer-tax-api-mixed-use.ts:21) `const isMixed = primary.assetKind === "housing" && primary.isMixedUseHouse;` — assetKind가 housing이라 rental 게이트 통과. transfer-tax-mixed-use.ts는 자체 LTHD를 쓰고 `calcLongTermHoldingDeduction`을 부르지 않는다(위 grep). §155⑳ 경로(transfer-tax-rental-housing-step.ts)도 transfer-tax.ts:573에서 조기반환하므로 :630에 도달하지 못한다.
⑤ 조문은 재개발을 명시적으로 포섭한다 — 조특령 §97의3② 후단(KoreanLaw MST 287181 실독): 「「도시 및 주거환경정비법」에 따른 재개발사업·재건축사업 … 의 시행으로 임대할 수 없는 경우에는 해당 주택의 관리처분계획 인가일 … 전 6개월부터 준공일 후 6개월까지의 기간 동안 계속하여 임대한 것으로 보되…」. 즉 재개발 아파트가 §97의3 대상임을 조문이 전제한다.
⑥ 회귀 안전망: `grep -rn "rental_97_3\|rental_97_4" __tests__ e2e | grep -i redev` → 0건.
⑦ 헤더 주석 드리프트: asset-kind-gate.ts:12-14 「§97 시리즈는 임대개시·등록 시한(~2000.12.31 / ~2018 / ~2027)이 재개발·재건축 시나리오를 시한 게이트에서 이미 차단하므로」 — §97의3 등록 시한은 period-check.ts:61 `before(c.registrationDate, D("2027-12-31"))`로 **열려 있어** 차단하지 않는다. 주석의 근거가 사실과 다르다.

**실패 시나리오**

2019-03-01 장기일반민간임대주택으로 등록(§97의3 시한 2027-12-31 내)·임대개시, 임대료 5% 이내, 국민주택규모, 임대개시 당시 기준시가 5억(수도권) 요건 충족 후 10년 계속 임대한 재개발 아파트(assetKind `redevelopment_apt`, redevelopment.subject `apt`)를 2029년에 양도. ⑤ UI가 §97의3 라디오를 활성화하고 ⑧도 통과시켜 payload에 `rental_97_3`가 실린다. 조문상 임대기간분 양도차익에 **70% 공제율**이 적용되어야 하나, 엔진은 `isRedevelopmentActive` 분기로 조기반환하며 `evaluateRental97Lthd`를 한 번도 부르지 않아 §166⑤ 분기별 일반 공제율(표1)만 적용된다. 결과 화면에도 「반영되지 않았다」는 경고가 없다(겸용 경로가 차감형에 대해 mixed-use-totals.ts:345-353에서 push하는 것과 같은 고지가 이 축엔 없다).

**세액 영향**: 임대기간분 양도차익 500,000,000 · 보유 10년(표1 20%) 가정: 조문상 공제 350,000,000(70%) vs 현재 100,000,000(20%) → 공제 250,000,000 소실. 45% 구간이면 세액 약 112,500,000 과다(지방소득세 별도). 산식 출처는 transfer-tax-lthd.ts:419-421 `const deduction = applyRate(rentalGain, rental97Eval.overrideRate) + applyRate(nonRentalGain, rate);`.

**처방**

(a) 최소 조치: 세 경로(`transfer-tax-redevelopment.ts`·`transfer-tax-mixed-use-totals.ts`·`transfer-tax-rental-housing-step.ts`)에서 `reductions`에 `rental_97_3`/`rental_97_4`가 있으면 **경고를 push**해 침묵을 없앤다(겸용 차감형 고지와 같은 층위). (b) 정본 조치: 재개발 경로는 조특령 §97의3② 후단·§97의3⑤(임대기간분 안분)이 §166 3분기 구조와 맞물리므로, `evaluateRental97Lthd` 결과를 §166 분기별 LTHD 산정에 주입하는 축을 별도 설계한다. (c) asset-kind-gate.ts:12-14 주석의 「시한 게이트가 이미 차단한다」를 §97의3에 대해 사실과 맞게 정정한다. 어느 쪽이든 `redevelopment_apt` + `rental_97_3` 조합의 세액 anchor를 먼저 심을 것 — 현재 회귀 0건이다.

---

## [CB-04] 다필지(§166) 분기가 §133 5년 누적 한도를 아예 적용하지 않는다

- **위치**: `lib/tax-engine/transfer-tax-multi-parcel-branch.ts:127`
- **조문**: 조특법 §133①·② (5개 과세기간 누적 한도)
- **유형**: wiring · **차원**: 누락점검(배관축) · **검증**: 생존 1/1
- **심각도 조정**: medium → high (검증 결과)

**결함**

다필지(소령 §166) 조기반환 분기(`lib/tax-engine/transfer-tax-multi-parcel-branch.ts:108-127`)가 `applyReductionStatutoryCap`을 호출하지 않아, **조특법 §133의 5개 과세기간 누적 한도가 통째로 적용되지 않는다** — §133②2호(§77·§77의2·§77의3, 5년 3억)뿐 아니라 §133①2호나목(§66~§69·§69의2~4·§70, 5년 2억)도 같이 누락된다. evaluator 내부 캡은 연간 한도뿐이므로(public-expropriation:255-258 · replacement-land:153 · gb-designated-land:164 · reductions-calc:319) 사용자가 입력한 `priorReductionUsage`는 이 경로에서 **구별력 0**이다(실측: 이력 유/무 결과 바이트 동일). 발현 범위는 **단건 route(`app/api/calc/transfer/route.ts:549`)** 한정 — 다건 aggregate는 `transfer-tax-aggregate-reduction-step.ts:111`이 `reducibleIncome`에서 재계산하며 5년 한도를 다시 적용한다. 실측 과소세액 116,502,750원(+지방소득세 11,650,275원), 한도 소진 정도에 따라 최대 3억원.

**근거**

transfer-tax-multi-parcel-branch.ts:108-127 — `} = calcReductions( mpTaxResult.calculatedTax, input.reductions, ... input.assetContractDate, );` 바로 다음 줄이 `const mpDeterminedTax = truncateToWon(Math.max(0, mpTaxResult.calculatedTax - mpReduction));`이고, 같은 파일 전체에 `applyReductionStatutoryCap`·`priorReductionUsage` 문자열이 **0건**이다(`grep -n "applyReductionStatutoryCap\|priorReductionUsage" lib/tax-engine/transfer-tax-multi-parcel-branch.ts` → 무출력).

형제 경로는 모두 부른다 — transfer-tax-finalize.ts:332-337 / transfer-tax-redevelopment.ts:525-529 / transfer-tax-rental-housing-step.ts:483-487 / transfer-tax-mixed-use-totals.ts:374-378, 넷 다 `priorUsage: (input|effectiveInput).priorReductionUsage ?? []`.

5년 누적이 이 헬퍼에만 있다는 근거: transfer-tax-reduction-cap.ts:47-51 `const { fiveYearCappedByType, fiveYearCapInfoByType } = applyFiveYearLimits(annuallyCappedByType, priorUsage as ..., transferYear, limitGroups);`. 반면 evaluator 내부 캡은 연간뿐이다 — gb-designated-land-reduction.ts:163-164 `const cappedByAnnualLimit = rawReductionAmount > annualLimit; const reductionAmount = Math.min(rawReductionAmount, annualLimit, input.calculatedTax);` · replacement-land-reduction.ts:151-153 동일 · self-farming은 transfer-tax-reductions-calc.ts:319 `amount = Math.min(rawAmount, selfFarmingRules.maxAmount);`(연간 1억).

도달성: `priorReductionUsage`는 신고서-전역 값이고(app/calc/transfer-tax/steps/Step5.tsx:581-582 → lib/calc/transfer-tax-api.ts:567 `priorReductionUsage: form.priorReductionUsage ?? []` → app/api/calc/transfer/engine-input.ts:176), `reductions`도 parcelMode와 무관하게 최상위로 전송된다(lib/calc/transfer-tax-api.ts:564 `reductions,` vs :621-623의 조건부 `parcels`). ⑧ validate에도 「필지 모드에서 감면 차단」 규칙이 없다(`grep -rn "parcels" lib/calc/transfer-tax-validate*.ts` 결과는 필지 자체 검증뿐).

**실패 시나리오**

과거 4개 과세연도에 §77 공익수용 감면을 합계 300,000,000 이미 받은 납세자가, 2026년에 취득시기가 다른 2필지 토지(다필지 모드)를 공익사업으로 수용당해 §77 현금보상 감면을 신청. 조특법 §133②의 5개 과세기간 누적 한도(2026년분 300,000,000)가 이미 소진되었으므로 당해 감면 가능액은 0이어야 한다. 현재 코드: `calculatePublicExpropriationReduction`이 연간 한도 200,000,000만 적용해 mpReduction = 200,000,000을 내고, :127이 그 값으로 바로 결정세액을 만든다. 같은 입력을 단필지로 넣으면 finalize.ts:332의 cap이 0으로 깎는다 — 즉 필지 분리 여부만으로 세액이 갈리는 dual-truth다.

**세액 영향**: 위 시나리오에서 최대 200,000,000 과다감면(§133② 연간 한도 전액). §69 자경농지 그룹이면 최대 100,000,000(§133① 연간 한도).

**처방**

transfer-tax-multi-parcel-branch.ts:126과 :127 사이에 형제 4경로와 동일하게 `const cap = applyReductionStatutoryCap({ reductionAmount: mpReduction, reductionTypeApplied: mpReductionTypeApplied, transferYear: input.transferDate.getFullYear(), priorUsage: input.priorReductionUsage ?? [] });`를 넣고 `mpDeterminedTax`·`totalTax`(:170)가 `cap.cappedAmount`를 쓰도록 한다. cap.step도 steps에 push해 근거를 남긴다. anchor: 다필지 + §77 + priorReductionUsage 300,000,000 → 감면 0.

---

## [D1-01] §97 「임대주택 5호 이상 임대」 주체 요건이 어느 계층에도 없다 (조특령 §97①)

- **위치**: `lib/tax-engine/transfer-reductions/rental-97-main.ts:62`
- **조문**: 조특법 §97① · 조특령 §97①·⑤4호
- **유형**: legal-accuracy · **차원**: §97·§97의2 장기임대 · **검증**: 생존 3/3

**결함**

정정 2건(결함 자체는 유지):

(1) **「1호만 임대한 거주자도 감면받는다」보다 정확히는 「엔진이 호수를 아예 모른다」**이다. 입력 타입에 호수 필드가 없으므로 0호·1호·5호가 모두 동일한 입력으로 들어오고, 결과도 동일하다(probe로 확인). 즉 「1호를 5호로 오판」이 아니라 「조특령 §97①의 주체 요건이 판정 대상에서 통째로 빠져 있다」가 정확한 서술이다. 실패 시나리오의 입력에 「1호만 임대」를 표현할 수단 자체가 없다.

(2) **실패 시나리오의 부수 주장(「§97⑤4호에 따라 5년 요건도 미달」)은 법리로는 맞지만 현행 코드의 동작 서술로는 부정확**하다. `calculateEffectiveRentalPeriod`(rental-97-shared-helpers.ts, rental-97-main.ts:73에서 호출)는 임대개시일·양도일·공실구간만 받으므로 5호 미만 기간을 차감할 입력이 없다. 주장한 시나리오에서 엔진이 산출하는 유효임대기간은 27년(1999-01-01~2026-05-01)이고, 5년 요건은 통과한다. 따라서 「5년 요건도 미달」은 조문상 결론이지 현행 엔진의 계산 결과가 아니다 — 수정 시에는 호수 요건 게이트와 §97⑤4호의 기간 차감이 **각각 별개의 입력**을 요구한다(호수 자기확인 + 5호 미만 구간).

(3) 참고로 세액 영향은 하류 캡의 영향을 받을 수 있다 — §127⑦ 후보 max(`transfer-tax-reductions-calc.ts`)와 `Math.min(best, calculatedTax)`. 단, 본 시나리오에서는 §97이 유일 후보이고 감면액 ≤ 산출세액이므로 5,000만~1억이 그대로 남는다(probe 값은 평가기 단계 실측).

**근거**

`evaluateRental97Main`의 요건 검사 목록은 ①시한(:38) ②rentalStartDate(:48) ③constructionYear(:53) ④isNationalHousing(:62 `if (input.isNationalHousing !== true)`) ⑤임대기간(:82) ⑥calculatedTax(:129) 여섯 가지뿐이고 임대 호수를 보는 코드가 없다. 반증 시도(5키워드 grep): `grep -rn "rentalUnitCount|unitCount|housingUnits|numberOfUnits|호수|5호|rentedUnits|isFiveOrMore" lib/ components/ app/` 결과 §97 관련 히트 0건(히트는 전부 상증/종부세 `ho`, NBL 5호, 미분양 라목 「같은 시·군 5호 이상」 = 다른 조문). 타입 `Rental97EvaluationInput`(transfer-reductions/types.ts:130-175)·Zod `z.literal("rental_97_main")` 객체(lib/api/transfer-tax-schema-reductions.ts:102-115)·폼 variant(lib/stores/calc-wizard-asset-reduction.ts:204-213)·UI(components/calc/transfer/rental/Rental97MainInputForm.tsx 전문 111줄) 모두 호수 필드 부재. 조문은 KoreanLaw MCP 실독(조특령 MST 287181 제97조): 「①법 제97조제1항 각 호 외의 부분 본문에서 "대통령령으로 정하는 거주자"란 임대주택을 5호 이상 임대하는 거주자를 말한다」 · 「⑤4. 5호 미만의 주택을 임대한 기간은 주택임대기간으로 보지 아니할 것」.

**실패 시나리오**

입력: 국민주택 1채만 임대(constructionYear 1998, isNationalHousing true, rentalStartDate 1999-01-01, transferDate 2026-05-01, 산출세액 100,000,000, type=rental_97_main). 현재 출력: isEligible true, reductionRate 0.5, reductionAmount 50,000,000. 조문상 올바른 출력: 5호 미만이므로 「대통령령으로 정하는 거주자」에 해당하지 않아 감면 0원(추가로 조특령 §97⑤4호에 따라 5호 미만 임대기간은 주택임대기간에도 산입되지 않으므로 5년 요건도 미달).

**세액 영향**: 산출세액 100,000,000 기준 50,000,000 과다감면(단서 선택 시 100,000,000 전액 과다감면)

**처방**

`Rental97EvaluationInput`에 임대 호수(또는 「5호 이상 임대 확인」 3-state)를 추가하고 14지점(폼·initial·normalize·④API·⑤UI·⑧validate·⑨⑩⑫Zod·⑭Route)을 동기화한 뒤 `evaluateRental97Main`에서 미충족 시 `ineligibleReasons` 추가. 조특령 §97⑤4호(5호 미만 기간 불산입)는 `calculateEffectiveRentalPeriod` 호출 전에 임대기간 구간을 잘라내는 형태로 반영. 신규 필드는 「미해당」 선택지를 두어 미입력=충족으로 읽히지 않게 할 것.

---

## [D1-02] §97의2 「신축임대 1호 포함 2호 이상 임대」 주체 요건 미검증 (조특령 §97의2①)

- **위치**: `lib/tax-engine/transfer-reductions/rental-97-2.ts:41`
- **조문**: 조특법 §97의2① · 조특령 §97의2①
- **유형**: legal-accuracy · **차원**: §97·§97의2 장기임대 · **검증**: 생존 3/3

**결함**

주장 내용은 유지하되 두 곳을 정밀화한다. (1) 결함 위치를 `rental-97-2.ts:41` 단일 지점으로 적으면 오해를 부른다 — 호수 요건은 엔진(`rental-97-2.ts`의 요건 체인)뿐 아니라 **입력 타입(`transfer-reductions/types.ts:131-175`)·Zod(`lib/api/transfer-tax-schema-reductions.ts` rental_97_2 브랜치)·router `buildInput`(`rental-97-router.ts` case "rental_97_2")·폼(`components/calc/transfer/rental/Rental972InputForm.tsx`)** 4계층 전부에 부재하므로, 수정은 엔진 가드 한 줄이 아니라 「2호 이상 임대 충족 자기확인」 필드의 신설(14 동기화 지점)이다. 저장소에 이미 같은 성격의 자기확인 패턴이 있다(`hasMinimum2Units` — 소령 §167의3 축). (2) 요건의 성격은 「임대주택 수」가 아니라 **거주자(주체) 요건**이며, 정확한 문언은 「1호 이상의 신축임대주택을 포함하여 2호 이상의 임대주택을 5년 이상 임대하는 거주자」다 — 즉 신축임대 1호 + 다른 임대주택 1호 이상의 **조합**을 요구하므로, 단순 「총 2호 이상」보다 좁다. 또한 결함은 저장소 자신의 anchor(`__tests__/tax-engine/transfer-tax/rental-97-evaluators.test.ts:241` 케이스 #7)가 호수 입력 없이 100% 면제를 단언하며 통과함으로써 **현재 고정(characterize)돼 있다** — 수정 시 이 anchor도 함께 갱신해야 한다.

**근거**

`evaluateRental972`의 요건은 시한(:28) · rentalStartDate(:38) · rental972Type(:41 `if (!input.rental972Type)`) · isNationalHousing(:48) · 5년 임대(:64) · calculatedTax(:74)뿐이고 호수 검사가 없다. 통과 시 :93-96 `reductionRate: 1.0, reductionAmount: applyRate(input.calculatedTax!, 1.0), isFullExemption: true`. 폼(components/calc/transfer/rental/Rental972InputForm.tsx — 섹션은 ①등록·신분 / ②임대 유형(1호·2호) / 국민주택 확인뿐)·Zod(lib/api/transfer-tax-schema-reductions.ts:117-123)에도 호수 필드 없음(D1-01과 동일한 5키워드 grep으로 반증 시도, 0건). 조문 실독(조특령 MST 287181 제97조의2): 「①법 제97조의2제1항 각 호 외의 부분에서 "대통령령으로 정하는 거주자"란 1호 이상의 신축임대주택…을 포함하여 2호 이상의 임대주택을 5년 이상 임대하는 거주자를 말한다」.

**실패 시나리오**

입력: 신축임대주택 1호만 보유(rental972Type="construction", isNationalHousing true, rentalStartDate 2000-01-01, transferDate 2006-01-01, 취득일 2000-01-01, 산출세액 80,000,000). 현재 출력: isEligible true, reductionAmount 80,000,000(전액 면제). 조문상 올바른 출력: 2호 이상 임대가 아니므로 감면 0원.

**세액 영향**: 산출세액 80,000,000 기준 80,000,000 전액 과다면제

**처방**

§97의2 variant에 「신축임대 포함 2호 이상 임대」 확인 필드를 신설하고(미해당 선택지 포함) `evaluateRental972`에서 미충족 시 ineligible 처리. D1-01과 요건 구조가 다르므로(5호 vs 2호) §97 필드를 그대로 재사용하지 말 것.

---

## [D1-03] §97·§97의2 공실 임계가 180일 — 조문은 조특칙 §44 「3월 이내」

- **위치**: `lib/tax-engine/transfer-reductions/rental-97-shared-helpers.ts:45`
- **조문**: 조특령 §97⑤5호 → 조특칙 §44 (§97의2는 조특령 §97의2②로 준용)
- **유형**: legal-accuracy · **차원**: §97·§97의2 장기임대 · **검증**: 생존 3/3

**결함**

§97 시리즈 공실 임계 180일은 조특령 §97의5①1호(§97의5 전용) 기준을 다른 조문에 전용한 것이다. 조특령 §97⑤5호 → 조특칙 §44는 「3월이내의 기간」을 임대기간에 산입한다고 명시하며, 이 5호는 §97의2②(「제97조제2항 내지 제6항 준용」)·§97의3④·§97의4②(각 「제97조제5항제1호ㆍ제3호 및 제5호 준용」)를 통해 §97의2·§97의3·§97의4에도 적용된다. 반면 §97의5③은 §97⑤ 중 1호·3호만 준용해 5호를 배제하므로 6개월은 §97의5에만 타당하다. ⇒ RENTAL_VACANCY_GRACE_DAYS = 180은 다섯 호출부(rental-97-main:73 · rental-97-2:59 · rental-97-3:148 · rental-97-4:100 · rental-97-5:102) 중 §97의5 하나에만 맞고 나머지 넷에 대해 틀렸다. 조문별 임계 분리가 필요하다(§97·§97의2·§97의3·§97의4 = 3월 / §97의5 = 6개월).

또한 이 결함은 엔진 상수 단독 결함이 아니라 입력 계층과 짝을 이룬다. UI는 「6개월 이상 공실 구간」만 묻고(RentalCommonFields.tsx:185·187) API 변환은 hasVacancyOver6Months === true일 때만 vacancyPeriods를 전송하므로(transfer-tax-api-reductions.ts:188-190), 90~180일 공실은 엔진에 도달조차 하지 않는다. 따라서 상수만 90으로 바꾸면 제품 세액은 변하지 않는다(no-op) — 임계 상수·UI 질문 문구·3-state 라디오·validate를 함께 고쳐야 하고, 현행 동작을 고정 중인 anchor(__tests__/tax-engine/transfer-tax/rental-97-shared-helpers.test.ts:11 A-1 「공실 151일(<180) → 차감 없이 10년」)도 함께 갱신해야 한다.

**근거**

`rental-97-shared-helpers.ts:17` `export const RENTAL_VACANCY_GRACE_DAYS = 180;` 주석 근거는 「조특령 §97의5①1호」이고, :45 `if (vpDays >= RENTAL_VACANCY_GRACE_DAYS) { deductDays += vpDays; }`. 이 함수를 `rental-97-main.ts:73`(§97)과 `rental-97-2.ts:59`(§97의2)가 그대로 호출한다. 조문 실독: 조특령(MST 287181) §97⑤5호 「제1호 또는 제3호의 규정을 적용함에 있어서 재정경제부령이 정하는 기간은 이를 주택임대기간에 산입할 것」 → 조특칙(MST 284611) 제44조(주택임대기간의 계산) 「영 제97조제5항제5호에서 "재정경제부령이 정하는 기간"이라 함은 기존 임차인의 퇴거일부터 다음 임차인의 입주일까지의 기간으로서 **3월이내의 기간**을 말한다」. §97의2는 조특령 §97의2② 「제97조제2항 내지 제6항의 규정을 준용한다」로 같은 규칙을 받는다. 반면 「6개월」은 조특령 §97의5①1호(「…6개월 이내의 기간」) — §97의5 전용이며 §97의5③은 §97⑤ 중 1호·3호만 준용한다. 입력 계층도 6개월에 맞춰져 있다: components/calc/transfer/rental/RentalCommonFields.tsx:185 「6개월 이상 공실 구간」, :187 `name="hasVacancyOver6Months"`; lib/calc/transfer-tax-api-reductions.ts:188-190은 `hasVacancyOver6Months === true`일 때만 vacancyPeriods를 전송 — 4개월 공실은 수집조차 되지 않는다.

**실패 시나리오**

입력: §97① 단서 (가) 건설임대, 신축 1998, 국민주택, 임대개시 1999-01-01, 양도 2004-03-01(총 1,886일), 공실 1건 2001-01-01~2001-05-31(150일), 산출세액 100,000,000. 현재 출력: 150 < 180이라 차감 0 → 유효 임대기간 5년 → isEligible true, reductionAmount 100,000,000(전액 면제). (UI 경로에서는 「6개월 이상 공실」에 「아니오」로 답해 vacancyPeriods가 아예 비어 같은 결과.) 조문상 올바른 출력: 150일 공실은 조특칙 §44의 3월을 초과하므로 주택임대기간에 산입되지 않아 1,886−150=1,736일 → 4년 → 5년 요건 미달 → 감면 0원.

**세액 영향**: 산출세액 100,000,000 기준 100,000,000 전액 과다면제(경계는 90~180일 공실 구간)

**처방**

§97·§97의2 전용 임계를 조특칙 §44의 「3월」로 분리하고(§97의3·§97의5의 6개월 규칙과 상수를 공유하지 말 것), ⑤UI의 「6개월 이상 공실」 질문·`hasVacancyOver6Months` 키·④API 전송 조건·⑧validate를 §97 계열에서는 3월 기준으로 함께 바꿀 것 — 상수만 고치면 입력이 수집되지 않아 no-op가 된다.

---

## [D10-01] §127⑦ 중복배제가 소득차감형↔세액감면형 사이에는 없어 두 감면이 동시 적용

- **위치**: `lib/tax-engine/transfer-tax.ts:685`
- **조문**: 조특법 §127⑦
- **유형**: legal-accuracy · **차원**: 효과축·정수연산·농특세 · **검증**: 생존 2/2
- **중복 병합**: D8-06 (같은 결함을 다른 차원이 독립 발견)

**결함**

**결함 인정. 서술 중 수치와 적용 범위만 정정한다.**

정정 1 — 세액 영향(실측 재현값). 동일 조건 프로브 실행 결과, 올바른 결과는 납세자가 유리한 §99 단독(결정 90,830,000 / 총 115,559,000)이고 현행은 결정 75,639,735 / 총 101,887,761이다. ⇒ **결정세액 15,190,265원 과소 · 총 납부세액 13,671,239원 과소.** 주장이 적은 「결정 4,136,841 / 총 3,723,158 과소」와 「§99 단독 결정 20,435,000」 등은 재현되지 않았다(같은 프로브 파일 기준).

정정 2 — 영향 범위. 「차감형↔세액감면형 사이에 §127⑦이 전혀 없다」는 **단건 정상 경로에 한정**해야 정확하다. 다건 합산 경로는 차감형 11종을 아예 차단하고(lib/calc/multi-transfer-tax-validate.ts:18 `MULTI_UNSUPPORTED_REDUCTION_TYPES`), 겸용주택(transfer-tax-mixed-use-totals.ts:345-346)·§155⑳ 임대주택(transfer-tax-rental-housing-step.ts:459-461) 경로는 차감형을 계산에서 제외하고 고지만 하므로 그 세 경로에는 이중혜택이 없다. 즉 **단건 정상 경로(전세 세액 파이프라인)의 가드 부재**다.

정정 3 — 법적 근거 보강. §127⑦만으로도 성립하지만, 「차감형은 감면이 아니다」라는 반론을 차단하는 결정적 근거는 **소득세법 §90②**(차감방식도 「양도소득세를 감면한다」)이다. 인용에 함께 넣는 것이 옳다.

수정 방향은 §127⑦ 택일 후보 집합을 **두 트랙에 걸쳐** 구성해야 한다는 것이지, 두 감면을 합산(sum)하거나 한쪽을 무조건 0으로 만드는 것이 아니다 — 납세자 선택(실무상 유리한 쪽) 1건 적용이 정본이다.

**근거**

transfer-tax.ts:685-698 `const incomeDeduction = resolveIncomeDeduction(input.reductions, {...}); ... if (incomeDeduction.appliedId) { transferIncome = Math.max(0, transferIncomeBefore993 - incomeDeduction.reducible); }` — 여기서 감면 후 소득금액으로 과세표준·산출세액이 만들어지고, 그 산출세액을 받아 transfer-tax-finalize.ts:302 `} = calcReductions(taxResult.calculatedTax, input.reductions, ...)` 가 별도로 세액감면을 또 계산한다. §127⑦ max(`transfer-tax-reductions-calc.ts:367-370` `candidates.reduce(...)`)는 A 트랙 후보 배열 안에서만 돈다.

입력 경로도 열려 있다: `components/calc/transfer/UnifiedReductionPanel-defaults.ts:71-89` `toggleGroupRadio`가 **같은 카테고리만** 제거한다(`return cat !== category;`) — new_housing 그룹 라디오와 standalone 체크박스(`UnifiedReductionPanel.tsx:181-188` `toggleStandalone`)는 서로 독립이다. 자산종류 게이트도 막지 않는다(`asset-kind-gate.ts:97-99` standalone → `return true`). ⑧ validate에도 교차 차단이 없다(`grep -rn "127|중복배제|하나만" lib/calc/*.ts` → 해당 규칙 0건).

조문 실측(KoreanLaw MST 280409, 시행 2026-01-01) §127⑦: 「거주자가 토지등을 양도하여 **둘 이상의 양도소득세의 감면규정을 동시에 적용받는 경우에는 그 거주자가 선택하는 하나의 감면규정만을 적용한다**」. §99 제목은 「신축주택의 취득자에 대한 양도소득세의 **감면**」, §77 제목은 「공익사업용 토지등에 대한 양도소득세의 **감면**」이므로 둘 다 명백한 감면규정이다.

실측(scratchpad 프로브, mock 세율, 양도가 8억·취득 1억·취득 1998-07-01·양도 2022-08-01·2주택):
- §99 단독 → 차감 105,000,000 / 과표 102,500,000 / 산출 20,435,000 / 결정 20,435,000 / 총 30,173,500
- §77 단독 → 산출 58,910,000 / 감면 5,891,000 / 결정 53,019,000 / 총 59,499,100
- **둘 다 선택 → 차감 105,000,000 AND 감면 4,136,841 동시 적용 / 결정 16,298,159 / 총 26,450,342**

**실패 시나리오**

1998년 신축주택(§99 대상)을 보유하다 2022년 공익사업으로 수용(§77)된 2주택자가 UI에서 「신축주택 §99」 라디오와 「§77 공익수용」 체크박스를 함께 켠다 → 현재 결정세액 16,298,159(총 26,450,342). §127⑦상 올바른 결과는 납세자가 유리한 하나(§99)만 적용한 결정세액 20,435,000(총 30,173,500).

**세액 영향**: 결정세액 4,136,841원 과소 · 총 납부세액 3,723,158원 과소 (위 프로브 조건). 감면율·소득 규모에 비례해 커진다.

**처방**

§127⑦ 판정을 두 트랙 위로 끌어올린다 — STEP 4.6의 차감형 후보와 STEP 8의 세액감면 후보를 같은 max 비교 대상에 넣고 하나만 적용하거나(현행 max 패턴 유지), 최소한 ⑧ validate·⑤ UI에서 「차감형 1건 + 세액감면형 1건」 동시 선택을 차단한다. 트랙 간 어느 쪽이 유리한지는 산출세액을 두 번 구해야 알 수 있으므로 엔진 층 처리가 정본이다.

---

## [D10-02] 다필지(§166 토지) 분기가 농어촌특별세를 아예 계산하지 않는다

- **위치**: `lib/tax-engine/transfer-tax-multi-parcel-branch.ts:170`
- **조문**: 농어촌특별세법 §5①1호 · 시행령 §4①1호
- **유형**: arithmetic · **차원**: 효과축·정수연산·농특세 · **검증**: 생존 3/3

**결함**

다필지(소령 §166) 조기반환 분기는 세액감면형 감면(§77·§77의2·§77의3·§69·§97 시리즈)을 계산해 결정세액에서 차감하면서도 「농어촌특별세법」 §5①1호의 농특세(감면세액×20%)를 계산하지 않는다 — `transfer-tax.ts:488`의 조기 반환이 정상경로 STEP 8.8(`transfer-tax-finalize.ts:462-492`, 단일 소스 `resolveTaxCreditRuralSurtax`)을 건너뛰고, `transfer-tax-multi-parcel-branch.ts:170 totalTax`에도 농특세 항이 없다. **단, 세액 과소는 단건(단일 자산) 경로에 한정된다** — 다건 집계 경로는 `transfer-tax-aggregate.ts:467 computeAggregateTaxCreditRuralSurtax`가 자산별 `reductionTypeApplied`로 농특세를 재계산하므로 다필지 자산이 포함돼도 정상 부과된다(실측: 감면 23,944,250 → 농특 4,788,850). 과소액은 「비과세로 열거되지 않은 감면세액 × 20%」이며(§69 자경농지는 비과세라 영향 없음, §77은 「직접 경작한 토지」가 아닌 경우 과세), 주장에 제시된 4,770,600은 특정 fixture 값이다 — 동일 구조를 다른 입력으로 재현하면 3,397,200(감면 16,986,000 × 20%)이 나온다. `TransferTaxResult.ruralSurtax`가 optional(`transfer-result.types.ts:249`)이라 타입체크로는 잡히지 않는 침묵 누락이다.

**근거**

`grep -c ruralSurtax lib/tax-engine/transfer-tax-multi-parcel-branch.ts` → **0**. 파일은 transfer-tax-multi-parcel-branch.ts:108 `} = calcReductions(mpTaxResult.calculatedTax, input.reductions, ...)` 로 감면을 구하고 :127 `const mpDeterminedTax = truncateToWon(Math.max(0, mpTaxResult.calculatedTax - mpReduction));` 로 결정세액을 만든 뒤 :170 `totalTax: mpDeterminedTaxWithPenalty + mpLocalIncomeTax + mpFilingDelayedPenalty,` 로 끝낸다 — 농특세 항이 없다. 단건 정상경로는 transfer-tax-finalize.ts:462-490 `resolveTaxCreditRuralSurtax(...)` → :492 `const ruralSurtaxTotal = ruralSurtax993 + ruralSurtaxHybrid + ruralSurtaxCredit;` 로 반영한다.

조문 실측: 농어촌특별세법(MST 285905) §5①1호 「조세특례제한법 … 에 따라 감면을 받는 소득세 … 의 감면세액 × 100분의 20」. 비과세는 열거주의이고(§4 2호 + 시행령 §4①1호, MST 280835) §77은 「거주자가 **직접 경작한 토지**로 한정」해서만 비과세다.

실측(scratchpad 프로브, 동일 입력에 `parcels`만 추가):
- 단필지 → 산출 238,530,000 / 감면 23,853,000(§77) / **농특 4,770,600** / 총 240,915,300
- 다필지 2필지 → 산출 238,530,000 / 감면 23,853,000(§77) / **농특 undefined** / 총 236,144,700

**실패 시나리오**

2010년 취득한 2필지 토지가 2020년 공익사업으로 수용(현금보상 10억)돼 §77 감면 23,853,000을 받는 경우 → 현재 총 납부세액 236,144,700 (농특세 0). 올바른 값은 감면세액 × 20% = 4,770,600을 더한 240,915,300 (직접 경작 토지가 아닌 경우).

**세액 영향**: 4,770,600원 과소 (위 프로브). 일반화하면 감면세액 × 20% 전액 누락.

**처방**

다필지 분기에서도 `resolveTaxCreditRuralSurtax`(단일 소스)를 호출해 `ruralSurtax` 필드와 `totalTax`에 반영한다. 같은 분기가 `applyReductionStatutoryCap`(§133 5년 누적)도 호출하지 않아 uncapped `mpReduction`으로 결정세액을 만드는데, 두 누락을 함께 고치는 것이 안전하다.

---

## [D11-01] 다건(연간합산) 경로 ⑬⑭에 §77 자경 여부 미배선 — 농특세 20% 오부과

- **위치**: `lib/calc/multi-transfer-tax-api.ts:122`
- **조문**: 농어촌특별세법 시행령 §4①1호 (조특법 §77)
- **유형**: wiring · **차원**: 배선 14지점·결과뷰 · **검증**: 생존 3/3

**결함**

결함 성립. 다만 세 가지를 정정·보강한다.

**(1) 「⑬ 미배선」이 아니라 ⑬·⑭ 이중 갭이다 — ⑬만 고치면 세액이 1원도 안 움직인다.** 뮤테이션 probe로 실측했다: 다건 payload에 `isSelfCultivatedExpropriatedLand: true`를 강제 주입해도 결과가 완전히 동일했다(ruralSurtax 6,855,504 → 6,855,504). app/api/calc/transfer/multi/route.ts:103-160의 `base` 객체가 단건 헬퍼 `buildTransferEngineInput`을 재사용하지 않고 키를 자체 열거하기 때문이다. 수정은 ⑬(multi-transfer-tax-api.ts 반환 객체, 단건 transfer-tax-api.ts:508-511과 동일한 `(primary.reductions ?? []).some(...) || undefined` 규약)과 ⑭(multi/route.ts base 객체) **양쪽**에 필요하다. 주장 제목의 「⑬⑭에 전혀 없다」는 정확하나, 본문의 심각도 서술이 이중 갭임을 명시하지 않아 ⑬ 단독 수정으로 오독될 여지가 있다.

**(2) 세액 수치는 가정이 아니라 실측이다.** 주장은 「감면세액 50,000,000이면 10,000,000」이라는 가정 예시를 들었으나, 실제 두 route를 같은 폼 입력(토지·양도가 10억·취득가 1억·취득 2010-01-01·양도 2026-03-01·공익수용·사업인정고시 2024-01-01·직접경작 예)으로 호출한 실측값은 다음과 같다:
- 다건: reductionAmount 34,277,521 → **ruralSurtax 6,855,504** (step 문구 「비과세 열거 제외분」)
- 단건: reductionAmount 34,141,500 → **ruralSurtax 0**, totalTax 212,815,350
⇒ 「같은 입력에서 두 화면이 갈린다」는 주장은 **농특세 축에서 정확히 사실**이다. 다만 reductionAmount 자체도 34,141,500 vs 34,277,521로 다른데, 이는 aggregate가 합산 과세표준에서 감면을 재산정하는 별개 메커니즘이며 **이 결함의 일부가 아니다**(혼동 주의).

**(3) 단건 ⑭ 인용 위치 보정.** 주장은 단건 ⑭을 `app/api/calc/transfer/route.ts:401`로 지목했으나, 그 줄은 **겸용주택(mixed-use) dispatch 분기** 내부다(인접 줄이 `data.mixedUse.partialUsageChange`). 일반 단건 경로의 ⑭ 정본은 `app/api/calc/transfer/engine-input.ts:72` `isSelfCultivatedExpropriatedLand: data.isSelfCultivatedExpropriatedLand,`이다. 두 곳 다 필드를 보유하므로 「단건은 정상」이라는 결론은 영향받지 않는다.

나머지 근거(⑫ transfer-tax-schema.ts:145 + propertyItemSchema:679 spread로 열림 · 소비층 aggregate-reduction-step.ts:274 실재 · ⑧ 차단 없음 · ⑤ UI 도달 가능 · 다건 anchor가 엔진 직접 호출이라 ⑬⑭ 사각지대 · 농특세령 §4①1호 원문)는 전부 원문·실측과 일치한다.

**근거**

실측 grep 카운트 0건 — `grep -c "isSelfCultivatedExpropriatedLand" lib/calc/multi-transfer-tax-api.ts` → 0, `grep -c ... app/api/calc/transfer/multi/route.ts` → 0. 단건 ④는 `lib/calc/transfer-tax-api.ts:508` 에서 `isSelfCultivatedExpropriatedLand: (primary.reductions ?? []).some((r) => r.type === "public_expropriation" && r.expropriationSelfCultivated === true) || undefined,` 로 올리고, 단건 ⑭는 `app/api/calc/transfer/multi/route.ts` 가 아니라 `app/api/calc/transfer/route.ts:401` `isSelfCultivatedExpropriatedLand: data.isSelfCultivatedExpropriatedLand,` 로 매핑한다. ⑫는 열려 있다 — `lib/api/transfer-tax-schema.ts:145` `isSelfCultivatedExpropriatedLand: z.boolean().optional(),` 이 propertyBaseShape에 있고 `propertyItemSchema`(:683 `...propertyBaseShape`)가 이를 spread한다. 소비층은 실재한다 — `lib/tax-engine/transfer-tax-aggregate-reduction-step.ts:274` `isSelfCultivatedExpropriatedLand: (rec.item as { isSelfCultivatedExpropriatedLand?: boolean }).isSelfCultivatedExpropriatedLand,`. ⑤ 입력 UI도 실재·도달 가능하다 — `components/calc/transfer/ExpropriationBlock.tsx:206-209` 라디오 「직접 경작한 토지 여부」, 렌더 체인 CompanionAssetCard:345 → AssetSectionTransfer:59 → TransferModeBlock:161, 그리고 다건 Step B는 단건 마법사를 그대로 재사용한다(`app/calc/transfer-tax/multi/MultiTransferTaxCalculator.tsx:39 import TransferTaxCalculator from "../TransferTaxCalculator";`). ⑧도 막지 않는다 — `lib/calc/multi-transfer-tax-validate.ts:18`의 차단 집합은 `ALL_INCOME_DEDUCTION_IDS` 11종뿐이고 `public_expropriation`은 없다. 조문 본문은 KoreanLaw MCP 실독(농특세법 시행령 MST 280835 §4①1호): 「「조세특례제한법」 제66조부터 제70조까지, … 제77조[「조세특례제한법」 제69조제1항 본문에 따른 거주자가 직접 경작한 토지(8년 이상 경작할 것의 요건은 적용하지 아니한다)로 한정한다] … 에 따른 감면」. 안전망: 다건 anchor `__tests__/tax-engine/transfer/rural-surtax-tax-credit.anchor.test.ts:173` 는 `properties: [item("a1"), item("a2", { isSelfCultivatedExpropriatedLand: true })]` 로 **엔진을 직접** 호출해 ⑬⑭를 태우지 않는다.

**실패 시나리오**

다건(연간 합산) 마법사에서 농지 1건을 넣고 양도원인=공익수용, §77 감면 선택, 「직접 경작한 토지 여부 = 예」 선택. 감면세액이 50,000,000원이면 → 현재 출력: 농어촌특별세 10,000,000원 부과(`transfer-tax-rural-surtax.ts:146` `applyRate(reductionAmount, RURAL_SURTAX_RATE)`, `RURAL_SURTAX_RATE = 0.2` at :39) 및 총 납부세액 +10,000,000. → 올바른 출력: 농어촌특별세 0원(농특세령 §4①1호 괄호). 같은 입력을 단건 계산기에 넣으면 0원이 나와 두 화면이 갈린다.

**세액 영향**: 감면세액 × 20%. 예: 감면세액 50,000,000 → 10,000,000원 과다. §133② 연간 한도 2억이 다 찬 경우 최대 40,000,000원 과다.

**처방**

⑬ `lib/calc/multi-transfer-tax-api.ts` `buildPropertyPayload` 반환 객체에 단건 ④(`transfer-tax-api.ts:508`)와 **같은 leaf**로 `isSelfCultivatedExpropriatedLand`를 넣고(규칙 복제 금지 — 공용 헬퍼로 추출), ⑭ `app/api/calc/transfer/multi/route.ts:103` 의 `data.properties.map` 매핑에 `isSelfCultivatedExpropriatedLand: p.isSelfCultivatedExpropriatedLand,` 를 추가한다. 회귀 anchor는 **route를 통과하는** 경로(POST /api/calc/transfer/multi)로 작성해야 한다 — 엔진 직접호출 anchor는 이 갭을 못 본다.

---

## [D2-01] §97의4① 단서(§95② 단서=표2 1세대1주택) 미구현 — 장특공제율 90% 발생

- **위치**: `lib/tax-engine/transfer-tax-lthd.ts:441`
- **조문**: 조특법 §97의4① 단서 · 소득세법 §95②
- **유형**: legal-accuracy · **차원**: §97의3·4·5 LTHD축 · **검증**: 생존 3/3
- **심각도 조정**: critical → high (검증 결과)

**결함**

**결함은 성립한다.** 다만 세 지점을 정정한다.

(a) **위치·라인 정정**: 결함 라인은 :441(주석)이 아니라 **transfer-tax-lthd.ts:443** `const combined = rate + rental97Eval.additionalRate;`(분기 :436-455). 부수 인용도 :275→**:269**(`const useTable2`), :277→**:270-271**(`rateForYears`)로 정정(:348은 정확).

(b) **근거 프로브의 사실관계가 법적으로 비정합했다 — 그러나 결론은 유지된다.** 제보 프로브(보유 12년 · residencePeriodMonths=130 = 거주 10.8년 · 임대 11년)는 거주+임대 21.8년이 보유 12년을 초과해 실재할 수 없다(민특법 등록 임대주택을 임대하면서 동시에 자가 거주 불가). 그러나 **정합한 사실관계로도 90%는 도달한다**: 2006-01-01 취득 → 2026-01-01 양도(보유 20년), 2006~2016 거주 10년(표2 거주분 40%), 2016~2026 임대 10년(§97의4 추가율 10%), 1세대1주택 고가주택. `calculateTransferTax` 전체 관통 실측(양도 30억·취득 5억) → LTHD율 **0.9**(법정 상한 0.8 초과)·공제 1,350,000,000(정상 1,200,000,000, **150,000,000 과다**)·**총부담 39,803,500 vs 102,421,000 = 62,617,500 과소**.

(c) **과다공제의 일반형**: 항상 `추가공제율 × 과세 양도차익`이며 추가공제율은 임대기간에 따라 **2%~10%p**다. 「90%」는 보유 20년+·거주 10년+·임대 10년+가 겹치는 최대치이고, 6~7년 임대면 2%p다.

(d) **추가 지적(제보 미포함)**: `lib/tax-engine/transfer-reductions/rental-97-4.ts:5` 주석이 이 단서를 「§95① 단서(미등기 양도 등)」로 **명시적으로 오독**하고 있다. §95①에는 단서가 없고 미등기 배제는 §95② 본문 괄호이며 이미 transfer-tax-lthd.ts:74-76 L-0가 처리한다. 수정 시 이 주석을 함께 정정해야 재발하지 않는다.

(e) **안전망 0**: 기존 anchor `__tests__/tax-engine/transfer-tax/rental-97-4-integration.test.ts`는 3건 모두 `householdHousingCount: 2, // 12억 비과세 미적용`(:22)으로 표2를 의도적으로 회피 — 표2×§97의4 조합은 한 번도 검증된 적이 없다. 수정 전 표2 조합 anchor 선행이 필요하다.

**근거**

transfer-tax-lthd.ts:436-449 — `if (rate > 0) { const combined = rate + rental97Eval.additionalRate; const combinedDeduction = applyRate(taxableGain, combined); ...`. 여기서 `rate`는 :348 `const rate = rateForYears(holding.years);` = :277 `calcLongTermRate(years, residenceYears, useTable2)`로, :275 `const useTable2 = isOneHouseForTable2 && table2ResidenceYears >= 2;`가 true면 표2(보유40%+거주40%)다. 표2 여부를 보는 분기가 §97의4 경로에 전혀 없다(rental-97-4.ts 전문에 isOneHousehold·table2·§95 관련 식별자 0건).
조문 실측(KoreanLaw MST 280409 §97의4①): 「…같은 조 제2항에 따른 보유기간별 공제율에 … 추가공제율을 더한 공제율을 적용한다. **다만, 같은 항 단서에 해당하는 경우에는 그러하지 아니하다.**」 — 「같은 조 제2항」 직후의 「같은 항」은 §95②이고, 소득세법 §95①에는 단서가 아예 없다(MST 280405 §95① 전문 1문장). §95② 단서는 「다만, 대통령령으로 정하는 1세대 1주택(이에 딸린 토지를 포함한다)에 해당하는 자산의 경우에는 … 표 2 …」다. 미등기양도 배제는 §95② **본문 괄호**(제104조제3항)이지 단서가 아니다.
뮤테이션 아닌 직접 실측(tsx probe, calcLongTermHoldingDeduction 직접 호출): 취득 2014-01-01·양도 2026-01-01·isOneHousehold=true·householdHousingCount=1·residencePeriodMonths=130·taxableGain 1,000,000,000, reductions=[rental_97_4(등록 2014-06-01·임대개시 2014-07-01·isTaxRegistered)] → `rate: 0.9  deduction: 900000000`. 같은 입력에서 reductions=[] → `rate: 0.8  deduction: 800000000`.

**실패 시나리오**

1세대1주택(보유 12년·거주 10년) + §97의4 선택, 과세 양도차익 1,000,000,000원 → 현재 장기보유특별공제 900,000,000원(공제율 90%). 조문상 §97의4① 단서로 추가공제율이 배제되므로 표2 그대로 800,000,000원(80%)이어야 한다.

**세액 영향**: 장기보유특별공제 100,000,000원 과다(실측). 그만큼 과세표준이 줄어 과소과세 — 세액 차이는 적용 세율구간에 종속한다(최고 45% 구간이면 약 45,000,000원 + 지방소득세 10%).

**처방**

`transfer-tax-lthd.ts`의 §97의4 분기 진입 전에 §95② 단서 해당(=표2 적용, 이미 :275 `useTable2`로 계산돼 있다) 여부를 보고, 해당하면 추가율을 가산하지 않고 표2 공제만 반환한다. 판정 술어는 새로 만들지 말고 `useTable2`를 그대로 쓴다. 배제 시 `rental97LthdDetail.ineligibleReasons`에 「§97의4① 단서 — 소득세법 §95② 단서(1세대1주택 표2) 적용 대상」 사유를 실어 결과 화면에서 사라지지 않게 한다.

---

## [D2-02] §97의3 「10년 이상 계속 등록」(령 §97의3②) 미검증 — 등록 1년에 70% 특례 통과

- **위치**: `lib/tax-engine/transfer-reductions/rental-97-3.ts:157`
- **조문**: 조특법 §97의3①1호 · 조특령 §97의3②·④
- **유형**: legal-accuracy · **차원**: §97의3·4·5 LTHD축 · **검증**: 생존 3/3

**결함**

§97의3 임대기간(10년/8년) 판정이 조특령 §97의3④의 임대개시일 의제(「등록하여 임대하는 날부터 임대를 개시한 것으로 본다」)를 적용하지 않아, 등록일보다 앞선 임대개시일이 입력되면 등록 이전 기간까지 10년 요건에 산입된다. 결과적으로 령 §97의3②의 「10년 이상 계속 등록 + 등록기간 중 통산 10년 임대」 요건이 검증되지 않는다.

원 주장의 「등록일을 전혀 보지 않고」는 부정확하다 — `registrationDate`는 (a) 필수 입력 검사(rental-97-3.ts:71), (b) 등록 시한 ≤2027.12.31(period-check.ts:61), (c) 2023-01-01 이전 등록분 8년 50% 경과규정 분기(:153-155)에는 실제로 쓰인다. 누락된 것은 **임대기간 기산점으로서의 사용**(등록일 대비 임대개시일 클램프)과 **등록기간 길이 검증**이다.

영향 범위는 70% 분기에 한정되지 않는다 — 동일 산식이 8년 50% 경과규정 분기에도 그대로 쓰이므로 등록 1년차에 50%도 통과한다. 또한 조기 임대개시일 입력은 `rentalStartDate ≤ acquisitionDate`를 만들어 령 §97의3⑤ 안분비율을 1로 고정하므로(probe 실측 `rentalGainRatio:1`), 등록 후 임대기간분에만 적용돼야 할 특례율이 전체 양도차익에 적용되는 2차 과다공제가 겹친다.

세액 영향 수치는 주장의 「250,000,000원」이 mock 세율(일반 표1 0.2) 기준 probe 값이다 — 실제 소득세법 §95② 표1은 11년 보유 시 22%이므로 동일 조건 실무 오차는 약 240,000,000원이다. 자릿수·방향(납세자 유리 방향의 과다공제)은 그대로다.

완전 교정의 범위: 최소·확실한 수정은 령 §97의3④에 따라 임대기간 기산점을 `max(registrationDate, rentalStartDate)`로 클램프하는 것이다. 다만 령 §97의3②의 「**계속하여** 등록」(중도 말소·재등록 없음)까지 검증하려면 등록 말소 구간 입력 필드가 필요한데 현 저장소에 없다(`vacancyPeriods`는 공실 구간이지 등록말소가 아님) — 이 부분은 별도 필드 신설 없이는 구현 불가.

**근거**

rental-97-3.ts:147-157 — `if (input.rentalStartDate) { eligibleRentalYears = calculateEffectiveRentalPeriod(input.rentalStartDate, input.transferDate, input.vacancyPeriods ?? []); … if (eligibleRentalYears >= RENTAL_97_3_MANDATORY_YEARS) { overrideRate = RENTAL_97_3_OVERRIDE_RATE; }`. `registrationDate`는 :153-155에서 `isPre2023Registration`(8년 50% 경과규정 분기)에만 쓰이고, 등록일↔임대개시일·등록기간 길이를 비교하는 코드는 없다. 반증 시도: `grep -rn "officialPriceAtStart|600_000_000|2018-03-31|167의3" rental-97-4.ts period-check.ts transfer-tax-validate-reductions.ts rental-97-router.ts`와 `grep -rn "rentalStartDate" lib/calc/`로 ⑧ validate·⑫ Zod·period-check 전수 확인 — 등록기간 검증 0건(period-check.ts:59-63의 rental_97_3 규칙은 `before(c.registrationDate, D("2027-12-31"))` 상한 하나뿐).
조문 실측(KoreanLaw MST 287181 조특령 §97의3②): 「…장기일반민간임대주택등으로 10년 이상 계속하여 등록되어 있고, 그 등록 기간 동안 통산하여 10년 이상 임대한 경우로 한다.」 같은 조 ④는 「…사업자등록과 임대사업자등록을 하고 장기일반민간임대주택등으로 **등록하여 임대하는 날부터** 임대를 개시한 것으로 본다」로, 임대개시일이 등록일보다 앞설 수 없음을 못박는다.
probe 실측(tsx, evaluateRental973 직접 호출): 등록 2020-01-01·임대개시 2010-01-01·취득 2010-01-01·양도 2021-01-01 → `{"isEligible":true,"overrideRate":0.7,"rentalGainRatio":1,"eligibleRentalYears":11}`. 같은 입력을 calcLongTermHoldingDeduction(taxableGain 500,000,000)에 넣으면 `rate 0.7 / deduction 350000000`, reductions=[]이면 `rate 0.2 / deduction 100000000`.

**실패 시나리오**

임대개시 2010-01-01·장기일반민간임대 **등록 2020-01-01**(등록기간 1년)·양도 2021-01-01, 과세 양도차익 500,000,000원 → 현재 70% 특례가 적용돼 장기보유특별공제 350,000,000원. 령 §97의3②상 등록기간이 10년에 미달하므로 특례는 배제되고 일반 표1 공제 100,000,000원이어야 한다.

**세액 영향**: 장기보유특별공제 250,000,000원 과다(실측).

**처방**

`evaluateRental973`에 ① `rentalStartDate < registrationDate`이면 임대개시일을 등록일로 재기산하거나 불적용 사유(령 §97의3④)를 push, ② `differenceInYears(transferDate, registrationDate) < 10`이면 `REGISTRATION_PERIOD_SHORT` 사유를 push. 8년 50% 경과규정 분기(:159)에도 같은 등록기간 기준을 적용한다. `evaluateRental975`(rental-97-5.ts:107)도 령 §97의5①이 같은 구조(「10년 이상 계속하여 등록하고, 그 등록한 기간 동안 계속하여 10년 이상 임대」)이므로 동일하게 손본다.

---

## [D2-03] §97의5 임대기간 안분이 §97의3 산식을 재사용 — 분자가 조문과 다름(감면 과소)

- **위치**: `lib/tax-engine/transfer-reductions/rental-97-5.ts:119`
- **조문**: 조특령 §97의5② (vs 조특령 §97의3⑤)
- **유형**: arithmetic · **차원**: §97의3·4·5 LTHD축 · **검증**: 생존 3/3

**결함**

결함은 성립한다. 다만 서술을 두 가지 정정·보강한다.

**정정 1 — 어긋난 항이 하나가 아니라 둘이다.** 주장은 분자의 감수(取得당시 vs 임대개시)만 지적하지만, 코드의 분자는 피감수(minuend)도 조문과 다르다.
- 조특령 §97의5② 분자: (**임대기간의 마지막 날**의 기준시가 − **취득당시** 기준시가)
- 코드 분자: (**양도시** 기준시가 − **임대개시시** 기준시가) — `rental-97-shared-helpers.ts:123`

즉 코드는 §97의5②의 두 항을 모두 다른 시점으로 치환하고 있다. 「임대기간 마지막 날 = 양도일」이 성립하는 사안에서만 피감수 치환이 무해하고, §97의5①2호는 「10년 이상 계속하여 임대한 **후 양도**」라 임대 종료일이 양도일보다 앞설 수 있으므로 그 전제가 항상 참은 아니다. (같은 이유로 이 공유 헬퍼는 §97의3⑤의 B「실제 임대기간의 마지막 날」과도 어긋난다 — 별건 결함이며 여기서는 범위 밖으로 남긴다.)

**정정 2 — 「과소」 방향은 보편적이지 않다.** 코드비율 − 법정비율 = ((양도시 − 임대종료시) + (취득시 − 임대개시시)) / (양도시 − 취득시).
- 임대가 양도일까지 계속되고 기준시가가 상승한 통상 사안(제보 실측 시나리오): 항상 **과소감면**. 격차는 취득시↔임대개시시 기준시가 차이에 비례. ✔ 주장대로다.
- 임대 종료 후 상당 기간 뒤에 양도한 사안: (양도시 − 임대종료시)가 커져 코드가 법정치를 **초과**하는 과다감면도 산술적으로 가능하다.

따라서 「감면 과소」는 mainline 사안의 실측 결과이지 전 사안의 성질은 아니며, 정확히는 **법정 산식과의 양방향 괴리**다.

**보강 — 부수 효과 2건.**
(a) 법정 산식에서는 임대가 양도일까지 계속되면 분자=분모로 ratio가 1이 되어 기준시가 값 자체가 결과를 좌우하지 않는데, 현행 코드는 `rentalStartDate > acquisitionDate`이기만 하면 3점 미입력 시 `MISSING_PRORATION_PRICES`로 **감면 전체를 불적용**시킨다(`rental-97-5.ts:126-134`). 산식 정정 시 이 차단 조건의 사정범위도 함께 재검토가 필요하다.
(b) 조특령 §97의5② 후단 「새로운 기준시가가 고시되기 전에 취득 또는 양도하거나 임대기간의 마지막 날이 도래하는 경우에는 **직전의 기준시가**를 적용한다」는 현재 어디에도 구현돼 있지 않다(별건).

**근거**

rental-97-5.ts:118-125 — `const ratio = calcRentalGainRatio({ rentalStartDate…, acquisitionDate…, stdPriceAtAcquisition…, stdPriceAtRentalStart: input.stdPriceAtRentalStart ?? input.officialPriceAtStart, stdPriceAtTransfer… });`
rental-97-shared-helpers.ts:120-124 — `const denominator = transfer - acq; if (denominator <= 0) return null; const ratio = (transfer - start) / denominator;` (= (양도시 − 임대개시시)/(양도시 − 취득시)). 같은 파일 헤더 주석은 「임대기간 분 양도차익 비율 (조특령 §97의3⑤·§97의5② 기준시가 안분)」이라고 두 조문을 한 산식으로 묶어 놓았다 — 이것이 결함의 뿌리다.
조문 실측(KoreanLaw MST 287181 조특령 §97의5②): 「「소득세법」 제95조제1항에 따른 양도소득금액 × (제1항에 따른 임대기간의 마지막 날의 기준시가 − 취득당시 기준시가) ÷ (양도 당시 기준시가 − 취득 당시 기준시가)」. 같은 령 §97의3⑤은 「A × (B−C)/(D−E), B: 실제 임대기간의 마지막 날의 기준시가, C: 실제 임대기간의 **개시일**의 기준시가」로 분자가 다르다.
probe 실측(tsx, evaluateRental975): 취득 2018-06-01(기준시가 300,000,000)·등록 2018-08-01·임대개시 2018-09-01(기준시가 320,000,000)·양도 2029-07-01(기준시가 600,000,000)·calculatedTax 100,000,000 → `{"reductionAmount":93333333,"rentalGainRatio":0.9333333333333333}`. 법정 산식 (600,000,000−300,000,000)/(600,000,000−300,000,000)=1.0 → 감면 100,000,000.

**실패 시나리오**

위 실측 입력(§97의5①1호 3개월 내 등록 요건 충족, 임대가 양도일까지 계속) → 현재 감면세액 93,333,333원. 조특령 §97의5② 산식으로는 100,000,000원(전액)이어야 한다.

**세액 영향**: 감면세액 6,666,667원 **과소**(산출세액 100,000,000원 기준 실측). 취득시↔임대개시시 기준시가 격차가 클수록 커진다 — 납세자에게 불리한 방향.

**처방**

`calcRentalGainRatio`를 §97의3용으로 남기고 §97의5 전용 비율 함수를 분리한다(분자 = 임대기간 마지막 날 기준시가 − 취득당시 기준시가). 두 조문이 공유하는 것은 분모((양도시 − 취득시) 기준시가)뿐이다. 헬퍼 헤더 주석의 「§97의3⑤·§97의5②」 겸용 표기도 함께 정정한다.

---

## [D2-04] §97의4 대상 요건(령 §97의4①→소령 §167의3①2호가목·다목) 미검증 — 기준시가 6억/3억 한도·2018.3.31 등록 한정 부재

- **위치**: `lib/tax-engine/transfer-reductions/rental-97-4.ts:51`
- **조문**: 조특령 §97의4① · 소득세법 시행령 §167의3①2호 가목·다목
- **유형**: legal-accuracy · **차원**: §97의3·4·5 LTHD축 · **검증**: 생존 3/3

**결함**

주장은 성립하나 **누락 범위가 서술보다 넓다**. 정정: 「§97의4는 조특령 §97의4①→소령 §167의3①2호 **가목·다목**의 장기임대주택에만 적용되는데, `evaluateRental974`(rental-97-4.ts:51-133)는 그 목별 요건을 **하나도** 검증하지 않는다 — (a) 임대개시일 당시 주택+부수토지 기준시가 합계 한도(가목 6억, 수도권 밖 3억 / 다목 6억), (b) 2018.3.31까지 사업자등록등 한정(가목·다목 공통 단서 — 사실상 그 이후 등록분은 §97의4 대상이 아니다), (c) 가목/다목 구분 자체(민간매입 1호 이상 vs 건설임대 2호 이상), (d) 다목의 대지 298㎡·연면적 149㎡ 요건. 검증되는 것은 2014-01-01 하한(period-check.ts:64-68)·필수입력·임대료 5%·6년 임대뿐이다. 입력 경로도 ⑤(Rental974InputForm.tsx 전문에 가액 위젯 0건)·⑧(transfer-tax-validate-reductions.ts:179가 97_3·97_5만 요구)·⑫(transfer-tax-schema-reductions.ts:139-144에 officialPriceAtStart 부재)·④(transfer-tax-api-reductions.ts:206)·router(rental-97-router.ts:80) 5계층 모두 끊겨 있다. 덧붙여 router가 넘기는 `region`은 evaluator가 한 번도 읽지 않는 **사문 필드**여서, 가액 한도의 수도권/비수도권 분기를 붙일 자리는 이미 배선돼 있으나 소비되지 않는 상태다. 세액 영향·심각도(high)는 주장대로.

**근거**

rental-97-4.ts 전문(133줄)에 걸리는 요건은 시한(:56 `checkReductionPeriod("rental_97_4", input)`), 필수입력(:66-78), 임대료 5%(:81-95), 6년 이상 임대(:105)뿐이다. 기준시가 관련 식별자 0건 — `grep -n "officialPriceAtStart|600_000_000|2018-03-31|167의3" rental-97-4.ts` → :8·:80의 **주석 언급 2건만** 히트.
입력 자체가 끊겨 있다: rental-97-router.ts:79-80 `case "rental_97_4": return { ...base, region: r.region };` — `officialPriceAtStart`를 넘기지 않는다(§97의3은 :72, §97의5는 :82에서 넘긴다). ⑫ Zod `transfer-tax-schema-reductions.ts:140-144`의 rental_97_4 객체에도 `officialPriceAtStart` 없음. ⑧ `transfer-tax-validate-reductions.ts:179`는 `(r.type === "rental_97_3" || r.type === "rental_97_5")`만 기준시가를 요구한다. ⑤ `components/calc/transfer/rental/Rental974InputForm.tsx` 전문에 기준시가 입력 위젯 없음.
시한도 상한이 없다 — period-check.ts:64-68 `rental_97_4: { label: "임대등록 2014.1.1~", check: (c) => c.registrationDate !== undefined && c.registrationDate >= D("2014-01-01") }`.
조문 실측: 조특령 §97의4①(MST 287181) 「법 제97조의4제1항에서 "대통령령으로 정하는 주택"이란 「소득세법 시행령」 제167조의3제1항제2호가목 및 다목에 따른 장기임대주택…을 말한다.」 / 소령 §167의3①2호가목(MST 286211) 「…5년 이상 임대한 주택으로서 해당 주택 및 이에 부수되는 토지의 기준시가의 합계액이 해당 주택의 임대개시일 당시 **6억원(수도권 밖의 지역인 경우에는 3억원)을 초과하지 않고** … **다만, 2018년 3월 31일까지 사업자등록등을 한 주택으로 한정한다.**」 / 다목 「…기준시가의 합계액이 … 임대개시일 당시 **6억원을 초과하지 않고** … 다만, 2018년 3월 31일까지 사업자등록등을 한 주택에 한정한다.」

**실패 시나리오**

임대개시일 당시 주택+부수토지 기준시가 합계 12억원인 민간매입임대주택을 2021-05-01에 등록해 7년 임대 후 양도 → 현재 §97의4가 적용돼 §95② 공제율에 4%p가 가산된다. 소령 §167의3①2호가목의 6억 한도·2018.3.31 등록 한정 어느 쪽으로도 장기임대주택이 아니므로 추가공제율은 0이어야 한다.

**세액 영향**: 추가공제율 2~10%p가 통째로 부당 가산된다 — 과세 양도차익 1,000,000,000원·7년 임대(4%)면 장기보유특별공제 40,000,000원 과다, 10년 임대(10%)면 100,000,000원 과다.

**처방**

① `Rental97EvaluationInput`의 `officialPriceAtStart`를 §97의4 경로에도 배선(⑤ 위젯·⑫ Zod `rental_97_4` 객체·rental-97-router.ts:79 case·⑧ validate 4지점 동시)하고, `evaluateRental974`에서 가목=6억/수도권 밖 3억, 다목=6억 한도를 검증한다. ② period-check `rental_97_4` 규칙에 「2018.3.31까지 사업자등록등」 상한을 추가한다 — 다만 소령 §167의3 가목·다목 단서의 부칙 경과조치는 본 리뷰에서 확인하지 못했으므로(과거 시행본 MCP NOT_FOUND) 상한 도입 전에 부칙을 먼저 확인할 것.

---

## [D4-02] 겸용주택 경로는 주택수 제외 축을 통째로 건너뛴다(§99의4·§98의9·감면주택·§155②③)

- **위치**: `lib/calc/transfer-tax-api-mixed-use.ts:186`
- **조문**: 조특법 §99의4① · §98의9① · §98의2④ 등 · 소령 §155②③
- **유형**: reachability · **차원**: §99의4·주택수제외 · **검증**: 생존 3/3

**결함**

겸용주택(`assetKind === "housing" && isMixedUseHouse`) 양도는 `app/api/calc/transfer/route.ts:411`에서 `calcMixedUseTransferTax`로 별도 dispatch되어 `calculateTransferTax`를 타지 않으므로, 비과세 판정용 주택수 제외 스텝(`transfer-tax-house-exclusion-step.ts:20 runHouseCountExclusionStep` — §99의4·§98의9 / 보유 감면주택 / §155②③ 상속주택)이 **한 번도 실행되지 않는다**.

정정 1 — 「원본 `householdHousingCount`만 본다」는 **주택 수 축에 한정**해서 맞다. 겸용 경로의 `isOneHouseExempt`(`lib/calc/transfer-tax-api-mixed-use.ts:186-189`)는 일시적 2주택(`temporaryTwoHouseSpecial`, 소령 §155①)은 반영하며, 엔진에서 다시 소령 §154① 보유·거주 요건(`meetsOneHouseHoldingResidence`)과 §91① 미등기 배제를 AND한다(`transfer-tax-mixed-use.ts:140-142`). 빠진 것은 **주택수 제외(§89①3호 의제) 축 하나**다.

정정 2 — 「경고도 없다」의 원인은 범위 밖 필터다. 겸용 경로의 미반영 고지(`transfer-tax-mixed-use-totals.ts:343-352`)는 `ALL_INCOME_DEDUCTION_IDS`(소득차감형 11 ID) 전용이고 `new_99_4_rural`·`new_99_4_hometown`·`unsold_98_9`는 그 목록에 없다. 이들은 taxCredit 버킷으로 `calcReductions`에 전달되지만 `transfer-tax-reductions-calc.ts`에 해당 type 분기가 0건이라 감면액 0으로 조용히 소멸한다.

정정 3 — 세액 영향은 **방향만 확정, 크기는 미측정**이다. `isOneHouseExempt=false`이면 주택분 12억 비과세 미적용 + proratio=1 + 표1 적용(`transfer-tax-mixed-use-helpers.ts:500·511·529`)이므로 과다과세 방향은 분명하나, 주장서의 「약 1.3억원」은 실행 프로브로 확인되지 않았다.

**근거**

lib/calc/transfer-tax-api-mixed-use.ts:186-189 `isOneHouseExempt: form.isOneHousehold && (form.householdHousingCount === "1" || (form.householdHousingCount === "2" && form.temporaryTwoHouseSpecial === true)),` — 제외 반영 없음. app/api/calc/transfer/route.ts:411 `const mixedResult = calcMixedUseTransferTax(` 로 별도 dispatch되며 `data.mixedUse` 분기는 `calculateTransferTax`를 부르지 않는다. 호출부 전수: `grep -rn "runHouseCountExclusionStep|resolveHouseCountExclusion|resolveSpecialHouseExclusions" lib/` → transfer-tax.ts:326·381 두 곳뿐이고 transfer-tax-mixed-use*.ts에는 0건. `grep -n "new994Detail|unsold989Detail|specialHouseExclusionDetail" lib/tax-engine/transfer-tax-mixed-use*.ts` → 0건(exit 1). 그런데 감면은 겸용에 전달된다 — route.ts:397 `reductions: engineInput.reductions,`. 자산게이트도 열려 있다 — 겸용 판정은 `lib/calc/transfer-tax-api.ts:229 const isMixed = primary.assetKind === "housing" && primary.isMixedUseHouse;` 이고 asset-kind-gate.ts:36-41 `NEW_UNSOLD_HOUSING_KINDS = new Set(["housing", …])` 이라 §99의4·§98의9가 겸용주택 자산에 선택 가능하다. 조문 근거: §99의4①·§98의9①은 「소득세법」 §89①3호 적용 시 소유주택에서 제외하며 대상 양도자산의 종류를 제한하지 않는다(KoreanLaw MST 280409 실독).

**실패 시나리오**

입력: 겸용주택(주택면적 > 상가면적, assetKind=housing·isMixedUseHouse=true) 보유·1세대·householdHousingCount=2(겸용주택 + 농어촌주택), reductions=[new_99_4_rural 적격 입력 전부], 양도가 10억. 현재 출력: `isOneHouseExempt=false` → 주택분 12억 비과세 미적용, §99의4 관련 step·경고·상세카드 전무(침묵 무시). 법령상 올바른 출력: §99의4①에 따라 농어촌주택을 소유주택에서 제외 → 1주택 → 주택분 12억 비과세 적용(양도가 10억이면 주택분 전액 비과세).

**세액 영향**: 주택분 양도차익 전액에 대한 12억 비과세 상실. 위 조건(주택분 양도차익 5억·표1 20% 가정)에서 결정세액 약 1.3억원 과다. 정확한 금액은 겸용 안분 비율에 종속되어 미측정.

**처방**

겸용 route 분기에서도 `runHouseCountExclusionStep`(또는 최소한 `resolveHouseCountExclusion` + `resolveSpecialHouseExclusions`)을 돌려 `isOneHouseExempt` 산정에 반영하고, 결과에 new994Detail·unsold989Detail·specialHouseExclusionDetail을 실어 근거 카드를 띄운다. 당장 반영이 어렵다면 겸용 + house_count_exclusion 감면 선택 조합에 대해 `warnings`로 「겸용주택 경로에서는 미반영」을 명시해 침묵 무시를 없앨 것.

---

## [D4-03] 중과 한시배제 기간(2022-05-10~2026-05-09)에 감면주택 주택수 제외의 유일한 입력 경로가 사라진다

- **위치**: `app/calc/transfer-tax/steps/Step4.tsx:684`
- **조문**: 조특법 §98의2④·§98의3③·§98의5②·§98의6②·§98의7②·§98의8②·§99②·§99의2② · 조특령 §98②⑥
- **유형**: reachability · **차원**: §99의4·주택수제외 · **검증**: 생존 3/3

**결함**

주장 본체는 정확하다. 세 가지만 정정·보강한다.

(1) **세액 수치**: 「약 133,060,000원 과다」가 아니라 실측 **129,060,000원**이다(양도 10억·취득 5억·2014-01-01 취득·2025-06-01 양도·1세대·세대 2주택·§98의3 감면주택 1채, `makeMockRates()` 기준: 선언 有 `isExempt=true` 세액 0 ↔ 선언 無 `isExempt=false` 세액 129,060,000).

(2) **게이트는 이중이다**: `!surchargeSuspended`(Step4:684)만이 아니라 그 안쪽 `parseInt(form.householdHousingCount) >= 2`(Step4:703)도 함께 걸린다. 다만 제외할 감면주택이 있으려면 세대 주택수가 2 이상이어야 하므로 두 번째 게이트는 정상이고, 결함은 첫 번째 게이트에 한정된다.

(3) **적용 시기 서술**: 「현재 창(2026-05-09까지) 안의 모든 양도 건」은 오늘(2026-08-31) 기준 창이 이미 닫혔으므로 「창 안에 양도일이 있는 건(확정신고·경정청구 포함) 전부」로 읽어야 한다. 소급 영향이 사라진 것은 아니다.

(4) **추가 결함(주장 미포함)**: `lib/calc/transfer-tax-validate.ts:289` `const she = surchargeSuppressed ? [] : (form.specialHouseExclusions ?? []);`가 검증만 건너뛰는데 `lib/calc/transfer-tax-api.ts:569`는 값을 그대로 전송한다 ⇒ 창 안에서 새로 시작하면 입력 불가, 창 밖에서 입력한 뒤 양도일을 창 안으로 바꾸면 무검증 통과라는 비대칭이 있다.

**근거**

Step4.tsx:684 `{!surchargeSuspended && (primaryKind === "housing" || …)) && (` 안쪽 :706 `<SpecialHouseExclusionSection items={form.specialHouseExclusions ?? []} …/>`. 유일 사용처 확인: `grep -rn "SpecialHouseExclusionSection" app components` → Step4.tsx:26(import)·:706(사용) 뿐. 게이트 값은 Step4.tsx:156-158 `const surchargeSuspended = useMemo(() => isMultiHouseSurchargeSuppressed(form.transferDate, primaryAcquisitionDate), …)` 이고 창은 2022-05-10~2026-05-09 + 보유 2년(lib/calc/transfer-tax-api-helpers.ts:68-78). 대체 카드 문구(Step4.tsx:673-679)는 「다주택 중과 관련 입력…은 계산에 영향이 없어 생략됩니다」라고 단정하지만, 이 섹션의 값은 transfer-tax-house-exclusion-step.ts:29-32·41-45를 거쳐 `exemptionJudgeInput.householdHousingCount`를 낮춰 **비과세 판정**을 바꾼다. 같은 파일의 바로 위 주석(Step4.tsx:695-700)이 §89②(분양권 축)에 대해 「중과와 무관한 비과세 규칙이라 그때도 선언 경로가 있어야 한다」며 동일 문제를 이미 인정하고 그 축만 ② 섹션으로 옮겼는데, 형제인 감면주택 제외는 그대로 남았다. 조문 근거: §98의2④ 등은 「소득세법 제89조제1항제3호를 적용할 때 … 소유주택으로 보지 아니한다」(KoreanLaw MST 280409 실독)로 §104⑦ 중과와 무관하다.

**실패 시나리오**

입력: 양도일 2025-06-01(한시배제 창 안)·취득 2014-01-01(보유 2년 이상)·1세대·세대 2주택 = 양도 일반주택 + §98의3 감면주택(2009-06 취득, 요건 충족). 현재 출력: `surchargeSuspended=true`로 ④ 섹션이 안내 카드로 대체되어 감면주택 제외를 선언할 입력 위젯이 없음 → `specialHouseExclusions=[]` → 유효 주택수 2 → 1세대1주택 비과세 부인 → 양도차익 전액 과세. 법령상 올바른 출력: §98의3③에 따라 감면주택을 소유주택에서 제외 → 1주택 → 12억 이하 전액 비과세(또는 12억 초과분만 과세).

**세액 영향**: 12억 비과세 전액 상실. 양도가 10억·차익 5억 사례 기준 결정세액 약 133,060,000원 과다(D4-01과 동일 산식). 현재 창(2026-05-09까지) 안의 모든 양도 건에 적용된다.

**처방**

`SpecialHouseExclusionSection`을 §89② 분양권 축과 같이 `surchargeSuspended`와 무관한 비과세 섹션(② 비과세 판정)으로 옮기거나, ④ 섹션 게이트에서 이 컴포넌트만 제외한다. 안내 카드 문구도 「비과세 판정 입력은 별도로 제공된다」로 정정할 것. §155②③ 상속주택 제외를 태우는 `HousesListSection`의 `isInherited`도 같은 게이트 아래에 있어 함께 검토 필요.

---

## [D5-01] §98의6①1호 감면주택은 주택수 제외 취득기간(~2011.12.31)에 구조적으로 못 들어간다

- **위치**: `lib/tax-engine/transfer-reductions/unsold-hybrid-p5.ts:252`
- **조문**: 조특법 §98의6①1호·②
- **유형**: reachability · **차원**: §98~§98의7 하이브리드 · **검증**: 생존 3/3

**결함**

모드2(§89①3호 주택수 제외)가 §98의6에 취득일·매매계약일 기준 window [2011-03-29, 2011-12-31]을 거는 것은 §98의6①1호에 대해 법령상 근거가 없다. 조특법 §98의6①1호의 유일한 기한은 **사업주체등의 임대계약 체결일(~2011.12.31)**이고 매수자의 매매계약·취득일에는 기한이 없으며, §98의6②에도 취득기간 문언이 없다. 위임 시행령(조특령 §98의5②③)에도 매수자 취득기간 창은 없고, ②단서가 「취득 당시(법 §98의6①1호의 주택은 최초 임대 개시 시)」로 1호의 취득이 임대개시 이후임을 전제한다. 현행 window는 사실상 **①2호 전용 형태**(2011.3.29 미분양 기준일 + 매수자 임대계약 ~2011.12.31)이며, 사업주체가 2년 이상 임대한 뒤 매수하는 1호 케이스 — 제도 취지대로면 취득이 2013.3.29 이후 — 는 항상 「취득기간 외」로 탈락한다(probe 실측 excludedCount 0). 결과적으로 §98의6② 적용 대상 주택이 주택수에서 제외되지 않아 1세대1주택 비과세를 상실한다. 부수적으로 입력 UI(components/calc/transfer/SpecialHouseExclusionSection.tsx:22)의 라벨 「(~2011.12.31)」도 같은 오기간을 노출한다. 단, 「1호 취득일이 필연적으로 2013년 이후」라는 단정은 조문상 사업주체 임대계약 체결일의 하한이 없어 문리적으로는 성립하지 않으므로(조특령 §98의5③1호 「준공 후 입주 사실」 배제와의 관계는 확인 필요), 결함의 근거는 「1호는 창에 못 들어간다」가 아니라 「1호에 취득기간 창을 거는 근거가 법·령에 없다」로 세워야 한다. 참고로 모드1(period-check.ts:175-180)과 드리프트 anchor(reduction-window-consistency.test.ts:7)는 이미 「§98의6은 임대계약 기준」이라고 명시하고 있어 모드2 window만 저장소의 자체 독법과 어긋나 있다.

**근거**

unsold-hybrid-p5.ts:250-254 `unsold_98_6: { label: "§98의6 준공후미분양주택", windows: [[D("2011-03-29"), D("2011-12-31")]], legalBasis: "조특법 §98의6②" }`. 판정부 `resolveSpecialHouseExclusions`(:296-)는 `if (!inWindow(e.houseAcquisitionDate) && !inWindow(e.houseContractDate)) return { eligible:false, reason: "감면주택의 취득일·매매계약일이 해당 조문의 취득기간 외입니다." }`로 두 날짜 모두 window 밖이면 탈락시킨다. 조문 실측(KoreanLaw MST 280409 §98의6①1호): 「사업주체등이 대통령령으로 정하는 준공후미분양주택을 2011년 12월 31일까지 임대계약을 체결하여 **2년 이상 임대한 주택**으로서 거주자 또는 비거주자가 해당 사업주체등과 **최초로 매매계약을 체결하고 취득한 주택**」 ⇒ 매수자의 계약·취득은 2년 임대 이후이므로 아무리 빨라도 2013년이다. §98의6②에는 취득기간 제한 문언이 전혀 없다(「제1항을 적용받는 주택은 해당 거주자의 소유주택으로 보지 아니한다」뿐). 실측 probe: `resolveSpecialHouseExclusions([{article:"unsold_98_6", houseAcquisitionDate:2013-06-01, houseContractDate:2013-05-01, requirementsConfirmed:true}], 2024-06-01)` → `excludedCount: 0`, reason 「취득기간 외」. 참고로 §98의5·§98의7·§99의2는 계약일이 window 안에 들어가므로 같은 문제가 없다 — §98의6만 비대칭.

**실패 시나리오**

세대가 ①1호 §98의6 준공후미분양주택(임대계약 2011-06, 사업주체 2년 임대, 취득 2013-06-01) 1채 + 일반주택 1채를 보유하고 일반주택을 2024-06-01 양도. 조문상 §98의6②에 따라 감면주택은 소유주택으로 보지 않으므로 1세대1주택 비과세(§89①3호) 판정 대상이다. 현재 출력: `excludedCount=0` → `transfer-tax-house-exclusion-step.ts:41-44`의 `totalExcluded=0` → `householdHousingCount` 2 유지 → 비과세 미적용·다주택으로 전액 과세. 올바른 출력: excludedCount=1 → householdHousingCount 1 → 1세대1주택 비과세(고가주택이면 12억 초과분만 과세 + LTHD 표2).

**세액 영향**: 1세대1주택 비과세 전부 상실 — 양도가 12억 이하 주택이면 산출세액 전액이 과대. 금액은 물건별로 달라 단일 수치로 확정 불가.

**처방**

§98의6 항목은 「취득기간 window」 판정 자체가 조문에 없으므로 windows 검사를 빼고 `requirementsConfirmed`만 보거나, 최소한 ①1호/2호를 가르는 입력(hoType)을 추가해 1호는 window 검사를 면제할 것. 2호(취득 후 5년 임대, 임대계약 ~2011.12.31)만 현행 window가 유효하다.

---

## [D5-02] §98의5 분양가격 인하율 0%를 「미입력」으로 차단 — 조문상 60% 감면 대상

- **위치**: `lib/tax-engine/transfer-reductions/unsold-hybrid-p3.ts:285`
- **조문**: 조특법 §98의5①1호
- **유형**: legal-accuracy · **차원**: §98~§98의7 하이브리드 · **검증**: 생존 3/3

**결함**

주장은 성립한다. 다만 세 가지를 정정·보강한다.

(1) **결함 층이 2개가 아니라 3개다.** 주장이 지목한 엔진(`lib/tax-engine/transfer-reductions/unsold-hybrid-p3.ts:285`)과 ⑧(`lib/calc/transfer-tax-validate-reductions.ts:272-273`) 외에, ④ 변환층 `lib/calc/transfer-tax-api-reductions.ts:400` `priceReductionRatePct985: parseDecimal(r.priceReductionRatePct985 || "") || undefined` 이 값 0을 undefined로 소거한다. ⑧을 고쳐도 ④가 0을 지워 엔진에는 여전히 undefined가 도달하므로, **세 곳을 함께 고치지 않으면 「고쳤는데 그대로」가 된다**. (⑫ Zod는 `z.number().nonnegative().optional()`로 0을 허용하므로 무결 — 수정 불필요.)

(2) **차단되는 것은 5년 이내 세액감면 경로만이 아니다.** `evaluateUnsold985`는 세액감면 경로(`transfer-tax-reductions-calc.ts:159`)와 소득차감 경로(`income-deduction-router.ts:303`) 양쪽에서 호출되므로, 취득일부터 5년 경과 후 양도 시의 §98의5① 후단(5년간 발생 양도소득금액 × 감면율을 과세대상소득금액에서 차감)도 함께 상실된다. probe 실측상 pct=0은 `effectCategory`가 `income_deduction`으로 전환되며 `fiveYearRatio: 0`·`reducibleTransferIncome: 0`이 된다. 세액 영향은 주장 시나리오의 56,190,000원(5년 이내분)에 더해 5년 경과 양도 케이스의 소득차감 상실까지 포함한다.

(3) **UI 안내문 자체가 게이트와 모순된다** — `components/calc/transfer/Unsold985InputForm.tsx:90-92`는 「10% 이하 = 감면율 60% … (법 §98의5①각호)」라고 고지하는데, 0을 입력하면 ⑧이 「분양가격 인하율(%)을 입력하세요」로 차단한다.

수정 방향은 `resolve985Rate`가 아니라 게이트 술어에 국한된다(`resolve985Rate(0) === 0.6`으로 이미 옳다): 「미입력(undefined/빈 문자열)」과 「0」을 구별하도록 ④는 `|| undefined` 대신 빈 문자열 판정으로, ⑧·엔진은 `> 0` 대신 `!== undefined`(및 `>= 0`)로 바꿔야 한다.

**근거**

unsold-hybrid-p3.ts:285-286 `const hasRate = input.priceReductionRatePct !== undefined && input.priceReductionRatePct > 0;` / `const rate = hasRate ? resolve985Rate(input.priceReductionRatePct!) : 0.6;`, :304-311 `if (!hasRate) { reasons.push({ code: "MISSING_PRICE_REDUCTION_RATE", ... }) }` → :347 `if (reasons.length > 0) return ineligibleHybrid(...)`. 같은 게이트가 ⑧에도 복제돼 있다 — lib/calc/transfer-tax-validate-reductions.ts:272-273 `if (!(parseDecimal(r.priceReductionRatePct985 || "") > 0)) return fail("§98의5 적용: 분양가격 인하율(%)을 입력하세요 …")`. 정작 감면율 함수 자체는 맞다 — :278-282 `resolve985Rate`: `if (pct <= 10) return 0.6; if (pct <= 20) return 0.8; return 1.0;` (0은 ≤10이므로 0.6). 조문 실측(KoreanLaw MST 280409 §98의5①): 「1. 분양가격 인하율이 100분의 10 이하인 경우: 100분의 60 / 2. …100분의 10을 초과하고 100분의 20 이하…: 100분의 80 / 3. …100분의 20을 초과하는 경우: 100분의 100」 — 하한(0 초과) 문언 없음. 령 §98의4④의 산정식도 「(입주자 모집공고안에 공시된 분양가격 − 매매계약서상의 매매가격) ÷ 공시 분양가격 × 100」이라 정가 매입 시 값이 0이 된다.

**실패 시나리오**

2010.2.11 현재 수도권 밖 미분양주택을 공시 분양가 그대로(인하율 0%) 2010-08-01 최초 매매계약·취득, 2013-06-01 양도(취득일부터 5년 이내), 산출세액 93,650,000원. 현재 출력(실측 probe, `evaluateAnyHybridTaxAmount`): 인하율 0 → `eligible=false reductionAmount=0`. 같은 입력에서 인하율만 5로 바꾸면 `eligible=true rate=0.6 reductionAmount=56,190,000`. 올바른 출력: 인하율 0%도 §98의5①1호에 해당하므로 감면세액 56,190,000원.

**세액 영향**: 56,190,000원 과대(실측 — 산출세액 93,650,000원 기준 감면 60% 전액 상실). 일반화하면 산출세액 × 60%.

**처방**

엔진 `hasRate` 판정을 `!== undefined && Number.isFinite(...) && >= 0`으로 바꾸고(음수만 배제하거나 음수도 1호로 처리할지 별도 판단), ⑧ `transfer-tax-validate-reductions.ts:272`도 「0 이상 입력 여부」로 동기화할 것. 미입력(빈 문자열)과 0을 구분해야 한다.

---

## [D5-03] §98의3② 자기건설 신축주택에 §98의3① 미분양주택 확인 요건을 강제 — 사실상 도달 불가

- **위치**: `lib/tax-engine/transfer-reductions/unsold-hybrid-p3.ts:196`
- **조문**: 조특법 §98의3② · 조특령 §98의3①
- **유형**: legal-accuracy · **차원**: §98~§98의7 하이브리드 · **검증**: 생존 3/3

**결함**

결함은 성립한다. 다만 두 곳을 정정·보강한다.

**(a) 제목의 「사실상 도달 불가」는 과한 표현이다.** 「미분양주택 확인」 ToggleCard는 `Unsold983InputForm.tsx:150-156`에서 `{!isSelfBuilt && (…)}` 블록 **바깥**에 있어 self_built에서도 **화면에 보이고 켤 수 있다**. 따라서 경로가 물리적으로 막힌 것은 아니고, **법상 요구되지 않는(그리고 자기건설 주택에는 사실관계상 성립할 수 없는) 「2009.2.11까지 분양계약 미체결 + 2009.2.12 이후 선착순 공급」을 사용자가 사실과 다르게 선언해야만 통과**하는 상태다. 미선언(기본값 false) 시에는 다른 요건을 전부 충족해도 `NOT_UNSOLD_CONFIRMED` 단일 사유로 감면 0이 된다. 정확한 제목은 「§98의3② 자기건설 신축주택에 법령상 근거 없는 §98의3① 미분양 확인을 강제 — 허위 선언 없이는 항상 불적격」이다.

**(b) 근거를 위임 체인으로 보강한다 — 주장이 놓친 결정적 조문이 있다.** 「령 §98의3① 1~8호가 전부 타인 공급 주택」이라는 논거보다 더 직접적인 것은 **조특령 §98의3⑤ 단서**다: 「다만, 법 제98조의3제2항의 주택에 대하여는 시장·군수·구청장에게 제출한 건축착공신고서 사본과 사용검사 또는 사용승인(임시사용승인을 포함한다) 사실을 확인할 수 있는 서류를 제출하여야 한다」 — 위임입법이 ②주택에 대해 ⑤본문의 「미분양주택임을 확인하는 날인을 받은 매매계약서」를 **명시적으로 대체**하고 있다. 즉 미분양 확인은 ②주택에 적용되지 않는다는 것이 령 자체의 문언이다.

**(c) 영향 범위 보강.** 주장은 5년 내 세액감면(100%/60%)만 실패 시나리오로 들었으나, 게이트가 `computeHybridEffect` 호출 **이전**의 공통 `reasons` 관문(`unsold-hybrid-p3.ts:230`)이라 **5년 후 양도 시 「취득일부터 5년간 발생한 양도소득금액 차감」(법 §98의3① 후단) 경로도 동일하게 봉쇄**된다. 2009~2010년 착공·사용승인 주택을 2026년 현재 양도하는 실제 사건은 대부분 이 후단 경로이고 일몰 규정이 없으므로, 결함은 과거 사건에 국한되지 않고 현재도 발현한다.

**(d) 수정 방향(참고).** :196을 `if (houseType === "purchased" && input.isUnsoldConfirmed !== true)`로 게이팅하고, UI의 「미분양주택 확인」 ToggleCard를 `{!isSelfBuilt && (…)}` 블록 안으로 옮기면 된다. 동일 패턴이 §99의2에 이미 있다(`unsold-hybrid.ts:501·508·515`). ②주택의 입증은 이미 폼이 수집하는 착공일·사용승인일(령 §98의3⑤ 단서가 요구하는 바로 그 서류)이 대응한다.

**근거**

unsold-hybrid-p3.ts:196-203은 houseType 게이트가 없다: `if (input.isUnsoldConfirmed !== true) { reasons.push({ code: "NOT_UNSOLD_CONFIRMED", message: "미분양주택 요건(2009.2.11까지 분양계약 미체결 + 2009.2.12 이후 선착순 공급 등)이 확인되지 않았습니다 (조특령 §98의3①).", legalBasis: "조특령 §98의3①" }); }`. 바로 아래 :205·:213·:221의 세 요건은 모두 `houseType === "purchased" &&`로 게이팅돼 있어 이 한 건만 비대칭이다. UI도 같다 — components/calc/transfer/Unsold983InputForm.tsx의 「미분양주택 확인」 ToggleCard는 `{!isSelfBuilt && (…)}` 블록 **바깥**에 있고, 기본값은 false(UnifiedReductionPanel-defaults.ts:272 `isUnsoldConfirmed983: false`). 조문 실측(KoreanLaw MST 280409 §98의3②): 「제1항을 적용할 때 **자기가 건설한 신축주택**으로서 2009년 2월 12일부터 2010년 2월 11일까지의 기간 중에 공사에 착공…하고, 사용승인 또는 사용검사…를 받은 주택을 포함한다」 — 미분양 확인 요건 없음. 령 §98의3①(미분양주택 정의) 1~8호는 전부 「사업주체·주택건설사업자·주택도시보증공사·시공자 등이 **공급하는** 주택」이라 자기건설 주택은 어느 호에도 해당할 수 없다. 실측 probe: `evaluateUnsold983({houseType:"self_built", constructionStartDate:2009-03-01, usageApprovalDate:2009-12-01, isOutsideSeoulNotDesignated:true, isNotExcludedSelfBuilt:true, isUnsoldConfirmed:undefined, …})` → `isEligible=false, ['NOT_UNSOLD_CONFIRMED']`.

**실패 시나리오**

거주자가 서울 밖(지정지역 아님)에 자기건설 신축주택을 2009-03-01 착공·2009-12-01 사용승인하고 2013-06-01 양도(취득일부터 5년 이내). 조문상 §98의3①②에 따라 양도소득세 100% 감면. 현재 출력: `NOT_UNSOLD_CONFIRMED`로 불적격 → 감면 0(사용자가 사실과 다른 「미분양주택 확인」 토글을 켜야만 통과). 올바른 출력: 산출세액 100% 감면(수도권과밀억제권역이면 60%).

**세액 영향**: 산출세액 × 100%(과밀 60%) 전액 상실. 예: 산출세액 93,650,000원이면 93,650,000원 과대.

**처방**

엔진의 `isUnsoldConfirmed` 검사를 `houseType === "purchased"`로 게이팅하고, UI의 「미분양주택 확인」 ToggleCard도 `{!isSelfBuilt && …}` 블록 안으로 옮길 것. 같은 파일 :168-186의 과밀억제권역 면적 한정(660㎡·149㎡)도 근거가 령 §98의3① **단서**(미분양주택 정의의 단서)이므로 self_built에는 적용 근거가 없다 — 함께 재검토할 것.

---

## [D6-01] §98의8 「2015.12.31 이전 임대계약 체결」 한정 요건이 엔진에 없다

- **위치**: `lib/tax-engine/transfer-reductions/unsold-98-8.ts:245`
- **조문**: 조세특례제한법 §98의8① (MST 280409, 시행 2026-01-01)
- **유형**: legal-accuracy · **차원**: §98의8·§98의9 · **검증**: 생존 3/3

**결함**

§98의8① 괄호 「거주자가 소법 §168 사업자등록과 민특법 §5 임대사업자등록을 하고 2015년 12월 31일 이전에 임대계약을 체결한 경우로 한정한다」 중 **임대계약 체결 시한**이 엔진·⑫⑭④⑧⑤ 어디에도 없다. `evaluateUnsold988`(unsold-98-8.ts:245-263)은 임대개시일·임대종료일·상속합산 개월수만 보고 60개월 충족 여부만 판정한다. 사전 게이트 `period-check.ts:191-199`도 **매매계약일**만 본다. 동일 구조의 §98의6은 `unsold-hybrid-p3.ts:50·484-495`에서 `UNSOLD_98_6_RENTAL_CONTRACT_TO(2011-12-31)`로 실제 차단하므로, 저장소 자체 표준이 §98의8에만 빠져 있다.

정정 1 — 재현되는 실패 시나리오: 주장의 (취득 2016-02-01, 양도 2021-04-01)은 5년 **초과**라 안분 경로이고, 3시점 기준시가 미입력이면 `MISSING_STD_PRICE`로 ineligible이 되어 괴리가 발생하지 않는다. 실제 괴리는 두 형태로만 난다.
 (a) 안분 경로 + 기준시가 3종 입력 → 공제 = 50% × 양도소득금액 × (5년시점−취득시)/(양도시−취득시). 전액이 아니라 **부분 공제**가 부당하게 허용된다.
 (b) 5년 내 경로 — 예: 취득 2016-02-01, 임대개시 2016-01-05(임대차계약 2016-01-02), 양도 2021-01-20 → rentalMonths 60 ≥ 60이고 `addYears(2016-02-01,5)=2021-02-01 ≥ 2021-01-20`이라 within5Years → 양도소득금액 전액 기준 50% 공제. 법령상은 임대계약이 2016년이므로 §98의8 적용 대상이 아니다(공제 0).

정정 2 — 세액 영향: 주장된 56,925,000은 (b)형 전제의 손계산이며 엔진 실측이 아니다. §55① 산식 자체는 맞으나 차감형 농특세(감면 전후 산출세액 차 × 20% ≈ 11,385,000 가산)와 지방소득세 차를 반영하지 않아, 순 과소납부는 그보다 작다(대략 5천만원 내외 — 엔진 실행으로 재측정 필요). (a)형은 안분비율에 비례해 더 작아진다.

정정 3 — 범위: 같은 괄호의 「사업자등록·임대사업자등록」 요건도 별도 검증 필드가 없다. 다만 이쪽은 령 §98의5⑤1호가 「등록 후 임대를 개시하는 날부터 기산」으로 규정하고 UI(`Unsold988InputForm.tsx` ③ 섹션 안내문)가 그 취지를 명시해 임대개시일 입력이 자기선언 proxy로 기능한다. **임대계약 체결 시한만 proxy조차 없다** — 이것이 정확한 결함 범위다.

**근거**

(a) 코드 원문 — unsold-98-8.ts:245-264 「// 6) 임대 5년 — 등록 후 임대개시일 기산 + 상속 합산 (령 §98의5⑤ 준용)」 아래 전체가 `if (!input.rentalStartDate) {...} else { const rentalEnd = input.rentalEndDate ?? input.transferDate; rentalMonths = fullMonthsBetween(input.rentalStartDate, rentalEnd) + (input.inheritedRentalMonths ?? 0); if (rentalMonths < UNSOLD_98_8_RENTAL_MONTHS) {...} }` 뿐이다. `Unsold988Input`(:42-73)·`Unsold988IneligibleCode`(:75-89) 어디에도 임대계약 체결일 항목이 없다.
(b) 조문 본문 (KoreanLaw MCP `get_law_text(mst=280409, jo="제98조의8")`) — 「… 5년 이상 임대한 주택(거주자가 「소득세법」 제168조에 따른 사업자등록과 「민간임대주택에 관한 특별법」 제5조에 따른 임대사업자등록을 하고 **2015년 12월 31일 이전에 임대계약을 체결한 경우로 한정한다**)을 양도하는 경우에는 …」. 「…한 경우로 한정한다」는 요건이다.
(c) 「없음」 반증 시도 3종 — `grep -rn "rentalContract\|임대계약" lib components app types` 결과 임대계약 체결일 필드는 **§98의6 전용 `rentalContractDate986` 하나뿐**이다(unsold-hybrid-p3.ts:390·484-495에서 2011.12.31 시한을 실제로 차단, UI는 Unsold986InputForm.tsx:129-130). `grep -n "988" lib/api/transfer-tax-schema-reductions.ts`(⑫ :331-343)·`lib/calc/transfer-tax-api-reductions.ts`(④ :301-313)·`app/api/calc/transfer/route-reductions-mapper.ts`(⑭ :83-90)·`components/calc/transfer/Unsold988InputForm.tsx`(⑤ 전문) 전수 확인 — 임대계약 관련 필드 0건.
(d) 안전망 — `__tests__/tax-engine/transfer-tax/unsold-98-8.test.ts` 14 케이스(A-1~A-11 + 부호 + fullMonthsBetween) 중 임대계약 시한 단언 0건. 3파일 28테스트 baseline green(`npx vitest run` 실행 확인).
(e) 시행령 확인 — 조특령 §98의7⑤은 임대기간 「계산」만 §98의5⑤에 위임(기산일·상속합산)하며 시한 요건은 본법에만 있다. 즉 위임 체인 어디에도 이 시한을 대체하는 규정이 없다.

**실패 시나리오**

입력: 최초 매매계약일 2015-11-01, 취득일 2016-02-01, 임대개시일 2016-03-01(임대차계약 체결 2016-02-20), 임대종료 미입력, 양도일 2021-04-01, 취득가액 500,000,000, 전용 84㎡, 자격 토글 3종 ON, 양도소득금액 300,000,000.
현재 출력: contractDate가 2015 window 통과 · rentalMonths ≈ 61 ≥ 60 → isEligible=true, reducibleTransferIncome = 150,000,000 차감.
법령상 올바른 출력: 임대계약을 2015-12-31 이후에 체결했으므로 §98의8① 괄호 한정에 걸려 적용 대상이 아니다 → 공제 0, ineligibleReason 「임대계약을 2015.12.31 이전에 체결한 경우로 한정(법 §98의8①)」.

**세액 영향**: 위 시나리오 산식 기준(엔진 실행은 하지 않고 §55① 세율표로 계산): 공제 적용 시 과표 147,500,000 → 산출세액 36,185,000 / 미적용 시 과표 297,500,000 → 산출세액 93,110,000. 차액 약 56,925,000 과소(+ 농특세·지방소득세 별도). 정확 금액은 엔진 실행으로 재측정 필요.

**처방**

§98의6 선례(`rentalContractDate986`)를 그대로 복제해 `rentalContractDate988`을 14지점(①폼 → ④transfer-tax-api-reductions.ts:301 → ⑤Unsold988InputForm ③섹션 → ⑧validate → ⑫schema-reductions.ts:331 → ⑭route-reductions-mapper.ts:83)에 배선하고, evaluateUnsold988에 `RENTAL_CONTRACT_AFTER_DEADLINE` 코드(상수 `UNSOLD_98_8_RENTAL_CONTRACT_TO = new Date("2015-12-31")`)를 추가한다. 동시에 이 시한을 고정하는 anchor 1건(2015-12-31 경계 적격 / 2016-01-01 배제)을 unsold-98-8.test.ts에 심는다.

---


# 🟡 Medium (37건)

## [CA-04] 조특법 §70(농지대토 100% 감면)이 전 계층에 없어 §133① 한도 합산에서도 빠진다 — §69 감면 과다

- **위치**: `lib/tax-engine/aggregate-reduction-limits.ts:33`
- **조문**: 조특법 §70① · §133①1호·2호 가목·나목
- **유형**: legal-accuracy · **차원**: 누락점검(조문축) · **검증**: 생존 1/1

**결함**

**조특법 §133① 한도 그룹이 열거 조문의 절반 이상을 누락해, 5년 누적 한도(2호 나목 2억)가 과소 계산된다 — §69 계열 감면 과다.**

`lib/tax-engine/aggregate-reduction-limits.ts:33-39`의 group① `types`는 `self_farming`·`self_farming_inherited`·`self_farming_incorp`(전부 §69)·`livestock`(§69의2)·`fishing`(§69의3) 5개뿐이다. 그러나 §133①1호·2호나목이 같은 한도군으로 열거하는 것은 **§33, §43, §66~§69, §69의2~§69의4, §70, §85의10, 법률 제6538호 부칙 §29**다. 즉 **§70(농지대토 100% 감면)·§69의4(자경산지 10~50% 감면)·§66~§68·§33·§43·§85의10이 모두 누락**돼 있다. 이 조문들은 감면 엔진 어느 계층(`TransferReductionId` 24종 / `REDUCTION_METADATA` / Zod `priorReductionUsageSchema` / Step5 UI 드롭다운 5종)에도 없어 **과거 감면 이력으로 입력할 경로 자체가 없다.**

결과: `applyFiveYearLimits`의 `priorGroupSum`이 0으로 남아 5년 한도가 발동하지 않는다. tsx 프로브 실측 — 2023년 §70 감면 150,000,000 + 2026년 §69 감면 100,000,000 시나리오에서 코드는 **100,000,000**을 그대로 감면(법정치 **50,000,000**, 과다 **50,000,000**).

**추가로, 처방은 「types 배열에 §70 문자열 추가」만으로는 불충분하다.** `LimitGroup`(:18-27)은 그룹당 `fiveYearLimit` 단일 값만 지원하는데 §133①2호는 「가목(§70 단독 5년 1억)과 나목(§66~§70 합산 5년 2억) 중 큰 금액 배제」라는 **중첩 서브그룹 max** 구조다. §70을 실제 구현할 때는 자료구조부터 확장해야 한다.

**완화 요인(severity를 high로 올리지 않는 이유).** 나목은 그룹 공유 한도라 사용자가 §70 이력을 UI의 「자경농지 감면」으로 오라벨링해 입력하면 나목 결과는 법정치와 일치한다(프로브: `livestock`으로 넣어도 50,000,000 동일). 과다감면은 사용자가 정확히 입력하려 할 때만 발현한다.

**근거**

조특법 §133①(MST 280409 실독): 「개인이 제33조, 제43조, 제66조부터 제69조까지, 제69조의2부터 제69조의4까지, 제70조, 제85조의10 … 에 따라 감면받을 양도소득세액의 합계액 중에서 …」, 2호 가목 「5개 과세기간의 제70조에 따라 감면받을 양도소득세액의 합계액이 1억원을 초과하는 경우 …」, 나목 「5개 과세기간의 제66조부터 제69조까지, 제69조의2부터 제69조의4까지 또는 제70조에 따라 감면받을 양도소득세액의 합계액이 2억원을 초과하는 경우 …」. 조특법 §70①: 「…대토(代土)함으로써 발생하는 소득에 대해서는 양도소득세의 100분의 100에 상당하는 세액을 감면한다」. 코드 aggregate-reduction-limits.ts:32-42 group① types = `["self_farming", "self_farming_inherited", "self_farming_incorp", "livestock", "fishing"]` — §70(농지대토)·§69의4(자경산지)·§66~§68·§85의10 부재. 반증 시도: `grep -rn "농지대토|85의10|영농자녀" lib app components __tests__` → 양도세 쪽 히트는 app/calc/transfer-tax/steps/step4-sections/SpecialSituationSection.tsx:121의 안내문 「…자경농지(조특법 §69①)·농지대토(§70①) 대상 토지」 1건뿐(비사업용토지 제외 설명). `TransferReductionId`(transfer-reductions/types.ts:14-42, 24종)·`REDUCTION_METADATA`(metadata.ts:84-322)·Zod 감면 enum(lib/api/transfer-tax-schema.ts:491-503)·UI 라벨(Step5.tsx:21-28) 어디에도 §70 항목이 없다. `livestock`·`fishing`은 한도 키(:37-38)와 라벨(transfer-reduction-type-labels.ts:26-27)에만 있고 evaluator·⑫·⑤가 없어 역시 도달 불가다.

**실패 시나리오**

2023년에 농지대토(§70)로 양도소득세 150,000,000원을 감면받은 납세자가 2026년에 자경농지(§69) 감면 100,000,000원을 신청한다. → 현재 코드: §70을 이력으로 입력할 수 있는 type이 enum(transfer-tax-schema.ts:491-503)에 없고 UI 목록(Step5.tsx:21-28)에도 없어 `priorGroupSum = 0` → 연간 한도 1억만 걸려 감면 100,000,000원. → 조문상(§133①2호나목): 5개 과세기간 §66~§70 합계 한도 2억 − 직전 1.5억 = 잔여 50,000,000원 ⇒ 감면 50,000,000원.

**세액 영향**: 위 시나리오에서 감면 과다 50,000,000원 = 세액 과소 50,000,000원. 게다가 §70 자체가 미구현이라 농지대토 사례는 계산 자체가 불가(감면 0으로 과다 과세).

**처방**

단기: §133① 그룹 types에 `farmland_substitute_70`(§70)·`self_cultivated_forest_69_4`(§69의4)를 추가하고 priorReductionUsage Zod enum(transfer-tax-schema.ts:491-503)과 UI 목록(Step5.tsx:21-28)에 이력 전용 항목으로 노출해 최소한 한도 합산에는 반영되게 한다. 함께 §133①2호 가목(5개 과세기간 §70 단독 1억)을 `LimitGroup`에 하위 한도로 모델링한다(현재 구조는 그룹당 fiveYearLimit 1개뿐이라 가목·나목 「중 큰 금액」 비교가 표현되지 않는다). 장기: §70 evaluator(§70① 100% 감면, ① 단서 주거지역 편입 안분, ② 적용배제, ④ 사후 추징)를 신설한다.

---

## [CA-05] §77의3② 「해제일부터 1년(5년) 이내 사업인정고시」 게이트가 상한만 보고 고시가 해제보다 앞선 경우를 통과시킨다

- **위치**: `lib/tax-engine/gb-designated-land-reduction.ts:101`
- **조문**: 조특법 §77의3② 단서
- **유형**: legal-accuracy · **차원**: 누락점검(조문축) · **검증**: 생존 1/1

**결함**

결함 자체는 제보대로다. 다만 「하한/상한」이라는 표현이 혼동을 부르므로 다음과 같이 서술하는 편이 정확하다.

조특법 §77의3② 단서는 사업인정고시일에 대해 **양방향 창**을 요구한다 — `해제일 ≤ 사업인정고시일 ≤ 해제일 + 1년(경제자유구역 등 지정 시 5년)`. 조특령 §74②는 그 5년 창이 열리는 **지역 목록만** 정할 뿐 창의 기산점·방향을 바꾸지 않는다.

`lib/tax-engine/gb-designated-land-reduction.ts:98-106`은 이 창의 **뒤쪽 경계 하나만** 구현한다. `releasedDate < subYears(triggerDate, allowedYears)`는 「고시일 ≤ 해제일 + N년」과 동치이며(코드에서는 releasedDate 기준 하한 형태로 표현됨), 앞쪽 경계인 **「해제일 ≤ 고시일」(= 고시가 해제 이후일 것)** 조건이 없다. 따라서 `releasedDate > triggerDate`인 입력(고시가 해제보다 앞선 경우)이 게이트를 그대로 통과한다.

가드는 엔진뿐 아니라 상·하류 4계층 어디에도 없다 — ⑫ Zod(`lib/api/transfer-tax-schema-reductions.ts:70-83`, refine 부재) · ⑧ validate(`lib/calc/transfer-tax-validate-reductions.ts:87-88`, 존재검사만) · ⑭ mapper(`app/api/calc/transfer/route-reductions-mapper.ts:25-32`) · ⑤ UI(`app/calc/transfer-tax/steps/Step5.tsx:352-360`, DateInput min/max 없음).

실측 결과도 제보와 일치한다: 해제 2026-06-01 · 고시 2025-01-01 · 지정 2005-06-01 · 취득 2003-03-27 · 거주 충족 · 양도 2026-09-01 · 산출세액 100,000,000 → 현행 코드는 `isEligible:true / 40% / ②1호 / 감면 40,000,000원`을 반환하지만, §77의3② 단서 미충족이므로 조문상 정답은 **0원**이다.

**근거**

조특법 §77의3②(MST 280409 실독): 「… 다만, 개발제한구역 해제일부터 1년(개발제한구역 해제 이전에 「경제자유구역의 지정 및 운영에 관한 법률」에 따른 경제자유구역의 지정 등 대통령령으로 정하는 지역으로 지정이 된 경우에는 5년) 이내에 「공익사업을 위한 토지 등의 취득 및 보상에 관한 법률」 및 그 밖의 법률에 따라 사업인정고시가 된 경우에 한정한다.」 코드 gb-designated-land-reduction.ts:98-106: `const allowedYears = input.freeEconZone ? 5 : 1; const cutoff = subYears(input.triggerDate, allowedYears); if (input.releasedDate < cutoff) { return { rate: 0, reason: ... }; }` — 조건이 하나뿐이라 `releasedDate > triggerDate`(고시가 해제보다 이른 경우)도 통과한다. 같은 파일 :30-36의 필드 주석(`triggerDate`=②사업인정고시일, `releasedDate`=②해제일)으로 두 날짜의 의미를 확인했다. 참고로 §77의3의 나머지 실체(①1호 40%·2호 25%·②동일·일몰 2028-12-31·③상속 취득일 의제)는 조문과 일치함을 확인했다.

**실패 시나리오**

개발제한구역 해제일 2026-06-01, 사업인정고시일 2025-01-01(해제 이전), 지정일 이전 취득 + 소재지 거주, 양도 2026-09-01, 산출세액 100,000,000원. → 현재 코드: `cutoff = 2025-01-01 − 1년 = 2024-01-01`, `releasedDate(2026-06-01) < cutoff` 가 false → 게이트 통과 → ②1호 40% → 감면 40,000,000원. → 조문상: 사업인정고시가 해제일 이후 1년 이내에 이루어진 경우가 아니므로 §77의3② 단서 미충족 → 감면 0원.

**세액 영향**: 위 시나리오에서 감면 과다 40,000,000원 = 세액 과소 40,000,000원. 일반적으로 산출세액 × 40%(또는 25%).

**처방**

`if (input.releasedDate < cutoff || input.releasedDate > input.triggerDate)`로 상한을 추가하고, 사유 문구를 「사업인정고시일이 해제일 이후 N년 이내여야 합니다(§77의3② 단서)」로 바꾼다. 경계 anchor 2건(고시=해제일 당일 통과 / 고시=해제일 하루 전 차단)을 함께 심는다.

---

## [CB-05] 겸용주택 경로가 calcReductions에 인자 3개를 빠뜨려 §97의5 안분이 구조적으로 불가능해진다

- **위치**: `lib/tax-engine/transfer-tax-mixed-use-totals.ts:357`
- **조문**: 조특령 §97의5② (임대기간분 양도소득 안분) · 조특법 §97의2①1호·2호 (시한 기준일)
- **유형**: wiring · **차원**: 누락점검(배관축) · **검증**: 생존 1/1

**결함**

겸용주택 경로(`transfer-tax-mixed-use-totals.ts:357-370`)가 `calcReductions`를 12인자까지만 호출해 13·14·15번(`standardPriceAtAcquisition`·`standardPriceAtTransfer`·`assetContractDate`)이 항상 undefined가 된다. **이 중 실제로 세액을 가르는 것은 15번 `assetContractDate` 하나다** — 이 값은 겸용 여부와 무관하게 전송·Date 변환되어 단건 finalize에는 도달하는데(transfer-tax-api.ts:367 → route.ts:105 → finalize:319) 겸용 분기(route.ts:386-405)가 전달하지 않고 `MixedUsePostTaxInput`에 칸도 없다. 결과로 §97의2①2호(1999.8.20~2001.12.31 매매계약+계약금)·§97의5①1호의 시한 판정이 `period-check.ts:51-56·83`에서 취득일로 후퇴해, 계약일은 시한 내·취득일은 시한 외인 사안에서 전액감면이 침묵 소실된다(probe 실측 100,000,000 → 0, `OUT_OF_PERIOD`). UI는 계약일을 보고 항목을 활성 표시하므로 사용자에게는 적용된 것처럼 보인다.
반면 13·14번(기준시가 2점)은 **겸용주택에 입력 경로 자체가 없어**(CompanionAcqPurchaseBlock.tsx:296-298·547-552에서 위젯을 숨기고 겸용 전용 3분할 구조로 대체) 배선해도 undefined다 — 조특령 §97의5② 안분 차단은 호출부 인자 문제가 아니라 **겸용 입력 축 부재**이며, 인자만 추가하면 no-op이다.
수정 범위: `MixedUsePostTaxInput`에 `contractDate` 추가 → route 겸용 분기 ⑭에서 `assetContractDate` 전달 → 호출부 15번 인자 배선(3계층). 기준시가 2점은 별건으로 분리할 것.

**근거**

transfer-tax-mixed-use-totals.ts:357-370 원문 — `? calcReductions( calculatedTax, taxCredit, input.selfFarmingRules, undefined, undefined, undefined, undefined, input.transferDate, Math.max(0, aggregateIncome), basicDeduction, taxBase, input.acquisitionDate, )` — 12번째 인자에서 끝난다.
대조군 transfer-tax-finalize.ts:302-320은 15개를 전부 채운다: `... input.acquisitionDate, input.standardPriceAtAcquisition, input.standardPriceAtTransfer, // Phase 2 ... input.assetContractDate,`. 다필지 경로(multi-parcel-branch.ts:120-125)도 15개를 채우며 「메인 경로(finalize)와 동일 인자」라고 명시한다.
시그니처는 transfer-tax-reductions-calc.ts:56-73 — `standardPriceAtAcquisition?`(13), `standardPriceAtTransfer?`(14), `assetContractDate?`(15).
이 값들이 §97 시리즈로 전달되는 경로: transfer-tax-reductions-calc.ts:122-129 `evaluateRental97TaxAmount(reductions, { transferDate, acquisitionDate, contractDate: assetContractDate, stdPriceAtAcquisition: standardPriceAtAcquisition, stdPriceAtTransfer: standardPriceAtTransfer, calculatedTax, })`.
차단 지점: rental-97-5.ts:117-136 — `if (input.rentalStartDate && input.acquisitionDate) { const ratio = calcRentalGainRatio({ ... stdPriceAtAcquisition: input.stdPriceAtAcquisition, ... stdPriceAtTransfer: input.stdPriceAtTransfer }); if (ratio === null) { reasons.push({ code: "MISSING_PRORATION_PRICES", ... }) } }` → reasons가 차면 :146-152가 `isEligible:false`.
시한 축: period-check.ts:51-56 `const target = c.contractDate ?? c.usageApprovalDate ?? c.acquisitionDate;`(§97의2) · :83 `before(c.contractDate ?? c.acquisitionDate, D("2018-12-31"))`(§97의5) — `contractDate`가 undefined면 취득일로 후퇴한다.
도달성: 겸용주택은 `assetKind === "housing"`이다(lib/calc/transfer-tax-api-mixed-use.ts:21 `const isMixed = primary.assetKind === "housing" && primary.isMixedUseHouse;`)이고 asset-kind-gate.ts:35의 `RENTAL_HOUSING_KINDS`에 housing이 있어 ⑤·⑧이 §97 시리즈를 허용한다. 겸용 경로는 차감형만 걸러낸다 — mixed-use-totals.ts:329-330 `const deferred = all.filter((r) => incomeDeductionIds.has(r.type)); const taxCredit = all.filter((r) => !incomeDeductionIds.has(r.type));` — §97의2·§97의5는 `taxCredit`에 남아 calcReductions로 들어간다.

**실패 시나리오**

(a) 안분 차단: 겸용주택을 2015-01-10 취득, 2016-03-01 임대개시(취득일보다 늦음), 2018-12-01 매매계약으로 §97의5 적용을 신청하고 자산-수준 취득시·양도시 기준시가를 정상 입력. 단건(비겸용) 경로에서는 finalize가 기준시가 2점을 넘겨 `calcRentalGainRatio`가 비율을 산출하고 §97의5 100% 감면이 그 비율만큼 적용된다. 겸용 경로에서는 두 값이 undefined라 `ratio === null` → `MISSING_PRORATION_PRICES` → 감면 전액 0.
(b) 시한 오판: 매매계약일 2018-12-01(시한 내), 취득일 2019-02-15(시한 외)인 겸용주택 → 단건 경로는 `assetContractDate`로 §97의5①1호 시한을 통과시키지만, 겸용 경로는 `contractDate` undefined → `acquisitionDate` 2019-02-15로 판정 → 시한 외 차단(납세자 불리, 조문은 「2018.12.31.까지 매매계약을 체결하고 계약금을 납부한 경우를 포함한다」).

**세액 영향**: (a) 겸용 산출세액 80,000,000 · rentalGainRatio 0.7 가정 시 §97의5 감면 56,000,000이 통째로 소실. (b) 시한 오판 시 §97의5 감면 전액(산출세액 × 안분비율) 소실. 산식은 rental-97-5.ts:155 `const reductionAmount = applyRate(applyRate(input.calculatedTax!, rentalGainRatio), 1.0);`에서 도출.

**처방**

`MixedUsePostTaxInput`(lib/tax-engine/types/transfer-mixed-use.types.ts:340~ 부근)에 `standardPriceAtAcquisition`·`standardPriceAtTransfer`·`assetContractDate`를 추가하고, transfer-tax-mixed-use.ts:514-524의 post-tax 인자 객체와 app/api/calc/transfer/route.ts:397 부근의 mixedAsset 조립에서 채운 뒤 :357 호출에 15개를 모두 전달한다(다필지 경로가 F-6에서 같은 정정을 이미 했다). 위치 인자 15개는 누락이 조용히 발생하는 형태이므로 **옵션 객체 인자로 리팩터**하는 것이 근본 대책이다. anchor: 겸용 + rental_97_5 + 기준시가 2점 → `isEligible:true` & rentalGainRatio < 1.

---

## [CB-07] 다필지 분기가 §77의2·§77의3·§97 시리즈·하이브리드 감면 상세를 결과에 싣지 않는다

- **위치**: `lib/tax-engine/transfer-tax-multi-parcel-branch.ts:99`
- **조문**: 조특법 §77의2 · §77의3 · §97 시리즈 (근거·상세 표시)
- **유형**: display · **차원**: 누락점검(배관축) · **검증**: 생존 1/1
- **심각도 조정**: low → medium (검증 결과)

**결함**

다필지 조기반환 분기(`transfer-tax-multi-parcel-branch.ts:99-107, 148-179`)가 `calcReductions` 반환의 8개 detail 중 4개(`gbDesignatedLandDetail`·`replacementLandDetail`·`rental97TaxDetail`·`hybridTaxDetail`)를 구조분해·반환하지 않는다. 실제 발현 경로는 **§77의3·§77의2 두 건**이다(다필지는 `assetKind === "land"` 전용이라 §97 시리즈·하이브리드는 UI 자산종류 게이트에서 이미 차단된다). 결과는 두 가지다 — ① §77의3: 감면세액은 반영되나(실측 78,107,999) 산출근거 카드가 통째로 사라진다(`ReductionDetailCards.tsx:275`, `hasReductionDetailCards:130`). ② §77의2: 카드 소실에 더해 **별지84호 부표1 ⑲ 세액감면대상금액에 틀린 값이 인쇄된다** — `reduction-eligible-income.ts:24`의 `replacementEligibleIncome ?? reducibleIncome` 폴백이 「감면율 40%를 곱한 값」을 집어 든다(실측 단필지 315,000,000 → 다필지 132,720,000). 이 폴백 오류는 상세명세서·PDF·다건 집계(`aggregate-pickers.ts:90-91`)로도 전파된다. ⇒ 표시 전용 low가 아니라 **신고서식 수치 오류를 포함한 medium**.

**근거**

transfer-tax-multi-parcel-branch.ts:99-107 구조분해 목록 원문 — `reductionAmount: mpReduction, reductionType: mpReductionType, reductionTypeApplied: mpReductionTypeApplied, reducibleIncome: mpReducibleIncome, rentalReductionDetail: mpRentalDetail, newHousingReductionDetail: mpNewHousingDetail, publicExpropriationDetail: mpExproDetail, selfFarmingReductionDetail: mpSelfFarmingDetail,` — 4개 키가 없다.
`calcReductions`의 반환 타입은 8개 detail을 모두 노출한다 — transfer-tax-reductions-calc.ts:74-82 `rentalReductionDetail? / newHousingReductionDetail? / publicExpropriationDetail? / gbDesignatedLandDetail? / replacementLandDetail? / selfFarmingReductionDetail? / rental97TaxDetail? / hybridTaxDetail?`.
반환 객체(:148-179)에도 그 4개가 없다(`grep -n "gbDesignatedLandDetail\|replacementLandDetail\|rental97TaxDetail\|hybridTaxDetail" lib/tax-engine/transfer-tax-multi-parcel-branch.ts` → 0건).
대조군 finalize·redevelopment는 전부 싣는다(예: transfer-tax-redevelopment.ts:498·730의 `rental97TaxDetail`).
다필지=토지이므로 자산게이트상 §77의2(대토보상)·§77의3(개발제한구역)이 정확히 이 경로의 주력 감면이다 — asset-kind-gate.ts:72-76 `GB_CLAIM_ROUTE_KINDS = new Set(["land", "general_building", "commercial_building"])`.

**실패 시나리오**

취득시기가 다른 2필지 토지를 개발제한구역 매수청구(§77의3)로 양도하고 감면을 신청하면, 결과 화면의 「감면세액」 금액은 나오지만 `gbDesignatedLandDetail`이 undefined라 감면율·지정일·매수청구일 등 산출근거 카드가 렌더되지 않고 별지84호 부표의 해당 칸도 빈다. 같은 감면을 단필지로 넣으면 상세가 표시된다.

**세액 영향**: 세액 무영향 — 표시/근거 누락

**처방**

multi-parcel-branch.ts:99-107의 구조분해와 :148-179 반환 객체에 4개 키를 추가한다. transfer-tax-normal-return.ts:108-113이 §77의3·§77의2 키 누락으로 같은 사고를 겪은 이력이 있으므로, `calcReductions` 반환 detail 키 집합을 **집합 대조 테스트**(반환 타입 키 ⊆ 각 경로 반환 객체 키)로 고정할 것.

---

## [D1-05] 레거시 장기임대 감면에 §133 종합한도를 적용 — §133①·②에 §97은 열거돼 있지 않다 (게다가 산식도 조문과 다르다)

- **위치**: `lib/tax-engine/rental-housing-reduction.ts:315`
- **조문**: 조특법 §133①·②
- **유형**: legal-accuracy · **차원**: §97·§97의2 장기임대 · **검증**: 생존 1/1

**결함**

「§97 계열」이 아니라 **§97·§97의3·§97의4·§97의5 4종 전부**에 무조건 걸린다. 대상 모듈의 헤더가 스스로 4개 조문을 선언하고(`rental-housing-reduction.ts:1-9`), `RentalHousingType` 4값(:23-27) 어디에도 분기 없이 `applyAnnualLimit`이 적용된다(:496-502). 또한 주장이 언급하지 않은 **표시 결함이 하나 더 있다** — `components/calc/results/transfer/RentalReductionDetailCard.tsx:178`이 「감면세액이 한도를 초과하여 한도액으로 제한됨 (조세특례제한법 §133)」을 사용자 화면에 출력한다. 세액 결함에 인용 결함이 얹힌다. 도달 경로는 **UI가 아니라 API 직접 호출 한정**이다: 현행 마법사는 §97의3·§97의5를 `reductions[]`(`lib/calc/transfer-tax-api-reductions.ts:197-212`, 타입 `rental_97_3`/`rental_97_5`)로 신세대 라우터에 보내고, `rentalReductionDetails`를 채우는 클라이언트 코드는 0건이다(`lib/calc/transfer-tax-validate-usage-conversion.ts:98` 주석이 「엔진 rentalReductionDetails는 폼에 없어」라고 명시). 다만 Zod 스키마·Route 매핑·결과 카드가 모두 살아 있어 공개 API 표면으로는 도달한다.

**근거**

`rental-housing-reduction.ts:126-129` `/** 조특법 §133 연간 기본 감면 한도 (1억원) */ const ANNUAL_BASE_LIMIT = 100_000_000; /** 조특법 §133 초과분 감면율 */ const EXCESS_RATE = 0.5;` · :311-321 `function applyAnnualLimit(...) { if (reductionAmount <= ANNUAL_BASE_LIMIT) …; const excess = reductionAmount - ANNUAL_BASE_LIMIT; const limited = truncateToWon(ANNUAL_BASE_LIMIT + applyRate(excess, EXCESS_RATE)); return { amount: limited, isLimitApplied: true }; }` · :496-502에서 무조건 적용. 조문 실독(조특법 MST 280409 제133조): ①은 「제33조, 제43조, 제66조부터 제69조까지, 제69조의2부터 제69조의4까지, 제70조, 제85조의10 또는 법률 제6538호 부칙 제29조」, ②는 「제77조, 제77조의2 또는 제77조의3」 — §97은 어느 항에도 없다. 또한 ①1호는 「…1억원을 초과하는 경우에는 그 **초과하는 부분에 상당하는 금액**」을 감면하지 아니한다(하드 캡)이지 「초과분의 50%는 감면」이 아니다. 저장소의 정본 한도 모듈 `lib/tax-engine/aggregate-reduction-limits.ts`도 §97을 그룹에 넣지 않는다(§133 그룹 정의는 §69·§77 계열뿐).

**실패 시나리오**

입력: 실제 §97 요건을 갖춘 건설임대(임대개시 1998-01-01, 양도 2005-06-01, public_construction, 등록 요건 충족), 산출세액 300,000,000. 현재 출력: rawAmount 300,000,000 → `applyAnnualLimit` → 100,000,000 + floor(200,000,000×0.5) = 200,000,000 감면, isLimitApplied true. 조문상 올바른 출력: §133 한도 대상이 아니므로 300,000,000 전액 감면(면제).

**세액 영향**: 산출세액 300,000,000 기준 100,000,000 과소감면(= 결정세액 100,000,000 과다)

**처방**

`applyAnnualLimit` 호출을 제거하고 한도 판정은 `transfer-tax-reduction-cap.ts`/`aggregate-reduction-limits.ts`(§133 그룹 단일 소스)에 위임. `annualLimit`·`isLimitApplied` 결과 필드는 §97 계열에서 0/false로 고정하거나 필드 자체를 제거.

---

## [D1-06] §97①2호(1985.12.31 이전 신축 미입주 공동주택)가 미구현이라 하드 배제된다

- **위치**: `lib/tax-engine/transfer-reductions/rental-97-main.ts:55`
- **조문**: 조특법 §97①2호
- **유형**: legal-accuracy · **차원**: §97·§97의2 장기임대 · **검증**: 생존 1/1
- **중복 병합**: D9-02 (같은 결함을 다른 차원이 독립 발견)

**결함**

§97①2호(1985.12.31 이전 신축 공동주택으로 1986.1.1 현재 미입주)가 미구현이라, 조문상 「각 호의 어느 하나」로 1호와 대등한 선택적 요건임에도 1985년 이전 신축이 `CONSTRUCTION_YEAR_OUT`으로 일괄 차단되어 감면 0이 된다(실측: 산출세액 60,000,000 · 단서 다목 10년 이상 임대 케이스에서 1984년 → 0원, 1993년 → 60,000,000원). 다만 원 주장의 두 서술을 정정한다.

(a) **누락 필드는 1개가 아니라 2개다.** 2호는 ⓐ「공동주택」일 것과 ⓑ「1986.1.1 현재 입주된 사실이 없을 것」 두 사실을 모두 요구하는데, `Rental97MainInputForm.tsx`에는 둘 다 위젯이 없다(폼 필드는 registrationDate·isTaxRegistered·rentalStartDate·constructionYear·isNationalHousing·provisoCase + 공통 필드뿐). 원 주장은 ⓑ만 지목했다. 따라서 구현 시 14지점 동기화 대상 신규 필드는 2개이며, 「미해당」 선택지를 둔 3-state가 필요하다(미입력=미해당으로 읽으면 기존 1호 사용자가 영향받는다).

(b) **「법 근거 없이 배제」는 맞지만 「침묵」 배제는 아니다.** `ineligibleReasons`가 `rental97TaxDetail`로 실려 `ReductionDetailCards.tsx:195` → `Rental97DetailCard.tsx:60-64`에서 실제로 렌더되므로, 사용자는 「1985.12.31 이전 신축 미입주 공동주택(2호)은 세무사 확인 필요」 문구를 화면에서 본다. 결함의 본질은 은폐가 아니라, 경고와 무관하게 **계산 결과 자체는 감면 0으로 확정되어 산출된다**는 점이다.

**근거**

`rental-97-main.ts:23-24` `const CONSTRUCTION_YEAR_FROM = 1986; const CONSTRUCTION_YEAR_TO = 2000;` · :55-61 `} else if (input.constructionYear < CONSTRUCTION_YEAR_FROM || input.constructionYear > CONSTRUCTION_YEAR_TO) { reasons.push({ code: "CONSTRUCTION_YEAR_OUT", message: \`신축 연도 ${input.constructionYear}년 — 1986.1.1~2000.12.31 신축 요건 외 (§97①1호. 1985.12.31 이전 신축 미입주 공동주택(2호)은 세무사 확인 필요).\` …})` — 2호를 인지하면서도 판정을 차단으로 처리한다. 2호 판정에 필요한 「1986.1.1 현재 미입주」 필드는 존재하지 않는다(`grep -rn "미입주|입주된 사실|noOccupancy|neverOccupied" lib/ components/` → 주석·설명 문자열 7건뿐, 필드 0건). 조문 실독(조특법 MST 280409 제97조①): 「2. 1985년 12월 31일 이전에 신축된 공동주택으로서 1986년 1월 1일 현재 입주된 사실이 없는 주택」.

**실패 시나리오**

입력: 1984년 신축 공동주택(1986.1.1 현재 미입주), 국민주택, 임대개시 1996-03-01, 양도 2008-03-01(12년 임대), type=rental_97_proviso, provisoCase="c_10years", 산출세액 60,000,000. 현재 출력: `CONSTRUCTION_YEAR_OUT` → isEligible false → 감면 0원. 조문상 올바른 출력: §97①2호 + 단서(10년 이상 임대) → 양도소득세 면제 60,000,000.

**세액 영향**: 산출세액 60,000,000 기준 60,000,000 과소감면(= 세액 전액 과다)

**처방**

「§97①2호 해당(1985.12.31 이전 신축 공동주택·1986.1.1 현재 미입주)」 3-state 필드를 신설해 constructionYear 범위 검사를 우회시키고, 미선택은 차단(미입력=해당으로 읽지 말 것).

---

## [D1-07] §97① 단서 나목·§97의2①2호의 「취득 당시 입주된 사실이 없는 주택만 해당」 요건 미검증

- **위치**: `lib/tax-engine/transfer-reductions/rental-97-main.ts:114`
- **조문**: 조특법 §97① 단서 · §97의2①2호
- **유형**: legal-accuracy · **차원**: §97·§97의2 장기임대 · **검증**: 생존 1/1

**결함**

§97① 단서 나목·§97의2①2호가 명문으로 요구하는 「취득 당시 입주된 사실이 없는 주택만 해당한다」 요건이 **입력 필드·엔진 검사 어디에도 없다**. `rental-97-main.ts:114-124`의 b_purchase 분기는 취득일 두 검사(`MISSING_ACQUISITION_DATE` / `PURCHASE_BEFORE_1995`)만 수행하고, `rental-97-2.ts:41-47`은 `rental972Type` 존재 여부만 본다. 결과적으로 취득 당시 임차인이 입주해 있던 매입임대주택도 100% 면제를 받는다(probe 실측: 두 경로 모두 `reductionRate:1.0`·`reductionAmount:40,000,000`).

주장에서 정정할 세 가지:

1. **「본문 50%로 떨어진다」는 부정확하다.** 엔진은 자동 fallback을 하지 않는다 — 요건 미충족 시 `isEligible:false` + `ineligibleReasons`를 반환할 뿐이고, 사용자가 `rental_97_main`을 다시 선택해야 50%가 나온다. 따라서 20,000,000은 「§97① 본문 요건도 충족한다는 전제 하의 차액」이다.

2. **두 경로의 결함 강도가 다르다.** §97①은 UI 라디오 설명(`Rental97MainInputForm.tsx:93`)에 「+ 임차인 미입주」가 적혀 있어 자기선언으로 볼 여지가 있다(약한 완화). **§97의2 2호는 그 고지조차 없다**(`Rental972InputForm.tsx:120-124` — 「1999.8.20~2001.12.31 매매계약+계약금 납부 + 5년 이상 임대」뿐). 결함의 무게중심은 §97의2 쪽이다.

3. **인접 미검증이 하나 더 있다(주장 범위 밖이나 같은 함수).** §97의2①2호는 가·나목까지 있다 — 「가. 1999년 8월 20일 이후 신축된 주택 / 나. 제1호나목에 해당하는 주택(1999.8.19 이전 신축 공동주택으로서 1999.8.20 현재 입주된 사실이 없는 주택)」. `evaluateRental972`는 이 목 요건도 전혀 보지 않는다(신축연도 입력 자체가 §97의2 폼에 없다).

**근거**

`rental-97-main.ts:114-124`의 b_purchase 분기는 `if (!input.acquisitionDate) … else if (input.acquisitionDate.getTime() < PURCHASE_ACQ_FROM.getTime()) { reasons.push({ code: "PURCHASE_BEFORE_1995", … }) }` 두 검사뿐이고 미입주 검사가 없다. `rental-97-2.ts`는 2호(매입임대) 선택 시에도 `rental972Type` 존재 여부만 본다(:41-47). 미입주를 나타내는 입력은 저장소 전체에 없다 — `grep -rn "미입주|입주된 사실|noOccupancy|neverOccupied" lib/ components/` → `rental-97-2.ts:9·11`, `rental-97-main.ts:6·58`, `types.ts:158`, `Rental97MainInputForm.tsx:9·91`(설명 문구) 뿐, 필드·검사 0건. 조문 실독(조특법 MST 280409): §97① 단서 「…매입임대주택 중 1995년 1월 1일 이후 취득 및 임대를 개시하여 5년 이상 임대한 임대주택(**취득 당시 입주된 사실이 없는 주택만 해당한다**)…」 · §97의2①2호 「…및 임대를 개시한 임대주택(**취득 당시 입주된 사실이 없는 주택만 해당한다**)」.

**실패 시나리오**

입력: 매입임대, 취득 1996-05-01(취득 당시 임차인이 살고 있던 주택), 국민주택, 신축 1994, 임대개시 1996-06-01, 양도 2002-06-01(6년), type=rental_97_proviso, provisoCase="b_purchase", 산출세액 40,000,000. 현재 출력: isEligible true, reductionRate 1.0 → 40,000,000 전액 면제. 조문상 올바른 출력: 단서 나목의 미입주 요건 불충족 → 단서 100% 면제 불가, 본문 50%(20,000,000)만 가능.

**세액 영향**: 산출세액 40,000,000 기준 20,000,000 과다면제(§97의2 2호에서는 전액 과다면제)

**처방**

b_purchase·rental972Type="purchase" 선택 시 「취득 당시 입주 사실 없음」 3-state 확인 필드를 필수로 요구하고(미선택 차단), 엔진에서 false면 단서/§97의2 적용을 배제.

---

## [D1-08] §97 임대기간·임대료 판정 로직이 두 파일에 통째로 복제돼 있고 둘 다 살아 있다 (dual truth)

- **위치**: `lib/tax-engine/transfer-reductions/rental-97-shared-helpers.ts:34`
- **조문**: 조특법 §97·§97의2 (임대기간 계산: 조특령 §97⑤·조특칙 §44)
- **유형**: wiring · **차원**: §97·§97의2 장기임대 · **검증**: 생존 1/1

**결함**

주장은 유지된다. 다음 3점만 정밀화한다.

**① 중복 항목은 함수 3개가 아니라 「함수 3개 + 상수 1개」다.** 180일 상수도 각 파일에 별도 선언돼 있다 — `rental-housing-reduction.ts:132 const SIX_MONTHS_DAYS = 180`(비공개, 파일 내부 전용) / `rental-97-shared-helpers.ts:17 export const RENTAL_VACANCY_GRACE_DAYS = 180`. 드리프트가 실제로 일어나는 지점은 이 두 리터럴이므로 수정 대상 목록에 명시해야 한다. 반대로 shared의 `calcRentalGainRatio`(:104~)·`DEFAULT_JEONSE_CONVERSION_RATE`(:20)는 레거시에 대응물이 없어 중복이 아니다.

**② 「한쪽만 고치면 드리프트한다」보다 상황이 강하다 — 두 사본은 한 번의 계산에서 나란히 실행된다.** `calcReductions`(lib/tax-engine/transfer-tax-reductions-calc.ts) 안에서 레거시 분기(:104 `if (rentalReductionDetails)` → :110 `candidates.push({ type: "long_term_rental" })`)와 신규 §97 분기(:119 `evaluateRental97TaxAmount` → :141 `candidates.push({ type: rental97Result.id })`)가 **둘 다 평가되어 같은 §127⑦ max 후보 배열에 들어간다**. LTHD 축도 동일하게 `transfer-tax-lthd.ts:158` 레거시 `getLongTermDeductionOverride`가 `:403 evaluateRental97Lthd`보다 **먼저** 돌고 `hasOverride` 시 early-return한다. 따라서 「잠재적 드리프트 위험」이 아니라 「같은 요건을 두 번 판정하는 live 이중 판정」으로 서술하는 편이 정확하다.

**③ 담당 조문이 겹친다는 점을 근거에 넣어야 주장이 완결된다(축 분리 반론 차단).** 레거시 헤더(`rental-housing-reduction.ts:1-11`)가 「§97 공공건설임대 / §97의3 장기일반민간임대 / §97의4 공공지원민간임대 / §97의5 공공매입임대」를 명시하고, shared를 쓰는 신규 모듈도 `rental-97-main.ts:2`(「조특법 §97①」)·rental-97-2/3/4/5로 **같은 조문 집합**을 다룬다. 두 사본이 서로 다른 축을 담당하는 정당한 분리가 아님이 이로써 확정된다.

(원 주장 중 다음은 실측과 정확히 일치해 정정 불필요: 세 함수의 본문 diff 두 줄 · 레거시 경로의 API 도달성(transfer-tax-schema-sub.ts:141 → transfer-tax-schema.ts:201 → engine-input.ts:211, 추가로 multi/route.ts:235도 동일 경로) · shared 헤더 :5-7의 「UI 미배선」 서술이 UI 한정으로만 참이라는 지적 · 조특칙 §44 「3월이내」.)

**근거**

본문 diff 실측: `sed -n '159,181p' lib/tax-engine/rental-housing-reduction.ts` vs `sed -n '34,53p' lib/tax-engine/transfer-reductions/rental-97-shared-helpers.ts` → 주석 제거 후 차이는 두 줄뿐(`VacancyPeriod[]`↔`Rental97VacancyPeriod[]`, `SIX_MONTHS_DAYS`↔`RENTAL_VACANCY_GRACE_DAYS`), 로직 동일. `convertToStandardDeposit`(legacy :191-200 / shared :58-66)·`validateRentIncrease`(legacy :207-234 / shared :72-99)도 동일. 두 경로 모두 live: 신규 경로 `rental-97-main.ts:73`·`rental-97-2.ts:59` → shared; 레거시 경로 `transfer-tax-reductions-calc.ts:106` `calculateRentalReduction(detailsWithTax, longTermRentalRules)` 및 `transfer-tax-lthd.ts:158` `getLongTermDeductionOverride(input.rentalReductionDetails, …)` → legacy 사본. shared 파일 헤더(:5-7)는 「레거시 파일은 UI 미배선 dead path … 전체 재사용 대신 순수 함수만 분리」라고 적었으나 레거시는 API(`lib/api/transfer-tax-schema-sub.ts:141` `rentalReductionDetailsSchema`, `app/api/calc/transfer/engine-input.ts:211`)로 여전히 도달 가능하다.

**실패 시나리오**

D1-03의 수정(180일 → 조특칙 §44의 3월)을 `rental-97-shared-helpers.ts:17`에만 적용하면, 같은 §97 감면이 레거시 `rentalReductionDetails` 경로(`transfer-tax-reductions-calc.ts:106` → `rental-housing-reduction.ts:171` `SIX_MONTHS_DAYS`)에서는 여전히 180일 기준으로 계산돼 동일 사실관계에 두 개의 임대기간(예: 150일 공실 시 5년 vs 4년)이 나온다. 조문상 올바른 상태: 한 조문의 임대기간 산정은 단일 함수여야 한다.

**세액 영향**: 세액 무영향 — 구조(드리프트 위험). 단 D1-03·D1-04가 한쪽에만 반영되면 위 시나리오대로 세액이 갈린다

**처방**

`rental-housing-reduction.ts`의 세 함수를 삭제하고 `rental-97-shared-helpers.ts`를 import하도록 통합하거나(조문별 임계 차이는 인자로 주입), 레거시 `rentalReductionDetails` 입력 경로 자체를 폐지.

---

## [D1-11] 레거시 장기임대 감면의 법령 인용이 유형과 무관하게 항상 「조특법 §97」로 고정

- **위치**: `lib/tax-engine/transfer-tax-helpers.ts:489`
- **조문**: 조특법 §97 / §97의3 / §97의4 / §97의5
- **유형**: citation · **차원**: §97·§97의2 장기임대 · **검증**: 생존 1/1
- **심각도 조정**: low → medium (검증 결과)

**결함**

`getReductionLegalBasis`(transfer-tax-helpers.ts:489)가 라벨 "장기임대주택"을 무조건 「조특법 §97」로 매핑하는 탓에, 후보 type이 `long_term_rental`로 뭉쳐지는 **레거시 두 경로**에서 §97의3·§97의5 사안의 근거 조문이 §97로 잘못 인쇄·링크된다. (a) `rentalReductionDetails` 경로(transfer-tax-reductions-calc.ts:111-115)는 4개 임대유형(§97·§97의3·§97의4·§97의5)을 구분 없이 `long_term_rental`로 push한다 — 단 이 경로는 클라이언트 생산자가 없어 직접 API POST로만 발화한다. (b) 실제 화면에서 발화하는 경로는 레거시 평면 `reductions[{type:"long_term_rental"}]`(같은 파일 :341-351, 8년 50% §97의3 경과규정)이며, 값은 `calc-wizard-migration.ts:166-174`의 구버전 sessionStorage 마이그레이션으로 생긴다. UI 자신이 이 항목을 §97의3이라고 설명하므로(Step5.tsx:23·:197) `DetailedCalculationStatementCard.tsx:239-240`의 `LawArticleModal`이 §97의3 사안에 §97 모달을 연다. 반면 현행 마법사가 생성하는 `rental_97_3`·`rental_97_4`·`rental_97_5`는 라벨이 맵 키와 일치하지 않아 legalBasis가 **undefined**가 되므로 「틀린 링크」가 아니라 「근거 조문 누락」이다(주장의 「§97의3~§97의5 사안에서 틀린 링크가 열린다」는 이 부분에서 부정확).

**근거**

`transfer-tax-helpers.ts:489` `"장기임대주택":            TRANSFER.REDUCTION_LONG_RENTAL,` · `lib/tax-engine/legal-codes/transfer.ts:110-111` `/** 조특법 §97 — 장기임대주택 양도소득세 감면 */ REDUCTION_LONG_RENTAL: "조특법 §97",`. 후보 생성부 `transfer-tax-reductions-calc.ts:108-114`는 `rentalHousingType`이 `long_term_private`(§97의3)·`public_support_private`(§97의4)·`public_purchase`(§97의5) 어느 것이든 `type: "long_term_rental"` 하나로 push한다(`rental-housing-reduction.ts:23-27`이 4유형을 §97·§97의3·§97의4·§97의5로 명시). 라벨도 `transfer-reduction-type-labels.ts:28` `long_term_rental: "장기임대주택"` 하나뿐이라 유형이 화면에서 구분되지 않는다.

**실패 시나리오**

입력: `rentalReductionDetails.rentalHousingType = "public_purchase"`(§97의5), 요건 충족. 현재 출력: 「감면세액 — 장기임대주택 감면 …」 step의 legalBasis가 「조특법 §97」로 표시·링크된다. 올바른 출력: 「조특법 §97의5」(같은 파일 :506이 경고 문구에서는 `TRANSFER.REDUCTION_LONG_RENTAL_PUBLIC` = 「조특법 §97의5」를 이미 쓰고 있어 한 결과 안에서 인용이 서로 다르다).

**세액 영향**: 세액 무영향 — 표시/인용

**처방**

`calculateRentalReduction` 결과의 `reductionType`(4유형)을 후보 type·라벨·legalBasis까지 전달해 유형별 조문 상수를 쓰거나, 레거시 경로를 폐지하고 `rental_97_*` id 체계로 수렴시킬 것.

---

## [D1-12] §97 시리즈 감면 채택 시 「감면세액」 step의 법령 근거가 undefined로 떨어진다

- **위치**: `lib/tax-engine/transfer-tax-helpers.ts:487`
- **조문**: 조특법 §97① 본문·단서 · §97의2
- **유형**: citation · **차원**: §97·§97의2 장기임대 · **검증**: 생존 1/1
- **심각도 조정**: low → medium (검증 결과)
- **중복 병합**: D7-05, D10-04, D11-03 (같은 결함을 다른 차원이 독립 발견)

**결함**

`getReductionLegalBasis`(lib/tax-engine/transfer-tax-helpers.ts:482-497)는 **화면 라벨 문자열**을 키로 조회하는데, 라벨 단일 소스(`transfer-reduction-type-labels.ts`, 커밋 f1ec4db4에서 조문 병기·괄호 표기가 표준화됨)와 어긋나 §97 시리즈뿐 아니라 **31개 라벨 중 28개가 undefined로 떨어진다**. 실측 대조 결과 일치하는 키는 `장기임대주택`·`신축주택`·`미분양주택` 3개뿐이고, 그 3개조차 레거시 type 경로(`long_term_rental`은 :341-345 주석상 신규 입력에서 도달 불가)에 대응한다. 반대로 살아 있는 주 경로인 §69 자경농지(`"자경농지 (§69)"` vs 키 `"자경농지"`)·§77 공익수용(`"공익사업용 토지 수용 (§77)"` vs 키 `"공익사업용 토지 수용(§77)"` — 괄호 앞 공백 1칸 차이)도 MISS이고, §77의2·§77의3·§98 시리즈 9종·§99 시리즈 5종·축산업·어업도 전부 MISS다. 결과적으로 `useLegacyRates` 분기(§77 경과규정 병기)는 도달 불가능한 dead branch가 됐다. 표시 영향은 단건 결과뷰의 `LawArticleModal` 미렌더(`DetailedCalculationStatementCard.tsx:239-240`)와 다건 breakdown 근거 줄 공란(`MultiTransferPropertyBreakdown.tsx:351`) 두 곳. 세액 무영향. 정본 수정 방향은 맵에 라벨을 추가하는 것이 아니라, 이미 존재하는 id 기반 resolver 패턴(`transfer-tax-aggregate-pickers.ts:178 resolveTypeLegalBasis`)처럼 **`reductionTypeApplied`(enum id)를 키로 쓰도록 전환**하는 것이다.

**근거**

`transfer-tax-finalize.ts:320-326`가 `legalBasis: getReductionLegalBasis(reductionType, …)`로 넘기는 `reductionType`은 `transfer-tax-reductions-calc.ts:372` `const reductionTypeDisplay = best.type ? reductionTypeLabelOf(best.type) : undefined;`의 출력이다. `reductionTypeLabelOf`(transfer-reduction-type-labels.ts:66-69)는 `REDUCTION_TYPE_LABELS[type] ?? UNKNOWN_REDUCTION_LABEL`이고, :35-37이 `rental_97_main: "장기임대주택 (§97 ① 본문)"`, `rental_97_proviso: "장기임대주택 (§97 ① 단서)"`, `rental_97_2: "신축임대주택 (§97의2)"`를 준다. 반면 `transfer-tax-helpers.ts:486-495`의 맵 키는 `"자경농지"`·`"장기임대주택"`·`"신축주택"`·`"미분양주택"`·`"공익사업용 토지 수용(§77)"` 다섯 개뿐 — §97 시리즈 라벨과 문자열이 일치하지 않아 `map[reductionType]`이 undefined다(같은 이유로 `"자경농지 (§69)"`·`"공익사업용 토지 수용 (§77)"` 등 다른 라벨도 공백 차이로 어긋난다).

**실패 시나리오**

입력: §97① 단서(건설임대 5년) 감면이 §127⑦ max에서 채택. 현재 출력: `steps`의 「감면세액」 항목 `legalBasis: undefined` → 결과 화면에 조문 링크가 표시되지 않는다. 올바른 출력: `TRANSFER_REDUCTION_ARTICLE.RENTAL_97_PROVISO`(= 「조특법 §97 ① 단서」, legal-codes/transfer-house.ts:163).

**세액 영향**: 세액 무영향 — 표시/인용

**처방**

`getReductionLegalBasis`의 조회 키를 표시 라벨이 아니라 `reductionTypeApplied`(내부 id)로 바꾸고 `TRANSFER_REDUCTION_ARTICLE`을 단일 소스로 사용. 라벨↔id 어긋남을 고정하는 anchor를 함께 추가.

---

## [D10-03] §155⑳ 거주주택 특례 경로가 농특세를 totalTax엔 넣고 ruralSurtax 필드엔 안 싣는다

- **위치**: `lib/tax-engine/transfer-tax-rental-housing-step.ts:614`
- **조문**: 농어촌특별세법 §5①1호
- **유형**: display · **차원**: 효과축·정수연산·농특세 · **검증**: 생존 1/1

**결함**

§155⑳ 거주주택 특례 경로(`transfer-tax-rental-housing-step.ts`)는 `resolveTaxCreditRuralSurtax`로 농특세를 판정해 steps(:530-536)와 `totalTax`(:614)에는 반영하면서도, 반환 객체(:563-618)에 `ruralSurtax` echo 키를 싣지 않는다. 이 경로는 `transfer-tax.ts:573` `if (rheResult) return rheResult;`로 조기반환해 echo를 채우는 `finalizeTransferTax`를 건너뛴다. 그 결과 `resolveRuralSurtax`(`reduction-eligible-income.ts:84`)의 폴백이 차감형 detail 합으로 떨어지는데, 이 경로는 차감형을 애초에 계산하지 않으므로 항상 0이 된다.

실측(§155⑳ 시나리오A + 조특법 §77 공익수용, mock 세율): `reductionAmount 17,463,000` · `totalTax − (determinedTax + localIncomeTax) = 3,492,600` · `result.ruralSurtax = undefined` · `resolveRuralSurtax = 0`. 같은 감면으로 특례만 끄면 `result.ruralSurtax = 3,492,600`으로 정상이다.

영향 범위 정정 — 「결과 화면·PDF」보다 넓고, 동시에 「화면에서 완전히 사라진다」보다는 좁다:
· `TransferTaxResultView.tsx:396,408` 총 납부세액 분해 줄에서 농특세 항목이 통째로 미표시 ⇒ 「결정세액 + 지방소득세」 합이 총 납부세액과 3,492,600 어긋난다.
· `FilingFormTableHelpers.ts:652` 신고서 양식 농특세 total 칸 = 0.
· `DetailedStatementFormulaBuilders.ts:224` 상세명세서 = 0.
· `lib/pdf/ResultPdfDocument.tsx:217,243` PDF 농특세 행 미출력.
· 반면 **계산과정 steps에는 「농어촌특별세 (감면세액 × 20%)」 3,492,600이 남아 있다** — 완전 은폐는 아니다.

안전망 부재도 함께 기록할 것: 기존 anchor `rural-surtax-tax-credit.anchor.test.ts:81-82`가 `totalTax`에서 역산해 농특세를 구하므로 echo 필드 누락을 원리적으로 감지하지 못한다. 또 `rental-housing-reduction-notice-f08.anchor.test.ts:32-35`의 「농특세는 붙이지 않는다」 주석은 stale이다.

수정 방향은 형제 경로(`transfer-tax-redevelopment.ts:736-738` `ruralSurtax: ruralSurtaxTotal,`)와 동형으로 `ruralSurtax: rheSurtaxVerdict.surtax`를 반환 객체에 싣는 것이며, `totalTax`는 이미 포함하고 있으므로 세액은 불변이다.

**근거**

transfer-tax-rental-housing-step.ts:525-529 `const rheSurtaxVerdict = resolveTaxCreditRuralSurtax({ reductionTypeApplied: reductionResult.reductionTypeApplied, reductionAmount: rheReductionAmount, ... });` → :614 `totalTax: rheDeterminedTax + rheLocalIncomeTax + filingDelayedPenalty + rheSurtaxVerdict.surtax,`. 그러나 :563-618 반환 객체 어디에도 `ruralSurtax:` 키가 없다 — `grep -n "ruralSurtax" lib/tax-engine/transfer-tax-rental-housing-step.ts` 결과 **0건**(대소문자 구분 — 함수명 `resolveTaxCreditRuralSurtax`는 `RuralSurtax`라 매칭되지 않는다).

소비층이 실재한다: `components/calc/results/transfer/reduction-eligible-income.ts:84` `return result.ruralSurtax ?? incomeDeductionRuralSurtax(result);` · `lib/pdf/ResultPdfDocument.tsx:217` `const ruralSurtax = (num(r.ruralSurtax) ?? new993?.ruralSurtax ?? 0) as number;`. 두 곳 다 undefined면 차감형 detail 합(=0)으로 떨어진다.

형제 경로가 이미 같은 결함을 고쳤다: transfer-tax-redevelopment.ts:736-738 「[echo] 농특세 총액(§99의3분 + 감면분). 종전에는 이 경로가 `ruralSurtax993`조차 싣지 않아 재개발·입주권에서는 소득금액차감형 농특세까지 화면에서 0이 됐다 — `totalTax`엔 있다.」 `ruralSurtax: ruralSurtaxTotal,`

**실패 시나리오**

장기임대주택 보유자가 거주주택을 양도하면서(§155⑳ 특례 발동) §77 공익수용 감면도 받는 경우 → 결과 카드·PDF의 농어촌특별세 칸은 0으로 표시되는데 총 납부세액에는 감면세액×20%가 포함돼 있어 「항목 합 ≠ 총액」 자기모순이 화면에 남는다. 올바른 동작은 `ruralSurtax: rheSurtaxVerdict.surtax`를 결과에 실어 표시와 합계를 일치시키는 것.

**세액 영향**: 세액 무영향 — 표시/전파. 다만 `reduction-eligible-income.ts`·PDF가 0을 읽어 신고서 농특세 칸이 비게 된다.

**처방**

반환 객체에 `ruralSurtax: rheSurtaxVerdict.surtax`를 추가한다(transfer-tax-redevelopment.ts:738과 동형).

---

## [D11-02] 일괄양도 컴패니언 자산에 §77 자경 여부 축 자체가 없음 — ⑫④⑭ 동시 부재

- **위치**: `app/api/calc/transfer/bundled-split-helpers.ts:428`
- **조문**: 농어촌특별세법 시행령 §4①1호 (조특법 §77)
- **유형**: wiring · **차원**: 배선 14지점·결과뷰 · **검증**: 생존 1/1
- **중복 병합**: CB-06 (같은 결함을 다른 차원이 독립 발견)

**결함**

일괄양도 컴패니언 자산은 §77 공익수용 감면을 선택할 수 있고(⑫ companionAssetSchema:451 `reductions: z.array(reductionSchema)` + `reductionSchema`의 public_expropriation variant `lib/api/transfer-tax-schema-reductions.ts:60` + `asset-kind-gate.ts:97-99` standalone 무조건 허용), 「직접 경작한 토지 여부」 라디오도 **Step5 감면 패널이 아니라 Step4 자산 카드**에서 렌더된다(`CompanionAssetCard.tsx:345` → `asset-sections/AssetSectionTransfer.tsx:59` → `TransferModeBlock.tsx:161` → `ExpropriationBlock.tsx:205-209`). 그러나 그 값을 자산-수준 `isSelfCultivatedExpropriatedLand`로 승격하는 처리가 ④(`lib/calc/transfer-tax-api.ts:508`은 `primary.reductions`만 본다) · ⑫(`companionAssetSchema`에 키 없음) · ⑭(`bundled-split-helpers.ts`의 `companionEngine`에 키 없음, 파일 전체 grep 0건) 어디에도 없어, 집계 경로의 `computeAggregateTaxCreditRuralSurtax`(`transfer-tax-aggregate-reduction-step.ts:273-275`)가 컴패니언 자산을 항상 `undefined`로 읽고 `transfer-tax-rural-surtax.ts:138`의 `=== true` 게이트를 통과하지 못해 감면세액 × 20%의 농특세가 부과된다. **결함은 자산 배치(순서) 의존이다** — 같은 농지를 주 자산으로 두면 `route.ts:262`의 `{...engineInput}` 스프레드로 플래그가 살아 0원이 되고, 컴패니언으로 두면 과세된다(단건 경로도 0원 — `transfer-tax-finalize.ts:471`).

**근거**

⑭: `app/api/calc/transfer/bundled-split-helpers.ts:428` 은 `reductions: mapReductionsToEngine(c.reductions ?? []),` 만 싣고 자산-수준 자경 플래그는 없다(`grep -n "isSelfCultivatedExpropriatedLand" app/api/calc/transfer/bundled-split-helpers.ts` → 0건). ⑫: `lib/api/transfer-tax-schema-sub.ts` 의 `companionAssetSchema`(:369~:550) 전문을 읽었으나 해당 키가 없다(:451 `reductions: z.array(reductionSchema).default([]),` 는 있다). ④: `lib/calc/transfer-tax-api-helpers.ts:331` `const reductions = toEngineReductions(asset.reductions ?? [], ...)` 만 있고, `toEngineReductions`의 public_expropriation 분기(`lib/calc/transfer-tax-api-reductions.ts:68-85`)는 `cashCompensation·bondCompensation·bondHoldingYears·businessApprovalDate` 만 반환하며 `expropriationSelfCultivated`를 싣지 않는다(그 값은 단건 ④가 자산-수준으로 올려야 하는데 primary만 처리한다 — `transfer-tax-api.ts:508` `primary.reductions`). 반면 주 자산은 정상이다 — `app/api/calc/transfer/route.ts:262-272` 가 `{...engineInput, ...}` 로 복제하고 `engineInput`은 `app/api/calc/transfer/engine-input.ts:72` 에서 필드를 받는다. ⑤ 도달성: `app/calc/transfer-tax/steps/Step5.tsx:569` `{form.assets.map((asset, i) => (` 로 **자산마다** 감면 패널이 뜨고, 자경 라디오는 `components/calc/transfer/ExpropriationBlock.tsx:206` 이 CompanionAssetCard 안에서 렌더된다. 자산종류 게이트도 standalone은 통과시킨다(`lib/tax-engine/transfer-reductions/asset-kind-gate.ts:97-99`).

**실패 시나리오**

자산1=주택, 자산2=농지(직접 경작)로 일괄양도하고 자산2에 §77 공익수용 감면 + 「직접 경작 = 예」를 선택. 자산2 배분 감면세액이 30,000,000원이면 → 현재 출력: `computeAggregateTaxCreditRuralSurtax`(transfer-tax-aggregate-reduction-step.ts:250-278)가 `rec.item.isSelfCultivatedExpropriatedLand === undefined` 를 보고 농특세 6,000,000원 부과. → 올바른 출력: 0원. 같은 농지를 단건으로 계산하면 0원이라 자산 배치만으로 결과가 갈린다.

**세액 영향**: 컴패니언 배분 감면세액 × 20%. 예: 30,000,000 → 6,000,000원 과다.

**처방**

⑫ `companionAssetSchema`에 `isSelfCultivatedExpropriatedLand: z.boolean().optional()` 추가, ④ `buildAssetPayload`가 단건 ④와 **같은 leaf**로 자산의 reductions에서 값을 올리도록 하고, ⑭ `buildCompanionEngineInputs` 반환 객체에 전달. 단건 ④의 판정식(`some(r => r.type==="public_expropriation" && r.expropriationSelfCultivated===true)`)을 복사하지 말고 공용 함수로 추출할 것.

---

## [D11-05] §98·§98의2·§98의8·§99 「거주자」 요건 게이트가 ⑤④⑫ 전무로 영구 사문

- **위치**: `lib/api/transfer-tax-schema-reductions.ts:229`
- **조문**: 조특법 §98의8① · §99① · §98① · §98의2① · §98의7①
- **유형**: reachability · **차원**: 배선 14지점·결과뷰 · **검증**: 생존 1/1
- **중복 병합**: D6-04 (같은 결함을 다른 차원이 독립 발견)

**결함**

결함은 성립한다. 다만 서술 4곳을 정정한다.

(1) **누락 계층은 ⑤④⑫가 아니라 ①⑤④⑫다.** ① store 폼 타입에도 필드가 없다 — `lib/stores/calc-wizard-asset-reduction.ts` `unsold_98`(:326-333, 6필드)·`unsold_98_2`(:337-344, 3필드)·`new_99`(:251-)·`unsold_98_8`(:289-)·`unsold_98_7`(:459-) 어디에도 거주자 필드가 없다. 따라서 수정 시 ①까지 5계층 작업이다.

(2) **§98을 「20% 분리과세」라 한 것은 부정확하다.** §98①은 선택 구조다 — 1호는 「소득세법 §92에 따라 양도소득 과세표준·세액을 계산하되 **세율만 §104①에도 불구하고 100분의 20**」, 2호는 「소득세법 §14·§15에 따라 **종합소득**으로 계산·납부」다. 분리과세가 아니라 「양도소득 세율 20% 선택 또는 종합소득세 방식 선택」이다(저장소 자신의 라벨도 `calc-wizard-asset-reduction.ts:325` "§98 미분양 국민주택 — 세율 20% 선택").

(3) **§98의2는 「감면」이 아니다.** §98의2①은 LTHD를 소법 §95② **표2**로, 세율을 §104①**1호(기본세율)**로 적용하는 특칙이다(중과 배제 성격). "§98·§98의2도 동일 구조이며"라는 뭉뚱그림은 효과 유형을 오도한다 — 동일한 것은 **「거주자」 요건 게이트가 사문이라는 구조**이지 감면 효과가 아니다.

(4) **§98의7의 요건은 「거주자」가 아니라 「내국인」이다**(클레임도 그렇게 적었으나 함의를 덧붙인다). 조특법 §2①1호 「"내국인"이란 「소득세법」에 따른 **거주자** 및 「법인세법」에 따른 **내국법인**을 말한다」 ⇒ 개인 양도소득세 국면에서 내국인은 사실상 거주자와 동치다. 따라서 `lib/tax-engine/transfer-reductions/unsold-hybrid.ts:107` 주석 「내국인 (법① — **거주자 한정 아님**). 기본 true」와 `components/calc/transfer/Unsold987InputForm.tsx:8·:184` 「내국인에게 적용됩니다 (**거주자 한정 아님** — 법 §98의7①)」는 §2①1호에 비추어 오해를 부른다 — 개인이라면 거주자여야 하고, 「거주자 한정 아님」이 유의미한 것은 내국법인이 주체인 경우뿐이다. 이 UI 안내는 별건 정정 대상이다(클레임 미포함 추가 발견).

**근거**

엔진 게이트 실재: `lib/tax-engine/transfer-reductions/unsold-98-8.ts:157` `if (input.isResident === false) {`, `new-99.ts:148` 동일 + `:156` `if (input.isHousingConstructionBusiness === true) {`, `unsold-hybrid-p4.ts:59`, `unsold-hybrid-p5.ts:84`. 주입부가 전부 상수 fallback: `income-deduction-router.ts:242` `isResident: (r99.isResident99 as boolean | undefined) ?? true,` · `:243` `isHousingConstructionBusiness: (r99.isHousingConstructionBusiness99 as boolean | undefined) ?? false,` · `:274` `isResident: (r988.isResident988 as boolean | undefined) ?? true,` · `unsold-hybrid-p4.ts:218` `(r.isResident982 ...) ?? true` · `unsold-hybrid-p5.ts:183` `(r.isResident98 ...) ?? true` · `unsold-hybrid.ts:602` `isDomestic: (r.isDomestic987 as boolean | undefined) ?? true,`. ⑫에 해당 키 부재 — `lib/api/transfer-tax-schema-reductions.ts` 의 `unsold_98`(:229-238)·`unsold_98_2`(:241-246)·`unsold_98_8`(:314-329)·`new_99`(:157-172)·`unsold_98_7`(:300-311) 블록 전문을 읽었고 `isResident98/982/988/99`·`isHousingConstructionBusiness99`·`isDomestic987` 이 없다. ④ 미전송 — `grep -n "isResident98\|isResident982\|isDomestic987\|isResident988\|isResident99\b\|isHousingConstructionBusiness99\b" lib/calc/transfer-tax-api-reductions.ts` → 0건. ⑤ 미존재 — `grep -rn "거주자" components/calc/transfer/Unsold98InputForm.tsx Unsold982InputForm.tsx Unsold988InputForm.tsx New99InputForm.tsx` → 0건(반증 시도: 다른 이름도 찾았으나 `isResident993`만 존재). 대조군(정상 구현 sibling): §99의3은 `isResident993`이 ①②③④⑤⑫ 전부 배선돼 있다 — `components/calc/transfer/New993InputForm.tsx:350`, `lib/calc/transfer-tax-api-reductions.ts:139`, `lib/api/transfer-tax-schema-reductions.ts:196`. 조문(KoreanLaw MCP 실독, MST 280409): §98의8① 「**거주자가** 대통령령으로 정하는 준공후미분양주택으로서 …」, §99① 「**거주자**(주택건설사업자는 제외한다)가 …」.

**실패 시나리오**

국내에 거주하지 않는 비거주자가 §99 신축주택 감면(1998.5.22~1999.6.30 신축주택)을 선택해 단건 계산. → 현재 출력: `evaluateNew99`가 `input.isResident === false` 분기를 타지 못하고(값이 항상 true) 나머지 요건만 보고 적격 판정 → 양도소득금액 전액(5년 내) 또는 5년분이 과세대상소득금액에서 차감되어 세액이 크게 줄거나 0이 된다. → 올바른 출력: §99① 본문이 거주자로 한정하므로 감면 0원, 차감 0원. §98의8(50% 차감)·§98(20% 분리과세)·§98의2도 동일 구조이며, §99는 「주택건설사업자」인 납세자에게도 감면이 나간다.

**세액 영향**: 조문별 차감·감면 전액. 예: §99 5년 내 양도로 양도소득금액 300,000,000원이 전액 차감되면 과세표준 0 → 결정세액 0(올바른 값은 감면 없는 정상 세액).

**처방**

두 갈래 중 하나를 택하되 「미입력=요건 충족」으로 두지 말 것. (a) §99의3 sibling과 동일하게 §98·§98의2·§98의8·§99에 거주자(§99는 주택건설사업자도) 선택지를 ①②③④⑤⑫에 배선한다 — 신규 필드에는 「미해당」을 포함한 3-state를 주고 미입력은 ⑧에서 차단. (b) 배선하지 않겠다면 엔진의 `?? true`/`?? false` 상수 fallback과 죽은 게이트를 제거하고 대신 결과 화면에 「거주자 요건은 검증하지 않았습니다」 고지를 남긴다.

---

## [D2-05] §97의5②의 §97의3·§97의4 중복적용 배제가 엔진에 없다 — 70% 대체와 100% 감면이 동시 적용

- **위치**: `lib/tax-engine/transfer-reductions/rental-97-router.ts:111`
- **조문**: 조특법 §97의5②
- **유형**: wiring · **차원**: §97의3·4·5 LTHD축 · **검증**: 생존 3/3
- **심각도 조정**: high → medium (검증 결과)

**결함**

조특법 §97의5②(「제1항에 따른 세액감면은 제97조의3 … 및 제97조의4 … 와 중복하여 적용하지 아니한다」)의 트랙 간 중복배제가 엔진 어느 층에도 없다. `rental-97-router.ts:116-121`(STEP 4 LTHD)과 `:132-137`(STEP 8 세액감면)이 각자 자기 ID 집합의 첫 항목만 보고 상대 트랙을 참조하지 않아, 한 자산의 reductions에 rental_97_3(또는 rental_97_4)과 rental_97_5가 함께 실리면 장특 70% 대체와 산출세액 100% 감면이 동시에 적용된다. ⑧ validate·⑫ Zod·⑭ route mapper에도 상호배타 검사 0건.

도달 경로는 `/api/calc/transfer` 직접 POST **한 가지뿐**이다 — 앱 UI·스토어 경로는 `UnifiedReductionPanel-defaults.ts:71-89 toggleGroupRadio`가 같은 category("rental") 항목을 항상 제거하므로 공존 배열을 만들 수 없다(주장의 「저장된 폼 복원 경로」는 성립하지 않음).

세액 영향은 `calculateTransferTax` 전체 관통으로 실측했다(주장이 「확인 필요」로 남긴 부분): 양도 14억·취득 5억·취득 2018-06-01·등록 2018-08-01·임대개시 2018-09-01·양도 2029-01-01·기준시가 5억/6억/9억(rentalGainRatio 0.75) ⇒ §97의5 단독 결정세액 66,352,500 vs 둘 다 적용 31,515,000 = **34,837,500원 과소**. 배열 순서를 바꿔도 값이 같아 「첫 항목 우선」은 트랙 간 구별력이 0이다. rentalGainRatio가 1이면 양쪽 다 결정세액 0으로 수렴해 차이가 없다.

관련 anchor 0건(안전망 없음).

**근거**

rental-97-router.ts:21-22 `const LTHD_IDS = new Set(["rental_97_3", "rental_97_4"]); const TAX_AMOUNT_IDS = new Set(["rental_97_main", "rental_97_proviso", "rental_97_2", "rental_97_5"]);` → :111-122 `evaluateRental97Lthd`는 LTHD_IDS 첫 항목만, :127-138 `evaluateRental97TaxAmount`는 TAX_AMOUNT_IDS 첫 항목만 본다. 두 함수 어디에도 상대 트랙 선택 여부를 보는 코드가 없다(파일 헤더 :7-10 주석은 「UI 라디오 단일 선택이 1차 차단」이라고만 적어 엔진 가드 부재를 자인한다).
다른 층 반증: ⑫ `lib/api/transfer-tax-schema-reductions.ts`의 reductions는 discriminatedUnion 배열로 조합 제약 없음(:124·:140·:147에 rental_97_3/4/5가 각각 독립 객체). ⑧ `lib/calc/transfer-tax-validate-reductions.ts`에서 rental_97_3/4/5는 :155-179의 필수입력 검사에만 등장하고 상호배타 검사 0건.
probe 실측(tsx): reductions=[rental_97_3(본필드 충족), rental_97_5(본필드 충족)], ctx={transferDate 2029-01-01, acquisitionDate 2018-06-01, stdPrice 5억/9억, calculatedTax 100,000,000} →
  `evaluateRental97Lthd` → `{"id":"rental_97_3","isEligible":true,"overrideRate":0.7,"rentalGainRatio":1}`
  `evaluateRental97TaxAmount` → `{"id":"rental_97_5","isEligible":true,"reductionAmount":100000000,"isFullExemption":true}`
두 값은 각각 transfer-tax-lthd.ts:403(STEP 4)과 transfer-tax-reductions-calc.ts:142(STEP 8)에서 소비된다.

**실패 시나리오**

한 자산의 reductions에 rental_97_3과 rental_97_5를 함께 실어 `/api/calc/transfer`에 POST(UI 라디오를 거치지 않는 직접 호출·저장된 폼 복원 경로) → 장기보유특별공제가 70%로 대체되어 산출세액이 낮아지고, 그 낮아진 산출세액에 §97의5 감면이 또 걸린다. 조문상 §97의5를 적용하면 §97의3·§97의4는 적용할 수 없다(또는 그 역).

**세액 영향**: §97의5 안분비율이 1이면 결정세액이 어느 쪽이든 0으로 수렴해 세액 차이가 없으나, 안분비율<1이면 결정세액 = 산출세액 × (1−비율)이므로 §97의3이 산출세액을 깎은 만큼 그대로 과소과세된다. 농특세(감면세액 × 20%) 과세표준도 함께 어긋난다. 비율=1 케이스는 실측했고, 비율<1 조합의 원 단위 세액차는 본 리뷰에서 측정하지 않았다 — 확인 필요.

**처방**

`evaluateRental97Lthd`가 같은 `reductions` 배열에 세액감면 계열(특히 rental_97_5)이 함께 있으면 `undefined`를 반환하거나 불적용 사유(§97의5②)를 실어 배제한다. 어느 쪽을 살릴지는 §127⑦과 같은 「후보 중 택일」이 아니라 §97의5②이 정한 우선순위 문제이므로, 조문대로 §97의5가 있으면 §97의3·§97의4를 끄고 그 사실을 결과 step에 고지한다. ⑧ validate에도 같은 상호배타를 넣어 UI 통과↔엔진 배제 모순을 막는다.

---

## [D2-06] 령 §97의3⑤ 분자 B(실제 임대기간 마지막 날 기준시가)를 양도일 기준시가로 대체

- **위치**: `lib/tax-engine/transfer-reductions/rental-97-shared-helpers.ts:122`
- **조문**: 조특령 §97의3⑤
- **유형**: arithmetic · **차원**: §97의3·4·5 LTHD축 · **검증**: 생존 1/1

**결함**

령 §97의3⑤ 분자 B(실제 임대기간 마지막 날 기준시가)를 양도일 기준시가 D로 대체 — 「임대는 양도일까지 지속」 전제가 산식과 입력 양쪽에 박혀 있다.

정정 사항:
1. **위치 정정**: 문제 라인은 `rental-97-shared-helpers.ts:124-127`(주장은 `:120-124`). 기준시가 3점 타입은 `transfer-reductions/types.ts:169-171`(주장은 `:167-172`), `calculateEffectiveRentalPeriod`는 `:34-53`(주장은 `:31-49`).
2. **「재현 불가」는 과소 서술**: `vacancyPeriods`가 UI(`Rental973InputForm` ④ 공실 섹션)→API→엔진 전 계층 배선돼 있어, 양도일까지 이어지는 공실을 신고하면 **결함이 실제 발현한다**. 임대기간은 줄어드는데 ratio는 그대로여서 코드가 자기 입력과 모순된다. 얻을 수 없는 것은 「올바른 값」이지 「틀린 결과」가 아니다.
3. **발현 범위 확대**: `:115`의 `rentalStartDate <= acquisitionDate → return 1` 조기반환도 같은 전제 위에 있다. 취득 즉시 임대 + 조기 임대종료면 법문상 안분이 필요한데 코드는 기준시가를 보지도 않고 전액 임대분으로 처리한다. 수정 시 이 조기반환도 함께 손봐야 한다.
4. **세액 수치 정정**: 주장 시나리오의 과다공제는 139,028,000원이 아니라 **정확히 140,000,000원**(floor 반영: 685,999,999 − 545,999,999). ratio를 4자리로 반올림한 근사 오차였다.
5. **별건 분리 권고**: 같은 헬퍼를 쓰는 §97의5 경로(`rental-97-5.ts:119-125`)는 조특령 §97의5②의 분자가 「임대기간 마지막 날 기준시가 − **취득 당시** 기준시가」여서 §97의3⑤과 산식이 다르다 — 분자 두 항이 모두 어긋난다. D2-06 범위 밖의 독립 결함.

**근거**

rental-97-shared-helpers.ts:120-124 — `const denominator = transfer - acq; if (denominator <= 0) return null; const ratio = (transfer - start) / denominator; return Math.min(1, Math.max(0, ratio));` — 분자·분모 모두 `stdPriceAtTransfer`를 쓴다.
조문 실측(KoreanLaw MST 287181 §97의3⑤): 「A × (…) / (…), A: 「소득세법」 제92조제2항제1호에 따른 양도차익, **B: 제2항에 따른 실제 임대기간의 마지막 날의 기준시가**, C: 제2항에 따른 실제 임대기간의 개시일의 기준시가, D: 양도일의 기준시가, E: 취득일의 기준시가」 — B와 D가 별개 변수로 정의돼 있다.
입력 자체가 없다: `Rental97EvaluationInput`(transfer-reductions/types.ts:167-172)의 기준시가 3점은 `stdPriceAtAcquisition`·`stdPriceAtRentalStart`·`stdPriceAtTransfer`뿐이고 임대종료 시점 값이 없다. 임대종료일 필드도 없어 `calculateEffectiveRentalPeriod(rentalStartDate, transferDate, vacancyPeriods)`(:31-49)가 종료일을 항상 양도일로 본다. 다만 `vacancyPeriods`로 양도일까지 이어지는 공실을 신고하면 임대기간은 줄어드는데 안분비율은 그대로여서 두 값이 서로 어긋난다.

**실패 시나리오**

취득 2012-01-01(기준시가 3억) → 임대개시 2013-01-01(기준시가 3.2억) → 임대종료 2023-01-01(기준시가 7억) → 공실 후 양도 2026-01-01(기준시가 9억). 현재 비율 = (9−3.2)/(9−3) = 0.9667 → 70% 특례가 양도차익의 96.7%에 적용된다. 조문상 비율 = (7−3.2)/(9−3) = 0.6333이어야 하므로, 양도차익 10억이면 특례 적용분이 966,700,000원 vs 633,300,000원으로 갈린다.

**세액 영향**: 위 예에서 장기보유특별공제 = 0.9667×10억×0.7 + 0.0333×10억×0.28 = 685,014,000원 vs 조문상 0.6333×10억×0.7 + 0.3667×10억×0.28 = 545,986,000원 → **139,028,000원 과다**(공제율 표1 14년 28% 가정. 실제 세액은 세율구간 종속). 임대종료 시점 기준시가 입력 경로가 없어 현행 코드로는 재현 불가 — 산식·입력 양쪽의 결함이다.

**처방**

`Rental97EvaluationInput`에 임대종료일과 그 시점 기준시가(B)를 추가하고(14지점 동기화), `calcRentalGainRatio`의 분자를 `stdPriceAtRentalEnd − stdPriceAtRentalStart`로 바꾼다. 미입력 시 자동 안분 금지 원칙대로 `MISSING_PRORATION_PRICES` 사유를 내되, 임대가 양도일까지 계속된 경우(임대종료일=양도일)는 현행처럼 D를 쓰면 되므로 기존 케이스는 회귀하지 않는다.

---

## [D2-08] 공실 6개월 유예의 근거 조문과 주석이 어긋난다(§97의3·§97의4엔 준용 근거 부재 + 「초과분만 차감」 오기)

- **위치**: `lib/tax-engine/transfer-reductions/rental-97-shared-helpers.ts:16`
- **조문**: 조특령 §97의3④ · §97의4② · §97⑤1호·3호·5호 (vs §97의5①1호)
- **유형**: citation · **차원**: §97의3·4·5 LTHD축 · **검증**: 생존 1/1
- **심각도 조정**: low → medium (검증 결과)

**결함**

공실 유예의 근거·임계값이 §97 시리즈 전반에서 틀렸다(인용 오류 + 세액 영향). `RENTAL_VACANCY_GRACE_DAYS = 180`(rental-97-shared-helpers.ts:16)은 조특령 §97의5①1호를 근거로 대지만, 그 6개월 규정은 §97의5 고유다(§97의5③은 §97⑤ 1호·3호만 준용 — 5호 미준용). 이 상수를 함께 쓰는 §97(rental-97-main.ts:73)·§97의2(rental-97-2.ts:59)·§97의3(rental-97-3.ts:148)·§97의4(rental-97-4.ts:100)의 임대기간 계산은 조특령 §97의3④·§97의4②·§97의2②를 통해 **조특령 §97⑤1호·3호·5호**를 준용하고, 5호의 위임 종점인 **조세특례제한법 시행규칙 §44**가 「기존 임차인의 퇴거일부터 다음 임차인의 **입주일**까지의 기간으로서 **3월 이내**의 기간」을 임대기간에 산입한다고 정한다. 즉 네 조문의 정본 유예는 6개월이 아니라 **3개월**이고 기산 종점도 「입주일」(§97의5는 「주민등록 이전일」)로 다르다. 여기에 UI가 「6개월 이상 공실 구간」만 수집하므로(RentalCommonFields.tsx:184-201, transfer-tax-api-reductions.ts:188-190) 3~6개월 공실은 엔진에 도달조차 못 해, 네 조문에서 임대기간이 과대 산정되고 감면이 과다 적용될 수 있다 — 「세액 무영향」이 아니다. 반면 주장이 든 대체 근거 후보 중 §97의3②의 6개월은 재개발·재건축·리모델링으로 임대할 수 없는 기간(인가일 전 6개월~준공일 후 6개월)이지 공실 유예가 아니므로 대체 근거가 될 수 없다. 「초과분만 차감」(:16) 대 「실제 일수만큼 차감」(:31)의 모순 주장은 약하다 — :16은 「6개월을 초과하는 공실 구간만 차감」으로도 읽혀 구현과 양립하므로 명백한 오기가 아니라 중의적 표현이다. 수정 시 rental-97-shared-helpers.test.ts:11,20 및 rental-housing-reduction.test.ts:132,145가 현행 180일 동작을 단언하고 있어 anchor 갱신이 선행되어야 한다.

**근거**

rental-97-shared-helpers.ts:16 — `/** 6개월 환산 일수 — 조특령 §97의5①1호 "6개월 이내" 공실은 계속 임대 간주 (초과분만 차감) */ export const RENTAL_VACANCY_GRACE_DAYS = 180;` / 같은 파일 :31-33 함수 주석 「공실 6개월(180일) 이상인 구간은 실제 일수만큼 차감」 / 구현 :41-46 `if (vpDays >= RENTAL_VACANCY_GRACE_DAYS) { deductDays += vpDays; }` — 구현은 **전체 차감**이므로 :16의 「초과분만 차감」이 오기다.
조문 실측: 조특령 §97의3④·§97의4②(MST 287181)은 모두 「임대기간의 계산에 관하여는 **제97조제5항제1호ㆍ제3호 및 제5호**를 준용한다」이고, 조특령 §97⑤은 1호 기산일, 3호 상속 합산, 4호 5호 미만, 5호 「재정경제부령이 정하는 기간은 이를 주택임대기간에 산입할 것」뿐으로 공실 유예 규정이 없다. 공실 6개월 간주는 §97의5①1호(「기존 임차인의 퇴거일부터 다음 임차인의 주민등록을 이전하는 날까지의 기간으로서 6개월 이내의 기간」)와 §97의3②·§97의5①3호(재개발·리모델링)에만 있다.

**실패 시나리오**

§97의3에서 5개월 공실이 2회(총 10개월) 발생한 경우 → 현재 두 구간 모두 180일 미만이라 전혀 차감되지 않아 임대기간이 10년을 채운 것으로 계산된다. §97의3의 준용 범위(조특령 §97⑤1호·3호·5호)에는 이 유예 근거가 없으므로 인용을 §97⑤5호(재정경제부령 위임) 또는 §97의3②로 바로잡거나, 근거가 없으면 유예 자체를 §97의5 전용으로 좁혀야 한다.

**세액 영향**: 세액 무영향 — 인용/주석. 다만 유예 적용 범위를 좁히면 임대기간 판정이 바뀌어 세액에 영향이 갈 수 있으므로 조문 확인 후 결정할 것(조특령 §97⑤5호가 위임한 재정경제부령상 「재정경제부령이 정하는 기간」의 내용은 본 리뷰에서 확인하지 못했다 — 확인 필요).

**처방**

:16 주석의 「(초과분만 차감)」을 구현(전체 차감)에 맞게 삭제하고, §97의3·§97의4에 적용할 공실 유예의 근거를 조특령 §97⑤5호 위임 규칙까지 추적해 확정한 뒤 근거 조문을 조문별로 나눠 적는다. 근거가 §97의5 전용으로 확인되면 `calculateEffectiveRentalPeriod`에 조문별 유예 플래그를 넘긴다.

---

## [D2-09] §97의4 근거 인용이 존재하지 않는 「소득세법 §95① 단서」를 가리킨다 (엔진 주석 + UI 안내문)

- **위치**: `lib/tax-engine/transfer-reductions/rental-97-4.ts:5`
- **조문**: 조특법 §97의4① 단서 · 소득세법 §95②
- **유형**: citation · **차원**: §97의3·4·5 LTHD축 · **검증**: 생존 1/1
- **심각도 조정**: low → medium (검증 결과)

**결함**

결함 자체는 성립한다. 다만 서술 3곳을 정정한다.

(1) **위치·사이트 수 정정**: 사용자 노출 안내문은 `Rental974InputForm.tsx:90`이 아니라 **:79**다. 그리고 사이트는 2곳이 아니라 **코드 3곳 + 문서 3곳**이다 — `lib/tax-engine/transfer-reductions/rental-97-4.ts:5`, `components/calc/transfer/rental/Rental974InputForm.tsx:9`(파일 헤더 주석, 주장이 누락), `동 파일 :79`, `docs/00-pm/transfer-rental-reduction.plan.md:114`, `docs/02-design/features/transfer-rental-reduction.engine.design.md:55`, `동 :172`. (저장소 규약상 「세팅 지점 전수 grep」 — 첫 히트에서 멈추면 「고쳤는데 그대로」가 된다.)

(2) **실패 시나리오 정정 — 「조문 링크가 §95①로 열린다」는 이 위치에서 성립하지 않는다**: 해당 문자열은 `ToneCard` 안의 순수 JSX 텍스트이고, `components/calc/transfer/rental/` 6개 파일 어디에도 `LawArticleModal`·링크화 컴포넌트 import이 없다(grep 0건). `parseCitations`는 `lib/legal-verification/coverage.ts`·`coverage-collect.ts`(verify:legal 커버리지 집계)에서만 쓰이고 이 폼을 렌더링하지 않는다. 실제 해악은 링크 오작동이 아니라 **사용자에게 배제 요건 자체를 틀리게 고지하는 것**이다 — 「미등기 양도 등」이라 읽은 1세대1주택 표2 적용자가 자신을 배제 대상이 아니라고 오인한다.

(3) **인과 주장 완화**: 「이 오독이 D2-01(표2 가산 미배제)의 직접 원인이다」는 실측으로 뒷받침되지 않는다. 엔진은 미등기 배제도 표2 배제도 **둘 다** 구현하지 않으므로(`transfer-tax-lthd.ts:436-456`의 가산 분기는 `rate > 0`만 검사) 주석이 구현 누락을 유발했다는 인과는 확인 불가다. 「인용 오류와 구현 누락이 병존한다」로 서술하는 것이 정확하다.

(4) **정정 문구 제안**: 「§95② 단서(대통령령으로 정하는 1세대 1주택 — 표2 적용) 해당 시 추가율 가산 배제 (조특법 §97의4① 단서 「같은 항 단서」)」. 미등기양도자산은 §95② **본문 괄호**로 애초에 장특공제 대상에서 빠지므로 별개 층위임을 함께 밝힐 것.

**근거**

rental-97-4.ts:5 — `*       단, §95① 단서(미등기 양도 등) 해당 시 적용 배제 (§97의4① 단서).`
components/calc/transfer/rental/Rental974InputForm.tsx:90 — `미등기 양도 등 소득세법 §95① 단서 해당 시 적용 배제됩니다.` (사용자에게 노출되는 안내 카드)
조문 실측(KoreanLaw MST 280405): §95① 전문은 「양도소득금액은 양도차익에서 장기보유 특별공제액을 공제한 금액으로 한다.」 한 문장으로 단서가 없다. 미등기양도자산 배제는 §95② **본문 괄호**(「제104조제3항에 따른 미등기양도자산과 같은 조 제7항 각 호에 따른 자산은 제외한다」)이고, §95② 단서는 1세대1주택 표2 규정이다.

**실패 시나리오**

결과 화면·코드 주석이 「§95① 단서」를 인용 → 조문 링크가 단서 없는 §95①로 열리고, 더 나쁘게는 D2-01의 실제 배제 사유(표2 대상)를 「미등기」로 오독하게 만들어 결함을 은폐한다.

**세액 영향**: 세액 무영향 — 표시/인용. 다만 이 오독이 D2-01(표2 가산 미배제)의 직접 원인이다.

**처방**

두 곳의 문구를 「소득세법 §95② 단서(1세대1주택 표2 적용 대상)에 해당하면 §97의4 추가공제율을 적용하지 않는다」로 정정하고, 미등기 배제는 §95② 본문 괄호(§104③)로 따로 적는다. 조문 리터럴은 `lib/tax-engine/legal-codes/`에 상수로 두고 `lib/legal-verification/manifest/additions-transfer.ts`의 검증 키워드도 함께 맞춘다.

---

## [D3-02] §99의3 재개발·재건축 신축주택 안분 변형(조특령 §99의3②) 미구현

- **위치**: `lib/tax-engine/transfer-reductions/new-99-3.ts:409`
- **조문**: 조특령 §99의3②1호 단서·2호 괄호
- **유형**: legal-accuracy · **차원**: §99·§99의2·§99의3 신축 · **검증**: 생존 3/3
- **심각도 조정**: high → medium (검증 결과)

**결함**

조특령 §99의3②은 종전주택을 재개발·재건축하여 취득한 신축주택(법 §98의3② 각 호 = 정비사업조합 조합원의 관리처분계획 취득분·멸실 후 재건축분)에 대해 ①1호 단서로 「5년 이내 양도도 (양도 당시 기준시가 − 신축주택 취득 당시 기준시가) ÷ (양도 당시 기준시가 − 종전주택 취득 당시 기준시가)」 안분을, ②2호 괄호로 「분모의 차감항을 종전주택 취득 당시 기준시가로」 치환할 것을 정한다. 그러나 `New993Input`(new-99-3.ts:38-88)에 종전주택 기준시가·재개발 여부 필드가 없어 `:411`은 5년 이내면 무조건 전액 차감하고 `:432`는 분모를 항상 `standardPriceAtTransfer − standardPriceAtAcquisition`으로 고정한다. 형제 조문 `new-99.ts:221-231·264-265`는 동일 변형을 ⑤UI(New99InputForm.tsx:161-181)·④(transfer-tax-api-reductions.ts:281-282)·⑧(transfer-tax-validate-reductions.ts:219-221)·⑫(transfer-reductions-stub.types.ts:92-93)까지 전 계층 배선해 두었으므로, §99의3만 배선이 통째로 빠진 비대칭이다. 실측(양도가액 550,000,000 · 양도소득금액 300,000,000 · std 취득 200,000,000 / 5년 300,000,000 / 양도 500,000,000 · 종전주택 취득시 100,000,000): 현재 감면대상 양도소득금액 100,000,000(ratio 0.3333), 조문상 75,000,000(ratio 0.25) → **25,000,000원 과다차감(세액 과소)**. 단, ① 원 주장의 「양도소득금액 1,000,000,000 → 83,333,333 과다차감·세액 37,500,000」 시나리오는 `isHighValueHouseUnder993`(:178-192)가 기준일 2003-06-30 구간에서 물건 전체 양도가액 6억 초과를 전건 배제하므로 **엔진에 도달할 수 없는 입력**이며, ② 「5년 이내」 변형은 신축주택취득기간 2001-05-23~2003-06-30 게이트상 2008년까지의 양도에서만 발현해 현재 연도 계산에서는 사실상 도달하지 않는다. 부수 결함: `new-99-3.ts:305-307` 주석이 이 변형을 「§99 고유」로 서술해 조문과 드리프트했고, `lib/legal-verification/manifest/additions-transfer.ts:373`은 조특법 §99의3만 등록하고 시행령 §99의3②은 미등록이다.

**근거**

KoreanLaw MCP 조특령(MST 287181) 제99조의3② 본문: 「1. 취득일부터 5년 이내에 양도하는 경우 … 다만, 재개발ㆍ재건축되기 이전의 주택(이하 이 조에서 "종전주택"이라 한다)을 재개발ㆍ재건축하여 취득한 법 제98조의3제2항 각 호에 따른 신축주택인 경우 감면대상 양도소득금액은 다음 계산식에 따라 … 양도 당시 기준시가 − 신축주택 취득 당시 기준시가 ÷ 양도 당시 기준시가 − 종전주택 취득 당시 기준시가」, 「2. … 신축주택 취득 당시 기준시가(종전주택을 재개발ㆍ재건축하여 취득한 … 신축주택의 경우 종전주택 취득 당시 기준시가)」. 코드: `new-99-3.ts:409-418`은 5년 이내면 무조건 `reducibleTransferIncome = Math.max(0, input.transferIncome)`(전액), `:432`는 분모를 항상 `input.standardPriceAtTransfer - input.standardPriceAtAcquisition`으로 고정한다. 반증 시도 — `grep -rn "previousHouseStdPrice|isRedevelopedNewHouse" lib components app __tests__` 결과 전부 `…99` 접미사(§99 전용)이고 `new-99-3.ts`·`New993InputForm.tsx`·`transfer-reductions-stub.types.ts:96-122`(new_99_3 union 멤버)에는 해당 필드가 0건. 형제 조문 `new-99.ts:222-230·264-265`는 `isRedevelopedNewHouse`/`previousHouseStdPriceAtAcquisition`로 동일 변형을 이미 구현했고 UI(`New99InputForm.tsx:160-180` ③ 섹션)까지 있다.

**실패 시나리오**

입력: §99의3 · 종전주택을 재건축하여 취득한 신축주택 · 취득일 2003-06-30 · 양도일 2024-06-30 · 양도소득금액 1,000,000,000 · 종전주택 취득시 기준시가 100,000,000 · 신축주택 취득시 200,000,000 · 5년시점 300,000,000 · 양도시 500,000,000 → 현재 출력: 감면대상 양도소득금액 333,333,333 (ratio 0.3333, tsx probe 실측). 올바른 출력: 분모 = 500,000,000−100,000,000 = 400,000,000, ratio = 100,000,000/400,000,000 = 0.25 → 250,000,000.

**세액 영향**: 위 시나리오에서 소득금액 83,333,333원 과다차감(45% 구간이면 세액 약 37,500,000원 과소). 5년 이내 양도 케이스는 조문상 안분해야 할 것을 전액 차감하므로 과다 폭이 더 크다.

**처방**

`New993Input`에 `isRedevelopedNewHouse`·`previousHouseStdPriceAtAcquisition`을 추가하고 `new-99.ts:244-277`과 동일하게 `calcSignedAllocation(income, numerator, denominator)`을 재사용한다(5년 이내 variant는 분자 = 양도시−신축취득시). 14지점(⑤ New993InputForm ③ 섹션 · ⑧ 종전주택 기준시가 필수 · ⑫ transfer-tax-schema-reductions · stub types)을 함께 배선.

---

## [D3-03] legacy 신축주택 엔진이 §99·§99의3(소득차감형)을 「산출세액 × 일수비율」 세액감면으로 계산

- **위치**: `lib/tax-engine/new-housing-reduction.ts:398`
- **조문**: 조특법 §99① · 조특령 §99①2호 (동 §99의3① · 령 §99의3②2호)
- **유형**: legal-accuracy · **차원**: §99·§99의2·§99의3 신축 · **검증**: 생존 3/3
- **심각도 조정**: high → medium (검증 결과)

**결함**

결함 성립. 다만 다음 5가지를 정정한다.

1) **범위가 과소 기재됐다.** §99·§99의3만이 아니라, 시드 `transfer-rate-seed.ts:259-480`의 `new_housing_matrix` **article 12건 전부**(`99-main`, `99-3-main`, `98-3-low/mid/high`, `98-5`, `98-7`, `99-2-metro/non-metro`, `98-8-metro/non-metro`, `99-3-2`, `99-3-10`)가 `reductionScope: "capital_gain"` + `fiveYearWindowRule: true`로 선언돼 동일 분기를 탄다. `tax_amount` 조문은 시드에 0건이므로 `:390`의 `tax_amount` 분기가 오히려 dead다.

2) **5년 이내 양도는 수치가 어긋나지 않는다.** `ratio = 1`이 되어 `reductionAmount = calculatedTax`(100% 조문 기준)가 되고, 단건 계산에서는 양도소득금액 전액 차감(과세표준 0)과 결과가 일치한다. 실제 세액 괴리는 **5년 초과 분기 한정**이다(다자산 합산·농특세 기초·기본공제 귀속에서는 5년 이내도 어긋날 수 있음). 따라서 주장 (b)("소득차감이 아니라 세액감면")은 법적 성격 규정으로는 옳지만, 그것만으로 세액이 움직이는 것은 아니다 — 세액을 움직이는 것은 (a)의 **일수비율 안분**이다.

3) **실패 시나리오의 `totalCapitalGain: 500,000,000`은 감면액 계산에 쓰이지 않는다.** `:395-399`는 `input.calculatedTax`와 일수 `ratio`만 쓴다(`totalCapitalGain`은 `reducibleGain` echo 전용이며, `transfer-tax-reductions-calc.ts:185`가 덮어쓰는 것은 `calculatedTax` 하나뿐이다). 제시된 "올바른 출력" 비율 0.25도 가정값이지 조특령 §99①2호로 산출한 실제 기준시가 비율이 아니다 — 정확한 과대/과소 금액은 기준시가 3개 값이 있어야 확정된다.

4) **위치 line은 :393-400**이다(`if (matchedArticle.fiveYearWindowRule)`가 :395, `fiveYearTaxAmount` 대입이 :398). :398 단독 지목은 블록 전체를 가리키지 못한다.

5) **정본 구현이 이미 존재한다는 점을 명시해야 한다.** `transfer-reductions/new-99.ts`·`new-99-3.ts`가 `income-deduction-router.ts` 경로(`reductions:[{type:"new_99"|"new_99_3"}]`)에서 조특령 §99①·§99의3② 기준시가 안분 + 양도소득금액 차감 + 농특세 2-pass + 고가주택 단서(`isHighValueHouseUnder993`)까지 구현하고 있다. 즉 이 결함은 "미구현"이 아니라 **legacy 중복 경로가 정본과 갈라져 남아 있는 것**이며, 처방은 재구현이 아니라 legacy 경로 제거(또는 정본으로의 위임)다. 덧붙여 legacy 엔진은 §99①·§99의3① **단서(소법 §89①3호 고가주택 배제)를 전혀 검사하지 않는다** — 같은 파일의 별건 결함.

**근거**

`new-housing-reduction.ts:395-402` 원문: `if (matchedArticle.fiveYearWindowRule) { // 5년분 양도차익에 대한 세액을 산출세액으로부터 안분 계산 / // 간략화: 산출세액을 양도차익 비율로 안분 / const fiveYearTaxAmount = Math.floor(input.calculatedTax * ratio); reductionAmount = Math.floor(fiveYearTaxAmount * reductionRate); }`. `ratio`의 출처는 `calculateReducibleGain`(:122-142) 원문 `const totalDays = differenceInDays(disposalDate, acquisitionDate); … const reductionDays = Math.min(differenceInDays(reductionEndDate, acquisitionDate), totalDays); … const ratio = reductionDays / totalDays;` — 기준시가는 입력조차 받지 않는다(`NewHousingReductionInput`:35-54에 standardPrice 계열 필드 0건). 이 값이 `transfer-tax-reductions-calc.ts:184-196` `candidates.push({ amount: newHousingResult.reductionAmount, type: "new_housing", reducibleIncome: transferIncome })`로 세액감면 후보가 되고, `transfer-tax-finalize.ts:379-385`에서 산출세액에서 직접 차감된다. 조문(KoreanLaw MST 280409 §99①)은 「그 신축주택을 취득한 날부터 5년간 발생한 양도소득금액을 양도소득세 **과세대상소득금액에서 뺀다**」이고, 그 계산은 조특령 §99①2호의 **기준시가 분수**다. 도달성 실측: `lib/api/transfer-tax-schema.ts:202 newHousingDetails: newHousingDetailsSchema.optional()` + `app/api/calc/transfer/engine-input.ts:230-236`으로 API 도달 가능. 다만 `grep -rn "newHousingDetails" components lib/calc` = 0건 — 마법사 UI가 이 필드를 만들지 않으므로 **직접 API 호출 경로 한정**이다(이 점은 확인했고 심각도에 반영).

**실패 시나리오**

POST /api/calc/transfer 에 `newHousingDetails{ acquisitionDate: 1999-01-15, transferDate: 2020-01-15, region: "nationwide", isFirstSale: true, totalCapitalGain: 500,000,000 }` + 산출세액 173,060,000 → 현재 출력(tsx probe 실측): `matchedArticleCode "99-main", fiveYearRatio 0.2380704(=1826/7670일), reductionAmount 41,200,464` 원의 **세액감면** → 결정세액 131,859,536. 올바른 출력: 조특령 §99①2호에 따라 (5년시점 기준시가−취득시)/(양도시−취득시) 비율로 **양도소득금액**을 차감한 뒤 세율을 적용해야 한다(예: 비율 0.25이면 감면대상 소득금액 125,000,000 → 과세표준 372,500,000 → 산출세액 123,060,000).

**세액 영향**: 위 예시에서 결정세액 131,859,536 vs 123,060,000 → 8,799,536원 과대. 일수비율과 기준시가비율의 괴리 폭에 따라 양방향으로 벌어지며, 같은 요청에 `reductions:[{type:"new_99"}]`를 함께 넣으면 §99가 소득차감(STEP 4.6)과 세액감면(STEP 8)에 **이중 적용**된다(두 트랙 사이에 §127⑦ 교차 차단이 없음 — `grep -rn "newHousingDetails" lib/calc` 0건).

**처방**

`newHousingDetails`의 §99·§99의3 계열(코드 99-main·99-3-main)을 legacy 세액감면 후보에서 제외하고 `resolveIncomeDeduction`(new_99·new_99_3) 단일 경로로 수렴시킨다. 잔여 미분양 조문만 legacy에 남기거나, 최소한 `reductions[]`에 new_99/new_99_3가 있으면 `newHousingDetails` 후보를 push하지 않도록 §127⑦ 교차 배제를 건다.

---

## [D3-04] 세율 시드 `99-main` 취득기간이 2001-12-31까지 열려 §99 신축주택취득기간을 2년 6개월 초과

- **위치**: `lib/tax-engine/data/transfer-rate-seed.ts:274`
- **조문**: 조특법 §99①1호 (신축주택취득기간 1998.5.22~1999.6.30, 국민주택 1999.12.31)
- **유형**: legal-accuracy · **차원**: §99·§99의2·§99의3 신축 · **검증**: 생존 3/3
- **심각도 조정**: high → medium (검증 결과)

**결함**

「`transfer-rate-seed.ts:274`의 `99-main` 취득기간 `end: "2001-12-31"`이 조특법 §99① 신축주택취득기간(1998.5.22~1999.6.30, 국민주택 1998.5.22~1999.12.31)을 초과한다」는 사실이다. 다만 다음 네 가지를 정정해야 한다.

1) **심각도는 high가 아니라 medium이다.** `newHousingDetails`를 만드는 클라이언트 코드가 0건(`lib/calc`·`components`·`app/calc` 전수 grep)이라 마법사 UI 경로로는 이 과다감면이 발생하지 않는다. Zod(⑫)·Route(⑭)만 열려 있고 ④가 없는 「입력 경로 부재」 상태로, `/api/calc/transfer` 직접 POST로만 도달한다. 잠재(latent) 데이터 결함으로 보는 것이 정확하다.

2) **「올바른 수정 = end를 1999-06-30으로 단축」은 틀렸다 — 그대로 하면 납세자에게 불리한 적용이 된다.** §99①은 1호가 **사용승인·사용검사일**, 2호가 **최초 매매계약 체결·계약금 납부일**을 기준일로 삼는다(취득일이 아니다). 2호는 신축주택취득기간 내에 계약·계약금만 납부하면 실제 취득이 몇 년 뒤여도 적용되므로, 취득일 축을 1999.6.30으로 자르면 「1999.6 이전 계약 + 2000~2001년 준공·취득」 정상 대상자가 근거 없이 배제된다. 올바른 처방은 **축 자체를 기준일로 바꾸는 것**이고, 저장소에는 이미 그 구현이 있다 — `lib/tax-engine/transfer-reductions/new-99.ts:36-38`(`NEW_99_PERIOD_END` 1999-06-30 / `NEW_99_PERIOD_END_NATIONAL` 1999-12-31) + `period-check.ts:89-97` + UI `New99InputForm.tsx:75`. 즉 이 시드 행은 사문화된 구경로이며, **정정이 아니라 제거(또는 현행 §99 경로로의 통합)** 가 후보다.

3) **「1999.7.1~2001.12.31 전체가 근거 없다」는 국민주택 구분을 놓쳤다.** 국민주택(전용 85㎡ 이하)은 신축주택취득기간이 1999.12.31까지다. 시드는 `maxArea: null`이라 이 2단 기한을 아예 구분하지 못한다 — 즉 이 행은 비국민주택에 대해 과대(1999.7.1~)이면서, 동시에 국민주택 2단 기한을 표현할 수단이 없다는 점에서 조문 구조 자체를 담지 못한다.

4) **부수 효과 1건이 누락됐다(제보에 유리한 방향).** `99-main`의 기간이 2001-12-31까지 열려 있어 `99-3-main`(§99의3, 2001.5.23~2003.6.30, `outside_overconcentration` + `requiresFirstSale: true`)과 **2001.5.23~2001.12.31 구간이 중복**된다. `new-housing-reduction.ts:277 candidates.filter` → `:299 candidates.find`가 배열 순서상 앞선 `99-main`(nationwide·requiresFirstSale false)을 먼저 채택하므로, 그 구간에서는 §99의3의 지역 요건과 최초분양 요건이 **조용히 무력화**된다. probe 실측: 취득 2001-12-31 → `matchedArticleCode "99-main"`, 47,959,866원 감면(§99의3 요건 미검증).

**근거**

`transfer-rate-seed.ts:268` 주석 원문 `// §99 — 1998.5.22~1999.6.30 IMF 1차 신축주택 (국민주택 ~1999.12.31)`, `:272-274` 데이터 원문 `code: "99-main", article: "§99 (IMF 1차)", acquisitionPeriod: { start: "1998-05-22", end: "2001-12-31" },`. 조문(KoreanLaw MST 280409 §99①1호): 「1998년 5월 22일부터 1999년 6월 30일까지의 기간(국민주택의 경우에는 1998년 5월 22일부터 1999년 12월 31일까지로 한다. 이하 이 조에서 "신축주택취득기간"이라 한다)」. 매칭은 `new-housing-reduction.ts:164-173 isInAcquisitionPeriod(acquisitionDate, start, end)` — 조문 기준일(1호 사용승인일·2호 매매계약일)이 아니라 **취득일**을 본다는 이차 결함도 동일 지점에 있다. 이 시드는 `transfer-rate-seed.ts:1-9` 헤더대로 「scripts/seed-transfer-tax-rates.ts 시딩 + lib/db/tax-rates.ts loadFallbackTransferRates() 로컬 fallback」 양쪽의 단일 소스다.

**실패 시나리오**

취득일 2000-08-01, 양도일 2020-01-15, region nationwide, 산출세액 173,060,000으로 legacy 경로 호출 → 현재 출력(tsx probe 실측): `isEligible true, matchedArticleCode "99-main", reductionAmount 44,470,526`. 올바른 출력: 2000-08-01은 §99 신축주택취득기간(~1999.6.30 / 국민주택 ~1999.12.31) 밖이므로 `isEligible false`, 감면 0원.

**세액 영향**: 위 예시 44,470,526원 과다감면(감면율 100% × 5년 안분비율). 1999.7.1~2001.12.31 취득분 전체가 근거 없이 감면 대상이 된다.

**처방**

`99-main`의 `acquisitionPeriod.end`를 1999-06-30으로 되돌리고 국민주택 연장(1999-12-31)은 별도 article 또는 플래그로 분리한다. 아울러 매칭 기준일을 조문대로 1호=사용승인일·2호=매매계약일로 바꾸거나, 이 조문을 D3-03의 처방대로 `new_99` 라우터로 일원화한다.

---

## [D3-06] §99의3①1호 단서 「대통령령으로 정하는 사유」(조특령 §99의3④ 재계약·대체취득) 배제 미구현

- **위치**: `lib/tax-engine/transfer-reductions/new-99-3.ts:268`
- **조문**: 조특법 §99의3①1호 단서 · 조특령 §99의3④
- **유형**: legal-accuracy · **차원**: §99·§99의2·§99의3 신축 · **검증**: 생존 1/1

**결함**

주장은 실질적으로 정확하다. 다만 세 가지를 정정·보완한다.

(a) **범위는 엔진 한 곳이 아니라 5계층 전부**다. 「new-99-3.ts:268에 판정이 없다」로 좁히면 수정 범위를 오도한다. 재계약 배제는 사용자 선언형 boolean이므로(§99의 확립된 패턴) 스토어 `calc-wizard-asset-reduction.ts:99-134`(①) → `transfer-tax-api-reductions.ts:111-141`(④) → UI `New993InputForm.tsx`(⑤) → Zod `transfer-tax-schema-reductions.ts:171-199`(⑫) → 스텁 타입 `transfer-reductions-stub.types.ts:96-121` → 엔진 `new-99-3.ts` `New993Input`+`checkIneligibility`까지 동기화가 필요하다. 엔진만 고치면 입력 경로가 없어 no-op이다.

(b) **조특령 §99의3④에는 카브백 단서가 하나 더 있다** — 「다만, **재정경제부령이 정하는 사유에 해당하는 주택을 제외한다**」. 즉 재계약·대체취득에 해당해도 시행규칙 사유면 배제되지 않는다. §99② 경로(`isRecontractExcluded99`)가 이미 카브백 없는 단순 boolean으로 구현돼 있어 같은 패턴을 따르는 것이 저장소 일관성에는 맞지만, 라벨·안내문에는 이 단서를 반영해야 납세자 불리 적용을 피한다. 현행 조특칙(MST 284611)에서 §43·§44·§45·§45의2를 조회한 범위에서는 영 §99의3을 받는 조문을 찾지 못했다 — 전수 조회는 하지 않았으므로 **「해당 시행규칙 조문의 현존 여부는 확인 필요」**로 남긴다(2001~2003년 당시 시행규칙 본은 MCP 과거 시행본 제약으로 미확인).

(c) **세액 영향 수치의 세율 전제는 시나리오와 어긋난다.** 93,110,000원은 현행(2026) 기본세율 표(38%·누진공제 19,940,000) 기준인데, 엔진은 양도연도 세율을 쓴다(memory `feedback_transfer_year_tax_rate`). 2002-05 취득 후 「5년 이내 양도」면 양도연도가 2007년 이전이라 그 해 세율표가 적용되어 금액이 달라진다. 다만 「감면대상 양도소득금액 전액(300,000,000)이 부당하게 차감된다」는 결론 자체는 세율표와 무관하게 성립하고, 오늘 시점 양도(5년 후 안분)에서도 배제 누락은 그대로 세액을 움직인다.

심각도는 medium 유지가 타당하다 — 발현 시 감면 전액이 부당 존치되어 세액 영향이 크지만, 요건(2001-05-23 전 계약 해제 + 본인·배우자 등 재분양)이 매우 좁고 사용자 선언형 입력으로 해소되는 성질이다.

**근거**

조문(KoreanLaw MST 280409 §99의3①1호 단서): 「다만, 매매계약일 현재 입주한 사실이 있거나 신축주택취득기간 중 대통령령으로 정하는 사유에 해당하는 사실이 있는 주택은 제외한다.」 위임 끝(조특령 MST 287181 §99의3④): 「2001년 5월 23일전에 주택건설사업자와 주택분양계약을 체결한 분양계약자가 당해 계약을 해제하고 분양계약자 또는 그 배우자(… 직계존비속 및 형제자매를 포함한다)가 당초 분양계약을 체결하였던 주택을 다시 분양받아 취득한 주택 또는 … 대체하여 다른 주택을 분양받아 취득한 주택을 말한다.」 코드 `new-99-3.ts:218-291 checkIneligibility`의 배제 사유는 NOT_RESIDENT·HOUSING_CONSTRUCTION_BUSINESS·SPECULATION_AREA·OUT_OF_ACQUISITION_PERIOD·OCCUPANCY_AT_CONTRACT·HIGH_VALUE_HOUSE 6종뿐이고 재계약 항목이 없다. 반증 시도: `grep -rn "isRecontract|Recontract|재계약|대체취득" lib components` 결과 §99는 `new-99.ts:191-198`(`isRecontractExcluded` → code "RECONTRACT_EXCLUDED", legalBasis "조특령 §99②")·UI `New99InputForm.tsx:185-193` 토글이 있고, §98의7/§98의3/§98의5/§98의6/§99의2는 `isNotRecontract***` 필드가 있는데 **§99의3만 없다**(`transfer-reductions-stub.types.ts:96-122` new_99_3 union 멤버에 해당 키 0건).

**실패 시나리오**

입력: 2001-03 분양계약을 해제하고 배우자 명의로 2002-05 같은 주택을 다시 분양받아 취득한 §99의3 신축주택, 5년 이내 양도, 양도소득금액 300,000,000 → 현재 출력: `isEligible true`, 감면대상 양도소득금액 300,000,000(전액 차감). 올바른 출력: 조특령 §99의3④ 해당 주택이므로 §99의3①1호 단서로 적용 배제, 감면 0원.

**세액 영향**: 위 시나리오에서 과세표준 297,500,000 상당이 통째로 사라진다 — 기본세율 38%·누진공제 19,940,000 기준 산출세액 93,110,000원 과소(지방소득세 9,311,000원 추가).

**처방**

`New993Input`에 `isRecontractExcluded993`(또는 §98 계열과 같은 `isNotRecontract993`)를 추가해 `checkIneligibility`에 `RECONTRACT_EXCLUDED`(legalBasis "조특령 §99의3④")를 넣고, ⑤ New993InputForm ④ 배제 토글 · ⑫ Zod · stub types · ④ API 변환을 §99와 동일 패턴으로 배선한다.

---

## [D3-09] `isHighValueHouseUnder993` 주석은 「가장 빠른 시점」이라 하나 구현은 우선순위 fallback

- **위치**: `lib/tax-engine/transfer-reductions/new-99-3.ts:170`
- **조문**: 조특법 §99의3① 단서 · §99① 단서 (소득세법 §89①3호 고가주택)
- **유형**: display · **차원**: §99·§99의2·§99의3 신축 · **검증**: 생존 1/1
- **심각도 조정**: low → medium (검증 결과)

**결함**

`isHighValueHouseUnder993`(lib/tax-engine/transfer-reductions/new-99-3.ts:170)의 docblock은 「분양계약일·사용승인일·취득일 중 **가장 빠른 시점**」이라 적었으나, 두 호출부(new-99-3.ts:280 · new-99.ts:201)는 `contractDate ?? usageApprovalDate ?? acquisitionDate` **우선순위 fallback**이다(최솟값 연산 0건). 드리프트가 있는 주석은 new-99-3.ts 한 곳뿐이며, new-99.ts:200 주석은 「계약·승인·취득 중 **우선일** 기준」으로 구현과 일치한다.

주장의 완화 전제 「현행 UI는 취득유형별로 한 날짜만 렌더」는 **틀렸다**. `contractDate993`에는 입력 위젯이 없고(components/ 내 유일 히트는 defaults의 `""`), 계약일은 `income-deduction-router.ts:194`의 `?? ctx.assetContractDate`로 자산-수준 필드에서 공급되는데 그 위젯(UnifiedReductionPanel.tsx:585 「매매계약일 (분양/매매)」)은 `acquisitionType993`과 무관하게 항상 렌더된다. 따라서 `self_built`(사용승인일 필수, validate:126) + `assetContractDate` 입력 조합에서 두 날짜가 동시 존재하며 hvBaseDate가 사용승인일을 무시한다 — Zod(schema-reductions.ts:178-180)에도 route mapper(route-reductions-mapper.ts:163-168)에도 상호배타 정규화가 없다.

또한 이는 단순 주석 문제가 아니라 **같은 함수 안의 축 비대칭**이다: 기간 게이트(new-99-3.ts:253-256)는 §99의3①1호/2호에 맞춰 취득유형으로 분기하는데, 고가주택 기준일(:280)만 분기하지 않는다. 2호 사례에서 기간 게이트는 사용승인일(2001.5.23~2003.6.30)로 통과시키면서 고가주택 판정은 기간 제약이 없는 assetContractDate를 쓰므로 임계 구간(6억/9억/12억·면적요건)이 갈려 차감 양도소득금액이 달라질 수 있다 → 세액 영향 가능(medium). 정정 방향은 ①주석을 구현(우선일)에 맞추거나 ②hvBaseDate를 periodTarget과 같이 `acquisitionType` 분기로 통일하는 것이며, 「최솟값」은 §99의3 본문(mst 280409)에 근거가 없다.

**근거**

`new-99-3.ts:169-177` 주석 원문: `/** * 분양계약일·사용승인일·취득일 중 가장 빠른 시점을 기준으로 고가주택 여부 판정. …`. 실제 호출부: `new-99-3.ts:279-280` `const hvBaseDate = input.contractDate ?? input.usageApprovalDate ?? input.acquisitionDate;` · `new-99.ts:201` `const hvBaseDate = input.contractDate ?? input.usageApprovalDate ?? input.acquisitionDate;` — 둘 다 `Math.min` 없이 첫 non-undefined를 취한다. 판정 결과는 사용자에게 그대로 문구로 노출된다(`new-99-3.ts:284` `적용기준일 ${hvBaseDate.toISOString().split("T")[0]} 기준`).

**실패 시나리오**

입력: `contractDate 2003-02-01` + `usageApprovalDate 2002-11-10`이 함께 들어온 경우 → 현재 출력: 기준일 2003-02-01 → 3단계(양도가 6억 초과, 면적 무관) 적용. 주석대로면: 기준일 2002-11-10 → 2단계(149㎡ 이상 AND 6억 초과) 적용 — 전용 100㎡·양도가 7억이면 두 독법이 적용/배제로 갈린다.

**세액 영향**: 세액 무영향 — 표시/문서. 다만 두 날짜가 동시에 채워지는 입력이 생기면 판정이 갈릴 수 있어 잠재적 세액 영향(현행 UI는 취득유형별로 한 날짜만 렌더).

**처방**

주석을 실제 동작(계약일 우선 → 사용승인일 → 취득일)으로 정정하거나, 의도가 최소일자라면 `new Date(Math.min(...[contractDate, usageApprovalDate, acquisitionDate].filter(Boolean).map(d => d.getTime())))`로 구현을 맞춘다. 두 호출부가 같은 식을 복제하고 있으므로 공용 헬퍼로 추출.

---

## [D4-01] §99의4·§98의9 동시 적격 시 주택수 제외가 1채로 잘림 — 근거 없는 불리 적용

- **위치**: `lib/tax-engine/transfer-reductions/unsold-98-9.ts:222`
- **조문**: 조특법 §99의4① · §98의9① (§127⑦ 비적용)
- **유형**: legal-accuracy · **차원**: §99의4·주택수제외 · **검증**: 생존 3/3
- **심각도 조정**: high → medium (검증 결과)

**결함**

결함 자체는 성립하나 **실패 시나리오를 정정해야 한다.** 제보가 인용한 anchor B-4 픽스처(농어촌 취득 2015-03-01 · 미분양 취득 2024-02-01)는 법령상 성립하지 않는다 — §99의4①의 「소유주택이 아닌 것으로 본다」 의제는 문언상 「소득세법 §89①3호를 적용한다」에 한정되어 조특법 §98의9①의 「1주택을 보유한 1세대」 요건 판정에는 미치지 않으므로, 미분양주택 취득 시점(2024-02)에 세대는 일반주택+농어촌주택 2채를 보유한 것이 되어 §98의9가 애초에 적용될 수 없다(픽스처의 `wasOneHouseholdAtAcquisition: true`는 같은 픽스처의 농어촌 취득일과 모순).

정정된 재현 조건은 **취득 순서를 「일반주택 → 준공후미분양주택 → 농어촌주택」으로 두는 것**이다: 일반주택 취득 2014-01-01 · 미분양 취득 2024-02-01(그 시점 보유 1주택 ✓) · 농어촌 취득 2024-04-01(§99의4 취득기간 2003-08-01~2028-12-31 내, 3년 미보유는 §99의4④가 면제) · 일반주택 양도 2024-06-01 · 양도가 10억 · 취득가 5억 · 거주 120개월 · householdHousingCount=3.

이 조건으로 `calculateTransferTax`를 직접 실행한 실측값(추정 아님): `new994Detail.isEligible=true` · `unsold989Detail.isEligible=true` · `dualExclusionWarning=true` · `isExempt=false` · `taxableGain=500,000,000` · **결정세액 133,060,000 · 지방소득세 13,306,000 · totalTax 146,366,000**. 법령상 두 조문이 각각 1채씩 소유주택에서 제외되면 유효 주택수 1 → 1세대1주택 · 양도가 10억 ≤ 12억 → 전액 비과세 0원. ⇒ 제보의 세액 영향 수치는 결과적으로 정확하며(픽스처만 틀렸다), 「미측정」 단서는 해소됐다.

**근거**

unsold-98-9.ts:222-225 `if (new994Detail?.isEligible && unsold989Detail?.isEligible) { unsold989Detail = { ...unsold989Detail, dualExclusionWarning: true }; return { applied: new994Detail, new994Detail, unsold989Detail }; }` — 반환은 `applied` 단수다. 소비층 transfer-tax-house-exclusion-step.ts:41-42 `const totalExcluded = (hceApplied ? 1 : 0) + specialHouseExclusionDetail.excludedCount + inheritedExclusion.excludedCount;` 로 hce 트랙은 최대 1이다. 조문 본문(KoreanLaw MST 280409 실독): §99의4① 「…그 농어촌주택등을 해당 1세대의 소유주택이 아닌 것으로 보아 「소득세법」 제89조제1항제3호를 적용한다」 / §98의9① 「…그 준공후미분양주택을 해당 1세대의 소유주택이 아닌 것으로 보아 같은 법 제89조제1항제3호를 적용한다」. §127⑦은 「거주자가 **토지등을 양도하여** 둘 이상의 양도소득세의 **감면규정**을 동시에 적용받는 경우」로 한정되는데 두 조문은 감면세액이 0인 과세특례이고 대상도 양도자산이 아니라 보유 중인 다른 주택이라 §127⑦에 걸리지 않는다(§127 전문 실독 — ⑦⑧⑨ 어디에도 §98의9·§99의4 열거 없음). UI에서도 두 조문은 서로 다른 카테고리(metadata.ts:163 `category: "new_housing"` / :267 `category: "unsold_housing"`)라 UnifiedReductionPanel-defaults.ts `toggleGroupRadio`의 카테고리 라디오에 걸리지 않아 동시 선택이 가능하다. 현행 동작은 기존 anchor가 고정하고 있다 — __tests__/tax-engine/transfer-tax/unsold-98-9-integration.test.ts:73 B-4 `householdHousingCount: 3 … expect(r.isExempt).toBe(false)` (실행 확인: 4 passed). 계획서 docs/00-pm/transfer-98-9-unsold.plan.md:71·93은 이 제한을 「법리 미확정」의 보수적 조치로 적었고 근거로 「§98의9 취득 당시 1주택 보유 요건 위배 가능성」을 들었으나, 취득 순서를 「일반주택 → 준공후미분양 → 농어촌주택」으로 두면 그 요건이 충족되므로 근거가 성립하지 않는 조합이 존재한다.

**실패 시나리오**

입력: 일반주택 취득 2014-01-01·양도 2024-06-01·양도가 10억·취득가 5억·거주 120개월·1세대·householdHousingCount=3, reductions=[new_99_4_rural(취득 2015-03-01·기준시가 2억·소재지 확인·연접 아님), unsold_98_9(취득 2024-02-01·취득가 5억·전용 84㎡·수도권밖·취득당시 1주택·양도자요건 확인)] (= 기존 anchor B-4 픽스처). 현재 출력: 제외 1채만 반영 → 유효 주택수 2 → `isExempt=false` → 과세양도차익 500,000,000 · 표1 20% 공제 100,000,000 · 과세표준 397,500,000 · 결정세액 133,060,000원(+ 지방소득세 13,306,000원). 법령상 올바른 출력: §99의4①과 §98의9①이 각각 1채씩 소유주택에서 제외 → 유효 주택수 1 → 1세대1주택 비과세, 양도가 10억 ≤ 12억이므로 전액 비과세 = 0원.

**세액 영향**: 133,060,000원 과다(+ 지방소득세 13,306,000원). 결정세액은 anchor B-3이 단언한 taxableGain 500,000,000·LTHD 0.2와 B-2가 검증한 §55 브래킷(37,500,000 → 4,365,000)으로부터 산식 계산한 값이며 엔진 직접 실행으로는 미측정.

**처방**

`resolveHouseCountExclusion`이 단수 `applied` 대신 적격 건수(0~2)를 반환하고, `runHouseCountExclusionStep`의 `totalExcluded`가 그 건수를 더하도록 한다. step 표시도 적격 조문별로 각각 push한다. 동시 적용을 계속 막을 근거를 찾으려면 §98의9①의 「1주택을 보유한 1세대」 판정 시점(준공후미분양 취득일)에 농어촌주택 보유 여부를 실제로 검사하는 요건 게이트로 구현할 것 — 무조건 1건 캡은 취득 순서와 무관하게 불리하게 작동한다.

---

## [D4-05] 이월과세(§97의2) 채택 시 §99의4·§98의9 취득순서 요건이 증여자 취득일로 판정된다

- **위치**: `lib/tax-engine/transfer-tax-house-exclusion-step.ts:25`
- **조문**: 조특법 §99의4① · §98의9① (「취득 전에 보유하던 다른 주택」)
- **유형**: legal-accuracy · **차원**: §99의4·주택수제외 · **검증**: 생존 1/1

**결함**

STEP 0.9(`transfer-tax-house-exclusion-step.ts:25`)가 `effectiveInput.acquisitionDate`를 §99의4·§98의9의 「취득 전에 보유하던 일반주택」 취득일로 넘기는데, 이월과세 **시나리오 A**(증여자 기준 — B가 아니다) 재귀 계산에서는 이 값이 `donorAcquisitionDate`로 교체돼 있어 취득순서 요건이 부당하게 통과한다. 다만 **최종 세액이 비과세로 떨어지지는 않는다** — §97의2②2호(`transfer-tax-carryover.ts:489-506` `oneHouseExclusion`)와 ②3호 비교(:527)가 「A만 1세대1주택」 조합에서 시나리오 B(수증자 취득일)를 강제하기 때문이다. 실제 피해는 반대 방향이다: 누수가 시나리오 A를 허위로 0원으로 만들어 **이월과세가 부당 배제**되고, 정당하게 채택됐어야 할 A 대신 B가 채택된다(실측 218,031,000 → 190,366,000, **27,665,000 과소**). 법령상 「보유」 주체는 1세대(조특법 §99의4①·§98의9①)이고 소득세법 §97의2①은 취득시기를 의제하지 않으므로, 판정에는 STEP 0.45와 같이 원본 `input.acquisitionDate`를 써야 한다 — 단 **배우자 증여처럼 동일세대인 경우에는 현행 동작이 결과적으로 옳으므로**, 결함이 실제로 발현하는 구간은 별도세대 직계존비속 증여다.

**근거**

transfer-tax-house-exclusion-step.ts:23-26 `resolveHouseCountExclusion(effectiveInput.reductions, { generalHouseAcquisitionDate: effectiveInput.acquisitionDate, transferDate: effectiveInput.transferDate })`, 호출부 transfer-tax.ts:381 `runHouseCountExclusionStep(effectiveInput, steps)`. `effectiveInput`은 `workingInput` 파생이고 workingInput은 transfer-tax.ts:158 `workingInput = carryoverResult.adoptedInput;` 로 교체되며, transfer-tax-carryover.ts:198·204 `//   acquisitionDate만 증여자 취득일로 교체한다.` / `acquisitionDate: ct.donorAcquisitionDate,` 이다. 같은 파일의 STEP 0.45는 이 함정을 이미 인지해 원본을 쓴다 — transfer-tax.ts:203-210 「workingInput의 증여자 취득일(carryover.ts donorAcquisitionDate)로 감면을 판정하면 선판정·본판정이 어긋난다 (리뷰 M-2)」 + `resolveSurchargeExclusionByReduction(input.reductions, { … acquisitionDate: input.acquisitionDate, … })`. 판정 지점은 new-99-4.ts:115 `if (acq <= input.generalHouseAcquisitionDate.getTime())` 와 unsold-98-9.ts:75 `if (acq <= input.generalHouseAcquisitionDate.getTime())`. 조문 근거: §99의4①은 「그 농어촌주택등 **취득 전에 보유하던** 다른 주택」, §98의9①은 「준공후미분양주택을 **취득하기 전에 보유한** 주택」으로 보유 주체가 그 1세대다(KoreanLaw MST 280409 실독). 이월과세는 소득세법 §97의2①상 취득가액 의제일 뿐 취득시기 의제가 아니라는 점은 같은 코드 주석(transfer-tax.ts:206-209)도 명시하고 있다. 미확인: 배우자 간 증여처럼 증여자·수증자가 동일 1세대인 경우 「세대」 기준 보유 개시일이 증여자 취득일과 일치할 수 있어 결과가 같아질 여지가 있다 — 별도 세대(직계존비속)로 좁힌 판정이 필요한지는 확인 필요.

**실패 시나리오**

입력: 아버지가 2005-01 취득한 주택을 별도 세대인 아들이 2024-01 증여받아(이월과세 대상, 시나리오 B 채택) 2026-06 양도. 아들 세대는 농어촌주택을 2020-05에 취득(§99의4 나머지 요건 충족), 세대 주택수 2. 현재 출력: `generalHouseAcquisitionDate = 2005-01`(증여자) < 농어촌주택 취득 2020-05 → ACQUISITION_ORDER 통과 → 주택수 −1 → 1세대1주택 비과세 적용. 법령상 올바른 출력: 그 1세대가 일반주택을 보유하기 시작한 날은 2024-01로 농어촌주택 취득(2020-05) 이후이므로 「취득 전에 보유하던 다른 주택」 요건 불충족 → 특례 불적용 → 2주택으로 과세.

**세액 영향**: 해당 조합에서 12억 비과세가 부당 적용되어 세액이 0으로 떨어질 수 있다(과소). 구체 금액은 사례 종속 — 미측정.

**처방**

STEP 0.45가 이미 쓰는 규약대로 `runHouseCountExclusionStep`에 §99의4·§98의9 취득순서 판정용 일반주택 취득일을 원본 `input.acquisitionDate`로 별도 전달한다(비과세 보유기간 판정에 쓰는 `effectiveInput.acquisitionDate`와 분리). 동일 세대 증여(배우자)와 별도 세대 증여를 구분해야 하는지는 조문·예규 확인 후 결정.

---

## [D4-06] §99의3② 주택수 제외가 모드 2 조문 목록에서 누락 — §99②는 있는데 §99의3②만 없다

- **위치**: `lib/tax-engine/transfer-reductions/unsold-hybrid-p5.ts:198`
- **조문**: 조특법 §99의3②
- **유형**: legal-accuracy · **차원**: §99의4·주택수제외 · **검증**: 생존 1/1
- **중복 병합**: D3-05 (같은 결함을 다른 차원이 독립 발견)

**결함**

조특법 §99의3②(신축주택 보유 중 다른 주택을 2007.12.31까지 양도 시 신축주택을 소유주택으로 보지 않음)이 **모드 2 주택수 제외 경로에 배선돼 있지 않다**. `lib/tax-engine/transfer-reductions/unsold-hybrid-p5.ts:198-207` `SpecialHouseExclusionArticle` union · :229-276 `SPECIAL_HOUSE_EXCLUSION_WINDOWS` · `lib/api/transfer-tax-schema.ts:479-482` Zod enum · `components/calc/transfer/SpecialHouseExclusionSection.tsx:18-27` UI 선택지 **4계층 모두 9종**이고 `new_99_3`가 없다. 문언이 §99②과 완전히 동일한(MCP MST 280409 실독) 조문인데 §99②만 `new_99`로 구현돼 있어 비대칭이다.

⚠️ 원 주장의 「§99의3은 주택수 제외 경로에 0건」은 **부정확하다**. §99의3②은 `lib/tax-engine/transfer-reductions/new-99-3.ts`에 이미 구현돼 있다(입력 `otherHouseTransferDate` :87 · 판정 `checkHouseCountExclusion993` :370-372 · 출력 `isExcludedFromHouseCountFor1H1H` :137·:493·:517 · 단위테스트 `__tests__/tax-engine/transfer-tax/reduction-99-3.test.ts:321-357` 5건). 그러나 그 구현은 **세 가지 이유로 도달 불가**다: ①`income-deduction-router.ts:195-215` 호출부가 `otherHouseTransferDate`를 인자로 넘기지 않아 프로덕션에서 항상 false, ②출력 필드를 읽는 코드가 엔진·UI·PDF 통틀어 0개(dead output), ③`evalNew993`은 **양도 자산이 신축주택 자신인 계산**에만 실행되므로 「그 외의 주택을 양도하는 계산」이라는 §99의3②의 적용 국면에 애초에 도달하지 않는다.

⇒ 수정 방향은 「신규 구현」이 아니라 **기존 §99의3② 판정 로직을 모드 2(`resolveSpecialHouseExclusions`) 축으로 옮기고 4계층에 `new_99_3` 선택지를 추가**하는 것이다(윈도우 `[2001-05-23, 2003-06-30]`, `transferDeadline: 2007-12-31`, `legalBasis: "조특법 §99의3②"`). 이때 `resolveSpecialHouseExclusions`의 시한 미충족 사유 문자열(unsold-hybrid-p5.ts:312 "§99②는 다른 주택을 …")이 §99② 하드코딩이라 §99의3 선택 시 **틀린 조문을 표시**하게 되므로 `w.legalBasis` 기반으로 일반화해야 한다. 또한 `lib/legal-verification/manifest/additions-transfer.ts:373`의 `SPECIAL.NEW_HOUSE_2001_BUYER` 키워드가 ①항 문구만 담고 있어 ②항은 `verify:legal` 사각지대다.

**근거**

unsold-hybrid-p5.ts:198-207 `export type SpecialHouseExclusionArticle = | "unsold_98" | "unsold_98_2" | "unsold_98_3" | "unsold_98_5" | "unsold_98_6" | "unsold_98_7" | "unsold_98_8" | "unsold_99_2" | "new_99";` — `new_99_3`가 없다. 윈도우 테이블(:229-276)과 UI 선택지(components/calc/transfer/SpecialHouseExclusionSection.tsx:18-27 `ARTICLE_OPTIONS`) 모두 9종뿐이다. 파일 헤더(:10-13)도 「7개 조문 ②항(§98의2④·§98의3③·§98의5②·§98의6②·§98의7②·§98의8②·§99의2②) + §98 령②·⑥ + §99②」로 §99의3②를 열거하지 않는다. 반증 시도: `grep -rn "new_99_3" lib app components` 결과 §99의3은 income-deduction-router(차감형)·metadata·period-check·Zod에만 나오고 주택수 제외 경로에는 0건. 조문 본문(KoreanLaw MST 280409 실독) §99의3② 「「소득세법」 제89조제1항제3호를 적용할 때 제1항을 적용받는 신축주택과 그 외의 주택을 보유한 거주자가 그 신축주택 외의 주택을 2007년 12월 31일까지 양도하는 경우에만 그 신축주택을 거주자의 소유주택으로 보지 아니한다.」 — §99②(코드가 `new_99`로 이미 구현)와 문언이 동일하고 양도시한도 같다.

**실패 시나리오**

입력: 2002-08 주택건설사업자와 최초 매매계약해 취득한 §99의3① 신축주택을 보유한 세대가, 그 외 주택을 2007-11-30에 양도(경정청구·기한후신고 목적 계산). 세대 주택수 2. 현재 출력: 모드 2 조문 선택지에 §99의3이 없어 선언 불가 → 유효 주택수 2 → 1세대1주택 비과세 부인. 법령상 올바른 출력: §99의3②에 따라 신축주택을 소유주택에서 제외 → 1주택 → 비과세.

**세액 영향**: 해당 사례에서 12억(당시 고가주택 기준) 비과세 전액 상실. 양도시한이 2007-12-31이라 신규 신고에는 발생하지 않고 과거분 재계산에 한정된다 — 사례별 금액 미측정.

**처방**

`SpecialHouseExclusionArticle`에 `"new_99_3"` 추가, `SPECIAL_HOUSE_EXCLUSION_WINDOWS`에 `{ label: "§99의3 신축주택 (2001.5.23~2003.6.30)", windows: [[2001-05-23, 2003-06-30]], legalBasis: "조특법 §99의3②", transferDeadline: 2007-12-31 }` 등록, `ARTICLE_OPTIONS`·Zod enum(specialHouseExclusionSchema)·파일 헤더 주석 동기화. 법령 검증 매니페스트에도 §99의3② 인용이 커버되는지 확인할 것.

---

## [D5-05] §98의2 장특 표2 특칙이 재개발·입주권 경로에는 배선돼 있지 않다

- **위치**: `lib/tax-engine/transfer-tax-redevelopment.ts:415`
- **조문**: 조특법 §98의2①1호
- **유형**: wiring · **차원**: §98~§98의7 하이브리드 · **검증**: 생존 1/1

**결함**

주장은 성립하나 세 곳을 정정한다.

**(a) 「표1 계열」이라는 서술이 부정확하다.** 재개발 경로의 현행 LTHD는 「표1 20%」 같은 단일 표1 공제율이 아니라, `runRedevelopment`가 소령 §166⑤에 따라 **인가전·인가후 기존건물·청산금 3분기별로 각각 산정한 공제액의 합**이다(실측 블렌드율 26.68% — 76,964,382 / 288,445,917). 결함의 본질은 「표1이 적용된다」가 아니라 **「§98의2①1호의 표2 override가 아예 실행되지 않는다」**이다.

**(b) 세액 영향 수치를 실측치로 대체한다.** 주장의 「양도차익 5억·10년·표1 20% vs 표2 40% ⇒ 45,000,000 과대」는 미실측 예시다. 실측(사례44 파생·양도차익 288,445,917·보유 15년·비1세대1주택): 현행 총세액 65,420,281 ↔ §98의2 적용 시 ≈49,363,235 ⇒ **산출세액 14,597,314 · 총세액 약 16,057,046 과대**. 같은 감면 payload를 정상 housing 경로에 넣으면 LTHD 140,000,000→200,000,000, 총세액 128,766,000→102,421,000으로 움직여 대조군이 정상 반응한다(구별력 확보).

**(c) 결함 범위가 주장보다 넓다 — 표시까지 소실된다.** 재개발 finalize는 `incomeDeduction`을 계산하면서도 `unsold982Detail`을 비롯한 하이브리드 detail을 **결과 객체에 부착하지 않는다**(transfer-tax-redevelopment.ts:364-380·446-455에서 `appliedId`가 있을 때만, 그것도 농특세 2-pass 내부에서만 참조). 실측상 재개발 결과의 `unsold982Detail`은 `undefined`이므로 `ReductionDetailCards.tsx:230`의 §98의2 상세 카드가 화면에서 통째로 사라진다. 즉 사용자가 §98의2를 선택해도 재개발 경로에서는 **장특 특칙도 안 걸리고, 근거 카드도 안 보이며**, 관측 가능한 유일한 효과는 (보유 2년 이상이면 무효인) 단기세율 억제뿐이다.

**(d) 조문 인용 미세 정정.** §98의2①은 「소득세법 제104조제1항**제3호**에도 불구하고」다(§104①2호는 불포함). 재개발 경로가 공유하는 `RATE_SPECIAL_REDUCTION_IDS`는 §98의3·§98의5·§98의6과 §98의2를 한 집합으로 묶어 「§104①2·3호 배제」로 주석돼 있어(transfer-tax-redevelopment.ts:414 인접 주석) §98의2에 대해서는 배제 범위가 조문보다 한 호 넓다. 이 축은 D5-05의 범위 밖이나 같은 블록에 있으므로 병기한다.

**근거**

§98의2 장특 특칙의 유일한 구현은 lib/tax-engine/transfer-tax.ts:638-652 `if (surchargeExclusionByReduction.appliedId === "unsold_98_2") { … const rate982 = holdingPeriod.years >= 3 ? Math.min(holdingPeriod.years * 0.04, 0.4) : 0; longTermHoldingDeduction = applyRate(taxableGain, rate982); … }` 하나뿐이다(`grep -rn "unsold_98_2\b" lib/` 전수 — 다른 계산 경로에 동일 분기 없음). 재개발 경로는 transfer-tax-redevelopment.ts:415-423에서 `const rateSpecialActive = incomeDeduction.eligibleId !== undefined && RATE_SPECIAL_REDUCTION_IDS.includes(incomeDeduction.eligibleId); const flatRate20Active = incomeDeduction.eligibleId === "unsold_98"; const taxRateInput = flatRate20Active ? {...input, forceFlatRate20:true} : rateSpecialActive ? {...input, suppressShortTermRate:true} : input;`만 하고, 그 위 주석(:411-414)도 「세율 특칙 **두 개**를 정상 경로와 같은 술어로 건다」라고 적어 장특 특칙이 빠진 것을 그대로 드러낸다. 도달성: asset-kind-gate.ts:36-41 `NEW_UNSOLD_HOUSING_KINDS = new Set(["housing","right_to_move_in","presale_right","redevelopment_apt"])`이므로 `unsold_98_2`(category `unsold_housing`)를 redevelopment_apt·입주권 자산에 선택할 수 있고, redevelopment 경로도 :364에서 `resolveIncomeDeduction`을 호출해 `eligibleId="unsold_98_2"`를 받는다. 조문 실측(MST 280409 §98의2①): 「…「소득세법」 제95조제2항 각 표 외의 부분 본문과 …에도 불구하고 장기보유특별공제액 및 세율은 다음 각 호의 규정을 적용한다. 1. 장기보유특별공제액: 양도차익에 「소득세법」 제95조제2항 **표2**에 따른 보유기간별 공제율을 곱하여 계산한 금액」.

**실패 시나리오**

2008-11-03~2010-12-31에 취득한 지방 미분양주택이 이후 재건축되어 `redevelopment_apt`로 양도되는 경우(또는 조합원입주권 상태 양도). 현재 출력: 단기세율만 배제되고 장특공제는 §166⑤ 기반 재개발 자체 공제(표1 계열)로 계산 → §98의2①1호가 명하는 표2 보유기간별 공제율(연 4%·최대 40%)이 적용되지 않는다. 올바른 출력: 양도차익 × 표2 보유기간별 공제율. 예컨대 보유 10년·양도차익 5억이면 표1 20%(1억) 대신 표2 40%(2억)가 적용돼 양도소득금액이 1억 낮아져야 한다.

**세액 영향**: 공제율 차이 × 양도차익. 위 예시(양도차익 5억·보유 10년, 표1 20% vs 표2 40%)에서 양도소득금액 100,000,000원 과대 → 최고세율 45% 구간이면 약 45,000,000원 과대. 실제 재개발 경로 세액 실측은 수행하지 못했다.

**처방**

STEP 4.05의 §98의2 표2 강제 로직을 공용 leaf로 추출해 transfer-tax.ts와 transfer-tax-redevelopment.ts가 같은 술어를 쓰게 할 것. 다만 §166⑤ 3-파트 분해와 표2 강제의 결합 방식(전체 양도차익 기준인지 파트별인지)은 별도 법적 판단이 필요하다 — 그 판단 전까지는 최소한 「§98의2 특칙 미반영」 경고 step을 남길 것.

---

## [D7-04] §69 편입·상속 합산 유형이 농특세 판정표에 없어 결과 화면에 「농어촌특별세 — 미판정」이 뜬다

- **위치**: `lib/tax-engine/transfer-tax-rural-surtax.ts:83`
- **조문**: 농어촌특별세법 §4 2호 · 농특세법 시행령 §4①1호
- **유형**: display · **차원**: §69·§70·§77·§77의2·§77의3 · **검증**: 생존 1/1
- **중복 병합**: D10-05, D11-04, D8-07 (같은 결함을 다른 차원이 독립 발견)

**결함**

**결함 성립. 다만 서술 3곳을 정정한다.**

**정정 1 — 표시 지점의 범위.** 「미판정」 step을 push하는 곳은 **단건 계열 3곳뿐**이다: `transfer-tax-finalize.ts:481-488`, `transfer-tax-redevelopment.ts:566-573`, 그리고 이 둘을 경유하는 `transfer-tax-mixed-use-totals.ts:383`. **다건(집계) 경로는 이 step을 아예 push하지 않는다** — `transfer-tax-aggregate-reduction-step.ts:277-284`의 `computeAggregateTaxCreditRuralSurtax`는 `ruralSurtaxCredit > 0`일 때만 step을 남기므로, `unknown` verdict는 **침묵**한다. 주장이 예시로 든 실패 시나리오(농지 1건)는 단건 경로라 성립하지만, 「결과 화면」이 다건 결과뷰를 포함한다면 그쪽은 증상이 다르다(오도 문구 없음 · 대신 누락 사실이 아무 데도 안 드러남 — 별건 관찰).

**정정 2 — 화면상 위치.** 이 step은 결과 요약에 직접 뜨지 않고 `DetailedCalculationStatementCard.tsx:178`의 `<EngineStepsSubToggle steps={result.steps} />` 안, 즉 **접힘 서브토글 내부**에 렌더된다. 「뜬다」는 맞지만 최상단 노출은 아니다.

**정정 3 — 누락 유형은 2개가 아니라 「§69 계열 전부」로 읽어야 한다.** `self_farming_incorp`·`self_farming_inherited` 둘 다 근거 조문은 **조특법 §69** 하나이고(조특령 §66⑤⑥ / §66⑪은 §69의 위임 규정), 농특세령 §4①1호가 §66~§70을 조건 없이 열거하므로 **둘 다 `"exempt"`**다. 즉 판정표는 「§69 감면의 하위 변종을 별개 id로 발행하면서 표는 대표 id 하나만 등재」한 구조적 누락이다 — 향후 §69에 세 번째 변종 id가 생기면 같은 방식으로 재발한다.

**유지되는 부분(전부 실측 확인)**: 인용된 코드 원문 · 두 id의 실제 생성 · `unknown` 낙하 · 「미판정」 step + 내부 enum id 노출 · 농특세령 §4①1호 verbatim · 세액 무영향(양쪽 0).

**근거**

판정표 `lib/tax-engine/transfer-tax-rural-surtax.ts:81-99`에는 `self_farming: "exempt"` 한 줄뿐이고 `self_farming_incorp`·`self_farming_inherited`가 없다(파일 전체 grep 결과 두 문자열 0건).
그런데 `lib/tax-engine/transfer-tax-reductions-calc.ts:323·325·337`이 그 값을 실제로 만든다 — `candidateType = "self_farming_incorp";` / `candidateType = "self_farming_inherited";` → `reductionTypeApplied: best.type`.
`transfer-tax-rural-surtax.ts:129-134` — `if (rule === undefined) { return none("unknown", \`감면 유형 「${reductionTypeApplied}」의 농어촌특별세 과세 여부가 판정표에 없습니다 — 부과하지 않았습니다.\`); }`
`transfer-tax-finalize.ts:482-489`이 그 verdict로 `label: "농어촌특별세 — 미판정"` step을 push한다.
KoreanLaw MCP 농어촌특별세법 시행령(MST 280835) 제4조①1호 verbatim: 「「조세특례제한법」 **제66조부터 제70조까지**, 제72조제1항…, 제77조[…직접 경작한 토지…로 한정한다] 및 제102조, 제104조의2 … 에 따른 감면」 ⇒ §69 감면은 **조건 없이 비과세**다.

**실패 시나리오**

농지, 8년 자경, 2002년 이후 주거지역 편입일 입력(부분감면) → `reductionTypeApplied = "self_farming_incorp"`, 감면세액 80,000,000.
현재: 결과 화면에 「농어촌특별세 — 미판정 / 감면 유형 「self_farming_incorp」의 농어촌특별세 과세 여부가 판정표에 없습니다」 step + **내부 enum id 노출**(`feedback_no_internal_id_in_result` 위반).
올바름: 「농어촌특별세 비과세 감면 (농어촌특별세법 시행령 §4①1호)」로 exempt 판정, 미판정 step 미표시.

**세액 영향**: 세액 무영향 — 표시/인용(양쪽 다 농특세 0원)

**처방**

TABLE에 `self_farming_incorp: "exempt"`, `self_farming_inherited: "exempt"` 추가. 유형 id 집합이 갈리지 않도록 `REDUCTION_TYPE_LABELS` 키 전수와 TABLE 키를 대조하는 anchor를 함께 추가.

---

## [D7-06] 자경농지 편입 부분감면의 근거를 조특령 §66⑤⑥으로 인용 — 실제는 §66④1호(3년 배제)와 §66⑦(계산식)

- **위치**: `lib/tax-engine/legal-codes/transfer.ts:202`
- **조문**: 조특령 §66④1호 · §66⑦
- **유형**: citation · **차원**: §69·§70·§77·§77의2·§77의3 · **검증**: 생존 1/1

**결함**

자경농지 편입일 부분감면의 근거 조항 번호가 두 축 모두 틀렸다. 코드가 구현한 **3년 경과 시 감면 상실**의 근거는 조특령 §66**④1호**(「이들 지역에 편입된 날부터 3년이 지난 농지」를 감면대상에서 제외)이고, **편입일까지 비율 안분 계산식**의 근거는 조특령 §66**⑦**(법 §69① 단서 위임, 양도소득금액 × (편입일 기준시가−취득 기준시가)/(양도 기준시가−취득 기준시가))이다. 코드가 인용한 ⑤(제4항 적용 농지는 양도일 현재 농지 기준 — 판정 기준일)과 ⑥(교환·분합·대토 시 경작기간 통산)은 편입 부분감면과 무관하다. 저장소 전역에 ④1호·⑦을 인용한 곳은 0건이며, `verify:legal` 매니페스트는 「조특령 §66」을 조 단위로만 등록해 항 번호 오기를 잡지 못한다.

**주장 대비 정정 2건**:
(a) **링크 오작동은 현재 발생하지 않는다.** `getReductionLegalBasis`(transfer-tax-helpers.ts:490)의 맵 키(공백 없음)와 `reductionTypeLabelOf` 반환값(공백 있음)이 어긋나 룩업이 미스하고, 그 결과 `finalize.ts:325`가 `legalBasis: undefined`를 내어 `DetailedCalculationStatementCard.tsx:240`의 `<LawArticleModal>`이 렌더되지 않는다. 나머지 노출 지점은 평문 텍스트다. (다만 그 맵 키 불일치가 고쳐지는 순간 `extractClauseMarkers`가 ⑤·⑥을 하이라이트해 정확히 주장한 오작동이 발현한다 — 잠재 결함.)
(b) **노출 지점이 주장보다 넓다.** 주장이 열거한 5곳 외에 사용자 대면 2곳이 추가된다: `components/calc/inputs/SelfFarmingIncorporationInput.tsx:87`(입력 토글 설명문)과 `lib/calc/transfer-tax-validate-reductions.ts:112`(차단성 검증 에러 메시지). 그 외 `lib/tax-engine/transfer-tax-helpers.ts:490`, `lib/tax-engine/transfer-tax-aggregate-pickers.ts:185`, `lib/tax-engine/types/transfer-reduction-input.types.ts:23`, `lib/api/transfer-tax-schema-reductions.ts:34`, `lib/stores/calc-wizard-asset-reduction.ts:15`, `lib/tax-engine/self-farming-reduction.ts:4,16,17,41`에도 같은 표기가 있다.

**근거**

코드 원문 `lib/tax-engine/legal-codes/transfer.ts:200-202`:
```
// ── 자경농지 편입일 부분감면 (조특법 §69 + 시행령 §66 ⑤⑥) ──
/** 조특법 시행령 §66 ⑤⑥ — 2002.1.1 이후 주거/상업/공업지역 편입 시 편입일까지만 감면 + 3년 내 양도 요건 */
REDUCTION_SELF_FARMING_INCORP: "조특법 시행령 §66 ⑤⑥",
```
같은 표기가 `transfer-reduction-type-labels.ts:25` `self_farming_incorp: "자경농지 (§69·편입일 부분감면 §66⑤⑥)"`, `self-farming-reduction.ts:16-17` 헤더, 동 파일 `:153` breakdown 문자열 `"… 이후 양도 → 감면 상실 (조특령 §66 ⑥)"`, `transfer-tax-reductions-calc.ts:281` 주석에 반복된다.
KoreanLaw MCP 조특법 시행령(MST 287181) 제66조 실독:
· **④1호** — 「양도일 현재 특별시·광역시… 또는 시…에 있는 농지중 「국토의 계획 및 이용에 관한 법률」에 의한 **주거지역·상업지역 및 공업지역안에 있는 농지로서 이들 지역에 편입된 날부터 3년이 지난 농지**」를 감면대상 토지에서 제외 ⇒ 코드가 말하는 「3년」 근거.
· **⑦** — 「법 제69조제1항 **단서**에서 "대통령령으로 정하는 소득"이란 … 양도소득금액 × (주거지역등에 편입되거나 환지예정지 지정을 받은 날의 기준시가 − 취득 당시 기준시가) / (양도 당시 기준시가 − 취득 당시 기준시가)」 ⇒ 코드가 구현한 **계산식**의 근거.
· 실제 **⑤**는 「제4항의 규정을 적용받는 농지는 … 양도일 현재의 농지를 기준으로 한다」(판정 기준일), **⑥**은 「… 교환·분합 및 대토한 경우 … 경작한 기간을 당해 농지에서 경작한 기간으로 본다」(경작기간 통산)로 **둘 다 편입 부분감면과 무관**하다.

**실패 시나리오**

농지 §69 + 편입일 부분감면 적용 → 결과 화면 감면 라벨 「자경농지 (§69·편입일 부분감면 **§66⑤⑥**)」, breakdown 「감면 상실 (조특령 **§66 ⑥**)」. 사용자가 링크를 열면 「양도일 현재 농지 기준」·「교환·분합 경작기간 통산」 조항이 뜬다. 올바름: 「§66④1호·§66⑦」.

**세액 영향**: 세액 무영향 — 표시/인용

**처방**

상수를 `"조특령 §66④1호·§66⑦"`로 정정(또는 3년 배제 = §66④1호 / 계산식 = §66⑦ 두 상수로 분리)하고, 라벨·breakdown·헤더 주석·`transfer-tax-helpers.ts` 맵 키를 함께 갱신. `lib/legal-verification/manifest/additions-transfer.ts`의 해당 항목 키워드도 `fullText` 실측으로 재검증(현 키워드가 §66⑤⑥ 본문 기준이면 매칭이 어긋난다).

---

## [D7-07] 편입 후 3년 경과 감면배제를 소재지 제한·단서 예외 없이 전면 적용 — 법 근거 없는 불리 적용

- **위치**: `lib/tax-engine/self-farming-reduction.ts:148`
- **조문**: 조특령 §66④1호 본문 및 단서 가·나·다목
- **유형**: legal-accuracy · **차원**: §69·§70·§77·§77의2·§77의3 · **검증**: 생존 1/1

**결함**

조특령 §66④1호의 「편입일부터 3년 경과」 배제는 (a) 양도일 현재 특별시·광역시(광역시의 군 제외)·시(도농복합시 읍·면 및 행정시 읍·면 제외) 소재라는 소재지 요건과 (b) 단서 가·나·다목(대규모개발사업·공공기관 시행 개발사업 등) 예외를 갖는데, `lib/tax-engine/self-farming-reduction.ts:147-165`는 둘 다 모델링하지 않아 `incorporationDate`가 주어지고 양도일이 그 +3년을 지나면 무조건 `qualifies:false, reducibleIncome:0`을 반환한다. 소재지·예외 입력 경로는 엔진 입력 타입(:41-55)·union 타입·④⑫⑭ 4계층 어디에도 없다.

정정 1 — 근거 조항: 3년 배제의 근거는 코드가 인용하는 「조특령 §66⑤⑥」이 아니라 **영 §66④1호**이며(현행 §66⑤=양도일 현재 농지 기준, §66⑥=교환·분합·대토 경작기간 통산), 부분감면 산식의 근거는 **법 §69① 단서 + 영 §66⑦**이다. 코드 5지점(`legal-codes/transfer.ts:202`, `self-farming-reduction.ts:16-17`·`:153`, `SelfFarmingIncorporationInput.tsx:86`, `transfer-tax-validate-reductions.ts:112`)이 모두 §66⑤⑥을 인용해 결과 화면 법령 링크가 틀린 항을 연다.

정정 2 — 효과의 성질: 「감면 상실」이 아니라 영 §66④ 본문상 **감면대상 토지(「대통령령으로 정하는 토지」)에서 제외**되는 것이다.

정정 3 — 소재지 요건 미충족 시의 정답: 주장 말미의 「그 요건도 없으면 전액 감면 대상」은 부정확하다. 법 §69① 단서는 **소재지와 무관하게** 「주거지역등에 편입」된 사실만으로 적용되므로, 군 소재 농지가 주거지역에 편입되고 3년이 지난 뒤 양도한 경우의 정답은 전액감면이 아니라 **영 §66⑦ 기준시가 비율에 따른 부분감면**이다. 결과적으로 이 케이스는 토글 OFF면 전액감면(과다), ON이면 0(과소)으로 **어느 입력으로도 올바른 값에 도달할 수 없다**.

정정 4 — 세액 수치: 예시의 편입비율 60%는 가정치다. 그 가정 하에서 감면세액 floor(150,000,000 × 300,000,000 ÷ 497,500,000) = 90,452,261, 지방소득세 포함 약 99,497,487 과다는 재검산 결과 일치한다.

부수 — `additions-transfer-decree.ts:441-452`의 §66 매니페스트 키워드가 ①항 문구뿐이라 ④1호·⑦ 개정은 `npm run verify:legal`의 사각지대다.

**근거**

코드 원문 `lib/tax-engine/self-farming-reduction.ts:147-165`:
```
// 편입일부터 3년 경과 후 양도 → 감면 상실 (조특령 §66 ⑥)
const graceDeadline = addYears(input.incorporationDate, 3);
if (input.transferDate > graceDeadline) {
  …
  return { qualifies: false, reducibleIncome: 0, … incorporationGraceExpired: true, … };
}
```
입력 타입(`:25-56`)에 소재지(시·군)·대규모개발사업 여부 필드가 없다. UI(`app/calc/transfer-tax/steps/Step5.tsx:120-186` 자경농지 서브패널 + `SelfFarmingIncorporationInput`)에도 소재지·예외 입력이 없다(`grep -rn "대규모개발사업" lib components app` 0건).
KoreanLaw MCP 조특령 §66④1호 verbatim: 「**양도일 현재 특별시·광역시(광역시에 있는 군을 제외한다) 또는 시**{…도농 복합형태의 시의 읍·면 지역 및 …행정시의 읍·면 지역은 제외한다}**에 있는 농지중** … 주거지역·상업지역 및 공업지역안에 있는 농지로서 이들 지역에 편입된 날부터 3년이 지난 농지. **다만, 다음 각 목의 어느 하나에 해당하는 경우는 제외한다.** 가. 사업시행지역 안의 토지소유자가 1천명 이상이거나 … 대규모개발사업 … 나. 사업시행자가 국가, 지방자치단체, 그 밖에 재정경제부령으로 정하는 공공기관인 개발사업지역 … 다. … 편입된 후 3년 이내에 대규모개발사업이 시행되고 …」

**실패 시나리오**

군(郡) 소재 농지, 8년 자경, 주거지역 편입일 2018-05-01, 양도일 2026-05-01, 양도소득금액 500,000,000, 산출세액 150,000,000.
현재: `transferDate > 2021-05-01` → `qualifies:false, reducibleIncome:0` → 감면 **0**.
조문: §66④1호 본문의 소재지 요건(특별시·광역시·시)에 해당하지 않으므로 3년 배제가 적용되지 않는다. §69① 단서에 따라 편입일까지의 소득만 감면(기준시가 비율 안분)하거나, 그 요건도 없으면 전액 감면 대상이다. 예컨대 편입비율 60%면 감면세액 ≈ 150,000,000 × 300,000,000/497,500,000 = **90,452,261**.

**세액 영향**: 위 예시에서 감면 90,452,261 과소 → 결정세액·지방소득세 합계 약 99,497,000 과다 부과.

**처방**

3년 배제 게이트에 소재지 구분(특별시·광역시(군 제외)·시(도농복합시 읍·면 제외)) 입력과 §66④1호 단서 가·나·다목 예외 boolean을 추가하고, 요건 미해당이면 배제를 걸지 않는다. 신규 필드에는 「미해당」 선택지를 반드시 두어 미입력이 불리하게 읽히지 않도록 한다.

---

## [D7-08] 2002-01-01 이전 편입은 3년 경과 여부를 묻지 않고 무조건 전액 감면

- **위치**: `lib/tax-engine/self-farming-reduction.ts:129`
- **조문**: 조특령 §66④1호
- **유형**: legal-accuracy · **차원**: §69·§70·§77·§77의2·§77의3 · **검증**: 생존 1/1

**결함**

주장은 성립하나 두 가지 정정·보강이 필요하다.

**(a) 「2002 이전 분기가 3년 배제를 우회한다」는 서술이 결함 범위를 과소하게 잡는다.** 같은 조건문 `if (!input.incorporationDate || input.incorporationDate < POLICY_START)` (self-farming-reduction.ts:129)의 **첫 번째 항**, 즉 `incorporationDate`가 미제공인 경우도 똑같이 전액 감면으로 조기반환한다(:133 "편입일 없음 → 편입 미발생, 전액 감면"). `lib/calc/transfer-tax-api-reductions.ts:22`는 `useSelfFarmingIncorporation` 토글이 OFF면 `incorporationDate`를 아예 보내지 않으므로, **토글을 켜지 않은 기본 경로에서도 §66④1호 3년 배제는 한 번도 검증되지 않는다.** 따라서 D7-08의 2002 분기만 고쳐도 결함은 남는다 — 두 진입점을 함께 봐야 한다. (이 확장된 gap 자체의 심각도는 high에 가깝다.)

**(b) 「3년 배제」 자체도 조문과 요건이 어긋난다(별건, 반대 방향).** `:148`의 게이트는 편입일 + 3년만 본다. §66④1호는 ① 「양도일 현재 **특별시·광역시(광역시에 있는 군 제외) 또는 시**(도농복합시·행정시의 읍·면 제외)에 있는 농지」라는 **소재지 요건**과 ② 단서 가·나·다(대규모개발사업 단계적 시행·보상지연, 공공기관 시행 부득이한 사유 등)의 **예외**를 함께 요구한다. 코드는 둘 다 없어, 읍·면 소재 농지나 단서 해당 농지에 대해 납세자에게 **불리하게** 감면을 상실시킨다. 따라서 D7-08 수정은 「2002 분기 제거」가 아니라 「§66④1호 요건 전체(소재지 + 3년 + 가·나·다 예외) 모델링」이어야 하며, 입력 필드 신설이 수반된다.

**(c) 조문 인용 오류(별건, 세액 무영향이나 결과 화면 법령 링크가 틀리게 열린다).** `lib/tax-engine/legal-codes/transfer.ts:202` `REDUCTION_SELF_FARMING_INCORP: "조특법 시행령 §66 ⑤⑥"`. 현행 시행령에서 **§66⑤는 「양도일 현재의 농지 기준」**, **§66⑥은 「교환·분합·대토 시 경작기간 통산」**이고, 편입일 부분감면 산식은 **§66⑦**, 3년 배제는 **§66④1호**다. 같은 오인용이 엔진 헤더 주석(self-farming-reduction.ts:6-8,17-18), `transfer-reduction-type-labels.ts:25`, `transfer-tax-reductions-calc.ts:281`, `transfer-tax-validate-reductions.ts:112`, `SelfFarmingIncorporationInput.tsx:4,87`에 복제돼 있다.

**근거**

코드 원문 `lib/tax-engine/self-farming-reduction.ts:125-145`:
```
// 2002.1.1 기준선 — 그 이전 편입은 기존 전액감면 경로 (조특령 §66 부칙)
const POLICY_START = new Date("2002-01-01");
if (!input.incorporationDate || input.incorporationDate < POLICY_START) {
  breakdown.push(input.incorporationDate ? `편입일(…)이 2002-01-01 이전 → 부분감면 규정 미적용, 전액 감면` : "편입일 없음 → 편입 미발생, 전액 감면");
  return { qualifies: true, reducibleIncome: transferIncome, reducibleRatio: 1, … };
}
```
KoreanLaw MCP 조특령 §66④1호 본문에는 **편입일 시점에 관한 어떤 제한도 없다** — 「… 이들 지역에 편입된 날부터 3년이 지난 농지」를 감면대상 토지에서 제외할 뿐이다. 2002년 개정으로 신설된 것은 §69① **단서(부분감면)** 이고, 3년 경과 배제는 그와 별개의 「대통령령으로 정하는 토지」 정의다.
⚠️ 미확인: 코드 주석이 근거로 든 「조특령 §66 부칙」의 적용례 원문은 확인하지 못했다(과거 시행본·부칙은 MCP `efYd` 조회가 NOT_FOUND). 부칙에 「이 영 시행 후 최초로 주거지역등에 편입되는 분부터 적용」류의 규정이 있더라도 그것은 **부분감면 계산식**의 적용례이지 3년 배제의 적용례라는 근거는 확인되지 않았다.

**실패 시나리오**

농지, 8년 이상 자경, 서울시 소재, 주거지역 편입일 2000-03-01, 양도일 2026-04-01, 양도소득금액 500,000,000, 과세표준 497,500,000, 산출세액 150,000,000.
현재: `incorporationDate < 2002-01-01` → `qualifies:true, reducibleIncome = 500,000,000` → 감면세액 = min(150,000,000 × 500,000,000/497,500,000, 1억, 150,000,000) = **100,000,000**.
조문(§66④1호): 편입일부터 3년이 지난 농지이므로 감면대상 토지에서 제외 → 감면세액 **0**.

**세액 영향**: 위 예시에서 감면 100,000,000 과다 → 결정세액 100,000,000 + 지방소득세 10,000,000 과소. (부칙 확인 결과에 따라 판정이 바뀔 수 있음 — 착수 전 부칙 원문 확보 필요)

**처방**

부칙 원문(사용자·오프라인 아카이브 경유)으로 2002-01-01 기준선의 근거를 먼저 확정한다. 3년 배제에 편입일 시점 제한이 없음이 확인되면, pre-2002 분기는 「부분감면 계산식만 미적용(전액 대상)」으로 좁히고 3년 경과 배제는 D7-07의 소재지 게이트와 함께 동일하게 적용한다.

---

## [D7-09] 피상속인 경작기간 합산에 §66⑪의 「상속받은 농지를 1년 이상 계속 경작」 요건이 없다

- **위치**: `lib/tax-engine/self-farming-reduction.ts:100`
- **조문**: 조특령 §66⑪·⑫
- **유형**: legal-accuracy · **차원**: §69·§70·§77·§77의2·§77의3 · **검증**: 생존 1/1

**결함**

조특령 §66⑪은 피상속인 경작기간 의제의 요건으로 「상속인이 상속받은 농지를 1년 이상 계속하여 경작할 것」을 명문으로 두고 있으나, 엔진은 이를 검증하지 않는다. lib/tax-engine/self-farming-reduction.ts:100-102가 `farmingYears + (decedentFarmingYears ?? 0)`를 조건 없이 합산해 8년 요건을 판정하고, 레거시 경로(transfer-tax-reductions-calc.ts:340-347)도 동일하다.

단, 주장의 「무조건 합산」은 정정이 필요하다 — 상류에 취득원인 게이트가 실재한다(lib/calc/transfer-tax-api-reductions.ts:38 · app/calc/transfer-tax/steps/Step5.tsx:135이 `acquisitionCause === "inheritance"`일 때만 필드를 전달·렌더). 이 게이트는 §66⑪의 「상속」 전제만 지키고 계속경작 요건은 전혀 다루지 않는다.

또한 실제 과다감면 창은 `farmingYears === 0` 구간으로 한정된다. types/transfer-reduction-input.types.ts:12가 farmingYears를 「상속인 본인이 해당 농지를 직접 경작한 기간」으로 정의하므로 farmingYears >= 1이면 §66⑪ 본문의 「1년 이상」은 사실상 충족되며(「계속하여」의 연속성·§66① 거주 요건 미검증은 별개 갭), api-reductions.ts:35의 `parseInt(...) || 0`이 0<x<1도 0으로 절사해 그 구간을 포섭한다. Step5.tsx:143이 「본인 자경 < 8년」이면 0년을 포함해 피상속인 합산 위젯을 띄우므로 UI가 이 구간을 적극 유도한다.

§66⑫(1년 계속경작 미충족이어도 상속받은 날부터 3년 내 양도·협의매수·수용 + 3년 내 택지개발지구·산업단지 등 지정 시 합산 허용)의 대체 경로 역시 미구현이나, ⑫는 요건을 넓히는 납세자 유리 예외이므로 과다감면의 원인이 아니라 별도의 과소적용 갭이다.

실패 시나리오(실측 재현): 상속 취득 농지, 상속인 자경 0년, 피상속인 10년, 상속 5년 뒤 일반 매매 → probe 결과 `qualifies:true`·`reducibleRatio:1`(전액). 감면 한도는 transfer-rate-seed.ts:153 `maxAmount: 100000000`. 기존 anchor 4건(reductions-and-exempt.test.ts:622·632·643·652)은 전부 farmingYears 5~8이라 이 구간의 회귀 안전망은 0건이다.

**근거**

코드 원문 `lib/tax-engine/self-farming-reduction.ts:100-102`:
```
const effectiveFarmingYears = input.farmingYears + (input.decedentFarmingYears ?? 0);
const meetsFarmingRequirement = effectiveFarmingYears >= input.minFarmingYears;
```
호출부 `lib/tax-engine/transfer-tax-reductions-calc.ts:285·299`: `const decedent = reduction.decedentFarmingYears ?? 0;` … `decedentFarmingYears: decedent > 0 ? decedent : undefined,` — 조건 없이 전달한다.
입력 타입(`types/transfer-reduction-input.types.ts:20`)·Zod(`lib/api/transfer-tax-schema-reductions.ts:33`)·UI(`app/calc/transfer-tax/steps/Step5.tsx:150-166`) 어디에도 「1년 이상 계속 경작」 또는 §66⑫ 대체요건(3년 내 양도·택지개발지구 등 지정) 필드가 없다(`grep -rn "1년 이상 계속" lib components app` 0건).
KoreanLaw MCP 조특령 §66⑪ verbatim: 「제4항의 규정에 따른 경작한 기간을 계산할 때 **상속인이 상속받은 농지를 1년 이상 계속하여 경작하는 경우**(제1항 각 호의 어느 하나에 따른 지역에 거주하면서 경작하는 경우를 말한다 …) 다음 각 호의 기간은 상속인이 이를 경작한 기간으로 본다.」 ⑫는 그 예외로 「상속받은 날부터 3년이 되는 날까지 양도하거나 … 협의매수 또는 수용되는 경우로서 … 택지개발지구·산업단지 등으로 지정되는 경우」만 합산을 허용한다.

**실패 시나리오**

상속 취득 농지, 상속인 자경 0년(전혀 경작하지 않음), 피상속인 경작 10년, 상속받은 날부터 5년 뒤 일반 매매로 양도. 산출세액 90,000,000.
현재: 합산 10년 ≥ 8년 → `qualifies:true` → 감면세액 **90,000,000**(전액).
조문: §66⑪의 「1년 이상 계속 경작」 미충족, §66⑫의 3년 내 양도·지정 요건도 미충족 → 합산 불가 → 자경기간 0년 → 감면 **0**.

**세액 영향**: 위 예시에서 감면 90,000,000 과다 → 결정세액 90,000,000 + 지방소득세 9,000,000 과소.

**처방**

감면 입력에 「상속받은 농지를 1년 이상 계속 경작했는가」(§66⑪) 및 「미해당 시 §66⑫ 대체요건(상속일부터 3년 내 양도·협의매수·수용 + 택지개발지구/산업단지 등 지정)」 필드를 추가하고, 둘 다 미충족이면 `decedentFarmingYears`를 합산하지 않는다. 14지점(⑤⑧⑫⑬⑭) 동기화 필요.

---

## [D7-10] §66⑭ 사업소득·총급여 3,700만원 이상 과세기간의 자경기간 제외가 양도세 §69에만 없다

- **위치**: `lib/tax-engine/self-farming-reduction.ts:31`
- **조문**: 조특령 §66⑭1호·2호
- **유형**: legal-accuracy · **차원**: §69·§70·§77·§77의2·§77의3 · **검증**: 생존 1/1
- **심각도 조정**: low → medium (검증 결과)

**결함**

결함은 성립하나 서술이 세 곳에서 부정확·과소하다.

(1) **결격 축이 「거주자」에만 있는 게 아니다.** §66⑭ 본문 verbatim은 「제4항ㆍ제6항ㆍ제11항 및 제12항에 따른 경작한 기간 중 **해당 피상속인(그 배우자를 포함한다)** 또는 **거주자 각각에 대하여**」다. 즉 §66⑪ 합산 경로의 `decedentFarmingYears`(self-farming-reduction.ts:34)도 동일하게 결격기간 차감 대상이다. 주장은 본인 자경기간만 다뤄 축을 절반만 짚었다.

(2) **1호만이 아니라 2호도 미구현이다.** 제목이 「사업소득·총급여 3,700만원 이상」으로 1호만 지목했으나, 2호(소득세법 §24①에 따른 사업소득 총수입금액이 소령 §208⑤2호 각 목 금액 이상인 과세기간)도 전혀 없다. 상속세 경로에는 2호가 `hasDisqualifyingGrossReceipt`(inheritance-farming.types.ts:57)로 이미 별도 모델링돼 있어 대조가 더 선명하다.

(3) **「구현 결함」이 아니라 「입력경로·안내 부재」다.** `farmingYears`는 엔진이 도출하는 값이 아니라 사용자 신고 사실이고, 엔진은 `effectiveFarmingYears >= input.minFarmingYears`(:100-102)를 정확히 비교한다. 즉 입력이 맞으면 계산도 맞다. 결함의 실체는 ⑤입력 UI 부재 + 안내 부재이며, 주장 본문이 이미 그렇게 적었으므로 제목의 「구현되지 않아」는 「입력 경로가 없어」로 좁히는 것이 정확하다.

**추가 — 수정 시 상속세 모델 복사 금지.** 상증령 §16⑭은 「영농에 종사하지 아니한 것으로 본다」(불리언 결격)이지만 조특령 §66⑭은 「그 기간은 … 경작한 기간에서 **제외한다**」(기간 차감)다. `hasDisqualifyingIncome: boolean` 패턴을 그대로 옮기면 조문이 틀린다 — 필요한 것은 결격 과세기간 **연수**(피상속인분 별도)다.

**범위 밖 인접 관찰(별건, 이 주장의 일부 아님)**: `lib/tax-engine/legal-codes/transfer.ts:202` `REDUCTION_SELF_FARMING_INCORP = "조특법 시행령 §66 ⑤⑥"`인데, 현행 §66에서 「편입일부터 3년 경과」는 **④1호**, 기준시가 증가분 안분 계산식은 **⑦**이다(⑤는 양도일 현재 농지 기준, ⑥은 교환·분합·대토). §66⑭ 신설로 항 번호가 밀렸을 가능성이 있으나 과거 시행본이 MCP NOT_FOUND라 **확인 필요**.

**근거**

`lib/tax-engine/self-farming-reduction.ts:31-36`은 `farmingYears`·`decedentFarmingYears`를 그대로 받고 결격기간 관련 필드가 없다. UI `app/calc/transfer-tax/steps/Step5.tsx:126-133`은 「년 (8년 이상이어야 감면 적용)」 한 줄 안내뿐이다.
반증 시도(sibling 경로): `grep -rn "3,700\|37_000_000" lib components` 결과 히트는 전부 **상속세 영농상속공제**(상증령 §16⑭) — `lib/tax-engine/deductions/inheritance-farming-deduction.ts:71·83·90`, `lib/tax-engine/types/inheritance-farming.types.ts:49·176`, `components/calc/inheritance/HeirAssessmentCard.tsx:147`. 양도세 §69 경로에는 0건이다.
KoreanLaw MCP 조특령 §66⑭ verbatim: 「제4항·제6항·제11항 및 제12항에 따른 경작한 기간 중 … 다음 각 호의 어느 하나에 해당하는 과세기간이 있는 경우 그 기간은 … 경작한 기간에서 **제외한다**. 1. 「소득세법」 제19조제2항에 따른 사업소득금액(농업·임업…은 제외…)과 같은 법 제20조제2항에 따른 총급여액의 합계액이 **3천700만원 이상**인 과세기간이 있는 경우 … 2. … 사업소득 총수입금액이 같은 법 시행령 제208조제5항제2호 각 목의 금액 이상인 과세기간이 있는 경우」

**실패 시나리오**

농지 보유·경작 10년이나 그중 3개 과세기간의 사업소득+총급여가 각 5,000만원. 사용자가 자경기간 「10년」 입력.
현재: 10 ≥ 8 → 감면 적용(예: 산출세액 60,000,000 전액 감면).
조문: 결격 3개 과세기간 제외 → 실질 자경기간 7년 < 8년 → 감면 **0**.

**세액 영향**: 예시에서 감면 60,000,000 과다 가능. 다만 사용자가 「감면 대상 자경기간」을 스스로 계산해 입력하면 일치할 수 있어 발생 여부는 입력 관행에 종속된다.

**처방**

최소 조치로 자경기간 입력 필드 hint에 §66⑭ 결격 과세기간 제외를 명시하고, 상증세 경로(`inheritance-farming-deduction.ts`)와 같은 「결격 과세기간 수」 입력을 두어 엔진에서 차감하도록 확장한다.

---

## [D8-02] §97 시리즈 감면 근거로 중복배제 조항(§127⑦)이 인쇄된다 — #048 수정이 §77의2·§77의3만 덮었다

- **위치**: `lib/tax-engine/transfer-tax-aggregate-pickers.ts:205`
- **조문**: 조특법 §127⑦(중복지원의 배제) vs §97①
- **유형**: citation · **차원**: §133 한도·§127⑦ · **검증**: 생존 3/3
- **심각도 조정**: high → medium (검증 결과)

**결함**

`resolveTypeLegalBasis`(`transfer-tax-aggregate-pickers.ts:205-206`)의 default가 중복배제 조항 `TRANSFER.REDUCTION_OVERLAP_EXCLUSION`("조특법 §127⑦")이라, 조특법 §133 한도 그룹에 속하지 않는 **모든 세액감면형 유형**(§97 시리즈 4종 `rental_97_main`·`rental_97_proviso`·`rental_97_2`·`rental_97_5` **및 하이브리드 §98 시리즈 tax_amount id** `unsold_98_3`·`unsold_98_5`·`unsold_98_6` 등)이 다건 결과탭 「감면세액 합산 재계산」 카드의 유형별 **「법적 근거」 줄에 실체적 감면 조문 대신 중복배제 조항(§127⑦)** 을 인쇄한다. 원인은 `aggregate-reduction-limits.ts:164-172`가 그룹 밖 유형에 `legalBasis: ""`를 넣어 `transfer-tax-aggregate-reduction-step.ts:143`의 else 가지(=default)로 확정시키는 것이다. #048 수정 주석(`:194-200`)은 `gb_designated_land`·`replacement_land_comp` 두 case만 추가했고 나머지는 default로 남았다. 정정 상수는 이미 존재한다(`legal-codes/transfer-house.ts:162-167` `RENTAL_97_MAIN: "조특법 §97 ① 본문"` 등).

**단, 원 주장의 다음 두 서술은 실측 반증된다**: ① 정확한 조문이 「화면 어디에도 인용되지 않는」 것이 아니다 — `MultiTransferTaxResultView.tsx:103`의 `reductionTypeLabelOf`가 바로 윗줄에 "장기임대주택 (§97 ① 본문)"을 이미 표시한다(`transfer-reduction-type-labels.ts:35`). ② 링크 오작동은 없다 — `parseCitations`는 `lib/legal-verification/`(정적 분석) 전용이고 UI 렌더 경로에 없으며, `entry.legalBasis`는 `:111`에서 평문 `<p>`로 렌더돼 `LawArticleModal`에 연결되지 않는다. 실제 피해는 「§127⑦ 본문이 열린다」가 아니라 **같은 카드 안에서 §97① 본문(라벨)과 §127⑦(법적 근거)이 병기되어 어느 것이 감면 근거인지 모순 신호를 준다**는 것이다. 세액 영향 0.

**근거**

`transfer-tax-aggregate-pickers.ts:178-207`:
```ts
export function resolveTypeLegalBasis(type: string): string {
  switch (type) {
    case "self_farming": ...
    case "public_expropriation": ...
    case "gb_designated_land": return TRANSFER.REDUCTION_GB_DESIGNATED_LAND;
    case "replacement_land_comp": return TRANSFER.REDUCTION_REPLACEMENT_LAND;
    default:
      return TRANSFER.REDUCTION_OVERLAP_EXCLUSION;
  }
}
```
`lib/tax-engine/legal-codes/transfer.ts:119` `REDUCTION_OVERLAP_EXCLUSION: "조특법 §127⑦"`.

소비 지점 `transfer-tax-aggregate-reduction-step.ts:133-143` — §133 그룹에 없는 유형은 `info?.legalBasis`가 `""`(=`aggregate-reduction-limits.ts:170-174`)라 falsy → else 가지의 `resolveTypeLegalBasis(type)`가 그대로 `legalBasis`가 된다.

**실측**: 위 D8-01과 같은 probe에서 `res.reductionBreakdown[0].legalBasis` = `조특법 §127⑦` (type=`rental_97_main`).

같은 파일 `:194-200` 주석이 이 결함을 「결과탭 코드리뷰 #048」로 이미 기술했으나 처방은 `gb_designated_land`·`replacement_land_comp` 두 case만 추가했고, §97 시리즈 4종(`rental_97_main`·`rental_97_proviso`·`rental_97_2`·`rental_97_5`)과 레거시 `long_term_rental`(:188에 있음)을 제외한 나머지는 default로 남았다. 상수는 이미 존재한다 — `legal-codes/transfer-house.ts:161-166` `RENTAL_97_MAIN: "조특법 §97 ① 본문"` 등.

**실패 시나리오**

다건 계산기에서 자산 A에 §97① 본문 장기임대주택 감면을 선택하고 계산 → 결과탭 「감면세액 (합산 재계산)」 카드의 법적 근거가 「조특법 §127⑦」로 표시되고, 실제 근거인 「조특법 §97 ① 본문」은 화면 어디에도 인용되지 않는다. 저장소의 인용 링크화(`parseCitations`)는 이 문자열을 그대로 열므로 사용자는 감면 근거를 찾다가 중복배제 조항 본문을 보게 된다. 올바른 출력: 「조특법 §97 ① 본문」.

**세액 영향**: 세액 무영향 — 표시/인용

**처방**

`resolveTypeLegalBasis`에 §97 시리즈 4종을 `TRANSFER_REDUCTION_ARTICLE.RENTAL_97_*` 상수로 추가하고, default를 「§127⑦」이 아니라 빈 문자열 또는 `UNKNOWN` 표시로 바꾼다(중복배제 조항이 감면 근거 자리에 오는 구조 자체를 제거). 회귀 anchor는 `TransferReductionId` 24종 전수에 대해 `resolveTypeLegalBasis(id)`가 `REDUCTION_OVERLAP_EXCLUSION`을 반환하지 않음을 단언 — 새 조문 추가 시 자동 검출된다.

---

## [D8-03] §133②의 5년 누적 대상 3개 조문 중 §77의2·§77의3 이력을 입력할 수 없다

- **위치**: `lib/api/transfer-tax-schema.ts:493`
- **조문**: 조특법 §133②2호
- **유형**: wiring · **차원**: §133 한도·§127⑦ · **검증**: 생존 1/1

**결함**

결함 자체는 성립한다. 다만 두 곳을 정정한다.

(1) 제목·주장의 「입력할 수 없다」는 과장이다. 정확히는 **「정확한 라벨의 선택지가 없고, 대체 입력을 지시하는 안내도 없다」**. 세 유형이 `buildLimitGroups`의 동일 그룹(`aggregate-reduction-limits.ts:65-70`)에 속하므로, §77의2·§77의3 이력을 「공익사업 수용 감면」(`public_expropriation`)으로 골라 금액만 맞게 넣으면 `priorGroupSum` 산술은 정확히 맞는다. 즉 **산술 경로는 존재하고 라벨링·안내가 없다**. 반대로 `REDUCTION_LABELS.public_expropriation.desc`(Step5.tsx:25)는 「§77, 2025+ · 연간 2억」이라고 **§77만 명시**하므로 사용자가 §77의2 이력을 여기에 넣을 유인이 전혀 없고, 사실대로 「해당 없음」으로 두면 과소 집계된다 — 결함 결론은 유지된다.

(2) 실패 시나리오의 수치가 내적으로 모순이다. 저장소 자신의 `buildLimitGroups`(`aggregate-reduction-limits.ts:59-62`)는 2025년 前 §133② 연간 한도를 1억원으로 인코딩하므로, **2023년 §77의2 감면 150,000,000원은 그 전제에서 발생할 수 없다**(단, 2024년 시행본 §133②은 MCP NOT_FOUND라 조문 실독으로는 확인 필요). 도달 가능한 시나리오로 바꾸면:
  2022년 §77의2 100,000,000 · 2023년 §77의3 100,000,000 · 2024년 §77 100,000,000 (실제 직전 4개 과세기간 합계 300,000,000)
  → 입력 가능한 것은 §77 100,000,000뿐 → `priorGroupSum = 100,000,000`, `remaining = 200,000,000`
  → 2026년 §77 감면 200,000,000원 전액 허용. §133②2호상 올바른 값은 `remaining = 0` → 전액 배제.
  **과소납부 200,000,000원.** (원 주장의 50,000,000원보다 오히려 큰 폭이 가능하다.)

(3) 부수 사실 — `Step5.tsx:555-566`의 「현재 화면은 기존 5개 항목만 노출됩니다」 배너는 **stale**이다. 당해연도 감면 선택은 이미 `UnifiedReductionPanel`로 이관돼 §77의2·§77의3을 포함한 확장 조문을 노출한다(`UnifiedReductionPanel.tsx:390-399`). 확장이 안 따라온 것은 **과거 이력 입력 한 곳뿐**이며, 이 비대칭이 결함의 정체다.

(4) 안전망 0건 — `__tests__`·`e2e` 전수 grep 결과 `priorReductionUsage`에 두 유형을 넣는 테스트가 하나도 없다. 수정 시 anchor 선행 필요.

**근거**

조문(KoreanLaw MST 280409, 시행 2026-01-01 실독): 「② 개인이 제77조, 제77조의2 또는 제77조의3에 따라 감면받을 양도소득세액의 합계액 중에서 … 2. 5개 과세기간의 제77조, 제77조의2 또는 제77조의3에 따라 감면받을 양도소득세액의 합계액이 3억원을 초과하는 경우에는 그 초과하는 부분에 상당하는 금액」.

엔진 그룹은 세 조문을 옳게 묶는다 — `aggregate-reduction-limits.ts:65-70`:
```ts
types: ["public_expropriation", "gb_designated_land", "replacement_land_comp"],
annualLimit: involuntary.annual,
fiveYearLimit: involuntary.fiveYear,
```
그리고 과거 이력은 같은 그룹 집합으로 필터된다 — `:254-256` `priorFiltered.filter((r) => group.types.includes(r.type))`.

그런데 입력 스키마 `lib/api/transfer-tax-schema.ts:489-505`의 `type: z.enum([...])`에는 `"self_farming", "long_term_rental", "new_housing", "unsold_housing", "public_expropriation"` + `rental_97_*` + `new_99*` + `unsold_98*`·`unsold_99_2`만 있고 **`gb_designated_land`·`replacement_land_comp`가 없다**(단건 `:512`·다건 `:697` 양쪽이 같은 스키마를 쓴다).
UI 선택지도 5개뿐 — `app/calc/transfer-tax/steps/Step5.tsx:21-28` `REDUCTION_LABELS`(self_farming / long_term_rental / new_housing / unsold_housing / public_expropriation)를 `:498-502`에서 그대로 옵션으로 렌더한다.

⚠️ 완화 요인(정직히 기재): 세 유형이 **같은 그룹**이므로, 사용자가 §77의2 이력을 「공익사업 수용 감면」으로 골라 금액만 맞게 넣으면 산술은 맞다. 즉 「경로 부재」가 아니라 「정확한 라벨의 선택지 부재」다. 그러나 화면 어디에도 그렇게 하라는 안내가 없어 사실대로 「해당 없음」으로 두면 과소 집계된다.

**실패 시나리오**

2023년에 §77의2 대토보상 과세특례로 150,000,000원을 감면받은 납세자가 2026년에 §77 공익수용 감면을 신청. 5년 이력 입력칸에 「대토보상(§77의2)」 항목이 없어 미입력 → `priorGroupSum = 0` → `remaining = 300,000,000` → 당해 감면 200,000,000원 전액 허용. 조특법 §133②2호상 올바른 값: 300,000,000 − 150,000,000 = 150,000,000원까지만 감면 → 50,000,000원이 감면 배제돼야 한다.

**세액 영향**: 위 사례 50,000,000원 과소납부. 일반적으로 「기입할 수 없는 과거 §77의2·§77의3 감면액」만큼 5년 한도가 헐거워진다.

**처방**

`priorReductionUsageSchema`의 `type` enum에 `gb_designated_land`·`replacement_land_comp`를 추가하고(⑫), `Step5.tsx`의 `REDUCTION_LABELS`에 대응 라벨을 추가한다(⑤). `REDUCTION_TYPE_LABELS`(`transfer-reduction-type-labels.ts:32-33`)에 이미 문구가 있으므로 재사용하면 단일 소스가 유지된다. 회귀 anchor: `buildLimitGroups(y)`의 모든 그룹 `types` 합집합 ⊆ `priorReductionUsageSchema` enum 집합.

---

## [D8-05] 조특법 §133③(분할 양도 1개 과세기간 의제) 미구현

- **위치**: `lib/tax-engine/aggregate-reduction-limits.ts:240`
- **조문**: 조특법 §133③
- **유형**: legal-accuracy · **차원**: §133 한도·§127⑦ · **검증**: 생존 1/1

**결함**

조특법 §133③(소급 1년 내 토지 분할 후 일부 양도 → 2년 내 나머지를 동일인·배우자에게 양도 시 1개 과세기간 의제)이 엔진·Zod 스키마·스토어·UI 어디에도 구현돼 있지 않다. §133③은 ①1호·②1호의 **연간 한도**에만 걸리는 의제인데, 연간 한도 함수 `applyAnnualLimits`(aggregate-reduction-limits.ts:107-109)는 과세기간 병합 개념 자체가 없고, `PriorReductionUsageItem`(calc-wizard-asset-reduction.ts:563-568)도 `{year, type, amount}` 3필드뿐이라 「분할 양도·상대방 동일성」을 담을 자리가 없다.

**단, 주장의 세액 영향 수치는 2배 과장이다.** 제시된 시나리오(2025년 §77 감면 2억 → 2026년 2억 재신청)에서 현재 엔진 출력은 「2억 전액 감면」이 아니라 **1억**이다. 이미 구현된 §133②2호 5년 누적 한도 3억이 `applyFiveYearLimits`에서 발화해(priorGroupSum 2억 → remaining 1억) 절반을 잡기 때문이며, 이는 기존 통과 anchor `__tests__/tax-engine/five-year-cumulative-limit.test.ts` F-06가 동일 구조로 단언하고 있다. 따라서 §133③ 미구현에 순수 귀속되는 과다감면은 **200,000,000원이 아니라 100,000,000원**이다(올바른 처리 0원 vs 현재 1억).

또한 「연간 한도는 양도연도만 본다 — applyAnnualLimits는 연도 인자조차 받지 않는다」는 서술은 연도 처리 부재로 오독될 수 있어 정밀화가 필요하다: 연도 의존성은 `buildLimitGroups(transferYear)`(:58-71)가 2025년 §133② 상향(연 2억/5년 3억)으로 반영하고 있으며, §133③이 요구하는 것은 한도 **금액**의 연도 분기가 아니라 서로 다른 과세기간의 양도를 **하나로 병합**하는 의제다.

**근거**

조문(MST 280409 실독): 「③ 제1항제1호 및 제2항제1호를 적용할 때 토지를 분할(해당 토지의 일부를 양도한 날부터 소급하여 1년 이내에 토지를 분할한 경우를 말한다)하여 그 일부를 양도하거나 토지의 지분을 양도한 후 그 양도한 날로부터 2년 이내에 나머지 토지나 그 지분의 전부 또는 일부를 동일인이나 그 배우자에게 양도하는 경우에는 1개 과세기간에 해당 양도가 모두 이루어진 것으로 본다.」

연간 한도는 양도연도만 본다 — `aggregate-reduction-limits.ts:107-128`(`applyAnnualLimits`는 연도 인자조차 받지 않고 그룹 합계에 `Math.min`만 건다), 5년 창은 `:240-244`:
```ts
const minYear = transferYear - 4;
const maxYear = transferYear - 1;
const priorFiltered = priorReductionUsage.filter(
  (r) => r.year >= minYear && r.year <= maxYear && r.amount > 0,
);
```

**부존재 확인(3개 이상 키워드)**: `grep -rn --include="*.ts" --include="*.tsx" -e "133③" -e "133 ③" -e "토지를 분할" -e "landSplit" -e "splitLandWithin" -e "동일인이나 그 배우자" -e "1개 과세기간에 해당 양도가" lib app components` → §133③ 관련 히트 0건(히트된 `landSplitMode`는 소령 §166⑥ 토지·건물 분리 축으로 무관). `priorReductionUsage` 항목에 「분할 양도 여부」 플래그도 없다(`lib/stores/calc-wizard-asset-reduction.ts:564-568`은 `{year, type, amount}` 3필드뿐).

**실패 시나리오**

2025년 6월 토지를 분할(분할일 2025년 3월, 양도일부터 소급 1년 이내)해 그 일부를 甲에게 양도하고 §77 감면 200,000,000원(2025년 한도 2억 소진)을 받은 뒤, 2026년 2월(2년 이내) 나머지를 같은 甲에게 양도하며 §77 감면 200,000,000원을 다시 신청. → 현재 출력: 2026년은 별개 과세기간으로 처리되어 연간 한도 2억이 새로 열려 200,000,000원 전액 감면. → §133③상 올바른 처리: 두 양도를 1개 과세기간으로 보아 합계 400,000,000에 §133②1호 2억 한도를 적용 → 2026년분 감면 0원.

**세액 영향**: 위 사례 200,000,000원 상당의 감면이 과다 적용(양도세 본세 그대로 과소납부). 다만 발현에는 「분할일·상대방·2년 이내」라는 특정 사실관계가 필요하고, 현재는 그 사실을 담을 입력 필드 자체가 없다.

**처방**

단기 처방으로 `priorReductionUsage` 항목에 「§133③ 분할 양도 의제 대상」 boolean을 두고(미해당 선택지 필수), true인 이력은 5년 창 필터가 아니라 **당해 과세기간 그룹 합계에 더해** 연간 한도를 함께 적용한다. 완전 구현은 분할일·양수인 동일성 판정 입력이 필요하므로 별도 축으로 설계할 것. 최소한 현재는 결과 화면에 「§133③ 분할 양도 의제는 미반영」 경고를 남겨 침묵 과소과세를 막아야 한다.

---

## [D9-01] §97의2①1호나목(1999.8.19 이전 신축 미입주 공동주택) 입력 경로 부재 — 시한창이 반대 방향

- **위치**: `lib/tax-engine/transfer-reductions/period-check.ts:51`
- **조문**: 조특법 §97의2①1호나목
- **유형**: reachability · **차원**: 라우터·게이트·도달성 · **검증**: 생존 3/3
- **심각도 조정**: high → medium (검증 결과)

**결함**

§97의2①1호나목(1999.8.19 이전 신축·1999.8.20 현재 미입주 공동주택 건설임대)은 현행 코드에서 어떤 입력으로도 적격이 될 수 없다 — 결함 성립. 다만 서술 3곳을 정정한다.

(1) **「시한창이 반대 방향」은 맞지만, 시한창을 넓히는 것은 오답이다.** [1999-08-20, 2001-12-31]은 가목·2호에 대해서는 정확한 법문이다. 나목은 별개 요건(「공동주택」 + 「1999.8.20 현재 입주 사실 없음」)을 가진 **다른 분기**이므로, 구간을 1999-08-19 이전까지 확장하면 1999.8.20 현재 이미 입주돼 있던 구축 건설임대까지 부당 적격이 된다. 필요한 것은 시한 완화가 아니라 **나목 선언 필드 신설**(공동주택 여부 + 1999.8.20 현재 미입주)과 그에 대응하는 별도 period 분기다. 즉 결함의 성격은 「시한 상수 오류」가 아니라 **호(목) 단위 미구현 + isFullyImplemented:true 오표기**(metadata.ts:108)다.

(2) **「usageApprovalDate는 엔진 경로에서 한 번도 채워지지 않는다」는 과잉 일반화다.** rental-97 dispatch 경로(rental-97-router.ts:52-66)와 UI period-check ctx(UnifiedReductionPanel.tsx:136)에 한해 참이다. §99·§99의3·§98의3·§99의2는 감면-수준 전용 필드(`usageApprovalDate99`·`usageApprovalDate993`·`usageApprovalDate983`·`usageApprovalDate992`)를 route-reductions-mapper.ts:79·117·147·167에서 실제로 채운다. 결론은 바뀌지 않지만(나목의 사용승인일은 정의상 ≤1999-08-19이라 fallback이 채워져도 여전히 구간 밖), 근거 문장은 「rental_97_2 경로에 한해」로 좁혀야 한다.

(3) **결함 범위는 1호나목(건설임대)에 한정된다.** 조문 2호나목(「제1호나목에 해당하는 주택」을 매입임대로 취득)은 1999.8.20~2001.12.31 매매계약이 요건이므로 `contractDate`로 구간 내 판정이 가능하다 — 즉 2호나목 경로는 살아 있다. 「나목 경로 전부가 죽었다」로 읽히지 않게 1호나목으로 명시할 것.

부수 관찰: 동일 구조의 §97①2호(1985.12.31 이전 신축 미입주 공동주택)는 rental-97-main.ts:58에서 「…(2호)은 세무사 확인 필요」라고 **미구현을 실패 사유에 고지**한다. §97의2 나목에는 그 고지가 없어 실패 사유가 「시한 외」로만 뜬다(법령상 부정확한 사유 문구).

**근거**

period-check.ts:51-56 원문: `check: (c) => { const target = c.contractDate ?? c.usageApprovalDate ?? c.acquisitionDate; return within(target, D("1999-08-20"), D("2001-12-31")); }`. 조문 본문(KoreanLaw MST 280409 §97조의2 실독): 「1. … 건설임대주택 가. 1999년 8월 20일부터 2001년 12월 31일까지의 기간 중에 신축된 주택 나. **1999년 8월 19일 이전에 신축된 공동주택으로서 1999년 8월 20일 현재 입주된 사실이 없는 주택**」. 건설임대에는 매매계약이 없어 `contractDate`가 없고, `usageApprovalDate`는 엔진 경로에서 한 번도 채워지지 않는다(rental-97-router.ts:50-66 `buildInput`이 미설정 · UnifiedReductionPanel.tsx:136 `usageApprovalDate: undefined`) → target = acquisitionDate. 입력 폼(components/calc/transfer/rental/Rental972InputForm.tsx:50-67)에도 나목(미입주 공동주택) 선택지·신축일 필드가 없다(`rental972Type`는 construction/purchase 2택). tsx 프로브 실측(scratchpad/probe2.ts, `npx tsx`): 취득(신축)일 1999-06-15·임대개시 1999-09-01·5년+ 임대·국민주택·산출세액 50,000,000 → `evaluateRental972` 및 실경로 `evaluateRental97TaxAmount` 모두 `{isEligible:false, code:"OUT_OF_PERIOD"}`. 대조군(취득 1999-09-01, 가목) → `isEligible:true, reductionAmount 50000000`.

**실패 시나리오**

1999.3월 준공된 미입주 공동주택을 건설임대주택으로 1999.9.1 임대개시하여 20년 임대 후 2024.6.1 양도(국민주택, 산출세액 50,000,000). 현재 출력: §97의2 부적격 사유 「매매계약/신축 시기가 1999.8.20~2001.12.31 시한 외」, 감면세액 0 → 결정세액 50,000,000. 법령상 올바른 출력: §97의2①1호나목 충족 → 양도소득세 면제(감면세액 50,000,000, 결정세액 0).

**세액 영향**: 50,000,000원 과다 (프로브 예시 — 산출세액 전액. 일반적으로 §97의2는 100% 면제라 산출세액 전액)

**처방**

① `PeriodCheckContext`에 §97의2 전용 신축일(사용승인일) 축을 실제로 채우거나(현재 `usageApprovalDate`는 사문), ② 폼에 「1999.8.19 이전 신축 + 1999.8.20 현재 미입주(1호나목)」 3-state 토글을 신설하고 period 규칙을 `가목 창 내 OR 나목선언`으로 분기. 나목 판정은 시한창이 아니라 별도 술어이므로 `check`에서 `true`를 주고 evaluateRental972가 본 요건으로 판정하는 방식(§99의4·§98의9 선례)도 가능.

---

## [D9-03] 임대사업자 등록일 fallback이 취득일로 대체돼 §97의4 라디오가 영구 비활성 + 허위 사유 표시

- **위치**: `components/calc/transfer/UnifiedReductionPanel.tsx:134`
- **조문**: 조특법 §97의4① · 조특령 §97의4②
- **유형**: wiring · **차원**: 라우터·게이트·도달성 · **검증**: 생존 1/1

**결함**

「영구 비활성」은 부정확하다. 정정하면:

**차단 조건**: `asset.acquisitionDate`가 **2014-01-01 이전**이고, 그 시점에 등록일이 채워진 rental_97* 항목이 **하나도 선택돼 있지 않을 때**만 §97의4 토글이 disabled가 된다. 취득일이 2014-01-01 이후이거나 미입력이면 정상 활성(프로브 실측 — 취득 미입력 시 transferDate fallback으로 통과. 기존 E2E가 바로 이 경로만 탄다).

**우회로의 실제 동작**(주장이 "존재"만 언급한 부분의 실측 보정): §97의3/§97의5를 먼저 선택해 등록일(≥2014)을 넣으면 §97의4가 활성화되지만, 클릭 순간 `toggleGroupRadio`(UnifiedReductionPanel-defaults.ts:66-88)가 기존 항목을 제거하고 `getReductionDefault("rental_97_4")`로 `registrationDate: ""`를 넣으므로 컨텍스트가 즉시 취득일로 되돌아가 **선택된 채로 다시 disabled**가 된다. 이때 children은 `ToggleCard.tsx:303`에 의해 계속 렌더되므로 등록일 재입력으로 복구는 가능하나, 복구 전에는 `onCheckedChange`가 `isDisabled`로 막혀 **해제도 불가능한 stuck 상태**가 되고, `lib/calc/transfer-tax-validate-reductions.ts:168`이 등록일 미입력을 차단하므로 계산 자체가 막힌다. 즉 "완전 차단은 아니다"가 맞지만, 우회 경로는 stuck 구간을 지나야 한다.

**조문 근거(주장의 「확인 필요」를 확정)**: 조특법 §97의4 전문·조특령 §97의4 전문·조특령 §97⑤(준용 대상)를 실독한 결과 **등록일 기준 시한 규정이 존재하지 않는다**. 따라서 `period-check.ts:64-68`의 「registrationDate ≥ 2014-01-01」 자체가 조문 시행일을 요건으로 오전사했을 가능성이 크며(부칙 제12173호 본문 미확보 — 확인 필요), 이는 UI 결함과 별개로 **엔진(rental-97-4.ts:56-60)에도 작용하는 독립 결함**으로 별건 등록이 필요하다. 이 별건이 성립하면 D9-03의 fallback 문제는 그 규칙이 살아 있는 동안의 UI 증상에 해당한다.

**근거**

UnifiedReductionPanel.tsx:134 원문: `registrationDate: rentalReg ?? acqDate ?? transDate,` (`rentalReg`는 :126-127에서 **이미 선택된** rental_97* 감면의 값에서만 나온다 — 닭-달걀). period-check.ts:64-68 원문: `check: (c) => c.registrationDate !== undefined && c.registrationDate >= D("2014-01-01"), failReason: "임대 등록일이 2014.1.1 이전 — 조특법 §97의4 적용 시한 외"`. 소비 지점 UnifiedReductionPanel.tsx:598 `const isDisabled = !housingAllowed || !period.inPeriod || !isFullyImplemented;` + :625-632 `onCheckedChange={() => { if (!isDisabled) onSelectId(id); }}` `disabled={isDisabled}` → 선택 자체가 차단. tsx 프로브 실측(scratchpad/probe1.ts, buildPeriodContext 재현): 취득 2010-05-01/양도 2024-06-01 → 97의4 inPeriod=false · 취득 2013-12-31 → false · 취득 2014-01-01 → true · 취득 미입력 → true. 신규 폼 기본값은 `registrationDate: ""`(UnifiedReductionPanel-defaults.ts:96 `RENTAL_COMMON_DEFAULTS`)라 §97의4를 선택해도 컨텍스트가 다시 취득일로 되돌아간다. 참고(확인 필요): 조특법 §97의4 본문·조특령 §97의4 전문(KoreanLaw MST 280409·287181 실독)에는 **등록일 기준 시한 규정 자체가 없다** — 2014.1.1의 근거는 신설 부칙으로 추정되나 MCP로 부칙 본문을 확보하지 못했다.

**실패 시나리오**

2010.5.1 취득한 주택을 2016.3.1 임대사업자 등록하고 10년 임대 후 2024.6.1 양도(양도차익 500,000,000). 현재 출력: 감면 패널에서 「§97의4 — 장특공제 추가율」 항목이 회색으로 잠기고 사유는 「⚠ 임대 등록일이 2014.1.1 이전 — 조특법 §97의4 적용 시한 외」(사용자는 등록일을 입력한 적조차 없다). 결과적으로 장기보유특별공제 추가율 10%(=50,000,000)가 반영되지 않는다. 올바른 동작: 등록일이 미입력이면 항목을 잠그지 말고(다른 22개 규칙과 동일한 낙관 통과) 등록일 입력 후 판정하거나, 등록일 입력란을 항목 밖에 먼저 두어야 한다.

**세액 영향**: 장기보유특별공제 50,000,000원 미반영(양도차익 5억·10년 임대·추가율 10% 기준). 우회로(§97의3을 먼저 선택→등록일 입력→§97의4로 전환)가 존재하므로 완전 차단은 아니다 — 세액 증분은 과세표준 구간에 따라 달라 미측정.

**처방**

`buildPeriodContext`에서 `registrationDate`의 취득일 fallback을 제거하고(취득일은 등록일과 다른 사실), `period-check.ts` `rental_97_4` 규칙을 다른 조문과 동일하게 「미입력이면 낙관 통과」로 바꾼 뒤 본 판정은 `evaluateRental974`(이미 `MISSING_REGISTRATION_DATE`를 보유)에 맡긴다.

---


# ⚪ Low (23건)

## [CA-06] §98 미분양 국민주택 판정에서 조특령 §98①1호 괄호의 「민간임대주택·공공임대주택 제외」를 검증하지 않는다

- **위치**: `lib/tax-engine/transfer-reductions/unsold-hybrid-p5.ts:126`
- **조문**: 조특령 §98①1호 (법 §98①·③)
- **유형**: legal-accuracy · **차원**: 누락점검(조문축) · **검증**: 생존 1/1

**결함**

§98 미분양 국민주택 판정에서 조특령 §98①1호 괄호의 「민간임대주택·공공임대주택 제외」가 **UI 확인 토글 설명으로 고지되기만 하고 엔진 배제사유로는 검증되지 않는다**.

정정 내역 두 가지:

1. **「언급이 없다」는 부정확하다.** `components/calc/transfer/Unsold98InputForm.tsx:46`이 `description="국민주택규모 이하의 주택 (조특령 §98①·⑤ — 민간·공공임대주택 제외)"`로 사용자에게 고지하고 있고(`UnifiedReductionPanel.tsx:47`·`:770`으로 실제 배선), `docs/02-design/features/transfer-remaining-p5.engine.design.md:10`에도 요건으로 기재돼 있다. 따라서 「제외를 인지하지 못한 누락」이 아니라 「전용 필드 없이 기존 확인 토글에 접은 문서화된 설계 결정」이다.

2. **실질 결함은 두 가지로 좁혀진다.**
   (a) 5단 파이프라인 전 계층(①`calc-wizard-asset-reduction.ts:325-334` / ④`transfer-tax-api-reductions.ts:317-326` / ⑫`transfer-tax-schema-reductions.ts:230-239` / stub `transfer-reductions-stub.types.ts:141-149` / 엔진 `unsold-hybrid-p5.ts:41-58`)에 제외 필드가 없어 엔진이 이 요건을 차단하지 못한다. 같은 저장소의 §97의3은 동일 성격의 「본문 괄호 제외」를 전용 필드 `isConvertedFromShortTerm` + 독립 배제사유 `CONVERTED_FROM_SHORT_TERM`으로 처리한다(`rental-97-3.ts:85-92`) — §98만 이 관례에서 이탈해 있다.
   (b) 고지 위치가 조문 구조와 어긋난다. 제외 괄호는 령 §98①**1호**(사업계획승인 주택 정의)에 붙어 있고 코드가 1호에 대응시킨 토글은 `isUnsoldConfirmed`(`unsold-hybrid-p5.ts:125-131`)인데, 고지는 `isNationalScale` 토글(:46)에 붙어 있다.

보충(제보에 없던 확인): ⑤1호 본문에는 괄호가 없으나 ①1호 말미의 「이하 이 조에서 같다」가 조 전체에 미치므로 제외는 ③항 트랙(1998.3.1~12.31 취득분)에도 동일하게 적용된다. UI 문구가 「§98①·⑤」로 양 트랙을 함께 적은 것은 이 점에서 타당하다.

**근거**

조특령 §98①(MST 287181 실독): 「…다음 각호의 요건을 모두 갖춘 국민주택규모이하의 주택으로서 서울특별시외의 지역에 소재하는 것을 말한다. 1. 「주택법」에 의하여 사업계획승인을 얻어 건설하는 주택(「민간임대주택에 관한 특별법」 제2조에 따른 민간임대주택과 「공공주택 특별법」제2조제1호가목에 따른 공공임대주택을 제외한다. 이하 이 조에서 같다)으로서 … 시장ㆍ군수 또는 구청장이 1995년 10월 31일 현재 미분양주택임을 확인한 주택 2. 주택건설사업자로부터 최초로 분양받은 주택으로서 당해 주택이 완공된 후 다른 자가 입주한 사실이 없는 주택」. 코드 unsold-hybrid-p5.ts:125-131은 `isUnsoldConfirmed`(1호 확인) 한 필드만 보고, 메시지도 「시장·군수·구청장이 … 미분양주택임을 확인한 주택이 아닙니다」로 괄호 제외를 언급하지 않는다. `Unsold98Input`(:41-58) 전 필드를 확인했으나 임대주택 제외 여부 필드가 없고, 매핑부 `evaluateP5FromReduction`(:176-190)도 6개 필드만 넘긴다. 참고로 §98의 나머지(거주자·1995.11.1~1997.12.31 / 1998.3.1~12.31 2트랙·5년 보유·국민주택규모·서울 외·최초분양 미입주·①1호 20% 단일세율)는 법 §98①·③ 및 령 §98①·⑤와 일치함을 확인했다.

**실패 시나리오**

1996-05-01에 민간임대주택으로 사업계획승인을 받아 건설된 서울 외 국민주택규모 주택을 취득해 5년 이상 보유·임대 후 양도하면서, 「시장·군수 미분양 확인」·「최초 분양+미입주」 토글을 모두 켜는 경우. → 현재 코드: §98 적격 → `forceFlatRate20`으로 세율이 20% 단일로 대체된다(과세표준 5억이면 누진 세율 대비 산출세액이 크게 줄어든다). → 조문상: 령 §98①1호 괄호에 따라 민간임대주택은 「대통령령으로 정하는 미분양 국민주택」에서 제외되므로 §98 적용 불가 → 소득세법 §104① 일반세율 적용.

**세액 영향**: 세액 영향 있음(세율 대체) — 다만 취득기간이 1998-12-31로 닫혀 있어 실무 발생 빈도는 낮다. 과세표준 500,000,000원 기준 20% 단일세율 100,000,000원 vs 기본 누진세율 174,060,000원 → 최대 74,060,000원 과소.

**처방**

`Unsold98Input`에 `isNotRentalHousing98`(민간임대주택·공공임대주택이 아님 확인) boolean을 추가하고 ⑫Zod·④변환·⑤UI까지 14지점을 동기화한다. 최소 조치로는 `isUnsoldConfirmed`의 안내 문구에 괄호 제외(민간임대주택·공공임대주택 제외)를 명시해 사용자가 오인 체크하지 않게 한다.

---

## [CB-08] 파일 크기 정책(hard cap 800줄) 위반 18파일 — 감면 축 3파일 포함

- **위치**: `lib/tax-engine/transfer-tax-exemption.ts:858`
- **조문**: 해당 없음 (저장소 CLAUDE.md File Size Policy)
- **유형**: test-gap · **차원**: 누락점검(배관축) · **검증**: 생존 1/1

**결함**

파일 크기 정책(트리거 800줄) 초과 파일은 전 저장소 기준 19개이며, 이 중 `CLAUDE.md:299`가 명시적으로 면제한 「타입 전용 파일」 5건(런타임 선언 0개 실측: inheritance-gift-estate.types.ts 1136 · stock-transfer.types.ts 1116 · transfer.types.ts 1080 · transfer-redevelopment.types.ts 888 · transfer-mixed-use.types.ts 812 — 목록 상위 4건이 전부 여기 해당)을 제외하면 **실제 정책 대상은 14개**다(주장의 18개가 아니며, 주장이 스캔에서 빠뜨린 `e2e/gift-burdened-transfer.spec.ts` 834가 추가된다).

이 중 본 리뷰의 감면 축 인접 파일 3건은 실제로 초과 상태다 — `lib/tax-engine/transfer-tax-exemption.ts` 858(런타임 선언 30) · `lib/tax-engine/transfer-tax.ts` 804(1) · `lib/api/transfer-tax-schema-sub.ts` 801(25). 셋 다 타입 전용 예외에 해당하지 않는다. 위험구간(750~799) 4건도 실측 일치: transfer-tax-split-gain.ts 799 · transfer-tax-validate-asset.ts 775 · transfer-tax-api.ts 757 · transfer-tax-api-helpers.ts 752.

단, 「hard cap」은 차단 게이트가 아니다 — `eslint.config.mjs`에 `max-lines` 규칙이 없고, `.husky/pre-push`·CI 워크플로 어디에도 행수 검사가 없다. 유일한 장치인 `.claude/settings.json`의 PostToolUse hook은 `additionalContext` 안내문만 출력하는 **비차단 권고**다. 또한 `CLAUDE.md:296`이 `transfer-tax.ts`의 801줄 재초과를 이미 기록된 실례로 명시하고 `CLAUDE.md:301`이 수정 PR에서의 기회주의적 동시 분리를 권장하므로, 「분리 전용 PR이 얽힌다」는 문제가 아니라 정책이 처방한 해법이다.

**근거**

실측 출력(내림차순, 단위 줄): inheritance-gift-estate.types.ts 1136 · stock-transfer.types.ts 1116 · transfer.types.ts 1080 · transfer-redevelopment.types.ts 888 · **transfer-tax-exemption.ts 858** · building-std-price-form.ts 857 · calc-wizard-asset-migrate.ts 842 · inheritance-tax.ts 831 · ResultPdfDocument.tsx 827 · stock-transfer-tax-api.ts 825 · building-standard-price-helpers.ts 823 · BundledAllocationCard.tsx 820 · calc-wizard-asset.ts 817 · inheritance-deductions.ts 815 · transfer-mixed-use.types.ts 812 · **transfer-tax.ts 804** · BuildingStdPriceForm.tsx 803 · **transfer-tax-schema-sub.ts 801**.
감면 축 인접 파일은 위험구간(750~800)에도 여럿 있다 — transfer-tax-split-gain.ts 799 · transfer-tax-validate-asset.ts 775 · transfer-tax-api.ts 757 · transfer-tax-api-helpers.ts 752.

**실패 시나리오**

본 리뷰의 CB-05(겸용 인자 3개 추가)·CB-06(컴패니언 3필드 추가)·CB-03(감면율 반영) 수정은 모두 `transfer-tax.ts`(804)·`transfer-tax-schema-sub.ts`(801)·`transfer-tax-exemption.ts`(858) 인접 영역을 건드린다. 이미 cap을 넘긴 상태라 PostToolUse hook이 매 수정마다 경고를 내고, 분리 전용 PR이 수정 PR과 얽힌다.

**세액 영향**: 세액 무영향 — 표시/인용

**처방**

타입 전용 파일 5개(*.types.ts 1136·1116·1080·888·812)는 CLAUDE.md의 「타입 전용 파일 예외」에 해당하므로 별도 판단 대상이다. 로직 파일 중 감면 작업 경로에 있는 `transfer-tax-exemption.ts`(858)·`transfer-tax.ts`(804)·`transfer-tax-schema-sub.ts`(801)를 기회주의적으로 먼저 분리해 ≤700에 착지시킨다(자연 이음매: exemption은 rules/evaluator/step, schema-sub는 이미 reductions를 뗀 전례가 있다).

---

## [CB-09] asset-kind-gate 헤더 주석이 「§97 시한 게이트가 재개발을 이미 차단한다」고 단정하나 §97의3은 2027-12-31까지 열려 있다

- **위치**: `lib/tax-engine/transfer-reductions/asset-kind-gate.ts:12`
- **조문**: 조특법 §97의3① (등록 시한 2027.12.31) · 조특령 §97의3② 후단
- **유형**: citation · **차원**: 누락점검(배관축) · **검증**: 생존 1/1

**결함**

`lib/tax-engine/transfer-reductions/asset-kind-gate.ts:12-14`의 헤더 주석은 **전제와 근거가 둘 다 낡았다**(세액 영향 0 · 문서 결함).

(1) **근거 오류** — 「§97 시리즈는 임대개시·등록 시한이 재개발·재건축 시나리오를 시한 게이트에서 이미 차단한다」는 사실과 반대다. `period-check.ts:59-63` `rental_97_3`은 `before(registrationDate, D("2027-12-31"))`로 2027-12-31 **이하 등록이면 통과**시키고, `:64-67` `rental_97_4`는 `registrationDate >= D("2014-01-01")`로 **상한이 없다**. 다섯 시한 중 **둘이 열려 있다**(주석은 §97의4를 언급조차 하지 않는다). 조특법 §97의3①은 「2027년 12월 31일까지 등록」을 명시하고, 조특령 §97의3② 후단은 「재개발사업ㆍ재건축사업 … 의 시행으로 임대할 수 없는 경우에는 … 관리처분계획 인가일 전 6개월부터 준공일 후 6개월까지 … 계속하여 임대한 것으로 보되, 임대기간 계산 시에는 실제 임대기간만 포함한다」라 하여 재개발 시나리오를 **명시적으로 포섭**한다.

(2) **전제 폐지(제보 미지적)** — 주석이 논하는 `redevelopment_apt + redevSubject==="right"` 조합은 **2026-08-13 축 일원화(PR #1245)로 정상 경로에서 사라졌다**. `calc-wizard-asset-migrate.ts:583-588`이 그 조합을 `right_to_move_in`으로 승격시키고 이후 `redevSubject`를 `assetKind`에서 파생하며, `transfer-tax-api.ts:303-309`가 「종전 모델은 폐지됐다 … 정상 경로에서는 도달하지 않는다」고 적고 있다.

(3) **동작은 정상** — `RENTAL_HOUSING_KINDS = {housing, redevelopment_apt}`(`:35`)는 축 일원화 후 의미상 정확하고(완공 APT는 임대 가능, 입주권 `right_to_move_in`은 제외), `reduction-asset-kind-gate.test.ts` 8건이 통과한다. 주석의 **결론**(redevSubject 수준 분기 미도입)은 여전히 옳다 — 다만 이유가 「시한이 막아서」가 아니라 「축이 폐지돼 분기 대상이 없어서」다.

⇒ 처방: 주석의 ⚠ 문단을 「축 일원화로 `redevelopment_apt`는 완공 APT 전담이므로 임대 가능하고, 입주권은 별도 `assetKind`로 갈려 이미 배제된다」로 교체하고, 사실과 반대인 「시한 게이트가 이미 차단」 근거는 삭제한다. §97의3의 재개발 임대기간 의제(조특령 §97의3② 후단)는 오히려 `redevelopment_apt`에 §97의3이 **적용될 수 있음**을 뒷받침하므로, 그 경로의 도달성(CB-02: `evaluateRental97Lthd` 호출부가 `transfer-tax-lthd.ts:403` 하나뿐이고 재개발 경로는 `transfer-tax-redevelopment.ts:269`에 따라 그 경로를 타지 않음)은 이 주석을 근거로 종결하지 말 것.

**근거**

asset-kind-gate.ts:12-14 원문 — `* ⚠ redevelopment_apt + §97: redevSubject==="right"(입주권)이면 임대 불가지만, §97 시리즈는 임대개시·등록 시한(~2000.12.31 / ~2018 / ~2027)이 재개발·재건축 시나리오를 시한 게이트에서 이미 차단하므로 redevSubject 수준 분기는 도입하지 않는다 (실효 없는 복잡도).`
반증 ①: period-check.ts:59-63 `rental_97_3: { label: "장기일반민간임대 등록 ~2027.12.31", check: (c) => before(c.registrationDate, D("2027-12-31")), ... }` — 2027-12-31 **이전** 등록이면 통과한다. 차단이 아니라 개방이다.
반증 ②: 조특법 §97의3①(KoreanLaw MST 280409 실독) — 「…장기일반민간임대주택을 **2027년 12월 31일까지 등록**…한 후 다음 각 호의 요건을 모두 갖추어 그 주택을 양도하는 경우 … 100분의 70의 공제율을 적용한다」.
반증 ③: 조특령 §97의3②(MST 287181 실독) 후단 — 「이 경우 「도시 및 주거환경정비법」에 따른 **재개발사업ㆍ재건축사업** … 의 시행으로 임대할 수 없는 경우에는 해당 주택의 관리처분계획 인가일 … 전 6개월부터 준공일 후 6개월까지의 기간 동안 계속하여 임대한 것으로 보되…」 — 조문이 재개발 시나리오를 명시적으로 포섭한다.

**실패 시나리오**

후속 작업자가 `redevelopment_apt` + §97의3 조합의 도달성을 점검하려다 이 주석을 읽고 「시한 게이트가 이미 막는다」고 판단해 조사를 중단한다. 실제로는 2027-12-31 이전 등록이면 ⑤·⑧을 통과해 payload에 실리고, 재개발 분기가 `evaluateRental97Lthd`를 부르지 않아 세액 반영이 0이 된다(CB-02).

**세액 영향**: 세액 무영향 — 표시/인용 (다만 CB-02의 오판 원인이 된다)

**처방**

주석을 실측에 맞게 정정한다: 「§97① 본문·단서(임대개시 ~2000.12.31)와 §97의5(취득 ~2018.12.31)는 시한이 재개발 시나리오를 사실상 차단하지만, **§97의3(등록 ~2027.12.31)·§97의4는 열려 있다**. 다만 재개발 분기(`transfer-tax-redevelopment.ts`)가 STEP 4를 건너뛰어 두 조문이 세액에 반영되지 않는다 — CB-02 참조」. 주석만 고치고 코드를 그대로 두면 침묵은 남으므로 CB-02의 경고 push와 같은 PR에서 처리할 것.

---

## [D1-04] 레거시 장기임대 엔진이 §97의 임대개시 시한(2000.12.31)·신축연도 요건을 전혀 보지 않고 100% 면제

- **위치**: `lib/tax-engine/rental-housing-reduction.ts:284`
- **조문**: 조특법 §97①(각 호 및 「2000년 12월 31일 이전에 임대를 개시하여」)
- **유형**: legal-accuracy · **차원**: §97·§97의2 장기임대 · **검증**: 생존 2/3
- **심각도 조정**: high → low (검증 결과)

**결함**

레거시 장기임대 엔진(`lib/tax-engine/rental-housing-reduction.ts`)의 `public_construction` 분기(:283-284)가 조특법 §97① 본문의 임대개시 시한(2000.12.31)과 각 호의 신축연도 요건(1호 1986.1.1~2000.12.31 신축 / 2호 1985.12.31 이전 신축 미입주 공동주택)을 한 번도 검사하지 않고, 5년 임대만으로 감면율 1.0(§97① 단서 면제)을 부여한다. 파일 전체에 `constructionYear` 필드도 2000.12.31 경계 상수도 존재하지 않는다(grep 0건). 감면율 1.0 자체는 §97① 단서(건설임대주택 5년 이상 → 면제)와 일치하지만, 단서는 본문 요건과 각 호를 면제하지 않으므로 시한·신축연도 미검사는 조문 위반이다.

단, **도달 경로는 마법사 UI가 아니라 공개 API 직접 호출뿐이다** — `rentalReductionDetails`를 조립하는 클라이언트 코드는 0건이며(저장소 자신이 `lib/calc/transfer-tax-validate-usage-conversion.ts:98`에 명시), UI의 §97 입력은 `Rental97MainInputForm.tsx` → `reductions[]` → `transfer-reductions/rental-97-main.ts`로 흐르고 그쪽은 시한(period-check.ts:40-47)과 신축연도(rental-97-main.ts:24-25, :52-62)를 **정상 검사한다**. 따라서 이 건의 성격은 「§97 요건 미구현」이 아니라 **정답을 구현한 sibling이 존재하는 상태에서 레거시 병행 경로가 공개 API에 노출된 채 잔존**하는 것이고, 처방은 레거시 `public_construction` 분기의 폐지(또는 `rental-97-main` 위임) 및 그 동작을 고정 중인 `__tests__/tax-engine/rental-housing-reduction.test.ts:718-733`의 갱신이다. 같은 스위치의 `public_purchase`(:285-286, mandatoryYears 0 + rate 1.0)도 동일 성격의 더 넓은 노출이다.

**근거**

파일 헤더 :4-8 「조세특례제한법: §97 공공건설임대주택 …」. `determineMandatoryPeriod` :283-284 `case "public_construction": return { mandatoryYears: 5, reductionRate: 1.0, longTermDeductionRate: 0 };`. `calculateRentalReduction`(:392-502)의 Step 1~5는 등록(:409·:416)·아파트 제한(:425)·기준시가(:438)·의무임대기간(:469)·임대료 증액(:478)뿐 — 파일 전체에 `constructionYear`도, 2000.12.31 경계 상수도 없다(경계 상수는 :122-124의 2018·2020 세 개뿐). 도달 경로: `transfer-tax-reductions-calc.ts:104-106` `if (rentalReductionDetails) { … calculateRentalReduction(detailsWithTax, longTermRentalRules) }` ← Zod `rentalReductionDetailsSchema`(lib/api/transfer-tax-schema-sub.ts:141-155, 신축연도·시한 필드 없음) ← `app/api/calc/transfer/engine-input.ts:211-217`. 기존 테스트가 이 동작을 고정한다 — `__tests__/tax-engine/rental-housing-reduction.test.ts:718-733`: `rentalHousingType: "public_construction", rentalStartDate: new Date("2015-01-01"), transferDate: new Date("2021-01-01"), calculatedTax: 300_000_000` → `expect(result.reductionAmount).toBe(200_000_000)`. 조문 실독(조특법 MST 280409 제97조①): 「…국민주택…을 2000년 12월 31일 이전에 임대를 개시하여 5년 이상 임대한 후 양도하는 경우」 + 1호 「1986년 1월 1일부터 2000년 12월 31일까지의 기간 중 신축된 주택」.

**실패 시나리오**

입력(API `rentalReductionDetails`): isRegisteredLandlord true, isTaxRegistered true, rentalHousingType "public_construction", region "capital", officialPriceAtStart 200,000,000, rentalStartDate 2015-01-01, transferDate 2021-01-01, 산출세액 300,000,000. 현재 출력: isEligible true, reductionRate 1.0 → 200,000,000 감면(§133 한도까지 먹은 뒤 값. D1-05 참조). 조문상 올바른 출력: 임대개시가 2000.12.31 이후이고 1986~2000 신축분도 아니므로 §97 감면 0원.

**세액 영향**: 산출세액 300,000,000 기준 200,000,000 과다감면(D1-05를 고치면 300,000,000)

**처방**

레거시 경로에도 `checkReductionPeriod("rental_97_main"/"rental_97_proviso", …)`와 신축연도 요건을 태우거나, `rentalReductionDetails` 입력 자체를 §97 계열에 대해 폐지하고 `transfer-reductions/rental-97-*` 단일 경로로 수렴시킬 것. 기존 테스트 :718-733은 조문 정합으로 갱신되어야 한다(anchor 갱신은 법령 정합 우선).

---

## [D1-10] §97의2 시한 판정의 `usageApprovalDate` fallback이 배선되지 않아 항상 취득일로 판정된다 (1호나목은 구조적 배제)

- **위치**: `lib/tax-engine/transfer-reductions/period-check.ts:54`
- **조문**: 조특법 §97의2①1호 가목·나목
- **유형**: wiring · **차원**: §97·§97의2 장기임대 · **검증**: 생존 1/1

**결함**

§97의2 시한 판정에 **1호나목(1999.8.19 이전 신축 공동주택으로 1999.8.20 현재 미입주) 축이 없어 그 사안은 어떤 입력으로도 감면을 받을 수 없다** (`period-check.ts:51-56` — 단일 창 1999-08-20~2001-12-31만 허용). 1호는 건설임대라 `contractDate`가 없고, 자기건설 취득시기는 소령 §162①4호상 사용승인서 교부일이라 `acquisitionDate` ≤ 1999-08-19 → `within()` 항상 false(probe 실측). UI 라디오(`components/calc/transfer/rental/Rental972InputForm.tsx:56-60`)·store(`calc-wizard-asset-reduction.ts:216`)·Zod(`transfer-tax-schema-reductions.ts:120`) 모두 `construction | purchase` 2지선다로 가목/나목을 구별하지 않는다.

정정 1 — **`usageApprovalDate` fallback 미배선은 세액 영향 0**이다. 소령 §162①4호에 의해 자기건설 건축물의 `acquisitionDate`가 이미 사용승인일이므로 fallback은 중복 경로(dead code)다. 정정 2 — **fallback 배선은 이 결함의 처방이 아니다**: 사용승인일을 넣어도 나목은 1999-08-19 이전이라 창 밖이다. 처방은 1호에 가목/나목 축을 추가하고 나목 선택 시 시한 검증을 「1999-08-19 이전 신축 + 1999-08-20 현재 미입주」로 대체하는 것이다. 정정 3 — 「항상 취득일로 판정된다」는 틀렸다. `contractDate`는 `transfer-tax-reductions-calc.ts:126` → `rental-97-router.ts:55`로 정상 배선돼 최우선 적용되며 2호 판정을 담당한다. 정정 4 — **2호나목은 배제되지 않는다**(매매계약일이 창 안이면 통과) — 배제 범위는 1호나목 단일 분기다.

**근거**

`period-check.ts:53-55` `// 자기건설(1호): 사용승인일 fallback` / `const target = c.contractDate ?? c.usageApprovalDate ?? c.acquisitionDate;`. 그러나 `rental-97-router.ts:50-93` `buildInput`은 `contractDate: ctx.contractDate`·`acquisitionDate: ctx.acquisitionDate`만 넣고 `usageApprovalDate`를 넣지 않으며, `Rental97EngineContext`(:24-34)에도 그 키가 없다. Zod(`lib/api/transfer-tax-schema-reductions.ts:117-123`)·폼(`lib/stores/calc-wizard-asset-reduction.ts:214-218`)·UI(`Rental972InputForm.tsx`)에도 사용승인일 입력이 없다 — 반면 §99·§99의3·§98의3·§99의2는 `usageApprovalDate99/993/983/992`가 폼·validate·④API에 모두 배선돼 있다(`lib/calc/transfer-tax-api-reductions.ts:129·272·367·494`). 1호나목 조문 실독(조특법 MST 280409 제97조의2①1호나목): 「1999년 8월 19일 이전에 신축된 공동주택으로서 1999년 8월 20일 현재 입주된 사실이 없는 주택」 — 신축·취득 시점이 창(1999-08-20~2001-12-31) 앞이므로 `within()`이 항상 false다.

**실패 시나리오**

입력: §97의2 1호나목 건설임대(1999-05-10 신축 공동주택, 1999.8.20 현재 미입주), 취득일 1999-05-10, 임대개시 1999-09-01, 양도 2005-09-01, 국민주택, 산출세액 50,000,000. 현재 출력: `contractDate`·`usageApprovalDate` 모두 undefined → `acquisitionDate` 1999-05-10 이 창 밖 → `OUT_OF_PERIOD` → 감면 0원. 조문상 올바른 출력: §97의2①1호나목 충족 → 양도소득세 면제 50,000,000.

**세액 영향**: 산출세액 50,000,000 기준 50,000,000 과소감면(1호나목 사안)

**처방**

§97의2 variant에 사용승인일(신축일)과 「1999.8.20 현재 미입주 공동주택(1호나목)」 확인 필드를 추가해 14지점을 배선하고, `Rental97EngineContext`·`buildInput`에 `usageApprovalDate`를 전달. 1호나목 선택 시에는 창 검사를 우회하고 나목 고유 요건으로 판정.

---

## [D10-06] §97의4 결합 공제율의 부동소수 오차로 장특공제가 1원 부족해진다

- **위치**: `lib/tax-engine/transfer-tax-lthd.ts:443`
- **조문**: 조특법 §97의4 · 소득세법 §95②
- **유형**: arithmetic · **차원**: 효과축·정수연산·농특세 · **검증**: 생존 1/1

**결함**

§97의4 추가공제율 가산이 `rate + additionalRate`를 IEEE754 double로 더한 뒤 `applyRate`(=`Math.floor(amount * rate)`)에 그대로 넘겨, 합이 의도 공제율보다 1 ulp 작아지는 조합에서 장기보유특별공제액이 **1원 과소**산정된다(납세자 불리).

원 주장에서 두 곳을 정정한다.

**정정 1 — 「반대 방향(1원 과다공제)도 발생한다」는 성립하지 않는다.** 상향 드리프트 조합(예: 보유 10년 0.20+0.10 = 0.30000000000000004, 보유 14년 0.28+0.02 = 0.30000000000000004)은 곱한 결과가 정수의 *위쪽*으로만 1 ulp 밀리므로 `Math.floor`가 변하지 않는다. 상향 8조합 × 양도차익 1~2,000,000 전수 스캔(1,600만 케이스)에서 과다공제 **0건**. 결함은 **단방향(납세자 불리)** 이다.

**정정 2 — 영향 조합을 실측 목록으로 확정.** 표1 기준 하향 드리프트는 5조합뿐이다: 보유 6년+2%(0.13999999999999999) · **보유 9년+2%(0.19999999999999998)** · 보유 12년+4%(0.27999999999999997) · 보유 12년+10%(0.33999999999999997) · 보유 15년 이상+4%(0.33999999999999997). 각 조합은 「양도차익 × 의도 공제율」이 정확히 정수일 때만 1원이 빠진다(20%면 양도차익이 5의 배수, 14%·34%면 50의 배수, 28%면 25의 배수).

**추가 발견(주장 범위 밖 — 같은 결함 클래스)**: 이 float 가산 문제는 §97의4 전용이 아니다. 표2 일반 경로도 `calcLongTermRate`가 `holdingPart + residencePart`(각 `Math.min(y * 0.04, 0.40)`)를 double로 더해 `transfer-tax-lthd.ts:462 applyRate(taxableGain, rate)`에 넘긴다. 실측 결과 (보유 9년 + 거주 1년 = 0.39999999999999997) · (보유 8년 + 거주 9년 = 0.6799999999999999) · (보유 9년 + 거주 8년 = 0.6799999999999999) 세 조합에서 동일한 1원 과소가 난다. **1세대1주택 표2는 §97의4보다 훨씬 흔한 경로**이므로, 수정한다면 443행 국소 패치가 아니라 「공제율 합산 → 적용」 지점 공통으로 `applyRateFraction(gain, Math.round(rate * 10000), 10000)` 계열(이미 tax-utils.ts:181에 존재)로 통일하는 편이 맞다.

**근거**

transfer-tax-lthd.ts:443-444 `const combined = rate + rental97Eval.additionalRate;` / `const combinedDeduction = applyRate(taxableGain, combined);` 이고 `applyRate`는 `lib/tax-engine/tax-utils.ts:49-51` `return Math.floor(amount * rate);` 다. base rate는 `transfer-tax-mixed-use-inheritance.ts:46` `Math.min(holdingYears * 0.02, 0.30)`.

실측(scratchpad vitest 프로브 — 취득 2013-01-15 / 양도 2022-02-01(보유 9년 → 표1 18%) / 임대개시 2015-06-01(임대 6년 → 추가 2%) / 과세대상 양도차익 1,000,000,000):
```
rentalStart 2015-06-01 | taxableGain 1000000000 | LTHD 199999999 | baseRate 0.18 add 0.02 | combined 0.19999999999999998
rentalStart 2014-02-01 | taxableGain 1000000000 | LTHD 240000000 | baseRate 0.18 add 0.06 | combined 0.24
```
동일 산식의 다른 조합 스캔(node): `0.12+0.02=0.13999999999999999`, `0.24+0.04=0.27999999999999997`, `0.24+0.10=0.33999999999999997`, `0.30+0.04=0.33999999999999997` 도 의도값보다 작다(반대로 `0.20+0.10=0.30000000000000004`는 커서 1원 과다 방향).

**실패 시나리오**

보유 9년(표1 18%) + 임대 6년(§97의4 추가 2%), 과세대상 양도차익 10억 → 현재 장기보유특별공제 199,999,999원. 조문상 20% = 200,000,000원. 1원 부족분이 양도소득금액·과세표준에 그대로 얹힌다.

**세액 영향**: 1원 (공제 과소 → 세액 과다). 조합에 따라 반대 방향(1원 과다공제)도 발생한다.

**처방**

율 덧셈을 정수 배율로 처리한다 — 예: `applyRateFraction(gain, Math.round((rate + additionalRate) * 1_000_000), 1_000_000)`(같은 파일 :378이 이미 쓰는 패턴) 또는 `Math.round(combined * 100) / 100`으로 정규화한 뒤 `applyRate`. 같은 뿌리가 표2 보유+거주 합산(`calcLongTermRate` :44 `holdingPart + residencePart`, 예 `0.28+0.40` 계열)에도 있다.

---

## [D11-07] 다건 감면 차단 문구가 코드와 어긋남 — 「차감이 반영되지 않습니다」는 사실과 다르다

- **위치**: `lib/calc/multi-transfer-tax-validate.ts:108`
- **조문**: 조특법 §98~§99의2 (차감형)
- **유형**: display · **차원**: 배선 14지점·결과뷰 · **검증**: 생존 1/1

**결함**

다건 차단 사유 문구(`lib/calc/multi-transfer-tax-validate.ts:107-108`)와 그 근거 주석(:11-18)이 stale하다. 「합산 계산에서는 차감·세액감면이 반영되지 않습니다」는 현재 코드와 어긋난다 — 집계 엔진은 차감형(`transfer-tax-aggregate.ts:288-303` + 농특세 2-pass :363-380)과 세액감면형(`transfer-tax-aggregate-reduction-step.ts:167-169` 레거시 합)을 모두 반영하며, 차단 대상인 §99의3에 대해 「단건 == 다건」 완전 일치를 기존 anchor(`__tests__/tax-engine/transfer-tax/aggregate-income-deduction-993.anchor.test.ts`, 실행 통과)가 고정하고 있다. 문구가 도입된 `92e8feee`(2026-06-12)는 집계 차감 지원 `62821310`(2026-07-27)보다 앞선다. 실제로 집계에서 소실되는 것은 **세율특칙뿐**이다 — `forceFlatRate20`(§98①1호)·`suppressShortTermRate`(§98의2①·§98의3④·§98의5③·§98의6③ 각 2호)는 단건 `transfer-tax.ts:743-745`에서만 주입되는데 집계는 `transfer-tax-aggregate-helpers.ts:355-357`에서 원본 `correctedSingleInput`을 세율 입력으로 쓴다. 따라서 차단 유지는 타당하되 사유 문구는 「세율 특칙이 합산 세율군 재계산에서 소실되기 때문」으로 정정해야 한다. 덧붙여 범위 표기 「조특법 §98~§99의2 시리즈」도 차단 집합(`ALL_INCOME_DEDUCTION_IDS` 11종)에 든 §99의3·§99를 온전히 담지 못한다(§99의3은 §99의2보다 뒤 조문 — KoreanLaw 본문 확인).

**근거**

`lib/calc/multi-transfer-tax-validate.ts:104-109` `const blockedReduction = (a.reductions ?? []).find((r) => MULTI_UNSUPPORTED_REDUCTION_TYPES.has(r.type)); if (blockedReduction) { return "미분양·신축주택 감면(조특법 §98~§99의2 시리즈)은 단건 계산기에서만 지원됩니다. 합산 계산에서는 차감·세액감면이 반영되지 않습니다."; }`. 그러나 `lib/tax-engine/transfer-tax-aggregate.ts:290-303` 은 `const incomeDeductionReducible = assetRecords.map((r, i) => { const reducible = incomeDeductionReducibleOf(r.result); ... });` 와 `const taxableAfterReduction = incomeAfterOffset.map((v, i) => Math.max(0, v - incomeDeductionReducible[i]));` 로 차감을 반영하고, `lib/tax-engine/transfer-tax-aggregate-pickers.ts:109-116` `incomeDeductionReducibleOf` 가 자산별 detail에서 값을 읽는다. 또 `transfer-tax-aggregate.ts:363-380` 이 차감형 농특세 2-pass까지 돈다. ⚠️ 미확인: 주석(:11-18)이 인용한 probe 수치(단건 17,254,000 vs 다건 94,897,000)를 재현하지 않았다 — 그 divergence는 세율특칙(§98 flat 20%·§98의3계 단기세율 배제)에서 올 가능성이 있고, 그 부분은 실제로 집계에서 소실될 수 있다. 즉 차단 자체의 타당성은 다투지 않으며 문구만 지적한다.

**실패 시나리오**

다건 마법사에서 자산에 §98의7 감면을 선택 → 현재 출력: 「… 합산 계산에서는 차감·세액감면이 반영되지 않습니다.」 라는 차단 사유가 표시되어, 사용자는 합산 엔진이 차감형을 전혀 모른다고 이해한다. → 올바른 출력: 실제 미지원 사유(예: 「세율 특칙(§98 20% 분리과세·§98의3계 단기세율 배제)이 합산 세율군 재계산에서 소실되기 때문」)를 적거나, 검증된 범위로 문구를 좁힌다.

**세액 영향**: 세액 무영향 — 표시/인용

**처방**

차단은 유지하되 사유 문구를 실측된 미지원 축(세율 특칙)으로 정정한다. 문구를 정하기 전에 §98·§98의3·§98의5를 각각 단건/다건으로 돌려 divergence의 출처(차감 vs 세율군)를 재현·확인할 것 — 그 실측 없이 문구를 바꾸면 같은 종류의 오기재를 반복하게 된다.

---

## [D2-07] §97의3 「민간건설임대주택」 한정 미검증 — rentalHousingType이 사문 필드

- **위치**: `lib/tax-engine/transfer-reductions/rental-97-3.ts:56`
- **조문**: 조특법 §97의3① 본문
- **유형**: legal-accuracy · **차원**: §97의3·4·5 LTHD축 · **검증**: 생존 1/1
- **심각도 조정**: medium → low (검증 결과)

**결함**

**정정된 서술**: 「rentalHousingType이 사문 필드」가 아니라 — **조특법 §97의3① 본문의 「민간임대주택법 §2조제2호 민간건설임대주택」 한정을 표현할 입력 필드 자체가 4계층 어디에도 없다**(types.ts:150의 `rentalHousingType`은 민특법 §2 4호/5호 축이고, 법·령이 이 두 값을 동등 취급하므로 미독이 정당하다 — 없는 것은 2호/3호 축이다). 엔진 rental-97-3.ts는 다른 모든 요건(시한·등록·규모·기준시가·증액제한·임대기간·안분)을 구현하면서 이 한 요건만 빠뜨렸고, **:8 헤더 주석은 그 요건을 명시하고 있어 주석-구현 드리프트**다.

**단, 곧바로 게이트를 심는 것은 금지**: §97의3①1호·령 §97의3②의 10년 계속임대 요건상 현재 양도로 도달 가능한 사건은 등록일 2016-08-31 이전이며, 현행 본문의 건설임대 한정이 그 등록분에 미치는지는 **부칙 경과조치 미확보로 확인 필요**(KoreanLaw 과거 시행본 NOT_FOUND · amendment_track 미반환 — docs/00-pm/transfer-rental-followup.plan.md:78의 R-1과 동일 층위 제약). 부칙 없이 건설임대 한정을 적용하면 현재 유일하게 도달 가능한 모집단에 법 근거 없는 불리 적용이 된다. ⇒ 처리는 「엔진 차단 추가」가 아니라 **R-1과 묶어 부칙 확보(국세청 집행기준·신구대조표 등 외부 원문) 후 판단**, 그전까지는 UI 안내로 건설/매입 구분을 고지하는 선이 상한이다.

**근거**

rental-97-router.ts:69-78 `case "rental_97_3": return { ...base, officialPriceAtStart…, isNationalHousingScale…, region…, propertyType: r.propertyType, rentalHousingType: r.rentalHousingType, isConvertedFromShortTerm… };` — 그러나 rental-97-3.ts 전문(214줄)에 `rentalHousingType`·`propertyType` 참조 0건(`grep -n "rentalHousingType|propertyType" rental-97-3.ts` → 히트 없음). 저장소 전체 grep에서도 `rentalHousingType`을 읽는 곳은 레거시 엔진 `lib/tax-engine/rental-housing-reduction.ts`뿐이고 §97 시리즈 evaluator는 0건.
타입 자체가 구분을 담지 못한다: transfer-reductions/types.ts:150 `rentalHousingType?: "long_term_private" | "public_support_private";` — 이는 민특법 §2 제5호/제4호(장기일반/공공지원) 축이지 제2호(민간건설)/제3호(민간매입) 축이 아니다. UI Rental973InputForm.tsx:87-91도 같은 두 값만 고르게 한다.
조문 실측(KoreanLaw MST 280409 §97의3①): 「…「민간임대주택에 관한 특별법」 제2조제2호에 따른 **민간건설임대주택**으로서 같은 조 제4호 또는 제5호에 따른 공공지원민간임대주택 또는 장기일반민간임대주택을 2027년 12월 31일까지 등록…」

**실패 시나리오**

민간**매입**임대주택(장기일반민간임대주택으로 등록)을 10년 임대 후 양도 → 현재 §97의3 70% 특례가 그대로 적용된다. 현행 §97의3① 본문상 대상은 민간건설임대주택이므로 적용될 수 없다.

**세액 영향**: 과세 양도차익 1,000,000,000원·보유 11년(표1 22%) 기준 장기보유특별공제 700,000,000원 vs 220,000,000원 → 480,000,000원 과다. 다만 매입임대분에 대한 부칙 경과조치를 확인하지 못했으므로(과거 시행본 KoreanLaw NOT_FOUND) 과거 등록분에 그대로 적용되는지는 **확인 필요**.

**처방**

§97의3 폼에 민특법 §2 제2호(민간건설)/제3호(민간매입) 구분 필드를 추가하고 evaluator에서 건설임대 외를 배제한다. 다만 매입임대를 대상에 포함하던 구법과 그 부칙(등록 시점별 경과조치)을 먼저 확인해 등록일 축으로 갈라야 한다 — 부칙 미확인 상태에서 일괄 차단하면 납세자에게 불리한 오적용이 된다. 그때까지 최소 조치로 읽히지도 않는 `rentalHousingType`을 라우터에서 넘기는 배선(:76)을 걷어내거나 실제 판정에 쓰도록 정리한다.

---

## [D3-08] §99② 주택수 제외 window가 국민주택 여부와 무관하게 1999-12-31까지 열려 있음

- **위치**: `lib/tax-engine/transfer-reductions/unsold-hybrid-p5.ts:272`
- **조문**: 조특법 §99①1호 괄호 (신축주택취득기간) · §99②
- **유형**: legal-accuracy · **차원**: §99·§99의2·§99의3 신축 · **검증**: 생존 1/1

**결함**

서술은 대체로 정확하나 세 가지를 정정·보강해야 한다. (1) 「무조건 통과」가 아니라 **사용자가 「해당 조문 본 요건 충족 확인」 토글을 켠 경우에만** 통과한다 — 이 저장소는 모드 2 전체를 자기선언 기반으로 설계했고(`transfer-tax-validate.ts:288` 주석 「확인 토글은 낙관 — 엔진 불적용 사유」), 토글 설명에 「가액·면적 등」이 열거돼 있어 85㎡ 국민주택 축이 선언 범위라는 해석 여지가 있다. (2) 그럼에도 **결함으로 성립하는 근거는 「저장소 자신의 고지 규약」이다** — 동일 파일의 `unsold_98_3`은 window가 거주자/비거주자 union일 때 UI에 「아래 요건 확인 토글은 …**취득기간 충족**을 포함해 확인한 것으로 간주됩니다」(`SpecialHouseExclusionSection.tsx:93-97`)를 명시했는데, `new_99`에는 그런 고지가 없고 Select 라벨도 다른 8개와 달리 **취득기간 자체를 표기하지 않는다**(「§99 신축주택 IMF 1차 (~2007.12.31 양도분 한정)」 — `:27`). 즉 정확한 결함은 「엔진이 무조건 승인」이 아니라 **union window의 미고지 + 동일 조문 두 소비 지점의 기준 분열**(`new-99.ts:171`은 축을 가르고 `unsold-hybrid-p5.ts:272`는 가르지 않음)이다. (3) 노출 범위는 매우 좁다 — 과다개방 구간은 **1999.7.1~1999.12.31 취득분(6개월+1일)** 뿐이고, `transferDeadline: 2007-12-31` 때문에 **양도일이 2007.12.31 이전인 계산(경정청구·소급 재계산)에서만** 발현한다. 아울러 부수적으로, §99①1호(자기건설)의 법정 판정 기준일은 **사용승인·사용검사일**, 2호는 **최초 매매계약일**인데 이 게이트는 `houseAcquisitionDate || houseContractDate`만 본다(`:325`) — 같은 층위의 coarseness이나 청구 범위 밖이다.

**근거**

코드 `unsold-hybrid-p5.ts:270-275` 원문: `new_99: { label: "§99 신축주택 (IMF 1차)", windows: [[D("1998-05-22"), D("1999-12-31")]], legalBasis: "조특법 §99②", transferDeadline: D("2007-12-31"), },`. 조문(KoreanLaw MST 280409 §99①1호): 「1998년 5월 22일부터 1999년 6월 30일까지의 기간(**국민주택의 경우에는** 1998년 5월 22일부터 1999년 12월 31일까지로 한다 …)」 — 12월 31일 종기는 국민주택 전용이다. `SpecialHouseExclusionInput`(:209-220)에는 국민주택 플래그가 없고, 판정부(:302-343)는 `inWindow(houseAcquisitionDate) || inWindow(houseContractDate)` + 사용자 자기선언 `requirementsConfirmed`만 본다. 대비: 감면 본판정 `new-99.ts:171` `const periodEnd = input.isNationalHousing ? NEW_99_PERIOD_END_NATIONAL : NEW_99_PERIOD_END;`로 축이 갈려 있다 — 같은 조문의 두 소비 지점이 다른 기준을 쓴다.

**실패 시나리오**

입력: 전용 120㎡(비국민주택) 신축주택을 1999-09-01에 취득해 보유 중, 일반주택을 2007-06-15 양도하면서 `specialHouseExclusions: [{ article: "new_99", houseAcquisitionDate: 1999-09-01, requirementsConfirmed: true }]` 선언 → 현재 출력: `eligible true` → 비과세 판정 주택수 −1. 올바른 출력: 1999-09-01은 비국민주택의 신축주택취득기간(~1999.6.30) 밖이므로 `eligible false`.

**세액 영향**: 세액 영향 있음(1세대1주택 비과세 오적용 가능)이나 `requirementsConfirmed` 자기선언이 앞단에 있어 단독으로는 확정 금액을 특정할 수 없다 — 게이트 과다개방 1건.

**처방**

`SpecialHouseExclusionInput`에 `isNationalHousing`을 추가해 window 종기를 `isNationalHousing ? 1999-12-31 : 1999-06-30`으로 가르거나, `new-99.ts`의 `NEW_99_PERIOD_END`/`NEW_99_PERIOD_END_NATIONAL` 상수를 직접 재사용해 단일 소스로 만든다.

---

## [D4-07] 감면주택 제외 step 표시가 §99의4·상속주택 제외분까지 자기 몫으로 표시한다

- **위치**: `lib/tax-engine/transfer-tax-house-exclusion-step.ts:52`
- **조문**: 조특법 §98의2④ 등 (표시 문구)
- **유형**: display · **차원**: §99의4·주택수제외 · **검증**: 생존 1/1

**결함**

주장은 성립한다. 다만 두 가지를 정정·보완한다. ① **발현 조건이 조건부다** — 감면주택 제외만 있고 hce(§99의4·§98의9)·상속 제외가 모두 0이면 `exemptionJudgeInput.householdHousingCount = 원본 − 감면주택수`가 되어 :52 표시가 우연히 정확하다. 결함은 **hce 또는 상속 제외가 함께 발화할 때만** 드러난다. ② **2차 증상이 있다** — 감면주택 행이 최종값(1)까지 내려간 것으로 찍힌 직후 상속 행이 "2 → 1"로 시작하므로, 사용자가 읽는 주택수 체인이 역행하는 것처럼 보인다(4→1, 그다음 2→1). 정정된 서술: `transfer-tax-house-exclusion-step.ts:52`의 formula가 `exemptionJudgeInput.householdHousingCount`(= 원본 − hce − 감면주택 − 상속)를 참조해, 형제 두 step이 지키는 증분 체이닝 규약(`transfer-inheritance-exclusion.ts:88-91` 주석에 명문화)에서 감면주택 행만 이탈한다. 올바른 값은 `effectiveInput.householdHousingCount − (hceApplied ? 1 : 0)` → 그 값 − `specialHouseExclusionDetail.excludedCount` 이며, 예시 시나리오에서는 「3 → 2」다. 세액·비과세 판정값은 정확하고 표시만 어긋난다.

**근거**

transfer-tax-house-exclusion-step.ts:52 formula 문자열 `… — 주택수 ${effectiveInput.householdHousingCount} → ${exemptionJudgeInput.householdHousingCount} (비과세 판정 한정 — 중과 주택수 불변)` 인데 `exemptionJudgeInput.householdHousingCount`는 :43-45에서 `householdHousingCount - totalExcluded`(= hce + 감면주택 + 상속)로 계산된다. 형제 step 둘은 증분 기준으로 올바르게 찍는다 — :47 `buildHouseCountExclusionStep(hceApplied, effectiveInput.householdHousingCount, Math.max(effectiveInput.householdHousingCount - 1, 0))`, :57-64 `buildInheritedExclusionSteps(inheritedExclusion, effectiveInput.householdHousingCount - (hceApplied ? 1 : 0) - specialHouseExclusionDetail.excludedCount)` — 상속 step은 진입 시점 주택수를 정확히 체이닝하고 있어 감면주택 step만 규약이 어긋난다.

**실패 시나리오**

입력: householdHousingCount=4, §99의4 적격 1건 + 보유 감면주택 1건(적격) + 상속주택 제외 1건. 현재 출력: step1 「주택 수 4채 − 농어촌주택등 1채 = 3채」, step2 「… — 주택수 4 → 1」(감면주택 1채가 3채를 뺀 것처럼 표시), step3 상속 「2 → 1」. 올바른 출력: step2는 「3 → 2」여야 한다.

**세액 영향**: 세액 무영향 — 표시/인용

**처방**

step2의 formula를 `effectiveInput.householdHousingCount - (hceApplied ? 1 : 0)` 에서 `- specialHouseExclusionDetail.excludedCount` 만큼 줄인 증분 표기로 바꾼다(상속 step이 이미 쓰는 체이닝 기준을 재사용).

---

## [D4-08] 재개발·입주권 경로와 양도차손 경로에서 주택수 제외 근거(detail)가 결과에 실리지 않는다

- **위치**: `lib/tax-engine/transfer-tax.ts:326`
- **조문**: 조특법 §99의4① · §98의9① (근거 표시)
- **유형**: display · **차원**: §99의4·주택수제외 · **검증**: 생존 1/1

**결함**

결함 자체는 성립하나 서술 두 곳을 정정한다.

(1) 「결과 화면에 어떤 조문으로 주택수를 뺐는지가 남지 않는다」는 과장이다. `runHouseCountExclusionStep`이 `steps` 배열에 in-place push하고(transfer-tax-house-exclusion-step.ts:45-47 → unsold-98-9.ts:189-201) 그 `steps`가 `calculateRedevelopmentTax(redevInput, …, steps, …)`(transfer-tax.ts:371)로 그대로 넘어가 `const steps = [...baseSteps]`(transfer-tax-redevelopment.ts:110)로 승계되므로, 「농어촌·고향주택 소유주택 제외 (§99의4)」 step과 `legalBasis: "조특법 §99의4 (농어촌주택)"`은 계산과정에 남는다(probe 실측). 실제로 소실되는 것은 **전용 상세 카드의 고유 정보**다: ① §99의4⑥ 3년 미보유 추징 경고(`clawbackWarning` — 이 필드는 new-99-4.ts:185·types.ts:298·New994DetailCard.tsx:71 세 곳에만 존재해 warnings 등 다른 경로로 대체 노출되지 않는다), ② 농어촌주택 보유기간 표시, ③ §98의9 `dualExclusionWarning`(unsold-98-9.ts:222-224), ④ **적격 미달(isEligible=false) 시에는 step 자체가 push되지 않으므로**(`if (hceApplied)` 게이트) 재개발·차손 경로에서 근거가 통째로 사라진다 — 정상 경로는 ReductionDetailCards.tsx:203이 `isEligible` 게이트 없이 카드를 띄워 미적용 사유까지 보여준다.

(2) 제목의 「입주권 경로」는 다른 사실이다. subject="right"(right_to_move_in)에서는 transfer-tax.ts:325의 `subject === "apt"` 가드 때문에 `runHouseCountExclusionStep`이 **애초에 호출되지 않는다** — detail이 버려지는 게 아니라 주택수 제외 판정 자체가 수행되지 않는다(별개 쟁점, 이 항목의 근거로는 부적절).

정정 후 결함: **재개발 완공주택(subject="apt", settlementDirection≠"receive") 경로와 양도차손 경로가 `runHouseCountExclusionStep`의 new994Detail·unsold989Detail·specialHouseExclusionDetail을 결과에 싣지 않아, 주택수 제외 상세 카드와 §99의4⑥ 추징 경고가 표시되지 않는다.** 실측 대조: 같은 사실관계에서 §99의4가 세액을 111,228,857 → 0으로 바꾸는데도 그 근거 카드는 뜨지 않는다.

**근거**

transfer-tax.ts:326 `const { exemptionJudgeInput } = runHouseCountExclusionStep(redevInput, steps);` — 반환 4필드 중 1개만 받는다(house-exclusion-step.ts:67 `return { exemptionJudgeInput, new994Detail, unsold989Detail, specialHouseExclusionDetail };`). `grep -n "new994Detail|unsold989Detail|specialHouseExclusionDetail" lib/tax-engine/transfer-tax-redevelopment.ts lib/tax-engine/transfer-tax-loss-return.ts lib/tax-engine/transfer-tax-rental-housing-step.ts lib/tax-engine/transfer-tax-multi-parcel-branch.ts lib/tax-engine/transfer-tax-mixed-use*.ts` → 0건(exit 1). 정상 경로는 싣는다 — transfer-tax-normal-return.ts:193-194·208-209, 비과세 조기반환도 싣는다 — transfer-tax.ts:464-465. 소비층은 components/calc/results/transfer/ReductionDetailCards.tsx:203 `{result.new994Detail && <New994DetailCard detail={result.new994Detail} />}` · :205 · :293 이라 detail이 없으면 카드가 통째로 사라지고 §99의4⑥ 3년 미보유 추징 경고(New994DetailCard.tsx:71 `{detail.clawbackWarning && (`)도 함께 사라진다. 양도차손 경로(transfer-tax.ts:537 `buildLossTransferTaxResult`)도 같은 3필드를 넘기지 않아 비과세 조기반환(:464-467)과 비대칭이다.

**실패 시나리오**

입력: 재개발 완공 신축주택(subject="apt") 양도 + reductions=[new_99_4_rural 적격, 보유 3년 미만] + 세대 2주택. 현재 출력: 비과세 판정에는 제외가 반영되지만 결과 화면에 §99의4 상세 카드와 「3년 미보유 시 §99의4⑥ 추징」 경고가 표시되지 않는다. 올바른 출력: 정상 단건 경로와 동일하게 근거 카드·추징 경고 표시.

**세액 영향**: 세액 무영향 — 표시/인용. 다만 §99의4⑥ 추징(양도소득세 추가 납부) 고지가 누락되어 사용자가 사후 납부의무를 인지하지 못한다.

**처방**

transfer-tax.ts:326에서 4필드를 모두 받아 `calculateRedevelopmentTax` 결과에 spread하고, `buildLossTransferTaxResult` 호출부에도 비과세 조기반환(:464-467)과 동일하게 3필드를 전달한다.

---

## [D4-09] §98의8②·§99의2②의 「매매계약일」 기준 취득기간을 취득일로도 통과시킨다

- **위치**: `lib/tax-engine/transfer-reductions/unsold-hybrid-p5.ts:325`
- **조문**: 조특법 §98의8① · §99의2① · §99①1호
- **유형**: legal-accuracy · **차원**: §99의4·주택수제외 · **검증**: 생존 1/1
- **중복 병합**: D6-05 (같은 결함을 다른 차원이 독립 발견)

**결함**

모드 2 주택수 제외 윈도우 판정(unsold-hybrid-p5.ts:325)이 9개 조문 전부에 「취득일 OR 매매계약일 중 하나라도 창 안이면 통과」를 적용해, 조문이 매매계약일만을 기준으로 삼는 §98의8①·§99의2①에서 창 밖 계약 + 창 안 취득 조합을 부당 통과시킨다(probe 실측 excludedCount=1). 또한 §99는 「신축주택취득기간」의 국민주택 종기 연장(1999-06-30 → 1999-12-31)이 1호(사용승인일)·2호(매매계약일) 양쪽을 지배하는데 — 주장서의 「자기건설분」 한정은 부정확 — 코드는 국민주택 종기로 단일화해 두 호 모두에서 비국민주택 1999-07-01~12-31을 과대포섭한다(모드 2 입력에는 국민주택 여부·사용승인일 필드 자체가 없다). 같은 디렉터리의 모드 1 경로는 이미 조문별 기준일을 정확히 구현하고 있어(period-check.ts:194-195 「취득일 fallback 금지 … contractDate만 본다」, unsold-98-8.ts:165-180 contractDate 전용, unsold-hybrid.ts:420-460 자기건설=사용승인일/그 외=매매계약일, new-99.ts:36-38 NEW_99_PERIOD_END 1999-06-30 vs …_NATIONAL 1999-12-31), 이 결함은 미구현이 아니라 모드 2의 규약 이탈이다. 단 모드 2는 설계상 낙관 게이트이고(:215) 불적용 문구(:339)가 「최초계약」을 requirementsConfirmed의 확인 대상에 포함시키므로, 발현은 사용자의 요건확인 토글에 종속된다 — 방향은 납세자 유리한 과대포섭(비과세 과소과세)이며 금액은 미측정. 수정 시 기존 anchor p5-flat-rate-and-mode2.test.ts:57-62(취득일 단독으로 §98의8 적격을 고정)도 함께 정정해야 한다.

**근거**

unsold-hybrid-p5.ts:304-305 `const inWindow = (d: Date | undefined) => d !== undefined && w.windows.some(([from, to]) => d.getTime() >= from.getTime() && d.getTime() <= to.getTime());` 와 :325 `if (!inWindow(e.houseAcquisitionDate) && !inWindow(e.houseContractDate)) {` — 두 날짜의 OR다. 윈도우 정의는 :260-269 `unsold_98_8: { … windows: [[D("2015-01-01"), D("2015-12-31")]], legalBasis: "조특법 §98의8②" }`, `unsold_99_2: { … windows: [[D("2013-04-01"), D("2013-12-31")]] }`, :270-275 `new_99: { … windows: [[D("1998-05-22"), D("1999-12-31")]] }`. 조문 본문(KoreanLaw MST 280409 실독): §98의8① 「… 2015년 1월 1일부터 2015년 12월 31일까지 **최초로 매매계약을 체결**하고 5년 이상 임대한 주택 …」(취득일 기준 없음). §99의2① 「… 2013년 4월 1일부터 2013년 12월 31일까지 … **최초로 매매계약을 체결**하여 그 계약에 따라 취득(2013년 12월 31일까지 매매계약을 체결하고 계약금을 지급한 경우를 포함)한 경우 …」. §99①1호 「1998년 5월 22일부터 1999년 6월 30일까지의 기간(**국민주택의 경우에는** 1998년 5월 22일부터 1999년 12월 31일까지로 한다)」 — 코드는 국민주택 종기(1999-12-31)로 일원화했다. 대조군: §98의2①·§98의7①은 「취득(…매매계약 체결+계약금 납부 포함)」·「최초로 매매계약을 체결하거나 그 계약에 따라 취득한 경우」로 OR가 맞다.

**실패 시나리오**

입력: 보유 감면주택 행 article=`unsold_98_8`, houseContractDate=2014-11-01(창 밖), houseAcquisitionDate=2015-06-01(창 안), requirementsConfirmed=true. 현재 출력: `inWindow(houseAcquisitionDate)`가 true라 eligible → 비과세 판정 주택수 −1. 법령상 올바른 출력: §98의8①의 기준은 최초 매매계약일 2014-11-01이므로 2015년 창 밖 → 불적용. (§99 자기건설 비국민주택으로 1999-09 사용승인한 경우도 동일하게 부당 통과한다.)

**세액 영향**: 주택수가 1 부당 감소해 1세대1주택 비과세가 잘못 적용될 수 있다(과소). 금액은 사례 종속 — 미측정. requirementsConfirmed 토글이 명목상 본 요건을 담당하나, 코드가 시한 판정을 자기 책임으로 명시하고 불적용 사유 문구(:330 「해당 조문의 취득기간 외입니다」)까지 내보내므로 사용자는 시한이 검증된 것으로 읽는다.

**처방**

`ExclusionWindow`에 기준 날짜 종류(`basis: "acquisition_or_contract" | "contract_only" | "approval"`)를 두고 조문별로 지정한다. §99는 국민주택 여부 입력을 받아 종기를 1999-06-30/1999-12-31로 가른다. 최소한 UI 라벨(SpecialHouseExclusionSection.tsx:18-27)과 불적용 사유 문구를 조문별 기준에 맞게 정정할 것.

---

## [D5-07] P2 전용 구버전 dispatcher가 dead code로 남아 §98의3·5·6·2·4·98을 조용히 누락시킬 수 있다

- **위치**: `lib/tax-engine/transfer-reductions/unsold-hybrid.ts:644`
- **조문**: 조특법 §98~§98의7·§99의2
- **유형**: wiring · **차원**: §98~§98의7 하이브리드 · **검증**: 생존 1/1

**결함**

**결함 성립. 단 서술 3점 정정 + 위험 근거 1점 보강.**

**정정 ① 행 번호.** 래퍼는 `unsold-hybrid.ts:644-668`(주장의 "644-655"보다 길다), 문제의 `find`는 **:655**. 실제 진입점 `evaluateAnyHybridTaxAmount`는 `unsold-hybrid-p3.ts:**561**` 선언(주장의 "554-577"은 JSDoc 포함 어림값 — 선언행이 어긋난다).

**정정 ② 위험의 핵심은 「이름 유사성」이 아니라 「JSDoc이 거짓말한다」는 것.** 주장은 "이름이 비슷해서 잘못 import할 수 있다"에 무게를 뒀으나, 실제 함정은 죽은 래퍼의 주석(unsold-hybrid.ts:641-643)이 **`calcReductions 진입점 — 5년 내 세액감면 후보 (§127⑦ max 패턴)`** 이라고 **스스로를 진입점으로 단언**한다는 점이다. 진짜 진입점(p3.ts:557-560)은 거의 동일한 문구에 `(P2+P3 통합)`만 붙어 있다. **두 함수가 동시에 「calcReductions 진입점」을 자칭**하므로, 배럴 자동완성이 아니라 **주석을 읽고 고른 개발자도** 틀린 쪽을 고른다. 이는 이 저장소의 확립된 `주석 vs 구현 드리프트` 정책 위반이다.

**정정 ③ 수정 범위 — 형제 export를 함께 지우면 안 된다.** "P2 전용 구버전"이라는 이름 때문에 `index.ts:172-173` 두 줄을 같이 걷어내기 쉬우나, **:172 `evaluateHybridFromReduction`(unsold-hybrid.ts:592)은 살아 있는 코드**다 — p3.ts:29가 `evaluateP2HybridFromReduction`으로 alias import해 :661 위임 체인의 마지막 단계로 쓴다. 제거 대상은 **:173 한 줄과 unsold-hybrid.ts:644-668 뿐**이다.

**유지되는 부분(전부 실측 확인):** 누락 조문 6개(`unsold_98_3·98_5·98_6·98_2·98_4·98`) 카운트 정확 · 호출부 0건 정확 · 현재 세액 영향 0 정확 · 「진입점은 `evaluateAnyHybridTaxAmount` 하나여야 한다」는 처방 타당.

**근거**

unsold-hybrid.ts:644-655 `export function evaluateHybridTaxAmountFromReductions(reductions, ctx) { … const r = reductions.find((x) => x.type === "unsold_98_7" || x.type === "unsold_99_2") …}` — 2조문만 찾는다. 실제 진입점은 unsold-hybrid-p3.ts:554-577 `evaluateAnyHybridTaxAmount`이고 `ALL_HYBRID_IDS`(8종)를 본다(transfer-tax-reductions-calc.ts:159가 이것을 호출). `grep -rn "evaluateHybridTaxAmountFromReductions" lib/ app/ components/ __tests__/ e2e/` 결과는 정의부(unsold-hybrid.ts:644)와 barrel 재export(transfer-reductions/index.ts:173) 2건뿐 — 호출·테스트 0건.

**실패 시나리오**

새 계산 경로(예: 겸용주택·다필지 분기)에 하이브리드 세액감면을 배선하면서 barrel에서 이름이 비슷한 `evaluateHybridTaxAmountFromReductions`를 import하면, §98의3(100%/60%)·§98의5(60/80/100%)·§98의6(50%)·§98의4(10%)는 `find`에 걸리지 않아 `undefined` 반환 → 감면 0으로 조용히 계산된다. 타입 오류도 나지 않는다. 올바른 상태: 진입점이 `evaluateAnyHybridTaxAmount` 하나여야 한다.

**세액 영향**: 현재 세액 무영향(호출부 0) — 향후 배선 시 감면 전액 소실 위험.

**처방**

`evaluateHybridTaxAmountFromReductions`를 삭제하고 barrel(index.ts:173) 재export도 제거하거나, 최소한 `@deprecated — evaluateAnyHybridTaxAmount를 쓸 것` 주석과 함께 barrel에서 내릴 것.

---

## [D5-08] §98의6의 「최초 매매계약일」을 ⑧이 필수 차단하지만 엔진은 한 번도 읽지 않는다

- **위치**: `lib/calc/transfer-tax-validate-reductions.ts:295`
- **조문**: 조특법 §98의6①
- **유형**: wiring · **차원**: §98~§98의7 하이브리드 · **검증**: 생존 1/1

**결함**

서술은 대체로 정확하나 두 곳을 정밀화한다. (1) 「엔진이 전혀 사용하지 않는다」는 §98의6 감면 판정 경로(evaluateUnsold986)에 한정해 참이다 — 값은 Unsold986Input.contractDate 필드로 실제 전달되고(unsold-hybrid-p3.ts:637, `?? ctx.assetContractDate` fallback 포함) 타입에도 선언(:375)돼 있으나 본문에서 한 번도 읽히지 않는다. 프로브 실측: 계약일 미지정/2011-06-01/1999-01-01의 반환 JSON 3건 완전 동일. (2) 「§98의6에 매매계약 관련 요건이 없다」로 확대 해석하면 안 된다 — 조특법 §98의6①은 「사업주체등과 최초로 매매계약을 체결하고 취득한 주택」을 요건으로 두지만 **일자 제한이 없고**, 코드는 이미 boolean isFirstContract986(p3:454-459)으로 그 요건을 검증한다. 시한이 걸린 것은 임대계약(1호·2호 모두 2011.12.31)뿐이다. 따라서 결함의 정확한 형태는 「법정 시한이 없는 매매계약 **일자**를 ⑧이 필수 입력으로 강제해 계산을 차단하지만, 그 값은 감면 판정에 전혀 반영되지 않는다」이다. 참고로 주택수 제외 축(unsold-hybrid-p5.ts:251)은 별개 필드 houseContractDate에 2011-03-29~2011-12-31 창을 적용하지만 contractDate986과 배선이 없다 — 이 결함의 반증이 아니다.

**근거**

transfer-tax-validate-reductions.ts:295-296 `if (!r.contractDate986) return fail("§98의6 적용: 최초 매매계약일을 입력하세요.");`. 값은 unsold-hybrid-p3.ts:637 `contractDate: toHybridDate(r.contractDate986) ?? ctx.assetContractDate`로 `Unsold986Input.contractDate`에 실리지만, `evaluateUnsold986`(unsold-hybrid-p3.ts:404-521) 본문에서 `input.contractDate`를 참조하는 줄이 한 곳도 없다(사용 필드: stdPriceSumAtBase·floorAreaSqm·transferDate·acquisitionDate·isUnsoldAfterCompletion·isFirstContract·isNotOccupiedAfterCompletion·isNotRecontract·hoType·sellerRented2Years·rentalContractDate·rentalStartDate·rentalEndDate·inheritedRentalMonths). period-check.ts:174-176도 `unsold_98_6: { check: () => true }`로 상수 통과다. 조문 실측(MST 280409 §98의6①): 시한은 「2011년 12월 31일까지 **임대계약**을 체결」(1호)·「2011년 12월 31일 이전에 **임대계약**을 체결한 경우에 한정」(2호)뿐이고 매매계약 시한은 없다.

**실패 시나리오**

§98의6①1호 주택(사업주체 2년 임대 후 2013년 취득)을 선택하고 임대 관련 일자를 모두 입력했으나 매매계약일 칸을 비워 두면 ⑧이 「§98의6 적용: 최초 매매계약일을 입력하세요.」로 계산 자체를 차단한다. 그 값을 채워도 엔진 판정·세액은 1원도 달라지지 않는다. 올바른 상태: 조문에 없는 요건이므로 차단하지 않거나, 쓰이지 않는 입력을 제거한다.

**세액 영향**: 세액 무영향 — 입력 차단(도달성) 결함.

**처방**

`contractDate986` 필수 차단을 제거하거나(권장), 실제로 판정에 쓰일 근거가 있다면 엔진 `evaluateUnsold986`에 그 판정을 추가해 ⑧과 일치시킬 것.

---

## [D7-02] §133② 한도 상향(2억/3억) 기준연도가 2025 — 실제로는 2026-01-01 시행

- **위치**: `lib/tax-engine/public-expropriation-reduction.ts:27`
- **조문**: 조특법 §133①1호 / §133②
- **유형**: legal-accuracy · **차원**: §69·§70·§77·§77의2·§77의3 · **검증**: 생존 2/3
- **심각도 조정**: critical → low (검증 결과)
- **중복 병합**: D8-08 (같은 결함을 다른 차원이 독립 발견)

**결함**

결함 자체는 맞다. 다만 세 곳을 정정·보강한다.

**(a) 5년 한도 서술이 §77의3에 대해 부정확하다.** 주장은 "§133①1호의 1억(5년 나목 2억)"이라 적었으나, 2025 시행본 §133①2호 **나목의 열거는 "제66조부터 제69조까지, 제69조의2부터 제69조의4까지, 제70조, **제77조 또는 제77조의2**"로 끝나 **§77의3이 빠져 있다**. 실패 시나리오가 §77의3 사안이므로, 그 건에 적용되는 2025년 한도는 **§133①1호 연 1억뿐**이고 5년 축(나목 2억)은 §77의3 감면액에 대해서는 문언상 적용되지 않는다. 연간 1억이라는 주장의 핵심 수치는 그대로 유효하다.

**(b) 결함 범위가 주장보다 넓다 — 세팅 지점이 2곳이고, ①의 「합산 구조」도 재현되지 않았다.**
· 두 번째 write site: `lib/tax-engine/aggregate-reduction-limits.ts:59-71 buildLimitGroups()`가 동일한 `transferYear >= 2025` 분기를 복제한다. 한쪽만 고치면 다건 합산 경로가 그대로 남는다.
· 추가 구조 불일치: 2025 시행본 §133①1호의 1억은 §33·§43·§66~§69·§69의2~4·§70·**§77·§77의2·§77의3**·§85의10을 **한 바구니에 합산**한 공통 한도인데, `buildLimitGroups(2024)`는 pre-2025 분기에서도 §77 계열을 자경농지 그룹과 **분리된 별도 그룹(자체 1억)** 으로 둔다. 즉 2024년 이전 양도에서도 §69 자경농지 감면과 §77 감면이 동시 발생하면 합산 1억이 아니라 각 1억으로 계산된다. (이 부분은 D7-02의 연도 경계와는 별개의 결함이므로 별건 취급 가능.)

**(c) 세액 영향이 주장의 100,000,000보다 클 수 있다.** 같은 파일 `:32 AMENDED_2025_TRANSFER_CUTOFF = 2025-01-01`이 §77① 감면율 15/20/35/45%도 2025-01-01부터 적용하는데, 2025 시행본 §77①은 **10/15/30/40%**다(2026-01-01 시행본에서 비로소 15/20/35/45%). 따라서 2025 양도분은 **capping 전 `rawReductionAmount` 자체가 인상세율로 부풀려진 뒤 잘못된 2억 한도에 걸린다** — 한도에 걸리지 않는 중소 규모 건에서는 한도 결함이 발현하지 않는 대신 **세율 결함이 단독으로** 과다감면을 낳는다.

**(d) 실패 시나리오의 산출세액은 파생값이 아니라 가정 입력이다.** 과세표준 2,000,000,000의 §55① 산출세액은 2,000,000,000×45% − 65,940,000 = **834,060,000**이지 800,000,000이 아니다. 다만 `rawReductionAmount`가 두 한도(1억·2억)를 모두 초과하므로 "감면세액 100,000,000 과다"라는 결론은 이 수치와 무관하게 성립한다.

**근거**

코드 원문 `lib/tax-engine/public-expropriation-reduction.ts:24-30`:
```
export function getInvoluntaryTransferLimits(transferYear: number): { annual: number; fiveYear: number } {
  return transferYear >= 2025
    ? { annual: 200_000_000, fiveYear: 300_000_000 }
    : { annual: 100_000_000, fiveYear: 200_000_000 };
}
```
호출부 3곳: `public-expropriation-reduction.ts:191`, `replacement-land-reduction.ts:84`, `gb-designated-land-reduction.ts:128`.
KoreanLaw MCP 실측:
· MST 267555(**조문시행일 20250101**) 제133조 — **①에 §77·§77의2·§77의3이 §69 등과 같이 열거**되고 「1호 … 합계액이 과세기간별로 **1억원**을 초과하는 경우」, 「2호 나목 … 제66조부터 제69조까지, … 제70조, **제77조 또는 제77조의2**에 따라 감면받을 양도소득세액의 합계액이 **2억원**을 초과하는 경우」. **②는 토지분할 의제 조항**이고 공익수용 별도 한도는 없다.
· MST 280409(**조문시행일 20260101**) 제133조 — 비로소 「② 개인이 제77조, 제77조의2 또는 제77조의3에 따라 … 1호 … 과세기간별로 **2억원** … 2호 … 5개 과세기간 … **3억원**」이 신설되고 ①에서 §77 계열이 빠진다.

**실패 시나리오**

토지, 양도일 2025-09-01, §77의3 in_zone 1호(40%) 적용. 양도소득금액 2,002,500,000 · 기본공제 2,500,000 · 과세표준 2,000,000,000 · 산출세액 800,000,000.
rawReductionAmount = 800,000,000 × (2,000,000,000×0.4) / 2,000,000,000 = 320,000,000.
현재: annualLimit = getInvoluntaryTransferLimits(2025).annual = 200,000,000 → 감면세액 **200,000,000**.
조문(2025 시행본 §133①1호): 1억 초과분 감면 배제 → 감면세액 **100,000,000**.

**세액 영향**: 감면세액 100,000,000 과다 → 결정세액 100,000,000 + 지방소득세 10,000,000 과소.

**처방**

`transferYear >= 2026`으로 경계를 옮기고, 상수 주석(`legal-codes/transfer.ts:130` 「§133② … (2025+ 1년 2억 / 5년 3억)」)과 `replacement-land-reduction.ts:15`·`gb-designated-land-reduction.ts:12` 헤더 주석을 2026 기준으로 정정. 경계 anchor(2025년 양도=1억, 2026년 양도=2억)를 추가 — 정찰 실측상 이 경계는 뮤테이션 0/17,819로 안전망이 없다.

---

## [D7-03] 2026년 이전 양도분에서 §77 계열과 §69 자경농지를 별도 한도군으로 분리 — 조문상 §133①의 1억을 공유한다

- **위치**: `lib/tax-engine/aggregate-reduction-limits.ts:58`
- **조문**: 조특법 §133①1호(시행 2025-01-01본)
- **유형**: legal-accuracy · **차원**: §69·§70·§77·§77의2·§77의3 · **검증**: 생존 2/3
- **심각도 조정**: high → low (검증 결과)

**결함**

**정정 — 결함은 맞으나 범위가 주장보다 넓다. 원인은 「그룹 분리」와 「연도 경계 1년 오차」 두 개다.**

조특법 §133②(§77·§77의2·§77의3 전용 연 2억 / 5년 3억)는 **법률 제21223호(2025-12-23 공포)로 신설되어 2026-01-01 시행**됐다. 그 이전(20240101·20250101 시행본 직독)에는 §77·§77의2·§77의3이 §69·§69의2~4·§70 등과 **함께 §133①1호의 단일 「합계액 1억원」** 안에 있었고, 당시 §133②는 토지분할 의제 규정이었다.

코드의 오류는 세 갈래다.

(a) **그룹 분리 (주장한 부분)** — `aggregate-reduction-limits.ts:63-71`이 자경 그룹과 §77 계열 그룹을 별도 `LimitGroup`으로 두고, `applyAnnualLimits(:122-128)`가 그룹별로 독립 capping한다. 2026년 이전 양도분에서 두 감면이 함께 적용되면 종합한도가 사실상 2배가 된다. 실측: 자경 1억 + §77 1억 → 2024·2025 모두 **200,000,000** 통과(조문 100,000,000).

(b) **연도 경계 1년 오차 (주장 누락)** — `:60`과 `public-expropriation-reduction.ts:26-29`가 `transferYear >= 2025`에 2억/3억을 적용한다. 올바른 경계는 **`>= 2026`**이다. 이 오류는 **단건 경로에서도 발현**한다(`transfer-tax-reduction-cap.ts:42`·`public-expropriation-reduction.ts:190`이 같은 헬퍼 사용) — 2025년 §77 단일 자산 감면 raw 2.5억이면 2억이 감면돼 조문(1억) 대비 1억 과다. 소스 주석의 「2025.3.14 개정」은 근거를 확인할 수 없었고, 20250101 시행본 본문이 이를 부정한다.

(c) **5년 한도군 + 인용 오류 (주장 누락)** — 2026년 이전 §133①2호나목의 5년 2억은 §66~§69·§69의2~4·§70·§77·§77의2가 **공유**하며 §77의3은 나목에 열거되지 않는다. 코드는 §77 그룹에 별도 5년 한도를 주고 §77의3까지 포함시킨다(`:66-68`). 또한 `:69`의 `legalBasis: "조특법 §133②"`가 2026년 이전 양도분에도 그대로 인쇄되어(`transfer-tax-aggregate-reduction-step.ts:145` 경유 결과탭 표시) **한도와 무관한 토지분할 의제 항으로 법령 링크가 열린다.**

세액 영향(주장한 시나리오 기준)은 그대로 유효하다: 감면 100,000,000 과다 → 결정세액 100,000,000 + 지방소득세 10,000,000 과소.

**미확인(확인 필요)**: 법률 제21223호 부칙 적용례 원문(「이 법 시행 이후 양도하는 분부터 적용」 여부)과 2025년 중간 시행본은 법제처 API NOT_FOUND로 확보하지 못했다. 다만 20250101 시행본을 직접 읽었고 20260101 본에서 종전 ②·③이 ③·④로 밀린 renumbering이 확인되므로, ②가 2026-01-01 신설항이라는 결론은 유지된다.

**근거**

코드 원문 `lib/tax-engine/aggregate-reduction-limits.ts:64-74`:
```
return [
  DEFAULT_LIMIT_GROUPS[0], // 자경농지·축산·어업 (연도 불변)
  {
    types: ["public_expropriation", "gb_designated_land", "replacement_land_comp"],
    annualLimit: involuntary.annual,
    fiveYearLimit: involuntary.fiveYear,
    legalBasis: "조특법 §133②",
  },
] as const;
```
`applyAnnualLimits`(`:107~`)는 **그룹별로** `Math.min(totalRaw, group.annualLimit)`을 적용하므로 두 그룹 합계가 2억까지 통과한다.
KoreanLaw MST 267555(조문시행일 20250101) 제133조①1호 verbatim: 「제33조, 제43조, **제66조부터 제69조까지**, 제69조의2부터 제69조의4까지, 제70조, **제77조, 제77조의2, 제77조의3**, 제85조의10 … 에 따라 감면받을 양도소득세액의 **합계액**이 과세기간별로 **1억원**을 초과하는 경우에는 그 초과하는 부분에 상당하는 금액」 ⇒ 하나의 합계·하나의 1억이다.

**실패 시나리오**

2025년 다건 신고: 자산1 농지(§69 자경농지) 감면 raw 100,000,000, 자산2 토지(§77 공익수용) 감면 raw 100,000,000.
현재(`transfer-tax-aggregate-reduction-step.ts:107`이 `buildLimitGroups(2025)` 사용): 자경 그룹 min(1억,1억)=100,000,000 + §77 그룹 min(1억, 2억)=100,000,000 → 총 **200,000,000** 감면.
조문: 두 감면 합계 200,000,000 중 1억 초과분은 감면하지 않음 → 총 **100,000,000**.

**세액 영향**: 감면세액 100,000,000 과다 → 결정세액 100,000,000 + 지방소득세 10,000,000 과소.

**처방**

`buildLimitGroups(transferYear)`에서 `transferYear < 2026`이면 자경 계열과 §77·§77의2·§77의3을 **한 그룹**(연간 1억)으로 합치고 5년은 §133①2호나목(2억, §77의3 제외)·가목(§70 1억) 구조를 반영. 2026 이상만 현행 ①/② 2그룹 유지. 아울러 `DEFAULT_LIMIT_GROUPS`의 주석 「기본 §133 한도 그룹 (2024년 기준)」과 `public_expropriation: 2억/3억` 값이 서로 모순이므로 정정(현재는 모든 호출부가 `buildLimitGroups`를 넘겨 무해).

---

## [D7-12] 「조특법 부칙 제53조」 인용에 개정 법률 번호가 없어 조문을 특정할 수 없다

- **위치**: `lib/tax-engine/legal-codes/transfer.ts:123`
- **조문**: 조특법 부칙(법률 번호 미상) 제53조
- **유형**: citation · **차원**: §69·§70·§77·§77의2·§77의3 · **검증**: 생존 1/1

**결함**

결함 자체는 성립하나 「근거」의 두 항목이 부정확하고, 범위가 과소하다.

**성립하는 부분**: `lib/tax-engine/legal-codes/transfer.ts:122-123` 원문은 주장대로다. 저장소의 다른 부칙 인용 4건은 모두 법률 번호를 담고 있어 이 상수만 규약에서 이탈해 있다 — `property.ts:74` "지방세법 법률 제19230호 부칙 제15조", `common.ts:18` "부칙 §12848호 제10조②", `surcharge-transition.ts:42` "부칙 §9270호 §14①", `components/calc/inputs/Pre1990LandValuationInput.tsx:277` "「소득세법」 부칙(법률 제4803호) §8". 본 리뷰에서도 MCP(`efYd=20160101`)로 해당 부칙을 특정하지 못했으므로 「특정 불가」는 실측으로 뒷받침된다.

**정정 1 — 경고 문구를 통한 노출은 일어나지 않는다**: `public-expropriation-reduction.ts:270-274`가 push하는 「… 종전 감면율 적용 (조특법 부칙 §53)」은 `components/calc/results/transfer/ReductionDetailWarnings.tsx:38-44`의 `reductionWarningsToShow`가 `d.useLegacyRates === true && w.includes("종전 감면율")` 조건으로 **의도적으로 걸러낸다**. 화면에 뜨는 것은 그 문자열이 아니라 `TransferReductionRows.tsx:187`의 하드코딩 문구다.

**정정 2 — 「링크로 원문에 도달할 수 없다」는 성립하지 않는다(링크가 애초에 없다)**: `legalBasis`가 `LawArticleModal`/`buildLawUrl`로 전달되는 경로는 양도세 결과뷰에 0건이다. 실제 노출은 `MultiTransferPropertyBreakdown.tsx:351` → `DetailRow`(:464-492) 의 plain `<p className="text-micro …">` 텍스트 한 곳뿐이고, 단건 `TransferTaxResultView.tsx`에는 legalBasis 렌더가 없다. ⇒ 「틀린 인용이 링크를 틀리게 연다」는 통상의 가중 사유가 이 건에는 적용되지 않는다.

**정정 3 — 범위 확대**: 수정 대상은 상수 1곳이 아니라 5곳이다. 상수(`transfer.ts:123`) 외에 UI 하드코딩 2곳(`TransferReductionRows.tsx:72` "종전 감면율 (부칙 §53)", `:187`), 주석/경고 3곳(`public-expropriation-reduction.ts:10·171-172·272`)이 모두 법률 번호 없이 「부칙 §53」으로 적혀 있다. 상수만 고치면 화면 문구는 그대로 남는다.

**정정 4 — 「조용한 사각지대」 우려는 이미 상류에서 명시 처리돼 있다**: `citation-parser.ts:103-107`의 lawMatch가 이 문자열을 lawAbbr `"조특법 부칙"`으로 파싱하고, `lib/legal-verification/coverage.ts:55-56`이 `UNVERIFIABLE_LAW_NAMES`에 「부칙 경과조치(공익사업 수용 감면 종전 감면율) — 조문 API는 본칙만 조회 가능」이라는 이유와 함께 등재해 두었다. `__tests__/lib/legal-verification-unverifiable.test.ts`(실행 결과 2 passed)가 「모수 밖 법령 = 정확히 이 목록」을 강제하므로 미등록과 구별된다.

**수정 시 주의(계획서에 없던 결합)**: 상수를 「조특법(법률 제XXXXX호 …) 부칙 제53조」로 바꾸면 파싱된 lawAbbr가 `"조특법 부칙"` → `"조특법 법률"`로 바뀌어 위 unverifiable 테스트가 즉시 빨개진다. `UNVERIFIABLE_LAW_NAMES` 키를 함께 갱신해야 한다.

**미검증(그대로 유지)**: `PUBLIC_EXPROPRIATION_RATES.LEGACY = {cash:0.20, bond:0.25, bond3y:0.40, bond5y:0.50}`(`:10`)의 요율 정확성과 게이트 조건(고시일 ≤2015-12-31 & 양도일 ≤2017-12-31, `:33-34·174-177`)은 본 검증에서도 확인하지 못했다(MCP 과거 시행본 NOT_FOUND). 「확인 필요」.

**근거**

코드 원문 `lib/tax-engine/legal-codes/transfer.ts:122-123`:
```
/** 조특법 부칙 제53조 — 공익사업 수용 감면 종전 감면율 경과조치 */
REDUCTION_PUBLIC_EXPROPRIATION_TRANSITIONAL: "조특법 부칙 제53조",
```
이 문자열은 `public-expropriation-reduction.ts:301-303`의 `legalBasis`와 `:270-274` 경고 문구를 통해 결과 화면에 그대로 노출된다.
조특법은 매년 개정되어 부칙이 다수 존재하므로 「조특법 부칙 제53조」만으로는 특정되지 않는다. 아울러 이 상수가 게이트하는 `PUBLIC_EXPROPRIATION_RATES.LEGACY = { cash: 0.20, bond: 0.25, bond3y: 0.40, bond5y: 0.50 }`(`public-expropriation-reduction.ts:11`)의 요율과 적용 조건(고시일 ≤ 2015-12-31 & 양도일 ≤ 2017-12-31, `:33-34·:174-177`)은 **본 리뷰에서 확인하지 못했다** — 과거 시행본·부칙이 MCP `efYd`/MST 조회로 NOT_FOUND였다.

**실패 시나리오**

고시일 2014-05-01·양도일 2017-06-01의 §77 감면 → 결과 화면 경고 「… 종전 감면율 적용 (조특법 부칙 §53)」 + legalBasis 「조특법 §77 + 조특법 부칙 제53조」. 사용자가 링크·검색으로 원문에 도달할 수 없다. 올바름: 「조특법(법률 제XXXXX호, 2015-12-15 일부개정) 부칙 제53조」처럼 법률 번호·공포일 포함.

**세액 영향**: 세액 무영향 — 표시/인용 (단 LEGACY 요율 자체의 정확성은 미검증)

**처방**

부칙 원문을 확보해 법률 번호·공포일을 상수에 포함시키고, 같은 원문으로 LEGACY 요율 4개와 적용 조건(고시일·양도일 경계)을 검증한다. `lib/legal-verification/manifest/additions-transfer.ts`에도 부칙 항목을 등록해 `verify:legal` 사각지대를 없앤다.

---

## [D8-04] §133 후단 「자산양도의 순서에 따라 합산한다」 미구현 — 한도 초과분을 소득 비례로 배분한다

- **위치**: `lib/tax-engine/transfer-tax-aggregate-reduction-step.ts:239`
- **조문**: 조특법 §133①·② 각 후단
- **유형**: legal-accuracy · **차원**: §133 한도·§127⑦ · **검증**: 생존 1/1
- **심각도 조정**: medium → low (검증 결과)

**결함**

조특법 §133①·② 각 후단의 「감면받는 양도소득세액의 합계액은 자산양도의 순서에 따라 합산한다」가 구현돼 있지 않다. 한도 초과분을 나중 양도분부터 배제하는 대신, ①그룹 내 유형 간에는 조문 선언 순서 × 원시감면액 비례(`aggregate-reduction-limits.ts:145-160`), ②유형 내 자산 간에는 입력 순서 × `reducibleIncome` 비례(`transfer-tax-aggregate-reduction-step.ts:236-244`)로 안분한다. 두 지점 모두 `transferDate`를 보지 않는다.

단, 세액 영향은 **현재 도달 불가**다. 배분액이 세액을 바꾸는 유일한 경로인 농특세 판정(`computeAggregateTaxCreditRuralSurtax`)에서 판정을 가르는 `isSelfCultivatedExpropriatedLand`가 다건 ⑬(`lib/calc/multi-transfer-tax-api.ts`)·⑭(`app/api/calc/transfer/multi/route.ts`) 어디에도 배선돼 있지 않아(각 0건) 항상 undefined이고, 그러면 §133 두 한도 그룹 모두 그룹 내 농특세 판정이 균일해져 배분을 어떻게 갈라도 총 농특세는 floor 잔차 (n−1)원 이내로만 달라진다. 제보가 든 20,000,000원 차이는 순수 엔진 직접 호출(`rural-surtax-tax-credit.anchor.test.ts:173` RS-20 형태)에서만 발현한다.

⇒ 현행 실효 영향은 (a) 결과 화면 자산별 감면세액 표시가 조문 순서 규칙과 불일치, (b) ⑬⑭ 배선 갭이 메워지는 즉시 농특세 오차로 전환되는 잠재 결함. 본세 결정세액은 불변이다(`transfer-tax-aggregate.ts:129` — 세액 경로는 이 배분값을 읽지 않는다).

**근거**

조문(MST 280409 실독): §133① 「… 이 경우 감면받는 양도소득세액의 합계액은 자산양도의 순서에 따라 합산한다.」 §133②도 동일 후단.

그룹 내 **유형 간** 안분 — `aggregate-reduction-limits.ts:146-155`:
```ts
for (let i = 0; i < typesInGroup.length; i++) {
  ...
  capped = Math.floor((totalCapped * raw) / totalRaw);
```
`typesInGroup`은 `group.types.filter(...)`라 **조문 선언 순서**이고 양도일이 개입하지 않는다.

자산 간 배분 — `transfer-tax-aggregate-reduction-step.ts:217-244`:
```ts
assetRecords.forEach((r, idx) => { ... });
...
const share = Math.floor(
  entry.cappedAggregateReduction * (reducible / entry.totalReducibleIncome),
);
```
`assetRecords`는 `input.properties` 입력 순서 그대로다(`transfer-tax-aggregate.ts:169` `input.properties.map((item, assetIdx) => ...)`), 그리고 이 파일·`transfer-tax-aggregate.ts` 어디에도 `transferDate` 기준 정렬이 없다(`grep -n "sort" lib/tax-engine/transfer-tax-aggregate.ts` → 히트 0, `transferDate`는 `:318` 비교과세 그룹핑 한 곳뿐).

총 감면액은 같으므로 결정세액은 불변이지만, **자산별 배분액이 농특세 판정의 base**다 — `:268-277`:
```ts
for (const [idx, allocated] of reductionAllocations) {
  ...
  const verdict = resolveTaxCreditRuralSurtax({ ..., reductionAmount: allocated, isSelfCultivatedExpropriatedLand: ... });
```
그리고 §77은 「직접 경작한 토지」만 농특세 비과세다(농특세령 §4①1호 실독: 「제77조[「조세특례제한법」 제69조제1항 본문에 따른 거주자가 직접 경작한 토지(8년 이상 경작할 것의 요건은 적용하지 아니한다)로 한정한다]」). 자산마다 비과세/과세가 갈리므로 배분 방식이 농특세액을 바꾼다.

**실패 시나리오**

2026년에 토지 A(§77 공익수용, 직접 경작 → 농특세 비과세, 감면 원시 200,000,000)를 3월에, 토지 B(§77 공익수용, 직접 경작 아님 → 농특세 과세, 감면 원시 200,000,000)를 10월에 양도. §133②1호 연간 한도 2억이 걸려 총 감면 200,000,000. → 현재 출력: 두 자산에 소득 비례로 100,000,000씩 배분 → 농특세 = 100,000,000 × 20% = 20,000,000. → §133② 후단(양도 순서 합산)상 올바른 배분: 먼저 양도한 A가 200,000,000을 채우고 B는 0 → 농특세 = 0. (순서가 반대면 반대 방향으로 어긋난다.)

**세액 영향**: 위 사례 농어촌특별세 20,000,000원 과다. 결정세액(양도소득세 본세)은 불변이며, 자산별 감면 표시액도 조문 순서와 어긋난다.

**처방**

`allocateAggregateReductions`의 `idxList`와 `applyAnnualLimits`/`applyFiveYearLimits`의 그룹 내 배분을 **양도일 오름차순 순차 소진(먼저 양도한 자산이 한도를 먼저 채우고 잔여를 다음 자산에 넘김)**으로 바꾼다. 잔액 흡수는 마지막(가장 늦게 양도한) 자산이 담당하게 두면 `Σ = capped` 불변식은 유지된다. 양도일 동일 시 tie-break 규칙을 명시할 것.

---

## [D8-09] §133 한도 안분이 safeMultiplyThenDivide 대신 소수 나눗셈·직접 곱셈을 쓴다

- **위치**: `lib/tax-engine/transfer-tax-aggregate-reduction-step.ts:239`
- **조문**: 저장소 정수 연산 규칙(applyRate/safeMultiply) · 조특법 §133 안분
- **유형**: arithmetic · **차원**: §133 한도·§127⑦ · **검증**: 생존 1/1

**결함**

**주장의 절반은 실증되고, 절반(실패 시나리오 전체)은 반증된다.**

**(A) 성립 — `transfer-tax-aggregate-reduction-step.ts:239-241` 나눗셈 선행:**
```ts
const share = Math.floor(
  entry.cappedAggregateReduction * (reducible / entry.totalReducibleIncome),
);
```
`safeMultiplyThenDivide(cappedAggregateReduction, reducible, totalReducibleIncome)` 와 **실제로 갈린다**. 재현 사례(구성 40만 중 5건, 비율이 유한소수가 아닐 때):
- `cap=300,000,000 · reducible=1,100,000,000 · total=1,500,000,000`(비율 11/15) → 현행 **219,999,999** vs 정본 **220,000,000**
- `cap=200,000,000 · reducible=244,831,573 · total=425,794,040` → 현행 **114,999,999** vs 정본 **115,000,000**
- `cap=300,000,000 · reducible=878,821,523 · total=1,444,638,120` → 현행 **182,499,999** vs 정본 **182,500,000**

원인은 「2^53 초과」가 아니라 **나눗셈 선행으로 만든 소수 비율의 2회 반올림**이다(11/15의 double 표현이 참값보다 작아 곱한 뒤 floor가 1원 내려간다). memory `feedback_safemul_decimal_apportion_precision` 의 「round 비율 곱 금지 → 대상값으로 직접 안분」이 정확히 이 형태를 금한다.

**(B) 반증 — `aggregate-reduction-limits.ts:153`·`:294` 직접 곱셈 및 주장된 실패 시나리오:**
- 주장이 제시한 계산 `Math.floor((200_000_000 * 500_000_000) / 800_000_000)` 은 **125,000,000**, `safeMultiplyThenDivide(200_000_000, 500_000_000, 800_000_000)` 도 **125,000,000** — 어긋나지 않는다. (1e17 = 2^17·5^17 로 double에 정확히 표현된다.)
- `Math.floor((totalCapped * raw) / totalRaw)` 형식에 대해 **2^53 초과 구간 50만 + exact-divisible 383,347 + near-integer 273만 + 최악 regime 220만 ≈ 600만 케이스**를 돌려 정본 헬퍼와의 불일치 **0건**. 몫이 `totalCapped ≤ 3억`으로 제한돼 상대오차(~2.2e-16)가 결과의 half-ulp 안에 흡수되기 때문이다. **「2^53을 넘어 1원 어긋난다」는 이 두 지점에서 실증되지 않는다** — 정본 헬퍼로 통일하는 것이 규약상 바람직하다는 스타일 논거는 남지만, 결함 근거로는 성립하지 않는다.

**(C) 인용 오류:** 근거가 지목한 경로 `lib/tax-engine/transfer-reductions/aggregate-reduction-limits.ts` 는 **존재하지 않는다**. 실제 경로는 `lib/tax-engine/aggregate-reduction-limits.ts`(라인 153·294는 정확).

**(D) 영향 범위 정정:** 총액 불변식은 `:235`(자산 배분 말단 흡수) 및 `:151-152`·`:292-293`(유형 배분 말단 보정)이 지키므로 **세액 영향 0원**. 어긋나는 것은 자산별 표시 배분액 1원, 그리고 그 값을 base로 삼는 농특세(`computeAggregateTaxCreditRuralSurtax`, `:249~`)이나 1원 × 20% → floor 후 **0원**. 즉 순수 표시 정합 문제다.

⇒ 정정 후 결론: **`:239` 한 곳의 나눗셈 선행만 실제 결함**이며, 처방은 `safeMultiplyThenDivide(entry.cappedAggregateReduction, reducible, entry.totalReducibleIncome)` 로의 치환. `:153`·`:294` 는 이 주장 범위에서 결함으로 확정할 수 없다.

**근거**

`transfer-tax-aggregate-reduction-step.ts:238-241` — 나눗셈을 먼저 해 소수 비율을 만든다:
```ts
const reducible = assetRecords[idx].result.reducibleIncome ?? 0;
const share = Math.floor(
  entry.cappedAggregateReduction * (reducible / entry.totalReducibleIncome),
);
```
반면 같은 파일 `:99-103`은 정본 헬퍼를 쓴다: `safeMultiplyThenDivide(calculatedTax, entry.income, aggregateTaxBase)` (import는 `:15`).

`aggregate-reduction-limits.ts:153` 및 `:294`도 직접 곱셈이다:
```ts
capped = Math.floor((totalCapped * raw) / totalRaw);
```
```ts
capped = Math.floor((fiveYearGroupCapped * annual) / currentGroupTotal);
```
`totalCapped`가 한도값(최대 300,000,000)이고 `raw`가 그룹 합계 초과분이면 곱은 쉽게 1e17 수준이 되어 `Number.MAX_SAFE_INTEGER`(≈9.007e15)를 넘는다.

루트 CLAUDE.md 「정수 연산: 금액은 원(KRW, 정수). `applyRate()`/`safeMultiply()` 사용」 및 memory `feedback_safemul_decimal_apportion_precision`이 정확히 이 패턴을 금한다.

**실패 시나리오**

한 신고에 §77(감면 원시 500,000,000)과 §77의2(감면 원시 300,000,000)가 함께 있어 §133②1호 2억 한도가 걸리는 경우, `applyAnnualLimits`가 `Math.floor((200_000_000 * 500_000_000) / 800_000_000)`을 계산한다. 피연산자 곱 1.0e17은 2^53을 넘어 부동소수 격자(간격 16)에 얹히므로 경계값에서 결과가 1원 어긋날 수 있다. 자산별 배분(`:239`)의 소수 비율 곱셈도 같은 층위다. 올바른 처리: 정본 헬퍼 `safeMultiplyThenDivide(200_000_000, 500_000_000, 800_000_000)`로 BigInt fallback을 태운다.

**세액 영향**: 최대 1원 수준(말단 잔액 흡수 덕에 `Σ = 한도` 불변식 자체는 유지된다). 즉 총 감면액은 어긋나지 않고 항목별 표시액이 1원 흔들릴 수 있다.

**처방**

세 지점 모두 `safeMultiplyThenDivide(a, b, c)`로 교체한다(`transfer-tax-aggregate-reduction-step.ts:239-241`, `aggregate-reduction-limits.ts:153`·`:294`). `aggregate-reduction-limits.ts`는 현재 `tax-utils`를 import하지 않으므로 import 추가가 필요하다(무의존 leaf 유지가 목적이라면 `bigint-round-half-up` 스킬의 로컬 헬퍼 패턴을 쓸 것).

---

## [D9-04] evaluateReduction()은 호출부 0개 dead code인데 문서 2곳이 「단일 진입점」이라고 기술

- **위치**: `lib/tax-engine/transfer-reductions/index.ts:224`
- **조문**: 해당 없음(구조)
- **유형**: wiring · **차원**: 라우터·게이트·도달성 · **검증**: 생존 1/1
- **심각도 조정**: medium → low (검증 결과)

**결함**

`evaluateReduction()`(lib/tax-engine/transfer-reductions/index.ts:224)은 저장소 전체에서 호출부 0건인 Phase 1 잔재이고, 24개 조문 전부에 대해 `isEligible:false` + "Phase 2 본격 구현 예정"을 반환하는데도 `lib/tax-engine/CLAUDE.md:26`이 이것을 "감면 23개 조문 라우터 … 단일 진입점"으로 기술한다(바로 윗줄 :25가 그 디렉터리를 "대부분 구현 완료"로 소개해 stale이 강화된다). 전용 사문 타입 `ReductionStubResult`(types.ts:77)·`ReductionEvaluationInput`(types.ts:94, `asset.exclusiveAreaSqm`/`acquisitionPrice`/`region` 판독부 0곳)도 함께 남는다. 실제 진입점은 `calcReductions`·`resolveIncomeDeduction`·`evaluateRental97Lthd`·`resolveHouseCountExclusion` 4계열이다.

단, 원 주장의 다음 두 서술은 실측과 다르다: (a) `index.ts:4`는 오유도 문서가 아니다 — 같은 헤더(:1-14)가 "Phase 1 골격"임과 두 분기 모두 `isEligible:false`를 반환함을 명시한다. (b) "CLAUDE.md의 안내대로 evaluateReduction에 배선한다"는 시나리오는 근거가 없다 — `lib/tax-engine/CLAUDE.md:42-50`의 신기능 워크플로 4번은 `calculate{TaxType}()` 파이프라인 step 추가를 지시하며 `evaluateReduction`을 배선 지점으로 지목하지 않는다. 따라서 결함의 실질은 "잘못된 배선 유도"가 아니라 **디렉터리 트리 주석 1줄의 stale + dead code·사문 타입 잔존**이다.

**근거**

`grep -rn "\bevaluateReduction\b" lib/ app/ components/ __tests__/ e2e/ scripts/` 결과 3건 전부 비호출: `lib/tax-engine/CLAUDE.md:26`(「index.ts # evaluateReduction(input) 단일 진입점 + re-export」) · `index.ts:4`(「단일 진입점 `evaluateReduction(input)`」) · `index.ts:224`(정의부). 테스트도 0건. 함수 본문(:224-248)은 여전히 `isEligible: false` + `"${meta.article} — Phase 2 본격 구현 예정 (현재는 시한 검증만 수행)"`를 반환하지만 `metadata.ts`는 24개 전부 `isFullyImplemented: true`다(:90,:99,:108,… 전건). 전용 사문 타입도 함께 남는다 — `ReductionStubResult`(types.ts:77)·`ReductionEvaluationInput`(types.ts:94)은 `evaluateReduction` 외 참조가 index.ts의 import/re-export뿐이고, `ReductionEvaluationInput.asset`(types.ts:97-101 `exclusiveAreaSqm`/`acquisitionPrice`/`region`)은 읽는 코드가 0곳이다. 실제 진입점은 `calcReductions`(transfer-tax-reductions-calc.ts)·`resolveIncomeDeduction`·`evaluateRental97Lthd`·`resolveHouseCountExclusion` 4계열이다.

**실패 시나리오**

신규 감면 조문을 추가하는 개발자가 CLAUDE.md:26의 안내대로 `evaluateReduction`의 분기에 조문을 배선한다 → 타입 체크·테스트 전건 통과 → 브라우저에서 그 감면을 선택해도 감면세액 0. 올바른 상태: 문서가 실제 진입점 4계열을 가리키거나, dead code와 전용 사문 타입을 제거해야 한다.

**세액 영향**: 세액 무영향 — 배선 오유도(誤誘導)·dead code

**처방**

`evaluateReduction`·`ReductionStubResult`·`ReductionEvaluationInput`을 삭제하고, `lib/tax-engine/CLAUDE.md:26`과 index.ts 헤더를 실제 진입점(`calcReductions` / `resolveIncomeDeduction` / `evaluateRental97Lthd` / `resolveHouseCountExclusion`)으로 정정한다.

---

## [D9-06] §77의3 §17 매수청구 경로의 자산종류 게이트가 UI에 없다 — 주석은 「⑤ UI가 공유한다」고 기술

- **위치**: `lib/tax-engine/transfer-reductions/asset-kind-gate.ts:80`
- **조문**: 조특법 §77의3① · 개발제한구역법 §17①·§20①
- **유형**: wiring · **차원**: 라우터·게이트·도달성 · **검증**: 생존 1/1

**결함**

결함은 성립하나 범위를 두 곳 정정한다.

① **누락된 UI 게이트는 라디오 옵션 한 곳이 아니라 두 층이다.** (a) `components/calc/transfer/UnifiedReductionPanel.tsx:389`의 §77의3 `<StandaloneCheckbox type="gb_designated_land">`에 `allowed` prop이 아예 없어(:413 기본값 `true`) 감면 카드 자체가 모든 자산종류에서 선택된다 — 같은 파일 :336의 self_farming은 `allowed={isReductionAllowedForAssetKind(...)}`를 넘긴다. (b) 그 하위 `app/calc/transfer-tax/steps/Step5.tsx:318-331`의 매수 경로 라디오가 `claim`을 무조건 렌더한다. 다만 §77의3은 `standalone` 카테고리라 카드 단위 게이트(a)는 조문 취지상 정당하다(§77의3은 「토지등」이라 §20 경로에서는 건물 포함) — **결함은 (b) 경로-라디오 층에 한정**되고, 처방도 옵션 단위 `disabled`가 맞다.

② **영향 자산종류는 「주택·분양권」이 아니라 5종이다.** `GB_CLAIM_ROUTE_KINDS`(asset-kind-gate.ts:72-76)가 land·general_building·commercial_building 3종만 허용하므로, `ReductionAssetKind` 8종 중 **housing·building·right_to_move_in·presale_right·redevelopment_apt 5종**이 UI 통과 후 ⑧에서 차단된다(anchor GR-03은 그중 3종만 고정 — presale_right·redevelopment_apt는 anchor 사각지대).

③ **UI가 완전히 침묵하지는 않는다** — `claim` 옵션의 `description`이 「매수대상토지 — 토지분만 감면 대상」이라는 안내를 이미 표시한다. 즉 결함은 「안내 부재」가 아니라 **안내는 있으나 강제(disable)가 없고, 그 판정이 단일 소스 술어를 타지 않는다**는 점이다.

**근거**

asset-kind-gate.ts:78-84 원문: `/** §77의3 **§17 매수청구** 경로를 이 자산 종류에 걸 수 있는가. * `gbPurchaseRoute === "claim"` 일 때만 의미가 있다 — ⑧ validate와 ⑤ UI가 공유한다. */ export function isGbClaimRouteAllowedForAssetKind(assetKind: ReductionAssetKind): boolean { return GB_CLAIM_ROUTE_KINDS.has(assetKind); }` (`GB_CLAIM_ROUTE_KINDS` = land·general_building·commercial_building, :72-76). 호출부 전수(`grep -rn isGbClaimRouteAllowedForAssetKind lib components app __tests__ e2e`): `lib/calc/transfer-tax-validate-reductions.ts:81` 1곳 + 정의·re-export뿐. UI 실측: `app/calc/transfer-tax/steps/Step5.tsx:318-331`이 매수 경로 라디오를 렌더하는데 `options`에 `claim`이 무조건 포함되고 `disabled`·자산종류 판정이 없다(파일 내 `transfer-reductions`/`isGbClaim` import 0건 — grep 확인). 조문 근거는 주석대로다(KoreanLaw MST 280409 §77조의3① 실독: 「… 해당 토지등을 같은 법 제17조에 따른 토지매수의 청구 또는 같은 법 제20조에 따른 협의매수를 통하여 …」).

**실패 시나리오**

assetKind=housing 자산에서 §77의3 → 구역 내 → 「토지매수 청구 (§17)」 선택 → Step5에서는 아무 경고 없이 통과 → 계산 실행 시 validate가 「토지매수 청구(개발제한구역법 §17)는 「매수대상토지」에 대한 제도라 토지분만 감면 대상입니다」로 차단. 올바른 동작: UI에서 `claim` 옵션을 disabled + 사유 표시(자산-종류 게이트 단일 소스 공유)하여 입력 시점에 막는다.

**세액 영향**: 세액 무영향 — 차단 방향이 안전측(validate가 최종 차단). UI↔validate 모순 및 주석 허위

**처방**

Step5.tsx의 매수 경로 `RadioCardGroup`에서 `claim` 옵션에 `isGbClaimRouteAllowedForAssetKind(asset.assetKind)` 기반 disabled+사유를 걸거나, 주석에서 「⑤ UI가 공유한다」를 삭제한다.

---

## [D9-07] §97의3 「아파트 여부」 라디오는 5계층 배선됐지만 평가기가 읽지 않는 사문 필드

- **위치**: `lib/tax-engine/transfer-reductions/types.ts:149`
- **조문**: 조특법 §97의3① · 조특령 §97의3②③
- **유형**: wiring · **차원**: 라우터·게이트·도달성 · **검증**: 생존 1/1

**결함**

§97의3 신 평가기(`evaluateRental973`)는 「아파트 여부」와 「임대주택 유형」 두 입력을 읽지 않는다 — 5계층 배선된 사용자 노출 사문 필드 2건.

- `Rental97EvaluationInput.propertyType`(types.ts:149)과 `rentalHousingType`(types.ts:150)은 폼(`Rental973InputForm.tsx:88-111`) → 스토어(`calc-wizard-asset-reduction.ts:186`) → ④(`transfer-tax-api-reductions.ts:200-201`) → ⑫(`transfer-tax-schema-reductions.ts:134-135`) → 라우터(`rental-97-router.ts:75-76`)까지 실려 `evaluateRental973`에 도달하지만 `rental-97-3.ts` 어디에서도 읽히지 않는다.
- 정정 1 — 「엔진 어디에서도 읽히지 않는다·히트 전건이 다른 축」은 부정확하다. 동의미 필드 `RentalReductionInput.propertyType`(`rental-housing-reduction.ts:59`)이 :351·:427에서 읽혀 `APARTMENT_RESTRICTED_POST_2020_08_18`을 만든다. 다만 그 입력(`rentalReductionDetails`)은 클라이언트 생성 지점이 0개(`transfer-tax-validate-usage-conversion.ts:98`이 「폼에 없다」고 명시)라 UI 라디오와 무관하다 ⇒ 사용자 관점 사문 필드라는 결론은 유지.
- 정정 2(법령 근거 보강) — 「아파트 여부를 요건으로 삼는 규정이 없다」의 진짜 이유는 **적용 대상이 민간건설임대주택으로 한정**되기 때문이다. 조특법 §97의3①은 「민간임대주택법 §2 2호에 따른 민간건설임대주택으로서 같은 조 4호·5호…」이고, 아파트 배제 괄호는 민특법 §2 5호의 「…아파트(도시형 생활주택이 아닌 것)를 임대하는 **민간매입임대주택**은 제외한다」로 매입임대 전용이다. 따라서 §97의3 경로에서 아파트 여부가 요건이 될 여지 자체가 없다.
- 정정 3(처방) — 「요건이라면 판정에 반영」 갈래는 채택 불가. 레거시 :427의 아파트 배제를 신 경로에 이식하면 건설임대 대상 주택을 법 근거 없이 배제하는 불리 적용이 된다. 정본 처방은 두 입력란 제거 또는 안내 텍스트화이며, 레거시 :427이 §97의3에 대해 과잉 배제인지는 별건 검토 대상이다.

**근거**

선언 types.ts:149 `propertyType?: "apartment" | "non_apartment";`. 배선: 폼 `components/calc/transfer/rental/Rental973InputForm.tsx:100-111`(「아파트 여부」 RadioCardGroup) → 스토어 → API `lib/calc/transfer-tax-api-reductions.ts:200 propertyType: r.propertyType,` → 라우터 `lib/tax-engine/transfer-reductions/rental-97-router.ts:75 propertyType: r.propertyType,`. 소비: `grep -rn "propertyType" lib/tax-engine/transfer-reductions/rental-97-3.ts` 0건이며, `lib/tax-engine/` 전체에서 이 필드를 읽는 곳은 없다(히트 전건이 `TransferTaxInput.propertyType`이라는 **다른 축**: redevelopment-dispatch.ts:117·acquisition-tax-rate.ts:81 등). 조문 확인: §97의3①(MST 280409)·조특령 §97의3②③(MST 287181) 전문 실독 결과 요건은 「민간건설임대주택으로서 공공지원/장기일반민간임대」·10년 계속임대·임대료 5%·국민주택규모·기준시가 6억(3억)뿐으로 **아파트 여부를 요건으로 삼는 규정이 없다** ⇒ 세액 무영향이 확정적이지만, 사용자에게는 세액을 가르는 입력처럼 보인다.

**실패 시나리오**

§97의3 감면에서 「아파트」↔「비아파트」를 바꿔 두 번 계산해도 장기보유특별공제·결정세액이 원 단위까지 동일하다. 사용자는 자신의 사실관계가 반영됐다고 오인한다. 올바른 동작: 요건이 아니면 입력란을 제거하거나, 요건이라면(예: 매입임대 아파트 등록 제한 축) 판정에 반영한다.

**세액 영향**: 세액 무영향 — 표시/입력 착시

**처방**

`propertyType` 라디오를 §97의3 폼에서 제거하고 타입·API·라우터의 사문 배선을 정리하거나, 반대로 현행 §97의3①이 **민간건설임대주택**으로 한정된 점(매입임대 배제)을 반영할 입력 축으로 재설계한다. 후자는 신설·개정 부칙 경과규정 확인이 선행돼야 한다(본 리뷰 미확보 — 확인 필요).

---

## [D9-08] 조문 개수 주석이 23개로 고정 — 실제 24개(§77의2 추가 후 미갱신)

- **위치**: `lib/tax-engine/transfer-reductions/metadata.ts:339`
- **조문**: 조특법 §77의2
- **유형**: display · **차원**: 라우터·게이트·도달성 · **검증**: 생존 1/1

**결함**

`ALL_REDUCTION_IDS`는 실측 24개(rental 6 + new_housing 4 + unsold_housing 10 + standalone 4)인데, 이를 「23개」로 서술하는 주석·문서가 코드 전반에 18곳 이상 남아 있다. 다만 이는 「§77의2 추가 후 미갱신」이 아니다 — Phase 1 최초 커밋 `6b40891a` 시점에 엔트리가 **22개**였는데도 주석은 이미 「23개」였다(`docs/00-pm/transfer-reduction-expansion.plan.md:81`의 프로젝트 라벨이 그대로 복사됐고, 그 문서의 산식 6+4+10+2 자체가 22다). 이후 `5eba9d68` 커밋이 `replacement_land_comp`(§77의2)와 `gb_designated_land`(§77의3)를 **동시에** 추가해 22 → 24가 됐다. 즉 「23」은 어느 시점에도 실측치와 일치한 적이 없는 프로젝트 명칭성 라벨이다. stale 지점은 근거에 열거된 6곳(metadata.ts:339, index.ts:2·221, types.ts:1·13, CLAUDE.md:25-27) 외에 metadata.ts:2 · types.ts:44·93 · index.ts:287 · period-check.ts:4·244 · asset-kind-gate.ts:104 · legal-codes/transfer-house.ts:152·155 · types/transfer-reductions-stub.types.ts:2·5 · types/transfer-reduction-input.types.ts:83 · transfer-reduction-type-labels.ts:34을 포함한다. 개수 기반 로직·테스트는 0건이므로(grep 실측) 런타임·세액 영향은 없다. 올바른 상태: 개수를 서술하는 주석은 24로 갱신하되, 「23개 조문 확장」처럼 과거 프로젝트를 가리키는 이력 표현은 구분해 남길 것.

**근거**

실측: `npx tsx`로 `import { ALL_REDUCTION_IDS } from ".../metadata"` 후 `ALL_REDUCTION_IDS.length` = **24**(rental 6 + new_housing 4 + unsold 10 + standalone 4). 주석 원문: metadata.ts:339 `/** 23개 ID 전체 — 라우터 순회용 */` · index.ts:2 `양도세 감면 23개 조문 라우터 (Phase 1 골격)` · index.ts:221 `23개 조문 통합 stub evaluator` · types.ts:13 `/** 23개 조문 식별자 — Phase 1 인벤토리 확정본 */` · types.ts:1 `양도세 감면 23개 조문 골격` · `lib/tax-engine/CLAUDE.md:25-27`(「감면 23개 조문 라우터」·「REDUCTION_METADATA (23개 조문 …)」). 24번째는 `replacement_land_comp`(§77의2, metadata.ts:314-322).

**실패 시나리오**

조문 인벤토리를 주석 기준으로 대조하는 후속 작업(감사·매니페스트 점검)이 23을 기대해 §77의2를 셈에서 빠뜨린다. 올바른 상태: 주석·문서 전부 24개.

**세액 영향**: 세액 무영향 — 주석/문서

**처방**

metadata.ts:339 · index.ts:2·221 · types.ts:1·13 · lib/tax-engine/CLAUDE.md:25-27의 「23개」를 「24개」로 정정한다.

---


# ⛔ 적대적 검증으로 기각된 주장 (재제안 금지)

아래는 탐지 단계에서 제기됐으나 반증에 성공한 것들이다. **같은 주장을 다시 제기하려면 아래 반증 근거를 먼저 무너뜨려야 한다.**

## [D1-09] `RENTAL_VACANCY_GRACE_DAYS` 주석(「초과분만 차감」)과 구현(전액 차감)이 어긋난다

- **위치**: `lib/tax-engine/transfer-reductions/rental-97-shared-helpers.ts:17` · **반증** 1/1

**기각된 주장**: 같은 파일 안에서 공실 처리 규칙 설명이 서로 모순된다 — :17은 「초과분만 차감」, :31과 :45-47은 「실제 일수만큼(전액) 차감」. 조문 근거를 재확인할 때 어느 쪽이 의도인지 판별할 수 없다.

**반증 근거**

인용된 코드 원문은 세 곳 모두 실재한다(:17 `(초과분만 차감)` · :31 `실제 일수만큼 차감` · :45-47 `deductDays += vpDays`). 그러나 주장의 성립 근거 세 축 중 둘이 실측으로 무너진다.

**(1) legacy 보강 근거가 사실이 아니다.** 주장은 "동일한 모순이 `rental-housing-reduction.ts:156-157`·:171-173에도 있다"고 적었으나, `grep -rn "초과분" lib/tax-engine/rental-housing-reduction.ts` 히트는 **:128(`조특법 §133 초과분 감면율`)·:309(`1억 + (초과분 × 50%)`) 둘뿐**이고 둘 다 §133 한도 로직이라 공실과 무관하다. 해당 함수의 실제 주석은 `rental-housing-reduction.ts:156` `* - 공실 6개월(180일) 이상인 구간은 실제 일수만큼 차감`, :168 `// 6개월 이상 공실만 차감` — **양쪽 다 구현과 일치**한다. 즉 legacy에는 모순이 없고, 인용된 file:line은 존재하지 않는 문구를 가리킨다.

**(2) 「어느 쪽이 의도인지 판별할 수 없다」가 성립하지 않는다.** legacy :168의 확립된 표현이 `6개월 이상 공실**만** 차감`(=차감 대상 구간의 선별)이고, :17의 `초과분**만** 차감`은 바로 그 문장의 축약형으로 읽힌다 — 「6개월을 **초과하는** 공실**만** (차감 대상)」. 이 독법에서는 :17·:31·:45-47이 서로 일치하며 모순 자체가 없다. 설령 `초과분`을 「초과 **일수**」로 읽더라도, 같은 파일 :31이 명시적으로 `실제 일수만큼 차감`이라 적고 있고 :45-47 코드가 `deductDays += vpDays`로 명확하므로 **의도는 파일 안에서 이미 판별된다**. 6단어 괄호구의 중의성이지 「서로 모순」이 아니다.

**(3) 조문은 구현 쪽을 지지한다 — 주장이 제시한 「올바른 출력」과 구현이 이미 같다.** 조특령 §97의5①1호 verbatim: 「기존 임차인의 퇴거일부터 다음 임차인의 주민등록을 이전하는 날까지의 기간으로서 **6개월 이내의 기간**」을 「해당 기간 동안 계속하여 임대한 것으로 본다」. 200일 공실은 「6개월 이내의 기간」에 애초에 해당하지 않으므로 의제가 **전혀 적용되지 않고**, 200일 전액이 계속임대에서 빠진다 = 현행 구현. 주장 스스로도 "어느 쪽도 「초과분만 차감」이 아니다"라며 구현이 옳음을 인정하고 있다. ⇒ 세액 영향 0, 법령 오적용 0, 인용 오류 0(§97의5①1호 인용 자체는 본문과 정확히 일치하므로 결과화면 링크 오작동 위험도 없다).

**부수 실측(주장과 별개의 진짜 갭).** scratchpad 프로브로 두 변형을 비교하니 기존 anchor는 이 축에 **구별력 0**이었다: A-2(213일) full=9년 / excess-only=9년, LR-08b(212일) full=8년 / excess-only=8년, 주장의 200일 예시도 full=9 / excess-only=9. 즉 주장이 그린 오리팩터가 실제로 일어나도 **현행 테스트는 잡지 못한다**. 다만 이는 「주석 드리프트」가 아니라 **anchor 구별력 부재**라는 다른 층위의 사안이며, 주장이 지목한 위치·성격과 다르다. 조치가 필요하다면 :17 괄호구를 :31과 같은 표현(`6개월 이상 구간은 전액 차감`)으로 통일하는 1줄 문구 정리 + 차감량을 구별하는 anchor 1건 추가이지, 「구현과 주석이 어긋난다」는 결함 보고는 아니다.

---

## [D3-07] legacy 시드 `99-3-main` 지역·최초분양 요건이 조특령 §99의3①·법 §99의3①2호와 불일치 (근거 없는 불리 배제)

- **위치**: `lib/tax-engine/data/transfer-rate-seed.ts:293` · **반증** 1/1

**기각된 주장**: §99의3의 적용제외 지역은 조특령 §99의3①의 「서울특별시, 과천시 및 분당·일산·평촌·산본·중동 신도시」인데 시드는 `region: "outside_overconcentration"`(수도권 과밀억제권역 외)이라는 조문에 없는 개념을 쓰고, `requiresFirstSale: true`로 §99의3①2호(자기건설 신축주택)를 통째로 배제한다.

**반증 근거**

인용된 코드 리터럴과 조문 본문은 모두 실측 일치한다. 그러나 「근거 없는 불리 배제 · 62,491,444원 부인」이라는 결함 서술은 두 방향에서 반증된다.

**(1) 코드 도달성 — 실제 §99의3은 다른 파일이 정확하게 구현하고 있다.**
`newHousingDetails`는 저장소 전체에서 **생산자가 0건**이다(Zod 정의 `lib/api/transfer-tax-schema-sub.ts:156`, route 매핑 `app/api/calc/transfer/engine-input.ts:230`·`app/api/calc/transfer/multi/route.ts:253` 외에 `lib/calc/**`·`components/**` 어디에도 조립 코드가 없다). 즉 `transfer-rate-seed.ts:293`의 `99-3-main` 항목은 제품 UI 어느 경로에서도 발화하지 않는다.

앱이 실제로 계산하는 §99의3은 `lib/tax-engine/transfer-reductions/new-99-3.ts`(2026-05-06 Phase 2 본격 구현)이며, 주장이 지적한 두 축을 **조문대로** 갖고 있다:
- 지역: `new-99-3.ts:69` `region: "outside_speculation" | "speculation"`, `:243-246` `if (input.region === "speculation") { … "가격 급등 지역(서울·과천·5대 신도시) 내 신축주택은 §99의3이 적용되지 않습니다" }` — 조특령 §99의3①의 열거(서울·과천·분당·일산·평촌·산본·중동)와 정확히 같은 축. UI 라벨도 `New993InputForm.tsx:255` 「가격 급등 지역(서울·과천·5대 신도시) — 적용 배제」.
- 취득유형: `new-99-3.ts:78` `acquisitionType: "from_builder" | "self_built"`, UI `New993InputForm.tsx:240-241` `<SelectItem value="from_builder">1호 — 주택건설사업자로부터 취득</SelectItem>` / `<SelectItem value="self_built">2호 — 자기건설 신축</SelectItem>`, validate `lib/calc/transfer-tax-validate-reductions.ts:122-126`(2호는 사용승인일 필수). ⇒ **법 §99의3①2호(자기건설)는 「통째로 배제」되어 있지 않다.**

따라서 「인천 소재 2002년 취득 신축주택이 REGION_NOT_ELIGIBLE로 감면 0이 된다」는 실패 시나리오는 제품 사용자에게 발생하지 않는다. 사용자는 §99의3 감면(`new_99_3`)에서 「가격 급등 지역 외」를 선택해 정상 감면을 받는다. 주장이 제시한 62,491,444원의 「전액 부인」은 발생하지 않는다.

**(2) 조문 해석 — 제안된 방향의 수정은 오히려 법 근거 없는 감면을 활성화한다.**
레거시 항목의 감면 산식 자체가 조문과 무관하다. `new-housing-reduction.ts:134-145`의 `calculateReducibleGain`은 **일수 안분**(`ratio = reductionDays / totalDays`, 1826/2922=0.62491 — 제보 수치 62,491,444가 바로 이 값이다)인데, 조특령 §99의3②2호는 「양도소득금액 × (신축주택 취득일부터 5년이 되는 날의 **기준시가** − 취득 당시 기준시가) ÷ (양도 당시 기준시가 − 취득 당시 기준시가)」라는 **기준시가 안분**을 명문으로 정한다. 즉 이 레거시 항목은 지역·최초분양 게이트를 고쳐도 조문에 맞지 않으며, 게이트를 푸는 것은 **명문에 없는 일수 안분 감면을 새로 열어주는 결과**가 된다. 결함 처방으로서 잘못된 방향이다(정본은 `new-99-3.ts`의 기준시가 안분 — `new-99-3.ts` 헤더 주석의 산식과 부호별 처리 참조).

**(3) 남는 것.** 실재하는 잔여 사실은 「§99의3이 두 곳에 이중으로 존재하고, 그중 레거시 쪽(`99-3-main` + `newHousingDetails` API 표면)이 조문과 불일치한 채 남아 있다」는 **정리(dead surface) 이슈**다. 세액 영향은 UI 경로에서 0이고, 조문 인용 자체(`article: "§99의3"`)는 2026-05-06 매핑 감사에서 이미 정정되어 링크 오작동도 없다(`transfer-rate-seed.ts:286-288` 주석). ⇒ medium이 아니라 low(정리 대상).

---

## [D4-04] 다건 합산에서 specialHouseExclusions를 validate가 전면 차단하나 엔진·route는 완전 배선돼 있다

- **위치**: `lib/calc/multi-transfer-tax-validate.ts:110` · **반증** 1/1

**기각된 주장**: ⑧ validate가 `specialHouseExclusions`가 하나라도 있으면 다건 계산 자체를 「단건 계산기에서만 지원됩니다」로 막는데, ⑫ Zod·⑭ route·집계 엔진은 이미 자산별로 그 값을 주입해 정상 동작한다. 근거 없는 dead-end다.

**반증 근거**

주장의 핵심 전제 —— 「⑫ Zod·⑭ route·집계 엔진은 이미 배선돼 정상 동작하는데 ⑧만 막는 근거 없는 dead-end」 —— 가 **④/⑬에서 실측으로 반증된다**.

1) **⑬가 그 값을 보내지 않는다.** 다건 클라이언트→API 변환기 `lib/calc/multi-transfer-tax-api.ts`의 `callMultiTransferTaxAPI` body(:330-365)에는 `taxYear`·`properties`·`annualBasicDeductionUsed`·`basicDeductionAllocation`·`priorPaidTax(Local)`·`priorReductionUsage`·`amendment`만 있고 `specialHouseExclusions`가 **없다**. 저장소 전수 grep(21 히트)에서도 `multi-transfer-tax-api.ts`는 단 한 번도 걸리지 않는다(단건은 `lib/calc/transfer-tax-api.ts:569`에 있다). 즉 route의 `data.specialHouseExclusions ?? []`(:116)는 **항상 빈 배열**이다.

2) **⑫도 자산별로는 받지 않는다.** `specialHouseExclusions`는 단건 `propertySchema`(:513)와 다건 **신고서-레벨** `multiInputSchema`(:698)에만 있고, `propertyBaseShape`를 쓰는 `propertyItemSchema`(:679-688)에는 없다. 그런데 ⑧ validate가 검사하는 값은 `PropertyItem["form"].specialHouseExclusions` —— **자산별 폼**이다(축 자체가 어긋난다). `priorReductionUsage`처럼 자산별 폼 값을 신고서-레벨로 합성하는 `mergeSpecialHouseExclusions` 류 함수는 존재하지 않는다(grep 3종 키워드 전무).

3) 따라서 ⑧ 차단을 걷어내면 결과는 「이미 배선된 경로대로 계산」이 아니라 **값이 ⑬에서 소실된 채 침묵 오산**이다. 그 방향은 납세자에게 **불리**하다 —— `transfer-tax-house-exclusion-step.ts:42`가 `householdHousingCount`를 줄이지 못해 1세대1주택 비과세 판정 주택수가 부풀고, 주장이 「우회 시 발생한다」고 적은 바로 그 손해(건당 최대 12억 비과세 상실)가 **차단을 푼 정상 경로에서** 발생한다. 파일 상단 주석(:38-46 "침묵 오산보다 명시 차단이 안전하다")과 정확히 일치하는 의도된 가드이며, 회귀 anchor(`multi-transfer-api-sync.test.ts:297`)도 이 차단을 고정하고 있다.

4) 참고로 주장이 근거로 든 `transfer-tax-aggregate.ts:170-178`의 spread는 `input.properties`(= Zod `propertyItemSchema` 통과분)를 spread하는 것이고, route가 `specialHouseExclusions`를 주입하는 지점은 그 앞 `base` 객체 조립부다 —— 주입 자체는 사실이나 **주입할 원본이 언제나 비어 있다**는 점이 빠졌다. 「배선 완료」의 판정은 5단 파이프라인 전체(④⑬→⑫→⑭)로 해야 하고, 한 층이라도 끊기면 dead-end가 아니라 **가드가 필요한 상태**다.

5) 주장의 부수 지적(house_count_exclusion 3종은 `ALL_INCOME_DEDUCTION_IDS` 11종에 없어 다건에서 허용된다)은 코드 사실로는 맞다(income-deduction-router.ts:42-54에 `new_99_4_rural`·`new_99_4_hometown`·`unsold_98_9` 없음). 다만 그 3종은 **자산별 `reductions[]` 축**이고 `specialHouseExclusions`는 **세대-보유 주택 선언 축**이라 서로 다른 입력 경로다 —— 「같은 축인데 처리가 엇갈린다」는 서술도 부정확하다. 이 3종의 다건 정합성은 별개 쟁점이며 이 주장으로는 성립하지 않는다(미검증 — 확인 필요).

결론: 결함이 아니다. 남는 것은 「다건 합산은 모드 2 미지원」이라는 **문서화·anchor로 고정된 기능 한계**이며, 개선하려면 ⑧ 완화가 아니라 ④⑬ 합성 + ⑫ 추가가 선행돼야 한다(기능 요청, low).

---

## [D5-04] §99의2 「6억 이하 이거나 85㎡ 이하」 OR 요건인데 가액·면적 두 값을 모두 필수로 요구

- **위치**: `lib/tax-engine/transfer-reductions/unsold-hybrid.ts:474` · **반증** 1/1

**기각된 주장**: §99의2의 가액·면적 요건은 「6억 이하 **이거나** 85㎡ 이하」(둘 다 초과할 때만 제외)인데, 취득가액이 6억 이하로 이미 요건을 충족해도 연면적 미입력이면 MISSING_AREA로 불적격 처리한다.

**반증 근거**

인용된 코드와 조문은 실재하며 probe도 주장대로 재현된다(A 케이스 = MISSING_AREA). 그럼에도 "결함"으로 보기 어렵다.

1) **판정 로직 자체는 법령과 정확히 일치한다.** 배제는 unsold-hybrid.ts:479-483에서 `hasPrice && hasArea && price > 6억 && area > 85`의 AND이고, 이는 령 §99의2②1호·⑤1호(「6억원을 **초과하고** … 85제곱미터를 **초과하는**」)의 정본 독법이다. 즉 세액이 틀리게 산출되는 경로가 없다. probe D도 그렇게 동작한다. 주장이 지목한 것은 산식 오류가 아니라 **입력 완결성 가드** 2건이다.

2) **「감면 0 상실」은 제품 플로우에서 발생하지 않는다.** 주장의 실패 시나리오는 "MISSING_AREA로 불적격 → 감면 0"이라고 적었으나, 실제로는 그 앞단 ⑧ validate가 계산 자체를 차단한다 — lib/calc/transfer-tax-validate-reductions.ts:363-364 `if (!(parseDecimal(r.exclusiveAreaSqm992 || "") > 0)) return fail("§99의2 적용: 연면적(공동주택·오피스텔은 전용면적, ㎡)을 입력하세요.")`. 사용자는 조용히 0원을 받는 것이 아니라 **무엇을 입력하라는 지시문**을 받는다. 이는 이 저장소의 확립된 정책(CLAUDE.md 「자동 안분 fallback 금지 — 미입력은 검증 오류로 차단」)의 정상 동작이지, 법 근거 없는 불리 적용이 아니다.

3) **입력 경로가 실재하고 UI가 OR 규칙을 정확히 고지한다.** Unsold992InputForm.tsx:141 섹션 제목이 「가액·면적 요건 (**하나만 충족해도 적용**)」이고, :154 DecimalInput + :159-161 hint 「6억원 이하이거나 85㎡ 이하 — 둘 다 초과하는 경우에만 제외됩니다」. 값은 ReductionStdPriceSection.tsx:115-117에서 주소 조회 응답의 `exclusiveArea`로 자동 채워지기도 한다(§99의2는 :250 `showExclusiveArea={false}`라 전용 조회 버튼만 숨김). 「입력 경로가 없다」가 아니라 **채우면 되는 필드**다(memory `feedback_blocked_message_is_not_missing_input_path`와 동일 구도).

4) **「연면적을 확인할 수 없는」 적격 납세자는 성립하기 어렵다.** 조특령 §99의2⑧·⑪·⑫는 시장·군수·구청장의 확인 날인을 받은 **매매계약서 사본 제출**을 적용 요건으로 하고(엔진도 :540-545 NO_CONFIRMATION_SEAL로 이를 강제한다), 그 계약서에 거래가액과 면적이 함께 기재된다. 면적만 영구히 알 수 없는 적격 사안은 실무상 상정하기 어렵다.

5) 잔여로 인정할 수 있는 것은 「price ≤ 6억이면 MISSING_AREA를, area ≤ 85㎡이면 MISSING_PRICE를 생략해도 된다」는 **논리적 잉여 요구**뿐이다(두 검사는 대칭이라 MISSING_PRICE도 같은 성질이다). 세액 영향 0, 인용 오류 없음(:472·:477·:485 legalBasis 전부 조문과 일치) ⇒ medium이 아니라 low 수준의 UX 개선 여지다.

---

## [D5-06] §95② 표2 공제율 함수가 호출부 0개 — 엔진은 같은 산식을 별도 복제해 쓴다(테스트가 dead copy만 검증)

- **위치**: `lib/tax-engine/transfer-reductions/unsold-hybrid-p4.ts:32` · **반증** 1/1

**기각된 주장**: `table2HoldingRate`는 프로덕션 호출부가 0개이고, 실제 세액을 만드는 transfer-tax.ts:646이 같은 산식을 인라인으로 복제한다. 단위테스트는 사용되지 않는 복제본만 단언하므로 실제 경로의 회귀를 잡지 못한다.

**반증 근거**

주장의 **사실 조각 2개는 참**이다: (a) `table2HoldingRate`는 프로덕션 호출부 0개(unsold-hybrid-p4.ts:32 정의 · transfer-reductions/index.ts:202 재export · 테스트 5줄이 전부), (b) 세액을 만드는 코드는 transfer-tax.ts:647의 별도 리터럴 `const rate982 = holdingPeriod.years >= 3 ? Math.min(holdingPeriod.years * 0.04, 0.4) : 0;`이다(주장의 :646은 1줄 오기).

그러나 이 주장의 **핵심 명제 — 「단위테스트는 사용되지 않는 복제본만 단언하므로 실제 경로의 회귀를 잡지 못한다」 — 는 실측으로 반증된다.** 근거를 든 바로 그 파일 `__tests__/tax-engine/transfer-tax/p4-special-integration.test.ts`는 :31-35(단위)로 끝나지 않고 **206줄**이며, :80부터 `describe("P4 통합 anchor")` 블록이 `calculateTransferTax`를 통해 실제 세액 경로를 단언한다. P4-1(:81-107):

```
expect(r.longTermHoldingRate).toBeCloseTo(0.28, 10);
expect(r.longTermHoldingDeduction).toBe(84_000_000);
expect(r.taxBase).toBe(213_500_000);
expect(r.calculatedTax).toBe(61_190_000);
```

이 값들은 **오직 :647에서만** 나온다 — 입력이 householdHousingCount:2라 :640-645의 `isOneHouseSpecial982`가 false로 :647 분기에 진입하고, 표1 경로였다면 7년 = 14%(transfer-tax.ts:643 주석 "표1 14% 대신 강제")여야 하므로 0.28은 :647의 산출물이다. 따라서 주장이 제시한 실패 시나리오의 절반 — 「:647의 `0.04`를 `0.03`으로 바꿔도 통과한다」 — 은 **거짓**이다. taxableGain 300,000,000에 0.21을 곱하면 63,000,000이므로 P4-1의 네 단언이 한꺼번에 깨진다. 즉 안전망은 존재하며, 이 결함의 정체는 「테스트 사각지대」가 아니라 **미사용 export의 산식 중복(코드 위생)** 이다.

반대 방향(「`table2HoldingRate`를 고쳐도 세액이 1원도 안 움직인다」)은 참이지만, 4%/40% 인라인은 이 저장소에서 §95② 표1·표2를 쓰는 5개 파일이 공유하는 **기존 패턴**(transfer-tax-mixed-use-inheritance.ts:42-43 · redevelopment-lthd.ts:381-382 · ltc-table-split.ts:37-38 · FilingFormTableHelpers.ts:235-236)이므로, p4.ts의 미사용 함수만 「단일 소스」라 부르는 것도 부정확하다 — 실제 단일 소스화 대상이라면 5곳을 함께 봐야 하고, 이는 주장이 제시한 범위 밖이다.

법령 측면에서는 다툴 것이 없다. §95② 표2 보유 열은 3년 이상 12%부터 10년 이상 40%(연 4% · 40% 상한)로, 두 복제본 모두 법문과 일치한다(MCP 본문 확인). 세액 영향 0, 인용 오류도 없다.

**잔여로 살아남는 것은 훨씬 좁은 사실 하나뿐이다**: :647의 `>= 3` 경계와 `0.4` 상한에는 §98의2 경로의 anchor가 없다. P4-2는 보유 1년 6개월(years=1)이라 `>=3 → >=2` 뮤테이션을 구별하지 못하고, 13년 케이스인 P4-3·P4-5는 LTHD를 단언하지 않는다(P4-4는 §98의4 = 표1 경로). 이는 「회귀를 못 잡는다」가 아니라 **경계값 2건 미커버**이며, 세액 무영향 · 안전망 부분 존재이므로 severity는 low가 정확하다.

---

## [D5-09] §98의2·§98의3·§98의5·§98의6 세율 특칙이 인용 조문보다 넓게 §104①2호까지 배제한다 (확인 필요)

- **위치**: `lib/tax-engine/transfer-reductions/unsold-hybrid-p3.ts:57` · **반증** 1/1

**기각된 주장**: 네 조문은 모두 「소득세법 제104조제1항**제3호**에도 불구하고」만 규정하는데(현행 3호 = 보유 1년 미만), 구현은 1년 미만(3호)과 1년 이상 2년 미만(2호)의 특례세율을 모두 배제한다.

**반증 근거**

**주장은 조문의 「불구하고」 절만 읽고 그 뒤에 이어지는 「각 호」 본체를 읽지 않아 성립하지 않는다.**

네 조문 모두 구조가 동일하다 — **「불구하고」는 배제 대상을 열거할 뿐이고, 실제 적용 세율은 이어지는 각 호 제2호가 «적극적으로» 지정**한다:

- 조특법 §98의2① (MST 280409 실독): 「…「소득세법」 제95조제2항 각 표 외의 부분 본문과 같은 법 제104조제1항제3호에도 불구하고 장기보유특별공제액 및 세율은 **다음 각 호의 규정을 적용한다**. … **2. 세율: 「소득세법」 제104조제1항제1호에 따른 세율**」
- §98의3④ / §98의5③ / §98의6③: 「…「소득세법」 제95조제2항 및 제104조제1항제3호의 규정에도 불구하고 장기보유특별공제액 및 세율은 **다음 각 호(의 규정)를 적용한다**. … **2. 세율: 「소득세법」 제104조제1항제1호에 따른 세율**」 (§98의5③·§98의6③은 「다음 각 호를 적용한다」, §98의3④는 「다음 각 호의 규정을 적용한다」 — 문언 차이는 무의미)

즉 **「세율 = §104①1호」가 명령형 정본**이다. §104①1호는 §55① 누진세율이므로, 이 명령이 적용되는 순간 §104①2호(1~2년)든 3호(1년 미만)든 특례세율은 **적용될 여지가 없다**. 「3호만 배제되었으니 2호는 살아 있다」는 독법은 「세율은 1호에 따른다」는 명문과 정면으로 모순된다(2호 40%와 1호 누진을 동시에 적용할 수 없다).

**코드는 이 명령을 정확히 구현한다.** `transfer-tax.ts:733` 주석 「P3 특칙: … 세율 §104①1호 **강제**」, `unsold-hybrid-p3.ts:17` 「세율 §104①1호 **강제**」, `unsold-hybrid-p4.ts:7·116`, `income-deduction-router.ts:367` 「§104①1호 기본세율 적용 (법 §98의2①)」 — 저장소 주석 5지점이 일관되게 **1호 강제**로 서술한다. `transfer-tax-rate-calc.ts:454`가 `resolveShortTermRate`를 통째로 건너뛰어 `shortTermFlatRate = null`이 되고 §55① 누진으로 떨어지는 것이 바로 「§104①1호에 따른 세율」이다.

**주장이 근거로 든 `RATE_SPECIAL_REDUCTION_IDS` 주석(:57)도 인용 오류가 아니다.** 「(법 §98의2①·§98의3④·§98의5③·§98의6③ **각 2호**)」 — 인용한 대상이 바로 세율을 지정하는 각 호 **제2호**다(§98의2는 ④가 없고 ①각호가 세율 규정이므로 「§98의2①」도 정확). 「단기세율(§104①2·3호) 배제」는 **결과의 서술**이지 「불구하고」 절의 인용이 아니다 — 1호 강제의 필연적 귀결을 적은 것이다. 결과 화면 법령 링크가 잘못 열릴 여지도 없다.

**과거 시행본 우려도 결론을 바꾸지 못한다.** 주장이 지목한 호 번호 재편(1년 미만이 2009년 본에서 「제2의2호」였다가 2010-01-01 법률 제9924호로 제3호가 됨 — `short-term-rate-history.ts:15-17`)은 **「불구하고」 절의 지시 대상**에만 영향을 준다. 반면 판정을 가르는 것은 **「세율: §104①1호」** 이고, 같은 실독표가 2005-01-01 본(1호=누진표 직접 규정)·2009-01-01 이후 전 구간(1호=§55①)에서 **1호가 일관되게 기본세율**임을 기록한다. 어느 시점 본문으로 읽어도 답은 「기본 누진세율」로 같다.

**실패 시나리오 반증**: 「§98의2 적격 주택, 2009-06-01 취득 / 2011-01-01 양도(1년 7개월)」에서 문언대로 하면 40%가 아니라 **기본 누진세율**이 정답이다(§98의2①2호). 현재 출력(누진 적용)이 옳다. 기존 anchor P3-7(`p3-hybrid-integration.test.ts:28-59`)이 이미 이 동작을 「40% 단일세율(119,000,000) 대신 기본 누진 93,110,000」으로 고정하고 있고, 대조군(:61)까지 갖췄다. 따라서 주장한 「약 25,350,000원 차이」는 **결함으로 인한 차이가 아니라 특칙이 의도대로 작동한 결과**다. 주장 스스로 「1년 미만은 기본세율인데 1~2년은 40%라는 역전이 생긴다」고 적었는데, 그 역전이 바로 이 독법이 틀렸음을 보여주는 징표다.

세액 영향 0(현행이 정답), 인용 오류 0 ⇒ 결함 아님.

---

## [D7-11] §77 채권 만기보유특약 감면율(35%/45%)에 「공공주택 특별법 등 대통령령으로 정하는 법률에 따른 협의매수·수용」 요건 게이트가 없다

- **위치**: `lib/tax-engine/public-expropriation-reduction.ts:90` · **반증** 1/1

**기각된 주장**: 만기보유 연수만으로 최고 감면율을 적용해, 법정 근거법률 요건을 충족하지 않는 수용에도 채권 기본율의 두 배 가까운 감면을 준다.

**반증 근거**

**코드 인용은 정확하고 조문 인용도 verbatim 정확하다. 그러나 위임 체인을 끝까지 따라가면 이 게이트는 도달 불가능한(non-operative) 요건이다.**

**1. 조특령 §72①이 「채권」 자체를 토지보상법 §63 보상채권으로 한정한다 — 이것이 결정적이다.**

조특령 §72① verbatim: 「법 제77조제1항 각 호 외의 부분에서 "대통령령으로 정하는 채권"이란 … 폐지된 「토지수용법」 제45조 또는 **「공익사업을 위한 토지 등의 취득 및 보상에 관한 법률」 제63조의 규정에 의한 보상채권**(이하 이 조에서 "보상채권"이라 한다)을 말한다.」

즉 20%/35%/45% **채권 트랙에 들어가는 것 자체가** 토지보상법 §63 보상채권을 받았다는 뜻이다(`bondCompensation > 0` = 이 보상채권). 다른 법률의 자체 채권은 애초에 「대통령령으로 정하는 채권」이 아니어서 채권 트랙(기본율 20%)에도 못 들어간다.

**2. 조특령 §72②3호가 바로 그 토지보상법이다.**

§72② verbatim 열거: 「1. 「공공주택 특별법」 2. 「택지개발촉진법」 **3. 「공익사업을 위한 토지 등의 취득 및 보상에 관한 법률」** 4. 그 밖에 제1호부터 제3호까지에 따른 법률과 유사한 법률로서 공익사업에 따른 협의매수 또는 수용에 관한 사항을 규정하고 있는 법률」

⇒ 1번과 결합하면 **채권보상을 받은 모든 경우가 §72②3호를 자동 충족**한다. 토지보상법 §63⑦은 보상채권 발행 주체를 「국가, 지방자치단체, … 공공기관 및 공공단체」로 한정하고, 그 발행은 토지보상법의 협의취득·수용 절차 안에서만 이루어진다.

**3. 4호가 catch-all이라 열거는 닫힌 목록이 아니다.**

§77① 각 호를 §72②에 대조하면 사각지대가 없다:
- §77①**1호**(토지보상법이 적용되는 공익사업) → §72②**3호** 직접 해당
- §77①**3호**(토지보상법 「이나 그 밖의 법률」에 따른 수용) → 그 「그 밖의 법률」은 정의상 "수용에 관한 사항을 규정하고 있는 법률"이므로 §72②**4호** 자동 해당
- §77①**2호**(도시정비법 정비구역) → 도시정비법은 수용·사용 규정을 두므로 §72②4호 해당. 게다가 그 채권도 §72①에 따라 토지보상법 §63 보상채권이어야 하므로 3호도 충족

**4. 따라서 주장의 실패 시나리오가 자기모순이다.**

「대통령령 열거 법률에 해당하지 않는 일반 공익사업의 채권보상 1,000,000,000」은 성립할 수 없다. **채권보상 = 토지보상법 §63 보상채권 = §72②3호 해당**이기 때문이다. 「§72② 미충족 + 채권보상 수령」을 동시에 만족하는 입력 조합이 존재하지 않으므로, 과다감면 30,000,000이라는 세액 영향도 발생하지 않는다.

**5. 부수 확인 — 3년/5년 선택지는 법정 상한과 일치한다.**

토지보상법 §63⑨: 「채권의 상환 기한은 **5년을 넘지 아니하는 범위**에서 정하여야 하며」. 코드의 `bondHoldingYears?: 3 | 5 | null`(`:41`)과 UI 3옵션(`ExpropriationBlock.tsx:188-192`)이 이 상한 안에 있다.

**6. 미확인 사항(결론 불변).**

「공공주택 특별법 등」 괄호 문언이 2025.3.14 개정으로 신설된 것인지 그 이전본에도 있었는지는 MCP 과거 시행본이 NOT_FOUND라 **확인 필요**로 남긴다. 다만 신설이었다 하더라도 위 1~3의 구조(§72① 채권 한정 + §72②3호·4호)는 현행 시행령 본문 그대로이므로 결론은 바뀌지 않는다.

**7. 반대방향 확인 — 「법 근거 없이 불리한 적용」을 만들지 않는지.**

만약 이 주장대로 근거법률 확인 필드를 신설하고 미입력을 「미해당」으로 읽으면, 실제로는 전건이 요건을 충족하는데도 감면율을 20%로 떨어뜨려 **법 근거 없이 납세자에게 불리한 적용**이 된다. 이 저장소의 확립된 금지사항에 정면으로 걸린다.

---

## [D9-05] PeriodCheckContext.usageApprovalDate는 어느 호출부도 채우지 않는 사문 필드 — 자기건설 fallback 주석이 사실과 다름

- **위치**: `lib/tax-engine/transfer-reductions/types.ts:64` · **반증** 1/1

**기각된 주장**: `PeriodCheckContext.usageApprovalDate`는 `rental_97_2`·`new_99`·`new_99_3` 세 규칙의 fallback 체인에 들어 있지만 이 컨텍스트를 만드는 두 곳 모두 값을 넣지 않아 항상 undefined다. 그 결과 「자기건설은 사용승인일로 판정한다」는 주석·설계가 실제로는 취득일 판정으로 조용히 후퇴한다.

**반증 근거**

## 사실관계는 맞다 — 그러나 결론(세액 결함)이 틀렸다

**기계적 사실은 전부 재현된다.** `types.ts:63-64`에 `usageApprovalDate?: Date` 선언이 있고, `period-check.ts:54`(rental_97_2)·`:94`(new_99)·`:103`(new_99_3)이 `c.contractDate ?? c.usageApprovalDate ?? c.acquisitionDate` 체인에서 이를 읽는다. `PeriodCheckContext`를 만드는 프로덕션 지점은 전수 grep 결과 **정확히 둘**이고 둘 다 값을 넣지 않는다 — `rental-97-router.ts:50-66 buildInput`(키 자체 부재)·`UnifiedReductionPanel.tsx:136`(`usageApprovalDate: undefined,`). 즉 「사문 필드」라는 관찰 자체는 참이다.

## 그러나 실패 시나리오가 법적으로 성립하지 않는다

주장은 「사용승인 2001-11-01, **취득(등기) 2002-02-10**」을 전제로 `acquisitionDate` fallback이 시한 밖 판정을 낸다고 한다. **자기건설 건축물의 취득시기는 등기일이 아니다.**

> 소득세법 시행령 §162①4호(MST 286211 본문): "**자기가 건설한 건축물에 있어서는 「건축법」 제22조제2항에 따른 사용승인서 교부일.** 다만, 사용승인서 교부일 전에 사실상 사용하거나 … 임시사용승인을 받은 경우에는 그 사실상의 사용일 또는 임시사용승인을 받은 날 중 빠른 날…"

그리고 §97의2①1호가 대상으로 삼는 것은 「민간임대주택에 관한 특별법」·「공공주택 특별법」상 **건설임대주택** — 임대사업자가 스스로 건설한 주택이다(매입한 것은 2호 매입임대로 갈린다). 따라서 이 자산의 양도소득세 `acquisitionDate`는 **정의상 사용승인일과 같은 날**이다.

⇒ 체인이 `contractDate ?? undefined ?? acquisitionDate`로 축약되어도 **도달하는 날짜는 사용승인일 그 자체**다. 시나리오가 말하는 "조용한 후퇴"는 일어나지 않고, `OUT_OF_PERIOD`도 발생하지 않는다. 산출세액 100% 감면 소실이라는 세액 영향은 **부존재**한다.

단서(사실상 사용일·임시사용승인일이 더 빠른 경우)로 둘이 갈릴 수는 있으나 그때 `acquisitionDate`는 사용승인일보다 **앞선다** — 시한 창(1999-08-20~2001-12-31) 기준으로 통과 방향이거나 실제 완공 시점에 더 가깝다. **납세자 불리 방향의 발현 경로가 없다.**

## 「주석이 사실과 다름」도 과장이다

`rental-97-2.ts:27`의 「건설임대는 사용승인일 fallback (period-check 기존 로직)」은 `period-check.ts:54`에 실재하는 코드를 정확히 기술한다. 게다가 위 §162①4호 때문에 **실효 동작도 주석이 약속한 것과 동일한 날짜**를 쓴다. 주석이 거짓을 말하는 것이 아니라, 필드가 중복(redundant)일 뿐이다.

## §99·§99의3 축은 애초에 이 경로가 아니다

주장도 일부 인정하듯 세액 영향이 없는데, 이유는 「낙관 통과 방향」이어서가 아니라 **경로가 다르기** 때문이다. `evaluateNew993`·`evaluateNew99`는 `checkReductionPeriod`를 호출하지 않는다(grep 0건). 각각 독립 인터페이스 `New993Input`(`new-99-3.ts:38-46`)·`New99Input`(`new-99.ts:46`)의 자체 `usageApprovalDate`를 쓰고, 그 값은 `route-reductions-mapper.ts:79·167`에서 `usageApprovalDate99`/`usageApprovalDate993`로 **실제 채워진다**(`new-99-3.ts:256·280`에서 소비). 즉 §99 계열의 자기건설 판정은 이미 사용승인일로 정확히 작동하고, `PeriodCheckContext` 쪽은 UI 라디오 활성/비활성 표시용 사전판정에만 쓰인다.

덧붙여 `index.ts:224 evaluateReduction`(stub 라우터)은 **호출부 0개 dead code**다 — 이 경로를 근거로 삼았다면 측정 실패였을 것이다.

## 남는 것

세액에 닿지 않는 **중복 선언 1개**뿐이다. 이는 코드 위생 항목이며 medium이 아니라 low다. 인용 오류도 아니므로(선언 주석의 조문 지목 §99①1호·§99의3①2호는 정확하다) low 하한 예외에도 걸리지 않는다.

## 참고 — 이 파일의 진짜 갭은 따로 있다 (D9-05의 주장은 아님)

§97의2①**1호나목**("1999년 8월 19일 이전에 신축된 공동주택으로서 1999년 8월 20일 현재 입주된 사실이 없는 주택")은 정의상 취득일·사용승인일이 **모두 1999-08-20 이전**이라, `period-check.ts:54`의 `within(target, 1999-08-20, 2001-12-31)`에서 **항상 OUT_OF_PERIOD**로 차단된다. `evaluateRental972`에도 나목 분기가 없다. 다만 이 갭은 `usageApprovalDate`를 채워도 해소되지 않으므로 D9-05가 제시한 처방으로는 고쳐지지 않는다 — 별건으로 다뤄야 한다.

---

## [D10-07] 레거시 unsold_housing 감면이 조문 구분 없이 농특세 비과세 처리되고 산출세액 100%를 무조건 감면한다

- **위치**: `lib/tax-engine/transfer-tax-rural-surtax.ts:98` · **반증** 1/1

**기각된 주장**: 레거시 평면 타입 `unsold_housing`은 어느 미분양 조문인지 식별 정보가 없는데도 판정표가 `"exempt"`(§98의3 근거)로 단정해, §98의6·§98의7·§99의2 등 농특세 과세 조문이었던 경우 감면세액×20%가 통째로 빠진다.

**반증 근거**

주장의 핵심 전제 —「레거시 평면 타입 `unsold_housing`은 어느 미분양 조문인지 식별 정보가 없다」— 가 사실과 다르다. 이 저장소는 그 타입을 **§98의3으로 확정**해 네 곳에서 단일하게 취급한다:

1. **법령근거 단일 소스**: `lib/tax-engine/legal-codes/transfer.ts:117` `REDUCTION_UNSOLD_HOUSING: "조특법 §98의3",` — 이 상수가 `transfer-tax-aggregate-pickers.ts:192-193` `case "unsold_housing": return TRANSFER.REDUCTION_UNSOLD_HOUSING;` 와 `transfer-tax-helpers.ts:493` 을 통해 결과 화면 근거로 인쇄된다.
2. **그 타입을 만들던 UI 라벨**: `app/calc/transfer-tax/steps/Step5.tsx:25` `unsold_housing: { label: "미분양주택 감면", desc: "서울 외 미분양 5년 100% (수도권과밀 60%) — §98의3, 2009.2.12~2010.2.11" }` — 사용자가 선택한 항목 자체가 §98의3이었다. §98의6·§98의7·§99의2는 이 레거시 선택지에 **존재한 적이 없다**(이들은 UnifiedReductionPanel의 `unsold_98_6`·`unsold_98_7`·`unsold_99_2` 별도 ID로만 선택된다 — `transfer-tax-rural-surtax.ts:52-56` HYBRID_ARTICLE).
3. **이력 재분류 마이그레이션**: `lib/storage/migrations/reduction-reclassification.ts:64-66` `if (red.type === "unsold_housing") { red.type = isInNew993Period(asset.acquisitionDate) ? "new_99_3" : "unsold_98_3"; }` — 저장소 자신이 이 타입을 §98의3(또는 2001-05-23~2003-06-30 취득분에 한해 §99의3)으로 환원한다. §98의6·§98의7·§99의2로 가는 분기는 없다.
4. `lib/storage/db.ts:114` 주석도 같다.

**조문 실측**: KoreanLaw MCP로 농어촌특별세법 시행령 §4⑦1호 본문을 직접 읽었다 — 「… 제95조의2, **제98조의3, 제98조의5**, 제99조의9, 제99조의11, …에 따른 감면」. **§98의3은 명문으로 열거돼 있다.** 따라서 `TABLE`의 `unsold_housing: "exempt"`(:97-98)와 그 주석 「비과세 — 농특세령 §4⑦1호(§98의3)」는 **법령상 정확**하다. 주장이 든 §98의6·§98의7·§99의2가 열거에서 빠져 과세라는 점(이것 자체는 본문 대조로 맞다)은, 그 조문들이 legacy `unsold_housing`으로 흘러들 경로가 없으므로 이 결함을 성립시키지 못한다. 그 세 조문은 별도 ID로 하이브리드 전용 분기(`transfer-tax-finalize.ts:463-465` `HYBRID_ARTICLE[reductionTypeApplied] === undefined` 가드)에서 이미 농특세를 계산한다.

즉 실패 시나리오(「실제로는 §98의7 취득분이었던 경우」)는 UI·마이그레이션 어느 층에서도 발생할 수 없고, 세액 영향 20,000,000원도 발생하지 않는다.

**부수 관찰(이 주장의 결함은 아님)**: 근거로 인용된 `transfer-tax-reductions-calc.ts:355-356` `amount = calculatedTax;`(지역 무관 100%)는 원문 그대로이며, §98의3의 수도권 과밀억제권역 60% 분기를 무시하는 **과다감면**(납세자 유리 방향)이다. 이는 농특세 축이 아니라 감면율 축의 별개 사안이고, 해당 지역값은 ④(`transfer-tax-api-reductions.ts:61-67`)까지 정상 전달되므로 엔진 분기만의 문제다. 또한 재분류 마이그레이션이 2001-05-23~2003-06-30 취득분을 §99의3으로 보내는데 §99의3은 §4⑦1호 열거에 없다 — 다만 그 경로는 `new_99_3`(소득차감형, `income-deduction-router.ts`)으로 농특세를 따로 계산하므로 이 판정표와 무관하다. 두 건 모두 D10-07의 주장 범위 밖이다.

---

## [D11-06] ExpropriationBlock 라디오 name이 자산별로 구분되지 않음 — 자산 2개 이상에서 그룹 충돌

- **위치**: `components/calc/transfer/ExpropriationBlock.tsx:206` · **반증** ?/?

**기각된 주장**: 자산마다 렌더되는 블록인데 라디오 `name`이 `"exprSelfCultivated"`·`"exprBondYears"` 상수라, 일괄양도에서 두 자산이 모두 공익수용이면 두 카드의 라디오가 같은 네이티브 그룹으로 묶인다. 저장소의 다른 자산별 블록은 모두 assetId/index를 접미한다.

**반증 근거**



---

## [D6-02] §99의4와 §98의9가 동시 적격이면 주택수 제외를 1채만 반영 — 근거 없는 불리 적용

- **위치**: `lib/tax-engine/transfer-reductions/unsold-98-9.ts:222` · **반증** 2/3

**기각된 주장**: 두 조문은 서로 다른 주택을 각각 「소유주택이 아닌 것으로 본다」고 정한 독립 의제 규정인데, resolveHouseCountExclusion은 둘 다 적격일 때 §99의4 1건만 적용하고 §98의9의 주택수 제외를 버려, 3주택 세대가 1주택으로 판정되지 못한다.

**반증 근거**

**기계적 인용은 전부 정확하지만, 법령 해석이 §98의9①의 요건 본문 한 구절을 빠뜨려 실패 시나리오가 성립하지 않는다.**

§98의9①(MST 280409, 시행 2026-01-01) 원문:
「**1주택을 보유한 1세대**(「소득세법」 제88조제6호의 1세대를 말한다)가 2024년 1월 10일부터 2026년 12월 31일까지의 기간 중에 … 준공후미분양주택을 **취득한 후** 준공후미분양주택을 취득하기 전에 보유한 주택을 양도하는 경우에는 …」

즉 §98의9는 「**준공후미분양주택 취득 당시** 1주택 보유」를 **명문 요건**으로 둔다. 주장이 제시한 실패 시나리오의 취득 순서는 ①일반주택 2015-03 → ②농어촌주택 2020-05 → ③준공후미분양 2024-06 이다. ③ 취득 시점에 해당 세대는 ①+② **2주택**을 보유하고 있으므로 §98의9①의 「1주택을 보유한 1세대」 요건이 **문언상 충족되지 않는다**.

여기서 §99의4의 의제가 구제하지 못한다. §99의4① 후단은 「그 농어촌주택등을 해당 1세대의 소유주택이 아닌 것으로 보아 **「소득세법」 제89조제1항제3호를 적용한다**」로 의제의 **적용 범위를 §89①3호로 한정**한다. §98의9①의 「1주택을 보유한 1세대」는 §89①3호의 요건이 아니라 **조특법 §98의9 자신의 진입 요건**이므로, 농어촌주택은 그 판정에서 소유주택으로 **계속 산입된다**. 위임 체인(§98의9④ → 조특령 §98의8)도 이 요건을 완화하는 규정을 두지 않는다(령 §98의8①은 면적·가액·양도자 자격 등 §98의9①2호 위임사항만 정한다 — `unsold-98-9.ts:9-16` 헤더가 옮긴 범위와 일치).

⇒ 주장 시나리오에서 **법령상 올바른 출력은 「§99의4 1채만 제외 → 유효 주택수 2 → 비과세 미적용」**, 즉 **현행 엔진 출력과 동일**하다. 주장이 「법령상 올바른 출력」이라고 제시한 산출세액 0(전액 비과세)과 「약 133,060,000 과대」는 성립하지 않는다. 오히려 주장이 제안하는 가산(sum) 방식으로 바꾸면 이 시나리오에서 **요건 미충족 특례를 적용해 비과세를 잘못 부여**하는 과소과세 결함이 새로 생긴다.

**「근거 없는 불리 적용」이라는 성격 규정도 반증된다.** ⓐ 근거는 §98의9①의 요건 본문에 있고, ⓑ 저장소는 그 근거를 명시적으로 기록해 두었다 — `docs/00-pm/transfer-98-9-unsold.plan.md:71` 「F-4 보수: §98의9 "취득 당시 1주택 보유" 요건상 농어촌주택 보유 중 취득은 요건 위배 가능성, 법리 미확정」. 즉 침묵의 누락이 아니라 **문언 근거 있는 보수적 선택**이고, 사용자에게는 `Unsold989DetailCard.tsx:55`의 `dualExclusionWarning` 안내로 고지된다.

§127⑦ 논증((c))은 그 자체로는 맞다(「감면규정」 문언이라 §89①3호 주택수 의제에는 미치지 않는다). 그러나 현행 코드는 §127⑦을 근거로 삼고 있지 않으므로(§127⑦ max는 `transfer-tax-reductions-calc.ts` 세액감면형 트랙 전용) 이 논증은 결함 입증에 기여하지 않는다.

**잔존하는 좁은 논점(주장이 지목하지 못한 것)**: 취득 순서가 ①일반주택 → ②준공후미분양 → ③농어촌주택인 경우에는 ② 취득 시점 보유주택이 1채뿐이라 §98의9①의 1주택 요건이 **진정으로 충족**되고, §99의4①도 「농어촌주택등 취득 전에 보유하던 다른 주택」 요건을 만족한다(§99의4④가 3년 보유 전 양도도 허용). 이 조합에서는 두 의제가 각각 다른 주택에 대해 독립적으로 성립하고 명문 중복배제가 없으므로, 현행 F-4가 1채만 제외하는 것이 과세측으로 기운다. 다만 ⓐ 이는 §98의9 취득기간(2024-01-10~2026-12-31) 이후에 농어촌주택을 취득한 경우로 범위가 매우 좁고, ⓑ 엔진은 `ruralHouseAcquisitionDate`·`unsoldHouseAcquisitionDate`를 모두 보유하므로 두 취득일 선후로 정밀 분기가 가능하며, ⓒ 계획서가 이미 「법리 미확정 — 외부 확인 후 후속」으로 열어 둔 항목이다. 세액 영향이 실증되지 않았고(예규·심판례 미확인) 대부분의 조합에서 현행 거동이 정답이므로 high가 아니라 low(개선 항목)다. || 코드 인용 (a)는 정확하다. `/Users/mynote/workspace/Property-related-Taxes/.claude/worktrees/transfer-reduction-review/lib/tax-engine/transfer-reductions/unsold-98-9.ts:222-225`는 주장 원문과 글자 단위로 일치하고, 하류 `transfer-tax-house-exclusion-step.ts:41-42`의 `(hceApplied ? 1 : 0)`도 확인했다. 도달성 (d)도 실측 확인 — `metadata.ts:160·264`가 각각 `category: "new_housing"` / `"unsold_housing"`이고 `UnifiedReductionPanel-defaults.ts:71-89 toggleGroupRadio`는 `cat !== category`로 같은 카테고리만 제거하므로 두 조문은 동시 선택된다. (e)도 확인 — `unsold-hybrid-p5.ts:346 excludedCount: entries.filter((x) => x.eligible).length`는 가산이다. §127⑦·⑨ 본문(MST 280409)도 주장대로다.

그럼에도 **주장은 반증된다** — 실패 시나리오가 재현되지 않기 때문이다.

**1) 주장 (b)의 §98의9① 인용이 판정을 가르는 요건을 생략했다.** KoreanLaw MCP로 읽은 §98의9① 본문 서두는 「**1주택을 보유한 1세대**(「소득세법」 제88조제6호의 1세대를 말한다)가 2024년 1월 10일부터 2026년 12월 31일까지의 기간 중에 … 준공후미분양주택을 취득한 후」다. 주장은 이 부분을 「…」로 생략하고 뒤쪽 의제 문언만 인용했다. 반면 §99의4①의 의제는 「그 농어촌주택등을 해당 1세대의 소유주택이 아닌 것으로 보아 **「소득세법」 제89조제1항제3호를 적용한다**」로 **효과 범위가 소법 §89①3호 적용에 한정**된다. §98의9①의 「1주택을 보유한 1세대」는 소법 §89①3호의 요건이 아니라 **조특법 §98의9 자신의 진입 요건**이므로 §99의4의 의제가 그리로 미치지 않는다. 즉 두 조문은 「상호 무관한 독립 의제」가 아니라 **취득시점 주택수를 통해 텍스트상 상호작용**한다.

**2) 주장의 실패 시나리오는 그 자체로 §98의9① 요건을 위배한다.** 제시된 사실관계는 ①일반주택 2015-03 → ②농어촌주택 2020-05 → ③준공후미분양 2024-06-01이다. ③ 취득 당시 세대는 ①+② **2주택**을 보유했으므로 「1주택을 보유한 1세대」가 아니다. 코드는 이 요건을 `unsold-98-9.ts:120-126`의 `wasOneHouseholdAtAcquisition` 사용자 확인 토글(「준공후미분양주택 취득 당시 1세대 1주택 보유 요건」)로 받는데, 시나리오가 「토글 3종 ON」을 전제하는 것은 **사실과 다른 자기신고**를 요구하는 것이다. 따라서 주장이 말하는 「법령상 올바른 출력 = 유효 주택수 1 → 전액 비과세 → 산출세액 0」은 **그 시나리오에서는 성립하지 않는다**. 현행 출력(§99의4만 적용, 3→2, 과세)이 오히려 결과적으로 맞다. 세액 영향 133,060,000원은 주장 스스로 「엔진 미실행」이라 적었고, 무효한 시나리오에서 도출된 값이다.

기존 anchor `__tests__/tax-engine/transfer-tax/unsold-98-9-integration.test.ts:70-100` (B-4)의 픽스처도 같은 결함을 갖는다 — 농어촌 2015-03-01 < 미분양 2024-02-01인데 `wasOneHouseholdAtAcquisition: true`다. 즉 **주장이 겨눈 분기를 태우는 유일한 기존 픽스처 자체가 법적으로 불가능한 조합**이다. (해당 2파일 15건 전부 통과 — 거동은 재현되나 그 거동이 「불리 적용」임을 증명하지 못한다.)

**3) 「근거 없는」이라는 규정도 사실과 다르다.** `docs/00-pm/transfer-98-9-unsold.plan.md:71`에 「F-4 보수: §98의9 "취득 당시 1주택 보유" 요건상 농어촌주택 보유 중 취득은 요건 위배 가능성, 법리 미확정」, `:93`에 「동시 적용 법리(취득 시점 주택수 상호작용) 미확정 — 외부 확인 후 후속」으로 **판단 근거와 미확정 사유가 명시**돼 있다. 결과 화면도 `components/calc/results/transfer/Unsold989DetailCard.tsx:55-64`에서 「§99의4를 우선 적용하여 본 특례의 주택수 제외는 반영되지 않았습니다 (동시 적용 여부는 세무사 확인 권장)」로 **사용자에게 고지**한다. 침묵하는 불리 적용이 아니라 고지된 보수적 미확정 처리다.

**4) 잔여 — 좁은 범위의 실질 갭은 존재한다.** 취득 순서가 ①일반주택 → ②준공후미분양(이때 1주택 보유 ✓) → ③농어촌주택인 경우에는 두 조문이 각자 요건을 모두 충족할 수 있다(§99의4④가 3년 보유 전 양도를 허용하고, `new-99-4.ts:182-186`이 이를 `clawbackWarning`으로 구현해 eligible을 유지하므로 엔진상 도달 가능하다). 이 순서에서는 현행 코드가 1채만 제외해 과세로 기울 수 있다. 다만 ⓐ이 조합을 인정하는 예규·심판례를 주장자도 확인하지 못했고(주장 (f) 자인), ⓑ본 리뷰도 확인하지 못했으며, ⓒ현행 코드가 그 한계를 고지하고 있다.

결론: 제기된 사실관계에서는 결함이 재현되지 않으며, 「독립 의제라 무조건 중첩된다」는 법리 전제도 §98의9① 본문 서두에 의해 성립하지 않는다. 남는 것은 「특정 취득순서에서의 동시 적용 법리 미확정」이라는 이미 문서화·고지된 한계뿐이다.

---

## [D6-03] §98의9 결과 카드가 「중과 주택수 미반영」을 단정 — 소령 §167의3①12호나목과 어긋난다

- **위치**: `components/calc/results/transfer/Unsold989DetailCard.tsx:72` · **반증** 1/1

**기각된 주장**: 결과 카드와 엔진 주석이 「§98의9 준공후미분양주택은 다주택 중과 판정의 주택 수에 반영되지 않는다」고 무조건 단정하지만, 소령 §167의3①12호나목은 바로 그 주택(2024.1.10~2026.12.31 취득·전용 85㎡ 이하·취득가 7억 이하·수도권 밖)을 중과 주택수 산정에서 제외한다.

**반증 근거**

코드 인용은 정확하나 **법령 해석이 뒤집힌다** — 주장이 「조문과 어긋난다」고 한 문장은 조특법 §98의9①의 문언 그대로다.

1. **조문 본문 (KoreanLaw MCP, 조특법 MST 280409 §98의9①)**: 「… 그 준공후미분양주택을 해당 1세대의 소유주택이 아닌 것으로 보아 **같은 법 제89조제1항제3호를 적용한다**.」 효과 범위가 소법 §89①3호로 **명문 한정**돼 있다. §98의9 어디에도 소령 §167의3·§167의10(중과)에 대한 언급이 없다. 따라서 `unsold-98-9.ts:6` 「다주택 중과(소령 §167의3)는 미반영 (R-D)」과 `transfer-tax-house-exclusion-step.ts:22` 「중과는 §167의3 별개」는 **법령상 정확한 범위 서술**이다. 결과 카드의 문장도 카드 제목(「§98의9 — 준공후미분양주택 소유주택 제외」) 아래에서 「이 주택수 제외 효과가 중과 판정에는 반영되지 않는다」는 뜻이며, 「그 주택이 중과 주택수에 산입된다」고 단정하지 않는다.

2. **소령 §167의3①12호나목은 별개 근거이고, 엔진이 이미 그 경로로 제외한다** — 주장 스스로 (c)에서 인정한 대로다. 실측 재확인: `multi-house-surcharge-count.ts:272-282` 나목 4요건(2024-01-10~2026-12-31 · `!isCapital` · ≤85㎡ · ≤7억 · `isUnsoldNewHouse`) → count 제외 `:465-468`, 2주택 backstop `multi-house-surcharge-exclusion.ts:373-380`(주석이 §167의10①12호 준용을 정확히 인용). 입력 경로도 전 계층 완비: `HouseEntryEditor.tsx:175-180`(「준공후미분양」 칩) → `transfer-tax-api-houses.ts:73` → `transfer-tax-schema-sub.ts:202` → `transfer-route-multi-house.ts:45` → `multi-house-surcharge.types.ts:174`. 게다가 필수필드 미입력 시 침묵 미적용을 막는 amber 경고까지 있다(`HouseEntryEditor.tsx:187-192`). ⇒ **sibling 경로가 이미 구현**하고 있으므로 세액 결함이 아니다.

3. **조문 본문 확인 결과 주장이 인용한 §167의3①본문 괄호·12호나목·§167의10①본문 괄호·12호는 전부 실재한다**(MST 286211, 시행 2026-07-01 본문 대조 완료). 다만 「§98의9①의 요건과 **완전히 동일**」은 과장이다 — 나목 4)는 「그 밖에 **재정경제부령**으로 정하는 요건」으로 위임돼 있고(미확인), §98의9는 조특령 §98의8①3~5호·②(양도자=사업주체·시공자 / 최초 매매계약 / 사용검사까지 미분양 선착순 / 시장·군수·구청장 확인 날인 계약서)를 추가로 요구한다. 두 조문은 **핵심 3요건이 겹칠 뿐 동일 집합이 아니다** — 오히려 이 비동일성이 두 입력을 분리해 둔 설계를 정당화한다.

4. **실패 시나리오가 검증되지 않았다** — 문제의 문장은 `Unsold989DetailCard.tsx:39-75` **적격 분기에서만** 렌더된다(불적용 분기 `:18-37`에는 없다). 적격은 §98의9① 「**1주택을 보유한 1세대**」 요건(`unsold-98-9.ts` `wasOneHouseholdAtAcquisition`)을 통과해야 하므로, 주장이 든 「일반주택 + 조정대상지역 주택 + 준공후미분양 = 3주택」은 미분양주택 취득 **후에** 제3주택을 추가 취득한 경로에서만 성립한다. 주장은 그 경로도, 세액 영향도 실측하지 않았다(스스로 「엔진 실측은 수행하지 않았다」고 기재).

⇒ 「조문과 어긋난다」는 판정은 성립하지 않는다. 남는 것은 **문구가 상위 안내(보유주택 목록의 '준공후미분양' 칩)를 교차참조하지 않아 오독 여지가 있다**는 UX 서술 문제뿐이며, 세액 무영향·인용(legalBasis = 조특법 §98의9) 정확이다.

---

# 부록 A — 감면 파이프라인 도달성 실측 지도

# 양도소득세 × 조특법 감면 — 파이프라인 도달성 실측 지도

작업 트리: `/Users/mynote/workspace/Property-related-Taxes/.claude/worktrees/transfer-reduction-review` (origin/master `f437f4b9`)

---

## 0. 요약 — 감면을 실제로 적용하는 지점은 5개 함수뿐

| # | 감면 트랙 | 진입 함수 | 정의 위치 | 호출부(전수) |
|---|---|---|---|---|
| A | **세액감면형** (§127⑦ max) | `calcReductions()` | `lib/tax-engine/transfer-tax-reductions-calc.ts:56` | `transfer-tax-finalize.ts:302` · `transfer-tax-redevelopment.ts:499` · `transfer-tax-multi-parcel-branch.ts:108` · `transfer-tax-rental-housing-step.ts:463` · `transfer-tax-mixed-use-totals.ts:357` (5곳) |
| B | **소득차감형** (11 ID) | `resolveIncomeDeduction()` | `transfer-reductions/income-deduction-router.ts:162` | `transfer-tax.ts:210`(중과배제 선판정) · `transfer-tax.ts:685`(본판정) · `transfer-tax-redevelopment.ts:364` (3곳) |
| C | **LTHD 대체/추가** (§97의3·§97의4) | `evaluateRental97Lthd()` | `transfer-reductions/rental-97-router.ts:111` | `transfer-tax-lthd.ts:403` (**1곳뿐**) |
| D | **주택수 제외** (§99의4·§98의9·특례주택) | `runHouseCountExclusionStep()` | `transfer-tax-house-exclusion-step.ts:20` | `transfer-tax.ts:326`(재개발 apt 한정) · `transfer-tax.ts:381` (2곳) |
| E | **§133 한도** | `applyReductionStatutoryCap()` / `applyFiveYearLimits()` | `transfer-tax-reduction-cap.ts:30` / `aggregate-reduction-limits.ts:227` | 단건계 4곳(`finalize:332`·`redevelopment:525`·`rental-housing-step:483`·`mixed-use-totals:374`) + 다건 `transfer-tax-aggregate-reduction-step.ts:111` |

> ⚠️ `transfer-reductions/index.ts:224` `evaluateReduction()`은 파일 헤더(`:4`)와 `lib/tax-engine/CLAUDE.md:26`이 「23개 조문 **단일 진입점**」이라고 적어 두었으나 **호출부 0개**다(`grep -rn "evaluateReduction" lib/ app/ components/ __tests__/ e2e/` 결과 정의부·주석뿐). 실제 진입점은 위 5개다.

---

## 1. 단건 경로(`transfer-tax.ts` → `-finalize.ts`) 감면 STEP 순서

| 순서 | STEP | 내용 | file:line |
|---|---|---|---|
| 1 | 0.45 | **중과 배제 선판정** — `resolveSurchargeExclusionByReduction(input.reductions, …)` → `isTaxSpecialExemption` 주입 | `transfer-tax.ts:210-216` |
| 2 | 0.5 | 다주택 중과 판정(위 배제 결과 주입) | `transfer-tax.ts:218-223` |
| 3 | 0.9+0.95 | **주택수 제외**(§99의4·§98의9·보유감면주택·§155②③) → `exemptionJudgeInput` | `transfer-tax.ts:378-381` → `transfer-tax-house-exclusion-step.ts:23·29·36` |
| 4 | 4 | **LTHD** — 내부 L-2′에서 §97의3(70% 대체)·§97의4(추가율) | `transfer-tax.ts:629-630` → `transfer-tax-lthd.ts:403-459` |
| 5 | 4.05 | **§98의2 특칙** — 장특 = 양도차익 × 표2 보유율 강제 | `transfer-tax.ts:637-652` |
| 6 | 4.5 | 양도소득금액 = 과세양도차익 − LTHD | `transfer-tax.ts:673-680` |
| 7 | **4.6** | **소득차감형 감면** — `resolveIncomeDeduction` → `transferIncome` 차감 | `transfer-tax.ts:684-701` |
| 8 | 5·6 | 기본공제 → 과세표준 | `transfer-tax.ts:703-729` |
| 9 | 7 | **세율 특칙** — §98 flat 20%(`forceFlatRate20`) / §98의3·5·6·§98의2(`suppressShortTermRate`) → **산출세액** | `transfer-tax.ts:734-749` |
| 10 | 7.5 | **차감형 농특세 2-pass** (감면 전후 산출세액 차 × 20%) | `transfer-tax-finalize.ts:205-286` |
| 11 | **8** | **세액감면형 감면** — `calcReductions` (§127⑦ max) | `transfer-tax-finalize.ts:302-326` |
| 12 | **8.5** | **§133 한도** — `applyReductionStatutoryCap` | `transfer-tax-finalize.ts:332-339` |
| 13 | 8.7 | 하이브리드(5년 내 세액감면) 농특세 = 감면세액 × 20% | `transfer-tax-finalize.ts:344-376` |
| 14 | 9 | **결정세액** = 산출세액 − `cappedReductionAmount` (원 미만 절사) | `transfer-tax-finalize.ts:379-385` |
| 15 | 10.5 | §114조의2 신축·증축 가산세 | `transfer-tax-finalize.ts:411-427` |
| 16 | 10 | **지방소득세** = (결정세액 + §114의2 가산세) × 10% | `transfer-tax-finalize.ts:429-436` |
| 17 | 12 | 신고불성실·납부지연 가산세 | `transfer-tax-finalize.ts:438-446` |
| 18 | 「8.8」 | **세액감면형 농특세** — `resolveTaxCreditRuralSurtax` (라벨은 8.8이나 **실행 위치는 STEP 12 뒤**) | `transfer-tax-finalize.ts:462-490` |
| 19 | 11 | 총 납부세액 = 결정세액+가산세 + 지방소득세 + 농특세 합 | `transfer-tax-finalize.ts:492-499` |
| 20 | 12.5 | 수정신고(경정) | `transfer-tax-finalize.ts:503-508` |

**질문의 「산출세액 → 감면 → 한도 → 농특세 → 지방소득세」 대비 실측 차이 2건**
1. 농특세가 **두 갈래로 쪼개져** 한도 앞(STEP 7.5 차감형·`:205`)과 지방소득세 **뒤**(「8.8」·`:462`) 양쪽에 있다.
2. 지방소득세 base는 결정세액이 아니라 **결정세액 + §114의2 가산세**(`:427·:430`)다.

---

## 2. 조기반환(early return) 전수 — `calculateTransferTax`

`grep -n "return " lib/tax-engine/transfer-tax.ts` 기준 7건(`:351`은 IIFE 내부 `checkExemption` 반환이라 제외).

| # | line | 조건 | 감면 STEP 도달 여부 |
|---|---|---|---|
| E1 | `:125` | `applyFamilyBusinessCgtStep` 결과 존재 (§97의2④ 가업상속) | **도달 O** — `transfer-tax-family-business.ts:287·299`가 `calculateTransferTax`를 **재귀 호출**(옵션 `acquisitionOverride`)하므로 전 STEP이 재귀 안에서 실행. `:311`이 `{...imputedResult, familyBusinessDetail}`로 감면 필드 보존 |
| E2 | `:371` | 재개발/재건축 활성(`isRedevelopmentActive`) | **부분** — `calculateRedevelopmentTax`가 A·B·E를 **자체 구현**(Step C.5 `:364` / F.5 `:499` / F.6 `:525` / F.7 `:542`). **C(§97의3·§97의4 LTHD)·D(주택수 제외 결과)는 미도달** |
| E3 | `:459` | 전액 비과세 + `canEarlyReturnPrhp` + `!hasHousingLandExemptExclusion` | 산출세액 0이라 감면 무의미. D 결과는 `:464-467`로 승계 O |
| E4 | `:488` | `rawInput.parcels` 존재(다필지 §166) | **부분** — A만 도달(`transfer-tax-multi-parcel-branch.ts:108`). **B·C·E 전부 미도달, 농특세 계산 자체 없음** |
| E5 | `:537` | `transferGain <= 0` (양도차손) | 산출세액 0. `reductionAmount: 0` 고정(`transfer-tax-loss-return.ts:136`) |
| E6 | `:573` | §155⑳ 거주주택 특례 적용(`rheResult`) | **부분** — A·E 도달(`transfer-tax-rental-housing-step.ts:463·483`). **B는 의도적 미적용 + 고지**(`:456-517`), **C 미도달**(RHE는 `:560`, STEP 4는 `:630`) |
| E7 | `:752` | 정상 종료 | 전부 도달 |

> **조기반환보다 위에 있는 감면 STEP은 0·0.45·0.9만이다.** STEP 4·4.05·4.6·7·7.5~11은 전부 `:752` 아래이므로, E2·E4·E6은 자기 구현으로 대체하지 않으면 통째로 건너뛴다.

### 2-b. `calcLongTermHoldingDeduction` 내부 조기반환 (트랙 C 전용)

§97의3·§97의4 평가(`transfer-tax-lthd.ts:403`)보다 **위에서** return하는 분기:

| line | 조건 | §97의3/4 도달 |
|---|---|---|
| `:76` | 미등기 | ✗ (§95② 본문 괄호 — 정당) |
| `:81` | 분양권 | ✗ (자산게이트상 무관) |
| `:84` | 승계조합원입주권 | ✗ (동상) |
| `:89` | 중과 적용 중 | ✗ (§95② 배제 — 정당) |
| `:96-154` | 부수토지 일체과세(`propertyType==="land"`) | ✗ (rental 게이트가 land 배제 — 무관) |
| `:157-171` | **레거시 `rentalReductionDetails` override** | **✗ — 레거시가 신규 §97의3을 가린다** |
| `:200-260` | **§95⑤ 비주택→주택 용도변경** | **✗** |
| `:274-337` | **`splitDetail`(토지·건물 분리취득)** | **✗** |
| `:367-399` | **가업상속 LTHD 분해** | **✗** |

---

## 3. 경로 × 감면 트랙 도달성 매트릭스

| 경로 (진입) | A 세액감면형 | B 소득차감형 | C LTHD대체(§97의3·4) | D 주택수제외 | E §133 한도 | 농특세 |
|---|---|---|---|---|---|---|
| **단건 일반** `transfer-tax.ts:752` | ✅ `finalize.ts:302` | ✅ `transfer-tax.ts:685` | ✅ `lthd.ts:403` | ✅ `transfer-tax.ts:381` | ✅ `finalize.ts:332` | ✅ 차감형 `finalize.ts:256` / 하이브리드 `:352` / 세액감면형 `:468` |
| **부담부증여 §159** (동 경로) | ✅ 동상 — `runBurdenedGiftStep`은 조기반환 아님 (`transfer-tax.ts:198-200`) | ✅ 단, ctx는 §159 안분 **전** `input.transferPrice` (`transfer-tax.ts:688`) | ✅ | ✅ | ✅ | ✅ |
| **다건 집계** `transfer-tax-aggregate.ts:680` | ✅ 자산별 `:185` → 유형별 재계산 `aggregate-reduction-step.ts:59` | ✅ 자산별 값을 `incomeDeductionReducibleOf`로 승계 (`aggregate.ts:291-302`, `aggregate-pickers.ts:109`) | ✅ 자산별(단건 재사용) | ✅ 자산별 | ✅ `aggregate-reduction-step.ts:108·111` (단건 cap은 per-asset `priorUsage` 부재로 no-op — `reduction-cap.ts:35`) | ✅ 차감형 `aggregate.ts:363-380` / 세액감면형 `aggregate-reduction-step.ts:251` |
| **일반건물·상가(카드→집계)** `general-building-route-cards.ts:205` | ✅ 카드별 `reductionsForCard` (§77의3 §17경로는 건물 파트 제외 `:148-150`) | ⚠️ 카드 `isOneHousehold:false·householdHousingCount:0` 고정(`:189-191`) — 주택 감면 요건 사실상 불성립 | ⚠️ 동상 | ⚠️ 동상 | ✅ 집계 1회 | ✅ 집계 |
| **겸용주택** `transfer-tax-mixed-use.ts:502` → `-totals.ts:357` | ✅ | ❌ **의도적 미적용 + 경고**(`-totals.ts:345-353`) | ❌ `calcLongTermHoldingDeduction` 미호출 | ❌ `runHouseCountExclusionStep` 미호출 | ✅ `-totals.ts:374` | ✅ `-totals.ts:383·423` |
| **재개발·입주권 §166** `transfer-tax-redevelopment.ts` | ✅ `:499` | ✅ `:364` | ❌ 자체 LTHD(§166⑤) — `evaluateRental97Lthd` 미호출 | △ `subject==="apt" && settlementDirection!=="receive"`에서만 판정용으로 호출(`transfer-tax.ts:314-326`), **detail은 폐기**(`exemptionJudgeInput`만 구조분해) | ✅ `:525` | ✅ 차감형 `:445-478` / 하이브리드·세액감면형 `:542-577` |
| **다필지(§166 토지)** `transfer-tax-multi-parcel-branch.ts` | ✅ `:108` | ❌ 미호출 | ❌ (`calculateMultiParcelTransfer` 자체 LTHD) | ❌ (STEP 0.9는 `:381`, 분기는 `:488` — 순서상 도달하나 결과 미사용) | ❌ `applyReductionStatutoryCap` 미호출 · `determinedTax`가 **uncapped** `mpReduction` 사용(`:127`) | ❌ **전혀 계산 안 함** (`grep ruralSurtax` 0건, `totalTax` `:170`에도 없음) |
| **§155⑳ 거주주택 특례** `transfer-tax-rental-housing-step.ts` | ✅ `:463` (차감형 11종은 사전 filter `:461`) | ❌ 의도적 미적용 + 고지 step(`:506-517`) | ❌ RHE(`transfer-tax.ts:560`)가 STEP 4(`:630`)보다 앞 | ✅ (STEP 0.9가 `:381`로 먼저 실행) | ✅ `:483` | △ 계산·`totalTax` 가산은 O(`:525·:614`), **`ruralSurtax` 필드 미설정**(반환 `:563-618`에 키 없음) |
| **국외** | — | — | — | — | — | — |

> **국외 행 근거**: 국외 양도소득 경로는 `lib/tax-engine/stock-transfer/`(국외 **주식** §118의2·§118의6)뿐이다. `grep -rln "118의2\|118_2\|foreignRealEstate\|국외 부동산" lib/ app/ components/` 결과 15파일 전부 `stock-transfer`·`stock-*`이고, 부동산 양도세 엔진(`transfer-tax*.ts`)에는 국외 분기가 없다. 조특법 감면 라우터(A~E) 어느 것도 stock 엔진에서 호출되지 않는다(§1 호출부 전수).

---

## 4. §127⑦ max 후보 배열 전수 — `calcReductions`

`const candidates: ReductionCandidate[]` (`transfer-tax-reductions-calc.ts:95`) → `best = candidates.reduce(max)` (`:367-370`) → `Math.min(best.amount, calculatedTax)` (`:371`).

### 들어가는 것 (8 push 지점)

| push line | 후보 `type` | 조문 | 게이트 |
|---|---|---|---|
| `:111` | `long_term_rental` | 레거시 장기임대(정밀 엔진 `calculateRentalReduction`) | `rentalReductionDetails` 존재 |
| `:142` | `rental97Result.id` = `rental_97_main`·`rental_97_proviso`·`rental_97_2`·`rental_97_5` | §97①본문·§97①단서·§97의2·§97의5 | `transferDate` 有 + `effectCategory==="tax_amount"` |
| `:174` | `hybridResult.id` = `unsold_98_3`·`unsold_98_4`·`unsold_98_5`·`unsold_98_6`·`unsold_98_7`·`unsold_99_2` | 하이브리드 **5년 내** 세액감면 | `effectCategory==="tax_amount"` (`unsold-hybrid-p3.ts:580`) |
| `:191` | `new_housing` | 신축/미분양 정밀 엔진 | `newHousingDetails` 존재 |
| `:217` | `public_expropriation` | **§77** | `reduction.type==="public_expropriation"` + transferDate·transferIncome·basicDeduction·taxBase 전부 有 (`:202`) |
| `:242` | `gb_designated_land` | **§77의3** | 위 + `acquisitionDate` 필수 (`:225`) |
| `:263` | `replacement_land_comp` | **§77의2** | `:249` |
| `:358` (레거시 루프) | `self_farming` / `self_farming_incorp` / `self_farming_inherited` (**§69**), `long_term_rental`, `new_housing`, `unsold_housing` | §69 + 구버전 평면 타입 | `v2Types` 중복 제거(`:270-273`) |

### 빠져 있는 것 (설계상 — 효과 방식이 다르다)

| 조문 | 빠지는 이유 | 대신 어디서 |
|---|---|---|
| §99의3·§99·§98의8 | `capital_gain`(소득차감) | STEP 4.6 `transfer-tax.ts:685` |
| §98의3·5·6·7·§99의2 **5년 후** | `income_deduction` | 동상 (`income-deduction-router.ts:313-318`) |
| **§98의2** | `lthd_rate_special` — 감면세액 0 | STEP 4.05 `transfer-tax.ts:637-652` |
| **§98** | `flat_rate_20` — 감면세액 0 | STEP 7 `forceFlatRate20` `transfer-tax.ts:741-743` |
| §97의3·§97의4 | LTHD 축 | `transfer-tax-lthd.ts:409·436` |
| §99의4(농어촌·고향)·§98의9 | `house_count_exclusion` | `transfer-tax-house-exclusion-step.ts:23` |
| `livestock`(§69의2)·`fishing`(§69의3) | **evaluator·metadata·UI 전무** — `aggregate-reduction-limits.ts:37-38` 한도 키와 `transfer-reduction-type-labels.ts:26-27` 라벨에만 존재 | 없음 |

> §133 그룹 정의(`aggregate-reduction-limits.ts:58-72`)는 조문과 일치한다 — **조특법 §133①**은 「제33조, 제43조, 제66조부터 제69조까지, 제69조의2부터 제69조의4까지, 제70조, 제85조의10」(과세기간 1억 / 5년 2억), **§133②**는 「제77조, 제77조의2 또는 제77조의3」(2억 / 3억). KoreanLaw MST 280409 `제133조` 실독(시행 2026-01-01). ⇒ §97·§98·§99 계열이 한도 그룹에 **없는 것이 정확**하다.

---

## 5. ID 차집합 — `ALL_INCOME_DEDUCTION_IDS`(11) vs `TransferReductionId`/`TRANSFER_REDUCTION_ARTICLE`(24)

- `ALL_INCOME_DEDUCTION_IDS`: `income-deduction-router.ts:42-54` (11종)
- `TransferReductionId`: `transfer-reductions/types.ts:14-42` (24종) — `REDUCTION_METADATA`(`metadata.ts:84-322`)가 24종 각각을 `TRANSFER_REDUCTION_ARTICLE`(`legal-codes/transfer-house.ts:160-189`, 24키)에 1:1 매핑

**차집합 13종의 라우팅 (전수)**

| ID | 조문 | 라우터 | file:line |
|---|---|---|---|
| `rental_97_main` | §97①본문 | A | `rental-97-router.ts:22·133` → `reductions-calc.ts:142` |
| `rental_97_proviso` | §97①단서 | A | 동상 |
| `rental_97_2` | §97의2 | A | 동상 |
| `rental_97_5` | §97의5 | A | 동상 |
| `rental_97_3` | §97의3 | C | `rental-97-router.ts:21·117` → `lthd.ts:409` |
| `rental_97_4` | §97의4 | C | `rental-97-router.ts:21` → `lthd.ts:436` |
| `new_99_4_rural` | §99의4 농어촌 | D | `unsold-98-9.ts` `resolveHouseCountExclusion` ← `house-exclusion-step.ts:23` |
| `new_99_4_hometown` | §99의4 고향 | D | 동상 |
| `unsold_98_9` | §98의9 | D | 동상 |
| `self_farming` | §69 | A(레거시 루프) | `reductions-calc.ts:279-340` |
| `public_expropriation` | §77 | A | `reductions-calc.ts:200-219` |
| `gb_designated_land` | §77의3 | A | `reductions-calc.ts:222-244` |
| `replacement_land_comp` | §77의2 | A | `reductions-calc.ts:247-265` |

⇒ **라우터 어디에도 안 걸리는 조문 ID: 0건.** 24종 전부가 A~D 중 하나에 배선돼 있다.

**법령 검증 매니페스트 커버리지**: `lib/legal-verification/manifest/additions-transfer.ts`의 `SPECIAL.*`에 §14·§30의5~7·§69·§77·§77의2(`:426`)·§77의3(`:437`)·§97·§97의2~5·§98·§98의2~9·§99·§99의2~4·§104의4·§104의8·§127(`:398`)·§133(`:404`) 전부 등록 — 24 조문 누락 0건.

---

## 6. 의심 목록 (단정하지 않음 — 탐지·검증은 다음 단계)

| # | 위치 | 관측 사실 | 왜 의심스러운가 |
|---|---|---|---|
| **S-1** | `transfer-tax-multi-parcel-branch.ts:127` · `:170` | 다필지 분기가 `applyReductionStatutoryCap`을 부르지 않고 `mpReduction`(uncapped)으로 결정세액을 만들며, `ruralSurtax`를 **한 번도 계산하지 않는다**(파일 내 `grep ruralSurtax` 0건). `input.priorReductionUsage`도 읽지 않는다 | §69·§77은 evaluator 내부 **연간** 캡만 있고(`self-farming` `reductions-calc.ts:319`, `public-expropriation-reduction.ts:256`) **5년 누적 캡은 `applyReductionStatutoryCap`에만** 있다. 다필지=토지라 §69·§77·§77의2·§77의3이 자산게이트를 통과하는 조합이고, `reductions`는 parcelMode와 무관하게 top-level로 전송된다(`lib/calc/transfer-tax-api.ts:564·622`) |
| **S-2** | `transfer-tax-rental-housing-step.ts:563-618` | `rheSurtaxVerdict.surtax`가 `totalTax`(`:614`)에는 들어가는데 **반환 객체에 `ruralSurtax` 키가 없다** | 재개발 경로가 같은 결함을 이미 고쳤다(`transfer-tax-redevelopment.ts:736-738` 「종전에는 이 경로가 `ruralSurtax993`조차 싣지 않아 … 화면에서 0이 됐다」). 「합계엔 있는데 항목은 0」 자기모순 |
| **S-3** | `transfer-tax-helpers.ts:487-497` vs `transfer-reduction-type-labels.ts:23·25·31` | `getReductionLegalBasis`의 map 키가 **라벨 문자열과 공백 하나 차이**로 어긋난다: 코드 키 `"자경농지"`·`"자경농지(§69·…)"`·`"공익사업용 토지 수용(§77)"` ↔ 실제 라벨 `"자경농지 (§69)"`·`"자경농지 (§69·…)"`·`"공익사업용 토지 수용 (§77)"` | `calcReductions`가 넘기는 `reductionType`은 `reductionTypeLabelOf(best.type)` 출력(`reductions-calc.ts:372`). 어긋나면 STEP 8 「감면세액」 step의 `legalBasis`가 undefined → 결과 화면 법령 링크 미표시. §77의2·§77의3·§97 시리즈·하이브리드는 map에 항목 자체가 없다 |
| **S-4** | `transfer-tax-rural-surtax.ts:81-99` | `TABLE`에 `self_farming`은 있으나 **`self_farming_incorp`·`self_farming_inherited`가 없다**. 두 값은 `reductions-calc.ts:323·325·337`이 실제로 만드는 `reductionTypeApplied`다 | `resolveTaxCreditRuralSurtax`가 `"unknown"`을 반환(`:129-134`) → `finalize.ts:483-488`이 「농어촌특별세 — 미판정」 step을 찍는다. §69는 농특세령 §4①1호로 **비과세**라 금액(0)은 맞지만 사유 문구가 사실과 다르다 |
| **S-5** | `transfer-tax.ts:685`(B) ↔ `transfer-tax-finalize.ts:302`(A) | 두 트랙이 **서로를 모른 채 병렬 실행**된다. `calcReductions`의 §127⑦ max는 A 내부에서만 돌고, B가 이미 소득금액을 깎았는지 보지 않는다. UI는 **카테고리 안에서만** 라디오이고(`UnifiedReductionPanel-defaults.ts:78-88`), standalone 4종은 독립 체크박스다(`UnifiedReductionPanel.tsx:181-188`). ⑧에도 교차 차단이 없다(`grep "127\|중복배제" lib/calc/transfer-tax-validate*.ts` 0건) | 조특법 §127⑦은 「둘 이상의 양도소득세의 **감면규정**을 동시에 적용받는 경우 … 하나만」(MST 280409 실독). 예: §99의3(차감형, housing) + §77(세액감면형, 「토지등」)이 한 자산에 동시 선택 가능한지 — 자산게이트(`asset-kind-gate.ts:97-99` standalone은 `return true`)는 막지 않는다 |
| **S-6** | `transfer-tax-redevelopment.ts:636-744` | 반환 객체에 `new993Detail`·`new99Detail`·`unsold98*Detail`·`rental97LthdDetail`·`new994Detail`·`unsold989Detail`·`specialHouseExclusionDetail`이 **하나도 없다**(`grep` 결과 `:448-455`의 지역 변수 사용뿐) | ① 결과 카드에서 차감형 상세가 안 보인다 ② **다건 집계**가 `incomeDeductionReducibleOf`(`aggregate-pickers.ts:109-116`)로 그 detail을 읽어 소득차감을 승계하는데, 재개발·입주권 자산은 항상 0을 반환한다 → 일괄양도(`route.ts:300`) 경로에서 §99의3 등이 **다시 소실**될 수 있다 |
| **S-7** | `transfer-tax-lthd.ts:157-171` · `:200-260` · `:274-337` · `:367-399` | 네 분기가 §97의3·§97의4 평가(`:403`)보다 **먼저 return**한다 | 레거시 `rentalReductionDetails`가 있으면 신규 `rental_97_3` 선택이 조용히 무력화된다. §95⑤ 용도변경·`splitDetail`·가업상속 조합도 동일. 두 입력을 동시에 만들 수 있는지(마이그레이션 잔재 포함)는 미확인 |
| **S-8** | `transfer-tax-mixed-use-totals.ts:357-370` | `calcReductions`에 **12개 인자만** 전달 — 13~15번(`standardPriceAtAcquisition`·`standardPriceAtTransfer`·`assetContractDate`)이 undefined | §97의5 임대분 안분(`rentalGainRatio`)·§97의2/§97의5 시한 판정(`period-check.ts:51-57`이 `contractDate ?? usageApprovalDate ?? acquisitionDate`로 후퇴)·§69 편입 부분감면 기준시가 fallback(`reductions-calc.ts:306·308`)이 단건 경로와 다르게 동작한다 |
| **S-9** | `lib/calc/multi-transfer-tax-validate.ts:18·102-108` | ⑧이 `ALL_INCOME_DEDUCTION_IDS` 11종을 다건에서 **전면 차단**하고 사유를 「합산 계산에서는 차감·세액감면이 반영되지 않습니다」라고 적는다 | 엔진은 이미 지원한다 — `transfer-tax-aggregate.ts:286-303`이 `incomeDeductionReducible`을 계산해 `taxableAfterReduction`에 반영하고 `:363-380`이 농특세 2-pass까지 돈다. 차단 사유 문구가 코드보다 stale일 가능성 |
| **S-10** | `transfer-reductions/index.ts:224` · `lib/tax-engine/CLAUDE.md:26` | `evaluateReduction()` 호출부 0개인데 문서는 「단일 진입점」이라 기술 | 새 조문 배선 시 이 함수를 고치면 아무 효과가 없다. 실제 진입점은 §0의 5개 |
| **S-11** | `transfer-tax-finalize.ts:450`(라벨 「STEP 8.8」) vs `:462`(실제 위치) | 세액감면형 농특세 블록이 STEP 10(지방소득세 `:430`)·STEP 12(가산세 `:439`) **뒤에서** 실행된다 | 세액에는 영향 없다(`totalTax` 합산 `:493`). 다만 `steps[]` 표시 순서가 「지방소득세 → 가산세 → 농특세」가 되어 신고 순서와 어긋나고, 라벨(8.8)과 실행 위치가 불일치 |
| **S-12** | `transfer-tax.ts:326` | 재개발 `runHouseCountExclusionStep(redevInput, steps)` 결과에서 `exemptionJudgeInput`만 구조분해하고 `new994Detail`·`unsold989Detail`·`specialHouseExclusionDetail`은 버린다. `subject==="right"` / `settlementDirection==="receive"`에서는 호출 자체가 없다 | 호출 자체를 안 하는 것은 **조문상 정당**할 수 있다 — §99의4①·§98의9·§98 령②⑥ 모두 「**§89①3호**를 적용한다」로 한정하고(§99의4 KoreanLaw MST 280409 실독), 입주권 비과세는 §89①**4호**(`transfer-tax-redevelopment-transforms.ts:405` `applyOneRightExemption`)다. 다만 apt 경로에서 **detail을 버리는 것**은 표시 누락 |
| **S-13** | `transfer-tax-multi-parcel-branch.ts:99-107` | `calcReductions` 반환에서 `gbDesignatedLandDetail`·`replacementLandDetail`·`rental97TaxDetail`·`hybridTaxDetail`을 구조분해하지 않는다 | 세액(=`best.amount`)에는 반영되나 상세 카드·별지84호 부표가 undefined를 받는다. `transfer-tax-normal-return.ts:108-113`이 같은 모양의 사고(§77의3·§77의2 키 누락)를 이미 한 번 겪었다 |
| **S-14** | `transfer-tax-loss-return.ts` 호출 인자 (`transfer-tax.ts:537-554`) | 양도차손 조기반환에 `new994Detail`·`unsold989Detail`·`specialHouseExclusionDetail`을 넘기지 않는다(비과세 조기반환 `:464-467`은 넘긴다) | 세액 0이라 무영향이나, 형제 경로 둘과 비대칭. 결과 화면에서 「주택수 제외를 적용했다」는 근거가 사라진다 |

---

### 부기 — 이번 조사에서 **결함이 아님**을 확인한 것

- §133 한도 그룹(`aggregate-reduction-limits.ts:30-72`)이 §97·§98·§99를 포함하지 않는 것 → **조문 그대로**(§133①·② 실독).
- 다건에서 자산별 `applyReductionStatutoryCap`이 no-op인 것 → `priorReductionUsage`는 신고서 단위로만 전달되고(`lib/calc/multi-transfer-tax-api.ts:338`) per-asset item에는 없어 `reduction-cap.ts:35`가 조기반환. 이중 차감 없음.
- `incomeDeductionReducibleOf`의 `??` 체인(`aggregate-pickers.ts:111-115`)이 0을 만나 멈출 위험 → `resolveIncomeDeduction`은 detail을 **1개만** 채우므로(`income-deduction-router.ts:343-351`) 도달 불가.
- 하이브리드가 차감형·세액감면형에 이중 계상될 위험 → 같은 evaluator의 `effectCategory` 단일 판정으로 배타(`income-deduction-router.ts:313-318` vs `unsold-hybrid-p3.ts:580`).
# 부록 B — 안전망 뮤테이션 실측

Cleanup done; both trees clean. Here are the measurements.

# 감면 축 안전망 뮤테이션 실측

## 측정 조건

| 항목 | 값 |
|---|---|
| 뮤테이션 worktree | `.claude/worktrees/reduction-mut-probe` (생성→실측→`cp` 원복→`wt-rm.sh --force --delete-branch` 제거 완료) |
| 리뷰 worktree | 무수정 확인 (`git status --porcelain` 공백) |
| **범위 R** (감면 축) | `__tests__/tax-engine/{transfer/,transfer-tax/,rental-article/,rental-housing-exception/}` + 감면 단건 8파일 → **434 파일 / 4,608 테스트**, 54초 |
| **범위 F** (전건) | `npx vitest run` → **1,652 파일 / 17,819 테스트**, 183초 |
| 베이스라인 | 범위 R **0 실패** · 범위 F **0 실패** (json 리포터. dot 요약 금지 규율 준수) |

원복은 전건 `cp` 백업→`cp` 복원(§`git checkout` 금지). 매 뮤테이션 후 마커 grep 카운트 0 확인.

## 1) 지정 뮤테이션 6종

| # | 뮤테이션 | 대상 file:line | 범위 R 실패 | 범위 F 실패 | 실패 파일 | 판정 |
|---|---|---|---|---|---|---|
| **M1** | §127⑦ max 후보선택 → **첫 후보 고정** (`candidates.reduce(max)` → `candidates[0]`) | `lib/tax-engine/transfer-tax-reductions-calc.ts:367-370` | **1** | **4** | `transfer-tax/edge-and-overlap.test.ts`(1) · `components/reduction-detail-card-context-warnings.anchor.test.tsx`(3) | **안전망 희박** — 엔진 단언은 **T-45a 단 1건** |
| **M2** | §133 **연간** 한도 ×10 (1억→10억 / 2억→20억, `DEFAULT_LIMIT_GROUPS`+`buildLimitGroups` 양쪽) | `aggregate-reduction-limits.ts:40,47,60,61` | 7 | **7** | `transfer-tax/pdf-ex08-aggregation-self-farming.test.ts`(2) · `transfer/audit-fix-aggregate.test.ts`(2) · `transfer/review-2026-08-f44.test.tsx`(2) · `five-year-cumulative-aggregate.test.ts`(1) | 안전망 있음 |
| **M3** | §97의3 공제율 **70%→50%** | `transfer-reductions/rental-97-3.ts:42` | 4 | **4** | `transfer-tax/rental-97-3-integration.test.ts`(2) · `rental-97-3-r1-registration.test.ts`(1) · `rental-97-evaluators.test.ts`(1) | 안전망 있음 (세액 anchor 포함) |
| **M4** | 시한 판정 **항상 통과** (`const inPeriod = true`) | `transfer-reductions/period-check.ts:259` | 8 | **8** | `transfer-tax/reduction-period-check.test.ts`(4) · `transfer/audit-fix-period-check.test.ts`(2) · `transfer-tax/rental-97-evaluators.test.ts`(2) | **부분적** — 전부 술어 단언. **세액 anchor 0건**. 24 규칙 중 실효 커버는 5개 |
| **M5** | 자산종류 게이트 **항상 허용** (카테고리+§69+§77의3 §17경로 3함수 전부) | `asset-kind-gate.ts:83,91-100,122` | 4 | **10** | `api/transfer.route.standalone-reduction-gate-route.anchor.test.ts`(4) · `transfer-tax/reduction-asset-kind-gate.test.ts`(4) · `components/calc/standalone-reduction-gate-route.ui.test.tsx`(2) | **부분적** — §69·§77의3만 소비층 anchor 보유 |
| **M6** | 소득차감액 **0** (`resolveIncomeDeduction` 반환 `reducible: 0`) | `income-deduction-router.ts:179,182` | 14 | **14** | `transfer-tax/redevelopment/redev-reduction-dropped.anchor.test.ts`(4) · `income-deduction-router.test.ts`(3) · `new-construction-bundled-case-28-g3.test.ts`(3) · `income-deduction-integration.test.ts`(2) · `aggregate-income-deduction-993.anchor.test.ts`(1) · `p2-hybrid-integration.test.ts`(1) | **안전망 있음** (가장 두터움 — 세액·농특세 항등식 포함) |

> M1·M5는 **범위 R이 과소집계**했다(1→4, 4→10). `components/`·`api/` 테스트가 범위 R 밖에 있다. 감면 축 안전망 측정에 `__tests__/tax-engine/` 만 쓰면 안 된다.

## 2) 세분 뮤테이션 — 6종이 뭉뚱그린 축을 갈랐다 (전부 범위 F)

| # | 뮤테이션 | 대상 file:line | 실패 | 판정 |
|---|---|---|---|---|
| **P-A** | 자산종류 **카테고리 게이트만** 항상 허용 (§69·§77의3 게이트는 원본 유지) | `asset-kind-gate.ts:91-100` | **4** (전부 `transfer-tax/reduction-asset-kind-gate.test.ts` 자기 단위테스트) | 🔴 **소비층 안전망 0건** |
| **P-B** | §133 **5년 누적** 한도 ×10 | `aggregate-reduction-limits.ts:41,48,60,61` | **20** | 안전망 있음(최다) |
| **P-C** | §133② **2025 상향 제거**(항상 1억/2억) | `aggregate-reduction-limits.ts:59-61` | 2 | 부분적 |
| **P-C2** | §133② **연도 경계 제거**(`>= 2025` → `>= 1900`, 항상 2억/3억) | `aggregate-reduction-limits.ts:60` | **0 / 17,819** | 🔴 **안전망 0건** |
| **P-D** | §97의3 **8년 경과규정 50%→30%** | `rental-97-3.ts:45` | **3** | 안전망 있음 |
| **P-E** | §97의4 **추가공제율표 전부 0** | `rental-97-4.ts:34-38` | **4** | 안전망 있음 |
| **P-F** | 주택수 제외(§89①3호 의제) **무력화** (`totalExcluded = 0`) | `transfer-tax-house-exclusion-step.ts:41-42` | **18** | 안전망 있음(두터움) |

### P-C2 = 0건은 측정실패가 아니다 (반증 완료)
- `buildLimitGroups` 호출부 **2개 실존**: `transfer-tax-reduction-cap.ts:42` · `transfer-tax-aggregate-reduction-step.ts:107` (dead code 아님).
- **같은 함수의 다른 변이(P-C)는 2건을 울렸다** ⇒ 경로는 실제로 탄다. 즉 **금액은 보고 있으나 연도 경계는 아무도 안 본다** — 2024년 양도에도 2억/3억이 적용되도록 바꿔도 전건 통과.
- 기존 anchor `transfer/aggregate-reduction-legal-basis.anchor.test.ts:50`은 `buildLimitGroups(2026)` 하나만 호출하고 `groupTypes.length`·`legalBasis` 문자열만 단언한다 — **연도 인자를 바꿔도 결과가 같다**.
- 현행 조특법 §133②(MST 280409, 시행 2026-01-01)은 「과세기간별 **2억원**」·「5개 과세기간 **3억원**」으로 확인했다. 2025 이전 시행본은 MCP 미확인 — **확인 필요**(코드 주석의 「2025.1.1. 이후 상향」은 본 리뷰가 검증한 사실이 아니다).

### P-A = 자기 단위테스트뿐인 것도 측정실패가 아니다 (반증 완료)
호출부 실존:
- ⑧ validate: `lib/calc/transfer-tax-validate-reductions.ts:56` — `if (!isReductionAllowedForAssetKind(r.type, asset.assetKind))`
- ⑤ UI: `components/calc/transfer/UnifiedReductionPanel.tsx:348` — `housingAllowed={isReductionCategoryAllowedForAssetKind(cat, asset.assetKind)}`

같은 파일의 §69 경로(`:336`)는 route·UI anchor 6건이 잡는데(M5 vs P-A 차분), **카테고리 경로는 0건**이다. 즉 「§97 임대감면을 분양권에 걸어도 차단되지 않는 회귀」가 나면 전건 통과한다.

## 3) period-check 24규칙 — 계측으로 잰 실효 커버리지

M4가 8건만 울린 이유를 규칙 단위로 갈랐다. `checkReductionPeriod`에 계측을 심어 **전건 실행 중 각 규칙이 true/false를 실제로 반환했는지** 기록했다(계측본 전건 실행 = 0 실패, 무해 확인).

- 24 규칙 **전부 호출은 된다**(never-called 0건).
- **15 규칙이 전건에서 한 번도 `false`를 반환하지 않는다** ⇒ M4(항상 true)로 검출 불가.
  - 그중 **8개는 `check: () => true` 상수**라 뮤테이션 면역이며 **설계상 의도**다(본 판정을 조문 구현체에 위임 — 주석에 근거 기재): `new_99_4_rural`·`new_99_4_hometown`(→ `new-99-4.ts:31-34,109`가 실제 판정) · `unsold_98_6` · `unsold_98_9` · `self_farming` · `public_expropriation` · `gb_designated_land` · `replacement_land_comp`.
  - **나머지 7개는 실질 술어를 가졌는데 false 케이스가 전건에 없다** → 아래 0건 목록.
- 실효 커버 5규칙: `rental_97_main` · `rental_97_4` · `rental_97_5` · `new_99` · `new_99_3` · `unsold_99_2`(6개가 false 관측, M4 실패 8건이 여기서 나온다).

## 🔴 안전망 0건 구간 (우선순위 순)

1. **§133② 양도연도 경계 (2025.1.1)** — `aggregate-reduction-limits.ts:60` `transferYear >= 2025`. 경계를 지워도 **0/17,819**. 회귀가 나면 2024년 이전 양도에 상향 한도가 적용돼 **감면 과다**로 흐른다.
2. **감면 카테고리 × 자산종류 게이트의 소비층(⑤ UI·⑧ validate)** — `asset-kind-gate.ts:91-100`. 게이트를 통째로 열어도 자기 단위테스트 4건 외 **0건**. `transfer-tax-validate-reductions.ts:56`·`UnifiedReductionPanel.tsx:348`을 태우는 anchor가 없다.
3. **period-check 실질 술어 7규칙 — false 경로 전무** (전부 `period-check.ts`):
   - `rental_97_proviso`(§97① 단서, `:44`) · `rental_97_2`(§97의2, `:49-56`) · `rental_97_3`(§97의3 등록시한, `:59-60`)
   - `unsold_98_3`(`:150-152`) · `unsold_98_5`(`:166-168`) · `unsold_98_7`(`:180-182`) · `unsold_98_8`(`:189-191`)
   - 특히 `unsold_98_8`은 M6가 14건으로 두텁게 지키는 §98의8 차감형의 **시한 게이트**인데, 그 게이트만 무력화하는 회귀는 아무도 못 잡는다.
4. **§127⑦ 중복배제 max 선택 — 엔진 단언 1건** (`transfer-tax-reductions-calc.ts:367-370`). `edge-and-overlap.test.ts` T-45a(장기임대 50% vs 신축 80%) 하나가 사라지면 엔진 층 안전망이 소멸한다(나머지 3건은 `components/` 표시 anchor). 후보 배열이 §97 시리즈·§69·§77·§77의2·§77의3·hybrid까지 7계열로 늘어난 데 비해 조합 커버리지가 1건이다.
5. **§133② 상향 자체(P-C) 2건** — 0은 아니지만 얇다. 두 실패 모두 상향 값을 **부수적으로** 쓰는 테스트이고, 「2024년 양도 = 1억/2억, 2025년 양도 = 2억/3억」을 대조하는 전용 anchor는 없다(1·3번과 같은 뿌리).

> 위 5개 구간을 anchor로 덮기 전에는, 해당 코드를 건드리는 어떤 변경도 **전건 통과가 무회귀를 뜻하지 않는다**.