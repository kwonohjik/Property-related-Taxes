# 비상장주식 평가서 react-pdf 정식 출력 (PR-J) 계획서

> **Source**: `docs/00-pm/inheritance-unlisted-stock-valuation-followup.plan.md` §3 **PR-J (F-4)**
> **Companion**: HTML 5쪽 재현(`BesshiForm4Buppyo3PrintView.tsx`) — `a48a4e0` 완료. 본 PR은 PDF 변환만.
> **Date**: 2026-05-24

---

## 1. 배경

- 별지 부표3 5쪽 HTML 재현은 이미 완료 (사례 6 4축 1:1 일치, anchor 15건)
- 현재는 브라우저 `Cmd+P` → "다른 이름으로 저장" PDF 의존
- `@react-pdf/renderer@4.5.1` 패키지 + 한글 폰트(NanumGothic) 등록 이미 존재 (`lib/pdf/fonts.ts`)
- 기존 `ResultPdfDocument.tsx` 패턴 재사용 가능

## 2. 목표

- 별지 제4호 부표3 5쪽(제1·2·4·5·6쪽)을 **react-pdf 정식 PDF로 다운로드**
- 다운로드 버튼 1개 추가 (`UnlistedStockBesshiPdfDownloadButton`)
- HTML 인쇄 모드와 시각 일치 — 동일 표 구조·셀 번호·숫자

## 3. 작업 범위

```
lib/pdf/
├── UnlistedStockBesshiPdfDocument.tsx     # ★ 신규 — react-pdf Document
│   - registerFonts() 호출 (NanumGothic)
│   - Document → 5 Page (제1·2·4·5·6쪽) — 각 Page에 A4 size 지정
│   - 표는 View+View+Text 조합 (react-pdf는 <table> 미지원)
│   - 셀 번호·숫자·라벨 HTML과 1:1 일치

components/calc/inheritance/unlisted-stock-v2/
├── UnlistedStockBesshiPdfDownloadButton.tsx   # ★ 신규 — PDFDownloadLink 래퍼
│   - 동적 import (SSR 차단 — react-pdf는 client only)
│   - 로딩·에러 상태 표시
│   - 파일명: `비상장주식평가서_{corpName}_{YYYY-MM-DD}.pdf`

└── BesshiForm4Buppyo3PrintView.tsx        # 수정 — 헤더에 다운로드 버튼 추가
```

## 4. anchor 매트릭스 (간소형 5건)

| ID | 시나리오 | 검증 |
|---|---|---|
| J-1 | UnlistedStockBesshiPdfDocument 컴포넌트 렌더 (사례 6) — 에러 없음 | smoke render |
| J-2 | 다운로드 버튼 클릭 가능 (PDFDownloadLink mount) | RTL |
| J-3 | 파일명 generator — `비상장주식평가서_${corpName}_${YYYY-MM-DD}.pdf` | unit |
| J-4 | 영업권 자동배제 4종 시 footer 표시 (excludedByLaw badge) | smoke |
| J-5 | 평가 결과 없음(totalShares=0) 시 다운로드 버튼 disabled | RTL |

react-pdf 렌더 결과는 PDF 바이너리이므로 시각 검증은 브라우저 수동(Phase H). anchor는 컴포넌트 mount·prop 검증만.

## 5. 한계 / 단순화

- **표 구조 단순화**: react-pdf는 `<table>` 미지원 — `flexDirection: "row"` 셀로 변환
- **HTML 시각 100% 일치 어려움**: 폰트(NanumGothic vs serif)·border-collapse·rowspan 차이
- **5쪽 자동 분리**: react-pdf의 `<Page>` 컴포넌트가 자연 분리
- **§55③ 자동배제 4종 badge**: HTML 동일 텍스트 표시
- **나-마 양수 자=0 footer**: HTML 동일 (사례 6 OQ-1 안내)

## 6. 작업 분해 (Phase 단위 — 약 3시간)

| Phase | 산출물 | 시간 |
|---|---|---|
| A. Plan/Design | 본 계획서 + 디자인(간소형 — 동일 문서) | 15분 |
| B. PDF Document | `UnlistedStockBesshiPdfDocument.tsx` 5쪽 (~500줄) | 90분 |
| C. Download 버튼 | `UnlistedStockBesshiPdfDownloadButton.tsx` (~60줄) | 20분 |
| D. main 통합 | `BesshiForm4Buppyo3PrintView.tsx` 헤더에 버튼 1개 추가 | 10분 |
| E. anchor 5건 | smoke + unit + RTL | 30분 |
| F. 회귀·커밋 | tsc + npm test + 한국어 커밋·push | 15분 |

## 7. Definition of Done

- [ ] anchor 5건 통과
- [ ] 기존 회귀 0건 (4,769 PASS 유지)
- [ ] `npx tsc --noEmit` 0건
- [ ] 800줄 정책 — PDF Document ≤ 800줄
- [ ] 한글 폰트 NanumGothic 적용 (lib/pdf/fonts.ts 재사용)
- [ ] 파일명 한글·날짜 포함 (`비상장주식평가서_㈜향기_2024-01-20.pdf`)
- [ ] 다운로드 버튼은 result 존재 시만 활성
- [ ] (선택) 브라우저 수동 확인 — Chrome 다운로드 → Preview 5쪽 시각 검증

## 8. 디자인 — PDF Document 구조

```tsx
<Document>
  <Page size="A4">                       {/* 제1쪽: 평가대상 + 1주당 가액 */}
    <CoverSection input={input} result={result} />
  </Page>
  <Page size="A4">                       {/* 제2쪽: 4.순자산가액 */}
    <NetAssetSection raw={raw} netAssetTotal={t} goodwillFinal={g} />
  </Page>
  {hasEvaluationDeltaRows && (
    <Page size="A4">                     {/* 제4쪽: 5.평가차액 (조건부) */}
      <ValuationDeltaSection raw={raw} />
    </Page>
  )}
  <Page size="A4">                       {/* 제5쪽: 6.영업권 */}
    <GoodwillSection goodwill={result.goodwillCalculation} fyb={result.fiscalYearBreakdowns} />
  </Page>
  <Page size="A4">                       {/* 제6쪽: 7.순손익액 */}
    <NetIncomeBreakdownSection result={result} />
  </Page>
</Document>
```

각 섹션은 동일 파일 내 함수로 정의 (sibling 분리는 필요시 후속).
