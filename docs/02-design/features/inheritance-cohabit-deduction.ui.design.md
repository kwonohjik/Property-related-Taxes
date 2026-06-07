# 동거주택 상속공제(§23의2) 시기구분 정밀화 — UI 설계

> 엔진 설계: `inheritance-cohabit-deduction.engine.design.md`
> 계획서: `docs/00-pm/inheritance-cohabit-deduction-gap-plan.md` (Phase 1 = G1)
> 작성: 2026-06-07

## Context

엔진 Phase 1(G1)은 동거주택공제 율·한도를 상속개시일 기준 시기구분(0 / 40%·5억 / 80%·5억 / 100%·6억)으로 교체한다. **신규 입력 필드가 0개**이므로 UI 변경은 **결과 카드 라벨 동적화 1건(⑦)** 으로 국한된다. 현재 결과 카드 `CohabitDeductionDetailCard`는 한도·공제율을 **정적 문자열로 하드코딩**(`"6억 최고한도"` 등)하여, 2016~2019 상속분(한도 5억)에서 값(5억)과 라벨("6억")이 어긋나는 표시 모순이 발생한다.

---

## 14개 동기화 지점 — 실측 영향 (신규 input 0)

본 변경은 엔진 input 타입 무변경 → 클라이언트 8지점 중 **⑦만 영향**, API/Route 6지점 **전부 무영향**.

| # | 지점 | 영향 | 사유 |
|---|---|---|---|
| ① 폼 상태 | — | 무 | 신규 필드 없음. deathDate 기존 존재 |
| ② initial | — | 무 | 〃 |
| ③ normalize | — | 무 | 〃 |
| ④ API 변환 | — | 무 | `lib/calc/inheritance-*-api.ts` — deathDate 기존 전달 |
| ⑤ UI 입력 위젯 | — | 무 | 입력 폼 변경 없음 |
| ⑥ 사이드바 합계 | — | 무 | 동거주택공제는 사이드바 합계 미표시(엔진 result 후 결과 카드만) |
| **⑦ 결과 카드** | **O** | `CohabitDeductionDetailCard` 라벨 3곳 동적화 | 본 작업 유일 대상 |
| ⑧ Validation | — | 무 | 신규 필수 필드 없음 |
| ⑨~⑭ API/Route/Zod | — | 무 | input 타입 무변경 |

---

## 결과 카드 설계 (⑦) — `CohabitDeductionDetailCard`

**파일**: `components/calc/results/deduction-breakdown/CohabitDeductionDetailCard.tsx`
**단일 카드로 양 경로 커버**: 일반 경로·Phase E directAmount 경로 모두 `cohabitDeductionDetail`을 빌드 → `DeductionBreakdownSection.tsx:140`이 동일 카드에 전달. **한 곳 수정으로 두 경로 모두 정합**.

### 정정 대상 (값은 이미 동적, 라벨만 정적 → 동적화)

| 위치 | 현행 (정적) | 정정 (동적) | 비고 |
|---|---|---|---|
| `:52` | `` `공제율 ${(rate*100).toFixed(0)}% (2020.1.1. 이후: 100%)` `` | `` `공제율 ${(rate*100).toFixed(0)}%` `` | "(2020.1.1. 이후: 100%)" 정적 안내문 **제거** — 시기별 율이 이미 rate에 반영되어 오해 유발 |
| `:56` | `"6억 최고한도"` | `` `${(detail.cap/100_000_000).toFixed(0)}억 최고한도` `` | cap=5억/6억 동적 (0억 = pre-2009 엣지) |
| `:61` | `` `Min(공시가격 × ${(rate*100).toFixed(0)}%, 6억)` `` | `` `Min(공시가격 × ${(rate*100).toFixed(0)}%, ${(detail.cap/100_000_000).toFixed(0)}억)` `` | 한도 동적 |

### 표시 예시 (ASCII)

**2018년 상속, 주택 8억 (한도 5억 적용 — 수정 후)**:
```
동거주택 공제 (§23의2)                              500,000,000  ▼
  ┌────────────────────────────────────────────────────────┐
  │ 동거주택 공시가격 (평가액)              800,000,000        │
  │ 공제율 80%                              640,000,000        │   ← rate 동적
  │ 5억 최고한도                            500,000,000        │   ← cap 동적 (was "6억")
  │ ─────────────────────────────────────────────────────── │
  │ Min(공시가격 × 80%, 5억)                500,000,000        │   ← "5억" 동적 (was "6억")
  └────────────────────────────────────────────────────────┘
```

**2024년 상속, 주택 8억 (한도 6억 — 회귀 보존)**:
```
  │ 공제율 100%                             800,000,000        │
  │ 6억 최고한도                            600,000,000        │
  │ Min(공시가격 × 100%, 6억)               600,000,000        │
```

### 금액 칸 정렬
- 기존 `DetailRow`/`SubTotalRow`(`shared.tsx`) 사용 — `value`는 `formatKRW()` 통과. 실측상 공용 컴포넌트는 `font-mono`만 적용(`shared.tsx:35,:89,:127`), `tabular-nums`·명시 `text-right`는 미적용(라벨 좌/값 우 flex justify-between 레이아웃).
- **본 변경은 라벨 텍스트 3곳만 수정**(행 추가·금액 컬럼 신설 없음) → 정렬 개선은 범위 외. (개선 희망 시 `amount-column-align` 스킬로 별도 작업 — 본 PDCA 비포함)

### "원" 단위 표기
- `formatKRW` 기존 사용 — 결과 정책 준수(끝 "원" 미표기 확인은 기존 컴포넌트 책임, 본 변경 무관).

---

## 입력 위젯 (⑤) — 변경 없음

- 동거주택 상속공제 입력은 기존 2개 토글로 유지 (본 변경 무관, 회귀만 확인):
  - `HeirComposition.tsx:368` — `isCohabitant` 토글(자녀 한정, violet)
  - `EstateBodyRealEstate.tsx:387` — `isCohabitantHouse` 자산 토글(violet, 1세대1주택 단일선택)
- 상속개시일(`deathDate`)은 기존 Step 입력 — 시기구분의 입력 소스이나 **신규 위젯 아님**.

---

## Validation (⑧) — 변경 없음

- 신규 필수 필드 없음. 기존 validation 유지.
- UI 통과 ↔ validate 차단 모순 없음(필드 무변경).

---

## E2E 시나리오 (`e2e/inheritance-cohabit-deduction.spec.ts`)

| ID | 시나리오 | 기대 |
|---|---|---|
| E2E-1 | 상속개시일 2018-06-01 + 동거주택(자녀 동거 체크) 공시가격 8억 → 계산 | 결과 카드 "5억 최고한도" + 공제 5억 표시 |
| E2E-2 | 상속개시일 2024-06-01 + 동거주택 8억 → 계산 | "6억 최고한도" + 공제 6억 (회귀) |

- worktree 시 `E2E_PORT=3100` (memory `feedback_e2e_worktree_port_isolation`).
- "브라우저 확인" = spec 통과로 충족(memory `feedback_browser_verify_with_playwright`).

---

## 7대 사용자 동기화 지점 점검

- [x] DateInput — deathDate 기존(type="date" 미사용)
- [x] CurrencyInput/DecimalInput — 결과 카드는 입력 위젯 없음(표시만)
- [x] 결과 산식 한국어·약어 금지 — `Min(공시가격 × N%, K억)` 한국어 풀어쓰기 유지
- [x] "원" 단위 미표기 — formatKRW 기존
- [x] 내부 id 노출 없음 — 해당 없음
- [x] 금액 칸 정렬 — 공용 DetailRow 기존
- [x] 토글 가시성 — 입력 토글 변경 없음(기존 violet ToggleCard 유지)

---

## 작업 분담

- **엔진 시니어**(`inheritance-gift-tax-senior`): `cohabitRateAndCap` + 일반/Phase E 경로 교체 + anchor CH-RATE-1~8.
- **UI 시니어**(`inheritance-gift-tax-ui-senior`): `CohabitDeductionDetailCard` 라벨 3곳 동적화 + E2E 2건. (엔진 detail.cap/detail.rate가 이미 동적이므로 라벨 바인딩만)
- 충돌 없음: 엔진은 `inheritance-deductions.ts`, UI는 `CohabitDeductionDetailCard.tsx` — 파일 분리.
