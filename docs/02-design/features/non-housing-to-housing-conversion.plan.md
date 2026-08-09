# 비주택 → 주택 용도변경 양도 (「소득세법」 §95⑤·⑥ / 「소득세법 시행령」 §154⑤ 단서) — 구현 계획서

> 작성 2026-08-04 · 참조 사례 『2026 양도·상속·증여세 이론 및 계산실무』 사례 30 (533~538p)
> 대상 세목 양도소득세 · 진입 자산 `assetKind === "housing"`
> **v3 (2026-08-04)** — 13단계 자가검토 STEP 1(62건)·STEP 3(32건) 반영. 변경점 §14.

---

## 1. 무엇을 만드는가

상업용 오피스텔·근린생활시설 등 **주택이 아닌 건물을 취득해 보유 중 주택으로 용도변경(또는 사실상 주거용 사용)한 뒤 양도**하는 케이스의 세액을 정확히 계산한다.

| | 항목 | 근거 | 효과 | 게이트 / 착수 조건 |
|---|---|---|---|---|
| **R-1** | 장기보유특별공제 혼합 산식 | 「소득세법」 §95⑤·⑥ | 비주택 기간 표1 + 주택 기간 표2, 합산 40% 상한 | 양도일 ≥ **2025-01-01** (검증 완료) |
| **R-2** | 비과세 보유기간 기산 | 「소득세법 시행령」 §154⑤ 단서 | 취득일이 아니라 주거용 사용 개시일부터 | 양도일 ≥ **2024-03-01** (검증 완료) |
| **R-3** | 거주요건 판정 시점 | 서면-2020-부동산-5098 [부동산납세과-1247] (2021.09.08) | 조정대상지역 여부를 용도변경일 기준으로 판단 | **원문 확보 — 착수 가능** |

「소득세법」 §88 7호(주택 정의 구체화)는 판정 요건이지 계산 요소가 아니므로 범위 밖.

---

## 2. 참조 사례 — anchor 수치 (PDF 사례 30)

### 2.1 입력

| 항목 | 값 |
|---|---|
| 소재지 | 경기도 성남시 중원구 △△-△ 오피스텔(1차) 1203호 |
| 취득일 · 취득가액 | 2018-02-10 · 600,000,000 |
| 취득세·등록세·중개수수료 등 | 7,300,000 |
| 주거용 사실상 사용일 | 2022-11-25 |
| 양도일 · 양도가액 | 2026-01-27 · 1,500,000,000 |
| **거주기간** | **3년** (전입~전출 — §2.3 근거) |
| 세대 상황 | 1세대 1주택 (다른 부동산 없음) |
| 조정대상지역 | 취득 당시(2018-02-10) 지정 → 2022-11-14 해제 → 용도변경(2022-11-25)은 해제 후 |

### 2.2 기대 출력 (PDF 537~538p · 전 항목 python probe 재계산 일치)

```
취득가액          607,300,000   = 600,000,000 + 7,300,000
전체 양도차익     892,700,000   = 1,500,000,000 − 607,300,000
과세대상 양도차익 178,540,000   = floor(892,700,000 × (15억 − 12억) / 15억)
비과세 양도차익   714,160,000   = 892,700,000 − 178,540,000
장기보유특별공제   57,132,800   = 178,540,000 × 32%
양도소득금액      121,407,200   = 178,540,000 − 57,132,800
기본공제            2,500,000
과세표준          118,907,200
산출세액           26,177,520   = 118,907,200 × 35% − 15,440,000
지방소득세          2,617,752   = truncateToWon(26,177,520 × 10%)
```

> **세율표 실측 확인** (memory `feedback_transfer_year_tax_rate` — 외부 자료 추종 금지 이행)
> 「소득세법」 제55조 8,800만~1.5억 구간 **35% · 누진공제 15,440,000** = `lib/tax-engine/data/transfer-rate-seed.ts:26`, `effective_date: "2023-01-01"`. `progressive_rate`에 이후 레코드 없음 → 2026-01-27 양도분에 적용. PDF를 옮긴 것이 아니라 세율 시딩으로 직접 재계산해 고정했다.

> **지방소득세 각주** — 같은 정책 §3이 지목한 `calculateLocalIncomeTaxOnTransfer(taxBase, year)`는 **코드베이스에 존재하지 않는다**(전역 grep 0건 — 메모리 stale). 정본은 `transfer-tax-finalize.ts:409` `truncateToWon(applyRate(determinedTax, 0.1))` **정액 10%**다. `(과세표준×세율 − 누진공제)/10 ≡ 과세표준×(세율/10) − (누진공제/10)`이므로 「지방세법」 제103조의3 1/10 누진표와 **항등**이며(검산 118,907,200×3.5% − 1,544,000 = 2,617,752), 본 사례는 결정세액 = 산출세액이라 base도 일치. **위반 아님.**

장특공제 32%:

```
보유기간 공제율 = min[ 비주택 4년 → 표1  8%  +  주택 3년 → 표2 12%, 40% ] = 20%
거주기간 공제율 =        주택 거주 3년 → 표2 12%
                                        합계  32%
```

기간 산출 — **`calculateHoldingPeriod`(`tax-utils.ts:241-257`) 실제 로직으로 재현 확인 완료**:

```
총 보유기간   2018-02-10 ~ 2026-01-27 = 7년 11개월 16일
비주택 보유   2018-02-10 ~ 2022-11-25 = 4년  9개월 14일 → 4년 → 표1  8%
주택 보유     2022-11-25 ~ 2026-01-27 = 3년  2개월  1일 → 3년 → 표2 12%
```

### 2.3 ⚠️ 교재 지문과 계산의 불일치 — anchor는 3년

PDF 533p 지문은 거주 **"2년 11개월"**, 536p 화면 입력은 **3년**, 537p 계산도 **3년 × 4% = 12%**다. 2년 11개월이면 8% → 총 28% → 장특 49,991,200 → 양도소득금액 128,548,800으로 PDF 화면과 어긋난다(반례도 probe 확인). 역산(57,132,800 ÷ 178,540,000 = 32% = 20% + **12%**)으로 **거주 3년 확정**. 지문을 오기로 보고 anchor를 3년으로 고정한다(D-7). **판단 근거를 anchor 테스트 주석에 남긴다.**

---

## 3. 법령 근거

### 3.1 검증 완료 (KoreanLaw MCP 본문 조회)

**「소득세법」 제95조 제5항**

> ⑤ 제2항 단서에도 불구하고 주택이 아닌 건물을 사실상 주거용으로 사용하거나 공부상의 용도를 주택으로 변경하는 경우로서 그 자산이 대통령령으로 정하는 1세대 1주택(…)에 해당하는 자산인 경우 …
> 1. 보유기간별 공제율: … 주택이 아닌 건물로 보유한 기간에 해당하는 제2항 표 1에 따른 보유기간별 공제율 + 주택으로 보유한 기간에 해당하는 제2항 표 2에 따른 보유기간별 공제율. **다만, … 100분의 40보다 큰 경우에는 100분의 40으로 한다.**
> 2. 거주기간별 공제율: **주택으로 보유한 기간 중 거주한 기간**에 해당하는 제2항 표 2에 따른 거주기간별 공제율

**「소득세법」 제95조 제6항**

> ⑥ 제5항제1호 및 제2호에 따른 주택으로 보유한 기간은 해당 자산을 **사실상 주거용으로 사용한 날부터 기산**한다. 다만, … 분명하지 아니한 경우에는 그 자산의 **공부상 용도를 주택으로 변경한 날부터** 기산한다.

**시행일·적용례 — 「소득세법」 부칙 <법률 제19933호, 2023.12.31.>**

> 제1조 단서 3호: 제95조제5항 및 제6항의 개정규정: **2025년 1월 1일**
> 제7조(적용례): … **2025년 1월 1일 이후 자산을 양도하는 경우부터 적용**한다.

**「소득세법 시행령」 제154조 제5항 단서 · 제6항**

> ⑤ … 다만, 주택이 아닌 건물을 사실상 주거용으로 사용하거나 공부상의 용도를 주택으로 변경하는 경우 그 보유기간은 해당 자산을 사실상 주거용으로 사용한 날(…)부터 양도한 날까지로 한다.
> ⑥ 제1항에 따른 거주기간은 주민등록표 등본에 따른 전입일부터 전출일까지의 기간으로 한다.

**§154⑤ 단서 신설 시점 — 이분 탐색으로 특정 완료 (V-1 해소)**

| 기준일 | 시행 버전 | §154⑤ |
|---|---|---|
| 2024-01-01 | 대통령령 제34061호 (2023-12-28) | `"…법 제95조제4항에 따른다."` — **단서 없음** |
| 2024-03-01 | **대통령령 제34265호 (2024-02-29 공포, 2024-03-01 시행)** | **단서 있음** |

⇒ **R-2 게이트: 양도일 ≥ 2024-03-01.** (적용례 문구 원문은 미확인이나 시행일이 확정됐고, 게이트 적용은 소급 확장을 피하는 방향이라 안전측.)

**서면-2020-부동산-5098 [부동산납세과-1247] (2021.09.08) — 원문 확보 (2026-08-04, 사용자 제공)**

> **제목** 근린생활시설을 주택으로 용도변경하는 경우 1세대1주택 비과세 거주요건 적용여부
> **관련 법령** 「소득세법」 제89조 · 「소득세법 시행령」 제154조
>
> **[요지]** 거주요건은 **주택 취득시점을 기준으로 판단**하는 것으로 조정대상지역에 소재한 오피스텔을 취득하여 근린생활시설로 사용하다가 해당지역이 조정대상지역에서 해제된 후 주택으로 용도변경하여 양도한 경우 거주요건을 적용하지 않는 것임
>
> **[회신]** 귀 서면질의의 경우, 거주요건은 **주택 취득시점을 기준으로 판단**하는 것으로 조정대상지역에 소재한 오피스텔을 취득하여 근린생활시설로 사용하다가 해당지역이 조정대상지역에서 해제된 후 주택으로 용도변경하여 양도한 경우 **「소득세법 시행령」 제154조제1항의 거주요건을 적용하지 않는 것**입니다.

⇒ PDF 534p 참고 박스의 인용이 원문과 일치함을 확인했다. **R-3 착수 조건 해소.**

**C-13(대칭 방향) 근거** — 회신이 다룬 사안은 한 방향(조정 → 해제 후 용도변경)뿐이지만, 그 앞에 놓인 일반 명제 **「거주요건은 주택 취득시점을 기준으로 판단하는 것으로」**가 양방향을 포섭한다. 이는 「소득세법 시행령」 제154조제1항 괄호의 **"취득 당시에 조정대상지역에 있는 주택"**에서 "취득 당시"를 **주택으로서의 취득 시점**(= 사실상 주거용 사용일 / 공부상 용도변경일)으로 읽는 해석이기 때문이다. 따라서 용도변경일에 조정대상지역이면 거주요건이 **적용**된다(C-13).

**「소득세법 시행령」 제159조의4 (장기보유특별공제) — V-3 해소**

> 법 제95조제2항 표 외의 부분 단서 **및 같은 조 제5항 각 호 외의 부분**에서 "대통령령으로 정하는 1세대 1주택"이란 **각각** 1세대가 양도일(…) 현재 국내에 1주택(제155조ㆍ제155조의2ㆍ제156조의2ㆍ제156조의3 및 그 밖의 규정에 따라 1세대 1주택으로 보는 주택을 포함한다)을 보유하고 **보유기간 중 거주기간이 2년 이상**인 것을 말한다.

⇒ §95⑤의 "대통령령으로 정하는 1세대 1주택"은 §159의4가 **명시적으로 포함**한다. 요건은 ① 양도일 현재 1주택(의제 포함) ② 보유기간 중 거주 2년 이상 — **현행 게이트 `isOneHouseSingle && table2ResidenceYears >= 2`와 1:1 대응**하므로 기존 표2 대상 판정을 그대로 재사용한다(의제 주택 체인도 `transfer-tax.ts:426` 주석이 이미 §159의4로 다룬다).

**V-4에 대한 시사** — §159의4가 §95⑤ 맥락에서 「**보유기간** 중 거주기간」이라 쓸 때 그 보유기간은 별도 정의가 없으므로 §95④(취득일~양도일) = **총 보유기간**이다. 다만 §159의4는 *대상 요건*, 표2 단서는 *공제율 산정*이라 **층위가 달라 이것만으로는 해소되지 않는다**(2026-08-04 시점 판단).

**V-4 확정 — 「소득세법」 §95④·⑥·②본문 본문 확인 (2026-08-05, KoreanLaw MST 280405)**

층위가 정확히 맞는 근거 3개를 조문 본문에서 확인했다. **A안(총 보유기간) 확정**.

> **§95④** 「**제2항에서 규정하는** 자산의 **보유기간**은 그 자산의 **취득일부터 양도일까지**로 한다.」
> **§95⑥** 「제5항제1호 및 제2호에 따른 **주택으로 보유한 기간**은 해당 자산을 사실상 주거용으로 사용한 날부터 기산한다.」
> **§95②본문** 「…자산(…)으로서 **보유기간이 3년 이상인 것**… 에 대하여 …표 1에 따른 보유기간별 공제율을 곱하여…」
> **§95⑤ 첫머리** 「**제2항 단서에도 불구하고**…」

| # | 근거 | 왜 결정적인가 |
|---|---|---|
| ① | **§95④가 표2의 "보유기간"을 직접 정의** | 표2는 제2항의 표다. §159의4(대상 요건)와 달리 **층위가 정확히 일치**한다 |
| ② | **§95⑥의 재정의 대상은 「주택으로 보유한 기간」** | 조문이 "보유기간"과 「주택으로 보유한 기간」을 **구별해 쓴다**. ⑤·⑥ 어디에도 "보유기간"을 다시 정의한 문언이 없다 |
| ③ | **§95⑤이 배제한 것은 ②「단서」뿐** | 단서 = "1세대1주택은 표2를 쓴다". **본문의 "보유기간 3년 이상" 대상 요건은 살아 있고**, 그 보유기간은 §95④ = 총 보유기간. 표2 거주 8% 칸의 단서는 이 대상 요건을 재확인한 문구로 읽힌다 |
| ④ | **§95⑤2호가 특정한 것은 대입값뿐** | 「주택으로 보유한 기간 중 거주한 기간」은 거주기간 **열에 넣을 값**이다. 단서의 요건은 언급이 없다 |

**반대해석(B안 = 주택 보유기간)의 논거와 기각 사유** — ⑤1호가 표2 **보유기간 열**에 「주택으로 보유한 기간」을 대입하므로 같은 표 안의 단서도 그렇게 읽어야 정합적이라는 체계 해석이 가능하고, A안에서는 **비주택 보유기간이 거주 공제의 3년 요건을 채워주는** 귀결(총 보유 10년 = 비주택 7.5년 + 주택 2.5년)이 어색하다는 지적도 성립한다. 그러나 이는 **명문 없이 공제를 8%p 축소**하는 방향이므로 채택하지 않는다(memory `feedback_no_unfavorable_application_without_legal_basis`).

**해석례 조사 결과 — 0건** (2026-08-05): 조세심판원·법제처 법령해석례·국세청 해석 전부 0건. 판례는 2건(서울행법 2025구단53017 · 2012구단26961) 있으나 **모두 반대 방향**(주택 → 근린생활시설)이라 본 쟁점을 다루지 않는다. §95⑤·⑥이 **2025-01-01 시행 신설**이라 실무 해석이 축적될 시간이 없었다. **입법 취지(개정 이유서)는 미확보** — 기재부 세법개정안 해설자료는 법제처 API 범위 밖이다.

⇒ **실무 해석이 등장하면 재확인할 것.** 조문 해석으로 확정했을 뿐 유권해석으로 확인된 것은 아니다.

**갈리는 구간은 좁다** — §95⑤2호가 거주기간을 「주택으로 보유한 기간 중」으로 한정하므로 `거주기간 ≤ 주택 보유기간`이다. 주택 보유 ≥ 3년이면 B안도 요건 충족, 거주 < 2년이면 8% 칸 자체가 없다(§159의4 대상 요건도 거주 2년). ⇒ **주택 보유 2년 이상 3년 미만 + 그 기간 중 거주 2년 이상**에서만 갈린다. 기존 anchor(PDF 사례 30)는 주택 보유 3년 2개월이라 **양안 동일** — 이 쟁점을 구분하지 못한다.

### 3.2 착수 조건 (미해소 시 해당 항목을 범위에서 제외 — 리스크 아님)

| # | 항목 | 왜 착수 조건인가 | 확보 경로 | 실패 시 |
|---|---|---|---|---|
| ~~V-1~~ | ~~§154⑤ 단서 시행일~~ | — | — | **해소** (§3.1) |
| ~~V-2~~ | ~~서면-2020-부동산-5098 원문~~ | — | 사용자가 taxlaw.nts.go.kr에서 확보(2026-08-04) | **해소** (§3.1) |
| ~~V-3~~ | ~~§159의4 = "대통령령으로 정하는 1세대 1주택"~~ | — | KoreanLaw 본문 확인(2026-08-04) — §95⑤을 명시 포함 | **해소** (§3.1) |
| ~~V-4~~ | ~~§95⑤ 하에서 표2 거주 "(보유기간 3년 이상에 한정함)"의 지시 대상~~ | — | 「소득세법」 §95④·⑥·②본문 본문 확인(2026-08-05) | **해소 — A안(총 보유기간) 확정** (§3.1). 예규·심판례 0건이므로 실무 해석 등장 시 재확인 |

> memory `feedback_unverified_authority_blocks_tax_change` — 「미확인」 근거가 판정을 가르면 **리스크가 아니라 착수 조건**이다.

---

## 4. 현행 코드 갭 — 실측

✅ **행 번호 앵커 — Phase A-0 후 재실측 완료 (2026-08-04)**. 아래 G-1~G-15는 A-0 분리 결과를 반영한 값이다. `transfer-tax-helpers.ts`·`transfer-tax-exemption.ts`·`transfer-tax-lthd-start.ts`는 **분리하지 않아 행 번호가 그대로**이고, `transfer-tax.ts`·`-aggregate.ts`·`-api.ts`·`route.ts`·`calc-wizard-asset.ts` 앵커는 신규 파일 경로로 갱신됐다(§8).

| # | 지점 | 실측 결과 |
|---|---|---|
| G-1 | `transfer-tax-helpers.ts:536-547` `rateForYears` | **선두 `if (years < 3) return 0`이 표2 분기 전체(보유분+거주분)를 덮는다** — §7.3 설계의 핵심 제약. 표2 = `min(y×0.04,0.40) + min(r×0.04,0.40)`, 표1 = `min(y×0.02,0.30)` |
| G-2 | `transfer-tax-helpers.ts:438` `calcLongTermHoldingDeduction` | 보유기간이 항상 `acquisitionDate ~ transferDate` 단일 구간 |
| G-3 | `transfer-tax-exemption.ts:334-344` (JSDoc 325~) `resolveExemptionHoldingStartDate` | 분기가 **동일세대 상속 backdate(§154⑧3호) 하나뿐** |
| G-4 | `transfer-tax-exemption.ts:241-249` (JSDoc 234~) `resolveWasRegulatedAtAcquisition` | 판정 기준일이 `input.acquisitionDate` 고정 |
| G-5 | `transfer-tax-lthd-start.ts:23-26` | 용도변경 분기는 **주택 → 상가(사례 35) 방향만** |
| G-6 | `transfer-tax-lthd-steps.ts:81-107` STEP 4.1·4.2 (핵심 `:84-85`) | sub-step이 `holdingPeriod.years * 4` 하드코딩 |
| G-7 | 프로젝트 전역 | `grep "사실상 주거용"` **0건** |
| G-8 | ✅ **해소**(Phase A) — `transfer-tax-helpers.ts` L-1b·splitDetail NBL·`rateForYears` **3벌 모두 `calcLongTermRate` 위임**. `DetailedStatementHelpers.ts:453-454`(UI)만 §9.3에서 남음 | 종전 표1·표2 산식이 **4벌** 존재했다. 정본은 `calcLongTermRate`(`transfer-tax-mixed-use-inheritance.ts:26-47`) — exported leaf·3년 가드 내장 (memory `feedback_sibling_path_already_implements_rule`) |
| G-9 | `transfer-tax-exemption.ts:119-131` `ResidenceReqInput` | **10필드 화이트리스트 `Pick`**. 여기 추가하지 않으면 R-2·R-3이 필드에 접근 불가. `ExemptionReqInput`(:142)·`DeemedOneHouseReqInput`(:153)에 **자동 전파**됨 |
| G-10 | `lib/calc/transfer-tax-api-residence.ts:12-48` `buildResidenceReqInput` | UI(Step4)가 같은 술어를 **별도 조립 입력**으로 호출. :22-23에 동일 트랩 경고 주석 존재 |
| G-11 | `transfer-tax-aggregate-pickers.ts:32-56` `pickValuationDetails` | 다자산 result 전파 화이트리스트(13필드 — 단 이번 echo는 `pickReductionDetails` 쪽). 빠뜨리면 **일괄 경로에서 침묵 누락**. 가드 `__tests__/api/transfer.route.bundled-swallows-special.test.ts` |
| G-12 | `DetailedStatementHelpers.ts:449-478,516,523,535` · `FilingFormTableRowDefs.ts:46-47` · `FilingFormTableAggregateHelpers.ts:314-315` | sub-step 라벨 소비처. **§95② 하드코딩 8곳**, 그중 `:523`·`:535`는 `lthHoldingStep?.legalBasis` — **엔진 sub-step의 `legalBasis`(`transfer-tax-lthd-steps.ts:96`·`:103` = `"소득세법 §95 ②"`)를 그대로 인쇄** |
| G-13 | `transfer-tax-validate-asset.ts:310-312` | `isMixedUseHouse === true` **조기 return** |
| G-14 | `Step4.tsx:440-448` | 수동 ToggleCard `wasRegulatedAtAcquisition`. `regionCode` 없는 fallback에서 **이 값이 실질 판정** |
| **G-15** | `Step4.tsx:68` `primary = form.assets?.[0]` | **Step4 전체가 assets[0] 전용** — 조정대상지역 토글(:440)·거주기간 섹션(:469, `i === 0`만 갱신)·거주요건 경고(:487)·`regulatedAutoTip`(:297). `transfer-tax-api.ts:55`·`:358`도 primary만 읽는다 |

### 갭이 만드는 오답

- **비과세**: 취득일 기준 2년 초과 · 주거용 사용일 기준 2년 미달 → 계산기는 비과세, 법령은 과세 (**세액 과소**)
- **장특공제**: 비주택 기간에도 표2(연 4%) 적용 → **공제 과대**

### 유사 기능과의 경계

`PartialUsageChangeInputs.tsx:78` `commercial_to_house`는 **양도시점에도 상가가 남은 겸용주택** 전용이고 근거도 집행기준 89-154-24 시간비례 안분이다. **배타** — C-14 차단.

---

## 5. 설계 결정

| # | 결정 | 채택안 | 근거 |
|---|---|---|---|
| D-1 | 입력 방식 | **「사실상 주거용 사용 개시일」 날짜 1개** | §95⑥·§154⑤ 문언이 날짜 기준 |
| D-2 | 공제율 산정 | **법문대로 표1·표2 구간 조회**(3년 미만 0%) | §95⑤1호 |
| D-3 | 진입점·배치 | **`assetKind === "housing"` 자산 카드(Step1)** — 단, **primary 자산(index 0)에만 노출**(G-15) | 자산-수준 필드 + Step4가 assets[0] 전용 |
| D-4 | 거주기간 입력원 | **기존 `residencePeriods`/`residencePeriodMonthsAsset` 재사용** | 필드 신설 없음 |
| D-5 | §95⑤2호 장특 거주분 클램프 | **적용** | **명문 있음** |
| D-6 | 비과세 거주요건(§154①)에도 클램프 | **적용** | ✅ **명문 있음** — §154① 괄호 「그 보유기간 중 거주기간」 + §154⑤ 단서 (2026-08-09 정정, §11 R-G) |
| D-7 | anchor 거주기간 | **3년** | §2.3 |
| D-8 | LTHD 별도 경로와의 경합 | **범위 외 — 조합 시 validation 차단**: L-1c 장기임대 · splitDetail 토지건물분리 · L-2' §97의3/의4 · §98의2 · 부담부증여 · 상속·증여 취득 | 사용자 결정. ⚠️ **L-1b 부수토지는 제외** — 구조적으로 성립 불가(아래) |

### D-2 보충 — 정본 위임으로 R-D가 소멸했다

v1·v2는 표1·표2 조회를 새로 추출하려 했고, 그 과정에서 `rateForYears`의 선두 `years < 3` 가드가 소실되는 회귀(R-D)를 두 번 만들었다. **STEP 6에서 정본이 이미 있음이 확인되어 추출 자체를 취소했다.**

```ts
// transfer-tax-mixed-use-inheritance.ts:26-47 — exported leaf, 호출부 13곳
calcLongTermRate(holdingYears, residenceYears, useTable2, lthdExcluded = false)
  → if (lthdExcluded) return 0;
    if (holdingYears < 3) return 0;          // ★ 3년 가드 내장
    if (useTable2) return min(h*0.04,.40) + min(r*0.04,.40);
    return min(h*0.02,.30);
```

검산: `calcLongTermRate(4,0,false)` = 0.08(비주택 4년 표1) · `calcLongTermRate(3,0,true)` = 0.12(주택 3년 표2 보유분) → 합 20% — **PDF 사례 일치**.

⇒ **가드가 함수에 내장이라 호출부 가드가 불필요하고 R-D 회귀 위험이 원천 소멸**한다. Phase A 작업량도 크게 준다.

### ⚠️ 대신 새 불변식이 있다 — 분수 정수 연산

소수 rate를 **합산**하면 부동소수 오차가 세액을 1원 깎는다. probe: 비주택 3년(6%) + 주택 4년(16%) + 거주 3년(12%) → `0.22 + 0.12 = 0.33999999999999997` → `applyRate(178,540,000, …)` = **60,703,599**(정확값 60,703,600). 전 조합 **17,576건 중 78건**.

**현행 표2 경로는 두 항이 모두 0.04 배수라 이 값이 나오지 않는다** — §95⑤이 표1(0.02 배수)+표2(0.04 배수)를 합치면서 **새로 생기는 결함**이다. anchor 32%는 우연히 정확해 **anchor로는 잡히지 않는다**.

⇒ 공제율을 **정수 %로 유지**하고 `applyRateFraction(taxableGain, pct, 100)`(`tax-utils.ts:181`)을 쓴다. 법문이 "100분의 N"이라 문언에도 부합한다 (memory `feedback_applyrate_fractional_rate_one_won_error`).

### D-6 보충 — ✅ **근거 확정 (2026-08-09)**. 종전 「명문 없음」은 오독이었다

**결론: 클램프에는 명문 근거가 있다.** 두 조문의 결합이다(법제처 현행, 시행 2026-07-01 전문 확인):

> **§154①** … 취득 당시에 … 조정대상지역에 있는 주택의 경우에는 해당 주택의 보유기간이 2년 … 이상이고 **그 보유기간 중 거주기간이 2년 이상**인 것
>
> **§154⑤** **제1항에 따른 보유기간**의 계산은 법 제95조제4항에 따른다. **다만**, 주택이 아닌 건물을 사실상 주거용으로 사용하거나 … 그 보유기간은 해당 자산을 **사실상 주거용으로 사용한 날** … 부터 양도한 날까지로 한다.

⑤ 단서가 **「제1항의 보유기간」을 주거용 사용일부터로 재정의**하고, ①이 요구하는 것은 **「그 보유기간 중」의 거주**다. 주거용 사용일 이전 거주는 **정의상 그 기간 안에 없다** — 클램프는 문언 그대로다.

**종전 논거가 왜 틀렸나.** 「§154⑥이 거주기간을 '전입일부터 전출일까지'로만 정한 것이 거주기간 무제한을 방증한다」고 봤는데, ⑥은 **개별 거주 구간의 시종을 정의**할 뿐(무엇을 증빙으로 어떻게 세는가) **어느 구간을 산입하는가**를 정하지 않는다. ①의 **「그 보유기간 중」**을 읽지 않은 독법이었다.

**「자기모순」 지적도 성립하지 않는다.** 클램프가 no-op인 것은 사용자가 주거용 사용 개시일을 정확히 입력한 경우이고, 발동하는 것은 그보다 **이른 전입일을 거주 구간에 넣은 경우**다. 후자에는 ⓐ 입력 오류와 ⓑ **업무용 사용 중 전입만 되어 있던 실제 상황**이 있다. ⓑ가 실재하므로 클램프는 no-op이 아니고, ①의 문언이 바로 그 경우를 겨냥한다.

**사정거리는 조정대상지역뿐이다** — 비조정이면 §154① 괄호가 붙지 않아 거주요건 자체가 없다(`meetsOneHouseResidenceRequirement`의 `!wasRegulated` 단락). 실측으로 확인했다(R-G-3).

⚠️ **예규·심판례는 여전히 0건**이다(§154⑤ 단서가 2024-03-01 신설이라 실무 해석 미형성 — 조세심판원·국세청 재검색 2026-08-09에도 0건). **조문 해석으로 확정한 것이지 유권해석이 아니다.** 반대 해석이 등장하면 재검토한다.

**세액 anchor**: `non-housing-to-housing-conversion.engine.test.ts` **R-G-1~R-G-3** — 조정 클램프 **108,148,800** ↔ 클램프 없으면 **비과세 0** ↔ 비조정은 **양쪽 0**(무영향).

### D-8 보충 — L-1b(부수토지)를 제외하는 이유

L-1b는 `transfer-tax-helpers.ts:469-472`가 **`propertyType === "land" && landNature === "appurtenant_to_housing"`**를 요구하고, `landNature`는 `transfer-tax-api.ts:579`가 **`primary.assetKind === "land"`일 때만** 전송한다. 이 기능의 토글은 `assetKind === "housing"` 전용이므로 **같은 `TransferTaxInput`에 공존 불가**다(부수토지는 별도 컴패니언 자산). 차단 코드를 넣으면 **dead validation**이 되어 CLAUDE.md 전역 "불가능한 시나리오에 대한 에러 핸들링 금지" 위반이다.

---

## 6. 케이스 매트릭스

| # | 조건 | 기대 동작 |
|---|---|---|
| **C-1** | 토글 OFF | 현행 그대로 — **회귀 0** |
| **C-2** | 토글 ON · 양도일 < 2025-01-01 | **R-1 미적용**. R-2는 양도일 ≥ 2024-03-01이면 적용, R-3은 V-2에 따름 |
| **C-3** | 토글 ON · 양도일 ≥ 2025-01-01 · 표2 대상 | **§95⑤ 혼합** ← PDF 사례 30 |
| **C-4** | 토글 ON · 표2 대상 아님(1세대1주택 아님 **또는** 통산 거주 2년 미만) | §95⑤ 미적용 → 표1 단독, §95④ 본문대로 **취득일부터 전기간** |
| **C-5** | 주택 보유기간 < 3년 | 표2 **보유분 0%**. **거주분은 지급**(총 보유기간 ≥ 3년인 한) — ✅ **V-4 확정**(§95④·⑥·②본문, §3.1). 이 케이스가 A안/B안이 갈리는 **유일한 구간**이다 |
| **C-6** | 비주택 보유기간 < 3년 | 표1 **0%**, 표2 주택분만 |
| **C-7** | 표1 + 표2 보유분 > 40% | **40% 캡**(§95⑤1호 단서). 거주분 별도 |
| **C-8** | 주거용 사용 개시일 ≤ 취득일 | **차단** |
| **C-9** | 주거용 사용 개시일 ≥ 양도일 | **차단** |
| **C-10** | 입주일 < 주거용 사용 개시일 (`residenceInputMode === "interval"`) | 거주개월 **클램프** + 안내 (D-5·D-6) |
| **C-10b** | 동상 (`residenceInputMode === "direct"`) | ⚠️ **클램프 불가**(스칼라). UI 안내로 처리 |
| **C-10c** | 클램프 후 거주 2년 미만 → **비과세 탈락** | D-6이 세액을 바꾸는 유일한 케이스. **테스트로 고정 필수**(§11 R-G) |
| **C-11** | 주거용 사용일 기준 보유 < 2년 | **비과세 불가**(§154⑤ 단서, R-2) |
| **C-12** | 취득시 조정 · 용도변경시 비조정 | 거주요건 **미적용**(R-3) ← PDF 사례 30 |
| **C-13** | 취득시 비조정 · 용도변경시 조정 | 거주요건 **적용**(R-3 대칭. V-2가 이 방향을 커버하는지 확인) |
| **C-14** | 겸용주택(`isMixedUseHouse`) 동시 ON | **차단** |
| **C-15** | 고가주택 12억 초과 | 12억 안분 **후** 장특공제 — 현행 순서 ← PDF 사례 30 |
| **C-16** | 토글 ON + 주거용 사용 개시일 공란 | **차단**. ④ 변환 조건과 **동일 술어**(§8 인자 동일성 표) |
| ~~C-17~~ | ~~부수토지 일체과세~~ | **삭제** — 구조적 성립 불가 (D-8 보충) |
| **C-18** | 토글 ON + 장기임대 특례율 | **차단**. ⚠️ 판별은 폼값 `asset.reductions`의 `type === "rental_97_3" \| "rental_97_4"`(`calc-wizard-asset-reduction.ts:167·179`) — 엔진 `rentalReductionDetails`는 **폼에 없어 validate가 볼 수 없다** |
| **C-19** | 토글 ON + 토지/건물 분리취득 | **차단**(`hasSeperateLandAcquisitionDate` — `calc-wizard-asset.ts:395`) **+ 엔진 가드 `!splitDetail`** — 엔진 단독 호출은 validate를 거치지 않는다(design I-15) |
| **C-20** | 토글 ON + §98의2 / §97의3·의4 | **차단**. `unsold_98_2`(`calc-wizard-asset-reduction.ts:320`)·`rental_97_3`·`rental_97_4` |
| ~~C-21~~ | ✅ **폐지** (2026-08-05) | 상속·증여·이월과세 **전부 개방**. 셋 다 명문이 답을 정하거나 요건이 불성립한다 — 상속은 §154⑧3호 「상속받은 **주택**」 전제 불성립, 이월과세는 「소득세법」 §95④ 단서(전체 기간)와 §95⑥(주택 기간)이 **분담**, 단순 증여는 §95④ 단서가 미치지 않는다. 상세: [`...-carryover-c21.plan.md`](non-housing-to-housing-conversion-carryover-c21.plan.md) |
| **C-22** | 토글 ON + 미등기(L-0) / 중과 적용 중(L-1) | LTHD 배제가 **우선** — 현행 유지(토글 유무와 결과 동일하므로 차단 불요) |
| **C-23** | `redevelopment_apt` · `right_to_move_in` · `presale_right` | **UI 미노출**(진입이 `housing` 한정) |
| **C-24** | 토글 ON + 부담부증여 | **차단**. `transferType`(`calc-wizard-asset.ts:224`) |
| **C-25** | 토글 ON + 공동소유 지분 | 지분 안분은 공제율과 직교 → **지원**. Phase B 단위 테스트 |
| **C-26** | 토글 ON + **비-primary 자산**(assets[1..]) | **UI 미노출**(D-3) — Step4의 거주기간·조정대상지역이 전부 assets[0] 전용이라 거주분이 항상 0이 된다(G-15) |

---

## 7. 엔진 설계 — 요약

> **정본은 [`non-housing-to-housing-conversion.engine.design.md`](non-housing-to-housing-conversion.engine.design.md)**다. 타입 정의·의사코드·전파 경로·헬퍼 배치는 그쪽을 보라. 여기는 범위 판단에 필요한 요약만 둔다. **구현 중 변경은 양쪽 동시 갱신.**

| 항목 | 결정 | 상세 |
|---|---|---|
| input | `nonHousingToHousingConversion?: { residentialUseStartDate: Date; residenceMonthsTrimmed: number }` | design §엔진 input |
| 판정 입력 Pick | `ResidenceReqInput`(`transfer-tax-exemption.ts:119-131`)에 필드 추가 — **R-2·R-3 선행** | design §엔진 input |
| result echo | `usageConversionDetail`(8필드, 전부 string/number, **공제율은 정수 %**) | design §엔진 result |
| **전파 6지점** | `LongTermHoldingResult`(비-export) → `transfer-tax.ts:428` 구조분해 → `:783` 조립 → `TransferTaxResult` → Pick 목록 → pick 함수. 선례 `rental97LthdDetail` | design §전파 6지점 |
| 기간 분해 | **`calcUsagePeriodInfo` 정본 위임** — 신규 leaf `usage-period-info.ts`로 추출 + re-export(기존 import 무변경) | design §헬퍼 1 |
| 공제율 | 🔴 **`calcLongTermRate`(`transfer-tax-mixed-use-inheritance.ts:26-47`) 정본 위임** — 신규 추출 없음. **3년 가드가 함수 내장** | design §헬퍼 2 |
| 산술 | 🔴 **분수 정수 연산 필수** — `applyRateFraction(taxableGain, 정수%, 100)`. 소수 rate 합산은 1원 과소(78/17,576 조합) | design §분수 정수 연산 |
| 게이트 상수 | `legal-codes/transfer.ts`에 `LTHD_CONVERSION_95_5_CUTOFF`·`CONVERSION_EXEMPTION_CUTOFF` (로컬 파싱 `"T00:00:00"`) | design §게이트 상수 |
| R-1 삽입 위치 | `transfer-tax-helpers.ts:533` 직후(변수 선언 후) · 게이트에 **`!splitDetail`** 포함 | design §R-1 |
| R-2 | `resolveExemptionHoldingStartDate`(`:334-344`)에 병렬 분기 | design §R-2 |
| R-3 | `resolveWasRegulatedAtAcquisition`(`:241-249`) 기준일 파라미터화 — **호출부 3곳** | design §R-3 |
| 거주 클램프 | **API 변환 계층** `clampResidenceToHousingPeriod`(`calc-wizard-asset-residence.ts`). `resolveExemptionResidenceMonths`는 **개조 불요**(pass-through) | design §거주기간 클램프 |
| 에러 | 구조적 위반(`calcUsagePeriodInfo` null)은 **`TaxCalculationError` throw** — 엔진 단독 호출은 validate를 거치지 않는다 | design §Silent fallback |

## 8. 14 동기화 지점 (+ 선행 ⓪)

| # | 지점 | 파일 | 작업 |
|---|---|---|---|
| **⓪** | 판정 입력 Pick 확장 | `transfer-tax-exemption.ts` | §7.3(f) — **R-2·R-3 선행** |
| ① | 폼 상태 | 🔴 **신규** `calc-wizard-asset-usage-conversion.ts` | `UsageConversionFormSlice` → `AssetForm extends`(`calc-wizard-asset.ts:61`) |
| ② | initial | `calc-wizard-asset-factory.ts:62` | `false` / `""` |
| ③ | normalize | `calc-wizard-asset-migrate.ts` | backfill. ⚠️ **유일한 안전망 아님** — 현행 포맷 sessionStorage·IndexedDB 로드에는 안 돈다 |
| ④ | API 변환 | `transfer-tax-api.ts` | 객체 생성 + **거주 클램프**(§7.2). 접근부 가드 `?? false`·`?? ""` |
| ⑤ | UI 위젯 | 🔴 신규 `NonHousingConversionSection.tsx` + 마운트 **`asset-sections/AssetSectionAcquisition.tsx:288`** | §9.1 |
| ⑥ | 사이드바 | — | **N/A 확인** (`computeTransferSummary`는 금액 5필드만) |
| ⑦ | 결과 카드 | `TransferTaxResultView.tsx` + 신규 상세 카드 + **G-12 3파일** | §9.2·§9.3 |
| ⑧ | validation | `transfer-tax-validate-asset.ts` | C-8·C-9·C-14·C-16·C-18~C-21·C-24. ⚠️ **`:310` 조기 return보다 앞** |
| ⑨ | Zod enum 메인 | — | ✅ **N/A 확정** — 신규 enum 값이 없다(`transfer-tax-schema.ts`를 열지 않았다) |
| ⑩ | Zod refines | ✅ `transfer-tax-schema-refines.ts`(`addPropertyRefines`) | 주거용 사용일이 취득일·양도일 **사이**인지(C-8·C-9 → 400). 단건·다건 스키마가 같은 헬퍼를 공유하므로 1곳 수정으로 양쪽 적용 |
| ⑪ | 자산-수준 fallback | — | ✅ **N/A** — `residentialUseStartDate`는 primary 자산 전용이라 form-global fallback 대상이 아니다 |
| ⑫ | **Zod 입력 객체** | ✅ 정의 `transfer-tax-schema-sub.ts:638` · 배선 `transfer-tax-schema.ts:371` | ⚠️ **컴패니언에는 두지 않았다**(계획 이탈) — C-26이 비-primary 자산을 UI 미노출로 정했고 거주분이 항상 0이 되므로, 스키마에 넣으면 **지원하지 않는 입력을 받아들이는** 셈이다 |
| ⑬ | body spread | ✅ `transfer-tax-api.ts:412` | 게이트는 `isUsageConversionActive`(단일 소스 술어) |
| ⑭ | Route 매핑 | ✅ `app/api/calc/transfer/engine-input.ts:75` | `residentialUseStartDate`는 `toDate()`, `residenceMonthsTrimmed`는 number 그대로 |

### 파일 크기 — Phase A-0 ✅ **완료** (2026-08-04)

| 파일 | 전 → 후 | 근거 | 분리 산출물 |
|---|---|---|---|
| `lib/stores/calc-wizard-asset.ts` | 838 → **668** | ① extends 추가 | `-nbl-judgment.ts`(96, `NblJudgmentFormSlice`) · `-cb.ts`(100, `CommercialBuildingFormSlice`) — **슬라이스 패턴 계승**(기존 6 → 8) |
| `lib/calc/transfer-tax-api.ts` | 836 → **692** | ④⑪⑬ + 클램프 | `-body-blocks.ts`(189) — body spread 4군(세대 특례 3종·가산세/수정신고·PHD·신축 4시점). 선례 `buildReplacementHousePayload` |
| `lib/api/transfer-tax-schema-sub.ts` | 829 → **631** | ⑫ | `transfer-tax-schema-nbl.ts`(207) — NBL raw 페이로드 스키마군. 동명 re-export로 하위 호환 |
| `lib/tax-engine/transfer-tax.ts` | 805 → **676** | G-6 §9.3 | `-lthd-steps.ts`(108, **표시 계층**) · `-judgment-steps.ts`(110, STEP 0.5·0.6) · `buildGainFormula` → `-taxable-gain.ts` |
| `lib/tax-engine/transfer-tax-aggregate.ts` | 783 → **607** | §7.4 전파 3 | `-pickers.ts`(196) — picker 6종 + 세율군 1-pass 집계 |
| `app/api/calc/transfer/route.ts` | 756 → **452** | ⑭ | `engine-input.ts`(341) — **⑭ 전용 모듈**. 침묵 strip 경고를 파일 헤더에 명시 |
| `lib/tax-engine/transfer-tax-helpers.ts` | 751 (유지) | §7.3(a)(b) 개조 | **분리하지 않았다** — 800 미만이고 §7.3이 여는 구간(`:428-547`)이 응집 단위다. 개조 후 800 초과 시 그때 분리 |

**제외**: `transfer-tax-schema.ts`(765) — ⑨가 N/A라 **열지 않는다**(Surgical). `transfer-tax-validate-asset.ts`(745) — **700~749 안정 구간**이라 CLAUDE.md가 "미리 쪼개면 순수 낭비"로 규정. `types/transfer.types.ts`(784)·`transfer-result.types.ts`(422) — **타입 전용 파일 예외**.

> ✅ **A-0 verify 통과**: `npx tsc --noEmit` 0건 · `npm run test:transfer` 전건 통과 · lint warning 140 → **137**(순감) · 대상 6파일 전부 ≤700 · **행 번호 앵커 3문서 34곳 재실측 갱신 완료**.
>
> **A-0가 만든 두 가지 실질 이득** (단순 줄 수 감축이 아니다):
> 1. **`transfer-tax-lthd-steps.ts`가 §95⑤ 표시 계층 결함의 단일 수정 지점**이 됐다 — 종전에는 805줄 orchestrator 한가운데 흩어져 있었다.
> 2. **`engine-input.ts`가 ⑭를 독립 파일로 격리**해 침묵 strip 자가 점검(grep)의 대상이 명확해졌다.
>
> 회귀 가드 1건 경로 정정: `transfer.route.bundled-swallows-special.test.ts`가 picker를 **소스 텍스트로 읽으므로** 파일 경로를 `-pickers.ts`로 갱신했다(테스트 자체는 불변 — 계약↔주입 1:1 강제 유지).

### ⑫⑬⑭ 침묵 strip 자가 점검

```bash
grep -rn "nonHousingToHousingConversion\|residentialUseStartDate\|residenceMonthsTrimmed" \
  lib/api/ lib/calc/transfer-tax-api.ts app/api/calc/transfer/
# → Zod 정의 · body spread · Route 매핑 3계층 모두 hit (필드 3개 전부)
```

### 인자 동일성 표

| 술어 | UI(⑤) | validate(⑧) | API 변환(④) | 엔진 |
|---|---|---|---|---|
| 「용도변경 활성」 | `asset.hasNonHousingConversion && asset.residentialUseStartDate !== ""` | 동일 | 동일 | `input.nonHousingToHousingConversion !== undefined` |
| 「조정대상지역 기준일」 | `Step4.tsx` 토글 · `buildResidenceReqInput` | — | — | `resolveWasRegulatedAtAcquisition(input, 기준일)` |
| 「거주 개월」 | `deriveResidencePeriodMonths` | 동일 | **클램프 적용** | 클램프된 스칼라 |
| 「L-1c 판별」(C-18) | — | `asset.reductions` 중 `rental_97_3\|rental_97_4` | — | `rentalReductionDetails`(**폼에 없음**) |

---

## 9. UI 설계 — 요약

> **정본은 [`non-housing-to-housing-conversion.ui.design.md`](non-housing-to-housing-conversion.ui.design.md)**다. 위젯 구조·마운트 지점·testid·표시 규칙·validation 문안은 그쪽을 보라. **구현 중 변경은 양쪽 동시 갱신.**

| 항목 | 결정 |
|---|---|
| 신규 컴포넌트 | `components/calc/transfer/NonHousingConversionSection.tsx` — 구조 템플릿은 `GeneralBuildingConversionSection.tsx` 복제 |
| 마운트 | `asset-sections/AssetSectionAcquisition.tsx:288` **직후 새 형제 블록**(`:280-288`은 단일 엘리먼트 블록이라 "안"에 못 넣는다) |
| 노출 조건 | `assetKind === "housing"` **AND `isFirst`** — ⚠️ `isPrimary`가 아니다(`:37`·`:43` 별개 prop). 신규 prop 불요 |
| tone | **`fuchsia`**(ToggleCard 자체 TONES) — 🔴 **`ToneCard`는 fuchsia 미지원(컴파일 에러)** → 자동 도출 박스는 정적 리터럴 + **`dark:` variant 필수** |
| 미리보기 | 엔진 헬퍼 **직접 import**(재구현 금지) · `useMemo` 순수 |
| Step4 연동 | 조정대상지역 토글 라벨·`regulatedAutoTip`·배너(최대 80%→40%)·거주요건 경고 4항목 — **Phase D**(R-3과 같은 단위) |
| 결과 | `<PrintSection id="calculation">`(`TransferTaxResultView.tsx:293-474`) 내부 → **신규 print leaf 불요**. echo 없으면 **미렌더** |
| 표시 계층 | 🔴 본 step 산식(`transfer-tax-lthd-steps.ts:57-65`·`:556`) + sub-step **금액**(`:564-591`) + `legalBasis`(`:580`·`:587`) 분기 — engine.design §표시 계층 |
| E2E | **sessionStorage 시드 방식**(`commercial-building-97-2-swap.spec.ts:40-65`) — 표2 게이트 충족 필드 전건 필요 |

## 10. Phase 분할

| Phase | 내용 | verify |
|---|---|---|
| **0** | ~~V-2·V-3 해소~~ · V-4 처리 · ⑫ Zod 경로 확정 · **PDF 사례 30 anchor 작성 후 현행 엔진 실행** | anchor **실패** + 실패 메시지가 예상 갭과 일치. **V-4 미확보 시 총 보유기간 기준 확정**. ⑫ 파일 경로 기재 |
| **A-0** ✅ | 선분리 6파일(§8 표) — **별도 커밋** | ✅ `npx tsc --noEmit` 0건 · `npm run test:transfer` 전건 통과 · 대상 ≤700 · 행 번호 앵커 3문서 재실측 갱신 완료 |
| **A** ✅ | `calcUsagePeriodInfo` leaf 추출 · **G-8 사본 4벌 → 0벌 정본 위임**(`rateForYears` 포함) · `calcConversionHoldingPct`(정수 %, 신규 leaf) · 게이트 상수 2종 · 법령 상수 4종 | **`npm run test:transfer`**(`package.json:14`, ~59초) 전건 통과. 🔴 **필수 케이스 2건**: ⓐ 비주택 2년·주택 5년 → 표1 **0%** + 표2 20% (가드 내장 확인) ⓑ **분수 정수 연산** — 비주택 3년·주택 4년·거주 3년 → 34% → 장특 **60,703,600**(소수 연산이면 60,703,599) |
| **B** ✅ | R-1 혼합 분기 + echo + **전파 6지점** + `transfer-tax-lthd.ts` 분리(800줄) | ✅ anchor **장특 57,132,800**·산출세액 **26,177,520** 통과(4건). 신규 `…conversion.engine.test.ts` **11건**(C-1·C-2·C-4·C-5·C-6·C-7·C-8·C-9·C-25 + 2025-01-01 경계). `npm run test:transfer` **480파일 5,427건 전건**. tsc 0건 · lint 0 error |
| **C** ✅ | ⓪ Pick 확장 → R-2 §154⑤ 분기 + 2024-03-01 게이트 | ✅ C-11 · **2024-02-29 ↔ 2024-03-01 경계** · 상속 §154⑧3호 회귀 0(backdate 반례까지 고정) · 겹침 시 단서 우선. `test:transfer` **5,433건 전건** · tsc 0 · lint 0 error |
| **D** ✅ | R-3 기준일(엔진 + `buildResidenceReqInput`) + Step4 UI 4항목 **+ ①②③ 폼 필드(F에서 당김)** | ✅ **C-12·C-13 양방향**(김포 4157010100 — 토글 유무로 `isExempt` 뒤집힘) · **"Step4 안내 ↔ 엔진 판정 일치"** 5건 · `npm test` **13,381건 전건** · tsc 0 · lint 0 error |
| **E** ✅ | ④⑨~⑭ API·Zod·Route + 거주 클램프 | ✅ body 도달 **단건·다자산** · ⑫⑬⑭ grep 3계층 hit · Zod 날짜순서 400(C-8·C-9) · 클램프 6케이스 · **C-10c 세액 변경 고정** · `npm test` **13,394건 전건** |
| **F** ✅ | ~~①②③~~ ⑤⑧ UI 위젯 + validation | ✅ validation **18건**(C-8·C-9·C-14·C-16·C-18~C-21·C-24 + 배치 고정 3건) · **브라우저 실동작 확인**(미리보기 20%·40% 캡·시행일 게이트 3화면 스크린샷) · `check-tone-classes.sh`·`check-font-sizes.sh` 통과 · `npm test` **13,412건** · lint 0 error |
| **G** ✅ | ⑦ 결과 카드 + §9.3 문구 분기 | ✅ **표시 계층 금액 정정**(보유분 39,992,960 → **35,708,000**) · 산식 자기일관(20+12=32) · `legalBasis` §95⑤ · 신규 상세 카드 · **브라우저 결과 화면 확인** · 미결 a·b 확정 · `npm test` **13,412건** |
| **H** ✅ | 통합 anchor + E2E | ✅ 산출세액 **26,177,520** · 지방소득세 **2,617,752**(Phase B부터 고정 유지) · **E2E 5건**(`non-housing-to-housing-conversion.spec.ts`) · 통합 anchor 보강 **2건**(다자산 경로 · 이력 JSON 왕복) |

---

## 11. 리스크 · 별건

| # | 항목 | 내용 |
|---|---|---|
| ~~R-D~~ | ✅ **해소** | `calcLongTermRate` 정본 위임으로 3년 가드가 함수 내장 — 추출 자체를 취소해 회귀 위험 소멸 (§5 D-2 보충) |
| **R-K** | 🔴 **분수 정수 연산** | 소수 rate 합산이 1원 과소(78/17,576 조합). §95⑤이 표1+표2를 합치며 **새로 만드는 결함**이고 anchor로는 안 잡힌다. `applyRateFraction` + 정수 % 필수. **Phase A 필수 verify** |
| ~~**R-G**~~ | ✅ **해소 — 명문 근거 확정** (2026-08-09) | 「명문 없는 불리 적용」이 아니었다. **§154① 괄호 「그 보유기간 중 거주기간이 2년 이상」 + §154⑤ 단서**(그 보유기간을 주거용 사용일부터로 재정의)의 결합이 근거다. 종전 논거(§154⑥)는 **개별 거주 구간의 시종**만 정할 뿐 산입 구간을 정하지 않아 오독이었다. 사정거리는 **취득 당시 조정대상지역**뿐(비조정은 거주요건 자체가 없음). 세액 anchor **R-G-1~R-G-3** 신설(108,148,800 ↔ 0 ↔ 무영향). ⚠️ 예규 0건 — **조문 해석이지 유권해석이 아니다**. 상세: §7 D-6 보충 |
| ~~R-C~~ | ✅ **범위 정정 완료** (2026-08-05) | 「예규 대기」가 아니라 **범위 오설정**이었다 — §154⑧3호는 "상속받은 **주택**" 전제인데 C-8이 용도변경일 > 취득일(=상속개시일)을 강제해 **상속 경로에서는 경합이 성립할 수 없다**. 상속 개방 + 통산 배제 게이트 완료. **남은 진짜 미결은 이월과세**(§97의2 취득일 치환). 상세: [`non-housing-to-housing-conversion-inheritance-c21.plan.md`](non-housing-to-housing-conversion-inheritance-c21.plan.md) |
| ~~**R-J**~~ | ✅ **해소 — 시행령이 커버리지 안에 들어왔다** (확인 2026-08-09) | `LAW_ALIAS`에 시행령·시행규칙이 전부 등재됐고(항등 매핑이지만 **화이트리스트 역할** 때문에 명시), 매니페스트에 `additions-{transfer,inheritance,local}-decree.ts`·`-local-rule.ts` **1,066줄**이 추가됐다. 실측: 모수 201 → **323조문**, 그중 시행령·시행규칙 **112조문**, `uncovered = 0`. <br>🔴 **다만 그 해소가 새 사각지대를 만들었다** — 모수 하한선이 등재 **이전** 값 `150` 그대로라, 시행령 112조문이 통째로 빠져도 본법 211이 남아 **조용히 통과**했다. ⇒ 총량 하한 `280` 상향 + **시행령·시행규칙 독립 하한 `90`** 신설. mutation probe로 확인(소득세법 시행령 제거 시 신규 가드만 🔴 `73 > 90` 실패, 나머지 2건은 통과). |
| **R-H** | LTHD 율 DB 드리프트 | `transfer-rate-seed.ts:45-57`에 `ratePerYear` 시딩이 있는데 `rateForYears`는 `rules` 인자를 받고도 안 쓴다(`:441` dead). 이번 추출이 고착시킴 — 별건 |
| **R-E** | 겸용주택 배타 | C-14 + G-13 조기 return 앞 배치 + 인접 UI 배치 |
| **R-F** | PDF 지문 불일치 | anchor 주석에 근거 기록 |
| **R-I** | C-10b `direct` 모드 클램프 불가 | UI 안내로만 처리 — 사용자가 전체 거주기간을 넣으면 공제 과대 가능 |

**차단 메시지 문안** (⑧ 공통): `"이 조합은 현재 지원하지 않습니다 — 「비주택 → 주택 용도변경」 토글을 끄면 종전 방식으로 계산됩니다."` + 조합별 사유 1줄.

---

## 12. 산출물

**엔진·타입**
- ✅ `conversion-holding-pct.ts`(신규 leaf) — `calcConversionHoldingPct`(정수 %). ⚠️ `tax-utils.ts`에 두면 순환(design Do deviation)
- ✅ `transfer-tax-helpers.ts` — G-8 3곳 정본 위임(751 → 744) 후 **Phase B에서 H-5 분리로 503**
- ✅ **`transfer-tax-lthd.ts`(신규 340줄)** — H-5 `calcLongTermHoldingDeduction` 전체 + **L-2 §95⑤ 혼합 분기**. helpers는 재수출만(외부 import 무변경). 분리 이유: 분기 삽입으로 helpers가 812줄이 되어 800 hard cap 초과
- ✅ `types/transfer.types.ts` — `nonHousingToHousingConversion?` input(⚠️ **799줄** — 다음 필드 추가 시 800 초과, 타입 전용 파일 예외 적용 중)
- ✅ `types/transfer-result.types.ts` — `UsageConversionDetail` 인터페이스 + `usageConversionDetail?` + Pick 등록
- ✅ `transfer-tax.ts`(ⓒⓓ) · `transfer-tax-aggregate-pickers.ts`(ⓖ) — echo 전파
- ✅ `transfer-tax-exemption.ts`(697) — ⓪ Pick 확장·§154⑤ 분기 완료(Phase C). 기준일 파라미터화는 **Phase D** (⚠️ `resolveExemptionResidenceMonths`는 **개조 대상 아님**)
- ✅ `usage-period-info.ts`(신규 leaf, 58줄) — `calcUsagePeriodInfo` + `UsagePeriodInfo` 이동 + re-export(기존 import 2곳 무변경)
- ✅ `legal-codes/transfer.ts` — 법령 상수 **4종**(`LONG_TERM_DEDUCTION_CONVERSION` · `CONVERSION_HOUSING_PERIOD_START` · `CONVERSION_EXEMPTION_HOLDING`). 게이트 상수는 `tax-utils.ts`(Date export 선례 0건 + 800줄 초과라 부적합)
- `calc-wizard-asset-residence.ts` — `clampResidenceToHousingPeriod`(신규)
- `types/transfer.types.ts`(input) · `types/transfer-result.types.ts`(result echo + `TransferValuationDetailSource`)
- `transfer-tax-aggregate.ts` — `pickValuationDetails`
- `transfer-tax.ts` — §9.3 sub-step 문구·`legalBasis`
- **A-0 분리 산출물 ✅ 확정**(2026-08-04): `calc-wizard-asset-{nbl-judgment,cb}.ts` · `transfer-tax-api-body-blocks.ts` · `transfer-tax-schema-nbl.ts` · `transfer-tax-{lthd-steps,judgment-steps,aggregate-pickers}.ts` · `app/api/calc/transfer/engine-input.ts` — 총 8파일 신규(§8 표)

**법령 상수**
- `legal-codes/transfer.ts` — 기존 표기 규칙 준수: **`"소득세법 §95 ⑤"`**(조·항 사이 공백 — `:207` `LONG_TERM_DEDUCTION: "소득세법 §95 ②"` 선례)
- ⚠️ **manifest 등록 불요**: 「소득세법」 제95조는 `verifier-manifest.ts:35`·`:99`로 **조 단위 기커버**(`coverage.ts:42` `articleKey() = ${lawFullName} ${articleNo}`). 「소득세법 시행령」은 **커버리지 기제 대상 자체가 아니다**(R-J) → `manifest/additions-transfer.ts` 등록 불요. Phase A verify의 커버리지 테스트는 **회귀 확인용**이지 이 작업의 게이트가 아니다

**UI**
- `NonHousingConversionSection.tsx`(신규) + 마운트 `asset-sections/AssetSectionAcquisition.tsx`
- `TransferTaxResultView.tsx` + 상세 카드
- `DetailedStatementHelpers.ts` · `FilingFormTableRowDefs.ts` · `FilingFormTableAggregateHelpers.ts` (§9.3)
- `app/calc/transfer-tax/steps/Step4.tsx` (§9.1b)

**폼·API**
- `calc-wizard-asset-usage-conversion.ts`(신규) + `calc-wizard-asset.ts` extends
- `calc-wizard-asset-factory.ts` · `calc-wizard-asset-migrate.ts`
- `transfer-tax-api.ts`(클램프·변환·body) · `transfer-tax-api-residence.ts` · `transfer-tax-validate-asset.ts`
- `lib/api/transfer-tax-schema*.ts`(⑫ 경로 Phase 0 확정) · `app/api/calc/transfer/route.ts`

**테스트**

| 케이스 | 파일 | 이름 |
|---|---|---|
| anchor | `__tests__/tax-engine/transfer/non-housing-to-housing-conversion.anchor.test.ts` | PDF 사례 30 전 항목 |
| R-D ⓐ | 동상 | "보유 2년 · 거주 5년 → LTHD 0%" |
| R-D ⓑ | 동상 | "비주택 2년 · 주택 5년 → 표1 0% + 표2 20%" |
| C-5·C-6·C-7 | 동상 | 구간·캡 경계 |
| C-2·C-11 경계 | 동상 | "2025-01-01 / 2024-03-01 경계" |
| C-10c | 동상 | "클램프 후 거주 2년 미만 → 비과세 탈락 (D-6)" |
| C-12 | 동상 | R-3 거주요건 미적용 |
| C-25 | 동상 | 공동소유 지분 |
| C-14·C-16·C-18~C-21·C-24·C-26 | `__tests__/lib/calc/transfer-tax-validate-*.test.ts` | 차단·미노출 |
| 다자산 전파 | `__tests__/api/transfer.route.bundled-swallows-special.test.ts` | 기존 가드 갱신 |
| E2E | `e2e/non-housing-to-housing-conversion.spec.ts` | ⚠️ **sessionStorage 시드 방식**(양도세 E2E 정본 — `commercial-building-97-2-swap.spec.ts:52-58`): `makeDefaultAsset` + `hasNonHousingConversion:true`·`residentialUseStartDate` 시드 → reload → 미리보기 4 testid 단언 → 계산 → 결과 32% 단언. `addAssetByType`는 **상속세 전용**이라 쓸 수 없다 |

---

## 13. 남은 미결

| # | 항목 | Phase |
|---|---|---|
| ~~1~~ | ~~**V-4** 표2 거주 "보유 3년 이상 한정"의 지시 대상 (C-5)~~ | **해소** 2026-08-05 — §95④·⑥·②본문 (§3.1) |
| 2 | ⑫ Zod 정의 파일 경로 확정 | 0 |
| ~~3~~ | ~~A-0 후 행 번호 앵커 재실측 + 계획서 갱신~~ | ✅ **완료**(2026-08-04) — 3문서 34곳 |
| ~~**a**~~ | ~~§9.2 요약행 — 상세 카드 연결 vs 라벨 병기~~ | ✅ **결정**(G) — 상세 카드가 **같은 PrintSection 안**이라 연결·병기 **모두 불요** |
| ~~**b**~~ | ~~§9.2 상세 카드 접힘형 여부~~ | ✅ **결정**(G) — **접지 않는다**(8행으로 짧고 드문 케이스라 즉시 읽혀야 함. `print-only-css-toggle` 불요) |

---

## 14. 개정 이력

**v12 (2026-08-05)** — **Phase H 완료 ⇒ 기능 전 구간 종결**. E2E 5건 + 통합 anchor 보강 2건(**다자산 경로**에서 primary의 §95⑤ 적용 · **이력 JSON 왕복** 후 echo 생존). 🔴 **E2E 함정**: 시드 후 `expandAssetSection(page, 3)`을 빠뜨리면 위젯이 접힌 채라 `toBeVisible`이 실패한다 — `toHaveText`는 hidden도 통과해 **검증이 조용히 약해진다**. 전 Phase(0·A-0·A~H) 완료: `npm test` **13,414건** · E2E 5건 · tsc 0 · lint 0 error.

**v11 (2026-08-05)** — **Phase G 완료**. 🔴 **표시 계층이 문구가 아니라 금액을 틀리고 있었다** — 종전 표2 경로가 총 보유 7년으로 안분해 보유분 39,992,960(정확값 **35,708,000**)을 냈고 문구도 "28%+12%=32%" 자기모순이었다. ✅ **G-12 8곳 → 실제 3곳**: `DetailedStatementHelpers`가 엔진 sub-step을 우선 소비하므로 엔진만 고치면 명세서·신고서가 자동 추종한다(신고서 2파일은 **라벨 정의만**이라 불요). 신규 상세 카드 + 미결 **a·b 확정**(연결 불요·접지 않음). `DetailedStatementHelpers.ts` 803줄 초과 → fallback 산식을 `DetailedStatementLthdFormulas.ts`로 분리(791).

**v10 (2026-08-05)** — **Phase F 완료**. ⑤ `NonHousingConversionSection.tsx`(163줄) + 마운트 + ⑧ validation. 🔴 **800줄 초과 1건**: validation 추가로 `transfer-tax-validate-asset.ts`가 820줄 → 전용 검증을 **`transfer-tax-validate-usage-conversion.ts`(81줄)**로 분리(형제 `-mixed-use-asset.ts`·`-bg.ts`와 같은 위임 패턴). **브라우저 실동작 최초 확인** — 위젯 렌더·미리보기(7년11개월/표1 8%/표2 12%/합계 20%)·40% 캡(24+32→40)·시행일 게이트 3화면.

**v9 (2026-08-05)** — **Phase E 완료**. ④⑩⑫⑬⑭ + `clampResidenceToHousingPeriod`. 🔴 **설계 미결 1건 결정**: "Step4 안내가 클램프된 값을 보는가"가 §13에 등록되지 않은 채 떠 있었다 → **본다**(C-10c에서 화면·엔진이 갈리면 안 된다). `buildResidenceReqInput`도 같은 헬퍼를 쓴다. 계획 이탈 1건: **⑫를 컴패니언 스키마에 넣지 않았다**(C-26이 비-primary를 미노출로 정했으므로). ⑨⑪는 **N/A 확정**.

**v8 (2026-08-05)** — **Phase D 완료**. 🔴 **계획 순서 결함 1건 발견·해소**: Phase D의 Step4 UI가 읽을 폼 필드 ①②③가 Phase F에 있어 그대로는 착수 불가였다(D→F 의존). 사용자 승인으로 **①②③를 D로 당겼다**(위젯 ⑤·validation ⑧은 F 유지). Do deviation 2건: ① R-3을 「인자 파라미터화」가 아니라 **함수 내부 도출**로(호출부가 기준일을 고를 수 없게 — 인자 동일성 위험 원천 제거) ② **호출부가 3곳이 아니라 4곳**이었다(Step4 자동 판별 fetch의 `acquisitionDate`가 토글을 자동 덮어쓴다). `isUsageConversionActive` 단일 소스 술어 함수 신설.

**v7 (2026-08-05)** — **Phase C 완료**. ⓪ `ResidenceReqInput` Pick 확장(파생 2종 자동 전파) + `resolveExemptionHoldingStartDate`에 §154⑤ 단서 분기 + 2024-03-01 게이트. **분기 순서를 용도변경 우선으로 확정**(단서는 상속 통산으로 우회 불가) — 엔진 단독 호출 전용 논점이라 테스트로 고정. 설계 이탈 없음.

**v6 (2026-08-05)** — **Phase B 완료**. R-1 혼합 분기 + echo + 전파 6지점. Do deviation 2건을 design에 기록:
① 분기 삽입으로 `transfer-tax-helpers.ts`가 812줄이 되어 H-5를 **`transfer-tax-lthd.ts`(신규 340줄)**로 분리(helpers 503, 재수출로 import 무변경)
② `TaxErrorCode`가 enum이라 설계의 `"INVALID_CONVERSION_DATE"` 문자열은 컴파일 불가 → 기존 **`INVALID_DATE`** 사용.
계약 개수 가드(`bundled-swallows-special.test.ts`) **24 → 25** 갱신.

**v5 (2026-08-04)** — **V-2·V-3 해소** (서면-2020-부동산-5098 [부동산납세과-1247] 원문 확보). 회신이 특정한 조문은 「소득세법 시행령」 **제154조제1항**. C-13(대칭 방향) 근거를 회신의 일반 명제로 확정. R-3 착수 가능.

**v4 (2026-08-04)** — STEP 6~13 검토 반영: §7·§9를 design 참조로 축약(중복 60% 해소), `calcLongTermRate` 정본 위임, 분수 정수 연산(R-K), 전파 6지점.

**v3 (2026-08-04)** — STEP 3 재검토 32건 반영 + V-1 해소:

- 🔴 `calcConversionHoldingRate`에 **구간별 3년 가드** 명시 — v2가 R-D를 고치며 같은 결함을 §95⑤ 경로로 옮겼다
- C-5를 확정에서 내리고 **V-4 착수 조건으로 승격** — 조문 근거 없음, 8%p 차이. 잠정 총 보유기간 기준(유리)
  → **2026-08-05 해소**: §95④(표2 보유기간 정의)·§95⑥(재정의 대상은 「주택으로 보유한 기간」뿐)·§95⑤이 배제한 것은 ②**단서**뿐 — **A안 확정**, 엔진 무변경(§3.1)
- **V-1 해소** — §154⑤ 단서는 대통령령 제34265호(2024-02-29 공포, **2024-03-01 시행**). R-2 게이트 확정
- `calcConversionHoldingRate` 위치를 `lthd-start.ts` → **`helpers.ts`**로 (순환 import)
- **C-17 삭제** — L-1b는 `propertyType === "land"` 요구, 토글은 `housing` 전용이라 구조적 성립 불가(dead validation)
- C-18 판별을 폼 관측 가능한 `asset.reductions`로 정정 (`rentalReductionDetails`는 엔진 전용)
- **C-26 신설** — Step4가 전부 `assets[0]` 전용이라 비-primary 자산은 UI 미노출
- **C-10c 신설** — D-6이 세액을 바꾸는 유일 케이스를 테스트로 고정
- `<ToneCard tone="fuchsia">`는 **컴파일 에러** → 정적 리터럴 클래스로 확정 (`Tone`에 fuchsia 없음, `tones.ts:15-16` 명문)
- UI 마운트 지점 **`AssetSectionAcquisition.tsx:288`** 확정
- §7.3(e) **개조 불요**로 정정 — pass-through라 API 클램프가 자동 전파(이중 클램프 방지)
- §9.3을 §95② 하드코딩 **8곳**(`legalBasis` 3곳 포함)으로 확장
- **§9.1b Step4를 Phase G → Phase D로 이동** (D verify가 G에 의존하는 순환 해소)
- 파일 크기 표를 "실제 여는 파일 ∩ ≥750"으로 재구성 — `transfer-tax-aggregate.ts`(783) 추가, `transfer-tax-schema.ts`(765)·`validate-asset.ts`(745) 제외, 타입 전용 예외 명시
- A-0가 행 번호 앵커를 무효화함을 명시 + 별도 커밋
- `residenceMonthsTrimmed`를 ⑭·grep 점검에 추가 (침묵 drop 방지)
- **manifest 등록 불요**로 정정 + **R-J 신설** — 시행령은 `LAW_ALIAS`에 없어 커버리지 기제 대상 밖(실증: 테스트 2 passed)
- E2E를 **sessionStorage 시드 방식**으로 재작성 (양도세 정본 패턴)
- 인쇄 leaf 범위 `TransferTaxResultView.tsx:293-474` 명기 · echo 변환 지점 · `holdingPeriod` 반환 명세 · 차단 메시지 문안 · 행 번호 정정 4건

**v2 (2026-08-04)** — STEP 1 6-way 병렬 검토 62건 반영. (상세는 v2 §14 — git 이력 참조)
