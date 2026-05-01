---
name: tax-field-add
description: 세금 엔진 input/result에 새 필드를 추가하거나 변경할 때 8개 동기화 지점(타입·initial·normalize·API·UI·사이드바·결과·validation)을 모두 점검·구현. CLAUDE.md Definition of Done 강제. UI 통과↔validate 차단 같은 모순 사전 차단.
trigger: 필드 추가, input 추가, AssetForm 필드, 동기화 지점, 8개 지점, 7개 지점, sync points, field add, add input
---

# tax-field-add — 세금 필드 추가 8개 동기화 지점

세금 엔진(`lib/tax-engine/*.ts`) 또는 Form 상태(`AssetForm`/`FormData`)에 새 필드를 추가하거나 기존 필드의 의미를 변경할 때 사용. CLAUDE.md의 "UI 통합 8개 동기화 지점" Definition of Done을 자동 강제.

## 적용 시점

- 사용자가 "필드 추가", "input 추가", "이 값을 받아서 ..." 같은 요청을 할 때
- 엔진 `Input` 또는 `Result` 타입에 새 키를 추가할 때
- 기존 필드에 fallback(다른 필드로 대체)을 도입할 때

## 8개 동기화 지점 체크리스트

세목별 위치는 `{tax-type}` = `transfer` / `acquisition` / `property` / `comprehensive` / `inheritance-gift` 중 하나로 치환.

| # | 지점 | 위치 |
|---|---|---|
| ① | 폼 상태 타입 | `lib/stores/calc-wizard-asset.ts`·`calc-wizard-store.ts` 또는 `components/calc/{tax-type}/shared.ts` |
| ② | initial value | `createInitialAssetForm` / `INITIAL_FORM_DATA` / `INITIAL_FORM` |
| ③ | normalize fallback | `normalizeAsset` 등 — sessionStorage 마이그레이션 호환 |
| ④ | API 변환 | `lib/calc/{tax-type}-api.ts` (없으면 route handler 진입 변환) |
| ⑤ | UI 입력 위젯 | 마법사 단계 컴포넌트 — 활성화 조건·tone 색상·UI 순서=계산 로직 순서 |
| ⑥ | 사이드바 합계 (해당 시) | `compute*Summary` selector |
| ⑦ | 결과 카드 산식·표시 | `{TaxType}ResultView` + 상세 카드들 — 산식 숫자 옆 변수명 라벨 |
| ⑧ | **Validation** | `lib/calc/{tax-type}-validate.ts` — API/UI fallback이 있는 필드는 validate에서도 같은 fallback 인식 |

## 작업 절차 (강제)

1. **시작 전 메모리 검색**: 관련 정책 메모리(`feedback_*.md`)를 인덱스에서 확인. 특히:
   - `feedback_no_silent_apportion_fallback.md` (자동 안분 정책)
   - `feedback_useeffect_store_mirror_forbidden.md` (cross-field 동기화 패턴)
   - `feedback_zustand_selector.md` (selector 무한 루프)

2. **8개 지점 사전 매핑**: 변경할 필드별로 위 8개 위치를 기록 (디자인 문서 또는 plan 파일).

3. **fallback 도입 시 ⑧ 동시 작업**: `lib/calc/{tax-type}-api.ts`에 `parseAmount(a) || parseAmount(b)` 패턴을 추가했으면, 즉시 `lib/calc/{tax-type}-validate.ts`도 같은 fallback 인식하도록 수정. 두 파일을 한 turn에 함께 편집.

4. **자동 누락 검출** (작업 완료 직전):
   ```bash
   # 새 필드명으로 8개 위치 grep
   grep -rn "{newField}" lib/stores/calc-wizard-*.ts \
     lib/calc/{tax-type}-api.ts lib/calc/{tax-type}-validate.ts \
     components/calc/{tax-type}/ components/calc/results/{TaxType}ResultView.tsx
   ```
   각 8개 지점에 최소 1번씩 등장해야 함 (해당 안되는 지점은 명시적으로 N/A 표기).

5. **회귀 검증**:
   - `npx tsc --noEmit` 0건
   - `npx vitest run __tests__/tax-engine/{tax-type}/`
   - 브라우저 수동 또는 "수동 미수행" 명시
   - (권장) `ui-engine-sync-checker` 호출

## 자주 누락되는 패턴

- ⑥ 사이드바 합계: fallback 도입 시 UI display는 갱신했지만 `compute*Summary` 안의 `parseAmount(asset.fieldA)`만 참조하고 있어 합계가 0으로 표시 (image 16 버그)
- ⑧ Validation: API/UI는 통과하는데 validate에서 차단되어 "필드를 입력하세요" 오류 표시 (image 18 버그)
- ② initial value 누락: 새 필드가 sessionStorage에서 `undefined`로 들어와 폼 초기화 실패

## 보고 형식

작업 완료 시 다음을 명시:
- 추가/변경 필드 목록
- 8개 지점별 수정 위치 (라인 번호)
- 회귀 검증 결과
- 누락 발견 시 즉시 수정한 항목
