# 비상장주식 V2 — 주식수 환산(§17의3⑤) 충실도·견고성 개선 (작업계획서)

> 작성일: 2026-05-25 · 도메인: 상속세·증여세 (정식평가 V2) · 성격: **엔진 전용 (법령 충실도·견고성·검증·테스트 보강 — numeric 결과 정정은 대용량 정밀도 1건에 한정)**
> 관련 파일: `lib/tax-engine/property-valuation/converted-shares.ts` · `unlisted-orchestrator.ts` · `capital-increase-adjustment.ts`
> 시니어: `inheritance-gift-tax-senior` (+ `property-valuation-senior`) · QA: `inheritance-tax-qa` / `gift-tax-qa`
> **범위 확정: 결함 4건 전부** (#1 no-op 함수 재구현 + #2 윈도우 필터 + #3 대용량 정밀도 + #4 검증·anchor). #1·#2는 numeric 무영향 충실도·방어, #3만 결과 정정 — §8-4·§0 참조

---

## 0. ★ 재평가 결과 — 사용자 보고 정정 (가장 먼저 읽을 것)

초기 코드 진단에서 "주식수 환산은 PDF 교재 사례에만 정확하고 일반 케이스는 미구현"이라 보고했으나, **심층 분석 결과 이는 과장이었음**을 정정한다.

**핵심 사실 — 누적 곱(telescoping) 항등식:**

§17의3⑤ 환산식은
```
환산주식수 = 증자 전 각 사업연도 말 주식수
           × (증자 직전 사업연도 말 주식수 + 증자 주식수) / 증자 직전 사업연도 말 주식수
```
이를 평가기간(3년) 내 모든 증자·감자에 **누적 적용**하면, 각 변동의 비율이 직전 사업연도말 주식수를 분모로 하므로 곱이 **망원경처럼 상쇄(telescope)** 되어, 가장 오래된 연도의 환산주식수가 평가기준일 발행주식총수(`totalShares`)와 **정확히 일치**한다.

증명 (변동 c₁(2년전), c₂(1년전), 최초 실제주식수 S₀):
```
2019환산 = S₀ × (S₀+c₁)/S₀ × (S₀+c₁+c₂)/(S₀+c₁) = S₀+c₁+c₂ = totalShares
2020환산 = (S₀+c₁) × (S₀+c₁+c₂)/(S₀+c₁)            = totalShares
2021      = totalShares (실제)
```
→ **체인이 완결되면(평가기간 내 모든 변동이 `capitalChanges`에 포착) 3개 연도 환산주식수는 항상 `totalShares`로 균등.** 다년도·복수·감자 케이스에서도 결과값은 정확하다. 현행 구현이 `[totalShares, totalShares, totalShares]`를 반환하는 것은 PDF 사례의 우연이 아니라 **일반해(一般解)와 일치**한다.

**결론: 정상 complete-chain 입력에서는 결과값(numeric) 버그가 없다.** `applyShareConversion(p,d)`가 입력·윈도우·증감 종류와 무관하게 항상 `p+d = totalShares`를 반환하고, 그것이 telescoping 항등식상 정답이기 때문이다. **유일한 잠재 numeric 버그는 대용량 주식수의 부동소수 정밀도(#3 — 후술)뿐**이며, 그마저 "지저분한(non-clean)" 큰 수에서만 발동한다. 본 계획서는 "환산식 재구현"이 아니라 아래 **충실도·견고성 결함 4건** 정비가 목적이다.

> Pre-Do 게이트: 위 telescoping 항등식이 **불균등 증자(제3자 배정 등)** 사례에서도 성립하는지 — 환산식이 count-only(가액 무관)이므로 성립 예상. Do 착수 전 KoreanLaw 해석례(불균등 증자 환산) 1회 추가 확인 권장.

### ★ KoreanLaw MCP 검증 결과 (2026-05-25, 조회 완료)

조회: 상증령 §56 (MST 283637, 시행 2026-02-27) · 상증규 §17의3 (MST 284609, 시행 2026-03-20)

| 검증 항목 | 결과 | 근거 (원문) |
|---|---|---|
| §17의3⑤ 환산식 (증자·감자 2호) | ✅ 코드 주석과 **verbatim 일치** | "환산주식수 = 증자 전 각 사업연도 말 주식 수 × (증자 직전 사업연도말 주식 수 + 증자 주식 수) / 증자 직전 사업연도말 주식 수" |
| telescoping → `[totalShares×3]` 정상결과 | ✅ **원문상 정확** (분모 = "증자 직전 **사업연도말** 주식수" 고정 → 누적 곱 상쇄) | §56③ 본문 + §17의3⑤ |
| 유상/무상 구분 (환산 vs 순손익조정) | ✅ 코드 정확 | §56③·§17의3⑤ = "증자 또는 감자"(무상 포함) / §56⑤ = "**유상**증자·**유상**감자"(유상만) |
| **3년 윈도우 필터** | ⚠️ **법령 충실도 위배** (결함 #2 — numeric 무영향) | §56③ 단서 "평가기준일이 속하는 사업연도 **이전 3년 이내**에 증자 또는 감자" → 환산은 3년 내 변동에만 적용함이 구조적으로 명시. 현행 환산 경로는 `changeDate` 미사용·전 변동 합산. **단, 결과값은 정상입력에서 여전히 `totalShares`로 정확**(§1-3) → 수정 정당성은 "법령 구조 충실·감사가능성·incomplete-chain 방어"이지 numeric-bug 정정이 아님 |
| (부수) 1년 미만 사업연도 | 📌 범위 외 후속 신호 | §17의3② "사업연도가 1년 미만인 경우에는 1년으로 계산" — 현행 `capital-increase-adjustment.ts:67-70` 12개월 하드코딩. 설립초년·결산기변경 미구현 |

→ **결론: 정상 complete-chain 결과는 모든 케이스(윈도우·다년도·감자)에서 법령 정합.** §17의3⑤ 환산식·유상무상 구분 오류 없음. **유일 잠재 numeric 버그 = 대용량 정밀도(#3)**, dirty-number에서만 발동. 윈도우(#2)·no-op(#1)는 numeric 무영향의 충실도·방어 결함.

---

## 1. 배경 — 현행 동작 분석

### 1-1. 환산이 실제로 계산되는 경로 (`unlisted-orchestrator.ts:83-101`)

```ts
const totalCapitalDelta = input.capitalChanges.reduce((sum, c) => {
  const sign = c.changeType === "capital_reduction" ? -1 : 1;
  return sum + sign * c.sharesIssued;
}, 0);                                              // ← 전 변동 단순 합산 (날짜 무시)
const priorEndShares = input.totalShares - totalCapitalDelta;
const convertedShares = [
  input.totalShares,                                // 1년전 (하드코딩)
  priorEndShares > 0 ? applyShareConversion(priorEndShares, totalCapitalDelta) : input.totalShares,
  priorEndShares > 0 ? applyShareConversion(priorEndShares, totalCapitalDelta) : input.totalShares,
];
```
`applyShareConversion(p, d)` = `floor(p × (p + d) / p)` = `p + d` = `totalShares`. 따라서 **이 함수는 입력과 무관하게 항상 `[totalShares, totalShares, totalShares]`를 반환**한다(`priorEndShares ≤ 0` fallback도 `totalShares`). §0의 항등식 덕분에 **정상 complete-chain 입력에서는 결과가 맞지만**, **코드가 §17의3⑤를 충실히 표현하지 않는다** — 감사자·리뷰어가 산식 준수를 코드에서 검증할 수 없고, 연도별 환산 구조가 드러나지 않는다.

### 1-2. dead + no-op 일반 함수 (`converted-shares.ts:42-95`)

`calcConvertedShares()`는 §17의3⑤를 연도별로 구현하려는 일반 함수로 보이나:
- **호출처 0건** (grep 확인 — 정의부 1줄뿐, 테스트 포함 미사용).
- 내부 루프(`:72-89`)가 `converted = converted;` **무연산(no-op)** 으로 끝나, 호출해도 환산 없이 입력값을 그대로 반환한다 (주석 `:88` "명시"가 사실상 빈 동작).

→ **함정 코드**: 주석은 §17의3⑤ 환산을 한다고 선언하지만 실제로는 하지 않는다. 향후 누군가 이 함수를 신뢰해 wiring하면 침묵 오류 발생.

### 1-3. §56⑤ 순손익액 조정과의 윈도우 필터 불일치

| 항목 | 날짜 윈도우 필터링 | 위치 |
|---|---|---|
| §56⑤ 순손익액 조정 | ✅ `changeDate`를 사업연도 시작·종료일과 비교해 윈도우·월할 처리 | `capital-increase-adjustment.ts:72-84` |
| §17의3⑤ 주식수 환산 | ❌ `changeDate` 전혀 미사용 — 전 변동 무조건 합산 | `unlisted-orchestrator.ts:87-90` |

→ `capitalChanges`에 **평가기간(3년) 밖 변동**이 1건이라도 섞이면, §56⑤는 올바르게 무시하나 §17의3⑤ 경로는 `totalCapitalDelta`에 합산한다. **단, numeric 결과는 여전히 정확**하다: `priorEndShares`가 왜곡되어도 `applyShareConversion`이 `priorEndShares + delta = totalShares`로 복원하고, 윈도우 밖 변동은 in-window 연도 실제주식수에 이미 흡수되어 정답도 `totalShares`이기 때문(§0 항등식). 따라서 이는 **numeric 버그가 아니라 (a) 법령 구조 위배(§56③은 윈도우를 명시) (b) incomplete-chain·모순 입력에 대한 방어 부재** 문제다. 두 경로가 동일 입력에 다른 윈도우 규칙을 적용하는 **일관성 결함**이며, 충실한 `calcConvertedShares` 재구현 시 윈도우 필터가 산식상 필수가 된다.

### 1-4. 대용량 주식수 정수 정밀도 (`converted-shares.ts:131`)

`Math.floor(priorEndShares * (priorEndShares + capitalDelta) / priorEndShares)` — 곱셈을 나눗셈보다 먼저 수행한다. `priorEndShares × (priorEndShares+delta)`의 중간곱이 `Number.MAX_SAFE_INTEGER(2^53 ≈ 9.007e15)`를 넘으면 **정수 정밀도 손실**. 발동 조건: 중간곱 > 2^53 **이고** 그 값이 해당 크기의 ULP 배수가 아닐 때. [2^53, 2^54) 구간 ULP=2이므로 **중간곱이 홀수면 비표현 → 손실 확정**, 짝수면 표현 가능 → 우연 정확. 따라서 `priorEndShares`와 `priorEndShares+delta`가 **둘 다 홀수**(곱=홀수)이고 1억주 부근이면 FAIL 확정(예: 99,999,999 × 133,333,333). clean한 수(1e8×1.5e8=1.5e16, 짝수)는 우연 PASS. 이것이 본 작업의 **유일한 실제 numeric 버그**. 프로젝트 정수 연산 정책상 `safeMultiply`(BigInt fallback) 또는 산식 단순화(`priorEndShares + delta` 직접 계산 — 곱·나눗셈 무의미)로 해소.

---

## 2. 목표

§17의3⑤ 주식수 환산을 **(a) 산식에 충실하고 (b) 날짜 윈도우를 §56⑤와 일관되게 적용하며 (c) 대용량 주식수에서 정밀하고 (d) 체인 불완전·입력 모순을 검증**하도록 정비한다. **현행 정상 결과(complete chain → totalShares)는 회귀 0으로 보존**한다.

---

## 3. 법령 근거 (KoreanLaw 검증 완료 — §0 검증표 참조)

| 조문 | 내용 | 본 작업 적용 |
|---|---|---|
| 상증령 §56③ 본문 | 각 사업연도 주식수 = 각 사업연도 종료일 현재 발행주식총수 | 환산 기준 |
| 상증령 §56③ 단서 | 평가기준일 속한 사업연도 **이전 3년 이내** 증자·감자 시 §17의3⑤ | ★ 3년 윈도우 필터 근거 |
| 상증규 §17의3⑤ 1호 | 증자: 환산주식수 = 증자 전 사업연도말 × (직전말+증자)/직전말 | ★ 핵심 산식 |
| 상증규 §17의3⑤ 2호 | 감자: 환산주식수 = 감자 전 사업연도말 × (직전말−감자)/직전말 | ★ 핵심 산식 |
| 상증령 §56⑤ | 유상증자·감자 시 순손익액 조정 (별개 항목 — 이미 구현·정상) | 윈도우 일관성 기준 |

> 환산식은 유상·무상·감자 **주식수**만 사용(가액 무관). 무상증자도 환산 대상(§56③ 단서 "증자"). §56⑤(순손익 조정)은 유상만 — 두 조문의 적용 대상 차이 유지.

---

## 4. 작업 범위 (PR 분할)

### PR-1 — `calcConvertedShares` 충실 재구현 + 윈도우 필터 + 단일 진입점화

1. `calcConvertedShares(input)`를 §17의3⑤대로 **연도별 누적 환산**으로 재구현:
   - 입력: 3개 사업연도 종료일 `[Date,Date,Date]`, `totalShares`, `capitalChanges`.
   - **3년 윈도우 필터**: `changeDate`가 `[3년전 사업연도 종료일, 평가기준일]` 범위 밖이면 제외 (§56③ 단서 + §56⑤ 필터와 동일 기준).
   - 각 변동을 `changeDate` 오름차순 정렬 → 변동별 **직전 running 잔고(countBefore)**를 분모로 ratio `countAfter/countBefore` 산정 → 해당 변동 **이전** 사업연도들의 기 환산값 `conv[i]`에 누적 곱. **동일 사업연도 복수 변동도 running 잔고로 순차 적용**(FY말 고정 분모 금지 — Q4·SC-10). 디자인 §계산알고리즘 step 4와 동일.
   - 무연산 루프 제거.
2. 오케스트레이터(`:83-101`)의 인라인 단순화 로직을 `calcConvertedShares()` 호출로 **교체** → 단일 진입점.
3. **정밀도**: 비율 곱은 `safeMultiply` 또는 분자/분모 정수 순서 조정(나눗셈 마지막 1회, 잔차 절사 정책 명시 — `[[feedback_floor_residual_absorption]]` 참고). 단주(端株) 처리는 기존 PR-I 정책(`Math.floor` 절사) 계승.

### PR-2 — 입력 모순 검증 + 경고

1. **체인 일관성 검증**: 윈도우 내 변동 합으로 역산한 `최초 사업연도 추정 주식수 ≤ 0` 또는 `totalShares`와 모순 시 `warnings`에 추가 (자동 보정 금지 — `[[feedback_no_silent_apportion_fallback]]`).
2. **윈도우 밖 변동 안내**: `capitalChanges`에 3년 밖 항목이 있으면 "환산 제외" 경고 노출 (사용자 입력 보존, 침묵 무시 금지).
3. `appliedRules`에 "§17의3⑤ 환산주식수 — 윈도우 내 N건 반영" 메타 추가.

### PR 실행 순서 (Pre-Do 정책 — `[[feedback_pre_anchor_verification]]`)

> PR 번호는 논리 묶음이며 **실행 순서는 PR-3 일부 → PR-1 → PR-2 → PR-3 잔여**다. anchor를 구현보다 먼저 써야 현행 동작을 고정·관찰할 수 있다.

1. **PR-3(선)**: §5 anchor 매트릭스 중 [SC-2 다년도], [SC-4 감자], **[SC-6b non-clean 대용량]** 을 **먼저 작성·실행**.
   - 예상: SC-2·SC-4는 **현행 PASS**(현행도 정답) → "결과 무변경 보존" 기준선 확보.
   - SC-6b만 **현행 FAIL 가능**(정밀도 손실) → 유일 실제 버그 노출.
2. **PR-1**: `calcConvertedShares` 충실 재구현 + 윈도우 필터 + `safeMultiply` (위 anchor 녹색화).
3. **PR-2**: 입력 모순·윈도우 밖 검증·경고.
4. **PR-3(잔여)**: SC-1·3·5·7·8·9 + 통합 + 결과동일성(EQ) anchor 완성.

---

## 5. anchor 매트릭스 (`__tests__/tax-engine/property-valuation/converted-shares.test.ts` 신규)

> 열 정의: **S₀ = 최초(가장 오래된) in-window 사업연도 실제 발행주식수** · **totalShares = 평가기준일 현재 발행주식총수**(엔진 입력) · 기대값 = `[1년전, 2년전, 3년전]` 환산주식수.

| ID | 시나리오 | S₀ | totalShares | 변동 | 기대 [1·2·3년전] | 현행 | 목적 |
|---|---|---|---|---|---|---|---|
| SC-1 | PDF 사례 1 (직전연도 단일) | 100k | 180k | 2021 +80k | [180k,180k,180k] | PASS | 회귀 보존 |
| SC-2 | 다년도 분산 증자 | 100k | 180k | 2020 +50k, 2021 +30k | [180k,180k,180k] | PASS | telescoping 균등 |
| SC-3 | 무상증자만 | 100k | 150k | 2021 무상 +50k | [150k,150k,150k] | PASS | 무상 환산 대상 |
| SC-4 | 감자 | 100k | 60k | 2021 −40k | [60k,60k,60k] | PASS | 2호 감자식 |
| SC-5 | 증자+감자 혼합 | 100k | 150k | 2020 +100k, 2021 −50k | [150k,150k,150k] | PASS | 부호 혼합 telescoping |
| SC-6 | 대용량 clean | 1억 | 1.5억 | 2021 +5천만 | [1.5억×3] | PASS(우연) | clean은 손실 없음 확인 |
| **SC-6b** | **대용량 odd-product (★정밀도)** | 99,999,999 | 133,333,333 | 2021 +33,333,334 | [133,333,333×3] (정수 정확) | **FAIL 확정²** | **유일 실제 numeric 버그 노출** |
| SC-7 | 윈도우 밖 변동 | 200k(이미 흡수) | 200k | 2018(밖) +100k, 윈도우 내 0 | [200k,200k,200k] + 제외 경고 | PASS(값)·경고 無 | 충실도·경고 anchor (값은 현행도 정답) |
| SC-8 | 결산 후~평가일 변동 | 100k | 180k | 2022.3 +80k (평가 2022.6.30, 결산 12월) | [180k,180k,180k] | PASS | 평가연도 변동 환산¹ |
| SC-9 | 체인 모순 (방어) | — | 50k | 윈도우 변동 합 > totalShares | conv[0]=50k 유지 + 경고 (throw 금지) | 경고 無 | 모순 입력 안전 |
| **SC-10** | **동일 사업연도 복수 증자 (Q4)** | 100k | 180k | 2021 유상 +50k · 2021 무상 +30k | [180k,180k,180k] | — | running 잔고 분모 (FY말 고정분모면 195k 오류) |

¹ SC-8 주: 2022.3 변동은 "평가기준일이 속하는 사업연도(2022)" 내 발생. 평가기준일 발행주식총수(180k)에 반영되므로, 직전 3개 사업연도(2021/2020/2019, 각 100k)는 직전 사업연도말(2021말 100k) 기준 ratio 1.8로 환산 → 180k. (Pre-Do KoreanLaw 해석 확인 대상 §8-5)
² SC-6b FAIL 확정 근거: priorEnd=99,999,999(홀수), totalShares=133,333,333(홀수) → 중간곱 `99,999,999 × 133,333,333`(홀수×홀수=홀수) ≈ 1.333e16 ∈ [2⁵³, 2⁵⁴) 구간 ULP=2 → **홀수는 비표현** → float 반올림 → `floor(…)` ≠ totalShares. (짝수곱이면 표현 가능해 우연 PASS — SC-6와 대비. Pre-Do에서 실제 FAIL 미발생 시 인수를 홀수곱으로 재조정)

추가 anchor:
- **EQ (결과동일성)**: SC-1·2·3·4·5·8의 재구현 결과가 현행과 **bit-identical**임을 회귀 보존(리팩터링 안전망).
- **통합**: `evaluateUnlistedStockV2` 전체로 SC-2/SC-4 통과 → `fiscalYearBreakdowns[i].convertedShares` + downstream `perShareNetIncome`·`netIncomePerShare`(⑤) 무변경 검증 (`case-1-net-income-calc.test.ts` 패턴).

---

## 6. 14개 동기화 지점 영향 — 대부분 N/A (엔진 전용)

- **입력 타입 무변경**: `UnlistedCapitalChange`(`changeType`/`changeDate`/`sharesIssued`/`pricePerShare`)·`UnlistedStockValuationInput` 그대로 → ①~④·⑨~⑭ 영향 없음.
- **결과 타입 무변경**: `FiscalYearBreakdown.convertedShares`(이미 존재)·`warnings`(이미 존재) 재사용 → 신규 필드 없음.
- **Downstream 영향 추적**: `convertedShares` → 1주당 순손익액(`perShareNetIncome` = 최종순손익액 / 환산주식수, `unlisted-orchestrator.ts:104-108`) → 가중평균(아) → **1주당 순손익가치 ⑤** → 1주당 평가액 ⑥ → 최종 평가액. **정상 complete-chain에서 `convertedShares`는 재구현 후에도 `totalShares` 불변** → **⑤·평가액 전부 무변경**. 값이 달라지는 유일 경로는 SC-6b(정밀도 정정, ±수 주) — downstream도 미미 변동. ⑦ 결과 카드는 표시 산식 무변경, SC-6b만 정확화.
- **UI**: 환산주식수는 별지 6쪽 명세 노출 중. **주 결과 카드(`PerShareValuationResultCard.tsx:193`)는 `warnings` 렌더 → 신규 경고 자동 표시(grep 실측 확인)**. 단 **환산주식수가 실제 표시되는 `Page6NetIncomeBreakdown.tsx`·인쇄용 `BesshiForm4Buppyo3PrintView.tsx`는 warnings 미렌더** → **경고 노출 위치 정책 결정 1건**(디폴트: 주 카드로 충분·UI 작업 0 / 대안: Page6 표 하단 경고 1행 → `inheritance-gift-tax-ui-senior` 소작업). 정상 complete-chain은 신규 경고 미발생이라 실무 영향 경미. 디자인 §UI 통합 위임 참조.
- **Zod**: `capitalChanges` 스키마 무변경.

→ **본 작업은 14지점 동기화 대상이 아닌 순수 엔진 내부 개선**. 단, 완료 보고 전 `convertedShares`를 직접 참조하는 결과 컴포넌트 grep 1회로 표시 정합 확인 (`[[feedback_engine_result_display_drift]]`).

---

## 7. 회귀·DoD

- [x] KoreanLaw MCP §56③·⑤ + §17의3⑤ 원문 검증 완료 (2026-05-25 — §0 검증표). 환산식·유상무상 구분 오류 없음 / 윈도우 필터는 §56③ 단서가 요구하나 현행 미적용(법령 충실도 위배, numeric 무영향). (잔여: 불균등 증자 해석례 1회 확인)
- [ ] Pre-Do anchor 3건(SC-2/4/**6b**) 선작성·실행 → **SC-2·4는 현행 PASS(기준선)**, **SC-6b만 현행 FAIL 예상(정밀도)** 확인 후 디자인 환류 (※SC-7은 값 PASS·경고만 신규 — numeric FAIL 아님)
- [ ] `calcConvertedShares` 충실 재구현 + 오케스트레이터 단일 진입점 교체 + no-op 루프 제거 + **EQ(결과동일성) anchor로 회귀 0 증명**
- [ ] §56⑤와 동일 3년 윈도우 필터 적용
- [ ] `safeMultiply` 정밀도 보강
- [x] 단위 anchor 11건(SC-1~10 + SC-6b) + EQ(결과동일성) + 통합 2건 = **14건** `toBe()` 통과 ✅
- [ ] `npx tsc --noEmit` 0건
- [ ] `npx vitest run __tests__/tax-engine/property-valuation/` 통과 (기존 case-1·1b·3·4·5* 회귀 0)
- [ ] **전체 `npm test`** (공유 모듈 property-valuation 영향 → 상속·증여 양쪽 회귀 확인 — `[[feedback_per_tax_test_scripts]]`)
- [ ] 800줄 정책 확인 (`converted-shares.ts` 현 133줄, 재구현 후 한도 내)

---

## 8. 미결 질문 (Plan 단계 확정 필요)

1. ✅ **해소 (구현)**: **동일 사업연도 내 복수 증자**는 **running 잔고 순차 적용**으로 구현(SC-10 anchor 통과). FY말 고정 분모는 2건째에서 비율 오류(195k) → 채택 안 함. running 순차(1.5×1.2)와 합산(1.8)은 telescoping상 동일 결과 → 정합. (잔여: NTS 실무 문헌 1회 대조 권장)
2. ✅ **확인 완료(미발견)**: **불균등 증자(제3자 배정)** — KoreanLaw 해석례·조세심판 재결례 검색('환산주식수' 등) **결과 없음**. 환산식이 count-only(가액 무관)라 본칙 §17의3⑤(verbatim 검증)로 telescoping 유지. 추정 인용 안 함.
3. SC-6b 대용량 정밀도 수정 시 **단주 절사 방향**(floor 계승) 재확인 — PR-I 정책과 충돌 없는지.
4. ✅ **확정**: 범위 = 결함 4건 전부. **결과 정정은 정밀도(#3, dirty-number)에 한정**, 윈도우(#2)·no-op(#1)는 법령 충실도·방어 정비(numeric 무영향). (사용자 지시 2026-05-25)
5. ✅ **확인 완료(미발견)**: **SC-8 평가연도 변동** — KoreanLaw 해석례 검색 결과 없음. §56③ 본문(평가기준일 현재 발행주식총수) + 단서 구조상 직전 3개 사업연도를 평가일 주식수로 환산하는 것이 정합(SC-8 anchor 통과). 통설 환산 대상. 추정 인용 안 함.
6. ✅ **디폴트 채택**: **UI 경고 노출 위치** — 주 결과 카드(`PerShareValuationResultCard`)가 warnings 렌더하므로 **UI 작업 0** 채택. 정상 complete-chain은 신규 경고 미발생. (사용자 요청 시 `Page6NetIncomeBreakdown.tsx` 경고 1행 추가 가능 — override 보존)

## 9. 후속 PR 신호 (범위 외 — 별도 계획서)

- **1년 미만 사업연도 (§17의3②)**: 현행 `capital-increase-adjustment.ts:67-70`이 사업연도 시작일을 "종료일 −1년 +1일"로 12개월 하드코딩. 설립 초년도·결산기 변경 법인은 §17의3②("1년 미만은 1년으로 계산")·§56⑤ 월할 기준이 어긋남. `FiscalYearAdjustment.fiscalYearEndDate`만으로는 시작일 도출 불가 → `fiscalYearStartDate` 입력 추가 + 1년 미만 보정 로직 필요. KoreanLaw §17의3② 근거 확보됨.
