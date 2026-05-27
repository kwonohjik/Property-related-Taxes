# 비상장주식 간편평가(V1) 순손익가치 — 사업연도별 1주당 절사 순서 정정

작성일: 2026-05-27
관련: [[feedback_korean_law_82_vs_81_2_drift]] · [[feedback_anchor_correction_legal_priority]] · [[feedback_numeric_impact_verify_before_bug_claim]] · 정정 대상 메모리 `project_unlisted_stock_simple_3year_net_income`

---

## 1. 버그 (법령 대조 확정)

### 법령 — 상증령 §56①·③ (KoreanLaw MCP 검증 2026-05-27, mst=283637)
§56①: "1주당 최근 3년간 **순손익액의 가중평균액**" = 각 사업연도의 **1주당 순손익액**을 가중(3:2:1)/6, 음수면 0. §56③: 각 사업연도 주식수 = 해당 사업연도 **종료일 발행주식총수**. 별지 부표3 양식 절차(3단계 절사):
```
사. 연도별 1주당 순손익액 = floor(회사 순손익_i ÷ 주식수_i)   ← 원 미만 절사
아. 가중평균 = floor((사1×3 + 사2×2 + 사3×1) ÷ 6)            ← 절사·음수 0
차. 1주당 순손익가치 = floor(아 ÷ 환원율 0.10)                ← 절사
```

### 현행 V1 간편평가 — `lib/tax-engine/property-valuation-stock.ts`
```ts
calcCompanyWeightedNetIncome3Y(y1,y2,y3) = (y1×3+y2×2+y3×1)/6   // 회사 전체, floor 없음 (line 124)
perShareIncomeValue = Math.floor(resolvedNetIncome / (totalShares × capRate))  // 단일 floor (line 205)
```
= **`floor(회사 전체 가중평균 순손익 ÷ (주식수 × 환원율))`** — **사업연도별 1주당 절사(사.) 단계 부재**, 회사 전체로 가중평균 후 마지막 1회만 절사.

### 차이·영향 (numeric 실증)
floor 무시 시 대수적 항등(나눗셈 분배) → **차이는 절사 시점뿐 = 원 단위 오차**. 예: 3년 순손익 각 100,000,003원·7주·10% → 법령 **142,857,140** vs V1 **142,857,147** = **7원/주**. 1주당 차 × 보유주식수만큼 평가액 오차. (V2 `weighted-avg.ts` 주석의 "구 엔진 5~8원 차이"와 동일)

### V2 정식평가는 정합 (대조군)
`unlisted-orchestrator.ts:107~127`이 연도별 1주당 floor(`Math.floor(finalNetIncomes[i]/convertedShares[i])`) → `calcWeightedAvg3y` → `calcPerShareNetIncomeValue`로 §56① 3단계 절사를 정확히 구현. **V1만 불일치.**

원인: `property-valuation-stock.ts:115·198-200` 주석 — "정정(P2-D): 이중 floor→단일 floor (정밀도 유지)" + "V2 calcWeightedAvg3y 재사용 금지"는 **의도적 결정이었으나 §56① 절사 구조와 불일치**. 본 계획이 이를 되돌림.

## 2. 설계 결정

### D-1. has3y 경로를 §56① 3단계 절사로 (V2 함수 재사용)
3년치(`netIncomeY1~Y3`) 입력 시:
```ts
const ps: [number,number,number] = [
  Math.floor((netIncomeY1 ?? 0) / totalShares),  // 사. 연도별 1주당 절사 (음수=결손 허용, floor)
  Math.floor((netIncomeY2 ?? 0) / totalShares),
  Math.floor((netIncomeY3 ?? 0) / totalShares),
];
const weighted = calcWeightedAvg3y(ps);                       // 아. (V2 재사용 — floor·음수 0)
perShareIncomeValue = calcPerShareNetIncomeValueV2(weighted, capRate);  // 차. (V2 재사용 — ÷환원율 floor)
```
- **★ 보완 확정 (검토)**: (아.) 가중평균만 `weighted-avg.ts`의 `calcWeightedAvg3y` import(이름 충돌 없음, leaf 모듈이라 순환 없음). (차.) ÷환원율은 **property-valuation-stock.ts 로컬 line-152 `calcPerShareNetIncomeValue`(`floor(x/rate)`) 재사용** → 동명 함수 alias 불필요(R-4 해소). 메모리의 "calcWeightedAvg3y 재사용 금지"는 법령 불일치였으므로 정정([[single-source-engine-helper]]).
- **§54④ 분기 무간섭 (검토 확인)**: 수정은 `perShareIncomeValue`만 변경 → `perShareWeightedValue`→§54④ 전 분기(1·2·6호 순자산가치 / 3·5호 비교 / 본칙 max80%)로 자동 전파. 별도 income 재계산 없음.

### D-2. legacy fallback 유지
`netIncomeY1~Y3` 모두 미입력(구버전 저장 데이터, `weightedNetIncome` 단일값만) → per-year 분해 불가 → **현행 `floor(weightedNetIncome / (totalShares×capRate))` 단일 floor 유지**(최선). has3y 분기에서만 §56① 적용.

### D-3. §56③ 단일 주식수 한계 (간편의 본질)
V1 간편은 연도별 주식수 미입력(단일 `totalShares`). §56③의 연도별 종료일 발행주식총수는 V2 정식(자본변동 조정)에서만 정밀 처리. V1은 단일 `totalShares`로 각 연도 per-share 절사 — 간편평가 범위 내 근사(법령 절사 구조는 충족, 연도별 주식수 정밀도는 V2 안내). 계획·UI hint에 명시.

## 3. 변경 지점

| # | 파일 | 변경 |
|---|---|---|
| C-1 | `property-valuation-stock.ts` | `calcUnlistedStockPerShareValue` 내 순손익가치 계산을 D-1(has3y)·D-2(legacy)로 분기. `weighted-avg`에서 `calcWeightedAvg3y`+`calcPerShareNetIncomeValue as …V2` import. `calcCompanyWeightedNetIncome3Y`는 legacy 외 미사용 시 정리 검토 |
| C-2 | (선택) `resolveWeightedNetIncome` | has3y 판정 로직 재사용 — per-year 배열 반환형 추가 또는 호출부에서 직접 분기 |
| C-3 | 테스트 6파일 | V1 순손익가치 anchor가 원 단위 이동 → **법령 정합값으로 갱신**([[feedback_anchor_correction_legal_priority]]). `property-valuation-stock.test.ts`·`property-valuation.test.ts` 우선. §22 phase0/toggle-f1·besshi-result는 eligibility/표시 검증이라 영향 시만 |

UI(`UnlistedStockSimpleFields` preview·`StockValuationForm`)는 `computeStockValuation`→`calcUnlistedStockPerShareValue` 경유라 **자동 반영**(코드 변경 없음).

## 4. Pre-Do anchor (RED 우선)

- **A-1 (RED)**: 연도별 절사가 발생하는 입력(예: 3년 각 100,000,003원·7주·10%)으로 `calcUnlistedStockPerShareValue(...).perShareIncomeValue` 기대 = **법령값 142,857,140**. 현행 V1은 142,857,147 → RED. 수정 후 GREEN.
- **A-2**: V1 결과 = V2 동일 입력(자본변동·연환산 없는 케이스) 결과와 **일치** 확인(간편↔정식 정합). 음수 결손 연도 케이스(per-year floor 음수 → 가중평균 음수 → 0) 포함.

## 5. 회귀

- C-3 anchor 갱신 후 `npm test` 전수 0 FAIL. 변경 anchor는 §56① 손계산값으로 재산정(임의 현행값 추종 금지).
- `npx tsc --noEmit` 0 (함수 alias import 확인).

## 6. 실행 순서 (Do)

1. A-1 RED 작성·확인(현행 V1 != 법령).
2. C-1 분기 구현(has3y=§56① 3단계, legacy=현행). alias import.
3. A-1·A-2 GREEN.
4. C-3 영향 anchor를 법령 손계산값으로 갱신(원인 보고 후).
5. `npm test` 전수 + UI preview e2e(있으면)·`tsc` 0.

## 7. 리스크

- **R-1 anchor 대량 이동**: V1 순손익가치 사용 anchor가 원 단위로 다수 변동 가능 → 손계산으로 법령값 재산정(외부값 추종 금지). 변동 건수 grep 선확인.
- **R-2 음수 결손 연도**: per-year `Math.floor(음수/shares)`는 −∞ 방향 절사 → V2와 동일 시맨틱(orchestrator도 동일). 가중평균 음수 시 0(§56① 단서)은 `calcWeightedAvg3y`가 처리.
- **R-3 legacy 미분기 누락**: has3y=false인데 §56① 분기 타면 per-year 데이터 없어 0 → legacy fallback 명확 분기 필수.
- **R-4 함수명 충돌**: alias 누락 시 잘못된 함수 호출 가능 → import alias + tsc.

## 8. 메모리 정정

`project_unlisted_stock_simple_3year_net_income`의 "★ V1 전용 floor-less calcCompanyWeightedNetIncome3Y / V2 calcWeightedAvg3y 재사용 금지"는 **§56① 불일치**로 판명 → 본 수정으로 V1도 연도별 1주당 절사 + V2 함수 재사용으로 전환. 해당 메모리에 정정 등재.
