# 상속세 §21① 단서 무신고 일괄공제 — UI 설계

> 계획: `docs/00-pm/inheritance-numeric-gaps.plan.md` §1 · 엔진설계: `inheritance-section21-unfiled-proviso.engine.design.md`
> 작성: 2026-06-07 · 현황 인용은 동일자 실측

## Context

엔진 §21① 단서 추가에 따라 사용자가 **신고 상태**(정기신고/기한후신고/무신고)를 입력해야 한다. 현행 UI는 §69용 `isFiledOnTime` **체크박스 1개**(`steps.tsx:582`)뿐으로 "기한후신고 vs 무신고"를 표현하지 못한다.

---

## 사용자 시나리오

1. 사용자가 Step4(공제·세액공제)에서 신고 상태를 선택한다.
2. "무신고" 선택 시: 일괄공제가 5억으로 고정됨을 결과에서 안내받는다(기초+인적이 5억 초과해도).
3. "기한후신고" 선택 시: §69 신고세액공제는 못 받지만 일괄공제 본문 max는 적용됨.
4. 배우자 단독상속이면 신고 상태와 무관하게 일괄공제 배제(§21②) 안내.

---

## 위젯 설계 — 신고 상태 3-state 라디오 (기존 체크박스 대체)

`steps.tsx:582` 기존 `isFiledOnTime` 체크박스 → `RadioCardGroup` 3선택으로 교체:

```
┌─ 신고 상태 (§67 · §69 · §21①) ────────────────────────┐
│  ◉ 법정기한 내 신고 (정기신고)                          │
│      신고세액공제 3% 적용 · 일괄공제 max(기초+인적, 5억) │
│  ○ 기한후신고 (국세기본법 §45의3)                       │
│      신고세액공제 미적용 · 일괄공제 max 적용             │
│  ○ 무신고                                               │
│      신고세액공제 미적용 · 일괄공제 5억 고정 (§21① 단서) │
└─────────────────────────────────────────────────────────┘
```

**내부 매핑 (옵션 B — 두 boolean derive, 라디오라 모순 구조적 불가)**:

| 라디오 선택 | `isFiledOnTime`(creditInput) | `isUnfiled`(deductionInput) |
|---|---|---|
| 정기신고 | `true` | `false` |
| 기한후신고 | `false` | `false` |
| 무신고 | `false` | `true` |

> ★ 라디오는 단일 선택이므로 `isFiledOnTime===true && isUnfiled===true` 모순이 **원천 차단**됨 → 별도 validation 모순 검사 불요(엔진설계 "옵션 B 모순 차단" 요구 자동 충족). [[feedback_three_state_optional_mode_toggle]] 정합.
> 토글/라디오는 `RadioCardGroup` 필수(native 금지), OFF tone 유지. `name` prop 필수.

---

## 결과 화면 — 단서 안내 Row (2곳)

엔진 `lumpSumComparisonDetail.forcedByUnfiled` / `result.deductionDetail.lumpSumForcedByUnfiled` 트리거:

1. **`DeductionBreakdownSection.tsx:78`** 배우자단독 배제 Row 옆:
   ```tsx
   {dd.lumpSumForcedByUnfiled && (
     <Row label="ⓘ 무신고 — 일괄공제 5억 고정 (§21① 단서)" value="5억 한정" />
   )}
   ```
2. **`LumpSumDetailCard.tsx:67`** 배우자단독 안내 옆: 동일 패턴 fine-print.

> 산식 한국어 풀어쓰기([[feedback_result_view_korean_formula]]), "원" 단위 표기 금지.

---

## 14개 동기화 지점 (UI 담당분)

| # | 지점 | 위치 | 작업 |
|---|---|---|---|
| ① | FormState | `inheritance/shared.ts:79` 인근 | `filingStatus` 또는 `isUnfiled` 추가 (isFiledOnTime 유지/대체) |
| ② | INITIAL | `shared.ts:169` | 기본 "정기신고"(isUnfiled=false) |
| ③ | normalize | `shared.ts` | `{...prev,...normalized}` 병합 fallback |
| ④ | API 변환 | `InheritanceTaxForm` buildInput (isFiledOnTime :425) | 라디오 → isFiledOnTime(creditInput) + isUnfiled(deductionInput) 양쪽 매핑 |
| ⑤ | UI 위젯 | `steps.tsx:582` | 체크박스 → RadioCardGroup 3선택 |
| ⑥ | 사이드바 | — | 해당 없음 |
| ⑦ | 결과 카드 | `DeductionBreakdownSection.tsx:78`·`LumpSumDetailCard.tsx:67` | 단서 Row 2곳 |
| ⑧ | validation | `lib/validators/property-valuation-input.ts` | 라디오로 모순 불가 → 추가 차단 불요. 신규 필드 schema만 |

> ★ ⑤ 마이그레이션: 기존 `isFiledOnTime` 체크박스를 사용하던 §69 입력 경로가 라디오로 통합됨 → 기존 §69 동작(정기신고 시 3%)은 "정기신고" 라디오 선택으로 동일 보존.
> ★ **범위 한정**: 라디오 교체는 **상속세 전용**. 증여세(`gift-tax-form-shared.tsx:514` isFiledOnTime 체크박스)는 §21 일괄공제가 없으므로(상속세 전용) **변경 대상 아님** — 체크박스 유지(§69 신고세액공제만).
> ★ 저장소 마이그레이션: 기존 `isFiledOnTime` boolean → 라디오 초기값. `true`→"정기신고". `false`→**"기한후신고" 기본**(무신고로 자동 분류 금지 — 무신고는 일괄공제 5억 고정의 불리 조건이므로 사용자 명시 선택만 인정, [[feedback_no_silent_apportion_fallback]] 보수적 기본값). 과거 실제 무신고 케이스는 재선택 필요(안내).

---

## UI 검토 체크리스트 (STEP 13)

- [x] RadioCardGroup `name` prop 필수
- [x] OFF tone 유지 / native 라디오 금지
- [x] 결과 Row 2곳 testid·섹션 한정(`getByTestId` 검증)
- [x] "원" 단위 미표기 / 한국어 산식
- [x] 모순 입력 구조적 차단(라디오)
- [x] 기존 isFiledOnTime §69 경로 보존 (마이그레이션)
- [x] 저장소 마이그레이션 — **INITIAL fallback 자동**(기존 데이터에 isUnfiled 없으면 normalize false → isFiledOnTime 값으로 정기/기한후 라디오 derive). 별도 마이그레이션 코드 불요(갭 분석 환류 2026-06-07)
- [x] E2E: UNF-E2E-1(무신고→단서 Row)·UNF-E2E-2(정기→미표시) passed. ★공제 상세는 "상속공제 상세 내역" 펼침 토글 안 → E2E에서 펼침 클릭 필요(초안 누락→수정)

## 갭 분석 결과 (2026-06-07, 계획·설계 ↔ 구현)

deviation 0. 구현이 설계대로 완주:
- 옵션 B 채택(isUnfiled deductionInput, isFiledOnTime creditInput 유지) — §69 회귀 0 ✅
- 우선순위 §21② > §21①단서 > 본문 — 엔진 559~563 삼항 ✅ (SEC21P-5 통과로 §21② 선평가 정합 실증)
- forcedByUnfiled echo (result + LumpSumComparisonDetail) ✅
- 14지점 ①~⑧ + ⑨⑩⑫(Zod) ⑬⑭(통째 spread 자동) ✅
- anchor SEC21P-1~5 + 통합 §69 ✅ / E2E 2 ✅ / 전체 6633 PASS
- ★환류 1: E2E 초안이 펼침 토글 누락 → 펼침 클릭 추가(error-context로 진단)
- ★환류 2: 저장소 마이그레이션은 INITIAL fallback으로 자동 — 별도 코드 불요
