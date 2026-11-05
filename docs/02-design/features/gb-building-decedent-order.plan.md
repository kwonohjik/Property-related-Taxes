# 일반건물 「건물 피상속인 취득일」 — 순서 검사 없음 (V-4)

> **출처**: `expropriation-77-9-gb-d2.plan.md` §3 V-4(#2915).
> **검증 깊이**: L2 — ⑧·⑫에 순서 검사를 더한다. 엔진은 그대로다. 정상 입력(건물 피상속인 취득일 < 건물 상속개시일)의 세액은 바뀌지 않는다.

## 0. 결론

**결함이다 — 틀린 날짜가 경고 없이 계산된다.**
- 일반건물에서 토지·건물 취득일을 나눠 입력(분리 ON)하고 건물을 상속받은 경우가 대상이다. 「건물 피상속인 취득일」이 건물 상속개시일과 같거나 그보다 늦어도 ⑧·⑫ 모두 통과한다.
- 엔진은 그 날짜로 세율 보유기간과 수용 감면을 판정해 세액이 바뀐다. 양도일보다 늦은 날짜도 통과한다.
- 권장: **Q-1 a** — ⑧·⑫에 「건물 피상속인 취득일 < 건물 상속개시일」 검사를 넣는다. 오류를 누르면 그 칸으로 간다.

## 1. 실측 (route probe · 화면 입력 형식 → ④ → ⑫ → 엔진 · 세율 mock)

일반건물 · 분리 ON · 토지 매매 2008-01-01 · 건물 상속개시 2024-01-10 · 수용(사업인정고시 2025-06-01) · 양도 2026-06-30 · 12억(#2915 anchor G2 픽스처).

| 건물 피상속인 취득일 | ⑧ | ⑫ | 감면액 | 결정세액 | 법상 |
|---|---|---|---|---|---|
| 2000-01-01 | 통과 | 200 | 26,775,345 | 151,726,963 | 정상 |
| 2023-12-01 | 통과 | 200 | 22,872,499 | 155,629,809 | 정상(고시일 소급 2년 안 → 건물분 감면 제외) |
| 2024-01-10 (= 상속개시일) | **통과** | **200** | 22,872,499 | 155,629,809 | 틀린 입력 |
| 2025-01-01 (상속 뒤) | **통과** | **200** | 22,128,230 | 156,162,538 | 틀린 입력 — 세액이 바뀐다 |
| 2027-01-01 (양도일 뒤) | **통과** | **200** | 22,278,230 | 163,454,846 | 틀린 입력 — 세액이 바뀐다 |

원인(코드):
- ⑧ `validateGbDecedentDates`(`lib/calc/transfer-tax-validate-gb-required.ts`)는 비었는지만 본다. 피상속인 순서 검사 `getAssetDateOrderIssue`(`transfer-tax-validate-asset.ts`)는 최상위 `decedentAcquisitionDate`만 본다.
- ⑫ `transfer-tax-schema-required-refines-gb.ts` D3도 비었는지만 본다.
- 같은 검사는 주택·D2(`decedentAcquisitionDate` vs `acquisitionDate`)와 일반건물 토지(#2915 `decedentOrderBasisDate`)에는 있다. 일반건물 건물 칸에만 없다.

부수 관찰: ⑫ D1·D3 오류 문구가 「(소득세법 §95④·§104②1호)」다. #2911이 ⑧·화면에서 고친 인용(일반건물은 가업상속 입력이 없어 §95④ 단서가 쓰이지 않는다)이 ⑫에는 남아 있다. ⑧이 먼저 막아 보통은 화면에 나오지 않는다.

## 2. 결정 Q-n

| ID | 질문 | 선택지 | 권장 |
|---|---|---|---|
| Q-1 | 순서 검사 | **a** ⑧·⑫ 모두 — 일반건물 · 분리 ON · 건물 상속이고 「건물 피상속인 취득일」을 입력했으면 건물 상속개시일(`acquisitionDate` · ⑫ `buildingAcquisitionDate`)보다 앞서야 한다. ⑧ 오류는 `gbBuildingDecedentAcquisitionDate` 칸 키로 이동 · **b** ⑧만 · **c** 그대로 | **a** — 틀린 날짜로 세액이 바뀐다. ⑧만 고치면 API 직접 호출·옛 세션에서 새고, 다른 자산종류는 ⑧·⑫ 둘 다 막는다 |
| Q-2 | ⑫ D1·D3 문구의 「§95④·§104②1호」 | **a** 「§104②1호」로 고친다(⑧과 같게) · **b** 그대로 | **a** — 같은 PR에서 한 줄씩 |

예상 시간: Q-1 a 약 45분(anchor · 뮤테이션 · 화면 확인) · Q-2 a 약 5분.

## 3. 미검증 V-n

| ID | 항목 | 상태 |
|---|---|---|
| V-1 | 토지·건물 모두 상속이고 「건물 피상속인 취득일」을 비운 경우 — 엔진은 토지의 피상속인 취득일을 건물에도 쓴다(`buildingDecedent ?? decedent`). 토지와 건물의 상속개시일이 다르면 그 값이 건물 상속개시일보다 늦을 수 있다 | 재지 않음 — 확인 필요(이번 범위 밖) |

## 4. 구현 계획(권장안 기준)

1. anchor 먼저(수정 전 실패 확인): §1 표의 틀린 입력 3행 → ⑧ `gbBuildingDecedentAcquisitionDate` 칸 · ⑫ 400 `generalBuildingValuation.buildingDecedentAcquisitionDate`. 정상 2행은 세액 그대로. 입력칸 이동 레지스트리(`e2e/_helpers/validation-field-jump-cases-gb.ts`)에 1건.
2. 구현: ⑧ `validateGbDecedentDates`에 순서 검사 · ⑫ D3 옆에 같은 검사 · ⑫ 문구 정정.
3. 뮤테이션 → 회귀(`__tests__/calc` · `components` · `lib` · `api`) → tsc·eslint → Playwright(오류 클릭 → 칸 이동).
4. 결과를 §5에 적는다.

## 5. 구현 결과 (2026-11-05 · 결정: Q-1 a · Q-2 a)

### 5.1 변경

| 항목 | 파일 | 내용 |
|---|---|---|
| Q-1 ⑧ | `lib/calc/transfer-tax-validate-gb-required.ts` `validateGbDecedentDates` | `gbBuildingOwnDecedentDate`(분리 ON · 건물 상속 · 입력값) ≥ `acquisitionDate`(건물 상속개시일)이면 「건물 피상속인 취득일은 건물 상속개시일보다 이전이어야 합니다.」 · 칸 키 `gbBuildingDecedentAcquisitionDate` |
| Q-1 ⑫ | `lib/api/transfer-tax-schema-required-refines-gb.ts` D3′ | `buildingDecedentAcquisitionDate` ≥ `buildingAcquisitionDate`이면 같은 문구로 400 |
| Q-2 | 같은 ⑫ 파일 D1·D3 | 「(소득세법 §95④·§104②1호)」 → 「(소득세법 §104②1호)」 |

엔진 불변. 정상 입력의 세액 불변(아래 anchor).

### 5.2 테스트

- route anchor `__tests__/api/gb-building-decedent-order.anchor.test.ts` 7건 — 수정 전 4건 실패 → 통과:
  - 정상 2000 → 151,726,963 · 2023-12-01 → 155,629,809(세액 불변).
  - 2024-01-10 · 2025-01-01 · 2027-01-01 → ⑧ `gbBuildingDecedentAcquisitionDate` · ⑫ 400 `generalBuildingValuation.buildingDecedentAcquisitionDate`.
  - 대조: 토지만 상속(건물 매매)은 무관 · Q-2 ⑫ 비움 문구.
- 입력칸 이동 레지스트리(`e2e/_helpers/validation-field-jump-cases-gb.ts`) +1 — vitest 통과 · E2E(headless Playwright) 일반건물 피상속인 3건 통과(새 순서 케이스 포함 — 오류 클릭 → 그 칸).
- 뮤테이션 4건 모두 잡힘: M1 ⑧ 순서 검사 제거(3 실패) · M2 ⑫ 순서 검사 제거(3) · M3 ⑧ `>=` → `>`(1 — 같은 날) · M4 ⑫ 옛 인용 복원(1).
- 회귀(묶음별 순차 실행 — 메모리 부족 회피): `__tests__/api` 5,853 · `lib` 3,328 · `components` 6,781 · `calc` 11,164 모두 통과 · tsc 0 · eslint 0.

### 5.3 남은 것

- V-1(토지·건물 모두 상속 · 건물 피상속인 취득일 비움 · 상속개시일이 다를 때 토지 값 fallback) — §3 그대로.
