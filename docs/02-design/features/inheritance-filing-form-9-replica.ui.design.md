# 별지 제9호서식 「상속세과세표준신고 및 자진납부계산서」(앞쪽) — UI 디자인

> Plan: [`docs/00-pm/inheritance-filing-form-9-replica.plan.md`](../../00-pm/inheritance-filing-form-9-replica.plan.md)
> 선례: 증여세 별지10호 `GiftTaxFilingFormTable` / `gift-tax-filing-form-besshi10.ts` · besshi 격자 `Page1CoverSection`
> 아키텍처: **Option A — `lib/calc/filing-form-9-data.ts` 어댑터(엔진 변경 0)**, 계산 행은 `FilingFormRow[]`로 산출해 공용 `BesshiRow` 재사용.

---

## §0 개요·범위

- **목표**: 이미지1 별지9호 앞쪽 1장 **구조 100% 재현**(식별정보 3블록 + 계산 표 좌/우 + 확인·서명 + 하단 제출서류·동의서). 칸 번호 ①~㊷ `data-testid` 동결.
- **데이터**: 전부 `buildFilingForm9Data(result, heirs, deathDate)` 단일 어댑터에서. 화면·PDF 공유 → 재계산 0, dual-truth 0.
- **출력**: 화면 격자(`FilingForm9CoverSection`) + react-pdf(`InheritanceFilingForm9PdfDocument`).
- **렌더 가드**: `result.heirAllocationResult && heirs && heirs.length > 0` (= `HeirAllocationSummaryTable`).

---

## §1 케이스 인벤토리 (필수 — Do 진입 전 전수 enumerate)

> 양식 렌더가 분기하는 입력 조합. 각 케이스는 anchor 1건 이상. ✅=표시, —=빈칸/0, ▢=수기 빈칸.

| # | 케이스 | ㉓ 세대생략 | ㉟ 영리법인면제 | ㉙ §28 증여세액공제 | 식별정보 | 렌더 | anchor |
|---|---|---|---|---|---|---|---|
| C-1 | **종합사례(이미지1·2)** — 공동상속+세대생략+영리법인 사전증여 | ✅ 30,232,198 | — (영리법인분=사전증여→㉙) | ✅ 592,000,000 | 도출+▢ | 전체 | FF9-1~18 |
| C-2 | **최단순** — 단독/공동, 세대생략·영리법인·사전증여 없음 | — | — | — | 도출+▢ | ㉓㉟㉙ 0/빈, ㉗=㉝만 | CI-MIN-1 |
| C-3 | **세대생략 only** — 손자녀 상속(§27) | ✅ | — | — | 도출+▢ | ㉓>0·㉔=㉒+㉓ | CI-GS-1 |
| C-4 | **영리법인 유증(§3의2②)** — 유증 → ㉟ 면제 발동 | 케이스별 | ✅ ㉟ 면제세액·유증재산가액·면제분납부세액 활성 | C-1과 별개(유증분 ㉟) | 도출+▢ | 우측 영리법인면제 블록 활성 | CI-CORP-1 (FF9-16/17) |
| C-5 | **사전증여 only** — §28 공제, 세대생략·영리법인 없음 | — | — | ✅ | 도출+▢ | ㉙>0 | CI-GIFT-1 |
| C-6 | **heirs 없음 / heirAllocationResult 없음** | — | — | — | — | **섹션 미렌더**(가드) | CI-GUARD-1 |
| C-7 | **비거주자 피상속인** | 케이스별 | 케이스별 | 케이스별 | ⑨ 거주구분 ▢ | 전체(⑨ 수기) | (C-1 변형) |
| C-8 | **분납/연부연납 신청**(전 케이스 공통) | — | — | — | — | ㊴㊵㊶㊷ **금액 ▢·일자 도출** | CI-PAY-1 |

**케이스 교차**: C-3·C-4·C-5는 C-1에서 단일 인자만 켠 부분집합. C-7·C-8은 전 케이스에 직교(orthogonal)로 중첩.

**V-2 선행 가설 (사전증여 vs 유증 구분)**: 영리법인이 받은 것이 **사전증여**면 §28 증여세액공제(⑩c → ㉙)에 계상·㉟ 면제 0; **유증**이면 §3의2② 면제(㉟)에 계상. 이미지1(㉙=592,000,000·㉟=공란)은 영리법인분이 **사전증여**(㉙)인 케이스로 정합 → C-1의 ㉟=— 가 설명됨. Pre-Do probe(V-2)로 `corporateExemption.amount`가 사전증여 §28인지 유증 §3의2②인지 확정 후 ㉙/㉟ 매핑 잠금.

---

## §2 폼 레이아웃 명세 (cell-by-cell)

### §2.1 헤더
- 제목 `상속세과세표준신고 및 자진납부계산서` + `[별지 제9호서식] (개정일 V-6)` + `(앞쪽)`.
- `관리번호` ▢ / 신고구분 `[ ]기한 내 [ ]수정 [ ]기한 후` — 체크 ▢ (수기).

### §2.2 식별정보 3블록 (border-black 격자)

| 블록 | 칸 | 값 | testid |
|---|---|---|---|
| 신고인 | ① 성명 | `data.declarant.name`(도출, 없으면 ▢) | `ff9-①` |
| | ② 주민등록번호 | ▢ | `ff9-②` |
| | ③ 전자우편 | ▢ | `ff9-③` |
| | ④ 주소 | ▢ | `ff9-④` |
| | ⑤ 피상속인과의 관계 | `data.declarant.relationLabel`(관계 라벨 맵, ⚠️ `labelOf` 금지) | `ff9-⑤` |
| | ⑥ 전화번호 | ▢ | `ff9-⑥` |

관계 라벨 맵(⑤): spouse→배우자 · child→**자** · lineal_ascendant→직계존속 · sibling→형제자매 · other→기타 · legatee→수유자 · corporate→영리법인 (이미지1 ⑤="자" 표기 우선). 신고인 블록 우측 `사후관리위반신고` 칸 ▢(수기).
| 피상속인 | ⑦ 성명 / ⑧ 주민번호 / ⑩ 주소 | ▢ | `ff9-⑦·⑧·⑩` |
| | ⑨ 거주구분 | ▢ (체크) | `ff9-⑨` |
| | ⑪ 상속원인 | `[V]사망` 기본(deathDate 有) | `ff9-⑪` |
| | ⑫ 상속개시일 | `data.deathDate`(YYYY-MM-DD) | `ff9-⑫` |
| 세무대리인 | ⑬~⑯ | ▢ | `ff9-⑬`~`ff9-⑯` |

### §2.3 계산 표 좌측 (⑰~㉞) — `FilingFormRow[]` column="left", 공용 `BesshiRow` 렌더

순서·라벨·소스는 Plan §2.2 1:1. ㉘는 `display:"header"` 그룹 + ㉙㉚ 들여쓰기 종속행. ㉑ 세율은 `display:"rate"`(formula="50%"). testid `ff9-⑰`~`ff9-㉞`.

### §2.4 계산 표 우측 — `FilingFormRow[]` column="right"

> ⚠️ 우측 칸 번호(㉟~㊷)는 **V-6(면제분 납부세액 칸 번호·㉟ OCR 중복) 확정 후 동결** — 아래는 이미지1 OCR 기준 잠정.

- 영리법인면제 블록: `유증등 재산가액` / ㉟ `면제세액(§3의2②)` / 면제분 납부세액 (칸번호 V-6). C-4에서만 값, 그 외 —.
- ㊱ 신고불성실가산세 ▢ / ㊲ 납부지연가산세 ▢.
- ㊳ `납부할세액(합계액)` = `data.b43`(=finalTax) **강조**. testid `ff9-㊳`. 산식 라벨(㉔+㉕−㉖−㉗+㉟+㊱+㊲)은 **표시 전용 텍스트**, 값은 finalTax 직접(재계산 아님).
- 납부방법 헤더(`display:"header"`) + ㊴연부연납 ㊵물납 ㊶분납 ㊷신고납부 — **금액 ▢, 일자 도출**(㊶ 분납기한·㊷ 신고기한). testid `ff9-㊴`~`ff9-㊷`.

### §2.5 확인 문구·서명란
- "위 내용을 충분히 검토하였고 …" 정적 문구 + 날짜 `YYYY년 M월 D일`(=신고기한 도출) + 신고인 서명란 ▢ + 세무대리인 서명란 ▢ + `___ 세무서장 귀하` ▢.

### §2.6 하단 (정적 상수)
- 제출서류 5종(부표 1~5) / 담당공무원 확인사항 2종 / 수수료 없음 / 행정정보 공동이용 동의서 문구. `filing-form-9-constants` 상수.

---

## §3 데이터 바인딩 — `buildFilingForm9Data` 반환 형태

```ts
interface FilingForm9Data {
  values: Record<string, number>; // 박스번호("⑰")→금액. Plan anchor bNN = values["box"]. rows는 이로부터 빌드
  // 계산 행 (BesshiRow 공유)
  leftRows: FilingFormRow[];   // ⑰~㉞
  rightRows: FilingFormRow[];  // 영리법인면제~㊷
  // 식별정보 도출
  declarant: { name: string; relationLabel: string } | null; // sortHeirs(heirs)[0]
  deathDate: string;           // ⑫ YYYY-MM-DD
  inheritanceCause: "death";   // ⑪ 기본 (실종·인정사망·기타는 수기 ▢)
  // 날짜 도출
  filingDueDate: string;       // ㊷ 신고기한 (말일+6개월)
  installmentDueDate: string;  // ㊶ 분납기한 (+2개월)
  // 영리법인 (C-4)
  hasCorporateExemption: boolean;
  corporateBequestValue?: number; // 영리법인 유증등 재산가액 (C-4, V-2/V-6)
}
```

- 금액 소스: Plan §2.2·2.3 표. `result.*` 직접 + `buildSummaryTable` 합계열(⑩c·⑫c·⑭).
- ㉗ = ㉘ + ㉝ (양식 자체 합산, FF9-10 고정값 623,971,966).
- ㉟ = `result.corporateExemption?.amount ?? 0` — `CorporateExemptionSection`와 동일(FF9-17).

---

## §4 testid 맵 (동결 — 변경 시 anchor 동시 수정)

`ff9-①` … `ff9-⑯`(식별정보) · `ff9-⑰` … `ff9-㉞`(좌) · `ff9-㉟`·`ff9-㊱`·`ff9-㊲`·`ff9-㊳`·`ff9-㊴`~`ff9-㊷`(우). 루트 `ff9-cover-section`. **우측(㉟~㊷) 번호는 V-6 확정 후 동결(잠정)**.

---

## §5 besshi 격자 스타일
- `<table className="border-collapse border border-black text-[10px]">`, 라벨 셀 `bg-gray-100`. Tailwind utility 직접(외부 CSS 금지).
- 펼침 토글 `ExpandToggleButton` + `hidden print:block`(print-only-css-toggle), `print:bg-white print:text-black`.
- 빈칸 셀은 빈 `<td>` (자동 채움 0).
- 금액 콤마·**"원" 미표기**([[feedback_no_won_suffix]]). 0은 "0", 구조적 미배부는 빈칸.

---

## §6 PDF 명세 (`InheritanceFilingForm9PdfDocument`)
- `@react-pdf/renderer` + `besshi-pdf-styles`(`C`,`s`) + `registerFonts()` per-glyph fallback.
- `filing-form-9-constants` 라벨 공유. 데이터는 동일 `buildFilingForm9Data`.
- 기존 상단 `window.print()`와 별개 — `FilingForm9PdfDownloadButton`(dynamic import `ssr:false`).
- PDF는 동일 `buildFilingForm9Data` 소비 → 데이터 anchor가 PDF 값도 커버. 버튼 렌더·다운로드만 E2E(픽셀 비교 아님).

---

## §7 재사용 — `BesshiRow` 추출
- `GiftTaxFilingFormTable`의 `BesshiRow`(번호·라벨·formula·display 4종·column)를 `components/calc/results/shared/BesshiRow.tsx`로 추출 → 9호·10호 공유. gift는 **import 1줄만** 공용 `BesshiRow`로 변경(렌더 동작 무변경).
- 식별정보·푸터 블록은 gift 미보유 → 신규.

---

## §8 동기화 지점 (출력 전용 — 8개 중 ⑦만)
①②③④⑤⑥⑧ **N/A**(입력 필드 0). **⑦ 결과 카드**: 본 섹션 + PDF. 엔진 input/result 변경 0. (components/calc/CLAUDE.md 8지점 기준)

---

## §9 anchor ↔ testid 매핑 (Plan §8 ↔ 디자인)

| Plan anchor | 대상 | 디자인 |
|---|---|---|
| FF9-1~11 | ⑰~㊳ 값 | §2.3·2.4 / §3 |
| FF9-12 | ㊳ 산식(면제0) | §3 ㉗·㊳ |
| FF9-13·14 | 신고/분납기한 도출 | §3 filingDueDate·installmentDueDate |
| FF9-15 | 대표상속인 도출 | §3 declarant |
| FF9-16·17 | 영리법인 이중계상·㉟ 단일출처 | C-4 / §3 ㉟ |
| FF9-18 | ⑳ 산식 | §3 |
| 화면 anchor | testid ①~㊷·라벨·print | §2·§4·§5 |
