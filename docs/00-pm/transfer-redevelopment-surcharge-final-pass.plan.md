# 재개발·입주권 최종 패스 — 재개발 신축주택 다주택 중과 축 복구

> 2026-08-25 착수. 베이스 `e10ab20c`(master). 워크트리 `redevelopment-final-pass`.
> 이월 출처: memory `project_right_to_move_in_asset_kind_axis.md` 「최종 패스 대기」 2건
> (`transfer-tax-redevelopment.ts:210` `calcTax` 4번째 인자 누락 ·
> `transfer-tax.ts:196`에서 판정하고 `:228`에서 폐기).

---

## §0. P-0 실측 — 이월 서술은 재현되지만, **더 크다**

### 0.1 이월 2건은 하나의 결함이다 (줄번호만 이동)

| 이월 서술 | 현재 위치 | 재현 |
|---|---|---|
| `transfer-tax-redevelopment.ts:210` `calcTax` 4번째 인자 누락 | **:210 그대로** — `calcTax(taxBase, parsedRates, input)` | ✅ |
| `transfer-tax.ts:196` 판정 → `:228` 폐기 | **:219 판정** (`runMultiHouseSurchargeStep`) → **:298 폐기** | ✅ |

`:298`은 `return calculateRedevelopmentTax(redevInput, parsedRates, steps)`다.
**형제 경로 둘은 그 값을 넘긴다** — `buildExemptEarlyResult({… multiHouseSurchargeResult …})`(`:343`) ·
`handleMultiParcelBranch({… multiHouseSurchargeResult …})`(`:353`). 재개발 분기만 빠졌다.

### 0.2 세액 영향 (엔진 직접 호출 · `houses[]` 주입 · mock 세율)

픽스처: 재개발APT(사례 44) · 3주택 · 조정지역 · 양도 **2026-06-01**(유예 종료 후) ·
취득 2005-04-09 · 양도 525,000,000 · 환산 모드.

| | 세율 | 산출세액 |
|---|---|---|
| 종전 | 0.38 | 55,836,614 |
| 4번째 인자 전달 후 | **0.68** | **115,660,256** |

**Δ 59,823,642원 과소.** 같은 조건의 일반 `housing`은 0.7 · 199,810,000.

**유예 중이 아니다** — `SURCHARGE_SUSPENSION_TRANSFER_DATE_WINDOW.end = "2026-05-09"`
(`legal-codes/transfer.ts:399`)로 이미 종료됐다. **현재 발화 중인 결함**이다.

### 0.3 🔴 그러나 **이월 2건만 고치면 no-op이다** — 누락 지점이 **6개**다

> **초판 정정(STEP 1 자가검토)**: 초판은 층을 **셋**(A·B·C)으로 셌다. **불완전했다** —
> `propertyType` 열거 전수 grep에서 **6개**가 나왔고, 그중 둘(`transfer-tax.ts:470` ·
> `multi-transfer-tax-api.ts:22`)이 빠져 있었다. ⇒ 아래 표로 교체한다.
> (memory `feedback_enumerate_all_write_sites_before_fixing` — 첫 히트에서 멈추면
> 「고쳤는데 그대로」가 된다.)

| # | 층 | 파일:line | 상태 |
|---|---|---|---|
| **A1** | ④ 단건 | `lib/calc/transfer-tax-api-helpers.ts:135` | `redevelopment_apt` **없음** → `buildHousesPayload` `undefined` → **houses[] 미전송** |
| **A2** | ④ 다건 | `lib/calc/multi-transfer-tax-api.ts:22` | **같은 술어의 복제본** — 다건 경로도 동일 누락 |
| **B1** | 엔진 fallback (세액·LTHD 공통) | `lib/tax-engine/transfer-tax.ts:470` | `isSurchargeCase` 열거에 **없음** — 이 값이 `calcLongTermHoldingDeduction`의 `isSurcharge`로 들어간다 |
| **B2** | 엔진 fallback (세율) | `lib/tax-engine/transfer-tax-rate-calc.ts:310` | `isSurchargeCase` 열거에 **없음** |
| **C1** | 재개발 분기 진입 | `lib/tax-engine/transfer-tax.ts:298` | 정밀 판정을 **안 넘김** |
| **C2** | 재개발 finalize | `lib/tax-engine/transfer-tax-redevelopment.ts:56·210` | 파라미터 부재 + `calcTax` 4번째 인자 누락 |

**⑤ UI는 제외 대상이 아니다** — `app/calc/transfer-tax/steps/Step4.tsx:37`의 세 번째 복제본은
**`redevelopment_apt`를 이미 포함**한다(§0.4).

④ 실측(`buildHousesPayload` 직접 호출):

```
housing           → houses 3건 전송
right_to_move_in  → houses 3건 전송
presale_right     → houses 3건 전송
redevelopment_apt → undefined (미전송)
```

⇒ §0.2의 59,823,642원은 **엔진에 `houses[]`를 손으로 넣었기에** 관측됐다.
UI 경로에서는 A1·A2가 막아 정밀 판정 자체가 돌지 않는다.
memory `feedback_api_trigger_without_input_path_is_noop`의 구조 그대로다.

**B는 A와 독립적으로 필요하다** — `houses[]`를 안 채운 사용자(단순 입력)는 fallback을 타므로,
A만 고치면 그 사용자에게는 여전히 중과가 0이다.

### 0.4 🔴 `isHousingLike`가 **3벌 복제**돼 있고 정의가 갈린다 (dual-truth)

| 파일:line | `redevelopment_apt` | 용도 |
|---|---|---|
| `lib/calc/transfer-tax-api-helpers.ts:135` | ❌ **제외** | ④ 단건 — `buildHousesPayload` 게이트 · `transfer-tax-api.ts:87` 분양권 목록 전송 게이트 |
| `lib/calc/multi-transfer-tax-api.ts:22` | ❌ **제외** | ④ 다건 |
| `app/calc/transfer-tax/steps/Step4.tsx:37` | ✅ **포함** | ⑤ `HousesListSection` 렌더 게이트(`:642`) · 조정대상지역 자동조회(`:204`·`:357`) |

🔑 **같은 이름의 술어가 2:1로 갈린다.** memory `feedback_shared_predicate_argument_parity`
(술어 공유 ≠ 단일 소스)의 전형이다. 세 벌을 **한 소스로 합칠지**는 Q-3(§2)에서 결정한다.

### 0.5 같은 파일이 스스로 모순이다

`transfer-tax-rate-calc.ts` 한 파일 안에서:

- `:310` — 중과 fallback 목록: `housing | right_to_move_in | presale_right` (**`redevelopment_apt` 없음**)
- `:434` — 단기세율 `isHousingLikeProp`: 위 셋 **+ `redevelopment_apt`**, 주석 「신축APT는 **주택** — §104①2/3호 60%/70%」

두 축이 같은 자산을 다르게 본다. **의도된 배제라는 주석·테스트는 0건**(grep 실측).

---

## §1. 법령 확정 — 조사 완료 (KoreanLaw 원문)

### 1.1 재개발 신축주택은 §104⑦ 중과 **대상이다** (명문)

**소득세법 §104⑦**(MST 280405, 시행 2026-07-01)은 대상을 「다음 각 호의 어느 하나에 해당하는
**주택**(이에 딸린 토지를 포함한다)을 양도하는 경우」로 정하고 **취득 경위를 묻지 않는다**.
3호 = 「조정대상지역에 있는 주택으로서 대통령령으로 정하는 **1세대 3주택 이상**에 해당하는 주택」.

위임된 요건 조항 **양쪽 모두**가 재개발 신축주택을 **판정 대상으로 전제**한다
(소득세법 시행령 MST 286211 · 문언 동일):

> **§167의3①12의2 · §167의10①12의2** — 「법 제95조제4항에 따른 보유기간이 2년(**재개발사업,
> 재건축사업 또는 소규모재건축사업등을 시행하는 정비사업조합의 조합원이 해당 조합에 기존건물과
> 그 부수토지를 제공하고 관리처분계획등에 따라 취득한 신축주택 및 그 부수토지를 양도하는 경우의
> 보유기간은 기존건물과 그 부수토지의 취득일부터 기산한다**) 이상인 주택으로서 …」

🔑 **배제 대상이라면 그 기산 규칙을 쓸 이유가 없다.** 배제 사유를 열거한 §167의3① 1~13호에
「재개발로 취득한 주택」은 **없다**.

⇒ **B(fallback 목록)의 `redevelopment_apt` 누락은 근거 없는 배제다.** `:434` 쪽이 맞다.

### 1.2 장기보유특별공제도 **배제된다** (명문)

**소득세법 §95②**:

> 「"장기보유 특별공제액"이란 제94조제1항제1호에 따른 자산(제104조제3항에 따른 미등기양도자산과
> **같은 조 제7항 각 호에 따른 자산은 제외한다**)으로서 …」

재개발 신축주택(완공 APT)은 §94①1호 자산(건물)이므로 이 괄호가 그대로 걸린다.

**실측**: 4번째 인자만 전달한 상태에서 재개발APT는 세율 0.68을 받으면서
**LTHD 86,533,774를 유지**했다(`lthdExclusionReason: undefined`).
같은 조건 `housing`은 **LTHD 0** · `lthdExclusionReason: multi_house_surcharge`.

원인: 일반 경로의 배제는 `transfer-tax-lthd.ts:89` **L-1**
(`if (isSurcharge && !isSuspended) return { deduction: 0, …, exclusionReason: "multi_house_surcharge" }`)
인데, **재개발 경로는 이 함수를 타지 않는다** — LTHD를 `runRedevelopment`가 분기별로 산정해
`redevAfterRight.total.lthd`로 넘긴다(`transfer-tax-redevelopment.ts:271`).
⇒ 배제가 **자동으로 따라오지 않는다.**

### 1.3 유예 판정의 보유기간 기산 (파생 지점)

12의2 괄호는 **유예 창의 2년 요건 기산도 정한다** — 재개발 신축주택은 「**기존건물과 그 부수토지의
취득일부터**」다(준공일이 아니다). 현재는 그 경로 자체가 돌지 않아 **검증된 바 없다**.

또한 12의2 **나목·다목**은 토지거래허가 대상 등에 대해 2026-05-09 이후에도 조건부 배제를 둔다
(매매계약 체결일부터 4개월/6개월 · 2026-05-10 이후 계약은 2026-09-09 / 11-09까지).
`legal-codes/transfer.ts:396` 주석은 「상한(2026-05-09)은 **가목**」이라고 인지하고 있으나
**나·다목 경로의 구현 여부는 미확인**이다.

---

## §2. 결정 게이트 Q-n · 미검증 근거

> **초판 정정(STEP 3 blast-radius)**: 초판은 확인 필요 항목을 전부 `Q-n`으로 적었다.
> **분류가 틀렸다** — `Q-n`은 **해석이 갈려 사용자 결정이 필요한 것**이고,
> 「사실이 아직 확인 안 된 것」은 `V-n`(§3.5)이다. 초판의 Q-1·Q-2는 후자라
> **V-1·V-6으로 이관**했다. 아래 두 절은 그 V 항목의 **조사 근거**로 남긴다.
> 실제 사용자 결정은 **Q-3 하나뿐**이다.

### V-1 근거 — **일반 경로로 내려온 입주권**에 30%p가 붙는다

> **초판 정정(STEP 1)**: 초판은 「입주권 0.72가 과대과세인지 artifact인지 모른다」였다.
> **절반은 artifact로 확정됐다** — `redevelopment-dispatch.ts:121-127` 실측:
> ```ts
> if (redevelopment == null) return false;
> if (propertyType === "redevelopment_apt") return redevelopment.subject === "apt";
> if (propertyType === "right_to_move_in") {
>   if (isSuccessorRightToMoveIn === true) return false;
>   return redevelopment.subject === "right";
> }
> ```
> 제 픽스처는 `right_to_move_in` + `case44RedevelopmentInfo()`(`subject === "apt"`)라
> `isRedevelopmentActive`가 **false** → **일반 경로**로 갔다. 원조합원 입주권 픽스처가 아니었다.

**그러나 결함 후보는 남는다.** 일반 경로로 내려오는 입주권이 **둘** 있다:

| 조합 | 경로 | 현행 |
|---|---|---|
| 원조합원 입주권(`subject === "right"`) | 재개발 분기 | 중과 **안 붙음** (판정을 버리므로) — 법령과 우연히 일치 |
| **승계조합원 입주권**(`isSuccessorRightToMoveIn === true`) | **일반 경로** | fallback·정밀판정 둘 다 `right_to_move_in`을 **포함** → 중과 **붙음** |

§104⑦은 「**주택**(이에 딸린 토지를 포함한다)을 양도하는 경우」이고 조합원입주권은
§94①2호가목의 **권리**다 ⇒ 붙으면 **과대과세**다.

⚠️ 기존 anchor `successor-right-to-move-in.test.ts:164`(V-1)은 이 조합을 **보지 않는다** —
`houses[]` 없이 `isOneHousehold: true`라 다른 분기를 탄다.

⇒ **V-1**로 관리한다. Phase 0에서 **승계조합원 + `houses[]` + `isOneHousehold: false`**로 판별한다.
실재하면 **별건**으로 뺀다 — 이 배치는 과소과세 축이라 방향이 반대이고,
`right_to_move_in`을 fallback 목록에서 빼는 변경은 회귀 표면이 다르다.

### Q-3. `isHousingLike` 3벌을 한 소스로 합칠 것인가 — ✅ **(b) 통합** (2026-08-25 사용자 승인)

§0.4의 dual-truth를 어떻게 끝낼지.

> 🔴 **초판 정정**: 초판은 「(b)는 회귀 표면이 **넓다**」고 적었다. **틀렸다** —
> 어차피 ①②에 `redevelopment_apt`를 넣는 것이 이번 작업이므로 셋이 모두 4종이 되고,
> ③이 쓰이는 곳(`Step4.tsx:204·357` 조정지역 자동조회)은 **이미 4종이라 동작이 안 바뀐다**.
> ⇒ **(a)와 (b)는 실행 결과가 동일**하고, 차이는 **코드 구조뿐**이다.

| 선택 | 고칠 곳 | 실행 결과 | 재발 위험 |
|---|---|---|---|
| (a) 3벌 각각에 추가 | 2줄 | 동일 | 🔴 다음 자산 종류에서 **또 3곳**을 찾아야 한다. 하나 빠뜨리면 **침묵 결함**(이번에 ②를 실제로 놓쳤다) |
| **(b) 공용 leaf 1벌 + import 3곳** | 함수 1개 + import 3 | 동일 | ✅ 한 곳만 고치면 따라온다 |

**채택 근거**: 이번 결함 자체가 「세 벌이 갈려서」 생겼고 실행 결과가 같은데 재발 위험만 다르다.
시그니처 통일 필요(① `AssetForm["assetKind"]` / ②③ `string`).
`Step4.tsx`가 `lib/calc/`를 import하는 방향은 이미 존재한다(`@/lib/calc/house-region`).

### V-6 근거 — 1세대 2주택(§104⑦1호) 축도 같이 열리는가

§167의10①12의2가 §167의3①12의2와 문언 동일하므로 **법령상으로는 같다**.
다만 엔진의 `surchargeType`이 `multi_house_2`일 때 재개발 경로에서 같은 값이 나오는지는 미측정.
⇒ **V-6**으로 관리한다. Phase 0에서 3주택·2주택 둘 다 재현한다.

---

## §3. 착수 전 안전망 — mutation probe (P-n)

§0.2의 4번째 인자 전달은 **프로브만 돌렸다**(전체 테스트 미실행).
착수 시 **바꿀 지점마다** 무력화→전건 통과 여부를 먼저 잰다
(memory `feedback_pre_change_safety_net_probe`).

| ID | 무력화 대상 | 재는 것 | 예상 |
|---|---|---|---|
| P-1 | `transfer-tax-api-helpers.ts:135`에서 `right_to_move_in` 제거 | ④ 단건 게이트의 안전망 | 🔴 **0건** |
| P-2 | `multi-transfer-tax-api.ts:22`에서 `housing` 제거 | ④ **다건** 복제본의 안전망 | 🔴 **0건** |
| P-3 | `transfer-tax.ts:470` `isSurchargeCase`를 `false` 고정 | LTHD 배제 + 세액의 안전망 | ✅ **17건** |
| P-4 | `transfer-tax-rate-calc.ts:310` `isSurchargeCase`를 `false` 고정 | 세율 fallback의 안전망 | 🔴 **0건** ← 예상 뒤집힘 |
| P-5 | `transfer-tax.ts:298`에 `multiHouseSurchargeResult` 전달(= 수정 선반영) | **재개발 anchor 회귀 표면** | 🔴 **0건** |
| **P-6** | fallback 목록에 `redevelopment_apt` **추가**(= B2 선반영) | §0.5 「의도된 배제 주석·테스트 0건」이라는 **부정형 단언**의 검증 | 🔴 **0건** |

**측정 결과 (베이스라인 5,925건 · `__tests__/tax-engine/transfer-tax|transfer` + `api` + `calc`)**:

🔴 **6개 중 5개가 0건이다.** 유일하게 계약이 실재하는 곳은 `transfer-tax.ts:470`(17건, LTHD 축)뿐이다.

⭐ **P-4가 예상을 뒤집었다** — `rate-calc:310`의 **세율 fallback을 통째로 죽여도 전건 통과**했다.
그런데 V-1 실측이 그 fallback이 **살아 있음**을 보여준다(승계입주권 `houses[]` 없이 0.7).
⇒ **살아 있는데 아무도 안 지키는 코드**다. 같은 의미의 두 지점(:470 / :310)이 **17 vs 0**으로
비대칭인 이유는 기존 테스트가 전부 `houses[]`를 주거나(정밀 판정) LTHD 축으로만 단언하기 때문이다.

⇒ **P-1·P-2·P-4·P-5·P-6 5개 지점 전부 신규 anchor 필수**
(memory `feedback_negative_assertion_needs_mutation_probe` · `feedback_pre_change_safety_net_probe`).

⚠️ **반대 방향도 반드시 잰다.** 사례 44·45 등 기존 재개발 anchor는 `householdHousingCount: 2`를
쓰지만 `isRegulatedArea`가 없어 fallback 조건에 안 걸린다 — 그러나 **B를 여는 순간 그 전제가
바뀐다**. 기존 anchor 전건이 그대로 통과하는지 확인하고, 값이 움직이면 **법령 정합 우선**으로
판정한다(memory `feedback_anchor_correction_legal_priority`).

---

## §3.5 미검증 레지스터 V-n (착수 전 전건 해소)

| ID | 항목 | 무엇이 달라지나 | 검증 방법 | 상태 |
|---|---|---|---|---|
| V-1 | 승계조합원 입주권에 §104⑦이 붙는가 | 붙으면 **별건 1건 추가**(과대과세 축) | 엔진 프로브 | ✅ **붙는다** — 3주택 조정 세율 **0.7**(=0.4+0.3) · `surchargeType=multi_house_3plus`. **`houses[]` 없어도 동일**(fallback도 붙임). 대조 비조정 1주택 0.4 ⇒ **과대과세 확정** |
| V-2 | ④ 확장 시 ⑧ validate에 신규 차단문이 필요한가 | 필요하면 ⑧ 작업 추가 | `collectStepIssues` 프로브 | ✅ **불필요** — 재개발APT+주택3채 issues **0건**(housing 대조군도 0건) |
| V-3 | `isHousingLike` 확장이 **분양권 목록 전송**(`transfer-tax-api.ts:87`)에서 무엇을 바꾸는가 | 세액이 움직이면 범위 확대 | ④ 프로브 | ✅ **함께 열린다**(현행 X → 확장 후 O). **법령상 옳다** — §104⑦4호가 분양권을 주택수에 산입한다. ⇒ anchor 필요, 범위 확대 아님 |
| V-4 | 재개발APT 중과 시 **유예 2년 요건의 기산일** (영 §167의3①12의2 괄호 = 기존건물 취득일) | 준공일로 재면 유예 판정이 뒤집힌다 | 엔진 프로브 | 🟡 **현 시점 측정 불가** — 양도일 2026-05-09/05-10 둘 다 0.38(중과 자체가 안 붙어 경계가 무의미). **Phase 1 직후 재측정**한다 |
| V-5 | 다건(aggregate) 경로에서 재개발APT 중과가 `§104⑤` 비교과세와 어떻게 맞물리는가 | 맞물리면 Phase 추가 | 프로브 + 코드 | ✅ **맞물리나 solo로 빠진다** — 재개발 결과에 `candidateClauses`가 **undefined**이고 `clauseBucketKey`(`transfer-tax-rate-clause.ts:101`)가 `solo-${id}`를 반환한다 ⇒ **다른 주택과 합산 비교가 안 된다**. §104⑤2호 단서 대상인데 빠진다 |
| V-6 | 1세대 **2주택**(§104⑦1호) 축도 재개발APT에서 같은 값이 나오는가 | 다르면 B1·B2 조건 분기 필요 | 엔진 프로브 | ✅ **동일** — 3주택·2주택 둘 다 0.38·LTHD 86,533,774(중과 0). 조건 분기 불요 |

> **설계를 바꿀 수 있는 미검증이 남아 있으면 착수 금지.** V-1·V-3·V-5는 **범위**를 가른다.

---

## §4. 변경 지점 (14 동기화 지점 매핑)

| # | 층 | 파일:line | 내용 |
|---|---|---|---|
| A1 | ④ 단건 | `lib/calc/transfer-tax-api-helpers.ts:135` | `isHousingLike`에 `redevelopment_apt` 추가 |
| A2 | ④ 다건 | `lib/calc/multi-transfer-tax-api.ts:22` | **복제본** — 함께 추가(Q-3 결정에 따라 통합) |
| B1 | 엔진 | `lib/tax-engine/transfer-tax.ts:470` | `isSurchargeCase` 열거 — **LTHD 배제가 여기에 달려 있다** |
| B2 | 엔진 | `lib/tax-engine/transfer-tax-rate-calc.ts:310` | `isSurchargeCase` 열거(세율) |
| C1 | 엔진 | `lib/tax-engine/transfer-tax.ts:298` | `multiHouseSurchargeResult` 전달 |
| C2 | 엔진 | `lib/tax-engine/transfer-tax-redevelopment.ts:56·210` | 파라미터 수용 + `calcTax` 4번째 인자 |
| D | 엔진 | `transfer-tax-redevelopment.ts:271`·`:329` | **§95② LTHD 배제** — 중과 적용 시 `total.lthd → 0` + `lthdExclusionReason` + **분기별 3값 동기** |
| E | ⑦ | **결과뷰 4개** (아래) | 재개발 결과에 `surchargeType`·`lthdExclusionReason` 표시 (현재 `undefined`) |

**⑤는 이미 열려 있다** — `app/calc/transfer-tax/steps/Step4.tsx:642`가
`isHousingLike(primaryKind) && householdHousingCount >= 2`로 `HousesListSection`을 렌더하는데
그 술어(`:37`)가 **`redevelopment_apt`를 포함**한다.
⇒ 「⑤는 열렸는데 ④가 버린다」 — **A1·A2만 고치면 UI 경로가 열린다.**

**⑧ validate**: ④가 넓어져도 houses는 선택 입력이라 신규 차단문이 필요 없을 것으로 보이나
**미확인** → V-2.

#### E — 결과뷰는 하나가 아니다 (memory `feedback_transfer_result_view_is_not_one`)

| 경로 | 결과뷰 | 재개발 도달 |
|---|---|---|
| 단건 | `TransferTaxResultView` | ✅ 주 경로 |
| 다건 | `MultiTransferTaxResultView` | ✅ A2가 열리면 |
| 일반건물 일괄 | `BundledAllocationCard` | ❌ (자산 종류 상이) |
| 겸용주택 | `MixedUseResultCard` | ❌ |

⇒ **단건·다건 2뷰**가 대상이다. 같은 실패가 한 달에 2회 재발한 항목이라
**섹션을 컴포넌트로 추출**하고 **렌더 조건도 공용 술어**로 둔다(중복 JSX 금지).

#### A 확장의 blast radius (memory `feedback_ui_gate_expansion_activates_latent_defect`)

`isHousingLike`는 houses 게이트 **말고도** 쓰인다 — 확장하면 함께 열린다:

| 호출부 | 효과 |
|---|---|
| `lib/calc/transfer-tax-api.ts:87` | **분양권 목록(`presaleRights`) 전송 게이트** — 재개발APT도 전송 시작 |
| `Step4.tsx:204`·`:357` | 조정대상지역 **자동조회**(이미 열려 있음 — Step4 복제본이 포함하므로) |

⇒ Phase 0에서 분양권 목록 전송이 재개발APT에서 **무엇을 바꾸는지** 실측한다(V-3).

> 🔑 **D는 산식이 아니라 귀속 문제다.** 재개발 LTHD는 3분기(인가전·인가후·청산금)로 나뉘어 있어
> (`transfer-tax-redevelopment.ts:329`) 전체를 0으로 만들 때 **분기별 표시도 함께** 0이 되어야
> 결과 화면이 「공제 0인데 분기엔 값이 있다」로 어긋나지 않는다
> (memory `feedback_engine_result_display_drift`).

---

## §5. 순서

1. **Phase 0 — 판별**: **V-1~V-6 전건 해소** + **Q-3 사용자 결정** + P-1~P-6 안전망 측정.
   **V-1·V-3·V-5가 범위를 가른다** — 여기서 Phase 수가 확정된다.
2. **Phase 1 — B·C·D (엔진 한 덩어리)**: fallback 2곳 + 인자 전달 + §95② LTHD 배제.
   여기까지가 §0.2의 Δ를 살린다. 기존 재개발 anchor 전건 회귀 확인.
3. **Phase 2 — A (④ 배관 2벌)** + Q-3 결정 반영. **여기서야 UI 경로가 열린다.**
4. **Phase 3 — E (결과뷰 2개)** + anchor·mutation 구별력 측정 + E2E.

> ⚠️ **B·C와 D를 쪼개지 않는다** — 세율만 중과로 바꾸고 LTHD를 두면
> 「세율은 중과인데 장특은 그대로」라 §95②에 정면으로 어긋나는 **중간 상태**가 된다.
> 초판은 이 둘을 Phase 1/2로 나눴는데, **한 Phase로 합친다**(초판 정정).

### 산출물 게이트 판정 (스킬 §산출물 게이트)

`.engine.design.md`·`.ui.design.md`는 **생성하지 않는다**.

- 조건 1(여러 세션·PR — Phase 3개 이상): Phase 4개지만 **한 PR 한 배치**이고
  계획서가 500줄 미만이다. 조건의 취지(여러 세션 인계)에 해당하지 않는다.
- 조건 2(UI 위젯 5개 이상 신설): **신설 위젯 0개** — ⑤는 이미 열려 있다(§4).
- 조건 3(다른 맥락 인계): 이 문서 하나로 닫는다.

⇒ 통합 계획서 단독. 「문서를 위한 문서를 만들지 않는다」.

---

## §6. 완료 조건

- [ ] **V-1~V-6 전건 해소** — 판정 근거를 각 행에 기록(artifact면 그 근거까지)
- [ ] **Q-3 사용자 결정** + 채택 근거 기록
- [ ] **P-1~P-6 착수 전 안전망 실측** — P-5·P-6이 0이면 신규 anchor를 필수로 지정
- [ ] **6개 지점(A1·A2·B1·B2·C1·C2)** 각각 구현 후 mutation 구별력 측정
- [ ] §95② LTHD 배제 before→after 실값 + **분기별 3값 동기** 확인
- [ ] 기존 재개발 anchor(사례 36~48) 전건 통과 또는 **법령 근거를 든 갱신**
- [ ] **결과뷰 2개**(단건·다건)에 표시 배선 — 공용 컴포넌트 추출, 중복 JSX 금지
- [ ] `npx tsc --noEmit` 0 · `npm run lint` 0 errors · 전체 vitest 통과
- [ ] E2E 실브라우저 확인 또는 **미수행 명시**
- [ ] §1.3(유예 기산·나·다목)은 **이 배치 범위 밖**임을 명시하고 별건으로 남길지 판단

### verdict (Do 진입 게이트)

| 조건 | 판정 |
|---|---|
| 미해소 V-n(설계 영향: V-1·V-3·V-5) 1건 이상 | `blocked` |
| Q-3 미결정 | `blocked` |
| 위 전건 해소 + 신규 critical/high 0 | `clean` |

### Q-4 (결정 완료 · 2026-08-25 사용자 승인)

| 항목 | 결정 | 근거 |
|---|---|---|
| **V-5** (§104⑤ solo 버킷) | **이 배치에 포함** | Phase 1이 중과를 여는 순간 **새로 활성화되는 지점**이다. 빼면 「중과는 붙는데 비교과세에서 혼자 논다」가 된다 |
| **V-1** (승계입주권 과대과세) | **별건으로 분리** | 축·방향이 반대다(이 배치는 과소과세). `right_to_move_in`을 fallback·정밀판정에서 **빼는** 변경이라 회귀 표면이 다르다 |

⇒ §4에 **F(§104⑤ candidateClauses)** 항목을 추가하고, V-1은 별건 계획서로 뺀다.

---

**Phase 0 완료 후 verdict: `needs-fix`**
— V-1·V-2·V-3·V-5·V-6 해소 · V-4는 Phase 1 직후로 이월(현 시점 측정 불가) ·
**Q-3·Q-4 결정 완료** · V-4만 Phase 1 직후로 이월.
⇒ **verdict `clean`** — Do 진입 가능.


---

## §7. 실행 결과 (Phase 1~3 · 2026-08-25)

### 7.1 확정 수치 (재개발APT · 3주택 · 조정지역 · 양도 2026-06-01)

| | 세율 | 산출세액 | LTHD | 과세표준 |
|---|---|---|---|---|
| 종전 | 0.38 | 55,836,614 | 86,533,774 | 199,412,143 |
| 현행 | **0.68** | **174,503,223** | **0** | **285,945,917** |

2주택(§104⑦1호)은 **0.58**(38%+20%p). 유예 창 경계 정확(2026-05-09 → 0.38 / 05-10 → 0.68).
대조군(비조정·1주택·사례 44 원본) **전건 불변**.

### 7.2 변경 지점 — 6개 + 파생 2개

| # | 파일 | 내용 |
|---|---|---|
| A1·A2 | `lib/calc/housing-like-asset.ts` **신설** | ⑤·④ 공용 술어 1벌. 세 호출부가 import (Q-3(b)) |
| B1·B2 | `lib/tax-engine/transfer-tax-surcharge-predicate.ts` **신설** | 중과 술어 1벌. `transfer-tax.ts`·`rate-calc.ts` 두 복제본 제거 |
| C1 | `transfer-tax.ts` | 재개발 분기에 `multiHouseSurchargeResult` 전달 |
| C2 | `transfer-tax-redevelopment.ts` | 파라미터 수용 + `calcTax` 4번째 인자 |
| D | `transfer-tax-redevelopment-transforms.ts` `applyLthdExclusion` | §95② 배제 — 분기 3개 + 합계 동시 0 |
| **F** | `transfer-tax-redevelopment.ts` | `multiHouseSurchargeEvaluation` echo (아래 정정) |
| 📌 | `transfer-tax-redevelopment.ts` 811 → **360** + transforms **486** | 800줄 정책 |

> 🔴 **V-5 초판 판정 정정**: 초판은 「재개발 결과의 `candidateClauses`가 undefined라
> §104⑤에서 **solo 버킷**으로 빠진다」고 했다. **틀렸다** — aggregate는 그 필드를 단건 결과에서
> 읽지 않고 `resolveSplitAwareTax`로 **자체 계산**한다(`transfer-tax-aggregate-helpers.ts:348`).
>
> ⇒ 진짜 위험은 **다른 것**이었다. aggregate가 `records[i].result.multiHouseSurchargeEvaluation`을
> `calcTax`에 넘기는데(`:357`) 재개발 결과가 그 필드를 **안 실었다**. 중과를 여는 이 배치가
> 그 순간 **원시 플래그 재판정**을 활성화한다 — 단건이 배제한 중과가 다건에서 되살아난다(F01 동형).
> ⇒ F를 「`candidateClauses` 배선」에서 **「`multiHouseSurchargeEvaluation` echo」로 교체**했다.

### 7.3 anchor 18건 · 구별력 7/7

`multi-house-surcharge.anchor.test.ts` 12건 · `housing-like-asset.anchor.test.ts` 6건.

| 뮤테이션 | 실패/18 |
|---|---|
| M-1 엔진 집합에서 `redevelopment_apt` 제거 | 6 |
| M-2 재개발 분기 인자 전달 제거 | 2 |
| M-3 `calcTax` 4번째 인자 제거 | **0 → 1** |
| M-4 LTHD 배제 무력화 | 5 |
| M-5 분기별 0 동기화만 제거(합계만 0) | 1 |
| M-6 `multiHouseSurchargeEvaluation` echo 제거 | 2 |
| M-7 ④ 술어에서 `redevelopment_apt` 제거 | 2 |

> ⭐ **M-3이 처음엔 0이었다** — fallback에도 `redevelopment_apt`를 넣었으므로 **두 판정이 같은
> 결론**을 내 4번째 인자를 지워도 값이 안 바뀌었다. 구별하려면 **둘이 갈리는 사실관계**가
> 필요했다: 보유 3채 중 2채가 영 §167의3①**1호**(수도권 밖 3억 이하 — 주택수 미산입)라
> 정밀 판정은 `none`인데 fallback은 중과를 거는 케이스(RS-07a).
>
> 🔑 **일반화**: 「정밀 판정 우선」을 고정하려면 **정밀과 fallback이 다른 답을 내는** 픽스처가
> 있어야 한다. 같은 답을 내는 픽스처로는 인자 전달 여부를 영원히 못 잡는다.

### 7.4 검증

**1,492파일 16,410테스트 전건 통과** · tsc 0 · lint 0 errors(309 warnings — 베이스라인 유지).

### 7.5 남은 것

- **V-1 별건** (Q-4 결정) — 승계조합원 입주권 §104⑦ 과대과세. 세율 0.7 실측.
  `SURCHARGE_FALLBACK_PROPERTY_TYPES`에서 `right_to_move_in`을 빼는 변경이며,
  **`HOUSING_LIKE_ASSET_KINDS`(④·⑤)에서는 빼면 안 된다**(입주권 양도자도 주택 수를 센다).
  두 상수를 **별개로 둔 이유**가 이것이다(`housing-like-asset.ts` 헤더 · anchor HL-06).
- **§1.3 범위 밖** — 유예 창 나·다목(토지거래허가 조건부 배제, 2026-09-09/11-09) 구현 여부 미확인.
- **E(결과뷰)** — `surchargeType`·`lthdExclusionReason` 표시. 엔진은 `surchargeType`을 이제
  싣지만 **결과뷰 2개(단건·다건) 배선은 미수행**이다.
