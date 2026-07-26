# 수정 계획서 — 다건 §99의3 소득금액차감 × §102② 차손통산: 시행령 §167의2② 안분 미구현

**작성일**: 2026-07-27
**세목**: 양도소득세 다건 집계 — §99의3(§90② 소득금액차감) 자산이 양도차손을 통산받을 때 감면소득금액 안분
**성격**: 🔴 **법령(시행령 §167의2②) 위반 — 과소과세**. 선행 수정(`aggregate-income-deduction-993.plan.md`)의 차손 케이스 결함 정정.

> ✅ **법령 확인 완료 (2026-07-27, KoreanLaw 원문)** — "선후 순서"는 명문 규칙으로 **결착**됐고, 별개의 **안분 규칙 미구현**이 드러남. §1~§3의 "순서 ambiguity" 논의는 §8 결론으로 대체.

## 0. 결론 (법령 확인 결과) — 시행령 §167의2② pro-rata 안분

**소득세법 시행령 §167의2②**(현행, 시행 2026-07-01 · mst 286211):
> 법 제90조의 감면소득금액을 계산함에 있어서 제1항의 양도소득금액에 감면소득금액이 포함되어 있는 경우에는 **순양도소득금액(감면소득금액을 제외한 부분)과 감면소득금액이 차지하는 비율로 안분하여 당해 양도차손을 공제한 것으로 보아**, 감면소득금액에서 당해 양도차손 해당분을 공제한 금액을 법 제90조의 감면소득금액으로 본다.

- **관련 상위법**: §92②(과세표준 순서: 양도차익→양도소득금액→기본공제) + §92③(산출세액→§90 감면), §102②(차손은 다른 자산 양도소득금액에서 공제), §90②(감면대상 양도소득금액 차감 후 과세표준).
- **정답 산식**(§99의3 자산 i가 차손 L을 통산받을 때):
  - `감면소득금액 = reducible` , `순양도소득금액 = income − reducible` (income = 통산 前 양도소득금액).
  - `감면분 흡수 차손 = L × reducible / income` , `순분 흡수 차손 = L × 순양도소득금액 / income`.
  - **조정 감면소득금액 = reducible − (L × reducible / income)**.
  - `과세 소득금액 = (income − L) − 조정 감면소득금액 = incomeAfterOffset − 조정reducible`.
- **현행 수정 결함**: `taxableAfterReduction = incomeAfterOffset − reducible`로 **차손을 감면분에 안분하지 않음** → 감면소득금액 과다 차감 → **과소과세**. 실측: 차손 50M 케이스 taxBase 현행 102.3M vs 정답 122.3M.
- **단건·무차손 무영향**: L=0이면 조정reducible=reducible → 현행과 동일(회귀 0). 안분은 **다건+차손이 §99의3 자산에 통산될 때만** 발동.

---

## 0-b. 구현 설계 (§167의2② 안분)

`transfer-tax-aggregate.ts` — `taxableAfterReduction` 산출부(선행 수정 지점)를 안분식으로 교체:
```ts
// 각 income-deduction 자산이 통산으로 흡수한 차손 = 같은군 + 타군 안분분.
const lossReceived = assetRecords.map((_, i) => lossOffsetFromSame[i] + lossOffsetFromOther[i]);
// §167의2② — 흡수 차손을 (순양도소득금액 : 감면소득금액) 비율로 안분, 감면소득금액을 감면분 차손만큼 축소.
const adjustedReducible = assetRecords.map((r, i) => {
  const reducible = incomeDeductionReducible[i];
  if (reducible <= 0) return 0;
  const income = r.income; // 통산 前 양도소득금액(감면 포함) = 안분 분모
  if (income <= 0) return reducible;
  const lossToExempt = Math.floor((lossReceived[i] * reducible) / income);
  return Math.max(0, reducible - lossToExempt);
});
const taxableAfterReduction = incomeAfterOffset.map((v, i) => Math.max(0, v - adjustedReducible[i]));
```
- **PerPropertyBreakdown.incomeDeductionReducible** echo = **adjustedReducible[i]**(= 법 §90② 감면소득금액 = 신고서 "소득금액 감면대상"). 표시 3행 정합 유지(양도소득금액 − 감면대상 = 감면후).
- **농특세 baseline**: `surtaxBaseline[i] = incomeAfterOffset[i] − (exempt자산이면 adjustedReducible[i] else 0)` — 비과세(§98의3·§98의5) 감면분만 제외해 baseline 유지, 비과세 아닌 감면분의 절세액만 ×20%.
- **세액감면 분모 aggregateTaxBase**: `Σ taxableAfterReduction − 기본공제`(이미 taxableAfterReduction 기반 — adjustedReducible 반영 자동).
- **데이터 가용**: `lossOffsetFromSame`·`lossOffsetFromOther`·`assetRecords[i].income` 모두 기존 스코프 존재(offsetLosses 반환·record).

## 0-c. anchor
1. **§167의2② 안분**: §99의3 자산(양도소득금액 258M·감면 103.2M) + 차손 50M(같은군) → 조정 감면 83.2M·과세 소득금액 124.8M·taxBase 122.3M(현행 102.3M에서 정정). 원단위 `toBe`.
2. **5년내 전액감면(순양도소득금액=0)** + 차손 → 과세 0(차손 전액 감면분 흡수).
3. **타군 안분**: §99의3(progressive) + 차손(다른군) 타군 spill → 안분 분모/조정 검증.
4. **무차손 회귀**: 선행 1자산 parity(단건==다건) 유지(lossReceived=0 → 조정=원). 전체 aggregate 회귀 GREEN.

## 1. 검증 이력 (참고 — §0 결론이 정본)

**초기 가설**: "통산 前 제외" vs "통산 後 제외"(현행) 중 어느 순서가 맞는가.

**probe로 확인한 점**: 단일 세율군에서 두 **순서**(前/後)는 세액이 항상 일치한다(`max(0,max(0,x−a)−b)=max(0,max(0,x−b)−a)`; 차손 50/200/300M 모두 동일). 그러나 이는 **둘 다 오답**이었다 — §167의2②의 **안분**은 前·後 어느 쪽과도 다르다(차손 50M: 前=後=taxBase 102.3M vs **§167의2② 정답 122.3M**). 즉 문제는 "순서"가 아니라 **"차손을 감면소득금액에도 안분하는가"**였고, 현행·양 순서안 모두 안분을 누락해 과소과세.

**divergence 조건**: §99의3 자산이 **양도차손을 통산받는 모든 경우**(같은 군 통산 포함). 앞서 "다중군 타군 spill에서만 갈린다"던 초안 가설은 **오판** — 같은 군 통산에서도 안분 누락으로 과소과세(위 50M 케이스가 같은 군).

## 2. 법령 근거 (KoreanLaw 원문 인용 — 확인 완료)
- **소득세법 §92②③**(mst 280405): 과세표준 = 양도차익 → 양도소득금액(장특공제 차감) → 기본공제. 산출세액 → §90 감면세액 공제 → 결정세액.
- **§102②**: 양도차손은 "다른 자산에서 발생한 **양도소득금액**"에서 공제. 공제방법은 대통령령.
- **§90②**: 조특법이 소득금액차감방식으로 규정하면 "제95조 양도소득금액에서 감면대상 양도소득금액을 차감한 후 과세표준 계산". (§99의3 = 소득금액차감방식.)
- **시행령 §167의2②**(mst 286211): §0 인용 — **차손을 순양도소득금액:감면소득금액 비율로 안분, 감면소득금액을 감면분 차손만큼 축소**. ← 정본 규칙.
- **명문 존재** → [[feedback_no_unfavorable_application_without_legal_basis]] 판단 불요(규칙 확정).

## 3. 성공 기준
1. §0-c anchor 4종 GREEN(§167의2② 안분 taxBase 122,300,000·incomeDeductionReducible 83,200,000 원단위 `toBe` 포함).
2. **단건 엔진 무영향 확인**: single 모드는 자산 간 차손통산 없음 → §167의2② 미발동. `calculateTransferTax`(finalize STEP 4.6) **무수정**. 1자산 parity(단건==다건) 유지.
3. **무차손 다건 회귀 0**: lossReceived=0 → adjustedReducible=reducible → 선행 수정과 동일. 전체 aggregate 회귀(1960건) GREEN.
4. floor 관례 명시: `lossToExempt = floor(lossReceived × reducible / income)`(감면분 흡수 절사 → 순분이 잔여 흡수). 근거 주석.
5. `tsc` 0.

## 4. 리스크·메모
- **선행 수정(방금 머지)의 차손 케이스 결함을 정정**하는 후속 — 단건·무차손은 영향 없으나 다건+차손은 과세표준 상향(과소과세 시정). 회귀 스냅샷에 차손+§99의3 케이스가 있었다면 기대값 갱신 필요(현재 aggregate 테스트에 해당 조합 없음 확인 필요).
- 농특세 baseline도 adjustedReducible(비과세분) 기준으로 이동 — §0-b 반영.
- 관련: [[project_transfer_aggregate_income_deduction_993]] · [[feedback_korean_law_82_vs_81_2_drift]](위임체인) · [[feedback_floor_residual_absorption]] · [[feedback_historical_statute_value_via_tribunal]]
