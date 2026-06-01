# 상속세 결과 — 영리법인 면제 카드 2개 → 단일 섹션 통합 계획서

> 작성일 2026-06-01 · 대상 상속세 결과 화면(`InheritanceTaxResultView`) · **UI 전용**(엔진·타입 변경 0)

## 1. 문제 (이미지9)

영리법인 사전증여 면제(§3의2②) 관련 카드가 **시각적으로 분리된 2개**로 떠 화면이 혼란스럽다.

| # | 카드 | 위치 | 렌더 조건 | 내용 |
|---|---|---|---|---|
| ① | "영리법인 사전증여 면제 (§3의2② · 집행기준 28-0-1)" (인라인 violet 카드) | `InheritanceTaxResultView.tsx:314~339` | `corporateExemption.amount > 0` | 증여세 산출세액·면제 한도·면제세액 Min 3행 + "상속세 산출세액에서 차감 −150,000,000" |
| ② | "🏢 부표 5 — 영리법인 상속세 면제 및 납부 명세서" | `CorporateExemptionFilingFormTable.tsx` (`:341~348`에서 렌더) | `perCorporateBreakdown.length > 0` | 가. 면제대상 영리법인(①~⑥) + 나. 납부 대상자(⑦~⑪) 표, 펼침 토글 |

둘 다 violet 테마·§3의2② 동일 주제인데 **별개 카드처럼 보여** 사용자가 두 기능으로 오인. 데이터 출처는 모두 `result.corporateExemption` 한 객체(`amount`·`limit`·`breakdown`·`perCorporateBreakdown?`).

> **(정정 R1-A) 통합 범위 경계** — 본 통합은 **결과 화면의 ①②만** 대상. 아래는 별개·무관(유지):
> - 입력 단계 `components/calc/inheritance/CorporateHeirFields.tsx:183` "부표 5 — 영리법인 면제 명세" (영리법인 수유자 ②③·주주 입력 폼)
> - `components/calc/results/InheritanceFilingFormTable.tsx` 부표 1 사전증여 보조 명세(영리법인은 부표5 별도 양식이라 언급만)
> - 과세 요약 상단 "영리법인 면제 (§3의2②)" SummaryRow (직전 PR `c3b4881`, 산식 행)

## 2. 목표

**하나의 violet 섹션**으로 통합. 단일 헤더 아래 (a) 면제 산출 요약(상시 노출) → (b) 부표 5 명세서(펼침)로 위계화.

## 3. 설계 — 단일 `CorporateExemptionSection`

기존 `CorporateExemptionFilingFormTable`을 **섹션 컴포넌트로 확장**하고 인라인 카드(①)를 흡수.

```
┌─ [§3의2②] 영리법인 상속세 면제 (§3의2②)                              ← 단일 헤더 ─┐
│   집행기준 28-0-1 · 시행규칙 별지 제9호서식 부표 5                    ← 부제      │
│  ── 면제 산출 (상시 노출) ──                                                   │
│   영리법인 증여세 산출세액                              150,000,000            │  ← ① breakdown
│   면제 한도 (산출세액 × 영리법인 과세표준 ÷ 상속세 과세표준)  272,874,251        │
│   면제세액 Min(증여세 산출세액, 한도)                   150,000,000            │
│   ─────────────────────────────────────────────                              │
│   상속세 산출세액에서 차감 (면제)                       − 150,000,000  (bold)   │
│                                                                               │
│  ── 부표 5 — 면제 및 납부 명세서   [▼ 펼치기 (인쇄 시 자동 펼침)] ──            │  ← ② (perCorporate 있을 때만)
│   가. 상속세 면제대상 영리법인 (①~⑥) ...                                       │
│   나. 상속세 납부 대상자 (⑦~⑪) ...                                            │
└───────────────────────────────────────────────────────────────────────────────┘
```

- **헤더 1개 (확정 문자열)**: 메인 제목 = **"영리법인 상속세 면제 (§3의2②)"**, 부제 = "집행기준 28-0-1 · 상속세 및 증여세법 시행규칙 별지 제9호서식 부표 5" + §3의2② 배지. ("사전증여 면제"·"부표 5" 두 제목 → 단일화).
  - **(정정 R2-A)** 메인 제목은 과세요약 SummaryRow "영리법인 면제 (§3의2②)"(상속세 없음)와 **다른 문자열** → E2E·테스트는 exact "영리법인 상속세 면제 (§3의2②)"로 구분. 집행기준·부표5는 **부제로만** 표기(메인 제목에 인라인 금지 — 목업·E2E 일치).
- **면제 산출 요약(상시)**: 기존 ① 카드의 `breakdown` 3행(증여세 산출세액·면제 한도·면제세액 Min) + 차감 bold 행을 섹션 상단 band로 이동.
  - **(정정 R1-C)** `breakdown`의 3번째 행("영리법인 면제세액 Min …")과 bold 차감 행은 **둘 다 `amount`(150,000,000)** — 의도된 강조(차감 행은 "산출세액에 적용" 강조). 중복으로 보여도 dedupe 금지(현행 동작 보존).
  - **(정정 R1-F)** 요약 band는 펼침 토글 wrapper(`open ? "block" : "hidden print:block"`) **바깥**에 위치 — 화면·인쇄 모두 상시 노출.
- **부표 5 명세서(펼침)**: 기존 ②의 가./나. 표를 헤더 아래 collapsible sub-section으로. **펼침 토글은 부표 5 표에만** 적용(요약은 항상 노출). `print-only-css-toggle` 정책 유지(`hidden print:block` + 토글 `print:hidden`).
- **`perCorporateBreakdown` 없을 때**(영리법인 사전증여에 `doneeId` 미설정 → 부표 5 데이터 없음, `inheritance-tax.ts:630` `length>0 ? items : {}`): 부표 5 sub-section·토글 **미렌더**, 면제 산출 요약만 노출. (현행 ① 카드 단독 표시와 동일 동작·시각만 통합.)

### 렌더 조건 일원화
- 섹션 노출: `corporateExemption && corporateExemption.amount > 0` (현행 ① 조건과 동일).
- 부표 5 sub-section: `perCorporateBreakdown?.length > 0` (현행 ② 조건과 동일).

## 4. 구현 변경

### 4-1. `components/calc/results/CorporateExemptionFilingFormTable.tsx` → `CorporateExemptionSection.tsx` (rename 권장)
- **props 변경**: `{ perCorporateBreakdown, heirs }` → `{ corporateExemption: CorporateExemptionResult, heirs }`.
  내부에서 `corporateExemption.breakdown`(요약)·`corporateExemption.amount`(차감)·`corporateExemption.perCorporateBreakdown`(부표5) 사용.
  - **(정정 R2-B — 검증)** `CorporateExemptionResult`는 컴포넌트가 이미 import하는 배럴 `@/lib/tax-engine/types/inheritance-gift.types`에서 re-export됨(`:737`) → 동일 import 라인에 타입만 추가, 신규 경로 불필요.
- 상단에 면제 산출 요약 band(① 카드 JSX 이식) 추가. 기존 가./나. 표는 collapsible sub-section으로 유지(토글 라벨 "부표 5 명세서").
- **(정정 R1-G — 검증 완료)** 컴포넌트 import 사이트는 **prod 1곳(`InheritanceTaxResultView.tsx:25`) + 테스트 1곳(`corporate-exemption-filing-form-table.test.tsx:9`)뿐** (grep 실측). rename 시 이 2곳 + 테스트 describe명 동기화. (rename 부담 크면 파일명 유지·export만 확장 가능 — 명칭이 "FilingFormTable"이라 요약 흡수와 불일치 → rename 권장.)

### 4-2. `components/calc/results/InheritanceTaxResultView.tsx`
- 인라인 ① 카드(`:314~339`) **삭제**.
- ②의 `CorporateExemptionFilingFormTable`(`:341~348`) 호출 → `CorporateExemptionSection`으로 교체, prop `corporateExemption={result.corporateExemption}` 전달.
- 노출 조건을 `result.corporateExemption && result.corporateExemption.amount > 0`로(요약 상시 노출 보장). 부표 5 유무는 섹션 내부에서 판단.

### 4-3. 영향 없음(확인)
- 엔진·타입(`CorporateExemptionResult`)·`result.corporateExemption` 데이터 구조 **무변경**. 14 동기화 지점 중 ⑦(결과 카드)만 해당.
- 과세 요약 상단의 "영리법인 면제 (§3의2②)" SummaryRow(`:272` 부근, 직전 PR `c3b4881` 추가)는 **별개**(과세 요약 산식 행) — 본 통합과 무관, 유지.

## 5. 테스트·검증

- **컴포넌트 테스트** `__tests__/components/calc/results/corporate-exemption-filing-form-table.test.tsx`: props 변경 반영(`perCorporateBreakdown={[...]}` → `corporateExemption={{ amount, limit, breakdown, perCorporateBreakdown }}`). **(정정 R1-B)** 가드 anchor 2케이스로 재정의:
  - `amount === 0` → 섹션 `null`(미렌더) — 기존 F5-6 null 가드 대체.
  - `amount > 0` + `perCorporateBreakdown === []` → **요약 band 노출 + 부표5 sub-section·토글 미렌더** (신규 케이스).
  - `amount > 0` + `perCorporateBreakdown=[detail]` → 요약 + 가./나. 표 모두 렌더(F5-7·F5-8 유지, props만 corporateExemption로 래핑).
- **E2E** `e2e/inheritance-corporate-exemption-filing-credit.spec.ts` 확장: 결과 화면에서
  - **(정정 R1-D·R2-A)** 카드 메인 제목 `getByText("영리법인 상속세 면제 (§3의2②)", { exact: true })` 1개 + 구 인라인 카드 제목 `getByText(/영리법인 사전증여 면제/)` **count 0**(분리 카드 제거 확인). ※ 과세요약 SummaryRow "영리법인 면제 (§3의2②)"(상속세 없음)와 혼동 금지 → 메인 제목 **exact** 사용.
  - 면제 산출 요약(차감 −금액) 상시 노출.
  - 부표 5 토글 펼침 → "가. 상속세 면제대상 영리법인" 표 노출.
- **회귀**: `npx vitest run __tests__/components/calc/results/ __tests__/components/calc/inheritance/farming-section.test.tsx`(InheritanceTaxResultView 렌더 — 영리법인 카드 미단언이나 JSX 변경 영향 가드) + 결과화면 E2E(`inheritance-summary-table`·`heir-allocation-table`·`prior-gift-corporate-tax`·`corporate-exemption-filing-credit`) 0건. `tsc`·lint 0.

## 6. 확인 필요 / 결정 사항

- **부표 5 기본 펼침 상태**: 현행 기본 접힘(`open=false`, 인쇄 시 자동 펼침). 통합 후에도 동일 유지 권장(요약은 상시, 명세서는 접힘 시작). 사용자가 기본 펼침을 원하면 `useState(true)`로 조정.
- **rename 여부**: `CorporateExemptionFilingFormTable` → `CorporateExemptionSection`. 명확성 위해 권장하나 import·테스트 2곳 동기화 필요. 보류 시 파일명 유지하되 컴포넌트 책임이 "표"를 넘어섬을 주석 명시.

## 7. 검토 정정 이력

### 1차 검토 (코드 실증)
- **R1-A (누락)**: 통합 범위 경계 명시 — 입력측 `CorporateHeirFields` 부표5·`InheritanceFilingFormTable` 부표1·과세요약 SummaryRow는 무관·유지 (§1 박스 추가).
- **R1-B (누락)**: 가드 anchor를 `amount=0 → null` / `amount>0+빈 perCorporate → 요약만` 2케이스로 정밀화 (§5).
- **R1-C (정밀)**: `breakdown` Min 행 + bold 차감 행 둘 다 `amount` — 의도된 강조, dedupe 금지 (§3).
- **R1-D (모순 위험)**: E2E에서 카드 헤더("영리법인 상속세 면제…")와 과세요약 SummaryRow("영리법인 면제…") exact 구분 + 구 카드 텍스트 count 0 (§5).
- **R1-F (누락)**: 요약 band는 펼침 토글 wrapper 바깥 — 화면·인쇄 상시 노출 (§3).
- **R1-G (검증)**: 컴포넌트 import = prod 1 + 테스트 1뿐 (grep 실측) → "import 1곳" 주장 확정 (§4-1).

### 2차 검토 (코드 실증)
- **R2-A (모순)**: 헤더 문자열 불일치 — §3 목업("…· 집행기준 28-0-1" 인라인) vs §3 본문(부제 분리) vs §5 E2E. → 메인 제목 "영리법인 상속세 면제 (§3의2②)" 확정, 집행기준·부표5는 부제로만, 목업·본문·E2E 일치 정정 (§3·§5).
- **R2-B (검증)**: `CorporateExemptionResult`가 컴포넌트 기존 import 배럴(`inheritance-gift.types:737`)에서 re-export됨 → 신규 경로 불필요 확정 (§4-1).

### 3차 — Do 단계 실측 환류
- **D-1 (E2E strict-mode)**: 부표1 보조명세(`InheritanceFilingFormTable`)에도 동일한 "▼ 펼치기 (인쇄 시 자동 펼침)" 토글이 있어 페이지 전역 `getByRole(button, /펼치기/)`가 2개 매칭 → 부표5 헤더 텍스트 부모(`.locator("..")`)로 스코프해 해소.
- **D-2 (컴포넌트 테스트)**: 헤더 부제 "…별지 제9호서식 부표 5"가 **상시 노출**되므로 "부표 5 미렌더"를 `/부표 5/` 부재로 단언 불가 → 표 마커("가. 상속세 면제대상"·"나. 상속세 납부 대상자")·펼침 버튼 부재로 판정.
- **결정 반영**: 부표5 기본 접힘 유지(`useState(false)`), `CorporateExemptionFilingFormTable`→`CorporateExemptionSection` rename(파일·import·테스트 동기화).
- **결과**: tsc 0, lint 0, 컴포넌트 테스트 CES-1~4 + E2E CE-1·CE-2 통과, 전체 `npm test` 5,880 PASS·0 FAIL, 결과화면 E2E 10 PASS 회귀 0.
