# 비상속인 사전증여 수증자 배부·공제 수정 · UI 설계

- 계획서: `docs/01-plan/inheritance-non-heir-prior-gift-allocation-fix.plan.md`
- 엔진 설계: `docs/02-design/features/inheritance-non-heir-prior-gift-allocation-fix.engine.design.md`
- 작성일: 2026-06-09

## Context — 입력 폼 변경 없음 (순위 자동판정)

사용자 결정 "완전 자동(순위 단일진실)" → **수동 isHeir 토글 추가 안 함**. "기타(other)" 입력은 그대로. 선순위 상속인(자녀 등) 존재 시 엔진이 자동으로 비상속인 처리. `HeirComposition.tsx` **변경 없음**.

변경은 **결과 집계표 표시**뿐 — `buildSummaryTable()`(`heir-allocation-summary.ts`) rows 단일 소스 → 화면·PDF 자동 반영.

## 결과 표 변경 (윤며느리 사례 기준)

| 행 | 현재(버그) | 수정 후 |
|---|---|---|
| ⑥ 직접배부 | 며느리 240M | 240M 유지(표시 echo, 분모 제외) |
| ⑩ 상속인(수유자)외 증여세액공제 | 비어 있음 | **며느리 a=38M, b=한도, c=Min** 표시 |
| ⑪ 상속인등 산출세액 배부 | 며느리 105,196,111 | 며느리 **빈칸**(isTaxPayer=false), 합계 38M 감소 |
| ⑫ 상속인등의 증여세액공제 | 며느리 38M | 며느리 **빈칸** |
| *1·*2·*3·*4·*5·⑬⑭⑮ | 며느리 값 표시 | 며느리 **빈칸** |

## ⑩ accessor 확장 (행 추가 아님 — STEP 13 정정)

`heir-allocation-summary.ts:436-499` ⑩ a/b/c **3행 고정**. perHeir accessor의 `["corporate"]` 필터를 제거하고 "corp ∪ 비상속인 자연인" 가드로 확장 → **며느리 열**에 값 표시(별도 행 신설 X):
- a 증여세 산출세액: corp·자연인 공통 `priorGiftComputedTax`. 가드 `(h)=> isCorp(h) || isNonPayerNatural(h) ? priorGiftComputedTax : null`
- b 공제 한도: corp `priorGiftCreditLimit`(§3의2②) / 자연인 `nonHeirGiftCreditLimit`(§28②본문) 분기
- c 공제액: corp `corporateExemption.perCorporateBreakdown` / 자연인 `nonHeirGiftCredit` 분기
- `isNonPayerNatural` = `perHeir.nonHeirGiftCredit != null` (비납세 자연인 echo 존재)
- total: corp 합 + 자연인 합

## 표시 정책

| 항목 | 정책 | 근거 |
|---|---|---|
| 비상속인 셀 빈칸 | `isTaxPayer===false` accessor 가드 → null → `fmt` 빈칸 | 엔진 echo·기존 fmt(`:104`) |
| ⑥ 직접배부 며느리 | 240M 표시 유지(corp 평행) | directTaxBaseShare echo |
| ⑩ 라벨 | §3의2②(법인)/§28②본문(자연인) 구분 | 법령 정확성 |
| 내부 id 노출 금지 | 며느리 이름 `name.trim()` 표시 | 메모리 `feedback_no_internal_id_in_result` |
| 금액 정렬 | font-mono tabular-nums 우측정렬 | 스킬 `amount-column-align` |

## 동기화 지점

입력 폼 무변경 → 14지점 중 ①~④·⑧~⑭ **비해당**. ⑦(결과 카드)만 — `buildSummaryTable` rows 데이터 레이어에서 흡수(컴포넌트 직접 수정 0).

## testid·접근성

- 기존 `heir-summary-row-${rowId}`·`heir-summary-cell-${id}-${rowId}` 자동. ⑩ 비상속인 자연인 행 rowId(신규) testid 자동.

## 자가 검토 이력 (STEP 13)

정정 1건 (+ 확인 1건):
1. (오류 Medium) "⑩ 비상속인 자연인 행 추가" 부정확 → **a/b/c 3행 고정, accessor 확장**으로 며느리 열에 표시(엔진 설계 §표시도 동기화)
- (확인) `labelOf`(`:82`) h.name 우선 → "윤며느리" 표시, 내부 id 미노출(메모리 `feedback_no_internal_id_in_result`)
