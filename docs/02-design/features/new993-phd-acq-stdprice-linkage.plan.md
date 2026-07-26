# 수정 계획서 — §99의3 취득시 기준시가 ↔ PHD 환산 연계(3시점 패턴)

**작성일**: 2026-07-26
**세목**: 양도소득세 (조특법 §99의3 + §164⑤ PHD 환산)
**증상**: PHD 환산(최초공시 전 취득)이 켜져도 상단 "취득시 기준시가"가 계속 노출되고, PHD 결과가 "적용" 버튼을 눌러야만 반영 → 두 입력이 분리돼 혼란.

> ✅ **구현 완료 (2026-07-26)**: API source ternary + UI 숨김/echo + validate 미러 + PHD 섹션 재배치(취득시 기준시가 직전). "적용" 버튼 제거(onApplyResult 미전달). anchor 5건(API 3 + UI 2) + tsc 0건 + 회귀 1982건 통과. **주택 취득가액 환산 3시점 기능처럼**, PHD 환산 시 상단 취득시 기준시가를 숨기고 자동 연계. **추가로 PHD 환산 섹션을 취득시 기준시가 바로 위로 이동**(입력→출력 순서·모드 토글은 영향 필드 직전).

---

## 1. 현황 (실제 코드 검증)

- **UI**(`New993InputForm.tsx:158-170`): 상단 "취득시 기준시가"(`standardPriceAtAcquisition993`) = `HousingStdPriceLookupField` (수동/조회). 하단 `ReductionPhdInput`(PHD 환산) 별도.
- **PHD 적용은 버튼 뿐**: `ReductionPhdInput.tsx:266-272` — 결과 박스의 "↓ 위 값을 취득시 기준시가 필드에 적용"(`onApplyResult`) **클릭 시에만** `standardPriceAtAcquisition993`에 반영. 자동 연계 없음.
- **엔진은 PHD 미소비**: `income-deduction-router.ts:195` `evalNew993`은 `standardPriceAtAcquisition993`만 사용. `phdMode993`·`phd*` 필드는 엔진 입력에 전달되나(`transfer-tax-api-reductions.ts:112-140`) **evaluateNew993이 참조 안 함** → PHD 환산은 오직 UI 버튼→필드 경로.
- **Validation**(`transfer-tax-validate-reductions.ts:112-115`): PHD ON/OFF 무관하게 `standardPriceAtAcquisition993 > 0` 요구(메시지만 phdMode993 분기). 주석 "PHD 모드 ON 시 자동 산출되어 …에 적용됨" — 버튼 적용을 전제.
- **PHD 환산 함수**: `calcReductionAcquisitionStdPrice(phdInput)` → `.estimatedAcquisitionStdPrice`, `canCalcReductionPhd(phdInput)` (`transfer-reductions/phd-helper.ts:56,81`). 입력: `firstDisclosurePrice`·`landAreaSqm`·`landPricePerSqmAtAcquisition`·`landPricePerSqmAtFirstDisclosure`·`buildingStdPriceAtAcquisition`·`buildingStdPriceAtFirstDisclosure`.

## 2. 참조 패턴 — §155⑳ `isPhrpStdPriceLinked` (검증됨)

`RentalHousingExceptionSection.tsx:183-217`: `isPhrpStdPriceLinked(asset)` true면 취득/양도시 기준시가 **입력 숨김 + echo 카드**, API/validate는 **source ternary**(`linked ? asset값 : 수동`)로 소비 — **useEffect 미러 없음**(`mirror-pattern` 정책 준수). 동일 구조를 §99의3에 적용.

## 3. 설계 — source ternary + UI 숨김 + validate 미러

게이트 = **`phdMode993 === true`**(PHD 환산 ON). ReductionPhdInput 토글이 곧 연계 스위치.

### 3-a. API (④) — PHD 환산 자동 resolve
`transfer-tax-api-reductions.ts:106` new_99_3 변환에서:
```ts
const phdInput = { firstDisclosurePrice, landAreaSqm, landPricePerSqmAtAcquisition,
  landPricePerSqmAtFirstDisclosure, buildingStdPriceAtAcquisition, buildingStdPriceAtFirstDisclosure }; // r.phd*993 파싱
const acqStd = (r.phdMode993 && canCalcReductionPhd(phdInput))
  ? calcReductionAcquisitionStdPrice(phdInput).estimatedAcquisitionStdPrice
  : parseAmount(r.standardPriceAtAcquisition993 || "0");
// standardPriceAtAcquisition993: acqStd
```
→ 엔진이 버튼 없이도 PHD 환산값 수신(single source). `lib/calc`에서 엔진 helper import 가능(기존 다수 사례).

### 3-b. UI (⑤) — PHD ON 시 상단 취득시 기준시가 숨김 + echo
`New993InputForm.tsx`:
- `const phdActive = value.phdMode993 === true;`
- `phdActive`면 상단 `HousingStdPriceLookupField`(취득시) **미렌더**. 대신 **echo 카드**: "취득시 기준시가 — PHD 환산 자동 계산: {계산값}" (같은 `calcReductionAcquisitionStdPrice`로 산출·표시). 미입력 시 "PHD 입력을 완료하세요".
- `phdActive` 아니면 기존 조회 필드 유지.
- **`onApplyResult` 전달 제거** → ReductionPhdInput의 "적용" 버튼 미노출(`:266 {onApplyResult && …}`), 중복 제거. (ReductionPhdInput은 New993 전용이라 안전.)
- 전용면적 자동채움(`onExclusiveArea`)은 숨김 시 5년/양도시 조회 필드가 계속 담당 — 회귀 없음.

### 3-b'. UI 순서 재배치 (⑤) — PHD 환산을 취득시 기준시가 직전으로
현재 순서: 취득유형/소재지 → **취득시 기준시가 → 5년 → 양도시 → 전용면적 → PHD 환산(맨 아래)**.
변경 순서:
```
취득 유형 / 소재지
PHD 환산 (ToggleCard — OFF 시 한 줄로 접힘)   ← 이동
취득시 기준시가 (PHD ON이면 echo)
5년 시점 기준시가
양도시 기준시가
전용면적
```
- 근거: PHD 환산 = 취득시 기준시가의 **입력(산출원)** → 입력이 출력 위(`ui_order_follows_logic`). PHD 토글은 취득시 기준시가에만 영향 → **영향 필드 직전**(`toggle_card_visibility`).
- 맨 위(취득유형 위) 아님 — PHD는 취득시 기준시가에만 결합. `ReductionPhdInput`은 ToggleCard라 OFF 시 접혀 일반 케이스 부담 최소.
- 구현: `New993InputForm.tsx`에서 `<ReductionPhdInput>` JSX를 3시점 그리드 위(취득유형/소재지 `<div className="grid …">` 직후, 취득시 기준시가 셀 앞)로 이동. echo/숨김(3-b)과 동일 컴포넌트 트리에서 처리.

### 3-c. Validation (⑧) — 미러
`transfer-tax-validate-reductions.ts:114`:
```ts
if (r.phdMode993) {
  // PHD ON: 환산 입력 충분 여부로 검증(수동 필드 대신)
  if (!canCalcReductionPhd(phdInputFromForm)) return fail("PHD 환산 입력을 완료하세요 …");
} else if (parseAmount(r.standardPriceAtAcquisition993 || "0") <= 0) {
  return fail("취득시 기준시가를 입력하세요");
}
```
→ UI 숨김(수동 필드 빈 값)에도 validate가 PHD 입력으로 통과 — UI/validate 모순 제거(⑧ 정책).

## 4. 트레이드오프

| 옵션 | 내용 | 채택 |
|---|---|---|
| **A (권장)** | API source ternary + UI 숨김/echo + validate 미러(§155⑳ 패턴) | 자동 연계·버튼 제거·mirror 정책 준수·엔진 무변경 | ✅ |
| B | useEffect로 PHD 결과 → store 미러 | 무한루프 위험·`useeffect_store_mirror_forbidden` 위반 | ✗ |
| C | 엔진 evalNew993이 phdMode993 resolve | 엔진 변경·타 조문 파급 | ✗(과함) |

## 5. 구현 (3 파일)

1. **`lib/calc/transfer-tax-api-reductions.ts`**: new_99_3 `standardPriceAtAcquisition993`를 source ternary로. 헬퍼 import.
2. **`components/calc/transfer/New993InputForm.tsx`**: `phdActive` 게이트 — 상단 취득시 조회 숨김 + echo 카드. `onApplyResult` 미전달.
3. **`lib/calc/transfer-tax-validate-reductions.ts`**: new_99_3 취득시 기준시가 검증을 phdMode993 분기(PHD ON=환산입력 충분성).

- (선택) `ReductionPhdInput`: onApplyResult 미사용 시 "적용" 버튼 코드 잔존은 무해(다른 조문 확장 대비). 제거는 별건.

## 6. 성공 기준 (verify)

1. **API anchor**(`__tests__/calc/`): phdMode993=true + PHD 입력(최초공시가·면적·토지단가) → 변환 결과 `standardPriceAtAcquisition993 = calcReductionAcquisitionStdPrice(...)` 값. phdMode993=false → 수동값 그대로. → verify(1원 일치).
2. **UI anchor**(RTL): phdMode993=true → `new993-stdprice-acq` 조회 위젯 미렌더 + echo 텍스트 노출. false → 위젯 렌더. → verify.
3. **validate anchor**: phdMode993=true + 수동 취득시=0 + PHD 입력 충분 → 통과. PHD 입력 부족 → 차단. phdMode993=false + 수동=0 → 차단. → verify.
4. `npx tsc --noEmit` 0건 · 기존 §99의3 회귀(`__tests__/**/new-99-3*`, reduction) 통과.
5. **브라우저**: PHD 환산 ON → 상단 취득시 기준시가 숨김 + echo, 계산 시 환산값 반영(미수행 시 명시).

## 7. 동기화 지점 (14 중 관련)

| # | 지점 | 상태 |
|---|---|---|
| ④ API 변환 | new_99_3 취득시 기준시가 source ternary | **수정** |
| ⑤ UI 위젯 | 상단 취득시 기준시가 조건부 숨김 + echo | **수정** |
| ⑧ Validation | phdMode993 분기 미러 | **수정** |
| ①②③ store·⑨~⑭ | 키·Zod·Route·엔진 | 변경 없음 |

## 8. 관련 메모리·정책
- `feedback_engine_result_display_drift` ★★★ / `mirror-pattern` ★★★ (source ternary·미러 3중, useEffect 금지)
- `feedback_useeffect_store_mirror_forbidden` ★★★
- `project_transfer_phrp_stdprice_link_dedup` ★★ (§155⑳ 동일 연계 선례)
- `project_apartment_pre_disclosure` ★★★ (§164⑤/⑦ 환산)
- `feedback_validation_sync_8th_point` (UI↔validate 정합)
