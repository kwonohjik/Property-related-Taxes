# 1세대1주택 비과세 판정 메뉴 — UI 설계

> 계획서: `docs/00-pm/one-house-exemption-automation.plan.md`(P4 착수 전 산출물 게이트).
> 엔진 설계 문서(`one-house-exemption-automation.engine.design.md`, `judgeOneHouseExemption`·`OneHouseFacts`·`OneHouseJudgment`)와
> 이름·필드를 맞춘다 — 본 문서는 **UI가 입력받는 사실 필드**와 **화면이 읽는 결과 필드**를 확정해 대조 가능하게 한다.
> 코드 기준 커밋 `dd3e0075`(2026-09-18). file:line은 전부 실측(작성 중 직접 Read).
> 🔴 **2026-09-18 결정 변경(본 문서 반영)**: 1세대 판정은 **엔진이 하지 않는다** — 프로그램은 §88 6호·영 §152의3
> 요건을 자동 판정하지 않고, 사용자가 「1세대 해당」을 선언한다. 계획서의 Q-3′(자동 판정 + 수동 수정)과
> Q-6(수동 수정 확장 범위)은 이 문서 기준으로 **폐기·소멸**한다(§3.1·§14 참조).
>
> 🔍 **자가 검토 정정(2026-09-18, 초안 대비)** — 초안은 UI 시니어 에이전트가 작성했고 검토에서 아래를 정정했다(법제처 실독·코드 실측).
> ① 1세대 **안내 문구가 법 §88 6호와 다름**(거주자 본인의 직계존비속·「같은 주소·생계」·사실상 이혼 괄호·소득 기준 40% 누락) → 조문 그대로 요약
> ② 전달 헬퍼가 `router.push`를 포함해 **계산기 내부·다건 편집 화면에서 호출하면 페이지를 떠남**(`transfer-resume-entry.ts:135-137` 원형이 그렇다) → 「적용」과 「이동」 분리
> ③ V-13 결론이 엔진 설계와 **정반대** → **Q-7 사용자 결정**으로 올림(§9) ④ `SellingHouseExclusionSection`은 **중과 축(영 §167의10)** 으로 확인 → 판정 메뉴에서 숨김
> ⑤ 「신규 위젯 0개」 주장 오류(§155의2·§155의3 카드 신설) ⑥ 결과·사실 필드명을 엔진 설계와 통일 ⑦ 겸용 결과뷰 경로·E2E 경로 매핑·G-5 지점 수 정정

---

## 0. 핵심 결정 5줄 요약

1. ① 세대 입력은 **현행 계산기(`Step4.tsx:413-422`)와 완전히 같은 자기선언**이다 — 자동 판정·수동 수정·수정 사유·「사용자 수정」 출처 배지 전부 없다.
2. ② 보유 주택·권리 명세는 **기존 섹션 7종을 그대로 재사용**한다(기존 특례 입력은 신규 위젯 0개 — §155의2·§155의3 입력 카드 2개와 ③ 양도 대상 선택 1개만 신설) — `HousesListSection`(내부에 `PresaleRightsSection`·`SellingHouseExclusionSection` 포함)·`HouseCountExemptionInputs`(상속 2년 게이트 포함)·`TemporaryTwoHouseSection`·`RightThreeYearExceptionSection`·`InheritedRightExceptionSection`·`MergedHouseholdRightSection`·`ExemptionProvisoSection`. 전부 `{ form: TransferFormData 호환, onChange }` props라 결합 없이 재사용된다(실측, §4).
3. 판정 → 계산기 전달은 **`transfer-resume-entry.ts` 계열 단일 헬퍼**로 새로 만든다 — `router.push` 전에 `useCalcWizardStore`에 직접 쓰는 기존 패턴(SPA 네비게이션, sessionStorage 불필요)을 따른다.
4. **다건 계산기는 별도 통합이 필요 없다** — `MultiTransferSteps.tsx:203`의 `StepEdit`이 자산 편집 시 **단건 `<TransferTaxCalculator />`를 그대로 마운트**하고 `useCalcWizardStore`와 `properties[i].form`을 양방향 동기화한다(V-12 완전 해소, §8).
5. 계산기 결과뷰 출처 한 줄은 **컴포넌트 1개 + 공용 술어**로 4종에 붙인다. 문구는 「판정 메뉴 결과 기준(판정일)」·「판정 이후 명부 수정됨」·「원본 판정이 바뀌었습니다」 3종뿐 — 「사용자 수정」은 없다(§7).

---

## 1. 신규 세목 UI 킥오프 체크리스트 (인라인 이행)

`_new-tax-ui-kickoff.checklist.md` 요구사항을 본 문서 안에서 충족한다.

### 1.1 14 동기화 지점 사전 채우기 — §10 표로 이행.

### 1.2 케이스 인벤토리 — 계획서 §6 OH-01~OH-22(현행 회귀 anchor 16 + 신규 OH-11~13·17~22)를 그대로 승계. 본 문서는 UI 전용 신규 케이스 3건을 추가한다(§13).

### 1.3 Silent fallback 후보 식별

| 필드 | 자동 채울 유혹 | 결정 |
|---|---|---|
| 판정 메뉴 ①「1세대 해당」 | 세대원 수·나이로 자동 추정 | ☑ **금지 — 사용자 선언만**(본 문서 결정 변경) |
| 계산기 넘겨받은 사실이 없는데 주택 수 ≥ 2 | 판정 메뉴 다녀온 것처럼 기본 특례 적용 | ☑ 검증오류(안내 카드) — 특례 없음으로 과세(OH-20, 현행과 동일) |
| 판정 메뉴 ③ 양도가·양도일 미입력 | 최근 시세·오늘 날짜로 채움 | ☑ 검증오류 차단 |

### 1.4 Cross-field 동기화 — useEffect 금지 사전 선언

| 트리거 | 갱신 대상 | 패턴 |
|---|---|---|
| ② 명부(`houses[]`) 변경 | 주택 수 도출(정본) | ☑ `useMemo` 파생 표시만, store에 별도 `householdHousingCount` 필드 쓰지 않음(판정 메뉴에는 그 필드 자체가 없다) |
| ③ 조정대상지역 자동판별(`/api/address/regulated-area`) | 조정지역 토글 | ☑ 기존 Step4 패턴(`touched` 가드) 그대로 재사용 — 신규 로직 없음 |
| 계산기 넘겨받은 사실의 명부를 사용자가 수정 | 출처 배지 문구 | ☑ `useMemo`로 해시 비교, store에 배지 텍스트를 쓰지 않고 파생 표시 |

### 1.5 공통 정책 6종 — `policy-check`/`mirror-pattern` 스킬 및 CLAUDE.md 정독 완료(본 세션 시작 시 로드).

### 1.6 Date 필드 헬퍼 — 판정 메뉴 신규 Date 필드(혼인일·합가일·양도예정일·계약체결일 등)는 route handler에서 전부 `toDate`/`toOptionalDate`(`lib/api/date-coerce.ts`) 경유. 목록: `marriageDate`·`parentalCareMergeDate`·`saleExpectedDate`·`houses[].acquisitionDate`·`houses[].inheritedDate`·`presaleRights[].acquisitionDate`(기존 계산기와 동일 필드이므로 기존 date-coerce 매핑을 그대로 승계).

---

## 2. 정보구조 — 메뉴·경로·이력 등록

| 항목 | 값 | 근거(file:line) |
|---|---|---|
| 경로 | `app/calc/one-house-exemption/` | 계획서 §5.2, `app/calc/*` 규약 |
| 메뉴명 | 「1세대1주택 비과세 판정」 | 계획서 §5.2 |
| 메뉴 등록 | `app/page.tsx` `MENU` 배열(:64) — `{ href: "/calc/one-house-exemption", title: "1세대1주택 비과세 판정", subtitle: "보유 주택 판정 후 세액 계산기로 이동", icon: "🏡", tone: "violet" }` 신규 항목 추가. 기존 항목은 `href`·`title`·`subtitle`·`icon`·`tone` 5필드 객체 리터럴(:64-145 실측) | `app/page.tsx:64-145` |
| API | `app/api/calc/one-house-exemption/route.ts` — rate limit → Zod → `preloadTaxRates(양도예정일)` → `judgeOneHouseExemption()` | 2-Layer 규약. 기존 `app/api/calc/transfer/route.ts` 패턴 이식 |
| 이력 타입 | `LocalTaxType`(`lib/storage/types.ts:7-14`)에 `"one_house_exemption"` 추가 + `lib/storage/backup-validate.ts:14-22` `LOCAL_TAX_TYPES` 배열에 같은 값 추가 | 실측 — 두 파일이 **각자 리터럴 배열**을 갖고 있어 하나만 고치면 백업 import가 새 세목을 거부한다 |
| 라벨 | `lib/storage/title-generator.ts:4` 근처 세목 라벨 맵에 `one_house_exemption: "1세대1주택 비과세 판정"` 추가. `app/history/HistoryClient.tsx:34` `TAX_TYPE_LABELS`에도 **동일 문자열** 추가(별개 상수 — 실측, 드리프트 주의) | `lib/storage/title-generator.ts:4-10` · `app/history/HistoryClient.tsx:34-45` |
| 이력 필터·라우팅 | `app/history/HistoryClient.tsx:23` `TAX_TYPE_ROUTES`(Partial<Record<LocalTaxType,string>>)에 `one_house_exemption: "/calc/one-house-exemption"` 추가, `:46` `FILTER_OPTIONS` 배열에 필터 항목 추가, `:78-150` 세목별 요약 분기(`if (taxType === "transfer") {...}` 나열 형태)에 판정 요약 분기 추가 | `app/history/HistoryClient.tsx:18-150` |
| 이력 dedup 키 | `lib/storage/business-key.ts:34` `extractBusinessKey` switch에 `case "one_house_exemption"` 추가. 판정 대상이 명확한 「물건」(양도 예정 주택 주소)이 있으면 `addr:${주소}` 패턴(취득세·재산세 선례), 없으면 `null` 반환 → content-hash dedup 폴백(안전측 — 계획서 인용 규약과 동일) | `lib/storage/business-key.ts:45-58`(transfer case 패턴 그대로 이식) |
| Supabase CHECK | 불필요 — `계산 이력` 서버 저장 경로 자체가 없다(로컬 IndexedDB 일원화, `proxy.ts:4`) | 계획서 §5.2 표 각주 |

---

## 3. 4단계 마법사 상세 설계

공용 강제 규칙(재확인): `ToggleCard`/`RadioCardGroup` 필수(native 금지, OFF도 tone 유지) · `<ToneCard>` 단일 소스 · 라벨 정본 클래스 · 모달 런처 `Button variant="modalLauncher"` · 선택지 anchor는 `value` 기준 · placeholder 숫자 예시 금지 · 결과 산식 한국어 풀어쓰기 · 금액 칸 `font-mono tabular-nums text-right` · 포커스 전체선택(Provider 자동). `WizardSidebar`(좌측 sticky) + `computeOneHouseJudgmentSummary()`(신규 순수 함수, `useMemo` 필수) 사용.

### 3.1 ① 세대 — **사용자 선언** (2026-09-18 결정 변경)

```
┌ ① 세대 ──────────────────────────────────────────────
│ ▨ 1세대 정의 안내 (ToneCard tone=sky, 접힘 가능)
│    "1세대"란 거주자와 그 배우자가, 같은 주소(거소)에서 생계를 같이 하는 가족
│    — 거주자와 배우자의 직계존비속(그 배우자 포함)과 형제자매 — 과 함께 이루는
│    가족단위입니다. 취학·질병 요양·근무·사업상 형편으로 잠시 따로 사는 가족도 포함합니다.
│    법률상 이혼했더라도 생계를 같이 하는 등 사실상 이혼으로 보기 어려우면 배우자로 봅니다.
│    배우자가 없어도 다음 중 하나에 해당하면 1세대로 봅니다:
│      · 거주자의 나이가 30세 이상인 경우
│      · 배우자가 사망하거나 이혼한 경우
│      · 사업·근로소득 등이 기준 중위소득을 12개월로 환산한 금액의 40% 이상이고,
│        소유 주택·토지를 관리·유지하며 독립된 생계를 유지할 수 있는 경우
│        (미성년자는 제외 — 결혼·가족의 사망 등 예외 사유가 있으면 인정)
│    [소득세법 §88 6호 배지] [소득세법 시행령 §152의3 배지]
│    ⚠️ 이 프로그램은 위 요건 충족 여부를 자동으로 판정하지 않습니다.
│       아래에서 직접 판단해 선택하세요.
│
│ 1세대 해당 여부           ToggleCard tone=violet  testid=one-house-household
│    "독립적인 생계를 유지하는 세대" (Step4.tsx:414-422와 동일 라벨·설명)
│
│ 혼인합가일 · 동거봉양 합가일   MergeDateSection 그대로 재사용
│    (marriageDate · parentalCareMergeDate · isFirstTransferredInMerge)
└────────────────────────────────────────────────────
```

- **삭제 항목(명시)**: 자동 판정 결과 카드, 「수동으로 수정」 버튼, 수정 사유 입력창, 판정 결과 배지에 붙는 「사용자 수정」 표시. 나이·소득·배우자 사망/이혼 입력 필드도 만들지 않는다.
- 안내 문구는 **법 §88 6호·영 §152의3·칙 §70 원문(법제처 실독, 2026-09-18)을 요약한 것**이다. 사용자가 이 안내만 보고 스스로 판정하므로
  **요건을 빼거나 바꾸어 적지 않는다** — 특히 「같은 주소·생계」 요건과 소득 기준(기준 중위소득 40%)은 반드시 남긴다.
  칙 §70의 소득 항목 세부(사업·근로·일부 기타소득, 비과세 제외)는 법조문 링크로 넘긴다. 자동 판정을 하지 않으므로 V-14·V-15는 종결이다.
- `MergeDateSection`(`app/calc/transfer-tax/steps/step4-sections/MergeDateSection.tsx`)을 **수정 없이** import한다. props: `{ form: Pick<..., "marriageDate"|"parentalCareMergeDate"|"isFirstTransferredInMerge">, onChange }`(정확히는 판정 메뉴 폼 타입이 이 3필드를 가지면 그대로 통과 — 컴포넌트가 `TransferFormData` 전체를 destructure하지 않고 이 3필드만 읽는다, 파일 내용 실측).
- 안내 카드의 법조문 링크는 `LawArticleModal legalBasis="소득세법 §88" label="§88 6호"` · `legalBasis="소득세법 시행령 §152의3" label="영 §152의3"`(`components/ui/law-article-modal.tsx`).

### 3.2 ② 보유 주택·권리 명세

```
┌ ② 보유 주택·권리 명세 ────────────────────────────────
│ HouseCountExemptionInputs 그대로 재사용 (hideGracePeriod=true)
│   ├── HousesListSection (내부: 주택 목록 테이블 + PresaleRightsSection —
│   │     gracePeriod·SellingHouseExclusionSection은 숨김, §3.2-C)
│   ├── SpecialHouseExclusionSection (조특법 감면주택 §89①3호 의제 제외)
│   └── 상속 2년내 피상속인 증여분 게이트 (ToggleCard, houses[].isInherited 존재 시만)
│
│ TemporaryTwoHouseSection 그대로 재사용 (§155①⑥⑦⑧⑯⑱ · §156의2⑤ 대체주택 · §155⑥ 문화유산)
│   — 렌더 게이트는 "명부 도출 주택 수 ≥ 2"로 대체(§3.2-A)
│
│ RightThreeYearExceptionSection · InheritedRightExceptionSection ·
│ MergedHouseholdRightSection 그대로 재사용 (§89② 배제의 3년 예외·상속 예외·합가 예외)
│
│ ExemptionProvisoSection 재사용 (§154① 단서 — 보유·거주요건 면제 6종)
│   — 판정 메뉴에도 필요: 없으면 판정이 거주요건을 잘못 미충족으로 낸다(추가 사유, 아래 참조)
└────────────────────────────────────────────────────
```

**§3.2-A 렌더 게이트 치환(설계 결정)**: 계산기 Step4는 `temporaryTwoHouseSectionVisible({ primaryAssetKind, householdHousingCount })`(`lib/calc/temporary-two-house-section-scope.ts`)로 게이트한다. 판정 메뉴에는 `householdHousingCount` 스칼라 필드 자체가 없다(G-1 해소 — 명부가 정본, D-3). ⇒ 판정 메뉴 전용 게이트 `derivedHouseCount(houses, presaleRights) >= 2`를 **새 순수 함수**로 만들어 같은 자리에 넣는다. 계산기 쪽 게이트 함수는 그대로 둔다(다른 화면이 다른 정본을 쓰는 것은 D-3이 이미 승인한 설계).

**§3.2-C `SellingHouseExclusionSection` 숨김(설계 결정 — 초안 D-3 해소)**: 이 섹션은 파일 머리 주석이 밝히듯
「양도 주택 3주택+ 전용 **중과배제** 특례 — 소령 §167의10」(`components/calc/transfer/SellingHouseExclusionSection.tsx:1-2`)이다.
비과세 판정과 무관하고 그 값은 `OneHouseFacts`에 들어가지도 않는다 ⇒ 판정 메뉴에 보이면 **입력해도 아무 데도 가지 않는 칸**이 된다.
`HousesListSection`에 `hideSellingHouseExclusion?: boolean` prop을 **하나** 추가해 판정 메뉴에서만 숨긴다(기존 `hideGracePeriod`와 같은 방식 — 계산기 동작 불변).

**§3.2-B ExemptionProvisoSection 포함 여부 — 계획서 표에 없던 것을 추가한 이유**: 계획서 §5.2 단계표는 ②에 "특례 사실(§155 각 항·§155의2·§155의3·§89② 예외)"만 열거하고 §154① 단서는 §5.0 "유지" 목록(계산기 잔류)에만 있다. 그러나 판정 메뉴가 §89①3호 요건(보유·거주 2년)을 정확히 판정하려면 거주요건 면제 사유(해외이주·수용·부득이한 사유 등)를 **판정 메뉴도 알아야 한다** — 그렇지 않으면 정당한 면제 대상자에게 「거주요건 미충족」을 잘못 낸다. `ExemptionProvisoSection`은 이미 `{ form: 6개 flat 필드, onChange }`(props 실측, `ExemptionProvisoSection.tsx:32-49`) 형태라 **계산기·판정 메뉴 양쪽에 중복 없이 재사용 가능**하다(같은 컴포넌트, 각 화면의 로컬 폼 상태에 바인딩). `mode="one_house"` 고정(판정 메뉴는 항상 완전한 1주택 판정이 목적이므로 `temporary_two_house` 준용 모드는 TemporaryTwoHouseSection 내부에서 별도로 다룬다 — TemporaryTwoHouseSection이 proviso를 내부에서 렌더하는지는 §14 확인 필요 항목).

**법조문 대응**: HousesListSection→§155②③(공동상속)·§89②(권리); TemporaryTwoHouseSection→§155①(일시적2주택)·§155⑥(문화유산)·§155⑦(농어촌)·§155⑧(비수도권 부득이)·§155⑯(공공기관 이전)·§155⑱(3년 초과 치유)·§156의2⑤(대체주택); Right/Inherited/MergedHousehold ExceptionSection→§156의2④⑥⑦⑧⑨·§156의3③④⑤⑥(§89② 예외 3종); ExemptionProvisoSection→§154① 단서 6종.

**§155의2·§155의3 신규 입력(P3 신설, 화면은 P4)**: 계획서 §5.6 필드 그대로 이 단계 안에 새 서브카드(색상 카드+번호 패턴, tone=amber "특례" 계열)로 추가한다 — `longTermMortgageHouse{contractDate, borrowerAgeAtContract, contractYears, maturityLumpSumRepayment, transferredBeforeMaturity, parentalCareMerge}`(DateInput+IntegerInput+ToggleCard 조합) · `winWinRentalHouse{winWinContractDate, increaseRatePct, priorLeaseMonths, winWinLeaseMonths}`(DateInput+DecimalInput). 계산기에는 **추가하지 않는다**(D-4) — ② 섹션에 "거주요건 면제 특례(장기저당담보·상생임대 등)는 판정 메뉴에서 확인하세요" 안내(ToneCard tone=sky)만 둔다.

### 3.3 ③ 양도 예정

```
┌ ③ 양도 예정 ──────────────────────────────────────────
│ 양도 대상 주택 선택        RadioCardGroup (② 명부 중 선택, 신규 위젯 — 목록 미리보기)
│ 양도 예정일               DateInput   testid=one-house-sale-date
│ 예상 양도가액             CurrencyInput
│ 조정대상지역 자동판별      기존 /api/address/regulated-area 패턴 재사용(Step4.tsx:194-245)
│ 거주기간                 ResidencePeriodSection 그대로 재사용
└────────────────────────────────────────────────────
```

- ③ 단계의 신규 위젯은 "양도 대상 주택 선택" 하나다(② 단계에는 §155의2·§155의3 카드 2개가 별도로 신설된다 — §3.2). ②에서 이미 입력한 명부 중 하나를 지정 — `RadioCardGroup`, value는 `HouseEntry.id` 또는 대표자산 placeholder). 나머지는 전부 재사용.
- `ResidencePeriodSection`(`components/calc/transfer/ResidencePeriodSection.tsx:23-36`) props: `{ residenceInputMode, residencePeriods, residencePeriodMonthsAsset, transferDate, onChange }` — 자산-수준이 아니라 flat 값이라 판정 메뉴 로컬 상태에 그대로 바인딩 가능(계산기의 `AssetForm` 종속 없음, 실측).

### 3.4 ④ 결과

```
┌ ④ 판정 결과 ──────────────────────────────────────────
│ 판정 배지  (전액 비과세 / 부분 비과세(고가주택 안분) / 과세 / 판정 보류)
│ 적용 특례 체크리스트 (legalBasis[] → LawRefBadges 줄)
│ 조건부·기한 카드 (pending[].description + deadline — ToneCard tone=amber, "YYYY-MM-DD까지 ~하면 비과세")
│ 판정 보류 카드 (undetermined[].reason — ToneCard tone=rose, "이 부분은 판정하지 않았습니다: …")
│   기한은 날짜만 표시(Q-4 — 잔여일/D-day 없음)
│ 근거 조문 (law-article-modal 배지 목록)
│ [이 결과로 세액 계산] — Button variant="modalLauncher" 아님(페이지 이동이므로 default 강조 버튼)
└────────────────────────────────────────────────────
```

- `pending[].deadline`은 **엔진이 낸 Date**를 그대로 포맷 표시한다 — UI가 날짜를 재계산하지 않는다(`feedback_aggregate_display_rederives_engine_value`).
- `undetermined`(판정 보류) 배지는 저장소 기존 3갈래 철학을 그대로 쓴다 — 억측 결론 금지.
- 「이 결과로 세액 계산」 클릭 시 §5의 단일 진입 헬퍼를 호출한다.

---

## 4. 재사용 섹션 결합도 표 (V-11 해소)

전수 실측 결과, 이관 대상 7개 섹션·컴포넌트 **전부가 `TransferFormData` 슈퍼셋 props 또는 완전 flat props**로 만들어져 있어 **수정 없이 재사용 가능**하다. store 훅을 직접 호출하는 섹션은 0건.

| 컴포넌트 | 경로 | Props 시그니처(실측) | 대응 조문 | 렌더 게이트(계산기 원본) |
|---|---|---|---|---|
| `HousesListSection` | `app/calc/transfer-tax/steps/step4-sections/HousesListSection.tsx:409-429` | `{ form: TransferFormData, onChange, hideGracePeriod? }` | §155②③·§89②(내부 PresaleRightsSection) | 상시(④ 안 또는 §3.2-A 대체) |
| `PresaleRightsSection` | `components/calc/transfer/PresaleRightsSection.tsx:20-27` | `{ rights: PresaleRightEntry[], onChange, showSpouseOwned? }` — **완전 독립**(TransferFormData 미종속) | §89②·§167의11 | HousesListSection 내부 상시 |
| `HouseCountExemptionInputs` | `app/calc/transfer-tax/steps/step4-sections/HouseCountExemptionInputs.tsx:38-47` | `{ form: TransferFormData, onChange, hideGracePeriod? }` | §155②③·§89②·조특법 §89①3호 의제 | 상시(HousesListSection + SpecialHouseExclusionSection + 상속2년게이트 묶음) |
| 상속 2년 게이트 | `HouseCountExemptionInputs.tsx:60-69`(별도 파일 아님) | `generalHouseGiftedFromDecedentWithin2yr: boolean`, `houses.some(isInherited)`일 때만 렌더 | §155② 단서 | 동상 |
| `TemporaryTwoHouseSection` | `app/calc/transfer-tax/steps/step4-sections/TemporaryTwoHouseSection.tsx`(529줄) | `{ form: TransferFormData, onChange, tempTwoHouseVerdict, relocationRegionVerdict, ruralLocation, proviso, primaryAcquisitionDate }`(Step4.tsx:672-681 호출부 실측 — **파생 useMemo 값 4개를 호출부가 계산해 넘긴다**, 컴포넌트 자체 결합 아님) | §155①⑥⑦⑧⑯⑱·§156의2⑤ | `temporaryTwoHouseSectionVisible(...)` — §3.2-A에서 치환 |
| `RightThreeYearExceptionSection` | `components/calc/transfer/RightThreeYearExceptionSection.tsx:39-42` | `{ form: TransferFormData, onChange }` | §156의2④·§156의3③·칙§75① | 상시(자체 내부 `rightThreeYearExceptionVisible` 게이트 보유) |
| `InheritedRightExceptionSection` | `components/calc/transfer/InheritedRightExceptionSection.tsx:24-27` | `{ form: TransferFormData, onChange }` | §156의2⑥⑦·§156의3④⑤⑮ | 상시(내부 `hasInheritedRight` 자체 게이트, 없으면 `null` 반환) |
| `MergedHouseholdRightSection` | `components/calc/transfer/MergedHouseholdRightSection.tsx:32-35` | `{ form: TransferFormData, onChange }` | §156의2⑧⑨(§156의3⑥ 준용) | 상시(주택수<2일 때 합가일 칸을 **직접 소유** — MergeDateSection과 상호배타) |
| `MergeDateSection` | `app/calc/transfer-tax/steps/step4-sections/MergeDateSection.tsx:10-16` | `{ form: TransferFormData, onChange }` — 내부는 `marriageDate`·`parentalCareMergeDate`·`isFirstTransferredInMerge` 3필드만 read | §155④⑤ | ① 세대 단계(주택수<2, §3.1) / ③(주택수≥2, MergedHouseholdRightSection과 배타) |
| `ExemptionProvisoSection` | `components/calc/transfer/ExemptionProvisoSection.tsx:32-49` | `{ provisoReason, provisoDepartureDate, provisoExpropriationDate, provisoBusinessApprovalDate, provisoPreContractNoHouse, mode, onChange }` — **완전 flat**(TransferFormData 미종속) | §154① 단서 | ②(계산기 one_house 모드) / §3.2-B(판정 메뉴 추가) |
| `ResidencePeriodSection` | `components/calc/transfer/ResidencePeriodSection.tsx:23-36` | `{ residenceInputMode, residencePeriods, residencePeriodMonthsAsset, transferDate, onChange }` — **완전 flat** | §95⑤·§159의4 표2 | ③(계산기 및 판정 메뉴 공용) |

**추가 실측(다른 세션 fork 조사 교차검증 후 확인)**: `generalHouseGiftedFromDecedentWithin2yr`(상속 2년 게이트)는 `HouseCountExemptionInputs.tsx:60-69`뿐 아니라 `InheritedRightExceptionSection.tsx:67-75`에서도 **같은 필드를 다른 문구로 다시 렌더**한다(`hasInheritedRight || hasInheritedHouseWithRight`일 때). 값 자체는 공용이라 동작은 깨지지 않지만, 본 설계의 ② 단계가 `HouseCountExemptionInputs`와 `InheritedRightExceptionSection`을 **함께** 배치하므로(§3.2) 상속주택+상속권리를 모두 가진 세대는 같은 토글을 두 번 보게 된다. **기존 계산기 Step4도 이미 이 상태**(두 컴포넌트를 함께 렌더, `Step4.tsx:572·760` 실측)이므로 이번 설계가 새로 만든 결함은 아니다 — Do 단계에서 정리할지(둘 중 한쪽만 렌더하도록 조건 분기 추가) 원안 그대로 승계할지는 계산기 쪽도 함께 고쳐야 하는 별도 결함으로 분리한다(D-8, §14).

부수 발견(fork 조사 교차검증): `TemporaryTwoHouseSection.tsx:495-503`의 `replResidenceMonths`(대체주택 거주개월수)는 `DecimalInput`이 아니라 **native `<input type="text" inputMode="numeric">`**다(CLAUDE.md 소수점 입력 규칙 위반 상태 — 기존 결함, 이번 재사용으로 상속되나 신규 도입 아님).

**결론(V-11 핵심)**: 판정 메뉴의 폼 상태 타입을 `Pick<TransferFormData, "houses" | "presaleRights" | "specialHouseExclusions" | "generalHouseGiftedFromDecedentWithin2yr" | ...(TemporaryTwoHouseSection·3섹션·MergeDateSection·ExemptionProvisoSection이 참조하는 전 필드) | "marriageDate" | "parentalCareMergeDate" | "isFirstTransferredInMerge" | "provisoReason" | ...>` 로 정의하면 **컴포넌트 코드 변경 없이 전 재사용**이 성립한다. 누락되는 필드가 있으면 TypeScript가 즉시 잡는다(구조적 타이핑) — 단, `TemporaryTwoHouseSection` 호출부의 4개 파생 useMemo(tempTwoHouseVerdict 등)는 판정 메뉴 쪽에서도 **동일하게 계산해 넘겨야** 한다(계획서 재확인 필요 항목 아님 — §14에 실행 항목으로 남긴다).

---

## 5. 판정 → 계산기 전달 — 단일 진입 헬퍼

`lib/calc/transfer-resume-entry.ts`(139줄, 실측)는 이미 "이력 편집 재진입"에서 같은 문제(카드·드로어 두 곳 복제 → 두 번 갈라짐)를 겪고 단일 헬퍼로 정리한 전례다. 핵심 패턴(실측 인용):

```ts
// resumeTransferRecord() 패턴 — router.push 전에 zustand store에 직접 쓴다.
// SPA 클라이언트 네비게이션이므로 sessionStorage 왕복이 불필요하다(증여세 prefill과 다른 이유:
// 증여세는 서로 다른 계산기 간 이동이라 페이지 전체 리마운트 가정 — deemed-gift 선례는
// "다른 세목 간 이동"에만 해당하고 양도세 자기 계열 이동에는 이미 더 나은 패턴이 있다).
const { updateFormData, setStep } = useCalcWizardStore.getState();
const migrated = { ...form, assets: form.assets.map((a) => migrateAsset({ ...a })) };
updateFormData(migrated);
setStep(0);
router.push(TRANSFER_ROUTE);
```

**신규 함수 2개**(같은 파일에 추가, 복제 아닌 확장) — 🔴 초안은 한 함수가 `router.push`까지 했다. 원형 `resumeTransferRecord`가
`updateFormData` 뒤에 `router.push(TRANSFER_ROUTE)`를 하므로(`transfer-resume-entry.ts:135-137`) 그대로 복제하면, 계산기 안의
「판정 불러오기」와 **다건 편집 화면(`MultiTransferSteps.tsx:203`)에서 호출할 때 단건 화면으로 튕겨 나간다.** 그래서 둘로 나눈다.

- `applyOneHouseFactsToTransferForm(facts: OneHouseFacts, source): void` — **store에 쓰기만** 한다(이동 없음). 「판정 불러오기」 모달(단건·다건 공통)은 이것만 호출한다.
- `openTransferWithOneHouseFacts(facts, source, router): void` — 위 함수를 호출한 뒤 `router.push(TRANSFER_ROUTE)`. 판정 메뉴 ④의 「이 결과로 세액 계산」만 호출한다.

- `OneHouseFacts`의 `houses`·`presaleRights`·특례 사실 필드를 `TransferFormData`의 **동일 이름 필드**로 매핑해 `updateFormData()` 호출(§3에서 필드명을 이미 동일하게 맞췄으므로 매핑 함수는 거의 항등 함수).
- `sourceJudgmentId`·판정일·사실 해시(`computeFactsHash(facts)` — 신규 순수 함수, 필드 값 JSON 안정 직렬화 후 해시)를 `TransferFormData.oneHouseJudgmentSource?: { judgmentId, judgedAt, factsHash }`로 저장.
- 호출부 2곳: ④ 결과 화면 → `openTransferWithOneHouseFacts`, 계산기 「판정 불러오기」 모달 → `applyOneHouseFactsToTransferForm`. 매핑 로직은 **앞의 함수 하나에만** 있다 — 복제 금지.
- ⚠️ 다건 편집 중에 판정 메뉴 ④에서 「이 결과로 세액 계산」으로 들어오는 경로는 없다(판정 메뉴는 단건 계산기로 연다). 다건은 편집 화면의 「판정 불러오기」만 쓴다.

**「판정 불러오기」 모달**: `UnlistedStockHistoryModal.tsx`(순수 필터 함수 + `Dialog` + `sourceCalculationId`) 패턴을 그대로 이식한 `OneHouseJudgmentLookupModal` 신설. `calculationRepository.list({ taxType: "one_house_exemption" })` → 순수 함수 `filterOneHouseJudgmentCandidates()`(신규, `lib/calc/one-house-judgment-lookup.ts`) → 선택 시 `applyOneHouseFactsToTransferForm()` 호출 후 모달 닫힘(`selectionMode: "single"`, **페이지 이동 없음**).

---

## 6. 계산기 쪽 변경 (D-4·P5·P6)

- 「판정 불러오기」 버튼: Step4 ①「세대·주택 현황」섹션 상단, `Button variant="modalLauncher"`(연녹색, "자동" 배지 톤) — 기존 모달 런처 규칙 그대로.
- 넘겨받은 사실 표시: `oneHouseJudgmentSource`가 있으면 ①~②를 **읽기 전용 요약 카드**(ToneCard tone=violet)로 대체 — "판정 메뉴에서 불러온 사실: 주택 N채·특례 M건. 수정은 판정 메뉴에서" + 출처 한 줄(§7). 명부·분양권(`houses`·`presaleRights`)은 계획서 §0 제약(중과 유일 입력 경로)에 따라 **여전히 편집 가능** — 편집 시 출처 배지가 「판정 이후 명부 수정됨」으로 바뀐다(`useMemo`로 `computeFactsHash(현재 값) !== oneHouseJudgmentSource.factsHash` 비교, store 미러링 없음).
- 원본 판정 record가 나중에 갱신되면(사용자가 판정 메뉴로 돌아가 같은 record를 다시 저장) 해시가 달라진다 — 계산기 재진입 시 `calculationRepository.get(sourceJudgmentId)`로 해시를 재조회해 다르면 「원본 판정이 바뀌었습니다」 배지(rose)를 띄운다.
- 주택 수 ≥ 2 & 넘겨받은 사실 없음: `<ToneCard tone="amber">` "2주택 이상 특례(일시적 2주택·합가·상속·농어촌 등)는 판정 메뉴에서 확인한 뒤 불러오세요" + 「판정 메뉴로 이동」 링크(HomeButton 계열 아님 — 일반 텍스트 링크). 세액은 **특례 없음 과세**로 계산(OH-20, 현행과 동일 — 신규 차단 아님).
- ② 섹션에 "거주요건 면제 특례(§155의2 장기저당담보·§155의3 상생임대 등)는 판정 메뉴에서 확인하세요" 안내(ToneCard tone=sky) — §3.2 신규 특례를 계산기에 추가하지 않는 대신.
- P6 이관 후 기존 이력 보존(OH-21): 저장 record 로드 시 `migrateAsset`과 같은 층위에서 `promoteLegacyOneHouseInputsToFacts(record)`(신규, `calc-wizard-migration.ts`에 추가) 실행 — ③·권리 섹션 값이 있으면 `oneHouseJudgmentSource` 없이도 그 값을 그대로 유지(이관 후에도 계산기가 §5.0 "이관" 목록 UI를 완전히 제거하지 않고 **읽기 전용 요약 + "판정 메뉴에서 수정"** 형태로 남긴다는 뜻 — 완전 삭제 시 재계산 세액이 바뀐다).

---

## 7. 결과뷰 4종 — 출처 한 줄 (§5.9 ①②③)

4종: `TransferTaxResultView.tsx` / `MultiTransferTaxResultView.tsx` / `MixedUseResultCard.tsx`(`components/calc/results/mixed-use/` — 초안 경로 오기 정정) / `BundledAllocationCard.tsx`. 설계:

1. **컴포넌트 추출**: `components/calc/results/shared/OneHouseJudgmentSourceLine.tsx`(신규) — props `{ source: TransferFormData["oneHouseJudgmentSource"] | undefined, currentFactsHash: string | undefined }`. 3가지 문구만 렌더: 없으면 `null`, 있고 해시 일치면 "판정 메뉴 결과 기준(판정일 YYYY-MM-DD)", 해시 불일치(명부만 수정)면 "판정 이후 명부 수정됨", 원본 record 재조회 결과가 다르면 "원본 판정이 바뀌었습니다"(우선순위: 원본변경 > 명부수정 > 정상).
2. **공용 술어**: `oneHouseJudgmentSourceVisible(result)` — 4종 각 결과뷰가 이미 가진 "비과세/특례 적용" 표시 블록 근처에 조건부 삽입. `availablePrintIds`(인쇄 대상 leaf id 목록, `feedback_print_leaf_add_unit_test_sync` 주의)에도 `one-house-judgment-source` id를 등록해야 인쇄 시 조용히 빠지지 않는다.
3. **E2E는 경로별로**: 단건·다건·겸용 3개 spec에서 "넘겨받은 사실로 계산 → 출처 한 줄 노출"을 확인하고, **일반건물 일괄(`BundledAllocationCard`)** 은 비주택 경로라(`BundledAllocationCard.tsx:66` `isExempt: false` 고정) 출처 한 줄이 **렌더되지 않음**을 음성 단언한다 — 4종을 모두 판단했다는 기록이다(`feedback_transfer_result_view_is_not_one`). 비주택 일괄 경로에 1세대1주택 사실이 실제로 들어올 수 없는지는 **확인 필요**(§14 D-9).

---

## 8. V-12 다건 계산기 — 완전 해소 (실측)

**결론: 다건 계산기는 단건 Step4를 그대로 재사용하므로 판정 메뉴 통합에 별도 작업이 필요 없다.**

- `lib/stores/multi-transfer-tax-store.ts:15`: `interface MultiTransferProperty { ...; form: TransferFormData }` — **각 자산 항목이 단건과 완전히 동일한 `TransferFormData`를 통째로 보유**한다. `isOneHousehold`·`householdHousingCount`·`houses`·`presaleRights` 전부 구조적으로 존재.
- `grep -rn "isOneHousehold|householdHousingCount" lib/stores/multi-transfer-tax-store.ts app/calc/transfer-tax/multi` → **0건** — 다건 store·다건 전용 컴포넌트에는 이 필드를 다루는 코드가 없다. 이유는 아래.
- `app/calc/transfer-tax/multi/MultiTransferSteps.tsx:203`(`StepEdit`) 본문: `{/* 기존 단건 마법사 재사용 */} <TransferTaxCalculator />` — 자산 편집 화면이 **단건 계산기 컴포넌트를 그대로 마운트**한다.
- `app/calc/transfer-tax/multi/MultiTransferTaxCalculator.tsx:78-241`: 자산 선택 시 `syncToWizardStore`가 `updateFormData(propertyForm)`으로 `useCalcWizardStore`(단건 store, 싱글턴)에 해당 자산의 `form`을 밀어 넣고, 화면을 떠날 때 `useCalcWizardStore.getState().formData`를 읽어 `updateProperty(activePropertyIndex, { form: wizardForm })`으로 다건 store에 반영한다(양방향 브리지, :188-247 실측).
- `TransferTaxItemInput`(엔진 입력, `lib/tax-engine/types/transfer-aggregate.types.ts:45`)은 `Omit<TransferTaxInput, "annualBasicDeductionUsed"|"skipBasicDeduction"|"priorReductionUsage">`다 — **엔진 레벨에서도 자산별 1세대1주택 판정이 이미 지원된다**(누락 없음).

**결론에 따른 설계**: §5의 `applyOneHouseFactsToTransferForm`(이동 없음)이 `useCalcWizardStore`에 값을 쓰면, 다건 편집 화면에서도 **자동으로 동작한다** — 단 **이동하는 함수를 부르면 깨진다**(§5 분리 이유) — 사용자가 다건 마법사에서 특정 자산을 편집 중일 때(`StepEdit`) Step4가 이미 마운트돼 있으므로 §6의 「판정 불러오기」 버튼이 그대로 노출되고, 저장(`onSaveAndBack`)이 자동으로 `properties[i].form`에 반영한다. **다건 전용 코드는 0줄**.

---

## 9. V-13 — 자산-수준 위젯의 판정 사실 vs 세액 산식 입력 분리 (실측)

### 9.1 `RentalHousingExceptionSection`(§155⑳, Step1 자산 카드 내부)

| 필드/영역 | 성격 | 근거 |
|---|---|---|
| `applyException`(토글) · `rentalUnits[]`의 등록일 2종·`rentalCategory`·`rentalAcquisitionType`·지역·아파트 여부·최소 2호 충족·임대료 5%·등록유지 자기확인 | **판정 사실** — §155⑳ 요건 충족 여부(유형 마목 판정·의무임대기간·기준시가 상한) | `RentalHousingExceptionSection.tsx:1-97`(design 문서 `rental-housing-155-20-active-ui.ui.design.md` §1) |
| 기준시가(임대개시일)·실제 임대기간 | **판정 사실이자 계산 입력 겸용** — 상한 대비 충족 여부 판정 + PHRP 안분 계산의 분모/분자로도 쓰임(§161①) | 동 design 문서 §1 하단 |
| 시나리오 B(전환 후 양도) 전용 — `HousingStdPriceLookupField`(환산 기준시가)·`PeriodRangeEditor`(안분 기간) | **세액 산식 입력** — §161① 안분 계산 전용, 판정과 무관 | `RentalHousingExceptionSection.tsx:15-24`(import 목록에 계산 전용 컴포넌트만 별도 존재) |

**분할안**: 판정 사실(위 1행)은 판정 메뉴 ②에 새 서브카드로 이식 가능(P3 §155⑳ 판정을 엔진이 겸하게 되면). 계산 전용(3행)은 계산기 자산 카드에 **반드시 잔류**(자산-수준 계산이라 판정 메뉴에는 없는 개념 — 판정 메뉴는 "이 세대가 특례를 받을 수 있는가"만 답하고 "안분 계산"은 하지 않는다). 단, **P4~P6 범위에서는 이 섹션 전체를 계산기에 유지**한다(계획서 §5.0 "유지" 목록에 §155⑳은 명시되지 않았으나 §5.0 마지막 항 "경계 미확정 → V-13, 설계 문서에서 확정"에 따른 본 문서의 결론) — 이유: §155⑳은 계획서 원안 11종 중 이미 완전 구현된 특례이고(계획서 §3.2 ⑩), 판정 메뉴 신설의 목적(G-2 §155의2·§155의3 신규 판정)과 무관하다. 판정 메뉴로 옮기면 계산기가 §161① 안분 계산 전에 §155⑳ 판정 결과를 다시 받아와야 하는 왕복이 생겨 **오히려 복잡도가 늘어난다**. ⇒ **§155⑳은 이번 범위에서 이관하지 않는다**(명시적 축소 결정).

### 9.2 `RedevelopmentRightExemptionSection`(§89①4호, 1세대1입주권)

| 필드 | 성격 | 근거 |
|---|---|---|
| `redevExemptionEligibleAtApproval`("yes"/"no"/"") | **판정 사실** — §89①4호 가목 요건 자기선언 | `RedevelopmentRightExemptionSection.tsx:71` |
| `redevPriorHouseHoldingMonths`·`redevPriorHouseResidenceMonths` | **판정 사실**(경고 임계 24개월) — 인가일 현재 종전주택 보유·거주기간 요건 | `:73-88` |
| "나목 — 세대 보유 1주택 취득일"(DateInput, 코드 미확인 라인이나 헤더 주석에 명시) | **판정 사실** — §89①4호나목 "1주택 취득일부터 3년 이내" | `:8`(헤더 주석) |
| `HIGH_VALUE_THRESHOLD = 1_200_000_000`(로컬 상수) | **세액 산식 입력 겸 판정 분기** — 12억 초과 시 §166 3분할 안분 필요 여부 | `:52` — **G-5(고가주택 기준 시점 분기 부재)와 동일 하드코딩 패턴이 이 UI 파일에도 있다**(계획서 G-5 목록의 5곳에 없던 **6번째 지점** — 엔진 설계 문서도 같은 발견 — P1 작업 시 함께 시점 함수로 전환 대상, 엔진 시니어에게 전달 필요) |

**분할안**: §89①4호 판정 사실(위 1~3행)은 판정 메뉴 ②로 이식 가능(입주권 자산 전용 분기 — 판정 메뉴가 "양도 대상"을 주택이 아니라 입주권으로도 받을 수 있어야 함, ③ 단계에 자산 종류 선택 추가 필요). §166 3분할 계산(4행 관련 실제 안분 로직)은 계산기 전용. 단, **9.1과 같은 이유로 이번 범위(P4)에서는 이관하지 않는다** — 계획서 로드맵 P3가 "§155의2·§155의3"만 명시하고 §89①4호 재구조화는 범위 밖이다.

**✅ 계획서 Q-7 결정(2026-09-18): P4에서 함께 옮긴다 — 아래 「초안 결론」은 폐기.**
확정 설계:
- **판정 메뉴 폼에 양도 대상 자산을 `AssetForm` 호환 객체로 둔다**(`sellingAsset`) — 두 위젯의 props가 `asset: AssetForm`에 묶여 있다(실측:
  `RedevelopmentRightExemptionSection.tsx:37-39` · `RentalHousingExceptionSection.tsx:30-40`).
- ③ 양도 예정 단계에 **양도 자산 종류**(주택 / 조합원입주권) `RadioCardGroup`을 추가한다. 조합원입주권이면 `RedevelopmentRightExemptionSection`을
  그대로 렌더한다(판정 사실 4필드 — `:156·168·179·191`, 12억 초과 안내는 P1 시점 함수로 교체).
- ② 단계에 §155⑳ 서브카드 — `RentalHousingExceptionSection`에 **표시 모드 prop `mode?: "full" | "facts" | "calc"`** 를 추가한다.
  판정 메뉴는 `facts`(토글·시나리오·임대주택 목록), 계산기는 P6 이후 `calc`(B시나리오 §161 안분 입력 `HousingStdPriceLookupField`·`PeriodRangeEditor`)
  + 넘겨받은 사실 읽기 전용 요약. 기본값 `full`로 두어 **P6 전까지 계산기 동작 불변**. 한 컴포넌트를 두 화면이 쓴다 — 복제 금지.
- 440줄 파일이라 모드 분기 추가 후에도 800줄 여유가 있다. 다만 모드별 렌더 분기가 커지면 facts/calc 하위 컴포넌트로 분리한다.

**(참고로 남기는) 이전 쟁점**: 엔진 설계는 「판정 사실은 `OneHouseFacts`로 이관」, 아래 초안은 반대 결론이었다. 엔진 설계 문서는 같은 V-13에 대해 「판정 사실은 `OneHouseFacts`로 이관」이라는
**반대 결론**을 냈다. 아래 초안 결론의 근거 중 「판정 메뉴의 목적은 §155의2·§155의3 신규 판정」은 **계획서와 다르다** — 판정 메뉴의 목적은
1세대1주택 비과세 판정 **전체**다(계획서 D-1). 이관하지 않는다면 판정 메뉴는 명부에 장기임대주택(§155⑳)이나 입주권(§89①4호)이 걸린
세대를 **「과세」로 단정하지 말고 반드시 `undetermined`(「세액 계산기에서 판정」)로 내야 한다** — 그렇지 않으면 억측 결론이다.

**~~초안 결론(V-13)~~ — 폐기(Q-7)**: 두 섹션 모두 **판정 사실/계산 입력이 실제로 분리 가능**하지만, 이번 판정 메뉴 신설(P4) 범위에서는 **둘 다 계산기에 그대로 둔다** — 계획서가 명시적으로 요구한 것은 §155의2·§155의3(신규 특례)뿐이고, 이미 구현된 §155⑳·§89①4호를 재구조화하는 것은 별도 작업으로 분리한다(YAGNI — Simplicity First 원칙). RedevelopmentRightExemptionSection의 `HIGH_VALUE_THRESHOLD` 하드코딩은 발견 사항으로 엔진 설계 문서·`transfer-tax-senior`에 전달한다(§14).

---

## 10. 14 동기화 지점 매핑 (계획서 §7 구체화)

| # | 지점 | **A. 판정 메뉴** | **B. 계산기** |
|---|---|---|---|
| ① 폼 상태 | 신설 `OneHouseJudgmentFormData`(`lib/stores/one-house-judgment-store.ts`) — `Pick<TransferFormData,...>` 슈퍼셋 + `saleTargetHouseId`·`saleExpectedDate`·`saleExpectedPrice`·`longTermMortgageHouse?`·`winWinRentalHouse?` | `TransferFormData`에 `oneHouseJudgmentSource?: { judgmentId, judgedAt, factsHash }` 추가 |
| ② initial | 신설 store `defaultFormData` | `lib/stores/calc-wizard-store.ts:52-140`(defaultFormData) — 새 필드 `undefined` 초기값 |
| ③ normalize | 신설 `migrateOneHouseJudgmentForm` | `calc-wizard-migration.ts`에 `promoteLegacyOneHouseInputsToFacts`(§6) 추가 |
| ④ API 변환 | 신설 `lib/calc/one-house-exemption-api.ts` | `lib/calc/transfer-tax-api.ts` — 넘겨받은 사실은 이미 동일 필드명이라 **변환 없이 pass-through** |
| ⑤ UI 위젯 | `app/calc/one-house-exemption/`(§3, 기존 섹션 재사용) | Step4 「판정 불러오기」 버튼 + 읽기 전용 요약(§6) |
| ⑥ 사이드바 | 신설 `computeOneHouseJudgmentSummary()`(`useMemo` 필수) | 변경 없음(기존 `computeTransferSummary` 그대로) |
| ⑦ 결과 | 판정 결과 화면(§3.4) | 결과뷰 4종 출처 한 줄(§7) |
| ⑧ validation | 신설 `lib/calc/one-house-exemption-validate.ts`(재사용 섹션은 기존 `transfer-tax-validate.ts`의 해당 블록을 **함수로 추출해 공유** — 복제 금지) | 넘겨받은 사실이 있으면 ③·권리 섹션 필드는 validate에서 **읽기 전용이므로 애초에 사용자가 못 바꾼다** — 차단 로직 자체가 불필요(모순 원천 차단) |
| ⑨⑩ Zod enum | 신설 route Zod 스키마 | `app/api/calc/transfer/route.ts` 기존 스키마 — 신규 필드는 optional 추가 |
| ⑪ 자산-수준 fallback | 해당 없음(판정 메뉴는 자산-수준 개념 없음 — 명부가 대신함) | 동상 |
| ⑫ Zod 입력 객체 | 신설 route — **TS 미감지, grep 자가점검 필수** | `oneHouseJudgmentSource` 필드 — **TS 미감지** |
| ⑬ body spread | 신설 `one-house-exemption-api.ts` — **TS 미감지** | `transfer-tax-api.ts` body spread — **TS 미감지** |
| ⑭ Route 매핑 | `judgeOneHouseExemption` 호출부 — Date 변환(`date-coerce`) | 계산기 route는 변경 없음(넘겨받은 사실은 폼 단계에서 이미 문자열 Date로 정규화됨) |

⚠️ **⑫⑬⑭ 자가점검**: `grep -rn "longTermMortgageHouse\|winWinRentalHouse" app/api/calc/one-house-exemption/route.ts lib/calc/one-house-exemption-api.ts`로 두 표면 모두 값이 실제로 도달하는지 Do 단계 완료 전 확인.

---

## 11. E2E 계획

- **이관 매핑**: 계획서 §3.4의 기존 spec(§155① `transfer-155-temp-two-house-auto-judge.spec.ts` 등 약 15개)은 **P6 시점에** 판정 메뉴 경로로 옮겨 쓴다 — Step4의 해당 섹션을 직접 조작하던 부분을 "판정 메뉴에서 입력 → 계산기로 전달 → 결과 확인"으로 재작성. 삭제하지 않는다(`e2e/known-failures.ts` 0건 유지).
- **신규 spec**:
  1. `one-house-judgment-menu-flow.spec.ts` — ①~④ 전체 플로우, ToggleCard는 `setChecked`(`feedback_e2e_togglecard_setchecked`).
  2. `one-house-judgment-to-transfer-prefill.spec.ts` — 「이 결과로 세액 계산」 → Step4 읽기 전용 요약 → 출처 한 줄 확인.
  3. `one-house-judgment-lookup-modal.spec.ts` — 계산기 「판정 불러오기」 → 후보 필터 → 선택 → 폼 반영.
  4. `one-house-simplified-input-unchanged.spec.ts` — 판정 미경유 계산기 사용자가 현행과 동일 플로우로 계산 가능함을 회귀 확인(OH-19·OH-20).
  5. `one-house-judgment-multi-transfer.spec.ts` — 다건 `StepEdit` 진입 중 「판정 불러오기」 동작 확인(§8 결론 검증).
- `e2e/_helpers/tax-flow.ts` 공용 헬퍼 사용. 인쇄 spec은 「전체 선택」 먼저. 컴포넌트 렌더 테스트는 `.test.tsx`.

---

## 12. 800줄 정책 영향

| 파일 | 현재 줄 수 | 이번 설계의 영향 |
|---|---|---|
| `Step4.tsx` | **786줄**(실측, `wc -l`) | 「판정 불러오기」 버튼 1개 + 읽기 전용 요약 조건부 블록 추가 시 800 초과 가능성 높음 — 착수 시 즉시 `step4-sections/ImportedFactsSummarySection.tsx`로 분리해 진입(선제 분리, CLAUDE.md "기회주의적 분리") |
| `TemporaryTwoHouseSection.tsx` | 529줄 | 재사용만(수정 없음) — 영향 없음 |
| 신규 `app/calc/one-house-exemption/steps/Step*.tsx` | 0 → 신설 | 4단계 각각 별도 파일로 시작(4파일, 처음부터 분리 — 양도세 Step1/4/5/6 선례) |
| `HistoryClient.tsx` | 미측정 | 세목 분기 5곳 추가 — Do 단계에서 줄 수 확인, 초과 시 세목별 요약 분기를 `history-summary/{tax}.ts`로 이미 분리돼 있는지 확인 후 필요 시 추가 분리 |

---

## 13. UI 규칙 자가점검 (완료 보고 전 필수)

- [ ] `ToggleCard`/`RadioCardGroup` 강제 — 신규 위젯은 「양도 대상 주택 선택」(RadioCardGroup) + §155의2·§155의3 카드(ToggleCard·DateInput·IntegerInput·DecimalInput), native 미사용
- [ ] OFF 상태 tone 배경 유지 — 재사용 컴포넌트는 이미 준수, 신규 위젯도 tone 지정
- [ ] `<ToneCard>` 단일 소스 — 안내 카드 전부 `ToneCard` 사용, 동적 `bg-${tone}` 금지
- [ ] 라벨 정본 클래스 — `text-[Npx]` 신규 작성 없음
- [ ] 모달 런처 — 「판정 불러오기」만 `Button variant="modalLauncher"`, 「이 결과로 세액 계산」은 페이지 이동이라 제외 대상(런처 규칙 예외 항목과 일치 — 결과 화면 액션 버튼)
- [ ] 선택지 anchor value 기준 — 신규 RadioCardGroup(양도 대상 선택)의 E2E는 `radioValues()` 사용
- [ ] placeholder 숫자 예시 금지 — §155의2·§155의3 카드의 기간·비율 입력은 형식 설명을 FieldCard `hint`로(예시 숫자 placeholder 금지)
- [ ] 결과 산식 한국어 풀어쓰기 — ④ 결과 화면은 산식이 아니라 판정 배지·체크리스트이므로 해당 없음(계산기 쪽 세액 산식은 기존 규칙 그대로 유지)
- [ ] 금액 칸 정렬 — ③ 예상 양도가액 등 금액 입력은 `CurrencyInput`(자체 정렬 처리)
- [ ] 포커스 전체선택 — Provider 자동 적용, 개별 처리 없음

---

## 14. 확인 필요 · 미검증 목록

| ID | 내용 | 확인 방법 |
|---|---|---|
| D-1 | `TemporaryTwoHouseSection.tsx`(529줄) 내부에 `ExemptionProvisoSection`(mode="temporary_two_house")이 이미 렌더되는지 — Step4.tsx 주석(":650")은 "일시적 2주택은 §155 특례 섹션③ 아래로 배치"라 적으나 Step4.tsx 본문에서 별도 호출부를 찾지 못했다(TemporaryTwoHouseSection 내부일 가능성) | Do 단계 착수 전 `TemporaryTwoHouseSection.tsx` 전체 라인 실독 |
| D-2 | `HistoryClient.tsx`의 정확한 세목 분기 삽입 지점(요약 렌더 `:78-150`·재진입 라우팅 `:274` 각각의 정확한 코드 형태) | Do 단계에서 파일 전체 재확인 |
| ~~D-3 (초안)~~ | `SellingHouseExclusionSection`(사원주택·어린이집, `sellingHouseExclusionVisible`)이 §89①3호 비과세 축인지 §167의3 중과 축인지 — `HousesListSection` 내부에 상시 포함되므로 재사용 시 자동으로 함께 노출됨. 축이 중과 전용이면 판정 메뉴에 불필요한 위젯이 딸려오는 것 | `SellingHouseExclusionSection.tsx`·관련 엔진 파일 실독, 법령 대응 확인 |
| D-4 | `RedevelopmentRightExemptionSection.tsx:52`의 `HIGH_VALUE_THRESHOLD = 1_200_000_000` 하드코딩 — 계획서 G-5가 열거한 5곳 목록에 없던 UI 레이어의 6번째 지점(엔진 설계 문서가 `:52`로 확인·반영). 세액 영향은 미확인(계산기 표시용 안내 배지에만 쓰이는지, 실제 안분 분기에도 쓰이는지) | `transfer-tax-senior`에 전달, P1 작업 시 함께 점검 |
| D-5 | 계획서 V-14·V-15(§152의3 3호 소득 기준·미성년자 예외)는 자동 판정을 하지 않기로 결정하며 **UI 관점에서는 소멸**했다. 엔진 설계 문서에서도 동일하게 소멸 처리되는지 교차 확인 필요(엔진이 `OneHouseFacts.household`를 단순 boolean+날짜로 정의하는지) | `one-house-exemption-automation.engine.design.md`와 대조 |
| D-6(구 Q-6) | **소멸** — 1세대 판정이 자동 판정이 아니므로 "수동 수정을 다른 항목에도 확장할지" 질문 자체가 성립하지 않는다 | — |
| D-7 | 판정 메뉴 폼 상태가 `Pick<TransferFormData,...>`로 충분한지, 아니면 `saleTargetHouseId` 등 신규 개념 때문에 완전 별도 타입이 나은지 — 본 문서는 전자를 가정했으나 엔진 설계의 `OneHouseFacts` 정확한 필드 shape이 나오면 재검토 | 엔진 설계 문서 확정 후 |
| D-3 | ✅ **해소** — 중과 축(영 §167의10, 파일 머리 주석)이다. 판정 메뉴에서 숨긴다(§3.2-C) | — |
| D-9 | 일반건물 일괄(bundled) 경로에 1세대1주택 사실이 들어올 수 있는지 — 출처 한 줄을 그 뷰에서 음성 단언으로 처리하는 근거 | `BundledAllocationCard`·bundled route의 `isOneHousehold` 사용처 실측 |
| D-8 | `generalHouseGiftedFromDecedentWithin2yr` 토글이 `HouseCountExemptionInputs`·`InheritedRightExceptionSection` 두 곳에서 중복 렌더(§4 추가 실측) — 계산기에도 이미 있는 기존 결함이라 이번 판정 메뉴 신설과 별개로 계산기 쪽도 함께 고쳐야 정리된다 | 별도 결함 티켓으로 분리, `transfer-tax-ui-senior`에 전달 |

---

## 엔진 설계와 맞출 필드 목록 (요약 — 완료 보고 ④ 대응)

**UI가 입력받는 `OneHouseFacts` 필드**(엔진 설계 문서와 통일 — 폼 필드명은 `TransferFormData` 그대로, 엔진 필드명은 어댑터 `one-house-exemption-api.ts`가 매핑): `propertyType` · `isUnregistered` · `household.isOneHousehold`(boolean, 자기선언) · `household.marriageDate` · `household.parentalCareMergeDate` · `household.isFirstTransferredInMerge` · `houses: HouseEntry[]`(기존 16필드 그대로) · `presaleRights: PresaleRightEntry[]` · `specialHouseExclusions` · `generalHouseGiftedFromDecedentWithin2yr` · TemporaryTwoHouseSection 대응 전 필드(`temporaryTwoHouseSpecial`·`newHouseAcquisitionDate`·`publicInstitutionRelocation`계열·`disposalDelayReason`·`unavoidableOutsideCapitalSpecial`계열·`ruralHouseSpecial`계열·`replacementHouseSpecial`계열·`culturalHeritageHouseSpecial`) · 3섹션 대응 전 필드(`rightThreeYearExceptionKind`계열·`mergedHouseholdFirstHouseKind`계열·`inheritedRightChoiceWhenBothHeld`·`generalHouseHeldAtInheritance` — 입력 위치 `InheritedRightExceptionSection`, 통합 대조에서 누락 보완) · `provisoReason`계열 6필드 · §155의2 신규(`longTermMortgageHouse`) · §155의3 신규(`winWinRentalHouse`) · 양도 대상(`saleTargetHouseId`)·양도예정일·예상양도가.

**화면이 읽는 `OneHouseJudgment` 결과 필드**(엔진 설계 문서 확정본과 통일): `isExempt`·`isPartialExempt`·`exemptReason`·`houseCount{total,countedForExemption,excluded[]}`·`appliedExceptions[]`·`residenceExemptions[]`·`highValueThreshold`·`article89Clause2`·`pending[]{id,description,deadline: Date,legalBasis}`·`undetermined[]{id,reason}`·`legalBasis[]`·`warnings[]`. 판정 메뉴 화면은 `deemedForTable2`·`surchargeDeemedBasis`를 **표시하지 않는다**(계산기 소비 축 — 엔진 설계 「§5.5 네 축」).
