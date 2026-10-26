# components/calc/ — 세금 계산 UI

Layer 1의 프런트엔드 측. 마법사(StepWizard) 기반 폼 + 결과 화면.

> 📏 이 파일은 이 폴더의 파일을 열 때마다 통째로 로드된다 — **UI 작업 전반에 적용되는 규칙만** 둔다. 한 세목·한 컴포넌트에만 해당하는 내용은 그 하위 폴더 `CLAUDE.md`로, 배경·이력은 링크된 설계 문서로. 코드 주석은 이 파일을 **줄번호가 아니라 절 이름**(「네비게이션 규칙」 등)으로 인용한다.
>
> - 양도세 마법사(자산-수준 필드·1990 환산·사이드바·겸용 양방향 필드·특수 분기 진입점): [transfer/CLAUDE.md](transfer/CLAUDE.md)
> - 컴포넌트 테스트(선택지 anchor는 `value`를 본다): [__tests__/components/CLAUDE.md](../../__tests__/components/CLAUDE.md)

## StepWizard 패턴

각 세금 계산기는 여러 단계로 나뉘며, 상태는 zustand store (`lib/stores/calc-wizard-store.ts`)에 보관.

### 네비게이션 규칙 (절대)

- 모든 단계에 **뒤로가기 + 다음 버튼 필수**.
- 1단계 뒤로가기 = 홈(`/`) 으로 이동.
- 결과 화면의 "다시 계산하기" 는 마지막 입력 단계(감면/가산세 등)로 복귀 (첫 화면 아님).
- **전체 초기화는 그 라벨에 달지 않는다** — `<RestartFromScratchButton>`(「처음부터 새로」 + 폐기 확인 Dialog) 전용이다. 2026-09-05까지 양도세 결과뷰 3곳이 "다시 계산하기"·native "초기화"에 `onReset`을 달아 **확인 없이** 전체 입력을 지웠다(sessionStorage까지 갱신 — 되돌릴 수 없다). `window.confirm` 금지(메모리 `feedback_dialog_data_discard_confirm`).
- **하단 네비 좌측**은 공용 `WizardBackNav`(`components/calc/shared/WizardNav.tsx`): step 0 = `HomeButton` pill, step 1+ = `NavButton "이전"`. 하단에 `NavButton label="홈으로"` 신규 작성 금지.

### Step 파일 분리

Calculator가 800줄 초과 + Step이 3개 이상이면 각 Step을 별도 파일로 분리(착지 목표 ≤700줄 — 루트 File Size Policy). 예: `app/calc/transfer-tax/steps/`, `components/calc/acquisition/Step0~5.tsx` + `shared.ts`(상수·FormState·INITIAL_FORM·validateStep).

**Props 시그니처**: `{ form, onChange: (d: Partial<FormData>) => void }` + Step별 필요 콜백. 플래그(`isHousing` 등)는 상위에서 파생해 주입.

## 공용 입력 컴포넌트 (절대 규칙)

| 용도 | 컴포넌트 | 규칙 |
|---|---|---|
| 날짜 | `@/components/ui/date-input.tsx` (`DateInput`) | `<input type="date">` 금지(연도 6자리 버그). |
| 금액(원·정수) | `@/components/calc/inputs/CurrencyInput.tsx` + `parseAmount()` | 자동 콤마. **소수점 입력 불가** — 소수 필드에 쓰면 333.06 → 33306. `FieldCard` 밖에서 쓰면 `hideUnit`. |
| 소수 숫자(면적㎡·연수) | `@/components/calc/inputs/DecimalInput.tsx` + `parseDecimal()` | 원화가 아닌 소수에는 반드시 이것 — **CurrencyInput 대체 불가**. |
| 필드 카드 | `@/components/calc/inputs/FieldCard.tsx` | 라벨·hint·warning·trailing·unit 슬롯. |
| 섹션 헤더 | `@/components/calc/shared/SectionHeader.tsx` | 큰 그룹 시작점. |
| 진척 사이드바 | `@/components/calc/shared/WizardSidebar.tsx` | lg 이상 좌측 sticky. |
| 개별공시지가 | `@/components/calc/inputs/LandPriceLookupField.tsx` | **개별공시지가 필드는 `LandPriceLookupField` 필수** — 기준연도+Vworld 조회+토지기준시가 자동 계산. CurrencyInput 단독 사용 금지. |
| 분기·옵션 토글 | `@/components/calc/inputs/ToggleCard.tsx` | native checkbox 신규 금지. 아래 「토글 가시성 원칙」. |
| 라디오 그룹 | `@/components/calc/inputs/RadioCardGroup.tsx` | native radio 신규 금지. layout `stack`·`inline`. |
| 1990 환산 | `@/components/calc/inputs/Pre1990LandValuationInput.tsx` | acquisitionDate < 1990-08-30. **토지 자산 전용이 아니다**(→ transfer/CLAUDE.md). |
| 주소 검색 | `@/components/ui/address-search.tsx` | Vworld. 조정대상지역·공시가격 조회에 필수. |
| 리셋 | `@/components/calc/shared/ResetButton.tsx` | 1단계에만. 확인 다이얼로그 포함. |
| 홈으로 | `@/components/calc/shared/HomeButton.tsx` | 아래 「홈으로 버튼 규칙」. |

**포커스 시 전체 선택**: `SelectOnFocusProvider`(`components/providers/SelectOnFocusProvider.tsx`)가 전역 적용 — 개별 `onFocus={(e) => e.target.select()}` 추가 금지.

**API 호출**은 `lib/calc/{tax-type}-api.ts`의 `call*API()`를 거친다(직접 fetch 금지). **zustand selector**는 매 렌더 새 객체를 반환하지 않는다 — `useMemo` 또는 atomic selector(무한 루프). `compute*Summary` 같은 파생값도 hook으로 직접 부르지 말고 `useMemo`로 감싼다.

## 결과 화면 구조

`components/calc/results/{TaxType}ResultView.tsx` — `result` prop 받아 섹션별 카드로 렌더. 요약 카드 → CalculationStep 목록(산식·근거조문) → 서브엔진별 상세 카드 → `DisclaimerBanner`(하단 고정).

- **결과 뷰 산식**: 변수 약어(`P_F`, `Sum_A`) 금지·한국어 풀어쓰기, 법정 용어 우선, 중간 산술 결과 미표시, `floor()` 묵시 처리.
- **금액 칸 정렬 (모든 표·신고서·보고서 공통)**: 금액(원) 셀은 `text-right font-mono tabular-nums whitespace-nowrap` — 천·백만·십억 콤마 세로 정렬. 공용 `BesshiRow`/`BesshiColumn`(`components/calc/results/shared/BesshiRow.tsx`) 재사용 우선. 상세: `amount-column-align` 스킬.
- `LoginPromptBanner`를 **신규 결과뷰에 달지 말 것** — 「로그인하면 이력 저장·PDF 가능」은 사실이 아니다(이력은 로컬 IndexedDB 일원화 `proxy.ts:4`, PDF는 클라이언트 생성). 양도세에서는 2026-09-05 제거, 상속·증여·종부세는 아직 쓴다.

## Zustand 마법사 Store (`lib/stores/calc-wizard-store.ts`)

- sessionStorage persist. 비로그인 계산 결과 보존 → 로그인 후 이력 마이그레이션(로컬 IndexedDB).
- **`result` 필드는 partialize에서 제외**: 민감정보 + Date 직렬화 문제. `pendingMigration`으로 마이그레이션 1회성 보장.
- legacy 폼 마이그레이션은 `lib/stores/calc-wizard-migration.ts`(`migrateLegacyForm`).

## UI 통합 8개 동기화 지점 (Definition of Done — 루트 CLAUDE.md 14지점 중 클라이언트 8)

엔진 input·result에 필드가 추가·변경되면 **모두** 동기화해야 완료. UI 작업은 세목별 UI 시니어(`{tax}-ui-senior`, [feature-workflow.md](../../docs/00-pm/feature-workflow.md))가 맡고, 완료 직후 `ui-engine-sync-checker`로 누락을 점검한다.

| # | 지점 | 위치 |
|---|---|---|
| ① | 폼 상태 타입 (FormData/AssetForm) | `lib/stores/calc-wizard-asset.ts` · `calc-wizard-store.ts` 또는 `components/calc/{tax-type}/shared.ts` |
| ② | initial value | 동상 (`makeDefaultAsset` / `defaultFormData` / `INITIAL_FORM`) |
| ③ | normalize fallback | 동상 (`migrateAsset` 등) — sessionStorage 마이그레이션 호환 |
| ④ | API 변환 | `lib/calc/{tax-type}-api.ts` (없으면 route handler 진입 변환) |
| ⑤ | UI 입력 위젯 | 마법사 단계 컴포넌트 — 활성화 조건·tone 색상 고려 |
| ⑥ | 사이드바 합계 (해당 시) | `compute*Summary` selector |
| ⑦ | 결과 카드 산식·표시 | `{TaxType}ResultView` + 상세 카드들 — 산식 숫자 옆 변수명 라벨 |
| ⑧ | **Validation** | `lib/calc/{tax-type}-validate.ts` — API/UI fallback이 있는 필드는 validate에서도 같은 fallback 인식 (UI/API 통과 ↔ validate 차단 모순 방지). 단계별 필수 필드는 `validateStep()` |

## 입력 화면 작성 원칙

- **UI 순서 = 엔진 계산 로직 순서**: 입력 필드 배치 전 엔진 함수의 변수 사용 순서 확인. 모드 토글은 영향 받는 필드 직전. 같은 그룹 내에서도 알고리즘 의존 순서 (예: PHD 토지면적이 모든 후속 곱셈 인자이므로 최상단).
- **사이드바 합계**: 입력된 값으로 계산 가능한 항목만 표시 (0원·null 제외). 환산 모드의 취득가액처럼 API 결과 후에야 알 수 있는 값은 결과 도착 후 노출.
- **면적 안분 (강제)**: `lib/tax-engine/area-utils.ts`의 `round2()` / `residualArea()` 사용. 비율로 파생한 면적은 단가 곱셈 전 `round2()`로 소수 3째 자리 반올림(표시 자리수 = 계산 자리수 — 미적용 시 표시 76.51 / 계산 76.508 오차). **마지막 항목은 `residualArea(전체, ...앞항목)`로 잔액 흡수** — 비율 재계산 금지(미적용 시 100㎡ 3등분 → 33.33×3 = 99.99). 인라인 `parseFloat(x.toFixed(2))` 신규 작성 금지.
- **같은 의미 폼 필드의 양방향 read/write 통합**: 같은 값을 두 화면에서 입력받아야 하면 별도 폼 필드를 신설하지 않고 **단일 필드를 두 위치에서 양방향 read/write**한다(`useEffect` 미러링 아님). API/Validation은 fallback으로 양쪽 인식 — ⑧ 정책. 사례: transfer/CLAUDE.md.
- **placeholder 정확성**: "자동 안분"은 엔진이 실제로 안분할 때만. 자본적지출처럼 귀속이 명확해야 하는 필드는 "없으면 비워두세요".

### placeholder에 숫자 예시 금지 (전 세목 공통, 2026-05-03 이후)

입력란 `placeholder`에 특정 숫자(계산 예제·Excel 예제 숫자 등) 사용 금지. 도움말이 필요한 경우 **한국어 설명**으로만 표시.

- 잘못된 예: `placeholder="예: 91.78"`, `placeholder="예: 10,000,000"`
- 올바른 예: `placeholder="양도시 주거용 합계 면적"`, `placeholder="금액 입력 (원)"`
- 입력 형식 안내가 필요하면 FieldCard의 `hint` prop에 한국어로 작성

## 톤·카드 (2026-07-10 표준화)

톤은 **canonical 정적 소스** `components/calc/shared/tones.ts`(`Tone` 6톤 × `TONE[t].card/title/badge/chip/toggle`)에서만 가져온다. **동적 `bg-${tone}` 보간 금지**(production JIT purge silent failure — `feedback_tailwind_static_tone_mapping`) → `scripts/check-tone-classes.sh`가 pre-push 하드블록.

**다크 짝 필수(2026-10-19)**: 유채색 톤 글자 `text-{tone}-{400~950}`·밝은 톤 배경 `bg-{tone}-{50~300}`은 같은 클래스 목록에 `dark:text-`·`dark:bg-` 짝을 둔다(예: `text-amber-700 dark:text-amber-300` · `bg-sky-50/40 dark:bg-sky-950/40`). 예외: 불투명 밝은 배경 + 톤 글자(자체 대비 배지), 무채색. → `scripts/check-dark-pairs.mjs`가 pre-push 하드블록.

**라이트 옅은 글자 금지(2026-10-20)**: 접두 없는 라이트 글자색으로 `text-{tone}-{400~600}`·`text-{무채색}-{300~500}`·투명도 톤 글자 `text-{tone}-N/NN`을 쓰지 않는다 — 톤은 700, 무채색은 600부터. 회색 안내 글자는 `text-muted-foreground`. → 같은 `check-dark-pairs.mjs`. 근거: `docs/00-pm/ui-light-contrast-and-dark-print.plan.md`.

| 상황 | 사용 |
|---|---|
| 안내·섹션 카드 | `<ToneCard tone [title] [sectionNum]>` (`components/calc/shared/ToneCard.tsx`) — 인라인 톤 하드코딩 금지. `sectionNum`(`string`·`number`) 有=번호배지+제목 |
| 서술형 접힘 도움말 | `<CollapsibleHintCard tone summary>` (print 유지) |
| 상태 배지·자동계산 결과박스 | `TONE[tone].badge` / `TONE[tone].chip` |
| 도메인 enum 신호등(저율/기본/중과 등) | 로컬 정적 `Record<Tone,string>` 허용 |
| 공식 서식 replica 표 | gray/neutral/zinc 유지(원본 재현 — 변경 금지) |
| 법령 배지 | `components/calc/shared/lawBadge.ts`의 `LAW_BADGE_CLASS` (카드 톤 축 아님) |

**다-섹션 입력 폼 — 색상 카드 + 섹션 번호 패턴 (강제)**: 3개 이상 서브섹션이 연속되는 입력 영역은 서브섹션마다 `<ToneCard tone sectionNum title>`(부모가 `sectionNum` 주입 — 순서 변경 시 한 곳만 수정, 항목별 번호 없음). 카드 간 `space-y-3`, 자동 계산 결과 박스도 그 카드 톤. 대표 구현: `components/calc/transfer/mixed-use/`.

색상 가이드(섹션 카드·토글 공용):

| tone | 입력 섹션 성격 | 토글 의미 |
|---|---|---|
| `sky` | 면적·규모 | 면적·규모·일반 정보 |
| `emerald` | 양도시 기준시가 | 긍정·확정·평가 정보 |
| `amber` | 취득시 기준시가 | 취득·분리계산 모드(겸용·신축·PHD §164⑦·분리) |
| `violet` | 거주·보유 정보 | 거주·자격 정보(임대 최초계약·실사용 등) |
| `rose` | 지역·지정 정보 | 지역·지정 정보(수도권·조정대상지역) |

- **2축 주의**: 같은 팔레트가 입력 섹션 성격과 메시지 상태(amber=주의·emerald=성공 등)를 겸한다 — 문맥으로 판단.
- `green`은 `emerald`와 동의어지만 픽셀이 다르다 → 신규는 `emerald`.
- 설계·근거: `docs/02-design/features/ui-color-tone-tokenization.plan.md`.

## 토글 가시성 원칙 — ToggleCard (강제 규칙)

분기·옵션 토글은 반드시 `ToggleCard`, 라디오 그룹은 반드시 `RadioCardGroup`. native `<input type="checkbox">`·`<input type="radio">` 신규 작성 금지.

**OFF 상태에도 tone 배경 항상 유지** — ToggleCard는 OFF/ON 모두 `bg-{tone}-50/70`. 회색·중립 배경(`bg-card`·`bg-background`·`bg-muted/30`) **금지**. 회색 OFF는 토글이 평범한 라벨에 묻혀 사용자가 존재조차 인지하지 못한다(사용자 피드백, 2026-04-29). RadioCardGroup도 같다 — **미선택 옵션도 tone 배경 유지**, 선택된 옵션만 ring·border 진하기·title 색으로 강조.

ON/OFF는 배경이 아니라 4신호로 구분한다: Switch thumb 위치 · border(`{tone}-200/70` → `{tone}-300`) · ring(없음 → `ring-1 ring-{tone}-200/50`) · title 색(기본 → `text-{tone}-900`).

- variant: `card`(기본 — ON 시 `children` 펼침) / `chip`(라벨 옆 인라인, children 미지원).
- 비활성 사유가 있으면 `disabled` + `disabledReason`을 함께 전달.
- **직접 토글 카드를 만드는 예외**에도 OFF `bg-{tone}-50/70` 필수 · 회색 배경 금지 · 위 4신호 중 최소 2개 차별화.

## 라벨 타이포그래피 규칙 (전 세목 공통 — 2026-07-10 표준화)

폰트 = **Pretendard**(self-host, `app/fonts/PretendardVariable.woff2`). 라벨 크기는 **역할 → 정본 클래스**로 고정한다. 임의 크기 폰트(`text-[Npx]`·`text-[Nrem]`·`text-[Nem]`) **금지** — `scripts/check-font-sizes.sh`가 **pre-push에서 하드블록**.

| 역할 | 정본 클래스 | 크기 |
|---|---|---|
| 계산기 페이지 제목 (h1) | `text-2xl` | 24px |
| 마법사 단계 제목 (h2) | `text-lg` | 18px |
| 섹션 헤더 제목 | `text-base` | 16px |
| 필드 라벨 · 옵션 제목 | `text-sm` | 14px |
| hint · 단위 · 배지 · 경고 · 서브섹션 제목 | `text-xs` | 12px |
| 캡션 · fine print · 보조 본문 | `text-caption` | 11px |
| 번호배지 · pill · 상첨자 극소 chrome | `text-micro` | 10px |

- 같은 크기에 새 토큰명 신설 금지(`text-hint` 같은 중복 이름). 커스텀은 `text-caption`·`text-micro` 2종뿐(`app/globals.css` `@utility`, font-size만).
- 굵기는 `font-medium`/`font-semibold`로 병기. `font-mono`(금액 칼럼)는 대상 아님.
- 설계·근거: `docs/02-design/features/ui-label-typography-standardization.plan.md`.

## 모달 런처 버튼 규칙 (전 세목 공통 — 2026-07-10)

하위 모달(Dialog)을 여는 **런처 버튼**(계산·조회 헬퍼·이력 불러오기)은 `<Button variant="modalLauncher">`(`components/ui/button.tsx` 단일 소스). **native `<button>`로 런처 신규 작성 금지.**

- **size**: 라벨 12px면 `xs`/`sm`, **14px면 `default`**.
- `data-testid`·`title`·`disabled`는 그대로 전달(`...props` 통과).
- **제외**: 항목 추가/편집 에디터, 드롭다운(autocomplete·시군구·주소검색), 도움말 ⓘ(`TaxHelp`), 법조문/판례 인용 링크, 확인/폐기 다이얼로그. 인라인 "다시 계산" 재오픈 링크는 녹색 텍스트 링크 유지 가능.
- 설계: `docs/02-design/features/modal-launcher-button-style.plan.md`.

## 홈으로 버튼 규칙 (전역 공통 — 2026-07-20 통일)

"홈으로" 이동 버튼은 **반드시 `@/components/calc/shared/HomeButton.tsx`(`HomeButton`)** 사용. 집 아이콘(`Home`) + `rounded-full` 테두리 pill 단일 표준.

- **신규 작성 금지**: native `<Link href="/">`, `<button onClick={()=>router.push("/")}>`, `ChevronLeft`/`←` 홈링크. 전부 `<HomeButton>`으로.
- **variant**: `pill`(기본 — 헤더·breadcrumb·페이지 상단) / `block`(전체폭 — 결과·에러 화면, `className="flex-1"` 병용).
- **props**: `confirmMessage`(입력 이탈 확인 — 미제공 시 즉시 이동), `onBeforeNavigate`(zustand step/result stale 정리), `label`(기본 "홈으로").
- 마법사 하단 네비는 위 「네비게이션 규칙」의 `WizardBackNav`.
- 설계: `docs/02-design/features/home-button-unification.plan.md` · `docs/02-design/features/home-button-bottom-nav-unification.plan.md`.

## 완료 전 자가 점검

- [ ] 8개 동기화 지점 모두 (API에 fallback을 넣었으면 ⑧ validate에도 같은 fallback)
- [ ] 양도세 자산-수준 필드는 `AssetForm`에 (transfer/CLAUDE.md)
- [ ] 800줄 정책 — 넘으면 sub-component 추출
- [ ] `npx tsc --noEmit` 0건 · 회귀 테스트 통과
- [ ] 브라우저 수동 확인 또는 미수행 명시
- [ ] (권장) `ui-engine-sync-checker` 결과 첨부
