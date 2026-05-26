# 별지 부표3 제4쪽 「5. 평가차액」 공식 양식 완전 재현 + 항상 표시 수정 계획서

> 작성일: 2026-05-26
> 목표: **이미지22**(공식 「비상장주식 등 평가서」 별지 제4호 부표3 **2025.07.10 제4쪽 5. 평가차액**)를 출력 서식에 **항상 표시**하고, 현재의 비공식 stacked 레이아웃을 **공식 좌우 2블록 양식**으로 완전 재현한다.
> 결정: ✅ **사용자 확정 (2026-05-26): 옵션 1 — "안 나타남 + 공식 레이아웃"** (항상 표시 + 이미지22 공식 레이아웃, 화면+PDF 동시).
> **상태**: ✅ **Do 완료 (2026-05-26)** — C1 Pre-Do 11 RED → C2 `BESSHI_P4_SECTION5` 단일출처 → C3 PDF `Page4ValuationDelta` 2블록·작성방법·ungated·`resolveEvaluationDelta` → C4 화면 동일 정합(testid `p4-①/②/가`). tsc 0·lint 0·전체 5134 PASS. anchor `__tests__/lib/pdf/besshi-page4-official-layout.test.tsx`(17 it). ⚠️ PDF 파일 790줄(800 근접) — 다음 추가 시 `Page4ValuationDelta` 분리.
> 관련: [[project_unlisted_stock_besshi_2025_revision]] (제1·2쪽 공식 정합 — 동일 패턴) · `docs/00-pm/inheritance-besshi-page2-official-layout.plan.md` · [[single-source-engine-helper]] · [[feedback_pre_anchor_verification]]
> 법령: 상증령 §55② · 상증규 §17의2 (KoreanLaw 검증은 besshi 2025 작업에서 완료)

---

## 1. 진단

### 1.1 "누락" 원인 — 2중 (가시성 + 레이아웃)

| 원인 | 현재 동작 | 근거 |
|---|---|---|
| **(a) 가시성** | `evaluationDeltaRows.length === 0`이면 PDF·화면 **모두 null(통째 숨김)**. 입력 UI(`ValuationDeltaTable`)에서 **총액 fallback 모드**로 입력하면 `evaluationDeltaRows`=`[]` → 제4쪽 통째 사라짐 = "누락" | PDF `UnlistedStockBesshiPdfDocument.tsx:672` `{hasEvaluationDeltaRows && <Page4…>}` · `Page4ValuationDelta`(L432-433) `if (rows.length===0) return null` · 화면 `Page4ValuationDeltaTable.tsx:20-21` 동일 |
| **(b) 레이아웃** | 렌더되더라도 **비공식 stacked 단일표** `[구분│계정과목│상증법평가액│재무상태표│차액]` (자산 행 → ①합계 → 부채 행 → ②합계 → 가.평가차액 세로 누적) | PDF L444-495 · 화면 L28-99 |

→ 공식(이미지22)은 **좌우 2블록**(자산금액 4열 │ 부채금액 4열) + 헤더 바 + 작성방법 푸터. 제1·2쪽 공식 정합과 동일하게 PDF가 stale.

### 1.2 이미지22(공식) 구조

```
(단위 : 원)                                              (제4쪽)
─────────────────────────────────────────────────────────────
5. 평가차액
┌─────────────────────────┬───────────┬───────────────────────┐
│ 가. 평가차액 계산 (① - ②) │           │ 제2쪽 4.순자산가액「가」② 기재 │  ← 헤더 바 3칸
├─────────────────────────┴─────┬─────┴───────────────────────┤
│            자산금액             │            부채금액            │  ← 블록 헤더 (각 4열 span)
├──────┬────────┬────────┬──────┼──────┬────────┬────────┬──────┤
│계정과목│상증법에 │재무상태│ 차액 │계정과목│상증법에 │재무상태│ 차액 │  ← 컬럼 헤더
│      │따른평가액│표상금액│      │      │따른평가액│표상금액│      │
├──────┼────────┼────────┼──────┼──────┼────────┼────────┼──────┤
│①합계 │  …     │  …     │  …  │②합계 │  …     │  …     │  …  │  ← 합계 행 (맨 위)
├──────┼────────┼────────┼──────┼──────┼────────┼────────┼──────┤
│  …   │        │        │      │  …   │        │        │      │  ← 계정과목 데이터 행 N개
└──────┴────────┴────────┴──────┴──────┴────────┴────────┴──────┘
[작 성 방 법]  (회색 밴드)
  평가기준일 또는 직전사업연도말 현재의 재무상태표의 자산 또는 부채금액을 기준으로
  순자산가액 계산 시 재무상태표상 미계상분 포함 평가차액을 계산하는 경우에 사용합니다.
  1. 계정과목란에는 … 재무상태표상 미계상분은 추가로 기재합니다.
  2. 평가차액은 "①"에서 "②"를 차감한 잔액을 기재합니다.
```

차이 포인트: **합계 행이 맨 위**(현재 impl은 맨 아래), **좌우 2블록**(현재 세로 누적), 컬럼명 "상증법에 따른 평가액"·"재무상태표상 금액"(현재 "상증법 평가액"·"재무상태표"), 헤더 "(단위:원)·(제4쪽)"+"5. 평가차액"(현재 "5. 평가차액 (별지 제4쪽 — …)"), **작성방법 푸터 신규**.

### 1.3 엔진 — 변경 불요 (이미 정상) + ★ 「가」 표시 단일 출처 주의

- `resolveEvaluationDelta`(`evaluation-delta.ts:85`)가 **행 단위 OR 총액 fallback**을 분기 해소: `hasRows ? (assetDelta − liabilityDelta) : (assetEvaluationDeltaTotal − 0)`. orchestrator(L132-143)는 이 결과를 net-asset-calc의 ②로 주입.
- **★ 정정 (재검토)**: orchestrator는 `input.netAssetValueRaw`를 **변형하지 않는다**. 또한 입력 핸들러 `UnlistedStockV2Card.handleEvaluationDeltaRowsChange`(L188-195)는 **`evaluationDeltaRows`만 갱신하고 `assetValuationDelta`는 갱신 안 함**(ValuationDeltaTable 주석의 "동시 갱신"은 부정확·미구현). → **행 단위 모드에서 `raw.assetValuationDelta`는 0/stale**이며 행 합계와 다르다. (계산은 무영향 — orchestrator가 rows 우선 `resolveEvaluationDelta`로 해소하므로 stale 총액은 사용 안 됨.)
- **결론**: 제4쪽 「가. 평가차액」 = `raw.assetValuationDelta` 직접 표시는 **행 모드에서 오류**(0 표시 → AN-P4-4 실패). 반드시 **`resolveEvaluationDelta` 결과**(`rows ? ①−② : raw.assetValuationDelta`)로 표시 = 제2쪽 ②와 모드 무관 일치 + dual-truth 회피([[feedback_ui_engine_dual_truth_avoidance]]·[[single-source-engine-helper]]). Page4는 엔진 헬퍼 `resolveEvaluationDelta`를 **import**해 `①·②·가`를 단일 도출.
- 현행 Page4(행 있을 때만 렌더)는 `가 = assetTotal − liabilityTotal`로 row 모드에선 정확했으나, "항상 표시"로 총액 fallback 분기가 새로 필요 → 엔진 헬퍼 채택이 필수.

---

## 2. 설계

### 2.1 가시성 — 항상 표시 (원인 a)

- **PDF**: `UnlistedStockBesshiPdfDocument.tsx:672` 조건 `{hasEvaluationDeltaRows && …}` → **`<Page4ValuationDelta raw={input.netAssetValueRaw} />` (ungated)**. `hasEvaluationDeltaRows` 변수 제거. ※ **정정 (재검토)**: 당초 "`{result && …}` 게이트"로 적었으나, Page4는 `raw`만 사용(result 미참조)하고 **화면 `BesshiForm4Buppyo3PrintView.tsx:163`은 이미 `result` 게이트 없이 무조건 호출**. PDF만 result 게이트면 화면과 불일치 + no-result 엣지에서 제2쪽만 누락되는 갭 발생 → **양측 ungated**로 통일(진짜 "항상 표시"). result 없는 경우는 Page1+Page4만 렌더(불완전 입력 엣지, 실사용에선 V2 데이터=result 존재).
- **PDF `Page4ValuationDelta` / 화면 `Page4ValuationDeltaTable`**: `if (rows.length===0) return null` **제거** → 행이 없어도 공식 양식(빈 행 템플릿) 렌더.
- 행 없을 때: **합계 행(① 0 / ② 0)** + **빈 데이터 행 N개(템플릿용, 권장 5행)** 렌더로 "기재 가능한 양식" 형태 유지. (양식 충실 ↔ 출력 분량 trade-off — 5행 권장, 데이터 있으면 데이터 행 그대로.)

### 2.2 공식 좌우 2블록 레이아웃 (원인 b)

- **헤더 바**(3칸): `가. 평가차액 계산 (① − ②)` │ (중앙 빈칸 또는 평가차액 값) │ `제2쪽 4. 순자산가액 「가」의 ② 기재`.
- **자산금액 / 부채금액 좌우 2블록**: 각 블록 4열 `[계정과목 │ 상증법에 따른 평가액 │ 재무상태표상 금액 │ 차액]`. 자산 행과 부채 행을 **같은 행 번호에 좌우 병치**(행 수가 다르면 짧은 쪽 빈칸).
- **합계 행 맨 위**: 좌 `① 합계`(자산 차액 합) / 우 `② 합계`(부채 차액 합) — testid `p4-①`·`p4-②` **동결**.
- **차액**: 음수 `△` 표기(`renderDelta`). 「가. 평가차액」 값 = **`resolveEvaluationDelta({assetDeltaRows, liabilityDeltaRows, assetEvaluationDeltaTotal: raw.assetValuationDelta}).evaluationDelta`** (엔진 헬퍼 import — 행 모드 `①−②`, 총액 모드 `assetValuationDelta`, 제2쪽 ②와 모드 무관 일치). `① 합계`=결과 `assetDelta`, `② 합계`=`liabilityDelta`. testid `p4-가` 신규.
- **작성방법 푸터**: 회색 밴드 "작 성 방 법" + 본문 1문장 + 번호 2항목.

### 2.3 총액 fallback 모드 정합 (충실)

- 행 비어도(`evaluationDeltaRows=[]`) 「가. 평가차액」 = `resolveEvaluationDelta` 결과(총액 모드 → `raw.assetValuationDelta`)로 **제2쪽 ②와 일치** 표시(원인 a의 빈 행 템플릿 위에). 단 `① 합계 − ② 합계 = 0 ≠ 가`(총액 직접 입력 시)인 시각적 불일치 발생 → **작은 안내 문구**("총액 입력 — 계정과목별 명세 없음, 평가차액은 제2쪽 ②에 반영")를 `source === "total"` AND `evaluationDelta ≠ 0`일 때 노출. 행 단위 입력 시(`source === "rows"`)는 `가 = ① − ②` 성립(안내 미표시).

### 2.4 단일 출처 (`besshi-form-constants.ts`)

제1·2쪽 패턴 준용 — 제4쪽 라벨·헤더·컬럼·작성방법을 **`BESSHI_P4_SECTION5` 상수**로 단일화(화면·PDF 공유, 재드리프트 차단):
```ts
export const BESSHI_P4_SECTION5 = {
  header: "5. 평가차액", unitNote: "(단위 : 원)", pageNote: "(제4쪽)",
  calcTitle: "가. 평가차액 계산 (① − ②)",
  crossRef: "제2쪽 4. 순자산가액 「가」의 ② 기재",
  assetBlock: "자산금액", liabilityBlock: "부채금액",
  columns: ["계정과목", "상증법에 따른 평가액", "재무상태표상 금액", "차액"],
  assetTotalLabel: "① 합계", liabilityTotalLabel: "② 합계",
  deltaLabel: "가. 평가차액",
  guideTitle: "작 성 방 법",
  guideBody: "평가기준일 또는 직전사업연도말 현재의 재무상태표의 자산 또는 부채금액을 기준으로 하여 순자산가액을 계산 시 재무상태표상 미계상된 경우를 포함한 평가차액을 계산하는 경우에 사용합니다.",
  guideItems: [
    "계정과목란에는 평가대상 자산 또는 부채를 재무상태표에 기재된 계정명으로 기입하며 재무상태표상 미계상된 경우에는 추가로 기재합니다.",
    "평가차액은 「①」에서 「②」를 차감한 잔액을 기재합니다.",
  ],
} as const;
```

### 2.5 화면 동시 정합 (ⓑ)

화면 `Page4ValuationDeltaTable`도 동일 공식 2블록·헤더·작성방법으로 정합(제1·2쪽 결정 준용). testid `p4-①`·`p4-②` 보존 + `p4-가` 추가.

---

## 3. 영향 / 비범위

**수정 대상**
- `lib/pdf/UnlistedStockBesshiPdfDocument.tsx` — `Page4ValuationDelta` 2블록 레이아웃·작성방법 + **ungated**(L672 `hasEvaluationDeltaRows &&` 제거) + null 가드 제거 + **`resolveEvaluationDelta` import**로 ①·②·가 도출.
- `components/calc/inheritance/unlisted-stock-v2/besshi/Page4ValuationDeltaTable.tsx` — 동일 공식 레이아웃·작성방법·null 가드 제거 + `resolveEvaluationDelta` 도출.
- `components/calc/inheritance/unlisted-stock-v2/besshi/besshi-form-constants.ts` — `BESSHI_P4_SECTION5` 추가.

**비범위**
- 엔진(`evaluation-delta.ts`·`net-asset-calc.ts`·`unlisted-orchestrator.ts`) **변경 0** — 이미 정상(행/총액 해소). Page4가 `resolveEvaluationDelta`를 **읽기 전용 import**(엔진 로직 재사용, 변경 아님).
- 입력 UI `ValuationDeltaTable.tsx` **변경 0** — 입력 경로 정상.
- 타입·API·validate **변경 0**(input/result 불변). 출력 전용.
- 제1·2·5·6쪽(별도).
- 800줄: `UnlistedStockBesshiPdfDocument.tsx` 현재 690줄 → 작성방법·2블록 추가로 근접 시 `Page4ValuationDelta` 별 파일 분리 검토.

---

## 4. 검증 계획 (Pre-Do anchor)

신규 `__tests__/lib/pdf/besshi-page4-official-layout.test.tsx` (제2쪽 anchor 패턴 — `collectText` 함수형 컴포넌트 실행 walker).

- **AN-P4-1 (가시성, RED)**: `evaluationDeltaRows=[]` 입력 → PDF 텍스트에 "5. 평가차액"·"자산금액"·"부채금액"·"작 성 방 법" 포함. 현행(null) → RED, 정정 후 GREEN.
- **AN-P4-2 (공식 레이아웃, RED)**: "자산금액"·"부채금액" 2블록, "① 합계"·"② 합계", 컬럼 "상증법에 따른 평가액"·"재무상태표상 금액", crossRef "제2쪽 4. 순자산가액 「가」의 ② 기재", 작성방법 2항목 + 구 "5. 평가차액 (별지 제4쪽 — 자산·부채 계정과목별)" **부재**.
- **AN-P4-3 (헤더)**: "(단위 : 원)"·"(제4쪽)" 포함.
- **AN-P4-4 (데이터 정합·회귀, GREEN)**: 사례6 자산 8행 + 부채 3행 → `① 합계 = 107,324,150` / `② 합계 = 15,775,800` / `가. 평가차액 = 91,548,350` 표시. 화면 testid `p4-①`·`p4-②` 존재(기존 `evaluation-delta-rows.test.ts` N-1·besshi-form-full-replica 회귀 0).
- **AN-P4-5 (fallback 총액 정합 — ★ row/total 양 분기 강제)**: ① `evaluationDeltaRows=[]` + `assetValuationDelta=91,548,350` → 「가. 평가차액」=91,548,350(제2쪽 ②와 일치, `resolveEvaluationDelta` total 분기) + 총액 안내 문구. ② 행 단위(8+3행, `assetValuationDelta`=0/stale) → 「가」=91,548,350(`①−②`, **`raw.assetValuationDelta` 직접 표시였다면 0으로 RED**) + 안내 미표시. → 엔진 헬퍼 채택이 두 분기 모두 GREEN의 필수 조건임을 증명.

**게이트**: `tsc --noEmit` 0 / `npx vitest run __tests__/lib/pdf/ __tests__/tax-engine/property-valuation/` / 커밋 전 전체 `npm test` / 실제 PDF·화면 렌더 텍스트 추출 육안 확인.

---

## 5. 작업 순서 (제안 커밋)

1. **C1** Pre-Do anchor AN-P4-1·2(RED 확보 — 가시성·레이아웃 갭 증명) + AN-P4-4 회귀 기준 고정.
2. **C2** `besshi-form-constants.ts` `BESSHI_P4_SECTION5` 단일 출처 추가.
3. **C3** PDF `Page4ValuationDelta` 공식 2블록 레이아웃 + 작성방법 + ungated(null 가드·`hasEvaluationDeltaRows` 제거) + `resolveEvaluationDelta` import로 ①·②·가 도출 → AN-P4-1~5 GREEN.
4. **C4** 화면 `Page4ValuationDeltaTable` 동일 정합(ⓑ, testid 보존) → 기존 회귀 0.
5. **C5** 전체 `npm test` + PDF·화면 렌더 확인 + 메모리 환류([[project_unlisted_stock_besshi_2025_revision]] 후속3).

---

## 6. 리스크 / 주의

- **좌우 2블록 정렬**: 자산 행 수 ≠ 부채 행 수 시 짧은 쪽 빈 셀 패딩. PDF A4 폭(약 535pt)에서 8열(4+4) 폭 조정 — 계정과목 wrap·금액 우측 정렬 확인.
- **합계 행 위치 + testid 재배치**: 공식은 ①/② 합계가 **맨 위**(현재 impl 맨 아래) — 순서 반전. 좌우 2블록에서 `① 합계`(좌)·`② 합계`(우)가 **같은 `<tr>`에 병치** → 현행 `<tr data-testid="p4-①/②">`(행 단위)를 해당 **`<td>` 셀 단위**로 이동. (현재 `p4-①`·`p4-②`를 DOM에서 읽는 테스트는 **없음** — 컴포넌트 정의만 → test-critical 아니나 보존. `p4-가` 신규.)
- **dual-truth 회피**: 「①·②·가」를 Page4 로컬 재계산하지 말고 **`resolveEvaluationDelta` import**로 단일 도출(§1.3). `raw.assetValuationDelta` 직접 표시 금지(행 모드 stale).
- **빈 행 N개**: 양식 충실 위해 5행 권장(과도한 분량 회피). 데이터 있으면 데이터 행만.
- **fallback 총액 시각 불일치**: rows 빈 + 총액≠0 → `① − ② = 0 ≠ 가`. 안내 문구로 명시(§2.3). 단일 출처(`raw.assetValuationDelta`=제2쪽 ②) 우선.
- **800줄**: PDF 파일 근접 시 `Page4ValuationDelta` 분리.
- **단일 출처**: 제1·2쪽처럼 라벨·작성방법을 `besshi-form-constants`로 모아 재드리프트 차단([[single-source-engine-helper]]).
