# 부담부증여 지원 확장 (조합원입주권·재개발/재건축 APT) — 엔진 설계

> 계획서: [`burdened-gift-redevelopment-assets.plan.md`](./burdened-gift-redevelopment-assets.plan.md)
> 작성 2026-08-12 · **R2 개정**(13단계 자가검토 STEP 6~9 반영 — 6-way 검토 60건 + 상충 3건 직접 실측 판정)
> 상태 **설계(Design)** — Do 진입 전 · ⛔ 분양권 범위 밖
> 인용은 전부 실측(법령=KoreanLaw 현행 원문 · 코드=`file:line` · 수치=P0 probe)

## Context

`assetKind` 8종 중 5종만 부담부증여를 지원한다. 조합원입주권·재개발 APT는 UI·validate·엔진 3층에서 차단된다(계획서 §1.1).

두 자산은 같은 기능이 아니다. 재개발 APT는 완공 주택이라 현행 `housing` 축과 동형이지만, 조합원입주권은 증여재산 평가가 상증법 **§61③**(권리)이라 §159①1호 A 괄호의 기준시가 강제를 받지 않는다.

또한 P0 probe에서 **§159 × §166 결합이 양도차익을 음수로 만든다**는 것이 실증됐다(계획서 §11). 세액이 틀어지는 실제 경로는 합계가 아니라 **LTHD**다 — `splitLthdAmount`(`redevelopment.ts:530-531`)가 `gainAmt <= 0`에서 공제를 0으로 반환하므로, 보유 15년의 인가전 분이 음수가 되면 장기보유공제가 통째로 사라진다.

### ⚠️ R2에서 뒤집힌 판정 3건 (초판 오류 — 직접 실측으로 확정)

| # | 초판 서술 | 실측 결과 |
|---|---|---|
| **1** | 「`computeAptPay`는 clamp, `computeRightPay`는 미clamp」 | ❌ **둘 다 자체 clamp가 없다.** `computeAptPay`의 `postApprovalGain`(`redevelopment-split.ts:278`)에 `Math.max` 없음. `:375`의 clamp는 **`computeAptReceive`**(`:306~`) 소속. P0-1b에서 APT가 0/0이 된 원인은 하류 **`splitAptPay:82`의 early-return**(`postApprovalGain <= 0` → `{0,0}`)이다 |
| **2** | 「§166 경로의 개산공제 3%는 `redevelopment-split.ts`가 담당(현행 유지)」 | ❌ **부담부증여에서 그 코드는 돌지 않는다.** `transfer-tax-burdened-gift-step.ts`가 `useEstimatedAcquisition: false`를 **강제**하므로 `computeRedevelopmentSplit` Step B의 `estimatedLumpDeduction`은 **항상 0**. 개산공제는 **§159 STEP 5** 단일 출처(`burdened-gift-apportionment.ts:293-336`). 부수 결과 — **§166③ 환산 분기는 부담부증여에서 도달 불가** |
| **3** | 「R-4(`redevelopment` 미입력 → 일반 경로)에 1% 적용」 | ❌ **R-4는 도달 불가.** `transfer-tax-api.ts:175-176`의 `isRedevelopment`가 `assetKind`만 보고 판정하고 `transfer-tax-api-redev.ts:30`이 `subjectDefault="right"`를 강제 ⇒ 입주권은 **항상** §166 경로. **1% 축·취득시 2필드·④″ 섹션 전부 불필요** |

⇒ 이 셋을 합치면 설계가 **단순해지는 방향**으로 수렴한다(§설계 결정 참조).

---

## ★ 케이스 인벤토리

| # | 시나리오 | 구분 | 법령 근거 | 테스트 파일 | 상태 |
|---|---|---|---|---|---|
| R-1 | 입주권 · 청산금 **납부** · 보충평가 · K-4 실지 | 신규 분기 | 소령 §159①1호 본문 + §166①1호 | `burdened-gift-right-to-move-in.test.ts` | ☐ |
| R-1r | 입주권 · 청산금 **수령** · 보충평가 · K-4 | 신규 분기 | 소령 §166①2호 가·나목 | 동상 | ☐ |
| R-3 | 입주권 · **시가 평가**(§60②) · K-4 | 회귀 확인 | §159①1호 괄호 미발동(동일 귀결) | 동상 | ☐ |
| R-5 | 입주권 · **§89①4호 비과세** | 게이트 | 소법 §89①4호 · 서면4팀-39 | 동상 | ☐ |
| R-6 | 입주권 · **승계조합원** | 신규 분기 | 사전-2019-법령해석재산-0649 · 소령 §162①4호 | 동상 | ☐ |
| A-2 | 재개발 APT · 청산금 **납부** · §61①4호 · 기준시가 | 신규 분기 | §159①1호 괄호 발동 + §166②1호 | `burdened-gift-redevelopment-apt.test.ts` | ☐ |
| A-3 | 재개발 APT · 청산금 **수령** | 신규 분기 | §166②2호 → ①2호 준용 | 동상 | ☐ |
| A-4 | 재개발 APT · **시가 평가** · K-4 | 회귀 확인 | 괄호 미발동 | 동상 | ☐ |
| A-5 | 재개발 APT · **1세대1주택 + 12억 초과** | 신규 배선 | 소법 §95③ · 소령 §160 | 동상 | ☐ |
| X-1 | 재개발 APT + `redevSubject="right"` + 부담부증여 | 게이트 | — (§166 비활성 = 조용한 오답) | `burdened-gift-x1-gate.anchor.test.tsx` | ☐ |
| G-1 | 게이트 3목록 parity | 게이트 | — | `burdened-gift-gate-parity.anchor.test.ts` | ☐ |

### ⛔ 도달 불가로 **삭제**한 케이스 (초판 대비)

| 초판 # | 사유 |
|---|---|
| R-2 (입주권 환산) · A-4 환산분 | `useEstimatedAcquisition: false` 강제로 §166③ 환산 분기 미점화(뒤집힌 판정 2) |
| R-4 (일반 경로) | `isRedevelopment`가 `assetKind`만 판정(뒤집힌 판정 3) |

> 삭제한 케이스의 **법령 분석은 §법령근거 3에 보존**한다 — 분양권 지원을 재개하거나 `useEstimatedAcquisition` 강제가 풀리면 되살아난다.

---

## 법령 근거

> 조문 원문·해석례 전문은 계획서 [§2](./burdened-gift-redevelopment-assets.plan.md#§2-법령-축--검증된-원문)에 있다. 여기에는 **설계 판정에 직결되는 것만** 둔다(중복 서술 회피 — 정정 시 2곳을 고치는 드리프트 방지).

### 1. §159①1호 A 괄호 — 발동 판정은 `selectedMode`로 한다

괄호의 열거는 `§61①·②·⑤ 및 §66`이고 **§61③은 없다**. 트리거는 자산종류가 아니라 「어느 조항으로 양도가액을 산정했는가」이므로 판정은 `giftValuation.selectedMode`다.

| selectedMode | 산정 근거 | 괄호 | 취득가액 |
|---|---|---|---|
| `supplementary` (입주권) | **§61③** | **미발동** | §97①1호 = 실지(K-4) |
| `supplementary` (APT) | §61①4호 | **발동** | 기준시가 |
| `mortgage` | §66 | **발동** | 기준시가 |
| `rental` | §61⑤ | **발동** | 기준시가 |

🔴 **입주권 × `mortgage`/`rental` 은 차단한다** — 그 경로는 「입주권의 기준시가」(소령 §165①)를 요구하는데 본 설계는 그 입력을 두지 않는다. 값이 0으로 흘러 **취득가액 0 → 양도차익 과대**가 되므로, 근거 없는 불리 적용을 막기 위해 **fail-fast** 시킨다(`assertBurdenedGiftEligible`과 같은 층위). 계획서 U-6.

### 2. 입주권 평가 C — 상증법 §61③ → 상증령 §51② → 상증칙 §16③

**C = 조합원권리가액 + 증여일까지 납입한 계약금·중도금 + 증여일 현재 프리미엄**

⚠️ 소령 **§166④1호**의 「평가액」(= 관리처분계획등에 따라 **정하여진 가격**)과 상증칙 §16③의 「조합원권리가액」(= 종전자산가격 **× 비례율**)은 **법문이 다른 값**이다. `redevelopment.rightsValue`를 C의 구성요소로 재사용하지 않는다.

### 3. 소령 §163⑥ — 개산공제율 (본 설계에서는 3% 단일)

```
1. 토지 3%(미등기 0.3%) · 2. 건물 3%(미등기 0.3%)
3. §94①2호 나목·다목 7%   · 4. 1~3호 외의 자산 1%
```

조합원입주권은 §94①2호**가**목이라 3호에 없다 ⇒ 법문상 **4호 1%**다.

**그러나 본 설계에서 1%는 도달하지 않는다**:
- 개산공제는 §159 STEP 5 단일 출처이고 그 base는 `*StdPriceAtAcquisition`이다(뒤집힌 판정 2).
- 입주권은 **K-4 전용**으로 좁혔고(§설계 결정 D-2), **K-4는 개산공제를 적용하지 않는다** — 실비(자본적지출·양도비)로 대체된다(`burdened-gift-apportionment.ts:298`).
- 1%가 필요한 경로(R-4 일반 경로 환산)는 도달 불가(뒤집힌 판정 3).

⇒ **`OTHER_ASSET_ESTIMATED_DEDUCTION_RATE` 신설 불요.** 위 분석은 분양권 지원 재개·`useEstimatedAcquisition` 강제 해제 시를 위한 **기록**으로만 남긴다.
⚠️ 만약 후일 1%를 넣게 되면 `estimatedDeductionRate()`(`legal-codes/transfer-nbl.ts:183`) **SSOT 함수를 확장**할 것 — 그 주석이 「신규 개산공제 지점은 반드시 이 함수를 경유. 리터럴 `0.03` 금지」를 명시하고, 근거로 2026-07-28 「15곳 3% 고정 → 미등기 10배 오류」 이력을 든다. 네 번째 중복 소스를 만들지 말 것.

### 4. 🔴 β(§166 항 스케일)의 법적 지위 — **명문 없음 · 예규 부존재**

**§159는 「취득가액 및 양도가액」 두 항만 정한다.** §166④1호의 평가액, 납부·수령 청산금, 필요경비에 채무비율 `r`을 곱하라는 문언은 **어디에도 없다**.

**예규·심판례 조사 결과 — 부존재(2026-08-12 실측)**:

| 도구 | 질의 | 결과 |
|---|---|---|
| nts | 「부담부증여 재개발」 | 1건 — **서면4팀-2568**(§159 구조만, §166 결합 미언급) |
| nts | 「부담부증여 청산금」 | 0건 |
| tax_tribunal | 「부담부증여 조합원입주권」 | 0건 |
| tax_tribunal | 「부담부증여 양도차익 관리처분계획」 | 0건 |
| nts 통합검색(Playwright) | 「부담부증여 관리처분계획」 | **547건** — 상위 전수 확인 결과 **전부 비과세·LTHD 축**(사전-2020-법령해석재산-0097 · 서면-2020-부동산-3774 · 조심-2023-서-7612 등). **§166 산식 항의 취급을 다룬 것은 0건** |

**문언 해석은 오히려 β에 불리하다**:
- §159①은 「양도로 보는 부분에 대한 양도차익을 계산할 때 그 **취득가액 및 양도가액**」 **두 항만** 정한다.
- §166은 법 **§100④**("양도차익을 산정하는 데에 필요한 사항은 대통령령으로 정한다") 위임에 따른 규정이고, §159와 **같은 층위**다.
- §166④1호의 「평가액」 = 「관리처분계획등에 따라 **정하여진 가격**」은 **물건에 관한 사실**이지 납세자의 채무 비율과 무관한 값이다.
⇒ **문언만 보면 α**(평가액·청산금은 물건 전체 유지)**가 맞다.** β는 「§166 산식이 자산 전체 양도를 전제로 설계됐으므로 부담부증여에서는 모든 항을 「양도로 보는 부분」 기준으로 재구성해야 한다」는 **목적론적 해석**이며, 명문도 선례도 없다.

⇒ **β는 「확정」이 아니라 「유력안」이다.** 채택 근거는 셋이며, 어느 것도 조문 문언이 아니다:

1. **산식 정합성** — §159가 양도가액·취득가액만 안분하면 §166 산식은 `평가액(물건 전체) − 취득가액(안분)`이라는 **스케일이 어긋난 뺄셈**이 된다. P0 실측에서 그 결과가 인가전 −30,781,500이었다(계획서 §11).
2. **불리 적용 회피** — α(현행)는 음수 분기의 LTHD를 소멸시켜 **세액을 높인다**. 명문 없는 해석으로 납세자에게 불리한 결과를 강제할 수 없다(memory `feedback_no_unfavorable_application_without_legal_basis`).
3. **비율 보존** — β는 §166②1호의 안분 비율(`평가액 : 청산금`)을 **바꾸지 않는다**(분자·분모에 같은 `r`). 즉 β는 시기별 배분 구조를 건드리지 않고 스케일만 맞춘다.

### ✅ 채택: **(a) β + 결과 화면 고지** (도메인 오너 결정 · 2026-08-12)

| 안 | 내용 | 결과 |
|---|---|---|
| **(a)** β + **결과 화면 고지** | 산식 정합성을 우선해 안분하고, 「§159와 §166 결합에 관한 명문·해석례가 없어 산식 정합을 우선한 안분을 적용했습니다」를 결과에 표시 | 기능 제공 + 불확실성 투명화 |
| **(b)** 현행 **차단 유지** | 부담부증여 × 재개발 조합을 계속 미지원하고 사유를 안내 | 가장 안전. 기능 없음 |
| **(c)** α(문언 그대로) | 평가액·청산금을 물건 전체로 두고 계산 | ❌ 인가전 분 음수 → LTHD 소멸 → **세액 과대**. 명백히 불합리한 결과를 산출 |

⇒ **(c) 배제** — 근거 없는 불리 적용(`feedback_no_unfavorable_application_without_legal_basis`).
⇒ **(a) 채택.** 산식 정합성을 우선하되 **불확실성을 결과에 고지**한다.

#### 고지 배선 — 기존 warning 경로 재사용

`detectBurdenedGiftMultiHouseWarning`(`burdened-gift-eligibility.ts:109-125`)가 이미 **경고 문자열을 반환해 `warnings`에 push**하는 선례다. 같은 패턴을 쓴다 — 결과 화면에 별도 컴포넌트를 만들지 않는다.

```ts
/**
 * β 적용 고지 (계획서 U-1) — §159 × §166 결합에 명문·해석례가 없다.
 * 재개발/입주권 + 부담부증여 조합에서만 반환.
 */
export function detectRedevelopmentBurdenedGiftNotice(args: {
  propertyType: string;
  hasRedevelopment: boolean;
}): string | null {
  const isRedev = args.propertyType === "redevelopment_apt" || args.propertyType === "right_to_move_in";
  if (!isRedev || !args.hasRedevelopment) return null;
  return (
    "부담부증여로 재개발·조합원입주권을 이전하는 경우의 양도차익 산정" +
    "(「소득세법 시행령」 제159조와 제166조의 결합)에 관한 명문 규정과 해석례가 없습니다. " +
    "본 계산은 제166조 산식의 각 항을 「양도로 보는 부분」 기준으로 안분하여 산식 정합성을 우선했습니다. " +
    "신고 전 세무 대리인 확인을 권합니다."
  );
}
```

⚠️ **문구에 유리·불리·절감 표현을 넣지 않는다**(CLAUDE.md 「납세자 유리/불리·절감 표현 금지」). 위 문구는 **적용한 방법과 그 근거 상태**만 기술한다.
⚠️ 계획서 U-1은 **판단 완료**이나 법적 불확실성 자체는 남아 있다 — 신규 예규가 나오면 재검토한다.

### 5. legal-codes 상수 (신설)

```ts
// lib/tax-engine/legal-codes/burdened-gift.ts — 기존 §61 계열 상수군 옆
/** 상증법 §61③ → 상증령 §51② — 부동산을 취득할 수 있는 권리(조합원입주권 포함) 평가. */
export const RIGHT_TO_ACQUIRE_VALUATION_61_3 = "상증법 §61③·상증령 §51②";
/** 상증칙 §16③ — 조합원권리가액(종전자산가격 × 비례율). */
export const MEMBER_RIGHTS_VALUE_RULE_16_3 = "상증칙 §16③";
```

❌ **`SUPERFICIES`(`legal-codes/inheritance-gift.ts:317`) 재사용 금지** — 문자열이 「상증법 §61③·상증령 §51·상증규 §16」이라 같은 조를 가리키는 듯하나 실은 **지상권**(§51① · §16①②) 전용이다(주석 `:316`).
❌ 개산공제율 상수는 신설하지 않는다(§법령근거 3).

---

## ★ 설계 결정

### D-1 · 입주권 평가액은 `buildingStdPriceAtTransfer`에 싣는다 (초판 뒤집기)

초판은 std 4필드를 **0으로 두고** `rightValuation`만 쓰려 했다. 그러면 세 곳이 동시에 0이 된다:

| 소비처 | 위치 | 0이 되면 |
|---|---|---|
| `sangjeungbeopValuation`(STEP 1a — **양도가액** 안분 분모) | `burdened-gift-apportionment.ts:121-125` | `transferDenominator === 0` 가드(`:168-171`) 발동 → **양도가액 land·building 모두 0 → 세액 0** |
| `wholePropertySupplementary`(12억 분모) | `:115-118` | 12억 판정 분모 0 |
| 개산공제 base | `:293-336` | (K-4는 미적용이라 무해) |

🔑 **엔진에는 평가가 둘이다** — `sangjeungbeopValuation`(STEP 1a, 양도세 축)과 `giftValuation`(STEP 1b, 증여세 축). 초판은 「C 산정」 한 줄로 뭉개 1a를 다루지 않았다.

⇒ **단일자산 3종(housing·building·commercial_building) 관행을 그대로 따른다**(`transfer-tax-api-burdened-gift.ts:211-214`): 평가액 총액을 `buildingStdPriceAtTransfer`에 싣고 `land*`는 0.
`rightValuation`은 **명세·검증·표시 전용**으로 남긴다(3항 합이 `buildingStdPriceAtTransfer`와 일치하는지 validate가 확인).

### D-2 · 입주권은 **K-4(실지취득가액) 전용**

§166①1호가 쓰는 취득가액은 「**기존건물과 그 부수토지**의 취득가액」 = 종전 부동산 취득가액이다. 그것을 모를 때의 환산은 §166③인데, 그 분기는 부담부증여에서 **점화되지 않는다**(뒤집힌 판정 2).

⇒ 입주권 취득가액 = `actualAcquisitionTotal`(기존 K-4 필드) × r. 이 결정이 한꺼번에 해소하는 것:

- 취득시 기준시가 2필드·④″ UI 섹션 **불요**
- `needsBgAcqStdPriceInput` 술어에서 입주권 제외가 **법적으로 정당**(그 칸을 쓰지 않으므로)
- **§97②2호 단서(swap) 미발동** — swap 게이트는 `acquisitionMethodUsed === "converted"` 전용(`:357`)이라 K-4에서는 열리지 않는다
- 개산공제 1% 축 **불요**(K-4는 실비 대체)

⇒ **P-5(4-way 분기 재구성)의 실질은 「`valuationMode === "standard"` 최우선 조건을 「괄호 발동 판정」으로 교체」 한 곳**으로 줄어든다.

### D-3 · `perAsset`은 `building` 슬롯

단일자산 3종 관행과 동일(`:211-214`). 하류 `splitRealExpenseByNature`(`:277-291`)도 land 기준시가가 0이면 실비 전액을 building으로 보내므로 정합한다(계획서 §11 ⑤ — 소비처 6곳 전수 확인).

### D-4 · β는 §166 산식의 **물건 전체 스케일 절대항**에만 적용

비율 항(`remainingRatio` 등)은 분자·분모가 함께 `r`배라 **no-op**이다. 분기별 적용 지점은 §계산 알고리즘 참조.

---

## 엔진 input 타입

```ts
export interface BurdenedGiftInfo {
  // … 기존 필드 유지 …

  /**
   * 조합원입주권 평가 명세 — `propertyType === "right_to_move_in"` 전용
   * (상증법 §61③·상증령 §51②·상증칙 §16③).
   *
   * ⚠️ **평가액 자체는 `buildingStdPriceAtTransfer`에 싣는다**(D-1). 이 객체는 그 값의
   *    **구성 내역**이며, 결과 카드 산식 표시와 validate 자기일관 검사에 쓰인다.
   *    ❌ 이 객체만 채우고 `buildingStdPriceAtTransfer`를 0으로 두면 양도가액이 0이 된다.
   *
   * ⚠️ `redevelopment.rightsValue`(소령 §166④1호 「정하여진 가격」)와 `memberRightsValue`
   *    (상증칙 §16③ 「종전자산가격 × 비례율」)는 **법문이 다른 값**이다.
   */
  rightValuation?: RightToMoveInValuation;
}

export interface RightToMoveInValuation {
  /** 조합원권리가액 (상증칙 §16③). 필수. */
  memberRightsValue: number;
  /** 증여일까지 납입한 계약금·중도금 등 (상증령 §51② 괄호). 0 허용. */
  paidInstallments: number;
  /** 증여일 현재 프리미엄 (상증령 §51②). 0 허용. */
  premium: number;
}
```

> 🔴 **`scaleBurdenedGiftInfo`(`burdened-gift-valuation.ts:60-83`)에 3필드를 추가해야 한다.** 그 함수는 스케일 대상을 **명시 열거**(`:69-81`)하고 나머지는 `...info`로 통과시키므로, 추가하지 않으면 지분 부담부증여에서 `rightValuation`만 100% 값으로 남아 **표시·검증이 어긋난다**(세액은 `buildingStdPriceAtTransfer`가 정하므로 무해하나, 자기일관 검사가 오판한다).

```ts
export interface RedevelopmentSplitInput {
  // … 기존 …
  /**
   * 부담부증여 채무비율 `r = B/C` (β · §설계결정 D-4). 미전달·undefined면 **1**.
   * 기존 `ownershipRatio`(`:33-41`)와 **독립**이다 — `scaleBurdenedGiftInfo`가 A·C를
   * 지분분으로 먼저 줄이므로 `r = B/C`는 지분 중립이다.
   */
  debtRatio?: number;
}
```

```ts
// transfer-tax-redevelopment.ts:56-61
export function calculateRedevelopmentTax(
  input: TransferTaxInput,
  parsedRates: ParsedRates,
  baseSteps: CalculationStep[],
  /** 부담부증여 명세 — 결과 부착(D-4 유실 해소) + `debtRatio` 도출원. */
  burdenedGift?: TransferBurdenedGiftBreakdown,
): TransferTaxResult
```

> `optional`의 실익은 「호출부 무변경」이 **아니다** — 호출부는 `transfer-tax.ts:228` **단 1곳**이고 이번에 반드시 바뀐다. 실익은 **점진 배선·롤백이 타입 오류 없이 가능**하다는 점이다.

**배선 3홉** (하나라도 빠지면 침묵 누락 — 객체 리터럴이라 spread가 없다):
```
transfer-tax.ts:228  →  calculateRedevelopmentTax(…, bgStep.breakdown)
   → runRedevelopment({ …, debtRatio })      ← transfer-tax-redevelopment.ts:65-79 에 명시 추가
      → computeRedevelopmentSplit(…)          ← redevelopment.ts:496
```

---

## 엔진 result 타입

```ts
export interface TransferBurdenedGiftBreakdown {
  // … 기존 …
  /** 자산 종류 — 결과 표시가 라벨을 고르는 근거(모드 플래그로 추론 금지). */
  assetKind?: "right_to_move_in" | "redevelopment_apt";
  /** 입주권 C 구성 내역 (표시·검증용). 합계는 `buildingStdPriceAtTransfer`와 일치해야 한다. */
  rightValuationDetail?: { memberRightsValue: number; paidInstallments: number; premium: number; total: number };
}
```

`RedevelopmentResult`에는 필드를 더하지 않는다. ⚠️ 단 **`salePriceTotal`은 β 하에서 `r`배로 축소**된다(`computeRightPay:430`·`computeAptPay:271`). 그 값은 「평가액+청산금」이라는 **관리처분계획상 사실**이므로, 결과 카드가 「분양가」로 표시한다면 **물건 전체 값을 별도 노출**하거나 라벨을 「양도로 보는 부분의 분양가」로 바꾼다.

새 Date 필드 없음 ⇒ `date-coerce` 대상 없음.

---

## 계산 알고리즘

### STEP 0.48 — §159

```
1a. 양도세 축 sangjeungbeopValuation (양도가액 안분 분모)
      supplementary = landStdPriceAtTransfer + buildingStdPriceAtTransfer
      ← 입주권은 buildingStdPriceAtTransfer 에 평가액 총액이 실려 있다 (D-1)
      mortgage / rental 도 현행 그대로 계산 → selectedMode 결정

1b. 증여세 축 giftValuation (취득가액 안분 분모)
      supplementary = landStdPriceAtTransfer + (giftBuildingStdPriceAtTransfer ?? buildingStdPriceAtTransfer)
      ← 입주권은 giftBuildingStdPriceAtTransfer 를 쓰지 않으므로 1a와 같은 값

2.  r = B / C   (C = giftValuation.max)

3.  양도가액 = 자산별 평가가액 × r                             ← §159①2호

4.  취득가액 — 최상위 조건을 교체한다 (P-5의 실질)
      괄호 발동 = (selectedMode !== "supplementary") || !rightValuation
      ├ 발동   → 기준시가 × r                    (K-1~K-3, 현행 무변경)
      └ 미발동 → K-4 실지취득가액 × r            (입주권 — actualAcquisitionTotal)
      🔴 입주권 + selectedMode ∈ {mortgage, rental} → fail-fast (§법령근거 1)

      ⚠️ 현행은 `if (valuationMode === "sangjeungbeop_standard")`가 최우선이라
         `acquisitionMethod`가 그 뒤에서만 읽힌다(`:205-250`).
         기존 5종은 `rightValuation`이 없어 판정이 항상 「발동」 ⇒ **동작 불변**.

5.  개산공제 — K-4는 미적용(실비 대체, `:298`). 입주권은 항상 이 경로.

6.  perAsset — building 슬롯에 전액, land = 0 (D-3)

7.  breakdown.assetKind · rightValuationDetail 기록
```

### STEP 0.65 — §166 (β)

`r = burdenedGift ? burdenedGift.debtRatio : 1`

| 분기 | 함수 | β 적용 |
|---|---|---|
| **APT · 납부** | `computeAptPay`(`redevelopment-split.ts:267`) | `rightsValue×r` · `settlementAmount×r` · `postApprovalExpenses×r`. 하류 `splitAptPay`의 안분 비율은 **불변**(분자·분모 동일 r) |
| **APT · 수령** | `computeAptReceive`(`:306`) | 비율항 no-op. `calcAptReceiveSettlementGain`(`redevelopment-settlement.ts:539`)의 `Math.max(0, settlementAmount − apportionedAcq)`는 **미스케일 `settlementAmount`에서 r-스케일 파생값을 빼는 혼합 스케일** ⇒ `settlementAmount×r`로 정정 |
| **입주권 · 납부** | `computeRightPay`(`:425`) | `rightsValue×r` · `settlementAmount×r` · `postApprovalExpenses×r` |
| **입주권 · 수령** | `computeRightReceive`(`:459`) | 비율항 no-op · 절대항만 ×r |
| **승계조합원** | `runSuccessorMember`(`redevelopment-successor.ts`) | 🔴 **`redevelopment.ts:138-139`에서 `computeRedevelopmentSplit`보다 먼저 early-return** ⇒ `debtRatio`가 **도달하지 않는다**. 별도 배선 필요 + `successorAcquisitionPrice = actualAcquisitionPrice ?? rightsValue`(`:60-61`)의 **`?? rightsValue` fallback이 미스케일**이라 `transferPrice`(=B)에서 빼면 스케일 불일치 ⇒ 부담부증여에서 fallback 금지(§159가 준 `acquisitionPrice`만 사용) |

**인가전 분 공통**: `평가액×r − 취득가액` — 취득가액은 §159가 **이미 안분**했으므로 `r`을 다시 곱하지 않는다(`r²` 방지).
**개산공제 항 없음**: `estimatedLumpDeduction`은 부담부증여에서 항상 0(뒤집힌 판정 2).

**항등식 (anchor로 고정)**
```
Σ분기양도차익 = 양도가액 − 취득가액 − 청산금·r − 필요경비·r
  where 필요경비·r ≡ preApprovalExpenses·r + postApprovalExpenses·r
        (개산공제는 §159 STEP 5가 이미 반영 — 이 식에 포함하지 않는다)
```

**0-절사 경계**: `splitReceive`(`redevelopment-settlement.ts:157-163`)는 `settlementAmount <= 0`이면 나목 축소를 건너뛴다. `floor(settlementAmount × r)`이 0으로 절사되면 **조용히 그 경로에 진입**한다 ⇒ 소액 청산금 + 낮은 r 경계 anchor 필요.

### clamp (D-8 · 근거 교체)

두 pay 분기 **모두 자체 clamp가 없다**. APT는 하류 `splitAptPay:82`가 음수를 0으로 삼키고, 입주권은 `computeRightPay:432`가 `settlement.gain`에 **그대로 싣는다**.

β 적용 후에도 음수가 남을 수 있으므로 방어가 필요하나, **0 clamp에는 조문 근거가 없다**(양도차익을 임의로 줄여 반대 방향 오차를 만든다). ⇒ **원인 규명 우선**, 그 다음 fail-fast 또는 경고를 검토하고, clamp는 최후 수단으로 둔다.
⚠️ `computeRightPay`에 clamp를 넣으면 **일반 양도 경로 결과가 바뀐다**. `feedback_anchor_correction_legal_priority` 절차 준수: ①정정 커밋과 anchor 갱신을 묶고 ②갱신 사유를 anchor 파일 주석에 인라인 기록하고 ③**갱신 전 사용자 확인**.

### 12억 안분

| 지점 | 역할 | 조치 |
|---|---|---|
| `transfer-tax-redevelopment.ts:84` | 12억 **비교** | `input.burdenedGiftDenominator ?? input.transferPrice` |
| `:86` | `applyHighValueAllocation(redevRaw, **input.transferPrice**, …)` → `:298` `taxableRatio = (분모−12억)/분모` | **동일 값으로 교체** — 비교와 안분 분모가 **반드시 같아야** 한다 |
| `:93`·`:145` | 표시 산식 | 같은 값으로 |
| `:542`·`:564` | `applyOneRightExemption` — **`:531-533`에 `subject !== "right"` 가드** ⇒ **R-5(입주권 비과세) 전용**, A-5와 무관 | ⚠️ 그 함수 주석(`:514`)이 「국세청 해석례 근거 — **분모 = transferPrice 단일(해석 A)**」를 명시한다. 해석 B(C 분모)로 바꾸려면 **해석 A 근거와의 충돌을 먼저 해소**해야 한다 → 계획서 U-8(신규) |

🔑 **`input.burdenedGiftDenominator`를 쓴다** — 4번째 파라미터가 불필요하다. `transfer-tax.ts:220·228`이 넘기는 `effectiveInput`은 STEP 0.48(`:178`)을 거쳤으므로 그 필드가 **이미 재개발 분기 안에 있고**, 기존 7개 소비처(`transfer-tax-exemption.ts`)와 **동일한 우선순위**가 된다.
⚠️ `??`는 **0을 걸러내지 못한다** — `> 0` 검사로 할 것.

---

## Silent fallback / 자동 안분 후보

| 후보 | 판단 | 조치 |
|---|---|---|
| `rightValuation` 3항 합 ≠ `buildingStdPriceAtTransfer` | ❌ 어느 쪽으로도 자동 보정 금지 | validate 자기일관 검사로 차단 |
| `memberRightsValue`를 `redevelopment.rightsValue`로 자동 대입 | ❌ 법문이 다른 값 | UI **파생 함수**로만(§UI설계) |
| `debtRatio` 미전달 시 1 | ✅ 일반 양도는 안분 자체가 없다 | 기본값 1 |
| 승계조합원 `?? rightsValue` fallback | ❌ 부담부증여에서 **미스케일 값** | fallback 금지 |
| 입주권 + `mortgage`/`rental` selectedMode | ❌ 기준시가 0으로 통과 = 불리 적용 | **fail-fast** |
| 입주권에 취득시 기준시가 요구(`needsBgAcqStdPriceInput`) | ❌ K-4 전용이라 그 칸을 쓰지 않는다 | 술어에서 제외 |

---

## 14 동기화 지점 — API/Route 6개

> 클라이언트 8개는 [UI 설계](./burdened-gift-redevelopment-assets.ui.design.md) 소관.

| # | 지점 | 조치 |
|---|---|---|
| ⑨⑩ | Zod enum | **변경 없음 — 실측**(`lib/api/transfer-tax-schema.ts:70`에 2종 기존재) |
| ⑪ | `acquisitionDate` fallback | **확인 필요**(계획서 U-7) |
| ⑫ | **Zod 객체** | 🔴 **유일한 하드 게이트.** 아래 코드 필수 — 미등록 시 `z.object`가 **침묵 strip**해 C가 0이 되고 `r=B/C` 발산 |
| ⑬ | body spread | **변경 없음 — 실측**(`transfer-tax-api.ts:654`가 `burdenedGiftInfo` 통째 spread) |
| ⑭ | Route 매핑 | **변경 없음 — 실측**(`engine-input.ts:333` 통째 pass-through) |

```ts
// lib/api/transfer-tax-burdened-gift-schema.ts — giftBuildingStdPriceAtTransfer(:66) 근처
  /**
   * 조합원입주권 평가 명세 (상증법 §61③·상증령 §51②·상증칙 §16③).
   * ⚠️ 미등록 시 침묵 strip. TypeScript 미감지.
   */
  rightValuation: z
    .object({
      memberRightsValue: z.number().int().nonnegative(),
      paidInstallments: z.number().int().nonnegative(),
      premium: z.number().int().nonnegative(),
    })
    .optional(),
```

`.optional()`인 이유는 `carryoverDonorBasis`(`:52-61`)와 같다 — **모드별 필수 여부는 ⑧ validate와 엔진이 지킨다**.

**법령 검증 manifest**: 신규 등록 불요 — 상증령 §51(`additions-inheritance-decree.ts:365`)·상증칙 §16(`:394`, keywords에 "조합원권리가액" 포함)·소령 §159(`additions-transfer-decree.ts:97`)·§166(`:181`) 모두 기등록(계획서 §9 V-8 실측).

---

## 테스트 약속

케이스 인벤토리 **11행 전부** anchor 1개 이상. anchor ID는 **계획서 §8이 정본**이다(중복 정의 금지).

| 우선 | 내용 |
|---|---|
| **세액 0 방어** | R-1에서 `transferPrice > 0` 단언 — D-1을 어기면(std 필드 0) 조용히 세액 0으로 통과한다 |
| **대칭 쌍** | R-1(입주권 = K-4 실지 × r) ↔ A-2(APT = 기준시가 × r). P-1 경계가 뒤집히면 둘 중 하나는 반드시 깨진다 |
| **자기일관** | `rightValuationDetail.total === buildingStdPriceAtTransfer` |
| **음수 회귀** | P0-1a 조건(B/C=0.5)에서 인가전양도차익 **양수** — β가 빠지면 −30,781,500으로 실패 |
| **β 항등식** | 위 식 그대로 |
| **분기별 β** | 4분기(APT 납부/수령 · 입주권 납부/수령) + 승계조합원 각 1건 |
| **0-절사 경계** | 소액 청산금 + 낮은 r |
| **fail-fast** | 입주권 + mortgage 채택 시 명시 실패 |
| **부정 단언** | X-1은 **양성 대조군을 같은 spec에**(memory `feedback_negative_assertion_needs_mutation_probe`) |
| **기존 anchor 갱신** | `burdened-gift-supported-asset-notice.anchor.test.tsx:19` 기본값 → `presale_right` |

**회귀**: `npx vitest run __tests__ -t burden`(47파일) + `npm run test:transfer` + 재개발 기존 anchor(`case-36-*`·`case-4x-*`·`case-48-*`).
모든 신규 anchor는 **mutation probe로 감지력 실측** 후 확정.
