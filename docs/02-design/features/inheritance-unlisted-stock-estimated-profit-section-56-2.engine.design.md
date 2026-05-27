# 비상장주식 §56② 추정이익 갈음 평가 — 엔진 설계

> **Plan**: `docs/00-pm/inheritance-unlisted-stock-estimated-profit-section-56-2.plan.md` (PR-G)
> **UI**: `inheritance-unlisted-stock-estimated-profit-section-56-2.ui.design.md` (별도)
> **법령 검증**: KoreanLaw MCP 2026-05-27 (상증령 mst=283637 / 상증규 mst=284609) — §54①④·§55③·§56①②·§59②③·§17의3①④ 전수 직접대조, 인용 오류 0

## Context

비상장주식 V2 정식평가는 §54①에 따라 **1주당 순손익가치(3) : 순자산가치(2)** 가중평균으로 산출한다. 순손익가치는 §56①·§17의3⑤·§17의3② 충실 구현 완료. 그러나 §56②(일시·우발적 사건 등 §17의3① 사유 + 절차요건 충족 시 **신용평가전문기관 등 둘 이상이 산출한 1주당 추정이익의 평균가액**으로 갈음)은 **본체 전무**(입력·Zod·UI·orchestrator 분기 0). 별지 부표3 양식은 제6쪽 7.차에서 추정이익 평균액을 이미 명시하나 엔진이 비어 있어 양식↔엔진 불일치 상태. 본 기능이 그 갭을 충실 구현으로 채운다.

**선행 정밀추적(2026-05-27)**: §54⑤(부동산과다)·§54⑥(평가심의위)·§54③(다른비상장 10%)·§17의2(보험)·§17의3②(1년미만) 모두 기구현 확인 → §56② 추정이익이 V2 평가 **유일 잔여 본체 갭**.

---

## ★ 케이스 인벤토리 (필수)

| # | 시나리오 | 법령 근거 | anchor 출처 | 테스트 파일 | 상태 |
|---|---------|----------|-------------|-----------|------|
| 1 | 요건 충족(기관 2개 평균 + 사유 + 절차 3) → 추정이익 평균가액 ÷ 환원율 갈음 | 영 §56② + 규 §17의3④ | 손계산 1,200원→12,000원 | `estimated-profit-section-56-2.test.ts` EP-1 | ☐ TODO |
| 2 | orchestrator 통합 — 갈음값이 `netIncomePerShare` 대체, §54① 3:2 가중 자동 전파 | 영 §54① + §56② | 손계산(미입력 케이스 대비) | 통합 EP-2 | ☐ TODO |
| 3 | 요건 미충족 — 기관 1개(둘 이상 아님) → 갈음 안 함, 현행 가중평균 유지 | 영 §56② 본문 "둘 이상" | numeric 불변 실증 | EP-3 | ☐ TODO |
| 4 | 절차요건 1개 false(예: 동일연도 아님) → 갈음 안 함 + warning | 영 §56② 2·3·4호 | warning 존재 | EP-4 | ☐ TODO |
| 5 | 추정이익 applied + 영업권>0 → §59③ 미반영 warning(D-4 scoped) | 영 §59③ | warning 존재 | EP-5 | ☐ TODO |
| 6 | 음수 추정이익 평균 → 0 강제 안 함(§56② "제1항에도 불구하고") + warning, 하류 80%하한 보정 | 영 §56②·§56①·§54① | 동작·warning | EP-6 | ☐ TODO |
| 7 | Zod superRefine — ON + 기관 1개 → parse 실패 path | 영 §56② "둘 이상" | parse error path | EP-7 (schema) | ☐ TODO |
| 8 | §17의3① 사유 7종(2~8호) 각 reasonCode 매핑·라벨 | 규 §17의3① | enum 정적 매핑 | EP-1 변형 + UI 라벨 | ☐ TODO |
| 9 | 미입력(estimatedProfit undefined) → 전 케이스 numeric 불변(회귀) | — | 기존 4900+ PASS 유지 | 전체 회귀 | ☐ TODO |

**규칙**: 행≥1 충족. EP-1~7 + 회귀(9) + reason 매핑(8). Do 진입 전 EP-1 RED 선확인([[feedback_pre_anchor_verification]]).

---

## 법령 근거 (lib/tax-engine/legal-codes/ 상수 사용)

```
영 §56②: 제1항에도 불구하고 다음 각 호의 요건을 모두 갖춘 경우에는 §54① 1주당 최근 3년간
         순손익액의 가중평균액을 둘 이상의 신용평가전문기관·회계법인·세무법인이 산출한
         1주당 추정이익의 평균가액으로 할 수 있다.
   1호: 규 §17의3① 사유 해당 (일시·우발적 사건 등)
   2호: §67·§68 신고기한까지 추정이익 평균가액 신고
   3호: 추정이익 산정기준일·평가서작성일이 신고기한 이내
   4호: 추정이익 산정기준일·상속개시(증여)일 동일 연도
규 §17의3①: 추정이익 사용 사유 (1호 삭제 / 2~8호) — 자산수증이익 50%초과(2)·합병분할업종변경(3)·
            §38합병증여(4)·1년이상휴업(5)·처분손익 50%초과(6)·매출 3년미만(7)·고시유사(8)
규 §17의3④: "1주당 추정이익의 평균가액" = 자본시장법 시행령 §176의5② 금융위 정한 수익가치 × §54① 환원율
영 §59③: 영업권 가중평균 순손익액은 §56①·② 준용 (D-4 — PR-G2 분리)
```

**★ 환원율 상쇄 (대수 검증)**: 추정이익 평균가액(= 수익가치 × 환원율)이 §56① 가중평균액(아.) 자리에 대입 → 순손익가치 = 추정이익 평균가액 ÷ 환원율 = **수익가치**. 기존 `calcPerShareNetIncomeValue` 무변경 재사용, 환원율 이중적용 없음.

---

## 엔진 input 타입

```ts
// lib/tax-engine/property-valuation/estimated-profit-section-56-2.ts
export type EstimatedProfitReasonCode =
  | "asset_receipt_50pct"          // 규 §17의3① 2호
  | "merger_split_business_change" // 3호
  | "merger_gift_section38"        // 4호
  | "closure_over_1yr"             // 5호
  | "disposal_gain_50pct"          // 6호
  | "sales_period_under_3yr"       // 7호
  | "similar_notified";            // 8호 (1호 삭제 — enum 제외)

export interface EstimatedProfitInput {
  reasonCode: EstimatedProfitReasonCode;        // §17의3① 택1
  agencyEstimates: number[];                    // 각 기관 1주당 추정이익 (≥2)
  filedWithinDeadline: boolean;                 // §56② 2호
  baseDateAndReportWithinDeadline: boolean;     // §56② 3호
  sameYearAsInheritanceOrGift: boolean;         // §56② 4호
}

// UnlistedStockValuationInput 에 추가
estimatedProfit?: EstimatedProfitInput;          // 미입력 = 옵션 OFF (현행 가중평균)
```

## 엔진 result 타입

```ts
export interface EstimatedProfitResult {
  applied: boolean;
  estimatedProfitAverage: number;   // 추정이익 평균가액 (아. 갈음) = floor(Σ/n)
  perShareIncomeValue: number;      // 순손익가치 ⑤ = floor(평균 ÷ 환원율)
  reasonCode?: EstimatedProfitReasonCode;
  agencyCount: number;
  warnings: string[];
}

// UnlistedStockValuationResult 에 echo 1필드 신규
estimatedProfitResult?: EstimatedProfitResult;   // 내부 .applied boolean 보유
// ★ netIncomePerShare 는 기존 result 필드(결과카드가 이미 읽음) — 신규 아님.
//   갈음 시 perShareIncomeValue 로 채워지도록 채움 방식만 변경 (F-7).
```

---

## 계산 알고리즘 (단계별)

`applyEstimatedProfit(input, capRate)`:
1. **요건 검증** (모두 true여야 applied):
   - `agencyEstimates.length >= 2` (§56② 둘 이상)
   - `reasonCode` 존재 (§17의3①)
   - `filedWithinDeadline && baseDateAndReportWithinDeadline && sameYearAsInheritanceOrGift` (2·3·4호)
   - 미충족 → `{applied:false, warnings:[구체 사유]}` 반환 (갈음 안 함)
2. `estimatedProfitAverage = Math.floor(Σ agencyEstimates / count)` (원 미만 절사)
3. `perShareIncomeValue = calcPerShareNetIncomeValue(estimatedProfitAverage, capRate)` (차. ÷환원율 헬퍼 재사용, floor)
4. 음수 평균 시 0 강제 안 함(§56② "제1항에도 불구하고") + warning (D-3)

`evaluateUnlistedStockV2` 통합 (STEP 5 직후):
```
weightedNetIncomePerShare = calcWeightedAvg3y(annualizedPerShare)  // 아.
let netIncomePerShare = calcPerShareNetIncomeValue(weightedNetIncomePerShare, capRate)  // 차.
if (input.estimatedProfit) {
  const ep = applyEstimatedProfit(input.estimatedProfit, capRate)
  if (ep.applied) {
    netIncomePerShare = ep.perShareIncomeValue          // §56② 갈음
    appliedRules.push(`상증령 §56② 추정이익 갈음 — §17의3① ${ep.reasonCode}`)
  } else warnings.push(...ep.warnings)
  if (ep.applied && goodwill.goodwillFinal > 0)
    warnings.push("§59③ 영업권 추정이익 준용 미반영 — 영업권은 실제 순손익 기준")  // EP-5
  estimatedProfitResult = ep                            // echo
}
// 하류: calcPerShareWeightedValuation(netIncomePerShare, netAssetPerShare, isRealEstateHeavy) ... 무변경
// return { ..., netIncomePerShare, estimatedProfitResult }   // F-7: 갈음값으로 채움
```

**하류 무변경 전파**: §54① 3:2(부동산과다 2:3) 가중 → §54④ 순자산단독 분기 → 80% 하한 → §63③ 할증 모두 갈음된 netIncomePerShare를 그대로 소비.

---

## Silent fallback / 자동 안분 후보 식별

- **추정이익 요건 미충족 시 자동 0채움·자동 갈음 금지** — applied=false → 현행 가중평균 경로 유지 + warning. 침묵 누락 0([[feedback_no_silent_apportion_fallback]]).
- **음수 평균 0 강제 금지** — 법문 displace 근거(§56② 제1항에도 불구하고) 명시, 임의 보정 안 함.
- **사유 자동판정 금지** — 2·6호(50% 초과)는 V2에 자산수증이익·처분손익 데이터 없어 자동판정 불가 → 사용자 선택. 절차 3요건도 첨부 선언(boolean).
- **Zod superRefine로 미충족 차단** — UI 통과↔validate 차단 모순 금지([[feedback_validation_sync_8th_point]]).

---

## 테스트 약속

- 케이스 인벤토리 9행 → EP-1~7 + reason 매핑(8) + 회귀(9) anchor.
- EP-1 손계산 원단위 `toBe()`: floor((1000+1400)/2)=1,200 / floor(1200/0.10)=12,000.
- 미입력 시 기존 전체 PASS 불변(numeric 영향 0 실증, [[feedback_numeric_impact_verify_before_bug_claim]]).
- EP-1 RED 선확인 후 GREEN(Pre-Do).

---

## UI 통합 위임

- UI 명세는 `inheritance-unlisted-stock-estimated-profit-section-56-2.ui.design.md`.
- V2 평가 서브시스템 8지점(S-1~S-8): type·신규모듈·orchestrator·Zod·폼조립·UI토글(신규 섹션4+재번호)·결과카드·besshi(화면+PDF).
- 엔진 시니어 = S-1~S-4(+EP anchor), UI 시니어 = S-5~S-8(+e2e 상속·증여 양쪽).
- **증여세 공용**(`GiftTaxForm` → `StockValuationForm`) — UI·e2e 양쪽 경로 포함.
- UI 토글 = **단순 ON/OFF**(객체 존재 여부, 3-state 아님). OFF 전환 시 입력 데이터 폐기 확인 shadcn Dialog([[feedback_dialog_data_discard_confirm]], window.confirm 금지). reasonCode→한국어 라벨 `Record<EstimatedProfitReasonCode,string>` 정적 매핑([[enum-verification-before-mapping]]).
