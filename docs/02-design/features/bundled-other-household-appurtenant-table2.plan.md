# 함께 양도 × 토지만 본인 · 다른 세대 — 부수토지 카드가 표2 장특을 받는 결함 (계획서)

> 작성 2026-10-28 · 깊이 **L3**(세액이 바뀐다) · 코드 변경 없음(계획서만) · 선행: `bundled-land-only-limit-share.plan.md` §5(#2659 — 「원인 미확인 별건」으로 남긴 것) · `land-only-lthd-rate-basis.plan.md`(#2657) · `land-only-household-merge-date.plan.md`(#2662)
> 사용자 지시 「다른 세대 묶음 부수토지 카드의 표2 장특 버그 수정 계획서 작성해」. 측정 probe 사본은 scratchpad `bt2-probes/`(커밋 안 함).

## 0. 요약

토지만 본인(`selfOwns === "land_only"`)이고 건물(주택) 소유자가 **양도일 현재 다른 세대**이면, 그 토지는 이 세대 1주택에 딸린 토지가 아니라 비과세·장특 표2 대상이 아니다
(V-3′ — `land-only-owner-household.ts`, 서면4팀-311 · 조심 2008중3554). 단건·주 카드는 이를 지키는데(`primary` 장특 = 표1 24%),
**함께 양도에 넣은 부수토지 카드는 표2 60%를 그대로 받는다**(표본: 양도차익 100,000,000에 장특 60,000,000 — 표1이면 24,000,000).

원인은 **술어가 카드 자기 사실만 보는데, 부수토지 카드는 주 카드(또는 짝 주택)의 V-3′ 사실을 받지 못하기 때문**이다(§2). 순방향(주택이 첫 자산)과 역방향(토지가 첫 자산)이 **둘 다** 같은 결함이다.
권고 수정(Q-1 b)은 부수토지 카드가 이미 짝 주택의 판정을 받는 채널(`appurtenantHouseVerdict`, F-13)에 「짝 주택이 표2 대상 자산인가」 한 값을 더 싣고, 표2 자산 축 술어(`isLthdTable2SubjectAsset`)가 그 값으로 거르는 것이다 — 엔진 파일 3곳 · 입력/Zod/API 변경 없음.

초판 판정 정정: #2659 §5와 memory는 「주 카드의 V-3′ 판정이 묶음 부수토지 카드로 전파 안 되는 듯, 원인 미확인」이라 했다. **확정했다** — 전파되지 않는 것이 맞지만 「판정」이 아니라 **술어 입력 사실**이 안 닿는다(§2). 또 순방향만이 아니라 역방향도 같은 결함임을 이번에 확인했다(V-3).

## 1. 실측 (V-n)

표본(독립 정수 산식): 20억 고가 · 주택 2014-01-01 취득 · 2026-02-16 양도 · 수도권 주거지역 3배 · 정착면적 100㎡(한도 300㎡) · 거주 5년 · 주택 카드 자기 토지 200㎡ + 부수토지 카드 200㎡(양도가 4억 · 취득가 2억).
부수토지 카드 면적 비율 ½ → 이내분·초과분 각 양도차익 100,000,000. 보유 12년(2014-01-01 ~ 2026-02-16 = 12년 1개월 → 12년).
표1 = 12 × 2% = **24%**(24,000,000) · 표2 = min(12×4%, 40%) 40% + 거주 5×4% 20% = **60%**(60,000,000). 합산 소득세 = 기본세율(2026 구간 — 3억 초과 40% 누진공제 25,940,000 · 5억 초과 42% 35,940,000) · 지방소득세 10%.

| ID | 항목 | 결과(수정 전) | 상태 |
|---|---|---|---|
| V-1 | **순방향 다른 세대** — `c1__appurtenant` | 양도차익 100,000,000 · **장특 60,000,000(표2)** · 소득 40,000,000 · 비과세 아님 · 합계 **155,166,000**. 주 카드 `primary`는 장특 96,000,000(= 400,000,000 × 24% 표1) · 초과분 `c1__excess` 24,000,000(표1) — 한 묶음 안에서 부수토지 이내분만 표2(`applyLandOnlyHouseholdRule` 호출 `transfer-tax.ts:270`이 주 카드 비과세를 거둔다) | ✅ 결함 재현 |
| V-2 | **원인** — M1b 실험 | 부수토지 카드에 주 카드의 `selfOwns`·`buildingOwnerSameHousehold`를 실어 보니(route 3곳: `bundled-companion-types.ts:125` · `bundled-route.ts:281` · `bundled-split-helpers.ts` 조립부) `c1__appurtenant` 장특 **24,000,000**·소득 76,000,000. 반증: 처음 시도(`ctx.primaryEngineInput.selfOwns` 직접 참조)는 값이 안 바뀌었고 디버그로 그 필드가 **`undefined`**임을 확인했다 — `primaryEngineInput`은 주 자산 사실을 **열거한 부분집합**이라 V-3′ 두 필드가 없다 | ✅ 확정 |
| V-3 | **역방향 다른 세대**(첫 자산 토지 + 함께 양도 주택, 주택이 토지만 본인·다른 세대) — `primary__appurtenant` | **장특 60,000,000(표2)** · 소득 40,000,000 · 합계 **223,575,000**. 짝 주택 `h1`은 장특 144,000,000(= 600,000,000 × 24% 표1)로 정상. M1b(순방향 전용)는 이 경로를 못 고친다 — 역방향은 `splitReversePrimaryLand`(`bundled-reverse-appurtenant.ts:159`)가 별도로 카드를 만든다 | ✅ 결함 재현 |
| V-4 | **안 B 실험**(M2: `appurtenantHouseVerdict.houseTable2Subject` 1값 + 술어 1줄) — 순방향 | `c1__appurtenant` 장특 **24,000,000** · 소득 **76,000,000** · 합계 **171,006,000**. 소유자 같음·같은 세대 합계 **65,637,000 · 32,873,500 그대로**(카드별 값도 불변) | ✅ |
| V-5 | 안 B — 역방향 | `primary__appurtenant` 장특 **24,000,000** · 소득 76,000,000 · 합계 **240,207,000**. 판정 불요(`rev_none` 62,293,000 · `rev_same` 45,573,000 불변) | ✅ |
| V-6 | 한도 이내 한 장(면적 100 + 100 = 200㎡ < 300㎡) · 다른 세대 | `c1` 장특 120,000,000 → **48,000,000**(= 200,000,000 × 24%) · 소득 152,000,000 · 합계 139,326,000 → **171,006,000**. 같은 세대·소유자 같음은 합계 **19,013,500 · 50,589,000 불변** | ✅ |
| V-7 | 부수토지 카드 둘(각 100㎡ · 다른 세대) | c1/c2 장특 79,999,999/80,000,000 → **31,999,999/32,000,000**(= floor(133,333,333 × 24%) · floor(133,333,334 × 24%)) · 합계 151,059,333 → **193,391,000**. 같은 세대 합계 23,120,166 불변 | ✅ |
| V-8 | 합계 **독립 산식 대조**(§6 anchor 값의 근거) | 순방향: (304,000,000 + 76,000,000 + 76,000,000 − 2,500,000) = 453,500,000 × 40% − 25,940,000 = 155,460,000 → ×1.1 = **171,006,000** ✓(수정 전 (304+40+76−2.5)M → 141,060,000 → 155,166,000 ✓). 역방향: 605,500,000 × 42% − 35,940,000 = 218,370,000 → ×1.1 = **240,207,000** ✓(수정 전 569,500,000 → 203,250,000 → 223,575,000 ✓). 2카드: 504,166,668 × 42% = 211,750,000(절사) − 35,940,000 = 175,810,000 → ×1.1 = 193,391,000 ✓ | ✅ |
| V-9 | **안전망 — 수정 후**(M2를 넣은 채) `__tests__/api` · `__tests__/calc` · `__tests__/tax-engine/transfer` **23,967건 전부 통과 — 안전망 0건**(현행 결함을 지키는 테스트도, 올바른 동작을 지키는 테스트도 없다) | 신규 anchor 필수 | ✅ |
| V-10 | **안전망 — 유지 대상**: 부수토지 카드의 표2를 통째로 끄는 mutation(`isLthdTable2SubjectAsset`의 `appurtenant_land` → `false`) | **24건 실패**(10파일: `appurtenant-land-lthd-table1-floor` 5 · `lthd-table2-subject-asset-s08-6-s08-5` 5 · `manual-land-rate-override-order-symmetry` 4 · `dec17-2b-high-value-excess-915-paths` 3 · `expropriation-later-land-f13-5a` 2 · 그 밖 5파일 1씩) — 같은 세대·소유자 같음의 부수토지 표2는 지켜진다. **다른 세대만 무방비** | ✅ |
| V-11 | `isLthdTable2SubjectAsset` 호출처 6곳(`transfer-tax-lthd.ts:242·387` · `transfer-tax-lthd-982-step.ts:59·81·114` · `one-house/gift-table2-notice.ts:50`)이 verdict를 가진 입력을 넘기는가 | 장특 본계산 2곳(`lthd.ts:242·387`)은 M2에서 값이 실제로 바뀌어 확인. 입력은 `exemptionJudgeInput = {...rentalPremise.input, …}`(`transfer-tax.ts:252`)로 `effectiveInput` 스프레드라 verdict가 실린다(코드 읽기). **982-step·증여 고지 3곳은 M2 시나리오로 실행되지 않았다** — 같은 변수라 같을 것이나 **구현 시 확인 필요**(설계 영향 없음) | ⏳ 설계 무영향 |
| V-12 | `appurtenantHouseVerdict`가 엔진 밖(lib/api · lib/calc · components · Zod)에 닿는가 | `lib/tax-engine/**` 11개 파일에서만 쓰인다(grep) — 엔진 내부 주입값(합산 엔진이 주택 카드를 먼저 계산해 싣는다 `transfer-tax-aggregate-asset-records.ts:271·285`). 14지점 해당 없음 | ✅ |

⚠️ 독립 산식 한계: 같은 세대·소유자 같음 `c1__appurtenant` 장특 16,800,000 · 소득 11,200,000(= 고가주택 915 방식 안분 28,000,000 기준)은 F-13 단위 규칙이 만드는 값이라 독립 재도출하지 못했다.
그 칸은 값을 단언하지 않고 **수정 전과 같다(불변)**를 anchor로 고정한다(소유자 같음과의 일치 · 수정 전 측정값).

## 2. 원인 (확정 — 코드 인용)

1. 표2 자산 축 술어 `isLthdTable2SubjectAsset`(`lthd-table2-subject.ts:24`)은 **V-3′를 카드 자기 입력**으로 본다(`:28` `landOnlyBuildingOwnerOtherHousehold(input)` — `selfOwns === "land_only"` ∧ `buildingOwnerSameHousehold === false`).
   주 카드는 둘 다 가지고 있어 false가 되지만, 부수토지 카드(`propertyType: "land"` · `oneHouseUnitRole: "appurtenant_land"`)는 `selfOwns`·`buildingOwnerSameHousehold`가 **없어** 이 줄을 통과하고,
   `case "land"`(`:32`)가 `oneHouseUnitRole === "appurtenant_land"`만 보고 true를 돌려준다.
2. 부수토지 카드의 입력 조립(`buildCompanionEngineInputs`)이 받는 `primaryEngineInput`(`bundled-companion-types.ts:125`)은 주 자산 사실의 **열거형 부분집합**(세대 주택 수·조정지역·분양권 등)이고
   `selfOwns`·`buildingOwnerSameHousehold`는 들어 있지 않다(조립은 `bundled-route.ts:281`). 컴패니언이 자기 `selfOwns`를 갖는 경로(`bundled-split-helpers.ts:223`의 `c.selfOwns`)는 **컴패니언 주택** 전용 질문이고, 부수토지(land) 카드에는 그 질문이 없다.
3. 비과세는 이미 맞다 — `checkExemption`의 부수토지 분기(`transfer-tax-exemption.ts:327`)가 짝 주택 판정(`appurtenantHouseVerdict`)을 따르는데 주 카드는 V-3′로 비과세가 거둬져(`applyLandOnlyHouseholdRule`) `isExempt/isPartialExempt` 둘 다 false라 부수토지도 비과세가 아니다(V-1 `ex False False`). **표2 축만** 같은 판정을 따르지 않는다.
4. (코드 읽기 — 측정은 V-2·V-4가 결과로 뒷받침) 표2의 **1주택 축**(`lthdTable2OneHouseAxis`, `transfer-tax.ts:757` → `toHouseVerdict`의 `oneHouseForTable2`, `transfer-tax-one-house-unit.ts:130`)도 주 카드가 `isOneHousehold ∧ householdHousingCount === 1`이라 true다 — 자산 축(주 카드는 false)을 곱하지 않은 값이다. 비과세가 거둬진 verdict는 `checkExemption`이 일찍 반환해 이 값이 부수토지에 닿지 않지만, 부수토지 카드의 L-3 게이트는 자기 사본(주 자산 세대 주택 수 복제본 = 1)으로 1주택 축을 true로 만든다.
5. 역방향(`splitReversePrimaryLand` `bundled-reverse-appurtenant.ts:159`)은 첫 자산 토지에서 `{...primaryItem, residencePeriodMonths, primaryContextForCompanionRate}`를 만들 뿐 짝 주택의 `selfOwns`·`buildingOwnerSameHousehold`를 싣지 않는다 — 같은 구조의 별도 경로(V-3).

## 3. 설계안 (Q-1)

| | 안 A — 사실 전파 | **안 B — verdict에 표2 자산 축 한 값** (권고) |
|---|---|---|
| 방식 | 부수토지 카드에 주 카드(역방향은 짝 주택)의 `selfOwns`·`buildingOwnerSameHousehold`를 실어 술어가 그대로 거르게 한다 | `appurtenantHouseVerdict`에 `houseTable2Subject?: boolean`(= 짝 주택의 `isLthdTable2SubjectAsset`)을 싣고 부수토지 분기가 `!== false`일 때만 true |
| 닿는 곳 | `bundled-companion-types.ts` · `bundled-route.ts`(+ 겸용 `mixed-use-part-cards.ts:418`·`bundled-route.ts:243` 조립처 동기) · `bundled-split-helpers.ts` · `bundled-reverse-appurtenant.ts` (4~5곳) | `types/transfer.types.ts`(verdict 타입 `:1696`) · `transfer-tax-one-house-unit.ts`(`toHouseVerdict` `:121`) · `lthd-table2-subject.ts`(`:24·:32`) — **3곳** |
| 순·역방향 | 경로가 둘이라 각각 고쳐야 한다(M1b는 순방향만 고쳤다 — V-3) | 합산 엔진이 주택 카드를 먼저 계산해 verdict를 싣는 **공통 지점**이라 한 번에 덮는다(V-4·V-5) |
| 부작용 | **land 카드가 `selfOwns: "land_only"`를 갖게 된다** — `applyLandOnlyHouseholdRule` 고지 중복 · 다주택 중과 술어(`transfer-tax-surcharge-predicate.ts:163`) · STEP 7 등 land 카드에 처음 닿는 분기가 생긴다(범위 확인 필요 — 같은 세대면 합가 고지가 카드마다 반복) | 없음 — 표2 자산 축 술어 하나만 바뀐다. 같은 술어를 쓰는 L-1b·L-3·§98의2 특칙·표시·증여 고지가 함께 일관된다 |
| 근거 정합 | 「각 카드가 자기 사실로 판정」 | F-13 원칙 「부수토지는 짝 주택의 판정을 따른다」(`transfer-tax-exemption.ts:320` 주석 · 비과세·1주택 축이 이미 이 채널) — 같은 설계를 자산 축에 완성 |
| 약점 | 사실이 늘 때마다 전파 목록을 맞춰야 한다(14지점류 침묵 누락) | `houseTable2Subject`가 `undefined`(verdict가 짝 주택 이전 형태·직접 호출)면 종전(true) 유지 — 아래 정책 |

**미주입 정책**: `houseTable2Subject === undefined` → **종전과 같이 true**(부수토지 카드는 표2 대상). 「모름 = 혜택 불성립」과 충돌해 보이나, 이 필드는 verdict를 합산 엔진이 항상 싣는 경로에서만 `undefined`가 아니고(`toHouseVerdict`가 매번 계산),
`undefined`는 verdict 없는 직접 엔진 호출(단위 anchor)뿐이다 — 그 호출은 `oneHouseForTable2`도 `undefined`로 종전 거동을 전제한 기존 anchor 24건(V-10)이 지키고 있어 뒤집지 않는다. 구현 mutation P3가 이 선택을 고정한다.

## 4. 결정 게이트 (Q-n)

- **Q-1 설계안** — 권고 **b (안 B)**. 근거: 순·역방향을 한 번에 덮고(V-4·V-5) land 카드에 `selfOwns`를 새로 얹지 않으며(안 A의 부작용 3종 회피) F-13의 기존 채널을 완성한다. a를 택하면 위 5곳 + 부작용 3종 확인이 작업에 추가된다.
- **Q-2 고지** — 권고 **a (부수토지 카드에 한 줄 고지)**. 지금은 `[주 자산(주택)] …이 토지에는 비과세와 표2를 적용하지 않았습니다` 한 줄만 있어(합산 경고 접두 라벨이 주 자산) 부수토지 카드가 왜 표1인지 카드에서 안 보인다.
  조건: 부수토지 카드 · `houseTable2Subject === false` · **표2가 원래 걸렸을 조합에만**(1주택 축 true ∧ 거주요건 충족 — `LAND_ONLY_OTHER_HOUSEHOLD_SURCHARGE_NOTICE`가 「중과가 원래 걸렸을 조합에만」인 것과 같은 반사실 규칙). 값은 안 바꾸는 고지다. b면 주 카드 고지만 둔다.
  ⚠️ `transfer-tax.ts`가 764줄이라 이 고지를 거기에 한 줄 더하면 ≈766줄 — 800 미만이라 분리 트리거는 아니나 ≥750 구간이다(기회주의적 분리 규정). 알림 문구·조건은 `land-only-owner-household.ts`(132줄)에 두고 `transfer-tax.ts`에는 호출 1줄만 둔다.
- **Q-3 합가일(O-3) 포함 여부** — 권고 **a (별도 계획)**. 합가일 입력(#2662)이 부수토지 카드의 비과세 보유요건·장특 표2 보유연수에 닿지 않는 현상(§7 O-3)은 **비과세 판정을 바꿔** 세액 영향이 크고, 같은 verdict 채널을 쓰지만 축이 달라 독립 V-n·계획이 필요하다. b(이 PR에 포함)를 택하면 verdict에 합가일 한 값이 더 들어가고 anchor·mutation이 늘어난다.

## 5. 케이스 매트릭스

| 방향 | 소유 구성 | 짝 주택 1주택 축 | 부수토지 카드 표2 | 근거 |
|---|---|---|---|---|
| 순 | 소유자 같음(`both`/미지정) | 1주택 | 표2(**불변**) | §95② 단서 — 1세대1주택(이에 딸린 토지 포함) |
| 순 | 토지만 본인 · **같은 세대**(처음부터/합가) | 1주택 | 표2(**불변**) | 재산46014-610 — 같은 세대면 1주택에 딸린 토지 |
| 순 | 토지만 본인 · **다른 세대** | (1주택이어도) | **표1**(수정) | V-3′ · 서면4팀-311 · 조심 2008중3554 |
| 순 | 건물만 본인 | — | 해당 없음(주택 카드 토지가 본인 것이 아님 — 부수토지 카드만 있는 구성) | #2659 V-4 |
| 역 | 짝 주택 소유자 같음 / 같은 세대 | 1주택 | 표2(**불변** — 합계 62,293,000 · 45,573,000) | 위와 같음 |
| 역 | 짝 주택 토지만 본인 · **다른 세대** | (1주택이어도) | **표1**(수정) | 위와 같음 |
| 순·역 | 다른 세대 · **2주택**(1주택 축 false) | 2주택 | 표1(**불변** — 이미 표1) | 1주택 축 false |
| 순·역 | 다른 세대 · 부수토지 **초과분 카드** | — | 표1(**불변** — `appurtenant_excess` 역할이 표2 자산이 아님) | V-1 `c1__excess` 24,000,000 |
| 순 | 다른 세대 · 한도 이내 **한 장** / **두 장** | 1주택 | 표1(수정 — V-6·V-7) | 위와 같음 |

## 6. 구현 계획과 테스트 (Do — Q 결정 뒤)

### 6.1 수정 (Q-1 b)

| 위치 | 변경 |
|---|---|
| `lib/tax-engine/types/transfer.types.ts:1696` verdict 타입 | `houseTable2Subject?: boolean` 추가(짝 주택이 표2 대상 **자산**인가 — 부수토지 카드가 따른다). 타입 전용 파일 예외라 1877줄 분리 대상 아님(로직 없음 · 별도 판단) |
| `transfer-tax-one-house-unit.ts:121` `toHouseVerdict` | `houseTable2Subject: isLthdTable2SubjectAsset(house)` — **술어를 재사용**(사본 금지). 223줄 |
| `lthd-table2-subject.ts:24·32` | `Pick`에 `"appurtenantHouseVerdict"` 추가 · `case "land"`: `oneHouseUnitRole === "appurtenant_land" && input.appurtenantHouseVerdict?.houseTable2Subject !== false`. 51줄 |
| (Q-2 a) `land-only-owner-household.ts` + `transfer-tax.ts` 호출 1줄 | 반사실 고지 |

입력·Zod·API·폼 필드 없음 → 14지점 ①~⑭ 해당 없음(V-12). 신규 법령 조문 인용 없음 → manifest 등록 불요(고지 문구는 기존 §154①·조심 2008중3554·서면4팀-311 인용 재사용 — Q-2 a일 때 법령 상수는 기존 `TRANSFER.*` 재사용 확인).

### 6.2 anchor (신규 — 값은 독립 산식, §1 V-8)

| ID | 단위 | 단언 |
|---|---|---|
| AN-1 | 술어 leaf(`lthd-table2-subject-asset-s08-6-s08-5.anchor.test.ts` 증설) | `appurtenant_land` + `houseTable2Subject: false` → false · `true` → true · `undefined`(미주입) → true · 비 `land`·`appurtenant_excess`는 verdict와 무관 |
| AN-2 | `toHouseVerdict` | 토지만 본인·다른 세대 주택 카드 → `houseTable2Subject === false` · 같은 세대·소유자 같음·미지정 → `true` |
| AN-3 | route 순방향(신규 `transfer.route.bundled-other-household-appurtenant-table2.anchor.test.ts`) | 다른 세대: `c1__appurtenant` 장특 **24,000,000** · 소득 **76,000,000** · 합계 **171,006,000**(수정 전 60,000,000 · 40,000,000 · 155,166,000) / 같은 세대 합계 **32,873,500** · 소유자 같음 **65,637,000** 불변 |
| AN-4 | 한도 이내 한 장 · 두 장 | 한 장: `c1` 장특 **48,000,000** · 합계 **171,006,000**(수정 전 120,000,000 · 139,326,000) / 두 장: **31,999,999 · 32,000,000** · 합계 **193,391,000**(수정 전 151,059,333) / 같은 세대 합계 19,013,500 · 23,120,166 불변 |
| AN-5 | route 역방향 | 다른 세대: `primary__appurtenant` 장특 **24,000,000** · 소득 76,000,000 · 합계 **240,207,000**(수정 전 60,000,000 · 223,575,000) / `h1` 장특 144,000,000 불변 / 판정 없음·같은 세대 합계 **62,293,000 · 45,573,000** 불변 |
| AN-6 | 부정 짝 | 다른 세대 · **2주택**: 부수토지 카드는 수정 전후 같은 표1(S 시나리오 `c1` 장특 48,000,000 · 소득 152,000,000) — 수정이 표2 아닌 곳을 건드리지 않는다 |
| AN-7 | (Q-2 a) 고지 | 다른 세대 · 표2가 걸렸을 조합: 부수토지 카드 경고에 문구 포함 · 같은 세대·2주택·초과분 카드: 없음 |
| AN-8 | V-11 잔여 | `transfer-tax-lthd-982-step.ts` 경로·증여 고지 호출이 verdict를 가진 입력으로 불리는지 직접 고정 — 안 되면 해당 호출부 수정이 계획에 추가된다(⏳ → 구현 첫 단계에서 확정) |

### 6.3 착수 전 mutation (실측 완료 — V-9·V-10)와 구현 후 mutation (계획)

| P | 무력화 | 실패해야 할 anchor |
|---|---|---|
| P1 | `toHouseVerdict`의 `houseTable2Subject` 줄 제거 | AN-2 · AN-3 · AN-4 · AN-5 |
| P2 | 술어의 `!== false` 조건 제거(verdict 무시) | AN-1 · AN-3 · AN-4 · AN-5 |
| P3 | `!== false` → `=== true`(미주입을 불성립으로) | AN-1(미주입 케이스) + **기존 V-10 안전망 일부** — 미주입 정책(§3)이 기존 계약임을 확인 |
| P4 | `houseTable2Subject`를 **항상 false**(모든 부수토지 표1) | 같은 세대·소유자 같음 불변 anchor(AN-3 same/both · AN-4 · AN-5) + 기존 24건 |
| P5 | `isLthdTable2SubjectAsset(house)`를 `isLthdTable2SubjectAsset(card)`로 오기(카드 자신 — 사본 오류) | AN-3 ~ AN-5 (다른 세대 값이 수정 전으로 복귀) |
| P6 | (Q-2 a) 고지 조건에서 「표2가 걸렸을 조합」 제거 | AN-7 (2주택 · 초과분 카드에도 고지됨) |

각 P는 **해당 anchor만** 실패해야 한다(엉뚱한 파일이 무더기로 실패하면 단언이 과녁을 벗어난 것). 구현 전 신규 anchor는 **수정 전 코드에서 먼저 실패**(AN-3~5 · 7)하고 수정 뒤 통과해야 한다(재현 확인).

### 6.4 검증

- `npx vitest run __tests__/api __tests__/calc __tests__/tax-engine/transfer` 전량(수정 후 현재 23,967건 통과 기준) + 변경 경로가 `lib/tax-engine/**`라 pre-push 전체 · `npx tsc --noEmit` 0 · lint 신규 0.
- 브라우저 수동 확인은 하지 않는다 — 화면 변경 없음(결과 카드의 장특 산식 문구는 엔진 값을 그대로 표시). 미수행을 완료 보고에 명시한다.

## 7. 범위 밖 · 발견 (O-n — 이 계획에서 고치지 않는다)

| ID | 발견 | 실측 | 상태 |
|---|---|---|---|
| O-1 | **다른 세대 부수토지 카드의 단기세율** — 주 카드는 #2657에서 일반 토지 세율(서면법규과-944)로 판정하는데 같은 묶음의 부수토지 카드는 짝 주택 일체과세 누진세율 | R 시나리오(토지 2025-06-01 취득 · 8개월 보유 · 다른 세대): `primary` 단기 **50%**(일반 토지) vs `c1` 누진 **38%**(`shortTermNote: 부수토지 일체과세`). **소유자 같음·같은 세대에서도 같은 일체과세**(그 경우는 의도 — §104①2호 괄호) | 별건 후보(법 근거는 서면법규과-944 한 건 · 현행 표 이전은 추론 — #2657과 같은 한계) |
| O-2 | **부수토지 카드의 다주택 중과** — 주 카드가 중과(`multi_house_surcharge` 62%/60%)인 2주택·조정 시나리오에서도 부수토지 카드는 중과 없이 누진 38% | S 시나리오(2026-06-15 양도) — 소유자 같음·같은 세대·다른 세대 모두 같다. 법 해석상 의도인지 결함인지 **확인하지 않았다**(§104⑦ 괄호의 주택 정의 확장) | 미확인 — 별도 측정 필요 |
| O-3 | **합가일 입력(#2662)이 부수토지 카드에 닿지 않는다** — verdict에 합가일이 없어 `checkExemption` 부수토지 분기(`transfer-tax-exemption.ts:327`)와 표2 보유연수가 카드 자기 취득일·짝 주택 취득일만 본다 | 같은 세대 · 합가 2020-01-01: `primary` 장특 67,200,000 → **49,280,000**(반영) · `c1__appurtenant` **16,800,000 그대로**. 합가 2025-01-01(보유 2년 미만): `primary` 소득 **304,000,000**(토지분 과세) · `c1__appurtenant` 소득 **0**(비과세 취급 — 짝 주택 verdict의 부분 비과세를 따르고 G-3는 카드 자기 취득일(2014)로만 본다) | 원인은 코드 읽기(미확인). Q-3 a로 별도 계획 권고 |
| O-4 | 소유자 같음에서도 부수토지 카드가 자기 취득일보다 **후행인 경우**(토지가 주택보다 늦음) 표2 보유연수에 짝 주택 12년을 쓴다 — R 시나리오 `R_both` `c1` 장특 **120,000,000(60%)**(토지 8개월 보유). 주 카드 쪽은 #2657이 `max(토지, 주택)`로 고쳤다 | 소유자 같음·같은 세대·다른 세대 **모두 같다**(O-3의 합가일 문제와 같은 뿌리일 수 있음 — 미확인). 이 계획으로 다른 세대는 표1(보유 8개월 → 0)로 바뀐다(`R_other` `c1` 장특 0 · 합계 233,409,000 → 280,291,000) — 세율이 O-1대로 그대로라 이 합계는 anchor로 고정하지 않는다(장특 0만) | 별건 후보 |
| O-5 | 소유자 같음·같은 세대 부수토지 `c1__appurtenant` 값(16,800,000 등) 독립 재도출 불가 | §1 ⚠️ | 한계 명시 |

## 8. 작업 순서 (Q 결정 뒤)

1. 워크트리 → anchor AN-1~6(·7)을 **수정 전 코드에서 먼저 실행해 실패 확인**(재현).
2. 안 B 3곳 수정 → anchor 통과 · V-11/AN-8 확인 · 필요 시 호출부 보강.
3. 구현 후 mutation P1~P5(·6) → 정확히 해당 anchor만 실패 확인.
4. `__tests__/api` · `__tests__/calc` · `__tests__/tax-engine/transfer` 전량 · tsc · lint.
5. 본 계획서 §9에 구현 결과 기록 → PR(사용자 「머지해」 뒤 머지).

## 9. 구현 결과

(구현 후 기록)
