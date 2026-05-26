# 비상장주식 별지 부표3 — 계산 결과 화면 출력 연결 작업계획서

> 작성일: 2026-05-26
> 선행: `inheritance-unlisted-stock-besshi-2025-revision.plan.md` (별지 양식 완성, commit `bcfe80d`)
> 적용 스킬: `pre-do-anchor-verification` · `besshi-form-replica` · `print-only-css-toggle`

## 0. 목표

별지 제4호 부표3 출력(`BesshiForm4Buppyo3PrintView` — 화면 미리보기 + PDF 다운로드)을 **입력 단계(`UnlistedStockV2Card`)뿐 아니라 계산 결과 화면에서도** 그대로 띄우고 인쇄·PDF 출력할 수 있게 연결한다.

**범위 (F-4 정정)**: 별지 부표3은 상속·증여 공통 평가 서식이고, 비상장주식 V2 평가는 **상속·증여 양쪽**에서 발생(`unlisted-stock-valuation-lookup.ts`: "estateItems / giftItems 양쪽" 추출). 두 결과뷰(`InheritanceTaxResultView`·`GiftTaxResultView`) 모두 이미 `estateItems` prop을 보유하므로, **estateItems만 받는 순수 섹션 컴포넌트**를 만들어 양쪽에 동일하게 1줄로 연결한다.

## 1. 현황 (2026-05-26 검증)

| 위치 | 별지 출력 | 비고 |
|---|---|---|
| 입력 (`StockValuationForm`→`UnlistedStockV2Card`) | ✅ 토글 미리보기 + PDF | `BesshiForm4Buppyo3PrintView` 렌더 |
| 상속세 결과 (`InheritanceTaxResultView`) | ❌ 미연결 | `valuationResults` "재산 평가 내역 N건" 요약만. `estateItems?` prop 보유(L359) |
| 증여세 결과 (`GiftTaxResultView`) | ❌ 미연결 | `estateItems?` prop 보유(L128) — 동일 섹션 재사용 |

## 2. 데이터 경로 (검증 완료)

```
InheritanceTaxForm.tsx:350
  estateItems={[...form.estateItems, ...form.stockItems]}  // zustand store 원본(Date 유지)
        │
        ▼
InheritanceTaxResultView (estateItems?: EstateItem[] 이미 prop 보유)
        │  filter(i => i.unlistedStockValuationV2)
        ▼
BesshiForm4Buppyo3PrintView input={item.unlistedStockValuationV2}
        │  내부 evaluateUnlistedStockV2(input) 재호출 → 5쪽 렌더
        ▼
[화면 토글 미리보기 + UnlistedStockBesshiPdfDownloadButton]
```

- `form.stockItems: EstateItem[]`, `EstateItem.unlistedStockValuationV2?: UnlistedStockValuationInput` (타입 확인됨)
- 결과뷰 estateItems = **store 원본**(API 직렬화본 아님) → 입력 단계와 동일 데이터
- **R-6 전제 확인됨**: 상속세 폼 L350 `estateItems={[...estateItems, ...stockItems]}`, 증여세 폼(`GiftTaxForm.tsx`) L704 `estateItems={[...giftItems, ...stockItems]}` → 양쪽 모두 정식평가 V2 자산(stockItems)이 결과뷰 `estateItems`로 전달됨.
- **삽입점**: 상속세 결과뷰 L643 `{/* 재산 평가 내역 */}`(L650 "재산 평가 내역 N건") 섹션 다음. 증여세도 동일 평가 요약 다음.
- ⚠️ **Date 리스크 (F-2 정정 — toISOString 3곳)**: `input.evaluationDate.toISOString()`를 호출하는 곳은 화면 렌더뿐 아니라:
  1. `BesshiForm4Buppyo3PrintView` 내부 `evaluateUnlistedStockV2(input)` (Date 비교)
  2. `lib/pdf/UnlistedStockBesshiPdfDocument.tsx:219` (PDF 평가기준일 표시)
  3. `lib/pdf/UnlistedStockBesshiPdfDocument.tsx:641` `generateBesshiPdfFilename` (파일명 날짜)

  sessionStorage 복원(새로고침 후 결과) 시 `evaluationDate`가 string화될 수 있음 → **정규화는 BesshiForm 진입 직후 1회 수행하고, 그 정규화된 input을 자식(화면·PDF 버튼·PDF 문서) 전부에 전달**해야 3경로 모두 커버됨. 외부 헬퍼 방식(연결부 정규화)은 PDF 버튼에 전달되는 input까지 별도 정규화 책임이 생겨 누락 위험 → **BesshiForm 내부 단일 정규화 확정**(§5.2).

## 3. 케이스 인벤토리

| ID | 작업 | 분류 | 우선 |
|---|---|---|---|
| R-1 | 신규 `UnlistedStockBesshiResultSection.tsx` — `estateItems.filter(unlistedStockValuationV2)` map 렌더, 상속세 결과뷰에 연결 | 신규 UI | ★★★ |
| R-2 | 다수 비상장주식 estateItem → 법인명 구분 헤더 + 각 별지 | 다건 | ★★ |
| R-3 | **Date 보장 — `BesshiForm` 내부 단일 정규화**(§5.2 확정). `evaluationDate·businessStartDate·fiscalYears[].fiscalYearEndDate·capitalChanges[].changeDate`를 `toDate`로 정규화 후 화면·PDF 버튼·PDF 문서 자식 전부에 정규화 input 전달 | 직렬화 방어 | ★★★ |
| R-4 | 결과뷰 800줄(현 745줄) 초과 방지 — 별지 섹션을 `UnlistedStockBesshiResultSection.tsx` sibling 분리 | 파일정책 | ★★ |
| R-5 | 비상장주식 없을 때 섹션 미표시(조건부) | 가드 | ★ |
| R-6 | **동일 `UnlistedStockBesshiResultSection`을 `GiftTaxResultView`에도 1줄 연결**(estateItems 재사용) | 범위(F-4) | ★★ |
| R-7 | **간편평가 자산(`unlistedStockData`)은 별지 미대상** — filter가 `unlistedStockValuationV2`만 잡아 자동 제외(별지=정식평가 V2 전용). 명시·anchor | 가드(F-5) | ★ |

## 4. Pre-Do anchor (R-3 우선)

| anchor | 내용 | 기대 | 용도 |
|---|---|---|---|
| **RV-1** | 결과 섹션에 unlistedStockValuationV2 estateItem 1건 → 별지 렌더 testid 존재 | 별지 렌더됨 | R-1 |
| **RV-2** | evaluationDate가 **string**("2024-01-20")인 estateItem → 렌더 시 에러 없이 표시 | toISOString 에러 없음 | R-3 (실패 확보 후 정규화) |
| **RV-3** | 비상장주식 없는 estateItems → 별지 섹션 미표시(null) | 섹션 부재 | R-5 |
| **RV-4** | 비상장주식 2건 → 별지 2개 + 법인명 헤더 | 다건 | R-2 |
| **RV-5** | 간편평가 자산(`unlistedStockData`만, V2 없음) → 별지 미표시 | 섹션 부재 | R-7(F-5) |
| **RV-6** | 미완성 입력(주식수 0 + evaluationDate undefined/string)으로 `BesshiForm` RTL 렌더 → 크래시 없이 안내, PDF 버튼 disabled | 크래시 없음 | R-3·F-8 회귀 방어 |

> ⚠️ RV-2가 핵심: 현재 `BesshiForm`은 `Date` 가정. string 복원 케이스에서 깨지는지 먼저 실증(Pre-Do 실패 확보)한 뒤 R-3 정규화 적용. **현행 크래시 1차 지점 = `Page1CoverSection.tsx:64`**(항상 렌더, `input.evaluationDate.toISOString()`) — Pre-Do 실측. PDF 버튼 useMemo(`generateBesshiPdfFilename`)도 2차 지점. `evaluate`는 try/catch 보호. 정규화(`safe`)를 Page1·PDF 버튼·문서 전부에 전달하면 모든 경로 안전(F-2). 현행은 미입력 evaluationDate=undefined에서도 Page1 크래시 → 정규화 fallback이 기존 취약점도 개선. 검증 방식 상세는 디자인 §4 RV-2 노트.

## 5. 구현 명세

### 5.1 신규 `UnlistedStockBesshiResultSection.tsx` (R-1·R-2·R-4·R-5·R-7)
```tsx
export function UnlistedStockBesshiResultSection({ estateItems }: { estateItems: EstateItem[] }) {
  // R-7/F-5: V2(정식평가) 자산만 별지 대상. 간편평가(unlistedStockData)는 자동 제외.
  const unlistedItems = estateItems.filter((it) => it.unlistedStockValuationV2);
  if (unlistedItems.length === 0) return null;  // R-5
  return (
    <section className="border border-border rounded-xl overflow-hidden">
      <h4 className="px-4 py-3 bg-muted/30 text-sm font-medium">
        비상장주식 평가서 (별지 제4호 부표3) — {unlistedItems.length}건
      </h4>
      {unlistedItems.map((it, i) => (
        <div key={i} className="p-3">
          {unlistedItems.length > 1 && (
            <p className="text-xs font-semibold mb-1">
              {it.unlistedStockValuationV2!.corpName || `법인 ${i + 1}`}
            </p>
          )}
          {/* Date 정규화는 BesshiForm 내부에서 단일 수행(§5.2) — 연결부는 input 그대로 전달 */}
          <BesshiForm4Buppyo3PrintView input={it.unlistedStockValuationV2!} />
        </div>
      ))}
    </section>
  );
}
```
> **F-7 가드 정합**: `BesshiForm`은 `totalShares>0 && ownedShares>0` 미충족 시 result 없이 안내만, PDF 버튼은 `corpName.trim()` 추가 필요 시 disabled. filter는 V2 존재만 보므로 미완성 입력도 빈 별지가 렌더될 수 있으나, 이는 입력 단계와 **동일 동작**(기존 컴포넌트 가드 그대로 계승)이므로 신규 가드 추가 없음.

### 5.2 Date 정규화 — `BesshiForm4Buppyo3PrintView` 내부 단일 수행 (R-3 확정, F-1·F-2·F-3)

**결정**: 정규화 위치는 **`BesshiForm` 진입 직후 1회**로 확정한다. 이유:
- F-2: `toISOString()` 호출 경로가 3곳(화면 `evaluate`·PDF 문서·PDF 파일명)이므로, 정규화한 input을 **자식 전부**(화면·`UnlistedStockBesshiPdfDownloadButton`·`UnlistedStockBesshiPdfDocument`)에 전달해야 완전. 외부 헬퍼(연결부) 방식은 PDF 버튼 전달 input의 정규화 책임이 분산되어 누락 위험.
- 입력 단계는 이미 Date 객체라 정규화가 **무해**(idempotent — `toDate(Date)`는 그대로 반환).

**F-8 (재검토 정정 — 미입력 회귀 차단)**: `toDate`는 `undefined`(미입력 날짜)에서 **throw**(date-coerce.ts:51). BesshiForm은 입력 단계에서도 쓰이고 현재 미완성 입력(주식수 0·날짜 공란)에서 `evaluate`만 try/catch+가드로 보호된다. 정규화를 진입 직후 무조건 호출하면 미입력 시 try/catch 밖에서 throw → **입력 단계 크래시(회귀)**. 따라서 정규화도 **try/catch로 감싸 실패 시 원본 fallback**:

```ts
// BesshiForm4Buppyo3PrintView 내부 (진입 직후)
let safe = input;
try {
  safe = normalizeBesshiInput(input);  // 완성 입력만 성공 → 화면·PDF 모두 Date 안전
} catch {
  safe = input;  // 미입력(날짜 공란 등) → 원본. 어차피 totalShares 가드/PDF 버튼 disabled가 막음
}
// 이후 evaluate(safe)·Page*(safe)·PDF 버튼 input={safe} 전부 safe 사용

function normalizeBesshiInput(input: UnlistedStockValuationInput): UnlistedStockValuationInput {
  return {
    ...input,
    evaluationDate: toDate(input.evaluationDate, "evaluationDate"),
    businessStartDate: toDate(input.businessStartDate, "businessStartDate"),
    // F-3: fiscalYears는 3-튜플 [FY,FY,FY] → map 결과(FY[])를 튜플로 명시 캐스팅
    fiscalYears: input.fiscalYears.map((fy) => ({
      ...fy,
      fiscalYearEndDate: toDate(fy.fiscalYearEndDate, "fiscalYearEndDate"),
    })) as UnlistedStockValuationInput["fiscalYears"],
    capitalChanges: input.capitalChanges.map((c) => ({
      ...c,
      changeDate: toDate(c.changeDate, "changeDate"),
    })),
  };
}
```
> `lib/api/date-coerce.ts`의 `toDate` 재사용 (`new Date(x)` 직접 호출 금지 — CLAUDE.md).
> F-3: `as UnlistedStockValuationInput["fiscalYears"]`로 3-튜플 타입 보존(`.map()` 반환 `FY[]` ≠ 튜플).
> 자식 전달: line 83 `<UnlistedStockBesshiPdfDownloadButton input={safe} />`, line 57~ `evaluate`/`Page*`도 모두 `safe` 사용.

### 5.3 결과뷰 연결 (R-1·R-6)
`InheritanceTaxResultView` 재산 평가 내역 섹션 다음에:
```tsx
{estateItems && <UnlistedStockBesshiResultSection estateItems={estateItems} />}
```
`GiftTaxResultView`에도 동일 1줄(R-6) — `estateItems` 이미 prop 보유.

## 6. 동기화 지점

- 두 결과뷰 모두 `estateItems` prop **이미 보유** → 신규 prop 0. 각 import + 렌더 1줄.
- 엔진·타입·API·validate **변경 없음** (출력 전용 연결).
- PDF 다운로드 버튼은 `BesshiForm` 내장 → 자동 포함. **정규화 input(`safe`)을 PDF 버튼에 전달**(F-2)해야 PDF 경로 Date 안전.

## 7. 위험·완료 기준

| 위험 | 대응 |
|---|---|
| sessionStorage 복원 후 Date→string → toISOString 에러 (화면·PDF문서·파일명 3곳) | RV-2 실패 확보 → R-3 정규화 (toDate). **BesshiForm 내부 단일 정규화 후 자식 전부에 정규화 input 전달**(§5.2 확정, F-2) |
| 결과뷰 745줄 → 800줄 초과 | 별지 섹션 sibling 분리(R-4) |
| 결과 화면 인쇄 시 별지 외 요소 혼입 | 별지는 자체 `@page A4` + `print:break-before-page` 보유. 결과뷰 print 스타일과 충돌 점검 |
| 다건 비상장주식 PDF 파일명 중복 | **확인 완료(F-6)**: `generateBesshiPdfFilename` = `비상장주식평가서_{corpName}_{YYYY-MM-DD}.pdf`. 법인명 다르면 자동 구분. 잔여 위험=동일 법인명+동일 평가기준일(희소) |
| 미완성 입력(주식수 0·법인명 공란) 자산이 빈 별지 렌더 | F-7: 입력 단계와 동일 동작(BesshiForm·PDF 버튼 기존 가드 계승). 신규 가드 없음 |

**완료 기준**:
- [ ] RV-1~6 anchor 통과 (RV-2 PDF 버튼 크래시 방어 실증 + RV-6 미완성 입력 회귀 방어)
- [ ] 상속세·증여세 결과 화면에서 별지 미리보기 토글 + PDF 다운로드 동작(R-1·R-6)
- [ ] 비상장주식 0건·간편평가만 있을 때 섹션 미표시(R-5·R-7)
- [ ] `tsc --noEmit` 0건 / 전체 `npm test` 회귀 0
- [ ] 결과뷰 800줄 이하 (섹션 분리)
- [ ] 브라우저 수동 확인 (계산→결과→별지 출력→인쇄 미리보기)
