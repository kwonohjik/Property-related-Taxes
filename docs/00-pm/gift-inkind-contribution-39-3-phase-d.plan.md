# §39의3 현물출자 Phase D — **주권상장법인 Min/Max 단서** 구현 계획서

> 모(母)계획: [`gift-inkind-contribution-39-3.plan.md`](gift-inkind-contribution-39-3.plan.md) §7 Phase D · §11 SCOPE-OUT
> 선행: Phase A~C ✅(PR#374) · Phase B ✅(PR#988 — 고가 multi-수증자 선택 prefill)
> 작성 기준: **추정 금지** — 법문은 KoreanLaw MCP 본문, 코드는 file:line 실측. 미검증은 "확인 필요" 명시.

---

## 0. 한 줄 요약 / 결론 먼저

「상증령」§29의3①이 준용하는 **§29②1호가목 단서(저가 → Min)·§29②3호나목 단서(고가 → Max)** 가 엔진에 **전혀 없다**. 현행은 상장·비상장 구분 없이 항상 **이론값(가중평균 산식)** 을 쓴다.

그런데 실측 결과 이 계획이 처음 상정한 것보다 **범위가 넓다**:

| 발견 | 실측 근거 | 성격 |
|---|---|---|
| ⓐ §39의3 준용 단서 미구현 | `contribution-in-kind.ts:40·127` — `computeWeightedPerShare` 결과를 그대로 사용 | **본 계획 대상** |
| ⓑ **본칙 §39 증자도 미구현** | `capital-increase.ts:26·70` 동일 · cap-table 경로 `capital-increase-allocation.ts:39`도 동일 · `CapitalIncreaseInput`(`gift-deemed-input-types.ts:174~188`)에 `isListed` **없음** | 🔴 **결정 B 필요** |
| ⓒ **일반공모 배정분 제외 미구현** | §29의3①1·2호 괄호(자본시장법 §165의6①3호) — 코드에 해당 차감 0건 | 🔴 **결정 C 필요** |
| ⓓ 선례 2건이 이미 같은 패턴을 구현 | `convertible-bond.ts:19~31`(§30⑤1 Min/Max) · `merger-valuation.ts:42`(§28⑤ Min) | ✅ **재사용** |

ⓓ 덕분에 **새 해석은 하나도 필요 없다** — 기존 컨벤션(`isListed` + `listedMarketAvg` + `Math.min/max`)을 그대로 따르면 된다.

---

## 1. 법령 실측 — 본문 인용 (KoreanLaw MCP, 조회일 2026-08-02)

### 1-1. 「상속세 및 증여세법 시행령」 제29조제2항 — 단서 2개 (본칙)

> **제1호가목**(저가 기준가액): 「다음 산식에 의하여 계산한 1주당 가액. **다만, 주권상장법인등의 경우로서 증자후의 1주당 평가가액이 다음 산식에 의하여 계산한 1주당 가액보다 적은 경우에는 당해 가액**」
>
> **제3호나목**(고가 차감가액): 「다음 산식에 의하여 계산한 1주당 가액. **다만, 주권상장법인등의 경우로서 증자후의 1주당 평가가액이 다음 산식에 의하여 계산한 1주당 가액보다 큰 경우에는 당해 가액**」

⇒ **저가 = Min[실제 평가, 이론값] · 고가 = Max[실제 평가, 이론값]**. 방향이 **비대칭**인 이유는 두 호에서 그 값이 놓인 자리가 다르기 때문이다:

| | 산식 | 단서가 붙는 항 | 단서 방향 | 효과 |
|---|---|---|---|---|
| 저가 §29②1 | **가목** − 나목(인수가) | 가목(평가액) = **피감수** | **적은** 쪽 | 이익 ↓ |
| 고가 §29②3 | 가목(인수가) − **나목** | 나목(평가액) = **감수** | **큰** 쪽 | 이익 ↓ |

**둘 다 「실제 시세가 이론값보다 납세자에게 불리한 방향일 때 실제 시세를 쓴다」가 아니라, 둘 다 이익을 줄이는 방향**이다. 방향을 뒤집으면 과다과세가 되므로 anchor로 양방향 동결한다.

### 1-2. 「상증령」 제29조의3제1항 — 준용 범위 (본 계획의 근거 조문)

> **1호**(저가): 「**제29조제2항제1호가목을 준용하여** 계산한 가액에서 같은 호 나목 가액을 차감한 가액에 현물출자자가 배정(**「자본시장과 금융투자업에 관한 법률」에 따른 주권상장법인이 같은 법 제165조의6제1항제3호에 따른 방식으로 배정하는 경우는 제외한다**)받은 신주수를 곱하여 … 이 경우 제29조제2항제1호가목 중 "증자"는 각각 이를 "**현물출자**"로 본다.」
>
> **2호**(고가): 「제29조제2항제3호가목의 가액에서 **같은 호 나목을 준용하여** 계산한 가액을 차감한 가액에 현물출자자가 인수(**… 제165조의6제1항제3호에 따른 방식으로 배정받은 주식을 제외한다**)한 신주수와 … 지분비율을 각각 곱하여 … 이 경우 제29조제2항제3호나목 중 "증자"는 각각 이를 "**현물출자**"로 본다.」

**세 가지가 동시에 확정된다**:
1. 준용 대상이 **「가목」·「나목」 통째**다 — **단서가 준용에 포함**된다(본문만 준용한다는 문구 없음).
2. 「"증자"는 "현물출자"로 본다」 ⇒ 단서의 「**증자후**의 1주당 평가가액」 = 「**현물출자 후**의 1주당 평가가액」.
3. **일반공모 배정분은 곱하는 신주수에서 제외**된다 (ⓒ).

> ⚠️ **2호의 미세 비대칭**: 「제29조제2항제3호**가목의 가액**」은 *준용* 표현 없이 그대로 쓰고, **나목만** "준용하여 계산"이다. 3호가목 = 「신주 1주당 인수가액」(산식·단서 없음)이라 준용 문구가 불필요했을 뿐이며, 결과에 영향 없다.

### 1-3. 「상증령」 제29조의3제2항 — 고가 기준금액의 **분모가 연쇄로 바뀐다**

> 「제29조제2항제3호가목을 준용하여 계산한 가액에서 **같은 호 나목을 준용하여 계산한 가액**을 차감한 금액이 **같은 호 나목을 준용하여 계산한 가액의 100분의 30 이상**이거나 그 이익이 3억원 이상인 경우에 한정」

30% 게이트의 **분모도 「나목을 준용하여 계산한 가액」** = **Max 단서 적용 후 값**이다. ⇒ Max 도입은 이익만 줄이는 게 아니라 **과세 여부 판정 자체를 뒤집을 수 있다**(§7 anchor D-5로 동결).

현행 `contribution-in-kind.ts:131` `ratioGateMet = perShareGain >= applyRate(perShareAfter, 0.3)` 는 분모가 `perShareAfter`(나목 값)이라 **구조는 이미 맞다** — `perShareAfter`만 Max 적용값으로 바뀌면 자동 정합.

### 1-4. 「상증법」 제39조의3제1항 — 평가기준일

> 「현물출자에 의하여 … 이익을 얻은 경우에는 **현물출자 납입일을 증여일로 하여** …」

⇒ 「현물출자 후의 1주당 평가가액」의 평가기준일 = **현물출자 납입일**. (§29①의 권리락일 규정은 「법 제39조제1항」 대상이라 §39의3에 적용되지 않는다.)

### 1-5. 「상증법」 제63조제1항제1호가목 — "실제 평가"의 정체

> 「… 상장주식은 **평가기준일 이전ㆍ이후 각 2개월** 동안 공표된 매일의 … 최종 시세가액(거래실적 유무를 따지지 아니한다)의 **평균액** …」

「상증령」§52의2②: 평가기준일 **이전·이후에 증자·합병 등의 사유가 발생**하면 그 기간을 단축한다(1~3호).

> ⚠️ **현물출자가 §52의2②의 「증자ㆍ합병 등의 사유」인지는 본문에 명문이 없다.** 현물출자는 신주 발행을 수반하므로 실질상 증자에 해당한다고 볼 여지가 크나 **확인 필요**. → **엔진은 평균액을 계산하지 않고 caller가 주입**하므로(§4 경계) 본 계획의 판정 대상이 아니다. UI hint에 §52의2 단축 가능성만 안내한다.

### 1-6. 「자본시장과 금융투자업에 관한 법률」 제165조의6제1항제3호 — 제외 대상 (ⓒ)

> 「3. 제1호 외의 방법으로 **불특정 다수인**(해당 주권상장법인의 주식을 소유한 자를 포함한다)에게 신주인수의 청약을 할 기회를 부여하고 이에 따라 청약을 한 자에 대하여 신주를 배정하는 방식」

= **일반공모증자**(1호 = 주주배정, 2호 = 제3자배정). ⇒ 주권상장법인이 **일반공모** 방식으로 배정한 신주는 §39의3 이익 산정의 곱셈 인자(배정·인수 신주수)에서 **제외**한다.

---

## 2. 현행 코드 실측 (file:line)

| 위치 | 현행 | Phase D 영향 |
|---|---|---|
| `contribution-in-kind.ts:40` | `perShareAfter = computeWeightedPerShare(...)` — 단서 없음 | 저가 Min 삽입 |
| `contribution-in-kind.ts:127` | 동상 | 고가 Max 삽입 |
| `contribution-in-kind.ts:43` | `gross = safeMultiply(perShareGain, allocatedShares)` | ⓒ 공모분 차감 |
| `contribution-in-kind.ts:129` | `base = safeMultiply(perShareGain, allocatedShares)` | ⓒ 동상 |
| `contribution-in-kind.ts:131` | 30% 게이트 분모 = `perShareAfter` | **자동 정합**(§1-3) |
| `gift-deemed-input-types.ts:261~278` | `ContributionInput` — `isListed` 없음 | 필드 3개 신설 |
| `capital-helpers.ts:6~18` | `computeWeightedPerShare` — 순수 가중평균 | 공용 bound 헬퍼 이웃에 신설 |
| **선례** `convertible-bond.ts:19~31` | `creditedPerShareValue(input, "min"\|"max")` — `isListed && avg > 0` 게이트 후 `Math.min/max` | ⭐ **그대로 승계** |
| **선례** `merger-valuation.ts:42` | `isListed && (listedPostAvgPrice ?? 0) > 0 ? Math.min(...) : simpleAvg` | 동상 |
| **선례 UI** `capital-forms.tsx:623~631` | `ToggleCard tone="emerald"` + 펼침 `CurrencyInput` "전환일 전후 2개월 종가평균" | ⭐ **그대로 승계** |
| 🔴 `capital-increase.ts:26·70` | §39 본칙(sub-case 경로)도 단서 **없음** | **결정 B** |
| 🔴 `capital-increase-allocation.ts:39` | §39 **cap-table(equity-delta) 경로**도 `computeWeightedPerShare` 직접 사용 — 단서 없음. `:45` 사후평가·`:59` 30% 게이트가 모두 이 값에 의존 | **결정 B(주의)** |

**3-state 게이트 규약(선례 공통)**: `isListed === true` **이면서** 평균액 > 0일 때만 단서 발동. 상장이지만 평균액 미입력이면 **이론값 유지**(자동 안분 fallback 금지 — `feedback_no_silent_apportion_fallback`와 같은 취지). 본 계획도 동일.

---

## 3. ⚠️ 착수 전 사용자 결정 3건

### 결정 A — 공용 헬퍼로 뽑을 것인가 (권고: **뽑는다**)

| 안 | 내용 | 장 | 단 |
|---|---|---|---|
| **A-1 (권고)** | `capital-helpers.ts`에 `applyListedPerShareBound(theoretical, {isListed, listedMarketAvg}, "min"\|"max")` 신설 → **현물출자 + 전환사채**가 공유 | `single-source-engine-helper` 준수. 네 번째 소비처(§39·§28) 확장 비용 0 | CB 이관 시 회귀 위험 → CB anchor 전건 재실행으로 방어 |
| A-2 | 현물출자 로컬 구현 | CB 무변경 | 같은 규칙 **3번째** 중복(§28·§30·§39의3) — 드리프트 온상 |

> A-1을 택해도 `merger-valuation.ts`(§28⑤)는 **이관하지 않는다** — 그쪽 두 번째 인자는 「합병 후 단순평균액」이라 산식이 다르고, Min만 쓴다. 무리한 통합은 과추상.

### 결정 B — 🔴 **본칙 §39 증자도 함께 고칠 것인가** (권고: **함께**)

§29②1가·3나 단서는 **§39 증자의 본칙**이고 §39의3은 그것을 준용할 뿐이다. **준용 쪽만 구현하면 본칙이 빠진 역전 상태**가 된다.

| 안 | 범위 | 추가 비용 | 리스크 |
|---|---|---|---|
| **B-1 (권고)** | §39의3 **+ §39 sub-case 경로** | 헬퍼는 공유라 +0 · `CapitalIncreaseInput` 필드 2개 · 폼 필드 2개 · anchor 2건 | `capital-forms.tsx` 684줄 → ≈700 (800 트리거 미만, 안전) |
| B-2 | §39의3만 | 최소 | 「같은 규칙 쓰는 다른 경로」를 알고도 남겨 둠 — `feedback_sibling_path_already_implements_rule`의 정반대 |

> ⚠️ **§39 cap-table 경로는 B-1에도 넣지 말 것을 권고**한다(실측 완료). `capital-increase-allocation.ts:39`도 같은 `computeWeightedPerShare`를 쓰지만, 그 경로는 **equity-delta 모델**(주주별 사후평가 `:45` − 사전 → 이익)이라 저가/고가 방향이 **주주마다 갈린다**. 단서는 「제1호가목(min)」·「제3호나목(max)」처럼 **호별로 방향이 고정**돼 있어, 한 `perShareAfter`에 min·max 중 하나만 적용하면 반대 방향 주주가 왜곡된다. **법령상 정답 미판정 ⇒ 별건 조사 후 착수**(`feedback_unverified_authority_blocks_tax_change`).

### 결정 C — 🔴 **일반공모 배정분 제외(ⓒ)를 Phase D에 넣을 것인가** (권고: **넣는다**)

§29의3①1·2호 괄호는 **주권상장법인 전용**이라 `isListed` 토글 아래에 자연스럽게 붙는다. 별개 PR로 빼면 같은 토글을 두 번 건드리게 된다.

- 필요 입력 1개: `publicOfferingShares?: number` (일반공모 방식 배정 신주수)
- 산식: 곱셈 인자 = `max(0, allocatedShares − publicOfferingShares)`
- ⚠️ **비상장에는 적용 불가**(조문이 「주권상장법인이 … 방식으로 배정하는 경우」로 한정) → `isListed` 게이트 필수.

---

## 4. 경계 — 엔진은 시세를 계산하지 않는다 (모계획 §11 유지)

엔진은 `listedMarketAvg`(현물출자 납입일 **전후 각 2개월** 종가평균)를 **주입받는다**. §63①1가 평균·§52의2 기간단축·거래정지 종목 제외(§52의2③)는 caller 책임 — 모계획 SCOPE-OUT 「§60·§63 보충적 평가 엔진 내 계산(현행대로 caller가 평가값 주입)」을 그대로 승계한다.

> 🟡 **후속 가능성(Phase D-2, 본 계획 범위 외)**: `lib/kiwoom/`에 종목 시세 자동조회 인프라가 이미 있고 「시점 4종」을 지원한다(memory `project_kiwoom_openapi_integration`). 「납입일 전후 2개월 평균」이 그 4종에 포함되는지는 **미실측** — 포함된다면 상속·증여 주식평가와 같은 자동조회 버튼을 붙일 수 있다. **확인 필요**.

---

## 5. 설계

### 5-1. 공용 헬퍼 (결정 A-1 전제)

```ts
// lib/tax-engine/gift-deemed/capital-helpers.ts
/**
 * 주권상장법인 1주당 가액 단서 — 「상증령」§29②1가 단서(min) · §29②3나 단서(max).
 * §29의3①(현물출자)·§30⑤1(전환사채)이 이를 준용한다.
 *   min: 실제 평가가 이론값보다 **적으면** 실제 평가  (저가 — 피감수 축소)
 *   max: 실제 평가가 이론값보다 **크면**   실제 평가  (고가 — 감수 확대)
 * 두 방향 모두 **이익을 줄이는 쪽**이다(방향 반전 = 과다과세).
 * 상장이라도 평균액 미입력이면 이론값 유지 — 자동 추정 금지.
 */
export function applyListedPerShareBound(
  theoretical: number,
  opts: { isListed?: boolean; listedMarketAvg?: number },
  pick: "min" | "max",
): number {
  const avg = opts.listedMarketAvg ?? 0;
  if (!opts.isListed || avg <= 0) return theoretical;
  return pick === "min" ? Math.min(avg, theoretical) : Math.max(avg, theoretical);
}
```

### 5-2. 엔진 적용 지점

```ts
// contributionLow (저가 ①1호)
const theoretical = computeWeightedPerShare(preContribPrice, preContribShares, newSharePrice, contributedShares);
const perShareAfter = applyListedPerShareBound(theoretical, input, "min");   // §29②1가 단서 준용
const perShareGain = perShareAfter - newSharePrice;
const countedShares = Math.max(0, allocatedShares - (input.publicOfferingShares ?? 0)); // ⓒ 상장 게이트는 API 변환에서
const gross = perShareGain > 0 ? safeMultiply(perShareGain, countedShares) : 0;

// contributionHigh (고가 ①2호)
const perShareAfter = applyListedPerShareBound(theoretical, input, "max");   // §29②3나 단서 준용
const perShareGain = newSharePrice - perShareAfter;
// 30% 게이트 분모는 perShareAfter 그대로 — §29의3②가 「같은 호 나목」을 가리키므로 자동 정합
```

**echo 필드**(`echo-field-pattern` — 산식 불변·노출만): `listedBoundApplied?: boolean` + `theoreticalPerShare?: number`. 결과뷰에 「이론값 15,000 → 상장 평가 13,000 적용(§29②1가 단서)」을 보여 주지 않으면 사용자가 −200,000,000 차이의 원인을 알 수 없다.

### 5-3. 입력 타입

```ts
export interface ContributionInput {
  // … 기존 …
  isListed?: boolean;          // 주권상장법인등 — §29②1가·3나 단서(§29의3① 준용)
  listedMarketAvg?: number;    // 현물출자 납입일 전후 2개월 종가평균 (§63①1가) — 상장 Min/Max용
  publicOfferingShares?: number; // 일반공모(자본시장법 §165의6①3) 배정 신주수 — 곱셈 인자에서 제외
}
```

---

## 6. 14 동기화 지점

| # | 지점 | 파일 | 변경 |
|---|---|---|---|
| ① 폼 | `deemed-form-state.ts` | `conIsListed: boolean` · `conListedMarketAvg: string` · `conPublicOfferingShares: string` | 신규 |
| ② initial | 동상 | `false` · `""` · `""` | 신규 |
| ③ normalize | — | `DeemedGiftCalculator`는 `useState(INITIAL_DEEMED)` — **sessionStorage persist 없음** ⇒ **N/A**(Phase B에서 실측) | — |
| ④ API 변환 | `gift-deemed-api.ts:259~284` | `isListed` · `listedMarketAvg`(`conIsListed`일 때만) · `publicOfferingShares`(동상) — CB `:329~330` 패턴 승계 | 신규 |
| ⑤ UI 위젯 | `contribution-form.tsx` | `ToggleCard tone="emerald"` + 펼침 2필드 (`capital-forms.tsx:623~631` 승계) | 신규 |
| ⑥ 사이드바 | — | 의제 단일값 ⇒ N/A | — |
| ⑦ 결과 카드 | `DeemedGiftResultView.tsx` | 단서 적용 시 「이론값 → 적용값」 echo 행 + 근거 배지 | 신규 |
| ⑧ Validation | `gift-deemed-validate.ts:171~190` | `conIsListed` ON인데 평균액 ≤ 0 → **차단**(UI 통과 ↔ 엔진 무시 모순 방지) · 공모주식수 > 배정신주수 → 차단 | 신규 |
| ⑨ 타입 | `gift-deemed-input-types.ts:261~278` | 입력 3필드 + 결과 echo 2필드 | 신규 |
| ⑩ breakdown | `contribution-in-kind.ts` | 「이론값」·「상장 평가액(단서 적용)」 행 | 신규 |
| ⑪ 결과뷰 렌더 | ⑦과 동일 | — | — |
| ⑫ prefill | — | 금액만 바뀜(구조 불변) ⇒ **N/A** | — |
| ⑬ Zod | `gift-deemed-input.ts:224~236` | `isListed`/`listedMarketAvg`/`publicOfferingShares` + superRefine(⑧과 동일 규칙) | 신규 |
| ⑭ Route | — | 시그니처 불변 ⇒ N/A | — |

> ⚠️ **⑧⑬ 동기화 필수**(`feedback_validation_sync_8th_point`): 「상장 ON + 평균액 미입력」을 엔진은 **조용히 이론값으로 통과**시킨다(§2 3-state 규약). validate가 막지 않으면 사용자는 단서가 적용된 줄 안다 → **차단이 정답**.

---

## 7. Pre-Do anchor (`pre-do-anchor-verification` — Do 진입 게이트)

신설 `__tests__/tax-engine/gift-deemed/contribution-listed-bound.anchor.test.ts`. 교재 계산사례가 전부 비상장이라 **법문 산식으로 자기일관 데이터를 유도**한다(부록 A).

| ID | 시나리오 | 입력 | 기대 | 노리는 것 |
|---|---|---|---|---|
| **D-1** | 저가 Min **발동** | 전평가 20,000·전주식 100,000·인수가 10,000·출자주식 100,000·배정 100,000 / 평균 **13,000** | 이론 15,000 → **13,000** · gross **300,000,000** | 저가 단서 방향 |
| **D-2** | 저가 Min **미발동** | 동상 / 평균 **17,000** | 이론 15,000 유지 · gross **500,000,000** | 방향 반전 차단 |
| **D-3** | 고가 Max **발동** | 전평가 5,000·전주식 100,000·인수가 20,000·출자 50,000·인수 50,000 / 평균 **12,000** · roster B 35,000·C 10,000 | 이론 10,000 → **12,000** · base **400,000,000** · B **140,000,000**·C **40,000,000**·합 **180,000,000** | 고가 단서 방향 |
| **D-4** | 고가 Max **미발동** | 동상 / 평균 **8,000** | TBC-2와 동일 **225,000,000** | 기존 anchor 불변 |
| **D-5** ⭐ | Max가 **30% 게이트를 뒤집는다** | 동상 / 평균 **16,000** | 차액 4,000 < 16,000×30%=4,800 · **전원 비과세 0** | §29의3② 분모 연쇄(§1-3) |
| **D-6** | 상장 ON·평균 **미입력** | `isListed:true`·`listedMarketAvg` 없음 | **이론값 유지**(자동 추정 금지) | 3-state 규약 |
| **D-7** | **비상장**은 평균액 무시 | `isListed:false`·평균 13,000 | 이론 15,000 유지 | 게이트 오발동 차단 |
| **D-8** | ⓒ 일반공모 제외 | D-1 + 공모 40,000 | 곱셈 인자 **60,000** · gross **180,000,000** | 자본시장법 §165의6①3 |
| **D-9** | 회귀 — 기존 TBC 6건 | 무변경 입력 | **전건 불변** | 미사용 경로 보존 |

**게이트**: D-1·D-3·D-5·D-8은 현행에서 **RED**여야 정상. GREEN이면 어딘가 이미 구현돼 있다는 뜻이므로 **설계 재검토**(§2 실측 오류 의심).

### 부록 A — 자기일관 산출 근거 (수기 검산)

- D-1: 이론 = (20,000×100,000 + 10,000×100,000) ÷ 200,000 = **15,000**. 13,000 < 15,000 ⇒ 채택 13,000. gross = (13,000−10,000)×100,000 = **300,000,000**.
- D-3: 이론 = (5,000×100,000 + 20,000×50,000) ÷ 150,000 = **10,000**. 12,000 > 10,000 ⇒ 채택 12,000. base = (20,000−12,000)×50,000 = **400,000,000**. 게이트: 8,000 ≥ 12,000×30%=3,600 ✓. B = 400,000,000×35,000/100,000 = **140,000,000** · C = **40,000,000**.
- D-8: D-1과 동일하게 채택 13,000 · 1주당 이익 3,000. 곱셈 인자 = 100,000 − 40,000 = **60,000**. gross = 3,000×60,000 = **180,000,000**(D-1의 300,000,000 대비 −120,000,000).
- D-5: 16,000 > 10,000 ⇒ 채택 16,000. 차액 = 4,000. 게이트 30%: 16,000×0.3 = **4,800** > 4,000 ✗. 3억 게이트: base = 4,000×50,000 = 200,000,000 → B raw 70,000,000 · C raw 20,000,000 **둘 다 3억 미만** ✗ ⇒ **전원 0**.

---

## 8. Phase 분해 (Do는 시퀀셜)

| # | 작업 | 검증 |
|---|---|---|
| **D-0** | 결정 A·B·C 확정 | 사용자 승인 |
| **D-1** | Pre-Do anchor 9건 작성 → **RED 확인** | D-1·3·5·8 RED |
| **D-2** | `applyListedPerShareBound` 신설 (+ A-1 시 CB 이관) | CB anchor 전건 불변 |
| **D-3** | `ContributionInput` 3필드 + 엔진 2분기 + echo 2필드 | D-1~D-9 GREEN |
| **D-4** | ⑬ Zod + ⑧ validate (동일 규칙) | superRefine probe |
| **D-5** | ① ② ④ ⑤ ⑦ ⑩ UI/API 배선 | `npx tsc --noEmit` 0 |
| **D-6** | (결정 B-1 시) §39 증자 **sub-case 경로만** 동일 적용 + anchor 2건 (cap-table 경로 제외 — §3 결정 B 주석) | 증자 anchor 전건 불변 |
| **D-7** | E2E 1건 — 상장 토글 → 평균액 입력 → 결과 echo 확인 | `gift-deemed-contribution-roster.spec.ts` 확장 |
| **D-8** | 전체 회귀 + 모계획 §7 Phase D·§11 환류 | `npm test` 실패 0 |

---

## 9. 리스크

| 리스크 | 대응 |
|---|---|
| **단서 방향 반전**(저가에 Max·고가에 Min) = 과다과세 | D-1~D-4로 **양방향 동결**. §1-1 표를 코드 주석에 그대로 인용 |
| 30% 게이트 분모 연쇄 누락 | D-5가 유일 방어 — **분모를 `perShareAfter`(단서 적용 후)로 유지**해야 하며 이론값으로 되돌리면 안 됨 |
| A-1 CB 이관 회귀 | `convertible-bond-*.test.ts` 전건 + `capital-*` 전건 재실행을 D-2 완료 조건으로 |
| 「상장 ON·평균 미입력」 무음 통과 | ⑧⑬ 차단 필수(§6 경고) |
| ⓒ를 비상장에 오적용 | `isListed` 게이트 — D-8과 별도로 비상장 회귀 1건 추가 권장 |
| §52의2 기간단축 오해 | 엔진 범위 외(§4). UI hint로만 안내, 계산 금지 |
| 「현물출자가 §52의2② 사유인가」 미검증 | **확인 필요**로 명시 — 판정이 필요해지면 그때 별건 조사(`feedback_unverified_authority_blocks_tax_change`) |
| ESLint --fix named export 제거 | 신규 import 1라인 1named |

**완료 정의**: D-1~D-9 GREEN · 기존 TBC 6건 + CB/증자 anchor 전건 불변 · `tsc --noEmit` 0 · lint 0 errors · 전체 회귀 실패 0 · 결과뷰 echo 표시 · E2E 확인.

---

## 10. 범위 외 (SCOPE-OUT)

- **§63①1가 2개월 평균·§52의2 기간단축·거래정지 종목 제외의 엔진 내 계산** — caller 주입 유지(§4).
- **키움 자동조회 연동**(Phase D-2 후속) — 「납입일 전후 2개월 평균」이 기존 시점 4종에 포함되는지 **미실측**.
- **§28⑤ 합병 Min의 공용 헬퍼 이관** — 두 번째 인자 산식이 달라 통합 부적합(결정 A 주석).
- **🟠 §39 cap-table(equity-delta) 경로의 단서 적용** — 방향이 주주별로 갈려 법령상 정답 미판정(§3 결정 B 주석). **별건 조사 선행**.
- **🟠 고가 roster 행 라벨 오기**(`contribution-form.tsx:67` "인수 신주수" → "현물출자 전 보유주식수") — Phase B에서 발견, 모계획 §10에 기록. **별건**이며 Phase D와 무관하나 같은 파일을 여는 김에 처리 여부 판단 가능.
