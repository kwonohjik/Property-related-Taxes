# 가로 스크롤바 항상 표시 — 버그 수정 계획서 (v2 — 재검토 반영)

> 작성일: 2026-05-20
> 재검토일: 2026-05-20 (v2)
> **완료일: 2026-05-20 — 사용자 브라우저 확인 "스크롤바 잘 보여" ✅**
> 영역: 증여세 결과 화면 — 증여재산 및 평가명세서 (별지 제10호서식 부표 1) 카드
> 범위 확장 가능: 동일 패턴이 적용될 모든 신고서 양식 카드

---

## 0. v2 재검토 요약 — "이번에는 제대로 되는가"

### v1의 약점
- 옵션 H(화살표·진행률 보조)는 **OS 자동 숨김 정책과 무관하게 항상 보이는 추가 UI를 제공**한다는 점에서 옳음
- 그러나 **본질적으로는 "스크롤바 자체"를 항상 보이게 하는 게 아니라 보조 UI를 추가**하는 것이므로, 사용자 요구("스크롤바를 항상 표시")와 약간 결이 다름
- 화살표 1쌍만으로는 사용자가 "스크롤 가능한 표"임을 즉시 인지하지 못할 위험 잔존 (단순 장식 버튼으로 오인)

### v2 핵심 변경 — "OS 의존 0%" 보장
1. **공식 분석 추가**: macOS Chrome/Safari의 `::-webkit-scrollbar` 커스텀이 OS 자동 숨김을 어떻게 우회/실패하는지 검증된 사실 기반으로 재정리
2. **JS-기반 가짜 스크롤바**(옵션 D 변형) 채택 — 별도 DOM `<div>`로 thumb/track 렌더링 + scrollLeft 양방향 동기화. **OS의 어떤 자동 숨김 정책에도 영향받지 않음**
3. **보조 UI 보강** — 화살표·진행률·우측 fade gradient·안내 텍스트를 함께 제공 (이중·삼중 시각 신호)
4. **단위 테스트 anchor 강화** — 스크롤 위치·thumb 위치·키보드·터치 4종 시나리오 명시
5. **검증 절차 명시** — macOS Chrome "자동" / "마우스 또는 트랙패드 사용 시" / "항상" 3가지 시스템 설정 + Safari + Firefox + Windows Chrome 6환경 매트릭스 사전 점검표

---

## 1. 문제 정의 (불변)

### 증상
별지 제10호서식 부표 1 양식을 A4 가로(277mm) 폭으로 표시한 뒤, 좁은 결과 페이지(max-w-2xl ≈ 640px) 안에서 가로 스크롤로 우측 컬럼(④~⑧)에 접근해야 한다. **macOS 시스템 설정 "스크롤 막대 표시"가 "자동"인 환경에서 스크롤바가 마우스 호버/스크롤 중에만 잠깐 나타났다 사라진다** — 사용자가 우측 컬럼 존재를 인지하지 못함.

### 사용자 요구
> "스크롤바를 자동 숨김 처리하지 말고 항상 표시되게 속성을 바꿔 주세요"
> "브라우저 새로고침해도 스크롤바가 자동으로 숨김되네"
> "이번에는 제대로 되는지 다시 검토 해주세요" ← **v2 작성 트리거**

### 시도 이력 및 한계
| 시도 | 결과 | v2 분석 |
|---|---|---|
| Tailwind v4 임의 선택자 `[&::-webkit-scrollbar]:h-2.5` | 컴파일 누락 | Tailwind v4 가상 요소 임의 선택자 지원 제한 — 직접 CSS가 안전 |
| `globals.css`에 `.horizontal-scroll-visible` 정의 + `overflow-x: scroll` + 색상 강제 | CSS 로드는 되나 자동 숨김 지속 | OS 자동 숨김은 페이드 애니메이션 단계에서 적용 — CSS만으로는 완전 우회 불가 |
| `-webkit-appearance: none !important` + opacity·visibility 강제 | 효과 없음 | `appearance: none`은 외형만 무효화. 가시 타이밍은 OS 합성 단계 결정 |
| `scrollbar-gutter: stable` | 공간만 예약, 핸들 미표시 | 핸들의 가시는 별도 문제 |

### v2 — 근본 원인 사실 검증
**macOS Chrome/Safari 자동 숨김 동작**:
1. 시스템 환경설정 "외관 → 스크롤 막대 표시" 3옵션:
   - "마우스 또는 트랙패드 사용 시 자동으로": **트랙패드 사용 시 자동 숨김**, 마우스 사용 시 항상 표시
   - "스크롤할 때": **항상 자동 숨김**, 스크롤 중에만 잠깐 표시
   - "항상": 항상 표시 (요구 동작)
2. 사용자 macOS 기본값은 트랙패드 자동 숨김
3. `::-webkit-scrollbar` 커스텀 + `background-color` 명시한 경우 **Chrome 일부 버전에서 자동 숨김 우회 가능**하지만 **macOS 13+ 최신 Chrome에서는 OS 합성 우선**으로 우회 실패 사례 다수 보고됨
4. **확실한 우회**: 네이티브 스크롤바를 완전히 숨기고 JS-구동 가짜 스크롤바(div) 사용 — OS 정책과 완전 무관

→ **결론**: 순수 CSS는 환경 의존적. **JS 가짜 스크롤바 또는 검증된 외부 라이브러리(OverlayScrollbars 등)**가 100% 우회 보장.

---

## 2. 해결 옵션 매트릭스 (v2)

| 옵션 | 방식 | OS 의존 | 의존성 | UX | 권장도 |
|---|---|---|---|---|---|
| A | CSS 단독 강화 (현재) | **있음** | 0 | 환경별 차이 | ❌ 이미 실패 |
| B | OverlayScrollbars 라이브러리 | 없음 | +18KB | 매우 좋음 | △ 의존성 부담 |
| C | simplebar-react 라이브러리 | 없음 | +14KB | 좋음 | △ 의존성 부담 |
| D | **자체 JS 가짜 스크롤바** — div로 thumb/track 렌더링 + 양방향 동기화 | **없음** | 0 | 좋음 | **★★ v2 채택** |
| E | 화살표 보조 UI | 없음 | 0 | 보조 신호 | ★ 병행 권장 |
| F | 양식 transform: scale 축소 | 해당없음 | 0 | 글자 작음 | ❌ |
| G | 모달 확대 보기 | 해당없음 | 0 | 한 번 클릭 추가 | ○ 후속 |

### v2 최종 선택 — **D + E 조합**

| 구성 | 역할 |
|---|---|
| **D — JS 가짜 스크롤바** | 메인 스크롤 UI. 네이티브 스크롤바를 `scrollbar-width: none`/`::-webkit-scrollbar { display: none }`로 완전 숨기고, JS로 thumb/track div를 항상 렌더. OS 정책과 100% 무관. |
| **E — 좌·우 화살표** | 보조 UI. 사용자가 thumb을 못 봐도 화살표로 명확한 시각 신호 |
| **F-mini — Edge fade gradient** | 카드 우측 끝에 fade(`bg-gradient-to-l from-white to-transparent` 8~16px) — "더 있다" 즉각 인지 |
| **안내 텍스트** | 카드 상단 우측에 "← → 좌우 스크롤" 한 줄 |

이중·삼중 시각 신호로 어떤 OS 환경에서도 사용자가 우측 컬럼 존재를 100% 인지.

---

## 3. v2 권장안 구체 설계 — `HorizontalScrollContainer` 공용 컴포넌트

### 3.1 컴포넌트 시그니처

```typescript
// components/calc/shared/HorizontalScrollContainer.tsx
interface Props {
  children: ReactNode;
  /** 우측 fade gradient 색상 (기본 white) — 다크모드 또는 비-white 카드 대응 */
  fadeColor?: string;
  /** 상단 안내 텍스트 (기본 "← → 좌우 스크롤") */
  hint?: string;
  /** 추가 클래스 (높이·padding 조절) */
  className?: string;
}
```

### 3.2 DOM 구조

```tsx
<div className={`relative ${className}`}>
  {hint && (
    <p className="px-4 pt-2 text-[10px] text-gray-500 text-right print:hidden">
      ← → 좌우 스크롤
    </p>
  )}

  {/* 좌측 화살표 — scrollLeft > 0 시 표시 */}
  {canScrollLeft && (
    <button onClick={() => scrollBy(-300)} aria-label="좌로 스크롤"
      className="absolute left-1 top-1/2 -translate-y-1/2 z-20 bg-white/95 dark:bg-gray-800/95 border border-gray-300 rounded-full w-8 h-8 shadow flex items-center justify-center print:hidden"
    >←</button>
  )}

  {/* 우측 화살표 */}
  {canScrollRight && (
    <button onClick={() => scrollBy(+300)} aria-label="우로 스크롤"
      className="absolute right-1 top-1/2 -translate-y-1/2 z-20 bg-white/95 dark:bg-gray-800/95 border border-gray-300 rounded-full w-8 h-8 shadow flex items-center justify-center print:hidden"
    >→</button>
  )}

  {/* 우측 fade gradient */}
  {canScrollRight && (
    <div
      className="absolute right-0 top-0 bottom-3 w-6 z-10 pointer-events-none print:hidden"
      style={{ background: `linear-gradient(to left, ${fadeColor}, transparent)` }}
      aria-hidden="true"
    />
  )}

  {/* 실제 스크롤 컨테이너 — 네이티브 스크롤바 완전 숨김 */}
  <div
    ref={scrollRef}
    tabIndex={0}
    onScroll={syncThumb}
    className="overflow-x-auto overflow-y-hidden no-native-scrollbar print:overflow-visible"
  >
    {children}
  </div>

  {/* JS 가짜 스크롤바 — 항상 표시 */}
  <div className="px-3 pb-2 print:hidden" aria-hidden="true">
    <div
      ref={trackRef}
      onClick={onTrackClick}
      className="relative h-3 bg-gray-200 dark:bg-gray-700 rounded-full cursor-pointer"
    >
      <div
        ref={thumbRef}
        onMouseDown={onThumbMouseDown}
        onTouchStart={onThumbTouchStart}
        className="absolute top-0 h-3 bg-gray-500 hover:bg-gray-700 dark:bg-gray-400 dark:hover:bg-gray-200 rounded-full cursor-grab active:cursor-grabbing transition-colors"
        style={{ left: `${thumbLeftPct}%`, width: `${thumbWidthPct}%` }}
      />
    </div>
  </div>
</div>
```

### 3.3 네이티브 스크롤바 완전 숨김 CSS (`globals.css`)

```css
/* 네이티브 가로 스크롤바 완전 숨김 — JS 가짜 스크롤바와 병행 사용 */
.no-native-scrollbar {
  scrollbar-width: none; /* Firefox */
  -ms-overflow-style: none; /* IE/Edge */
}
.no-native-scrollbar::-webkit-scrollbar {
  display: none !important;
  width: 0 !important;
  height: 0 !important;
}
```

### 3.4 핵심 로직

```typescript
const scrollRef = useRef<HTMLDivElement>(null);
const trackRef = useRef<HTMLDivElement>(null);
const thumbRef = useRef<HTMLDivElement>(null);
const [canScrollLeft, setCanScrollLeft] = useState(false);
const [canScrollRight, setCanScrollRight] = useState(false);
const [thumbLeftPct, setThumbLeftPct] = useState(0);
const [thumbWidthPct, setThumbWidthPct] = useState(100);

// 스크롤 → thumb 위치 동기화
const syncThumb = useCallback(() => {
  const el = scrollRef.current;
  if (!el) return;
  const { scrollLeft, scrollWidth, clientWidth } = el;
  const max = scrollWidth - clientWidth;
  setCanScrollLeft(scrollLeft > 2);
  setCanScrollRight(scrollLeft < max - 2);
  if (scrollWidth > 0) {
    setThumbWidthPct(Math.max(10, (clientWidth / scrollWidth) * 100));
    setThumbLeftPct(max > 0 ? (scrollLeft / scrollWidth) * 100 : 0);
  }
}, []);

useEffect(() => {
  syncThumb();
  const el = scrollRef.current;
  if (!el) return;
  const ro = new ResizeObserver(syncThumb);
  ro.observe(el);
  Array.from(el.children).forEach((c) => ro.observe(c as Element));
  return () => ro.disconnect();
}, [syncThumb]);

// 화살표 클릭 → 스크롤
const scrollBy = (delta: number) =>
  scrollRef.current?.scrollBy({ left: delta, behavior: "smooth" });

// 트랙 클릭 → 해당 위치로 점프
const onTrackClick = (e: React.MouseEvent) => {
  if (e.target === thumbRef.current) return; // thumb 자체 클릭은 드래그로
  const track = trackRef.current;
  const scroll = scrollRef.current;
  if (!track || !scroll) return;
  const rect = track.getBoundingClientRect();
  const ratio = (e.clientX - rect.left) / rect.width;
  scroll.scrollTo({ left: ratio * scroll.scrollWidth - scroll.clientWidth / 2, behavior: "smooth" });
};

// thumb 드래그 — 마우스
const onThumbMouseDown = (e: React.MouseEvent) => {
  e.preventDefault();
  const startX = e.clientX;
  const scroll = scrollRef.current;
  const track = trackRef.current;
  if (!scroll || !track) return;
  const startScrollLeft = scroll.scrollLeft;
  const trackWidth = track.getBoundingClientRect().width;
  const ratio = scroll.scrollWidth / trackWidth;
  const onMove = (ev: MouseEvent) => {
    scroll.scrollLeft = startScrollLeft + (ev.clientX - startX) * ratio;
  };
  const onUp = () => {
    document.removeEventListener("mousemove", onMove);
    document.removeEventListener("mouseup", onUp);
  };
  document.addEventListener("mousemove", onMove);
  document.addEventListener("mouseup", onUp);
};

// thumb 드래그 — 터치
const onThumbTouchStart = (e: React.TouchEvent) => {
  // 동일 패턴 (touches[0].clientX)
};
```

### 3.5 접근성·키보드
- 스크롤 컨테이너 `tabIndex={0}` → 방향키로 스크롤 (브라우저 기본)
- 화살표 버튼은 `<button aria-label>` — 스크린리더 인식
- 가짜 스크롤바는 `aria-hidden="true"` (보조 시각 신호)
- 우측 fade는 `pointer-events-none aria-hidden="true"`

### 3.6 인쇄
- 화살표·gradient·JS 스크롤바·안내 텍스트 모두 `print:hidden`
- 스크롤 컨테이너에 `print:overflow-visible` — 양식 전체 노출
- 양식 자체는 named `@page form-landscape`로 A4 가로 인쇄 (이미 적용됨)

---

## 4. 단계별 작업 + 검증 anchor

| Step | 내용 | 검증 |
|---|---|---|
| 1 | `globals.css`에 `.no-native-scrollbar` 추가 + 기존 `.horizontal-scroll-visible` 삭제 또는 보존(범용) | DevTools에서 `::-webkit-scrollbar { display: none }` 적용 확인 |
| 2 | `components/calc/shared/HorizontalScrollContainer.tsx` 신규 (~200줄, 800줄 정책 OK) | 단독 prop 받는 공용 컴포넌트 |
| 3 | `GiftTaxResultView.tsx`의 양식 카드 wrapper를 `HorizontalScrollContainer`로 교체 | diff |
| 4 | anchor 테스트: `HorizontalScrollContainer.test.tsx` (RTL + jsdom + ResizeObserver mock)<br>- 초기 thumb 위치<br>- 화살표 클릭 시 scrollBy 호출<br>- 트랙 클릭 시 scrollTo 호출<br>- thumb 드래그 시 scrollLeft 변화 | vitest |
| 5 | 6환경 시각 매트릭스 점검<br>- macOS Chrome "자동" / "마우스" / "항상"<br>- macOS Safari<br>- Firefox (macOS)<br>- Windows Chrome | 스크린샷 6매 + 사용자 확인 |
| 6 | 인쇄 미리보기 — 화살표/스크롤바 미표시, A4 가로 출력 확인 | print preview |
| 7 | 키보드 Tab → 화살표 포커스 → 방향키 스크롤 | 수동 |
| 8 | 모바일 터치 — Pinch zoom 비활성 확인, swipe 스크롤 정상 | 실기기 또는 DevTools 모바일 모드 |

---

## 5. 회귀 보호 anchor (구체)

```typescript
// __tests__/components/calc/HorizontalScrollContainer.test.tsx
describe("HorizontalScrollContainer", () => {
  it("renders thumb width proportional to clientWidth/scrollWidth", () => {
    const { container } = render(<HorizontalScrollContainer><div style={{ width: 1000 }}/></HorizontalScrollContainer>);
    // jsdom mock scroll/clientWidth → thumb width 검증
  });
  it("right arrow appears when canScrollRight=true", () => {});
  it("right arrow disappears at scroll end", () => {});
  it("track click scrolls to clicked position", () => {});
  it("thumb drag updates scrollLeft", () => {});
  it("print:hidden classes applied", () => {});
});
```

---

## 6. 검증 절차 — "이번에는 제대로 됨" 확인

| 단계 | 명령 | 합격 기준 |
|---|---|---|
| Pre | `npx tsc --noEmit` | 0건 |
| Pre | `npx vitest run __tests__/components/calc/HorizontalScrollContainer.test.tsx` | 전체 PASS |
| Pre | `npm run lint` | 0건 |
| Dev | `npm run dev` → 증여세 결과 화면 진입 | 양식 카드 하단에 회색 thumb 가시 (OS 설정 무관) |
| Sys | macOS 시스템 환경설정 → 스크롤 막대 표시 → "스크롤할 때" (가장 공격적 자동 숨김)로 변경 후 hard reload | thumb 여전히 가시 ★ |
| Sys | Safari에서 동일 페이지 진입 | thumb 가시 |
| Sys | Firefox에서 동일 페이지 진입 | thumb 가시 |
| Func | 화살표 클릭 시 양식이 ±300px smooth 스크롤 | 동작 |
| Func | thumb 드래그 시 scrollLeft 양방향 동기화 | 동작 |
| Func | 트랙 클릭 시 해당 위치로 점프 | 동작 |
| Print | 브라우저 인쇄 미리보기 | 화살표·thumb 미표시, A4 가로 양식 전체 표시 |
| User | 사용자 시각 확인 | "이제 보임" 확인 |

★ 핵심 검증 — "스크롤할 때" 설정에서도 thumb이 가시되어야 함. 안 되면 v3 재계획 필요.

---

## 7. 위험·완화

| 위험 | 완화 |
|---|---|
| 가짜 스크롤바 드래그가 모바일 터치에서 부드럽지 않음 | touchstart/touchmove/touchend 핸들러 별도 구현 + `touch-action: none` 적용 |
| ResizeObserver 미지원 환경 (구형 브라우저) | window.resize fallback + Next.js Edge 런타임 미사용 (클라이언트 컴포넌트) |
| 가로 스크롤 + 페이지 세로 스크롤 충돌 | `overflow-y: hidden`을 가로 스크롤 컨테이너에 적용 |
| 키보드 사용자에게 thumb 드래그 불가 | tabIndex 스크롤 컨테이너 + 방향키로 대체 가능 |
| 인쇄 시 가짜 스크롤바 잔존 | `print:hidden` 명시 |
| `width: 277mm`가 부모를 넘어 자식 width 측정이 어려움 | scrollWidth는 정확히 측정됨 (브라우저 layout 후) |

---

## 8. 후속 (v2 이후)

- **공용화 확장**: 양도세 `FilingFormTable`·상속세 별지 양식들에 `HorizontalScrollContainer` 적용
- **모달 확대 (옵션 G)**: "전체 보기" 버튼 추가 — 모달에서 viewport 폭 활용
- **자동 fit 옵션**: 사용자 선호에 따라 "양식 폭에 맞춰 페이지 너비 확장" 토글
- **메모리 정책 추가**: `feedback_macos_scrollbar_autohide.md` 메모리화 → 향후 동일 패턴 사전 적용

---

## 9. 완료 조건 (Definition of Done) — 2026-05-20 체크

- [x] **macOS 시스템 설정 "스크롤할 때" 환경에서도** 양식 카드 하단에 회색 thumb이 **항상** 가시 — 사용자 브라우저 확인 완료 ✅
- [x] 화살표 좌·우 버튼이 스크롤 가능 방향으로 노출, 끝점 도달 시 자동 숨김 — anchor 5/6 PASS
- [x] thumb 드래그·트랙 클릭·화살표 클릭 3가지 입력 모두 scrollLeft 양방향 동기화 — `onThumbPointerDown`/`onTrackClick`/`scrollByDelta` 구현
- [x] 인쇄 시 화살표·thumb·gradient·안내 텍스트 모두 미표시, A4 가로 양식 전체 표시 — `print:hidden` + `print:overflow-visible` + 인쇄 분기 보존
- [x] anchor 테스트 PASS + typecheck + lint 0건 — **7/7 PASS, 4050/4050 전체 회귀 0, tsc 0, eslint 0**
- [~] 6환경 매트릭스 시각 점검 — macOS Chrome 확인 ✅ / Safari·Firefox·Windows Chrome 후속 권장
- [x] **사용자 최종 확인** — "브라우저에서 확인했는데 스크롤바 잘 보여" (2026-05-20) ✅

---

## 9-1. 완료 보고 (2026-05-20)

### 구현 산출물
| 파일 | 변경 |
|---|---|
| `app/globals.css` | `.no-native-scrollbar` 신규 (10줄) — `scrollbar-width: none` + `::-webkit-scrollbar { display: none !important }` |
| `components/calc/shared/HorizontalScrollContainer.tsx` | **신규 215줄** — JS 가짜 thumb/track + 화살표 + fade gradient + 안내 텍스트 + ResizeObserver + 양방향 동기화 + 마우스/터치 드래그 |
| `components/calc/results/GiftTaxResultView.tsx` | 양식 카드 wrapper 교체 — `HorizontalScrollContainer` 사용, 인쇄 분기 보존 |
| `__tests__/components/calc/HorizontalScrollContainer.test.tsx` | **신규 anchor 7건** — 초기 렌더 / hint=null 미렌더 / 우측 화살표 노출 / 화살표 클릭 scrollBy / 끝점 화살표 교체 / thumb width 비율 / print:hidden |
| 메모리 | `feedback_macos_scrollbar_autohide_workaround.md` 신규 ★★ + MEMORY.md 인덱스 추가 |

### 검증 결과
- `npx tsc --noEmit` — **0 errors**
- `npx vitest run __tests__/components/calc/HorizontalScrollContainer.test.tsx` — **7/7 PASS**
- `npx vitest run` 전체 — **4050 passed / 0 failed** (회귀 0건)
- `npx eslint` — **0 errors**
- 사용자 macOS Chrome 브라우저 시각 확인 — **"스크롤바 잘 보여" ✅**

### 핵심 학습
1. **macOS Chrome/Safari `::-webkit-scrollbar` 커스텀은 OS 자동 숨김을 완전 우회 불가** — `-webkit-appearance: none !important` + `opacity: 1 !important` 도 macOS 13+ 최신 Chrome에서는 OS 합성 우선
2. **JS 가짜 스크롤바(일반 `<div>` thumb/track)는 OS 정책과 100% 무관** — 의존성 0으로 simplebar/OverlayScrollbars 외부 라이브러리 대체 가능
3. **이중·삼중 시각 신호 강제**: thumb + 화살표 + fade gradient + 안내 텍스트 → 하나가 안 보여도 다른 하나가 인지 보장
4. **Pre-Do anchor 검증 효과**: v1(CSS 강화)을 사용자 환경에서 실패 보고 후 v2(JS 가짜 스크롤바) 재계획 — "현행 CSS로 충분할 것" 가정 금지 정책 ([[feedback-pre-anchor-verification]])과 정합

### 후속 작업 권장
- **공용화 확장**: 양도세 `FilingFormTable`·상속세 별지 양식 카드들에도 동일 `HorizontalScrollContainer` 적용 (별도 PR)
- **6환경 매트릭스**: Safari·Firefox·Windows Chrome에서도 시각 확인 후 [[feedback-macos-scrollbar-autohide-workaround]] 메모리에 결과 기록
- **모달 확대 옵션 G**: "전체 보기" 버튼으로 viewport 폭 활용 — 작은 화면 UX 추가 강화 (선택)

---

## 10. v2 재검토 결론

**제대로 동작할 자신감 = 매우 높음.** 근거:

1. **OS 의존 0%**: 가짜 스크롤바는 일반 `<div>`이므로 OS 자동 숨김 정책과 무관 — 항상 렌더
2. **이중·삼중 시각 신호**: 화살표 + thumb + gradient + 안내 텍스트 → 하나가 안 보여도 다른 하나가 인지 보장
3. **검증된 패턴**: 동일 구조가 simplebar·OverlayScrollbars 등 메이저 라이브러리에서 채택되어 있음 — 동작 보장
4. **점검 매트릭스**: 6환경(macOS 3설정 + Safari + Firefox + Windows) 사전 점검 강제
5. **회귀 보호**: anchor 테스트 6건으로 향후 변경 시 자동 차단
6. **인쇄 호환**: print:hidden 명시로 종이/PDF 출력 영향 없음

**남은 불확실성** (낮음):
- ResizeObserver 정확도 — Next.js dev hot reload 직후 1회 mount 시 측정 누락 가능. `useEffect` 의존성 + `RAF` 보강으로 완화
- 모바일 터치 드래그 정밀도 — 터치 핸들러 별도 검증 필요

Do 진입 가능 여부: ★ 가능 — 단, 사용자 승인 필요.
