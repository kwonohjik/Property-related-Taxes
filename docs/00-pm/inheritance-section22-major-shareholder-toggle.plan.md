# §22② 최대주주 — 라벨 변경 · 자동판정 제거 · 토글화 + 금융재산공제 실연동 수정 계획서

> 작성일: 2026-05-26
> 대상 섹션: 비상장주식 V2 카드 §22② 판정 (`MajorShareholderStockToggle`, 화면 ⑩번 카드)
> 관련 메모리: [[feedback_no_silent_apportion_fallback]] · [[feedback_three_state_optional_mode_toggle]] · [[single-source-engine-helper]] · [[feedback_ui_toggle_auto_visibility_policy]] · [[mirror-pattern]]
> 법령: 상증법 §22②(최대주주 보유 주식등은 금융재산공제 금융재산에 **포함되지 아니한다**, KoreanLaw mst=276123 검증) · §63③(할증평가 — **별개**)

---

## 1. 요구사항 (사용자)

1. 라벨 `§22② 최대주주 추가공제 제외 판정` → **`금융재산공제가 배제되는 최대주주 해당 여부`**
2. **자동 판정(보유지분율 기준) 제거** — 3-state RadioCardGroup(auto/manual_on/manual_off) → **토글(ON/OFF)**
3. **금융재산 상속공제에 실제 반영** — 토글 "여(ON)"이면 해당 비상장주식(V2)을 **§22 금융재산 상속공제 대상금액에서 제외**

---

## 2. 현행 구조 진단 (조사 완료)

### 2.1 핵심 발견 — 현재는 "표시 전용", 계산 미반영

`section22MajorShareholderMode`(`UnlistedStockValuationInput`, 3-state)는 **echo/표시 전용**이다:
- `evaluateUnlistedStockV2` 엔진이 **소비하지 않음**.
- 실제 §22 금융재산공제 합산은 **별도 경로** `resolveFinancialEligibility(item)`가 구동하며, 이 함수는 `section22MajorShareholderMode`를 **읽지 않는다**. 비상장주식(`unlisted_stock`) 카테고리는 `CATEGORY_DEFAULT`에서 `true`(포함)라 **토글과 무관하게 항상 §22에 포함**되어 왔다.

→ **즉 현재 토글은 라벨이 "제외"라고 하지만 실제로는 아무것도 제외하지 않는 disconnect 상태.** 요구사항 3은 이 disconnect를 바로잡는 것(법 §22② 취지대로 실연동).

### 2.2 ★ §22 공제의 실제 계산 흐름 (정정 — 중요)

**엔진의 실제 §22 공제는 estateItems를 순회하지 않는다.** 단일 입력 필드 `netFinancialAssets`에서 계산:

```
EstateItem[] ──filter(resolveFinancialEligibility)──▶ suggestNetFinancialAssets(제안값)
                                                          │  [적용] 버튼 (step4-5.tsx:118, 수동)
                                                          ▼
                                            form.netFinancialAssets (사용자 입력 필드)
                                                          ▼  InheritanceTaxForm.tsx:261
                                  engine input.netFinancialAssets ──▶ calcFinancialDeduction()  ← 실제 공제
```

- **실제 공제 base = `input.netFinancialAssets`** (`inheritance-deductions.ts:638` `calcFinancialDeduction(input.netFinancialAssets ?? 0)`). 사용자가 **직접 입력**하거나 **제안을 [적용]** 한 숫자.
- `resolveFinancialEligibility`는 **제안(`suggestNetFinancialAssets`) + 표시 전용**:

| 소비처 | 용도 |
|---|---|
| `inheritance-deduction-suggest.ts:115` | `estateItems.filter(resolveFinancialEligibility)` → **§22 순금융재산 *제안값*** 합산 (사용자가 [적용] 시 `netFinancialAssets`에 반영) |
| `InheritanceTaxResultView.tsx:75` | 결과 화면 §22 적격 자산 목록(표시) |
| `FinancialDeductionChip.tsx:31` | 자산별 "금융재산공제 적용/제외" 칩(표시) |
| `asset-toggle-visibility.ts:133` | 자산 카드 토글 자동 노출 |

→ **이 함수 1곳에 §22② 가드를 추가하면 4개 소비처가 자동 추종**([[single-source-engine-helper]]). 단 **엔진 직접 변경은 없으며**, 실제 공제 반영은 **제안 [적용] 경로를 통해** 일어난다(§3.2·§4 참조).

### 2.3 EstateItem 구조

`EstateItem.unlistedStockValuationV2?: UnlistedStockValuationInput`(L80). `resolveFinancialEligibility(item)`는 `item.unlistedStockValuationV2?.<신규 boolean 필드>`로 토글값 접근 가능.

### 2.4 현행 필드·소비 지점 인벤토리

| 위치 | 내용 |
|---|---|
| 타입 `unlisted-stock-valuation.types.ts:155` | `section22MajorShareholderMode?: "auto"\|"manual_on"\|"manual_off"` |
| Zod `unlisted-stock-valuation-v2.schema.ts:168` | `.enum([...]).optional()` |
| 저장소 `unlisted-stock-valuation-lookup.ts:246,448` | 이력 roundtrip ×2 |
| UI 위젯 `MajorShareholderStockToggle.tsx` | RadioCardGroup 3-state + `deriveSection22MajorShareholder` 자동표시 |
| 렌더 `UnlistedStockV2Card.tsx:181-185,298-302` | handler·default `?? "auto"`·props |
| 결과 echo `PerShareValuationResultCard.tsx:230-246` | `AutoJudgmentEchoLines` 자동 판정 표시 |
| 자동판정 `auto-judgment.ts`(71줄) | `deriveSection22MajorShareholder` + `Section22MajorShareholderResult` (**section22 전용 export 2개뿐**) |
| 테스트 | `auto-judgment.test.ts` · `auto-judgment-integration.test.ts` (둘 다 derive 테스트) |

---

## 3. 설계

### 3.1 필드 표현 — 3-state enum → boolean

`section22MajorShareholderMode?: "auto"|"manual_on"|"manual_off"`
→ **`isSection22MajorShareholder?: boolean`** (true = 최대주주 해당 → §22 금융재산공제 배제)

- 토글 ON = `true`, OFF = `false`. 미입력(`undefined`) → **false(미해당, §22 포함)** = 기본 OFF.
- 토글 정책: [[feedback_ui_toggle_auto_visibility_policy]] — `ToggleCard`(Switch) 사용, native checkbox 금지. OFF에도 tone(violet) 유지.

### 3.2 ★ 금융재산공제 실연동 (요구사항 3 — 핵심)

`resolveFinancialEligibility(item)` 최상단에 **§22② 법정 배제 가드** 추가:
```ts
export function resolveFinancialEligibility(item: EstateItem): boolean {
  // §22② 법정 배제 — 최대주주 보유 비상장주식(V2) 토글 ON 시 무조건 제외 (법 §22②)
  if (item.unlistedStockValuationV2?.isSection22MajorShareholder === true) return false;
  // 우선순위 1: 사용자 명시값 (isFinancialAssetForDeduction) ...
  // (이하 기존 로직 그대로)
}
```
- **우선순위 최상위**: §22②는 법정 강제 배제("포함되지 아니한다")이므로 사용자의 `isFinancialAssetForDeduction=true`보다 우선해 false 반환.
- 토글 OFF(false/undefined): 가드 미발동 → 기존 로직(비상장 default true=포함) 그대로.
- **효과**: 단일 진실 가드 → **§22 순금융재산 *제안값*·결과뷰·칩**이 모두 자동으로 해당 주식을 제외. 사용자가 제안을 [적용]하면 `netFinancialAssets`가 줄어 실제 공제 ↓.
- **⚠️ 자동 폼 변경 금지** ([[mirror-pattern]]·[[feedback_no_silent_apportion_fallback]]): 토글 ON이라고 해서 `form.netFinancialAssets`를 `useEffect`로 자동 차감하지 **않는다**(무한 루프·침묵 변경 위험). 실제 공제 반영은 사용자 [적용] 경로 유지. 대신 **토글 ON인데 제안 미적용 상태면 안내**(제안 재적용 유도)로 disconnect를 가시화 — §3.5.
- **적용 범위**: 비상장 V2(`unlistedStockValuationV2`)에 한정. 상장주식·비상장 V1(간편)의 §22② 최대주주 배제는 **본 PR 범위 외**(별도 토글 없음) — 후속.

### 3.3 라벨·문구

- 토글 카드 헤더: **`금융재산공제가 배제되는 최대주주 해당 여부`** (⑩번 번호 유지, violet)
- 안내문: §22②는 금융재산공제 **배제** 판정 / §63③ 할증평가(×120%)는 **별도**임을 유지(혼동 방지).
- 토글 ON 시 결과 박지: "해당 → 이 비상장주식은 §22 금융재산 상속공제 대상금액에서 제외" 명시.
- 결과 echo(`PerShareValuationResultCard`)·칩 문구도 신규 라벨에 정합.

### 3.4 자동판정 제거

- `MajorShareholderStockToggle`·`PerShareValuationResultCard`에서 `deriveSection22MajorShareholder` import·사용 제거.
- `auto-judgment.ts` **파일 삭제**(section22 전용 export 2개뿐, 타 사용처 없음 확인) + 테스트 2파일(`auto-judgment.test.ts`·`auto-judgment-integration.test.ts`) 삭제.
- 보유지분율(44.44% 등) 자동 "판정"은 제거. (선택: 비-판정 참고 정보로 지분율 텍스트만 남길 수 있으나, "자동판정 삭제" 취지상 기본 제거 권장.)

### 3.5 disconnect 가시화 — 토글 ON ↔ 제안 미적용

엔진 §22 공제는 `netFinancialAssets` 입력값에서 나오므로(§2.2), **토글 ON이어도 사용자가 제안을 [적용]하지 않으면 실제 공제는 안 줄 수 있다**. 침묵을 막기 위해:
- 토글 ON일 때 §22 제안 카드(step4-5)·결과뷰에 안내: "최대주주 해당 — 이 비상장주식은 §22 금융재산공제에서 제외됩니다. 순금융재산 제안값에 반영되어 있으니 **[적용]하여 입력값에 반영**하세요."
- 결과 화면(`InheritanceTaxResultView`)은 이미 `resolveFinancialEligibility` 필터로 적격 자산 목록을 표시하므로, 토글 ON 시 해당 주식이 **목록에서 빠진 채** 표시됨 → 사용자가 입력값과의 불일치를 인지 가능.
- (대안 검토 후 폐기) 토글 ON 시 `netFinancialAssets` 자동 차감: `useEffect→store` 미러링이라 [[mirror-pattern]] 위반 → 채택 안 함.

---

## 4. ⚠️ 동작 변화 (반드시 인지)

1. **§22 공제 *제안값*·표시가 토글에 반응** — 종전 "완전 표시 전용(제안에도 미반영)"에서 **제안·표시에 반영**으로 전환. 토글 ON → 제안 순금융재산 ↓ → 사용자 [적용] 시 `netFinancialAssets` ↓ → 금융재산공제 ↓ → 상속세 ↑. **단 엔진은 입력값만 받으므로, 사용자가 제안 미적용·수동입력 유지 시 실제 공제는 자동으로 바뀌지 않는다**(§3.5 안내로 보완). = 본 앱의 제안-적용 아키텍처상 "직접 엔진 차감"은 불가.
2. **기본값 OFF(포함)** — 신규/미입력은 §22 포함(종전 계산과 동일). 안전.
3. **레거시 이력 마이그레이션** (string → boolean):
   - `"manual_on"` → **true**(ON, 배제) — 사용자 의도 존중.
   - `"manual_off"` → **false**(OFF, 포함).
   - `"auto"` → **false**(OFF) — 종전 auto는 표시 전용이라 계산상 항상 "포함"이었으므로 false가 계산 보존. (auto가 ON 표시였더라도 계산엔 미반영이었음.)
   - ※ `"manual_on"`→true는 해당 이력의 §22 계산을 바꿀 수 있음(종전 미반영 버그 정정). 개인용·저볼륨 이력이라 영향 경미하나 명시.

---

## 5. 변경 지점 (동기화 체크리스트)

| # | 파일 | 변경 |
|---|---|---|
| ① 타입 | `lib/tax-engine/types/unlisted-stock-valuation.types.ts` | `section22MajorShareholderMode` 제거 → `isSection22MajorShareholder?: boolean` + 주석 |
| ② **엔진연동** | `lib/calc/financial-deduction-resolver.ts` | `resolveFinancialEligibility` §22② 가드 추가 (§3.2) |
| ③ Zod | `lib/validators/unlisted-stock-valuation-v2.schema.ts:168` | `.enum([...])` → `z.boolean().optional()` (+ 레거시 string 허용 preprocess 또는 normalize 처리) |
| ④ 저장소 | `lib/calc/unlisted-stock-valuation-lookup.ts:246,448` | 필드명 교체 + 레거시 string→boolean 마이그레이션(§4-3) |
| ⑤ UI 위젯 | `MajorShareholderStockToggle.tsx` | RadioCardGroup→`ToggleCard`, 라벨 변경, derive 제거, boolean onChange, ON 결과문구 |
| ⑥ 렌더 | `UnlistedStockV2Card.tsx:181-185,298-302` | handler `(mode)`→`(boolean)`, default `?? false`, props |
| ⑦ 결과 echo | `PerShareValuationResultCard.tsx:230-246` | derive 제거, boolean 직접 표시, 라벨 정합 |
| ⑧ 자동판정 삭제 | `auto-judgment.ts` + 테스트 2파일 | 파일 삭제 |
| ⑨ 타입 export | `Section22MajorShareholderMode`(MajorShareholderStockToggle) | 제거 + `UnlistedStockV2Card` import 정리 |

| ⑩ 안내 UI | §22 제안 카드(`step4-5.tsx`) / 결과뷰 | 토글 ON ↔ 제안 미적용 disconnect 안내 (§3.5) |

> ⑥ 사이드바 합계: 해당 없음(§22는 결과 단계). 검증(`inheritance-validate.ts`): §22 토글 검증 없음 — 변경 불필요(확인됨).
> ⚠️ **부수효과 검증**: `asset-toggle-visibility.ts:133`도 `resolveFinancialEligibility(item)`로 일반 "금융재산공제 포함" 토글 default 노출을 결정. 가드 추가 시 §22② ON 자산은 이 토글이 default 노출에서 빠짐(법상 배제라 일관적이나 확인 필요). 비상장 V2 자산에서 **§22② 토글 ↔ 일반 isFinancialAssetForDeduction 토글 상호작용**이 모순/혼란 없는지 검증(AN 추가) — 필요 시 §22② ON일 때 일반 토글 숨김/잠금.

---

## 6. 검증 계획

### 6.1 Pre-Do anchor ([[feedback_pre_anchor_verification]])
- **AN-1 (실연동 핵심)**: 비상장 V2 EstateItem + `isSection22MajorShareholder: true` → `resolveFinancialEligibility(item) === false`. `false`(또는 undefined) → `true`(비상장 default 포함). **현행(연동 전)으로 실행 시 ON에도 true 반환 → 실패(gap 증명)**, 연동 후 GREEN.

### 6.2 회귀·정합
- **AN-2**: `suggestNetFinancialAssets(estateItems, debts)` *제안값* — 동일 세트에서 토글 ON일 때 제안 순금융재산이 비상장 평가액만큼 작아지는지(금액 비교). ※ 엔진 `calcFinancialDeduction(netFinancialAssets)`는 숫자만 받아 변경 없음 — anchor 대상은 *제안*.
- **AN-3**: 토글 OFF/미입력 → 기존과 동일하게 §22 포함(회귀 0).
- **AN-4 (마이그레이션)**: 레거시 `"manual_on"/"manual_off"/"auto"` → boolean 매핑(§4-3) roundtrip.
- **AN-5 (UI)**: `MajorShareholderStockToggle` ToggleCard ON/OFF 렌더 + 신규 라벨 + ON 시 "§22 제외" 문구. RTL.
- **AN-6 (부수효과)**: §22② ON 비상장 V2 자산 → `resolveAssetToggleVisibility`의 일반 `financialDeduction` 토글이 default 노출에서 제외되는지 + 모순 없는지 검증.
- **삭제 회귀**: `auto-judgment*.test.ts` 삭제 후 잔여 import 0 (`deriveSection22` grep 0건).

### 6.3 게이트
- `npx tsc --noEmit` 0 / `npx vitest run __tests__/tax-engine/property-valuation/ __tests__/calc/` / 커밋 전 전체 `npm test`.
- 브라우저: 토글 ON → §22 제안 카드의 순금융재산 제안값이 비상장 평가액만큼 감소 → **[적용]** → `netFinancialAssets` 반영 → 결과 화면 금융재산공제 ↓ 확인([[feedback_browser_verify_with_playwright]] — 가능 시 e2e). + 결과뷰 적격 자산 목록에서 해당 주식 제외 확인.

---

## 7. 작업 순서 (제안 커밋)

1. **C1 — Pre-Do anchor**: AN-1(resolveFinancialEligibility §22② 가드) 작성·RED 확보 → 연동 갭 증명.
2. **C2 — 타입+엔진연동**: 타입 boolean화(①) + `resolveFinancialEligibility` 가드(②) → AN-1/2/3 GREEN.
3. **C3 — Zod·저장소 마이그레이션**: ③④ + AN-4.
4. **C4 — UI 토글+라벨**: ⑤⑥⑦ ToggleCard·라벨·문구 + AN-5. 자동판정 표시 제거.
5. **C5 — 자동판정 삭제**: ⑧⑨ `auto-judgment.ts`+테스트 삭제, 잔여 참조 0 확인.
6. **C6 — 통합 검증·회귀**: 전체 `npm test` + 브라우저 §22 금액 감소 확인 + 메모리 환류.

---

## 7.1 구현 완료 (2026-05-26)

- **C1 ✅** anchor `__tests__/lib/calc/section22-major-shareholder-exclusion.test.ts` — AN-1(가드)·AN-2(suggest 제외) RED 확보(가드 부재 입증) → 연동 갭 증명.
- **C2 ✅** 타입 `isSection22MajorShareholder?: boolean` + `resolveFinancialEligibility` priority-0 §22② 가드 → AN-1/2/3 GREEN.
- **C3 ✅** Zod `z.preprocess`(레거시 string→boolean) + 저장소 lookup ×2 마이그레이션(manual_on→true, manual_off·auto→false).
- **C4 ✅** UI: `MajorShareholderStockToggle` RadioCardGroup→`ToggleCard`(violet) + 라벨 "금융재산공제가 배제되는 최대주주 해당 여부" + ON 펼침 안내. `UnlistedStockV2Card` boolean handler·default false. `PerShareValuationResultCard` echo boolean화.
- **C5 ✅** `auto-judgment.ts`(71줄) + 테스트 2파일 삭제. 잔여 derive 참조 0 (lookup의 `raw.section22MajorShareholderMode`는 레거시 마이그레이션 읽기, 의도).
- **C6 ✅** typecheck 0 · 전체 `npm test` **5081 PASS·0 FAIL** · lint 0 · **e2e 3/3**(`e2e/inheritance-unlisted-section22-toggle.spec.ts` — 라벨·자동판정 제거·ON 안내).
- **AN-6 결과**: `asset-toggle-visibility` 부수효과 **moot** — `unlisted_stock` base `financialDeduction:"default"`이고 가시성 로직은 default로 올리기만 하므로 §22② ON/OFF 모두 "default" 유지(회귀 0). 단 §22② ON 시 일반 토글이 보여도 priority-0 가드가 override(폴리시 정합). 일반 토글 숨김은 폴리시 후속(필수 아님).

---

## 8. 리스크 / 주의

- **간접 계산 영향**: 엔진은 `netFinancialAssets` 숫자만 받으므로 토글이 공제를 *직접* 차감하진 않음. **제안값·표시(적격 목록·칩)** 가 토글에 반응하고, 사용자 [적용] 시 입력값→공제액 변동. PDF 작업처럼 완전 "출력 전용"은 아니지만 "직접 엔진 차감"도 아님 — anchor 대상은 `suggestNetFinancialAssets` 제안값(엔진 `calcFinancialDeduction`은 무변경). §3.5 disconnect 안내 필수.
- **우선순위 충돌**: §22② 가드를 `isFinancialAssetForDeduction`(사용자 명시)보다 **위**에 둘 것 — 법정 강제 배제. 순서 뒤바뀌면 사용자가 "포함" 체크 시 법 위반.
- **상장·V1 미적용**: 본 토글은 V2 비상장 한정. 상장주식 최대주주 배제는 후속(별도 토글 필요) — 범위 명시.
- **[[mirror-pattern]]**: 토글값은 단일 필드를 직접 read/write. `useEffect→store` 미러링 금지.
- **레거시 마이그레이션 정책**: §4-3 매핑을 normalize·Zod 양쪽에서 동일 적용(UI 통과↔validate 차단 모순 금지, [[feedback_validation_sync_8th_point]]).
