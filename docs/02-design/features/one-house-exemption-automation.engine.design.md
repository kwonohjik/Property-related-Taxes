# 1세대1주택 비과세 판정 자동화 — 엔진 설계

> 계획서: `docs/00-pm/one-house-exemption-automation.plan.md`(v2.1, 기준 커밋 `dd3e0075`).
> UI 설계: `one-house-exemption-automation.ui.design.md`(별도 작성 — 본 문서와 필드명을 맞춘다).
> 대상 로드맵: P1(G-5 시점 함수) · P2(엔진 추출) · P3(§155의2·§155의3) · P4 엔진 부분(판정 메뉴 route 계약).
> 원칙: 판정 로직 **다시 쓰지 않는다**(D-1) — 위치만 옮긴다. 정수 연산·`Math.round` 금지 등은
> `lib/tax-engine/CLAUDE.md` 그대로 적용.
>
> ⚠️ **결정 변경(2026-09-18, 이 설계 문서 작성 중 사용자 지시로 계획서 Q-3′을 대체)**:
> **1세대 판정은 엔진이 하지 않는다.** 계획서 Q-3′(자동 판정 + 수동 수정)은 폐기됐다.
> `OneHouseFacts`의 세대 부분은 현행 `TransferTaxInput.isOneHousehold`(`transfer.types.ts:316`)와
> 같은 의미의 **사용자 선언 boolean**만 받는다. 법 §88 6호·영 §152의3·칙 §70은 **사용자가 스스로
> 판단할 때 참고하는 안내 조문**으로만 결과 화면에 노출한다(엔진 입력·판정 대상이 아니다).
>
> 🔍 **자가 검토 정정(2026-09-18, 초안 대비)** — 초안은 엔진 시니어 에이전트가 작성했고, 검토에서 아래를
> 정정했다(법제처 실독·코드 실측). 정정 근거는 각 절에 있다.
> ① §155의2 법령 요약 오류(①을 「2주택 의제」, ②를 「3주택」으로 적음 → ①은 **1주택 세대의 거주요건 면제**,
>   ②는 **2주택**) ② §155의3을 「거주요건 대체 충족」으로 적음 → 조문은 **「거주기간의 제한을 받지 않는다」(면제)**
> ③ 이름이 같은 두 필드(`deemedOneHouseBy155` — 표2용 `boolean` / 중과용 `DeemedOneHouseBasis`)를 한 타입으로 합침 → **분리**
>   ④ §155의2·§155의3을 「의제」 플래그에 넣도록 설계 → **중과 배제(§167의10①15호)가 잘못 켜짐**. 15호는
>   「제155조 또는 조특법」 의제만 인정한다(§155의2 **불포함**) ⑤ `OneHouseFacts`가 명부를 필수로 둬
>   **계산기 간이 입력(D-4, 스칼라 주택 수)을 표현하지 못함** → 선택 필드 + `householdHousingCount` 추가
> ⑥ 특례 if-chain 순서를 실제와 다르게 적음 → 실측 순서로 정정 ⑦ `propertyType` 누락(§89①4호 입주권 축 불가) → 추가
> ⑧ OH-01~03·07·08 테스트 파일 오기 ⑨ `RedevelopmentRightExemptionSection.tsx:44` → 실제 `:52`
> ⑩ (UI 설계와 교차 대조) 혼인·합가 사실 **이중 정의** 제거 · UI가 넘기는 `generalHouseGiftedFromDecedentWithin2yr`·`specialHouseExclusions` **누락** 추가
>
> 🧱 **D-6 반영(2026-09-18, 계획서 v2.3 §5.10)** — **주택별 사실의 정본은 명부 행**이고 비과세·중과가 같은 행을 읽는다(판정 메뉴·계산기 모두).
> 이 문서에서 바뀐 것: ① `OneHouseFacts`의 §155⑥⑦⑧·⑳ 세대 단위 필드는 **도출 필드**가 된다 — 엔진 계약(필드 형태)은 **불변**이고,
> 채우는 쪽이 명부 행에서 도출한다(신설 절 「D-6 명부 행 → 세대 단위 사실 도출 계약」) ② `HousesListSection`이 `HouseInfo`를 그대로 쓴다는
> 종전 서술은 **오기** — UI는 `HouseEntry`(store 타입)를 쓰고 `buildHousesPayload`가 `HouseInfo`로 변환한다(실측, 아래 정정)
> ③ 레거시 세대 단위 값과 행 속성의 충돌 규칙 ④ 케이스 OH-23~32 추가.
>
> 🔢 **Q-8 반영(2026-09-18, 계획서 §5.11)** — **계산기도 명부가 있으면 주택 수를 명부에서 센다**(주택 양도 한정). 엔진 계약은 불변 —
> 어댑터가 `resolveHouseholdHousingCount(form)`로 얻은 값을 `householdHousingCount`에 싣는다. 아래 `householdHousingCount` 주석·4단계·fallback 절을 고쳤다.

## Context

이 저장소는 1세대1주택 비과세 판정 로직(`checkExemption` 계열)을 이미 갖고 있고, 원안 15개 특례 중
13개를 구현했다(계획서 §3). 그런데 그 판정은 **양도세 계산기 안에 묻혀 있다** — 사용자가 "지금 팔면
비과세인가, 언제까지 뭘 하면 비과세가 되는가"를 알려면 계산기 전체를 채워야 하고, 결과는 세액 하나로만
나온다. 계획서 D-1~D-5 결정으로 **판정 메뉴**를 신설하고 계산기와 **엔진을 공유**하기로 했다. 이 문서는
그 공유 엔진(`lib/tax-engine/one-house/`)의 input·output 계약과 추출·확장 절차를 정의한다.

이 문서가 다루지 않는 것: 판정 메뉴 화면 흐름·마법사 단계·컴포넌트 재사용(→ UI 설계 문서). 세율·누진
계산·중과 산식 자체(→ 기존 엔진, 변경 없음). §156의2·§156의3 판정 로직 자체(이미 구현됨 — 엔진 추출
대상일 뿐 재작성 대상 아님).

---

## ★ 케이스 인벤토리

계획서 §6 OH-01~22를 옮긴다. OH-01~16은 **회귀 anchor**(현행이 이미 맞는지 고정), OH-11~13·17~22는
**신규**다. 전건이 `judgeOneHouseExemption` 추출 전후 동일값 검증(P2)과 §155의2·§155의3 구현(P3)의
테스트 약속이다.
계획서 v2.2·v2.3에서 추가된 OH-23~32는 계획서 §6이 정본이다(여기에 다시 적지 않는다) — 엔진 관련: OH-23~25(G-6·G-7 결함 anchor, P1) ·
OH-26~28(G-8, P3) / D-6 관련: OH-29~32(아래 「D-6 도출 계약」의 동치 anchor가 대응).

| # | 시나리오 | 법령 근거 | 테스트 파일(안) | 상태 |
|---|---------|----------|-----------|------|
| OH-01 | 공동상속주택 — 사용자가 **최대지분자로 선언**(`isLargestCoInheritedShareholder: true`) → 산입·과세 | §155③ 단서 | 기존 `inherited-house-155-3-coinherited.anchor.test.ts` | 기존 |
| OH-02 | 공동상속주택 — 최대지분자 **아님**(`false`) → 제외·비과세 | §155③ 본문 | 동상 | 기존 |
| OH-03 | 동순위 최대지분자 2인 중 거주자·최연장자 판정 | §155③1·3호 | — **엔진 판정 대상 아님**: 양도세 축은 최대지분자 여부를 사용자가 선언한다(`transfer-inheritance-exclusion.ts:66`). 판정 메뉴는 §155③ 단서·각 호를 **안내**만 한다 | 해당 없음 |
| OH-04 | 상속주택 보유 7년 경과 후 일반주택 양도 → 비과세(기한 없음) | §155②·E-3 | 기존 `inherited-house-155-2-exemption.anchor.test.ts` | 기존 |
| OH-05 | 혼인 합가 9년 후 먼저 양도 → 비과세 | §155⑤ | `merge-155-4-5-exemption.anchor.test.ts` | 기존 |
| OH-06 | 동거봉양 합가 11년 후 양도 → 과세 | §155④ | 동상 | 기존 |
| OH-07 | 수도권 도시주거지역 부수토지 4배 → 초과분 과세 | §154⑦1호가 3배 | `one-house-154-7-multiplier-zone.anchor.test.ts` | ☐ Pre-Do §8.1-2 신설 |
| OH-08 | 같은 조건 양도일 2021-06-30 → 전량 비과세(종전 5배) | 부칙 §39 | 동상 | ☐ 동상 |
| OH-09 | 해외이주 출국, 거주 0년, 출국 1년 후 양도 → 비과세 | §154①2호나 | `exemption-154-proviso.test.ts` | 기존 |
| OH-10 | 해외이주 출국 2년6개월 후 양도 → 과세 | §154①2호나 단서 | 동상 | 기존 |
| OH-11 | 상생임대 — 직전계약 14개월 → 불성립(18개월 미달) | §155의3①2호(M-9) | `one-house-155-3-winwin-rental.anchor.test.ts` | ☐ P3 신규 |
| OH-12 | 상생임대 성립 + 조정지역 취득·거주 0년 → 비과세 + 표2 적용 | §155의3① | 동상(긍정 짝) | ☐ P3 신규 |
| OH-13 | 장기저당담보, 계약 10년 중 7년차 양도 → 특례 배제 | §155의2③ | `one-house-155-2-mortgage.anchor.test.ts` | ☐ P3 신규 |
| OH-13b | 장기저당담보 ① 성립 · 1주택 · 조정지역 취득 · 거주 0년 → **거주요건 면제로 비과세**, 보유 2년은 여전히 필요 | §155의2① | 동상(긍정 짝) | ☐ P3 신규 |
| OH-13c | 장기저당담보 ② 동거봉양 합가 2주택 → 먼저 양도 주택 1주택 의제 · **표2 대상 true · 중과 배제 근거 없음** | §155의2② · §159의4 · §167의10①15호(§155의2 불포함) | 동상 | ☐ P3 신규 |
| OH-12b | 상생임대 성립 → **중과 배제 근거가 켜지지 않는다**(의제가 아니라 거주요건 면제) | §155의3① · §167의10①15호 | `one-house-155-3-winwin-rental.anchor.test.ts` | ☐ P3 신규 |
| OH-14 | §99의4 농어촌주택 보유 2년차 일반주택 양도 → 적용(사후 추징 대상) | 조특법 §99의4④⑥ | `transfer-reductions/new-99-4` 기존 anchor | 기존 |
| OH-15 | 일시적 2주택, 신규 취득 후 2년·미전입 → 비과세(전입요건 없음) | §155① 현행·E-7 | `temporary-two-house-one-year-155-1.anchor.test.ts` | 기존 |
| OH-16 | 문화유산 = 천연기념물등 주택 + 일반주택 → 비과세 | §155⑥1호 | 신설(§3.4 — 전용 anchor 미발견) | ☐ P0 |
| OH-23 | §155⑳ A시나리오 — 장기임대주택 요건 충족 + 거주주택 2년 거주 → 판정 메뉴 「비과세 해당」 | 영 §155⑳ | `one-house-155-20-judge.anchor.test.ts` | ☐ P4ⓑ |
| OH-24 | §155⑳ B시나리오(임대→거주 전환) → 판정 메뉴는 해당 여부만, **직전거주주택 이후 기간분 안분은 계산기**(판정 메뉴에 금액 없음) | 영 §155⑳ 후단 · §161 | 동상 | ☐ P4ⓑ |
| OH-25 | §89①4호 가목 — 입주권 1개, 인가일 현재 요건 충족, 다른 주택·분양권 없음 → 입주권 양도 비과세 | 법 §89①4호가 | `one-house-89-1-4-judge.anchor.test.ts` | ☐ P4ⓑ |
| OH-26 | 판정/산식 분리 전후 §155⑳·입주권 anchor 전건 동일값 | D-1 · 세액 불변 | 기존 anchor(무변경) | ☐ P4ⓑ |
| OH-16b | 세대 — 사용자가 `isOneHousehold: false`로 선언 → 판정 대상 아님(즉시 과세, 세부 특례 판정 생략) | 법 §88 6호(참고) | 기존 `checkExemptionCore:92` 게이트 회귀 | 기존 |
| OH-17 | 판정 메뉴 — 명부 2건(일반+상속 선순위), 세대 주택 수 스칼라 없음 → 명부에서 도출(1) → 비과세 | G-1·D-3·§155② | `one-house-judge-house-count-from-list.test.ts` | ☐ P4 |
| OH-18 | 일시적 2주택 조건부(기한 내) → 계산기에서 양도일을 기한 다음날로 재판정 → 과세 | D-3·§155① | `one-house-judge-refresh-on-transfer-date.test.ts` | ☐ P5 |
| OH-19 | 계산기 간이 입력만(판정 미경유)·1주택 → 현행과 같은 세액 | D-4 | 기존 §3.4 anchor 전건(회귀) | ☐ P6 |
| OH-20 | 계산기 간이 입력만·주택 수 2·사실 없음 → 특례 없음으로 과세 + 안내 | D-4·§5.4 | 신규 컴포넌트 테스트(UI 문서) | ☐ P6 |
| OH-21 | P6 이전 저장 이력(③ 값 보유)을 P6 이후 재계산 → 저장 당시와 같은 세액 | §5.4 | 신규(UI 문서 겸) | ☐ P6 |
| OH-22 | 계산기 route가 `judgeOneHouseExemption` 호출 후 §3.4 anchor 전건 | D-1·P2 | 기존 전체(무변경) | ☐ P2 |

**규칙**: 위 표 행 1개 = anchor 1개 이상. Do 진입 전 §8.1 Pre-Do anchor부터 작성한다(아래 "테스트 약속").

---

## 법령 근거

이번 설계가 직접 건드리는 조문만 추린다(전체는 계획서 §2·§3.5).

**세대 요건은 엔진이 판정하지 않는다**(위 결정 변경). 아래 세 조문은 판정 메뉴 결과 화면에서
**사용자가 스스로 확인하도록 안내하는 참고 조문**일 뿐이며, `OneHouseFacts`의 입력값도 이 조문의
요건을 엔진이 검산하지 않는다.

```
소득세법 §88 6호(MST 280405) — 1세대: 거주자 및 그 배우자(법률상 이혼했으나 사실상 이혼으로
  보기 어려운 관계에 있는 사람 포함)가 같은 주소·거소에서 생계를 같이하는 자(직계존비속·그 배우자·
  형제자매 — 취학·질병요양·근무상·사업상 형편으로 일시 퇴거한 사람 포함)와 함께 구성하는 집단.
  단서 — 배우자가 없어도 대통령령으로 정하는 경우 1세대로 본다. (참고 조문 — 사용자 판단용)

소득세법 시행령 §152의3(MST 286211) — 배우자 없이 1세대를 구성하는 경우: 1호 거주자 나이가
  30세 이상 / 2호 배우자가 사망하거나 이혼 / 3호 소득 기준(기준 중위소득 12개월 환산액의 40%
  이상 + 독립 생계, 미성년자 제외 단서 있음). (참고 조문 — 사용자 판단용. 엔진 입력·판정 대상 아님)

소득세법 시행규칙 §70(MST 286379) — 영 §152의3 3호의 소득 범위(참고용, 엔진 미사용).

⚠️ 저장소 상수 `ONE_HOUSEHOLD_DEF`가 두 곳(`legal-codes/transfer.ts:43`·`legal-codes/transfer-house.ts:24`)
   에서 「소득세법 시행령 §152」로 **오기**돼 있다. 영 §152는 「환지등의 정의」이고, 1세대의 범위는
   §88 6호(정의)·영 §152의3(배우자 없는 경우)이다. **엔진이 세대를 판정하지 않기로 결정했어도 이
   오기는 그대로 남는 결함**이다 — 판정 메뉴 결과 화면이 §88 6호·§152의3을 참고 조문으로 링크하려면
   정확한 조문 번호가 필요하기 때문이다. ⇒ **P0에서 두 상수 모두 「소득세법 §88 6호」·「소득세법
   시행령 §152의3」으로 정정한다**(계획서 §2.4·P0 그대로 유지).
```

기존 특례(§155·§155①④⑤⑥⑦⑧·§156의2·§156의3·§89①4호·§89②)는 계획서 §3.2·§3.5가 이미 실측했고
이 설계는 그 판정을 **재사용**한다 — 본문은 신설분(§155의2·§155의3·G-5 시점 함수)에
집중한다(세대 판정은 사용자 선언 — 엔진 신설분 아님).

```
소득세법 시행령 §155의2(MST 286211 실독) — 장기저당담보주택:
  ① 국내에 1주택을 소유한 1세대가 장기저당담보대출계약(1호 계약체결일 현재 가입자 60세 이상 ·
     2호 계약기간 10년 이상 + 만기까지 매월·매분기 등 대출금 수령 · 3호 만기에 주택 처분으로 일시 상환)을
     체결하고 그 담보 주택을 양도하면 §154①을 적용할 때 **거주기간의 제한을 받지 않는다**(보유 요건은 그대로).
  ② 1주택 세대가 장기저당담보주택을 소유한 직계존속(배우자의 직계존속 포함)을 동거봉양하려 세대를 합쳐
     **2주택**이 된 경우, **먼저 양도하는 주택**을 1주택으로 보아 §154①을 적용하되 장기저당담보주택은
     거주기간의 제한을 받지 않는다.
  ③ 계약기간 만료 전에 양도하면 ①②를 적용하지 않는다.
  ④ ②를 적용받으려면 특례적용신고서를 과세표준신고기한 내 제출.

소득세법 시행령 §155의3 — 상생임대주택: 1호 2021-12-20~2026-12-31 기간 중 계약 체결 및 임대를
  개시하고 임대료 등 증가율이 100분의 5를 초과하지 않을 것(1호), 상생임대계약 직전의 임대차계약에
  따라 1년 6개월 이상 임대한 사실이 있을 것(2호), 상생임대계약에 따라 2년 이상 임대한 사실이 있을 것
  (3호)을 모두 충족하면 §154①·§155⑳1호·§159의4를 적용할 때 **거주기간의 제한을 받지 않는다**(면제 —
  「임대기간으로 대체 충족」이 아니다). 대상은 「국내에 1주택(§155·§155의2·§156의2·§156의3 등으로 1세대1주택으로
  보는 경우 포함)을 소유한 1세대」다. 직전임대차계약은 **주택 취득으로 임대인 지위가 승계된 계약을 제외**한다(1호 괄호).
  ⚠️ §155의3은 1주택으로 **보는** 특례(의제)가 아니다 — 중과 배제(§167의10①15호)와 무관하다.

소득세법 §89①3호 괄호·부칙(법률 제18578호) 제1조3호·제7조④ — 고가주택 기준 12억원은
  2021-12-08 이후 **양도하는 주택부터** 적용.
소득세법 시행령 §156①(대통령령 제21062호) 부칙 제1조·제2조 — 9억원은 2008-10-07 이후
  **양도하는 분부터** 적용. 그 이전은 6억원(§156① 구 규정).
```

---

## 엔진 input 타입

`lib/tax-engine/one-house/types.ts` 신설. 기존 `TransferTaxInput`(`lib/tax-engine/types/transfer.types.ts`)
의 판정 관련 필드를 **부분집합으로 추출**한 것이지 새로 설계한 것이 아니다 — 필드명·의미를 그대로
따른다(추출 시 rename 금지, `feedback_rename_same_name_two_axes`).

```ts
// lib/tax-engine/one-house/types.ts

/**
 * 세대 구성 — **사용자 선언**(엔진 자동 판정 없음, 2026-09-18 결정 변경).
 * 현행 `TransferTaxInput.isOneHousehold`(`transfer.types.ts:316`)와 동일한 의미·형태다.
 * 법 §88 6호·영 §152의3 요건 충족 여부는 사용자가 결과 화면의 참고 조문 안내를 보고 스스로
 * 판단해 이 boolean을 입력한다 — 엔진은 이 값을 그대로 전제로 받는다.
 */
export type OneHouseholdInput = {
  /** 판정 기준일(=양도일) 현재 1세대 해당 여부 — 사용자 선언 */
  isOneHousehold: boolean;
  /** §155④ 동거봉양 합가일 */
  parentalCareMergeDate?: Date;
  /** §155⑤ 혼인일 */
  marriageDate?: Date;
  /** §155④⑤ 「먼저 양도하는 주택」 여부 — §155의2②도 재사용 */
  isFirstTransferredInMerge?: boolean;
};

/**
 * 1세대1주택 판정 사실 — TransferTaxInput 판정 관련 필드의 부분집합.
 * 필드 목록은 TransferTaxInput과 이름을 공유한다(재작성 금지). UI 설계 문서와 이 목록을 맞춘다.
 */
export type OneHouseFacts = {
  household: OneHouseholdInput;
  /** 양도 자산 종류 — 기존 게이트(`transfer-tax-exemption.ts:92` `propertyType !== "housing"`)와
   *  §89①4호 입주권 축(V-13)에 필요하다. TransferTaxInput.propertyType과 같은 값 공간. */
  propertyType: TransferTaxInput["propertyType"];
  /** §91① 미등기 — 비과세 배제 게이트(`transfer-tax-exemption.ts:88`). 계산기 ⑤「특수 상황」과 같은 사실 */
  isUnregistered?: boolean;
  /** 세대 보유 주택 명부 — **판정 메뉴는 항상 보낸다**(정본, D-3). 계산기 간이 입력(D-4)은 비어 있을 수 있다.
   *  HouseInfo는 multi-house-surcharge.types.ts:30 재사용 */
  houses?: HouseInfo[];
  /** 세대 보유 분양권·입주권 명부(multi-house-surcharge.types.ts:256) */
  presaleRights?: PresaleRight[];
  /** 양도 대상 주택 식별자 (houses[].id 참조) — houses가 있을 때 필수 */
  sellingHouseId?: string;
  /** **간이 입력 전용**(D-4) — 명부에 주택 행이 없을 때만 쓰는 세대 보유 주택 수 스칼라.
   *  현행 TransferTaxInput.householdHousingCount와 같은 의미. 판정 메뉴는 보내지 않는다.
   *  🔴 명부와 동시에 오면 명부가 우선이다 — 판정 메뉴뿐 아니라 **계산기도**(Q-8). 둘을 섞어 쓰지 않는다.
   *  계산기 어댑터는 명부가 있으면 사용자가 입력한 스칼라가 아니라 `resolveHouseholdHousingCount`의 도출값을 싣는다. */
  householdHousingCount?: number;

  // ── 아래는 TransferTaxInput과 동일 이름·의미(그대로 이식) ──
  temporaryTwoHouse?: TransferTaxInput["temporaryTwoHouse"];
  replacementHouse?: TransferTaxInput["replacementHouse"];
  rightThreeYearException?: TransferTaxInput["rightThreeYearException"];
  mergedHouseholdFirstHouse?: TransferTaxInput["mergedHouseholdFirstHouse"];
  generalHouseHeldAtInheritance?: boolean;
  inheritedRightChoiceWhenBothHeld?: TransferTaxInput["inheritedRightChoiceWhenBothHeld"];
  oneHouseExemptionProviso?: TransferTaxInput["oneHouseExemptionProviso"];
  // ⚠️ 혼인·동거봉양 합가 사실은 `household`에만 둔다 — 초안은 최상위 `marriageMerge`·`parentalCareMerge`·
  //    `isFirstTransferredInMerge`를 **중복 정의**했다(같은 사실 두 벌 = dual-truth). 어댑터가 TransferTaxInput의
  //    `marriageMerge{marriageDate}`·`parentalCareMerge{mergeDate}` 형태로 변환한다.
  /** §155② 단서 — 일반주택이 상속개시일부터 소급 2년 내 피상속인 증여분인지(TransferTaxInput 동명 필드) */
  generalHouseGiftedFromDecedentWithin2yr?: boolean;
  /** 조특법 감면주택 주택수 제외(TransferTaxInput 동명 필드 — UI `SpecialHouseExclusionSection`) */
  specialHouseExclusions?: TransferTaxInput["specialHouseExclusions"];
  // ── D-6 도출 필드 — 정본은 houses[] 행 속성. 엔진은 형태를 바꾸지 않고 그대로 받는다 ──
  //    채우는 쪽: 명부가 있으면 `deriveHouseholdFactsFromHouses`(아래 D-6 절)가 행에서 도출한다.
  //    명부가 없는 간이 입력(D-4)·P6 이전 레거시 record(「행 미지정」)만 이 필드를 직접 채운다.
  unavoidableOutsideCapitalHouse?: TransferTaxInput["unavoidableOutsideCapitalHouse"];
  ruralHouse?: TransferTaxInput["ruralHouse"];
  culturalHeritageHouse?: boolean;

  // ── P4ⓑ 이관(Q-7) — 판정 사실만. 세액 산식 입력은 계산기 잔류 ──
  /** §155⑳ 판정 사실 — `RentalHousingExceptionInput`(rental-housing-exception/types.ts:106-126)의 요건 부분만.
   *  B시나리오 §161 안분 입력(`priorResidenceTransferDate`·`standardPriceAt*`)은 **포함하지 않는다**.
   *  ⛔ D-6 이관 **철회**(2026-09-21): `rentalUnits`는 명부 행이 아니라 **자산 폼이 정본**이다
   *  (P6-c-4 — 엔진 입력이 top-level 단일 객체라 명부 N행과 N:1이 안 맞는다). 계획서 §5.10 결정 4 */
  rentalHousingException?: Pick<RentalHousingExceptionInput, "applyException" | "scenario" | "rentalUnits">;
  /** §89①4호 1세대1입주권 판정 사실 — AssetForm 동명 필드(RedevelopmentRightExemptionSection.tsx:156·168·179·191) */
  redevRightExemption?: {
    redevExemptionEligibleAtApproval: "yes" | "no" | "";   // 가목 — 인가일 현재 요건 자기선언
    redevPriorHouseHoldingMonths?: number;
    redevPriorHouseResidenceMonths?: number;
    redevOtherHouseAcquisitionDate?: Date;                 // 나목 — 1주택 취득일(3년 기산)
  };

  // ── 신설(P3) ──
  /** §155의2 장기저당담보주택 */
  longTermMortgageHouse?: {
    contractDate: Date;             // ①1호 — 계약체결일(60세 판정 기준일)
    borrowerAgeAtContract: number;  // ①1호 — 60세 이상
    contractYears: number;          // ①2호 — 10년 이상
    maturityLumpSumRepayment: boolean; // ①3호
    transferredBeforeMaturity: boolean; // ③ — true면 특례 배제
    parentalCareMerge?: boolean;    // ②(M-6) — 담보주택 보유 직계존속 동거봉양 합가로 **2주택**이 된 경우
  };
  /** §155의3 상생임대주택 */
  winWinRentalHouse?: {
    winWinContractDate: Date;   // ①1호 — 2021-12-20~2026-12-31 체결·임대개시
    increaseRatePct: number;    // ①1호 — 5% 이하
    priorLeaseMonths: number;   // ①2호 — 18개월 이상(M-9). 취득으로 승계된 임대차계약은 「직전임대차계약」이 아니다(1호 괄호)
    winWinLeaseMonths: number;  // ①3호 — 24개월 이상
  };

  // ── §154① 단서 6종(경과규정 포함)은 oneHouseExemptionProviso로 이미 표현됨(위 참조) ──
  /** ⚠️ **사용자 입력이 아니다** — 이월과세(§97의2) 경로가 엔진 안에서 채우는 **수증자 실제 취득일**(`transfer-tax-carryover.ts:222`
   *  `residenceTransitionAcquisitionDate: ct.giftRegistryDate`). 거주요건 판정이 이 값을 우선 쓴다(`transfer-tax-exemption-requirements.ts:369-371`).
   *  판정 메뉴·UI는 보내지 않는다. (초안 주석 「§154① 단서 경과규정 판정용」은 오기 — 실측 정정) */
  residenceTransitionAcquisitionDate?: Date;
  /** 취득 당시 조정대상지역 여부 — 거주요건 판정 기준(양도가 아니라 취득 시점) */
  wasRegulatedAtAcquisition?: boolean;
};

/** 판정 대상 양도 정보 — 판정 메뉴는 "양도 예정", 계산기는 실제 입력값 */
export type OneHouseSale = {
  transferDate: Date;
  transferPrice: number;
  /** 지분 양도·부담부증여 분모(총 물건가) — 미지정 시 transferPrice */
  totalPropertyTransferPrice?: number;
  burdenedGiftDenominator?: number;
  /** §154① 거주요건 판정용 실거주 개월 수(§154⑧3호 통산은 별도 필드로 향후 확장) */
  residencePeriodMonths: number;
};
```

`OneHouseFacts.houses: HouseInfo[]`·`presaleRights?: PresaleRight[]`는 재정의하지 않고
`lib/tax-engine/types/multi-house-surcharge.types.ts`의 `HouseInfo`·`PresaleRight`를 그대로 import한다
— 중과 엔진이 같은 타입을 소비하므로 타입이 갈리면 「한 명부, 두 축」(D-6)이 깨진다.
⚠️ **정정(D-6 반영 시 실측)**: 종전 서술 「`HousesListSection`이 `HouseInfo`를 그대로 쓴다」는 **오기**다. UI는 store 타입
`HouseEntry`(`lib/stores/calc-wizard-asset-nbl.ts:75-203` — 문자열 날짜·약 70필드)를 쓰고(`HousesListSection.tsx:42`),
`buildHousesPayload`(`lib/calc/transfer-tax-api-houses.ts:20`)가 `HouseInfo`로 **변환**한다. 양도 주택은 명부 밖 자산에서
`"selling"` 행으로 **합성**된다(`:30-53`). D-6 도출도 이 변환 층에서 일어난다.

## 엔진 result 타입

```ts
// lib/tax-engine/one-house/types.ts (계속)

export type OneHouseJudgment = {
  /** 주택 수 산정 — 명부에서 도출, 제외된 주택과 사유 */
  houseCount: {
    total: number;               // houses.length
    countedForExemption: number; // §155②③⑦⑧ 등 제외 반영 후
    excluded: Array<{ houseId: string; reason: string; legalBasis: string }>;
  };
  /** 비과세 판정 본체 — 기존 ExemptionResult와 형태를 맞춘다(P2에서 그대로 감싼다) */
  isExempt: boolean;
  isPartialExempt: boolean;
  exemptReason?: string;
  /** 주택 수로 본 1주택 여부 — 명부 도출값(판정 메뉴) 또는 간이 입력 스칼라(계산기). 표2 대상 판정의 1차 입력.
   *  현행 `isOneHouseSingle`(`transfer-tax-lthd.ts:272-273` `isOneHousehold && householdHousingCount === 1`)을 대체한다. */
  isSingleHouseByCount: boolean;
  /** 🔴 이름이 같은 **두 축을 분리**한다(`feedback_rename_same_name_two_axes`):
   *  ① §159의4 표2 **대상** 의제 — 현행 ExemptionResult.deemedOneHouseBy155(boolean,
   *     `transfer-tax-exemption-requirements.ts:168-181`). §159의4는 「제155조·제155조의2·제156조의2·제156조의3 등에 따라
   *     1세대1주택으로 보는 주택」을 포함하므로 **§155의2② 의제도 true**가 된다. §155의3은 의제가 아니다(false). */
  deemedForTable2: boolean;
  /**  ② §167의10①15호 **중과 배제** 근거 — 현행 MultiHouseSurchargeInput.deemedOneHouseBy155
   *     (`DeemedOneHouseBasis` = "temporary_two_house" | "rural_house", `multi-house-surcharge.types.ts:389·414`).
   *     15호는 「**제155조 또는 조특법**에 따라」 1주택으로 보는 주택만 인정한다(영 §167의10①15호 실독) —
   *     **§155의2 의제·§155의3은 여기에 들어가지 않는다.** */
  surchargeDeemedBasis?: DeemedOneHouseBasis;
  /** 거주요건 면제 사유 — §154① 단서 · §155의2①② · §155의3. 표2 **거주요건**(`table2ResidenceYears >= 2`) 게이트와
   *  §155⑳1호 거주요건을 계산기가 조정할 때 읽는다(§155의3은 세 조문 모두, §155의2는 §154①만). */
  residenceExemptions: Array<{ basis: "154-1-proviso" | "155-2-1" | "155-2-2" | "155-3"; appliesTo: Array<"154-1" | "155-20-1" | "159-4"> }>;
  /** §89② 판정 echo — "excluded"/"exception_met"/"undetermined" 3갈래(기존 그대로) */
  article89Clause2?: Article89Clause2Result;
  /** 고가주택 안분에 쓸 양도일 기준 금액(G-5) */
  highValueThreshold: number;
  /** 적용된 특례 목록(근거 조문 포함) — 판정 메뉴 체크리스트용 */
  appliedExceptions: Array<{ id: string; label: string; legalBasis: string }>;
  /** 조건부·기한 — G-3. 미충족이지만 기한 내 행위로 충족 가능한 항목 */
  pending: Array<{
    id: string;                  // 예: "155-1-disposal-deadline"
    description: string;         // "종전주택을 이 날짜까지 양도하면 비과세"
    deadline: Date;              // UI는 재계산하지 않고 그대로 표시(Q-4 — 날짜만, 잔여일 없음)
    legalBasis: string;
  }>;
  /** 판정 불가(자료 부족·명문 없음) 사유 — undetermined 3갈래 철학 그대로 */
  undetermined: Array<{ id: string; reason: string }>;
  legalBasis: string[];
  warnings: string[];
};
```

Date 필드(`OneHouseFacts`·`OneHouseSale`의 모든 `Date` 값)는 라우트 통합 시 `lib/api/date-coerce.ts`의
`toDate`/`toOptionalDate`/`coerceDates`를 반드시 거친다(JSON 직렬화 후 `Date < string` silent false 함정).

---

## 계산 알고리즘 (단계별)

`judgeOneHouseExemption(facts: OneHouseFacts, sale: OneHouseSale, rates: TaxRatesMap): OneHouseJudgment`

1. **P1 먼저 — 고가주택 기준 시점 함수**(G-5, 착수 선행 조건).
   `resolveHighValueHouseThreshold(transferDate: Date): number` (`lib/tax-engine/one-house/threshold.ts`)를
   `HOUSING_MULTIPLIER_SPLIT_EFFECTIVE_DATE`(`non-business-land/urban-area.ts:90`) 전례대로 작성한다.
   ```
   transferDate <  2008-10-07 → 600,000,000   (소령 §156① 구 규정, 2005-02-19 이전 미확인)
   transferDate <  2021-12-08 → 900,000,000   (소령 §156①, 대통령령 제21062호 부칙 §2)
   transferDate >= 2021-12-08 → 1,200,000,000 (법 §89①3호 괄호, 법률 제18578호 부칙 §1③·§7④)
   ```
   이 함수를 **판정(`rule.maxExemptPrice` 대체 또는 대조)과 안분 양쪽**이 호출해야 한다. 안분 쪽은
   현재 5곳이 `1_200_000_000`을 하드코딩한다 — `transfer-tax-helpers.ts:452 calcOneHouseProration`
   (`const threshold = 1_200_000_000`) · `transfer-tax-lthd.ts:370`(토지·건물 분리, `const THRESHOLD`)
   · `transfer-tax-mixed-use-helpers.ts:504`(`const HIGH_VALUE_THRESHOLD`) ·
   `burdened-gift-eligibility.ts:19`(`const HIGH_PRICE_THRESHOLD_KRW`) ·
   `transfer-tax-redevelopment-lthd.ts:25`(`export const HIGH_VALUE_THRESHOLD` — 규칙값도 안 본다).
   전부 `resolveHighValueHouseThreshold(양도일)` 호출로 전환한다. **자산별 양도일**을 넘겨야 한다 —
   다건 route(`app/api/calc/transfer/multi/route.ts:89`)는 과세기간 말일로 규칙 행을 고르므로
   규칙 행이 아니라 이 함수의 인자로 자산별 양도일을 직접 넘긴다.
   `judgeOneHouseExemption`은 `sale.transferDate`로 이 함수를 호출해 `highValueThreshold`를 채운다.

2. **§91① 미등기 게이트** — `facts.isUnregistered`면(현행 게이트가 `TransferTaxInput.isUnregistered` 자산-수준 플래그를 본다 —
   `transfer-tax-exemption.ts:88`. 명부가 없는 간이 입력 경로에서도 성립해야 하므로 명부 행이 아니라 사실 최상위에 둔다)
   즉시 `{ isExempt: false, isPartialExempt: false, ... }` 반환(기존 `checkExemptionCore:88` 동일).

3. **세대 요건 게이트** (엔진 판정 없음 — 사용자 선언 그대로 소비)
   `facts.household.isOneHousehold !== true`면 즉시 과세 반환 — 기존
   `checkExemptionCore:92`(`if (!input.isOneHousehold || input.propertyType !== "housing")`)와
   **완전히 동일한 게이트**를 옮긴 것뿐이다. 엔진은 법 §88 6호·영 §152의3 요건을 검산하지 않는다.
   결과 화면(UI 설계 문서 몫)이 이 boolean 입력 **직전**에 §88 6호·영 §152의3 요건을 안내 텍스트로
   보여줘 사용자가 스스로 판단하도록 돕는다 — 그 안내는 엔진 output이 아니라 정적 UI 콘텐츠다.

4. **주택 수 산정** — `facts.houses`에서 현행 house-count 로직(`transfer-inheritance-exclusion.ts`
   §155②③ · `qualifiesRuralHouse` §155⑦ 등)을 그대로 호출해 `houseCount.countedForExemption`을 낸다.
   G-1 D-3: 판정 메뉴에서는 이 값이 **정본**이며 스칼라 `householdHousingCount`를 보내지 않는다.
   **Q-8**: 계산기도 명부에 주택 행이 있으면 같은 정본을 쓴다(어댑터가 도출값을 싣는다 — 계획서 §5.11).
   명부가 비어 있을 때만(간이 입력, D-4) `facts.householdHousingCount`를 **현행과 같은 의미로** 쓴다 —
   명부가 없으므로 §155②③ 등 명부 기반 제외도 현행처럼 적용되지 않는다(OH-19·OH-20이 현행 세액 불변을 지킨다).

5. **특례 판정** — 기존 `checkExemptionCore`의 if-chain 순서를 **실측 그대로** 옮긴다(다시 쓰지 않는다 —
   `transfer-tax-exemption.ts` E-라벨 실측):
   E-5 §156의2⑤ 대체주택(`:96`) → E-3 §155① 일시적 2주택(`:137`) → E-3.7 §155⑧ 수도권 밖 부득이(`:197`)
   → E-3.6 §155⑥ 문화유산(`:216`) → E-3.8 §155⑦ 농어촌(`:241`) → E-3.5 §155④⑤ 합가(`:252`)
   → E-4 §154① 보유·거주 요건(단서 포함, `:280`) → E-1/E-2 전액·부분(`:285·299`).
   **신설 위치**: §155의2②(동거봉양 합가 2주택 의제)는 **E-3.5 합가 분기 옆**에 새 분기로 둔다(같은 합가 구조).
   §155의2①·§155의3은 의제가 아니라 **거주요건 면제**이므로 새 분기를 만들지 않고 **E-4의 거주요건 판정**
   (`meetsOneHouseHoldingResidence`)에 면제 사유로 주입한다 — §154① 단서 면제와 같은 자리다.
   의제 분기가 성립하면 `appliedExceptions`에 push하고 `deemedForTable2`를, §155 각 항이면 `surchargeDeemedBasis`도 채운다.

   **§155의2 신설 로직**(P3):
   ```
   contractOk = borrowerAgeAtContract >= 60 && contractYears >= 10
             && maturityLumpSumRepayment === true && transferredBeforeMaturity === false;   // ③ 배제
   ① if (longTermMortgageHouse && 주택 수 === 1 && contractOk && 양도 주택 = 담보주택)
        → residenceExemptions += "155-2-1"(appliesTo §154①) — 보유 2년은 그대로 판정. 의제 아님.
   ② if (longTermMortgageHouse.parentalCareMerge && 주택 수 === 2 && contractOk && 먼저 양도하는 주택)
        → 1주택 의제: deemedForTable2 = true · surchargeDeemedBasis **변경 없음**(15호 불포함)
          · 담보주택을 양도하는 경우 residenceExemptions += "155-2-2"
   ⚠️ 「먼저 양도」 판정은 §155④⑤ 합가와 같은 `isFirstTransferredInMerge` 사실을 재사용한다.
   ```
   **§155의3 신설 로직**(P3, M-9 포함):
   ```
   if (winWinRentalHouse) {
     eligible = winWinContractDate in [2021-12-20, 2026-12-31]
             && increaseRatePct <= 5
             && priorLeaseMonths >= 18   // M-9, 원안 누락분
             && winWinLeaseMonths >= 24;
     eligible이면 residenceExemptions += "155-3"(appliesTo §154①·§155⑳1호·§159의4) — **거주기간 제한 면제**.
     🔴 deemedForTable2·surchargeDeemedBasis는 **건드리지 않는다** — 의제가 아니므로 중과 배제(15호)가 켜지면 오류다(OH-12b).
     계산기는 residenceExemptions를 읽어 표2 거주요건 게이트(`table2ResidenceYears >= 2`)와 §155⑳1호 거주요건을 조정한다
     (엔진이 계산기의 §161 산식까지 대신 계산하지 않는다 — 사실만 전달, D-2).
   }
   ```

6. **`pending[]` 생성** — 5단계에서 "타이밍 요건 미충족이지만 기한이 남은" 분기마다 채운다.
   기존 `judgeTemporaryTwoHouseTiming`(`transfer-tax-exemption-requirements.ts:453`)이 이미
   `deadline: Date`를 반환하므로 그 값을 그대로 옮겨 담는다(재계산 금지 —
   `feedback_aggregate_display_rederives_engine_value`):
   - §155① 일시적 2주택: `deadline = judgeTemporaryTwoHouseTiming(...).deadline`
     (처분기한 — `resolveTemporaryTwoHouseDeadlineYears`가 조정지역 단축·§155⑯ 5년·부칙 완화를
     이미 반영해 산출한 연수를 신규주택 취득일에 더한 값).
   - §155④⑤ 합가: `deadline = addYears(mergeDate, MERGE_EXEMPTION_YEARS /* 10 */)`.
   - §155⑧ 수도권 밖 부득이: `resolvedDate`가 있으면 `deadline = addYears(resolvedDate, 3)`,
     없으면(미해소) 기한 미기산 — `pending` 대신 `undetermined`에 "부득이한 사유 해소일 미입력"으로 기록.
   - §156의2③·§156의3② (3년 이내) 미충족: `deadline = addYears(권리취득일, 3)`.
   각 pending 행은 `legalBasis`(예: `TEMP_TWO_HOUSE_2HOUSE_BASIS`)를 함께 낸다.

7. **표2·중과 echo** — 계산기의 `isOneHouseForTable2`(`transfer-tax-lthd.ts:274-275`)는 현재
   `isOneHouseSingle || (isOneHousehold && deemedOneHouseBy155 === true)`이고 `isOneHouseSingle`은 **스칼라
   `householdHousingCount === 1`** 에 기댄다(`:272-273`). ⇒ 추출 후에는 `isSingleHouseByCount || deemedForTable2`로
   바꾼다(명부 기반 판정에서도 같은 값). 중과 쪽은 `surchargeDeemedBasis`를 기존 `MultiHouseSurchargeInput.deemedOneHouseBy155`에
   그대로 넘긴다. 엔진이 표2 공제율·중과세율까지 계산하지 않는다.

8. **§89② 배제**(기존 `resolveArticle89Clause2` 그대로 호출, 순서상 5단계보다 먼저 게이트하는
   현행 `checkExemption:58-61`을 유지) — `"excluded"`면 전체 과세, `"undetermined"`면 결과에
   `undetermined` 기록 + 종전 동작 유지.

---

## Silent fallback / 자동 안분 후보 식별

- **세대 요건 자동 판정 자체를 만들지 않는다** — `isOneHousehold`는 사용자 선언이고, 엔진이 나이·
  소득·배우자 유무를 추정해 이 값을 채우거나 검산하는 로직을 두지 않는다(2026-09-18 결정 변경).
- **§155⑧ 부득이 해소일 미입력** — "해소 전"으로 자동 간주해 기한 미기산 처리한다(계획서 W-1 계승,
  이미 확정된 정책). 3년을 임의로 기산하지 않는다.
- **§155의3 직전임대차 1년 6개월 미달** — 자동으로 "직전계약 없음"으로 보정하지 않는다. 명시 미입력과
  미달을 구분해 `undetermined`(미입력) vs `false`(미달, 사유 명시) 로 분리한다.
- **주택 수 이중 트랙(G-1) fallback 금지** — 판정 메뉴는 명부만 보낸다. 엔진은 「명부가 있으면 명부, 없으면
  스칼라」 중 **입력 경로가 정한 한쪽만** 쓴다 — 명부가 있는데 스칼라와 섞거나, 명부가 비었다고 판정 메뉴 결과를
  스칼라로 보정하지 않는다. 명부가 빈 계산기 간이 입력의 스칼라는 fallback이 아니라 **그 경로의 정본**이다(D-4).
  **Q-8 이전 저장 record**에서 스칼라 ≠ 명부이면 조용히 명부로 바꾸지 않는다 — 저장 당시 스칼라를 레거시 표식으로 유지해
  세액을 보존하고, 사용자가 「명부 기준으로 전환」할 때만 명부로 센다(계획서 OH-34).
- **행 속성 ↔ 레거시 세대 단위 값 충돌(D-6)** — 둘 다 있으면 **조용히 한쪽을 고르지 않는다**. 행 우선 + `warnings`에
  「세대 단위 입력(이전 저장분)과 명부 행이 다릅니다」를 남긴다. 행이 없으면 레거시 값을 그대로 쓴다(OH-30 — 세액 보존).
  레거시 값을 어느 행에 붙일지 **자동 추정하지 않는다**(주소·취득일로 추측하면 틀린 행에 붙는다).
- **P6 이관 시 저장 record 승격(OH-21)** — ③·권리 섹션 값을 조용히 버리지 않고 `OneHouseFacts`로
  변환해 보존한다. 자동 안분이 아니라 **자동 승격**이지만 같은 이유로 명시 규칙이 필요하다: 필드가
  하나라도 매핑 규칙이 없으면 재계산 세액이 조용히 바뀐다(V-11 — P6 착수 전 전수표 필수).

---

## 테스트 약속

- **Pre-Do anchor(계획서 §8.1, Do 진입 전 작성·실행)**:
  0. 엔진 추출 전 §3.4 anchor 전건 + 전체 테스트 결과를 스크래치패드에 기록(기준선).
  1. ~~`one-house-155-3-majority-share.anchor.test.ts`~~ — **불요로 종결**. 목적이던 「현행이 최대지분자 기준인가」는
     코드로 답이 나왔다(양도세 축은 사용자 선언 `isLargestCoInheritedShareholder` — `transfer-inheritance-exclusion.ts:66`)
     그리고 기존 `inherited-house-155-3-coinherited.anchor.test.ts`가 지킨다.
  2. `one-house-154-7-multiplier-zone.anchor.test.ts` — OH-07·OH-08.
  3. `one-house-high-value-threshold-era.anchor.test.ts` — G-5 3케이스(A·B 대조·C). 기대값은
     계획서 §8.1-3에 확정됨(A 과세차익 50,000,000·세액 5,659,500 / C 과세차익 57,142,857).
     **"seed만 교정" 케이스를 반드시 함께 둔다** — 안분 하드코딩이 남으면 164,560,000이 나온다
     (부정형 anchor의 긍정 짝, `feedback_negative_anchor_needs_positive_twin`).
- **mutation probe** — P-1(§155④⑤③ 근거 문자열 무력화, 774파일 통과·안전망 0건)이 이미 실행됨.
  상수화(P0)와 anchor는 **한 PR에 묶는다**. P-4(추출된 엔진에서 §155① 분기 무력화)는 계산기·판정
  메뉴 **양쪽 호출부**에서 실패해야 한다 — 엔진이 정말 하나임을 그렇게 증명한다.
- **케이스 인벤토리 표의 모든 행에 대응하는 anchor** — 위 표 참조.
- **회귀 원칙**: OH-01~16·OH-22는 값이 **추출 전후 동일**해야 한다. "불변"은 부정형 단언이므로
  mutation(P-4)으로 확증하기 전까지는 미완료로 취급한다.

---

## UI 통합 위임

UI 측 명세는 `one-house-exemption-automation.ui.design.md` 참조. 판정 메뉴의 14 동기화 지점(A 표면)과
계산기의 14 동기화 지점(B 표면)은 UI 시니어 책임(계획서 §7). 엔진 시니어는 아래 계약만 보장한다:

- `judgeOneHouseExemption` / `resolveHighValueHouseThreshold`의 **함수 시그니처와 필드명**을
  UI 설계 문서가 그대로 참조한다(재정의 금지).
- `OneHouseFacts.houses`/`presaleRights`는 중과 엔진과 같은 `HouseInfo`/`PresaleRight` 타입이다. UI의 `HouseEntry` →
  `HouseInfo` 변환과 D-6 세대 단위 사실 도출은 **각각 함수 하나**에만 있다 — 판정 메뉴 어댑터와 계산기 어댑터가 **같은 함수를 부른다**.
- `pending[].deadline`은 **Date**로만 낸다. UI가 이를 "D-100일" 등으로 가공하지 않는다(Q-4).
- `OneHouseholdInput.isOneHousehold`는 **사용자 토글**로만 채운다. UI가 법 §88 6호·영 §152의3
  요건을 스스로 계산해 이 값을 자동으로 세팅하지 않는다 — 안내 문구는 보여주되 값은 사용자가 정한다.

---

## 확인된 미검증(V-n) — 이번 조사로 해소·미해소 갱신

| ID | 상태 | 근거 |
|---|---|---|
| **V-8** | ✅ **미구현 확인**(추가 조사) | `grep -rn "154⑫" lib/ __tests__/` 전건 0건. §154⑧3호 통산 거주(`consolidateResidenceMonths`, `transfer-tax-exemption-requirements.ts:301`)는 **피상속인-단독상속인** 동일세대 통산이지 **공동상속인 간 최장거주자** 비교가 아니다 — 별개 메커니즘. `OneHouseFacts`는 현재 상속인별 거주기간을 표현할 필드가 없다(`residencePeriodMonths`가 세대 단위 스칼라). §155③ 공동상속 거주요건 자동 판정을 시도하면 이 필드 부재가 먼저 막는다 → **P3·P4 범위에서는 다루지 않고 자기선언(`undetermined` 후보)으로 남긴다.** 구현하려면 `OneHouseFacts`에 상속인별 거주기간 배열이 추가로 필요하며, 그 설계는 별건 계획서로 분리한다. |
| **V-13** | ✅ **종결 — 분할안 채택(계획서 Q-7, 2026-09-18 사용자 결정)** | 아래 「P4ⓑ §155⑳·§89①4호 판정 이관」 절 참조 |
| **G-5 UI 경고 로직 추가 발견** | 참고 | `components/calc/transfer/RedevelopmentRightExemptionSection.tsx:52`도 `HIGH_VALUE_THRESHOLD = 1_200_000_000`을 하드코딩한다(경고 문구용, 세액 미영향). 계획서 5곳 목록에 없던 6번째 지점 — P1에서 `resolveHighValueHouseThreshold` 호출로 함께 전환할지는 UI 설계 문서에서 결정한다. |
| **V-14** | ✅ **종결(해당 없음, 2026-09-18 결정 변경)** | 영 §152의3 3호 소득요건의 기준 중위소득 적용 방식(가구원 수·고시연도·환산기간)은 **엔진이 세대를 판정하지 않기로 결정**되어 조사 대상 자체가 사라졌다. `isOneHousehold`는 사용자 선언이므로 이 소득 기준을 코드로 구현할 지점이 없다. |
| **V-15** | ✅ **종결(해당 없음, 2026-09-18 결정 변경)** | 같은 이유로 영 §152의3 3호 단서(미성년자 예외 사유)의 위임 규칙도 엔진 조사 대상이 아니다. 두 항목 모두 결과 화면의 참고 조문 안내 문구를 작성할 때(UI 설계 문서 몫) 필요하면 그때 별도로 확인한다 — 엔진 input/output에는 영향이 없다. |

---

## P4ⓑ §155⑳·§89①4호 판정 이관 (Q-7 결정)

두 특례는 **판정과 세액 산식이 한 단계 안에 섞여 있다**. 판정 메뉴는 「해당하는가」만 답하고, 계산기는 그 답을 받아 산식을 돈다.

1. **§155⑳** — `runRentalHousingExceptionStep`(`lib/tax-engine/transfer-tax-rental-housing-step.ts`, 676줄)에서
   **요건 판정 술어**(§167의3①2호 장기임대주택 요건·거주주택 2년 거주·임대료 5%·사업자등록)를 순수 함수로 떼어낸다.
   `judgeOneHouseExemption`은 그 술어만 호출하고, 계산기 route는 술어 결과 + §161 입력으로 기존 산식을 그대로 돈다.
   ⚠️ 676줄 파일이라 분리 시 800줄 정책 여유는 있으나, **판정 술어와 산식이 공유하는 중간값**(임대개시일 기준시가 등)이
   두 곳에서 다시 계산되지 않게 술어 결과에 echo한다(`echo-field-pattern`).
2. **§89①4호** — 입주권 양도 비과세 게이트(`transfer-tax-redevelopment-steps.ts` Step A — `:90` 부근 「양도가액 ≤ 12억 → 전액 비과세」)의
   **요건 판정**(가목·나목)을 떼어내 `judgeOneHouseExemption`이 `propertyType`이 조합원입주권일 때 호출한다.
   §166 3분할·12억 안분(`HIGH_VALUE_THRESHOLD` → P1의 시점 함수)은 계산기에 남는다.
3. **세액 불변 증명** — 분리 전후로 `__tests__/tax-engine/rental-housing-exception/` 9건 · 입주권 비과세(§89①4호) anchor
   (`__tests__/calc/one-right-clause-na-plumbing.anchor.test.ts` · `__tests__/calc/one-house-exemption-asset-gate.anchor.test.ts` ·
   `__tests__/tax-engine/transfer/burdened-gift-one-right-exemption-denominator.anchor.test.ts` — grep 실측) 전건 동일값. 분리한 술어에 대응 mutation(P-5)을 넣어 **판정 메뉴·계산기 양쪽 호출부에서** 실패함을 확인한다.
4. ⚠️ `propertyType`의 조합원입주권 값은 enum을 **grep으로 확인한 뒤** 매핑한다(`enum-verification-before-mapping`) — 추정 금지.
5. ⛔ **D-6 철회(2026-09-21)**: 종전 기재는 「`rentalUnits[]`의 출처가 §155⑳ 섹션 목록에서 **명부 ③ 행**으로 바뀐다」였다.
   **P6-c-4(PR #1738)가 반대 방향을 확정했다** — `canDeclareRentalHousingException`은 `assetIndex === 0`(주 자산 전용)이고,
   근거는 엔진 입력 `rentalHousingException`이 `TransferTaxInput` **top-level 단일 객체**(`transfer.types.ts:1027-1032`)라는
   구조다. 명부는 N행이므로 N:1이 맞지 않는다. 판정 사실/산식 입력 분할(이 절 1)은 그대로다.
   ⇒ **도출 함수를 만들지 않는다.** V-18 대응표는 보류가 아니라 **불필요**해졌다(되살리려면 엔진 입력을 자산별
   배열로 바꾸는 별건 결정이 선행돼야 한다). 계획서 §5.10 결정 4.

## D-6 명부 행 → 세대 단위 사실 도출 계약 (계획서 §5.10)

**원칙**: 사실은 행에서 한 번, 판정 규칙은 조문별로, 주택 수는 축별로. 엔진(`checkExemption`·중과 엔진)의 **입력 형태는 바꾸지 않는다** —
P2 세액 불변 증명을 흐리지 않기 위해서다.

**단일 함수** — `deriveHouseholdFactsFromHouses(houses: HouseEntry[], sellingHouseId, legacy)`(신설 `lib/calc/one-house-row-facts.ts`, 순수 함수).
판정 메뉴 어댑터(`one-house-exemption-api.ts`)·단건 계산기(`transfer-tax-api.ts`)·다건 계산기(`multi-transfer-tax-api.ts`)가 **같은 함수를 부른다**
(단건·다건 빌더가 따로 구현했다 갈라진 전례 — `transfer-tax-api-body-blocks.ts` 머리 주석 G-11).

| 행 속성(정본) | 도출되는 엔진 필드 | 도출 규칙 |
|---|---|---|
| 문화유산 여부(신설 — 현행 `HouseEntry`에 없음, 양도 주택만 `sellingHouseExclusion.isCulturalHeritage`) | `culturalHeritageHouse` | 양도 주택이 **아닌** 행 중 해당 행이 정확히 1개일 때 `true` |
| 농어촌 유형·거주연수·귀농 요건(신설) + 행 소재지 | `ruralHouse` | 소재 판정은 행 주소로 `lib/geo/rural-house-location.ts`를 호출(현행 Step4 세대 단위 판정과 같은 함수). 귀농주택 **취득일은 행의 취득일** — 별도 칸을 두지 않는다 |
| 부득이 사유(`isUnavoidableReason` 기존) + 사유 종류(신설) + 해소일(기존) + 행 소재지 | `unavoidableOutsideCapitalHouse` | 🔴 「수도권 밖」은 행의 `region`으로 판정하지 **않는다** — `region`은 「수도권·광역시 등 / 지방」(§167의3 지역기준, `HouseEntryEditor.tsx:92`)이라 광역시가 섞여 있다. 행 `regionCode`(법정동)로 수도권 여부를 따로 판정한다 |
| 장기임대 ③ 행 | `rentalHousingException.rentalUnits` | V-18 확정 후 |

- **양도 주택 행은 §155⑥⑦⑧의 특례 주택이 될 수 없다** — 세 항 모두 「일반주택을 양도하는 경우」다. 양도 행에 속성이 있으면 비과세 도출에서 제외하고
  경고한다(중과 축은 그 행 속성을 그대로 쓴다).
- 같은 속성의 행이 **2개 이상**이면 도출하지 않고 경고한다 — §155⑥⑦⑧은 「각각 1개씩」이고 엔진 필드는 1개만 표현한다
  (그 경우 세대 주택 수가 3 이상이라 `householdHousingCount === 2` 게이트에서 어차피 불성립한다).
- **레거시 값**(P6 이전 record의 세대 단위 입력)은 `legacy` 인자로 받는다. 행 속성이 있으면 행 우선 + 경고, 없으면 레거시 그대로(OH-30).
- **중과 축은 기존 경로 그대로**다 — `buildHousesPayload`가 행 → `HouseInfo`로 옮긴다(부득이 3호 필드 `isUnavoidableReason` 등은 이미 전달).
  ⚠️ **새로 도달하는 값 1건**: 양도 주택이 아닌 행의 문화유산 여부가 `HouseInfo.isCulturalHeritage`로 가면 `isGroupExcludable`
  (`multi-house-surcharge-exclusion.ts:51`)이 그 행을 제외 대상으로 본다. 현행은 양도 주택에서만 이 값이 채워지므로(`transfer-tax-api-houses.ts:49`)
  **중과 결과가 바뀔 수 있다** — P6에서 anchor로 고정하고 결과를 보고한다(`feedback_ui_gate_expansion_activates_latent_defect`).

**테스트 약속(D-6)**
- **동치 anchor(핵심)**: 같은 사실을 ⓐ 레거시 세대 단위 입력으로 ⓑ 명부 행으로 넣었을 때 **엔진 입력과 세액이 같다** — §155⑥·⑦(유형 3종)·⑧ 각각.
  P6에서 입력 위치를 옮겨도 세액이 불변임을 이것으로 증명한다(OH-29·OH-30).
- **mutation**: 도출 함수에서 필드 하나(예: `ruralHouse.kind`)를 떨어뜨리면 동치 anchor가 **실패**해야 한다 — 통과하면 안전망이 없는 것이다.
- **경계**: 양도 행에 속성(도출 제외) · 같은 속성 2행(도출 없음 + 경고) · 행과 레거시 충돌(행 우선 + 경고) · 광역시 소재 부득이 주택(`region: "capital"`이지만 수도권 밖 → 도출됨).

## P2 추출 절차 요약 (세액 불변 리팩터)

1. `lib/tax-engine/one-house/` 신설, `judge.ts`·`types.ts`·`threshold.ts` 3파일.
2. **이동 없이 re-export**로 시작: `judge.ts`는 내부에서 `checkExemption`(`transfer-tax-exemption.ts`)을
   호출하고, `OneHouseFacts`/`OneHouseSale`을 기존 `TransferTaxInput` 형태로 조립하는 **어댑터**로
   시작한다(진짜 로직 이동은 후속 PR — "다시 쓰지 않는다" D-1 원칙 유지).
3. `transfer-tax.ts`(계산기 route가 최종 호출하는 orchestrator)가 이 어댑터를 거치도록 1줄만 바꾼다.
4. §8.1-0 기준선과 P2 이후 값을 diff — 0건이어야 통과(OH-22).
5. 어댑터가 안정되면(P4 착수 시점) 실제 판정 로직을 `judge.ts`로 이동하고 `checkExemption`을
   `judge.ts`를 호출하는 얇은 래퍼로 뒤집는다(방향 전환 — 이 시점부터 `judge.ts`가 정본).

---

## 남은 설계 위임 (UI 문서로)

- 판정 메뉴 4단계 마법사의 폼 상태 타입(`Pick<TransferFormData, …>` 호환 목록 확정) — 계획서 §5.9.
- 계산기 「이 결과로 세액 계산」 진입 헬퍼(`lib/calc/transfer-resume-entry.ts` 계열 재사용) 배선.
- 결과 화면의 `pending[]`·`undetermined[]` 렌더링(ToneCard 톤 매핑 — amber/rose/violet 어느 것을
  판정 보류·조건부에 쓸지).
- V-11(P6 이관 입력 전수 매트릭스) — 엔진 필드는 위 `OneHouseFacts`로 확정됐으니 UI 문서가 계산기
  ③·권리 3섹션의 **모든 폼 필드**를 이 목록에 1:1 매핑하는 표를 작성한다.
