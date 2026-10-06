# 일반 주택 비-별개 취득시 기준시가 분할: 뺄셈 → 비례 (S3-1) — 엔진 설계 + Pre-Do anchor

> 작성 2026-10-06 · 브랜치 `fix/housing-std-split-proportional` · 워크트리 `Property-related-Taxes-s3` (HEAD `10acb8e40`)
> 상위: `docs/00-pm/housing-std-split-proportional.plan.md` (Q-1~Q-4 확정) · 조사: `…engine-audit.md`·`…authority.md`
> **소스 수정 없음** — 산출물 = 이 문서 + anchor `__tests__/api/transfer.route.housing-std-split-proportional.s3-1.predo.anchor.test.ts`.
> 표기: **확인**=파일을 열어 줄 번호까지 본 것 · **실측**=실행한 것 · **확인 필요**=못 본 것.

## §0 요약

**결정**

1. **필드 재사용 — 신설 불필요.** 비-별개 취득시 건물 나목은 별개 취득이 이미 쓰는 `buildingStandardPriceAtAcquisition`(폼 `buildingStandardPriceAtAcq`)을 그대로 쓴다. 의미가 같다(「취득시 건물 기준시가 §99①1호 나목」). ①②③·⑨⑩·⑫ 필드 정의·⑬·⑭ 필드 매핑은 **이미 존재**하고(§4), 바뀌는 것은 **게이트(④·⑤·⑧)와 필수화(⑫·엔진)** 뿐이다.
2. **필수 술어(엔진 leaf 1곳)**: `주택(propertyType==="housing") ∧ 비-별개(isSeparateAcquisition≠true) ∧ **소유자 분리(selfOwns≠both)** ∧ requiresAcqStdPrice(양 파트 OR, isSeparate:false)` 이면 나목 필수. 엔진 throw는 여기에 `토지분 L>0 ∧ 결합가 H>0`(쌍이 실제로 만들어지는 경우)를 더한다. **양 파트 OR**인 이유 — 비례에서는 토지분도 나목에 의존하기 때문이다. **소유자 분리를 게이트에 넣은 것은 UI 시니어 E-4 지적을 수용한 결과다**(초안은 `selfOwns`를 안 봐서 소유자 분리를 켰다 끈 stale 단가 세션에서 칸 없는 throw가 생겼다 — §3.2). 소유자 분리가 아닌 비-별개는 나목이 없으면 **분할 포기(null → 단일 자산 경로, 종전 `split-gain.ts:99` 규약)** 이고 throw하지 않는다. 술어는 기존 소비 술어 `requiresAcqStdPrice`를 그대로 써서 「분할 값이 세액에 닿지 않는 경우」(양쪽 실가 + 파트 취득가액 직접입력)에는 요구하지 않는다(거짓 요구 금지). 미입력 → 엔진 `TaxCalculationError(INVALID_INPUT)` / ⑫ 400 `buildingStandardPriceAtAcquisition` / ⑧ `buildingStandardPriceAtAcq` 필드 오류.
3. **산식**: `토지분 = floor(H × L ÷ (L + N))`(`safeMultiplyThenDivide`), `건물분 = H − 토지분`(잔액 흡수). **양도가액 안분이 이미 쓰는 함수와 같은 절사**를 쓰도록 `apportion()`(`sale-split-apportion-basis.ts:103-107`, 현재 private)을 공용 leaf로 올려 두 곳이 호출한다.
4. **`calcDerivedBuildingStdAtAcq`는 UI가 쓰지 않는다**(grep: 호출부 엔진 1곳). UI 동시 교체 불필요.

**조사 중 새로 드러난 사실 — 오케스트레이터 결정 필요 (§9 D-1·D-2)**

- 🔴 **D-1 「양도시는 이미 비례」는 양도가액 안분에만 해당한다. 환산 분모(양도시 토지·건물 기준시가)는 비례가 아니다.** 환산 분모는 사용자가 입력한 양도시 가목·나목 **원값**을 쓴다(`transfer-tax-split-acq-price.ts:296-299`). 계획서 §3의 a2 `−36,372,672`(184,060,368)와 b1 값은 **취득·양도 양쪽을 비례로 넣은 값**이다. **취득시만 비례로 바꾸면(ⓐ) 현행에서 일관된 토지 파트 환산이 깨진다 — 실측**: 현행 토지 환산취득가 = 480M × L_A÷L_T(원값/원값) = **205,714,285**(ⓑ와 같음), ⓐ = 480M × land′÷L_T(비례/원값) = **164,571,428**(−41,142,857). 건물 파트는 현행 205.7M → ⓐ 246.9M → ⓑ 308.6M. 즉 ⓐ는 건물을 올리지만 **토지를 새로 틀리게 만든다**(양도차익 총액은 774,171,430으로 현행과 같음, a2 세액 −2,503,872). 국세청 해석도 분모를 비례로 본다(authority N12 「분모 = 양도당시 개별주택가격 → 가목·나목」, PHD 엔진 정본 `pre-housing-disclosure.ts:130-146`). ⇒ **권고: ⓐ 단독 출시 불가, 환산 파트가 있는 경로는 ⓑ(분모도 H_T 척도)와 함께 가야 한다**(§9 D-1에 판정·비용).
- 🔴 **D-2 별개 취득 + 나목 생략의 「한시 후퇴」도 같은 뺄셈 leaf를 쓴다**(`calcAcqStdPair:63-68`). A1을 지우면 이 갈래도 함께 막힌다 — Q-3(뺄셈 fallback 금지)의 필연이나, 계획서 S3-1 범위의 문장(「비-별개」)에는 명시돼 있지 않다. 별개 취득 UI는 나목을 항상 받으므로(`transfer-tax-api-split.ts:147-157`) UI 영향은 없고 **API 직접 호출만 400이 된다.**
- 🔴 **A3(양도시 후퇴 fallback)은 API로 도달한다**(audit 「대체로 미도달」 정정, 실측 §5-E): 양도시 감정평가가액 양쪽을 보내면 ⑫가 V7(`required-refines-2a.ts:254` early-return)을 건너뛰고, 환산 파트 + 양도시 기준시가 없음이 **HTTP 200**(별개 141,615,200 / 비-별개 199,849,680)으로 나간다. ⑧(UI)은 `needsSaleStdPart`가 항상 true라 막는다. 따라서 A3 제거는 **엔진 throw + ⑫ 필수화**(환산 파트의 양도시 기준시가는 감정평가가액과 무관하게 분모이므로)가 같이 가야 한다.
- 안분 비율 정의: 비-별개 취득가액·자본적지출 안분 비율을 「쌍(land′, H−land′)에서 land′÷H」로 둘지 「L÷(L+N)」로 둘지가 **취득가액 1원 단위에 영향**한다(무작위 200만건 실측 56%에서 ≥1원 차이). 이 설계는 **쌍에서 도출**(`calcApportionRatio` 무변경)을 택한다 — 「분모 = 파트 합계가 정본」이라는 현행 계약(`split-acq-price.ts:78-85`)과 특성화 anchor 재구현 방식이 모두 그렇다.

## §1 변경 대상·호출부

| ID | 위치 (확인) | 현행 | S3-1 처리 |
|---|---|---|---|
| A1 | `lib/calc/transfer-tax-split-acq-mode.ts:258-272` `calcDerivedBuildingStdAtAcq(total, landStd)` = `total>0 ? max(total−landStd,0) : null` | 소비자 **1곳**(`transfer-tax-split-acq-price.ts:66`). 주석 「역산이 정본」(:259-262) | **주택 용도 삭제.** `propertyType==="building"` 레거시 후퇴가 아직 호출하므로 함수 자체는 유지하되 주석을 「일반건물 한시 후퇴 전용 — 주택에 쓰지 말 것」으로 정정(§7) |
| A2 | `lib/tax-engine/transfer-tax-split-acq-price.ts:37-76` `calcAcqStdPair` — 레거시 역산 분기 :63-68 | 비-별개 전부 + 별개이나 나목 생략(D-2) | housing 분기 신설: 비-별개 → 비례 쌍 / 별개 → 나목 필수(레거시 제거). 일반건물(`building`)은 종전 유지 |
| A2′ | 같은 파일 :86-95 `calcApportionRatio` | `land/(land+building)` | **무변경**(쌍에서 도출) |
| A3 | 같은 파일 :296-299 `landStdAtTransferBase = input.landStandardPriceAtTransfer ?? floor(총액×취득시 landRatio)` · `buildingStdAtTransfer = … ?? max(총액−land,0)` | 환산 파트 + 양도시 기준시가 없음 → 취득시 비율로 양도시를 나눔(시점 혼합) | 제거 → 환산 파트의 해당 값 null이면 throw. `calcPartAcquisitionPrice:171-173`의 `partStdAtTransfer>0 ? … : 0`(침묵 0)도 같이 방어 |
| 소비 | `transfer-tax-split-gain.ts:71-74`(ratio·쌍) → `:87-104` missingStd 게이트 → `:150`(환산 분자 `calcSplitAcquisitionPrice`) · `:214-224`(개산공제 base) · `:171`(자본적지출 `splitPair`) | | 쌍의 정의만 바뀌면 전파 |

**호출부 전수(grep, lib·components·app)**: `calcDerivedBuildingStdAtAcq` — 정의 1 + 소비 1(엔진). `calcAcqStdPair` — 정의 + `calcApportionRatio`·`calcSplitGain`. UI 컴포넌트는 두 함수를 **호출하지 않고** 주석에서만 이름을 언급한다(`LandBuildingSplitSection.tsx:339·460`, `CompanionAcqStdPriceSection.tsx:83·118`). 테스트 직접 import: 특성화 anchor + 기존 13파일(§6).

**UI 읽기 전용 표시**: 별개 취득의 파생 패널(`SplitAcqStdReadonlyPanel`)은 2026-07-30 폐지(`CompanionAcqStdPriceSection.tsx:116-123`)돼 **현재 어떤 UI도 건물분 파생값을 계산해 보이지 않는다.** 결과 카드는 엔진 echo(`stdPriceDerivedFromTotal`)만 읽는다(`SplitGainDetailSection.tsx:127-135`).

## §2 산식·절사 규약·손계산

```
토지분(land′) = floor( H × L ÷ (L + N) )          // safeMultiplyThenDivide — BigInt 경로 포함
건물분(bld′)  = H − land′                           // 잔액 흡수 → 토지분 + 건물분 ≡ H (§163⑥2호가목 라목 가액 불변식 보존)
L = floor(㎡당 개별공시지가 × 면적)  (calcLandStdPriceAtAcq, 가목)   N = 취득시 건물 기준시가 (나목)   H = 취득시 개별주택가격(결합)
```

- **같은 함수·같은 절사**: 양도가액 안분은 `sale-split-apportion-basis.ts:103-107` `apportion(total, {land, building})` = `floor(safeMultiplyThenDivide(total, land, land+building))`, 건물 = `total − land`. 신규 leaf `apportionByStdPrice(total, land, building)`을 **`lib/tax-engine/std-price-apportion.ts`(신설, ~15줄)** 에 두고 ① `apportion()` ② 신규 취득시 쌍이 호출한다. PHD(`pre-housing-disclosure.ts:130-146`)는 `Math.floor(P*land/sum)`(부동소수)이나 **무변경**(Excel 정본 anchor 보호 — 무작위 200만건 실측에서 정수 BigInt와 차이 0건이나 보장은 아니므로 통일은 후속 과제).
- **음수·clamp 없음**: `L>0, N>0` 이면 `0 < land′ < H`. 뺄셈의 `max(…,0)` clamp(건물분 0 침묵)가 사라진다. `N` 미입력(≤0)은 clamp가 아니라 **차단**이다. `H≤0` 또는 `L=null`이면 종전대로 쌍 null(분할 포기 — 별개 경로).
- **집행기준 99-164-9 정합**: 60,000천원 × 50/80 = 37,500천원(토지, 먼저 floor) / 22,500천원(주택 = 나머지) — 토지분을 먼저 구하고 건물이 잔액을 흡수하는 순서가 같다.

**손계산 (특성화 a1 취득시)**: H=480,000,000 · L=240,000,000(단가 2,400,000×100㎡) · N=360,000,000
→ land′ = floor(480,000,000×240,000,000 ÷ 600,000,000) = **192,000,000**, bld′ = **288,000,000**. 현행 뺄셈은 240,000,000 / 240,000,000이다.
양도시(이미 비례): H_T=1,120M·L_T=560M·N_T=840M → 448,000,000 / 672,000,000.

**나머지 소비 지점의 절사(변경 없음, 쌍 값만 교체)**: 환산 분자 `floor(파트 양도가 × 파트 취득시 / 파트 양도시)`(`split-acq-price.ts:171-173`) · 개산공제 `computeEstimatedDeduction`(파트 독립 floor — 「잔액 흡수 금지」 주석 `split-gain.ts:205-224` 유지) · 취득가액 안분 `Math.floor(total × land′/H)`(`splitPair :126`, 쌍 도출 비율).

## §3 신규 입력·필수 술어

### 3.1 필드 재사용 근거

| | 별개 취득 | 비-별개(S3-1) |
|---|---|---|
| 의미 | 「건물 취득시 기준시가(나목)」 — 건물 취득일 직전 고시분 | 「건물 취득시 기준시가(나목)」 — **단일 취득일** 직전 고시분 |
| 엔진 필드 | `buildingStandardPriceAtAcquisition`(`transfer.types.ts:1041`) | **같음** |
| 폼 필드 | `AssetForm.buildingStandardPriceAtAcq`(`calc-wizard-asset.ts:740`, 초기값 `""` `factory.ts:242`, migrate `:80`) | **같음** — 레거시 저장 자산은 `""`로 복원돼 ⑧이 막는다(값을 지어내지 않음) |
| 엔진 용법 | 파트 독립 쌍 `{L, N}` (총액 미참조) | **비례 쌍** `{land′, H−land′}` (총액 H 참조) — 용법만 다르고 입력 의미는 같다 |
| 모달 | `BuildingStdPriceModalButton`(건축물대장 연면적 — Q-4) · `LandBuildingSplitSection.tsx:225-254` | 재사용. prefill `acquisitionDate`는 단일 취득일 |

⚠️ **엔진 분기 키는 필드 유무가 아니라 `isSeparateAcquisition`이다.** 같은 필드가 두 용법(파트 독립 / 비례)을 가르므로 `isSeparateAcquisition===true`가 정본이다 — 필드 유무로 가르면 stale 값이 용법을 바꾼다.

### 3.2 필수 술어 (leaf 1곳) — UI 시니어 E-4·E-8 반영

```ts
// lib/calc/transfer-tax-split-acq-mode.ts — requiresAcqStdPrice 바로 아래 신설 (엔진·⑫·⑧·UI 어댑터의 단일 소스)
export function requiresHousingBuildingStdAtAcq(
  g: { isHousing: boolean; isSeparate: boolean; isOwnerSplit: boolean },
  a: AcqStdPriceNeedFlags,
  ctx: Omit<AcqStdPriceNeedContext, "isSeparate">,
): boolean {
  return g.isHousing && !g.isSeparate && g.isOwnerSplit && requiresAcqStdPrice(a, { ...ctx, isSeparate: false });
}
```

- **폼 전용 플래그(겸용·부담부증여·PHD 양쪽 환산)는 엔진 leaf에 넣지 않는다.** UI의 `ownerSplitHousingNeedsBuildingStd(asset: AssetForm)`가 이 leaf를 부르는 **얇은 어댑터**다 — 겸용(`isMixedUseHouse`)·부담부증여(`transferType`)·PHD 양쪽 환산(`usePreHousingDisclosure ∧ 두 파트 estimated`)은 어댑터가 더한다(E-8 i). 엔진은 같은 제외를 입력 자체로 이미 거른다: 겸용은 `calcSplitGain` 비경유, 부담부증여는 ④가 분할 축을 안 보냄(`isSplitPayloadActive`), PHD 양쪽 환산은 `calcSplitGain:67-69` early-return.
- **`isOwnerSplit = (selfOwns ?? "both") !== "both"`** — 엔진은 `input.selfOwns`, ⑫는 `d.selfOwns`, ⑧은 `effectiveSelfOwns(asset)`(V8의 `selfOwnsSplit`와 같은 값).

| 계층 | 호출 형태 | 추가 조건 |
|---|---|---|
| 엔진 `calcSplitGain` | `isHousing = propertyType==="housing"`, `isSeparate = isSeparateAcquisition===true`, `isOwnerSplit = (selfOwns??"both")!=="both"`, ctx = `stdNeedCtx`(`split-gain.ts:81`) | **L>0 ∧ H>0 ∧ N 없음** → throw. 소유자 분리가 아니면 같은 조건에서 **null(분할 포기, 종전 :99)** |
| ⑫ `refineSplitAcquisitionInputs`(`required-refines-2a.ts:198`) | `d.propertyType==="housing"`, `separate = d.isSeparateAcquisition===true`, `selfOwnsSplit`(:206 이미 존재) | 기존 가드(`mixedUse·PHD·parcels·burdened_gift` 제외, `!landAcquisitionDate && !selfOwnsSplit` 제외) + V8 블록(:210-219)과 같은 조건 안에서 N 추가 — **L·H 검사(:216-218)가 이미 같은 `if`다** |
| ⑧ `validateSplitDirectInputs`(`validate-split.ts:136-171` V8) | V8 블록의 기존 조건(`selfOwnsSplit ∧ !isSeparateAcquisition ∧ requiresAcqStdPrice`)에 `asset.assetKind==="housing"` 추가 + 총액 다음에 N 검사 | UI 어댑터와 **동일 조건**이어야 하므로 V8 조건을 어댑터 호출로 바꾸는 것은 선택(§9 D-5) |
| ⑤ 카드 노출 · ④ N 전송 | UI 어댑터 `ownerSplitHousingNeedsBuildingStd` | ④는 **노출 leaf와 같은 조건에서만** 보낸다(E-8 ii 채택 — 숨은 stale N 차단) |

- **왜 `requiresAcqStdPrice`(양 파트 OR)이고 `requiresAcqStdPricePart("building")`가 아닌가**: 별개 취득의 V6는 건물 파트 술어(건물이 환산일 때만 N 필요)다. 비례에서는 **토지분도 N을 쓰므로**(land′ = H·L/(L+N)) 토지만 환산이어도 N이 필요하다(anchor R-5: 토지 환산취득가 205,714,285 → 164,571,428). 별개 쪽 술어를 복사하면 「토지 환산 + 건물 실가」에서 N 없이 통과해 엔진이 던진다(⑧↔엔진 모순).
- **거짓 요구 금지**: 양쪽 실가 + 두 파트 취득가액 직접입력이면 `requiresAcqStdPrice`=false → N 불요(anchor C-6). `usesPhd`면 ④가 `standardPriceAtAcquisition=undefined`를 보내므로(`transfer-tax-api.ts:350-351`) H=0 → 쌍 null → 불변.
- **소유자 분리가 아닌 비-별개(E-4 대상)**: 토지 취득일이 있고 L·H가 있는데 N이 없는 상태는 UI에서 N 칸이 안 열리므로(UI §1.2 c — 토지 단가 입력칸이 없다) **요구하지 않는다.** 엔진은 쌍 null → `missingStd` → 종전 규약(`split-gain.ts:99`)대로 **null(단일 자산 경로)** 이다. 종전에는 stale 토지 단가가 남은 세션에서 뺄셈으로 분할이 돌았다 — **결과가 달라지는 지점**(분할 → 단일 자산 환산·안분)이며 §9 확인 필요 ⑤에 사용자 영향을 남긴다. 이 상태는 UI로 새로 만들 수 있는 것이 아니라 stale/API 직접 입력이다.
- **미입력 신호**: 소유자 분리에서 L>0∧H>0인데 N만 없는 경우 엔진은 throw한다(소유자 분리에서 null을 내면 `selfOwns`가 무시되어 비소유 파트까지 과세되는 침묵 오답이다 — 종전 V8/⑫ 주석 `required-refines-2a.ts:207-209`). L·H 미입력의 null 경로는 불변. 메시지 초안: 「개별주택가격(결합 공시)을 토지분·건물분으로 나누려면 취득시 건물 기준시가(나목)가 필요합니다 — 토지분 = 개별주택가격 × 가목 ÷ (가목 + 나목) (소득세법 §99①1호 가목·나목, 시행령 §166⑥).」(납세자 유·불리 표현 금지)
- **엔진 쌍 규칙(leaf 뒤)**: `housing ∧ !separate ∧ L>0 ∧ H>0 ∧ N>0` → 비례 쌍(소유자 분리 여부 무관 — API 직접 입력이 N을 주면 쓴다). N이 없으면 쌍 `null`. 별개는 `N>0` 이면 파트 독립, 없으면 `{land:L, building:null}`(→ 별개 throw, D-2).

### 3.3 ⑧↔⑫↔엔진 게이트 격자 (한쪽만 막는 갭 방지)

| 입력 조합(주택, split active) | 엔진 | ⑫ | ⑧ | UI 카드 |
|---|---|---|---|---|
| 비-별개 ∧ **소유자 분리** ∧ 술어 참 ∧ L>0 ∧ H>0 ∧ N 없음 | throw | 400 `buildingStandardPriceAtAcquisition` | 필드 오류 `buildingStandardPriceAtAcq` | 열림(필수) |
| 비-별개 ∧ 소유자 분리 ∧ 술어 거짓(양쪽 실가·직접입력) ∧ N 없음 | 통과 | 통과 | 통과 | 닫힘 |
| 비-별개 ∧ 소유자 분리 ∧ (L 없음 ∨ H 없음) | null(종전) | 종전(V8이 L·H 요구) | 종전(V8) | 열림(L·H 칸) |
| 비-별개 ∧ **소유자 분리 아님** ∧ 술어 참 ∧ L>0 ∧ H>0 ∧ N 없음(stale/API) | **null(분할 포기)** | 통과 | 통과 | 닫힘 |
| 별개 + N 없음(D-2) | throw(레거시 제거) | 400 (`2a.ts:246-249`에서 `&& !positive(H)` 삭제) | 종전 V6가 이미 요구 | 별개 파트 카드 |
| 환산 파트 + 양도시 파트 기준시가 없음(A3) | throw | 400 (감정평가가액 양쪽이어도 해당 파트가 환산이면 요구 — `:254` early-return 앞에 파트별 요구 추가) | 종전 V7이 이미 요구 | 축 A 카드 |

## §4 엔진·API 변경 지점 (14 동기화 — 엔진·API 측)

| 지점 | 변경 | file:line (확인) |
|---|---|---|
| 신설 leaf | `apportionByStdPrice` | `lib/tax-engine/std-price-apportion.ts`(신설). `sale-split-apportion-basis.ts:103-107` `apportion`이 호출 |
| 엔진 쌍 | housing 분기(비례 / 별개 N 필수) · 일반건물 레거시 유지 | `transfer-tax-split-acq-price.ts:37-76`, import :15-17, 주석 :19-35 정정 |
| 엔진 A3 | fallback 제거·throw | `:296-299`, 방어 `:171-173` |
| 엔진 게이트 | 비-별개 housing N 누락 throw | `transfer-tax-split-gain.ts:87-104` |
| 술어 leaf | `requiresHousingBuildingStdAtAcq` | `lib/calc/transfer-tax-split-acq-mode.ts`(`requiresAcqStdPrice` :~410 아래) |
| ④ | N 전송 게이트: `separateAcquisition` → `separateAcquisition ∨ ownerSplitHousingNeedsBuildingStd(primary)`(**UI 노출 leaf와 같은 조건 — E-8 ii 채택**); **`standardPriceAtAcquisition: undefined` 덮어쓰기는 별개에만 유지**(비-별개는 총액 H가 비례의 입력) | `transfer-tax-api-split.ts:145-157` (영향 경로 4: 단건 `transfer-tax-api.ts:418` · 다건 `multi-transfer-tax-api.ts:282` · 컴패니언 `transfer-tax-api-companion-payload.ts:179` — 모두 `buildSplitPayload` 경유, 개별 수정 불요) |
| ⑨⑩ | enum 변경 없음 | — |
| ⑪ | 해당 없음(취득일 fallback은 `transfer-tax-api-split.ts:118-136`이 이미 처리) | — |
| ⑫ 정의 | 이미 존재 | `transfer-tax-schema-split.ts:73` · `base-shape.ts:284` |
| ⑫ 필수화 | ① 소유자 분리 ∧ 비-별개 housing N 필수(V8 블록 `:210-219` 안, L·H 검사와 같은 `if`) ② 별개의 `&& !positive(d.standardPriceAtAcquisition)` 삭제(D-2) ③ 환산 파트 양도시 기준시가 요구(A3) | `required-refines-2a.ts:210-219` · `:246-249` · `:254` early-return 앞 |
| ⑫ 잔여 | `hasIndependentAcqStd = !!N`은 `useEstimatedAcquisition`의 H 필수를 면제 | `transfer-tax-schema-refines.ts:156-157` — **N이 있으면 H가 면제**되나 비-별개 housing에서는 H가 비례 분자라 필수여야 한다. 면제 조건에 `isSeparateAcquisition===true` 추가 필요(확인 필요: 이 면제가 비-별개 housing에 닿는지는 anchor로 실측 요망) |
| ⑬ | spread | 변경 없음(`buildSplitPayload`) |
| ⑭ | 매핑 | 이미 존재: `engine-input.ts:328` · `multi/route.ts:204` · `bundled-split-helpers.ts:411` |
| 컴패니언 Zod | SP refine이 컴패니언에는 호출되지 않는다(`refineCompanionPreDeemedAcquisitionSource`만) → N 누락은 엔진 throw(`TaxCalculationError`)로 도달. 종전 SP 규칙도 컴패니언 미적용이라 **동형 갭이며 S3-1이 새로 만든 것이 아님** | `transfer-tax-schema.ts:28` |
| ⑧ | 비-별개 housing N 필수(V8 아래) | `transfer-tax-validate-split.ts:136-160` |
| ⑦ 결과 echo (E-2) | `SplitGainResult.stdSplit?: { housingTotal: H; landStd: L; buildingStd: N; landBasis: land′; buildingBasis: bld′ }` 신설. 비-별개 housing 비례 경로에서만 채운다(별개·일반건물·구 resultData는 없음). `calcAcqStdPair` 반환에 같은 객체를 싣고 `calcSplitGain`이 결과로 옮긴다. UI는 `stdSplit` 유무로 분기(`stdPriceDerivedFromTotal` 의미에 의존하지 않게) | `types/transfer-split-gain.types.ts:73` 근처 · `split-gain.ts:276-295` |
| ⑥ 사이드바 | **변경 없음** — UI 시니어 확인: 대상(소유자 분리·분할) 자산은 `isPlainLumpSumAsset`이 제외해 미리보기(`transfer-per-asset-summary.ts:695-706` 총액×율)에 걸리지 않고 계산 후 엔진 값을 읽는다(audit §7-7 해소) | — |

## §5 anchor 실측

파일: `__tests__/api/transfer.route.housing-std-split-proportional.s3-1.predo.anchor.test.ts` (Route + 엔진 직접). 실행: `npx vitest run <path> --project node` → **19 passed | 9 skipped**, tsc 오류 없음. `it.skip`을 모두 풀면 **9건 전부 실패**하고 실패 메시지가 기대한 축이다(실측: B-1 `133780000→129860000` 기대 · B-3 `97380000 ≠ 74870000` · B-4/B-5/B-6 `expected [Function] to throw` · B-4b 현행은 분할 실행 · B-7 `200 ≠ 400`) — 구별력 확인.

| 블록 | 건수 | 내용 |
|---|---|---|
| (0) 산식 전제 | 3 | 비례 토지분 = 독립 BigInt 재구현과 1원 일치(안전 정수 초과 포함), 집행기준 99-164-9 형태(60M×50/30 → 37.5M/22.5M), 뺄셈 = 비례 ⇔ H = L+N |
| (A) 현행 고정 | 5 | 나목을 보내도 **무시**되고 뺄셈으로 계산(A-1 a1 133,780,000 · A-2 a2 220,433,040 · A-3 a3 Route 97,380,000/21,905,000 · A-4 b1 45,128,160 · A-5 **A3 API 도달** 200: 141,615,200 / 199,849,680) |
| (R) 기대값 재구현 | 5 | 비례값을 입력 칸으로 넣어 (B)의 숫자를 현행 엔진에서 1원 단위 재현: R-1 a1 · R-2 a2 ⓐ · R-3 a2 ⓑ · R-4 a3 Route · R-5 토지만 환산 |
| (B) 수정 후 | 9 skip | B-1 a1 · B-2 a2 ⓐ · B-2b a2 ⓑ · B-3 a3 Route · B-4 소유자 분리 N 누락 차단 · B-4b 소유자 분리 아님은 분할 포기 · B-5 토지만 환산 N 필요(양 파트 OR) · B-6 별개+N 생략 차단(D-2) · B-7 A3 차단 |
| (C) 회귀선 | 6 | C-1 함께 취득 141,060,000(나목 유무·비례 재현 모두) · C-2 별개 취득 불변 182,874,960 · C-3 PHD 26,100,130 · C-4 양도가액 안분 480M/720M · C-5 일반건물 레거시 `{240M, 240M}` 236,137,680 · C-6 거짓 요구 금지(양쪽 실가 + 직접입력 141,060,000) |

**기대값 (원, mock 세율표 실측)** — 가상 fixture: 취득시 H 480M·L 240M·N 360M / 양도시 H 1,120M·L 560M·N 840M, 양도 2026-06-30, 비조정 2주택.

| 시나리오 | 현행(뺄셈) | 수정 후 | 비고 |
|---|---|---|---|
| a1 일반·토지 20년/건물 8년·총액 실가 | 산출 **133,780,000** (총 147,158,000) · 토지/건물 취득가 350M/350M · 비율 0.5 | **129,860,000** (총 142,846,000) · 280M/420M · 비율 0.4 · 과표 389,500,000 | 차이 −3,920,000 = 70M × (30%−16%) × 40% |
| a2 환산 ⓐ 취득시만 | **220,433,040** · 토지/건물 환산취득가 205,714,285/205,714,285 · 양도차익 774,171,430 | **217,929,168** · 164,571,428/246,857,142 · 양도차익 774,171,430 | 토지 환산취득가 −41,142,857(새 오류) |
| a2 환산 ⓑ 양도시 분모도 | 같음 | **184,060,368** (총 202,466,404) · 205,714,285/308,571,428 · 양도차익 671,314,287 | 계획서 §3 값 |
| a3 소유자 분리 건물만 / 토지만 (Route) | 97,380,000 / 21,905,000 | **74,870,000 / 42,950,000** | UI 도달 경로 |
| a3 둘 다 소유·같은 취득일 | 141,060,000 | 141,060,000 | 회귀선 C-1 |
| b1 별개 + 나목 생략 + 환산 + 배율 초과 | 45,128,160 | **차단**(엔진 throw / ⑫ 400) | D-2. 계획서 §3의 −5,126,613은 「비례값을 입력했을 때」의 값이지 이 경로의 사후 값이 아니다 |
| A3 감정 양쪽 + 환산 + 양도시 기준시가 없음 | 200: 141,615,200(별개) / 199,849,680(비-별개) | **400** `landStandardPriceAtTransfer`·`buildingStandardPriceAtTransfer` | audit의 「대체로 미도달」 정정 |

**반영·정정 사항**
- 계획서 §3의 a2 `−36,372,672`는 ⓑ의 값이다. ⓐ는 −2,503,872이고 양도차익 총액이 그대로다(§0 D-1).
- b1은 후퇴 경로 차단으로 바뀐다(값 변경이 아니라 400). 파트 독립(나목 입력) 경로의 b1은 C-2가 같은 구조를 고정한다.
- 특성화 anchor(26건)는 나목 없는 입력으로 현행 뺄셈을 고정하므로 S3-1에서 **교체 대상**이다(MUT_C 12건 실패 — §6 C). 본 anchor의 (A)(R)이 같은 값을 나목 입력 형태로 이어받는다.

## §6 깨질 기존 테스트 분류

**방법(실측, 소스 무수정)** — vitest resolve 플러그인으로 `transfer-tax-split-acq-price.ts`만 바꿔 끼우는 변형 2종(하네스 `/private/tmp/claude-501/-Users-mynote-workspace-Property-related-Taxes/4469ebcb-4585-444f-b128-92140436196b/scratchpad/mut/` — `MUT=C|D npx vitest run --config …/vitest.mutC.config.ts`). node 프로젝트(`.test.ts`) 24,328건, 베이스라인 실패 0.
- **MUT_C(엄격)** = 이 설계의 엔진 동작: housing 비-별개는 나목이 있으면 비례 쌍 / 없으면 쌍 없음, 별개 + 나목 생략 레거시 제거, A3 fallback 제거(환산 파트 + 양도시 파트 기준시가 없으면 throw). → **61건 / 14파일** 실패.
- **MUT_D(보충)** = 같은 변형인데 나목이 없으면 `N := max(H − L, 0)`을 채운다(= 입력 보충 시나리오. `L+N = H`이면 비례 = 뺄셈이라 값 불변). → **2건 / 1파일**만 실패.
- ⇒ **59건/13파일은 「나목 입력 보충」만으로 해소**(값 불변), **2건/1파일만 기대값 갱신**. (MUT_A의 40건/18파일과 합이 다른 이유: MUT_A는 `building`(일반건물)에도 걸렸으나 이 설계는 housing 한정이다. 두 변형은 엔진 설계가 달라 직접 비교하지 않는다.)

| 분류 | 파일 (실패 건수 — MUT_C) | 조치 |
|---|---|---|
| **A. 입력 보충만** (값 불변: 비-별개 입력에 `buildingStandardPriceAtAcquisition = H − L` 추가, 소유자 분리는 이미 한 파트) | `calc/split-housing-separate-acq-part-std.test.ts`(1 — 제목 「…결합 총액에서 역산한다」는 의미 갱신 필요) · `tax-engine/transfer-tax/acq-cost-swap-split.test.ts`(4) · `…/fractional-lump-sum-deduction.predo.anchor.test.ts`(1) · `…/fractional-lump-sum-display-echo.test.ts`(4) · `…/fractional-lump-sum-per-part.test.ts`(5) · `…/land-building-split.test.ts`(5) · `…/sale-apportion-no-acq-ratio-fallback.test.ts`(5) · `…/split-acq-axis-predo.anchor.test.ts`(3) · `…/split-acq-per-part-completion.test.ts`(6) · `…/split-acq-std-gate-case-a.test.ts`(1) · `…/split-gain-residual-symmetry.anchor.test.ts`(13) · `…/split-gain-salescase.anchor.test.ts`(7) · `…/unregistered-lump-deduction-rate.test.ts`(4) | **N = H − L**을 fixture에 추가하면 비례 쌍 = {L, H−L}로 종전과 같다(`H = L + N` 항등 — anchor (0)). 의미를 바꾸지 않으므로 기대값·세액 불변. 단 **주제가 「뺄셈 값」인 케이스**는 N을 현실적 값으로 두고 기대값을 비례 산식으로 재도출한다(아래) |
| **B. 기대값 갱신** | `…/split-acq-std-price-independent.test.ts`(2) | ① 「건물분 명시 입력이 있어도 역산을 유지한다」 — 비-별개 + 나목 입력 시 현행은 입력을 **무시**하는 것을 단언(실측 318,181,819 vs 300,000,000). 비례 사용으로 **반전**: 기대값 = `floor(H×L÷(L+N))` 기준 새 값으로, 제목·주석 「역산 유지」 삭제. ② **H10 「개산공제 합계 = 라목 총액 × 3% 항등성」** — 비례 쌍에서 **파트별 독립 floor 합이 라목 가액×3%와 1원 어긋난다**(실측 `14,999,999 vs 15,000,000`, 라목 5억). 독립 floor가 정본이다(`split-gain.ts:205-224` 「잔액 흡수 금지」 — Excel anchor 14건 이력, PHD 동일) → 항등 단언을 「±1원」으로 완화하고 사유를 기재(§163⑥은 1호·2호가목이 별개 호) |
| **C. 특성화 anchor** `tax-engine/transfer/housing-std-split-proportional.s3-characterization.anchor.test.ts`(26건) | MUT_C에서 **12건 실패**, MUT_D에서 2건(`calcAcqStdPair` 레거시 뺄셈 단언 · 「뺄셈 경로로 같은 입력」 d′의 건물분 0 clamp) | 나목 없는 입력으로 현행 뺄셈을 고정한 파일이므로 **S3-1에서 교체 대상** — 본 anchor의 (A)(R)이 같은 값을 나목 입력 형태로 이어받는다. PHD·양도가액 안분·겸용(c) 케이스는 변동 없음 |
| **D. 미측정** | DOM 프로젝트(`.test.tsx`) · E2E | `calcDerivedBuildingStdAtAcq|calcAcqStdPair|stdPriceDerivedFromTotal|buildingDerived|calcApportionRatio`를 직접 언급하는 파일(grep): `__tests__/calc/{split-building-acq-std-payload,transfer-split-acq-stdprice-gate,transfer-tax-validate-split}.test.ts` · `__tests__/components/{split-housing-acq-std-input,filing-form-self-owns-split,split-part-std-card-gating,split-acq-std-asset-block-hidden}.test.tsx` · `__tests__/tax-engine/transfer-tax/{split-acq-std-part-gating,basic-info-building-area.anchor,burdened-gift-stale-acq-method.anchor}.test.ts` · `e2e/{transfer-self-owns-filing-form,split-mode-gating}.spec.ts` — 대부분 주석 언급일 가능성이 있으나 **실행으로 확인 필요**. UI 설계서 §7.2·§7.3이 ⑧·⑤ 쪽 영향 목록을 따로 갖는다 |

**새 기대값의 근거 표기 방침**
1. 비례 값은 **손계산식을 테스트 주석에 적는다**: `토지분 = floor(H × L ÷ (L + N))`, `건물분 = H − 토지분` + 숫자 대입(본 anchor (0)과 같은 형태).
2. 기대값은 **독립 재구현**(BigInt 정수 나눗셈, anchor `bigProp`)으로 산출해 엔진 함수와 1원 일치를 확인한 뒤 고정한다(엔진 출력을 그대로 복사 금지).
3. 값 보존을 위한 입력 보충(분류 A)은 주석에 「N = H − L → 비례 = 종전 뺄셈과 동일(H = L + N)」을 명시하고, **그 테스트가 비례를 검증하는 것이 아님**을 밝힌다. 비례를 검증하는 케이스는 본 anchor(B)·(R)이 맡는다.
4. 소유자 분리가 아닌 비-별개 fixture에 N을 넣으면(분류 A 대부분이 해당) 본 설계의 쌍 규칙(N이 있으면 소유자 분리 여부와 무관하게 비례)을 따른다 — N을 넣지 않은 채 두면 분할 포기(null)로 `splitDetail`이 사라진다(실패 메시지 `expected null not to be null`).

## §7 불변 경로

engine-audit §6 「바꾸지 말 곳」 전부 + 아래.

- 별개 취득 + 나목 **입력** 경로(UI 정상 경로): `calcAcqStdPair`의 `isSeparateAcquisition===true && buildingStd!=null` 분기 — 파트 독립, 결합가 미참조. anchor C-2.
- PHD §164⑦(`pre-housing-disclosure.ts:130-146`) — 이미 비례, Excel 정본 anchor. anchor C-3(세액 26,100,130).
- 양도가액 안분(`resolveTransferPriceSplit`) — 이미 비례, 함수만 공용화(산출 동일). anchor C-4.
- 일반건물(`propertyType==="building"`) 비-별개 레거시 뺄셈 — 이번 범위 밖(일반건물은 가목·나목이 각각 공시라 총액이 사용자 합계). 도달성은 **확인 필요**(§9).
- §163⑥2호가목 개산공제(라목 가액 × 3%)·12억 안분·겸용 주택:상가 안분·공익수용 총액 트랙·재개발·부담부증여 — 결합가를 그대로 쓰는 곳.
- 겸용(S3-2), `MixedUseStandardPrice` 타입 — 무변경.
- 법령 manifest: 새 조문 인용 **없음**. 기존 소령 §163·§164·§166 항목(`additions-transfer-decree.ts:273·283·313`)과 소득세법 §99 인용만 재사용. 새 상수를 `legal-codes/`에 추가하면 그때 `additions-transfer*.ts` 등록(`__tests__/lib/legal-verification-coverage-complete.test.ts` 게이트). 오류 메시지는 법령 상수(`TRANSFER.*`)를 쓰고 리터럴 금지(루트 CLAUDE.md).

## §8 UI 시니어가 알아야 할 것 (UI 설계 `…s3-1.ui.design.md` §9 E-1~E-8 판정 반영)

UI 시니어 설계서를 읽고 **엔진 초안의 오류 3건을 정정**했다 — ① `selfOwns≠both`를 술어에서 빠뜨림(E-4, §3.2) ② UI 입구 서술(§8-1) ③ N 카드 호스트 위치(§8-3). 아래가 확정이다.

1. **UI 입구** — UI 실측 수용: 비-별개 분할의 화면 입구는 **소유자 분리**(매매 `CompanionAcqStdPriceSection`, 비-매매 `NonPurchaseSplitInputsBlock`) + 희소(신축 + 토지 상속·증여 같은 날, 소유자 분리 동반 시). **정정**: 초안의 「a1(취득일 다름 + 비-별개)은 UI에서 만들 수 없다」는 부정확하다 — 「취득일 다름」ON + 같은 날짜는 **만들 수 있으나** 토지 단가 입력칸이 없어 분할이 실질 불가하다(UI §1.2 c). 엔진 쪽 근거도 같다: L 없음 → 쌍 null → `calcSplitGain` null(`:99`). a1 시나리오는 API 직접 입력/stale 단가 세션에서만 도달한다.
2. **N 카드는 소유자 분리에서만 열린다** — leaf = §3.2(`ownerSplitHousingNeedsBuildingStd`는 엔진 leaf의 AssetForm 어댑터). 엔진 throw·⑫·⑧·④·⑤가 같은 게이트다. 소유자 분리가 아닌 상태의 stale 단가는 N 없이도 막히지 않는다(분할 포기).
3. **호스트 위치 정정** — 초안은 `LandBuildingSplitSection`의 `stdCardBase` 확장을 말했으나 비-별개에서는 그 섹션에 토지 단가 칸이 없다. **UI 안 채택: N은 토지 단가 바로 아래**(`CompanionAcqStdPriceSection.tsx:176-190` 직후, `NonPurchaseSplitInputsBlock.tsx` 호박색 박스 안). `stdCardBase`는 확장하지 않는다(별개 전용 단언 다수 보호).
4. **문구·주석** — UI §3의 T1~T7·C1~C6 채택. 엔진 영역 C6(`split-acq-mode.ts:259-262`·`split-acq-price.ts:27-28`)은 엔진 Do에서 함께 정정.
5. **결과 echo `stdSplit`**(E-2) — 신설(§4). UI는 `stdSplit` 유무로 분기하고 `stdPriceDerivedFromTotal`의 의미에 의존하지 않는다. 구 `resultData`(뺄셈)는 `stdSplit`이 없어 구 문구 유지가 사실이다.
6. **④ 전송** — UI 안 채택(노출 leaf와 같은 조건에서만 N 전송). 비-별개에서도 `standardPriceAtAcquisition`(H)은 보낸다(비례의 입력). 별개는 종전대로 `undefined` 덮어쓰기.
7. **양도시 분모(D-1)** — ⓑ 채택 시 UI §2.9가 §2로 승격된다: 축 A 카드(`TransferStdPriceCard`)에 **양도시 개별주택가격 H_T 칸**, ⑧ V7·⑫·④ `standardPriceAtTransfer` 전송 개방이 함께 필요하다(§9 D-1).
8. **E2E** — UI §7 채택. 엔진 쪽 추가: `e2e/transfer-self-owns-filing-form.spec.ts`는 `assetKind: "building"` 소유자 분리라 **엔진 leaf가 housing 한정이므로 무영향**(E-3 판정 유지 시).

## §9 미결·확인 필요

### 9.1 오케스트레이터 결정 필요 (D-n)

- **D-1 양도시 환산 분모를 H_T 척도로 비례화할지.** 선택지·실측:

  | | ⓐ 취득시만 비례(분모 원값) | **ⓑ 취득시 + 양도시 분모 비례(권고)** | ⓒ 분자·분모 모두 원값(입력 신설 없음) |
  |---|---|---|---|
  | a2 토지 환산취득가 | **164,571,428**(현행 205,714,285 → −41,142,857, 새 오류) | 205,714,285 | 205,714,285(산술) |
  | a2 건물 환산취득가 | 246,857,142 | 308,571,428 | 308,571,428(산술) |
  | a2 양도차익 총액 | 774,171,430(현행과 같음) | 671,314,287 | 671,314,287(산술) |
  | a2 산출세액 | 217,929,168 | **184,060,368**(계획서 §3) | 개산공제 base가 비례면 ⓑ와 같음(확인 필요) |
  | 법적 근거 | N12는 분모도 안분을 말함 → 불일치 | N12·PHD 정본 `pre-housing-disclosure.ts:130-146`과 동치 | **근거 미확보**(양시점 괴리가 다르면 ⓑ와 달라짐) |
  | 신규 입력 | 없음 | **H_T** (`standardPriceAtTransfer`) | 없음 |

  ⇒ **ⓐ는 단독 출시할 수 없다**(토지 파트가 현행에서 일관(원값/원값)인데 ⓐ가 비례/원값으로 깨뜨린다 — anchor R-5·R-2). 환산 파트가 없는 경로(실가 안분·감정·매매사례 — 분모가 없다)는 취득시 비례만으로 일관되지만, 환산 파트가 있는 경로는 ⓑ가 필요하다. **ⓑ 구현 지점**: A3 자리(`split-acq-price.ts:296-299`)에서 비-별개 housing의 분모를 `apportionByStdPrice(H_T, L_T, N_T)`로 바꾸고(같은 leaf 재사용) H_T 없으면 throw. **H_T 입력 경로 비용**: ④ `standardPriceAtTransfer`는 자산 환산 플래그 `isEstimated`일 때만 전송(`transfer-tax-api.ts:376-388`, 다건 `multi-transfer-tax-api.ts:244`) → 파트 환산만인 split에서 게이트 확장 필요 · ⑫ `refines.ts:157-168`은 `useEstimatedAcquisition` 의존 → 파트 환산용 요구 추가 · ⑧ V7 근처 H_T 요구 · ⑤ UI §2.9. 오케스트레이터 판정이 ⓑ 포함이면 **S3-1 범위 확장**, 분리라면 S3-1(환산 제외 불가) 구성이 어려워 사실상 **S3-1 전체를 ⓑ와 함께 한 PR**로 가는 것이 일관적이다.
- **D-2 별개 취득 + 나목 생략 후퇴 차단**을 S3-1에 포함할지 — 권고: 포함(같은 leaf 삭제의 필연, Q-3). UI 영향 0, API 직접 호출만 400.
- **D-3 안분 비율 정의** — 쌍 도출(land′÷H, 무변경) vs 원값(L÷(L+N)): 이 설계는 쌍 도출. 무작위 200만건에서 56%가 취득가액 안분에서 ≥1원 차이.
- **D-4 PHD 모듈의 `Math.floor(P*land/sum)` 통일** — 이번에는 건드리지 않음(Excel 정본 보호, 200만건 실측 차이 0이나 보장 아님). 후속 후보.
- **D-5 ⑧ V8의 L·H·총액 3종 조건을 UI 어댑터로 통일할지(UI E-5 「V8 전체를 leaf로 교체」 제안)** — 엔진 판정: **S3-1에서는 N만 새 leaf/어댑터로 요구하고 V8 기존 3종은 현행 유지**(Surgical — 3종 교체는 PHD 양쪽 환산 + 소유자 분리의 기존 과잉 요구를 바꾸므로 anchor 영향이 커진다). 두 조건이 갈리는 구간(PHD 양쪽 환산 ∧ 소유자 분리)은 N이 안 열리고 3종은 V8이 요구하는 **과잉 요구이지 막다른 길은 아니다**(칸은 열려 있다). 후속 별건.

### 9.2 UI 시니어 질의 E-1~E-8 판정

| # | 판정 |
|---|---|
| **E-1** | D-1 참조. ⓐ 단독 불가(실측), ⓑ 권고, 입력 비용 명시. |
| **E-2** | **필요.** `splitDetail.stdSplit {housingTotal, landStd, buildingStd, landBasis, buildingBasis}` 신설(§4). 건물분 규약 = **잔액 흡수 `H − land′`**(§2). 산식: 토지분 = 개별주택가격 × 토지 기준시가 ÷ (토지 기준시가 + 건물 기준시가) — UI가 이 4값을 그대로 풀어쓴다(재계산 금지). 별개·일반건물·구 resultData는 `stdSplit` 없음. |
| **E-3** | **building 불변.** 엔진 leaf는 `propertyType==="housing"` 한정, `building` 비-별개는 레거시 뺄셈 유지(anchor C-5). **엔진 측 확인(실측)**: H == L(단가×면적)이면 `calcAcqStdPair`는 건물분 0·토지 비율 1.0을 낸다(`{land:240M, building:0, buildingDerived:true}` / ratio `{1, 0}`). UI 입력이 실제로 H=L을 만드는지는 **확인 필요**(UI 소관) — 맞다면 기존 일반건물 소유자 분리 결함이며 S3-1 범위 밖. |
| **E-4** | **수용 — 엔진 초안 오류.** 술어에 `selfOwns≠both` 포함(§3.2·§3.3). 소유자 분리가 아닌 비-별개는 N 없이 null(분할 포기, 종전 규약). stale 단가 세션의 결과가 달라지는 점은 §9.3 ⑤. |
| **E-5** | **N 요구에는 PHD 양쪽 환산 제외**(UI 어댑터 6항). 엔진은 `calcSplitGain:67-69` early-return + `usesPhd`면 H 미전송(`transfer-tax-api.ts:350-351`)으로 이미 제외. V8 3종 교체는 D-5(후속). |
| **E-6** | **N은 100% 기준 속성값 — 지분 스케일 안 한다.** ④ `transfer-tax-api-split.ts:147`은 `parseAmount` 그대로(`ratioed` 미적용 — L·H와 같음). 개산공제 지분은 엔진이 base에 적용(`computeEstimatedDeduction(…, ownRatio)` `split-gain.ts:214-224`)하며 쌍 합 = H 보존이라 불변. |
| **E-7** | **확인 필요(범위 밖 표기).** 일부양도에서 L은 양도분 면적(`resolveAcqAreaForStdPrice`), H는 위젯이 양도분 면적 기준으로 파생(`CompanionAcqStdPriceSection.tsx:136-160` 주석), N의 모달 prefill `floorArea`는 건물 연면적 전체 → 양도분 몫과 불일치 가능. S3-1은 일부양도 거동을 바꾸지 않는다(같은 leaf를 같은 입력으로 통과) — 일부양도 + 소유자 분리 주택의 N 의미는 별건 확인. |
| **E-8** | (i) 엔진 leaf `(g:{isHousing,isSeparate,isOwnerSplit}, flags, ctx)` + UI 어댑터 — **채택**. (ii) ④ 전송 = 노출 leaf와 같은 조건 — **채택**(엔진안의 넓은 게이트 철회). (iii) 호스트 위치 — **UI 안 채택**(N을 토지 단가 아래, `stdCardBase` 미확장). (iv) a1 서술 **정정**(§8-1). (v) H_T 전송 게이트 — D-1 ⓑ 선택 시 필요. |
| 필드 | **일치**: 폼 `buildingStandardPriceAtAcq`·엔진 `buildingStandardPriceAtAcquisition` 재사용, ①②③⑨⑩⑫정의⑬⑭ 무변경. |

### 9.3 확인 필요

① `refines.ts:156-157` `hasIndependentAcqStd` 면제(`!!N`이면 H 면제)가 비-별개 housing에 닿는지 — 비례의 분자 H가 필수여야 하므로 면제 조건에 `isSeparateAcquisition` 추가 필요 가능 ② 일반건물 `building` 비-별개 레거시의 H 의미(E-3) ③ 상속·증여 취득 비-별개의 취득시 결합가 출처(`inheritance-acquisition-helpers.ts:215-221` — audit 인용, 본인 미열람)와 N의 시점(상속개시일) ④ 컴패니언은 SP refine 부재(§4) ⑤ **stale 토지 단가 + 소유자 분리 OFF 세션**: 종전 뺄셈 분할 → S3-1 후 분할 포기(단일 자산 경로) — 사용자 영향(세액 변화) 확인 ⑥ DOM 프로젝트(`.test.tsx`)·E2E 영향 미측정(UI §7) ⑦ 일부양도 + 소유자 분리 주택의 N 의미(E-7) ⑧ 공동주택(아파트) 취득시 N의 국세청 산정(집합건물 전유부분 — UI Q-U5와 공통) ⑨ 1985.1.1. 이전 의제취득 N(UI Q-U3).
