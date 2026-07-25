# 다주택 사목(자진·자동 말소 후 양도) base 목 요건 검증 완결 — 구현 계획서

> 목표: §167조의3①2호 **사목**의 *"이 경우 임대기간요건 외에 **해당 목의 다른 요건은 갖추어야 한다**"*를 다주택 중과배제 판정에 반영. 현재 사목은 말소 게이트 3개만 검사하고 base 목(가·다·라·마)의 기준시가·면적·호수·5%룰을 **미검증**(favorable-direction 법령 오류).
>
> 배경: §155⑳ 임대주택 특례 시리즈(C1~Phase3) 종결로 §167조의3①2호 가~자·구법 중 **사목만 다주택-전용**으로 남음(사목은 §155⑳ 구조적 N/A — 임대주택 자체 양도 개념, PR#780 법령 실측 확정). 사목은 다주택측에 UI·14-sync 배선 완료됐으나 base 목 요건 검증이 빠져 있어 **완결이 필요**.

---

## 1. 법령 근거 (KoreanLaw 실측 — 소득세법 시행령 §167조의3①2호 사목, mst 286211)

> **사.** 가목 및 다목부터 마목까지의 규정에 따른 장기임대주택(…부칙 제5조제1항 적용 주택 한정)이 「민간임대주택에 관한 특별법」 제6조제1항제11호에 따라 임대사업자의 임대의무기간 내 등록 말소 신청으로 등록이 말소된 경우(같은 법 제43조에 따라 **임대의무기간의 2분의 1 이상**을 임대한 경우로 한정한다)로서 **등록 말소 이후 1년 이내 양도**하는 주택. **이 경우 임대기간요건 외에 해당 목의 다른 요건은 갖추어야 한다.**

- 사목 base 목 = **가·다·라·마**(나·바·아·자 제외 — "가목 및 다목부터 마목까지").
- 사목이 갖춰야 할 요건 = **(a) 말소 게이트**(2020.8.18 이후 자진말소·의무기간 1/2↑·말소 후 1년내 양도) + **(b) base 목의 "임대기간요건 외 다른 요건"**(기준시가 cap·면적·호수·5%룰·아파트 제한 등, **임대기간요건만 면제**).
- 다주택 사목은 임대주택 **자체를 양도**(중과배제 대상 판정). §155⑳는 임대주택 보유·거주주택 양도라 사목 N/A(PR#780 확정) — §155⑳ 말소 대응은 ㉓(base 목 unit + 5년내 거주주택 양도, period만 억제).

---

## 2. 현황 실측 (file:line — 추정 없음)

| 계층 | 위치 | 현황 | 갭 |
|---|---|---|---|
| 엔진 predicate | `lib/tax-engine/rental-article/check.ts` `checkRentalArticle` 사목=`cancellationOnly` | 말소 게이트 3개만 검사 후 **early return** — period/price/size/min·5%룰·아파트 **전부 skip** | 🔴 base 목 요건 미검증 |
| 다주택 위임 | `lib/tax-engine/multi-house-surcharge-count.ts` `ARTICLE_BY_RENTAL_TYPE` G→사 (C3) | rentalType "G"→"사" 매핑·`checkRentalArticle("사").passed` | base 목 정보 어댑터 미전달 |
| 폼/UI | `components/calc/transfer/HouseEntryRentalTypeSection.tsx:35` `G: [rentalCancellationDate, hasHalfDutyPeriodMet, isSoldWithin1YearOfCancellation]` | G 선택 시 **말소 3필드만** 노출 | 🔴 base 목 선택·요건 필드 없음 |
| Zod | `lib/api/transfer-tax-schema-sub.ts:342·353~355` rentalType enum G + 말소 3필드 optional | 말소 필드만 | base 목 필드 없음 |
| validate | `lib/calc/transfer-tax-validate.ts:157` `t==="G" && !rentalCancellationDate` | 말소일만 필수 | base 목 요건 검증 없음 |
| 엔진 anchor | `__tests__/tax-engine/multi-house-surcharge/rental-type-matrix.test.ts` RT-G | 말소 게이트만 anchor(기준시가·면적 미설정) | 🔴 base 요건 회귀 미보호 |

**대조 — §155⑳㉓(Phase3, 정답 모델)**: `eligibility.ts` 말소 특례는 **full 가·다·라·마 unit**(기준시가·면적 포함) + `rentalAutoTermination`으로 `RENTAL_PERIOD_SHORT`만 억제 → base 목 다른 요건은 정상 검사. 다주택 사목은 이 검증이 없음.

**갭 성격**: base 목 요건(예: 마목 임대개시일 기준시가 6억 초과) 미검증 → 요건 미달 주택도 중과배제 → **법령 근거 없는 유리 오적용**([[feedback_no_unfavorable_application_without_legal_basis]] 역방향 — 과소과세). checkRentalType_G 시절부터 **pre-existing**(C3는 동작 보존).

---

## 3. 설계

### 3.1 핵심 아이디어
사목 = **base 목 판정(임대기간요건 제외) + 말소 게이트**. 엔진에서 base 목의 GATES를 재사용(단일 소스)하고 period만 면제.

### 3.2 대안 비교

| | 방식 | 장점 | 단점 | 리스크 |
|---|---|---|---|---|
| **T1 (권장)** | rentalType "G" 유지 + `saMokBaseArticle`(가·다·라·마) 필드 추가. `checkRentalArticle("사")`가 base 목 GATES를 period 제외하고 검사 + 말소 게이트 | 다주택 UI 모델(9유형) 유지·surgical. base 요건 단일 소스(GATES 재사용) | 사목에 base 목 축 신설(UI 1필드) | 중(shipped G 재anchor) |
| T2 | "사" 유형 폐지 → base 목(A/C/D/E) + "말소 후 양도" 토글로 재모델 | §155⑳㉓와 형태 통일 | 다주택 rentalType 모델 대수술·말소 의미 상이(다주택 1년내 **임대주택** 양도 vs ㉓ 5년내 **거주주택** 양도)로 완전 통일 불가 | 고 |

> **권장 T1**: 말소 의미가 두 feature에서 다르므로(양도 대상·기한) T2 완전 통일은 부적합. T1이 base 요건 단일 소스(GATES) 재사용 + surgical.

### 3.3 엔진 설계 (T1 — Q-S1 확정)

`NormalizedRentalUnit`에 `saMokBaseArticle?: "가"|"다"|"라"|"마"` 추가. base 게이트를 **`checkArticleGates(article, u, { skipPeriod })` 헬퍼로 추출**(재귀 대신 직접 호출 — F-S2). `checkRentalArticle`의 목별 본체를 이 헬퍼로 일원화하고, 사목은 헬퍼를 `skipPeriod=true`로 base에 대해 호출:
```
checkArticleGates(article, u, opts):  // 기존 checkRentalArticle 본체(사목 제외)
  ... 등록완비·regDateMin·bizRegDateMax·saleWindow·(period unless opts.skipPeriod)·price·region·size·min·national·apartment·918·shortToLong·5%룰

checkRentalArticle("사", u):
  (a) 말소 게이트: rentalCancellationDate ≥ 2020.8.18 · hasHalfDutyPeriodMet · isSoldWithin1YearOfCancellation
  (b) base = u.saMokBaseArticle (없으면 SAMOK_BASE_REQUIRED fail)
      base 요건 = checkArticleGates(base, u, { skipPeriod: true }).failCodes  // 임대기간요건만 면제
  passed = (a)·(b) 모두 통과 (fails 합집합)
```
- base 목 요건은 `GATES[base]`가 이미 정의(기준시가 priceAt·면적·호수·5%룰·아파트). **재구현 없음**.
- period(임대기간요건)만 면제 — 법령 "임대기간요건 외에".
- 신규 failCode: `SAMOK_BASE_REQUIRED`(base 미선택). base 요건 실패는 base 기존 코드(STANDARD_PRICE_EXCEEDED 등) 그대로 노출.
- base∈{가·다·라·마}만(cancellationOnly 아님) → 재진입 없음. 타입·런타임 가드.

> **F-S1(Critical) — 가/다목 2018-04-02 등록상한**: 이 게이트는 check.ts가 아니라 다주택 `isLongTermRentalHousingExempt`의 **다주택-side 잔여**(C3, §155⑳ derive 2020.7.11 경계 회귀 방지). 따라서 사목 base=가/다도 이 wrapper에서 별도 검사해야 "해당 목의 다른 요건" 완비. → `isLongTermRentalHousingExempt`에서 **`rentalType==="G"` && `saMokBaseArticle∈{가,다}` && (biz|rent > 2018-04-02) → false** 추가(기존 A/C 분기와 동형).

### 3.4 어댑터
- **다주택**(`multi-house-surcharge-count.ts` `toNormalizedFromHouse`): `saMokBaseArticle: house.saMokBaseArticle`(신규 HouseInfo 필드). base 목의 기준시가·면적은 기존 HouseInfo 필드(rentalStartOfficialPrice·acquisitionOfficialPrice·landArea·totalFloorArea·hasMinimum2Units·rentIncreaseUnder5Pct) 재사용 → 이미 어댑터에 매핑됨.
- **§155⑳**: 사목 미도출 → 어댑터 무변경(saMokBaseArticle 미설정).

---

## 4. 14 동기화 지점 (다주택측 — HouseInfo 신규 `saMokBaseArticle`)

| # | 지점 | 변경 |
|---|---|---|
| ① 폼 | `lib/stores/calc-wizard-asset-nbl.ts`(HouseEntry 폼) | `saMokBaseArticle?: '가'\|'다'\|'라'\|'마'` |
| ② factory | 동 factory | 기본값 undefined |
| ③ migrate | 동 migrate | backfill 불필요(optional·신규) |
| ④ api 변환 | `lib/calc/transfer-tax-api-houses.ts` | saMokBaseArticle passthrough |
| ⑤ UI | `HouseEntryRentalTypeSection.tsx` | **G 선택 시**: base 목 라디오(가·다·라·마) + base 목의 요건 필드(기준시가·면적·호수·5%룰·아파트)를 base 목별 조건부 노출. TYPE_FIELDS[G] 확장 |
| ⑧ validate | `lib/calc/transfer-tax-validate.ts` | G: saMokBaseArticle 필수 + base 목 요건 필드 필수(base별) |
| ⑨⑫ Zod | `lib/api/transfer-tax-schema-sub.ts` | `saMokBaseArticle: z.enum(['가','다','라','마']).optional()` + G refine(있으면 base 요건 필드 존재) |
| ⑬⑭ route | `lib/api/transfer-route-multi-house.ts` `mapHousesToEngine` | saMokBaseArticle passthrough |
| result | (다주택 결과카드 사목 라벨은 `getRentalTypeLabel` — base 목 병기 선택) | 선택 |

> HouseInfo는 base 요건 필드(기준시가·면적·5%룰 등)를 **이미 보유**(A~I 공용) → 신규 필드는 `saMokBaseArticle` 1개. UI만 G에서 이 필드들을 **노출**하면 됨.

---

## 5. anchor (Pre-Do 우선)

- **엔진 direct**(`check.test.ts`): 사목 base=마 + 임대개시일 기준시가 7억(>6억) → **STANDARD_PRICE_EXCEEDED**(period 면제여도 base 요건 미달 배제) / base=마 6억·말소 게이트 충족 → passed / base 미선택 → SAMOK_BASE_REQUIRED / base=다 면적 300㎡ → SIZE_EXCEEDED / base=마 period 짧아도(임대기간요건 면제) 통과.
- **다주택 위임**(`rental-type-matrix.test.ts` RT-G **재anchor**): 현행 RT-G(말소 게이트만)는 base 목·요건 미설정 → base=마 + 기준시가 추가. 요건 충족→배제 / base 기준시가 초과→**미배제**(신규 회귀) / 말소 1/2 미충족→미배제(기존 유지).
- **F-S6 base=가/다 2018-04-02 등록상한**(`rental-type-matrix.test.ts`): 사목 base=가 reg 2017 요건충족→배제 / base=가 reg 2019(등록상한 초과)→**미배제**(다주택-side 잔여 게이트).
- **route**(`transfer-route-multi-house.test.ts`): saMokBaseArticle 매핑 passthrough.
- 무회귀: 기존 RT-G 2케이스(말소 게이트) 의미 보존 + base 요건 케이스 신설.

---

## 6. 리스크·유의

- **shipped 다주택 사목 동작 변경**: base 요건 미달 사목이 종전 배제→산입으로 전환(법령 정확·과소과세 정정). RT-G 재anchor 필수. [[feedback_subagent_completion_report_scrutiny]]·회귀 0.
- **base 요건 필드 노출 UI 복잡도**: G에서 base 목별로 다른 필드(다·라=면적, 마=아파트 date, 라=계약일·5호·비수도권 등) — base 목 선택에 따른 2단 조건부. 기존 A~I 조건부 로직 재사용.
- **saMokBaseArticle="라"**: 라목은 미분양(2008~2009)·비수도권·5호·계약일 요건 → 사목 base=라는 극히 희귀. 그래도 법령상 포함이라 지원(가·다·라·마 전부).
- **checkRentalArticle 재귀 호출**: base∈{가·다·라·마}로 제한해 "사" 재진입 차단(타입·런타임 가드).

---

## 7. 미결 (사용자 확인)

- **Q-S1 통합 깊이**: ✅**T1 확정(사용자 결정 2026-07-26)** — rentalType G 유지 + saMokBaseArticle. base 게이트 `checkArticleGates` 헬퍼 추출.
- **Q-S2 UI 노출 방식**: G 선택 시 base 목 라디오 + base 요건 필드 **전부 인라인** vs base 목만 먼저 고르고 요건은 그 아래 조건부(권장: 후자 — 기존 A~I 조건부 재사용).
- **Q-S3 scope**: base 요건 **전부**(기준시가·면적·호수·5%룰·아파트·라목 계약일 등) vs 핵심(기준시가·면적)만 우선 — 법령은 "다른 요건" 전부 요구 → **전부 권장**.

---

## 8. 단계 — ✅ 완료(2026-07-26, T1)

1. ✅ **13단계 자가검토** — 정정 6건(F-S1 Critical 가/다목 등록상한 다주택-side 잔여 반영).
2. ✅ anchor 우선(check.test 사목 base 5 + RT-G 재anchor·F-S6).
3. ✅ 엔진 — `checkArticleGates(article,u,{skipPeriod})` 헬퍼 추출, 사목=말소게이트+base 위임(임대기간요건 면제). `SaMokBaseArticle`·`SAMOK_BASE_REQUIRED`.
4. ✅ F-S1 — `isLongTermRentalHousingExempt`서 사목 base=가/다 2018-04-02 등록상한 검사.
5. ✅ 14-sync — 폼(nbl)·api-houses·route·Zod(schema-sub)·UI(HouseEntryRentalTypeSection: base 목 selector + base 요건 동적 append)·validate.
6. ✅ E2E(사목 base 마목 → 요건 필드 노출) + 전체 11458 green·tsc 0·lint 0.
7. ✅ ship.

---

## 부록 — §167조의3①2호 목별 §155⑳/다주택 커버리지 (Phase3 후)

| 목 | §155⑳ | 다주택 | 비고 |
|---|---|---|---|
| 가·다·마·바·아·자·구법 | ✅ | ✅ | 공용 checkRentalArticle |
| 나 | ✅(C4) | ✅ | 기존사업자 |
| 라 | ✅(Phase3) | ✅ | 미분양 |
| **사** | **N/A**(구조상 불가·법령 확정) | ✅ **base 목 "해당 목의 다른 요건" 검증 완료**(Phase4) | 본 계획 완료 |

> §167조의3①2호 **가~자·구법 전 목** §155⑳·다주택 양 feature 완결. 공용 `rental-article/{rules,check}` predicate 단일 소스.
