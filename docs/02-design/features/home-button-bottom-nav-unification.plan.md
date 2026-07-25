# 하단 마법사 네비 "홈으로" pill 통일 계획서

> 작성: 2026-07-25 · 대상: 전 세목 계산기 하단 StepWizard 네비 + 양도세 다건 브레드크럼
> 전제: 상단 헤더 `HomeButton` pill(집 아이콘·rounded-full)은 이미 통일 완료(PR #708/#771). **하단 겸용 네비 버튼이 step 0에서 여전히 `‹ 홈으로`(ChevronLeft·rounded-md)** 로 남아 있는 것이 미완 작업.

## 1. 목표

- 하단 마법사 네비의 **step 0 "홈으로"** 를 상단 헤더와 동일한 `<HomeButton>` pill(집 아이콘·rounded-full)로 통일 → 이미지10 픽셀 일치.
- step 1+ "이전"(ChevronLeft NavButton)은 **현행 유지**.
- 양도세 다건 계산기의 native 브레드크럼 `‹ 홈으로`(정책 위반)도 함께 정리.
- 성공 기준(verify): (a) 8개 계산기 step 0 하단 좌측이 `⌂ 홈으로` pill 렌더, (b) step 1+ 좌측은 `‹ 이전` 유지, (c) 다건 브레드크럼에 native ChevronLeft 홈링크 0건, (d) `tsc` 0건 + 전 세목 E2E 회귀 0건.

## 2. 결정된 방식 (사용자 확정 2026-07-25)

- **하단 렌더**: Option A — step 0에서만 `<HomeButton>` pill로 교체, step 1+는 `<NavButton direction="prev" label="이전">` 유지.
- **다건 브레드크럼**: 함께 정리.

## 3. 현황 전수 조사

### 3-1. 하단 겸용 네비 버튼 (8곳 — 전부 `NavButton direction="prev" label={step===0?"홈으로":"이전"}`)

| # | 계산기 | 파일:line | step 0 홈 이동 현재 동작 (실측 완료) | HomeButton import |
|---|---|---|---|---|
| 1 | 증여세 | `components/calc/GiftTaxForm.tsx:385` (handleBack:125) | `window.history.back()` ⚠️ | O (헤더용) |
| 2 | 상속세 | `components/calc/InheritanceTaxForm.tsx:782` (handleBack:395) | `window.history.back()` ⚠️ | O |
| 3 | 재산세 | `components/calc/PropertyTaxForm.tsx:245` (handleBack:98) | `router.push("/")` | X (추가 필요) |
| 4 | 취득세 | `components/calc/AcquisitionTaxForm.tsx:361` (handleBack:194) | `window.location.href="/"` ⚠️ 전체 리로드 | X (추가 필요) |
| 5 | 종부세 | `app/calc/comprehensive-tax/page.tsx:71` (로컬 `NavBar` 헬퍼, onPrev=handlePrev:438) | `router.push("/")` | O |
| 6 | 주식양도세 | `app/calc/stock-transfer-tax/StockTransferTaxCalculator.tsx:203` (handleBack:109) | `router.push("/")` | O |
| 7 | 양도세 단건 | `app/calc/transfer-tax/TransferTaxCalculator.tsx:706` (handleBack:190) | non-embedded `router.push("/")` / embedded는 onClick 오버라이드로 `router.push("/")` — **둘 다 "/"** | O |
| 8 | 양도세 다건(내부 단계) | 위 단건 컴포넌트를 embed — 별도 없음 | — | — |

> ⚠️ **부수 발견 (실측 확정)**: step 0 홈 이동 동작이 계산기마다 불일치 — `history.back()`(증여·상속) vs `location.href="/"`(취득, 전체 리로드) vs `router.push("/")`(재산·종부·주식·양도). 특히 **증여·상속세는 라벨이 "홈으로"인데 실제로는 브라우저 뒤로가기**(직전 페이지가 홈이 아니면 홈으로 안 감) — 잠재 버그. HomeButton으로 교체하면 전부 **홈("/") 클라이언트 내비**로 표준화되어 이 불일치가 동시에 해소됨.

### 3-2. 양도세 다건 브레드크럼 (정책 위반)

- `app/calc/transfer-tax/multi/MultiTransferTaxCalculator.tsx:501-504`
  ```tsx
  <button onClick={() => router.push("/")} className="hover:text-foreground flex items-center gap-1">
    <ChevronLeft className="h-3.5 w-3.5" />
    홈으로
  </button>
  ```
- native `<button>` + `ChevronLeft` 홈링크 → `components/calc/CLAUDE.md` 「홈으로 버튼 규칙」 **신규 작성 금지** 위반. 상단 HomeButton도 없음(브레드크럼으로 대체 중).

### 3-3. 이미 통일된 부분 (변경 없음)

- 상단 헤더 `<HomeButton>` pill: Gift·Inheritance·Stock·Transfer(메인 헤더), Property·Acquisition(각 Step0 내부), comprehensive(Step1Basic), building-standard-price·StockValuationTool 등.
- 결과·에러 화면 `variant="block"` HomeButton.

## 4. 변경 상세

### 4-A. (권장) 공용 헬퍼 `WizardBackNav` 신설 — 단일 소스

8곳에 동일한 `{isFirst ? <HomeButton/> : <NavButton/>}` 삼항을 흩뿌리는 대신, `WizardNav.tsx`에 겸용 헬퍼를 추가해 단일 소스로 관리(WizardNav의 "인라인 nav 클래스 금지·단일 소스" 철학과 일치).

```tsx
// components/calc/shared/WizardNav.tsx (추가)
import { HomeButton } from "./HomeButton";

type WizardBackNavProps = {
  /** step 0 여부 — true면 HomeButton pill, false면 "이전" NavButton */
  isFirstStep: boolean;
  /** step 1+ '이전' 클릭 */
  onBack: () => void;
  /** step 0 홈 이탈 확인 문구 (미제공 시 즉시 이동) */
  homeConfirmMessage?: string;
  /** 홈 이동 직전 stale 정리 콜백 */
  onBeforeHome?: () => void;
};

export function WizardBackNav({ isFirstStep, onBack, homeConfirmMessage, onBeforeHome }: WizardBackNavProps) {
  if (isFirstStep) {
    return <HomeButton confirmMessage={homeConfirmMessage} onBeforeNavigate={onBeforeHome} />;
  }
  return <NavButton direction="prev" label="이전" onClick={onBack} />;
}
```

각 계산기는 다음처럼 치환:
```tsx
// before
<NavButton direction="prev" label={step === 0 ? "홈으로" : "이전"} onClick={handleBack} />
// after
<WizardBackNav isFirstStep={step === 0} onBack={handleBack} />
```

- **대안 B(비권장)**: 헬퍼 없이 각 파일에서 삼항 인라인. 8곳 중복 + 향후 드리프트 위험 → 권장 안 함.

### 4-B. 파일별 작업

| # | 파일 | 작업 |
|---|---|---|
| 1 | `WizardNav.tsx` | `WizardBackNav` 헬퍼 추가 (HomeButton import) |
| 2 | GiftTaxForm.tsx:385 | `WizardBackNav`로 치환. `handleBack`의 step 0 분기(`history.back()`)는 이제 HomeButton이 처리 → **분기 제거 가능**(step 1+ 전용으로 단순화) |
| 3 | InheritanceTaxForm.tsx:782 | 치환 (line 704 "이전"은 별도 — 결과화면 헤더, 대상 아님) |
| 4 | PropertyTaxForm.tsx:245 | 치환. `handleBack` step 0 분기(`router.push`) 제거 가능 |
| 5 | AcquisitionTaxForm.tsx:361 | 치환. step 0 `location.href="/"`(리로드) → HomeButton 클라이언트 내비로 개선 |
| 6 | comprehensive-tax/page.tsx:71 | 로컬 `NavBar` 헬퍼 내부에서 `WizardBackNav` 사용(step prop 이미 있음) |
| 7 | StockTransferTaxCalculator.tsx:203 | 치환 (`currentStep === 0`) |
| 8 | TransferTaxCalculator.tsx:706 | 치환. **실측 확정**: embedded/non-embedded 모두 step 0 = `router.push("/")` → `WizardBackNav`가 완전 흡수. **line 707-713의 embedded 특수 onClick 오버라이드 삭제** 가능(더 이상 불필요) |
| 9 | MultiTransferTaxCalculator.tsx:501 | native 브레드크럼 `‹ 홈으로` 제거 → `<HomeButton>` pill로 교체(브레드크럼 첫 항목 위치 또는 헤더). ChevronLeft import 미사용 시 정리 |

> **confirmMessage 정책 (실측 후 확정)**: 하단 step 0 **7곳 전부 확인 다이얼로그 없음**(즉시 이동). 기존 동작을 완전 보존하기 위해 `WizardBackNav`는 `homeConfirmMessage`를 **전달하지 않음**(즉시 이동 유지). 헤더 HomeButton은 `confirmMessage` 유지(별개 버튼·불변). → **결과: E2E `window.confirm` dialog 핸들러 불필요**(리스크 1건 소멸). 상·하단 확인 정책 비대칭이 생기나, 하단 "이전"도 즉시 이동이라 네비 행 자체의 관용과 일치하며, step 0는 입력 초기라 오클릭 위험 낮음.

## 5. 문서(CLAUDE.md) 갱신 — 필수

`components/calc/CLAUDE.md` 「홈으로 버튼 규칙」의 **예외 조항**이 이번 결정으로 뒤집힘:

- 삭제 대상(현행): *"예외: 마법사 StepWizard 하단의 '이전/홈으로' 겸용 네비 버튼 … 현행 유지 … 헤더에 이미 HomeButton이 있음."*
- 신규 문구: *"마법사 하단 네비 좌측은 `WizardBackNav`(공용) 사용. step 0 = `HomeButton` pill, step 1+ = `NavButton '이전'`. 하단에서 `NavButton label='홈으로'` 신규 작성 금지."*
- 「공용 입력 컴포넌트」 표에 `WizardBackNav` 행 추가.

## 6. 검증 계획

1. `npx tsc --noEmit` → 0건.
2. `npm run lint` (변경 파일) → ChevronLeft 미사용 import 잔존 0건.
3. **시각 확인**(Playwright): 각 세목 step 0 진입 → 하단 좌측 `⌂ 홈으로` pill 확인 / "다음" 눌러 step 1 → `‹ 이전` 확인. 다건 브레드크럼 native 홈링크 소멸 확인.
4. **E2E 회귀**: 기존 세목별 스펙 전량(양도·상속·증여·재산·종부·주식·취득). 하단 네비 셀렉터가 텍스트 "홈으로"/"이전"에 의존하면 셀렉터 영향 점검(HomeButton은 `aria-label="홈으로 이동"`). → 실패 시 셀렉터 보정.
   - ⚠️ 사전존재 실패 `transfer-multi-house-detail.spec.ts:91`(gracePeriod)은 본 작업과 무관 — 회귀 판정에서 제외.
5. 기존 `__tests__/components/wizard-nav.test.tsx`에 `WizardBackNav` 단위 테스트 추가(isFirstStep true→HomeButton / false→"이전").

## 7. 리스크 / 주의

- **증여세 동작 변경**: `history.back()` → 홈("/")으로 바뀜. 라벨과 실제 동작이 일치하게 되는 개선이나, "뒤로가기"에 의존한 흐름이 있는지 확인.
- **취득세 리로드 제거**: `location.href="/"`(전체 리로드) → 클라이언트 내비. 홈 진입 시 stale 상태 우려 없음(홈은 별도 페이지).
- **E2E 셀렉터**: step 0 좌측 버튼이 `<button>`(NavButton)에서 `<Link>`(HomeButton — confirmMessage 미전달 시 `<Link href="/">`, `aria-label="홈으로 이동"`)로 바뀜 → `getByText("홈으로")`는 유지되나 role(`button`) 의존 셀렉터는 `link`로 점검.
- ~~confirmMessage 도입 시 dialog 핸들러~~ → **해소**: confirmMessage 미전달로 확정(§4-B). dialog 없음.

## 8. 커밋/ship 계획

단일 브랜치 `fix/home-button-bottom-nav-pill`에 모아 1회 ship:
1. `WizardBackNav` 헬퍼 + 단위 테스트
2. 8개 계산기 치환 + handleBack step-0 분기 정리
3. 다건 브레드크럼 HomeButton 교체
4. CLAUDE.md 예외 조항 갱신
→ `scripts/ship.sh fix/home-button-bottom-nav-pill "🎨 fix(홈으로 버튼): 마법사 하단 네비 step0 HomeButton pill 통일 + 다건 브레드크럼 정리"`

## 9. 착수 전 확인 항목 — 실측 완료 (2026-07-25)

- [x] **InheritanceTaxForm `handleBack`(395) step 0**: `window.history.back()` — 증여세와 동일(⚠️ 홈 아닐 수 있음). HomeButton 교체로 "/"로 표준화.
- [x] **comprehensive-tax `handlePrev`(438) step 0**: `router.push("/")`. 동작 동일 보존.
- [x] **Transfer embedded-in-multi step 0**: `handleBack`은 embedded step 0에서 no-op이나 NavButton onClick이 `router.push("/")`로 오버라이드 → embedded/non-embedded **둘 다 "/"**. `WizardBackNav`가 완전 흡수, **특수 콜백 불필요**(오버라이드 삭제).
- [x] **confirmMessage**: 하단 step 0 7곳 전부 다이얼로그 없음 → `homeConfirmMessage` 미전달로 확정. **E2E dialog 핸들러 불필요**.

→ **미해결 항목 없음. 계획 확정. Do 진입 준비 완료.**

## 10. 계획 확정 후 잔여 확인(Do 중)

- 각 세목 E2E 하단 네비 셀렉터가 `role=button`/구조에 의존하는지 grep(`홈으로`) 후 `link` 대응 보정.
- `handleBack`의 step 0 분기 제거 시 다른 호출부(결과화면 "이전" 등)가 같은 함수를 공유하는지 확인 후 안전 정리(증여·상속·재산·양도).
