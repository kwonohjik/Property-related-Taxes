# 일반건물 **부분 상속**(C2·C2′·C3) 취득가액 — Phase 2 계획서

> 상태: **계획 수립 · Do 미착수** (2026-08-07 작성)
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
| 엔진(실가 경로) | ✅ **파트 가격 직접 사용** | `general-building-route-actual.ts:374~381` `hasBothPartPrices` |
| **선례** | ✅ **증여는 이미 부분 취득 허용** | `transfer-tax-validate-gb.ts:154~158` — 「토지 매매 + 건물 증여」에서 토지만 환산이 정당하다고 명시 |

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

### 이 안이 성립하려면 (Do 전 검증 필수 — **측정: 미실시**)

| # | 검증 항목 | 방법 |
|---|---|---|
| V-A | C1을 A안으로 흘려도 **현행과 세액이 1원도 안 바뀌는가** | C1 기존 anchor 11건 GREEN 유지 |
| V-B | 상속 파트의 `estimatedDeduction`이 **0**인가 (§163⑥ 미적용) | 환산 경로 C2 probe |
| V-C | 결과 카드 「상속개시일 평가액」 라벨이 **파트별로** 붙는가 | echo 2필드 소비 지점 확인 |
| V-D | `missingParts` 차단이 **평가액 미입력**과 충돌하지 않는가 | V3·V4와 이중 차단 여부 |

> ⚠️ **위 4건은 아직 측정하지 않았다.** A안 채택은 V-A~V-D 실측 후 확정한다.

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

`gbInheritanceFields`(:166~179)는 **이미 파트별**이라 변경 최소. A안 채택 시 `partModePayload`(:207~213)에 상속 파트의 가격·모드를 합류시킨다.

⚠️ `:217` 「한 파트라도 환산이면 환산 경로」 — C2는 **환산 경로로 간다**. 상속 필드가 그 경로에도 실려 있는지 확인할 것(현행 주석은 「환산 모드=C2는 validate 차단이나 **대칭 전달**」이라고 적고 있다 — 즉 이미 전달된다).

### 엔진

- **환산 경로**: `general-building-part-acq.ts` — A안이면 **무변경 가능성**(측정: 미실시).
- **실가 경로**: `general-building-route-actual.ts:341` — A안이면 C1 전용 분기의 존치 여부 재검토(중복이면 정리, 단 회귀 0 확인 후).

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
2. §4 「환산 경로 무변경 가능성」
3. §4 「분리 ON에서 자산 단위 칸이 사라지는지」
4. §5 P-1~P-3의 **현행 결함 서술 자체** — 파트 축 재편 이후 미측정
5. C2가 환산 경로에서 상속 필드를 실제로 수신하는지(주석은 「대칭 전달」이라 하나 미확인)

---
관련: [[transfer-general-building-inheritance-acquisition.plan.md]] · [[project_transfer_pre_deemed_164_max_and_clause_a_b]] · [[feedback_sibling_path_already_implements_rule]] · [[feedback_open_item_wording_is_also_unverified]] · [[feedback_ui_gate_removes_sole_input_path]] · [[feedback_explicit_prop_mapping_strip]]
