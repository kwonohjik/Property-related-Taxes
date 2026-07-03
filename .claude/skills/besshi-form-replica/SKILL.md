---
name: besshi-form-replica
description: 공식 신고서 양식(별지 N호서식 부표 등) 컴포넌트 재현 표준 패턴. KoreanLaw MCP로 본문·뒷면 코드표 검증 → 칸 번호(①~⑮) testid 동결 → 빈 행 정책 → 코드 매핑 함수 → Tailwind utility 직접(외부 CSS 금지) → print 자동 펼침. 사용자 첨부 PDF가 구판일 때 최신본 라벨로 환류.
trigger: 별지 서식, 별지 제N호, 부표, 신고서 양식 재현, 신고서 표, 시행규칙 서식, PDF 양식, 신고서 PDF, 양식 컴포넌트, besshi, form replica, 평가명세서, 과세표준신고서, 양식 재현
---

# besshi-form-replica — 공식 신고서 양식 재현 표준 패턴

상속세·증여세·양도세 등 한국 세법 시행규칙 [별지 제N호서식] PDF 양식을 React 컴포넌트로 1:1 재현하는 표준 절차·구조·정책.

본 세션 사례: **별지 제10호서식 부표 1 (증여재산 및 평가명세서, 개정 2026.3.20.)** — `GiftTaxValuationFormTable.tsx`(현재 420줄) + anchor 18건 + 코드표 3종(재산구분 9·재산종류 14·평가기준 8) 검증.

## 적용 시점

- 사용자가 "PDF 양식 재현"·"별지 N호서식대로"·"신고서 양식 출력" 요청
- 결과 화면에 공식 양식 모양 그대로 인쇄용 컴포넌트 필요
- 사용자가 PDF 이미지 첨부 → 동일 시각 재현 요청
- 기존 단순 카드형 결과 → 공식 양식 교체

## 적용 금지

- 양식이 아닌 일반 결과 카드 — formula-display-builder / tax-summary-sidebar-pattern 사용
- 양식 자체 산식 변경이 필요한 경우 — 엔진 변경 선행 (echo-field-pattern 등)
- 입력 폼 — `tax-field-add` 14지점 동기화 사용

## 단계별 절차

### Phase 0 — KoreanLaw MCP 본문 조회 (필수 선행)

사용자 첨부 PDF 라벨(예: "2022.03.18 개정")을 그대로 신뢰하지 말고 **반드시 최신본 검증**:

```ts
mcp__claude_ai_KoreanLaw__get_annexes({
  lawName: "상속세 및 증여세법 시행규칙",  // 또는 양도세 = 소득세법 시행규칙
  annexNo: "10",       // 별지 번호
  knd: "2",            // 1=별표, 2=서식, 3=부칙별표, 4=부칙서식
});
```

결과에서 확정:
1. **최신 양식명·개정일**: 사용자 PDF보다 최신본이 있는지 — 있으면 최신본 라벨로 헤더 표기
2. **본문 컬럼 순서** + **데이터 행 수**: 사용자 이미지와 다를 수 있음 (본 세션 사례: 8행 → 10행)
3. **뒷면 작성방법 §N의 코드표** — ① 재산구분 / ② 재산종류 / ⑧ 평가기준 등 코드 정확값
4. **계 영역 라벨** (⑨~⑮ 등) 및 산식 관계
5. **첨부서류 문구·수수료·용지 규격**
6. **자식 서식** 동반 작성 의무 (예: 재산종류 14 사용 시 부표 5 의무)

★ 사용자 PDF의 "[별지 제10호서식 부표]" 같은 약칭 라벨은 **비공식** — 정식 명칭에 숫자 인덱스(부표 1) 필수 ([[korean-law-citation-verify]] 강제).

### Phase 1 — Plan 단계 필수 산출물

```markdown
## 3. 데이터 매핑

### 3.1 본문 표 행 (컬럼 N열)
| 부표 칸 | 데이터 소스 | 비고 |
|---|---|---|
| ① ...코드 | 고정 "A11" 또는 계산 | — |
| ... | EstateItem.xxx | optional |
| ⑦ 금액 | result.amount | 항상 채움 |

### 3.2 빈 행 정책
- ROWS_FIXED = N (최신본 기준)
- 자산 수 ≤ N → 데이터 + 빈 행 (N − 자산수)개
- 초과 시 양식 늘어남

### 3.3 코드 매핑 (★ KoreanLaw MCP 검증 결과)
**원문 enum vs 실제 enum 정합 확인 필수**:
- `grep -n "type AssetCategory" lib/.../types.ts` 로 실제 enum 값 확인
- 잘못된 매핑(`apartment` vs `real_estate_apartment`) 사전 차단

### 3.4 계 영역 ⑨~⑮
- 자기일관성 산식 명시 (`⑮ === max(0, ⑨−⑩−⑪−⑫−⑬) + ⑭`)
- 엔진 산식 역산 — 엔진이 노출하지 않는 중간값은 다른 필드 조합으로 재구성
```

### Phase 2 — Design 단계

- **케이스 매트릭스** (자산 1·N건·N+M건·자기일관성·코드 매핑 전수 — 현행 enum grep 기준) 사전 enumerate
- **Props 시그니처** — entity 배열 + 합계 number들 + optional 분리 필드 + Phase 2용 prop placeholder
- **컬럼 폭 표** — A4 인쇄 영역(794px @ 96dpi) 안 수용. `min-w-[Npx]` + `overflow-x-auto`
- **계 영역 구조** — rowSpan 결합(예: "과세가액 불산입액" rowSpan=3) 명시
- **testid 컨벤션 전수 enumeration**

### Phase 3 — Do 단계 코드 구조

```tsx
"use client";

import type { EstateItem, PropertyValuationResult } from "@/lib/tax-engine/types/...";
import { formatKRW } from "@/components/calc/inputs/CurrencyInput";

// 코드 매핑 — 실제 enum 키 사용
const PROPERTY_TYPE_CODE: Record<EstateItem["category"], string> = {
  cash: "01",
  real_estate_land: "02",
  // ... (Phase 1 매핑 + Phase 2 trigger 주석)
};

function toPropertyTypeCode(category: EstateItem["category"]): string {
  return PROPERTY_TYPE_CODE[category] ?? "12";  // fallback
}

// 계 영역 표시값 역산 (엔진 산식 변경 0)
function computeRow10(exempt: number, e11: number, e12: number, e13: number): number {
  return Math.max(0, exempt - e11 - e12 - e13);  // 음수 가드 필수
}

// Tailwind utility 직접 (외부 CSS 금지)
const CELL_BASE = "border border-black p-1 align-middle text-[11px]";
const CELL_CENTER = `${CELL_BASE} text-center`;
const CELL_AMOUNT = `${CELL_BASE} text-right tabular-nums`;
const CELL_NAME = `${CELL_BASE} text-left`;

const ROWS_FIXED = N;  // KoreanLaw MCP 최신본 기준

export function BesshiNFormTable({ /* props */ }: Props) {
  const totalRows = Math.max(ROWS_FIXED, dataRowCount);
  const emptyRowCount = totalRows - dataRowCount;

  return (
    <div className="border-2 border-black bg-white p-3 text-black print:bg-white print:text-black">
      {/* 양식 헤더 + (앞쪽) */}
      <div className="mb-1 flex items-start justify-between text-[10px]">
        <span>■ ...시행규칙 [별지 제N호서식 부표 1] 〈개정 2026. M. D.〉</span>
        <span>(앞쪽)</span>
      </div>

      {/* 관리번호 + 제목 */}
      <div className="mb-1 flex items-end gap-3">
        <div className="border border-black px-2 py-0.5 text-[10px]">관리번호 -</div>
        <h3 className="flex-1 text-center text-lg font-bold">양식 제목</h3>
      </div>
      <p className="mb-2 text-[10px]">※ 뒤쪽의 작성방법을 읽고 작성하시기 바랍니다.</p>

      {/* 본문 표 — 좁은 뷰포트 가로 스크롤 */}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[750px] border-collapse" aria-label="...">
          <caption className="sr-only">...</caption>
          <thead>
            <tr>
              <th className={CELL_CENTER} scope="col">① ...코드</th>
              {/* ... 모든 컬럼 */}
            </tr>
          </thead>
          <tbody data-testid="table-data-tbody">
            {dataRows.map((row, i) => (
              <tr key={row.id} data-testid={`row-data-${i + 1}`}>
                <td className={CELL_CENTER} data-testid="col-property-class">{row.classCode}</td>
                {/* ... */}
              </tr>
            ))}
            {Array.from({ length: emptyRowCount }).map((_, i) => (
              <tr key={`empty-${i}`} data-testid={`row-empty-${i + 1}`} className="h-7">
                <td className={CELL_CENTER}>&nbsp;</td>
                {/* ... 동일 골격 (빈 칸도 [ ]여 [ ]부 등 양식 본질 표기 보존) */}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* 계 영역 — 본문 표와 별도 <table> (PDF 양식 그대로) */}
      <table className="mt-2 w-full min-w-[750px] border-collapse">
        <tbody>
          <tr>
            <td className={`${CELL_CENTER} w-[40px]`} rowSpan={7}>계</td>
            <td className={CELL_CENTER} colSpan={2}>⑨ ...</td>
            <td className={CELL_AMOUNT} data-testid="row-9-gross">{formatKRW(v9)}</td>
          </tr>
          {/* ... rowSpan=3 묶음 (과세가액 불산입액 등) */}
          <tr>
            <td className={`${CELL_AMOUNT} border-t-2 border-black font-semibold`}
                colSpan={3} data-testid="row-15-sum">⑮ 합계 {formatKRW(v15)}</td>
          </tr>
        </tbody>
      </table>

      {/* 첨부서류 + 수수료 + 용지 규격 */}
      <div className="mt-2 flex items-center justify-between border border-black px-2 py-1 text-[10px]">
        <div>... 증명서류 ...</div>
        <div className="border-l border-black pl-3 text-center">수수료<br />없음</div>
      </div>
      <p className="mt-1 text-right text-[9px] text-gray-700">210mm×297mm[백상지 80g/㎡]</p>
    </div>
  );
}
```

### Phase 4 — 결과 화면 통합

```tsx
{/* 양식 펼침 토글 + print 자동 펼침 (CSS-only, useEffect 없음) */}
<div className="border rounded-xl overflow-hidden">
  <button
    type="button"
    onClick={() => setShowForm((v) => !v)}
    className="... print:hidden"
  >
    <span>양식 명칭 (별지 제N호서식 부표 1) — {dataCount}건</span>
    <span>{showForm ? "▲" : "▼"}</span>
  </button>
  <div className={showForm ? "block p-4" : "hidden print:block print:p-0"}>
    <BesshiNFormTable {...props} />
  </div>
</div>
```

### Phase 5 — testid 컨벤션 (전수 enumeration)

| testid | 위치 |
|---|---|
| `table-data-tbody` | 본문 표 `<tbody>` |
| `row-data-{n}` | 데이터 행 (n=1~) |
| `row-empty-{n}` | 빈 행 |
| `col-{slug}` | 각 컬럼 칸 (`col-property-class`·`col-amount` 등) |
| `row-N-{name}` | 계 영역 ⑨~⑮ 행 (`row-9-gross`·`row-15-sum`) |

★ 부표 칸 번호(①~⑮)를 testid에 그대로 동결 — [[feedback_pdf_table_row_one_to_one_mapping]] 자동 준수.

## 검증 anchor (최소 8건)

| ID | 조건 | 검증값 |
|---|---|---|
| BF-1 | 단일 자산 | ②/⑧ 코드 + ⑦ 금액 + ⑨/⑮ 합계 일치 |
| BF-2 | 사용자 이미지 케이스 재현 | 핵심 행 합산값 일치 |
| BF-3 | 데이터 K + 빈 행 (N−K) | tbody tr.length === N |
| BF-4 | K > N | tbody tr.length === K (양식 늘어남) |
| BF-5 | 자기일관성 (음수 가드) | ⑮ === max(0, ⑨−⑩−...) + ⑭ |
| BF-6 | 코드 매핑 전수 | 각 enum 값 → 부표 코드 |
| BF-7 | 평가기준 우선순위 | 특정 카테고리 우선(cash=06 등) |
| BF-8 | 분리값 매핑 | optional props로 분리 행 |

`afterEach(cleanup)` 누락 시 multiple elements 오류 — 본 세션 사례에서 9 tests fail. **반드시 추가**.

## 핵심 정책

### 외부 CSS 금지

프로젝트 컨벤션 — Tailwind utility 직접 적용. 신규 `.css` 파일·전역 클래스 작성 금지.

### 다크모드 강제 흰 배경

양식 가독성 우선 — `bg-white text-black print:bg-white print:text-black`. `dark:` variant 미사용.

### "원" 단위 표기 금지

[[feedback_no_won_suffix]] — `formatKRW` 결과 끝 "원" 미부착 (콤마만).

### 인쇄 가로 폭

컬럼 폭 합계 ≤ 750px (A4 794px 안전 수용). `min-w-[750px]` + 좁은 뷰포트 `overflow-x-auto`.

### print:block 자동 펼침 (useEffect 금지)

```tsx
<div className={open ? "block" : "hidden print:block"}>
```

useEffect로 `isPrinting` 추적 안티패턴 차단. 토글 버튼은 `print:hidden`.

## Phase 분기 정책

엔진 enum이 양식 코드를 100% 커버하지 못하는 경우 Phase 1/2 분리:

- **Phase 1**: 현재 enum으로 매핑 가능한 코드만 — fallback 12(기타) 또는 가장 가까운 코드
- **Phase 2** (별도 PR): enum 확장 + 본 컴포넌트 매핑 추가 — `// Phase 2 — ...` 주석으로 표시 + Props placeholder

본 세션 사례(당시) — AssetCategory 9종 → 부표 1 코드 14종 중 7개만 매핑. 04 개별주택·06 오피스텔·08 취득권리·13 가상자산·14 서화골동품은 Phase 2. 이후 AssetCategory는 16종으로 확장(crypto_asset 포함 — `ESTATE_ITEM_TYPE_CODE`는 exhaustive Record, 전용코드 부재 자산은 11/12 fallback)됐으므로 매핑표는 반드시 현행 enum grep 기준으로 재작성.

## 정책·메모리 참조

- ★ [[korean-law-citation-verify]] — 양식 본문·코드표는 MCP 검증 후 인용. 사용자 PDF 라벨도 약칭/구판 가능
- ★ [[feedback_pdf_table_row_one_to_one_mapping]] — 부표 칸 번호 ①~⑮ → testid·props·anchor 동결
- ★ [[feedback_no_won_suffix]] — 금액 끝 "원" 미부착
- ★ [[pre-do-anchor-verification]] — Plan/Design 후 Do 진입 전 anchor 1건 우선 작성
- ★ [[engine-formula-reverse-derive]] — 엔진 산식 변경 없이 표시 산식 역산 보완 (엔진이 직접 노출해야 하는 경우는 [[echo-field-pattern]])

## 후속 작업 분리 가이드

본 컴포넌트만 PR로 분리. 다음은 **별도 PR**:

- enum 확장 (entity 카테고리·ValuationMethod 등) → 마법사 입력·validate·API·UI 전반 영향
- 자식 서식 동시 작성 (예: 재산종류 14 사용 시 부표 5)
- 국외자산 토글 (entity 확장 + 본 컴포넌트 prop 활성)
- Playwright 스크린샷 회귀 (Playwright 셋업 선행)
- 사용자 브라우저 PDF 미리보기 시각 검증 (CLI 환경 한계)

## 안티패턴

❌ 사용자 첨부 PDF "(YYYY.MM.DD 개정)" 라벨을 그대로 신뢰
❌ AssetCategory enum 매핑 표를 grep 없이 추정 작성 (`apartment` vs `real_estate_apartment`)
❌ 외부 `*.css` 파일 신규 작성
❌ useEffect + `isPrinting` 상태 추적
❌ `dark:` variant로 다크모드 분기 시도
❌ 빈 행 td에 빈 문자열만 — `&nbsp;`로 셀 높이 유지 + `[ ]여 [ ]부` 등 양식 본질 표기 보존
❌ 본문 표와 계 영역을 단일 표로 합치기 (PDF 양식은 별도 박스)
❌ 자기일관성 anchor 누락
❌ `afterEach(cleanup)` 누락 → multiple elements 오류

## 검증 체크리스트

- [ ] KoreanLaw MCP로 최신본 양식 라벨 확정
- [ ] 코드표 3종 매핑표 작성 + 실제 enum 값 grep 검증
- [ ] testid ①~⑮ 동결
- [ ] 빈 행 정책 + ROWS_FIXED 상수
- [ ] 자기일관성 산식 anchor
- [ ] Tailwind utility 직접 (외부 CSS 0)
- [ ] print:block 자동 펼침 + 다크모드 강제 흰 배경
- [ ] `afterEach(cleanup)` 추가
- [ ] Phase 1/2 분리 명시 (enum 미커버 코드)
- [ ] 후속 PR 항목 분리 (Playwright·자식 서식·enum 확장)
