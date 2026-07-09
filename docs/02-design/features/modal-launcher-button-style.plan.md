# 모달 런처 버튼 스타일 통일 — 작업 계획

> 브랜치: `feat/modal-btn-green` (워크트리 `.claude/worktrees/ui-label`)
> 작성일: 2026-07-10 · 기준: origin/master (PR#551 반영)
> 결정(사용자 확정): ① 범위 = **계산·조회 헬퍼 + 이력 런처** (항목 추가/편집 제외) · ② 구현 = **신규 Button variant + native→Button 변환**

---

## 0. 요약 (TL;DR)

"하위 모달을 여는 런처 버튼"(예: "3시점 건물기준시가 일괄 계산")이 **스타일 규칙 없이 6+종 제각각**(Button outline / violet solid / native rose·sky·emerald·indigo·violet 칩 / underline 링크)이다. 사용자가 하나의 톤("자동" 배지 = 연녹색)으로 통일 요청.

해결: `components/ui/button.tsx` `buttonVariants`에 **`modalLauncher` variant 1개**(연녹색, light·dark) 신설 → 모든 계산·조회·이력 런처 버튼을 `variant="modalLauncher"`로 통일. native `<button>` 런처는 shadcn `<Button>`으로 변환. 이미 인라인 className으로 바꾼 2개(`PhdBuildingStdPriceModalButton`·`BuildingStdPriceModalButton`)도 variant로 리팩터해 **단일 소스화**.

---

## 1. 배경 · 문제 (실측 — 병렬 분류 2에이전트)

### 1.1 런처 버튼 스타일 불일치 (통일 대상 — 확정 범위)

프로젝트는 shadcn `DialogTrigger` 대신 **제어형 `<Dialog open onOpenChange={setOpen}>` + 별도 트리거 버튼(`onClick={()=>setOpen(true)}`)** 패턴 사용. 모달을 여는 런처 버튼이 세목마다 손으로 스타일링돼 제각각:

| # | file:line (트리거) | 라벨 | 현재 스타일 | 여는 모달 | 유형 |
|---|---|---|---|---|---|
| 1 | `components/calc/building-std-price/PhdBuildingStdPriceModalButton.tsx:253` | 3시점 건물기준시가 일괄 계산 | `Button outline xs` + 인라인 녹색(✅이번 커밋) | 3시점 일괄 | calc |
| 2 | `components/calc/building-std-price/BuildingStdPriceModalButton.tsx:98` | 건물 기준시가 계산 | `Button outline xs` + 인라인 녹색(✅) | 단건 | calc |
| 3 | `components/calc/building-std-price/CompositePartsSection.tsx:110` | 건물 특성으로 계산 / 다시 계산 | `Button default sm` **violet solid** | AdjustmentRateModal | calc |
| 4 | `components/calc/building-std-price/BuildingStdPriceForm.tsx:706` | 건물 특성으로 계산 열기 | `Button outline sm` | AdjustmentRateModal | calc |
| 5 | `components/calc/building-std-price/BuildingStdPriceForm.tsx:697` | 다시 계산 | native `<button>` **violet underline (인라인 링크 — §3.2 F4 별도처리)** | AdjustmentRateModal(재오픈) | calc |
| 6 | `components/calc/deemed-gift/DeemedGiftCalculator.tsx:106` | 수정 | native `<button>` **rose 칩** | DeemedDetailModal(상세입력) | calc |
| 7 | `components/calc/transfer/SalesCaseSection.tsx:86` | 실거래가 자동조회 (RTMS) | native `<button>` **sky bordered** | RtmsSimilarSalesModal | 조회 |
| 8 | `components/calc/inheritance/estate-card/variants/EstateBodyRealEstate.tsx:426` | 자동조회 | native `<button>` **sky 칩** | RtmsSimilarSalesModal(동일 모달, 다른 스타일!) | 조회 |
| 9 | `components/calc/inheritance/unlisted-stock-v2/UnlistedStockV2Card.tsx:244` | 📂 이력 조회 | native `<button>` **indigo 칩** | UnlistedStockHistoryModal | history |
| 10 | `components/calc/transfer/FamilyBusinessInheritanceTransferSection.tsx:163` | 📋 이력 조회 | native `<button>` **emerald solid** | FamilyBusinessInheritanceHistoryModal | history |
| 11 | `components/calc/PriorGiftInput.tsx:143` | 📋 이력에서 조회 | native `<button>` **violet 칩** | PriorGiftHistoryModal | history |
| 12 | `app/calc/transfer-tax/multi/MultiTransferTaxCalculator.tsx:102,~164,594` | 📂 이력에서 불러오기 | `Button outline` (3곳, 중간 사이트 라인 근사 F8) | MultiTransferHistoryLoadModal | history |

**11 파일 · 14 트리거 사이트** (F9 정정). 동일 모달을 서로 다른 스타일로 여는 경우(#7·#8 RtmsSimilarSalesModal / #12 MultiTransfer ×3)까지 있어 불일치가 확연.

> **[Do 환류 2026-07-10]** 인벤토리 누락 1건 발견: `CompositePartsSection`의 **부분-수준 "특성 계산" 런처 쌍**(다시계산 인라인 링크 + "부분 특성으로 계산 열기" chip, `setOpenPartIdx`→Dialog). #3 건물-수준과 동일 계열이라 Do에서 함께 변환(chip→`modalLauncher`, 링크→녹색). → 최종 **12 파일 · 15 chip 사이트 + 인라인 링크 2개(녹색)**.

### 1.2 함정 (실측 확인)

- **다수가 native `<button>`**(#5·6·7·8·9·10·11) — shadcn `<Button>`이 아니라 variant 적용 전 **구조 변환** 필요(className만이 아님).
- **기존 semantic 톤 보유**: sky=자동조회·rose=수정·indigo/violet/emerald=이력. 녹색 통일 시 이 톤 의미 소실(사용자 확정 — 일관성 우선).
- **disabled 상태 처리**: #7·8·11 등은 disabled 시 muted/gray 분기 보유 → variant 전환 시 `<Button disabled>` 기본 처리로 대체(개별 disabled className 제거).
- **이모지 접두(📂/📋)**: 라벨에 포함 — 유지(변경 대상 아님).

### 1.3 제외 (X — 통일 대상 아님, 확정)

- **항목 추가/편집 에디터 런처**(사용자 제외): `LandParcelSection`(+필지)·`HousesListSection`(편집·+주택)·`PresumedInheritanceInput`·`CohabitantDependentSection`·`DebtAllocationInput`·`PropertyValuationForm`·`StockValuationForm`·`HeirComposition`·`ClientSelectStep`. → "+add" affordance 유지.
- **X-help**: `TaxHelp` ⓘ 아이콘 팝오버.
- **X-reference**: `LawArticleModal`·`precedent-article-modal`(인용 링크로 열림 — 버튼 아님).
- **X-dropdown**: 종목명 autocomplete·`SigunguSelect`·`address-search`(드롭다운·Dialog 아님).
- **X-confirm**: 토글 OFF·삭제·폐기 확인 다이얼로그 다수.
- **X-not-modal / X-inmodal**: `SimultaneousGiftCard`·`Step1Estate`·`gift-tax-form-shared`(SectionAddButton→인라인 add 패널)·`exemption/ExemptionChecklist`(`setDetailsOpen` 펼침 토글) · 모달 내부 apply/close 버튼. (F10 — 모두 Dialog 아님, 완전성 위해 명시)

---

## 2. 목표 · 비목표 · 성공 기준

### 2.1 목표
1. `buttonVariants`에 **`modalLauncher` variant** 1개 신설(연녹색, light·dark) — 단일 소스.
2. §1.1 런처 버튼 ≈14 사이트를 `variant="modalLauncher"`로 통일(native → `<Button>` 변환 포함).
3. 이미 인라인으로 바꾼 2개도 variant로 리팩터(중복 제거).
4. `components/calc/CLAUDE.md`에 "모달 런처 버튼 = `modalLauncher` variant" 규칙 신설.

### 2.2 비목표 (Simplicity First)
- 모달 내용·동작 변경 **아님**(트리거 버튼 스타일만).
- 항목 추가/편집(+add) 버튼·드롭다운·도움말·확인 다이얼로그 **불변**.
- 라벨 텍스트·이모지 **불변**.
- 버튼 크기(size) 재설계 **아님**(기존 size 유지, 색만 통일).

### 2.3 성공 기준 (검증 가능)
- [ ] §1.1 ≈14 트리거 사이트 전부 `variant="modalLauncher"` (grep 확인).
- [ ] native `<button>` 런처(#5·6·7·8·9·10·11) → `<Button>` 변환 완료(해당 파일에서 런처용 native `<button>` 0).
- [ ] native 변환 시 **data-testid·title 보존** — 참조 테스트 2건(`gift-deemed-detail-modal.spec.ts`·`UnlistedStockHistoryModal.test.tsx`) 통과 (F1).
- [ ] **size 매핑**: text-sm 런처(#7)는 `size="default"`(14px 보존), text-xs 런처는 `xs`/`sm` (F2).
- [ ] 인라인 녹색 className 2개 제거 → variant로 대체.
- [ ] `npx tsc --noEmit` 0건.
- [ ] 앵커: `<Button variant="modalLauncher">` 렌더가 연녹색(computed `background-color` = green-100 톤) — light·dark.
- [ ] 회귀: 전체 vitest 0 fail(스타일 변경, 계산 무관) + 대표 모달 E2E(열림·동작 유지).
- [ ] `components/calc/CLAUDE.md` 규칙 문서화.

---

## 3. 설계 — `modalLauncher` variant (단일 소스)

### 3.1 variant 정의
`components/ui/button.tsx` `buttonVariants` `variant`에 추가 — **"자동" 배지(`LandPriceLookupField:141` = `bg-green-100 text-green-700`, dark 미정의)와 전 테마 동일**하도록 배지 클래스 그대로 + hover만 (단일 문자열):

```tsx
modalLauncher:
  "border-green-200 bg-green-100 text-green-700 hover:bg-green-200 hover:text-green-800",
```

- **[F3] dark override 없음**: 배지가 dark 미정의라 variant에 `dark:` 톤을 넣으면 **다크모드에서 버튼≠배지**("배지와 같이" 위반). `bg-green-100`+`text-green-700`은 자체 대비가 테마 무관 → dark에서도 연녹색 pill로 정상, 배지와 동일. (dark 정교화는 배지+variant 동반 별건.)
- **[F6] aria-expanded 규칙 제거**: 런처는 `DialogTrigger`가 아닌 plain `onClick={()=>setOpen(true)}`라 aria-expanded 미설정 → 죽은 규칙(넣지 않음).
- **[F7] 단일 문자열**(기존 variant 관례).
- **[F13] 이름 `modalLauncher`**(camelCase — 기존 lowercase 관례와 다르나 cva/TS 유효, 유지).
- `size`는 §3.2 매핑대로(색뿐 아니라 텍스트 크기 보존).

### 3.2 native `<button>` → `<Button>` 변환 원칙
- native `<button className="... 칩">` → `<Button type="button" variant="modalLauncher" size={...} onClick=...>`(라벨·onClick·이모지 보존).
- **[F1] 속성 전량 보존 (High)**: `data-testid`·`title`·`aria-*`를 반드시 유지(`<Button>`은 `...props` 통과). 실측: #6 `deemed-edit-btn`(`DeemedGiftCalculator:109`)·#9 `open-unlisted-stock-history-modal`(`UnlistedStockV2Card:248`)는 **실제 테스트가 참조**(`e2e/gift-deemed-detail-modal.spec.ts`·`__tests__/components/calc/UnlistedStockHistoryModal.test.tsx`) → 누락 시 셀렉터 깨짐. 변환 후 이 2개 테스트 실행 게이트.
- **[F2] size 매핑 정정 (High)**: Button `xs`·`sm`은 **둘 다 text-xs(12px)**, `default`만 text-sm(14px)(button.tsx:23-26). ∴ `text-xs` 런처→`size="xs"`(또는 `sm`), **`text-sm` 런처(#7 RTMS)→`size="default"`**(14px 보존). 임의 축소 금지.
- **[F5] disabled**: 개별 disabled className(gray/muted)은 제거하되 **정보성 `title`/사유(#11 PriorGift 모드별)는 `<Button title=... disabled=...>`로 보존**.
- **[F4] #5 "다시 계산"은 인라인 underline 링크**("%" span 뒤 inline flow) → chip 강제 시 정렬 이질. `variant="link"` 녹색 또는 인라인 유지로 **별도 처리**(P1 시각 확인).
- `import { Button }` 추가(ESLint --fix 함정: 신규 import 한 줄 한 named).

---

## 4. 마이그레이션 전략 (Phase)

| Phase | 내용 | verify |
|---|---|---|
| **P0** | `modalLauncher` variant 신설(button.tsx) + 이름 확정 + 앵커(RTL: variant 렌더 녹색 light·dark) | `tsc` · 앵커 PASS |
| **P1** | building-std-price 4곳(#1~5) variant 전환 — 인라인 녹색 2개 제거·violet solid/링크 통일 | `tsc` · 대표 모달 열림 확인 |
| **P2** | calc·조회 런처 native 변환(#6 deemed 수정·#7·8 RTMS 자동조회) → `<Button variant>`. **testid 보존(F1)** | `tsc` · **`e2e/gift-deemed-detail-modal.spec.ts` 통과**(deemed-edit-btn) · RtmsSimilarSalesModal 열림(2경로) |
| **P3** | 이력 런처 native·outline 변환(#9·10·11·12) → variant. **testid 보존(F1)** | `tsc` · **`__tests__/components/calc/UnlistedStockHistoryModal.test.tsx` 통과** · 각 History 모달 열림 |
| **P4** | `components/calc/CLAUDE.md` 규칙 + (선택) 휴리스틱 grep 체크 + 메모리 | 문서·grep |

- 커밋 위생: Phase별 분리. 각 native 변환은 라벨·onClick·disabled·조건부 렌더 보존 확인(diff 정독).

---

## 5. 강제 방식 (타이포보다 약함 — 명시)

모달 런처는 "이 버튼이 모달을 여는가"를 정적으로 판정하기 어려워 타이포(grep 0건)만큼 **하드 게이트가 어렵다**. 3중:
1. **variant = 정본 스타일**(단일 소스) — 신규 런처는 `variant="modalLauncher"` 사용이 자연스러움.
2. **문서**: `components/calc/CLAUDE.md`에 "모달 여는 런처 버튼 = `modalLauncher` variant, native `<button>` 신규 금지" 규칙.
3. **[F12] grep 대안**: `onClick={...setOpen(true)...}` 인접 Button 휴리스틱은 `handleOpen` 간접·native 미포착이라 무용. 대신 **"모달 여는 native `<button onClick=...Open(true)>` 신규 금지"** grep가 더 실효(런처는 `<Button variant="modalLauncher">`만) — 이 마이그레이션으로 런처 native 0이 되므로 신규 native 런처를 감지. 여전히 soft(리뷰 보조), 하드블록 아님.

---

## 6. 검증 전략

1. **앵커(주 검증)**: RTL/vitest로 `<Button variant="modalLauncher">` 렌더 → className에 `bg-green-100`·`text-green-700`·`hover:bg-green-200` 포함 단언(dark 클래스 없음 — F3, 전 테마 동일). 결정론적. (computed color는 Playwright로 대표 런처 1곳 보조 확인)
2. **모달 동작 회귀**: 각 대표 모달(3시점 일괄·RTMS·MultiTransfer 이력·DeemedDetail)이 버튼 클릭 시 여전히 열리는지 E2E 스모크(native→Button 변환이 onClick·조건부 렌더 깨뜨리지 않았는지).
3. **계산 회귀**: 전체 vitest(스타일 무관이므로 0 fail 기대 — fail 시 변환 오염 신호).
4. **시각(light·dark)**: 대표 런처 스크린샷으로 녹색·대비 확인. **[F11] #10 FamilyBusiness는 emerald solid→soft 녹색이라 강조 약화** 확인. **#7·#8은 동일 RtmsSimilarSalesModal 진입점**이라 변환 후 두 곳 시각 일치 확인.
5. **정적**: `tsc` 0 · 런처 native `<button>` 0(변환 완료) grep.

---

## 7. 리스크 · 미결정

| 항목 | 리스크 | 대응 |
|---|---|---|
| variant 이름 | `modalLauncher` vs `launcher` vs `soft-green` | P0 확정 |
| native 변환 회귀 | onClick·disabled·조건부 렌더·layout(width) 변화 | 파일별 diff 정독 + 모달 열림 E2E |
| semantic 톤 소실 | sky=조회·rose=수정 의미 사라짐(사용자 확정) | 라벨 텍스트가 의미 담당(색은 "모달 열기" 신호로 재정의) |
| 녹색 과다 | "자동" 배지·emerald 요소와 인접 시 녹색 과밀 | 시각 확인 후 톤 미세조정 여지(green-100 유지 기본) |
| disabled 대비 | 변환 후 disabled 가독성 | `<Button disabled>` opacity-50 기본 + 확인 |
| 이번 커밋 2개 | 인라인 className 잔존 시 dual-truth | P1에서 반드시 variant로 치환(인라인 제거) |

---

## 8. 다음 단계
1. (선택) `plan-design-self-review-loop`로 본 계획 검토.
2. P0(variant 신설 + 앵커) 착수.
3. Phase별 커밋 → ship.

## 참고
- 인벤토리 근거: §1 (병렬 분류 2에이전트 실측 file:line).
- 관련: `single-source-engine-helper`(단일 소스 원칙) · 타이포 표준화([[project_ui_label_typography_standardization]] — 동일 "정본 단일화" 패턴).
