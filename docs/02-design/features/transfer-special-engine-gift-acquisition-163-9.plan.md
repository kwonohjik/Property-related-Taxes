# 양도세 특수엔진 증여(gift) 취득가액 §163⑨ 수정 계획서

> 상태: **Plan (자가검토 1사이클 완료)** · 작성 2026-07-21 · 근거: 감사 memory `project_transfer_special_engine_gift_acquisition_163_9_gap`
> 선행: 상속 §163⑨ 수정 시리즈(겸용 PR#710·GB #713·상가 #715/716·재개발 #718)
> 자가검토(plan-design-self-review-loop): 오류·누락·개선·UI(인라인) + 모순·정책위반(fork). 정정 반영 완료 — §9 검토 로그.

## 0. 한 줄 요약

소득세법 시행령 **§163⑨은 상속·증여 공통**인데, 상속 §163⑨ 수정이 전부 `acquisitionCause === "inheritance"` 조건에만 걸려 **증여로 미러링되지 않았다**. 4개 특수 자산 경로(겸용·일반건물·재개발·표준/상가)의 증여 취득가액을 §163⑨ 정합(증여일 평가액=증여 신고가액을 실지거래가액으로 직접 사용, 환산·개산공제 배제)으로 수정한다.

> **범위 한정 (혼동 방지)**: 본 계획의 "증여"는 `acquisitionCause === "gift"`(순수 증여 취득) 전용. **`carryover_gift`(이월과세 §97의2)·`burdened_gift`(부담부증여 §159)는 별도 경로로 범위 밖** — 이들은 이미 전용 로직(carryover 서브객체·§159 채무비율 안분)을 가지며 §163⑨ 직접평가와 다른 산정 체계다.

## 1. 법적 근거

- **소득세법 시행령 §163⑨ 본문**(법제처 원문 실측 2026-07-21, MST 286211): "상속 또는 증여(…부담부증여의 채무액에 해당하는 부분도 포함하되, **상증법 §34~§39, §39의2, §39의3, §40, §41의2~§41의5, §42, §42의2, §42의3에 따른 증여는 제외**한다)받은 자산에 대하여 법 §97①1호가목을 적용할 때에는 상속개시일 또는 **증여일 현재 상증법 §60~66에 따라 평가한 가액**(§76에 따라 세무서장등이 결정·경정한 가액이 있으면 그 가액)을 취득당시의 실지거래가액으로 본다." → 증여도 신고가액(증여일 §60~66 평가액)을 취득가액으로 **직접** 사용. 환산 아님.
- **§163⑥ 개산공제(3%)**: 환산취득가 전용 → §163⑨ 직접평가 시 **배제**.
- **§163⑨ 각 호(단서)** — 미공시 max, "상속 **또는 증여**받은" 명시(증여 동일 적용):
  - **1호(토지)**: 1990.8.30 개별공시지가 고시 **전** 상속·증여받은 토지 = max(§60~66 평가액, §164④ 가액).
  - **2호(건물)**: 건물 기준시가 고시 **전** 상속·증여받은 건물 = max(§60~66 평가액, §164⑤~⑦ 가액).
- **§176의2②2호**(미공시 주택 §164⑦ 환산 근거): 개별/공동주택가격 최초 공시 전 취득 주택+부수토지 함께 양도 시 취득당시 기준시가를 §164⑦로 계산. → 상속 코드 `resolveHousingInheritedAcqPhd`의 max(신고가, §164⑦)가 여기서 유래.

### 1.1 KoreanLaw 검증 결과 (법제처 원문 실측 — 확정)

- **Q1 ✅확정 (pre-1985 게이트 = 상속·증여 동일)**: §176의2④ 원문 "법률 제4803호 부칙 제8조에서 정하는 날(의제취득일=1985-01-01) 전에 취득한 자산(**상속 또는 증여받은 자산을 포함한다**)에 대하여 …" → 1985 의제취득일 특칙이 증여도 포함. 상속의 `acquisitionDate >= "1985-01-01"` 게이트를 증여도 **동일 적용**(post-1985=§163⑨ 직접평가, pre-1985=의제취득일 max). 계획 게이트 미러 타당.
- **Q2 ✅확정 (미공시 max = 증여 동일)**: §163⑨1호(토지)·2호(건물)·§176의2②2호(주택) 전부 "상속 또는 증여"·"취득한" 포함 → 미공시 max 증여 동일. **정정**: 기존 "§163⑨2호=미공시 개별주택→§164⑤~⑦"은 오기 — §163⑨2호는 **건물**(§164⑤~⑦), 주택 §164⑦은 §176의2②2호 근거.
- **Q3 ✅확정 (겸용 주택/상가 분리신고)**: §60~66 평가는 **자산별**(주택·상가 각 §61 기준시가 평가) → 겸용 증여 신고가액도 주택분/상가분 분리 산정이 자연스러움. 상속 4필드 구조(housing/commercial 분리)와 동형 정당.
- **🔴 신규 CRITICAL (범위 경계)**: §163⑨ 본문이 **증여의제(상증법 §34~§42의3 목록)를 §163⑨ 대상에서 명시적 제외**. 따라서 `acquisitionCause === "gift"`는 **순수 증여(일반 수증, 상증법 §2)만** §163⑨ 대상. 부동산 일반 증여(부모→자녀 등)는 제외목록에 없어 대상 정합이나, 증여의제로 취득한 자산은 §163⑨ 미적용 → 엔진 게이트·검증에 이 경계를 명시(정책 `feedback_design_law_cases` 각 호 전수). ※ 현 UI 취득원인 "증여"는 일반 수증 상정이므로 실무 정합. `carryover_gift`·`burdened_gift`는 §10 범위 제외(단 §163⑨ 본문은 부담부증여 채무액 부분을 포함 — 그 부분은 기존 §159 로직이 담당, 상속 감사서 "부담부증여×상속=버그아님"과 동형).

## 2. 감사 결과 요약 (실측 확정)

| 경로 | 판정 | 핵심 |
|---|---|---|
| 표준(주택/토지/건물) | ✅안전 | gift=`fixedAcquisitionPrice` 실가. 메인 API가 비-purchase `useEstimatedAcquisition` null화(`transfer-tax-api-helpers.ts:460`) |
| 상가건물 | ✅안전 | 동일 메인 경로 null화 → `applyCommercialBuildingStep` 미발동 |
| **겸용(mixed-use)** | 🔴BUG **기본동작** | 증여 신고가액 침묵 drop·엔진 환산 강제·개산공제 3%. **사용자 케이스** |
| 일반건물(GB) | 🔴BUG **stale flag** | validation V2 가드 상속만·증여 미보호 |
| 재개발 | ⚠️조건부 | 실가모드 정상·환산토글 시 §166③+개산공제로 신고가액 소실 |

실측(감사 probe):
- 겸용: 증여 신고가액 5억 입력 → 엔진 환산 10.3억+개산공제 사용(신고가액 무시).
- GB(메인 probe): 환산 경로 `buildingAcquisitionCause=gift` = 매매와 완전 동일(개산공제 844,341·gain 655,446,147).
- 재개발: 증여 환산모드 200M→§166③ 141,221,534(신고가액 소실). 실가모드는 200M 정상.

## 3. 경로별 수정 설계

### Phase 1 — 겸용주택 (최우선 · 기본동작 버그 · 사용자 케이스)

상속 수정(PR#710) 4계층 미러. 상속 resolve 함수(`transfer-tax-mixed-use-inheritance.ts`의 `resolveHousingInheritedAcqDirect`/`…Phd`/`resolveCommercialInheritedAcq`)는 이미 **generic `reportedValue` 기반**이라 증여 재사용 가능.

**설계 결정 D1 (naming) — ✅확정 = 옵션 B (사용자 결정 2026-07-21)**:
- **옵션 B 확정(B1 최소구현)**: 병렬 `acquisitionByGift` 플래그 1개만 엔진 신규 + 게이트 `acquisitionByInheritance || acquisitionByGift` OR 확장. reported 값 필드(`housingInheritedValue` 등 4개)·resolve 함수·상속 경로 **전부 불변**(Surgical) — gift 값을 API에서 동일 엔진 필드로 주입. 결과 라벨은 `acquisitionConversionRoute` enum에 `gift_direct`/`gift_phd_max` 추가(신규 result 필드 없음, 단일 소스). 폼은 UI 라벨용 gift 4필드 신설.
- (기각) 옵션 A: §163⑨-중립 rename은 상속 코드까지 건드려 회귀면적↑ — 상속 회귀 최소화 우선으로 기각.
- **D2 ✅확정 = 상속 미러**: gift도 실비(자본적지출·양도비) 별도 입력(`mixed*GiftExpense` → 엔진 `*InheritedExpense`), 개산공제(3%) 배제, 기본 0.
- → 상세: `transfer-special-engine-gift-acquisition-163-9.engine.design.md` · `.ui.design.md` (STEP 5·12 생성 완료).

**엔진** (`transfer-tax-mixed-use-helpers.ts` + `-commercial.ts`):
- 게이트 확장: `:246`(PHD max)·`:281`(본문 fallback)·`:500`(토지 개산공제 `?0:3%`)·`:501-503`(건물 개산공제 슬롯 → 상속은 `housingInheritedExpense` 운반)·commercial `:129`(`if acquisitionByInheritance`)을 상속 OR 증여로.
- 증여 본문 = fallback(`reportedGiftValue ?? stdCandidate`), 개산공제 0. 미공시(PHD) 주택분은 max(신고가, §164⑦)(§176의2②2호 근거, Q2 ✅확정 — 상속 `resolveHousingInheritedAcqPhd` 그대로 재사용).
- pre-1985 증여 게이트(Q1 ✅확정 — §176의2④ "상속 또는 증여받은 자산 포함") — 게이트 false면 기존 환산 fallback(회귀-safe), 상속과 동형 1985-01-01 게이트.
- **증여의제 제외(§1.1 CRITICAL)**: 게이트는 `acquisitionCause === "gift"`(순수 증여)만 — 증여의제(상증법 §34~§42의3)는 §163⑨ 대상 아님. 현 UI "증여"는 일반 수증이라 정합.

**API** (`lib/calc/transfer-tax-api-mixed-use.ts:183-189`):
- `acquisitionByGift`(또는 `usesDeemedAcqValue`) = `acquisitionCause === "gift" && 날짜게이트`.
- 증여 값을 상속 4필드 미러로 매핑(상속은 `housingInheritedValue`·`commercialInheritedValue`·`housingInheritedExpense`·`commercialInheritedExpense` **4필드**, `:186-189`). **신규 폼 필드 4개**: `mixedHousingGiftValueOverride`·`mixedCommercialGiftValueOverride`·`mixedHousingGiftExpense`·`mixedCommercialGiftExpense`. 옵션 B면 이 값들을 기존 generic resolve 함수(reportedValue 기반)에 주입.
- **필요경비 처리 결정 D2 (Design 확정)**: §163⑨ 직접평가 시 개산공제(3%) 배제는 확정. 대신 상속처럼 실제 필요경비(자본적지출·양도비)를 별도 입력받는지(`*InheritedExpense` 미러) — 엔진 `transfer-tax-mixed-use-helpers.ts:501-503`이 상속 건물 개산공제 슬롯을 `housingInheritedExpense`로 대체하는 구조. 증여도 동형(실비 입력 or 0).

**UI** (`components/calc/transfer/mixed-use/MixedUseAssetMajorStdPrice.tsx:49`):
- `isGift = acquisitionCause === "gift"` 분기 추가 → 상속 override 카드(`tone="violet"`, `:139-160` 주택분·`:229-` 상가분) 미러. **CurrencyInput 4개**(주택분 신고가액·주택분 실비·상가분 신고가액·상가분 실비 — 상속 `:145·:154·:237·:242` 미러). 라벨: "증여일 평가액(상증법 §60~66) — 취득가액 직접 사용".
- **미공시 §164⑦ 카드**(`:165`): 현재 라벨만 `isInheritance` 분기(카드 자체는 항상 렌더). 증여도 미공시 max(§164⑦, §176의2②2호) 대상 확정(Q2 ✅) → 라벨/게이트에 증여 포함.

**Validation** (`lib/calc/transfer-tax-validate-mixed-use-inheritance.ts` → gift 대응 신설 또는 게이트 일반화):
- 현재 `:21` `if (acquisitionCause !== "inheritance") return null`. 증여 케이스 추가 — 증여 신고가액 또는 취득시 기준시가 필수(silent fallback 금지 정책 `feedback_no_silent_apportion_fallback`).

> **⚠️ Do 환류(2026-07-21) — Phase 2·3 방식 확정 = block(graceful 미채택)**: 아래 Phase 2/3 설계는 상속의 graceful-safety-net 미러를 상정했으나, Do 단계에서 **validation block 방식으로 확정**했다. 근거: (1) §163⑨ 증여 신고가액은 항상 확인 가능 → 환산 자체가 법적 불필요(상속처럼 "확인 불가 시 환산" 예외 경로가 gift엔 없음). (2) 상속 재개발 graceful override는 `inheritedAcquisition` payload라는 **별도 값 채널**(환산 토글과 무관하게 항상 전달)이 있어 가능했으나, gift는 값이 `redevActualAcquisitionPrice`(실가 모드 전용 필드)에만 있어 환산 모드에서 값 채널이 없다 → graceful을 구현하려면 API·엔진·UI 필드가시성 3중 수정 필요(과복잡). (3) block은 GB·재개발 양쪽에 동일 적용돼 일관되고, 실가 모드가 이미 §163⑨ 정합이라 "환산 차단→실가 유도"만으로 충족. → **API `acquisitionPrice=0` 계층 수정(I2)·엔진 세이프넷 불요**. 구현: validation 차단 + UI 안내 카드.

### Phase 2 — 일반건물(GB) (낮은 도달성 · stale flag)

- **엔진/경로**: GB actual 경로(`general-building-route-helper.ts:558-565` else)는 이미 gift=`actualAcquisitionPrice` 정상. 문제는 **환산 경로 진입 차단 부재**.
- **수정(택1, Design 확정)**:
  - (a) validation V2 가드 확장: `transfer-tax-validate-gb.ts:88-95`의 `isLandInherited || isBuildingInherited` 조건을 gift 포함으로 확장 → 증여 GB도 환산·증축 조합 차단(실가 강제). **최소·회귀-safe** (권장).
  - (b) 취득원인 전환 시 `useEstimatedAcquisition` 클리어(`GeneralBuildingAcquisitionCards.tsx:94`·`CompanionAcquisitionCauseSection.tsx:60` onChange) — UX 개선이나 useEffect 미러링 금지 정책상 onChange 직접 처리.
- **주의**: gift GB는 증여 신고가액이 `fixedAcquisitionPrice`→actual 경로로 정상 배선되므로, 환산 차단만으로 §163⑨ 정합 달성(신규 필드 불요).

### Phase 3 — 재개발 (조건부)

상속 PR#718 미러(엔진 세이프넷 + UI 안내). **⚠️ 자가검토(I2 Critical) 반영**: 엔진-only 세이프넷으로는 불충분 — API 계층 수정이 선행돼야 한다.

- **🔴 API 계층(선행 필수)** (`transfer-tax-api.ts:213-215`): 환산토글 ON(`isEstimated`) 시 `acquisitionPrice`를 무조건 `0`으로 전송 → 엔진 세이프넷 도달 시점엔 증여 신고가액이 **이미 소실**. 따라서 API에서 **재개발+증여+신고가액 확인** 시 `acquisitionPrice`를 0으로 만들지 않고 reported 신고가액을 유지(또는 reported를 별도 필드로 운반)해야 한다. 이 수정 없이는 엔진 세이프넷이 복구할 원본이 없음.
- **증여 취득가액 소스 정정(I3)**: 재개발 취득가액은 원조합원 = `redevActualAcquisitionPrice`(`transfer-tax-api.ts:220`), 승계조합원 = `fixedAcquisitionPrice`(`:218`). 증여 신고가액이 어느 필드로 들어오는지 Design에서 원/승계 구분해 확정(증여는 원조합원 흐름이 일반적).
- **엔진 세이프넷** (`transfer-tax.ts:248`): 재개발 override 게이트 `acquisitionCause === "inheritance"`를 gift 포함으로 확장 — "gift + 신고가액 확인 시 `useEstimated=false`·`acquisitionPrice=reported` 강제", §166③·개산공제 배제. (API가 reported를 살려 보낸다는 전제.)
- **UI 안내** (`RedevelopmentBlock.tsx:113-123` 상속 안내 미러): 증여 전용 §163⑨ ToneCard(증여일 평가액=실지거래가액, §166③·개산공제 배제). 실가 카드 문구(`:369-384` "취득 실거래가액")가 증여 신고가액 포함하도록 조정.

### Phase 0 — 표준·상가 (회귀 가드만)

수정 불요(✅안전). 다만 회귀 방지 anchor 추가: 증여 상가건물·증여 주택이 stale `useEstimatedAcquisition`에도 신고가액 실가 사용 유지 확인(`transfer-tax-api-helpers.ts:460` null화 보호 회귀 가드).

## 4. Pre-Do Anchor 계획 (정책 `pre-do-anchor-verification`)

Do 진입 전 경로별 anchor 1건 우선 작성·실행(현행 버그 재현 → 수정 후 정합):
- A1 겸용: 증여 신고가액 X → 수정전 환산값, 수정후 X 직접(개산공제 0).
- A2 GB: 증여+환산 stale → 수정후 validation 차단(또는 실가 강제).
- A3 재개발: 증여+환산토글 → 수정후 신고가액 유지.

## 5. 14 동기화 지점 (겸용 Phase 1 기준 · 강제)

클라이언트 8: ①`calc-wizard-asset.ts` gift override 4필드 ②initial ③migrate ④`transfer-tax-api-mixed-use.ts` ⑤`MixedUseAssetMajorStdPrice.tsx` ⑥사이드바(`computeTransferSummary` 취득가액) ⑦결과카드(`components/calc/results/mixed-use/MixedUseResultCard.tsx` "증여일 평가액(취득가액)" 라벨 분기 — 상속 라벨 미러) ⑧validate.
API/Route 6: ⑨⑩ Zod refines·⑫ **Zod 입력 스키마** = `lib/api/transfer-tax-schema-mixed-use.ts:82-86`(상속 5필드 `acquisitionByInheritance`·`housingInheritedValue`·`commercialInheritedValue`·`housingInheritedExpense`·`commercialInheritedExpense` 정의됨) → **증여 필드/플래그 동일 파일 추가 필수**(누락 시 route에서 침묵 strip). ⑬ route body spread(`route.ts:688` `...data.mixedUse`)·⑭ 엔진 매핑. **⑫ 미추가가 최대 함정** — TypeScript 미감지.

## 6. 테스트·E2E

- anchor: 경로별 A1~A3 + 미공시 max·pre-1985 게이트·개산공제 0.
- 회귀: 상속 경로 전건 불변(옵션 B면 상속 코드 미변경으로 자동), 매매 경로 불변.
- E2E: 겸용 증여 신고서 취득가액 행 = 신고가액 직접(상속 E2E `getByRole("button",{name:/취득정보/})` 펼침 패턴 재사용).

## 7. 리스크·미결

- **✅ KoreanLaw Q1~Q3 전건 해소**(§1.1) — 법제처 원문 실측(MST 286211). 잔여 법령 미결 없음.
- **R1 매매 겸용 환산(별건·증여 범위 밖)**: 겸용 엔진은 매매(purchase)도 `fixedAcquisitionPrice` 미참조로 환산 강제. 실지거래가 알려진 매매 겸용이 환산되는 게 의도 설계인지 **별도 확인 필요** — 본 계획 범위 밖, 후속 이슈로 분리. (참고: §163⑨은 상속·증여 전용 조항이므로 매매는 §163⑨ 대상 아님 — 매매 환산 적정성은 §176의2·§97 별도 판단.)
- **R2 naming(D1)**: 옵션 A/B 확정을 Design으로 이연. 상속 회귀 최소화 우선(B 잠정).
- **R3 재개발 신고가액 경로**: 환산토글 ON 시 acquisitionPrice=0 문제 — 세이프넷이 reported를 확보하는 정확한 필드 Design에서 실측 확정.
- **R4 증여의제 경계(§1.1 CRITICAL)**: 게이트를 순수 증여로 한정하는 구현 방식(현 UI는 일반 수증만이라 실무 정합이나, 게이트 주석·검증에 경계 명시) — Design에서 확정.

## 8. 완료 정의

각 Phase: anchor GREEN + 전체 회귀 0 + tsc 0 + lint 0 + (겸용) 14지점 self-grep + 브라우저/E2E 확인. 법령 정합 = KoreanLaw Q1~Q3 ✅검증 완료(§1.1, 원문 실측). Do 진입 전 잔여 = 설계 결정 D1(naming)·D2(필요경비) 확정 + `.engine.design.md`·`.ui.design.md` 생성("대" 규모).

## 9. 자가검토 로그 (plan-design-self-review-loop)

정정 반영(실측 근거):
- **오류**: `MixedUseResultCard.tsx:289` 경로 오류 → `components/calc/results/mixed-use/MixedUseResultCard.tsx`. 개산공제 게이트 `:500-501` → `:500`(토지)/`:501-503`(건물, `housingInheritedExpense` 운반). commercial 게이트 `:128-130` → `:129`.
- **누락(High)**: 상속 겸용은 **4폼필드**(신고가액+실비 × 주택/상가) — 계획 2필드→4필드 확장(D2 필요경비 결정 신설). `carryover_gift`(§97의2)·`burdened_gift`(§159) 범위 제외 명시.
- **UI(High)**: 상속 override 카드=`violet`, CurrencyInput 4개(`:145·154·237·242`) 미러. 미공시 §164⑦ 카드(`:165`) 증여 분기.
- **모순·정책위반(Critical, fork)**: **I2** 재개발 엔진-only 세이프넷 불충분 — API(`transfer-tax-api.ts:213-215`)가 `isEstimated` 시 `acquisitionPrice=0`을 먼저 전송해 엔진 도달 전 신고가액 소실. API 계층 선행 수정 필수(Phase 3 재작성). **I3** 재개발 증여 신고가액 소스=원조합원 `redevActualAcquisitionPrice`(`:220`)/승계 `fixedAcquisitionPrice`(`:218`) 구분. (메인 독립검증: `transfer-tax-api.ts:213-222` 실측 일치.)

**verdict**: `needs-fix` → **계획+법령 단계 clean**. Critical/High 문서 정정 완료(잔존 0). **KoreanLaw Q1~Q3 ✅검증 완료**(§1.1, 법제처 원문 MST 286211 실측 — 증여의제 제외 CRITICAL·1985 게이트·미공시 max·§163⑨2호 오기 정정). Do 진입 전 잔여 = 설계 결정 D1(naming)·D2(필요경비) 확정 + 엔진 input 타입 변경("대" 규모) → STEP 5(`.engine.design.md`)·STEP 12(`.ui.design.md`) 별도 생성 후 Do.
