# 재산세 법조문 인용 링크화 — UI 설계

> 대상: 재산세(property) 입력폼 · 상위: `docs/00-pm/multi-tax-law-citation-link.plan.md` §5.1
> 공용 인프라 `LawArticleModal` 재사용(신규 0). 결과뷰는 이미 완성 — 입력폼만 링크화.

## 1. 결과뷰 — 변경 없음
`PropertyTaxResultView`(L294~304)가 이미 `result.legalBasis[]`를 `LawArticleModal`로 전부 렌더(재산세식 완성). 본 작업은 **입력폼 도움말 8건**만 링크화.

## 2. 입력폼 배지 8건 (LawArticleModal)
`LawArticleModal` props: `legalBasis`(정식명) + `label`(짧은 표시, 항 포함 시 G-5 항 하이라이트 자동). 표시 텍스트 `{label} ↗`, 클릭 → Dialog(parseLawRef 헤더 + 법제처 본문).

| 파일 | legalBasis | label |
|---|---|---|
| Step1 | 지방세법 §106 | 지방세법 §106 |
| Step2Separated | 지방세법 시행령 §102 | 시행령 §102 |
| Step2Separated | 지방세법 §106 | §106①3호 |
| Step2SeparateAggregate | 지방세법 시행령 §101 | 시행령 §101 |
| Step2SeparateAggregate | 지방세법 시행령 §101 | §101② |
| Step2SeparateAggregate | 지방세법 시행령 §103의2 | §103의2 1호 |
| Step3 | 지방세법 §122 | §122 단서 |
| Step3 | 지방세법 §122 | §122 |

**패턴**: 인라인 인용 "(지방세법 §106)"을 문장에서 제거 → 아래 배지(기본 className mt-1)로. ESLint --fix dead-import 함정 회피(신규 import 한 줄 한 named).

## 3. UI 텍스트 정정 (철거 버그 3중 동기화)
엔진 1년 정정에 맞춰 UI 텍스트도 동기화(드리프트 0):
- `Step2SeparateAggregate` ToggleCard description: "6개월 이내 특례 적용 가능" → "철거·멸실 후 1년 이내 별도합산 유지 특례"
- hint: "철거일부터 과세기준일(6월 1일)까지 6개월 이내" → "철거·멸실일부터 1년 이내" + §103의2 배지

## 4. E2E (e2e/property-law-citation-link.spec.ts)
| TC | 경로 | 검증 |
|---|---|---|
| PLAW-1 | 주택(기본) → 공시가격 총액 → 다음 → Step3 §122 단서 배지 | "지방세법 제122조" 헤더 |
| PLAW-2 | 토지 radio → 단가+면적 → 다음 → Step1 §106 배지 | "지방세법 제106조" + ESC 닫힘 |

**진입 함정(실측)**: 물건 유형 `RadioCardGroup` = **radio role**(button 아님) → `getByRole("radio", {name})`. 주택 공시가격 = **textbox "금액 입력"**(총액 직접), 토지 = `getByPlaceholder("공시지가 단가")` + `("면적 입력")`. worktree `E2E_PORT=3100`.

결과: **2 passed**. 팝업 헤더(props 기반)만 단정·본문 비단정(법제처 API).
