# 일반건물 **상속·증여 × 증축**(3파트) — 차단 해제

> 상태: **Phase 1·2 구현 완료** (2026-08-07 · 2026-08-08) — §8·§9 참조.
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
| **2** | **부분** 상속·증여 + 증축 | ✅ 완료(2026-08-08) — §9 |

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

- ~~부분 상속·증여 × 증축~~ — ✅ Phase 2 완료(§9).
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

---

## §9. Phase 2 구현 완료 (2026-08-08) — 부분 상속·증여 × 증축

### 9-1. V-3 차단 사유의 실체는 **토지 취득일 미반영** 하나였다

§5는 「V-3 해제 판정이 선행」이라고만 남겼다. 착수해 재보니 V-3의 명시 사유(「3파트 축이라 2분할과 섞이지 않는다」)는 **실체를 가리키지 않았다**. 실제 갭은 3-way 카드 생성부가 토지 카드 **세 곳 모두** `input.acquisitionDate`(= **건물** 취득일)를 쓴 것 하나였다.

분리 ON(토지 1995 · 건물 2020) · 2026 양도 실측:

| | 토지 취득일 | 장기보유특별공제 합 |
|---|---|---|
| 증축 OFF | 1995 | 245,587,665 |
| **증축 ON** | 1995 (payload에 실림) | **81,999,999** |
| 증축 OFF · 토지도 2020 | 2020 | **81,999,999** |

증축 ON의 값이 「토지도 2020」과 **정확히 일치** ⇒ 토지의 31년 보유가 6년으로 계산됐다. payload는 값을 싣고 있었다(`route-helper.ts:127`) — #1137의 파트 가액과 같은 모양이다.

⇒ `landAcqDate = input.landAcquisitionDate ?? input.acquisitionDate` (2-way와 같은 식).

### 9-2. 그 과정에서 **더 큰 결함**이 드러났다 — 환산 파트 취득가액 0

V-3을 풀기 전에 「분리 ON + 증축 + 혼합 모드」를 재보니 **환산 파트의 취득가액이 0**이었다. 파고들자 그것이 분리 ON 전용이 아니라 **기존 경로에도 있는 결함**이었다:

| 케이스 | 종전 | 수정 후 |
|---|---|---|
| 분리 OFF · 증축 · 환산 모드 · 일괄칸 비움 | 토지 **0** · 건물1 **0** | 669,246,886 · 3,281,490 |
| 분리 ON · 증축 · 토지 실가 + 건물1 환산 | 건물1 **0** | 3,281,490 |
| 분리 ON · 증축 · 토지 환산 + 건물1 실가 | 토지 **0** | 669,246,886 |

원인: `route-helper`가 `actualBundledAcquisitionPrice`를 **항상 주입**하므로(0이어도 `!== undefined`) `isOriginActual`이 늘 true이고 **조합 C/D(환산 산식)에 production에서 도달하지 않는다**. 환산 파트가 일괄 안분값(=0)을 그대로 받았다.

⇒ 환산 산식을 `else` 밖으로 꺼내 **파트 단위로** 고르게 했다. 조합 A라도 그 파트가 환산이면 §176의2② 산식을 쓴다 — 일괄 취득가는 애초에 그 파트의 몫이 아니다.

**교차검증**: 「토지 실가 + 건물1 환산」의 건물1(3,281,490)과 장특공제(275,251,073)가 **증축 OFF 대조군과 정확히 일치**한다. 증축은 건물2를 더하는 축이므로 건물1의 환산취득가는 증축 유무와 무관해야 한다.

⚠️ **`?? "estimated"` 기본값을 쓰면 안 된다** — 파트 모드를 명시하지 않은 호출(엔진 직접 호출 테스트·레거시 payload)은 「환산이다」가 아니라 「원건물 모드를 따른다」는 뜻이다. 기본값으로 환산 취급했더니 사례 33의 일괄 안분(토지 164,880,819)이 통째로 뒤집혀 **전체 테스트 20여 건이 깨졌다**.

### 9-3. 변경 목록

| 층 | 파일 | 변경 |
|---|---|---|
| **엔진** | `general-building-extension.ts` | `landAcqDate` 도입(토지 카드 3곳) · 환산 산식을 파트 단위로 선택 가능하게 hoist |
| **⑧ validate** | `transfer-tax-validate-gb.ts` | V-3(증축 × 분리 ON) 차단 제거 · 「일괄 취득가액」 요구에서 **분리 ON 제외**(그 칸은 화면에 없다) |
| **⑤ UI** | `GeneralBuildingBlock.tsx` | 증축 카드 게이트에 `isSeparateAcq` 추가 — **부분 상속 × 증축의 유일한 입력 경로** |
| **anchor** | `gb-extension-part-acq-date.anchor.test.ts` | P2-1~P2-4, 12건 |
| **E2E** | `general-building-inheritance-extension.spec.ts` | X-4·X-5·X-6 추가 (총 7건) |

### 9-4. 기존 anchor 2건을 근거와 함께 갱신했다

- `gb-separate-validate.anchor.test.ts` 「V-3 증축 조합 → 차단」 → 차단하지 않음으로 반전.
- `general-building-extension-transfer-expense.anchor.test.ts` W-1b 차액 **121,962,280 → 92,942,585**. 이 테스트의 주제(「양도비를 나목에 넣는 것이 세액을 바꾼다」)는 불변이고 `directSide` 단언도 그대로다. 종전 차액이 **가목(환산취득가+개산공제)이 0인 상태**에서 잰 값이었기 때문에 9-2의 수정으로 크기가 달라졌다.

### 9-5. 회귀 0 근거

- **전체** `npx vitest run` → **1290 파일 / 14,450 테스트 전건 통과** · `tsc --noEmit` 0건
- GB E2E 14건 + 신규 spec 7건 통과
- 회귀 가드: anchor P2-4(조합 A 일괄 안분 796,096,533/3,903,467 고정 · 분리 OFF 증축 장특 81,999,999) · E2E X-2(매매+실가+분리 OFF는 증축 카드 미표시)

### 9-6. 남은 것 → **§10에서 종결** (서술이 둘 다 틀렸다)

> 🔴 아래 두 줄은 **2026-08-08 실측으로 폐기**했다. 기록으로만 남긴다.
>
> - ~~**부담부증여 × 분리 ON**(V-4)은 그대로 막는다 — §159가 채무비율로 자동 산정하므로 파트 분리가 성립하지 않는다.~~
> - ~~**부분 상속 × 분리 OFF**(V-5)도 그대로 막는다 — 비상속 파트의 취득가액이 자산 단위 총액으로만 들어와 이중계상이 된다.~~
>
> 두 줄 모두 **관찰이 아니라 추정**이었다. 착수해 처음 한 일이 서술 검증이었고, 그 자리에서 갈렸다
> (memory `feedback_open_item_wording_is_also_unverified`).

---

## §10. 미결 2건 종결 (2026-08-08) — V-4 · V-5

### 10-1. V-4 부담부증여 × 분리 ON — **막고 있지 않았다**

「그대로 막는다」가 **관찰부터 틀렸다**. `transfer-tax-validate-gb.ts`의 부담부증여 분기는 자체 검증을 마치고 `return null`로 빠져나가므로, 그 아래 `isSeparate` 블록의 V-4 차단은 **한 번도 실행되지 않는 코드**였다.

```
분리 ON  → null
분리 OFF → null      ← validate 직접 호출 실측
```

사유였던 「§159가 자동 산정하므로 파트 분리가 성립하지 않는다」도 **축을 혼동한 것**이다. 「소득세법 시행령」 제159조는 표제 그대로 「부담부증여에 대한 **양도차익의 계산**」이라 채무비율로 정하는 것은 **양도가액·취득가액**뿐이다. 보유기간은 「소득세법」 제95조 제4항이 「**그 자산의 취득일**부터 양도일까지」로 따로 정하고, 토지와 건물은 제94조 제1항 제1호가 **별개 자산**으로 열거한다.

라우트 실가 경로는 이미 파트별로 맞게 계산한다(`landCardDate`/`buildingCardDate`). 사례 34 기준시가 · 2026 양도 실측:

| 취득일 | 산출세액 |
|---|---|
| 토지·건물 모두 1998-09-07 | 740,219,533 |
| **토지 1998 · 건물 2023 (정답)** | **750,312,627** |
| 토지·건물 모두 2023-01-01 | 1,017,002,802 |

차단이 살아 있었다면 사용자는 한 칸에 날짜 하나만 넣을 수 있으므로 위·아래 둘 중 하나로 몰렸다 — **10,093,094원** 또는 **266,690,175원** 어긋난다. ⇒ 도달 불가 차단을 **삭제**하고, 되살리면 안 되는 이유를 그 자리에 남겼다.

#### 그 자리에서 **진짜 결함**이 나왔다 — §159가 무시하는 칸이 열려 있다

차단이 없으므로 부담부증여 × 분리 ON은 **이미 열려 있었다**. 그런데 분리 ON은 `PartAcqModeField`(파트 취득가액 산정 방식·취득가액·자본적지출)를 함께 연다 — 그리고 그 축은 **§159가 통째로 덮어쓴다**(`general-building-route-actual.ts:336-337`). 실측으로 파트 취득가액에 9,999,999,999를 넣어도 세액이 변하지 않는다.

바로 위 상속 파트 주석이 같은 이유로 이미 숨기고 있었고(`feedback_ui_engine_dual_truth_avoidance`), `LandBuildingSplitSection.tsx:397`도 같은 판단을 택했다 — **`PartAcqModeField`만 예외였다**.

⇒ `asset.transferType === "burdened_gift"`이면 `null`을 반환한다.

> ⚠️ **입력 경로는 사라지지 않는다.** 부담부증여 K-4(실지취득가 안분)는 `bgActualAcquisitionLand` 등 **전용 필드**를 쓰고(`transfer-tax-api-burdened-gift.ts:86-97`) 그 칸은 `BurdenedGiftBlock`에 따로 있다. 여기서 숨기는 것은 §159가 무시하는 축뿐이다.

### 10-2. V-5 부분 상속 × 분리 OFF — 차단은 옳고, **사유가 틀렸다**

「이중계상」이라고 적었으나 이중으로 세는 일은 일어나지 않는다. 실체는 **상속 평가액의 소실**이다.

실가 경로의 분기 셋 중 앞의 두 AND 게이트(`acquisitionByInheritance && buildingAcquisitionByInheritance` · `hasBothPartPrices`)가 부분 상속 + 분리 OFF에서 **둘 다 false**로 떨어진다 — 비상속 파트는 파트 칸이 화면에 없어 값이 없기 때문이다. ⇒ 자산 단위 총액의 기준시가 안분만 남는다.

| 케이스 | 토지 취득가액 | 건물 취득가액 |
|---|---|---|
| 상속 평가액 5억 + 총액 8억 | 796,096,533 | 3,903,467 |
| **상속 신호가 아예 없음** | **796,096,533** | **3,903,467** |

두 줄이 **완전히 같다** — 평가액이 계산에 도달하지 않는다. 사용자가 남은 자산 단위 칸에 건물분 3억만 넣으면(상속분은 전용 칸에 이미 넣었으니 자연스러운 입력) 토지 취득가액이 5억 대신 298,536,200이 되어 **147,000,000원 과대과세**다.

**차단이 정답인 이유**는 고칠 대상이 엔진의 배정 규칙이 아니라 **입력 모델**이기 때문이다. 분리 OFF의 취득가액 칸은 「토지·건물 **일괄**」이라는 하나의 뜻이고, 부분 상속에서 그것을 「비상속 파트의 취득가액」으로 다시 읽으면 같은 필드가 문맥에 따라 두 의미가 된다(3중 mirror 위반). 부분 상속이면 두 파트의 취득 시점이 **실제로 다르므로** 분리 ON이 사실에 맞는 입력이다(§95④).

> 📌 **현행 UI에서 이 차단은 잔존 방어다.** 분리 OFF는 단일 취득원인 라디오 하나뿐이라 화면 조작으로는 부분 상속을 만들 수 없고, 저장된 세션은 M-2b 마이그레이션이 로드 시 **분리 ON으로 승격**한다(`calc-wizard-asset-migrate-phase3.ts:96` · E2E `PI-4`). 남는 도달 경로는 레거시 payload·API 직접 호출이다.

### 10-3. 변경 목록

| 층 | 파일 | 변경 |
|---|---|---|
| **⑧ validate** | `transfer-tax-validate-gb.ts` | V-4 **도달 불가 차단 삭제** + 되살리면 안 되는 근거 · V-5 사유를 「이중계상」→「소실」로 정정 |
| **⑤ UI** | `GeneralBuildingAcquisitionCards.tsx` | `PartAcqModeField`에 부담부증여 게이트 — §159가 무시하는 축을 숨긴다 |
| **④ API 주석** | `transfer-tax-api-gb.ts` | V-5 사유 정정 |
| **anchor** | `gb-burdened-gift-split-date.anchor.test.ts` (5건) | 파트 취득일이 세액을 가른다 · ④ payload 형태 불변식 · 파트 가액 무시 · validate 통과 |
| **anchor** | `gb-partial-inheritance-split-off-grounds.anchor.test.ts` (4건) | 평가액 소실 · 1.47억 과대과세 · 차단과 그 목적지가 열려 있음 |
| **E2E** | `general-building-burdened-gift-split.spec.ts` (4건) | 토글 실재 · 취득일 2칸 · 파트 취득가액 축 미노출 · 계산 도달 |

### 10-4. 이번에 걸린 함정 — **무의미하게 통과한 E2E**

BG-3의 첫 단언은 `LandBuildingSplitSection`의 `part-acq-mode-land`를 봤다. 4건 전부 통과했지만, mutation probe(부담부증여를 일반 양도로 바꾸면 그 칸이 **보여야 한다**)를 돌리자 **일반 양도에서도 0개**였다 — `isSplitable = assetKind === "housing" || "building"`이라 **일반건물에서는 애초에 렌더되지 않는 컴포넌트**였다. 부담부증여와 무관하게 항상 통과하는 단언이었다.

일반건물의 파트 축은 `PartAcqModeField`다. 대상을 바꾸자 mutation probe가 **0 vs 2**로 갈렸고, 그제야 게이트가 없다는 진짜 결함이 드러났다.

> 🔑 **`toHaveCount(0)`은 mutation probe 없이는 증거가 아니다.** 「없음」을 단언할 때는 「있어야 하는 조건」에서 실제로 나오는지 반드시 반대 방향으로 확인한다.

### 10-5. ✅ 부담부증여 × 상속·증여 취득원인의 취득가액 칸 (2026-08-08 종결)

부담부증여에서 취득원인을 **상속**·**증여**로 고르면 각 블록이 취득가액 칸을 띄우는데, §159가 그 값을 덮어쓴다. 착수해 서술을 검증했고 **맞았다** — 다만 범위가 예상보다 넓었다.

#### 실측 — 전 자산종류가 같다

| 주입 | 결과 |
|---|---|
| 상속 평가액 50억(토지)·9억(건물) | 세액 **불변** |
| 증여 신고가액 77억 | 세액 **불변** |
| `acquisitionPrice` 0 vs 50억 (일반건물·주택·토지·상가) | **네 종류 모두 불변** |
| ⑧ validate(부담부증여 + 상속, 평가액 공란) | `null` — 요구하지도 않는다 |

일반건물만의 문제가 아니었다. `runBurdenedGiftStep`이 `workingInput.acquisitionPrice`를 §159 안분값으로 덮어쓰므로 **자산종류와 무관**하다. 그리고 **매매 경로는 이미 숨기고 있었다**(`CompanionAcqPurchaseBlock.tsx:262` — 전 자산종류) — 상속·증여만 예외였다.

⇒ 대칭으로 맞췄다. 날짜 축(상속개시일·피상속인 취득일 / 증여일·증여자 취득일)은 **보유기간(§95④)·단기보유 통산(§104②1·2호)** 에 쓰이므로 남기고, 취득가액 축만 §159 안내 카드로 대체한다.

| 층 | 파일 | 변경 |
|---|---|---|
| ⑤ UI | `CompanionAcqInheritanceBlock.tsx` | `isBurdenedGift`면 취득가액 축(`InheritedAcquisitionDeemedSection`·상가/겸용 안내) 대신 §159 안내 |
| ⑤ UI | `CompanionAcqGiftBlock.tsx` | `isBurdenedGift` prop 신설 — 「증여 신고가액」 칸 대신 §159 안내 |
| ⑤ UI | `GeneralBuildingAcquisitionCards.tsx` | `GbBuildingInheritedValueCard` 2곳 게이트 + 증여 블록에 prop 전달 |
| ⑤ UI | `CompanionAcquisitionCauseSection.tsx` | 비-일반건물 경로에도 같은 prop 전달 |
| anchor | `burdened-gift-acq-price-ignored.anchor.test.ts` (5건) | 네 자산종류 × 취득가액 0 vs 50억 동일 · 네 종류 상호 동일 |
| E2E | `transfer-burdened-gift-acq-cause-price.spec.ts` (4건) | 상속·증여 칸 소멸 · **일반 양도 대조군** · 날짜 축 보존 |

> 🔑 **IG-3(일반 양도 대조군)을 spec 안에 넣었다.** §10-4에서 배운 대로, 부정 단언은 양성 대조군이 같은 파일에 있어야 「대상을 잘못 짚어서 0」인 경우를 영구히 걸러낸다. 던져 버리는 mutation probe보다 낫다.

#### 🟠 남은 것 — 이월과세(증여) 취득원인

취득원인 라디오의 **「이월과세(증여)」**(`carryover_gift`)는 이번 범위에서 제외했다. 다른 셋과 달리 **칸 노출 문제가 아니라 성립 여부 자체가 미판정**이기 때문이다 — 「소득세법」 제97조의2 이월과세는 「배우자·직계존비속으로부터 증여받은 자산」을 양도할 때 적용되는데, 부담부증여의 양도자는 **증여자 본인**이다. 증여자가 자기 배우자에게서 10년 내 증여받은 자산을 부담부증여하는 경우 §97의2가 적용되는지는 **법령 확인이 선행**이어야 한다.

> ⚠️ `burdened-gift-apportionment.ts:12`의 「양도자 = 증여자 본인이므로 §97의2 미적용」은 **이번 부담부증여가 이월과세를 촉발하지 않는다**는 뜻이지, 증여자의 **선행 취득**에 §97의2가 붙지 않는다는 판정이 아니다. 두 문장을 같은 것으로 읽지 말 것.
