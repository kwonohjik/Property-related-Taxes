# 계산 결과 선택 출력 기능 — 계획서

> 작성일: 2026-06-02 · 브랜치: `feature/selective-print` · 워크트리: `Property-related-Taxes-selective-print`
> 우선 적용 세목: **상속세(inheritance)**. 6대 세목 공통화는 후속.

## 1. 문제 정의

현재 계산 결과 화면에서 인쇄(`window.print()`)하면 **모든 섹션·별지 서식이 한꺼번에** 출력된다.
사용자가 실제로 필요한 것은 일부 서식(예: 별지 제9호서식만, 또는 부표2만)인데
불필요한 출력물(평가조서·사후관리 안내·여러 별지)까지 전부 인쇄되어 종이·시간이 낭비된다.

**목표**: 사용자가 **출력할 항목을 계층적으로 선택**한 뒤, 선택한 것만 **화면 인쇄 + 서버 PDF** 양쪽으로 받게 한다. (서버 PDF는 상속세 미연결 → 이번 PR에서 선결작업까지 구축 — §3.2·§4.5)

## 2. 확정된 요구사항 (인터뷰 결과)

| 항목 | 결정 |
|---|---|
| 선택 단위 | **계층형** — 큰 섹션 + 그 안의 개별 서식 2단계 펼침 선택 |
| 적용 범위 | **상속세 우선** (이번 작업), 6대 세목 공통화는 후속 |
| 출력 방식 | **화면 인쇄(print CSS) + 서버 PDF 둘 다** (옵션 B 확정). 서버 PDF는 상속세 미연결(§3.2)이므로 **선결작업까지 이번 PR**에 포함 |
| 기본 선택 상태 | **전체 미선택** — 사용자가 필요한 항목만 골라 추가하는 방식 |
| 별지 서식 PDF | **이번 PR 포함** — 별지 7종 react-pdf 신규 구현 (§3.4) |

## 3. 현황 (탐색 실측 — `feature/selective-print` 워크트리)

### 3.1 화면 결과 뷰
- 컴포넌트: `components/calc/results/InheritanceTaxResultView.tsx:151-495`
- **렌더 위치 (실측)**: `components/calc/InheritanceTaxForm.tsx:414` — **계산 마법사 결과 단계**에서 props(result/heirs/estateItems…)로 직접 렌더.
- ⚠️ **저장이력 경로 `/result/[id]`(ResultDetailClient)는 상속세 미지원** — `taxType !== "transfer"`면 "상세 결과 뷰는 준비 중입니다"만 출력(`ResultDetailClient.tsx:111-117`). 즉 상속세 결과는 마법사 결과뷰 단일 경로.
- 약 20개 섹션을 결과 데이터 기반 자동 렌더링. 사용자 선택 기능 **없음**.
- 이미 존재하는 인쇄 패턴:
  - 버튼/안내: `print:hidden` (`:179`, `:372`, `:468`)
  - 별지 서식 본문: `hidden print:block` (부표2 `:87`, 부표3묶음 `:76`, 별지9호, 산출세액근거, 상장주식조서)
  - 공용 토글 헬퍼: `components/calc/results/shared/ExpandToggleButton.tsx` (버튼 `print:hidden` + 본문 `open ? "block" : "hidden print:block"`)

### 3.2 서버 PDF (상속세 미연결 — 실측)
- API: `app/api/pdf/result/[id]/route.ts` — **GET 전용**(`:30`), 분당 10회 제한, `getCalculation(id)`(Supabase 저장 calc) → `renderToBuffer`. POST 없음.
- 문서: `lib/pdf/ResultPdfDocument.tsx:431-481` 상속세 = `InheritanceGiftSection` + `InheritanceHeirAllocationSection`(`:472-478`)뿐. 화면의 별지(제9호·부표2·부표3·별지5/1호·평가조서)는 **PDF 미구현**.
- ⚠️ **상속세 결과뷰엔 서버 PDF 호출 버튼이 없다** — 출력 버튼은 `window.print()` 단 하나(`InheritanceTaxResultView.tsx:182`). 서버 PDF는 양도세(`ResultDetailClient.tsx:125 handlePdfDownload`)에서만 사용 중.
- ⚠️ 서버 PDF는 **저장된 calculation(savedId) 기반** → 비로그인·미저장 시 호출 불가. 마법사 결과뷰는 `autoSave.savedId`(로그인 시)에 의존.
- ⚠️ **`/api/pdf`는 `proxy.ts:6` PROTECTED_ROUTES로 로그인 필수** (route 주석: "미들웨어에서 로그인 필수 처리 완료"). 즉 비로그인은 savedId 이전에 **route 접근 자체가 차단**. → "선택 항목 PDF"는 로그인+savedId 동시 충족 시에만.
- ✅ **별지 PDF 데이터 가용성 확보 (실측)**: `getCalculation`은 `record.input_data`+`record.result_data`를 `ResultPdfDocument`에 전달. `autoSave`가 **전체 form을 input_data로 저장**(`InheritanceTaxForm.tsx:220`)하고, 화면 결과뷰 props(heirs·debtItems·estateItems·priorGifts·presumedItems·familyBusiness)는 전부 `form.*`(`:414-426`) → PDF에서 input_data로 **동일 복원 가능**.

### 3.3 핵심 결론 (옵션 B 확정)
- 사용자가 제기한 문제("모든 출력물을 한꺼번에 인쇄")의 실체는 **`window.print()` 화면 인쇄** — 별지가 `hidden print:block`으로 전부 펼쳐짐.
- **서버 PDF 선택 출력은 상속세에 아예 연결돼 있지 않다** (버튼 X, route GET 전용, ResultDetailClient 미지원, 별지 PDF 0). 옵션 B 확정에 따라 **다음 선결작업을 이번 PR에 모두 구축**:
  1. 마법사 결과뷰에 **서버 PDF 호출 버튼 신설** + savedId 확보(로그인+자동저장 전제, 비로그인은 화면 인쇄로 안내)
  2. route **GET→POST**(또는 `?sections=` 쿼리)로 선택 ID 수신
  3. `ResultPdfDocument` 상속세 섹션에 **별지 7종 신규 구현**(§3.4)
- ⚠️ **범위 大** — 단계적 PR 분할을 강하게 권장(§5 분할 전략). Do는 서식별 순차 + 각 서식 anchor 통과 후 다음.

### 3.4 별지 서식 PDF 신규 구현 (이번 PR 범위 — react-pdf 포팅)
| 화면 컴포넌트 | PDF 신규 구현 | 비고 |
|---|---|---|
| `FilingForm9CoverSection` (별지 제9호 앞쪽) | `lib/pdf/sections/inheritance/filing-form-9.tsx` | 식별 3블록 + 계산표 + 서명란 |
| `BesshiBuppyo2Section` (부표2, 상속인 N장) | `.../buppyo-2.tsx` | 상속인 수만큼 `<Page>`, A4 가로 |
| `Buppyo3FormTable` (부표3 채무·공과·장례) | `.../buppyo-3.tsx` | |
| `Besshi5FormTable` (별지5호 영농상속공제) | `.../besshi-5.tsx` | 조건부 |
| `Besshi1FormTable` (별지1호 가업상속공제) | `.../besshi-1.tsx` | 조건부 |
| `UnlistedStockBesshiResultSection` (비상장 별지4 부표3) | `.../unlisted-stock-besshi.tsx` | 법인 N개 다중 `<Page>` |
| `ListedStockBesshiResultSection` (상장 평가조서 갑·을) | `.../listed-stock-besshi.tsx` | 종목 N개, 일일종가표 |
> 화면 HTML/Tailwind ↔ react-pdf `View`/`Text`/`StyleSheet` 1:1 매핑. 산식 재계산 금지(결과 echo값 사용). 금액 칸 `amount-column-align` 준수. 각 별지 PDF가 화면 동일 데이터에서 동일 수치를 내는지 anchor.
> ⚠️ **공유 상수 일반화 주의 (실측 정정)**: `besshi-form-constants.ts`는 **비상장주식 별지 전용**(`components/calc/inheritance/unlisted-stock-v2/besshi/`)이며 7종 공통 상수가 아니다. 별지별로 화면 컴포넌트의 라벨·칸번호 상수를 **개별 확인** 후 공유; 상수화 안 된 별지는 추출부터. (추정 인용 금지)
> ⚠️ **prop↔form 가공 재현**: 화면은 `estateItems={[...form.estateItems, ...form.stockItems]}` **합성**, `familyBusinessInput={form.familyBusiness}` **이름 매핑** 등 가공 후 결과뷰에 전달(`InheritanceTaxForm.tsx:414-426`). PDF는 저장 `input_data`(=raw form)에서 **동일 가공을 재현**해야 화면과 일치.
> ⚠️ **직렬화 함정**: `input_data`/`result_data`는 JSON 저장 → (a) Date는 string화(`coerceDates`/`toDate` 필수, `new Date()` 직접 금지) (b) result의 Map은 `{}`로 소실(메모리 `feedback_engine_result_map_json_loss`) → 별지가 쓰는 result 필드는 **Record만**, Map 의존 금지.
> ⚠️ **PR-1 Do deviation**: 화면에서 부표3·별지5호·별지1호는 `DeductionBesshiFormsSection` **단일 카드(공유 토글·PDF버튼)**라 화면 선택 단위를 `deduction-besshi` **1 leaf로 통합**(7종→화면 5 PDF채널 노드). 서버 PDF(PR-3)는 `<Page>` 단위라 7종 개별 구현 가능 — 그때 `deduction-besshi`를 3 leaf로 세분화할지 재평가.

## 4. 설계

### 4.1 출력 항목 레지스트리 (단일 진실)
`lib/print/inheritance-print-sections.ts` — 계층형 출력 가능 항목 정의 (순수 데이터).

```
PrintSectionNode {
  id: string                 // 안정적 식별자 (예: "filing-form-9", "buppyo-2")
  label: string              // 사용자 표시 라벨 ("별지 제9호서식")
  channel: ("screen" | "pdf")[]  // 어느 출력에서 선택 가능한지
  children?: PrintSectionNode[]   // 계층 (큰 섹션 → 개별 서식)
  isAvailable?: (result, input) => boolean  // 데이터 없으면 트리에서 제외(렌더 가드와 동일 조건)
}
```

- 결과 뷰 섹션 순서/가드와 **1:1로 매핑** (탐색 트리 §5 기준). 누락·중복 금지.
- `channel`: 별지 7종 PDF 구현 노드는 `["screen","pdf"]`, PDF 비대상(안내·로그인 유도 등)은 `["screen"]`. "선택 항목 PDF" 버튼은 `pdf` 채널 노드만 PDF에 포함.

### 4.2 선택 상태 관리
- 결과 뷰 로컬 state에 `selectedPrintIds: Set<string>`.
- 기본값: **전체 미선택** (사용자가 필요한 항목만 추가). → 인쇄·PDF 버튼은 선택 0건이면 비활성 + 안내.
- 부모 체크 ↔ 자식 체크 동기화(삼분 상태: all/partial/none). cross-field 동기화는 onChange로 (useEffect store 미러링 금지 — 정책).
- `result`는 zustand partialize 제외 정책이 있으므로, 선택 상태도 **세션 한정 로컬 state** 우선 (persist 불필요).
- ⚠️ 기본 미선택이므로 "아무것도 안 고르고 인쇄" 실수 방지 UX 필수: 선택 0건 시 버튼 disabled + "출력할 항목을 선택하세요" 힌트. "전체 선택" 단축 버튼 제공.

### 4.3 선택 UI (`print:hidden`)
- 결과 뷰 상단(액션 버튼 영역 `:179` 근처)에 **「출력 항목 선택」 패널** 추가.
- 계층형 체크박스 트리 (shadcn Checkbox + 펼침). 큰 섹션 토글 → 자식 일괄.
- 패널 자체 `print:hidden`. **"선택 항목 인쇄"** + **"선택 항목 PDF"** 두 버튼. 기존 `window.print()` 버튼(`:179-187`)을 이 패널로 대체.
  - "선택 항목 PDF": savedId 있을 때만 활성, POST `/api/pdf/result/[id]` 호출(§4.5). 미저장 시 비활성 + 안내.
- 색상·번호 카드 정책(`section-card-numbering`)·`ToggleCard` 패턴 준수.

### 4.4 화면 인쇄 적용
- 각 섹션 래퍼에 선택 상태 기반 클래스 적용:
  - 선택됨: 기존대로 `print:block`(또는 `block`)
  - 미선택: **`print:hidden`** 강제 → 인쇄 시 제외.
- 구현: 섹션을 `<PrintSection id=...>` 래퍼로 감싸 `selectedPrintIds`에 따라 `print:hidden` 토글.
  - 기존 `hidden print:block`(접힘+인쇄펼침) 섹션은 → `미선택 ? "hidden" : (open ? "block" : "hidden print:block")` 로 확장.
- `window.print()` 호출 전 선택 0건이면 경고(빈 출력 방지).

### 4.5 서버 PDF 적용 (이번 PR 범위 — 옵션 B)
실측상 상속세는 서버 PDF에 미연결(§3.2)이므로 다음을 모두 구축:
1. **서버 PDF 호출 버튼 신설**: 마법사 결과뷰(`InheritanceTaxResultView`)에 "선택 항목 PDF" 버튼. `autoSave.savedId`(`InheritanceTaxForm.tsx:233`) 필요 + **`/api/pdf`는 proxy 보호(로그인 필수)** → **로그인+savedId 동시 충족 시에만 활성**, 미충족 시 비활성 + "로그인 후 또는 화면 인쇄(PDF 저장)로" 안내.
2. **route GET→POST**: `/api/pdf/result/[id]` POST 추가 — body `{ sections: string[] }`. 기존 GET(전체)은 하위호환 유지(양도세). 분당 10회 제한·`getCalculation`·`renderToBuffer` 흐름 재사용.
3. **`ResultPdfDocument` 선택 필터 + 별지 7종 신규 구현**(§3.4): `selectedSectionIds`를 받아 해당 섹션만 `<Page>` 렌더. 빈 선택 시 호출 차단.
- 레지스트리 `channel`: 별지 7종 PDF 구현 완료 노드는 `["screen","pdf"]`, PDF 미대상(안내 배너·로그인 유도 등)은 `["screen"]`. UI는 인쇄/PDF 버튼이 동일 `selectedPrintIds` 공유, PDF 버튼은 `channel`에 `pdf` 없는 선택은 무시(또는 경고).
- ⚠️ 화면 ↔ PDF **이중 진실 방지**: 별지 PDF는 화면과 라벨·칸번호·산식 상수 공유(§3.4, 단 상수는 별지별 개별 확인). 동일 result에서 화면·PDF 수치 일치 anchor 필수.
- ⚠️ **prop↔form 가공·직렬화 재현**: 화면 결과뷰는 가공된 props(estateItems 합성·familyBusinessInput 이름매핑) 사용 → PDF는 저장 input_data(raw form)에서 동일 가공 + `coerceDates` 적용(§3.4).

## 5. 작업 범위 / 비범위

### 범위 (이번 PR — 옵션 B: 화면 인쇄 + 서버 PDF)
1. `lib/print/inheritance-print-sections.ts` 레지스트리 + 가용성 가드 + `channel`(screen/pdf).
2. 선택 UI 패널 + 계층 체크박스 트리 (`print:hidden`), 기본 전체 미선택 + "전체 선택" 단축 + 0건 가드. "선택 항목 인쇄" + "선택 항목 PDF" 버튼.
3. 화면 인쇄: 미선택 섹션 `print:hidden` 적용 (전 섹션 `data-print-id` 래핑).
4. **서버 PDF**: route `GET→POST`(`{sections}`) + `ResultPdfDocument` 선택 필터 + savedId 가드.
5. **별지 7종 react-pdf 신규 구현**(§3.4) — 서식별 순차, 화면 상수 공유, 다중 `<Page>`.
6. anchor: (a) 레지스트리 id ⊆ 결과뷰 `data-print-id` 정합, (b) 선택→print 클래스, (c) 별지 PDF ↔ 화면 수치 일치, (d) PDF 선택 필터.
7. E2E(Playwright): 일부 선택 후 (a) 인쇄 미리보기 DOM 미선택 제외, (b) PDF 다운로드 포함 항목 확인.

### 권장 PR 분할 (범위 大 — 강력 권장)
| 단계 | 내용 | 독립 가치 |
|---|---|---|
| **PR-1** ✅ | 레지스트리 + 선택 UI + 화면 인쇄 선택 출력 (§5의 1~3) | 사용자 원래 문제 즉시 해결 |
| **PR-2** ✅ | route POST화 + PDF 버튼 + ResultPdfDocument 선택 필터 (현존 상속세 PDF 섹션=요약·상속인별 한정) | 서버 PDF 선택 골격 |
| **PR-3a** ✅ | 별지 제9호서식 통합 PDF 연결 (기존 `FilingForm9PdfPage` 재사용 + ResultPdfDocument 통합 + pdf 승격) | 별지9호 선택 PDF |
| **PR-3b** ✅ | 나머지 별지 4종(besshi-buppyo-2·deduction-besshi·unlisted·listed) 통합 PDF 연결 + pdf 승격 | 별지 5종 전부 선택 PDF |
> ⚠️ 전제 정정: 별지는 **이미 개별 react-pdf 다운로드 존재**(FilingForm9PdfDownloadButton 등). PR-3는 신규 포팅이 아니라 **통합 결과 PDF(ResultPdfDocument)에 연결**하는 작업. 별지 5종 전체를 `lib/pdf/inheritance-besshi-pages.tsx`로 위임(800줄 정책).

**남은 후속**: E2E(Playwright) 브라우저 인쇄·PDF 검증, 6대 세목 공통화, 선택 프리셋 저장.
> 단일 세션 완주를 원하면 위 순서대로 Do, 각 단계 anchor GREEN 후 다음. 한 PR로 합치면 리뷰·회귀 위험 大.

### 비범위 (후속)
- 양도·증여·취득·재산·종부세 공통화. ⚠️ 결과표시 경로가 세목마다 다름(양도=`ResultDetailClient`/서버 PDF GET, 상속=마법사 결과뷰/이번 PR에서 POST 신설) — 공통화 시 경로 차이 고려.
- 선택 프리셋 저장(자주 쓰는 조합 즐겨찾기).

## 6. 리스크 / 검증 포인트

- **회귀 위험 (기본 미선택)**: 기본=**전체 미선택**이므로 현행과 동작이 **달라진다**(현행은 인쇄 시 전체 출력). 이는 의도된 변경. anchor는 "선택 0건 시 본문 섹션 모두 `print:hidden`"·"전체 선택 시 현행과 동일(별지 모두 출력)" 두 방향 모두 검증. 사용자에게 "기본이 빈 선택"임이 명확히 보이는 UX 필수(0건 가드·전체선택 버튼).
- **레지스트리 드리프트**: 결과 뷰에 섹션 추가 시 레지스트리 누락 가능. 결과뷰는 **조건부 가드로 동적 렌더**되므로 "섹션 수" 비교는 불안정 → anchor는 **"레지스트리에 등록된 모든 id가 결과뷰 DOM의 `data-print-id` 중 (가용 조건 충족 시) 존재"** 방식으로 구체화. 신규 섹션 추가 시 레지스트리 동기화 체크리스트 추가.
- **print CSS 우선순위**: `hidden`/`print:hidden`/`print:block` 충돌. 미선택 강제 숨김이 기존 `print:block`보다 우선하도록 — 래퍼 조건부 클래스 구조(미선택 시 본문 클래스를 `hidden`으로 치환, `print:block` 미부여)로 명확히. anchor로 클래스 문자열 검증.
- **선택 UI ↔ 실제 섹션 바인딩**: 레지스트리 id와 결과뷰 래퍼 `data-print-id`가 1:1. id 오타·누락 시 선택해도 안 숨겨지거나 영원히 숨겨짐 → enum-verification 패턴(상수 단일 출처)으로 id 공유.
- **(옵션 B) 로그인+savedId 동시 의존**: 서버 PDF는 ① `/api/pdf` proxy 보호(로그인 필수) ② 저장 calc 기반(savedId) **둘 다** 필요. 비로그인 또는 미저장 시 "선택 항목 PDF" 비활성 + 사유 안내. 화면 인쇄는 무관하게 항상 가능.
- **(옵션 B) 데이터 소스 이원화 (이중 진실의 깊은 층)**: 화면=마법사 **실시간 form props**, PDF=저장 **input_data JSON 복원**. 같은 별지를 두 경로가 그린다 → (a) Date string화 (b) Map 소실 (c) estateItems 합성·familyBusiness 이름매핑 가공 차이로 **화면≠PDF** 위험. 정정: PDF 복원 시 화면 가공 1:1 재현 + `coerceDates` + Record 사용. 동일 result 입력으로 화면=PDF 수치 일치 anchor 필수.
- **(옵션 B) 화면 ↔ PDF 상수 이중 진실**: 별지 PDF는 화면을 react-pdf로 재구현 → 라벨·칸번호 상수를 화면과 공유, 산식 재계산 금지(echo값). ⚠️ `besshi-form-constants`는 비상장 별지 전용 — 7종 일괄 공유 아님, 별지별 상수 개별 확보.
- **(옵션 B) 별지 PDF 작업량 大**: 7종 각각 레이아웃·다중 페이지·정렬. react-pdf는 `rowSpan` 미지원 등 HTML 대비 제약 → 후속5 사례처럼 flex wrapper 우회 필요. 800줄 정책 주의(PDF 파일 분할). 서식별 PR 분할 강력 권장(§5).

## 7. 다음 단계 (PDCA)

1. **Design**: `_template.engine.design.md`는 엔진용 → 본 기능은 UI 중심이므로 `selective-print.design.md`로 케이스 인벤토리 표 작성(섹션별 screen/pdf 가용성 매트릭스, ≥1행 필수).
2. **Pre-Do anchor**: (화면) "선택 0건 시 본문 섹션 모두 print:hidden" + "특정 1개만 선택 시 그것만 출력·나머지 hidden". (서버 PDF 진입 시) "저장 input_data → ResultPdfDocument 별지 렌더 시 화면=PDF 수치 일치"(직렬화·가공 재현 검증) + "PDF 선택 필터" anchor.
3. **Do**: PR-1(레지스트리 → `data-print-id` 래핑 → UI 패널 → 화면 인쇄 토글) → PR-2(route POST + PDF 버튼 + 필터) → PR-3~(별지 PDF 서식별). 각 단계 anchor GREEN 후 다음.
4. **Check**: E2E + 브라우저 인쇄/PDF 수동 확인. 엔진 input/result 무변경 → `ui-engine-sync-checker`/14지점 해당 없음. 단, PDF는 `besshi-form-replica`·`amount-column-align`·`korean-law-citation-verify` 스킬 준수.
5. **Act**: 6대 세목 공통화 후속 등록.

## 8. 결정 사항 (모두 확정)

- [x] **기본 선택 상태**: **전체 미선택** — 0건 가드 + "전체 선택" 단축.
- [x] **출력 방식**: **옵션 B — 화면 인쇄 + 서버 PDF 둘 다**. 서버 PDF 선결작업(PDF 버튼 신설 + route POST화 + 별지 7종 react-pdf) 모두 이번 PR 범위.
- [x] **별지 서식 PDF**: **이번 PR 포함** (§3.4의 7종).
- ⚠️ **권장**: 범위가 크므로 §5 PR 분할(PR-1 화면인쇄 → PR-2 서버PDF골격 → PR-3~ 별지)로 진행. 단일 PR 강행 시 리뷰·회귀 부담 大.
