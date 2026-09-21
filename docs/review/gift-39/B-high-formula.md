### B. 단건 엔진 — §39①2호 고가발행 산식 (「상증령」§29②3·4·5)

이 영역에 배정된 4건은 **고가발행 산식 본체(§29②3·4·5)의 계산 오류가 아니라, 그 산식을 「상증령」§29②6호가 통째로 재사용하는 전환주식(§39①3호) 경로와 그 주변 안전망·감시망**에 몰려 있다. 실제로 §29②3·4·5의 산식·기준금액·상장 단서는 코드 대조에서 법문과 일치했다(coverage 참조). 남은 결함은 (i) 재사용 경로의 안전망 0건, (ii) 재사용 경로가 산출근거·제외사유를 버리는 것, (iii) 상장 단서의 모집단 정의를 감시하는 키워드 0건, (iv) 호 수준 법령코드 상수 부재다.

중복 병합 결과: 4건 → 4건(병합 0). 12·14는 같은 파일군이지만 축이 다르고(결과 메타 폐기 ↔ 테스트 안전망), 13·87은 같은 기구(manifest 키워드 깊이)지만 대상 조문(§29·법§39 ↔ §28⑤)과 소비 엔진이 달라 분리 유지했다.

---

#### [Medium] B-1. 전환주식(§39①3호) anchor 6건이 「저가 × 실권주 재배정」 한 조합만 덮는다 — 나목(고가)·기준금액 게이트·발행시점 배정방법이 한 건도 고정돼 있지 않다

- **위치**: `__tests__/tax-engine/gift-deemed/convertible-stock-anchor.test.ts:5`
  (동일 축 모집단: `__tests__/tax-engine/gift-deemed/listed-per-share-bound.anchor.test.ts:166,183` · `__tests__/tax-engine/gift-deemed/capital-increase-public-offering.anchor.test.ts:115,120`)
- **분류·방향**: test-safety-net · 미확정(안전망 축 — 회귀 발생 시 부호는 회귀 내용에 종속)
- **법적 근거**:
  - 「상증법」§39①3호 나목 — "전환주식을 시가보다 높은 가액으로 발행한 경우: 교부받았거나 교부받을 주식의 가액이 전환주식 발행 당시 전환주식의 가액보다 낮아짐으로써 그 주식을 교부받은 자의 **특수관계인**이 얻은 이익"
  - 「상증령」§29②6호 가목·나목 — "가. 전환주식을 다른 종류의 주식으로 전환함에 따라 교부받은 주식을 신주로 보아 **제1호부터 제5호까지**의 규정에 따라 계산한 이익 / 나. 전환주식 발행 당시 **제1호부터 제5호까지**의 규정에 따라 계산한 이익"
  - ⇒ 두 레그가 **각각 §29②1~5의 완전한 계산**이므로, §29②4호의 기준금액 게이트("그 금액이 3억원 이상인 경우 또는 제3호 가목의 가액에서 제3호 나목의 가액을 차감한 금액이 제3호 나목의 가액의 100분의 30 이상인 경우에 한한다")와 §29②3호 나목 단서(주권상장법인등 Max)가 **시점별로 따로** 걸린다.
- **코드 증거**: 전 저장소의 전환주식 계산 호출 6건이 모두 `atIssuance`에 `direction`·`subType`·`allocationMethod` 키 자체가 없다.

```ts
// __tests__/tax-engine/gift-deemed/convertible-stock-anchor.test.ts:17-23
atIssuance: {
  preIssuePrice: 10_000,
  preIssueShares: 100_000,
  newSharePrice: 7_000,
  issuedShares: 50_000,
  forfeitedShares: 10_000,
},   // ← direction·subType·allocationMethod·isListed 부재
```

반면 도달 경로는 **UI까지 시점별로 열려 있다**:

```ts
// lib/calc/gift-deemed-api.ts:407-408 — 두 레그가 각각 별도 allocationMethod·isListed를 받는다
atConversion: side({ … isListed: form.csConvIsListed, allocationMethod: form.csConvAllocationMethod }),
atIssuance:  side({ … isListed: form.csIssueIsListed, allocationMethod: form.csIssueAllocationMethod }),
```

- **실패 시나리오** (실증 렌즈 뮤테이션 에뮬레이션 — 프로덕션 무수정, 로컬 래퍼로 재현):
  - anchor 6건 기준선 재현: `[["CS-1",13330000],["CS-2",0],["D-12",0],["D-13",200000000],["PO-5a",240000000],["PO-5b",0]]` — 저장소 기대값과 완전 일치.
  - **축 (i) 발행시점 공모 배정**: `D-13`의 `atIssuance`에 `allocationMethod:"public_offering"`(+상장)을 얹으면 발행 레그가 「상증법」§39① 괄호로 0이 되어 결과가 **200,000,000 → 500,000,000**(+300,000,000)으로 바뀐다. 기존 6건 중 **0건**이 죽는다.
  - **축 (ii) 기준금액 게이트**: `CS-1`의 두 레그를 `subType:"no_realloc"`(§29②2호·4호 게이트)로 바꾸면 발행 레그가 게이트 미달로 0이 되어 **13,330,000 → 33,330,000**(+20,000,000). 역시 **0건** 사망.
  - **축 (iii) 고가(§39①3호 나목)**: `direction:"high"` 경로의 경유값 **250,000,000**이 어느 anchor에도 고정돼 있지 않다.
  - 대조군 M7(`atConversion.allocationMethod` 누락)·M8(`atConversion.listedMarketAvg` 누락)은 각각 1건을 죽여 **하네스 자체는 구별력이 있음**을 확인했다(vacuous 아님).
- **검증** (3렌즈 전건 「반증 실패·심각도 유지」):
  - **법령 렌즈**: 「상증법」MST 276123 §39①3호나목·「상증령」MST 288887 §29②6호를 재조회해 글자 단위 일치 확인. 위임 체인(법 §39①3호 → §29②6 → §29②1~5)에 건너뛴 단계 없음. **정정**: 제목의 "발행 시점 배정방법이 한 건도 고정돼 있지 않다"는 **`atIssuance` 레그로 한정**해야 한다 — `atConversion` 레그는 두 축 모두 고정돼 있다(`capital-increase-public-offering.anchor.test.ts:115-121` PO-5가 전환 시점 공모 240,000,000 → 0을 고정).
  - **코드 렌즈**: 핵심 주장 성립. **정정**: "6건이 전부 direction·subType·isListed 미지정"은 부정확하다 — 6건 중 4건은 헬퍼 `low()`/`ciLow()`가 `direction:"low"`를 명시하고 `low()`는 `subType:"forfeited_realloc"`·`isListed:true`까지 명시한다(`capital-increase-public-offering.anchor.test.ts:43-55`). 정확한 주장은 「**미지정**이 아니라 **한 조합에만 고정**」이다.
  - **실증 렌즈**: 위 수치로 확증. 세 축은 대수적으로 상쇄되지 않고 실제로 금액을 바꾼다.
- **수정 방향**: `convertible-stock-anchor.test.ts`에 최소 4건 추가 — (1) `direction:"high"`(§39①3호 나목) 기본 케이스(경유값 250,000,000 고정), (2) `atIssuance`만 `allocationMethod:"public_offering"`+`isListed:true`(기대 500,000,000), (3) `subType:"no_realloc"` 발행 시점 게이트 미달(기대 33,330,000), (4) §29②4호 3억 경계 ±1주. 결론이 어느 쪽이든 기대값을 **명시**로 고정해야 다음 변경에서 조용히 뒤집히지 않는다.

---

#### [Medium] B-2. 전환주식 결과가 두 시점의 §29②1~5 산출근거·제외사유·direction을 전량 폐기한다 — 0이 된 «법적 근거»가 화면에서 다른 조항으로 바뀐다

- **위치**: `lib/tax-engine/gift-deemed/convertible-stock.ts:18`(breakdown 재작성) · `:28`(exclusionReason) · `:30`(thresholdEcho)
- **분류·방향**: ui(계산 메타 폐기) · **중립**(세액 불변 — 표시 축)
- **법적 근거**:
  - 「상증령」§29②6호 가목·나목 — 두 목 모두 "**제1호부터 제5호까지의 규정에 따라 계산한 이익**"이므로 §29②1~5의 산출 과정(증자 후 1주당 가액, 신주 1주당 인수가액, 1주당 이익, 귀속 주식수)이 곧 이 조문의 산출근거다.
  - 「상증령」§29②1호 가목 단서 / §29②3호 나목 단서 — "다만, **주권상장법인등**의 경우로서 증자후의 1주당 평가가액이 다음 산식에 의하여 계산한 1주당 가액보다 **적은**(고가는 「**큰**」) 경우에는 당해 가액"
  - 「상증법」§39①1호 가목 괄호 — "배정(「자본시장과 금융투자업에 관한 법률」에 따른 주권상장법인이 같은 법 제9조제7항에 따른 유가증권의 모집방법(대통령령으로 정하는 경우를 제외한다)으로 배정하는 경우는 제외한다. **이하 이 항에서 같다**)"
  - 「상증법」§39①3호 가목·나목 — 수증자가 각각 "그 주식을 교부받은 자"(가목)와 "그 주식을 교부받은 자의 **특수관계인**"(나목)으로 **다르다**.
- **코드 증거**:

```ts
// lib/tax-engine/gift-deemed/convertible-stock.ts:12-31
const conversion = calcCapitalIncreaseGift(input.atConversion);
const issuance  = calcCapitalIncreaseGift(input.atIssuance);   // ← 숫자 하나씩만 취한다
…
const breakdown: CalculationStep[] = [
  { label: "전환 후 교부주식 기준 이익 (§29②1~5)", amount: conversion.deemedGiftValue, lawRef: GIFT.CAPITAL_INCREASE },
  { label: "전환주식 발행 당시 이익 (§29②1~5)",   amount: issuance.deemedGiftValue },
  { label: "증여재산가액 (전환후 − 발행당시, 영 이하면 0)", amount: value, …, note: "§39①3호 전환주식" },
];
return { …
  exclusionReason: applied ? undefined : "전환후 이익이 발행당시 이익 이하 — 추가 이익 없음",  // :28 내부 사유를 보지 않는다
  thresholdEcho: { gain: value },                                                              // :30
};
```

내부 `calcCapitalIncreaseGift`는 **정확히 그 반대로 설계돼 있다** — 형제 경로는 「왜 0인지」를 의도적으로 보존한다:

```ts
// lib/tax-engine/gift-deemed/capital-increase.ts:39-50
/** §39① 적용 제외 결과 — 산식 행은 남겨 「왜 0인지」가 보이게 한다 */
function publicOfferingExcludedResult(breakdown: CalculationStep[]): DeemedGiftResult {
  return { …, breakdown,
    exclusionReason: `주권상장법인의 유가증권 모집방법 배정 — §39① 적용 제외 (${GIFT.CI_PUBLIC_OFFERING_EXCLUSION})`, … };
}
```

그리고 그 문자열은 실제로 화면에 렌더된다:

```tsx
// components/calc/results/DeemedGiftResultView.tsx:608-613
{!result.applied && result.exclusionReason && (
  <div … data-testid="deemed-exclusion">증여세 미적용: {result.exclusionReason}
```

- **실패 시나리오** (실증 렌즈 probe 7케이스, 실행 후 삭제):
  - 두 시점 모두 `isListed:true` + `allocationMethod:"public_offering"` ⇒ 결과 `deemedGiftValue 0`, 화면 문구 「증여세 미적용: **전환후 이익이 발행당시 이익 이하 — 추가 이익 없음**」.
    실제로 작동한 근거는 「상증법」§39① 괄호(공모 배정 적용제외)이며, 내부 두 결과는 그 근거를 담은 `exclusionReason`을 **이미 들고 있었는데** 버려졌다. 반사실(제외가 없었을 때) 내부 이익은 각각 **500,000,000 · 300,000,000**이다.
  - breakdown 3행이 모두 `0`이 되어 「왜 0인가」의 단서가 화면에 하나도 남지 않는다(형제 경로는 산식 행을 남긴다).
  - 상장 단서(§29②1가 단서) 적용 시 내부가 내놓는 2행(「증자 후 1주당 가액(산식 이론값)=15,000」/「증자 후 1주당 가액=12,000 (주권상장법인 평가액 적용)」)과 §29③ 간주모집 note도 전환주식 결과에는 없다.
  - `direction`을 low↔high로 바꿔도 결과 label·note가 **바이트 단위로 동일**해 §39①3호 가목/나목이 구분되지 않는다.
  - 세액 영향 **0원**(중립) — 폐기되는 것은 표시용 메타이지 산식 입력이 아니다.
- **검증**:
  - **코드 렌즈(반증 실패·medium 유지)**: 인용 file:line 전건 일치, 도달 경로(UI→④→Zod→엔진→결과뷰) 전 구간 개방, 반대 동작을 고정한 anchor 없음. 계획서가 오히려 「산출근거·제외사유를 결과에 남긴다」를 설계 목표로 적고 있어 의도된 설계로 볼 근거가 없다.
  - **법령 렌즈(반증 실패·medium 유지)** — ⚠️ **기구 정정**: 원 주장의 "화면 설명이 **사실과 반대**"는 과장이다. 공모 적용제외가 걸리면 §29②6호 가·나목의 **법령상 계산 가액이 둘 다 0**이므로 「0 ≤ 0」이 성립해 후단("그 금액이 영 이하인 경우에는 이익이 없는 것으로 본다")의 문언 자체는 반증되지 않는다. 500,000,000·300,000,000은 **반사실 값**이다. ⇒ 정정된 주장은 「산술적 거짓」이 아니라 **「0을 만든 법적 근거의 오기 — §39① 괄호(적용제외)가 §29②6호 후단(차감 결과 영 이하)으로 바뀌어 표시된다」**.
  - **실증 렌즈(반증 실패·severity **low** 제안)**: 메타 폐기 자체는 수치로 재현됐으나 세액 불변이므로 low로 강등 제안. ⇒ **본 리포트는 medium을 유지**한다. 사유: 강등 근거는 「세액 불변」인데, 남는 축은 세액이 아니라 **화면이 지목하는 근거 조항이 틀린다**는 것이고 그 문구는 `DeemedGiftResultView.tsx:613`에서 그대로 사용자에게 출력된다(저장소 정책 `feedback_computation_meta_discarded`에 정면으로 걸린다).
- **수정 방향**: 엔진 산식은 건드리지 않는다.
  1. 내부 두 result의 breakdown을 「[전환] …」·「[발행] …」 접두를 붙여 승계·연결한다(현 3행은 요약 행으로 유지).
  2. 내부 `exclusionReason`이 있으면 그것을 **우선** 결과 `exclusionReason`으로 올린다(두 시점 모두 있으면 시점 접두와 함께 병기).
  3. 결과 note에 `direction`(§39①3호 가목/나목)과 `subType`을 명시한다.
  4. `thresholdEcho`에 두 시점 원금액(`conversionGain`·`issuanceGain`)을 echo 필드로 싣는다(`echo-field-pattern`).

---

#### [Medium] B-3. 「주권상장법인등」 정의(「상증령」§28⑤)를 감시하는 키워드가 저장소 manifest 전체에 0건 — §29②3호 나목 단서(고가 Max)의 «모집단 정의»가 개정돼도 `verify:legal`은 초록이다

- **위치**: `lib/legal-verification/manifest/additions-inheritance-decree.ts:63`(`INH_DECREE.MERGER_GAIN`의 keywords)
- **분류·방향**: test-safety-net · **미확정**(세액 영향 부호는 개정 내용에 종속)
- **법적 근거**: 「상증령」§28⑤ — "…합병 후 신설 또는 존속하는 법인이 「자본시장과 금융투자업에 관한 법률」에 따른 **주권상장법인으로서 그 주권이 같은 법에 따른 증권시장에서 거래되는 법인(이하 "주권상장법인등"이라 한다)**인 경우에는 다음 각 호의 가액 중 **적은 가액**으로 하며, 그외의 법인인 경우에는 제2호의 가액으로 한다"
  — 이 정의는 **조 한정 없이** 선언되어 시행령 전체에 미치며, 본 영역의 「상증령」§29②3호 나목 단서("다만, **주권상장법인등**의 경우로서 증자후의 1주당 평가가액이 다음 산식에 의하여 계산한 1주당 가액보다 **큰** 경우에는 당해 가액")가 그 정의에 의존한다.
- **코드 증거**:

```ts
// lib/legal-verification/manifest/additions-inheritance-decree.ts:60-70
{
  id: "INH_DECREE.MERGER_GAIN",
  citation: "상증령 §28",
  keywords: ["합병에 따른 이익의 계산방법", "합병등기일", "대주주등", "액면가액이 3억원 이상"],
  keywordMode: "ALL",
},
```

네 키워드는 **전부 §28①②③에만** 걸리고 §28⑤ 문언을 하나도 포함하지 않는다. 전역 grep에서 `lib/legal-verification/` 전체의 「주권상장법인」 히트 3건은 **모두 다른 용어**다(`additions-inheritance.ts:327` 「주권상장법인과 합병되어」=「상증법」§41의5 / `additions-transfer-decree.ts:188·223` 「주권상장법인대주주」=「소득세법 시행령」). ⇒ 정의 용어 자체의 감시 키워드는 **0건**.

정의를 소비하는 엔진(고가 Max 단서 포함):

```ts
// lib/tax-engine/gift-deemed/capital-helpers.ts:37-45
export function applyListedPerShareBound(theoretical, opts, pick: "min" | "max"): number {
  const avg = opts.listedMarketAvg ?? 0;
  if (!opts.isListed || avg <= 0) return theoretical;
  return pick === "min" ? Math.min(avg, theoretical) : Math.max(avg, theoretical);
}
// 호출: capital-increase.ts:114 (고가 §29②3나 단서 — "max") · :63 (저가 §29②1가 단서 — "min")
```

- **실패 시나리오** (실증 렌즈 뮤테이션 probe — 법제처 클라이언트 mock + 실제 `verifyRule()` 실행):

| 가정 개정(§28 본문에 격리 적용) | 현행 키워드 4개 생존 | verifier 판정 |
|---|---|---|
| §28⑤ 정의에서 「그 주권이 같은 법에 따른 증권시장에서 거래되는」 요건 삭제(정의 **확대**) | 4/4 | 🔴 PASS(감시 0) |
| §28⑤ 정의 용어를 「상장법인등」으로 개칭(§29·§30 준용 연쇄 단절) | 4/4 | 🔴 PASS(감시 0) |
| §28⑤ **항 전체 삭제**(M3) | 4/4 | 🔴 PASS(감시 0) |

  세액 경로(**미실증** — 부호는 개정 내용 종속): 정의가 확대되어 예컨대 거래정지 상장법인이 「주권상장법인등」에 새로 포함되면, 그 법인의 **고가발행**에서 §29②3호 나목 단서(Max)가 적용되어 증자 후 1주당 가액이 종가평균으로 **올라가고** 1주당 차액(인수가 − 증자후가)이 줄어 증여재산가액이 감소한다(저가 증자는 반대 방향). 현행 앱은 `components/calc/deemed-gift/capital-forms.tsx:280`의 사용자 토글 「주권상장법인등 (증자 후 1주당 가액 단서 §29②1가·3나)」로 모집단을 입력받으므로 **엔진 산식은 깨지지 않지만**, 사용자에게 제시되는 판정 기준·법령 링크가 낡은 채로 남고 그 낡음을 알려줄 게이트가 하나도 없다.
- **검증** (3렌즈 전건 「반증 실패·medium 유지」 — 셋 다 **범위를 넓히는** 방향으로 정정):
  - **법령 렌즈**: 의존 조문이 셋이 아니라 **넷**이다 — §28 **자신**이 네 번째 소비자다(§28⑤2호 후단 「…빠른 날(**주권상장법인등**에 해당하지 아니하는 법인인 경우에는…)」 · §28⑥ 단서 「다만, **주권상장법인등**의 경우…」).
  - **코드 렌즈**: 공유 엔진도 셋이 아니라 **넷**이다 — `applyListedPerShareBound` 3경로(§39 `capital-increase.ts:63·114` / §39의3 `contribution-in-kind.ts:72·174` / §40 `convertible-bond.ts:87`)에 더해 **합병(§38) 엔진이 §28⑤을 직접 구현**한다(`merger-valuation.ts:1,36-42`).
  - **실증 렌즈**: 갭의 범위가 「정의 문구」보다 넓다 — §28⑤은 단순 정의가 아니라 **합병 후 1주당 평가가액 결정 규칙**(Min 분기·단순평균 산식)이고, 그 제2호는 `capital-helpers.ts:79-95 computeMergerSimpleAvg`로 구현돼 `legal-codes/inheritance-gift.ts:150`이 `MERGER_VALUATION: "상증령 §28⑤⑥"`으로 직접 인용하는데, **항 전체를 지워도 PASS**다.
  - ⚠️ 프레이밍 1건 정정: 「§28⑤이 `verify:legal` **모수 밖**」이 아니다. 커버리지는 **조 단위**로 계산되고(`lib/legal-verification/coverage.ts:8-10` "비교 단위는 \"법령명 + 조 번호\"이며 항·호·목 차이는 무시한다") 「상증령 §28」은 manifest에 등재돼 있으므로 **모수 안이되 키워드 깊이가 0**이다. 커버리지 게이트(`legal-verification-coverage-complete.test.ts`)는 구조상 이것을 탐지할 수 없다.
- **수정 방향**: `INH_DECREE.MERGER_GAIN`의 keywords에 §28⑤ 정의·규범 문언을 추가한다(본문 실재 확인 완료).

```ts
keywords: [
  "합병에 따른 이익의 계산방법", "합병등기일",
  "발행주식총수등의 100분의 1 이상을 소유하고 있거나 소유하고 있는 주식등의 액면가액이 3억원 이상인 주주등", // §28② — 기존 2개 대체(100분의 1 축까지 감시)
  "주권상장법인으로서 그 주권이 같은 법에 따른 증권시장에서 거래되는 법인(이하 \"주권상장법인등\"이라 한다)",   // §28⑤ 정의
],
```

  덧붙여 **§28 한 곳만 감시하면 §29 쪽 준용이 끊겨도 조용하다**. `INH_DECREE.CAPITAL_INCREASE_GAIN`(같은 파일 `:71-76`)에 §29②3호 나목 단서 전문("다만, 주권상장법인등의 경우로서 증자후의 1주당 평가가액이 다음 산식에 의하여 계산한 1주당 가액보다 큰 경우에는 당해 가액")을, `INH_DECREE.CONVERTIBLE_BOND_GAIN`(`:77-86`)에 「상증령」§30⑤1호의 「주권상장법인등의 주식으로 전환등을 한 경우」를 각각 추가해 **독립 감시**를 건다.

---

#### [Info] B-4. §39①3호·§29②6호·§29①2호를 가리키는 호 수준 법령코드 상수가 없고, 「상증령」§29 manifest 키워드가 그 두 호를 덮지 않는다 — ⚠️ 원 주장의 절반은 코드 렌즈에서 **반증**됐다

- **위치**: `lib/tax-engine/legal-codes/inheritance-gift.ts:153` · `lib/legal-verification/manifest/additions-inheritance-decree.ts:74`
- **분류·방향**: doc-drift · 중립
- **법적 근거**:
  - 「상증령」§29①2호 — "법 제39조제1항제3호에 해당하는 경우: **전환주식을 다른 종류의 주식으로 전환한 날**"
  - 「상증령」§29②6호 — "법 제39조제1항제3호에 따른 이익: 가목에 따른 가액에서 나목에 따른 가액을 차감한 금액. 이 경우 그 금액이 영 이하인 경우에는 이익이 없는 것으로 본다."
- **코드 증거**:

```ts
// lib/tax-engine/legal-codes/inheritance-gift.ts:153 — 조 수준 상수만 있다
CAPITAL_INCREASE: "상증법 §39",
// grep -rn "전환주식\|CONVERTIBLE_STOCK" lib/tax-engine/legal-codes/ → 0건
// 대조: 같은 파일 :155-158은 §39① 괄호·§29③을 괄호 수준까지 상수화해 두었다
//   CI_PUBLIC_OFFERING_EXCLUSION: "상증법 §39① 괄호 · 자본시장법 §9⑦"
//   CI_DEEMED_PUBLIC_OFFERING:    "상증령 §29③ · 자본시장법 시행령 §11③"

// lib/legal-verification/manifest/additions-inheritance-decree.ts:71-76
{ id: "INH_DECREE.CAPITAL_INCREASE_GAIN", citation: "상증령 §29",
  keywords: ["증자에 따른 이익의 계산방법", "권리락", "주식대금 납입일", "실권주"], keywordMode: "ALL" },
```

- **실패 시나리오** (실증 렌즈 — 법제처 클라이언트 mock + 실제 `verifyRule()` 실행, probe 5케이스 전부 실행 확인):
  - 「상증령」§29 본문에서 **§29①2호 1줄 + §29②6호(본문·가목·나목) 3줄을 통째로 삭제**(255자, 「전환주식」 3건→0건)해도 `status: "PASS"`, `failedKeywords: undefined`.
  - 대조군: §29①1호의 「권리락」만 삭제 → `status: "FAIL", failedKeywords: ["권리락"]` ⇒ 하네스 구별력 확인(vacuous 아님).
  - 같은 맹점이 법 쪽 `INH.GIFT_DEEMED_CAPITAL_INCREASE`(`additions-inheritance.ts:283-287`)에도 있어 「상증법」§39①3호 가·나목 전부 삭제도 PASS.
  - 세액 영향 **없음**(감지 안전망 축) — **미실증**.
- **검증**:
  - **법령 렌즈(반증 실패·low 유지)**: §29①2호·§29②6호 인용을 MST 288887로 글자 단위 재대조 — 완전 일치. 위임 체인에 시행규칙 재위임 없음.
  - **코드 렌즈: refuted = true (→ info)**. 원 주장의 결함 논거 4개 중 2개가 **사실이 아니다**:
    - ❌ "호 정보는 `convertible-stock.ts:21`의 note 리터럴에만 있다" — `components/calc/deemed-gift/shared.tsx:72`가 `law: "상증법 §39①3호"`, 같은 파일 `:103`이 description `"상증법 §39①3호 — 전환 시점 − 발행 시점 이익"`을 두고 있고, 타입 주석(`gift-deemed-input-types.ts:194·247`)에도 §29①2호·§29②6호가 명시돼 있다.
    - ❌ "사용자는 §39 전체만 보고 3호를 특정할 수 없다" — 위 두 문자열이 유형 라벨·설명 단계에서 이미 사용자에게 노출된다.
    - ✅ 남는 사실 2개(legal-codes에 호 수준 상수 0건 / §29 manifest 키워드가 두 호를 안 덮음)는 결함이라기보다 **저장소가 명시적으로 문서화한 조 단위 검증 설계의 결과**다(`coverage.ts:8-10`). 「조용히 빠지는 조문」(조 단위 **미등록**) 해저드와는 층위가 다르며, 상증령 §28·§30·§31의2 등 인접 엔트리도 모두 동일하다.
  - **실증 렌즈**: 맹점 자체는 확증하되 **severity info** — §29 고유 결함이 아니라 manifest 327개 엔트리 전체의 설계.
- **수정 방향**(개선 제안 수준, 결함 수정 아님): `GIFT.CONVERTIBLE_STOCK = "상증법 §39①3호"` · `GIFT.CONVERTIBLE_STOCK_CALC = "상증령 §29②6호"` · `GIFT.CONVERTIBLE_STOCK_TIMING = "상증령 §29①2호"`를 신설해 `convertible-stock.ts`의 `legalBasis`·`lawRef`·note에 사용하면(B-2의 note 정비와 같은 커밋에서 처리 가능) `LawArticleModal`이 여는 단위가 호 수준이 된다. manifest에는 verbatim 키워드 「전환주식을 다른 종류의 주식으로 전환한 날」·「전환주식 발행 당시」를 추가한다(KoreanLaw MST 288887 본문 확인 완료). 다만 **조 단위 커버리지 설계를 호 단위로 바꾸는 것은 별개의 전역 결정**이므로 이 영역에서 단독 처리하지 않는다.

---

##### 이 영역에서 «결함 없음»으로 확인된 축 (역방향 기록)

§39①2호 고가발행 산식 본체는 법문과 대조해 일치한다. 이후 변경 시 아래가 뒤집히지 않았는지 확인할 것.

- **§29②4호 30% 기준선의 «분모»** — 법문은 "제3호 가목의 가액에서 제3호 나목의 가액을 차감한 금액이 **제3호 나목의 가액**의 100분의 30 이상"이고, 3호 나목 = 증자 후 1주당 가액이다. 코드 `capital-increase.ts:133` `perShareGain >= safeMultiplyThenDivide(perShareAfter, 30, 100)` — `perShareAfter`가 곧 3호 나목이므로 **일치**(인수가를 분모로 잡는 흔한 오류가 없다).
- **§29②3호(가목)에 기준금액 없음 / §29②5호(다·라목)에 기준금액 없음 / §29②4호(나목)에만 3억·30% 게이트** — 코드 `:121-125`, `:136-139`, `:131-135`가 법문 배치와 **정확히 대응**.
- **§39① 괄호 공모 제외가 2호(고가)에도 미침** — "이하 이 항에서 같다"의 독법을 `:154-155` 주석이 명시하고 `publicOfferingExcluded`(`:28-29`)가 「주권상장법인이」를 **AND 조건**으로 처리한다(비상장 공모는 제외되지 않음 — 이 검사를 빠뜨리면 과소과세).
