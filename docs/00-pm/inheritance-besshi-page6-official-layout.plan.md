# 별지 부표3 제6쪽 「7. 순손익액」 공식 양식 완전 재현 수정 계획서

> 작성일: 2026-05-26
> 목표: **이미지25**(현재 PDF 출력 제6쪽 7. 순손익액 — 가산/차감 합계만 축약)를 **이미지26**(공식 「비상장주식 등 평가서」 별지 제4호 부표3 **2025.07.10 제6쪽** — ②~㉒ 21항목 전개 + 가산/차감 그룹)과 **완전히 동일**하게 출력한다.
> 결정: 화면+PDF 동시(ⓑ — 제1·2·4·5쪽과 동일 패턴).
> **상태**: ✅ **Do 완료 (2026-05-26)** — C1 anchor 10 RED → C2 `P6_ADD_ROWS`·`P6_SUB_ROWS`·`BESSHI_P6_SECTION7`(공식 라벨) → C3 PDF 21행 전개+그룹라벨(flex-row wrapper)+헤더·소계·아/자/차 → C4 화면 그룹라벨(rowSpan)·㉓㉔㉕·공식 라벨(ADD/SUB constants import). PDF 585→649줄. tsc 0·lint 0·전체 5162 PASS. anchor `besshi-page6-official-layout.test.tsx`(14 it).
> 관련: [[project_unlisted_stock_besshi_2025_revision]] (G-3 제6쪽 echo — 화면만 21행, PDF 미반영) · `docs/00-pm/inheritance-besshi-page{2,4,5}-official-layout.plan.md` · [[single-source-engine-helper]] · [[echo-field-pattern]] · [[feedback_pre_anchor_verification]]
> 법령: 상증령 §56④ (순손익액 가산 ②~⑦·차감 ⑧~㉒) · §59 · 상증규 §17 (KoreanLaw 검증은 besshi 2025 작업에서 완료)

---

## 1. 진단

### 1.1 이미지25 = PDF `Page6NetIncomeBreakdown` (축약), 화면은 이미 21행

| | 현재 상태 | 근거 |
|---|---|---|
| **PDF** `UnlistedStockBesshiPdfDocument.tsx:472` | **축약** — ① / 가산 합계(②~⑦) / 차감 합계(⑧~㉒) / 다·라·마·바·사 + 아·자·차. ②~㉒ **미전개** | L489 `label="가산 합계 (②~⑦)"`·L490 `"차감 합계 (⑧~㉒)"` |
| **화면** `components/.../besshi/Page6NetIncomeBreakdown.tsx` | **이미 21행** — ADD_ROWS ②~⑦ + SUB_ROWS ⑧~㉒ 개별 전개 (G-3) | L24-50 ADD_ROWS/SUB_ROWS, L90-103 |

- 이미지25 = **PDF** 확정: "가산 합계 (②~⑦)" 라벨·하단 "KoreanLaw MCP 검증" footer(PDF L506-508)는 PDF에만 존재.
- ★ **G-3은 화면에만 21행 적용, PDF는 미반영** — 본 계획이 PDF 정합 + 화면 공식 외형 보강.

### 1.2 echo 21필드 — 타입·엔진 이미 완비

- `FiscalYearBreakdown`(types L215-236)에 ②~㉒ **echo 21필드 optional** 존재(`addRefundInterest`②…`subOtherByOrdinance`㉒).
- orchestrator(L324-344)가 입력 `FiscalYearAdjustment`에서 **echo 채움**. → PDF 21행 전개 시 **실제 값 표시 가능**(산식 무변경). 미입력 항목은 0.

### 1.3 공식(이미지26) 구조 — 21항목 전개 + 그룹 라벨

```
(단위 : 원)                                                  (제6쪽)
7. 순손익액
┌──────┬──────────────────────────────┬──────┬──────┬──────┐
│      │ 평가기준일 1년, 2년, 3년이 되는 사업연도 │ (1년)│ (2년)│ (3년)│  ← 사업연도 헤더 행
│      │ ① 각 사업연도 소득금액           │      │      │      │
│ 소득에│ ② 국세·지방세 과오납 환급금이자   │      │      │      │
│ 가산할│ ③ 수입배당금 중 익금불산입액      │      │      │      │
│ 금액  │ ④ 이월된 기부금 손금산입액       │ …    │      │      │
│(rowspan│ ⑤ 이월된 업무용승용차 손금산입액 │      │      │      │
│ ②~⑦)│ ⑥ 외화환산이익(법인세 미반영)    │      │      │      │
│      │ ⑦ 그 밖에 기획재정부령 금액      │      │      │      │
├──────┼──────────────────────────────┼──────┼──────┼──────┤
│      │ 가. 소계(① + ② + …⑦)          │      │      │      │
├──────┼──────────────────────────────┤      │      │      │
│ 소득에│ ⑧ 당해 사업연도의 법인세액       │      │      │      │
│ 서    │ ⑨ 법인세 감면액·농특세·지방소득세 │      │      │      │
│ 차감할│ ⑩~⑲ … (10개)                  │ …    │      │      │
│ 금액  │ ⑳ 감가상각비 시인부족액 …        │      │      │      │
│(rowspan│ ㉑ 외화환산손실(법인세 미반영)   │      │      │      │
│ ⑧~㉒)│ ㉒ 그 밖에 기획재정부령 금액      │      │      │      │
├──────┴──────────────────────────────┼──────┼──────┼──────┤
│ 나. 소계(⑧ + …㉒)                    │      │      │      │
│ 다. 순손익액(가 - 나)                  │      │      │      │
│ 라. 유상증(감)자시 반영액              │      │      │      │
│ 마. 순손익액(다 ± 라)                  │      │      │      │
│ 바. 사업연도말 주식수 또는 환산주식수    │      │      │      │
│ 사. 주당순손익액 (마 ÷ 바)             │ ㉓   │ ㉔   │ ㉕   │
│ 아. 가중평균액 {(㉓ × 3 + ㉔ × 2 + ㉕) / 6} │           │
│ 자. 기획재정부령이 정하는 율           │                  │
│ 차. 최근 3년간 순손익액의 가중평균액에 의한 1주당 가액 (아÷자) │
└──────────────────────────────────────────────────────────┘
```

- **좌측 rowspan 그룹 라벨**: "소득에 가산할 금액"(②~⑦), "소득에서 차감할 금액"(⑧~㉒).
- 사업연도 헤더 행 "평가기준일 1년, 2년, 3년이 되는 사업연도".
- 사 행 ㉓㉔㉕ 마커, 아 "{(㉓ × 3 + ㉔ × 2 + ㉕) / 6}", 자 "기획재정부령이 정하는 율", 차 "최근 3년간 순손익액의 가중평균액에 의한 1주당 가액 (아÷자)".

### 1.4 차이 인벤토리

| # | 항목 | 현재 PDF(이미지25) | 공식(이미지26) | 조치 |
|---|---|---|---|---|
| A | 헤더 | "7. 순손익액 (3년치 — 별지 제6쪽)" | `(단위 : 원)`·`(제6쪽)` + "7. 순손익액" | 헤더 재구성 |
| B | **②~⑦ 가산** | "가산 합계 (②~⑦)" 1행 축약 | **6행 개별 전개** + 좌측 그룹 라벨 "소득에 가산할 금액" | 21행 전개 |
| C | **⑧~㉒ 차감** | "차감 합계 (⑧~㉒)" 1행 축약 | **15행 개별 전개** + 좌측 그룹 라벨 "소득에서 차감할 금액" | 21행 전개 |
| D | 가/나 소계 | 없음(합계행으로 대체) | "가. 소계(① + ② + …⑦)" · "나. 소계(⑧ + …㉒)" | 소계행 신설 |
| E | 사업연도 헤더 | "구분 \| {연도} (×N)" | "평가기준일 1년, 2년, 3년이 되는 사업연도" 행 | 헤더행 정합 |
| F | 사 ㉓㉔㉕ | "사. 1주당 순손익액" | "사. 주당순손익액 (마 ÷ 바)" + ㉓㉔㉕ 컬럼 마커 | 라벨·마커 |
| G | 아·자·차 | "아. 1주당 가중평균…", "자. 환원율", "차. 1주당 가액 = 아÷자 (제1쪽 ⑤)" | "아. 가중평균액 {(㉓ × 3 + ㉔ × 2 + ㉕) / 6}", "자. 기획재정부령이 정하는 율", "차. 최근 3년간 순손익액의 가중평균액에 의한 1주당 가액 (아÷자)" | 라벨 정합 |
| H | 화면 그룹 라벨 | 화면도 ②~㉒ 21행이나 **좌측 그룹 라벨·사업연도 헤더 행·㉓㉔㉕·아/자/차 공식 라벨 미반영** | 동상 | 화면도 정합(ⓑ) |

### 1.5 엔진 — 변경 불요

- 값(① taxableIncome·②~㉒ echo·가산/차감 합계·다·라·마·바·사·아·자·차)은 `result.fiscalYearBreakdowns`(echo 포함) + `result.weightedNetIncomePerShare`·`capitalizationRate`·`netIncomePerShare`에서 공급. **표시·레이아웃만 정합**.

---

## 2. 설계

### 2.1 단일 출처 (`besshi-form-constants.ts`) — ADD/SUB 행 정의 공유

현재 `ADD_ROWS`·`SUB_ROWS`는 **화면 컴포넌트에만** 정의(L24-50). → **`besshi-form-constants.ts`로 이동**(PDF·화면 공유, [[single-source-engine-helper]]). `BESSHI_P6_SECTION7` 추가:
```ts
export const P6_ADD_ROWS: { num: string; label: string; key: keyof FiscalYearBreakdown }[] = [ ②…⑦ ];
export const P6_SUB_ROWS: [ ⑧…㉒ ];
export const BESSHI_P6_SECTION7 = {
  header: "7. 순손익액", unitNote: "(단위 : 원)", pageNote: "(제6쪽)",
  fyHeaderLabel: "평가기준일 1년, 2년, 3년이 되는 사업연도",
  incomeLabel: "① 각 사업연도 소득금액",
  addGroupLabel: "소득에 가산할 금액", subGroupLabel: "소득에서 차감할 금액",
  addSubtotalLabel: "가. 소계(① + ② + …⑦)", subSubtotalLabel: "나. 소계(⑧ + …㉒)",
  netLabel: "다. 순손익액(가 - 나)", capAdjLabel: "라. 유상증(감)자시 반영액",
  finalLabel: "마. 순손익액(다 ± 라)", sharesLabel: "바. 사업연도말 주식수 또는 환산주식수",
  perShareLabel: "사. 주당순손익액 (마 ÷ 바)", perShareMarkers: ["㉓","㉔","㉕"],
  weightedAvgLabel: "아. 가중평균액  {(㉓ × 3 + ㉔ × 2 + ㉕) / 6}",
  rateLabel: "자. 기획재정부령이 정하는 율",
  finalPerShareLabel: "차. 최근 3년간 순손익액의 가중평균액에 의한 1주당 가액 (아÷자)",
} as const;
```
- ※ 화면 ADD_ROWS/SUB_ROWS 라벨은 공식 문구와 약간 다름(축약형). 공식 정합 위해 **공식 라벨로 통일**(이미지26 문구) — 화면·PDF 공유.

### 2.2 공식 21행 + 좌측 그룹 라벨 (B·C — 핵심)

- **PDF**: react-pdf는 rowSpan 미지원 → **그룹 라벨을 좌측 세로 셀로**: `<View flexDirection:row>[group-label-cell(고정폭, 세로 중앙)][rows-container(flex column, ②~⑦ 또는 ⑧~㉒ 행)]`. 또는 각 행 좌측에 그룹 라벨 칸을 두되 첫 행만 텍스트(나머지 빈칸 + 좌측 세로 병합 효과는 테두리로). **권장: flex-row wrapper**(label 1칸 + 행 컨테이너).
- **화면**: `<td rowSpan={6}>소득에 가산할 금액</td>` / `<td rowSpan={15}>소득에서 차감할 금액</td>` (HTML rowSpan 네이티브).
- 행: [그룹라벨(좌)][번호+항목라벨][연도1][연도2][연도3]. 값은 `renderDelta`.

### 2.3 헤더·라벨·소계 (A·D·E·F·G)

- 헤더 "(단위 : 원)·(제6쪽)" + "7. 순손익액" (구 "(3년치 — 별지 제6쪽)" 제거).
- 사업연도 헤더 행 "평가기준일 1년, 2년, 3년이 되는 사업연도"(+ 연도/가중치는 보조 표기 보존 가능).
- 가/나 소계행, 다/라/마/바/사, 아/자/차 공식 라벨. 사 행에 ㉓㉔㉕ 마커.

### 2.4 보존 항목

- 화면 testid: `p6-①`·`p6-②`~`p6-㉒`·`p6-가`·`p6-나`·`p6-다`~`p6-사`·`p6-차` **전부 보존**.
- **§17의3② 연환산 행**("사-환산", 1년 미만 사업연도): 공식 외 앱 부가 행 — 유지(화면). PDF는 현재 미표시 — 현행 유지(범위 외).
- PDF footer(KoreanLaw 검증 disclaimer): 앱 부가 — 유지.

---

## 3. 영향 / 비범위

**수정 대상**
- `components/.../besshi/besshi-form-constants.ts` — `P6_ADD_ROWS`·`P6_SUB_ROWS`·`BESSHI_P6_SECTION7` 추가(화면에서 이동·공식 라벨 통일).
- `lib/pdf/UnlistedStockBesshiPdfDocument.tsx` — `Page6NetIncomeBreakdown` 21행 전개 + 그룹 라벨 + 헤더·소계·공식 라벨.
- `components/.../besshi/Page6NetIncomeBreakdown.tsx` — 좌측 그룹 라벨·사업연도 헤더 행·㉓㉔㉕·아/자/차 공식 라벨 정합(ADD_ROWS/SUB_ROWS는 constants import로 전환).

**비범위**
- 엔진(`fiscal-year-net-income.ts`·orchestrator echo)·타입 **변경 0**(echo 21필드 이미 완비).
- 제1·2·4·5쪽(완료).
- §17의3② 연환산 행 PDF 추가(별도).

**★ 800줄**: PDF 현재 **585줄**. Page6 21행+그룹라벨 +~70 → ~655(여유). ADD/SUB 행 정의는 constants로 이동(PDF는 iterate만) → 과도 증가 없음. 초과 시 Page6 분리.

---

## 4. 검증 계획 (Pre-Do anchor)

신규 `__tests__/lib/pdf/besshi-page6-official-layout.test.tsx` (collectText walker + 화면 RTL).

- **AN-P6-1 (PDF 헤더, RED)**: "(단위 : 원)"·"(제6쪽)" + 구 "7. 순손익액 (3년치 — 별지 제6쪽)" 부재.
- **AN-P6-2 (PDF 21행 전개, RED)**: ②~㉒ 개별 라벨 존재 + 그룹 라벨 "소득에 가산할 금액"·"소득에서 차감할 금액". 구 "가산 합계 (②~⑦)"·"차감 합계 (⑧~㉒)" **부재**.
  - **★ 토큰 주의 (재검토)**: anchor substring은 **C2에서 채택할 공식 라벨**과 일치해야 함(화면 현행 middot "국세·지방세"가 아니라 공식 "국세, 지방세" 형태일 수 있음). 양쪽 공통 안전 substring 사용 권장: `과오납`·`기업업무추진비 손금불산입`·`외화환산손실`·`소득에 가산할 금액`. (C1 anchor 토큰 = C2 라벨에서 발췌 — 사전 동결.)
- **AN-P6-3 (PDF 공식 라벨, RED)**: "소계(① + ② + …⑦)", "소계(⑧ + …㉒)", "순손익액(가 - 나)", 아 "{(㉓ × 3 + ㉔ × 2 + ㉕) / 6}", 자 "기획재정부령이 정하는 율", 차 "최근 3년간 순손익액의 가중평균액에 의한 1주당 가액".
- **AN-P6-4 (echo→표시 정합, RED)**: ②(`addRefundInterest`)·⑧(`subCorporateTax`)에 값 주입한 입력 → PDF 텍스트에 해당 금액 표시(21행 echo 배선 증명). 현행(축약)은 합계만 → RED.
- **AN-P6-5 (값 정합·회귀, 사례6)**: 사례6(②~㉒ 미입력=0) → ① taxableIncome / 다 adjustedNetIncome / 마 finalNetIncome / 사 perShareNetIncome 표시 + 아=`weightedNetIncomePerShare`·차=`netIncomePerShare`. 화면 testid p6-① ~ p6-㉒·p6-차 전부 존재. (p6 값 회귀는 **본 신설 anchor**가 단일 보증 — besshi-form-full-replica는 p6 DOM assert 없음, "차=11,660"은 주석뿐이므로 그 파일 무영향.)
- **AN-P6-6 (화면 그룹 라벨)**: 화면 "소득에 가산할 금액"·"소득에서 차감할 금액" rowSpan 셀 존재 + 사업연도 헤더 행.

**게이트**: `tsc --noEmit` 0 / `npx vitest run __tests__/lib/pdf/ __tests__/tax-engine/property-valuation/besshi-form-full-replica.test.tsx __tests__/tax-engine/property-valuation/` / 커밋 전 전체 `npm test` / PDF·화면 렌더 텍스트 추출 육안 확인.

---

## 5. 작업 순서 (제안 커밋)

1. **C1** Pre-Do anchor AN-P6-1~4(RED) + AN-P6-5·6(회귀 기준) 고정.
2. **C2** `besshi-form-constants.ts` `P6_ADD_ROWS`·`P6_SUB_ROWS`·`BESSHI_P6_SECTION7` 추가(공식 라벨).
3. **C3** PDF `Page6NetIncomeBreakdown` 21행 전개·그룹 라벨·헤더·소계·공식 라벨 → AN-P6-1~5 GREEN.
4. **C4** 화면 `Page6NetIncomeBreakdown` 그룹 라벨·헤더 행·㉓㉔㉕·아/자/차 공식 라벨 + constants import 전환(testid 보존) → AN-P6-6 + 회귀 0.
5. **C5** 전체 `npm test` + PDF·화면 렌더 확인 + 메모리 환류([[project_unlisted_stock_besshi_2025_revision]] 후속5).

---

## 6. 리스크 / 주의

- **★ PDF rowspan 미지원**: react-pdf는 `rowSpan` 없음 → 그룹 라벨은 **flex-row wrapper**(세로 라벨 칸 + 행 컨테이너)로 구현. 세로 중앙 정렬·테두리 확인.
- **800줄**: PDF 585→~655. 초과 시 Page6 분리(또는 C0식 추가 추출).
- **testid 동결**: 화면 `p6-*` 24종(①·②~㉒·가·나·다·라·마·바·사·차) 보존. ADD_ROWS/SUB_ROWS를 constants로 이동해도 testid는 `p6-{num}` 유지.
- **라벨 통일**: 화면 현행 라벨(축약형)을 **공식 문구로 교체** — 화면·PDF 공유 단일 출처. ※ **정정 (재검토)**: 당초 "기존 테스트 갱신 필요" 우려를 적었으나, **코드 대조 결과 화면 Page6 DOM 라벨·`p6-*` testid를 assert하는 테스트는 전무**(`unlisted-stock-besshi-pdf`·`besshi-pdf-2025-parity`·`unlisted-besshi-result-section`·`besshi-form-full-replica` 모두 p6 DOM assert 없음; besshi-form-full-replica의 "차=11,660"은 **주석뿐**, assert 아님). → 라벨 통일·"가산 합계" 제거는 **기존 테스트 무영향**. testid는 신설 anchor에서만 검증.
- **사례6 echo 0**: 사례6은 ②~㉒ 미입력 → 21행 0 표시. echo 표시 배선은 AN-P6-4(값 주입 입력)로 별도 증명.
- **§17의3② 연환산 행**: 화면 부가 행 유지(공식 외). PDF 미표시 현행 유지.
- **단일 출처**: 행 정의·라벨을 `besshi-form-constants`로 모아 재드리프트 차단([[single-source-engine-helper]]).
