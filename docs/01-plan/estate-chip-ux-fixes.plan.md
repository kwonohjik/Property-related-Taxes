# 자산 카드 헤더 칩 UX 3건 수정 — 계획서

> 작성일: 2026-05-29 · 대상: 상속세 자산 카드(EstateItem) 헤더 칩
> 요청자 결정: (항목1) 모든 칩 체크 통일 / (항목3) financial 가업 칩 제거

## 0. 배경 — 요청 3건

| # | 요청 | 결정 |
|---|---|---|
| 1 | §22 칩(이미지2) 라벨을 "금융재산 공제"로 변경 + 체크(✓) 표시를 더 두껍게 | **§22 라벨만 텍스트 변경**, 체크(✓) 굵은 아이콘화는 **모든 적용 칩에 통일** |
| 2 | 협의분할 칩(이미지3) 클릭 시 협의분할 토글(이미지4)이 디폴트 ON으로 변경 | 그대로 구현 (명확) |
| 3 | 가업 §15⑤ 칩(이미지5) 클릭 → 패널(이미지6)이 열리나 그 다음 아무 반응 없는 버그 | **financial 자산에서 가업 §15⑤ 칩 제거** |

---

## 1. 현행 분석 (file:line 실측)

### 칩 렌더링 파이프라인
- 칩 데이터 도출: `components/calc/inheritance/estate-card/chip-config.ts` → `resolveChips()` (105–238)
- 칩 렌더: `components/calc/inheritance/estate-card/EstateItemHeaderChips.tsx` (33–94)
- 칩 클릭 핸들러 factory: `components/calc/inheritance/estate-card/handleChipClick.ts` → `createChipClickHandler()` (29–70)
- 인라인 펼침 패널: `components/calc/inheritance/estate-card/EstateChipInlineExpand.tsx` (60–130)
- 가시성 매트릭스: `lib/calc/asset-toggle-visibility.ts` → `MATRIX`(46–101) · `resolveAssetToggleVisibility()`(115–150)
- 호출처 2곳: `components/calc/PropertyValuationForm.tsx:171` · `components/calc/inheritance/EstateStockChipsHeader.tsx:80`

### 항목3 버그 근본 원인 (확정)
- 이미지1 자산 "예금·펀드·채권·공제금" = category **`financial`** (§22 ✓ emerald + 가업 칩 동시 노출이 `MATRIX.financial` 행과 정확히 일치).
- `MATRIX.financial.familyBusiness = "hidden_expandable"` (asset-toggle-visibility.ts:73) → `resolveChips`의 `visibility.familyBusiness !== "hidden_permanent"` 조건(chip-config.ts:201) 통과 → **가업 §15⑤ 칩 노출**.
- 칩 클릭 시 `EstateChipInlineExpand`가 `FamilyBusinessCategorySection` 렌더(EstateChipInlineExpand.tsx:124–126).
- 그러나 `FamilyBusinessCategorySection`은 **category가 `financial`/`cash`/`deposit`이면 `return null`** (FamilyBusinessCategorySection.tsx:60–67).
- ⇒ 패널 헤더 "가업상속 자산 분류 (§15⑤)"만 뜨고 본문 빈칸 = **칩 노출 조건 ↔ 섹션 렌더 가드 불일치**.
- `cash`/`deposit`은 `MATRIX`에서 `familyBusiness = "hidden_permanent"`(66·78)라 칩 자체가 미노출 → 버그 없음. **`financial` 단독 버그**.
- ⚠️ **[검토-C] 활성 우선 경로 잔존 위험**: `resolveAssetToggleVisibility`는 `item.familyBusinessCategory !== undefined`이면 **MATRIX를 무시하고 `familyBusiness = "default"`로 승격**(asset-toggle-visibility.ts:127–131). 따라서 `MATRIX.financial`만 `hidden_permanent`로 바꿔도, **이미 `familyBusinessCategory`가 설정된 financial 자산(레거시 데이터)** 은 활성 우선으로 칩이 재노출 → 빈 패널 버그 재현. asset-toggle-visibility.test.ts:121–124(cash+familyBusinessCategory→default), :101–104가 이 승격을 단언. ⇒ **`FamilyBusinessCategorySection` 가드는 "도달 불가"가 아니라 활성 우선 경로로 도달 가능**. MATRIX 한 줄 수정만으로는 불완전 → §2-5에서 보강.

### 항목1 현행
- §22 칩 라벨: `eligible ? "§22 ✓" : "§22 ✗"` (chip-config.ts:146).
- ✓/✗는 **라벨 문자열에 직접 포함**. 렌더는 `<span>{chip.label}</span>` 텍스트만 (EstateItemHeaderChips.tsx:80).
- ✓를 포함하는 다른 칩: heir-allocation `"협의분할 ✓"`(179) · farming `"영농 §16⑤ ✓"`(192) · family-business `"가업 §15⑤ ✓"`(204) · major-shareholder `"최대주주 §22② ✓"`(229).
- `aria-pressed`가 `chip.label.includes("✓")`로 결정됨 (EstateItemHeaderChips.tsx:53) → 라벨에서 ✓ 분리 시 **이 로직도 함께 수정 필요**.

### 항목2 현행
- heir-allocation 칩은 `isExpandable: true`(chip-config.ts:163·168·177) → `handleChipClick`의 마지막 분기(handleChipClick.ts:68)에서 **accordion 펼침만** 수행.
- 펼치면 `HeirAllocationToggleSection` 렌더(EstateChipInlineExpand.tsx:113–120). 토글은 `checked={!!item.heirAllocations}`(HeirAllocationToggleSection.tsx:53) → `heirAllocations === undefined`면 OFF.
- ON 전환 로직(HeirAllocationToggleSection.tsx:54–60): `firstHeir = heirs.find(h => h.relation !== "corporate")` 에게 전액(`effectiveValuation`) 할당. 자연인 없으면 `[]`.
- disabled 조건: `!hasDistributableHeir(heirs) || effectiveValuation === 0` (HeirAllocationToggleSection.tsx:41).

---

## 2. 수정 계획

### 항목 1 — 라벨 변경 + 체크 아이콘 통일

**2-1. `chip-config.ts`**
- `ChipState`에 체크 표시 필드 추가: `mark?: "on" | "off"`.
  - `"on"` → 굵은 Check 아이콘, `"off"` → 회색 X 아이콘, `undefined` → 아이콘 없음.
- 각 칩 라벨에서 `✓`/`✗` 문자열 제거하고 `mark`로 분리:
  - **section22**: `label: "금융재산 공제"`, `mark: eligible ? "on" : "off"` (§22 텍스트 제거 — 사용자 결정).
    - tooltip은 조문 추적 위해 "§22 금융재산공제 (상증령 §19①) …" 유지.
  - **heir-allocation**: 데이터 분기(179) `label: "협의분할"`, `mark: "on"`. "법정분할"·"협의분할 (미입력)"은 `mark` 없음(현행 유지).
  - **farming**: `label: "영농 §16⑤"`, `mark: item.farmingCategory ? "on" : undefined`.
  - **family-business**: `label: "가업 §15⑤"`, `mark: item.familyBusinessCategory ? "on" : undefined`.
  - **major-shareholder**: `label: "최대주주 §22②"`, `mark: isMajor ? "on" : undefined`.
  - **secured-claim-14**: 변경 없음(ON일 때만 노출, ✓ 미사용).

**2-2. `EstateItemHeaderChips.tsx`**
- `lucide-react`에서 `Check`, `X` import 추가.
- `<span>{chip.label}</span>` 뒤에 `chip.mark` 분기 렌더:
  - `"on"` → `<Check className="h-3 w-3" strokeWidth={3} aria-hidden />` (굵게).
  - `"off"` → `<X className="h-3 w-3" strokeWidth={2.5} aria-hidden />` (회색 tone은 칩 자체 gray로 이미 반영).
- `aria-pressed` 로직 수정: `chip.label.includes("✓")` → **`chip.mark === "on"`** (line 53).

> 주의: 라벨 텍스트 변경은 §22만. 나머지 칩은 조문번호 라벨 유지하고 ✓만 아이콘화 (사용자 "모든 칩 체크 통일").

### 항목 2 — 협의분할 칩 클릭 시 토글 디폴트 ON

**2-3. `handleChipClick.ts`** *(정정 — [검토-A]·[검토-B])*
- `CreateChipClickHandlerParams`에 추가:
  - `heirs?: Heir[]`
  - `effectiveValuation?: number` — **[검토-A] 핵심 정정**: 핸들러 내부 `computeEffectiveValuation(item)` 단독 사용 금지. 주식 카드는 평가액이 **평균가×주식수**로 별도 계산되어 prop으로 주입됨(EstateStockChipsHeader.tsx:38·113). `computeEffectiveValuation(item)`을 쓰면 주식 카드에서 **자동 ON 세팅 금액이 틀림**. EstateChipInlineExpand.tsx:117과 동일한 `effectiveValuation ?? computeEffectiveValuation(item)` fallback 패턴 사용.
  - `currentExpandedKey: ChipKey | null` — **[검토-B] 핵심 정정**: "펼치는 동작"인지 판정에 필요(아래).
- `heir-allocation` 전용 분기를 default 펼침 분기 **앞**에 추가:
  ```
  if (chip.key === "heir-allocation") {
    const willOpen = currentExpandedKey !== "heir-allocation"; // 펼치는 방향일 때만
    if (willOpen && item.heirAllocations === undefined && heirs) {
      const eff = effectiveValuation ?? computeEffectiveValuation(item);
      if (hasDistributableHeir(heirs) && eff > 0) {
        onUpdate({ ...item, heirAllocations: buildInitialHeirAllocations(heirs, eff) });
      }
    }
    setInlineExpandedKey(prev => prev === "heir-allocation" ? null : "heir-allocation");
    return;
  }
  ```
- **[검토-B] `willOpen` 판정이 필수인 이유**(이전 "단순화" 단정 철회): 사용자가 펼친 패널의 ToggleCard에서 직접 OFF로 끄면 `heirAllocations === undefined`이면서 **패널은 열린 상태**가 된다. 이때 칩을 다시 클릭하면 `heirAllocations === undefined` 가드를 통과해 ON 세팅하면서, `setInlineExpandedKey(prev===key?null:...)`는 패널을 **닫아버린다** → "데이터는 ON인데 화면은 닫힘" 모순. `willOpen`(펼치는 방향)일 때만 자동 ON 세팅하면 이 경로가 차단된다. ⇒ `currentExpandedKey` param 필수.
- ON 세팅 로직은 `HeirAllocationToggleSection.tsx:54–60`과 중복 → **공용 헬퍼 `buildInitialHeirAllocations(heirs, effectiveValuation)` 추출**(firstHeir 없으면 `[]` 반환) 후 양쪽 import (single-source). 위치: `HeirAllocationInput.tsx`(이미 `hasDistributableHeir` export 중)에 병치 권장.
- `computeEffectiveValuation`·`hasDistributableHeir` import를 `handleChipClick.ts`에 추가(`@/lib/calc/estate-item-valuation`·`./HeirAllocationInput` 경로).
- disabled(자연인 없음 / 평가액 0)이면 ON 세팅 생략하고 펼치기만 → 펼친 패널의 ToggleCard가 `disabled` + `disabledReason` 표시(현행 동작 유지).

**2-4. 호출처 2곳에 param 전달** *(정정 — [검토-A])*
- `PropertyValuationForm.tsx:170–173`: `createChipClickHandler({ item, onUpdate, setInlineExpandedKey, heirs, currentExpandedKey: inlineExpandedKey })`. `heirs`는 ItemEditor가 이미 받음(125·375). **effectiveValuation은 미전달** → 핸들러 fallback `computeEffectiveValuation(item)` 사용(부동산·예금은 이 값이 정답). ⚠️ `useMemo` 의존성에 `inlineExpandedKey` 추가 필요(현행 deps `[item, onUpdate]`에 누락 시 stale).
- `EstateStockChipsHeader.tsx:79–82`: 위 + `effectiveValuation`(prop, 38·51) + `currentExpandedKey: inlineExpandedKey` 전달. 마찬가지로 `useMemo` deps에 `inlineExpandedKey`·`effectiveValuation` 추가.

### 항목 3 — financial 가업 §15⑤ 칩 제거

**2-5. financial 가업 칩 제거 — 2단 방어** *(정정 — [검토-C])*

MATRIX 한 줄 수정만으로는 활성 우선 경로(레거시 `familyBusinessCategory` 보유 financial)에서 칩이 재노출되므로, **칩 도출 단계에서 카테고리 가드를 추가**해 칩↔섹션 렌더 가능 카테고리를 단일 진실로 묶는다.

(1) `lib/calc/asset-toggle-visibility.ts`
- `MATRIX.financial.familyBusiness`: `"hidden_expandable"` → **`"hidden_permanent"`** (line 73).
- 주석 갱신: `// §15⑤ 미해당 — 예금·펀드·채권은 가업용 사업자산 아님 (사업무관자산, 사용자 결정 2026-05-29)`.

(2) `FamilyBusinessCategorySection.tsx` — 렌더 불가 카테고리 집합 export
- 현재 인라인 가드(60–67)의 `["financial","cash","deposit"]`를 **상수 `FAMILY_BUSINESS_INELIGIBLE_CATEGORIES`로 추출·export**. 가드는 이 상수를 참조하도록 변경(동작 동일).

(3) `chip-config.ts` — 가업 칩 노출 조건에 카테고리 가드 AND (chip-config.ts:201)
- `if (visibility.familyBusiness !== "hidden_permanent" && !FAMILY_BUSINESS_INELIGIBLE_CATEGORIES.includes(item.category))`.
- 효과: 활성 우선(asset-toggle-visibility.ts:127–131)이 `familyBusiness`를 `default`로 승격해도, **렌더 불가 카테고리(financial/cash/deposit)는 칩 원천 차단** → 빈 패널 버그 완전 제거. cash/deposit의 동일 잠재 이슈도 함께 해소(single-source 정합).

- `countHiddenExpandable`(asset-toggle-visibility.ts:160) 영향: financial의 유일한 hidden_expandable이던 familyBusiness가 permanent로 → **financial 펼침 카운트 1→0**(⚙️ 펼침 링크 미노출). 의도된 결과.

---

## 3. 영향 범위 / 동기화 지점

- **엔진 변경 0건**: 순수 UI 상호작용 + 가시성 매트릭스. EstateItem 타입·결과 산식·API·Zod 무관 → 14 동기화 지점 중 ⑤(UI 위젯)·⑦(없음) 외 해당 없음.
- `useEffect → store` 미러링 없음 (onChange/onUpdate 직접 갱신) — [[feedback_useeffect_store_mirror_forbidden]] 준수.
- tone 정적 매핑 유지 — [[feedback_tailwind_static_tone_mapping]].

---

## 4. anchor 테스트 계획

**⚠️ 깨지는 기존 anchor (실측 — 반드시 동시 갱신)**

| 파일:line | 현재 단언 | 항목 | 갱신 |
|---|---|---|---|
| `asset-toggle-visibility.test.ts:57–60` | financial `familyBusiness: "hidden_expandable"` | 3 | `"hidden_permanent"` |
| `asset-toggle-visibility.test.ts:295` | financial → 펼침 카운트 `1` ("가업만") | 3 | `0` |
| `asset-toggle-visibility.test.ts:121–124` | financial+familyBusinessCategory → familyBusiness `default` 승격 | 3 | **유지**(resolver 활성 우선은 불변). 단 §2-5(3) 칩 가드로 칩은 미노출 — resolver 단위 테스트는 통과 |
| `estate-card-compaction.test.tsx:139` | `"§22 ✓"` | 1 | `label==="금융재산 공제"` + `mark==="on"` |
| `estate-card-compaction.test.tsx:150` | `"§22 ✗"` | 1 | `label==="금융재산 공제"` + `mark==="off"` |
| `estate-card-compaction.test.tsx:183` | `"협의분할 ✓"` | 1 | `label==="협의분할"` + `mark==="on"` |
| `estate-card-compaction.test.tsx:273` | `"최대주주 §22② ✓"` | 1 | `label==="최대주주 §22②"` + `mark==="on"` |
| `estate-card-compaction.test.tsx:286` | `"최대주주 §22②"` | 1 | **유지**(mark `undefined`) |
| `estate-card-compaction.test.tsx:173` | `"협의분할 (미입력)"` | 1 | **유지**(mark 없음) |
| `handle-chip-click.test.ts:156–169` | heir-allocation을 farming/family-business와 함께 "accordion만, onUpdate 0" 묶음 단언 | 2 | heir-allocation을 묶음에서 **분리** (heirs 미전달 시 onUpdate 0 유지되나 의미 분리). farming/family-business만 묶음 유지 |

**신규 anchor**

| 파일 | 추가 |
|---|---|
| `estate-card-compaction.test.tsx` | (a) financial 자산 `resolveChips`에 `family-business` 칩 **없음** (b) financial+`familyBusinessCategory` 설정(레거시)에도 `family-business` 칩 **없음** — [검토-C] 회귀 (c) farming/family-business/major-shareholder `mark` 검증 & 라벨 "✓"/"✗" 미포함 |
| `handle-chip-click.test.ts` | (a) heir-allocation 클릭(`currentExpandedKey: null`=펼침)+자연인 상속인+평가액>0 → `heirAllocations` firstHeir 전액 세팅 (b) `effectiveValuation` 명시 전달 시 그 값으로 세팅(주식 카드 — `computeEffectiveValuation`과 다른 값으로 검증) (c) disabled(자연인 0 / 평가액 0) → onUpdate 미호출, 펼침만 (d) `currentExpandedKey: "heir-allocation"`(닫는 방향) → 자동 세팅 안 함 — [검토-B] 회귀 (e) 이미 `heirAllocations` 정의됨 → 재세팅 안 함 |
| `EstateItemHeaderChips` 렌더(estate-card-compaction 통합 가능) | mark="on" → `Check`(strokeWidth 3) 렌더, "off" → `X` 렌더, undefined → 아이콘 없음. aria-pressed가 `mark==="on"`과 일치 |

---

## 5. 검증 게이트

- [ ] `npx tsc --noEmit` 0건 (ChipState.mark 추가, params.heirs 추가에 따른 호출처 전파)
- [ ] `npx vitest run __tests__/calc/asset-toggle-visibility.test.ts __tests__/inheritance/` 통과
- [ ] 전체 `npm test` 회귀 0 (공유 모듈 영향 — resolveChips는 주식 카드도 사용)
- [ ] 브라우저 E2E(`e2e/*.spec.ts`): financial 자산 카드에 가업 칩 미노출 / 협의분할 칩 클릭 → 토글 ON + 첫 상속인 전액 / §22 칩 라벨·굵은 체크 표시 — [[feedback_browser_verify_with_playwright]]
- [ ] `ui-engine-sync-checker` (read-only) — 엔진 변경 0이므로 형식 점검만

---

## 6. 작업 순서 (제안)

1. (항목3) `asset-toggle-visibility.ts` 한 줄 + 주석 + anchor 갱신 → 가장 저위험.
2. (항목1) `ChipState.mark` 추가 → `chip-config.ts` 라벨 분리 → `EstateItemHeaderChips.tsx` 아이콘 렌더 + aria-pressed 수정 → anchor.
3. (항목2) `buildInitialHeirAllocations` 헬퍼 추출 → `handleChipClick.ts` 분기 + params.heirs → 호출처 2곳 → anchor.
4. tsc → vitest 대상 → 전체 npm test → e2e.
