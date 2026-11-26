# 지분 양도 × 가업상속공제 자산(§97의2④) — 엔진·배선 계획서

작성일: 2026-11-26 · 브랜치: `docs/fb-share-plan`(워크트리 `Property-related-Taxes-fb-share-plan`) · 문서 전용(코드·커밋·push 없음) · 코드 기준: master `7e8015fbd` — 본문 file:line은 이 기준
짝 문서: `transfer-fb-share.ui.plan.md`(UI 계획서 — 병렬 작성). **필드·함수·echo 이름은 이 문서가 정본**이다(§5.3).

대상: 「소득세법」 §97의2④ · 「소득세법 시행령」 §163의2③④ · 「상속세 및 증여세법」 §18의2·§18의2⑩ · 「상속세 및 증여세법 시행령」 §15⑤㉑
선행 문서: `transfer-fb-lthd-portion-gain.engine.plan.md`(PR #3678 — 맨 끝 「M-3 처리」가 이 결함을 «범위 밖»으로 남겼다) · `fb-97-2-4-fixes.plan.md`(F-1 주식 · F-2 · F-3) · `transfer-fb-lthd-95-4-latter.plan.md`

---

## 0. 요약

| 항목 | 내용 |
|---|---|
| 결함 | ④가 `familyBusinessInheritance`(피상속인 취득가액·상속개시일 평가액·자본적지출)를 **지분율로 줄이지 않고** 보낸다(`lib/calc/transfer-tax-api.ts:694-698`). 양도가액·취득가액·양도비·자본적지출은 줄어든다(`:332` `shareOf`·`:372`·`:442`). 의제 취득가액이 **물건 전체 값**으로 지분분 양도가액에서 빠진다. |
| 실측 | 교재 이월과세5 사례(토지 · 적용률 70%)를 **지분 1/2**로 바꾸면 현행 양도차익 **85,000,000** · 산출세액 **9,552,000** ↔ 지분분 기준 **485,000,000** · **115,980,000**. **지분 33%**는 현행이 **양도차손 −215,900,000 → 세액 0**이다(§4). |
| 도달 경로 | **실제로 도달한다.** 단건 지분 + 「나머지 지분은 타인 소유」 선언은 ⑧을 통과한다(issues `[]`). 축 B 번들의 첫(주) 카드와 함께양도 주 자산도 통과한다(§2). **「단독 카드 지분 1/2는 ⑧이 막는다」는 선언이 없을 때만 참이다.** |
| 부수 발견 → **사용자 결정: 지원** | **주 자산이 아닌 카드(2번째 이후)에 켠 가업상속 입력은 ⑧을 통과하고 계산에 반영되지 않는다**(축 B 2번째 카드·함께양도 2번째 카드 — 침묵 폐기, 지분과 무관하게 100% 카드도 같다). 사용자가 **Q-5 = «둘째 이후 카드도 지원»**을 결정했다(추천 «⑧ 차단»과 다름) → **§12 지원 설계**. 엔진 STEP 0.42는 번들에서 카드(item)마다 이미 호출되므로 **엔진 신규 호출은 없고, 배선(④ 컴패니언 payload · ⑫ 컴패니언 Zod · ⑭ `companionEngine`)만 열면 된다**(§12.2 실측). |
| 설계 한 줄 | 가업상속 입력의 단위를 **물건 전체(100%) 기준**으로 확정하고, **엔진 STEP 0.42가 `ownershipRatio`로 세 금액(피상속인 취득가액·평가액·자본적지출)을 줄인다**. 적용률(분수·법정량)은 지분과 무관 — 건드리지 않는다. |
| #3678 가드 | 엔진이 줄이므로 슬라이스 전제(`양도가액과 의제 두 항이 같은 지분 스케일`)가 **구성상 성립**한다 → `ownershipRatio < 1` 가드를 푼다. `totalPropertyTransferPrice ≠ 양도가액` 가드는 **`ownershipRatio`가 없을 때만** 남긴다(§5.5). |
| 입력 필드 | 엔진 데이터 필드 **추가·변경 0**. 14지점: 지분 결함 자체(§6)는 엔진 · ⑤ · ⑦ · ⑧만 바뀐다. **둘째 이후 카드 지원(§12)이 ④ 컴패니언 payload · ⑩ · ⑫ 컴패니언 스키마 · ⑭ `companionEngine`을 추가로 연다.** UI 계획서가 정의하는 «전체 기준 확인» 토글(`shareBasisConfirmed` 가정)은 **표시·검증 전용 — 엔진·⑫는 읽지 않는다**(§12.6). |
| 주식 | **무관.** 주식은 1주당 단가 × 주식수 — 부분 양도가 이미 수량이다(`stock-family-business.ts` 머리 주석 · 계획서 F-1 §7). §5.8. |

---

## 1. 법령 (KoreanLaw MCP `get_law_text` — 2026-11-26 · 소득세법 MST 280405 / 시행령 MST 290841 / 상증법 MST 276123 / 상증령 MST 290845)

### 1.1 「소득세법」 §97의2④ (verbatim)

> ④ 「상속세 및 증여세법」 제18조의2제1항에 따른 공제(이하 이 항에서 "가업상속공제"라 한다)가 적용된 **자산**의 양도차익을 계산할 때 양도가액에서 공제할 필요경비는 제97조제2항에 따른다. 다만, 취득가액은 다음 각 호의 금액을 합한 금액으로 한다.
> 1. 피상속인의 취득가액(제97조제1항제1호에 따른 금액) × 해당 자산가액 중 가업상속공제가 적용된 비율(이하 이 조에서 "가업상속공제적용률"이라 한다)
> 2. 상속개시일 현재 해당 자산가액 × (1 - 가업상속공제적용률)

- 「해당 자산가액」·「피상속인의 취득가액」의 **소유 지분 단위는 법문에 없다.** §97의2④는 «가업상속공제가 적용된 **자산**의 양도차익»을 계산한다 — 양도한 것이 자산의 일부 지분이면 «자산»은 양도한 지분이라고 읽는 것이 §97①1호가목 「제94조제1항 각 호의 자산 **취득에 든** 실지거래가액」의 대응(양도가액 ↔ 취득가액이 같은 대상)과 맞다. **다만 지분 양도를 직접 정한 조문·해석례는 확인되지 않는다 → V-1.**

### 1.2 「소득세법 시행령」 §163의2③·④ (시행일 20261001 본)

> ③ 법 제97조의2제4항을 적용할 때 가업상속공제적용률은 다음 각 호의 구분에 따른 비율로 한다.
> 1. 「소득세법」을 적용받는 가업(이하 "개인가업"이라 한다)의 경우: 「상속세 및 증여세법」 제18조의2제1항에 따라 상속세 과세가액에서 공제한 금액(이하 이 호에서 "가업상속공제금액"이라 한다)을 같은 항 각 호 외의 부분 전단에 따른 가업상속 재산가액으로 나눈 비율. **이 경우 가업상속공제가 적용된 자산별 가업상속공제금액은 가업상속공제금액을 상속 개시 당시의 해당 자산별 평가액을 기준으로 안분하여 계산한다.**
> 2. 「법인세법」을 적용받는 가업(이하 "법인가업"이라 한다)의 경우: … 총자산가액 … 중 … 사업무관자산을 제외한 자산가액이 차지하는 비율
> ④ 법 제97조의2제4항의 적용 대상이 되는 가업상속공제가 적용된 자산은 다음 각 호의 구분에 따른 자산으로 한다. 1. 개인가업의 경우: 「상속세 및 증여세법 시행령」 제15조제5항제1호에 따른 사업용 자산 2. 법인가업의 경우: … 제15조제5항제2호에 따른 주식등

- **적용률은 («공제금액 ÷ 가업상속 재산가액») — 자산·지분과 무관한 상속인 단위 비율**이다. 후단이 자산별 공제금액을 «평가액 기준 안분»으로 계산한다고 못 박으므로 **모든 자산의 적용률은 같다** → 양도 지분이 달라도 `fbRateBasis`·`fbDeductionAppliedRate`는 그대로다.

### 1.3 「상속세 및 증여세법 시행령」 §15⑤㉑

> ⑤ … "가업상속 재산가액"이란 … **제3항제2호의 요건을 모두 갖춘 상속인(이하 "가업상속인")이 받거나 받을 상속재산의 가액**을 말한다. 1. 「소득세법」을 적용받는 가업: 가업에 직접 사용되는 토지(…), 건축물, 기계장치 등 사업용 자산의 가액에서 해당 자산에 담보된 채무액을 뺀 가액 …
> ㉑ 법 제18조의2제10항 본문에서 "…양도소득세 상당액"이란 같은 조 제1항에 따른 가업상속공제를 받고 **양도하는 가업상속 재산**에 대하여 「소득세법」 제97조의2제4항을 적용하여 계산한 양도소득세액에서 같은 법 제97조를 적용하여 계산한 양도소득세액을 뺀 금액을 말한다.

- 가업상속 재산가액(→ 적용률의 분모)은 **상속인 단위**(공동상속이면 그 가업상속인이 받는 몫)다. 입력의 «가업상속공제금액·가업상속 재산가액»은 지분율과 무관한 상속인 값이어야 한다 — **UI 힌트에서 명시**(UI 계획서 몫).
- ㉑ «양도하는 가업상속 재산에 대하여» — 지분 양도면 **양도하는 부분**의 두 세액 차이다. 두 재귀가 같은 지분 스케일이어야 `creditAmount`가 성립한다(§5.2).

### 1.4 해석례·판례 검색 결과 (KoreanLaw MCP — 지분 × §97의2④ 직접 근거 **0건**)

| 도메인 · 키워드 | 결과 |
|---|---|
| nts · 「가업상속공제 지분 양도」 | 1건 — 법규과-2246(서면-2022-법규재산-1704, 2023.09.01.): **공동상속인간 주식 지분 양도 시 사후관리(상증법 §18의2⑤) 추징** — §97의2④·양도차익 계산과 무관. 다만 **공동상속인이 «공동으로 가업상속공제를 받는» 경우가 있음**을 전제한다. |
| nts · 「공동상속 가업상속공제 양도 취득가액」·「가업상속공제 양도차익」·「가업상속공제적용률」·「가업상속공제 양도소득세 취득가액」·「공유지분 양도 취득가액 지분비율 안분」 | 0건(NOT_FOUND) |
| tax_tribunal · 「가업상속공제 양도」 | 2건 — 조심 2021서2572·2021서6675: 둘 다 **상속세 사후관리**(주식 양도·증여) — §97의2④ 무관 |
| tax_tribunal · 「가업상속공제 양도소득 취득가액 97조의2」 | 0건 |
| interpretation · 「가업상속공제 양도소득세」 | 0건 |
| precedent · 「가업상속공제 양도소득」 | 2건 — 서울고법 2024누53255(2025.12.04.)·대법원 2026두30294 심리불속행(2026.05.22.): **주식**에서 «가업상속공제가 적용된 주식(수량)»과 아닌 주식을 구분·관리해 전자만 §97의2④ 적용. 부동산 지분과 무관, 주식은 이미 수량 단위(§5.8). |

→ **지분 양도 시 §97의2④ 피상속인 취득가액·«해당 자산가액»을 양도 지분분으로 읽는다는 처리는 법문 해석(V-1)이다.** 반대 해석(물건 전체 값을 지분분 양도가액에서 빼기)은 의제 취득가액이 양도가액보다 커지는 구조(현행 §4 S33 — 양도차손)로 귀결돼 §97②의 «양도가액 − 필요경비» 대응을 깨므로 채택할 수 없다.

---

## 2. 도달 경로 실측 (probe — 화면 입력 ⑧ → ④ body → route → 엔진, mock 세율)

공통: 토지 · 상속 2022-04-10 · 양도 2026-10-15 · 총 양도가 18억 · 피상속인 취득 2012-03-08 5억(→ 28% 구간) · 상속개시일 평가액 15억 · 적용률 70%(`deduction_ratio` 7억 ÷ 10억) · 양도비 3천만. 헬퍼 `captureBody`→`POST`(`__tests__/calc/_one-house-pr3a-calc-route.ts`) — 지분 계열 anchor와 같은 하네스.

### 2.1 도달 표

| # | 경로(폼) | ⑧ issues | body·route | 현행 결과 |
|---|---|---|---|---|
| R-1 | **단건 지분 1/2 + 「나머지 지분은 타인 소유」 선언**(`ownershipRemainderThirdParty: "yes"`) | **`[]` 통과** | 200 · `ownershipRatio 0.5` · `transferPrice 900M` · `acquisitionPrice 750M` · 양도비 15M · **FB `[500M, 1.5B]` 그대로** | 양도차익 85,000,000 · 산출세액 9,552,000 |
| R-2 | 단건 지분 1/2, **선언 없음** | 「지분 모드 자산(50%)은 단독으로 계산할 수 없습니다…」 차단 (`transfer-tax-validate-asset.ts:386`) | (계산 시도 시) R-1과 같은 body | — (⑧이 막음) |
| R-3 | **축 B**(`assetSplitMode: "fractional"`) 첫 카드 상속+FB 50% · 둘째 카드 매매 50% | `[]` 통과 | 200 · 번들 · `primary`에 FB 100% 값 그대로 | 합계 양도차익 385,000,000 (주 자산 85,000,000 + 매매 카드 300,000,000) · 산출세액 112,380,000 · FB echo 의제 800,000,000 |
| R-4 | 축 B 첫 카드 상속+FB 50% · 둘째 카드 **일반 상속** 50% | `[]` | 200 | 합계 양도차익 220,000,000 (주 자산 85,000,000 + 일반 상속 카드 135,000,000) |
| R-5 | **함께양도**(`assetSplitMode: "companion"`) 주 자산 상속+FB 50% 지분 + 다른 물건 100% | `[]` | 200 · FB echo 의제 800,000,000 | 주 자산 양도차익 85,000,000(번들 안) |
| R-6 | 다건 연간 합산(`/multi-transfer`) | `MULTI_FAMILY_BUSINESS_UNSUPPORTED_MESSAGE` 차단(`multi-transfer-tax-validate.ts:176`) | — | **범위 밖 — 차단 유지** |
| R-7 | 겸용주택 · 일반건물(GB) | 차단(`transfer-tax-validate-asset.ts:470` · `allowsFamilyBusinessInheritance`) | — | **범위 밖 — 차단 유지** |

- 정정: 의뢰문의 «단독 카드 지분 1/2는 ⑧이 막는다»는 **R-2에만** 해당한다. **R-1처럼 선언하면 통과**하며 이것이 «공동상속인 중 1인 / 단독 상속 후 일부 지분 양도»의 정상 입력 경로다.
- 모든 도달 경로에서 `ownershipRatio`가 body에 실린다(`transfer-tax-api.ts:442` `ownershipRatio: ownershipRatioForDeduction` — 지분일 때만) → route(`route.ts:255`·`engine-input.ts:385`)·번들 primary(`bundled-route.ts:283·299`)가 엔진에 넘긴다 — R-1·R-3·R-5 body에서 확인. **엔진이 이 값을 읽는 설계(§5.2)의 전제가 이미 성립한다.**

### 2.2 FB 입력 5필드 중 지분이 닿는 것

`transfer-tax-api.ts:694-698`이 `primary.familyBusinessInheritance`를 **통째로** 실어 보낸다. 금액 3필드(`decedentAcquisitionPrice`·`inheritanceMarketValue`·`decedentCapitalExpenditure`)가 물건 전체 값이고, 나머지(`fbDeductionAppliedRate`·`fbRateBasis`·`inheritanceDate`)는 지분과 무관하다(§1.2).

### 2.3 주 자산이 아닌 카드의 FB — 침묵 폐기 (별건 D-2)

| # | 경로 | ⑧ | body | 결과 |
|---|---|---|---|---|
| D-2a | 축 B **둘째 카드**가 상속+FB(첫 카드 매매) | `[]` 통과 | 컴패니언 `companionAssets[0]`에 **FB 키 없음**(`inheritanceValuation`만) | 합계 양도차익 **435,000,000 = FB를 지운 대조군(SB2b) 435,000,000** → FB가 **버려졌다** |
| D-2b | 함께양도 **둘째 카드**가 100% 상속+FB | `[]` 통과 | 컴패니언에 FB 키 없음 | 응답 어디에도 `familyBusinessDetail` 없음 |

- **사용자 결정(2026-11-26): 지원한다 — §12.** 아래는 결정 전 실측·원인이다.
- 원인: ⑤ 렌더 술어 `allowsFamilyBusinessInheritance(asset)`(`CompanionAcquisitionCauseSection.tsx:419`)에 **카드 순서 조건이 없고**, ④ 컴패니언 payload(`transfer-tax-api-companion-payload.ts`)는 FB를 싣지 않으며(grep 0건), ⑫ 컴패니언 스키마에는 FB 키가 없다(`transfer-tax-schema-required-refines-2a.ts:506` 주석). **지분 결함과 독립**이라 별도 PR로 다룬다(Q-5).
- 카드 순서를 바꾸는 UI는 없다(`CompanionAssetsSection.tsx` — `onRemoveAsset`뿐) → ⑧ 차단은 막다른 길 위험(카드 삭제·재추가가 유일 우회)이었다. 지원 결정으로 이 위험이 사라진다.
- **현행은 카드 순서에 따라 값이 갈린다**(둘 다 틀림): FB 카드가 첫 카드면 합계 양도차익 385,000,000 · 산출세액 112,380,000, 둘째 카드면 435,000,000 · 135,540,000(FB를 지운 대조군과 같음). 지원 후에는 순서와 무관하게 **785,000,000 · 231,516,000**(§12.4).

---

## 3. 시나리오별 올바른 계산 (손계산 — 입력 단위 결정의 근거)

기호: P 양도가액 · E 필요경비 · A_d 피상속인 취득가액 · V 상속개시일 평가액 · c 자본적지출 · r 양도 지분율 · n/d 적용률. **A_d·V·c는 물건 전체(100%) 입력.**

### 3.1 (a) 공동상속인 중 1인이 상속받은 지분 전부를 양도

- 카드 지분율 r = 그 상속인의 상속 지분(물건 전체 대비). 양도가액·취득가액·양도비는 이미 100% 입력 × r(`shareOf`).
- 법문 대응: §97의2④1호 «피상속인의 취득가액» = 양도한 지분에 대응하는 몫 = A_d × r · 2호 «상속개시일 현재 해당 자산가액» = 양도한 지분의 평가액 = V × r.
- **적용률 n/d는 가업상속인 단위**(§1.3) — 그 상속인이 받은 가업상속 재산가액·공제금액. 물건의 지분율을 곱하지 않는다.
- 입력 단위: 사용자는 **물건 전체의 피상속인 취득가·평가액**을 입력(상속세 계산기 이력 prefill — `candidateToPrefill`(`family-business-inheritance-lookup.ts:343`)이 `EstateItem.marketValue`를 `inheritanceMarketValue`에 넣는다 — 의 단위와 같다, **V-2 확인 필요**: EstateItem이 물건 전체 단위로 입력되는지).

### 3.2 (b) 단독 상속 후 일부 지분만 양도

- 계산은 (a)와 **동일**하다 — 카드 지분율 r = 양도하는 지분 ÷ 물건 전체, 입력은 상속받은 물건 전체 기준.
- 화면 표현: 이 앱의 «공유 지분율» 칸은 «이 물건 중 내 몫»이고 선언 문구는 「나머지 지분은 타인 소유입니다」(`OwnershipRatioInput.tsx:148-152`)다. 양도하지 않고 **내가 계속 보유**하는 나머지 지분은 «타인 소유»가 아니므로 문구가 사실과 어긋난다 → UI 계획서 몫(V-5). 엔진 계산은 영향 없음.

### 3.3 (c) 축 B 지분 분할 취득 — 일부는 상속(FB), 일부는 매매

- 카드마다 취득원인·지분율이 다르다. **FB는 상속 카드(그리고 현행 구조상 첫 카드)에만** 실린다(§2.3). 그 카드의 r로 줄인다. 다른 카드(매매 등)는 자기 취득가액 그대로.
- 합계 = Σ 카드 양도차익 → 합산 공제·기본공제 1회 → 누진(번들 집계 — 현행 로직 불변).
- `totalPropertyTransferPrice`(12억 안분 분모)는 물건 전체 값 그대로(양도가액 지분분 ≠ 분모 — 정상).

### 3.4 손계산 — 교재 이월과세5 × 지분 1/2 (§4 S0h와 같은 입력)

A_d' = ⌊5억 × 1/2⌋ = 250,000,000 · V' = ⌊15억 × 1/2⌋ = 750,000,000 · c 없음.
tD = ⌊250,000,000 × 7/10⌋ = 175,000,000 · tH = ⌊750,000,000 × 3/10⌋ = 225,000,000 → **의제 취득가액 400,000,000**.
P = 900,000,000 · E = 15,000,000 → **양도차익 G = 485,000,000**.
§95④ 후단 슬라이스: X = 885,000,000 · ⌊X × 7/10⌋ = 619,500,000 · gD = 619,500,000 − 175,000,000 = 444,500,000 · gH = 40,500,000 →
장특 = 444,500,000 × 28% + 40,500,000 × 8% = 124,460,000 + 3,240,000 = **127,700,000**.
과세표준 = 485,000,000 − 127,700,000 − 2,500,000 = **354,800,000** → 산출세액 = 354,800,000 × 40% − 25,940,000 = **115,980,000**.
일반 §97 재귀(V' 기준): G = 135,000,000 · 장특(비례) 29,700,000 → 과세표준 102,800,000 → **20,540,000** → `creditAmount` = 115,980,000 − 20,540,000 = **95,440,000**.

---

## 4. Pre-Do 실측 (실행 결과만 — throwaway probe `__tests__/api/zz-probe-fb-share.tmp.test.ts`, 작성 후 삭제함)

모든 «현행» 칸은 화면 경로(⑧→④→route→엔진) 실행값이다. «오라클»은 **같은 엔진에 입력을 r배로 줄인 100% 단건**(= 계획 후 지분 카드가 내야 하는 값)을 넣어 얻은 실행값이다.

| 시료 | 구분 | 양도차익 | 장특 | 과세표준 | 산출세액 | 의제 취득가액 | `creditAmount` | 일반 §97 세액 | 장특 방식 |
|---|---|---|---|---|---|---|---|---|---|
| **S0** 단건 100% (교재) | 현행 | 970,000,000 | 255,400,000 | 712,100,000 | 263,142,000 | 800,000,000 | 204,004,000 | 59,138,000 | 슬라이스 |
| **S0h** 반 크기 단건 (양도 9억·취득 7.5억·양도비 1,500만·FB 2.5억/7.5억) | **오라클 = 계획 후 r=1/2 기대값** | 485,000,000 | 127,700,000 | 354,800,000 | 115,980,000 | 400,000,000 | 95,440,000 | 20,540,000 | 슬라이스 |
| **SA** 지분 1/2 (FB 100% 입력) | **현행** | **85,000,000** | **18,700,000** | **63,800,000** | **9,552,000** | **800,000,000** | **9,552,000** | **0** | 비례(가드 후퇴) |
| **SA-pre** SA에 FB를 ×1/2 한 입력 + 현행 가드 | Q-4 (나)안 실측 | 485,000,000 | 106,700,000 | 375,800,000 | 124,380,000 | 400,000,000 | 103,840,000 | 20,540,000 | 비례 |
| **SC** 자본적지출 4천만 · 지분 1/2 | 현행 | 57,000,000 | 12,540,000 | 41,960,000 | 5,034,000 | 828,000,000 | 5,034,000 | 0 | 비례 |
| **SC-or** 자본적지출 2천만 반 크기 단건 | 오라클 | 471,000,000 | 123,780,000 | 344,720,000 | 111,948,000 | 414,000,000 | 91,408,000 | 20,540,000 | 슬라이스 |
| **S33** 지분 33% | **현행** | **−215,900,000 (차손)** | 0 | 0 | **0** | 800,000,000 | 0 | 0 | — |
| **S33-or** 입력을 33%로 줄인 단건 (A_d 165,000,000 · V 495,000,000 · P 594,000,000 · E 9,900,000) | 오라클 | 320,100,000 | 84,282,000 | 233,318,000 | 68,720,840 | 264,000,000 | 58,401,320 | 10,319,520 | 슬라이스 |

- **SA 현행 body**: `transferPrice 900,000,000` · `acquisitionPrice 750,000,000` · 양도비 15,000,000 · `ownershipRatio 0.5` · `totalPropertyTransferPrice 1,800,000,000` · FB `[500,000,000 / 1,500,000,000]`. 일반 §97 재귀가 V=15억을 취득가액으로 덮어 차손 → 일반 세액 0 → `creditAmount`가 의제 세액 전체(9,552,000)로 잘못 커진다.
- **SA-pre vs S0h**: 입력을 올바르게 줄여도 **가드(`ownershipRatio < 1`)가 살아 있으면** 장특이 106,700,000(비례)이고 세액이 124,380,000 — 오라클 115,980,000과 **8,400,000** 어긋난다. 그래서 Q-2·Q-4가 한 묶음이다.
- **SC**: 자본적지출도 줄지 않는다(4천만 전액이 1호 base에 가산) — 엔진이 capex를 지분율로 줄이는 이유.
- **S33**: 지분율 33%·70%·57% 등 «소수 비율»에서 `applyRatio`의 BigInt 정확 경로가 쓰인다(`tax-utils.ts:131`). 계획의 절사 규약이 이 함수다(Q-3).
- 번들(축 B) 합계: R-3(SB1) 합계 양도차익 385,000,000 · 장특 36,700,000 · 과세표준 345,800,000 · 산출세액 112,380,000(주 자산 의제 800,000,000 · `creditAmount` 10,152,000 — 번들 안 재귀의 과세표준이 단건보다 기본공제 2,500,000원만큼 커서(66,300,000 ↔ 63,800,000) 세액이 600,000원 다르다). 대조군 SB3(매매 50% + 매매 50%): 합계 양도차익 600,000,000 · 장특 36,000,000(카드당 18,000,000) · 과세표준 561,500,000 · 산출세액 199,890,000.
- **계획 후 번들 기대값(손계산)**: 주 자산 = S0h 값(양도차익 485,000,000 · 장특 127,700,000) + 매매 카드(300,000,000 · 18,000,000) → 합계 양도차익 **785,000,000** · 장특 **145,700,000** · 양도소득금액 639,300,000 · 기본공제 2,500,000 → 과세표준 **636,800,000** → 산출세액 636,800,000 × 42% − 35,940,000 = **231,516,000**(구현 시 anchor로 실행 확정 — 번들 안에서 슬라이스가 같은 값을 내는지는 V-4).
- 형제 경로: R-4(SB4) 합계 양도차익 220,000,000 · 산출세액 51,500,000(주 자산 85,000,000 + 일반 상속 카드 135,000,000) — 일반 상속 카드는 이미 지분분 취득가액(750,000,000)이라 **주 자산 FB 카드만** 전체 값이 새는 불일치다.

---

## 5. 설계

### 5.1 입력 단위 — 물건 전체(100%) 기준으로 확정 (Q-1)

- 이 카드의 다른 금액 칸(양도가액·취득가액·양도비·자본적지출)은 모두 «100% 기준 입력 → 시스템이 지분율 적용»이다(`OwnershipRatioInput.tsx:13` · `transfer-tax-api.ts:221`). FB 칸만 단위가 비어 있었다. 같은 카드에서 단위를 섞으면 그 자체가 오산 원인이다.
- 상속세 이력 prefill(`inheritanceMarketValue ← EstateItem.marketValue`)이 물건 전체 단위로 채우는 경로와도 일치한다(V-2 확인).
- **적용률 입력(공제금액·가업상속 재산가액 또는 %)은 상속인 단위** — 지분율 무관(§1.2·§1.3). 라벨·힌트에서 구분(UI 계획서).

### 5.2 곱하는 위치 — 엔진 STEP 0.42 (Q-2)

`applyFamilyBusinessCgtStep`(`lib/tax-engine/transfer-tax-family-business.ts:241` `const fb = rawInput.familyBusinessInheritance`) **첫머리에서** 세 금액을 `rawInput.ownershipRatio`로 줄이고, 이후 의제·일반 두 재귀·`buildFamilyBusinessCgtDetail`이 모두 줄인 값을 쓴다.

선례: **sub-object 100% 입력 → 엔진이 `ownershipRatio`로 줄이는** 구조가 이미 있다 — 부담부증여 `scaleBurdenedGiftInfo(info, ownershipRatio)`(`burdened-gift-valuation.ts:90`) · `transfer-tax-burdened-gift-step.ts:73`. 반면 최상위 금액 필드(양도가·취득가·양도비)는 ④가 줄인다. FB는 sub-object이므로 전자에 속한다.

| 선택 | 장점 | 단점 |
|---|---|---|
| **엔진(추천)** | 단일 소스 · 단건·축 B·함께양도·직접 API가 같은 값 · 슬라이스 가드 해제가 구성상 안전(§5.5) · ④ 무변경이라 ⑬ stripping·이중 스케일 점검 면적 최소 | 직접 API 호출자의 «FB는 지분분» 암묵 가정이 바뀐다(내부 소비자는 ④뿐 — `familyBusinessInheritance` grep으로 확인) |
| ④ | 최상위 금액과 같은 자리 | 슬라이스 가드를 풀 근거가 엔진에 없다(플래그 신설 필요) · 직접 API 우회 |
| ⑧만(차단) | 구현 최소 | 공동상속 1인·일부 지분 양도 FB 계산 **불가**(R-1 정상 경로가 막다른 길) |

### 5.3 신설·변경 이름 (정본)

**새 leaf `lib/tax-engine/family-business-share.ts`**(순수 함수 · 약 45줄 · 부동산 전용 — 주식 미사용):

```ts
export interface FamilyBusinessShareScaled {
  /** 줄인 입력 — 이후 모든 산식은 이것을 쓴다 (r ≥ 1 또는 undefined면 입력 객체 그대로 — 비트 동일) */
  fb: FamilyBusinessInheritanceTransferInput;
  /** 지분율 < 1일 때만 */
  ownershipRatio?: number;
  /** 줄이기 전(물건 전체) 입력 echo — 지분일 때만 */
  whole?: { decedentAcquisitionPrice: number; inheritanceMarketValue: number; decedentCapitalExpenditure?: number };
}
export function scaleFamilyBusinessInheritanceByShare(
  fb: FamilyBusinessInheritanceTransferInput, ownershipRatio: number | undefined): FamilyBusinessShareScaled;
export const FB_SHARE_SCALE_NOTICE: (percent: string) => string;  // «확인 필요» 고지 (Q-6)
```

- 구현: `applyRatio(amount, ownershipRatio)`(`tax-utils.ts:131` — 이 저장소의 지분 적용 단일 규약) 세 금액에만. `fbDeductionAppliedRate`·`fbRateBasis`·`inheritanceDate`는 **불변 통과**. `Math.round`·부동소수 곱 금지.
- **소비처 단일화**: 엔진 STEP 0.42 · ⑤ 의제 취득가액 미리보기(`FamilyBusinessInheritanceTransferSection.tsx` `calcImputedPreview`) · ⑧(지분분 평가액 > 0 점검)이 **같은 leaf**를 부른다(skill `single-source-engine-helper`).

**`FamilyBusinessCgtDetail` echo(optional 추가 — skill `echo-field-pattern`)**:

| 필드 | 의미 |
|---|---|
| (기존) `decedentAcquisitionPrice`·`inheritanceMarketValue`·`decedentCapitalExpenditure?` | **지분분(산식에 쓴 값)** — 기존 산식 카드 `피상속인 원취득가액 × 적용률 + 평가액 × (1−적용률) = 의제`가 자기일관을 유지한다(A22 교훈 — 표 안의 세 숫자가 서로 맞아야 함) |
| `ownershipRatio?: number` | 지분율 < 1일 때만 |
| `wholeInput?: { decedentAcquisitionPrice; inheritanceMarketValue; decedentCapitalExpenditure? }` | 줄이기 전 물건 전체 입력 — 카드 «물건 전체 × 지분율 = 지분분» 표시용 |

결과 `warnings`에 `FB_SHARE_SCALE_NOTICE`(지분일 때만). 문구는 `TRANSFER.CARRYOVER_FAMILY_BUSINESS` 상수를 재사용하고 새 조문 인용은 없다(`additions-transfer.ts`의 §97의2④ 등록 재사용 — 새 매니페스트 항목 불필요, V-6 확인).

### 5.4 정수 연산·절사 순서 (Q-3)

```
A'  = applyRatio(A_d, r)        // 항목별 선절사 — 지분 적용 단일 규약
V'  = applyRatio(V,   r)
c'  = applyRatio(c,   r)
tD  = ⌊(A' + c') × n / d⌋      // 기존 calcFamilyBusinessImputedAcquisitionTerms 그대로
tH  = ⌊V' × (d − n) / d⌋
의제 = tD + tH
```

- 이 순서는 **«입력을 applyRatio로 줄인 100% 단건»과 비트 동일**이다(S0h·S33-or 오라클이 같은 입력 규칙) — anchor 불변식 `지분 r 카드 ≡ 입력을 r배한 단건`(12억 비개입 토지).
- 일반 §97 재귀의 취득가액 `acquisitionOverride: V'`은 ④가 일반 지분 상속 취득가액에 쓰는 `shareOf(15억) = applyRatio(15억, r)`과 **같은 값**이다 — 일반·의제 두 세액이 같은 스케일.
- 대안(나) 단일 정확 분수 `⌊A_d·r·n/d⌋`는 항별 최대 1원 다를 수 있다(예: A_d=7원 · r=1/2 · n/d=9/10 → 선절사 ⌊⌊3.5⌋×0.9⌋ = 2 ↔ 단일 ⌊7×0.45⌋ = 3). 오라클 동일성·일반 §97 재귀 정합·단일 규약 때문에 (가)를 추천.
- `r ≥ 1`·`undefined`는 입력 객체를 그대로 돌려준다 → 100% 자산의 기존 결과·anchor는 **비트 동일(회귀 0)**.

### 5.5 §95④ 후단 슬라이스 가드 (Q-4)

`family-business-lthd-slices.ts:112-116` `fbSlicePremiseHolds` 현행:

```ts
if (premise.acquisitionUsed !== terms.decedentTerm + terms.heirTerm) return false;
if (premise.ownershipRatio !== undefined && premise.ownershipRatio < 1) return false;   // ← 해제 대상
return premise.totalPropertyTransferPrice === undefined || premise.totalPropertyTransferPrice === premise.transferPrice;
```

변경(안):

```ts
if (premise.acquisitionUsed !== terms.decedentTerm + terms.heirTerm) return false;
// 지분: 의제 두 항을 STEP 0.42가 같은 ownershipRatio로 줄였고 양도가액·필요경비도 지분분이다 → 양도가액이 물건 전체가 아니어도 X = P − E가 성립한다.
if (premise.ownershipRatio !== undefined && premise.ownershipRatio < 1) return true;
// 지분이 아닌데 총 물건가 ≠ 양도가액이면 원인을 모른다 — 종전대로 후퇴
return premise.totalPropertyTransferPrice === undefined || premise.totalPropertyTransferPrice === premise.transferPrice;
```

- 구성상 안전한 이유: `imputedTerms`(→ `fbLthdLatter`)와 `acquisitionOverride`가 **같은 함수(STEP 0.42)에서 같은 `rawInput.ownershipRatio`로** 만들어지고, `premise.ownershipRatio`는 그 재귀 입력의 같은 값이다. 부담부증여는 `acquisitionUsed !== tD+tH`가 계속 막는다(H-1 유지).
- 가드를 **유지**하면(나안) 지분 카드가 «입력을 r배한 단건»과 달라진다(§4 SA-pre — 세액 8,400,000 차이). 반대로 해제하면 §4 S0h와 일치.
- 기존 anchor 반전 대상(**공유 단언 반전 — `feedback_shared_assertion_reversal_erases_sibling_net` 적용**): `fb-lthd-slice-premise.anchor.test.ts` PG-2 첫 `it`(장특 18,700,000 · `fbLthdDetail` undefined) · `transfer.route.fb-lthd-slice-gain.anchor.test.ts` 「지분 모드 × 가업상속」(장특 18,700,000). **반전하지 않는 것**: PG-2 둘째 `it`(`ownershipRatio` 없이 `totalPropertyTransferPrice`만 → 후퇴 유지) · PG-1 부담부증여 · PG-3 부분 비사업용 · PG-4 상한. 반전 근거는 anchor 주석에 남긴다.

### 5.6 `creditAmount`·두 재귀

- `applyFamilyBusinessCgtStep`의 두 `calcFn` 호출(`:292-306`)은 **같은 `processedInput`**(`ownershipRatio` 포함)을 쓰고 `acquisitionOverride`만 다르다 — 줄인 `fb`로 `imputedAcquisitionPrice`·`fb.inheritanceMarketValue`를 만들면 두 세액이 같은 스케일이다 → `creditAmount`(상증령 §15㉑ «양도하는 가업상속 재산»의 두 세액 차이)가 지분 양도분 기준으로 맞는다. 코드는 변경이 `fb` 치환뿐이다.
- 번들(축 B·함께양도): 같은 함수가 카드(primary)별로 돈다 — `ownershipRatio`는 `bundled-route.ts:283·299`로 이미 전달된다. 번들 안 `creditAmount`는 번들 안 재귀 입력 차이(기본공제)로 단건과 값이 다른 현행 성질 그대로 — 이번 범위 밖.

### 5.7 막는 것(유지)

- 다건 연간 합산 · 겸용주택 · GB 일반건물: ⑧·⑫ 차단 그대로(R-6·R-7). 이번 변경이 이 차단을 풀지 않는다.
- ⑧ 신규(14지점 ⑧): ① **지분분 평가액 0원 차단** — `scaleFamilyBusinessInheritanceByShare` 결과 `inheritanceMarketValue ≤ 0`이면 «지분율을 곱한 평가액이 0원입니다» (극소 지분·극소 평가액 — 엔진이 일반 §97 취득가액을 0으로 만들어 양도차익이 폭증하는 경로). ② 주 자산 아닌 카드의 FB — **차단하지 않는다(Q-5 지원 결정, §12)**. ⑧은 이미 카드마다 FB 5필드·`allowsFamilyBusinessInheritance`를 점검한다(`transfer-tax-validate-asset.ts:464-485`) — 지분 평가액 0원 점검(①)은 둘째 이후 카드에도 같은 leaf로 적용된다.

### 5.8 주식(F-1) — 무관 확인

- `lib/tax-engine/stock-transfer/stock-family-business.ts` 머리 주석: 취득가액 = `⌊(피상속인 1주당 × 주식수 + capex) × n/d⌋ + ⌊평가 총액 × (d−n)/d⌋` — 입력이 **1주당 단가 × 주식수**이고, 일부 주식 양도는 매도 주식수·lot 배정 수량(`stock-family-business-lot.ts` `buyCost`)으로 처리된다. «소유 지분율» 칸이 없으므로 **이 결함이 존재하지 않는다**. 이 계획서는 주식 코드를 건드리지 않는다.
- 서울고법 2024누53255(§1.4)는 «가업상속공제가 적용된 **수량**의 주식»을 의제 대상으로 본다 — 주식은 수량 단위라는 이 구조와 일치.

---

## 6. 14 동기화 지점 영향

신규 입력 필드가 없다 — 단위 의미 확정 + 엔진 변경 + echo.

| # | 지점 | 영향 | 비고 |
|---|---|---|---|
| ① 폼 상태 | 없음 | | |
| ② initial | 없음 | | |
| ③ normalize | 없음 | | |
| ④ API 변환 | **무변경(이중 스케일 방지가 핵심)** | `transfer-tax-api.ts:694-698`은 그대로 100% 값을 보낸다. anchor로 «④ body FB == 폼 입력» 고정(§7 FS-6) | 엔진이 줄이는데 ④도 줄이면 이중 축소 |
| ⑤ UI 위젯 | **변경** | 의제 취득가액 미리보기 = leaf 호출(지분 반영) · 힌트 «물건 전체 기준 — 지분율은 시스템이 적용» · 적용률 칸 «상속인 단위 — 지분 무관» · 지분 시 카드 산식 | UI 계획서 |
| ⑥ 사이드바 | 확인 | 양도세 사이드바 합계에 FB 의제 항 없음(grep: `lib/stores`에 transfer 요약 FB 참조 없음) — Do Pre-Do에서 재확인(V-3) | |
| ⑦ 결과 카드 | **변경** | `FamilyBusinessImputedComparisonCard` · `ValuationDetailCards`가 `ownershipRatio`·`wholeInput` echo로 «물건 전체 × 지분율 = 지분분» 표시 · 고지 | UI 계획서 |
| ⑧ validation | **변경** | §5.7 ①(지분분 평가액 0 — 카드마다) · UI 계획서의 «전체 기준 확인» 토글(표시·검증 전용). 주 자산 아닌 카드 차단은 **하지 않는다**(Q-5 지원). fallback 신설 없음 → 8번째 동기화 위반 없음. **3중 일치**: ⑤ 미리보기·⑧·엔진이 같은 leaf | |
| ⑨⑩ Zod enum | 없음 | | |
| ⑪ 자산-수준 acquisitionDate fallback | 없음 | | |
| ⑫ Zod 입력 객체 | **무변경** | `transfer-tax-schema-base-shape.ts:706` FB 객체 그대로(키 추가 없음). `ownershipRatio`는 `:410`에 이미 있음 | 응답 echo 신규 키는 route가 결과를 그대로 반환 — V-7(`fbLthdDetail` 선례 통과) |
| ⑬ body spread | **무변경** | | |
| ⑭ Route 매핑 | **무변경** — 단 anchor로 `ownershipRatio`가 STEP 0.42까지 도달함을 고정 | `engine-input.ts:385` · `route.ts:255` · `bundled-route.ts:283·299` | |


> **둘째 이후 카드 지원(§12)이 얹는 지점**: ④ 컴패니언 payload(`transfer-tax-api-companion-payload.ts`) · ⑩ 컴패니언 refine(`refineSplitPartCause` FB 사실 전달 · 겸용·GB 거부) · ⑫ 컴패니언 Zod `familyBusinessInheritance` 키(공유 스키마 leaf 추출) · ⑭ `companionEngine` 매핑(키 커버리지 가드가 강제) · ⑤ 비-첫 자산 비활성 제거 · ⑦ 번들 카드별 echo. 상세 §12.3·§12.5.

---

## 7. anchor · 뮤테이션

### 7.1 anchor (손계산 기대값 — 엔진 출력 복사 금지)

파일: `__tests__/tax-engine/transfer-tax/fb-share-ratio.anchor.test.ts`(엔진) · `__tests__/api/transfer.route.fb-share-ratio.anchor.test.ts`(⑧→④→⑫→⑭→엔진→응답 · 하네스 `captureBody`+`POST`) · (PR-3) `__tests__/calc/fb-non-primary-block.anchor.test.ts`.

| ID | 시료 | 기대 |
|---|---|---|
| FS-1 | 교재 × 지분 1/2 (S0h 입력 규칙) | 양도차익 485,000,000 · 장특 127,700,000 · 과세표준 354,800,000 · 산출세액 115,980,000 · 의제 400,000,000 · `creditAmount` 95,440,000 · 일반 §97 세액 20,540,000 · `fbLthdDetail.basis = "slice_gain"` · echo `ownershipRatio 0.5` · `wholeInput {500M, 1.5B}` · 기존 echo `{250M, 750M}` |
| FS-2 | 지분 33% | 양도차익 320,100,000 · 장특 84,282,000 · 과세표준 233,318,000 · 산출세액 68,720,840 · 의제 264,000,000 · `creditAmount` 58,401,320 |
| FS-3 | 지분 1/2 + 자본적지출 4천만 | 양도차익 471,000,000 · 장특 123,780,000 · 과세표준 344,720,000 · 산출세액 111,948,000 · 의제 414,000,000 · `creditAmount` 91,408,000 |
| FS-4 | **불변식**: 지분 r 카드 ≡ 입력을 `applyRatio(·, r)`한 100% 단건 (r = 1/2·33%·70%·1/3 격자) | 모든 필드 일치(12억 비개입 토지) |
| FS-5 | r = 100%(미지정) | 교재 S1 불변 — 장특 255,400,000 · 과세표준 712,100,000 · 산출세액 263,142,000 · `creditAmount` 204,004,000 · echo 신규 키 **없음** |
| FS-6 | ④ body | `familyBusinessInheritance`가 폼 입력과 **같다**(줄이지 않음) · `ownershipRatio` 0.5 동시 존재 — 이중 스케일 방지 |
| FS-7 | 정확 규약 | r = 70% · V = 1,518,341,200 → `applyRatio` = 1,062,838,840(`Math.floor(x×0.7)`은 …839) · A_d = 500,000,000 → 350,000,000 → tD 245,000,000 · tH ⌊1,062,838,840 × 3/10⌋ = 318,851,652 → 의제 563,851,652 |
| FS-8 | 적용률 불변 | 지분 1/2·33% 어디서도 `appliedRate`·`appliedRateBasis`·`fbLthdLatter.appliedRateFraction`이 입력 그대로 |
| FS-9 | 가드 | 지분 + 의제 재귀: 슬라이스 생성 · 지분 없이 `totalPropertyTransferPrice ≠ 양도가액` → 후퇴 유지(PG-2 둘째 `it`) · 부담부증여 후퇴 유지(PG-1) |
| FS-10 | 번들 축 B (R-3) | 합계 양도차익 785,000,000 · 장특 145,700,000 · 과세표준 636,800,000 · 산출세액 231,516,000(손계산 — 실행 확정 V-4) · 주 자산 FB echo `ownershipRatio 0.5` |
| FS-11 | 함께양도 주 자산 지분 FB (R-5) | 주 자산 의제 취득가액 400,000,000 |
| FS-12 | ⑧ 경계 | 선언 없는 지분 → 종전 차단 문구 유지 · 선언 있는 지분 + FB → 통과 · 지분분 평가액 0원 → 신규 차단 문구 |
| FS-13 | 고지 | 지분일 때만 `FB_SHARE_SCALE_NOTICE`가 `warnings`에 — «확인 필요» 문구 포함 · 100%면 없음 |
| FS-14 | 반전 | PG-2 첫 `it`·route anchor 지분 모드 — 18,700,000 → FS-1 값(주석에 반전 근거) |
| FS-15 | **둘째 카드 FB (축 B)** — 첫 카드 매매 50% · 둘째 카드 상속+FB 50% (§12.4 C-1) | 합계 양도차익 785,000,000 · 장특 145,700,000 · 과세표준 636,800,000 · 산출세액 231,516,000 · `properties[1].familyBusinessDetail` 존재(의제 400,000,000) · `properties[0]`에는 없음. **현행(435,000,000 = FB 없는 값)이 반전 대상** |
| FS-16 | **카드 순서 불변** — FS-10(FB 카드 첫째)과 FS-15(FB 카드 둘째)의 합계 4값 동일 | 785,000,000 · 145,700,000 · 636,800,000 · 231,516,000 |
| FS-17 | 함께양도 둘째 카드 FB 100% (§12.4 C-3) | `properties[1].familyBusinessDetail` 존재 · 합계 양도차익 = 같은 카드를 단건으로 계산한 양도차익 + 첫 카드 양도차익 (FB 없는 대조군과 달라짐) |
| FS-18 | **FB 카드 2장** (함께양도 · 둘 다 100% 상속+FB) | `properties[0]`·`[1]` 모두 `familyBusinessDetail` · 합계 양도차익 = 카드별 양도차익 합 · 카드별 `creditAmount` 각각 존재 · **합계 `creditAmount` 필드 없음**(Q-8) |
| FS-19 | **⑫ 컴패니언 키 stripping** — 둘째 카드 body에 FB를 직접 실으면 | 200 · `familyBusinessDetail` 존재(현행: 200 · 무시 — probe 실측). ⑫ 형식 오류(`fbRateBasis` 분모 0 등)는 400 |
| FS-20 | ④ 컴패니언 body | 둘째 카드가 `sendsFamilyBusinessInheritance`일 때만 FB를 싣고 **100% 값 그대로**(줄이지 않음) · `shareBasisConfirmed` 미전송 · 취득원인이 상속이 아니면 싣지 않음(stale 차단 — A04 술어 공유) |
| FS-21 | 겸용·GB 컴패니언 차단 유지 | ⑧ 문구 유지 · ⑫ refine이 직접 API의 `assetKind: mixed_use_house`·`general_building` + FB를 400으로 거부 · 겸용 파트 카드의 `familyBusinessInheritance: undefined` 방어선(`mixed-use-part-cards.ts:254`) 불변 |
| FS-22 | 반전 — `FIRST_ASSET_ONLY_INPUTS`의 «가업상속 취득가액» 항목 제거 | `g1-reverse-appurtenant-swap.anchor.test.ts:200·223` · `g1-reverse-appurtenant-swap-notice.test.tsx:125`의 가업상속 행이 «교환 허용»으로 반전(근거 주석) — 단 토지등급·다필지 등 다른 행은 불변 |

### 7.2 뮤테이션 (Do에서 실행 — 각 변형이 최소 1개 anchor를 깨야 한다)

| M | 변형 | 기대 검출 |
|---|---|---|
| M-1 | 스케일 제거(현행) | FS-1~4 |
| M-2 | `applyRatio` → `Math.floor(x * r)` | FS-7 |
| M-3 | `inheritanceMarketValue`만 줄이고 `decedentAcquisitionPrice` 안 줄임 | FS-1·4 |
| M-4 | 자본적지출 미스케일 | FS-3 |
| M-5 | 적용률(`fbDeductionAppliedRate` 또는 basis 분자)도 r로 곱함 | FS-8·1 |
| M-6 | ④도 줄임(이중) | FS-6 |
| M-7 | 슬라이스 가드 `< 1` 복원 | FS-1·10·14 |
| M-8 | 가드 해제를 `totalPropertyTransferPrice` 가드까지 확대 | FS-9 |
| M-9 | 두 재귀 중 일반 §97 재귀만 줄이지 않음(`acquisitionOverride: whole V`) | FS-1(`creditAmount`) |
| M-10 | 선절사 → 단일 분수 | FS-4(격자 중 1원 차 시료) |
| M-11 | ⑭ `companionEngine`에서 `familyBusinessInheritance` 매핑 제거 | **컴파일 에러**(`CompanionOwnedKeys` 키 커버리지 가드) — 가드를 우회해 `as` 캐스팅하면 FS-15 |
| M-12 | ⑫ 컴패니언 스키마 키 제거 | FS-15·19 |
| M-13 | ④ 컴패니언 payload에서 FB spread 제거 | FS-15·20 |
| M-14 | ④ 컴패니언이 FB를 지분율로 줄여 실음(이중) | FS-20 · FS-15(값 어긋남) |
| M-15 | ④ 컴패니언이 `sendsFamilyBusinessInheritance` 대신 `allows…`만 | FS-21(겸용 잔재) |
| M-16 | 번들 집계가 `creditAmount`를 카드 합으로 새로 노출 | FS-18 |

---

## 8. PR 분할 (Q-5 지원 결정 반영 — 재조정)

| PR | 내용 | 규모 |
|---|---|---|
| PR-0 | 이 계획서 + UI 계획서(문서) — UI 계획서는 «비-첫 자산 비활성(UQ-3 a)»·④ 스케일(`scaleFamilyBusinessForShare`)을 이 문서 결정(§13)에 맞게 고친다 | 문서 |
| **PR-1 엔진 지분** | leaf `family-business-share.ts` · STEP 0.42 연결 · `fbSlicePremiseHolds` 완화 · `FamilyBusinessCgtDetail` echo 3필드 · `FB_SHARE_SCALE_NOTICE` · anchor FS-1~14 · 반전 2건 · 뮤테이션 M-1~10 | 소스 ≈ +90줄 · 테스트 ≈ 300줄 |
| **PR-2 컴패니언 FB 배선·엔진 경로** | ⑫ 공유 스키마 leaf 추출(`transfer-tax-schema-family-business.ts` — base-shape에서 이동) + `companionAssetSchema` 키 · ⑩ `refineSplitPartCause` 컴패니언 FB 사실 전달 + 겸용·GB 거부 · ④ 컴패니언 payload FB spread · ⑭ `companionEngine` 매핑 · `FIRST_ASSET_ONLY_INPUTS` 항목 제거 · anchor FS-15~22 · 뮤테이션 M-11~16 · 반전 FS-22 | 소스 ≈ +70줄(스키마 이동 −25줄 별도) · 테스트 ≈ 280줄. **PR-1 머지 뒤**(번들 합계 785,000,000이 지분 스케일에 의존) |
| **PR-3 UI** | ⑤ 지분 안내·환산·«전체 기준 확인» 토글(UI 계획서 UQ-2) · 비-첫 자산 비활성 **제거**(PR-2 이후) · ⑦ 카드·캡션 · ⑧ V'>0·confirm · 번들 카드별 echo 렌더 확인 · 이력 모달 안내 · E2E(지분 1/2 → 결과 → Network body에 `ownershipRatio`·FB 100% · 축 B 둘째 카드 FB → 합계 785,000,000) | UI 계획서 |

순서: PR-1 → PR-2 → PR-3(엔진이 타입·헬퍼·anchor 선처리 → UI가 ⑤⑥⑦). PR-2는 PR-1과 독립 코드지만 기대값이 PR-1에 의존하므로 순차. 반복 검증 `npx vitest run __tests__/tax-engine/transfer-tax/ __tests__/calc/ __tests__/api/transfer.route.fb-*` · 세목 회귀 `npm run test:transfer`.

---

## 9. 사용자 결정 Q-n (추천 = 첫째)

> **결정 현황(2026-11-26)**: Q-1·2·3·4·6·7은 추천안 그대로 확정, **Q-5는 추천(⑧ 차단)과 달리 «지원»으로 확정**(§12), **Q-8은 신규·미결정**. 최종 표는 §13.

| Q | 질문 | 안 | 추천·근거 |
|---|---|---|---|
| **Q-1** | FB 입력(피상속인 취득가액·평가액·자본적지출)의 단위 | **(a) 물건 전체(100%) 기준 + 시스템이 지분율 적용** · (b) 양도 지분분을 사용자가 직접 입력 · (c) 지분 + FB는 ⑧ 차단 | **(a)** — 같은 카드의 다른 금액 칸 전부가 100% 입력이고(`OwnershipRatioInput.tsx:13`) 상속세 이력 prefill이 물건 전체 평가액을 넣는다. (b)는 한 카드에 두 단위를 섞고 prefill이 어긋난다. (c)는 «공동상속 1인·일부 지분 양도»(R-1 정상 경로)에서 FB 계산을 막아 막다른 길. **영향**: (a)로 확정하면 과거에 지분분을 직접 넣은 저장 폼은 재계산 시 값이 달라진다(R-1) |
| **Q-2** | 곱하는 위치 | **(가) 엔진 STEP 0.42** · (나) ④ · (다) ④+엔진 이중 방어 | **(가)** — sub-object 100% → 엔진이 줄이는 선례(`scaleBurdenedGiftInfo`) · 단건·축 B·함께양도·직접 API 단일 소스 · 슬라이스 가드 해제의 구성상 근거. (나)는 가드를 풀 근거(플래그 신설)와 직접 API 우회가 남는다. (다)는 이중 스케일 위험 |
| **Q-3** | 절사 순서 | **(가) 항목별 `applyRatio` 선절사 후 §97의2④ 산식** · (나) 의제 취득가액 1회 정확 분수 | **(가)** — «입력을 r배한 단건»과 비트 동일(오라클 동일성) · 일반 §97 재귀 취득가액 `applyRatio(V,r)`와 같은 값 · 지분 적용 단일 규약. (나)는 항별 최대 1원 차이(§5.4 예) |
| **Q-4** | #3678 슬라이스 가드 | **(가) `ownershipRatio < 1` 가드 해제(엔진이 줄이므로)** · (나) 가드 유지(지분 카드는 비례 안분) | **(가)** — (나)는 지분 카드가 «입력을 r배한 단건»과 달라진다(§4: 세액 124,380,000 ↔ 115,980,000, 8,400,000). 가드 목적(가짜 차손 방지)은 엔진 스케일이 구성상 없앤다. `totalPropertyTransferPrice ≠ 양도가액` 가드는 **지분 아닌 경우에만** 유지 |
| **Q-5** | 주 자산이 아닌 카드의 FB (D-2 · 지분 무관) | ✅ **사용자 결정: 둘째 이후 카드도 지원**(추천 «⑧ 차단 + 별도 PR»과 다름) | 근거: 번들 route가 카드(item)마다 STEP 0.42를 이미 호출하고 카드별 `familyBusinessDetail`을 이미 싣는다(§12.2 실측) — 열 곳은 ④·⑫·⑭ 배선뿐. 카드 순서 변경 UI가 없어 차단은 막다른 길이었다. 지원 후 합계가 카드 순서와 무관해진다(§12.4). **→ §12** |
| **Q-6** | 지분 양도 시 결과에 «확인 필요» 고지 부착 | **(가) 부착**(지분일 때만 `warnings` 1건) · (나) 미부착 | **(가)** — 지분 양도의 «해당 자산가액»을 직접 정한 조문·해석례가 0건이다(§1.4). 선례: Q-2 (a)(차손 부분) 고지. 세액 영향 없는 표시 |
| **Q-8** (신규) | 번들(축 B·함께양도)에서 가업상속 카드가 둘 이상일 때 `creditAmount`(상증법 §18의2⑩) 표시 | **(가) 카드별로만 표시 · 합계 미산출** · (나) 카드별 합계를 «카드별 독립 계산 합» 고지와 함께 표시 · (다) 신고 단위로 의제 전체 − 일반 전체를 다시 계산해 표시 | **(가)** — 번들 안 카드별 값은 기본공제 0·카드 단독 누진으로 계산돼(`computeOne`의 `skipBasicDeduction`) 단건 값과 다르고(§12.4: 단건 95,440,000 ↔ 번들 카드 95,565,000) 합이 신고 단위 §18의2⑩ 값과 같다는 근거가 없다. (다)는 신고 단위 두 재계산이 필요해 규모가 크고 법령상 «양도하는 가업상속 재산에 대하여» 단위(상증령 §15㉑)가 카드별인지 신고 단위인지 해석례가 없다(V-14). 합계 필드를 새로 만들지 않아 FS-18·M-16이 가드 |
| **Q-7** | echo 방식 | **(가) 기존 3필드 = 지분분, 신규 `ownershipRatio`·`wholeInput`** · (나) 기존 = 물건 전체 유지, 신규 `shareAmounts` | **(가)** — 기존 산식 카드(`원취득가액 × 적용률 + 평가액 × (1−적용률) = 의제`)가 의제 취득가액과 자기일관(A22 교훈). (나)는 기존 카드의 세 숫자가 의제와 어긋난다 |

---

## 10. 확인 필요 V-n

| V | 내용 | 상태 |
|---|---|---|
| V-1 | 지분 양도 시 §97의2④ «피상속인의 취득가액»·«해당 자산가액»의 지분 단위 — 직접 조문·해석례·심판례 0건(§1.4). 본 계획은 §97 대응(양도가액 ↔ 취득가액 같은 대상)에 의한 해석 | **확인 필요** — 결과에 고지(Q-6) |
| V-2 | 상속세 계산기 `EstateItem`이 물건 전체 단위로 입력되는지(공동상속인별 몫이 아닌지) — Q-1 (a)의 prefill 일치 근거 | **확인 필요** — Do Pre-Do에서 상속세 입력 UI·`resolveEstateItemValue` 실측 |
| V-3 | ⑥ 사이드바·PDF·신고서에 transfer FB 의제 취득가액이 표시되는 곳(`lib/pdf`·`StockFilingFormAssetCostRows.ts`는 주식) | **확인 필요** — grep상 transfer 사이드바 참조 없음, Do에서 재확인 |
| V-4 | 번들(축 B·함께양도) 안에서 FB 카드의 슬라이스·`creditAmount`가 단건 오라클과 같은 구조로 나오는지(§4 손계산 FS-10) · 함께양도 지분 primary의 엔진 `transferPrice`가 `안분 양도가액 × r`인지 | **확인 필요** — Do anchor 실행 |
| V-5 | 「나머지 지분은 타인 소유입니다」 선언 문구가 «일부 지분만 양도·나머지는 내 보유(미양도)»인 (b) 시나리오와 사실이 어긋남 | **확인 필요** — UI 계획서에서 문구·안내 판단 |
| V-6 | 새 인용 없음(§97의2④ 기존 상수 재사용) → `legal-verification` 매니페스트 추가 불요 여부 — `__tests__/lib/legal-verification-coverage-complete.test.ts` 통과로 확인 | **확인 필요** |
| V-7 | 응답 echo 신규 키(`ownershipRatio`·`wholeInput`)가 route에서 잘리지 않는지(선례 `fbLthdDetail` 통과) | Do route anchor |
| V-8 | 번들 route가 컴패니언(비주 자산) 카드에 STEP 0.42를 호출하는지 | ✅ **확인함(§12.2)** — `computeOne`(`transfer-tax-aggregate-asset-records.ts:141`)이 자산마다 `calculateTransferTax`를 호출하고 `pickValuationDetails`(`transfer-tax-aggregate-pickers.ts:50`)가 `familyBusinessDetail`을 카드별로 옮긴다. 엔진 직접 probe로 둘째 카드 FB 합계 785,000,000 확인 |
| V-9 | 주택·상가(`commercial_building`) × 지분 × FB — 12억 안분(`totalPropertyTransferPrice` 분모)·환산·§99 기준시가 경로에서 FB 스케일이 다른 `ownershipRatio` 사용처와 이중 축소하는지. 이번 실측은 토지만 | **확인 필요** — Do Pre-Do에서 주택(고가주택)·상가 시료 추가 |
| V-10 | 다필지(`parcels`)·재개발 × FB × 지분 도달 여부 | **확인 필요** — 이번 실측 범위 밖 |
| V-11 | 저장된 이력(IndexedDB resultData)의 옛 결과는 값이 그대로(재계산 전까지) — 이력 폼을 다시 열어 재계산하면 달라짐(Q-1 영향). 이력 화면 안내 필요 여부 | **확인 필요** — UI 계획서 |
| V-12 | 번들 결과 화면(`MultiTransferPropertyBreakdown.tsx`·`BundledAllocationSubCards.tsx` → `ValuationDetailCards`)이 카드별 `familyBusinessDetail`·`fbLthdDetail`을 그리는지 — 코드상 `ValuationDetailCards.tsx:160`이 `result.familyBusinessDetail`을 그리나 `fbLthdDetail`(부분별 장특 표)은 `SingleDetailCards`만 받는다 | **확인 필요** — UI 계획서 PR-3 |
| V-13 | 침묵 폐기되던 둘째 카드의 **저장된 FB 입력**이 지원 후 처음 계산에 반영된다 — 같은 폼 재계산 시 세액이 달라진다(입력이 화면에 보였던 값이고 법령상 본문 강제라 의도에 맞음). 지분 카드는 UI 계획서 UQ-2 확인 토글이 없으면 ⑧이 막는다 | **확인 필요** — 이력 재열기 안내 문구 여부(UI) |
| V-14 | 상증령 §15㉑ «양도하는 가업상속 재산에 대하여 … 양도소득세액»을 카드(자산)별 독립 세액으로 읽는지, 신고 단위 세액 차로 읽는지 — 해석례·심판례 미확인(§1.4 검색은 지분 한정이었음) | **확인 필요** — Q-8 (가) 선택의 이유 |
| V-15 | 컴패니언 FB 카드가 GB·겸용 파트 확장 경로(`buildGbCompanionItems`·`buildMixedUseCompanionItems`)에 `...companionEngine`으로 흘러드는지 — ⑧·⑩이 입구에서 막지만 직접 API 경로의 방어선(`mixed-use-part-cards.ts:254`는 겸용만, GB는 확인 필요) | **확인 필요** — Do Pre-Do |
| V-16 | 컴패니언 FB 카드의 `inheritanceValuation`(상속 보충적평가액 안분 키)과 FB의 `inheritanceMarketValue`는 서로 다른 채널 — 함께양도 양도가액 안분(`apportioned`)에서 FB 카드 안분 키가 FB 입력과 무관함을 anchor로 고정 | **확인 필요** — FS-17 시료에서 |

---

## 11. 진행 상황

- [x] 법령(KoreanLaw MCP verbatim) · 해석례·판례 검색(지분 직접 근거 0건)
- [x] 도달 경로 전수 실측(R-1~R-7 · D-2a/b) · Pre-Do probe(§4) · 손계산(§3.4)
- [x] 주식(F-1) 무관 확인(§5.8) · #3678 가드 해제 가능 판단(§5.5)
- [x] **Q-1~Q-7 사용자 결정 완료(2026-11-26 — §13)** · Q-5 = 둘째 이후 카드도 지원
- [x] 둘째 이후 카드 지원 설계(§12) · 번들 엔진 직접 probe(§12.2) · 현행 침묵 폐기 실측(§12.1)
- [ ] **Q-8 사용자 결정**(번들 `creditAmount` 표시)
- [ ] 문서 PR → PR-1 엔진 지분 → PR-2 컴패니언 배선 → PR-3 UI

---

## 12. 둘째 이후 카드(비주 자산)의 가업상속 지원 설계 (사용자 결정 Q-5 · 2026-11-26)

### 12.1 현행 — 침묵 폐기 + 카드 순서 의존 (probe 실측, mock 세율)

공통 시료: 축 B(`assetSplitMode: "fractional"`) 50% + 50% · 총 양도가 18억 · 상속 카드는 교재 이월과세5 FB(5억/15억/70%) · 매매 카드는 취득 2023-01-10 12억(지분분 6억) · 두 카드 모두 토지.

| 시료 | ⑧ issues | 합계 양도차익 | 합계 장특 | 산출세액 | 카드별 `familyBusinessDetail` |
|---|---|---|---|---|---|
| FB 카드가 **첫** 카드(상속 FB 50% + 매매 50%) | `[]` | 385,000,000 | 36,700,000 | 112,380,000 | `properties[0]`만(의제 800,000,000 — FB 100% 값 그대로, §2) |
| FB 카드가 **둘째** 카드(매매 50% + 상속 FB 50%) | `[]` | **435,000,000** | 28,800,000 | **135,540,000** | **없음** |
| 위 시료에서 FB를 지운 대조군 | `[]` | 435,000,000 | 28,800,000 | 135,540,000 | 없음 |
| 둘째 카드 **body에 FB를 직접 주입**(`companionAssets[0].familyBusinessInheritance`) | — | 435,000,000 | 28,800,000 | 135,540,000 | 없음 — **200이고 400이 아니다**(⑫ `z.object`가 키를 침묵 strip) |

→ 둘째 카드 FB는 **⑧ 통과 · ⑫ 침묵 strip · 결과 동일**이다. 합계가 카드 순서에 따라 385,000,000 ↔ 435,000,000으로 갈린다(둘 다 틀림 — 기대값은 §12.4).

### 12.2 V-8 실측 — 번들은 카드마다 STEP 0.42를 호출한다

- 코드: `buildAssetRecords`의 `computeOne(item)`(`lib/tax-engine/transfer-tax-aggregate-asset-records.ts:141`)이 **item마다** `calculateTransferTax`를 부른다 → STEP 0.42(`transfer-tax-precalc.ts:154`)가 `familyBusinessInheritance`가 있는 item에서 발동한다. 컴패니언 item은 `buildCompanionEngineInputs`(`bundled-split-helpers.ts:176`)가 만든 `TransferTaxItemInput`이고, 주 자산 item은 `...engineInput`으로 FB를 받는다(`bundled-route.ts:215-216`).
- `pickValuationDetails`(`transfer-tax-aggregate-pickers.ts:50`)가 `familyBusinessDetail`을 **카드별**로 옮긴다(주석 «컴패니언도 카드별로 실린다»).
- **엔진 직접 probe**(`calculateTransferTaxAggregate` · 카드 2장(매매 + 상속) · FB 입력을 이미 지분분 250,000,000 / 750,000,000으로 준 시료 — 계획 후 엔진 스케일이 만들 값과 같다. probe 파일은 삭제함):

| 시료 | 합계 양도차익 | 합계 장특 | 산출세액 | FB 카드의 의제 / `creditAmount` |
|---|---|---|---|---|
| FB가 **둘째** 카드 · 지분율 미지정 | 785,000,000 | 145,700,000 | 231,516,000 | 400,000,000 / 95,565,000 (`properties[1]`) |
| FB가 **첫** 카드 · 지분율 미지정 | 785,000,000 | 145,700,000 | 231,516,000 | 400,000,000 / 95,565,000 (`properties[0]`) |
| FB가 둘째 카드 · `ownershipRatio 0.5` + **현행 가드** | 785,000,000 | 124,700,000 | 240,336,000 | 400,000,000 / 103,965,000 |

  - 첫째·둘째 행이 같다 = **카드 순서 불변**. 값이 §3.4·§4 손계산(785,000,000 · 145,700,000 · 636,800,000 · 231,516,000)과 일치한다(과세표준 = 785,000,000 − 145,700,000 − 2,500,000).
  - 셋째 행 = Q-4 가드를 유지하면 장특이 21,000,000 모자라고 세액이 8,820,000 높다 — 지분 카드가 둘째여도 PR-1의 가드 해제가 필요하다.
  - 번들 안 카드별 `creditAmount`는 단건 값(95,440,000)과 다르다 — 집계가 카드 계산에 `skipBasicDeduction: true`를 주기 때문이다(`computeOne`) → Q-8.
- **결론: 엔진은 새 호출을 만들 필요가 없다.** 둘째 이후 카드를 열려면 FB가 item까지 **도달**하게 하는 배선(④·⑫·⑭)만 하면 된다.

### 12.3 배선 설계 — 5단 파이프라인 (폼 → 변환 → body → Zod → Route → 엔진)

| 단 | 지점 | 변경 | 근거·주의 |
|---|---|---|---|
| ④ 컴패니언 변환 | `lib/calc/transfer-tax-api-companion-payload.ts`(603줄 · 말미 spread 블록 인접, +≈8줄) | `...(sendsFamilyBusinessInheritance(asset) && asset.familyBusinessInheritance ? { familyBusinessInheritance: buildFamilyBusinessPayload(asset.familyBusinessInheritance) } : {})` | 단건 ④(`transfer-tax-api.ts:694-698`)와 **같은 술어**(`transfer-fb-gate.ts`)·**같은 leaf**(UI 계획서 `buildFamilyBusinessPayload` — 표시·검증 전용 필드를 떼는 역할만 남기고 **지분 스케일은 하지 않는다**). 금액은 **100% 그대로** — 카드별 `ownershipRatio`가 같은 payload에 이미 실린다(`:381`) |
| ⑫ Zod | 새 leaf `lib/api/transfer-tax-schema-family-business.ts`(`familyBusinessInheritanceSchema` — `transfer-tax-schema-base-shape.ts:706-728`을 **이동**, `superRefine`의 `fbRateBasis` 정합 포함) → base-shape와 `transfer-tax-schema-companion.ts`(`companionAssetSchema`)가 **같은 객체를 import** | 컴패니언 키 추가 | 복제 금지 — 두 곳이 갈리면 단건이 막는 입력을 컴패니언이 통과시킨다. base-shape 734줄 → ≈710줄(이동으로 감소) · 컴패니언 스키마 422줄 +≈4줄 |
| ⑩ refine | `refineSplitPartCause`(`transfer-tax-schema-required-refines-2a.ts:506-509`의 «컴패니언 스키마에는 … `familyBusinessInheritance`가 없다» 주석을 정정) | 컴패니언 호출이 `familyBusinessInheritance: d.familyBusinessInheritance`를 넘긴다 → 토지·건물 취득원인 분리와 FB의 결합 거부(`hasFamilyBusinessInheritance`)가 컴패니언에도 적용 | 주석이 «그 사실은 생략된다(= 그 결합이 아니다)»라는 **부재 전제**였다 — 키를 열면 전제가 깨진다(`feedback_comment_asserting_absence_is_premise_for_later_pr`) |
| ⑩ refine 신규 | 컴패니언 `assetKind ∈ {mixed_use_house, general_building}` + FB → 400 | 직접 API 방어선 | ⑧(`transfer-tax-validate-asset.ts:464-472`)과 같은 술어 — 겸용·GB는 범위 밖(§5.7) |
| ⑭ Route→엔진 | `bundled-split-helpers.ts`의 `companionEngine`(`:297`) | `familyBusinessInheritance: c.familyBusinessInheritance` | 키 커버리지 가드(`CompanionOwnedKeys` `bundled-companion-types.ts:33-36` · `_Assembled` `bundled-split-helpers.ts:503`)가 ⑫ 키 추가만으로 **컴파일 에러를 낸다** — 가드가 이 배선 누락(갭 2)을 잡는다. `as` 우회 금지. FB `inheritanceDate`는 문자열 그대로(주 자산과 같은 경로) |
| 엔진 | STEP 0.42 | 변경 없음(PR-1 스케일이 카드별 `ownershipRatio`로 동작) | §12.2 |
| 번들 합산·echo | `pickValuationDetails` | 변경 없음 — 카드별 `familyBusinessDetail`이 이미 실린다 | `creditAmount` 합계 필드는 새로 만들지 않는다(Q-8 (가)) |
| 부수 정리 | `lib/calc/reverse-appurtenant-swap.ts:39` `FIRST_ASSET_ONLY_INPUTS`의 «가업상속 취득가액» 항목 | **제거** — 컴패니언 위치에서도 ④가 FB를 보낸다(주석 «컴패니언 위치에서는 ④가 보내지 않거나(정밀판정·가업상속)»도 정정) | 교환(첫 자산 토지 ↔ 짝 주택) 시 FB 소실 가드가 이제 거짓 차단이 된다 — anchor FS-22 |

- **카드별 `ownershipRatio`와의 결합**: 축 B 카드는 각자 지분율이 다르고(`60/40`), 함께양도 지분 카드는 그 물건의 지분율이다. FB 입력은 **그 카드의 물건 전체(100%) 기준**이고 그 카드의 `ownershipRatio`로 줄어든다(PR-1과 동일 leaf, 카드 단위). 같은 물건의 두 지분이 모두 상속+FB면(예: 한 상속인이 나눠 상속) 카드마다 같은 물건 전체 값을 입력하고 각자 지분율로 줄어든다 — 합이 100%이면 의제 취득가액 합이 단건(전체) 값과 같아야 한다(§12.4 C-5).
- **적용률**: 카드마다 가업상속인 단위 적용률(`fbRateBasis`)을 따로 갖는다. 같은 상속인의 같은 가업이면 값이 같고(§1.2 후단) 다른 상속인·가업이면 달라도 된다 — 엔진은 카드별로 받는다.
- **다건 연간 합산**(`/multi-transfer`): `MULTI_FAMILY_BUSINESS_UNSUPPORTED_MESSAGE`(`multi-transfer-tax-validate.ts:176` · `transfer-tax-schema-multi-refines.ts:82`) **차단 유지**. 번들(축 B·함께양도)과 다건 합산은 별개 경로이고 이번에 열지 않는다.
- **겸용·GB 차단 유지**: ⑧(`:464-472`) · ⑩ 신규 거부 · `mixed-use-part-cards.ts:254`. 컴패니언 겸용/GB는 `companionEngine`을 파트 카드로 펼치므로(`bundled-split-helpers.ts:520·543`) 입구에서 막는 것이 핵심이다(V-15).
- **UI 계획서와의 정합**: UI 계획서의 «비-첫 자산 FB 토글 비활성(UQ-3 a)»·«④ `applyRatio` 스케일»은 이 결정으로 **대체된다** — 둘째 이후 카드도 토글을 열고, ④는 100% 값 그대로 보낸다. 확인 토글(`shareBasisConfirmed`)은 지분 카드마다(둘째 카드 포함) 필요하다. FB-SH-E2(둘째 카드 FB 토글 비활성)는 «둘째 카드 FB 입력 → 합계 785,000,000»으로 바뀐다.

### 12.4 시나리오 표 — 현행 / 계획 후

| # | 시료 | 현행(실행값) | 계획 후 |
|---|---|---|---|
| C-1 | **축 B · 둘째 카드 상속 FB 50% + 첫 카드 매매 50%** | 합계 양도차익 **435,000,000** · 장특 28,800,000 · 산출세액 135,540,000 (= FB 없는 값) | 합계 양도차익 **785,000,000** · 장특 145,700,000 · 과세표준 636,800,000 · 산출세액 **231,516,000** — 엔진 직접 probe 실행값(§12.2)이며 §3.4 손계산과 일치 |
| C-2 | 축 B · **첫 카드** 상속 FB 50% + 둘째 카드 매매 50% | 385,000,000 · 36,700,000 · 112,380,000 | 785,000,000 · 145,700,000 · 231,516,000 (C-1과 **동일 — 카드 순서 불변**) |
| C-3 | 함께양도 · 둘째 카드가 다른 물건 100% 상속+FB | FB 폐기(`familyBusinessDetail` 없음) | 그 카드의 의제 취득가액 적용 — 합계 양도차익 = 첫 카드 + 그 카드 단건 양도차익. 수치는 Do의 FS-17에서 단건 실행값으로 확정(손계산 미작성) |
| C-4 | 함께양도 · **카드 2장 모두** 100% 상속+FB | 첫 카드만 FB | 두 카드 모두 의제 · 카드별 `familyBusinessDetail`·`creditAmount` · 합계 `creditAmount`는 노출하지 않음(Q-8) |
| C-5 | 축 B 60% + 40% 둘 다 상속+FB(같은 물건 전체 값 입력) | 첫 카드만 FB | 불변식: 합계 의제 취득가액 = 같은 물건을 단건 100%로 입력한 의제 취득가액(두 카드가 각자 `applyRatio` 선절사라 ±1원 가능 — anchor는 허용 오차 1원을 명시하고 Q-3 규약임을 주석) |

### 12.5 14 동기화 지점 — 컴패니언 지원분

| # | 변경 | 비고 |
|---|---|---|
| ①②③ | 없음 | `AssetForm.familyBusinessInheritance`는 이미 모든 카드가 가진다. 확인 토글 필드는 UI 계획서 몫 |
| ④ | **변경** — 컴패니언 payload FB spread | 단건과 같은 술어·leaf · 100% 값 |
| ⑤ | 변경(UI 계획서) — 비-첫 자산 비활성 제거 · 카드별 환산 표시 | |
| ⑥ | 없음 | |
| ⑦ | 번들 카드별 echo — `ValuationDetailCards` 경로 확인(V-12) | |
| ⑧ | 카드별 점검은 이미 있음 · 지분분 평가액 0원을 둘째 이후 카드에도 · **차단 신설 없음** | ⑧ ⊇ ⑫ 방향만 허용(확인 토글) |
| ⑨ | 없음 | |
| ⑩ | **변경** — 컴패니언 `refineSplitPartCause` FB 사실 전달 · 겸용·GB 거부 | 주석 정정 |
| ⑪ | 없음 | FB `inheritanceDate`는 별 필드 |
| ⑫ | **변경** — 공유 스키마 leaf · 컴패니언 키 | stripping 방지 — FS-19 |
| ⑬ | **변경** — 컴패니언 payload(`companionAssets[]` 안 spread) | 누락 시 침묵 strip(§12.1 실측) |
| ⑭ | **변경** — `companionEngine` 매핑 | 키 커버리지 가드가 강제 |

### 12.6 UI 계획서의 «전체 기준 확인» 토글(UQ-2)과의 경계

- 표시·검증 전용 폼 필드(`familyBusinessInheritance.shareBasisConfirmed`, 가정 이름 — UI 계획서가 정본). **엔진은 읽지 않고 ⑫ 스키마에도 넣지 않는다** — ④(단건·컴패니언)가 body에서 떼어낸다. 직접 API 계약은 «FB = 물건 전체 값 + `ownershipRatio`»다.
- 의도된 비대칭: confirm 없는 지분 + FB는 ⑧이 막지만 API는 받는다(`ownershipRemainderThirdParty` 선례) — anchor 주석에 명시(FS-12).

---

## 13. 사용자 결정 (2026-11-26 — 이 표가 최종)

| 항목 | 결정 |
|---|---|
| Q-1 입력 단위 | **물건 전체(100%) 기준** — 시스템이 지분율을 곱한다 |
| Q-2 곱하는 위치 | **엔진 STEP 0.42**에서 곱한다 — **④는 불변**(단건·컴패니언 모두 100% 값 그대로) |
| Q-3 절사 순서 | **항목별 `applyRatio` 선절사** 후 §97의2④ 산식 |
| Q-4 #3678 가드 | **`ownershipRatio < 1` 가드 해제**(`totalPropertyTransferPrice ≠ 양도가액` 가드는 지분이 아닐 때만 유지) |
| Q-5 비주 자산 카드 FB | **둘째 이후 카드도 지원**(추천 «⑧ 차단»과 다름) → §12 · PR-2 |
| Q-6 확인 필요 고지 | **부착**(지분일 때만 `FB_SHARE_SCALE_NOTICE`) |
| Q-7 echo | **기존 3필드 = 지분분 + `ownershipRatio`·`wholeInput`** |
| UI UQ-2 | **«전체 기준 확인» 토글 필수** — UI 계획서가 정의하는 표시·검증 전용 필드, **엔진·⑫는 읽지 않는다**(§12.6) |
| Q-8 (신규 · 미결정) | 번들에서 FB 카드가 여럿일 때 `creditAmount` — **추천 (가) 카드별만 표시·합계 미산출**(§9) |
| PR 분할 | PR-1 엔진 지분 → PR-2 컴패니언 배선 → PR-3 UI (§8) |

---

## 최종 결정 (2026-11-26 · 코디네이터 확정 — 엔진·UI 계획서 공통, 이 표가 두 문서의 앞선 표보다 우선)

| 항목 | 결정 |
|---|---|
| Q-1 / UQ-1 FB 3금액 입력 단위 | **물건 전체(100%) 기준** |
| Q-2 지분율 곱하는 위치 | **엔진 STEP 0.42** (`scaleFamilyBusinessInheritanceByShare`) — ④ 변경 없음(이중 스케일 금지) |
| Q-3 절사 | 항목별 `applyRatio` 선절사 |
| Q-4 #3678 `ownershipRatio<1` 슬라이스 가드 | **해제**(부담부증여 H-1·총 물건가 ≠ 양도가 가드는 유지) |
| Q-5 / UQ-3 둘째 이후 카드 FB | **지원**(사용자 선택 — 추천 ⑧ 차단과 다름). 엔진은 이미 카드별 호출 → ④ 컴패니언 payload·⑫ 컴패니언 스키마(공유 leaf)·⑩·⑭ 배선 |
| Q-6 | 지분 × FB «확인 필요» 고지 부착 |
| Q-7 / UQ-5 echo | 기존 3필드 = 지분분 + `ownershipRatio`·`wholeInput` |
| UQ-2 전체 기준 확인 | **필수** — 필드는 **자산-수준 `AssetForm.fbShareBasisConfirmed`**(UI 정본, 표시·검증 전용, FB 객체 밖이라 body에 안 실림 → ④ strip leaf 불필요). 엔진 계획서 §12.6의 `familyBusinessInheritance.shareBasisConfirmed`·`buildFamilyBusinessPayload`는 **폐기**(E-1/E-4) |
| E-2 | 14지점 ①②③은 «자산 필드 1개 추가»로 정정 |
| E-3 / UQ-8 번들 부분별 장특 표 | **노출** — 번들 breakdown(`pickValuationDetails`·`TransferValuationDetailSource`)에 `fbLthdDetail` 추가 |
| E-5 V8-3 지분분 평가액 0원 | ⑧과 ⑫ **모두 거부**(서버가 계산 가능한 사실 — ⑧↔⑫ 대칭). 비대칭은 UI 전용 확인 토글(UQ-2)만 |
| Q-8 / UQ-6 번들 creditAmount | **카드별만 표시, 합계 없음** + 카드 안 «단독으로 본 값·확인 필요» 고지 1줄 |
| UQ-4 이력 모달 | 값 그대로 + 지분 안내 밴드 + prefill 시 확인 토글 해제 |
| UQ-7 같은 물건 두 FB 지분 카드 | 카드마다 직접 입력 |
| PR 순서 | PR-1 엔진 지분 스케일 → PR-2 컴패니언 FB 배선 → PR-3 UI(①~⑧·번들 표·E2E) |
