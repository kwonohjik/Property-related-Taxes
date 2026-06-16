# NBL 갭 3b — §83의5① 부득이 사유 12종 — 사유별 법정기간 자동산정 + GracePeriodType 12종 확장 + 매매업 단서

> 자동 생성(nbl-gaps-plan 워크플로 planner) — 실제 코드 정독 + KoreanLaw 본문 검증 기반. 마스터: [nbl-remaining-gaps.plan.md](../nbl-remaining-gaps.plan.md)

- **제안 PR**: 단독 PR (PR-D, 대형). 다른 NBL 잔여 갭(§168의11② 수입금액·§168의14② 양도일의제)과 분리. 이유: (1) GracePeriodType union·store·Zod·form-mapper·UI를 12종으로 동시 개편하는 cross-cutting 변경이라 충돌면이 넓다. (2) §168의14② 양도일의제는 동일 시행규칙 §83의5② 조항이나 "양도일을 의제"하는 완전히 다른 산출 경로(meetsPeriodCriteria의 transferDate 대체)라 본 갭(기간 가산)과 로직이 직교한다. (3) unavoidableReasons 채널 통합(enum 정비)은 본 PR 내 포함 — 동일 GracePeriodType 정비 작업이므로 함께 처리해야 드리프트 재발 방지.
- **복잡도**: XL
- **선행(blocker)**: 없음

## Anchor 테스트

### [PRE-DO] §83의5①9호 멸실 5년 자동산정 — 기산일만 입력 시 종료일 = 멸실일+5년 **[Pre-Do]**
- **시나리오**: 농지 도시지역 밖, 취득 2018-01-01·양도 2026-06-01, 자경 1년(2018~2019)만 → baseline 비사업용. 부득이 사유 9호(건축물 멸실)·기산일(멸실일) 2021-06-01만 입력하고 종료일은 미입력. form-mapper의 사유별 자동 종료일 산정(멸실일+5년=2026-06-01)이 직전3년 창 전체를 덮어 grace 가산 → 사업용 전환을 기대. 현행 엔진은 종료일 미입력 시 grace interval이 빈 구간이 되어 gracePeriodDays=0·비사업용 유지(FAIL).
- **기대값**: judgeNonBusinessLand(input).gracePeriodDays > 0 AND isNonBusinessLand === false. 현행은 gracePeriodDays === 0 · isNonBusinessLand === true 로 실패(고정). 추가로 자동산정 헬퍼 단위 anchor: resolveGraceEndDate('demolition', new Date('2021-06-01'), ctx) 의 end 가 정확히 2026-06-01(=2021-06-01 + 5년) 임을 toEqual로 고정.
- **법령근거**: 소득세법 시행규칙 §83의5①9호 (KoreanLaw 본문 검증 2026-06-16): "건축물이 멸실ㆍ철거되거나 무너진 토지 : 당해 건축물이 멸실ㆍ철거되거나 무너진 날부터 5년"

### §83의5① 단서 — 부동산매매업 매매용부동산은 1·2호 배제
- **시나리오**: 기타토지(나대지), nblBusinessIsRealEstateDealer=true, 부득이 사유 1호(건축허가 제한) 기산일 입력. 단서("부동산매매업을 영위하는 자가 취득한 매매용부동산에 대하여는 제1호 및 제2호를 적용하지 아니한다")에 따라 1·2호 grace 가산이 무효화되어야 함.
- **기대값**: 1호 grace 가산 0 (resolveGraceEndDate가 단서 플래그 true·사유 1/2호일 때 null 반환 또는 form-mapper가 해당 항목 skip) → 사업용 전환되지 않음. 동일 입력에서 nblBusinessIsRealEstateDealer=false면 1호 가산 정상 발생(대조).
- **법령근거**: 소득세법 시행규칙 §83의5① 단서 (KoreanLaw 본문): "다만, 부동산매매업(한국표준산업분류에 따른 건물건설업 및 부동산공급업을 말한다)을 영위하는 자가 취득한 매매용부동산에 대하여는 제1호 및 제2호를 적용하지 아니한다."

### §83의5①5호 건설착공 — 취득일+2년 및 착공후 진행기간 양쪽 가산
- **시나리오**: 나대지 취득 후 사업용 건설 착공. 취득일 2020-01-01, 착공일 2020-03-01, 양도 2026-06-01. 5호는 두 기간(취득일부터 2년 + 착공일 이후 건설 진행 중 기간)을 합집합으로 가산.
- **기대값**: 5호 grace interval이 [취득일, 취득일+2년] ∪ [착공일, 건설진행종료일] 두 구간으로 산출됨. 5호는 기산일이 2개(취득일·착공일) 필요 — 둘 다 입력 강제(validation). gracePeriodDays가 두 구간 합집합 일수로 반영.
- **법령근거**: 소득세법 시행규칙 §83의5①5호 (KoreanLaw 본문): "...건설에 착공한 토지 : 당해 토지의 취득일부터 2년 및 착공일 이후 건설이 진행 중인 기간"

### unavoidableReasons 채널 통합 후에도 grace 가산 유지 (회귀)
- **시나리오**: 기존 grace-wiring.test.ts QA-101 경로 — unavoidableReasons 배열(또는 통합 후 nblGracePeriods 12종) 입력 시 engine.ts mergedGracePeriods 병합 → grace 가산 유지. UnavoidableReasonType 6-union을 GracePeriodType 12종으로 통합하더라도 기존 동작이 깨지지 않음.
- **기대값**: judgeNonBusinessLand(input).gracePeriodDays > 0 AND isNonBusinessLand === false (기존 grace-wiring.test.ts 그린 유지). 통합으로 UnavoidableReason 타입 제거 시 engine.ts:96 매핑 경로가 nblGracePeriods 12종으로 일원화돼도 회귀 0.
- **법령근거**: 소득세법 시행령 §168의14①·시행규칙 §83의5① (grace 병합 경로 보존)

---

## 1. 법령 근거 (KoreanLaw get_law_text 본문 검증, 2026-06-16)

### 1.1 위임 체인 (정확한 조문 — 현행 라벨 드리프트 발견)
- **소득세법 §104조의3②** → **시행령 §168조의14①** (4개 호) → **§168조의14①4호**가 "재정경제부령으로 정하는 부득이한 사유·기간"을 위임 → **시행규칙 §83조의5①** (12개 호).
- 즉 **세부 12종 사유별 기간의 정본은 시행규칙 §83의5①** 이다. 시행령 §168의14①은 4호만 가진 위임 골격(1호 사용금지/제한, 2호 보호구역, 3호 상속, 4호 재정경제부령 위임).
- **드리프트 정정 필요**: 현행 UI(GracePeriodSection.tsx:57·59)·legal-codes(transfer.ts:58 `UNAVOIDABLE_PERIOD: "시행령 §168조의14 ①"`)는 "§168의14①"만 인용. 12종 라벨/기간은 **시행규칙 §83의5①**이 정본이므로 결과뷰·UI legalBasis를 "소득세법 시행규칙 §83의5① N호"로 정정(이중 인용: 시행령 §168의14①4호 + 시행규칙 §83의5①N호).

### 1.2 §83의5① 12호 — 기산점·길이 매핑 (본문 축자)
| 호 | 사유 | 기산점 | 길이 |
|---|---|---|---|
| 1 | 건축허가 제한 (인가·허가·면허 신청 후 §건축법18·행정지도) | (기간형) 건축허가 제한 개시일 | 건축허가가 제한된 기간 (개시·종료 양 입력) |
| 2 | 착공 제한 (건축자재 수급 행정지도) | (기간형) 착공 제한 개시일 | 착공이 제한된 기간 (개시·종료 양 입력) |
| 3 | 진입도로(사도/불특정다수 도로) | (기간형) 도로 이용 개시일 | 사도·도로로 이용되는 기간 (개시·종료 양 입력) |
| 4 | 공공공지 제공 | 착공일 | 착공일~공공공지 제공 종료일 (개시=착공일·종료 입력) |
| 5 | 건설 착공 (나대지 취득 후 사업용 건설) | **2개 기산일**: 취득일 + 착공일 | (취득일+2년) ∪ (착공일~건설진행종료일) |
| 6 | 저당권 실행/청산 분배 취득 | 취득일 | 취득일 + 2년 |
| 7 | 소유권 소송 계속 중 | (기간형) 소송 계속 개시일 | 소송 계속·사용금지 기간 (개시·종료 양 입력) |
| 8 | 도시개발(환지방식) 구획 사실상 완료·건축가능 | 건축가능일 | 건축가능일 + 2년 |
| 9 | 건축물 멸실·철거·붕괴 | 멸실·철거·붕괴일 | **멸실일 + 5년** |
| 10 | 2년 이상 사업 후 휴·폐업·이전 | 휴·폐업·이전일 | 휴·폐업·이전일 + 2년 |
| 11 | 천재지변 등으로 황지화(재촌·자경 농지) | 사유발생일 | 사유발생일 + 2년 |
| 12 | 1~11호 외 정당한 사유(도시계획 변경 등) | (기간형) 사유발생 개시일 | 당해 사유가 발생한 기간 (개시·종료 양 입력) |

- **단서**: 부동산매매업(건물건설업·부동산공급업) 영위자의 **매매용부동산**은 **1호·2호 적용 배제**.
- **분류**: 길이가 법정 고정(N년)인 호 = {4:종료별도, 5:취득+2년/착공진행, 6:+2년, 8:+2년, 9:+5년, 10:+2년, 11:+2년}. 길이가 "사유 존속 기간"인 이벤트경계 호 = {1,2,3,7,12} (개시·종료 양 입력). 4호는 혼합(개시=착공일·종료=제공종료일 입력).

### 1.3 §83의5②(양도일 의제) — 본 갭 OUT
§83의5②(한국자산관리공사 위임·신문공고 매각 → 매각공고일을 양도일로 의제)는 grace 가산이 아니라 transferDate 의제 경로 → **분리 후속 갭(§168의14②양도일의제)**. 본 PR 미포함.

---

## 2. Scope

### IN
1. 신규 `grace-reason-period.ts` — 12호별 `{기산점종류, 길이규칙, 단서적용여부}` 매핑 + `resolveGraceEndDate(reason, anchorDates, ctx)` 헬퍼.
2. `GracePeriodType` union을 12종으로 확장(현행 7종 → 12종) + 사유별 필수 기산일 필드.
3. form-mapper에서 사유유형별 종료일 자동산정(기산일 명시 입력 + 길이 법정 자동). **자동 안분 fallback 아님** — 기산일은 사용자 입력 강제, 길이만 법정 자동.
4. §83의5① 단서 플래그 `nblBusinessIsRealEstateDealer` (1·2호 배제).
5. UI GracePeriodSection 12종 라벨 + 사유별 기산일 입력 + 자동 종료일 표시(read-only).
6. `unavoidableReasons` 채널을 §83의5로 통합(`UnavoidableReasonType` 6-union 제거·engine.ts 병합 경로 일원화).
7. 14 동기화 지점 전수.
8. anchor 5건(Pre-Do 1 + 4).

### OUT (분리 후속)
- §83의5②/§168의14② 양도일 의제(별도 산출 경로).
- §83의5③/④ (1의2호 재촌·자경 8년, 5호 부득이사유 토지 — 무조건 의제 §168의14③ 영역, 이미 부분 구현).
- §83의5⑤⑥ 별지 제92호서식 신청·행정정보 공동이용(신고 절차).
- 5호 "건설 중단 정당사유 기간 포함"의 중단기간 세부 입력(1차는 착공일~양도일 단순 진행기간으로 처리, 정밀화는 후속). **계획서에 "확인 필요" 명시**: 5호 "건설진행종료일"을 사용자 입력으로 받을지 양도일까지 진행 가정할지는 Do 진입 anchor로 확정.

---

## 3. 데이터 모델 변경 (정확한 필드명·타입·위치)

### 3.1 엔진 타입 — `lib/tax-engine/non-business-land/types.ts:68-90`
```
// 현행 (line 68-75) GracePeriodType 7-union → 12종으로 교체
export type GraceReasonCode =
  | "building_permit_restricted"   // 1호
  | "construction_start_restricted"// 2호
  | "access_road"                  // 3호
  | "public_open_space"            // 4호
  | "construction_in_progress"     // 5호
  | "mortgage_or_liquidation"      // 6호
  | "ownership_litigation"         // 7호
  | "urban_dev_buildable"          // 8호
  | "demolition"                   // 9호
  | "business_closure_relocation"  // 10호
  | "natural_disaster_wasteland"   // 11호
  | "other_justifiable";           // 12호
// 하위호환: 기존 GracePeriodType는 deprecated alias 또는 제거(드리프트 방지 위해 제거 권장).
```
- `UnavoidableReasonType`(line 77-83) **제거**, `UnavoidableReason` interface(line 85-90) **제거** — §83의5로 통합. `NonBusinessLandInput.unavoidableReasons?`(line 319) **제거**.
- `GracePeriod` interface(line 98-102) 확장:
```
export interface GracePeriod {
  reasonCode: GraceReasonCode;     // type → reasonCode 리네임
  startDate: Date;                 // 기산일(자동산정 입력) — 5호는 취득일, 보조 secondaryDate=착공일
  endDate: Date;                   // 자동산정 또는 이벤트경계 종료일
  secondaryStartDate?: Date;       // 5호 착공일 (취득+2년 외 두번째 구간 시작)
  secondaryEndDate?: Date;         // 5호 건설진행종료일(미입력 시 양도일 — Do anchor로 확정)
  isRealEstateDealerMatter?: boolean; // 단서 — 1·2호 배제 게이트(자산 레벨 플래그 전파)
}
```

### 3.2 grace-reason-period.ts (신규) — 매핑 + 산정 헬퍼
```
export interface GraceReasonSpec {
  code: GraceReasonCode;
  /** "fixed_from_anchor"(기산일+N년) | "event_window"(개시·종료 입력) | "compound_5"(5호 전용) | "anchor_to_input_end"(4호) */
  lengthKind: "fixed_from_anchor" | "event_window" | "compound_5" | "anchor_to_input_end";
  /** fixed_from_anchor·compound_5 의 N년 */
  fixedYears?: number;            // 6/8/10/11=2, 9=5
  /** 단서(1·2호) 적용 호 여부 */
  excludedForDealer: boolean;     // 1·2호 true
  label: string;
  legalBasis: string;            // "소득세법 시행규칙 §83의5① N호"
}
export const GRACE_REASON_SPECS: Record<GraceReasonCode, GraceReasonSpec> = { ... };
/** 기산일·보조일 + ctx로 grace 구간 배열 산출(단서·매매업 플래그 반영). 부적격 시 [] */
export function resolveGraceIntervals(
  reasonCode: GraceReasonCode,
  anchorDate: Date | undefined,
  endDateInput: Date | undefined,
  secondaryDate: Date | undefined,
  ctx: { transferDate: Date; isRealEstateDealerMatter: boolean },
): DateInterval[]
```
- 9호 fixed: `addYears(anchorDate, 5)` → `[anchorDate, end]`.
- 6/8/10/11호: `addYears(anchorDate, 2)`.
- 5호 compound: `[acquisitionDate, addYears(acq,2)] ∪ [착공일, 건설진행종료일||transferDate]`.
- 1/2/3/7/12호 event_window: `[anchorDate(개시), endDateInput(종료)]`. 단서: 1·2호 & isRealEstateDealerMatter → `[]`.
- 4호 anchor_to_input_end: `[착공일, 제공종료일 입력]`.

### 3.3 store 타입 — `lib/stores/calc-wizard-asset-nbl.ts:26-38`
```
export interface GracePeriodInput {
  reasonCode: GraceReasonCode (문자열 12-union 인라인);  // 현행 type 7-union 교체
  anchorDate: string;          // 기산일 (모든 호 공통 — 5호=취득일 자동 미러X, 명시)
  endDate: string;             // event_window/4호용 종료일. fixed 호는 read-only 자동표시(저장은 자동값 또는 빈값)
  secondaryDate?: string;      // 5호 착공일
  secondaryEndDate?: string;   // 5호 건설진행종료일(선택)
  description: string;
}
```
- `NBL_DEFAULTS`(line 209) 의 `nblGracePeriods: [] as GracePeriodInput[]` 유지(타입 변경만).
- 신규 자산-레벨 단서 플래그: `NBL_DEFAULTS`에 `nblBusinessIsRealEstateDealer: false` 추가(prefix `nbl` → ④⑬ 자동 운반).

### 3.4 AssetForm — `lib/stores/calc-wizard-asset.ts:499`
`nblGracePeriods: GracePeriodInput[]`(타입 자동 추종) + 신규 `nblBusinessIsRealEstateDealer: boolean` 필드 선언 추가(NBL 블록 line 498 부근).

---

## 4. 14 동기화 지점 — 전수 enumerate (NBL prefix-pick ④⑬ 자동)

- **① 폼 상태(AssetForm)** — `lib/stores/calc-wizard-asset.ts:499` `GracePeriodInput` 타입 12종화 + 신규 `nblBusinessIsRealEstateDealer: boolean` 선언.
- **② initial(factory)** — `lib/stores/calc-wizard-asset-factory.ts:226` `nblGracePeriods: []` 유지 + 신규 `nblBusinessIsRealEstateDealer: false` 추가. `calc-wizard-asset-nbl.ts:209` `NBL_DEFAULTS`에도 동일 추가(spread 단일소스).
- **③ normalize** — `migrateAsset`(calc-wizard-asset-factory.ts) 에 sessionStorage 복원 보정: 구 `type` 7-union → `reasonCode` 매핑(예: `unavoidable`→`other_justifiable` 또는 drop·`legal_restriction`→`building_permit_restricted` 등 best-effort), 구 `startDate`→`anchorDate` 리네임, `nblBusinessIsRealEstateDealer === undefined → false`. **구 데이터 손실 방지 best-effort 매핑 표 명시**.
- **④ API 변환(buildNonBusinessLandRaw)** — `lib/calc/non-business-land-request.ts:64` prefix-pick(`k.startsWith('nbl')`)이 `nblGracePeriods`·`nblBusinessIsRealEstateDealer` 자동 운반 → **코드 무변경 (자동)**.
- **⑤ UI 위젯** — `components/calc/transfer/nbl/GracePeriodSection.tsx` 전면 개편(12종 라벨·사유별 기산일·자동 종료일). `NblSectionContainer.tsx:155-171` "5. 공통 지원 필드"에 단서 토글(ToggleCard) 추가(매매업 매매용부동산).
- **⑥ 사이드바 합계** — 해당 없음(NBL 판정은 세액 산식 사이드바 추정에 미반영, result 도착 후 NonBusinessLandResultCard로만 표시). **변경 없음**.
- **⑦ 결과 카드** — `components/calc/NonBusinessLandResultCard.tsx:80-85` "유예기간 가산" 행 유지. 추가로 적용 법령 배지(line 130-141)에 §83의5① 자동 포함(엔진 appliedLawArticles). 엔진 form-mapper/grace-period가 사유별 legalBasis를 judgmentSteps에 주입(GraceReasonSpec.legalBasis) → 타임라인(line 104-114)에서 표시.
- **⑧ validation** — `lib/calc/transfer-tax-validate-asset.ts:437-453` NBL 토글 블록에 grace 검증 추가: `nblUseDetailedJudgment` ON 이고 `nblGracePeriods` 항목이 있으면 각 항목 (a) `anchorDate` 필수, (b) event_window/4호 호는 `endDate` 필수, (c) 5호는 `secondaryDate`(착공일) 필수. **API/UI fallback 없음 → validate 동일 명시 차단**(자동 안분 fallback 금지).
- **⑨ Zod enum 메인** — 해당 없음(NBL raw는 별도 입력객체 ⑫). **변경 없음** (단 `nonBusinessLandRaw`는 이미 `transfer-tax-schema.ts:136`에서 optional 연결됨).
- **⑩ Zod enum 컴패니언+addPropertyRefines** — companion 자산은 NBL raw를 전송하지 않음(primary만). **변경 없음**. (companionAssetSchema는 `isNonBusinessLand: boolean`만 보유 — 정밀판정 raw 없음, 현행 유지).
- **⑪ 자산-수준 acquisitionDate fallback** — `buildNblEngineInput`(non-business-land-request.ts:37) 이미 `raw.acquisitionDate` toDate 변환. grace 기산일은 별도 `anchorDate`라 acquisitionDate fallback 불필요. **변경 없음** (단 5호 취득일 기산은 form-mapper가 `context.acquisitionDate` 사용 — 매핑 시 명시).
- **⑫ Zod 입력객체 정의(transfer-tax-schema-sub.ts)** — **명시 추가 필수(TS 미감지 침묵 strip)**:
  - `nblGracePeriodRawSchema`(line 52-57) 재정의: `{ reasonCode: z.string(), anchorDate: z.string(), endDate: z.string().optional(), secondaryDate: z.string().optional(), secondaryEndDate: z.string().optional(), description: z.string().optional() }` (raw는 z.string — route toOptionalDate 변환).
  - `nonBusinessLandRawSchema`(line 73-144)에 `nblBusinessIsRealEstateDealer: z.boolean().optional()` 추가.
- **⑬ callTransferTaxAPI body spread** — `buildNonBusinessLandRaw`의 prefix-pick으로 `nblGracePeriods`·`nblBusinessIsRealEstateDealer` 자동 포함 → **자동 (코드 무변경)**. (transfer-tax-api.ts:467·multi-transfer-tax-api.ts:139의 `nonBusinessLandRaw` spread 그대로).
- **⑭ Route handler 엔진 input 매핑** — `app/api/calc/transfer/route.ts:213`·`multi/route.ts:145` `buildNblEngineInput(raw)` 호출 유지. 내부 `mapAssetToNblInput`(form-mapper.ts:72-80)이 grace raw → `GracePeriod` 변환 시 **사유별 종료일 자동산정(resolveGraceIntervals 호출)**으로 교체 → 여기가 핵심 로직 삽입점. Date 변환은 `context.parseDate`(toOptionalDate) 경유.

---

## 5. 엔진 로직 (함수명·산식·삽입 위치)

### 5.1 신규 grace-reason-period.ts
- `GRACE_REASON_SPECS` 12종 정적 상수.
- `resolveGraceIntervals(reasonCode, anchorDate, endDateInput, secondaryDate, ctx)` → `DateInterval[]` (3.2 참조). date-fns `addYears` 사용(이미 dep). 부적격(기산일 없음·단서 배제)이면 `[]`.

### 5.2 form-mapper.ts:72-80 교체 (핵심)
현행:
```
const gracePeriods: GracePeriod[] = rawGrace.flatMap((p) => {
  const s = parseDate(p.startDate); const e = parseDate(p.endDate);
  if (!s || !e) return [];
  return [{ type: p.type as GracePeriodType, startDate: s, endDate: e }];
});
```
변경:
```
const dealerMatter = asBool(asset.nblBusinessIsRealEstateDealer);
const gracePeriods: GracePeriod[] = rawGrace.flatMap((p) => {
  const intervals = resolveGraceIntervals(
    p.reasonCode as GraceReasonCode,
    parseDate(p.anchorDate),
    parseDate(p.endDate),
    parseDate(p.secondaryDate),
    { transferDate, isRealEstateDealerMatter: dealerMatter },
  );
  return intervals.map((iv) => ({ reasonCode: p.reasonCode, startDate: iv.start, endDate: iv.end, isRealEstateDealerMatter: dealerMatter }));
});
```
- **5호 취득일 기산**: resolveGraceIntervals 내부에서 `ctx.acquisitionDate` 필요 → ctx에 acquisitionDate 추가 전달(form-mapper에 이미 `acquisitionDate` 보유). secondaryDate=착공일.

### 5.3 grace-period.ts (calculateGraceDaysInWindow) — line 28
`p.startDate/p.endDate` → 그대로 사용(인터페이스 필드명 `startDate/endDate` 유지). `mergeOverlappingPeriods`가 5호 두 구간 합집합 처리(이미 구현). **로직 변경 없음** (단 GracePeriod `type`→`reasonCode` 리네임에 따른 컴파일 추종만).

### 5.4 engine.ts:93-102 — unavoidableReasons 병합 제거
현행 `mergedGracePeriods = [...input.gracePeriods, ...(input.unavoidableReasons??).map(...)]` → `unavoidableReasons` 제거되므로 `const mergedGracePeriods = input.gracePeriods;` 로 단순화(또는 spread 유지). **기존 grace-wiring.test.ts QA-101 회귀**: unavoidableReasons 테스트를 nblGracePeriods 경로로 재작성(anchor 5번).

### 5.5 legal-codes/transfer.ts
- `NBL.UNAVOIDABLE_PERIOD`(line 58) 라벨을 `"소득세법 시행규칙 §83의5① (영 §168의14①4호)"` 로 정정.
- `NBL.UNAVOIDABLE`(line 19) `"시행령 §168조의7"` 은 사실상 지목판정 조문 — 본 갭과 무관(혼동 주의, grep로 분리 확인). **수정 안 함**.

---

## 6. UI 변경

### 6.1 GracePeriodSection.tsx 전면 개편
- `GRACE_TYPE_OPTIONS`(line 16-24) 를 12종으로 교체(label = §83의5① 호별 정식 문구 축약). value = GraceReasonCode.
- 각 항목: 사유 Select(12종) → 사유별 조건부 입력:
  - **fixed_from_anchor(6/8/9/10/11호)**: 기산일 DateInput 1개 + 자동 종료일 read-only 표시("멸실일 + 5년 = YYYY-MM-DD"). 종료일은 엔진 자동산정이므로 입력란 미노출(또는 disabled 표시).
  - **event_window(1/2/3/7/12호)**: 개시일·종료일 DateInput 2개.
  - **4호**: 착공일·제공종료일 2개.
  - **5호**: 취득일 안내(자산 취득일 자동 사용)·착공일 DateInput + 선택적 건설진행종료일.
- 종료일 자동 표시는 `useMemo`로 `resolveGraceIntervals` import 후 클라이언트 미리보기(엔진 단일소스 — UI 자체 산식 재구현 금지, 헬퍼 import). DateInput·SectionHeader·FieldCard 사용. SelectTrigger 명시 라벨.
- legalBasis 배지: `LawArticleModal legalBasis="소득세법 시행규칙 §83의5①"`.

### 6.2 NblSectionContainer.tsx — 단서 토글
- "5. 공통 지원 필드"(line 155-171) 또는 "6. 부득이한 사유" 위에 `ToggleCard`(tone=amber, "부동산매매업 매매용부동산") 추가 → `nblBusinessIsRealEstateDealer`. ON 시 "1·2호(건축허가·착공 제한)는 가산되지 않습니다" 안내.

### 6.3 NonBusinessLandResultCard.tsx
- "유예기간 가산" 행(line 80-85) 유지. judgmentSteps 타임라인에 사유별 §83의5①N호 legalBasis 자동 표시(엔진 주입). "원" 미표기·내부 id 미노출 정책 준수.

---

## 7. Edge case / Risk

1. **드리프트 재발 위험(★)**: 현행 7-union GracePeriodType이 store·engine·UI·Zod 4곳에 흩어짐. 12종 교체 시 한 곳 누락하면 침묵 strip. ⑫ Zod(reasonCode 검증)·⑤ UI label·③ normalize 매핑을 grep `reasonCode`로 자가점검.
2. **5호 건설진행종료일 미정(확인 필요)**: 본문 "착공일 이후 건설이 진행 중인 기간(중단기간 포함)" — 종료일을 사용자 입력으로 받을지/양도일까지 가정할지 Do 진입 anchor로 확정. 1차는 입력 우선·미입력 시 양도일 fallback(단, 자동 안분 fallback 금지 정책 — "건설 진행 중"은 양도시점까지 진행 가정이 법문 부합하므로 fallback 아닌 법정 해석으로 허용. 계획서 명시).
3. **단서 적용 범위**: 단서는 1·2호만 배제 — 3~12호는 매매업이어도 가산. resolveGraceIntervals가 reasonCode별 분기로 정확 처리(전체 배제 오적용 금지).
4. **sessionStorage 구 데이터(③)**: 구 7-union(`inheritance/legal_restriction/sale_contract/construction/unavoidable/preparation/land_replotting`)·구 `startDate/endDate` 필드 → 신 reasonCode/anchorDate 매핑 best-effort. 매핑 불가 사유는 `other_justifiable`(12호 event_window)로 fallback + 구 startDate→anchorDate, endDate 유지(데이터 손실 0). 매핑표 normalize에 명시.
5. **co-ownership 적용 순서**: grace 가산은 지목별 judge 내부(meetsPeriodCriteria 6번째 인자) → applyCoOwnershipRatio는 그 뒤(engine.ts:178-182). grace가 지분 적용 전 기간기준에 반영되는지 anchor로 확인(현행 PR#224 결선 경로 유지).
6. **9호 numeric 영향(★ Pre-Do)**: 멸실 5년을 잘못(과소)입력하면 직전3년 창 미충족 → isNonBusinessLand 뒤집힘. Pre-Do anchor가 정확 5년 자동산정으로 사업용 전환을 고정 → 길이 오류 시 즉시 적발.
7. **회귀**: grace-wiring.test.ts·qa-integration.test.ts(QA-101)의 unavoidableReasons 경로가 통합으로 깨짐 → 동일 의미 nblGracePeriods 경로로 재작성(삭제 아닌 변환). `npx vitest run __tests__/tax-engine/non-business-land/` 전수 통과 확인.
8. **legal-codes 인용 정확성**: §168조의7(NBL.UNAVOIDABLE)은 지목판정 조문 — §83의5 부득이사유와 혼동 금지(grep `UNAVOIDABLE`로 두 상수 분리 확인).

---

## 8. Pre-Do anchor 우선 실행 (Do 진입 전)
anchorTests[0] (isPreDo)을 먼저 작성·실행 → 현행 엔진이 종료일 미입력 시 grace 0·비사업용 유지(FAIL)임을 고정 → resolveGraceEndDate 단위 anchor(2021-06-01+5년=2026-06-01)로 산정 정확성 별도 고정 → 디자인 환류 후 Do.

---

## 🔍 R1 자가검토 정정 (2026-06-16, plan-design-self-review-loop · 실측 검증)

> 7-에이전트 검토(인용 grep/Read 실측) 결과. 정정은 본 절을 우선(본문 인용과 충돌 시 본 절 기준).

| 우선 | 카테고리 | 정정 |
|---|---|---|
| **Critical** | 오류 | **GracePeriodInput 변형 금지(실측)**: 정의 **2곳**(store calc-wizard-asset-nbl.ts:26 + 엔진 form-mapper-helpers.ts:39). **store GracePeriodInput[]은 3곳 사용** — `nblPastureLivestockPeriods:182`·`nblVillaUsePeriods:186`·`nblGracePeriods:209`. (통합 리뷰어의 "pasture/villa는 NblBusinessUsePeriod" 주장은 **오류**; :147 nblBusinessUsePeriods만 해당.) → GracePeriodInput을 12-union으로 변형하면 pasture/villa 오염. **신규 `NblGracePeriodInput`(reasonCode 12종) 도입 + nblGracePeriods만 교체**, pasture/villa는 기존 유지. helpers:39도 동일 신규 타입. grep `GracePeriodInput` 전수. |
| High | 오류 | anchor 1 함수명: `resolveGraceEndDate` **미정의**(§3.2/§5.1은 `resolveGraceIntervals`만). anchor를 `resolveGraceIntervals('demolition',anchor,undefined,undefined,ctx)[0].end`로 정정 또는 `resolveGraceEndDate` 헬퍼 명시 추가(단일 명명). |
| High | 누락 | 회귀: grace raw `type` 필드 사용 **nbl-detailed-cases.test.ts:25·nbl-raw-to-engine-input.test.ts:6** 추가(QA-101=qa-integration.test.ts:487, grace-wiring.test.ts:52는 별개). §7.7. grep `nblGracePeriods.*type:` __tests__/. |
| High | 누락 | **시행령 §168의14①1~3호**(법령 사용금지·보호구역·상속) 독립 grace 사유 — 시행규칙 §83의5① 12호와 **별개**. 12-union 전면교체 시 소실 위험 → 보존 reasonCode 명시. §83의5①1호(건축허가 제한)≠§168의14①1호(법령 사용금지) 구분. |
| Medium | 오류 | normalize 매핑: `legal_restriction`→`building_permit_restricted`(1호)는 단서(1·2호 배제) 오적용 위험 → **`other_justifiable`(12호, 단서 무관)로 매핑**. |
| Medium | 모순 | §5.2 현행 스니펫: 실제 form-mapper.ts:73은 `rawGrace.length>0 ? ... : []` 삼항 + 필드명 `startDate/endDate`. 스니펫 정정. |
| Medium | 누락 | 5호 2구간 분해 시 secondaryStartDate/secondaryEndDate **불필요** → GracePeriod interface는 reasonCode/startDate/endDate/isRealEstateDealerMatter만. §3.2↔§5.2 통일. |
| Medium | 누락 | `resolveGraceIntervals` ctx에 **acquisitionDate 추가**(5호 취득일 기산). form-mapper context.acquisitionDate(:37) 전달. §5.1 시그니처 정정. |
| Medium | UI누락 | §6.1: string→Date 변환(toOptionalDate) + 자동종료일 read-only testid `nbl-grace-auto-end-{idx}`. |
| Low | 개선 | 단서 토글 배치: **GracePeriodSection 직전(6번 섹션 상단)**. "5번 공통필드"는 도시편입·지분 영역 — 의미 불일치. |
| Low | 개선 | sessionStorage: 구 데이터 전부 `other_justifiable`(event_window, anchorDate=구startDate, endDate=구endDate)로 일원화 → 손실0(fixed 호 매핑은 endDate 무시 위험). |

---

## ✅ Do 구현 완료 (2026-06-17, PR-D)

> Pre-Do anchor 우선(resolveGraceIntervals 9건) → 엔진 → 14지점 → UI. KoreanLaw 본문 재검증 후 구현. tsc 0 · 전체 vitest 8506 passed · ESLint 0.

### KoreanLaw 본문 재검증
`get_law_text` MST 286211 §168조의14①(1~3호 event_window·②경매/공매 양도일의제 scope OUT) · MST 286379 §83조의5①(12호: 1·2·3·7·12호 event_window·4호 착공~제공종료·5호 취득+2년∪착공진행·6/8/10/11호 +2년·9호 +5년·단서 1·2호 배제).

### 설계 결정 (R1 Critical 반영)
- **store `GracePeriodInput` 변형 금지**(pasture·villa 공유) → 신규 **`NblGracePeriodInput`**(reasonCode 15종) 도입, nblGracePeriods만 교체.
- `GraceReasonCode` = §168의14①(3) + §83의5①(12) = **15종**(R1 High: §168의14①1-3호 보존).
- `unavoidableReasons` 채널 **제거**(UI/store wiring 0·engine-only 확인) → gracePeriods 단일 채널.
- 엔진 `GracePeriod.type`(write-only) → `reasonCode`.

### 엔진
- `grace-reason-period.ts`(신규): `GRACE_REASON_SPECS`(15) + `resolveGraceIntervals(reasonCode, anchor, endInput, secondary, ctx)`. 6호 취득일 자동(anchorFromAcquisition)·5호 compound([취득,취득+2년]∪[착공,종료||양도일]).
- `form-mapper.ts`: grace 매핑 → resolveGraceIntervals(종료일 자동산정). isRealEstateDealerMatter 전파.
- `engine.ts`: unavoidableReasons 병합 제거.
- `types.ts`: GraceReasonCode·GracePeriod.reasonCode. GracePeriodType·UnavoidableReason·unavoidableReasons 제거.
- `legal-codes`: UNAVOIDABLE_PERIOD 라벨 §83의5① 병기.

### 14 동기화 지점
- ① store NblGracePeriodInput + nblBusinessIsRealEstateDealer · ② factory·NBL_DEFAULTS · ③ migrateAsset(구 7-union→other_justifiable, 손실0) · ④⑬ prefix-pick 자동 · ⑤ GracePeriodSection 전면개편(15종·사유별 조건부·자동종료 미리보기·단서 토글, transferDate prop) · ⑦ 결과카드 legalBasis 자동(엔진 주입) · ⑧ validate(사유별 필수 anchorDate/endDate/착공일) · ⑫ Zod nblGracePeriodRawSchema 재정의+단서 · ⑨⑩⑪⑭ 자동/무관.

### anchor
- `grace-reason-period.test.ts` 9건(9호+5년·6호 취득일·8호·event_window·5호 compound·단서)
- `nbl-grace-auto-period.test.ts` 4건(end-to-end raw→engine→judge: 기산일만→종료일 자동→사업용 전환·단서 배제)
- `nbl-grace-section-render.test.tsx` 6건(⑤ UI)
- 회귀 재정렬: grace-wiring·qa-integration(QA-101)·integration·transfer-tax-nbl-wiring·nbl-detailed-cases·nbl-raw-to-engine-input

### scope OUT (후속)
§83의5②/§168의14② 양도일 의제(경매·공매·신문공고 — transferDate 의제 별도 경로)·§83의5⑤⑥ 별지 제92호서식 신청·5호 건설중단 세부 입력.
