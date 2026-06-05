# 간주상속재산(보험금·신탁·퇴직금) 토글 노출 정합화 (Plan)

> 작성 2026-06-05 · 세목: 상속세 · 조문: 상증법 §8·§9·§10(간주상속재산) · §22·시행령 §19①(금융재산)
> 대상 파일: `lib/calc/asset-toggle-visibility.ts` `resolveAssetToggleVisibility` (deemedCategory 분기) + anchor `__tests__/calc/asset-toggle-visibility.test.ts`
> 선행: `docs/00-pm/asset-toggle-visibility-precision.plan.md` (base 카테고리 정밀화 + chip-config 시맨틱 정정 `===default`). 본 계획은 **deemedCategory 오버레이 정합화** — H2 드리프트(지난번 D-3 보류분) 해소.
> 정책 참조: [[feedback_korean_law_citation_verify]] · [[feedback_engine_comment_vs_impl_drift]] · [[feedback_ui_engine_dual_truth_avoidance]] · [[feedback_numeric_impact_verify_before_bug_claim]]
> **인터뷰 확정 (2026-06-05)**: ① 신탁 비-금전 금융공제 → hidden_expandable · ② 보험금 영농·가업 → hidden_permanent(base 무관) · ③ 퇴직금 금융공제 → hidden_permanent(자명 확정).

---

## 0. 요약 (TL;DR)

간주상속재산 분류(§8 보험금 / §9 신탁 / §10 퇴직금)의 금융공제 §22 토글 칩 노출이 **eligibility 판정과 어긋나는 2개 버그**를 정합화한다.

- **버그 1 (신탁)**: `resolveAssetToggleVisibility:122`의 신탁 override가 **trustType 무시**하고 `financialDeduction="default"` 무조건 설정 → 부동산신탁·증권신탁·유형미선택에도 금융공제 칩 default 오노출. §19①은 **금전신탁만** §22 대상.
- **버그 2 (퇴직금)**: retirement에 financialDeduction override 부재 → **financial base** 선택 시 칩 default 오노출. §19① 퇴직금 미열거(§22 미대상).
- **정밀화 (보험금)**: §8 보험금은 금전수령권 → 영농·가업 자산 불가. base="other"일 때 영농·가업이 추가옵션에 잔존 → hidden_permanent로 강제.
- **근본**: eligibility 함수(`isFinancialAssetEligible`)는 이미 법적 정확(보험금 true·금전신탁만 true·퇴직금 false)인데, **visibility resolver가 이와 dual-truth**. resolver를 eligibility에 정합([[feedback_ui_engine_dual_truth_avoidance]]).
- **엔진·세액 무영향**: 노출 정책만 변경. eligibility·계산 불변.
- **회귀 0**: 활성 우선(`farmingCategory`·`isFinancialAssetForDeduction` 명시)은 deemed 분기 후 적용되어 보호.

---

## 1. 법령 근거 (KoreanLaw MCP — §19① 2026-06-05 직접 조회)

> §19① "대통령령으로 정하는 금융재산" = **금융회사등이 취급하는** 예금·…·신탁재산(**금전신탁재산에 한한다**)·**보험금**·공제금·주식·채권·… 금전 및 유가증권.

| 분류 | §22 금융재산 여부 | 영농·가업 |
|---|---|---|
| §8 보험금 | **○** (§19① "보험금" 명시) | ✗ (금전수령권) |
| §9 신탁 | **금전신탁만 ○** (§19① 단서) — 부동산·증권신탁 ✗ | base 의존(신탁 농지 등 edge) |
| §10 퇴직금 | **✗** (§19① 미열거) | ✗ (금전수령권) |

deemed→허용 base (`lib/calc/deemed-category-policy.ts:41-46`, 실측): insurance=`[cash,financial,other]` · trust=전체 · retirement=`[cash,financial]`.

---

## 2. 현행 진단 (실측)

### 2-1. eligibility는 정확 (`inheritance-tax-financial-eligibility.ts:95-106`)

insurance→true · trust→`trustType==="cash_trust"` · retirement→false. **법령 정합 완료**.

### 2-2. visibility resolver는 eligibility와 dual-truth (`asset-toggle-visibility.ts:115-150`)

```
base = MATRIX[category]
if (deemedCategory==="trust") base.financialDeduction="default"   // ❌ trustType 미검사 (버그1)
if (farmingCategory) base.farming="default"
if (familyBusinessCategory) base.familyBusiness="default"
if (resolveFinancialEligibility(item)) base.financialDeduction="default"
if (deemedCategory==="retirement") base.deemedRetirementOption="visible"   // ❌ financialDeduction 미처리 (버그2)
if (stock) base.financialDeduction="hidden_permanent"
```

| 분류 | base | 현행 금융공제 칩(=default 시 노출, §3-1 후) | 판정 |
|---|---|---|---|
| insurance | cash/financial/other | eligibility=true→default → 노출 | ✓ (단 other-base 영농·가업 추가옵션 잔존 → 정밀화) |
| trust+cash_trust | 전체 | :122→default → 노출 | ✓ |
| trust+real_estate/security/undefined | 전체 | :122→default → **노출** | ❌ 버그1 (§22 미대상) |
| retirement+cash | cash | matrix hidden_permanent → 미노출 | ✓ |
| retirement+financial | financial | matrix default → **노출** | ❌ 버그2 (§22 미대상) |

---

## 3. 변경 설계 — resolver deemed 분기 명시화

`resolveAssetToggleVisibility`에서 base 직후, 활성 우선 **이전**에 deemed 분기 추가:

```ts
const base = { ...MATRIX[item.category] };

// deemed override (§19① 정합) — 활성 우선 이전
if (item.deemedCategory === "insurance") {
  // §8 보험금: 금전수령권 → 영농·가업 불가 (금융공제는 active-priority eligibility=true가 default 승격)
  base.farming = "hidden_permanent";
  base.familyBusiness = "hidden_permanent";
} else if (item.deemedCategory === "trust") {
  // §9 신탁: 금전신탁만 §22. 비금전·미선택은 추가옵션(D-1)
  base.financialDeduction = item.trustType === "cash_trust" ? "default" : "hidden_expandable";
} else if (item.deemedCategory === "retirement") {
  // §10 퇴직금: §19① 미열거 → 금융공제 완전 미대상
  base.financialDeduction = "hidden_permanent";
  base.deemedRetirementOption = "visible";
}

// 활성 우선 (deemed 분기 후 — 명시 override·활성 토글 보호)
if (item.farmingCategory !== undefined) base.farming = "default";
if (item.familyBusinessCategory !== undefined) base.familyBusiness = "default";
if (resolveFinancialEligibility(item)) base.financialDeduction = "default";
if (item.deemedCategory === "retirement") base.deemedRetirementOption = "visible"; // (이미 위에서 처리 — 중복 제거 가능)
if (stock) base.financialDeduction = "hidden_permanent";
```

**기존 무조건 trust override(`:122`) 제거** → trustType-aware 분기로 대체.

**정합 검증** (deemed 분기 → 활성 우선 순서):
- insurance: farming/familyBusiness=permanent; `resolveFinancialEligibility(insurance)=true` → financial=default. ✓ 금융공제 노출·영농가업 숨김.
- trust+cash_trust: financial=default; eligibility=true → 유지 default. ✓
- trust+비금전: financial=hidden_expandable; eligibility=false → 유지 hidden_expandable. ✓ 칩 숨김·추가옵션 접근.
- retirement: financial=hidden_permanent; eligibility=false → 유지. ✓ 미노출. deemedRetirementOption=visible. ✓

---

## 4. 결정 사항 (확정)

| # | 항목 | 결정 |
|---|---|---|
| D-1 | 신탁 비-금전 금융공제 | ✅ hidden_expandable (cash_trust만 default) |
| D-2 | 보험금 영농·가업 (base 무관) | ✅ hidden_permanent 강제 |
| D-3 | 퇴직금 금융공제 | ✅ hidden_permanent |

---

## 5. Touch Point

| 지점 | 위치 | 변경 |
|---|---|---|
| 엔진/적격 | `inheritance-tax-financial-eligibility.ts` | **무변경** (이미 정합 — 단일 진실) |
| resolver | `asset-toggle-visibility.ts:115-150` | deemed 분기 명시화(§3) + 무조건 trust override 제거 |
| chip-config | `chip-config.ts` | **무변경** (§3-1 `===default` 시맨틱 그대로 소비) |
| DeemedCategorySection | — | **무변경** (retirementOptionVisibility 결과 소비) |
| anchor | `__tests__/calc/asset-toggle-visibility.test.ts` | §6 |

---

## 6. Anchor 갱신 (실측 위치 — buggy lock 정정)

기존 테스트가 버그 동작을 lock → 법령 정합값으로 정정:

| 라인 | 케이스 | 변경 전 | 변경 후 |
|---|---|---|---|
| `:163` | cash+trust+trustType=undefined | financialDeduction `default` | **`hidden_expandable`** |
| `:175` | apartment+trust+real_estate | financialDeduction `default` | **`hidden_expandable`** |
| `:194` | apartment+trust(undefined) | financialDeduction `default` | **`hidden_expandable`** |
| `:327` | AT-P1 land+trust(undefined) | financialDeduction `default` | **`hidden_expandable`** (H2 드리프트 정정 — "현행 lock" 폐기) |
| `:169` `:181` | trust+cash_trust | `default` | **유지** ✓ |
| `:207` | insurance financialDeduction | `default` | **유지** ✓ + farming/familyBusiness `hidden_permanent` 단정 추가 |
| `:213` `:234` | retirement (land/cash) | hidden_permanent | **유지** ✓ (명시 분기로 동일 결과) |

신규 anchor:
- DC-1: retirement + **financial** base → financialDeduction `hidden_permanent` (버그2 정정 — 기존 default였음)
- DC-2: insurance + **other** base → farming·familyBusiness `hidden_permanent` (버그/정밀화 — 기존 hidden_expandable)
- DC-3: trust + **security** → financialDeduction `hidden_expandable`
- DC-4: trust+real_estate + `isFinancialAssetForDeduction=true` 명시 → financialDeduction `default` (활성 우선 보호 — 회귀 0)
- DC-5: insurance + farmingCategory 설정(legacy) → farming `default` (활성 우선 보호)

---

## 7. 케이스 인벤토리

| # | 분류+base | 금융공제 칩 | 영농·가업 칩 | 비고 |
|---|---|---|---|---|
| C-1 | 보험금 + financial | 노출(default) | 미노출 | §22 ○ |
| C-2 | 보험금 + other | **노출(default)** — eligibility=true 활성 승격 | **미노출(permanent)** | §8 보험금=§19① 금융재산이므로 base 무관 금융공제 노출. D-2는 영농·가업만 강제 숨김 (계획 정정 2026-06-05) |
| C-3 | 신탁 + 금전신탁 | 노출(default) | base 의존 | §22 ○ |
| C-4 | 신탁 + 부동산/증권/미선택 | **미노출(추가옵션)** | base 의존 | D-1 — 버그1 정정 |
| C-5 | 신탁 + 비금전 + 금융 명시 ON | 노출(활성 우선) | — | 회귀 0 (DC-4) |
| C-6 | 퇴직금 + cash | 미노출 | 미노출 | ✓ |
| C-7 | 퇴직금 + financial | **미노출(permanent)** | 미노출 | D-3 — 버그2 정정 |
| C-8 | 퇴직금 (전 base) | — | — | deemedRetirementOption visible |

---

## 8. 작업 순서 / 완료 게이트

1. resolver deemed 분기 명시화(§3) — 무조건 trust override 제거.
2. anchor §6 갱신(:163/175/194/327) + DC-1~DC-5 신규.
3. Check: `npx tsc --noEmit` 0 · `npx vitest run __tests__/calc/asset-toggle-visibility.test.ts` GREEN · 전체 회귀 0 · 브라우저 E2E(보험금→금융공제 노출·영농가업 없음 / 신탁 부동산→금융공제 칩 없음 / 퇴직금 financial→금융공제 칩 없음).
4. Act: 디자인 환류 + [[feedback_engine_comment_vs_impl_drift]] H2 드리프트 해소 기록.

**완료 게이트**: C-1~C-8 + DC-1~DC-5 + 갱신 anchor GREEN · 세액 회귀 0 · 브라우저 확인.

---

## 9. 리스크

- **R-1 buggy lock 정정 광범위**: 기존 trust 테스트 4건이 버그를 lock → 정정. CC/DC로 법령 정합 재확인.
- **R-2 dual-truth 재발**: resolver와 eligibility 따로 변경 시 재드리프트. → resolver가 가능한 한 eligibility(`resolveFinancialEligibility`) 결과를 활성 우선으로 재사용, deemed 분기는 영농·가업·trust 칩만 보정.
- **R-3 활성 override 차단**: deemed 분기가 명시 토글을 덮을 우려. → 활성 우선을 deemed 분기 후 배치(DC-4·DC-5 lock).
- **R-4 세액 변동 오해**: eligibility 무변경, 노출만. 세액 anchor 회귀 0.
