# 일반건물 × 이월과세(§97의2) 배선 — 설계

**계획서**: [`docs/00-pm/transfer-gb-carryover-wiring.plan.md`](../../00-pm/transfer-gb-carryover-wiring.plan.md)
**작성**: 2026-08-10 · **상태**: 설계 — **착수 조건(계획 §6 Q1~Q4) 미충족**. 구현 미착수.

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

| Q | 설계 반영 지점 | 미확정이면 생기는 일 |
|---|---|---|
| **Q1** 건물 파트 | 안 A → `buildingCarryoverTaxation` 신설 + 엔진 건물 카드 배선 + `BUILDING_CAUSE_OPTIONS`에 옵션 추가 / 안 B → route에서 파트 안분 / 안 C → 현행 유지 + 차단 안내 | 안 A·B는 **엔진 변경**까지 가고 안 C는 ④만 고친다 — **규모가 3배 차이** |
| **Q2** 환산 모드 | `topLevelOverrides.standardPrice*`를 GB 파트 기준시가로 어떻게 옮길지 | 그대로 태우면 **증여자 기준시가가 무시**될 수 있다(미검증) |
| **Q3** 지분 스케일 | `applyShareScale` 목록에 4필드 추가 여부 | GBF-27 anchor와 **정면 충돌** 가능 |
| **Q4** 부담부증여 | `transferType === "burdened_gift"` 시 이 배선을 끄는가 | §159가 취득가액을 삼키는 축과 **이중 적용** 위험 |

> ⚠️ **Q1이 안 C(토지만)로 정해지면** 이 설계는 D1 + D5 + anchor만으로 끝난다.
> 안 A·B면 엔진·타입·UI까지 번지므로 **별도 설계 라운드**가 필요하다.

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

필수 판정(초안 — Q1~Q2 확정 후 확정):

| 조건 | 메시지 |
|---|---|
| `giftRegistryDate` 미입력 | 증여 등기접수일을 입력하세요 (§97의2① 적용기간 기산일) |
| `donorAcquisitionDate` 미입력 | 증여자의 취득일을 입력하세요 (§95④ 보유기간 기산일) |
| `giftDateValuation` 미입력 | 증여 당시 평가액을 입력하세요 (비교과세 시나리오 B 취득가액) |
| 환산 미사용 + `donorAcquisitionPrice` 미입력 | 증여자의 취득가액을 입력하세요 |
| 환산 사용 + `estimationMode === null` | 환산 방식을 선택하세요 |

> ⚠️ **UI에서 보이는 칸만 요구한다.** GB 지분 카드처럼 숨긴 칸을 요구하면 ⑧ 모순이 된다
> (PR #1161의 「자산 2: 토지면적을 입력하세요」 재발).

---

## D6. anchor 설계

| 케이스 | anchor 위치 | 판정 방식 |
|---|---|---|
| K-01 (환산·실가 **두 모드**) | `__tests__/calc/` ④ 변환 | payload에 `landCarryoverTaxation`이 실리는가 + **양성 대조군**: 미선택 시 미존재 |
| K-02·K-03·K-05·K-06 | `__tests__/api/` route | 세액·`transferGain`·LTHD **차분**. GBF-27이 쓴 값(48,200,000 → 128,000,000)과 같은 축 |
| K-04 배제선언 | route | 배제 ON/OFF로 결과가 갈리는가 |
| K-07 음성(건물 불변) | route | **양성 대조군 필수** — 토지가 변하는 것을 같은 스펙에서 확인 |
| K-08 회귀 | route | 미선택 GB가 **원 단위 동일** |
| K-09 validate | `__tests__/calc/` | 빈 칸 차단 + **UI에 있는 칸만** 요구 |
| K-12 **E2E** | `e2e/` | 폼 입력 → 세액 변화 + 비교과세 카드 노출 |

### 🔑 K-12가 이 작업의 핵심이다

계획 §2 ③이 「200 OK · 오류 없음 · 세액 그대로」였다. vitest만으로는 그 상태를 **통과시킬 수 있다** —
payload를 손으로 만들면 이미 `landCarryoverTaxation`이 들어 있기 때문이다.
**폼에서 그 payload가 만들어지는지**는 E2E만 본다(PR #1161 교훈).

E2E는 **mutation probe**로 검증한다 — D1 배선을 되돌리면 K-12가 실패해야 한다.
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

## D8. 예상 규모 (Q1 = 안 C 기준)

| 항목 | 규모 |
|---|---|
| ④ `transfer-tax-api-gb.ts` 2곳 | ~15줄 |
| ⑦ `ValuationDetailCards` 파트별 렌더 | ~30줄 |
| ⑧ validate | ~40줄 |
| anchor | ~250줄 |
| E2E | ~80줄 |

**Q1이 안 A·B면 엔진·타입·UI가 추가되어 규모가 3배 이상**이 된다. 그래서 Q1이 착수 조건 1번이다.
