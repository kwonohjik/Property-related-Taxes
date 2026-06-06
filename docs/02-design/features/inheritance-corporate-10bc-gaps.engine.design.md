# 상속세 영리법인 배부 표 ⑩b·⑩c numeric 갭 — 엔진 설계

> 계획: `docs/00-pm/inheritance-corporate-10bc-gaps.plan.md`
> 작성: 2026-06-07 · 현황 인용은 동일자 실측
> 선행: [[project_inheritance_corporate_10a_source_fix]] 후속 (1)(2)

## Context

상속인별 배부 표(`HeirAllocationSummaryTable`) ⑩ 그룹(영리법인 §3의2② 면제)에서 두 가지 numeric/표시 갭:
- **GAP-1**: ⑩b 공제 한도 — 합계열(할증 포함) ≠ 영리법인열(할증 미포함)
- **GAP-2**: ⑩c 공제할 증여세액 — 다수 영리법인 시 모든 행에 전체 면제액 중복

둘 다 엔진 result 타입 **무변경**(필요 데이터 기존재) — 산식 1줄 + 결과뷰 매핑 수정.

---

## ★ 케이스 인벤토리 (필수)

| # | 시나리오 | 법령 근거 | anchor | 테스트 파일 | 상태 |
|---|---------|----------|--------|-----------|------|
| 1 | 세대생략 할증 + 영리법인 1개 → ⑩b 합계열 할증 미포함 | §3의2②·§27(영리법인 할증 무관) | CORP-10B-1 | `corporate-prior-gift.test.ts` | ☐ TODO |
| 2 | 할증 0 + 영리법인 1개 → ⑩b 회귀 | 동상 | CORP-10B-2 | 〃 | ☐ TODO |
| 3 | 영리법인 2개(**taxBase 상이**) → ⑩c perHeir 법인별 안분(각 행 다름) | §3의2②·시령 §3 안분 | CORP-10C-1 | 〃 | ☐ TODO |
| 4 | 영리법인 1개 → ⑩c 회귀(단일=전체) | 동상 | CORP-10C-2 | 〃 | ☐ TODO |

---

## 법령 근거

- 상증법 §3의2②(KoreanLaw mst276123): 영리법인 수유자의 주주(상속인 등) **지분상당액** 납부. 영리법인 면제 한도 = 영리법인이 납부할 상속세 상당액.
- §27 세대생략 할증 = 자연인 세대 개념 → **영리법인 무관**(perHeir corp `generationSkipSurcharge=0`, `inheritance-allocation.ts:505`).
- PDF 책 1866 = ⑩b 할증 미포함 정답.
- ★ 시행령 §3 면제 한도 산식 할증 포함 여부 — **KoreanLaw 상증령 §3 직접 확인 필요**(현 방향: 미포함, perHeir·PDF 정합).

---

## 엔진 변경 (input/result 타입 무변경)

### GAP-1: 합계열 할증 제거 — 🚫 BLOCKER 보류 (2026-06-07)

```ts
// 제안: ((computedTax + generationSkipSurcharge) * base) / taxBase  →  (computedTax * base) / taxBase
```
→ perHeir `corpLimit`(할증 미포함)와 단일화 의도. **그러나 Do 중 회귀 발견으로 보류**:
- 기존 anchor **AN-8**(`heir-allocation-summary-table.test.ts`)·**A4-6**(`allocation-calc-basis-echo.test.ts`)이 PDF 책 1866 표8 **합계열 = 할증 포함 277,943,123**을 명시 anchor([[feedback_pdf_example_test_anchoring]] 신뢰 대상).
- A4-6은 "⑩b 영리법인 272,874,251(할증 미포함) · **합계 277,943,123**(할증 포함)"을 **둘 다** 의도적으로 기록 → 작성자가 PDF에서 "영리법인열 ≠ 합계열"을 보았을 가능성.
- 법령 논리(영리법인 §27 할증 무관)는 할증 미포함을 지지하나, **PDF 책 1866 표8 원본의 ⑩b 합계 실제값(272,874,251 vs 277,943,123) 확인 없이는 단정 불가**.
- → **GAP-1 엔진 변경 롤백(원복)**. PDF 원본/사용자 판단 확보 후 재개. CORP-10B anchor도 보류.

### GAP-2: result 무변경 — 데이터 기존재

`CorporateExemptionResult.perCorporateBreakdown[]`(생성처 `inheritance-corporate-exemption.ts:127`, `distributePerCorporate` 안분 :160~184)에 법인별 `corporateId`·`exemptionAmount` 존재. 엔진 변경 0 — **`lib/calc/heir-allocation-summary.ts`의 rows 빌더(순수 함수)** ⑩c perHeir 콜백이 이 데이터를 매핑(ui.design). 결과뷰 컴포넌트가 아닌 lib/calc 계층 수정이며, 화면·PDF가 이 rows를 공유.

---

## 계산 알고리즘

1. GAP-1: `corporateExemptionLimitDisplay` 산식에서 `generationSkipSurcharge` 항 제거.
2. GAP-2: 엔진 무변경. distributePerCorporate가 이미 단일(=totalExemption)·다수(floor 안분) 분기(`:162~164`).

---

## Silent fallback / 자동 안분 후보

- GAP-2 결과뷰 매핑은 `perCorporateBreakdown?.find(corporateId)?.exemptionAmount ?? corporateExemption.amount` — 단일/누락 시 전체 면제액 fallback(회귀 보존). 자동 안분 아님(엔진 산출값 표시).
- ★ 다수 영리법인 floor 안분 잔액 미흡수(`:164`)는 **별도 후속**(GAP-2 범위 외, [[feedback_floor_residual_absorption]]).

---

## 테스트 약속

- CORP-10B-1·2 / 10C-1·2 (케이스 인벤토리). Pre-Do로 CORP-10B-1·10C-1 우선 작성 → 실패 확보.
- 회귀: 기존 CORP-10A-1~4 + 단일 영리법인 전수 불변.
- 전체 `npm test` 회귀 0.
