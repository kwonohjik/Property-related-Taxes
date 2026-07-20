# 계획서 — 홈으로 버튼 전역 통일 (이미지7 모양)

## 0. 목표

프로젝트 전역의 "홈으로" 버튼을 이미지7 모양 — **집 아이콘(`Home`) + 얇은 회색 테두리 pill + "홈으로" 텍스트** — 단일 컴포넌트로 통일한다. 현재 5개 변종·아이콘 2종(집/ChevronLeft)·테두리 유무가 혼재.

## 1. 현황 전수 조사 (실측)

### 변종 A — `HomeButton` (표준 후보, 이미지7에 가장 근접)
`components/calc/shared/HomeButton.tsx` — `Home` 아이콘 + `rounded-md border border-border bg-background px-3 py-1.5 text-xs text-muted-foreground` + "홈으로". `confirmMessage`(입력 이탈 확인)·`onBeforeNavigate`(stale 정리)·`label` prop 지원. **이미지7과의 유일한 차이: `rounded-md` (이미지7은 `rounded-full` pill)**.

사용처 11 (헤더 우측 배치):
- `app/tools/building-standard-price/page.tsx`
- `app/calc/comprehensive-tax/page.tsx` · `Step1Basic.tsx`
- `app/calc/stock-transfer-tax/StockTransferTaxCalculator.tsx`
- `app/calc/transfer-tax/TransferTaxCalculator.tsx` · `multi/MultiTransferTaxCalculator.tsx`
- `components/calc/InheritanceTaxForm.tsx` · `GiftTaxForm.tsx`
- `components/calc/property/Step0.tsx` · `acquisition/Step0.tsx`
- `components/calc/tools/StockValuationTool.tsx`

### 변종 B — `HomeLink` (테두리 없는 텍스트링크, breadcrumb 스타일)
`components/ui/home-link.tsx` — `ChevronLeft` + `text-xs text-muted-foreground` 링크(테두리 없음). 페이지 좌상단 breadcrumb.

사용처 10:
- `app/guide/transfer-tax/page.tsx:57,462`
- `app/law/page.tsx:15,31`
- `app/profile/page.tsx:12,23`
- `app/history/page.tsx:17` (하단)
- `app/help/acquisition-tax/page.tsx:59,164`
- `components/layout/HeaderHomeLink.tsx:13` (계산 이력 헤더 — 직전 PR에서 추가)

### 변종 C — `HomeLinkButton` (전체폭 rounded-lg 버튼)
`components/ui/home-link.tsx` — `ChevronLeft` + `rounded-lg border py-2.5 text-sm` **전체폭**(`flex-1` 레이아웃). "다시 계산하기" 옆 등.

사용처 2:
- `app/calc/transfer-tax/error.tsx:39`
- `components/calc/results/BundledAllocationCard.tsx:609` (`className="flex-1"`)

### 변종 D — `HomeLinkButtonAsButton` (dead code)
`components/ui/home-link.tsx` — 사용처 0. **제거 대상**.

### 변종 E — 인라인 "이전/홈으로" 겸용 네비 버튼
마법사 StepWizard 하단 "이전" 버튼이 `step === 0`일 때 라벨만 "홈으로"로 바뀜. **순수 홈 버튼이 아니라 뒤로가기 네비와 겸용** (홈 이동 + 이전 스텝 이동 공용).

사용처 8:
- `app/calc/comprehensive-tax/page.tsx:75`
- `app/calc/stock-transfer-tax/StockTransferTaxCalculator.tsx:206`
- `app/calc/transfer-tax/TransferTaxCalculator.tsx:708`
- `app/calc/transfer-tax/multi/MultiTransferTaxCalculator.tsx:511,724`
- `components/calc/GiftTaxForm.tsx:387` · `InheritanceTaxForm.tsx:783`
- `components/calc/AcquisitionTaxForm.tsx:372` · `PropertyTaxForm.tsx:257`
- (유사) `components/calc/deemed-gift/DeemedGiftCalculator.tsx:155` — `← 홈으로` 인라인

> **주의**: 마법사 계산기는 이미 헤더에 변종 A(HomeButton)를 갖고 있고, 변종 E는 하단 네비의 겸용 버튼이다. 즉 홈 버튼이 화면당 2곳(헤더 A + 하단 E).

## 2. 목표 표준 컴포넌트

**변종 A `HomeButton`을 단일 표준으로 채택** (이미 집 아이콘 + 테두리 + confirm/onBeforeNavigate 지원). 이미지7에 맞춰 **`rounded-md` → `rounded-full`** 변경.

```
Home 아이콘(h-3.5) + rounded-full border border-border bg-background px-3 py-1.5 text-xs text-muted-foreground + "홈으로"
```

`HomeLink`가 필요한 breadcrumb 위치(변종 B)를 위해 **size/variant prop 추가**:
- `variant="pill"` (기본, 이미지7) — 테두리 pill
- `variant="block"` (전체폭) — 변종 C 흡수용 `rounded-lg` + `flex-1` 대응

## 3. 마이그레이션 계획

| 대상 | 조치 | verify |
|---|---|---|
| A. HomeButton | `rounded-md` → `rounded-full` 1곳 수정 → 11개 사용처 자동 반영 | 시각 확인 |
| B. HomeLink (10곳) | `HomeButton`(pill, confirm 없음)으로 교체. `home-link.tsx`의 `HomeLink` 제거 | 각 페이지 상단 pill 표시 |
| C. HomeLinkButton (2곳) | `HomeButton variant="block"`으로 교체 (전체폭 유지) | error·BundledAllocationCard 레이아웃 유지 |
| D. HomeLinkButtonAsButton | 삭제 (dead) | grep 0 확인 |
| E. 인라인 이전/홈 겸용 (8곳) | **결정 필요 (§4)** | — |
| F. deemed-gift `← 홈으로` | `HomeButton`으로 교체 | — |

- `components/ui/home-link.tsx` 전체 제거 가능 여부 확인 후 파일 삭제 (A로 완전 대체 시).
- 아이콘 통일: 모든 잔존 `ChevronLeft`(홈 맥락) → `Home`.

## 4. 결정 사항 (사용자 확정 · 2026-07-20)

**D-1. 목표 모서리 → `rounded-full` (완전 pill)** 확정. 현 `HomeButton`의 `rounded-md`를 `rounded-full`로 변경.

**D-2. 변종 E(마법사 하단 "이전/홈으로" 겸용 네비) → 통일 대상에서 제외** 확정. "이전" 버튼과 겸용하는 뒤로가기 네비라 홈 전용 pill로 바꾸면 "이전" UX가 깨진다. 마법사엔 이미 헤더에 변종 A(HomeButton)가 있어 통일된 홈 버튼이 존재 → **변종 E 8곳은 현행 유지**. (표 §3의 E 행은 조치 없음.)
- **변종 F(deemed-gift `← 홈으로`)**: 구현 시 코드 확인 — "이전"과 겸용이면 변종 E와 동일하게 제외, 순수 홈 이동이면 `HomeButton`으로 교체.

**D-3. 변종 C(전체폭 버튼) → `variant="block"`으로 전체폭 유지** (BundledAllocationCard는 "다시 계산하기"와 2-up flex 레이아웃이므로 pill 강제 금지).

## 5. 범위 밖

- 홈 이동 로직(`router.push("/")`·`confirmMessage`·`onBeforeNavigate`)은 변경하지 않음 — 모양·아이콘·컴포넌트 일원화만.
- 사이드바/결과뷰 등 "홈"과 무관한 네비 버튼 미포함.

## 6. 검증 기준

- [ ] `HomeButton` 단일 컴포넌트로 수렴, `home-link.tsx` 제거(또는 축소)
- [ ] 잔존 `ChevronLeft`(홈 맥락) 0건 — 전부 `Home` 아이콘
- [ ] `grep "HomeLink"` → HeaderHomeLink 내부 참조만 남거나 HomeButton으로 대체
- [ ] `npx tsc --noEmit` 0건, `npx eslint <변경파일>` 0건
- [ ] 브라우저 수동 확인: 홈·계산기·이력·가이드·법령·프로필 각 페이지 홈 버튼이 이미지7 모양으로 동일
