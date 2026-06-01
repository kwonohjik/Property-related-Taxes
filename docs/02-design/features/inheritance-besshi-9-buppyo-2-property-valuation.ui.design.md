# 별지 제9호서식 부표 2 「상속인별 상속재산 및 평가명세서」 — UI 디자인 (A4 가로 + 가로 스크롤)

> 계획서: `docs/00-pm/inheritance-besshi-9-buppyo-2-property-valuation.plan.md`
> 엔진/데이터 설계: `inheritance-besshi-9-buppyo-2-property-valuation.engine.design.md`
> 근거: KoreanLaw MCP `get_annexes` (별지 제9호서식 부표 2, 개정 2024.3.22.)
> 선례: `inheritance-filing-form-9-replica.ui.design.md` · 증여 `GiftTaxValuationFormTable`

## §0 개요·범위

상속세 결과 화면에서 **각 상속인별 1장(N장)** 부표 2를 화면 토글 + PDF로 출력. **A4 가로(landscape)** + 나 섹션 하단 **가로 스크롤바**(`HorizontalScrollContainer`). 엔진·입력 변경 0 — 출력 전용. 데이터는 `buildBuppyo2Data` 반환만 소비.

---

## §1 케이스 인벤토리 (UI 시나리오 — Do 진입 전 전수)

| # | 시나리오 | heirs | estateItems / priorGifts | 화면 렌더 | testid 검증 |
|---|---|---|---|---|---|
| S-1 | 배우자 단독, 전체 협의분할 | 1 | 주택1 | 1장. 가 1행·나 1행+빈7행·계 합계=주택 | `buppyo2-sheet-0`, `buppyo2-na-row-1-amount` |
| S-2 | 배우자+자녀2, **협의분할 미입력** | 3 | 주택·예금·주식, allocations=[] | 3장. 나 데이터행 0(빈8행)·계=엔진 fallback·**안내 배지** | `buppyo2-sheet-{idx}-fallback` |
| S-3 | 배우자+자녀1+수유자, 일부 입력 | 3 | 일부 allocations | 수유자 장 가 관계="수유자"·법정지분율 공란·나 매칭분만 | `buppyo2-ga-legal-ratio`(공란) |
| S-4 | 자녀3+영리법인(사전증여 受) | 4 | priorGift(corporate) | 법인 장 본래 0행·나 사전증여 A22 행·계 가산증여 | `buppyo2-na-row-1-code1`="A22" |
| S-5 | 배우자+자녀2, 사전증여(상속인 受) | 3 | estate + priorGift | 본래 행 + 나 사전증여 A21 행 + 계 A21 (나↔계 동일소스) | `buppyo2-kye-row-prior_gift_13` |

행≥1 충족. 사용자 추가 시나리오 → 먼저 행 추가.

---

## §2 폼 레이아웃 명세 (cell-by-cell)

각 시트(`Buppyo2HeirSheet`) = 상속인번호 헤더 + 가·나·계 3블록. border-black 격자. text-[11px].

### §2.1 헤더
- `BP2_FORM_TITLE` "상속인별 상속재산 및 평가명세서" + `BP2_FORM_SUBTITLE` "[별지 제9호서식 부표 2] (개정 2024.3.22.)" + "(앞쪽)"
- 상속인번호: `상속인 ①` ~ (idx+1, 원숫자). PDF 다운로드 버튼은 섹션 최상단(`print:hidden`).

### §2.2 가. 상속인별 상속현황 (1행 8칼럼, 가로 스크롤 불필요)
| 칸 | 라벨 | 값 소스 | 공란 시 |
|---|---|---|---|
| 1 | 피상속인과의 관계 | `sectionA.relation` (HEIR_RELATION_TO_DECLARANT_LABEL) | — |
| 2 | 성명 | `sectionA.name` | 미입력 시 `&nbsp;` (heir명 — 자산 id 우려 없음) |
| 3 | 주민등록번호 | `sectionA.residentId` | `&nbsp;` |
| 4 | 주소 | `sectionA.address` | `&nbsp;` |
| 5 | 법정상속지분율 | `sectionA.legalShareLabel` ("1/3") | legatee·corporate → `&nbsp;` |
| 6 | 법정상속재산가액 | `sectionA.legalShareAmount` (금액칸) | null → `&nbsp;` |
| 7 | 실제상속지분율 | `sectionA.actualShareRatio` (%) | — |
| 8 | 실제상속재산가액 | `sectionA.actualShareAmount` (금액칸) | — |

협의분할 미입력 시 6·8 = 엔진 법정상속분 fallback값 + 시트 상단 `buppyo2-sheet-{idx}-fallback` 안내(amber).

### §2.3 나. 상속인별 상속재산명세 (10칼럼 — `HorizontalScrollContainer` 内)
`itemRows`(본래상속 A11/A12 → 사전증여 A21~A24 순) 렌더 + 빈 행 padding(최소 8행). 빈 행 셀 `&nbsp;`, testid `buppyo2-na-row-empty-{i}`.

| col | 라벨 | 값 | 폭 | 정렬 |
|---|---|---|---|---|
| 1 | 재산구분코드 | `kindCode` | 22mm | center |
| 2 | 재산종류코드 | `typeCode`+라벨 | 28mm | center |
| 3 | 국외자산 여부 | `[ ]여 [ ]부` (isOverseasAsset 체크) | 18mm | center |
| 4 | 국외재산 국가명 | `overseasCountry` | 22mm | center |
| 5 | ⑪ 소재지·법인명등 | `locationOrName` | flex | left |
| 6 | 사업자등록번호(계좌번호,지분) | `ownershipShareLabel` | 34mm | center |
| 7 | 수량(면적) | `quantityOrArea` | 22mm | right |
| 8 | 단가 | `unitPrice` | 26mm | right(금액) |
| 9 | 평가가액 | `valuatedAmount` | 30mm | **right 금액칸** |
| 10 | 평가기준코드 | `valuationMethodCode` | 20mm | center |

표 컨테이너 `style={{ width: "277mm" }}`. 금액칸(8·9) = `text-right font-mono tabular-nums whitespace-nowrap`.

### §2.4 계 (12행, 가로 스크롤 불필요)
`BP2_KYE_ROWS` 12행. 라벨 좌·금액 우. 바인딩(UI 무산술 — 어댑터 값 직접):
- 상속재산가액=`grossEstateValue` / 추정산입액=`presumedAmount`
- 비과세 3종(금양임야·공공단체유증·기타)·과세가액불산입 3종(공익법인·공익신탁·기타) = **공란**(엔진 미분리, D-4)
- 가산증여 §13=`priorGift13`(=A21+A22 어댑터 합산) / 조특§30의5=`priorGift30_5` / 조특§30의6=`priorGift30_6`
- 합계=`total`

### §2.5 하단 (정적)
작성방법 펼침 토글(코드표 3종 — `BP2_*_LABEL` 표) + footer `210mm×297mm`.

---

## §3 데이터 바인딩 — `buildBuppyo2Data` 반환 소비

```tsx
const data = buildBuppyo2Data(result, heirs, estateItems ?? [], priorGifts ?? []);
// data: Buppyo2HeirData[] — heirs.length 장
data.map((heirData, idx) => <Buppyo2HeirSheet key={heirData.heirId} heirData={heirData} idx={idx} />)
```
자체 계산·산식 0 (단일 진실 = 어댑터). `useEffect → store` 미러링 0(출력 전용).

---

## §4 testid 맵 (동결 — 변경 시 anchor 동시 수정)

| testid | 위치 |
|---|---|
| `buppyo2-root` | 섹션 루트 |
| `buppyo2-toggle` | 펼침 토글 |
| `buppyo2-pdf-btn` | PDF 다운로드 |
| `buppyo2-sheet-{idx}` | 상속인 시트 |
| `buppyo2-sheet-{idx}-fallback` | 협의분할 미입력 안내 |
| `buppyo2-ga-{relation\|name\|rrn\|address\|legal-ratio\|legal-value\|actual-ratio\|actual-value}` | 가 8칸 |
| `buppyo2-na-table` / `buppyo2-na-row-{i}-{code1\|code2\|overseas\|country\|location\|bizno\|qty\|unit\|amount\|method}` | 나 표·셀 |
| `buppyo2-na-row-empty-{i}` | 나 빈 행 |
| `buppyo2-kye-row-{key}` | 계 12행 (`BP2_KYE_ROWS[].key`) |
| `hsc-root`/`hsc-scroll`/`hsc-thumb` | 가로 스크롤(공용, 나 섹션) |

---

## §5 격자 스타일 + A4 가로 + 가로 스크롤

- 격자: `border border-black p-1 text-[11px]` (filing-form-9 패턴). 금액칸 `text-right font-mono tabular-nums whitespace-nowrap`(amount-column-align).
- **A4 가로**: 나 섹션만 `<HorizontalScrollContainer hint="← → 좌우 스크롤 또는 thumb 드래그로 모든 컬럼 보기">` 래핑. 가(8칼럼)·계(2칼럼)는 일반 div. `<colgroup>` mm 고정폭(§2.3)으로 표 폭 277mm → 좁은 뷰포트 가로 스크롤 유발.
- 인쇄: 토글 `print:hidden`, 본문 `hidden print:block`(`print-only-css-toggle`), 스크롤 `print:overflow-visible`(내장).
- **라벨 단일 출처**: `relation`은 `HEIR_RELATION_TO_DECLARANT_LABEL`(filing-form-9-data.ts) 재사용 — 신규 `BP2_HEIR_RELATION_LABEL` 신설 **금지**(중복·드리프트 방지).

---

## §6 PDF 명세 (`InheritanceBuppyo2PdfDocument`)

- `lib/pdf/InheritanceBuppyo2PdfDocument.tsx` — 상속인별 `<Page size="A4" orientation="landscape" style={s.page}>`. 1상속인=1+페이지(행 초과 시 react-pdf 자동 wrap, 출력 전용 허용).
- **PDF 나 표 레이아웃**: react-pdf는 `<table>`/`colgroup` 미지원 → flex `View` row + per-cell 고정 `width`(화면 mm 폭을 pt 환산)로 구성(`besshi page6` rowSpan 미지원 → flex-row wrapper 선례). 화면 HTML table과 별도 렌더, 칸 순서·라벨은 동일 상수.
- 글리프 fallback: `besshi-pdf-styles.ts` `fontFamily` 배열 재사용(원숫자·한글). landscape padding ~15.
- `Buppyo2PdfDownloadButton.tsx` = `dynamic(()=>…,{ssr:false})` + `PDFDownloadLink`. 파일명 `상속인별상속재산_부표2_${deathDate || "미상"}.pdf`.
- 화면·PDF 공유 상수 = `besshi-buppyo-2-constants.ts` 단일 출처.

---

## §7 재사용

| 대상 | 출처 |
|---|---|
| 가로 스크롤 | `components/calc/shared/HorizontalScrollContainer.tsx` |
| 금액 칸/행 | `components/calc/results/shared/BesshiRow.tsx` (`BesshiColumn`) |
| 관계 라벨 | `lib/calc/filing-form-9-data.ts` `HEIR_RELATION_TO_DECLARANT_LABEL` |
| 재산구분/종류/평가기준 코드 | `inheritance-filing-form-helpers.ts` 공유 헬퍼(엔진 설계 §공유헬퍼) |
| 화면 토글 + PDF 버튼 | `filing-form-9/FilingForm9CoverSection`·`FilingForm9PdfDownloadButton` 패턴 |
| PDF 스타일 | `lib/pdf/besshi-pdf-styles.ts` |
| 빈 행 패턴 | `GiftTaxValuationFormTable` `emptyRowCount`·`row-empty-{i}` |

---

## §8 동기화 지점 (출력 전용 — 14개 중 ⑤·⑦만)

| 지점 | 해당 | 내용 |
|---|---|---|
| ⑤ UI 위젯 | **해당** | `besshi-buppyo-2/` 7파일(오케스트레이터·시트·가·나·계·상수·PDF버튼) |
| ⑦ 결과 카드 | **해당** | `InheritanceTaxResultView` L335 `FilingForm9CoverSection` 직후 마운트 (가드 `heirAllocationResult && heirs.length>0 && (estateItems‖priorGifts)`, props `result/heirs/estateItems/priorGifts/deathDate`) |
| ①②③④⑥⑧⑨⑩⑪⑫⑬⑭ | N/A | FormData·initial·normalize·API·사이드바·validate·Zod·route 무변경 |

---

## §9 anchor ↔ testid 매핑

| anchor (엔진 설계) | UI testid | E2E |
|---|---|---|
| C-1 자기일관 | `buppyo2-na-row-1-amount` | `e2e/inheritance-besshi-buppyo-2.spec.ts` — 1장·가로스크롤 thumb·PDF |
| C-2 협의분할 미입력 | `buppyo2-sheet-{idx}-fallback`, `buppyo2-na-row-empty-1` | 안내 배지·빈 행 |
| C-3 수유자 | `buppyo2-ga-legal-ratio`(공란) | 수유자 장 |
| C-4 영리법인 사전증여 | `buppyo2-na-row-1-code1`="A22" | 법인 장 |
| C-5 사전증여 A21 | `buppyo2-kye-row-prior_gift_13` | 나↔계 동일소스 |
| AN-R2 코드 단일출처 | `buppyo2-na-row-{i}-method` | 평가기준코드 07/08 |
