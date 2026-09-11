# 순손익·순자산 계산서 — 원본 PDF 화면 표 레이아웃 재현 계획서

> **요구 출처**: 사용자 제공 이미지 7 (「양도코리아 2.0 — 순손익 계산서」 화면).
> **결정**: 법령 라벨 2건(행 23·행 24)은 **현행 유지**, 나머지는 이미지 7대로 구현.
> **순손익 계산서와 순자산가액 계산서 «둘 다»** 이미지 7 양식으로 전환한다 (사용자 확정 2026-09-11).
> **작성**: 2026-09-11

---

## 1. 배경 — 이미지 7은 「남의 프로그램」이 아니라 **이 도메인의 원본 서식 화면**이다

`docs/00-pm/stock-transfer-post-listing-pdf-replica.plan.md:7`이 기반 PDF를
`주식-취득후 상장.pdf`(사례 코드 `EXAMPLE_POST_LISTING`)로 명시하고, 같은 문서 `:28~35`가
그 PDF의 **3개 다이얼로그**를 열거한다:

| # | 원본 화면 | 현재 구현 |
|---|---|---|
| ① | 일자별 종가 표 | `PostListingClosingPriceTable` |
| ② | **순손익 계산서 (상장일·취득일 직전 사업연도 2열 × 24행)** | `PostListingNetIncomeStatement.tsx` |
| ③ | **순자산가액 계산서 (20행)** | `PostListingNetAssetStatement.tsx` |

이미지 7의 행 번호 체계(1~16 · 17 · 20 · 21 · 23 · 24, **18·19·22 결번**)가 현행 구현과
**정확히 일치**한다(`PostListingNetIncomeStatement.tsx:31~36`·`:56~69` 라벨 상수, `:6~13` 주석). 즉 **행 구성은 이미
원본을 따르고 있고, 아직 따라가지 못한 것은 레이아웃뿐**이다.

현행 레이아웃의 문제(사용자 지적 2건):

1. 같은 항목의 라벨이 **좌우 두 컬럼에 모두** 표시돼 화면이 어지럽다.
2. 각 항목이 **별도 카드**(`FieldCard`)라 세로 높이만 차지한다.

두 지적은 **하나의 해법**으로 수렴한다 — 라벨 1열 + 연도별 값 열의 **행 기반 표**.

### 1.1 형제 경로가 이미 그 구조다

| 파일:line | 구조 |
|---|---|
| `components/calc/inheritance/unlisted-stock-v2/FiscalYearAdjustmentTable.tsx:279` | `grid-cols-[13rem_repeat(3,minmax(0,1fr))]` — 라벨 1열 + 3개 사업연도 열 |
| `components/calc/inheritance/unlisted-stock-v2/NetAssetCalculationTable.tsx:195` | `grid-cols-[16rem_1fr]` + `border-b` 행 구분, `FieldCard` 미사용 |
| `components/calc/inheritance/unlisted-stock-v2/besshi/Page6NetIncomeBreakdown.tsx:60,86,105` | `<table border-collapse border-black>` + **`rowSpan` 좌측 그룹 라벨** — 이미지 7과 동일 구조 (단, **읽기 전용 출력 뷰**) |

⇒ 이번 작업은 신규 디자인이 아니라 **주식양도세만 남은 예외를 형제 경로에 맞추는 일**이다.
[[feedback_sibling_path_already_implements_rule]]

---

## 2. 채택·비채택 확정

### 2.1 채택 (이미지 7대로)

| # | 항목 | 현행 | 비고 |
|---|---|---|---|
| C-1 | **완전 격자**(세로선 포함) 표 | 카드 스택 | `Page6NetIncomeBreakdown.tsx:29` `TD = "border border-black p-1"` 선례 |
| C-2 | **라벨 1열 공유** (좌우 중복 제거) | 컬럼마다 라벨 반복 | |
| C-3 | 헤더에 **사업연도 연도값** (2008 / 2003) | **필드 없음** | 신규 필드 — §5 |
| C-4 | **(A)·(B) 소계 행**을 표 안에 | 없음 (엔진 지역변수) | 엔진 echo — §6 |
| C-5 | **17·21·24 결과 행**을 표의 연속 행으로 | 표 밖 요약 박스 | |
| C-6 | 계산 행 **회색 배경**(읽기 전용 구분) | 구분 없음 | |
| C-7 | 그룹 라벨 **세로 병합 열**(`rowSpan`) | 가로 소제목 행 | |
| C-8 | **삭제 항목 자리 보존** 회색 행 | 없음 | ✅ **V-1 해소** — 라벨은 「비업무용토지 취득세 (현행 삭제)」. **연도 미표기** (§8 V-1) |
| C-9 | 행 20 라벨 = **"사업연도말 주식 또는 환산주식수"** | "20. 환산주식수" + hint | hint 중복도 함께 해소 |
| C-10 | 행 20 **드롭다운** | 자유 입력 | ✅ **Q-1 확정** — 후보 = 발행주식 총수 + 상대 계산서 값 (§4.7) |
| C-11 | 숫자 `font-mono` + `tabular-nums` — **계산 행 한정** | 입력칸은 `text-right`만 (`CurrencyInput.tsx:140`) | 입력칸은 현행 유지 — `CurrencyInput`에 `className` prop이 없다 (§4.3.2) |

### 2.2 비채택 — 법령 라벨 2건 **현행 유지** (사용자 결정)

| # | 이미지 7 | 유지할 현행 | 근거 |
|---|---|---|---|
| X-1 | "23. 기획재정부령이 **고시**하는 이자율" | "23. 환원율" + hint *"고시값 아닌 시행규칙 정액"* (`PostListingNetIncomeStatement.tsx:184`) | 상증칙 §17의 연 10%는 고시가 아니라 시행규칙 정액. **공식 2025.07.10 양식도 "자. 기획재정부령이 «정하는» 율"**(`besshi-form-constants.ts:336`) — 이미지 7의 "고시하는"이 구판 표현 |
| X-2 | "24. **최근3년간** 순손익액의 **가중평균액**에 의한 1주당 가액" | "24. 1주당 가액" | §165⑤·§165④ 경로는 **직전 1개 사업연도**만 쓴다. 공식 양식의 동명 라벨(`besshi-form-constants.ts:337`)은 분자가 **"아. 가중평균액"**이지만 우리 행 24의 분자는 **행 21(1주당 순손익액)**이다. 이미지 7 화면 자체가 열 2개 × 1개 연도라 라벨과 산식이 불일치. anchor `post-listing-prior-fy-labels.anchor.test.tsx`가 "직전 사업연도"를 고정 |

[[feedback_korean_law_citation_verify]] · [[feedback_deliberate_design_looks_like_the_defect]]

### 2.3 이미지 7에 없지만 **반드시 유지**

| 항목 | 현행 위치 |
|---|---|
| 결손 0 하한 안내 + 조문 모달 (상증령 §56①) | `PostListingNetIncomeStatement.tsx:207~218` |
| 자본잠식 0 하한 안내 + 조문 모달 (상증령 §55①) | `PostListingNetAssetStatement.tsx:227~240` |
| 행 1 음수 입력 허용 (`ADD_SIGNED`) | `PostListingNetIncomeStatement.tsx:53` |
| 행 2·3 음수 입력 허용 (`ASSET_ADD_SIGNED`) | `PostListingNetAssetStatement.tsx:50` |

⇒ 양도코리아 화면엔 이 안내가 없다. **표로 옮기면서 흘리면 안 된다.**

---

## 3. 현행 실측

### 3.1 대상 컴포넌트 — `YearColumn` 재사용으로 **4화면이 동시에 바뀐다**

| 파일 | 줄 | 비고 |
|---|---|---|
| `components/calc/stock-transfer/PostListingNetIncomeStatement.tsx` | 241 | `YearColumn` export |
| `components/calc/stock-transfer/PostListingNetAssetStatement.tsx` | 262 | `YearColumn` export |
| `components/calc/stock-transfer/EstimatedUnlistedNetIncomeStatement.tsx` | 62 | thin wrapper — `YearColumn` 재사용 (`:12`) |
| `components/calc/stock-transfer/EstimatedUnlistedNetAssetStatement.tsx` | 51 | thin wrapper — `YearColumn` 재사용 (`:12`) |

컬럼은 4종이다 — `Listing` / `Acq` / `EUTransfer` / `EUAcq`
(`PostListingNetIncomeStatement.tsx:79~85`). 한 화면에 최대 2열.

### 3.2 결과 화면에는 이 계산서가 **재현되지 않는다** (실측)

```
grep -rln "순손익 계산서|순자산가액 계산서|17. 순손익액" components/calc/results/ components/calc/stock-transfer/
→ stock-transfer/ 4파일만. results/ 0건.
```

⇒ **입력 화면 전용**이다. 이것이 §5의 동기화 지점 판정을 가른다.

### 3.3 셀렉터 역방향 grep + **mutation probe 실측**

[[feedback_display_string_change_needs_reverse_grep]] · [[feedback_pre_change_safety_net_probe]]

| 파일 | 셀렉터 | 영향 |
|---|---|---|
| `e2e/stock-transfer-unlisted-deficit-negative.spec.ts:34` | `cardInput()` = `[data-slot="field-card"]` filter by 라벨 | 🔴 **FieldCard 제거 시 깨짐** — `:78,82` 사용 |
| `__tests__/.../unlisted-deficit-negative.anchor.test.tsx:44` | `closest('[data-slot="field-card"]') ?? parentElement` | 🟢 **probe에서 통과** — fallback이 삼켰다 (아래) |
| `__tests__/.../unlisted-valuation-preview-single-source.anchor.test.tsx:61` | 동일 | 🟢 동일 |
| `__tests__/tax-engine/stock-transfer/postlisting-yearcolumn-export-regression.test.ts:88~93` | `expect(typeof naMod.YearColumn).toBe("function")` | 🔴 **`YearColumn` export를 명시 단언** — §3.4 |

#### 🔬 P-1 실측 (2026-09-11) — **초판 §3.3 판정 정정**

초판은 두 anchor를 「fallback이 있어 **조용히 통과할 수 있다**」(가능성)로 적었다. **불완전했다** —
`FieldCard`의 `data-slot="field-card"`를 무력화하고 `__tests__/components/calc/stock-transfer/`
전건(기준선 21파일 188건 통과)을 돌린 결과:

```
Test Files  3 failed | 18 passed (21)
Tests      10 failed | 178 passed (188)
```

**실패한 10건은 전부 다른 컴포넌트였다**:

| 실패 파일 | 케이스 | 대상 |
|---|---|---|
| `acq-one-month-table.anchor.test.tsx` | SM-1·2·3 · ACQ1M-10·11 | 취득 1개월 종가표 |
| `major-shareholder-layout.anchor.test.tsx` | L-4b · L-5 · L-14(2건) | 대주주 블록 |

⇒ **순손익·순자산 계산서의 `FieldCard` 제거를 잡는 vitest anchor는 0건이다.**
두 anchor는 `?? hits[0].parentElement!`가 삼켜 **통과했다**.

🔴 **함의 — Phase G의 fallback 제거는 「권장」이 아니라 «필수»다.**
표 전환 후 그 두 anchor가 초록이어도 **아무것도 증명하지 않는다**.
[[feedback_fixture_default_masks_gate_defect]] · [[feedback_mutation_zero_discrimination_is_not_proof]]

### 3.4 🔴 `YearColumn` export 회귀 — **초판이 통째로 놓친 Critical** (P-2 실증)

`YearColumn`은 두 계산서가 **named export**하고 EU wrapper 2개가 소비한다:

| 소비처 | line |
|---|---|
| `EstimatedUnlistedNetAssetStatement.tsx` | `:12` `import { YearColumn } from "./PostListingNetAssetStatement"` |
| `EstimatedUnlistedNetIncomeStatement.tsx` | `:13` `import { YearColumn } from "./PostListingNetIncomeStatement"` |

그리고 **회귀 anchor가 그 export 자체를 단언**한다
(`postlisting-yearcolumn-export-regression.test.ts:88~93`, 케이스명
「Column 타입 확장 후 PostListing 컴포넌트 import 동작 — YearColumn export 확인」).

**P-2 실측**: `export function YearColumn` → `function YearColumn` 으로 바꾸고 그 파일을 돌리면
`Tests 1 failed | 3 passed (4)` — **안전망이 실재한다**.

🔑 **행 기반 표로 가면 「한 컬럼을 렌더하는 컴포넌트」라는 개념 자체가 사라진다.**
표가 열 목록을 받아 한 번에 그리기 때문이다. ⇒ 네 컴포넌트의 **인터페이스가 함께 바뀐다**:

```
(현행)  <YearColumn col="EUTransfer" /> + <YearColumn col="EUAcq" />
(전환)  <StatementTable kind="netAsset" cols={["EUTransfer","EUAcq"]} />
```

⇒ Phase에 **wrapper 4개 전환 + 이 anchor 갱신**을 독립 단계로 세운다(§7 Phase F').
anchor는 「export가 있다」가 아니라 **「wrapper가 표를 두 열로 렌더한다」**를 단언하도록 바꾼다 —
지키려던 것(EU 경로가 PostListing 산식을 재사용한다)은 유지하고, 수단(named export)만 바뀐다.
[[feedback_800line_split_export_preservation]]

**영향 없음이 확인된 것** (같은 문자열을 쓰지만 대상이 다름):

- `e2e/stock-transfer-165-5-floor80.spec.ts:50,51` · `165-9-main:42,43` · `monthly-accrual:48,49` ·
  `daily-closing:68,69` — `field-card` 셀렉터의 대상이 **"양도 주식수"·"발행주식 총수"**로 이번 범위 밖.
- 같은 spec들의 `"…1주당 순손익가치"` 라벨은 **simple 모드**(`PostListingValuationCard`) 것으로 상세 표 밖.
- `e2e/inheritance-unlisted-*.spec.ts` · `net-asset-label-width` · `fiscal-year-table-alignment` ·
  `gift-deemed-related-corp` — **상속·증여 v2 컴포넌트** 대상. 무관.
- `__tests__/tax-engine/**` 다수 — 순수 엔진 테스트. DOM 무관.

⚠️ 위 🟠 2건은 **fallback 때문에 "통과"가 무의미해질 수 있다**. Phase F에서 fallback을 제거해
scope를 새 구조로 명시 고정한다. [[feedback_fixture_default_masks_gate_defect]]

---

## 4. 설계 — 행 기반 표

### 4.1 행 구성 (순손익 계산서)

| 표시 | 종류 | 그룹(rowSpan) |
|---|---|---|
| `구 분` + **열마다** `〈컬럼 라벨〉 〈연도〉` (열 수는 `cols.length` — §4.2.2) | 헤더 | — |
| 1. 각 사업연도 소득금액 | 입력 (음수 허용) | — |
| 2·3·4 | 입력 | **소득에 가산할 금액** |
| (A) 가산할금액 합계 (1+2+3+4) | 계산·회색 | — |
| 5·6·7 | 입력 | **소득에서 공제할 금액** |
| 비업무용토지 취득세 (현행 삭제) | 비활성·회색 | 〃 (§8 V-1) |
| 8 ~ 16 | 입력 | 〃 |
| (B) 공제할금액 합계 (5 + … + 16) | 계산·회색 | — |
| 17. 순손익액 (A − B) | 계산·회색 | — |
| 20. 사업연도말 주식 또는 환산주식수 | 입력 + 후보 드롭다운 (§4.7) | — |
| 21. 1주당 순손익액 (17 ÷ 20) | 계산·회색 | — |
| 23. 환원율 | 입력 | **라벨 현행 유지 (X-1)** |
| 24. 1주당 가액 (21 ÷ 23) | 계산·회색 | **라벨 현행 유지 (X-2)** |
| (0 하한 발동 시) 안내 + 조문 모달 | 표 하단 | §2.3 |

### 4.2 행 구성 (순자산가액 계산서)

| 표시 | 종류 | 그룹(rowSpan) |
|---|---|---|
| 1. 재무상태표상 자산가액 | 입력 | **자산** |
| 2·3 (음수 허용) · 4·5 | 입력 | 〃 |
| 6·7 | 입력 | 〃 |
| (가) 자산총계 | 계산·회색 | — |
| 8. 재무상태표상 부채액 | 입력 | **부채** |
| 9 ~ 14 | 입력 | 〃 |
| 15·16·17 | 입력 | 〃 |
| (나) 부채총계 | 계산·회색 | — |
| 18. 영업권 포함 전 순자산가액 (가 − 나) | 계산·회색 | — |
| 19. 영업권 | 입력 | — |
| 20. 순자산가액 (18 + 19) | 계산·회색 | — |
| 사업연도말 발행주식총수 (주) | 입력 | — |
| 1주당 순자산가치 | 계산·회색 | — |

#### 4.2.1 순자산가액 계산서에 이미지 7 양식을 적용하는 방식 (사용자 확정)

이미지 7은 **순손익 화면만** 제공됐다. 순자산은 원본 PDF의 별도 다이얼로그(③)이므로 그 화면
캡처가 없다. ⇒ **이미지 7에서 읽히는 «양식 규칙»을 순자산 행 구성에 이식**한다. 규칙 대 적용은
1:1로 다음과 같다 — 이미지에 없는 것을 지어내지 않는다.

| 이미지 7의 양식 규칙 | 순자산 계산서 적용 |
|---|---|
| 완전 격자 `<table>` (C-1) | 동일 |
| `구 분` 라벨 1열 + 연도 n열 (C-2) | 동일 — 「상장연도 직전」/「취득연도 직전」 2열 |
| 헤더에 사업연도 연도값 (C-3) | 동일 — **순손익과 같은 필드를 공유**(§5.1 🔑) |
| 좌측 `rowSpan` 그룹 라벨 「소득에 가산할 금액」/「소득에서 공제할 금액」 (C-7) | **「자산」/「부채」** — 현행 소제목(`PostListingNetAssetStatement.tsx:166,187`)을 그대로 그룹 셀로 올린다 |
| 그룹 소계 행 `(A)`/`(B)` 를 표 안에 (C-4) | **`(가) 자산총계` / `(나) 부채총계`** — 현행 주석(`:10,14`)이 이미 「행 가」·「행 나」로 부르는 그 값 |
| 결과 행을 표의 연속 행으로 (C-5) | 행 18·20·1주당 순자산가치 |
| 계산 행 회색 배경 (C-6) | 동일 |
| 삭제 항목 자리 보존 회색 행 (C-8) | **해당 없음** — 순자산 20행에는 그런 행이 이미지·현행 어디에도 없다 |
| 행 20 드롭다운 (C-10) | 「사업연도말 발행주식총수」에 동일 적용 (Q-1 확정 후) |
| `font-mono` + `tabular-nums` (C-11) | 동일 |

행 구성 자체는 **현행 `PostListingNetAssetStatement.tsx:6~17` 주석의 PDF 20행 그대로**이며 이번
작업으로 행이 늘거나 줄지 않는다.

### 4.2.2 🔑 열 개수는 **동적이다** (F-2 — 초판 2열 전제 정정)

초판 §4.1·§4.2는 「좌우 2열」을 전제했다. **불완전했다** — 실측한 분기가 셋이다:

| 컴포넌트 | 분기 | 열 |
|---|---|---|
| `PostListingNetIncomeStatement` / `NetAssetStatement` | `mode === "listing_only"` | **1열** (Listing) |
| 〃 | `mode === "full"` | 2열 |
| `EstimatedUnlistedNetAssetStatement.tsx:22` | `form.acqFaceValueOnly === true` | **1열** (EUTransfer) |
| `EstimatedUnlistedNetIncomeStatement.tsx:30~38` | `shouldSkipNetIncome(form)` | **표 자체 비노출** (안내 카드로 치환, `data-testid="eu-ni-hidden-notice"`) |
| 〃 `:39` | `acqFaceValueOnly` | **1열** |

⇒ 표 원자는 **`cols: Column[]`을 받아 열 수를 데이터로 결정**한다. 헤더 셀 수·`rowSpan` 높이·
Enter 이동 축(§4.4)·`colgroup` 폭이 모두 `cols.length`에 종속된다. 1열일 때 라벨 열 비중이
과도해지지 않도록 폭은 `grid-cols-[minmax(13rem,auto)_repeat(N,minmax(0,1fr))]`로 잡는다.

### 4.3 공용 원자 — `StatementTable`

두 계산서 + 4화면이 공유하므로 원자 1벌을 신설한다(추상화 최소 — 단일 사용 추상화 금지 원칙에
저촉되지 않는다. 사용처 2 컴포넌트 × 4 화면).

```
components/calc/stock-transfer/statement-table/
  StatementTable.tsx      — <table> 골격 + 열 헤더(구 분 + 연도 n열) + HorizontalScrollContainer
  StatementRow.tsx        — 입력 행 (라벨 · description · rowSpan 그룹 셀 · 입력 셀 n개)
  StatementCalcRow.tsx    — 계산 행 (읽기 전용 · 회색 · 금액 정렬)
  statement-enter-nav.ts  — Enter = «열 단위 세로 이동»
```

#### 4.3.1 🔴 hint 슬롯 소실 대책 (F-11 — 초판 누락)

`FieldCard`를 걷어내면 **`hint` 슬롯이 함께 사라진다.** 현행 hint 3건이 전부 실질 내용을 담는다:

| 위치 | hint | 처리 |
|---|---|---|
| `PostListingNetIncomeStatement.tsx:174` 행 20 | *"사업연도말 주식 또는 환산주식수 (주)"* | **C-9로 라벨에 흡수** — 중복 해소 |
| 동 `:183~184` **행 23** | *"상증법 시행규칙 §17 — 연 10% 고정 (소령 §165④1가목 → 소칙 §81② 위임). **고시값 아닌 시행규칙 정액.** 다른 값 직접 입력 시 우선."* | 🔴 **반드시 보존** |
| `PostListingNetAssetStatement.tsx:213` 주식수 | *"순손익 주식수와 보통 동일. 분할·증자 시에만 다르게 입력하세요."* | §4.7 드롭다운으로 대체 |

🔑 **행 23 hint가 곧 X-1 「현행 유지」의 실체다.** 이미지 7의 "기획재정부령이 고시하는 이자율"을
쓰지 않기로 한 근거가 이 문장에 적혀 있다. 이것이 사라지면 **X-1 결정이 화면에서 증발한다.**

⇒ `StatementRow`에 **`description` 슬롯**을 둔다 — 라벨 셀 안 `text-caption text-gray-500` 보조 줄.
형제 경로가 같은 자리에 같은 것을 쓴다(`NetAssetCalculationTable.tsx:200`의 `row.description`,
`FiscalYearAdjustmentTable.tsx:288`).

#### 4.3.2 원자 스타일 제약 (F-6·F-7·F-9)

| 축 | 제약 | 근거 |
|---|---|---|
| **폰트 크기** | 임의 `text-[Npx]` **금지**. 정본만 — 라벨 `text-xs`(12) · 보조 `text-caption`(11) · 배지 `text-micro`(10) | `scripts/check-font-sizes.sh` **pre-push 하드블록** |
| **톤** | 동적 보간 `bg-${x}-200` **금지**(정적 하드코딩은 통과) | `scripts/check-tone-classes.sh` — PATTERN이 `\$\{...\}` 보간만 잡는다 |
| **표 색** | **gray/neutral/zinc 유지** | `components/calc/CLAUDE.md` 톤 섹션: *"공식 서식 replica 표는 gray/neutral/zinc 유지(원본 재현 — **변경 금지**)"* — 이 작업이 정확히 그 범주 |
| **테두리** | `Page6NetIncomeBreakdown.tsx:29`의 `border-black`은 **PDF 인쇄 뷰**용이다. 화면 입력 표는 gray 계열로 | 다크모드 대비 |
| **금액 정렬** | `text-right font-mono tabular-nums whitespace-nowrap`. 공용 `BesshiRow`/`BesshiColumn`(`components/calc/results/shared/BesshiRow.tsx`) **재사용 우선** | `components/calc/CLAUDE.md` 체크리스트 · [[amount-column-align]] |

> ⚠️ **C-11은 계산 행에만 적용된다.** `CurrencyInput`에는 `className` prop이 **없다**(props 실측:
> label·value·onChange·placeholder·required·hint·disabled·hideUnit·hideLabel·allowNegative·data-testid).
> 입력칸은 이미 `text-right`(`CurrencyInput.tsx:140`)이므로 그대로 두고, 공용 컴포넌트에 prop을
> 새로 뚫지 않는다 — 전 세목이 쓰는 컴포넌트라 회귀 표면이 넓다. (F-9)

#### 4.3.3 placeholder (F-10)

단위가 **열 헤더로 올라가므로** 현행 `placeholder="원"`·`"주"`는 중복이 된다 — 제거한다.
`"원 (없으면 비워두세요)"`(행 19 영업권)는 **의미가 있는 안내**이므로 `description` 슬롯으로 옮긴다.
숫자 예시 placeholder는 금지(`components/calc/CLAUDE.md`).

### 4.4 Enter 이동 — **열 단위 세로 이동을 반드시 보존**

현행은 컬럼 `<div>` 안 input을 DOM 순서로 순회해 **한 연도를 세로로 완주**한다
(`PostListingNetIncomeStatement.tsx:130~143`). 행 기반으로 바꾸면 DOM 순서가
「행1-좌, 행1-우, 행2-좌…」가 되어 Enter가 **좌우 지그재그**로 바뀐다 — 실질 UX 후퇴다.

⇒ 형제 경로가 이미 푼 방식을 그대로 쓴다:
`FiscalYearAdjustmentTable.tsx:246,291` — `data-fy-col` / `data-fy-row` 속성 + `handleFiscalEnter`,
컨테이너에 `data-enter-nav="off"`로 전역 가로 Enter 비활성.

### 4.5 접근성 이름·셀렉터 축 — **기존 계약을 쓴다** (F-4 정정)

초판은 `data-col`/`data-row`를 셀렉터 축으로 **발명**하려 했다. 불필요했다 —
`CurrencyInput`이 이미 두 계약을 제공한다(실측):

| 계약 | line | 내용 |
|---|---|---|
| `"data-testid"?: string` | `:59~60` | *"E2E·단위 테스트 셀렉터용 — **내부 input에 전달**"* |
| `hideLabel?: boolean` | `:56~57` | *"외부(FieldCard·**테이블 좌측 셀**)에 이미 라벨이 있을 때 … **aria-label로 접근성은 보존**"* |

🔑 **`hideLabel` 주석이 「테이블 좌측 셀」 용법을 이미 상정하고 있다** — 이 전환은 그 계약이
예정한 사용처다. 그리고 공용 컴포넌트가 testid를 **흘리므로**, 공용 카드가 testid를 삼키는
함정([[feedback_shared_card_testid_not_forwarded]])에도 해당하지 않는다.

⇒ **셀렉터 축 = `data-testid`** (`ni-row1-Listing` 형태). Enter 이동 축(`data-col`/`data-row`)은
§4.4의 포커스 순회 전용으로만 둔다 — 두 축의 목적을 섞지 않는다.
[[feedback_selector_axis_has_three_forms]]

> ⚠️ **부수 효과 — 기존 anchor 주석이 stale해진다.** 현행은 `label=""`을 넘겨
> RTL이 접근성 이름을 만들지 못했고, 그래서 `unlisted-deficit-negative.anchor.test.tsx:14`가
> *"`getByRole("textbox", { name })`을 쓰지 말 것"* 이라고 적어 두었다. `label={row.label}
> hideLabel`로 바뀌면 **aria-label이 생겨 그 제약이 풀린다**. Phase G에서 주석도 함께 정정한다.

### 4.6 모바일 — **공용 `HorizontalScrollContainer`를 쓴다** (F-5 정정)

현행 `md:grid-cols-2`는 좁은 화면에서 컬럼을 세로 적층한다. 라벨을 공유하면 적층이 불가능하므로
가로 스크롤로 전환해야 한다.

초판은 raw `overflow-x-auto`를 쓰겠다고 했다(`FiscalYearAdjustmentTable.tsx:246` 모방).
**그 선례가 최선이 아니다** — 공용 `components/calc/shared/HorizontalScrollContainer.tsx`가
이미 있고 5곳에서 쓰인다. 존재 이유가 정확히 이 문제다(`:4~11`):

> *macOS 「스크롤 막대 표시: 자동」에서는 네이티브 스크롤바가 보이지 않아 **우측 콘텐츠 인지 실패***
> ⇒ 가짜 thumb 상시 렌더 + 좌·우 화살표 + 우측 fade + `print:overflow-visible`

**2열 표에서 우측 열(취득연도)이 안 보이면 입력 자체를 빠뜨린다** — 이 표에 특히 치명적이다.
⇒ `HorizontalScrollContainer`로 감싼다. [[feedback_macos_scrollbar_autohide_workaround]]

### 4.7 행 20 / 발행주식총수 후보 드롭다운 (C-10 — Q-1 확정)

**후보 목록** (값이 있는 것만, 중복 제거):

| 후보 | 출처 | 실측 |
|---|---|---|
| 발행주식 총수 | Step1 「양도·취득 일자 및 주식수」 | `form.totalIssuedShares` — 최상위 폼 필드 (`calc-wizard-stock-form-types.ts:100`, initial `calc-wizard-stock-form.ts:77`) |
| 상대 계산서의 주식수 | 같은 컬럼의 순손익↔순자산 | `niShareCount{Col}` ↔ `naShareCount{Col}` |

현행 hint가 *"순손익 주식수와 보통 동일. 분할·증자 시에만 다르게 입력하세요."*
(`PostListingNetAssetStatement.tsx:213`)라고 말하는 그 관계를 **클릭으로 옮길 수 있게** 하는 것이
이 드롭다운의 목적이다. 라벨로 승격되는 C-9와 함께 이 hint는 제거 대상이 된다.

🔴 **구현 제약 — 자동 채움 금지**

- 드롭다운 **선택 시에만** `onChange`로 store에 쓴다. 값이 비어 있다고 **자동으로 채우지 않는다**.
- `useEffect → store` 미러링으로 구현하지 않는다 — 무한 루프 위험.
  [[feedback_useeffect_store_mirror_forbidden]] · [[mirror-pattern]]
- 후보 목록 계산은 **렌더 중 파생값**(`useMemo`)으로만. 자유 입력은 그대로 유지한다.

---

## 5. 신규 필드 — 사업연도 연도 (C-3)

### 5.1 동기화 지점 판정 — **①②③⑤ 4곳만** (엔진·API 미경유)

§3.2 실측에 따라 이 값은 **결과 화면·PDF에 쓰이지 않는 입력 화면 표시 전용**이다.
계산에도 관여하지 않는다. ⇒ 엔진 input을 오염시키지 않는다.

| 지점 | 파일 | 조치 |
|---|---|---|
| ① 폼 타입 | `lib/stores/calc-wizard-stock-form-types.ts` (`:307~320` ni · `:474~487` EU 인접) | `fiscalYear{Col}: string` × 4 |
| ② initial | `lib/stores/calc-wizard-stock-form.ts` (`:188~199`, `:271~282`) | `""` × 4 |
| ③ normalize | `lib/stores/calc-wizard-stock-normalize.ts` (`:286~295`) | `strField` × 4 |
| ⑤ UI 위젯 | 표 헤더 셀 | |
| ④⑧⑨⑩⑪⑫⑬⑭ | — | **해당 없음** (엔진·Zod·route 미경유) |
| ⑥ 사이드바 | — | 해당 없음 (금액 아님) |
| ⑦ 결과 카드 | — | 해당 없음 (§3.2) |

> 🔑 **필드는 `ni`/`na` 공용 1벌**이다 — "상장일 직전 사업연도"는 순손익·순자산이 같은 연도다.
> 컬럼당 1개 × 4컬럼 = **4필드**. `ni`/`na`로 쪼개면 두 화면이 갈라질 수 있다.

### 5.2 입력 형식

연도만 받는다(이미지 7: `2008` / `2003`). 4자리 숫자, 미입력 허용(현행 동작 보존 —
값이 없으면 헤더는 `상장일 직전 사업연도`만 표시).

✅ 포커스 시 전체 선택은 **추가 작업이 없다** — `SelectOnFocusProvider`가 root layout에 전역 등록돼
모든 `<input>`에 자동 적용된다. 개별 `onFocus` 추가는 **금지**(`components/calc/CLAUDE.md`).

---

## 6. 엔진 echo 필드 — (A)·(B) / (가)·(나) 소계 (C-4)

### 6.1 현행 — 소계는 **지역변수로만 존재한다** (실측)

| 함수 | 파일:line | 지역변수 |
|---|---|---|
| `calcNetIncomePerShare` | `lib/tax-engine/stock-transfer/stock-valuation-post-listing.ts:207,208` | `addA` · `subB` |
| `calcNetAssetPerShare` | 동 `:262,263` | `assetSubtotal` · `liabSubtotal` |

반환 타입(`:206`, `:251~256`)에 없어 UI가 볼 수 없다.

### 6.2 조치 — optional echo 추가 (산식 무변경)

```ts
calcNetIncomePerShare → { …, addTotalA: number, subTotalB: number }
calcNetAssetPerShare  → { …, assetSubtotal: number, liabSubtotal: number }
```

- **산식·기존 반환 필드 불변** ⇒ 회귀 위험 최소. [[echo-field-pattern]]
- **UI에서 재계산 금지** — 두 컴포넌트는 이미 이 함수를 직접 import해 프리뷰를 만든다
  (`PostListingNetIncomeStatement.tsx:120~127`, `PostListingNetAssetStatement.tsx:135~156`).
  합계를 UI에서 따로 더하면 이중 진실이 된다. [[feedback_ui_engine_dual_truth_avoidance]]
- **API 미경유** — 이 두 함수는 UI 프리뷰와 엔진 양쪽이 직접 부른다. 14 동기화 지점 불필요.

---

## 7. Phase 분해

| Phase | 내용 | verify |
|---|---|---|
| **A** | ✅ 공용 원자 `StatementTable` / `StatementRow`(+`description`) / `StatementCalcRow` / `statement-enter-nav` 신설. `cols: Column[]` 계약(§4.2.2) | `npx tsc --noEmit` 0건 |
| **B** | ✅ 엔진 echo 4필드 (§6) | `npx vitest run __tests__/tax-engine/stock-transfer/postlisting-yearcolumn-export-regression.test.ts __tests__/tax-engine/stock-transfer/post-listing-detail.*` — **산식 무변동 단언이 이 파일 `:31~56`에 이미 있다**(F-8) |
| **C** | ✅ **완료 (2026-09-11)** — ST-1~5 선작성 | **실측: `4 failed | 1 passed`** — ST-1·2·4·5 실패(구별력 실증) / **ST-3 통과(보존 anchor — §7.3)**. ST-5는 `getByRole("table")`에서 실패 = 현행에 `<table>` 부재의 직접 증거 |
| **D** | ✅ `PostListingNetIncomeStatement` 표 전환 **+ `EstimatedUnlistedNetIncomeStatement` wrapper 전환**(§3.4) — 3분기 보존(§4.2.2) | Phase C anchor 통과 · `tsc` 0건 |
| **E** | ✅ `PostListingNetAssetStatement` 표 전환 **+ `EstimatedUnlistedNetAssetStatement` wrapper 전환** — §4.2 + §4.2.1 매핑표 전 항목 | anchor 통과 (자산/부채 rowSpan · (가)·(나) 소계) |
| **F** | ✅ 사업연도 연도 필드 ①②③⑤ (§5) + §4.7 후보 칩 | **ST-6**(헤더 읽기·쓰기) · **ST-7**(ni/na가 «한 벌»을 공유) 신규 |
| **F′** | ✅ **`YearColumn` export 회귀 anchor 갱신**(§3.4) — 단언을 「export가 있다」→「wrapper가 표를 N열로 렌더한다」로 | `postlisting-yearcolumn-export-regression.test.ts` 4건 통과 |
| **G** | ✅ 셀렉터 갱신 — E2E·anchor 2건을 `data-testid` 축(`cellInput`)으로. 🔴 **fallback 제거는 «철회»했다 — §7.4** | E2E **2 passed** |
| **H** | ✅ 회귀 + 구현 후 probe | **전체 1,981파일 20,738건 통과** · tsc 0 · lint 0 error · 폰트·톤 게이트 0건 · P-5·P-6 구별력 확인 |

> **D·E에 wrapper 전환을 묶은 이유**: `YearColumn`이 사라지는 순간 EU wrapper가 컴파일 불가가 된다.
> 별도 Phase로 미루면 중간 상태에서 `tsc`가 깨져 Phase 경계의 verify가 성립하지 않는다.

### 7.0 채택 항목 ↔ Phase 커버리지 (누락 방지)

| 항목 | 내용 | Phase |
|---|---|---|
| C-1 | 완전 격자 | A |
| C-2 | 라벨 1열 공유 | A · D · E |
| C-3 | 사업연도 연도 헤더 | **F** |
| C-4 | (A)·(B) / (가)·(나) 소계 행 | **B**(echo) → D · E |
| C-5 | 17·21·24 / 18·20 결과 행 통합 | D · E |
| C-6 | 계산 행 회색 | A |
| C-7 | rowSpan 그룹 라벨 | A · D · E |
| C-8 | 「비업무용토지 취득세 (현행 삭제)」 비활성 행 | **D** (순손익 전용 — 순자산에는 해당 행 없음, §4.2.1) |
| C-9 | 행 20 라벨 승격 + hint 흡수 | **D** (§4.3.1) |
| C-10 | 후보 드롭다운 | **F** (§4.7) |
| C-11 | 계산 행 금액 정렬 | A (§4.3.2) |
| X-1·X-2 | 법령 라벨 현행 유지 | D — **행 23 `description` 보존이 실체**(§4.3.1) |
| §2.3 | 0 하한 안내 + 조문 모달 · 음수 입력 | D · E |

### 7.1 파일 크기

현행 241 / 262줄. 표 전환으로 증가가 예상되므로 **행 정의 상수를 별도 파일로 분리**한다
(`net-income-rows.ts` · `net-asset-rows.ts`). 트리거 800 · 착지 ≤700 정책.

### 7.2 mutation probe 레지스터 (P-n)

#### 착수 전 — 실행 완료 (2026-09-11)

| ID | 무력화 대상 | 결과 | 판정 |
|---|---|---|---|
| **P-1** | `FieldCard`의 `data-slot="field-card"` | 21파일 188건 중 **10건 실패** — 전부 취득1개월표·대주주블록 | 🔴 **이 두 계산서의 안전망은 0건** ⇒ Phase C anchor 필수 (§3.3) |
| **P-2** | `PostListingNetAssetStatement`의 `export function YearColumn` → `function` | **1건 실패**(export 확인 케이스) | ✅ 안전망 실재 ⇒ Phase F′ 필수 (§3.4) |

> 기준선 21파일 188건 전건 통과 · 복원 후 22파일 192건 전건 통과로 **probe 잔재 0** 확인.
> 복원은 `cp` 백업으로 했다 — `git checkout`은 커밋 안 된 작업 변경분을 날린다
> ([[feedback_mutation_probe_git_checkout_destroys_wip]]).

#### 구현 후 — 신규 anchor 구별력 검증 ✅ 실행 완료 (2026-09-11)

| ID | 무력화 대상 | 결과 |
|---|---|---|
| **P-5** | `NI_RATE_ROW.description` 키를 무력화 | ✅ **ST-3만 실패** (4 passed) — X-1 보존 anchor가 실제로 그 문구를 지킨다 |
| **P-6** | echo `addTotalA`를 `0` 고정 | ✅ **ST-1만 실패** (4 passed) — 값 축까지 과녁에 맞는다 |
| P-3·P-4 | (A) 행 제거 · 라벨 열마다 반복 | **Phase C의 전환 «전» 실패가 같은 것을 이미 증명** — ST-1·ST-2가 전환 전 구조에서 실패했다(§7 Phase C 행). 별도 mutation 불요 |

> 🔑 **P-6은 anchor 보강을 낳았다.** 초판 ST-1은 「(A)·(B) 행이 렌더된다」만 단언해
> echo가 0으로 고정돼도 통과했다. ⇒ **값 단언을 추가**했다(105,000,000 / 5,000,000 / 100,000,000).
> 「행이 있다」와 「값이 맞다」는 다른 단언이다.

### 7.4 🔴 P-1 해석 정정 — fallback은 «의도된 설계»였다 (2026-09-11)

자가 검토(§3.3)는 P-1 결과를 **「이 두 계산서의 안전망이 0건」**으로 읽고, Phase G에서
`inputByLabel`의 `?? hits[0].parentElement!` fallback 제거를 **필수**로 못박았다. **틀렸다.**

제거하고 돌리자 **9건이 즉시 실패**했다(`EstimatedUnlistedBlock`·`FaceValueBlock`·
`MonthlyAccrual81Section` 계열). 그 함수의 **바로 위 주석**이 이미 두 구조를 밝히고 있었다:

```
 * - FieldCard: `<div data-slot="field-card">` 안에 `<label>`과 입력이 함께 있다.
 * - CurrencyInput 자체 라벨: `<div class="space-y-1.5">` 안에 `<label>`과 입력이 «형제»다.
```

⇒ fallback은 **둘째 구조를 위한 갈래**였다. P-1에서 이 파일이 통과한 것은 「단언이 무의미해서」가
아니라 **그 갈래로 여전히 올바른 input을 찾았기** 때문이다.
P-1이 증명한 것은 「이 파일이 `data-slot` 속성에 의존하지 않는다」까지다.

> **교훈**: mutation probe가 「통과」를 보이면 두 해석이 있다 — ⓐ 안전망이 없다,
> ⓑ **다른 경로로 여전히 지키고 있다**. ⓐ로 단정하기 전에 그 코드의 주석·설계 의도를 읽어야 한다.
> [[feedback_deliberate_design_looks_like_the_defect]]

⇒ **fallback은 원복했다.** 표 전환으로 실제로 닿지 못하게 된 케이스는 `data-testid` 축
(`cellInput`)으로 옮겼다 — 구조가 바뀐 곳만 셀렉터를 바꾼다.

> **부정형 단언에 대응**: §6 「산식 불변」 → Phase B의 기존 단언(`:31~56`)이 그대로 게이트다.
> §3.2 「결과 화면 미재현」 → 정적 grep으로 확정(재현 지점 0건)이라 mutation N/A.
> [[feedback_negative_assertion_needs_mutation_probe]]

### 7.3 Phase C anchor — ID 부여

| ID | 단언 | 대응 probe |
|---|---|---|
| **ST-1** | 순손익 표에 「(A) 가산할금액 합계」·「(B) 공제할금액 합계」 행이 렌더된다 | P-3 |
| **ST-2** | 행 라벨(예: 「1. 각 사업연도 소득금액」)이 표 전체에 **정확히 1회** 나온다 | P-4 |
| **ST-3** | 행 23 보조 줄에 「시행규칙 정액」이 남아 있다 (X-1 실체) | P-5 |

> 🔑 **ST-3은 「보존 anchor」다 — 초판 정정.** Phase C 설명은 세 단언이 모두 「**실패**해야 정상」
> 이라고 적었다. **불완전했다** — ST-3이 지키는 문구는 **현행 `hint`에 이미 있어** 작성 시점에
> 통과한다(실측 2026-09-11). 지키려는 것은 「새 구조를 요구한다」가 아니라 **「표로 옮기면서
> 흘리지 않는다」**이므로 전환 전후 **둘 다 초록**이 정상이다.
> 구별력은 실패가 아니라 **P-5**(`description` 제거 → ST-3만 실패)로 증명한다.
| **ST-4** | 순자산 표에 「(가) 자산총계」·「(나) 부채총계」 행이 렌더된다 | P-3 |
| **ST-5** | `cols` 1개이면 값 열이 1개만 렌더된다 (§4.2.2) | — |
| **ST-6** | 열 헤더 사업연도가 폼 값을 읽고 쓴다 (Phase F 추가) | — |
| **ST-7** | 순손익·순자산이 «같은» 사업연도 필드를 공유한다 (§5.1) | — |

> ST-2는 **부정형이 아니라 계수 단언**이다 — 「1회」를 단언하므로 라벨을 열마다 반복하면
> (= 초판 구조) 반드시 실패한다. 「없다」로 쓰면 구별력이 약해진다.
> [[feedback_negative_anchor_needs_positive_twin]]

> **Phase C를 D보다 먼저 둔 이유**: anchor가 «지금은 실패»해야 구별력이 증명된다.
> 구현 후에 쓰면 무엇을 지키는지 알 수 없다. [[feedback_pre_anchor_verification]] ·
> [[feedback_negative_anchor_needs_positive_twin]]

---

## 8. 미검증 항목 (V)

| # | 항목 | 현재 상태 | 조치 |
|---|---|---|---|
| **V-1** | C-8 "비업무용토지 취득세" 행의 법령 근거 | ✅ **해소 (2026-09-11)** — KoreanLaw MCP로 **현행 상증령 §56④ 전문 실측**: 가산 1호 가~마, 차감 2호 가~마 **어디에도 해당 항목이 없다**. 반면 **삭제 연도 "2002"는 검증되지 않았다** — 과거 시행본 조회에는 실재 시행일자가 필요한데(`feedback_korean_law_historical_efyd_unavailable`) 원본 PDF가 로컬에 없어(실측: `find` 0건) 특정할 근거가 없다 | **결정(사용자, 2026-09-11)**: 행은 재현하되 **연도를 표기하지 않는다**. 라벨 = 「비업무용토지 취득세 (현행 삭제)」 — 검증된 사실만 화면에 단정한다. [[feedback_no_statute_claim_needs_requirement_article]] · [[feedback_unverified_authority_blocks_tax_change]] |
| **V-2** | 그룹 `rowSpan` 범위 — "소득에서 공제할 금액"이 **5~16 전체**인가 | ✅ **해소 (사용자 확정 2026-09-11)** — **행 5(벌금·과료) ~ 16(지방소득세 총결정세액)**. 캡처로는 가를 수 없었다(`rowSpan` 글자가 세로 «중앙»정렬이라 5~16의 중앙 10~11과 9~16의 중앙 12~13이 비슷하게 보인다) | **구현이 이미 그 값이었다** — 변경 없음. `net-income-rows.ts`의 `SUB_GROUP_ROWS = 13`(5~16 + 삭제 행). 채택 근거였던 「(B) 공제할금액 합계 (5 + … + 16)」가 맞았다 |
| **V-3** | 이미지 7 "10. 접대비한도초과액" — 현행 법령 용어는 **"기업업무추진비"**(`besshi-form-constants.ts:311` ⑯) | 현행 코드도 "접대비"(`PostListingNetIncomeStatement.tsx:69`)를 쓴다 — **이미지 7과 현행이 같이 구판** | **이번 범위 밖**(사용자 결정은 라벨 2건 한정). 기록만 남긴다 |

## 9. 사용자 결정 필요 (Q)

| # | 질문 | 결정 |
|---|---|---|
| **Q-1** | C-10 행 20 **드롭다운의 선택지** | ✅ **확정 (사용자, 2026-09-11)** — **발행주식 총수 + 상대 계산서 값** 둘 다. 설계는 §4.7. 이미지 7은 `1,253,600 ▼`로 양쪽 열 동일하나 목록 자체는 화면에 열려 있지 않아 원본으로는 확정 불가였다 |

> 착수를 막는 미결 항목은 **없다**.

---

## 9.1 자가 검토 verdict — **clean** (2026-09-11)

| 게이트 | 결과 |
|---|---|
| 미해소 Critical / High | **0건** — F-1(Critical) · F-2·F-3·F-4·F-5·F-11(High) 전건 반영 |
| 재검토(STEP 3) newIssues | 3건 발견 → 전건 반영(C-11 범위 모순 · §4.1 2열 잔존 · 참조 누락) |
| 문서 내부 정합(STEP 10) | 인용 오차 **13건** 실측 정정 · C-n↔Phase 커버리지표 신설 · anchor ID 부여 |
| mutation probe | P-1·P-2 **실행 완료** (§7.2) |
| V-n | V-1 ✅해소 · V-2 ✅**해소(2026-09-11 사용자 확정 — 구현값이 맞았다)** · V-3 범위 밖(용어 개명, 이번 변경으로 나빠진 것 없음) |
| Q-n | Q-1 ✅확정 |

⇒ **착수 가능.** 다음: `pre-do-anchor-verification`(Phase C, ST-1~5 선작성) →
`single-response-do-execution`.

---

## 9.2 구현 중 드러난 정정 (2026-09-11 Do)

계획서가 «착수 전»에는 알 수 없었던 것들. 조용히 고치지 않고 남긴다.

| # | 초판 | 실측 | 조치 |
|---|---|---|---|
| D-1 | §3.4가 `YearColumn` 소비처를 **EU wrapper 2개**로 적었다 | **테스트 2개도 직접 import**한다 — `unlisted-deficit-negative.anchor.test.tsx:23` · `unlisted-valuation-preview-single-source.anchor.test.tsx:23` | Phase G에서 함께 전환 |
| D-2 | §4.3.2가 「공용 `BesshiRow` 재사용 우선」 | **재사용 불가** — `FilingFormRow` 타입에 묶인 **읽기 전용** 렌더러라 입력 셀이 들어가지 않는다 | 금액 정렬 **클래스 문자열만** 같은 값 사용(`AMOUNT_CELL_CLASS`) |
| D-3 | ST-2를 `"1. 각 사업연도 소득금액"` 한 문자열로 단언 | 행 번호는 `font-mono` 정렬 때문에 **별도 `<span>`** — 한 텍스트 노드가 아니다 | 축을 **라벨**로 좁혔다. anchor가 지키는 것은 라벨 중복 제거이지 번호 표기 방식이 아니다 |
| D-4 | `<caption>`으로 표 이름 부여 | caption은 DOM에 **텍스트**로 남아 카드 제목과 같은 문구면 `getByText`가 2건을 잡는다(실측 3건 실패) | `aria-label`로 교체 |
| D-5 | 계획서에 **다크모드·`÷` 게이트 언급 없음** | `dark-mode-bg-policy`(흰 배경 토큰에 `dark:` 짝 필수) · `literal-division-render`(리터럴 `÷` 금지, `<Frac>`이 정본) **둘 다 래칫 게이트**라 예외 추가 불가 | 다크 짝 전면 부여 + 계산 행 라벨을 `<Frac>`으로. `StatementCalcRowSpec.label`을 `ReactNode`로 확장 |
| D-6 | — | `dark-mode-bg-policy` 게이트는 **주석 안의 클래스 문자열도 잡는다** | 설명 주석에서 그 토큰을 풀어 썼다 |
| D-7 | §4.2.2가 그룹 열 유무만 다뤘다 | 그룹 «밖» 행(행 1·소계·결과)은 **라벨 셀이 2열을 덮어야** 값 열이 밀리지 않는다 | `StatementInputRow.inGroup` + `labelColSpan` 도입 |

> **D-5가 가장 컸다.** 전환 «전» 코드는 이미 `<Frac top="17" bottom="20" />`을 쓰고 있었는데,
> 표 라벨을 원본 서식 문구("17 ÷ 20")로 옮기면서 **내가 리터럴 `÷`로 후퇴시켰다**.
> 게이트가 그것을 잡았다 — 원본 재현과 프로젝트 표준이 충돌할 때 **표준이 이긴다**
> (`÷` 게이트도 「늘리지 않는다」 래칫이다).

---

## 10. 비목표

- 결과 화면·PDF에 계산서를 재현하는 것 (§3.2 — 현재도 없다)
- simple 모드(`PostListingValuationCard` 1주당 값 직접 입력) 레이아웃 변경
- 행 구성·법령 인용 변경 (X-1·X-2 유지, V-3 범위 밖)
- 상속·증여 v2 컴포넌트 변경 (별도 도메인)

---

## 11. 참조

- 원본 PDF 재현 계획: `docs/00-pm/stock-transfer-post-listing-pdf-replica.plan.md`
- 결손 음수 입력: `docs/00-pm/post-listing-deficit-negative-input.plan.md`
- 공식 양식 상수(참고): `components/calc/inheritance/unlisted-stock-v2/besshi/besshi-form-constants.ts:283~341`
- UI 정책 단일 소스: `components/calc/CLAUDE.md` (톤 replica 예외 · 라벨 타이포 · 금액 정렬 · SelectOnFocusProvider)
- 형제 경로 표 구현: `FiscalYearAdjustmentTable.tsx` · `NetAssetCalculationTable.tsx` · `besshi/Page6NetIncomeBreakdown.tsx`

### 11.1 자가 검토 이력

**2026-09-11 `plan-design-self-review-loop` v4 (L2)** — STEP 0~4 + 10~11 수행.
findings 11건(Critical 1 · High 5 · Medium 4 · Low 1) 전건 반영. mutation probe P-1·P-2 실행.

| 판정 뒤집힘 | 내용 |
|---|---|
| 1 | §3.3 「fallback이 삼킬 수 **있다**」(추정) → **P-1로 「이 두 계산서의 vitest 안전망은 0건」 확정** |
| 2 | §4.5 셀렉터 축을 **발명**하려 했으나 `CurrencyInput`이 `data-testid`·`hideLabel`(「테이블 좌측 셀」 명시)을 **이미 제공** |
| 3 | 초판이 `YearColumn` export 회귀 anchor를 **통째로 누락** → P-2로 실증, Phase F′ 신설 |

> **STEP 5~9·12~13(별도 design.md) = N/A.** v4 산출물 게이트 조건 2(UI 위젯 5개 이상 신설)
> 미충족 — 신설 원자는 4개다. 조건 1·3은 계획서가 행 구성표·원자 계약·스타일 제약·Phase·probe를
> 모두 담고 있어 별도 문서가 중복이 된다. 「문서를 위한 문서를 만들지 않는다」.
