# 주식 PR-L3 — §63②3호 상장법인 증자 신주(미상장) 평가 구현계획

> **Source**: 비상장 V2 후속 매트릭스 PR-L3 (PR-L2 §9 후속) §63②3호 (상증령 §57③, 시행규칙 §18②)
> **Date**: 2026-05-27
> **선행**: PR-L(§63②1호, `0c14a43`)·PR-L2(§63②2호, `d87e6e5`) — **비상장 V2 도메인** MAX(공모가, 보충적평가). **★ 본 PR-L3은 구조가 다름**: §63②3호는 **상장주식 도메인**(이미 상장된 동일 법인 주식의 가목 평가액 기준)이라 V2 orchestrator가 아니라 `property-valuation-stock.ts` + `computeStockValuation` 상장 분기에 연계.
> **법령 검증**: KoreanLaw MCP 2026-05-27 (상증법 mst=276123 §63②3호·③ / 상증령 mst=283637 §57③ / 시행규칙 mst=284609 §18②·§16의3①) — 조문 인용 오류 0. **단 §18② 배당차액 산식 박스가 MCP 렌더에서 누락(L-1)**.
> **정책**: [[feedback_korean_law_82_vs_81_2_drift]] · [[feedback_pre_anchor_verification]] · [[feedback_no_silent_apportion_fallback]] · [[feedback_numeric_impact_verify_before_bug_claim]] · [[feedback_api_zod_schema_sync]] · [[feedback_ui_engine_dual_truth_avoidance]]

---

## 1. 법령 근거 (KoreanLaw MCP 검증, 2026-05-27)

> **전수 직접검증**: §63②3호·§63③(법 mst 276123)·§57③(령 mst 283637)·§18②·§16의3①(규칙 mst 284609) 모두 MCP 원문 verbatim 대조. **조문 인용 오류 0**. 단 §18② 배당차액 **산식 박스 본문이 MCP 출력에서 렌더 누락(L-1)** → 산식 자동 재현 금지, 직접 입력 신뢰 설계.

### 1.1 상증법 §63②3호 (mst 276123, 원문 verbatim)

> ② 다음 각 호의 어느 하나에 해당하는 주식등에 대해서는 **제1항제1호에도 불구하고** … 대통령령으로 정하는 방법으로 평가한다.
> 3. **거래소에 상장되어 있는 법인의 주식 중 그 법인의 증자로 인하여 취득한 새로운 주식**으로서 **평가기준일 현재 상장되지 아니한 주식**

- 대상 = **이미 상장된 법인**의 **증자 신주**로서 **평가기준일 현재 미상장** 주식. (1호·2호는 미상장 법인의 IPO·등록 준비 — 본 호는 **상장법인의 신주**라는 점이 결정적 차이.)

### 1.2 상증령 §57③ (mst 283637, 원문 verbatim)

> ③ 법 제63조제2항제3호에 따른 주식의 평가는 **거래소에 상장되어 있는 법인의 주식에 대하여 법 제63조제1항제1호가목에 따라 평가한 가액**에서 **재정경제부령으로 정하는 배당차액을 뺀 가액**으로 한다.

- 산식: **1주당 평가액 = (§63①1호가목 평가액: 동일 법인 상장주식의 전후 2개월 최종시세 평균) − 배당차액**.
- ★ **base는 신주가 아니라 "이미 상장된 동일 법인 주식"의 가목 평가액** = 우리 엔진의 `listedStockAvgPrice`(전후 2개월 평균)와 동일.

### 1.3 시행규칙 §18②(배당차액) (mst 284609, 원문 verbatim — 산식 박스 L-1)

> ② 영 제57조제3항에서 "재정경제부령으로 정하는 배당차액"이란 **다음의 산식에 의하여 계산한 금액**을 말한다. 다만, 해당 법인의 정관에 의하여 해당 법인의 증자로 인하여 취득한 새로운 주식등에 대한 이익을 배당함에 있어서 **평가기준일 현재 상장되어 있는 해당 법인의 주식등과 배당기산일을 동일하게 정하는 경우를 제외한다.**

- **단서(확정)**: 정관상 신주의 **배당기산일을 기존 상장주식과 동일**하게 정하면 → **배당차액 제외 = 0** → 평가액 = 가목 평가액(상장주식과 동일).
- ★ **L-1 (산식 박스 렌더 누락)**: "다음의 산식"의 계산식 박스가 MCP get_law_text 출력에서 비어 옴. 통설상 `배당차액 = 1주당 액면가액 × 직전기 1주당 배당금률 × (신주발행일이 속한 사업연도 개시일 ~ 배당기산일 전일 일수 ÷ 365)`로 알려져 있으나 **본 계획에서는 확정 인용하지 않음**([[feedback_korean_law_82_vs_81_2_drift]] 추정 인용 금지). → **엔진은 배당차액을 사용자 직접 입력값으로 신뢰**(PR-L 공모가와 동일 철학, D-4). 산식 자동계산기는 L-1 해소 후 별개 후속(§9) — **본 PR 미포함**.

### 1.4 상증법 §63③ 할증 (mst 276123, PR-L·L2와 동일 문언) — ★ 본 PR 범위 외(C-C)

> ③ **제1항제1호, 제2항** 및 제60조제2항을 적용할 때 … 최대주주등의 주식등 … **100분의 20을 가산**한다. (중소·중견·결손법인 제외.)

- 법문상 "제1항제1호 및 제2항" → §63①1호가목(**상장주식**)·§63②3호 **모두** §63③ 할증 대상.
- ★ **C-C (실증으로 정정)**: 그러나 **현행 엔진은 상장주식(`computeStockValuation` listed 분기 = `evaluateListedStockValue` = `floor(avg)×shares`)에 §63③ +20% 할증을 적용하지 않음**(grep 실증 — listed 경로에 ×1.2 없음). **`isSection22MajorShareholder`(EstateItem 직속) 토글은 §63③ 평가 할증이 아니라 §22② 금융재산상속공제 배제** 용도(`financial-deduction-resolver.ts: isSection22MajorShareholderExcluded`). §63③ +20% 할증은 **비상장 V2 orchestrator 전용**(`max-shareholder-premium.ts`)으로만 구현됨.
- ∴ **상장주식 §63③ 할증(§63①1호가목·§63②3호 공통)은 선재(pre-existing) 미구현 갭** — PR-L3에서 신규 도입하지 않음(§63②3호만의 책임 아님). **본 PR 범위 외**, §9 후속으로 분리. PR-L3는 배당차액 차감(§57③)만 책임.

### 1.5 시행규칙 §16의3① (mst 284609, 가목 평가 보강)

> ① 법 제63조제1항제1호가목 적용 시 전후 각 2월 합산기간이 **4월에 미달하는 경우 해당 합산기간을 기준**으로 한다.

- 가목(전후 2개월 평균) 산정은 **현행 `listedStockAvgPrice` 입력값 신뢰**(키움 자동조회 §63①1가 경로 기존). PR-L3은 그 평균값을 base로 받아 배당차액만 차감 → 가목 산정 로직 변경 없음.

### 1.6 정리 + 본 PR 범위

| 항목 | §63②1호 (PR-L) | §63②2호 (PR-L2) | **§63②3호 (본 PR-L3)** |
|---|---|---|---|
| 대상 법인 | 미상장(IPO 준비) | 미상장(상장신청·협회등록 준비) | **이미 상장된 법인** |
| 대상 주식 | 법인 주식등 | 법인 주식등 | **증자 신주(평가기준일 현재 미상장)** |
| 평가 도메인 | **비상장 V2** orchestrator | **비상장 V2** orchestrator | **상장주식**(`property-valuation-stock.ts`) |
| 산식 | MAX(공모가, §54 보충평가) | MAX(공모가, §54 보충평가) | **가목 평가액(전후 2개월 평균) − 배당차액** |
| base 입력 | finalPerShareValue(§54) | finalPerShareValue(§54) | **`listedStockAvgPrice`(가목)** |
| 윈도우 | 신고일−6/3개월~상장 전 | 등록신청−6/3개월~등록 전 | **없음**(증자 신주·미상장 상태 자체가 트리거) |
| §63③ 할증 | V2 적용(`max-shareholder-premium`) | V2 적용 | **상장 경로 미구현(선재 갭, C-C) — 본 PR 범위 외** |
| 단서 | — | — | **배당기산일 동일 시 배당차액 0** |

- **∴ 본 PR은 PR-L/L2와 모듈을 공유하지 않음**. 신규 보조 모듈 `dividend-difference-section-63-2-3.ts`(배당차액·단서·차감 산식) + `computeStockValuation` 상장 분기(item-인지 차감) + ListedStockEditor preview·사이드바 재배선(C-B) + 입력 위젯 토글 + Zod 확장(C-D).

---

## 2. 현행 엔진 경로 + 갈음 지점 (상장주식 도메인)

### 2.1 단일 진실 — `evaluateListedStockValue` (3 call site, C-A 실증)

상장주식 평가 totalValue의 **실제 단일 진실**은 `evaluateListedStockValue(avgPrice, shares) = floor(avg) × shares`(property-valuation-stock.ts L55)이며, **3곳**에서 호출:
1. `valuation/resolve-estate-item-value.ts:54` — `computeStockValuation` 상장 분기 (본 계산·공제·family-business 경로. J-1 단일 진실).
2. `StockValuationForm.tsx:63` — ListedStockEditor **입력 미리보기**(avg × shares 표시).
3. `StockValuationForm.tsx:380` — **사이드바 합계** 누산.

```ts
// resolve-estate-item-value.ts:51-56 (현행)
if (item.category === "listed_stock") {
  const avg = item.listedStockAvgPrice ?? 0;
  const shares = item.listedStockShares ?? 0;
  if (avg > 0 && shares > 0) return evaluateListedStockValue(avg, shares);
  return 0;
}
```
- **C-A**: `evaluateListedStock`(full `PropertyValuationResult` breakdown판, property-valuation-stock.ts L63)은 **호출처 0 = orphan/테스트 전용**(`__tests__/tax-engine/property-valuation.test.ts`만 참조, 디스패처는 listed_stock을 throw로 차단). ∴ 여기에 배당차액 행만 추가해도 **라이브 화면 미반영** → S-4는 **라이브 3 call site**를 대상으로 재정의(아래 D-8).
- **C-B (dual-truth 위험)**: `evaluateListedStockValue(avg, shares)`는 **item 비인지**(flags 모름) → §63②3호 차감을 알 수 없음. preview(2)·사이드바(3)가 이 함수를 직접 호출하면 **본 계산은 차감, 화면은 미차감**으로 어긋남([[feedback_engine_result_display_drift]] · [[feedback_ui_engine_dual_truth_avoidance]]). → preview·사이드바를 **item-인지 단일 진입 `computeStockValuation(item)`** 경유로 재배선(D-8, 엔진 디자인 확정).

### 2.2 §63②3호 차감 주입 지점 — `computeStockValuation` 상장 분기 (item-인지)

- `computeStockValuation(item)`은 이미 `item`을 받으므로 **여기서 §63②3호 분기**(flag·배당차액·단서) 후 per-share 차감. J-1 통일로 `getValuatedAmount`/`resolveEstateItemValue`(공제·가업상속공제·결과)가 전부 위임 → **자동 전파**.

### 2.3 §63③ 할증 — 상장 경로 미적용(선재 갭, C-C). 본 PR 무관

- `isSection22MajorShareholder` = §22② **금융재산공제 배제** 전용(`financial-deduction-resolver.ts`), **§63③ +20% 평가 할증 아님**. 상장주식 totalValue 경로에 ×1.2 없음(grep 실증). §63③ 상장 할증은 **선재 미구현 갭**(§63①1호가목 포함) → §9 후속. **PR-L3는 §63③ 할증 미도입** — 배당차액 차감만.

---

## 3. 설계 결정

### D-1. 적용 도메인 = 상장주식 (V2 orchestrator 미사용)

§63②3호는 **상장법인의 증자 신주**라 V2(비상장) orchestrator·`applyPreIpoListing`을 **재사용하지 않음**. base는 동일 법인의 가목 평가액(`listedStockAvgPrice`). ∴ PR-L/L2와 코드 공유 0, 신규 보조 모듈로 분리.

### D-2. 신규 EstateItem 필드 (listed_stock 전용, optional — 하위호환)

```ts
// types/inheritance-gift.types.ts EstateItem 확장
isCapitalIncreaseUnlistedShare?: boolean;   // §63②3호 적용 (증자 신주·평가기준일 미상장)
listedStockDividendDifference?: number;      // 배당차액 (원/주, 직접 입력 — §18② / L-1)
dividendBaseDateSameAsListed?: boolean;      // 정관상 배당기산일 동일 → 배당차액 0 (§18② 단서)
```
- 모두 optional → 미입력·플래그 off 시 **기존 상장주식 동작 100% 불변**([[feedback_numeric_impact_verify_before_bug_claim]]).

### D-3. 산식 — `dividend-difference-section-63-2-3.ts` 신규 보조 모듈

```ts
// 순수 함수. 1주당 평가액 = 가목 평가액 − 유효 배당차액
export function resolveEffectiveDividendDifference(
  rawDividendDifference: number,
  sameBaseDate: boolean,      // §18② 단서: 배당기산일 동일 → 0
): number {
  if (sameBaseDate) return 0;            // 단서: 배당차액 제외
  return Math.max(0, Math.floor(rawDividendDifference)); // 음수 가드 (차감액은 0 이상)
}

export function applyCapitalIncreaseShareValuation(
  listedAvgPerShare: number,            // §63①1호가목 (전후 2개월 평균)
  rawDividendDifference: number,
  sameBaseDate: boolean,
): { effectiveDividendDifference: number; perShareValue: number } {
  const eff = resolveEffectiveDividendDifference(rawDividendDifference, sameBaseDate);
  const perShare = Math.max(0, Math.floor(listedAvgPerShare) - eff); // §57③: 가목 − 배당차액, 0 하한
  return { effectiveDividendDifference: eff, perShareValue: perShare };
}
```
- **정수 연산**: `Math.floor` 사용(§57③ 차감은 1주당 정수). 배당차액 > 가목 평가액 시 음수 방지(0 하한) — 경계 anchor L3-5.
- **L-1 대응**: 배당차액 자동 산식 미구현. `rawDividendDifference`는 **사용자 직접 입력**. 단서(`sameBaseDate`)만 엔진 분기.

### D-4. 배당차액 입력 = 직접 입력 신뢰 (자동 산식 fallback 금지)

- §18② 산식 박스 L-1 미확정 → **자동 계산 금지**([[feedback_no_silent_apportion_fallback]] · [[feedback_korean_law_82_vs_81_2_drift]]). 사용자가 배당차액(원/주)을 직접 입력. PR-L 공모가 직접 입력과 동일 철학.
- (선택 후속) §18② 산식 박스 raw 재확인 후 액면가·배당률·일수 보조 계산기 추가 — **본 PR 범위 외**(§9).

### D-5. `computeStockValuation` 상장 분기 차감 (item-인지, 단일 진입)

```ts
if (item.category === "listed_stock") {
  const avg = item.listedStockAvgPrice ?? 0;
  const shares = item.listedStockShares ?? 0;
  if (avg <= 0 || shares <= 0) return 0;
  if (item.isCapitalIncreaseUnlistedShare) {
    const { perShareValue } = applyCapitalIncreaseShareValuation(
      avg, item.listedStockDividendDifference ?? 0, item.dividendBaseDateSameAsListed ?? false,
    );
    return perShareValue * shares;                 // §63②3호 (배당차액 차감)
  }
  return evaluateListedStockValue(avg, shares);    // §63①1가 (기존, 무변경)
}
```
- 플래그 off → 기존 `evaluateListedStockValue` 분기(현행과 byte 동일). J-1 통일로 공제·family-business·결과 자동 전파.

### D-6. 음수·경계

- 배당차액 ≤ 0 또는 미입력 → 차감 0(가목과 동일). `sameBaseDate=true` → 무조건 0(단서). 배당차액 > 가목 평가액 → 1주당 0(음수 금지, L3-5). 플래그 on + 배당차액 미입력 → **차감 0 + warning**("배당차액 미입력 — 가목 평가액과 동일 적용. §18② 확인").

### D-7. §63③ 할증 — 본 PR 미도입 (C-C)

상장주식 totalValue 경로에 §63③ +20% 할증이 **현재 없음**(선재 갭). PR-L3는 배당차액 차감(§57③)만 책임 — 할증 신규 도입 금지(§63①1호가목과 함께 §9 후속). `isSection22MajorShareholder`는 금융재산공제 배제 전용이라 §63②3호 평가에 영향 0. anchor L3-7은 "§63②3호 적용 시에도 totalValue에 할증 미적용(선재 동작 불변)"을 고정.

### D-8. ★ dual-truth 차단 — preview·사이드바 재배선 (C-B)

`computeStockValuation`(D-5)만 고치면 본 계산은 맞으나 **ListedStockEditor preview(L63)·사이드바 합계(L380)가 `evaluateListedStockValue(avg, shares)`를 직접 호출**해 §63②3호 차감을 무시 → 화면 stale.
- **재배선**: 두 호출처를 **item-인지 경로**로 전환.
  - preview(L63): `evaluateListedStockValue(avgPrice, shares)` → `computeStockValuation(item)`.
  - 사이드바(L380): 누산식 `total += evaluateListedStockValue(avg, shares)` → `total += computeStockValuation(item)`.
- 플래그 off 시 동일 값(회귀 0). 플래그 on 시 화면·계산 일치. **자체 재계산 금지**(엔진 함수만 호출 — dual-truth 0).
- preview의 "배당차액 차감 행"은 `applyCapitalIncreaseShareValuation`의 `effectiveDividendDifference`·`perShareValue`를 **그대로 표시**(UI 재계산 금지).

---

## 4. 변경 지점 (동기화)

| # | 파일 | 변경 |
|---|---|---|
| S-1 | `property-valuation/dividend-difference-section-63-2-3.ts` (신규) | `resolveEffectiveDividendDifference` + `applyCapitalIncreaseShareValuation` 순수 함수. §57③·§18②·단서 주석 + L-1 주석 |
| S-2 | `types/inheritance-gift.types.ts` | EstateItem에 `isCapitalIncreaseUnlistedShare?`·`listedStockDividendDifference?`·`dividendBaseDateSameAsListed?` optional 추가 |
| S-3 | `valuation/resolve-estate-item-value.ts` | `computeStockValuation` 상장 분기에 **item-인지 §63②3호 차감**(D-5). J-1 단일 진실 → 본 계산·공제·family-business·결과 자동 전파 |
| S-4 | **`StockValuationForm.tsx` L63·L380 재배선(C-B/D-8)** | preview·사이드바 합계를 `evaluateListedStockValue(avg,shares)` → **`computeStockValuation(item)`** 전환. dual-truth 차단([[feedback_ui_engine_dual_truth_avoidance]]). (★ orphan `evaluateListedStock` breakdown판은 라이브 미사용 — 테스트 정합 위해 동일 차감 반영하되 **라이브 표시는 S-7**) |
| S-5 | `legal-codes/inheritance-gift.ts` | `VALUATION.CAPITAL_INCREASE_UNLISTED = "상증법 §63②3호 + 상증령 §57③"` · `VALUATION.DIVIDEND_DIFFERENCE = "상증세법 시행규칙 §18②"` |
| S-6 | `StockValuationForm.tsx` `ListedStockEditor` | §63②3호 ToggleCard(`isCapitalIncreaseUnlistedShare`) → ON 시 배당차액 CurrencyInput + 단서 ToggleCard(`dividendBaseDateSameAsListed` → 배당차액 입력 비활성·0 표시) + 산식 미리보기(`avg − 배당차액 = 1주당`). select-on-focus 규칙 준수 |
| S-7 | 결과 카드 / 상세 평가 표 | 상장주식 결과에 §63②3호 적용 시 배당차액 차감 행 표시. `applyCapitalIncreaseShareValuation` 반환값(eff·perShare) 그대로 사용(자체 재계산 금지) |
| S-8 | **`lib/validators/property-valuation-input.ts` `listedStockItemSchema`(L168)** | 신규 3필드 추가 — `z.discriminatedUnion`+strip이라 미추가 시 **침묵 제거**(route는 `as` 캐스트 → TS 미감지, C-D 실증). inheritance·gift 양 route 공용 스키마. `isCapitalIncreaseUnlistedShare` `z.boolean().optional()`·`listedStockDividendDifference` `z.number().nonnegative().optional()`·`dividendBaseDateSameAsListed` `z.boolean().optional()`. `coerceDates` 무관(불리언·숫자). grep strip 0 |

> ★ J-1 단일 진실 통일 덕에 **본 계산·공제·가업상속공제·결과가 S-3 한 곳에서 전파**. 단 (a) C-B dual-truth로 화면 2 call site 재배선(S-4), (b) C-D Zod strip로 `listedStockItemSchema` 명시 확장(S-8)이 **TS 미감지** → grep 점검 필수([[feedback_explicit_prop_mapping_strip]] · [[feedback_api_zod_schema_sync]]).

---

## 5. Pre-Do anchor (RED 우선)

신규 `__tests__/tax-engine/property-valuation/dividend-difference-section-63-2-3.test.ts`:

- **L3-1 (RED→GREEN)**: `applyCapitalIncreaseShareValuation(avg=50,000, 배당차액=3,000, sameBaseDate=false)` → perShare=47,000, eff=3,000. (모듈 부재 RED.)
- **L3-2 (단서 §18②)**: `sameBaseDate=true`(배당차액 9,999 입력) → eff=0, perShare=50,000(가목과 동일). 단서가 입력값 무시.
- **L3-3 (computeStockValuation 전파)**: listed item `isCapitalIncreaseUnlistedShare=true`·avg=50,000·shares=100·배당차액=3,000 → `computeStockValuation`=4,700,000. 플래그 off → 5,000,000(기존).
- **L3-4 (단일 진실 동치)**: 동일 item에 대해 `resolveEstateItemValue` ≡ `getValuatedAmount` ≡ `computeStockValuation` (§63②3호 적용 후에도 J-1 동치 유지).
- **L3-5 (음수 경계)**: 배당차액 60,000 > avg 50,000 → perShare=0 (음수 금지).
- **L3-6 (미입력 가드)**: 플래그 on·배당차액 미입력(undefined) → 차감 0·perShare=avg + warning 존재.
- **L3-7 (§63③ 할증 미적용 — 선재 동작 불변, C-C)**: §63②3호 적용 listed item + `isSection22MajorShareholder=true` → `computeStockValuation` = (가목−배당차액)×shares (×1.2 **없음**). 동시에 `isSection22MajorShareholderExcluded(item)===true`(금융재산공제 배제 경로는 분리 작동) 확인.
- **L3-8 (가업상속공제 전파 — J-1 연계)**: §63②3호 listed 가업자산이 `deriveFamilyBusinessValue`에 배당차액 차감 후 값으로 산입(J-1 단일 진실 + 본 PR 차감 합성).
- **L3-9 (dual-truth — UI 합계 ≡ 엔진)**: §63②3호 listed item에 대해 `computeStockValuation(item)` 값이 곧 화면 preview·사이드바 누산값(D-8 재배선 후 동일). 엔진/화면 동치.
- **(회귀)**: 플래그 미입력 listed_stock 전부 기존 동작 불변 — `computeStockValuation` ≡ `evaluateListedStockValue(avg,shares)` byte 동일, 상장주식 기존 anchor GREEN 유지.

---

## 6. Definition of Done

- [ ] L3-1~9 + 상장주식 기존 anchor 회귀 통과 (RED 선확인 — [[feedback_pre_anchor_verification]])
- [ ] 신규 3필드 미입력 시 상장주식 동작 100% 불변(하위호환 실증 — [[feedback_numeric_impact_verify_before_bug_claim]])
- [ ] `npx tsc --noEmit` 0 + `npm test` 전수
- [ ] 800줄 — 신규 모듈 ≤100줄
- [ ] §63②3호(법)·§57③(령)·§18②(규칙)·**L-1 산식 미확정 주석** + 단서 주석
- [ ] dual-truth 0 — preview·사이드바(S-4/D-8) `computeStockValuation(item)` 재배선 + S-7 `applyCapitalIncreaseShareValuation` 반환값 재사용([[feedback_ui_engine_dual_truth_avoidance]])
- [ ] 신규 3필드 `listedStockItemSchema` 명시 확장 + 폼→normalize→Zod→route strip 0 grep(C-D, [[feedback_explicit_prop_mapping_strip]])
- [ ] §63③ 상장 할증 **미도입** 확인(선재 동작 불변, C-C) — L3-7
- [ ] e2e 상장주식 §63②3호 토글 + 배당차액 + 단서 — `e2e/inheritance-listed-capital-increase.spec.ts`
- [ ] 한국어 커밋 + push

---

## 7. 실행 순서 (Do — 엔진 시퀀셜 → UI)

1. L3-1 RED → S-1 신규 모듈 → S-2 타입 → S-3 `computeStockValuation` item-인지 차감 → L3-1~8 GREEN → S-5 legal-codes.
2. S-4 preview·사이드바 `computeStockValuation(item)` 재배선(D-8) → L3-9 dual-truth + L3-7 할증 미적용 회귀.
3. UI: S-6 ListedStockEditor 토글·배당차액·단서 → S-7 결과 카드 배당차액 행 → S-8 `listedStockItemSchema` 신규 필드 → e2e.
4. Check: `ui-engine-sync-checker` + `bkit:gap-detector`.

---

## 8. 리스크

- **R-1 도메인 혼동**: §63②3호를 V2 비상장 카드에 잘못 배치 금지. **상장주식(ListedStockEditor)** 전용. base = 가목 평가액(`listedStockAvgPrice`).
- **R-2 배당차액 산식 추정(L-1)**: §18② 산식 박스 미확정 → 자동계산 금지, 직접 입력 신뢰. 추정 산식 코드화 금지([[feedback_korean_law_82_vs_81_2_drift]]).
- **R-3 dual-truth(C-B)**: `computeStockValuation`(S-3)만 고치고 화면 2 call site(L63 preview·L380 사이드바) 재배선(S-4/D-8) 누락 시 화면이 §63②3호 차감 무시→stale. L3-9로 고정([[feedback_engine_result_display_drift]] · [[feedback_ui_engine_dual_truth_avoidance]]).
- **R-4 EstateItem strip(C-D 실증)**: 신규 3필드를 `listedStockItemSchema`에 미추가 시 `discriminatedUnion` strip + route `as` 캐스트로 **침묵 제거**(TS 미감지). S-8 명시 확장 + grep([[feedback_explicit_prop_mapping_strip]] · [[feedback_api_zod_schema_sync]]).
- **R-5 §63③ 할증 오인(C-C)**: `isSection22MajorShareholder`를 §63③ +20% 할증으로 오해 금지 — 실제는 §22② 금융재산공제 배제. 상장 §63③ 할증은 선재 갭(§9), 본 PR 미도입. L3-7로 "할증 미적용·공제배제 분리"를 고정.
- **R-6 단서 우선순위**: `dividendBaseDateSameAsListed=true`가 배당차액 입력값을 **무조건 무시**(eff=0). UI도 단서 ON 시 배당차액 입력 비활성·0 표시(3중 일치 — [[feedback_store_default_vs_ui_display_fallback]]).

---

## 9. 후속 PR

- **§18② 배당차액 산식 보조 계산기**: raw 산식 박스 재확인(법제처 annex/raw) 후 액면가·직전기 배당률·일수 입력 → 배당차액 자동 산출(현 직접 입력의 투명성 보강). L-1 해소 선행.
- **§63②3호 + 키움 가목 자동조회 연계**: 현 §63①1가 전후 2개월 자동조회(`KiwoomValuationAutoFetchButton`)를 §63②3호 base에도 노출.
- **★ 상장주식 §63③ 최대주주 할증 신규 도입(C-C 갭)**: 현재 상장주식(§63①1호가목·§63②3호) totalValue에 §63③ +20% 할증 미적용. 비상장 V2 `max-shareholder-premium.ts` 패턴을 상장 경로로 확장 — **본 PR과 별개 독립 PR**(§63②3호만의 책임 아님, 적용 시 모든 최대주주 상장주식 영향 → 회귀 광범위).
- (PR-L/L2/L3 완료로 §63② 1·2·3호 3개 호 전부 구현 — §63② 매트릭스 종결.)

---

## 10. 한계

- **L-1 §18② 산식 미확정**: 배당차액 계산식 박스 MCP 렌더 누락 → 직접 입력 신뢰. 자동 산식은 후속(§9).
- **가목 평가 신뢰**: 전후 2개월 평균(`listedStockAvgPrice`)은 외부/키움 입력 신뢰. §16의3①(4월 미달 시 합산기간) 자동 보정 없음 — 사용자 입력 신뢰.
- **단서 입력 의존**: 정관상 배당기산일 동일 여부는 사용자 판단 입력. 자동 판정 없음.
- **§63③ 상장 할증 미구현(C-C)**: 상장주식 totalValue에 §63③ +20% 최대주주 할증 현행 미적용(§63①1호가목·§63②3호 공통 선재 갭). PR-L3는 배당차액 차감만 — 할증은 §9 별개 PR. `isSection22MajorShareholder`는 금융재산공제 배제 전용.
