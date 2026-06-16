# F1 — 양도일 의제 (경매·공매·신문공고) §168의14②

> 의제일을 양도일로 보아 **§168의6 기간기준만** 재판정. 본 세액(양도차익·보유기간 세율)은 실제 양도일 불변.

---

## 1. 법령 근거 (KoreanLaw 본문 실측 2026-06-17)

### 시행령 §168의14② (mst=286211)
> 다음 각 호에 해당하는 토지는 **해당 각 호에서 규정한 날을 양도일로 보아 제168조의6의 규정을 적용**하여 비사업용 토지 해당 여부를 판정한다.
> 1. 「민사집행법」에 따른 경매로 양도된 토지 : **최초의 경매기일**
> 2. 「국세징수법」에 따른 공매로 양도된 토지 : **최초의 공매일**
> 3. 그 밖에 토지의 양도에 일정한 기간이 소요되는 경우 등 재정경제부령이 정하는 부득이한 사유 (→ §83의5②)

### 시행규칙 §83의5② (mst=286379)
> 영 §168의14②3호에 따라 다음 토지는 해당 호에서 규정한 날을 양도일로 보아 영 §168의6을 적용하여 판정한다.
> 1. 한국자산관리공사에 매각을 위임한 토지 : **매각을 위임한 날**
> 2. 전국 보급 일간신문 포함 3개 이상 일간신문에 다음 조건으로 3일 이상 매각 공고하고, 공고일(서로 다르면 최초 공고일)부터 **1년 이내 매각계약** 체결한 토지 : **최초의 공고일**
>    - 가. 매각예정가격이 영 §167⑤ 시가 이하일 것
>    - 나. 매각대금의 70% 이상을 계약 체결일부터 6월 이후 결제할 것
> 3. 제2호 토지로서 동호 각 목 요건을 갖추어 매년 재공고(직전 매각예정가에서 10% 차감 이하)하고 재공고일부터 1년 이내 계약한 토지 : **최초의 공고일**

**핵심**: "양도일로 보아 **§168의6의 규정을 적용**" — 의제일은 **기간기준(§168의6) 판정에만** 작용. 지목분류·도시지역 판정·무조건의제(§168의14③)·면적안분에는 실제 양도일 유지.

---

## 2. 현황 (실측)

- `engine.ts`·각 judge는 `input.transferDate`를 **두 용도로 혼용**:
  - (a) 기간기준(§168의6) window 종료 — **meetsPeriodCriteria 호출 5 judge**: `farmland`·`forest`·`pasture.ts:80`·`other-land.ts:151·159·196·264`·`villa-land.ts:64·101`. (※ `housing-land`는 meetsPeriodCriteria **미호출**(grep 0) — 면적배율만, §168의6 비적용 → 양도일 의제 **무관**. `housing-land.ts:34` totalOwnershipDays는 결과 표시용.)
  - (b) 비-기간 판정(§168의6 외 — 의제일 **미적용**): `pasture.ts:183`·`forest.ts:180` `isUrbanFor*(zoneType, transferDate)`(도시지역 §168의9/§168의10③), `checkIncorporationGrace(..., input.transferDate, ...)`(편입유예 §168의8⑥·§168의10⑤ — `period-criteria.ts:285` 주석 실측), 무조건의제 cutoff(§168의14③).
- 의제일 입력 채널 부재 — `NonBusinessLandInput`에 의제 양도일 필드 없음.

---

## 3. 설계

### 3-1. 입력 타입 (`types.ts`)
```ts
export type DeemedTransferReason =
  | "none"            // 의제 없음 (실제 양도일 사용)
  | "auction"         // §168의14②1호 민사집행법 경매 → 최초 경매기일
  | "public_sale"     // §168의14②2호 국세징수법 공매 → 최초 공매일
  | "kamco_consignment" // §83의5②1호 캠코 매각위임 → 매각 위임일
  | "newspaper_public_offering" // §83의5②2호 신문공고 → 최초 공고일
  | "republication";  // §83의5②3호 재공고 → 최초 공고일

interface NonBusinessLandInput {
  // ...
  deemedTransferReason?: DeemedTransferReason;  // 기본 none
  deemedTransferDate?: Date;                    // 의제일 (reason≠none 시 필수)
}
```

### 3-2. 엔진 (핵심: 기간 판정 날짜만 치환)
`engine.ts`에 단일 헬퍼:
```ts
// §168의14② — 의제일을 §168의6 판정용 양도일로 본다 (지목·도시지역·무조건의제·면적은 실제 양도일).
export function getPeriodJudgmentDate(input: NonBusinessLandInput): Date {
  if (input.deemedTransferReason && input.deemedTransferReason !== "none" && input.deemedTransferDate) {
    return input.deemedTransferDate;
  }
  return input.transferDate;
}
```
**5 judge**(farmland·forest·pasture·other·villa)에서 **meetsPeriodCriteria 호출 인자 + period 배열 종료일만** `pjDate`로:
- `const pjDate = getPeriodJudgmentDate(input);`
- `meetsPeriodCriteria(periods, input.acquisitionDate, pjDate, categoryGroup, rules, input.gracePeriods)` — 내부에서 transferDate를 window 종료·소유일수로 사용(`period-criteria.ts:124·130·135·138`)하므로 **인자만 바꾸면 window 전체가 의제일 기준**.
- period 배열 종료: `fullPeriod`/`livestockPeriods`/`nonVilla`(villa `invertPeriods`) 종료 = `pjDate` (사업용 일수를 의제일까지만 카운트).
- judge가 §168의6 판정에 쓰는 표시용 `totalOwnershipDays`(`pasture.ts:76` 등)는 pjDate 채택. **단 §168의6 외 판정의 transferDate는 실제 양도일 유지**: `isRelatedPasture` 상속 3년 이내(`pasture.ts:51` §168의10②)·도시지역·편입유예·무조건의제 cutoff(§168의14③).
- `getThresholdRatio`(2015.2.2 농임목 0.8 레거시)도 meetsPeriodCriteria 내부서 transferDate(=pjDate) 기준 — 의제일이 경계 결정(영향 미미, 명시).
- **불변 유지(실제 양도일)**: `isUrbanForPasture`/`isUrbanForForest`(도시지역 §168의9/§168의10③), `checkIncorporationGrace(input.urbanIncorporationDate, input.transferDate, rules)`(편입유예 **§168의8⑥·§168의10⑤**), 무조건의제 cutoff(§168의14③). §168의14②은 §168의6에만 의제.

✅ **실측 확정(2026-06-17)**: §168의6(get_law_text mst=286211) 본문은 순수 기간기준만(소유기간 버킷 + 양도일 직전 5년/3년) — 편입유예 **없음**. `checkIncorporationGrace`는 §168의8⑥·§168의10⑤ 소속(`period-criteria.ts:285`) → 의제일 미적용, 실제 양도일 유지. (계획서 작성 시 "Do 선확인"이던 항목을 STEP 1 검토에서 실측 확정.)

### 3-3. form-mapper (`form-mapper.ts`)
```ts
deemedTransferReason: (asString(asset.nblDeemedTransferReason) || "none") as DeemedTransferReason,
deemedTransferDate:   parseDate(asString(asset.nblDeemedTransferDate)),
```

---

## 4. 케이스 매트릭스

| # | reason | 의제일 입력 | 기간기준 window 종료 | 도시지역 판정 | 기대 |
|---|---|---|---|---|---|
| C1 | none | — | 실제 양도일 | 실제 양도일 | 기존 동작 (회귀) |
| C2 | auction | 최초 경매기일 | 의제일 | 실제 양도일 | window 단축 → 판정 플립 가능 |
| C3 | public_sale | 최초 공매일 | 의제일 | 실제 양도일 | C2 동일 |
| C4 | kamco_consignment | 매각 위임일 | 의제일 | 실제 양도일 | C2 동일 |
| C5 | newspaper_public_offering | 최초 공고일 | 의제일 | 실제 양도일 | C2 동일 (요건 가·나 사용자 책임) |
| C6 | republication | 최초 공고일 | 의제일 | 실제 양도일 | C2 동일 |
| C7 | auction, 의제일 미입력 | — | **validate 차단** | — | ⑧ 검증 오류 (자동 fallback 금지) |
| C8 | auction, 의제일 > 실제 양도일 | (비정상) | 의제일 | — | warning — 의제일은 통상 양도일 이전 |

**요건 자동검증 제외(scope)**: 신문공고 가(매각예정가≤시가)·나(70% 6월후)·3개신문·1년내계약은 사용자 충족 책임. F1은 의제일 입력만. (요건 검증은 후속.)

---

## 5. 14 동기화 지점

| # | 지점 | 작업 |
|---|---|---|
| ① | AssetForm | `nblDeemedTransferReason: string` + `nblDeemedTransferDate: string` |
| ② | factory | `nblDeemedTransferReason: "none"`, `nblDeemedTransferDate: ""` |
| ③ | normalize/migrate | NBL_DEFAULTS 동일 2필드 |
| ④ | API 변환 | prefix-pick `nbl*` 자동 |
| ⑤ | UI | `DeemedTransferSection`(신규) — RadioCardGroup 6옵션(none/auction/public_sale/kamco/newspaper/republication) + 조건부 DateInput. **기간기준 5 지목 게이트**(농지·임야·목장·기타토지·별장). housing 주택부수토지는 §168의6 미적용이라 노출 시 무영향(노출 생략 권장) |
| ⑥ | 사이드바 | N/A (금액 아님) |
| ⑦ | 결과카드 | `NonBusinessLandResultCard`에 "양도일 의제: {reason} {의제일} (§168의14② 기간기준 판정 기준일)" 행 |
| ⑧ | validate | `transfer-tax-validate-asset.ts`: reason≠none이면 의제일 필수 (자동 fallback 금지) |
| ⑨⑩ | Zod enum | 해당 없음 (reason은 string, ⑫에서 검증) |
| ⑪ | acq fallback | 무관 |
| ⑫ | Zod 입력 | `transfer-tax-schema-sub.ts` `nonBusinessLandRawSchema`에 2필드 `z.string().optional()` |
| ⑬ | body spread | prefix-pick 자동 |
| ⑭ | route 매핑 | `buildNblEngineInput`(`non-business-land-request.ts`)에서 `deemedTransferDate` **Date 변환**(`date-coerce` `toOptionalDate`) + reason 매핑 |

---

## 6. anchor 명세 (Pre-Do 우선)

- **AT-F1-1 (Pre-Do, 핵심)**: 기타토지, 취득 2015-01-01, 실제 양도 2024-01-01(보유 9년), 직전 5년 전부 비사업 사용. reason=none → 비사업용. **reason=auction + 의제일 2020-01-01**(보유 5년·window 단축) → §168의6 버킷 변화로 판정 플립. day-count는 probe로 실측 후 기대값 고정. **FAIL 먼저 확보**(현재 deemedTransferDate 미소비).
- **AT-F1-2 (회귀)**: reason=none이면 의제일 무시·실제 양도일 동일 결과.
- **AT-F1-3 (의제일은 §168의6만)**: 목장, zone 도시지역, 실제 양도일 기준 편입유예 경과 vs 의제일 기준이면 유예 내 → **편입유예·도시지역 판정은 실제 양도일 유지**(§168의8⑥·§168의10⑤·§168의9는 §168의6 아님), 기간기준만 의제일. 실측 확정값으로 anchor 고정(추가 본문확인 불요).
- **AT-F1-4 (validate)**: reason=auction·의제일 빈값 → `validateAsset` 오류 1건.

---

## 7. 규모·위험

- 변경 파일: `types.ts`·`engine.ts`(`getPeriodJudgmentDate` 헬퍼)·**5 judge**(farmland·forest·pasture·other·villa — meetsPeriodCriteria 호출 인자 + period 종료일)·`form-mapper.ts`·`transfer-tax-schema-sub.ts`·`non-business-land-request.ts`·`transfer-tax-validate-asset.ts`·UI 1신규·결과카드 1.
- 위험: meetsPeriodCriteria 호출 인자만 pjDate(내부 window 자동 반영) → 침투 최소. 도시지역·편입유예·무조건의제는 실제 양도일(§168의6 외, 실측 확정). AT-F1-3로 격리.
- 규모 S/M. 단독 ship.
