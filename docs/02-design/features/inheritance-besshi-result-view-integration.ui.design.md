# 비상장주식 별지 부표3 — 결과 화면 출력 연결 (UI 디자인)

> 작성일: 2026-05-26
> 계획서: `docs/00-pm/inheritance-besshi-result-view-integration.plan.md`
> 선행: 별지 양식 완성 commit `bcfe80d`
> 성격: **출력 전용 연결** — 엔진·타입·API·validate 변경 0. 신규 UI 컴포넌트 1개 + 결과뷰 2곳 연결 + BesshiForm Date 정규화 1곳.

## 1. 목표·범위

별지 제4호 부표3 출력(`BesshiForm4Buppyo3PrintView`)을 입력 단계뿐 아니라 **상속세·증여세 계산 결과 화면**에서도 미리보기 토글 + PDF 다운로드로 제공한다.

- 신규 컴포넌트: `UnlistedStockBesshiResultSection.tsx` (estateItems만 받는 순수 섹션)
- 연결: `InheritanceTaxResultView`(L643 재산 평가 내역 다음) + `GiftTaxResultView`(동일 평가 요약 다음)
- Date 안전: `BesshiForm4Buppyo3PrintView` 내부 정규화 1회(try/catch fallback)

## 2. 케이스 인벤토리 (행≥1 필수)

| ID | 입력 상태 | 기대 출력 | anchor |
|---|---|---|---|
| C-1 | estateItems에 V2 자산 1건(완성 입력, Date 객체) | 별지 섹션 1개 렌더, `besshi-form-toggle` 존재 | RV-1 |
| C-2 | V2 자산 1건, `evaluationDate`가 **string**("2024-01-20") (sessionStorage 복원) | 정규화로 `toISOString` 에러 없이 렌더 + PDF 파일명 생성 성공 | RV-2 |
| C-3 | estateItems에 V2 자산 0건(일반 재산만) | 섹션 미표시(`return null`) | RV-3 |
| C-4 | V2 자산 2건(법인 A·B) | 별지 2개 + 각 법인명 헤더 | RV-4 |
| C-5 | 간편평가 자산(`unlistedStockData`만, V2 없음) | 섹션 미표시(filter 자동 제외) | RV-5 |
| C-6 | V2 자산이나 미완성(주식수 0·날짜 공란) | 정규화 throw→원본 fallback, BesshiForm 가드로 안내만(크래시 없음) | RV-6 (회귀 방어, F-8) |
| C-7 | 증여세 결과뷰에 V2 자산 1건 | 동일 섹션 1개 렌더(R-6 재사용) | RV-1 재사용 |

## 3. 컴포넌트 명세

### 3.1 `UnlistedStockBesshiResultSection.tsx` (신규)
> 위치: `components/calc/results/UnlistedStockBesshiResultSection.tsx`
> import 경로(D-1 정정 — 검증 완료):
> - `EstateItem` = `@/lib/tax-engine/types/inheritance-gift.types` (두 결과뷰 동일)
> - `BesshiForm4Buppyo3PrintView` = `@/components/calc/inheritance/unlisted-stock-v2/BesshiForm4Buppyo3PrintView`
```tsx
"use client";
import type { EstateItem } from "@/lib/tax-engine/types/inheritance-gift.types";
import { BesshiForm4Buppyo3PrintView } from "@/components/calc/inheritance/unlisted-stock-v2/BesshiForm4Buppyo3PrintView";

export function UnlistedStockBesshiResultSection({ estateItems }: { estateItems: EstateItem[] }) {
  const unlistedItems = estateItems.filter((it) => it.unlistedStockValuationV2); // C-5: V2만
  if (unlistedItems.length === 0) return null; // C-3·C-5
  return (
    <section className="border border-border rounded-xl overflow-hidden" data-testid="besshi-result-section">
      <h4 className="px-4 py-3 bg-muted/30 text-sm font-medium">
        비상장주식 평가서 (별지 제4호 부표3) — {unlistedItems.length}건
      </h4>
      {unlistedItems.map((it, i) => (
        <div key={i} className="p-3 border-t border-border first:border-t-0">
          {unlistedItems.length > 1 && (
            <p className="text-xs font-semibold mb-1 text-muted-foreground">
              {it.unlistedStockValuationV2!.corpName || `법인 ${i + 1}`}
            </p>
          )}
          <BesshiForm4Buppyo3PrintView input={it.unlistedStockValuationV2!} />
        </div>
      ))}
    </section>
  );
}
```
- 800줄 정책: 단일 작은 컴포넌트(sibling 분리로 결과뷰 줄수 증가 0~2줄).
- testid `besshi-result-section`(섹션 존재 판정) + 내부 `besshi-form-toggle`(BesshiForm 기존 testid).

### 3.2 `BesshiForm4Buppyo3PrintView.tsx` 수정 (Date 정규화 — F-2·F-3·F-8)
진입 직후:
```tsx
let safe = input;
try { safe = normalizeBesshiInput(input); } catch { safe = input; }
```
이후 **모든 `input` 참조를 `safe`로 교체**:
- L63 `evaluateUnlistedStockV2(safe)`
- L83 `<UnlistedStockBesshiPdfDownloadButton input={safe} />` (PDF 파일명·문서 Date 안전)
- L113~ `Page1CoverSection input={safe}`, L121 `raw={safe.netAssetValueRaw}`, L131 등 전부

**Pre-Do 실측 환류 — Page1CoverSection 방어 필수**: 정규화 try/catch fallback만으로는 **미완성 입력(`evaluationDate=undefined`)을 못 막는다** — fallback이 원본(undefined)을 Page1에 넘기고, `Page1CoverSection`은 `result` 없이도 항상 렌더(L113)되어 `undefined.toISOString()`이 여전히 throw. 따라서 `Page1CoverSection.tsx:64`에 인스턴스 가드 추가:
```tsx
{input.evaluationDate instanceof Date && !isNaN(input.evaluationDate.getTime())
  ? input.evaluationDate.toISOString().slice(0, 10)
  : "-"}
```
(이 가드는 Page1이 단독 export·재사용될 때도 안전. 완성+string은 BesshiForm 정규화가 Date로 변환해 정상 표시, 미완성은 "-".)

`normalizeBesshiInput` (동일 파일 또는 `besshi/` 헬퍼):
```ts
function normalizeBesshiInput(input: UnlistedStockValuationInput): UnlistedStockValuationInput {
  return {
    ...input,
    evaluationDate: toDate(input.evaluationDate, "evaluationDate"),
    businessStartDate: toDate(input.businessStartDate, "businessStartDate"),
    fiscalYears: input.fiscalYears.map((fy) => ({
      ...fy, fiscalYearEndDate: toDate(fy.fiscalYearEndDate, "fiscalYearEndDate"),
    })) as UnlistedStockValuationInput["fiscalYears"], // F-3: 3-튜플 보존
    capitalChanges: input.capitalChanges.map((c) => ({
      ...c, changeDate: toDate(c.changeDate, "changeDate"),
    })),
  };
}
```

### 3.3 결과뷰 연결 (2곳)
- `InheritanceTaxResultView.tsx` L643 재산 평가 내역 섹션 직후:
  ```tsx
  {estateItems && <UnlistedStockBesshiResultSection estateItems={estateItems} />}
  ```
- `GiftTaxResultView.tsx` 동일 평가 요약 다음에 동일 1줄(R-6).

## 4. Pre-Do anchor (RV-1~5)

| anchor | 시나리오 | 기대 | 용도 |
|---|---|---|---|
| RV-1 | C-1: V2 1건 → `besshi-result-section` + `besshi-form-toggle` 존재 | 렌더됨 | R-1 |
| RV-2 | C-2: `evaluationDate` **string**인 input으로 `BesshiForm` **RTL 렌더** → 크래시 없이 toggle 렌더 + PDF 버튼 비-disabled | 에러 없음 | R-3·F-2 (실패 확보 후 정규화) |
| RV-3 | C-3: V2 0건 → 섹션 미표시 | section 부재 | R-5 |
| RV-4 | C-4: V2 2건 → 별지 2개 (`getAllByTestId('besshi-form-toggle')` 길이 2) | toggle 2개 | R-2 |
| RV-5 | C-5: 간편평가만 → 섹션 미표시 | section 부재 | R-7 |
| RV-6 | C-6: 미완성 입력(주식수 0 + `evaluationDate` undefined/string)으로 `BesshiForm` RTL 렌더 → 크래시 없이 안내(result 없음), PDF 버튼 disabled | 크래시 없음 | R-3·F-8 회귀 방어 |

> **RV-2 핵심 (D-2·D-7 정정 — 검증 방식·크래시 지점 명확화)**: `generateBesshiPdfFilename`·`UnlistedStockBesshiPdfDocument` 함수 **자체는 Date 전제**(내부 정규화 없음 — `input.evaluationDate.toISOString()` 직접). 따라서 RV-2는 그 함수를 string으로 직접 호출하는 테스트가 **아니라**, **`BesshiForm`을 string `evaluationDate`·완성 입력(totalShares>0·corpName 있음) input으로 RTL 렌더**하여 검증.
> - **현행(정규화 전) 크래시 1차 지점 = `Page1CoverSection.tsx:64`** (Pre-Do 실측 정정 — 당초 D-7은 PDF 버튼으로 예측했으나 실측은 Page1이 먼저). Page1은 `open` 토글과 무관하게 **항상 렌더**(L113, hidden은 CSS만)되므로 `input.evaluationDate.toISOString()`(string/undefined)이 PDF 버튼보다 먼저 throw. PDF 버튼 useMemo(`generateBesshiPdfFilename`)도 잠재 2차 지점. `evaluate`는 try/catch+가드(L61-67)로 보호되어 result만 undefined.
> - **정규화 후**: 진입 `safe`가 string→Date 변환 + `safe`를 **Page1·Page*·PDF 버튼 전부**에 전달 → 두 지점 모두 해소. (현행은 미입력 evaluationDate=undefined에서도 Page1이 크래시 → 정규화 try/catch fallback이 이 기존 취약점도 개선)
> **D-4**: 다건은 testid가 자산 수만큼 중복 → `getAllByTestId`로 개수 판정.
> **D-6 테스트 파일**: `BesshiForm` Date 정규화(RV-2·RV-6)는 기존 `__tests__/tax-engine/property-valuation/besshi-form-full-replica.test.tsx`에 추가. 결과뷰 섹션(RV-1·3·4·5)은 신규 `__tests__/components/unlisted-besshi-result-section.test.tsx`(RTL).

## 5. 동기화 지점 (출력 전용 — 14지점 중 ⑦만)

| 지점 | 해당 | 비고 |
|---|---|---|
| ①~⑥ 폼·initial·normalize·API변환·입력위젯·사이드바 | 변경 없음 | 입력 단계 무영향 |
| ⑦ 결과 카드 표시 | **추가** | 결과뷰 2곳에 별지 섹션 연결 |
| ⑧ validation | 변경 없음 | 입력 검증 무영향 |
| ⑨~⑭ Zod·route·엔진 input | 변경 없음 | 엔진 미호출(출력 재렌더) |

신규 prop 0(estateItems 이미 보유), 신규 enum 0, 신규 Zod 0.

## 6. 위험·완료 기준

| 위험 | 대응 |
|---|---|
| 미입력 자산 정규화 throw로 입력 단계 크래시 | F-8: try/catch fallback(원본) — 입력 단계 동작 불변 |
| string 복원 후 toISOString 에러(화면·PDF문서·파일명 3곳) | 정규화 input(`safe`)을 자식 전부 전달(§3.2) |
| 결과뷰 800줄 초과 | sibling 컴포넌트 분리(증가 ~2줄) |
| 인쇄 시 별지 외 요소 혼입 | 별지 자체 `@page A4`+`print:break-before-page` 보유, 결과뷰 print 스타일 충돌 점검 |
| 다건 PDF 파일명 중복 | 확인 완료: `_{corpName}_{YYYY-MM-DD}`, 법인 다르면 자동 구분 |

**UI 동작 의도 (D-3)**:
- **별지만 깔끔히 출력** = PDF 다운로드 버튼(react-pdf 독립 문서 생성, 결과뷰 요소 미포함). 사용자 1차 권장 경로.
- **브라우저 화면 인쇄(Ctrl+P)** = 결과뷰 전체 + 별지가 함께 인쇄됨(별지는 `print:break-before-page`로 페이지 분리). 부수 경로.
- BesshiForm `open` 기본 **false(접힘)** → 결과 화면에서 각 별지는 접힌 상태로 시작, 사용자가 펼쳐 미리보기. 다건도 각각 독립 접힘(공간 절약).

**완료 기준**:
- [ ] RV-1~6 통과(RV-2 Date string PDF 버튼 크래시 방어 실증 + RV-6 미완성 입력 회귀 방어)
- [ ] 상속세·증여세 결과 화면 별지 미리보기+PDF 동작
- [ ] V2 0건·간편평가만 → 섹션 미표시
- [ ] 미완성 입력 자산 → 입력 단계 크래시 없음(C-6 회귀 방어)
- [ ] `tsc --noEmit` 0건 / 전체 `npm test` 회귀 0
- [ ] 결과뷰 800줄 이하
- [ ] 브라우저 수동 확인(상속·증여 각각 계산→결과→별지 출력→인쇄 미리보기)

## 7. 구현 순서

1. RV-1~6 anchor 작성(Pre-Do) → RV-2 실패 확보(PDF 버튼 useMemo 크래시)
2. `BesshiForm` Date 정규화 try/catch(§3.2) → RV-2·RV-6 통과
3. `UnlistedStockBesshiResultSection` 신규(§3.1)
4. 결과뷰 2곳 연결(§3.3)
5. tsc + 전체 test + 브라우저 수동
