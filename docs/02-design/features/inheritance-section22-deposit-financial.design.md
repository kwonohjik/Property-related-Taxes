# §22 deposit(전세보증금 반환채권) 적격 정합 + 영농 §16⑤ 염전 문구 (PR2) — 설계

> 상위 계획: `docs/00-pm/inheritance-remaining-credit-deduction-gaps.plan.md` §5 (그룹 ④, 권장 PR 2순위)
> 단계: Design · 도메인: 상속세 §22 금융재산공제 / §16⑤ 영농상속재산
> KoreanLaw 검증: 상증령 §19①·§16⑤1호 사목 전문 대조 완료 (계획서 §7-2)

## Context

자산토글 후속 4건(계획서 §5) 중 PR2 범위. **코드 검증 결과 2건이 이미 정확/구현됨**:

| 항목 | 검증 결과 | 본 PR |
|---|---|---|
| 4-a deposit default | `financial-deduction-resolver.ts:30` `CATEGORY_DEFAULT.deposit=true` — **법령 부정합** (정정 대상) | ✅ 핵심 |
| 4-b §19① 공제금 | (PR6로 분리 — 카테고리 결정) | 범위 외 |
| 4-c §16⑤ 염전 | `steps.tsx:361` 영농상속재산 hint "농지·목장·어선 등"에 염전 누락 | ✅ 문구 |
| 4-d §15⑤2호 나목 단서 배지 | **이미 구현됨** `AssetToggleHints.tsx:57` ("임직원 5년 무상임대 국민주택/6억 이하 사업용 인정") | ❌ stale — 조치 불요 |

또한 4-a 안내 문구도 **이미 정확**(`AssetToggleHints.tsx:74~76` §19① 금융회사 취급 한정 명시). 남은 것은 **default 적격 값**뿐.

## 4-a 법령 분석 (핵심)

- `EstateItem.category="deposit"` = **전세보증금 반환채권**(임차인 피상속인이 임대인에 대해 가진 채권 — `inheritance-gift.types.ts:58`, `property-valuation.ts:220` "임차인이 임대인에게 맡긴 전세보증금").
- §22 금융재산공제 대상 = §19① "**금융회사등이 취급하는** 예금·적금·…·공제금·주식·채권·… 등의 금전 및 유가증권".
- 전세보증금 반환채권은 **임대인(사인)에 대한 채권** → 금융회사 취급 금융재산 **미해당** → §22 default false가 정합.
- 채무 측 정합: `types.ts:103` "leaseDeposit(임대보증금)은 §19④ 금융회사 채무 아니므로 §22 차감 항상 제외" — 자산 측도 동일 논리(§19① 금융회사 취급 아님)로 false 일관.

### 현재 모순 (4-a가 동시에 바로잡는 것)

- `asset-toggle-visibility.ts:80` 매트릭스는 deposit `financialDeduction: "hidden_expandable"`로 **정정됨**(자산토글 PR).
- 그러나 `resolveAssetToggleVisibility:133` `if (resolveFinancialEligibility(item)) base.financialDeduction = "default"`가 **`CATEGORY_DEFAULT.deposit=true` 때문에 다시 default로 승격** → 매트릭스 정정이 무력화.
- `CATEGORY_DEFAULT.deposit` 제거 시: `resolveFinancialEligibility(deposit, 명시값 없음)=false` → 승격 미발동 → 매트릭스 `hidden_expandable` 유지 + §22 순금융재산 자동도출에서 제외. **가시성·numeric 동시 정합**.

## ★ 케이스 인벤토리

| # | 케이스 | 입력 | resolveFinancialEligibility | 토글 가시성 | §22 순금융재산 |
|---|---|---|---|---|---|
| D-1 | deposit, 명시값 없음 | `category=deposit`, `isFinancialAssetForDeduction=undefined` | **false** (정정 후) | financialDeduction `hidden_expandable` | 제외 |
| D-2 | deposit, 사용자 ON | `isFinancialAssetForDeduction=true` | true (명시 우선) | `default` | 포함 (사용자 override) |
| D-3 | deposit, 사용자 OFF | `isFinancialAssetForDeduction=false` | false | `hidden_expandable` | 제외 (기존 동일) |
| D-4 | financial(예금) | 명시값 없음 | true (불변) | `default` | 포함 (불변) |
| D-5 | 펼침 카운트 deposit | D-1 | — | farming/familyBusiness hidden_perm + financialDeduction hidden_expandable | **카운트 1** (기존 0) |
| C-1 | 영농 §23 hint | steps.tsx:361 | — | "농지·목장·어선·염전 등" | — (문구) |

## 엔진 변경

`lib/calc/financial-deduction-resolver.ts` — `CATEGORY_DEFAULT`에서 `deposit: true` **제거**(키 삭제 → `?? false` 적용). `resolveFinancialEligibility`·`getCategoryDefaultEligibility`는 동일 상수 참조하므로 자동 일관. 주석을 "§19① 금융회사 취급 한정 — 전세보증금 반환채권 미열거 → default 제외, 사용자 명시 ON만 포함"으로 정정.

## anchor (재산정 — `feedback_anchor_correction_legal_priority`)

기존 2건은 **현재 법령 부정합 동작을 고정**한 anchor → 법령 정합값으로 재산정:
- `asset-toggle-visibility.test.ts:80` deposit `financialDeduction: "default"` → **`"hidden_expandable"`**. describe/주석의 "활성 우선 발동" → "명시값 없으면 §19① 미열거로 hidden_expandable".
- `asset-toggle-visibility.test.ts:260` deposit 펼침 카운트 `0` → **`1`**.
- line 8·77~ 주석 갱신.

신규 anchor (`financial-deduction-resolver.test.ts`):
- DEP-1: `resolveFinancialEligibility({category:"deposit"})` === false (명시값 없음).
- DEP-2: `resolveFinancialEligibility({category:"deposit", isFinancialAssetForDeduction:true})` === true (override 보존).
- DEP-3: `getCategoryDefaultEligibility({category:"deposit"})` === false.

회귀: comprehensive-case-pdf F-03 불변(deposit EstateItem 없음+netFinancialAssets 직접입력 — 영향 없음 실증). 전체 회귀 0.

## UI 변경 (4-c)

`components/calc/inheritance/steps.tsx:361` 영농상속재산(§23) hint: `"농지·목장·어선 등 — 최대 30억"` → `"농지·초지·산림지·어선·어업권·농어업용 건축물·염전 등(§16⑤) — 최대 30억"` (염전=§16⑤1호 사목 반영). 표시 전용·numeric 무영향.

## 동기화 지점

- 4-a: 엔진 resolver 단일 변경 → ⑤ 토글 가시성(자동 반영, resolveAssetToggleVisibility 재사용)·⑥ §22 순금융재산 자동도출·⑦ 결과(금융재산공제). 신규 입력 필드 없음 → ①②③④⑧⑫⑬⑭ 변경 없음.
- ⚠️ **(디자인 검토 H-1)** `getCategoryDefaultEligibility(deposit)`도 false로 바뀌므로 asset-toggle **"기본 적용/기본 제외" 배지** 표시가 deposit에서 "기본 제외"로 전환됨(같은 `CATEGORY_DEFAULT` 참조 — 자동 일관). 이는 의도된 정합(§19① 미열거 = 기본 제외). 배지 관련 anchor가 있으면 함께 재산정.
- 4-c: hint 문구만 (⑤).

## 범위 외

- 4-b §19① 공제금 카테고리 → PR6.
- 4-d → 이미 구현됨(조치 불요).
