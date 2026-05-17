# 재개발 APT 신고서 양식 표 분기별 산식 — 45.xlsx 정합 수정

## Context

사례 45 (양도코리아 45.xlsx) 입력 결과 화면의 "신고서 양식" 표(인가전 분 / 인가후 기존건물분 / 청산금 분)에서, 각 행의 합계와 분기 합이 일부 불일치한다. 산출세액 anchor(11,311,377)는 통과 중이므로 엔진 계산은 정확하나, **표 합계 행 표시 로직이 다른 모드의 코드에 의해 덮어쓰이는 버그**가 있다.

화면 상태 vs 기대(45.xlsx 양도코리아 패턴):

| 행 | 분기 합 | 화면 합계 | 정합 여부 | 처리 정책 |
|---|---|---|---|---|
| 양도가액 | 2,150M (650+1,026+474) | 1,500M (실가) | 불일치 — **정상** | §166 의제구조: 합계는 실가, 분기는 의제 안분합. **비고 1줄로 안내** |
| 취득가액 | 1,400M (450+650+300) | 1,400M | ✓ | 합계 = 분기 합 (의제 안분합) |
| 필요경비 | 9M (0+9+0) | 9M | ✓ | 합계 = 분기 합 |
| 과세대상 양도차익(12억 안분 후) | 148M | 148M | ✓ | 합계 = 분기 합 |
| **장특 보유 기간분** | **51.76M** (16+29.61+6.15) | **74.57M** | ✗ **버그** | 합계 = 분기 합이어야 |
| **장특 거주 기간분** | **22.81M** (8+14.81+0) | **0** | ✗ **버그** | 합계 = 분기 합이어야 |
| 거주기간 | 인가전 5년4개월 / 인가후·청산금 "-" | "-" | ✓ | 신축주택 미입력 (사용자 데이터 부재). 합계 산술합 무의미. **인가후 분 §155⑰ 통산 거주기간 표시 검토** |

## 원인 (코드 트레이스)

**`components/calc/results/transfer/FilingFormTableHelpers.ts`**:

1. **line 514-527** — redev-3split 모드에서 분기 합 보유분/거주분을 합계 행에 설정:
   ```ts
   let totalHoldingPart = 0;
   let totalResidencePart = 0;
   for (const [key, b] of branches) {
     const hp = b.lthdHoldingPart ?? b.lthd;
     const rp = b.lthdResidencePart ?? 0;
     setNum("ltHoldingPart", key, hp);
     setNum("ltResidencePart", key, rp);
     totalHoldingPart += hp;
     totalResidencePart += rp;
   }
   setNum("ltHoldingPart", "total", totalHoldingPart);     // 51,762,945
   setNum("ltResidencePart", "total", totalResidencePart); // 22,806,316
   ```

2. **line 657-696** — 모드별 합계 재설정 분기. `fourpart`·`mixed-2col`·`split-2col` 가드 후 **redev-3split 가드 없이** else 블록(line 692-695):
   ```ts
   } else {
     const split = splitLtDeduction(result.longTermHoldingDeduction, holdingMs, residenceMs, useTable2);
     setNum("ltHoldingPart", "total", split.holdingAmount);   // 74,569,261로 덮어쓰기
     setNum("ltResidencePart", "total", split.residenceAmount); // 0으로 덮어쓰기
   }
   ```

→ redev-3split 모드도 이 else에 들어가 line 526-527의 정확한 분기 합을 덮어쓴다.

## 수정 방향

### A. 핵심 버그 수정 — redev-3split 가드 추가
`FilingFormTableHelpers.ts:692` 의 else 블록 직전에 `mode === "redev-3split"` 케이스를 명시 가드:
```ts
} else if (mode === "redev-3split") {
  // line 526-527에서 이미 분기 합으로 설정됨 — 덮어쓰지 않음
} else {
  const split = splitLtDeduction(...);
  setNum("ltHoldingPart", "total", split.holdingAmount);
  setNum("ltResidencePart", "total", split.residenceAmount);
}
```

→ 화면 합계 장특 보유분 51,762,945 / 거주분 22,806,316 으로 정정.

### B. §166 의제구조 양도가액 비고 (이미 이전 PR로 추가됨)
`RedevelopmentDetailCard.tsx` violet 박스 — "분기별 양도가·취득가는 의제 안분값, 단순 산식 검산 비성립" 안내. **추가 변경 불필요**.

### C. (선택) 인가후 분 거주기간 §155⑰ 통산 표시
현재 인가후 분 거주기간이 "-"로 표시. 시행령 §155⑰에 의하면 인가후 기존건물분의 LTHD 표2 거주분은 종전+신축 통산이 적용된다. UI 일관성을 위해 인가후 분 거주기간 행에 통산 거주월수(prior+new)를 표시하는 안:
- `lib/tax-engine/redevelopment.ts`의 `postApprovalDetail.residenceMonths` 를 `priorMonths + newMonths` 통산값으로 수정 (현재는 `newMonths` 단일)
- 또는 표시 행에 "(§155⑰ 통산)" 라벨 추가

**A안 채택**: 통산값으로 변경. 현재 인가후 분의 LTHD 율 계산도 통산 기반이므로 표시 일관성 ↑.

### D. (선택) 청산금 분 거주기간 표시
청산금분 LTHD는 해석례 2020-386에 따라 신축 거주만 적용. 신축 거주가 0이면 "-" 대신 "0개월" 표시로 데이터 부재가 아닌 명시적 0임을 보임.

→ 본 PR에서는 **데이터 부재("-") 유지** (사용자 미입력 시그널이 더 정확). C·D는 후속 PR.

## 변경 파일

| # | 항목 | 파일 | 변경 |
|---|---|---|---|
| 1 | **장특 보유/거주 합계 덮어쓰기 버그** | `components/calc/results/transfer/FilingFormTableHelpers.ts:692` | else 직전 `redev-3split` 가드 추가 — line 526-527 분기 합 보존 |
| 2 | 인가후 분 거주기간 §155⑰ 통산 표시 | `lib/tax-engine/redevelopment.ts` postApprovalDetail.residenceMonths | `newMonths` → `(priorMonths ?? 0) + (newMonths ?? 0)` (둘 다 undefined면 undefined 유지) |

엔진 계산 산출세액 anchor(11,311,377) 보존, LTHD 합계 74,569,261 보존, lthdResidenceAttribution 기존건물분 통산 거주기간 메타 보존.

## 핵심 함수·유틸 재사용

- **`splitLtDeduction()`** — `FilingFormTableHelpers.ts:254-272`. fourpart/mixed-2col/split-2col 가드 블록과 redev-3split 가드는 독립적. redev는 엔진(`splitLthdAmount`)에서 이미 분기별로 분리된 값을 받으므로 추가 분할 불필요.
- **`splitLthdAmount()`** — `lib/tax-engine/redevelopment.ts`. 분기별 lthdHoldingPart·lthdResidencePart 산출. floor 정수연산 보존(total - holdingPart = residencePart).
- **`lthdResidenceAttribution`** — `RedevelopmentResult` 결과 타입. 기존건물분 통산 거주월수(existingResidenceMonths) + 청산금분(payResidenceMonths) 메타.

## 검증

### 자동
- `npx tsc --noEmit` — 0건
- `npx vitest run __tests__/tax-engine/transfer-tax/redevelopment/` — 70 anchor 회귀 0건
- 사례 45 anchor 보존: 산출세액 11,311,377 / 지방소득세 1,131,137 / 세액합계 12,442,514 / LTHD 합계 74,569,261

### 수동
- 사례 45 입력 → 결과 페이지 신고서 양식 표
  - 장특 합계 보유분 = **51,762,945** (이전 74,569,261 → 정정)
  - 장특 합계 거주분 = **22,806,316** (이전 0 → 정정)
  - 분기 합 보유분 16M+29.61M+6.15M = 51.76M ✓ (합계 일치)
  - 분기 합 거주분 8M+14.81M+0 = 22.81M ✓ (합계 일치)
  - 보유분 + 거주분 = 51.76M + 22.81M = 74.57M ✓ (장특 총액 일치)
- 인가후 분 거주기간 행 — **5년 4개월** (= 인가전과 동일, §155⑰ 통산) 표시 확인 (변경 C 적용 시)

## 회귀 보호

- 엔진 계산 변경 없음 (산출세액·LTHD 합계 보존)
- 다른 모드(fourpart·mixed-2col·split-2col·기본) 합계 로직 변경 없음 (가드 추가만)
- 사례 45 외 사례 44 / C-2 / C-3 / C-5 anchor 모두 보존

## 정책 사전 적용 (memory)

- `feedback_detailed_statement_formula_sync` — 신고서 양식 표 분기별 산식과 합계 일치성 정책
- `feedback_pdf_example_test_anchoring` — 사례 45 xlsx C26·C29·C31 anchor 보존
- `feedback_ui_input_path_enumeration` — 합계/분기 모든 행 enumerate (양도가/취득가/필요경비/양도차익/장특보유/장특거주/거주기간/장특합계) 후 정책 명시
