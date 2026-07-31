# 다주택 중과 — 영 §167의10①15호(§155 의제) 커버리지 + 일시적 2주택 배관 — v1.2

> 선행 계획서 [`transfer-mixed-use-residence-surcharge.plan.md`](./transfer-mixed-use-residence-surcharge.plan.md) §11 **U-7**에서
> 파생. 조사 결과 「배관 한 줄 누락」이 아니라 **설계 이슈**로 확인되어 별도 문서로 분리한다.
>
> **주 적용 대상은 일반 단건 양도세 경로**다. 겸용은 중과 입력을 `MixedUseAssetInput.multiHouse`
> 서브객체로 따로 받으므로 **자동 파급되지 않는다** — Phase B2가 별도로 배선한다(S-5 정정).
>
> **작성 원칙**: 인용 file:line은 실제 파일 대조, 수치는 throwaway probe 실행 실측.
> 미확인은 🔶로 명시하고 단정하지 않는다(CLAUDE.md 검증 기준).

---

## 0. 발단

선행 계획서 Phase B1에서 겸용주택에 중과 판정을 배선하다가,
`MultiHouseSurchargeInput.temporaryTwoHouse`(`{previousHouseId, newHouseId}`)와 route가 Date
변환해 두는 `engineInput.temporaryTwoHouse`(`{previousAcquisitionDate, newAcquisitionDate}`)의
**형상이 아예 다르다**는 것을 발견했다. 값을 채워야 할 `multiHouseTemporaryTwoHouse`를 추적한
결과 **아무도 채우지 않는다**.

조사 과정에서 결함이 셋으로 늘었고, 근거 조문도 엔진 구현과 다르다는 것이 드러났다.

---

## 1. 검증된 법령

법제처 Open API 실측 · 2026-07-31 조회 · 「소득세법 시행령」 MST 286211 · 시행 2026-07-01.

### 1.1 §167의10①15호 — §155 의제 전반이 중과 제외

> ① 법 제104조제7항제1호에서 "대통령령으로 정하는 1세대 2주택에 해당하는 주택"이란 …
> 다음 각 호의 어느 하나에 **해당하지 않는** 주택을 말한다.
> …
> **15. 제155조** 또는 「조세특례제한법」에 따라 1세대가 국내에 1개의 주택을 소유하고 있는 것으로
> 보거나 **1세대 1주택으로 보아 제154조제1항이 적용되는 주택으로서 같은 항의 요건을 모두 충족하는 주택**

**§167의3①13호가 문구까지 동일**하다 — 즉 **3주택 이상에도 같은 배제**가 있다.

⇒ 15호는 **2요소 판정**이다: ① §155(또는 조특법)에 따른 **1세대1주택 의제 성립** ②
**§154① 요건 모두 충족**. 엔진의 배제 2(혼인)가 정확히 이 구조로 구현돼 있다
(`multi-house-surcharge-exclusion.ts:264-286` — `sellingHouseMeetsOneHouseRequirements` 게이트).

### 1.2 §167의10①에 **일시적 2주택 전용 호는 없다**

각 호를 전수 확인했다. 1호(지방 3억)·2호(§167의3①2~8호·8호의2 준용)·3호(부득이 다른 시군)·
4호(§155⑧ 수도권 밖)·7호(소송)·9호(1억)·10호(유일 1주택)·11호(공고전계약)·12호·12의2(한시배제)·
15호(§155 의제). **5·6·8·13·14호는 삭제**됐다.

⇒ 일시적 2주택(§155①)의 중과 제외 근거는 **15호뿐**이다.
그런데 엔진의 배제 1은 §155①의 기한 요건을 **자체 재구현**하고 있다(§2 F-2).

### 1.3 §155① 본문 — 현행은 「3년」 단일

> ① … 종전의 주택을 취득한 날부터 **1년 이상**이 지난 후 신규 주택을 취득하고 신규 주택을 취득한
> 날부터 **3년 이내**에 종전의 주택을 양도하는 경우 … 1세대1주택으로 보아 제154조제1항을 적용한다.

**현행 법문에 조정대상지역 구분이 없다.** 조정지역 단축 기한(1년·2년)은 과거 개정분이며,
엔진은 DB 규칙(`temporary_two_house`)에 단일 값으로 갖고 있다 — §2 F-3의 배경.

### 1.4 §155 각 항의 「1세대1주택 의제」 — 15호 대상 목록

| 항 | 내용 | 의제 문구 |
|---|---|---|
| ① | 일시적 2주택 | "이를 **1세대1주택으로 보아** §154① 적용" |
| ② | 상속주택 + 일반주택 → 일반주택 양도 | "1개의 주택을 소유하고 있는 것으로 보아" |
| ③ | 공동상속주택 | "해당 거주자의 **주택으로 보지 아니한다**" (주택 수 제외 — 의제와 구조가 다름) |
| ④ | 동거봉양 합가 **10년** | "1세대1주택으로 보아" |
| ⑤ | 혼인 합가 **10년** | "1세대1주택으로 보아" |
| ⑥ | 국가유산주택 + 일반주택 | "1개의 주택을 소유하고 있는 것으로 보아" |
| ⑦ | 농어촌주택(상속·이농·귀농) + 일반주택 | "1개의 주택을 소유하고 있는 것으로 보아" |
| ⑧ | 부득이한 사유 **수도권 밖** 주택 + 일반주택 | "1개의 주택을 소유하고 있는 것으로 보아" |
| ⑯\* | 공공기관 지방이전 — ①의 "3년"→**"5년"** | ① 연장 |
| ⑳ | 장기임대주택·장기어린이집 + **거주주택** | "1개의 주택을 소유하고 있는 것으로 보아" |

\* 법제처 API 응답이 ⑯ 이후 항번호를 렌더하지 않아 **순서로 역산**했다:
⑮(다가구) → ⑯(공공기관 이전) → ⑰(삭제) → ⑱(§89①4호나목 사유) → ⑲(협의분할) → ⑳(장기임대 거주주택).
끝의 ⑳이 프로젝트 기존 표기(§155⑳)와 일치하므로 역산이 검증된다.

---

## 2. 결함 실측

### F-1 🔴 `multiHouseTemporaryTwoHouse`를 **아무도 채우지 않는다** (U-7 본체)

grep 전수(저장소 전체, node_modules·.next 제외) — **4곳뿐**:

| 위치 | 역할 |
|---|---|
| `lib/tax-engine/types/transfer.types.ts:266` | 타입 정의 |
| `lib/tax-engine/transfer-tax.ts:195` | 소비 (→ `MultiHouseSurchargeInput.temporaryTwoHouse`) |
| `__tests__/tax-engine/transfer-tax/multi-house-and-nbl.test.ts:78` | **테스트만** 주입 |
| `lib/tax-engine/types/transfer-mixed-use.types.ts:169` | 주석(선행 계획서 기록) |

**프로덕션 설정 0곳.** route(`app/api/calc/transfer/route.ts`)는 이름이 다른
`temporaryTwoHouse`(§155① 비과세용, `:163-167`)만 채운다.

⇒ `multi-house-surcharge-exclusion.ts:245-262`의 **일시적 2주택 중과배제 분기 전체가 잠들어 있다.**
테스트는 직접 주입하므로 GREEN이라 **테스트가 결함을 가린다**.

**실측** (2026-06-01 양도 · 조정대상지역 · 2주택 · 종전주택 양도):

| 시나리오 | 현행(미도달) | 정정(도달) | 차액 |
|---|---:|---:|---:|
| 중과 효과 **격리 측정**\* | 777,435,000 | 424,335,000 | **+353,100,000** |
| **§155① 비과세 동반**(실제) | 284,910,000 | 147,780,000 | **+137,130,000 (93%)** |

\* 첫 행은 §155① 비과세 입력(`temporaryTwoHouse`)을 빼고 중과 효과만 분리한 값이다.
프로덕션에서는 두 입력이 같은 폼 토글에서 파생되므로 **이 상태 자체는 발생하지 않는다** —
규모 감각용이며 anchor로 쓰지 않는다.

두 번째가 현실 시나리오다 — §155① 비과세가 적용돼 12억 초과분만 과세되는데
**그 초과분에 중과 +20%p가 붙고 §95② 장특이 배제**된다. 비과세 특례를 받는 납세자에게
중과를 물리는 모순이며, **과다과세** 방향이라 memory
`feedback_no_unfavorable_application_without_legal_basis`를 정면으로 위반한다.

**도달 조건**: 중과 한시배제(2022-05-10 ~ **2026-05-09**)가 **종료**됐으므로
2026-05-10 이후 양도부터 현재 진행형이다.

### F-2 🔴 배제 1의 기한 규칙이 §155① 정본과 **3중 드리프트** — 배관만 고치면 모순이 남는다

| | §155① 비과세 정본 (`transfer-tax-exemption.ts:341-352`) | 중과 배제 1 (`multi-house-surcharge-exclusion.ts:251`) |
|---|---|---|
| 조정지역·완화 전 기한 | **2년** (`regulatedAreaDeadlineYears`, DB) | **1년** (하드코딩) |
| 완화 판정 축 | **양도일** ≥ 2022-05-10 | **신규주택 취득일** < 2022-05-10 |
| 규칙 소스 | DB `tax_rates` | 소스코드 상수 |

```ts
// 중과 배제 1 — multi-house-surcharge-exclusion.ts:251
const deadlineYears = isRegulated && newHouse.acquisitionDate < relaxDate ? 1 : 3;
```

**실측** (프로덕션 seed 값 주입 · 조정대상지역 · 2주택):

| 신규취득 · 양도 | §155① 비과세 | 중과 배제 | 산출세액 |
|---|---|---|---:|
| **2020-06-01 · 2022-01-01** | **O** (일시적 2주택 고가주택) | **X** (`multi_house_2` 적용) | **284,910,000** |
| 2021-01-01 · 2022-01-01 | O | O | 156,100,000 |

**차액 128,810,000.** 「비과세는 되는데 중과 배제는 안 되는」 모순이 실재한다.

⇒ **배관만 연결하면 결함을 다른 결함으로 바꾸는 것이다.** 15호가 요구하는 것은
「§155에 따라 1세대1주택으로 **보는** 주택」이므로, 중과 배제는 §155① 판정을 **재구현하지 말고
그 결과를 받아야** 한다.

### F-3 🔴 테스트 mock이 프로덕션 seed와 다르다 — **F-2를 가리고 있었다**

| | `regulatedAreaDeadlineYears` |
|---|---|
| 프로덕션 seed (`lib/tax-engine/data/transfer-rate-seed.ts:121-125`) | **2** |
| 테스트 mock (`__tests__/tax-engine/_helpers/mock-rates.ts:126-131`) | **1** |

mock의 1년이 배제 1의 하드코딩 1년과 **우연히 일치**해 드리프트가 테스트에서 보이지 않았다.
mock을 seed 값으로 교체한 뒤에야 F-2가 재현됐다.

> 이는 F-2와 **독립된 문제**다 — 어떤 규칙이든 mock이 프로덕션과 다르면 테스트는
> 실제 동작을 대표하지 못한다. 다른 규칙에도 같은 불일치가 있는지 별도 점검이 필요하다(Phase C).

**부수 관찰(🔶 미확인)**: 현행 §155① 법문은 「3년」 단일이고 조정지역 구분이 없다(§1.3).
`regulatedAreaDeadlineYears`는 과거 개정분(2년·1년)인데 **단일 값**이라 시기별 구분을 못 한다.
과거 양도(수정신고·경정청구)의 판정 정확도에 영향이 있을 수 있다.

### F-5 🔶 §155① 본문의 「제18항에 따른 사유」가 **전 저장소 미구현**

§155① 본문 괄호:

> … 신규 주택을 취득한 날부터 3년 이내에 종전의 주택을 양도하는 경우
> **(제18항에 따른 사유에 해당하는 경우를 포함한다)** …

§155⑱은 「다른 주택을 취득한 날부터 3년이 되는 날 현재」 ① 캠코 매각 의뢰 ② 법원 경매 신청
③ 공매 진행 중 ④ 정비사업 현금청산 소송 진행·미지급 ⑤ 수용재결·매도청구소송 진행·미지급
— 즉 **3년 기한의 예외(연장)** 사유다.

grep 전수(전 저장소) 결과 **0건**이다. 유일한 히트는 비사업용 토지 §83의5②1호 캠코 매각위임
(`components/calc/transfer/nbl/DeemedTransferSection.tsx:23`)으로 **다른 조문**이다.

⇒ 3년을 넘겼으나 ⑱ 사유가 있는 납세자는 **§155① 비과세도, 중과 배제도 못 받는다** — 과다과세.
**이 계획서의 직접 범위 밖**(§155① 비과세 자체의 갭)이나, Phase B가 §155① 판정을 중과 배제의
단일 소스로 만들면 **한 번의 수정으로 양쪽에 반영**되는 위치에 놓인다.

### F-4 🔶 §167의10①15호 커버리지 매트릭스 — 절반이 미확인

| §155 항 | 중과 배제 경로 | 상태 |
|---|---|---|
| ① 일시적 2주택 | 배제 1 `temporary_two_house`(`:245`) | 🔴 **F-1 미도달 + F-2 드리프트** |
| ② 상속주택 | ⑦ 상속 5년 (`:53`·`:75`, §167의3①7호) + 주택수 제외(`count.ts:288-295`) | ✅ 구현 |
| ③ 공동상속 | `isCoInherited`·`isLargestCoInheritedShareholder` 속성 존재 | 🔶 동작 미확인 |
| ④ 동거봉양 | 배제 3 `parental_care_merge`(`:292`) | ✅ 구현 |
| ⑤ 혼인 | 배제 2 `marriage_merge`(`:280`) — **15호 근거 명시** | ✅ 구현 |
| ⑥ 국가유산 | `cultural_heritage`(`:343`) — 단 §167의3①6호(주택 **자체** 양도) 근거 | 🔶 §155⑥(일반주택 양도) 방향 미확인 |
| ⑦ 농어촌주택 | 발견 못함 | 🔶 **미확인** |
| ⑧ 수도권 밖 부득이 | §167의10①**4호**. `isUnavoidableReason`은 **3호**(다른 시군)용 | 🔶 **미확인 — 별개 호** |
| ⑯ 공공기관 이전(3→5년) | 발견 못함 | 🔶 **미확인** |
| ⑳ 장기임대 거주주택 | 직접 연결 발견 못함(`count.ts:175` 주석뿐) | 🔶 **미확인** |

> ⚠️ 「미확인」은 **결함이라는 뜻이 아니다.** 다른 호(2호 준용 등)로 커버되거나 주택 수 산정
> 단계에서 흡수될 수 있다. Phase C가 각 셀을 실측으로 닫는다.

---

## 3. 설계

### 3.1 원칙 — 15호의 2요소를 그대로 옮긴다

```
15호 = ① §155 의제 성립  AND  ② §154① 요건 모두 충족
```

②는 이미 있다 — `sellingHouseMeetsOneHouseRequirements`(`transfer-tax.ts:201`,
`meetsOneHouseHoldingResidence` 결과)를 배제 2가 쓴다.
**①을 넘겨야 한다.** 배제 1이 기한을 재계산하는 현재 구조를 폐기한다.

### 3.2 🔴 제약 — 중과 판정이 비과세 판정보다 **먼저** 실행된다

| STEP | 위치 |
|---|---|
| **0.5 다주택 중과 판정** | `transfer-tax.ts:182` |
| 1 비과세 판단 `checkExemption` | 호출 `transfer-tax.ts:264` (정의는 `transfer-tax-exemption.ts:274`) |

⇒ `checkExemption`의 결과를 중과에 넘길 수 없다. **§155① 타이밍 판정을 STEP 0.5 앞으로 선판정**해야
한다. 배제 2가 `meetsOneHouseHoldingResidence`를 STEP 0.5 안에서 precompute하는 것과 **같은 패턴**이다.

다행히 순수 함수가 이미 분리돼 있다:

```ts
// transfer-tax-exemption.ts:254 — UI(Step4 판정 카드)와 엔진 공용 단일 소스
export function judgeTemporaryTwoHouseTiming(p: {
  previousAcquisitionDate; newAcquisitionDate; transferDate;
  deadlineYears; oneYearWaived;
}): { …; overall: boolean }
```

**단 `deadlineYears` 산정 로직은 `checkExemption` 안에 인라인**이다(`:341-352`) — 이것도
헬퍼로 추출해야 두 호출부가 같은 값을 쓴다.

### 3.3 배제 1 재설계

```
[신규] resolveTemporaryTwoHouseDeadlineYears(input, twoHouseRule): number
       ← checkExemption:341-352를 그대로 추출 (동작 불변)

STEP 0.5 직전:
  sellingHouseIsDeemedOneHouse =
      input.temporaryTwoHouse
      && judgeTemporaryTwoHouseTiming({ …, deadlineYears: resolve…(…) }).overall

MultiHouseSurchargeInput:
  - temporaryTwoHouse: { previousHouseId, newHouseId }   ← **폐기**
  + deemedOneHouseBy155?: "temporary_two_house"           ← 신규(15호 ① 요소)

배제 1:
  if (effectiveHouseCount === 2
      && input.deemedOneHouseBy155
      && (input.sellingHouseMeetsOneHouseRequirements ?? true))   ← 15호 ② 요소
    → 배제
```

**얻는 것**:
- 기한 규칙이 **단일 소스**가 된다 → F-2 소멸. 「비과세 O / 중과배제 X」가 구조적으로 불가능해진다.
- 주택 ID 매칭이 사라진다 → route가 `houses[]`에서 신규주택을 식별할 필요가 없다(F-1 해소).
- 15호의 ② 요소(§154① 충족)가 **처음으로** 일시적 2주택에도 적용된다 — 현행 배제 1에는 없다.

> ⚠️ **②를 추가하면 배제가 좁아진다**(현행보다 중과가 늘어나는 방향). 법문이 명시적으로
> 「같은 항의 요건을 모두 충족하는 주택」이라 근거가 있으나, **과다과세 방향이므로 anchor로
> 양방향 고정**하고 §5 매트릭스에 별도 행을 둔다.

### 3.4 범위 밖

- `deemedOneHouseBy155`를 union으로 설계해 Phase C의 다른 §155 항이 같은 슬롯을 쓰도록 열어 둔다
  (`"temporary_two_house" | "farm_house" | …`). **이번에는 일시적 2주택만 채운다.**
- §155⑯(공공기관 이전 3→5년)은 `deadlineYears` 산정에 포함되는지 🔶 미확인 — Phase C.

---

## 4. Phase

| Phase | 내용 | 선행 | 상태 |
|---|---|---|---|
| **A** | `resolveTemporaryTwoHouseDeadlineYears` 추출 (**동작 불변 리팩터**) + 기존 anchor로 회귀 확인 | — | ✅ 2026-07-31 |
| **B1** | 배제 1 재설계 — `deemedOneHouseBy155` 도입 · 선판정 배선 · `MultiHouseSurchargeInput.temporaryTwoHouse`와 `TransferTaxInput.multiHouseTemporaryTwoHouse` **동시 폐기** | A | ✅ 2026-07-31 |
| **B2** | **겸용 경로 배선** — `MixedUseAssetInput.temporaryTwoHouse` 신설 + route ⑭ 주입 + 서브엔진 선판정(S-5) | B1 | ✅ 2026-07-31 |
| **C** | 🔍 **감사** — F-4 매트릭스 🔶 6칸을 실측으로 닫는다 + F-3 mock↔seed 전수 대조 | B2 | 미착수 |
| **D** | C 결과에 따른 갭 수정 (범위 미정 — C 완료 후 재계획) | C | 미착수 |

### A·B 구현 결과 (2026-07-31)

**배관에 신규 UI·API 필드가 필요 없었다.** §155① 비과세용 `temporaryTwoHouse`(폼 토글
`temporaryTwoHouseSpecial` + `newHouseAcquisitionDate`)가 이미 ④⑬⑨⑫⑭ 전 구간을 통과하고 있어,
엔진이 그 하나로 의제를 선판정하면 된다. 겸용만 route ⑭ 1줄 주입이 추가됐다.

| 파일 | 변경 |
|---|---|
| `transfer-tax-exemption.ts` | `resolveTemporaryTwoHouseDeadlineYears`(추출) · `evaluateTemporaryTwoHouseTiming`(내부 공용) · `resolveDeemedOneHouseBy155` · `DeemedOneHouseReqInput` 타입 |
| `multi-house-surcharge-exclusion.ts` | 배제 1 재설계 — 기한 재계산 삭제, 15호 2요소 AND. `isRegulated` 파라미터 제거(사용처 소멸) |
| `types/multi-house-surcharge.types.ts` | `temporaryTwoHouse` → `deemedOneHouseBy155` |
| `types/transfer.types.ts` | `multiHouseTemporaryTwoHouse` 폐기 |
| `transfer-tax.ts` · `transfer-tax-mixed-use.ts` | STEP 0.5 선판정 주입 |
| `app/api/calc/transfer/route.ts` | ⑭ `mixedAsset.temporaryTwoHouse` |
| `legal-codes/transfer.ts` | `MULTI_HOUSE.TEMP_TWO_HOUSE_2HOUSE_BASIS` |

**실측 before→after** (fixture: 종전주택 취득 2018-01-01 · 양도가 20억 · 취득가 7억 · 거주 36개월 ·
조정대상지역 2주택 · **seed 규칙**). `lib/` 변경만 stash해 같은 probe로 양쪽을 측정했다.

| # | 현행 | 정정 후 | 차액 |
|---|---:|---:|---:|
| N1 (新 2025-01-01 · 양 2026-06-01) | 284,910,000 | **147,780,000** | −137,130,000 |
| N2 (新 2020-06-01 · 양 2022-01-01 — F-2) | 284,910,000 | **168,580,000** | −116,330,000 |
| N4 (기한 초과) | 777,435,000 | 777,435,000 | 0 |
| N6 (유예 활성) | 147,780,000 `suspended:true` | 147,780,000 `배제` | **0 — 경로만 변경** |
| N7 (§154① 미충족) | 777,435,000 | 777,435,000 | 0 |
| N8 (입력 없음) | 777,435,000 | 777,435,000 | 0 |

N1의 −137,130,000은 §2 F-1 실측과 원 단위로 일치한다. N2는 §5 매트릭스의 156,100,000과 다른데,
그 값은 조사 단계 probe의 **다른 fixture**(양도가·거주기간 상이)에서 나온 것이다 — 위 표가 현행 anchor 기준.

**A를 분리하는 이유**: 헬퍼 추출은 동작이 바뀌면 안 된다. B와 섞으면 회귀 원인이 분리되지 않는다.

---

## 5. 케이스 매트릭스

`Reg` = 조정대상지역 · `新` = 신규주택 취득일 · `양` = 양도일

공통 fixture — 종전주택 취득 2018-01-01 · 양도가 20억 · 취득가 7억 · 거주 36개월.
**N2·N3은 프로덕션 seed 값**(`regulatedAreaDeadlineYears: 2`)에서만 재현된다(F-3).

| # | Reg | 新 | 양 | §155① | §154① | 현행 | 정정 후 | Phase |
|---|---|---|---|---|---|---|---|---|
| N1 | ✓ | 2025-01-01 | 2026-06-01 | 충족 | 충족 | 🔴 중과 적용 284,910,000 | **배제** 147,780,000 (−137,130,000) | B |
| N2 | ✓ | 2020-06-01 | 2022-01-01 | 충족 | 충족 | 🔴 중과 적용 284,910,000 | **배제** 156,100,000 (−128,810,000) | B |
| N3 | ✓ | 2021-01-01 | 2022-01-01 | 충족 | 충족 | 중과 적용 | 배제 | B |
| N4 | ✓ | 2015-01-01 | 2026-06-01 | **미충족**(기한 초과) | — | 중과 적용 | **불변** | B(회귀) |
| N5 | ✗ | — | 2026-06-01 | 충족 | 충족 | 중과 대상 아님 | **불변** | B(회귀) |
| N6 | ✓ | 2025-01-01 | 2026-05-09 | 충족 | 충족 | 유예(`multi_house_2`·suspended) | **세액 불변, 경로 변경** — 배제가 먼저다 | B |
| N7 | ✓ | 2025-01-01 | 2026-06-01 | 충족 | **미충족**(보유 2년 미만) | 중과 적용 | **중과 유지** — 15호 ② 요소 | B |
| N8 | ✓ | — | 2026-06-01 | 입력 없음 | — | 중과 적용 | **불변** | B(회귀) |

> **N6 정정** — 「유예 우선」이 아니다. `determineSurchargeExclusion`은 배제 사유를 먼저 검사하고
> **early-return** 하며(`multi-house-surcharge-exclusion.ts:245-262`), `isExcluded`면
> `determineMultiHouseSurcharge`가 `surchargeType: "none"` · `isSurchargeSuspended: **false**`를
> 반환한다(`multi-house-surcharge.ts:301-313`). 즉 정정 후 **유예 표시가 사라지고 배제 표시로 바뀐다**.
> 세액은 양쪽 모두 중과 미적용·장특 유지라 동일하다(§95② 술어
> `surchargeType!=="none" && !isSuspended`가 두 경로 모두 false).
>
> **N7**은 §3.3의 「배제가 좁아지는」 방향이다. 현행은 배관 미도달이라 **우연히** 같은 결론에
> 도달하지만, 배관이 살아나면 §154① 게이트가 없는 한 N7도 배제될 것이다 — 15호 법문대로 막는다.

---

## 6. Pre-Do anchor

> 전부 **RED 확인 후** 구현. `__tests__/tax-engine/transfer-tax/temporary-two-house-surcharge.anchor.test.ts`

### Phase A (동작 불변)

| ID | 고정 대상 | 기대 |
|---|---|---|
| T-A1 | 추출 전후 `deadlineYears` | 조정✓/✗ × 양도일 완화 전/후 4조합 **동일값** |
| T-A2 | 기존 §155① 비과세 anchor 전체 | **불변** |

### Phase B

| ID | 고정 대상 | 기대 |
|---|---|---|
| T-B1 | N1 (新 2025-01-01 · 양 2026-06-01) | 중과 배제 · `exclusionReasons[0].type === "temporary_two_house"` · 산출 **147,780,000** |
| T-B2 🔴 | **N2** (F-2 드리프트) | **배제** — 「비과세 O / 중과배제 X」 소멸 |
| T-B3 | N4 | 배제 **없음** · 중과 유지(회귀) |
| T-B4 | N5 | 비조정 → 중과 대상 아님(회귀) |
| T-B5 | N6 | **배제 우선** — `surchargeType === "none"` · `isSurchargeSuspended === **false**` · 세액은 현행과 동일 |
| T-B6 🔴 | **N7** | §154① 미충족 → **중과 유지**(15호 ② 요소, 과다과세 방향이라 양방향 고정) |
| T-B7 | N8 | `temporaryTwoHouse` 미입력 → **완전 불변** |
| T-B8 | 기존 `multi-house-and-nbl.test.ts:78` | `multiHouseTemporaryTwoHouse` 폐기에 맞춰 **갱신** — 신 입력으로 같은 결론 |
| T-B9 | **mock ↔ seed** | anchor는 **seed 값**으로 돈다 — F-3 재발 방지 |

---

## 7. 리스크

| ID | 리스크 | 완화 |
|---|---|---|
| S-1 | Phase A 추출이 동작을 바꿈 | T-A1이 4조합 동일값 고정. 기존 비과세 anchor 전량 회귀 |
| S-2 | 15호 ② 요소 추가로 **중과가 늘어남**(N7) | 법문 명시. T-B6 양방향 고정 + §5 별도 행. 과다과세 방향이므로 리뷰 필수 |
| S-3 | `temporaryTwoHouse`(중과용) 폐기가 외부 호출부를 깸 | 프로덕션 설정 0곳(F-1) · 테스트 1곳뿐 → T-B8이 갱신 |
| S-4 | **anchor가 mock으로 돌아 F-2를 다시 가림** | T-B9 — anchor는 seed 값 주입. Phase C가 mock 전수 대조 |
| S-5 | **겸용은 자동 파급되지 않는다** | 겸용은 `MixedUseAssetInput.multiHouse` 서브객체로 중과 입력을 받고 `temporaryTwoHouse`를 **의도적으로 비워** 뒀다(선행 계획서 §5.1). 한편 겸용도 `temporaryTwoHouseSpecial`로 §155① 특례를 쓴다(`transfer-tax-api-mixed-use.ts:186-190`) → **Phase B2에서 겸용에도 `deemedOneHouseBy155`를 배선**해야 완결. 선행 계획서 anchor 30건이 회귀를 방어 |
| S-6 | Phase C 범위 폭발 | C는 **조사만**. 수정은 D에서 재계획 |
| S-7 | 브라우저 확인 | Phase B에 E2E 1건(일시적 2주택 + 조정지역 다주택) |

---

## 8. 미검증 레지스트리

| ID | 항목 | 상태 |
|---|---|---|
| V-1 | F-4 매트릭스 🔶 6칸(§155③⑥⑦⑧⑯⑳) | 🔶 Phase C |
| V-2 | mock ↔ seed 불일치가 `temporary_two_house` 외에도 있는지 | 🔶 Phase C |
| V-3 | `regulatedAreaDeadlineYears` 단일값이 시기별 개정(3→2→1→3년)을 대표할 수 있는지 | 🔶 과거 양도(수정신고) 정확도 영향 |
| V-4 | §155⑯(공공기관 이전 3→5년)이 `deadlineYears` 산정에 포함되는지 | 🔶 Phase C |
| V-5 | §167의10①6호 국가유산 방향(§155⑥ 일반주택 양도 vs §167의3①6호 주택 자체 양도) | 🔶 Phase C |
| V-6 | 조특법 의제(15호 「또는 조세특례제한법에 따라」)의 커버리지 | 🔶 **미조사** — §155만 봤다 |
| V-7 | §155⑱ 3년 기한 예외 사유(F-5) — 비과세·중과 양쪽 미구현 | 🔶 **범위 밖**. Phase B 이후 단일 소스에 얹으면 한 번에 해소 |

---

## 9. 이력

| 버전 | 일자 | 내용 |
|---|---|---|
| v1.2 | 2026-07-31 | **Phase A·B1·B2 구현 완료.** anchor `temporary-two-house-surcharge.anchor.test.ts` 14건 + 겸용 3건 신설, 기존 4곳(MH-05·MH-06·T-24) 신 입력으로 갱신. 전체 회귀 0. §4에 구현 결과·before→after 실측표 추가. **배관에 신규 UI/API 필드 불필요**(§155① 비과세 입력 재사용)가 확인됨 — B2만 route ⑭ 1줄 |
| v1.1 | 2026-07-31 | **자가 검토 6+3건 정정** — ① §3.2 `checkExemption` 파일 혼동 ② F-1 첫 행이 프로덕션 미발생 상태임을 명시(격리 측정) ③ N1 fixture를 실측값(新 2025-01-01)에 맞춤 ④ **N6·T-B5 정정** — 「유예 우선」이 아니라 **배제가 먼저 early-return**하며 `surchargeType:"none"`·`isSuspended:false`를 반환(`multi-house-surcharge.ts:301-313`) ⑤ N7 현행은 「우연히 정답」임을 명시 ⑥ §1.4 ⑯ 항번호가 역산임을 각주 ⑦ **F-5 신설**(§155⑱ 3년 기한 예외 전 저장소 미구현) ⑧ **S-5 정정** — 겸용은 자동 파급되지 않음 → Phase **B2 신설** ⑨ V-7 |
| v1.0 | 2026-07-31 | 최초 작성. 선행 계획서 U-7에서 분리. **F-1**(배관 0곳, +137,130,000~+353,100,000 과다과세) · **F-2**(기한 3중 드리프트, 「비과세 O/중과배제 X」 실측 +128,810,000) · **F-3**(mock≠seed가 F-2를 가림) · **F-4**(15호 커버리지 6칸 미확인). 근거 조문이 §155① 재구현이 아니라 **§167의10①15호**임을 법문으로 확정 |
