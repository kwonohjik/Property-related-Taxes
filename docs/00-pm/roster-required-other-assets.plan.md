# 명부 필수화 — 입주권·분양권·재개발APT·겸용주택 (Q-7 후속)

> 작성 2026-10-05 · 상태 **✅ 완료(2026-10-06) — PR-B #1983 · PR-D #1984 · PR-C #1985 머지, §10 참조** · 대상 화면 양도세 계산기(단건·다건) · 대상 엔진 `lib/calc/household-house-count.ts` · `lib/tax-engine/transfer-tax-redevelopment-transforms.ts` · `lib/tax-engine/transfer-tax-rate-calc.ts`
> 선행: [`merge-composition-unknown-unfavorable.plan.md`](merge-composition-unknown-unfavorable.plan.md)(PR-1 #1972 — 주택(`"housing"`) 양도 명부 필수화 완료) §2-8·§7 Q-7 — 「입주권·분양권·재개발 아파트·겸용주택은 ① 의미 축이 달라 별건」으로 남긴 항목의 후속 설계.
> 지시: 「분양권 자체의 양도는 1세대 1주택 비과세 되는 경우가 없어」(2026-10-05) — 분양권이 비과세 축에 쓰이지 않는다는 전제를 코드·법령으로 확인하고, 다른 쓰임이 없으면 필수화 대상에서 제외하는 안을 권장안으로 제시.

## 0. 결론 요약 (먼저 읽기)

전제가 하나 깨졌다. Q-7은 4개 자산을 "① 의미 축이 다르다"는 한 이유로 묶어 전부 별건으로 미뤘지만, 실측 결과 **네 자산의 상태가 전부 다르다**:

| 자산 | 명부가 지금 거주 판정에 쓰이는가 | 결론 |
|---|---|---|
| 겸용주택(`isMixedUseHouse` on `housing`) | **이미 쓰인다** — `assetKind`가 리터럴 `"housing"`이라 PR-1·F1 게이트를 그대로 통과 | **이미 완료.** 별건 설계 불필요 — 확인만 하면 된다. |
| 재개발APT(`redevelopment_apt`) | **아니다** — 명부는 화면에 있지만 §154① 판정은 원시 스칼라를 쓴다(F1 게이트가 `=== "housing"` 리터럴만 통과) | **버그.** 명부 필수화 전에 엔진 배선(F1 확장)이 선행돼야 한다 — 안 하면 「입력은 받는데 무시한다」가 된다. |
| 입주권(`right_to_move_in`) | **아니다** — §89①4호 가목·나목 판정이 원시 스칼라(`householdHousingCount`)를 직접 읽는다. 더 심각한 건 **그 스칼라 위젯에 "0채" 버튼이 없어** 가목(전액 비과세)이 계산기에서 애초에 도달 불가 | **버그 + 추가 결함 발견.** 엔진 배선과 "0채" 입력 경로를 함께 고쳐야 한다. |
| 분양권(`presale_right`) | **§154① 축 자체가 없다**(사용자 지시가 맞다, §89①·②를 KoreanLaw MCP로 확인). 유일하게 걸리는 축은 §104①4호(조정대상지역 주택분양권 50%, **2020.8.18 삭제** — 2018.1.1~2021.5.31 양도분 한정) 단서의 "무주택" 판정인데 **이것도 원시 스칼라를 쓴다**(엔진은 명부를 아예 안 본다) | **분양권 양도 자체는 대상 아님 — 사용자 최종 결정(Q-11).** 대신 **세대가 보유한 분양권·입주권을 목록에 반드시 입력**하게 한다(§4-5, PR-D). |

→ **권장 작업 순서**: ① 겸용주택은 "이미 됐다"로 문서만 정정, ② 재개발APT·입주권은 엔진 F1 확장 + 명부 필수화를 **한 PR**로(입력만 열고 안 쓰면 그 자체가 결함), ③ 분양권 양도 자체는 제외(Q-11), ④ 세대 보유 분양권·입주권 목록을 필수 입력으로(§4-5, Q-17~19).

## 1. 선행 계획서 재확인

`merge-composition-unknown-unfavorable.plan.md` §2-8 "자산 종류별" 표(:116-117)는 다음을 적었다:

> 입주권·분양권·재개발 아파트: 명부 입력 있음(`lib/calc/housing-like-asset.ts:40-45`) — 양도하는 권리를 **뺀** 주택 수. `1 + 행 수` 도출을 그대로 쓰면 가목이 영영 서지 않는다.
> 겸용주택: 명부 입력 있음 + 별도 축. `householdHousingCountForExclusion`(`transfer-mixed-use.types.ts:172·311`) — 양도 겸용주택 **포함**.

이 표는 "명부가 입력은 되는데 축이 다르다"까지만 확인했고, **"그 명부가 실제로 그 판정에 쓰이는지"는 확인하지 않았다**. 이번 조사로 그 간극을 메운다 — 쓰이는지 여부가 자산마다 다르고, 겸용주택은 "별건"이 아니라 "이미 완료"였다.

## 2. 자산별 현황 실측

### 2-1. 재개발 아파트(`redevelopment_apt`)

**화면**:
- `primaryKind !== "housing"`이므로 Step4.tsx의 "다른 보유 주택 없음" 확정 토글(PR-1, `:338-366`)이 아니라 **구 스칼라 버튼** "1 / 2 / 3+"가 뜬다(`app/calc/transfer-tax/steps/Step4.tsx:368-417`, 기본값 "1" — `lib/stores/calc-wizard-store.ts:75`).
- 명부(`HousesListSection`)는 `houseRosterRendered`가 `isHousingLike(primaryKind) && 스칼라 >= 2`일 때만 연다(`lib/calc/house-count-inputs-scope.ts:70-74`). 즉 **스칼라를 먼저 2로 올려야 명부가 열린다** — 명부가 스칼라를 따라가는 게 아니라 거꾸로다.

**④ 전송**: `lib/calc/transfer-tax-api.ts:445` 등이 `resolveHouseholdHousingCount({ primaryKind, declared, houses, legacyPrecedence })`를 호출하지만, `resolveHouseholdHousingCount`(`lib/calc/household-house-count.ts:94-102`)는:
```
if (args.primaryKind !== "housing") return args.declared; // F1
```
`primaryKind`는 `form.assets[0].assetKind`의 **리터럴 문자열**이다. `redevelopment_apt !== "housing"`이므로 이 함수는 **명부를 전혀 보지 않고** `declared`(스칼라)를 그대로 돌려준다. 같은 F1 리터럴 게이트가:
- `housesPatchWithDerivedCount`(`:150-166`, `:158` `const isHousing = primaryKind === "housing"`) — 명부 편집 시 스칼라 자동 동기화. redevelopment_apt는 미적용 → 스칼라·명부가 동기화되지 않는다.
- `houseRosterIsAuthoritative`(`:112-117`) · `houseCountDivergedFromRoster`(`:178-185`) · `houseCountScalarLocked`(`:199-206`) — 전부 같은 리터럴.
- `resolveTemporaryTwoHouse`/`temporaryTwoHouseApplies`(`:285-323`, 게이트 `:300` `if (args.primaryKind !== "housing") return fallback();`) — §155① 일시적 2주택의 "신규 주택" 명부 자동 도출도 redevelopment_apt에는 적용되지 않는다.

**엔진 소비**: `lib/tax-engine/transfer-tax.ts:173-174`가 `judgeRedevAptOneHouseExemption(redevInput, ...)`을 호출하고, 그 함수(`lib/tax-engine/transfer-tax-redevelopment-apt-exemption.ts:34-`)는 주석(`:88-93`)으로 명시한다:

> `checkExemption`의 유일한 자산 게이트는 `propertyType !== "housing"`이다 … ⇒ 판정 경계에서만 `housing`으로 번역한다.

번역된 입력(`exemptionJudgeInput`)은 `runHouseCountExclusionStep(redevInput, ...)`(`:76`)이 만드는데, 이 함수의 **기준값**은 `redevInput.householdHousingCount` — 즉 위에서 확인한 F1-게이트를 통과하지 못한 **원시 스칼라**다. `runHouseCountExclusionStep`은 거기서 §99의4(농어촌·고향주택)·§98의9(준공후미분양) 등 **제외**는 명부(`houses[]`)를 보고 정확히 계산하지만, **빼기 전 기준값 자체가 스칼라**다.

→ **실측 가능한 함정**: 사용자가 명부에 다른 주택 1채를 입력해도(화면상 "입력했다"는 느낌을 주지만), 스칼라 버튼을 "1"로 그대로 두면 §154① 판정은 "1주택"으로 계산된다 — PR-1이 `housing`에서 고친 것과 **동일한 종류의 스칼라-명부 괴리**가 `redevelopment_apt`에는 남아 있다.

**다주택 중과(§104⑦)와는 다르다**: `SURCHARGE_SUBJECT_PROPERTY_TYPES`(`lib/tax-engine/transfer-tax-surcharge-predicate.ts:81-85`)에 `redevelopment_apt`가 들어 있어, `determineMultiHouseSurcharge`는 `houses[]`를 **직접** 받아 정밀 판정한다(`runMultiHouseSurchargeStep`, `lib/tax-engine/transfer-tax-judgment-steps.ts:309-380` — `householdHousingCount` 스칼라를 거치지 않음). 즉 **중과 축은 이미 명부 기반으로 정확하고, 비과세 축만 스칼라에 묶여 있다** — 한 화면 안에서 두 판정이 다른 소스를 쓰는 비대칭.

### 2-2. 조합원입주권(`right_to_move_in`)

**화면**: redevelopment_apt와 같은 구 스칼라 버튼("1 / 2 / 3+", 기본 "1") + **추가로** "세대 보유 조합원입주권 수"(0/1/2+, `Step4.tsx:419-444`)와 "세대 보유 분양권" 목록(`PresaleRightsSection`, `:462-468`)이 뜬다.

🔴 **발견(Q-7 범위 밖에서 드러난 결함)**: §89①4호 가목(전액 비과세, "다른 주택 **0채**")을 선택하려면 `householdHousingCount === "0"`이어야 하는데, 이 자산에서 뜨는 주택수 버튼군은 **"1 / 2 / 3+"뿐 — "0"이 없다**(`Step4.tsx:375` `["1", "2", "3+"].map(...)`, 기본값도 "1"). 입주권 수 버튼(0/1/2+)과는 **다른 필드**다. 즉 **계산기 화면만으로는 §89①4호 가목(전액 비과세)에 도달할 입력 경로가 없다** — 숫자 입력칸이나 URL 조작 없이는 "0채"를 선택할 수 없다. (E2E grep — `right-to-move-in-asset-kind-axis.spec.ts` 등 기존 테스트도 전부 `householdHousingCount: "1"`만 시딩한다, 가목 테스트 없음.)

**엔진 소비**: `resolveOneRightExemptionClause`(`lib/tax-engine/transfer-tax-redevelopment-transforms.ts:186-224`):
```
if (input.householdHousingCount === 0) return "ga";   // :205
if (input.householdHousingCount === 1) { ... }         // :208  (나목)
```
`input.householdHousingCount`는 `right_to_move_in !== "housing"`이므로 역시 F1 게이트를 통과하지 못한 **원시 스칼라**다. 명부가 이 판정에 닿는 경로가 없다.

**다주택 중과**: `right_to_move_in`은 `SURCHARGE_SUBJECT_PROPERTY_TYPES`에 **없다**(법 §104⑦이 "주택"만 대상 — `transfer-tax-surcharge-predicate.ts:65-69` 주석, 소득세법 §104⑦ 본문 KoreanLaw MCP 확인: "다음 각 호의 어느 하나에 해당하는 **주택**… 양도하는 경우"). 따라서 입주권 자신의 양도에는 중과 가산이 전혀 걸리지 않고, 명부는 이 축에서도 쓰이지 않는다.

→ 입주권은 **명부가 어느 판정에도 안 쓰인다** — 화면에는 뜨지만(조정대상지역 자동조회 용도만, `housing-like-asset.ts` 상단 주석), 세액에 영향 없음. 명부를 필수화하려면 반드시 §89①4호 쪽 엔진 배선을 먼저(또는 같이) 고쳐야 하고, "0채" 입력 경로도 함께 열어야 한다.

### 2-3. 분양권(`presale_right`)

**법령 확인(KoreanLaw MCP, 소득세법 MST 280405, 2026-10-05 조회)**:
- §89①3호: "주택과 이에 딸린 토지"만 대상 — 분양권은 "주택"이 아니라 대상이 아니다.
- §89①4호 가목·나목: "조합원입주권을 1개 보유한 1세대"가 주어 — **분양권에는 이 조문이 없다**. 가목·나목 양쪽 모두 "다른 주택 또는 **분양권**을 보유하지 아니할 것"처럼 분양권을 **방해 요소**로만 쓴다.
- §89②: "1세대가 주택과 조합원입주권 또는 **분양권**을 보유하다가 그 주택을 양도하는 경우" — 역시 **분양권 자신의 양도**가 아니라 **주택을 가진 세대가 분양권도 가진 경우** 그 **주택** 비과세를 제한하는 조문이다.

⇒ 사용자 지시("분양권 자체의 양도는 1세대1주택 비과세 되는 경우가 없다")가 **법문으로 확인됐다**. `ONE_HOUSE_EXEMPTION_ASSET_KINDS`(`lib/calc/housing-like-asset.ts:74-77`)에 `presale_right`가 없는 것도 이와 일치한다.

**그럼 명부가 쓰이는 다른 축이 있는가 — §104①4호 조사**:
- 현행 소득세법 §104①4호는 "삭제\<2020.8.18\>"(KoreanLaw MCP 확인). 삭제 전 조문은 **"조정대상지역에 있는 주택분양권"에 50% 단일세율**을 매겼고, 단서로 "1세대가 보유하고 있는 주택이 없는 경우"를 제외했다(엔진 주석과 `data/short-term-rate-history.ts`가 이미 실독 확인해 둠).
- 적용 구간은 **2018-01-01 ~ 2021-05-31 양도분**뿐이다(`lib/tax-engine/data/short-term-rate-history.ts:17-30` — 2021-06-01 시행분부터 `regulatedPresaleRight: null`). 경계일은 2020.8.18(공포일)이 아니라 **2021.6.1**(해당 개정 법률 제17477호의 시행일) — 공포일과 시행일이 다른 사례.
- 엔진에서 이 단서는 `lib/tax-engine/transfer-tax-rate-calc.ts:458-460`:
  ```
  householdHasNoHouse: input.householdHousingCount === 0,
  ```
  로 반영된다. `input.householdHousingCount`는 역시 F1 게이트 미적용 **원시 스칼라**다.

→ **분양권에서 명부가 쓰이는 축은 없다.** §154① 축 자체가 없고(사용자 말대로), 유일하게 "무주택" 사실을 쓰는 §104①4호도 지금 엔진이 스칼라만 보도록 설계돼 있다(그리고 이 조문은 2021-05-31 이전 양도라는 좁은 역사적 창에만 열린다). 명부를 필수화해도 이 판정에 닿을 길이 없으므로 **사용자 입력 부담만 늘고 판정 정확도는 그대로**다.

**다주택 중과**: `presale_right`도 `SURCHARGE_SUBJECT_PROPERTY_TYPES`에 없다(§104⑦은 "주택"만, 분양권은 호수를 세는 요소로만 등장). 따라서 이 축도 명부와 무관.

### 2-4. 겸용주택(`isMixedUseHouse`)

**🔴 핵심 재확인**: 겸용주택은 **별도 `assetKind`가 아니다.** `assetKind === "housing"`인 자산에 거는 **토글**이다(`components/calc/transfer/MixedUseSection.tsx:6` 주석 "`assetKind === 'housing'` 이고 `isMixedUseHouse === true` 일 때 하단 노출", `:90` `if (!asset.isMixedUseHouse) return null;`).

따라서 겸용주택을 양도하는 폼의 `primaryKind`는 **리터럴 `"housing"`**이다. 이는:
- `resolveHouseholdHousingCount`의 F1 게이트(`primaryKind === "housing"`)를 그대로 통과 — 명부가 있으면 `1 + 행수`로 도출된다.
- PR-1의 ⑧ 차단(`lib/calc/transfer-tax-validate-step1.ts:43-62` `primaryKind === "housing" && ...`)도 그대로 적용 — 명부 0행이면 "다른 보유 주택이 없습니다" 확정이 없으면 차단된다.
- Q-6(스칼라 버튼 제거)도 그대로 적용 — 겸용주택 양도 화면에는 숫자 버튼이 없고 PR-1의 확정 토글만 뜬다.

**엔진 경로의 재확인**: `app/api/calc/transfer/route.ts:488`이 `buildMixedUseAssetInput`에 넘기는 `householdHousingCount: data.householdHousingCount`는 **Zod로 파싱된 요청 바디 값 그대로**다. 그 요청 바디 값은 ④(`lib/calc/transfer-tax-api.ts:445`)가 **클라이언트 쪽에서 이미** `resolveHouseholdHousingCount`로 명부-도출해 보낸 값이다(route.ts:359·384의 `engineInput.householdHousingCount`와 **같은 소스** — 둘 다 `data.householdHousingCount`의 passthrough, `app/api/calc/transfer/engine-input.ts:66` `householdHousingCount: data.householdHousingCount`). 서버가 두 번 다른 값을 만드는 게 아니라 **같은 가치를 두 곳에서 읽는 것**이다.

⇒ `householdHousingCountForExclusion`(겸용 §89①3호 주택수 제외 판정, `mixed-use-asset-input.ts:189`)은 **이미 명부-도출값을 받는다.** 선행 계획서 §2-8이 "겸용주택 — 가산 방식이 다르다"고 적은 것은 맞지만("양도 겸용주택 자신 포함" = `housing`과 같은 `1+rows` 방식이라 **오히려 같다**), "별건 설계 필요"라는 함의는 **틀렸다** — 이미 PR-1로 해결돼 있다.

**남는 확인 필요**: 컴패니언(함께 양도) 겸용 자산이 `form.assets[0]`(primary)이 아니라 companion 쪽에 있을 때도 같은 roster를 공유하는지는 다건/겸용 번들 경계의 일반 문제이고, 겸용에 특화된 문제가 아니다(Q-9 — 범위 밖, 기존 결정 유지).

## 3. "명부 필수"가 각 자산에서 의미하는 것

| 자산 | 스칼라 → 명부 치환 가능? | 올바른 도출식 | "없음 확정" 토글로 충분한가 |
|---|---|---|---|
| 겸용주택 | 이미 치환됨(PR-1) | `1 + countedHouseRows(houses)` (housing과 동일) | 이미 적용됨 |
| 재개발APT | 가능 — housing과 같은 의미(신축주택 자신이 "그 주택") | `1 + countedHouseRows(houses)` | 가능(housing과 같은 UX) |
| 입주권 | 가능하나 **다른 식** — 입주권 자신은 "주택"이 아니므로 +1 하지 않음 | `countedHouseRows(houses)` (0행=0채, 가목 자동 충족) | 가능하지만 "0행"이 곧 "없음"이라 확정 토글이 오히려 불필요할 수 있음(Q-13) |
| 분양권 | 대상 아님(Q-11 최종) — 분양권 양도는 §104①1호·3호 단일세율(60%·70%)이고 주택 수가 세율을 바꾸지 않는다 | 해당 없음 | 해당 없음 |

재개발APT·입주권 모두 "명부 필수"를 하려면 **엔진이 그 명부를 실제로 읽게 만드는 작업이 선행돼야** 한다 — 그렇지 않으면 "화면은 입력을 요구하는데 세액은 그 입력과 무관하게 나온다"는, PR-1이 고친 것과 정반대의 새 결함(memory `feedback_ui_gate_removes_sole_input_path`의 변형 — 입력 경로는 있는데 결과가 그걸 안 쓴다)을 만든다.

## 4. 설계안

### 4-1. 겸용주택 — 조치 없음(문서 정정만)

Q-7의 "별건" 분류를 철회하고, 선행 계획서 §2-8 표의 "가산 방식이 다르다" 주석에 "이미 PR-1로 해결됨(2026-10-05 재확인)"을 덧붙인다. 코드 변경 없음.

### 4-2. 재개발APT — 엔진 F1 확장 + 명부 필수화 (한 PR)

**엔진**: `lib/calc/household-house-count.ts`의 F1 패밀리(`resolveHouseholdHousingCount` · `housesPatchWithDerivedCount` · `houseRosterIsAuthoritative` · `houseCountDivergedFromRoster` · `houseCountScalarLocked`) 게이트를 `primaryKind === "housing"` 단일 리터럴에서 **`primaryKind === "housing" || primaryKind === "redevelopment_apt"`**로 넓힌다(또는 `isOneHouseExemptionAsset`를 재사용 — 그 집합이 정확히 `{housing, redevelopment_apt}`다, `housing-like-asset.ts:74-77`). `resolveTemporaryTwoHouse`의 F1도 같은 근거로 검토(§155① 신규주택 자동 도출을 재개발APT에도 열지 여부 — Q-12).

**화면**: `Step4.tsx`의 "명부 vs 스칼라" 분기(`:338` `primaryKind === "housing" ? (확정 토글) : (스칼라 버튼)`)를 `isOneHouseExemptionAsset(primaryKind)`로 바꿔 재개발APT도 확정 토글 + 무조건 열린 명부로 전환(Q-6과 동일 UX). `houseRosterRendered`(`house-count-inputs-scope.ts:72`)의 `primaryKind === "housing"` 무조건절도 같이 넓힌다.

**⑧**: `transfer-tax-validate-step1.ts:49`의 `primaryKind === "housing"` 게이트를 같은 집합으로 넓힌다.

### 4-3. 입주권 — 별도 도출식 + "0채" 입력 경로 신설 + 명부 필수화

입주권은 재개발APT와 **같은 F1 그룹에 넣지 않는다** — `1+rows`가 아니라 `rows`(0-오프셋)가 맞는 식이다. 신규 함수(가칭 `resolveRightHouseholdHousingCount` 또는 `resolveHouseholdHousingCount`에 `offset` 파라미터 추가)로 분리한다.

**화면**: `Step4.tsx:368-417`의 "1/2/3+" 스칼라 버튼을 없애고, 입주권에도 명부(확정 토글 + `HousesListSection`)를 무조건 연다. 명부 0행 = `householdHousingCount: 0`(가목 자동 충족 조건의 일부)이 **자동으로 성립** — 더 이상 "0채" 버튼을 따로 만들 필요가 없다(명부가 스칼라의 상위 호환이 되므로 Q-7 이전부터 있던 "0채 도달 불가" 결함이 이 설계로 함께 해소된다).

**⑧**: `transfer-tax-validate-step1.ts:49`에 입주권도 추가(재개발APT와 같은 조건식, 다른 도출 함수).

**영향받는 기존 테스트 전제**: `transfer-validation-field-jump.spec.ts:131` 주석 "입주권(Q-7 범위 밖)으로 같은 householdHousingCount 빈 값 분기를 재현한다"는 **이 설계가 적용되면 전제가 깨진다** — 다른 자산(토지·일반건물 등, 여전히 범위 밖)으로 테스트 대상을 바꿔야 한다.

### 4-4. 분양권 양도 — 대상 아님 (Q-11 최종)

**사용자 결정(2026-10-05, 최종)**: 「분양권 자체를 팔 때에는 주택 목록을 필수로 할 필요가 없다(분양권은 60%, 70% 세율 적용됨).」 — 직전에 「분양권: 목록에 필수로 입력」으로 적었던 것은 **「세대가 보유한 분양권을 목록에 반드시 입력」**이라는 뜻이었다(§4-5). 리드가 「분양권 양도에 주택 목록 필수」로 잘못 옮겼다가 사용자 확인으로 바로잡았다.

**법령 확인(KoreanLaw MCP, 소득세법 MST 280405 — 시행 2026.1.1.)**: 소득세법 제104조제1항제1호 「분양권의 경우에는 양도소득 과세표준의 100분의 60」, 같은 항 제3호 보유기간 1년 미만 「주택, 조합원입주권 및 분양권의 경우에는 100분의 70」(제2호 1년 이상 2년 미만도 분양권 100분의 60). 세대 주택 수가 이 세율을 바꾸지 않고, 같은 조 제7항 중과는 「주택」만 대상이다.

**별건 기록 — 구 소득세법 §104①4호 단서(무주택 분양권, 2018.1.1~2021.5.31 양도분)**: 엔진(`transfer-tax-rate-calc.ts:458-460`)은 `householdHousingCount === 0`이면 단서를 적용하는데, ① 분양권 양도 화면의 주택 수 버튼에 0이 없어 계산기에서는 도달하지 않고, ② 소득세법 시행령 제167조의6의 요건(1. 양도 당시 세대가 다른 주택의 입주자로 선정된 지위를 보유하지 않을 것 · 2. 양도자가 30세 이상이거나 배우자가 있을 것 — 시행 2018.2.13. 제28637호(MST 202148)·시행 2020.2.11. 제30395호(MST 214261) 본문 동일, KoreanLaw MCP 확인)을 보지 않는다. 이번 결정으로 계산기 도달 경로는 계속 없으므로 이 프로그램 범위 밖으로 남긴다(API 직접 호출에서만 도달). ~~Q-16~~ 폐기.

### 4-5. 세대 보유 분양권·입주권 목록 필수 입력 (PR-D, Q-17~19)

**현재**: 「분양권·입주권」 카드(`components/calc/transfer/PresaleRightsSection.tsx`, 값 `form.presaleRights` — 항목 `type: "presale_right" | "right_to_move_in"`)가 이미 있다. 비어 있으면 「없음」만 표시하고 ⑧이 막지 않는다 — PR-1 이전의 주택 목록과 같은 「입력 안 함 = 없음」 상태다. 이 값은 소득세법 §89②(주택 + 권리 보유 세대의 주택 양도)·§104⑦2호·4호(주택 + 권리 수 합) 판정의 직접 입력이다(`Step4.tsx` ② 섹션 주석).

**사용자 결정(2026-10-05)**:
- Q-17 — 카드가 비어 있으면 **별도 확인 토글** 「보유한 분양권·입주권이 없습니다」를 켜야 ⑧이 통과한다(「다른 보유 주택이 없습니다」와 합치지 않는다 — 주택은 있고 권리는 없는 경우가 흔하다). 항목이 생기면 확인을 해제한다(#1919 패턴, PR-1과 같다).
- Q-18 — 취득일과 무관하게 **보유한 분양권·입주권 전부**를 입력하게 한다. 주택 수 산입 여부(소득세법 시행령 제167조의11 등 2021.1.1. 이후 취득분)는 엔진이 취득일로 가린다. 안내 문구도 그에 맞게 고친다(지금 문구 「2021.1.1 이후 취득한 … 포함됩니다」는 「그 이후 것만 입력」으로 읽힐 수 있다).
- Q-19 — 별도 PR(PR-D)로 진행한다.

**대상 양도 자산**: 주택(겸용 포함)·재개발 아파트·조합원입주권 — §89②·§89①4호 가목(「다른 주택 또는 분양권을 보유하지 아니할 것」)·§104⑦의 판정을 받는 자산. 분양권 양도는 대상 아님(Q-11).

**확인 필요(V-5)**: 입주권 양도 화면의 「세대 보유 조합원입주권 수」(`householdRightCount`, 0/1/2+, `Step4.tsx:418-444`)가 이 목록의 `right_to_move_in` 항목과 같은 사실을 따로 받는 두 번째 입력인지 — 그렇다면 PR-C/PR-D에서 하나로 정리해야 한다(같은 사실을 두 곳에서 받으면 어긋난다). PR-C Do 전 확인.

### 4-6. PR-C 사전 확인 결과 — PR-D를 먼저 한다 (Q-20)

PR-C 레인이 구현 전 확인에서 멈췄다(코드 변경 없음). 리드가 코드로 재확인했다.

**V-5 — 이중 입력이다.**
- 입주권 양도 화면의 「세대 보유 조합원입주권 수」(`householdRightCount`, 0/1/2+, 「양도하는 입주권 자체도 포함」 — `app/calc/transfer-tax/steps/Step4.tsx:418-444`)가 §89①4호 「조합원입주권을 1개 보유한 1세대」 판정의 유일한 입력이다(④ `lib/calc/transfer-tax-api.ts:453`·`lib/calc/multi-transfer-tax-api.ts:293`).
- 같은 화면의 「분양권·입주권」 목록(`PresaleRightsSection`)에서도 항목 종류로 「조합원입주권」(`type: "redevelopment_right"`, `components/calc/transfer/PresaleRightsSection.tsx:88-92`)을 고를 수 있는데, 입주권 양도 판정은 이 항목을 쓰지 않는다. 목록→입주권 수 도출(`deriveHouseholdRightCount`, `lib/tax-engine/one-house/house-count.ts:124-130`)은 판정 메뉴(`app/api/calc/one-house-exemption/route.ts:176`) 전용이다.
- ⇒ 목록에 다른 입주권을 넣어도 숫자 칸이 1이면 「1개 보유」로 판정된다(PR-1 이전 주택 수와 같은 종류의 괴리).

**가목 안전성 — 0채를 먼저 열면 「모름 → 유리」가 계산기에서 켜진다.**
- `oneRightPresaleGate`(`lib/tax-engine/transfer-tax-redevelopment-transforms.ts:97-109`)는 `presaleRights`가 비어 있으면 `"clear"`를 돌려준다 — 분양권 보유를 모르는 것이 「없음」으로 읽힌다(memory `feedback_unknown_fact_applies_unfavorably`와 반대).
- V-4: 가목은 API·엔진 수준에서 이미 도달 가능하다(`__tests__/tax-engine/transfer/clause1-bucket-echo.anchor.test.ts:42` — `presaleRights` 없이 `householdHousingCount: 0`). 계산기는 0 버튼이 없어 막혀 있을 뿐이다.
- PR-C가 0채를 먼저 열면 주택 쪽은 확인을 받지만 분양권 쪽은 확인 없이 가목이 성립한다(memory `feedback_ui_gate_expansion_activates_latent_defect`).

**결정(Q-20)**: 순서를 **PR-D → PR-C**로 바꾼다. PR-D에서
1. 「분양권·입주권」 목록 「없음」 확인 토글 + ⑧(§4-5 그대로) — 이것이 PR-C가 여는 가목 경로의 분양권 쪽 확인이 된다.
2. 입주권 양도 화면의 `householdRightCount` 숫자 칸을 없애고 **양도하는 입주권 1개 + 목록의 조합원입주권 항목 수**로 도출한다(PR-1 패턴 — 한 곳(leaf)에서 도출, ④ 단건·다건 공유). 도출 대상 항목의 범위(취득일 무관 여부 등)는 §89①4호 본문으로 확인 후 정한다.

API 직접 호출에서 `presaleRights` 미지정 시 `"clear"`가 되는 엔진 동작은 이 프로그램 범위 밖으로 남긴다(계산기는 PR-D의 ⑧이 막는다). 필요하면 별건.

## 5. 영향

### 5-1. 다건(`multi-transfer-tax-api.ts`)

`lib/calc/multi-transfer-tax-api.ts:166-174·286-304`가 ④와 완전히 같은 `resolveHouseholdHousingCount` 패턴을 쓴다(§2-1에서 확인). F1 확장은 **같은 leaf를 공유**하므로 다건에도 자동 적용된다 — 별도 배선 불필요. ⑧ 검증도 `collectStep1Issues`를 그대로 쓰는지 확인 필요(V-1).

### 5-2. 겸용(`mixed-use-asset-input.ts`)

4-1(조치 없음)이므로 영향 없음. 다만 4-2의 F1 확장이 "housing" 외 리터럴을 추가하면서 `isMixedUseHouse` 토글이 걸린 `redevelopment_apt`가 애초에 존재하는지(설계상 겸용은 `assetKind==="housing"` 전용이라 중복 케이스는 없을 것으로 보임, V-2) 확인한다.

### 5-3. legacy 레코드

사용자가 "기존 데이터는 모두 삭제했다"(PR-1 Q-2 근거와 동일 전제)고 한 것은 **그 시점(2026-10-05 이전) 기준**이다. 이 작업이 Do에 들어가는 시점에 그 전제가 여전히 유효한지 다시 확인한다(Q-14) — PR-1·PR-2~4 완료 후 사용자가 다시 사용했다면 재개발APT·입주권 레코드가 쌓였을 수 있다. 유효하면 PR-1과 같이 OH-34류 legacy 표식 없이 바로 차단해도 된다. 무효라면 PR-1의 `legacyHouseCountPrecedence` 패턴(또는 그 필드를 그대로 재사용 — 이미 범용으로 설계돼 있다, `ResolveHouseholdHousingCountArgs.legacyPrecedence`)을 적용한다.

## 6. 깨질 테스트 실측 (grep, Do 전 재측정 필요)

**E2E** — `houses:` 미선언 + 해당 자산종류 사용 파일(과소 집계 가능 — `houses: []` 명시 파일은 이 grep에 안 잡힌다):

| 자산 | 파일 수 | 파일 |
|---|---|---|
| 입주권 | 7 | `redevelopment-land-right-one-household-disabled` · `redev-right-exemption-no-calc-editor` · `redevelopment-acquisition-mode-radio` · `right-to-move-in-asset-kind-axis`(13회 참조) · `transfer-dead-end-defects` · `transfer-handoff-notice-provenance` · `transfer-validation-field-jump`(전제 충돌, §4-3 참조) |
| 재개발APT | 10 | 위 4개 겹침(`redev-right-exemption-no-calc-editor`·`redevelopment-acquisition-mode-radio`·`right-to-move-in-asset-kind-axis`·`transfer-dead-end-defects`) + `redev-phd-stdprice-regroup` · `redevelopment-inheritance-163-9-acquisition` · `redevelopment-multi-house-surcharge` · `redev-receive-only-filing-total` · `transfer-fractional-single-asset` · `transfer-sidebar-asset-kind-amounts` |
| 분양권 양도 | 2(Q-11 최종 — 분양권 양도는 대상 아님, 영향 없음) | `transfer-dead-end-defects` · `transfer-unregistered-asset-kind-gate` |

**중복 제거 합계: E2E 13개 파일**(입주권∪재개발APT). PR-D(권리 목록 확인 토글)는 주택 양도 E2E 전반에 걸리므로 PR-D Do 전에 따로 측정한다. 이 중 대부분은 `householdHousingCount: "1"`로 시딩돼 있어 — 설계가 "housing과 같은 무조건 명부"(Q-6 방식)로 가면 householdHousingCount 값과 무관하게 **전부 영향받는다**(1채 선언이어도 확정 토글이 새로 필요해진다).

**vitest**: `right_to_move_in`·`redevelopment_apt`를 참조하는 파일이 각각 124·129개 있으나 이는 자산종류 키워드의 **전체 참조 수**(과대 집계 — 대부분 householdHousingCount·houses와 무관한 다른 축 테스트). Do 전 다음 질의로 재측정할 것: `householdHousingCount: "2"` 이상 선언 + `houses` 미선언 + `legacyHouseCountPrecedence` 미선언 조합. 이 문서는 선행 계획서의 동일 캐비트(§2-8 "Do 전 재측정")를 그대로 따른다.

**anchor로 고정해야 할 설계 전제**: `house-count-scalar-lock.anchor.test.tsx` · `household-house-count-wiring.anchor.test.ts` · `house-count-divergence.test.ts`(PR-1이 이미 만든 파일들) — F1 집합을 넓히면 이 파일들의 "housing만 해당" 전제도 갱신해야 한다.

## 7. PR 분할안

| PR | 내용 | 비고 |
|---|---|---|
| PR-A | §4-1 — 겸용주택 "이미 완료" 문서 정정 (선행 계획서 §2-8 각주 추가) | 코드 변경 없음, 즉시 가능 |
| PR-B | §4-2 — 재개발APT: F1 확장(엔진) + 명부 UX 전환(화면) + ⑧ + 테스트 갱신 | ✅ #1983 머지(2026-10-05) |
| PR-C | §4-3 — 입주권: 권리 양도용 도출식(엔진, +1 없음) + 명부 UX 전환(화면, "0채" 입력 경로 포함) + ⑧ + 테스트 갱신 | ✅ #1985 머지(2026-10-06) |
| PR-D | §4-5·§4-6 — 세대 보유 분양권·입주권 목록 필수 입력(확인 토글 + ⑧, 주택·겸용·재개발APT·입주권 양도) + 입주권 양도의 입주권 수를 목록에서 도출 | ✅ #1984 머지(2026-10-05) — PR-C보다 먼저(Q-20) |

PR-B·PR-C는 서로 다른 도출식이라 **분리 가능**(재개발APT만 먼저 해도 입주권에 영향 없음, 역도 성립) — 리스크를 줄이려면 분리 권장.

## 8. 레지스터

### 사용자 결정 필요 (Q)

| # | 질문 | 권장안 | 근거 |
|---|---|---|---|
| Q-11 | 분양권 양도에 주택 명부를 필수로 할 것인가 | 제외한다 | **사용자 최종 결정(2026-10-05): 필요 없다**(분양권은 60%·70% 세율). 「목록에 필수로 입력」은 세대 보유 분양권을 목록에 입력하라는 뜻이었다 → §4-5·Q-17~19 |
| Q-12 | 재개발APT에 §155① 일시적 2주택 "신규 주택 명부 자동 도출"(`resolveTemporaryTwoHouse`)도 F1 확장에 포함할 것인가 | **포함한다** — housing과 같은 집합(`isOneHouseExemptionAsset`)으로 일관되게 넓히는 것이 "또 다른 반쪽 배선"을 막는다 | 일관성(F1 패밀리를 부분적으로만 넓히면 같은 종류의 스칼라-명부 괴리가 §155①에 남는다) — **사용자 결정(2026-10-05): 함께 연다** |
| Q-13 | 입주권에서 "다른 보유 주택이 없습니다" 확정 토글을 housing·재개발APT와 같이 둘 것인가, 아니면 "0행=0채"가 자동으로 성립하므로 토글 자체를 생략할 것인가 | **토글을 그대로 둔다**(housing과 같은 UX, Q-5 패턴 재사용) — "안 넣음"과 "없음"을 구별하는 PR-1의 원래 취지가 입주권에도 똑같이 적용된다 | 일관성 + PR-1 설계와의 재사용성 — **사용자 결정(2026-10-05): 구별한다(토글 유지)** · 분양권에도 같게 적용 |
| Q-14 | PR-1~4 머지(2026-10-05) 이후 사용자가 재개발APT·입주권 레코드를 새로 쌓았는가(legacy 처리 필요 여부) | **Do 착수 직전 사용자에게 재확인** | 전제가 시간에 따라 달라질 수 있다 — **사용자 답(2026-10-05): 새 기록 없음** ⇒ legacy 예외 없이 바로 차단 |
| Q-15 | PR-B·PR-C를 한 PR로 합칠지 분리할지 | **분리**(§7 표) | 리스크 격리, 롤백 단위 축소 — **사용자 결정(2026-10-05): 권장안대로**(계획서 머지 → PR-B 재개발APT → PR-C 입주권·분양권 순차) |
| ~~Q-16~~ | ~~§104①4호 단서에 영 §167의6 반영~~ | — | **폐기** — Q-11 최종 결정으로 계산기 도달 경로가 생기지 않는다. §4-4 별건 기록으로 남김 |
| Q-17 | 세대 보유 분양권·입주권 목록의 「없음」 확인 방식 | 「다른 보유 주택이 없습니다」와 **별도 토글** | **사용자 결정(2026-10-05): 권장안** |
| Q-18 | 입력 범위 | 취득일과 무관하게 **보유분 전부**(산입 여부는 엔진이 취득일로 판단) | **사용자 결정(2026-10-05): 권장안** |
| Q-19 | 진행 방식 | **별도 PR(PR-D)** — 순서 PR-B → PR-C → PR-D | **사용자 결정(2026-10-05): 권장안** — 순서는 Q-20으로 바뀜 |
| Q-20 | PR-C 사전 확인에서 V-5(이중 입력)·가목 안전성 문제가 나왔다(§4-6). 순서와 정리 방법 | **PR-D를 PR-C보다 먼저** 하고, PR-D에서 입주권 양도의 「세대 보유 조합원입주권 수」 숫자 칸을 없애 목록에서 도출 | **사용자 결정(2026-10-05): 그 순서로 진행** |

### 확인 필요 (V)

| # | 확인할 것 | 시점 |
|---|---|---|
| V-1 | 다건(`multi-transfer-tax-api.ts`)의 ⑧ 검증이 단건과 같은 `collectStep1Issues`를 쓰는지, 아니면 별도 검증 경로라 F1 확장이 다건에는 안 먹는지 | PR-B/PR-C Do 전 |
| V-2 | 겸용주택(`isMixedUseHouse`)이 `assetKind === "redevelopment_apt"` 자산에도 걸릴 수 있는지(설계상 "housing" 전용으로 보이나 자산 폼 정의를 직접 재확인) | PR-B Do 전 |
| V-3 | vitest 전체에서 `householdHousingCount >= "2"` + `houses` 미선언 + `legacyHouseCountPrecedence` 미선언 + (`right_to_move_in` 또는 `redevelopment_apt`) 조합의 정확한 파일 수(§6의 거친 추정 대체) | PR-B/PR-C Do 전 |
| V-5 | 입주권 양도 화면 `householdRightCount`(0/1/2+)와 권리 목록 `right_to_move_in` 항목이 같은 사실의 이중 입력인지(§4-5) | ✅ **이중 입력 확인**(§4-6) |
| V-4 | §89①4호 가목(householdHousingCount===0)이 현재 **API 직접 호출**로는 도달 가능한지(계산기 UI만 막혀 있고 vitest/route anchor는 이미 0을 테스트하고 있을 가능성) | ✅ **이미 도달 가능**(§4-6) |

## 9. 완료 기준(DoD) — 이 계획서(문서 전용 PR) 기준

- [x] 자산 4종 각각의 "명부가 실제로 쓰이는가"를 code-level로 실측(스칼라/명부 분기 file:line 인용)
- [x] 분양권의 §89①·②·§104①4호를 KoreanLaw MCP 본문으로 확인 — 사용자 지시("비과세 없음")와 일치 확인, §104①4호 삭제일·적용구간도 확인
- [x] 겸용주택이 별도 assetKind가 아니라 `housing` 토글임을 확인 — Q-7의 "별건" 분류가 과잉이었음을 코드로 입증
- [x] 입주권의 "0채 입력 경로 없음" 결함을 독립적으로 발견·기록
- [x] PR 분할안 + Q/V 레지스터 작성
- [x] 실제 코드 변경 — PR-B #1983 · PR-D #1984 · PR-C #1985 (PR-A는 §4-1대로 코드 변경 없음, 이 문서로 갈음)

## 10. 완료 기록 (2026-10-06)

| PR | 머지 | 내용 |
|---|---|---|
| #1982 | 9cd570925 | 이 계획서 |
| #1983 (PR-B) | cb439187a | 재개발APT — 세대 주택 수를 명부에서 도출(F1 = `isOneHouseExemptionAsset`), 「1/2/3+」 제거, 「다른 보유 주택이 없습니다」 확정 + ⑧, §155① 일시적 2주택 자동 도출 포함(Q-12) |
| #1984 (PR-D) | a2999c439 | 세대 보유 분양권·입주권 목록 필수 — 「보유한 분양권·조합원입주권이 없습니다」 확인 + ⑧(주택·재개발APT·입주권 양도, `requiresPresaleRightsConfirmation`), 안내 문구 「취득일과 무관하게 모두 입력」, 입주권 양도의 입주권 수를 「양도 입주권 1 + 목록의 조합원입주권 수」로 도출(`resolveHouseholdRightCount` — 판정 메뉴 `deriveHouseholdRightCount` 재사용, 숫자 칸 제거). §89①4호 본문에 입주권 개수 셈의 취득일 제한 없음(KoreanLaw MCP, MST 280405) |
| #1985 (PR-C) | 088a3417e | 입주권 — 세대 주택 수를 명부에서 도출(오프셋 0: `houseCountSelfOffset`, 집합 `usesHouseCountRoster`), 「1/2/3+」 제거, 확정 시 0채 → §89①4호 가목이 계산기에서 도달. 가목은 분양권·입주권 확인(PR-D)과 함께일 때만 성립함을 양·음 쌍 anchor로 고정(`right-to-move-in-ga-clause-gate.anchor.test.ts`) |

각 머지 후 master에서 `npm run verify:legal` 398/0. #1985는 CI E2E(3/6) A-13(입주권 시드에 확정 누락)이 실패해 리드가 시드를 고친 뒤(cfdeafb1e) 재통과했다 — 레인 보고의 「로컬 통과」와 달리 로컬에서도 재현됐다.

### 남은 별건 (이 프로그램 범위 밖, 착수하지 않음)

1. ~~**판정 메뉴의 「없음」 구별**~~ — **✅ 종결: 현행 유지(사용자 결정 2026-10-06 「입력 안 함과 없음을 구별할 필요가 없어. 사용자가 입력을 안 했으면 없음으로 처리하도록 해」)**. 1세대1주택 판정 화면(`lib/calc/one-house-exemption-validate.ts`)에는 주택 목록·분양권·입주권 목록 모두 「입력 안 함」과 「없음」을 구별하는 확인이 없다. 판정 결과를 계산기로 넘길 때(`lib/calc/one-house-judgment-handoff.ts`) 목록이 비면 `householdNoOtherHousesConfirmed`(PR-1부터)·`householdNoPresaleRightsConfirmed`(PR-D)를 `true`로 넘긴다. ⇒ 판정 메뉴는 미입력을 「없음」으로 보는 지금 동작이 정본이다. 확인 칸을 추가하지 않는다.
2. **입주권의 ①↔④ 불일치 배너** — `lib/calc/house-count-divergence.ts`가 `1 + 행 수`를 고정으로 써서 입주권(오프셋 0)에서는 배너가 뜨지 않는다(오탐은 없음, anchor A5가 현 상태 고정).
3. **API 직접 호출의 분양권 미지정** — `oneRightPresaleGate`(`lib/tax-engine/transfer-tax-redevelopment-transforms.ts:97-109`)는 `presaleRights`가 없으면 `"clear"`. 계산기는 PR-D ⑧이 막지만 API 직접 호출에는 남는다(§4-6).
4. **다건 provisoGate 드리프트** — `lib/calc/multi-transfer-tax-api.ts:166` `isHousing: primaryKind === "housing"`이 단건(OH-20 수정분)과 어긋난다. 다건은 재개발APT를 전면 차단(`validateMultiSupportedMode`)해 지금은 도달하지 않는다(PR-B 레인 발견).
5. ~~**구 §104①4호 단서(무주택 분양권, 2018.1.1~2021.5.31 양도분)**~~ — **✅ 해소(#1988, 2026-10-06)**: 단서는 무주택·영 §167의6 1호(다른 분양권 미보유)·2호(30세 이상 또는 배우자) 세 사실이 모두 확인될 때만 적용, 영 §167의6 내용 존재 구간(2018-02-13~2021-05-31)으로 한정. 계산기는 분양권 양도에 「0채」 버튼 + 해당 구간·조정대상지역에서 1·2호 확인 토글. 같이 발견한 보유 1~2년 과소과세(§104① 후단 「큰 것」 비교 누락 — 40% → 50%)도 수정. 영 §167의6은 현행 「삭제」라 verify:legal 규칙은 삭제 상태 감시로 둔다(과거 본문은 MST 202148·214261 실독).

