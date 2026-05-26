# UI 개선 작업 계획서 — 비상장 V2 사업연도 표 상하 정렬 · 순자산가액 표 라벨 폭 확대

작성일: 2026-05-27
대상: 비상장주식 V2 정식평가 폼 (상속·증여세 공용)

## 개요

사용자 요청 2건. 모두 `components/calc/inheritance/unlisted-stock-v2/` 의 표 레이아웃 정렬·폭 조정. 엔진·폼 데이터 변경 없음(순수 CSS/그리드).

- **작업 A** — `FiscalYearAdjustmentTable`: 상단 연도/개시일/종료일 입력 3열의 **폭·가로 위치**를 하단 ①②③ 입력 3열과 일치시킴(세로 정렬).
- **작업 B** — `NetAssetCalculationTable`: 좌측 라벨 영역을 **2배 확대**, 우측 입력란 폭을 그만큼 축소. (인터뷰 확정: 표 전체 일관 — 자산/부채행 + 보험 준비금행 모두)

---

## 작업 A — 사업연도 표 상단·하단 입력 열 정렬

### 현황 (불일치 원인)
`components/calc/inheritance/unlisted-stock-v2/FiscalYearAdjustmentTable.tsx`

- **상단 헤더** (L131): `<div className="grid grid-cols-4 gap-2">`
  - 첫 열 = 빈 spacer `<div></div>` (L132), 나머지 3열 = 연도 input + 개시일/종료일 `DateInput`.
  - `grid-cols-4` → 각 열이 전체의 **1/4 균등**. 첫 열(spacer)도 1/4.
- **하단 입력** (L200): `<table className="w-full text-[11px]">`
  - 첫 `<td>` = 행 라벨(`row.label`, 예 "① 각 사업연도 소득금액 (법인세법 §14 …)"), 나머지 3 `<td>` = `CurrencyInput`.
  - `<table>` 기본 **auto layout** → 긴 라벨 td가 내용에 맞춰 넓어짐(1/4보다 큼) → 입력 3열이 더 좁아지고 오른쪽으로 밀림.

→ **상단 spacer(1/4) ≠ 하단 라벨열(가변, 더 넓음)** 이라 상하 입력열의 폭·시작 위치가 어긋남(이미지 6 증상).

### e2e 영향 사전 확인 (재검증 2026-05-27)
- **상단 헤더는 이미 grid**(`grid-cols-4`) → 작업 A는 이 className만 `grid-cols-[<L>_repeat(3,1fr)]`로 변경. 자식 구조(L137 `<div className="space-y-1">` + "1년전 ×3" + 연도 input + 개시/종료 DateInput)는 **불변**.
- `annualize.spec.ts`는 `locator("text=1년전 ×3").locator("..")`·`text=개시일`·`text=종료일` 등 **텍스트 기반 부모 탐색** → 상단 className 변경에 **영향 없음** ✅ (단 해당 spec L74 주석 "구조: grid-cols-4 …"는 stale → 주석만 갱신).
- `section56-5.spec.ts` L67 `page.locator("tr").filter(...)`·L72 종료일 접근은 **하단 `<table>`을 grid로 바꾸는 안 1에서만** `tr` 셀렉터가 깨짐(아래 검증 항목 참조).

### 변경 방식 — 상단·하단을 동일 컬럼 트랙으로 통일
상단 grid와 하단 표가 **같은 `grid-template-columns`(라벨열 1 + 입력 3열)** 를 공유하도록 맞춘다. 두 안 중 택1(Do 단계에서 정밀 정렬 결과로 결정):

- **안 1 (권장) — 하단 `<table>` → CSS grid 전환**
  - 하단 각 행을 `<div className="grid grid-cols-[<L>_repeat(3,1fr)] gap-2 items-center">` 로, 라벨 1 + 입력 3.
  - 상단 헤더도 동일하게 `grid-cols-[<L>_repeat(3,1fr)] gap-2` 로 변경(현 `grid-cols-4` 대체, 첫 열은 빈 spacer 유지).
  - 미리보기 행("다. 순손익액", L232~243)도 같은 grid로 전환.
  - 장점: 상·하단이 **완전 동일 트랙** → 픽셀 정렬 보장. gap·padding 단일 기준.
- **안 2 (최소 변경) — `<table>` 유지 + `table-fixed` + colgroup**
  - `<table className="w-full text-[11px] table-fixed">` + `<colgroup>`: 라벨열 `<col className="w-[<L>]"/>` + 입력열 `<col/>`×3(균등).
  - 상단 헤더 grid를 `grid-cols-[<L>_1fr_1fr_1fr]` 로 변경.
  - 주의: table의 cell 간격(border-spacing/td `px-1`)과 grid `gap-2`가 달라 **미세 어긋남** 가능 → td padding과 grid gap을 맞춰야 함. 정렬 정밀도는 안 1이 우월.

### 라벨열 고정폭 `<L>` 결정
- 하단 최장 라벨(①·⑮ 등)이 **2줄 이내**로 들어가는 폭. 현재 이미지에서도 라벨은 2줄 wrap 상태.
- 잠정 `13rem`(208px) 제안 → Do 단계 브라우저에서 2줄 이내 확인 후 ±1~2rem 미세조정.
- 상단 spacer 폭 = 하단 라벨열 폭 = `<L>` 동일값(단일 상수로 관리 권장: 컴포넌트 내 `const LABEL_COL = "13rem"` 또는 Tailwind 임의값 통일).

### 입력 위젯 폭 영향 확인
- 입력 3열이 `1fr`로 균등해지면 각 열 폭 = (100% − `<L>` − gap×3) / 3.
- 상단 `DateInput`("YYYY - M - D" 3분할)이 좁아진 칸에 들어가는지 **브라우저 실측 필수**. 넘치면 `<L>`을 약간 줄이거나 DateInput 폰트/패딩 조정(작업 범위 내).
- 연도 input·CurrencyInput은 `w-full`이라 자동 적응.

### 영향 파일
- `components/calc/inheritance/unlisted-stock-v2/FiscalYearAdjustmentTable.tsx` (상단 헤더 grid + 하단 표 구조)

---

## 작업 B — 순자산가액 표 좌측 라벨 폭 2배 확대

### 현황
`components/calc/inheritance/unlisted-stock-v2/NetAssetCalculationTable.tsx`

| 영역 | 라인 (재검증 2026-05-27) | 현재 grid |
|---|---|---|
| 자산총액 행 (ASSET_ROWS) | L169 | `grid grid-cols-[8rem_1fr]` |
| 부채총액 행 (LIABILITY_ROWS) | **L206** | `grid grid-cols-[8rem_1fr]` |
| 보험 준비금 행 ×3 (책임/비상위험/해약환급) | **L245·259·273** | `grid grid-cols-[12rem_1fr]` |

> grep 전수 확인 결과 NetAsset의 `grid-cols-[Xrem_1fr]`는 위 **5개소뿐**(누락 행 없음). 소계 행(⑧·⑲)은 `flex justify-between`이라 별개.

좁은 라벨열(8rem) 탓에 "지급받을 권리 확정 가액", "기타(충당금 중 …)" 등이 3줄 wrap(이미지 7).

### 변경 (인터뷰 확정: 표 전체 일관 2배)
- 자산총액 행 L169: `grid-cols-[8rem_1fr]` → `grid-cols-[16rem_1fr]`
- 부채총액 행 L206: `grid-cols-[8rem_1fr]` → `grid-cols-[16rem_1fr]`
- 보험 준비금 행 L245·259·273: `grid-cols-[12rem_1fr]` → `grid-cols-[24rem_1fr]`
- 우측 입력(`1fr`)은 자동으로 축소 → 별도 수정 불필요.

### 검토 포인트
- **입력란 축소 영향**: 16rem 라벨 후 입력란이 좁아져도 금액 콤마 표기(12~15자, `CurrencyInput` `w-full`)는 표시 가능. 단 매우 큰 금액에서 빡빡할 수 있어 **브라우저 실측**(섹션 카드 전체 폭은 충분).
- **소계 행 유지**: ⑧ 자산총액 소계(L195)·⑲ 부채총액 소계(L224)는 `flex justify-between`(라벨-값 양끝)이라 grid 무관 → 변경 없음.
- **반응형**: 좁은 화면(모바일)에서 16rem/24rem이 과도할 수 있으나, 본 표는 데스크톱 정식평가 폼 중심. 모바일에서 입력란이 과도하게 좁으면 `sm:` 분기로 데스크톱에서만 확대 적용 검토(Do 단계 판단).
- **`평가차액 ②` read-only 행**(`isDeltaRowLocked`, L164)도 자산행 grid를 공유 → 동일 16rem 적용됨(일관).

### 영향 파일
- `components/calc/inheritance/unlisted-stock-v2/NetAssetCalculationTable.tsx` (grid-cols 3종)

---

## 작업 순서

1. **작업 B** (라벨 폭) — 단순 grid-cols 토큰 교체, 위험 낮음.
2. **작업 A** (사업연도 정렬) — 표 구조 변경 + 브라우저 정밀 정렬.

## 검증 (Definition of Done)

- [ ] `npx tsc --noEmit` 0건 / `npm run lint`
- [ ] **작업 A**: 데스크톱에서 상단 연도/개시일/종료일 입력 3열이 하단 ①②③ 입력 3열과 **세로 정렬 + 동일 폭**. `DateInput`("YYYY-M-D")이 좁아진 칸에서 잘림 없음 (브라우저 실측)
- [ ] **작업 B**: 자산/부채행 라벨 16rem, 보험 준비금행 24rem. 라벨 가독 향상(긴 항목 줄 수 감소), 입력란 금액 표시 정상 (브라우저 실측)
- [ ] 기존 회귀: `e2e/inheritance-unlisted-*.spec.ts`(6개) + `npm test` 전체 통과 — 표 구조 변경(작업 A 안 1 선택 시 `<table>`→grid)이 `tr`/`td` 기반 locator를 깨지 않는지 사전 grep. 특히 `inheritance-unlisted-capital-increase-section56-5.spec.ts`의 `page.locator("tr").filter({ hasText: "각 사업연도 소득금액" })` (L67) + L72 종료일 접근 — table→grid 전환 시 `tr` 셀렉터가 깨지므로 **안 1 채택 시 해당 spec의 locator를 `[role]`/텍스트 기반으로 보정 필요**. (`annualize.spec.ts`는 텍스트 기반이라 영향 없음 — 단 L74 주석 "grid-cols-4" stale 갱신)

## 미결/후속

- 작업 A 구현 방식(안 1 grid 전환 vs 안 2 table-fixed) 최종 선택 — 정렬 정밀도(안 1) vs 기존 `tr` 셀렉터 호환(안 2)의 trade-off. 안 2가 e2e 보정 없이 끝나면 우선 검토
- 라벨열 고정폭 `<L>` 최종값(잠정 13rem)
- 모바일에서 라벨 폭 확대의 `sm:` 분기 여부
