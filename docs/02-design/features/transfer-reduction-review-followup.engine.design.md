# transfer-reduction-review-followup — 엔진 설계

> 계획서: `docs/00-pm/transfer-reduction-review-followup.plan.md` (F-1~F-6)
> 본 문서는 엔진·검증 측(F-1·F-2·F-3·F-5·F-6)을 다룬다. UI 측(F-4·F-1 메시지)은
> `transfer-reduction-review-followup.ui.design.md`.
> 인용은 master `9f21011e` 기준 실측. 착수 시 라인 재확인.

## F-1 — 하이브리드 4조문 기준시가 validate (P1)

### 케이스 인벤토리

| # | 조문 | 분기 | 5년 | 기준시가 입력 | 기대 |
|---|---|---|---|---|---|
| C1 | §99의2 | new_or_unsold | 초과 | acq·5Y 미입력 | 차단 (취득시 → 5년시점 순) |
| C2 | §99의2 | self_built | 초과 | 입력 | 통과 |
| C3 | §99의2 | existing_one_house | 이내 | 미입력 | 통과 (세액감면 경로) |
| C4 | §98의3 | — | 초과 | acq만 입력 | 차단 (5년시점) |
| C5 | §98의3 | — | 이내 | 미입력 | 통과 |
| C6 | §98의5 | — | 초과 | 미입력 | 차단 |
| C7 | §98의6 | seller_rented(1호) | 초과 | 미입력 | 차단 |
| C8 | §98의6 | buyer_rented(2호) | 초과 | 미입력 | 차단 (2호=차감 전용, 동일) |
| C9 | §98의6 | seller_rented | 이내 | 미입력 | 통과 |
| C10 | 4조문 공통 | — | 정확 5년차(당일) | 미입력 | 통과 (`isWithin5YearsCheck` 당일 포함 — §98의7 M4-5 동치) |

### 시그니처 (validate-reductions 내부 헬퍼)

```ts
/** 5년 초과 양도 시 안분용 기준시가 2종(취득시·5년시점) 필수 — 하이브리드 4조문 공용 (F-1).
 *  ⚠ §99의3·§99 무조건 필수와 달리 반드시 5년 분기 조건부 (5년 내=세액감면, 기준시가 불요). */
function failIfStdPriceMissingOver5Y(
  fail: (message: string) => ValidationIssue,
  asset: AssetForm,
  form: TransferFormData,
  stdAcq: string | undefined,   // 폼 string ("1,000,000" 콤마 포맷)
  std5Y: string | undefined,
  articleLabel: string,         // "§99의2" 등 — 메시지 prefix
): ValidationIssue | null;
```

- 5년 판정: `!asset.acquisitionDate || !form.transferDate` 이면 **null 통과** (낙관 — 일자 자체는
  별도 step0 검증 영역, §98의7 기구현과 동일).
- 판정식: `!isWithin5YearsCheck(new Date(asset.acquisitionDate), new Date(form.transferDate))`
  (기존 :173 §98의7 블록과 동일 — 헬퍼 추출 시 §98의7 블록도 헬퍼로 교체해 단일화).
- 메시지: `"{articleLabel} 적용: 취득 후 5년 경과 양도는 취득시 기준시가를 입력하세요 (5년 발생분
  안분 — 미입력 시 감면이 적용되지 않습니다)."` / 5년시점 동형.

### 적용 지점 (lib/calc/transfer-tax-validate-reductions.ts)

| 조문 | 기존 블록 | 추가 필드 |
|---|---|---|
| unsold_99_2 | 있음 (contractDate992 등) | `standardPriceAtAcquisition992`·`standardPriceAt5Years992` |
| unsold_98_3 | 있음 | `...983` |
| unsold_98_5 | 있음 | `...985` |
| unsold_98_6 | 있음 | `...986` (⚠ `stdPriceSumAtBase986`과 별개) |
| unsold_98_7 | **기구현** (:162-178) | 헬퍼로 교체만 (동작 무변경) |

### 제외 (엔진 실측 근거)
§98의2(`lthd_rate_special` p4:106)·§98의4(`tax_amount` p4:185)·§98(`flat_rate_20` p5:149) —
5년 후 안분 경로 없음.

### anchor 파일
`__tests__/calc/transfer-validate-hybrid-std-price.test.ts` (신규) — C1~C10.
기존 `transfer-validate-98-7-std-price.test.ts`는 유지(헬퍼 교체 회귀 확인).

---

## F-2 — 시한 표 드리프트 방지 anchor (P2) — 범위 조정 (Do 중 환류 2026-06-12)

### ⚠ 전수 실측으로 단일 상수 모듈화 보류 결정
당초 `reduction-windows.ts` 단일 상수로 3계층 통합을 설계했으나, Do 착수 전 전수 비교에서
**시한의 의미·값이 용도별로 다른 조문**을 발견 → 억지 통합은 정확성 훼손 위험(법령 정확성 최우선):

| 조문 | period-check | evaluator | WINDOWS(모드2) | 통합 가능? |
|---|---|---|---|---|
| §98·98의2·98의5·98의7·99의2 | [from,to] 일치 | 동일 상수 | 동일 | ✅ |
| §98의3 | 거주자 [2009-02-12,~] | **거주자/비거주자 2-트랙** | 거주자만 | ⚠ 변형 |
| §98의6 | `()=>true` 낙관(임대계약일 미보유) | **임대계약 60개월 기준** | `[2011-03-29,2011-12-31]`(취득) | ❌ 의미 상이 |

→ 단일 상수는 §98의6에서 **서로 다른 값**(낙관 / 임대 / 2011-03-29)을 하나로 강제하게 되어
   부적절. §98의3 2-트랙도 evaluator 전용.

### 대체 작업 — 일치 조문만 드리프트 anchor
값이 일치해야 하는 5조문(§98·98의2·98의5·98의7·99의2 + §98의3 거주자)의 evaluator export 상수 ↔
`SPECIAL_HOUSE_EXCLUSION_WINDOWS` 윈도우가 **일치하는지** 단위 테스트로 고정. 한쪽 수정 시 다른 쪽
드리프트를 즉시 탐지. period-check은 D() 리터럴(비-export)이라 anchor 대상 외 — 별도 변경 드뭄.

### anchor 파일
`__tests__/tax-engine/transfer-tax/reduction-window-consistency.test.ts` (신규).

---

## F-2(보류) — reduction-windows.ts 단일 출처 (참고 — 미채택)

> 아래는 당초 설계. §98의6·§98의3 변형으로 **미채택**. 향후 §98의6 임대 기준을 별도 필드로
> 분리하는 큰 리팩터링 시 재검토.

### 모듈 설계

```ts
// lib/tax-engine/transfer-reductions/reduction-windows.ts
import type { TransferReductionId } from "./types";

/** 조문별 취득(계약)기간 윈도우 — UTC 자정. 값 단일 출처 (F-2). */
export const REDUCTION_ACQUISITION_WINDOWS: Partial<
  Record<TransferReductionId, ReadonlyArray<readonly [Date, Date]>>
> = {
  unsold_98:   [[D("1995-11-01"), D("1997-12-31")], [D("1998-03-01"), D("1998-12-31")]],
  unsold_98_2: [[D("2008-11-03"), D("2010-12-31")]],
  unsold_98_3: [[D("2009-02-12"), D("2010-02-11")]],   // 거주자 기준 (비거주자 2-트랙은 evaluator 전용)
  unsold_98_5: [[D("2010-02-12"), D("2011-04-30")]],
  // ... 9조문 + period-check 공유분
};
```

### 참조 교체 표 (값 무변경 검증 체크리스트)

| 파일 | 현재 | 교체 후 |
|---|---|---|
| period-check.ts:37 RULES | 자체 `D()` 리터럴 | `REDUCTION_ACQUISITION_WINDOWS[id]` 조회 (해당 조문만) |
| unsold-hybrid.ts:33-38 | `UNSOLD_98_7_CONTRACT_*` 등 | 단일 출처 re-export 또는 참조 |
| unsold-hybrid-p3.ts:38-50 | 983/985/986 상수 | 동일 (⚠ 983 비거주자 `2009-03-16`은 **evaluator 전용 잔류**) |
| unsold-hybrid-p4.ts:25-28 | 982/984 상수 | 동일 |
| unsold-hybrid-p5.ts:27-30 | TRACK 상수 | 동일 |
| unsold-hybrid-p5.ts:224 WINDOWS | 자체 리터럴 | 키 매핑(`SpecialHouseExclusionArticle`→`TransferReductionId`) 후 조회. `new_99.transferDeadline`은 WINDOWS 잔류 |

### 키 매핑
`SpecialHouseExclusionArticle`(9종 — p5:193)은 `TransferReductionId` 부분집합과 1:1 — 단순 캐스트
가능 여부를 타입 레벨로 확인(`satisfies`), 불일치 시 명시 매핑 객체.

### 적용 한정
단일 출처는 **취득(계약)기간 윈도우형 조문만**. period-check RULES의 임대등록 시한형
(§97 시리즈 `registrationDate` 기준)·양도시한형 등 윈도우 개념이 다른 항목은 RULES에 잔류.

### 성공 기준
값 변경 0 — 기존 anchor 전수 통과(`reduction-period-check.test.ts`·`p5-flat-rate-and-mode2.test.ts`·
하이브리드 통합)가 곧 검증. 신규 anchor 불요.

---

## F-3 — multi/route.ts date-coerce 정규화 (P2)

### 변환 매핑 표 (36곳 — 필수/옵셔널 분류가 회귀 핵심)

| 그룹 | 필드 (대표) | 분류 | 헬퍼 |
|---|---|---|---|
| 자산 기본 | transferDate·acquisitionDate | 필수 | `toDate(x, "field")` |
| 자산 기본 | assetContractDate·constructionDate·decedentAcquisitionDate·donorAcquisitionDate | 옵셔널 | `toOptionalDate` |
| specialHouseExclusions | houseAcquisitionDate·houseContractDate | 옵셔널 | `toOptionalDate` |
| temporaryTwoHouse | previousAcquisitionDate·newAcquisitionDate | 객체 내 필수 | `toDate` |
| nonBusinessLandDetails | acquisitionDate·transferDate + businessPeriods[]·gracePeriods[] | 객체 내 필수 | `toDate` |
| houses[] | acquisitionDate | 필수 | `toDate` |
| marriageMerge / parentalCareMerge | marriageDate / mergeDate | 객체 내 필수 | `toDate` |
| rentalReductionDetails | registrationDate·rentalStartDate·transferDate + vacancy/rent 배열 | 객체 내 필수 | `toDate` |
| newHousingDetails | acquisitionDate·transferDate | 객체 내 필수 | `toDate` |
| pre1990Land / parcels[] | acquisitionDate·replottingConfirmDate(옵) | 혼합 | 각각 |
| delayedPaymentDetails | paymentDeadline·actualPaymentDate(옵) | 혼합 | 각각 |
| rentalHousingException | priorResidenceTransferDate(옵) 등 | 옵셔널 | `toOptionalDate` |
| rateDate (`:80`) | `new Date(taxYear, 11, 31)` — **연·월·일 생성자, 문자열 파싱 아님** | **교체 제외** | 그대로 |

- 분류 기준: 해당 필드의 Zod 스키마 optional 여부와 1:1 — 교체 전 `transfer-tax-schema*.ts` 대조.
- `:80`처럼 파싱이 아닌 생성자는 date-coerce 대상 아님(침묵 strip 주의 — 일괄 sed 금지, 수동 분류).

### 성공 기준
기존 다건 테스트(`multi-transfer-api-sync` 등)·다건 E2E 전수 통과 + 과세연도 경계 anchor 1건 추가.

---

## F-5 — §99의3 Date 변환 경로 일원화 (P3)

- `route-reductions-mapper.ts`에 §99의3 일자(`contractDate993`·`usageApprovalDate993`) Date 변환 추가.
- `income-deduction-router.ts` `evalNew993` 내부 `coerceOptionalDate`는 **유지**(이중 안전 — 단건
  외 호출자(다필지 등) 방어). 제거하지 않는다.
- anchor: 기존 §99의3 테스트 전수 통과(동작 무변경).

## F-6 — 다필지 assetContractDate 전달 (P4) — 1줄 추가 완료 (Do 중 환류)

### ⚠ "positional 순서 위험" 우려는 과대평가 (실측 정정)
`calcReductions` 시그니처 실측(`transfer-tax-reductions-calc.ts`): `assetContractDate`는 **15번째
(마지막) optional positional 인자**. finalize.ts:215는 전달, rate-calc.ts:483(다필지)만 누락.
**마지막 인자 1개 추가**는 중간 삽입이 아니므로 순서 어긋남이 없다 → options 리팩터링 없이 안전하게
1줄 추가(`input.assetContractDate`). numeric 영향은 다필지=토지/주택감면 양립 불가로 사실상 0이나
메인 경로와 인자 일관성 확보.

### anchor
별도 anchor 불요(numeric 0) — 전 양도세 회귀 0으로 충분.
