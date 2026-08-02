# §39 증자 — **공모 모집 배정 적용제외**(§39①·상증령 §29③) 구현 계획서 **v1.1 ✅구현 완료**

> 발단: [`gift-inkind-contribution-39-3-phase-d.plan.md`](gift-inkind-contribution-39-3-phase-d.plan.md) §1-7이 「별건」으로 남긴 항목. v1.4에서 위임체인을 끝까지 따라가 성격이 확정됐다.
> **v1.1 환류(2026-08-02)**: 전 Phase 완료. anchor 8/8 GREEN(착수 시 **5건 RED**) · E2E 2/2 · 전체 회귀 1,167파일 13,035건 실패 0. **계획 대비 이탈 1건**: ⑧ validation을 「불요」로 봤으나 실제로도 불요였다(enum 3택이라 부정 조합 없음) — 확인 완료.
>
> 작성 기준: **추정 금지** — 법문은 KoreanLaw MCP 본문, 코드는 file:line·grep 실측. 미검증은 "확인 필요" 명시.

---

## 0. 한 줄 요약 / 결론 먼저

**주권상장법인이 실권주를 「유가증권 모집방법」으로 배정하면 §39①이 아예 적용되지 않는다.** 현행 엔진은 그 경우에도 과세한다 ⇒ **과대과세(납세자 불리)**.

| | 법 | 현행 엔진 |
|---|---|---|
| 상장법인 **진성 공모**(50인 이상 청약권유) 배정 | **과세 없음** | 🔴 **과세** |
| 그 모집이 **§11③ 간주모집**(실질 50인 미만 + 전매기준) | 과세 | 과세 ✓ |

`capital-increase.ts`·`capital-increase-allocation.ts`에 관련 로직 **0건**(grep 실측).

⭐ **CT-6(§39 cap-table 상계)과 방향이 정반대다.** CT-6은 과소과세 + 근거 미확보라 손대지 않았지만, 이 건은 **법 근거가 명확하고 납세자 유리 방향**이라 `feedback_no_unfavorable_application_without_legal_basis`가 **시정을 요구**한다.

---

## 1. 법령 실측 — 4단 위임체인 (KoreanLaw MCP 본문, 조회일 2026-08-02)

### 1-1. 체인

| # | 조문 | 본문 |
|---|---|---|
| ① | 「상증법」**§39①1호가목** | 「…해당 법인이 그 포기한 신주[실권주]를 **배정**(「자본시장과 금융투자업에 관한 법률」에 따른 **주권상장법인**이 같은 법 **제9조제7항에 따른 유가증권의 모집방법**(대통령령으로 정하는 경우를 **제외**한다)으로 배정하는 경우는 **제외**한다. **이하 이 항에서 같다**)하는 경우에는 그 실권주를 배정받은 자가 …」 |
| ② | 「자본시장법」**§9⑦** | 「"모집"이란 … 산출한 **50인 이상**의 투자자에게 새로 발행되는 증권의 취득의 청약을 권유하는 것」 |
| ③ | 「상증령」**§29③** | 「법 제39조제1항제1호가목에서 "대통령령으로 정하는 경우"란 「자본시장과 금융투자업에 관한 법률 **시행령」 제11조제3항**에 따라 모집하는 경우」 |
| ④ | 「자본시장법 시행령」**§11③** | 「… 청약의 권유를 받는 자의 수가 **50인 미만으로서 증권의 모집에 해당되지 아니할 경우에도** 해당 증권이 발행일부터 1년 이내에 50인 이상의 자에게 양도될 수 있는 경우로서 … **전매기준에 해당하는 경우에는 모집으로 본다**」 |

### 1-2. 해석 — **이중부정**

```
배정이 「모집방법」이면      → §39① 적용 제외 (과세 없음)
  단, 그 모집이 §11③ 간주모집이면 → 제외에서 다시 빠짐 (과세)
```

⇒ **형식적 간주모집으로 과세를 회피하는 것을 막는 구조**다. 실질이 사모(50인 미만)인데 전매제한을 걸지 않아 모집으로 의제된 경우까지 비과세로 빼주지는 않겠다는 뜻.

### 1-3. 적용 범위 — **§39① 전체**

괄호 끝의 「**이하 이 항에서 같다**」 ⇒ 제1항의 모든 「배정」에 같은 정의가 걸린다:
- 1호(저가) **가·나·다·라목** 전부
- **2호(고가)** 가·나·다·라목 전부

> ⚠️ Phase D 계획서 §1-7 초판은 「증자 저가 **가목만**」이라 적었다 — **오기**(v1.4에서 정정).

### 1-4. §39의3에는 **적용되지 않는다**

「상증령」§29의3①은 **§29②1가·3나(산식)만 준용**하고, 배정 신주수의 제외는 **§29의3① 자체 괄호**(자본시장법 **§165의6①3** 일반공모 **방식**)로 따로 정한다.

| | §39 (본 계획) | §39의3 (Phase D에서 구현 완료) |
|---|---|---|
| 근거 | 자시법 **§9⑦** + 자시령 **§11③** | 자시법 **§165의6①3** |
| 판정 기준 | **청약권유 50인** + 전매기준 | 배정 **방식**(일반공모) |
| 효과 | **「배정」 개념에서 제외** ⇒ 적용 없음 | 곱하는 **신주수에서 차감** |
| 범위 | §39① **전체** | §29의3①1·2호 |

⇒ **서로 옮겨 붙이면 오적용**이다. anchor로 격리한다(§6 PO-7).

### 1-5. 🆕 인접 발견 — **§29④(다목 인수·취득 포함)도 미구현**

「상증령」**§29④**: 「법 제39조제1항제1호**다목** 및 제40조제1항제1호나목에서 "대통령령으로 정하는 방법으로 인수·취득하는 경우"란 각각 **제3자에게 증권을 취득시킬 목적으로 그 증권의 전부 또는 일부를 취득한 자로부터 인수·취득한 경우**」

§39①1호다목의 괄호는 **제외가 아니라 포함(확대)** 규정이다 — 인수인을 통한 간접 취득도 「직접 배정」으로 본다. `grep` 결과 코드 **0건**.

⇒ **본 계획 범위 외**(§8). 방향이 반대(과세 확대 = 납세자 불리)이고 근거 조사가 별도로 필요하다.

---

## 2. 현행 코드 실측

| 위치 | 현행 | 본 계획 |
|---|---|---|
| `capital-increase.ts:22~70` `increaseLow` | 공모 제외 **없음** | 게이트 삽입 |
| `capital-increase.ts:71~124` `increaseHigh` | 동상 | 게이트 삽입 |
| `capital-increase-allocation.ts:31~108` | 동상 · **주주별 행** 구조 | 행별 게이트 |
| `convertible-stock.ts:12~13` | `calcCapitalIncreaseGift`에 **위임** | **자동 커버**(Phase D와 동일 지렛대) |
| `contribution-in-kind.ts` | §165의6①3 제외 **구현 완료** | **건드리지 않는다**(§1-4) |
| grep `모집`·`공모`·`인수인` | **0건** | — |

파일 크기: `capital-increase.ts` **124줄** · `capital-increase-allocation.ts` **108줄** — 여유(800 트리거 무관).

---

## 3. 설계

### 3-1. 입력 — **3택 enum**(2단 토글보다 법문 구조에 직결)

```ts
/**
 * 실권주·신주 배정 방법 — §39① 괄호(주권상장법인 모집방법 배정 제외) 판정.
 *   "normal"                기본 — 제외 대상 아님(과세)
 *   "public_offering"       주권상장법인이 자시법 §9⑦ 모집방법(50인 이상)으로 배정 ⇒ **§39① 적용 제외**
 *   "deemed_public_offering" 그 모집이 자시령 §11③ **간주모집**(50인 미만+전매기준) ⇒ 제외 취소(과세)
 */
allocationMethod?: "normal" | "public_offering" | "deemed_public_offering";
```

- `normal`과 `deemed_public_offering`은 **세액이 같다**. 그럼에도 구분하는 이유는 **감사 추적성** — 「공모였지만 간주모집이라 과세됐다」를 결과에 남긴다(`exclusionReason`·breakdown note).
- cap-table은 **주주별 행**에 같은 필드를 둔다(`CapShareholder.allocationMethod`) — 공모로 받은 주주와 특정 배정받은 주주가 한 증자에 섞일 수 있다.

### 3-2. 엔진 적용

```ts
// capital-increase.ts — increaseLow / increaseHigh 공통 선행 게이트
const excludedByPublicOffering = input.allocationMethod === "public_offering";
if (excludedByPublicOffering) {
  return {
    type: "capital_increase",
    applied: false,
    deemedGiftValue: 0,
    breakdown: [...baseRows],           // 산식 행은 유지(왜 0인지 보이게)
    exclusionReason: `주권상장법인의 유가증권 모집방법 배정 — §39① 적용 제외 (${GIFT.CI_PUBLIC_OFFERING_EXCLUSION})`,
    legalBasis: GIFT.CAPITAL_INCREASE,
    thresholdEcho: { gain: 0 },
  };
}
```

- **부분 공모**(실권주 일부만 공모 배정)는 `forfeitedShares`(다목 = 그 사람이 배정받은 실권주수)에 **공모분을 제외한 수**를 넣으면 자연 처리된다 — 별도 필드 불요. UI hint로 안내.
- ⚠️ 「일부만 공모 배정 시 나머지에 대해 가목이 성립하는가」는 문언상 자연스러우나 **직접 근거 미발견 — 확인 필요**로 표기하고, 엔진은 사용자 입력을 그대로 존중한다(자동 안분 금지).

### 3-3. 법령 상수 (문자열 리터럴 금지)

```ts
CI_PUBLIC_OFFERING_EXCLUSION: "상증법 §39① 괄호 · 자본시장법 §9⑦",
CI_DEEMED_PUBLIC_OFFERING: "상증령 §29③ · 자본시장법 시행령 §11③",
```

---

## 4. 14 동기화 지점

| # | 지점 | 파일 | 변경 |
|---|---|---|---|
| ① 폼 | `deemed-form-state.ts` | `ciAllocationMethod` · `csConvAllocationMethod`/`csIssueAllocationMethod` · `CapTableRow.allocationMethod` | 신규 |
| ② initial | 동상 | `"normal"` | 신규 |
| ③ normalize | — | sessionStorage persist 없음 ⇒ **N/A** | — |
| ④ API 변환 | `gift-deemed-api.ts` | `capital_increase` · `convertible_stock`(2세트) · `capital_increase_allocation`(행별) | 신규 |
| ⑤ UI | `capital-forms.tsx` `CapitalIncreaseFields`·`CapitalIncreaseAllocationFields` · `capital-forms-shared.tsx` `CsNumericSection` | `RadioCardGroup` 3택 + hint(부분 공모는 신주수에서 빼서 입력) | 신규 |
| ⑥ 사이드바 | — | N/A | — |
| ⑦ 결과 카드 | — | `exclusionReason`·breakdown note가 일반 렌더 ⇒ **N/A** | — |
| ⑧ Validation | `gift-deemed-validate.ts` | 없음 — enum 3택이라 부정 조합이 없다 | — |
| ⑨ 타입 | `gift-deemed-input-types.ts` | `CapitalIncreaseInput` · `CapShareholder` +1 | 신규 |
| ⑩ breakdown | `capital-increase.ts`·`-allocation.ts` | 제외·간주모집 note | 신규 |
| ⑪ 결과뷰 | ⑦과 동일 | — | — |
| ⑫ prefill | — | 금액만 바뀜 ⇒ N/A | — |
| ⑬ Zod | `gift-deemed-input.ts` | `capitalIncreaseShape` +1(⇒ `capitalIncreaseSchema`·`capitalIncreaseInnerSchema` **동시 커버**) · `capShareholderSchema` +1 | 신규 |
| ⑭ Route | — | 시그니처 불변 ⇒ N/A | — |

⭐ **⑬ 지렛대 재사용**: `capitalIncreaseShape` 1곳 수정으로 증자 + 전환주식 2시점까지 커버된다(Phase D에서 확인된 구조).

---

## 5. Pre-Do anchor (`pre-do-anchor-verification`)

신설 `__tests__/tax-engine/gift-deemed/capital-increase-public-offering.anchor.test.ts`.
기준 입력은 기존 anchor와 같은 저가/고가 픽스처를 재사용해 **변화분만** 드러낸다.

| ID | 시나리오 | 기대 | 노리는 것 |
|---|---|---|---|
| **PO-1** ⭐ | 저가 · `public_offering` | **0** · `applied: false` · `exclusionReason`에 「§39① 적용 제외」 | 본 계획의 핵심 |
| **PO-2** | 저가 · `deemed_public_offering` | **300,000,000**(= normal과 동일) · reason에 「간주모집」 | 이중부정의 안쪽 |
| **PO-3** | 저가 · `normal`(또는 미지정) | **300,000,000** | 회귀 — 기존 동작 불변 |
| **PO-4** | **고가** · `public_offering` | **0** | §39① **전체** 적용(1-3) |
| **PO-5** | 전환주식 — `atConversion`만 `public_offering` | 전환분 0 ⇒ `raw ≤ 0` ⇒ **0** | 위임 자동 커버 |
| **PO-6** | cap-table — B만 `public_offering` | B 이익 **0** · A·C는 불변 | 행별 적용 |
| **PO-7** ⭐ | **§39의3**(현물출자)에 `allocationMethod` 없음 확인 | 타입에 필드 **부재** · 기존 anchor 전건 불변 | **오적용 차단**(§1-4) |
| **PO-8** | 회귀 — 기존 증자·전환주식·cap-table anchor | **전건 불변** | 미사용 경로 보존 |

**게이트**: PO-1·PO-4·PO-5·PO-6은 현행에서 **RED**여야 정상. GREEN이면 §2 실측이 틀렸다는 뜻이므로 설계 재검토.

---

## 6. Phase 분해

| # | 작업 | 결과 |
|---|---|---|
| **P-1** | ✅ anchor 8건 작성 → RED 확인 | **5건 RED**(PO-1·2·4·5·6) — 예측 4건 + PO-2(간주모집 note) |
| **P-2** | ✅ `GIFT.CI_PUBLIC_OFFERING_EXCLUSION`·`CI_DEEMED_PUBLIC_OFFERING` + `ShareAllocationMethod` 타입(barrel 재수출) | tsc 0 |
| **P-3** | ✅ `publicOfferingExcluded()`·`publicOfferingExcludedResult()`·`deemedPublicOfferingNote()` + cap-table `publicOfferingIds` 행별 | **8/8 GREEN** |
| **P-4** | ✅ `capitalIncreaseShape` +1(증자+전환주식 2시점 동시) · `capShareholderSchema` +1 | tsc 0 |
| **P-5** | ✅ `RadioCardGroup` 3택(증자·전환주식 2시점) + cap-table **행별 select** · 효과 hint 공용화(`allocationMethodHint`) | tsc 0 · lint 0 errors |
| **P-6** | ✅ E2E — 일반 300,000,000 → 공모 **0**(「모집방법」 표시) → 간주모집 **300,000,000**(「간주모집」 표시) 3단 전환 | **2/2 GREEN** |
| **P-7** | ✅ 전체 회귀 + 환류 | 1,167파일 13,035건 실패 0 |

---

## 7. 리스크

| 리스크 | 대응 |
|---|---|
| **§39의3에 오적용** | §1-4 4축 비교표 + **PO-7**(현물출자 타입에 필드 부재를 테스트로 고정) |
| 이중부정 방향 반전(간주모집을 비과세로) | **PO-2**가 유일 방어 — `deemed_public_offering`은 반드시 **과세** |
| 적용 범위를 「1호 가목만」으로 축소 | §1-3 「이하 이 항에서 같다」 + **PO-4**(고가) |
| 부분 공모 배정 처리 | 신주수 입력으로 자연 처리 · **자동 안분 금지**(`feedback_no_silent_apportion_fallback`) · 「일부 공모 시 나머지 과세」는 **확인 필요** 표기 |
| cap-table 행별 누락 | **PO-6** — 한 증자에 공모 배정과 특정 배정이 섞일 수 있다 |
| 전환주식 위임 미검증 | **PO-5** — 두 시점 값을 다르게 둬야 판별력이 생긴다(Phase D D-12 함정 재현 주의) |
| ESLint --fix named export 제거 | 신규 import 1라인 1named |

**완료 정의**: PO-1~PO-8 GREEN · 기존 증자·전환주식·cap-table·§39의3 anchor 전건 불변 · `tsc --noEmit` 0 · lint 0 errors · 전체 회귀 실패 0 · E2E 확인.

---

## 8. 범위 외

- **§29④ 다목 「인수·취득 포함」 확대 규정**(§1-5) — 미구현이나 방향이 **과세 확대(납세자 불리)**라 근거 조사가 선행돼야 한다. 별건.
- **§40①1호나목**의 같은 §29④ 준용(전환사채) — 동상.
- §39 cap-table **상장 단서**(§29②1가·3나) — [`capital-increase-captable-listed-proviso.plan.md`](capital-increase-captable-listed-proviso.plan.md) v1.6에서 **안 C로 종결**. 본 계획과 독립이다.
- 「50인 이상 청약권유」·「전매기준 해당」의 **자동 판정** — 사용자 입력. 엔진이 자본시장법 요건을 판정하지 않는다.
