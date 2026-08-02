# §39의3 현물출자 Phase D — **주권상장법인 Min/Max 단서** 구현 계획서 **v1.3 ✅D·D-2 완료**

> 모(母)계획: [`gift-inkind-contribution-39-3.plan.md`](gift-inkind-contribution-39-3.plan.md) §7 Phase D · §11 SCOPE-OUT
> 선행: Phase A~C ✅(PR#374) · Phase B ✅(PR#988 — 고가 multi-수증자 선택 prefill)
> 작성 기준: **추정 금지** — 법문은 KoreanLaw MCP 본문, 코드는 file:line 실측. 미검증은 "확인 필요" 명시.
>
> **v1.3 D-2 환류(2026-08-02)**: **키움 자동조회 연동 완료**. §4의 「확인 필요」 해소 — `/api/kiwoom/valuation-2month`가 **이미 §63①1가 전후 2개월 평균**을 계산하고 §52의2 단축 override까지 지원한다(시점 4종 중 3번째). 신규 API·엔진 변경 **0** — `KiwoomValuationAutoFetchButton` 배선만. 평가기준일이 세목별로 달라 **전환주식 발행 시점만 별도 DateInput**(`csIssuanceDate`). 800줄 초과(829)로 `capital-forms.tsx` → `capital-forms-shared.tsx`(79) + `convertible-stock-form.tsx`(203) 분할, 잔여 571.
>
> **v1.2 구현 환류(2026-08-02)**: 전 Phase 완료. anchor 14건 GREEN(D-1~D-13 + 회귀 2케이스) · E2E 4/4 · 신규 7 폼필드가 폼·validate·UI·API 전 계층 도달 자가검증 완료. **계획 대비 이탈 2건**: ⓐ `capital-forms.tsx` 728줄(예상 704 — 750 미만이라 분리 불요) ⓑ 법령 상수 3개 신설(`GIFT.CONTRIBUTION_LISTED_LOW/HIGH`·`CONTRIBUTION_PUBLIC_OFFERING` — 문자열 리터럴 금지 정책상 필요, v1.1에 누락돼 있었음).
>
> **v1.1 재검토 반영(2026-08-02)**: 결정 A·B·C 확정(§3) · 🆕 **5번째 소비처 전환주식 §39①3호 발견**(§2) · 🔧 ⓒ 상장 게이트를 **엔진 안으로**(dual-truth 제거) · 🔧 result echo 2필드 **삭제**(breakdown 행으로 충분) · 🆕 §39 증자는 **평가기준일이 다름**(권리락일) · 🆕 §29③ 공모 제외와 **혼동 금지** 경고 · anchor 9 → **13건**.

---

## 0. 한 줄 요약 / 결론 먼저

「상증령」§29의3①이 준용하는 **§29②1호가목 단서(저가 → Min)·§29②3호나목 단서(고가 → Max)** 가 엔진에 **전혀 없다**. 현행은 상장·비상장 구분 없이 항상 **이론값(가중평균 산식)** 을 쓴다.

실측 결과 범위가 처음 상정보다 넓다:

| 발견 | 실측 근거 | 결론 |
|---|---|---|
| ⓐ §39의3 준용 단서 미구현 | `contribution-in-kind.ts:40·127` | **대상** |
| ⓑ **본칙 §39 증자 sub-case도 미구현** | `capital-increase.ts:26·70` · `CapitalIncreaseInput`(`gift-deemed-input-types.ts:174~188`)에 `isListed` 없음 | **대상**(결정 B-1) |
| ⓑ' 🆕 **전환주식 §39①3호가 5번째 소비처** | `convertible-stock.ts:12~13`이 `calcCapitalIncreaseGift`에 **위임** | **엔진 자동 커버** + UI 1곳 |
| ⓑ'' §39 **cap-table** 경로 | `capital-increase-allocation.ts:39` — equity-delta 모델 | 🛑 **제외**(방향 미판정, §3-B) |
| ⓒ **일반공모 배정분 제외 미구현** | §29의3①1·2호 괄호(자본시장법 §165의6①3) · 코드 0건 | **대상**(결정 C) |
| ⓓ 선례 2건이 이미 같은 패턴 | `convertible-bond.ts:19~31`(§30⑤1) · `merger-valuation.ts:42`(§28⑤) | ✅ **컨벤션 승계** |

ⓓ 덕분에 **새 법 해석은 하나도 필요 없다** — 기존 `isListed` + `listedMarketAvg` + `Math.min/max` 컨벤션을 그대로 따른다.

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

**두 방향 모두 이익을 줄인다.** 뒤집으면 과다과세이므로 anchor로 양방향 동결한다.

### 1-2. 「상증령」 제29조의3제1항 — 준용 범위 (본 계획의 근거 조문)

> **1호**(저가): 「**제29조제2항제1호가목을 준용하여** 계산한 가액에서 같은 호 나목 가액을 차감한 가액에 현물출자자가 배정(**「자본시장과 금융투자업에 관한 법률」에 따른 주권상장법인이 같은 법 제165조의6제1항제3호에 따른 방식으로 배정하는 경우는 제외한다**)받은 신주수를 곱하여 … 이 경우 제29조제2항제1호가목 중 "증자"는 각각 이를 "**현물출자**"로 본다.」
>
> **2호**(고가): 「제29조제2항제3호가목의 가액에서 **같은 호 나목을 준용하여** 계산한 가액을 차감한 가액에 현물출자자가 인수(**… 제165조의6제1항제3호에 따른 방식으로 배정받은 주식을 제외한다**)한 신주수와 … 지분비율을 각각 곱하여 … 이 경우 제29조제2항제3호나목 중 "증자"는 각각 이를 "**현물출자**"로 본다.」

**세 가지가 동시에 확정된다**:
1. 준용 대상이 **「가목」·「나목」 통째**다 — **단서가 준용에 포함**된다(본문 한정 문구 없음).
2. 「"증자"는 "현물출자"로 본다」 ⇒ 단서의 「**증자후**의 1주당 평가가액」 = 「**현물출자 후**의 1주당 평가가액」.
3. **일반공모 배정분은 곱하는 신주수에서 제외**된다 (ⓒ).

> ⚠️ **2호의 미세 비대칭**: 「제29조제2항제3호**가목의 가액**」은 *준용* 표현 없이 그대로 쓰고 **나목만** "준용하여 계산"이다. 3호가목 = 「신주 1주당 인수가액」(산식·단서 없음)이라 준용 문구가 불필요했을 뿐이며 결과에 영향 없다.

### 1-3. 「상증령」 제29조의3제2항 — 고가 기준금액의 **분모가 연쇄로 바뀐다**

> 「제29조제2항제3호가목을 준용하여 계산한 가액에서 **같은 호 나목을 준용하여 계산한 가액**을 차감한 금액이 **같은 호 나목을 준용하여 계산한 가액의 100분의 30 이상**이거나 그 이익이 3억원 이상인 경우에 한정」

30% 게이트의 **분모도 「나목을 준용하여 계산한 가액」** = **Max 적용 후 값**이다. ⇒ Max 도입은 이익만 줄이는 게 아니라 **과세 여부 판정 자체를 뒤집을 수 있다**(anchor D-5).

현행 `contribution-in-kind.ts:131` `ratioGateMet = perShareGain >= applyRate(perShareAfter, 0.3)` 는 분모가 `perShareAfter`(= 나목 값)이라 **구조는 이미 맞다** — `perShareAfter`만 Max 적용값이 되면 자동 정합.

**§39 증자도 동일 구조**: §29②2호(저가 나목) 분모 = 「**가목**의 가액」, §29②4호(고가 나목) 분모 = 「**제3호 나목**의 가액」 — 둘 다 단서 적용 후 값이며, 코드도 `capital-increase.ts:34·89`가 `perShareAfter`를 쓴다 ⇒ **자동 정합**.

### 1-4. 평가기준일 — **현물출자와 증자가 다르다** 🆕

| 대상 | 근거 | 평가기준일 |
|---|---|---|
| **현물출자 §39의3** | 「상증법」§39의3① 본문 「**현물출자 납입일**을 증여일로 하여」 | 현물출자 납입일 |
| **증자 §39** (상장·코스닥 **주주배정**) | 「상증령」§29①1호 | **권리락일** |
| 증자 §39 (전환주식) | §29①2호 | 전환한 날 |
| 증자 §39 (그 외) | §29①3호 | 주식대금 납입일(신주인수권증서 교부 시 그 교부일) |

⚠️ **§29①의 권리락일 규정은 「법 제39조제1항」 대상이라 §39의3에 적용되지 않는다.** ⇒ **UI 라벨을 세목별로 달리 써야 한다**(§6 ⑤).

### 1-5. 「상증법」 제63조제1항제1호가목 — "실제 평가"의 정체

> 「… 상장주식은 **평가기준일 이전ㆍ이후 각 2개월** 동안 공표된 매일의 … 최종 시세가액(거래실적 유무를 따지지 아니한다)의 **평균액** …」

「상증령」§52의2②: 평가기준일 **이전·이후에 증자·합병 등의 사유**가 발생하면 기간 단축(1~3호). §52의2③: 매매거래 정지·관리종목 기간 포함 주식 제외.

> ⚠️ **현물출자가 §52의2②의 「증자ㆍ합병 등의 사유」인지는 본문에 명문이 없다** — **확인 필요**. 엔진은 평균액을 **주입받으므로**(§4) 본 계획의 판정 대상이 아니다. UI hint로만 안내.

### 1-6. 「자본시장과 금융투자업에 관한 법률」 제165조의6제1항제3호 — ⓒ 제외 대상

> 「3. 제1호 외의 방법으로 **불특정 다수인**(해당 주권상장법인의 주식을 소유한 자를 포함한다)에게 신주인수의 청약을 할 기회를 부여하고 이에 따라 청약을 한 자에 대하여 신주를 배정하는 방식」

= **일반공모증자**(1호 = 주주배정, 2호 = 제3자배정).

### 1-7. 🆕 **혼동 금지** — §29③의 공모 제외는 **다른 규정이다**

> 「상증령」§29③: 「법 **제39조제1항제1호가목**에서 "대통령령으로 정하는 경우"란 「자본시장과 금융투자업에 관한 법률 **시행령」 제11조제3항**에 따라 **모집**하는 경우를 말한다.」

| | §39의3 (본 계획 ⓒ) | §39①1호가목 (§29③) |
|---|---|---|
| 근거 | 자본시장법 **법** §165의6①3 | 자본시장법 **시행령** §11③ |
| 대상 | 현물출자 | 증자 저가 **가목만** |
| 효과 | **곱하는 신주수에서 차감** | **적용 자체 제외**(이익 없음) |

**형태가 전혀 다르다** — §39 증자에 ⓒ를 옮겨 붙이면 오적용이다. §29③ 구현 여부는 코드 0건 실측(미구현)이나 **Min/Max와 무관한 별건**이므로 본 계획 범위 외(§10).

---

## 2. 현행 코드 실측 (file:line)

| 위치 | 현행 | Phase D |
|---|---|---|
| `contribution-in-kind.ts:40` | `perShareAfter = computeWeightedPerShare(...)` | 저가 **Min** |
| `contribution-in-kind.ts:127` | 동상 | 고가 **Max** |
| `contribution-in-kind.ts:43·129` | `safeMultiply(perShareGain, allocatedShares)` | ⓒ 공모분 차감 |
| `contribution-in-kind.ts:131` | 30% 게이트 분모 = `perShareAfter` | **자동 정합**(§1-3) |
| `capital-increase.ts:26·70` | 동일 미구현 | 저가 Min · 고가 Max |
| `capital-increase.ts:34·89` | 게이트 분모 = `perShareAfter` | **자동 정합** |
| 🆕 `convertible-stock.ts:12~13` | `calcCapitalIncreaseGift(atConversion)` / `(atIssuance)` **위임** | **엔진 자동 커버** |
| 🛑 `capital-increase-allocation.ts:39` | equity-delta 모델(`:45` 사후평가·`:59` 게이트가 의존) | **제외**(§3-B) |
| `gift-deemed-input-types.ts:261~278` | `ContributionInput` — `isListed` 없음 | 필드 3개 |
| `gift-deemed-input-types.ts:174~188` | `CapitalIncreaseInput` — 동상 | 필드 2개 |
| `capital-helpers.ts:6~18` | `computeWeightedPerShare` | 공용 bound 헬퍼 신설 |
| **선례** `convertible-bond.ts:19~31` | `creditedPerShareValue(input, "min"\|"max")` | ⭐ 승계 + 이관 |
| **선례** `merger-valuation.ts:42` | `isListed && (listedPostAvgPrice ?? 0) > 0 ? Math.min(...)` | 참고(이관 안 함) |
| **선례 UI** `capital-forms.tsx:623~631` | `ToggleCard tone="emerald"` + 펼침 `CurrencyInput` | ⭐ 승계 |
| UI 재사용점 🆕 `capital-forms.tsx:465~512` | `CsNumericSection`(전환주식 2시점 공용 sub-component, `ConvertibleStockFields:513`이 2회 호출) | **1곳 수정 = 2시점 커버** |

**3-state 게이트 규약(선례 공통·본 계획 승계)**: `isListed === true` **이면서** 평균액 > 0일 때만 단서 발동. 상장인데 평균액 미입력이면 **이론값 유지**(자동 추정 금지) — 대신 ⑧⑬에서 **차단**한다.

---

## 3. 결정 확정 (D-0 게이트 — 2026-08-02 사용자 승인)

### ✅ 결정 A — **공용 헬퍼로 추출한다 (A-1)**

`capital-helpers.ts`에 `applyListedPerShareBound()` 신설 → **현물출자 + 증자(+전환주식 위임) + 전환사채**가 공유. `single-source-engine-helper` 준수, 네 번째 소비처 확장 비용 0.

- **CB 이관 포함**: `convertible-bond.ts:19~31` `creditedPerShareValue`를 공용 헬퍼 호출로 축소.
- **`merger-valuation.ts`(§28⑤)는 이관하지 않는다** — 두 번째 인자가 「합병 후 **단순평균액**」이라 산식이 다르고 Min만 쓴다. 무리한 통합은 과추상.

### ✅ 결정 B — **§39 증자 sub-case 경로까지 함께 (B-1)**, cap-table은 제외

§29②1가·3나 단서는 **§39의 본칙**이고 §39의3은 준용일 뿐이다. 준용만 고치면 **본칙이 빠진 역전 상태**가 된다.

- 🆕 **전환주식 §39①3호는 별도 작업이 필요 없다** — `convertible-stock.ts:12~13`이 `calcCapitalIncreaseGift`에 위임하므로 `CapitalIncreaseInput`에 필드를 넣으면 **엔진은 자동 커버**된다. UI만 `CsNumericSection`(2시점 공용) 1곳에 토글을 넣어 4개 폼 필드로 노출한다.
- 🛑 **cap-table 경로(`capital-increase-allocation.ts`)는 제외**한다. equity-delta 모델(주주별 사후평가 `:45` − 사전 → 이익)이라 **저가/고가 방향이 주주마다 갈린다**. 단서는 「제1호가목(min)」·「제3호나목(max)」처럼 **호별로 방향이 고정**돼 있어, 하나의 `perShareAfter`에 min·max 중 하나만 적용하면 반대 방향 주주가 왜곡된다. **법령상 정답 미판정 ⇒ 별건 조사 후 착수**(`feedback_unverified_authority_blocks_tax_change`).

### ✅ 결정 C — **일반공모 배정분 제외(ⓒ) 포함**, 단 **현물출자 전용**

- 입력 1개: `publicOfferingShares?: number` (일반공모 방식 배정 신주수)
- 산식: 곱셈 인자 = `max(0, allocatedShares − publicOfferingShares)`
- 🔧 **상장 게이트는 엔진 안에서** 건다 — 조문이 「주권상장법인이 … 방식으로 배정하는 경우」로 한정하므로 **비상장이면 차감하지 않는다**. API 변환 계층에만 두면 엔진 직접 호출(테스트·route)이 비상장에 오적용할 수 있다(dual-truth).
- ⚠️ **§39 증자에 옮겨 붙이지 말 것** — §1-7의 §29③은 형태가 다른 별개 규정이다.

---

## 4. 경계 — 엔진은 시세를 계산하지 않는다 (모계획 §11 승계)

엔진은 `listedMarketAvg`(평가기준일 전후 각 2개월 종가평균)를 **주입받는다**. §63①1가 평균·§52의2 기간단축·거래정지 종목 제외는 caller 책임.

> 🟡 **후속 가능성(Phase D-2, 범위 외)**: `lib/kiwoom/`에 시세 자동조회 인프라가 있고 「시점 4종」을 지원한다(memory `project_kiwoom_openapi_integration`). 「평가기준일 전후 2개월 평균」이 그 4종에 포함되는지 **미실측 — 확인 필요**.

---

## 5. 설계

### 5-1. 공용 헬퍼

```ts
// lib/tax-engine/gift-deemed/capital-helpers.ts
/**
 * 주권상장법인등 1주당 가액 단서 — 「상증령」§29②1가 단서(min) · §29②3나 단서(max).
 * §29의3①(현물출자)·§30⑤1(전환사채)이 이를 준용하고, §29②6(전환주식)은 §29②1~5를 통해 상속한다.
 *   min: 실제 평가가 이론값보다 **적으면** 실제 평가 (저가 — 피감수 축소)
 *   max: 실제 평가가 이론값보다 **크면**   실제 평가 (고가 — 감수 확대)
 * 두 방향 모두 **이익을 줄이는 쪽**이다(방향 반전 = 과다과세).
 * 상장이라도 평균액 미입력이면 이론값 유지 — 자동 추정 금지(입력 차단은 validate/Zod 담당).
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
// contributionLow (§39의3①1호 — 저가)
const theoretical  = computeWeightedPerShare(preContribPrice, preContribShares, newSharePrice, contributedShares);
const perShareAfter = applyListedPerShareBound(theoretical, input, "min");   // §29②1가 단서 준용
const perShareGain  = perShareAfter - newSharePrice;
// ⓒ 자본시장법 §165의6①3 일반공모분 제외 — **주권상장법인 한정**(비상장은 차감 없음)
const excluded = input.isListed ? (input.publicOfferingShares ?? 0) : 0;
const countedShares = Math.max(0, allocatedShares - excluded);
const gross = perShareGain > 0 ? safeMultiply(perShareGain, countedShares) : 0;

// contributionHigh (§39의3①2호 — 고가)
const perShareAfter = applyListedPerShareBound(theoretical, input, "max");   // §29②3나 단서 준용
const perShareGain  = newSharePrice - perShareAfter;
// 30% 게이트 분모는 perShareAfter 그대로 — §29의3②가 「같은 호 나목」을 가리키므로 자동 정합

// capital-increase.ts — increaseLow: "min" / increaseHigh: "max" (ⓒ 없음)
```

### 5-3. 표시 — 🔧 **result echo 필드를 만들지 않는다**

v1.0은 `listedBoundApplied?`·`theoreticalPerShare?` 2개를 `DeemedGiftResult`에 추가하려 했으나 **불필요**하다. 결과뷰가 `result.breakdown`을 라벨/금액 표로 **이미 일반 렌더**하므로 breakdown 행 2개(⑩)만 추가하면 표시가 끝난다.

```ts
{ label: "현물출자 후 1주당 가액 (산식 이론값)", amount: theoretical },
// 단서 발동 시에만 추가
{ label: "현물출자 후 1주당 평가가액 (상장 단서 적용)", amount: perShareAfter,
  lawRef: GIFT.CONTRIBUTION, note: "「상증령」§29②1가 단서 준용 — 산식값보다 적어 평가액 적용" },
```

⇒ **⑦(결과 카드)·⑨의 result 측 변경 없음**. Simplicity First — 필요해지면 Do 중 소규모 추가.

### 5-4. 입력 타입

```ts
export interface ContributionInput {
  // … 기존 …
  isListed?: boolean;            // 주권상장법인등 — §29②1가·3나 단서(§29의3① 준용)
  listedMarketAvg?: number;      // 현물출자 납입일 전후 2개월 종가평균 (§63①1가)
  publicOfferingShares?: number; // 일반공모(자본시장법 §165의6①3) 배정 신주수 — 상장 시 곱셈 인자에서 제외
}

export interface CapitalIncreaseInput {
  // … 기존 …
  isListed?: boolean;            // 주권상장법인등 — §29②1가·3나 단서
  listedMarketAvg?: number;      // 평가기준일(§29① — 주주배정 상장법인은 권리락일) 전후 2개월 종가평균
}
```

---

## 6. 14 동기화 지점

| # | 지점 | 파일 | 현물출자 | 증자 + 전환주식 |
|---|---|---|---|---|
| ① 폼 | `deemed-form-state.ts` | `conIsListed`·`conListedMarketAvg`·`conPublicOfferingShares` | `ciIsListed`·`ciListedMarketAvg` / `csConvIsListed`·`csConvListedMarketAvg`·`csIssueIsListed`·`csIssueListedMarketAvg` |
| ② initial | 동상 | `false`·`""`·`""` | 동상 |
| ③ normalize | — | **N/A** — `DeemedGiftCalculator`는 `useState(INITIAL_DEEMED)`, sessionStorage persist 없음(Phase B 실측) | N/A |
| ④ API 변환 | `gift-deemed-api.ts` | `:259~284` case `contribution` | case `capital_increase` · `convertible_stock`(2세트) — CB `:329~330` 패턴 승계 |
| ⑤ UI 위젯 | `contribution-form.tsx` / `capital-forms.tsx` | `ToggleCard tone="emerald"` + `CurrencyInput` **"현물출자 납입일 전후 2개월 종가평균"** + 공모 신주수 | `CapitalIncreaseFields` 1곳 + 🆕 `CsNumericSection`(`:465~512`) **1곳 = 2시점** · `CapitalIncreaseFields`(`:225`). 라벨은 **"평가기준일(주주배정 상장법인은 권리락일) 전후 2개월"** — §1-4 |
| ⑥ 사이드바 | — | 의제 단일값 ⇒ N/A | N/A |
| ⑦ 결과 카드 | — | 🔧 **N/A**(§5-3 — breakdown 행으로 표시) | N/A |
| ⑧ Validation | `gift-deemed-validate.ts` | `:171~190` — 상장 ON인데 평균액 ≤ 0 **차단** · 공모 신주수 > 배정 신주수 **차단** | `:123~129` 등 — 상장 ON·평균액 ≤ 0 차단 |
| ⑨ 타입 | `gift-deemed-input-types.ts` | `ContributionInput` +3 | `CapitalIncreaseInput` +2 (전환주식은 `atConversion`/`atIssuance`가 이를 재사용 ⇒ 자동) |
| ⑩ breakdown | `contribution-in-kind.ts` | 이론값 + 단서 적용 행 | `capital-increase.ts` 동일 |
| ⑪ 결과뷰 렌더 | — | ⑩이 일반 렌더로 표시 ⇒ N/A | N/A |
| ⑫ prefill | — | 금액만 바뀜(구조 불변) ⇒ N/A | N/A |
| ⑬ Zod | `gift-deemed-input.ts` | `:224~236` `contributionSchema` +3 + superRefine(⑧과 동일 규칙) | `:159~172` **`capitalIncreaseShape`** +2 ⇒ `capitalIncreaseSchema`·`capitalIncreaseInnerSchema`(`:192~193` `atConversion`/`atIssuance`)가 **동시에 커버** |
| ⑭ Route | — | 시그니처 불변 ⇒ N/A | N/A |

> ⚠️ **⑧⑬ 동기화 필수**(`feedback_validation_sync_8th_point`): 「상장 ON + 평균액 미입력」을 엔진은 **조용히 이론값으로 통과**시킨다(§2 3-state 규약). validate가 막지 않으면 사용자는 단서가 적용된 줄 안다 ⇒ **차단이 정답**.
>
> ⭐ **⑬의 지렛대**: `capitalIncreaseShape`(`:159`)는 `capitalIncreaseSchema`와 `capitalIncreaseInnerSchema` 양쪽의 소스이고, 후자는 전환주식 `atConversion`/`atIssuance`에 쓰인다 ⇒ **shape 1곳 수정으로 3개 스키마 커버**.

---

## 7. Pre-Do anchor (`pre-do-anchor-verification` — Do 진입 게이트)

신설 `__tests__/tax-engine/gift-deemed/listed-per-share-bound.anchor.test.ts`. 교재 계산사례가 전부 비상장이라 **법문 산식으로 자기일관 데이터를 유도**한다(부록 A).

| ID | 시나리오 | 입력 | 기대 | 노리는 것 |
|---|---|---|---|---|
| **D-1** | 현물출자 저가 Min **발동** | 전평가 20,000·전주식 100,000·인수가 10,000·출자 100,000·배정 100,000 / 평균 **13,000** | 이론 15,000 → **13,000** · gross **300,000,000** | 저가 단서 방향 |
| **D-2** | 저가 Min **미발동** | 동상 / 평균 **17,000** | 이론 15,000 유지 · gross **500,000,000** | 방향 반전 차단 |
| **D-3** | 현물출자 고가 Max **발동** | 전평가 5,000·전주식 100,000·인수가 20,000·출자 50,000·인수 50,000 / 평균 **12,000** · roster B 35,000·C 10,000 | 이론 10,000 → **12,000** · base **400,000,000** · B **140,000,000**·C **40,000,000**·합 **180,000,000** | 고가 단서 방향 |
| **D-4** | 고가 Max **미발동** | 동상 / 평균 **8,000** | TBC-2와 동일 **225,000,000** | 기존 anchor 불변 |
| **D-5** ⭐ | Max가 **30% 게이트를 뒤집는다** | 동상 / 평균 **16,000** | 차액 4,000 < 16,000×30%=4,800 · **전원 비과세 0** | §29의3② 분모 연쇄(§1-3) |
| **D-6** | 상장 ON·평균 **미입력** | `isListed:true`, `listedMarketAvg` 없음 | 이론값 유지 | 3-state 규약 |
| **D-7** | **비상장**은 평균액 무시 | `isListed:false`·평균 13,000 | 이론 15,000 유지 | 게이트 오발동 차단 |
| **D-8** | ⓒ 일반공모 제외 | D-1 + 공모 40,000 | 곱셈 인자 **60,000** · gross **180,000,000** | 자본시장법 §165의6①3 |
| **D-9** 🆕 | ⓒ는 **비상장에 적용 안 됨** | D-1의 `isListed:false` + 공모 40,000 | 곱셈 인자 **100,000** · gross **500,000,000** | 🔧 엔진 게이트(§3-C) |
| **D-10** 🆕 | **증자 §39 저가 Min** | 전평가 20,000·전주식 100,000·인수가 10,000·증자 100,000·실권주 100,000 / 평균 13,000 | 이론 15,000 → 13,000 · **300,000,000** | 본칙 커버 |
| **D-11** 🆕 | **증자 §39 고가 Max** | 전평가 5,000·전주식 100,000·인수가 20,000·증자 50,000·실권주 50,000 / 평균 12,000 | 이론 10,000 → 12,000 · **400,000,000** | 본칙 커버 |
| **D-12** 🆕 | **전환주식 §39①3호 위임 커버** | `atConversion` = D-10(상장·평균 13,000) · `atIssuance` = **비상장**·인수가 14,000(전평가 20,000·전주식 100,000·증자 100,000·실권주 100,000) | **0** (단서 도달) — 미도달이면 200,000,000 | 위임 경로 자동 커버 **판별** |
| **D-13** | 회귀 — 기존 anchor 전건 | 무변경 입력 | **TBC 6건 · CB 전건 · 증자 전건 불변** | 미사용 경로 보존 |

**게이트**: D-1·D-3·D-5·D-8·D-10·D-11은 현행에서 **RED**여야 정상. GREEN이면 이미 구현돼 있다는 뜻이므로 **설계 재검토**(§2 실측 오류 의심).

### 부록 A — 자기일관 산출 근거 (수기 검산)

- **D-1**: 이론 = (20,000×100,000 + 10,000×100,000) ÷ 200,000 = **15,000**. 13,000 < 15,000 ⇒ 채택 13,000. gross = (13,000−10,000)×100,000 = **300,000,000**.
- **D-3**: 이론 = (5,000×100,000 + 20,000×50,000) ÷ 150,000 = **10,000**. 12,000 > 10,000 ⇒ 채택 12,000. base = (20,000−12,000)×50,000 = **400,000,000**. 게이트 8,000 ≥ 12,000×30% = 3,600 ✓. B = 400,000,000×35,000/100,000 = **140,000,000** · C = **40,000,000**.
- **D-5**: 16,000 > 10,000 ⇒ 채택 16,000. 차액 4,000. 30% 게이트 분모 16,000 → **4,800** > 4,000 ✗. 3억 게이트: base = 4,000×50,000 = 200,000,000 → B raw 70,000,000 · C raw 20,000,000 **둘 다 3억 미만** ✗ ⇒ **전원 0**.
- **D-8**: 채택 13,000 · 1주당 이익 3,000. 곱셈 인자 = 100,000 − 40,000 = **60,000**. gross = **180,000,000**(D-1 대비 −120,000,000).
- **D-9**: 비상장이므로 단서·공모제외 **둘 다 미적용** ⇒ 이론 15,000 · 인자 100,000 ⇒ **500,000,000**(= D-2와 동일 값이지만 경로가 다르다).
- **D-12**: 발행 시점 이론 = (20,000×100,000 + 14,000×100,000) ÷ 200,000 = **17,000** · 이익 = (17,000−14,000)×100,000 = **300,000,000**(비상장이라 단서 무관).
  - 단서 **도달** 시: 전환 300,000,000 − 발행 300,000,000 = **0**
  - 단서 **미도달** 시: 전환 500,000,000 − 발행 300,000,000 = **200,000,000**
  ⇒ 두 값이 갈리므로 **위임 경로 도달 여부를 판별**한다.

> ⚠️ **D-12 설계 함정**: 두 시점에 **같은 입력**을 주면 단서 적용 여부와 무관하게 차감 결과가 0이 되어 **판별력이 0**이다(0 == 0). 반드시 발행 시점 이익을 전환 시점과 **다른 값**으로 두어 「도달 0 / 미도달 200,000,000」처럼 갈리게 구성한다.

---

## 8. Phase 분해 (Do는 시퀀셜)

| # | 작업 | 결과 |
|---|---|---|
| **D-0** | ✅ 결정 A·B·C 확정 (§3) | 완료 |
| **D-1** | ✅ anchor 13건 작성 → RED 확인 | **7건 RED**(D-1·3·5·8·10·11·12) — 예측과 일치 |
| **D-2** | ✅ `applyListedPerShareBound` 신설(`capital-helpers.ts:37`) + CB 이관(`convertible-bond.ts:27`) | CB anchor 전건 불변 |
| **D-3** | ✅ `ContributionInput` +3 · `CapitalIncreaseInput` +2 · 엔진 4분기 + ⓒ 차감(엔진 내 상장 게이트) | anchor 14/14 GREEN |
| **D-4** | ✅ ⑬ Zod(`contributionSchema` +3 superRefine 2규칙 · `capitalIncreaseShape` +2) + ⑧ validate 3케이스 | tsc 0 |
| **D-5** | ✅ ① ② ④ ⑤ ⑩ 배선 — 현물출자·증자·전환주식(`CsNumericSection` 1곳 = 2시점) | 7 필드 전 계층 도달 grep |
| **D-6** | ✅ E2E — 상장 토글 → 종가평균 13,000 → 결과 300,000,000 + 이론값 15,000 + 「상증령 §29②1가 단서」 표시 | **4/4 GREEN** |
| **D-7** | ✅ 전체 회귀 + 계획 환류 | `npm test` 실패 0 |

**파일 크기 영향**(800 트리거 · ≤700 착지 · ≥750 기회주의 분리):

| 파일 | 현재 | 예상 | 판정 |
|---|---:|---:|---|
| `capital-forms.tsx` | 684 | ≈704 | 750 미만 — 분리 불요 |
| `deemed-form-state.ts` | 667 | ≈685 | 동상 |
| `gift-deemed-input.ts` | 531 | ≈555 | 여유 |
| `contribution-in-kind.ts` | 210 | ≈235 | 여유 |
| `capital-increase.ts` | 116 | ≈130 | 여유 |
| `convertible-bond.ts` | 181 | ≈172 (이관으로 감소) | 여유 |

---

## 9. 리스크

| 리스크 | 대응 |
|---|---|
| **단서 방향 반전**(저가에 Max·고가에 Min) = 과다과세 | D-1~D-4·D-10·D-11로 **양방향 동결**. §1-1 표를 헬퍼 주석에 그대로 인용 |
| 30% 게이트 분모 연쇄 누락 | D-5가 유일 방어 — 분모를 **단서 적용 후 `perShareAfter`로 유지**. 이론값으로 되돌리면 안 됨 |
| A-1 CB 이관 회귀 | `convertible-bond-*.test.ts` + `capital-*` 전건 재실행을 D-2 완료 조건으로 |
| 「상장 ON·평균 미입력」 무음 통과 | ⑧⑬ 차단 필수 |
| ⓒ를 비상장에 오적용 | 🔧 엔진 내부 게이트(§3-C) + **D-9** |
| 🆕 ⓒ를 §39 증자에 오적용 | §1-7 비교표 — §29③(자본시장법 **시행령** §11③·적용 제외)과 **형태가 다름** |
| 🆕 전환주식 위임 커버 미검증 | **D-12** — 두 시점 이익을 다른 값으로 구성해 판별력 확보(부록 A 경고) |
| 🆕 증자 평가기준일 오라벨 | §1-4 표 — 증자 UI는 「권리락일」 병기, 현물출자는 「납입일」 |
| §52의2 기간단축 오해 | 엔진 범위 외(§4). UI hint로만 안내, 계산 금지 |
| 「현물출자가 §52의2② 사유인가」 미검증 | **확인 필요** 명시 — 판정이 필요해지면 별건 조사 |
| ESLint --fix named export 제거 | 신규 import 1라인 1named |

**완료 정의**: D-1~D-13 GREEN · 기존 TBC 6건 + CB·증자·전환주식 anchor 전건 불변 · `tsc --noEmit` 0 · lint 0 errors · 전체 회귀 실패 0 · breakdown 단서 행 표시 · E2E 확인.

---

## 10. 범위 외 (SCOPE-OUT)

- **§63①1가 2개월 평균·§52의2 기간단축·거래정지 종목 제외의 엔진 내 계산** — caller 주입 유지(§4).
- ~~키움 자동조회 연동(Phase D-2)~~ ✅**완료** — 기존 `/api/kiwoom/valuation-2month` 재사용(신규 API 0). 잔여: **§52의2② 단축 override 자동 판정**은 미구현(사용자가 직접 산정·입력 — 자동 fallback 금지 정책).
- **§28⑤ 합병 Min의 공용 헬퍼 이관** — 두 번째 인자 산식이 달라 통합 부적합(§3-A).
- 🛑 **§39 cap-table(equity-delta) 경로의 단서 적용** — 방향이 주주별로 갈려 **법령상 정답 미판정**(§3-B). 별건 조사 선행.
- 🆕 **§29③ 공모 모집 적용제외**(§39①1호가목 · 자본시장법 시행령 §11③) — 코드 0건 실측(미구현)이나 Min/Max와 **무관한 별건**(§1-7).
- ✅ ~~고가 roster 행 라벨 오기~~ — 2026-08-02 수정 완료(저가·고가 공통 「현물출자 전 보유주식수」). Phase D 착수 전 선처리.
