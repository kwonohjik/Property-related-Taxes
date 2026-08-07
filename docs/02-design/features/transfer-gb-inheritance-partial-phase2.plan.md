# 일반건물 **부분 상속**(C2·C2′·C3) 취득가액 — Phase 2 계획서

> 상태: **✅ 구현 완료** (2026-08-07) — C2·C2′·C3 전부. 실측·게이트는 §10.
> ⚠️ 아래 §5 P-1~P-3의 「현행 결함」 서술은 **착수 전 예측이고 3건 중 2건이 틀렸다**. 실측은 §10-1.
> ✅ **선행 차단 해소**: §9-2의 라이브 결함(분리 ON + 증여 파트 → 취득가액 0·validate 통과, 실측 275,727,185원 과대)은 **같은 브랜치에서 수정 완료**. V-7의 제외를 상속 파트로 한정했다.
> 선행: [[transfer-general-building-inheritance-acquisition.plan.md]] — Phase 1(C1) **구현 완료**(b8d71870, 2026-07-20). 본 계획서는 그 §7 「Phase 2 인계」를 잇는다.
> 법령 근거는 선행 계획서 §2에서 **KoreanLaw 원문 검증 완료**(소득세법 시행령 MST 286211) — 재검증 불요, 재-open 금지.

---

## §0. 이 계획서의 범위 — 착수 전 정정 2건

착수 전 현행 코드를 실측한 결과 **당초 상정과 두 군데가 다르다**. 계획 범위를 여기에 맞춘다.

### 정정 ① 상가건물 상속은 **이미 구현 완료** — 본 계획서 범위 밖

선행 계획서 §7이 「상가건물 상속 버그(같은 감사 CONFIRMED, 별도 후속)」로 남긴 건은 그 뒤 해소됐다.

| 실측 | 근거 |
|---|---|
| 상속 전용 validate 분기 존재 | `lib/calc/transfer-tax-validate-asset.ts:147` → `validateCommercialInheritanceAsset` |
| §163⑨ 평가액 필수·§164⑥ 단서 게이트 | `lib/calc/transfer-tax-validate-commercial-asset.ts:50~76` |
| 엔진 주입 경로 | `lib/tax-engine/inheritance-acquisition-helpers.ts:174~234` (`commercialInheritanceValuation` opt-in · `computeCommercial164_6StdPrice`) |
| §164④~⑦ max·표시 정정 | PR #1080·#1082 (memory `project_transfer_pre_deemed_164_max_and_clause_a_b`) |

⇒ 상가건물은 GB와 달리 **메인 오케스트레이터 경로**를 타므로 STEP 0.45 우회 문제가 애초에 없었고, 미공시 시기 max까지 들어가 있다. 남은 것은 **🛑V-3(③ 분리) 보류 1건**인데 이는 실무 해석이 갈리는 축이라 「구현 계획」 대상이 아니다.

### 정정 ② C2·C3의 배관은 **대부분 이미 깔려 있다** — 「미설계」가 아니다

선행 계획서·엔진 설계서는 C2/C2′/C3를 「'실거래가 안분 + 상속 직접'의 혼합 배선이 **미설계**」로 남겼다. **2026-08-05~06의 파트 축 재편(P3·P7·O-1·O-3)이 그 배선을 이미 만들었다.**

| 계층 | 부분 상속 대응 | 실측 |
|---|---|---|
| ④ API 변환 | ✅ **이미 파트별 독립** | `transfer-tax-api-gb.ts:166~179` — 토지·건물이 각각 `acquisitionByInheritance`/`buildingAcquisitionByInheritance`를 **따로** 세운다 |
| ⑧ V2(추계 차단) | ✅ **이미 파트 축** | `transfer-tax-validate-gb.ts:126~128` — 상속 파트만 `actual` 요구 |
| 엔진(환산 경로) | ✅ **이미 혼합 지원** | `general-building-part-acq.ts:120~140` — 환산 파트는 환산값 유지, 비-환산 파트만 파트 가격으로 교체 + 개산공제 파트별 0 |
| 엔진(실가 경로) | ⚠️ **두 파트가 다 있을 때만** | `general-building-route-actual.ts:374~381` `hasBothPartPrices`는 **AND**다 — 한쪽만이면 그 값도 버려진다(§9-3) |
| **선례** | ⚠️ **증여 게이트는 파트 축이나, 그 경로에 라이브 결함이 있다** | `transfer-tax-validate-gb.ts:154~158` · 결함은 §9-2 |

**막고 있는 것은 두 지점뿐이다**:

1. `transfer-tax-validate-gb.ts:123~125` **V1** — 「한쪽만 상속」을 문구로 전면 차단
2. `general-building-route-actual.ts:341` — 상속 분기 게이트가 `acquisitionByInheritance **&&** buildingAcquisitionByInheritance` (AND)

> 📌 이는 [[feedback_sibling_path_already_implements_rule]]의 재현이다 — 「미설계」로 적힌 것이 사실은 **형제 경로(증여·파트 모드)가 이미 구현한 규칙**이었다. 선행 계획서를 그대로 믿고 착수했다면 있는 배선을 다시 만들었을 것이다.

**∴ 본 계획서 범위 = C2 · C2′ · C3 (일반건물 부분 상속) 단독.**

---

## §1. 법령 근거 (선행 계획서 §2 확정분 — 요약 재게)

- **§163⑨ 본문**: 상속·증여 자산은 상속개시일 현재 상증법 §60~66 평가액을 **취득당시 실지거래가액으로 본다**(= 법 §97①1호 **가목**). 환산 아님.
- **법 §97①1호 단서**: 「가목의 실지거래가액을 **확인할 수 없는 경우에 한정하여** 나목」 ⇒ §163⑨ 파트는 실지거래가액이 **확인 가능**하므로 환산·감정·매매사례를 적용할 근거가 없다(현행 V2의 근거).
- **판정이 파트별인 근거**: 법 §94①1호가 토지와 건물을 **별개 자산**으로 열거하고 §97②2호 본문이 「**자산별로**」라고 명시한다. ⇒ 「토지 매매 + 건물 상속」에서 **토지만 환산**은 정당하다.
- **§166⑥(현 §100② 계열)**: 안분은 「가액의 구분이 **불분명한 때**」의 규칙. 상속 파트는 평가액이 명확하므로 **안분 대상이 아니다**.

⚠️ **미공시 시기 max(§163⑨1호 토지 §164④ · 2호 건물 §164⑤~⑦)는 본 계획서 범위 밖**(Phase 3). Phase 1과 동일하게 **공시된 정상 케이스**만 다룬다.

---

## §2. 케이스 매트릭스 (토지 `acquisitionCause` × 건물 `gbBuildingAcquisitionCause`)

| # | 토지 | 건물 | 파트 모드 | 현행 | 목표 |
|---|---|---|---|---|---|
| C1 | 상속 | 상속 | 둘 다 actual | ✅ 구현됨 | 불변(회귀) |
| **C2** | 매매 | 상속 | 토지 **환산** + 건물 actual | ⛔ V1 차단 | 토지 환산 유지 · 건물 = 상속평가액 |
| **C2′** | 매매 | 상속 | 둘 다 actual | ⛔ V1 차단 | 토지 = 파트 실거래가 · 건물 = 상속평가액 |
| **C3** | 상속 | 매매/신축 | 토지 actual + 건물 actual/환산 | ⛔ V1 차단 | 토지 = 상속평가액 · 건물 = 기존 경로 |
| 비상속 | 매매/증여/신축 | 동상 | 임의 | ✅ 정상 | **완전 불변**(회귀 격리) |

**대칭 확인**: 증여는 이미 이 표의 부분 조합을 허용한다(`validate-gb.ts:149~158`). 상속만 V1로 막혀 있어 **같은 법조문(§163⑨)에 두 개의 정책**이 존재하는 상태다 — 본 수정은 그 비대칭 해소이기도 하다.

---

## §3. 설계 — 유력안 A: 「상속 평가액 = 파트별 실지거래가액」 정규화

### 착상

§163⑨이 평가액을 「취득당시의 **실지거래가액으로 본다**」고 하므로, 엔진에서도 **파트별 실지거래가액 슬롯에 그대로 싣는 것**이 법문과 1:1이다. 그러면 이미 완성된 파트 축 배선이 C2·C2′·C3를 전부 처리한다.

```
④ api-gb.ts partModePayload:
   토지 상속 → landAcqMode: "actual",     landAcquisitionPrice: inheritedLandValue
   건물 상속 → buildingAcqMode: "actual",  buildingAcquisitionPrice: inheritedBuildingValue
                     ↓
   환산 경로 → applyPartAcqModes  (part-acq.ts:120~140)  · 상속 파트 개산공제 자동 0
   실가 경로 → hasBothPartPrices   (route-actual.ts:374) · 안분 없이 직접 사용
```

### 이 안이 성립하려면 (Do 전 검증 필수)

| # | 검증 항목 | 상태 |
|---|---|---|
| V-A | C1을 A안으로 흘려도 **현행과 세액이 1원도 안 바뀌는가** | 측정: 미실시 (C1 anchor 11건 GREEN 유지로 판정) |
| V-B | 상속 파트의 `estimatedDeduction`이 **0**인가 (§163⑥ 미적용) | 측정: 미실시 |
| V-C | 결과 카드 「상속개시일 평가액」 라벨이 **파트별로** 붙는가 | 측정: 미실시 |
| V-D | `missingParts` 차단이 **평가액 미입력**과 충돌하지 않는가 | 측정: 미실시 |
| **V-E** | **같은 슬롯을 두 칸이 다투지 않는가** | ⚠️ **문제 확인됨** — 아래 |

### ⚠️ A안의 고유 위험 — dual-truth (2026-08-07 재검토에서 발견)

분리 ON이면 **「토지/건물 취득가액」 파트 칸이 취득원인과 무관하게 렌더된다**(`GeneralBuildingAcquisitionCards.tsx:347~348`·`:430` — 조건은 `isSeparate`뿐, `mode === "actual"`이면 금액 칸도 노출 `:125`). 상속이면 그 위에 **「상속개시일 평가액」 칸**도 함께 뜬다(`:352` `CompanionAcqInheritanceBlock`).

현행은 C1 분기가 파트 칸을 **무시**해서 충돌이 없다 — V-7 주석이 그 사실을 기록한다(「999,999,999를 넣어도 세액이 변하지 않았다」 `validate-gb.ts:214`). 뒤집으면 **지금도 보이는데 아무 효과가 없는 칸이 있다**는 뜻이다.

A안은 이 슬롯을 살리므로 **두 칸이 같은 payload 슬롯에 쓰게 된다**. 어느 쪽이 이기는지 정하지 않으면 [[feedback_ui_engine_dual_truth_avoidance]] 위반이다.

⇒ **A안 채택 시 상속 파트에서는 파트 취득가액 칸을 숨긴다**(평가액 칸이 유일 입력 경로). 숨기기 전에 [[feedback_ui_gate_removes_sole_input_path]] 점검 — 평가액 칸이 그 조합에서 실제로 렌더되는지 확인할 것.

### 대안 B: 전용 필드 혼합 분기 (`route-actual.ts:341`의 AND를 OR로 풀고 파트별 resolve)

- 장점: `inheritedLandValue`/`inheritedBuildingValue` 전용 필드가 유지돼 **의미가 payload에 남는다**.
- 단점: 실가 경로에만 분기가 생기고 **환산 경로(C2)는 별도 작업**이 남는다 — 두 경로에 같은 규칙을 두 번 쓰게 된다([[feedback_ui_engine_dual_truth_avoidance]]).

**현 시점 판단: A안 우세.** 단 A안이 전용 필드를 파트 가격 슬롯으로 흘리면 **성질 정보가 payload에서 사라진다** — 이는 W-1a에서 실제로 문제가 됐던 모양([[feedback_engine_result_display_drift]])이므로, **echo 플래그(`acquisitionByInheritance`·`buildingAcquisitionByInheritance`)는 A안에서도 반드시 유지**한다(표시 라벨의 유일한 소스).

---

## §4. 변경 지점

### ⑧ validate — `lib/calc/transfer-tax-validate-gb.ts`

```
:123~125  V1 전면 차단  →  삭제
:127~128  V2 파트 축     →  그대로 (이미 정합)
:130~132  증축 차단      →  그대로 (3파트 축은 Phase 3)
:134~139  V3·V4         →  파트별로 분기 — 상속 파트의 평가액만 요구
```

**신규 V-5(부분 상속 시 분리 ON 강제)**: C3에서 건물이 매매인데 **분리 OFF**면 자산 단위 총 취득가액만 있고, 그 총액은 토지분을 포함하므로 상속 토지 평가액과 **이중계상**된다. ⇒ 부분 상속은 **파트별 실지거래가액 입력(분리 ON)을 요구**한다.

> 근거는 코드에 이미 있다 — `route-actual.ts:370~372`: 「**한쪽만** 입력된 경우는 안분을 유지한다. 반쪽 값으로 총액을 대체하면 상대 파트가 잔액으로 깎이는데, 그 총액은 두 파트의 합이 아니라 자산 전체 입력값이다.」

⚠️ [[feedback_ui_gate_removes_sole_input_path]] — 분리 ON에서 자산 단위 취득가액 칸이 사라지는지(`hideAssetAcqAxis`) 확인 후 요구할 것. 증여가 같은 함정을 이미 밟았다(`validate-gb.ts:162~172`).

### ④ API 변환 — `lib/calc/transfer-tax-api-gb.ts`

`gbInheritanceFields`(:166~179)의 **조립**은 이미 파트별이다. 그러나 —

> 🔴 **`...gbInheritanceFields`는 실가 return(`:395`)에만 있다. 환산 return(`:233~282`)에는 없다.**
>
> 변수 위의 주석은 「두 분기 공통 상속 필드 (…환산 모드=C2는 validate 차단이나 **대칭 전달**)」이라고 적고 있으나 **구현이 따라가지 않는다**([[feedback_engine_comment_vs_impl_drift]]). C2 payload 실측에서 `inheritedBuildingValue`·`buildingAcquisitionByInheritance`가 **둘 다 부재**했다(2026-08-07 probe).
>
> V1이 C2를 막고 있어 오늘은 무해하지만, **C2를 여는 순간 상속 평가액이 환산 경로에 도달하지 못한다**. 배관 추가가 필요하다.

A안 채택 시 `partModePayload`(:207~213)에 상속 파트의 가격·모드를 합류시킨다 — 이 객체는 **양 경로 모두에 spread**되므로(`:243`·`:395` 인근) 위 비대칭을 우회한다. 단 **결과 라벨용 echo 플래그는 별도**이므로 환산 return에도 명시 추가해야 한다.

### ⑧ V-7 재편 (계획 초안에서 누락했던 지점)

`validate-gb.ts:218~225`의 `landByStatute`/`buildingByStatute`는 「§163⑨ 파트는 파트 취득가액 칸을 요구하지 않는다」인데, 그 근거가 「route helper가 `inheritedLandValue`/`inheritedBuildingValue`로 **override**한다」이다. A안은 override를 없애고 파트 슬롯을 정본으로 삼으므로 **이 제외 규약이 성립하지 않게 된다**. 함께 재편할 것.

> ⚠️ 이 술어는 **상속과 증여를 함께 묶는다** — 그런데 증여에는 override가 없다. §9-2 참조.

### 엔진

- **환산 경로**: `general-building-part-acq.ts` — A안이면 **무변경 가능성**(측정: 미실시).
- **실가 경로**: `general-building-route-actual.ts:341` — A안이면 C1 전용 분기의 존치 여부 재검토(중복이면 정리, 단 회귀 0 확인 후).
- ⚠️ `hasBothPartPrices`(`:374~378`)는 **AND**다. 한쪽 파트 가격만 있으면 그 값까지 버리고 총액 안분으로 떨어진다 — 분리 ON에서는 총액이 0이라 **취득가액 0**이 된다(§9-3 실측). C3는 이 경로를 정면으로 밟으므로 **AND 완화 또는 상속 파트 우선 배정**이 필요하다.

### ⑤ UI

건물 상속 평가액 위젯(`GeneralBuildingAcquisitionCards.tsx` amber 카드)은 이미 있다. **토지만 상속(C3)** 일 때 `CompanionAcqInheritanceBlock`이 노출되는지 확인 필요 — 노출 안 되면 dead-end.

### ⑫⑬⑭

`inheritedLandValue`·`inheritedBuildingValue`·게이트 2필드는 **이미 Zod·dispatch에 존재**(Phase 1). 신규 필드가 없으면 ⑫⑬⑭ 작업 없음 — 단 A안에서 파트 가격 슬롯을 쓰면 그 경로의 **명시 나열 dispatch**를 다시 확인할 것([[feedback_explicit_prop_mapping_strip]]).

---

## §5. Pre-Do anchor (P0 — 착수 첫 작업)

**착수 전 반드시 현행 baseline을 probe로 확정한다**([[feedback_pre_anchor_verification]]).

| # | 케이스 | 측정할 것 |
|---|---|---|
| P-1 | C2(토지 매매·환산 + 건물 상속) | V1을 임시로 뚫었을 때 현행이 내는 값 — 건물분이 **환산+개산공제**로 계산되는지 |
| P-2 | C2′(둘 다 실가) | 건물 상속평가액이 **무시되고** 총액 안분되는지 |
| P-3 | C3(토지 상속 + 건물 매매) | 토지분 취득가가 **0**인지, 아니면 안분값인지 |
| P-4 | golden | 각 케이스의 정답(상속 파트=평가액 직접·개산공제 0)과 세액 차이·방향 |

⚠️ **[[feedback_anchor_observes_wrong_stage]]** — 중간값(`allocatedAcquisitionPrice`)만 보지 말고 **결정세액까지** 단언한다. 파트 모드 플래그는 값과 **별도로** 고정한다.

⚠️ **[[feedback_open_item_wording_is_also_unverified]]** — 위 표의 「현행 결함」 서술은 선행 계획서에서 옮겨온 것이고 **파트 축 재편 이후 재측정한 적이 없다**. P-1~P-3에서 서술 자체가 뒤집히면(이미 정상이면) **그 케이스는 「고치면 안 되는 동작」으로 anchor에 고정**한다.

---

## §6. 회귀 격리

- 비상속 GB(사례 31~35) **완전 불변** — 상속 게이트로 격리.
- C1 기존 anchor 11건 **GREEN 유지**가 A안 채택의 전제(V-A).
- 증여 부분 취득 경로 불변 — 상속과 규칙이 수렴하므로 **증여 anchor도 함께 돌린다**.

---

## §7. 범위 밖 (Phase 3 이후)

- **미공시 시기 max** — §163⑨1호 토지 `max(평가액, §164④)` · 2호 건물 `max(평가액, §164⑤~⑦)`. 상가건물은 이미 구현돼 있으므로(§0 정정 ①) **그 구현을 이식**하는 형태가 유력.
- **상속 × 증축(3파트)** — `validate-gb.ts:130` 차단 유지.
- **상속 × 부담부증여 / 용도변경(사례 35)** — 조합 미검토.
- **상가건물 V-3(③ 분리)** — 🛑보류(실무 해석 갈림).

---

## §8. 미검증 항목 일람 (「측정: 미실시」)

> 이 절은 [[feedback_verify_before_report_no_inflation]]·W-1a §11.6 규칙에 따라 **예측과 실측을 분리**해 둔 것이다. 착수 시 여기부터 지운다.

1. §3 V-A~V-D 4건 — A안 성립 조건
2. §4 「환산 경로 무변경 가능성」(`part-acq.ts` 자체는 무변경일 수 있으나, 그 앞의 payload 조립은 §9-1로 변경 확정)
3. §5 P-1~P-3의 **현행 결함 서술 자체** — 파트 축 재편 이후 미측정
4. 상속 파트에서 파트 취득가액 칸을 숨겼을 때 평가액 칸이 그 조합에서 실제로 렌더되는지(V-E 후속)

~~3. §4 「분리 ON에서 자산 단위 칸이 사라지는지」~~ → ✅ 해소: `GeneralBuildingAcquisitionCards.tsx:342` `hideAssetAcqAxis={isSeparate}` — 사라진다.
~~5. C2가 환산 경로에서 상속 필드를 실제로 수신하는지~~ → ✅ 해소: **수신하지 않는다**(§9-1).

---

## §9. 계획 초안 재검토 (2026-08-07) — 실측 3건

> 초안을 쓴 직후 같은 세션에서 재검토했다. **초안의 추정 2건이 틀렸고, 그 과정에서 master의 라이브 결함 1건을 발견했다.**

### §9-1. 🔴 초안 오류 — 「환산 경로도 상속 필드를 이미 받는다」는 **틀렸다**

초안 §4는 코드 주석(「대칭 전달」)을 근거로 이미 전달된다고 적었다. **주석이 구현과 어긋나 있었다.**

| 실측 (payload probe) | 결과 |
|---|---|
| C2(토지 환산 + 건물 상속) | `inheritedBuildingValue` **부재** · `buildingAcquisitionByInheritance` **부재** |
| C1(둘 다 상속, 실가) | 두 필드 **존재** |

`...gbInheritanceFields`가 실가 return(`:395`)에만 있다. ⇒ **C2는 배관 추가 필요.**

> 📌 교훈: **주석을 실측 대신 쓰지 말 것.** 초안은 이것을 §8-5에 「미검증」으로 적어 두고도 §4 본문에서는 단정에 가깝게 서술했다 — 미검증 표시가 본문의 어조를 제어하지 못했다.

### §9-2. 🔴 신규 발견 — **분리 ON + 증여 파트 → 취득가액 0, validate 통과** (master 라이브)

초안은 「증여는 이미 부분 취득을 정상 처리한다」를 A안의 선례로 인용했다. **그 선례에 결함이 있다.**

| 케이스 (분리 ON · 두 파트 실가 · 파트 취득가액 칸 공란) | validate |
|---|---|
| G0 매매 + 매매 (대조군) | ⛔ 「토지 취득가액을 입력하세요」 |
| **G1 매매 + 증여** | **✅ 통과** |
| **G2 증여 + 증여** | **✅ 통과** |
| **G3 증여 + 매매** | **✅ 통과** |
| G4 상속 + 상속 | ✅ 통과 (C1 분기가 평가액으로 override — 정상) |
| G5 매매 + 상속 | ⛔ V1 차단 |
| G6 pre-1985 증여 (게이트 false) | ⛔ 정상 차단 |

**세액 실측**(G1 형상 · 양도가 16.2억):

| | 취득가액 | 산출세액 |
|---|---|---|
| 통과된 상태 (파트 칸 공란) | 토지 **0** · 건물 **0** | **500,567,775** |
| 정상 (토지 5억 · 건물 3억) | 500,000,000 · 300,000,000 | 224,840,590 |
| **차이** | | **275,727,185원 과대** |

**원인** — `8546dc32`(O-3, 2026-08-06)가 두 요구를 **동시에** 없앴다:

```diff
- if (!parseAmount(asset.fixedAcquisitionPrice)) {          // 자산 단위 요구
+ if (!isSeparate && !parseAmount(asset.fixedAcquisitionPrice)) {
+ const landByStatute = isLandInherited || isLandGift;      // 파트 요구에서 §163⑨ 제외
+ if (!landByStatute && landMode !== "estimated" && !parseAmount(asset.landAcquisitionPrice)) {
```

제외의 근거는 「route helper가 `inheritedLandValue`/`inheritedBuildingValue`로 **override**한다」인데, **그 override는 상속에만 있다** — 증여용 평가액 payload 필드는 **존재하지 않는다**(`giftedLandValue` 등 grep 0건). 술어 하나가 두 경로를 묶었으나 **인자가 같지 않았다**([[feedback_shared_predicate_argument_parity]]).

⚠️ **실패 모드가 나빠졌다.** O-3 이전에는 자산 단위 칸을 요구하는데 그 칸이 화면에 없어 **dead-end(차단)** 였다. 지금은 **통과하고 틀린 값**을 낸다.

✅ **수정 완료** (같은 브랜치) — V-7의 제외를 `isLandInherited`(상속)로 한정하고, 증여 파트에는 전용 문구(「증여 신고가액(취득가액)을 입력하세요 … §163⑨」)로 요구한다.

- **dead-end 아님**: 파트 취득가액 칸은 `isSeparate`만으로 렌더되고(`GeneralBuildingAcquisitionCards.tsx:347·458`) 금액 칸은 `mode === "actual"`에서 뜬다(`:125`). 증여 파트는 V2가 이미 실가를 강제하므로 항상 보인다.
- **이 수정은 O-3이 문서화한 설계로 되돌리는 것이다** — `gb-inheritance-gift-part-axis.anchor.test.ts:149`가 「파트별 실지거래가액은 **V-7이 요구하므로** 검증 공백도 없다」고 이미 적어 두었다. 의도는 옳았고 구현만 어긋나 있었다.
- anchor: `__tests__/calc/gb-gift-part-acq-price-required.anchor.test.ts` (10건). mutation probe로 **부분 수정(건물 축만 되돌림)도 잡힌다**고 확인.

⚠️ **A안 채택 시 상속 제외도 함께 사라진다** — 그때 이 게이트를 다시 손대야 한다(§4 ⑧).

### §9-3. ⚠️ 부수 — 한쪽 파트 가격만 입력하면 **그 값도 버려진다**

G1에서 토지 500,000,000을 **입력했는데도** 결과가 「둘 다 공란」과 **완전히 동일**했다(500,567,775). `hasBothPartPrices`가 AND(`route-actual.ts:374~378`)라 한쪽만이면 총액 안분으로 떨어지는데, 분리 ON에서는 총액이 0이기 때문이다(`hideAssetAcqAxis`).

코드 주석은 「한쪽만 입력된 경우는 안분을 유지한다」를 **의도**로 적고 있으나(`:370~372`), 분리 ON에서는 **안분할 총액 자체가 없다**. C3(토지 상속 + 건물 매매)가 정확히 이 경로를 밟으므로 Phase 2 설계에 반영해야 한다.

---
관련: [[transfer-general-building-inheritance-acquisition.plan.md]] · [[project_transfer_pre_deemed_164_max_and_clause_a_b]] · [[feedback_sibling_path_already_implements_rule]] · [[feedback_shared_predicate_argument_parity]] · [[feedback_engine_comment_vs_impl_drift]] · [[feedback_open_item_wording_is_also_unverified]] · [[feedback_ui_gate_removes_sole_input_path]] · [[feedback_ui_engine_dual_truth_avoidance]] · [[feedback_explicit_prop_mapping_strip]]

---

## §10. 구현 완료 (2026-08-07)

### §10-1. Pre-Do 실측 — 계획서 서술 3건 중 **2건이 틀렸다**

V1을 우회해 payload로 직접 측정했다.

| 케이스 | 계획서 서술 | **실측** |
|---|---|---|
| C2 (토지 매매·환산 + 건물 상속) | 「건물 환산+개산공제 오적용」 | **throw** 「건물 취득가액을 입력하세요」 — 오계산이 아니라 차단 |
| C2′ (둘 다 실가 + 건물 상속) | 「건물분 안분(평가액 무반영)」 | **취득가액 0·0** · 산출세액 492,412,110 |
| C3 (토지 상속 + 건물 매매) | 「토지분 0」 | **둘 다 0** — 입력한 건물 2억까지 버려짐 |

원인은 **AND 게이트 둘**이었다: 실가 경로의 상속 분기(`route-actual.ts:341`)와 `hasBothPartPrices`(`:374`). 상속 파트에는 파트 가격이 없어 둘 다 false로 떨어졌다.

> 📌 §8-3에 「미측정」으로 적어 둔 항목이 실제로 뒤집혔다. 서술을 믿고 「환산+개산공제를 끄는」 방향으로 착수했다면 **있지도 않은 결함을 고치고** 진짜 원인(AND 게이트)은 놓쳤을 것이다.

### §10-2. 채택 — A안(파트 슬롯 정규화). **새 엔진 분기 0**

```
④ api-gb.ts   상속 파트 → landAcquisitionPrice / buildingAcquisitionPrice 슬롯
                        ↓
환산 경로  applyPartAcqModes  — 비-환산 파트만 교체 + 개산공제 파트별 0
실가 경로  hasBothPartPrices — 두 파트가 다 차므로 안분 없이 직접 배정
```

**검산이 A안을 증명했다**: 같은 금액(5억·3억)을 파트 칸에 **손으로** 넣은 세액을 Pre-Do에서 재 두고(224,788,636), 상속 평가액이 그 슬롯에 실렸을 때 **한 원도 다르지 않음**을 anchor로 고정했다 — 상속은 취득가액의 *출처*이지 *금액*이 아니기 때문이다.

C1은 실가 경로의 전용 분기가 **먼저** 잡아 값이 불변이다(세액 192,868,636 고정).

### §10-3. 변경 지점

| # | 파일 | 내용 |
|---|---|---|
| ④ | `transfer-tax-api-gb.ts` | 상속 평가액 → 파트 가격 슬롯 · 환산 return에 게이트 echo 추가(§9-1 해소) |
| ⑧ | `transfer-tax-validate-gb.ts` | **V1 제거** · **V-5 신설**(부분 상속은 분리 ON) · V3·V4 파트별화 |
| ⑤ | `GeneralBuildingAcquisitionCards.tsx` | 상속 파트의 파트 취득가액 칸 **숨김**(V-E dual-truth) + 안내 |
| ⑦ | `BundledAllocationCard.tsx` | 파트별 §163⑨ 표시 블록 |
| 타입 | `general-building.types.ts` · `general-building-valuation.ts` | `GeneralBuildingInput` 게이트 2필드 + 환산 경로 echo |

### §10-4. 🔴 ⑦은 **처음에 도달하지 않는 파일을 고쳤다**

`GeneralBuildingValuationDetailCard.tsx`의 라벨을 파트별로 바꿨는데, E2E가 그 문구를 못 찾았다. 원인은 **그 카드가 일반건물 결과 화면에 렌더되지 않는다**는 것이었다 — 일반건물은 자산 카드 2장을 만들어 aggregate 경로로 흐르므로 화면은 `BundledAllocationCard`다.

**코드가 이미 경고하고 있었다** (`BundledAllocationCard.tsx:572`):

> ⚠️ 일반건물은 자산 카드 2장을 만들어 aggregate 경로로 흐르므로 화면도 이 다자산 뷰다 (`TransferTaxResultView`의 GB 상세 카드는 이 경로에서 렌더되지 않는다). 표시를 붙일 곳을 여기로 잡지 않으면 **판정이 계산에만 반영되고 화면에는 안 보인다**.

⇒ 수정을 되돌리고 `BundledAllocationCard`에 붙였다. **E2E가 없었으면 「⑦ 완료」로 보고했을 것이다** — 파일을 열어 고쳤고 tsc·vitest는 전부 통과했기 때문이다.

> 📌 부수 확인: `GeneralBuildingValuationDetailCard`의 Phase 1(C1) 상속 라벨도 같은 이유로 **표시된 적이 없다**. 이번 ⑦ 블록이 C1·부분 상속을 함께 처리하므로 그 갭도 닫힌다. 카드 자체의 정리는 범위 밖(기존 dead code 임의 제거 금지).

### §10-5. 게이트

| | 결과 |
|---|---|
| **Pre-Do anchor** | 22건 중 **13건 실패 · 4건 통과**(C1 회귀만) — 정확한 분포 |
| **mutation probe** ①파트 슬롯 미주입 ②환산 echo 제거 | 각각 **2건 실패** — 두 축 모두 잡힌다 |
| `npm test` | **1,281파일 14,329건** 통과 — 회귀 **0** |
| **E2E** | 신규 4건 + GB 계열 **21건** 통과 |
| `tsc` · `lint` | **0** · **0 errors** |
| 800줄 정책 | 최대 `BundledAllocationCard` **736**(트리거 800 미만) |

### §10-6. 범위 밖으로 남긴 것

- **§9-3(`hasBothPartPrices` AND)** — 수정 후 도달 불가가 됐다. 분리 ON이면 비상속 파트는 V-7이, 상속 파트는 API가 채우므로 항상 둘 다 찬다. 구조 자체는 그대로 두었다(불필요한 리팩터 회피).
- 미공시 시기 max(§163⑨1·2호) · 상속×증축 · 상속×부담부증여 — §7 그대로.
