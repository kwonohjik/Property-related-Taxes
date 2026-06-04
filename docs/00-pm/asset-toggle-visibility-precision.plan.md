# 자산 카드 토글 자동 노출 정밀화 (Plan)

> 작성 2026-06-05 · 세목: 상속세 · 조문: 상증법 §22·시행령 §19① / §18의3·§16⑤ / §18의2·§15⑤
> 대상 파일: `components/calc/inheritance/estate-card/chip-config.ts`(resolveChips) + `lib/calc/asset-toggle-visibility.ts`(MATRIX) + `components/calc/inheritance/AssetToggleHints.tsx`(deposit 힌트)
> 선행 작업: `docs/00-pm/asset-toggle-auto-visibility.plan.md` (2026-05-22, 9×4 매트릭스 최초 구축) — 본 계획서는 그 **시맨틱·매트릭스 정밀화**.
> 정책 참조: [[feedback_korean_law_citation_verify]] · [[feedback_ui_toggle_auto_visibility_policy]] · [[feedback_numeric_impact_verify_before_bug_claim]] · [[feedback_engine_comment_vs_impl_drift]] · [[project_asset_toggle_visibility_plan]]
> **사용자 인터뷰 (2026-06-05)**: ① 부동산 3종 금융공제 → 완전 숨김(hidden_permanent) · ② 전세보증금채권 금융공제 → **자가검토 후 hidden_expandable로 확정(D-1, override 보존)** · ③ 기타재산 영농·가업 → 펼침(hidden_expandable).
> **자가 검토 결정 확정 (2026-06-05)**: D-1 = hidden_expandable · D-2 = 부수 효과(아파트 가업·기타 금융 칩 → 추가옵션) 수용.

---

## 0. 요약 (TL;DR)

자산 카드 상단 **칩 행**(이미지 5·6)의 토글 칩(금융재산공제 §22 · 영농 §16⑤ · 가업 §15⑤) 자동 노출을 법령·UX 기준으로 정밀화한다.

- **현행 문제**: 부동산에 "금융재산 공제" 칩이 칩 행에 노출(§22 법적 불가, 이미지 6), 기타재산(현금성)에 영농·가업 칩이 칩 행에 노출(노이즈, 이미지 5).
- **근본 원인 (자가 검토 발견 §3-0)**: 칩 행 렌더(`resolveChips`)가 `visibility !== "hidden_permanent"` 조건이라 **`hidden_expandable` 칩도 칩 행에 표시된다** (이미지 6의 아파트 "가업 §15⑤"가 `hidden_expandable`인데 표시되는 것이 증거). 즉 `hidden_expandable`은 현재 "칩 행 노출 + 추가옵션 패널 중복"이며, "펼쳐야 보임" 시맨틱이 미구현 상태.
- **변경**: ① **시맨틱 정정** — `resolveChips`를 `=== "default"`로 바꿔 `hidden_expandable` 칩을 **칩 행에서 제외**(추가옵션 패널로만 접근). ② **MATRIX 강등** — (a) 부동산 3종 금융공제 → `hidden_permanent`, (b) 전세보증금 금융공제 → `hidden_expandable`(해석례 override 보존, D-1), (c) 기타재산 영농·가업 → `hidden_expandable`.
- **엔진·세액 무영향**: 노출은 **UI 표시 정책**일 뿐, 공제 적격 판정·세액 계산 불변.
- **회귀 0 보장**: `resolveAssetToggleVisibility`의 **활성 우선**(켠 토글·적격 자산 default 승격)·**신탁 §9 override**가 매트릭스 강등 후 적용 → 활성/신탁 케이스 보호.

---

## 1. 법령 근거 (KoreanLaw MCP 검증)

### §22 금융재산상속공제 — 시행령 §19① (mst 283637, 2026-06-05 직접 조회)

> ① "대통령령으로 정하는 금융재산"이란 **금융회사등이 취급하는** 예금·적금·부금·계금·출자금·신탁재산(**금전신탁재산에 한한다**)·보험금·공제금·주식·채권·수익증권·출자지분·어음등의 **금전 및 유가증권** + 재정경제부령으로 정하는 것.

- "금융회사등이 취급하는" 한정 → **부동산·현금·사인간 직접채권**은 금융재산 불가.
- 신탁재산은 **금전신탁(cash_trust)만** → 부동산신탁도 trustType 의존.

### 카테고리 매핑 확정 (실측 — `CategoryChangeDialog.tsx:38-39`)

- `financial` = "예금·펀드·채권·공제금" (§19① 열거 → 금융재산 ✓)
- `deposit` = "전세보증금 반환채권 (상속세 전용)" → **사인간 직접채권**, §19① 금융회사 취급 미해당. 단 `AssetToggleHints.tsx:75`가 **"해석례 따라 사용자 override 가능"** 명시 (해석 여지 존재 → D-1).

### §16⑤ 라·마목(어선·어업권·양식업권) / §15⑤ (선행 계획서 2026-05-22 검증 인용)

- "기타 재산(other)"으로 분류될 수 있어 영농·가업 입력 경로는 **유지 필요** → `hidden_permanent`(완전 차단) 부적합, `hidden_expandable`(추가옵션 접근) 적정.

---

## 2. 현행 구현 진단

### 2-1. 렌더 모델 — 3개 표면 (실측 확인, 정밀화의 핵심)

| 표면 | 위치 | visibility 소비 조건 | 역할 |
|---|---|---|---|
| **칩 행** | `chip-config.ts` `resolveChips` (`:146` section22 · `:199` farming · `:216` familyBusiness) → `EstateItemHeaderChips.tsx:44` | **`!== "hidden_permanent"`** (← 정정 대상) | 이미지 5·6의 상단 칩 행 |
| **본문 항상-노출 섹션** | `EstateCommonAttributesSection.tsx:163/168/176` | `=== "default"` | 카드 펼침 본문의 전체 입력 섹션 |
| **"추가 옵션 (N개)" 패널** | `EstateItemAdvancedPanel.tsx:70-73, 111-146` | `=== "hidden_expandable"` | 기어 옵션 내 펼침 (영농·가업·금융 입력) |

- 칩 행 **"옵션 (N)" 배지** = `countNonDefaultOptions`(`chip-config.ts:263`) = **활성 설정 수**(deemedCategory·금융override·heirAllocations·farmingCategory·familyBusinessCategory·저당). `countHiddenExpandable`(`asset-toggle-visibility.ts:160`)와 **별개** — 후자는 "추가 옵션 (N개)" 텍스트(`EstateItemAdvancedPanel.tsx:121`)용.
- **현 시맨틱 결함**: `hidden_expandable` 항목이 칩 행(✓ 표시)과 추가옵션 패널(✓)에 **중복 노출**. "펼쳐야 보임" 미구현.

### 2-2. MATRIX 현행 (`lib/calc/asset-toggle-visibility.ts:46-101`)

| 카테고리 | financialDeduction | farming/familyBusiness | 진단 |
|---|---|---|---|
| real_estate_land (`:50`) | hidden_expandable | default/default | §22 불가 → **(a) hidden_permanent** |
| real_estate_building (`:56`) | hidden_expandable | default/default | **(a) hidden_permanent** |
| real_estate_apartment (`:62`) | hidden_expandable | hidden_permanent / hidden_expandable | **(a) hidden_permanent** (가업은 별도 유지) |
| deposit (`:80`) | hidden_expandable | hidden_permanent/hidden_permanent | 사인간 채권 → **(b) hidden_expandable 유지**(해석례, D-1) |
| other (`:96-98`) | hidden_expandable | default/default | 현금성 노이즈 → **(c) 영농·가업 hidden_expandable** |
| cash/financial/stock | (정밀) | (정밀) | 무변경 |

**resolver 분기 순서**(`:115-150`): ① base=MATRIX → ② 신탁 override(deemedCategory==="trust" → financial=default; ⚠️ **trustType 미검사** — 본문/주석 drift, §3-0 H2) → ③ 활성 우선 → ④ 주식 override. 강등(①)은 ②③④ 전이라 보호됨.

---

## 3. 변경 설계

### 3-0. 자가 검토 발견 (Critical — 메커니즘 정정)

- **H5**: MATRIX 값을 `default→hidden_expandable`로만 바꿔선 **칩 행에서 안 숨겨진다**(`resolveChips`가 `!== hidden_permanent`). → **chip-config 시맨틱 정정 필수**(§3-1).
- **H1+H3**: deposit를 `hidden_permanent`로 하면 §75 해석례 override 경로가 사라진다. 시맨틱 정정(§3-1) 후엔 `hidden_expandable`만으로 칩이 숨겨지고 **추가옵션에서 override 가능** → `hidden_expandable`이 우월. (인터뷰 ②는 "칩이 안 숨겨지던 시점" 기준이라 hidden_permanent를 골랐음. → **D-1 재확인**.)

### 3-1. chip-config 시맨틱 정정 (Critical)

`components/calc/inheritance/estate-card/chip-config.ts` `resolveChips`:
- `:146` (section22), `:199` (farming), `:216` (familyBusiness): **`!== "hidden_permanent"` → `=== "default"`**.
- 효과: `hidden_expandable` 칩은 **칩 행에서 제외**되고 "추가 옵션 (N개)" 패널로만 접근. `default`만 칩 행 노출. `hidden_permanent`는 완전 차단(불변).
- **시맨틱 통일**: default=칩 행 / hidden_expandable=추가옵션 / hidden_permanent=완전 숨김.

### 3-2. MATRIX 강등

```ts
// (a) 부동산 3종 — financialDeduction → hidden_permanent (§19① 미열거, 해석례 없음 → override 불요)
real_estate_land/building/apartment: { ..., financialDeduction: "hidden_permanent" }

// (b) deposit(전세보증금 반환채권) — financialDeduction: hidden_expandable 유지 (D-1)
//   시맨틱 정정(§3-1)으로 칩 행에서 제외됨 + 추가옵션에서 §75 해석례 override 보존
deposit: { ..., financialDeduction: "hidden_expandable" }   // = 현행 유지 (칩만 §3-1로 숨겨짐)

// (c) 기타 재산 — farming·familyBusiness: default → hidden_expandable
other: { farming: "hidden_expandable", familyBusiness: "hidden_expandable", financialDeduction: "hidden_expandable", deemedRetirementOption: "visible" }
```

### 3-3. 부수 영향 (시맨틱 정정 ripple — 의도된 정밀화)

§3-1 적용 시 기존 `hidden_expandable` 칩이 칩 행에서 제외됨:
- **아파트 "가업 §15⑤"**(familyBusiness=hidden_expandable) → 칩 행에서 제외 → 추가옵션. (이미지 6 노이즈 추가 해소 — 사용자 미요청이나 일관)
- **기타재산 "금융재산 공제"**(financialDeduction=hidden_expandable) → 칩 행에서 제외 → 추가옵션. (이미지 5)

→ **D-2 확인**: 이 부수 해소를 수용할지(권장: 수용 — "더 정밀하게" 부합).

---

## 4. 결정 필요 사항

| # | 항목 | 결정 | 비고 |
|---|---|---|---|
| D-1 | deposit 금융공제 | ✅ **hidden_expandable** (확정) | §3-1 정정으로 칩 숨김 + §75 해석례 override 보존 |
| D-2 | §3-1 시맨틱 정정의 부수 해소(아파트 가업·기타 금융 칩 → 추가옵션) | ✅ **수용** (확정) | 일관된 정밀화 |
| (D-3) | trust override trustType 미검사(H2) | 본 작업 범위 외 — 관찰 기록 | [[feedback_engine_comment_vs_impl_drift]] 후속 |

---

## 5. Touch Point

| # | 지점 | 위치 | 변경 |
|---|---|---|---|
| 엔진/적격 | — | `inheritance-tax.ts` · `financial-deduction-resolver.ts` | **무변경** (세액·eligible 불변) |
| ① 칩 시맨틱 | `chip-config.ts` `resolveChips:146/199/216` | `!== "hidden_permanent"` → `=== "default"` (§3-1) |
| ② MATRIX | `asset-toggle-visibility.ts:46-101` | (a)(b)(c) (§3-2) + 주석 §19①·인터뷰일 갱신 |
| ③ deposit 힌트 | `AssetToggleHints.tsx:75` | D-1=hidden_expandable이면 "override 가능" 유지(추가옵션에서 유효). D-1=permanent이면 힌트 제거(dead) |
| ④ anchor | `__tests__/calc/asset-toggle-visibility.test.ts` + chip-config 테스트 | §6 |
| UI 렌더 | `EstateItemHeaderChips` · `EstateItemAdvancedPanel` · `EstateCommonAttributesSection` | **무변경** (resolver·resolveChips 결과 소비만) |

---

## 6. Anchor 갱신 (실측 위치)

### 6-1. MATRIX 단위 — `__tests__/calc/asset-toggle-visibility.test.ts`

| 라인 | 카테고리 | 변경 |
|---|---|---|
| `:42` real_estate_land | financialDeduction `hidden_expandable` → `hidden_permanent` |
| `:46` real_estate_building | financialDeduction → `hidden_permanent` |
| `:50` real_estate_apartment | financialDeduction → `hidden_permanent` |
| `:74` other | farming/familyBusiness `default` → `hidden_expandable` |
| `:84` deposit | (D-1=hidden_expandable이면 financialDeduction **무변경** — 현행 유지) |

회귀 보호 anchor (활성/override 보존):
- AT-P1: 부동산 + `deemedCategory="trust"` → financialDeduction `default` (신탁 override; ⚠️ trustType 무관 — 현행 동작 그대로 lock, H2)
- AT-P2: 부동산 + `isFinancialAssetForDeduction=true` → financialDeduction `default` (활성 우선)
- AT-P3: other + `farmingCategory` 설정 → farming `default` (활성 우선)

### 6-2. chip-config 단위 (신규 — §3-1 시맨틱)

> **기존 테스트 영향 검증 (실측)**: `__tests__/inheritance/estate-card-compaction.test.tsx`의 `resolveChips` 단위 테스트(`:118-205`)는 `financial`(default)·`cash`(hidden_permanent)만 단정 → §3-1(`===default`) 변경에 **무영향**(financial 칩 유지·cash 미노출 그대로). `hidden_expandable` 칩 거동은 **기존 미테스트 공백**이었음 → 아래 CC가 이를 메움. **기존 anchor 갱신 불요**.

- CC-1: `hidden_expandable` farming/familyBusiness/section22 → `resolveChips` 결과에 **칩 미포함** (other 영농·가업, 아파트 가업, 기타 금융)
- CC-2: `default` → 칩 포함 (land/building 영농·가업; financial 금융공제 칩 — 기존 :134 회귀)
- CC-3: 활성(farmingCategory 설정) → default 승격 → 칩 포함 (어선 edge)
- CC-4: 추가옵션 패널(`EstateItemAdvancedPanel.hiddenItems`)에 hidden_expandable 포함 — 접근 경로 보존

---

## 7. 케이스 인벤토리

| # | 자산 | 토글 | 기대 (시맨틱 정정 후) |
|---|---|---|---|
| C-1 | 토지/건물/아파트 (미활성) | 금융공제 | 칩 행·본문·추가옵션 **전부 미노출** (hidden_permanent) |
| C-2 | 부동산 + 금전신탁(§9) | 금융공제 | default 노출 (override) |
| C-3 | 부동산 + 금융공제 명시 ON | 금융공제 | default 노출 (활성 우선) |
| C-4 | 전세보증금 반환채권 (미활성) | 금융공제 | 칩 행 미노출, **추가옵션에서 접근 가능**(해석례 override) |
| C-5 | 기타 재산 (현금성) | 영농·가업 | 칩 행 미노출, **추가옵션에서 접근** |
| C-6 | 기타 재산 + 어업(farmingCategory) | 영농 | default 승격 → 칩 행 노출 (활성 우선) |
| C-7 | 아파트 | 가업 | 칩 행 미노출 → 추가옵션 (D-2 부수 해소) |
| C-8 | 현금·예금·펀드·주식 | 전 토글 | 현행 유지 |

---

## 8. 작업 순서 / 완료 게이트

1. (D-1·D-2 확정 후) chip-config `resolveChips` 시맨틱 정정(§3-1).
2. MATRIX 강등(§3-2) + 주석 + deposit 힌트(§5③).
3. anchor §6-1·6-2 갱신·신규.
4. Check: `npx tsc --noEmit` 0 · `npx vitest run __tests__/calc/asset-toggle-visibility.test.ts __tests__/inheritance/estate-card-compaction.test.tsx __tests__/inheritance/handle-chip-click.test.ts` GREEN · 전체 회귀 0 · 브라우저 E2E(부동산 금융공제 칩 없음 / 기타재산 영농·가업 칩 없음·추가옵션 존재 / 어업 활성 시 노출).
5. Act: 디자인 환류 + 선행 계획서 정밀화 이력.

**완료 게이트**: C-1~C-8 + AT-P1~P3 + CC-1~CC-4 GREEN · 세액 회귀 0 · 브라우저 확인.

---

## 9. 리스크

- **R-1 시맨틱 정정 광범위 영향**: `resolveChips ===default`가 모든 hidden_expandable 칩에 영향. → CC-1~CC-4로 전수 lock, D-2로 수용 확인.
- **R-2 deposit override 상실**: hidden_permanent 선택 시 §75 해석례 경로 소거. → D-1로 hidden_expandable 권장(칩 숨김+override 보존).
- **R-3 어선 edge 차단**: 기타재산 영농을 hidden_permanent로 하면 어업권 입력 불가. → hidden_expandable + 활성 우선(AT-P3·C-6)으로 보존.
- **R-4 세액 변동 오해**: 노출 정책이 적격 판정을 바꾼다는 오해. → eligible 함수 무변경, 세액 anchor 회귀 0.
- **R-5 count 혼동(H7)**: "옵션(N)"=활성수(countNonDefaultOptions), "추가 옵션(N개)"=hidden_expandable수. 두 카운트 출처 분리 유지.
