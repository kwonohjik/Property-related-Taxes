# 작업계획서 — §154① 단서 카드 노출 정교화 + 일시적 2주택 종전주택 §154① 단서 면제 엔진 갭

- 요청: 양도세 Step4의 **§154① 단서(보유·거주 요건 면제) 카드**는 1세대1주택 판정에만 필요하니, 불필요한 경우(순수 다주택)에는 **숨김** 처리한다.
- 검증 중 발견: 숨김 술어를 단순 `householdHousingCount === 1`로 하면 **일시적 2주택 종전주택**이 §154① 단서 준용 대상인데도 입력 경로가 사라진다. 게다가 **현행 엔진이 일시적 2주택 경로에서 §154① 단서 면제를 아예 미구현(세법 갭)**.
- 결정(2026-07-19, 사용자): **UI 숨김 + 엔진 갭 함께**. 즉 카드 노출 술어를 정교화하고, 일시적 2주택 종전주택에 §154① 단서 보유면제를 엔진에 구현한다.
- 성격: **중 규모** — 엔진 로직 1개소(일시적 2주택 경로) + 공유 술어 신설 + UI 노출 술어 + API/validation 게이트 미러링. **엔진 input/result 타입 신규 필드 없음**(기존 `oneHouseExemptionProviso`·`temporaryTwoHouse` 재사용 → 14지점 "신규 필드" 대부분 N/A, 대신 **게이트 3중 미러링**이 핵심).
- 자가검토: 작성 후 `plan-design-self-review-loop` 예정(본문은 초안).

---

## 1. 배경 — 세법 vs 현행 구현 불일치 (실측)

### 1-1. §154① 단서의 성격과 소비 경로 (엔진 실측)

`checkExemption`(`transfer-tax-exemption.ts:164`)에서 `oneHouseExemptionProviso`(§154① 단서)가 **실제로 세액에 반영되는 지점은 `meetsOneHouseHoldingResidence` 호출(line 246) 단 하나** = **`householdHousingCount === 1` 경로(E-4)** 뿐. 앞단 다주택 특례 경로는 proviso를 소비하지 않음:

| 경로 | 코드 | proviso 소비 | 도달 조건 |
|---|---|---|---|
| 대체주택 §156의2⑤ | 177~212 | ❌ 자체 요건(거주개월·양도시기)으로 판정 | 요건 충족 시 `return` |
| 일시적 2주택 | 215~239 | ❌ 종전주택 보유기간(218)·처분기한(235)만 | `householdHousingCount === 2` |
| 다주택 배제 | 241 | — | `householdHousingCount !== 1` → `return` |
| §154① 본문·단서 (E-4) | 246 `meetsOneHouseHoldingResidence` | ✅ `resolveExemptionProviso` 적용 | **`householdHousingCount === 1`** |

- `resolveExemptionProviso(input)`(`:65~97`) 반환: `"both"`(1호·2호가목·3호 — 각 시한요건 충족 시, 보유+거주 면제) / `"residence_only"`(5호 — 거주만) / `null`. 시한상수 `EXEMPTION_PROVISO_CONST`(`legal-codes/transfer.ts:437~445`).
- **일시적 2주택 경로(215~239)는 거주요건도 §154① 단서도 판정하지 않음** — 보유기간(`previousAcquisitionDate` 기준, `:218`) + 처분기한(`:235`)만. 12억 초과 고가주택 부분과세도 이 경로엔 없음(전액 비과세 반환 `:237`).

### 1-2. UI·API·validation 게이트 (실측 — 3지점 비대칭)

| 지점 | 파일:line | proviso 관련 게이트 |
|---|---|---|
| UI 렌더 | `Step4.tsx:328` | `form.isOneHousehold && primaryKind === "housing"` (주택수 게이트 **없음**) |
| API 조립(④/⑬) | `transfer-tax-api.ts:401` | `form.provisoReason` truthy **하나뿐** (isOneHousehold·주택수 **없음**) |
| validation(⑧) | `transfer-tax-validate.ts:200~212` | provisoReason 값만 — 게이트 **없음** |

→ 세 지점 게이트가 서로 달라, **UI에서 카드를 숨겨도 stale `provisoReason`이 API로 전달**된다(값을 못 바꾸는데 계속 전송). 3중 미러링(mirror-pattern 정책) 필요.

- 일시적 2주택 조립(⑬): `transfer-tax-api.ts:382~391` — `temporaryTwoHouseSpecial && 두 날짜`. UI 토글은 `Step4.tsx:343`에서 `parseInt(householdHousingCount) >= 2`일 때만 렌더.
- Zod: `oneHouseExemptionProviso.reason` 6-enum(`transfer-tax-schema.ts:164~178`), `temporaryTwoHouse` 두 날짜 필수(`sub.ts:28~31`). Route Date 변환 정상(`route.ts:203~210`, `:163~168`).

## 2. Pre-Do 법령 검증 (KoreanLaw 실측 완료, 2026-07-19)

소득세법 시행령 [현행, 시행 2026-07-01, mst=286211] 원문:

- **§154①**: 본문 = 양도일 현재 국내 1주택 + 보유 2년(조정지역 취득 시 거주 2년). 단서 = **1호부터 3호까지는 보유·거주 제한 없음, 5호는 거주 제한 없음**. 각 호 내용이 UI 라벨과 100% 일치(1호 임대주택 거주5년·2호가 공익수용·2호나 해외이주·2호다 국외거주·3호 부득이·5호 조정공고전계약, 4호 삭제).
- **§155①(일시적 2주택)**: *"…이를 1세대1주택으로 보아 **제154조제1항을 적용한다.** 이 경우 **제154조제1항제1호, 같은 항 제2호가목 및 같은 항 제3호**에 해당하는 경우에는 [종전주택 취득 1년 경과 후 신규취득] 요건을 적용하지 않으며…"* → **§154①(단서 포함) 준용**. 명시 인용 호 = **1호·2호가목·3호**.
- **§156의2⑤(대체주택)**: *"…1세대1주택으로 보아 제154조제1항을 적용한다. **이 경우 제154조제1항의 보유기간 및 거주기간의 제한을 받지 않는다.**"* → 조문 자체가 **전면 면제** → §154① 단서 입력 **불필요**(현행 엔진 미소비가 정확).

### 2-A. 세법 결정 항목 — 일시적 2주택에서 인정할 단서 호 범위

§155①이 명시 인용한 **1호·2호가목·3호**만 일시적 2주택 종전주택에 준용된다. 나머지는 양립 불가:
- **2호나목(해외이주)·다목(국외거주)**: "출국일 현재 **1주택** 보유" 전제 → 일시적 2주택(2주택)과 모순.
- **5호(조정공고전계약)**: "계약금 지급일 현재 **무주택**" 전제 → 모순. 또한 5호는 `residence_only`(거주만 면제)인데 일시적 2주택 경로는 애초에 거주요건 미판정 → **효과 없음**.

→ **[결정 확정 · 2026-07-19 사용자] 일시적 2주택 경로에서 보유면제를 인정할 proviso = `reason ∈ {rental_5yr_residence, expropriation, unavoidable}` 이고 `resolveExemptionProviso(input) === "both"`인 경우로 한정.** (엔진 화이트리스트로 처리 — `resolveExemptionProviso`는 나·다목의 "출국일 1주택"을 검증하지 않고 `both`를 반환할 수 있으므로 필수.) 근거: §155① 2문이 §154①**1호·2호가목·3호**만 명시 인용 + 나·다목·5호 양립 불가(2호나·다=출국일 1주택 전제, 5호=무주택 전제·`residence_only`라 거주 미판정 경로서 무효과).

## 3. 현행 동작 인벤토리 (변경 대상 식별)

| 대상 | 현행 | 변경 |
|---|---|---|
| UI 카드 노출 `Step4.tsx:328` | `isOneHousehold && housing` | `provisoGate` 술어 + **mode별 배치**(one_house→②, temp→③ 토글 아래) (Part C) |
| API proviso 조립 `transfer-tax-api.ts:401` | `provisoReason`만 | `effectiveProvisoReason` 게이트 (Part D) |
| validation proviso `transfer-tax-validate.ts:200` | provisoReason 값만 | `effectiveProvisoReason` skip 미러 (Part D) |
| 엔진 일시적 2주택 `transfer-tax-exemption.ts:215~239` | 보유기간·처분기한만 | §154① 단서(both, 화이트리스트) 보유면제 (Part A) |

## 4. 작업 범위

### Part A — 엔진: 일시적 2주택 종전주택 §154① 단서 보유면제

`checkExemption`의 일시적 2주택 분기(`transfer-tax-exemption.ts:215~239`) 보유기간 게이트(`:218~221`)를 완화:

```ts
// 현행
const prevHolding = calculateHoldingPeriod(previousAcquisitionDate, input.transferDate);
if (prevHolding.years < rule.minHoldingYears) {
  return { isExempt: false, isPartialExempt: false };
}

// 변경 (§155①→§154①1·2가·3호 준용, 2-A 화이트리스트)
const provisoRelaxesHolding =
  resolveExemptionProviso(input) === "both" &&
  TEMP_TWO_HOUSE_PROVISO_REASONS.has(input.oneHouseExemptionProviso?.reason ?? "");
const prevHolding = calculateHoldingPeriod(previousAcquisitionDate, input.transferDate);
if (!provisoRelaxesHolding && prevHolding.years < rule.minHoldingYears) {
  return { isExempt: false, isPartialExempt: false };
}
```

- `TEMP_TWO_HOUSE_PROVISO_REASONS` = `new Set(["rental_5yr_residence", "expropriation", "unavoidable"])` — **`legal-codes/transfer.ts`(pure)에 신설**(엔진·`api-helpers` 공유 단일 소스 — 엔진은 lib/calc 역import 금지라 legal-codes에 배치). 근거 §155①·§154①1·2가·3호. **5호(`pre_designation_contract`)는 `resolveExemptionProviso`가 `residence_only` 반환이라 `=== "both"`에서 자동 제외**(Set는 나·다목 차단용 — 주석 명기).
- **처분기한(§155① 고유 요건, `:235~236`)은 유지** — 단서 면제는 §154①"보유·거주"에만 작동, §155① "3년 내 양도"는 별개.
- **거주요건 신규 도입 안 함**(범위 밖·surgical). 일시적 2주택 경로가 원래 거주 미판정 → 5호(residence_only) 무효과 유지. **단 화이트리스트 1호·3호(`rental_5yr_residence`·`unavoidable`)는 `residencePeriodMonths` 의존**(`resolveExemptionProviso :87·:90`) — 거주기간 입력 필드(`Step4.tsx:302`)가 `isOneHousehold && housing`만 게이트하고 **주택수 무관 노출**(실측) → 일시적 2주택서도 수집됨, 침묵실패 없음.
- **exemptReason 라벨 [확정]**: `provisoRelaxesHolding` true면 exemptReason = `"일시적 2주택 비과세 (§154① 단서 " + PROVISO_LABEL[reason] + ")"`(예 "일시적 2주택 비과세 (§154① 단서 2호가 수용)") — `PROVISO_LABEL`(`:48~58`) 재사용. 산출근거 일관성(`feedback_engine_result_display_drift`).
- `resolveExemptionProviso`는 `input.acquisitionDate` 기준이나, 일시적 2주택에서 `acquisitionDate ≡ previousAcquisitionDate`(둘 다 "지금 양도하는 종전주택 취득일", UI 헬퍼 `Step4.tsx:373`) → 취득일 재조달 불필요. **두 필드 입력이 어긋나는 경우는 §5 불변식/validation 논점**.

### Part B — 공유 술어·파생 (single-source, `transfer-tax-api-helpers.ts`)

`isMultiHouseSurchargeSuppressed`와 동일 파일에 신설. **순환없음 실측**: api-helpers → `legal-codes/transfer`(pure)만 import, Step4·API·validate 3소비자 단방향(validate→api-helpers는 기존 `isMultiHouseSurchargeSuppressed`로 이미 성립). 상수 `TEMP_TWO_HOUSE_PROVISO_REASONS`는 `legal-codes/transfer.ts`에서 import(엔진 공유).

**(1) `provisoGate` — 노출 여부 + 모드 단일 파생** (기존 `isOneHouseProvisoApplicable`+별도 `provisoMode` 이중 파생 통합 — I):
```ts
export function provisoGate(args: {
  isOneHousehold: boolean; isHousing: boolean;        // primaryKind === "housing"
  householdHousingCount: string; temporaryTwoHouseSpecial: boolean;
}): { visible: boolean; mode: "one_house" | "temporary_two_house" | null } {
  if (!args.isOneHousehold || !args.isHousing) return { visible: false, mode: null };
  const n = parseInt(args.householdHousingCount, 10);
  if (n === 1) return { visible: true, mode: "one_house" };
  if (n === 2 && args.temporaryTwoHouseSpecial) return { visible: true, mode: "temporary_two_house" };
  return { visible: false, mode: null };
}
```
- 1주택 → one_house. 2주택+일시적특례 → temporary_two_house. 그 외(순수 2주택·대체주택·3주택+) → 숨김. `replacementHouseSpecial` 미포함 — §156의2⑤ 전면면제라 단서 불요(§2 Part 2·§156의2⑤ 근거).

**(2) `effectiveProvisoReason` — reason-level 정규화 단일 소스** (Critical 방어):
```ts
export function effectiveProvisoReason(mode, reason: string): string {
  if (!reason) return "";
  if (mode === null) return ""; // 카드 숨김(순수 다주택·3주택+·비주택·비1세대) — stale reason 미전송(데드락 방지)
  if (mode === "temporary_two_house" && !TEMP_TWO_HOUSE_PROVISO_REASONS.has(reason)) return "";
  return reason;
}
```
- **왜 필요**: 옵션 필터(Part C)는 reason-level(fine)인데 `visible`은 coarse. 1주택서 나·다목·5호 선택 후 일시적 2주택 전환 시 stale 무효 reason이 폼에 잔존 → 옵션 라디오엔 없어 수정 불가한데 API/validation이 coarse `visible=true`라 그대로 소비 → **데드락**(모순F1·개선#1). `effectiveProvisoReason`를 **UI 선택표시·API 조립·validation 3곳이 단일 소비**해 stale 무효 reason을 `""`로 정규화 → clear-onChange·useEffect 불필요(파생이라 트리거 놓침 없음). 엔진 화이트리스트(Part A)는 API 우회 최종 방어.

### Part C — UI: 노출 술어 + mode별 배치 + 옵션 필터

**(1) 노출 술어·모드** — Step4에서 단일 useMemo(store write 금지 — `feedback_useeffect_store_mirror_forbidden`):
```tsx
const proviso = useMemo(() => provisoGate({
  isOneHousehold: form.isOneHousehold, isHousing: primaryKind === "housing",
  householdHousingCount: form.householdHousingCount,
  temporaryTwoHouseSpecial: form.temporaryTwoHouseSpecial,
}), [form.isOneHousehold, primaryKind, form.householdHousingCount, form.temporaryTwoHouseSpecial]);
```
- `isHousing`는 협의 `=== "housing"` 유지(광의 `isHousingLike` 아님) — 엔진 `checkExemption:170`(`propertyType !== "housing"` 조기배제)과 **대칭**. redevelopment_apt+일시적은 엔진이 어차피 비과세 배제하므로 카드 숨김이 정확(오류fork 실측 확인, 모순 아님).

**(2) mode별 배치** — "UI 순서=로직 순서"(제어 토글 → 피제어 카드, 개선#2):
- `mode === "one_house"`(1주택) → **섹션②**(`Step4.tsx:328` 기존 위치).
- `mode === "temporary_two_house"` → **섹션③ 일시적 2주택 토글 바로 아래**(`Step4.tsx:386` 이후). 제어 토글(일시적 2주택 특례, `:351`)이 카드 위에 오도록. (§154① 카드가 섹션②에만 있으면 하단 토글로 상단 카드가 나타나는 순서 역행.)
- 두 위치 조건 배타(`proviso.mode`) → 카드는 항상 1곳만 렌더.

**(3) 옵션 필터** — `ExemptionProvisoSection`에 `mode` prop 신설. 컴포넌트 내부 1줄:
```tsx
const visibleOptions = OPTIONS.filter(o => mode !== "temporary_two_house" || o.value === "" || TEMP_TWO_HOUSE_PROVISO_REASONS.has(o.value));
```
→ temp-two-house면 해당없음 + 1·2가·3호만(나·다목·5호 제거, 입력오류 예방 `project_transfer_input_error_prevention`). `one_house`는 전체 7옵션.
- **선택값 표시는 `effectiveProvisoReason(proviso.mode, form.provisoReason)`로** — stale 무효 reason이 라디오에 orphan 표시되지 않음(Part B-2, 개선#1).
- 엔진 화이트리스트(Part A)는 API 우회 최종 방어로 병행.

### Part D — 14지점 동기화 (게이트 3중 미러링)

기존 필드 재사용이므로 "신규 필드" 대부분 N/A. **게이트 정합**이 핵심 — 3소비자 모두 `effectiveProvisoReason(proviso.mode, reason)` 단일 소스:

- **④ API 조립(`transfer-tax-api.ts:401`)**: `oneHouseExemptionProviso` 조립 게이트를 **`effectiveProvisoReason(mode, form.provisoReason)`가 truthy일 때만**으로 교체(기존 `form.provisoReason` 단독 게이트 대체) → 카드 숨김(mode=null→effective="")·temp-two-house 무효 reason 모두 미전송. **스코프 실측 완료(F)**: `primary=form.assets[0]`(`transfer-tax-api.ts:44`), `householdHousingCount`·`temporaryTwoHouseSpecial`·`isOneHousehold` form 접근, `primaryKind=primary.assetKind` 도출 → 게이트 4입력 전부 스코프 내(Do 미지 요소 없음).
- **⑧ validation(`transfer-tax-validate.ts:200~212`)**: proviso 필수검증을 `effectiveProvisoReason` 기준으로 — effective=""이면 skip(UI 숨김·무효 reason ↔ validate skip mirror). **데드락 차단**(`feedback_validation_sync_8th_point`).
- **⑤ UI 위젯**: Part C. **엔진**: Part A. **⑫⑬⑭(Zod·body spread·Route)**: 기존 `oneHouseExemptionProviso`·`temporaryTwoHouse` 경로 그대로 — 변경 없음(확인만).
- **①②③⑥⑦⑨⑩⑪**: 신규 필드 없음 → N/A(자가 grep 확인).

## 5. UI ↔ 엔진 일치 (불변식)

- **2층 미러(mirror-pattern)**: (coarse) `provisoGate.visible` = 카드 노출 여부 / (fine) `effectiveProvisoReason(mode, reason)` = 실효 reason. **API 조립·validation·UI 선택표시 3곳 모두 `effectiveProvisoReason` 단일 소비** — coarse만 미러하면 옵션 필터로 숨긴 무효 reason이 API/validation에 도달(Critical 데드락). fine 층까지 3소비해야 정합(모순F1·F3).
- **엔진 소비(Part A)와 정합**: UI가 노출하는 경우 = 엔진이 proviso를 소비할 수 있는 경우.
  - 1주택 → 엔진 E-4(`:246`) 소비 ✓
  - 2주택+일시적특례 → 엔진 일시적 2주택 경로(Part A 신규) 소비 ✓
  - 그 외 숨김 → 엔진 미소비(대체주택 전면면제·다주택 배제 `:241`) ✓
- **acquisitionDate ↔ previousAcquisitionDate 입력 어긋남** — **[결정 확정] 현행 유지 + 불변식 주석**: proviso 판정은 `resolveExemptionProviso(input)`(=`input.acquisitionDate`=양도 대상 종전주택 취득일 — §154① 단서 시한의 세법상 기준), 보유기간 게이트는 기존 `previousAcquisitionDate`. 정상 입력 시 두 값 동일(양도 대상=종전주택; UI 헬퍼 `Step4.tsx:373` "지금 양도하는 주택의 취득일"). 불일치 감지 validation 경고는 **범위 밖**(기존 temporaryTwoHouse validation 전무 갭과 함께 후속). 엔진에 불변식 주석 명시.

## 6. 리스크 · 정책

- **⚠️ stale provisoReason 데드락(Critical — 해소됨)**: 1주택서 나·다목·5호 선택 → 일시적 2주택 전환 시 stale 무효 reason이 옵션 필터로 라디오에서 사라져 수정 불가한데 validation(coarse `visible=true`)이 차단 → 데드락. ⇒ **`effectiveProvisoReason` 단일소스 3소비(Part B-2·D)로 해소** — stale 무효 reason을 API/validation/UI 모두 `""`로 정규화. Part A로 일시적 2주택이 proviso를 소비하게 되므로 게이트 필수(순수 다주택·특례 OFF는 mode=null→effective="").
- **⚠️ 회귀(Medium)**: Part A는 일시적 2주택 + proviso(both·화이트리스트) + 보유<2년 케이스의 결과를 **과세→비과세**로 바꾼다. 기존 일시적 2주택 앵커(`__tests__/tax-engine/transfer/` 비과세·exemption 테스트)에 proviso 없는 케이스가 다수 → **결과 불변 확인**(proviso 미선택 시 기존 동작 100% 유지) + 신규 케이스 앵커 추가.
- **범위 밖 기존 갭(언급만, 수정 안 함)**: (a) `provisoPreContractNoHouse` 엔진 미도달(store·UI·validate만 존재, Zod/API/엔진타입 부재) / (b) `expropriation` 사유 날짜 validation 부재 / (c) `temporaryTwoHouse` validation 전무 / (d) 일시적 2주택 종전주택 조정지역 **거주 2년** 미판정. — 본 작업과 독립. 정책 `feedback_no_unfavorable_application_without_legal_basis`·surgical.
- **자동 안분·useEffect 미러링 금지**: 술어 useMemo 파생만.

## 7. Pre-Do 앵커 (검증 우선 — `pre-do-anchor-verification`)

1. **엔진 RED→GREEN(2호가)**: 일시적 2주택(count=2, temporaryTwoHouse 세팅, **`acquisitionDate === previousAcquisitionDate` 동일 세팅** — §5 불변식 고정) + `provisoReason="expropriation"`(취득일<사업인정고시일·수용일+5년내) + 종전주택 보유 1년11개월(2년 미달) + 처분기한 내 → Part A 전 `isExempt:false`(RED), 후 `isExempt:true`(GREEN).
2. **화이트리스트 발동(3호 실증)**: 동일 케이스 + `provisoReason="unavoidable"`(3호, 거주 1년+ 세팅) → 보유면제 발동(GREEN). 1호·3호는 `residencePeriodMonths` 의존이나 거주기간이 일시적 2주택서도 수집됨(`Step4.tsx:302` count 무관 게이트 실측) → 침묵실패 없음 확인.
3. **화이트리스트 제외**: `provisoReason="overseas_migration"`(나목) / `"pre_designation_contract"`(5호, `residence_only`→`==="both"` 미해당) → **보유면제 미발동**(과세 유지). 나·다목·5호 제외 확인.
4. **회귀 불변**: 일시적 2주택 + proviso 미선택 + 보유 2년 미달 → 기존대로 `isExempt:false`.
5. **UI 파생 단위**: `provisoGate` — (1주택→visible·one_house)/(2주택+특례→visible·temporary_two_house)/(2주택 특례OFF→hidden)/(3주택→hidden)/(비1세대→hidden)/(비주택→hidden). `effectiveProvisoReason` — (temp+overseas→"")/(temp+expropriation→expropriation)/(one_house+overseas→overseas)/(**null(카드 숨김)+overseas→""** stale 정규화·데드락 방지).

## 8. 케이스 매트릭스 (전 분기 enumerate)

| # | 주택수 | 일시적특례 | 대체주택특례 | provisoReason | UI카드 | 엔진 proviso 소비 | 비과세 결과 |
|---|---|---|---|---|---|---|---|
| 1 | 1 | - | - | "" | 노출 | E-4, 보유2년 판정 | 보유2년 충족 시 |
| 2 | 1 | - | - | expropriation | 노출 | E-4 both, 보유면제 | ✅ 보유<2년도 |
| 3 | 2 | ON | - | "" | 노출 | 일시적2주택, 보유2년+처분기한 | 충족 시 |
| 4 | 2 | ON | - | expropriation/unavoidable/rental | 노출 | **일시적2주택 both(신규)** | ✅ 보유<2년도(처분기한 내) |
| 5 | 2 | ON | - | overseas/residence/pre_contract | 노출(옵션필터로 **fresh 선택 불가**) | 화이트리스트 제외 → 보유면제 X | stale값(1주택서 선택 후 전환)만 도달 → `effectiveProvisoReason` `""` 정규화(모순F2) |
| 6 | 2 | OFF | - | (any) | **숨김** | 미소비(`:241` 배제) | 과세 |
| 7 | 2 | - | ON | (any) | **숨김** | 대체주택 전면면제(proviso 불요) | 대체주택 요건 시 |
| 8 | 3+ | - | - | (any) | **숨김** | 미소비(`:241`) | 과세 |

## 9. Definition of Done

- [ ] Pre-Do §2 KoreanLaw 검증 완료(§154①·§155①·§156의2⑤ 원문 — 반영됨)
- [ ] Part A: 일시적 2주택 경로 §154① 단서(both·화이트리스트 1·2가·3호) 보유면제 + `TEMP_TWO_HOUSE_PROVISO_REASONS`(`legal-codes/transfer.ts`) 신설, 5호 자동제외 주석, 처분기한 유지, **exemptReason 라벨 부가 확정**(§154① 단서 라벨)
- [ ] Part B: `provisoGate`(visible+mode 단일)·`effectiveProvisoReason`(reason 정규화) 신설(`transfer-tax-api-helpers.ts`, 순환없음 확인)
- [ ] Part C: 노출 술어 useMemo(`provisoGate`) + **mode별 배치**(one_house→섹션②, temporary_two_house→섹션③ 토글 아래) + `ExemptionProvisoSection` `mode` prop(옵션 필터 1·2가·3호) + 선택표시 `effectiveProvisoReason`
- [ ] Part D: API 조립(`:401`)·validation(`:200`) 게이트를 **`effectiveProvisoReason` 단일소스**로 미러, ⑫⑬⑭ 무변경 확인, 나머지 지점 N/A grep
- [ ] Pre-Do 앵커 5종 GREEN(§7: 2호가 RED→GREEN·3호 발동·나목/5호 제외·회귀불변·UI파생) + 케이스 매트릭스 8행 커버
- [ ] 회귀: `npx vitest run __tests__/tax-engine/transfer/` 전체 GREEN(proviso 미선택 동작 불변) + calc/validate 테스트
- [ ] `npx tsc --noEmit` 0 · `eslint` 0
- [ ] E2E: 1주택 카드 노출(섹션②) / 순수 2·3주택 숨김 / **대체주택 특례 숨김** / 일시적 2주택 카드 노출(섹션③) + **나·다목·5호 옵션 부재**(mode 필터 실증 — `proviso-reason-overseas_migration` absent)
- [ ] 브라우저 수동 확인(폼→계산→결과, Network body에서 oneHouseExemptionProviso 전송 게이트 확인)

## 10. 미결 · 범위 밖

- **결정 완료(2026-07-19)**: (2-A) 1·2가·3호 화이트리스트 확정 / (Part C) 옵션 필터(`mode` prop) 확정 / (§5) 현행 유지·불변식 주석 확정.
- **범위 밖(§6 기존 갭)**: provisoPreContractNoHouse 엔진 미도달·expropriation validation·temporaryTwoHouse validation·일시적 2주택 거주2년 미판정 — 별도 과제.
- **대체주택·상속·합가**: §156의2⑤ 전면면제(단서 불요) / §155②④⑤ 는 현행 엔진이 비과세 경로 아닌 중과배제 트랙으로 처리(별도 갭) — 본 작업 미포함.
