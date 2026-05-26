# 별지 부표3 제5쪽 「6. 영업권」 공식 양식 완전 재현 수정 계획서

> 작성일: 2026-05-26
> 목표: **이미지23**(현재 출력 제5쪽 6. 영업권)을 **이미지24**(공식 「비상장주식 등 평가서」 별지 제4호 부표3 **2025.07.10 제5쪽**)와 **완전히 동일**하게 출력한다.
> 결정: 화면+PDF 동시(ⓑ — 제1·2·4쪽과 동일 패턴). 연도 보존(사용자 확정).
> **상태**: ✅ **Do 완료 (2026-05-26)** — C0 스타일(C+s) `besshi-pdf-styles.ts` 추출(main 790→585) → C1 anchor 9 RED → C2 `BESSHI_P5_SECTION6` → C3 PDF `Page5Goodwill` 3열(`P5Row`, SubFiscalRow·SimpleRow 제거) → C4 화면 3열 + **F-7 금액셀 정정**(`cells.length-2`). tsc 0·lint 0·전체 5148 PASS. anchor `besshi-page5-official-layout.test.tsx`(14 it).
> 관련: [[project_unlisted_stock_besshi_2025_revision]] (제1·2·4쪽 공식 정합 — 동일 패턴) · `docs/00-pm/inheritance-besshi-page{2,4}-official-layout.plan.md` · [[single-source-engine-helper]] · [[feedback_800line_split_export_preservation]] · [[feedback_pre_anchor_verification]]
> 법령: 상증령 §59② · §55③ · 상증규 §19① (KoreanLaw 검증은 besshi 2025 작업에서 완료)

---

## 1. 진단

### 1.1 대상 — PDF `Page5Goodwill` + 화면 `Page5GoodwillTable` (둘 다 비공식 2열)

- **PDF** `UnlistedStockBesshiPdfDocument.tsx:605` `Page5Goodwill` + `SubFiscalRow`(L651)·`SimpleRow`(L663).
- **화면** `components/.../besshi/Page5GoodwillTable.tsx`.
- 둘 다 **2열 `[번호+라벨(산식 inline)][값]`** — 공식(이미지24)의 **3열 `[라벨][금액][산식·참조·회색]`**과 다름. 제1·2·4쪽처럼 공식 정합 미적용.

### 1.2 공식(이미지24) 구조 — 3열

```
(단위 : 원)                                                  (제5쪽)
─────────────────────────────────────────────────────────────
6. 영업권
┌────────────────────────────────┬───────────┬──────────────────────────┐
│ 가. 평가기준일 이전 3년간 순손익액의 │   금액    │ (① × 3 + ② × 2 + ③) / 6  │  col3=산식
│      가중평균액                    │           │                          │
│ ① 평가기준일 이전 1년이 되는 …순손익액│   금액    │ ▒▒▒▒▒ (회색)             │
│ ② 평가기준일 이전 2년이 되는 …       │   금액    │ ▒▒▒▒▒                    │
│ ③ 평가기준일 이전 3년이 되는 …       │   금액    │ ▒▒▒▒▒                    │
│ 나. 가 × 50%                        │   금액    │ ▒▒▒▒▒                    │
│ 다. 평가기준일 현재 자기자본          │   금액    │ ▒▒▒▒▒                    │
│ 라. 기획재정부령이 정하는 이자율      │ (빈칸)    │ 10%                      │  col3=상수
│ 마. 다 × 라                         │   금액    │ ▒▒▒▒▒                    │
│ 바. 영업권 지속연수                  │ (빈칸)    │ 5년                      │  col3=상수
│ 사. 영업권 계산액                    │   금액    │ ▒▒▒▒▒                    │
│   Σⁿ₌₁ⁿ[(나-마)/(1+0.1)ⁿ]            │           │                          │
│   n은 평가기준일부터의 경과연수        │           │                          │
│ 아. 영업권 상당액에 포함된 매입한      │   금액    │ ▒▒▒▒▒                    │
│   무체재산권가액 중 …감가상각비 공제액 │           │                          │
│ 자. 영업권 평가액 (사 - 아)          │   금액    │ 제2쪽 4. 순자산가액「라」기재 │  col3=cross-ref
└────────────────────────────────┴───────────┴──────────────────────────┘
```

- **col2(금액)**: 가/①②③/나/다/마/사/아/자 = 계산 금액. **라/바는 빈칸**(금액 아닌 파라미터).
- **col3(비고·산식)**: 가=가중평균 산식 / 라=이자율(10%) / 바=지속연수(5년) / 자=cross-ref. 나머지(①②③나다마사아)=**회색 빈칸**.

### 1.3 이미지23(현재) vs 이미지24(공식) 차이 인벤토리

| # | 항목 | 현재(이미지23) | 공식(이미지24) | 조치 |
|---|---|---|---|---|
| A | 헤더 | 섹션바 "6. 영업권 (별지 제5쪽)" | `(단위 : 원)`(좌)·`(제5쪽)`(우) + "6. 영업권" | 헤더 재구성 |
| B | **레이아웃** | 2열 [번호+라벨(산식 inline)][값] | **3열 [라벨][금액][산식·참조·회색]** | col3 신설·산식/상수/ref 이동 |
| C | 가 산식 | 라벨 inline "(①×3 + ②×2 + ③×1) ÷ 6" | col3 **"(① × 3 + ② × 2 + ③) / 6"** (×1 생략·"/" 사용) | 라벨→col3 분리 + 표기 정합 |
| D | ①②③ 라벨 | "평가기준일 이전 1년 사업연도 순손익액 (×3) {연도}" | **"평가기준일 이전 1년이 되는 사업연도 순손익액"** (가중치·연도 inline 제거) | 라벨 정합 |
| E | 라 | "기획재정부령이 정하는 이자율 (상증규 §19①)" · 값열 10% | 라벨 "기획재정부령이 정하는 이자율" · **col2 빈칸 · col3 10%** | 라벨·열 정합 |
| F | 바 | "영업권 지속연수" · 값열 5년 | col2 빈칸 · **col3 5년** | 열 정합 |
| G | 사 라벨 | "영업권 계산액" + inline "Σⁿ₌₁⁵ (나 − 마)/(1+0.1)ⁿ" | **"영업권 계산액 / Σⁿ₌₁ⁿ[(나-마)/(1+0.1)ⁿ] / n은 평가기준일부터의 경과연수"** (다단) | 라벨 정합 |
| H | 아 라벨 | "영업권 상당액 중 매입 무체재산권 감가상각비 공제분" | **"영업권 상당액에 포함된 매입한 무체재산권가액 중 평가기준일까지의 감가상각비를 공제한 금액"** | 라벨 정합 |
| I | 자 | "영업권 평가액 (사 − 아) → 제2쪽 4.라 기재" | 라벨 "영업권 평가액 (사 - 아)" · col3 **"제2쪽 4. 순자산가액 「라」 기재"** | ref→col3 분리 |

### 1.4 엔진 — 변경 불요

- 값은 모두 `result.goodwillCalculation`(`UnlistedGoodwillResult`) + `fiscalYearBreakdowns`에서 공급(weightedAvg3y·finalNetIncome×3·weightedAvgHalf·selfCapital·rate·selfCapitalRate·durationYears·goodwillCalc·intangibleDeduction·goodwillFinal). **표시·라벨·레이아웃만 정합**. 라/바 col3 값(10%·5년)은 `rate`·`durationYears` 동적 유지.

---

## 2. 설계

### 2.1 공식 3열 레이아웃 (B·C·E·F·I — 핵심)

행 모델 (단일 출처 `BESSHI_P5_SECTION6`):
```ts
interface GoodwillRowDef {
  cellNum: string;             // 가/①/②/③/나/다/라/마/바/사/아/자
  label: string;               // col1 (공식 문구, 다단은 \n)
  amountKey?: keyof …;         // col2 금액 매핑 (라·바는 없음→빈칸)
  col3?: "formula" | "rate" | "duration" | "crossRef"; // col3 동적 내용 (없으면 회색 빈칸)
}
```
- **col1**: 번호 + 공식 라벨.
- **col2(금액, 우측정렬)**: 가/①②③/나/다/마/사/아/자 = 해당 값(`renderDelta`로 △). **라·바 빈칸**.
- **col3**: 가=`"(① × 3 + ② × 2 + ③) / 6"` / 라=`${rate*100}%` / 바=`${durationYears}년` / 자=`"제2쪽 4. 순자산가액 「라」 기재"`. 그 외 **회색 빈칸**(가·라·바·자 셀은 흰 배경+내용, 나머지 gray).
- 가 강조(yellow), 자 강조(emerald) 유지. ①②③ 들여쓰기(pl-6) 유지.

### 2.2 라벨·헤더 (A·D·G·H)

- 헤더: "6. 영업권" + `(단위 : 원)`·`(제5쪽)` ("별지 제5쪽" 표기 제거).
- ① "평가기준일 이전 1년이 되는 사업연도 순손익액"(②③ 동형). **연도(2021)·가중치(×3) 라벨 제거** — 가중치는 가 산식에. (연도 정보는 `BESSHI_P5_SECTION6`에 선택적 annotation으로 보존 가능 — §2.4 결정.)
- 사 다단 라벨 / 아 장문 라벨 = 공식 문구.

### 2.3 단일 출처 (`besshi-form-constants.ts`)

`BESSHI_P5_SECTION6` 추가(제1·2·4쪽 패턴): header·unitNote·pageNote·각 행 라벨·col3 정적 문구(가 산식·자 ref)·이자율/지속연수 포맷터. 화면·PDF 공유 → 재드리프트 차단.

### 2.4 화면 동시 정합 (ⓑ) + 보존

- 화면 `Page5GoodwillTable`도 동일 3열·라벨·헤더로 정합.
- **testid 동결**: `p5-가`·`p5-가-①`·`p5-가-②`·`p5-가-③`·`p5-나`~`p5-자`·`p5-excluded-badge`·`p5-zero-anomaly-footer` 전부 보존.
- **§55③ 자동배제 badge**·**OQ-1 zero-anomaly footer**(나-마 양수·자=0) 로직 유지.
- **결정(연도 표시) ✅ 확정 (사용자, 2026-05-26): 연도 보존.** 공식 라벨("평가기준일 이전 1년이 되는 사업연도 순손익액") 채택 + 연도(`fiscalYearBreakdowns[i].label`, 예 2021)를 col1 라벨 끝에 작은 회색 annotation으로 **보존**. 가중치(×3 등)는 라벨에서 제거(가 산식 col3에 표현).

---

## 3. 영향 / 비범위 + ★ 800줄 분리 선행

**수정 대상**
- `lib/pdf/besshi-pdf-styles.ts` (신규, C0) — `C`·`s` 추출.
- `lib/pdf/UnlistedStockBesshiPdfDocument.tsx` — 스타일 import 전환(C0) + `Page5Goodwill`·`SubFiscalRow`·`SimpleRow` 3열 정합(C3).
- `components/.../besshi/Page5GoodwillTable.tsx` — 동일 3열 정합.
- `components/.../besshi/besshi-form-constants.ts` — `BESSHI_P5_SECTION6` 추가.
- `__tests__/tax-engine/property-valuation/besshi-form-full-replica.test.tsx` — **F-7 금액셀 파싱 정정**(`cells.length-1`→`cells.length-2`, col3 산식이 last가 되므로).

**★ 선행 — PDF 파일 800줄 분리 (정정: 스타일 추출 방식)**
- 현재 `UnlistedStockBesshiPdfDocument.tsx` **790줄**. Page5 3열 재작성으로 **800 초과 확실**.
- **C0(선행) — 스타일 블록 추출**: `const C`(색상, L52-63 ~12줄) + `const s = StyleSheet.create({…})`(L64-260 ~197줄, **합 ~209줄**)를 **sibling `besshi-pdf-styles.ts`로 추출**(`import { StyleSheet } from "@react-pdf/renderer"; import { BESSHI_FONT_STACK } from "./fonts"; export const C; export const s;`). main은 `import { C, s }`. → main **790→~581줄**, Page5 재작성 +~40 후에도 ~620줄(여유 충분).
- ※ **정정 (재검토)**: 당초 "Page4/Page5 컴포넌트를 sibling으로 추출"로 적었으나, 페이지 함수는 `s`·`C`·`fmt`·`renderDelta`·`EXCLUDED_REASON_LABEL`를 모두 공유해 이동 시 의존 표면이 넓고 위험. **스타일(C+s)만 추출**이 더 단순·저위험(순환 의존 없음 — 스타일은 페이지 컴포넌트 미참조). 외부 export 무변경([[feedback_800line_split_export_preservation]]).

**비범위**
- 엔진(`goodwill.ts`·`evaluateUnlistedStockV2`)·타입·API·validate **변경 0**(출력 전용).
- 제1·2·4·6쪽(별도).

---

## 4. 검증 계획 (Pre-Do anchor)

신규 `__tests__/lib/pdf/besshi-page5-official-layout.test.tsx` (제2·4쪽 `collectText` walker + 화면 RTL).

- **AN-P5-1 (헤더, RED)**: PDF 텍스트 "(단위 : 원)"·"(제5쪽)" + **부재** "6. 영업권 (별지 제5쪽)".
- **AN-P5-2 (3열 col3, RED)**: 가 col3 "(① × 3 + ② × 2 + ③) / 6", 자 col3 "제2쪽 4. 순자산가액 「라」 기재", 라 col3 "10%"·바 col3 "5년".
  - **★ 판별자 주의**: col3에 가 산식이 들어가므로 "라벨 inline 산식 부재"는 **구 표기 정확 토큰**으로 검출 — `not.toContain("÷ 6")`(공식은 "/ 6") + `not.toContain("③ ×1")`(공식은 ×1 생략) + `not.toContain("→ 제2쪽 4.라 기재")`(자 구 ref). (단순 "(①×3" 검사는 col3 신산식과 충돌하므로 금지.)
- **AN-P5-3 (공식 라벨, RED)**: "평가기준일 이전 1년이 되는 사업연도 순손익액", 아 장문("매입한 무체재산권가액 중 평가기준일까지"), 사 "n은 평가기준일부터의 경과연수".
- **AN-P5-4 (값 정합·회귀, 사례6 GREEN)**: `p5-가`=58,341,511 / `p5-다`=489,351,700 / `p5-마`=48,935,170 / `p5-자`=0. 화면 testid 전부 존재 + `p5-zero-anomaly-footer`(사례6 나-마 양수·자=0) 유지.
  - **★ 정정 (재검토) — F-7 필수 수정**: `besshi-form-full-replica.test.tsx` **F-7**(L241-245)은 `p5-가` 행의 **마지막 td**(`cells[cells.length-1]`)를 금액으로 파싱해 58,341,511 기대. 3열 전환 시 마지막 td = **col3 산식** "(① × 3 + ② × 2 + ③) / 6" → `parseInt` 가 "326" 추출 → **F-7 깨짐**. → **F-7을 금액 셀(col2)로 수정**: `cells[cells.length-1]` → **`cells[cells.length-2]`** (4셀 [번호][라벨][금액][col3]에서 금액=index 2). C4에서 함께 정정. (其他 p5 assertion L106-117은 `toHaveTextContent` 행 전체 검색이라 col3 산식 추가에도 무영향 — F-7만 셀-인덱스 파싱.)
- **AN-P5-5 (badge 회귀)**: §55③ 배제 케이스 → `p5-excluded-badge` 유지.

**게이트**: `tsc --noEmit` 0 / `npx vitest run __tests__/lib/pdf/ __tests__/tax-engine/property-valuation/besshi-form-full-replica.test.tsx __tests__/tax-engine/property-valuation/` / 커밋 전 전체 `npm test` / PDF·화면 렌더 텍스트 추출 육안 확인.

---

## 5. 작업 순서 (제안 커밋)

1. **C0 (선행)** PDF `C`+`s` 스타일 → sibling `besshi-pdf-styles.ts` 추출, main `import { C, s }`, export 무변경, 회귀 0 확인(분리만, 기능 무변경).
2. **C1** Pre-Do anchor AN-P5-1~3(RED) + AN-P5-4·5(회귀 기준) 고정.
3. **C2** `besshi-form-constants.ts` `BESSHI_P5_SECTION6` 단일 출처 추가.
4. **C3** PDF `Page5Goodwill`(+`SubFiscalRow`/`SimpleRow`) 3열 레이아웃·라벨·헤더·연도 보존 → AN-P5-1~5 GREEN.
5. **C4** 화면 `Page5GoodwillTable` 동일 정합(testid·badge·footer 보존) + **F-7 금액셀 파싱 정정**(`cells.length-2`) → 회귀 0.
6. **C5** 전체 `npm test` + PDF·화면 렌더 확인 + 메모리 환류([[project_unlisted_stock_besshi_2025_revision]] 후속4).

---

## 6. 리스크 / 주의

- **★ 800줄**: Page5 재작성 전 **C0 스타일(C+s) 추출 필수**(790→초과 확실). main `import { C, s }`, export 무변경.
- **★ F-7 셀-인덱스 파싱 깨짐**: 3열 전환 시 `p5-가` 마지막 td = col3 산식 → F-7 `cells.length-1` 파싱 실패(58,341,511 대신 "326"). **`cells.length-2`(금액 col2)로 정정 필수** (C4). 그 외 p5 assertion은 `toHaveTextContent`(행 전체)라 무영향.
- **col3 회색 vs 내용**: 가·라·바·자만 흰 배경+내용, 나머지 회색 빈칸. col2는 라·바만 빈칸.
- **testid 동결**: `p5-*` 14종(가·가-①②③·나~자·excluded-badge·zero-anomaly-footer) 보존 — 3열 전환 시 셀 위치 변경되나 testid 문자열(`<tr>` 단위) 유지. `besshi-form-full-replica.test.tsx` 기대값(사례6) 유지(F-7 제외 — 위 정정).
- **badge·footer 로직 유지**: §55③ 배제(excludedByLaw)·OQ-1 zero-anomaly(나-마 양수·자=0).
- **사 다단 라벨**: PDF는 `\n` 또는 다중 Text, 화면은 줄바꿈. Σ 기호·위첨자(ⁿ) 글리프 — besshi 폰트 스택(NanumGothic+BesshiEnclosed) 적용 확인.
- **연도 annotation**: 공식 라벨 채택 + 연도 보존(§2.4) — 엄격 재현 원하면 생략 토글.
- **단일 출처**: 라벨·산식·ref를 `besshi-form-constants`로 모아 화면·PDF 재드리프트 차단([[single-source-engine-helper]]).
