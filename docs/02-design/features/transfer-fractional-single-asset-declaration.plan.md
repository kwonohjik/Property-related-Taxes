# R4 — 지분 부담부증여 개방: 「단건 공유지분」 선언 토글

- 작성일: 2026-09-03
- 발단: `docs/00-pm/transfer-open-items.plan.md` R4(🛑 보류 확정, 2026-07-29) 재개 요청
- 성격: **입력 경로 부재(dead-end)** 해소. 엔진 무변경 · 계산 로직 무변경
- 상태: ✅ **구현 완료(2026-09-03)** — 결정 1(§8)은 **(b) 축 A 전체**로 확정(사용자 판정, 2026-09-03).
  Phase 0 probe가 (b)를 실측 확증했고, 그 과정에서 **`Step1` splitMode 파생 결함**이 추가로 드러나 함께 고쳤다(§8.2)

---

## 0. 요약 — R4의 전제가 실측으로 뒤집혔다

종전 R4 문서의 진단은 **「양도가액 모델 비양립(`총계약가 × 지분율` vs `= 인수채무액`)이 유일한
진짜 블로커」**였다. 실측 결과 **그 비양립은 R4가 열려던 케이스에 존재하지 않는다.**

「지분 부담부증여」라는 한 낱말이 **서로 다른 두 축**을 덮고 있었다:

| | 축 A — 공유 소유 | 축 B — 지분 분할 취득 |
|---|---|---|
| 뜻 | 물건의 60%만 **내 것**이고 그 60%를 양도 | 물건 100%가 내 것인데 **2회에 걸쳐** 60%+40% 취득 |
| 자산 수 | **1건** | **N건**(지분마다 취득일·취득가 상이) |
| UI 라벨 | 「공유 지분율」(① 기본정보) | 「취득 지분율」(③ 취득정보, 토글 B) |
| 양도가액 | 부담부증여는 §159가 산정 — 총계약가 미사용 | `총계약가 × 지분율` |
| 비양립 | **없음** | **있음** |
| 차단 지점 | `validate-asset.ts:806` (Gate-A) | `validate.ts:92` (Gate-B) |

⇒ **비양립은 축 B에만 있다.** 종전 문서는 축 B의 사유로 축 A까지 닫아 두었다.

그리고 축 A는 **엔진·API·Zod·Route가 이미 전부 배선돼 있다**(§2 실측). 남은 것은
`validate` 게이트 하나뿐이다. 「대규모 UI 재설계」가 아니다.

---

## 1. [실측] 차단 — 화면에 입력칸이 있는데 값을 넣으면 막힌다

### 1.1 화면에는 「공유 지분율」이 있다

`components/calc/transfer/asset-sections/AssetSectionBasic.tsx:357`

```
{splitMode !== "fractional" && (
  <OwnershipRatioBlock ... />
)}
```

**단건(`splitMode === "none"`)에서도 렌더된다.** 게다가 값을 넣으면 안내 배지까지 뜬다
(`OwnershipRatioInput.tsx:130-140`):

> ⚠ 지분 모드 — 모든 금액을 **100% 기준**으로 입력하세요
> 예: 60% 지분의 실제 매매가 600,000,000원 → 100% 기준 **1,000,000,000원**으로 입력

### 1.2 그런데 계산은 막힌다 — probe 실측

`lib/calc/transfer-tax-validate-asset.ts:803-806` (이하 **Gate-A**)

```ts
// 단건 + 지분 모드 차단 — 합산 신고 없이 ratio < 1.0 자산을 단독 계산 시 잘못된 결과
// (사례 27 같은 동일 물건 다회 분할 취득은 모든 지분을 별도 자산으로 추가해야 정확)
if (form.assets.length === 1 && ownN < ownD) {
  return `${label}: 지분 모드 자산(${ownN}/${ownD})은 단독으로 계산할 수 없습니다. ...`;
}
```

`collectStepIssues(0, form)` 직접 호출 실측:

| probe | 조건 | 결과 |
|---|---|---|
| P1 | 단건 · 지분 60% · **일반양도** | 🔴 차단 |
| P1b | 단건 · 지분 100% · 일반양도 | 통과 |
| P2 | 단건 · 지분 50% · **부담부증여** | 🔴 차단 |
| P2b | 단건 · 지분 100% · 부담부증여 | 통과 |

⇒ **Gate-A는 부담부증여 특유가 아니다.** 전 양도형태의 축 A를 함께 막는다.
⇒ 입력칸·안내가 화면에 있는데 통과 경로가 없다 = **dead-end**
   (memory `feedback_ui_gate_removes_sole_input_path`).

---

## 2. [실측] 축 A의 배선은 **이미 완비**돼 있다

Gate-A 아래의 5단 파이프라인을 전수 확인했다. 빠진 지점이 **없다**.

| 지점 | 위치 | 실측 |
|---|---|---|
| ①②③ 폼 | `AssetForm.ownershipNumerator/Denominator` | ✅ 존재 |
| ⑤ UI | `AssetSectionBasic.tsx:357` `OwnershipRatioBlock` | ✅ 단건에도 렌더 |
| ④ API 변환 | `transfer-tax-api.ts:269` `ownershipRatioForDeduction = primaryFractional ? primaryRatio : undefined` | ✅ |
| ④ 12억 분모 | `transfer-tax-api.ts:353` `totalPropertyTransferPrice: primaryFractional ? totalContractPrice : undefined` | ✅ 물건 전체 유지 |
| ⑬ body spread | probe 실측 → `ownershipRatio = 0.5` 도달 | ✅ |
| ⑫ Zod | `lib/api/transfer-tax-schema.ts:242` `ownershipRatio: z.number().positive().max(1).optional()` | ✅ |
| ⑭ Route | `app/api/calc/transfer/engine-input.ts:261` `ownershipRatio: data.ownershipRatio` | ✅ |
| 엔진(부담부) | `transfer-tax-burdened-gift-step.ts:28` → `scaleBurdenedGiftInfo` | ✅ |
| 엔진(일반) | `transfer-tax-exemption.ts:189` `burdenedGiftDenominator ?? totalPropertyTransferPrice ?? transferPrice` | ✅ |

### 2.1 ⑬ probe 원문 (단건 부담부증여 · 지분 50%)

```
ownershipRatio = 0.5
transferPrice  = 600000000                     ← 채무 합계 placeholder (§159가 재산정)
bgInfo         = { buildingStdPriceAtTransfer: 1000000001,
                   buildingStdPriceAtAcquisition: 500000001, ... }   ← 100% raw (미스케일)
```

**이중 스케일이 없다** — `buildBurdenedGiftInfo(primary)`(`transfer-tax-api.ts:239`)는 raw를
보내고, 축소는 엔진 `scaleBurdenedGiftInfo` **한 곳**에서만 일어난다. 설계 그대로다.

### 2.2 엔진 anchor는 이미 19건 (PR #851)

`__tests__/tax-engine/transfer-tax/burdened-gift-fractional-ownership.test.ts` — **19 passed** (실측).

> ⚠️ 종전 R4 문서의 「23건」은 실측과 다르다. **19건**이 정확하다.

B1 단독 무변경 · B2 지분분 A·C · B3 mortgage 전환 · B4 시가 K-4 · B5 K-5 상쇄 ·
B9 미등기 × 지분 · B10 1/3 성분별 floor · B11 초과부담부 fail-fast ·
**B6·B7 12억 분모 물건 전체 유지** · B12 개산공제 이중축소 방지 · B8 전체 파이프라인.

⇒ 엔진은 「준비됨」이 아니라 **축 A를 위해 설계·고정 완료**된 상태다.

---

## 3. [실측] 우회로는 세액을 틀리게 만든다 — 3,619,000원

Gate-A의 메시지는 두 가지 우회로를 제시한다. 축 A에서는 **둘 다 성립하지 않는다**:

1. 「같은 물건의 다른 지분도 별도 자산으로 추가」 → 나머지 지분은 **타인 소유**다. 추가할 수 없다.
2. 「단독 소유라면 지분율을 100/100으로 입력」 → 단독 소유가 아니다. 그래도 강행하면:

### 3.1 probe — 24억 물건의 1/2 지분 부담부증여 (1세대1주택 · 채무 5억)

| 입력 방식 | totalTax |
|---|---|
| **정답**: 지분율 50% + 물건 전체 24억 (= 현재 **차단됨**) | **3,619,000원** |
| **우회로**: 100/100 + 지분분 12억 직접 입력 | **0원** |
| 차액 | **3,619,000원 (세액 과소 — 전액 비과세 오판)** |

원인은 12억 고가주택 판정 분모다. 우회로에서는 `rawInfo`가 곧 지분분(12억)이 되어
**12억 이하 = 전액 비과세**로 뒤집힌다. 지분율을 넣으면 엔진이
`wholePropertySupplementary`(물건 전체 24억)로 판정한다 —
`burdened-gift-apportionment.ts:117-124`가 그 목적으로 존재한다.

### 3.2 판별력 대조

| 물건 전체 | 정답 | 우회로 |
|---|---|---|
| 24억 | 3,619,000 | **0** |
| 10억 | 0 | 0 |

⇒ 12억 문턱을 **가로지르는 구간에서만** 벌어진다. 「항상 틀린다」가 아니라
**「고가주택 판정이 갈리는 곳에서 조용히 비과세로 빠진다」**가 정확한 서술이다.

---

### 3.5 [실측 · Phase 0] 일반양도 축 A도 **같은 결함**이다 — 9,900,000원

결정 (b)의 착수 조건이던 probe를 **route를 태워** 돌렸다(leaf 아님 — ⑫⑭까지 포함).

조건: 24억 물건의 **40% 지분** · 1세대1주택 · 2009 취득 → 2024 양도 (지분분 9.6억 < 12억)

| 경로 | `ownershipRatio` | `totalPropertyTransferPrice` | `transferPrice` | 결정세액 |
|---|---|---|---|---|
| **정답**: 지분율 40% + 물건 전체 24억 | 0.4 | 2,400,000,000 | 960,000,000 | **9,900,000원** |
| **우회로**: 100/100 + 지분분 9.6억 | — | — | 960,000,000 | **0원** |

⇒ **양도가액·취득가액은 두 경로가 완전히 같고, 판정 분모만 다르다.** 부담부증여(§3.1)와
동일한 결함이며 금액은 오히려 더 크다. (b)는 실측으로 확증됐다.

판별력 대조: 12억 미만 물건(10억)에서는 두 경로가 **둘 다 0** — 12억 문턱 축임이 고정된다.

### 3.6 [실측 · Phase 0b] 자산종류별 **선형성** — 재개발·입주권만 깨져 있다

Phase 0b의 첫 매트릭스는 재개발·입주권을 픽스처 결함(400)으로 **미검증**으로 남겼다.
2026-09-03 후속 조사에서 픽스처를 갖춰 다시 쟀다.

**측정 기준을 바꿨다** — 「우회로 대조」가 아니라 **선형성**이다:
화면 규약이 「모든 금액을 100% 기준으로 입력 + 시스템이 지분율 자동 적용」이므로,
**양도차익은 지분율에 정비례**해야 한다(세액은 누진·문턱 때문에 비선형이라 차익으로 잰다).
사용자 입력 관습을 추측할 필요가 없어 균일하게 비교된다.

| 자산종류 | 100% 차익 | 40% 차익 | 기대(×0.4) | |
|---|---|---|---|---|
| 주택 · 토지 · 분양권 | 600,000,000 | 240,000,000 | 240,000,000 | ✅ |
| 상가(환산) | 616,000,000 | 246,400,000 | 246,400,000 | ✅ |
| 일반건물(환산) | 634,600,000 | 253,840,000 | 253,840,000 | ✅ |
| 일반건물(실가) | 600,000,000 | 240,000,000 | 240,000,000 | ✅ |
| **재개발APT** | 770,000,000 | **170,000,000** | 308,000,000 | 🔴 **−138,000,000** |
| **입주권** | 770,000,000 | **170,000,000** | 308,000,000 | 🔴 **−138,000,000** |

### 3.7 원인 — `buildRedevelopmentPayload`에 지분율이 **한 군데도 없다**

payload 실측(지분 40% · 물건 전체 입력):

| 필드 | 전달값 | 지분분이었어야 |
|---|---|---|
| `transferPrice` | 400,000,000 ✅ | 400,000,000 |
| `redevelopment.rightsValue` | **500,000,000** 🔴 | 200,000,000 |
| `redevelopment.settlementAmount` | **200,000,000** 🔴 | 80,000,000 |
| `redevelopment.preApprovalExpenses` | **30,000,000** 🔴 | 12,000,000 |
| `redevelopment.postApprovalExpenses` | **15,000,000** 🔴 | 6,000,000 |

⇒ 취득가액이 부풀어 **양도차익 과소 = 세액 과소**. 지분분 직접입력 대비 **68,026,797원** 차이.

**왜 다른 종류는 멀쩡한가**: 환산 기준시가는 산식에서 **비율로만** 쓰여 약분된다
(`환산취득가 = 양도가액 × 취득기준시가 / 양도기준시가` — 양도가액이 이미 지분분이면 결과도 지분분).
재개발만 **절대금액이 취득가액에 직접 더해져**(권리가액 + 청산금 + 인가전 필요경비) 약분되지 않는다.

⭐ **판별 규칙**: 비율 성분은 스케일 불요 · **절대금액 성분은 스케일 필수**.
같은 계열이 종전에도 있었다 — U2-03(승계조합원·§166 갈래 100% 누출) · 이월과세 F16 A-10/V-1 · 부담부증여 #851.
`transfer-tax-api-{carryover,burdened-gift,split}.ts`는 ratio를 알고, **redev만 몰랐다**.

### 3.8 처방 — **차단**한다 (고치지 않는다)

고치려면 「청산금·권리가액을 ×지분율로 쪼갤 것인가」를 정해야 하는데, **두 설계가 모두 성립**한다:

| 설계 | 선례 |
|---|---|
| (가) 100% 기준 입력 + 엔진이 ×지분율 | 화면 규약(`OwnershipRatioBlock` 배지) |
| (나) **지분 인수분을 직접 입력**받고 스케일하지 않음 | 부담부증여 채무 — 「계약으로 정해지는 금액이지 지분율로 파생되는 값이 아니다」, 라벨 「(지분 인수분)」 |

근거 없이 고르면 조용히 틀린다. ⇒ **명시 차단**한다
(⑧ `isFractionalUnsupportedAssetKind` — ⑤ UI 토글 disabled와 **같은 술어**).

차단은 PR #1443 이전 상태(전면 차단)와 같으므로 **회귀가 아니다**. 축 B(Gate-B)도
`redevelopment_apt`를 같은 이유로 막고 있어 저장소의 기존 입장과 일치한다.

> 🔑 **이것이 `feedback_ui_gate_expansion_activates_latent_defect`의 사례다.**
> Gate-A를 열자 「지분 × 재개발」이라는 **종전에는 도달 불가능하던 조합**이 열리면서
> 잠자던 결함이 활성화됐다. 게이트를 넓힐 때는 **새로 열리는 조합을 전수로 재야** 한다.

---

## 4. Gate-A가 실제로 막고 있는 것 — 두 사용자를 구별하지 못한다

Gate-A를 그냥 없애면 안 된다. 주석이 지목한 위험은 **실재**한다.

| | 사용자 X (축 A) | 사용자 Y (축 B의 오입력) |
|---|---|---|
| 상황 | 물건의 60%만 소유 · 그 60%를 양도 | 물건 100% 소유 · 60%+40% 2회 취득 |
| 60/100 단건 입력의 결과 | **정확** | **40%가 통째로 누락 = 세액 과소** |

폼 데이터만으로는 **두 사용자가 구별되지 않는다**. Gate-A는 Y를 막으려고 X까지 막았다.
⇒ 처방은 「게이트 제거」가 아니라 **「X가 자신을 X라고 선언할 경로를 주는 것」**이다.

이 저장소에는 같은 형태의 선례가 있다 — `validate-asset.ts:685`의 E-1
(`clauseADeclarationError`): 「UI/API 통과 ↔ validate 차단 모순」을 **선언 토글이라는 통과
경로를 함께 주어** 해소했다.

---

## 5. 처방 — 「나머지 지분은 타인 소유」 선언 토글

### 5.1 동작

```
① 기본정보
  └ 공유 지분율 [ 60 ] %
     └ (지분율 < 100%일 때만) ToggleCard
        「이 물건의 나머지 지분(40%)은 타인 소유입니다」
        · ON  → Gate-A 통과. 이 자산 1건만으로 계산한다.
        · OFF → 현행 차단 유지 + 메시지를 두 갈래로 바꾼다:
                「나머지 지분도 내 것이면 별도 자산으로 추가하고,
                  타인 소유면 위 선언을 켜세요.」
```

- **계산에 영향 없음** — 선언은 게이트 통과 신호일 뿐이다. 세액은 `ownershipRatio`가 결정하고
  그 배선은 §2대로 이미 완비돼 있다.
- **API로 보내지 않는다** — R8(`redevPostApprovalHousingUse`, PR #1442)과 같은
  **표시·검증 전용** 필드. ⑫⑬⑭ 무변경.
- **자동판정 금지** — X/Y는 폼 데이터로 판별 불가다. 추정하면 조용히 틀린다
  (자동 안분 fallback 금지와 같은 층위).

### 5.2 왜 「지분율 < 100%」에서만 뜨는가

100%면 축 A/B 구별이 무의미하다. 항상 띄우면 단독 소유 사용자에게 뜻 없는 선택을 강요한다.

---

## 6. 구현 범위 — 14 동기화 지점 대조

| 지점 | 변경 | 내용 |
|---|---|---|
| ① 폼 상태 | ✅ | `lib/stores/calc-wizard-asset.ts` — `ownershipRemainderThirdParty: "" \| "yes"` |
| ② initial | ✅ | `calc-wizard-asset-factory.ts` — `""` |
| ③ normalize | ✅ | `calc-wizard-asset-migrate.ts` — undefined→`""` 가드 + 지분율 100% 복귀 시 클리어 |
| ④ API 변환 | ❌ | 미전송 |
| ⑤ UI 위젯 | ✅ | `OwnershipRatioBlock` 내부(위젯과 선언이 갈라지면 한쪽만 옮겨지는 사고 — 2026-08-11 주석의 근거 그대로) |
| ⑥ 사이드바 | ❌ | 금액 아님 |
| ⑦ 결과 카드 | ❌ | 세액 무변경 |
| ⑧ validation | ✅ | `validate-asset.ts:803-806` Gate-A에 선언 예외 + OFF 메시지 2갈래화 |
| ⑨~⑭ | ❌ | 무변경 |

**변경 파일 5개 · 신규 필드 1개 · 엔진 0줄.**

> ⚠️ `ownershipRemainderThirdParty`는 sessionStorage에 저장된다 —
> stale 데이터 가드를 ③에 반드시 넣는다(memory `feedback_new_asset_field_stale_sessionstorage_guard`).

---

## 7. anchor — **구현된 것**

> ⚠️ 이 절은 착수 전 「계획」으로 썼다가 구현 후 **실제 파일·건수로 정정**했다.
> 계획 단계의 파일명·케이스 수를 그대로 두면 계획↔구현 드리프트가 문서에 박힌다.

### 7.1 `__tests__/calc/fractional-single-asset-declaration.anchor.test.ts` (7건)

| id | 케이스 | 기대 |
|---|---|---|
| D1 | 단건 · 60% · 선언 OFF · 일반양도 | 차단 (회귀 가드) |
| D2 | 단건 · 60% · 선언 **ON** · 일반양도 | 통과 |
| D3 | 단건 · 50% · 선언 OFF/ON · **부담부증여** | 차단/통과 (R4 본체) |
| D4 | 단건 · 100% · 선언 유무 무관 | 통과 (토글이 단독 소유에 간섭하지 않음) |
| D5 | 다자산(축 B) · 60%+40% | Gate-A 미발동 (`assets.length===1` 조건 유지) |
| D6 | 차단 메시지 | 「별도 자산으로 추가」 + 「타인 소유」 두 갈래 모두 |
| **D7** | 축 B × 부담부증여 · 선언 ON | **여전히 Gate-B가 차단** (D5와 짝 — 두 게이트 무간섭) |

### 7.2 `__tests__/components/fractional-declaration-toggle.anchor.test.tsx` (4건)

| id | 케이스 | 기대 |
|---|---|---|
| T1 | 지분율 60% + 핸들러 제공 | 토글 렌더 |
| T2 | 지분율 100% | 토글 **미렌더** |
| T3 | 핸들러 미제공(축 B 호출부) | 토글 미렌더 · 「100% 기준」 안내는 유지 |
| **T4** | 선언 ON | 토글이 켜진 상태로 렌더 |

### 7.3 `__tests__/calc/fractional-single-asset-whole-property-threshold.anchor.test.ts` (3건)

> 📌 계획 단계 가칭은 `__tests__/tax-engine/.../fractional-single-asset-highvalue`였다.
> **`__tests__/calc/`로 옮겼다** — 이 anchor는 엔진 leaf가 아니라 **route를 태운다**
> (④ 변환 → ⑫ Zod → ⑭ 매핑 → 엔진). leaf 직접 호출은 ⑫⑭를 건너뛰어 같은 결함을 놓친다
> (memory `feedback_leaf_anchor_skips_zod_layer`).

| id | 케이스 | 기대 |
|---|---|---|
| H1 | 지분율 40% + 물건 전체 24억 | `ownershipRatio=0.4` · `totalPropertyTransferPrice=24억` · `totalTax === 9,900,000` |
| H2 | 🔴 우회로 100/100 + 지분분 9.6억 | `totalTax === 0` — 양도가액·취득가액은 H1과 **같은데** 판정 분모만 다름 |
| H3 | 12억 미만 물건(10억) | 두 경로 동일 · 둘 다 0 (문턱 축 고정) |

> ⚠️ 9,900,000원은 **mock 세율표 실측값**이지 「정본 세액」이 아니다. 값이 바뀌면
> 값을 고치기 전에 **원인**을 먼저 본다.

### 7.4 `e2e/transfer-fractional-single-asset.spec.ts` (3건)

| 케이스 | 기대 |
|---|---|
| ① 기본정보 렌더 | 「공유 지분율」 + 「100% 기준 입력」 + **선언 토글**이 함께 |
| 🔴 선언 없이 계산 | 차단 메시지 노출 + 두 갈래 제시 |
| 선언 ON 계산 | 200 · `ownershipRatio=0.4` · `totalPropertyTransferPrice=24억` · `totalTax > 0` |

**E2E가 §8.2의 파생 결함을 잡았다** — 유닛만으로는 통과했다.

---

## 8. 결정 — 확정됨

### ✅ 결정 1: **(b) 축 A 전체**로 연다 (2026-09-03 사용자 판정)

(a) 부담부증여 한정은 **§4의 위험을 부담부증여 쪽에 그대로 남기고**, 동일한 dead-end를
일반양도에 방치한다. 두 결함의 원인이 하나(Gate-A)인데 절반만 고치면 같은 작업을 두 번 한다.

착수 조건이던 Phase 0 probe는 **(b)를 확증**했다(§3.5 — 일반양도 축 A도 동일 결함, 9,900,000원).

### 8.2 [Phase 0에서 추가 발견] `Step1` splitMode 파생이 단건을 축 B로 분류했다

E2E를 붙이는 과정에서 드러났다. `app/calc/transfer-tax/steps/Step1.tsx`의 초기 파생이
**length 조건 없이** `some(fractional)`만 봤다:

```ts
if (form.assets.some((a) => isFractionalRatioStr(...))) return "fractional";   // 종전
```

그래서 **같은 데이터가 두 상태로 갈렸다**:

| 시점 | splitMode | 지분 위젯 자리 | 라벨 | 선언 토글 |
|---|---|---|---|---|
| 사용자가 방금 60%를 입력 | `"none"`(state 유지) | ① 기본정보 | 「공유 지분율」 | 뜬다 |
| **세션 복원 후 재진입** | `"fractional"`(파생) | ③ 취득정보 | 「취득 지분율」 | **사라진다** |

선언 토글이 사라지면 게이트를 통과할 방법이 없다 — **재진입만으로 dead-end가 부활**한다.

⇒ 축 B는 **정의상 다자산**이므로 `form.assets.length > 1`을 파생 조건에 추가했다.
축 B의 단일 진실 공급원인 `isFullFractionalBundle`도 같은 조건을 요구한다 — 여기만 빠져 있었다.

> ⚠️ `every`가 아니라 `some`인 것은 **유지**한다 — 토글 B 진입 직후에는 지분율이 빈칸이라
> `every`가 거짓이 된다(`handleFractionalToggle`).

> 🔑 **교훈**: 이 결함은 유닛으로는 잡히지 않았다. validate leaf도 렌더 테스트도 각자는
> 정상이고, **세션 복원이라는 실제 진입 경로**에서만 갈렸다. E2E가 정본 게이트인 이유다.

---

## 9. 실행 결과

| Phase | 내용 | 결과 |
|---|---|---|
| **0** | 일반양도 축 A probe (route 레벨) | ✅ (b) 확증 — §3.5 |
| **0b** | 자산종류 매트릭스 | ✅ 6종 일치 · 2종 미검증(픽스처 한계) — §3.6 |
| **1** | store 3파일 + 필드 `ownershipRemainderThirdParty` | ✅ `tsc --noEmit` 0건 |
| **2** | ⑧ Gate-A 선언 예외 + 메시지 2갈래화 | ✅ D1~D7 (7 passed) |
| **3** | ⑤ `OwnershipRatioBlock` 토글 + `Step1` 파생 정정 | ✅ T1~T4 (4 passed) |
| **4** | 수치 anchor + E2E | ✅ H1~H3 (3 passed) · E2E 3 passed |
| **5** | 재개발·입주권 스케일 정합 재조사 → **차단** | ✅ D8~D10 · T5 · L 6건 (§3.6~3.8) |

### 9.1 변경 파일

| 파일 | 지점 | 내용 |
|---|---|---|
| `lib/stores/calc-wizard-asset.ts` | ① | `ownershipRemainderThirdParty: "" \| "yes"` |
| `lib/stores/calc-wizard-asset-factory.ts` | ② | 초기값 `""` |
| `lib/stores/calc-wizard-asset-migrate.ts` | ③ | undefined 가드 + 100% 복귀 시 클리어 |
| `lib/calc/transfer-tax-validate-asset.ts` | ⑧ | Gate-A 선언 예외 + 메시지 2갈래 |
| `components/calc/transfer/OwnershipRatioInput.tsx` | ⑤ | 선언 토글 (지분율<100% + 핸들러 제공 시) |
| `components/calc/transfer/asset-sections/AssetSectionBasic.tsx` | ⑤ | 선언 배선 + 100% 복귀 클리어 |
| `app/calc/transfer-tax/steps/Step1.tsx` | ⑤ | splitMode 파생에 `length > 1` (§8.2) |
| `lib/calc/transfer-tax-api-helpers.ts` | 술어 | `isFractionalUnsupportedAssetKind` — ⑤⑧ 단일 소스 (§3.8) |

**엔진 0줄 · ④⑨~⑭ 무변경**(선언은 API로 보내지 않는다).

### 9.2 뮤테이션 판별력 (전건 RED 확인)

| 뮤테이션 | 죽는 테스트 |
|---|---|
| M1 Gate-A 예외 제거(선언 무시) | D2 · D3 |
| M2 토글 지분율 게이트 제거(100%에도 렌더) | T2 |
| M3 `totalPropertyTransferPrice` 제거(물건 전체 분모 소실) | H1 |
| M4 차단 술어 무력화(재개발 허용) | D8 · D9 |
| M5 `shareOf` 무력화(금액 지분 스케일 제거) | L: 주택·토지·분양권·일반건물(실가) |

> 📌 M5에서 **상가(환산)·일반건물(환산)은 살아남는다** — 그 경로는 `shareOf`(취득가액)를 타지
> 않고 기준시가 **비율**로 계산되기 때문이다. 결함이 아니라 §3.7의 구별이 옳다는 방증이고,
> 그 두 케이스는 다른 경로(환산 산식)를 지킨다.

---

## 10. 범위 밖 — 축 B는 계속 차단한다

**축 B(fullFractional × 부담부증여, `validate.ts:92`)는 이 계획서가 열지 않는다.**

근거: 축 B는 route의 일괄(bundled) 분기로 가는데 그 경로는 §159 안분(STEP 0.48)을 타지 않는다
(`__tests__/calc/burdened-gift-fractional-validate.test.ts` 헤더 — Playwright 실측으로
`debtRatio`·`burdenedGift` 흔적 0건 확인됨). 여는 데는 **aggregate 경로에서 §159를 돌리는
재설계**가 필요하고, 그것이 종전 R4 문서가 말한 「대규모 재설계」다.

수요가 확인되지 않은 상태에서 착수하지 않는다(Simplicity First).
축 A가 열린 뒤에도 축 B 차단 메시지는 **그대로 유지**된다 — 두 축은 게이트가 다르므로
서로 간섭하지 않는다(D5 anchor가 고정).

---

## 11. 종전 R4 문서에서 정정되는 서술

| 종전 | 정정 |
|---|---|
| 「양도가액 모델 비양립이 여전히 남은 진짜 블로커 **하나**」 | 축 B에만 해당. 축 A에는 비양립이 **없다** |
| 「지분 분할 UI에서 §159 경로를 별도 분기로 태우는 **재설계**가 필요」 | 축 A는 재설계 불요 — 게이트 예외 + 토글 1개 |
| 「단건 `validate-asset.ts:638`」 | 현재 **:806**. 인용이 stale했다 |
| 「엔진 **23건** anchor」 | 실측 **19건** |
| 「엔진은 준비됨 / UI는 차단 중」 | 정확하다. 다만 **차단이 부담부증여 특유가 아니라 축 A 전체**라는 점이 빠져 있었다 |
| (미기재) | `Step1` splitMode 파생이 **단건을 축 B로 분류**해 재진입 시 선언 토글이 사라졌다 — 종전 문서에 없던 결함(§8.2) |
