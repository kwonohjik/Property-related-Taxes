# 비주택 → 주택 용도변경 양도 — UI 설계

> 계획서: [`non-housing-to-housing-conversion.plan.md`](non-housing-to-housing-conversion.plan.md) v4 (범위·케이스·Phase 정본)
> 엔진 설계: [`non-housing-to-housing-conversion.engine.design.md`](non-housing-to-housing-conversion.engine.design.md) v2 (타입·알고리즘 정본)
> **이 문서가 UI 세부(위젯·바인딩·testid·표시 규칙)의 정본**이다. 구현 중 변경은 관련 문서 동시 갱신.
> ⚠️ 행 번호 앵커는 **Phase A-0 선분리 이후 무효** — A-0 verify에서 재실측·갱신.

## 사용자 시나리오

오피스텔을 업무용으로 취득해 보유하다 주거용으로 전환한 뒤 양도한 1세대 1주택자가, 양도세 마법사에서 **주택** 자산으로 입력하고 「비주택 → 주택 용도변경」을 켠 뒤 **사실상 주거용 사용 개시일** 하나만 넣으면 §95⑤ 혼합 장특공제와 §154⑤ 비과세 기산이 자동 적용된다.

---

## 1. 입력 위젯 — `NonHousingConversionSection.tsx` (Phase F)

### 1.1 마운트

| 항목 | 값 |
|---|---|
| 파일 | `components/calc/transfer/NonHousingConversionSection.tsx` (신규) |
| 마운트 지점 | **`AssetSectionAcquisition.tsx:288` 직후 새 형제 블록** — `:280-288`은 `{asset.assetKind === "housing" && (<MixedUseExpandedPanel …/>)}` **단일 엘리먼트 블록**이고 `:288`이 그 닫는 `)}`다. 안에 넣으려면 Fragment 구조 변경이 필요하므로 **형제로 추가**: `{asset.assetKind === "housing" && isFirst && (<NonHousingConversionSection … />)}` |
| 배치 근거 | ① C-14(겸용주택 배타)를 **인접 배치로 가시화** ② 형제 `GeneralBuildingConversionSection`도 같은 파일 `:306`에서 `GeneralBuildingBlock`을 통해 마운트 |
| 노출 조건 | `assetKind === "housing"` **AND `isFirst`**(index 0) |
| 신규 prop | **불요** — `AssetSectionAcquisition`이 `isFirst`를 이미 받는다(`:43`) |
| props | `{ asset: AssetForm; onChange: (patch: Partial<AssetForm>) => void; transferDate?: string }` — 형제와 동일 시그니처 |

> 🔴 **`isPrimary`가 아니라 `isFirst`다.** `AssetSectionAcquisition`은 두 prop을 **따로** 받고(`:37` `isPrimary` / `:43` `isFirst`), `:43` 주석이 **"첫 자산(index===0) 여부 — `isPrimaryForHouseholdFlags`와 별개"**라고 명문화한다(전달부 `CompanionAssetCard.tsx:339`·`:343`). 게이트 근거인 `Step4.tsx:68` `form.assets?.[0]`은 **index 0**이므로 `isFirst`가 정답이다 — `isPrimary`로 구현하면 사용자가 대표 자산을 2번으로 바꾸는 순간 Step4 데이터 소스와 어긋난다. **신규 prop 불요**(이미 받고 있다).
>
> **index 0 한정 이유**: `Step4.tsx:68` `primary = form.assets?.[0]`로 **Step4 전체가 assets[0] 전용**이다 — 조정대상지역 토글(`:440`)·거주기간 섹션(`:469`, `i === 0`만 갱신)·거주요건 경고(`:487`)·`regulatedAutoTip`(`:297`). 비-primary 자산에 토글을 켜면 거주기간 입력 경로가 없어 §95⑤2호 거주분이 **항상 0**이 된다 (plan C-26).

### 1.2 구조

**구조 템플릿은 `GeneralBuildingConversionSection.tsx`를 복제**한다(형제 케이스 — 거의 동형).

```
┌ ToggleCard tone="fuchsia" variant="card" ─────────────────────┐
│ ● 비주택 → 주택 용도변경                            [근거 ⓘ]  │
│   오피스텔·근린생활시설 등 주택이 아닌 건물을 취득한 뒤        │
│   건물 전부를 주거용으로 사용하거나 주택으로 용도변경한 경우 ON │
│   (일부만 주택화된 겸용주택은 「겸용주택」 토글을 쓰세요)       │
│                                                                │
│   ┌ FieldCard ────────────────────────────────────────────┐   │
│   │ 사실상 주거용 사용 개시일        [ 2022-11-25 ]        │   │
│   │ hint: 사실상 주거용으로 사용한 날. 불분명하면 건축물   │   │
│   │       대장상 용도변경일을 입력하세요.                  │   │
│   └────────────────────────────────────────────────────────┘   │
│                                                                │
│   ┌ 자동 도출 (useMemo 순수 · 정적 fuchsia 클래스) ────────┐  │
│   │ 총 보유기간       7년 11개월   [conversion-total-holding]│ │
│   │ 비주택 보유기간   4년  9개월 → 표1  8%  [-nonhousing-]  │  │
│   │ 주택 보유기간     3년  2개월 → 표2 12%  [-housing-]     │  │
│   │ 보유공제율 합계             20% (40% 한도) [-holding-rate]│ │
│   │ (캡 발동 시) "40% 한도 적용됨"  [conversion-rate-capped] │ │
│   └──────────────────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────────────────┘
```

### 1.3 tone — `fuchsia` (⚠️ ToneCard 사용 금지)

`ToggleCard.tsx:17`이 `fuchsia`를 **"취득 후 추가 이벤트(증축·용도변경 등 사례 33·35 계열)"**로 정의하고, 형제가 실제로 쓴다(`GeneralBuildingConversionSection.tsx:105`). `ToggleCard`는 자체 `TONES`(`:52`, 7필드 전부 정의)를 쓰며 `tones.ts`와 **별개 소스**다.

> 🔴 **`<ToneCard tone="fuchsia">`는 컴파일 에러다.** `ToneCard.tsx:29`의 `Tone` = `tones.ts:22` `"sky"|"emerald"|"amber"|"violet"|"rose"|"slate"` 6종이고, `tones.ts:15-16`이 **"green/red/blue/fuchsia/indigo는 비-대상 — 이 소스에 미포함"**을 설계 결정으로 명문화했다.
>
> ⇒ 자동 도출 박스는 **정적 리터럴 클래스**를 쓴다. `check-tone-classes.sh`는 `${}` 동적 보간만 검출하므로 통과한다.

```
bg-fuchsia-50 border-fuchsia-300 text-fuchsia-800
dark:bg-fuchsia-950/30 dark:border-fuchsia-800/60 dark:text-fuchsia-200
```

> 🔴 **`dark:` variant 필수.** 형제 `GeneralBuildingConversionSection.tsx`는 파일 전체 `dark:` **0건**이지만, 같은 카드의 `ToggleCard` `TONES.fuchsia`는 `dark:` 전 필드를 갖는다(`containerOn`에 `dark:border-fuchsia-700/60 dark:bg-fuchsia-950/30`) → 그대로 베끼면 **다크모드에서 카드는 어두운데 미리보기 박스만 흰 배경**이 된다. 형제의 `dark:` 부재는 **기존 갭**으로 별건 기록.

### 1.4 미리보기 — 엔진 헬퍼 직접 import (재구현 금지)

```ts
import { calcUsagePeriodInfo } from "@/lib/tax-engine/usage-period-info";          // 신규 leaf
import { calcConversionHoldingPct } from "@/lib/tax-engine/conversion-holding-pct"; // ✅ 신규 leaf (Phase A deviation)
import { calculateHoldingPeriod, LTHD_CONVERSION_95_5_CUTOFF } from "@/lib/tax-engine/tax-utils";
```

> ✅ **경로 갱신(Phase F)**: `calcConversionHoldingPct`는 `transfer-tax-helpers.ts`가 **아니다** —
> `tax-utils` ↔ `mixed-use-inheritance` 순환 때문에 Phase A에서 신규 leaf로 분리됐다.
> 「N년 M개월」 표시에는 `calculateHoldingPeriod`가 추가로 필요하다(`calcUsagePeriodInfo`는 연수만 준다).

- **`useMemo` 순수** — `useEffect → store` 미러링 금지 (memory `feedback_useeffect_store_mirror_forbidden`)
- 선례: `Step4.tsx:4`가 이미 `@/lib/tax-engine/transfer-tax-exemption`을 직접 import
- 재구현 시 dual-truth (memory `feedback_ui_engine_dual_truth_avoidance` · `single-source-engine-helper` 스킬)
- ⚠️ 엔진 설계에서 헬퍼 위치가 바뀌면 **이 import 경로도 함께 갱신**

### 1.5 근거 모달

| 위치 | 컴포넌트 |
|---|---|
| ToggleCard `trailing` | `<LawArticleModal legalBasis="소득세법 §95 ⑤" label="§95⑤ 혼합 공제율" />` |
| 〃 | `<PrecedentArticleModal citation="서면-2020-부동산-5098" kind="interpretation" summary={회신 원문} />` — **원문 확보됨**(plan §3.1). 문서번호 병기: `[부동산납세과-1247]` |

### 1.6 data-testid

| testid | 대상 | 용도 |
|---|---|---|
| `conversion-total-holding` | 총 보유기간 값 | E2E |
| `conversion-nonhousing-holding` | 비주택 보유기간 + 표1 % | E2E |
| `conversion-housing-holding` | 주택 보유기간 + 표2 % | E2E |
| `conversion-holding-rate` | 보유공제율 합계 | E2E |
| `conversion-rate-capped` | 40% 캡 발동 시에만 렌더 | C-7 확인 |

토글 자체는 프로젝트 관행대로 `[data-slot="toggle-card"]` + `filter({hasText})` + `getByRole("switch")`로 잡는다. base-ui Switch는 `setChecked` 불가 사례가 있으므로 **`click()`** 사용.

### 1.7 게이트 안내

양도일 < 2025-01-01이면 미리보기 자리에 rose 톤 안내:

> 「소득세법」 제95조 제5항·제6항은 **2025년 1월 1일 이후 양도분부터** 적용됩니다(부칙 제19933호 제7조). 이 양도일에는 종전 방식으로 계산됩니다.

토글 자체는 유효하다 — R-2(비과세 기산, 2024-03-01~)는 별도 게이트다.

### 1.8 모바일

자동 도출 박스는 라벨-값 4행이다. `flex justify-between text-xs`로 **1행 유지**한다(`FieldCard`의 sm 미만 `grid-cols-1` 자동 대응은 커스텀 박스에 적용되지 않는다).

---

## 2. Step4 연동 (Phase D ✅ 완료 2026-08-05)

> 전제: **Step4 §② 전체가 `assets[0]` 전용**.
> ⚠️ **폼 필드 ①②③를 Phase D로 당겼다** — Step4가 읽을 `hasNonHousingConversion`·`residentialUseStartDate`의 출처가 Phase F였다(계획이 놓친 D→F 의존). 입력 위젯 ⑤·validation ⑧은 Phase F에 남는다.

파생 2개를 상단에 두고 4곳이 공유한다:

```ts
const conversionActive = isUsageConversionActive(primary);          // 단일 소스 술어
const residenceJudgmentDate = conversionActive ? primary!.residentialUseStartDate : primaryAcquisitionDate;
const judgmentDateLabel = conversionActive ? "용도변경일" : "취득일";
```

| 위치 | 현행 | 용도변경 ON 시 | |
|---|---|---|---|
| 토글 | 라벨 "**취득일** 기준 조정대상지역" | "**용도변경일** 기준" + description에 "주택이 된 날" 설명 | ✅ |
| 🆕 **자동 판별 fetch** | `acquisitionDate: primaryAcquisitionDate` | `residenceJudgmentDate` (deps도 교체) | ✅ **설계가 놓친 지점** — 이 결과가 토글을 자동으로 덮어쓴다 |
| `regulatedAutoTip` 표시 | "취득일(2018-02-10): …" | "용도변경일(2022-11-25): …" | ✅ |
| 1세대1주택 배너 | "표2(보유 4%/년 + 거주 4%/년, **최대 80%**)" | §95⑤ — 비주택 기간 표1 / 주택 기간 표2, 보유분 합계 **40% 한도**, 거주분 별도 | ✅ |
| 거주요건 경고 | "**취득 당시** 조정대상지역 주택은…" | "**용도변경 당시**" | ✅ |
| 거주기간 섹션 아래 | — | `residenceInputMode === "direct"`면 C-10b 안내(amber) 노출 | ✅ |

**Phase D에 두는 이유**: Phase D verify가 "Step4 안내 ↔ 엔진 판정 일치"인데 UI가 Phase G에 있으면 그 시점에 Step4가 아직 옛 기준일을 써서 **verify를 통과시킬 수 없다**.

### C-10b 안내 문구 (`direct` 모드)

> 거주기간을 개월 수로 직접 입력하셨습니다. 「소득세법」 제95조 제5항 제2호는 **주택으로 보유한 기간 중 거주한 기간**만 산입하므로, 주거용 사용 개시일 이후의 거주기간만 입력하세요.

---

## 3. 결과 화면 (Phase G)

### 3.1 상세 카드

배치: **`TransferTaxResultView.tsx:293-474` `<PrintSection id="calculation">` 내부** → **신규 print leaf 불요**(`ALL_LEAVES` 동기화 테스트도 불요).

```
장기보유특별공제  57,132,800
  ├ 보유기간 공제율                                        20%
  │   비주택으로 보유한 기간 4년 → 표1        8%
  │   주택으로 보유한 기간   3년 → 표2       12%
  │                                    합계  20%  (40% 한도 이내)
  └ 거주기간 공제율                                        12%
      주택으로 보유한 기간 중 거주한 기간 3년 → 표2  12%
  근거: 「소득세법」 제95조 제5항·제6항
```

| 규칙 | 적용 |
|---|---|
| 금액 칸 | `text-right font-mono tabular-nums whitespace-nowrap` (`amount-column-align` 스킬) |
| 산식 | **`components/calc/results/shared/FormulaParts.tsx`**의 `Frac`·`FLine` |
| 표기 | 한국어 풀어쓰기 · 변수 약어 금지 · `floor()` 미표시 · "원" 표기 금지 · 내부 id 노출 금지 |
| **미표시 조건** | `result.usageConversionDetail === undefined`(I-1·I-2·I-3·I-5·I-9·I-15 및 **이력에서 불러온 과거 결과**)이면 **카드 미렌더** — 기존 표1/표2 표시 유지 |
| 데이터 소스 | `result.usageConversionDetail` (공제율은 **정수 %** — `table1Pct`·`table2HoldingPct`·`residencePct`) |
| 요약행 연결 | ✅ **미결 a 결정 — 연결·병기 모두 불요.** 상세 카드가 **같은 `PrintSection` 안**(`pre1990LandValuationDetail` 카드 직후)에 렌더되므로 요약행에서 스크롤·앵커로 유도할 대상이 없다. 카드 제목 자체가 "비주택 → 주택 용도변경 장기보유특별공제"로 근거를 밝힌다 |
| 접힘 여부 | ✅ **미결 b 결정 — 접지 않는다.** 카드가 8행으로 짧고 §95⑤ 적용 자체가 드문 케이스라 나타났을 때 바로 읽혀야 한다. 펼침 토글을 두면 `print-only-css-toggle` 대응이 추가로 필요해 이득 없이 복잡해진다 |
| 구현 | ✅ `components/calc/results/transfer/UsageConversionDetailCard.tsx`(신규 105줄) — 절사 안내(§3.2)를 **같은 카드 안에** 포함 |

### 3.2 절사 안내

`usageConversionDetail.residenceMonthsTrimmed > 0`이면 amber 안내:

> 입주일이 주거용 사용 개시일보다 빨라 **N개월**이 거주기간에서 제외되었습니다(「소득세법」 제95조 제5항 제2호). **주거용 사용 개시일을 앞당겨야 하는지 확인하세요.**

> ⚠️ 이 안내는 D-6(비과세 거주요건에도 클램프)의 사용자 접점이다. plan R-G가 기록하듯 **명문 없는 불리 적용**이므로, 문구가 "왜 줄었는지 + 무엇을 확인해야 하는지"를 모두 담아야 한다.

### 3.3 §95② 하드코딩 8곳 문구 분기 (Phase G ✅ 완료 2026-08-05)

> ✅ **실측 결과 — 손댈 곳은 8곳이 아니라 3곳이었다.**
>
> `DetailedStatementHelpers`가 `lthHoldingStep?.formula ?? fallback` · `?.legalBasis ?? (...)`로
> **엔진 sub-step을 우선 소비**한다. §95⑤ 케이스는 항상 sub-step을 낳으므로(`isOneHouseSpecial || conv`)
> 엔진만 고치면 명세서·신고서 산식과 근거조문이 **자동으로 따라온다**.
>
> | 대상 | 판정 |
> |---|---|
> | `transfer-tax-lthd-steps.ts` 산식·sub-step 금액·`legalBasis` | ✅ **수정**(금액이 틀렸다 — 아래) |
> | `DetailedStatementHelpers.ts` `note` | ✅ **수정** — "1세대1주택 고가주택 표2 적용"이 §95⑤에서 부정확 |
> | 〃 fallback 산식(`§95② 표1/표2`) | ⚪ **불요** — sub-step이 있어 §95⑤가 도달하지 않는다(표1 단독·차손·겸용·과거 이력만 도달) |
> | `FilingFormTableRowDefs.ts:46-47` · `FilingFormTableAggregateHelpers.ts:314-315` | ⚪ **불요** — **라벨 정의만**이고 값·산식은 `items.get()`로 온다. 라벨을 바꾸면 신고서 행이 어긋난다 |
>
> 🔴 **금액이 틀렸다 — 문구만의 문제가 아니었다.** 종전 경로는 `hPart = min(총보유 7년 × 4%, 40) = 28`,
> `rPart = 12`로 안분해 보유분 **39,992,960**을 냈다. 정확값은 보유분 20% : 거주분 12% 안분인
> **35,708,000**이다(거주분 21,424,800). 문구도 "28% + 12% = 32%"로 **자기모순**이었다.
> anchor에 두 금액과 합계 불변식을 고정했다.

#### (참고) 설계 시점의 대상 목록

sub-step `"보유 기간분 장특"`·`"거주 기간분 장특"`은 **신고서 양식 표(단건·다자산)와 상세명세서가 라벨로 소비**한다. 참조 사례 PDF 537p 화면이 바로 그 「양도소득금액 계산명세서」다 — **우회하면 그 행이 빈다.** 라벨은 유지하고 문구만 분기한다.

| 대상 | 조치 |
|---|---|
| `transfer-tax-lthd-steps.ts:84-85` | `× 4%` 하드코딩 → §95⑤ 분기 시 echo의 `table1Pct`/`table2HoldingPct` 사용 |
| `transfer-tax-lthd-steps.ts:96`·`:103` sub-step `legalBasis` | `TRANSFER.LONG_TERM_DEDUCTION`(`"소득세법 §95 ②"`) → **`TRANSFER.LONG_TERM_DEDUCTION_CONVERSION`**(`"소득세법 §95 ⑤"`)로 분기. `DetailedStatementHelpers.ts:523`·`:535`가 이 값을 그대로 인쇄한다 |
| `DetailedStatementHelpers.ts:453-454` | `Math.min(lthHoldingYears * 4, 40)` — **총 보유 기준 표2 산식의 사본**. §95⑤ 분기 시 echo 값으로 대체 |
| `DetailedStatementHelpers.ts:463`·`:464`·`:468`·`:469`·`:478`·`:516`·`:528-530` | `"(§95② 표2 …)"` 설명·fallback 산식 문구 분기 |
| `FilingFormTableRowDefs.ts:46-47` · `FilingFormTableAggregateHelpers.ts:314-315` | 라벨→키 행 정의뿐 — **변경 불요**(값은 엔진에서 흘러온다) |
| **`DetailedStatementHelpers.ts:522·523·534·535`의 `??` fallback** | `lthHoldingStep?.legalBasis ?? (useTable2 ? "소득세법 §95② 별표 표2" : "…표1")` — echo가 없는 **이력(과거) 결과**에서 발동한다. 원천 문구는 `lthHoldingFallbackFormula`(`:459-463`)·`lthResidenceFallbackFormula`(`:464-469`). ⚠️ **과거 결과에는 echo가 없어 분기 불가** — "이력 결과는 §95② 표시 유지"를 **의도된 동작**으로 기록한다 |

---

## 4. 클라이언트 8 동기화 지점

| # | 지점 | 파일 | 작업 |
|---|---|---|---|
| ① | 폼 상태 | 🔴 신규 `lib/stores/calc-wizard-asset-usage-conversion.ts` | `UsageConversionFormSlice { hasNonHousingConversion: boolean; residentialUseStartDate: string }` → `AssetForm extends`(`calc-wizard-asset.ts:61`, 현재 8슬라이스). **본체 668줄(A-0 분리 후) — 슬라이스 패턴 유지** |
| ② | initial | `calc-wizard-asset-factory.ts:62` `makeDefaultAsset` | `false` / `""` |
| ③ | normalize | `calc-wizard-asset-migrate.ts` | backfill. ⚠️ **유일한 안전망 아님** — `migrateAsset`은 현행 포맷 sessionStorage·IndexedDB 이력 로드에는 돌지 않는다 |
| ④ | API 변환 | `lib/calc/transfer-tax-api.ts` | 객체 생성 게이트(토글 ON **AND** 날짜 유효) + **거주 클램프**(`clampResidenceToHousingPeriod`). 접근부 가드 `?? false`·`?? ""` |
| ⑤ | UI 위젯 | §1 (신규) + 마운트 `AssetSectionAcquisition.tsx:288` + §2 `Step4.tsx` 4항목 | 접근부 가드 `asset.residentialUseStartDate ?? ""` |
| ⑥ | 사이드바 | — | **N/A 확인 완료** — `computeTransferSummary`(`calc-wizard-store.ts:516-600`)는 금액 5필드만 반환 |
| ⑦ | 결과 카드 | §3 (상세 카드 + `TransferTaxResultView.tsx` + G-12 3파일) | |
| ⑧ | validation | `lib/calc/transfer-tax-validate-asset.ts` | 아래 §5. ⚠️ **`:310` 겸용주택 조기 return보다 앞에 배치** |

**접근부 가드가 유일한 안전망**인 이유: 신규 필드가 stale 데이터에서 `undefined`로 도달하면 UI `DateInput` 크래시 / ④→Zod required 400 (memory `feedback_new_asset_field_stale_sessionstorage_guard`).

---

## 5. Validation (⑧ · Phase F ✅ 완료 2026-08-05)

⚠️ 설계는 "겸용주택 조기 return보다 앞"이라 했으나 실제로는 **`validateAssetAcquisition` 맨 앞**에 뒀다 — 겸용주택 말고도 **부담부증여(C-24)·이월과세(C-21)가 각자 전용 검증으로 먼저 빠져나간다**. 그 뒤에 두면 차단이 필요한 세 조합 전부에서 dead code가 된다. 테스트 3건으로 배치를 고정했다.

> 🔴 **800줄 초과 → 분리**: 검증을 넣자 `transfer-tax-validate-asset.ts`가 **820줄**이 됐다.
> `validateUsageConversion`을 **`transfer-tax-validate-usage-conversion.ts`(81줄)**로 분리하고
> 호출만 남겼다(752줄). 형제 `-mixed-use-asset.ts`·`-bg.ts`·`-gb.ts`와 같은 위임 패턴이다.

| 케이스 | 조건 (폼 관측 가능) | 메시지 |
|---|---|---|
| C-16 | 토글 ON · `residentialUseStartDate === ""` | 사실상 주거용 사용 개시일을 입력하세요. |
| C-8 | 개시일 ≤ `acquisitionDate` | 주거용 사용 개시일은 취득일 이후여야 합니다. |
| C-9 | 개시일 ≥ 양도일 | 주거용 사용 개시일은 양도일 이전이어야 합니다. |
| C-14 | `isMixedUseHouse === true` | 겸용주택과 함께 사용할 수 없습니다 — 일부만 주택화된 경우 「겸용주택」의 보유 중 일부 용도변경을 쓰세요. |
| C-18 | `asset.reductions`(`calc-wizard-asset.ts:89`, `AssetReductionForm[]` — union은 `calc-wizard-asset-reduction.ts:126`) 중 `type === "rental_97_3" \| "rental_97_4"` | ⚠️ 엔진 `rentalReductionDetails`는 **폼에 없어 validate가 볼 수 없다**(`calc-wizard-asset-reduction.ts:167·179` 사용) |
| C-19 | `hasSeperateLandAcquisitionDate === true` (`calc-wizard-asset.ts:395`) | |
| C-20 | `asset.reductions` 중 `unsold_98_2`(`:320`)·`rental_97_3`·`rental_97_4` | |
| C-21 | `acquisitionCause ∈ {inheritance, gift, carryover_gift}` | |
| C-24 | `transferType === "burdened_gift"` (`calc-wizard-asset.ts:224`) | |
| C-26 | 자산 index ≥ 1 | **validation 아님 — UI 미노출로 처리** |

**공통 차단 문안** (사유 1줄 + 대안):

> 이 조합은 현재 지원하지 않습니다 — 「비주택 → 주택 용도변경」 토글을 끄면 종전 방식으로 계산됩니다.

> ⚠️ **C-21(상속·증여 취득)은 실무 빈발**이고 plan R-C가 "우선순위 명문 없음"이라 장기 미해소가 예상된다. plan에 "해소 시 최우선 확장 대상"으로 기록돼 있다.

### 「용도변경 활성」 술어 — 인자 동일성

| 계층 | 술어 |
|---|---|
| ⑤ UI | `asset.hasNonHousingConversion && asset.residentialUseStartDate !== ""` |
| ⑧ validate | 동일 |
| ④ API 변환 | 동일 (그 결과로 객체 생성) |
| 엔진 | `input.nonHousingToHousingConversion !== undefined` |

세 계층이 **같은 술어**를 써야 "UI 통과 ↔ validate 차단" 모순이 생기지 않는다 (memory `feedback_shared_predicate_argument_parity`).

---

## 6. E2E (Phase H ✅ 완료 2026-08-05)

`e2e/non-housing-to-housing-conversion.spec.ts` — **5건 전건 통과**

| # | 케이스 | 검증 |
|---|---|---|
| 1 | 입력 미리보기 | 총 7년 11개월 · 표1 8% · 표2 12% · 합계 20% · 캡 미발동 |
| 2 | §95⑤1호 단서 | 표1 24% + 표2 32% = 56% → **40%** + 캡 안내 |
| 3 | 시행일 게이트 | 양도일 2024-12-31이면 미리보기 대신 안내 |
| 4 | ★ 계산 결과 | 상세 카드 · 산식 자기일관 · 57,132,800 · **35,708,000/21,424,800** · 26,177,520 · 2,617,752 |
| 5 | 회귀 0 | 토글 OFF → 종전 표2 경로(71,416,000) · 상세 카드 미렌더 |

> 🔴 **시드 후 `expandAssetSection(page, 3)`이 필수다.** 위젯이 자산 카드 ③ 취득 섹션 안에 있어
> 접힌 채로는 DOM에만 있고 보이지 않는다. `toHaveText`는 hidden에서도 통과하므로 이 누락이
> **테스트를 조용히 약하게** 만든다 — `toBeVisible` 단언에서만 드러났다.

⚠️ **sessionStorage 시드 방식**이 양도세 E2E 정본이다 (`commercial-building-97-2-swap.spec.ts:52-58` — `page.evaluate(sessionStorage.setItem("transfer-tax-wizard", …))` + `makeDefaultAsset` import). `addAssetByType` 헬퍼는 **상속세 전용**(`asset-toggle-visibility-precision.spec.ts:35` — `estate-edit-dialog` 대기)이라 쓸 수 없다.

시드는 `seedForm` 반환 객체 전체를 담아야 한다(`commercial-building-97-2-swap.spec.ts:40-65` — form-global + `pendingMigration:false` + `version:0` 래퍼). **§95⑤ 게이트 충족에 필요한 필드를 빠뜨리면 I-5(표1 단독)가 나온다**:

```
assets[0]: makeDefaultAsset + {
  hasNonHousingConversion: true, residentialUseStartDate: "2022-11-25",
  acquisitionDate: "2018-02-10", acquisitionPrice/expenses …,
  residenceInputMode: "direct", residencePeriodMonthsAsset: "36",   // 거주 3년
}
form-global: transferDate:"2026-01-27", filingDate, contractTotalPrice:"1500000000",
  isOneHousehold:true, householdHousingCount:"1",
  isRegulatedArea:false, wasRegulatedAtAcquisition:true, isUnregistered:false
래퍼: { state:{…}, version:0 } + pendingMigration:false
```

```
1. 위 시드를 sessionStorage("transfer-tax-wizard")에 주입
2. reload → Step1
3. 미리보기 4 testid 단언 (총 7년 11개월 / 비주택 4년 → 8% / 주택 3년 → 12% / 합계 20%)
4. 계산 실행
5. 결과 화면 장특공제 32% · 57,132,800 단언
```

토글 클릭 경로는 별도 케이스로 분리하거나 생략한다. `e2e/known-failures.ts` 영향 여부를 확인한다.

---

## 7. 검증 체크리스트

- [ ] `DateInput` 사용 (`type="date"` 아님)
- [ ] placeholder에 숫자 예시 없음 · 라벨은 역할별 정본 클래스(임의 `text-[Npx]` 금지 — pre-push 하드블록)
- [ ] 자동 도출 박스에 `dark:` variant 포함
- [ ] `ToggleCard tone="fuchsia"` · **`ToneCard` 미사용**(컴파일 에러)
- [ ] 자동 도출 박스 = 정적 리터럴 클래스 · `check-tone-classes.sh` 통과
- [ ] 미리보기가 엔진 헬퍼 직접 import (재구현 0)
- [ ] `useMemo` 순수 — `useEffect → store` 미러링 0
- [ ] primary 자산에만 노출 (C-26)
- [ ] 8 동기화 지점 전부 + 접근부 가드 `?? false`/`?? ""`
- [ ] ⑧ validation이 `:310` 조기 return **앞**에 배치
- [ ] 겸용주택 ON + 토글 ON **실행 확인**(dead code 아님)
- [ ] 이력(IndexedDB) 복원 시 신규 필드 부활
- [ ] 결과 금액 칸 `font-mono tabular-nums`
- [ ] 신고서·상세명세서 행이 §95⑤ 문구로 표시
- [ ] `npx tsc --noEmit` 0건 · `npm run lint` 0건
- [ ] 브라우저 수동 확인 (Network 탭 request body에 신규 **3필드** 도달 — 단건 + 다자산)
