# 일반건물 × 이월과세(§97의2) 배선 — 설계

**계획서**: [`docs/00-pm/transfer-gb-carryover-wiring.plan.md`](../../00-pm/transfer-gb-carryover-wiring.plan.md)
**작성**: 2026-08-10 · **상태**: 설계 — Q1 ✅확정(건물 포함), **Q2~Q4 미확정**. 구현 미착수.

---

## 전제

계획 §2·§3의 실측대로, 끊긴 곳은 **④ API 변환 한 곳**이다. UI(⑤)·Zod(⑫)·엔진 배선은
이미 있고, `landAcquisitionCause: "carryover_gift"`만 전달되고 서브객체가 없어
엔진 STEP 0.475의 조건(`acquisitionCause === "carryover_gift" && carryoverTaxation`)이
**조용히 불충족**된다.

---

## D1. ④ 배선 — `landCarryoverTaxation` 생성

`buildCarryoverPayload`가 만드는 객체는 **`landCarryoverTaxation` Zod 스키마와 필드가 이미 일치**한다
(`transfer-tax-building-schemas.ts:214~231` ↔ `transfer-tax-api-carryover.ts:67~82`).
새 변환기를 쓰지 않고 **같은 함수의 결과를 재사용**한다 — 두 벌을 만들면 드리프트한다.

```ts
// lib/calc/transfer-tax-api-gb.ts — buildGeneralBuildingValuation 안,
// landAcquisitionCause를 싣는 자리(:394~397 · :530~532) 바로 옆
...(asset.acquisitionCause === "carryover_gift"
  ? (() => {
      const cp = buildCarryoverPayload(asset, transferDate);
      return cp ? { landCarryoverTaxation: cp.carryoverTaxation } : {};
    })()
  : {}),
```

### D1-1. 🔴 두 진입점 **모두** 고쳐야 한다

`landAcquisitionCause`를 싣는 곳이 **두 군데**다 — 환산 경로(`:394`)와 실가 경로(`:530`).
한쪽만 고치면 **모드에 따라 이월과세가 켜졌다 꺼졌다** 한다. 계획 §7 K-01을 두 모드로 각각 건다.

### D1-2. top-level `carryoverTaxation`은 **그대로 둔다**

`transfer-tax-api-helpers.ts:660`이 만드는 top-level 값은 비-GB 자산이 쓴다. 제거하면 그쪽이 깨진다.
GB에서는 route가 읽지 않으므로 **무해한 중복**이다 — 다만 「같은 사실이 두 키로 간다」는 점을
주석으로 남겨, 나중에 top-level을 지우려는 사람이 GB를 함께 보게 한다.

---

## D2. 결정 대기 지점 (계획 §6) — 설계상 어디에 꽂히는가

| Q | 상태 | 설계 반영 지점 |
|---|---|---|
| **Q1** 건물 파트 | ✅ **확정 — 건물 포함 · 하이브리드 입력** (계획 §6 Q1) | **D9** |
| **Q2** 환산 모드 | 🟡 미확정 | `topLevelOverrides.standardPrice*`를 GB 파트 기준시가로 어떻게 옮길지. 그대로 태우면 **증여자 기준시가가 무시**될 수 있다(미검증) |
| **Q3** 지분 스케일 | 🟡 미확정 | `applyShareScale` 목록에 금액 필드 추가 여부. GBF-27 anchor와 **정면 충돌** 가능 |
| **Q4** 부담부증여 | 🟡 미확정 | `transferType === "burdened_gift"` 시 이 배선을 끄는가. §159가 취득가액을 삼키는 축과 **이중 적용** 위험 |

---

## D3. ⑦ 결과 카드 — **렌더되지 않는다** (실측 확인)

`CarryoverComparisonCard`는 두 곳에서만 렌더된다:

- `TransferTaxResultView.tsx:379` — `result.carryoverTaxationDetail`
- `ValuationDetailCards.tsx:118` — `result.carryoverTaxationDetail`

둘 다 **단건 `TransferTaxResult`의 top-level 필드**를 읽는다. 그런데 GB는 `mode: "bundled"`로
`aggregated`를 돌려주고, 이월과세 명세는 **`aggregated.properties[].carryoverTaxationDetail`**
(파트별)에 실린다 — 지분 anchor GBF-27에서 실측한 위치다.

⇒ **④만 고치면 세액은 맞지만 「왜 이 세액인가」가 화면에 뜨지 않는다.**
비교과세는 두 시나리오 중 큰 쪽을 택하는 구조라, 근거 미표시는 납세자가 검산할 수 없다는 뜻이다.

선택지:

| 안 | 내용 |
|---|---|
| **가** | aggregate 결과에 top-level `carryoverTaxationDetail`을 **hoist**(파트가 1개일 때만) — 기존 카드 재사용 |
| **나** | `ValuationDetailCards`가 `aggregated.properties[]`를 순회해 파트별로 카드를 렌더 — 지분 분할까지 자연히 대응 |

**나**를 권한다. 가는 파트가 2개 이상(토지+건물, 지분 분할)이면 어느 하나만 보여주게 되어
「표시가 실제와 어긋나는」 방향이다(메모리 `feedback_engine_result_display_drift`).
다만 카드 제목에 **파트·지분 라벨**을 붙여야 한다.

---

## D4. ⑥ 사이드바 — 이월과세 특유 문제가 **아니다**

`computeTransferSummary`의 취득가액 override는 `result?.mode === "single"` 조건이 붙어 있다
(`calc-wizard-store.ts:714~717`). **bundled(GB)는 애초에 폼 입력 기반 값을 유지**한다.

⇒ 이월과세로 엔진 취득가액이 증여자 취득가액으로 바뀌어도 사이드바는 따라오지 않지만,
그것은 **환산·상속 등 bundled 전 모드에 공통인 기존 성질**이다. 이번 작업의 회귀가 아니므로
**범위 밖으로 기록만** 한다(Surgical Changes).

---

## D5. ⑧ validate 설계

현재 GB 경로에 이월과세 검증이 **0건**이라, 「이월과세(증여)」를 고르고 아무것도 입력하지 않아도
계산이 진행된다. 배선 후에는 **빈 값이 엔진에 도달**하므로 차단이 필요하다.

`buildCarryoverPayload`가 `giftRegistryDate`·`donorAcquisitionDate` 둘 중 하나라도 비면
`undefined`를 돌려준다(`:45`) ⇒ 배선해도 **조용히 미발동**으로 되돌아간다. 이것이 가장 위험한
실패 모드다 — 사용자는 입력했다고 믿는데 세액이 안 바뀐다.

⇒ validate가 **`buildCarryoverPayload`와 같은 조건**을 검사해야 한다(메모리
`feedback_shared_predicate_argument_parity` — 술어 공유는 인자 동일성까지).

필수 판정 (필드명은 **D9-2** 기준 · Q2 확정 후 환산 항목 확정):

| 단위 | 조건 | 메시지 |
|---|---|---|
| 사건 | `giftRegistryDate` 미입력 | 증여 등기접수일을 입력하세요 (법 §97의2③ 적용기간 기산일) |
| 사건 | `giftTaxCalculated` 미입력 | 증여세 산출세액을 입력하세요 (영 §163의2②1호) |
| 사건 | `giftTaxBase` 미입력 또는 0 | 증여세 과세가액을 입력하세요 (영 §163의2②3호 — 안분 분모) |
| **사건** | Σ 파트 `giftDateAssetValue` **>** `giftTaxBase` | 파트별 증여 당시 평가액 합계가 증여세 과세가액을 넘습니다 |
| 파트 | `donorAcquisitionDate` 미입력 | 증여자의 취득일을 입력하세요 (법 §95④ 보유기간 기산일) |
| 파트 | `giftDateAssetValue` 미입력 | 증여 당시 평가액을 입력하세요 (안분 분자 + 비교과세 B 취득가액) |
| 파트 | 환산 미사용 + `donorAcquisitionPrice` 미입력 | 증여자의 취득가액을 입력하세요 |
| 파트 | 환산 사용 + `estimationMode === null` | 환산 방식을 선택하세요 |

> 🔑 **Σ 검증이 새로 필요하다.** 안분 분모가 사용자 입력이라, 분자 합이 분모를 넘으면
> 증여세 상당액 합계가 산출세액을 초과한다. 엔진이 막아주지 않으므로 ⑧에서 잡는다.

> ⚠️ **UI에서 보이는 칸만 요구한다.** GB 지분 카드처럼 숨긴 칸을 요구하면 ⑧ 모순이 된다
> (PR #1161의 「자산 2: 토지면적을 입력하세요」 재발).

---

## D6. anchor 설계

| 케이스 | anchor 위치 | 판정 방식 |
|---|---|---|
| K-01 (환산·실가 **두 모드**) | `__tests__/calc/` ④ 변환 | payload에 `landCarryoverTaxation`이 실리는가 + **양성 대조군**: 미선택 시 미존재 |
| K-02·K-03·K-05·K-06 | `__tests__/api/` route | 세액·`transferGain`·LTHD **차분**. GBF-27이 쓴 축(48,200,000 → 128,000,000)과 같다 |
| K-04 배제선언 | route | 배제 ON/OFF로 결과가 갈리는가 |
| **K-07** 건물만 이월과세 | route | 건물 카드만 움직이고 **토지는 불변**. 양성 대조군은 K-08 |
| **K-08** 토지+건물 둘 다 | route | 두 카드가 **각자 자기 증여자 취득가액**으로. 값이 같으면 한쪽이 다른 쪽을 덮은 것 |
| **K-09** 증여세 안분 | 산정 leaf 단위 + route | `floor(산출세액 × 자산가액 ÷ 과세가액)` **원 단위**. Σ ≤ 산출세액 |
| **K-10** 안분 한도 | leaf | 한도 초과 파트가 절사되는가 + **미초과 대조군** |
| **K-11** 파트별 증여자 취득일 | route | 같은 양도차익에서 LTHD만 갈린다(GBF-24와 같은 판정 방식) |
| K-12 회귀 | route | 미선택 GB가 **원 단위 동일** |
| K-13 validate | `__tests__/calc/` | 빈 칸 차단 + **Σ 초과 차단** + UI에 있는 칸만 요구 |
| K-16 결과 카드 | `__tests__/components/` | 파트별 카드 2장 + 라벨. **단건 대조군** |
| K-17 **E2E** | `e2e/` | 폼 입력 → 세액 변화 + 비교과세 카드 노출 |

### 🔑 K-17이 이 작업의 핵심이다

계획 §2 ③이 「200 OK · 오류 없음 · 세액 그대로」였다. vitest만으로는 그 상태를 **통과시킬 수 있다** —
payload를 손으로 만들면 이미 `landCarryoverTaxation`이 들어 있기 때문이다.
**폼에서 그 payload가 만들어지는지**는 E2E만 본다(PR #1161 교훈).

E2E는 **mutation probe**로 검증한다 — D1 배선을 되돌리면 K-17이 실패해야 한다.
실패하지 않으면 그 E2E는 아무것도 지키지 않는 것이다.

---

## D7. 회귀 위험

| 위험 | 완화 |
|---|---|
| 비-GB 자산의 이월과세가 깨진다 | top-level `carryoverTaxation`을 **건드리지 않는다**(D1-2). 기존 carryover 테스트 스위트(`__tests__/tax-engine/transfer-tax/carryover-*.test.ts` 10+파일) 전건 통과 확인 |
| GB 상속·증여 경로가 흔들린다 | `landAcquisitionCause` 분기 **옆에** 추가만 한다. 기존 분기 미변경 |
| 지분 분할과 교차 | Q3 확정 전에는 **지분 + 이월과세 조합을 차단**하는 편이 안전하다 — 조용히 틀린 값보다 낫다 |
| 부담부증여와 이중 적용 | Q4. 그쪽 줄기 착지 후 교차 |

---

## D8. 규모 — Q1 확정 후 **D9-7** 참조

Q1이 「건물 포함」으로 확정되어(2026-08-10) 규모가 토지만(≈415줄)에서 **≈1,150줄**로 늘었다.
내역은 D9-7.

---

## D9. 건물 파트 지원 — 확정 설계 (Q1)

### D9-1. 왜 「전부 파트별」도 「전부 자산 단위」도 아닌가

「소득세법 시행령」 §163의2②가 **증여세 상당액만** 안분 산식을 둔다. 나머지(증여자 취득일·
취득가액·증여 당시 자산가액)는 **원래 자산별로 존재**하므로 안분할 대상이 아니다.
⇒ 입력 단위를 필드마다 다르게 잡는 것이 법 구조에 맞다(계획 §6 Q1 표).

### D9-2. 타입 — 자산 단위 / 파트 단위 분리

```ts
// lib/stores/calc-wizard-asset-carryover.ts (신설)

/** 하나의 증여 사건에 대한 사실 — 파트로 나뉘지 않는다. */
export interface CarryoverGiftEventForm {
  giftRegistryDate: string;        // §97의2③ 등기접수일
  giftTaxCalculated: string;       // 영 §163의2②1호 증여세 **산출세액**
  giftTaxBase: string;             // 영 §163의2②3호 증여세 **과세가액**(상증법 §47)
  exclusionDeclared: CarryoverExclusionDeclared;
}

/** 파트(토지·건물)마다 따로 있는 사실. */
export interface CarryoverPartForm {
  donorAcquisitionDate: string;    // 법 §95④
  donorAcquisitionPrice: string;   // 법 §97의2①1호
  donorCapitalExpenditure: string; // 법 §97의2①2호 (2024.1.1. 이후 양도분)
  giftDateAssetValue: string;      // 영 §163의2②2호 — 안분 **분자** + 비교과세 B 취득가액
}
```

> 🔑 **`giftDateAssetValue`가 두 역할을 겸한다** — ①영 §163의2②2호의 안분 분자, ②비교과세
> 시나리오 B(이월과세 미적용)의 취득가액. 둘 다 「증여 당시 그 자산의 상증법 평가액」이라
> **같은 값이 맞다**. 두 칸으로 나누면 사용자가 다른 값을 넣어 모순이 생긴다.

### D9-3. 증여세 상당액 — 엔진이 산정한다

```
파트별 증여세 상당액 = floor(증여세 산출세액 × 파트 giftDateAssetValue ÷ 증여세 과세가액)
한도(영 §163의2② 후단) = 그 파트의 양도가액 − 법 §97①·② 금액
```

- **정수 연산** — `applyRate`/`safeMultiplyThenDivide` 사용. `Math.round()` 금지.
- **한도 단위는 미확정**(계획 §6 Q1 「남은 세부」) — 문언 「필요경비로 산입되는 증여세 상당액」이
  산입 단위(=파트)로 읽히지만 **확인 필요**. 착수 전 예규 조사 대상.
- 🔴 **사용자에게 안분을 시키지 않는다.** 시키면 검산이 불가능하고, 두 파트 합이 산출세액을
  넘는 입력도 막을 수 없다.

### D9-4. 기존 `giftTaxAmount`는 **건드리지 않는다**

`CarryoverTaxationForm.giftTaxAmount`는 「이미 안분된 증여세 상당액(사용자 입력)」이고
**비-GB 자산 전 경로**가 쓴다. GB에서 의미를 재정의하면 그 경로가 함께 흔들린다
(메모리 — 입력 단위가 다르면 **재정의가 아니라 신설**).

⇒ GB는 위 신설 타입을 쓰고, 엔진에는 **산정 결과**를 기존 `carryoverTaxation.giftTaxAmount`
자리에 넣어 넘긴다. 엔진 시그니처 변경 0 — 계산 규칙은 이미 구현돼 있다.

### D9-5. 엔진 배선

```ts
// lib/tax-engine/general-building-valuation.ts
// 건물 카드에도 토지와 **같은 축**으로 추가
buildingAcquisitionCause: input.buildingAcquisitionCause,
carryoverTaxation: input.buildingCarryoverTaxation,   // 🆕
```

`buildProperties`(`general-building-route-cards.ts:101~110`)의 **건물 분기**는 지금
`acquisitionCause`·`decedent/donorAcquisitionDate`만 넘기고 `carryoverTaxation`을 안 넘긴다
(토지 분기 `:121~123`에만 있다). **여기도 함께** 고쳐야 한다 — 안 고치면 엔진 카드에는 실리는데
단건 엔진 input에서 사라진다(⑭ 침묵 strip).

### D9-6. UI

- `BUILDING_CAUSE_OPTIONS`(`GeneralBuildingAcquisitionCards.tsx:59~64`)에 `carryover_gift` 추가.
- **증여 사건 카드**(자산 1개) — 등기접수일·산출세액·과세가액·배제선언. 토지/건물 카드 **바깥**.
- **파트별 4칸** — 각 취득 카드(토지 amber / 건물 amber) 안.
- 🔴 **토지·건물 취득원인이 둘 다 `carryover_gift`일 때만** 증여 사건 카드를 1개로 공유한다.
  한쪽만 이월과세면 그 파트만 파트 입력을 띄우되 증여 사건 카드는 그대로 1개다.
- 계산 순서 = 표시 순서: 증여 사건 → 파트별 (UI 원칙).

### D9-7. 규모 재산정

| 항목 | 규모 |
|---|---|
| ① ② ③ 폼 타입·기본값·마이그레이션 | ~60줄 |
| ④ 변환 (환산·실가 2진입점 + 증여세 안분 호출) | ~50줄 |
| ⑤ UI (증여 사건 카드 + 파트 4칸 × 2) | ~180줄 |
| ⑦ 파트별 비교과세 카드 (D3) | ~40줄 |
| ⑧ validate | ~70줄 |
| ⑨⑫ Zod (`buildingCarryoverTaxation` + 사건 필드) | ~40줄 |
| 엔진 (건물 카드 배선 + `buildProperties` 건물 분기) | ~20줄 |
| 증여세 안분 leaf + anchor | ~120줄 |
| anchor (K-01~K-16) | ~450줄 |
| E2E (K-17) | ~120줄 |

**합계 ≈ 1,150줄.** 토지만(안 C, ~415줄)의 **약 3배** — 계획 초판의 추정과 일치한다.
