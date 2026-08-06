# pre-deemed ③ 환산 분자의 시점 — §176조의2④1호 「의제취득일 현재」 (V-2)

> **상태**: ✅ **완료** (2026-08-06). 실질 해소 — **실행 코드 변경 0**. V-3(#1089) 재편의 부수효과로 **결함 경로가 도달 불가**가 됐다.
> **조치**: 회귀 방지 **가드 anchor `V2-G`** + 이름-의미 불일치 **주석**. 둘 다 반영 완료.
> **대조 실험**: `shouldInjectHouseMax`를 `false`로 두면 V2-G가 **실패**한다(`expected null not to be null`) → 복원 시 통과. 가드가 무의미하지 않음을 실증했다.
> **선행**: [`inheritance-pre-deemed-clause-a-b-separation.plan.md`](inheritance-pre-deemed-clause-a-b-separation.plan.md) §6 V-2
> **세목**: 양도소득세 — 「소득세법 시행령」 §176조의2②2호·④1호
> **작성**: 2026-08-06

---

## 1. 한 줄 요약

③ 환산취득가의 **분자**는 §176조의2④1호상 **「의제취득일 현재」 기준시가**여야 한다. 그런데 주택 경로는 `housePriceAtInheritanceUsed`(**상속개시일** 시점 값)를 `standardPriceAtDeemedDate`(의제취득일 기준시가) 자리에 넣는다 — **이름과 의미가 어긋난다**.

**그러나 V-3 재편 후 이 경로는 도달할 수 없다.** 같은 값이 ②로도 주입되어 가목이 확인되고, 그러면 ③이 적용되지 않기 때문이다.

---

## 2. 법령 — 분자는 「의제취득일 현재」다

| 근거 | 문언 |
|---|---|
| **§176조의2②2호** | 환산 산식 = 양도당시 실지거래가액 × (**취득당시의 기준시가** ÷ 양도당시의 기준시가) |
| **§176조의2④1호** | 의제취득일 전 취득 자산의 취득가액은 "**의제취득일 현재** 제3항제1호 내지 제3호의 규정에 의한 가액" 중 많은 것 (3호 = ②항 환산취득가액) |

⇒ 의제취득일 전 자산의 환산취득가액은 **의제취득일(1985.1.1.) 현재 기준시가**를 분자로 삼는다. 엔진 필드명 `standardPriceAtDeemedDate`가 바로 그 의미다.

---

## 3. 결함의 실체 (실측)

### 3.1 주택 — 이름과 의미가 어긋난다

`inheritance-house-valuation.ts` 모듈 헤더가 스스로 밝힌다.

> **상속개시일 시점**에 개별주택가격이 존재하지 않으므로 3-시점 비율 환산으로 **상속개시일 합계 기준시가**를 자동 산출한다.

```ts
// inheritance-acquisition-helpers.ts:181
standardPriceAtDeemedDate = houseValuationResult.housePriceAtInheritanceUsed;
//   ↑ 의제취득일 기준시가         ↑ 상속개시일 시점 주택가격
```

상속개시일(예: 1980)과 의제취득일(1985) 사이의 지가 상승분만큼 **분자가 과소** → 환산취득가액 과소 → **세액 과대** 방향이다.

### 3.2 토지 — 정합한다

`pre1990LandResult.standardPriceAtAcquisition`은 §164④ 산출값이고, UI가 `PreDeemedInputs.tsx:55`에서 **"1985.1.1. 개별공시지가 × 면적"**이라 명시한다. 부칙 §8 취득시기 의제와도 맞는다(선행 계획서 §4.1(d)).

---

## 4. ★ 그런데 V-3 재편으로 **도달 불가 경로**가 됐다

### 4.1 ③이 적용되는 조건

```ts
// inheritance-acquisition-price.ts:134-138
const clauseA = Math.max(reported, sec164);
const acquisitionPrice = clauseA > 0 ? clauseA : converted;   // ③은 clauseA === 0 일 때만
```

⇒ **①② 모두 부존재**해야 ③이 쓰인다.

### 4.2 그런데 ③ 분자를 자동 주입하는 경로는 ②도 함께 주입한다

| 자산 | ③ 분자 자동 주입 | ② 주입 | pre-deemed에서 |
|---|---|---|---|
| 주택 | `shouldInjectHouseValuation` = `houseValuationResult && isPreDeemed && isHousePreDisclosure && !base.std…` | `shouldInjectHouseMax` = `!!houseValuationResult && isHousePreDisclosure` | `isHousePreDisclosure`는 상속개시일 < 2005-04-30이므로 **pre-deemed면 항상 true** ⇒ **②가 반드시 주입** |
| 토지 | `shouldInjectPre1990` = `… pre1990LandResult && isPreDeemed && !base.std…` | `shouldInjectLandMax` = `!!pre1990LandResult && land && 상속개시일 < 1990-08-30` | pre-deemed면 **항상 true** ⇒ **②가 반드시 주입** |

⇒ **자동 주입이 일어나면 ②가 반드시 함께 주입되어 `clauseA > 0`이 되고, ③은 적용되지 않는다.**

### 4.3 그러면 ③은 언제 쓰이나

①②가 모두 없는 경우 — 즉 `houseValuationResult`·`pre1990LandResult`가 **없는** 경우다. 그때는 위 자동 주입도 일어나지 않으므로 **`standardPriceAtDeemedDate`는 사용자가 직접 입력한 값**이다.

그리고 UI는 그 필드를 **"1985.1.1. 개별공시지가 × 면적"**이라 안내한다 ⇒ **시점이 정합한다.**

⇒ **V-2의 결함 경로는 실행되지 않는다. 코드 변경이 불필요하다.**

---

## 5. 그래도 남는 두 가지

### 5.1 회귀 위험 — 「우연한 해소」다

V-2가 해소된 것은 V-3의 **부수효과**이지 이 논점을 겨냥한 설계가 아니다. 다음 중 하나만 바뀌어도 **재발**한다.

- V-3 재편이 되돌려지면(③이 다시 max 후보가 되면)
- `shouldInjectHouseMax`/`shouldInjectLandMax` 게이트가 좁아지면
- ②와 ③ 분자를 **다른 값**으로 분리하면

⇒ **가드 anchor로 고정할 것**(§6).

### 5.2 이름-의미 불일치는 그대로다

`housePriceAtInheritanceUsed`(상속개시일) → `standardPriceAtDeemedDate`(의제취득일) 대입은 코드를 읽는 사람을 오도한다. **실행되지 않을 뿐 틀린 대입이다.**

⚠️ 값을 바꾸는 것은 **범위 밖**이다 — 올바른 「의제취득일 현재 주택가격」을 산출하려면 3-시점 환산을 1985 기준으로 다시 짜야 하고, 그것은 §164⑦ 모듈 전체를 흔든다. **경로가 도달 불가인 지금 그 비용을 치를 이유가 없다.**

⇒ **주석으로 명시만 한다.**

---

## 6. 변경 설계 (최소)

### V2-G — 가드 anchor 1건

```ts
it("V2-G: 자동 주입 경로에서는 ③이 채택되지 않는다 — ②가 함께 주입되므로", () => {
  // pre-deemed 주택 + houseValuationResult ⇒ ②(houseValuationStdPrice) 필수 주입
  //   ⇒ clauseA > 0 ⇒ selectedMethod !== "converted"
  // 이 성질이 깨지면 ③ 분자의 시점 불일치(V-2)가 실제 세액에 노출된다.
});
```

토지도 동일하게 1건(또는 한 테스트에서 두 자산 모두).

### V2-C — 주석 1건

`inheritance-acquisition-helpers.ts`의 `standardPriceAtDeemedDate = houseValuationResult.housePriceAtInheritanceUsed` 지점에:

```
⚠️ 이름-의미 불일치 — `housePriceAtInheritanceUsed`는 **상속개시일** 시점 값인데
   `standardPriceAtDeemedDate`는 **의제취득일** 기준시가를 뜻한다(§176조의2④1호).
   V-3 재편 후 이 경로에서는 ②가 반드시 함께 주입되어 ③이 적용되지 않으므로
   **실행되지 않는 대입**이다. ②·③ 분자를 분리하거나 ③을 다시 max 후보로 되돌린다면
   여기부터 재검토할 것 — 계획서 V-2.
```

---

## 7. 검증

| 항목 | 방법 |
|---|---|
| V2-G | **Pre-Do 불가** — 현행이 이미 통과한다(해소된 상태이므로). 대신 **대조 실험**: `shouldInjectHouseMax`를 임시로 `false`로 만들어 가드가 **실패하는지** 확인한다 |
| 회귀 | `test:transfer` · `test:inheritance` 전건 |

⚠️ **가드는 "지금 통과한다"만으로는 무의미하다** — 무엇을 깨뜨리면 실패하는지 대조 실험으로 실증해야 한다(#1082 UI 가드에서 쓴 방법과 동일).

---

## 8. 미확인

| # | 항목 | 상태 |
|---|---|---|
| **W-1** | 상가 §164⑥는 ③ 분자로 쓰이지 않는다(②만) — 확인함. 시점 논점 무관 | ✅ |
| **W-2** | 사용자가 `standardPriceAtDeemedDate`를 직접 입력하면서 ①②도 있는 경우 | ③은 어차피 미적용이라 무관 |

---

## 9. 결론

| | |
|---|---|
| **법령 판단** | ③ 분자는 **의제취득일 현재** 기준시가여야 한다(§176조의2②2호·④1호) |
| **결함 존재** | 주택 경로에 **이름-의미 불일치**가 있다(상속개시일 값을 의제취득일 필드에 대입) |
| **실행 여부** | ❌ **도달 불가** — V-3 재편 후 자동 주입 경로에서는 ②가 반드시 함께 주입되어 ③이 배제된다 |
| **조치** | **가드 anchor 1건 + 주석 1건**. 값 계산 변경은 **범위 밖**(§164⑦ 모듈 전면 재작업이 필요한데 실익이 없다) |
