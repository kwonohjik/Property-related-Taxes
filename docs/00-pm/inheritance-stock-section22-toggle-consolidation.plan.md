# 주식 §22 금융재산공제 토글 정합 (이미지32 숨김 + F-1 상장·V1 §22② 토글)

작성일: 2026-05-27
담당: inheritance-gift-tax-senior(엔진) + inheritance-gift-tax-ui-senior(UI) 병렬 Plan
관련 메모리: `project_section22_major_shareholder_toggle.md`(F-1·F-2 후속 트랙) · `single-source-engine-helper` · `feedback_asset_toggle_visibility` · `mirror-pattern`

---

## 1. 배경 / 문제

같은 비상장주식 카드에 §22 관련 토글이 2개 노출되어 사용자 혼동:

| | 이미지32 `FinancialDeductionChip` (emerald) | 이미지31 `MajorShareholderStockToggle` (violet) |
|---|---|---|
| 필드 | `EstateItem.isFinancialAssetForDeduction` (직속) | `unlistedStockValuationV2.isSection22MajorShareholder` (V2 내부) |
| 의미 | 이 자산을 §22 대상에 **포함**할지 (전 카테고리 공용) | §22② 최대주주 보유주식 **법정 강제 배제** |
| 우선순위(resolver) | 1 (사용자 명시) | 0 (법정 강제) |
| 노출 범위 | 모든 자산 | 비상장 V2(정식평가)만 |

**법 논리** (사용자 확인): 주식은 상증령 §19①상 §22 금융재산 **기본 대상(eligible=true)**. §22②에 따라 **최대주주 보유분만 배제**. 따라서 주식에 일반 포함/제외 토글(이미지32)은 불필요·혼동 유발이며, 배제는 §22② **전용 토글로만** 판단해야 한다.

**사용자 결정**: **"모든 주식(상장·비상장 V1·V2)에서 이미지32를 숨기고, 상장·비상장 V1에도 §22② 최대주주 토글을 추가"** (= F-1 동시 구현).

법령: 상속세 및 증여세법 §22② · 시행령 §19① (KoreanLaw MCP 검증된 기존 인용 재사용. 신규 인용 없음).

---

## 0. 3-pass 검토 정정 + P1 실증 (2026-05-27)

본 계획은 작성 후 `feedback_11step_self_review_workflow`로 3회 검토했고, 핵심 리스크 P1을 **실증 anchor로 확인**(`feedback_numeric_impact_verify_before_bug_claim`)했다.

### P1 (실증 확정) — 비상장 §22 평가 누락 = 선재 버그

probe(`suggestNetFinancialAssets`에 실제 폼 형태 item 투입) 결과:

| 자산 | §22 suggest `value` | 토글 효과 |
|---|---|---|
| 비상장 V2 (marketValue 없음 = 실제 폼) | **0** | OFF=ON=0 무효과 |
| 비상장 V1 | **0** | 무효과 |
| 상장 (avg×shares) | **50,000,000** | 정상 |

원인: `getValuatedAmount`(suggest) + 결과뷰(`InheritanceTaxResultView:75-87`)가 `marketValue ?? appraisedValue ?? standardPrice ?? (상장 avg×shares) ?? 0`만 읽고 **비상장 nested(`unlistedStockData`/V2) 평가를 호출하지 않음**. 폼은 비상장 평가액을 marketValue에 영속하지 않고, build(`InheritanceTaxForm:254`)는 `resolveActiveUnlistedValuation`(strip만). `computeStockValuation`(listed/V1/V2 모두 평가)은 **호출처 0 死 코드**.

⇒ **기존 머지된 V2 §22② 토글조차 비상장에서 numeric 무효과**. AN-2가 `marketValue` 수동세팅으로 갭 은폐.
⇒ **결정: 선재 버그(비상장 §22 평가 연동)를 Phase 0로 먼저 수정 후 F-1** (사용자 2026-05-27).

### 검토 정정 12건 요약

| 분류 | 정정 |
|---|---|
| 오류(R-3) | `resolveFinancialEligibility`는 **client 전용**(엔진 미참조). Zod strip의 실제 영향은 "이력 round-trip 유실·일관성"이지 계산오류 아님 |
| 오류(S-2·S-3) | §22 반영은 client suggest→**[적용]**→netFinancialAssets. e2e는 [적용] 클릭 또는 사이드바 suggest 값 변화로 검증 |
| 모순(N-2) | 결과뷰=raw items / 엔진=strip-map items — §22 표시·엔진 기준 불일치 (Phase 0에서 함께 정합) |
| 모순(N-4) | initial 값 = 엔진plan undefined vs UIplan false 충돌 → **factory=normalize=UI 3중 일치**(`store_default_vs_ui_display_fallback`)로 통일: UI `?? false` + factory undefined 허용, normalize 무변환 |
| 누락(#4) | §22 상속 전용 — `EstateCommonAttributesSection`이 gift 시 null 반환으로 자동 게이팅(명시) |
| 누락(#6) | stale `isFinancialAssetForDeduction`(주식): 숨김 후 되돌릴 UI 없음 → 주식 카테고리는 §22② 토글만 사용, 마이그레이션 시 stock의 명시값 클리어 검토 |
| 검증완료(N-3) | visibility 소비처 = PropertyValuationForm·EstateCommonAttributesSection + 테스트 2 뿐 → D-2 깨짐 범위 한정 |
| 검증완료(N-6) | `resolveActiveUnlistedValuation`는 `...rest` spread → 신규 직속 필드 보존(strip 안 함) |
| 정리(N-5) | `computeStockValuation` 死 코드 → Phase 0에서 lib 이동·재활용 |

### D-0. Phase 0 설계 — 비상장 §22 평가 단일 진실화

- `computeStockValuation`(현 `StockValuationForm.tsx`, listed=avg×shares · unlisted V1=calcUnlistedStockPerShareValue · V2=evaluateUnlistedStockV2)을 **`lib/calc/`로 이동**(레이어링: lib가 component import 금지 → 역방향으로 이동). StockValuationForm은 이동된 함수 import.
- `getValuatedAmount`(suggest) + 결과뷰 인라인 합산이 주식 카테고리일 때 **이동된 단일 함수 호출**(`single-source-engine-helper`). marketValue useEffect 미러링 금지(`mirror-pattern`) — 영속이 아니라 derive.
- 결과뷰는 raw items 그대로 받되 동일 평가 함수 사용 → N-2 정합.
- 검증 anchor: 비상장 V2·V1이 §22 suggest에 평가액 반영(>0), 최대주주 OFF→포함·ON→제외 차이 발생.

## 2. 설계 결정 (미결 사항 확정)

### D-1. §22② 필드 = EstateItem 직속 신규 필드 (additive, 방안 나)

`EstateItem.isSection22MajorShareholder?: boolean` **신규 직속 필드** 추가. 상장·비상장 V1·V2 공용.
- 비상장 V2의 기존 `unlistedStockValuationV2.isSection22MajorShareholder`는 **유지**(V2 카드·Zod·storage·e2e 무변경, 회귀 0).
- `resolveFinancialEligibility` 우선순위 0 가드가 **직속 필드 OR V2 nested 필드**를 함께 검사.
- 근거: V2 데이터 마이그레이션·손실 위험 0, resolver 수정 최소, V2 UI 무변경. (방안 가=직속 통일+마이그레이션은 회귀 위험 ↑ → 기각)

### D-2. 이미지32 숨김 = resolver 카테고리 법령 override

`resolveAssetToggleVisibility`에서 **활성 우선 블록(line 126-135) 이후**에 카테고리 기반 강제 hidden 추가:
```ts
// 법령 override: 주식 §22 일반 토글 비노출. 배제는 §22② 전용 토글로만 판단(법 §22②).
// eligible 결과(resolveFinancialEligibility)는 보존 — "토글 UI 표시"만 숨긴다.
if (item.category === "listed_stock" || item.category === "unlisted_stock") {
  base.financialDeduction = "hidden_permanent";
}
```
- 활성 우선보다 뒤에 배치해야 승격을 덮어쓴다 (주식은 기본 eligible=true라 line 133이 default로 올리므로).
- `hidden_permanent` 선택: 펼침(`hidden_expandable`)에도 안 뜨게. `countHiddenExpandable`은 hidden_expandable만 세므로 **자동 제외**(별도 수정 불필요).

### D-3. F-1 토글 UI 배치 = EstateCommonAttributesSection (상장·V1), V2는 skip

`EstateCommonAttributesSection`(상장 227·비상장 389 공용 렌더)에서 §22② 토글을 조건부 렌더:
- 렌더: `category === "listed_stock"` **또는** (`category === "unlisted_stock"` **AND** simple 모드)
- skip: 비상장 formal(V2) — `UnlistedStockV2Card` 내부 토글이 이미 담당 (중복 방지)
- 컴포넌트 재사용: `MajorShareholderStockToggle` (직전 정리로 문구가 이미 주식 종류 무관 — "최대주주에 해당"/"§22② 최대주주 보유주식"). 추가 일반화 불필요.
- 바인딩: 직속 `item.isSection22MajorShareholder` ↔ `onUpdate({ ...item, isSection22MajorShareholder: v })`.

### D-4. 모드 판정 단일 헬퍼 export (single-source)

`resolveDisplayMode(item)`는 현재 `StockValuationForm` 내부 비export. EstateCommonAttributesSection에서 모드 분기에 필요 → **공유 위치로 export**(또는 기존 `lib/calc/unlisted-stock-valuation-lookup.ts`의 `resolveActiveUnlistedValuation` 재사용). EstateCommonAttributesSection 내 모드 재정의 금지.

### D-5. 결과 카드 echo 배지 (⑦) = 선택 후속

엔진 result에 §22 최대주주 배제 echo 필드가 현재 없음. 핵심 범위 아님 → **본 작업 범위 외(선택 후속)**. §22 공제 금액 변화는 기존 결과뷰가 자동 반영.

---

## 3. 변경 지점 — 엔진/타입/검증

| # | 파일 | 변경 |
|---|---|---|
| E-1 | `lib/tax-engine/types/inheritance-gift.types.ts` | `EstateItem`에 `isSection22MajorShareholder?: boolean` 추가 (line 127 `isFinancialAssetForDeduction` 아래). 주석에 §22②·V2 nested OR 호환 명시 |
| E-2 | `lib/calc/financial-deduction-resolver.ts:58` | 우선순위 0 가드 OR 확장: `item.isSection22MajorShareholder === true \|\| item.unlistedStockValuationV2?.isSection22MajorShareholder === true` |
| E-3 | `lib/calc/asset-toggle-visibility.ts` | D-2 블록 추가 (return 직전, 활성 우선 이후) |
| E-4 | `lib/validators/property-valuation-input.ts:95` | `baseItemSchema`에 `isSection22MajorShareholder: z.boolean().optional()` 추가 → 모든 `*ItemSchema.extend()` 자동 상속 |

정수연산·금액 산식 변경 없음(boolean 필드 + 가시성 분기만).

---

## 4. 변경 지점 — UI

| # | 파일 | 변경 |
|---|---|---|
| U-1 | `components/calc/StockValuationForm.tsx` | `resolveDisplayMode` export (D-4) |
| U-2 | `components/calc/inheritance/EstateCommonAttributesSection.tsx` | §22② 토글 조건부 렌더(D-3) — 상장·V1 simple. import `MajorShareholderStockToggle` + 모드 헬퍼 |
| U-3 | `EstateItem` factory/normalize | `isSection22MajorShareholder` optional pass-through (②③) — 기본 undefined, 별도 초기값 불필요 |
| (U-4) | 결과뷰 echo 배지 | D-5 — 범위 외(선택) |

이미지32 숨김은 **E-3(resolver)만으로 자동 달성** — UI 분기 추가 없음(가시성 신호 추종). PropertyValuationForm은 주식 estateItems 없어 무영향.

---

## 5. 14 동기화 지점 점검

| 지점 | 처리 | 비고 |
|---|---|---|
| ① 폼 상태 타입 | E-1 | EstateItem 직속 |
| ② initial | U-3 | optional → undefined |
| ③ normalize | U-3 | pass-through |
| ④ API 변환 | 자동 | EstateItem 배열 통째 전달 |
| ⑤ UI 위젯 | U-2 | EstateCommonAttributesSection |
| ⑥ 사이드바 합계 | 자동 | §22 공제 = 엔진 결과 기반 |
| ⑦ 결과 카드 | D-5 선택 | §22 금액 변화는 자동 반영 |
| ⑧ validation | E-4 | optional boolean, 차단 규칙 없음 → UI 통과↔validate 모순 없음 |
| ⑨⑩ Zod enum | 자동 | baseItemSchema 상속 |
| ⑪ acqDate fallback | N/A | |
| ⑫ Zod 입력객체 | E-4 | **grep 자가점검**: route parse 시 strip 안 되는지 |
| ⑬ body spread | 자동 | **grep 자가점검**: estateItems 명시 매핑 시 누락 여부 |
| ⑭ route 엔진 매핑 | 자동 | EstateItem 배열 통째 |

⑫⑬⑭는 TS 미감지 → `isSection22MajorShareholder` grep 전수 점검 필수.

---

## 6. Anchor / 테스트 매트릭스

### 신규 `__tests__/lib/calc/section22-stock-toggle-f1.test.ts`

| ID | 입력 | 기대 | 근거 |
|---|---|---|---|
| F1-1 | 상장 직속 `isSection22MajorShareholder=true` | `resolveFinancialEligibility` = false | §22② (a)직속 |
| F1-2 | 비상장 V1 직속 true | false | §22② (a)직속 |
| F1-3 | 비상장 V2 nested true + 직속 undefined | false | §22② (b)V2 호환 |
| F1-4 | 직속 true + V2 nested false | false | OR 우선 |
| F1-5 | 상장 직속 false/undefined | true | §19① 기본 eligible 보존 |
| F1-6 | 비상장 V1 직속 false/undefined | true | §19① |
| F1-7 | 상장 `resolveAssetToggleVisibility.financialDeduction` | `"hidden_permanent"` | D-2 |
| F1-8 | 비상장(V1·V2) 동상 | `"hidden_permanent"` | D-2 |
| F1-9 | 상장 최대주주 ON → `suggestNetFinancialAssets` | 제외 | §22② |
| F1-10 | 비상장 V1 최대주주 ON → suggest | 제외 | §22② |
| F1-11 | 직속 true + `isFinancialAssetForDeduction=true` | false (0>1) | 우선순위 |

### 기존 anchor 갱신

| 파일 | 변경 |
|---|---|
| `section22-major-shareholder-exclusion.test.ts`(AN-6) | listed/unlisted financialDeduction 기대값 `"default"` → `"hidden_permanent"` (법령 정합 — `anchor_correction_legal_priority`) |
| `__tests__/calc/asset-toggle-visibility.test.ts` | listed_stock·unlisted_stock 매트릭스 기대값 동일 갱신 |

### e2e

| ID | 파일 | 시나리오 |
|---|---|---|
| S-1 | `inheritance-stock-financial-chip-absent.spec.ts` | 상장·V1·V2 모든 주식 카드에서 이미지32(FinancialDeductionChip) **부재** |
| S-2 | `inheritance-listed-stock-section22-toggle.spec.ts` | 상장 카드 §22② 토글 표시 + OFF 기본 + ON 시 §22 제외 |
| S-3 | `inheritance-unlisted-v1-section22-toggle.spec.ts` | 비상장 V1(간편) §22② 토글 표시 + ON/OFF |
| S-4 | 기존 `inheritance-unlisted-section22-toggle.spec.ts` | V2: 토글 카드 내부 1개만, EstateCommonAttributesSection 중복 부재 확인 |

e2e는 `data-testid` 기반 권장(문구 변경 내성). OFF도 violet tone 유지 확인.

---

## 7. 실행 순서 (Do — 단계별·시퀀셜)

### Phase 0 — 선재 버그: 비상장 §22 평가 연동 (D-0) **[차단 게이트]**

1. **Pre-Do anchor (RED 우선)**: 비상장 V2·V1 실제 폼 형태(marketValue 없음) item → `suggestNetFinancialAssets.value > 0` 기대 = 현재 RED(=0). 이 RED 확보로 버그 실증.
2. `computeStockValuation`을 `lib/calc/stock-valuation.ts`(신규)로 이동, StockValuationForm import 전환(회귀 0).
3. `getValuatedAmount`(inheritance-deduction-suggest) + 결과뷰 인라인 합산이 주식 카테고리 시 이동 함수 호출.
4. anchor GREEN: 비상장 suggest 평가액 반영 + 최대주주 OFF/ON 차이. 기존 AN-2(수동 marketValue)도 유지 통과.
5. **회귀 주의**: 비상장이 §22 suggest에 처음 반영되므로 기존 종합 케이스 expected 값 영향 가능 → `npm test`로 전수 확인, 영향 시 anchor 법령 정합 갱신.

### Phase 1 — 이미지32 숨김

6. E-3 `resolveAssetToggleVisibility` 주식 hidden_permanent(D-2). AN-6·asset-toggle-visibility.test 기대값 갱신. e2e S-1.

### Phase 2 — F-1 상장·V1 §22② 토글

7. **Pre-Do anchor**: F1-1(상장 배제)·F1-9(상장 ON→suggest 제외, Phase 0 후 numeric 유효) RED 확인.
8. **엔진**: E-1 타입 → E-2 resolver OR → E-4 Zod. F1-1~11 GREEN.
9. **UI**: U-1 `resolveDisplayMode` export → U-2 EstateCommonAttributesSection 조건부 토글(상장·V1 simple, V2 skip) → U-3 initial/normalize(N-4 3중 일치). ⑫⑬⑭ grep.

### Check / 회귀

10. `ui-engine-sync-checker` + `npx tsc --noEmit` 0 + `npx vitest run __tests__/tax-engine/inheritance-tax/ __tests__/lib/calc/ __tests__/calc/` + e2e S-1~4([적용] 경로 포함).
11. **전체 회귀** `npm test` (공유 모듈·Phase 0 종합 케이스 영향).
12. **사전 정리**: 미커밋 상태인 라벨 정리(`MajorShareholderStockToggle.tsx`+e2e, 이전 세션) 커밋 여부 결정 후 착수.

---

## 8. 리스크 / 주의

- **R-1 활성 우선 override 순서**: D-2 블록은 반드시 line 133-135 **이후**. 앞에 두면 활성 우선이 다시 default로 승격 → 숨김 실패.
- **R-2 V2 이중 노출**: D-3 skip 조건(formal일 때 EstateCommonAttributesSection 미렌더) 누락 시 V2 카드에 토글 2개. e2e S-4로 가드.
- **R-3 ⑫⑬⑭ silent strip**: 직속 필드가 route Zod에서 strip되면 엔진 미도달(TS 미감지). grep + S-2 ON 시 §22 금액 변화로 실증.
- **R-4 기존 저장 데이터**: 직속 필드 optional → 기존 IndexedDB 로드 시 undefined, V2 nested 경로가 정상 처리. 마이그레이션 불필요.
- **R-5 상장 최대주주 과다공제 차단**: F-1 전에는 상장 최대주주를 배제할 UI가 없었음(이미지32로만 가능했고 그조차 숨기면 위험) → F-1이 이 공백을 메움. S-2가 핵심 검증.

---

## 9. 변경 파일·800줄 점검

| 파일 | 예상 | 현행 | 정책 |
|---|---|---|---|
| inheritance-gift.types.ts | +8 | — | OK |
| financial-deduction-resolver.ts | +4 | 130 | OK |
| asset-toggle-visibility.ts | +6 | 160 | OK |
| property-valuation-input.ts | +3 | ~360 | OK |
| StockValuationForm.tsx | +2(export) | 확인 | OK |
| EstateCommonAttributesSection.tsx | +15 | 확인 | OK |
| 신규 anchor + e2e 3종 | 신규 | — | OK |

모두 800줄 이하 유지.
