# 조합원입주권·분양권 §104⑦ 중과 적용범위 정정 (V-1 별건)

> 이월 출처: `transfer-redevelopment-surcharge-final-pass.plan.md` §7.5 「V-1 별건 (Q-4 결정)」
> 검증 깊이 **L3** — 세액이 바뀐다 · 법령 판정이 갈린다 · 직전 배치가 만든 결함을 함께 고친다
> 작성 2026-08-25 · 워크트리 `redevelopment-final-pass` · base `808b5434`

---

## §0 착수 전 실측 (P-0) — 이월 서술을 세 번 뒤집었다

이월 서술은 「**승계조합원** 입주권이 **fallback 집합**에서 30%p를 받는다. `SURCHARGE_FALLBACK_PROPERTY_TYPES`에서 `right_to_move_in`을 빼면 된다」였다. **셋 다 불완전했다.**

### P-0.1 축은 「승계 여부」가 아니라 「자산 종류」다

| 케이스 | 세율 | 산출세액 | LTHD |
|---|---|---|---|
| **승계**조합원 입주권 · 조정 3주택 | 0.68 | 114,360,000 | 0 |
| **원**조합원 입주권 · 조정 3주택 | **0.68** | **114,360,000** | 0 |

`isSuccessorRightToMoveIn`은 중과 판정에 **아무 영향이 없다**. 승계로 좁혀 고치면 원조합원 케이스가 그대로 남는다.

### P-0.2 fallback만 막으면 정밀 경로가 뚫린다

`houses[]`가 오면 `resolveSurchargeApplication`은 fallback 집합을 **보지 않는다** — `multiHouseSurchargeResult.surchargeType !== "none"`을 그대로 쓴다. 그리고 ④ `buildHousesPayload`는 `HOUSING_LIKE_ASSET_KINDS`에 `right_to_move_in`이 있으므로 **입주권에도 `houses[]`를 싣는다**(`selling` 엔트리를 자산에서 합성 — `transfer-tax-api-houses.ts:30`). 즉 정밀 경로는 **살아 있는 입력 경로**다.

| 경로 | 세율 |
|---|---|
| fallback (`houses[]` 없음) | 0.68 |
| **정밀** (`houses[]` 3채) | **0.68** |

### P-0.3 leaf에 게이트를 넣어도 세율이 안 빠진다 — 네 번째 지점

제안대로 `resolveSurchargeApplication`에 자산 게이트를 넣고 실측했더니:

```
입주권 fallback 3주택조정  rate=0.38  lthd=24,000,000   ← 고쳐짐
입주권 정밀     3채        rate=0.68  lthd=24,000,000   ← 세율만 안 고쳐짐
```

`transfer-tax-rate-calc.ts:415`가 leaf를 **우회**한다:

```ts
const surchargeApplicable = multiHouseSurchargeResult
  ? multiHouseSurchargeResult.surchargeApplicable   // ← leaf를 안 거친다
  : isSurchargeCase && !suspended;
```

⇒ leaf에만 게이트를 두면 **「세율은 중과인데 장특공제는 살아 있다」**는 상태가 만들어진다. 이것은 predicate 헤더(`transfer-tax-surcharge-predicate.ts:52`)가 「한쪽만 열면 위법 상태」라고 경고한 바로 그 조합이며, 이번엔 **닫는 방향에서** 같은 함정이 재현됐다.

### P-0.4 직전 배치가 §166 경로에 새 결함을 심었다

```
git show e10ab20c:lib/tax-engine/transfer-tax-redevelopment.ts | grep -c "lthdExcludedBySurcharge"  →  0
```

Step A.8(§95② LTHD 배제)은 직전 배치 `808b5434`가 **신규 도입**했고, `calculateRedevelopmentTax`는 `redevelopment_apt`뿐 아니라 **원조합원 입주권 §166 3분할**(`redevelopment-dispatch.ts:123` `subject === "right"`)도 탄다. 그래서 입주권에 LTHD 배제가 새로 걸렸다.

Step A.8 주석은 「재개발 신축주택(완공 APT)은 §94①1호 자산(건물)이라 이 괄호가 그대로 걸린다」로 **apt만** 논증하는데, 코드는 `subject` 구분 없이 건다 — 주석과 구현이 어긋난다.

> **직전 배치의 「회귀 0」은 anchor가 이 조합을 보지 않아서 나온 결과다.** M-4 mutation에서 실패한 5건은 전부 `redevelopment_apt` anchor였다.
>
> 세율 중과는 base에도 있었다(`git show e10ab20c:...rate-calc.ts:310`에 `right_to_move_in` 존재) — **LTHD 배제만 신규**다.

### P-0.5 기존 anchor는 **유예 덕분에** 초록이었다

`__tests__/tax-engine/transfer-tax/successor-right-to-move-in.test.ts:164`

```ts
it("V-1: 세대 3주택이어도 §104⑦ 다주택 중과가 붙지 않는다 (입주권은 주택이 아니다)", ...)
```

이 anchor는 `transferDate: 2026-02-16` + `makeMockRates()`(유예 `suspended_until: 2026-05-09`)를 쓴다. **중과가 애초에 유예 중인 조합**이다.

| | 세율 |
|---|---|
| 2026-02-16 (유예 중) | 0.38 ← 현행 anchor가 보는 지점 |
| 2026-06-01 (유예 후) | **0.68** |

⇒ **단언은 옳은데 관측 지점이 어긋나 구별력이 0**이다(memory `feedback_anchor_observes_wrong_stage`).

---

## §1 법령 — §104⑦의 대상은 「주택」이다

### §1.1 소득세법 §104⑦ (KoreanLaw MCP 본문 실독 · 시행 2026-07-01본 · MST 280405)

> ⑦ 다음 각 호의 어느 하나에 해당하는 **주택**(이에 딸린 토지를 포함한다. 이하 이 항에서 같다)을 **양도하는 경우** 제55조제1항에 따른 세율에 100분의 20(제3호 및 제4호의 경우 100분의 30)을 더한 세율을 적용한다. …
> 1. 조정대상지역에 있는 **주택**으로서 대통령령으로 정하는 1세대 2주택에 해당하는 주택
> 2. 조정대상지역에 있는 **주택**으로서 1세대가 1주택과 **조합원입주권 또는 분양권**을 1개 보유한 경우의 **해당 주택**. …
> 3. 조정대상지역에 있는 **주택**으로서 대통령령으로 정하는 1세대 3주택 이상에 해당하는 주택
> 4. 조정대상지역에 있는 **주택**으로서 1세대가 주택과 **조합원입주권 또는 분양권**을 보유한 경우로서 그 수의 합이 3 이상인 경우 **해당 주택**. …

🔑 **2호·4호가 결정적이다.** 조합원입주권·분양권은 **주택 수를 세는 요소**로만 등장하고, 세율을 더할 **양도 대상은 언제나 「해당 주택」**이다. 각 호 어디에도 「조합원입주권을 양도하는 경우」가 없다.

- 조합원입주권 = §94①**2호가목**의 권리
- 분양권 = §94①**2호나목**
- §104①1호는 §94①1호·2호·4호를 함께 묶지만, **⑦은 「주택」으로 한정**한다.

### §1.2 소득세법 §95② — 괄호가 어디에 붙는지가 갈린다

> ② …"장기보유 특별공제액"이란 **제94조제1항제1호에 따른 자산**(제104조제3항에 따른 미등기양도자산과 **같은 조 제7항 각 호에 따른 자산은 제외한다**)으로서 보유기간이 3년 이상인 것 **및 제94조제1항제2호가목에 따른 자산 중 조합원입주권**(조합원으로부터 취득한 것은 제외한다)에 대하여 …

🔑 **「§104⑦ 각 호에 따른 자산은 제외한다」 괄호는 §94①1호 자산(토지·건물)에만 붙어 있다.** 조합원입주권은 그 뒤에 「**및**」로 병렬된 **별개 항목**이고, 그 항목에는 §104⑦ 제외 괄호가 **없다**.

⇒ **원조합원 입주권은 다주택 보유 여부와 무관하게 LTHD 대상이다.** 승계분만 「조합원으로부터 취득한 것은 제외한다」로 빠진다(이미 `transfer-tax-lthd.ts:84`가 구현).

⇒ 분양권(§94①2호**나**목)은 §95② 어느 항목에도 없어 **애초에 LTHD 대상이 아니다**.

### §1.3 §104⑦ 후단(2년 미만 비교)도 「해당 주택」 전용

> 이 경우 **해당 주택** 보유기간이 2년 미만인 경우에는 … 제1항제2호 또는 제3호의 세율을 적용하여 계산한 양도소득 산출세액 중 **큰 세액**을 …

입주권 단기(2년 미만)에서도 현행 코드는 이 비교를 태운다(`rate-calc.ts:474` `stSurchargeType`). 실측 구간(과세표준 약 1.98억)에서는 단기세율(60%/70%)이 이겨 결과가 드러나지 않았으나, **과세표준이 커지면 누진 55% + 30%p = 85%가 이긴다** — 잠재 결함이지 무해가 아니다.

---

## §2 결함 — 실측 수치

공통 조건: 조정대상지역 · 세대 3주택 · 양도 2026-06-01(유예 종료 후) · `makeMockRatesWithHouseEngine()`

### D-1 일반 경로 (양도가 5억 · 취득가 3억 · 원조합원 입주권)

| | 세율 | 산출세액 | LTHD |
|---|---|---|---|
| 현행 | 0.68 | 114,360,000 | 0 |
| 대조 (비조정·1주택) | 0.38 | 45,990,000 | 24,000,000 |

⇒ 세액 **68,370,000 과대**. 세율 +30%p와 LTHD 24,000,000 소실이 **동시에** 발생한다.

### D-2 §166 3분할 경로 (양도가 8억 · 취득가 2억 · 원조합원 입주권 · `subject: "right"`)

| | 세율 | 산출세액 | LTHD(총) | 인가전 분기 LTHD |
|---|---|---|---|---|
| 현행 | 0.72 | 329,460,000 | 0 | 0 |
| 대조 (비조정·1주택) | 0.40 | 170,660,000 | 16,000,000 | 16,000,000 |

⇒ 세액 **158,800,000 과대**. 「장기보유특별공제 배제 (다주택 중과)」 step까지 화면에 찍힌다.

### D-3 분양권 — 현재는 **도달 불가**

| 케이스 | 세율 | LTHD |
|---|---|---|
| 분양권 2년 이상 · 조정 3주택 | 0.60 | 0 |
| 분양권 2년 이상 · 비조정 1주택 | 0.60 | 0 |
| 분양권 1년 미만 · 조정 3주택 | 0.70 | 0 |

`shortTermFlatRate`가 항상 non-null(§104①1호 괄호 60% · 2·3호 60/70%)이라 중과 가산 전에 early return하고, LTHD는 §95② 대상이 아니라 원래 0이다. **현재 세액 영향 0** — 그러나 근거 조문은 입주권과 **동일**하다.

---

## §3 설계

### §3.1 수정 지점 (4곳)

| # | 위치 | 현행 | 정정 |
|---|---|---|---|
| **A** | `transfer-tax-surcharge-predicate.ts:55` `SURCHARGE_FALLBACK_PROPERTY_TYPES` | `{housing, right_to_move_in, presale_right, redevelopment_apt}` | 집합을 **양도 대상 축**으로 재정의 → `{housing, redevelopment_apt}` |
| **B** | 같은 파일 `:92` `isSurchargeCase` 정밀 분기 | `result.surchargeType !== "none"` (자산 무관) | **자산 게이트를 정밀·fallback 양쪽 공통 전제**로 승격 |
| **C** | `transfer-tax-rate-calc.ts:415` `surchargeApplicable` | `result.surchargeApplicable` 직접 참조 (leaf 우회) | leaf가 **세율 축도 함께 반환**하고 그것을 쓴다 |
| **D** | `transfer-tax-rate-calc.ts:419` `effectiveSurchargeType` | `result?.surchargeType ?? (count>=3 ...)` | 자산 비대상이면 `"none"` |

### §3.2 leaf 시그니처 — 축이 **둘**이라는 것이 핵심

`multi-house-surcharge.ts:320`이 명시하듯 두 축은 **의도적으로 다르다**:

> 「세율만 배제: surchargeType은 유지 → isSurchargeCase=true → §95② 장기보유특별공제 배제 판정 보존」 (위기취득 배제 `rateSurchargeStatutoryExcluded`)

⇒ leaf는 **세율 축과 LTHD 축을 각각** 노출해야 한다. 지금 `SurchargeApplication`에는 `isSurchargeApplied` 하나뿐이고 `rate-calc`가 자기 것을 따로 만들고 있어 C가 생겼다.

```ts
export interface SurchargeApplication {
  isSurchargeCase: boolean;        // §95② LTHD 배제 축
  isSuspended: boolean;
  isSurchargeApplied: boolean;     // = isSurchargeCase && !isSuspended (재개발 Step A.8)
  isRateSurchargeApplied: boolean; // 🆕 세율 축 — 위기취득 배제 반영 (C가 쓸 값)
  effectiveHouseCount: number;
  surchargeTypeKey: "multi_house_2" | "multi_house_3plus";
  effectiveSurchargeType: "none" | "multi_house_2" | "multi_house_3plus"; // 🆕 D가 쓸 값
}
```

자산 게이트는 **함수 최상단 단일 전제**로 두어 네 필드가 함께 닫히게 한다 — 지점마다 `&&`를 붙이면 다음 지점에서 또 빠진다(이번 결함의 발생 기전 그 자체).

### §3.3 두 집합은 계속 **별개**다 (강화됨)

| 상수 | 원소 | 축 |
|---|---|---|
| `lib/calc/housing-like-asset.ts` `HOUSING_LIKE_ASSET_KINDS` | housing · right_to_move_in · presale_right · redevelopment_apt | ④⑤ **주택 수 입력 경로** |
| `transfer-tax-surcharge-predicate.ts` (엔진) | **housing · redevelopment_apt** | §104⑦ **양도 대상** |

**입주권 양도자도 세대 주택 수를 세야 한다** — 비과세·§89①4호·주택수 산정에 필요하다. 그래서 ④는 **무변경**이다.

anchor `HL-06`(`__tests__/calc/housing-like-asset.anchor.test.ts:75`)이 「같은 객체여서는 안 된다」를 고정해 뒀고, 이번 변경으로 **원소까지 실제로 갈라진다** — HL-06의 경고가 구체적 사실이 된다. 단언을 `.not.toBe` → **원소 차집합 단언**으로 승격한다.

### §3.4 이름 변경

`SURCHARGE_FALLBACK_PROPERTY_TYPES` → **`SURCHARGE_SUBJECT_PROPERTY_TYPES`**. 이제 이 집합은 fallback 전용이 아니라 **정밀 경로에도 걸리는 양도 대상 축**이다. 이름을 두면 다음 사람이 다시 「fallback에만 쓰는 것」으로 읽는다.

⚠️ 전역 치환 금지 — 참조 지점 3곳(`transfer-tax-surcharge-predicate.ts` 정의 · `__tests__/calc/housing-like-asset.anchor.test.ts:28,78` · `lib/calc/housing-like-asset.ts:21` 주석)을 개별 확인한다(memory `feedback_rename_same_name_two_axes`).

---

## §3.5 미검증 레지스터 V-n

| ID | 항목 | 판정 | 상태 |
|---|---|---|---|
| **V-1** | 분양권 게이트가 §104⑤ **다건 버킷 키**를 바꾸는가 | 🔴 **바꾼다 — 3,860,000** (아래 §3.5.1) | ✅ |
| **V-2** | `mixed-use-house`가 이 술어에 도달하는가 | 🔴 **도달한다 · 정밀 경로도 도달 가능** (아래 §3.5.2) | ✅ |
| **V-3** | §166 경로 Step A.8을 `subject === "apt"`로 좁혀야 하는가 | **자산 게이트로 충분** — Step A.8 무변경. RT-05에서 `preApproval.lthd` 16,000,000 복원 확인 | ✅ |
| **V-4** | `presale_right` 제거가 `candidateClauses`·`rateClause` **표시**를 바꾸는가 | **표시 축 없음** — 두 필드는 `TransferTaxResult`에 **존재하지 않는다**(tsc TS2339로 확인). `calcTax` 내부 값이라 결과뷰 회귀 표면 0. 다건 버킷 영향은 V-1로 흡수 | ✅ |

### §3.5.1 V-1 — 🔴 **판정 뒤집힘: 분양권은 다건에서 세액이 움직인다**

계획서 초판 §2 D-3은 「분양권 현재 세액 영향 **0**」이라 했다. **단건에 한정된 사실이었다.**

다건 §104⑤ 실측(조정지역 · 3주택 · 유예 종료 후):

| 조합 | 게이트 전 | 게이트 후 | Δ |
|---|---|---|---|
| 분양권 + 사업용토지 | 229,300,000 | **225,440,000** | **−3,860,000** |
| 분양권 + 상가 | 229,300,000 | **225,440,000** | −3,860,000 |
| **대조: 분양권 + 토지 (비조정·1주택)** | 225,440,000 | 225,440,000 | **0** |
| **대조: 토지 + 상가 (분양권 무관)** | 149,060,000 | 149,060,000 | **0** |

⭐ **대조군이 도출값을 확증한다.** 게이트 전에도 **비조정·1주택이면 225,440,000**이었다 — 차이는 「분양권이라서」가 아니라 **「§104⑦ 후보 호가 붙어서」** 생겼다.

기전: 종전에는 분양권의 `stCandidates`에 `surchargeClause("multi_house_3plus")`가 들어가 `clauseBucketKey`가 사업용 토지(§104①1호)와 **달라졌고**, §104⑤2호의 「동일한 호의 세율이 적용되고 … 합산한 것에 대하여」 병합에서 빠져 누진이 두 번 태워졌다.

⇒ **Q-2(분양권 동반)는 예방이 아니라 실제 결함 수정이다.** 분양권은 §104⑦ 대상이 아니므로 「해당 호」에 104-7-x가 들어가면 안 된다. anchor **RT-11b**가 고정한다.

### §3.5.2 V-2 — 🔴 **판정 뒤집힘: 두 집합을 합치면 안 된다**

계획서 초판 §3.1은 A(집합 재정의)와 B(게이트)를 **하나의 집합**으로 통합하려 했다. 겸용주택이 그걸 막는다.

**실측 방법** — leaf에 propertyType 수집기를 심고 `__tests__/tax-engine/ __tests__/api/ __tests__/calc/` 전건 실행:

```
mixed-use-house|precise=0|case=0     ← 술어에 **도달한다**
housing|precise=1|case=1
redevelopment_apt|precise=1|case=1
```

테스트 코퍼스에는 `mixed-use-house|precise=1`이 없지만 **도달 불가가 아니라 격자 부재다**:

- `transfer-tax-api.ts:240` — `isMixed = primary.assetKind === "housing" && primary.isMixedUseHouse`
- `:78` — `buildHousesPayload(primary, ...)` → `isHousingLike(primary.assetKind)` = **`"housing"`이므로 true**

⇒ 겸용주택은 `propertyType: "mixed-use-house"`로 가면서 **`houses[]`도 함께 간다** = 정밀 경로 도달. 대상 집합에서 빼면 **현행 중과가 사라진다**(세액 감소 회귀). 법령상으로도 겸용주택의 주택 부분은 §104⑦ 「주택」이다.

반대로 **fallback 집합**에 넣으면 원시 플래그만으로 중과가 **새로** 걸린다(세액 증가 = 범위 확대).

⇒ **대상 집합에는 넣고 fallback 집합에는 넣지 않는다.** 두 집합을 분리한다:

| 상수 | 원소 |
|---|---|
| `SURCHARGE_SUBJECT_PROPERTY_TYPES` (export) | housing · redevelopment_apt · **mixed-use-house** |
| `SURCHARGE_FALLBACK_PROPERTY_TYPES` (module-private) | housing · redevelopment_apt |

겸용주택 fallback 미포함(과소과세 방향)은 **별건**으로 유지하되, anchor **RT-14**가 그 경계를 표식한다 — 무심코 넣으면 빨개진다.

---

## §4 결정 게이트 Q-n

### Q-1 게이트를 어디에 두는가 — **✅ (a) 채택** (2026-08-25 사용자 결정)

| | 내용 | 작업량 | 회귀 표면 | 재발 위험 |
|---|---|---|---|---|
| **(a)** | leaf가 세율 축까지 반환하고 `rate-calc`가 그것을 쓴다 (§3.2) | 중 (leaf +2필드, rate-calc 2줄 교체) | 중 — 위기취득 배제 축을 leaf로 옮기므로 그 anchor가 반응 | **낮음** — 다음 자산 종류에서 자동 적용 |
| (b) | 지점 4곳에 각각 `&&` 게이트 | 소 | 소 | **높음** — 이번 결함의 발생 기전을 그대로 재생산 |

(b)는 지금 상태(P-0.3)가 정확히 그 실패다 — 한 곳만 닫아 「세율은 중과, 장특은 정상」이 됐다.

### Q-2 분양권을 함께 뺄 것인가 — **✅ 동반 채택** (2026-08-25 사용자 결정)

- 근거 조문이 **동일**하다(§104⑦ 「주택」). 남기면 「법은 같은데 코드는 다르다」가 된다.
- 현재 세액 영향 **0**(D-3 실측) — 다만 이는 **부정형 단언**이므로 V-1·V-4 probe로 실증한 뒤 확정한다(memory `feedback_negative_assertion_needs_mutation_probe`).
- V-1이 「버킷 키가 바뀐다」로 나오면 **분양권만 별건으로 분리**하고 입주권만 고친다.

### Q-3 기존 anchor V-1을 옮길 것인가 — **권고: 옮긴다**

`successor-right-to-move-in.test.ts:164`를 유예 종료 후(2026-06-01 + `makeMockRatesWithHouseEngine()`)로 옮긴다. 지금은 구별력 0이다(P-0.5). 옮기면 **현행 코드에서 즉시 빨개지고**, 수정 후 초록이 된다 — 그 자체가 결함의 재현 테스트가 된다.

⚠️ 유예 케이스도 **함께 남긴다**(별도 it). 유예 창 경계는 별개 계약이다.

---

## §5 anchor 계획 + mutation probe

### §5.1 신규 anchor — `__tests__/tax-engine/transfer-tax/right-to-move-in-surcharge-scope.anchor.test.ts`

| ID | 단언 | 값 |
|---|---|---|
| RT-01 | 🔴 원조합원 입주권 · 조정 3주택 · 유예 후 → 중과 **미적용** | rate 0.38 · tax 45,990,000 |
| RT-02 | 🔴 §95② LTHD가 **살아 있다** (괄호는 §94①1호에만) | lthd 24,000,000 |
| RT-03 | 🔴 **정밀 경로**(`houses[]` 3채)도 동일 — fallback만 막으면 뚫린다 | RT-01과 동값 |
| RT-04 | 승계 입주권은 LTHD가 여전히 0 (§95② 「조합원으로부터 취득한 것은 제외」) | lthd 0 · rate 0.38 |
| RT-05 | 🔴 §166 3분할 경로 — 세율·분기 LTHD 복원 | rate 0.40 · tax 170,660,000 · `preApproval.lthd` 16,000,000 |
| RT-06 | §166 경로에 「장기보유특별공제 배제 (다주택 중과)」 step이 **없다** | `steps.some(...) === false` |
| RT-07 | 2주택(§104⑦1호 20%p)도 미적용 | rate 0.38 |
| RT-08 | 입주권 **단기**(1~2년)는 §104①2호 60% 그대로 (게이트가 단기세율을 건드리지 않는다) | rate 0.60 |
| RT-09 | 대조군 — **주택**(`housing`)은 중과 유지 | rate 0.68 · lthd 0 |
| RT-10 | 대조군 — **재개발APT**는 중과 유지 (직전 배치 보존) | rate 0.68 · lthd 0 |
| RT-11 | 분양권 — 게이트 전후 불변 (Q-2 채택 시) | rate 0.60 · 조정3주택 = 비조정1주택 |
| RT-12 | 🔑 두 집합의 **원소가 갈린다** (HL-06 승격) | 엔진 집합에 `right_to_move_in` 부재 · ④ 집합엔 존재 |

### §5.2 mutation probe P-n (구현 후 — anchor가 실제로 잡는지)

| ID | 무력화 대상 | 실패해야 할 anchor |
|---|---|---|
| P-1 | 자산 게이트를 fallback 분기에만 적용(정밀 분기에서 제거) | **RT-03**(단독) |
| P-2 | `rate-calc`의 `surchargeApplicable`을 옛 코드로 되돌림 | RT-01·RT-03·RT-05 |
| P-3 | 게이트 집합에 `right_to_move_in` 재추가 | RT-01·RT-02·RT-03·RT-05·RT-07 |
| P-4 | 게이트 집합에서 `redevelopment_apt` 제거 | **RT-10** + 재개발 배치 anchor(RS-01 등) |
| P-5 | `effectiveSurchargeType`의 `"none"` 처리 제거 | RT-01 또는 표시 필드 단언 |
| P-6 | Step A.8을 게이트 무시하도록 되돌림 | RT-05·RT-06 |

> **P-1이 이 배치의 핵심 probe다.** 이월 서술대로 fallback만 고쳤을 때 잡히는지를 재는 것이므로, 여기서 RT-03이 **단독으로** 빨개져야 한다.

### §5.3 착수 전 안전망 — **실측 0건**

제안 게이트(`{housing, redevelopment_apt}`)를 적용하고 전건 실행:

```
Test Files  1491 passed | 1 skipped (1492)
      Tests  16409 passed | 13 skipped | 1 todo (16423)
```

⇒ **입주권·분양권 중과를 지키는 계약이 하나도 없다.** 기존 anchor 중 유일하게 관련된 `successor-right-to-move-in.test.ts:164`는 유예 때문에 구별력이 0이었다(P-0.5).

⚠️ 이 0건은 「바꿔도 안전하다」의 근거이지 「바꾼 뒤가 안전하다」의 근거가 아니다. **RT-01~RT-12를 필수로 못박는다.**

---

## §6 회귀 표면과 범위 밖

### §6.1 함께 움직이는 것

- **위기취득 세율 배제**(`rateSurchargeStatutoryExcluded`) — Q-1(a)에서 leaf로 이동. 기존 anchor가 반응하면 **의도된 이동**이므로 값이 아니라 경로만 확인한다.
- **재개발APT** — 직전 배치의 12건 anchor(`multi-house-surcharge.anchor.test.ts`)가 전부 초록이어야 한다(RT-10 + P-4).
- **다건 §104⑤** — V-1 미해소.

### §6.2 범위 밖 (별건 후보)

| 항목 | 이유 |
|---|---|
| `mixed-use-house` 겸용주택 중과 (V-2) | **과소과세** 방향 — 회귀 표면이 반대다 |
| 유예 창 나·다목(토지거래허가 조건부 배제 2026-09-09/11-09) | 직전 계획서 §1.3에서 이월된 미확인 항목 |
| 결과뷰 `surchargeType`·`lthdExclusionReason` 표시 배선 | 직전 계획서 §7.5 **E** — 별도 배치(결과뷰 **2개**) |

---

## §7 실행 순서

```
1. V-1·V-2·V-4 probe          → verify: 버킷 키·겸용 도달·표시 필드 실측. V-1 이상 시 Q-2 재결정
2. Q-3 anchor 이설 (유예 후)   → verify: 현행 코드에서 RT 상당 케이스가 **빨개진다**(재현 확인)
3. leaf 개편 (A·B + §3.2)      → verify: tsc 0
4. rate-calc 배선 (C·D)        → verify: 정밀 경로 rate 0.38 실측
5. RT-01~RT-12 작성            → verify: 전건 초록
6. mutation P-1~P-6            → verify: 6/6 구별. 0인 항목은 anchor 재작성
7. 전건 회귀                   → verify: 1,492파일 · tsc 0 · lint 0 errors(309 유지)
8. 이름 변경 §3.4 + HL-06 승격 → verify: 참조 3곳 개별 확인
```

**완료 조건**

- [ ] V-1~V-4 전건 해소 (판정 근거 기록)
- [ ] RT-01~RT-12 초록 · mutation 6/6 구별
- [ ] 재개발 배치 anchor 12건 불변
- [ ] 전건 통과 · tsc 0 · lint 베이스라인 유지
- [ ] E2E 실브라우저 확인 **또는 미수행 명시**

---

## §8 산출물 게이트 판정

`.engine.design.md` / `.ui.design.md` — **N/A**.

- 여러 세션·여러 PR: ❌ 단일 배치
- UI 위젯 5개 이상 신설: ❌ **UI 변경 0** (④⑤ 무변경)
- 다른 맥락에서 이어받음: ❌ 이 문서로 충분

⇒ 통합 계획서 1건이 1급 산출물이다.

---

## §9 실행 결과 (2026-08-25)

### §9.1 확정 수치

**입주권 일반 경로** (원조합원 · 양도가 5억 · 취득가 3억 · 조정 3주택 · 2026-06-01):

| | 세율 | 산출세액 | LTHD |
|---|---|---|---|
| 종전 | 0.68 | 114,360,000 | 0 |
| **현행** | **0.38** | **45,990,000** | **24,000,000** |

**입주권 §166 3분할 경로** (양도가 8억 · 취득가 2억):

| | 세율 | 산출세액 | LTHD(총) | 인가전 분기 |
|---|---|---|---|---|
| 종전 | 0.72 | 329,460,000 | 0 | 0 |
| **현행** | **0.40** | **170,660,000** | **16,000,000** | **16,000,000** |

**분양권 다건 §104⑤**: 229,300,000 → **225,440,000** (§3.5.1).

**대조군 전건 불변**: 주택 0.68 · 재개발APT 0.68 · 주택 2주택 0.58 · 입주권 단기 0.6/0.7 · 분양권 단건 0.6/0.7 · 승계 입주권 LTHD 0.

### §9.2 변경 파일

| 파일 | 내용 |
|---|---|
| `lib/tax-engine/transfer-tax-surcharge-predicate.ts` | 두 집합 분리 + 자산 게이트 단일 전제 + `isRateSurchargeApplied`·`effectiveSurchargeType` 신설 |
| `lib/tax-engine/transfer-tax-rate-calc.ts` | C·D 우회 제거 — leaf 반환값 사용 (10줄 → 5줄) |
| `__tests__/tax-engine/transfer-tax/right-to-move-in-surcharge-scope.anchor.test.ts` | 🆕 RT 17건 |
| `__tests__/tax-engine/transfer-tax/successor-right-to-move-in.test.ts` | V-1 관측 지점 이설 + V-1b 신설 |
| `__tests__/calc/housing-like-asset.anchor.test.ts` | HL-06 승격(차집합 단언) + import 정정 |

`transfer-tax-redevelopment.ts`는 **무변경**이다(V-3) — Step A.8이 같은 leaf를 쓰므로 게이트가 자동으로 따라온다.

### §9.3 mutation probe — **9/9 구별**

| ID | 무력화 | 실패 |
|---|---|---|
| P-1 | 게이트를 fallback 분기에만 | 2 |
| P-2 | `rate-calc` `surchargeApplicable` 옛 코드 | 1 |
| P-3 | 대상 집합에 `right_to_move_in` 재추가 | 3 |
| P-3b | 대상 집합에 `presale_right` 재추가 | 2 |
| P-4 | 대상 집합에서 `redevelopment_apt` 제거 | 9 |
| P-4b | 대상 집합에서 `mixed-use-house` 제거 | 2 |
| P-5 | `effectiveSurchargeType`의 `"none"` 제거 | **0 → 1** |
| P-6 | Step A.8을 게이트 무시로 되돌림 | 4 |
| P-7 | fallback 집합에 `mixed-use-house` 추가 | **0 → 1** |

> 🔑 **P-5·P-7은 첫 회차에 0이었다.** 둘 다 **엔진 경유로는 관측되지 않는 계약**이다 —
> `calcTax`는 `isRateSurchargeApplied`가 false면 `effectiveSurchargeType`을 아예 읽지 않고,
> 겸용 fallback 결정은 어떤 anchor도 보지 않았다. ⇒ **leaf 직접 호출** anchor(RT-13·RT-14·RT-15)를
> 추가해 공개 반환값의 계약을 고정했다. 세액이 안 변한다고 계약이 없는 것이 아니다.

### §9.4 검증

- **1,492파일 16,427테스트 전건 통과** (직전 배치 대비 +17)
- `npx tsc --noEmit` **0건**
- `npm run lint` **0 errors / 309 warnings**(베이스라인 유지)
- 재개발 배치 anchor 12건 불변 (P-4에서 예정대로 반응)

### §9.5 미수행

- **E2E 실브라우저 확인 — 미수행.** UI 변경이 0(④⑤ 무변경)이고 엔진 내부 술어만 바뀌었으나,
  완료 조건상 명시한다.
- **결과뷰 배선(직전 계획서 §7.5 E)** — 별도 배치.
- **겸용주택 fallback 미포함**(과소과세 방향) — 별건. RT-14가 경계를 지킨다.
- **유예 창 나·다목**(토지거래허가 조건부 배제) — 별건.
