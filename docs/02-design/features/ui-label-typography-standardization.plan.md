# UI 라벨 타이포그래피 표준화 — 작업 계획

> 브랜치: `feat/ui-label` (워크트리 `.claude/worktrees/ui-label`, slot 1 · dev 3001 · E2E 3101)
> 작성일: 2026-07-10 · 기준 커밋: `a70ae297` (origin/master)
> 결정 사항(사용자 확정): ① 폰트 = **Pretendard 도입** · ② 범위 = **입력 마법사 우선 → 전체 확대** · ③ 강제 = **시맨틱 컴포넌트 + 정본 클래스(내장 스케일 + 커스텀 2종) + grep 차단 체크**
> — 원안 "명명 토큰 + ESLint"을 자가검토(F1 토큰 재중복·F3 ESLint 미포착/CI 비차단)로 정정. **크기값·계층은 불변, 구현만 단순화 — 사용자 veto 가능**.

---

## 0. 요약 (TL;DR)

라벨 타이포그래피에 **규칙이 없어** 개발할 때마다 폰트 크기·패밀리가 제각각이다. 실측 결과 임의 px 폰트 크기(`text-[8px]`~`text-[14px]`)가 **1,520회, 341개 파일**에 산재하고, 표준 스케일(`text-xs`/`text-sm`)과 **중복 표기**(`text-[12px]` ≡ `text-xs`)까지 섞여 있다. 폰트 패밀리는 `globals.css`의 **순환 참조 버그**로 Geist Sans가 실제로는 적용되지 않고, **한글 웹폰트가 없어** 기기별 OS 기본 폰트로 달리 렌더된다.

해결: (A) **역할 → 정본 클래스 스케일** 확정 — 온-스케일(12/14/16/18/24)은 Tailwind 내장 클래스를 정본으로 유지, 오프스케일(11/10)만 커스텀 유틸 2종(`text-caption`·`text-micro`) 신설(중복 재생산 차단) → (B) **Pretendard**를 단일 sans로 self-host + 깨진 배선 수정 → (C) 라벨 역할별 **시맨틱 컴포넌트** + **grep 기반 차단 체크**(`text-[Npx/rem/em]` 금지, pre-push 게이트)로 재발 원천 차단. 마이그레이션은 **공용 primitive 중앙 수정 → 기계적 중복 치환 → 입력 마법사 → 앱 전역** 순으로 단계화하고, 각 단계를 **computed-style/DOM 단언 + 세목별 E2E baseline + (폰트 확정 후) 레이아웃깨짐 스냅샷(light·dark)**으로 검증한다.

---

## 1. 배경 · 문제 (실측 데이터, 추정 아님)

### 1.1 폰트 크기 — 체계 부재 (수치 확인)

`app` + `components` 전체 `.tsx` 대상 grep 실측:

| 크기 클래스 | 사용 횟수 | 문제 |
|---|---:|---|
| `text-[10px]` | 790 | 토큰 없는 sub-xs. 캡션·배지·미세정보에 남발 |
| `text-[11px]` | 661 | 토큰 없는 sub-xs |
| `text-[9px]` | 43 | 극소, 토큰 없음 |
| `text-[12px]` | 13 | **`text-xs`(2,395)와 동일 크기 중복 표기** |
| `text-[13px]` | 6 | xs(12)·sm(14) 사이 비표준 |
| `text-[8px]` | 6 | 극소 |
| `text-[14px]` | 1 | **`text-sm`(1,356)과 동일 크기 중복 표기** |
| **임의 px 합계** | **≈1,520** | **341개 파일**에 분산 |
| `text-xs` (12px) | 2,395 | 표준 |
| `text-sm` (14px) | 1,356 | 표준 |
| `text-base` (16px) | 69 | 표준 |

**진단**: 공용 primitive(`FieldCard`·`SectionHeader` 등)는 그나마 일관적이나, 수백 개 개별 섹션 컴포넌트가 primitive를 우회하고 `text-[10px]`·`text-[11px]`를 손으로 찍는 것이 불일치의 진원지. 같은 역할(예: 보조설명)이 `text-xs`·`text-[11px]`·`text-[10px]`로 3가지로 나타난다.

### 1.2 현재 라벨 역할 계층 ↔ 크기 (공용 primitive 실측)

| 역할 | 위치 (file:line) | 현재 크기·굵기 |
|---|---|---|
| 계산기 페이지 제목 (h1) | `app/calc/transfer-tax/TransferTaxCalculator.tsx:456` | `text-2xl font-bold` |
| 마법사 단계 제목 (h2) | `TransferTaxCalculator.tsx:584` | `text-base font-semibold` |
| 섹션 헤더 제목 | `components/calc/shared/SectionHeader.tsx:25` | `text-base font-semibold` |
| 섹션 헤더 설명 | `SectionHeader.tsx:39` | `text-xs text-muted-foreground` |
| 서브섹션(색상카드) 제목 | `components/calc/CLAUDE.md` 패턴 §176~ | `text-xs font-semibold` + 번호배지 `text-[10px]` |
| 필드 라벨 | `components/calc/inputs/FieldCard.tsx:62` | `text-sm font-medium` |
| 필드 hint / 단위 / 배지 / 경고 | `FieldCard.tsx:73,82,86,89` | `text-xs` |
| ToggleCard 제목 / 설명 | `components/calc/inputs/ToggleCard.tsx:269,279` | `text-sm sm:text-base` / `text-xs` |
| RadioCardGroup 제목 / 설명 | `components/calc/inputs/RadioCardGroup.tsx:207,218` | `text-sm font-medium` / `text-xs` |
| 사이드바 섹션 라벨 | `components/calc/shared/WizardSidebar.tsx:130` | `text-sm font-semibold uppercase` |

**관찰**: `마법사 단계 제목`(h2)과 `섹션 헤더 제목`이 둘 다 `text-base`로 **계층이 붕괴**되어 있다("화면 입력 단계에 따라 체계적으로" 조정이 필요한 지점).

### 1.3 폰트 패밀리 — 배선 버그 (실측)

- `app/globals.css:10` → `--font-sans: var(--font-sans);` — Geist Sans 미배선. `app/layout.tsx:12-15`에서 Geist Sans를 `--font-geist-sans`로 import했으나 globals의 `--font-sans`가 이를 참조하지 않음 → `html @apply font-sans`(`globals.css:128`, `html{}` 소속 — `body`는 line 124에서 `bg-background/text-foreground`만)가 **Geist가 아닌 시스템 sans로 렌더**. (`--font-heading`도 line 12에서 `var(--font-sans)` 참조 → 동일. `--font-mono`는 line 11 `var(--font-geist-mono)` 정상.) **주의(F12): `--font-sans: var(--font-sans)`의 정확한 CSS 기전(순수 순환 → invalid vs Tailwind v4 기본 `--font-sans` 시스템 스택 self-inline)은 미검증 — 결론(Geist 미적용·한글 미통일)은 불변이나 정확 기전은 P0 computed-style 실측으로 확정.**
- **한글 웹폰트 부재**: Geist는 라틴 전용(한글 글리프 없음) → 한글은 항상 OS 기본(macOS Apple SD Gothic Neo / Windows Malgun Gothic / Linux Noto)으로 렌더 → **기기마다 다르게 보임**. 이것이 "폰트가 다 다르다"의 근본 원인.
- `font-mono`는 계산서 금액 칼럼 정렬용으로 650회 사용(`amount-column-align` 스킬) — **의도적, 표준화 대상 아님**.

---

## 2. 목표 · 비목표 · 성공 기준

### 2.1 목표
1. 역할별 **정본 크기 클래스**(내장 스케일 + 오프스케일 커스텀 2종)를 확정하고, 임의 크기 폰트(px/rem/em)를 제거한다.
2. **Pretendard**를 한글+영문 단일 sans로 self-host하고, 깨진 `--font-sans`/`--font-heading` 배선을 수정한다.
3. 라벨 역할별 **시맨틱 컴포넌트**와 **grep 기반 차단 체크(pre-push)**로 규칙을 강제한다.
4. `CLAUDE.md`에 **라벨 타이포그래피 규칙 섹션**을 신설(규칙 부재가 원인이므로).

### 2.2 비목표 (Simplicity First — 범위 밖 금지)
- 색상·간격·레이아웃 리디자인 **아님**(폰트 크기·패밀리에 국한).
- `font-mono` 금액 칼럼 **불변**.
- 결과 산식 문구·법정 용어 **불변**(라벨 크기만 조정, 텍스트 내용 불변).
- 신규 "유연성/설정 가능성" 남발 금지 — 크기 레벨 7종, 신규 커스텀 유틸은 2종(11·10)으로 최소화.

### 2.3 성공 기준 (검증 가능 — Goal-Driven)
- [ ] 임의 크기 폰트 사용 **0건**(대상 범위 내) — `grep -rEn 'text-\[[0-9.]+(px|rem|em)\]'`(px뿐 아니라 rem·em 포함 — F9) 로 확인. pre-push grep 체크가 신규 발생 차단.
- [ ] `text-[12px]`↔`text-xs`, `text-[14px]`↔`text-sm` 중복 표기 **0건**. **온-스케일 크기는 새 토큰명 신설 없이 내장 클래스로 정본화**(F1 — 토큰 레이어 재중복 금지).
- [ ] `globals.css`에서 `--font-sans`가 Pretendard 변수를 참조. 브라우저 computed `font-family`에 `Pretendard` 포함(**주 검증 = Playwright `getComputedStyle` 단언**).
- [ ] `npx tsc --noEmit` **0건**.
- [ ] 세목별 E2E baseline 대비 회귀 **0건**(계산 결과 불변 — 타이포그래피는 계산 무관).
- [ ] 레이아웃깨짐 스냅샷: **폰트 확정 후** 캡처한 baseline 대비, Phase별 변경이 **레이아웃 깨짐·오버플로 없음**(light·dark 양 테마). (F5 — 폰트 교체로 사전 baseline은 전량 diff라 무의미 → baseline은 폰트 확정 후)
- [ ] `CLAUDE.md` + `components/calc/CLAUDE.md`에 규칙 문서화.

---

## 3. 설계 A — 역할 기반 타이포그래피 스케일 (정본 = 내장 Tailwind 스케일 + 오프스케일 커스텀 2종)

"화면 입력 단계에 따라" = 마법사의 시각적 계층(페이지 → 단계 → 섹션 → 서브섹션 → 필드 → 보조)에 크기를 **단조 대응**. **핵심 원칙: 한 크기 = 한 정본 클래스**(중복 표기 재발 차단).

### 3.1 역할 → 정본 클래스 (동결 2026-07-10)

> ⚠️ **자가검토(F1) 반영 — 전략 정정**: 12/14/16/18px에 새 토큰명(`text-hint`/`text-field`/`text-section`/`text-step-title`)을 붙이면, 이미 일관되게 쓰이는 `text-xs`(2,395)/`text-sm`(1,356)/`text-base`(69)와 **중복 = 원래 병(`text-[12px]`↔`text-xs`)을 토큰 레이어에서 재생산**한다. 따라서 **온-스케일(12/14/16/18/24)은 Tailwind 내장 클래스를 정본으로 유지**하고, Tailwind에 **없는 오프스케일(11/10)만 커스텀 유틸 2종** 신설한다. 크기값·계층(사용자 확정)은 불변, 구현만 단순화(Simplicity First). — **사용자 veto 가능**.

| 역할 (입력 계층) | 크기 | **정본 클래스** | 표준 굵기 | 비고 |
|---|---:|---|---|---|
| 계산기 페이지 제목 (h1) | 24px | `text-2xl` (내장) | bold | `text-3xl` 있으면 강등 |
| 마법사 단계 제목 (h2) | **18px** ← 승격 | `text-lg` (내장) | semibold | 현행 `text-base`(16)에서 승격 |
| 섹션 헤더 제목 | 16px | `text-base` (내장) | semibold | |
| 필드 라벨 · 옵션 제목 | 14px | `text-sm` (내장) | medium | |
| hint · 설명 · 단위 · 배지 · 경고 · **서브섹션 제목** | 12px | `text-xs` (내장) | normal (서브섹션 semibold+tone) | |
| 캡션 · fine print · 보조 본문 | 11px | **`text-caption`** (신규 커스텀) | normal | Tailwind 미제공 |
| 번호배지 · pill · 상첨자 극소 chrome | 10px | **`text-micro`** (신규 커스텀) | — | Tailwind 미제공 |

**신규 커스텀 유틸은 `text-caption`(11)·`text-micro`(10) 단 2종.** 나머지 크기는 전부 Tailwind 내장 클래스를 정본화 → 마이그레이션 범위 = **임의 px(1,520) → 정본**만(온-스케일 3,751건은 이미 정본이라 불변).

**확정 사항**:
- **[결정1] 단계 제목 18px 승격** = `text-lg`. 유일한 의도적 시각 변화(현재 단계=섹션 16 붕괴 §1.2 해소). P0 baseline(폰트 확정 **후**)으로 확인.
- **[결정2] 서브섹션 제목 = `text-xs`(12) + semibold + tone색**. 11px 미채택(hint 12보다 작아지는 역전 계층 방지).
- **[결정3 정정 — F2] 커스텀 유틸은 font-size만** — §3.2. line-height 미포함(기존 `leading-*` 133회 충돌 회피).
- **[F8] caption↔micro 라우팅 규칙**: `text-micro`(10) = **비텍스트 chrome**(번호배지·pill·상첨자·각주번호). `text-caption`(11) = **실제 읽는 보조 텍스트**(표 부가설명·색상카드 note·chip 라벨).
- **고아 크기 배정(확정)**: `text-[8px]/[9px]` → 배지류면 `text-micro`(10)·텍스트면 `text-caption`(11)(sub-10 존치 불가). `text-[10px]`(790)·`[11px]`(661)은 위 라우팅으로 배정. `text-[12px]`(13)→`text-xs`, `text-[14px]`(1)→`text-sm`, `text-[13px]`(6)→기본 `text-xs`(라벨 문맥이면 `text-sm`).

### 3.2 커스텀 유틸 구현 (Tailwind v4 — font-size only)

`app/globals.css`에 오프스케일 2종만 정의. **font-size만 설정**(행간은 기존 `leading-*`가 계속 제어 — 결정3·F2):

```css
@utility text-caption { font-size: 0.6875rem; } /* 11px — line-height 미포함 */
@utility text-micro   { font-size: 0.625rem;  } /* 10px */
```

- 내장 `text-xs/sm/base/lg/2xl`은 각자 line-height를 포함하나 명시 `leading-*`가 있으면 덮음(현행 동작 불변). 커스텀 2종은 line-height 미포함이라 **충돌 자체가 없음**(F2 해소).
- 정의 위치(`@theme --text-*` vs `@utility`)는 P0에서 Tailwind v4 관례로 확정(필요 시 context7 확인). 크기만 갖는 단순 유틸이라 `@utility` 적합.
- **굵기는 토큰 미포함**(결정3): 역할별 표준 굵기(§3.1 표)는 시맨틱 컴포넌트에 내장 + CLAUDE.md 문서화로 강제. 기존 `font-*` 클래스 유지 → 마이그레이션 부담·유틸 우선순위 충돌 회피.

---

## 4. 설계 B — 폰트 통일 (Pretendard self-host)

### 4.1 도입 방식
- **Pretendard Variable**(OFL 1.1, 상업적 무료·재배포 허용)을 `next/font/local`로 self-host.
  - `PretendardVariable.woff2`를 리포에 배치(경로 P0 확정: `app/fonts/` 또는 `public/fonts/`) → `next/font/local`로 `--font-sans` 변수 부여.
  - **[F13] 용량 주의**: 한글 글리프 포함 Variable woff2는 용량이 크다 → P0에서 subset 전략(필요 글리프·`next/font` subset 옵션) 확인해 초기 로드 최적화.
  - CDN 미사용(CSP·오프라인·성능 안정). 파일 배치·라이선스 고지(NOTICE) P0 처리.
- `app/layout.tsx`: `geistSans`(라틴 전용) 대신 Pretendard를 `--font-sans`로 주입. Geist Mono는 유지(금액 칼럼). Geist Sans import 제거(고아 정리).

### 4.2 배선 수정
- `app/globals.css:10` `--font-sans: var(--font-sans);` → **Pretendard 변수 참조로 교정**(예: `var(--font-pretendard)`).
- `--font-heading`(line 12)도 정상 참조로 연쇄 수정.
- `<html>` className(`layout.tsx:59`)의 폰트 변수 배열 갱신.

### 4.3 검증
- Playwright로 `getComputedStyle(document.body).fontFamily`에 `Pretendard` 포함 실측(성공 기준 §2.3).
- 한글·영문·숫자 혼용 라벨 렌더 스냅샷 대조.

---

## 5. 설계 C — 강제 방식 (시맨틱 컴포넌트 + grep 차단 체크)

### 5.1 시맨틱 컴포넌트
개별 컴포넌트가 `<p className="text-[10px]...">`를 손으로 찍는 것을 막기 위해, 라벨 역할별 최소 primitive를 신설/확장:

| 컴포넌트 | 역할 | 비고 |
|---|---|---|
| (기존) `FieldCard` | 필드 라벨·hint·단위·배지·경고 | 내부를 토큰으로 치환(중앙 수정) |
| (기존) `SectionHeader` | 섹션 제목·설명 | 정본 클래스 치환 |
| (기존) `ToggleCard`/`RadioCardGroup` | 옵션 제목·설명 | 정본 클래스 치환 |
| (신규) `StepTitle` | 마법사 단계 제목 (h2, `text-lg` semibold) | **[F6]** step-title 18 승격 적용점이 세목별로 다르고 공유 컴포넌트가 없음 → 단일 `StepTitle`로 통일(적용점 1곳, 재발 차단). 각 Calculator의 하드코딩 h2 치환 |
| (신규) `Caption` | 색상카드 밖 보조 캡션·미세정보 | `text-caption`/`text-micro` 래핑. 손으로 찍던 `text-[10px]`/`[11px]` 대체 |
| (신규) `SubsectionTitle` | 색상카드 서브섹션 제목+번호배지 | CLAUDE.md §176 패턴을 컴포넌트화(제목 `text-xs semibold`, 번호배지 `text-micro` 내장) |

- 신규 컴포넌트는 **실제 반복 패턴이 있는 것만**(Simplicity First). 색상카드 서브섹션(§176 패턴)·캡션·단계 제목이 최다 반복 → 우선 대상.
- **[F6] step-title 적용점 실측 필요**: `<h2 text-base font-semibold>` 패턴은 `transfer-tax`·`stock-transfer-tax`만 매치(각 Calculator에 하드코딩), 나머지 세목은 마크업 상이. P1에서 세목별 단계 제목 렌더 지점을 enumerate 후 `StepTitle`로 통일.

### 5.2 강제 방식 — grep 기반 차단 체크 (ESLint AST 아님)

**[F3 정정]** 실측 결과 ESLint className-AST 규칙은 부적합:
- 이 코드베이스는 `className={cn("text-[10px]", …)}`로 arbitrary 크기를 **`cn()`/`clsx` 콜 인자 문자열**(~158건)과 **template literal**(58건)에 보유 → className **속성**만 검사하는 no-restricted-syntax는 대부분 미포착.
- `eslint-plugin-tailwindcss` 미설치. `ci.yml:29`가 이미 `npm run lint` 실행하나 **master 브랜치 보호가 없어 CI는 머지를 차단하지 않음**(기록용, CLAUDE.md) → ESLint error만으로 하드블록 불가.

**결론**: 정규식 **grep 기반 차단 체크**를 정본 강제 수단으로 채택(텍스트 기반이라 `cn()`·template literal·className 전부 포착):
- 패턴: `text-\[[0-9.]+(px|rem|em)\]` 발견 시 실패. `font-mono`·색상 등 다른 arbitrary는 대상 아님(폰트 크기만).
- 배치: **pre-push hook**(진짜 게이트 — tsc+test와 동렬)에 grep 0건 체크 추가 + CI(`ci.yml`)에 기록용 병행. (선택) no-restricted-syntax를 IDE 조기경고용 보조로 추가 가능하나 하드블록은 grep이 담당.

---

## 6. 마이그레이션 전략 (Phase 분해)

각 Phase는 독립 커밋 + verify. 대규모 치환은 codemod(텍스트 치환 sed/스크립트)로 기계화하되, 문맥 판단이 필요한 건 사람이 배정. **[F10] codemod 대상 = className 안의 크기 클래스 문자열만**(template literal·`cn()` 인자 포함) — **텍스트(자식) 노드는 절대 불변**(법정용어·"원"·산식 텍스트 보호).

| Phase | 내용 | 규모 | verify |
|---|---|---|---|
| **P0 기반** | 커스텀 유틸 2종(`text-caption`·`text-micro`) 정의(globals.css) + Pretendard 도입·배선 수정 + grep 차단 체크 골격 + **폰트 확정 후 baseline(light·dark) 캡처** | 소 | `tsc` 0건 · `getComputedStyle` font=Pretendard 단언 · baseline 저장 |
| **P1 step-title 승격 + primitive 감사** | **[측정 환류 2026-07-10]** 4대 primitive(`FieldCard`·`SectionHeader`·`ToggleCard`·`RadioCardGroup`)는 **이미 정본 클래스만 사용 → 치환 불필요**(임의 px 0). 실제 변경 = **마법사 단계 제목 h2 4곳(`transfer-tax`:584 + `stock-transfer-tax`/steps Step1·2·3) `text-base`→`text-lg`(16→18)**. step-title h2는 10개 계산기 중 이 2세목만 존재(나머지는 heading 없음 — 추가는 리디자인=범위 밖). `StepTitle` 컴포넌트는 4곳·2변형이라 과추상(Simplicity) → 직접 클래스 치환 + P5 문서화로 강제. `Caption`·`SubsectionTitle`·`components/ui/*` 마이그레이션은 **실사용 시점(P3/P4)로 이관**(미사용 컴포넌트 선생성 금지) | 소(4파일) | 앵커: step-title h2=18px · `tsc` · transfer/stock E2E 회귀 0 |
| **P2 기계적 중복 치환** | `text-[12px]`→`text-xs`, `text-[14px]`→`text-sm`, `text-[13px]`→`text-xs`(라벨 문맥은 `text-sm`). **온-스케일 내장 클래스로 정본화**(F1). 안전한 1:1 sed | 소(≈20건) | grep 0건 · `tsc` |
| **P3 입력 마법사** | 입력 단계 컴포넌트의 `text-[8/9/10/11px]` → `text-micro`/`text-caption`(§3.1 라우팅). **신규 `Caption`·`SubsectionTitle` 컴포넌트를 여기서 첫 신설·적용**(P1에서 이관 — 미사용 선생성 회피). **[F4] 대상 glob = `app/calc/**/*.tsx` + `components/calc/**`, 단 `components/calc/results/**` 제외(P4)**. 세목 dir 비균일(`steps/`는 transfer·stock만; 나머지는 `app/calc/{tax}/*.tsx`+`components/calc/{tax}/**` 인라인) + 추가 마법사 3종(`gift-deemed`·`inheritance` 사후관리·`family-business` 사후관리) 포함 | 대(입력 화면 한정) | 세목별 E2E baseline · 단계별 레이아웃깨짐(light·dark) |
| **P4 앱 전역 확대** | `components/calc/results/**`(73파일)·별지 서식·도구(`/law`·`/history`) 잔여 임의 크기 정리. **className만 치환, 텍스트 노드 불변(F10)** | 대 | 결과/신고서 레이아웃 · besshi anchor 테스트(계산·텍스트 불변) |
| **P5 문서·게이트** | `CLAUDE.md`+`components/calc/CLAUDE.md` 규칙 섹션 + **pre-push grep 체크 활성화**(F3) + CI 병행 + 메모리 기록 | 소 | pre-push에서 grep 0건 차단 동작 확인 · 규칙 문서 리뷰 |

- **범위 결정 반영**: P3(입력 마법사)까지가 사용자 우선순위, P4(전역)는 후속. P0~P3를 1차 배포, P4~P5를 2차로 나눌 수 있음.
- **커밋 위생**: Phase마다 ship 또는 PR 분리(회귀 격리). ESLint `--fix` 함정(CLAUDE.md) 주의 — 신규 import 한 줄 한 named.

---

## 7. 검증 전략

타이포그래피 변경의 최대 리스크는 **레이아웃 깨짐**(줄바꿈·오버플로)이다. 계산 로직은 불변이므로 숫자 회귀는 없어야 정상.

> **[F5] 시각회귀 인프라 현실**: 이 repo는 `playwright.config.ts`에 `screenshot:"only-on-failure"`(디버깅용)만 있고 `toHaveScreenshot`/`toMatchSnapshot` **0건** — 스냅샷 회귀 미설정. 게다가 **이 작업이 폰트를 교체**하므로 사전 캡처 baseline은 전량 diff가 되어 순진한 스냅샷 회귀는 원리상 무의미. → 주 검증을 **DOM/computed-style 단언**으로 두고, 스냅샷은 **폰트 확정(P0) 후** 캡처해 **레이아웃 깨짐 탐지 한정**으로만 사용.

1. **주 검증 — DOM/computed-style 단언 (핵심)**: 워크트리 `E2E_PORT=3101`. Playwright로 ⑴ `getComputedStyle(el).fontFamily`에 `Pretendard` 포함, ⑵ 대표 라벨 역할 요소의 `fontSize`가 정본값(step-title 18·field 14·caption 11·micro 10)과 일치, ⑶ 오버플로/줄바꿈 깨짐 없음(clientWidth ≤ scrollWidth 등)을 **단언**. (memory: 브라우저 확인은 Playwright E2E, 수동 안내 금지)
2. **레이아웃깨짐 스냅샷 (보조)**: **P0에서 폰트 확정 후** 각 세목 마법사 대표 단계 baseline을 **light·dark 양 테마**(F7)로 캡처 → Phase마다 대조. `toHaveScreenshot` 하네스를 P0에서 최소 구성(또는 표적 스크린샷 저장·비교). 변경이 "의도된 크기 조정"인지 육안+diff 확인.
3. **계산 회귀 baseline**: `npm test`(vitest) 전량 + 세목별 E2E. 타이포 변경으로 계산·엔진 anchor가 깨지면 **오염 신호**(즉시 조사). (memory: `feedback_blocking_validation_full_e2e_regression` baseline 대조)
4. **정적 게이트**: `npx tsc --noEmit` + `npm run lint` + `grep -rEn 'text-\[[0-9.]+(px|rem|em)\]'` **0건**(F9 — px·rem·em).

---

## 8. 리스크 · 미결정 사항

| 항목 | 리스크/질문 | 대응 |
|---|---|---|
| 스케일 최종값 | **확정·동결(2026-07-10)**: step-title 18(`text-lg`) 승격·서브섹션 12 semibold·온-스케일 내장 정본화·오프스케일 2종만 커스텀. 유일한 시각 변화는 step-title 18 | P0 baseline(폰트 후)으로 step-title 승격만 육안 확인 |
| Pretendard 배치·라이선스·용량 | woff2 경로·NOTICE·**한글 글리프 포함 Variable woff2 용량 큼(F13)** | P0에서 subset 전략 확인(`next/font/local` subset·필요 글리프). 라이선스 NOTICE 동봉 |
| 대규모 codemod 오염 | 텍스트 치환이 의도치 않은 변경 | **className 안의 크기 클래스만**(template literal·`cn()` 포함), **텍스트 노드 불변**·건별 diff 리뷰·Phase 분리(F10) |
| 800줄 정책 | 신규 컴포넌트 추가로 파일 팽창 | 별도 파일 분리(`StepTitle.tsx`·`Caption.tsx`·`SubsectionTitle.tsx` 등) |
| 강제 게이트 실효 | **CI lint는 비차단(master 보호 없음, CLAUDE.md) → ESLint error로 하드블록 불가** | **grep 체크를 pre-push(진짜 게이트)에 추가**(F3). CI는 기록용 병행 |
| grep 오탐/누락 | `font-mono` 오검출·rem/em 누락 | 패턴 `text-\[[0-9.]+(px\|rem\|em)\]`(폰트 크기만, F9). `font-mono`·색상 arbitrary 미대상 |

---

## 9. 다음 단계

1. ~~계획서 자가검토~~ **완료(2026-07-10)** — `plan-design-self-review-loop` 3-way fork 병렬 검토 → **16건 정정**(Critical 1·High 4·Medium 4·Low 4 + blast-radius 3). verdict = **clean(결함)** + 사용자 확인 1건(F1 토큰 전략 정정·F3 grep 전환은 원안 대비 구현 변경 — veto 가능).
2. 사용자 확인 후 **Phase 0**(커스텀 유틸 2종 + Pretendard·배선 + grep 체크 골격) 착수 → **Pre-Do 앵커: 폰트 확정 후 대표 마법사 1개 baseline(light·dark) 우선 확보** + `getComputedStyle` 단언.
3. Phase별 ship/PR 분리(P0~P3 1차, P4~P5 2차).

**진행 결과(2026-07-10)**: P0~P5 전량 구현·로컬 커밋 완료(6커밋 dcd2c7d0~) — 임의 크기 폰트 **1521→0**, Pretendard self-host 배선, step-title 16→18 승격, 커스텀 유틸 `text-caption`/`text-micro`, **pre-push grep 게이트 활성화**, `components/calc/CLAUDE.md` 규칙 신설. 앵커 3건 PASS(Pretendard·step-title=18·micro=10/caption=11) · 전체 vitest **10261 passed / 0 failed**. **미푸시**(승인 후 ship).

---

## 참고
- 실측 근거: 본 문서 §1 (grep 결과·file:line). 재현: 워크트리에서 `grep -rohE 'text-\[[0-9]+px\]' app components --include='*.tsx' | sort | uniq -c`.
- 관련 규칙: `amount-column-align`(금액 칼럼 불변), `components/calc/CLAUDE.md` §176(색상카드 패턴), `feedback_browser_verify_with_playwright`, `feedback_blocking_validation_full_e2e_regression`.
