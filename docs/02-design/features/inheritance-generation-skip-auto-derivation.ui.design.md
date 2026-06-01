# 세대생략 할증과세(§27) 자동 도출 — UI 설계

**작성일**: 2026-06-01
**담당**: inheritance-gift-tax-ui-senior
**대응 엔진**: `lib/tax-engine/inheritance-tax.ts` (STEP 8.5·9·13 개정)
**엔진 설계**: `inheritance-generation-skip-auto-derivation.engine.design.md`

---

## 1. 개요

상속인 입력 단계(`HeirComposition`)에서 수유자(손자녀)를 **세대생략 할증 대상**으로 체크하면, 산출·배부·결과 표시가 그 플래그 하나에서 자동 도출된다. 사용자가 별도 전역 섹션에서 토글·금액을 중복 입력하던 dual-truth를 제거한다.

### 1.1 핵심 변경
- **추가**: `HeirComposition` `legatee` 행에 세대생략 체크박스 + 생년월일 + 미성년 override
- **제거**: 전역 "세대생략 할증과세(§27)" 섹션 (`step4-5.tsx` + `steps.tsx` 중복) → read-only 안내로 대체
- **추가**: 결과 화면 수유자별 산식 카드 (`InheritanceGenerationSkipDetailCard`)

---

## 2. 사용자 시나리오

```
[현행 — 버그]
상속인 단계: 손녀 추가(수유자) → 세대생략 지정 UI 없음
세액공제 단계: 전역 토글 수동 ON + 금액 5억 수동 입력 ← 누락 시 할증 0 (버그)

[개정]
상속인 단계: 손녀 추가(legatee) → "§27 세대생략 할증 대상" 체크 + 생년월일 입력
            → (자동) 산출·배부·결과 반영. 별도 입력 불필요
세액공제 단계: 세대생략 대상 존재 시 read-only 안내 ("상속인 단계에서 자동 적용됨")
결과 화면: "손녀(정) 유증분에 대한 할증 30,232,198 = 산출세액 × (5억/80.75억) × 30%"
```

---

## 3. UI 명세

### 3.1 HeirComposition — legatee 체크박스 + 생년월일 (⑤A)

`components/calc/HeirComposition.tsx` `legatee` 행에:

| 위젯 | 조건 | tone | 비고 |
|---|---|---|---|
| 생년월일 `DateInput` | `relation === "legatee"` | — | "40% 할증·미성년 판별용" hint. Zod `birthDate` **이미 존재**(U-4) — UI 노출만 추가 |
| `isGenerationSkipBeneficiary` `ToggleCard` | `relation === "legatee"` | **rose** | "§27 세대생략 할증 대상 — 자녀를 건너뛴 직계비속 유증(손자녀 등)" |
| 미성년 override (3-state) | 체크 ON + birthDate 有 | rose(sm) | 자동 판정값 표시 + 수동 토글 |

**노출 relation 매트릭스** (§27 = 자녀 제외 직계비속):

| relation | 체크박스 | 사유 |
|---|---|---|
| `legatee` | ✅ 노출 | 손자녀 유증 핵심 경로 |
| `child`·`spouse`·`lineal_ascendant`·`sibling`·`other` | ❌ | §27 비대상 |
| `corporate` | ❌ | 법인 비대상(`changeHeirRelation:105` undefined) |

**`showBirthDate` 조건 확장 — 2곳 동시 (⑤A, R5)**:
- `changeHeirRelation` 내부(`HeirComposition.tsx:95-98`) — 관계 변경 시 birthDate 보존
- 렌더부 `showBirthDate` — 입력 위젯 노출
- 둘 중 하나만 고치면 관계 변경 시 침묵 제거 또는 미노출 → 반드시 동시.

### 3.2 미성년 override — 3-state (⑤A)

```
birthDate 입력 시:
  자동 판정 = differenceInYears(deathDate, birthDate) < 19
  표시: "상속개시일 기준 미성년자 (자동: 예/아니오)"
  ToggleCard(override): OFF=자동값 사용(isMinorOverride=undefined)
                        ON 시 명시 true/false (isMinorOverride 설정) — 연령기준 개정 대비
```
memory `feedback_three_state_optional_mode_toggle` — undefined(자동)/true/false(수동) 구분.

### 3.3 전역 세대생략 섹션 제거 (⑤B)

`step4-5.tsx:322-357` + `steps.tsx:455-484` (동일 UI 2곳):
- `isGenerationSkip` ToggleCard → **제거**
- `isMinorHeir` ToggleCard → **제거**
- `generationSkipAssetAmount` CurrencyInput → **제거** (per-heir 자동 집계로 불필요)
- 대체: 세대생략 대상 존재 시 **read-only 안내 카드**(sky tone) "상속인 등록 단계에서 세대생략 대상 체크 시 자동 적용됩니다."
- **중복 정리 (확인 필요)**: `steps.tsx`/`step4-5.tsx` 실제 렌더 경로 확인 후 단일 출처화.

### 3.4 결과 화면 — 수유자별 산식 카드 (⑦)

신규 `InheritanceGenerationSkipDetailCard` (`InheritanceTaxResultView`에 추가):
- 소스: `result.generationSkipDetail`(`InheritanceGenerationSkipDetail`, 엔진 신규 타입)
- 행별 표시: 수유자명 + "산출세액 × (numerator/denominator) × rate% = surcharge"
- 변수 배지·펼침·접근성: 증여세 `GenerationSkipSurchargeBreakdownCard` **패턴만 차용**(§57 전용이라 직접 재사용 금지 — R3). skill `formula-display-builder`.
- 수유자명: `heirName.trim() || RELATION_LABEL[relation]`("수유자" 등) (U-2 — 재산 카테고리 라벨 아님). 내부 id 노출 금지 — `feedback_no_internal_id_in_result`.
- `generationSkipDetail === null`이면 카드 미렌더.
- `HeirAllocationTable` 수유자 열 "세대생략 할증" 행은 현행 유지(per-heir 배부값).

---

## 4. 8개 동기화 지점

| # | 지점 | 위치 | 변경 |
|---|---|---|---|
| ① 폼 상태 | `Heir`(types/inheritance-gift.types.ts) — `isMinorOverride?` 추가 / 전역 3필드는 `shared.ts:62-64`(deprecated, U-3 구분) | heir 배열은 `shared.ts:39 heirs: Heir[]`에 자동 포함 |
| ② initial | `shared.ts:98-100` | 변경 없음 (전역 false/"") |
| ③ normalize | sessionStorage 복원 | 레거시 전역값 보존 fallback (구 이력 호환) |
| ④ API 변환 | `lib/calc/inheritance-api.ts:80,84-86` | `heirs: input.heirs` **통째 spread**(api:80) → `isMinorOverride` 자동 포함(U-1). ⚠️ **⑨ Zod 미추가 시 strip** — Zod 추가 필수. 전역값 통과 유지, 자동 도출은 엔진 |
| ⑤A UI 위젯 | `HeirComposition.tsx` | legatee 체크박스+birthDate+override (3.1·3.2) |
| ⑤B UI 위젯 | `step4-5.tsx`·`steps.tsx` | 전역 섹션 제거 + read-only 안내 (3.3) |
| ⑥ 사이드바 | — | 변경 없음 (결과 도착 후 표시) |
| ⑦ 결과 카드 | `InheritanceTaxResultView` | `InheritanceGenerationSkipDetailCard` 신규 (3.4) |
| ⑧ validation | `lib/calc/inheritance-validate.ts` | 세대생략 검증 없음(R7) — 추가 불필요. `isMinorOverride` optional |
| ⑨ Zod | `lib/validators/property-valuation-input.ts:495` | `isMinorOverride: z.boolean().optional()` 추가. 전역 3필드 optional 유지 |
| ⑩~⑭ | route/body | 전역 3필드 optional 통과. heir 배열에 isMinorOverride 포함 |

---

## 5. 마이그레이션

- sessionStorage 구 데이터: `isGenerationSkip:true` + legatee `isGenerationSkipBeneficiary` 미설정 → 자동 도출이 false면 충돌.
- **fallback (3중 패턴, `mirror-pattern`)**: API 변환·엔진·validate 모두 `input.isGenerationSkip ?? heirs.some(...)` — 레거시 명시값 우선 → 구 이력 결과 불변.
- `INITIAL_FORM` 전역 false 유지. 신규 입력은 legatee 체크박스만으로 결정.

---

## 6. 구현 순서 (Do — UI 시니어)

1. ⑤A `HeirComposition` legatee 체크박스(rose)+birthDate(showBirthDate 2곳)+override 3-state
2. ① `Heir.isMinorOverride` 폼 상태 + ⑨ Zod
3. ④ API 변환 레거시 fallback + ③ normalize
4. ⑤B `step4-5.tsx`+`steps.tsx` 전역 섹션 제거·중복 정리·read-only 안내
5. ⑦ `InheritanceGenerationSkipDetailCard` 신규
6. ⑧ validate fallback 확인
7. UI anchor: legatee 체크 → API isGenerationSkip 도출 / 레거시 전역 유지 회귀

---

## 7. UI 누락 체크리스트

- [ ] legatee 외 relation 체크박스 미노출 (corporate undefined 처리)
- [ ] showBirthDate 2곳 동시 수정
- [ ] 전역 섹션 2곳(step4-5·steps) 모두 제거
- [ ] 결과 카드 null 가드
- [ ] 내부 id 노출 금지 (heirName fallback)
- [ ] 미성년 3-state(undefined/true/false) 구분
- [ ] 레거시 fallback 3중(API·엔진·validate) 일치
- [ ] ToggleCard rose tone (native checkbox 금지)
- [ ] 800줄 정책 (HeirComposition 718→~745)
