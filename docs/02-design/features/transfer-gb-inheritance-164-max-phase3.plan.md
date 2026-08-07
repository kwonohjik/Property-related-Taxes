# 일반건물 상속 — **미공시 시기 §164 max**(§163⑨1호·2호) Phase 3 계획서

> 상태: **✅ 구현 완료** (2026-08-07). 게이트·실측은 §8.
> 선행: [[transfer-gb-inheritance-partial-phase2.plan.md]] §7 「범위 밖」의 첫 항목. Phase 1(C1)·Phase 2(C2·C2′·C3) 완료 후 남은 축.

---

## §1. 법령 근거 — **원문 확인 완료** (소득세법 시행령 MST 286211, 시행 20260701)

### §163⑨ 단서 각 호 (verbatim)

> **1.** 「부동산 가격공시에 관한 법률」에 따라 **1990년 8월 30일 개별공시지가가 고시되기 전에** 상속 또는 증여받은 **토지**의 경우에는 … 「상속세 및 증여세법」 제60조 내지 제66조의 규정에 의하여 평가한 가액과 **제164조제4항**의 규정에 의한 가액 중 **많은 금액**
>
> **2.** 「상속세 및 증여세법」 제61조제1항**제2호 내지 제4호**의 규정에 의한 **건물의 기준시가가 고시되기 전에** 상속 또는 증여받은 **건물**의 경우에는 … 평가한 가액과 **제164조제5항 내지 제7항**의 규정에 의한 가액 중 **많은 금액**

### §164④·⑤ (verbatim 요지)

| 조항 | 대상 | 가액 |
|---|---|---|
| **§164④** | 1990.8.30. 개별공시지가 고시 전 취득 **토지** | 1990.1.1. 기준 개별공시지가 × (취득당시 시가표준액 ÷ 〈1990.8.30. 시가표준액 + 직전 시가표준액〉÷2) |
| **§164⑤** | 법 §99①1호 **나목**(국세청장 고시 건물) 기준시가 고시 전 취득 **건물** | **국세청장이 해당 자산에 최초로 고시한 기준시가 × 국세청장이 고시한 기준율** |

**일반건물의 건물분은 §99①1호 나목**이므로 §164**⑤**가 정본이다(⑥은 오피스텔·상업용건물·공동주택, ⑦은 주택).

⚠️ 미확정 아님 — 두 조문 모두 본문을 직접 읽고 확인했다.

---

## §2. Pre-Do 실측 (2026-08-07) — 결함 확정

상속개시일 **1988-05-01**(토지 <1990.8.30 · 건물 취득연도 ≤2000 둘 다 해당), 양도가 16.2억.

| | 취득가액 | 산출세액 |
|---|---|---|
| **현행** — 평가액만 사용 | 50,000,000 + 20,000,000 | **421,185,000** |
| **§163⑨1·2호 max 적용** | 205,000,000 + 150,000,000 | 334,920,000 |
| | | **86,265,000원 과대** |

추가 실측 2건:

- **② 비교값이 수집되지 않는다** — 취득시 토지·건물 기준시가를 **비워도 validate가 통과**한다. 상속 파트는 V2가 `actual`을 강제하고 V-5는 「환산 파트만」 기준시가를 요구하기 때문이다.
- **넣으면 payload에는 도달한다** — `acquisitionLandPricePerSqm`·`acquisitionBuildingStdPrice`가 실가 경로 payload에도 실린다. ⇒ **배관은 있고 max 비교만 없다.**

---

## §3. 기존 자산 — 엔진은 **둘 다 이미 있다**

| 축 | §164 가액 산출 | 위치 |
|---|---|---|
| 토지 §164④ | `calculatePre1990LandValuation` (등급가액 환산) | `lib/tax-engine/pre-1990-land-valuation.ts` |
| 건물 §164⑤ | 「2001 지수표 복합 × **산정기준율**」 | `building-standard-price.ts:198·214` (취득연도 ≤2000 자동 분기) |

**§164⑤ 값은 GB의 「건물 기준시가 계산」 모달이 이미 산출한다** — 취득연도 ≤2000이면 자동으로 §164⑤ 경로를 탄다. 즉 건물분은 **입력 경로가 이미 있다**.

### §164 공통 인프라 — GB만 빠져 있다

`lib/calc/sec164-required-fields.ts`가 자산 종류별 status를 제공한다:

```
sec164HouseStatus       (housing · redevelopment_apt)
sec164CommercialStatus  (commercial_building)
sec164LandStatus        (land)
              ← general_building 없음
```

상가는 `isBeforeBuildingStdPriceNotice` 게이트 + `cbAcqBuildingStdBy164_5` **확인란**까지 갖췄다. GB는 이 체계에 편입돼 있지 않다.

---

## §4. 갭 3건 (구현 대상)

1. **max 비교가 없다** — 상속 파트 취득가액이 평가액 그대로다.
2. **② 수집을 요구하지 않는다** — 게이트가 켜져도 취득시 기준시가를 묻지 않는다 ⇒ 사용자가 비우면 조용히 과대과세.
3. **토지 §164④ 입력 UI가 GB 상속에 없다** — `Pre1990LandValuationInput`은 `CompanionAcqPurchaseBlock`(매매)·`CommercialBuildingBlock`·`CommercialInheritanceStdPriceSection`(상가 상속)에만 있다.

> 🔴 **3번이 없으면 1번을 넣어도 토지분 세액은 안 바뀐다.** 1990.8.30. 이전 개별공시지가는 **존재하지 않으므로**(그날 최초 고시) 등급환산 외에 값을 얻을 방법이 없다 — 위젯 없이는 **입력 불가**다([[feedback_api_trigger_without_input_path_is_noop]]).

---

## §5. 설계

### 5-1. 게이트

| 파트 | 조건 | 근거 |
|---|---|---|
| 토지 | 상속개시일 < **1990-08-30** | §163⑨1호 문언 |
| 건물 | 상속개시일의 취득연도 ≤ **2000** (= §99①1호 나목 기준시가 고시 전) | §163⑨2호 + `building-standard-price.ts` 2001 경계 |

### 5-2. max 적용 위치 — **④ API 변환**

Phase 2의 A안이 「파트 슬롯이 취득가액의 정본」으로 정했으므로, 그 슬롯에 실을 값을 정하는 지점에서 max한다. `acquisitionByInheritance` 게이트도 이미 같은 파일(`transfer-tax-api-gb.ts:160~164`)에 있어 **판정이 한 곳에 모인다**.

```
landPartPrice     = 게이트 ? max(평가액, 취득시 토지 기준시가 총액) : 평가액
buildingPartPrice = 게이트 ? max(평가액, 취득시 건물 기준시가)     : 평가액
```

동점은 **평가액(①)** 우선 — 기존 `calcPostDeemed`가 `reported >= sec164 ? "reported" : "sec164"`로 그렇게 한다(표시 라벨만 갈리고 금액은 같다).

### 5-3. 토지 취득시 기준시가의 단일 진실

상가 `transfer-pre1990-commercial-bridge.ts` 패턴을 이식한다 — **3중 동일 fallback**([[mirror-pattern]]):

```
effectiveGbLandPriceAtAcq(asset) = 사용자 입력(gbAcqLandPricePerSqm)
                                 ?? §164④ 등급환산 파생값
```

UI display·④ API·⑧ validate가 **같은 함수**를 쓴다.

### 5-4. 변경 지점

| # | 파일 | 내용 |
|---|---|---|
| 신규 | `lib/calc/transfer-pre1990-gb-bridge.ts` | 게이트·파생·effective (상가 bridge 미러) |
| ④ | `transfer-tax-api-gb.ts` | 상속 파트 max |
| ⑧ | `transfer-tax-validate-gb.ts` | 게이트 시 ② 요구 + 3중 fallback |
| ⑤ | GB 상속 토지 영역 | `Pre1990LandValuationInput` + 안내 |
| ⑦ | `BundledAllocationCard.tsx` | §163⑨ 블록에 「max 채택분」 표시 |

---

## §6. Pre-Do anchor (착수 첫 작업)

- **M-1** 토지: 평가액 < §164④ → §164④ 채택 · 평가액 > §164④ → 평가액 유지 · **동점은 평가액**
- **M-2** 건물: 위와 동일 축(§164⑤)
- **M-3** 게이트 밖(1990-08-30 이후 상속 / 취득연도 ≥2001)은 **max 미적용** — 회귀 0
- **M-4** 세액까지 단언 (§2 실측 421,185,000 → 334,920,000)
- **M-5** ⑧ 게이트 시 ② 미입력 차단 · 게이트 밖에서는 요구 안 함(거짓 차단 금지)

⚠️ [[feedback_anchor_observes_wrong_stage]] — 중간값이 아니라 **결정세액까지** 단언한다.

---

## §7. 범위 밖

- **증여**의 §163⑨1·2호 max — 같은 조문이 증여도 포함하나 GB 증여는 평가액 전용 필드가 없다(자산/파트 실거래가 칸으로 받는다). 별건.
- 상속 × 증축(3파트) · 상속 × 부담부증여 — Phase 2 §7 그대로.
- §164⑥·⑦(오피스텔·상업용·주택) — GB 대상 아님.

---
관련: [[transfer-gb-inheritance-partial-phase2.plan.md]] · [[project_transfer_pre_deemed_164_max_and_clause_a_b]] · [[feedback_api_trigger_without_input_path_is_noop]] · [[mirror-pattern]] · [[feedback_anchor_observes_wrong_stage]]

---

## §8. 구현 완료 (2026-08-07)

### 8-1. 확정 사항

- **max는 ④ API 변환**에서 적용한다 — Phase 2의 A안이 「파트 슬롯이 취득가액의 정본」으로 정했고, `acquisitionByInheritance` 게이트도 같은 파일에 있어 **판정이 한 곳에 모인다**.
- **게이트 술어·상수는 상가 경로와 공유**한다(`LAND_PRICE_NOTICE_START` · `isBeforeBuildingStdPriceNotice`) — 갈리면 같은 조문에 두 정책이 생긴다.
- **동점은 평가액(①)** — `Math.max`가 그대로 그 규약이다(금액 동일, 근거만 갈림).

### 8-2. 🔑 경계가 파트마다 다르다

| 파트 | 게이트 | 조문 |
|---|---|---|
| 토지 | 상속개시일 **< 1990-08-30**(일자) | §163⑨1호 → §164④ |
| 건물 | 상속개시일의 **취득연도 ≤ 2000** | §163⑨2호 → §164⑤ |

**1995년 상속이면 건물만 게이트 안**이다. 하나로 묶으면 그 조합에서 틀린다 — anchor M-3에 잠갔다.

### 8-3. §164④ 등급환산 브리지 (신규)

`lib/calc/transfer-pre1990-gb-bridge.ts` — 상가 브리지의 미러(게이트·파생·effective 3단).

**3중 동일 fallback**([[mirror-pattern]]): UI display·④ API·⑧ validate가 `effectiveGbLandPriceAtAcq` **하나**를 쓴다. anchor M-6이 「취득시 공시지가 칸은 비우고 등급만 채운」 실제 사용 상황으로 그 관철을 잠근다.

> ⚠️ `buildGeneralBuildingValuation`에 `transferDate`를 **선택 인자**로 추가했다(상가 `buildCommercialBuildingValuation`과 같은 규약). 필수로 하면 테스트 21개 호출부를 함께 고쳐야 해 무관한 diff가 커진다. 프로덕션 호출부는 하나이고 항상 넘긴다.

### 8-4. 변경 지점

| # | 파일 | 내용 |
|---|---|---|
| 신규 | `transfer-pre1990-gb-bridge.ts` (116줄) | 게이트·파생·effective |
| ④ | `transfer-tax-api-gb.ts` | 상속 파트 `max(평가액, §164 가액)` + `transferDate` 인자 |
| ⑧ | `transfer-tax-validate-gb.ts` | **V-6** — 게이트 시 ② 비교값 요구 |
| ⑤ | `GeneralBuildingAcquisitionCards.tsx` | §164④ 등급환산 섹션(amber) + 취득시 공시지가 |
| ⑬ | `transfer-tax-api.ts` | 호출부에 `form.transferDate` 전달 |

> ⚠️ **§5-4가 열거한 ⑦(「max 채택분」 표시)은 넣지 않았다** — 조용히 뺀 것이 아니라 판단이다.
> Phase 2의 §163⑨ 블록이 **파트별 취득가액을 이미 표시**하므로 max 결과는 화면에 나온다.
> 추가로 「①·② 중 어느 쪽이 채택됐는가」를 보이려면 payload→엔진→detail 3계층에 새 echo
> 필드를 놓아야 하는데, 금액이 이미 맞으므로 **근거 라벨만을 위한** 배관이 된다.
> 필요해지면 별건으로 다룬다(단건 경로는 `sec164Amount`로 그 표시를 갖고 있다).

### 8-5. 게이트

| | 결과 |
|---|---|
| **Pre-Do anchor** | 13건 중 **6건 실패 · 7건 통과**(회귀 가드) — 정확한 분포 |
| **mutation probe** ①게이트 무시(항상 max) ②max→대체(평가액 우선 상실) | **2건 · 1건** 실패 |
| `npm test` | **14,345건** 통과 — 회귀 **0** |
| **E2E** | 신규 4건 + GB·상가 상속 계열 **19건** |
| `tsc` · `lint` | **0** · **0 errors** |
| 800줄 정책 | 최대 `GeneralBuildingAcquisitionCards` **543** |

### 8-6. 범위 밖 (§7 유지)

**증여**의 §163⑨1·2호 max는 넣지 않았다 — 같은 단서가 증여도 포함하나, GB 증여는 평가액 전용 필드가 없어(자산/파트 실거래가 칸으로 받는다) ①의 소스가 다르다. 별건으로 남긴다.
