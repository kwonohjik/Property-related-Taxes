# 전 세목 네비게이션 버튼 통일 계획서

> 상단 헤더 + 하단 네비게이션 버튼을 **방금 수정된 양도세(단건) 화면 스타일**로 프로젝트 전체에서 통일.
> 작성일 2026-07-24. 기준 구현: `app/calc/transfer-tax/TransferTaxCalculator.tsx`.

## 1. 배경·문제

각 세목 계산기가 상·하단 네비게이션 버튼의 className을 **인라인 복붙**해 왔고, 세목마다 독립 수정되며 스타일이 드리프트됨. 공유 컴포넌트는 `HomeButton`·`SaveButton`·`ResetButton` 3종뿐이고, **이전/다음/CTA 버튼은 공유 컴포넌트가 없어** 세목별로 rounded·padding·text 크기·아이콘 크기·팔레트가 제각각.

방금 양도세 화면에서 확정한 기준을 전 세목에 적용하되, **재발 방지를 위해 공유 컴포넌트로 추출**하는 것이 이 계획의 핵심.

## 2. 기준(Canonical) 스펙 — 양도세 단건 화면

검증 위치: `TransferTaxCalculator.tsx` (2026-07-24 수정 완료).

### 2-1. 상단 헤더 네비 (라인 457~474)
- 컨테이너: `flex items-center gap-2`
- `<HomeButton confirmMessage=… [onBeforeNavigate] />` — pill (공유)
- **이전** (조건 `isResult || currentStep > 0`):
  `inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring`
  + `<ChevronLeft className="h-3.5 w-3.5" />`
- `<SaveButton />` (공유) · `<ResetButton />` (공유)

### 2-2. 하단 네비 (라인 709~769)
- 컨테이너: `flex items-center justify-between gap-2`
- **이전/홈으로**: 상단 이전과 **동일 클래스** (step 0에서 라벨만 "홈으로")
- **다음**: 동일 outline 클래스 + 뒤에 `<ChevronRight className="h-3.5 w-3.5" />`
- **계산 CTA**(계산하기·가산세 계산하기·+양도 건 추가·공통 설정으로):
  `rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-60 transition-colors`
  — 전체폭(`flex-1`) 아님, **글자 폭**. 복수 CTA는 `flex gap-2` 그룹으로 우측 배치. 아웃라인 CTA는 `border border-primary text-primary hover:bg-primary/10`.

## 3. 현황 매트릭스 (검증된 file:line)

| 세목 | 파일 | 상단 헤더 | 하단 이전/다음 | 하단 CTA | 드리프트 |
|---|---|---|---|---|---|
| **양도세(단건)** | `TransferTaxCalculator.tsx` | ✅ 기준 | ✅ 기준 | ✅ 기준 | — (기준) |
| 양도세(다건) | `transfer-tax/multi/MultiTransferTaxCalculator.tsx` :89-90,187,510-511,723 | Home+Reset, `ArrowLeft/ArrowRight` 아이콘 사용 | 이전(:187)·홈으로(:510 `h-3.5`)·(:723 `h-4`) 혼재 | :706 등 | 아이콘/혼재 |
| 주식양도세 | `stock-transfer-tax/StockTransferTaxCalculator.tsx` :151-153,205-215 | ✅ Home/Save/Reset | 이전 `px-4 py-2 rounded-lg border-slate-200 text-slate-600` `w-4 h-4`; 다음 `px-6 py-2 rounded-lg bg-sky-600 text-white` | sky-600 | **팔레트(slate/sky)**·rounded-lg·아이콘 |
| 취득세 | `AcquisitionTaxForm.tsx` :368-380 (+`acquisition/Step0.tsx` :71-72) | Save(폼)+Home/Reset(Step0) | 이전 `flex-1 rounded-md border-input px-4 py-2 text-sm` `w-4 h-4`; 다음 `flex-1 rounded-md bg-primary px-4 py-2` | `flex-1` | **전체폭**·아이콘·text-sm |
| 증여세 | `GiftTaxForm.tsx` :340-348,380-408 | ✅ Home/Save/Reset | 컨테이너 `justify-between`✅; 이전 `rounded-md border-border px-5 py-2 text-sm gap-1` `w-4 h-4`; 다음 `rounded-md bg-primary px-6 py-2 "다음 →"`(텍스트 화살표) | px-6 | 패딩·아이콘·"다음 →" |
| 상속세 | `InheritanceTaxForm.tsx` :700-704,776-795 | ✅ Home/Save/Reset | 증여세와 동일 패턴 | px-6 | 패딩·아이콘·"다음 →" |
| 재산세 | `PropertyTaxForm.tsx` :171,250-270 (+`property/Step0.tsx` :84-85) | Save(폼)+Home/Reset(Step0) | 컨테이너 `flex justify-between pt-2`; 이전 `px-5 py-2 rounded-md border` `w-4 h-4`; CTA `px-5 py-2 rounded-md bg-primary` | px-5 | 패딩·아이콘 |
| 종부세 | `comprehensive-tax/page.tsx` :55-90(`NavButtons`),549-554 (+`Step1Basic.tsx` :187-188) | Save+Home/Reset | `NavButtons`: 이전 `flex-1 rounded-md border-input px-4 py-2`; 다음 `flex-1 rounded-md bg-primary px-4 py-2` | `flex-1` | **전체폭**·아이콘 |
| 증여의제 | `deemed-gift/DeemedGiftCalculator.tsx` :139,154 | Home only | 단일 제출 `w-full rounded-lg bg-slate-800 px-4 py-2.5 text-white` | slate-800 | **팔레트(slate)**·전체폭 |

드리프트 유형 정리:
- (A) **전체폭 `flex-1`/`w-full` CTA** — 취득세·종부세·증여의제
- (B) **비표준 팔레트** — 주식(sky/slate)·증여의제(slate-800)
- (C) **아이콘 크기** `w-4 h-4` → 기준 `h-3.5 w-3.5` (전 세목)
- (D) **패딩·텍스트 크기** px-4/5/6·text-sm → 기준 이전/다음 `px-3 py-1.5 text-xs`
- (E) **"다음 →" 텍스트 화살표** — 증여·상속 → 기준 `ChevronRight` 아이콘
- (F) **상단 "이전" 버튼 부재** — 입력 단계 상단에 이전 버튼은 현재 **양도세만** 존재
- (G) **컨테이너 클래스** `flex-1 split` / `border-t pt-6` / `justify-between` 혼재

## 4. 접근 — 공유 컴포넌트 추출 (드리프트 재발 방지)

인라인 클래스 복붙이 드리프트의 근본 원인. `ui/button.tsx`가 이미 `cva` 기반 variant 시스템(`default`·`outline`·`modalLauncher`)을 가지고 있음(`components/ui/button.tsx:6-27`). 이를 토대로 **네비 전용 공유 컴포넌트**를 `components/calc/shared/`에 신설:

### 4-1. 신규 컴포넌트 `components/calc/shared/WizardNav.tsx`
```tsx
// 컴팩트 아웃라인 이전/다음 — 상단·하단 공용
export function NavButton({ direction, label, onClick, disabled, ... }: {
  direction: "prev" | "next"; label: string; ...
}) // prev→ChevronLeft, next→ChevronRight (h-3.5 w-3.5), 기준 outline 클래스 단일 소스

// 글자 폭 primary/아웃라인 CTA
export function CtaButton({ tone = "solid", ... }) // solid=bg-primary, outline=border-primary
```
- 기준 클래스 문자열을 **이 파일에만** 둔다(단일 소스). 세목은 `<NavButton>`·`<CtaButton>`만 사용.
- 상단 헤더 "이전"도 `<NavButton direction="prev" />` 재사용 → 상단·하단 완전 동일 보장.
- (선택) `<WizardNavBar>` 래퍼(`flex items-center justify-between gap-2`)로 컨테이너까지 통일.

### 4-2. 종부세 `NavButtons`(page.tsx:55) → 내부를 `NavButton`/`CtaButton`으로 교체
기존 로컬 컴포넌트 시그니처 유지, 구현만 공유 컴포넌트로 위임.

### 4-3. 상단 "이전" 버튼 전 세목 확대 (F)
현재 양도세만 상단에 이전 노출. **전 세목 상단 헤더**에 `isResult || step > 0` 조건으로 `<NavButton direction="prev" />` 추가 → 상단/하단 일관.

## 5. 세목별 작업 목록 (Do 순서)

1. **공유 컴포넌트 신설** `WizardNav.tsx` (`NavButton`·`CtaButton`[·`WizardNavBar`]) + 단위 렌더 테스트.
2. **양도세 단건**: 인라인 → 공유 컴포넌트로 리팩터(동작·모양 불변 확인 — 회귀 기준선).
3. **증여세·상속세**: 하단 이전/다음/CTA 교체("다음 →"→`NavButton next`), 상단 이전 추가.
4. **취득세·종부세**: `flex-1` 제거→`CtaButton`(글자폭), 이전/다음 교체, 상단 이전 추가. 종부세는 `NavButtons` 내부 교체.
5. **재산세**: 컨테이너·이전/CTA 교체, 상단 이전 추가.
6. **양도세 다건**: `ArrowLeft/Right`→`NavButton`, 홈으로/이전 혼재 정리.
7. **주식양도세**: 팔레트 결정(§6-1)에 따라 sky/slate→표준 토큰 or 유지, 이전/다음 교체.
8. **증여의제**: 단일 제출 버튼 slate-800→`CtaButton`(결정 §6-1), 필요 시 이전 버튼.

## 6. 결정 필요 항목 (Do 착수 전 확정)

### 6-1. 비표준 팔레트 표준화 여부 (주식=sky/slate, 증여의제=slate-800)
- (a) **표준 토큰으로 통일**(border/primary) — 진짜 "전 세목 통일". 주식양도세의 sky 테마 정체성 상실.
- (b) 이전/다음 **모양·크기만** 통일하고 **색은 세목 테마 유지**.
- → 권장: (a) 완전 통일(사용자 요청 "전체화면 통일" 취지에 부합). 단 주식 sky 테마가 의도적이라면 (b).

### 6-2. 하단 CTA 폭
- 기준 = **글자 폭**(px-5, `flex-1` 아님). 취득세·종부세·증여의제의 전체폭을 글자폭으로 전환 확정.
- 모바일에서 전체폭 탭 편의 상실 가능 — 기준대로 글자폭 적용(사용자가 양도세에서 이미 선택).

### 6-3. 상단 "이전" 버튼 전 세목 확대(F) 적용 여부
- → 권장: 적용(상·하단 일관). 미적용 시 상단은 세목마다 이전 유무가 갈림.

## 7. 검증 계획

- **E2E 셀렉터 영향**: 하단 버튼은 대부분 **텍스트("이전"·"다음"·"계산하기" 등)**로 셀렉 → 클래스 변경은 셀렉터 무영향. `getByText/getByRole('button', {name})` 유지 확인. "다음 →"(증여·상속)→"다음"은 **셀렉터 텍스트 변경** 주의(E2E grep 필요).
- **RTL 단위 테스트**: `WizardNav` 컴포넌트 렌더(prev=ChevronLeft/next=ChevronRight, disabled, 라벨) + `afterEach(cleanup)`.
- **회귀**: `npm run typecheck` + 세목별 컴포넌트 테스트 + 전체 `npm test`.
- **브라우저 수동/E2E 스크린샷**: 세목별 상단·하단 캡처로 기준 화면과 동일 확인.
- **pre-push 게이트**: 임의 px(`text-[Npx]`) 미사용·톤 하드코딩 없음(`scripts/check-*.sh`) 통과.

## 8. 리스크·범위 외

- **리스크**: (1) "다음 →"→"다음" E2E 텍스트 셀렉터 깨짐 → 사전 grep 후 동시 수정. (2) 주식 sky 팔레트 제거 시 결과 화면 등 잔여 sky 요소와 불일치 — 팔레트 결정(§6-1) 후 일괄. (3) `flex-1` 제거로 모바일 레이아웃 변화 — 세목별 육안 확인.
- **범위 외**: 결과 화면 내부 액션 버튼(다시 계산하기·조건 변경 재계산 등 — 네비게이션 아님), 모달 런처 버튼(`variant="modalLauncher"`), 법령/도움말 링크, `/law`·`/history`·`/profile`·`/tools` 등 비-계산기 페이지 헤더.
- **비목표**: 네비게이션 **로직**(step 전환·검증) 변경 없음 — 오직 시각적 통일 + 공유 컴포넌트 추출.

## 9. 완료 정의(DoD)

- [ ] `WizardNav.tsx`(NavButton·CtaButton) 신설 + 단위 테스트
- [ ] 8개 계산기 상·하단 네비 공유 컴포넌트로 교체(인라인 nav 클래스 0건 grep 확인)
- [ ] 상단 "이전" 전 세목 노출(§6-3 확정 시)
- [ ] 팔레트 결정(§6-1) 반영
- [ ] `npx tsc --noEmit` 0건 · 전체 test 통과 · E2E 텍스트 셀렉터 회귀 0
- [ ] 세목별 브라우저 캡처로 기준 일치 확인
