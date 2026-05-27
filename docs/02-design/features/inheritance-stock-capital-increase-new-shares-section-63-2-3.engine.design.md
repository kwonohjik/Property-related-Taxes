# 상장법인 증자 신주(미상장) §63②3호 평가 — 엔진 설계 (PR-L3)

> **Plan**: `docs/00-pm/inheritance-stock-capital-increase-new-shares-section-63-2-3.plan.md`
> **UI**: `inheritance-stock-capital-increase-new-shares-section-63-2-3.ui.design.md`
> **선행**: PR-L(§63②1호)·PR-L2(§63②2호) — **비상장 V2 도메인**. ★ **본 PR-L3은 상장주식 도메인**(별개): `computeStockValuation` 상장 분기 + 신규 보조 모듈. V2 orchestrator·`applyPreIpoListing` 미사용.
> **법령 검증**: KoreanLaw MCP 2026-05-27 (상증법 mst=276123 §63②3호·③ / 상증령 mst=283637 §57③ / 시행규칙 mst=284609 §18②·§16의3①) — verbatim 대조 인용 오류 0. **§18② 배당차액 산식 박스 MCP 렌더 누락(L-1) → 직접 입력 신뢰**.

## Context

§63②3호 = **이미 상장된 법인의 증자 신주**로서 **평가기준일 현재 미상장** 주식. §57③(령)이 산식 정의: **1주당 평가액 = (§63①1호가목 평가액: 동일 법인 상장주식 전후 2개월 최종시세 평균) − 배당차액(시행규칙 §18②)**. ★ PR-L/L2(미상장 법인 IPO·등록 준비, MAX 산식)와 **구조 완전 상이** — base가 **상장주식 가목 평가액**이라 우리 엔진의 `listedStockAvgPrice`(전후 2개월 평균)에서 배당차액만 차감.

**★ 단일 진실 재사용 (J-1 수혜)**: 상장주식 totalValue의 실제 단일 진실은 `evaluateListedStockValue(avg,shares)`(3 call site). J-1에서 `computeStockValuation`(item-인지)이 본 계산·공제·family-business의 단일 위임점으로 통일됨 → **`computeStockValuation` 상장 분기 1곳에 배당차액 차감을 주입하면 자동 전파**. 단 화면 2 call site(preview·사이드바)는 item 비인지 `evaluateListedStockValue` 직접 호출이라 **재배선 필수**(C-B dual-truth).

**★ L-1 (배당차액 산식 박스 누락, 추정 인용 금지)**: §18② "다음의 산식" 계산식 박스가 MCP get_law_text에서 비어 옴. 통설(액면가×배당률×일수/365)은 **확정 인용 안 함** → 배당차액은 **사용자 직접 입력 신뢰**(PR-L 공모가 철학). 단서(배당기산일 동일 → 0)만 엔진 분기([[feedback_korean_law_82_vs_81_2_drift]] · [[feedback_no_silent_apportion_fallback]]).

**★ C-C (§63③ 할증 본 PR 미도입)**: 법 §63③은 "제1항제1호 및 제2항"(상장주식·§63②3호) 할증 대상이나, **현행 엔진은 상장주식 totalValue에 §63③ +20% 미적용**(선재 갭, grep 실증). `isSection22MajorShareholder`는 §22② 금융재산공제 배제 전용. PR-L3는 배당차액 차감만 — 할증은 별개 후속.

---

## ★ 케이스 인벤토리 (필수)

| # | 시나리오 | 법령 근거 | anchor 출처 | 테스트 | 상태 |
|---|---------|----------|-------------|--------|------|
| 1 | 가목 평균 50,000·배당차액 3,000·sameBaseDate=false → perShare=47,000·eff=3,000 | 령 §57③·규칙 §18② | 50,000−3,000 | L3-1 | ☐ TODO |
| 2 | sameBaseDate=true(배당차액 9,999 입력) → eff=0·perShare=50,000 (단서가 입력값 무시) | 규칙 §18② 단서 | 단서 우선 | L3-2 | ☐ TODO |
| 3 | listed item flag=true·avg 50,000·shares 100·배당차액 3,000 → computeStockValuation=4,700,000 (flag off → 5,000,000) | 령 §57③ | 47,000×100 | L3-3 | ☐ TODO |
| 4 | 단일 진실 동치 — resolveEstateItemValue ≡ getValuatedAmount ≡ computeStockValuation (§63②3호 적용 후) | J-1 | 동치 | L3-4 | ☐ TODO |
| 5 | 음수 경계 — 배당차액 60,000 > avg 50,000 → perShare=0 (음수 금지) | 정수연산 | max(0,·) | L3-5 | ☐ TODO |
| 6 | flag on·배당차액 미입력(undefined) → 차감 0·perShare=avg + warning 존재 | D-6 | 미입력 가드 | L3-6 | ☐ TODO |
| 7 | §63③ 할증 미적용(선재 불변) — flag=true·isSection22MajorShareholder=true → totalValue=(가목−배당차액)×shares (×1.2 없음)·공제배제는 분리 작동 | C-C | 할증 0 | L3-7 | ☐ TODO |
| 8 | 가업상속공제 전파(메커니즘) — §63②3호 listed 가업자산 deriveFamilyBusinessValue가 차감 후 값 산입 (중견 상장 가업 edge — 전파 경로 검증 목적) | J-1 합성 | family-business | L3-8 | ☐ TODO |
| 9 | dual-truth — computeStockValuation(item) ≡ 화면 preview·사이드바 누산(D-8 재배선 후) | C-B | UI=엔진 | L3-9 | ☐ TODO |
| 10 | 회귀 — flag 미입력 listed_stock 전부 기존 동작 불변(computeStockValuation ≡ evaluateListedStockValue byte 동일) | — | 전체 회귀 | (회귀) | ☐ TODO |

**규칙**: 행≥1 충족. L3-1 RED 선확인([[feedback_pre_anchor_verification]]). 회귀(10)는 상장주식 기존 anchor 전부 GREEN 유지 필수(optional 필드 하위호환).

---

## 법령 근거 (verbatim — §1 계획서 동일)

```
법 §63②3호: 거래소에 상장되어 있는 법인의 주식 중 그 법인의 증자로 취득한 새로운 주식으로서
            평가기준일 현재 상장되지 아니한 주식 (제1항제1호에도 불구하고 대통령령 방법).
령 §57③:   = (상장 법인 주식의 법 §63①1호가목 평가액) − 재정경제부령(규칙 §18②) 배당차액.
규칙 §18②: 배당차액 = [다음의 산식 — MCP 렌더 누락, L-1]. 단, 정관상 신주의 배당기산일을
            기존 상장주식과 동일하게 정하면 제외(= 배당차액 0).
법 §63③:   제1항제1호 및 제2항 평가가액에 100분의 20 가산 → 상장 경로 현행 미구현(C-C, 본 PR 외).
```

---

## 엔진 input 타입 (S-2)

`EstateItem`(types/inheritance-gift.types.ts)에 listed_stock 전용 optional 3필드:
```ts
isCapitalIncreaseUnlistedShare?: boolean;   // §63②3호 적용 (증자 신주·평가기준일 미상장)
listedStockDividendDifference?: number;      // 배당차액 (원/주, 직접 입력 — §18② / L-1)
dividendBaseDateSameAsListed?: boolean;      // 정관상 배당기산일 동일 → 배당차액 0 (§18② 단서)
```
- 전부 optional → 미입력·flag off 시 **기존 상장주식 동작 100% 불변**([[feedback_numeric_impact_verify_before_bug_claim]]).
- **★ 필드 의미 전환(S-B)**: 항목 category는 **`listed_stock`**(§57③ base = 상장 법인 가목 평가액이라 `listedStockAvgPrice` = 동일 법인 상장주식 전후 2개월 평균을 그대로 입력). flag ON 시 **`listedStockShares` = 증자로 취득한 신주(미상장) 보유 수**로 의미 전환(기존 "상장 보유 수" → "미상장 신주 수"). totalValue = perShare × 신주 수. UI 라벨이 flag에 따라 전환(UI 디자인 위임).

## 엔진 보조 모듈 (S-1) — `property-valuation/dividend-difference-section-63-2-3.ts`

```ts
export function resolveEffectiveDividendDifference(
  rawDividendDifference: number,
  sameBaseDate: boolean,
): number {
  if (sameBaseDate) return 0;                              // §18② 단서: 배당차액 제외
  return Math.max(0, Math.floor(rawDividendDifference));   // 차감액 0 이상
}

export function applyCapitalIncreaseShareValuation(
  listedAvgPerShare: number,   // §63①1호가목 (전후 2개월 평균)
  rawDividendDifference: number,
  sameBaseDate: boolean,
): { effectiveDividendDifference: number; perShareValue: number } {
  const eff = resolveEffectiveDividendDifference(rawDividendDifference, sameBaseDate);
  const perShare = Math.max(0, Math.floor(listedAvgPerShare) - eff); // §57③: 가목 − 배당차액, 0 하한
  return { effectiveDividendDifference: eff, perShareValue: perShare };
}
```
- 순수 함수·정수 연산(`Math.floor`·0 하한). 모듈 ≤100줄.
- **법령 상수(S-5)**: `legal-codes/inheritance-gift.ts`에 `VALUATION.CAPITAL_INCREASE_UNLISTED = "상증법 §63②3호 + 상증령 §57③"` · `VALUATION.DIVIDEND_DIFFERENCE = "상증세법 시행규칙 §18②"` 추가. S-7 결과 배당차액 행 `lawRef`·warning 인용에 사용(문자열 리터럴 금지 — [[feedback_legal_codes]]).
- **import 방향(S-A)**: `resolve-estate-item-value.ts` → `property-valuation/dividend-difference-section-63-2-3.ts`(신규 pure 모듈, 역참조 0) → 순환 없음. 기존 `computeStockValuation`이 이미 `property-valuation/*`(unlisted-orchestrator·property-valuation-stock) import 중이라 동일 방향. Do 단계 madge 확인.

---

## 계산 알고리즘 (단계별)

### S-3 `computeStockValuation` 상장 분기 — item-인지 차감 (단일 진입)

```ts
if (item.category === "listed_stock") {
  const avg = item.listedStockAvgPrice ?? 0;
  const shares = item.listedStockShares ?? 0;
  if (avg <= 0 || shares <= 0) return 0;
  if (item.isCapitalIncreaseUnlistedShare) {                       // §63②3호
    const { perShareValue } = applyCapitalIncreaseShareValuation(
      avg, item.listedStockDividendDifference ?? 0, item.dividendBaseDateSameAsListed ?? false,
    );
    return perShareValue * shares;
  }
  return evaluateListedStockValue(avg, shares);                    // §63①1가 (무변경)
}
```
- flag off → `evaluateListedStockValue`(현행 byte 동일). J-1 통일로 `getValuatedAmount`/`resolveEstateItemValue`·공제·family-business·결과 자동 전파.

### S-4 화면 2 call site 재배선 (D-8, C-B dual-truth)

```ts
// StockValuationForm.tsx ListedStockEditor preview (L63)
const totalValue = computeStockValuation(item);   // was: evaluateListedStockValue(avgPrice, shares)
// StockValuationForm.tsx 사이드바 합계 (L380)
if (avg > 0 && shares > 0) total += computeStockValuation(item); // was: evaluateListedStockValue(avg, shares)
```
- flag off 동일 값(회귀 0). flag on 화면·계산 일치. **UI 자체 재계산 0**(엔진 함수만 호출).

**하류 무변경**: 공제·가업상속공제(J-1)·결과 표시는 `computeStockValuation`/`resolveEstateItemValue` 위임이라 자동 반영. §63③ 할증·세대생략·세율 무관여.

---

## Silent fallback / 자동 안분 후보 식별

- **배당차액 자동 산식 금지(L-1)** — §18② 산식 박스 미확정 → `listedStockDividendDifference` 직접 입력만. 자동 계산 0([[feedback_no_silent_apportion_fallback]] · [[feedback_korean_law_82_vs_81_2_drift]]).
- **flag/단서 기본값** — `isCapitalIncreaseUnlistedShare ?? false`·`dividendBaseDateSameAsListed ?? false`·`listedStockDividendDifference ?? 0`은 하위호환 default(자동 추론 아님). 회귀 anchor로 0 변동 실증.
- **flag on·배당차액 미입력** — 자동 추정 금지. 차감 0(가목과 동일) + warning("배당차액 미입력 — 가목 평가액과 동일 적용. §18② 확인"). 침묵 0원화 아님.
- **§63③ 할증 미도입(C-C)** — 상장 경로 할증 신규 도입 0. 선재 동작 불변(L3-7).
- **dual-truth 0(C-B)** — 화면·엔진 모두 `computeStockValuation`/`applyCapitalIncreaseShareValuation` 단일 경유. UI 별도 산식 0.

---

## 테스트 약속

- 케이스 인벤토리 10행 → L3-1~9 + 회귀. L3-1 RED 선확인([[feedback_pre_anchor_verification]]).
- L3-1·L3-3·L3-5: perShare·totalValue `toBe()` 정확값(47,000 / 4,700,000 / 0).
- L3-2: sameBaseDate=true가 배당차액 입력값 무시 — eff `toBe(0)`.
- L3-4·L3-8·L3-9: J-1 단일 진실 동치·family-business 전파·UI=엔진 동치 `toBe()`.
- L3-7: totalValue에 ×1.2 부재(`toBe((가목−배당차액)×shares)`) + `isSection22MajorShareholderExcluded(item) === true`(공제배제 분리).
- 회귀: flag 미입력 상장주식 anchor 전부 GREEN(`computeStockValuation` ≡ `evaluateListedStockValue`). numeric 0 변동([[feedback_numeric_impact_verify_before_bug_claim]]).

---

## UI 통합 위임

- UI 명세는 `inheritance-stock-capital-increase-new-shares-section-63-2-3.ui.design.md`.
- **동기화 지점 전수(S-1~S-8)**: 엔진 S-1(보조 모듈)·S-2(타입)·S-3(computeStockValuation 차감)·S-5(legal-codes 상수) / UI S-4(preview·사이드바 재배선)·S-6(ListedStockEditor 토글·배당차액·단서)·S-7(결과카드 배당차액 행, lawRef=S-5 상수)·S-8(Zod `listedStockItemSchema` 3필드·strip 0 grep).
- **★ C-B dual-truth** — preview(L63)·사이드바(L380)를 `computeStockValuation(item)`로 재배선. 미반영 시 화면 stale([[feedback_engine_result_display_drift]]).
- **★ C-D Zod strip** — `listedStockItemSchema`(property-valuation-input.ts L168) 3필드 명시 확장. `discriminatedUnion` strip + route `as` 캐스트로 TS 미감지 → grep 필수. inheritance(estateItems)·gift(giftItems) 양 route 공용 스키마.
- **단서 3중 일치(R-6)** — `dividendBaseDateSameAsListed=true` 시 UI 배당차액 입력 비활성·0 표시, 엔진 eff=0, factory default false. value 표시 fallback `?? false`([[feedback_store_default_vs_ui_display_fallback]]).
- **UI 순서 = 로직 순서** — §63②3호 토글 → (ON 시) 단서 토글 → 배당차액 입력 순. 배당차액 차감 행은 `applyCapitalIncreaseShareValuation` 반환값 그대로(UI 재계산 0).
- **★ preview 텍스트 갱신(S-C)** — 재배선 후 ListedStockEditor preview의 기존 "`avg × shares`" 산식 텍스트가 §63②3호 ON 시 오표시. → ON 시 "`(가목 ${avg} − 배당차액 ${eff}) × ${신주수}주 = ${total}`"로 전환(eff·perShare = 엔진 반환값). 기존 base 입력(전후 2개월 평균)의 키움 자동조회(`KiwoomValuationAutoFetchButton`)는 §63②3호 base에도 그대로 유효 — 신규 fetch 0.
