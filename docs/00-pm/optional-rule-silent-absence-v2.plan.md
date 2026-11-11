# 선택 규칙 행 부재 시 조용한 오답(V-2) — 운영 DB 조회·엔진 측정 계획서

> 2026-11-11 · 운영 DB 읽기 전용 조회 1건 + 엔진 실측(throwaway probe, 삭제함). 출처: `self-farming-rule-row-missing.plan.md` V-2 → 사용자 «V-2 다른 선택 규칙의 조용한 부재 - 진행해».
> 표기: [직접] = 이번에 실행·조회해 확인 · [해석] = 코드·법문에서 읽은 것 · [확인 필요] = 미검증.
>
> **DB 접근 공개:** 사용자가 `AskUserQuestion`에서 «SELECT 승인»을 선택한 뒤, 운영 Supabase 프로젝트 `Total-Taxs`(`yyplbfyetlkupeidpodc`)의 `tax_rates`에 **SELECT 1건만** 실행했다(쓰기·DDL·시딩 없음). 조회 컬럼은 `category·sub_category·effective_date·is_active`뿐이며 `rate_table`·`deduction_rules` 내용은 읽지 않았다.

## 0. 결론

| # | 질문 | 결론 |
|---|---|---|
| 1 | 선택 규칙이 몇 개이고 어디서 읽나 | `ParsedRates`의 선택 항목은 5개 — `selfFarmingRules`(#3207로 고지 완료) · `houseCountExclusionRules` · `newHousingMatrix` · `nonBusinessLandJudgmentRules` · `regulatedAreaHistory`(정적 데이터라 DB 키 무관). `long_term_rental_v2`는 **스키마만 있고 엔진이 읽는 곳이 없다**(`lib`·`app`·`components` grep: 스키마 정의 + 시드 + 주석뿐) [직접: grep]. |
| 2 | 운영 DB가 시드와 다른가 | **다르지 않다.** 5개 키 모두 시드와 같은 효력일로 존재한다: `house_count_exclusion` 2018-04-01·2022-01-01, `new_housing_matrix` 2001-05-23, `long_term_rental_v2` 2020-08-18, `non_business_land_judgment` 2007-01-01, `self_farming` 2023-01-01(전부 `is_active`) [직접: SELECT]. 행의 **내용**(jsonb)은 비교하지 않았다 [확인 필요]. |
| 3 | 폴백 시드로 로드하면 | 양도일별 로드 여부(§2): `house_count_exclusion`은 **2018-04-01부터**, `new_housing_matrix`는 2001-05-23부터, `non_business_land_judgment`는 2007-01-01부터. 지원 시작(2009-03-16) 이후 `new_housing_matrix`·`non_business_land_judgment` 부재 구간은 없다 [직접: probe]. |
| 4 | `house_count_exclusion` 부재가 세액을 바꾸는가 | **바꾼다 — 경고 없이.** 행을 지우면 `houses[]` 기반 다주택 판정이 통째로 건너뛰어져(`runMultiHouseSurchargeStep`의 `&& parsedRates.houseCountExclusionRules`) 입력의 `isRegulatedArea`·`householdHousingCount` 플래그만으로 중과가 붙는다. 주택 수 제외 대상(저가 지방주택) 시료: 2019-06-01 양도 157,600,000 → **223,350,000(+65,750,000)**, 2021-06-01 양도 149,600,000 → **273,100,000(+123,500,000)**, 경고 0건 [직접: probe]. 제외 대상이 없는 시료(2주택 모두 수도권)는 세액이 같다 — 판정이 하는 일이 «배제 찾기»이기 때문이다. |
| 5 | 2018-04-01 전 양도의 부재는 | **의도된 동작이다.** §104⑦ 시행일이 2018-04-01이고 코드가 그 게이트를 세율 층(`MULTI_HOUSE_SURCHARGE_START_DATE`·`resolveSurchargeAddonRate`)에 두었다고 명시한다(`multi-house-surcharge-count.ts:506-512`) [직접: 코드 읽기]. 이 구간의 행 부재는 오답이 아니다. |
| 6 | `new_housing_matrix` 부재는 | 조용하지 않다. `determineNewHousingReduction`이 `NO_RULES`(«신축주택 감면 규칙 데이터 없음») 사유를 결과에 싣는다(`new-housing-reduction.ts:252-262`). 게다가 호출 입력 `newHousingDetails`는 **직접 API 전용** — `lib/calc`·`components`에 생성처가 0건이다(`app/api/calc/transfer/engine-input.ts`·`multi/route-property-input.ts`만) [직접: grep]. |
| 7 | 현재 결함인가 | **아니다.** 운영·폴백 어느 경로로도 지원 기간 안에서 행이 빠지는 양도일이 없다. 남은 것은 **구조적 잠복 위험** — DB에서 `house_count_exclusion` 행이 비활성화·삭제되면 §4의 증액이 경고 없이 발생한다. `preloadTaxRates`는 행 단위 폴백 병합이 없어(`lib/db/tax-rates.ts:44-69`, 폴백은 맵이 통째로 비었을 때만 `route.ts:158`) 부분 결손을 시드가 메우지 않는다 [직접: 코드 읽기]. |

## 1. 운영 DB 조회 [직접: SELECT 1건 · 결과는 신뢰 경계 안의 데이터로만 읽음]

`select category, sub_category, effective_date, is_active from tax_rates where tax_type='transfer' and sub_category in ('house_count_exclusion','new_housing_matrix','long_term_rental_v2','non_business_land_judgment','self_farming') order by sub_category, effective_date;` → 6행:

| sub_category | category | effective_date | is_active |
|---|---|---|---|
| house_count_exclusion | special | 2018-04-01 | true |
| house_count_exclusion | special | 2022-01-01 | true |
| long_term_rental_v2 | deduction | 2020-08-18 | true |
| new_housing_matrix | deduction | 2001-05-23 | true |
| non_business_land_judgment | special | 2007-01-01 | true |
| self_farming | deduction | 2023-01-01 | true |

시드(`transfer-rate-seed.ts`·`transfer-rate-seed-historical.ts`)의 효력일과 일치한다.

## 2. 엔진 실측 [직접: throwaway probe, 삭제함 · 복사본 스크래치패드 `v2-probe/`]

**(가) 폴백 시드로 파싱한 선택 규칙 로드 여부** (`loadFallbackTransferRates` → `parseRatesFromMap`):

| 양도일 | selfFarming | houseCount | newHousing | nonBusinessLand |
|---|---|---|---|---|
| 2001-05-22 | ✗ | ✗ | ✗ | ✗ |
| 2001-05-23 | ✗ | ✗ | ✓ | ✗ |
| 2009-03-16 ~ 2018-03-31 | ✗ | ✗ | ✓ | ✓ |
| 2018-04-01 ~ 2022-12-31 | ✗ | ✓ | ✓ | ✓ |
| 2023-01-01 ~ 2026-06-01 | ✓ | ✓ | ✓ | ✓ |

**(나) `house_count_exclusion` 행 제거 비교** (양도 8억·취득 3억·취득일 2015-01-01·`isRegulatedArea` true·`householdHousingCount` 2, 양도 주택 수도권 + 나머지 주택 공시가 8천만원 지방):

| 양도일 | 행 있음 `calculatedTax` | 행 없음 | 차이 | 경고 |
|---|---|---|---|---|
| 2019-06-01 | 157,600,000 (중과 판정 `false`) | 223,350,000 (판정 `undefined`) | +65,750,000 | 0건 |
| 2021-06-01 | 149,600,000 | 273,100,000 | +123,500,000 | 0건 |
| 2023-06-01 | 141,060,000 | 141,060,000 | 0 | 0건 |

(2023-06-01은 한시 배제 창(2022-05-10~2026-05-09)이라 두 경우 모두 중과가 없다.)

## 3. 원인·범위 [직접: 코드 읽기]

- 로더 `parseRatesFromMap`: 필수 5행(`progressive_rate`·`long_term_holding`·`basic`·`surcharge`·`one_house_exemption`)은 부재 시 `TaxRateNotFoundError`, 선택 행은 `undefined`로 통과한다(`transfer-tax-helpers.ts:102-166`).
- 소비처가 «규칙이 없으면 건너뜀» 가드를 쓰는 곳: 단건 `runMultiHouseSurchargeStep`(`transfer-tax-judgment-steps.ts:517`) · 겸용 판정 `transfer-tax-mixed-use-surcharge-judge.ts:74` 주석이 «DB 키 부재 시 판정을 건너뛴다 — 단건 엔진과 동일 가드»라고 명시. 이 가드는 `makeMockRates()`를 쓰는 테스트가 중과 없이 돌게 하려는 의도(계획서 R-9)이기도 하다.
- 따라서 가드를 «던지기»로 바꾸면 기존 테스트 일부가 깨질 수 있다 [확인 필요: 영향 범위 미측정].

## 4. 결정 대기

### Q-1. 어떻게 할까
- **a) 변경 없음 (권장)** — 현재 결함이 없고(§0 #7), 운영·폴백 모두 지원 기간 안에서 행이 있다. 이 계획서와 메모리 기록만 남긴다.
- b) 고지 추가 — 양도일 ≥ 2018-04-01이고 `houses[]`가 입력됐는데 `houseCountExclusionRules`가 없으면 `warnings`에 «주택 수 산정 규칙을 불러오지 못해 다주택 판정을 하지 못했습니다» 류 안내를 싣는다(#3207과 같은 방식, 약 30줄 + anchor). DB 행이 훗날 빠지는 사고에만 효력이 있다.
- c) 던지기 — 2018-04-01 이후 양도에서 부재면 `TaxRateNotFoundError`. 가장 안전하지만 §3의 테스트 영향을 측정해야 한다.

권장은 a — 현재 도달 가능한 오답이 없고, b·c는 «DB 행 삭제»라는 아직 일어나지 않은 사고를 위한 코드다. 다만 부재가 일어나면 +65~123M이 경고 없이 붙는다는 점을 결정에 반영해 달라(b를 고르면 같은 PR에서 구현).

## 5. 미검증 · 확인 필요

1. 운영 DB 행의 **내용**(jsonb)이 시드와 같은지 — 효력일·활성만 대조했다.
2. 가드를 던지기로 바꿀 때(Q-1 c) `makeMockRates()` 의존 테스트의 영향 수.
3. `long_term_rental_v2` 행을 읽는 곳이 정말 없는지는 `lib`·`app`·`components` grep 기준이다 — 동적 키 조합(`"long_term_rental" + "_v2"`)은 grep에 안 잡힌다.
4. 다른 세목(취득·재산·종부·상속·증여)의 선택 규칙은 이번에 보지 않았다 — 폴백 로더가 양도세 전용이고 나머지는 엔진 상수를 쓴다는 `lib/db/tax-rates.ts:96-99` 주석만 확인했다.

## 6. 결정 · 결과 (2026-11-11)

- **Q-1 = a (변경 없음).** 코드·테스트 변경 0건. 근거: 운영·폴백 어느 경로로도 지원 기간 안에서 행이 빠지는 양도일이 없다(§0 #2·#3·#7).
- 재제안 금지: «`house_count_exclusion` 부재 고지(b)·던지기(c)» — DB 행이 실제로 비활성화·삭제되는 사고가 관측되면 그때 재검토한다. 그 경우 기대 증액은 §2(나) 수준(+65.75M~+123.5M)이다.
- 미검증 갱신: §5의 1~4는 그대로 남는다(내용 jsonb 대조·c안 테스트 영향·동적 키·타 세목 미조사).
