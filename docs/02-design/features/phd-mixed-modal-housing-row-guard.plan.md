# 겸용 PHD 배치 모달 — 주택 행 부재 시 양도시 상가만 산출되는 silent 부분 산출 버그 수정 계획서

- 작성일: 2026-07-22
- 증상(사용자 재현): 상가 기준시가 계산기(런처)로 결합 모달 진입 → 행을 상가 1개만 남기고 "3시점 계산하기" → **양도시 상가건물 기준시가만 산출**(7,300,930), 나머지 5칸 "−". 오류·안내 없음.
- 성격: **UI 검증 가드 추가 (엔진·산식 무변경)**. 신규 엔진 필드 없음 → 14 동기화 지점 N/A(⑤만 실질).
- 관련: `project_transfer_mixed_use_case_a_per_section_stdprice_calc`(D1 결합 모달) · `project_transfer_mixed_use_usage_change_acq_stdprice_usage_index`(재일46014-2396) · 정책 `feedback_silent_omission_full_input_enforcement` · `feedback_no_silent_apportion_fallback`(미입력=검증 오류 차단)
- 전제: 본 계획은 **미배포 working tree**(상가 행 자동 시드 수정 포함) 기준. 인용 라인은 해당 트리 실측.

---

## 1. 원인 체인 (실측 — `PhdBuildingStdPriceModalButton.tsx`)

1. 겸용 모달의 부분 행은 chip으로 주택↔상가 전환(`:322-334`)·삭제(`:338-342`)가 자유 → **주택 행 0개 상태 구성 가능**(스크린샷 = 단일 행을 상가로 전환한 상태).
2. 상가 행은 취득·최초공시 구조·용도 입력 UI가 숨김(`:347`·`:361` `row.category === "housing"` 게이트) → 상가 행의 `acquisition`/`firstDisclosure`는 항상 `undefined`(`:193-194`).
3. Case A 주입(`commercialAcqFirstMode`)은 **주택 행이 있을 때만** 동작: `:199-208` `const firstHousing = parts.find(housing); if (firstHousing) {…}` — **주택 행 부재 시 조용히 skip, 오류 없음**.
4. 엔진은 시점 미지정 부분을 정상적으로 skip(`lib/calc/phd-building-std-batch.ts:56` `partAtPoint` undefined → `:225` "미지정 시 skip") → 결과 = 양도시 상가 1개만.
5. `handleCalc`의 부분 행에 대한 유일한 검증은 양도당시 구조·용도·연면적(`:182-184`, 그 외는 신축연도 `:171-175`뿐) → 부분 산출이 **오류 없이 결과·"모두 적용 1개"까지 도달**(silent omission).

**법적 배경**: Case A 취득·최초공시 상가는 당시 실제 용도(주택)의 구조·용도로 산출한다(재일46014-2396 — 검증 완료). 즉 **주입원인 주택 행이 없으면 취득·최초공시 상가는 법적으로 산출 불가능한 구성**이다. fallback으로 메꿀 값이 없고, 메꾸면 자동 fallback 금지 정책 위반.

## 2. 케이스 매트릭스 (현행 → 목표)

| # | 구성 | commercialAcqFirstMode | 현행 | 목표 |
|---|---|---|---|---|
| M1 | 주택≥1 + 상가≥1 (정상, 자동 시드 기본) | ON | 6값 산출 ✅ | 불변 |
| M2 | **주택 0 + 상가만** | ON | 양도 상가만 silent 산출 🐛 | **계산 차단 + 오류 안내** |
| M3 | 주택만 (상가 0) | ON | 주택 3값 산출 | 불변(상가 미입력은 사용자 선택 — 적용 count로 가시) |
| M4 | 주택 0 + 상가만 | OFF | (도달 불가) | **이론상 조합 — 현행 도달 불가**. 전 호출부 실측: `enableCommercial ⇔ commercialAcqFirstMode`(둘 다 `splitMode` — `ThreePointStandardPriceInput.tsx:691·703`·`ThreePointAssetMajorRender.tsx:119-120`), 상속(`HouseValuationSection.tsx:314-319`)은 둘 다 미전달. Case B는 `enableCommercial=false` → chip 미노출(`:322`) → 상가 행 구성 불가. 가드 조건을 `commercialAcqFirstMode`로 두는 것은 향후 호출부 대비 방어적 경계일 뿐 현행 동작 변화 없음 |
| M5 | 단독(enableCommercial=false) | — | 주택(건물) 단일 | 불변 (chip 자체 미노출 `:322`) |
| M6 | M1이지만 주택 행 취득·최초공시 구조·용도 미입력 | ON | 해당 시점 skip | 불변(시점별 skip은 공시지가 미입력 skip과 동일한 기존 설계 — 본 계획 범위 외. §5 리스크 참조) |

## 3. 설계

### F1 (채택) — 계산 차단 가드 (rows 기반·handleCalc 최상단)

**위치가 핵심**: parts 파싱 후(`:196`)에 두면 양도 구조·용도 검증(`:182-184`)이 먼저 걸려 사용자가 두 단계 오류를 순차로 겪고, 테스트도 Select 조작이 필요해진다. **`rows` 상태만으로 판정 가능**하므로 `handleCalc` 최상단(신축연도 검증 `:171` 앞)에 배치 — 구성 오류를 다른 입력과 무관하게 즉시 안내:

```ts
// Case A(commercialAcqFirstMode)는 취득·최초공시 상가를 주택 행에서 주입(재일46014-2396)
// — 주택 행 부재 시 양도 상가만 silent 산출되므로 구성 단계에서 차단.
if (commercialAcqFirstMode && !rows.some((r) => r.category === "housing")) {
  setError("취득·최초공시 상가분은 당시 실제 용도(주택)의 구조·용도로 산출합니다. " +
    "주택 부분 행이 필요합니다 — \"+ 부분 추가\" 후 주택을 선택하세요. " +
    "주택 행 없이 계산하면 양도시 상가만 산출되어 3시점 환산이 불완전합니다.");
  return;
}
```

- `상가 존재` 조건 불요: 삭제 버튼이 `rows.length > 1`에서만 노출(`:338`)이라 행 ≥ 1 보장 — 주택 0이면 전부 상가라 자동 성립. M3(주택만)은 `some(housing)=true`로 통과.
- 오류 표시는 기존 `setError` 채널 재사용(신규 UI 없음).

### F2 (기각) — 상가 행에 취득·최초공시 입력 노출
직전 계획서(D1) §3-1 D3 기각 사유 동일 — 주택 모달값과 다르게 입력 시 지수 불일치를 사용자 규율에 맡기게 됨. 채택 안 함.

### F3 (기각) — 마지막 주택 행 전환·삭제 금지
chip disable은 "왜 안 되는지"를 설명하기 어렵고 M3→M2 경계 상태 처리(전환은 되는데 삭제만 막힘 등)가 복잡. F1 오류 메시지가 사유를 직접 설명하므로 불요.

## 4. 파일별 변경 (surgical)

1. `components/calc/building-std-price/PhdBuildingStdPriceModalButton.tsx` — `handleCalc` **최상단**에 F1 가드 1블록(rows 기반). **그 외 무변경**(주입·엔진·스냅샷·applyBatch 불변).
2. 테스트 — 가드가 rows 기반 최상단이라 **Select 조작 불필요**(모달 열기 → chip 전환 → 계산 클릭만):
   - 컴포넌트 anchor(신규, `__tests__/components/phd-modal-commercial-only-guard.test.tsx`):
     (a) **M2** — enableCommercial+commercialAcqFirstMode로 렌더(자동 시드로 주택+상가 2행) → 주택 행 chip을 "상가"로 전환(2행 모두 상가) → "3시점 계산하기" 클릭 → 가드 오류 텍스트 노출·결과 미생성.
     (b) **M3 회귀** — 상가 행 삭제(주택만) → 계산 클릭 → 가드 오류 **아님**(신축연도 오류 등 후속 검증 메시지 = 가드 통과 증명).
     (c) **경계** — chip을 주택으로 복귀 → 가드 오류 소멸.
   - E2E는 기존 T6/T7이 M1 커버 — 신규 E2E 불요(모달 내부 로직, 컴포넌트 레벨로 충분).

## 5. 리스크 & 한계

| 항목 | 판단 |
|---|---|
| M6(주택 행 있으나 acq/first 구조·용도 빈값) — 여전히 해당 시점 silent skip | 기존 설계(공시지가 미입력 시점 skip `:209-215`과 동일 축). 본 가드 범위 외로 명시. 향후 "미산출 사유 표시" 개선으로 별도 다룰 수 있음(선택) |
| 기존 사용자 플로우 차단 오탐 | 조건 = Case A(commercialAcqFirstMode) + 주택 행 부재. M1/M3은 `some(housing)=true`로 통과, M5·상속은 `commercialAcqFirstMode` 미전달(false)로 통과, M4는 도달 불가(§2) — 오탐 경로 없음 |
| 자동 시드(미배포)와의 관계 | 시드가 M1 상태로 열어주므로 M2는 "행 삭제/전환" 후에만 도달 — 가드는 그 탈출구를 막는 마지막 층 |

## 6. 진행

1. Pre-Do anchor: M2 차단 테스트 선작성 → RED 확인(현행 silent 통과 재현) → F1 구현 → GREEN.
2. M3·M4 회귀 anchor GREEN.
3. `tsc`·관련 vitest·(선택) T6/T7 E2E 재실행.
4. working tree의 선행 2건(양도시 라벨·상가 시드)과 함께 1브랜치 ship.
