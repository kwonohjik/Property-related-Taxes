# 비상장주식 평가 PR-G — §56② 추정이익 갈음 평가 옵션 구현계획

> **Source**: `docs/00-pm/inheritance-unlisted-stock-valuation-followup.plan.md` §3 **PR-G (F-1)**
> **Date**: 2026-05-27
> **선행 정밀추적**: §54⑤·§54⑥·§54③·§17의2·§17의3② 모두 기구현 확인. **PR-G만 본체 전무** (입력·Zod·UI·orchestrator 분기 0). 본 계획이 유일 잔여 본체 갭을 채움.
> **정책**: [[feedback_korean_law_82_vs_81_2_drift]](추정 인용 금지) · [[feedback_pre_anchor_verification]] · [[feedback_no_silent_apportion_fallback]] · [[single-source-engine-helper]] · [[feedback_numeric_impact_verify_before_bug_claim]]

---

## 1. 법령 근거 (KoreanLaw MCP 검증 2026-05-27, 상증령 mst=283637 / 상증규 mst=284609)

> **전수 직접검증 완료 (인용 오류 0)**: §54①(3:2·부동산과다 2:3·80%하한)·§54④(순자산단독 5종, 4호 삭제)·§55③(영업권 가산 배제 1·2·3호)·§56①②③④⑤·§59②③(영업권·추정이익 준용)·§17의3①(2~8호, 1호 삭제)·§17의3④(추정이익=수익가치×환원율) 모두 MCP 원문 대조. [[feedback_korean_law_82_vs_81_2_drift]]

### 1.1 상증령 §56② — 추정이익 갈음 (요건 4개 **모두** 충족 = AND)

> ② 제1항에도 불구하고 다음 각 호의 요건을 **모두 갖춘 경우**에는 제54조제1항에 따른 1주당 최근 3년간의 순손익액의 가중평균액을 … **둘 이상**의 신용평가전문기관, 회계법인 또는 세무법인이 … 산출한 **1주당 추정이익의 평균가액으로 할 수 있다.**
> 1. §17의3① 사유에 해당할 것 (일시적·우발적 사건 등)
> 2. 상속세(§67)·증여세(§68) 과세표준 신고기한까지 1주당 추정이익의 평균가액을 신고할 것
> 3. 1주당 추정이익의 산정기준일과 평가서작성일이 해당 과세표준 신고기한 이내일 것
> 4. 1주당 추정이익의 산정기준일과 상속개시일 또는 증여일이 같은 연도에 속할 것

### 1.2 상증규 §17의3① — 추정이익 사용 가능 사유 (1호 삭제 / **2~8호**)

| 호 | reasonCode (제안) | 내용 |
|---|---|---|
| 1 | — | **삭제** |
| 2 | `asset_receipt_50pct` | 자산수증이익·채무면제이익·보험차익·재해손실 가중평균이 (법인세차감전손익 − 자산수증이익등) 가중평균의 **50% 초과** |
| 3 | `merger_split_business_change` | 평가기준일 전 3년 기간 중 **합병·분할** 또는 **주요 업종 변경** |
| 4 | `merger_gift_section38` | 법 §38 합병증여이익 산정 위한 합병당사법인 주식가액 산정 |
| 5 | `closure_over_1yr` | 최근 3개 사업연도 중 **1년 이상 휴업** |
| 6 | `disposal_gain_50pct` | 유가증권·유형자산 처분손익 + 자산수증이익등 가중평균이 법인세차감전손익 가중평균의 **50% 초과** |
| 7 | `sales_period_under_3yr` | 주요 업종 정상 매출발생기간 **3년 미만** |
| 8 | `similar_notified` | 2~7호 유사 + 재정경제부장관 고시 사유 |

### 1.3 상증규 §17의3④ — "1주당 추정이익의 평균가액"의 정의 (★ 산식 결정적)

> ④ … "1주당 추정이익의 평균가액"이란 「자본시장법 시행령」 제176조의5제2항에 따라 금융위원회가 정한 **수익가치**에 영 제54조제1항에 따른 **순손익가치환원율(10%)을 곱한 금액**을 말한다.

**★ 산식 도출 (대수 검증)**

- §56②: §54① **가중평균액(아.)** 자리에 → **추정이익 평균가액** 대입
- §56①: 1주당 순손익가치(⑤) = 가중평균액(아.) **÷ 환원율(10%)**
- §17의3④: 추정이익 평균가액 = 수익가치 × 환원율
- ∴ 추정이익 적용 시 **순손익가치(⑤) = 추정이익 평균가액 ÷ 환원율 = (수익가치 × 환원율) ÷ 환원율 = 수익가치**

→ **갈음 지점은 단 1곳: 가중평균액(아., `weightedNetIncomePerShare`)**. 기존 `calcPerShareNetIncomeValue(아, capRate)`(차. ÷환원율)는 **무변경 재사용**. 환원율 이중적용 위험 없음(§17의3④ 정의가 정확히 상쇄).

### 1.4 정리

- **둘 이상**(≥2) 기관 산출 추정이익의 **평균** → 단수 입력은 요건 미충족(2호 "신용평가전문기관 … 중 둘 이상").
- 절차 요건(2·3·4호)은 **선언적 첨부 확인**(엔진 hard-compute 불가). 미확인 시 적용 차단(warnings + validation).
- §17의3① 사유 중 **하나 이상** 선택 필수.

---

## 2. 현행 엔진 경로 + 갈음 지점 (정밀 확인)

`lib/tax-engine/property-valuation/unlisted-orchestrator.ts` (STEP 5~6):

```ts
// 아.1주당 가중평균 (§56①, 음수 시 0)
const weightedNetIncomePerShare = calcWeightedAvg3y(annualizedPerShare);
// 차.1주당 순손익가치 ⑤ = 아 ÷ 자.환원율
const netIncomePerShare = calcPerShareNetIncomeValue(weightedNetIncomePerShare, capRate);
```

**갈음 후**:
```ts
let netIncomePerShare = calcPerShareNetIncomeValue(weightedNetIncomePerShare, capRate);
let estimatedProfitApplied: EstimatedProfitResult | undefined;
if (input.estimatedProfit) {
  estimatedProfitApplied = applyEstimatedProfit(input.estimatedProfit, capRate);
  if (estimatedProfitApplied.applied) {
    netIncomePerShare = estimatedProfitApplied.perShareIncomeValue;   // §56② 대체 (차. 재사용)
    appliedRules.push(`상증령 §56② 추정이익 평균가액 갈음 — §17의3① ${reasonCode}`);
  } else {
    warnings.push(...estimatedProfitApplied.warnings);                // 요건 미충족 → 미적용 안내
  }
}
```

→ 갈음된 `netIncomePerShare`가 하류(`calcPerShareWeightedValuation`(§54① 3:2/2:3) → §54④ 분기 → 80% 하한 → §63③ 할증)로 **자동 전파**. 별도 분기 수정 없음.

**★ F-7 (결과 채움 필수)**: 결과 객체의 `netIncomePerShare` 필드를 **갈음된 `let` 변수로 채워야** 함(재산출 금지). 결과카드 `PerShareValuationResultCard`는 `evaluateUnlistedStockV2(input)`를 useMemo로 재호출해 `result.netIncomePerShare`를 읽으므로, 결과 필드가 갈음값이어야 화면·PDF 모두 반영됨. orchestrator `return` 직전 `estimatedProfitResult` echo도 함께 노출.

**별지 부표3 양식**은 이미 추정이익을 명시(`besshi-form-constants.ts:48`: "… 또는 2 이상의 신용평가전문기관이 산출한 1주당 추정이익의 평균액(제6쪽 7.차)") → 엔진만 비어 있던 상태. 본 PR이 양식 문구와 엔진을 정합.

---

## 3. 설계 결정

### D-1. 신규 엔진 모듈 (순수 함수, ≤150줄)

`lib/tax-engine/property-valuation/estimated-profit-section-56-2.ts`

```ts
export type EstimatedProfitReasonCode =
  | "asset_receipt_50pct"          // §17의3① 2호
  | "merger_split_business_change" // 3호
  | "merger_gift_section38"        // 4호
  | "closure_over_1yr"             // 5호
  | "disposal_gain_50pct"          // 6호
  | "sales_period_under_3yr"       // 7호
  | "similar_notified";            // 8호

export interface EstimatedProfitInput {
  reasonCode: EstimatedProfitReasonCode;        // §17의3① (택1) — 1호 삭제로 enum 제외
  agencyEstimates: number[];                    // 각 기관 1주당 추정이익 (≥2, §56② 둘 이상)
  // 절차 요건 첨부 확인 (§56② 2·3·4호 — 선언적)
  filedWithinDeadline: boolean;                 // 2호: 신고기한 내 신고
  baseDateAndReportWithinDeadline: boolean;     // 3호: 산정기준일·작성일 신고기한 내
  sameYearAsInheritanceOrGift: boolean;         // 4호: 산정기준일·상속개시/증여일 동일연도
}

export interface EstimatedProfitResult {
  applied: boolean;
  estimatedProfitAverage: number;   // 추정이익 평균가액 (아. 갈음) = floor(Σ/n)
  perShareIncomeValue: number;      // 순손익가치 ⑤ = floor(평균 ÷ 환원율)
  reasonCode?: EstimatedProfitReasonCode;
  agencyCount: number;
  warnings: string[];               // 미적용 사유
}
```

`applyEstimatedProfit(input, capRate)`:
1. **요건 검증** (모두 충족해야 `applied=true`):
   - `agencyEstimates.length >= 2` (둘 이상)
   - `reasonCode` 존재 (§17의3①)
   - `filedWithinDeadline && baseDateAndReportWithinDeadline && sameYearAsInheritanceOrGift` (2·3·4호)
   - 미충족 → `{applied:false, warnings:[...구체 사유]}`, **netIncomePerShare 갈음 안 함**(현행 가중평균 경로 유지). [[feedback_no_silent_apportion_fallback]] — 침묵 0채움 금지, 미적용을 명시.
2. `estimatedProfitAverage = Math.floor(Σ agencyEstimates / count)` (원 미만 절사 — 별지 양식 절사 정합).
3. `perShareIncomeValue = calcPerShareNetIncomeValue(estimatedProfitAverage, capRate)` ([[single-source-engine-helper]] — 차. ÷환원율 헬퍼 재사용, floor 일관).

### D-2. orchestrator 갈음 (§2 코드 블록)

`weightedNetIncomePerShare` 산출 직후 1곳만 분기. `netIncomePerShare`를 `let`으로 전환. 하류 무수정.

### D-3. 음수·0 가드 (F-1 정정 — §56② override 근거)

- **§56① 음수→0 단서 미적용 근거**: §56②은 "**제1항에도 불구하고** … 가중평균액을 … 추정이익의 평균가액으로 할 수 있다"로 §1 전체(음수→0 단서 포함)를 displace. 또한 추정이익 평균가액 = 수익가치(자본시장법 시행령 §176의5②, 금융위 기준) × 환원율(§17의3④)으로 **구조상 비음수**. ∴ 추정이익 평균가액에 §56① 음수→0 floor를 강제하지 않음(추정 금지 — 법문 displace 근거 명시).
- **방어적 동작**: 그럼에도 사용자 입력 평균이 음수면 → 순손익가치 음수 → 하류 `calcPerShareWeightedValuation`(§54① 3:2 가중) + 80% 하한이 순자산가치로 보정. 평균<0 시 warning("추정이익 평균이 음수 — 수익가치 입력 확인") 표기. **0 강제 치환은 안 함**(법문 근거 없는 임의 보정 금지).
- `agencyEstimates` 빈 배열·1개·전부 0 → 요건 미충족(둘 이상 아님) 처리 → 갈음 안 함.

### D-4. ★ 영업권 §59③ 준용 — **본 PR 범위 외 (scoped) + 명시 warning**

§59③ (MCP 원문 검증): "제2항을 적용함에 있어서 최근 3년간의 순손익액의 가중평균액은 **제56조제1항 및 제2항을 준용**하여 평가한다. 이 경우 같은 조 제1항 중 '1주당 순손익액'과 같은 조 **제2항 중 '1주당 추정이익'은 '순손익액'으로 본다**." → 영업권 산식의 가중평균 순손익액(`companyWeighted3y`)은 §56② **준용** 대상이므로, **충실 구현 시 추정이익 적용은 영업권 가중평균에도 전파**되어야 함. (단, "1주당 추정이익→순손익액으로 본다"의 1주당↔회사전체 차원 치환은 기존 `companyWeighted3y`(회사전체) 구현과의 정합 검토가 필요 — PR-G2에서 함께 해결.)

- **결정**: PR-G(본 PR)는 **순손익가치(⑤) 갈음만** 구현. 영업권 `companyWeighted3y`는 **실제 과거 순손익 유지**.
- **근거**: (a) §59③ 준용은 1주당↔회사전체 차원 변환(× 발행주식수)·§55③ 배제사유와의 교차가 복잡 → 별도 PR로 분리해야 회귀 위험 격리. (b) §17의3① 사유 다수(합병·분할·휴업·매출 3년미만)가 §55③ 영업권 배제·§54④ 순자산단독과 부분 겹쳐 실무상 영업권 동시 발생 케이스가 제한적.
- **안전장치**: 추정이익 `applied=true` **AND** `goodwill.goodwillFinal > 0`이면 `warnings`에 "§59③ 준용(영업권 가중평균 추정이익 반영)은 본 버전 미반영 — 영업권은 실제 순손익 기준" 명시. 침묵 금지.
- **후속 PR-G2**: 영업권 §59③ 추정이익 준용 + anchor.

### D-5. UI 노출 — 토글(3-state 아님, 단순 ON/OFF optional 객체)

- `EstimatedProfitInput | undefined`. 미입력=옵션 OFF(현행 가중평균). [[feedback_three_state_optional_mode_toggle]]은 배열 length-derive 금지 정책이나, 여기선 **객체 존재 여부 = ON/OFF** 단순 토글 + 내부 필드는 토글 ON 시 입력. OFF→ON 전환 시 빈 기본값(`agencyEstimates: ["",""]` 2칸, attestation false) 생성, OFF 시 `undefined`.
- 폐기 확인: 데이터 입력 후 OFF 전환 시 [[feedback_dialog_data_discard_confirm]] shadcn Dialog(window.confirm 금지).
- 배치: `UnlistedStockV2Card`에서 **FiscalYearAdjustmentTable(현 섹션 3) 직후** — 순손익가치 산출 입력의 대체이므로 인접.
- **현행 섹션 번호(F-2 정정, 코드 확인)**: 1·2(CorporateInfoSection, 자본금변동 co-located) → **3**(FiscalYearAdjustmentTable) → 4(ValuationDeltaTable) → 5(NetAssetCalculationTable) → 6(GoodwillPanel) → 7(MajorShareholderStockToggle §22) → 8(EvaluationCommitteeToggle §54⑥) → 9(PerShareValuationResultCard).
- **삽입 후 재번호**: 추정이익 토글 = **신규 섹션 4**, 기존 4→5·5→6·6→7·7→8·8→9·9→**10**. [[project_unlisted_capital_change_relocation]] `sectionNum` prop **단일출처** 패턴(UnlistedStockV2Card에서 각 컴포넌트에 명시 전달)으로 일괄 +1. testid·badge DOM순 회귀 anchor 필수(R-4).

---

## 4. 변경 지점 (V2 평가 서브시스템 동기화 — 8지점)

| # | 파일 | 변경 |
|---|---|---|
| S-1 | `types/unlisted-stock-valuation.types.ts` | `UnlistedStockValuationInput.estimatedProfit?: EstimatedProfitInput`(import type) + 결과 echo `UnlistedStockValuationResult.estimatedProfitResult?: EstimatedProfitResult`(필드명 = result 객체 echo, 내부 `.applied` boolean 보유) |
| S-2 | `property-valuation/estimated-profit-section-56-2.ts` | **신규** — 타입 + `applyEstimatedProfit` (D-1) |
| S-3 | `property-valuation/unlisted-orchestrator.ts` | 갈음 분기(D-2) + `estimatedProfitApplied` 결과 노출 + D-4 영업권 warning |
| S-4 | `validators/unlisted-stock-valuation-v2.schema.ts` | `estimatedProfit` z.object optional + **superRefine**: ON 시 agencyEstimates ≥2·각 항목 finite·reasonCode 필수·attestation 3개 true (요건 미충족 시 path 오류). [[feedback_validation_sync_8th_point]] — UI 통과↔validate 차단 모순 금지 |
| S-5 | `lib/calc/stock-valuation.ts` | `evaluateUnlistedStockV2(v2)` 호출 전 `v2` 조립부에 `estimatedProfit` **spread 전달 확인**(침묵 strip 금지 — [[feedback_explicit_prop_mapping_strip]] grep 점검) |
| S-6 | `components/calc/inheritance/unlisted-stock-v2/EstimatedProfitToggle.tsx` (신규) + `UnlistedStockV2Card.tsx` | 토글 섹션 추가(신규 섹션 4) + sectionNum 일괄 +1(D-5). ≥2 기관 추정이익 동적 행 추가/삭제 + §17의3① 사유 RadioCardGroup + 절차 3요건 체크. **reasonCode→한국어 라벨은 `Record<EstimatedProfitReasonCode, string>` 정적 매핑**([[enum-verification-before-mapping]] — 컴파일러가 누락 catch). OFF 전환 시 데이터 폐기 Dialog([[feedback_dialog_data_discard_confirm]]) |
| S-7 | `components/.../PerShareValuationResultCard.tsx` | **결과카드는 `evaluateUnlistedStockV2(input)` useMemo 재호출** → `result.netIncomePerShare` 갈음값 **자동 반영**(F 확인). 추가: `result.estimatedProfitApplied` echo 읽어 산출근거 분기 "§56② 추정이익 평균가액(기관 N개 평균 X) ÷ 환원율(10%) = 순손익가치". 미적용 warning 표시. [[feedback_result_view_korean_formula]] 한국어 풀어쓰기 |
| S-8 | `besshi/besshi-form-constants.ts` / besshi view / **`lib/pdf/UnlistedStockBesshiPdfDocument.tsx`** | 제6쪽 7.차 "추정이익 평균액" 행에 적용값 반영(양식 문구 이미 존재 — 표시 연결). **화면 besshi view + PDF document 양쪽**(F-3). 화면·PDF 공유 상수(`besshi-form-constants.ts`) 단일출처. PR-G 범위는 표시 연결까지, 양식 신규 칸 추가는 불요(기존 행 활용) |

> **주의**: V2 평가는 메인 세금 마법사(14지점)와 별개 서브폼. 본 8지점이 V2 등가. 단 S-5(mediator)·S-4(Zod)·S-1(type)이 ⑫⑬⑭ 등가로 **TS 미감지 침묵 strip 위험** → grep 자가점검 필수.

---

## 5. Pre-Do anchor (RED 우선 — [[feedback_pre_anchor_verification]])

`__tests__/tax-engine/property-valuation/estimated-profit-section-56-2.test.ts` (신규) + orchestrator 통합:

- **EP-1 (RED→GREEN)**: 요건 충족(기관 2개 추정이익 [1,000원, 1,400원], 사유 3호, 절차 3 true), 환원율 10% → `applyEstimatedProfit` `estimatedProfitAverage = floor((1000+1400)/2)=1,200`, `perShareIncomeValue = floor(1200/0.10)=12,000`. 현행 미구현이라 함수 부재 → RED.
- **EP-2 (orchestrator 갈음)**: 동일 입력을 `evaluateUnlistedStockV2`에 주입 → 결과 `netIncomePerShare`(또는 1주당 순손익가치 echo)=12,000으로 **가중평균 경로 대체** 확인. estimatedProfit 미입력 동일 케이스와 비교해 순손익가치만 변경.
- **EP-3 (요건 미충족 차단)**: 기관 1개만(≥2 아님) → `applied=false`, 순손익가치 **현행 가중평균 유지**, warnings에 "둘 이상" 포함. [[feedback_numeric_impact_verify_before_bug_claim]] — 미적용이 numeric에 미반영됨을 실증.
- **EP-4 (절차 요건 1개 false)**: `sameYearAsInheritanceOrGift=false` → applied=false + 해당 warning.
- **EP-5 (영업권 D-4 warning)**: 추정이익 applied=true + goodwill>0 케이스 → warnings에 §59③ 미반영 안내 존재.
- **EP-6 (음수 추정이익 D-3)**: 평균 음수 → 0 강제 안 함(법령 미규정) + warning. 하류 순자산가치 가중·80%하한 보정 동작 확인.
- **EP-7 (Zod superRefine)**: schema 레벨 — ON+기관1개 → parse 실패 path `["estimatedProfit","agencyEstimates"]`.
- **EP-8 (reasonCode 7종 매핑)**: §17의3① 2~8호 각 reasonCode가 enum에 존재 + `Record<EstimatedProfitReasonCode,string>` 라벨 매핑 누락 0(컴파일러 catch + 런타임 각 키 한국어 라벨 비어있지 않음). [[enum-verification-before-mapping]]. 1호(삭제) 미포함 확인.
- **(회귀)**: estimatedProfit 미입력 시 기존 전체 PASS 불변 — DoD 회귀 항목으로 검증(별도 EP 번호 없음).

---

## 6. Definition of Done

- [ ] EP-1~8 anchor 통과 (RED 선확인 후 GREEN) + 회귀(미입력 불변)
- [ ] 기존 회귀 0건 (estimatedProfit 미입력 시 전 케이스 **불변** — numeric 영향 0 실증)
- [ ] `npx tsc --noEmit` 0건
- [ ] `npx vitest run __tests__/tax-engine/property-valuation/` 통과 + 전체 `npm test`
- [ ] 800줄 정책 — 신규 모듈 ≤150줄, UI 토글 컴포넌트 분리
- [ ] §56② 본문 + §17의3①(2~8호) + §17의3④ 인용 주석 명시 (KoreanLaw 검증값)
- [ ] S-5 mediator spread grep 자가점검 (estimatedProfit strip 0)
- [ ] **e2e** (`e2e/*.spec.ts`) — 토글 ON→기관 2개 입력→사유 선택→절차 체크→결과 순손익가치 갈음 확인 ([[feedback_browser_verify_with_playwright]] — 수동확인/claude-in-chrome 금지). **상속·증여 양쪽** 경로(F-4: V2 평가는 `GiftTaxForm`·상속 `steps.tsx` 공용 `StockValuationForm`) — 최소 상속 1 + 증여 1 시나리오
- [ ] 한국어 커밋 + push

---

## 7. 실행 순서 (Do — 엔진 시퀀셜 → UI)

**[[feedback_pdca_session_efficiency]] Plan 병렬 / Do 시퀀셜**:
1. (병렬 Plan 완료 — 본 문서) `inheritance-gift-tax-senior` + `inheritance-gift-tax-ui-senior` 동시 검토.
2. **Do 시퀀셜**:
   - ① 엔진 시니어: EP-1 RED 작성 → S-2 모듈 → S-1 타입 → S-3 orchestrator 갈음 → EP-1~6 GREEN → S-4 Zod superRefine + EP-7.
   - ② UI 시니어: 엔진 결과 받아 S-6 토글 컴포넌트 + sectionNum 재배치 → S-7 결과 카드 산식 → S-5 mediator spread 확인 → S-8 besshi 표시 → e2e.
3. Check: `ui-engine-sync-checker`(8지점) → `bkit:gap-detector`.
4. Act: 회귀 후속 + D-4 후속 PR-G2(영업권 §59③) 디자인 환류.

---

## 8. 리스크

- **R-1 환원율 이중적용**: §17의3④(추정이익=수익가치×환원율)을 오해해 추정이익에 다시 ÷환원율 누락/중복 시 10배 오차. → §1.3 대수 검증 주석 + EP-1 손계산 anchor(12,000)로 고정.
- **R-2 침묵 strip (F-6 정정 — 위험점 재특정)**: mediator `stock-valuation.ts:73`은 `evaluateUnlistedStockV2(v2)`로 **v2 전체 객체 전달**(명시 매핑 아님) → **strip 위험 없음**. 실제 위험점은 (a) **폼이 `item.unlistedStockValuationV2`를 조립할 때** estimatedProfit 누락 (b) **Zod parse가 unknown key strip**(`.strict()` 아니면 통과하나 미정의 시 소실). → S-4 Zod에 estimatedProfit 정의 필수 + 폼 조립부 grep([[feedback_explicit_prop_mapping_strip]]).
- **R-3 §59③ 영업권 미반영 은폐**: D-4 scoped 결정을 warning 없이 두면 충실도 갭. → EP-5 warning anchor 강제.
- **R-4 섹션 번호 회귀**: sectionNum 삽입 시 §54⑥/§54③/§22 토글 testid·badge 순서 깨짐. → [[project_unlisted_capital_change_relocation]] 단일출처 prop + badge DOM순 anchor 재확인.
- **R-5 요건 자동판정 과욕**: 2·6호(50% 초과)는 자산수증이익·처분손익 데이터가 V2에 없어 자동판정 불가. → **사유는 사용자 선택**(자동판정 안 함), 절차 3요건도 첨부 선언. 자동 0채움 금지([[feedback_no_silent_apportion_fallback]]).

---

## 9. 후속 PR

- **PR-G2**: 영업권 §59③ 추정이익 준용(companyWeighted3y 갈음 + §55③ 교차) + anchor (D-4 잔여).
- **PR-G3** (선택): §17의3① 2·6호 50% 초과 판정 보조 계산기(자산수증이익·처분손익 입력 시 자동 사유 충족 안내 — 자동적용 아님, 안내만).
- **PR-G4** (선택): 추정이익 평가서(신용평가기관) 첨부 파일 메타 기록.

---

## 10. 한계

- **수익가치 직접 검증 불가**: §17의3④ 수익가치(금융위 기준, 자본시장법 시행령 §176의5②)는 외부 평가기관 산출값 — 엔진은 사용자 입력 추정이익을 신뢰. 정합성은 사용자 책임.
- **절차 요건(2·3·4호)은 선언적**: 신고기한·산정기준일·연도 일치는 엔진이 날짜로 hard-compute하지 않고 첨부 확인(boolean)으로 처리. (후속에서 evaluationDate·신고기한 기반 자동검증 가능성 — 별도 결정.)
- **영업권 §59③ 미반영(PR-G2 분리)**.
