# 겸용주택 — 영 §154① 거주요건 + 법 §104⑦ 다주택 중과 — v1.5

> 선행 계획서 [`transfer-104-5-proviso-mixed-use-rate-gaps.plan.md`](./transfer-104-5-proviso-mixed-use-rate-gaps.plan.md) v1.7의
> **잔여 2건**(P3c = D-9 거주요건 · P5 = D-4 다주택 중과)을 분리·재설계한 문서.
>
> | | 선행 계획서 | 이 문서 |
> |---|---|---|
> | 결함 ID | D-9(잔여)·D-4 | **E-1**(거주요건) · **E-2**(중과) · **E-3**(P3a 단서 면제 누락 — v1.2 신규) |
> | Phase | P3c·P5 | **A**(거주요건) → **B**(중과) |
>
> **작성 원칙**: 모든 인용 file:line은 실제 파일 대조, 모든 수치는 throwaway probe 실행 실측.
> 미확인은 "🔶 미확인"으로 명시하고 단정하지 않는다(CLAUDE.md 검증 기준).

---

## 0. 이 문서를 별도로 쓰는 이유

선행 계획서는 두 결함을 모두 **「신규 입력 배관 필요 → 14 동기화 지점 전부」**로 적었다.
그 전제가 **실측 결과 틀렸다**(§1). 규모 판정이 뒤집히면 Phase 분해·리스크·anchor가 전부
달라지므로 선행 문서에 이어 쓰지 않고 새로 쓴다.

두 결함을 **한 문서로 묶는** 이유는 세 가지다.

1. **동일 배관 지점** — 둘 다 「route.ts 겸용 분기(:571~608)에 top-level 값을 주입」이라는
   똑같은 한 곳을 건드린다. 따로 하면 같은 자리를 두 번 연다.
2. **A → B 의존** — 중과 판정 정본 `determineMultiHouseSurcharge`는
   `sellingHouseMeetsOneHouseRequirements`(§154① 보유·**거주** 충족 여부)를 입력으로 받는다
   (`lib/tax-engine/transfer-tax.ts:200-206`). A가 거주요건을 넣어야 B가 그 값을 채울 수 있다.
3. **동일 재사용 축** — 둘 다 「정본이 이미 구현한 규칙을 겸용만 안 쓴다」
   (memory `feedback_sibling_path_already_implements_rule`).

---

## 1. 🔴 선행 계획서 D-4 전제 정정 — 「14지점 전부」는 틀렸다

### 1.1 선행 계획서의 서술

> D-4 — 겸용주택 다주택 중과(§104⑦) 미적용
> `MixedUseAssetInput`에 `householdHousingCount`·조정대상지역 필드가 **없다**(grep 전수).
> 따라서 세율 결손을 넘어 **입력 배관 자체가 없다** — 14 동기화 지점 전부가 필요하다.
> — 선행 계획서 v1.7 §D-4 (L339-344)

D-9 잔여(거주요건)에도 같은 서술이 있다: 「`wasRegulatedAtAcquisition` 신설이 필요해
14지점 전부가 걸린다」(선행 v1.7 L226-228).

### 1.2 오류의 원인

`MixedUseAssetInput`(엔진 서브입력 타입)만 grep하고 **폼·Zod·route의 top-level을 보지 않았다**.
겸용주택은 별도 `assetKind`가 아니다 — `assetKind === "housing"` **+** `isMixedUseHouse === true`다
(`lib/stores/calc-wizard-asset.ts:65` 유니온에 mixed-use 없음 ·
`lib/stores/calc-wizard-store.ts:515·544` 판별식). 따라서 주택용 top-level 입력이 그대로 살아 있다.

### 1.3 실측 — 겸용 폼의 실제 request body

`callTransferTaxAPI`에 겸용 폼을 넣고 `fetch`를 가로채 전송 body를 덤프했다
(throwaway probe, 확인 후 삭제):

```
propertyType:              mixed-use-house
wasRegulatedAtAcquisition: true
householdHousingCount:     2
residencePeriodMonths:     0
isRegulatedArea:           true
isOneHousehold:            true
houses:                    [{id:"selling",…}, {id:"h2",…}]   ← 2건 전송됨
mixedUse keys:             isMixedUseHouse, residentialFloorArea, …, isOneHouseExempt,
                           transferCause, acquisitionByInheritance, …
                           ↑ 위 top-level 6종은 **여기 없다**
```

### 1.4 배관 현황 — 지점별 실측

| 지점 | 상태 | 근거 |
|---|---|---|
| ① 폼 상태 | ✅ 존재 | `TransferFormData` top-level |
| ⑤ UI 위젯 | ✅ **겸용에서 렌더된다** | `Step4.tsx:354` 게이트는 `primaryKind === "housing"` — 겸용은 `assetKind==="housing"`이라 통과. 파일 전체에 `isMixedUseHouse` 게이트 **0건** |
| ④ API 변환 | ✅ 전송 | `transfer-tax-api.ts:347`(주택수)·`352`(거주개월)·`354`(취득시 조정)·`407`(1세대)·`435`(houses)·`443-462`(§154① 단서) |
| ④ houses 게이트 | ✅ 통과 | `transfer-tax-api-houses.ts:27` = `isHousingLike(primary.assetKind)` → `"housing"` 통과 (`transfer-tax-api-helpers.ts:268`) |
| ⑨⑫ Zod | ✅ 정의됨 | `transfer-tax-schema.ts:156`·`160`·`162`·`168`·`182` |
| ⑭ route → engineInput | ✅ 매핑됨 | `route.ts:132`·`136`·`138`·`162`·`205` |
| **⑭ route → `mixedAsset`** | ❌ **결손** | `route.ts:582-597`이 `...data.mixedUse` 스프레드 + top-level **2개만** 명시 주입(`:586` ownershipRatio · `:587` isUnregistered) |
| 엔진 소비 | ❌ 결손 | `MixedUseAssetInput`에 필드 없음 |

### 1.5 정정된 규모

**필요한 것은 ⑭ 1지점 + 엔진 소비뿐이다.** ①④⑤⑧⑨⑫는 손댈 필요가 없다.

이는 선행 계획서 P4(D-3 미등기)가 이미 밟은 경로와 **동일하다** — `isUnregistered`도 top-level
필드였고 `route.ts:587` 한 줄 주입 + 엔진 소비로 끝났다. 그 선례가 이 결함의 해법을 이미 증명한다.

> ⚠️ 이 정정은 선행 계획서 §D-4·§D-9-R의 「14지점」 서술을 **폐기**한다.
> 선행 문서에도 역참조 각주를 남긴다(§7 Phase 0).

---

## 2. 검증된 법령

법제처 Open API 실측 · 2026-07-31 조회 · 「소득세법」 MST 280405 · 공포 2025-12-23 · **시행 2026-07-01**.

### 2.1 법 §104⑦ — 다주택 중과세율 (E-2 근거)

> ⑦ 다음 각 호의 어느 하나에 해당하는 **주택(이에 딸린 토지를 포함한다.** 이하 이 항에서 같다**)**을
> 양도하는 경우 제55조제1항에 따른 세율에 100분의 20(제3호 및 제4호의 경우 100분의 30)을 더한
> 세율을 적용한다. **이 경우 해당 주택 보유기간이 2년 미만인 경우에는** 제55조제1항에 따른 세율에
> 100분의 20(제3호 및 제4호의 경우 100분의 30)을 더한 세율을 적용하여 계산한 양도소득 산출세액과
> **제1항제2호 또는 제3호의 세율을 적용하여 계산한 양도소득 산출세액 중 큰 세액**을 양도소득
> 산출세액으로 한다.
> 1. 조정대상지역에 있는 주택으로서 대통령령으로 정하는 **1세대 2주택**에 해당하는 주택
> 2. 조정대상지역에 있는 주택으로서 1세대가 1주택과 조합원입주권 또는 분양권을 1개 보유한 경우의 해당 주택 …
> 3. 조정대상지역에 있는 주택으로서 대통령령으로 정하는 **1세대 3주택 이상**에 해당하는 주택
> 4. 조정대상지역에 있는 주택으로서 1세대가 주택과 조합원입주권 또는 분양권을 보유한 경우로서 그 수의 합이 3 이상인 경우 해당 주택 …

**세 가지가 설계를 결정한다.**

1. **대상은 「주택(+딸린 토지)」** — 겸용주택의 **상가건물·상가부수토지는 대상이 아니다**.
2. **후단이 MAX 구조** — 보유 2년 미만이면 `MAX(누진+가산, §104①2·3호 단기)`.
   선행 P3b가 넣은 단기세율과 **경합**한다.
3. 가산율은 2호 **+20%p**, 3호·4호 **+30%p**.

### 2.2 법 §95② — 중과 대상 주택은 장기보유특별공제 **배제**

> ② 제1항에서 "장기보유 특별공제액"이란 제94조제1항제1호에 따른 자산
> **(제104조제3항에 따른 미등기양도자산과 같은 조 제7항 각 호에 따른 자산은 제외한다)**으로서
> 보유기간이 3년 이상인 것 … 다만, 대통령령으로 정하는 **1세대 1주택**(이에 딸린 토지를 포함한다)에
> 해당하는 자산의 경우에는 … 표 2 …

⇒ E-2는 **세율만의 문제가 아니다.** §104⑦ 각 호 해당 주택은 장특공제가 통째로 사라진다.
그리고 배제 범위는 §104⑦의 대상 범위와 같으므로 **주택분만**이고 상가분 장특은 살아 있다.

이는 선행 P4가 미등기(`isUnregistered`)에 대해 만든 구조와 **완전히 동일한 축**이다 —
`calcLongTermRate(holdingYears, residenceYears, useTable2, isUnregistered)`
(`transfer-tax-mixed-use-inheritance.ts:26`, helpers가 `:404`에서 재수출)의 배제 파라미터를 일반화하면 된다.

### 2.3 법 §104⑤2호 단서 — 「제7항 각 호」도 대상

> 2. … 다만, 둘 이상의 자산에 대하여 **제1항 각 호, 제4항 각 호 및 제7항 각 호**에 따른 세율 중
> **동일한 호**의 세율이 적용되고, 그 적용세율이 둘 이상인 경우 해당 자산에 대해서는 각 자산의
> 양도소득과세표준을 **합산**한 것에 대하여 … 각 해당 호별 세율을 적용하여 산출한 세액 중에서
> 큰 산출세액의 합계액으로 한다.

⇒ 선행 P1이 만든 `RateClause`에 `104-7-1`·`104-7-3`이 이미 있고
`PROGRESSIVE_RATE_CLAUSES`에 포함돼 있다(`transfer-tax-rate-calc.ts:147-151`). 겸용 파트에 그대로 쓴다.
주택분(`104-7-1`)과 상가분(`104-1-1`)은 **다른 호**이므로 단서로 합산되지 않는다.

### 2.4 영 §154① 본문 — 거주요건 (E-1 근거, 정본 기구현)

정본 `meetsOneHouseResidenceRequirement`(`transfer-tax-exemption.ts:169-199`)가 구현하는 규칙:

| 축 | 내용 | 구현 |
|---|---|---|
| 취득 당시 조정대상지역 | 해당하면 거주 2년 필요 | `resolveWasRegulatedAtAcquisition`(`:118-127`) — `regionCode` 있으면 취득일 기준 정밀 판정, 없으면 boolean fallback |
| 경과규정 | 2017-08-03 이전 취득은 조정지역이어도 거주요건 면제 | `rule.prePolicyDate`·`prePolicyExemptResidence` |
| §154⑧3호 통산 | 동일세대 상속은 상속개시 전 거주 통산 | `resolveExemptionResidenceMonths`(`:160`) |
| 단서 각호 면제 | 1호 임대5년·2호가 수용·2호나다 해외·3호 부득이 → "both" / 5호 공고전계약 → "residence_only" | `resolveExemptionProviso`(`:70-110`) |

### 2.5 영 §154① **단서** — 1~3호는 **보유기간도** 면제 (E-1 재설계 근거)

「소득세법 시행령」 MST 286211 · 공포 2026-05-22 · **시행 2026-07-01** · 2026-07-31 조회.

> **다만**, 1세대가 양도일 현재 국내에 1주택을 보유하고 있는 경우로서 **제1호부터 제3호까지**의
> 어느 하나에 해당하는 경우에는 **그 보유기간 및 거주기간의 제한을 받지 않으며** 제5호에 해당하는
> 경우에는 **거주기간의 제한을 받지 않는다.**
> 1. 민간건설임대주택 등 … 세대전원 거주 **5년** 이상인 경우
> 2. 다음 각 목의 어느 하나(가목 수용 … 그 양도일 또는 수용일부터 **5년** 이내 양도 …)
> 3. **1년** 이상 거주한 주택을 … 취학·근무상 형편·질병 요양, 그 밖에 부득이한 사유로 양도하는 경우
> 5. 조정대상지역 공고일 이전 매매계약 + 계약금 지급 + 계약금 지급일 현재 무주택

⇒ 1~3호는 **보유·거주 둘 다** 면제("both"), 5호는 거주만("residence_only").
정본 `resolveExemptionProviso`의 반환값과 정확히 일치한다.

**이것이 §3의 E-3(P3a 기시행 결함)을 만든다.**

### 2.6 영 §154③ — 「전부를 주택으로 본다」의 적용 범위

> ③ **법 제89조제1항제3호를 적용할 때** 하나의 건물이 주택과 주택외의 부분으로 복합되어 있는 경우 …
> 그 전부를 주택으로 본다. 다만, 주택의 연면적이 주택 외의 부분의 연면적보다 적거나 같을 때에는
> 주택외의 부분은 주택으로 보지 아니한다.

⇒ 적용 범위가 **「법 §89①3호(1세대1주택 비과세)를 적용할 때」로 명시 한정**된다.
법 §104⑦(중과)에 준용한다는 규정이 없다 — §5.3의 「중과·장특 배제는 주택분만」을 뒷받침한다.
(다만 이는 법문 구조 해석이며, 유권해석 본문은 여전히 미확인 — §11 U-2.)

### 2.7 🔶 본문 미확인 — 국세청 법령해석 5건

「겸용주택 중과세율」 검색 결과(법제처 Open API, domain=nts). **제목만 확인했고 본문은 조회 불가**다
(법제처 API가 ntsCgmExpc 본문 미제공 · taxlaw.nts.go.kr는 SPA라 WebFetch도 빈 페이지).
**추정하지 않는다.**

| 일련번호 | 제목 | 해석일 |
|---|---|---|
| 31858 | 1세대 4주택자가 양도한 겸용주택의 **상가부분**에 대한 중과세율 적용여부 | 2004-06-17 |
| 105262 | 겸용주택의 상가부분에 대한 중과세율 적용 여부 | 2004-06-15 |
| 58304 | 겸용주택의 중과세율 적용 여부 | 2004-07-21 |
| 65134 | 겸용주택의 중과세율 적용 여부 | 2005-03-22 |
| **217202** | **중과세율이 적용되는 상가겸용주택의 주택 및 주택 부수토지 계산방법** | **2023-02-15** |

- 2004~2005년 4건은 구법(당시 §104①2의3호 1세대3주택 60% 단일세율) 시기 —
  memory `feedback_tribunal_precedent_era_law_drift`에 따라 **현행 근거로 인용 금지**.
- 217202(2023)만 현행법 시기다. 제목이 「중과세율이 적용되는 **상가겸용주택의 주택 및 주택 부수토지**
  계산방법」이므로 쟁점 자체가 존재함은 확인되나, **결론은 미확인**이다.
- **이 계획서의 설계 근거는 §104⑦ 법문(「주택(이에 딸린 토지를 포함한다)」)이며**, 위 해석은
  보강 자료로만 둔다. 본문 확보 시 §11 레지스트리에서 해소한다.
- 조세심판례(domain=tax_tribunal)는 「겸용주택 중과세율」·「겸용주택 중과세율 상가」 모두 **0건**.

---

## 3. 결함 실측

공통 조건 — CASE14 픽스처(`__tests__/tax-engine/_helpers/mixed-use-fixture.ts:63`) ·
양도가 30억 · **양도일 2026-06-01**(중과 한시배제 종료 후, §3.3) · `makeMockRates()`.

### E-1 — 겸용주택이 §154① **거주요건**을 검증하지 않는다

선행 P3a가 **보유** 2년만 넣었다(`transfer-tax-mixed-use.ts:103-105`). 거주요건은 미판정이다.

```ts
// 현행 (transfer-tax-mixed-use.ts:103-105)
const isOneHouseExempt =
  (asset.isOneHouseExempt ?? true) && meetsExemptionHolding && !isUnregistered;
//                                    ↑ 보유만. 거주 축 없음
```

⇒ **취득 당시 조정대상지역인 겸용주택을 하루도 거주하지 않고 팔아도 12억 비과세가 유지된다.**

**실측** (CASE14 · `residencePeriodYears: 0` · 취득시 조정대상지역):

| | 주택 소득금액 | 장특 | 과세표준 | 산출세액 | 총부담 |
|---|---:|---:|---:|---:|---:|
| 현행(비과세 유지) | 220,060,008 | 표1 30% | 831,539,122 | **313,306,431** | 344,637,074 |
| 정정(비과세 배제) | 1,058,620,500 | 표1 30% | 1,670,099,614 | **685,604,826** | 754,165,308 |
| **차액** | +838,560,492 | — | +838,560,492 | **+372,298,395** | **+409,528,234** |

방향은 **과소과세**. 정정값은 `isOneHouseExempt: false`를 강제 주입한 **엔진 실행 실측**이다.

### E-2 — 겸용주택이 §104⑦ 다주택 중과를 전혀 적용하지 않는다

`MixedUseAssetInput`에 주택수·조정지역 필드가 없어(§1.4) 세율·장특 어디에도 중과가 반영되지 않는다.
다주택자면 API가 `isOneHouseExempt: false`를 이미 보내므로
(`transfer-tax-api-mixed-use.ts:186-190`) **비과세는 이미 정확히 배제**되고, **중과만 빠진다**.

**실측** (CASE14 · `isOneHouseExempt: false` · 조정대상지역):

| | 주택 소득금액 | 장특(주택분) | 1호 합산누진 | 2호 자산별 | 채택 | 차액 |
|---|---:|---:|---:|---:|---:|---:|
| 현행(중과 없음) | 1,058,620,500 | 453,694,499 | — | — | **685,604,826** | — |
| 2주택 +20%p | **1,512,314,999** | **0** (§95②) | 889,767,350 | 1,137,370,975 | **1,137,370,975** | **+451,766,149** |
| 3주택+ +30%p | **1,512,314,999** | **0** (§95②) | 889,767,350 | 1,288,352,475 | **1,288,352,475** | **+602,747,649** |

- 주택 양도차익 1,512,314,999은 엔진 실측(`housingPart.transferGain`).
  장특 배제로 소득금액이 453,694,499만큼 늘어난다.
- 1호·2호는 §104⑤ 손계산(브래킷은 `parseRatesFromMap` 실제 값). 두 경우 모두 **2호가 채택**된다.
- 총부담(지방소득세 포함): 2주택 1,251,108,072 · 3주택+ 1,417,187,722.

**세액 기여 분해** — 차액의 절반 이상이 세율이 아니라 **장특 배제**에서 나온다.
「중과 = +20%p」로만 이해하면 규모를 놓친다.

### E-3 🔴 **이미 머지된 P3a의 과다과세 결함** — 단서 각호가 보유요건을 면제하지 않는다

**v1.2 자가 검토에서 발견.** 계획서 결함이 아니라 **PR #937(P3a)로 이미 배포된 코드**의 결함이다.

| | 판정식 |
|---|---|
| 정본 `meetsOneHouseHoldingResidence`(`transfer-tax-exemption.ts:224-232`) | `meetsHolding = **proviso === "both"** \|\| holding.years >= minHoldingYears` |
| 겸용 P3a(`transfer-tax-mixed-use.ts:103-105`) | `meetsExemptionHolding = exemptionHolding.years >= minHoldingYears` — **단서 없음** |

영 §154① 단서(§2.5)는 1~3호에 대해 「**보유기간 및** 거주기간의 제한을 받지 않는다」고 정한다.
P3a는 그 면제를 구현하지 않았다.

**도달 가능성 — 실측**: 단서 입력은 겸용에도 전송된다.
`provisoGate`(`transfer-tax-api-helpers.ts:95-99`)는 `isHousing = primary.assetKind === "housing"`만
보고, 겸용은 그 조건을 만족한다(§1.2). 1세대 + 1주택이면 `visible: true, mode: "one_house"` →
`oneHouseExemptionProviso`가 top-level로 나간다. **이론적 사각이 아니다.**

**결과** — 겸용 1세대1주택 + 단서 1~3호(수용·해외이주·부득이 등) + 보유 2년 미만:

```
법령: 단서 1~3호 → 보유·거주 제한 없음 → 1세대1주택 비과세 적용
P3a: meetsExemptionHolding = false → isOneHouseExempt = false → 주택분 전액 과세
```

⇒ **과다과세**. 방향이 E-1(과소과세)과 **반대**이며
memory `feedback_no_unfavorable_application_without_legal_basis`(법 근거 없이 불리 적용 금지)를
정면으로 위반한다. **E-1·E-2보다 우선순위가 높다.**

**금액 미실측** — 현행 엔진에는 단서 입력이 없어 「법령 정합값」을 산출할 경로가 없다
(`isOneHouseExempt`를 true로 넣어도 P3a 게이트가 AND로 덮는다). 규모는 E-1과 같은 축
(주택분 12억 비과세 적용/배제)이며 **anchor B-A7이 확정한다**. 추정하지 않는다.

> P3a 당시 이 결함이 드러나지 않은 이유: 기존 겸용 anchor가 전부 보유 2년 이상이었고
> (선행 §D-9-R이 「기존 anchor가 하나도 깨지지 않았다」고 기록), 단서 입력 자체를
> 겸용 테스트가 한 번도 구성하지 않았다.

### 3.3 중과 한시배제는 **2026-05-09에 끝났다**

`SURCHARGE_SUSPENSION_TRANSFER_DATE_WINDOW = { start: "2022-05-10", end: "2026-05-09" }`
(`lib/tax-engine/legal-codes/transfer.ts:517-520`).

오늘(2026-07-31) 기준 **배제 기간이 종료**되어 조정대상지역 다주택 양도는 다시 중과 대상이다.
E-2는 사문(死文)이 아니라 **현재 진행형 결함**이다.

---

## 4. 설계 — Phase A (E-1 거주요건 + E-3 단서 면제)

### 4.1 원칙 — 요건 판정 전체를 정본에 위임한다

§154① 요건을 겸용에 **다시 쓰지 않는다**. 보유·거주·단서를 한 번에 판정하는
**`meetsOneHouseHoldingResidence`**(`transfer-tax-exemption.ts:224-232`)를 호출한다.
경과규정·§154⑧ 통산·단서 각호가 전부 그 안에 있다.

P3a가 **보유 축만 따로 구현**했다가 단서 면제를 놓친 것(E-3)이 바로 「따로 구현하면 드리프트한다」의
실례다. 거주 축을 또 따로 붙이면 같은 실수를 반복한다 — **함수 하나만 부른다.**

### 4.2 ⑭ route 주입

`route.ts:582-597` `mixedAsset` 조립에 `:586-587`(ownershipRatio·isUnregistered) 옆으로 추가:

```ts
wasRegulatedAtAcquisition: data.wasRegulatedAtAcquisition,
regionCode: data.regionCode,
oneHouseExemptionProviso: engineInput.oneHouseExemptionProviso,  // Date 변환 완료본(:205-211)
```

> ⚠️ `oneHouseExemptionProviso`는 **`engineInput`에서 가져온다**. `data.*`는 Zod 출력이라 날짜가
> **string**이고, `resolveExemptionProviso`의 `addYears`·`>=` 비교가 침묵 오작동한다
> (memory `feedback_api_zod_schema_sync` · `lib/api/date-coerce.ts` 규약). route는 이미 `:205-211`에서
> 변환해 두었으므로 그 값을 재사용한다.

### 4.3 `MixedUseAssetInput` 신규 필드 3개

```ts
/** 취득 당시 조정대상지역 여부(영 §154① 본문) — 거주요건 게이트. */
wasRegulatedAtAcquisition?: boolean;
/** 법정동코드 10자리 — 있으면 취득일 기준 정밀 판정, 없으면 위 boolean fallback. */
regionCode?: string;
/** 영 §154① 단서 각호 면제 사유. Date 변환 완료본만 주입할 것. */
oneHouseExemptionProviso?: TransferTaxInput["oneHouseExemptionProviso"];
```

### 4.4 엔진 — P3a의 보유 판정을 **정본 통합 판정으로 교체**한다

> **v1.2 재설계.** 초안은 P3a의 `meetsExemptionHolding`에 거주 판정을 AND로 붙였다.
> 그 구조로는 E-3(단서가 보유요건을 면제)을 고칠 수 없다 — 단서는 `meetsHolding` **내부**에
> 있기 때문이다. 두 축을 따로 두지 말고 **정본 함수 하나를 호출**한다.

`transfer-tax-mixed-use.ts:103`의 `meetsExemptionHolding` AND 항을 **대체**한다.

```ts
const exemptionReqInput = {
  // 주택 부분의 취득일 = 건물 취득일 — P3a 축 유지(선행 §D-9-R · B-20/B-20b가 고정)
  acquisitionDate: asset.buildingAcquisitionDate,
  transferDate,
  residencePeriodMonths: residenceMonthsForExemption,   // §4.5
  oneHouseExemptionProviso: asset.oneHouseExemptionProviso,
  regionCode: asset.regionCode,
  wasRegulatedAtAcquisition: asset.wasRegulatedAtAcquisition,
  // acquisitionCause·decedent* 는 **의도적 미전달** — 두 가지를 동시에 담보한다:
  //   ① 이중 통산 차단(§4.5)
  //   ② resolveExemptionHoldingStartDate가 acquisitionDate를 그대로 반환 → 보유 기산일이
  //      건물 취득일로 고정(P3a 축 불변). 겸용에는 decedentCohabitationHoldingStartDate
  //      입력 자체가 없다(grep 0건).
};
const meetsOneHouseRequirements = meetsOneHouseHoldingResidence(
  exemptionReqInput,
  oneHouseSpecialRules.one_house_exemption,
);
const isOneHouseExempt =
  (asset.isOneHouseExempt ?? true) && meetsOneHouseRequirements && !isUnregistered;
```

**한 번의 호출이 세 가지를 동시에 해결한다** — 보유(P3a 유지) · 거주(E-1) · 단서 면제(E-3).

**타입 — 소폭 narrowing 필요**: `meetsOneHouseHoldingResidence`의 1번 인자는 현재
`TransferTaxInput`(전체)이다. 겸용이 전체를 만들 수는 없으므로, 이미 있는 `ResidenceReqInput`
(`transfer-tax-exemption.ts:32-44`)과 **같은 방식**으로 narrowing한다:

```ts
export type ExemptionReqInput = ResidenceReqInput &
  Pick<TransferTaxInput, "decedentCohabitationHoldingStartDate">;
```

`resolveExemptionHoldingStartDate`가 읽는 필드는 `acquisitionCause` ·
`decedentSameHouseholdBeforeInheritance` · `decedentCohabitationHoldingStartDate` ·
`acquisitionDate` 넷뿐이고 앞의 둘은 이미 `ResidenceReqInput`에 있다.
**타입 전용 변경으로 동작은 불변**이며, 단건 호출부(`transfer-tax.ts:202`)가 넘기는
`TransferTaxInput`은 구조적으로 이 타입을 만족한다.

**P3a 회귀 안전성** — 단서·조정지역 미주입 시 `proviso = null`, `wasRegulated = false` →
`meetsHolding = years >= minHoldingYears` · `residence = true` → **P3a와 완전 동일**.
B-17·B-18·B-20·B-20b는 손대지 않는다(B-A8이 이를 명시 고정).

미충족 시 `warnings`에 **보유기간·거주기간·취득시 조정지역 여부를 모두** 실어 침묵 과세를 막는다.
어느 요건이 걸렸는지 사용자가 판별할 수 있어야 하며, 술어를 따로 계산해 붙이지는 않는다
(memory `feedback_shared_predicate_argument_parity` — 중복 술어를 만들지 않는다).

### 4.5 ⚠️ 이중 통산 차단 — 설계 판단

`resolveExemptionResidenceMonths`는 「동일세대 상속이면 상속개시 전 거주를 **더한다**」
(`transfer-tax-exemption.ts:135` `consolidateResidenceMonths`). 그런데 겸용 API 변환은 **이미 통산된 값**을 보낸다:

```ts
// transfer-tax-api-mixed-use.ts:168·171
residencePeriodYears:       Math.floor(resMonths / 12),                    // 실거주
table2ResidencePeriodYears: Math.floor(consolidateResidenceMonths(…) / 12) // **통산 완료**
```

정본에 `acquisitionCause`·`decedentSameHouseholdBeforeInheritance`를 함께 넘기면 **통산이 두 번**
걸린다. 따라서:

```
residenceMonthsForExemption = (asset.table2ResidencePeriodYears ?? asset.residencePeriodYears) * 12
+ acquisitionCause·decedent* 는 넘기지 않는다 (통산은 이미 반영됨)
```

- 정본과 결과가 같음을 anchor **B-A5**가 고정한다.
- 연 → 월 환산이므로 **11개월 이하 잔여가 절사**된다. `meetsOneHouseResidenceRequirement`가
  `Math.floor(months/12) >= 2`로 판정하므로 **결론은 불변**이다(연 단위 비교).
  단 §154① 단서 3호(1년)·1호(5년)도 연 단위 비교라 동일하게 안전하다. **B-A6**이 고정한다.

### 4.6 범위 밖 (Phase A)

- `residenceTransitionAcquisitionDate`(§97의2 이월과세 시 경과규정 축) — 겸용에 이월과세 입력이
  없다. 미전달 시 정본이 `?? input.acquisitionDate`로 fallback하므로 안전하다.

---

### 4.6-R Phase A 구현 결과 ✅ (2026-07-31 · PR 진행)

**위치** — 4파일:

| 파일 | 변경 |
|---|---|
| `transfer-tax-exemption.ts` | `ExemptionReqInput` 신설 + `meetsOneHouseHoldingResidence`·`resolveExemptionHoldingStartDate` 시그니처 narrowing (**타입 전용, 동작 불변**) |
| `types/transfer-mixed-use.types.ts` | `wasRegulatedAtAcquisition` · `regionCode` · `oneHouseExemptionProviso` 3필드 |
| `transfer-tax-mixed-use.ts:98-135` | P3a 보유 판정 → **정본 `meetsOneHouseHoldingResidence` 단일 호출**로 교체 + warning 3축 |
| `app/api/calc/transfer/route.ts:588-594` | ⑭ 주입 3필드 (`oneHouseExemptionProviso`는 `engineInput` 변환본) |

**🔴 anchor가 계획서 수치를 뒤집었다 — CASE14로는 거주요건을 검증할 수 없다**

B-A1이 RED가 아니라 **엉뚱한 값**을 냈다. 원인은 코드가 아니라 **fixture**였다:
CASE14의 건물 취득일은 **1997-09-12**인데 §154① 거주요건에는 부칙(대통령령 제28293호) 적용례 —
**2017-08-03 이전 취득은 조정대상지역이어도 거주요건 면제**(`rule.prePolicyDate` ·
`transfer-tax-exemption.ts:182-190`) — 가 있다. 즉 CASE14는 조정지역·거주 0년이어도
**영원히 요건 충족**이라 아무것도 검증하지 못한다.

⇒ Phase A anchor는 건물 취득일을 **2018-06-01**로 덮어쓴다. 그 결과 §3 E-1의 실측치
(313,306,431 → 685,604,826)는 **이 Phase의 anchor 값이 아니다**. 재실측:

| 케이스 | 주택 소득금액 | 산출세액 |
|---|---:|---:|
| 비조정 취득(거주요건 없음) | 257,630,000 | **331,360,256** |
| 조정 취득 + 거주 0년 → **배제** | 1,239,354,676 | **769,372,093** |
| 조정 + 실거주 2년(표2) | — | 303,648,926 |
| 조정 + §154⑧3호 통산 2년(표2) | — | 314,211,807 |
| **보유 1년 + 단서 없음** | 1,512,314,999 | **1,495,427,008** |
| **보유 1년 + 단서 2호가(수용)** 🔴 E-3 | **314,371,438** | **656,866,515** |

E-1 효과 **+438,011,837**(331,360,256 → 769,372,093).
E-3 효과 **−838,560,493**(1,495,427,008 → 656,866,515) — **과다과세 해소**라 부호가 반대다.

**설계 판단이 실측으로 확인된 것**:
- 통산 2년 → 표2 진입(`longTermDeductionTable === 2`)하되 **거주분 공제율은 붙지 않는다**
  (실거주 0년). 대상판정/공제율 분리 규칙(사전법령해석재산 2021-202)이 그대로 관철됐다.
- 통산 **1년**은 미충족 → **이중 통산이 없음을 반증**(두 번 더해졌다면 2년이 됐을 것).
- 단서 5호(공고전계약)는 보유 1년에서 **여전히 배제** — 「거주만 면제」가 정확히 구현됐다.
- 수용일 미입력·5년 초과는 **fail-closed**.

**anchor 14건** — B-A0(경과규정) · B-A1 · B-A2 · B-A2b · B-A3 · B-A5 · B-A6 ·
B-A4 · B-A4b · B-A4c · **B-A7(E-3)** · B-A8 · B-A9.

**검증**: `tsc` 0 · `eslint` **0 error** · 전체 **1,129파일 12,671건 통과 · 회귀 0**
(12,658 → +13). P3a anchor 12건 전부 불변 — 단서·조정지역 미주입 시 `proviso = null` ·
`wasRegulated = false`로 P3a와 동일 경로를 타기 때문이다(계획서 §4.4 예측 적중).

**파일 크기**: `transfer-tax-mixed-use.ts` 635 → **664** · `route.ts` 706 → **713** (cap 800 이내).

---

## 5. 설계 — Phase B (E-2 다주택 중과)

### 5.1 ⑭ route 주입 — 서브객체 1개

중과 판정 정본 `determineMultiHouseSurcharge`(`multi-house-surcharge.ts:133-139`)는 순수 함수이나
**입력이 9개**다. 개별 필드로 흩뿌리면 `MixedUseAssetInput`이 오염되므로 **서브객체 1개**로 묶는다.

```ts
// route.ts — mixedAsset 조립부
multiHouse: data.houses && data.houses.length > 0
  ? {
      houses: data.houses,
      sellingHouseId: data.sellingHouseId ?? data.houses[0].id,
      presaleRights: data.presaleRights ?? [],
      isOneHousehold: data.isOneHousehold,
      isRegulatedArea: data.isRegulatedArea,
      marriageMerge: engineInput.marriageMerge,        // route.ts:196-198 Date 변환본
      parentalCareMerge: engineInput.parentalCareMerge, // route.ts:199-201
      gracePeriod: engineInput.gracePeriod,             // route.ts:195 mapGracePeriodToEngine 변환본
      // temporaryTwoHouse: ⚠️ Do 단계 확인 필요 — 아래 주석
    }
  : undefined,
```

> `houses`가 없으면 `undefined` → 엔진은 종전 경로 그대로(회귀 0). 날짜를 갖는 값은 전부
> `engineInput`에서 가져온다(§4.2와 같은 이유). 특히 `gracePeriod`는 raw `data.gracePeriod`를
> 쓰면 안 된다 — `mapGracePeriodToEngine`(`lib/api/transfer-route-multi-house.ts:121-129`)이
> `toDate`로 변환한 값이어야 한다.

> ⚠️ **`temporaryTwoHouse`는 Do 단계에서 확정한다.** `determineMultiHouseSurcharge`가 받는 값은
> 단건 경로에서 `workingInput.multiHouseTemporaryTwoHouse`인데(`transfer-tax.ts:195`),
> 그 필드는 **저장소 전체에서 정의(`types/transfer.types.ts:266`)와 소비(`transfer-tax.ts:195`)
> 2곳뿐이고 route가 채우지 않는다**(grep 전수). route가 Date 변환해 두는 것은 이름이 다른
> `engineInput.temporaryTwoHouse`(`route.ts:163-166`)다. 두 타입의 형상 일치를 확인하기 전에는
> 어느 쪽도 단정하지 않는다 — §11 U-7.

### 5.2 엔진 — 정본 호출

`calcMixedUseTransferTax`는 이미 `rates`를 받아 `parseRatesFromMap`을 부른다. 그 결과에
`houseCountExclusionRules`·`surchargeSpecialRules`·`regulatedAreaHistory`가 모두 있다
(`transfer-tax-helpers.ts:114-136`). 정본 호출에 부족한 것이 없다.

```ts
// ⚠️ transfer-tax-mixed-use.ts:81의 구조분해를 먼저 넓힌다 —
//    현재 { brackets, basicDeductionRules, oneHouseSpecialRules } 3개뿐이다.
const { …, houseCountExclusionRules, surchargeSpecialRules, regulatedAreaHistory } =
  parseRatesFromMap(rates);

const mhResult = asset.multiHouse && houseCountExclusionRules
  ? determineMultiHouseSurcharge(
      { ...asset.multiHouse, transferDate,
        // Phase A가 만든 §154① 통합 판정을 **그대로** 재사용 — 배제2(§155⑤ 의제) 게이트.
        // 정본이 단건에서 넘기는 값과 같은 함수의 결과다(`transfer-tax.ts:202`).
        sellingHouseMeetsOneHouseRequirements: meetsOneHouseRequirements },
      houseCountExclusionRules, regulatedAreaHistory ?? null, surchargeSpecialRules,
      asset.multiHouse.isRegulatedArea,
    )
  : undefined;
```

> ⚠️ **`houseCountExclusionRules`가 없으면 중과가 통째로 스킵된다** — `parseRatesFromMap`은
> 이 레코드를 **optional로 처리하며 throw하지 않는다**(`transfer-tax-helpers.ts:130-134`).
> 단건 경로도 같은 구조(`transfer-tax.ts:184`)이므로 동작은 정합이나,
> **테스트에서는 이것이 침묵 오탐의 원인이 된다** — §8 Phase B 주의.

**적용 여부는 정본 판정을 그대로 쓴다** (`transfer-tax.ts:467-481`과 동일):

```
surchargeCase      = mhResult.surchargeType !== "none"
surchargeApplied   = mhResult.surchargeApplicable          // 유예·배제 반영
addonRate          = resolveSurchargeAddonRate(transferDate, mhResult.surchargeType)
                     // null(2018-04-01 이전 양도) → 중과 미적용
```

### 5.3 §95② 장특 배제 — **주택분만**

배제 대상은 §104⑦ 각 호 자산 = 「주택 + 딸린 토지」다. 겸용의 상가건물·상가부수토지는 아니다.

`calcLongTermRate` 호출 지점 **12곳**(grep 전수)을 계열로 나눈다:

| 계열 | 위치 | 중과 배제 |
|---|---|---|
| **주택** | `-helpers.ts:500·506·526·527`(buildHousingPart) · `-period-split.ts:204·211` | ✅ **적용** |
| 상가 | `-helpers.ts:571·572·578`(buildCommercialPart) · `-period-split.ts:220·232` | ❌ 유지 |
| 비사토(배율초과) | `-totals.ts:26`(buildNonBusinessPart) | ❌ 유지 — §104①8호 자산이지 §104⑦ 자산이 아니다 |

**P4와 다른 점**: 미등기는 자산 **전체**라 12곳 전부에 걸었다. 중과는 **주택 6곳만**이다.
`isUnregistered` 파라미터를 그대로 재사용하지 말고 배제 사유를 구분할 것
— 같은 이름을 돌려쓰면 상가분까지 배제되는 침묵 과다과세가 된다.

**LTHD 배제는 유예·부칙과 무관하지 않다** — 정본 규칙(`transfer-tax-helpers.ts:458-461`):

```
L-1: isSurcharge && !isSuspended → 배제
```
- 한시 유예 중(`isSurchargeSuspended`)이면 **장특은 살아난다**.
- 2008 위기취득 배제(`rateSurchargeStatutoryExcluded`)는 **세율만 배제, 장특 배제는 존속**
  (`types/multi-house-surcharge.types.ts:410-412` · 서울행정법원 2024구단72950).
  ⇒ 겸용도 `surchargeType !== "none" && !isSurchargeSuspended`를 배제 조건으로 쓴다
  (`surchargeApplicable`이 아니다 — **다른 술어**다).

### 5.4 세율 — P3b `rateParts`에 얹는다

선행 P3b가 만든 3파트 구조(`transfer-tax-mixed-use-totals.ts:56-60`)를 확장한다.

```ts
export interface MixedUseRatePart {
  kind: "housing" | "commercial_land" | "commercial_building";
  income: number;
  holdingYears: number;
  /** [신규] §104⑦ 중과 가산율(0.2·0.3). 주택분 전용, 미적용 시 undefined. */
  surchargeAddon?: number;
}
```

주택 파트의 세액 산정 — **§104⑦ 후단 MAX**를 반영:

```
중과세액   = 누진(파트 과세표준) + 파트 과세표준 × addon
단기세액   = 파트 과세표준 × shortTermRate(holdingYears, isHousing)   // 2년 미만일 때만
주택 파트세액 = 보유 2년 이상 ? 중과세액 : MAX(중과세액, 단기세액)
```

정본 `transfer-tax-rate-calc.ts:438-464`가 같은 비교를 하고 있으므로 **산식을 그쪽과 대조**한다.

§104⑤2호에서 주택 파트의 호는 `104-7-1`(2주택) / `104-7-3`(3주택+)이고 상가는 `104-1-1`이다.
**다른 호**이므로 단서 합산 대상이 아니다 — 각 파트 독립 계산 후 합.

### 5.5 🛑 범위 제외 — 배율초과 비사업용 토지 동반 케이스

`buildTotalTax`의 §104⑤ 경로는 `nonBizIncome > 0`이면 진입하지 않는다
(`-totals.ts:98`). 선행 계획서 D-8(겸용 모델 A ↔ split 모델 B 불일치)이 **세무 판단 대기**이기
때문이다.

⇒ **세율 가산만 같은 경계를 따른다.** 배율초과 비사토가 있는 겸용주택은 §104⑦ **가산율을
적용하지 않고**, `warnings`에 「중과 세율 미반영」을 명시한다. **침묵하지 않는다.**

**⚠️ 단, §95② 장특 배제는 이 경계와 무관하게 적용한다.** 두 조문은 별개다:

| | 근거 | nonBiz 동반 시 |
|---|---|---|
| 세율 가산 | §104⑦ | ❌ 보류 — `buildTotalTax`의 §104⑤ 경로가 D-8 대기로 막혀 있다 |
| 장특 배제 | §95② | ✅ **적용** — 파트 조립 단계에서 일어나며 세액 모델과 무관하다 |

부분 적용은 **과소과세 방향**(납세자 유리)이라 「법 근거 없이 불리 적용 금지」와 충돌하지 않는다.
반대로 §95②까지 미루면 **명문 근거가 있는 배제를 근거 없이 유예**하는 것이 된다.

⇒ 이 조합의 세액은 **불변이 아니다**(장특 배제만큼 증가). §11 레지스트리에 등록한다.

### 5.6 파일 배치 — 신규 파일 1개

`transfer-tax-mixed-use.ts`는 **635줄**이다(cap 800 · 착지목표 ≤700). 중과 판정 조립을 여기 넣으면
위험구간(≥750)에 진입한다.

⇒ 중과 판정·가산율 해석을 **`lib/tax-engine/transfer-tax-mixed-use-surcharge.ts`(신규)**로 분리하고
오케스트레이터는 호출 1회만 둔다. 세액 산식은 `-totals.ts`(172줄, 여유 충분)에 둔다.

---

### 5.7-R Phase B1 구현 결과 ✅ (2026-07-31)

**범위 — 판정 배관만. 세액은 불변**(B-B3b가 고정). B2(장특)·B3(세율)이 세액을 바꾼다.

| 파일 | 변경 |
|---|---|
| `types/transfer-mixed-use.types.ts` | 입력 `multiHouse?`(서브객체 1개) + 결과 `multiHouseSurcharge?` |
| `transfer-tax-mixed-use.ts:81-89` | `parseRatesFromMap` 구조분해에 3개 추가 |
| `transfer-tax-mixed-use.ts:137-160` | 정본 `determineMultiHouseSurcharge` 호출 + 결과 echo |
| `app/api/calc/transfer/route.ts:595-612` | ⑭ `multiHouse` 주입 |

**⚠️ Zod string 날짜 함정이 두 번 걸렸다 — `tsc`가 둘 다 잡았다**:

| 필드 | raw `data.*` | 올바른 소스 |
|---|---|---|
| `houses` | `acquisitionDate`가 **string** | `engineInput.houses` (`mapHousesToEngine` 변환본, route.ts:192) |
| `gracePeriod` | 계약일 등 string | `engineInput.gracePeriod` (`mapGracePeriodToEngine`, route.ts:195) |

계획서 §5.1이 `gracePeriod`만 지적했는데 **`houses`도 같은 함정**이었다. 타입이 잡아준 것은
`HouseInfo.acquisitionDate`가 `Date`로 선언돼 있었기 때문이다 — ⑫⑬⑭ 침묵 strip과 달리
이 경로는 TypeScript가 방어한다.

**🔴 R-9(침묵 GREEN)가 실제로 발동할 뻔했다 + mock에 두 번째 함정이 있었다**:

- `makeMockRates()`에는 `house_count_exclusion`이 없어 `multiHouseSurcharge`가 `undefined`가 된다.
  B-B0이 **양방향으로** 고정한다(올바른 mock → defined / 잘못된 mock → undefined).
- **추가 발견** — `makeMockRatesWithHouseEngine()`는 `surcharge_suspended: **false**`로
  **한시 유예를 의도적으로 끈다**("중과 실제 적용 테스트용" override). 그래서 유예 창 anchor는
  그 레코드만 되살린 전용 mock(`ratesWithSuspension()`)이 필요했다. 이를 모르면
  「유예가 동작하지 않는다」는 **잘못된 결론**에 이른다.

**`temporaryTwoHouse` 미전달 확정** — §11 U-7의 의심이 사실로 굳었다.
`MultiHouseSurchargeInput.temporaryTwoHouse`는 `{previousHouseId, newHouseId}`(주택 ID)인데
route가 Date 변환해 두는 `engineInput.temporaryTwoHouse`는 `{previousAcquisitionDate,
newAcquisitionDate}`(날짜)로 **형상이 아예 다르다**. 값을 채우는 `multiHouseTemporaryTwoHouse`는
저장소 전체에서 정의·소비 2곳뿐이고 **아무도 쓰지 않는다** → **단건 경로에서도 상시 undefined**.
겸용도 동일하게 비워 둔다(단건과 동작 일치). 별건 조사 대상.

**anchor 8건** — B-B0(R-9 방어) · B-B1 · B-B1b · B-B2 · B-B2b(유예 경계 양방향) · B-B3 ·
B-B3b(세액 불변) · B-B4(Phase A 판정 전달).

**검증**: `tsc` 0 · `eslint` **0 error** · 전체 **1,130파일 12,679건 통과 · 회귀 0**(12,671 → +8).

**파일 크기**: `transfer-tax-mixed-use.ts` 664 → **699** · `route.ts` 713 → **732**.
계획서 §5.6이 예고한 `-surcharge.ts` 분리는 **아직 하지 않았다** — 800 트리거 미달이고
정책상 선제 분리는 금지다(「700~749에 안정적으로 앉은 파일을 미리 쪼개면 순수 낭비」).
**B3에서 재확인**한다.

---

### 5.8-R Phase B2 구현 결과 ✅ (2026-07-31)

**§95② 본문 괄호 — 「§104⑦ 각 호에 따른 자산」 장기보유특별공제 배제. 주택분 한정.**

**실측** (CASE14 · 다주택 · 조정지역 · 2026-06-01):

| | B2 전 | B2 후 |
|---|---:|---:|
| 주택분 장특 | 453,694,499 | **0** |
| 주택 소득금액 | 1,058,620,500 | 1,512,314,999 |
| 과세표준 | 1,670,099,614 | 2,123,794,113 |
| 산출세액 | 685,604,826 | **889,767,350** |
| **상가분 장특** | 263,133,905 | **263,133,905 (유지)** |

**+204,162,524.** 세율은 아직 손대지 않았다.

> ✅ **교차 검증** — 889,767,350은 §3 E-2 표의 **1호(합산 누진) 손계산값과 원 단위까지 일치**한다.
> B2가 과세표준을 확정하고 B3이 그 위에 §104⑦ 세율을 얹으므로, 손계산의 중간 단계가
> 엔진 실측으로 확인된 셈이다. B3의 목표값은 같은 표의 **2호**
> (2주택 1,137,370,975 · 3주택+ 1,288,352,475)다.

**구현 — 배제 사유를 leaf가 아니라 호출부가 판단한다**

`calcLongTermRate`의 4번째 인자를 `isUnregistered` → **`lthdExcluded`**로 일반화했다.
§95②의 두 배제 사유는 **적용 범위가 다르기 때문**이다:

| 사유 | 범위 | calcLongTermRate 호출 지점 |
|---|---|---|
| §104③ 미등기 | 자산 **전체** | 12곳 전부 |
| §104⑦ 각 호 | **주택**(+딸린 토지) 한정 | 주택 **6곳만** |

leaf는 boolean만 받고, 어느 사유가 걸리는지는 각 파트 빌더가 정한다:

| 계열 | 인자 | 지점 |
|---|---|---|
| 주택 | `isUnregistered \|\| surchargeLthdExcluded` | `-helpers.ts:508·514·534·535` · `-period-split.ts:207·214` |
| 상가 | `isUnregistered`만 | `-helpers.ts:579·580·586` · `-period-split.ts:223·235` |
| 비사토 | `isUnregistered`만 | `-totals.ts:26` |

**술어 — `surchargeApplicable`이 아니다**:

```ts
surchargeLthdExcluded =
  multiHouseSurcharge?.surchargeType !== "none" && !multiHouseSurcharge.isSurchargeSuspended
```

- **2008 위기취득**(부칙 §9270호 §14①): `surchargeApplicable === false`지만 `surchargeType`은
  유지 → §104⑦ 각 호 해당 자산인 것은 변함없다 → **장특 배제 존속**(B-B7).
- **한시 유예**(§167의3①12의2): 각 호에서 빼주는 것 → **장특 부활**(B-B6).
- 단건 정본도 같은 조합이다(`transfer-tax-helpers.ts:458-461` `isSurcharge && !isSuspended`).

**anchor +7** — B-B5(주택 0·상가 >0) · B-B5b · B-B6(유예) · B-B7(2008위기) ·
B-B8(비조정) · B-B9(미주입) · B-B10(비사토 유지). B-B3b는 「중과 비대상이면 불변」으로 **갱신**.

**검증**: `tsc` 0 · `eslint` **0 error** · 전체 **1,130파일 12,686건 통과 · 회귀 0**(12,679 → +7).

**파일 크기**: `transfer-tax-mixed-use.ts` 699 → **719**. 800 트리거 미달이나 B3에서
`-totals.ts`(172줄, 여유 충분)에 세율 로직이 들어가므로 오케스트레이터 증가는 제한적이다.

---

## 6. 케이스 매트릭스

`R` = 취득시 조정지역 · `Res` = 거주연수 · `H` = 세대 주택수 · `Reg` = 양도시 조정지역

| # | R | Res | H | Reg | 보유 | 현행 | 정정 후 | Phase |
|---|---|---|---|---|---|---|---|---|
| M1 | ✗ | 0 | 1 | — | 30년 | 비과세 | **불변** | A(회귀) |
| M2 | ✓ | 0 | 1 | — | 30년 | 비과세 | **비과세 배제** (+372,298,395) | A |
| M3 | ✓ | 3 | 1 | — | 30년 | 비과세 | **불변**(거주 충족) | A |
| M4 | ✓ | 0 | 1 | — | 30년 | 비과세 | **불변** — 단서 2호가(수용) | A |
| **M4b** | — | 0 | 1 | — | **1년** | 🔴 **과세**(P3a 결함) | **비과세 유지** — 단서 2호가가 보유요건도 면제(§2.5·E-3) | **A** |
| M5 | ✓ | 0 | 1 | — | 30년 | 비과세 | **불변** — 2017-08-03 이전 취득 경과규정 | A |
| M6 | ✓ | 0 | 1 | — | 1년 | 과세(P3a) | **불변** — 단서 **미입력**이면 보유 미충족 배제 유지 | A(회귀) |
| M7 | — | — | 2 | ✓ | 30년 | 과세·중과✗ | **중과 +20%p·장특 0** (+451,766,149) | B |
| M8 | — | — | 3 | ✓ | 30년 | 과세·중과✗ | **중과 +30%p·장특 0** (+602,747,649) | B |
| M9 | — | — | 2 | ✗ | 30년 | 과세·중과✗ | **불변**(비조정) | B(회귀) |
| M10 | — | — | 2 | ✓ | 30년 | 과세 | **불변** — 양도일 ≤ 2026-05-09 한시유예 | B |
| M11 | — | — | 2 | ✓ | 1년 | 단기 70%(P3b) | **MAX(중과, 단기 70%)** — §104⑦ 후단 | B |
| M12 | — | — | 2 | ✓ | 30년 | 과세 | 세율 배제·**장특은 배제 유지** — 2008위기취득 | B |
| M13 | — | — | 2 | ✓ | 30년 | 과세 | **장특 배제만 적용 · 세율 가산 보류 + warning** — 배율초과 비사토 동반(§5.5) | B |
| M14 | ✓ | 0 | 2 | ✓ | 30년 | 과세(비과세는 이미 배제) | **중과만 추가** — A는 무영향 | A·B 교차 |

> M14가 A·B의 관계를 규정한다. 두 결함은 **시나리오가 배타적**이다 —
> A는 「1주택인데 비과세가 과도」, B는 「다주택이라 비과세는 이미 배제, 중과만 결손」.
> 묶는 근거는 시나리오 공유가 아니라 **배관·의존**(§0)이다.

---

## 7. Phase

| Phase | 내용 | 산출 | 선행 |
|---|---|---|---|
| **0** | 선행 계획서 §D-4·§D-9-R의 「14지점」 서술에 역참조 각주 | 문서 1개 | — |
| **A** | E-1 거주요건 **+ E-3 단서 면제(과다과세 정정)** — ⑭ 주입 3필드 + `ExemptionReqInput` narrowing + 정본 `meetsOneHouseHoldingResidence` **단일 호출로 교체** + warning | anchor B-A1~A8 | 0 |
| **B1** | E-2 배관 — ⑭ `multiHouse` 주입 + 엔진 정본 판정 | anchor B-B1~B3 | A |
| **B2** | E-2 §95② 주택분 장특 배제 (6곳) | anchor B-B4~B6 | B1 |
| **B3** | E-2 세율 — `surchargeAddon` + §104⑦ 후단 MAX | anchor B-B7~B10 | B2 |
| **B4** | 범위 밖 조합 warning(§5.5) + 결과 표시 echo | anchor B-B11 | B3 |

**B를 3단으로 쪼개는 이유**: 장특 배제(B2)와 세율(B3)은 **각각 독립적으로 세액을 바꾼다**.
한 커밋에 묶으면 anchor가 깨졌을 때 어느 쪽인지 분리되지 않는다.
E-2 실측에서 차액의 절반 이상이 장특에서 나온 것이 그 근거다(§3 E-2).

---

## 8. Pre-Do anchor (Do 착수 전 · memory `feedback_pre_anchor_verification`)

> 전부 **RED 확인 후** 구현. 파일: `__tests__/tax-engine/transfer/mixed-use-residence-surcharge.anchor.test.ts`

### Phase A

| ID | 고정 대상 | 기대 |
|---|---|---|
| B-A1 | M2 — 조정취득·거주0 | `total.transferTax === 685_604_826` · `housingPart.isExempt === false` |
| B-A2 | M1 — 비조정취득·거주0 | 현행값 **불변**(회귀) |
| B-A3 | M3 — 조정취득·거주3년 | 비과세 유지 |
| B-A4 | M4 — 단서 2호가(수용, 수용일 ≤ 양도일+5년) | 비과세 유지 · 단서 미입력이면 **미적용**(fail-closed, `transfer-tax-exemption.ts:83-88` 규약) |
| B-A5 | 동일세대 상속 통산 | 정본 단독 계산과 **동일값** — 이중 통산 부재(§4.5) |
| B-A6 | 거주 23개월 / 24개월 경계 | 미충족 / 충족 — 연 절사가 결론을 바꾸지 않음(§4.5) |
| **B-A7** 🔴 | **M4b** — 단서 2호가(수용) + **보유 1년** | **비과세 유지**(`housingPart.isExempt === true`). **E-3(기시행 과다과세) 노출 anchor** — 현재 RED |
| **B-A8** | 단서 **미입력** + 보유 1년 | 비과세 배제 — P3a 동작 **불변**(B-A7이 게이트를 과도하게 열지 않았음을 반증) |

### Phase B

> 🔴 **필수 — `makeMockRatesWithHouseEngine()`을 쓸 것.** `makeMockRates()`
> (`mock-rates.ts:13-194`)에는 `transfer:special:house_count_exclusion` 레코드가 **없고**
> 그 키는 `makeMockRatesWithHouseEngine()`(`:195~`, 레코드는 `:224`)에만 있다.
> `parseRatesFromMap`이 이를 optional로 넘기므로 **예외가 나지 않고**
> `houseCountExclusionRules === undefined` → §5.2 가드가 `mhResult = undefined` →
> **중과가 통째로 스킵된 채 anchor가 조용히 GREEN**이 된다.
> Phase B에서 가장 위험한 실패 모드다. 각 anchor는 `mhResult`가 실제로 만들어졌음을
> (`surchargeType !== undefined`) **먼저 단언**한다.

| ID | 고정 대상 | 기대 |
|---|---|---|
| B-B1 | M7 — 2주택·조정 | `mhResult.surchargeType === "multi_house_2"` · `surchargeApplicable === true` |
| B-B2 | M9 — 2주택·비조정 | 현행값 **불변**(회귀) |
| B-B3 | `multiHouse` 미주입 | 현행값 **불변** — 전체 회귀 방어 |
| B-B4 | M7 장특 | `housingPart.longTermDeductionRate === 0` **그리고** `commercialPart` 장특 **> 0** |
| B-B5 | M12 — 2008위기취득 | 세율 가산 0 **그러나** 주택 장특 0 (술어 구분 §5.3) |
| B-B6 | M10 — 한시유예 중 양도(2026-05-09) | 장특 **유지** · 세율 가산 0 |
| B-B7 | M7 총액 | `transferTax === 1_137_370_975` |
| B-B8 | M8 총액 | `transferTax === 1_288_352_475` |
| B-B9 | M11 — 보유 1년·2주택 | `MAX(중과, 단기 70%)` — 채택된 쪽을 값으로 고정 |
| B-B10 | M7 §104⑤ | 주택 `104-7-1`·상가 `104-1-1` — **단서 합산 없음**(파트별 누진공제 각 1회) |
| B-B11 | M13 — 비사토 동반 | 주택 장특 **0**(§95② 적용) · 세율 가산 **0** · `warnings`에 세율 미반영 문구. 세액은 **불변이 아니다** |

> B-B7·B-B8은 §3 E-2의 손계산값이다. **구현 후 엔진 실측과 대조**해 불일치하면
> 계획서 수치가 아니라 **법령 정합을 우선**해 정정한다(memory `feedback_anchor_correction_legal_priority`).

---

## 9. 14 동기화 지점 — 실제 필요 지점

§1.5의 정정 결과. **①~⑬은 변경 없음.**

| 지점 | 필요 | 비고 |
|---|---|---|
| ①②③ 폼·initial·normalize | ✗ | top-level 기존 필드 |
| ④ API 변환 | ✗ | `transfer-tax-api.ts:347·352·354·407·435·443-462` 기존 전송 |
| ⑤ UI 위젯 | ✗ | `Step4.tsx:354` 게이트 통과(실측) |
| ⑥ 사이드바 | ✗ | 금액 항목 아님 |
| ⑦ 결과 카드 | **△** | 중과 적용·장특 배제 사유 **표시** 필요(B4) — `feedback_engine_result_display_drift` |
| ⑧ validate | ✗ | 신규 입력 없음 |
| ⑨⑩ Zod enum | ✗ | 기존 |
| ⑪ 자산-수준 fallback | ✗ | 해당 없음 |
| ⑫ Zod 입력 객체 | ✗ | **top-level은 이미 정의됨**. `mixedUseAssetSchema`에는 넣지 않는다 — route가 top-level에서 주입하므로 |
| ⑬ fetch body spread | ✗ | 기존 |
| **⑭ route → 엔진 input** | ✅ **유일 결손** | A: 3필드 · B: `multiHouse` 1객체 |

> ⑫에 대한 주의 — `mixedUseAssetSchema`(`transfer-tax-schema-mixed-use.ts:37`)에 같은 이름을
> **중복 정의하지 말 것**. 클라이언트는 `mixedUse` 안에 이 값들을 넣지 않으므로 정의해도 항상
> undefined이고, 「어느 쪽이 진실인가」가 흐려진다(단일 진실 — `feedback_ui_engine_dual_truth_avoidance`).

---

## 10. 리스크

| ID | 리스크 | 근거·완화 |
|---|---|---|
| R-1 | 기존 겸용 anchor 회귀 | `calcMixedUseTransferTax`를 부르는 테스트 **16파일 전수**에 `householdHousingCount`·`isRegulatedArea`·`surchargeType`·`multiHouse` 참조 **0건**(grep 실측). 신규 필드 미주입 시 전 경로 종전과 동일 → **B-B3·B-A2가 고정**. P4에서 같은 예측이 적중했다 |
| R-2 | 장특 배제를 상가분까지 확대 | §5.3 — `isUnregistered`와 **다른 파라미터**로 분리. B-B4가 상가 장특 > 0을 명시 검증 |
| R-3 | `surchargeApplicable` ↔ 장특 배제 술어 혼동 | 세율은 `surchargeApplicable`, 장특은 `surchargeType!=="none" && !isSuspended`. **다른 술어**다. B-B5·B-B6이 양방향 고정 |
| R-4 | Zod string 날짜가 `oneHouseExemptionProviso`·`marriageMerge`에 침묵 유입 | §4.2·§5.1 — `engineInput`에서 변환본 사용. `lib/api/date-coerce.ts` 규약 |
| R-5 | 이중 통산(§4.5) | B-A5가 정본 단독 계산과 대조 |
| R-6 | `transfer-tax-mixed-use.ts` 800줄 초과 | 현재 635. 중과 판정을 신규 파일로 분리(§5.6). Do 착수 시 실측 재확인 |
| R-7 | E-2 손계산값(B-B7·B-B8)이 엔진과 불일치 | §8 각주 — 법령 정합 우선으로 정정, 계획서 수치를 맞추려 구현을 비틀지 않는다 |
| R-8 | 브라우저 수동 확인 미수행 | 선행 세션 전체가 미수행 상태. ⑦ 표시(B4) 작업 시 함께 실시 |
| **R-9** 🔴 | **Phase B anchor가 침묵 GREEN** — mock에 `house_count_exclusion`이 없으면 중과가 스킵되는데 예외가 안 난다 | §8 Phase B 주의 — `makeMockRatesWithHouseEngine()` 강제 + 각 anchor가 `mhResult` 생성 여부를 선단언 |
| **R-10** | E-3 정정이 비과세를 **과도하게 열어** 다른 케이스를 놓아줌 | 단서 각호는 각자 시한·거주요건을 갖고 정본이 이미 검증한다(수용일 미입력 → fail-closed, `transfer-tax-exemption.ts:83-88`). B-A8이 「단서 없으면 여전히 배제」를 반증으로 고정 |

---

## 11. 미검증 레지스트리

| ID | 항목 | 상태 |
|---|---|---|
| U-1 | 국세청 해석 217202(2023-02-15) 「중과세율이 적용되는 상가겸용주택의 주택 및 주택 부수토지 계산방법」 **본문** | 🔶 조회 불가(법제처 API 미제공·SPA). 제목만 확인. 설계 근거는 §104⑦ 법문 |
| U-2 | 겸용주택 상가분 중과 제외에 대한 **직접 유권해석** | 🔶 본문 미확보. **법문 2중 근거로 판단** — ① 법 §104⑦ 대상이 「주택(이에 딸린 토지를 포함한다)」(§2.1) ② 영 §154③의 「전부를 주택으로 본다」는 **「법 §89①3호를 적용할 때」로 명시 한정**되어 §104⑦에 준용되지 않는다(§2.6) |
| U-3 | 배율초과 비사토 동반 겸용의 중과(§5.5) | 🛑 선행 D-8(세무 판단 대기)에 종속. 과소과세 방향 |
| U-4 | 겸용 §154① **단서 5호**(공고전계약, "residence_only") 실동작 | 🔶 정본에 있으나 겸용 anchor 미구성. Phase A에서 B-A4와 함께 시도 |
| U-5 | 다주택자 겸용주택의 주택분/상가분 **분리계산 자체**의 근거 | 🔶 영 §160①단서는 1세대1주택 고가주택 맥락. 다주택 분리는 §104⑦·§95②가 주택분만 지목하는 데서 도출. **현행 엔진의 기존 전제이며 이 계획서가 바꾸지 않는다** |
| U-6 | 중과 대상 주택의 §95② 배제와 **표2**(1세대1주택) 관계 | ✅ 배타 — 중과는 다주택 전제, 표2는 1세대1주택 전제. 동시 성립 불가 |
| U-7 ✅**확정** | **별건 결함(범위 밖)** — `multiHouseTemporaryTwoHouse`가 저장소 전체에서 정의·소비 2곳뿐이고 **route가 채우지 않는다**. 단건 중과 판정의 일시적2주택 입력이 상시 `undefined`일 가능성 | 🔶 미확인 · **이 계획서 범위 밖**. 사실이면 단건 경로 결함이므로 별도 조사 필요 |

---

## 12. 이력

| 버전 | 일자 | 내용 |
|---|---|---|
| **v1.5** | 2026-07-31 | **Phase B2 완료**(§5.8-R) — §95② 주택분 장특 배제. +204,162,524. `calcLongTermRate` 4번째 인자를 `lthdExcluded`로 일반화하고 **주택 6곳 / 상가·비사토 6곳**으로 범위를 갈랐다. 술어는 `surchargeType !== "none" && !isSuspended`(2008위기취득은 세율만 배제·장특 존속). 결과 889,767,350이 §3 E-2 손계산 **1호와 원 단위 일치** — 교차 검증됨. anchor +7 · 12,686건 회귀 0 |
| **v1.4** | 2026-07-31 | **Phase B1 완료**(§5.7-R) — 중과 판정 배관, 세액 불변. Zod string 날짜 함정이 `houses`에도 있었다(계획서는 `gracePeriod`만 지적 — tsc가 방어). `makeMockRatesWithHouseEngine()`가 **유예를 끄는** 두 번째 mock 함정 발견. U-7(`multiHouseTemporaryTwoHouse` 미배선) **사실 확정** — 형상이 아예 다르고 아무도 안 채운다. anchor 8건 · 12,679건 회귀 0 |
| **v1.3** | 2026-07-31 | **Phase 0·A 구현 완료**(§4.6-R). anchor가 계획서 수치를 뒤집었다 — CASE14 건물 취득일(1997)이 §154① 거주요건 **경과규정**(2017-08-03 이전 취득 면제) 안이라 거주요건을 검증할 수 없어, anchor는 2018-06-01로 덮어쓰고 전 수치를 재실측했다. E-1 +438,011,837 · **E-3 −838,560,493**(과다과세 해소). anchor 14건 · 12,671건 회귀 0 |
| **v1.2** | 2026-07-31 | **2차 자가 검토 — 설계 결함 1건·Do-blocker 1건 발견**. ① 🔴 **E-3 신설**: 영 §154① 단서 1~3호가 「**보유기간 및** 거주기간의 제한을 받지 않는다」(법제처 실측, 시행령 MST 286211)는데 **이미 머지된 P3a**가 이를 무시 → 겸용 1주택+수용+보유2년미만에서 **과다과세**. `provisoGate`가 겸용에도 단서를 전송하므로 도달 가능. ② §4.4를 「거주 축 AND 추가」에서 **「정본 `meetsOneHouseHoldingResidence` 단일 호출로 교체」**로 재설계(단서가 `meetsHolding` 내부에 있어 AND 구조로는 못 고침) + `ExemptionReqInput` 타입 narrowing. ③ 🔴 **R-9**: Phase B anchor가 `makeMockRates()`를 쓰면 `house_count_exclusion` 부재로 중과가 스킵되는데 **예외가 안 나 침묵 GREEN**. ④ §2.6 영 §154③ 적용범위 한정 확인(U-2 보강). ⑤ anchor B-A7·B-A8, 매트릭스 M4b 신설 |
| v1.1 | 2026-07-31 | 자가 검토 — 인용 6건 정정(`calcLongTermRate` 정의 위치·`resolveExemptionResidenceMonths` line·겸용 테스트 8→**16파일**) + 논리 모순 3건 정정(§5.5 §95② 장특 배제는 nonBiz 경계와 **무관** · M13/B-B11 「세액 불변」 철회 · §5.1 `gracePeriod` 변환본 필수) + U-7 별건 의심 등록 |
| v1.0 | 2026-07-31 | 최초 작성. 선행 계획서 D-4·D-9 잔여 분리. **선행 「14지점 전부」 전제 실측 반박**(§1). §104⑦·§95② 법문 확인. E-1 +372,298,395 · E-2 +451,766,149(2주택)·+602,747,649(3주택+) 실측 |
