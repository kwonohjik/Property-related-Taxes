# 결과 화면 FilingFormTable 산식 정정 — 소득금액 감면대상 + 감면후 소득금액

## Context

사용자 이미지 25 검토 결과, `FilingFormTable`의 두 행이 §99의3 5년 안분 결과를 정확히 반영하지 못합니다:

1. **소득금액 감면대상** 행: 현재 `result.reducibleIncome`(산출세액 단계 감면)이 채워져 있음 → §99의3 양도소득금액 차감액(`result.new993Detail.reducibleTransferIncome`)이 들어가야 함
2. **양도소득금액(두 번째 행)**: 라벨이 "양도소득금액"으로 모호함 + 산식이 §161 분기만 처리하여 §99의3 차감 미반영

조특법 §99의3 5년 안분 산식:
```
소득금액 감면대상 = 양도소득금액 × (5년시점 공시가격 - 취득시 공시가격) / (양도시 공시가격 - 취득시 공시가격)
감면후 소득금액 = 양도소득금액 - 세액감면대상금액 - 소득금액 감면대상
```

PDF 사례 26 검증값:
- 양도소득금액 = 415,118,683
- 소득금액 감면대상 = 179,917,278 (§99의3 5년 안분 결과)
- 감면후 소득금액 = 415,118,683 - 0 - 179,917,278 = 235,201,405

---

## 변경 사항

### 1. `reductionTargetIncome2` 매핑 정정

**파일**: `components/calc/results/transfer/FilingFormTableHelpers.ts:496`

```diff
- setNum("reductionTargetIncome2", "total", result.reducibleIncome ?? 0);
+ // §99의3 5년 안분 차감액 (소득금액 단계) — Phase 2 result.new993Detail
+ setNum("reductionTargetIncome2", "total", result.new993Detail?.reducibleTransferIncome ?? 0);
```

### 2. `incomeAmountAfter` 산식 정정

**파일**: `components/calc/results/transfer/FilingFormTableHelpers.ts:498~501`

```diff
- // 양도소득금액(차감 후) = §161 비과세·감면 차감 결과 = 과세대상 양도소득금액
- const incomeAmountAfter = isRH
-   ? result.taxableGain
-   : incomeAmount;
+ // 감면후 소득금액 = 양도소득금액 − 세액감면대상금액 − 소득금액 감면대상
+ // §161 (장기임대 거주주택 비과세) 케이스는 result.taxableGain이 이미 안분 후 값이므로 별도 처리.
+ const reductionTargetTotal = result.reducibleIncome ?? 0;
+ const new993Reducible = result.new993Detail?.reducibleTransferIncome ?? 0;
+ const incomeAmountAfter = isRH
+   ? result.taxableGain
+   : Math.max(0, incomeAmount - reductionTargetTotal - new993Reducible);
```

### 3. 라벨 변경

**파일**: `components/calc/results/transfer/FilingFormTableHelpers.ts:538`

```diff
- ["incomeAmountAfter", "양도소득금액"],
+ ["incomeAmountAfter", "감면후 소득금액"],
```

---

## 영향 분석

### 회귀 위험
- §161 (장기임대 거주주택 비과세) 케이스: `incomeAmountAfter = result.taxableGain` 그대로 유지 (영향 없음)
- 일반 케이스 + §99의3 미적용: `reductionTargetTotal = 0`, `new993Reducible = 0` → `incomeAmountAfter = incomeAmount` (기존 동작 유지)
- 일반 케이스 + §99의3 적용: §99의3 차감액 반영 → 새로운 동작 (정확)

### MultiTransferTaxResultView 영향
- 동일 `FilingFormTable` 컴포넌트 사용 (다건 모드)
- 다건 모드에서 §99의3 적용 시 동일 산식 적용 — `result.new993Detail` 존재 시 정확 처리
- 자산별 분리 표시(`buildSinglePerProperty`) 시 result는 단건 결과 형태로 어댑팅됨

### 14개 동기화 지점
- ⑦ 결과 카드 산식 표시 ✓ (본 변경)
- 다른 지점 영향 없음 (엔진·API·validation 변경 없음)

---

## 변경 파일 (1개)

| 파일 | 변경 |
|---|---|
| `components/calc/results/transfer/FilingFormTableHelpers.ts` | line 496·498~501·538 (3곳, 약 8라인) |

---

## 검증 절차 (end-to-end)

```bash
npx tsc --noEmit       # 0건
npx vitest run __tests__/tax-engine/transfer-tax/  # 552 tests passed
```

### 브라우저 수동 시나리오
1. `npm run dev` → http://localhost:3000/calc/transfer-tax
2. 자산 추가 + 양도일 2023-02-16, 취득일 2003-09-23, 양도가 12억, 취득가 6.07억
3. Step3 감면·공제 → 신축주택 펼침 → 매매계약일 2001-05-24
4. §99의3 토글 ON → PHD 환산으로 취득시 기준시가 자동 적용 (또는 540M 직접 입력)
5. 5년 시점 기준시가 700M, 양도시 기준시가 900M 입력
6. 계산 실행
7. **결과 화면 확인**:
   - 양도소득금액: 415,118,683
   - 비과세 양도소득금액: 0
   - 세액감면대상금액: 0
   - **소득금액 감면대상: 179,917,278** (또는 PHD 환산에 따라 다른 값) ★
   - **감면후 소득금액: 235,201,405** ★ (라벨 변경 + 산식 적용)
   - 기본공제: 2,500,000
   - 과세표준: 232,701,405

---

## 후속 항목

- §99·§98의3·§98의5 등 다른 5년 안분 조문 본격 구현 시 동일 패턴으로 `reducibleTransferIncome`을 result 필드에 노출 후 `reductionTargetIncome2`에 합산
