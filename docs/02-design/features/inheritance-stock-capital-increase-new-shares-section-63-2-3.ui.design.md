# UI Design — 상장법인 증자 신주(미상장) §63②3호 평가 (PR-L3)

> **Engine Design**: `inheritance-stock-capital-increase-new-shares-section-63-2-3.engine.design.md`
> **Plan**: `docs/00-pm/inheritance-stock-capital-increase-new-shares-section-63-2-3.plan.md`
> **범위**: ★ **상장주식 도메인** — `StockValuationForm.tsx`의 **`ListedStockEditor`**(비상장 V2 카드 아님)에 §63②3호 ToggleCard + 단서 ToggleCard + 배당차액 입력 추가. preview·사이드바 재배선(C-B). 결과 카드 배당차액 행.

## 0. 적용 정책 메모리

- [[feedback_toggle_card_visibility]] · [[feedback_three_state_optional_mode_toggle]] — ToggleCard, OFF도 tone 유지
- [[feedback_store_default_vs_ui_display_fallback]] — 단서 토글 3중 일치(factory·engine·UI display `?? false`)
- [[feedback_ui_engine_dual_truth_avoidance]] · [[feedback_engine_result_display_drift]] — preview·사이드바 `computeStockValuation(item)` 재배선(C-B), UI 자체 산식 0
- [[feedback_korean_law_82_vs_81_2_drift]] · [[feedback_no_silent_apportion_fallback]] — 배당차액 직접 입력(L-1), 자동 산식 금지
- [[feedback_select_on_focus]] · [[feedback_decimal_input]] — 배당차액 CurrencyInput·select-on-focus
- [[feedback_browser_verify_with_playwright]] — e2e로 검증
- [[feedback_numeric_impact_verify_before_bug_claim]] — flag/단서 off 시 numeric 0 변동

---

## 1. 사용자 시나리오 (4건)

| # | 시나리오 | 기대 표시 |
|---|---------|----------|
| U-1 | 상장주식·§63②3호 토글 **OFF**(기본) | 기존 동작 — "전후 2개월 평균 × 주식 수" (배당차액 행 없음) |
| U-2 | §63②3호 **ON**·단서 OFF·배당차액 3,000 입력 | "(가목 50,000 − 배당차액 3,000) × 신주 N주" + 결과 배당차액 차감 행 |
| U-3 | §63②3호 ON·**단서 ON**(배당기산일 동일) | 배당차액 입력 **비활성·0 표시**, perShare=가목 평균(차감 0) |
| U-4 | §63②3호 ON·배당차액 **미입력** | 차감 0(가목과 동일) + ⚠️ "배당차액 미입력 — §18② 확인" 안내 |

---

## 2. `ListedStockEditor` 확장 (S-6) — `StockValuationForm.tsx`

기존 ListedStockEditor(종목코드·키움 자동조회·전후 2개월 평균·주식 수·평가액 미리보기) **하단**에 §63②3호 영역 추가. UI 순서 = 로직 순서.

```
ListedStockEditor (기존)
  ├ 종목코드 + KiwoomValuationAutoFetchButton (§63①1가 전후 2개월 — 무변경, §63②3호 base에도 유효)
  ├ FieldCard "전후 2개월 종가 단순평균 (원/주)"  ← §63②3호 ON 시 라벨 보조: "(상장된 동일 법인 주식 기준 = §63②3호 base)"
  ├ FieldCard "보유 주식 수"  ← §63②3호 ON 시 라벨 "증자 신주(미상장) 보유 수"로 전환(S-B)
  ├ preview 미리보기 (avg × shares)  ← ★ 재배선: computeStockValuation(item) (D-8). ON 시 "(가목 − 배당차액) × 신주수" 텍스트(S-C)
  │
  └ [신규] §63②3호 영역 (UI 순서 = 로직 순서)
       ├ ToggleCard "§63②3호 — 상장법인 증자 신주(평가기준일 현재 미상장)"  tone=violet  (testid: sec-63-2-3-toggle)
       │    hint: "거래소 상장 법인의 증자로 취득한 새 주식으로 평가기준일 현재 상장 안 된 경우.
       │          평가 = 상장 주식 전후 2개월 평균 − 배당차액(시행규칙 §18②)."
       │    trailing: LawArticleModal(§63②3호·§57③)
       │  ON 시 children:
       │    ├ ToggleCard "정관상 배당기산일을 기존 상장주식과 동일하게 정함 → 배당차액 제외(§18② 단서)"  (testid: sec-63-2-3-same-base-date)
       │    │    tone=sky. ON 시 아래 배당차액 입력 비활성·0 표시.
       │    ├ FieldCard "배당차액 (원/주)"  (testid: sec-63-2-3-dividend-diff)
       │    │    CurrencyInput, select-on-focus. 단서 ON 시 disabled + value 0.
       │    │    hint: "§18② 산식 산출액 직접 입력. 미입력 시 가목 평가액과 동일 적용."
       │    └ 산식 미리보기: "1주당 = 가목 {avg} − 배당차액 {eff} = {perShare}  →  × {신주수}주 = {total}"  (엔진 반환값, UI 재계산 0)
```

- **factory 기본값**: ToggleCard OFF → 3필드 모두 미설정(undefined). ON 시 `isCapitalIncreaseUnlistedShare:true`만 set, 배당차액·단서는 사용자 입력.
- **단서 3중 일치(R-6)**: `dividendBaseDateSameAsListed` value 표시 `?? false`. 단서 ON 시 배당차액 입력 `disabled` + 표시값 0(엔진 eff=0과 일치).
- **set 직접**: `set({ isCapitalIncreaseUnlistedShare: v })` 등 store write 직접(useEffect 미러링 금지).

---

## 3. 결과 카드 (S-7)

상장주식 결과(평가액)에 §63②3호 ON 시 차감 행 추가 — `applyCapitalIncreaseShareValuation` 반환값(eff·perShare) **그대로 표시**(UI 재계산 0):

```
상장주식 평가 (§63②3호 적용 시)
  전후 2개월 평균(가목)         50,000
  − 배당차액(시행규칙 §18②)      3,000   ← VALUATION.DIVIDEND_DIFFERENCE (S-5)
  1주당 평가액                  47,000
  × 증자 신주(미상장) 보유 수      100주
  평가액                     4,700,000   ← VALUATION.CAPITAL_INCREASE_UNLISTED (S-5)
```
- 토글 OFF → 기존 "전후 2개월 평균 × 주식 수" 행만(배당차액 행 없음).
- 단서 ON → 배당차액 행 "0 (배당기산일 동일 — §18② 단서)".

---

## 4. preview·사이드바 재배선 (S-4, C-B dual-truth)

| 위치 | 현행 | 재배선 |
|---|---|---|
| ListedStockEditor preview (L63) | `evaluateListedStockValue(avgPrice, shares)` | `computeStockValuation(item)` |
| 사이드바 합계 누산 (L380) | `total += evaluateListedStockValue(avg, shares)` | `total += computeStockValuation(item)` |

- flag off 동일 값(회귀 0). flag on 화면·계산·결과 일치. **L3-9 anchor로 고정**.

---

## 5. 동기화 지점 (DoD)

| # | 지점 | 본 PR 작업 |
|---|---|---|
| ① 폼/EstateItem 타입 | `EstateItem` 3필드 optional | S-2 |
| ② initial/factory | ToggleCard ON 시 `isCapitalIncreaseUnlistedShare:true`만 | §2 |
| ③ normalize | store normalize | listed 필드 spread 보존(별도 whitelist 부재 — strip 0 grep) |
| ④ API 변환 | EstateItem 통째 직렬화 | 신규 3필드 strip 0 grep(C-D 인접) |
| ⑤ UI 위젯 | ListedStockEditor 토글·단서·배당차액 | §2 |
| ⑥ 사이드바 | `computeStockValuation(item)` 재배선 | §4 (C-B) |
| ⑦ 결과 카드 | 배당차액 차감 행 | §3 (lawRef = S-5 상수) |
| ⑧ validation | `inheritance-validate.ts`/`gift` listed 분기 | flag on·배당차액 입력 규칙(미입력 차단 아님 — 차감 0 허용, warning만) |
| ⑨ Zod | `listedStockItemSchema` 3필드 | S-8 (strip 방지, C-D 실증) |

- ★ **C-D**: ⑨ 미반영 시 `discriminatedUnion` strip + route `as` 캐스트로 침묵 제거(TS 미감지). inheritance·gift 양 route 공용 `estateItemSchema` → 단일 수정.
- ★ **C-B**: ⑥ preview·사이드바 재배선 누락 시 화면 stale.

---

## 6. Cross-field / fallback

- **단서 > 배당차액**: `dividendBaseDateSameAsListed=true`면 배당차액 입력 무시(eff=0). UI 비활성·0 표시·엔진 eff=0 3중 일치([[feedback_store_default_vs_ui_display_fallback]]).
- **flag/단서/배당차액 미입력** = undefined → 하위호환 기본(off/0). length-derive·자동추론 아님.
- numeric: flag off 시 0 변동([[feedback_numeric_impact_verify_before_bug_claim]]).
- §63③ 할증 UI 노출 **없음**(C-C — 상장 경로 미구현, 본 PR 외).

---

## 7. Silent fallback 후보

- **배당차액 자동 산식 0(L-1)** — 직접 입력만. §18② 산식 미확정([[feedback_no_silent_apportion_fallback]] · [[feedback_korean_law_82_vs_81_2_drift]]).
- **flag on·배당차액 미입력** — 자동 추정 0. 차감 0(가목 동일) + ⚠️ 안내(U-4). 침묵 0원화 아님.

---

## 8. 브라우저 e2e (`e2e/inheritance-listed-capital-increase.spec.ts` 신규)

- **T-L3-1 (§63②3호 차감)**: 상속 → 상장주식 추가 → avg 50,000·신주 100 → §63②3호 ON → 배당차액 3,000 → 결과 평가액 4,700,000 + 배당차액 차감 행 표기.
- **T-L3-2 (단서)**: §63②3호 ON → 단서 ON → 배당차액 입력 비활성 → 평가액 5,000,000(가목 동일).
- **T-L3-3 (회귀)**: §63②3호 OFF → 기존 동작 5,000,000(배당차액 행 없음).
- **T-L3-4 (dual-truth)**: §63②3호 ON 시 사이드바 합계 = 결과 평가액(화면 일치).

---

## 9. UI senior 사전 점검 체크리스트

- [ ] 엔진 S-1·S-2·S-3·S-5 선행 완료(보조 모듈·타입·차감·상수) — 시퀀셜
- [ ] ListedStockEditor §63②3호 ToggleCard(violet) + 단서 ToggleCard(sky) + 배당차액 CurrencyInput(select-on-focus)
- [ ] 단서 ON → 배당차액 입력 disabled·0 표시(3중 일치 `?? false`)
- [ ] "보유 주식 수" 라벨 §63②3호 ON 시 "증자 신주(미상장) 보유 수" 전환(S-B)
- [ ] preview·사이드바 `computeStockValuation(item)` 재배선(C-B, D-8) — 미반영 시 stale
- [ ] preview 산식 텍스트 §63②3호 ON 시 "(가목 − 배당차액) × 신주수"(S-C)
- [ ] 결과카드 배당차액 차감 행 + lawRef = `VALUATION.DIVIDEND_DIFFERENCE`·`CAPITAL_INCREASE_UNLISTED`(S-5)
- [ ] `listedStockItemSchema` 3필드 Zod 확장 + 신규 3필드 폼→Zod→route strip 0 grep(C-D)
- [ ] flag on·배당차액 미입력 차단 아님(차감 0 + warning, U-4) — validation 동기화(⑧)
- [ ] `npx tsc --noEmit` 0 + `npm test`(상장주식 회귀 포함) + e2e T-L3-1~4
