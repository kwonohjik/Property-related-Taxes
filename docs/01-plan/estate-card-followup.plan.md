# estate-item-card-compaction 후속 작업 계획서

> **Feature ID**: `estate-card-followup`
> **작성일**: 2026-05-28
> **선행 PR**: `8d18f15` ✨ feat(inheritance/estate-card): 자산 입력 카드 압축 — 헤더 칩 + ⚙️ 옵션 패널
> **선행 Plan**: [`estate-item-card-compaction.plan.md`](./estate-item-card-compaction.plan.md) (v4)
> **선행 Design**: [`estate-item-card-compaction.ui.design.md`](../02-design/features/estate-item-card-compaction.ui.design.md) (v4)
> **레이어 영향**: UI 전용 + 일부 reusable 분리. 엔진/스토어/Zod/API/Validation **변경 0건**

## 0. 정정 이력

| # | 일시 | 사유 |
|---|---|---|
| v1 | 2026-05-28 | 최초 작성 |
| v2 | 2026-05-28 | **1차 자가 검토 (F1~F6·O1~O8·X1~X2·I1~I3)** — 실측 줄수 정정·stock §22 칩 미노출·순환 의존·400줄 목표 비현실 등 |
| v3 | 2026-05-28 | **2차 자가 검토 (G1~G6)** — e2e 실측 2건 사용·370줄 가능·ItemEditor 위치·PDF grep 0건·중복 등재 제거·단독 카테고리 매트릭스 명확화 |
| v4 | 2026-05-28 | **Plan↔Design 통합 비교 (INT-3~8)** — pickBodyVariant·DEEMED 분리·collapse 자동 해제·PR 의존성·hydration anchor·§22 override stock |
| v5 | 2026-05-28 | **UI Visual 검토 반영 (UV-1~5·UV-O1~O8·UV-X1~X3)** — shadcn DropdownMenu 부재·toast 시스템 부재·기존 testid 정합·인쇄 selector 견고화·fishing 라벨·a11y 시나리오 |

## 0.1 코드베이스 실측 (Pre-Plan 검증)

| 파일 | 실측 줄수 | 800줄 여유 |
|---|---|---|
| `components/calc/PropertyValuationForm.tsx` | **759** | 41 |
| `components/calc/StockValuationForm.tsx` | **701** | 99 |
| `components/calc/inheritance/EstateCommonAttributesSection.tsx` | 193 | 607 |
| `components/calc/inheritance/unlisted-stock-v2/UnlistedStockV2Card.tsx` | 392 | 408 |
| `components/calc/inheritance/estate-card/chip-config.ts` | **256** | 544 |
| `components/calc/inheritance/estate-card/EstateChipInlineExpand.tsx` | 118 | 682 |
| `components/calc/inheritance/estate-card/EstateItemAdvancedPanel.tsx` | 163 | 637 |
| `components/calc/inheritance/estate-card/EstateItemHeader.tsx` | 95 | 705 |
| `components/calc/inheritance/estate-card/EstateItemHeaderChips.tsx` | 94 | 706 |
| `components/calc/UnlistedStockEditor.tsx` | 75 | 725 |

**[G5 정정] EstateCommonAttributesSection 중복 등재 제거**.

## 0.3 인프라 의존성 실측 [UV-1·UV-2·UV-O8 신규]

UI Visual 검토 결과 PR-C에서 가정한 인프라 컴포넌트 실측:

| 컴포넌트 | 실측 위치 | 상태 |
|---|---|---|
| shadcn `Dialog` | `components/ui/dialog.tsx` | ✅ 사용 가능 |
| shadcn `DropdownMenu` | – | ❌ 미설치 |
| toast 시스템 (sonner / use-toast) | – | ❌ 미설치 |
| `Alert` | `components/ui/alert.tsx` | ✅ 대체 가능 |
| `Switch` (ToggleCard 내부) | `components/ui/switch.tsx` | ✅ |

### 결정 사항 (PR-C Pre-Do)

**Q8 — DropdownMenu 도입 [UV-1·UV-O8]**:
- (a) `npx shadcn@latest add dropdown-menu` 설치 후 사용
- (b) 자체 Popover + button list 구현
- **권장 (a)** — shadcn 표준 패턴 + a11y(keyboard/aria) 기본 제공

**Q9 — collapse 알림 [UV-2]**:
- (a) sonner 설치 후 toast 사용
- (b) `Alert` 컴포넌트로 페이지 상단 영구 hint (1회만 노출, 사용자 닫기 시 localStorage 저장)
- (c) hint 없이 ⬆️ 버튼만 노출
- **권장 (b)** — 추가 의존성 0, 1회성 hint 정책 충족

## 0.2 ItemEditor 함수 위치 (FU-1 Pre-Do 정보) [G3 신규]

`PropertyValuationForm.tsx` 함수 구조:

| 함수 | 줄 범위 | 줄수 |
|---|---|---|
| `computeEffectiveValuation` (export) | 40~53 | 14 |
| `ItemEditor` (분리 대상) | **148~568** | **421** |
| `CategoryButton` | 569~600 | 32 |
| `generateId` | 601~605 | 5 |
| `PropertyValuationForm` (export) | 606~759 | 154 |
| 상수·타입·import | 1~134 | 134 |

→ FU-1 분리 시 ItemEditor 421줄을 3 variant(~150·~250·~80) + helpers(~80)로 분배.
잔여 PropertyValuationForm.tsx ≈ 154 + 32 + 5 + 134(import 정리 후 ~125) + ItemEditor 호출 wrapper ~60 = **~376줄**.

**→ FU-1 PropertyValuationForm 759줄 + 800줄 정책 41줄 여유** — 즉시 분리 필요한 임박 상태.
**→ FU-2 StockValuationForm 701줄** — FU-2 칩 패턴 적용 시 99줄 이내 변경 강제.

---

## 0. 후속 작업 7건 — 우선순위·범위 요약

| FU# | 작업 | 우선순위 | 범위 | 예상 시간 |
|---|---|---|---|---|
| **FU-1** | variant 본체 파일 분리 (EstateBodySimple/RealEstate/Deposit) + computeEffectiveValuation 분리 (F6) | ★★ Critical (800줄 41줄 여유·재사용성·순환 의존) | PropertyValuationForm.tsx 분할 + lib/calc/estate-item-valuation.ts 신설 | 4.5h |
| **FU-2** | 주식 카드 동일 패턴 적용 (EstateCommonAttributesSection) | ★ High (UX 일관성) | StockValuationForm 경유 5 컴포넌트 | 3h |
| **FU-3** | 자산 카드 collapse — 5개 이상 시 카드 자체 접기 | Mid (자산 다건 시) | 신규 컨테이너 + 토글 | 2h |
| **FU-4** | Anchor #1 a11y e2e (Playwright) | ★ High (선행 PR 잔여) | e2e/estate-card-a11y.spec.ts | 1.5h |
| **FU-5** | Anchor #2 칩↔⚙️ 상태 일관성 통합 e2e | ★ High (선행 PR 잔여) | e2e/estate-card-chip-advanced-sync.spec.ts | 1.5h |
| **FU-6** | 카테고리 변경 지원 — 추가 후 카테고리 변경 가능 UI | Low (현재 미지원·삭제 후 재추가로 회피 가능) | 신규 카테고리 selector | 2h |
| **FU-7** | print:CSS 자동 펼침 anchor + PDF 출력 검증 | Mid (정책 준수 검증) | __tests__/inheritance/estate-card-print.test.tsx | 1h |
| **FU-8** | UV 인프라 셋업 (Q8(a) DropdownMenu 설치 + Q9(b) Alert hint) [UV-1·UV-2·UV-O8 신규] | ★ (PR-C 사전 필수) | npx shadcn add dropdown-menu + collapse-hint Alert 컴포넌트 | 0.3h |
| **총** | | | | **15.3h** |

본 계획서는 7개 FU를 **3개 독립 PR**로 분할 권장:
- **PR-A** = FU-1 + FU-4 + FU-5 (variant 분리 + computeEffectiveValuation 분리 + 잔여 e2e) — **10h**
- **PR-B** = FU-2 + FU-7 (주식 카드 + print 검증) — 4h
- **PR-C** = FU-3 + FU-6 (collapse + 카테고리 변경) — 4h

---

## 1. FU-1 — variant 본체 파일 분리

### 1.1 배경 [F1 정정]

선행 PR에서 실용 결정으로 격하한 작업 (선행 Plan §5.1 명시).
`PropertyValuationForm.tsx`는 현재 **759줄** (선행 PR 이후, 800줄 정책 41줄 여유) — 800줄 정책 ([[components/calc/CLAUDE.md]] File Size Policy)에 매우 임박. 추가 변경 1건이라도 위반 위험.
또한 본체 입력 로직이 단일 `ItemEditor` 함수 (약 460줄) 안에 7 카테고리 분기로 혼재 → 재사용·테스트 어려움.

### 1.2 분리 대상

선행 Design `EstateBodySimple/RealEstate/Deposit` 3 variant 정의를 그대로 구현.

| variant | 대상 카테고리 | 핵심 입력 | 신규 파일 |
|---|---|---|---|
| SIMPLE | cash · financial · other | 자산명칭 + 시가(+감정가 only `other`) | `components/calc/inheritance/estate-card/variants/EstateBodySimple.tsx` |
| REAL_ESTATE | real_estate_land · real_estate_building · real_estate_apartment | AddressSearch + 시가/감정가/StandardPriceInput + 임대보증금 + 저당권 + §14 ToggleCard | `variants/EstateBodyRealEstate.tsx` |
| DEPOSIT | deposit (상속세 전용) | 별칭 + 임대보증금(자산본체) + §14 ToggleCard | `variants/EstateBodyDeposit.tsx` |

### 1.3 분리 정책 [O6·I3 정정]

- **본체 입력 위젯 100% 보존** — AddressSearch / StandardPriceInput / Vworld 자동조회 / fishing 분기 / `addrValue` / `standardPricePerSqm` local state 모두 그대로
- 각 variant의 props는 동일 시그니처:
  ```tsx
  interface VariantBodyProps {
    item: EstateItem;
    onUpdate: (updated: EstateItem) => void;
    valuationDate?: string;
    /** §14 자동공제 토글 노출 조건 (mode·카테고리·담보채권액 합산 부모에서 계산) */
    showCollateralDeductToggle: boolean;
  }
  ```
- PropertyValuationForm.tsx의 `ItemEditor`는 variant 선택만 담당:
  ```tsx
  const Variant = pickBodyVariant(cat); // SIMPLE | REAL_ESTATE | DEPOSIT
  <Variant item={item} onUpdate={onUpdate} ... />
  ```
- **줄수 목표 [O6·G2 정정]**:
  - PropertyValuationForm.tsx 759 → **400줄 이하** (§0.2 실측 기반 — ItemEditor 421줄 추출 후 잔여 ~376)
  - 각 variant 파일 ≤ 300줄 (REAL_ESTATE는 AddressSearch + StandardPriceInput + 6 필드 + §14 토글 포함)
  - SIMPLE/DEPOSIT은 ≤ 150줄
- **I3 — 공통 helpers 분리**: variant 3종 공통 closure(`set` 헬퍼, `propertyKind` 도출, fishing 분기) → `variants/EstateBodyHelpers.ts` 분리 (≤ 80줄)
- **I1 — computeEffectiveValuation 분리** [F6 정정]:
  - 현재 `computeEffectiveValuation`은 `PropertyValuationForm.tsx`에 정의 + `chip-config.ts`에서 import → 순환 의존 위험
  - FU-2에서 `EstateCommonAttributesSection`이 `chip-config` import 시 순환 발생
  - **본 FU-1에서 사전 분리**: `lib/calc/estate-item-valuation.ts` 신설 → `PropertyValuationForm` + `chip-config` 양쪽이 import. 기존 export는 backwards-compat re-export 유지

### 1.4 Pre-Do anchor [UV-5·UV-O1 정정]

- AN-FU1-1: `pickBodyVariant("real_estate_land") === REAL_ESTATE` 등 매핑 매트릭스
- AN-FU1-2: variant별 렌더 후 본체 입력 필드 존재 (자산명칭 input·시가 input·AddressSearch·StandardPriceInput 등)
- **AN-FU1-3 [UV-5]**: EstateBodyRealEstate에서 `farmingCategory ∈ {fishing_vessel, fishing_right}` 시 AddressSearch 라벨이 "선적지·어장 연안 검색"으로 변경되는지 anchor
- **AN-FU1-4 [UV-O1]**: 감정평가액 노출 조건 정확화 — `showAppraisedValue = cat !== "financial" && cat !== "deposit" && cat !== "cash"` (= real_estate 3종 + other). variant 매핑:
  - SIMPLE + other → 감정가 input 노출
  - SIMPLE + cash/financial → 감정가 input 미노출
  - REAL_ESTATE 3종 → 감정가 input 노출
  - DEPOSIT → 감정가 input 미노출

### 1.5 회귀 보장

- 기존 5440 PASS 유지
- AddressSearch 좌표 동기화 (PNU·Vworld) 보존
- fishing 분기 (`farmingCategory ∈ {fishing_vessel, fishing_right}`) 동작 보존
- StandardPriceInput pricePerSqm local state 유지

### 1.6 위험·완화

| 위험 | 완화 |
|---|---|
| variant 추출 시 closure 의존(set·visibility) 깨짐 | props로 명시 전달 |
| addrValue local state 손실 | EstateBodyRealEstate 내부 useState 유지 |
| 본체 분기 누락으로 화면 깨짐 | 7 카테고리 anchor 매트릭스 강제 |

---

## 2. FU-2 — 주식 카드 동일 패턴 적용

### 2.1 배경

선행 PR은 `PropertyValuationForm` (부동산·금융·기타) 전용. 주식 카드는 별도 진입점 `components/calc/inheritance/EstateCommonAttributesSection.tsx`에서 동일한 5섹션(분류·§22·영농·가업·협의분할 + §22② 최대주주)을 직렬 노출 중.

선행 Plan §5.4 "Phase 2"로 분리되었던 작업.

### 2.2 영향 컴포넌트 [F2 정정 — 실제 경로]

| 사용처 | 위치 | 실측 줄수 |
|---|---|---|
| `EstateCommonAttributesSection` | `components/calc/inheritance/EstateCommonAttributesSection.tsx` | 193 |
| `StockValuationForm` (ListedStockEditor + UnlistedStockCard 호스트) | **`components/calc/StockValuationForm.tsx`** (inheritance 폴더 아님) | **701** |
| `UnlistedStockEditor` (PR-4 후 75줄 shim) | `components/calc/UnlistedStockEditor.tsx` | 75 |
| `UnlistedStockV2Card` | `components/calc/inheritance/unlisted-stock-v2/UnlistedStockV2Card.tsx` | 392 |

StockValuationForm은 295행과 452행에서 EstateCommonAttributesSection을 호출 — 본 FU-2의 변경은 **EstateCommonAttributesSection 1 파일 변경만으로 양쪽에 자동 전파**.

### 2.3 적용 방안 [F3·X1 정정]

1. `EstateCommonAttributesSection` 자체를 **선행 PR의 EstateItemHeader + EstateChipInlineExpand + EstateItemAdvancedPanel 셋의 호출 wrapper**로 재구성
2. 주식 카드 본체 입력은 변경 없음
3. §22② 최대주주 토글(`MajorShareholderStockToggle`)을 칩 또는 ⚙️ 패널 안으로 이동
   - 신규 칩 `chip-major-shareholder` 추가 (상장·V1만) — selected 카드는 rose tone
4. corporate stock 전용 `CorporateNonBusinessAssetsSection`은 ⚙️ 패널 내부로 이동

**[F3 정정] §22 칩 자동 미노출 검증**:
- `lib/calc/asset-toggle-visibility.ts:145~147` 후처리에서 `listed_stock·unlisted_stock`은 `financialDeduction = "hidden_permanent"` 강제
- `resolveChips`는 이미 `visibility.financialDeduction !== "hidden_permanent"` 조건으로 §22 칩 노출 결정 → 주식 카드에서 §22 칩 **자동 미노출**
- 따라서 FU-2는 **chip-major-shareholder 단일 신규 칩 추가만** 의미. 기존 §22 칩은 영향 없음

**[INT-8 정정] stock §22 사용자 지정 override 경로**:
사용자가 stock 자산에 `item.isFinancialAssetForDeduction !== undefined` 명시 시 ⚙️ 패널에서도 노출되어야 함. EstateItemAdvancedPanel 분기:
```ts
const showSection22Override =
  visibility.financialDeduction === "default" ||
  (visibility.financialDeduction === "hidden_permanent"
    && item.isFinancialAssetForDeduction !== undefined);
```

### 2.4 chip-config 확장 [F5·O1 정정]

```ts
// 신규 ChipKey 추가
export type ChipKey =
  | "estimated-value"
  | "classification"
  | "section22"
  | "heir-allocation"
  | "farming"
  | "family-business"
  | "secured-claim-14"
  | "major-shareholder";  // 신규

// [F5 정정] EstateChipInlineExpand.tsx의 PANEL_TITLE/PANEL_TONE Record<ChipKey, ...> 도 동시 갱신 강제:
const PANEL_TITLE: Record<ChipKey, string> = {
  ...,
  "major-shareholder": "",  // 즉시 토글 — 패널 미렌더
};
const PANEL_TONE: Record<ChipKey, ChipTone> = {
  ...,
  "major-shareholder": "rose",
};

// [O1 정정] resolveChips params 확장
export interface ResolveChipsParams {
  item: EstateItem;
  mode: "inheritance" | "gift";
  heirsCount: number;
  /** 신규 — UnlistedStockV2Card 내부 자체 토글과 중복 회피 */
  showMajorShareholderChip?: boolean;
}

// resolveChips 분기:
if (showMajorShareholderChip) {  // 상장·V1만 (V2는 false)
  chips.push({
    key: "major-shareholder",
    label: item.isSection22MajorShareholder ? "최대주주 §22② ✓" : "최대주주 §22②",
    tone: item.isSection22MajorShareholder ? "rose" : "gray",
    isExpandable: false,
    isToggle: true,
    tooltip: "§22② 최대주주 보유주식은 금융재산공제 배제 — 클릭하여 토글",
  });
}
```

**[I2 개선] resolveChips 분기 모듈화 검토**: 신규 칩이 늘어나면 단일 함수 복잡도 증가. FU-2 시점에서 칩 수 8개 — 한계 도달 시 `resolveChipsForEstate` + `resolveChipsForStock` 분리. 본 FU-2는 단일 함수 유지(8개 임계).

### 2.5 chip-config 800줄 정책 점검 [F4 정정]

- 현재 256줄 + FU-2 변경 (ChipKey 1·라벨·tooltip·PANEL Record·params 1) ≈ +40줄 → **약 300줄**
- 800줄 정책 여유 충분 (단일 모듈 한계 안)
- FU-3에서 collapse 상태 매핑 추가 시 재점검

### 2.5 Pre-Do anchor

- AN-FU2-1: ListedStockEditor에서 EstateItemHeader 노출
- AN-FU2-2: 최대주주 토글 칩 클릭으로 `isSection22MajorShareholder` 토글
- AN-FU2-3: UnlistedStockV2Card 내부 자체 토글과 중복 없음 (visibility=hidden for V2)

### 2.6 회귀 위험 [O8·G1 정정]

| 위험 | 완화 |
|---|---|
| MajorShareholderStockToggle 기존 e2e 깨짐 — **실측 2건 존재** | **[G1 정정] e2e 갱신 작업 명시**: `e2e/inheritance-stock-financial-chip-absent.spec.ts` (§22 칩 ↔ 최대주주 토글 구분 검증)·`e2e/inheritance-unlisted-v1-section22-toggle.spec.ts` (V1/V2 분기). 칩 신설 후 토글은 ⚙️ 패널 안에 유지 (위치만 변경) — `getByText("§22② 최대주주 보유주식 금융재산공제 배제")` 같은 텍스트 셀렉터는 토글이 ⚙️ 안에 있어도 접근 가능. ⚙️ 자동 펼침으로 spec 호환 |
| V1/V2 mode 분기 누락 | `resolveUnlistedDisplayMode` 사용, V2 시 `showMajorShareholderChip=false` 전달 |
| 최대주주 toggle이 §22 칩과 의미 충돌 | tooltip에 "§22② 배제 vs §22① 적용" 구분 명시. 색상 분리: §22=emerald, 최대주주=rose |
| chip-config 순환 의존 | FU-1에서 `lib/calc/estate-item-valuation.ts` 분리 선행 — FU-2는 본 모듈만 import |

---

## 3. FU-3 — 자산 카드 collapse (5개 이상 시 접기)

### 3.1 배경

자산 카드를 5~10개 추가 시 입력 후 전체 검토하려면 페이지 스크롤이 길어짐. 입력 완료된 카드는 한 줄 요약만 보고 싶다는 사용자 패턴.

### 3.2 동작 명세

```
[자산 추가 4개까지] — 모든 카드 펼친 상태
[자산 5개 이상] — 카드 우상단에 ⬆️ 접기 버튼 노출, 클릭 시 한 줄 요약 모드
                  (헤더만 보임: 아이콘 + 라벨 + 칩 + ⚙️ 옵션 + 삭제 + ⬇️ 펼치기)

한 줄 요약 모드의 칩:
  - chip-estimated-value (필수 — 평가액 한눈에)
  - 변경된 옵션 칩만 (countNonDefaultOptions > 0인 항목만 우선)
  - § 칩이 너무 많으면 ⚙️ 안 (배지) — chip-{count} more
```

### 3.2.5 collapse 토글 위치 [UV-O5·UV-X3 정정]

**확정**: 헤더 행과 본체 사이의 **별도 행** (Visual §3.1 ASCII와 Design §5.1 Shell 구조 정합).
- 헤더 행: 아이콘 + 라벨 + 칩 wrap + ⚙️ + 삭제 + (FU-6) ⋮ 메뉴
- 별도 행: collapse 토글 (자산 5+ 시만 노출, print:hidden)
- 본체 영역: `hidden print:block` toggle 대상

⋮ 메뉴(FU-6)는 헤더 우측 액션 영역에 추가, collapse 토글과 별도 행 — 시각 위계 명확화.

### 3.3 신규 컴포넌트 [O2·O5·X2 정정]

- `EstateItemCardShell` (선행 PR에서 미생성한 외곽 컨테이너) — 본 FU에서 신설
- **[O2 정정] collapse 상태 저장 위치 결정**:
  - **권장**: `localStorage` per item (key: `estate-card-collapsed-{itemId}`)
  - 사유: zustand store에 추가 시 sessionStorage persist 마이그레이션 필요 + result 직렬화 영향 검토. localStorage는 UI 일시 상태 격리, store 무관
  - 대안 검토 후 사용자 결정 (Q3-1)
- 자산 추가 4→5번째 자동 시 기존 1~4번째는 자동 접기? → **No (사용자 의도 보존, 명시 클릭으로만)** — Q3 사용자 결정에 의존

**[INT-5 정정] collapse 상태에서 ⚙️ 클릭 시 collapse 자동 해제**:
- collapse=true 시 ⚙️ 패널은 hidden → 사용자가 ⚙️ 클릭해도 변화 못 봄
- 정책: `onToggleAdvanced()` 호출 시 자동으로 `setCollapsed(false)` 동시 실행 (Design D2-O3)
- **[O5·UV-3 정정] testid 매트릭스**:
  - **기존 (선행 PR `8d18f15`에서 이미 추가됨)**: `estate-card-shell-{itemId}` — 외곽 컨테이너. FU-3에서는 **신규 생성 아닌 속성 추가**
  - 신규 속성: `data-collapsed={true|false}` — e2e에서 상태 확인용
  - 신규 testid: `estate-card-collapse-toggle-{itemId}` (헤더 다음 행 ⬆️/⬇️ 버튼)
- **[UV-4 정정] 인쇄 CSS selector 견고화**: `[data-testid^="estate-card-shell-"][data-collapsed="true"] > div:last-child` 같은 위치 의존 selector 금지. **`data-card-body` 속성 명시** 후 selector `[data-card-body][data-collapsed-hidden]` 사용 — Shell 구조 변경에 강건
- **[X2 정정] hidden vs print:block 검증**:
  - collapse 시 본체는 `hidden print:block` CSS-only 토글 — React unmount 없음 → local state(addrValue·standardPricePerSqm) 보존
  - 인쇄 시 자동 펼침 보장
  - useState는 컴포넌트 unmount 시에만 손실 — `display: none`은 mount 유지 → 안전

### 3.4 Pre-Do anchor

- AN-FU3-1: 자산 1~4개 시 카드 접기 버튼 미노출
- AN-FU3-2: 자산 5개 시 모든 카드에 접기 버튼 노출
- AN-FU3-3: 접기 상태에서 본체 입력 위젯 unmount 시 standardPricePerSqm local state 손실 검증

### 3.5 위험

| 위험 | 완화 |
|---|---|
| standardPricePerSqm·addrValue local state 손실 | collapse 시 unmount 아닌 CSS `display: none` 사용 |
| 인쇄 시 collapse 카드 누락 | print:block 강제 |

---

## 4. FU-4 — Anchor #1 a11y e2e (Playwright)

### 4.1 배경

선행 Plan §8 Anchor #1 "헤더 칩 a11y + 인라인 펼침"이 단위 anchor만 충족, e2e 미수행.

### 4.2 시나리오

`e2e/estate-card-a11y.spec.ts` 신규:

1. 상속세 모드 진입 → financial 자산 1개 추가
2. Tab 키로 헤더 칩까지 포커스 이동 → focus-visible ring 표시 확인
3. 분류 칩에 포커스 → Enter 키 → 인라인 펼침 패널 등장 → aria-expanded=true
4. Tab으로 라디오 4개 순회 → 보험금 선택 (Space)
5. Esc 또는 외부 클릭으로 패널 닫힘 → aria-expanded=false
6. 분류 칩 라벨이 `[보험금 §8]`로 변경 + amber tone 확인
7. §22 칩에 포커스 → Space 3회 → 3-state 순환 (ON→OFF→기본)
8. ⚙️ 버튼 포커스 → Enter → 패널 펼침 → focus trap 검증

### 4.3 도구

- Playwright (기존 e2e/ 디렉터리에 추가)
- 회귀 cleanup 패턴 준수 ([[feedback_browser_verify_with_playwright]])

---

## 5. FU-5 — Anchor #2 칩↔⚙️ 상태 일관성 e2e

### 5.1 배경

선행 Plan §8 Anchor #2 "칩 ↔ ⚙️ 패널 상태 일관성"이 단위 anchor (resolveChips)만 충족, 통합 e2e 미수행.

### 5.2 시나리오

`e2e/estate-card-chip-advanced-sync.spec.ts` 신규:

1. financial 자산 추가 (mode=inheritance, heirs 2명)
2. ⚙️ 버튼 클릭 → 패널 펼침
3. ⚙️ 패널 안의 FinancialDeductionChip(§22)을 OFF로 변경
4. ⚙️ 닫기 → 헤더 칩 `[§22 ✗]` + violet 외곽(isUserOverride) 확인
5. 헤더 §22 칩 클릭 → 3-state 순환 → `[§22 ✓]` 또는 `[§22 ✓ 기본]` 확인
6. 분류 칩 클릭 → 보험금 선택 → 헤더 칩 `[보험금 §8]` 즉시 갱신
7. 협의분할 칩 클릭 → 인라인 펼침 → 빈 분할(`heirAllocations=[]`) → 칩 `[협의분할 (미입력)]` amber
8. 배우자 선택 + 금액 입력 → 칩 `[협의분할 ✓]` sky
9. ⚙️ 옵션 N 배지 = 변경된 옵션 개수 일치 (countNonDefaultOptions)

---

## 6. FU-6 — 카테고리 변경 지원

### 6.1 배경

선행 Plan §5.7 "현재 미지원 (자산 삭제 후 재추가)". 사용자 피드백에 따라 카테고리 변경 가능 UI 검토.

### 6.2 적용 방안 [O3·O7 정정]

- 헤더에 ⋮ 메뉴 추가 (아이콘+라벨 옆) → "카테고리 변경" 옵션
- 카테고리 변경 시 호환되지 않는 필드 자동 제거 (예: real_estate_apartment → cash 변경 시 standardPrice 제거)
- confirmation Dialog 필수 (데이터 손실 경고)

#### [O3·G6 정정] 호환 매트릭스 — 3그룹 정책

| 그룹 | 카테고리 | 그룹 내 변경 시 보존 필드 |
|---|---|---|
| **real_estate** | real_estate_land · real_estate_building · real_estate_apartment | name·estateAddress·estateLatLng·estateSigunguCode·marketValue·appraisedValue·leaseDeposit·mortgageAmount·deductSecuredClaimAsDebt·securedClaim* |
| **금융** | cash · financial | name·marketValue (그룹 간 변경 시 §22 visibility 변경으로 isFinancialAssetForDeduction 재평가) |
| **단독** | deposit · other | **그룹 내 변경 자체 없음** (각 카테고리 단독) — 다른 그룹으로 변경만 의미. deposit→cash 변경 시 leaseDeposit→marketValue 매핑 검토 등 그룹 간 정책에 위임 |

그룹 간 변경 (예: real_estate → financial) 시 경고 후 호환 필드만 유지.

#### [INT-4 정정] DEEMED_ALLOWED_CATEGORIES 분리

FU-6 호환 매트릭스 + deemedCategory 호환 검증을 단일 모듈에 위치:
- 신규 `lib/calc/deemed-category-policy.ts`로 분리
- 기존 `PropertyValuationForm.tsx :118~126`의 `DEEMED_ALLOWED_CATEGORIES` 상수를 이곳으로 이동 + re-export

#### [O7 정정] 카테고리 변경 시 공통 필드 보존 정책

| 필드 | 모든 카테고리 변경 시 보존 | 사유 |
|---|---|---|
| `id` | ✅ 보존 | 자산 식별자 |
| `name` | ✅ 보존 | 사용자 의도 |
| `heirAllocations` | ✅ 보존 | 협의분할 분배는 카테고리 무관 (amount만 의미) |
| `deductSecuredClaimAsDebt` | 그룹 내(real_estate)만 보존 | 다른 그룹은 mortgageAmount·leaseDeposit 없음 |
| `deemedCategory` | 카테고리 호환성 매트릭스에 따라 (예: real_estate → insurance 불가) | DEEMED_ALLOWED_CATEGORIES 확인 |
| `isFinancialAssetForDeduction` | ✅ 보존 (visibility 재평가) | 사용자 지정 의도 유지 |
| `farmingCategory` | 카테고리 호환성 확인 | visibility=hidden_permanent 변경 시 자동 undefined |
| `familyBusinessCategory` | 동상 | – |

### 6.3 위험

| 위험 | 완화 |
|---|---|
| 카테고리별 enum 분기 (deemedCategory·visibility) 일관성 깨짐 | resolveAssetToggleVisibility 재호출로 갱신 + 비호환 시 자동 undefined |
| 데이터 손실 | Dialog confirmation + §6.2 보존 매트릭스 명시 |
| 호환되지 않는 카테고리 조합 | §6.2 매트릭스 — 그룹 내 변경만 허용 (Q1 권장) |
| 협의분할 합계 불일치 | 카테고리 변경 후 평가액 재계산 — `HeirAllocationInput` 합계 검증 자동 노출 |

### 6.4 결정 필요

| Q | 옵션 |
|---|---|
| Q1 호환 매트릭스 | (a) 모든 카테고리 자유 변경 / (b) 그룹 내 변경만 (real_estate·금융·단독 3그룹) |
| Q2 데이터 손실 시 동작 | (a) 자동 변환 / (b) 변환 불가 필드 명시 후 사용자 확인 |

→ 권장: (b)/(b) — 안전 우선

### 6.5 Dialog 시각 분기 [UV-X1·UV-O3 정정]

CategoryChangeDialog는 단일 컴포넌트이나 **그룹 내/그룹 간 분기로 시각 다르게 렌더**:

| 영역 | 그룹 내 변경 | 그룹 간 변경 |
|---|---|---|
| 외곽 | shadcn Dialog 동일 | shadcn Dialog 동일 |
| 손실 필드 경고 | 표시 안 함 ("전 필드 보존" 안내만) | amber 박스 + 손실 필드 목록 (✓/✗) |
| confirm 버튼 | `bg-indigo-600` (안전) | `bg-rose-600` (destructive) |
| confirm 버튼 라벨 | "변경 확인" | "변경 확인 (필드 일부 삭제)" |
| 데이터 손실 표시 | – | pickPreservedFields 결과 기반 동적 카테고리별 표 (Q4 그룹별 매트릭스 참조) |

### 6.6 ⋮ 메뉴 a11y [UV-O4 정정]

DropdownMenu 키보드 a11y 시나리오 (shadcn 기본 제공):
- Tab → ⋮ 버튼 포커스
- Enter / Space → 메뉴 펼침
- ↑/↓ → 메뉴 항목 이동
- Enter → 항목 선택 (Dialog 펼침)
- Esc → 메뉴 닫힘 (포커스 ⋮ 버튼으로 복귀)
- 외부 클릭 → 메뉴 닫힘

Dialog 키보드 a11y (shadcn 기본):
- Tab/Shift+Tab → focus trap (Dialog 안에서만)
- Esc → Dialog 닫힘 (취소 동작)
- Enter (confirm 버튼 포커스 시) → 확인 동작

---

## 7. FU-7 — print:CSS 자동 펼침 anchor + PDF 출력 검증

### 7.1 배경

선행 Plan §10 위험 완화 "인쇄 PDF 미반영"과 Design §10 "인쇄(PDF) 처리"를 anchor로 검증.

### 7.2 anchor 시나리오

`__tests__/inheritance/estate-card-print.test.tsx`:

1. ⚙️ 패널 닫힌 상태 → 브라우저 print 미디어 query 시뮬레이션
2. ⚙️ 패널 자동 펼침 검증 (`print:block` CSS 적용)
3. 인라인 패널도 동일하게 자동 펼침
4. ⚙️ 버튼·삭제 버튼은 `print:hidden`으로 비노출
5. 칩 외곽선 강화 적용 검증 (선행 Visual §10)

### 7.3 PDF 출력 검증 [O4·G4 정정]

**Pre-Plan 실측 (v3에서 수행 완료)**:
```
grep -rln "PropertyValuationForm\|EstateCommonAttributesSection" components/calc/results/ app/api/pdf/
→ 0건 (자산 카드는 폼-입력 전용 컴포넌트)
```

**결론**: 자산 카드는 PDF 출력 경로(InheritanceFilingForm·besshi)에서 호출되지 않음. PDF 양식은 별도 컴포넌트(`besshi-page*`·`InheritanceFilingForm*`)에서 `result.estateItems` 데이터를 직접 렌더.

**FU-7 범위**: 화면 인쇄(브라우저 Ctrl+P) 시나리오만 anchor. PDF react-pdf 경로 무관.

**Anchor 시나리오**: ⚙️/인라인 패널이 닫힌 상태에서 print 미디어 query → `display: block` 강제 + `print:hidden` 버튼 비노출.

---

## 8. 통합 자가 검증 (12단계 워크플로 — 정책)

[[feedback_11step_self_review_workflow]] 적용:

| # | 단계 | 점검 항목 |
|---|---|---|
| 1 | 케이스 매트릭스 | FU-1 7 카테고리 × FU-2 주식 4 카드 × FU-3 collapse 2 상태 |
| 2 | a11y | FU-4 키보드·aria 매트릭스 |
| 3 | 인쇄/PDF | FU-7 print:block 검증 |
| 4 | 회귀 | 선행 5440 + FU별 anchor 누적 |
| 5 | 800줄 정책 | FU-1 분리 후 모든 파일 ≤ 400줄 목표 |
| 6 | 정책 매트릭스 | mirror-pattern·tone-static·useEffect 금지 준수 |
| 7 | tone 매핑 | rose 신규(최대주주) 추가 일관성 |
| 8 | variant 분기 | EstateBodySimple/RealEstate/Deposit 각각 anchor |
| 9 | testid 동결 | 기존 선행 PR + 신규 chip-major-shareholder 추가만 |
| 10 | local state 손실 | FU-3 collapse 시 unmount 회피 |
| 11 | PDF 호환 | FU-7 일관성 |
| 12 | 사용자 확인 | FU-6 Q1·Q2 결정 |

---

## 9. PR 분할 권장

### PR 의존성 [INT-6 정정]

```
PR-A (FU-1·4·5) ─ 필수 선행
   ↓
   ├─→ PR-B (FU-2·7) — chip-config 확장은 PR-A의 estate-item-valuation 의존
   └─→ PR-C (FU-3·6) — Shell·CategoryChangeDialog는 PR-A의 variant 분리 의존
```

PR-A 머지 전까지 PR-B·C 진행 차단. PR-A 머지 후 PR-B·C는 병렬 가능.

### PR-A — variant 분리 + 잔여 e2e (FU-1 + FU-4 + FU-5)

가장 우선. 선행 PR의 약점(759줄·잔여 anchor·순환 의존)을 모두 해소.

- 신규 파일: 3 variant + 1 helpers + 1 valuation 분리 + 2 e2e = 7 파일
- 수정 파일: PropertyValuationForm.tsx (**759→500줄**) + chip-config.ts import 정정
- 예상 시간: 10h
- 회귀 위험: variant 추출 closure / addrValue local state / computeEffectiveValuation re-export — anchor 매트릭스로 차단

### PR-B — 주식 카드 + print (FU-2 + FU-7)

UX 일관성 확보 + 인쇄 검증.

- 신규 파일: chip-major-shareholder 추가 / __tests__/inheritance/estate-card-print.test.tsx
- 수정 파일: EstateCommonAttributesSection.tsx · chip-config.ts (rose tone 추가)
- 예상 시간: 4h

### PR-C — collapse + 카테고리 변경 (FU-3 + FU-6)

선택적 향상. 사용자 피드백에 따라 후순위 가능.

- 신규 파일: EstateItemCardShell.tsx · CategoryChangeDialog.tsx · useCollapseState.ts · lib/calc/category-change-policy.ts · lib/calc/deemed-category-policy.ts
- 수정 파일: PropertyValuationForm.tsx
- **사전 작업**: Q8(a) → `npx shadcn@latest add dropdown-menu` 실행 + components/ui/dropdown-menu.tsx 추가
- 예상 시간: 4h (+ 인프라 셋업 0.3h)
- 결정 필요: Q1·Q2·Q3·Q3-1·Q8·Q9 (호환 매트릭스 + 데이터 손실 정책 + DropdownMenu·hint UX)

---

## 10. Definition of Done (전체 FU 공통)

각 FU 완료 기준:

- [ ] 해당 FU의 anchor 100% 통과
- [ ] 선행 5440 회귀 통과 (누적 회귀 0건)
- [ ] `npx tsc --noEmit` 0건
- [ ] `npm run lint` 0 error
- [ ] testid 동결 self-grep (변경된 기존 testid 0건)
- [ ] PR-A·PR-B의 경우 Playwright e2e 1건 이상
- [ ] `ui-engine-sync-checker` 결과 첨부 (① ~ ⑭ 변경 없음 확인)
- [ ] 한국어 커밋 메시지

---

## 11. 의사결정 사항 (Do 진입 전 사용자 확인)

| Q# | 항목 | 옵션 | 권장 |
|---|---|---|---|
| Q1 | 진행 순서 | (a) PR-A 우선 / (b) PR-B 우선 / (c) 모두 한 번에 | **(a)** PR-A 우선 (선행 PR 잔여 해소) |
| Q2 | FU-6 호환 매트릭스 | (a) 자유 변경 / (b) 그룹 내만 | **(b)** 안전 우선 |
| Q3 | FU-3 collapse 자동 트리거 | (a) 자산 5+ 자동 / (b) 수동 클릭만 | **(b)** 사용자 의도 보존 |
| Q3-1 | FU-3 collapse 상태 저장 [O2 신규] | (a) zustand store / (b) localStorage per item | **(b)** UI 일시 상태 격리 |
| Q4 | FU-2 최대주주 칩 tone | (a) rose / (b) amber | **(a)** rose (경고·중요) |
| Q5 | FU-7 PDF 검증 범위 | (a) 단위 anchor만 / (b) e2e 출력 검증까지 | **(a)** 단위만 (PDF 출력은 기존 정책 보존) |
| Q6 | FU-1 줄수 목표 [O6·G2 정정] | (a) 400줄 (실측 ~376 가능) / (b) 500줄 (안전 마진) | **(a)** 400줄 — §0.2 실측 기반 |
| Q7 | FU-1 `computeEffectiveValuation` 분리 [F6 신규] | (a) 본 FU에 포함 / (b) 별도 작업 | **(a)** 포함 — 순환 의존 사전 차단 |
| Q8 | DropdownMenu 도입 [UV-1·UV-O8 신규] | (a) shadcn dropdown-menu 설치 / (b) 자체 구현 | **(a)** — a11y 기본 제공 |
| Q9 | collapse hint UX [UV-2 신규] | (a) sonner 설치 toast / (b) Alert 영구 카드 / (c) hint 없음 | **(b)** — 의존성 0, 1회성 표시 |

---

## 12. 참조

- 선행 PR commit: `8d18f15`
- 선행 Plan: `docs/01-plan/estate-item-card-compaction.plan.md` (v4)
- 선행 UI Design: `docs/02-design/features/estate-item-card-compaction.ui.design.md` (v4)
- 선행 Visual: `docs/02-design/features/estate-item-card-compaction.ui.visual.md`
- 정책 메모리: [[components/calc/CLAUDE.md]] (800줄·tone·hideUnit) · [[feedback_useeffect_store_mirror_forbidden]] · [[feedback_browser_verify_with_playwright]] · [[mirror-pattern]] · [[print-only-css-toggle]] · [[feedback_11step_self_review_workflow]]
- 기존 컴포넌트:
  - `components/calc/PropertyValuationForm.tsx` (700줄 — FU-1 분리 대상)
  - `components/calc/inheritance/EstateCommonAttributesSection.tsx` (193줄 — FU-2 대상)
  - `components/calc/inheritance/StockValuationForm.tsx` (FU-2 영향)
  - `components/calc/inheritance/unlisted-stock-v2/UnlistedStockV2Card.tsx` (FU-2 V2 제외 분기)
