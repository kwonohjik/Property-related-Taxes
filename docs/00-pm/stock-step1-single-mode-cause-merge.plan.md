# 주식 양도세 Step 1 — single 모드 취득일·취득원인 통합

> **세목**: 주식 양도소득세 (stock-transfer)
> **대상**: Step 1 single 모드 (split 모드는 영향 없음)
> **트리거**: 사용자 요청 (2026-05-18) — "취득원인은 취득일의 속성이므로 두 섹션 통합이 논리적"
> **상태**: ✅ **구현 완료** (커밋 244fcde8 · 2026-05-18) — 2026-08-04 코드 실측 · 2026-08-05 인용 PR·커밋 재검증(종전 헤더는 stale이었음).
> ~~종전 표기: Plan v1~~
> **선행 PR**: 커밋 `2a4cfc9` (분할 매수·분할 양도 + 산정방법 3종 + 동적 섹션 번호)
> **참조 디자인**: `docs/02-design/features/stock-split-lots.ui.design.md` v1.2

## 1. 배경

### 1-1. 사용자 보고

[Image #18] single 모드에서 섹션 3(양도·취득 일자·주식수)과 섹션 4(취득원인)이 분리됨. 사용자 의견:
> "취득일자별 취득원인이 다 다를 수도 있는데 두 섹션을 통합하여 취득일자별로 취득원인을 선택하여 입력하는게 논리적으로 타당할 것 같은데"

### 1-2. 현황 진단

| 항목 | single 모드 | split 모드 |
|---|---|---|
| 취득일 입력 | 섹션 3 폼-전역 `acquisitionDate` | 섹션 3 lot 내부 `lot.acquisitionDate` |
| 취득원인 입력 | **섹션 4 독립** (`acquisitionCause`) | 섹션 3 **lot 내부 통합** (`lot.acquisitionCause`) |
| 보조 일자 | 섹션 4 안에서 `acquisitionCause` 분기 | lot 내부 cause별 조건부 노출 |

**불일치**: single 모드만 cause가 별도 섹션 — split과 UX 패턴 충돌.

### 1-3. 통합 근거

1. **데이터 의존성**: 취득원인은 취득일의 속성. §104② lot별 기산점 분기와 동일 논리
2. **split 모드와 일관성**: lot 1개인 단순 케이스로 통일
3. **인지 부하 감소**: 섹션 1개 ↓, 관련 필드 인접 배치
4. **store 변경 0**: `acquisitionCause`·`decedentAcquisitionDate`·`preMergerAcquisitionDate` 필드 동일

---

## 2. 요구사항

### 2-A. UI 통합 구조

```
┌─ 3. 양도·취득 정보 ────────────────────────────────┐
│ [모드 토글: 단일·분할]                              │
│                                                     │
│ ── single 모드 ──                                   │
│ ┌─ ⓐ 취득 정보 (amber tone, 색상 카드+섹션번호) ┐    │
│ │ * 취득일 [____]                              │    │
│ │ * 취득원인 (RadioCardGroup tone=amber):       │    │
│ │   [● 매매] [○ 상속] [○ 증여] [○ 합병·분할]  │    │
│ │                                              │    │
│ │ ▼ 보조 일자 (조건부 nested 카드)              │    │
│ │   상속 시: * 피상속인 취득일 [____] (§104②1) │    │
│ │   합병·분할 시: * 종전 주식 취득일 [____] (§104②3) │
│ │                                              │    │
│ │ ⓘ 단기 30% 안내 (기존 AcquisitionCauseBlock 보존) │
│ └──────────────────────────────────────────────┘    │
│                                                     │
│ ┌─ ⓑ 양도 정보 (emerald tone) ─────────────┐        │
│ │ * 양도일 [____]  * 양도 주식수 [____]     │        │
│ └────────────────────────────────────────────┘      │
│                                                     │
│ * 발행주식 총수 [____] (sky 또는 outside)            │
│                                                     │
│ ── split 모드 ──                                    │
│ <SplitLotsBlock /> (변경 없음)                      │
└─────────────────────────────────────────────────────┘

(섹션 4 "취득원인" 삭제 — Step1 sections.useMemo에서 제거)

**1주당 취득가액**: 본 PR에서 Step1 이동 없음. Step2에서 acquisitionMode 분기와
함께 유지 (모순 정정 v1.1).

### 2-B. 섹션 번호 자동 조정

동적 번호 메커니즘(Plan v2.2 §8)이 자동 처리:

| lotsMode | 기타자산 | Before (cause 별도) | **After (cause 통합)** |
|---|---|---|---|
| single | OFF | 5 (시장·회사·일자·**cause**·대주주) | **4** (시장·회사·**일자+cause**·대주주) |
| single | ON | 6 | **5** |
| split | OFF | 4 (cause 자동 숨김 — 영향 없음) | 4 |
| split | ON | 5 | 5 |

### 2-C. 1주당 취득가액 위치

현재 `perShareAcquisitionPrice`는 **Step2** (취득가액 섹션). 본 PR에서는 **Step1으로 이동하지 않음** — Step2의 acquisitionMode 분기(actual/estimated/face_value/sale_case/appraisal)와 결합되어 있으므로 Step2 유지.

### 2-D. AcquisitionCauseBlock.tsx 처리 (v1.1 정정)

**grep 결과 (2026-05-18)**: Step1.tsx 1곳만 사용 → **즉시 삭제 가능**

| 옵션 | 설명 | 결정 |
|---|---|---|
| A. 즉시 삭제 | grep 결과 Step1 외 참조 없음 → 안전 | ✅ **채택** |
| B. deprecated 주석 보존 | 향후 다른 곳에서 사용 가능성 | ❌ YAGNI — 필요 시 git 히스토리에서 복원 |
| C. inline 리팩토링 | 컴포넌트 자체를 inline 패턴으로 | ❌ split과 중복 |

**결정**: A — `AcquisitionInfoBlock.tsx` 신규 작성 + `AcquisitionCauseBlock.tsx` **삭제**

### 2-E. AcquisitionInfoBlock.tsx 신규 컴포넌트 명세 (v1.2 보강)

**중요 (v1.2 정정)**: 본 PR은 **단순 cause 이동이 아니라 "취득일 + 취득원인 + 보조일자" 통합**. 기존 Step1.tsx의 폼-전역 `acquisitionDate` FieldCard도 이 컴포넌트로 흡수.

```tsx
interface AcquisitionInfoBlockProps {
  form: Pick<
    StockTransferFormData,
    | "acquisitionDate"                   // 신규 흡수 (기존 Step1 직접 사용)
    | "acquisitionCause"
    | "decedentAcquisitionDate"
    | "preMergerAcquisitionDate"
  >;
  onChange: (patch: Partial<StockTransferFormData>) => void;
}
```

요구사항:
- amber tone 색상 카드 + 섹션 번호 패턴 (CLAUDE.md `feedback_section_card_numbering`)
- **DEFAULT cause = "purchase"** — 신규 사용자 첫 진입 시 라디오 기본 선택
- **취득일(DateInput) — 폼-전역 `acquisitionDate` 직접 입력** (기존 Step1 별도 FieldCard에서 이동)
- 취득원인(RadioCardGroup, **layout="inline"**, tone="amber") 인라인 배치
- **모바일 호환성**: 4 옵션(매매·상속·증여·합병·분할) — layout="inline"이 모바일에서 폭 부족 시 flex-wrap. RadioCardGroup 컴포넌트가 자체 처리. 검증 후 필요 시 layout="stack"으로 변경
- 취득원인 선택값에 따라 보조 일자 조건부 노출 (nested 카드 — `bg-amber-100/60 border-amber-300 ml-4 pl-3` 들여쓰기 시각 표현):
  - `inheritance` → 피상속인 취득일 (필수) — nested 카드
  - `merger_split` → 종전 주식 취득일 (필수) — nested 카드
  - `purchase` → 보조 일자 없음
  - `gift` → 보조 일자 없음 + **안내 카드 보존** ("수증일 = 취득일부터 기산, §97의2 이월과세는 주식에 미적용")
- 보조 일자는 hint에 법령 근거 명시 (§104②1·§104②3)
- gift 선택 시 **"취득일" 라벨이 "수증일"로 자동 변경** (split 모드와 동일 패턴)
- **기존 안내 카드 3종 보존** (사용자 학습 가치):
  1. **단기 30% 안내** ("§104② — 취득원인에 따라 단기 보유기간 기산점이 달라집니다") — 컴포넌트 상단 hint
  2. **inheritance 의제취득일 안내** ("1985.12.31. 이전 취득 주식: 의제취득일 1986.1.1. 자동 적용 (시행령 §162①)") — inheritance nested 카드 하단
  3. **gift 안내** ("수증일(= 취득일)부터 기산. §97의2 이월과세는 주식에 미적용") — gift 선택 시 안내 카드

### 2-E-1. 컴포넌트 구조 (시각화)

```
┌─ AcquisitionInfoBlock (amber tone) ─────────────────┐
│ 📅 취득일 [____]   📋 취득원인 [● 매매] [○ 상속]... │
│ ⓘ §104② — 취득원인에 따라 단기 보유기간 기산점이...   │
│                                                     │
│ ┌─ (inheritance 시) nested amber-100 ─────────┐    │
│ │ * 피상속인 취득일 [____] (§104②1)            │    │
│ │ ⓘ 1985.12.31. 이전 → 의제취득일 1986.1.1.    │    │
│ └──────────────────────────────────────────────┘    │
│                                                     │
│ ┌─ (gift 시) nested amber-100 안내만 ─────────┐    │
│ │ ⓘ 수증일 = 취득일. §97의2 이월과세 미적용     │    │
│ └──────────────────────────────────────────────┘    │
│                                                     │
│ ┌─ (merger_split 시) nested amber-100 ────────┐    │
│ │ * 종전 주식 취득일 [____] (§104②3)           │    │
│ └──────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────┘
```

### 2-F. Step1 마이그레이션 wrapper 영향 (v1.1 신규)

기존 `handleLotsModeToggle`(Step1.tsx)이 single↔split 전환 시 다음 필드를 마이그레이션:
- `acquisitionCause` · `decedentAcquisitionDate` · `preMergerAcquisitionDate`

본 PR은 **이 wrapper에 변경 없음** — single 모드에서 폼-전역 필드를 그대로 유지하기 때문. 통합은 UI 표시 레벨만 변경. 마이그레이션 로직은 그대로 작동.

**회귀 가드**: split → single 전환 시 첫 lot의 cause·보조일자가 폼-전역으로 복원되어 `AcquisitionInfoBlock`에 정확히 표시되어야 함. DoD 항목 추가.

### 2-G. TransferInfoBlock.tsx (선택적 분리)

option A: 양도일·양도 주식수를 별도 컴포넌트(emerald tone)
option B: Step1 inline (분리 안 함)

**결정**: option B — Step1에서 단순 div + emerald tone 카드. 별도 컴포넌트로 분리할 만큼 복잡하지 않음.

---

## 3. 영향 분석 (14개 동기화 지점)

| # | 지점 | 변경 |
|---|---|---|
| ① | FormData 타입 | **변경 없음** (필드 그대로) |
| ② | initial | **변경 없음** |
| ③ | normalize | **변경 없음** |
| ④ | API 변환 | **변경 없음** |
| ⑤ | **UI 위젯** | `AcquisitionInfoBlock.tsx` 신규 + Step1 sections 갱신 (cause 항목 제거) |
| ⑥ | 사이드바 | **변경 없음** |
| ⑦ | 결과 카드 | **변경 없음** |
| ⑧ | Validation | **변경 없음** (필드 동일) |
| ⑨ | Zod enum | **변경 없음** |
| ⑩ | Zod refines | **변경 없음** |
| ⑪ | acquisitionDate fallback | **변경 없음** |
| ⑫ | Zod 입력 객체 | **변경 없음** |
| ⑬ | body spread | **변경 없음** |
| ⑭ | Route handler | **변경 없음** |

**변경 지점**: ⑤만. **위험도 매우 낮음**.

---

## 4. 작업 분해

1. **Plan 확정**
2. **Step1.tsx 의존성 확인** — `AcquisitionCauseBlock` 외부 참조 grep
3. **`AcquisitionInfoBlock.tsx` 신규 작성** (~150줄, 800줄 정책)
   - amber tone 카드
   - 취득일 DateInput + 취득원인 RadioCardGroup inline
   - cause === inheritance/merger_split 시 보조 일자 조건부 노출
   - gift 시 라벨 "수증일"
4. **Step1.tsx 정리 (v1.2 보강)**
   - sections useMemo에서 `cause` 항목 삭제 (single 모드 cause 섹션 폐기)
   - `dates` 섹션 내부 single 모드 grid 레이아웃 **재구성**:
     - Before: `grid-cols-2` 4 FieldCard (취득일·양도일·양도주식수·발행주식총수)
     - After: `AcquisitionInfoBlock` (취득일 흡수, full-width amber 카드)
             + `grid-cols-2` 양도 정보 (emerald 카드: 양도일 + 양도주식수)
             + 발행주식총수 (full-width)
   - import 정리 (`AcquisitionCauseBlock` import 제거 + `AcquisitionInfoBlock` import 추가)
5. **`AcquisitionCauseBlock.tsx` 파일 삭제** (grep 검증 후 안전)
6. **타입체크 + 회귀 테스트** — `npx tsc --noEmit` + `npx vitest run`
7. **브라우저 수동 확인** (사용자) — 4가지 cause 분기 + 보조 일자 표시
8. **Commit + Push**

---

## 5. 케이스 매트릭스 (UI 자체)

| # | cause | 보조 일자 노출 | 라벨 |
|---|---|---|---|
| U-1 | purchase | 없음 | "취득일" |
| U-2 | inheritance | 피상속인 취득일 | "취득일" |
| U-3 | gift | 없음 | "수증일" (라벨 변경) |
| U-4 | merger_split | 종전 주식 취득일 | "취득일" |
| U-5 | cause 변경 (예: inheritance → purchase) | 보조 일자 입력값 보존 (store 유지) | — |

---

## 6. 정책 적용

| 정책 메모리 | 적용 |
|---|---|
| `feedback_section_card_numbering` | amber tone 카드 + 섹션 번호 패턴 |
| `feedback_toggle_card_visibility` | RadioCardGroup OFF/ON 모두 tone 유지 |
| `feedback_no_silent_apportion_fallback` | cause 변경 시 보조 일자 자동 채움 금지 (validate에서 이미 차단) |
| `feedback_useeffect_store_mirror_forbidden` | useEffect 없음. 모든 변경은 onChange 직접 patch |
| `feedback_select_on_focus` | DateInput·CurrencyInput 자동 적용 |

---

## 7. 위험 / 후속

- **AcquisitionCauseBlock 폐기 여부**: grep 결과에 따라 결정. 다른 곳에서 사용 시 inline 패턴으로 재작성 또는 보존
- **시각 밀도 증가**: 취득 영역(amber)에 5필드 (취득일·cause·보조일자·1주당 단가는 Step2 — 단, 본 PR에서 Step1 이동은 안 함). amber 카드 grid 레이아웃으로 분산 배치
- **회귀 가드**: 기존 anchor 모두 통과 (필드 동일, validate 동일)

---

## 8. Definition of Done

- [ ] `AcquisitionInfoBlock.tsx` 신규 작성 (amber tone, inline cause)
- [ ] Step1.tsx sections에서 cause 항목 제거
- [ ] 4가지 cause 분기 모두 정상 (purchase·inheritance·gift·merger_split)
- [ ] gift 라벨 자동 변경 ("취득일" → "수증일")
- [ ] 보조 일자 조건부 노출 정상
- [ ] `npx tsc --noEmit` 0 errors
- [ ] `npx vitest run` 회귀 0
- [ ] 동적 섹션 번호 1~4 (기타자산 OFF) / 1~5 (기타자산 ON) 정상
- [ ] **split → single 마이그레이션 회귀** — 첫 lot의 cause·보조일자가 AcquisitionInfoBlock에 정확히 복원
- [ ] **default cause = "purchase"** 신규 사용자 진입 시 정상
- [ ] **모바일 반응형** RadioCardGroup 4 옵션 표시 정상 (필요 시 layout 조정)
- [ ] **AcquisitionCauseBlock.tsx 삭제** + import 정리
- [ ] 단기 30% 안내 카드 보존 확인
- [ ] 브라우저 수동 확인

---

## 9. 변경 로그

| 일자 | 버전 | 변경 |
|---|---|---|
| 2026-05-18 | v1 | 초안 작성 |
| 2026-05-18 | v1.1 1차 정정 | 🔴 ①1주당 취득가액 모순 정정 ②AcquisitionCauseBlock 즉시 삭제 결정 ③섹션 번호 정합. 🟡 ④마이그레이션 wrapper 영향 §2-F ⑤기존 안내 카드 보존 ⑥default cause="purchase" ⑦모바일 RadioCardGroup 호환성. 🟢 ⑧nested 카드 시각 표현 ⑨DoD 보강 |
| 2026-05-18 | v1.2 2차 정정 | 🔴 ①acquisitionDate 흡수 명시 (단순 cause 이동 아님) ②inheritance 의제취득일 안내 보존 ③gift 안내 카드 보존. 🟡 ④grid 레이아웃 재구성 명시 ⑤컴포넌트 시각화 §2-E-1 ⑥1주당 취득가액 Step2 유지 명확화. 🟢 ⑦nested 카드 amber-100 들여쓰기 구체 명시 |
