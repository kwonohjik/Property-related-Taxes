# 주식 양도소득세 — 상장주식에 §94①3 나목 단서(비상장 전용) 비과세가 적용되는 결함

- 작성일: 2026-08-27
- 상태: **Plan 작성 · 착수 보류 (별도 트랙)**
- 분리 경위: [`stock-transfer-stale-result-and-conversion-display.plan.md`](./stock-transfer-stale-result-and-conversion-display.plan.md)의
  Q-2(「상장주식의 K-OTC 거래를 어느 조문으로 볼 것인가」)를 조사하다 발견. 사용자 결정(2026-08-27)으로
  **본 트랙으로 분리**했다. 원 계획서는 제보 2건 + 조문 배정만 다룬다.
- 분류: **세액 변경** (2,997,500 → 0)

---

## 1. 결함 요약

상장주식(kospi·kosdaq·konex)에 **주권비상장법인 전용** 비과세 조항(§94①3 나목 단서)이 적용되어
세액이 0이 된다. UI에서 도달 가능하다.

---

## 2. 조문 실측

### 소득세법 §94①3 나목 (mst 280405, 시행 2026-07-01)

> 나. 주권**비상장**법인의 주식등. 다만, … 주권비상장법인의 대주주에 해당하지 아니하는 자가
> 「자본시장과 금융투자업에 관한 법률」 제283조에 따라 설립된 한국금융투자협회가 행하는
> 같은 법 제286조제1항제5호에 따른 **장외매매거래**에 의하여 양도하는 … **중소기업 및 중견기업**의
> 주식등은 **제외**한다.

⇒ 단서의 대상은 **나목 본문의 주식**, 즉 **주권비상장법인 주식**이다.

### 자본시장법 §286①5호 (mst 283193, 시행 2026-08-04)

> 5. **증권시장에 상장되지 아니한 주권**의 장외매매거래에 관한 업무

⇒ **K-OTC는 법문상 비상장주권 전용 시장**이다. 상장주식의 K-OTC 거래는 성립하지 않는다.

### 가목 2) vs 나목 단서 — 축이 반대다

| | 대상 주식 | 거래 장소 | 효과 |
|---|---|---|---|
| §94①3 **가목 2)** | **상장** | 증권시장 밖(장외) | 과세대상에 **포함** |
| §94①3 **나목 단서** | **비상장** | K-OTC | 과세대상에서 **제외**(비과세) |

가목 2)는 「장외면 잡는다」, 나목 단서는 「K-OTC면 빼준다」 — 방향이 정반대다.

---

## 3. 코드 현황

### 엔진 — marketType 가드 부재

`lib/tax-engine/stock-transfer/stock-classification.ts:203-209` (`judgeExemption` 2번 분기)

```ts
if (isKOTCTrading && (isSmallMediumEnterprise || isMidsizeEnterprise) && isListedSmallShareholder) {
  return { isExempt: true, reason: "kotc_sme_mid" };   // ← marketType 가드 없음
}
```

### UI — 시장 게이트 부재

`components/calc/stock-transfer/CompanyTypeBlock.tsx:60-73`의 「K-OTC 거래」 토글은 `marketType`
조건 없이 **국내주식 전 시장에 노출**된다(`app/calc/stock-transfer-tax/steps/Step1.tsx:164-169`이
`CompanyTypeBlock`을 국내주식 공통으로 push). 「소액주주」 토글은 K-OTC ON 시 바로 아래 나타난다
(`:75-88`). **UI에서 3클릭이면 재현되는 도달 가능한 결함이다.**

---

## 4. 세액 영향 실측

엔진 직접 호출. `acquisitionMode: "actual"` · 5,000주 · 취득 3,000원 · 양도 8,950원 · 보유 5년 이상.

| probe | 입력 | 결과 |
|---|---|---|
| **D** | kosdaq · 장외 · **K-OTC ON** · 중소기업 · 소액주주 | `kotc_sme_mid_exempt` · `①3나_단서` · **최종세액 0** |
| **E** | 같은 조건, K-OTC OFF (대조군) | `listed_off_market_non_major` · 과세 · **최종세액 2,997,500** |
| **F** | **비상장** + K-OTC + 중소 + 소액주주 (정상 적용) | `kotc_sme_mid_exempt` · 비과세 — **이것은 정상이며 유지해야 한다** |

**2,997,500 → 0.** 법 근거 없는 비과세다.

---

## 5. 근본 원인 — `isKOTCTrading`이 두 가지 의미로 쓰인다

`isKOTCTrading: true` 픽스처 **12건이 상장 시장과 조합**되어 있다.
`__tests__/tax-engine/stock-transfer/case-3-8-listed.test.ts`가 의미를 명시한다:

```ts
describe("케이스 4 — 코스피 비대주주 장외거래 과세", () => {
  it("C4-1: taxCategory = listed_otc_non_major, 세율 20%", () => {
    marketType: "kospi",
    isKOTCTrading: true,  // 장외거래     ← 주석이 「K-OTC」가 아니라 「장외거래」다
```

⇒ **`isKOTCTrading`이 「K-OTC 시장 거래」가 아니라 「장외거래」의 대리 플래그로 오용**되고 있다
([[feedback_ui_mode_flag_not_domain_semantics]]와 같은 구조).

그 뒤 §94①3 가목1) 단서용으로 **진짜 장내/장외 필드 `isOnMarketTransaction`이 별도 추가**되면서
축이 둘로 갈라졌는데, 옛 분기·픽스처는 여전히 `isKOTCTrading`으로 장외를 표현한다.

### 파생 문제 — 카테고리 중복

| taxCategory | 실제 담는 사실 | `appliedSection94` |
|---|---|---|
| `listed_otc_non_major` | 상장 비대주주 장외 (이름은 K-OTC) | `①3가2)` |
| `listed_off_market_non_major` | 상장 비대주주 장외 | `①3가1)` ← 원 계획서 C-2에서 **`①3가2)`로 교정 예정** |

⇒ C-2 교정이 끝나면 **두 카테고리가 조문·의미 모두 완전히 중복**된다. 본 트랙에서 정리한다.

### 기존 테스트가 지금 통과하는 이유

그 픽스처들이 `isListedSmallShareholder`를 켜지 않기 때문일 뿐이다.
**UI에서 사용자가 「소액주주」 토글까지 켜면 그 순간 비과세로 빠진다**(probe D).
즉 안전망이 이 조합을 **한 번도 보지 않았다**.

---

## 6. 벤처 경로(조특법 §14①7호)는 **다르다 — 손대지 않는다**

### 조특법 §14①7호 (mst 280409)

> 7. 「증권거래세법」 제3조제1호나목에서 정하는 방법으로 거래되는 **벤처기업의 주식**
>    (「소득세법」 제104조제1항제11호가목의 **대주주가 아닌 자**가 양도하는 것으로 한정한다)

### 증권거래세법 §3조1호나목 (mst 239245)

> 나. **증권시장 밖에서** 대통령령으로 정하는 방법에 따라 양도되는 주권

⇒ 이쪽은 **상장·비상장을 가리지 않고 「거래 장소」로만** 한정한다. 상장 벤처기업 주식의 장외 양도도
문언상 포섭될 수 있다. **나목 단서와 요건 축이 다르다.**

⚠️ **미확인(V-1)**: 증권거래세법 **시행령**(mst 280901)이 §3조1호나목의 「대통령령으로 정하는 방법」을
K-OTC로 한정했는지. 확인 전에는 벤처 경로에 marketType 가드를 넣지 않는다
([[feedback_no_unfavorable_application_without_legal_basis]]).

---

## 7. Phase 계획

### Phase 0 — Pre-Do anchor + 안전망 실측

| # | anchor | 예상 |
|---|---|---|
| K-1 | 상장(kospi·kosdaq·konex) + K-OTC + 중소 + 소액주주 → **과세**(2,997,500) | **실패** |
| K-2 | **비상장** + K-OTC + 중소 + 소액주주 → 비과세 **유지** (과잉 차단 방지 대조군) | 통과 |
| K-3 | 상장 + K-OTC + 벤처 + 비대주주 → 현행 유지 (V-1 확인 전까지 변경 없음) | 통과 |

**안전망 mutation probe**: `judgeExemption` 2번 분기를 무력화했을 때 반응하는 테스트 수를 측정.
0건이면 이 분기에 안전망이 없다는 뜻이다.

**픽스처 전수 조사**: `isKOTCTrading: true` 12건이 각각 「K-OTC」를 뜻하는지 「장외」를 뜻하는지
파일별로 판정한다. 「장외」 의도라면 그 픽스처는 **틀린 것**이므로
`isOnMarketTransaction: false`로 교정한다.

### Phase A — 엔진 가드 (세액 차단)

1. `judgeExemption` 2번 분기에 `marketType === "unlisted"` 추가.
2. K-1·K-2 통과 확인.

> UI만 막으면 stale sessionStorage 값이 엔진에 도달한다 — **엔진 가드가 필수이고 UI는 부수**다.

### Phase B — 축 정리

1. `isKOTCTrading`을 K-OTC 본래 의미로 좁히고, 「장외」는 `isOnMarketTransaction`으로 일원화.
2. `listed_otc_non_major` ↔ `listed_off_market_non_major` 중복 해소.
   **원 계획서 Phase C(조문 배정 교정)와 충돌하므로 그쪽 머지 이후 착수한다.**
3. 픽스처 12건 교정.

### Phase C — UI 게이트

1. `CompanyTypeBlock`의 K-OTC 토글을 `marketType === "unlisted"`에서만 노출.
2. 상장 전환 시 `isKOTCTrading`·`isListedSmallShareholder` **stale 값 정리**
   (onChange 시점 patch — useEffect 미러링 금지).

---

## 8. 미검증 항목 (V)

| # | 항목 | 방법 |
|---|---|---|
| V-1 | 증권거래세법 시행령이 §3조1호나목의 「방법」을 K-OTC로 한정했는가 | 시행령 mst 280901 조회. **벤처 경로 처리 방향이 여기 달렸다** |
| V-2 | `isKOTCTrading: true` 픽스처 12건의 의도 (K-OTC vs 장외) | 파일별 전수 판정 |
| V-3 | 상장 전환 시 stale 값이 남는 경로 (sessionStorage·이력 복원·다종목 스냅샷) | 전수 grep |
| V-4 | K-OTC 관련 E2E spec 존재 여부·영향 | `e2e/stock-transfer-*.spec.ts` grep |

---

## 9. 선행 의존

- **원 계획서 Phase C(§94 조문 배정 교정)가 먼저 머지되어야** 본 트랙 Phase B의 카테고리 중복 해소가
  의미를 갖는다. Phase A(엔진 가드)는 의존 없이 단독 진행 가능하다.
