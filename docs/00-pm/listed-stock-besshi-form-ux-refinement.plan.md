# 상장주식 평가조서 입력 UI 개편 + 인-폼 미리보기·PDF 다운로드 계획서

> **목표**: 상장주식 자산 카드(이미지 10 기준)의 입력 UX 3건 개편 + 입력 폼 내 평가조서(갑·을) 즉시 미리보기 + PDF 다운로드 버튼 신설.
>
> **선행 작업**:
> - 본문 엔진·결과뷰 통합 완료 (`56cdf3e`).
> - 비상장주식 PDF 다운로드 패턴 (`components/calc/inheritance/unlisted-stock-v2/UnlistedStockBesshiPdfDownloadButton.tsx`) 그대로 차용.
> - 기존 ListedStockBesshiResultView (`components/calc/inheritance/listed-stock/ListedStockBesshiResultView.tsx`) 갑·을 토글 컴포넌트 재사용.

---

## 1. 변경 요구 (사용자 명시 3건)

### 1-1. 보유 주식수 위치 이동
- **현재**: `StockValuationForm.tsx:192-208` — ⑨ 평균가 입력(L173-190) 직하, **§63②3호 라디오 ON 펼침 영역 위**
- **변경**: 신규 **종목 정보 카드(sky)** 내부의 종목코드 입력 직하 (`FieldCard` 3번째 슬롯)
- **이유**: 입력 흐름상 "종목 식별(종목명·코드) + 보유 수량"이 한 묶음이라는 사용자 멘탈 모델
- **키움 자동조회 버튼과의 순서**: 종목 정보 카드(3필드 sky) → 그 직하 키움 자동조회 카드 → §63 그룹(평균가·할증·미상장 신주)
- **§63 그룹 내부 평균가 위치**: §63③ 할증 토글 직전 (현행 위치 유지) — ⑨ 평균가는 §63③·§63②3호 양쪽 산식의 변수이므로 §63 그룹 안에 두어야 의미 일관

### 1-2. "종목 정보 입력" 카드로 묶기 (sky 톤)
- **묶을 필드 3개**: 종목명 / 종목코드(선택) / 보유 주식 수(주) — **정확히 이 3개만**
- **묶지 않는 필드**:
  - **키움 자동조회 카드** (`KiwoomValuationAutoFetchButton`): 종목 정보 카드 **직하**에 별개 카드로 유지 (현행 시각 패턴 보존, 응답 카드 자체가 자기 완결적 sky 박스)
  - **⑨ 전후 2개월 종가 단순평균(원/주)**: §63 그룹 안에 별도 유지 — 이유: ⑨는 키움 자동조회 응답 echo + §63②3호 산식의 ⑨ 변수와 직결, §63③ ⑩ 산식의 변수와 직결. 종목 식별과 의미상 분리.
- **스타일**: `ListedStockBesshiAttributesSection`의 **"평가조서 갑지 정보 입력"** ToggleCard와 동일 시각 패턴
  - sky 톤 (`border-sky-200 bg-sky-50/40`)
  - 카드 헤더 "종목 정보 입력" + 내부 `FieldCard` 3개
- **토글 정책**: 필수 입력 필드이므로 **항상 펼침**. `<div>` 단순 카드(ToggleCard 미사용) 또는 `ToggleCard variant="card"`로 강제 ON+`disabled`. 후자 선호 — 시각 통일성.
- **§63②3호 라벨 동적 변경 유지**: 보유 주식 수 라벨은 기존대로 `isCapitalIncreaseUnlistedShare === true` 시 "증자 신주(미상장) 보유 수"로 변경. SecurityInfoSection 내부에서 `item.isCapitalIncreaseUnlistedShare` 참조.
- **기존 입력 동작 보존**:
  - 종목명: `onFocus={(e)=>e.target.select()}` (Provider 자동 적용)·placeholder "예: 삼성전자"
  - 종목코드: `maxLength=6`·`replace(/[^0-9A-Z]/g, '')`·`toUpperCase()` 그대로 유지
  - 보유 주식수: `parseInt(value.replace(/,/g, ''), 10)`·콤마 표시 그대로

### 1-3. §63③ 토글 아래 미리보기 + PDF 다운로드 버튼
- **위치**: `ListedStockBesshiAttributesSection.tsx`의 §63③ ToggleCard 하위 또는 본 입력 폼 최하단 (자산 카드 안)
- **구성요소 2개**:
  1. **인-폼 평가조서 미리보기** (collapsible · OFF 기본 / 사용자 토글로 ON)
     - 펼치면 `Page1CoverSection` + `Page2DailyClosingTable` 즉시 렌더
     - data source: `evaluateListedStock(item, { valuationDate })` 결과 echo (useMemo)
     - 입력 미충족(평균가·주식수 0) 시 미리보기 비활성 + 안내 문구
  2. **PDF 다운로드 버튼**
     - 비상장 `UnlistedStockBesshiPdfDownloadButton` 패턴 그대로
     - `react-pdf` `PDFDownloadLink` dynamic import (`ssr: false`)
     - `ListedStockBesshiPdfDocument` 사용
     - 비활성 조건: `listedStockAvgPrice ≤ 0 || listedStockShares ≤ 0 || !valuationDate`
- **이유**: 사용자가 결과 화면까지 진행하지 않아도 입력 시점에 평가조서 확인 + 즉시 PDF 출력 가능

---

## 2. 케이스 매트릭스 (UI 동작 분기)

| # | 시나리오 | 카드 상태 | 미리보기 | PDF 버튼 |
|---|---|---|---|---|
| UX-01 | 평균가·주식수 모두 입력 + 평가기준일 있음 | 종목정보 펼침 | 활성·렌더 | 활성 |
| UX-02 | 평균가 0 또는 주식수 0 | 종목정보 펼침 | 비활성 안내 | 비활성 |
| UX-03 | 평가기준일(deathDate/giftDate) 미입력 | 종목정보 펼침 | 비활성 안내 | 비활성 |
| UX-04 | §63②3호 ON | 보유 주식 수 라벨 = "증자 신주(미상장) 보유 수" | 미리보기 ⑪~⑰ 활성 | 활성 |
| UX-05 | §63③ 최대주주 + 대기업 ON | — | ⑩ = floor(⑨×1.2) 표시 | 동일 PDF에 반영 |
| UX-06 | listedStockDailyGroupsInput 캐시 비어있음 (자동조회 미실행) | — | 갑지만 표시·을지 빈 표 | 갑지만 |

---

## 3. 변경 파일 분해

### 3-1. UI 컴포넌트 신규
- `components/calc/inheritance/listed-stock/ListedStockSecurityInfoSection.tsx` (신규)
  - 종목명·종목코드·키움 자동조회·보유 주식 수 4 필드를 sky 카드로 묶은 컴포넌트
  - `StockValuationForm.tsx ListedStockEditor` 본체에서 인라인 코드(현재 종목명/종목코드/주식수 입력 영역) 추출 → 본 컴포넌트로 위임
  - `KiwoomValuationAutoFetchButton` 자체는 sky 카드 **내부** 또는 **직하**에 배치 (시각 일관성)
- `components/calc/inheritance/listed-stock/ListedStockBesshiPreviewCard.tsx` (신규)
  - props: `{ item: EstateItem; valuationDate?: string }`
  - 내부 흐름:
    1. `canPreview = (item.listedStockAvgPrice ?? 0) > 0 && (item.listedStockShares ?? 0) > 0 && !!valuationDate` 사전 가드
    2. canPreview=false → rose/slate 안내 카드 (`평균가/주식수/평가기준일 입력 필요`)
    3. canPreview=true → `useMemo(() => { try { return evaluateListedStock(item, { valuationDate }); } catch { return null; } }, [item, valuationDate])`
    4. result.besshiData가 있으면 `Page1CoverSection` + `Page2DailyClosingTable` 렌더 (결과뷰의 `ListedStockBesshiResultView` 재사용 안 함 — 평가액 카드·보유주식수 헤더 중복 회피)
  - **결과뷰 중복 방지 정책**: 본 PreviewCard는 갑·을 **표만** 표시. 결과뷰 `ListedStockBesshiResultView`는 평가액 요약 카드 + 갑·을. 한 자산이 입력 + 결과뷰 양쪽에 표시되어도 시각적으로 다른 컨텍스트(입력 카드 안 vs 결과 섹션)이므로 사용자 혼란 최소화. UX 검증은 e2e에서 확인.
  - collapsible 토글 (기본 OFF — 입력 폼이 길어지는 부담 완화)
  - `print:block` CSS-only ([[print-only-css-toggle]])
- `components/calc/inheritance/listed-stock/ListedStockBesshiPdfDownloadButton.tsx` (신규)
  - 비상장 `UnlistedStockBesshiPdfDownloadButton.tsx` 패턴 그대로
  - `PDFDownloadLink` dynamic import (ssr: false)
  - props: `{ item: EstateItem; valuationDate?: string }`
  - 내부 흐름:
    1. 비활성 조건 가드 (PreviewCard와 동일 — 평균가·주식수·valuationDate 모두 필요)
    2. `useMemo(() => { try { return evaluateListedStock(item, { valuationDate }); } catch { return null; } }, [item, valuationDate])`
    3. result 없거나 result.besshiData 없으면 비활성 버튼 표시
    4. result.besshiData 있으면 `<ListedStockBesshiPdfDocument besshi={result.besshiData} />` document로 PDFDownloadLink 렌더
  - 파일명 신규 헬퍼 — **`lib/pdf/ListedStockBesshiPdfDocument.tsx`에 export 추가**:
    ```ts
    export function generateListedStockBesshiPdfFilename(
      item: EstateItem,
      valuationDate?: Date | string,
    ): string {
      const id = item.companyName || item.listedStockCode || item.name || "상장주식";
      const ymd =
        valuationDate
          ? (valuationDate instanceof Date
              ? valuationDate.toISOString().slice(0, 10)
              : valuationDate
            ).replace(/-/g, "")
          : "no-date";
      return `상장주식평가조서_${id}_${ymd}.pdf`;
    }
    ```

### 3-2. PDF Document 헬퍼 신규
- `lib/pdf/ListedStockBesshiPdfDocument.tsx`
  - 신규 export: `generateListedStockBesshiPdfFilename(item, valuationDate)` 헬퍼 추가
  - 본문 Document 컴포넌트 무변경

### 3-3. 기존 파일 수정
- `components/calc/StockValuationForm.tsx`
  - **L101-130** (종목명 + 종목코드) + **L192-208** (보유 주식 수) 추출 → **`<ListedStockSecurityInfoSection item={item} onUpdate={...} />`** 호출 1줄로 대체
  - **L139-148 키움 자동조회 카드는 SecurityInfoSection 직하에 유지** (별도 호출 — 본 카드 안에 포함하지 않음. 자동조회 응답 시점에 onResponse가 sky 카드 외부에서도 동작 필요하므로 분리 유지)
  - **L173-190 평균가 입력 위치 유지** — §63 그룹의 첫 필드. ListedStockBesshiAttributesSection 직전.
  - `ListedStockBesshiAttributesSection` 호출(L168-171) 직후, §63③ 토글이 그 안에 있으므로 본 컴포넌트 마지막에:
    - `<ListedStockBesshiPreviewCard item={item} valuationDate={valuationDate} />`
    - `<ListedStockBesshiPdfDownloadButton item={item} valuationDate={valuationDate} />`
  - 800줄 정책: 본 작업으로 ListedStockEditor 줄 수 감소 예상 (현행 ~284줄 → ~240줄)
  - **부수효과 — 기존 E2E**: `e2e/inheritance-listed-capital-increase.spec.ts:36` 의 `page.locator('input[inputmode="numeric"]').nth(1).fill("100")` (보유 주식수 두 번째 numeric input 가정)이 sky 카드 내부로 이동하면서 selector 변경 필요. 본 작업에서 해당 spec도 함께 업데이트.

---

## 4. 14 동기화 지점 영향

| # | 지점 | 영향 |
|---|---|---|
| ① | FormData | 무변경 (필드 추가·삭제 없음) |
| ② | initial | 무변경 |
| ③ | normalize | 무변경 |
| ④ | API 변환 | 무변경 |
| ⑤ | UI 위젯 | **변경** — 입력 영역 재조직 + 미리보기·PDF 신규 컴포넌트 3개 |
| ⑥ | 사이드바 | 무변경 |
| ⑦ | 결과 카드 | 무변경 (결과뷰 부착은 그대로 유지 — 입력 폼 미리보기는 추가 채널) |
| ⑧ | validation | 무변경 |
| ⑨~⑭ | Zod·API·Route | 무변경 |

**Definition of Done 영향 0건** — UI 재배치 + 신규 in-form 미리보기 채널만. 엔진·타입·계산 무변경.

---

## 5. 검증 / anchor

### 5-1. 신규 anchor
- `__tests__/components/calc/inheritance/listed-stock/ListedStockBesshiPreviewCard.test.tsx`
  - UX-01: 입력 충족 → 갑·을 렌더, `ls-besshi-p1-section`·`ls-besshi-p2-section` testid 표시
  - UX-02: 평균가 0 → 비활성 안내 표시
  - UX-03: valuationDate 미입력 → 비활성 안내
- `__tests__/components/calc/inheritance/listed-stock/ListedStockSecurityInfoSection.test.tsx`
  - 종목명·종목코드·보유 주식 수 입력 시 onUpdate patch 정상 발행
  - §63②3호 ON 시 보유 주식 수 라벨 동적 변경
- E2E `e2e/listed-stock-besshi.spec.ts` 시나리오 추가
  - LS-E2E-2: 입력 폼에서 미리보기 토글 펼침 → `ls-besshi-p1-section` visible
  - LS-E2E-3: PDF 다운로드 버튼 활성/비활성 전환

### 5-2. 회귀 가드
- 기존 결과뷰 부착 (`ListedStockBesshiResultSection`) 동작 무변경 — 본 작업은 입력 폼 채널 추가만
- 기존 `ListedStockBesshiAttributesSection` 토글·필드 무변경
- 키움 자동조회 channel-fill 흐름 무변경 (응답 onResponse에서 store 갱신 → SecurityInfoSection이 자동 리렌더)
- **기존 E2E spec 업데이트 필요 목록**:
  - `e2e/inheritance-listed-capital-increase.spec.ts` `fillBase` 함수 — 보유 주식수 selector 재배치
  - `e2e/inheritance-listed-stock-section22-toggle.spec.ts` — 동일 패턴이면 함께 수정
  - **검증 방식**: Phase 1 완료 후 `npx playwright test e2e/inheritance-listed*` 즉시 실행 → 깨진 selector 수정 → 재실행
- **§63②3호 보유 주식수 라벨 동적 변경 회귀**: `isCapitalIncreaseUnlistedShare=true`일 때 라벨이 "증자 신주(미상장) 보유 수"로 변경되는지 SecurityInfoSection 내부에서 anchor 검증

---

## 6. 단계 분할 (3 커밋)

| Phase | 내용 | 회귀 |
|---|---|---|
| Phase 1 | `ListedStockSecurityInfoSection` 신규 + `StockValuationForm` 통합 (이미지 10 레이아웃) | 0 |
| Phase 2 | `ListedStockBesshiPreviewCard` 신규 + §63③ 아래 부착 | 0 |
| Phase 3 | `ListedStockBesshiPdfDocument`에 filename 헬퍼 + `ListedStockBesshiPdfDownloadButton` 신규 + 부착 | 0 |

각 Phase 마다:
- `npx tsc --noEmit` 0건
- `npm test` 회귀 0
- 신규 anchor PASS

---

## 7. 후속 / 미포함

- **결과뷰의 PDF 다운로드 버튼**: 본 계획은 입력 폼 내 PDF 다운로드만. 결과뷰 (`ListedStockBesshiResultView`)에도 동일 PDF 버튼 부착은 별도 후속 PR 고려
- **인쇄 자동 펼침** ([[print-only-css-toggle]]): 미리보기 카드 collapsible의 `print:block`도 동일 정책 적용 — 인쇄 시 펼침 강제
- **800줄 정책**: `ListedStockEditor` 본체가 감소하므로 별도 분할 불필요

---

## 8. 정책 cross-link

- 시각 패턴: `ListedStockBesshiAttributesSection` 갑지 정보 입력 카드 (sky 톤) 차용
- PDF 다운로드: 비상장 `UnlistedStockBesshiPdfDownloadButton` 패턴 차용
- [[ui_engine_dual_truth_avoidance]]: 미리보기는 `evaluateListedStock` echo만 사용, UI 재계산 금지
- [[echo-field-pattern]]: result.besshiData를 PDF/preview 양쪽이 단일 source로 사용
- [[mirror-pattern]]: 자동조회 channel-fill 흐름 무변경
- [[feedback_browser_verify_with_playwright]]: E2E spec으로 검증
