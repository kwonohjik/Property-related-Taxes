# 지분 모드 필요경비 개산공제 — 지분율 미적용 결함 정정 (계획서 rev.2)

> 대상 세목: 양도소득세 · 발견 경위: P3(PR #843) 지분 스케일 정정 중 부수 발견
> 관련 시리즈: `transfer-separate-acq-date-per-part-completion.plan.md` §14 "미검증 별건"
> 검증 원칙: file:line·법령·수치는 **전부 실측**. 미확인은 "확인 필요"로 명시.
> **rev.2 = 6-way 자가검토(오류·누락·모순·정책위반·개선·UI누락) 전량 반영.** rev.1 대비 변경은 §13.

---

## 1. 결함

공유지분 자산에서 **필요경비 개산공제(소득령 §163⑥)가 지분율만큼 축소되지 않는다.**

취득시 기준시가는 물건 전체(100%) 값으로 엔진에 전달되는데, 개산공제는 그 값에 그대로
3%를 곱한다. 같은 필요경비 산식의 다른 항인 환산취득가액은 정상적으로 지분 스케일이므로,
**한 합계식의 두 항이 서로 다른 스케일**이 된다.

### 1.1 실측 (지분 50%, 모든 입력 금액을 절반으로)

| 항목 | 물건 전체 | 지분 50% | 기대 | 판정 |
|---|---|---|---|---|
| 환산취득가액 | 625,000,000 | 312,500,000 | 312,500,000 | ✅ |
| **개산공제** | 15,000,000 | **15,000,000** | 7,500,000 | ❌ **2배** |
| 양도차익 | 360,000,000 | 172,500,000 | 180,000,000 | ❌ 7,500,000 과소 |

> 환산취득가액 = `양도가 × (취득시 기준시가 ÷ 양도시 기준시가)`. 기준시가는 분자·분모에 동시 등장하므로
> **기준시가를 스케일해도 상쇄돼 무효**다 — 그래서 기준시가 스케일은 해법이 아니다(§6.5).
> 이 사례에서 환산취득가액이 정확히 절반인 것은 결과가 `transferPrice`에 **선형**이기 때문이며,
> 개산공제는 그 선형성 밖에 있어 100% 값이 그대로 남는다.
>
> ⚠️ **"항상 정확히 절반"은 아니다** — 정정 후 산식은 floor를 2회 거쳐 「전체 ÷ 2」와
> **0.48%에서 1원 이탈**한다(실측, §7). anchor 기대값은 산식 자체로 고정한다.

**방향: 과소과세**(납세자 유리). 그러나 법령 정확성이 우선이며, 아래 1.2가 더 심각하다.

### 1.2 파급 — 필요경비 **모드 선택**까지 뒤집힌다

소득세법 §97②2호 단서는 가목(환산취득가 + 개산공제)과 나목(자본적지출 + 양도비)을 **택일**한다.
가목만 부풀면 판정 자체가 달라진다. 경계 케이스 실측:

| | 물건 전체 | 지분 50% (모든 금액 ÷2) |
|---|---|---|
| 가목 (환산 + 개산공제) | 640,000,000 | 327,500,000 |
| 나목 (자본적지출 + 양도비) | 650,000,000 | 325,000,000 |
| **판정** | **swap 발동** | **swap 미발동** |
| 적용 필요경비 | 650,000,000 | **15,000,000** |

동일한 경제적 거래인데 지분만 절반이면 필요경비가 6.5억 → 1,500만원으로 바뀐다.
방향도 반대(과대과세)로 뒤집힌다.

---

## 2. 법령 근거 (법제처 원문 확인 완료)

### 2.1 소득세법 §97②2호 가목 — **결정적 근거**

> 2. 그 밖의 경우의 필요경비는 … 자산별로 대통령령으로 정하는 금액을 더한 금액. 다만, …
> 가목의 금액이 나목의 금액보다 적은 경우에는 나목의 금액을 필요경비로 할 수 있다.
> **가. 제1항제1호나목에 따른 환산취득가액과 본문 중 대통령령으로 정하는 금액의 합계액**

가목은 두 항의 **합계액**이다. 한 합계식의 두 항이 서로 다른 스케일일 수 없다.
이 근거만으로 현행이 오류임이 확정된다 — 개산공제 base의 해석 논쟁이 필요 없다.

### 2.2 소득세법 시행령 §163⑥ — 개산공제액

| 호 | 대상 | 산식 |
|---|---|---|
| 1호 | 토지 | 취득당시 §99①1호 **가목** 개별공시지가 × 3/100 (미등기 3/1000) |
| 2호가목 | §99①1호 **다목** 건물(부수토지 포함) 및 **라목** 주택 | 취득당시 다목·라목 가액 × 3/100 (미등기 3/1000) |
| 3호 | §94①2호 나목·다목 자산 | 취득당시 기준시가 × 7/100 |
| 4호 | 그 외 | 취득당시 기준시가 × 1/100 |

공유지분에 대한 별도 규정은 **없다**. 양도자산이 지분이면 그 지분에 상당하는 기준시가가
base라는 일반원칙에 따른다(각 공유자는 자기 지분에 대해 독립적으로 납세의무를 진다).

### 2.3 재결례 — **직접 근거 있음** (rev.2 정정)

> rev.1은 "재결례 0건"이라 단정했으나 **검색어가 좁았다**(`필요경비개산공제`). 실제로 존재한다.

**조세심판원 국심1989부0035 (1989.04.24, 세목: 양도)** — 본문 전문 확인 완료.

> 사안: 384㎡ 대지를 청구인 외 2인이 **공유**로 취득·양도(청구인 지분 **1/3** = 128㎡).
> 처분청이 청구인 단독 취득·양도로 보아 **전체 가액**(양도 120,000,000 / 취득 7,746,000)으로 과세.
>
> 결정: *"쟁점대지의 양도 및 취득가액은 처분청이 채택한 가액의 **3분의1로 경정**하여 줌이 타당"*

**공유지분 양도 시 과세표준 구성요소를 지분 기준으로 산정**한다는 원리를 직접 확인한다.

⚠️ **인용 한계 (반드시 병기)**: ① 1989년 재결로 **구 소득세법** 시기다. ② 쟁점이 **실지 양도·취득가액**이지
개산공제가 아니다. → 이 재결례는 §2.1 「합계액」 논거를 **보강**하는 정황증거로 쓰고, 단독 근거로 삼지 않는다.

**국세청 해석례 `122836`(2006.11.01) "비과세 요건을 갖춘 고가주택의 공유지분 양도시 양도차익의 계산방법"** —
제목만 확인. 법제처 API가 국세청 해석례 본문 조회를 제공하지 않아 **본문 미확인**. Do 진입 전 확인 권장.

### 2.4 「명문 근거 없는 불리 적용 금지」 정책에 대한 답 (rev.2 신설)

memory `feedback_no_unfavorable_application_without_legal_basis`(★★★)는 *"납세자 유리가 원칙이고,
불리하게 적용하려면 명문 근거가 필수"*라고 한다. 개산공제 축소는 표면상 불리하므로 이 정책에 답해야 한다.

| 반론 | 답 |
|---|---|
| "§163⑥은 **개별공시지가**라 썼지 지분 가액이라 하지 않았다"(문언주의) | 개별공시지가는 **물건의 단가·가액**이고, 그것을 곱할 대상은 **양도자산**이다. 양도자산이 지분이면 그 지분의 가액이 base다 — §163⑥이 규율하는 건 *율*이지 *귀속 범위*가 아니다 |
| "이건 제한 규정의 확장 적용 아닌가" | **아니다.** 제한 규정을 명문 밖으로 넓히는 것이 아니라, **base 자산을 잘못 지정한 스케일 버그**를 고치는 것이다. 취득가액을 100%로 계산하던 걸 고치는 것과 같은 성격이며, 그 정책이 막으려는 유형(명문 없는 배제·축소)이 아니다 |
| "개산공제는 의제 공제이므로 물건 기준이 입법 취지" | §97②2호 가목이 환산취득가액과의 **합계액**을 필요경비로 규정한다(§2.1). 한 항은 지분, 다른 항은 물건 기준이라는 해석은 조문 구조상 성립하지 않는다 |
| "결과가 일률적으로 불리하다" | **아니다.** §1.2 실측에서 정정 후 필요경비가 15,000,000 → 325,000,000으로 **유리하게 뒤집힌다**(swap 경계). 방향은 입력에 따라 양쪽이다 |

**결정적 정황증거 (rev.2 신설)**: 이 저장소의 **사이드바 미리보기는 이미 지분율을 적용하고 있다**
(`calc-wizard-store.ts:486` 개산공제 산출 → `:506` `floor(baseExp × 지분율)`).
독립 구현체가 "지분 적용이 옳다"를 전제하고 있으며, 그 결과 **현재 사이드바 값 ≠ 엔진 값**이라는
사용자 가시 불일치가 이미 존재한다. 즉 이 작업은 새 정책 도입이 아니라 **엔진을 기존 전제에 맞추는 것**이다.

---

## 3. 근본 원인

`standardPriceAtAcquisition`은 **물건 전체(100%) 값**으로 전달되며, 이는 의도된 설계다.

| 소비처 | 100% 값이 옳은가 | 근거 |
|---|---|---|
| 환산취득가 분자 | ✅ 무관 | 분모(양도시 기준시가)도 100% → 상쇄 |
| split 안분 비율 `landStd / total` | ✅ 필수 | `landStd = ㎡당 공시지가 × 면적`이 100%. 한쪽만 스케일하면 비율이 깨진다 |
| 감면 조문 기준시가 **요건** 판정 | ✅ (추정) | 주택 자체의 가액 요건(§99의4 3억·§97의3 6억 등)은 물건 기준일 개연성이 높다 — **확인 필요, 별건** |
| **개산공제 base** | ❌ | 양도자산(지분)의 기준시가여야 한다 |

**따라서 기준시가 입력 자체를 스케일하면 안 된다.** 개산공제 **계산 지점에만** 지분율을 적용해야 한다.

### 3.1 P3(PR #843)에서 이 지점을 남긴 이유

P3는 파트 필드·추계 가액의 raw 누수를 정정하면서 기준시가를 **의도적으로 raw로 유지**했다
(근거: 환산 산식 상쇄). 그 판단은 환산취득가에 대해서는 옳았으나 **개산공제를 놓쳤고**,
당시 "미검증 — 별건 확인 필요"로 기록했다. 본 계획서가 그 후속이다.

---

## 4. 영향 범위 (rev.2 — 6-way 자가검토로 **전수 재조사**)

> rev.1은 "8파일 15지점"이라 했으나 **약 절반만 잡고 있었다**. 원인: grep 패턴이 `, 0.03)` 형태에
> 한정돼 `? 0.003 : 0.03)`·`* rate`를 놓쳤고, 파일 목록을 손으로 고른 뒤 그 안에서만 찾았다.
> 의미 기반(`estimatedDeduction|LumpDeduction|AppraisalDed` **대입 지점**)으로 다시 훑었다.

### 4.1 전수 인벤토리 — **14파일 28지점** (대상 12파일 26지점)

| # | 파일:line | 경로 | 편집 단위 |
|---|---|---|---|
| A1~A3 | `transfer-tax-helpers.ts:323,331,341` | 비-split 환산·감정·매매사례 | **1** (`:350` `calcNecessaryExpense` 단일 합류) |
| B1·B2 | `transfer-tax-split-gain.ts:398,399` | split 파트별 | 1 (잔액 흡수 쌍) |
| C1·C2 | `transfer-tax-pre-housing-disclosure.ts:147,148` | PHD §164⑤ | 1 |
| C3 | `transfer-tax-pre-housing-disclosure.ts:230-233` | 겸용 PHD 4부분 | 1 (4곳) |
| D1·D2 | `transfer-tax-mixed-use-commercial.ts:169,170` | 겸용 상가분 | 1 |
| **D3·D4** | `transfer-tax-mixed-use-helpers.ts:565` | **겸용 주택분** ⟵ rev.1 누락 | 1 |
| E1·E2 | `commercial-building-valuation.ts:302,396` | 상가·오피스텔 §164⑥ | 2 |
| **F1·F2** | `general-building-valuation.ts:507,508` | 일반건물 ⟵ rev.1이 `:553`(**율 결정** 지점) 오인용 | 1 |
| **F3~F5** | `general-building-extension.ts:159,160,189` | **일반건물 증축분** ⟵ rev.1 파일 통째 누락 | 1 |
| G1 | `redevelopment-land-contribution.ts:116` | 재개발 토지 §166③ | 1 |
| G2 | `redevelopment-housing-contribution.ts:141` | 재개발 주택 | 1 |
| **G3** | `redevelopment-split.ts:169` | **재개발 인가전** ⟵ rev.1 파일 통째 누락 | 1 |
| **I1** | `multi-parcel-transfer.ts:365` | **다필지** ⟵ rev.1 파일 통째 누락. `:373` swap 비교 포함 → §1.2 파급 동일 재현 | 1 |

**대상: 12파일 26지점 · 편집 단위 ~13곳**

### 4.2 범위 밖 2건 (rev.2 확정)

| 파일:line | 사유 |
|---|---|
| `stock-transfer/stock-transfer-tax.ts:478` | **지분율 개념 자체가 없다** — `shareCount`가 곧 보유분이고 `ownershipNumerator/Denominator`가 적용되지 않는다. ⚠️ rev.1의 "§163⑥3호·4호 **미구현** 확정"은 **사실 오류**다 — 4호(1%)는 여기에 구현돼 있다(`stock-valuation-unlisted.ts` 주석 "개산공제 = 취득당시 기준시가 × 1% (§163⑥4)"). 근거를 `ESTIMATED_DEDUCTION_RATE` 상수 2종에서만 찾은 것이 원인 |
| `burdened-gift-apportionment.ts:171` | **부담부증여 경로 전체가 지분 미인지**다. `transfer-tax-api-burdened-gift.ts`에 `getOwnershipRatio`/`applyRatio` **0건**이고, `transfer-tax-api.ts:207-208`에서 부담부증여 분기가 지분 분기보다 **앞**이라 `primaryFractional`에 도달하지 않는다. 여기만 스케일하면 **이 계획이 고치려는 혼합 스케일 결함을 새로 만든다** → 부담부증여 × 지분은 **별건** |

### 4.3 지분율 전달 가능성 (실측)

| 경로 | 가용 | 근거 |
|---|---|---|
| primary | ✅ | `transfer-tax-api.ts` `primaryRatio = getOwnershipRatio(primary)` |
| companion | ✅ | `transfer-tax-api-helpers.ts:434` — `standardPriceAtAcquisition`도 raw 전송(`:525-528`)이라 **동일 결함 존재** |
| 서브엔진(GB·CB·재개발) | ⚠️ | 기준시가 입력에 `applyRatio` 적용 **0건**(실측) = raw 100% 확정. 단 **자체 input 타입**이라 별도 배관 필요(§6.3) |
| 다필지(parcel) | ⚠️ | `transfer-tax-api.ts:471-510` parcel 매핑이 전부 raw. **금액 필드 raw 누수는 P3(PR #843) 동형의 별건** |
| 헬퍼 | ✅ | `getOwnershipRatio:276-281` · `applyRatio:369-371`(`Math.floor`) |

### 4.4 율 상수 — negative finding (후속 리뷰어용)

`transfer-tax-helpers.ts:311` `isUnregistered ? 0.003 : 0.03` · `legal-codes/transfer.ts:147-152`.

- **0.03·0.003은 1원 오차가 없다** — `floor(x×0.03)` vs `floor(x×3/100)` 불일치 **0건**(전수+랜덤 실측).
  memory `feedback_applyrate_fractional_rate_one_won_error`의 0.0012 사례와 달리 **분수 정수 연산 전환 불요**.
- **인접 결함(범위 밖, 기재만)**: `commercial-building-valuation.ts:302,396` · `redevelopment-*-contribution.ts:116,141`은
  `isUnregistered` 분기 없이 3% 고정 — §163⑥ 각 호 단서(미등기 3/1000) 미적용. 헬퍼가 `rate`를 파라미터로
  받으므로 교체 과정에서 자연히 노출된다.

## 5. 테스트 공백 (왜 아무도 못 잡았나)

지분 모드의 정본 anchor인 `__tests__/tax-engine/transfer-tax/fractional-acquisition-case-27.test.ts`
(교재 사례 27 — 동일 아파트 2회 지분 취득)는 **실거래가 모드 전용**이다
(`:49`·`:99` `useEstimatedAcquisition: false`) → 개산공제가 0이라 이 경로를 지나가지 않는다.

**지분 + 추계 조합에서 「엔진 개산공제 값」을 단언하는 테스트가 전 저장소에 0건이다.**
(rev.2 정정 — rev.1의 "조합 테스트 0건"은 과장. 결합 파일은 존재하나 전부 다른 것을 본다:
`transfer-fractional-part-field-ratio.test.ts`는 **request body만** capture하고,
`route.fractional` 계열은 `useEstimatedAcquisition: false`라 개산공제 경로를 지나지 않는다.)
`totalPropertyTransferPrice`(지분 모드 마커)를 쓰는 엔진 테스트도 사례 27 하나뿐이다.

---

## 6. 설계안 (rev.2)

### 6.1 헬퍼 — **기존 함수 흡수·이동** (신규 생성 아님)

⚠️ rev.1은 `calcLumpSumDeduction`을 **신규 생성**한다고 썼는데, `computeEstimatedDeduction`이
**이미 존재한다**(`burdened-gift-apportionment.ts:164`, 사용처 `:363-364` 2곳).
신규 추가 시 같은 법령(§163⑥) 개념 함수가 2개 = `feedback_ui_engine_dual_truth_avoidance` 위반.

→ **기존 함수를 공용 위치(`tax-utils.ts`)로 이동 + 파라미터 추가**한다. 파라미터명 `assetAcquisitionPrice`는
**오칭**(실제 base는 기준시가)이므로 이때 함께 정정한다.

```ts
/**
 * 필요경비 개산공제 (소득령 §163⑥). 공유지분 자산은 **지분 기준시가**를 base로 한다.
 * @param standardPriceAtAcq 물건 전체(100%) 취득시 기준시가
 * @param rate 3/100 (미등기 3/1000)
 * @param ownershipRatio 공유지분율 (기본 1)
 */
export function computeEstimatedDeduction(
  standardPriceAtAcq: number,
  rate: number,
  ownershipRatio = 1,
): number {
  return applyRate(applyRatio(standardPriceAtAcq, ownershipRatio), rate);
}
```

### 6.2 ⚠️ **잔액 흡수 필수** (rev.2 신설 — 최대 결함)

파트별로 각각 지분율을 적용하면 **§163⑥2호가목 항등성이 깨진다**. 실측(10만건):

| 방식 | 「토지분 + 건물분 = 라목 총액 × 3%」 위반 | 최대 편차 |
|---|---|---|
| 파트별 독립 적용 | **50,831 / 100,000 (50.8%)** | −2원 |
| **마지막 파트 잔액 흡수** | **0 / 100,000** | 0 (건물분 음수 0건) |

```
wholeDed    = computeEstimatedDeduction(라목 총액, rate, ratio)
landDed     = computeEstimatedDeduction(landStd,   rate, ratio)
buildingDed = wholeDed − landDed        // ← 잔액 흡수 (별도 floor 금지)
```

**직전 PR #841이 세운 H10 anchor**(`split-acq-std-price-independent.test.ts` — "라목 총액 × 3% = 15,000,000")가
인코딩한 법정액 불변식을, 이 계획대로 파트별 적용하면 **지분 자산에서 스스로 무너뜨린다**.
memory `feedback_floor_residual_absorption` 위반이자 자기모순이다.

적용 대상: **B1·B2**(split 토지·건물) · **C1·C2**(PHD 2시점) · **C3**(겸용 4부분 — 마지막 1곳이 흡수) ·
**D1~D4**(겸용 상가·주택 각 쌍) · **E1·E2** · **F1·F2** · **F3~F5** · **G1~G3**.

### 6.3 서브엔진 input 타입 전파 (rev.2 신설)

26지점 중 **~10곳이 자체 input 타입을 가진 서브엔진**이라 `TransferTaxInput`에 필드 하나 추가한다고
도달하지 않는다. 실측된 별도 타입 **7종** — 이름·위치는 엔진 설계 §2.1 표가 정본:
`PreHousingDisclosureInput` · `GeneralBuildingInput` · `RedevLandContribInput` ·
`RedevHousingContribReceiveEstimatedInput` · `CommercialBuildingValuationInput` ·
`MixedUseAssetInput` · **`MultiParcelInput`**.

→ 각 타입에 `ownershipRatio?: number` 추가 + **호출부 전달**이 별도 작업이다. §9에서 Phase를 분리한다.

### 6.4 floor 순서 — **지분 먼저** (결정 + 한계 명시)

| 순서 | 산식 | 채택 |
|---|---|---|
| **A (채택)** | `floor(floor(std × ratio) × rate)` | 「지분 기준시가」가 result echo 대상(§8 ⑦)이라 중간값이 필요. `applyRatio`가 전 엔진의 지분 적용 규약(`Math.floor`)이라 일관 |
| B (현행 사이드바) | `floor(floor(std × rate) × ratio)` | A와 **0.49% 불일치**(실측) → 사이드바를 A로 통일 |
| C | `floor(std × ratio × rate)` 단일 floor | A 대비 **0.96%에서 1원 큼**(납세자 유리). 중간값이 없어 echo 불가 |

⚠️ **A는 C보다 0.96% 확률로 1원 작다**(불리 방향). rev.1이 "법령 문언과 일치"라 단정한 것은 **무근거**였다 —
§163⑥은 지분 기준시가를 원 단위로 확정하라고 규정하지 않는다. A를 택하는 근거는 **법령이 아니라
코드 일관성**(`applyRatio` 규약)이며, 1원 절사는 이 엔진 전체의 정수 연산 규약의 결과다.
**이 선택은 사용자 확인 대상**으로 §12에 남긴다.

### 6.5 부결안

| 안 | 부결 사유 |
|---|---|
| 기준시가를 ×ratio로 전송 | split 안분 비율이 깨진다 — `landStd = floor(㎡당 × 면적)`은 기준시가 총액을 참조하지 않으므로(`split-gain.ts:47`), 총액만 절반이 되면 legacy 경로에서 `building = max(0.5·total − landStd, 0) = 0` → `landRatio = 1` 클램프(실측 확인) |
| 개산공제 전용 필드 신설 | 같은 값의 두 버전 = dual-truth |
| `totalPropertyTransferPrice` 역산 | 부담부증여에서 `transferPrice`가 채무합계 **placeholder**(`transfer-tax-api.ts:174-177,207-208`)라 역산 불가. 이 조합은 **단일자산 부분소유 + 부담부증여**로 실재 도달한다 |
| **엔진 단일 종료점에서 1회 스케일** | 성립하지 않는다 — 개산공제는 상류 두 곳에 참여한다: ① `calcNecessaryExpense`의 §97②2호 swap 비교(`transfer-tax-helpers.ts:250` `estimatedSide = estimatedBase + estimatedDeduction`) ② split 파트별 `landGain`/`buildingGain` 산술(`split-gain.ts:448-449`) |

### 6.6 범위 축소 불가 근거 (rev.2 신설)

"겸용·상가·재개발은 지분과 조합 불가하니 빼자"는 축소 제안이 리뷰에서 나올 수 있으나 **전부 도달 가능**하다:

- 차단 게이트 `transfer-tax-validate.ts:72`는 `isFullFractionalBundle`에 걸려 있고, 그 함수는
  **`assets.length > 1`이 전제**(`transfer-tax-api-helpers.ts:297-304`)
- 지분율 위젯은 **항상 노출**(`AssetSectionAcquisition.tsx:85-86` 주석 "단독 부분소유·함께양도·지분분할 전부")
- ⇒ **단일 자산 부분소유**(상가 1/2 공유 등)는 차단을 통과하면서 `getOwnershipRatio < 1` → `primaryFractional` → API 전면 스케일

## 7. 케이스 매트릭스 (rev.2)

⚠️ **anchor 기대값을 「전체 ÷ 2」로 쓰면 안 된다** — floor 이중 적용으로 **0.48%에서 1원 이탈**한다(실측).
기대값은 **산식 자체**(`floor(floor(std × r) × rate)`)로 고정한다.

| ID | 자산·모드 | 지분 | 기대 | §4 대응 |
|---|---|---|---|---|
| F1 | 주택 환산 | 50% | 개산공제 = 산식값, swap 판정 불변 | A1 |
| F2 | 주택 감정 | 50% | 동일 | A2 |
| F3 | 주택 매매사례 | 50% | 동일 | A3 |
| F4 | 주택 환산 (swap 경계) | 50% | **§97②2호 판정이 물건 전체와 동일** | A1 (§1.2 가드) |
| F5 | 주택 실거래가 | 50% | **무변경**(개산공제 0) | 기존 `fractional-acquisition-case-27` |
| F6 | 주택 환산 | 100% | **무변경** — 단독소유 회귀 | 전체 |
| F7 | 주택 환산 + 미등기 | 50% | 0.3% 율에도 지분 적용 | A1 |
| F8 | 건물 split | 50% | 파트별 + **잔액 흡수로 항등성 보존** | B1·B2 |
| **F8b** | 주택 split | 50% | **토지분+건물분 = 라목총액×지분×3%** (H10 불변식) | B1·B2 (§6.2) |
| F9 | 주택 PHD §164⑤ | 50% | 3시점 경로 + 잔액 흡수 | C1·C2 |
| **F9b** | 겸용 PHD 4부분 | 50% | 4곳 중 마지막이 잔액 흡수 | C3 |
| F10 | 겸용 상가분 | 50% | 지분 적용 | D1·D2 |
| **F10b** | **겸용 주택분** | 50% | 지분 적용 | D3·D4 |
| F11 | 상가·오피스텔 §164⑥ | 50% | 지분 적용 | E1·E2 |
| F12 | 일반건물 | 50% | 지분 적용 | F1·F2 |
| **F12b** | **일반건물 증축분** | 50% | 3지점 전부 | F3~F5 |
| F13 | 재개발 기여분 | 50% | 토지·주택 각각 | G1·G2 |
| **F13b** | **재개발 인가전** | 50% | 지분 적용 | G3 |
| **F16** | **다필지** | 50% | 필지별 + swap 판정 불변 | I1 |
| F14 | companion 자산 | 50% | primary와 동일 규칙 | 전체 |
| **F17** | 상속·증여 §163⑨ | 50% | **개산공제 미적용 경로 무변경** — `mixed-use-helpers.ts:562-565`가 `usesDeemedAcq`면 `splitDeemedExpense`로 분기 | 회귀 가드 |
| ~~F15~~ | ~~부담부증여~~ | — | **범위 밖**(§4.2) | — |

---

## 8. 14 동기화 지점 (rev.2 — ⑥⑦ 대폭 확장)

**신규 필드 2개** (엔진 설계 §2 정본):

| 필드 | 종류 | 용도 |
|---|---|---|
| `ownershipRatio?: number` | **input** | 개산공제 base 축소 전용. `TransferTaxInput` + **서브엔진 7종** |
| `lumpSumDeductionBase?: number` | **result echo** | 실제 사용된 **지분 기준시가**. §8.1의 표시 지점이 「기준시가 × 3%」 산식을 출력하므로 100% 값을 쓰면 산식이 자기 값을 못 만든다. UI가 재계산하면 dual-truth |

| # | 지점 | 작업 |
|---|---|---|
| ①②③ | 폼·initial·normalize | **없음** — 기존 `ownershipNumerator/Denominator` 재사용 |
| ④⑬ | API 변환 | `transfer-tax-api.ts`(primary) · `transfer-tax-api-helpers.ts:434`(companion) |
| ⑤ | UI 입력 위젯 | **없음**. (선택) `OwnershipRatioInput.tsx:69,73` 안내에 "개산공제 포함 자동 안분" 명시 |
| **⑥** | **사이드바** | ⚠️ rev.1 "없음"은 **오류**. `calc-wizard-store.ts:486,504-506`이 **이미 지분 적용** 중이며 floor 순서가 §6.4 A와 반대(0.49% 불일치) → **A로 통일** |
| **⑦** | **결과 표시 — 9+ 지점** | 아래 표 |
| ⑧ | validation | **없음** |
| ⑨⑩⑪ | Zod enum·fallback | **없음** |
| **⑫** | Zod 입력객체 — **2곳** | `propertyBaseShape` **+ `companionAssetSchema`**(`transfer-tax-schema-sub.ts:456` 별도 z.object, 자체 `standardPriceAtAcquisition` `:466`) |
| **⑭** | Route 매핑 — **2곳** | `app/api/calc/transfer/route.ts` **+ `multi/route.ts:101-124`**(별도 엔진 매핑) |

### 8.1 ⑦ 결과 표시 drift 전수 (rev.2 신설)

개산공제만 축소하면 **표시 산식이 자기모순**이 된다 — "취득시 기준시가 500,000,000 × 3%" 옆에 7,500,000이 찍힌다
(`feedback_engine_result_display_drift` 위반).

| 위치 | 현상 |
|---|---|
| `TransferTaxResultView.tsx:531,537` | split 카드 `취득시 기준시가 {stdPriceAtAcq} × 3%` |
| `DetailedStatementFormulaBuilders.ts:356,360,366` | 일반건물 상세명세서 동일 산식 |
| **`DetailedStatementFormulaBuilders.ts:679-684`** | **Critical — 자기일치 판정**: `baseExp === floor(stdAcq × 0.03)`로 라벨을 정한다. 등식이 깨지면 개산공제가 **"양도비 등 — §97① 나목"으로 오표시**된다. UI가 §163⑥ 산식을 재구현하는 것 자체가 dual-truth → **엔진 echo 기반 분기로 전환** |
| `GeneralBuildingValuationDetailCard.tsx:293-295` | `토지 개산공제 = INT(취득시 토지 기준시가 × 3%)` |
| `CommercialBuildingValuationDetailCard.tsx:165,168` | `개산공제 합계 = INT(… × 3%)`. **부수 발견**: base를 "환산취득가"로 라벨링하나 엔진 base는 **기준시가**(`commercial-building-valuation.ts:277,301`) — 별개 표시 오류 |
| `DetailedStatementRedevelopmentBuilders.ts:202,490,496,649` | 재개발 명세서 |
| **`redevelopment.ts:260,412`** | **엔진 내장 문자열** — `rationale`에 개산공제 값을 삽입. UI가 아니라 **엔진 수정 대상** |

**drift 없음 확인**: `FilingFormTableHelpers.ts:544-556`(엔진 값 passthrough) · `BuildingStdPriceReportSection`(개산공제 미표시).

→ **result echo `lumpSumDeductionBase` 신설**이 필요하다(§8 상단 표). rev.1 §8이 result 타입 변경을
"없음"으로 둔 것은 오류다. 대상 result 타입은 엔진 설계 §2.2 참조.

**⑦ 부가**: 결과 화면에 **지분율 자체가 표시되지 않는다**(`TransferTaxResultView` grep 0건). 신고서에는 있다
(`FilingFormTableHelpers.ts:146-151` `(지분 X%)`). 개산공제가 작은 이유를 사용자가 알 수 없으므로 배지 추가 권고.

---

## 9. Phase 계획 (rev.2)

| Phase | 내용 | verify |
|---|---|---|
| **P0** | pre-Do anchor: F1·F4·F6·**F8b**(항등성) — **현행 실패 확인** | 실패 메시지로 설계 환류 |
| **P1** | 국세청 해석례 `122836` 본문 확인 (§2.3) | 법령 근거 보강 |
| **P2** | `computeEstimatedDeduction` 이동·확장 + `ownershipRatio` input + ⑫(2곳)⑬⑭(2곳) 배관 | F1~F3·F6 green |
| **P2b** | **서브엔진 input 타입 7종 전파**(§6.3) + 호출부 | 경로별 도달 anchor |
| **P3a** | A(비-split) + B(split, 잔액 흡수) — 회귀 위험 최대 | F1~F8b green |
| **P3b** | C(PHD)·D(겸용) | F9~F10b green |
| **P3c** | E·F·G·I(서브엔진·다필지) | F11~F16 green |
| **P4** | ⑥ 사이드바 순서 통일 + ⑦ 표시 9+ 지점 + 엔진 rationale 2곳 | RTL + 표시 정합 |
| **P5** | 전체 회귀 | `npm run check:pre-pr` |

> rev.1의 P3 단일 Phase(15지점)는 리뷰 부담이 과대해 위험도 tier로 3분할했다.
> §9 순서에서 H(부담부증여)는 **명시적 제외**(§4.2).

## 10. 범위 밖

- **부담부증여 × 지분** — 경로 전체가 지분 미인지(§4.2). 여기만 고치면 혼합 스케일 결함 신설. **별건**.
- **주식양도세** — 지분율 개념 부재(§4.2).
- **다필지 금액 필드 raw 누수** — `transfer-tax-api.ts:471-510` parcel 매핑이 전부 raw. P3(PR #843)가 split 파트에서 고친 것과 **동형의 별건**(개산공제와 별개 축).
- **감면 조문 기준시가 요건 판정의 지분 취급** — ⚠️ rev.1은 "감면은 **별도 필드**를 쓰므로 분리된다"고 했으나 **부정확**하다. `unsold-98-8.ts:277`·`unsold-hybrid.ts:255`는 **공용** `standardPriceAtAcquisition`을 쓴다. 다만 용도가 **차분 비율**(`calcSignedAllocation(income, std5Y−stdAcq, stdTransfer−stdAcq)` — `unsold-hybrid.ts:271`)이라 세 값이 같은 스케일이면 **불변** → 결론(100% 유지)은 유효하나 **근거가 다르다**. 가액 요건(§99의4 3억·§97의3 6억) 판정의 지분 취급은 여전히 **미검증 별건**.
- **미등기 분기 누락** — `commercial-building-valuation.ts:302,396` · `redevelopment-*-contribution.ts:116,141`이 3% 고정(§4.4). 헬퍼 교체 시 자연 노출되나 정정은 별건.
- **상속·증여세 개산공제**·**기타소득 개산공제(80%)** — 무관.

---

## 11. 리스크

| 리스크 | 대응 |
|---|---|
| 26지점 교체 중 누락 → 경로별 스케일 불일치 | 완료 조건에 grep 0건 포함. ⚠️ `acquisition-tax-rate.ts:61` `floor(x*0.03)`은 **취득세 세율**이라 오탐 — 제외 |
| **잔액 흡수 누락 시 §163⑥2호가목 항등성 붕괴** | §6.2 — PR #841 H10 anchor가 이미 이 불변식을 고정. F8b로 재고정 |
| 지분 자산 기존 결과가 바뀐다 | 이력은 `resultData` **스냅샷 저장**(`calculation-repository.ts:46`)이라 표시는 안전. 단 **"이력 → 편집 → 재계산" 경로에서 저장값과 다른 세액**이 나온다 → 결과 카드에 지분 배지·산식 명시로 설명 |
| 서브엔진 7종 타입 전파 누락 → 조용히 ratio=1 | P2b를 별도 Phase로 분리 + **경로별 도달 anchor**(primary·companion·multi route·서브엔진 각각) |
| 사례 27 anchor 수치 변동 | 실거래가 모드라 개산공제 0 → 무영향. F5로 고정 |

---

## 12. 사용자 확인 대상

1. **floor 순서 A vs C**(§6.4) — A(지분 먼저, echo 가능, 0.96%에서 1원 불리) vs C(단일 floor, 유리, echo 불가).
   법령이 정하지 않는 영역이라 **정책 선택**이다. 현재 A로 기술.
2. **부담부증여 별건 분리**(§4.2) — 동의 여부.
3. **⑦ 표시 9+ 지점**이 P4 한 Phase에 들어가는데, 분량상 별도 PR이 나을 수 있다.

---

## 13. rev.1 → rev.2 변경 이력 (6-way 자가검토)

| 항목 | rev.1 | rev.2 |
|---|---|---|
| 영향 범위 | 8파일 15지점 | **14파일 28지점**(대상 12파일 26지점) |
| 누락 파일 | — | `multi-parcel-transfer` · `general-building-extension` · `redevelopment-split` · `mixed-use-helpers` |
| 인용 오류 | `general-building-valuation.ts:553` | **`:507,508`**(`:553`은 율 결정 지점) |
| §163⑥3·4호 | "미구현 확정" | **오류** — 4호는 주식에 구현됨 |
| 재결례 | "0건" | **국심1989부0035**(공유지분 1/3 경정) |
| 불리 적용 정책 | 대응 없음 | **§2.4 신설** |
| 잔액 흡수 | 없음 | **필수**(50.8% 항등성 위반 실측) |
| "정확히 절반" | 단정 | **0.48% 이탈**(실측) — anchor는 산식으로 고정 |
| 헬퍼 | 신규 생성 | **기존 `computeEstimatedDeduction` 흡수**(dual-truth 회피) |
| ⑥ 사이드바 | "없음" | **이미 지분 적용 중, 순서 반대** |
| ⑦ 결과 카드 | 1줄 | **9+ 지점 + 엔진 rationale 2곳** |
| ⑫⑭ | 각 1곳 | **각 2곳**(companion Zod · multi route) |
| 서브엔진 배관 | 없음 | **input 타입 7종 전파**(P2b) |
| 신규 필드 | input 1개 | **input 1 + result echo 1**(`lumpSumDeductionBase` — 표시 drift 차단) |
| 부담부증여 | 범위 내(확인 필요) | **범위 밖 확정** |
| Phase | P3 단일(15지점) | **P3a·P3b·P3c 3분할** |

**발견 41건**(중복 제거 33건) · Critical 11건 · High 10건. verdict: rev.1 `blocked` → rev.2 정정 반영 완료.
