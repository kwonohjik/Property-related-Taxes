# 종합부동산세 미구현 갭 해소 계획서 (comprehensive-tax-gaps)

> 작성일: 2026-06-11 · 작업 위치: worktree `comprehensive-tax-audit`
> 근거: comprehensive-tax-qa 실측 감사 + comprehensive-tax-exclusion-senior 법령 검증 + comprehensive-tax-ui-senior UI 실측 (3개 에이전트 병렬 조사, 모든 인용 file:line 실측)

---

## 1. 배경 — QA 감사 결과 요약

memory 기록 "종합부동산세 완료(84케이스 100% 통과)"는 **사실**(실측: 5 files / 84 tests passed). 그러나 테스트가 커버하지 않는 갭 9건이 발견되었고, 그중 1건(GAP-9)은 재실측 결과 **이미 해소된 오판**으로 정정한다.

| GAP | 항목 | 심각도 | 상태 판정 |
|---|---|---|---|
| 1 | 의무임대기간 미검증 (합산배제) | High | **구현 대상** (Phase C) |
| 2 | UI 세부담 상한 300% 오표시 (엔진은 150%) | Medium | **구현 대상** (Phase A) |
| 3 | 1세대1주택 법령인용 오기 §8③ → §8①1호 | Medium | **구현 대상** (Phase A) |
| 4 | E2E 테스트 0건 | Medium | **구현 대상** (Phase D) |
| 5 | Supabase tax_rates 종부세 데이터 미입력 | Low | **구현 대상** (Phase E) |
| 6 | native checkbox 4개 — ToggleCard 정책 위반 | Low | **구현 대상** (Phase B) |
| 7 | 법인 주택분 특례(§9의2) | Low | **범위 제외** — 별도 기획 (§3 참조) |
| 8 | 부부 공동명의 특례 | Low | **범위 제외** — 별도 기획 (§3 참조) |
| 9 | PDF 생성 미연결 | — | **오판 정정 — 이미 해소** (§2 참조) |

## 2. GAP-9 오판 정정 (작업 불필요 — 근거 기록)

QA가 "PDF 버튼만 있고 미연결"로 보고했으나 UI 시니어 재실측 결과:

- `components/calc/results/ComprehensiveTaxResultView.tsx:21` — `PrintSelectionPanel` import
- `ComprehensiveTaxResultView.tsx:469~477` — `allGroups={COMPREHENSIVE_PRINT_SECTIONS}` · `onPrintPdf={handlePrintPdf}` · `pdfReady={!!savedId}` 완전 연결
- `ComprehensiveTaxResultView.tsx:429~450` — `handlePrintPdf`가 `/api/pdf/result/${savedId}` POST 다운로드까지 구현
- `app/calc/comprehensive-tax/page.tsx:688` — `savedId={autoSave.savedId ?? undefined}` 전달

8결과뷰 공통화(memory `project_selective_print_6tax_series`)에 종부세 포함 확인. **별도 작업 없음.**

## 3. 범위 제외 항목 (GAP-7·8)

- **법인 주택분 특례(§9의2)**: 단일세율(2.7%/5.0%)·기본공제 0원·세부담상한 미적용 등 개인 계산과 구조가 다른 별도 트랙. 현재 엔진은 `comprehensive-tax.ts:284`에서 "개인 단독명의 기준" 경고로 명시 제외 중.
- **부부 공동명의 1주택자 특례(§10의2)**: 신청 시 1세대1주택 의제 — 지분·납세의무자 선택 입력 구조가 필요.

두 건 모두 **신규 기능 수준의 입력 구조 변경**이 필요하므로 본 계획에서 제외하고, 완료 후 별도 PDCA(plan부터)로 기획한다. 그때까지 기존 경고 문구를 유지한다.

---

## 4. 사전 결정 사항 (본 계획에서 채택)

### 결정 1 — `isMultiHouseInAdjustedArea` 체크박스 **제거** (UI·store·API)

근거 (dual-truth 해소, memory `feedback_ui_engine_dual_truth_avoidance`):
- 엔진은 `comprehensive-tax-helpers.ts:102`에서 `void isMultiHouseInAdjustedArea;`로 파라미터를 명시적으로 무시하고 `:103`에서 항상 `TAX_CAP_RATE_GENERAL`(1.50) 적용.
- `legal-codes/comprehensive.ts:43~44` — 현행 §10은 단일 조항 150% (구 §10② 다주택 300% 삭제됨, `TAX_CAP_RATE_MULTI_HOUSE: 1.50` @deprecated).
- UI에 남기면 "체크하면 결과가 바뀐다"는 허위 신호.

제거 범위: UI 체크박스 + store 필드 + API body. **엔진 파라미터 시그니처 삭제는 Phase A에 포함**(엔진 변경이지만 dead parameter 정리이므로 산식 무변경 — 회귀는 기존 84 테스트로 검증).

### 결정 2 — 의무임대기간은 "사전 차단"이 아닌 **"말소 차단 + 미충족 경고"** 이분화

법령 검증 결과(KoreanLaw MCP, 종부세법 MST 280417 · 시행령 MST 283639):
- 시행령 §3① 각 호는 "N년 **이상 계속하여 임대하는 것일 것**" — **장래 의무**이지 과세기준일까지 N년 기충족 요건이 아님.
- 의무기간 미충족 상태(예: 등록 3년차)여도 합산배제 신청 가능. 중도 말소·양도 시 **소급 추징**(경정) 구조.
- 따라서 "현재 N년 미달 → 배제 거부"로 구현하면 **법령 초과 제한**.

엔진 모델링:
| 케이스 | 처리 |
|---|---|
| 등록 말소일 ≤ 과세기준일 (`registrationRevokedDate` 신규 입력) | `MANDATORY_PERIOD_NOT_MET` 반환 → 배제 거부 (선언만 있던 상수의 반환 경로 신설) |
| 경과 연수 < 의무기간 (`actualRentalYears` 신규 입력, 선택) | `isExcluded: true` 유지 + `warnings[]`에 추징 위험 경고 |
| 두 필드 모두 미입력 | 기존 5개 검증만 — 기존 동작 100% 보존 |

### 결정 3 — 임대유형별 의무기간 매핑 (시행령 §3① 각 호, 검증 완료)

| 시행령 호수 | 유형 | 의무기간 |
|---|---|---|
| §3①1호 나목·2호 나목·3호 나목 | 구법(2018.3.31 이전 등록) 건설·매입·2005 이전 임대 | 5년 |
| §3①7호 나목·8호 가목2) | 장기일반민간임대 건설·매입 (2018.4.1 이후) | 10년 |
| §3①10호 나목·11호 가목2) | 단기민간임대 (민간임대주택법 §2⑥의2 신설 유형) | **6년** |
| (확인 필요) | 공공지원민간임대 | **미확정** — 기존 상수 8년 vs 현행 호수·연수 KoreanLaw 재검증 필요 |

⚠️ **드리프트 경고 3건** (Do 진입 전 anchor로 검증):
1. 기존 상수 주석의 "단기 4년·공공지원 8년"은 구법 기준. 현행은 §2⑥의2 단기 6년 신설(시행 2026.1.2 확인) — `MANDATORY_PERIOD_*` 상수값·주석을 현행 호수 기준으로 재검증 필요.
2. `registrationType` 6종(`private_construction`·`private_purchase_long`·`private_purchase_short`·`public_support`·`public_construction`·`public_purchase`, `types/comprehensive.types.ts:40~46` 실측)과 현행 시행령 §3 각 호의 1:1 대응 미확인 — `getMandatoryPeriodYears`는 `Record<RegistrationType, number>` 형태로 작성해 컴파일러가 누락 감지 (memory `enum-verification-before-mapping`).
3. `legal-codes/comprehensive.ts:199~209`의 호수 인용 자체가 구법 드리프트 의심 — 코드는 공공지원=§3①3호로 인용하나 KoreanLaw 검증 결과 현행 §3①3호는 "2005.1.5 이전 임대 구법 주택". Phase C에서 인용 문자열도 현행 호수로 일괄 정정.

---

## 5. Phase 구성 (커밋 단위)

### Phase A — 텍스트 정정 + dead parameter 제거 (GAP-2·3) — 소규모

변경 파일: `app/calc/comprehensive-tax/page.tsx`, `lib/stores/comprehensive-wizard-store.ts`, `app/api/calc/comprehensive/route.ts`, `lib/validators/comprehensive-input.ts`, `lib/tax-engine/comprehensive-tax-helpers.ts`, `lib/tax-engine/types/comprehensive.types.ts`

1. `page.tsx:150` — `(§8③, §9②)` → `(§8①1호, §9②)` (근거: `legal-codes/comprehensive.ts:16~17` 기본공제 12억 = §8①1호 / §8③은 합산배제 사후관리 `:250~251`)
2. `page.tsx:423~444` — `multi-house-adjusted` 체크박스 블록 삭제 (결정 1)
3. `page.tsx:456~458` — "상한율 (150% 또는 300%)" → "150% (종합부동산세법 §10)"
4. `comprehensive-wizard-store.ts:87, 136` — `isMultiHouseInAdjustedArea` 필드·초기값 삭제. (마이그 영향 없음 — `calc-wizard-migration.ts`에 comprehensive 미등록 grep 실측 0건. persist rehydrate 시 stale 필드는 무시됨)
5. `page.tsx:569` — API body 구성에서 해당 필드 삭제
6. `lib/validators/comprehensive-input.ts:260` — `isMultiHouseInAdjustedArea: z.boolean().optional()` 라인 삭제 (이미 optional이므로 구버전 이력 재계산 시 unknown key는 Zod 기본 strip — 400 에러 없음)
7. `route.ts:96` — `toEngineInput` 매핑(⑭)에서 해당 라인 삭제
8. `comprehensive-tax-helpers.ts:94~103` — `applyTaxCap` 4번째 파라미터 삭제, `:102` `void` 라인 제거. 호출부는 `comprehensive-tax.ts:240~244`(`input.isMultiHouseInAdjustedArea ?? false` 인자 제거) 1곳 실측. ⚠️ `property-tax.ts:268`에 **동명 `applyTaxCap` 별도 존재**(재산세 §122 전용, 무관) — grep 시 혼동 금지.
9. **타입 파일 구법 잔재 정리** (1차 검토 발견): `types/comprehensive.types.ts:173` `ComprehensiveTaxInput.isMultiHouseInAdjustedArea?` 필드 삭제(주석 "(세부담 상한 300% 적용)" 포함) + `:206` `TaxCapResult.capRate` 주석 "1.5 또는 3.0" → "1.5 (현행 §10 단일 상한)" 정정.
10. `legal-codes/comprehensive.ts:98~99` — `TAX_CAP_RATE_MULTI_HOUSE` deprecated 상수 삭제 (참조 0건 grep 실측).
11. **테스트 파급 동시 수정** (2차 검토 발견 — 미수정 시 tsc 실패): `__tests__/tax-engine/comprehensive-tax-integration.test.ts:178·197` input의 `isMultiHouseInAdjustedArea` 필드 제거 + `__tests__/tax-engine/comprehensive-house-deduction.test.ts:169~206` `applyTaxCap` 4-인자 호출 5곳 → 3-인자로. **기대값(toBe 수치)은 일절 변경 금지** — 산식 무변경이므로 기대값이 흔들리면 회귀 신호.

검증: `npx tsc --noEmit` 0건 + 기존 84 테스트 전체 통과(기대값 무변경). grep 자가점검: `grep -rn "isMultiHouseInAdjustedArea" app/ lib/ components/ __tests__/` 0건.

### Phase B — native checkbox 3개 → ToggleCard 전환 (GAP-6) — 중규모

변경 파일: `app/calc/comprehensive-tax/page.tsx` (Phase A에서 4개 중 1개 삭제됨 → 3개 전환)

| 위치 | 필드 | tone |
|---|---|---|
| `page.tsx:138~148` `Step1Basic` | `isOneHouseOwner` | sky (펼침 children: 생년월일·취득일) |
| `page.tsx:272~281` `Step4Land` | `hasAggregateLand` | sky (children: 토지 입력) |
| `page.tsx:344~350` `Step4Land` | `hasSeparateLand` | sky (children: 토지 입력) |

참조 패턴: `components/calc/acquisition/Step1.tsx:120~133`, `components/calc/ExclusionInfoInput.tsx:122~128` (종부세 코드에 이미 ToggleCard 사용 중 — import 경로 동일).
store·API 구조 불변 (⑤ UI 위젯만). `checked`/`onCheckedChange` 1:1 대응.

검증: `npx tsc --noEmit` + 수동 렌더 확인은 Phase D E2E로 대체.

### Phase C — 의무임대기간 검증 (GAP-1) — 엔진+UI, 본 계획의 핵심

#### C-1. 엔진 (comprehensive-tax-exclusion-senior 설계 채택)

변경 파일: `lib/tax-engine/types/comprehensive.types.ts`, `lib/tax-engine/comprehensive-exclusion.ts`, `lib/tax-engine/legal-codes/comprehensive.ts`(상수 주석·값 현행화)

```typescript
// RentalExclusionInput에 optional 2필드 추가
registrationRevokedDate?: Date;   // 임대등록 말소일 — 입력+과세기준일 이전이면 배제 거부
actualRentalYears?: number;       // 실제 임대 경과 연수 — 의무기간 미달 시 경고만

// ExclusionValidationResult에 추가
warnings?: string[];              // 사후 추징 위험 경고
```

- `validateRentalExclusion`: 기존 5개 검증 유지 + 말소 차단 경로(`MANDATORY_PERIOD_NOT_MET` 반환 신설) + 경과연수 경고 경로.
- `getMandatoryPeriodYears(registrationType)` 헬퍼 신설 — §4 결정 3의 매핑표. `Record<RentalExclusionInput["registrationType"], number>` 형태로 컴파일러 누락 감지 (6종 실측: types:40~46).
- `MANDATORY_PERIOD_*` 상수 현행화 (단기 6년 — §2⑥의2 검증 완료 / 공공지원 미확정 — Do 전 재검증) + `legal-codes/comprehensive.ts:199~209` 호수 인용 현행화 (드리프트 경고 3).
- **warnings 전파 경로 3단 설계** (1차 검토 발견 — `ExclusionValidationResult.warnings` 추가만으로는 결과 미도달):
  1. `ExclusionResult`(types:101~108)에 `warnings?: string[]` 추가 — `applyAggregationExclusion`에서 검증 결과의 warnings를 per-property로 복사.
  2. `comprehensive-tax.ts` 합산배제 단계(Step 0)에서 property별 warnings를 **기존 `ComprehensiveTaxResult.warnings: string[]`**(types:357, 이미 결과뷰 표시 채널 존재)로 병합. 메시지에 주택 식별 표기 — 단 내부 id 노출 금지(memory `feedback_no_internal_id_in_result`) → "임대주택 N번째" 순번 표기.
  3. UI는 기존 warnings 표시 채널 재사용 + 합산배제 결과 카드에 amber 배지 (⑦).

#### C-2. Pre-Do anchor (memory `feedback_pre_anchor_verification` — Do 전 우선 실행·실패 확보)

- **Anchor-1**: `registrationType: public_support(10년)` + 말소일 2023-05-01 < 과세기준일 2024-06-01 → `isExcluded: false` + `failReasons`에 `MANDATORY_PERIOD_NOT_MET`.
- **Anchor-2**: 경과 3년 < 의무 10년, 말소 없음 → `isExcluded: true` + `warnings[0]`에 "10년" 포함.

추가 케이스: T-MP-1(기충족·경고없음) / T-MP-2(미달 경고) / T-MP-3(말소일=과세기준일 당일 → 거부) / T-MP-4(미래 말소 예정 → 배제 유지) / T-MP-5·7(신규 필드 미입력 → 기존 16개 합산배제 테스트 회귀 보존, `it(` grep 실측) / T-MP-6(공공임대 의무기간 0 → 경고 없음) / T-MP-8(warnings가 `ComprehensiveTaxResult.warnings`까지 전파 — 통합 anchor).

#### C-3. UI (comprehensive-tax-ui-senior 설계 채택)

- `lib/stores/comprehensive-wizard-store.ts` `PropertyEntry`에 `registrationRevokedDate?` · `actualRentalYears?` 추가 + `makeProperty()` 초기값.
- `components/calc/ExclusionInfoInput.tsx` `RentalExclusionDetail` 내부, 임대개시일 블록(`:107~119`) 다음에 입력 위젯 추가 — 말소일은 `DateInput`, 경과연수는 `DecimalInput`(memory `feedback_decimal_input`). 말소일 입력은 ToggleCard(tone violet) 펼침형 권장 (예외 케이스이므로 기본 접힘).
- 결과뷰: `warnings[]` → 합산배제 결과 카드에 amber 경고 배지 표시.
- `page.tsx:500~517` `callComprehensiveApi`의 `rentalInfo` 객체에 2필드 추가.
- ⚠️ **신규 필드 silent fallback 금지** (1차 검토 발견): 기존 `rentalInfo` 구성에 `rentalRegistrationDate || "${year}-01-01"`(:507)·`area || 60`(:510)·`?? "private_purchase_long"`(:484) 등 silent fallback이 이미 존재하나, 신규 2필드는 **이 패턴 답습 금지** — optional 그대로 `|| undefined` 전달만 허용(빈값 자동 채움 없음, memory `feedback_no_silent_apportion_fallback`). 기존 fallback 3건 자체의 정비는 본 계획 범위 외(별도 triage 후보로 기록).

#### C-4. 14개 동기화 지점 영향 (⑫⑬⑭ TS 미감지 — grep 자가점검 필수)

| 지점 | 영향 |
|---|---|
| ①폼·②initial·③normalize | store `PropertyEntry` optional 2필드 + `makeProperty()` |
| ④API 변환·⑬body | `page.tsx:500~517` 인라인 `callComprehensiveApi`의 `rentalInfo` 구성 객체에 2필드 (별도 `lib/calc/comprehensive-api.ts` **미존재 확정** — ls 실측) |
| ⑤UI 위젯 | `ExclusionInfoInput.tsx` DateInput + DecimalInput |
| ⑥사이드바 | 영향 없음 (금액 아님) |
| ⑦결과 카드 | `warnings` 경고 배지 |
| ⑧validation | `lib/calc/comprehensive-validate.ts` **미존재 확정** — 종부세는 별도 validate 모듈 없이 Zod(⑫)가 차단 담당. 신규 2필드는 optional이므로 차단 규칙 추가 없음 |
| ⑨⑩⑪ | 영향 없음 (enum·companion 아님) |
| ⑫Zod | **`lib/validators/comprehensive-input.ts`** `rentalExclusionInfoSchema`(:46~)에 `registrationRevokedDate: z.string().regex(YYYY-MM-DD).optional()` + `actualRentalYears: z.number().nonnegative().optional()` — 기존 스키마는 날짜를 string으로 받음(:49~57 패턴 준수). **누락 시 침묵 strip** |
| ⑭Route 매핑 | `route.ts` `toEngineInput`(:51~102)의 `rentalInfo` 변환 블록(:56~63)에 `registrationRevokedDate: p.rentalInfo.registrationRevokedDate ? parseDate(p.rentalInfo.registrationRevokedDate) : undefined` — 기존 route 확립 패턴(`parseDate`, Zod 형식 보장 후 변환) 준수. `actualRentalYears`는 number라 spread로 자동 통과 |

(1차 검토 정정: ⑫는 route.ts가 아닌 `lib/validators/comprehensive-input.ts`. ⑭의 date-coerce 지시는 기존 route 패턴과 불일치하여 `parseDate` 패턴으로 변경.)

### Phase D — E2E 3건 (GAP-4) — Phase B 완료 후

신규 파일: `e2e/comprehensive-tax.spec.ts` (참조 구조: `e2e/gift-burdened-debt.spec.ts` — `fillDateAndVerify`·`calcAndWaitResult` 공용 헬퍼)

| ID | 시나리오 | 핵심 검증 |
|---|---|---|
| CPT-E2E-1 | 주택분 단독 (공시 9.5억, 1주택 아님) | 결과 화면 `/과세표준/` 가시 |
| CPT-E2E-2 | 1세대1주택 + 고령자69세(30%)·14년보유(40%) 공제, 공시 13억 | `/고령자 세액공제\|장기보유 세액공제/` 가시 |
| CPT-E2E-3 | 주택 5억(미과세) + 종합합산 토지 8억 | `/종합합산 토지/` 섹션 가시 |

- ToggleCard 전환 후이므로 `getByRole("switch")` 로케이터 사용 — **Phase B 선행 필수**.
- worktree 실행: `E2E_PORT=3100 npx playwright test e2e/comprehensive-tax.spec.ts` (memory `feedback_e2e_worktree_port_isolation`).
- Phase C 완료 후 합산배제 경고 표시 검증 1건(CPT-E2E-4) 추가 검토.

### Phase E — Supabase seed (GAP-5) — 독립 실행 가능

- `supabase/seeds/comprehensive_property_rates_seed.sql` 존재 — `npm run seed:tax-rates` 실행 (`.env.local` 필요).
- GAP-1과 무관: `validateRentalExclusion`·`applyAggregationExclusion`은 DB 미사용 순수 함수.
- 정합 anchor 1건: seed 미입력 환경에서 route 호출 → graceful fallback(내부 상수)으로 에러 없이 계산되는지 확인.
- 로컬 Supabase 미구동 시 본 Phase는 **환경 확보 시점으로 연기 가능** (엔진 fallback으로 계산 정상).

---

## 6. 실행 순서·브랜치 전략

```
worktree: comprehensive-tax-audit (브랜치 worktree-comprehensive-tax-audit)

Phase A (커밋 1~2) → Phase B (커밋 3) → tsc+vitest 게이트
  → Phase C: Pre-Do anchor 우선 실행(실패 확보) → 엔진(커밋 4) → UI+14지점(커밋 5) → 회귀 게이트
  → Phase D (커밋 6, E2E) → Phase E (seed, 환경 가용 시)
  → 전체 npm test + ship.sh로 단일 PR 머지
```

게이트: 각 Phase 후 `npx tsc --noEmit` 0건. Phase C 후 `npx vitest run __tests__/tax-engine/` 종부세 84+신규 9 통과. 머지 전 전체 `npm test`(memory `feedback_per_tax_test_scripts` — PR 전엔 전체).

## 7. 완료 기준 (Definition of Done)

- [ ] GAP-2·3: 구법 300%·§8③ 표기 0건 — `grep -rn "300%\|isMultiHouseInAdjustedArea" app/ components/ lib/stores/ lib/validators/ lib/tax-engine/types/` 0건. 예외: `legal-codes/comprehensive.ts:44` NOTE 주석(구법 삭제 사실의 의도적 설명)은 유지 + warnings 전파 설계의 결과뷰 채널은 `ComprehensiveTaxResultView.tsx:462·480~483` 기존 렌더 재사용
- [ ] GAP-6: page.tsx 내 native `type="checkbox"` 0건
- [ ] GAP-1: Anchor-1·2 + T-MP-1~8 통과, 기존 16개 합산배제 테스트 무변경 통과
- [ ] 14지점: ⑫⑬⑭ grep 자가점검 — `lib/validators/comprehensive-input.ts`(⑫) · `page.tsx` rentalInfo body(⑬) · `route.ts` toEngineInput(⑭)에 신규 2필드 존재
- [ ] GAP-4: E2E 3건 `E2E_PORT=3100` 통과
- [ ] `npx tsc --noEmit` 0건 + 전체 `npm test` 통과
- [ ] 결과 카드 warnings 경고 — 브라우저 검증은 E2E spec으로 충족 (memory `feedback_browser_verify_with_playwright`)

## 8. 리스크·확인 필요 항목

| 항목 | 리스크 | 대응 |
|---|---|---|
| `registrationType` 6종 ↔ 시행령 §3 호수 매핑 | 설계 드리프트 (구법/신법 등록일 기준 vs 유형 기준). `legal-codes:199~209` 인용 자체가 구법 의심 | Do 전 KoreanLaw 재확인 → `Record<RegistrationType, number>` 매핑 + 인용 문자열 현행화 |
| `MANDATORY_PERIOD_*` 상수 구법값 | 단기 5년(현 상수 SHORT)·공공지원 8년의 현행 정합 미확정 (§2⑥의2 단기 6년 신설 확인됨) | Phase C에서 KoreanLaw 재검증 후 상수 현행화 + 주석에 호수 명기 |
| store 필드 삭제(`isMultiHouseInAdjustedArea`) | (완화 — 실측) `calc-wizard-migration.ts`에 comprehensive 미등록(grep 0건), persist rehydrate stale 필드는 무시 | 삭제 후 기존 sessionStorage 이력으로 페이지 로드 1회 확인 |
| Zod 스키마 필드 삭제 | (완화 — 실측) `validators:260` 이미 `.optional()` — 삭제 시 구버전 body의 해당 key는 Zod 기본 strip으로 무해 | 라인 삭제 + 재계산 경로 1회 확인 |
| 기존 silent fallback 3건 (page.tsx:484·507·510) | 신규 필드 추가 시 패턴 답습 위험 / 기존 건 자체도 정책 위반 후보 | 신규 필드는 fallback 금지 명시(C-3). 기존 3건은 범위 외 — 별도 triage 기록 |
| E2E 사전존재 실패 ~23건 | 회귀 오판 | 회귀판정 = npm test + 신규 spec 단독 (memory `feedback_e2e_preexisting_failures`) |
