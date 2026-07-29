# 겸용 PHD 3시점 버튼 — Case B는 "주택 전용"으로 (상가는 전용 섹션 일임) 수정 계획서

> 상태: Plan (Do 미착수) · 작성 2026-07-14 · **전면 개정(v2)**: 초판 "commercial>0 게이트" 전제는 오류로 폐기 — §0.1 참조.
> 대상: `components/calc/transfer/ThreePointStandardPriceInput.tsx` (겸용 PHD 3시점 → `PhdBuildingStdPriceModalButton`)
> 관련: [[project_transfer_phd_3point_batch_stdprice]] · [[project_transfer_mixed_use_asset_major_stdprice]] · [[feedback_ui_toggle_auto_visibility_policy]] · [[feedback_anchor_correction_legal_priority]]

## 0. 한 줄 요약

겸용주택 PHD 3시점 「주택분 기준시가」 영역의 일괄 계산 버튼이 "3시점 **주택·상가** 건물기준시가 일괄 계산"으로 표시된다. 이는 correctness 버그는 아니나(배치가 실제로 주택 3시점 + 양도 상가를 산출하는 Option B 설계), **상가(취득·양도)는 아래 전용 ③ 상가 기준시가 섹션이 이미 전부 담당**하므로 PHD 주택 버튼의 양도 상가 산출은 **중복·혼란**이다. **Case B(용도변경 없음) 겸용에서 PHD 버튼을 "주택 전용"으로 전환**한다. Case A(splitMode·4부분 분리)는 상가 유지.

## 0.1 초판 폐기 사유 (재검토, 2026-07-14)

초판은 "상가 면적 0인데 라벨이 주택·상가로 뜬다 = 버그 → commercial>0 게이트"로 판단했으나 **틀렸다**:
- `transfer-tax-validate-asset.ts:313-321` — **겸용 자산(`isMixedUseHouse`)은 상가 전용면적 > 0 필수**(미입력 시 validation 차단). → **유효(계산 가능) 겸용은 항상 commercial>0**이라 게이트가 무의미.
- 라벨 "주택·상가"는 **유효 겸용에 대해 기능적으로 정확**(배치가 양도 상가를 실제 산출·`mixedTransferCommercialBuildingPrice`에 라우팅).
- 진짜 이슈는 "상가 전용 섹션이 따로 있는데 주택 버튼이 상가까지 함"이라는 **중복 UX**(사용자 지적).

---

## 1. 현행 동작 (실측)

### 1.1 라벨·상가 UI = `enableCommercial`

`PhdBuildingStdPriceModalButton.tsx:142-146`: `enableCommercial`이 라벨 + 모달 주택/상가 라디오 + 결과 상가행을 동시 제어.

`ThreePointStandardPriceInput.tsx:663-664`:
```ts
const enableCommercial = splitMode || props.onCommercialBuildingStdPriceAtTransferChange != null;
```
겸용(`MixedUsePreHousingDisclosureSection`)이 양도 상가 콜백을 무조건 전달 → **Case B에서도 `enableCommercial=true`** → 라벨 "주택·상가", 배치가 양도 상가 산출(Option B).

### 1.2 상가는 전용 ③ 섹션이 전부 담당 (실측)

`MixedUseAssetMajorStdPrice.tsx:195-207` — **취득시·양도시 상가건물 기준시가 입력란 둘 다** 존재, `mixedAcqCommercialBuildingPrice`·`mixedTransferCommercialBuildingPrice`에 read/write. PHD 배치의 양도 상가와 **같은 필드 공유**(양방향, CLAUDE.md 문서화). → **Case B 상가는 ③ 섹션만으로 완결**.

### 1.3 `enableCommercial` 소비 지점 = 모달 버튼 단독

`ThreePointStandardPriceInput.tsx:670`에서 `<PhdBuildingStdPriceModalButton enableCommercial=... />`로만 전달. 그 외 `enableCommercial` 사용 없음(grep 확인) → 변경 영향은 **모달 버튼 라벨·상가 UI에 한정**.

---

## 2. 케이스 매트릭스

| 경로 | splitMode | 현행 `enableCommercial` | 현행 버튼 | 기대 | 조치 |
|---|---|---|---|---|---|
| 단독(`PreHousingDisclosureSection`) | false | false(콜백 미전달) | "3시점 건물기준시가" | 동일 | 무변화 |
| 겸용 **Case B**(용도변경 없음) | false | **true** | "주택·상가" + 양도 상가 배치 | **"3시점 주택 건물기준시가"** + 주택만 | 🔧 **수정** |
| 겸용 **Case A**(용도변경, 최초공시<변경) | true | true | "주택·상가" + 4부분 | 동일(상가 유지) | 무변화(splitMode 강제) |

---

## 3. 수정안

### 3.1 `enableCommercial = splitMode`

`ThreePointStandardPriceInput.tsx:663-664`:
```ts
// 겸용 상가(취득·양도)는 전용 ③ 상가 기준시가 섹션(MixedUseAssetMajorStdPrice/Legacy)이 전담.
// PHD 3시점 버튼은 주택분 전용 — Case A(splitMode·4부분 분리)만 상가 포함.
const enableCommercial = splitMode;
```
- **Case B**: `enableCommercial=false` → 라벨 "3시점 건물기준시가", 모달 주택만. 양도 상가는 ③ 섹션에서 입력(같은 필드).
- **Case A**: `splitMode=true` → 무변화.
- **단독**: 무변화(원래 false).

### 3.2 안전성

- **데이터 손실 없음**: Case B 양도 상가는 ③ 섹션(`mixedTransferCommercialBuildingPrice`)에서 동일 필드로 입력. 취득 상가도 ③ 섹션(`mixedAcqCommercialBuildingPrice`).
- **applyBatch 라우팅(M1)**: Case B는 상가 UI 없음 → 상가 결과 미산출 → `props.onCommercial...?.()` 미발화. 콜백은 값 read용으로 계속 전달되나 라우팅 불일치 없음(optional-chaining).
- **`commercialBuildingStdPriceAt*` 값 props**: Case B(non-split)에서 PointBlock은 상가 미렌더(`splitMode` 조건) → inert. 무영향.

### 3.3 트레이드오프 (사용자 승인 2026-07-14)

Option B 설계의 "Case B 양도 상가 자동산출" 편의를 **제거**. 사용자는 상가를 전용 ③ 섹션에서 입력하므로 중복 해소가 우선. Case A 4부분 자동산출은 유지.

---

## 4. Pre-Do Anchor

RTL — `MixedUsePreHousingDisclosureSection`(겸용 상가 콜백 전달) 렌더:
- **A1 (Case B, 수정 핵심)**: `hasPartialUsageChange=false`(splitMode=false) + 겸용 필드(상가면적>0) → 버튼 라벨 **"3시점 건물기준시가 일괄 계산"** 존재, **"주택·상가"** 부재. (현행: fail)
- **A2 (Case A 회귀 가드)**: `hasPartialUsageChange=true` + `partialChangeDirection="house_to_commercial"` + 최초공시일<용도변경일 → splitMode=true → **"주택·상가"** 존재.
- 파일: `__tests__/components/phd-mixed-use-button-housing-only.test.tsx`

---

## 5. 구현 단계

1. Pre-Do anchor A1·A2 작성·실행 → verify: A1 현행 fail(재현), A2 pass.
2. `ThreePointStandardPriceInput.tsx:663-664` `enableCommercial = splitMode` + 주석(§3.1) → verify: tsc 0.
3. anchor 재실행 → verify: A1·A2 pass.
4. 회귀: `npx vitest run __tests__/calc/ __tests__/components/ __tests__/tax-engine/transfer/ __tests__/print/` → verify: green(특히 phd-batch·mixed-use 계산서·print leaf).
5. lint(변경 파일) → verify 0.
6. 브라우저/E2E: 겸용 Case B → 버튼 "3시점 건물기준시가"(주택만), 상가는 ③ 섹션. Case A → "주택·상가" 유지. [[feedback_browser_verify_with_playwright]]

## 6. 완료 기준 (DoD)

- [ ] Pre-Do anchor A1(Case B=주택만)·A2(Case A=주택·상가) 통과
- [ ] Case B: 라벨 "3시점 건물기준시가", 모달 상가 라디오·결과 상가행 미노출
- [ ] Case B 양도/취득 상가 = ③ 섹션에서 정상 입력(같은 필드, 데이터 손실 0)
- [ ] Case A(splitMode)·단독 무변화(회귀 0)
- [ ] `tsc --noEmit` 0 · 회귀 green · lint 0
- [ ] print leaf·mixed-use 계산서 회귀 0
- [ ] 브라우저/E2E 확인 또는 미수행 명시

## 7. 미결

- **③ 상가 섹션 상시 렌더**(초판 §8): 유효 겸용은 commercial>0라 정상. 별도 게이트 불요(폐기).
- 라벨을 "3시점 **주택** 건물기준시가"로 "주택" 명시할지: 현행 비겸용 라벨("3시점 건물기준시가")과 통일 vs 주택 명시. 본안은 통일(주택 미명시) — 필요 시 `buttonLabel` 후속.
