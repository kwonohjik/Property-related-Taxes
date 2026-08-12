# 부담부증여 기준시가 모드 — 「취득시 기준시가」 입력 경로 부재 (O-1)

- 작성일: 2026-08-12
- 발단: `burdened-gift-valuation-std-price-calculator.plan.md` §5.1 별건 관측 → 본 계획서에서 실측 확정
- 성격: **세액 과대 산출 결함**(사용자 불리). UI 입력 경로 부재 + validate 공백의 조합
- 상태: ✅ **완료·머지(2026-08-12, PR #1227)** — P1~P4 + O-2. **O-3는 조사 결과 제품 결함 아님**(§9.2)

---

## 1. 결함 (수치로 확정)

부담부증여 **기준시가 모드**(`sangjeungbeop_standard`)에서 취득가액은
「취득시 기준시가 × 채무비율」로 산정된다(소령 §159①1호 A괄호). 그런데 그 **취득시 기준시가를
입력할 화면이 없다** — `housing`·`building`에서 실측 확인했다.

### 1.1 [실측] 엔진 수치 — `buildBurdenedGiftBreakdown` 직접 호출

조건: 양도시 기준시가 10억 · 채무 5억(보증금 3억 + 차입금 2억) → 채무비율 0.5

| 취득시 기준시가 | 취득가액 | 개산공제 | 양도가액 |
|---|---|---|---|
| **0** (= 현행 UI에서 도달하는 값) | **0** | **0** | 500,000,000 |
| 500,000,000 (입력할 수 있다면) | 250,000,000 | 7,500,000 | 500,000,000 |

⇒ **양도차익이 257,500,000원 과대**해진다(취득가액 2.5억 + 개산공제 750만). 누진세율 구간에
따라 세액 수천만~1억 원대 과대. 화면에는 아무 경고도 뜨지 않는다.

### 1.2 [코드] 왜 0이 되는가

`lib/tax-engine/burdened-gift-apportionment.ts:206-209`

```
landAcquisitionPrice     = apportionAcquisitionPrice(landStdPriceAtAcquisition, 채무액, giftValuation.max)
buildingAcquisitionPrice = apportionAcquisitionPrice(buildingStdPriceAtAcquisition, 채무액, giftValuation.max)
```

그 입력은 `lib/calc/transfer-tax-api-burdened-gift.ts:214`가 채운다:

```
buildingStdPriceAtAcquisition: parseAmount(primary.standardPriceAtAcq) || 0
```

⇒ 폼 필드 `standardPriceAtAcq`가 비면 **0이 그대로 엔진에 실린다.**

---

## 2. [실측] 입력 경로가 없다 — 판별 방법과 대조군

### 2.1 방법

`standardPriceAtAcq`에 마커 값(500,000,000)을 sessionStorage로 심고, 자산 카드 ①②③을 모두
펼친 뒤 **그 값을 표시하는 input이 있는지** 본다. controlled input이므로 입력 경로가 있으면
반드시 화면에 그 값이 보인다.

### 2.2 🔴 첫 대조군이 무의미했다 (방법론 기록)

처음에는 대조군을 「일반 양도(`regular`)」로 잡았는데 **거기서도 "없음"** 이 나왔다.
일반 양도는 취득시 기준시가를 **환산취득가 모드에서만** 요구하므로(`CompanionAcqPurchaseBlock.tsx:545`
`props.useEstimatedAcquisition` 게이트) 기본 모드에서 칸이 없는 것이 정상이다.

⇒ 그 상태로 진행했다면 실험군의 "없음"도 **무의미한 관측**이었다. 대조군을
`regular + useEstimatedAcquisition: true`로 고쳐 판별력을 확보했다.

### 2.3 결과

| 조건 | 취득시 기준시가 입력칸 |
|---|---|
| **대조군** `regular` + 환산 모드 · housing | ✅ 있음 |
| **대조군** `regular` + 환산 모드 · building | ✅ 있음 |
| 대조군 `regular` + 환산 모드 · commercial_building | ❌ 없음 (별도 경로 — §4 미판정) |
| **실험군** `burdened_gift` · housing × 매매·상속·증여 | ❌ **없음** |
| **실험군** `burdened_gift` · building × 매매·상속·증여 | ❌ **없음** |
| 실험군 `burdened_gift` · commercial_building × 3원인 | ❌ 없음 (대조군도 없어 판정 불가) |
| 실험군 `burdened_gift` + `useEstimatedAcquisition: true` (housing·building) | ❌ **없음** — 플래그를 켜도 안 열린다 |

### 2.4 [코드] 원인 — 게이트 두 겹

`CompanionAcqPurchaseBlock.tsx:366`이 블록 본문 전체를 감싼다:

```
{props.asset?.transferType !== "burdened_gift" && props.asset?.assetKind !== "redevelopment_apt" && ( … )}
```

취득시·양도시 기준시가 입력이 **그 안에** 있으므로 부담부증여에서는 통째로 사라진다.
대신 안내 카드(`:327-343`)가 뜨는데, 그 문구가 사실과 다르다:

> ※ 산식에 필요한 **취득시 기준시가**는 위 '양도 정보 — 인수 채무' 카드 및 토지 면적·공시지가
> 입력에서 **자동 도출**됩니다.

「양도 정보」 카드에는 **양도시** 기준시가만 있다(`AssetSectionTransfer.tsx` — 앞 계획서 §2.3-a 실측).
`housing`·`building`에는 취득시를 도출할 소스가 없다. **이 문구가 결함을 가려 왔다.**

### 2.5 [코드] validate도 잡지 않는다

`lib/calc/transfer-tax-validate-bg.ts:118-128`의 취득시 기준시가 검사는
**시가 모드의 K-5 환산 경로 전용**이다(`acqMethod === "converted"`). 기준시가 모드(K-1~K-3)에는
대응 검사가 없다.

⇒ 입력 경로도 없고 차단도 없다 → **조용히 0으로 계산**된다.

---

## 3. 왜 기존 테스트가 못 잡았나

부담부증여 엔진 anchor는 `BurdenedGiftInfo`에 기준시가를 **직접 주입**해 계산한다
(`general-building-burdened-gift-actual-mode.test.ts` 등). 엔진은 옳으므로 전부 통과한다.

즉 이 결함은 **엔진과 UI 사이의 배관**에만 있다 — `feedback_api_trigger_without_input_path_is_noop`가
경고하는 구조의 변형이다(트리거는 열려 있는데 입력 UI가 없어 값이 도달하지 않는다).

---

## 4. 영향 범위

| assetKind | 상태 | 근거 |
|---|---|---|
| `housing` | 🔴 **결함 확정** | §2.3 실측 · API가 `standardPriceAtAcq`를 읽는다(:214) |
| `building` | 🔴 **결함 확정** | 동상 |
| `commercial_building` | 🔴 **결함**(판정 근거는 코드) | 대조군(환산 모드)에도 칸이 없어 마커 판별은 불가했다. 그러나 API 주석이 명시한다 — 「cb*·호별고시가는 **환산취득가 전용** — 부담부증여 모드에서는 사용자가 `standardPriceAtTransfer` / `standardPriceAtAcq`에 **직접 입력**」(`transfer-tax-api-burdened-gift.ts:205-208`). 그 「직접 입력」 칸이 없다 |
| `general_building` | ✅ 정상 | `gbAcqLandPricePerSqm`·`gbAcqBuildingValue` 전용 입력이 있고 API가 그것을 쓴다(:169-180) |
| `land` | 🔴 **결함 확정** | P0 실측 — 대조군(일반 양도 + 환산) 총액·단가 칸 **모두 ○**, 부담부증여 **모두 ✗** |

---

## 5. 착수 전 결정이 필요한 항목

| # | 항목 | 왜 먼저 정해야 하나 |
|---|---|---|
| **D-1** | 입력칸 위치 | ✅ **(a) 확정** — ② 양도정보의 「양도시 기준시가」 **바로 아래**. 두 기준시가가 나란히 놓여 비율 검증이 한눈에 되고, 계산 로직 순서(양도시 → 채무비율 → 취득가액)와 일치한다. ③ 취득정보의 안내문은 「② 양도정보에서 입력합니다」 **포인터로 수정**(입력칸을 옮기지는 않는다) |
| **D-2** | 기준시가 모드 validate | ✅ **차단 채택** — 「자동 안분 fallback 금지 · 미입력은 검증 오류로 차단」이 프로젝트 원칙(루트 CLAUDE.md)이고, 0은 세액을 크게 과대 산출한다. ⚠️ **전체 E2E 회귀 필수**(`feedback_blocking_validation_full_e2e_regression`) — 기준시가 모드 부담부증여 spec들이 이 값을 안 넣고 계산까지 가면 실패한다. 그 실패는 **결함이 드러난 것**이므로 spec을 고친다 |
| Q-1 | `commercial_building` | ✅ 해소 — API 주석이 「직접 입력」을 전제(§4). 대상 |
| Q-2 | `land` | ✅ 해소 — P0 실측으로 결함 확정(§4). 대상 |
| Q-3 | ③ 안내 문구 | ✅ 「② 양도정보에서 입력합니다」 포인터로 수정. `general_building`만 종전 「자동 도출」 유지(그쪽은 참이다) |

### 5.1 대상 자산 4종 — 위젯이 자산마다 다르다

`land`는 API가 `standardPriceAtAcq` **또는** `standardPricePerSqmAtAcq × acquisitionArea`를 쓴다
(:186-195). ⇒ 취득시 칸도 **양도시 칸과 같은 위젯**(`StandardPriceInput`)을 써야 자산별 분기
(총액 모드 / 단가×면적 모드)가 자동으로 맞는다. 새 위젯을 만들면 그 분기를 복제하게 된다.

> 🛑 **D-1·D-2가 정해지기 전에는 코드를 건드리지 않는다.** 입력칸 위치는 되돌리기 비싼 결정이고
> (14 동기화 지점 중 ⑤⑧이 함께 움직인다), validate 추가는 회귀 범위가 전체 E2E로 번진다.

---

## 6. 구현 방향 (D-1 확정 후)

엔진·API·Zod는 **무변경**이다. `standardPriceAtAcq`는 이미 폼(①②③)·API(④)·엔진까지 배선돼 있고
(앞 계획서 §2.1과 같은 구조), **⑤ UI 위젯만 없다.**

```
P0. Q-1·Q-2 실측 → 대상 자산 확정          → verify: probe(§2.1 방법 + 유효 대조군)
P1. D-1 위치에 입력칸 추가 (대상 자산 게이트) → verify: anchor(자산별 노출/미노출 전수)
P2. ③ 안내 문구 자산별 분기 (Q-3)          → verify: anchor
P3. (D-2 채택 시) validate + 전체 E2E 회귀   → verify: npx playwright test (전건)
P4. 수치 회귀                              → verify: §1.1 표를 anchor로 고정
```

---

## 7. 테스트 계획

### anchor — 입력 경로 실재

| # | 케이스 | 단언 |
|---|---|---|
| I-1 | `housing`·`building` + 부담부증여 + 기준시가 모드 | 취득시 기준시가 입력칸 **렌더** |
| I-2 | `general_building` | **미렌더**(전용 경로가 이미 있다 — 중복 입력 금지) |
| I-3 | 시가 모드 | 미렌더(K-4/K-5가 별도 축을 쓴다) |
| I-4 | 🔴 구별력 | I-1의 칸에 값을 넣으면 `standardPriceAtAcq`가 바뀐다(다른 필드에 쓰면 무의미) |

### 엔진 수치 anchor

| # | 케이스 | 단언 |
|---|---|---|
| N-1 | 취득시 기준시가 5억 · 채무비율 0.5 | 취득가액 250,000,000 · 개산공제 7,500,000 |
| N-2 | 0 | 취득가액 0 (현행 동작 고정 — 회귀 감시용) |

### E2E

부담부증여 `housing`으로 입력 → 계산 → 결과의 취득가액이 **0이 아닌** 값으로 실린다.

> ⚠️ 결과 화면에서 금액을 읽는 셀렉터는 **probe로 먼저 확정**할 것. 이 조사 중 `innerText`
> 라벨 매칭으로 값을 뽑으려다 3회 실패했다(라벨과 값이 다른 노드에 있다).

---

## 8. 실행 결과 (2026-08-12)

| 단계 | 산출물 | verify |
|---|---|---|
| P1 | `AssetSectionTransfer`에 「취득시 기준시가」 카드(4자산 게이트) · `toPropertyKind` export 재사용 | 노출 매트릭스 실측 6종 ✅ · anchor · **mutation 3종** |
| P2 | ③ 안내문 자산별 분기(거짓 「자동 도출」 제거) | anchor 5건 · **mutation 4건 실패 확인** |
| P3 | `needsBgAcqStdPriceInput`·`resolveBgAcqStdPrice` 공용 술어 + validate (5-c) | 차단 실동작 실측 ✅ · anchor 9건 |
| P4 | 엔진 수치 anchor(§1.1 표 고정) | anchor 5건 |
| 회귀 | — | `tsc` 0 · `npm run test:transfer` **6,341건** · **전체 E2E 1,048건** · lint 0 error |

**mutation 실측** — anchor가 회귀를 실제로 잡는지:

| 뒤집은 것 | 실패 |
|---|---|
| 입력 카드 제거(결함 복원) | 5건 |
| `general_building` 게이트 제거(무시되는 칸) | 1건 |
| `standardPriceAtAcq` → 다른 필드 오배선 | 1건 |
| 안내문 분기 제거(거짓 문구 복원) | 4건 |

---

## 9. 구현 중 발견 — O-2(수정함) · O-3(제품 결함 아님·종결)

### 9.1 🔴 O-2 — 부담부증여는 **계산 자체가 영구 차단**되어 있었다 (수정 완료)

P3 차단을 넣고 실물 확인하다 드러났다. 취득시 기준시가를 채워도 계산이 안 되고
**「자산: 취득가액을 입력하세요」** 가 막았다. `git stash` 대조로 **내 변경 이전에도 동일**함을 확인했다.

원인은 `transfer-tax-validate-asset.ts:492`:

```
if (!isEstimated && !hasPre1990) {          // ← transferType 게이트가 없었다
  if (asset.acquisitionCause === "purchase") {
    if (!isSeparateAcquisition(asset)) {
      if (!asset.fixedAcquisitionPrice …) return "취득가액을 입력하세요."
```

부담부증여는 취득가액을 §159가 자동 산정하고 UI도 그 칸을 숨기는데
(`CompanionAcqPurchaseBlock.tsx:366`), validate만 요구하고 있었다 — **입력할 칸이 화면에 없는데
그 칸을 채우라고 막는** 상태다. 아이러니하게도 바로 아래 별개 취득 주석이 그 함정을 경고하고
있었는데 **부담부증여만 빠져 있었다.**

실측: `housing`·`building`·`land`·`commercial_building` 4종 × 취득원인 무관 전부 차단.

⇒ `asset.transferType !== "burdened_gift"` 게이트 추가. 이 수정이 없으면 P1의 입력칸도 무용지물이다
(값을 넣어도 계산에 도달할 수 없다).

> 🔑 **O-1 §1의 서술을 정정한다.** 초안은 「조용히 0으로 계산된다」고 적었으나, 실제로는 그 앞에
> O-2가 **계산을 막고** 있었다. 즉 사용자에게 잘못된 세액이 표시된 것이 아니라 **계산 자체를
> 못 했다**. 엔진 수치(§1.1)는 여전히 유효하다 — O-2를 고친 뒤 그 경로가 열리므로 P3 차단이
> 필요한 것도 그대로다.

### 9.2 ✅ O-3 — 제품 결함이 아니었다 (검증 스크립트의 판정 문자열 오류)

O-2 수정 후 「API 200인데 결과 화면 미전환」으로 관측했던 현상은 **probe의 판정 문자열이 틀린
것**이었다. 결과 화면에는 「양도소득세 계산 결과」라는 문자열이 **없다** — 실제 표기는
**「계산결과 상세명세서」·「핵심 결과·계산 내역」·「산출세액」** 이다.

조사 경로(2026-08-12):

1. seed 차이를 의심해 대조 실험 4종(원본 seed / `fixedAcquisitionPrice` 제거 / 가산세 직행 /
   최소 seed) → **전부 결과 도달**.
2. 실패했던 seed를 그대로 재현해도 **통과** ⇒ seed가 원인이 아님.
3. 판정 로직을 의심해 문자열 존재를 직접 확인 → `"양도소득세 계산 결과"=false` ·
   `"산출세액"=true`. 계산은 내내 정상이었다.

올바른 문자열로 재확인한 최종 결과:

| 조건 | 결과 |
|---|---|
| `housing`·`building`·`land`·`commercial_building` + 취득시 기준시가 5억 | ✅ 전부 계산 완료 · 산출세액 **52,830,000원** 동일 |
| `housing` + 미입력 | ✅ (5-c) validate가 정확히 차단 |

⇒ **O-2 수정이 실제로 계산 경로를 열었음**이 실물로 확정됐다.

> 🔴 **교훈 — §7의 자기 경고를 스스로 어겼다.** 이 계획서 §7 E2E 항목에 「결과 화면에서 금액을
> 읽는 셀렉터는 **probe로 먼저 확정**할 것(innerText 라벨 매칭으로 3회 실패)」이라고 적어두고도
> 같은 실수를 반복했다. 결과 화면 판정은 **반드시 실제 렌더 텍스트를 먼저 덤프**해 확인할 것.
> 기존 spec들이 쓰는 `/양도소득세 계산 결과|산출세액/`는 **뒤쪽 대안으로** 매칭되고 있었다.

---

## 10. 범위 밖

- 엔진 산식 자체(§159①1호 A괄호) — 옳다. 수치로 확인했다(§1.1)
- `general_building`·양도세 일반 경로
- 앞 계획서(`burdened-gift-valuation-std-price-calculator.plan.md`)의 ④ 증여재산 평가 축
