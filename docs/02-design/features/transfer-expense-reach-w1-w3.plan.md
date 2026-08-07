# 필요경비 잔여 축 — **W-1(증축 경로 양도비)** · **W-3(타 자산종류 전수)**

- **작성**: 2026-08-07
- **출처**: [`gb-actual-path-sale-split-noop.plan.md`](gb-actual-path-sale-split-noop.plan.md) §8 미결 W-1·W-3
- **선행**: P-3(#1121) · W-4(#1122) · W-5(#1123) · W-6·W-7(#1124) — 필요경비 도달·안분 시점·§97②2호 단서

> **file:line·수치는 2026-08-07 워크트리 `sale-split-remaining-s11-q10-q8` 기준 실측이다.**
> 조문은 법제처 DRF 원문 조회(`소득세법` 제97조 · `소득세법 시행령` 제163조·제176조의2).
> 확인하지 못한 것은 「확인 필요」로 명시한다.

---

## §0 결론 먼저 — **둘은 성격이 다르다. 같은 PR로 묶지 말 것.**

| | 항목 | 성격 | 우선순위 |
|---|---|---|---|
| 🔴 **W-1b** | 증축에서 **양도비가 §97②2호 단서의 나목에서 제외**된다 | **세액 결함 가능** — 나목 과소평가 → 단서가 발동해야 할 때 미발동 (납세자 불리) | **높음 — 선측정 필수** |
| 🟠 **W-1a** | 증축 일괄 필요경비를 **취득시 비율 하나로** 안분 | 배분 오류(합계 보존) — W-5와 같은 클래스 | 중 |
| 🔴 **W-3-겸용** | 겸용주택은 자본적지출·양도비를 **아예 지원하지 않는다** | **기능 결손** — 사용자 확인(2026-08-07): 「겸용주택도 공통 자본적지출·필요경비가 있을 수 있어, 해당 기능을 지원해야 돼」 ⇒ **구현 확정** | **높음 — 범위 최대** |
| ✅ **W-3-상업용** | 이미 §97②2호 단서 구현됨 · 성질별 안분은 **해당 없음** | **조치 불요** | — |

🔑 **W-3의 절반은 「할 일 없음」으로 종결된다.** 조사 결과 상업용은 이미 갖춰져 있었다.

---

## §1 W-3 전수 조사 결과 (실측)

### 1.1 자산종류 × 축 매트릭스

| 자산종류 / 경로 | 필요경비 **도달** | **§97②2호 단서** | **성질별 안분 시점** |
|---|---|---|---|
| 일반건물 **실가** | ✅ P-3(#1121) | 해당 없음 — §97②**1호** 가산 | ✅ P-2(#1121) |
| 일반건물 **환산** | ✅ 기존(`ce846daa`) | ✅ `resolveGeneralBuildingSwap` | 🟠 **W-1a**(증축) |
| 부담부증여 **K-4** | ✅ W-4(#1122) | 해당 없음 — §97②1호 | ✅ W-5(#1123) |
| 부담부증여 **K-5** | ✅ | ✅ W-6(#1124) | ✅ W-5 헬퍼 공유 |
| 부담부증여 K-1~K-3 | **미도달이 정본**(§97②2호 본문 = 개산공제) | 해당 없음 | 해당 없음 |
| **상업용**(상가·오피스텔) | ✅ | ✅ **이미 구현**(`transfer-tax-commercial-step.ts:144-160`) | **해당 없음**(§1.3) |
| **겸용주택** | 🔴 **미지원**(§1.2) | — | — |

### 1.2 겸용주택 — **조용한 오류가 아니라 기능 결손이다**

실측(route POST, 겸용 실가 모드 · 총액 15억):

| 입력 | `total.aggregateIncome` |
|---|---|
| 비용 없음 | 270,000,001 |
| legacy `expenses` 4,000만 | **270,000,001**(동일) |
| `capitalExpenditure` 3,000만 + `transferExpense` 1,000만 | **270,000,001**(동일) |

⇒ **세 경로 모두 세액이 1원도 움직이지 않는다.**

**그런데 이것은 P-3과 다르다.** UI가 **의도적으로 칸을 숨기기** 때문이다:

```tsx
// components/calc/transfer/CompanionAssetCard.tsx:350-351
// 공통 자본적지출·양도비 입력은 숨김(겸용 엔진이 capex/transferExpense를 소비하지 않음)
{!(asset.assetKind === "housing" && asset.isMixedUseHouse) && ( … )}
```

| | P-3(일반건물 실가) | W-3(겸용주택) |
|---|---|---|
| 입력 칸 | **있다** | **없다**(숨김) |
| 사용자 인식 | 「넣었으니 반영됐겠지」 → **틀린 세액을 신뢰** | 「넣을 데가 없네」 |
| 성격 | 🔴 조용한 과대과세 | 🟠 기능 결손 |

「소득세법」 제97조 제1항 제2호·제3호는 겸용주택에도 당연히 적용되므로,
**자본적지출이 있는 겸용주택 보유자는 현재 이 계산기를 쓸 수 없다**.

> 🔑 **사용자 확인(2026-08-07)**: 「겸용주택도 공통 자본적지출 필요경비가 있을 수 있어,
> 해당 기능을 지원해야 돼」 ⇒ **구현 확정**. 「조용한 오류가 아니다」는 **성격 판정**이지
> **우선순위 하향 근거가 아니다** — 실사용에서 막히는 지점이다.

⚠️ **상속 모드에는 이미 있다** — `housingInheritedExpense`·`commercialInheritedExpense`
(`types/transfer-mixed-use.types.ts:250-261`, `splitDeemedExpense`로 **취득시** 비율 안분).
즉 **배관의 절반은 이미 깔려 있다** — 일반 모드로 넓히는 작업이다.

### 1.3 상업용 — **조치 불요**(성질별 안분은 애초에 대상이 아니다)

`transfer-tax-commercial-step.ts:144-160`이 §97②2호 단서를 **이미** 같은 교리로 구현한다:

```ts
const directSide = (input.capitalExpenditure ?? 0) + (input.transferExpense ?? 0);
const estimatedSide = cbStep.acquisitionPrice + cbStep.lumpSumDeduction;
const swapToDirect = swapEligible && directSide > estimatedSide;  // 동률은 본문
acquisitionPrice: swapToDirect ? 0 : cbStep.acquisitionPrice,      // 나목 채택 시 미차감
```

**성질별 안분 시점(W-5류)은 해당 없다** — 상업용은 `effectiveInput`을 **단일 자산**으로 재구성해
`calcTransferGain` 단건 경로를 타므로 **토지·건물로 나눌 축 자체가 없다**.
(`estimatedAcquisitionLand/Building` 분리는 `commercial-building-valuation.ts:396`의 **환산취득가액
산정 내부**용이고, 필요경비 슬롯은 단일 `lumpSumDeduction`이다.)

> ✅ **W-3의 상업용 축은 여기서 종결한다.** 재조사 금지 — 위 두 file:line이 근거다.

---

## §2 W-1 — 증축 경로의 **매듭**

### 2.1 현행

```ts
// lib/tax-engine/general-building-extension.ts:199-210 (조합 A/B — 원건물 실가)
const bundledExp = ext.actualBundledExpenses ?? 0;
landExp = Math.floor(safeMultiplyThenDivide(bundledExp, acqLandStdTotal, denom2));  // 🟠 취득시 비율
building1Exp = bundledExp - landExp;
```

### 2.2 🔴 성질 정보가 **fallback chain에서 지워진다**

```ts
// lib/calc/transfer-tax-api-gb.ts:272-275
bundledExpenses:
  parseAmount(asset.gbBundledAcquisitionExpenses)   // ① 일괄 취득 필요경비 (취득 성질)
  || parseAmount(asset.transferExpense)             // ② 🔴 양도비 (양도 성질!)
  || parseAmount(asset.directExpenses),             // ③ legacy 혼합
```

②가 채택되면 **양도비가 「일괄 취득 필요경비」 슬롯에 담겨 취득시 비율로 안분**된다.
`bundledExpenses`를 받는 쪽은 **그것이 어느 성질이었는지 알 방법이 없다**.

⇒ **W-5처럼 「성질별로 나누자」로 안 끝난다.** 나눌 성질 정보가 이미 소실됐다.

### 2.3 🔴 **W-1b — 양도비가 단서의 나목에서 빠진다**(세액 결함 가능)

```ts
// lib/calc/transfer-tax-api-gb.ts:284-289
// ⚠️ transferExpense는 **비-증축만**. 증축에서는 위 bundledExpenses legacy fallback으로
//    소비될 수 있어(F1) swap 나목에 재사용 시 이중차감 → 제외(decision b).
...(!asset.gbHasExtension && parseAmount(asset.transferExpense) ? { transferExpense: … } : {}),
```

증축(`gbHasExtension`)에서는 `transferExpense`가 **top-level payload에서 제외**된다.
그런데 §97②2호 단서의 **나목 = 자본적지출 + 양도비**다.

| 조합 | 원건물 취득 | 나목에 양도비 포함? | 문제 |
|---|---|---|---|
| A/B | **실가** | 불필요 — 나목은 환산 조합에서만 겨룬다 | 없음 |
| **C/D** | **환산** | 🔴 **빠진다** | **나목 과소 → 단서 미발동 가능(납세자 불리)** |

`decision b`의 「이중차감 회피」 논리는 **①·③이 채택된 경우**에는 맞지만,
**`gbBundledAcquisitionExpenses`가 입력돼 ①이 채택된 경우 `transferExpense`는 소비되지 않는다**
⇒ 그때는 제외할 이유가 없는데도 제외된다.

⚠️ **미검증**: 위 「C/D 조합에서 나목 과소로 단서가 뒤집히는가」는 **아직 실측하지 않았다**.
Phase 1이 그것부터 잰다.

---

## §3 Phase

```
Phase 1  🔴 W-1b 측정 — 증축 C/D 조합에서 양도비 제외가 단서 판정을 뒤집는가
              → verify: 뒤집는 케이스 실측 세액 차이. 0이면 W-1b는 문서화 후 종결
Phase 2  🟠 W-1a — bundledExpenses의 **성질 정보 보존**
              → verify: 양도비 성질로 들어온 값이 양도시 비율로 안분됨(anchor)
Phase 3  🔴 W-3-겸용 — 일반 모드 필요경비 지원 (**확정 요구사항**)
              → verify: 비용 입력이 세액을 움직인다(mutation probe) + UI 게이트 해제
```

⚠️ **순서를 바꾸지 말 것.**
- Phase 2를 먼저 하면 **성질 정보를 만들면서** 나목 구성도 함께 건드리게 되어
  W-1b의 원인이 「제외 결정」인지 「안분 시점」인지 **섞인다**.
- Phase 3은 W-1과 **독립**이라 순서를 바꿔도 되지만, **범위가 가장 크고**(⑤UI·⑫Zod·⑭route·
  ⑧validate + 엔진) 케이스 매트릭스(비과세·12억·배율초과)가 얽히므로 **별도 PR**로 낸다.
  W-1이 급하지 않다면 **Phase 3을 먼저 착수해도 된다** — 사용자 요구가 확정된 쪽이다.

### 3.1 Phase 1 — W-1b 측정 (선행)

1. 증축 C/D 조합(원건물 환산) 페이로드를 만든다 — `gbHasExtension: true` + 두 파트 환산.
2. `gbBundledAcquisitionExpenses`를 **입력한 상태**에서 `transferExpense`를 변화시킨다.
   (①이 채택되므로 `transferExpense`는 `bundledExpenses`로 소비되지 **않는다** ⇒ 이중차감 없음)
3. 나목이 가목을 넘는 경계 근처에서 **세액이 달라지는지** 본다.

**성공 기준**: 「양도비를 나목에 포함하면 단서가 발동하는데 현행은 미발동」인 케이스를
**하나라도** 실측하면 W-1b는 결함으로 확정 — 그 케이스를 anchor로 고정하고 고친다.
**0건이면** 「①이 채택된 경우에도 제외되는 것은 보수적 설계」로 문서화하고 종결한다.

⚠️ **`decision b`를 통째로 되돌리지 말 것** — ②·③ 채택 시의 이중차감은 실재한다.
고친다면 **①이 채택된 경우에만** `transferExpense`를 나목에 넣는 조건부여야 한다.

### 3.2 Phase 2 — 성질 정보 보존

**설계 후보 2안** (Phase 1 종료 후 택일):

| 안 | 방법 | 장점 | 단점 |
|---|---|---|---|
| **A** | `bundledExpenses`를 `{ capex, transferExp }` 객체로 확장 | 성질이 payload에 살아 있다 | ⑫Zod·⑬body·⑭route 전부 변경 |
| **B** | fallback chain에서 ②(`transferExpense`)를 **빼고**, 증축에서도 top-level로 보낸다 | 변경 최소 · W-1b와 한 번에 해결 | legacy 이력 호환 확인 필요(②에 의존하던 입력이 0이 된다) |

🔑 **B가 유력하다** — ②는 「이전 임시 매핑 호환」이라고 주석에 적혀 있어(`api-gb.ts:271`)
**설계 의도가 아니라 과도기 잔재**다. 다만 **기존 이력에서 ②로 소비되던 값이 사라지는지**
반드시 실측할 것(메모리 `feedback_new_asset_field_stale_sessionstorage_guard`).

### 3.3 Phase 3 — 겸용주택 필요경비

**범위(14 동기화 지점 중 해당분)**:

| # | 지점 | 작업 |
|---|---|---|
| ⑤ | `CompanionAssetCard.tsx:351` | 겸용 숨김 게이트 **해제** |
| ⑫ | mixedUse Zod 스키마 | `capitalExpenditure`·`transferExpense` 추가 |
| ⑭ | `route.ts` mixed-use 분기 | `calcMixedUseTransferTax` 인자로 전달 |
| 엔진 | `transfer-tax-mixed-use.ts` | 주택분·상가분 안분 후 각 part 필요경비로 차감 |
| ⑧ | `transfer-tax-validate.ts` | 겸용에서도 비용 입력 허용 |

🔑 **배관 절반은 이미 있다** — 상속 모드의 `housingInheritedExpense`·`commercialInheritedExpense`와
`splitDeemedExpense`(취득시 비율 안분)를 **재사용**한다. 신규 함수를 만들지 말 것.

⚠️ **안분 축이 둘이다**: ① 주택분↔상가분(면적·기준시가 비율) → ② 각 part 안의 토지↔건물.
`splitDeemedExpense`는 ②만 담당한다. ①은 `apportionAcquisitionPrice`(취득시 미러, `mixed-use.ts:221`)와
같은 축이어야 하고, **양도비는 양도시 축**이다(W-5 교리) — ①에서도 성질별로 갈린다.

⚠️ **비과세와의 상호작용**: 주택분이 1세대1주택 비과세면 그 부분 필요경비는 세액에 영향이 없다.
12억 초과 안분·배율초과 토지 분리까지 걸리므로 **케이스 매트릭스를 먼저 표로 만들 것**.

---

## §4 착수 조건 (Pre-Do)

- [ ] **Phase 1은 측정부터** — 결함 확정 전에 코드를 고치지 않는다
      (메모리 `feedback_numeric_impact_verify_before_bug_claim`)
- [ ] `decision b`(`api-gb.ts:284-289`)의 이중차감 시나리오를 **재현**해 두고 시작한다 —
      고치다가 그것을 되살리면 반대 방향 결함이다
- [ ] Phase 3 착수 시 **UI 게이트 해제가 다른 게이트를 닫지 않는지** 전체 E2E로 확인
      (메모리 `feedback_worktree_e2e_port_isolation` — 워크트리는 `E2E_PORT` 필수)

## §5 미결 (확인 필요)

| # | 항목 | 상태 |
|---|---|---|
| **V-1** | 증축 C/D 조합에서 양도비 제외가 **실제로 단서를 뒤집는가** | 🔴 **미측정** — Phase 1의 전부 |
| **V-2** | fallback ②에 의존하던 **기존 이력**이 존재하는가 | 🟡 미조사 — Phase 2 B안의 전제 |
| **V-3** | 겸용 필요경비를 주택분↔상가분에 나눌 때 **양도비 축**이 양도시가 맞는가 | 🟡 W-5 교리의 연장이나 겸용 고유 조문(§100② 후문 적용 범위) 재확인 필요 |
| **V-4** | 겸용 주택분이 **비과세**일 때 필요경비 처리 | 🟡 미조사 — 케이스 매트릭스에서 결정 |
