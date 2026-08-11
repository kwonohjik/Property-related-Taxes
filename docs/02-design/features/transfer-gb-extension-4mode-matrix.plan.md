# 일반건물 증축 — 원취득 × 증축분 취득방식 4조합 전면 지원 계획서

- 작성일: 2026-08-12 · **개정 1: 2026-08-12 (자가 검토 후)** · **개정 2: 2026-08-12 (§14 O-3 후속 — D-11)**
- 브랜치/워크트리: `worktree-building-extension-transfer` (베이스 `a51c55dc`)
- 대상: 양도소득세 · `assetKind === "general_building"` · `gbHasExtension === true`
- 관련 기존 문서: `case-33-general-building-extension.engine.design.md` · `transfer-gb-inheritance-extension-3part.plan.md`

> ## 개정 1 요약 — 초안에서 **뒤집힌 것**
>
> | 항목 | 초안 | 개정 1 | 근거 |
> |---|---|---|---|
> | **O-1** (환산+증축에서 필요경비 미반영 의심) | 🟡 미결 — 「결함 가능성」 | **✅ 결함 아님으로 종결** | 소액 픽스처는 §97②2호 swap 미발동이라 **구별력이 없었다**. 거액 픽스처로 재측정하니 정상 반영 |
> | **양도비 축** | 언급 없음 | 🔴 **D-10 신설 — 실측 28,979,117원 과대** | O-1 재검증 중 발견. 조합 C·D에서 양도비가 나목에서 부당 배제 |
> | Phase 3 구현 방법 | 「카드의 `usedEstimatedAcquisition`에서 파생」 | **경로 정정** — `PerPropertyBreakdown`엔 그 필드가 **없다**. `aggregated.generalBuildingValuationDetail.assetCards` 경유 | `transfer-result.types.ts:456` Pick 목록 확인 |
> | 지분(%) 분할 경로 | 미확인 | **✅ 안전 확인** | `transfer-tax-api-gb-shares.ts:69`가 기준시가를 물건-수준으로 복사, `applyShareScale`이 스케일 제외 |
> | UI 축 재설계 | 「3번째 라디오 의미 재정의」 단일안 | **3안 제시 + 추천 + 사용자 결정 필요** | 축이 2개인데 라디오 1축으로 뭉친 구조 문제 |
> | 기존 테스트 영향 | 언급 없음 | **`general-building-extension-transfer-expense.anchor.test.ts:127-133`이 D-10 수정으로 깨진다** | 그 테스트 픽스처가 조합 C다 |
>
> 초안의 O-1 오판은 메모리 `feedback_negative_assertion_needs_mutation_probe`가 경고하는 형태였다 —
> **대상이 다른 이유(swap 미발동)로 무영향인데 결함으로 오인**했다.
>
> ## 개정 2 요약 — 개정 1에서 **뒤집힌 것**
>
> | 항목 | 개정 1 | 개정 2 | 근거 |
> |---|---|---|---|
> | **O-3** (부분 혼합 × 증축의 양도비) | 🟡 별건 후보 — 「실가 파트가 소비하므로 이중계상 위험이 남는다」·「현행과 동일해 악화되지 않는다」 | 🔴 **D-11 신설 — 실측 58,948,319원 과대** | 분리 ON에서 `bundledExpenses`를 0→5억으로 바꿔도 세액 **불변**. stale 일괄취득가 9억도 무시됨 ⇒ **소비되지 않는다** |
> | D-11 범위 | (부분 혼합만 상정) | **분리 ON × 증축 전부** — 둘 다 실가도 동일 | `payload.transferExpense`가 세 조합 모두 `undefined` |
>
> 개정 1의 O-3 오판은 **개정 1이 스스로 경고한 것과 같은 형태**다 — 「소비된다」를 mutation으로
> 재지 않고 코드 독해로 단정했다. **게이트 조건을 바꿀 때는 그 조건이 가르는 모든 분기에
> mutation을 돌린다**가 이번의 교훈이다(§14 O-3 항목에 남김).

---

## 1. 사용자 요청 (원문 취지)

> 「토지·건물 일괄(증축분 별도)」 아래 팁에는 **원취득분은 실가, 증축분은 환산** 케이스만 가능한 것처럼
> 표시되어 있다. 그런데 증축분에는 **환산모드·실가모드 라디오가 둘 다** 보인다.
> 이 부분이 어떻게 구현되어 있는지 파악하고, **당초 취득분도 실가·환산, 증축분도 실가·환산 —
> 4조합 모두 계산 가능**하게 수정할 것.

---

## 2. 결론 요약 (실측 기반)

**엔진(Layer 2)은 4조합의 취득가액 산식을 이미 갖추고 있다.** 갭은 **④ API 변환 · ⑧ validate · ⑫ Zod ·
⑤ UI · ⑦ 결과 화면**에 있고, 그중 **둘은 세액을 틀리게 만드는 실동작 결함**이다.

| 조합 | 원건물 | 증축분 | 증축분 양도가액 | 양도비(§97②2호 나목) | 판정 |
|---|---|---|---|---|---|
| **A** | 실가 | 환산 | 정상 | 정상 | ✅ |
| **B** | 실가 | **실가** | **0** 🔴 D-1 | 정상 | 🔴 |
| **C** | 환산 | 환산 | 정상 | **배제됨** 🔴 D-10 | 🔴 |
| **D** | 환산 | **실가** | **0** 🔴 D-1 | **배제됨** 🔴 D-10 | 🔴 |

**조합 A만 온전하다.** UI 문구·라디오 축·결과 화면 배지도 A 하나만 서술한다.

---

## 3. 현행 구현 — 실행 경로

```
⑤ GeneralBuildingBlock.tsx           증축 ToggleCard + 「증축분 취득 방식」 서브 라디오
   └ CompanionAcqPurchaseBlock.tsx    「취득가액 산정 방식」 라디오 3옵션
④ lib/calc/transfer-tax-api-gb.ts
   · :373  if (anyEstimated || gbHasExtension) → 증축이면 **항상 환산 payload 분기**(actualPriceMode 미설정)
   · :29   buildExtensionInfo() → extensionInfo 서브객체
   · :481  transferExpense 게이트  (!gbHasExtension || gbBundledAcquisitionExpenses)
⑫ lib/api/transfer-tax-building-schemas.ts:212 extensionInfo (superRefine :246~)
⑭ app/api/calc/transfer/route.ts:392~439 → dispatchGeneralBuilding
   · general-building-route-helper.ts:139 actualPriceMode 분기 (증축은 늘 false 쪽)
   · :194 extensionInfo에 actualBundledAcquisitionPrice / actualBundledExpenses **항상** 주입
Layer2 lib/tax-engine/general-building-extension.ts
   · :190 isOriginActual = actualBundledAcquisitionPrice !== undefined  ⇒ **늘 true**
   · :322 landIsConverted / buildingIsConverted = landAcqMode/buildingAcqMode === "estimated"
   · :328-338 원건물 환산 파트는 일괄 안분값을 버리고 §176의2② 환산값으로 **덮는다**
   · :356 extensionMode = ext.acquisitionMode ?? "estimated"
⑦ components/calc/results/transfer/GeneralBuilding3WayTable.tsx  (BundledAllocationCard.tsx:588에서 렌더)
```

원건물 환산(C·D)은 `useEstimatedAcquisition` → `effectivePartAcqMode` → `landAcqMode`/`buildingAcqMode`
= `"estimated"`로 도달한다. 즉 **원건물 축은 이미 파트 단위로 4조합을 태울 수 있다.**

### 3.1 실측 픽스처 (throwaway probe · 실행 후 삭제)

토지 200㎡ · 연면적 300㎡ · 바닥 100㎡ · 상업지역 · 취득 2005-03-01 · 증축 2012-05-01 · 양도 2024-06-01 ·
총 양도가액 10억 · 양도시(토지 300만/㎡ · 건물1 2억 · 건물2 5천만) · 취득시(토지 100만/㎡ · 건물1 1억 ·
건물2 4천만) · 일괄 취득가 3억(A·B) · 증축 실거래가 8천만(B·D).

```
A 실가+환산 : 토지 705,882,352 / 건물1 235,294,117 / 건물2  58,823,531  → 155,801,082
B 실가+실가 : 토지 750,000,000 / 건물1 250,000,000 / 건물2           0  → 135,860,000
C 환산+환산 : 토지 705,882,352 / 건물1 235,294,117 / 건물2  58,823,531  → 138,457,554
D 환산+실가 : 토지 750,000,000 / 건물1 250,000,000 / 건물2           0  → 112,340,000
```

---

## 4. 결함 목록

### 🔴 D-1 — 증축 실가 모드에서 「양도시 건물2 기준시가」가 payload에서 소실된다

- 위치: `lib/calc/transfer-tax-api-gb.ts:79-90` (`buildExtensionInfo`의 `mode === "actual"` 분기)
- 현상: 그 분기 return이 `transferExtensionBuildingStdPrice`를 **포함하지 않는다**.
- 귀결: 엔진 `general-building-extension.ts:77` `extStdTotal = … ?? 0` ⇒ **0**.
  §166⑥ 3-way 안분 분모에서 건물2가 빠지고, `:95-96`의 잔액 계산으로 **건물2 양도가액 = 0**.
  토지·건물1이 총액을 전부 가져가 **과대 배분**되고, 건물2는 취득가액만 남아 **차손**이 되어 통산된다.
- **UI는 이미 그 값을 받고 있다** — `GeneralBuildingBlock.tsx:592-603`이 실가 모드에서도
  「양도시 건물2 기준시가 총액」을 렌더하며 hint가 `"§166⑥ 양도가액 안분 분모 계산에 필요합니다"`라고
  명시한다. **입력은 받는데 전송되지 않는다.**
- 실측 영향 (자본적지출 2,000만·양도비 1,000만 픽스처, 값 수동 주입 대조):

  | 조합 | 현행 | 주입 후 | 차이 |
  |---|---:|---:|---:|
  | B 실가+실가 | 133,060,000 | 140,118,824 | **7,058,824 과소** |
  | D 환산+실가 | 112,340,000 | 125,575,295 | **13,235,295 과소** |

- 법적 성질: 「소득세법 시행령」 제166조 제6항의 양도가액 안분은 **취득가액 산정 방식과 무관한 별개 축**이다.
  증축분을 실지거래가액으로 취득했어도 양도가액을 3파트로 나누려면 세 기준시가가 모두 필요하다.

### 🔴 D-10 (신설) — 조합 C·D에서 양도비가 §97②2호 나목에서 부당하게 배제된다

- 위치: `lib/calc/transfer-tax-api-gb.ts:481-484`
  ```ts
  ...((!asset.gbHasExtension || !!parseAmount(asset.gbBundledAcquisitionExpenses)) &&
    parseAmount(asset.transferExpense)
      ? { transferExpense: parseAmount(asset.transferExpense) } : {}),
  ```
- 규칙의 취지(2026-08-07 W-1b): `bundledExpenses`의 fallback ②가 `transferExpense`를 채택하면
  같은 값이 두 번 반영되므로, 전용 필드 미입력 시에는 나목에서 뺀다.
- **그 전제가 2026-08-08 수정으로 무너졌다.** 조합 C·D(원건물 환산)에서는
  `general-building-extension.ts:328-338`이 일괄 안분 필요경비를 **개산공제로 덮으므로**
  `bundledExpenses`가 **아무 데도 소비되지 않는다** ⇒ 이중계상이 성립할 수 없는데도 양도비가 빠진다.
- mutation probe(조합 C · 소액 픽스처): `bundledExpenses` 10,000,000 → 5,000,000으로 바꿔도
  `landExp` 6,000,000(= 취득시 토지 기준시가 2억 × 3%) · `b1Exp` 3,000,000(= 1억 × 3%) **불변**.
  두 값이 정확히 개산공제(§163⑥)이며 일괄 안분값이 아니다.
- 실측 영향(조합 C · 자본적지출 8억 · 양도비 3억 — swap 발동 픽스처):

  | 일괄필요경비 칸 | payload.transferExpense | 나목(directSide) | 결정세액 |
  |---|---|---:|---:|
  | 미입력 (현행 사용자 경로) | undefined | 800,000,000 | **28,979,117** |
  | 5,000,000 입력 | 10,000,000 → 300,000,000 | 1,100,000,000 | 0 |

  ⇒ 조합 C·D에서 **28,979,117원 과대**(이 픽스처 기준).
- **D-7과 같은 뿌리다** — 조합 C·D에서는 「일괄 취득 필요경비」 칸이 화면에 없어(⑤가
  `isMixedExtension` 게이트) 사용자가 이 배제를 피할 방법 자체가 없다.
- ⚠️ **이 수정은 기존 anchor를 깨뜨린다**:
  `__tests__/tax-engine/transfer/general-building-extension-transfer-expense.anchor.test.ts:127-133`
  (「전용 필드 미입력(② 채택) 시 제외가 정본」)의 픽스처가 `useEstimatedAcquisition: true` — **조합 C**다.
  그 단언은 **원건물 실가(A·B) 픽스처로 옮겨야** 의미가 유지된다.
- ⚠️ **세액을 바꾸는 판정이므로 조문 직독이 착수 조건이다**(Phase 0 · 메모리
  `feedback_unverified_authority_blocks_tax_change`).

### D-2 — ⑧ validate가 「양도시 건물2 기준시가」를 실가 모드에서 요구하지 않는다

- 위치: `lib/calc/transfer-tax-validate-gb.ts:618-621` — `extMode === "actual"` 분기는
  `gbExtensionActualAcquisitionPrice`만 요구한다.
- ⇒ 비워도 통과하고 조용히 건물2 양도가액 0이 된다. D-1과 **같은 축으로 함께** 고쳐야 한다
  (미동기화 시 「payload엔 실리는데 미입력이 차단되지 않음」 — `feedback_validation_sync_8th_point`).

### D-3 — ⑫ Zod superRefine이 실가 모드를 검사하지 않는다

- 위치: `transfer-tax-building-schemas.ts:226`(optional) · `:246-252`(superRefine은 `estimated`만).
- 값이 있으면 통과하므로 D-1 수정만으로 흐르지만, **모드별 필수 계약이 명시되지 않아** 재발 여지가 있다.

### D-4 — ⑤ 라디오 축이 조합 A만 표현한다

- 위치: `CompanionAcqPurchaseBlock.tsx:55-60`
  ```
  isMixedExtension = general_building && useEstimatedAcquisition === false
      && isAppraisalAcquisition !== true && gbHasExtension === true
      && gbExtensionAcquisitionMode === "estimated"      // ★ 증축 환산만
  ```
- 「토지·건물 일괄 (증축분 별도)」 옵션(`:128-132`)은 **A 전용 파생 상태**다.
- 조합 B는 `acqBasisValue`가 `"actual"`로 떨어져(`:70-78`) 라디오가 **「실거래가」**로 표시된다 —
  상단 축에서 증축의 존재가 사라진다.

### D-5 — 라디오 재클릭이 증축 입력을 날린다

- 위치: `CompanionAcqPurchaseBlock.tsx:82-96` — `resetExtension()`이 `actual`·`estimated` 양쪽에서 호출된다.
- 조합 B 상태에서 상단 라디오는 이미 「실거래가」에 체크돼 있는데, 사용자가 그것을 **다시 누르면**
  `onGbHasExtensionChange(false)`가 실행되어 증축 토글과 하위 입력이 통째로 꺼진다.
  조합 C·D에서 「환산취득가」를 다시 눌러도 같다.

### D-6 — 취득가액 칸의 라벨·hint가 조합 A에만 맞다

- 위치: `CompanionAcqPurchaseBlock.tsx:429-469`. `isMixedExtension`일 때만 라벨 「토지·건물 일괄 취득가액 (원)」
  + hint 「엔진이 양도시 기준시가 비율로 토지·건물1에 자동 안분합니다」.
- 조합 B는 라벨이 「취득가액 (원)」이고 안분 안내가 없다. 그러나 ④는 증축이면 그 값을
  `bundledAcquisitionPrice`로 싣고(`:429-437`) 엔진이 **똑같이 2-way 안분**한다(`extension.ts:236-239`).
  ⇒ 표시가 실동작과 어긋난다.
- ⚠️ hint 문구 자체도 부정확하다 — 엔진은 **취득시** 기준시가 비율로 안분한다(`extension.ts:236-238`,
  QA 2026-05-11 정정). 현행 hint의 「양도시 기준시가 비율」은 **틀린 설명**이다. (초안 누락 — 개정 1 추가)

### D-7 — 일괄 취득 필요경비 칸이 조합 B·C·D에서 사라진다 (dead-end)

- 위치: `CompanionAcqPurchaseBlock.tsx:486-493` — `isMixedExtension &&` 게이트.
- `gbBundledAcquisitionExpenses`는 ④가 `bundledExpenses`의 **1순위 후보**이자
  `bundledExpenseNature: "capital"` 판정의 소스다(`:434-459`).
- 조합 B에서는 칸이 없어 fallback이 `transferExpense`(양도비)를 집고 `"transfer"` 성질이 되며,
  동시에 **D-10 게이트에 걸려 양도비가 나목에서도 빠진다**.
- 조합 C·D에서는 원건물이 환산이라 일괄 취득가 개념이 없지만, **D-10 게이트가 이 칸의 입력 여부를
  보고 있으므로** 칸이 없다는 사실이 곧 양도비 배제로 이어진다.
- 메모리 `feedback_ui_gate_removes_sole_input_path`와 동형.

### D-8 — ⑤ 가이드 문구 3곳이 A만 서술한다

| 위치 | 현행 문구 |
|---|---|
| `GeneralBuildingBlock.tsx:323` | 「토지·건물 일괄 (증축분 별도): 토지·원건물은 실거래가 일괄, **증축분만 환산**」 |
| `GeneralBuildingBlock.tsx:510` (ToggleCard description) | 「예제 '쌍방+일방' 케이스 — 원취득은 실가, 증축분(건물2)은 입증 불가로 **환산취득가 적용**」 |
| `CompanionAcqPurchaseBlock.tsx:131` (라디오 description) | 「토지·원건물 실거래가 + **증축분 환산취득가**」 |

`GeneralBuildingBlock.tsx:324-326`의 「그 외 4가지 조합 …」 줄이 보완하려 하지만, 표현이
「쌍방+쌍방·일방+쌍방·일방+일방」이라는 **내부 용어**라 사용자에게 축이 전달되지 않는다.

### D-9 — ⑦ 결과 화면 배지가 조합 A로 하드코딩돼 있다

- 위치: `GeneralBuilding3WayTable.tsx`
  - `:45` 「건물1(3001, **실가**) · 증축건물2(3002, **환산**)」
  - `:86` 건물2 취득가액 옆 「**(환산)**」
  - `:99` 건물2 필요경비 옆 「**(개산공제 §163⑥)**」
- 조합 B·D에서 건물2는 실지거래가액이고 필요경비는 실제 지출액이다(`extension.ts:379-381`).
  조합 C·D에서 건물1은 환산취득가다. ⇒ **세 문구 모두 거짓이 되는 조합이 있다.**
- **구현 경로 정정(개정 1)**: `PerPropertyBreakdown`에는 `usedEstimatedAcquisition`이 **없다**
  (`transfer-result.types.ts:456` `TransferValuationDetailSource` Pick 13개 목록에 미포함).
  ⇒ `aggregated.generalBuildingValuationDetail?.assetCards`를 경유한다 —
  그 타입은 `transfer-aggregate.types.ts:371`에 선언돼 있고 카드마다 `usedEstimatedAcquisition`이 있다
  (`extension.ts:443·506·562`). 컴포넌트는 이미 `aggregated`를 통째로 받으므로 **prop 변경이 필요 없다.**

### 🔴 D-11 — 분리 ON × 증축에서 양도비가 §97②2호 나목에서 통째로 빠진다 (개정 2 · 2026-08-12)

**§14 O-3을 실측으로 종결한 항목이다. 「여지」가 아니라 D-10과 같은 실재 결함이었다.**

- 위치: `transfer-tax-api-gb.ts` — D-10이 손본 바로 그 게이트.
- 조건: `gbHasExtension` ON × **분리 ON**(토지·건물 취득일 다름) × 일괄 필요경비 전용 칸 미입력.
- 증상: `transferExpense`가 payload에 실리지 않아 §97②2호 **나목**에도, §97②**1호 가산**에도
  도달하지 못한다. **100% 소실**이다.

#### 종전 전제가 실측으로 무너졌다

개정 1은 「부분 혼합은 실가 파트가 `bundledExpenses`를 **실제로 소비**하므로 이중계상 위험이
남는다」고 적었다. **그 전제가 틀렸다.**

| mutation (`gbBundledAcquisitionExpenses` 0 → 5억, 양도비는 0으로 고정) | 토지 카드 필요경비 | 결정세액 |
|---|---:|---:|
| **분리 ON** 부분 혼합 × 증축 | 100,000,000 → **불변** | 58,948,319 → **불변** |
| 분리 OFF 조합 A (대조군) | 0 → **333,333,333** | 155,801,082 → **17,789,329** |

stale `fixedAcquisitionPrice` 9억을 payload에 실어도 분리 ON에서는 토지 취득가액이 **파트 가격
그대로**였다(300,000,000). ⇒ 분리 ON은 일괄 경로를 **절대 타지 않는다**.

**엔진 근거** — `general-building-extension.ts`에서 일괄 안분값이 두 파트 모두에서 덮인다:
- 비-환산 파트 → Step 2.5 `applyPartAcqModes`가 파트 가격으로 대체. **V-7이 그 값을 필수로
  요구**하므로(`transfer-tax-validate-gb.ts`) 분리 ON에서 비어 있을 수 없다.
- 환산 파트 → 「파트가 환산이면 일괄 안분값을 쓰지 않는다」 분기가 §176의2② 값으로 대체.

#### 실측 과대

**결정세액 58,948,319원 과대**(양도비 3억 · 토지 실가 3억 + 건물1 환산 픽스처).
게이트를 열면 **0원**이 된다.

#### 범위는 부분 혼합에 한정되지 않는다

**분리 ON × 증축 전부**가 같다 — 둘 다 실가 조합도 `payload.transferExpense`가 `undefined`였다.

⇒ 게이트에 `hasSeperateLandAcquisitionDate`를 더한다. 분리 **OFF**는 종전 그대로다(그쪽은
일괄 안분값이 실가 파트의 정본이라 이중계상이 **실재한다** — 위 대조군 수치).

---

## 5. 확인 완료 — 결함 아님 (개정 1에서 종결)

### ✅ O-1 — 조합 C·D의 필요경비가 개산공제뿐인 것은 **정상**이다

초안에서 「일괄 필요경비 입력 유무로 결정세액이 변하지 않는다(138,457,554 동일)」를 근거로 결함을 의심했다.
**그 픽스처가 §97②2호 swap 미발동 구간이라 구별력이 없었다.** 거액 픽스처로 재측정하니 세액이
28,979,117 ↔ 0으로 크게 달라진다 ⇒ 배관은 살아 있다.

환산 파트의 필요경비가 개산공제뿐인 것은 「소득세법」 제97조 제2항 제2호가 정한 바이며, 자본적지출·양도비는
같은 호 **단서(나목 택일)** 경로로 별도 반영된다. **결함이 아니다.**
(단, 그 나목 경로에 조합 C·D에서 양도비가 도달하지 못하는 것이 **D-10**이다 — 축이 다르다.)

### ✅ 지분(%) 분할 경로는 D-1 수정으로 자동 정합된다

- `transfer-tax-api-gb-shares.ts:69` — `gbTransferExtensionBuildingStdPrice`는 **물건-수준**으로
  primary에서 전 지분에 복사된다.
- `applyShareScale`(:108~) — `extensionInfo`에서 **실가 2필드만** 지분율 스케일하고
  「기준시가 2필드는 물건-수준이라 건드리지 않는다」(:133 주석).
- ⇒ D-1이 그 필드를 실가 모드에도 실으면 지분 경로에서 **올바른 값이 스케일 없이** 흐른다. 추가 작업 불필요.

---

## 6. Phase 0 결과 — 착수 조건 4항 **전건 종결** (2026-08-12)

### ✅ Q-1 — UI 축은 「나」 안으로 확정 (사용자 결정)

**3번째 라디오 옵션을 제거하고 2옵션(실거래가/환산취득가)으로 줄인다.** 증축은 토글이 전담한다.

영향 범위 실측 — `grep -rn "토지·건물 일괄\|mixed_extension\|isMixedExtension"`:

| 대상 | 건수 | 비고 |
|---|---|---|
| `CompanionAcqPurchaseBlock.tsx` | 11개소 | union 타입 `AcqBasisMode`·`isMixedExtension` 파생·`acqBasisOptions`·라벨·hint·게이트 2곳 |
| `GeneralBuildingBlock.tsx` | 3개소 | 가이드 팁 · ToggleCard description · 주석 |
| **E2E** | **0건** | 라디오 라벨을 셀렉터로 쓰는 spec 없음 — `general-building-inheritance-extension.spec.ts`는 **주석에만** 언급 |
| **RTL** | **0건** | |

⇒ **셀렉터 회귀 위험이 없다.** `isMixedExtension` 파생은 `CompanionAcqPurchaseBlock.tsx` 내부에만 존재한다.

### ✅ Q-2 — D-10 수정 형태는 **(가) 게이트 정밀화**, 조건은 `bothEstimated`

**조문 직독**(「소득세법」 MST 280405 · 시행 2026-07-01 · 제97조):

> ② 2. 그 밖의 경우의 필요경비는 … **자산별로** 대통령령으로 정하는 금액을 더한 금액.
>   **다만**, 제1항제1호나목에 따라 취득가액을 **환산취득가액으로 하는 경우**로서 가목의 금액이
>   나목의 금액보다 적은 경우에는 나목의 금액을 필요경비로 할 수 있다.
>   가. 환산취득가액 + 본문 중 대통령령으로 정하는 금액의 합계액
>   나. **제1항제2호 및 제3호에 따른 금액의 합계액**   ← 자본적지출 + 양도비, **조건 없음**
>
> ② 1. 취득가액을 실지거래가액에 의하는 경우의 필요경비는 다음 각 목의 금액에
>   **제1항제2호 및 제3호의 금액을 더한 금액**으로 한다.   ← 실가 파트는 **가산**

⇒ 나목은 양도비를 **무조건 포함**한다. 현행 게이트가 그것을 빼는 유일한 정당화는 **이중계상**뿐이고,
조합 C·D에서는 `bundledExpenses`가 소비되지 않으므로 그 정당화가 성립하지 않는다.

**W-1a 경고(`transfer-tax-api-gb.ts:446-449`)는 여전히 유효하다** — 코드로 확인:
`general-building-entry.ts:213·216`이 `landDirectExpenses`/`buildingDirectExpenses`가
**정의되어 있을 때만** `partAxis`를 채우고, ④는 그 값이 truthy일 때만 싣는다(`:314-319`).
분리 OFF에서는 파트별 자본적지출 칸이 화면에 없어 **파트 축이 절대 활성화되지 않는다**
⇒ 자산총액 판정(`general-building-swap.ts:151-172`)으로 가고 `addition` 맵이 비어
**실가 카드(토지·건물1)에 §97②1호 가산이 적용되지 않는다.**
따라서 조합 A·B에서 fallback ②는 양도비의 **유일한 차감 경로**이며, 제거하면 값이 사라진다.

**⇒ 채택안**: `transfer-tax-api-gb.ts:481`의 제외 조건에 `bothEstimated`(이미 `:313`에 있다)를 더한다.

| 조합 | `bothEstimated` | `bundledExpenses` 소비 | `transferExpense` payload |
|---|---|---|---|
| A·B (원건물 실가) | false | **소비함** (일괄 안분) | 현행 유지 — 전용 필드 입력 시에만 |
| C·D (원건물 환산) | true | **소비 안 함** (개산공제로 덮임) | **항상 싣는다** ← 수정 |

**부분 혼합(토지 실가 + 건물1 환산)은 `bothEstimated === false`라 현행이 유지된다** — 이중계상이 없다.
그 조합에서 환산 파트의 나목이 과소일 여지는 남지만 **현행과 동일**하므로 이번 범위 밖이다(§14 O-3).

**⚠️ 이 수정은 기존 anchor를 깨뜨린다** —
`general-building-extension-transfer-expense.anchor.test.ts:127-133`(「② 채택 시 제외가 정본」)의
픽스처가 `useEstimatedAcquisition: true`(조합 C)다. **조합 A·B 픽스처로 이관**하고, 조합 C·D에는
반대 단언을 신설한다.

### ✅ Q-3 — 일부양도 × 증축은 `!gbHasExtension`으로 통일한다

- 그 조합을 다루는 E2E·RTL·엔진 테스트는 **0건**이다(`areaScenario` × `gbHasExtension` 교집합 없음).
- `PartialAcqApportionSection`의 목적은 「양도분에 대응하는 취득가액」을 산출해
  `fixedAcquisitionPrice`에 적용하는 것인데, 증축이 있으면 그 칸은 **일괄 취득가액**이고
  엔진이 §166⑥ 3파트 안분을 돈다 — **면적 축과 기준시가 축이 충돌**한다.
- 현행은 조합 A에서만 숨기고 조합 B에서는 보여 **비일관**이다.
- ⇒ 게이트를 `!gbHasExtension`으로 통일한다. **기능 축소가 아니라 비일관 해소**다.
  실제로 그 조합이 필요하면 별건으로 다룬다(§14 O-4).

### ✅ Q-4 — anchor가 현행 코드에서 **11건 실패**한다 (결함 실재 확인)

`__tests__/tax-engine/transfer-tax/gb-extension-4mode.anchor.test.ts` (35건 중 11 실패 / 24 통과).
**실패가 전부 D-1·D-10에서 파생됐고 예상 밖 실패는 없다**:

| 실패 | 건수 | 귀속 |
|---|---:|---|
| B·D 건물2 양도가액 ≠ 58,823,531 | 2 | D-1 |
| B·D 토지·건물1 양도가액이 3-way 비율을 벗어남 | 2 | D-1 |
| B·D payload에 `transferExtensionBuildingStdPrice` 없음 | 2 | D-1 |
| B·D Zod 통과 후에도 없음 | 2 | D-1 |
| D 토지 취득가액 250,000,000 (기대 235,294,117) | 1 | D-1 **전파** — 양도가액이 틀려 환산 분자가 오염 |
| C·D payload에 `transferExpense` 없음 | 2 | D-10 |

**통과 24건 중 D-10의 근거를 고정하는 것**: 「조합 C에서 `bundledExpenses`를 바꿔도
토지·건물1 필요경비가 개산공제(6,000,000·3,000,000)에 고정된다」 — mutation 대조군이 살아 있다.

---

## 6-B. 참고 — 초안 단계의 미결 서술 (기록 보존)

### Q-1 🟠 UI 축을 어떻게 재편할 것인가 (사용자 결정)

현행 「취득가액 산정 방식」 라디오는 **축이 2개인 것을 1축으로 뭉쳤다**:
① 원건물 취득가액 산정 방식(실가/환산) × ② 증축 유무·증축분 방식.
3번째 옵션 「토지·건물 일괄 (증축분 별도)」는 ①=실가 ∧ ②=증축 있음 ∧ 증축=환산인 **한 칸의 shortcut**이다.

| 안 | 내용 | 장점 | 단점 |
|---|---|---|---|
| **가 (최소)** | 3번째 옵션 유지, 의미를 「원건물 일괄 실거래가 + 증축분은 아래에서 별도 선택」으로 재정의(증축 방식 조건 제거) | 변경 최소, 기존 E2E 영향 적음 | A·B는 3번째, C·D는 2번째라는 **비대칭**이 남음 |
| **나 (추천)** | 3번째 옵션 **제거**, 라디오를 2옵션(실거래가/환산취득가)으로. 증축은 토글이 전담하고 취득가액 라벨·hint·일괄필요경비 칸은 `gbHasExtension`으로 분기 | 축이 깨끗해짐. `isMixedExtension` 파생·D-5 부작용이 **통째로 소멸** | 기존 E2E·RTL 셀렉터 영향 범위가 큼. 사용자가 익숙한 옵션이 사라짐 |
| **다** | 라디오를 「원건물 취득가액 산정 방식」으로 **라벨만 바꾸고** 가 안 적용 | 문구로 축 혼동 완화 | 실질은 가 안과 동일 |

**추천: 나.** 3번째 옵션이 존재하는 한 「실거래가」와 「토지·건물 일괄(증축분 별도)」의 차이가
원건물 관점에서 **없기 때문**이다(둘 다 실가). 실제 차이는 증축 토글 ON 여부뿐인데 그건 아래 토글이
이미 표현한다. 다만 **범위가 커지므로 사용자 확인 후 착수한다.**

### Q-2 🟠 D-10의 수정 형태

후보 두 가지 — Phase 0의 조문 직독 후 확정한다.

- **(가) 게이트 정밀화**: `transferExpense` 제외 조건을 「`bundledExpenses`가 **실제로 소비되는 경우**」로 좁힌다.
  소비 조건 = 원건물이 실가(= 파트 모드에 비-환산이 있어 일괄 안분이 실행됨).
  ⚠️ 파트 혼합(토지 실가 + 건물1 환산)에서는 **일부만** 소비되므로 이분법이 부정확할 수 있다.
- **(나) fallback ② 제거 + 입력 경로 정비**: `bundledExpenses`의 `transferExpense` fallback을 없애고,
  D-7을 고쳐 「일괄 취득 필요경비」 칸을 조합 B에 노출한다. 성질 혼동 자체가 사라진다.
  ⚠️ W-1a 주석(`transfer-tax-api-gb.ts:446-449`)이 「②를 제거하면 원건물 실가 조합에서 양도비의
  차감 경로가 사라진다」고 경고한다 — 그 경고가 **지금도 유효한지** 재확인이 필요하다.

### Q-3 🟡 `PartialAcqApportionSection` 게이트의 파급 (초안 누락)

`CompanionAcqPurchaseBlock.tsx:473-477`의 일부양도 취득가액 안분 계산기는 `!isMixedExtension` 조건이다.
Q-1의 가·나 어느 안이든 「증축이면 숨긴다」로 바뀌면 **조합 B에서 현재 보이던 계산기가 사라진다**.
증축이면 §166⑥ 3-way 자동 안분이 도는 것은 맞으나, **일부양도(면적 일부 양도)는 별개 축**이다.
⇒ 두 축이 함께 성립하는 입력이 실재하는지 확인하고, 필요하면 게이트를 `areaScenario`와 분리한다.

### Q-4 🟡 조합 B·D의 「정답 세액」은 아직 독립 검증되지 않았다

§4 D-1 표의 「주입 후」 값은 **payload를 손으로 채워 만든 값**이다. 「건물2 양도가액 0이 틀렸다」는
확정이지만 **고친 뒤 값이 정답인지**는 별개다. Phase 0에서 손계산 anchor로 고정한다:

```
landStd     = 3,000,000 × 200 = 600,000,000
building1Std=                   200,000,000
building2Std=                    50,000,000
분모        =                   850,000,000
토지  = 1,000,000,000 × 600/850 = 705,882,352
건물1 = 1,000,000,000 × 200/850 = 235,294,117
건물2 = 잔액                     =  58,823,531
```

---

## 7. 법령 근거

| 축 | 조문 | 역할 |
|---|---|---|
| 양도가액 3-way 안분 | 「소득세법」 제100조 제2항 · 「소득세법 시행령」 제166조 제6항 | **취득가액 산정 방식과 무관**하게 양도가액을 토지·건물1·건물2로 나눈다 ⇒ D-1 근거 |
| 취득가액 안분 시점 | 「소득세법」 제100조 제2항 **본문**(「취득 당시」) | D-6 hint 오류 정정 근거 |
| 환산취득가 | 「소득세법 시행령」 제176조의2 제2항 | 조합 A·C의 증축분 / C·D의 원건물 |
| 실지거래가액 필요경비 | 「소득세법」 제97조 제1항 제1호 가목 · 제2항 제1호 | 조합 B·D의 증축분 — 개산공제 미적용 |
| 개산공제 | 「소득세법 시행령」 제163조 제6항 | 환산 파트 전용 ⇒ D-9 배지 분기 근거 |
| 필요경비 택일(나목) | 「소득세법」 제97조 제2항 **제2호 단서** | **D-10의 판정 근거 — Phase 0에서 본문 직독 필수** |
| 증축 취득시기 | 「소득세법 시행령」 제162조 제1항 제4호 | 건물2 카드 취득일 = 증축일 (현행 유지) |

D-1·D-2·D-3·D-4~D-9는 **새 조문 해석이 필요 없다** — 이미 정해진 산식이 조합에 따라 도달하지
못하는 것을 잇는 배관·표시 작업이다. **D-10만 조문 판단을 요구한다.**

---

## 8. 케이스 매트릭스

| # | 원건물 | 증축분 | 필수 입력 | 건물2 취득가액 | 건물2 필요경비 | 양도비 나목 |
|---|---|---|---|---|---|---|
| A | 실가 | 환산 | 일괄 취득가 · 취득시 토지/건물1 기준시가 · 건물2 양도시·취득시 기준시가 | 환산(§176의2②) | 개산공제(§163⑥) | 전용칸 입력 시 포함 |
| B | 실가 | 실가 | 일괄 취득가 · 취득시 토지/건물1 기준시가 · **건물2 양도시 기준시가** · 증축 실거래가 | 실지거래가액 | 실제 필요경비 | 전용칸 입력 시 포함 (**칸 부재** D-7) |
| C | 환산 | 환산 | 취득시 토지/건물1 기준시가 · 건물2 양도시·취득시 기준시가 | 환산 | 개산공제 | **배제됨** D-10 |
| D | 환산 | 실가 | 취득시 토지/건물1 기준시가 · **건물2 양도시 기준시가** · 증축 실거래가 | 실지거래가액 | 실제 필요경비 | **배제됨** D-10 |

**굵은 글씨 = 현행에서 검증도 전송도 되지 않는 입력.**

부가 축(이번 변경이 건드리지 않지만 회귀를 봐야 하는 것):
분리 ON/OFF · 상속·증여 파트(§163⑨) · 비사업용토지 분할 · 구분양도(§100③) · 지분(%) 분할 ·
부담부증여(§159 — 증축 비스코프).

---

## 9. 수정 계획

### ✅ Phase 0 — 착수 전 확정 (2026-08-12 완료 · 결과는 §6)

- [x] **Q-1** UI 축 「나」 안 확정 + 영향 범위 실측(E2E·RTL 셀렉터 0건)
- [x] **Q-2** §97② 조문 직독 + W-1a 경고 유효성 코드 확인 → **(가) 게이트 정밀화 · 조건 `bothEstimated`**
- [x] **Q-3** 일부양도 × 증축 → `!gbHasExtension` 통일
- [x] **Q-4** anchor 작성 → **현행 11건 실패** 확인 (전부 D-1·D-10 파생)

### Phase 1 — ④⑧⑫ 배관 (D-1 · D-2 · D-3)

5. `transfer-tax-api-gb.ts:79-90` — `mode === "actual"` return에 `transferExtensionBuildingStdPrice` 추가.
   미입력이면 **fail-fast throw**(같은 함수 `:67-71`과 동형. 자동 0 fallback 금지 —
   `feedback_no_silent_apportion_fallback`).
6. `transfer-tax-validate-gb.ts:618-621` — 실가 분기에도 `gbTransferExtensionBuildingStdPrice` 필수 검사.
   메시지에 「§166⑥ 양도가액 안분 분모」 명시.
7. `transfer-tax-building-schemas.ts:246~` — superRefine에 `acquisitionMode === "actual"`일 때
   그 필드 요구 추가.

⚠️ **세 지점의 조건은 같은 축이어야 한다** — 하나만 고치면 「검증 통과 ↔ 엔진 0 안분」 또는
「전송되는데 Zod가 막음」이 된다.

### Phase 2 — D-10 (Q-2 확정안에 따름)

8. 게이트 수정 + **기존 anchor 이관**:
   `general-building-extension-transfer-expense.anchor.test.ts:127-133`의 「② 채택 시 제외가 정본」을
   **원건물 실가(A·B) 픽스처로 옮기고**, 조합 C·D에는 「양도비가 나목에 포함된다」를 새로 단언한다.
   → verify: 조합 A·B·C·D 4개 대조군을 한 파일에.

### Phase 3 — ⑤ UI (D-4~D-8 · Q-1 확정안에 따름)

9. 축 재편 (Q-1). **나 안이면**: 3번째 옵션 제거 → `isMixedExtension` 파생 삭제 →
   D-6·D-7 게이트를 `gbHasExtension`으로 교체 → `resetExtension` 호출 자체가 불필요해져 D-5 소멸.
   **가·다 안이면**: `isMixedExtension`에서 `gbExtensionAcquisitionMode` 조건 제거 +
   `handleAcqBasisChange`의 mode 강제 설정 제거 + `resetExtension`을 **실제 이동 시에만** 호출.
   ⚠️ 게이트 확장 전에 조합 B의 `bundledExpenses`·`bundledExpenseNature`·`transferExpense`
   3필드 payload를 anchor로 **먼저 고정**한다(`feedback_ui_gate_expansion_activates_latent_defect`).
10. **D-6 hint 오류 정정** — 「양도시 기준시가 비율」 → 「**취득시** 기준시가 비율」.
11. **D-8 문구 교체** — 3곳을 조합 축으로 다시 쓴다. 내부 용어(쌍방/일방)·예제 번호 제거.
    → verify: 「증축분만 환산」류 단정이 남아 있지 않은지 grep.

### Phase 4 — ⑦ 결과 화면 (D-9)

12. `GeneralBuilding3WayTable.tsx` — `:45`·`:86`·`:99`를
    `aggregated.generalBuildingValuationDetail?.assetCards[].usedEstimatedAcquisition`에서 파생.
    · 취득가액 배지: `(환산)` / `(실거래가)` · 필요경비 배지: `(개산공제 §163⑥)` / `(실제 필요경비)`
    · 설명문에서 모드 서술 제거.
    ⚠️ 착수 전 같은 문구를 쓰는 **형제 렌더러(PDF·인쇄·신고서)** 존재 여부를 grep한다
    (`feedback_sibling_path_already_implements_rule`).

### Phase 5 — 회귀·통합

13. `npx vitest run __tests__/tax-engine/transfer-tax/ __tests__/calc/` → `npm run check:pre-pr`.
14. **브라우저 확인**(Playwright E2E) — 4조합 입력 → 결과 화면. 워크트리이므로 **`E2E_PORT` 지정 필수**.

---

## 10. 14개 동기화 지점 점검표

| # | 지점 | 이번 변경 | 비고 |
|---|---|---|---|
| ① | 폼 상태 `AssetForm` | 없음 | 필드는 이미 전부 존재 |
| ② | initial | 없음 | |
| ③ | normalize | 없음 | |
| ④ | API 변환 | **수정** (D-1 · D-10) | Phase 1·2 |
| ⑤ | UI 위젯 | **수정** (D-4~D-8) | Phase 3 |
| ⑥ | 사이드바 합계 | **없음** | `computeTransferSummary`는 GB 3-way를 별도 취급하지 않는다. `GeneralBuildingBlock.tsx:141-211`의 안분 미리보기는 **인라인 위젯**(사이드바 아님)이며 이미 4조합을 지원하고 실가 모드에서 `transferExtStd`를 요구한다 ⇒ D-1 수정 후 미리보기와 실계산이 **일치하게 된다** |
| ⑦ | 결과 카드 | **수정** (D-9) | Phase 4 |
| ⑧ | validation | **수정** (D-2) | Phase 1 |
| ⑨⑩ | Zod enum | 없음 | |
| ⑪ | 자산-수준 `acquisitionDate` fallback | 없음 | |
| ⑫ | Zod 입력 객체 | **수정** (D-3) | Phase 1 |
| ⑬ | body spread | 없음 | GB는 `generalBuildingValuation` 서브객체 단일 경로 |
| ⑭ | Route handler 매핑 | 없음 | `route.ts:397` `bundledAcquisitionPrice` 경로 유지 |

---

## 11. 테스트 계획

| ID | 계층 | 내용 |
|---|---|---|
| X-1 | ④ | 조합 B·D payload에 `extensionInfo.transferExtensionBuildingStdPrice`가 있다 |
| X-2 | ④ | 실가 모드 + 그 필드 미입력 → fail-fast throw |
| X-3 | ⑧ | 실가 모드 + 미입력 → validate 오류 문자열 |
| X-4 | ⑫ | 실가 모드 + 필드 없음 → Zod parse 실패 |
| X-5 | 엔진 | **4조합 대조군 한 파일** — 건물2 양도가액이 4조합 모두 58,823,531 |
| X-6 | 엔진 | 4조합 결정세액 원 단위 고정 (Phase 0-3에서 산출) |
| X-7 | ④ | **D-10** — 조합 C·D payload에 `transferExpense`가 있다 / 조합 A·B는 Q-2 확정안대로 |
| X-8 | 엔진 | **D-10** — 조합 C에서 양도비 유무가 `directSide`와 결정세액을 바꾼다 |
| X-9 | ⑤ RTL | 조합 B에서 상단 라디오 표시 (Q-1 확정안대로) |
| X-10 | ⑤ RTL | 조합 B에서 라디오 재클릭 후 `gbHasExtension` 유지 (D-5 — 가·다 안일 때만) |
| X-11 | ⑤ RTL | 조합 B에서 「토지·건물 일괄 취득 시 필요경비」 칸이 존재한다 (D-7) |
| X-12 | ⑦ RTL | 4조합 배지 문자열 — 환산/실거래가 · 개산공제/실제 필요경비 |
| X-13 | E2E | 조합 B를 브라우저에서 입력 → 결과 화면 건물2 양도가액이 0이 아니다 |

**X-5·X-7·X-12는 대조군 쌍으로 읽어야 한다** — A·C가 통과하는 것만으로는 구별력이 없다
(`feedback_anchor_observes_wrong_stage`). **X-8은 swap 발동 픽스처여야 한다** — 소액 픽스처는
구별력이 없다(초안 O-1 오판의 원인).

---

## 12. 리스크

| 리스크 | 대응 |
|---|---|
| D-10 수정이 기존 anchor를 깨뜨린다 | **의도된 것**. Phase 2-8에서 픽스처를 조합 A·B로 이관하고, 조합 C·D에 반대 단언을 신설 |
| Q-1 「나」 안이 E2E·RTL 셀렉터를 광범위하게 깨뜨린다 | 착수 전 `grep -rn "토지·건물 일괄"` 로 영향 범위를 세고 사용자에게 보고 |
| Phase 3 게이트 확장이 조합 B의 필요경비 배분을 바꾼다 | 확장 **전** anchor 선행. 변화가 있으면 그 자체를 판정 대상으로 올린다 |
| D-2/D-3 필수화가 legacy sessionStorage 이력을 차단한다 | 조합 B·D는 **현행에서 이미 틀린 값**을 내고 있었으므로 차단이 정당하다. 오류 메시지에 입력 위치를 명시 |
| Q-3 게이트 파급으로 일부양도 계산기가 사라진다 | Phase 0-4에서 실재 조합 확인 후 게이트를 분리 |
| 결과 화면 문구를 PDF 렌더러가 공유 | Phase 4 착수 전 grep |

---

## 13. 착수 조건 — ✅ 전건 충족 (2026-08-12)

- [x] **Q-1** UI 축 결정 (사용자 — 「나」 안)
- [x] **Q-2** §97② 조문 직독 + W-1a 경고 유효성 재현 → D-10 수정 형태 확정
- [x] **Q-3** 일부양도 × 증축 조합 실재 여부 확인
- [x] **Q-4** 정답값 anchor가 **현행 코드에서 실패**하는 것 확인 (11건)

⇒ **Phase 1 착수 가능.**

---

## 13-B. Phase 1~5 실행 기록 (2026-08-12 · 전건 완료)

| Phase | 내용 | 결과 |
|---|---|---|
| 1 | ④⑧⑫ 배관 (D-1) | anchor 11 실패 → **2 실패**(D-10 잔여) |
| 2 | D-10 게이트 정밀화 | 신규 anchor **35/35 통과** |
| 3 | UI 축 재편 (D-4~D-8) | tsc·lint 0 · RTL 1,436 통과 |
| 4 | 결과 화면 배지 파생 (D-9) | 신규 RTL **19/19 통과** |
| 5 | 회귀 | **vitest 15,130 통과 · E2E 1,038 통과 · lint 0 error** |

### 실행 중 발견한 것 — 계획서에 없던 3건

#### 🔴 E-1 (Phase 3) — 3번째 라디오를 지우면 증축 토글이 **dead-end**가 된다

증축 토글의 게이트가 `isEstimated || gbHasExtension || bothPartsSuccession || isSeparateAcq`였다.
그 조건들은 **「증축을 켤 다른 진입점이 없는 경우」를 하나씩 메운 패치**였고, 매매 × 실거래가 ×
분리 OFF는 3번째 라디오가 진입점 역할을 하고 있었다. 라디오를 제거하는 순간 그 조합에서
증축을 켤 방법이 사라진다 — 2026-08-07에 상속·증여가 겪은 것과 **같은 dead-end**다.

⇒ **게이트를 통째로 제거**했다. 증축 유무는 물건의 사실이지 취득가액 산정 방식의 함수가 아니다.
남는 제외는 성질상 비스코프인 `shareAcquisitionOnly`(물건 사건 · 지분 중복 금지)와
`isBurdenedGift`(§159 자동 산정)뿐이다. 게이트만 쓰던 파생 `bothPartsSuccession`·`isSeparateAcq`도
함께 제거했다.

#### 🔴 E-2 — 기존 anchor **2건의 「주장」이 틀렸다** (값이 아니라 명제를 고쳤다)

**(a) `gb-extension-part-acq-date.anchor.test.ts`** — 「혼합(토지 실가 + 건물1 환산)의 건물1이
**증축 OFF 대조군과 같다** — 강한 교차검증이다」.

**그 「같음」이 곧 D-1 결함의 증상이었다.** ④가 증축 실가 모드에서 건물2 기준시가를 싣지 않아
§166⑥ 분모가 2-way와 같았고, 그래서 건물1의 안분 양도가액이 증축 유무와 무관했다.
조문대로면 **달라야 한다** — 분모 1,389,442,400 → 1,449,442,400 (비율 0.9586).
⇒ 교차검증 축을 「같다」에서 **「분모 비율만큼 작다」**로 바꿨다. 이제 이 테스트가 D-1의 회귀를 잡는다.

**(b) `general-building-inheritance-extension.spec.ts` X-2** — 「매매 + 실가 모드는 종전대로
**안 보인다** (회귀 0)」 → E-1의 직접 귀결로 **「보인다」**로 뒤집었다.

#### ⚠️ E-3 — 안내 문구가 E2E 셀렉터와 충돌했다

가이드 팁에 토글 제목(「증축 있음」)을 그대로 인용했더니 `getByText("증축 있음")`가 **접힌
안내문**에 매칭돼 기존 spec 3건이 깨질 뻔했다. 문구를 「아래 증축 항목」으로 바꿔 해소했다.
⇒ **토글·버튼 제목을 안내문에 그대로 인용하지 않는다**(코드 주석으로 남김).

### 값이 정정된 anchor (D-1 — §166⑥ 분모에 건물2가 들어가면서)

| 파일 · 테스트 | 종전 | 정정 |
|---|---:|---:|
| `gb-extension-part-acq-date` 분리 OFF + 증축 (ltd) | 81,999,999 | **76,338,197** |
| 〃 분리 OFF + 증축 + 환산 (land) | 669,246,886 | **641,543,257** |
| 〃 〃 (building1) | 3,281,490 | **3,145,652** |
| 〃 혼합 건물1 | 3,281,490 | **3,145,652** |

**정정 방향 검증**: 새 값 ÷ 옛 값 = 0.9586 = 1,389,442,400 ÷ 1,449,442,400 —
정확히 분모 비율이다(「소득세법 시행령」 제166조 제6항).

### 하드코딩 상수를 대조군 비교로 교체 (구별력 회복)

`gb-extension-part-acq-date` P2-1의 `not.toBe(81_999_999)`는 그 상수가 「토지도 2020」의 값이었는데,
D-1 정정으로 대조군 값 자체가 바뀌자 **아무것도 잡지 못하는 단언**이 됐다(통과하지만 구별력 0).
⇒ 대조군을 그 자리에서 계산해 비교하도록 바꿨다. 같은 이유로 P2-4에도 대조군 비교를 추가했다.

---

## 13-C. 개정 2 실행 기록 — D-11 (2026-08-12)

### 수정 1곳

`lib/calc/transfer-tax-api-gb.ts` — D-10이 손본 그 게이트에 `hasSeperateLandAcquisitionDate` 추가.

```ts
...((!asset.gbHasExtension ||
  bothEstimated ||
  !!asset.hasSeperateLandAcquisitionDate ||   // ← D-11
  !!parseAmount(asset.gbBundledAcquisitionExpenses)) &&
parseAmount(asset.transferExpense) ? { transferExpense: ... } : {}),
```

**술어 선택 근거**: 「일괄 안분값이 소비되는가」를 ④에서 재구성하는 안(`landPartPrice &&
buildingPartPrice` 등)은 엔진 판정의 이중 구현이라 드리프트한다
(`feedback_ui_engine_dual_truth_avoidance`). 분리 ON ⇒ V-7이 비-환산 파트 가격을 필수로
요구 ⇒ 일괄 안분값이 전부 덮인다는 **연결고리를 주석에 남기고** 플래그를 술어로 삼았다.

### anchor 6건 신설 (`general-building-extension-transfer-expense.anchor.test.ts`)

기존 D-10 describe 바로 아래에 **대조군 쌍**으로 배치했다 — 한쪽만 보면 「무조건 포함」·
「무조건 제외」로 되돌아가기 때문이다.

| 단언 | 역할 |
|---|---|
| 부분 혼합 × 증축 픽스처가 validate를 통과한다 | 전제(V-8 때문에 파트 칸으로 옮겨야 한다) |
| ④가 `transferExpense`를 싣는다 | 배관 — 착수 시 `undefined`로 **실패** |
| 세액이 실제로 달라진다 | 실동작 — 착수 시 73,387,005 **동일**로 실패 |
| 분리 ON × 둘 다 실가에서도 싣는다 | 범위가 부분 혼합에 한정되지 않음 |
| 🔑 분리 ON에서 일괄 필요경비 mutation → 세액 **불변** | **D-11의 근거를 고정**. 엔진이 나중에 소비하게 바뀌면 여기가 먼저 깨진다 |
| 🔑 분리 OFF 같은 mutation → 세액 **변함** | 대조군 — 분리 OFF의 이중계상은 실재한다 |

> ⚠️ **mutation 설계 함정**: `gbBundledAcquisitionExpenses`를 바꾸면 위 게이트도 함께 열려
> 두 효과가 섞인다. **양도비를 0으로 고정**해야 「소비되는가」만 잰다. 첫 작성에서 이걸 놓쳐
> 근거 단언이 거짓 실패했다.

### 검증

- 착수 시 실패 **3건**(전부 D-11 귀속, 예상 밖 실패 0) → 수정 후 **13/13 통과**
- 양도세 엔진 회귀 `__tests__/tax-engine/transfer/` + `transfer-tax/` — **331파일 3,557건 통과**

---

## 14. 이번 범위 밖 — 별건 후보

### ✅ O-3 — **D-11로 종결** (2026-08-12 · 개정 2)

> 🔴 **이 항목의 종전 서술은 틀렸다.** 「실가 파트가 `bundledExpenses`를 실제로 소비하므로
> 이중계상 위험이 남는다」·「현행과 동일하므로 악화되지 않는다」로 적어 **별건으로 미뤘는데**,
> 실측하니 분리 ON에서는 그 값이 **어디에서도 소비되지 않았다**. 양도비가 100% 소실되는
> 실재 결함이었다(**58,948,319원 과대**). 상세·수치·엔진 근거는 **§4 D-11**.
>
> **교훈**: 「소비된다」는 전제를 mutation으로 재지 않고 코드 독해로 단정한 것이 원인이다.
> 같은 게이트에서 D-10이 이미 한 번 같은 이유로 무너졌는데(2026-08-08 파트 분기 추가),
> **인접 분기까지 같은 방법으로 재지 않았다**. 게이트 조건을 바꿀 때는 그 조건이 가르는
> **모든 분기**에 mutation을 돌린다(메모리 `feedback_negative_assertion_needs_mutation_probe`).

남은 미결은 없다. **파트 축 상시 활성화**(`landDirectExpenses`를 0이라도 전송)는 여전히
별건이지만, 그것은 분리 **OFF**의 §97②2호 판정 단위 문제이고 D-11과 축이 다르다 —
증축뿐 아니라 **비증축 GB 전체(사례 31·32)** 를 건드리므로 범위가 크다.

### O-4 🟡 일부양도(면적) × 증축(3파트)이 동시에 필요한 실무 케이스

Q-3에서 게이트를 `!gbHasExtension`으로 통일했다. 두 안분 축을 함께 태워야 하는 사례가 확인되면
별도 설계가 필요하다(면적 안분 후 §166⑥ 3-way, 또는 그 반대).
