# 종합부동산세 갭 해소 (comprehensive-tax-gaps) — UI 설계

> Plan: `docs/01-plan/features/comprehensive-tax-gaps.plan.md` · 엔진: `comprehensive-tax-gaps.engine.design.md`
> UI 범위: Phase A(page 텍스트·필드 제거) + Phase B(ToggleCard 전환) + Phase C-3(의무임대기간 입력·경고 표시) + Phase D(E2E)

## 사용 컴포넌트 (import 경로 실측)

- `ToggleCard` — `@/components/calc/inputs/ToggleCard` (ExclusionInfoInput.tsx:18에서 이미 사용 중)
- `DateInput` — `@/components/ui/date-input` (〃 :17)
- `DecimalInput` — `@/components/calc/inputs/DecimalInput.tsx` 실존 확인 (연수 입력, memory `feedback_decimal_input`)
- E2E 헬퍼 — `e2e/_helpers/tax-flow.ts`: `fillAndVerify`(:45) · `fillDateAndVerify`(:59) · `calcAndWaitResult`(:208)

---

## 1. Phase A — page.tsx 텍스트·필드 제거 (UI 측)

| 위치 | 변경 |
|---|---|
| `page.tsx:150` | `(§8③, §9②)` → `(§8①1호, §9②)` |
| `page.tsx:423~444` | `multi-house-adjusted` 체크박스 블록 전체 삭제 (Step5TaxCap에는 전년도 세액 입력 + 안내 박스만 잔존) |
| `page.tsx:456~458` | 안내 박스: "상한액 = 전년도 세액 × 상한율 (150% 또는 300%)" → "상한액 = 전년도 세액 × 150% (종합부동산세법 §10)" |
| `page.tsx:569` | body 구성 `isMultiHouseInAdjustedArea` 라인 삭제 |
| `comprehensive-wizard-store.ts:87, 136` | 필드·초기값 삭제 |

Step5 잔존 구조 (삭제 후):

```
┌─ Step 5: 세부담 상한 ─────────────────────────┐
│ [CurrencyInput] 전년도 총세액 (선택)            │
│ ┌─ 안내 박스 ─────────────────────────────┐  │
│ │ 세부담 상한 계산 방식 (§10)               │  │
│ │ 상한액 = 전년도 세액 × 150% (… §10)       │  │
│ │ 당해 종부세가 상한액 초과 시 …            │  │
│ └─────────────────────────────────────────┘  │
└───────────────────────────────────────────────┘
```

## 2. Phase B — native checkbox 3개 → ToggleCard

| 위치 | 필드 | tone | title | description | children (ON 시 펼침) |
|---|---|---|---|---|---|
| `page.tsx:136~152` Step1Basic | `isOneHouseOwner` | sky | "1세대 1주택자" | "기본공제 12억 적용 + 고령자·장기보유 세액공제 적용 (§8①1호, §9②)" | 기존 `:155~189` 생년월일·취득일 블록을 children으로 이전 |
| `page.tsx:272~287` Step4Land | `hasAggregateLand` | sky | "종합합산 토지 보유" | 기존 안내문 유지 | 기존 조건부 렌더 토지 입력 블록 이전 |
| `page.tsx:344~357` Step4Land | `hasSeparateLand` | sky | "별도합산 토지 보유" | 기존 안내문 유지 | 기존 조건부 렌더 토지 입력 블록 이전 |

- 바인딩: `checked={formData.x}` / `onCheckedChange={(v) => updateFormData({ x: v })}` — store 구조 무변경 (⑤만).
- OFF 상태에서도 tone 배경 유지 (memory `feedback_toggle_card_visibility`).
- Phase A에서 GAP-3 문구를 먼저 고치므로 description은 정정된 문구를 사용.

## 3. Phase C-3 — 의무임대기간 입력 + 경고 표시

### 3-1. store (① ② ③)

```ts
// lib/stores/comprehensive-wizard-store.ts — PropertyEntry (string 기반, 기존 :29 rentalRegistrationDate 패턴 동일)
registrationRevokedDate: string;   // "YYYY-MM-DD" 또는 "" (미입력)
actualRentalYears: string;         // DecimalInput 원문 또는 ""

// makeProperty() 초기값: 둘 다 ""
```

기존 PropertyEntry가 빈 문자열 초기값 + string 보관 패턴(:104)이므로 동일 패턴 채택. 3-state 토글 derive 금지 이슈 없음 (단순 optional 입력).

### 3-2. 입력 위젯 (⑤) — `ExclusionInfoInput.tsx` `RentalExclusionDetail`

위치: 임대개시일 블록(:107~119) 다음, "최초 임대차 계약" ToggleCard(:122~) 앞.

```
┌─ (기존) 임대개시일 [DateInput] ────────────────────┐
├─ [신규] 실제 임대 경과 연수 (선택) [DecimalInput] ──┤
│   hint: 임대 기산일부터 과세기준일까지 경과 연수.    │
│         미입력 시 의무임대기간 경고 생략.            │
│         상속·합병 승계 임대기간은 합산하여 입력      │
│         (시행령 §3⑦).                              │
├─ [신규] ToggleCard tone=rose "임대등록 말소"  ──────┤
│   description: 의무임대기간 중 자진·직권 말소 시     │
│   OFF(기본) — 입력 없음                             │
│   ON children: 말소일 [DateInput]                   │
│     hint: 말소일이 과세기준일(6월 1일) 이전이면      │
│           합산배제가 적용되지 않습니다 (시행령 §3①). │
└────────────────────────────────────────────────────┘
```

- 말소 ToggleCard는 **파괴적 결과(배제 거부)를 만드는 예외 입력**이므로 tone rose, 기본 OFF.
- ToggleCard OFF → ON 전환 시 말소일 ""; OFF 복귀 시 `registrationRevokedDate: ""`로 초기화 (stale 값으로 silent 거부 방지). OFF 시 API에 미전송.
- ⚠️ ToggleCard ON 여부를 별도 boolean으로 store에 두지 않음 — `registrationRevokedDate !== ""` derive 금지 원칙과 충돌하지 않도록 **로컬 useState**로 펼침만 관리, 값은 store 단일 (3-state 메모리는 배열 토글 대상 — 본 건은 단일 문자열 필드라 OFF 복귀 시 값 초기화로 충분).

### 3-3. API 변환 (④ ⑬) — `page.tsx` `callComprehensiveApi` rentalInfo 블록(:505~515)

```ts
rentalInfo: {
  // ... 기존 9필드 ...
  registrationRevokedDate: p.registrationRevokedDate || undefined,  // silent fallback 금지 — || undefined만
  actualRentalYears: p.actualRentalYears ? parseDecimal(p.actualRentalYears) : undefined,
},
```

- `parseDecimal`은 `components/calc/inputs/DecimalInput.tsx:88` export 실측. ⚠️ page.tsx:21이 `import { CurrencyInput, parseAmount }` 한 라인 다중 named — `parseDecimal` import는 **별도 라인으로 추가** (ESLint `--fix`가 미사용 정리 시 같은 라인의 사용 중 export까지 제거하는 함정, CLAUDE.md 명시).

### 3-4. Zod·Route (⑫ ⑭) — 엔진 설계 인수 확인용 체크

- ⑫ `lib/validators/comprehensive-input.ts` `rentalExclusionInfoSchema`에 2필드 (string date regex 패턴 :49~57 준수).
- ⑭ `route.ts` `toEngineInput` rentalInfo 블록(:56~63)에 `parseDate` 조건부 변환.
- 자가점검 grep: `grep -n "registrationRevokedDate" lib/validators/comprehensive-input.ts app/api/calc/comprehensive/route.ts app/calc/comprehensive-tax/page.tsx` → 3파일 모두 hit.

### 3-5. 결과 표시 (⑦)

- **전역**: `ComprehensiveTaxResultView.tsx:480~483` 기존 `result.warnings` 렌더 채널 그대로 — 엔진이 "임대주택 N번째: …" 접두 포함본을 병합하므로 UI 변경 없음.
- **합산배제 카드**: 합산배제 결과 표시부에서 `aggregationExclusion.propertyResults[].warnings`(코어 메시지) 존재 시 amber 배지 + 문구. Tailwind 정적 매핑 (`bg-amber-50 border-amber-200 text-amber-800` 직접 표기 — dynamic `bg-${tone}` 금지).
- 사이드바(⑥): 영향 없음 (금액 필드 아님).
- ⑧ validation: 별도 validate 모듈 미존재(실측) — 신규 필드 optional이므로 차단 규칙 없음. 단 `actualRentalYears` 음수는 DecimalInput 단에서 차단 + Zod `.nonnegative()`.

## 4. Phase D — E2E (`e2e/comprehensive-tax.spec.ts` 신규)

공통: worktree에서 `E2E_PORT=3100 npx playwright test e2e/comprehensive-tax.spec.ts`. ToggleCard 전환 후이므로 `getByRole("switch")` 로케이터 (Phase B 선행 필수).

| ID | 시나리오 | 입력 요지 | 검증 |
|---|---|---|---|
| CPT-E2E-1 | 주택분 단독 기본 | 2024년·주택 공시 9.5억·1주택 아님 | `/과세표준/` 가시 + 세액 > 0 |
| CPT-E2E-2 | 1세대1주택 세액공제 | 1세대1주택 ON·생일 1955-01-01(만 69세→30%)·취득 2010-01-01(14년→40%)·공시 13억 | `/고령자 세액공제\|장기보유 세액공제/` 가시 |
| CPT-E2E-3 | 종합합산 토지 과세 | 주택 5억(기본공제 이하) + 종합합산 토지 ON·공시지가 8억·재산세 과표 8억·재산세액 300만 | `/종합합산 토지/` 가시 + 토지분 과세 발생 (과표 = (8억−5억)×100% = 3억 > 0 — 토지분 FMR은 100%, 주택분 60%와 다름) |
| CPT-E2E-4 (Phase C 후) | 의무임대기간 경고 | 임대주택 합산배제 + 경과 연수 3 (의무 10년 유형) | `/의무임대기간.*미충족/` 경고 가시 + 배제는 유지 |

## 5. UI 동기화 지점 인수표 (14지점 중 UI 담당)

| 지점 | 파일 | Phase |
|---|---|---|
| ① 폼 상태·② initial·③ normalize | `comprehensive-wizard-store.ts` PropertyEntry + makeProperty | C-3 |
| ④ API 변환·⑬ body | `page.tsx` callComprehensiveApi (인라인 — `lib/calc/comprehensive-api.ts` 미존재 실측) | A·C-3 |
| ⑤ UI 위젯 | `page.tsx`(A·B) + `ExclusionInfoInput.tsx`(C-3) | A·B·C-3 |
| ⑥ 사이드바 | 영향 없음 | — |
| ⑦ 결과 카드 | `ComprehensiveTaxResultView.tsx` (전역 warnings 기존 채널 + 배제 카드 amber) | C-3 |
| ⑧ validation | 미존재 — Zod 단일 (차단 규칙 추가 없음) | — |
| ⑫ Zod·⑭ Route | `comprehensive-input.ts` / `route.ts` (엔진 설계와 공동 — Do에서 grep 자가점검) | C |

## 6. 검증 체크리스트 (UI)

- [ ] `npx tsc --noEmit` 0건
- [ ] page.tsx native `type="checkbox"` 0건 (Phase B 후 grep)
- [ ] `300%`·`§8③` page.tsx 0건
- [ ] 신규 입력 silent fallback 0건 — `|| undefined`만 (`|| "${year}-01-01"`·`|| 60` 패턴 추가 금지)
- [ ] 말소 ToggleCard OFF 복귀 시 값 초기화 동작
- [ ] E2E 4건 통과 (`E2E_PORT=3100`)
- [ ] 결과 카드 amber 배지 — 정적 클래스 문자열 (dynamic tone 금지)
