# UI 설계 — §155②③ 상속주택 순위·공동상속 1세대1주택 비과세 자동판정 (Tier 2-A2)

- 상위 계획: [`transfer-155-2-4-5-exemption-gap.plan.md`](./transfer-155-2-4-5-exemption-gap.plan.md) §4 Tier 2-A2 · §5-A 케이스 매트릭스.
- 선행 완료: Tier 0(UI 문구 정합) · Tier 1(합가 §155④⑤) · **Tier 2-A1(피상속인 1주택 — 상속주택 자동 제외, 머지완료 `afc439f7`)**.
- 본 문서 범위: Tier 2-A1이 이미 배선한 `isInherited`/`inheritedDate`(기존 필드, 재사용)를 확장해 **피상속인 2주택↑ 순위(§155②1~4호)**·**공동상속(§155③)**·**동거봉양 상속 예외**를 자동판정하기 위한 UI 신규 입력 명세. 엔진 판정 로직 자체(순위 비교·제외 카운트 산출)는 엔진 시니어 설계 대상 — 본 문서는 입력·표시만 명세.
- **엔진 설계 문서 부재 확인**: 2026-07-19 기준 별도 `.engine.design.md` 미작성(검색 결과 0건). 아래 필드명·조건부 노출 로직은 본 UI 설계의 **제안**이며 엔진 시니어 확정 시 명칭·게이팅 로직이 바뀔 수 있음 — 표에 "확인 필요" 명시.

## ⚠️ 구현 스코프 결정 (2026-07-19, 사용자)

엔진 분석상 §155②1~4호 순위는 2-A2 세액에 무영향 → **순위 3필드·동거봉양 2필드는 미구현(Tier 2-B 이월)**. **실제 구현(LEAN)**: 공동상속 2필드(`isCoInherited`·`isLargestCoInheritedShareholder`)만. UI는 `HouseEntryEditor` 상속 섹션(ON)에 "공동상속주택" ToggleCard → ON 시 "본인이 최대지분 상속인" chip 토글(§155③ 단서). 조건부 노출(same-`inheritedDate` 그룹핑)·순위 입력·validation 차단은 미적용(공동상속 boolean은 기본 false=유효). 아래 §2~§7의 순위·동거봉양 서술은 2-B 참조용 보존.

---

## 0. 실측 확정 사실 (재검증 완료, file:line은 2026-07-19 HEAD 기준)

| 항목 | 위치 | 내용 |
|---|---|---|
| 상속 섹션 UI | `components/calc/transfer/HouseEntryEditor.tsx:177~207` (`InheritanceSection`) | ToggleCard(`:182~204`, tone=amber, variant=card) `isInherited` → children(`:193~203`) 상속개시일만. OFF 시 `:186~189`에서 `onUpdate({isInherited:v, inheritedDate: v?...:undefined})` 직접 초기화(useEffect 미러링 아님) |
| HouseEntry 생성 | `app/calc/transfer-tax/steps/step4-sections/HousesListSection.tsx:271~291` (`addHouse`) | 유일한 생성 지점. `isInherited:false` 등 명시 초기값 |
| 모달 오픈부 sibling prop 선례 | `HousesListSection.tsx:385, 402~426` | `showSpouseOwned={!!form.marriageDate}`처럼 **부모가 계산한 파생값을 prop으로 주입**하는 기존 패턴 확인(§6 조건부 노출 로직의 근거) |
| HouseEntry 타입 | `lib/stores/calc-wizard-asset-nbl.ts:75~173` | `isInherited: boolean`(`:80`, 필수), `inheritedDate?: string`(`:96`) |
| ④ API 변환 | `lib/calc/transfer-tax-api-houses.ts:54~126` (`buildHousesPayload` 내 `.map`) | `isInherited: h.isInherited`(`:61`), `inheritedDate: h.isInherited ? h.inheritedDate || undefined : undefined`(`:74`) — **isInherited 게이팅 패턴 확정** |
| ⑧ Validation | `lib/calc/transfer-tax-validate.ts:128~166` (houses 루프 `firstError` IIFE) | `:136` `if (h.isInherited && !h.inheritedDate) return "...상속개시일을 입력하세요."` |
| ⑥ 사이드바 | `lib/stores/calc-wizard-store.ts` `computeTransferSummary` | `isInherited` 계열 필드 미참조(grep 0건) — houses[]는 사이드바 합계(양도가액·취득가액·필요경비·양도소득금액·납부세액) 대상 아님 |
| ⑦ 결과 표시 | `components/calc/results/transfer/DetailedCalculationStatementCard.tsx:177, 192~230` (`EngineStepsSubToggle`) | `result.steps[]`를 **범용으로** label/formula/legalBasis 렌더링(신규 컴포넌트 불요). `CalculationStep.sub?: boolean`(`transfer.types.ts:588`)로 들여쓰기 하위 항목 표시 가능(`:222~224` `step.sub ? "pl-8..." : "px-4"`) |
| 비과세 요약 카드 | `components/calc/results/TransferTaxResultView.tsx:286~293` | `result.isExempt` 시 `result.exemptReason`(`:290`) 그대로 노출 — 신규 컴포넌트 불요 |
| 엔진 2-A1 현재 배선 | `lib/tax-engine/transfer-tax.ts:256~287` | `inheritedCount = houses.filter(h => h.isInherited && h.id !== sellingId).length`(`:259~261`); `inheritedExcludedCount = inheritedCount <= 1 ? inheritedCount : 0`(`:263`) — **2채↑는 현재 전부 0 제외(보류)**. 2-A2가 순위 판정으로 이 캡을 대체 |
| 동거봉양 카피 선례 | `app/calc/transfer-tax/steps/step4-sections/MergeDateSection.tsx:41,46,53~56` | "동거봉양 합가일" · "동거봉양 합가 후 10년 내 먼저 양도..." — 신규 카피 용어 통일 대상 |

---

## 1. 사용자 시나리오

### 시나리오 A — 피상속인 2주택 상속 후 일반주택 양도 (순위 판정)
피상속인이 사망 당시 주택 2채(A·B)를 보유했고, 상속인이 둘 다 상속받았다. 상속인은 이미 본인 명의 일반주택 C를 보유 중이며, C를 양도한다.
- 입력: houses 목록에 A·B를 각각 `isInherited=ON`, **같은 상속개시일**로 입력 → 순위 입력(피상속인 취득일·거주기간·상속개시당시 거주여부)이 A·B 둘 다에 조건부 노출.
- 엔진(설계 대상): §155②1~4호 순위로 A·B 중 1채만 "상속주택"으로 확정 → 그 1채만 주택수 제외, 나머지 1채는 일반 주택수 산입.
- UI 검증: 결과 화면에서 어느 주택이 선순위로 제외됐는지, 어떤 호(최장보유/최장거주/거주당시/기준시가) 기준이었는지 `EngineStepsSubToggle`의 하위(`sub`) step으로 확인 가능해야 함(§3⑦).

### 시나리오 B — 공동상속주택 소수지분
상속주택 1채(피상속인 1주택 — 순위 불요)를 형제 3인이 공동상속. 상속인 본인은 소수지분자(장남이 최대지분).
- 입력: 해당 house `isJointlyInherited=ON` → `isMajorShareHeir=OFF`(기본값 유지, 본인이 최대지분자 아님을 명시).
- 결과: §155③ 본문에 따라 "해당 거주자의 주택으로 보지 않음" → 주택수 제외(비과세에 유리) — 순위 판정 불요(피상속인 1주택이므로).

### 시나리오 C — 공동상속주택 최대지분
시나리오 B와 동일 상속주택이나 본인이 최대지분 상속인(또는 지분 동률 + 해당 주택 거주자/최연장자).
- 입력: `isJointlyInherited=ON`, `isMajorShareHeir=ON`.
- 결과: §155③ 단서 — 최대지분자는 해당 주택 소유로 산입 → 주택수 제외 **미적용**(일반 주택수에 포함, 과세 방향 — 유불리 표현 없이 법정 결과 그대로).

### 시나리오 D — 동거봉양 상속 예외
상속인이 피상속인과 상속개시 당시 이미 동일세대(동거봉양 합가로 합쳤던 세대)였고, 그 상태에서 상속받은 주택.
- 입력: `wasSameHouseholdAtInheritance=ON` + `isParentalCareMergeInheritance=ON`.
- 결과: §155② 단서 예외로 상속주택 인정(주택수 제외 대상 유지).

### 시나리오 D' — 동일세대이나 동거봉양 아님 (§155② 미적용)
상속개시 당시 동일세대였으나 동거봉양 합가로 합친 것이 아닌 경우(예: 원래부터 동일세대).
- 입력: `wasSameHouseholdAtInheritance=ON`, `isParentalCareMergeInheritance=OFF`(기본값).
- 결과: §155② 상속주택 특례 미적용 — 해당 house는 일반 주택수에 그대로 산입(2-A1의 자동 제외 대상에서 빠짐). **오류 아님** — "명문 없이 유리 확대 금지" 정책상 정확한 기본값.

### 회귀 — 시나리오 E (2-A1 유지)
피상속인 1주택, 공동상속 아님, 동일세대 아님(기본값 전부 OFF/미입력) — 기존 2-A1 동작 100% 유지. 신규 필드는 전부 옵셔널이며 미입력 시 순위·공동상속 로직에 진입하지 않음(§6).

---

## 2. 상속 섹션(②) 확장 위젯 배치 — ASCII 목업

`HouseEntryEditor.tsx`의 `InheritanceSection`(amber, sectionNum="②") 내부. **엔진 계산 순서 = UI 순서**: (1) 상속개시일(기존) → (2) 동일세대·동거봉양 예외(상속주택 인정 여부의 전제) → (3) 순위 판정 3필드(어느 주택이 상속주택인지, 피상속인 2주택↑일 때만) → (4) 공동상속 최대지분(상속주택으로 확정된 후 §155③ 판정). 3+ 서브섹션이나 **`LongTermRentalSection` 기존 선례를 따라 ToneCard 재중첩 없이 단순 들여쓰기+캡션**으로 구성(같은 파일 내 확립된 패턴, `components/calc/CLAUDE.md`의 "색상카드+번호"는 최상위 다중 섹션 폼용 — 단일 ToggleCard 내부 중첩엔 미적용).

```
┌─ ② 상속 정보 (amber ToneCard) ──────────────────────────────────┐
│                                                                  │
│  [카드 토글] 상속주택                                             │
│   상속주택 — 피상속인으로부터 상속받은 주택                          │
│   (소령 §167의3①7호 — 상속개시일로부터 5년 이내 주택 수 배제)         │
│                                                                  │
│   ── ON 시 펼침 (기존 유지) ──────────────────────────────────    │
│   상속개시일                         [DateInput]                 │
│   "상속 후 5년 이내이면 주택 수 산정에서 자동 배제됩니다."            │
│                                                                  │
│   ── (신규) 동일세대·동거봉양 예외 ──────────────────────────      │
│   상속개시 당시 피상속인과 동일세대였나요?                          │
│   [칩 토글] 동일세대                                              │
│     └─ ON 시 펼침                                                │
│        동거봉양 합가로 상속받았나요?                               │
│        [칩 토글] 동거봉양 합가 상속                                │
│        "동거봉양 합가로 세대를 합친 후 상속받은 경우만               │
│         상속주택으로 인정됩니다. (소령 §155② 단서)"                 │
│                                                                  │
│   ── (신규·조건부) 순위 판정 — sameDecedentHouseCount≥2 시만 ──    │
│   ⓘ "피상속인이 2주택 이상 보유했던 것으로 확인됩니다.               │
│      각 주택의 보유·거주 정보를 입력하면 §155②1~4호 순위에           │
│      따라 자동 판정합니다."                                       │
│   피상속인 취득일                    [DateInput]                  │
│   피상속인 거주기간(년)               [DecimalInput]               │
│   상속개시 당시 피상속인이 거주했나요?                              │
│   [칩 토글] 상속개시 당시 거주                                     │
│   "기준시가는 위 ①기본정보의 공시가격을 §155②4호 판정에 사용합니다." │
│                                                                  │
│   ── (신규) 공동상속주택 (§155③) ────────────────────────────     │
│   [카드 토글] 공동상속주택                                         │
│   상속인이 2인 이상 공동으로 상속받은 주택인가요? (§155③)            │
│     └─ ON 시 펼침                                                │
│        본인이 최대지분 상속인인가요?                               │
│        [칩 토글] 최대지분 상속인                                   │
│        "지분이 가장 큰 상속인만 해당 주택 소유로 봅니다.             │
│         지분이 같은 상속인이 2인 이상이면 그 주택에 거주하는 자,      │
│         그다음 최연장자를 최대지분자로 봅니다. (§155③ 단서)"         │
│                                                                  │
└──────────────────────────────────────────────────────────────┘
```

**컴포넌트 배치**:
- `HouseEntryEditor.tsx` `InheritanceSection`(`:177~207`) 함수 본문 확장. 신규 서브 렌더는 같은 함수 내 JSX로 추가(별도 파일 분리는 800줄 정책 초과 시에만 — 현재 318줄이라 여유 있음, 확장 후 약 +60줄 예상 = 380줄 선).
- 신규 prop `sameDecedentHouseCount?: number` 를 `Props` 인터페이스에 추가, `HousesListSection.tsx`가 계산해 주입(§6).
- 모든 신규 토글 `tone="amber"`(기존 상속 섹션과 통일 — 별도 톤 도입 안 함, `components/calc/CLAUDE.md` tone 매핑 중 "취득·분리계산" 계열과 결이 다르지만 섹션 컨테이너 톤을 그대로 상속받는 것이 기존 `HouseEntrySpecialExclusionSection`류 서브토글 관례와 일치).
- `DateInput`/`DecimalInput`/`ToggleCard` 전부 기존 공용 컴포넌트 재사용. 신규 컴포넌트 0건.

---

## 3. 8개 클라이언트 동기화 지점 — 신규 필드별 매핑

신규 필드 7개 전부 `HouseEntry`(폼-전역 아님, houses[] 배열의 개별 항목)에 추가. `AssetForm`이 아닌 **"다른 보유 주택" 엔트리** 확장이므로 상위 CLAUDE.md의 "①AssetForm"은 본 케이스에서 `HouseEntry`로 치환.

| 필드 | ①타입 | ②initial | ③normalize | ④API변환 | ⑤UI위젯 | ⑥사이드바 | ⑦결과카드 | ⑧validation |
|---|---|---|---|---|---|---|---|---|
| `wasSameHouseholdAtInheritance?: boolean` | `calc-wizard-asset-nbl.ts` HouseEntry(`:96` 인근에 추가) | `HousesListSection.tsx:271~291` addHouse에 `false` 명시(컨트롤드 Switch 안전) | N/A — houses[]는 legacy 마이그레이션 대상 아님(`calc-wizard-migration.ts` grep 0건, 신규 배열형이라 없음) | `transfer-tax-api-houses.ts` `.map` 내 `h.isInherited ? h.wasSameHouseholdAtInheritance : undefined`(§4③ 패턴 그대로) | `InheritanceSection` 신규 칩 토글, OFF 시 `isParentalCareMergeInheritance` 동반 초기화(§4 reset 규칙) | N/A(금액 무관) | 직접 표시 불요 — 엔진 step formula에 반영(§3-⑦ 하단 서술) | 불요(boolean 기본값 false=유효 상태, "명문없이 유리확대 금지" 기본 준수) |
| `isParentalCareMergeInheritance?: boolean` | 동상 | `false`(단, `wasSameHouseholdAtInheritance` 자식이므로 addHouse 초기 미노출 상태 — 값 자체는 false로 시작 무방) | N/A | `h.wasSameHouseholdAtInheritance ? h.isParentalCareMergeInheritance : undefined`(중첩 게이팅) | 위 칩의 자식 children | N/A | 동상 | 불요(기본값 false=§155② 미적용 방향, 법정 정확 기본값) |
| `isJointlyInherited?: boolean` | 동상 | `false` | N/A | `h.isInherited ? h.isJointlyInherited : undefined` | 신규 card 토글, OFF 시 `isMajorShareHeir` 동반 초기화 | N/A | 동상 | 불요(기본값 false=공동상속 아님) |
| `isMajorShareHeir?: boolean` | 동상 | `false` | N/A | `h.isJointlyInherited ? h.isMajorShareHeir : undefined`(중첩 게이팅) | 위 card의 자식 chip | N/A | 동상 | 불요(기본값 false=소수지분·**유리** 방향이나 §155③ 본문 그대로 — 임의 유리확대 아님) |
| `decedentAcquisitionDate?: string` | 동상 | 미설정(다른 optional 날짜 필드 `completionDate` 처럼 `""` 초기화 권장) | N/A | `h.isInherited ? (h.decedentAcquisitionDate || undefined) : undefined` | 조건부 노출 블록, `DateInput` | N/A | 동상(순위 근거 step에 반영) | **필수 — `sameDecedentHouseCount(h) >= 2`일 때 미입력 시 차단**(§4) |
| `decedentResidenceYears?: string` | 동상 | 미설정(`""`) | N/A | `h.isInherited && h.decedentResidenceYears ? parseFloat(h.decedentResidenceYears) : undefined` | 조건부 노출 블록, `DecimalInput` | N/A | 동상 | **필수 — 동일 조건, "0"도 유효값(허용)** |
| `decedentResidedAtInheritance?: boolean` | 동상 | `false` | N/A | `h.isInherited ? h.decedentResidedAtInheritance : undefined` | 조건부 노출 블록, chip 토글 | N/A | 동상 | 불요(boolean 기본값 false=유효) |

**②initial 비고**: 기존 `HouseEntry` optional boolean 관례가 혼재(`isSpouseOwned`는 addHouse에서 `false` 명시, `isRegisteredRental`은 미설정 후 위젯에서 `?? false`). 본 설계는 **명시적 `false` 초기화**를 채택(Switch 컨트롤드 컴포넌트 경고 회피 + 신규 필드 다수라 예측가능성 우선) — `isSpouseOwned` 선례를 따름.

**④API변환 게이팅 원칙(중요)**: `sameDecedentHouseCount>=2` 조건은 **UI 노출 여부만 결정**하고, API 전송은 `h.isInherited` 게이팅만 따른다(엔진이 houses[] 전체를 받아 스스로 동일 피상속인 그룹을 재판정하는 것이 단일 진실 소스 — `feedback_ui_engine_dual_truth_avoidance`). 즉 순위 3필드는 `isInherited=true`이면 항상 전송(값이 있으면), UI가 안 보여줬다고 전송을 막지 않는다 — 반대로 **validation(⑧)만 UI 노출 조건과 1:1**로 필수 여부를 게이팅한다(요구사항 §4 원칙과 합치).

**③normalize**: `houses[]`는 `calc-wizard-migration.ts`의 legacy 폼 마이그레이션 대상이 아님(grep 0건 — 애초에 배열형 신규 구조라 legacy 단일 필드 마이그레이션 불필요). 신규 필드 7개 모두 normalize 지점 N/A.

**⑥사이드바**: `computeTransferSummary`가 `houses[]`를 전혀 참조하지 않음(대상: 양도가액·취득가액·필요경비·양도소득금액·납부세액 — 전부 `assets[]`/`contractTotalPrice` 기반). 상속 순위·공동상속 필드는 금액에 직접 관여하지 않고 "누가 상속주택으로 확정되는가"라는 판정 입력이므로 사이드바 영향 없음. 기존 `isInherited`도 사이드바 미반영 — 동일 정책.

---

## 4. Validation 규칙 (UI 노출 조건 = required 조건 1:1)

`lib/calc/transfer-tax-validate.ts`의 houses 루프(`:128~166`) `firstError` IIFE에 기존 `:136` 체크(`h.isInherited && !h.inheritedDate`) **직후** 추가:

```ts
// §155②1~4호 순위 — 피상속인 2주택↑(동일 상속개시일 그룹 2건↑)일 때만 순위 입력 필수.
// UI 노출 조건(§6 sameDecedentHouseCount)과 완전히 동일한 그룹핑 재계산 — UI 통과↔validate 차단 모순 금지.
if (h.isInherited && h.inheritedDate) {
  const sameDecedentCount = houses.filter(
    (o) => o.isInherited && o.inheritedDate === h.inheritedDate,
  ).length;
  if (sameDecedentCount >= 2) {
    if (!h.decedentAcquisitionDate)
      return `${label}: 피상속인이 2주택 이상 보유 — 피상속인 취득일을 입력하세요. (§155②1호 순위 판정)`;
    if (h.decedentResidenceYears === undefined || h.decedentResidenceYears === "")
      return `${label}: 피상속인이 2주택 이상 보유 — 피상속인 거주기간(년)을 입력하세요. (§155②2호 순위 판정, 거주한 적 없으면 0 입력)`;
  }
}
```

- **동일세대·동거봉양·공동상속 5필드(boolean)는 validation 대상 아님** — 미입력(=false 기본값)이 그 자체로 법정 유효 상태(§3 표 근거). ToggleCard는 항상 명시적 boolean을 갖고 시작(②initial에서 `false` 확정)하므로 "미입력" 상태 자체가 존재하지 않음.
- **`decedentResidenceYears === "0"` 허용** — 기존 `unavoidableResidenceYears`류(`>0` 강제)와 달리 "0년 거주"가 §155②2호 순위 비교에서 유효한 데이터이므로 존재 여부만 체크(값 0 차단 금지 — 자동 안분 아닌 실제 유효값).
- **officialPrice(§155②4호 기준시가)는 별도 신규 검증 불요** — 이미 `:133~134`에서 모든 house 행에 무조건 필수(`if (!h.officialPrice || parseAmount(h.officialPrice) <= 0) return "...기준시가...입력하세요"`).

---

## 5. 라벨·설명 카피 (법령 정확 · 유불리 표현 없음)

| 필드 | 라벨 | 설명/hint |
|---|---|---|
| `wasSameHouseholdAtInheritance` | "상속개시 당시 피상속인과 동일세대였나요?" | (본인 세대 구성 여부와 별개 — 상속 시점에 피상속인과 **한 세대**를 이루고 있었는지를 묻는 질문. 기존 "1세대1주택" 여부 토글과 혼동 주의) |
| `isParentalCareMergeInheritance` | "동거봉양 합가로 상속받았나요?" | "동거봉양 합가로 세대를 합친 후 상속받은 경우만 상속주택으로 인정됩니다. (소득세법 시행령 §155② 단서)" |
| `decedentAcquisitionDate` | "피상속인 취득일" | hint: "피상속인이 이 주택을 취득한 날 — 상속개시일까지의 보유기간으로 §155②1호 순위를 판정합니다" |
| `decedentResidenceYears` | "피상속인 거주기간 (년)" | hint: "피상속인이 이 주택에 실제 거주한 기간 — §155②2호 순위 판정 기준. 거주한 적이 없으면 0을 입력하세요" |
| `decedentResidedAtInheritance` | "상속개시 당시 피상속인이 거주했나요?" | "§155②3호 — 상속개시 당시 피상속인이 실제 거주하던 주택인지 여부" |
| (조건부 노출 안내 배너) | — | "피상속인이 2주택 이상 보유했던 것으로 확인됩니다. 각 주택의 보유·거주 정보를 입력하면 §155②1~4호 순위(최장보유→최장거주→상속개시당시거주→기준시가최고 순)에 따라 상속주택을 자동 판정합니다." |
| `isJointlyInherited` | "공동상속주택인가요?" | "상속인이 2인 이상 공동으로 상속받은 주택인 경우 체크하세요. (소득세법 시행령 §155③)" |
| `isMajorShareHeir` | "본인이 최대지분 상속인인가요?" | "지분이 가장 큰 상속인만 해당 주택을 소유한 것으로 봅니다. 지분이 같은 상속인이 2인 이상이면 그 주택에 거주하는 자, 그다음 최연장자를 최대지분자로 봅니다. (§155③ 단서)" |

- "유리/불리/절감" 등 납세자 관점 형용사 일절 미사용 — 법정 요건·효과만 서술(`feedback_tax_calculation_principle`).
- §155②·§155③ 조문 번호는 `LawArticleModal legalBasis="소득세법 시행령 §155②"` 형태로 기존 `SpecialHouseExclusionSection`·`Step4.tsx:497` 패턴과 통일해 인용 링크화(§law_article_link 정책) — 조건부 배너에도 근접 배치.

---

## 6. 조건부 노출 로직 — "피상속인 2주택↑" 판정 방법

**결정: 상속주택 2채↑ 존재로 추론(same-`inheritedDate` 그룹핑)** — per-house 명시 플래그(예: `decedentId` 신설) 방식은 **채택하지 않음**.

### 근거
1. 현재 `HouseEntry`엔 피상속인을 식별할 별도 ID가 없고, 신설하면 §3의 mirror-pattern·이중 소스 금지 정책과 충돌 소지(상속개시일이 이미 사실상 피상속인 식별자 역할 — 같은 날 사망한 서로 다른 피상속인이 각각 이 세대에 주택을 남기는 경우는 실무상 무시 가능한 극단치).
2. `inheritedDate`는 **이미 §155②1호 순위(보유기간) 산정의 종료일이자 §167의3①7호 5년 배제의 기산일로 기존 필수 입력** — 신규 식별자 없이 기존 데이터만으로 그룹핑 가능(YAGNI).
3. `HousesListSection.tsx:385,402~426`에 **부모가 파생값을 계산해 자식 prop으로 주입하는 선례**(`showSpouseOwned`)가 이미 존재 — 동일 패턴 재사용.

### 구현 위치
`HousesListSection.tsx`의 `<HouseEntryEditor>` 렌더 지점(`:410~414` 인근, 모달 오픈 블록)에서:

```ts
const sameDecedentHouseCount = editingHouse
  ? houses.filter(
      (h) => h.isInherited && h.inheritedDate && h.inheritedDate === editingHouse.inheritedDate,
    ).length
  : 0;
```

이 값을 `<HouseEntryEditor sameDecedentHouseCount={sameDecedentHouseCount} .../>`로 전달. `InheritanceSection`은 `sameDecedentHouseCount >= 2`일 때만 순위 3필드 블록을 렌더(§2 목업).

### 한계·안내 문구 보강
- 그룹핑은 **`inheritedDate` 문자열 완전 일치**에 의존 — 실제로 서로 다른 피상속인이나 상속개시일을 다르게 입력하면 순위 로직이 발동하지 않음(정상 — 각각 §155②1호로 개별 판정). 반대로 **같은 피상속인의 두 주택인데 상속개시일을 실수로 다르게 입력**하면 순위 로직이 누락될 위험 → 조건부 배너 인근에 "상속개시일이 같은 주택끼리 자동으로 같은 피상속인으로 판단합니다" 캡션 추가 권장(§5 배너 카피에 반영 검토).
- 실시간 반응: 사용자가 두 번째 주택의 상속개시일을 입력해 첫 번째와 일치시키는 즉시(리렌더) 양쪽 house의 순위 블록이 함께 나타남 — `onChange` 즉시 반영이라 별도 useEffect 불필요(정책 준수).
- **엔진 측 재확인 필요**: 엔진이 동일 방식(같은 `inheritedDate` 그룹)으로 순위 대상을 판정할지, 아니면 별도 로직(예: 상속개시일 근접 허용치)을 쓸지는 엔진 설계 확정 시 결정 — 본 UI 로직은 **표시 여부만** 좌우하고 실제 판정은 엔진이 전체 houses[]로 독립 수행하므로(§3 API 게이팅 비고) UI·엔진 그룹핑 기준이 다소 달라도 **세액 오류로 이어지지 않음**(최악의 경우 UI가 순위 필드를 보여주지 않아 사용자가 입력을 안 하면 엔진이 데이터 부족으로 2-A1 캡 방식(0 제외)으로 안전 폴백 — 무근거 과다 비과세 방지 원칙 유지).

---

## 7. 테스트 케이스 (UI 관점 — 엔진 anchor는 엔진 시니어 별도)

| # | 시나리오 | UI 확인 항목 |
|---|---|---|
| 1 | 상속주택 1채만 등록(2-A1 회귀) | 순위 3필드 미노출. 동일세대·공동상속 토글은 노출(항상 표시)하되 기본 OFF로 기존 계산 불변 |
| 2 | 상속주택 2채, 상속개시일 동일 입력 | 두 house 편집 모달 모두에서 순위 3필드 노출. 배너 문구 노출 |
| 3 | 상속주택 2채, 상속개시일 다르게 입력 | 순위 3필드 미노출(각각 독립 §155②1호 취급) — 오탐 아님을 QA 시 문서화 |
| 4 | 순위 필드 노출 상태에서 피상속인 취득일 미입력 → 계산 시도 | validation 차단 메시지 노출(§4), 다음 단계 진행 불가 |
| 5 | 순위 필드에서 피상속인 거주기간 "0" 입력 | 정상 통과(차단 안 됨) — `unavoidableResidenceYears`류(>0 강제)와 달리 취급 확인 |
| 6 | 공동상속 ON + 최대지분 OFF(기본) | 결과 화면에서 해당 house가 상속주택으로 처리(주택수 제외) 확인 |
| 7 | 공동상속 ON + 최대지분 ON | 결과 화면에서 해당 house가 상속주택 미인정(주택수 산입) 확인 |
| 8 | 동일세대 ON + 동거봉양 OFF | §155② 미적용 — 결과 화면에서 해당 house가 일반 주택수에 산입됨을 확인(과세 방향 결과가 "정상"임을 QA가 오판하지 않도록 케이스 매트릭스 §5-A 인용) |
| 9 | 동일세대 ON + 동거봉양 ON | §155② 적용 유지 — 상속주택 인정 |

---

## 8. 확인 필요 (엔진 설계 확정 대기)

1. **필드명 최종 확정** — 본 문서의 7개 필드명(§3)은 UI 제안. 엔진 시니어가 `TransferTaxInput`/`HouseInfo`(엔진 타입) 명명 확정 시 본 문서·구현 동시 갱신 필요.
2. **officialPrice §155②4호 재사용 여부** — 현재 `officialPrice`는 "취득 시 공동·개별주택가격" hint(취득일 기준). 상속주택은 통상 취득일=상속개시일이라 값이 일치할 것으로 추정되나, 엔진이 별도 "상속개시 당시 기준시가" 필드를 요구할 경우 신규 필드 추가 필요(현재는 재사용 가정으로 설계, §5 배너에 "①기본정보 공시가격 사용" 명시로 사용자 오해 방지).
3. **순위 동점 처리(1~3호 모두 동률)** — §155②4호(기준시가 최고)까지 동률이면 법령상 처리 미정(추가 조사 필요, 본 UI 설계 범위 밖 — 엔진 판단에 위임, UI는 입력만 제공).
4. **결과 카드 강화 여부** — §3⑦에서 제안한 `CalculationStep.sub` 하위 항목 활용은 엔진이 해당 step을 실제로 push해야 동작. 엔진 설계 시 "순위 판정 근거"를 별도 `sub` step으로 낼지, 기존 "상속주택 주택수 제외" 1건의 `formula` 문자열에 풀어쓸지 결정 필요 — 어느 쪽이든 본 문서의 UI(EngineStepsSubToggle)는 **신규 컴포넌트 없이 그대로 수용** 가능.
