# 별지 제9호서식 부표 2 — 1쪽 나 섹션 데이터 표시 + 오버플로 별지 분할 계획서

> 2026-06-02 · feature: `inheritance-buppyo-2-na-page1-overflow-split`
> 선행: 부표2 page-split(미커밋) + 금액 4버그(`inheritance-buppyo-2-4bug-amount-fix`, 커밋대기)
> 소관: `inheritance-gift-tax-ui-senior` (화면·PDF). **엔진·어댑터 계산 변경 0 — 출력 표시 전용.**
> **근거: 사용자 첨부 이미지6(1쪽 전체)·이미지7(1쪽 나)·이미지8(2쪽 명세) + 요구 3건.**

---

## 0. 배경 — 사용자 요구 3건

현재(page-split) 1쪽 나 섹션은 데이터 없이 **"별첨" 스텁 8행**(`Buppyo2NaStub`)만, 2쪽은 전체 명세를 **항상** 출력. 사용자는 1쪽 나에 **실제 데이터를 직접 표시**하고 데이터가 적으면 2쪽을 없애길 원함.

| # | 요구 | 의미 |
|---|---|---|
| **R1** | 이미지7(1쪽 나) 입력행 **8개 중 5개만** 남기고 삭제 | 1쪽 나 행 수 8 → **5** |
| **R2** | 이미지8 자료를 1쪽에 **4개까지** 표시, **4 초과 시** 마지막(5번째) 행에 **"별지 계속"** + 2쪽(이미지8) 계속 표시 | 오버플로 시 1쪽=데이터4+마커, 2쪽=명세 |
| **R3** | 명세가 **5개 이하**면 1쪽(이미지7)에 **모두 표시**, 2쪽(이미지8) **출력 안 함** | N≤5 → 1쪽 전부, 2쪽 제거 |

---

## 1. 목표 동작 — 페이지 분할 규칙 (N = `itemRows.length`)

> R2("4 초과")와 R3("5 이하 모두")의 경계(N=5)는 **R3 우선** — N=5는 1쪽에 5행 전부, 별지 계속·2쪽 없음.

| N (명세 행 수) | 1쪽 나 (5행 고정) | 5번째 행 | 2쪽 출력 |
|---|---|---|---|
| **N ≤ 5** | 데이터 1~N행 + 빈행 패딩 | 데이터(N=5) 또는 빈행 | **없음** |
| **N ≥ 6** | 데이터 1~4행 | **"별지 계속"** | **오버플로 5~N행(중복 없음) + 계 행** |

- 현재 케이스(배우자 N=16): 1쪽 = 은행예금·부발농지·공장건물·골프회원권(4행) + **"별지 계속"**(5번째). 2쪽 = **5~16행(12행, 1쪽과 중복 없음)** + 계.
- 1쪽 나는 **항상 5행**(데이터+패딩 또는 데이터4+마커). 계(⑰~㉘) 섹션은 1쪽 유지(변경 없음).
- 2쪽 = **오버플로분만**(1쪽 4행 제외 — 사용자 확정, 2026-06-02). **계 행 = `itemRowsTotal`(전체 명세 합계 4,210,000,000, 페이지 소계 아님)** → ⑧·㉘와 정합 유지.

---

## 2. 현재 구조 (file:line)

| 영역 | 파일 | 현재 |
|---|---|---|
| 화면 1쪽 나 | `Buppyo2NaTable.tsx` `Buppyo2NaStub`(82-112) | "별첨" 1행 + 빈행 7 (`MIN_ROWS=8`) |
| 화면 2쪽 | `Buppyo2NaTable.tsx` `Buppyo2NaTable`(115-173) | 전체 data + 패딩8 + 계행(161-169) |
| 화면 조립 | `Buppyo2HeirSheet.tsx` | 1쪽(34-63) `Buppyo2NaStub`(56) + 2쪽(66-86) `Buppyo2NaTable` **항상 렌더** |
| PDF | `InheritanceBuppyo2PdfDocument.tsx` | `NaStubBlock`(169) "별첨" / `NaBlock`(192) 전체 / Page1(301) Stub(307) + Page2(312) NaBlock(315) **항상** |
| 상수 | `besshi-buppyo-2-constants.ts` | `BP2_ATTACHMENT_MARK="별첨"`(20) · `BP2_NA_SECTION_TITLE`(18) |
| 공통 | `MIN_ROWS = 8` (NaTable·PDF 각각 상수) | — |

> 컴포넌트/PDF 전용 테스트 없음(`__tests__` grep — `besshi-buppyo-2-data.test.ts`만). **e2e·테스트의 `buppyo2-na-stub`·`NaStub`·`별첨` 참조 0 확인**(grep 전수) → testid·`BP2_ATTACHMENT_MARK` 제거 안전. 신규 분할 anchor만 추가.

---

## 3. 설계 — 분할 헬퍼 (화면·PDF 단일 진실)

페이지 분할 판단은 화면·PDF가 **동일 순수 함수**를 import (dual-truth 0). `besshi-buppyo-2-constants.ts`에 상수 + 헬퍼 신설(`Buppyo2ItemRow`는 `import type`로 어댑터에서 — 런타임 순환 없음).

```ts
export const BP2_PAGE1_NA_ROWS = 5;       // R1 — 1쪽 나 행 수 (8→5)
export const BP2_PAGE1_MAX_DATA = 4;      // R2 — 오버플로 시 1쪽 데이터 최대
export const BP2_CONTINUATION_MARK = "별지 계속";

export function splitBuppyo2NaRows(rows: Buppyo2ItemRow[]): {
  page1Rows: Buppyo2ItemRow[];   // 1쪽에 그릴 데이터 행 (≤5 전부 / ≥6 앞 4행)
  page2Rows: Buppyo2ItemRow[];   // 2쪽 오버플로 행 (5~N, 1쪽과 중복 없음)
  needsContinuation: boolean;    // 1쪽 5번째 행 "별지 계속" 표시 여부
  needsPage2: boolean;           // 2쪽 출력 여부
} {
  if (rows.length <= BP2_PAGE1_NA_ROWS) {
    return { page1Rows: rows, page2Rows: [], needsContinuation: false, needsPage2: false };
  }
  return {
    page1Rows: rows.slice(0, BP2_PAGE1_MAX_DATA),   // 앞 4행
    page2Rows: rows.slice(BP2_PAGE1_MAX_DATA),       // 5번째~끝 (중복 없음)
    needsContinuation: true,
    needsPage2: true,
  };
}
```

- N≤5 → page1Rows=전부, page2Rows=[], 마커·2쪽 없음 (R3). N≥6 → page1Rows=앞 4행, page2Rows=나머지, 마커·2쪽 (R2).
- 2쪽 계 행 `total`은 `page2Rows` 소계가 **아니라** `heirData.itemRowsTotal`(전체 명세 합계)를 그대로 전달 — 분할되어도 ⑧·㉘ 정합. ⚠️ 결과적으로 **2쪽 표시 행 합(1쪽 4행 제외분) ≠ 계 행**: 계는 전체 명세 합계이므로 정상(다페이지 분할 출력의 합계 관례). 혼동 방지용 2쪽 보조 라벨은 §7 D-4.
- `BP2_ATTACHMENT_MARK="별첨"`는 **폐기**(1쪽 나가 실제 데이터 표시 → 별첨 개념 소멸). 사용처(NaStub·NaStubBlock) 제거 후 상수 삭제.

---

## 4. 변경 항목

### 4-1. 상수 `besshi-buppyo-2-constants.ts`
- `BP2_PAGE1_NA_ROWS`·`BP2_PAGE1_MAX_DATA`·`BP2_CONTINUATION_MARK` + `splitBuppyo2NaRows` 신설
- `BP2_ATTACHMENT_MARK` 삭제 (사용처 제거 후)

### 4-2. 화면 `Buppyo2NaTable.tsx`
- `Buppyo2NaStub` → **`Buppyo2NaPage1`로 교체**: props `{ rows: page1Rows, idx, needsContinuation }`
  - `rows`를 데이터 행으로 렌더(2쪽 `Buppyo2NaTable`의 행 렌더 로직 재사용 — 단 계행 없음)
  - `needsContinuation` 시 마지막(5번째) 행에 `⑪`칸(소재지) = `BP2_CONTINUATION_MARK`, 그 외 공란. else 빈행으로 5행까지 패딩
  - 행 렌더 공통화: 데이터 행 JSX를 내부 `NaDataRow`로 추출해 Page1·NaTable 공유(중복 제거, 800줄·단일소스)
- `Buppyo2NaTable`(2쪽): 행 렌더를 `NaDataRow`로 추출(리팩터) — prop·계행 동작 동일. 호출처가 `rows={page2Rows}`·`total={itemRowsTotal}` 전달. 패딩(`MIN_ROWS=8`)은 현행 유지(오버플로 소수 시 빈행 보충)

### 4-3. 화면 `Buppyo2HeirSheet.tsx`
- `const { page1Rows, page2Rows, needsContinuation, needsPage2 } = splitBuppyo2NaRows(heirData.itemRows);`
- 1쪽 나(53-58): `<Buppyo2NaPage1 rows={page1Rows} idx={idx} needsContinuation={needsContinuation} />`
- 1쪽 블록 `print:break-after-page`(36): **`needsPage2`일 때만** 적용(없으면 빈 페이지 방지)
- 2쪽 블록(66-86): **`{needsPage2 && (…)}`** 조건부. `<Buppyo2NaTable rows={page2Rows} total={heirData.itemRowsTotal} idx={idx} />` — **rows는 오버플로분(중복 없음), total은 전체 합계**

### 4-4. PDF `InheritanceBuppyo2PdfDocument.tsx`
- `NaStubBlock` → `NaPage1Block({ rows, needsContinuation })`: 화면과 동일 규칙(데이터 page1Rows + 마커/빈행, 5행)
- 본문에서 `splitBuppyo2NaRows(d.itemRows)` 호출 → Page1에 page1Rows·needsContinuation 전달
- **Page2(312-317): `{needsPage2 && <Page>…<NaBlock rows={page2Rows} total={d.itemRowsTotal}/></Page>}`** 조건부 (rows=오버플로분, total=전체 합계)
- `MIN_ROWS` page1용 5 분리(NaBlock 2쪽은 기존 8 유지 또는 별도)

---

## 5. 케이스 매트릭스 + anchor

### 5-1. 헬퍼 단위 anchor (`splitBuppyo2NaRows` — 신규 테스트)
| ID | N | page1Rows.length | page2Rows.length | needsContinuation | needsPage2 |
|---|--:|--:|--:|---|---|
| P-3 | 3 | 3 | 0 | false | false |
| P-5 | 5 | 5 | 0 | false | false (R3 경계) |
| P-6 | 6 | 4 | 2 | true | true (R2 경계) |
| P-16 | 16 | 4 | 12 | true | true (배우자 fixture) |

> **page1Rows + page2Rows = 전체 rows (무중복·무누락)** — 모든 N에서 `page1Rows.length + page2Rows.length === N` 불변식 anchor.

### 5-2. 컴포넌트/통합 anchor (선택 — testid)
- 1쪽 나 행 = 항상 5 (`buppyo2-na-page1-{idx}` 내 `tr` 5개)
- N≥6: 5번째 행에 `BP2_CONTINUATION_MARK` 텍스트 존재 (`buppyo2-na-continuation-{idx}`)
- N≤5: 2쪽(`buppyo2-sheet-{idx}-page2`) **미존재**; N≥6: 존재
- 배우자(16행): 1쪽 첫 4행 = 은행예금·부발농지·공장건물·골프회원권 + "별지 계속", 2쪽 **12행(5~16, 중복 없음)** + 계 4,210,000,000(전체 합계)

---

## 6. 변경 파일 + 14 동기화 지점

| 파일 | 변경 |
|---|---|
| `besshi-buppyo-2-constants.ts` | 상수 3 + `splitBuppyo2NaRows` 신설, `BP2_ATTACHMENT_MARK` 삭제 |
| `Buppyo2NaTable.tsx` | `Buppyo2NaStub`→`Buppyo2NaPage1`(데이터+마커) · `NaDataRow` 공통 추출 |
| `Buppyo2HeirSheet.tsx` | split 호출 + 1쪽 나 데이터 + 2쪽·break 조건부 |
| `InheritanceBuppyo2PdfDocument.tsx` | `NaPage1Block` + Page2 조건부 |
| `__tests__/calc/besshi-buppyo-2-pagination.test.ts` (신규) | P-3/5/6/16 헬퍼 anchor |

- **엔진·어댑터(`besshi-buppyo-2-data.ts`)·타입·Zod·route·validate 변경 0.** `itemRows`·`itemRowsTotal` 그대로 소비. 14지점 중 **⑤·⑦(표시)** 만 해당.
- 어댑터 무변경 ⇒ 금액 4버그(B1·B2·B4·C1) 수정과 **독립**. 별도 커밋 가능.

---

## 7. 확인 필요 (Do 진입 전)

| ID | 항목 | 결정/가정 |
|---|---|---|
| **D-1** | 2쪽 = 전체 vs 오버플로 | ✅ **결정: 오버플로(5~N) 중복 없이** (2026-06-02 사용자). 계 행 = 전체 합계 `itemRowsTotal` |
| **D-2** | 1쪽 "별지 계속" 표시 칸 위치 | `⑪ 소재지·법인명등` 칸(현 "별첨"과 동일 칸). 그 외 공란 |
| **D-3** | N≤5 시 빈행 패딩 표시 여부 | 5행 고정 위해 빈행 패딩(현 양식 빈칸 유지) |
| **D-4** | 2쪽 행 합 ≠ 계(전체합계) 혼동 방지 | 2쪽 제목 아래 보조 라벨 "(1쪽에서 계속)" 표시 권장. 계 행은 전체 합계 유지 |

---

## 8. 정책 준수

- **단일 진실** (dual-truth 0): 분할 판단은 `splitBuppyo2NaRows` 순수 함수 1곳, 화면·PDF 공유.
- **자동 안분 fallback 금지**: 데이터 슬라이스는 표시 한정(엔진 값 무변경). 계 합계·㉘는 전체 기준 유지.
- 금액 칸 `font-mono tabular-nums text-right`(`amount-column-align`) · "원" 미부착 · `print-only-css-toggle`(2쪽 조건부는 React 조건부 렌더) · 800줄 분리(`NaDataRow` 공통 추출) · 신규 테스트 `afterEach(cleanup)`.
- **page-split 미커밋 작업 위에 얹음** — `feedback_external_concurrent_edit_stale_read`: 착수 전 대상 라인 Read 재확인.
