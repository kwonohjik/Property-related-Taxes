# 별개취득 축 B — 파트별 기준시가 카드 노출 게이트 정정 계획서

> 대상: 양도소득세 · 토지·건물 별개취득(취득시기 상이) 자산 카드
> 작성: 2026-07-29
> 선행: `transfer-split-acq-std-gate-relaxation.plan.md`(술어 `requiresAcqStdPrice` 도입) ·
> `transfer-split-input-flow-reorder.plan.md`(축 A/축 B 분리·재배치)

---

## 1. 사용자 보고

> 토지·건물 취득가액이 **실가 모드**이면 실가 모드에 필요한 취득가액·자본적지출만 보이면 되는데,
> 환산취득가액에 필요한 요소들까지 동시에 보인다.
> 반대로 **환산취득가 모드**에서는 환산 산정에 필요한 모든 요소가 제대로 노출되지 않는다 —
> 양도가액을 구분(직접입력)으로 두고 취득가액을 환산으로 고르면 **취득시·양도시 기준시가를 함께**
> 계산할 수 있는 UI가 나와야 하는데 지금은 취득시 기준시가만 보인다.
> 필요 없는 UI 노출은 혼란이고, 꼭 필요한 UI를 표시 못하는 것은 심각한 버그다.

첨부 화면: 주택 · 별개취득(토지 2025-01-08 / 건물 2025-08-29) · **일괄양도** · 토지·건물 **모두 실거래가**.
그 상태에서 「토지 취득시 기준시가 (§99①1호 가목)」 카드(㎡당 공시지가·토지 면적·토지기준시가)가 노출됨.

---

## 2. 실측 (RTL probe, 2026-07-29 · 검증 후 폐기)

`CompanionAcqPurchaseBlock`을 별개취득 상태로 렌더해 카드 노출 개수를 셌다.

| probe | 자산·양도모드 | 토지/건물 취득모드 | 파트 토지카드 | 파트 건물카드 | 자산전체 취득시블록 | 양도시 기준시가 카드 | 주택 역산노트 |
|---|---|---|---|---|---|---|---|
| P1 (첨부화면 재현) | 주택 · 일괄 | 실가 / 실가 | **1** 🔴 | 0 | **0** | 1 | **1** 🔴 |
| P2 | 주택 · 구분 | 환산 / 실가 | 1 | 0 | 1 | 1 | 1 |
| P3 | 주택 · 구분 | 환산 / 환산 | 1 | 0 | 1 | 1 | 1 |
| P4 | 일반건물 · 구분 | 실가 / 실가 | **1** 🔴 | **1** 🔴 | 0 | 0 | 0 |
| P6 | 일반건물 · 구분 | 환산 / 환산 | 1 | 1 | 1 | 1 | 0 |

P6 라벨 덤프 — 면적 입력이 **같은 폼 필드(`acquisitionArea`)로 2회** 렌더:
`["토지 면적 (양도 당시)"(축 A), "면적 (㎡)"(자산전체 블록), "토지 면적"(파트 카드)]`

P7 라벨 덤프 — 주택·양쪽 환산 시 **화면 세로 순서**:

```
① 토지·건물 취득일 다름 (토글)
② 토지 취득일 | 건물 취득일
③ 구분양도 / 일괄양도                       ← 축 A
④ 토지 양도가액 | 건물 양도가액
⑤ 공시지가 연도·양도시 토지 공시지가·토지기준시가·토지 면적(양도 당시)·양도시 건물 기준시가
                                            ← 양도시 기준시가 카드 (환산 분모)
⑥ 토지·건물 소유자 다름 (토글)
⑦ 취득 당시 개별주택가격 미공시 토글
⑧ 취득시 기준시가 (원)* · 공시가격(원)      ← 자산 전체(결합 총액) 블록
⑨ [실거래가|환산취득가|감정가액|매매사례가액] ← 축 B 토지 취득방식 라디오 ★사용자가 환산을 고르는 지점
⑩ 공시지가 연도·취득시 토지 공시지가·토지기준시가·토지 면적  ← 파트 토지 취득시 카드
⑪ [실거래가|환산취득가|…]                   ← 축 B 건물 취득방식 라디오
⑫ 토지 자본적지출 | 건물 자본적지출
```

P5 — DOM 순서 단언: **양도시 기준시가 카드(⑤)가 축 B 라디오(⑨)보다 앞**. `true`.

---

## 3. 결함

> 번호는 발견 순서이고 **배치는 심각도 순**이다(D6은 D5보다 심각해 앞에 온다).
> 처리 순서는 §6 Phase 참조. D1~D4는 사용자 보고분, D5·D6은 검토에서 추가 발견분이다.

### D1 (Critical) 실가 모드에서 환산·개산공제 전용 입력이 노출된다

`components/calc/transfer/LandBuildingSplitSection.tsx:253-258`

```ts
const showLandStdPrice =
  !!props.isSeparateAcq &&
  (props.asset?.assetKind === "building" || isHousingAsset) &&
  !!props.asset && !!props.onAssetChange;
const showBuildingStdPrice = showLandStdPrice && !isHousingAsset;
```

게이트에 **파트 취득 모드가 들어 있지 않다**. 취득시 기준시가는 취득가액을 환산해야 할 때(환산)
또는 개산공제 base가 필요할 때(감정·매매사례)만 쓰이므로, 양쪽이 실지거래가액이면
`calcSplitGain` 어디에도 등장하지 않는다.

같은 정보를 받는 **자산 전체 블록**은 이미 술어로 게이팅되어 있다 —
`CompanionAcqPurchaseBlock.tsx:146-163`에서 `requiresAcqStdPrice(...)`를 계산해 `:554`에서 사용.
→ 지금은 **같은 값의 노출/숨김이 서로 모순**이다(P1: 자산전체 0 · 파트 1).

> ⚠️ 이 게이트만 단독으로 넣으면 **입력 칸 없는 차단(dead-end)**·**면적 입력 경로 소멸**이 신규
> 발생한다 — §6 **Phase 1-a (1)(2)(3)를 반드시 같은 PR에 포함**한다.

### D2 (High) 존재하지 않는 칸을 가리키는 안내 (dangling reference)

`LandBuildingSplitSection.tsx:126-132`

> 건물분 취득시 기준시가는 위 **취득시 기준시가(개별·공동주택가격)**에서 이 토지분을 뺀 값으로 자동 도출됩니다

P1 실측: 이 노트는 렌더되는데(1건) 그 "위 취득시 기준시가" 블록은 **0건**. 사용자가 화면에 없는
칸을 찾게 된다. D1과 같은 술어로 묶으면 자동 해소된다.

### D3 (High) 환산 안내 문구가 반대 방향을 가리킨다

`LandBuildingSplitSection.tsx:230-234`

```
{label} 환산취득가 = {label} 양도가액 × (취득시/양도시 기준시가) — 아래 양도시 기준시가 입력 필요.
```

실측(P5·P7): 양도시 기준시가 카드는 **위**(⑤)에 있다. 2026-07-29 축 A를
`LandBuildingSaleSplitSection`으로 분리해 **앞으로** 옮길 때 이 문구가 따라가지 않은 드리프트다.
사용자가 "환산을 골랐는데 양도시 기준시가가 안 나온다"고 읽은 직접 원인으로 보인다.

### D4 (Medium) 환산 선택 지점과 필요한 입력이 화면 세 곳에 흩어져 있다

환산을 고르는 지점은 ⑨인데, 필요한 값은 ⑤(양도시 토지·건물 기준시가) · ⑧(주택 결합 총액) ·
⑩(취득시 토지분)에 분산. `LandBuildingSaleSplitSection.tsx:179-182` 주석이 이미 자인한다:

> ⚠️ 「구분양도 + 파트 환산」 조합에서는 아래 축 B에서 환산을 고르는 순간 이 블록이 뒤늦게 나타난다.
> … 해소하려면 같은 필드를 축 A·B 양쪽에 두는 이원 배치가 되어 dual-truth 위험.

**미입력 시 결과**: `transfer-tax-split-gain.ts:254-259` — 환산 분모가 0이면 환산취득가가 **0**이 되어
양도차익이 양도가액 전액이 된다. 다만 `transfer-tax-validate-split.ts:157-165`가 계산 전에 차단하므로
**오답이 아니라 "어디를 채워야 하는지 모르는 오류 메시지"**로 나타난다.

### D6 (High) `selfOwns = building_only` + 주택 — 역산 소스 입력 경로 부재 (선재 결함)

파트 토지 카드가 `{landOwned && …}` 블록 **안에 중첩**되어(`LandBuildingSplitSection.tsx:259·276-313`)
`selfOwns === "building_only"`이면 렌더되지 않는다. 그런데 주택(라목) 건물분 취득시 기준시가는
`결합 총액 − 토지분` 역산이라 **토지분이 반드시 필요**하다.

**probe 실측 (2026-07-29, 검증 후 폐기)** — 별개취득 + 양쪽 환산:

| 케이스 | 파트 토지카드 | 파트 건물카드 | 자산 전체 블록의 입력 칸 | 판정 |
|---|---|---|---|---|
| 주택 · `building_only` | **0** | 0 | `취득시 기준시가(원)*` + **`공시가격 (원)`(총액만)** | 🔴 **dead-end** — ㎡당·면적 칸이 앱 어디에도 없음 |
| 일반건물 · `building_only` | **0** | 1 | `취득시 기준시가(원)*` + **`면적 (㎡)`**(area 모드) | 🟡 우회 가능(현행) · **Phase 3 이후 소멸** |
| 주택 · `both`(대조군) | 1 | 0 | 총액 | ✅ |
| 주택 · `land_only` | 1 | 0 | 총액 | ✅ |

엔진 실측: 해당 입력으로 `calcSplitGain` 호출 시
**`TaxCalculationError` throw** — "환산·감정·매매사례 취득가액 계산에는 취득시 ㎡당 개별공시지가와
토지 면적이 필요합니다 (소득세법 §99①1호 가목)". 즉 사용자는 **입력할 칸이 없는 오류**에 갇힌다.

> **Phase 3와의 연결(중요)**: 일반건물이 지금 우회 가능한 이유는 자산 전체 블록이 area 모드라
> ㎡당·면적 칸을 주기 때문이다. **Phase 3에서 그 블록을 읽기 전용으로 바꾸면 일반건물도 dead-end가
> 된다** → D6 해소는 **Phase 3의 전제조건**이다.

원인은 **"소유 여부 ≠ 계산 입력 필요 여부"** 를 게이트가 구분하지 않는 것이다. 엔진도 같은 비대칭을
이미 인정한다 — 취득가액 미입력은 비소유 파트에 한해 허용하면서(`transfer-tax-split-gain.ts:298`
`selfOwns !== "building_only"`) **기준시가는 소유와 무관하게 요구**한다(`:46-48`).

### D5 (Medium) 일반건물 별개취득 — 취득시 면적·단가 중복 입력

`toPropertyKind`(`CompanionAcqPurchaseBlock.types.ts:132-138`)가 `building → building_non_residential`
→ `StandardPriceInput`이 area 모드(㎡당 단가 + 면적 + 총액)로 렌더된다. 파트 토지 카드도 같은 필드
(`standardPricePerSqmAtAcq`·`acquisitionArea`)를 입력받는다 → P6에서 면적 칸 2개.

같은 폼 필드라 값 불일치(dual-truth)는 없지만, 별개취득 + 건물분 명시 입력 시 엔진
(`transfer-tax-split-gain.ts:52-56`)은 결합 총액 `standardPriceAtAcquisition`을 **아예 참조하지 않는다**
→ 사용자가 쓰이지도 않는 총액 칸을 채우게 된다.

---

## 4. 법령·엔진 근거 — 무엇이 언제 필요한가

| 값 | 필요 조건 | 근거 |
|---|---|---|
| 취득시 기준시가 (토지분 = ㎡당 개별공시지가 × 면적) | 파트가 환산(분자) · 감정/매매사례(개산공제 base §163⑥) · 안분 비율 필요 시 | 소득세법 §99①1호 가목 · 소득령 §163⑥ · §166⑥ |
| 취득시 기준시가 (건물분) | 일반건물(나목) 별개취득에서 파트 독립 산정. 주택(라목)은 결합 공시라 `총액 − 토지분` 역산 | §99①1호 나목·라목 · §163⑥2호가목 |
| 양도시 기준시가 (토지·건물) | 일괄양도 안분 **또는** 어느 파트든 환산(분모) | §166⑥ → 부가가치세법 시행령 §64①1호 |

취득시 기준시가 필요 여부의 정본 술어는 이미 존재한다 —
`lib/calc/transfer-tax-split-acq-mode.ts:175-193` `requiresAcqStdPrice(flags, ctx)`.
엔진(`transfer-tax-split-gain.ts:356`)·validate(`transfer-tax-validate-split.ts:150`)·
UI 자산전체 블록(`CompanionAcqPurchaseBlock.tsx:146`)이 **모두 이 함수 하나를 공유**한다.
**파트 카드만 이 단일 소스에서 빠져 있다** — 이번 수정의 핵심.

---

## 5. 케이스 매트릭스 (수정 후 기대)

`acqStdReq` = `requiresAcqStdPrice(...)`. 양도시 카드 = `saleSplitMode==="apportioned" || 어느 파트든 환산`.

| # | 자산 | 양도모드 | 토지/건물 취득모드 | acqStdReq | 파트 토지카드 | 파트 건물카드 | 양도시 카드 | 현행 |
|---|---|---|---|---|---|---|---|---|
| 1 | 주택 | 구분(가액 입력) | 실가 / 실가 | false | **숨김** | N/A | 숨김 | 토지카드 오노출 🔴 |
| 2 | 주택 | 일괄 + 양도시 기준시가 2필드 有 | 실가 / 실가 | false | **숨김** | N/A | 표시 | 토지카드 오노출 🔴 (=첨부화면) |
| 3 | 주택 | 일괄 + 양도시 기준시가 미입력 | 실가 / 실가 | **true**(⑤절) | 표시 | N/A | 표시 | 일치 ✅ |
| 4 | 주택 | 구분 | 환산 / 실가 | true | 표시 | N/A | 표시 | 일치 ✅ (문구 D3) |
| 5 | 주택 | 구분 | 실가 / 환산 | true | 표시(역산 소스) | N/A | 표시 | 일치 ✅ |
| 6 | 주택 | 임의 | 환산 / 환산 | true | 표시 | N/A | 표시 | 일치 ✅ |
| 7 | 주택 | 임의 | 감정·매매사례 포함 | true | 표시(개산공제 base) | N/A | 모드 따름 | 일치 ✅ |
| 8 | 일반건물 | 구분 | 실가 / 실가 | false | **숨김** | **숨김** | 숨김 | 둘 다 오노출 🔴 |
| 9 | 일반건물 | 구분 | 환산 / 실가 | true | 표시 | 표시(V3 all-or-nothing) | 표시 | 일치 ✅ |
| 10 | 일반건물 | 임의 | 환산 / 환산 | true | 표시 | 표시 | 표시 | 일치 ✅ (D5 중복) |
| 11 | **주택** | — | `selfOwns = building_only` + 건물 환산 | true | **렌더**(§6 Phase 1-c 신설) | N/A | 모드 따름 | 🔴 dead-end (D6) |
| 11a | **일반건물** | — | `selfOwns = building_only` + 건물 환산 | true | **렌더**(Phase 1-c) | 표시 | 모드 따름 | 🟡 자산전체 블록 우회(Phase 3 후 소멸) |
| 11b | 주택·건물 | — | `selfOwns = building_only` + **실가/실가** | false | 숨김 | 숨김 | 모드 따름 | 카드 오노출 🔴(D1) |
| 11c | 주택·건물 | — | `selfOwns = land_only` | 모드 따름 | 렌더 | **미렌더**(건물 gain 폐기) | 모드 따름 | 변경 없음 |
| 12 | — | — | 부담부증여 | — | 컴포넌트 early-return `null` | — | 안내 카드 | 변경 없음 |
| 13 | — | — | 비-별개취득(겸용·소유자분리) | — | 미노출(`isSeparateAcq=false`) | — | — | 변경 없음 |
| 14 | 주택 | 임의 | **PHD ON + 양쪽 환산** | true(①절) | 표시하나 **엔진 미사용** 🔴 | N/A | 표시 | §6 Phase 1-b |
| 14b | 주택 | 임의 | PHD ON + **한쪽만** 환산 | true | 표시(실제 사용) | N/A | 표시 | 일치 ✅ |
| 15 | 주택·건물 | 일괄(기본) | **파트 라디오 미선택("")** | true(⑤절) | 표시 | 모드 따름 | 표시 | 일치 ✅ |

**#14 (PHD 경로)**: `transfer-tax-split-gain.ts:341`이 `preHousingDisclosure && 양쪽 estimated`에서
`calcSplitGainPreDisclosure`로 **early-return** → `calcAcqStdPair` 미도달 → 파트 카드 입력이 엔진에
도달하지 않는다. 자산 전체 블록은 이미 "§164⑤ 3-시점 입력으로부터 자동 도출" 안내로 대체되어 있으나
(`CompanionAcqPurchaseBlock.tsx:541-546`) 파트 카드에는 대응 분기가 없다 — **D1과 동일 결함 클래스**.
게이트는 **`양쪽 estimated`로 한정**해야 한다(#14b는 early-return이 안 걸려 카드가 실제로 필요).

**#15 (초기 진입)**: 별개취득에서는 상단 레거시 라디오가 숨겨지므로(`CompanionAcqPurchaseBlock.tsx:295`)
사용자가 파트 라디오를 고르기 전까지 `landAcqMode === ""` → `effectivePartAcqMode` legacy 파생 → `actual`.
기본 진입 = 일괄양도 + actual/actual + 양도시 기준시가 미입력 → ⑤절 true → 카드 노출.
**E2E U10이 통과하는 근거가 이 행**이다(§7 판정이 추론이 아니라 매트릭스 참조가 된다).

**케이스 8·9 비대칭 주의**: 일반건물에서 토지만 환산이어도 건물분 카드를 남긴다.
`validateSplitDirectInputs` V3(`transfer-tax-validate-split.ts:102-106`)가 "건물분을 입력하면 토지분도
입력"의 all-or-nothing을 강제하고, 건물분을 비우면 엔진이 결합 총액 역산(한시 후퇴,
`transfer-tax-split-gain.ts:58`)으로 떨어지기 때문. 파트별로 게이트를 쪼개면 이 경로가 끊긴다.
→ **게이트는 자산 단위 단일 술어**로 둔다.

---

## 6. 수정 설계

### Phase 1 — 게이트 단일 소스화 (D1·D2 해소)

`LandBuildingSplitSection`에 prop 2개 추가(둘 다 **필수 prop**) —
`acqStdPriceRequired: boolean`(D1·D2) · `isPhdBothEstimated: boolean`(Phase 1-b, 매트릭스 #14).
둘 다 `CompanionAcqPurchaseBlock`이 이미 보유한 값에서 파생하며 **하위 컴포넌트에서 재파생하지 않는다**.
호출부는 프로덕션 1곳(`CompanionAcqPurchaseBlock.tsx:649`) + 테스트 1곳뿐이라 필수로 둬도 부담이 없고,
optional + 기본 `true`로 하면 "게이트 누락이 조용히 종전 동작"이 되어 같은 결함이 재발한다.

```ts
// CompanionAcqPurchaseBlock.tsx — 이미 :146에서 계산 중인 값을 그대로 내린다(재파생 금지).
<LandBuildingSplitSection … acqStdPriceRequired={acqStdPriceRequired} />

// LandBuildingSplitSection.tsx:253
const showLandStdPrice =
  !!props.isSeparateAcq &&
  props.acqStdPriceRequired &&            // ← 추가
  !props.isPhdBothEstimated &&            // ← 추가 (Phase 1-b, 매트릭스 #14)
  (props.asset?.assetKind === "building" || isHousingAsset) &&
  !!props.asset && !!props.onAssetChange;
```

- `:258 showBuildingStdPrice`는 `showLandStdPrice && !isHousingAsset` 파생이라 **추가 수정 불요**.
- D2는 `derivedBuildingNote`가 `showLandStdPrice` 내부에 있으므로 자동 해소.
- **값은 지우지 않는다** — 모드를 환산으로 되돌리면 입력값과 함께 복귀(자산 전체 블록 `:553` 규약과 동일).
  **사라짐 고지는 두지 않는다** — 자산 전체 블록도 같은 술어로 무고지 사라짐이 이미 표준이고
  (`CompanionAcqPurchaseBlock.tsx:554`), 한쪽만 고지하면 오히려 비대칭이다. (후속 리뷰 재론 방지 기록)

### Phase 1-a (필수 동반) — 게이트를 거치지 않는 두 지점 정정

Phase 1 게이트만 넣으면 **입력 칸이 없는데 차단되는 dead-end**가 신규 발생한다. 아래 둘을 같은 PR에 포함한다.

**(1) validate V3가 술어를 거치지 않는다** — `transfer-tax-validate-split.ts:102-106`

```ts
if (asset.assetKind === "building" && opt(asset.buildingStandardPriceAtAcq) != null) {
  if (opt(asset.standardPricePerSqmAtAcq) == null || opt(asset.acquisitionArea) == null) return "…";
}
```

일반건물 별개취득에서 건물분을 입력한 뒤 양쪽을 실가로 되돌리면 → 카드 2개 모두 숨김
(값 보존 원칙상 `buildingStandardPriceAtAcq`는 잔존) → **V3가 있지도 않은 칸을 요구**한다.
현행에는 카드가 상시 노출돼 해소 가능하므로 **이 수정이 신규 유발**하는 ⑧ 모순이다.
→ V3 진입에도 `requiresAcqStdPrice` 게이트를 건다(단일 소스 유지).

**(2) 술어 인자가 3계층에서 다르다 — §8의 "모순 발생 불가" 단정은 틀렸다**

`requiresAcqStdPrice(a, ctx)`를 UI·validate·엔진이 공유하지만 **넘기는 인자가 다르다**(실측):

| 인자 | UI(`CompanionAcqPurchaseBlock.tsx:146-163`) | validate(`transfer-tax-validate-split.ts:150`) | 엔진(`split-gain.ts:356-362`) |
|---|---|---|---|
| `expenses` | **미전달** → ⑥절 dead | `asset` 통째 전달이나 `AssetForm`에 `expenses` 프로퍼티 자체가 없음(`calc-wizard-asset.ts:75`는 `directExpenses`) → **dead** | `input.expenses = parseAmount(primary.directExpenses)` (`transfer-tax-api.ts:238-243` — 실가 모드에서 0 치환 안 됨) → **live** |
| `hasSaleRatio` | 폼값 직접 판정 | 폼값 직접 판정 | `calcSaleApportionRatio(input)` = **실제 전송된 필드** 기준. API는 `saleStdPriceActive`(`transfer-tax-api-split.ts:78-80`)일 때만 전송 |

- **`expenses` 비대칭은 Phase 1이 악화시킨다**: legacy 마이그레이션 자산(`calc-wizard-migration.ts:62`로
  `directExpenses > 0`)이 별개취득 + 실가/실가 + 파트 자본적지출 2칸 공백이면 UI ⑥절 false(카드 숨김)
  ↔ 엔진 ⑥절 true → `!ratio && requiresAcqStdPrice` → **`TaxCalculationError` throw**. 현행에는 카드가
  있어 채울 수 있으나 Phase 1이 그 경로를 막는다.
  → **UI·validate 호출부에 `expenses: parseAmount(asset.directExpenses)` 추가**(Phase 1 범위).
- `hasSaleRatio` 비대칭은 **Phase 1과 무관한 선재 결함**이다 → §12-S1.

**(3) 면적(`acquisitionArea`) 입력 경로 — 게이트 밖으로 뺀다**

파트 카드의 「토지 면적」 FieldCard(`LandBuildingSplitSection.tsx:119-125`)를 숨기면 **주택·일반건물
별개취득에서 면적을 입력할 칸이 앱 어디에도 없어진다**(실측한 전 경로):

| 경로 | 게이트 | 실가/실가 별개취득에서 |
|---|---|---|
| `AssetSectionBasic.tsx:297` | `assetKind === "land"` | ✗ |
| 자산 전체 `StandardPriceInput` | `acqStdPriceRequired`(동시 숨김) + 주택은 area 모드 아님 | ✗ |
| `PreHousingDisclosureSection.tsx:112` | PHD ON | ✗ |
| `SalesCaseSection.tsx:92` | salesCase 모드 | ✗ |
| `Pre1990LandValuationInput` | land + 1990 이전 | ✗ |
| 파트 카드 `:121` | **Phase 1로 숨김** | ✗ |

`acquisitionArea`는 취득시 기준시가 외에도 소비처가 있다(`transfer-tax-api.ts:321·574·624`,
`transfer-tax-api-helpers.ts:353·434`, `transfer-tax-api-inheritance.ts:77`,
`non-business-land-request.ts:60·100`) → 실가/실가에서 조용히 0이 될 위험.

→ **0단계 probe 결과(2026-07-29 실측): 전부 미도달 → 「단순안」 확정 — 면적도 카드와 함께 숨긴다.**

| 소비처 | 게이트 | 주택·일반건물 별개취득 + 매매취득 + 실가/실가 |
|---|---|---|
| `split-gain.ts:47` `calcAcqStdPair` | 없음(항상 호출) | 호출되나 결과 `ratio`가 **미소비**(§8) |
| `rate-calc.ts:180-189` companion 세율 | `propertyType === "land"` | ✗ |
| `multi-parcel-transfer.ts:317-329` | 다필지 모드 | ✗ |
| `non-business-land/form-mapper.ts:70` · `non-business-land-request.ts:56` | `assetKind === "land"` + `nblUseDetailedJudgment` | ✗ |
| `api.ts:568-574` PHD `landArea` | `usePreHousingDisclosure` + 최초공시 2필드 | ✗ (PHD ON이면 카드가 §1-b로 안내 대체) |
| `api.ts:619-624` · `helpers:434-445` 상속평가 `landAreaM2` | `acquisitionCause === "inheritance"` | ✗ (매매취득) |
| `helpers:353` pre1990 `areaSqm` | 등급 3종 + 1990 단가 | ✗ |
| 결과 화면·신고서 표시 | — | ✗ (`components/calc/results`·`lib/storage` grep 0건) |

취득원인을 상속으로 바꾸거나 PHD를 켜면 술어가 다시 true가 되어 카드와 면적이 함께 복귀하므로
경로 소멸이 고착되지 않는다. 실가 모드에서 면적을 남기는 것은 사용자 요청("실가 모드면 실가에
필요한 것만")에도 어긋난다.

### Phase 1-b — PHD 양쪽 환산 경로 (매트릭스 #14)

`preHousingDisclosure && landMode === "estimated" && buildingMode === "estimated"`이면 파트 카드를
자산 전체 블록과 동일하게 **안내 문구로 대체**한다 — "취득시 기준시가는 위 §164⑤ 3-시점 입력으로부터
자동 도출됩니다"(`CompanionAcqPurchaseBlock.tsx:544-546`과 동일 서술). 한쪽만 환산(#14b)은 early-return이
걸리지 않아 카드가 실제로 필요하므로 **반드시 `양쪽 estimated`로 한정**한다.

### Phase 1-c — `building_only`에서도 토지 취득시 기준시가 카드 렌더 (D6 해소)

**원칙: 소유 여부와 계산 입력 필요 여부를 분리한다.** 토지분 기준시가는 소유권이 아니라
**건물분 도출·안분의 소스**이므로, 토지를 소유하지 않아도 필요하면 입력할 수 있어야 한다.
엔진도 이미 같은 비대칭을 전제한다(취득가액은 비소유 파트 면제 / 기준시가는 소유 무관 요구).

```
현행: {landOwned && ( 라디오 · [토지 기준시가 카드] · 취득가액 칸 )}   ← 카드가 소유 게이트에 갇힘
개선: {landOwned && ( 라디오 · [토지 기준시가 카드] · 취득가액 칸 )}
      {!landOwned && showLandStdPrice && ( [토지 기준시가 카드] + 사유 안내 )}   ← 신설
```

- **토지 취득가액 방식 라디오·금액 칸은 렌더하지 않는다** — 토지 gain은 폐기되므로
  (`transfer-tax.ts:315-316`) 입력받으면 거짓 요구가 된다. 기준시가 카드만 렌더한다.
- 안내 문구(카드 상단): "토지는 타인 소유이나, **건물분 취득시 기준시가**를 결합 공시액에서
  도출하려면 토지분이 필요합니다 (소득세법 §99①1호 가목·라목)."
- 자산 종류 무관(주택·일반건물 공통)으로 렌더한다 — 일반건물은 현재 자산 전체 블록으로 우회
  가능하지만 **Phase 3에서 그 경로가 사라지므로** 지금 통일해 두는 편이 재작업이 없다.
- `land_only`(11c)는 변경 없음 — 건물 카드 미렌더 유지(건물 gain 폐기).

### Phase 2 — 환산 안내 문구 정정 + 필요 입력 안내 (D3·D4 부분 해소)

`PartAcqInputs`의 `estimated` 분기(`:230-234`)를 방향이 맞는 안내로 교체하고, 필요한 3요소를 명시한다.
**입력 칸을 축 B에 복제하지 않는다** — 이원 배치는 dual-truth이므로 금지(`LandBuildingSaleSplitSection.tsx:181-182`).

**방향은 실측으로 확정한다** — `LandBuildingSplitSection.tsx` 토지 블록 내부 순서는
라디오(`:284-293`) → **취득시 카드**(`:294-302`) → **안내 문구**(`:303-311`)이므로 취득시 카드는
안내의 **위**다. 양도시 카드는 축 A(더 위). 즉 **두 지시 모두 "위"**다.

건물 파트 문구는 `isHousingAsset`으로 분기한다 — 주택은 `showBuildingStdPrice = false`라
「건물 취득시 기준시가」 카드가 **존재하지 않는다**(D2와 같은 dangling 재도입 금지).

```
[토지 파트 · 공통]
  토지 환산취득가 = 토지 양도가액 × (취득시 기준시가 ÷ 양도시 기준시가)
   · 취득시 기준시가 → 위 「토지 취득시 기준시가」 카드
   · 양도시 기준시가 → 위 「양도시 기준시가」 카드

[건물 파트 · 일반건물]
   · 취득시 기준시가 → 위 「건물 취득시 기준시가」 카드
[건물 파트 · 주택]
   · 취득시 기준시가 → 위 「취득시 기준시가(개별·공동주택가격)」에서 토지분을 뺀 값으로 자동 도출
```

- 위치 부연(`(양도가액 구분 방식 아래)` 등)은 **넣지 않는다** — 드리프트 표면만 늘린다. 카드 제목으로만 지시.
- `<ToneCard tone="amber" noDark>`로 감싼다. 형제 ToneCard 2곳(`:109`·`:138`)이 모두 `noDark`라
  누락 시 다크 테마에서 이 카드만 달라진다. `title` 없이 순수 톤 박스로 두어 제목형 형제 카드와 위계를 분리한다.
  실제 시그니처: `tone · title? · sectionNum? · className? · bodyClassName? · noDark? · titleExtra? · children`.
- 라벨 크기는 정본 클래스만 사용(`text-xs` hint / `text-caption` fine print) — 임의 px 금지(pre-push 하드블록).
- **`:228-229`의 코드 주석**("양도시 기준시가는 **아래** 공용 칸에서 입력")도 같은 드리프트를 담고 있다 →
  함께 갱신한다.

**D4 범위 — 기본안 확정(2026-07-29 사용자 결정)**: 축 B에 현재값 read-only 요약을 붙이는 확장안은
**채택하지 않는다**. 문구 정정(위치 지시 + 필요 3요소 명시)까지만 수행한다.

### Phase 3 — 일반건물 별개취득: 중복 입력 제거 + 읽기 전용 파생 (D5)

**2026-07-29 사용자 결정**: 중복 입력을 두지 말고, **미리 입력한 값을 읽기 전용으로 읽어온다.**

적용 범위는 `assetKind === "building" && isSeparateAcq && acqStdPriceRequired`. 주택(housing)은
자산 전체 블록이 총액 모드(area 모드 아님)라 중복 자체가 없으므로 **대상이 아니다**.

> **전제조건: Phase 1-c(D6) 선행 필수.** 일반건물 `selfOwns = building_only`는 지금 자산 전체 블록의
> area 모드로 ㎡당·면적을 입력한다(§3 D6 probe 표). Phase 3이 그 블록을 읽기 전용으로 바꾸면
> **입력 경로가 사라져 주택과 같은 dead-end가 된다** — Phase 1-c가 파트 카드를 소유 게이트 밖으로
> 빼두어야 Phase 3이 안전하다.

**입력 정본 = 파트 카드**다. 엔진이 별개취득 일반건물에서 파트 독립 경로를 정본으로 두고
(`transfer-tax-split-gain.ts:52-56`), 결합 총액 역산은 "한시 후퇴"로 명시하기 때문(`:58`).

```
자산 전체 「취득시 기준시가」 블록 (building + 별개취득 시)
  → StandardPriceInput(입력형) 대신 읽기 전용 파생 표시로 교체
     토지분  = ㎡당 공시지가 × 면적      (파트 토지 카드 입력값에서 파생)
     건물분  = 취득시 건물기준시가        (파트 건물 카드 입력값)
     합계    = 토지분 + 건물분
     안내: "각 파트 카드에서 입력합니다 (§99①1호 가목·나목 — 취득시점이 달라 각자 자기
            취득일의 직전 고시분을 씁니다)"
```

**표시 위젯 명세**(코드 선례 그대로 재사용): `ThreePointStandardPriceInput.tsx:474-496`
(FieldCard + 읽기전용 div를 `grid grid-cols-2 gap-2`) · `LandPriceLookupField.tsx:227-234`.
선례 클래스는 `flex h-9 items-center rounded-md border border-input bg-muted/40 px-3 text-sm
tabular-nums text-muted-foreground`, 미입력 시 `<span className="text-muted-foreground/50">자동 계산</span>`.
**단 선례에는 `font-mono`·`text-right`가 없다** — 토지분·건물분·합계 3행은 금액 칼럼이므로
`amount-column-align` 정책(`text-right font-mono tabular-nums whitespace-nowrap`)을 적용한다(선례 미준수분 승계 금지).

**산식 재구현 금지**: 토지분(`㎡당 × 면적`)·합계를 UI에서 다시 쓰면 엔진 `calcAcqStdPair`
(`transfer-tax-split-gain.ts:45-61`, `Math.floor(sqm * area)`)와 갈라진다
(`feedback_ui_engine_dual_truth_avoidance`). **절사 규약(`Math.floor`)을 명시**하고 H2 anchor가
절사 경계값(예: 단가 12,345 × 면적 33.33 = 411,459.85 → 411,459)을 검증한다. 가능하면 공용 순수 헬퍼로
추출해 엔진과 공유한다(선례: `isSplitPairOverflow`를 엔진이 export하고 validate가 import).

**⚠️ 이 변경의 핵심 함정 — 읽기 전용으로 바꾸면 `standardPriceAtAcq`(결합 총액) 폼 필드가 채워지지 않는다.**
엔진 `calcAcqStdPair`는 `buildingStandardPriceAtAcquisition != null`일 때만 파트 독립 경로를 타고,
`null`이면 결합 총액 역산으로 후퇴하는데 그 총액이 0이면 `null` 반환 →
**별개취득이므로 `return null`이 아니라 `TaxCalculationError` throw**(`transfer-tax-split-gain.ts:368-374`
— `isSeparateAcquisition !== true`일 때만 `return null`). Phase 3 범위(`building && isSeparateAcq`)는
**항상 throw 경로**다. 따라서 읽기 전용 전환은 **건물분 파트 입력이 반드시 채워진다는 보장**과 짝이어야 한다.

**⚠️ stale 값 처리(필수 결정)**: 케이스 8(일반건물·실가/실가)에서는 술어가 false라 (a)안의 validate 확장이
건물분을 요구하지 않는다 → `buildingStandardPriceAtAcquisition` 미전송(`transfer-tax-api-split.ts:97-99`)
→ 엔진이 legacy 역산으로 **화면에 보이지 않는 stale `standardPriceAtAcq`** 를 소비한다.
→ ⓑ **`assetKind === "building" && separateAcquisition`이면 `standardPriceAtAcquisition` 전송 자체를 차단**한다
(API 변환 1곳 수정 — 폼 값은 보존하되 도달을 막아 "안 보이는데 계산에 쓰이는 값"을 제거). 값 삭제(ⓐ)는
보존 원칙과 충돌하므로 채택하지 않는다. anchor 1건 추가.

| 후보 | 내용 | 판정 |
|---|---|---|
| (a) 읽기 전용 + validate 확장 | 폼 필드 미기록. `validateSplitDirectInputs` V3를 "취득시 기준시가가 필요한 building 별개취득이면 건물분도 필수"로 확장 → 엔진이 항상 파트 독립 경로 | **채택**. 정책 부합(미러링 없음)·법령상 정본 경로 강제 |
| (b) 합계를 `standardPriceAtAcq`에 동시 write | 파트 카드 onChange에서 단일 배치 patch로 총액 동시 기록(useEffect 아님) | 기각 — 같은 값의 두 저장소(dual-truth). 사용자가 파트를 지웠을 때 stale 총액이 남는다 |
| (c) 현행 유지(중복 입력) | — | 기각 — 사용자 지시에 반함 |

(a)는 **차단 validation 신설**이므로 착수 전 영향 범위 실측이 필수다
(memory `feedback_blocking_validation_full_e2e_regression` — "어림짐작 금지").

**실측한 영향 spec 5파일**(별개취득·`selfOwns` 경로 진입):
`e2e/split-mode-gating.spec.ts` · `transfer-split-land-expropriation` ·
`transfer-phd-building-stdprice-calculator` · `transfer-self-owns-filing-form` · `mixed-use-filing-form-4col`

절차: baseline을 `--reporter=json`으로 먼저 확보 → 변경 후 재실행 → **baseline 대비 신규 실패만** 식별
(line reporter는 truncate되어 전체 목록 확보 불가). Phase 1·2와 **별도 PR**로 분리한다.

**실행 결과(2026-07-29)**: baseline 40건 중 **4건 사전존재 실패**(겸용주택 신고서 4분할 2건 ·
PHD 3시점 일괄계산 모달 개수 2건). PR ① 변경 파일 3개를 직전 커밋(`4dcf394f`)으로 되돌려
재실행해도 **같은 4건이 실패** → PR ① 회귀가 아님을 확인. Phase 3 적용 후에도 동일 4건으로
**신규 실패 0건**.

**구현 결정 — stale 차단은 별도 플래그가 아니라 override로**: `buildSplitPayload`가 반환하는 객체는
body에 그대로 spread되므로 `suppressStandardPriceAtAcquisition` 같은 플래그를 넣으면 Zod 스키마에
없는 키가 되어 침묵 strip되거나 검증 오류가 된다. 대신 `standardPriceAtAcquisition: undefined`를
반환해 본체(`transfer-tax-api.ts:269`)의 값을 덮어쓴다 — 이 빌더의 spread(`:316`)가 뒤에 오므로 성립.

**절사 산식 단일 소스화**: 계획서 B5 지적대로 UI 재구현을 피해
`calcLandStdPriceAtAcq(pricePerSqm, area)`를 `lib/calc/transfer-tax-split-acq-mode.ts`에 추출하고
엔진 `calcAcqStdPair`와 UI 패널이 **같은 함수**를 쓴다. H2-b가 절사 경계값(12,345 × 33.33 =
411,458.85 → **411,458**)을 고정한다.

### 기각한 대안

| 대안 | 기각 사유 |
|---|---|
| 축 B(취득 방식)를 축 A(양도가액)보다 앞으로 이동 | 2026-07-29 확정 계산 규칙 ①양도 → ②취득 역행. `transfer-split-input-flow-reorder.plan.md` 재작업 |
| 양도시 기준시가 입력 칸을 축 B에도 렌더 | 같은 필드 이원 배치 = dual-truth. 기존 주석이 이미 기각 |
| 파트별로 게이트를 쪼갬(토지 카드는 landMode만 봄) | 케이스 5(주택 실가/환산 역산)·9(건물 all-or-nothing)에서 필요한 카드가 사라짐 |

---

## 7. 테스트 계획

### 신규 anchor (`__tests__/components/split-part-std-card-gating.test.tsx`)

Pre-Do로 **먼저 작성해 RED 확인** 후 구현(`pre-do-anchor-verification` 정책).

| ID | 케이스 | 단언 | RED 시 |
|---|---|---|---|
| G1 | 매트릭스 #2(첨부화면: 주택·일괄·실가/실가·양도시 2필드 有) | 파트 토지카드 0 · 역산노트 0 | **실패** |
| G2 | 매트릭스 #1(주택·구분·실가/실가) | 파트 토지카드 0 | **실패** |
| G3 | 매트릭스 #3(주택·일괄·양도시 미입력) | 파트 토지카드 1 | 통과(회귀 가드) |
| G4 | 매트릭스 #5(주택·실가/환산) | 파트 토지카드 1 + 역산노트 1 | 통과(회귀 가드) |
| G5 | 매트릭스 #8(일반건물·구분·실가/실가) | 토지카드 0 · 건물카드 0 | **실패** |
| G6 | 매트릭스 #9(일반건물·환산/실가) | 토지카드 1 · 건물카드 1 | 통과(회귀 가드) |
| G7 | 자산전체 블록 ↔ 파트 카드 동시 노출/동시 숨김 (⑧ 모순 금지) | 두 boolean 일치 | 통과(회귀 가드) |
| G8 | D3 문구 + DOM 순서 | "위 「양도시 기준시가」" 존재·"아래 양도시" 부재 **+** `sale-split-mode`가 안내보다 PRECEDING, `split-land-std-acq-card`도 PRECEDING | **실패** |
| G9 | 값 보존 | 환산 → 실가(카드 숨김) → 환산 복귀 시 `standardPricePerSqmAtAcq`·`acquisitionArea` 값 잔존 | 통과(회귀 가드) |
| G10 | Phase 1-a(1) V3 dead-end | 일반건물·별개취득·`buildingStandardPriceAtAcq` 잔존 + actual/actual → `validateSplitDirectInputs`가 **null**(통과) | **실패**(신규 유발 방지) |
| G11 | Phase 1-a(2) `expenses` 인자 | legacy `directExpenses > 0` + 별개취득 + 실가/실가 + 파트 자본적지출 공백 → 카드 **노출**(엔진 ⑥절과 일치) | **실패** |
| G12 | Phase 1-a(3) 면적 (단순안 확정) | 매트릭스 #1·#2에서 「토지 면적」 칸도 **함께 숨김**(`split-land-std-acq-area` 0). 상속 취득으로 전환하면 **복귀** | **실패** |
| G13 | Phase 1-b PHD | PHD ON + 양쪽 환산 → 파트 카드 0 + 안내 문구 1 / PHD ON + 한쪽만 환산 → 카드 1 | **실패** |
| G14 | Phase 1-c(D6) 주택 | `building_only` + 별개취득 + 건물 환산 → 토지 기준시가 카드 1 + 면적칸 1 + **토지 취득가액 라디오 0** | **실패** |
| G15 | Phase 1-c 일반건물 | `building_only` + 별개취득 + 환산 → 토지 카드 1 · 건물 카드 1 | **실패** |
| G16 | Phase 1-c 회귀 | `both`·`land_only`는 종전 배치 유지(카드 중복 렌더 0 — 같은 카드가 2개 뜨면 testid strict 위반) | 통과(회귀 가드) |
| G17 | Phase 1-c × D1 | `building_only` + **실가/실가**(매트릭스 11b) → 토지 카드 0 (D6 해소가 D1 게이트를 무력화하지 않음) | **실패** |

**RED 분포 검증**: 신규 단언 **11건**(G1·G2·G5·G8·G10·G11·G12·G13·G14·G15·G17) 실패 ·
회귀 가드 **6건**(G3·G4·G6·G7·G9·G16) 통과 = **11:6**. 이 분포가 나오지 않으면 anchor가 잘못 작성된 것이다.
(G12는 0단계 probe 결과가 "단순안 복귀"로 나오면 단언이 반전되어 10:7이 된다 — probe 확정 후 고정.)

**파일 분리**: G10(validate `validateSplitDirectInputs` 반환값)·G11(술어 인자)은 컴포넌트 렌더가 아니라
순수 함수 검증이므로 `__tests__/calc/split-acq-std-predicate.test.ts`에 둔다. 나머지
G1~G9·G12~G17이 위 컴포넌트 테스트 파일이다.

**G7 한정 필수**: 이 불변식은 **non-PHD · non-겸용 · non-상가 · non-일반건물(자산전체 안내 문구 분기)**
에서만 성립한다 — 그 분기들은 자산 전체가 「저기서 입력하세요」 문구만 렌더해 라벨
`취득시 기준시가 (원)`이 없으므로 카운트가 항상 0이 되어 false GREEN/RED를 만든다.

### testid 계획 (신설 — 현행 인벤토리로는 검증 불가)

현행: `split-land-std-acq-area` · `split-building-std-acq` · `split-housing-building-derived-note` ·
`split-{part}-acq-price` · `split-{part}-salescase-value` · `part-acq-mode-{land|building}`.

| 신설 testid | 위치 | 이유 |
|---|---|---|
| `split-land-std-acq-card` · `split-building-std-acq-card` | `PartAcqStdPrice`의 ToneCard | 카드 wrapper에 testid가 없어 G1/G2/G5가 내부 면적 input으로 **대리 판정** → 카드가 남고 면적 칸만 빠지면 거짓 통과. Phase 1-a(3)로 면적을 카드 밖에 두면 대리 판정이 아예 무효가 된다 |
| `split-{part}-estimated-note` | `PartAcqInputs` estimated 분기 `<p>` | G8이 텍스트 매칭에 의존하면 **양쪽 환산 시 안내가 2개** → Playwright strict mode 위반·RTL `getByText` 예외 |
| `split-land-std-acq-total` | 파트 카드 `LandPriceLookupField`에 `landStdPriceTestId` 전달 | 현행 미전달(`:110-118`). H2의 토지분 읽기전용 값에 셀렉터가 없다. 이 prop이 호출부 주입형인 이유는 한 화면 2인스턴스 중복 방지(`LandPriceLookupField.tsx:56-60`) |

### Phase 3 anchor (별도 PR — `__tests__/components/split-building-acq-std-readonly.test.tsx`)

| ID | 케이스 | 단언 | 파일 |
|---|---|---|---|
| H1 | 일반건물·별개취득·환산 | 자산 전체 블록에 ㎡당·면적 **입력 칸 부재**(중복 제거), 파트 카드에만 존재 | 컴포넌트 |
| H2 | 동상 | 토지분·건물분·합계가 파트 입력값에서 파생돼 **읽기 전용**으로 표시. **`Math.floor` 절사 경계값 검증**(엔진 `calcAcqStdPair`와 동일 산출) | 컴포넌트 |
| H3 | 주택·별개취득·환산 | 자산 전체 총액 입력 칸 **유지**(라목 결합 공시 — Phase 3 대상 아님) | 컴포넌트 |
| H4 | validate 확장 | building 별개취득 + `acqStdPriceRequired` + 건물분 미입력 → 필드 오류 | `__tests__/calc/` |
| H5 | 회귀 | 비-별개취득 building(겸용·소유자분리) → 종전 입력형 유지 | 컴포넌트 |
| H6 | stale 차단(ⓑ) | building 별개취득이면 `standardPriceAtAcquisition`이 API body에 **미포함** | `__tests__/calc/` |

### 기존 테스트 영향 (실측 기반)

| 파일 | 영향 | 조치 |
|---|---|---|
| `__tests__/components/split-housing-acq-std-input.test.tsx` | 🔴 **파손 4건** — `:61`(공시지가·면적 노출) `:67`(입력값 기록) `:83`(역산 안내) `:90`(건물 토지분·건물분 노출) 전부 `landAcqMode/buildingAcqMode = "actual"`. **추가로 `:75`·`:97`은 `queryBy…toBeNull`이라 카드 부재로 trivially 통과**해 단언 의미가 소멸(무의미화 2건). 필수 prop 추가로 타입 오류도 발생 | 6건 모두 시나리오를 `estimated`로 전환. **불변식(주택도 토지분 노출 / 건물분은 building 전용)은 유지** — 원 결함(환산 파트 취득가액 0)은 환산 모드에서만 발생하므로 의도 훼손 없음 |
| `e2e/split-mode-gating.spec.ts` U10 (:239) | 🟢 **통과** — `setupSeparateAcq` 기본 상태 = 매트릭스 **#15**(파트 라디오 미선택 → legacy `actual`) + 일괄양도 + 양도시 기준시가 미입력 → ⑤절 true | 매트릭스 참조로 판정 확정(종전 "술어 추론" 해소). 6단계에서 실행 확인 |
| `e2e/split-mode-gating.spec.ts` U11 (:255) | 🟢 무영향 — 자산 전체 블록의 `acq-std-required-mark` 대상 | — |
| `e2e/split-mode-gating.spec.ts` P1 describe 3건 (`:47`·`:56`·`:63`) | 🟢 무영향 — `setupSplitAsset`은 취득일을 채우지 않아 `isSeparateAcq=false`(③절 true) / 분리 OFF는 상위 게이트 | 근거 기록(무영향 판정 재현용) |
| `__tests__/components/split-input-flow-reorder.test.tsx` R4~R10 | 🟢 무영향 — 자산 전체 블록(`^취득시 기준시가 \(원\)`) 대상 | — |
| `__tests__/components/split-transfer-std-price-auto.test.tsx` | 🟢 무영향 — 축 A 컴포넌트 대상 | — |

### 회귀 범위

`components/calc/transfer/**` 단독 변경이면 pre-push가 transfer 세목만 선택하지만
(`scripts/select-test-scope.sh`), **Phase 1-a(2)가 `lib/calc/` validate 호출부를 건드리므로 전체 판정**이 된다.
안전측으로 `npm run test:transfer` + 위 UI 테스트 5파일 + E2E `split-mode-gating.spec.ts` 전체를 돌린다.

---

## 8. 14 동기화 지점 점검

**엔진 input·result 타입 변경 없음 · 신규 폼 필드 없음 · API 스키마 변경 없음.**
표시 게이트만 바꾸므로 해당 지점은 ⑤ 하나다.

| 지점 | 해당 | 근거 |
|---|---|---|
| ①폼 상태 ②initial ③normalize | ✕ | 필드 추가 없음 |
| ④API 변환 ⑨⑩⑪⑫⑬⑭ | ✕(Phase 1·2) / **✓(Phase 3)** | Phase 1·2는 전송 필드 불변(값을 지우지 않으므로 전송 동작도 불변). Phase 3의 stale 차단(ⓑ)은 `transfer-tax-api-split.ts` 수정 → ④ 해당 |
| ⑤UI 위젯 | **✓** | 본 계획서 |
| ⑥사이드바 | ✕ | `separateAcqPartsSum`은 취득가액만 집계 |
| ⑦결과 카드 | ✕ | `SplitGainDetailSection` 표시값 불변 |
| ⑧validation | **✓(수정 필요 — "이미 동기" 아님)** | V5(`:148-155`)는 같은 술어를 쓰지만 **V3(`:102-106`)는 술어를 거치지 않는다**(Phase 1-a(1)). 또 술어 인자가 3계층에서 다르다(Phase 1-a(2)) |

**⑧ 모순 자가 점검 (정정)** — 종전 초안의 "상호배타 → 모순 발생 불가" 단정은 **틀렸다**. 실측 결과:

1. **V3는 술어 밖**이라 상호배타가 성립하지 않는다 → dead-end 신규 유발 (Phase 1-a(1)에서 해소).
2. **같은 술어라도 인자가 다르면 판정이 갈린다** — `expenses`는 UI·validate에서 dead, 엔진에서 live
   (Phase 1-a(2)에서 해소). `hasSaleRatio`는 폼값 vs 전송값 기준 차이(§12-S1, 범위 밖).
3. **일반 원칙**: "같은 함수 공유"는 단일 소스의 **필요조건일 뿐 충분조건이 아니다**. 인자 구성까지
   동일해야 한다. 신규 술어 공유 시 **인자 동일성 표를 반드시 작성**한다.

**숨김 후 잔존값의 엔진 소비 경로 (정정)**: `landRatio`는 (i) 자본적지출 legacy 안분(`:444`)과
(ii) **환산 분모 fallback**(`:208-209` — `landStandardPriceAtTransfer ?? floor(totalStdAtTransfer × landRatio)`)
두 곳에 도달한다. 카드 숨김 조건(양쪽 actual)에서는 환산 파트가 없어 (ii)가 소비되지 않고,
(i)은 Phase 1-a(2)로 술어에 반영되므로 → 영향 없음. (종전 "자본적지출에만 도달" 서술은 부정확했다.)

**신규 점검 항목 (이번에 얻은 교훈)**: 표시 게이트를 추가할 때는
**"숨기는 위젯이 어떤 폼 필드의 유일한 입력 경로인지"** 를 필드별로 전수 확인한다(Phase 1-a(3) 표).
`acquisitionArea`처럼 여러 기능이 공유하는 필드는 카드 단위 숨김이 다른 기능을 조용히 0으로 만든다.

---

## 9. 리스크

| 리스크 | 등급 | 완화 |
|---|---|---|
| **면적 입력 경로 소멸**(Phase 1-a(3)) — 다른 기능이 조용히 0 | **높음** | 면적 FieldCard를 게이트 밖 유지가 기본안. §11 probe로 소비처 도달 여부 확정 후 결정. G12 anchor |
| **V3 dead-end 신규 유발**(Phase 1-a(1)) | **높음** | 같은 PR에서 V3에도 술어 게이트. G10 anchor |
| **D6 dead-end**(주택 `building_only`) — 선재이나 Phase 3이 일반건물로 확대 | **높음** | Phase 1-c에서 소유 게이트 밖 렌더. G14·G15·G17 anchor. **Phase 3의 전제조건** |
| Phase 1-c로 같은 카드가 2곳에서 렌더될 위험(`landOwned` 분기 중복) | 중 | 배타 분기(`landOwned` / `!landOwned`)로 작성. G16이 중복 렌더 0을 단언 |
| **`expenses` 인자 비대칭**(Phase 1-a(2)) — legacy 자산 throw | 중 | UI·validate 호출부에 인자 추가. G11 anchor |
| 실가 모드에서 카드를 숨긴 뒤 환산으로 전환했을 때 입력값 소실 | 중 | 값 삭제 금지(표시 게이트만). **G9** anchor로 복귀 검증(종전 G4는 카드 노출만 봐 값 잔존을 검증하지 못했다) |
| 매트릭스 #3(일괄양도 + 양도시 미입력)에서 카드가 사라지면 안분 비율 소스 상실 | 중 | 술어 ⑤절이 이 경로를 true로 유지. G3 anchor |
| PHD 양쪽 환산에서 카드가 무용하게 노출(#14) | 중 | Phase 1-b 안내 문구 대체. G13 anchor |
| E2E U10 파손 | 낮 | 매트릭스 #15로 통과 확정. 6단계에서 실행 확인 |
| 800줄 정책 | 낮 | `LandBuildingSplitSection.tsx` 360줄 · `CompanionAcqPurchaseBlock.tsx` 700줄. **트리거는 800줄이고 700은 착지 목표**이므로 여유 100줄 — Phase 1·2 증가분(+10줄 내외)은 정책 무관 |

---

## 10. 작업 순서

```
── PR ① (Phase 1·1-a·1-b·2) ────────────────────────────────────
0. probe: acquisitionArea 소비처가 별개취득 실가/실가에서 도달하는지 실측
                                            → verify: Phase 1-a(3) 기본안(면적 상시 노출) 확정 또는 단순안 복귀
1. anchor 작성 G1~G17(2파일) → RED 확인      → verify: 신규 11건 실패 · 회귀 가드 6건 통과 (11:6 분포 아니면 anchor 오작성)
2. Phase 1 게이트 prop + 호출부 · Phase 1-a(1)(2)(3) · Phase 1-b · **Phase 1-c(D6)**
                                            → verify: G1~G7·G9~G17 GREEN, tsc 0건
3. Phase 2 문구 정정(ToneCard noDark) + `:228-229` 주석 갱신
                                            → verify: G8 GREEN
3-b. scripts/check-tone-classes.sh + scripts/check-font-sizes.sh
                                            → verify: 0건 (둘 다 pre-push 하드블록)
4. 기존 테스트 정정(split-housing-acq-std-input 6건 estimated 전환)
                                            → verify: 해당 파일 전건 통과
5. npm run test:transfer + UI 5파일         → verify: 회귀 0건
5-b. npm run lint                           → verify: 0건 (pre-push는 tsc+test만 — lint 갭)
6. npx playwright test e2e/split-mode-gating.spec.ts
                                            → verify: U10·U11·P1 3건 포함 전건 통과
7. npm run check:pre-pr + git diff 확인      → verify: 의도 외 변경 0
8. 브라우저 수동 확인(첨부화면 재현 → 카드 사라짐 / 환산 전환 → 문구·카드 복귀)
   → PR ① 머지

── PR ② (Phase 3 · D5) ─────────────────────────────────────────
9.  E2E baseline 확보 (`--reporter=json`, 영향 5파일)
                                            → verify: baseline JSON 저장
10. anchor H1~H6 작성 → RED 확인            → verify: H1·H2·H4·H6 실패 · H3·H5 통과
11. 자산 전체 블록 읽기 전용 파생 전환(building 별개취득 한정) + stale 전송 차단(ⓑ)
                                            → verify: H1~H3·H5·H6 GREEN
12. validate V3 확장(건물분 필수)           → verify: H4 GREEN
13. E2E 재실행 → baseline 대비 **신규 실패만** 식별
                                            → verify: 신규 실패 0건
```

---

## 11. 미확인 항목

- ~~`acquisitionArea` 소비처 도달 여부~~ → **0단계 probe 완료(2026-07-29): 전부 미도달, 단순안 확정**
  (§6 Phase 1-a(3) 표).
- Phase 3에서 자산 전체 블록을 읽기 전용으로 바꿀 때 `useStandardPriceLookup` **조회 버튼·연도 Select를
  함께 제거할지**, 파트 카드의 조회 기능으로 충분한지 미확인 — Phase 3 착수 시 probe.
- 조문 인용은 기존 코드 주석·validate 메시지의 검증분을 재사용했다. **KoreanLaw MCP 위임체인 재검증은
  미수행**이나 신규 조합 인용이 없어 추가 검증은 불요로 판단.

---

## 12. 범위 밖 — 이번 검토에서 발견한 선재 결함

Phase 1·2·3과 **무관하게 이미 존재**하며, 이번 수정이 유발하지도 악화시키지도 않는다. 별도 항목으로 남긴다.

### S1. `hasSaleRatio` 인자 비대칭 — validate 통과 ↔ 엔진 throw

UI·validate는 **폼값**으로, 엔진은 **실제 전송된 필드**로 `hasSaleRatio`를 판정한다. API는
`saleStdPriceActive`(`transfer-tax-api-split.ts:78-80`)일 때만 양도시 기준시가를 전송하므로,
**일괄양도 → 구분양도 전환 후 양도시 기준시가 2필드가 잔존 + 양도가액 2칸 공백**이면:
validate V4·V5·`needsTransferStd` 전부 통과 → 엔진 `saleRatio = null` →
`splitPair(total, undefined, undefined, null, "양도가액")` → **throw**.

> 검토 fork는 "Phase 1이 유일한 탈출구를 제거한다"고 보고했으나 **반증됨** — `split-gain.ts:407`
> `effectiveSaleLandRatio = saleRatio?.land ?? null`로 **취득시 비율 후퇴가 이미 폐지**(2026-07-29 규칙 ①)
> 되어, 파트 카드를 채워 `ratio`를 non-null로 만들어도 양도가액 축은 여전히 throw한다.
> 즉 현행에도 탈출구가 없으며 Phase 1은 이 경로를 악화시키지 않는다. Phase 1이 바꾸는 것은
> **오류 메시지가 취득시 기준시가를 가리키게 되는 것**뿐이다(혼란도 증가, 세액 영향 없음).

**해소안**: UI·validate의 `hasSaleRatio`를 API 전송 게이트(`saleStdPriceActive`)와 동일 조건으로 계산,
또는 API가 해당 필드를 무조건 전송.

> **S2는 이번 범위에 편입**되었다(2026-07-29 사용자 결정) → §3 **D6** · §6 **Phase 1-c** 참조.
> probe로 주택 `building_only`가 dead-end임을 확증했고, Phase 3이 이를 일반건물로 확대하므로
> 같은 PR에서 해소하는 편이 재작업이 없다.

### S3. `:228-229` 코드 주석 드리프트

"양도시 기준시가는 **아래** 공용 칸에서 입력" — D3와 같은 방향 오류. Phase 2에서 함께 갱신한다
(범위 밖이 아니라 Phase 2 포함 — 여기 기록은 추적용).
