# 작업 계획서 — 양도세 자산입력 점진적 노출 (접기 섹션 + 라벨 요약 헤더)

> 상태: Plan (13단계 자가검토 완료 · Do 대기) · 작성 2026-06-29 · 대상 `components/calc/transfer/CompanionAssetCard.tsx`
> 한 줄 요약: **모달 없이** 자산 카드(732줄·내용 섹션 24개)를 `① 기본 / ② 양도 / ③ 취득 / ④ 필요경비 / ⑤ 기타특례` **5개 접기 섹션**으로 재구성. 접힌 헤더는 **금액 없이 "방식 라벨 + 입력여부"만** 표시(금액 합계는 기존 사이드바=단일 진실). `AssetForm`·API·validate **무변경**, 14지점 중 **⑤ UI만** 변경.

> 자가검토 이력: 독립 검토자 3인(실측·정책·누락) 병렬 → 정정 20+건(Critical 2·High 4) 반영. 키스톤 정정 = **헤더 금액 제거(라벨 전용)** → dual-truth·G3 충돌·요약 8종 커버리지·자기모순 동시 해소.

---

## 1. 배경 · 결정 경위

사용자 불만(원문): *"아래쪽으로 계속 스크롤하면서 입력 → 무엇을 어디에 입력할지 직관적으로 파악하기 힘들고 스크롤 압박이 심함."*

확정 사실:
- **불만 두 겹**: (1) 다건 누적 스크롤, (2) 자산 1건이 732줄 거대 폼.
- **피벗 = 단건이 일반적**: 일괄양도 토글 기본 단건(`Step1.tsx:32`). across-asset(모달/테이블)은 부차, **within-card 밀도(2)가 dominant**.
- **모달 기각**: 모달은 within-card 밀도를 못 줄임(732줄이 모달로 이동할 뿐) + Dialog focus-trap 중첩 비용. 사용자도 **단건 위주·최소 스크롤·전반 파악** 명시 선호.
- **결정**: 레버1(카드 내부 점진적 노출) + 레버2(섹션 landmark·인덱스). 모달·테이블·dispatcher 분리는 비범위(§9).

---

## 2. 실측 인벤토리 (file:line 검증 완료 — 독립검토 R1 전수 대조)

### 2-1. 대상 — `components/calc/transfer/CompanionAssetCard.tsx` (732줄)

하나의 루트 `<div>`(L121) 안에 **내용 섹션 24개**(+ 배너·헤더)가 **평면 나열**. 루트 div 실제 = `cn("border rounded-lg p-4 space-y-4 scroll-mt-24", 조건부 tone)` + **`data-asset-card-index={index}`**(L122) — 둘 다 **보존 대상**(§4-6 C1). 파일 **최하단 L727–731에 `import { ReplotReductionFields, ReplotIncreaseFields }`** 존재 → ① 추출 시 함께 이동(누락 시 ReferenceError).

| # | 섹션 | 라인 | 조건 |
|---|---|---|---|
| (배너) errorMessage·dateOrderWarning | 130–140 | 검증/경고 시 | |
| (헤더) 자산 N·종류·배지·삭제 | 141–173 | 항상 | |
| 1 자산 종류 라디오 | 175–207 | 항상 |
| 2 겸용주택 토글 | 209–213 | housing |
| 3 소재지 검색 | 215–277 | 항상 |
| 4 입주권 조합원 유형 | 279–308 | right_to_move_in |
| 5 자산 명칭 | 310–322 | 다건 |
| 6 면적 정보(+Replot) | 324–423 | land |
| 7 토지 성격 | 425–432 | land |
| 8 공유 지분율 | 434–444 | 항상 |
| 9 지분 모드 안내 | 446–472 | 지분<100% |
| 10 양도 정보(TransferModeBlock) | 474–482 | 항상 |
| 11 부담부증여 안내 | 484–503 | burdened_gift |
| 12 양도가액(CompanionSaleModeBlock) | 504–533 | 대부분 |
| 13 취득원인 세부(CompanionAcquisitionCauseSection) | 535–541 | 항상 |
| 14 신축 부수토지 한도 | 543–551 | 신축+housing |
| 15 companion 토지 세율 오버라이드 | 553–561 | land 비주자산 |
| 16 다필지(취득시기 상이) | 563–605 | land |
| 17 겸용 확장 패널 | 607–617 | housing+겸용ON |
| 18 상업용건물 블록 | 619–626 | commercial_building |
| 19 일반건물 블록 | 628–635 | general_building |
| 20 재개발 블록 | 637–640 | redevelopment_apt |
| 21 필요경비 | 642–687 | 항상 |
| 22 legacy 단일 필드 | 689–699 | legacy 로드 |
| 23 NBL 정밀 판정 | 701–706 | land+NBL 판정도움 |
| 24 장기임대 거주주택 특례 | 708–720 | housing/RTMI |

→ 732줄 = 800줄 정책 임계. 분해 필수(§4-6).

### 2-2. 호스트·리스트

- `app/calc/transfer-tax/steps/Step1.tsx`(208): 폼-전역 양도일·신고일(72–103)·일괄양도 토글+총양도가액/총양도비/안분(113–183) → `CompanionAssetsSection`.
- `components/calc/transfer/CompanionAssetsSection.tsx`(90): `assets.map → CompanionAssetCard`, "+ 자산 추가"(다건만, L83), `errorAssetIndex===idx` 카드에 `errorMessage` 전달(L79).
- **`app/calc/transfer-tax/TransferTaxCalculator.tsx:176` `scrollToAssetCard()`**: `document.querySelector('[data-asset-card-index]')?.scrollIntoView()` — 검증 오류(L168·694) 시 해당 카드로 스크롤. **C1 보존 contract**.

### 2-3. 재사용 프리미티브 (R1 실측 확인)

| 컴포넌트 | 위치 | 판정 |
|---|---|---|
| `CollapsibleHintCard` | `components/calc/shared/CollapsibleHintCard.tsx` | **패턴만 참고**. `text-xs`(L54) + 주석 *"검증 오류·차단 경고·법정 한도 넣지 말 것"*(L17–18) → 입력/검증 컨테이너 부적합. `summary+toggle+hidden print:block`(L64) 구조 차용 |
| `ExpandToggleButton` | `components/calc/results/shared/ExpandToggleButton.tsx` | **최종 미사용**(Do 환류) — AssetSection이 자체 셰브론 헤더로 구현(§4-1). cross-layer import·P1 우려 자체 소멸 |
| `SectionHeader` | `components/calc/shared/SectionHeader.tsx` | 접기 없는 단순 헤더 |
| `ToggleCard` | `components/calc/inputs/ToggleCard.tsx` | Switch boolean 모드 토글 → 단순 섹션 접기 의미 부적합 |

→ 입력 전용 접기 컨테이너 `AssetSection` 신규(§4-1).

### 2-4. 검증·합계 (단일 진실)

- `validateStep(step, form)`/`validateStepDetailed(...)`: `transfer-tax-validate.ts:242,247`. **`ValidationIssue`는 `assetIndex`+`message`만(L24,30) — section/field 키 없음**(H2 근거).
- `validateAssetAcquisition(asset, label, formTransferDate)`: `transfer-tax-validate-asset.ts:170`.
- `getAssetDateOrderError(asset, transferDate)`: 사용처 `CompanionAssetCard:118`(비차단 경고).
- `computeTransferSummary(formData, result)`: `calc-wizard-store.ts:358`. **per-asset 산식은 reduce 콜백 내부 인라인(L372–397) — export 안 됨** → 헤더가 금액을 재계산하면 dual-truth(H1 근거). **헤더는 금액 미표시**로 회피, 금액 합계는 이 함수(사이드바)가 단일 진실.

---

## 3. 목표 · 성공 기준 (측정 가능)

- **G1 (스크롤 ↓)**: 단건 자산 진입 시 초기 세로 높이 ≤ 기존 **~30%**. 전부 접힘 시 = 헤더 + 칩바 + 5 섹션 헤더만.
- **G2 (전반 파악)**: 접힌 각 섹션 헤더가 **방식 라벨 + 입력여부**를 표시(금액 제외 — 예 "③ 취득 · 매매 · 환산취득가 · 입력됨"). 금액 합계는 사이드바.
- **G3 (무변경 증명)**: `git diff` — `lib/stores/calc-wizard-asset.ts`·`calc-wizard-store.ts`(타입·computeTransferSummary 산식)·`transfer-tax-api.ts`·`transfer-tax-validate*.ts` 로직 **0**.
- **G4 (회귀 0)**: 영향 E2E **전수 enumerate**(§5-D) 후 baseline green 대비 회귀 0 · `npx tsc --noEmit` 0건 · 양도 엔진 테스트 통과.
- **G5 (오류 비은닉)**: 검증 차단 오류 시 **5개 섹션 전부 forceOpen** + 상단 배너 + 해당 카드 자동 스크롤(C1).
- **G6 (800줄)**: 신규·수정 전 파일 < 800줄 (sub-component별 추정 §4-6).
- **G7 (자동 노출)**: assetKind 변경·겸용 토글 ON 등 **다른 섹션 필드를 드러내는 컨트롤**은 대상 섹션을 자동 펼침(`feedback_ui_toggle_auto_visibility_policy`). "토글 켰는데 변화 없음" 0건.

---

## 4. 설계

### 4-1. 신규 프리미티브 `AssetSection`

```
components/calc/transfer/AssetSection.tsx
props: { num; title; tone; summary; status:"filled"|"empty"; open; onToggle; forceOpen?; children }
```

- **외형 — 내부 블록 번호와 시각 구분(M1)**: 아코디언 레벨은 **굵은 제목 + 큰 번호 배지**(예 `text-sm font-bold` + `rounded-md` 채움), 내부 블록의 `h-5 w-5 text-[10px]` 원형 배지와 크기·굵기로 구분. 내부 블록 번호 패턴은 그대로 둠.
- **tone 전 슬롯 리터럴 Record(M2 — dynamic `bg-${tone}` 금지)**: `Record<Tone,{card,border,badgeBg,badgeText,title}>`에 실사용 **5개 tone(sky·emerald·amber·slate·violet)** × 슬롯 × 다크변형을 **리터럴 문자열**로 직접 매핑. 구현자가 보간 못 하도록 §4-1에 표로 동결(컴파일러가 tone 누락 catch).
- **접기 토글**: 자체 셰브론(▸/▾) 헤더로 구현 — `ExpandToggleButton`(결과뷰용 작은 링크 스타일) **미사용**(Do 환류: M1 "굵은 헤더+큰 배지"와 스타일 상충, cross-layer import 자체 소멸).
- **forceOpen**: `open || forceOpen`이면 본문 렌더. 접힘 본문 `hidden print:block`(인쇄 자동 펼침).
- **상태 소유**: 부모 `CompanionAssetCard` 로컬 `useState`. **useEffect→store 미러링 금지**.
- **a11y 계약(M3)**: 헤더 = `<button aria-expanded={open}>`, 키보드 토글 지원. 중첩된 `ExpandToggleButton`은 `stopPropagation`이므로 헤더-클릭 영역과 분리. 칩 클릭으로 펼칠 때 해당 섹션 첫 포커서블로 focus 이동.

### 4-2. 섹션 그룹 매핑 (UI 순서 = 엔진 순서 **불변** — R1 경계 검증)

평면 순서(§2-1)에 그룹 경계만 긋는다. 라인 연속(472/474, 533/535, 640/642, 699/701) 확인 — 재배치 0.

| 그룹 | tone | 포함(§2-1 #) | 현재 라인 |
|---|---|---|---|
| **① 기본정보** | sky | 1·2·3·4·5·6·7·8·9 | 175–472 |
| **② 양도정보** | emerald | 10·11·12 | 474–533 |
| **③ 취득정보** | amber | 13·14·15·16·17·18·19·20 | 535–640 |
| **④ 필요경비** | slate | 21·22 | 642–699 |
| **⑤ 기타 특례** (조건부) | violet | 23·24 | 701–720 |

- ④ tone **slate 근거**(L5): 필요경비는 색으로 유인할 입력-수집 그룹이 아닌 **중립 종결 섹션** → slate(중립, `CollapsibleHintCard` HINT_CARD_TONE에 존재)로 색 그룹과 구분. 나머지 sky/emerald/amber/violet는 문서 팔레트.
- 헤더(자산 N·배지·삭제) + `errorMessage`/`dateOrderWarning` 배너 = **아코디언 위 항상 노출**.
- ⑤는 적용 자산(land+NBL판정도움 / housing·RTMI)일 때만 섹션 렌더. ①②③④는 always-on 자식 1개 이상 보유.
- **17 겸용확장(③ 그룹)은 겸용토글(① 그룹)이 노출시킴 → 토글 ON 시 ③ 자동 펼침(G7·§4-4)**.

### 4-3. 요약 헤더 derive — **라벨 전용**(H1 키스톤, 금액 제거)

표시 전용 순수 함수 `components/calc/transfer/asset-section-summary.ts`(L2 — `lib/calc/`는 API/validate 레이어라 UI 옆으로). 시그니처 **`(asset, { totalTransferExpense }) => { basic, transfer, acquisition, expense, extras }`** — ④ 일괄안분 판정에 폼-전역 `totalTransferExpense`가 필요하므로 asset-only 불가(orchestrator가 보유 prop L75 전달). **라벨 문자열만**, 금액 숫자 미포함 → 재계산 경로 없음 → dual-truth·G3·8 assetKind 미커버 문제 동시 소멸.

- ① `{종류라벨} · {소재지 or "소재지 미입력"}` (+ land면 면적 입력여부)
- ② `{양도형태 라벨}` (부담부증여 → "§159 자동산정")
- ③ `{취득원인 라벨} · {실거래/환산/감정/사례 방식 라벨}` (방식은 `useEstimatedAcquisition`/`isAppraisalAcquisition`/`isSalesCaseAcquisition` 플래그로 판정). **특수자산(일반건물·상업용·재개발)은 취득가가 전용 블록(cb*/gb*/redev*) 필드에 있어 표준 플래그가 불명확** → 종류 라벨("일반건물 환산" 등)로 대체. 어느 경우든 금액 미표시라 정확성 무관
- ④ "입력됨 / 미입력" (자본적지출·양도비 **또는 일괄안분 활성** 시 입력됨)
- ⑤ 적용 특례명(조건부)
- **라벨맵 단일 출처(L4)**: `ASSET_KIND_LABELS`(현 CompanionAssetCard L37–46)·취득원인·양도형태 라벨을 **공용 const 모듈로 추출**해 컴포넌트·요약 공유(dual-truth 방지).
- 금액이 필요한 사용자는 **사이드바**(computeTransferSummary)에서 확인 — 본 작업 무변경.

### 4-4. 상태칩 · 점프 인덱스

- 카드 헤더 상단 **비-sticky 칩바(M4)**: `① 기본 · ② 양도 · ③ 취득 · ④ 경비 (· ⑤ 특례)`. 클릭 → 해당 섹션 `open=true` + `scroll-mt` 스크롤 + 첫 포커서블 focus. 모바일 가로 넘침은 `HorizontalScrollContainer`(`feedback_macos_scrollbar_autohide_workaround`).
- **status 술어(M5)**: presence 기반 — ① 소재지 or 종류 외 입력 / ② 양도형태 선택(부담부 포함) or 양도가액 / ③ 취득원인+취득일 / ④ 경비 입력 or 일괄안분 활성 / ⑤ 적용 시 항상 표시. "유효" 아님(validate와 분리, dual-truth 금지). 칩 배열은 **적용 섹션만 동적 구성, 번호는 고정**(①②③④, ⑤ 조건부 말미).
- **자동 펼침(G7·H3)**: assetKind 변경·겸용토글 ON 등 컨트롤 onChange 핸들러에서 대상 섹션 `setOpen(n, true)` **로컬 호출**(useEffect 아님 → 무한루프 무관).
- **차단 오류(H2·G5)**: `errorMessage` 존재 시 **5개 전부 forceOpen** → 펼침 commit 후 `scrollToAssetCard`(센터링 타이밍). `ValidationIssue`에 section 키 없으므로 전체 펼침이 정확한 MVP(정밀 매핑 §9).
- **비차단 경고(L9)**: `dateOrderWarning`(날짜 순서)는 아코디언 위 배너로만 노출(항상 보임). **자동 펼침은 미적용**(Do 환류: 파생값이라 render-time setState 회피. 날짜 필드는 ③에 있고 사용자가 그 시점 ③을 펼친 상태이므로 위치 혼란 없음).

### 4-5. 기본 펼침 정책 (사용자 확정: 전부 접힘 + 자동노출 예외)

- **전부 접힘** — 진입 시 5개 헤더 + 칩바만. 자동 펼침 없음. 비배타(복수 펼침 허용).
- **예외(G7)**: 조건부 노출 섹션은 그것을 켜는 컨트롤 활성 시 자동 펼침(겸용토글→③, assetKind 특수종류→③). 차단오류→전체, dateOrderWarning→①③.
- 함의: 모든 입력 필드 초기 hidden → **E2E 스펙 전수에 펼침 스텝 선행 필수**(§5-D·§6).

### 4-6. 파일 분해 (800줄 · 예상 줄수 — L8)

| 구분 | 파일 | 책임 | 예상 |
|---|---|---|---|
| 신규 | `transfer/AssetSection.tsx` | 접기 프리미티브 + tone Record + a11y | ~140 |
| 신규 | `transfer/asset-sections/AssetSectionBasic.tsx` | ① (175–472 이동) | ~300 |
| 신규 | `transfer/asset-sections/AssetSectionTransfer.tsx` | ② | ~80 |
| 신규 | `transfer/asset-sections/AssetSectionAcquisition.tsx` | ③ | ~120 |
| 신규 | `transfer/asset-sections/AssetSectionExpense.tsx` | ④ | ~70 |
| 신규 | `transfer/asset-sections/AssetSectionExtras.tsx` | ⑤ 조건부 | ~40 |
| 신규 | `transfer/asset-section-summary.ts` | 라벨 요약·status 순수 derive | ~90 |
| 신규 | `transfer/asset-labels.ts` | ASSET_KIND_LABELS 등 공용 라벨맵 | ~40 |
| 수정 | `transfer/CompanionAssetCard.tsx` | 오케스트레이터: **루트 div `data-asset-card-index`·`scroll-mt-24`·조건부 tone 보존**(C1) + 배너 + 헤더 + 칩바 + open 상태/forceOpen/자동노출 + 5 AssetSection | <400 |

- **orchestrator 잔류 prop**: `index`·`onRemove`·`errorMessage`(배너·헤더·삭제), 파생 `isMultiBundled`(L106)·`isNewConstruction`(L111)·`isPrimary`(L107).
- **하위 섹션 전달(H4 — props strip 방지)**: **`asset` 전체 객체 전달**(destructure 금지 → 신규 AssetForm 필드 자동 전파) + 스칼라(`transferDate`·`bundledSaleMode`·`contractTotalPrice`·`totalTransferExpense`·`primaryAsset`·`isOneHouseSingle`·`onAddAsset`·`onChange`)는 **required 선언**(tsc가 누락 catch).
- 하단 import(`ReplotReductionFields`/`ReplotIncreaseFields`)는 ①(`AssetSectionBasic`)로 이동.
- 섹션 sub-component는 기존 JSX **그대로 이동**(내부 assetKind 분기·핸들러 보존) → 동작 변화 0. dispatcher 재작성 아님.

---

## 5. 작업 분해 — Phase

| Phase | 작업 | verify |
|---|---|---|
| **A** | `AssetSection`(tone Record·a11y) + `asset-labels.ts`(라벨 추출) + `asset-section-summary.ts`(라벨 요약·status) + 요약 anchor + **`e2e/_helpers/expandAssetSection(page, num)` 공용 헬퍼 선작성**(C2) | tsc, vitest 요약 anchor |
| **B** | 섹션 sub-component 5개 추출 — §2-1 JSX를 §4-2 그룹대로 **그대로 이동**, **`asset` 전체 + required 스칼라** 전달, 하단 import 이동 | tsc(누락 catch), 각 prop grep 대조 + **transferDate 의존(기준연도) anchor**, 임시 항상-펼침 시각 대조 |
| **C** | 오케스트레이터화 — 루트 속성 보존(C1)·배너·칩바·open/forceOpen/자동노출(G7)·전부접힘(§4-5) | tsc, 800줄, 칩 클릭 펼침·**오류→5개 forceOpen+카드 스크롤**·겸용토글→③ 자동펼침 |
| **D** | E2E 회귀 — **영향 spec 전수 enumerate**(`transfer-*` 28 + cb-*·building-std·appraisal-fee·gift-burdened·commercial-building-appurtenant·nbl-*·multi-house-*·rental-9x·pre1990·presale·region-code·input-error-prevention·date-input-validation·**asset-toggle-visibility-precision**·deemed-category-toggle-visibility 등) → 각 스펙에 `expandAssetSection` 스텝 → baseline green 1:1 대조 | 양도 spec 전수 + `npm test` |

- 순서: A→B→C는 중간 비동작 → **한 브랜치 ship 1회**, D 같은 브랜치 말미.
- `single-response-do-execution` 규율(TODO 체크박스·커밋 전 코드품질 게이트).

---

## 6. 리스크 · 정책 정합

| 리스크 | 대응 / 정책 |
|---|---|
| **오류 스크롤 침묵 파손(C1)** | 루트 `data-asset-card-index`·`scroll-mt-24` 보존, Phase C verify 항목 |
| **E2E 대량 회귀(C2)** | 영향 spec 전수 enumerate + `expandAssetSection` 헬퍼 + baseline 1:1. `feedback_blocking_validation_full_e2e_regression`·`feedback_browser_verify_with_playwright`·`feedback_e2e_preexisting_failures`(사전존재 실패 구분) |
| **헤더 dual-truth(H1)** | 헤더 **금액 제거(라벨 전용)**, 금액 합계=`computeTransferSummary` 단일 진실. `feedback_ui_engine_dual_truth_avoidance` |
| **토글 자동노출 충돌(H3·G7)** | 컨트롤 onChange 로컬 setOpen 자동 펼침. `feedback_ui_toggle_auto_visibility_policy`(★★) |
| **props 침묵 strip(H4)** | `asset` 전체 전달 + 스칼라 required. `feedback_explicit_prop_mapping_strip`(필요분만 매핑·시각대조 불충분 명시) |
| **검증오류 식별 불가(H2)** | section 키 없음 → 전체 forceOpen. 펼침 후 스크롤 |
| **무한 루프** | open=로컬 useState, 요약·status=useMemo, 자동노출=onChange. store write 0. `feedback_useeffect_store_mirror_forbidden`·`mirror-pattern`·`feedback_zustand_selector` |
| **JIT purge** | tone 전 슬롯 리터럴 Record. `feedback_tailwind_static_tone_mapping` |
| **번호 2계층 충돌(M1)** | 아코디언=굵은제목+큰배지, 내부=기존 원형. `feedback_section_card_numbering` |
| **UI 순서 변경** | 그룹 경계만, 순서 불변. `feedback_ui_order_follows_logic` |
| **800줄** | sub-component 추정 §4-6. `feedback_800line_split_export_preservation` |
| **a11y 부재(M3)** | aria-expanded·키보드·focus 이동 §4-1 |
| **print** | 접힌 본문 `hidden print:block`. `print-only-css-toggle` |
| **14지점** | ⑤ UI만 변경, 나머지 무변경(증명=G3 diff 0) |

참고: `transfer-tax-validate-asset.ts`가 이미 802줄(정책 초과)이나 본 작업 **무변경 대상(G3)** — 책임 외, 기록만(R1·R3 관찰).

---

## 7. 검증 계획 (Definition of Done)

- [ ] `npx tsc --noEmit` 0건
- [ ] `npx vitest run __tests__/tax-engine/transfer/` 통과 (엔진 무영향)
- [ ] 요약·status derive anchor + transferDate 의존(기준연도) anchor 통과
- [ ] **영향 E2E 전수 enumerate 후** baseline green 1:1 회귀 0 (`expandAssetSection` 적용)
- [ ] **무변경 증명**(G3): `git diff`로 타입·computeTransferSummary 산식·api·validate 로직 0
- [ ] 모든 신규·수정 파일 < 800줄
- [ ] a11y: aria-expanded·키보드 토글·칩→포커스 이동
- [ ] 오류 시 5개 forceOpen + 카드 자동 스크롤(C1) / 겸용토글 ON → ③ 자동 펼침(G7)
- [ ] 헤더 라벨 전용(금액 0) 확인 / 전부 접힘 진입 확인
- [ ] print 시 전 섹션 펼침
- [ ] (권장) `ui-engine-sync-checker` — ⑤만 변경 확인

---

## 8. 순서 · 규모 권장

- 규모 **중**(Do 실측: E2E 영향 16 test/11파일 — 추정 ~50보다 작음. 양도일만/감면 단계만 만지는 28 test는 무영향). A+B+C+D 한 브랜치.
- 핵심 위험: **props 침묵 strip(H4)** — code-analyzer가 충실성 합격 확인(누락 0). **E2E 펼침 수정(C2)** — 11파일 `expandAssetSection` 적용·직렬 검증 통과.
- **p5(transfer-p5.spec)는 사전존재 실패** — 원본 카드(stash)에서도 동일 실패, 자산카드 미접촉(Step4·Step5) → 본 작업 범위 외(`feedback_e2e_preexisting_failures`).

---

## 9. 비범위 (Out of Scope)

- **모달 / 요약 테이블**(across-asset) — 다건 빈도 상승 시 재검토.
- **assetKind dispatcher 분리**(코드 부채) — UX 무영향, 별도 트랙.
- **③ 내부 heavy 블록 2차 접기**(환산·1990·PHD·상업용/일반건물/재개발) — group-level로 충분. 후속.
- **정밀 error→section 매핑** — `ValidationIssue`에 section 키 추가는 validate 변경(G3 위반)이므로 후속 별건. 현재는 전체 forceOpen.
- **폼-전역 영역**(양도일·신고일·일괄양도·총양도가액) Step1 레이아웃 — 자산 카드만 대상.
- **헤더 금액 표시** — dual-truth/G3 회피 위해 의도적 제외. 금액은 사이드바.
