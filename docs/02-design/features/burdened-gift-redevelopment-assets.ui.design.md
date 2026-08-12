# 부담부증여 지원 확장 (조합원입주권·재개발/재건축 APT) — UI 설계

> 계획서: [`…plan.md`](./burdened-gift-redevelopment-assets.plan.md) · 엔진 설계: [`…engine.design.md`](./burdened-gift-redevelopment-assets.engine.design.md)
> 작성 2026-08-12 · **R2 개정**(STEP 13 검토 반영 — 경로·타입·API 오류 10건 + 정책 4건)
> 상태 **설계(Design)** — Do 진입 전 · ⛔ 분양권 범위 밖

## 0. 한 줄 요약

부담부증여 지원 자산에 **조합원입주권·재개발 APT**를 추가한다. 엔진 설계의 **D-1**(평가액을 `buildingStdPriceAtTransfer`에 적재)과 **D-2**(입주권 = K-4 실지취득가액 전용) 채택으로, UI가 할 일은 초판보다 **크게 줄었다**:

| 초판 | R2 |
|---|---|
| 신규 폼 필드 5 | **3** |
| 신규 섹션 2(④′·④″) | **1**(④′) |
| 취득가액 산정방식 라디오를 게이트 밖으로 | **불요** — 입주권은 선택지가 K-4 하나뿐 |
| 개산공제 1% 표시 분기 | **불요** — K-4는 개산공제 미적용 |

---

## 1. 현행 화면 구조 (실측)

```
TransferModeBlock (양도 정보 · fuchsia)
 └ 라디오: 일반 양도 / 부담부증여(소령 §159) / 공익수용
    ├ 미지원 자산 → 🔴 rose 안내 카드만 (:144-157)
    └ 지원 자산   → BurdenedGiftBlock (:155)         ※ 현재 656줄
          ├ ①  평가 모드 라디오          (:200)
          ├ ②  인수 채무 3분리           (:225)
          ├ ③  시가 모드 블록            (:279 열림 ~ :378 닫힘)  ← {isMarketMode && …}
          │     ├ 양도시 시가 입력       (:285)   ※ 취득시 시가 위젯은 없다(API만 읽음)
          │     ├ 취득가액 산정방식 라디오 (:291-313)  K-4 / K-5
          │     ├ K-4 실지취득가액 입력   (:345-350)
          │     └ K-5 환산 안내 블록      (:367-375)
          ├ ③-b 이월과세 「당초 증여자」   (:380-496)   assetKind 분기 :443
          └ ④  증여재산 평가             (:498-558)
                게이트 :502 = `!isMarketMode && asset.assetKind !== "land"`
                라벨    :520 = GIFT_STD_PRICE_FIELD[kind]?.label ?? "증여일 현재 기준시가"
                testid  :526 = bg-gift-building-std
```

**BurdenedGiftBlock 밖**:

| 카드 | 위치 | 조건 |
|---|---|---|
| 취득시 기준시가 | `components/calc/transfer/asset-sections/AssetSectionTransfer.tsx:152-191`(testid `:155`) | `needsBgAcqStdPriceInput()`(`lib/calc/burdened-gift-acq-std-price.ts:38-44`) |
| 양도시 기준시가 | 동 파일 `:85-122`(게이트 `:85-86`) | `toPropertyKind()`(`CompanionSaleModeBlock.tsx:119`) — 입주권 → `building_non_residential` |
| 재개발 상세 | `RedevelopmentBlock.tsx` | `assetKind ∈ {redevelopment_apt, right_to_move_in}` |

---

## 2. 화면 분기 매트릭스

`○` 표시 · `✕` 숨김 · **굵게** = 이번 변경

| 섹션 | 기존 5종 | **재개발 APT** | **조합원입주권** |
|---|---|---|---|
| ① 평가 모드 라디오 | ○ | ○ | ○ |
| ② 인수 채무 | ○ | ○ | ○ |
| ③ 시가 모드 블록(양도시 시가) | 시가 모드만 | 시가 모드만 | 시가 모드만 |
| ├ 취득가액 산정방식 라디오 | 시가 모드만 | 시가 모드만 | **✕**(K-4 고정) |
| ├ **K-4 실지취득가액 입력** | 시가 모드만 | 시가 모드만 | **항상** |
| └ K-5 환산 안내 | 시가+converted | 시가+converted | **✕** |
| ③-b 이월과세 블록 | ○ | ○ | ○ **(else 분기 = 단일 총액)** |
| ④ 증여재산 평가(단일 칸) | ○ | **○ + 라벨 신설** | **✕** |
| **④′ 조합원입주권 평가(3필드)** | ✕ | ✕ | **○** |
| 취득시 기준시가 카드(밖) | ○ | ○ | **✕** |
| 양도시 기준시가 카드(밖) | ○ | ○ | **✕** |
| RedevelopmentBlock | ✕ | ○ | ○ |

### 근거

엔진 설계 §법령근거 1(괄호 발동 판정 표)·§설계결정 D-1·D-2. 요약하면 — 입주권은 §61③ 평가라 §159①1호 A 괄호가 발동하지 않아 취득가액이 **실지거래가액**이고(K-4), 그 값은 §166①1호가 쓰는 「기존건물과 그 부수토지의 취득가액」이다. 기준시가 칸을 쓰지 않으므로 관련 카드를 전부 숨긴다.

---

## 3. 8개 클라이언트 동기화 지점

### ① 폼 상태 — `lib/stores/calc-wizard-asset-bg.ts` `BurdenedGiftFormSlice`

> ⚠️ `AssetForm`(`calc-wizard-asset.ts:64`)이 이 슬라이스를 `extends` 한다(800줄 정책 분리). bg* 필드는 **전부 이 파일**에 있다.

```ts
// 조합원입주권 평가 (상증법 §61③·상증령 §51②·상증칙 §16③)
bgRightMemberRightsValue: string;   // 조합원권리가액
bgRightPaidInstallments: string;    // 증여일까지 납입 계약금·중도금
bgRightPremium: string;             // 증여일 현재 프리미엄
```

**non-optional `string`** — 기존 bg* 문자열 필드 관행(`:22-38·49-54`)과 일치시킨다(`?:` 아님).

### ② initial — `lib/stores/calc-wizard-asset-factory.ts` `makeDefaultAsset`
**`""`** (bg* 18필드가 전부 `""` — `:420-435`). ①이 non-optional이므로 `undefined`는 타입 에러다.

### ③ normalize — `migrateAsset`
stale sessionStorage 가드: 다른 자산 → 입주권 전환 시 이전 자산의 `bgGiftBuildingStdPriceAtTransfer`가 남아 섞이지 않도록 정리(memory `feedback_new_asset_field_stale_sessionstorage_guard`).

### ④ API 변환 — `lib/calc/transfer-tax-api-burdened-gift.ts` `buildBurdenedGiftInfo`(`:102`)

🔴 **catch-all(`:209-215`) 위에 전용 분기 신설.**

```ts
if (asset.assetKind === "right_to_move_in") {
  // D-1: 평가액 총액을 building 슬롯에 — 단일자산 3종 관행(:211-214)과 동일.
  //      std 4필드를 0으로 두면 양도가액 안분 분모가 0이 되어 세액이 0이 된다.
  const rightTotal = deriveRightValuationTotal(asset);   // ⑤ 파생 함수 — 아래 참조
  return {
    ...common,                                            // ⚠️ 실제 변수명은 `common`(:103)
    landStdPriceAtTransfer: 0,
    buildingStdPriceAtTransfer: rightTotal,
    landStdPriceAtAcquisition: 0,
    buildingStdPriceAtAcquisition: 0,                     // K-4 전용 — 취득시 기준시가 미사용
    acquisitionMethod: "actual",                          // D-2: K-4 고정
    actualAcquisitionTotal: parseAmount(asset.bgActualAcquisitionTotal),
    rightValuation: {
      memberRightsValue: parseAmount(asset.bgRightMemberRightsValue),
      paidInstallments: parseAmount(asset.bgRightPaidInstallments),
      premium: parseAmount(asset.bgRightPremium),
    },
  };
}
// redevelopment_apt는 housing과 동형 ⇒ 기존 단일자산 분기에 합류
```

### ⑤ UI 위젯 — §4

### ⑥ 사이드바 — `lib/stores/calc-wizard-store.ts` `computeTransferSummary`
양도가액 = 인수채무라는 기존 로직을 자산 종류 무관하게 그대로 쓴다. **변경 없음 — 착수 시 grep 확인**(계획서 U-7).

### ⑦ 결과 카드 — `components/calc/results/transfer/BurdenedGiftDetailCard.tsx`

- `PROPERTY_TYPE_LABEL`(**`:43-49`**)에 2종 추가. 없으면 `ptLabel`(**`:57`**)이 `undefined`가 되어 **헤더 자산 라벨이 사라진다**.
- ⚠️ `propertyType` prop(**`:38`**) **union 확장 불요** — 현행이 `… | string`이라 어떤 문자열도 통과한다. 실제 결함은 라벨 엔트리 부재뿐이다.
- 입주권은 `perAsset.building`에 전액이 실리므로 행 라벨을 **`breakdown.assetKind` 기준**으로 「조합원입주권」 분기.
- C 구성 내역은 `rightValuationDetail`로 펼침 표시.
- ⚠️ `salePriceTotal`은 β 하에서 `r`배로 축소된다 — 「분양가」로 표시한다면 라벨을 **「양도로 보는 부분의 분양가」**로(엔진 설계 §result).
- 🔴 **β 고지 표시(U-1 (a)안)** — 엔진이 `warnings`에 push하는 문자열을 **기존 warning 표시 경로 그대로** 노출한다(`detectBurdenedGiftMultiHouseWarning` 선례와 동일). 별도 컴포넌트 신설 금지. 문구·생성 함수는 엔진 설계 §법령근거 4.

### ⑧ Validation — `lib/calc/transfer-tax-validate-bg.ts` `validateBurdenedGiftAsset`(`:35`)

(1)~(6) 번호 검사 체인이다. **(1) 지원목록 검사 직후 `(1-b)` 슬롯**에 입주권 검사를 삽입한다.

| 항목 | 규칙 |
|---|---|
| `SUPPORTED_KINDS`(`:27-33`) + 에러 메시지(`:46`) | 2종 추가 — **둘 다** 수정(메시지가 자산 목록을 한국어로 재하드코딩한다) |
| `bgRightMemberRightsValue` | **필수**(> 0) |
| `bgRightPaidInstallments` · `bgRightPremium` | **0 허용** |
| `bgActualAcquisitionTotal` | 입주권에서 **필수**(K-4 전용) |
| 취득시 기준시가(`:181-185`) | 입주권에서 **요구하지 않음** |

#### ⚠️ 「공용 술어라 함께 움직인다」로 끝내지 말 것

`needsBgAcqStdPriceInput`은 UI(`AssetSectionTransfer.tsx:152`)와 validate(`:181`)가 **같은 함수**를 호출하지만, `feedback_shared_predicate_argument_parity`는 그 서술 자체를 검토 근거로 쓰는 것을 금한다 — 그 메모리의 도출 사례가 **바로 이 술어 계열**이고, 인자 구성이 달라 판정이 갈렸다.

| 계층 | 호출 위치 | 넘기는 인자 | 확인 |
|---|---|---|---|
| UI | `AssetSectionTransfer.tsx:152` | ? | ☐ Do 착수 시 실측 |
| validate | `transfer-tax-validate-bg.ts:181` | ? | ☐ 동상 |

**두 계층에 각각 anchor를 둔다** — 한쪽만 고치는 회귀를 잡기 위함.

---

## 4. 위젯 상세

### 4.1 UI 순서 = 엔진 계산 순서

엔진: `C 산정 → r → 양도가액 → 취득가액`. 입주권 화면 배치는 `① 평가모드 → ② 인수채무 → ④′ 입주권 평가(C) → K-4 취득가액`.

⚠️ **번호를 새로 매기지 않는다.** 기존 ①②③④는 코드 주석 관행이고, ④′를 「④」로 두면 화면에서 ③보다 위에 와 역순이 된다. `<ToneCard tone="emerald" title="증여재산 평가 — 조합원입주권">`처럼 **`sectionNum` 없이 `title`만** 쓴다(`ToneCard`는 둘 다 optional).

### 4.2 ④′ 조합원입주권 평가 (신규 · 입주권 전용)

```
┌ 증여재산 평가 — 조합원입주권 ────────────────────────────┐
│ 상증법 §61③·상증령 §51② — 권리가액 + 납입금 + 프리미엄으로 평가합니다.   │
│                                                                          │
│  조합원권리가액           [              ] 원                            │
│    관리처분계획 기준 (종전자산가격 × 비례율) — 상증칙 §16③               │
│    ⓘ 재개발 정보의 권리가액과 다를 수 있습니다(법문이 다른 값)           │
│                                                                          │
│  증여일까지 납입한 금액    [              ] 원                            │
│    계약금·중도금 등. 없으면 비워두세요                                    │
│                                                                          │
│  증여일 현재 프리미엄      [              ] 원                            │
│    없으면 비워두세요                                                      │
│                                                                          │
│  ┌ 보충적 평가액 (§61③) ──────────────────────┐                       │
│  │ 219,218,500 + 50,000,000 + 130,781,500 = 400,000,000 │               │
│  │ 담보·임대 평가가 더 크면 그 값이 증여가액이 됩니다      │               │
│  └────────────────────────────────────────┘                       │
└──────────────────────────────────────────────────────┘
```

- `FieldCard` + `CurrencyInput`. **placeholder에 숫자 예시 금지** — 안내는 `hint`로.
- 🔴 **박스 라벨은 「보충적 평가액(§61③)」이지 「증여재산 평가액(C)」가 아니다.** 엔진 C는 `max(supplementary, mortgage(§66), rental(§61⑤))`(`burdened-gift-valuation.ts:127-134`)라 근저당이 크면 **박스값 ≠ C**다. 최종 C는 **결과 카드에서 엔진값으로** 표시한다(UI에서 max 재구현 금지 — `feedback_ui_engine_dual_truth_avoidance`).
- 합계는 `useMemo` 순수 계산. **`useEffect` → store 미러링 금지.**

#### 🔑 프리필 — 파생 함수 1개(변형 B)

초판의 「진입 시 store write 1회」는 **구현 수단이 없다** — 섹션 진입은 이벤트가 아니라 `useEffect`밖에 없고, 그것은 금지된 **값 미러링**이다(`feedback_useeffect_store_mirror_forbidden`).

⇒ `feedback_store_default_vs_ui_display_fallback` **변형 B**를 쓴다. 파생 함수를 **하나** 만들고 display·API 변환·validate가 **전부 그것을 호출**한다:

```ts
// lib/calc/burdened-gift-right-valuation.ts (신규)
/** 조합원권리가액 — 미입력 시 재개발 권리가액으로 파생. display·API·validate 공용 단일 소스. */
export function deriveMemberRightsValue(asset: AssetForm): number {
  const explicit = parseAmount(asset.bgRightMemberRightsValue);
  return explicit > 0 ? explicit : parseAmount(asset.redevRightsValue);
}
/** C의 보충적 평가 항 = 권리가액 + 납입금 + 프리미엄. */
export function deriveRightValuationTotal(asset: AssetForm): number { … }
```

그러면 초판이 걱정한 「store가 0으로 남아 ⑧이 침묵 차단」이 **애초에 발생하지 않는다** — validate가 같은 파생을 보기 때문이다. ⚠️ 두 값이 다르면 사용자가 수정할 수 있어야 하므로, 파생값이 쓰이는 동안 「재개발 권리가액에서 파생됨」 배지를 표시한다.

### 4.3 K-4 실지취득가액 — 게이트 재구성 (최소 변경)

현행 `{isMarketMode && ( … )}`가 `:279`에서 열려 `:378`에서 닫히며 그 안에 산정방식 라디오(`:291-313`)·K-4 입력(`:345-350`)·K-5 안내(`:367-375`)가 있다(중간에 끼어드는 형제 요소 없음 ⇒ 분리 가능함을 실측 확인).

입주권은 **K-4 고정**이라 라디오가 필요 없다. ⇒ **K-4 입력만** 밖으로 꺼낸다.

```tsx
{isMarketMode && ( <div>{/* 양도시 시가 + 산정방식 라디오 + K-5 안내 */}</div> )}

{/* K-4 실지취득가액 — 시가+actual 이거나 입주권 */}
{(isMarketMode && bgAcquisitionMethod === "actual") || isRightToMoveIn ? (
  <div>{/* 기존 :345-350 블록 */}</div>
) : null}
```

입주권 전용 안내: 「입주권의 취득가액은 **종전 부동산의 실지취득가액**입니다(소령 §166①1호 · §97①1호가목). 채무비율만큼 안분됩니다.」

⚠️ **K-5 안내 블록(`:367-375`)은 건드리지 않는다** — 입주권에서는 렌더되지 않는다. 그 안의 하드코딩 문구(「취득시·양도시 기준시가를 입력하세요」·「개산공제 §163⑥ 3% 자동 적용」)가 입주권에서 거짓이 되는 문제는 **노출 자체를 막아 해소**된다.

### 4.4 ④ 증여재산 평가 — 자산별

```ts
// BurdenedGiftBlock.tsx:502
- {!isMarketMode && asset.assetKind !== "land" && ( … )}
+ {!isMarketMode && asset.assetKind !== "land"
+   && asset.assetKind !== "right_to_move_in" && ( … )}   // ④′로 대체
```

```ts
// GIFT_STD_PRICE_FIELD (:55~) — 재개발 APT 라벨 신설
redevelopment_apt: {
  label: "증여일 주택 기준시가",
  hint: "개별주택가격·공동주택가격 — 부수토지를 포함해 일괄 고시된 가액(상증법 §61①4호)",
},
```

❌ **입주권 엔트리 추가 금지** — 단일 필드 모델로 되돌아가 ④′와 dual-truth가 된다.
✅ **모달 런처는 현행 `null` 유지가 정답** — `bgGiftStdPriceLauncherSpec`(`burdened-gift-std-price-launcher.ts:99`)은 2종에 `null`. §61①4호·§61③ 모두 건물기준시가 계산기 대상이 아니다(housing과 동일). **변경 없음 — 확인필**.

### 4.5 밖에 있는 두 카드 숨김

```ts
// lib/calc/burdened-gift-acq-std-price.ts:38-44 — UI·validate 공용 술어
+ && assetKind !== "right_to_move_in"      // K-4 전용 — 취득시 기준시가를 쓰지 않는다
```

```ts
// asset-sections/AssetSectionTransfer.tsx:85-86 — 양도시 기준시가 카드
// toPropertyKind(CompanionSaleModeBlock.tsx:119)가 입주권을 building_non_residential로
// 매핑해 비주거 건물 공시가격 조회 UI가 뜬다 ⇒ 부담부증여 + 입주권에서 렌더 제외.
```

### 4.6 ③-b 이월과세 블록 — **결정**

`:443` 분기가 `general_building || land` vs else다. **입주권은 현행 else 분기(단일 총액 `bgCoDonorActualAcquisitionTotal`)를 그대로 쓴다** — K-4 전용이라 토지·건물 분리가 성립하지 않으므로 단일 총액이 정합한다. (계획서 PR 11 해소.)

### 4.7 X-1 차단 — `RedevelopmentBlock.tsx:162`

`SUBJECT_OPTIONS.map((o) => ({ ...o, disabled }))` 구조라 아래가 문법적으로 맞물린다(실측 확인).

```ts
disabled:
  (asset.assetKind === "right_to_move_in" && o.value === "apt") ||
  (asset.assetKind === "redevelopment_apt" &&
   o.value === "right" &&
   asset.transferType === "burdened_gift"),
```

⚠️ **`RadioCardOption`에는 `disabledReason`이 없다**(`RadioCardGroup.tsx:90-102` — `description`·`hint`·`disabled`·`testId`·`trailing`·`lawRefs`뿐. `disabledReason`은 `ToggleCard` 전용). ⇒ 사유는 **`description`**에 넣는다: 「부담부증여에서는 선택할 수 없습니다 — 자산 종류를 「입주권」으로 바꾸세요.」
⚠️ **일반 양도 경로는 무변경.**

### 4.8 800줄 정책

`BurdenedGiftBlock.tsx` **656줄** + ④′(≈60줄) + 게이트 수정 ⇒ **≈720줄**. 트리거(800)에는 못 미치나 CLAUDE.md 「≥750 위험구간」에 근접하고, 같은 절이 **「기회주의적 분리 — 이미 연 파일이 위험구간이면 그 김에 분리」**를 권고한다.

⇒ ④′를 **`BurdenedGiftRightValuationSection.tsx`로 신설 분리**한다. 신규 섹션이라 분리 비용이 가장 싸고, 본체는 656줄 근처를 유지한다.

---

## 5. testid · E2E

기존 관행: `bg-gift-building-std`(`:526`) · `bg-acq-std-price`(`AssetSectionTransfer.tsx:155`) · `bg-codonor-*`.

| 필드 | testid |
|---|---|
| 조합원권리가액 | `bg-right-member-rights-value` |
| 증여일 납입금 | `bg-right-paid-installments` |
| 증여일 프리미엄 | `bg-right-premium` |
| 보충적 평가액 박스 | `bg-right-valuation-total` |
| K-4 실지취득가액 | 기존 재사용 |

⚠️ `ToneCard`·`FieldCard` 등 공용 카드는 `data-testid`를 DOM으로 흘리지 않을 수 있다(memory `feedback_shared_card_testid_not_forwarded`) — **입력 요소에 직접** 부여한다.

E2E: `e2e/transfer-burdened-gift-right-to-move-in.spec.ts`(신규 — `transfer-` 접두는 기존 85건 관행). 폼→계산→결과 1건 + X-1 차단 1건(**양성 대조군 동봉**).

---

## 6. 렌더 도달성 확인 (Do 착수 시 필수)

`feedback_api_trigger_without_input_path_is_noop` — payload만 열면 세액이 전혀 안 바뀔 수 있다.

1. `grep -rn "bgRight" components/`로 **onChange 쓰기 지점** 확인(읽기·타입 선언 제외)
2. 그 컴포넌트가 **입주권 + 부담부증여 조합에서 마운트되는지** — 자체 게이트와 호출부 게이트 **둘 다**
3. Pre-Do anchor를 **컴포넌트 렌더 레벨**로(`render(<BurdenedGiftBlock …/>)` + 식별 텍스트) — 구현 전 실패 확인

---

## 7. 브라우저 실측 (Do 종료 게이트)

Playwright(memory `feedback_browser_verify_with_playwright`):

- 입주권 + 부담부증여 → ④′ 렌더 · ④ 미렌더 · 취득시/양도시 기준시가 카드 미렌더 · **K-4 입력이 기준시가 모드에서도** 보이는가
- Network request body에 `rightValuation` 3필드 + `buildingStdPriceAtTransfer`에 **평가액 총액**이 실리는가(⑫ 침묵 strip 확인 · D-1 검증)
- 결과 세액이 **0이 아닌가** (D-1을 어기면 조용히 0이 된다)
- 결과 카드 헤더 자산 라벨이 표시되는가
- 재개발 APT + 부담부증여 → `redevSubject`에서 「입주권」이 비활성인가
