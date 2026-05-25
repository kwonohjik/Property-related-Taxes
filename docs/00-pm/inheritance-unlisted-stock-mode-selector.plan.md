# 비상장주식 평가 — 간편/정식 모드 선택기 재설계 (작업계획서)

> 작성일: 2026-05-25 · 도메인: 상속세·증여세 (inheritance / gift) · 성격: **UI 재배치 (엔진 변경 0)**
> 관련 UI 시니어: `inheritance-gift-tax-ui-senior` · 검증: `ui-engine-sync-checker`

---

## 1. 배경 — 현재 무엇이 혼란스러운가

비상장주식 평가 입력은 이미 코드상 두 모드로 구현되어 있다.

- **간편(V1)** — `components/calc/UnlistedStockEditor.tsx`: 순손익·순자산 회사 전체값 2개만 입력 → `calcUnlistedStockPerShareValue()`
- **정식(V2)** — `components/calc/inheritance/unlisted-stock-v2/UnlistedStockV2Card.tsx` + 섹션 7개: 사업연도 조정·자본금 변동·평가차액·영업권·할증평가 → `evaluateUnlistedStockV2()`

그러나 **사용자 입장에서 두 모드의 경계가 보이지 않는다.** 현재 렌더 구조(`StockValuationForm.tsx:446-494`):

```
비상장주식 카드 (각 항목)
├── <UnlistedStockEditor>            ← 간이 폼 전체 (항상 렌더)
│     · 회사명 · 부동산과다보유 · §54④사유
│     · 총발행주식 · 보유주식
│     · 순손익 · 자본환원율 · 순자산 · 미리보기
│     · 영농 · 가업 · §22 · 협의분할   ← 공통 속성이 여기 박혀 있음
├── <ToggleCard "V2 평가 모드">       ← 맨 아래 토글 (간이 폼을 다 지나야 발견)
│     "ON: ... 위 간이 입력은 무시됩니다"
└── {V2 ON일 때} <UnlistedStockV2Card> ← 정식 폼이 간이 폼 아래 추가로 노출
```

### 문제점 3가지

1. **모드 선택이 입력의 맨 끝에 숨어 있다.** 간이 필드를 다 채운 뒤에야 V2 토글을 발견 → "방금 입력이 무시된다"는 안내로 헛수고감.
2. **정식 모드를 켜도 간이 폼이 화면에 그대로 남는다.** 두 평가 폼이 동시 노출되어 "어디에 입력해야 하는지" 불명확.
3. **공통 속성(영농·가업·§22·협의분할)이 간이 에디터 안에만 있다.** 평가 *방식*과 무관한 상속재산 속성인데도 간이 폼에 종속 → 정식 모드에서 접근 동선이 꼬임 = "메뉴가 여기저기 흩어진" 체감.

---

## 2. 목표

1. **평가 방식 선택을 입력 흐름의 맨 앞으로** 끌어올린다 (간편/정식 2-카드 라디오).
2. **선택한 모드의 입력만 노출**하고 나머지는 숨긴다 → "무시됩니다" 안내 제거.
3. **공통 속성을 평가 방식 밖 별도 영역으로 분리**해 두 모드가 공유한다.
4. **모드 전환 시 양쪽 입력을 보존**한다 (데이터 손실 0). 엔진 결과는 그대로.

### 사용자 확정 결정 (2026-05-25)
- UI 형태: **상단 2-카드 라디오** (`RadioCardGroup`)
- 공통 속성: **평가 방식 밖으로 분리**

---

## 3. 목표 컴포넌트 구조 (After)

```
비상장주식 카드 (각 항목)
├── [헤더] 📋 비상장주식 N · 삭제
├── [공통 헤더] 회사명                              ← item.name (단일 source)
├── ⚖️ 평가 방식  (RadioCardGroup, layout="inline" 2옵션)
│     ◉ 간편평가   순손익·순자산 2개 수치 — 빠른 추산
│     ○ 정식평가   별지 부표3 완전 재현 — 신고서용
├── [선택 모드 입력]
│     · 간편 → <UnlistedStockSimpleFields>  (현 UnlistedStockEditor의 입력부)
│     · 정식 → <UnlistedStockV2Card>        (그대로)
└── [공통 속성]  ── mode === "inheritance" 일 때만
      · 영농상속(FarmingCategorySection)
      · 가업상속(FamilyBusinessCategorySection)
      · §22 금융재산공제(FinancialDeductionChip)
      · 협의분할(HeirAllocationToggleSection)
```

> 회사명은 두 모드 공통이므로 카드 헤더 직하 `item.name` 단일 입력으로 승격. V2 내부 `corpName`은 `item.name`과 단방향 동기화(아래 §5 참조). 주식수(`totalShares`·`ownedShares`)는 1차 범위에서 **각 모드 내부 유지**(데이터 모델 분리로 인한 미러 비용 회피) — 통합은 후속 PR.

---

## 4. 모드 상태 관리 결정

### 결정: 명시적 `valuationMode` 필드 추가 (권장 = 채택)

현재는 `item.unlistedStockValuationV2` **존재 여부로 모드를 derive**한다. 이는 메모리 정책
[`feedback_three_state_optional_mode_toggle`](../../../.claude/projects/-Users-mynote-workspace-Property-related-Taxes/memory/feedback_three_state_optional_mode_toggle.md)
("데이터 있음 = ON" derive 금지)에 어긋나고, 정식→간편 전환 시 V2 객체를 삭제해야 해서 **데이터 손실**이 발생한다.

→ `EstateItem`에 `unlistedValuationMode?: "simple" | "formal"` 추가.

| 상태 | 의미 | 데이터 |
|---|---|---|
| `undefined` 또는 `"simple"` | 간편평가 | `unlistedStockData` 사용 |
| `"formal"` | 정식평가 | `unlistedStockValuationV2` 사용 |

- 모드 전환은 **데이터를 지우지 않는다.** 정식 진입 시 `unlistedStockValuationV2`가 없으면 그때 `createDefaultUnlistedStockV2()`로 1회 생성, 이미 있으면 재사용.
- 간편 복귀 시 V2 객체는 **보존**(삭제 안 함). 다시 정식 선택하면 입력값이 살아 있음.
- 양쪽 다 입력된 상태에서의 전환도 데이터가 보존되므로 [`feedback_dialog_data_discard_confirm`](../../../.claude/projects/-Users-mynote-workspace-Property-related-Taxes/memory/feedback_dialog_data_discard_confirm.md) **Dialog 확인 불필요** (손실이 없음).

### 핵심 충돌과 해소 — 모드 기반 strip 단일 헬퍼 (★검토 정정)

**현황(코드 확인)**: 모드 판정이 derive(`unlistedStockValuationV2` 존재 여부)로 **4곳에 분산**되어 있다.

| 위치 | 라인 | 판정 |
|---|---|---|
| 엔진 | `lib/tax-engine/property-valuation.ts:364,369` | `category==="unlisted_stock" && i.unlistedStockValuationV2` → V2 평가 |
| 사이드바 | `lib/stores/inheritance-summary.ts:66` | 동일 derive (`[...estateItems, ...stockItems]` 합산) |
| validate | `lib/calc/inheritance-validate.ts:252` | `!unlistedStockData && !unlistedStockValuationV2` |
| Zod superRefine | `lib/validators/property-valuation-input.ts:149` | 동일 |

**충돌**: 데이터 보존(간편 복귀 시 V2 객체 유지)을 채택하면, 위 derive 코드들이 *"간편 모드인데 잔존 V2로 평가/합계/검증"* 하는 버그를 일으킨다. V2를 삭제하면 데이터 손실([`three_state` 정책](../../../.claude/projects/-Users-mynote-workspace-Property-related-Taxes/memory/feedback_three_state_optional_mode_toggle.md) 위반).

**해소 = strip 단일 헬퍼 (채택)**: 모드 판정을 단일 순수 함수로 추출하고, **엔진에 도달하기 전·사이드바 합산 직전에 비활성 모드의 데이터를 떼어낸다.**

```ts
// lib/calc/unlisted-valuation-mode.ts (신규, single-source)
export function resolveActiveUnlistedValuation(item: EstateItem): EstateItem {
  if (item.category !== "unlisted_stock") return item;
  const mode = item.unlistedValuationMode ?? (item.unlistedStockValuationV2 ? "formal" : "simple");
  if (mode === "simple") {
    const { unlistedStockValuationV2: _omit, ...rest } = item;   // V2 strip (보존은 폼 state에만)
    return rest as EstateItem;
  }
  return item; // formal: V2 그대로, V1은 엔진이 무시
}
```

- 적용 지점: **(a) `inheritance-api.ts` buildInput에서 `stockItems` → `estateItems` 병합 시 map** · **(b) `inheritance-summary.ts` 합산 직전 map**. 두 곳이 같은 헬퍼 import ([single-source 정책](../../../.claude/projects/-Users-mynote-workspace-Property-related-Taxes/memory/single-source-engine-helper.md)).
- 결과: **엔진·Zod·validate의 derive 코드 무변경** → 진짜 "엔진 변경 0" + 데이터 보존 양립. 모드 필드는 엔진에 전달되지 않으므로 **Zod estateItemSchema 변경 불필요**.
- 단, `unlistedValuationMode` 미설정 구버전은 헬퍼 내부 fallback(V2 있으면 formal)으로 호환(C-8/C-9).

---

## 5. 공통 속성 분리 설계

`UnlistedStockEditor.tsx:329-354`의 4개 블록(영농·가업·§22·협의분할)을 **모드 밖**으로 끌어올린다.

- `StockValuationForm`의 비상장 항목 렌더 루프에서 모드 선택 폼과 별개로 카드 하단에 배치.
- 상장주식(`ListedStockEditor`)도 동일 4블록을 자체 보유하므로, 가능하면 **공용 `<EstateCommonAttributesSection>`로 추출**해 상장·비상장 양쪽 재사용(800줄 정책 + 단일 source). → 1차 범위에 포함(난이도 낮음, 기존 컴포넌트 조합만).
- `mode === "gift"`에서는 공통 속성 대부분 미해당 → 현행과 동일하게 비노출.
- 협의분할의 `effectiveValuation`은 선택 모드의 평가 결과(간편: `preview.perShareFinalValue × ownedShares`, 정식: `evaluateUnlistedStockV2().총평가액`)를 주입.

---

## 6. 케이스 인벤토리 (UI 입력 경로 전수)

| # | 모드 선택 | unlistedStockValuationV2 | 노출 입력 | 엔진 | 비고 |
|---|---|---|---|---|---|
| C-1 | (신규 추가 직후) `simple` 기본 | 없음 | 간편 필드 + 공통속성 | `calcUnlistedStockPerShareValue` | 기본 진입 |
| C-2 | `simple` | 있음(과거 정식 입력) | 간편 필드만 (V2 숨김·보존) | 간편 | 전환 후 데이터 보존 검증 |
| C-3 | `formal` (최초 진입) | 없음→생성 | V2 카드 + 공통속성 | `evaluateUnlistedStockV2` | createDefault 1회 |
| C-4 | `formal` | 있음 | V2 카드 (기존값 재사용) | 정식 | 재진입 보존 |
| C-5 | `simple`→`formal`→`simple` 왕복 | 양쪽 입력됨 | 각 단계 해당 모드만 | 각 모드 | 데이터 손실 0 (핵심 anchor) |
| C-6 | `gift` 모드 + `simple` | — | 간편 필드 (공통속성 미노출) | 간편 | 증여 경로 |
| C-7 | `gift` 모드 + `formal` | — | V2 카드 (공통속성 미노출) | 정식 | 증여 경로 |
| C-8 | sessionStorage 구버전(모드 필드 없음) | 있음 | `formal`로 normalize | 정식 | 마이그레이션 호환 |
| C-9 | sessionStorage 구버전 | 없음 | `simple`로 normalize | 간편 | 마이그레이션 호환 |

---

## 7. 변경 파일 & 동기화 지점

> 엔진 input/result **타입 변경 없음**. 신규 필드는 폼-측 `EstateItem.unlistedValuationMode` 1개. **모드 strip은 단일 헬퍼**(§4)로 처리하므로 엔진·Zod·route는 무변경. 상속·증여는 **공유 Zod(`property-valuation-input.ts`)+공유 엔진(`property-valuation.ts`)** 경유 — gift 전용 api/validate 파일 없음.

| 지점 | 파일 (실측) | 작업 |
|---|---|---|
| ① 폼 타입 | `lib/tax-engine/types/inheritance-gift.types.ts:62` | `EstateItem.unlistedValuationMode?: "simple"\|"formal"` 추가 |
| ② initial | `StockValuationForm.tsx` `handleAdd` | 비상장 추가 시 `unlistedValuationMode: "simple"` 기본 |
| ③ normalize | store normalize · `lib/stores/calc-wizard-migration` 류 sessionStorage 마이그레이션 | undefined 유지 가능(헬퍼 fallback이 흡수). 명시 정규화 시 V2 있으면 `formal`, 없으면 `simple` (C-8/C-9) |
| ④ 모드 strip — API | **신규 `lib/calc/unlisted-valuation-mode.ts`** + `lib/calc/inheritance-api.ts` buildInput(`stockItems`→`estateItems` 병합 시 map) | `resolveActiveUnlistedValuation` 적용 (간편 시 V2 strip) |
| ⑤ UI 위젯 | `StockValuationForm.tsx` · 신규 `UnlistedStockSimpleFields.tsx` · `EstateCommonAttributesSection.tsx` | 모드 라디오 + 조건부 렌더 + 공통속성 추출 + V2 토글 카드 제거 |
| ⑥ 사이드바 (실제 합계) | `lib/stores/inheritance-summary.ts:66,107` | `[...estateItems, ...stockItems]` 합산 직전 동일 헬퍼 map. *(폼 카드 로컬 `computeStockValuation`/`TotalStockValue`도 모드 정합 — V2 평가 미반영이던 기존 동작 점검)* |
| ⑦ 결과 카드 | 변경 없음 | 평가액 산출 동일 |
| ⑧ Validation | `lib/calc/inheritance-validate.ts:252` | 선택 모드의 필수 필드만 검증. **반대 모드 필드는 검증 제외** — UI 미노출↔validate 차단 모순 방지. 헬퍼로 active 데이터 판정 |

> **Zod estateItemSchema 변경 불필요**: 모드 필드는 strip 후 전달되어 엔진에 도달하지 않음. 단 `unlistedValuationMode`를 body로 보내 서버에서 strip하는 대안을 택하면 `estateItemSchema`(`property-valuation-input.ts:178`)에 추가 필요(⑫) — **클라이언트 strip 채택으로 회피**.

> **데이터 흐름 정정**: 폼은 `estateItems`와 `stockItems`를 분리 보관, 사이드바·buildInput에서 `[...estateItems, ...stockItems]`로 병합. `callInheritanceTaxAPI` body는 병합 후 `estateItems`만 실림 → strip은 **병합 map 단계**가 단일 적용점.

### 800줄 정책
- `StockValuationForm.tsx` 현재 553줄 → 모드 라디오·공통속성 추출로 **간이 입력부를 `UnlistedStockSimpleFields.tsx`로 분리**(현 `UnlistedStockEditor`의 입력 JSX 이전). 외부 export(`defaultStockData`·`UnlistedStockPreview`)는 re-export 보존([`feedback_800line_split_export_preservation`](../../../.claude/projects/-Users-mynote-workspace-Property-related-Taxes/memory/feedback_800line_split_export_preservation.md)).

---

## 8. 작업 단계 (PR 분할)

순서는 **타입 → 분리 추출 → 모드 선택기 → 공통속성 → 검증**.

1. **PR-1 (타입·정규화)**: `unlistedValuationMode` 필드 + normalize/마이그레이션(C-8/C-9) + 단위 anchor. 회귀 0 확인.
2. **PR-2 (간이 입력부 추출)**: `UnlistedStockSimpleFields.tsx` 분리 — 동작 무변경 리팩터(공통속성 블록은 일단 남겨둠). re-export 보존.
3. **PR-3 (모드 선택기 + strip 헬퍼)**: 신규 `lib/calc/unlisted-valuation-mode.ts`(`resolveActiveUnlistedValuation`) + `inheritance-api.ts` buildInput·`inheritance-summary.ts` 합산에 적용 + `RadioCardGroup` 최상단 배치 + 선택 모드만 조건부 렌더 + V2 토글 카드 제거. C-1~C-5 anchor. **strip 미적용 시 간편 모드에서 V2가 계속 평가되므로 모드 선택기와 strip은 동일 PR 필수**.
4. **PR-4 (공통속성 분리)**: `EstateCommonAttributesSection.tsx` 추출 → 모드 밖 배치 + 상장 에디터에서도 재사용. C-6/C-7.
5. **PR-5 (회사명 공통 헤더 + V2 corpName 동기화)**: item.name 단일화. *(후속 — 1차 미포함 가능)*

> Pre-Do anchor 정책([`feedback_pre_anchor_verification`](../../../.claude/projects/-Users-mynote-workspace-Property-related-Taxes/memory/feedback_pre_anchor_verification.md)): PR-3 진입 전 **C-5(왕복 데이터 보존) anchor를 먼저 작성·실행**해 모드 전환 시 양쪽 데이터 보존이 실제로 깨지지 않는지 확인 후 구현.

---

## 9. 검증 계획

- **anchor**: C-1~C-9 케이스. 특히 **C-5 왕복 보존**(simple→formal→simple 후 두 데이터 객체 모두 잔존) + C-8/C-9 마이그레이션.
- **회귀**: `npx vitest run __tests__/tax-engine/inheritance/` · `gift/` 전체. 엔진 무변경이므로 평가 결과 anchor 전부 보존되어야 함.
- **타입**: `npx tsc --noEmit` 0건.
- **`ui-engine-sync-checker`**: 8지점 매핑 누락 점검.
- **브라우저 수동 확인**: ① 비상장 추가 → 간편 기본 노출 ② 정식 라디오 → V2 카드만 노출(간이 폼 사라짐, "무시됩니다" 문구 없음) ③ 간편 복귀 후 다시 정식 → 입력값 보존 ④ 공통속성 토글이 모드와 무관하게 동작 ⑤ Network 탭 request body에 선택 모드 데이터만 반영.

---

## 10. 범위 밖 (Out of Scope)

- 엔진 산식·세율·평가 로직 변경 (전혀 없음).
- 상장주식 평가 UI 재배치(공통속성 추출 시 재사용만, 레이아웃 변경 없음).
- 주식수(`totalShares`/`ownedShares`)의 모드 간 통합 (PR-5 이후 별도 검토).
- 별지 부표3 PDF 출력·이력조회 동작 변경.

---

## 11. 리스크 & 대응

| 리스크 | 대응 |
|---|---|
| **간편 모드인데 잔존 V2로 평가/합계/검증** (derive 4곳) | strip 헬퍼를 buildInput·사이드바 단일 적용 + C-5 anchor. 엔진/Zod/validate derive는 strip 덕에 무변경 |
| 모드 derive→명시 전환 시 기존 sessionStorage 데이터의 모드 오판정 | 헬퍼 fallback(V2 있으면 formal) + C-8/C-9 normalize anchor |
| 간이 입력부 추출 중 외부 import(`defaultStockData` 등) 깨짐 | re-export 보존 + tsc 게이트 |
| 공통속성 추출 시 상장/비상장 props 시그니처 차이 | `EstateCommonAttributesSection`에 `mode`·`heirs`·`effectiveValuation` props로 일반화 |
| 협의분할 effectiveValuation이 모드별로 다른 함수에서 옴 | 카드 레벨에서 선택 모드 평가액을 계산해 단일 prop 주입 |
