# 상속세 영리법인 배부 표 ⑩b·⑩c — UI 설계

> 계획: `docs/00-pm/inheritance-corporate-10bc-gaps.plan.md` · 엔진설계: `inheritance-corporate-10bc-gaps.engine.design.md`
> 작성: 2026-06-07 · 현황 인용 동일자 실측

## Context

상속인별 배부 표 ⑩ 그룹의 표시 정정. **신규 입력 위젯 0** — 영리법인·주주·사전증여 입력은 기존(변경 없음). 순수 **결과 표시(rows 빌더)** 수정.

---

## 사용자 시나리오

1. 사용자가 영리법인 수유자 + 사전증여를 입력하고 계산한다.
2. 배부 표 ⑩ 그룹에서:
   - ⑩b 공제 한도: 합계열과 영리법인열이 **동일 기준(할증 미포함)**으로 일치
   - ⑩c 공제할 증여세액: 영리법인이 여럿이면 **각 법인 행이 자기 몫**(전체 중복 아님)
3. 화면·PDF 부표 동일하게 표시(rows 공유).

---

## 위젯 / 표시 (입력 위젯 신규 0)

배부 표 ⑩ 그룹 (`lib/calc/heir-allocation-summary.ts` rows 빌더):

```
⑩ 상속인(수유자)외 증여세액공제
  a 증여세 산출세액        [법인A] [법인B] … │ 합계
  b 공제 한도              [법인A] [법인B] … │ 합계   ← GAP-1: 합계 할증 미포함(=Σ기준 일치)
  c 공제할 증여세액=Min(a,b) [법인A] [법인B] … │ 합계  ← GAP-2: 각 행 법인별 안분(중복 해소)
```

### GAP-2 ⑩c perHeir 매핑 (`heir-allocation-summary.ts:462~468`)

```ts
perHeir: buildPerHeir(sorted,
  (h) => h.relation === "corporate"
    ? (result.corporateExemption?.perCorporateBreakdown
         ?.find((c) => c.corporateId === h.id)?.exemptionAmount
       ?? result.corporateExemption?.amount ?? 0)   // 단일/누락 fallback(회귀 보존)
    : null,
  ["corporate"])
```
- ⑩c **합계열**(`:461` total `corporateExemption.amount`)은 전체 면제액 유지(정상).
- 단일 영리법인: `distributePerCorporate`(:162~163)가 `totalExemption` 그대로 → fallback과 동일(회귀 0).

### GAP-1 ⑩b (엔진 측 `inheritance-tax.ts:752`)
합계열 산식 할증 제거 → UI 표시는 자동 정합(엔진 result 값 그대로 표시). UI 코드 변경 없음.

---

## 단일 소스 — 화면·PDF 공유

`heir-allocation-summary.ts`의 `rows`를:
- 화면: `HeirAllocationSummaryTable` 컴포넌트
- PDF: `lib/pdf/sections/inheritance-heir-allocation-section.tsx:103 data.rows.map`

→ **둘 다 동일 rows 렌더**. ⑩c 콜백 1곳 수정으로 화면·PDF 동시 반영. PDF 별도 수정 불요(실측).

---

## 14개 동기화 지점 (UI 담당분)

| # | 지점 | 작업 |
|---|---|---|
| ①~⑥ | 폼·initial·normalize·API·위젯·사이드바 | 해당 없음(신규 입력 0) |
| ⑦ | 결과 카드 (rows 빌더) | `heir-allocation-summary.ts:462~468` ⑩c perHeir 법인별 매핑. 화면·PDF 공유 |
| ⑧ | validation | 해당 없음(입력 무변경) |
| ⑨~⑭ | API/Route | 해당 없음(엔진 result 타입 무변경) |

---

## UI 검토 체크리스트 (STEP 13)

- [x] 신규 입력 위젯 0 (영리법인·주주 입력 기존 유지)
- [x] ⑩c 단일 소스(rows) — 화면·PDF 동시 반영, PDF 별도 수정 불요
- [x] 단일 영리법인 fallback 회귀 0 (distributePerCorporate :162~163)
- [x] 금액 칸 정렬 — 기존 BesshiRow/perHeir 패턴 유지(신규 표 아님)
- [ ] (Do) CORP-10C anchor — 영리법인 2개 taxBase 상이로 각 행 다름 확인
- [ ] (Do) 화면 수동/E2E — 영리법인 2개 배부 표 ⑩c 각 행 값
