# 일반건물 **상속·증여 × 증축**(3파트) — 차단 해제

> 상태: **Phase 1 구현 완료** (2026-08-07) — §8 참조. Phase 2(부분 상속 × 증축)는 미착수.
> 발단: [[transfer-gb-inheritance-partial-phase2.plan.md]] §7 · [[transfer-gb-inheritance-164-max-phase3.plan.md]] §10이 남긴 미결.
> 선행 종결: 취득가액 축 #1130~#1135 · 의제취득일 축 [[transfer-gb-pre1985-163-9.plan.md]] §6-1.

---

## §1. 현재 상태 — **하드 차단**이고, 그 차단은 **정당하다**

`lib/calc/transfer-tax-validate-gb.ts`가 두 곳에서 막는다:

| 줄 | 조건 | 메시지 |
|---|---|---|
| :131 | 상속 파트 있음 + `gbHasExtension` | 「상속 취득 일반건물은 증축 조합을 지원하지 않습니다. 증축 토글을 끄세요.」 |
| :209 | 증여 파트 있음 + `gbHasExtension` | 「증여 취득 일반건물은 증축 조합을 지원하지 않습니다. … (소득세법 시행령 §163⑨)」 |

주석의 사유는 「상속 평가액 배정 경로가 **2파트 전제**다」였다. **그 서술을 검증했고, 맞다.**

### 1-1. 차단을 풀면 무슨 값이 나오는가 (probe 실측, 2026-08-07)

2005-05-01 상속 · 상속개시일 평가액 토지 5억·건물 3억 · 양도가 16.2억 · 2026-02-16 양도.
증축은 2015-06-01 자가증축, 실가 3억.

| | 토지 | 건물1 | 건물2 | 산출세액 |
|---|---|---|---|---|
| 증축 OFF (대조군) | 500,000,000 | 300,000,000 | — | 204,090,000 |
| **증축 ON (차단 해제 시)** | **0** | **0** | 300,000,000 | **313,290,000** |

**상속 평가액 8억이 통째로 사라진다.** 사용자가 요구받아 입력한 값이 계산에 도달하지 않는다.
⇒ 차단이 없었다면 **침묵 과대과세**였다. 지금의 차단은 「구현 안 됨」의 정직한 표현이고, **먼저 배정 경로를 만들지 않고 차단만 푸는 것은 금지**다.

### 1-2. 일괄 취득가 칸으로 우회할 수 없다

「토지+건물1 일괄 취득가」(`bundledAcquisitionPrice` ← `asset.fixedAcquisitionPrice`, `transfer-tax-api-gb.ts:409`)에 8억을 넣어 봤다:

| 주입 | 토지 | 건물1 |
|---|---|---|
| 일괄 8억 | **796,096,533** | **3,903,467** |

엔진이 **취득시 기준시가 비율**로 재분할한다(토지 2,800,000 × 205㎡ = 574,000,000 vs 건물 2,814,470 ≈ 99.5 : 0.5). 평가액의 파트별 값(5억 : 3억)이 **보존되지 않는다**.

§163⑨은 「상속 또는 증여받은 자산」의 평가액을 **자산별로** 취득당시 실지거래가액으로 보는 규정이다. 두 파트의 평가액을 합쳐 기준시가로 되나누는 것은 그 조문이 정한 값을 버리는 것이다. ⇒ **우회로 없음.**

---

## §2. 근본 원인 — 증축 분기가 `applyPartAcqModes`를 **우회한다**

```
lib/tax-engine/general-building-valuation.ts
  :286   if (input.extensionInfo) {
  :297       return buildGeneralBuildingAssetCardsWithExtension(input, input.extensionInfo);  ← 여기서 끝
         }
  :326   const partAcq = applyPartAcqModes(input, acquisitionConverted, estimatedDeductionConverted);
```

`applyPartAcqModes`(`general-building-part-acq.ts`, 145줄)가 파트별 실지거래가액을 적용하는 **단일 정본**인데, 증축은 :297에서 먼저 return하므로 **한 번도 호출되지 않는다**.

그래서 payload에 값이 **실려 있어도** 무시된다 — probe에서 확인:

```
증축 ON payload: landAcquisitionPrice=500000000  buildingAcquisitionPrice=300000000
                 inheritedLandValue=undefined    inheritedBuildingValue=undefined
결과:            [land] 0   [building] 0   [building2] 300,000,000
```

두 가지가 겹쳐 있다:

1. **`landAcquisitionPrice`/`buildingAcquisitionPrice`는 실려 있는데 3-way 경로가 안 읽는다** (`partModePayload`는 환산 payload에도 spread된다 — `transfer-tax-api-gb.ts:349~351`).
2. **`inheritedLandValue`/`inheritedBuildingValue`는 아예 안 실린다** — 그 둘은 `gbInheritanceFields`에 있고, 그건 **실가 경로 return에만** spread된다(`:271~275`). 증축은 `anyEstimated || gbHasExtension`(`:354`)로 **무조건 환산 경로**라 도달하지 않는다.

⚠️ 1번이 본체다. 2번은 표시·검증용 echo라 계산에는 1번으로 충분하다 — ④가 이미 파트 가격을 `landAcquisitionPrice`/`buildingAcquisitionPrice` 슬롯에 **§164 max까지 적용해서** 싣고 있기 때문이다(`:329~339`). **새 필드를 만들 필요가 없다.**

---

## §3. 법령 — 3파트의 성질이 서로 다르다

| 파트 | 취득원인 | 취득가액 근거 |
|---|---|---|
| 토지 | 상속·증여 | 「소득세법 시행령」 제163조 제9항 — 상속개시일·증여일 평가액을 「실지거래가액으로 **본다**」 (미공시 시기면 같은 항 단서로 §164④ 가액과 **max**) |
| 건물1(본체) | 상속·증여 | 위와 같음 (단서 2호 → §164⑤~⑦과 max) |
| 건물2(증축분) | **매매·자가증축** | §163⑨ **대상 아님** — 별개 취득이다 |

건물2가 §163⑨ 대상이 아니라는 것은 코드가 이미 전제하고 있다 — `transfer-tax-validate-gb.ts:439`가 증축 취득원인을 「**매매·자가증축** 중」으로만 받는다(상속·증여 선택지가 없다).

⇒ **설계가 단순해진다**: 토지·건물1은 §163⑨ 평가액(실가), 건물2는 자기 취득가액(실가 or 환산). 세 파트가 각자 완결되며 서로의 값을 안분하지 않는다.

**개산공제(§163⑥)**도 파트별로 갈린다 — 「소득세법」 제97조 제2항은 제1호(실지거래가액)와 제2호(그 밖의 경우)를 나누고 개산공제는 **제2호에만** 붙는다. 상속 파트는 가목(실가)이므로 **미적용**, 건물2가 환산이면 **적용**. 이 규칙은 `applyPartAcqModes`가 이미 정확히 구현하고 있다(`landDeductible = landMode !== "actual"`, `part-acq.ts:101`).

---

## §4. 설계 — 3-way 경로에 파트별 취득방식을 태운다

### 4-1. 엔진 (핵심)

`general-building-extension.ts`의 `buildGeneralBuildingAssetCardsWithExtension`(457줄, 단일 export)이 토지·건물1의 환산취득가를 산출한 직후, 2-way 경로와 **같은 함수**로 파트 방식을 적용한다:

```ts
const partAcq = applyPartAcqModes(input, { land, building: building1 }, { land: dl, building: db1 });
```

- **함수를 새로 만들지 않는다.** dual-truth 회피(`feedback_ui_engine_dual_truth_avoidance`) — 2-way와 3-way가 §97② 판정을 각자 구현하면 반드시 갈라진다.
- 건물2는 `extensionInfo.acquisitionMode`로 **이미** 독립 처리된다 — 손대지 않는다.
- `missingParts`가 비어 있지 않으면 호출부가 차단한다(기존 규약 그대로).

### 4-2. ④ API 변환

**변경 불요일 가능성이 높다** — `partModePayload`가 환산 payload에도 spread되고(`:349~351`), 파트 가격은 §164 max까지 적용된 값이다. **Do 착수 첫 작업으로 재확인할 것**(payload 실측 완료: 두 필드 모두 존재 확인됨).

### 4-3. ⑧ validate

- `:131`·`:209`의 증축 차단 **제거**.
- 대신 **파트 축 요구를 증축에도 적용**: 상속 파트면 평가액(`publishedValueAtInheritance`/`gbBuildingInheritedValue`), 증여 파트면 파트 취득가액. 기존 V3·V4·V-7이 이미 그 검증을 하므로 **증축 게이트 밖으로 꺼내면 된다**.
- `:263`의 「증축 × 분리 ON」 차단(V-3)은 **별건**이다 — §5 참조.

### 4-4. ⑤ UI

상속 평가액 입력 카드와 증축 토글이 **동시에 보이는지 미확인**. `GeneralBuildingAcquisitionCards.tsx`의 렌더 조건을 실측할 것. 안 보이면 「API는 받는데 입력할 방법이 없다」가 된다(`feedback_api_trigger_without_input_path_is_noop`).

---

## §5. 선행 판정이 필요한 것 — 증축 × 분리 ON

`:263`이 「증축(건물2)과 「토지·건물 취득일 다름」은 함께 지원하지 않습니다」로 막는다.

그런데 **부분 상속은 분리 ON을 요구한다**(V-5, `:132~`). 즉 **「토지만 상속 + 증축」은 두 차단이 정면 충돌**한다 — V-5는 분리 ON을 켜라 하고 V-3은 끄라 한다. **dead-end다.**

⇒ 범위를 이렇게 나눈다:

| Phase | 조합 | 비고 |
|---|---|---|
| **1** | 토지·건물1 **둘 다** 상속(또는 둘 다 증여) + 증축 | 분리 OFF로 성립 — 충돌 없음 |
| **2** | **부분** 상속·증여 + 증축 | V-3 해제가 선행. 별건 판정 필요 |

Phase 1만으로도 §1의 침묵 과대과세 경로가 닫힌다.

---

## §6. 착수 순서 (Do)

1. **Pre-Do anchor** — §1-1 실측값을 **현행 차단**으로 고정(차단 메시지 단언) + 해제 후 기대값 표를 실패 상태로 작성.
   기대값은 「증축 OFF 대조군의 토지·건물1 취득가액이 증축 ON에서도 같아야 한다」 = 500,000,000 / 300,000,000.
   → verify: anchor 작성 시점에 **실패**할 것(통과하면 관측 지점이 틀린 것 — `feedback_anchor_observes_wrong_stage`)
2. **엔진** — `general-building-extension.ts`에 `applyPartAcqModes` 적용.
   → verify: 1의 anchor 통과 + `npx vitest run __tests__/tax-engine/transfer-tax/` 회귀 0
3. **⑧ validate** — 증축 차단 2건 제거, 파트 요구를 증축 밖으로.
   → verify: 「평가액 비우면 차단」·「채우면 통과」 양방향 anchor
4. **⑤ UI 실측** — 상속 평가액 카드 + 증축 토글 동시 표시 확인. 안 되면 조건 수정.
   → verify: E2E로 두 영역이 같은 화면에 보이는 것을 단언(`feedback_browser_verify_with_playwright`)
5. **14 지점 self-grep** (⑫⑬⑭ 침묵 strip) + `npm run check:pre-pr`

⚠️ **3을 2보다 먼저 하지 말 것** — 차단만 풀면 §1-1의 침묵 과대과세가 그대로 사용자에게 나간다.

---

## §7. 범위 밖

- **부분 상속·증여 × 증축** — §5 Phase 2. V-3(증축 × 분리 ON) 해제 판정이 선행.
- **상속·증여 × 부담부증여** — 별건. 조사 결과 침묵 0은 **아니다**: 부담부증여 K-4(실지취득가 안분)는 「증여자 실지취득가액」 **전용 칸**(`actualLandAcquisitionPrice`·`actualBuildingAcquisitionPrice`, `transfer-burdened-gift.types.ts:151~155`)을 따로 받으므로 `engineInput.acquisitionPrice`(상속 제외) 경로를 타지 않는다. 남는 쟁점은 「그 칸이 §163⑨ 평가액이어야 한다는 안내·검증이 없다」는 **가이드 공백**이지 오계산이 아니다.
- **§9-3 `hasBothPartPrices` AND** — 도달 불가 코드(`general-building-route-actual.ts:374~378`). 구조만 남겨 둔 상태 유지.
- **⑦ 「①·② 중 채택분」 라벨** — [[transfer-gb-inheritance-164-max-phase3.plan.md]] §8-4. 금액은 이미 화면에 나오므로 근거 라벨만을 위한 3계층 배관은 보류.

---

## §8. Phase 1 구현 완료 (2026-08-07)

| 층 | 파일 | 변경 |
|---|---|---|
| **엔진** | `lib/tax-engine/general-building-extension.ts` | **Step 2.5 신설** — 2-way와 **같은 함수** `applyPartAcqModes`를 3-way에도 태운다. 파트 값이 있는 파트만 덮고, 없는 파트는 종전 산출값(조합 A 일괄 안분 · C/D 환산) 유지. 개산공제(§163⑥)·`usedEstimatedAcquisition`을 파트별로 분리(`originUsedEstimated` → `landUsedEstimated`/`building1UsedEstimated`) |
| **⑧ validate** | `lib/calc/transfer-tax-validate-gb.ts` | 증축 하드 차단 2건(상속·증여) 제거 · 「토지·건물 일괄 취득가액」 요구에서 **상속 파트 제외**(평가액 칸으로 받으므로 일괄 칸은 화면에 없다 — dead-end 회피) |
| **⑤ UI** | `components/calc/transfer/GeneralBuildingBlock.tsx` | 증축 카드 게이트에 `bothPartsSuccession` 추가. **이것이 없으면 전체가 no-op**이었다 — §8-1 |
| **anchor** | `__tests__/tax-engine/transfer-tax/gb-inheritance-extension-3part.anchor.test.ts` | E3-1~E3-4, 11건 |
| **E2E** | `e2e/general-building-inheritance-extension.spec.ts` | X-1·X-1b·X-2·X-3, 4건 |

### §8-1. ⑤가 없으면 ①②가 무의미했다

엔진·validate를 고친 뒤 UI를 실측하니 **상속·증여에서는 증축을 켤 방법이 없었다**:

- 증축 카드는 `GeneralBuildingBlock.tsx`에서 `isEstimated || gbHasExtension`일 때만 렌더된다.
- 상속·증여는 §163⑨이 실가를 강제하므로 `isEstimated`가 **항상 false**다.
- 증축을 켜는 다른 진입점 「토지·건물 일괄(증축분 별도)」 라디오는 `CompanionAcqPurchaseBlock` — **매매 전용**이다.

⇒ 토글이 이미 켜져 있어야만 토글이 보이는 닭-달걀 구조였다. `bothPartsSuccession`(둘 다 상속 / 둘 다 증여)을 게이트에 더해 해소했다. `feedback_api_trigger_without_input_path_is_noop`의 교과서적 사례다.

### §8-2. 회귀 0 근거

- `npx vitest run __tests__/tax-engine/transfer-tax/ __tests__/calc/` → **308 파일 / 3609 테스트 전건 통과**
- `npx tsc --noEmit` 0건
- E2E X-2가 **매매 + 실가에서 증축 카드가 뜨지 않음**을 단언한다(게이트를 넓히다 종전 경로를 열어버리는 회귀 차단)
- anchor E3-4가 **매매 + 증축의 일괄 안분값**(796,096,533 / 3,903,467)을 그대로 잠근다 — Step 2.5가 조합 A를 건드리지 않았음의 증거
