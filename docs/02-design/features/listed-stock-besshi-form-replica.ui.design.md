# 상장주식 평가조서(갑·을) — UI 디자인

> Plan: `docs/00-pm/listed-stock-besshi-form-replica.plan.md`
> Engine Design: `listed-stock-besshi-form-replica.engine.design.md`
> 선행 패턴: `inheritance-unlisted-stock-besshi-2025-revision.engine.design.md` + memory `project_unlisted_stock_besshi_2025_revision` + memory `project_besshi_result_view_integration`
> DoD: CLAUDE.md 14 동기화 지점 (UI 8지점 ①~⑧)

---

## 0. UI 원칙

- **단일 source** ([[ui_engine_dual_truth_avoidance]]): 결과 카드 표시값(⑨⑩⑫⑭⑮⑯⑰⑱)은 모두 `result.besshiData` echo 직접 참조. UI 재계산 금지.
- **store mirror 금지** ([[mirror-pattern]]): 자동조회 결과 channel-fill만, useEffect store 미러링 금지.
- **3중 mirror 강제**: UI display fallback (value={x||기본값}) 있는 필드는 API 변환·validate 모두 동일 fallback. 토글/라디오 default 일치.
- **CSS-only print toggle** ([[print-only-css-toggle]]): 펼침 토글 + 인쇄 시 자동 펼침.
- **컴포넌트 분리 정책**: 800줄 가드. besshi/ 4 파일 + listed-stock/ ResultView 분리.

---

## 1. 입력 폼 — `ListedStockEditor` 확장 (`components/calc/StockValuationForm.tsx`)

### 1-1. 현재 구조 (file:line)
- `StockValuationForm.tsx:39-58` `ListedStockEditorProps`
- `StockValuationForm.tsx:117-135` 종목코드 입력 + `KiwoomValuationAutoFetchButton`

### 1-2. 확장 영역 (3-state collapsible — [[three-state-optional-mode-toggle]])

```
ListedStockEditor (sky-50 카드 — 기존)
├── ① 종목코드·종목명·평균가·주식수 (기존, 무변경)
│
├── 📋 평가조서 갑지 정보 입력 (collapsible)
│    ToggleCard tone=sky
│    OFF: 갑지 ②③⑤⑥⑦⑧ 빈칸 표시 (필요시 표시만)
│    ON: 아래 6필드 렌더
│    ├── 법인명 (CompanyNameInput) — 키움 자동조회 시 stockName 자동 채움
│    ├── 대표자 (TextInput)
│    ├── 법인 소재지 (TextInput)
│    ├── 평가대상 주식 종류 (RadioCardGroup: 보통주/우선주)
│    ├── 상장일자 (DateInput) — ka10001.listingDate 존재 시 자동
│    └── 평가기준일 (read-only 표시 — deathDate/giftDate prop)
│
├── 🏷️ §63③ 최대주주 할증 (collapsible — emerald)
│    ToggleCard tone=emerald
│    OFF: premiumRate=0 (기본)
│    ON: 아래 3필드
│    ├── 최대주주 여부 (ToggleCard isMaxShareholder)
│    ├── 기업 규모 (RadioCardGroup: 중소/중견/대기업) — small/medium 시 자동 premium=0
│    └── 배제 사유 (Select — 9사유 + smb_med) — 선택 시 premium=0 강제
│    →  실시간 echo: 적용 할증률 배지 (rose '20%' / slate '0%' + 사유)
│
├── 📑 §63②3호 미상장 신주 (collapsible — violet)
│    RadioCardGroup: 해당없음 / 증자 신주 / 합병 신주
│    ON 일 때 (capitalIncreaseDate 또는 mergerDate 입력 시):
│    ├── 증자일자 또는 합병일자 (DateInput)
│    ├── 1주당 액면가 (CurrencyInput) — 자동 fallback 금지·필수
│    ├── 직전기 배당률 (DecimalInput step=0.0001 — % 입력, store decimal 변환)
│    ├── 배당기산일 (DateInput)
│    └── 배당기산일 = 상장일자 토글 (dividendBaseDateSameAsListed — 기존 필드 재사용)
│    → 실시간 echo: ⑫⑭⑮⑯⑰ 미리보기 카드 (engine result에서 한 번만 계산)
│
└── ⏱️ 키움 자동조회 버튼 (기존, 확장)
     KiwoomValuationAutoFetchButton
     → 응답 시 splitTwoMonthSurroundingByMonthGroup 호출
     → store.updateEstateItem({ ..., listedStockDailyGroupsInput, listedStockAvgPrice, companyName })
     → §52의2② 자동: capitalIncreaseDate || mergerDate ∈ [D-2월, D] 일 때 startOverrideDate 자동 전달
```

### 1-3. 컴포넌트 단위 책임
- **`ListedStockBesshiAttributesSection.tsx`** (신규, ≤200줄) — 갑지 ②③⑤⑥⑦⑧ + §63③ + §63②3호 collapsible 묶음.
- **`ListedStockBesshiSidebar.tsx`** (신규) — input form 변경 시 실시간 ⑫⑭⑮⑯⑰⑱ 미리보기 (engine 호출).
- 기존 `ListedStockEditor` 본체는 종목코드·평균가·주식수만 유지. 신규 섹션을 자식으로 호출.

### 1-4. validation 분기 ([[feedback_no_silent_apportion_fallback]])

| 조건 | 차단 메시지 |
|---|---|
| `capitalIncreaseDate \|\| mergerDate` 입력 + `faceValuePerShare` 비어있음 | "§63②3호 분기 시 1주당 액면가 필수" |
| 위와 같이 + `priorDividendRate` 비어있음 | "§63②3호 분기 시 직전기 배당률 필수" |
| 위와 같이 + `dividendBaseDate` 비어있음 (and `!dividendBaseDateSameAsListed`) | "배당기산일 또는 '상장일자 동일' 토글 필수" |
| `isMaxShareholder=true` + `companySize` 미입력 | "기업 규모 입력 필수" |
| `valuationDate`(deathDate/giftDate) 비어있음 + listed_stock 자산 존재 | "평가기준일(상속개시일/증여일) 먼저 입력" |
| 키움 응답 미수신 + 평균가 0 | "종목코드·평가기준일 입력 후 자동조회 또는 평균가 수동 입력" |

---

## 2. 결과 화면 — `ListedStockBesshiResultView` (신규)

### 2-1. 컴포넌트 트리

```
ListedStockBesshiResultView (per estateItem with category === "listed_stock")
├── 상단 요약 카드 (sky-50)
│    ├── 종목코드·종목명·주식수
│    ├── ⑨ 종가평균 (큰 숫자 + "원/주") ← besshiData.page1Values.closingAvg
│    └── 평가액 = ⑨ 또는 ⑩ × 주식수 (rose-700 강조) ← result.valuatedAmount
│
├── 펼침 토글 ▼ 상장주식 평가조서(갑) (open default, print:block 강제)
│    └── Page1CoverSection
│         ├── 표 제목: "상 장 주 식 평 가 조 서 (갑)" (이미지 4 폰트 크기 정합)
│         ├── 섹션 1.평가대상 상장법인 (4행 × 4열 grid)
│         │    [①법인명│value][②대표자│value]
│         │    [③법인소재지│value][④평가기준일│value]
│         │    [⑤주식종류│보통주|우선주][⑥상장일자│value]
│         │    [⑦증자일자│- or value][⑧합병일자│- or value]
│         ├── 섹션 2.1주당 가액 평가 (2행 × 2열)
│         │    [⑨ 평가기준일 전후 2개월 종가평균 (⑱)│closingAvg]
│         │    [⑩ 최대주주 1주당 평가액: ⑨ × 할증률│perShareMajorShareholder]
│         └── 섹션 3.미상장주식의 1주당가액 평가 (조건부 — isUnlistedShareSection)
│              [⑪직전기 배당률│%][⑫직전기 배당액 (1주당액면가×⑪)│][⑬배당기산일 (주금납입다음날)│]
│              [⑭배당기산일 전일까지의 일수 (/365)│][⑮배당차액 (⑫×⑭)│][⑯1주당 가액 (⑨−⑮)│value]
│              [⑰최대주주 1주당평가액: ⑯×할증률│value]
│         └── 푸터: "YYYY년 MM월 일 · 성명: (서명 또는 인)"
│
├── 펼침 토글 ▼ 상장주식 평가조서(을) (open default, print:block 강제)
│    └── Page2DailyClosingTable
│         ├── 헤더: "상장주식 평가조서(을)"
│         ├── 컬럼 그룹 헤더: [평가기준일 이전 2월│평가기준일 이후 2월]
│         ├── 표 본체:
│         │    좌측 (5열): [NO│월일│종가│월일│종가]  (beforeM1·beforeM2 합쳐 31행)
│         │    우측 (5열): [NO│월일│종가│월일│종가]  (afterM1·afterM2 합쳐 31행)
│         │    종가 셀 라벨: 숫자 || "일요일" || "토요일" || "휴무일" || "기간외" || "-"
│         ├── 소계 행: 좌측 [소계│beforeSubtotal] · 우측 [소계│afterSubtotal]
│         ├── 일수 행: [일수│tradingDays] (좌·우 셀 병합)
│         ├── 종가합계 행: [종가합계(원)│closingSum]
│         └── 종가평균 행: [종가평균(원)│closingAverage]
│
└── 출력 액션 (print:hidden)
     ├── 📥 PDF 다운로드 (ListedStockBesshiPdfDocument)
     └── 🖨️ 인쇄 (window.print — 자동 펼침 CSS-only)
```

### 2-2. 결과 카드 산식 표기 ([[formula-display-builder]])

```
⑩ 최대주주 1주당 평가액
   = ⑨ × (1 + 할증률)
   = 8,452 × (1 + 20%)
   = 10,142
   ▶ 할증률 배제 사유: 중소·중견기업 (§53④)
```
- 변수 배지(⑨⑩⑮⑯⑰) — circle-number 파란색
- 산식 텍스트 — `font-mono text-xs`
- 분기 안내 — amber(특례 적용) / rose(미적용 강조) / slate(기본)
- fine-print 법령 인용 — `text-[10px] text-slate-500` (예: `§63①1가목 · 시행령 §52의2`)

### 2-3. testid 동결 (Pre-Do 확정 후 변경 금지)

```
ls-result-view-{itemId}
ls-besshi-p1-section
ls-besshi-p1-①  ls-besshi-p1-②  ... ls-besshi-p1-⑱
ls-besshi-p2-section
ls-besshi-p2-before-m1-row-{1..31}-no
ls-besshi-p2-before-m1-row-{1..31}-date
ls-besshi-p2-before-m1-row-{1..31}-closing
ls-besshi-p2-before-m2-row-{1..31}-{no|date|closing}
ls-besshi-p2-after-m1-row-{1..31}-{no|date|closing}
ls-besshi-p2-after-m2-row-{1..31}-{no|date|closing}
ls-besshi-p2-subtotal-before
ls-besshi-p2-subtotal-after
ls-besshi-p2-tradingDays
ls-besshi-p2-sum
ls-besshi-p2-avg
ls-besshi-p1-pdf-button
ls-besshi-p1-print-button
```

---

## 3. PDF — `lib/pdf/ListedStockBesshiPdfDocument.tsx`

### 3-1. 페이지 구성
- **Page 1 (갑지)**: A4 세로. 헤더 "상 장 주 식 평 가 조 서 (갑)" + 1.평가대상(8필드 표) + 2.1주당가액(⑨⑩) + 3.미상장(⑪~⑰) + 푸터 (날짜·서명)
- **Page 2 (을지)**: A4 세로. 헤더 "상장주식 평가조서(을)" + 컬럼 그룹 헤더(이전2월/이후2월) + 좌5×31 + 우5×31 + 소계·일수·합계·평균 4행

### 3-2. 정책 (별지부표3 후속 사례 동일)
- 화면·PDF 공유 상수: `listed-besshi-constants.ts` (LS_P1_LABELS·LS_P2_HEADERS)
- 폰트 fallback (react-pdf 4.x): `fontFamily: ["NanumGothic", "IBM Plex Sans KR"]` per-glyph (한자·특수기호 깨짐 차단)
- `besshi-pdf-styles.ts` 의 스타일 재사용 + LS 전용 P2 그리드만 추가 (≤ 100줄 증가)
- 본 PDF 신규 파일 ≤ 600줄 (별지부표3 PDF 675줄 한계 근접 → 별도 파일)

### 3-3. 화면↔PDF parity anchor

```
__tests__/lib/pdf/listed-stock-besshi-parity.test.tsx
  - 화면 testid `ls-besshi-p1-①` 의 textContent === PDF Page1 의 동일 좌표 텍스트
  - 화면 ls-besshi-p2-subtotal-before === PDF Page2 좌측 소계
  - 화면 ls-besshi-p2-avg === PDF Page2 종가평균
  - 화면·PDF 모두 LS_P1_LABELS 동일 출처 (dual-truth 차단)
```

---

## 4. 자동조회 UX (확장)

### 4-1. 자동조회 결과 카드 표준 패턴 (CLAUDE.md kiwoom 검증 UX)

```
KiwoomFetchSourceBadge: 🔍 키움 자동조회 2026-05-28 15:32 KST
산식: 좌소계 350,490 + 우소계 359,540 = 710,030 ÷ 84거래일 = 8,452원
▼ 일자별 종가 상세 보기 (검증용) ← 클릭 시 Page2DailyClosingTable 모달
```

### 4-2. 거래정지·관리종목 안내 (자동 fallback 금지)
- API 409 응답 `trading_halted` 수신 시 inline alert:
  ```
  🚫 거래정지 종목 — 상증령 §52의2③에 따라 본 평가 미적용.
     수동 입력 또는 별도 평가 (§63①1나목 비상장 보충적 평가) 필요.
  ```
- 자동 다른 산식 전환 0건.

### 4-3. §52의2② 자동 분기
- `capitalIncreaseDate || mergerDate` 가 `[D-2월, D]` 이내일 때:
  ```
  💡 §63②3호·시행령 §52의2② 분기 — 평가구간이 [신주발행일, 평가기준일+2월]로 단축됩니다.
     자동조회가 단축구간으로 재실행됩니다.
  ```

---

## 5. 사이드바 합계 — `lib/stores/inheritance-summary.ts`·`gift-summary.ts`

- 합산은 기존 그대로 (`estateItem.valuation.valuatedAmount` 합산).
- `evaluateListedStock` 산식 변경(§63③ 적용)으로 LS-02·LS-04 케이스의 합계 변화 — 사이드바 자동 반영.
- 별도 UI 변경 없음. [[tax-summary-sidebar-pattern]] 정책 준수.

---

## 6. 14 동기화 지점 — UI 8지점 (①~⑧)

| # | 파일 | 작업 |
|---|---|---|
| ① | `lib/stores/calc-wizard-store.ts` `EstateItem` partialize | 13 입력 + 1 캐시 추가 |
| ② | `lib/stores/calc-wizard-initial.ts` factory | 기본 undefined (단, stockClass="common"·companySize="small") |
| ③ | `lib/stores/calc-wizard-normalize.ts` | Date/decimal 변환 |
| ④ | `lib/calc/inheritance-gift-api.ts`·`gift-tax-api.ts` | EstateItem spread → 신규 필드 자동 전달 (grep `...item` 유지) |
| ⑤ | `components/calc/StockValuationForm.tsx ListedStockEditor` + 결과 뷰 통합 | 본 문서 §1·§2 |
| ⑥ | `lib/stores/inheritance-summary.ts`·`gift-summary.ts` | §5 |
| ⑦ | 결과 카드 — `ListedStockBesshiResultView` 부착 | `EstateItem.category === "listed_stock"` 분기 |
| ⑧ | `lib/calc/inheritance-validate.ts`·`gift-validate.ts` | §1-4 분기 6건 |

---

## 7. 신규 enum/입력객체 시 API 14지점 ⑨~⑭ (참고)

| # | 파일 | 작업 |
|---|---|---|
| ⑨ | `app/api/calc/inheritance/route.ts`·`gift/route.ts` Zod | stockClass·companySize·premiumExclusionReason enum 3개 |
| ⑩ | EstateItem Zod 컴패니언 | 13 입력 + 1 캐시 (Map 함정 회피 — plain object/array) |
| ⑪ | 무관 | − |
| ⑫ | Zod 입력 객체 정의 | EstateItem 객체 13+1 추가 |
| ⑬ | API body spread | `body.estateItems` 그대로 spread |
| ⑭ | Route handler `coerceDates` | listingDate·capitalIncreaseDate·mergerDate·dividendBaseDate 4개 추가 |

---

## 8. 사용자 시나리오 (E2E spec — `e2e/listed-stock-besshi.spec.ts`)

```
시나리오 1: 일반 상장주식 (LS-01)
  1. 상속세 마법사 진입 → 자산 추가 → "상장주식" 선택
  2. 종목코드 "005930" 입력 → 자동조회 클릭
  3. 평균가·종목명 자동 채움 확인
  4. 보유 주식 수 100주 입력
  5. 결과뷰 진입 → 상장주식 평가조서(갑) 표시 확인
     - ⑨ = ⑩ = ⑱ = 평가액/주식수 정합
  6. 펼침 토글 → 평가조서(을) 표시 → 좌·우 31행 확인
  7. PDF 다운로드 → 화면 testid ↔ PDF 텍스트 1:1

시나리오 2: 최대주주 + 대기업 (LS-02)
  1~3. 동일
  4. §63③ 할증 ON → 최대주주 ON + 기업규모 "대기업" 선택
  5. 결과뷰 ⑩ = floor(⑨ × 1.2) 표시 확인
  6. 평가액 = ⑩ × 주식수 (사이드바 합계 자동 갱신)

시나리오 3: §63②3호 증자 신주 (LS-03)
  1. 동일
  4. 증자 신주 라디오 ON
  5. 증자일자·액면가·배당률·배당기산일 입력
  6. 자동조회 재실행 → 평가구간 단축 안내 표시
  7. 결과뷰 ⑪~⑰ 표시 + ⑮·⑯·⑰ 산식 정합

시나리오 4: 거래정지 (LS-07 변형)
  1. 동일
  2. 거래정지 종목 입력
  3. inline alert "거래정지 — 수동 입력 필요" 표시 + 자동 fallback 0건 확인
```

---

## 9. 결과뷰 통합 부착 위치 (Pre-Do 확정)

별지부표3 통합 패턴 (`project_besshi_result_view_integration`) 동일:
- Pre-Do 단계 `grep -rn "estateItems\.map\|category === \"unlisted_stock\"" components/calc/inheritance/results` 로 부착 컴포넌트 확정.
- 동일 위치에 `category === "listed_stock"` 분기 추가:
  ```tsx
  {item.category === "listed_stock" && item.valuation?.besshiData && (
    <ListedStockBesshiResultView item={item} besshi={item.valuation.besshiData} />
  )}
  ```
- 증여세 결과뷰도 동일.

---

## 10. 접근성·반응형

- 갑지 grid: 모바일 1열 → 데스크톱 4열. 라벨 ①~⑱은 NumberCircle (sr-only 라벨 추가).
- 을지: 좌·우 표를 모바일에서 세로 스택, 데스크톱에서 횡 병치. 가로 스크롤 발생 시 [[macos_scrollbar_autohide_workaround]] `HorizontalScrollContainer` 강제.
- ARIA: `<table role="table">` + `aria-label="상장주식 평가조서(갑)"`. NumberCircle `aria-label="① 법인명"`.
- 다크모드 강제 흰 배경 (인쇄 품질).

---

## 11. 800줄 가드

- `Page2DailyClosingTable.tsx` 가 가장 큰 후보. 좌·우 표를 같은 컴포넌트에서 처리 시 ~300줄. 행 셀 generator 헬퍼 분리.
- `ListedStockBesshiAttributesSection.tsx` (입력 폼) — 3 collapsible 각 80줄 × 3 = ~240줄.
- `ListedStockBesshiPdfDocument.tsx` ≤ 600줄 가드.

---

## 12. 정책 cross-link

- [[korean-law-citation-verify]] · [[pre-do-anchor-verification]] · [[feedback_no_silent_apportion_fallback]]
- [[echo-field-pattern]] · [[ui_engine_dual_truth_avoidance]]
- [[three-state-optional-mode-toggle]] · [[mirror-pattern]]
- [[besshi-form-replica]] · [[formula-display-builder]] · [[print-only-css-toggle]]
- [[tax-summary-sidebar-pattern]] · [[engine-result-map-json-loss]] (4그룹 echo는 plain array/object — Map 사용 금지)
- [[feedback_browser_verify_with_playwright]] (E2E spec 통과 = 브라우저 검증)
