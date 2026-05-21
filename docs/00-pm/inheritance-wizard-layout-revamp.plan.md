# 상속세 마법사 레이아웃 개선 계획서 (v4)

> **상태**: Plan v4 (1차·2차 자체검토 + Plan↔Design 통합 비교 반영)

## v3 → v4 정정 (Plan ↔ Design 통합 비교)

| # | 카테고리 | 정정 |
|---|---|---|
| U-1 | 동기화 | sticky offset Plan v3 `top-32` (128px) → Design v2 `top-36` (144px)로 정밀 측정 후 정정. **Plan도 `top-36`으로 동기화** |
| U-2 | 추가 누락 | 글로벌 헤더 `max-w-4xl`(896px) vs 페이지 `max-w-5xl`(1024px) 시각 비대칭 — 의도된 동작 (헤더는 모든 페이지 공통 영향 회피) |
| U-3 | 코드 예시 | §4.2 코드 예시의 `top-32` → `top-36` 정정 |

## v2 → v3 정정 (2차 자체검토)

| # | 카테고리 | 정정 |
|---|---|---|
| N-1 | 누락 | `StepIndicator` 컴포넌트 자체에 `mb-6` margin 내장 (StepIndicator.tsx:20). sticky 래퍼 안에서 영역 부풀려 — **className prop으로 `mb-0` override 또는 래퍼에서 음수 마진 보정**. `StepIndicator` 컴포넌트에 optional `className` prop 추가 검토 (라인 16 — 현재 없음) |
| N-2 | 누락 | 모바일 `order-first` 명시 — 현행 `order-first lg:order-last`에서 **`lg:order-last` 제거**하면 자연스럽게 모바일·데스크톱 모두 좌측·상단 정합 |
| N-3 | 점검 완료 | AddressSearch 드롭다운 `z-50` (address-search.tsx:226·465) > StepIndicator(z-30) — **충돌 없음** ✅ |
| N-4 | 누락 | 인쇄 시 `backdrop-blur` 잉크 비용 — `print:backdrop-blur-0` 추가. 이미 `print:bg-transparent` 반영, `backdrop-blur` 까지 보강 |
> **작성일**: 2026-05-21

## v1 → v2 정정 (1차 자체검토)

| # | 카테고리 | 정정 |
|---|---|---|
| O-2 | 누락 | 결과 화면(`if (result)` 라인 303) 분기 시 마법사 폼 자체 미렌더 → StepIndicator sticky 자연 미적용. 별도 처리 불필요. 본 PR §5 C9 자동 해소 명시 |
| O-3 | 누락 | `InheritanceSidebar` 내부 max-height·overflow 처리 — 합계 카드가 길어질 가능성 대비 `max-h-[calc(100vh-9rem)] overflow-y-auto` 적용 (헤더 56 + StepIndicator 영역 ~80 = 136px ≈ 9rem 차감) |
| O-4 | 누락 | 인쇄(`print:`) 미디어 처리 — sticky·grid가 인쇄 시 페이지 분리 차단 → `print:static print:block` 적용 |
| O-5 | 누락 | 결과 화면도 max-w-5xl 폭 확대 영향 — `HeirAllocationTable`·`InheritanceTaxResultView` 결과 카드는 기존 `overflow-x-auto` 처리되어 폭 확장은 오히려 유리. 회귀 0 |
| C-1 | 모순 | 자산 영역 폭 "~700px" → **정확히 668px** (1024 − px-4×2(32) − gap-6(24) − 사이드바 300). 미세 차이지만 정확화 |
| I-2 | 개선 | sticky offset 명확화 — 헤더(`h-14`=56px) + StepIndicator sticky 영역(py-3 24 + StepIndicator 콘텐츠 ~60 + border 1 ≈ 85px) → 총 141px. 안전 마진 포함 `top-36`(144px) 적용 (v4 통합 비교에서 정정) |
| I-3 | 개선 | `-mx-4 px-4` full-bleed 패턴 — sticky 영역이 페이지 padding을 무시하고 컨테이너 전체 폭 활용. 의도된 동작이며 backdrop-blur 시 더 자연스러움 |
> **세목**: 상속세 (Inheritance Tax) — UI 레이아웃 한정
> **범위**: 상속세 마법사만 (다른 5대 세금 마법사 비변경)
> **에이전트**: `inheritance-gift-tax-ui-senior`

---

## 1. 배경 (Why)

사용자가 상속세 마법사 사용 중 다음 UX 불편 보고:

1. **단계 네비게이션이 스크롤로 사라짐** — 자산 입력 도중 현재 단계 확인 불가, 단계 이동 시 상단으로 스크롤 필요
2. **합계 미리보기가 우측에서 시야 분산** — 입력 영역과 합계가 분리되어 입력 중 합계 확인 시 시선 우측 끝까지 이동
3. **상속재산 입력 영역이 너무 좁음** — 페이지 `max-w-2xl`(672px) − 우측 사이드바(300px) = 자산 카드 폭 ≈ 300px. 자산 카드 내부 입력란 폭이 좁아 라벨 자동 줄바꿈(직전 PR3 협의분할 라벨 세로 표시 문제도 같은 원인)

## 2. 사용자 요구 (확정)

| # | 요구 | 사용자 확정 답변 |
|---|---|---|
| R1 | StepIndicator sticky (의뢰인 헤더 바로 아래) | 확정 |
| R2 | 합계 미리보기를 좌측 sticky | 모바일(lg 미만)은 상단 stack 유지 |
| R3 | 상속재산 목록 폭 2배 확장 | **max-w-5xl (1024px)** |
| R4 | 적용 범위 | **상속세 마법사만 한정** (양도·증여·취득·재산·종부세 비변경) |

## 3. 현황 (Before)

### 3.1 페이지 컨테이너 — `app/calc/inheritance-tax/page.tsx:19`
```tsx
<div className="mx-auto max-w-2xl px-4 py-8">
  <div className="mb-6">
    <h1>상속세 계산기</h1>
    <p>{설명}</p>
  </div>
  <InheritanceTaxForm />
</div>
```
- 폭 672px

### 3.2 마법사 폼 — `components/calc/InheritanceTaxForm.tsx:344-365`
```tsx
<StepIndicator steps={STEPS} current={step} onStepClick={…} />  // 일반 흐름 — 스크롤 시 사라짐

<div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-6 items-start">
  <div className="min-h-[300px]">
    {step === 0 && <Step0 />}
    {step === 1 && <Step1 />}
    ...
  </div>
  <aside className="lg:sticky lg:top-4 self-start order-first lg:order-last">
    <InheritanceSidebar />
  </aside>
</div>
```
- 그리드: 입력 영역 1fr / 사이드바 300px
- 사이드바: `lg:order-last` → 데스크톱 우측
- StepIndicator: sticky 아님

### 3.3 헤더 레이아웃 — `app/layout.tsx:66`
```tsx
<header className="sticky top-0 z-50 w-full border-b bg-background/80 backdrop-blur">
  ... 의뢰인: {name} ...
</header>
```
- 헤더 sticky top-0, z-50, 높이 14 (`h-14` = 56px)

## 4. 목표 (After)

### 4.1 페이지 컨테이너

```tsx
<div className="mx-auto max-w-5xl px-4 py-8">
  ...
</div>
```
- 폭 672px → **1024px**
- 자산 영역 폭 계산: 1024 − px-4×2(32px) − gap-6(24px) − 사이드바(300px) = **668px** (현행 ~300px 대비 약 2.2배)

### 4.2 마법사 폼 — StepIndicator sticky + 사이드바 좌측

```tsx
{/* StepIndicator — 헤더 바로 아래 sticky (인쇄 시 일반 흐름) */}
{/* StepIndicator 내부 `mb-6` 중복 회피 — className prop으로 `!mb-0` override */}
<div className="sticky top-14 z-30 -mx-4 px-4 py-3 bg-background/95 backdrop-blur border-b border-border/60 mb-4 print:static print:bg-transparent print:backdrop-blur-0 print:border-0">
  <StepIndicator
    steps={[...STEPS]}
    current={step}
    onStepClick={(i) => setStep(i)}
    className="!mb-0"
  />
</div>

{/* 인쇄 시 grid 해제하여 단일 컬럼 자연 흐름 */}
<div className="grid grid-cols-1 lg:grid-cols-[300px_1fr] gap-6 items-start print:block">
  {/* 사이드바 — 데스크톱 좌측 sticky / 모바일·인쇄 상단 stack
       order-first (모바일 상단) + lg:order-last 제거로 데스크톱도 좌측 자연 정합 */}
  <aside className="order-first lg:sticky lg:top-36 self-start max-h-[calc(100vh-9rem)] overflow-y-auto print:static print:max-h-none print:overflow-visible">
    <InheritanceSidebar />
  </aside>

  <div className="min-h-[300px]">
    {step === 0 && <Step0 />}
    ...
  </div>
</div>
```

**선행 변경**: `StepIndicator` 컴포넌트에 `className?: string` prop 추가 (StepIndicator.tsx:14 props 인터페이스 + 라인 20 root div에 적용). 다른 호출처(양도세·증여세 등)에는 영향 없음 (옵셔널).

핵심 변경 4건:
- ① StepIndicator를 `sticky top-14 z-30` (헤더 56px 아래) + 배경 backdrop-blur + 하단 border
- ② 그리드 `1fr_300px` → **`300px_1fr`** (좌우 반전)
- ③ 사이드바 `order-first lg:order-last` → 그냥 좌측 (`order-first` 모바일도 상단 → 그대로 정합)
- ④ 사이드바 sticky offset: 헤더(top-14=56px) + StepIndicator 영역(~80px) = `top-[136px]` 또는 `top-32`로 단순화

### 4.3 z-index 충돌 회피

| 요소 | z-index | 비고 |
|---|---|---|
| 글로벌 헤더 (`app/layout.tsx`) | `z-50` | 변경 없음 |
| StepIndicator sticky (신규) | `z-30` | 헤더보다 낮아 헤더 메뉴 클릭 가능 |
| 사이드바 sticky | (기본) | StepIndicator 아래로 자연스럽게 흐름 |

## 5. 케이스 매트릭스

| # | 시나리오 | 데스크톱(lg≥) | 모바일(lg 미만) |
|---|---|---|---|
| C1 | 페이지 진입 | StepIndicator 헤더 아래 / 좌측 사이드바 / 우측 입력 영역 | StepIndicator 상단 / 사이드바 카드(상단) / 입력 영역 |
| C2 | 입력 영역 스크롤 | 헤더·StepIndicator·사이드바 모두 sticky 유지 | StepIndicator sticky 유지 / 사이드바 스크롤로 이동 |
| C3 | Step 1 자산 입력 (긴 폼) | 사이드바 합계 변동 시 좌측 sticky로 즉시 확인 가능 | (현행과 유사) |
| C4 | Step 4 공제 입력 (긴 폼) | 헤더 sticky 영역 변동 없음 | (현행) |
| C5 | 단계 이동 (StepIndicator 클릭) | 어느 위치에서도 단계 이동 가능 | (현행 — 변경 없음) |
| C6 | 모바일 진입 | (해당 없음) | StepIndicator sticky, 사이드바 비-sticky 상단 stack |
| C7 | 사이드바 합계 카드 매우 김 | `max-h-[calc(100vh-9rem)] overflow-y-auto`로 내부 스크롤 | 모바일은 자연 흐름 |
| C8 | 인쇄 (Cmd+P) | sticky·grid 해제, 단일 컬럼 자연 흐름 — `print:static print:block` | 모바일과 동일 |
| C9 | 결과 화면 (`result !== null`) | `InheritanceTaxForm` 라인 303에서 InheritanceTaxResultView 단독 렌더 → StepIndicator 자체 미렌더 (자연 처리) | 동일 |

## 6. 변경 파일

| 파일 | 변경 | 줄 수 |
|---|---|---|
| `app/calc/inheritance-tax/page.tsx` | `max-w-2xl` → `max-w-5xl` | ±1 |
| `components/calc/StepIndicator.tsx` | `className?: string` prop 추가, root div에 `cn()` 적용 | +3 |
| `components/calc/InheritanceTaxForm.tsx` | StepIndicator sticky 래퍼 + grid 좌우 반전 + 사이드바 sticky offset·max-h·overflow + print: 처리 | ±18 |

**다른 마법사는 비변경**:
- `app/calc/transfer-tax/`·`app/calc/gift-tax/`·`app/calc/acquisition-tax/`·`app/calc/property-tax/`·`app/calc/comprehensive-tax/`·`app/calc/stock-transfer-tax/`

## 7. 동기화 8지점 점검

엔진 input/result 변경 **없음** — 순수 UI 레이아웃 조정.

| # | 지점 | 영향 |
|---|---|---|
| ① 폼 상태 | 변경 없음 |
| ② initial | 변경 없음 |
| ③ normalize | 변경 없음 |
| ④ API 변환 | 변경 없음 |
| ⑤ UI 위젯 | **레이아웃만 변경 — 컴포넌트 내부 마크업 그대로** |
| ⑥ 사이드바 합계 | `InheritanceSidebar` 내부 마크업·로직 그대로, **위치만 우→좌** |
| ⑦ 결과 카드 | 변경 없음 |
| ⑧ Validation | 변경 없음 |

## 8. 정책 사전 적용 (MEMORY.md)

- [feedback_useeffect_store_mirror_forbidden]: useEffect 미사용 ✅
- [feedback_section_card_numbering]: Step 0 색상 카드 (직전 PR1 적용) — 폭 확장 후에도 그대로 유지 ✅
- [feedback_macos_scrollbar_autohide_workaround]: 가로 스크롤 발생 시 HorizontalScrollContainer 적용. 본 PR은 폭 확장이라 가로 스크롤 사라질 가능성 ✅
- [tax-summary-sidebar-pattern]: 사이드바 sticky·useMemo 패턴 그대로 유지, **`order-first` `order-last` 클래스만 변경** ✅

## 9. Pre-Do anchor (브라우저 수동 점검 — 자동 anchor 부재)

UI 레이아웃은 자동 anchor 작성이 까다로워 **브라우저 수동 시나리오 체크리스트**로 대체:

```
□ M1: 데스크톱(≥1024px) 진입 → StepIndicator가 헤더 바로 아래 표시되는지
□ M2: 입력 영역 스크롤 다운 → StepIndicator·헤더·사이드바 모두 화면에 유지되는지
□ M3: 사이드바가 좌측에 표시되는지
□ M4: Step 1 자산 추가 시 입력 카드 폭이 넉넉한지 (직전 PR3 협의분할 라벨 세로 표시 재현되지 않는지)
□ M5: 모바일(<1024px) 진입 → 사이드바가 상단 카드로 stack되는지
□ M6: 모바일 스크롤 시 StepIndicator는 sticky 유지, 사이드바는 스크롤로 이동하는지
□ M7: 단계 이동 (StepIndicator 클릭) — 어느 스크롤 위치에서도 동작하는지
□ M8: 헤더 메뉴(계산 이력·테마 토글) 클릭 — StepIndicator로 가려지지 않는지 (z-30 < z-50)
□ M9: 결과 화면 (계산 후) — StepIndicator 사라지고 결과 페이지 정상 표시
```

## 10. 리스크 / 검토

| 항목 | 위험 | 대응 |
|---|---|---|
| z-index 충돌 | StepIndicator(z-30)가 모달·드롭다운 가려질 수 있음 | LawArticleModal·AddressSearch 등 z-index 확인. 모달은 z-50 이상, drop은 z-40 권장 |
| 사이드바 sticky offset 정확도 | StepIndicator 영역 높이 동적 변동(모바일 줄바꿈) | `top-32`로 여유분 확보, 또는 CSS var로 계산 |
| 직전 PR 협의분할 라벨 세로 표시 회귀 | 자산 카드 폭 확대로 자연 해소 — 다만 `whitespace-nowrap` 안전망 유지 | 브라우저 확인 시 M4 항목 |
| 1280px 미만 노트북에서 우측 여백 | max-w-5xl(1024px) — 1280px 화면 여백 128px씩 | 정상 (사용자 권장 폭) |
| 다른 마법사와 일관성 깨짐 | 상속세만 1024px, 다른 마법사는 672px | 사용자 확정 — 향후 일관 적용 PRD 후속 검토 |

## 11. PDCA 단계

### Plan ✅ (본 문서)

### Design (생략 가능)

UI 레이아웃 단순 조정이라 별도 design 문서 없이 본 Plan + 브라우저 점검으로 진행.

### Do

1. `app/calc/inheritance-tax/page.tsx` — `max-w-2xl` → `max-w-5xl`
2. `components/calc/InheritanceTaxForm.tsx` — StepIndicator sticky 래퍼 + grid 좌우 반전 + 사이드바 sticky offset
3. `npx tsc --noEmit` 0
4. `npx vitest run` 회귀 0
5. 브라우저 수동 점검 M1~M9

### Check

- TypeScript 0 errors
- Vitest 4,134 passed 유지
- 브라우저 체크리스트 M1~M9 통과

### Act

- 향후 다른 5대 세금 마법사 일관 적용 검토 (별도 PRD)
- 사이드바 표시 항목 조정 (현재 미리보기 합계만)

## 12. 완료 조건 (DoD)

- [ ] 페이지 max-w-5xl 적용
- [ ] StepIndicator sticky (z-30, top-14)
- [ ] 사이드바 좌측 배치 (데스크톱) + 상단 stack (모바일)
- [ ] 사이드바 sticky offset 조정 (StepIndicator 영역 회피)
- [ ] 직전 PR3 협의분할 라벨 세로 표시 자연 해소 확인 (자산 카드 폭 확대 효과)
- [ ] tsc 0 errors
- [ ] vitest 회귀 0
- [ ] 브라우저 체크리스트 M1~M9 통과
- [ ] z-index 충돌 없음 (헤더·모달·드롭다운)
