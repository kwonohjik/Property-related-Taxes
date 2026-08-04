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

⇒ §95⑤의 "대통령령으로 정하는 1세대 1주택"은 §159의4가 **명시적으로 포함**한다. 요건은 ① 양도일 현재 1주택(의제 포함) ② 보유기간 중 거주 2년 이상 — **현행 게이트 `isOneHouseSingle && table2ResidenceYears >= 2`와 1:1 대응**하므로 기존 표2 대상 판정을 그대로 재사용한다(의제 주택 체인도 `transfer-tax.ts:507` 주석이 이미 §159의4로 다룬다).

**V-4에 대한 시사** — §159의4가 §95⑤ 맥락에서 「**보유기간** 중 거주기간」이라 쓸 때 그 보유기간은 별도 정의가 없으므로 §95④(취득일~양도일) = **총 보유기간**이다. 표2 거주 단서의 "보유기간"도 같은 의미로 읽는 것이 자연스러워 **잠정 결정(총 보유기간 기준)의 근거가 된다**. 다만 §159의4는 *대상 요건*, 표2 단서는 *공제율 산정*이라 층위가 달라 **완전 해소는 아니다** — V-4는 미결 유지.

### 3.2 착수 조건 (미해소 시 해당 항목을 범위에서 제외 — 리스크 아님)

| # | 항목 | 왜 착수 조건인가 | 확보 경로 | 실패 시 |
|---|---|---|---|---|
| ~~V-1~~ | ~~§154⑤ 단서 시행일~~ | — | — | **해소** (§3.1) |
| ~~V-2~~ | ~~서면-2020-부동산-5098 원문~~ | — | 사용자가 taxlaw.nts.go.kr에서 확보(2026-08-04) | **해소** (§3.1) |
| ~~V-3~~ | ~~§159의4 = "대통령령으로 정하는 1세대 1주택"~~ | — | KoreanLaw 본문 확인(2026-08-04) — §95⑤을 명시 포함 | **해소** (§3.1) |
| **V-4** | **§95⑤ 하에서 표2 거주 "(보유기간 3년 이상에 한정함)"의 지시 대상** | 총 보유기간인지 **주택** 보유기간인지 조문이 직접 정하지 않는다. 주택 보유 2.5년·거주 2.5년·총 보유 10년 케이스에서 **8%p 세액 차이** | 예규·해석례 또는 기재부 유권해석 | **총 보유기간 기준**으로 잠정 구현 — §159의4가 같은 §95⑤ 맥락에서 "보유기간"을 총 보유기간으로 쓰는 점이 근거(§3.1). 명문 부재 시 default는 유리 적용 |

> memory `feedback_unverified_authority_blocks_tax_change` — 「미확인」 근거가 판정을 가르면 **리스크가 아니라 착수 조건**이다.

---

## 4. 현행 코드 갭 — 실측

⚠️ **행 번호 앵커 주의**: Phase A-0(선분리) 이후 아래 행 번호는 무효가 된다. A-0 verify에 **"앵커 재실측 후 계획서 갱신"**이 포함돼 있다(§10).

| # | 지점 | 실측 결과 |
|---|---|---|
| G-1 | `transfer-tax-helpers.ts:536-547` `rateForYears` | **선두 `if (years < 3) return 0`이 표2 분기 전체(보유분+거주분)를 덮는다** — §7.3 설계의 핵심 제약. 표2 = `min(y×0.04,0.40) + min(r×0.04,0.40)`, 표1 = `min(y×0.02,0.30)` |
| G-2 | `transfer-tax-helpers.ts:438` `calcLongTermHoldingDeduction` | 보유기간이 항상 `acquisitionDate ~ transferDate` 단일 구간 |
| G-3 | `transfer-tax-exemption.ts:334-344` (JSDoc 325~) `resolveExemptionHoldingStartDate` | 분기가 **동일세대 상속 backdate(§154⑧3호) 하나뿐** |
| G-4 | `transfer-tax-exemption.ts:241-249` (JSDoc 234~) `resolveWasRegulatedAtAcquisition` | 판정 기준일이 `input.acquisitionDate` 고정 |
| G-5 | `transfer-tax-lthd-start.ts:23-26` | 용도변경 분기는 **주택 → 상가(사례 35) 방향만** |
| G-6 | `transfer-tax.ts:564-591` STEP 4.1·4.2 (핵심 `:568-569`) | sub-step이 `holdingPeriod.years * 4` 하드코딩 |
| G-7 | 프로젝트 전역 | `grep "사실상 주거용"` **0건** |
| G-8 | `transfer-tax-helpers.ts:489-502`(L-1b) · `:599`(splitDetail NBL) · **`DetailedStatementHelpers.ts:453-454`(UI)** | 표1·표2 산식이 `rateForYears` 밖에 **3벌 더** 존재. ⇒ **정본은 `calcLongTermRate`(`transfer-tax-mixed-use-inheritance.ts:26-47`)** — exported leaf·호출부 13곳·3년 가드 내장. 이 4벌을 정본으로 위임한다 (memory `feedback_sibling_path_already_implements_rule`) |
| G-9 | `transfer-tax-exemption.ts:119-131` `ResidenceReqInput` | **10필드 화이트리스트 `Pick`**. 여기 추가하지 않으면 R-2·R-3이 필드에 접근 불가. `ExemptionReqInput`(:142)·`DeemedOneHouseReqInput`(:153)에 **자동 전파**됨 |
| G-10 | `lib/calc/transfer-tax-api-residence.ts:12-48` `buildResidenceReqInput` | UI(Step4)가 같은 술어를 **별도 조립 입력**으로 호출. :22-23에 동일 트랩 경고 주석 존재 |
| G-11 | `transfer-tax-aggregate.ts:52-68` `pickValuationDetails` | 다자산 result 전파 화이트리스트(13필드 — 단 이번 echo는 `pickReductionDetails` 쪽). 빠뜨리면 **일괄 경로에서 침묵 누락**. 가드 `__tests__/api/transfer.route.bundled-swallows-special.test.ts` |
| G-12 | `DetailedStatementHelpers.ts:449-478,516,523,535` · `FilingFormTableRowDefs.ts:46-47` · `FilingFormTableAggregateHelpers.ts:314-315` | sub-step 라벨 소비처. **§95② 하드코딩 8곳**, 그중 `:523`·`:535`는 `lthHoldingStep?.legalBasis` — **엔진 sub-step의 `legalBasis`(`transfer-tax.ts:580`·`:587` = `"소득세법 §95 ②"`)를 그대로 인쇄** |
| G-13 | `transfer-tax-validate-asset.ts:310-312` | `isMixedUseHouse === true` **조기 return** |
| G-14 | `Step4.tsx:440-448` | 수동 ToggleCard `wasRegulatedAtAcquisition`. `regionCode` 없는 fallback에서 **이 값이 실질 판정** |
| **G-15** | `Step4.tsx:68` `primary = form.assets?.[0]` | **Step4 전체가 assets[0] 전용** — 조정대상지역 토글(:440)·거주기간 섹션(:469, `i === 0`만 갱신)·거주요건 경고(:487)·`regulatedAutoTip`(:297). `transfer-tax-api.ts:50`·`:353`도 primary만 읽는다 |

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
| D-6 | 비과세 거주요건(§154①)에도 클램프 | **적용** (재확인 후 유지) | ⚠️ **명문 없음** — §11 R-G. 사용자 결정 |
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

### D-6 보충 — 반대 논거 기록

초기 정당화("전입해 있었다면 이미 주거용 사용 개시")는 **자기모순**이다: 참이면 클램프는 no-op이고, **거짓인 경우에만 발동**해 거주기간을 깎아 비과세를 탈락시킨다. §154⑤ 단서가 **보유기간만** 옮기고 §154⑥이 거주기간을 "전입일부터 전출일까지"로만 정한 것이 거주기간 무제한을 방증한다. 사용자 재확인 결과 **유지** — §11 R-G에 불리 방향임을 명시 기록.

### D-8 보충 — L-1b(부수토지)를 제외하는 이유

L-1b는 `transfer-tax-helpers.ts:469-472`가 **`propertyType === "land" && landNature === "appurtenant_to_housing"`**를 요구하고, `landNature`는 `transfer-tax-api.ts:704`가 **`primary.assetKind === "land"`일 때만** 전송한다. 이 기능의 토글은 `assetKind === "housing"` 전용이므로 **같은 `TransferTaxInput`에 공존 불가**다(부수토지는 별도 컴패니언 자산). 차단 코드를 넣으면 **dead validation**이 되어 CLAUDE.md 전역 "불가능한 시나리오에 대한 에러 핸들링 금지" 위반이다.

---

## 6. 케이스 매트릭스

| # | 조건 | 기대 동작 |
|---|---|---|
| **C-1** | 토글 OFF | 현행 그대로 — **회귀 0** |
| **C-2** | 토글 ON · 양도일 < 2025-01-01 | **R-1 미적용**. R-2는 양도일 ≥ 2024-03-01이면 적용, R-3은 V-2에 따름 |
| **C-3** | 토글 ON · 양도일 ≥ 2025-01-01 · 표2 대상 | **§95⑤ 혼합** ← PDF 사례 30 |
| **C-4** | 토글 ON · 표2 대상 아님(1세대1주택 아님 **또는** 통산 거주 2년 미만) | §95⑤ 미적용 → 표1 단독, §95④ 본문대로 **취득일부터 전기간** |
| **C-5** | 주택 보유기간 < 3년 | 표2 **보유분 0%**. **거주분은 지급**(총 보유기간 ≥ 3년인 한) — ⚠️ **V-4 미결**. 근거 확보 전까지 유리 적용 |
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
| **C-19** | 토글 ON + 토지/건물 분리취득 | **차단**(`hasSeperateLandAcquisitionDate` — `calc-wizard-asset.ts:392`) **+ 엔진 가드 `!splitDetail`** — 엔진 단독 호출은 validate를 거치지 않는다(design I-15) |
| **C-20** | 토글 ON + §98의2 / §97의3·의4 | **차단**. `unsold_98_2`(`calc-wizard-asset-reduction.ts:320`)·`rental_97_3`·`rental_97_4` |
| **C-21** | 토글 ON + 취득원인 상속·증여·이월과세 | **차단**. §154⑧3호 통산과의 우선순위 명문 없음(§11 R-C). **해소 시 최우선 확장 대상** |
| **C-22** | 토글 ON + 미등기(L-0) / 중과 적용 중(L-1) | LTHD 배제가 **우선** — 현행 유지(토글 유무와 결과 동일하므로 차단 불요) |
| **C-23** | `redevelopment_apt` · `right_to_move_in` · `presale_right` | **UI 미노출**(진입이 `housing` 한정) |
| **C-24** | 토글 ON + 부담부증여 | **차단**. `transferType`(`calc-wizard-asset.ts:221`) |
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
| **전파 6지점** | `LongTermHoldingResult`(비-export) → `transfer-tax.ts:509` 구조분해 → `:783` 조립 → `TransferTaxResult` → Pick 목록 → pick 함수. 선례 `rental97LthdDetail` | design §전파 6지점 |
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
| ① | 폼 상태 | 🔴 **신규** `calc-wizard-asset-usage-conversion.ts` | `UsageConversionFormSlice` → `AssetForm extends`(`calc-wizard-asset.ts:58`) |
| ② | initial | `calc-wizard-asset-factory.ts:62` | `false` / `""` |
| ③ | normalize | `calc-wizard-asset-migrate.ts` | backfill. ⚠️ **유일한 안전망 아님** — 현행 포맷 sessionStorage·IndexedDB 로드에는 안 돈다 |
| ④ | API 변환 | `transfer-tax-api.ts` | 객체 생성 + **거주 클램프**(§7.2). 접근부 가드 `?? false`·`?? ""` |
| ⑤ | UI 위젯 | 🔴 신규 `NonHousingConversionSection.tsx` + 마운트 **`asset-sections/AssetSectionAcquisition.tsx:288`** | §9.1 |
| ⑥ | 사이드바 | — | **N/A 확인** (`computeTransferSummary`는 금액 5필드만) |
| ⑦ | 결과 카드 | `TransferTaxResultView.tsx` + 신규 상세 카드 + **G-12 3파일** | §9.2·§9.3 |
| ⑧ | validation | `transfer-tax-validate-asset.ts` | C-8·C-9·C-14·C-16·C-18~C-21·C-24. ⚠️ **`:310` 조기 return보다 앞** |
| ⑨ | Zod enum 메인 | `transfer-tax-schema.ts` | **확인 후 N/A 기록** |
| ⑩ | Zod refines | `transfer-tax-schema-refines.ts`(`addPropertyRefines:13`) | 날짜 순서. **메인 + 컴패니언** |
| ⑪ | 자산-수준 fallback | **`lib/calc/transfer-tax-api.ts`**(`:100`·`:113`·`:238`) | ~~route.ts~~ 경로 정정 |
| ⑫ | **Zod 입력 객체** | ⚠️ **Phase 0에서 경로 확정** | 선례 `houseToCommercialConversion`은 `-schema-sub.ts`가 아니라 **`transfer-tax-building-schemas.ts:206`**에 있다. 메인·컴패니언 양쪽 |
| ⑬ | body spread | `transfer-tax-api.ts` | `callTransferTaxAPI` body |
| ⑭ | Route 매핑 | `app/api/calc/transfer/route.ts` | `residentialUseStartDate`는 `toDate()`, **`residenceMonthsTrimmed`는 number 그대로**. 선례 `general-building-route-helper.ts:184-188`이 필드별 명시 매핑 |

### 파일 크기 — Phase A-0 대상 (**이 기능이 실제로 여는 파일 ∩ ≥750**)

| 파일 | 현재 | 근거 | 조치 |
|---|---|---|---|
| `lib/stores/calc-wizard-asset.ts` | **838** | ① extends 추가 | 신규 슬라이스로 회피 + 본체 분리 |
| `lib/calc/transfer-tax-api.ts` | **836** | ④⑪⑬ + 클램프 | **선분리** |
| `lib/api/transfer-tax-schema-sub.ts` | **829** | ⑫(경로 확정 시) | 선분리 |
| `lib/tax-engine/transfer-tax.ts` | **805** | G-6 §9.3 | 선분리 |
| `lib/tax-engine/transfer-tax-aggregate.ts` | **783** | §7.4 전파 3 | 기회주의적 분리 |
| `lib/tax-engine/transfer-tax-helpers.ts` | 751 | §7.3(a)(b) 대폭 개조 | 기회주의적 분리 — ⚠️ **§4 앵커 무효화**(아래) |
| `app/api/calc/transfer/route.ts` | 756 | ⑭ | 기회주의적 분리 |

**제외**: `transfer-tax-schema.ts`(765) — ⑨가 N/A라 **열지 않는다**(Surgical). `transfer-tax-validate-asset.ts`(745) — **700~749 안정 구간**이라 CLAUDE.md가 "미리 쪼개면 순수 낭비"로 규정. `types/transfer.types.ts`(784)·`transfer-result.types.ts`(422) — **타입 전용 파일 예외**.

> ⚠️ **A-0가 §4 G-1·G-2·G-6·G-8과 §7.3의 행 번호 앵커를 전부 무효화한다.** A-0 verify에 **"앵커 재실측 후 계획서 갱신"**을 포함한다. A-0는 **별도 커밋**(가능하면 별도 PR)으로 두어 기능 diff와 섞지 않는다.

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
| 표시 계층 | 🔴 본 step 산식(`transfer-tax.ts:541-549`·`:556`) + sub-step **금액**(`:564-591`) + `legalBasis`(`:580`·`:587`) 분기 — engine.design §표시 계층 |
| E2E | **sessionStorage 시드 방식**(`commercial-building-97-2-swap.spec.ts:40-65`) — 표2 게이트 충족 필드 전건 필요 |

## 10. Phase 분할

| Phase | 내용 | verify |
|---|---|---|
| **0** | ~~V-2·V-3 해소~~ · V-4 처리 · ⑫ Zod 경로 확정 · **PDF 사례 30 anchor 작성 후 현행 엔진 실행** | anchor **실패** + 실패 메시지가 예상 갭과 일치. **V-4 미확보 시 총 보유기간 기준 확정**. ⑫ 파일 경로 기재 |
| **A-0** | 선분리 7파일(§8 표) — **별도 커밋** | `npx tsc --noEmit` 0건 · `npm run test:transfer` 통과 · 대상 ≤700 · **§4·§7.3 행 번호 앵커 재실측 후 계획서 갱신** |
| **A** | `calcUsagePeriodInfo` leaf 추출 · `rateForYears` 분해(가드 보존) · G-8 2곳 위임 · `calcConversionHoldingRate`(구간 가드) · 상수 2종 · 법령 상수 추가 | **`npm run test:transfer`**(`package.json:14`, ~59초) 전건 통과. 🔴 **필수 케이스 2건**: ⓐ 비주택 2년·주택 5년 → 표1 **0%** + 표2 20% (가드 내장 확인) ⓑ **분수 정수 연산** — 비주택 3년·주택 4년·거주 3년 → 34% → 장특 **60,703,600**(소수 연산이면 60,703,599) |
| **B** | R-1 혼합 분기 + echo + 전파 3지점 | anchor **장특 57,132,800** 통과. C-5·C-6·C-7·C-25 · **2025-01-01 정확일 경계**. `transfer.route.bundled-swallows-special.test.ts` 통과. *엔진 단위 테스트로만 — 화면 확인은 Phase E 이후* |
| **C** | ⓪ Pick 확장 → R-2 §154⑤ 분기 + 2024-03-01 게이트 | C-11 · **2024-03-01 경계**. 기존 §154⑧3호 상속 테스트 회귀 0 |
| **D** | R-3 — 기준일 파라미터화(엔진 + `buildResidenceReqInput`) **+ §9.1b Step4 UI 4항목** | C-12. **"Step4 안내 ↔ 엔진 판정 일치"** — UI가 같은 Phase에 있어야 검증 가능 |
| **E** | ⑨~⑭ API·Zod·Route | request body 신규 **3필드** 도달(단건 + 다자산). ⑫⑬⑭ grep(§8) |
| **F** | ①②③⑤⑧ UI + validation | C-8·C-9·C-14·C-16·C-18~C-21·C-24·C-26 차단·미노출 확인. ⚠️ **겸용주택 ON + 토글 ON 실행 확인**(G-13). 이력 복원 확인. `fuchsia` 정적 클래스 + `check-tone-classes.sh` 통과. `npm run lint` 0건 |
| **G** | ⑦ 결과 카드 + §9.3 8곳 문구 교체 | 신고서 표·상세명세서가 §95⑤ 문구로 표시. 요약행 연결·접힘 여부 확정(§13) |
| **H** | 통합 anchor + E2E | 산출세액 **26,177,520** · 지방소득세 **2,617,752**. E2E는 **sessionStorage 시드 방식**(§12) |

---

## 11. 리스크 · 별건

| # | 항목 | 내용 |
|---|---|---|
| ~~R-D~~ | ✅ **해소** | `calcLongTermRate` 정본 위임으로 3년 가드가 함수 내장 — 추출 자체를 취소해 회귀 위험 소멸 (§5 D-2 보충) |
| **R-K** | 🔴 **분수 정수 연산** | 소수 rate 합산이 1원 과소(78/17,576 조합). §95⑤이 표1+표2를 합치며 **새로 만드는 결함**이고 anchor로는 안 잡힌다. `applyRateFraction` + 정수 % 필수. **Phase A 필수 verify** |
| **R-G** | ⚠️ **D-6 — 명문 없는 불리 적용** | 비과세 거주요건에 주택기간 클램프는 「소득세법 시행령」 제154조 제6항에 **없는 제한**이며 **납세자에게 불리**하다(C-10c에서 비과세 탈락). 사용자 재확인 후 유지. **C-10c 테스트로 반드시 고정**. 근거 예규 확보 시 §3.2로 승격 |
| **R-C** | §154⑧3호 ↔ §154⑤ 경합 | 명문 없음 → **C-21 차단**. **해소 시 최우선 확장 대상**(상속 오피스텔의 주거용 전환은 실무 빈발) |
| **R-J** | ⚠️ **시행령은 법령 검증 커버리지 대상 밖** | `coverage.ts:19` `KNOWN_ABBRS = Object.keys(LAW_ALIAS)`이고 `citation-parser.ts:26-39` `LAW_ALIAS`는 **본법 12개만** 담는다. 실증: `legal-codes/transfer.ts:197·388·466`이 이미 "소득세법 시행령 §154"를 인용하는데도 `legal-verification-coverage-complete.test.ts` **2 passed**(uncovered = []). ⇒ 프로젝트 전체의 시행령 인용(§154·§155·§163·§166 등)이 통째로 검증 밖이다. **이번 계획과 무관한 기존 구조 갭 — 별건 이슈** |
| **R-H** | LTHD 율 DB 드리프트 | `transfer-rate-seed.ts:45-57`에 `ratePerYear` 시딩이 있는데 `rateForYears`는 `rules` 인자를 받고도 안 쓴다(`:441` dead). 이번 추출이 고착시킴 — 별건 |
| **R-E** | 겸용주택 배타 | C-14 + G-13 조기 return 앞 배치 + 인접 UI 배치 |
| **R-F** | PDF 지문 불일치 | anchor 주석에 근거 기록 |
| **R-I** | C-10b `direct` 모드 클램프 불가 | UI 안내로만 처리 — 사용자가 전체 거주기간을 넣으면 공제 과대 가능 |

**차단 메시지 문안** (⑧ 공통): `"이 조합은 현재 지원하지 않습니다 — 「비주택 → 주택 용도변경」 토글을 끄면 종전 방식으로 계산됩니다."` + 조합별 사유 1줄.

---

## 12. 산출물

**엔진·타입**
- `transfer-tax-helpers.ts` — `calcConversionHoldingPct`(정수 %), 혼합 분기, **G-8 3곳을 `calcLongTermRate` 정본 위임**
- `transfer-tax-exemption.ts` — ⓪ Pick 확장, §154⑤ 분기, 기준일 파라미터화 (⚠️ `resolveExemptionResidenceMonths`는 **개조 대상 아님**)
- `usage-period-info.ts`(신규 leaf) — `calcUsagePeriodInfo` + `UsagePeriodInfo` 이동 + re-export
- `legal-codes/transfer.ts` — 게이트 상수 2종 + 법령 상수 3종
- `calc-wizard-asset-residence.ts` — `clampResidenceToHousingPeriod`(신규)
- `types/transfer.types.ts`(input) · `types/transfer-result.types.ts`(result echo + `TransferValuationDetailSource`)
- `transfer-tax-aggregate.ts` — `pickValuationDetails`
- `transfer-tax.ts` — §9.3 sub-step 문구·`legalBasis`
- **A-0 분리 산출물**: 7파일의 분리 축(orchestrator/helpers/types/sections)과 신규 파일명은 **Phase A-0에서 확정**

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
| 1 | **V-4** 표2 거주 "보유 3년 이상 한정"의 지시 대상 (C-5) | 0 |
| 2 | ⑫ Zod 정의 파일 경로 확정 | 0 |
| 3 | **A-0 후 행 번호 앵커 재실측 + 계획서 갱신** | A-0 |
| **a** | §9.2 요약행(`:100`) — 상세 카드 연결 vs 라벨 병기 **택일** | G |
| **b** | §9.2 상세 카드 **접힘형 여부** (접힘이면 `print-only-css-toggle` 필수) | G |

---

## 14. 개정 이력

**v5 (2026-08-04)** — **V-2·V-3 해소** (서면-2020-부동산-5098 [부동산납세과-1247] 원문 확보). 회신이 특정한 조문은 「소득세법 시행령」 **제154조제1항**. C-13(대칭 방향) 근거를 회신의 일반 명제로 확정. R-3 착수 가능.

**v4 (2026-08-04)** — STEP 6~13 검토 반영: §7·§9를 design 참조로 축약(중복 60% 해소), `calcLongTermRate` 정본 위임, 분수 정수 연산(R-K), 전파 6지점.

**v3 (2026-08-04)** — STEP 3 재검토 32건 반영 + V-1 해소:

- 🔴 `calcConversionHoldingRate`에 **구간별 3년 가드** 명시 — v2가 R-D를 고치며 같은 결함을 §95⑤ 경로로 옮겼다
- C-5를 확정에서 내리고 **V-4 착수 조건으로 승격** — 조문 근거 없음, 8%p 차이. 잠정 총 보유기간 기준(유리)
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
