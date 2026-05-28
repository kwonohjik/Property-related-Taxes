# 상속재산 입력 카드 압축 (A안: 헤더 칩 + variant 분기 + 고급 토글) — 작업 계획서

> **Feature ID**: `estate-item-card-compaction`
> **작성일**: 2026-05-28 (v2 정정 — 1·3차 자가 검토 반영)
> **작성자**: Claude Code (Opus 4.7) — 사용자 승인 후 `inheritance-gift-tax-ui-senior` 위임 예정
> **대상 범위**: 상속·증여세 자산 입력 카드(`PropertyValuationForm.tsx`) — **7개 카테고리 전체**
> **참조 이슈**: 2026-05-28 사용자 스크린샷 — 「예금·펀드·채권·공제금 1」(financial 카테고리)
> **레이어 영향**: **UI 전용** — 엔진/스토어/Zod/API/Validation **변경 0건**

---

## 0. 정정 이력

| # | 일시 | 사유 | 변경 요지 |
|---|---|---|---|
| v1 | 2026-05-28 | 최초 작성 | financial 카테고리 단일 기준 |
| v2 | 2026-05-28 | **1차 자가 검토** (C1~C5·O1~O8·X1~X4·I1~I5) | 7 카테고리 variant 분기, EstimatedValue 칩화, fishing/deposit 분기, useEffect 금지 명시 |
| v3 | 2026-05-28 | **2차 자가 검토** (R1~R11) | 14지점 정정·`computeEffectiveValuation` 단일출처·chip-corporate 제거·deposit §22 hidden_expandable 정확화·accordion 모드 명시·storybook/hideUnit 보강 |
| v4 | 2026-05-28 | **Plan↔Design 통합 검토** (INT-1~11) | §22 3-state 순환·인라인 자동 펼침·§14 본체 단일·필드명 검증·Anchor #4 추가·§22② 주식 토글 제거 |

---

## 1. 배경 및 대상 카테고리 7종

### 1.1 카테고리별 현재 카드 구조 차이 (PropertyValuationForm.tsx 분석)

스크린샷의 financial은 **가장 단순한 카드 변형**임. 실제 7 카테고리는 구성이 다름:

| 카테고리 | 자산명칭 | 시가 | 감정가 | 공시·기준시가 | 임대보증금 | 저당권 | §14 자동공제 | 카드 높이 (현재) |
|---|---|---|---|---|---|---|---|---|
| `real_estate_land` | 주소검색 + 별칭 + Vworld 좌표 | ✓ | ✓ | **개별공시지가 + 자동조회** | – | ✓ | ✓ (조건부) | ~1100px |
| `real_estate_building` | 주소검색 + 별칭 + Vworld | ✓ | ✓ | **개별주택가격·기준시가** | ✓ | ✓ | ✓ (조건부) | ~1150px |
| `real_estate_apartment` | 주소검색 + 별칭 + Vworld | ✓ | ✓ | **공동주택 기준시가** | ✓ | ✓ | ✓ (조건부) | ~1100px |
| `cash` | 자유 입력 | "현금 금액" | – | – | – | – | – | ~500px (§22 미적용) |
| `financial` | 자유 입력 | "잔액 또는 시가" | – | – | – | – | – | ~700px (스크린샷) |
| `deposit` | 자유 입력 | – | – | – | **임대보증금** (자산본체) | – | ✓ (조건부) | ~750px (상속세 전용) |
| `other` | 자유 입력 | ✓ | ✓ | – | – | – | – | ~700px |

### 1.2 결론

**단일 2열 그리드 가정은 cash·financial·other 3종에만 유효**. 부동산 3종은 추가 4~6 필드, deposit은 자산본체가 보증금이라 별도 처리. → **3 variant 분기** 필수 (§5).

### 1.3 공통 (모든 카테고리에 직렬 배치된 5개 추가 섹션)

스크린샷의 7개 섹션 중 **하단 5개는 공통**:

```
├ EstimatedValuePreview (적용 단계 + 평가액)
├ 간주상속재산 분류 (insurance/trust/retirement) — 라디오 4
├ §22 금융재산공제 토글 — visibility.financialDeduction === "default"일 때만
├ ▼ hidden_expandable 펼침 (영농·가업·법인 사업무관)
└ HeirAllocationToggleSection — mode=inheritance + heirs 있을 때
```

→ A안 압축의 **주 타겟은 이 공통 5섹션**. 카테고리별 본체 입력은 variant 분기로 보존.

---

## 2. 목표 (수정)

1. **공통 5섹션 압축**: ~600px → ~120px (80% 감소)
2. **카테고리별 본체 입력은 보존**: 부동산 주소검색·기준시가·저당권 등 모든 필드 그대로
3. **엔진·API·Validation 변경 0건**
4. **현재 기능 손실 0건**, `computeEffectiveValuation` 호환
5. **testid 동결** (anchor 회귀 0)
6. **카테고리별 카드 높이 감소 (예상)**:
   - cash/financial/other: 700px → 200px (71% 감소) — 사용자 요청 충족
   - real_estate 3종: 1100px → 700px (36% 감소)
   - deposit: 750px → 250px (67% 감소)

---

## 3. After 레이아웃 — 3 Variant 명세

### 3.1 Variant SIMPLE (cash · financial · other) — 사용자 스크린샷 시나리오

기본 상태 (~200px):
```
┌──────────────────────────────────────────────────────────────┐
│ 🏛 예금·펀드·채권·공제금 1   ⓘ평가액 1,100,000,000  ❌ 삭제 │
│    [일반] [§22 ✓] [협의분할 ✓]                  [⚙️ 옵션]   │
├──────────────────────────────────────────────────────────────┤
│ [00 은행 예금          ]  [1,100,000,000              ] 원   │
│ §62·시행령 §19① 평가기준일 잔액                              │
└──────────────────────────────────────────────────────────────┘
```

cash 변형: §22 칩 미노출(미적용), `chip-estimated-value` 만 노출.

### 3.2 Variant REAL_ESTATE (land · building · apartment) — 부동산 3종

기본 상태 (~700px):
```
┌──────────────────────────────────────────────────────────────┐
│ 🏠 아파트·공동주택 1     ⓘ평가액 850,000,000     ❌ 삭제   │
│    [일반] [§22 ✗] [협의분할 ✓] [영농 §16⑤]      [⚙️ 옵션]   │
├──────────────────────────────────────────────────────────────┤
│ ── 소재지 ─────────────────────────────────────────────── │
│ [AddressSearch 위젯 — 기존 컴포넌트 그대로]                 │
│ [별칭: 강남 아파트                                       ]  │
├──────────────────────────────────────────────────────────────┤
│ ── 평가 (시가 → 감정가 → 기준시가 우선순위) ─────────────── │
│ [시가              ] [감정평가액         ]                  │
│ [StandardPriceInput — 기준시가 + 자동조회 위젯]             │
├──────────────────────────────────────────────────────────────┤
│ [임대보증금         ] [저당채권액         ]                 │
│ (§14 자동공제 토글은 ⚙️ 패널 또는 인라인 — 조건부 노출)     │
└──────────────────────────────────────────────────────────────┘
```

핵심: 본체 입력은 **기존 위젯 100% 보존**, 헤더만 칩화.

### 3.3 Variant DEPOSIT (전세보증금 반환채권 · 상속세 전용)

```
┌──────────────────────────────────────────────────────────────┐
│ 🔑 전세보증금 반환채권 1  ⓘ평가액 환산X ÷ 12%     ❌ 삭제  │
│    [일반] [§22 ✓] [협의분할 ✓]                  [⚙️ 옵션]   │
├──────────────────────────────────────────────────────────────┤
│ [별칭             ]  [임대보증금              ] 원          │
│ 환산가액 = 보증금 ÷ 12% · 채권 액면가                       │
└──────────────────────────────────────────────────────────────┘
```

### 3.4 ⚙️ 펼침 (3 variant 공통)

⚙️ 펼침 시 노출되는 항목 (Design D-O1·D-O2 정합 [INT-5·INT-7]):

```
── ⚙️ 고급 옵션 ─────────────────────────── × 닫기 ──
EstimatedValuePreview 상세 카드 (적용 우선순위 표 전체)
hidden_expandable 섹션 (영농·가업·§22 — 칩 미노출 대안):
   └ visibility=hidden_expandable인 경우만 ⚙️에서 노출
   └ 칩으로 노출되는 항목은 ⚙️에서 미노출 (단일 인스턴스)
저당채무 §14 자동공제 보조 입력 (본 토글은 본체 위치):
   └ securedClaimIsFinancialDebt 토글
   └ 채권자명 (선택)
```

**[INT-5 정정]** §14 자동공제 토글 자체는 **본체(Body) 내부 단일 위치**. ⚙️에는 보조 입력(financial-debt·creditor-name)만.

**[INT-7 정정]** §22② 최대주주 토글은 주식 카드 전용 → 본 PR ⚙️ 패널에서 제거.

분류·분할·영농·가업은 ⚙️에 노출되지 않음(헤더 칩의 인라인 펼침에서 단일 입력).

### 3.5 칩 직접 클릭 (인라인 펼침)

- **분류 칩** 클릭: 라디오 4 패널이 칩 직하로 펼침
- **협의분할 칩** 클릭: 분배 칩 + input이 펼침
- **§22 칩** 클릭: **3-state 순환** (`undefined` → `true` → `false` → `undefined`) [INT-1]
  - 실제 필드: `EstateItem.isFinancialAssetForDeduction`
  - 사용자 지정 상태(true/false)에는 칩에 violet 외곽 추가 (기본값과 다름 표시) [INT-4]
- **`chip-estimated-value`** (NEW): 클릭 불가, hover 시 산식 tooltip (예: "시가 1,100,000,000 — §60 시가우선")

---

## 4. 칩 명세 (정정)

### 4.1 칩 ID·표시 조건·동작

| ID | 표시 조건 | 라벨 | tone (CLAUDE.md 매핑 유지) | 클릭 동작 |
|---|---|---|---|---|
| `chip-estimated-value` | 항상 (NEW · I2) | `ⓘ 평가액 N,NNN,NNN` 또는 미입력 시 `평가액 미입력` | gray-100 (정보) | hover tooltip만 |
| `chip-classification` | mode=inheritance | `[일반]` / `[보험금 §8]` / `[신탁 §9]` / `[퇴직금 §10]` | violet (일반) / amber (간주상속재산) | 인라인 펼침 |
| `chip-section22` | mode=inheritance AND `visibility.financialDeduction ∈ {default, hidden_expandable}` (R5 정정 — cash는 `hidden_permanent`이므로 미노출, financial은 `default`, deposit/other는 `hidden_expandable`이므로 노출) | `[§22 ✓]` / `[§22 ✗]` | emerald (ON) / gray (OFF) | 즉시 토글 |
| `chip-heir-allocation` | mode=inheritance AND `heirs.length > 0` | `[법정분할]` / `[협의분할 ✓]` | sky (ON) / gray (OFF) | 인라인 펼침 |
| `chip-farming` | `visibility.farming ∈ {default, hidden_expandable}` | `[영농 §16⑤]` | violet (CLAUDE.md 거주·자격) | 인라인 펼침 |
| `chip-family-business` | `visibility.familyBusiness ∈ {default, hidden_expandable}` | `[가업 §15⑤]` | violet (자격) | 인라인 펼침 |
| `chip-secured-claim-14` | mode=inheritance AND `deductSecuredClaimAsDebt === true` | `[§14 담보공제]` | amber | 즉시 토글 (또는 ⚙️ 펼침) |

**R3 정정**: `chip-corporate-non-business`·`chip-major-shareholder`는 본 PR 범위 외(주식 카드) → 표에서 제거. ⚙️ 패널에서도 비노출.

**모순 X4 정정**: §22는 emerald(CLAUDE.md "양도시점" 정의)와 의미 충돌이 있으나, **§22 = 금융재산 공제(긍정 상태)** → emerald 유지 (긍정·승인 의미로 재해석). 영농·가업은 violet(자격 정보) 매핑 정확.

### 4.2 모바일 wrap 처리 (O5 정정)

- 헤더 1행 폭 부족 시 칩만 wrap, 액션 버튼은 우측 고정
- `flex flex-wrap gap-1.5` + 우선순위:
  1. `chip-estimated-value` (항상 1번째)
  2. `chip-classification`
  3. `chip-section22`
  4. `chip-heir-allocation`
  5. `chip-farming` / `chip-family-business`
  6. `chip-secured-claim-14`

---

## 5. 컴포넌트 구조 (variant 분기 명시 · C1·C2·C5 정정)

### 5.1 신규 파일

```
components/calc/inheritance/estate-card/
├── EstateItemCardShell.tsx              # 외곽 컨테이너 + 헤더 + ⚙️ 패널 컴포지션
├── EstateItemHeader.tsx                 # 헤더 행 (아이콘 + 라벨 + 칩 + 액션 버튼)
├── EstateItemHeaderChips.tsx            # 칩 8종 도출·렌더 (resolveAssetToggleVisibility 사용)
├── EstateItemAdvancedPanel.tsx          # ⚙️ 펼침 패널 (기존 섹션 컴포지션)
├── EstateChipInlineExpand.tsx           # 칩 직접 클릭 시 인라인 펼침 패널
├── variants/
│   ├── EstateBodySimple.tsx             # cash/financial/other
│   ├── EstateBodyRealEstate.tsx         # land/building/apartment (AddressSearch + StandardPriceInput + mortgage)
│   └── EstateBodyDeposit.tsx            # deposit (보증금만)
└── chip-config.ts                       # 칩 라벨·tone·visibility 매핑 + tooltip 텍스트
```

총 8개 신규 파일, 각 200줄 이하.

### 5.2 수정 파일

- `components/calc/PropertyValuationForm.tsx` — 단일 자산 카드 렌더 부분(:211~571)을 `<EstateItemCardShell>` 호출로 대체. 폼 컨테이너·자산 추가·삭제는 무변경. **774줄 → ~450줄 예상**.

### 5.3 재사용 (변경 없음)

| 컴포넌트 | 재사용 위치 |
|---|---|
| `AddressSearch` | EstateBodyRealEstate |
| `StandardPriceInput` | EstateBodyRealEstate |
| `EstimatedValuePreview` | chip-estimated-value 도출용 (헤더 칩) — **컴포넌트 직접 렌더 아님, 값만 도출** |
| `DeemedCategorySection` | ⚙️ 패널 또는 chip 펼침 |
| `FinancialDeductionChip` | ⚙️ 패널 또는 chip 펼침 |
| `HeirAllocationToggleSection` | ⚙️ 패널 또는 chip 펼침 |
| `FarmingCategorySection` | ⚙️ 패널 (visibility default 시) |
| `FamilyBusinessCategorySection` | ⚙️ 패널 (visibility default 시) |
| `ToggleCard` (§14 자동공제) | EstateBodyRealEstate/Deposit + ⚙️ |
| `CurrencyInput` / `DecimalInput` | 본체 입력 |
| `resolveAssetToggleVisibility` | EstateItemHeaderChips·EstateItemAdvancedPanel |
| `computeEffectiveValuation` | chip-estimated-value 값 도출 (C4) |

### 5.4 EstimatedValuePreview 처리 (O1·I2·R2 정정)

기존 `<EstimatedValuePreview item={item} />` 컴포넌트는 **유지하되 렌더 위치 변경**:

- (a) **기본**: 헤더의 `chip-estimated-value`에 평가액 + 적용 단계(시가/감정가/기준시가) 표시
- (b) **상세**: ⚙️ 펼침 시 ⚙️ 최상단에 기존 `EstimatedValuePreview` 카드 그대로 렌더 (적용 우선순위 표 전체 보기)

**R2 정정 — 산식 단일출처**: 칩 표시값과 ⚙️ 내부 카드 표시값이 다르면 사용자 혼란 → 두 위치 모두 **`computeEffectiveValuation(item)` 단일 함수** 사용. EstimatedValuePreview 내부도 동일 함수 import 강제 ([[single-source-engine-helper]] 정책). 산식 차이 발견 시 Anchor #4 신설.

→ 정보 손실 0, 시각적 압축 달성, 단일 산식.

### 5.5 fishing 분기 처리 (O3 정정)

`EstateBodyRealEstate` 내부에서 `farmingCategory ∈ {fishing_vessel, fishing_right}` 분기:
- AddressSearch 라벨: "선적지·어장 연안 검색"
- 좌표는 `fishingAnchorLatLng`에 저장 (기존 로직 :271~280 유지)

### 5.6 standardPricePerSqm local state 보존 (O6 정정)

`EstateBodyRealEstate`가 ⚙️ 열림/닫힘과 무관하게 항상 마운트되도록 보장. ⚙️는 ⚙️ 패널만 toggle. → local state 손실 없음.

### 5.7 카테고리 변경 시나리오 (O2 정정)

- 카드 추가 후 카테고리 변경: **현재 코드 미지원** → 본 PR도 미지원 (자산 삭제 후 재추가)
- 카테고리 사전선택 UI(`pendingDeemed` :630): 카드 외부 폼 컨트롤, **본 PR 범위 외**

---

## 6. 동기화 지점 (CLAUDE.md ⑤ UI 위젯 단일)

### 6.1 변경 없음 (안전 — 14 지점 중 13개) [R1 정정]

CLAUDE.md 루트 14 지점 기준:
- ①폼상태 · ②initial · ③normalize · ④API변환 · ⑥사이드바 · ⑦결과카드 · ⑧validation
- ⑨Zod main · ⑩Zod 컴패니언+refines · ⑪자산-수준 acquisitionDate fallback · ⑫Zod 입력객체 · ⑬API body spread · ⑭Route handler 매핑

### 6.2 변경 (⑤ UI 위젯 단일)

- `PropertyValuationForm.tsx` 카드 렌더 구조
- 신규 8 컴포넌트 추가
- TypeScript 타입 변경 0건 → ⑫⑬⑭ 침묵 strip 위험 0

---

## 7. testid 동결 (anchor 회귀 0)

기존 e2e/anchor가 의존하는 testid 보존:

```tsx
// 라디오·토글 (DeemedCategorySection·FinancialDeductionChip 내부 — 위치만 ⚙️ 안으로 이동)
data-testid="estate-item-deemed-category-{none|insurance|trust|retirement}-{item.id}"
data-testid="estate-item-section22-toggle-{item.id}"
data-testid="estate-item-heir-allocation-toggle-{item.id}"
data-testid="estate-item-heir-allocation-amount-{heirId}-{item.id}"
data-testid="estate-item-secured-claim-toggle-{item.id}"

// 신규 (칩)
data-testid="estate-chip-{chipId}-{item.id}"
data-testid="estate-advanced-panel-toggle-{item.id}"
data-testid="estate-advanced-panel-{item.id}"
```

기존 testid에 의존하는 anchor 파일 grep 결과:
- `__tests__/inheritance/asset-toggle-visibility.test.tsx` (38건)
- `__tests__/inheritance/debt-allocation-input.test.tsx`
- `e2e/section22-toggle.spec.ts`

→ 칩 펼침 후 내부 컴포넌트는 동일 위치(`getBy`)로 접근 가능해야 함. **Anchor #3** 신설 (§8).

---

## 8. Pre-Do Anchor — 3건 (디자인 환류 도구) [[pre-do-anchor-verification]]

### Anchor #1 — 헤더 칩 a11y + 인라인 펼침
- 분류 칩 클릭 → 라디오 4 인라인 렌더, `aria-expanded` 토글
- 키보드 Enter/Space 동작
- variant SIMPLE / REAL_ESTATE / DEPOSIT 3종 각각 칩 노출 검증

### Anchor #2 — 칩 ↔ ⚙️ 패널 상태 일관성
- ⚙️ 안에서 분류=보험금 변경 → 칩 라벨 `[보험금 §8]` 갱신
- §22 토글 OFF → 칩 `[§22 ✗]` 갱신
- 협의분할 ON → ⚙️ 자동 펼침 동작 (§9 X1 정정 — useEffect 아닌 onChange 콜백 사용)

### Anchor #3 — testid 동결·기존 회귀
- 기존 `__tests__/inheritance/asset-toggle-visibility.test.tsx` 통과 (변경 0)
- e2e `section22-toggle.spec.ts` 통과 (D2-C3: 실제 grep 시 `estate-item-*` testid 사용 0건 → 본 anchor는 신규 testid 안정성 anchor)
- `debt-allocation-input.test.tsx` 통과

### Anchor #4 — countNonDefaultOptions 단위 검증 [INT-6 · D-I3]
- 모든 필드 기본값 → 0
- `deemedCategory=insurance` → 1
- `heirAllocations=[]` → 2 (분류 + 분할)
- `heirAllocations=[{...}]` → 2 (배열 길이와 무관)
- `isFinancialAssetForDeduction=true` AND defaultEligible=true → 0 (기본값과 동일)
- `isFinancialAssetForDeduction=false` AND defaultEligible=true → 1 (기본값과 다름)
- 모든 필드 비기본값 → 6

---

## 9. 위험·완화 (정정)

| 위험 | 영향 | 완화 |
|---|---|---|
| **X1 정정 [INT-2] — useEffect 미러링** | "협의분할 ON 시 ⚙️ 자동 펼침"이 [[useEffect-store-mirror-forbidden]] 위반 | **인라인 자동 펼침으로 변경**: 협의분할 칩 클릭으로 ON 변경 시 동일 칩 패널이 펼친 상태 유지. ⚙️ 자동 펼침 호출 0건 → useEffect 정책 무관 |
| **X2 정정 — ⚙️ 안 중복 카드** | default 토글이 ⚙️ 내부에서 시각 충돌 | ⚙️ 패널은 `bg-slate-50/40 p-4` 외곽만, 내부 default 토글은 기존 tone 카드 유지(layout만 spacing 축소) |
| §22 칩 발견성 | 사용자가 §22 미적용 사실 놓침 | 칩 hover tooltip + cash는 칩 자체 미노출(O7) |
| 협의분할 입력 누락 | ⚙️ 미펼침 상태에서 ON 후 잊음 | onChange로 ⚙️ 자동 펼침 (X1 정정) |
| 칩 5~8개 wrap | 모바일 헤더 2~3행 | flex-wrap + 우선순위 정렬 (O5·§4.2) |
| 인쇄 PDF 미반영 | ⚙️ 접힌 상태로 출력 | [[print-only-css-toggle]] `print:block` |
| 부동산 카드 36% 감소 불충분 | 사용자 기대(financial 71%)와 차이 | 본체 입력은 기존 위젯 보존이 우선, ⚙️ 압축은 공통 |
| AddressSearch local state | StandardPriceInput `pricePerSqm` unmount 시 손실 | 본체는 항상 마운트(§5.6) |
| testid 변경 시 회귀 | 기존 anchor 깨짐 | §7 동결 + Anchor #3 |
| EstimatedValuePreview 정보 손실 | 적용 우선순위 표 사라짐 | §5.4: 헤더 칩 + ⚙️ 양쪽 노출 |

---

## 10. Phase 분할 (정정 — 8 Phase)

| Phase | 작업 | 산출물 | 시간 |
|---|---|---|---|
| A | chip-config.ts + EstateItemHeaderChips.tsx (칩 8종 도출·렌더) | 2 파일 | 1h |
| B | EstateBodySimple.tsx (cash/financial/other) | 1 파일 | 0.5h |
| C | EstateBodyRealEstate.tsx (부동산 3종) — 기존 입력 위젯 컴포지션 | 1 파일 | 1.5h |
| D | EstateBodyDeposit.tsx (전세보증금) | 1 파일 | 0.3h |
| E | EstateItemAdvancedPanel.tsx (⚙️ 패널 + EstimatedValuePreview 재배치 + §14 토글) | 1 파일 | 1.5h |
| F | EstateItemHeader.tsx + EstateItemCardShell.tsx + EstateChipInlineExpand.tsx 통합 | 3 파일 | 1h |
| G | PropertyValuationForm.tsx 단일 카드 영역을 EstateItemCardShell 호출로 교체 | 1 수정 | 1h |
| H | Anchor #1·#2·#3 작성·실행 + e2e 1건 | 4 파일 | 1.5h |
| **총** | | | **8.3h** |

각 Phase 별도 커밋 ([[pdf-case-replica-workflow]] 변형).

---

## 11. 자가 검토 — 12단계 워크플로 (정정 — I5)

[[feedback_11step_self_review_workflow]] 정책을 12단계 사용자 요구로 확장:

| # | 단계 | 점검 항목 |
|---|---|---|
| 1 | 케이스 매트릭스 | variant 3종 × 카테고리 7 × 분류 4 × §22 2 × 협의분할 2 = 168조합 |
| 2 | a11y | 칩 키보드·aria·screen reader |
| 3 | 인쇄/PDF | print:block + ⚙️ 자동 펼침 |
| 4 | 회귀 | 기존 38 anchor + e2e 동결 |
| 5 | 800줄 정책 | 신규 8 파일 모두 300줄 이하 |
| 6 | 정책 매트릭스 | mirror-pattern·single-source·X1 정정 검증 |
| 7 | tone 매핑 | CLAUDE.md tone 정의와 충돌 0 (X4 정정) |
| 8 | variant 분기 | SIMPLE / REAL_ESTATE / DEPOSIT 각각 anchor |
| 9 | EstimatedValue 정보 | 헤더 칩 + ⚙️ 양쪽 노출 (O1·I2) |
| 10 | fishing 분기 | farmingCategory 어선·어업권 (O3) |
| 11 | testid grep | 변경된 testid 0건 (§7) |
| 12 | 본 PR 범위 확정 | PropertyValuationForm 단독 (§14 Q4) |

---

## 12. Definition of Done

- [ ] §10 Phase A~H 모두 커밋
- [ ] Anchor #1·#2·#3 + e2e 1건 통과
- [ ] 기존 전체 회귀 (`npm test`) 0 실패 — 5410 테스트 유지
- [ ] `npx tsc --noEmit` 0건 · `npm run lint` 0건
- [ ] §7 testid 동결 self-grep — 변경된 testid 0건
- [ ] variant 3종 각각 브라우저 e2e (시나리오: financial 추가 / 아파트 추가 / deposit 추가)
- [ ] PDF 출력 — ⚙️ 자동 펼침 + 칩 인쇄 표시
- [ ] `ui-engine-sync-checker` 결과 첨부 — ① ~ ⑭ 변경 없음 확인

---

## 12.5 추가 정책·세부사항 (R6~R11)

### R6 — Storybook / Visual Regression
- 현재 PropertyValuationForm Storybook 스토리: **없음** (grep 확인 후 명시. 있으면 Phase G에 스토리 갱신 추가)
- Chromatic·visual regression 미사용 → 시각 회귀는 e2e 스크린샷 1건으로 갈음

### R7 — `hideUnit` prop 활용
- §3.1 SIMPLE variant의 금액 input은 `<CurrencyInput hideUnit suffix="원" />` 사용
- FieldCard 외부에서 사용하므로 hideUnit 필수 ([[components/calc/CLAUDE.md]] 명시)

### R8 — SelectOnFocusProvider 호환
- 신규 input·textarea는 별도 `onFocus` 추가 불필요 (전역 Provider 자동 적용 — 사용자 글로벌 규칙)

### R9 — fishing 자산의 §22 칩
- `farmingCategory ∈ {fishing_vessel, fishing_right}`는 `cat ∈ {real_estate_*, other}`일 수 있음
- §22 적용 여부는 `cat` 기준이지 farmingCategory 기준 아님 → 칩 노출 조건 변경 없음 (R5 정책 그대로)

### R10 — Accordion 동작 (단일 펼침)
- 칩 펼침은 **accordion 모드**: 한 칩 펼침 시 다른 펼친 칩 자동 닫힘 (단, ⚙️ 패널은 별도 — 칩과 동시 펼침 가능)
- 이유: 화면 압축 목적 유지 + 헤더 직하 패널 중첩 방지

### R11 — ⚙️ 버튼 라벨
- `[⚙️ 옵션]` 기본 표시
- 사용자가 ⚙️ 안에서 1개 이상 옵션을 비기본값(예: 분류=보험금, §22=OFF)으로 변경 시 `[⚙️ 옵션 (N)]` 형태로 변경 개수 배지
- N 계산은 `chip-config.ts` 단일 헬퍼 (`countNonDefaultOptions(item)`)

### R-Q5 — 부동산 본체 압축 결정
- Q5(a) "본체 보존" 채택 (§14)
- §2 목표 6의 부동산 36% 감소는 **본체 보존 + ⚙️ 압축 + EstimatedValuePreview 칩화**만으로 달성
- 본체를 추가로 압축하면 정확성·기존 UX 손실 위험 (예: AddressSearch + StandardPriceInput 좌표 동기화 흐름)

---

## 13. 후속 작업 (별도 PR)

1. **Phase 2 — 주식 카드 적용**: `EstateCommonAttributesSection`을 동일 칩+⚙️ 패턴
2. **Phase 3 — 자산 카드 collapse**: 자산 5개 이상 시 카드 자체 접기 (I3)
3. **Phase 4 — 카테고리 변경 지원**: 추가 후 카테고리 변경 가능 UI (O2)

---

## 14. 결정 필요 사항

| # | 항목 | 옵션 | 권장 |
|---|---|---|---|
| Q1 | 칩 클릭 동작 분기 | (a) 모두 펼침 / (b) 모두 토글 / (c) **칩별 분기** | **(c)** §3.5 |
| Q2 | ⚙️ 펼침 상태 유지 | (a) 자산 카드별 / (b) 폼 전역 | **(a)** |
| Q3 | 협의분할 ON 시 ⚙️ 자동 펼침 | (a) 자동 / (b) 토스트 / (c) 수동 | **(a)** §9 X1 정정 |
| Q4 | 본 PR 범위 | (a) PropertyValuationForm만 / (b) +주식 카드 | **(a)** |
| Q5 | 부동산 본체 입력 압축 | (a) 본체 보존 / (b) 본체도 2열 그리드 압축 | **(a)** §3.2 |

---

## 15. 참조

- [[components/calc/CLAUDE.md]] · [[feedback_pre_anchor_verification]] · [[print-only-css-toggle]] · [[feedback_11step_self_review_workflow]] · [[mirror-pattern]] · [[feedback_useeffect_store_mirror_forbidden]]
- 코드 근거: `components/calc/PropertyValuationForm.tsx:43,61,151,211,498,524,529,562,624`
- 사용자 스크린샷: 2026-05-28 financial 카드
