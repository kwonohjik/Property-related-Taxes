# 비상장주식 평가서(별지 제4호 부표3) — PDF 완전 재현 Design

> **Status**: Design — Phase A-0 KoreanLaw MCP 검증 결과 미반영 (Plan 승인 후 진입 시 추가)
> **Plan**: `docs/00-pm/inheritance-unlisted-stock-besshi-form-full-replica.plan.md`
> **Date**: 2026-05-23
> **Engine 변경**: 없음 (UI 컴포넌트 분리·신규만)

---

## 1. PDF 원본 캡처 (사례 6 — 별지 부표3 5쪽 출력)

| PDF 페이지 | 별지 쪽 | 섹션 | 사례 6 핵심 anchor |
|---|---|---|---|
| ~/Downloads/비상장주식 평가 사례.pdf, page=7 (좌) | 제1쪽 | 1.평가대상 + 2.순자산 단독 + 3.1주당 가액 ③~⑨ | ⑥=10,910 ⑨=13,092 총 340,392,000 |
| 동상 page=7 (우) | 제6쪽 | 7. 순손익액 (3년치) | 차=11,660 |
| 동상 page=8 (좌) | 제2쪽 | 4. 순자산가액 (자산총액 ①~⑧ + 부채총액 ⑨~⑲ + 다·라·마) | 자산소계 2,503,037,370 / 부채소계 2,013,685,670 |
| 동상 page=8 (우) | 제4쪽 | 5. 평가차액 (자산금액·부채금액 합계) | ① 합계 107,324,150 / ② 합계 15,775,800 |
| 동상 page=9 (좌) | 제5쪽 | 6. 영업권 (가~자 9행) | 가 58,341,511 / 마 48,935,170 / 자 0 |

**제3쪽**: PDF 사례 6에서 미사용. 보충 명세 영역으로 본 PR 범위 외(N-5 후속).

---

## 2. KoreanLaw MCP 검증 결과 (Phase A-0 placeholder)

> 본 섹션은 Plan 승인 후 Phase A-0에서 다음 6건의 MCP 호출 결과를 인용 박스로 첨부:
> 1. 상증령 §55① — 자산총액 ⑥·⑦ 가산/차감 방향
> 2. 상증령 §17의2 1~4호 — 자산·부채 17필드 매핑
> 3. 상증령 §59② — 영업권 5년 PV 산식 + 상증규 §19① 이자율
> 4. 상증령 §55③ — 영업권 자동배제 3사유 + 단서
> 5. 상증령 §56①·⑤ — 3년 가중평균 + 환산주식수
> 6. 상증법 §63③ + 상증령 §53⑥⑦⑧ 9호 — 할증평가 ×120%, 중소·중견 배제 (사례 6 일반기업 → 적용)

검증 후 인용 박스 형식:
```
[상증령 §55①] 원문: "...순자산가액(영업권을 포함하지 아니한다)..."
출처: KoreanLaw MCP `get_law_text` 2026-05-XX
적용 위치: Page2NetAssetTable §2.A 자산총액 산식
```

---

## 3. 컴포넌트 분리 구조도

```
components/calc/inheritance/unlisted-stock-v2/
├── BesshiForm4Buppyo3PrintView.tsx     # 200줄 — 5쪽 orchestrator
│   - useState<boolean> open — 토글 펼침/접힘 (main 단독 보유)
│   - 토글 버튼(print:hidden) + aria-expanded={open} 접근성
│   - 양식 wrapper (print:break-before-page 4곳 적용)
│   - 5개 Page 컴포넌트 import + 조립 — sibling은 state-less, props만 받음
│   - <style jsx global> @page A4 portrait
│   - 외부 export 100% 보존 (기존 default export)
│   - aria-label="비상장주식 등 평가서 (별지 제4호 부표3)" 양식 wrapper 적용
│
├── besshi/
│   ├── BesshiSharedAtoms.tsx           # 80줄 — atom 통합
│   │   export { SectionTitle, ResultTableRow, BreakdownRow, fmt, renderDelta }
│   │
│   ├── Page1CoverSection.tsx           # 100줄 — 제1쪽
│   │   - 1.평가대상 표 (법인명·발행주식·평가기준일·부동산과다)
│   │   - 2.순자산 단독 [v] 표시 (조건부)
│   │   - 3.1주당 가액 ③~⑨ 9행
│   │
│   ├── Page2NetAssetTable.tsx          # ★ 신규 200줄 — 제2쪽
│   │   - 4.순자산가액
│   │     - 가.자산총액 ①~⑧ (소계 산식 표시)
│   │     - 나.부채총액 ⑨~⑲ (소계 산식 표시)
│   │     - 다.영업권포함전 (⑧ − ⑲)
│   │     - 라.영업권 → 제5쪽 자.영업권평가액 참조
│   │     - 마.순자산가액 (다 + 라)
│   │
│   ├── Page4ValuationDeltaTable.tsx    # 80줄 — 제4쪽 (라벨 "제4쪽" 정정)
│   │   - 5.평가차액
│   │     - 자산금액 ① 합계
│   │     - 부채금액 ② 합계
│   │     - 계정과목별 상세 표
│   │
│   ├── Page5GoodwillTable.tsx          # ★ 신규 150줄 — 제5쪽
│   │   - 6.영업권 가~자 9행
│   │   - §55③ 자동배제 badge (4종 분기)
│   │
│   └── Page6NetIncomeBreakdown.tsx     # 200줄 — 제6쪽
│       - 7.순손익액 3년치 표
│       - 가산·차감 ①~㉒
│       - 다·라·마·바·사·아·자·차 흐름
```

**파일 크기 사전 추정**: main 200 + atoms 80 + Page1 100 + Page2 200 + Page4 80 + Page5 150 + Page6 200 = 1,010줄 (분리 전 단일 312줄 → 분리 후 평균 144줄/파일, 800줄 정책 완전 준수).

**Plan §3.4 vs Design 일관성**: Plan은 "main 약 200줄 / Page2 약 180줄 / Page5 약 120줄"이라 했으나 본 Design에서 Page2(자기일관 anchor 산식 표시 포함)·Page5(§55③ 4종 badge 분기 포함) 실제 구현 라인을 재추정해 Page2 200줄·Page5 150줄로 상향. Plan은 이 Design 추정을 정본으로 반영 (Plan 정정 → 통합비교 §11에서 처리).

**PDF 캡처 매핑 (Phase A-0 시 첨부)**: 각 sibling 컴포넌트는 PDF 원본 캡처(`~/Downloads/비상장주식 평가 사례.pdf` 해당 페이지)를 컴포넌트 파일 상단 주석에 인용 경로로 명시. 캡처 추출 명령은 Phase A-0 시 `pdftoppm` 또는 PDF page 직접 참조.

---

## 4. Page2NetAssetTable 세부 디자인

### 4.1 PDF 원본 표 구조 (제2쪽)

```
┌─────────────────────────────────────────────────────────────────────┐
│ 4. 순자산가액                                                       │
├─────────────────────────────────────────────────────────────────────┤
│ 가. 자산총액                                                        │
├─────┬─────────────────────────────────────────┬────────┬───────────┤
│  ①  │ 재무상태표상의 자산가액                  │        │2,476,889,520│
│  ②  │ 평가차액                                │        │   91,548,350│ → 제4쪽 5.가.② 기재
│  ③  │ 법인세법상 유보금액                      │        │           0│
│  ④  │ 유상증자 등                             │        │           0│
│  ⑤  │ 평가기준일 현재 지급받을 권리 확정 가액  │        │           0│
│  ⑥  │ 선급비용 등                             │ 65,400,500 │           │ (차감)
│  ⑦  │ 증자일 전의 잉여금의 유보액              │        0  │           │ (차감)
│  ⑧  │ 소계 (①+②+③+④+⑤-⑥-⑦)             │        │2,503,037,370│
├─────┴─────────────────────────────────────────┴────────┴───────────┤
│ 나. 부채총액                                                        │
├─────┬─────────────────────────────────────────┬────────┬───────────┤
│  ⑨  │ 재무상태표상의 부채액                    │        │1,833,780,000│
│  ⑩  │ 법인세                                  │        │   32,627,890│
│  ⑪  │ 농어촌특별세                            │        │           0│
│  ⑫  │ 지방소득세                              │        │    3,262,780│
│  ⑬  │ 배당금·상여금                           │        │           0│
│  ⑭  │ 퇴직급여추계액                          │        │  445,785,000│
│  ⑮  │ 기타충당금                              │        0  │           │ (차감)
│  ⑯  │ 제준비금                                │        0  │           │ (차감)
│  ⑰  │ 제충당금                                │301,770,000│          │ (차감)
│  ⑱  │ 기타(이연법인세대 등)                   │        0  │          │ (차감)
│  ⑲  │ 소계 (⑨+⑩+⑪+⑫+⑬+⑭-⑮-⑯-⑰-⑱)  │        │2,013,685,670│
├─────┼─────────────────────────────────────────┼────────┼───────────┤
│ 다  │ 영업권 포함 전 순자산가액 (⑧ − ⑲)       │        │  489,351,700│
│ 라  │ 영업권                                  │        │           0│ ← 제5쪽 자.영업권평가액
│ 마  │ 순자산가액 (다 + 라)                    │        │  489,351,700│
└─────┴─────────────────────────────────────────┴────────┴───────────┘
```

### 4.2 컴포넌트 시그니처

```tsx
interface Page2NetAssetTableProps {
  raw: UnlistedNetAssetCalculation;          // input.netAssetValueRaw — ①~⑱ 17필드
  netAssetTotal: number;                     // result.netAssetTotal (마. 다 + 라)
  goodwillFinal: number;                     // result.goodwillCalculation.goodwillFinal (라.)
}
```

**다.영업권포함전 산식**: prop으로 `selfCapital` 받지 않고 표 내부에서 `⑧ − ⑲` 직접 계산 (engine `goodwillCalculation.selfCapital`과 동일하므로 prop 중복 제거 — single source of truth는 `raw`).

### 4.3 핵심 산식 검증 (자기일관성 anchor F-4·F-5·F-6)

```
F-4: ⑧ === (① + ② + ③ + ④ + ⑤) − (⑥ + ⑦)
F-5: ⑲ === (⑨ + ⑩ + ⑪ + ⑫ + ⑬ + ⑭) − (⑮ + ⑯ + ⑰ + ⑱)
F-6: 마 === 다 + 라  (사례 6: 489,351,700 + 0 = 489,351,700)
```

tolerance ≤ 1원 (BigInt 미사용 시 JS Number 정밀도 오차).

### 4.4 testid 매핑 (F-1 셀번호 검증)

각 행은 `<tr data-besshi-cell="p2-①">` ~ `<tr data-besshi-cell="p2-⑲">` + `data-besshi-cell="p2-다"`·`"p2-라"`·`"p2-마"` 3행.

---

## 5. Page5GoodwillTable 세부 디자인

### 5.1 PDF 원본 표 구조 (제5쪽)

```
┌─────────────────────────────────────────────────────────────────────┐
│ 6. 영업권                                                           │
├─────┬─────────────────────────────────────────┬─────────────────────┤
│ 가  │ 평가기준일 이전 3년간 순손익액의 가중평균액│  ①×3 + ②×2 + ③ / 6│
│     │                                         │      58,341,511     │
│  ①  │ 평가기준일 이전 1년 사업연도 순손익액     │      76,842,660     │
│  ②  │ 평가기준일 이전 2년 사업연도 순손익액     │      62,416,500     │
│  ③  │ 평가기준일 이전 3년 사업연도 순손익액     │      △5,311,910     │
├─────┼─────────────────────────────────────────┼─────────────────────┤
│ 나  │ 가 × 50%                                │      29,170,755     │
│ 다  │ 평가기준일 현재 자기자본                  │     489,351,700     │
│ 라  │ 기획재정부령이 정하는 이자율             │         10%         │
│ 마  │ 다 × 라                                 │      48,935,170     │
│ 바  │ 영업권 지속연수                          │         5년         │
│ 사  │ 영업권 계산액 Σⁿ₌₁⁵ (나 − 마)/(1+0.1)ⁿ │           0         │
│ 아  │ 영업권 상당액 중 매입 무체재산권 감가상각비 공제분│      0       │
│ 자  │ 영업권 평가액 (사 − 아)                  │           0         │ → 제2쪽 4.라 기재
└─────┴─────────────────────────────────────────┴─────────────────────┘
```

### 5.2 컴포넌트 시그니처

```tsx
interface Page5GoodwillTableProps {
  goodwill: UnlistedGoodwillResult;          // result.goodwillCalculation
  fiscalYearBreakdowns: [FY, FY, FY];        // result.fiscalYearBreakdowns (가의 ①·②·③)
}
```

### 5.3 §55③ 자동배제 4종 badge 분기

```tsx
const excludedReasonLabel: Record<NonNullable<UnlistedGoodwillResult["excludedByLaw"]>, string> = {
  liquidation: "§55③ 1호 — 청산절차 진행 → 영업권 가산 없음",
  real_estate_80: "§55③ 2호 본문 — 부동산 80% 이상 → 영업권 가산 없음",
  lt3y: "§55③ 2호 단서 — 사업개시 3년 미만·휴·폐업",
  continuous_loss_3y: "§55③ 3호 — 직전 3년 계속 결손 → 영업권 자동 0",
};
```

memory `enum-verification-before-mapping` 정책: TypeScript `Record<EnumType, string>` 강제 — 4종 누락 시 컴파일 에러.

**가-마 양수인데 자=0 표시 시 footer 안내** (사례 6 OQ-1 대응):

```tsx
{goodwill.weightedAvgHalf - goodwill.selfCapitalRate > 0 && goodwill.goodwillFinal === 0 && (
  <p className="text-[10px] text-amber-700 bg-amber-50 p-2 border border-amber-200 mt-2">
    ※ 나(가×50%) − 마(다×라) = {fmt(goodwill.weightedAvgHalf - goodwill.selfCapitalRate)}원 양수이나
    상증령 §55③ 자동배제 또는 5년 PV 산식 적용 결과 영업권 평가액이 0으로 산출되었습니다.
    상세 근거는 엔진 출력 `appliedRules`·`warnings` 참조.
  </p>
)}
```

사용자가 "왜 0인지?" 질문할 가능성을 사전 차단 (UX 명료성 + 디버깅 단서).

### 5.4 testid 매핑

`p5-가` ~ `p5-자` 9행 + `p5-가-①`·`p5-가-②`·`p5-가-③` 3행 (가의 세부) = **총 12 testid**. 가 헤더 자체는 그룹 testid `p5-가` 1개로 매핑되며 그 아래 3 sub-cell이 추가됨 — 합계 12 (9 + 3, 가 헤더 중복 없음).

### 5.5 음수 표시 정책

`renderDelta(n)` 헬퍼: `n < 0 ? \`△${fmt(Math.abs(n))}\` : fmt(n)` — PDF 원문 "△5,311,910" 정확히 재현.

---

## 6. Print Page-Break 디자인

### 6.1 main 컴포넌트 break 삽입 위치

```tsx
<div className={open ? "block" : "hidden print:block"}>
  <Page1CoverSection ... />
  <div className="print:break-before-page" />     {/* 제1 → 제2 */}
  <Page2NetAssetTable ... />
  <div className="print:break-before-page" />     {/* 제2 → 제4 (제3쪽 미사용) */}
  <Page4ValuationDeltaTable ... />
  <div className="print:break-before-page" />     {/* 제4 → 제5 */}
  <Page5GoodwillTable ... />
  <div className="print:break-before-page" />     {/* 제5 → 제6 */}
  <Page6NetIncomeBreakdown ... />
</div>
```

총 4곳 (5쪽 출력 = 페이지간 break 4회).

### 6.2 다크모드 강제 흰 배경

```tsx
<div className="
  rounded-lg border border-gray-300
  bg-white text-black
  print:bg-white print:text-black
  dark:bg-white dark:text-black
  print:border-none print:rounded-none
">
```

모든 child의 dark 변형 차단 — `font-serif text-black` 전체 wrapper 적용.

### 6.3 A4 페이지 규격

main 컴포넌트 최상단:

```tsx
<style jsx global>{`
  @media print {
    @page { size: A4 portrait; margin: 15mm; }
    body { margin: 0; }
  }
`}</style>
```

memory `print-only-css-toggle` 정책: useEffect·isPrinting 상태 추적 없이 CSS-only.

---

## 7. anchor 테스트 매트릭스 (13건)

| ID | 파일 | 검증 | 기대값 |
|---|---|---|---|
| F-1 | besshi-form-full-replica.test.tsx | RTL render 사례 6 + 모든 셀번호 testid 존재 확인 + 숫자 텍스트 일치 | 30+ testid 통과 |
| F-2a | 동상 | excludedByLaw="liquidation" 시 badge 텍스트 | "§55③ 1호 — 청산절차 진행" |
| F-2b | 동상 | "real_estate_80" badge | "§55③ 2호 본문 — 부동산 80% 이상" |
| F-2c | 동상 | "lt3y" badge | "§55③ 2호 단서 — 사업개시 3년 미만" |
| F-2d | 동상 | "continuous_loss_3y" badge | "§55③ 3호 — 직전 3년 계속 결손" |
| F-3 | 동상 | 영업권 > 0 시나리오 가공 | 자.영업권 > 0 표시, 마.순자산 = 다 + 라 |
| F-4 | 동상 | Page2 자산총액 자기일관 | tolerance ≤ 1원 |
| F-5 | 동상 | Page2 부채총액 자기일관 | tolerance ≤ 1원 |
| F-6 | 동상 | Page2 다 + 라 = 마 | === 일치 |
| F-7 | 동상 | Page5 가 = 가중평균 산식 | tolerance ≤ 1원 |
| F-8 | 동상 | 사례 1 회귀 — 순손익가치만 시나리오 | 기존 anchor 회귀 0건 |
| F-9 | 동상 | 사례 5 회귀 — 중소기업 할증배제 시나리오 | 기존 anchor 회귀 0건 |
| F-10 | 동상 | DOM 검증: print:break-before-page 노드 4개 | `querySelectorAll(".\\:print\\:break-before-page").length === 4` |

### 7.1 RTL 테스트 패턴 (vitest + jsdom + RTL)

```tsx
/** @vitest-environment jsdom */
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { BesshiForm4Buppyo3PrintView } from "@/components/calc/inheritance/unlisted-stock-v2/BesshiForm4Buppyo3PrintView";
import type { UnlistedStockValuationInput } from "@/lib/tax-engine/types/unlisted-stock-valuation.types";

// 사례 6 입력 — case-5a-integration.test.ts의 case6V2Item.unlistedStockValuationV2와 동일 데이터
const case6Input: UnlistedStockValuationInput = { /* ...PDF 사례 6 17필드... */ };

it("F-1: 사례 6 4축 일치", () => {
  render(<BesshiForm4Buppyo3PrintView input={case6Input} />);

  // 토글 펼치기
  fireEvent.click(screen.getByText(/인쇄 미리보기/));

  // 셀번호 testid 검증 (data-testid + data-besshi-cell 두 attribute 모두 명시)
  expect(screen.getByTestId("p1-③")).toHaveTextContent("489,351,700");
  expect(screen.getByTestId("p2-⑧")).toHaveTextContent("2,503,037,370");
  expect(screen.getByTestId("p2-⑲")).toHaveTextContent("2,013,685,670");
  expect(screen.getByTestId("p2-마")).toHaveTextContent("489,351,700");
  expect(screen.getByTestId("p5-가")).toHaveTextContent("58,341,511");
  expect(screen.getByTestId("p5-마")).toHaveTextContent("48,935,170");
  expect(screen.getByTestId("p5-자")).toHaveTextContent("0");
});
```

**attribute 이중 적용 패턴** (셀번호 표시):

```tsx
<tr data-testid={`p2-${cellNum}`} data-besshi-cell={`p2-${cellNum}`}>
  ...
</tr>
```

- `data-testid` — RTL `getByTestId` 표준
- `data-besshi-cell` — 양식 디자인 매핑 자기 문서화 (DOM 인스펙터 가독성)

### 7.2 jsdom 한계와 F-10 검증 방법

jsdom은 `@media print` CSS 미디어 쿼리를 지원하지 않으므로 실제 페이지 break 동작을 검증할 수 없다. F-10은 **DOM 노드 존재**로 대체:

```tsx
it("F-10: print page-break 4곳 존재", () => {
  const { container } = render(<BesshiForm4Buppyo3PrintView input={case6Input} />);
  fireEvent.click(screen.getByText(/인쇄 미리보기/));
  // Tailwind class "print:break-before-page" 포함 노드 검색
  const breakNodes = container.querySelectorAll('[class*="break-before-page"]');
  expect(breakNodes.length).toBe(4);
});
```

실제 인쇄 시 page-break 동작은 Phase H 브라우저 수동 확인(Chrome `Cmd+P`)으로 별도 검증.

---

## 8. 동기화 지점 매핑 (14지점 중 적용 대상)

| # | 지점 | 본 PR 작업 | 영향 |
|---|---|---|---|
| ① | 폼 상태 타입 | — | 변경 없음 |
| ② | initial value | — | 변경 없음 |
| ③ | normalize | — | 변경 없음 |
| ④ | API 변환 | — | 변경 없음 |
| **⑤** | **UI 입력 위젯** | **Page2·Page5 신규 + sibling 분리** | UI 표시만 추가 |
| ⑥ | 사이드바 합계 | — | 변경 없음 |
| **⑦** | **결과 카드 산식·표시** | **main이 신규 5개 페이지 import + page-break + 다크 강제 흰 배경** | 표시 통합 |
| ⑧ | Validation | — | 변경 없음 |
| ⑨~⑭ | Zod·route·body spread | — | 엔진 input/result 무변경 |

본 PR은 **⑤·⑦만 영향** — 엔진·API·검증 무변경.

---

## 9. 회귀 보호

### 9.1 기존 테스트 (회귀 0건 강제)

- `__tests__/tax-engine/property-valuation/case-5a-integration.test.ts` — 18 anchor (사례 6 + V2 validation + Zod)
- `__tests__/tax-engine/property-valuation/case-1-net-income-calc.test.ts`
- `__tests__/tax-engine/property-valuation/case-3-net-asset-goodwill.test.ts`
- `__tests__/tax-engine/property-valuation/case-4-integration.test.ts`
- `__tests__/tax-engine/property-valuation/case-5b-branch-anchors.test.ts`
- `__tests__/tax-engine/property-valuation/case-5c-gift-scenario.test.ts`
- `__tests__/tax-engine/property-valuation/case-5d-mq-allowance-insurance.test.ts`

### 9.2 sibling 분리 시 외부 export 보존

main `BesshiForm4Buppyo3PrintView` default export 유지. 추가로 `Page1CoverSection` 등은 named export로 노출하되 main에서 `export { Page1CoverSection } from "./besshi/Page1CoverSection"` re-export로 외부 import 사이트 변경 0건 보장 (memory `feedback_800line_split_export_preservation`).

---

## 10. 미해결 결정사항 / Open Questions

| # | 항목 | 해결 시점 |
|---|---|---|
| OQ-1 | 영업권 사례 6 사. = 0 산식 근거 (가-마 = 9.4M 양수인데 0) | Phase A-0 KoreanLaw MCP 검증 후 결정 — 본 PR은 엔진 결과 그대로 표시 |
| OQ-2 | 사업자등록번호·대표자 분리 입력 여부 | N-3 후속 PR |
| OQ-3 | 제3쪽 보충 명세 구현 | N-5 후속 PR |
| OQ-4 | react-pdf 도입 | N-1 후속 PR |

---

## 11. 승인 요청 (Design 단계)

본 디자인으로 Do(Phase B~H) 진입해도 되는지 확인 부탁드립니다. 핵심 결정:
1. **5쪽 출력**(제3쪽 미사용 — N-5 후속)
2. **5개 sibling 컴포넌트** 분할 (총 1,010줄, 평균 144줄)
3. **testid 동결**: `data-besshi-cell="<page>-<번호>"` 30+ 셀
4. **§55③ 자동배제 4종 모두 anchor** (Record 타입 강제)
5. **자기일관성 anchor 4건** (F-4·F-5·F-6·F-7) tolerance ≤ 1원
6. **OQ-1 영업권 산식**: 본 PR은 엔진 결과 그대로 — 산식 정정은 N-6 후속
