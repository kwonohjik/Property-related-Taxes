# 신규 세목 UI 시작 체크리스트

> **사용 시점**: 취득세·재산세·상속세·증여세 UI를 처음 시작할 때 1회 적용.
> **목적**: 양도세에서 6개월에 걸쳐 학습한 5개 정책을 첫 PR 전에 강제 적용해 같은 학습비용 재지불 차단.
> **사용법**: `_new-tax-ui-kickoff.checklist.md` → `{tax-name}-ui-kickoff.checklist.md`로 복사 후 모두 ☐→☑ 채워야 UI 코드 시작.

---

## 1. 8개 동기화 지점 사전 채우기 (실구현 전)

엔진 input/result 타입을 보고 8개 지점에 어떤 필드가 들어갈지 사전 명세.

| # | 지점 | 위치 (예: 양도세) | 신규 세목 필드 매핑 |
|---|------|------------------|--------------------|
| ① | 폼 상태 타입 | `lib/stores/calc-wizard-store.ts` | ☐ |
| ② | initial value | 같은 파일 | ☐ |
| ③ | normalize fallback | 같은 파일 | ☐ |
| ④ | API 변환 | `lib/calc/{tax}-api.ts` | ☐ |
| ⑤ | UI 입력 위젯 | `app/calc/{tax}/steps/Step*.tsx` | ☐ |
| ⑥ | 사이드바 합계 | `WizardSidebar` | ☐ (해당 시) |
| ⑦ | 결과 카드 산식 | `components/calc/results/{Tax}ResultView.tsx` | ☐ |
| ⑧ | validation | `lib/calc/{tax}-validate.ts` | ☐ |

**규칙**: ④에 fallback 추가 시 ⑧에도 같은 fallback 인식 필수 (메모리 `feedback_validation_sync_8th_point.md`).

---

## 2. 케이스 인벤토리 표 (Design 단계 산출물)

`{feature}.engine.design.md`에 케이스 인벤토리 표 작성 완료.

- ☐ 표 작성됨 (행≥1)
- ☐ 모든 anchor 출처 명시 (미발견은 ☐ TODO로)
- ☐ 테스트 파일 명 사전 결정

---

## 3. Silent fallback / 자동 안분 후보 식별

엔진 input 필드 중 빈값으로 들어왔을 때 "친절하게 자동 채울 만한" 후보를 사전 식별.

| 필드 | 자동 채울 유혹 | 정책 결정 (자동 ☐ / 검증오류 ☑) |
|------|---------------|--------------------------------|
| (예) 부속토지 면적 미입력 | 건물 면적 기준 비례 | ☐ 자동 / ☑ 검증오류 차단 |

**규칙**: 법령 명시 외 자동 안분 금지 (메모리 `feedback_no_silent_apportion_fallback.md`). 미입력은 검증 단계 명확한 오류.

---

## 4. Cross-field 동기화 필요 지점 → useEffect 사용 금지 사전 선언

UI에서 한 필드가 다른 필드를 자동으로 갱신해야 하는 지점을 사전 식별.

| 트리거 필드 | 갱신 대상 | 구현 패턴 (useEffect ☐ 금지 / fallback ☑) |
|------------|-----------|-------------------------------------------|
| (예) 취득원인 = 매매 | 취득가액 입력 활성 | ☑ 파생값은 useMemo, display는 fallback prop |

**규칙**: useEffect로 store 미러링 금지 (메모리 `feedback_useeffect_store_mirror_forbidden.md`). 무한 루프 차단.

---

## 5. UI 순서 = 엔진 계산 로직 순서 사전 매핑

엔진 계산 함수의 변수 사용 순서대로 UI 입력 위젯 배치.

```
엔진 계산 순서: a → b → c → d
UI 위젯 순서:   a → b → c → d  (반드시 동일)
모드 토글:     영향받는 필드 직전 배치
```

- ☐ 엔진 계산 순서 추출 완료
- ☐ Step별 위젯 순서가 엔진 순서와 동일

---

## 6. 공통 정책 사전 검토 (MEMORY.md ★ 6개)

작업 시작 전 다음 6개 정책 메모리 본문 1회 정독.

- ☐ `feedback_validation_sync_8th_point.md`
- ☐ `feedback_no_silent_apportion_fallback.md`
- ☐ `feedback_useeffect_store_mirror_forbidden.md`
- ☐ `feedback_design_law_cases.md`
- ☐ `feedback_tax_calculation_principle.md`
- ☐ `feedback_pdf_example_test_anchoring.md`

---

## 7. 신규 Date 필드 헬퍼 사용 약속

라우트 핸들러에서 새 Date 필드는 `lib/api/date-coerce.ts` 헬퍼 사용.

- ☐ Date 필드 목록 작성
- ☐ `toDate()` / `toOptionalDate()` / `coerceDates()` 중 어느 것을 쓸지 결정

---

## 완료 기준

위 7개 섹션 모두 ☑ 채워진 산출물(`{tax-name}-ui-kickoff.checklist.md`)이 PR에 포함되면 UI 코드 시작 가능.
