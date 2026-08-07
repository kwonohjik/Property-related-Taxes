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
| 🔴 **W-3-겸용** | 겸용주택에 **자산 단위 「공통」 비용** 입력 경로가 없다(파트별은 이미 있다 — §1.2 정정) | **기능 결손** — 사용자 확인(2026-08-07): 「겸용주택도 공통 자본적지출·필요경비가 있을 수 있어, 해당 기능을 지원해야 돼」 ⇒ **구현 확정** | **높음 — 범위 최대** |
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
| **겸용주택** | 🟠 **파트별만**(공통 입력 없음 — §1.2) | 미구현(비교 단위 미정 — 별건) | 🟠 파트 내부는 취득시 단일 |

### 1.2 🔴 **정정 (2026-08-07, 구현 착수 중 발견) — 「아예 지원하지 않는다」는 틀렸다**

초판은 겸용주택을 「자본적지출·양도비를 **아예 지원하지 않는다**」로 적었다. **틀렸다.**

**파트별 입력은 이미 있다**:

| 계층 | 근거 |
|---|---|
| ⑤ UI | `MixedUseAssetMajorStdPrice.tsx:195-204` — 「주택분 실제 필요경비 (선택)」 · 「자본적지출·양도비 (주택분)」(`isPurchaseActual` 조건). 상가분도 `:328` |
| ④ 변환 | `transfer-tax-api-mixed-use.ts:220-231` — `mixedHousingActualExpense` → `housingInheritedExpense` |
| ⑫ Zod | `transfer-tax-schema-mixed-use.ts:86-87` |
| 엔진 | `usesDeemedAcq`에 `useActualAcquisition` 포함 ⇒ 실가 모드도 소비 |

**내가 잰 Δ=0은 「자산 단위 필드」만 넣었기 때문**이다 — 관찰은 맞았고 **판정이 틀렸다**.
(방금 세운 메모리 `feedback_open_item_wording_is_also_unverified`의 함정을 그대로 반복했다.)

### 1.2.1 그래서 **진짜 결손은 무엇인가**

**주택분↔상가분으로 나눌 수 없는 「공통」 비용을 넣을 자리가 없다.**
건물 전체 리모델링·중개수수료처럼 성질상 공통인 지출은 사용자가 **손으로 나눠야** 하고,
나누는 비율의 근거를 사용자가 알 수 없다(취득시 기준시가 비율은 엔진만 안다).

> 🔑 **사용자 요구는 그대로 유효하다** — 「겸용주택도 **공통** 자본적지출 필요경비가 있을 수 있어,
> 해당 기능을 지원해야 돼」. 「공통」이 핵심이었다.

⇒ 작업 성격이 **「미지원 기능 신설」 → 「자산 단위 공통 입력 + 엔진 안분 추가」**로 바뀐다.
파트별 직접 입력은 **그대로 두고 우선**한다(§100② 후문은 「**공통되는**」 것만 안분하라고 한다).

### 1.2.2 자산 단위 필드 실측 (초판 그대로 — 관찰은 유효)

실측(route POST, 겸용 실가 모드 · 총액 15억, **자산 단위 필드만** 입력):

| 입력 | `total.aggregateIncome` |
|---|---|
| 비용 없음 | 270,000,001 |
| legacy `expenses` 4,000만 | **270,000,001**(동일) |
| `capitalExpenditure` 3,000만 + `transferExpense` 1,000만 | **270,000,001**(동일) |

⇒ **세 경로 모두 세액이 1원도 움직이지 않는다.**

**그런데 이것은 P-3과 다르다.** 자산 단위 칸은 UI가 **의도적으로 숨기고**, 파트별 칸은 따로 있기 때문이다:

```tsx
// components/calc/transfer/CompanionAssetCard.tsx:350-351
// 공통 자본적지출·양도비 입력은 숨김(겸용 엔진이 capex/transferExpense를 소비하지 않음)
{!(asset.assetKind === "housing" && asset.isMixedUseHouse) && ( … )}
```

| | P-3(일반건물 실가) | W-3(겸용주택) |
|---|---|---|
| 입력 칸 | 자산 단위 **있다** | 자산 단위 **없다**(숨김) · **파트별은 있다** |
| 사용자 인식 | 「넣었으니 반영됐겠지」 → **틀린 세액을 신뢰** | 「주택분/상가분으로 나눠 넣어야 하네」 |
| 성격 | 🔴 조용한 과대과세 | 🟠 **공통분 입력 경로 결손** |

「소득세법」 제97조 제1항 제2호·제3호는 겸용주택에도 적용되고 **파트별로는 이미 공제된다**.
막히는 것은 **나눌 수 없는 공통 비용**이다.

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

---

## §6 ✅ Phase 3 완료 (2026-08-07) — 겸용주택 **공통** 필요경비

### 6.1 무엇을 만들었나

**파트별 입력은 그대로 두고**, 자산 단위 「공통」 자본적지출·양도비를 받아 **엔진이 안분**한다.

```
자산 단위 capitalExpenditure / transferExpense
   ↓ §100② 후문 — 「공통되는 취득가액과 양도비용은 해당 자산의 가액에 비례하여」
주택분 ↔ 상가분          (자본적지출=취득시 축 · 양도비=양도시 축)
   ↓ 파트 내부
토지 ↔ 건물              (같은 성질별 시점)
```

🔑 **새 안분 축을 만들지 않았다** — 취득가액·양도가액 안분에 이미 쓰는
`apportionAcquisitionPrice`·`apportionTransferPrice`를 **그대로 재사용**한다.

🔑 **파트별 직접 입력이 우선한다** — 후문이 안분하라는 것은 「**공통되는**」 것뿐이다.
`resolvePartNecessaryExpense`(`transfer-tax-mixed-use-inheritance.ts`)가 그 갈래를 담당한다.

### 6.2 실측 — 두 축이 실제로 갈린다

fixture는 **취득시** 주택분 비중(0.6818)이 **양도시**(0.625)보다 크다. 같은 4,000만원이라도:

| 성질 | 축 | 주택분 배분 |
|---|---|---|
| 자본적지출 | 취득시 | **27,272,727** |
| 양도비 | 양도시 | **25,000,000** |

총액은 보존되고 파트 배분만 갈린다. **NBL(배율초과)은 주택분 양도차익에서 비율로 떼므로
자동 추종**한다(`gainSplit.landGain * nonBizRatio` — 별도 처리 불요).

### 6.3 범위에서 뺀 것 — 🆕 **W-8**

**겸용 환산 모드의 §97②2호 단서**(가목·나목 택일)는 미구현이다.
겸용은 **주택분·상가분·NBL 3파트**라 「가목 vs 나목」의 **비교 단위**를 먼저 정해야 한다
(파트별인가, 자산 전체인가). 근거 없이 정하면 안 되므로 별건으로 남긴다.

⇒ 환산 모드에서 공통 비용이 세액을 움직이지 않는 것은 **§97②2호 본문 정본**이고,
anchor(X4)가 그것을 **의도적으로** 고정한다 — 고치면 법령 위반이다.

### 6.4 게이트

| | 결과 |
|---|---|
| **mutation probe**(공통 안분분을 0으로) | anchor **4건 실패** |
| `npm test` | **1,274파일 14,258건 통과** — 회귀 **0** |
| **전체 E2E** | **919 통과** · 실패 12건은 전부 `law-*`(워크트리 `.env.local` 부재 → `KOREAN_LAW_OC` 서버 게이트. CI는 fixture mock으로 통과) |
| `tsc` · `lint` | **0** · **0 errors** |

⚠️ **UI 게이트를 열었으므로 전체 E2E를 돌렸다** — #1121에서 「항상 노출」이 다른 게이트를
닫아 E2E 2건이 깨진 전례가 있다. 겸용 자산 카드에 섹션 ④가 새로 생겼으나 회귀 0건.

### 6.5 신규 anchor

`__tests__/tax-engine/transfer-tax/mixed-use-common-expense.anchor.test.ts` (8건) —
**전제**(두 축이 실제로 다르다) · X1(세액으로 잰다·양쪽 배분·총액 보존) ·
X2(성질별 축 분리·정확값) · X3(**파트별 직접 입력 우선**, 대칭 2건) ·
**X4(환산 모드는 개산공제 정본 — 「안 움직인다」를 고정)**
## §7 ✅ Phase 1 완료 (2026-08-07) — **W-1b 결함 확정 · 수정**

### 7.1 측정 결과 — 가설보다 **직접적인** 결함이었다

§2.3은 「나목 과소 → 단서 **미발동** 가능」으로 적었다. 실측해 보니 단서는 **이미 발동**하고 있었고,
**나목 금액 자체가 과소**해 필요경비가 그만큼 덜 차감됐다.

증축 + 원건물 환산(C/D) · 자본적지출 8억 · 양도비 3억 · 전용 필드 `gbBundledAcquisitionExpenses` 500만:

| | 나목(directSide) | 결정세액 |
|---|---|---|
| **현행**(양도비 제외) | 800,000,000 | **215,663,940** |
| 정상(양도비 포함) | 1,100,000,000 | 93,701,660 |
| | | **과대 121,962,280** |

### 7.2 그런데 `decision b`의 우려도 **실재한다**

전용 필드를 **미입력**하면 fallback ②가 `transferExpense`를 채택해 `bundledExpenses`가 곧 양도비다.
그 상태에서 나목에도 넣으면 **같은 3억이 두 번** 반영된다:

| | 나목 | 결정세액 |
|---|---|---|
| 현행(제외) | 800,000,000 | 131,082,800 |
| 양도비도 나목 | 1,100,000,000 | **16,954,949**(과소 — 이중차감) |

⇒ **「무조건 제외」도 「무조건 포함」도 틀렸다.** `decision b`를 통째로 되돌렸으면 반대 방향 결함이 됐다.

### 7.3 수정 — **채택된 fallback 단계가 조건**이다

```ts
// transfer-tax-api-gb.ts
...((!asset.gbHasExtension || !!parseAmount(asset.gbBundledAcquisitionExpenses)) &&
parseAmount(asset.transferExpense) ? { transferExpense: … } : {}),
```

전용 필드가 입력되면 fallback이 **①에서 멈추므로** `transferExpense`는 소비되지 않는다 ⇒ 나목에 넣는다.
미입력이면 ②가 채택되므로 제외한다(현행 유지).

### 7.4 게이트

| | 결과 |
|---|---|
| **mutation probe**(무조건 제외로 되돌림) | anchor **3건 실패** |
| `npm run test:transfer` | **505파일 5,734건 통과** — 회귀 **0** |
| `tsc` | **0** |

### 7.5 신규·갱신 anchor

| 파일 | 건수 | 층위 |
|---|---|---|
| `general-building-extension-transfer-expense.anchor.test.ts` | 4 | **세액**으로 잰다 — ① 채택 시 121,962,280원 차이 · ② 채택 시 제외가 정본 · 비-증축 |
| `general-building-swap-api-wiring.test.ts` | 3(2건 재작성) | **배관** — 세 갈래를 payload로 고정 |

🔑 **두 층위를 모두 둔다** — 배관만 재면 소비 여부를 놓치고(P-3), 세액만 재면 어느 단계에서
빠졌는지가 안 보인다.

### 7.6 남은 것 — **W-1a는 그대로**

fallback ②가 채택되는 경우 **양도비가 「일괄 취득 필요경비」 슬롯에서 취득시 비율로 안분**되는
문제(§2.2)는 이번 수정으로 **해소되지 않았다**. 성질 정보가 여전히 소실된다.
Phase 2(§3.2 A안·B안)는 별도로 판단한다.
