# UI 색상/톤 시맨틱 토큰화 — 계획서

> UI 일관성 3부작 완결편. 타이포그래피(PR#551)·모달 런처 버튼(PR#555)에 이은 "흩어진 임의값 → 단일 소스" 세 번째.
> 작업 브랜치: `feat/ui-color-tone` (워크트리 `.claude/worktrees/ui-label`). 엔진 input/result **변경 없음 = 순수 UI 리팩터**.

## 0. 한 줄 요지

색을 **바꾸지 않는다**(green→emerald 포함). **신규 공용 카드 컴포넌트**(`<ToneCard>` — 안내·섹션 통합 하나)와 그 **canonical 톤 소스**(`tones.ts`)를 만들고, 실제 버그(동적톤 purge 3파일·LAW_BADGE 5중복)를 고치고, **신규 동적톤**을 게이트로 막는다. 기존 20여 로컬 정적 Record는 정책준수라 강제통합하지 않고 점진 채택. 시각 회귀 목표 **0**.

---

## 1. 배경 · 실측 (master 555e0e8d)

| 지표 | 값 | 출처 |
|---|---|---|
| 톤 하드코딩 총 사용 | **8,580회** | `grep -rhoE "(bg\|text\|border\|ring\|from\|to)-{tone}-[0-9]{2,3}" components` |
| distinct 클래스 | 221 | 위 `sort -u` |
| `bg-{tone}-50` 안내카드 쓰는 파일 | **371/556 (67%)** | grep -rl |
| 실사용 톤 패밀리 | 14 (pink·cyan·teal·lime = 0건) | 조사 에이전트 |
| 임의 폰트크기 | 0 (타이포 게이트 유지 ✅) | — |

**핵심**: 타이포 부채의 5.6배 규모, 전체 컴포넌트의 2/3를 물들임. 그러나 아래 §3에서 보듯 **수술 범위 ≠ 8,580**.

## 2. 실측 taxonomy — 14톤 역할 (조사 에이전트 file:line 근거)

### 2.1 두 의미축이 팔레트를 공유 (근본 병)

- **축 A — 입력 섹션 성격** (색상 카드+섹션 번호 패턴, `components/calc/CLAUDE.md` 문서화):
  `sky`=면적·규모 · `emerald`=양도시 기준시가 · `amber`=취득시 기준시가 · `violet`=거주·보유 · `rose`=지역·지정.
- **축 B — 메시지 상태**:
  `amber`=비차단 경고 · `red`=하드에러/FAIL/긴급 · `emerald`/`green`=성공·비과세·확정 · `blue`=법령배지·기본세율 · `slate`=중립·저우선.

### 2.2 톤별 지배 역할 + 진단

| 톤 | 지배 역할 | 진단 |
|---|---|---|
| `sky` | 면적·규모 입력 + 자동조회(Kiwoom/Vworld) + 일반안내 | ✅ 일관 |
| `emerald` | 긍정·확정·평가·비과세 | ⚠ `green`과 중복 |
| `amber` | 취득/기준시가 입력 **+ 비차단 경고** | ⚠ 2역할 혼재 |
| `violet` | 입력=거주/자격 **/ 결과카드=특수분기 상세** | ⚠ 2역할 혼재 (의도 여부 확인필요) |
| `rose` | 지역·지정 + 할증/특례 단서 | ✅ 대체로 일관 |
| `slate` | 중립·기본·저우선(고급옵션·이력) | ✅ 일관 (기본값) |
| `blue` | 법령조문 배지(`LAW_BADGE_CLASS`) + 기본세율 | ⚠ 5파일 중복정의 |
| `red` | 하드에러/미충족/초과 + D-day 긴급 | ✅ destructive semantic (별개 역할) |
| `fuchsia` | 자동계산 미리보기 박스 + 드문 특수분기 | 소수 집중 |
| `indigo` | 비상장주식 전용 강조 + 교차참조 링크 | 니치(inheritance V2) |
| `green` | 비과세·안전(D-day) | 🔴 `emerald`와 동의어 중복 |
| `gray`/`neutral`/`zinc` | **공식 서식 replica 표 구조** (종부세 신고서·besshi·nts-report) | 🚫 상태 아님 → **제외** |
| `yellow` | 공식서식 소계행 + 소수 추징경고 | 대부분 서식 replica |
| `orange` | 경고(증환지 면적) — amber보다 드묾 | 소수 |
| `purple` | 단일 고정 배지(종부세 배제) | 단일 용례 |

### 2.3 실제 버그 vs 단순 중복 (조사+인라인 검토 실측 — 구분 중요)

**진짜 버그 (이번 작업 IN):**
1. **동적 톤 purge 위반 3건** (`feedback_tailwind_static_tone_mapping` 정면 위반 — 실측 확인):
   - `ForeignStockBlock.tsx:113,115,117` — `` `border-${tone}-200 bg-${tone}-50/40` ``·`` `bg-${tone}-200 text-${tone}-800` ``·`` `text-${tone}-700` `` (`tone:string` prop, 호출부 리터럴)
   - `ExitTaxBlock.tsx:88,91,95` — 동일 패턴
   - `EstateChipInlineExpand.tsx:99` — `` `text-${tone}-800 dark:text-${tone}-200` `` (line 94는 이미 `INLINE_PANEL_TONE_CLASSES[tone]` 정적 → **leaky partial fix**)
   - → production JIT purge 시 색 미적용 silent failure. **정적 매핑으로 교정.** (이 3파일이 코드베이스 유일 동적톤 위반 — 나머지는 모두 정적)
2. **`LAW_BADGE_CLASS` 5파일 동일 문자열 중복정의** (실측 확인): `InheritedAcquisitionDeemedSection:22`·`transfer/inheritance/PostDeemedInputs:35`·`PreDeemedInputs:28`·`HouseValuationSection:168`·`transfer/nbl/UnconditionalExemptionSection:21` → 단일 export 추출.

**단순 중복 (버그 아님 — OUT, §4.2):**
3. **톤 Record가 20~40여 개로 분산** (실측 — 톤-카드 Record 약 20, 광의 `const *TONE/COLOR/BADGE*` grep 43): `HINT_CARD_TONE`(CollapsibleHintCard)·`EXPAND_TONE_CLASS`·또 다른 `HINT_CARD_TONE`(MajorShareholderCheckpointHints)·`SECTION_TONE`(AssetSection·PropertyCardEditor·UnlistedStockSimpleFields)·`SUB_TONE`·`TONE_CLASSES`(shape 상이 2종)·`BADGE_TONE_CLASSES`·`CHIP_TONE_CLASSES`·`CATEGORY_COLOR`·`RATE_GROUP_COLORS`·`CollapsibleEstateGroup`(TONE_CARD/BADGE/TITLE)·`GiftCreditChecklist`(5분할)·`CHANGE_TYPE_TONE` 등. **⚠ 이들은 전부 이미 정적 Record = `feedback_tailwind_static_tone_mapping` 준수 = 깨지지 않음.** shape도 제각각(`{wrap,circle,title}`/`{box,text}`/`{container,label,summary}`/`{border,bg,text,badge}`)이라 하나로 강제통합 = §3이 기각한 big-bang + Surgical 위반. → **강제통합 안 함.** tones.ts는 신규 primitive 전용 canonical, 로컬 Record는 점진 채택 대상(이번 아님).
4. **green/emerald 중복**: 동일 의미이나 `green-100`≠`emerald-100`은 **실제 픽셀 상이**(green=황록, emerald=청록). green 용례는 렌더 정상 = 안 깨진 코드. 치환하면 §0 "색값 불변" **자기모순** + Surgical 위반. → **이번 범위 제외**(문서화만).

## 3. 설계 판단 — 왜 "전량 마이그레이션"이 아닌가 (트레이드오프)

| 안 | 내용 | 판정 |
|---|---|---|
| **A. big-bang 전량** | 269개 파일 인라인 카드 + ~20 로컬 Record → 공용 컴포넌트/단일 소스 일괄 치환 | ❌ 기각 — 비기계적 semantic 재작성(카드마다 내용·구조 상이, Record shape 제각각), 고리스크·저ROI. 카드·Record는 이미 정적·일관 |
| **B. 신규 primitive + 진짜버그 수정 + 동적톤 게이트 + 파일럿(권장)** | 신규 primitive용 canonical `tones.ts`·`<ToneCard>`(안내·섹션 통합) + 동적톤 3·LAW_BADGE 수정 + 동적톤 게이트 + 파일럿 채택. 로컬 Record·인라인카드는 점진 | ✅ 채택 — Simplicity First. **진짜 버그만** 제거, 신규 primitive로 방향 고정, 색값 불변→회귀 0 |

**근거**: 타이포는 순수 sed였기에 전량이 정당했다. 색은 (a) 대부분 이미 정적 Record(깨지지 않음), (b) 진짜 버그는 동적톤 3파일+LAW_BADGE 5중복뿐. 병의 크기(8,580)와 실제 결함(narrow)을 혼동하지 않는다. **색값은 바꾸지 않는다**(green→emerald 포함 일절 — §2.3.4).

## 4. 범위

### 4.1 IN (이번 작업)
- **[P1] canonical 톤 소스 모듈** `components/calc/shared/tones.ts` — `Tone` 타입 + `TONE` 정적 Record. **신규 primitive(ToneCard) + 파생 2 Record가 실제 쓰는 표면만** 정의(§6). dark 변형 포함.
- **[P1] `<ToneCard tone title? sectionNum?>`** 신설 — 안내·섹션 카드를 **하나로 통합**(자가검토 C-F1: InfoCard+SectionCard 2컴포넌트는 결정비용만 늘림). `sectionNum` 有=섹션 스타일(번호배지+제목), `title`만=제목형 안내, 둘 다 無=순수 톤 박스+children. `sectionNum`은 `string | number`(`"1-A"` 실존). **기존 4~5 로컬 SectionCard 구현**(`AssetSection` `SECTION_TONE`·`PropertyCardEditor`·`UnlistedStockSimpleFields`·mixed-use inline)의 통합 대상. `CollapsibleHintCard`(접힘+print)는 별도 유지 → **총 2 컴포넌트**(ToneCard·CollapsibleHintCard), 둘 다 `TONE` 소비.
- **[P1] `HINT_CARD_TONE`(CollapsibleHintCard)·`EXPAND_TONE_CLASS`를 `TONE`에서 파생** — 이 2개 cross-cutting 공용 Record만 canonical로 수렴(하위호환 re-export). 나머지 로컬 Record는 건드리지 않음.
- **[P2] 진짜 버그 수정**: 동적톤 3파일 정적화(**ForeignStock/ExitTax는 `<ToneCard>`로 대체** — 정확히 섹션카드 골격이라 버그수정 ⊕ 채택 동시, 자가검토 C-F4) · `LAW_BADGE` 단일 상수 추출(5파일 참조 교체).
- **[P3] pre-push 게이트** `scripts/check-tone-classes.sh` — **신규 동적톤 `` `bg-${...}-` `` 하드블록(P2 후 0 → 0 유지, baseline 불필요·유지보수 가능)**. 인라인카드 신규 난립은 스크립트가 아닌 §5.1 CLAUDE.md 컨벤션 + 코드리뷰로. 화이트리스트: 공식서식 경로.
- **[P4] 파일럿 채택 = P2 ForeignStock/ExitTax 전환**(C-F4대로 버그수정 ⊕ 실제 채택 겸함 — 11개 섹션카드). 회귀 anchor는 **class-equivalence 단위테스트**(`tone-card.test.tsx`: cn/twMerge가 p-3→p-4 대체·톤 클래스 보존 단언 — Tailwind class→색 1:1이라 Playwright 불필요). **별도 mixed-use `SECTION_TONE` 전환은 점진 채택으로 이월**(Do deviation: 추가 회귀 위험 대비 실증 가치 중복 — Simplicity). `"1-A"` string 케이스는 RTL anchor로 검증.
- **[P5] 문서·메모리**: `components/calc/CLAUDE.md` 톤 규칙 갱신(2축 명확화·공용 컴포넌트 지시·§5.1 채택 결정표·green 중복 기록) + 메모리.

### 4.2 OUT (제외 — 명시)
- **~20개 로컬 정적 톤 Record 강제통합**(§2.3.3): 이미 정책준수·shape 상이. big-bang(§3 기각). 점진 채택만.
- **269개 인라인 카드 전량 치환**: §3 기각. P2 채택 외 점진(별도 mixed-use 파일럿도 이월).
- **실제 색상값 변경 일절**(green→emerald 포함): 리디자인 아님·Surgical. green 중복은 문서화만.
- **공식 서식 replica**(gray/neutral/zinc·yellow 소계행): 국세청 원본 재현이라 톤 변경 금지. 게이트 화이트리스트.
- **shadcn semantic 토큰**(primary/muted/accent/destructive/card): 별개 체계, 유지.
- **ToggleCard/RadioCardGroup 내부**: 이미 componentized·마이그레이션 완료(2026-04-29/30). 미변경.
- **red(에러/긴급)·fuchsia(미리보기)·indigo(비상장 니치)**: `Tone` 미포함. 로컬 유지(니치·비-카드 역할).

## 5. Phase 계획

```
P1 인프라   → tones.ts(Tone+TONE Record, primitive 표면만) · <ToneCard>(안내·섹션 통합) · HINT_CARD_TONE·EXPAND_TONE_CLASS만 파생
             verify: 단위테스트(TONE[t] 표면 = 기존 클래스 1:1 단언 · ToneCard RTL: sectionNum 有/無) + tsc 0
P2 버그수정  → 동적톤 3파일 정적화(ForeignStock/ExitTax는 <ToneCard>로 대체) · LAW_BADGE 단일 추출(5파일 참조 교체)
             verify: grep 동적톤=0 · 해당 파일 tsc 0 · computed-style 색 동일(회귀 0)
P3 게이트    → scripts/check-tone-classes.sh(신규 동적톤 `bg-${...}` 하드블록, 공식서식 화이트리스트) → .husky/pre-push
             verify: 동적톤 파일 넣으면 exit 1 · 현재 트리(0건) 통과
P4 파일럿    → = P2 ForeignStock/ExitTax 전환(11 섹션카드) — 별도 mixed-use는 점진 이월
             verify: class-equivalence 단위테스트(cn override p-3→p-4·톤 클래스 보존; Tailwind class→색 1:1)
P5 문서      → components/calc/CLAUDE.md 톤 2축·공용 컴포넌트 규칙·§5.1 채택 결정표·green 중복 기록 · 메모리
```

**단일 응답 Do** 대상 = P1~P5 전부(파일럿 1개까지). 로컬 Record·잔여 인라인카드 점진 채택은 별도 사이클.

## 5.1 채택 결정 규칙 (P5 문서화 대상 — 자가검토 C-F6)

점진 채택 시 "무엇을 쓰나"를 매번 재판단하지 않도록:

| 상황 | 사용 |
|---|---|
| 비접힘 안내/섹션 카드 | `<ToneCard tone [title] [sectionNum]>` |
| 서술형 접힘 도움말(왜·어떻게) | `<CollapsibleHintCard>` (print 유지) |
| 상태 배지·자동계산 결과박스 톤 | `TONE[tone].badge` / `TONE[tone].chip` |
| 도메인 enum 신호등(저율/기본/중과 등 3+단계) | **로컬 정적 Record 허용**(이미 정책준수 — 강제통합 안 함) |
| 공식 서식 replica 표 | gray/neutral/zinc 유지(변경 금지) |

## 6. `tones.ts` 설계 (primitive 표면만 — Simplicity First / YAGNI)

로컬 Record를 강제통합하지 않으므로(§2.3.3·§4.2), `TONE`은 **신규 ToneCard + 파생 대상 2 Record가 실제 쓰는 표면만** 정의한다.

```ts
export type Tone = "sky" | "emerald" | "amber" | "violet" | "rose" | "slate";
// 카드 축 6톤만. 제외: green(=emerald 중복, 문서화만) · red(destructive, 카드톤 아님) ·
//   blue(법령배지=LAW_BADGE 별도 상수 · ExpandTone에만 존재 → Tone 미포함, 자가검토 C-F7) ·
//   fuchsia/indigo(니치, 로컬 유지) · gray/neutral/zinc/yellow(공식서식)

interface ToneSurface {
  card: string;   // border-{t}-200 bg-{t}-50/40 dark:...  (ToneCard 외곽) = 기존 HINT_CARD_TONE
  title: string;  // text-{t}-700 dark:text-{t}-300        (섹션/안내 제목)
  badge: string;  // bg-{t}-200 text-{t}-800 dark:...      (ToneCard 번호배지)
  chip: string;   // bg-{t}-100 text-{t}-700/800 dark:...  (자동계산 결과박스·상태칩 — 실측 425건, CLAUDE.md 결과박스 패턴)
  toggle: string; // = EXPAND_TONE_CLASS 6톤분             (펼침 버튼 — 파생 대상)
}
export const TONE: Record<Tone, ToneSurface> = { /* 정적 문자열, 색값 = 기존 그대로 */ };
```

- 표면 5키(card·title·badge·chip·toggle)는 **실소비 근거 있음**: card/title/badge=ToneCard, chip=결과박스(425건·문서화 패턴, 점진 채택 시 하드코딩 대신 참조), toggle=EXPAND 파생. `cardStrong`(ToggleCard OFF)·`ring`은 **소비자 0 → 미정의**(YAGNI). 자가검토 A3(최소)↔C-F3(chip 추가) 절충: chip은 근거 충분→채택, cardStrong/ring은 미채택.
- 모든 문자열 **정적**(JIT purge 안전). `Record<Tone,...>` 타입이 톤 추가 시 표면 누락 catch.
- 파생: 기존 `HINT_CARD_TONE[t]`(sky/emerald/rose/amber/violet/slate — blue 無) = `TONE[t].card` **완전 파생**. `EXPAND_TONE_CLASS`는 6톤을 `TONE[t].toggle`에서 파생 + **blue만 `ExpandToggleButton` 로컬 리터럴 유지**(`ExpandTone`=Tone+blue). blue를 Tone에 넣지 않아 죽은 card/badge 표면 없음.
- **위치**: `components/calc/shared/tones.ts`(calc 전용). `<ToneCard>`도 `components/calc/shared/`.

## 7. 강제 게이트 (`scripts/check-tone-classes.sh`)

**하드블록(유지보수 가능한 것만)**: 동적 톤 문자열 보간 `` `...bg-${x}-50...` ``·`` `border-${x}-200` `` 등 = 즉시 exit 1(JIT purge 위험, `feedback_tailwind_static_tone_mapping`). P2에서 현 3파일을 0으로 만든 뒤 **0 유지**(typo 게이트처럼 baseline 불필요 — 0은 유지보수 가능).

- **인라인카드 신규 난립은 게이트 대상 아님**: 기존 371파일·20여 로컬 Record가 전부 정적이라 "신규만 차단" baseline 스냅샷은 371줄을 계속 관리해야 해 **비현실적**. 대신 §5.1 `components/calc/CLAUDE.md` 컨벤션("신규 안내/섹션 카드는 `<ToneCard>` 사용") + 코드리뷰로 방향 고정.
- 화이트리스트: `nts-report/`·`*filing*`·`besshi/`(공식서식) — 단 동적톤은 여기도 발생 안 하므로 실질 영향 없음.
- 참고: 정적 `bg-amber-50` 리터럴은 **차단 안 함**(정책 위반 아님). 오직 동적 보간만.

## 8. anchor · 검증

| anchor | 방식 | 기대 |
|---|---|---|
| `TONE` Record 표면 | vitest — `TONE.amber.card`·`.chip`·`.badge` 등 정적문자열 부분단언 | 기존 클래스와 1:1 |
| `HINT_CARD_TONE`/`EXPAND_TONE_CLASS` 파생 | vitest — 파생값 = 기존 문자열 동일(EXPAND blue 리터럴 포함) | 완전 일치(회귀 0) |
| `<ToneCard>` | RTL — tone별 card/title/badge 클래스 · `sectionNum` 有(번호배지+`select-none`)/無(순수박스)·string("1-A")/number 렌더 | 통과 |
| 동적톤 제거 | grep 동적 `` bg-${ ``·`` border-${ `` in ForeignStock/ExitTax/EstateChip = 0 | 0 |
| 파일럿 회귀 | 단위테스트 — ToneCard(p-4 override) 산출 class = 전환 전 인라인 class 집합 동일(cn이 p-3 제거) | 회귀 0 |
| 전체 | `npx tsc --noEmit` 0 · `npm test` 회귀 0 | 통과 |

## 9. 리스크

| 리스크 | 완화 |
|---|---|
| 시각 회귀 | **색값 일절 불변**(green 포함) → 회귀 원천 차단. 파생 Record는 기존 문자열 1:1 단위테스트. 파일럿 class-equivalence 단언 |
| 파생(HINT/EXPAND) 문자열 불일치 | `TONE[t].card`=기존 `HINT_CARD_TONE[t]` 완전동일 단언(vitest). blue 상위집합 처리(§6) |
| 동적톤 대체 시 회귀(다크 포함) | ForeignStock/ExitTax는 원래 dark 미대응(light 전용) → `<ToneCard noDark>`(dark: strip)로 dark 변형 미도입, 양 모드 class-equivalence 단언(코드리뷰 M1 반영) |
| 269 파일·20여 Record 점진의 미완성 | 의도된 설계(§3·§4.2). 신규는 §5.1 컨벤션+리뷰로 공용 강제, 채택은 자연 수렴(강제 아님) |

## 10. 미결 · 확인필요 (자가검토/사용자 확정 대상)

1. **violet 2역할**(입력=거주 vs 결과카드=특수분기): 의도된 것인지 커밋이력만으론 불명(조사 "확인필요"). → 이번은 **문서화만**(색 불변), 분리는 미래.
2. ~~green→emerald 통일~~ → **철회**(자기모순·Surgical 위반). green 중복은 P5 문서화만. (자가검토 정정 F-green)
3. **blue 처리(확정)**: blue는 `Tone`에서 **제외** — 법령배지는 `LAW_BADGE` 별도 상수, `ExpandTone`의 blue는 `ExpandToggleButton` 로컬 리터럴 유지. Tone에 죽은 표면 없음(C-F7).
4. **파일럿(확정, Do deviation)**: P2 ForeignStock/ExitTax 전환이 파일럿 겸함(C-F4). 별도 mixed-use 전환은 점진 이월(중복·회귀 위험). `"1-A"` string 케이스는 RTL anchor로 검증.
5. **3-fork 자가검토 완료**: 오류+누락 / 모순+정책 / 개선+UI누락 병렬 → 정정 반영(C-F1 ToneCard 통합·C-F3 chip·C-F7 blue제외·게이트 현실화·green 철회 등). critical/high 잔존 0.

---

## 부록 — 완료 정의 (DoD)
- [ ] `tones.ts` canonical(card·title·badge·chip·toggle) + `<ToneCard tone title? sectionNum:string|number>` + `HINT_CARD_TONE`·`EXPAND_TONE_CLASS`만 파생(회귀 0)
- [ ] 동적톤 3파일 = 0(ForeignStock/ExitTax는 `<ToneCard>` 대체) · `LAW_BADGE` 단일 추출(5파일 참조 교체) · **green 미변경**
- [ ] `check-tone-classes.sh` 동적톤 하드블록 pre-push 배선(현 트리 0건 통과)
- [ ] 파일럿 = P2 ForeignStock/ExitTax 전환 + class-equivalence 회귀 anchor(회귀 0)
- [ ] `npx tsc --noEmit` 0 · `npm test` 회귀 0
- [ ] `components/calc/CLAUDE.md` 톤 규칙(2축·컴포넌트·§5.1 채택표·green 중복) 갱신 + 메모리
