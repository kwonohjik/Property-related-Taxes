# 상속세 §74 지정문화유산 등 징수유예 — UI 설계

> 계획서: `docs/00-pm/inheritance-cultural-heritage-tax-deferral.plan.md` · 엔진 설계: `inheritance-cultural-heritage-tax-deferral.engine.design.md`
> 상속 진입점: `components/calc/InheritanceTaxForm.tsx` (자산 카드 = `components/calc/inheritance/estate-card/`, 폼 = `inheritance/shared.ts`)

## Context

§74 징수유예 입력은 현재 **전무**. 문화유산은 **자산-수준(EstateItem) 식별**이므로 자산 카드 고급 옵션에 토글을 추가한다(별도 Step 신설 아님). 결과는 별도 `CulturalHeritageDeferralCard`(산출세액×비율 산식) + **별지9호 ㉖**(0 하드코딩 → result 연결) + **㊳**(납부세액 = 결정세액 − 징수유예) + 사이드바 3단(결정세액/징수유예액/납부세액).

증여세는 §74 무관(상속 전용) — 본 설계는 **상속만**.

---

## 14개 동기화 지점 (상속 — 자산-수준 입력)

| # | 지점 | 위치 (실측) | 작업 |
|---|---|---|---|
| ① | 폼 상태 | `types/inheritance-gift.types.ts` `EstateItem`(:81~) | `culturalHeritageType?` (엔진 타입 — FormState `EstateItem[]` 자동 반영, `shared.ts` 직접 변경 없음) |
| ② | initial | EstateItem optional | undefined 기본 — 카드 생성 시 별도 설정 불요 |
| ③ | normalize | — | optional no-op (sessionStorage 역직렬화 시 undefined 유지=OFF) |
| ④ | API 변환 | `inheritance-api.ts:71` `estateItems: input.estateItems` 통째 | **자동** (⑫ 선행 필수) |
| ⑤ | UI 위젯 | `estate-card/EstateItemAdvancedPanel.tsx` (자산 카드 고급 옵션) | `CulturalHeritageSection` 신규 (§입력 위젯) |
| ⑥ | 사이드바 | `InheritanceSidebar.tsx` | 결정세액/징수유예액/납부세액 **3단**(결과 의존, 0원 미표시) |
| ⑦ | 결과 카드 | `InheritanceTaxResultView` + `filing-form-9-data.ts:120·144` | `CulturalHeritageDeferralCard` + 별지9호 ㉖·㊳ |
| ⑧ | validation | `inheritance-validate.ts` | 미선택=미적용(에러 아님) — 별도 규칙 불요 |
| ⑨⑩⑪ | — | — | 해당 없음 (discriminatedUnion 감면 아님·acqDate fallback 무관) |
| **⑫** | **Zod 입력객체** | `property-valuation-input.ts:283` `estateItemSchema` **discriminatedUnion** (base 공통 :55~148, "baseItemSchema 상속" :81) | **base 스키마 `})`(:148) 직전**에 `culturalHeritageType: z.enum(["heritage_data","museum","designated","natural_monument"]).optional()` (farmingCategory:85 패턴) → 전 variant 자동 전파 ⚠️ TS 미감지 — 누락 시 silent strip |
| ⑬ | api.ts body | `inheritance-api.ts:71` estateItems 통째 | **자동** |
| ⑭ | route 매핑 | `route.ts:72` `estateItems: parsedData.estateItems` 통째 | **자동** (⑫ 통과 전제) |

⚠️ **⑫가 유일한 명시 추가 지점** — discriminatedUnion이므로 모든 variant 공유 base에 추가. 자가점검: `culturalHeritageType` grep이 Zod 1곳 + 엔진 타입 1곳 등장(⑬⑭ estateItems 통째라 자동, [[feedback_explicit_prop_mapping_strip]]).

---

## 입력 위젯 설계 (⑤) — `CulturalHeritageSection`

**위치** `components/calc/inheritance/CulturalHeritageSection.tsx` 신설. 자산 카드 고급 옵션 패널(`EstateItemAdvancedPanel.tsx`, 실측 존재)에 노출 — `resolveAssetToggleVisibility("culturalHeritage", category)`(`lib/calc/asset-toggle-visibility.ts:129`)에 `culturalHeritage` 규칙 추가하여 `farmingCategory` 등 기존 토글과 **동일 메커니즘**으로 표시(정확한 마운트 지점은 Do에서 `EstateItemAdvancedPanel` 내부 구조 확인). tone `emerald`(평가·확정 정보).

```
┌ 지정문화유산 등 (§74 징수유예 대상) ─────────── (tone: emerald) ┐
│ 문화재보호법·자연유산법 지정 재산 — 상속세 징수가 유예됩니다.        │
│ ▸ ToggleCard (OFF 기본, emerald tone 유지)                       │
│   ON 시:                                                         │
│   ┌ RadioCardGroup "§74① 해당 호" (stack, emerald) ┐            │
│   │ ○ 1호 — 문화유산자료등                                       │
│   │      문화유산자료·국가등록문화유산·보호구역 토지              │
│   │ ○ 2호 — 박물관자료등                                         │
│   │      박물관·미술관 전시·보존 중인 재산                        │
│   │ ○ 3호 — 국가지정문화유산등         (담보 면제 가능)           │
│   │ ○ 4호 — 천연기념물등               (담보 면제 가능)           │
│   └────────────────────────────────────────────────┘            │
│   [3호·4호 선택 시] ┌ sky 배너 ┐                                 │
│   │ 3·4호 재산은 담보 제공이 면제될 수 있습니다(상증법 §74⑤).      │
│   └────────────────┘                                            │
└────────────────────────────────────────────────────────────────┘
```

- **visibility**(`resolveAssetToggleVisibility`, AssetCategory 8종 실측):
  - `real_estate_land`·`real_estate_building` → `default`(노출 — 한옥·건물·보호구역 토지)
  - `real_estate_apartment`·`other` → `hidden_expandable`(아파트 문화유산·동산 골동품 드묾)
  - `real_estate_apartment` 외 부동산 없는 `listed_stock`·`unlisted_stock`·`cash`·`financial`·`deposit` → `hidden_permanent`(§74 대상 아님)
- 토글: `checked={!!item.culturalHeritageType}`, OFF 시 `culturalHeritageType: undefined`. 단순 optional(3-state 아님). OFF에도 emerald tone 유지([[feedback_ui_toggle_auto_visibility_policy]]).
- enum 값 = 엔진 타입과 1:1: `heritage_data`·`museum`·`designated`·`natural_monument`([[enum-verification-before-mapping]]).
- 4개호 라디오 = `RadioCardGroup`(native 금지). 담보 배너는 입력 아님(FormState 무변경).
- onChange 단방향(`onUpdate` 콜백) — useEffect store 미러링 금지([[mirror-pattern]]).

---

## 결과 카드 설계 (⑦)

### `CulturalHeritageDeferralCard` (신규, `components/calc/results/inheritance/`)
`(result.culturalHeritageDeferredTax ?? 0) > 0` 시 PrintSection 추가. `INHERITANCE_PRINT_SECTIONS`에 `{ id: "cultural-heritage-deferral", label: "징수유예 (§74)" }`.

산식 한국어 풀어쓰기([[feedback_result_view_korean_formula]], 변수약어·floor 금지):
```
상속세 산출세액   [값]
× 문화유산 등 재산가액  [값]
÷ 상속재산가액    [값]   (§13 가산증여 포함)
= 징수유예세액    [값]   (별지9호 ㉖)
───────────────────────────────
결정세액         [값]
− 징수유예세액    [값]
= 납부할세액      [값]   (별지9호 ㊳)
```
- §74② 사후관리 배너(amber): "징수유예 재산을 유상양도·인출 시 즉시 징수됩니다(상증법 §74②)".
- 자산별 내역 표(`culturalHeritageDeferralDetail.items`): 자산명/호/재산가액/담보면제 — 자산명은 `assetNameById` Map(내부 id 노출 금지 [[feedback_no_internal_id_in_result]]).
- 금액 `text-right font-mono tabular-nums`, "원" 접미사 금지([[feedback_no_won_suffix]]).

### 신고서 연동 (별지9호)
- **㉖**: `filing-form-9-data.ts:120` `"㉖": 0` → `"㉖": b26` (`const b26 = result.culturalHeritageDeferredTax ?? 0`) + `:144` `amtRow("㉖", b26, "left")`.
- **㊳**: `:116` `const b43 = result.finalTax` → **`const b43 = result.finalTax − b26`**(양식 공식 `㉔+㉕−㉖−㉗+...` + 재결례 940708 "유예 공제 후 부과" 정합, CHD-12).
- `FF9_LAW_REFS["㉖"] = "상증법 §74"` 추가(`filing-form-9-constants.ts`).
- `amtRow` `display` 조건(`amount > 0`)이 0원 시 "—" 자동 처리(`:75`) — 추가 작업 없음.

---

## 사이드바 (⑥) — 3단 분리

`result.culturalHeritageDeferredTax > 0` 시 결과 도착 후:
```
결정세액        [finalTax]
징수유예액 (§74)  − [culturalHeritageDeferredTax]   (0원 미표시)
납부할세액       [finalTax − 징수유예액]            (별지9호 ㊳ 동일)
```
기존 단일 "자진납부세액(finalTax)" 라벨이 부정확 → 결정세액/납부세액 구분([[feedback_pdca_session_efficiency]] 사이드바=계산 가능 항목만, 결과 의존값은 도착 후).

---

## Validation (⑧)

- `culturalHeritageType` 선택은 자산 식별 — 미선택=미적용(에러 아님). 별도 validate 코드 불요.
- 음수 가액은 기존 EstateItem 평가 validation에서 차단(신규 필드는 enum이라 무관).
- UI 통과 ↔ validate 차단 모순 없음([[feedback_validation_sync_8th_point]]).

---

## E2E 시나리오 (`e2e/inheritance-cultural-heritage-deferral.spec.ts`)

패턴: `e2e/inheritance-foreign-tax-credit.spec.ts`([[feedback_browser_verify_with_playwright]]).
1. 재산(부동산 1건 20억 중 1건 5억 = 3호 지정) + 상속인 입력 → 자산 카드 ToggleCard ON → "3호 국가지정문화유산등" 선택 → 담보 면제 배너 표시 확인.
2. 계산 → `CulturalHeritageDeferralCard`: 산출세액×(5억÷20억)=징수유예세액, 결정세액−징수유예=납부세액.
3. 별지9호 ㉖ = 징수유예세액, ㊳ = 결정세액 − ㉖ 확인.
4. 사이드바 3단(결정세액/징수유예액/납부세액) 노출 확인.

---

## 동기화 지점 점검

| 지점 | 작업 |
|---|---|
| ① FormData | EstateItem.culturalHeritageType (엔진 타입 자동) |
| ② initial | undefined |
| ③ normalize | N/A |
| ④ API 변환 | inheritance-api.ts estateItems 통째(자동) |
| ⑤ UI 위젯 | CulturalHeritageSection (자산 카드, emerald) |
| ⑥ 사이드바 | 3단(결정/유예/납부) |
| ⑦ 결과 | CulturalHeritageDeferralCard + ㉖·㊳ |
| ⑧ validation | 미선택=미적용(불요) |
| ⑫ Zod | discriminatedUnion base enum ⚠️ |

**800줄 정책**: `CulturalHeritageSection.tsx`·`CulturalHeritageDeferralCard.tsx` 신설로 기존 파일 증분 최소. `EstateItemAdvancedPanel`·`InheritanceTaxResultView`·`filing-form-9-data.ts` 800 이내. (단 `types/inheritance-gift.types.ts` 1319줄·`property-valuation-input.ts` 806줄은 기존 초과 — 별도 분리 권고.)

---

## Do 환류 (구현 갭 — 2026-06-05)

- **visibility**: `resolveAssetToggleVisibility`(4-dimension 고정 MATRIX) 통합 대신 **별도 `resolveCulturalHeritageVisibility(item)` 헬퍼** 신설(`asset-toggle-visibility.ts`) — 동일 `ToggleVisibility` 타입 재사용, MATRIX 9행 미변경(회귀 0).
- **마운트**: `EstateItemAdvancedPanel`(⚙️ 고급 옵션)에 `chVisibility !== "hidden_permanent"` 시 렌더. default(부동산)도 ⚙️ 안 — 영농/가업 default 인라인과 다름. **발견성 후속 개선 여지**(본체 인라인 승격).
- **RadioCardGroup**: `name` **필수**·`label` prop 없음 → `name={cultural-heritage-${item.id}}`, "§74① 해당 호" 라벨은 별도 `<p>`.
- **사이드바**: ④ 자진납부세액(결정세액) 유지 + 징수유예 시 "징수유예액(§74)"·"납부할세액" 2행 추가(`result` 직접 접근, computeInheritanceSummary 미변경).
- **회귀**: 전체 **6582 PASS**. tsc 0건.
