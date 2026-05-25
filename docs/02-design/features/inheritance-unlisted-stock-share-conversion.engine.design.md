# Engine Design — 비상장주식 주식수 환산(§17의3⑤) 충실도·견고성 개선

> Plan: `docs/00-pm/inheritance-unlisted-stock-share-conversion-robustness.plan.md`
> 성격: **엔진 전용** (UI는 경고 노출 위치 정책 결정 1건 외 신규 작업 없음 — §UI 통합 위임). numeric 결과 정정은 대용량 정밀도 1건에 한정.
> 대상 파일: `lib/tax-engine/property-valuation/converted-shares.ts` · `unlisted-orchestrator.ts`

## Context

비상장주식 V2 평가(별지 부표3)의 1주당 순손익가치는 사업연도별 순손익액을 **환산주식수**(§17의3⑤)로 나눠 산정한다. 현행 환산 경로(`unlisted-orchestrator.ts:83-101`)는 `applyShareConversion`이 입력·날짜와 무관하게 항상 `totalShares`를 반환하는 인라인 단순화 로직이다.

telescoping 항등식(계획서 §0)상 **정상 complete-chain 입력의 결과값은 정확**하나, 다음 3가지 충실도·견고성 결함이 있다 — ① `calcConvertedShares` dead + no-op 함정 코드, ② §56③ 단서가 명시한 3년 윈도우 필터 미적용(§56⑤ 순손익 조정과 불일치), ③ 대용량(1억주 부근 홀수곱) 부동소수 정밀도 손실(유일한 실제 numeric 버그). 본 설계는 환산식을 **연도별 누적 환산으로 충실 재구현**하여 산식 준수를 코드에서 검증 가능하게 하고, 윈도우 필터·정밀도·입력 모순 방어를 추가한다.

---

## ★ 케이스 인벤토리 (필수 — 계획서 §5 ↔ 본 디자인 1:1)

| # | 시나리오 | 법령 근거 | anchor 입력 (S₀ / totalShares / 변동) | 기대 [1·2·3년전] | 현행 | 테스트 파일 | 상태 |
|---|---------|----------|------|------|------|-----------|------|
| SC-1 | PDF 사례 1 직전연도 단일 | §17의3⑤ 1호 | 100k / 180k / 2021 +80k | [180k,180k,180k] | PASS | `converted-shares.test.ts` | ☐ |
| SC-2 | 다년도 분산 증자 | §17의3⑤ 1호 | 100k / 180k / 2020 +50k·2021 +30k | [180k,180k,180k] | PASS | 〃 | ☐ |
| SC-3 | 무상증자만 | §56③ 단서·§17의3⑤ 1호 | 100k / 150k / 2021 무상 +50k | [150k,150k,150k] | PASS | 〃 | ☐ |
| SC-4 | 감자 | §17의3⑤ 2호 | 100k / 60k / 2021 −40k | [60k,60k,60k] | PASS | 〃 | ☐ |
| SC-5 | 증자+감자 혼합 | §17의3⑤ 1·2호 | 100k / 150k / 2020 +100k·2021 −50k | [150k,150k,150k] | PASS | 〃 | ☐ |
| SC-6 | 대용량 clean | §17의3⑤ 1호 | 1억 / 1.5억 / 2021 +5천만 | [1.5억×3] | PASS(우연) | 〃 | ☐ |
| **SC-6b** | **대용량 odd-product (정밀도)** | §17의3⑤ + 정수연산 | 99,999,999 / 133,333,333 / 2021 +33,333,334 | [133,333,333×3] | **FAIL 확정** | 〃 | ☐ |
| SC-7 | 윈도우 밖 변동 | §56③ 단서 | 200k / 200k / 2018(밖) +100k, 윈도우 내 0 | [200k,200k,200k] + 제외 경고 | 값 PASS·경고 無 | 〃 | ☐ |
| SC-8 | 결산 후~평가일 변동 | §56③ 본문·단서 | 100k / 180k / 2022.3 +80k (평가 2022.6.30) | [180k,180k,180k] | PASS | 〃 | ☐ |
| SC-9 | 체인 모순 방어 | (방어) | 윈도우 변동합 > totalShares(50k) | conv[0]=50k 유지 + 경고 (throw 금지) | 경고 無 | 〃 | ☐ |
| SC-10 | 동일 사업연도 복수 증자 (Q4) | §17의3⑤ 1호 | 100k / 180k / 2021 유상 +50k·무상 +30k | [180k,180k,180k] | — | 〃 | ☐ |
| EQ | 결과동일성 (리팩터 안전망) | — | SC-1·2·3·4·5·8 재구현=현행 | bit-identical | — | 〃 | ☐ |
| INT | 통합 (downstream ⑤ 불변) | §54①·§56① | `evaluateUnlistedStockV2`(SC-2/SC-4) | `convertedShares`+`perShareNetIncome`+`netIncomePerShare`(⑤) 무변경 | — | `case-1-net-income-calc.test.ts` 패턴 | ☐ |

**규칙**: SC-6b는 Pre-Do에 우선 작성해 현행 FAIL을 확보(계획서 §4 실행순서). 실제 FAIL 미발생 시 인수를 홀수곱으로 재조정.

---

## 법령 근거 (KoreanLaw 검증 완료 — 계획서 §0)

```
상증령 §56③ 본문: 각 사업연도의 주식수는 각 사업연도 종료일 현재의 발행주식총수에 의한다.
상증령 §56③ 단서: 다만, 평가기준일이 속하는 사업연도 이전 3년 이내에 증자 또는 감자를 한
                 사실이 있는 경우에는 증자 또는 감자전의 각 사업연도 종료일 현재의
                 발행주식총수는 재정경제부령으로 정하는 바에 따른다. → §17의3⑤
상증규 §17의3⑤ 1호(증자): 환산주식수 = 증자 전 각 사업연도 말 주식수
                 × (증자 직전 사업연도말 주식수 + 증자 주식수) / 증자 직전 사업연도말 주식수
상증규 §17의3⑤ 2호(감자): 환산주식수 = 감자 전 각 사업연도 말 주식수
                 × (감자 직전 사업연도말 주식수 − 감자 주식수) / 감자 직전 사업연도말 주식수
```
환산식은 **주식수만** 사용(가액 무관). 무상증자도 환산 대상(§56③ "증자"). §56⑤(순손익 조정)은 **유상**만 — 적용 대상 차이 유지(이미 `capital-increase-adjustment.ts`에 구현·정상).

---

## 엔진 input / result 타입 — 무변경

`UnlistedCapitalChange`(`changeType`/`changeDate`/`sharesIssued`/`pricePerShare`)·`UnlistedStockValuationInput`·`FiscalYearBreakdown.convertedShares`·`warnings` 모두 **기존 그대로**. 신규 공개 타입 없음. → 14지점 동기화 대상 아님(계획서 §6).

내부 함수 시그니처(공개 export 유지):
```ts
// converted-shares.ts — 충실 재구현
export function calcConvertedShares(args: {
  totalShares: number;
  fiscalYearEndDates: [Date, Date, Date];   // [1년전, 2년전, 3년전]
  evaluationDate: Date;
  capitalChanges: UnlistedCapitalChange[];
}): { convertedShares: [number, number, number]; warnings: string[]; windowChangeCount: number };

// applyShareConversion 은 내부 헬퍼로 유지하되 safeMultiply 기반 정밀 산식으로 교체
```

---

## 계산 알고리즘 (충실 §17의3⑤ — no-op 루프 대체)

```
1. 윈도우 필터 (§56③ 단서)
   windowStart = 3년전 사업연도 개시일 (= fiscalYearEndDates[2] − 1년 + 1일, 12개월 가정 — §9 한계 공유)
   W = capitalChanges.filter(c => windowStart ≤ c.changeDate ≤ evaluationDate)
        .sort(asc by changeDate)
   excludedCount = capitalChanges.length − W.length   // 경고용

2. 각 사업연도말 실제주식수 actual[0..2] 역산
   actual[i] = totalShares − Σ{ signed(ch) : ch ∈ W, ch.changeDate > fiscalYearEndDates[i] }
   signed(ch) = ch.changeType==="capital_reduction" ? −sharesIssued : +sharesIssued

3. conv[i] 초기화 = actual[i]

4. 변동 직전 **실제 잔고(running)**를 추적하며 ratio 누적 곱:
   countBefore = totalShares − Σ{ signed(ch) : ch ∈ W }   // 첫 변동 직전 잔고
   각 변동 ch ∈ W (asc):
     countAfter = countBefore + signed(ch)
     for each i where fiscalYearEndDates[i] < ch.changeDate:   // "변동 이전 각 사업연도"
         conv[i] = floorRatio(conv[i], countBefore, countAfter)   // conv[i] × countAfter/countBefore
     countBefore = countAfter
   ※ 분모는 **변동 직전 running 잔고**(FY말 고정값 아님). 동일 사업연도 복수 변동도 순차 비율로
     적용되어 telescoping 정합(예: 2021 +50k 후 +30k → 1.5×1.2 누적, FY말 고정분모면 195k 오류). §8-5 Q4 해소.

5. 검증(PR-2):
   - prior ≤ 0 또는 (prior + signed) ≤ 0 → 환산 불가: conv[i] = actual[i] 유지 + warning
   - actual[2] ≤ 0 (최초 사업연도 추정 음수) → warning (자동 보정 금지)
   - excludedCount > 0 → "윈도우(3년) 밖 변동 N건 환산 제외" warning

6. return { convertedShares: conv, warnings, windowChangeCount: W.length }
```

`floorRatio(base, denom, numer)` = `Math.floor(Number(safeMultiply(base, numer) / BigInt(denom)))`. denom===base 통상케이스는 `numer` 직접 반환(곱·나눗셈 무의미 — 정밀도 100%). **정상 complete-chain → conv = [totalShares, totalShares, totalShares]** (telescoping, 계획서 §0 증명).

### 오케스트레이터 통합 (`unlisted-orchestrator.ts:83-101`)
인라인 `totalCapitalDelta`/`applyShareConversion` 블록 **삭제** → `calcConvertedShares({...})` 1회 호출로 교체. 반환 `warnings`는 기존 `warnings` 배열에 concat, `appliedRules`에 "§17의3⑤ 환산 — 윈도우 내 N건" push.

---

## Silent fallback / 자동 안분 후보 식별

- **자동 보정 금지** (`[[feedback_no_silent_apportion_fallback]]`): 체인 모순(SC-9)·prior≤0 시 임의 값 채우지 않고 `actual` 유지 + 경고. throw 금지(평가 중단 방지).
- **윈도우 밖 변동**: 침묵 무시 금지 — 입력 보존하되 "환산 제외" 경고 노출(SC-7).
- 환산 불가 분기에서도 결과는 산출(경고로 사용자 판단 위임).

---

## 모듈 구조 · 800줄 정책

| 파일 | 현행 | 예상 후 | 비고 |
|---|---|---|---|
| `converted-shares.ts` | 133줄 | ~200줄 (재구현 + 검증 + 주석) | 한도 내 |
| `unlisted-orchestrator.ts` | 307줄 | −15줄 (인라인 제거) | 감소 |
| `converted-shares.test.ts` | 신규 | ~260줄 (14 anchor) | 신규 |

`calcConvertedShares` 외부 export 유지 → `[[feedback_800line_split_export_preservation]]` 불필요(분할 아님). no-op 루프 제거는 동작 변경(현행 미사용이므로 회귀 0).

---

## 테스트 약속

- 케이스 인벤토리 전 행 = anchor: 단위 11(SC-1·2·3·4·5·6·6b·7·8·9·10) + EQ 1 + INT 2(SC-2·SC-4 통합) = **14건** (계획서 §7 일치).
- **Pre-Do 우선**(`[[feedback_pre_anchor_verification]]`): SC-2·SC-4(현행 PASS 기준선) + SC-6b(현행 FAIL 확정) 선작성 → 디자인 환류.
- **EQ anchor**: 재구현 결과가 현행과 bit-identical(complete-chain) — 리팩터 회귀 0 증명.
- 회귀: `npx vitest run __tests__/tax-engine/property-valuation/`(case-1·1b·3·4·5*) → 전체 `npm test`(공유 모듈 영향).

---

## UI 통합 위임 (grep 실측 2026-05-25)

타입 무변경이라 14지점 동기화는 불요하나, **신규 warnings 노출 위치는 정책 결정 필요** (Step 6 검토 발견):

| 컴포넌트 | warnings 렌더 | 비고 |
|---|---|---|
| `PerShareValuationResultCard.tsx:193` (주 결과 카드) | ✅ 렌더 | SC-7/SC-9 신규 경고 **자동 표시됨** |
| `Page6NetIncomeBreakdown.tsx` (환산주식수 **표시 위치**) | ❌ 미렌더 | 환산주식수 표 옆 경고 부재 |
| `BesshiForm4Buppyo3PrintView.tsx` (인쇄용 별지) | ❌ 미렌더 | 감사 문서에 경고 없음 |

**결정 사항 (Plan/Do 확정)**: 주 결과 카드 경고로 충분 → **UI 작업 0** (권장, 디폴트) / 또는 별지 Page6 환산주식수 표 하단에 경고 1행 추가 → **UI 시니어 `inheritance-gift-tax-ui-senior` 소작업 1건**. 정상 complete-chain은 신규 경고가 발생하지 않으므로(SC-1~6·8 경고 無) 실무 영향 경미 → 디폴트 채택 시 명문화.

완료 전: `convertedShares` 직접 참조 컴포넌트(Page6) 표시 정합 grep 1회(`[[feedback_engine_result_display_drift]]`) + ⑤⑥⑦ 무영향 self-grep 1회.

---

## 미정 사항 (계획서 §8 동기화)

1. 동일 사업연도 내 복수 증자 비율 분모(합산 1회 vs 순차) — NTS 실무 확인.
2. 불균등 증자(제3자 배정) telescoping 유지 — KoreanLaw 해석례 확인(count-only라 유지 예상).
3. SC-8 평가연도 변동의 §17의3⑤ 환산 대상 여부 — 통설 환산, 명문 확인.
4. SC-6b 단주 절사 방향(floor 계승, PR-I 정책 정합).
5. UI 경고 노출 위치 — 주 카드(렌더됨)로 충분 vs Page6/인쇄뷰 경고 1행 추가 (§UI 통합 위임 ↔ 계획서 §8-6 동기화. 디폴트 UI 작업 0).
