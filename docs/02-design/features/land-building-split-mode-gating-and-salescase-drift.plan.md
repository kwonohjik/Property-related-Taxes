# 토지/건물 분리 — 매매사례가액 취득가액 소실 수정 + 잔액 대칭화 + 산정방식 게이팅 (계획서 rev.2)

- 작성일: 2026-07-16 (rev.5 — **Do 완료 환류**)
- 상태: ✅ Do 완료

## Do 환류 — 설계와 달라진 점

### 🔴 D1. A-6(자본적지출 대칭화) 전제가 거짓이었다 — 코드리뷰가 검출

계획 §2-4는 자본적지출을 양도·취득과 **동형 버그**로 봤으나, **`input.expenses`는 정상 경로에서 항상 0**이다.
`transfer-tax-api.ts:224-229`가 `expenses: parseAmount(primary.directExpenses)`인데 `directExpenses`는
**deprecated**(`calc-wizard-asset.ts:72-75` — "신규 입력은 `capitalExpenditure` + `transferExpense` 분리 사용")이고,
신규 UI(`AssetSectionExpense.tsx`)는 `capitalExpenditure`로 받는다.

→ 자본적지출 분리 칸은 **총액의 안분이 아니라 독립 입력**이다. 잔액 규칙을 적용하니 `0 − 3천만 = −3천만`이
되어 반대편 공제를 상쇄했다(실측: 총 양도차익 570,000,000 → **600,000,000**, 3천만 과대 = **신규 회귀**).

**수정**: 총액 > 0(legacy `directExpenses`)일 때만 잔액/안분, 0이면 독립 입력 그대로.
**계획서 케이스 12는 엔진 직접 호출로만 도달 가능한 상태였다** — anchor가 GREEN이어도 실제 경로를 방어하지 못했다.
→ `expenses=0` 케이스 3건을 anchor에 추가.

### 🔴 D2. `isSplitPairOverflow`가 과소 합을 놓쳤다 (§3-B 설계 결함)

rev.1의 "합 ≠ 총액"이 rev.2에서 `>`로 좁혀지며 **양도가액 축의 보호 방향이 뒤집혔다**:
합 < 총액 = 양도차익 과소 = **세액 과소가 침묵 통과**(총 10억인데 3억+3억 → 4억 과소).
→ 둘 다 입력 시 `!==`로 차단.

### 🔴 D3. validate가 엔진과 다른 필드를 총액으로 썼다 (⑧ 위반)

§3-B는 "판정식 단일 소스"를 지켰으나 **피연산자**를 놓쳤다 — validate는 `capitalExpenditure`,
엔진은 `expenses`(=`directExpenses`). 판정식만 공유하고 총액이 다르면 단일화가 무효다.
→ validate 총액을 `directExpenses`로 정정.

### 🔴 D4. 부담부증여는 **양도가액**도 직접 입력이 성립하지 않는다 (§3-C 결정 보완)

§3-C는 "양도가액 칸은 유지 — 총양도가액이 항상 존재"라 했으나, 부담부증여의 엔진 총액은
**§159 채무 안분액**이고 사용자는 **계약 총액만 본다**(`burdened-gift-step.ts:74`가 override).
계약 10억·채무 4억에서 토지 6억 입력 → 건물 = 4억 − 6억 = **−2억**.
→ 양도가액 칸도 숨김 + API 게이트에 `!isBurdenedGift` 추가.

### D5. C-1 순서 이동 — tsc가 실수를 잡았다

블록을 산정방식 게이트 **안쪽**(677)에 넣었더니 `transferType === "burdened_gift"` 비교가
"타입 겹침 없음"으로 에러 — 게이트 안에서는 항상 false이기 때문. 실제 끝은 679(`</>` 678 + `)}` 679).
→ 게이트 **밖**으로 재이동. 안에 넣었으면 부담부증여·재개발에서 분리 방식이 통째로 사라졌다(기능 제거).

### D6. 검증 결과

| 게이트 | 결과 |
|---|---|
| 신규 anchor | **46/46** (엔진 21 · validate 21 · API 게이트 4) |
| E2E 신규 | **6/6** — 순서 실측(`boundingBox` 대조) + 4모드 게이팅 + 부담부증여 |
| 전체 test | **10,623 통과** — 회귀 0 |
| baseline anchor | 6/6 |
| tsc / lint / tone·font 게이트 | 0건 / 0 error / 0건 |
| 코드 품질 정적 검토 | Critical 2 + Important 2 **전부 수정** |

### D7. 사전존재 발견 (별건 후보 — §7 미등재)

- **`calcTransferGain`이 split 경로에서 early-return**(`transfer-tax-helpers.ts:275-297`)해
  `calcNecessaryExpense`를 거치지 않는다 → `input.capitalExpenditure`·`transferExpense`가
  **split 모드에서 전혀 소비되지 않음**. D1의 근본 원인.
- **분리 6필드에 `applyRatio` 미적용** — `transferPrice`·`acquisitionPrice`는 지분율을 곱하는데
  분리 입력값은 raw. 지분 모드 + 분리 actual이면 음수 확정. validate가 의도적으로 검증 포기 중.

---
- 확정: 감정가액 = 실거래가와 동일(노출) · **부담부증여 = 취득가액 칸 숨김** · S1·S2·S3·S6 별건 분리
- 발단: 사용자 질문 "직접 입력 모드에서 한쪽만 입력하면 다른쪽이 기준시가 비율로 자동 안분되는지 체크"
- 검토: `plan-design-self-review-loop` STEP 1 (3-way fork) → 정정 28건 반영. **verdict: rev.1 blocked → rev.2**
- 법령: 소득령 §166⑥(토지·건물 구분계산) · §176의2③1호(매매사례가액) · §163⑥(개산공제)

## rev.1 → rev.2 변경 요약

| 항목 | rev.1 | rev.2 | 근거 |
|---|---|---|---|
| §97② swap 위험 | Critical 경고 + Pre-Do probe A3 | **삭제(오탐)** | swap은 `split-gain.ts:148` `input.useEstimatedAcquisition` **독립 게이트**. `usesEstOrAppraisal` 아님. 비-split도 동일(`helpers.ts` `isConversionMode`) → salesCase 추가해도 미발화 |
| A-3 개산공제율(미등기 0.3%) | 포함 | **제외 → 별건** | 드리프트가 아니라 **문서화된 미지원**. `general-building-valuation.ts:38-43` 주석: "환산 경로는 등기 자산 전제(3% 고정)… 지원하려면 route helper·validate wiring 필요". 0.03 하드코딩이 PHD·겸용·재개발 등 **엔진 전반**(정본은 `helpers.ts:307`·`multi-parcel-transfer.ts:308` 2곳뿐) → split만 고치면 경로 간 불일치 악화 |
| 공익수용 환산 min[] 특례 | 미인지 | **별건 분리 → §7 S2** | 세액 영향 있으나 원인·위치가 salesCase와 무관 |
| swapApplied 표시 누락 | 미인지 | **별건 분리 → §7 S3** | 세액 무영향(표시만). 코드 주석이 "별도 PR" 자인 |

> **번호 표기 주의**: rev.1 검토 때 "드리프트 4·5"로 부르던 것이 각각 **S2·S3**다.
> 본 문서는 **드리프트 번호를 쓰지 않는다** — 범위 내 2건은 `A-1`·`A-2`, 범위 밖 5건은 `S1`~`S5`로만 부른다.
| 자본적지출 비대칭 | 미인지 | **A-6 신규 포함** | 양도·취득과 **동형 버그**(`:117-120`) |
| 잔액 음수 | 미인지 | **validate 차단**(B-2) | A-4/A-5가 음수 경로 신규 유입 |
| UI prop | 미명시 | **`acqPriceMode` 유니온**(C-0) | 현 prop `useEstimatedAcquisition: boolean` 단일로 4모드 표현 불가 |
| 자동 안분 정책 충돌 | 미언급 | **§3.0에서 정면 해소** | `feedback_no_silent_apportion_fallback` |

---

## 1. 범위

**포함**: 매매사례가액 취득가액 소실(A-1·A-2) + 잔액 대칭화 3쌍(A-4·A-5·A-6) + validate(B) + UI 게이팅(C).
**제외(별건 — §7)**: 개산공제율 미등기 / 공익수용 환산 min[] / swapApplied 표시.

---

## 2. 실측 근거 (엔진 직접 호출)

조건: 토지기준시가 비율 60% / 총양도가액 10억 / 총취득가액(또는 감정·사례가액) 4억 / 토지·건물 취득일 분리.

### 2-1. 모드별 split 취득가액 — probe 실측

| 산정 방식 | 토지 | 건물 | 판정 |
|---|---|---|---|
| 실거래가 | 240,000,000 | 160,000,000 | ✅ |
| 감정가액 | 240,000,000 | 160,000,000 | ✅ |
| 환산취득가 | 300,000,000 | 200,000,000 | ✅(부분별 환산) |
| **매매사례가액** | **0** | **0** | 🔴 **취득가액 전액 소실** |

→ 양도차익 = 6억 + 4억 = **10억(= 양도가액 전액)**.

### 2-2. 한쪽만 입력 시 — probe 실측

| 케이스 | 결과 | 합계 | 판정 |
|---|---|---|---|
| 양도 둘 다 미입력 | 6억 / 4억 | 10억 ✅ | 비율 안분 |
| 양도 **토지만** 7억 | 7억 / **3억** | 10억 ✅ | 잔액 |
| 양도 **건물만** 3억 | **6억** / 3억 | **9억** 🔴 | **총액 불일치**(비대칭) |
| 취득 토지만 2.5억 | 2.5억 / 1.5억 | 4억 ✅ | 잔액 |
| 취득 **건물만** 1.5억 | **2.4억** / **1.6억** | — 🔴 | **입력값 완전 무시** |

> rev.1의 "건물 9.99억" 예시는 삭제 — 총취득 4억을 초과해 잔액이 음수가 되는 **validate 차단 대상**(B-2)이라 예시로 부적절했다.

### 2-3. 드리프트 — 본 계획 범위 2건

`calcTransferGain`(`transfer-tax-helpers.ts:273-297`)은 splitResult가 있으면
`gain = land.gain + building.gain`을 **실제 양도차익으로 반환** → 표시용 아님, **세액 직결**.

| # | 항목 | 비-split (정본) | split (`transfer-tax-split-gain.ts`) | 영향 |
|---|---|---|---|---|
| **A-1** | salesCase base | `helpers.ts:343` `input.similarSalesValue ?? input.acquisitionPrice` | **분기 없음** → fallthrough `:62` `base = input.acquisitionPrice ?? 0`. API가 `isSalesCase → acquisitionPrice: 0`(`transfer-tax-api.ts:199-201`) → **base = 0** | 🔴 취득가액 0 |
| **A-2** | salesCase 추계 취급 | `helpers.ts:339-348` salesCase 분기 → `usedEstimated=true` → `calcNecessaryExpense`가 **①개산공제 적용 ②directExp 미차감** | `:123-124` `usesEstOrAppraisal = useEstimatedAcquisition \|\| acquisitionMethod === "appraisal"` — **salesCase 누락** → `applyAssetSwap`의 실가 early-return(`:138-141`)으로 빠져 **①개산공제 0 ②directExp 전액 차감** | 🔴 **2방향** |

**A-1 정황**: 같은 함수의 `usedEstimated`(`helpers.ts:281-284`)는 `acquisitionMethod === "salesCase"`를 **이미 포함** → 저자는 salesCase가 이 경로로 옴을 알았고 split 분기만 빠뜨렸다. 의도된 설계 아님.

**A-2는 세액 2방향**(rev.1은 개산공제만 기술): 개산공제 적용(세액↓) + directExp 차감 제거(세액↑). 둘 다 비-split 정합.

**§97② swap 무영향(실측)**: swap 트리거는 `:148` `if (input.useEstimatedAcquisition && directExp > estimatedSide)`.
`usesEstOrAppraisal`이 아니다. salesCase는 `useEstimatedAcquisition=false` → **A-2 적용 후에도 swap 미발화**.
비-split `calcNecessaryExpense`도 `isConversionMode = input.useEstimatedAcquisition === true`로 동일.
→ `feedback_97_2_swap_necessary_expense_max_not_sum`("환산모드 전용") **위반 없음**.

### 2-4. 잔액 비대칭 3쌍 (동형 버그)

| 쌍 | 위치 | 현행 |
|---|---|---|
| 양도가액 | `:100-103` | `land ?? floor(total×ratio)` / `building ?? (total − land)` |
| 취득가액 | `:57`·`:63` | `land ?? floor(base×ratio)` / `building = base − land` — **`input.buildingAcquisitionPrice` 미참조** |
| **자본적지출** | `:117-120` | `landDirectExpenses ?? floor(total×ratio)` / `buildingDirectExpenses ?? (total − land)` |

→ **한쪽(건물)만 입력 시 반대쪽이 비율로 채워져 합계 불일치**. 3쌍 전부 동일 패턴.

### 2-5. 죽은 필드 · 죽은 모드

- `input.buildingAcquisitionPrice`: ①타입·④API·⑫Zod·⑭Route·엔진타입 **전부 배선**됐으나 **엔진 미참조**. (A-5가 소생)
- `input.landSplitMode`: 엔진 소비 **0건**. 모드 구분이 엔진에 없다 — 필드별 `?? fallback`으로만 동작.
  API(`transfer-tax-api.ts:297-299`)는 전달하나 아무도 읽지 않음 → **C-4가 이 전달을 게이트로 활용**.

---

## 3. 설계

### 3.0 ⚠️ 정책 충돌 해소 — `feedback_no_silent_apportion_fallback`

정책: "미입력 자동 안분(fallback) 금지, 명확한 오류로 차단. **'비워두면 자동 안분' 류 placeholder 표현 금지**."
본 계획은 fallback을 **유지·강화**하므로 정면 충돌이다. 아래로 정당화한다(정당화 없으면 Do 진입 금지):

| 상황 | 처리 | 정당화 |
|---|---|---|
| 토지·건물 **둘 다 미입력** | 기준시가 비율 안분 | 정책 예외 요건 = "**법령·집행기준이 산식을 명시 규정**". **소득령 §166⑥**이 "실지거래가액을 구분할 수 없는 때에는 기준시가 비율로 안분"을 명문화 → 예외 충족 |
| **한쪽만 입력** | 반대쪽 = 총액 − 입력값 | **fallback(안분)이 아니라 확정 도출**. 총액이 필수 입력이므로 산수로 유일하게 결정된다. §166⑥ "실지거래가액 확인 시 그 가액 사용" 취지에 부합 |
| **입력 합 > 총액** | **validate 차단** | 정책 본문 그대로 — 모순 입력은 오류로 차단(B-2) |
| placeholder | `미입력 시 자동 안분` → **`미입력 시 나머지에서 자동 계산`** | 정책의 금지 표현 회피(C-3) |

### 3-A. 엔진 (`transfer-tax-split-gain.ts`)

**A-0 — 공용 지역 헬퍼**(3쌍 중복 제거. 외부 소비처 없으므로 **파일 내부 지역 함수**로 충분 — 별도 모듈은 과설계):

```ts
/**
 * 토지/건물 쌍 분리 — 입력 우선, 한쪽만 있으면 반대쪽은 잔액, 둘 다 없으면 기준시가 비율 안분.
 * §166⑥ — 실지거래가액 확인 시 그 가액, 구분 불가 시 기준시가 비율.
 * ⚠️ overflow(입력 > 총액)는 여기서 clamp하지 않는다 — validate가 차단(B-2). 엔진은 음수를 그대로 노출해
 *    조용한 오답 대신 눈에 띄는 이상값이 되게 한다.
 */
function splitPair(total: number, landIn: number | undefined, buildingIn: number | undefined, landRatio: number)
  : { land: number; building: number } {
  if (landIn != null && buildingIn != null) return { land: landIn, building: buildingIn };
  if (landIn != null) return { land: landIn, building: total - landIn };
  if (buildingIn != null) return { land: total - buildingIn, building: buildingIn };
  const land = Math.floor(total * landRatio);
  return { land, building: total - land };
}
```

**A-1 — salesCase base 분기 신설** (`calcSplitAcquisitionPrice`, `:55` 감정 분기 **앞**에):

```ts
if (input.acquisitionMethod === "salesCase") {
  // 비-split(helpers.ts:343)과 동일 base — 드리프트 방지.
  // 추계액(§176의2③1호)이라 토지/건물 개별 실지가액이 존재하지 않음 → 항상 기준시가 비율 안분.
  const base = input.similarSalesValue ?? input.acquisitionPrice ?? 0;
  const land = Math.floor(base * landRatio);
  return { land, building: base - land };
}
```

⚠️ **`input.landAcquisitionPrice`를 읽지 않는다** — 감정가액 분기(`:55-59`)와 다른 점. 추계액은 구분 입력 대상이 아니다.

> ⚠️ **부담부증여 가드를 넣지 않는다 (2026-07-16 실측 확정)**
> `similarSalesValue`를 우선하면 부담부증여의 §159 안분 취득가액을 덮어쓸 것처럼 보이나,
> **비-split 경로가 이미 똑같이 동작한다**(probe 실측 — §7 S6). 즉 A-1이 만드는 회귀가 아니라
> **사전존재 버그를 split에 동형 전파**하는 것이다.
> 여기에만 가드(`burdenedGiftDenominator === undefined` 등)를 넣으면 **split만 다르게 동작하는 새 드리프트**가
> 생긴다 → 본 계획의 제1원칙("split ↔ 비-split 정합") 위배.
> → **A-1은 비-split과 동일 산식 유지**. 부담부증여 stale 산정방식은 **S6에서 양 경로를 함께** 고친다.
> anchor에 부담부증여 케이스를 넣어 `split === 비-split`을 **고정**한다(케이스 17).

**A-2 — 추계 취급 대상에 salesCase 추가** (`:123-124`):
```ts
const usesEstOrAppraisal =
  input.useEstimatedAcquisition ||
  input.acquisitionMethod === "appraisal" ||
  input.acquisitionMethod === "salesCase";   // 신규 — helpers.ts:339-348과 정합
```
→ 개산공제 적용 + directExp 차감 중단. swap은 `:148`이 독립 게이트라 **무영향**(§2-3).

**A-4 — 양도가액**(`:100-103` → `splitPair`). ⚠️ 변수명 **`totalTransfer`**(`:99`) — rev.1의 `total`은 오류.
**A-5 — 취득가액**(`:57`·`:63` → `splitPair`). **실거래가·감정가액 한정** — salesCase는 A-1, 환산은 별도 분기.
  → `input.buildingAcquisitionPrice` 소생(죽은 필드 해소).
**A-6 — 자본적지출**(`:117-120` → `splitPair`).

> ✅ **A-6 `explicitDirect` — 분리는 이미 되어 있다 (2026-07-16 실측 확정)**
> `applyAssetSwap` 호출부(`:159`·`:165`)는 **입력 원본**(`input.landDirectExpenses !== undefined`)을 직접 보고,
> 계산값(`landDirectExp`, `:117-120`)은 별도 인자로 넘긴다 → 현재 이미 분리 상태.
> `splitPair`로 **계산값 산출부만** 교체하면 `explicitDirect`는 그대로 입력 원본을 본다.
> → 신규 분리 작업 **불필요**. 다만 구현자가 `explicitDirect`를 `splitPair` **출력에서 파생시키면** 오염되므로
> (예: `land != null` 대신 `splitPair().land > 0`), **입력 원본 참조를 그대로 유지**할 것. 케이스 14가 회귀 방어.

**A-3 (개산공제율) — 본 계획에서 제외.** §7 참조.

### 3-B. Validate (`lib/calc/transfer-tax-validate-asset.ts`)

- **B-1 — 입력 합 > 총액 차단**: 양도·취득 **양쪽** 모두. 한쪽만 입력한 경우도 포함(`입력값 > 총액` → 잔액 음수).
  rev.1은 "둘 다 입력 시 합≠총액"만 다뤄 한쪽 초과를 놓쳤다.
- **B-2 — 음수 잔액 차단**: B-1의 부분집합이나 메시지를 구분(어느 칸이 총액을 넘는지 지목).
- **⑧ 규칙**: UI 통과 ↔ validate 차단 모순 금지. 엔진 `splitPair`와 **같은 판정식**을 쓴다(dual-truth 회피).

### 3-C. UI

**C-0 — prop 시그니처**(현 `useEstimatedAcquisition: boolean` 단일로 4모드 표현 불가):
```ts
// boolean 3개 조합은 무효 상태(예: appraisal && salesCase)를 만든다 → 단일 유니온
acqPriceMode: "actual" | "appraisal" | "estimated" | "salesCase";
```
`CompanionAcqPurchaseBlock`에서 기존 3 boolean(`useEstimatedAcquisition`·`isAppraisalAcquisition`·`isSalesCaseAcquisition`)으로 **파생**해 전달(폼 필드 신설 없음 — 파생은 렌더 중, store 미저장).

**C-1 — 순서 이동**: 「취득가액 산정 방식」을 「취득·양도가액 분리 방식」 **위로**.
근거: `CLAUDE.md` "UI 순서 = 엔진 계산 로직 순서. 모드 토글은 영향 필드 직전."

> ⚠️ **게이트 구조 상이 — 실측 결과 (2026-07-16 확정)**
>
> ```
> 분리 방식 노출 = isSplitable && hasSeperateLandAcquisitionDate     (:255·:258)
>                  └ isSplitable = assetKind === "housing" || "building"   (:127-128) ← transferType 무관
> 산정 방식 노출 = transferType !== "burdened_gift" && assetKind !== "redevelopment_apt"  (:380)
> ```
>
> | 조합 | 판정 |
> |---|---|
> | **재개발**(`redevelopment_apt`) | ✅ **무해** — housing/building이 아니라 `isSplitable=false` → 분리 방식도 함께 닫힌다 |
> | **부담부증여**(`burdened_gift` + housing/building + 취득일 분리) | 🔴 **문제 조합 실재** — 분리 방식 **노출** / 산정 방식 **숨김**. 부담부증여 지원 자산에 housing·building 포함(`TransferModeBlock.tsx:49`) |
>
> C-1로 산정 방식을 위로 올리면 부담부증여에서 **위가 비고 아래만 뜨는** 상태가 된다.
> 게다가 부담부증여는 **자체 산정방식**(`bgAcquisitionMethod`: 실지/환산, `BurdenedGiftBlock.tsx:224`)을
> 부담부증여 카드 안에서 따로 고른다 → **C-2의 `acqPriceMode`가 참조할 소스가 이 경로에선 다르다**.
>
> **✅ 결정 (2026-07-16 사용자 확정): 부담부증여 = 취득가액 칸 숨김**
> 부담부증여는 §159가 취득가액을 자동 산정하므로 토지/건물 직접 입력이 무의미하다.
> **양도가액 칸은 유지**(총양도가액 = §159 안분 채무액이 항상 존재 → 잔액/안분 성립).
> 부수 효과: S6(stale 산정방식)가 미해결이어도 **취득가액 직접 입력 경로가 닫혀** 노출면이 줄어든다.
> → C-2 표에 `burdened_gift` 행 추가(아래).

**C-2 — 산정방식별 게이팅**(`LandBuildingSplitSection.tsx:57`의 `!useEstimatedAcquisition` 단일 게이트 → 4-way):

| 산정 방식 | 토지/건물 **양도가액** | 토지/건물 **취득가액** | 미입력 시 |
|---|---|---|---|
| 실거래가 | 노출 | **노출** | 한쪽→잔액 / 둘 다 빔→기준시가 안분 |
| **감정가액** | 노출 | **노출** ✅확정 | 동일 |
| 환산취득가 | 노출 | 숨김(현행) + 양도시 기준시가 칸 | 부분별 환산 |
| **매매사례가액** | 노출 | **숨김**(신규) | 기준시가 안분(A-1) |
| **부담부증여**(transferType) | 노출 | **숨김**(신규) ✅확정 | §159 자동 산정 — `acqPriceMode`보다 **우선 판정**(산정방식 무관) |

> ⚠️ **부담부증여는 `acqPriceMode` 축이 아니라 `transferType` 축**이다 — 4모드 중 무엇이 stale로 남아 있든
> 취득가액 칸을 숨긴다. 게이팅 판정 순서: `transferType === "burdened_gift"` **먼저**, 그 다음 `acqPriceMode`.

- 양도가액 칸은 **산정방식 무관 항상 노출** — 총양도가액은 늘 입력되므로.
- 현행은 salesCase가 `!useEstimatedAcquisition`에 걸려 **실거래가와 동일 취급** → 취득가액 칸이 잘못 노출 중.
- **감정가액=노출 확정 근거**: 엔진이 이미 실거래가와 동일 구조(`base = appraisalValue`, 총액 입력 → 잔액 성립, probe 2.4/1.6억). 실무상 감정평가서는 토지·건물을 **각각 평가**하므로 직접 입력이 안분보다 정확 — 안분 강제 시 있는 정확한 값을 버린다(§166⑥ 취지 위배).

**C-3 — 문구 정정**: 안내문 "비워둔 항목은 기준시가 비율로 자동 안분됩니다" → 실제와 다름(한쪽 입력 시 **잔액**).
placeholder `미입력 시 자동 안분` → **`미입력 시 나머지에서 자동 계산`**(§3.0 정책 준수).

**C-4 — 모드 전환 시 유령 값 차단**: `landSplitMode`를 "apportioned"로 되돌려도 입력값이 계속 엔진에 전달된다(§2-5).
→ **API 변환 게이트 채택**(`transfer-tax-api.ts:301-308`): `landSplitMode !== "actual"`이면 6필드 미전송.
  - onClick 클리어 대비 장점: **폼값 보존**(재토글 시 복원) — 기존 `bg*` 필드 보존 패턴과 동형.
  - `useEffect → store 미러링 금지` 정책과 무충돌(파생이 아니라 전송 게이트).

**C-5 — testid 부여**: `LandBuildingSplitSection`에 testid **0개** → 전 필드가 placeholder 셀렉터 의존.
C-3이 placeholder를 바꾸면 셀렉터 동시 파손. `data-testid="split-{land|building}-{transfer|acq|expense}-price"` 부여.

---

## 4. 케이스 매트릭스

토지 비율 60% / 총양도 10억 / 총취득 4억.

| # | 산정방식 | 양도 입력 | 취득 입력 | 기대 | 현행 |
|---|---|---|---|---|---|
| 1 | 실거래가 | — | — | 양도 6/4억, 취득 2.4/1.6억 | ✅ 동일 |
| 2 | 실거래가 | 토지 7억 | — | 양도 7/**3억**(잔액) | ✅ 동일 |
| 3 | 실거래가 | **건물 3억** | — | 양도 **7억**/3억, 합 10억 | 🔴 6/3=9억 |
| 4 | 실거래가 | — | **건물 1.5억** | 취득 **2.5억**/1.5억 | 🔴 입력 무시(2.4/1.6) |
| 5 | 실거래가 | 둘 다 (7/3억) | 둘 다 (2.5/1.5억) | 그대로 | ✅ 양도만 |
| 6 | 실거래가 | 토지 7억+건물 4억(합 11억) | — | **validate 차단** | 🔴 무검증 |
| 6-b | 실거래가 | **건물 12억**(총 10억) | — | **validate 차단**(잔액 −2억) | 🔴 무검증 |
| 6-c | 실거래가 | — | 토지 2.5억+건물 2억(합 4.5억) | **validate 차단**(취득) | 🔴 무검증 |
| 7 | 감정가액 | — | 토지 2.5억 | 취득 2.5/1.5억(잔액) | ✅ 동일 |
| 8 | 환산취득가 | — | (칸 숨김) | 부분별 환산 3/2억 | ✅ 동일 |
| **9** | **매매사례가액** | — | (칸 숨김) | 취득 **2.4/1.6억** | 🔴 **0/0** |
| **10** | **매매사례가액** | — | — | **개산공제 적용**(§163⑥) | 🔴 미적용 |
| **10-b** | **매매사례가액** | — | `landDirectExpenses` 입력 | **차감 안 됨**(본문=개산공제 단독, `helpers.ts` 정합) | 🔴 전액 차감 |
| 11 | 매매사례가액 | — | — | swap **미발화**(회귀 방어) | ✅ 동일 |
| 12 | 실거래가 (총 `expenses` 1억) | — | 자본적지출 **건물만 3천만** | 토지 **7천만**(잔액)/건물 3천만, 합 **1억** | 🔴 토지 6천만(비율)/건물 3천만 → 합 **9천만** ≠ 1억 |
| 12-b | 실거래가 (총 `expenses` 1억) | — | 자본적지출 **토지만 7천만** | 토지 7천만/건물 **3천만**(잔액) | ✅ 동일(잔액 경로가 이미 맞음 — 회귀 방어) |
| 13 | 실거래가 | — | — | 개산공제 0 (회귀 방어) | ✅ 동일 |
| 14 | 환산 + 자본적지출 명시 | — | — | swap 정상 발화(회귀 방어) | ✅ 동일 |
| 15 | UI: 매매사례가액 선택 | — | — | 취득가액 칸 **숨김** | 🔴 노출 |
| 16 | UI: 분리방식 "안분"으로 복귀 | 이전 입력 잔존 | — | 엔진 **미전송**(C-4) | 🔴 전송됨 |
| **17** | **부담부증여 + stale salesCase + 취득일 분리** | — | — | **split 결과 == 비-split 결과** (둘 다 S6 버그 상태 = 동형) | — (A-1 전 salesCase는 split에서 base 0이라 비교 불가) |

> 케이스 17은 **버그를 고정하는 게 아니라 "두 경로가 같음"을 고정**한다. S6가 별건으로 수정되면
> 양 경로가 함께 정상화되고 이 anchor는 그대로 통과한다(정합 축이 유지되므로).

**알려진 한계(문서화)**: API가 `parseAmount(...) || undefined`(`transfer-tax-api.ts:301-304`)라 **"0 입력"과 "미입력"이 구분 불가**.
0을 입력하면 미입력으로 취급된다. 단 잔액 규칙 하에서 반대쪽이 입력돼 있으면 결과가 자동 보정된다
(예: 총 10억·건물 10억 → 토지 = 0). 사전존재이며 ④ API 계약 변경이 필요해 **범위 밖**.

---

## 5. 실행 계획

**커밋 분리는 파일 경계 기준** — 파일이 겹치면 합친다(앞선 전례: `git add -p` 미지원으로 3→2 조정).
A(`transfer-tax-split-gain.ts`) / B(`transfer-tax-validate-asset.ts`) / C(UI 2파일) → **파일이 갈리므로 3분리 실현 가능**.
단 C 내부(C-0~C-5)는 같은 파일이라 **1커밋**.

```
[Pre-Do anchor] — RED 확인 필수
  P1. split-gain-salescase.anchor.test.ts — 케이스 9·10·10-b·11 (11은 GREEN 유지 = 회귀 방어)
  P2. split-gain-residual-symmetry.anchor.test.ts — 케이스 3·4·12
  P3. 영향 anchor 전수 목록화 (아래 §6) → 값 변동 예상 지점 사전 식별
  ※ rev.1의 A3(swap probe) 삭제 — 검증 대상 부재(§2-3 실측)

[Phase A — 엔진] (커밋 1)
  A-0 splitPair 지역 헬퍼 → A-1 salesCase base → A-2 usesEstOrAppraisal
  → A-4 양도(totalTransfer) → A-5 취득(실가·감정 한정) → A-6 자본적지출(explicitDirect 분리 주의)
  verify: P1·P2 GREEN + npx vitest run __tests__/tax-engine/transfer-tax/

[Phase B — validate] (커밋 2)
  B-1 합>총액 차단(양도·취득) · B-2 음수 잔액
  verify: 케이스 6·6-b·6-c + ⑧ 모순 없음

[Phase C — UI] (커밋 3)
  C-0 acqPriceMode → C-1 순서(게이트 구조 실측 선행) → C-2 4-way → C-3 문구 → C-4 API 게이트 → C-5 testid
  verify: RTL anchor + E2E + 브라우저 실측(Playwright)

[Phase D — 회귀]
  전체 test · baseline anchor · E2E(파이프 없이 exit code) · 코드 품질 정적 검토
```

## 6. 영향 anchor (Do 전 전수 확인 — rev.1의 "전수 확인" 공백 해소)

```bash
grep -rl "calcSplitGain\|splitDetail\|landAcquisitionDate" __tests__/tax-engine/transfer-tax/
```
**기지 대상**: `land-building-split.test.ts`(5케이스 — 전부 `isUnregistered: false`) ·
`acq-cost-swap-split.test.ts`(swap + 개산공제 단언) → **신규 anchor와 역할 중복 여부 사전 확인**.
Phase A가 세액을 바꾸므로 salesCase·자본적지출 조합 anchor는 값이 변한다.

## 7. 별건 분리 (본 계획 제외 — 후속 이슈로 기록)

| # | 항목 | 세액 영향 | 사유 |
|---|---|---|---|
| **S1** | **개산공제율 미등기 0.3%**(§104③·§163⑥) | 있음(과다공제) | **드리프트 아님 — 문서화된 미지원**. `general-building-valuation.ts:38-43` 주석이 "환산 경로는 등기 자산 전제(3% 고정)… route helper·validate wiring 필요"라 명시. 0.03 하드코딩이 split(`:125-126`)·PHD(`transfer-tax-pre-housing-disclosure.ts:137-138,220-223`)·겸용(`transfer-tax-mixed-use-helpers.ts:405-406,539-540`)·재개발(`redevelopment-housing-contribution.ts:141`·`redevelopment-land-contribution.ts:116`·`redevelopment-split.ts:169`)·상가(`commercial-building-valuation.ts:241`) **전반**. 정본은 `helpers.ts:307`·`multi-parcel-transfer.ts:308` **2곳뿐** → split만 고치면 경로 간 불일치 악화. **엔진 전반 "미등기 지원" 별건 감사 필요**. ⚠️ `calcPreHousingDisclosureGain`은 `isUnregistered`를 **인자로 받지 않음** → 시그니처 변경 수반 |
| **S2** | **공익수용 환산 min[] 특례**(집행기준 99-164-12) | **있음** | 비-split은 `applyExpropriationValuation`으로 환산 분모를 `min[공시지가, 보상가, 보상기초]`로 낮춤(`helpers.ts:311`). split은 **import조차 없음**(grep 0건) → `input.standardPriceAtTransfer` 그대로. 공익수용+환산+취득일 분리 시 **특례 소실 → 세금 과다**. salesCase와 원인·위치 무관 |
| **S3** | **swapApplied·necessaryExpenseMode 미반영** | 없음(표시만) | split은 swap 발화해도 `necessaryExpenseMode: usedEstimated ? "estimated_with_deduction" : "actual"`(`helpers.ts:294`)이라 `"swap_to_direct"`가 안 되고 `swapApplied`/`swapComparison` 미반환. 결과 화면(`TransferTaxResultView.tsx:82`·`:332`)이 이 값으로 §97② 설명 박스·라벨을 제어 → **세액은 맞는데 근거 설명이 안 보임**. 코드 주석(`helpers.ts:295`)이 "별도 PR" 자인 |
| **S4** | 결과 화면 개산공제 `× 3%` 하드코딩 | 없음(표시만) | S1 선행 필요. `PreHousingDisclosureDetailSection.tsx:163,169`·`RedevelopmentDetailCard.tsx:349,411` 등 |
| **S5** | `redevelopment-land-contribution.ts:116` 개산공제 | 미판정 | 재개발 토지분담금 전용 경로 — S1과 함께 판단 |
| **S6** 🔴 | **부담부증여 + stale 산정방식 → §159 안분 취득가액 무시** | **있음(과소납부·큼)** | **사전존재·비-split·split 공통.** 아래 상세 |

### S6 상세 (본 계획 조사 중 신규 발견 — probe 실측)

**재현**: 취득원인 매매 → 취득가액 산정방식 **매매사례가액**(또는 감정가액) 선택 → 양도정보에서 **부담부증여** 선택.
부담부증여 UI는 산정방식 블록을 숨기지만 **폼 상태는 보존**한다(`CompanionAcqPurchaseBlock.tsx:338-341` 주석 명시)
→ `isSalesCaseAcquisition`/`isAppraisalAcquisition`이 **살아남는다**.

**전파 경로 (가드 부재 3중)**:
1. API에 부담부증여 가드 없음 — `transfer-tax-api.ts:82` `isSalesCase = primary.isSalesCaseAcquisition === true`,
   `:275` `similarSalesValue: isSalesCase ? ... : undefined` → `acquisitionMethod: "salesCase"` + 값이 그대로 전달
2. 엔진 스텝이 `acquisitionMethod`를 **리셋하지 않음** — `transfer-tax-burdened-gift-step.ts:72-84`는
   `transferPrice`·`acquisitionPrice`·`useEstimatedAcquisition`만 덮어씀
3. `calcTransferGain`이 stale method 분기 진입 — `helpers.ts:343` `similarSalesValue ?? acquisitionPrice` → **추계액 우선**

**probe 실측** (총양도 10억 / §159 안분 취득 4억 / 추계액 9억):

| 상황 | 양도차익 | 판정 |
|---|---|---|
| 기준선(method 없음) | **600,000,000** | ✅ §159 4억 정상 차감 |
| stale `salesCase` + `similarSalesValue` 9억 | **99,970,000** | 🔴 §159 4억 무시, 9억 사용 |
| stale `appraisal` + `appraisalValue` 9억 | **99,970,000** | 🔴 동일 |

→ 양도차익 6억 → 1억 미만으로 **폭락**(과소납부). salesCase·appraisal **양쪽** 발생.

**수정 방향(별건)**: 근본은 ②(엔진 스텝이 `acquisitionMethod`를 "actual"로 정규화) 또는 ①(API 가드).
**split 쪽에만 가드를 넣으면 새 드리프트**가 되므로 A-1은 손대지 않는다(§3-A A-1 주석).

## 8. 미해결 / 확인 필요

- `landSplitMode`가 엔진에서 죽은 모드인 점(§2-5) — C-4가 API 게이트로 활용하나, 엔진이 모드를 읽게 하는 편이 정합적인지는 별도 판단.

### ✅ 해소된 항목 (2026-07-16 실측)

| 항목 | 결과 |
|---|---|
| ~~C-1 게이트 구조 실측~~ | **완료** — 재개발 무해(`isSplitable=false`로 동반 차단) / **부담부증여 문제 조합 실재** → §3-C C-1에 반영, 결정 사항으로 승격 |
| ~~A-6 `explicitDirect` 분리~~ | **완료 — 분리 불필요**. 호출부(`:159`·`:165`)가 이미 입력 원본을 직접 참조. `splitPair`는 계산값 산출부만 교체 → 무영향. §3-A A-6 주석 정정 |
| ~~A-1 부담부증여 회귀 우려~~ | **완료 — A-1 무관**. 비-split이 **이미 동일 동작**(probe: 양도차익 6억 → 99,970,000) → 사전존재 버그(**S6**). A-1은 가드 없이 비-split 정합 유지 |
