# 비사업용 토지(NBL) 코드리뷰 — 엔진 · API · UI

> 2026-09-02 · 대상 `master` **a30833f3** · 워크트리 `.claude/worktrees/nbl-review`
> 범위: 「소득세법」 §104의3 / 같은 법 시행령 §168의6~§168의14 / 같은 법 시행규칙 §83의4·§83의5 도메인의 **엔진 + API/변환 + UI** 전 계층
> 방법: 12축 병렬 정독 → 축별 적대적 반증 → 파생 발견 2차 검증 → 라우트 레벨 numeric 실증 → 완전성 비평 (36 에이전트 · 728만 토큰 · 2,181 tool call)

---

## 0. 요약

| | 건수 |
|---|---|
| 1차 확정 (12축 → 반증 통과) | **60** |
| 1차 기각 (기지 항목 재보고) | 3 |
| 2차 확정 (파생 발견 + 완전성 비평) | **42** |
| 2차 기각 (층위 오귀속·의도된 설계) | 7 |
| 2차 미확정 (UNCERTAIN) | 2 |
| **중복 병합 후 고유 결함** | **≈ 78** |

**안전망 베이스라인**: 리뷰 착수 시 NBL 전용 테스트 **40파일 447건 전원 통과**. 즉 아래 결함들은 "테스트가 잡는데 방치된 것"이 아니라 **안전망 자체에 구멍이 있는 것**이다.

### 세액이 실제로 틀어지는 것을 실측한 8건

| 우선 | 결함 | 실측 세액차 | 방향 |
|---|---|---|---|
| 1 | **A1-01** 기타토지 재산세 분류 미선택이 매퍼에서 조용히 「종합합산」으로 | **76,725,000원** | 과대 |
| 2 | **V7-b** 목장 §104의3①3호 단서를 축산 영위 시 건너뜀 | **76,548,532 / 53,507,025원** | 과대 |
| 3 | **V10-f** 지분분할 일괄양도에서 NBL 플래그 미승계 | **74,661,400원** | 과소 |
| 4 | **A3-01 + V9-a** ⑧ NBL 검증이 조기 return 뒤에 있어 도달 불가 | **65,550,000원** | 과대 |
| 5 | **V2-b** 기간 배열 빈 행 침묵 drop (농지·목장·별장) | **±57,150,000원** | 양방향 |
| 6 | **H-2** 2016.1.1 이전 양도분에 장특공제 적용 (구 §95② 배제 미구현) | **44,000,000원** | 과소 |
| 7 | **E6-01** 일괄양도에서 상가 부수토지 초과분 중과 소실 | **11,683,750원** | 과소 |
| 8 | **V10-a** 컴패니언 자산 NBL 중과 미전송 | **4,263,600원~** | 과소 |

---

## 1. ⚠️ 먼저 정정 — 「비사업용 토지는 장기보유특별공제 배제」는 **현행법상 틀렸다**

리뷰 착수 시 배경 규칙으로 「NBL 중과 = 기본세율 +10%p + 장기보유특별공제 배제」를 제시했으나, **후단이 현행법과 어긋난다**. 2차 검증 에이전트가 이를 잡아냈고 메인 루프가 법령 본문으로 재확인했다.

「소득세법」 §95② (lawId 001565, 시행 2026-07-01, 본문 직접 조회):

> "장기보유 특별공제액"이란 제94조제1항제1호에 따른 자산(**제104조제3항에 따른 미등기양도자산과 같은 조 제7항 각 호에 따른 자산은 제외한다**)으로서 보유기간이 3년 이상인 것 … 표 1에 따른 보유기간별 공제율을 곱하여 계산한 금액

제외 열거는 **미등기양도자산(§104③)과 §104⑦ 각 호 자산(다주택 중과)뿐**이다. 비사업용 토지는 **§104①8호**라 열거에 없으므로 **표1 공제가 그대로 적용**된다. 엔진도 그렇게 동작한다(probe 실측: `isNonBusinessLand` false/true에서 `taxBase` 동일, 차이는 `appliedRate` 0.45↔0.55뿐). 코드 쪽 정본은 `lib/tax-engine/transfer-tax-lthd.ts:341-343` 주석이며 이것이 맞다.

**이 정정의 파급**:
- 1차 리뷰 발견 중 세액영향에 「장특공제 배제분」을 함께 계상한 것들(E1-02·E2-01·E3-01~03·E4-01·U1-01·U1-02·U2-01 등)은 **+10%p 부분만 유효**하고 장특 부분은 과대 계상이다. 판정 뒤집힘(사업용↔비사업용) 자체는 전건 실측으로 확인됐다.
- 반대로 **과거 양도분에는 배제가 실재했고 그것이 구현되지 않았다** — §2.6 H-2.
- 엔진의 `surcharge.longTermDeductionExcluded: true` echo는 현행법과 어긋나지만 **소비처가 0**이라 세액 영향이 없다(E6-04). 결과 카드의 「표1 적용」 표시가 맞다(U3-03).

---

## 2. Critical 티어 — 세액 오류 + 실측 + 정상 UI 경로 도달

각 항목은 **적대적 반증을 통과**했고 `npx tsx` probe로 재현됐다. 인용 file:line은 반증자가 실물 대조한 값이다.

### 2.1 A1-01 — 기타토지 「재산세 과세 분류」 미선택이 매퍼에서 조용히 「종합합산」으로 바뀐다

`lib/tax-engine/non-business-land/form-mapper-helpers.ts:245` · **76,725,000원 과대** (실측 2회)

매퍼가 `|| "comprehensive"` 하드 폴백을 걸고, ⑧ validate에는 이 필드를 요구하는 검증이 없다. 「미선택」이 「종합합산 선언」과 동일하게 취급되어 §104①8호 +10%p가 발동한다. 3중 패턴(UI fallback ↔ API 변환 ↔ validate) 위반이며 저장소의 「자동 fallback 금지」 정책과 정면 충돌한다.

**처방**: `transfer-tax-validate-nbl.ts`의 `other_land` 분기에 `nblOtherPropertyTaxType` 공란 차단 추가. 매퍼 폴백은 유지(제거하면 `""`가 `!== "comprehensive"`로 흘러 반대 방향 오류).

### 2.2 V7-b — 목장 §104의3①3호 **단서**를 축산업 영위 시 통째로 건너뛴다

`lib/tax-engine/non-business-land/pasture.ts:95` · **76,548,532원 / 53,507,025원 과대** (실측 2건)

`isRelatedPasture`(단서 판정 — 상속 3년 이내·사회복지법인등·종중)가 `if (!r1.meets)` 블록 **안에서만** 호출된다. 축산업 영위 기간기준을 **충족한** 목장은 단서 판정을 건너뛰고 기준면적·도시지역·편입유예로 직행한다. 결과는 **「축산업을 영위하면 오히려 비사업용, 영위하지 않으면 사업용」이라는 역전**이다.

법령(KoreanLaw 본문 확인): §104의3①3호 각 목 외 부분 단서 「다만, … 거주 또는 사업과 직접 관련이 있다고 인정할 만한 상당한 이유가 있는 목장용지로서 대통령령으로 정하는 것은 제외한다」 — 단서는 **가목을 포함한 3호 전체**에서 제외한다.

종중(§168의10②2호)만 무조건 의제가 Step 2에서 선점해 가려져 있고, **1호(상속 3년 이내)·3호(사회복지법인등)는 대응 분기가 없어 그대로 노출**된다. 2차 검증에서 결함 반경이 넓어졌다 — 기준면적 축뿐 아니라 **도시지역 축에서도** 터지며, 이쪽은 안분이 없어 전량 중과라 영향이 더 크다.

**처방**: `isRelatedPasture` 호출을 `if (!r1.meets)` 블록 **밖·앞**으로 올려 Step 3-1 직후 단독 게이트로 둔다. ⚠️ 이 수정은 E5-04 처방(레거시 종중 의제를 농지로 한정)보다 **먼저** 들어가야 한다(V7-c) — 순서가 뒤집히면 종중 목장에서 새 회귀가 난다.

### 2.3 V10-a · V10-f — 컴패니언·지분분할 자산의 NBL 중과가 전송되지 않는다

`lib/calc/transfer-tax-api-helpers.ts:320` · `:202` · **4,263,600원 ~ 74,661,400원 과소**

- ⑬ `buildAssetPayload`가 반환 키를 명시 열거하는데 `isNonBusinessLand`가 없다(파일 전체 grep 0건). 서버 `bundled-split-helpers.ts:388`이 `?? false`로 받아 **항상 false 확정**.
- ⑤ 폼 계층에도 쓰기 지점이 없다 — 체크박스는 `SpecialSituationSection.tsx:132-140` 한 곳뿐이고 대상이 `Step4.tsx:100 primary = form.assets?.[0]`.
- **V10-f가 더 나쁘다**: 지분분할 일괄양도(`isFullFractionalBundle`)에서 `mergePrimaryBasic`의 승계 목록 7개에 `isNonBusinessLand`가 빠져, 사용자가 토글을 **명시적으로 켠 상태에서** 지분1만 중과되고 지분2 이상은 빠진다.
- ⑫ Zod(`companionAssetSchema:463`)와 ⑭ 서버는 **이미 배선되어 있다** — 클라이언트만 비어 있다. 「의도된 범위 제한」 가설은 2차에서 기각(V10-c): SINGLE_ONLY 목록에도 없고 차단 검증도 0건.

**처방**: (1) `buildAssetPayload`에 한 줄 추가(`isUnregistered` 선례와 동형) (2) `mergePrimaryBasic` 승계 목록에 추가 (3) 컴패니언 카드에 토글을 열거나, 열지 않을 것이면 SINGLE_ONLY와 같은 층위에서 **명시 차단**.

### 2.4 A3-01 + V9-a — ⑧ NBL 검증이 조기 return 뒤에 있어 도달 불가 → 조용한 모드 강등

`lib/calc/transfer-tax-validate-asset.ts:352` · **65,550,000원 과대** (실측)

`validateNblDetailedJudgment` 호출이 `:352`인데 `carryover_gift`(`:219`→`:307` return null)·`newConstruction`(`:317`→`:345` return null) **뒤**에 있다. 그 취득원인에서는 NBL 필수 입력이 조용히 통과한다. 같은 줄의 주석은 「취득 모드와 직교하므로 **모드 분기 이전에** 검사」라고 적혀 있어 **주석과 배치가 정면 모순**이다.

이어지는 결과가 V9-a다 — ④ `buildNonBusinessLandRaw`가 지목·용도지역 공란이면 `undefined`를 반환해 정밀판정 페이로드가 사라지는데, `isNonBusinessLand` 플래그는 `transfer-tax-api.ts:501`에서 **무조건** 실린다. 엔진은 `nonBusinessLandDetails`가 있을 때만 override하므로(`transfer-tax-judgment-steps.ts:89`) **판정이 사라진 채 사용자 플래그로 +10%p만 남고**, 「엔진 재판정」 step조차 기록되지 않는다. 서버는 「판정 도움 필요」와 「판정 완료」를 구분할 정보 자체를 받지 못한다(`nblUseDetailedJudgment`가 raw 스키마 안에만 있음).

**처방**: 1순위 — ⑧ 호출을 `:219` 앞으로 이동(주석의 취지대로). 2순위 — raw가 undefined면 `isNonBusinessLand`도 함께 내리거나, 모드 플래그를 최상위로 실어 route에서 400 거절.

### 2.5 V2-b — 기간 배열 빈 행이 매퍼에서 침묵 drop된다 (농지 자경 · 목장 축산 · 별장 사용)

`lib/tax-engine/non-business-land/form-mapper-helpers.ts:78` · **±57,150,000원 (양방향)** 실측

`mapBusinessUsePeriods`의 `.filter(p => p.startDate && p.endDate)`가 세 배열에 걸린다. 공용 UI `BusinessUsePeriodsInput.tsx:17-19`의 `addPeriod()`가 **빈 행을 추가하는 정상 경로**이고, ⑧ 검증은 `lib/calc/` 전수 grep **0건**, ⑫ Zod는 `z.string()`이라 빈 문자열을 통과시킨다. 상류에 막는 것이 하나도 없다.

- 목장 축산기간 drop → **+57,150,000원 과대**
- 별장 사용기간 drop → **−57,150,000원 과소** (invertPeriods가 비사용기간을 늘려 REDIRECT로 흘러 사업용이 됨)
- **전량 drop은 fallback이 구제하고 부분 drop만 터진다** — 오판을 알아채기 더 어려운 형태

**정답 패턴이 같은 파일에 이미 있다**: `transfer-tax-validate-nbl.ts:76-90`의 `nblGracePeriods` 검증이 「자동 안분 fallback 금지」 주석과 함께 행 단위 공란을 차단한다. 이 3배열만 sibling 패턴에서 빠져 있다.

> ⚠️ **anchor 작성 주의**: 세액 대조 케이스의 취득일을 **2013-01-01 이후**로 둘 것. 2009.3.16.~2012.12.31. 취득분 중과 한시배제 구간에서는 fix 전후 세액이 모두 같아 안전망이 조용히 무의미해진다(실측).

### 2.6 H-2 · H-3 — 2016.1.1 이전 양도분에 장기보유특별공제가 그대로 적용된다 (구 §95② 배제 미구현)

`lib/tax-engine/transfer-tax-lthd.ts:111` · **44,000,000원 과소** (양도 2014-06-01·취득 2004-01-01·양도차익 4억 실측)

1차 리뷰가 「MCP 조회 실패」로 미결에 남긴 연혁을 2차에서 `legal_analysis(mode=applicable_law)`로 시행일별 본문 대조해 확정했다:

| 시행일 | §95② 괄호 | 비사토 |
|---|---|---|
| 2007.1.1 (제08144호) | §104①2호의3~2호의8 세율 적용 자산 제외 | **배제** (2호의7 = §104의3) |
| 2010.4.1 (제9897호) | §104①4~10호 **및 §104⑥ 적용 자산** 제외 | **배제** (중과유예기간 포함) |
| 2012.4.15 · 2014.1.1 · 2015.5.13 | 미등기 **및 §104의3 비사업용 토지** 제외 | **배제** (직접 명시) |
| **2016.1.1** (제13558호) | 비사토 문구 **삭제** + §95④ 단서 신설(2016.1.1 기산) | **적용** |
| **2017.1.1** (제14389호) | §95④ 비사토 기산 단서 **삭제** | 취득일 기산 |
| 현행 | 미등기 + §104⑦ 각 호만 제외 | **적용** |

`calcLongTermHoldingDeduction`의 배제 분기는 미등기·분양권·승계입주권·다주택 넷뿐이고 **비사업용 토지 축이 없다**. `LthdExclusionReason` union에도 `non_business_land`가 없다. 엔진은 과거 양도일을 **설계상 지원**하므로(`transfer-rate-seed-historical.ts`가 1990-01-01 행부터, route가 양도일로 세율 행 선택) 경정청구·기한후신고 목적의 과거분 계산에서 그대로 터진다.

**H-3**: 2016.1.1~2016.12.31 양도분의 §95④ 단서(2016.1.1 기산)도 미구현 — 2016.1.1 이전 취득 비사토에 취득일 기산 공제율이 붙는다.

> 🔑 **연혁 데이터는 이미 트리 안에 있었다** — `lib/tax-engine/data/lthd-multi-house-exclusion-era.ts:9-17`의 표가 「~2011.12.31」·「2012.1.1~2015.12.31」 구간의 §95② 괄호에 비사업용 토지가 있었음을 DRF 실측으로 적어 두었는데, 그 leaf가 **다주택 축에만 배선**되어 있다.

**처방**: 같은 층위에 NBL 연혁 leaf(`NBL_LTHD_EXCLUSION_LIFTED = "2016-01-01"`, `NBL_LTHD_ACQ_ANCHOR_SUNSET = "2017-01-01"`)를 신설하고 `calcLongTermHoldingDeduction`에 L-0b 분기 추가. `LthdExclusionReason`·`LTHD_EXCLUSION_LABEL`에도 사유를 추가해야 결과 산식이 「보유 N년×2%」로 오도 표시되지 않는다.

### 2.7 E6-01 — 일괄양도에서 상가 부수토지 초과분 중과가 통째로 사라진다

`lib/tax-engine/transfer-tax-aggregate.ts:218` · **11,683,750원 과소** (실측)

STEP 0.62(상업용건물 부수토지 초과분) 파생 주입이 `correctedSingleInput`에 복원되지 않아 그룹 세액 재계산에서 §104①8호 +10%p가 사라진다. 그룹세액 차이 14,403,750원이 §104⑤ 1호(합산 누진) 바닥에 완충되어 최종 11,683,750원 과소. clause8 echo가 0이 되어 §104⑤ 8호 크로스 조정도 함께 소실된다.

**표시 측면(V8-a)**: `properties[]` echo가 단건 결과를 그대로 복사해 「적용세율 50%·중과 10%」를 표시하는데 실제 과세는 40%·0이다 — 사용자가 검산으로 잡을 수 없는 dual truth.

**메타 결함(V8-b)**: `lib/calc/transfer-tax-validate.ts:117-120` 주석이 「상가는 표시 갭일 뿐이라 막을 근거가 없다」고 단정하며 근거로 든 실측이 **양도차익(gain) 대조**였다. 세율이 갈리는 이 결함은 gain 대조로 구조적으로 잡을 수 없고, 주석이 지목한 회귀 방어 테스트도 같은 잘못된 축을 본다.

### 2.8 E5-01 + V4-b — §168의14③4호 무조건 의제가 요건 3건을 전혀 검증하지 않는다

`lib/tax-engine/non-business-land/unconditional-exemption.ts:115`

```
if (u.isUrbanFarmlandJongjoongOrInherited && categoryGroup === "farmland") {
  return { isExempt: true, ... detail: "도시지역 內 농지 중 종중(2005.12.31 이전 취득) 또는 상속 5년 이내 양도" };
}
```

boolean 하나만 보고 의제를 확정한다. detail 문자열은 요건을 말하지만 **아무것도 검사하지 않는다**. 누락 요건 3건:
1. 가목 「2005.12.31 이전 취득」 (종중)
2. 나목 「상속 5년 이내 양도」
3. **본문 「법 §104의3①1호 나목에 해당하는 농지」 = 도시지역 요건** (V4-b, zoneType 미검사 → 도시지역 밖 농지도 플래그만으로 의제)

**형제 분기는 날짜를 검증한다** — 이농(`:138-144`)·레거시 종중(`:153-162`). 이 분기만 예외다. 방향은 중과 전액 소실(과소).

---

## 3. High — 판정이 뒤집히나 세액 금액까지 실측하지는 않은 것

| # | 결함 | 위치 | 방향 |
|---|---|---|---|
| **E2-01** | 농지·목장 「도시지역」 판정에 §104의3①1호나목·3호가목의 **지역 열거**(광역시의 군 · 특별자치시·제주행정시·도농복합시의 읍·면 제외)가 없어 용도지역만으로 비사업용 | `non-business-land/urban-area.ts:31` | 과대 |
| **E2-02 + V3-c** | 재촌 §153③1호 판정이 **일반구(행정구)를 「구」로 취급** — 같은 시 안 다른 구 거주가 탈락. 비연접 일반구 쌍 **5개 시 12쌍**, 창원시는 좌표를 넣어도 42.56km로 30km 분기도 탈락 | `non-business-land/residence.ts:53` | 과대 |
| **E3-01** | 수도권 여부 **「미확인」이 validate를 통과**(`!asset.nblIsMetropolitanArea`가 truthy) → 매퍼가 `undefined`로 접고 → 엔진이 「보수적 기본값」으로 **수도권 3배** 적용. 2022.1.1. 이후 양도분 한정 | `transfer-tax-validate-nbl.ts:44` → `housing-land.ts:63-67` | 과대 |
| **E3-02 + U1-01** | 임야 UI 「문화재 보호림」 토글이 엔진 `isSpecialForestZone`(**특수산림사업지구**, §168의9①2호나목)에 매핑 — 문화유산 보호구역은 ①6호라 공익림(`isPublicInterest`) 계열이어야 한다 | `form-mapper-helpers.ts:165` · `ForestDetailSection.tsx:41` | 과대 |
| **E3-03** | §168의9①2호 단서(도시지역 편입 3년)가 **①1호 공익림·③ 거주/사업관련**에 해당하는 임야까지 비사업용으로 뒤집음 | `non-business-land/forest.ts:186` | 과대 |
| **E4-01** | 주종목을 「선택 안 함」으로 되돌리면 **잔존 추가종목이 기준면적 직접입력을 조용히 덮음** (UI 게이트 ≠ 엔진 게이트). 비사업용 비율 0 → 0.8375 | `non-business-land/other-land.ts:159` | 과대 |
| **E4-02** | 별표3 비고4(실내체육시설 미설치 800㎡)가 **실외 종목 기준면적까지 통째로 덮어씀**. 비율 0 → 0.9304 | `non-business-land/other-land.ts:114` | 과대 |
| **E5-02 + A3-02** | 무조건의제 「단일 소스」 어댑터가 서버와 **다른 필드**에서 §168의14③3호나목 소급 취득일을 읽음. 클라는 평면 `donorAcquisitionDate`, 서버는 중첩 `carryover.donorAcquisitionDate` — 이월과세 토지에서 **일반적으로** 갈림 | `nbl-unconditional-exemption-status.ts:179` | 양방향 |
| **A2-01 + U3-01 + V10-e** | 공익수용 프리필이 `nblUseDetailedJudgment`만 켜서 ⑧가 지목을 요구하는데 **컴패니언 자산에는 입력 칸이 화면에 없다** → 자산 삭제 외 복구 불가, 신고 계산 전체 차단 | `non-business-land-request.ts:57` · `TransferModeBlock.tsx:93` | 차단 |
| **U1-02** | 거주 이력을 추가하면 「직선거리(km)」 입력이 화면에서 사라지나 **store 값은 남아 전송** → 재촌 미인정 이력이 있어도 stale 거리로 전 보유기간 재촌 인정. 농지 경로 한정 | `ResidenceHistorySection.tsx:134` | 과소 |
| **U2-01** | §168의11⑥ 복합용도 안분 입력이 「건축물 있음」 OFF 후에도 살아남아 숨은 상태로 판정을 뒤집음. 비사업용 0㎡ → 750㎡ | `OtherLandDetailSection.tsx:503` | 과대 |

> **U2-01의 뿌리 정정(2차)**: UI가 값을 안 비우는 것이 아니라 **매퍼의 gate 누락**이다. `form-mapper-helpers.ts`의 선택 블록은 전부 자기 토글로 gate되는데(`:216` 연접다필지 · `:304` 공장 · `:358` 공통수입) **⑥ 복합용도만 gate가 없다**(`:249-253` 무조건 매핑). 최소 수정은 `buildOtherLand`에서 `asBool(a.nblOtherHasBuilding)`가 false면 mixedUse 5필드를 undefined로 두는 것 — sibling 3개와 패턴이 일치하고 회귀 표면이 가장 작다.

---

## 4. Medium — 표시·입력 정합성과 좁은 범위 numeric

| # | 결함 | 위치 |
|---|---|---|
| **E1-01** | 레거시 20% 임계가 `1 − 0.8` 부동소수 오차로 1일 낮게 잡혀, 사업용 정확히 80%인 2015.2.2 이전 양도 농·임·목이 뒤집힘 | `period-criteria.ts:206` |
| **E1-02 + V1-a** | 별장 REDIRECT가 `housingFootprint` 없이 `judgeHousingLand`로 자동 재분류되는데 **별장 UI에 정착면적 입력란이 없다**. 기본 상태(공란)에서는 「미입력 → 전량 중과」, 주택부수토지를 먼저 입력했다 지목을 바꾼 상태에서는 **화면에 안 보이는 stale 값**이 배율 판정을 좌우 — 두 방향이 상호보완적으로 성립 | `engine.ts:117` · `form-mapper.ts:166` |
| **E1-03** | 주택부수토지에서 정착면적을 비워 두면 검증에 안 걸리고 「비사업용 전량 중과」로 계산 | `housing-land.ts:39` |
| **E2-03** | 목장 기준면적 자동산출이 0을 반환하면(미등재 축종·두수 0) 경고도 검증도 없이 토지 전량 비사업용 붕괴 | `pasture.ts:152` |
| **E2-04** | 목장 §168의10②1호 「상속 3년 미경과」를 일수÷365로 판정 → 윤년 낀 창에서 하루 일찍 요건 끊김 | `pasture.ts:54` |
| **E2-05 + U1-04** | 농지전용 허가일이 store·Zod까지만 배선되고 매퍼·엔진에 미도달. 게다가 UI가 표시하는 「3년 이내」 요건이 §168의8③4호에 없다 | `form-mapper-helpers.ts:145` · `FarmlandDetailSection.tsx:64` |
| **E3-04** | 임야 도시지역 판정이 보전녹지지역을 제외하지 않음 — 주석은 「보전녹지 제외」라고 단언하나 코드·ZoneType·UI 어디에도 구분이 없다 | `urban-area.ts:52` |
| **E4-03** | 별표5(종업원 체육시설) 실내체육시설 부속토지에 §101② 용도지역별 적용배율이 미적용 | `other-land.ts:140` |
| **V6-a** | 실내 종목이 둘 이상이면 **자산당 단일 필드인 실내 바닥면적이 종목 수만큼 중복 계상**(500㎡ 건물이 두 번 배율을 먹음: 7,000 vs 3,500). 뿌리는 타입(`sportsExtraEvents`=실외 전용)과 UI 칩(실내 3종 포함)의 불일치를 `as` 캐스팅이 가려준 것 | `other-land.ts:147` |
| **V6-b** | 별표3 비고5 테니스 **선수가산이 주종목일 때만** 적용 — 추가종목 테니스에는 안 붙음(1,616 vs 11,650). 납세자 **불리** 방향 | `other-land.ts:107` |
| **E5-03** | 공동소유 지분이 두 개의 비동기 필드로 존재하고 NBL 토지가액 자동조회만 검증 없는 쪽을 곱함 | `NblLandAutoFetch.tsx:65` |
| **V5-b** | `nblUrbanIncorporationDate`를 요구하는 ⑧ 검증이 **0건** — 도시지역 선택 + 편입일 공란이 아무 경고 없이 통과, 「모른다」가 「3년 경과」와 같게 처리됨(농지·목장·임야 3지목 동일) | `transfer-tax-validate-nbl.ts:28` |
| **E6-05** | 다건(⑬) 변환에만 `isNonBusinessLand`의 assetKind 게이트가 없다 — 단건과 3중 패턴 불일치 | `multi-transfer-tax-api.ts:186` |
| **A1-02** | 거주이력·사업용 사용기간 행의 날짜가 비면 매퍼가 조용히 버리고 ⑧에도 검증 없음 (V2-b의 농지 축) | `form-mapper.ts:116` |
| **U1-03** | 주택부수토지 배율 배지가 **양도일을 전달하지 않아** 2022.1.1. 전 양도분에서 화면 3배 / 엔진 5배 | `HousingLandDetailSection.tsx:39` |
| **U3-02** | 결과 카드 「재촌 인정 근거」가 임야 판정에도 「농지 … §153③」으로 표시 (임야 근거는 §168의9②) | `NonBusinessLandResultCard.tsx:32` |
| **V7-c** | E5-04 처방(레거시 종중 의제를 농지로 한정)이 **V7-b를 종중 목장에서 새로 활성화**한다 — 수정 순서 의존 | `unconditional-exemption.ts:154` |
| **V9-c** | `newConstruction`도 같은 조용한 강등. 다만 land에서 ⑧을 건너뛰는 조기 return은 `carryover_gift`·`newConstruction` **둘뿐**임을 전수 확인 | `transfer-tax-validate-asset.ts:317` |

Low 29건(1차) + 15건(2차)은 부록에 있다 — 대부분 조문 인용 표기·dead 경로·안내문 드리프트다.

---

## 5. 안전망 구멍 — 완전성 비평 결과

리뷰보다 이쪽이 재발 위험이 크다.

| # | 구멍 | 근거 |
|---|---|---|
| **COV-3** 🔴 | **NBL E2E 8건 중 중과세액(+10%p)을 단언하는 spec이 0건**. `transfer-nbl-academy-land.spec.ts:194`는 기대값 10줄을 **주석에 적어두고** `not.toBe("")` 3건만 단언하는 캡처 하네스다 | E2E 8 spec 전수 |
| **COV-2** 🔴 | 시드에서 `surcharge.non_business_land`가 사라지면 +10%p가 **경고 0으로 조용히 증발**하는데 이를 잡는 테스트가 한 건도 없다 | `transfer-tax-rate-calc.ts:352` |
| **COV-1** | DB/시드로 주입되는 NBL 판정 규칙이 optional 3개 그룹을 통째로 떨어뜨려, **2015.2.2 이전 양도 농·임·목 레거시 임계(0.8)가 프로덕션 경로에서 절대 적용되지 않는다** | `schemas/rate-table.schema.ts:337` |
| **COV-6** | 이력→마법사 복원의 유일한 정규화 지점이 이번 리뷰 정독 범위 밖이었고, 최신 `nblRevenue*` 18필드에 stale-record 처리가 없다 | `calc-wizard-asset-migrate.ts:141` |
| **COV-5** | 폼 초기값 이중진실 — `NBL_DEFAULTS`(102필드)를 아무도 import하지 않고 `makeDefaultAsset`이 별도 117필드를 인라인 정의, 이미 **15필드가 벌어져 있다** | `calc-wizard-asset-nbl.ts:258` |
| **COV-7 · D-1** | 세율 시드의 장특공 `exclusions`에 `non_business_land`가 남아 현행 §95②과 정면으로 어긋난다(다행히 엔진이 읽지 않아 죽어 있다) | `transfer-rate-seed.ts:56` |

**반증된 의심 2건**: 법령검증 매니페스트에 NBL 조문이 빠져 있다는 의심(COV-8)은 기각 — §168의6~14 전건 + 시행규칙 §83의4·§83의5가 등록돼 있고 커버리지 테스트가 통과한다. 다건 결과 화면이 NBL 판정 근거를 안 싣는다는 의심(COV-9)도 기각 — 단건과 같은 공용 컴포넌트를 재사용하고 별도 렌더러 신설을 막는 소스 동기화 가드까지 있다.

---

## 6. 수정 순서 (의존관계 강제)

1. **V7-b** (목장 §104의3①3호 단서) → **그 다음에야** E5-04(레거시 종중 의제 한정). 순서가 뒤집히면 종중 목장에서 새 회귀.
2. **E3-03** (임야 제외사유 게이트) → **그 다음에** V5-b(편입일 ⑧ 검증). E3-03이 먼저 들어가면 V5-b의 실패 반경이 좁아진다.
3. **E2-02 + V3-b**(재촌 일반구)는 **반드시 동시에** — `residence.ts:64` 주석이 `farming-residence-check.ts`와 「알고리즘 미러」임을 명시하고, 2차 검증에서 그 미러가 **법령상 정당**함이 확정됐다(V3-a 기각). 한쪽만 고치면 양도세·상속세가 갈린다.
4. **E2-01**(도시지역 지역 열거)은 **leaf 시그니처를 바꾸지 말 것** — `isUrbanForFarmland`의 다른 호출부 `unconditional-exemption.ts:73`(§168의14③1의2호)은 지역 열거가 없는 조문이라 leaf를 고치면 조용히 틀어진다. `farmland.ts:217`·`pasture.ts:197` **호출부에서만** 수정.
5. **V6-a**(실내 중복 계상)는 「타입을 넓힐지 / UI 칩에서 실내를 뺄지」를 먼저 정해야 산식 수정 범위가 확정된다.
6. **V10-a**(⑬ 한 줄) → **V10-f**(승계 목록) 동시. ⑬가 키를 emit하는 순간 `mergePrimaryBasic` 목록에 들어와야 정합이 유지된다.

---

## 7. 미확정 (UNCERTAIN)

- **V5-d**: 임야만은 §168의9①2호가 「단서」로 과세측 재포섭 구조라, 편입일 미입력 시 유예 미적용이 입증책임 배분과 어긋날 소지 — 법리 판단 필요.
- **COV-10**: 신고서 양식 표에 「세율」 행 자체가 없어 NBL 중과세율이 서식에 드러나지 않는다(상세명세서에는 표시). 서식 정본 확인 필요.

---

## 부록 A — 1차 확정 60건

### E1-02 🔴 `dead-code` — 별장 REDIRECT가 주택부수토지로 자동 재분류되면서 「주택 정착면적 미입력」에 걸려 비사업용 전량 중과로 확정된다 — Bug-01 가드가 죽어 있다

**위치** `lib/tax-engine/non-business-land/engine.ts:117` · **세액영향** 판정 뒤집힘 — 별장 REDIRECT 경로의 모든 토지가 `nonBusinessAreaRatio: 1`(전량) +10%p 중과 + 장특공 전액 배제. 예: 양도차익 5억·보유 14년이면 손계산으로 산출세액 117,060,000원(사업용: 장특공 표1 28% 적용, §55① 40%·누진공제 25,940,000) → 222,810,000원(비사업용: 장특공 0, 50%)으로 약 1억 575만원 증가. (이 원 단위 수치는 전이엔진 실행이 아니라 §95②표1·§55① 표에 따른 손계산이다 — 판정 뒤집힘 자체는 probe로 실증했다.) · **안전망** __tests__/tax-engine/non-business-land/engine.test.ts:92-112 · qa-land-type-flow.test.ts:322-347 · qa-integration.test.ts:281-301 — 세 건 모두 `expect(r.needsRedirect).toBe(false)` 와 `expect(typeof r.isNo

**결함**  「Bug-01 가드가 죽어 있다」가 아니라 **2026-04-25 P5-B에서 의도적으로 죽인 것**이다(engine.ts:218-220 주석이 stale). 살아남는 결함은 그 다음 단계다 — 별장 REDIRECT가 `housingFootprint` 없이 `judgeHousingLand`로 자동 재분류되는데 별장 UI(NblSectionContainer.tsx:201 → VillaLandDetailSection)에 정착면적 입력란이 없고 ⑧ validate에도 차단이 없어, REDIRECT 경로는 **구조적으로 항상** housing-land.ts:39 「정착면적 미입력」 분기에 떨어져 `nonBusinessAreaRatio:1` 전량 중과로 확정된다.

**재현**  입력: landType `villa_land`, landArea 500㎡, zoneType `management`, 취득 2010-01-01, 양도 2024-01-01, 별장 사용기간 2023-06-01~2023-07-01(30일)만 입력, 정착면적 필드 없음. 실행(judgeNonBusinessLand probe) 결과: `isNonBusinessLand: true`, `needsRedirect: false`, `judgmentReason: "정착면적 미입력"`, `surcharge: {additionalRate: 0.1, nonBusinessAreaRatio: 1, longTermDeductionExcluded: true}`. steps에는 `villa_non_use_period:PASS`(별장 비사용기간 기간기준 충족) 바로 뒤에 `housing_footprint:FAIL:정착면적 미입력`이 찍힌다. 즉 「별장이 아님」이 확인된 토지가 그 사실 때문에 전량 비사업용 중과된다.

**법령**  「소득세법」 제104조의3 제1항(KoreanLaw MST 280405, 본문 조회 확인) — 비사업용 토지는 「소유기간 중 대통령령으로 정하는 기간 동안 다음 각 호의 어느 하나에 해당하는 토지」이고 별장 부속토지는 제6호, 주택부속토지 배율초과분은 제5호다. 별장 비사용기간이 기간기준을 충족하면 제6호에 해당하지 않으며, 정착면적을 입력받지 못한 상태에서는 제5호 「배율을 곱하여 산정한 면적을 초과하는 토지」가 존재한다고 볼 근거가 없다.

**처방**  REDIRECT 재분류 시 `action`/`redirectHint`를 catResult에 보존해 `needsRedirect` 가드가 살아 있게 하거나, 재분류 대상 지목의 필수 입력(정착면적)이 없으면 재분류를 하지 말고 REDIRECT 상태(판정 보류 + UI 재입력 요구)로 반환할 것. 어느 쪽이든 「정착면적 미입력」이 중과로 귀결되어서는 안 된다.

### E2-01 🔴 `legal-accuracy` — 농지·목장 「도시지역」 판정에 법 §104의3①1호나목·3호가목의 지역요건(광역시의 군·도농복합시 읍면 등 제외)이 없다 — 군 지역 농지·목장이 용도지역만으로 비사업용

**위치** `lib/tax-engine/non-business-land/urban-area.ts:31` · **세액영향** 판정 flip(사업용→비사업용): 기본세율 +10%p 및 장기보유특별공제 배제. 구체 세액 금액은 산출하지 않았다(판정 플립까지만 실측). · **안전망** 없음 — __tests__/tax-engine/non-business-land/urban-area.test.ts는 용도지역 축(주·상·공/녹지/농림·2008.2.21 경계)만 단언하고, farmland.test.ts·pasture.test.ts에도 군·읍·면 케이스가 없다(grep 「군」·「읍」 0건).

**결함**  엔진의 농지·목장 「도시지역」 판정에 §104의3①1호나목·3호가목의 지역 열거 축(광역시의 군·특별자치시 읍면·제주 행정시 읍면·도농복합시 읍면 제외, 도의 군은 애초 비대상)이 없어 해당 지역 농지·목장이 용도지역만으로 비사업용으로 뒤집힌다. 단, isUrbanForFarmland의 다른 호출부인 unconditional-exemption.ts:73(§168의14③1의2호)은 지역 열거가 없는 조문이므로 수정 대상이 아니다 — leaf 공통 수정 금지, 호출부별 판정 필요.

**재현**  부산광역시 기장군 소재 농지(일반주거지역), 2014-01-01 취득·2024-01-01 양도, 전 기간 재촌·자경, 도시지역 편입일 미입력 → 엔진 isNonBusinessLand=true(비사업용) → 양도세에 기본세율 +10%p 중과 + 장기보유특별공제 배제. 법문상 광역시의 군은 나목 대상 지역이 아니므로 재촌·자경 요건만 충족하면 사업용이어야 한다(과다과세 방향). 목장용지도 동일(기장군·일반주거·축산 영위·기준면적 이내 → 엔진 비사업용).

**법령**  「소득세법」 제104조의3①1호나목(KoreanLaw get_law_text mst=280405): 「특별시ㆍ광역시(광역시에 있는 군은 제외한다…)ㆍ특별자치시(특별자치시에 있는 읍ㆍ면지역은 제외한다)ㆍ특별자치도(…행정시의 읍ㆍ면지역은 제외한다) 및 시지역(「지방자치법」 제3조제4항에 따른 도농 복합형태인 시의 읍ㆍ면지역은 제외한다) 중 …도시지역…에 있는 농지」. 같은 항 3호가목도 목장용지에 대해 동일한 지역 열거를 둔다. 「소득세법 시행령」 제168조의8④·제168조의10④(mst=286211)은 그 도시지역에서 제외할 지역을 「녹지지역 및 개발제한구역」으로만 정하므로, 지역 열거(군·읍면 제외) 축은 법률 본문이 유일한 근거다.

**처방**  엔진 입력에 소재지 구분 축(광역시의 군 / 특별자치시·제주행정시·도농복합시의 읍·면 여부)을 추가하고, isUrbanForFarmland·isUrbanForPasture 호출 전에 「법 §104의3①1호나목·3호가목 대상 지역인지」를 먼저 판정해 대상 밖이면 도시지역 판정 자체를 건너뛴다. 입력이 없으면 자동 추정하지 말고 검증 오류로 차단(자동 fallback 금지 정책).

### E3-01 🔴 `plumbing` — 주택부수토지 「수도권 여부 = 미확인」이 validate를 통과하고 엔진이 수도권(3배)로 조용히 후퇴 → 비수도권 도시 주·상·공에서 부수토지 40%가 비사업용 중과

**위치** `lib/calc/transfer-tax-validate-nbl.ts:44` · **세액영향** 과세표준 10억원 기준 중과세액 0원 → 40,000,000원(장특공제 배제분 별도) · **안전망** __tests__/lib/calc/nbl-housing-land-metropolitan-validate-b6.test.ts — B6-1~B6-8이 ""·"yes"·"no"만 덮고 "unknown"은 한 케이스도 없다(안전망 부재).

**결함**  주장은 유효하되 **양도일 2022-01-01 이후 양도분에 한정**된다. urban-area.ts:105-110의 부칙 §39 경과조치 분기가 2022-01-01 전 양도분은 도시지역 일률 5배를 반환하므로(수도권 축 무시) 그 이전 양도분에는 3배↔5배 플립이 발생하지 않는다. 원 발견의 실패 시나리오(양도 2024-01-01)는 이 범위 안에 있어 결론은 그대로 유지된다.

**재현**  비수도권(예: 부산) 일반주거지역 주택, 정착면적 100㎡, 부수토지 500㎡. 사용자가 「수도권 여부」에 「미확인」을 고르면 마법사가 통과되고 엔진이 3배(허용 300㎡)를 적용해 초과 200㎡(=40%)를 비사업용으로 판정한다. 정답은 1호다목 5배(허용 500㎡) → 전부 사업용·중과 0. 과세표준 10억원이면 transfer-tax-rate-calc.ts:357-360 `applyRate(taxBase, 0.4)` → `applyRate(400,000,000, 0.10)` = **+40,000,000원 중과** + 장기보유특별공제 배제까지 추가로 불리해진다.

**법령**  「소득세법 시행령」 제168조의12(KoreanLaw mst=286211 본문 실측) — 1호가목 「수도권 내의 토지 중 주거지역·상업지역 및 공업지역 내의 토지: 3배」, 1호다목 「수도권 밖의 토지: 5배」. 수도권 여부가 배율을 3배↔5배로 가른다.

**처방**  validate 게이트를 `!asset.nblIsMetropolitanArea || asset.nblIsMetropolitanArea === "unknown"`으로 넓히고(미입력=차단, 자동 fallback 금지 정책), B6 테스트에 "unknown" 케이스를 추가한다. 「미확인」 선택지를 남길 이유가 없다면 METRO_OPTIONS에서 제거하는 편이 단순하다.

### E3-02 🔴 `ui-engine-drift` — 임야 UI 「문화재 보호림」 토글이 엔진의 `isSpecialForestZone`(특수산림사업지구)에 매핑되어 §168의9①2호 단서(도시지역 편입 3년) 지역기준이 오적용된다

**위치** `lib/tax-engine/non-business-land/form-mapper-helpers.ts:165` · **세액영향** 양도소득과세표준 10억원·§55① 누진 기준으로 중과분 +100,000,000원(10%p 전량) + 장특공제 배제 · **안전망** __tests__/tax-engine/non-business-land/forest.test.ts:106-114 은 `isSpecialForestZone: true` + **도시지역 밖**만 검증한다(도시지역 內 조합은 라벨 관점에서 검증되지 않음). UI 라벨↔엔진 필드 매핑을 검증하는 테스트는 grep 0건.

**결함**  UI가 「문화재 보호림」(=§168의9①6호 문화유산 보호구역 안의 임야)으로 라벨링한 토글을 엔진의 `isSpecialForestZone`(=§168의9①2호나목 특수산림사업지구)에 그대로 꽂아, 2호에만 붙는 도시지역 단서가 6호 임야에 적용되어 비사업용으로 뒤집힌다.

**재현**  문화유산 보호구역 안의 임야(5,000㎡), 일반주거지역, 2012-01-01 도시지역 편입, 2010-01-01 취득 → 2024-01-01 양도, 재촌 없음. 사용자가 「문화재 보호림」만 체크 → 엔진 `isBusiness=false`(비사업용) → 기본세율 +10%p 중과 + 장기보유특별공제 배제. 정답은 §168의9①6호 해당 → 법 §104의3①2호가목으로 제외 → 사업용(중과 0).

**법령**  「소득세법 시행령」 제168조의9 제1항(KoreanLaw mst=286211 본문 실측). 「다음 각 호의 어느 하나에 해당하는 임야」로 1~14호를 병렬 열거하고, 도시지역 편입 3년 단서는 **2호 본문 안**에만 있다(「다만, …도시지역(…보전녹지지역을 제외한다. 이하 **이 호에서** 같다) 안의 임야로서 도시지역으로 편입된 날부터 3년이 경과한 임야를 제외한다」). 문화유산·자연유산 보호구역 안의 임야는 **6호**로 별도 열거되어 단서의 적용을 받지 않는다.

**처방**  둘 중 하나를 택한다. (a) UI 라벨을 「특수산림사업지구」로 정정하고 §168의9①6호(문화유산·자연유산 보호구역)는 `isPublicInterest`(①1·3~14호 묶음)로 안내한다. (b) `nblForestIsProtected`를 `isPublicInterest` 쪽에 합류시키고 특수산림사업지구용 별도 토글을 신설한다. 어느 쪽이든 「지역기준을 태우는 플래그 = 2호가목·나목뿐」이라는 불변식을 anchor로 고정할 것.

### E3-03 🔴 `legal-accuracy` — §168의9①2호 단서(도시지역 편입 3년)가 다른 제외사유(①1호 공익림·③ 거주/사업관련)에 해당하는 임야까지 비사업용으로 뒤집는다

**위치** `lib/tax-engine/non-business-land/forest.ts:186` · **세액영향** 과세표준 10억원 기준 중과분 +100,000,000원 + 장특공제 배제 · **안전망** __tests__/tax-engine/non-business-land/forest.test.ts:116-128 「시업중 임야 + 도시지역 內 + 편입 5년 경과 → 비사업용」이 `forestDetail: { isPublicInterest: true, hasForestPlan: true }`로 **이 동작을 의도적으로 고정**하고 있다(`expect(r.is

**결함**  Step 3-1-1이 공익림(①)·거주/사업관련(③)·시업중(①2호)을 하나의 OR 플래그로 합친 뒤 Step 3-2가 `inSiupOrSpecialZone`만 보고 지역기준을 태우기 때문에, ①1호나 ③ 사유로 이미 제외 대상인 임야가 산림경영계획 인가를 함께 받았다는 이유만으로 비사업용이 된다.

**재현**  상속받은 임야(상속개시 2022-06-01, 양도 2024-01-01 — 상속 3년 미경과)로 산림경영계획 인가도 받은 토지. 일반주거지역, 2012-01-01 도시지역 편입, 재촌 없음. 엔진 → `isBusiness=false`("시업중 임야 + 도시지역 內 유예 외 → 비사업용") → +10%p 중과 + 장특공제 배제. 정답은 §168의9③7호(=법 §104의3①2호다목) 해당 → 사업용. 「산림경영계획 인가」 토글을 끄면 같은 토지가 사업용이 되는, 납세자에게 유리한 사실을 추가로 신고할수록 세금이 늘어나는 역전이 발생한다.

**법령**  「소득세법」 제104조의3 제1항 제2호(KoreanLaw mst=280405 실측) — 「임야. 다만, 다음 각 목의 **어느 하나에 해당하는 것은 제외**한다. 가.(공익·산림보호 임야) 나.(임야소재지 거주자 소유) 다.(거주 또는 사업과 직접 관련)」. 「소득세법 시행령」 제168조의9 제1항(mst=286211 실측)은 1~14호를 「어느 하나에 해당하는 임야」로 병렬 열거하고, 도시지역 편입 3년 단서는 2호 본문 안에서 「이하 **이 호에서** 같다」로 스코프가 못박혀 있다. 같은 조 ③7호(상속개시일부터 3년이 경과하지 아니한 임야)·③1호(임업후계자)는 다목 사유로 지역기준과 무관하다.

**처방**  Step 3-2의 게이트를 「제외사유가 **오직** ①2호가·나목뿐일 때만 지역기준 적용」으로 좁힌다: `const onlySiup = inSiupOrSpecialZone && !publicProtected && !related.applies;` → `if (!onlySiup) return buildPass(...)`. 동시에 forest.test.ts:116 케이스를 「isPublicInterest 없이 hasForestPlan만」으로 바꿔 2호 단독 경로를 계속 덮되, ①1호·③ 병존 조합은 사업용으로 고정하는 anchor를 추가한다.

### E4-01 🔴 `ui-engine-drift` — 주종목을 「선택 안 함」으로 되돌리면 잔존 추가종목이 기준면적 직접입력을 조용히 덮는다 (UI 게이트 ≠ 엔진 게이트)

**위치** `lib/tax-engine/non-business-land/other-land.ts:159` · **세액영향** 위 시나리오에서 비사업용 면적비율 0 → 0.8375. 예: 양도소득금액 5억 기준, 비사토 귀속분 4.19억에 +10%p 중과(≈+4,190만원) 및 장특공 배제분이 추가로 발생. · **안전망** 없음 — __tests__/tax-engine/non-business-land/other-land-area-limit.test.ts:244 `AT-F2-SPORTS-FALLBACK`(종목 미선택 + standardAreaLimit 3,000 → 직접입력 유지)은 `sportsExtraEvents`가 없고, :576~:650 `AT-F2B-AGG-1~4`(합

**결함**  주장 유지. 다만 UI 인용 줄번호를 정정한다 — 직접입력 게이트는 OtherLandDetailSection.tsx:388(392 아님), 칩 블록 :342(344 아님), onCheckedChange :350-357, Select onValueChange :331-333.

**재현**  UI 조작: 체육시설(1호) → 직장운동경기부(별표3) → 종목 「축구장」 선택 → 추가 보유 종목 「테니스장」 체크 → 종목 Select를 「선택 안 함 (직접입력)」으로 되돌림(추가종목 칩 UI는 사라지지만 값은 남음) → 노출된 「기준면적 직접입력」에 5,000 입력. 토지면적 4,000㎡. → 기대: 기준면적 5,000 ≥ 4,000 → 전량 사업용(nonBusinessRatio 0, 중과 없음). 실제: 기준면적 650(테니스장 표값) → nonBusinessArea 3,350㎡ · nonBusinessRatio 0.8375 → 양도소득금액의 83.75%에 +10%p 중과 + 장기보유특별공제 배제.

**법령**  소득세법 시행령 §168조의11①1호 + 소득세법 시행규칙 §83조의4①③(별표3·별표4). KoreanLaw 본문 확인(소득세법 시행령 mst=286211 §168조의11①1호 「…재정경제부령이 정하는 선수전용 체육시설의 기준면적 이내의 토지」 · 시행규칙 mst=286379 §83의4① 「별표 3의 기준면적」, ③ 「별표 4의 기준면적」 · 별표3/별표4 표값·비고 전문 조회). 잔존 종목 하나만으로 기준면적을 산정할 법적 근거는 없다 — 사용자가 신고한 실제 기준면적(직접입력)을 무시하는 결과다.

**처방**  엔진 게이트를 UI·validate와 일치시킨다 — `resolveAreaLimit`의 sports 분기에서 events 구성 시 주종목이 비어 있으면 extras를 무시하고 `standardAreaLimit`로 떨어뜨리거나(`if (!o.sportsFacilityType) return o.standardAreaLimit;`), 반대로 UI가 주종목 해제 시 `nblOtherSportsExtraEvents: []`(및 `nblOtherSportsPlayerCount`·`nblOtherIndoorNotInstalled`)를 함께 리셋한다. 어느 쪽이든 「직접입력이 화면에 보이는데 엔진이 안 쓰는」 상태를 없애는 것이 요건.

### E4-02 🔴 `legal-accuracy` — 별표3 비고4(실내체육시설 미설치 800㎡)가 실외 종목 기준면적까지 통째로 덮어쓴다

**위치** `lib/tax-engine/non-business-land/other-land.ts:114` · **세액영향** 위 시나리오에서 nonBusinessRatio 0 → 0.9304. 실외 종목 기준면적(별표3 최대 야구장 14,000㎡)만큼이 통째로 비사업용으로 넘어간다. · **안전망** 없음 — other-land-area-limit.test.ts:534 `AT-F2B-5c`(workplace 실내(수영) 미설치 → 800)는 `sportsExtraEvents`가 없는 단일 실내 종목이라 대입/가산 차이가 드러나지 않는다. 실외 종목 + indoorNotInstalled 조합 테스트는 0건.

**결함**  별표3 비고4는 **실내 운동경기부의 몫**을 800㎡로 인정하는 규정인데, 코드는 종목 합산 결과 전체를 800으로 치환(`result = 800`)해 함께 보유한 실외 종목(축구장 11,000㎡ 등)의 기준면적을 소멸시킨다.

**재현**  직장운동경기부가 축구부(실외)와 핸드볼부(실내, 실내체육시설 미설치)를 두고 있는 나대지 11,500㎡. UI: 체육시설(1호) → 직장운동경기부(별표3) → 종목 「실내 구기·격투·체조 등」 → 추가 보유 종목 「축구장」 체크 → 「실내체육시설 미설치」 토글 ON. → 기대: 11,000(축구장) + 800(비고4) = 11,800 ≥ 11,500 → 전량 사업용. 실제: 기준면적 800㎡ → 비사업용 10,700㎡ · nonBusinessRatio 0.9304 → 양도소득금액의 93.04%에 +10%p 중과·장특공 배제.

**법령**  소득세법 시행규칙 [별표 3] 비고4 verbatim(KoreanLaw get_annexes 실측): 「실내운동경기를 할 수 있는 운동경기부를 두고 있는 자가 실내체육시설을 설치하지 아니한 경우에는 800제곱미터를 기준면적으로 인정한다」 — 인정 대상은 그 실내 운동경기부이며 실외 종목 기준면적(비고2 축구 11,000 등)을 배제한다는 문언이 없다. 같은 별표 비고2는 축구·야구·럭비·필드하키·미식축구 5종목군에 한해서만 「그 중 가장 넓은 것 하나만」 인정하도록 명시해, 그 밖의 종목은 합산이 원칙임을 반증한다(코드 자신도 `sumSportsEvents`에서 이 합산 원칙을 채택하고 있다 — other-land.ts:80-90). 별표4에는 비고4 자체가 없어 workplace 한정 게이트는 정확하다.

**처방**  `applySportsNotes`에서 비고4를 전체 치환이 아니라 실내 종목분 대체로 좁힌다 — `sumSportsEvents`가 실내/실외를 분리해 반환하도록 하고, `indoorNotInstalled`일 때 실내분만 800으로 바꿔 실외 합과 더한다. 최소 수정은 실내 종목 lookup 단계(`lookupStd`)에서 `indoorNotInstalled && cat==="workplace"`이면 표값 대신 800을 돌려주고 `applySportsNotes`의 대입문을 제거하는 것.

### E5-01 🔴 `legal-accuracy` — §168의14③4호 무조건 의제가 날짜 요건을 전혀 검증하지 않아 요건 미달 토지도 사업용으로 확정된다

**위치** `lib/tax-engine/non-business-land/unconditional-exemption.ts:115` · **세액영향** 비사업용 중과 전액. 기본세율 +10%p(§104①8호)와 장기보유특별공제 배제가 통째로 사라진다. 과세표준 3억, 보유 15년 가정 시 +10%p만으로도 3,000만원 규모의 세액 차이. · **안전망** __tests__/tax-engine/non-business-land/unconditional-exemption.test.ts:185-197 ("§168-14 ③4호 — 도시지역 內 농지 종중/상속 5년 이내" > "플래그 true + 농지 → 의제") — 날짜 없이 플래그만으로 의제 성립을 현행 동작으로 고정하고 있다. 즉 현행은 「자기신고 토글」 설계이

**결함**  원 주장 유지 + 요건 누락이 하나 더 있다. §168의14③4호 **본문**은 「법 제104조의3제1항제1호 **나목**에 해당하는 농지」로 한정하는데(=도시지역 안의 농지), 코드는 zoneType도 검사하지 않는다. 따라서 누락 요건은 「가목 2005.12.31 이전 취득」·「나목 상속 5년 이내」 2건이 아니라 **본문 도시지역 요건까지 3건**이다 — 도시지역 밖 농지도 플래그만으로 의제가 성립한다.

**재현**  실측(throwaway probe, judgeNonBusinessLand 직접 호출): landType=farmland, zoneType=commercial(도시지역 상업), acquisitionDate=2015-01-01, transferDate=2024-06-01, unconditionalExemption={ isUrbanFarmlandJongjoongOrInherited: true } → `isNonBusinessLand=false`, judgmentReason="사업용 (무조건 의제: 도시지역 內 농지 중 종중(2005.12.31 이전 취득) 또는 상속 5년 이내 양도)", `surcharge.additionalRate=0`. 같은 입력에서 토글만 끄면 `isNonBusinessLand=true`, `additionalRate=0.1`. 2015년 취득이라 가목(2005.12.31 이전)도, 2024년 양도라 나목(상속 5년 이내)도 충족하지 못하는데 의제가 성립한다. 상세 문구는 「2005.12.31 이전 취득」이라고 단정 출력까지 한다.

**법령**  KoreanLaw get_law_text(mst=286211, jo=제168조의14) 본문 확인 — 「③4. 법 제104조의3제1항제1호 나목에 해당하는 농지로서 다음 각 목의 어느 하나에 해당하는 농지 / 가. 종중이 소유한 농지(2005년 12월 31일 이전에 취득한 것에 한한다) / 나. 상속에 의하여 취득한 농지로서 그 상속개시일부터 5년 이내에 양도하는 토지」. 코드에는 「2005년 12월 31일 이전 취득」도 「상속개시일부터 5년 이내」도 구현되어 있지 않다.

**처방**  형제 분기(:153-162)와 같은 형태로 가목/나목을 분리 판정한다. 가목: `u.jongjoongAcquisitionDate <= JONGJOONG_CUTOFF`(이미 존재하는 필드 재사용), 나목: `u.inheritanceDate && transferDate < addYears(u.inheritanceDate, 5)`. 날짜 미입력 시에는 의제 미성립(자동 fallback 금지 정책과 일관)으로 두고, ⑧ validate에서 토글 ON 시 해당 날짜를 필수로 차단한다.

### E5-02 🔴 `ui-engine-drift` — 무조건 의제 「단일 소스」 어댑터가 서버와 다른 필드에서 §168의14③3호나목 소급 취득일을 읽는다

**위치** `lib/calc/nbl-unconditional-exemption-status.ts:179` · **세액영향** 표시only + 불필요한 입력 강제(주 방향). 반대 방향(평면 필드에 stale 값이 남고 carryover 쪽이 비었거나 값이 다른 경우 — 사용자가 취득원인을 「증여」→「이월과세 증여」로 바꾼 뒤)은 클라이언트가 isExempt=true로 판단해 buildNonBusinessLandRaw(non-business-land-request.ts:56-65)가 지목 없이 페이로드를 보내고, 서버는 의제 불성립 → landType="" → engine.ts:141-160 default 분기 → `isNonBusinessLand=true`, `additionalRate=0.1`, `nonBusinessAreaRatio=1`(probe 실측). 이 방향은 조용한 +10%p 오부과다. · **안전망** 없음 — `evaluateUnconditionalExemption`이 `asset.carryover.donorAcquisitionDate`를 읽는지 검증하는 테스트를 __tests__/lib/calc/ 및 __tests__/tax-engine/non-business-land/ 에서 찾지 못했다. __tests__/tax-engine/non-business-

**결함**  주 방향(표시only + 불필요한 입력 강제)과 반대 방향(조용한 +10%p 오부과)이 **둘 다 재현된다**. 반대 방향은 「사용자가 취득원인을 증여 → 이월과세 증여로 바꾸고 두 필드 값이 다를 때」 성립하며, 전환 핸들러가 평면 필드를 초기화하지 않으므로 세션 내 단순 조작으로 도달한다. 따라서 severity는 medium이 아니라 high다.

**재현**  실측(throwaway probe, buildUnconditionalExemption 직접 호출): 공통 입력 nblExemptPublicExpropriation=true, nblExemptPublicNoticeDate="2020-06-01", acquisitionCause="carryover_gift". ① 서버 형태 `{ donorAcquisitionDate: "2010-01-01" }` → `expropriationAcquisitionDate = 2010-01-01T00:00:00.000Z` → §168의14③3호나목 5년 이전 충족 → 의제 성립. ② 클라이언트 형태 `{ carryover: { donorAcquisitionDate: "2010-01-01" }, donorAcquisitionDate: "" }` → `expropriationAcquisitionDate = undefined` → unconditional-exemption.ts:101이 `input.acquisitionDate`(=증여일, 예 2018-01-01)로 fallback → 고시일 2.5년 전이라 의제 불성립. 결과: 결과카드 배지·배너가 「미충족」으로 표시되고, transfer-tax-validate-nbl.ts:28-31이 실제로는 불필요한 지목·용도지역 입력을 강제한다(서버는 지목과 무관하게 의제로 사업용 확정).

**법령**  KoreanLaw get_law_text(mst=286211, jo=제168조의14) 본문 확인 — 「③3.나. 취득일(상속받은 토지는 피상속인이 해당 토지를 취득한 날을 말하고, 법 제97조의2제1항을 적용받는 경우에는 증여한 배우자 또는 직계존비속이 해당 자산을 취득한 날을 말한다)이 사업인정고시일부터 5년 이전인 토지」. 소급 취득일 자체의 조문 해석은 서버 구현이 맞다 — 문제는 클라이언트가 그 값을 못 읽는 것이다.

**처방**  `evaluateUnconditionalExemption`이 `buildNonBusinessLandRaw`와 같은 레코드를 만들어 넘기도록 한다 — 두 곳이 같은 얇은 어댑터(예: `toUnconditionalExemptionRecord(asset, transferDate)`)를 공유하게 하여 `donorAcquisitionDate: asset.carryover?.donorAcquisitionDate`, `decedentAcquisitionDate`, `transferCause`, `expropriationNoticeDate` 매핑을 한 곳에만 둔다.

### E6-01 🔴 `plumbing` — 일괄양도(bundled) 경로에서 상업용건물 부수토지 초과분 중과(+10%p)가 통째로 사라진다

**위치** `lib/tax-engine/transfer-tax-aggregate.ts:218` · **세액영향** 위 실측에서 상가 자산 1건 기준 14,403,750원 과소(초과비율 0.75·과세표준 477,500,000). 초과비율·과세표준에 비례해 커진다. 방향은 항상 과소과세. · **안전망** 없음 — `__tests__/tax-engine/transfer-tax/commercial-appurtenant-land.anchor.test.ts`·`__tests__/tax-engine/transfer/commercial-appurtenant-interaction.anchor.test.ts`는 전부 단건 `calculateTransferTax`만 호출한

**결함**  일괄양도(bundled)·다건 합산 경로에서 STEP 0.62(상업용건물 부수토지 초과분) 파생 주입이 `correctedSingleInput`에 복원되지 않아, 그룹 세액 재계산에서 §104①8호 +10%p가 사라진다. 최종 산출세액 영향은 §104⑤ 1호(합산 누진) 바닥에 의해 완충되어 위 실측에서 **11,683,750원 과소**(그룹세액 차이 14,403,750은 MAX 비교 전 값이다). 또한 clause8 echo가 0이 되어 §104⑤ 8호 크로스 조정이 함께 소실되고, `properties[]` echo(0.5·0.1)와 실제 적용(0.4·0)이 어긋나는 dual truth가 화면에 노출된다.

**재현**  입력: 상가 1호(commercial_building) 양도 10억·취득 4억·취득 2013-06-01·양도 2024-06-01, `commercialAppurtenantLand = {totalLandArea:1200, totalBuildingFootprintArea:100, zoneType:'commercial'}`(상업지역 3배 → 기준면적 300㎡, 초과 900㎡, ratio 0.75), 기본공제 250만원. 워크트리 mock 세율로 실측: 단건 `calculateTransferTax` → calculatedTax **179,463,750**, surchargeType 'non_business_land'. 같은 자산을 일괄양도 컴패니언 1건과 함께 `calculateTransferTaxAggregate`에 넣으면 그 자산이 속한 `non_business_land` 그룹의 groupCalculatedTax는 **165,060,000**(surchargeRate 0, appliedRate 0.4, groupTaxBase 477,500,000 = 단건과 동일) ⇒ **14,403,750원 과소**. `clause8Tax`/`clause8TaxBase`도 0으로 나와 §104⑤ 8호 크로스 조정 echo까지 함께 소실된다.

**법령**  「소득세법」 §104①8호 — 「제104조의3에 따른 비사업용 토지」는 별도 세율표(16/25/34/45/48/50/52/55%) = §55① 기본세율 +10%p (법제처 MST 280405, 시행 2026-01-01 본문 실독). 부수토지 초과분의 비사업용 근거는 §104의3①4호나목(「지방세법」 §106①2호 별도합산과세대상 제외 → 「지방세법 시행령」 §101①2호 바닥면적×배율) — §104의3① 본문 실독 확인. 「지방세법 시행령」 §101 본문은 미확인.

**처방**  단건 엔진이 STEP 0.62 판정 결과를 result에 echo하고(예: `commercialAppurtenantLandDetail` 또는 기존 `nonBusinessLandJudgmentDetail`과 같은 층위의 파생값), `transfer-tax-aggregate.ts:218`의 `nblOverride`가 그 echo도 소스로 삼도록 넓힌다. 근본적으로는 `correctedSingleInput`이 「단건 엔진이 실제로 쓴 파생 입력(effectiveInput)」을 그대로 받도록 하는 편이 이 계열 결함(향후 파생 STEP이 늘 때마다 재발)을 구조적으로 막는다.

### A1-01 🔴 `plumbing` — 기타토지 「재산세 과세 분류」 미선택이 매퍼에서 조용히 「종합합산」으로 바뀌어 비사업용 중과가 발동한다 (⑧ 검증 부재·3중 패턴 위반)

**위치** `lib/tax-engine/non-business-land/form-mapper-helpers.ts:245` · **세액영향** 총부담세액 359,436,000 vs 282,711,000 — 76,725,000원 과다(§104①8호 +10%p 중과 발동/미발동 차이). 실측 2회. · **안전망** 없음 — __tests__ 전체에서 `nblOtherPropertyTaxType`는 항상 명시값("comprehensive"/"separate")만 넣는다(__tests__/lib/calc/nbl-detailed-cases.test.ts:60·177, __tests__/tax-engine/non-business-land/integration.test.ts:

**결함**  주장 성립. 다만 도달 조건을 좁힌다 — 이 폴백이 결과를 가르는 것은 (a) 공장 입력이 없고(o.factory 있으면 other-land.ts:375의 isNonComprehensive가 factoryTaxTypeOverride로 결정), (b) 건축물이 있고 시가표준 2% 기준을 통과해 bareLand가 아니며(bareLand면 effectiveTaxType이 어차피 comprehensive로 강제 — 이 강제는 §104의3①4호나목·지방세법 시행령 §101①2호나목상 정당), (c) §168의11①·② 다목 경로도 미해당인 경우다. 그 조건에서는 「미선택」이 「종합합산 선언」과 동일하게 취급되어 +10%p 중과가 발동한다.

**재현**  입력(정밀판정 ON·지목 other_land·용도지역 general_residential·면적 300㎡·취득 2005-01-01 5억·양도 2026-06-01 15억·건축물 있음·건물 시가표준 2억/토지 시가표준 10억(2% 초과)·바닥면적 100㎡)에서 「재산세 과세 분류」만 미선택("")으로 두면 → 매퍼 propertyTaxType="comprehensive" → judgeNonBusinessLand.isNonBusinessLand=true, surcharge.nonBusinessAreaRatio=1 → calculateTransferTax 산출세액 326,760,000 · 총부담세액 359,436,000. 같은 입력에서 「별도합산」만 선택하면 isNonBusinessLand=false, ratio=0 → 산출세액 257,010,000 · 총부담세액 282,711,000. 차액 76,725,000원 과다. (probe: buildNblEngineInput + judgeNonBusinessLand(DEFAULT_NON_BUSINESS_LAND_RULES) + calculateTransferTax(makeMockRates), 2회 실행. 같은 입력으로 validateNblDetailedJudgment(asset,"자산1","2026-06-01") 는 null 반환 — 차단 없음.)

**법령**  「소득세법」 제104조의3 제1항 제4호 나목(KoreanLaw MST 280405, 시행 2026-01-01 본문 조회) — "「지방세법」 제106조제1항제2호 및 제3호에 따른 재산세 별도합산과세대상 또는 분리과세대상이 되는 토지"는 비사업용 토지에서 제외된다. 즉 별도합산/분리과세 해당 여부가 중과 여부를 직접 가른다. 종합합산은 「지방세법」 제106조제1항제1호의 잔여 정의이나, 그 판정을 사용자 선언 없이 매퍼 기본값으로 확정하는 것은 이 저장소의 「자동 fallback 금지·미입력은 검증 오류로 차단」 정책과 3중 패턴(UI display fallback ↔ API 변환 ↔ validate 동일)에 정면으로 어긋난다.

**처방**  lib/calc/transfer-tax-validate-nbl.ts의 `asset.nblLandType === "other_land"` 분기에 `nblOtherPropertyTaxType`가 빈 값이면 차단하는 검증을 추가한다(다른 NBL 필수 입력과 동일한 어투). 매퍼의 `|| "comprehensive"`는 그대로 두어도 되지만(하드 폴백이 사라지면 ""가 `!== "comprehensive"`로 흘러 반대 방향 오류가 난다), ⑧에서 먼저 막아 UI 통과↔engine 판정 괴리를 없앤다.

### A2-01 🔴 `plumbing` — 공익수용 프리필이 nblUseDetailedJudgment만 켜서 ⑧validate가 요구하는 지목·용도지역 입력 UI가 렌더되지 않는다 (컴패니언 자산은 복구 불가)

**위치** `lib/calc/non-business-land-request.ts:57` · **세액영향** 표시only (세액이 틀리는 것이 아니라 계산 자체가 차단된다). 컴패니언 자산에서는 해당 자산을 삭제하지 않는 한 신고 계산 전체가 불가. · **안전망** __tests__/lib/calc/nbl-exemption-jibok-validation.test.ts:100 「가드: 공익수용 ON·미충족(고시일 2017, 2018 취득 → 5년 이내) → 지목 요구 유지」 — `isNonBusinessLand`가 기본값 false인 자산으로 `expect(err).toMatch(/지목을 선택/)`를 **의도적으로 고정

**결함**  주장 내용은 그대로 성립한다. 정정은 표현 하나뿐 — evidence ③의 「NBL 입력 UI 3개 렌더 지점」은 실제로 NblSectionContainer 렌더 2곳(AssetSectionExtras.tsx:23 · SpecialSituationSection.tsx:188) + 사이드바 요약 라벨 1곳(components/calc/transfer/asset-section-summary.ts:107)이다. 컴패니언 자산의 유일한 복구 수단은 해당 자산을 삭제하고 다시 추가하거나 assetKind를 토지 이외로 바꾸는 것뿐이며(assetKind≠land이면 ⑧가 null 반환), 이는 원 발견이 이미 「해당 자산을 삭제하지 않는 한」으로 밝힌 범위 안이다.

**재현**  자산 1 = 토지, 취득일 2018-01-01, 면적 300㎡, ②양도정보에서 「공익수용·협의매수」 선택(=`transferCause="public_expropriation"` + 프리필 `nblUseDetailedJudgment=true`, `nblExemptPublicExpropriation=true`), 사업인정고시일 2020-05-01 입력. → 고시일>2006.12.31 이고 취득일(2018-01-01) > 고시일−5년(2015-05-01) ⇒ 의제 미성립 ⇒ 「세금 계산하기」 시 `자산 1: 비사업용 토지 정밀판정을 선택했습니다. 지목을 선택하세요.`로 차단. 그런데 지목 Select를 담은 `NblSectionContainer`는 `isNonBusinessLand=false`라 렌더되지 않는다 → 화면 어디에도 지목 칸이 없다. 주 자산은 Step4 「비사업용 토지 여부 검토」 토글을 켜야 탈출되고, **자산 2 이상(컴패니언)은 그 토글이 존재하지 않아 계산이 영구 차단**된다. 같은 프리필 후 「일반 양도」로 되돌려도 `nblUseDetailedJudgment`가 true로 남아 차단이 유지된다(`TransferModeBlock.tsx:112-116`).

**법령**  「소득세법 시행령」 §168의14③3호 (KoreanLaw MCP mst=286211 조회 확인) — 「가. 사업인정고시일이 2006년 12월 31일 이전인 토지 / 나. 취득일(…)이 사업인정고시일부터 5년 이전인 토지」. 이 두 요건을 못 맞추면 무조건 의제가 성립하지 않아 ⑧가 지목을 요구하는 경로로 들어간다(법령 자체는 정상, 결함은 배관이다).

**처방**  `TransferModeBlock.tsx:93` 프리필에 `isNonBusinessLand: true`를 함께 넣어 UI 렌더 게이트와 ④⑧ 게이트를 일치시키거나(3중 패턴), 반대로 세 UI 렌더 게이트에서 `isNonBusinessLand` 조건을 빼고 `nblUseDetailedJudgment` 단일 축으로 통일한다. 어느 쪽이든 「일반 양도」 복귀(`:112-116`)에서 `nblUseDetailedJudgment`도 함께 정리해야 잔존 차단이 남지 않는다.

### A3-01 🔴 `dead-code` — acquisitionCause=carryover_gift 조기 return이 ⑧ NBL 검증 전체를 도달 불가로 만든다 — 미입력이 조용히 통과해 비사업용 중과가 붙는다

**위치** `lib/calc/transfer-tax-validate-asset.ts:352` · **세액영향** 과세표준 300,000,000원 기준 산출세액 +30,000,000원(§104①8호 표 적용). 일반적으로 과세표준 × 10%p. 공장 토글 분기는 세액이 아니라 HTTP 500(계산 불가). · **안전망** 없음 — __tests__/lib/calc/nbl-detailed-cases.test.ts:243-264 · __tests__/lib/calc/nbl-exemption-jibok-validation.test.ts:50·97 이 `validateAssetAcquisition`으로 차단을 단언하지만 자산은 전부 `acquisitionCause: "purchas

**결함**  결함의 원인은 carryover_gift 전용이 아니라 **⑧ NBL 검증이 취득원인 분기보다 뒤(:352)에 놓인 것**이다. 같은 파일의 `newConstruction` 분기(:317~345, `return null`)도 토지 자산에서 동일하게 ⑧ NBL 검증을 도달 불가로 만든다 — probe 실측: 동일 자산에 acquisitionCause="newConstruction"(사용승인일·신축비용 충족) → validateNblDetailedJudgment는 「7호 유예기간 종료일」 오류, validateAssetAcquisition은 **null**. 반면 isMixedUseHouse 분기는 토지 자산에서 자체 검증(주택 연면적)에 먼저 걸려 같은 침묵 통과를 만들지 못했다.

**재현**  토지 자산, acquisitionCause="carryover_gift"(이월과세 증여), 취득일 2010-01-01, 양도일 2026-01-01, 「판정 도움 필요」(nblUseDetailedJudgment) ON, 지목=농지, 용도지역=농림, 유예기간 1건 = 소유권 소송(7호) 개시일 2010-01-01 / **종료일 미입력**.
→ ⑧ `validateAssetAcquisition` = **null**(통과). 같은 입력을 acquisitionCause="purchase"로 두면 「소유권 소송 계속 (7호) 유예기간 — 종료일을 입력하세요.」로 차단된다(실측).
→ 엔진 `judgeNonBusinessLand` 실측: 종료일 미입력 → **isNonBusinessLand=true**, 종료일 입력 → isNonBusinessLand=false. 즉 미입력이 조용히 통과해 사업용 토지가 비사업용으로 판정된다.
→ 세율이 §55① 기본세율표 → §104①8호 표로 바뀐다. 양도소득과세표준 300,000,000원이면 8호 표 = 52,060,000 + 150,000,000×48% = **124,060,000원**, 기본세율표 대비 **+30,000,000원**(구간별 +10%p × 과표).
별개 경로: 같은 자산에서 `nblFactoryEnabled=true`로 두고 값을 비우면 ⑧이 null → 엔진이 TaxCalculationError → **HTTP 500**(인라인 필드 오류가 아니라 원인 불명 500). 이것을 막는 것이 `validateNblFactory`의 존재 이유라고 그 파일 주석이 명시한다.

**법령**  소득세법 시행령 §168의14①·소득세법 시행규칙 §83의5①7호(소유권 소송 유예기간) — KoreanLaw MCP get_law_text(mst=286211, jo=제168조의14) 본문 확인: 「①법 제104조의3제2항에 따라 다음 각 호의 어느 하나에 해당하는 토지는 해당 각 호에서 규정한 기간동안 … 비사업용 토지에 해당하는지를 판정한다」. 중과세율은 소득세법 §104①8호(mst=280405, jo=제104조) 별도 세율표 16/25/34/45/48/50/52/55% — 기본세율표 대비 각 구간 +10%p.

**처방**  `validateAssetAcquisition`의 carryover_gift 블록이 `return null`하기 **전에** `validateNblDetailedJudgment(asset, label, formTransferDate)`를 호출하거나, NBL 검증을 취득원인 분기보다 앞(현재 :133 `validateUsageConversion` 근처)으로 올린다. 같은 축의 `newConstruction`(:317~345)·`isMixedUseHouse`(:313) 조기 return도 토지 자산에서 같은 구멍을 만드는지 함께 점검할 것.

### A3-02 🔴 `ui-engine-drift` — 무조건 의제 어댑터가 carryover_gift에서 잘못된 증여자 취득일 필드를 읽는다 — UI가 지목 입력을 잠근 채 엔진은 「지목 분류 불가 → 비사업용 간주」

**위치** `lib/calc/nbl-unconditional-exemption-status.ts:179` · **세액영향** 판정 플래그 사업용→비사업용 전환. §104①8호 표는 기본세율표 대비 각 구간 +10%p이므로 과세표준 300,000,000원 기준 산출세액 124,060,000원(= 52,060,000 + 150,000,000×48%), 기본세율 적용 대비 +30,000,000원. · **안전망** 없음 — __tests__/lib/calc/nbl-unconditional-exemption-status.test.ts에 `acquisitionCause`·`donorAcquisitionDate`·`carryover` 언급 0건(grep). __tests__/lib/calc/nbl-exemption-jibok-validation.test.ts는 `acqui

**결함**  드리프트는 「평면 값이 잔존한 경우」에 한정되지 않는다 — **평면이 비어 있는 통상 경로에서도** 어댑터는 `u.expropriationAcquisitionDate=undefined` → `input.acquisitionDate`(=수증일)로 fallback하는 반면 서버는 중첩 증여자 취득일을 쓴다. probe 실측(중첩 2010-01-01, 수증일 2018-06-01, 고시일 2019-01-01): 어댑터 isExempt=false인데 지목을 채운 서버 판정은 isNonBusinessLand=**false**(의제 성립). 즉 어댑터↔엔진은 carryover_gift + 수용 의제 조합에서 **일반적으로** 갈리며, 방향은 평면값의 존부에 따라 양쪽 모두 발생한다. 다만 세액이 실제로 틀리는 것은 (a) 평면 잔존으로 어댑터가 true가 되어 지목 칸이 잠긴 채 빈 지목이 전송되는 경로와 (b) 어댑터 false + 지목 미입력으로 ④가 raw를 통째로 버리는 경로뿐이므로, 「두 소스가 다르면 판정이 갈린다」까지가 실증 범위다.

**재현**  토지 자산에서 취득원인을 「증여」로 골라 증여자 취득일 2005-01-01을 입력한 뒤 「이월과세(증여)」로 바꾸고, 이월과세 블록에 증여자 취득일 2018-01-01·증여일 2018-06-01을 입력한다. 양도원인 공익수용, 사업인정고시일 2019-01-01, 무조건 의제 「공익사업 수용」 토글 ON, 「판정 도움 필요」 ON.
→ 어댑터는 잔존 평면값 2005-01-01로 5년 요건을 충족했다고 보아 `isExempt=true`(실측) → NblSectionContainer가 지목·용도지역을 `pointer-events-none`으로 잠그고, ⑧·④가 지목 필수 요구를 해제해 `nblLandType: ""`로 전송한다.
→ 서버는 정본 2018-01-01(고시일−5년=2014-01-01 이후)로 의제를 부인하고, 지목이 비어 `getLandCategoryGroup("")="unknown"` → lib/tax-engine/non-business-land/engine.ts:135-154 `default:` 「지목 분류 불가 — 비사업용 간주」 `isNonBusinessLand: true`(실측).
→ 사용자는 지목을 입력할 UI 자체가 잠겨 있어 정정할 수 없고, 결과는 §104①8호 중과다.

**법령**  소득세법 시행령 §168의14③3호나목 — KoreanLaw MCP get_law_text(mst=286211, jo=제168조의14) 본문: 「나. 취득일(상속받은 토지는 피상속인이 해당 토지를 취득한 날을 말하고, **법 제97조의2제1항을 적용받는 경우에는 증여한 배우자 또는 직계존비속이 해당 자산을 취득한 날**을 말한다)이 사업인정고시일부터 5년 이전인 토지」. 이월과세(§97의2①) 자산의 취득일은 증여자 취득일이므로 `asset.carryover.donorAcquisitionDate`가 정본이고, 어댑터가 읽는 평면 필드는 일반증여용이다.

**처방**  `evaluateUnconditionalExemption`이 `buildUnconditionalExemption`에 넘기는 record를 ④와 동일하게 조립한다 — 최소한 `{ ...asset, donorAcquisitionDate: asset.acquisitionCause === "carryover_gift" ? (asset.carryover?.donorAcquisitionDate ?? "") : asset.donorAcquisitionDate }`. 더 나은 방향은 `buildNonBusinessLandRaw`가 만드는 raw 조립을 순수 헬퍼로 뽑아 어댑터·빌더가 같은 입력을 쓰게 하는 것(단일 소스).

### U1-01 🔴 `ui-engine-drift` — 「문화재 보호림」 토글이 엔진의 '특수산림사업지구'(§168의9①2호나목) 플래그로 매핑 — 도시지역 편입 3년 경과 시 비사업용 오판

**위치** `components/calc/transfer/nbl/ForestDetailSection.tsx:41` · **세액영향** 판정이 사업용→비사업용으로 뒤집힌다. 기본세율 +10%p 중과 + 장특공제 전액 배제. 예: 과세표준 3억이면 세율 40%→50%로 3,000만원(지방소득세 별도) 증가 + 장특공제 배제분 추가. · **안전망** __tests__/tax-engine/non-business-land/forest.test.ts:106 「특수산림사업지구 임야(공익플래그 X) + 재촌 X + 도시지역 밖 → 사업용 (B1 회귀 §168조의9①2호나목)」 — 엔진 쪽 `isSpecialForestZone` 의미(특수산림사업지구)를 의도적으로 고정한다. 즉 결함은 엔진 의미가 아니라 그 플래

**결함**  라벨↔엔진 의미 불일치는 실재하나, **판정이 실제로 뒤집히는 범위는 좁다**: (a) 용도지역이 임야 기준 도시지역(주·상·공 또는 녹지)이고 (b) 도시편입 후 3년 유예가 이미 경과한 경우에만 발생한다. 도시지역 밖이면 두 매핑 모두 사업용(forest.ts:207-211)으로 동일하다. 반대 방향(진짜 특수산림사업지구 소유자)은 이 토글을 켜면 우연히 올바른 판정을 받으므로 손해가 없고, 결함은 문화유산 보호구역(6호) 임야 쪽에만 나타난다. 세액 수치(3,000만원)는 실행으로 검산하지 않은 추정이다 — 검증된 것은 사업용↔비사업용 판정 반전과 그에 따른 §104①8호 +10%p·장특공제 배제 적용 여부다.

**재현**  임야, nblZoneType=general_residential(도시지역), nblUrbanIncorporationDate=2010-01-01, 취득 2005-01-01, 양도 2024-06-01, 거주(재촌) 이력 없음, ForestDetailSection에서 「문화재 보호림」만 체크. → 엔진: isPublicInterest=false, related=false, inSiupOrSpecialZone=true → Step 3-1-1 전 보유기간 기간기준 PASS → Step 3-2 지역기준 적용 → isUrbanForForest(general_residential)=true → checkIncorporationGrace(2010-01-01, 2024-06-01) 미적용(3년 경과) → **비사업용**. §168의9①6호대로면 지역기준 미적용 → 사업용. 결과적으로 §104①8호 기본세율 +10%p 중과와 장기보유특별공제 배제가 잘못 적용된다.

**법령**  소득세법 시행령 §168의9① (KoreanLaw MCP mst=286211, 시행 2026-07-01 본문 실측). 1호~14호 중 **2호**만 단서를 가진다 — 「다만, 「국토의 계획 및 이용에 관한 법률」에 따른 도시지역(…보전녹지지역을 제외한다…) 안의 임야로서 도시지역으로 편입된 날부터 3년이 경과한 임야를 제외한다」, 가목=산림경영계획인가 시업중, 나목=특수산림사업지구. 문화유산 보호구역 안의 임야는 **6호**(「문화유산의 보존 및 활용에 관한 법률」에 따른 보호구역 또는 「자연유산…」에 따른 보호구역 안의 임야)로 별개 호이며 2호 단서의 적용을 받지 않는다.

**처방**  둘 중 하나로 정합화: (a) 라벨을 「특수산림사업지구(§168의9①2호나목)」로 바로잡고, 문화유산 보호구역(6호)은 기존 `nblForestIsPublicInterest`(공익림) 토글이 담당함을 hint로 명시하거나, (b) 문화재 보호구역 전용 필드를 신설해 `isPublicInterest` 계열로 매핑하고 `nblForestIsProtected`는 특수산림사업지구 전용으로 라벨을 교정. 어느 쪽이든 라벨↔엔진 의미가 1:1이 되도록 anchor 테스트(nblForestIsProtected → 엔진 input)를 함께 추가.

### U1-02 🔴 `plumbing` — 거주 이력을 추가하면 「직선거리(km)」 입력이 화면에서 사라지지만 store 값은 남아 전송 — 재촌 미인정 이력이 있어도 stale 거리로 전 보유기간 재촌 인정

**위치** `components/calc/transfer/nbl/ResidenceHistorySection.tsx:134` · **세액영향** 비사업용→사업용으로 판정이 뒤집혀 §104①8호 +10%p 중과와 장특공제 배제가 누락된다(과소과세 방향). 과세표준 3억 기준 약 3,000만원 과소. · **안전망** 없음 — 기존 테스트는 전부 「ownerProfile 미제공 + farmerResidenceDistance」 경로만 덮는다(__tests__/tax-engine/non-business-land/qa-integration.test.ts:309 QA-091, :328 QA-092, qa-land-type-flow.test.ts:51·68·87·123·156, 

**결함**  판정 반전(비사업용→사업용, 과소과세 방향)은 probe로 실증됐다. 다만 세액 차이 3,000만원은 실행 검산이 아닌 §104①8호 구조 추정치다. 또한 임야(forest.ts:99-107)에서는 같은 fallback이 `input.ownerLocation`을 요구하는데 form-mapper가 이를 전혀 채우지 않아 발동하지 않는다 — 이 결함은 **농지 경로에 한정**된다.

**재현**  농지, 취득 2010-01-01, 양도 2024-06-01, 도시지역 밖(nblZoneType=agriculture_forest), 자경기간 = 전 보유기간, 「직접 자경」 ON. ① 거주 이력이 비어 있는 상태에서 「직선거리 (km)」에 5 입력 → store nblFarmerResidenceDistance="5". ② 「+ 거주지 추가」로 토지(강원 평창군, 51760)와 동일·연접이 아닌 부산 강서구(26440)를 주소검색으로 등록(좌표 미기입 상태 유지 가능) → 직선거리 필드가 화면에서 사라짐. → 엔진: computeResidencePeriods = [] (코드 불일치·비연접·좌표 결측) → fallbackResidenceFromDistance(2010-01-01, 2024-06-01, 5, 30) = 전 보유기간 재촌 → 자경기간과 교집합 = 전 보유기간 → §168의6 기간기준 충족 → **사업용**. 올바른 판정은 재촌 0일 → 기간기준 미충족 → 비사업용(§104①8호 +10%p 중과).

**법령**  소득세법 시행령 §168의8② (KoreanLaw MCP mst=286211 실측) — 재촌은 「제153조제3항에 따른 농지소재지에 사실상 거주」이고, §168의9②(실측)는 동일 시·군·구, 연접 시·군·구 또는 직선거리 30km 이내를 요건으로 한다. 즉 재촌 인정은 실제 거주지↔토지 관계로 판정되어야 하며, 입력되지 않은(화면에서 사라진) 과거 스냅샷 거리로 전 보유기간을 재촌으로 간주할 근거는 없다. 저장소 정책(CLAUDE.md 「자동 안분 fallback 금지 — 미입력은 검증 오류로 차단」)과도 충돌한다.

**처방**  거주 이력이 1건 이상이 되는 시점에 `nblFarmerResidenceDistance`를 함께 비우거나(addHistory에서 동일 patch로 처리 — useEffect 미러링 금지 정책 준수), 엔진 fallback 조건을 「ownerProfile.residenceHistories가 아예 없을 때」로 좁힐 것. 후자가 표시↔판정 일관성 측면에서 안전하며 farmland.ts:138의 warning 문구와도 일치한다.

### U2-01 🔴 `ui-engine-drift` — §168의11⑥ 복합용도 안분 입력이 「건축물 있음」 토글 OFF 후에도 살아남아 숨은 상태로 판정을 뒤집는다

**위치** `components/calc/transfer/nbl/OtherLandDetailSection.tsx:503` · **세액영향** 1,000㎡ 하치장 사례에서 비사업용 면적 0㎡ → 750㎡(비율 0 → 0.75). 해당 면적분 양도차익에 기본세율 +10%p 중과 및 장기보유특별공제 배제가 적용된다. · **안전망** 없음 — __tests__/lib/calc/nbl-other-land-section-render.test.tsx:158 "§168의11⑥ 복합용도 카드는 건축물 ON 시 노출"은 표시 게이트만 고정하고, 엔진측 ⑥ 테스트(__tests__/tax-engine/non-business-land/other-land.test.ts:174-230, mixed-use

**결함**  ⑥ 복합용도 카드는 `nblOtherHasBuilding`가 true일 때만 렌더되지만 토글을 끄면 `nblOtherMixedUseMode`·연면적 값이 폼에 그대로 남고, 그 값이 Zod·매퍼를 통과해 엔진의 ⑥ 안분 경로를 계속 켜 놓는다(화면에는 어디에도 보이지 않음).

**재현**  기타토지 1,000㎡·상업지역·§168의11①7호(하치장) 매년 최대사용면적 1,000㎡(기준면적 1,200㎡) 자산에서 사용자가 실수로 「건축물 있음」을 켜 ⑥ "하나의 건축물 복합용도" + 특정용도분 100㎡/전체 400㎡를 입력한 뒤 토글을 다시 끄면, 화면에는 ⑥ 카드가 사라지지만 엔진은 여전히 ⑥을 적용한다. 실측(judgeOtherLand + DEFAULT_NON_BUSINESS_LAND_RULES probe): 정상 = `isBusiness true / "거주·사업관련 토지 + 기준면적 이내"` → 숨은 상태 = `isBusiness false / "복합용도 건축물 — 특정용도분(25.0%)만 사업용" / areaProportioning {businessArea:250, nonBusinessArea:750, nonBusinessRatio:0.75}`. 즉 전량 사업용이던 토지의 750㎡분이 비사업용으로 +10%p 중과된다(반대로 나대지·종합합산 케이스에서는 전량 비사업용이 75%로 줄어 과소과세된다 — 같은 probe에서 baseline 전량 비사업용 → nonBusinessRatio 0.75).

**법령**  소득세법 시행령 §168의11⑥(KoreanLaw get_law_text mst=286211 본문 확인): "토지 위에 하나 이상의 건축물(시설물 등을 포함한다)이 있고, 그 건축물이 거주 또는 특정 사업에 사용되는 부분과 그러하지 아니한 부분이 함께 있는 경우" — 건축물의 존재가 ⑥의 성립 요건이다. 건축물이 없다고 입력된 토지에 ⑥ 안분을 적용할 법적 근거가 없다.

**처방**  둘 중 하나(또는 둘 다): (a) UI에서 `nblOtherHasBuilding` OFF 시 `nblOtherMixedUseMode`·`nblOtherMixedUse*Area/Footprint`를 같은 onChange 패치로 비운다(useEffect 미러링 금지 규칙 준수 — 토글 onCheckedChange 안에서 한 번에 patch). (b) 엔진 `resolveMixedUseProportioning`이 `o.hasBuilding`을 요건으로 확인해 건축물 미존재 시 undefined를 반환하도록 §168의11⑥ 본문 요건을 코드에 반영한다.

### U3-01 🔴 `plumbing` — 공익수용 프리필이 nblUseDetailedJudgment만 켜서, 컴패니언 토지 자산이 「지목을 선택하세요」로 차단되는데 입력 칸이 화면에 없다

**위치** `components/calc/transfer/TransferModeBlock.tsx:93` · **세액영향** 표시only — 세액 오차가 아니라 계산 자체가 차단됨(입력 경로 부재) · **안전망** __tests__/components/calc/transfer-asset-section-summary.anchor.test.ts:90-95 (「토지 + 비사업용 정밀판정 → extras 노출」 — `isNonBusinessLand: true`인 **양성** 케이스만 고정. 프리필로 `nblUseDetailedJudgment`만 켜진 조합을 덮는 테스트는 없

**결함**  주장 그대로 성립한다. 다만 범위를 좁혀 둔다 — 자산1(primary)에는 탈출로가 있다: Step4 「비사업용 토지 여부 검토」 토글을 켜면 NblSectionContainer가 열려 지목을 넣을 수 있고, 끄면 `nblUseDetailedJudgment: false`가 함께 나가 차단이 풀린다(SpecialSituationSection.tsx:137-139). 화면에 입력 경로가 아예 없는 것은 **자산2 이상(컴패니언)** 에 한정된다. 또한 재현 조건은 함께양도(비-fractional) 다자산 모드다 — 지분(fractional) 모드는 ② 양도정보가 숨겨져 프리필 자체가 발생하지 않는다.

**재현**  다자산(함께 양도) 모드에서 자산1=주택, 자산2=토지를 입력하고 자산2의 ② 양도정보에서 「공익수용·협의매수」를 선택(고시일 2020-01-01, 취득일 2018-03-01, 면적 1,000㎡) → 계산 시도 시 「자산 2: 비사업용 토지 정밀판정을 선택했습니다. 지목을 선택하세요.」로 영구 차단. 자산2 카드에는 ⑤ 기타 특례 섹션이 렌더되지 않고(Step4의 「비사업용 토지 여부 검토」 토글은 자산1만 조작한다) 지목을 입력할 수 있는 화면이 없어 계산을 완료할 방법이 없다. 「일반 양도」로 되돌려도 `nblUseDetailedJudgment`가 남아 차단이 계속된다.

**법령**  「소득세법 시행령」 §168의14③3호(KoreanLaw MST 286211 본문 확인 — 가목 사업인정고시일 2006.12.31. 이전 / 나목 취득일이 고시일부터 5년 이전). 프리필이 켜는 의제는 이 두 요건을 만족할 때만 성립하므로, 2020년 고시·2018년 취득 같은 통상 사례에서는 `isExempt=false`가 되어 지목·용도지역 입력이 실제로 필요해진다(lib/tax-engine/non-business-land/unconditional-exemption.ts:88 `if (u.isPublicExpropriation && u.publicNoticeDate)`, :100-110).

**처방**  프리필에서 `isNonBusinessLand: true`를 함께 켜거나(그러면 컴패니언 카드에서도 ⑤가 열려 지목 입력이 가능), 반대로 표시 게이트를 `nblUseDetailedJudgment`만으로 통일해 validate 게이트(transfer-tax-validate-nbl.ts:25)와 조건을 일치시킨다. 아울러 TransferModeBlock의 regular·burdened_gift 복귀 분기에서 `nblUseDetailedJudgment`도 함께 되돌릴지 결정한다(프리필로 켠 값만 되돌리는 것이 안전).

### E1-01 🟠 `numeric` — 레거시 20% 임계가 `1 − 0.8` 부동소수 오차로 1일 낮게 잡혀, 사업용 정확히 80%인 2015.2.2 이전 농·임·목 양도가 비사업용으로 뒤집힌다

**위치** `lib/tax-engine/non-business-land/period-criteria.ts:206` · **세액영향** 경계값에서 판정 자체가 뒤집힌다 — 세율 +10%p(§104①8호)와 장특공 전액 배제가 붙거나 빠진다. 영향 구간은 「양도일 < 2015-02-02 && 지목 ∈ 농지·임야·목장 && 총소유일수가 5의 배수 && 비사업용 일수 == 소유일수×0.2」. · **안전망** 없음 — __tests__/tax-engine/non-business-land/period-criteria.test.ts:102-115는 `getThresholdRatio`가 0.8/0.6을 반환하는지만 보고 비율 경계 판정은 보지 않는다. bucket-criteria.test.ts 5건은 전부 현행 0.6 경로(`other_land`)다.

**결함**  §168조의6 다목/3호 나목의 비사업용 임계를 `nonBizRatioThreshold = 1 - thresholdRatio`로 계산하는데, 레거시 0.8에서 `1 - 0.8 = 0.19999999999999996`이 되어 `Math.floor(days × threshold)`가 정확한 20%보다 1 작아지고, 경계값(비사업용 = 소유기간의 정확히 20%)이 「초과」로 오판된다.

**재현**  농지, 취득일 2012-01-01(소유기간 개시 2012-01-02), 양도일 2014-06-20(총 소유 900일 = 5의 배수, 버킷3), 사업용 사용 720일 / 비사업용 180일(= 정확히 20%). 실행 결과(probe, meetsPeriodCriteria 직접 호출): `meets:false`, detail `3호(소유 2~3년): 전체 비사업 180일 > 소유−2년 170일(가 충족), 전체 비사업 180일(나 충족) → 모두 충족(비사업용)`. 임계가 179로 잡혀 나목이 「충족」이 됐다. 임계가 정확히 180이면 `180 > 180 = false` → 나목 미충족 → **사업용**이어야 한다. 즉 사업용 ↔ 비사업용이 뒤집히고 +10%p 중과·장기보유특별공제 배제가 붙는다.

**법령**  「소득세법 시행령」 제168조의6(KoreanLaw MST 286211, 시행 2026-07-01) 제3호 나목 「토지의 소유기간의 100분의 40에 상당하는 기간을 **초과하는** 기간」 — 본문 조회로 확인. 「초과」이므로 정확히 임계와 같은 일수는 해당하지 않는다. 레거시 100분의 20(2015.2.2 이전 양도 농·임·목)의 조문 본문은 KoreanLaw MCP가 과거 시행본을 반환하지 않아 미확인 — 다만 이 저장소가 스스로 정한 사양(docs/00-pm/nbl-gaps/gap-3d.plan.md:117 「2015.2.2 이전 농·임·목은 `nonBizRatioThreshold=0.2`만 바뀜」)과도 코드가 어긋난다.

**처방**  임계를 부동소수 뺄셈으로 만들지 말고 정수 분수로 계산한다(예: `Math.floor(totalOwnershipDays * nonBizNum / 100)`, 현행 nonBizNum=40 / 레거시 20). 또는 rules에 비사업용 임계(0.4/0.2)를 직접 두고 `1 - x`를 없앤다.

### E1-03 🟠 `legal-accuracy` — 주택부수토지에서 정착면적을 비워 두면 검증에 걸리지 않고 그대로 「비사업용 전량 중과」로 계산된다

**위치** `lib/tax-engine/non-business-land/housing-land.ts:39` · **세액영향** 판정 뒤집힘 — `nonBusinessAreaRatio` 0 → 1, 세율 +10%p, 장특공 전액 배제. E1-02와 같은 예시(양도차익 5억·보유 14년)에서 손계산 기준 약 1억 575만원 과대. · **안전망** __tests__/tax-engine/non-business-land/housing-land.test.ts:70-74 「정착면적 0 → 실패」가 `expect(r.isBusiness).toBe(false)`로 이 동작을 **고정 중**이다. 다만 그 뒤(2026-08-06)에 추가된 형제 경로 building-site-land.ts:78-86이 같은 조건에

**결함**  결함 자체는 성립한다(⑧ validate에 정착면적 필수 차단이 없고, 엔진이 미입력을 §104의3①5호 해당으로 삼켜 전량 중과한다). 다만 「사용자가 그대로 제출하면」의 전제는 **화면에 보이는 필수 성격의 필드를 건너뛴 경우**에 한한다 — HousingLandDetailSection.tsx:72-78에 라벨·hint가 명시된 입력란이 존재하므로, 입력 경로가 아예 없는 E1-02와 달리 구조적 불가피성은 없다. 또한 housing-land.test.ts:70-74가 현재 이 동작을 고정 중이므로 수정 시 그 테스트도 함께 갱신 대상이다.

**재현**  입력: landType `housing_site`, landArea 300㎡, zoneType `green`(도시지역 외 배율 10배), 취득 2010-01-01, 양도 2024-01-01, isMetropolitanArea false, 정착면적 미입력. 실행(judgeNonBusinessLand probe): `isNonBusinessLand: true`, `nonBusinessAreaRatio: 1`, `longTermDeductionExcluded: true`, reason `정착면적 미입력`. 같은 입력에 정착면적 100㎡를 넣으면 허용 1000㎡ ≥ 300㎡ → `isNonBusinessLand: false`, `nonBusinessAreaRatio: 0`. 즉 초과분이 애초에 0인 토지가 입력 누락만으로 전량 중과된다.

**법령**  「소득세법」 제104조의3 제1항 제5호(KoreanLaw MST 280405, 본문 조회 확인) — 「주택부속토지 중 주택이 정착된 면적에 지역별로 대통령령으로 정하는 배율을 곱하여 산정한 면적을 **초과하는 토지**」. 정착면적이 확정되지 않으면 초과 면적이 산정될 수 없으므로 제5호 해당 여부를 판정할 근거가 없다. 미입력을 비사업용으로 보는 근거 조문은 없다.

**처방**  형제 경로(building-site-land.ts)와 같이 정착면적 미입력을 판정이 아니라 입력 오류로 처리하고(엔진 throw), 동시에 lib/calc/transfer-tax-validate-nbl.ts에 `nblLandType === "housing_site" && !nblHousingFootprint` 차단을 추가해 UI 통과↔validate 차단 모순이 생기지 않게 할 것.

### E2-02 🟠 `legal-accuracy` — 재촌 §153③1호 판정이 일반구(행정구) 코드 동일성만 보아 같은 시(市) 안 다른 구 거주가 재촌에서 탈락한다

**위치** `lib/tax-engine/non-business-land/residence.ts:50` · **세액영향** 판정 flip(사업용→비사업용): +10%p 중과 및 장특공 배제. 세액 금액은 산출하지 않았다. · **안전망** 없음 — __tests__/tax-engine/non-business-land/residence.test.ts:25·35·44는 자치구 코드(11680·11650·26440)만 사용해 일반구 케이스를 다루지 않는다.

**결함**  §153③1호 판정이 일반구 코드를 그대로 비교해, 같은 시 안 다른 일반구 거주가 재촌에서 탈락한다. 단 발현 조건은 「토지 좌표가 없는 경우」로 한정된다 — 거주 이력은 주소검색으로만 입력돼 좌표가 항상 있고, 물건 주소검색을 했다면 §153③3호(30km)가 구제한다.

**재현**  창원시 진해구 소재 농지(농림지역), 2014-01-01 취득·2024-01-01 양도, 소유자는 전 기간 창원시 의창구 거주(주소검색 없이 시·군·구만 선택 → 좌표 없음), 자경 전 기간 → 엔진 재촌기간 0일 → "사용기준 미충족 (재촌·자경 + 사용의제 모두 미해당)"으로 비사업용 → +10%p 중과·장특공 배제. 법문상 같은 시 안 거주이므로 사업용이어야 한다.

**법령**  「소득세법 시행령」 제153조③1호(mst=286211): 「농지가 소재하는 시(특별자치시와 …행정시를 포함한다)ㆍ군ㆍ구(자치구인 구를 말한다…)안의 지역」 — 일반구는 여기의 「구」가 아니므로 창원시 진해구 농지의 재촌 단위는 「창원시」다. §168의8②이 「제153조제3항에 따른 농지소재지에 사실상 거주(재촌)」로 이 정의를 그대로 끌어쓴다.

**처방**  matchHistoryResidence의 1호 비교를 「자치단체 단위」로 정규화한다 — 일반구 코드는 시 단위로 축약해(이미 lib/geo/property-tax-jurisdiction.ts에 같은 규칙이 있으므로 그 단일 소스를 재사용) 비교하고, 축약 후 동일하면 matchType "same".

### E2-03 🟠 `numeric` — 목장 기준면적 자동산출이 0을 반환하면(미등재 축종·두수 0) 경고도 검증도 없이 토지 전량이 비사업용으로 붕괴한다

**위치** `lib/tax-engine/non-business-land/pasture.ts:152` · **세액영향** 기준면적 0 → nonBusinessAreaRatio 1(전량) → 해당 토지 양도소득 전부에 +10%p·장특공 배제. 실측으로 5,000㎡ 전량 비사업용 확인. · **안전망** __tests__/tax-engine/non-business-land/livestock-standards.test.ts:111 「AT-LIVESTOCK-12: 미지원 축종 → 0 (호출부가 「추정 금지」로 처리)」가 leaf의 0 반환을 고정하지만, 호출부(pasture.ts)가 그 0을 처리하는지 검증하는 테스트는 없다(pasture.test.ts는 전부

**결함**  computeLivestockStandardArea는 미등재 축종·두수 0에서 0을 반환하고 「호출부가 추정 금지로 처리할 것」이라는 계약을 두는데, pasture.ts는 그 0을 유효한 기준면적으로 그대로 써 landArea > 0 조건에 걸려 전 면적을 비사업용으로 안분한다(warning도 없다).

**재현**  목장용지 5,000㎡, 축산업 전 기간 영위, 도시지역 밖. 사용자가 축종만 고르고 사육 두수에 0을 입력(DecimalInput은 "0" 허용, 음수만 차단) → 기준면적 0㎡로 계산 → "기준면적 0㎡ 초과 → 초과분 5,000㎡ 비사업용", nonBusinessAreaRatio 1 → 전 면적에 +10%p 중과·장특공 배제. 경고 메시지 0건.

**법령**  「소득세법 시행령」 제168조의10③(mst=286211) 「…별표 1의3에 규정된 가축별 기준면적과 가축두수를 적용하여 계산한 토지의 면적」 — 별표 1의3(get_annexes 확인)은 9종만 규정하므로 미등재 축종·두수 0에서 「기준면적 0」이라는 법적 결론은 도출되지 않는다.

**처방**  pasture.ts:152 직후 `resolvedStandardArea <= 0`이면 자동산출을 채택하지 말고(=undefined 유지) 판정을 차단하거나 명시적 오류를 내고, ⑧ validation에 축종 미선택·두수 ≤ 0 차단을 추가한다(sibling separate-taxation.ts:272-294과 동일 정책).

### E2-04 🟠 `integer-arithmetic` — 목장 §168의10②1호 「상속 3년 미경과」를 일수÷365로 판정해 윤년이 낀 창에서 하루 일찍 요건이 끊긴다

**위치** `lib/tax-engine/non-business-land/pasture.ts:54` · **세액영향** 경계일(상속일+3년−1일, 창에 윤일 포함 시) 1일 구간에서 판정 flip → 해당 양도 전체에 +10%p·장특공 배제. 세액 금액은 산출하지 않았다. · **안전망** __tests__/tax-engine/non-business-land/pasture.test.ts:51 「상속 3년 이내 목장용지 → 사업용」은 상속 2023-06-01·양도 2024-06-01(1년)로 경계에서 멀어 이 결함을 덮지 못한다. 경계 테스트 없음.

**결함**  상속개시일부터 3년 경과 여부를 `differenceInDays(...)/365 < 3`으로 판정해, 창 안에 2월 29일이 있으면 3년이 되는 날의 하루 전(=법문상 미경과)에 이미 3.0으로 계산되어 사용의제가 적용되지 않는다.

**재현**  목장용지 5,000㎡를 2019-06-01 상속(축산 미영위), 2022-05-31 양도 → 법문상 상속 3년 미경과이므로 §168의10② 단서로 비사업용에서 제외(사업용)되어야 하나, 엔진은 years=3.0000으로 계산해 사용의제를 적용하지 않고 비사업용 판정 → +10%p 중과·장특공 배제.

**법령**  「소득세법 시행령」 제168조의10②1호(mst=286211): 「상속받은 목장용지로서 상속개시일부터 3년이 경과하지 아니한 것」 — 기간은 달력연 기준이며(민법 §160 역법적 계산), 2019-06-01 상속의 3년 경과일은 2022-06-01이다.

**처방**  `differenceInDays(...)/365` 대신 date-fns `addYears(inheritanceDate, 3)`와 transferDate를 비교한다(`transferDate < addYears(inheritanceDate, 3)`). 같은 판정 클래스인 farmland.ts:97 `addDays(urbanIncorporationDate, -365)`(§168의8⑤1호 소급 1년)도 윤일 창에서 하루 짧아지므로 함께 점검할 것 — 이쪽은 반대로 요건이 완화되는 방향이다.

### E2-05 🟠 `plumbing` — 농지전용 허가일(nblFarmlandConversionDate)이 store·Zod까지만 배선되고 매퍼·엔진에 도달하지 않는다 — UI가 표시하는 「3년 이내」 요건은 어디에도 없다

**위치** `lib/tax-engine/non-business-land/form-mapper-helpers.ts:145` · **세액영향** 표시only + 미배선(입력이 판정에 도달하지 않음). 토글 자체는 사업용 방향으로 작동하므로 세액 flip은 사용자의 토글 조작에 종속된다. · **안전망** 없음 — __tests__/tax-engine/non-business-land/farmland.test.ts:68·85·102는 주말농장·농지개발사업지구만 다루고 전용허가 날짜 경로는 어느 테스트에도 없다.

**결함**  허가일은 store→Zod→페이로드까지는 실제로 운반되나 buildFarmlandDeeming이 날짜를 매핑하지 않아 엔진에 도달하지 않는다(「매퍼가 버림」이 정확). 더불어 UI 라벨의 「(3년 이내)」는 §168의8③4호에 근거가 없고, 같은 호가 요구하는 「당해 전용목적으로 사용되는 토지」 요건은 입력·판정 어디에도 없다.

**재현**  사용자가 「농지전용 허가·신고 (3년 이내)」를 켜고 허가일 2010-01-01을 입력한 뒤 2024년 양도 → 입력한 허가일은 엔진에 전달되지 않고(payload에는 실려도 매퍼가 버림) 토글 boolean만으로 사용의제가 성립해 재촌·자경 없이도 사업용 판정. 반대로 사용자는 UI 라벨을 믿고 「3년이 지났으니 해당 없음」으로 토글을 끄면 법문상 인정될 수 있는 의제를 스스로 포기한다 — 어느 방향이든 UI가 표시한 요건과 엔진 판정이 일치하지 않는다.

**법령**  「소득세법 시행령」 제168조의8③4호(mst=286211): 「「농지법」 제6조제2항제7호에 따른 농지전용허가를 받거나 농지전용신고를 한 자가 소유한 농지 또는 같은 법 제6조제2항제8호에 따른 농지전용협의를 완료한 농지로서 **당해 전용목적으로 사용되는 토지**」 — 3년 기한 요건은 없고, 대신 「당해 전용목적 사용」이라는 실질 요건이 있는데 이것도 입력·판정 대상이 아니다.

**처방**  둘 중 하나로 정리한다 — (a) 법문에 근거가 없는 「(3년 이내)」 라벨과 허가일 입력을 제거하고 「당해 전용목적으로 사용되는 토지」 요건을 별도 확인 항목으로 두거나, (b) 허가일을 buildFarmlandDeeming→FarmlandDeemingInput→checkFarmlandDeeming까지 배선하고 실제로 쓰는 요건을 조문 근거와 함께 명시한다. 배선 없이 라벨만 두는 현재 상태는 금지.

### E3-04 🟠 `legal-accuracy` — 임야 도시지역 판정이 보전녹지지역을 제외하지 않는다 — 주석은 「보전녹지 제외」라고 단언하지만 코드·ZoneType·UI 어디에도 구분이 없다

**위치** `lib/tax-engine/non-business-land/urban-area.ts:52` · **세액영향** 과세표준 10억원 기준 중과분 +100,000,000원 + 장특공제 배제(보전녹지 시업중 임야에 한정) · **안전망** __tests__/tax-engine/non-business-land/urban-area.test.ts:40-47 「녹지 → 도시지역 (임야만)」이 `expect(isUrbanForForest("green")).toBe(true)`로 현행을 고정하나, 보전녹지 케이스는 없다. __tests__/calc/nbl-land-zone.test.ts:14 `["보전

**결함**  「보전녹지 임야가 비사업용으로 오판된다」는 결론은 유지되나, 그 전제는 **사용자가 보전녹지를 입력할 수단이 ZoneType·UI에 존재하지 않는다는 것**이다. 즉 「잘못 계산한다」보다 「해당 구분을 미구현한 채 주석만 구현된 것처럼 단언한다」가 정확한 서술이다. 확정 결함은 (a) urban-area.ts:49 주석↔구현 드리프트, (b) §168의9①2호 단서의 보전녹지 제외 미구현 2건이다.

**재현**  보전녹지지역 소재 임야(산림경영계획 인가), 2012-01-01 도시지역 편입, 2010-01-01 취득 → 2024-01-01 양도, 재촌 없음. 사용자가 용도지역에서 고를 수 있는 값은 「녹지지역」뿐 → 엔진 `isBusiness=false` → +10%p 중과 + 장특공제 배제. 정답은 보전녹지지역이므로 2호 단서의 「도시지역」에 해당하지 않아 3년 경과와 무관하게 사업용.

**법령**  「소득세법 시행령」 제168조의9 제1항 제2호(KoreanLaw mst=286211 본문 실측) — 「다만, 「국토의 계획 및 이용에 관한 법률」에 따른 도시지역(**같은 법 시행령 제30조의 규정에 따른 보전녹지지역을 제외한다.** 이하 이 호에서 같다) 안의 임야로서 도시지역으로 편입된 날부터 3년이 경과한 임야를 제외한다.」

**처방**  ZoneType에 `conservation_green`(보전녹지지역)을 추가하고 UI 용도지역 선택지·`isUrbanForForest`에 배선한다(「지방세법 시행령」 §101② 배율표는 녹지지역 7배로 세분이 없으므로 `normalizeLocalTaxZoneKey`에서 `green`으로 alias 흡수). 당장 신설이 어렵다면 최소한 urban-area.ts:49의 「보전녹지 제외」 주석을 「미구현 — 보전녹지도 도시지역으로 처리됨」으로 정정해 주석↔구현 드리프트를 없앨 것.

### E4-03 🟠 `legal-accuracy` — 별표5(종업원 체육시설) 실내체육시설 부속토지에 §101② 용도지역별 적용배율이 적용되지 않는다

**위치** `lib/tax-engine/non-business-land/other-land.ts:140` · **세액영향** 실내 시설 보유 employee 케이스에서 기준면적이 법정치의 1/배율(1/3~1/7)로 축소된다. 위 시나리오는 nonBusinessRatio 0 → 0.85. · **안전망** 없음(반대 방향 고정도 없음) — other-land-area-limit.test.ts:292~423의 employee 케이스(AT-F2B-2a/2b/3/9/7)는 전부 `field`·`court`만 쓰고 `zoneType`을 base 기본값에 맡긴 채 표값을 그대로 기대한다. `employeeFacilityKinds:["indoor"]` 케이스 0건, e

**결함**  주장 유지 + 범위 보강: 단순 「배율 누락」이 아니라 employee 경로에는 실내 바닥면적 입력(⑤) 자체가 없어 별표5 비고3·4를 적용할 경로가 존재하지 않고, 나아가 종업원수+보유시설을 모두 입력하면 UI가 기준면적 직접입력 필드를 숨기므로(OtherLandDetailSection.tsx:419) 사용자가 우회할 방법도 없다. workplace/business의 「바닥·배율 미확보 시 표값 fallback」과 달리 employee에서는 이 fallback이 영구적이다.

**재현**  종업원 300명 사업장이 녹지지역(§101② 7배)에 종업원용 실내체육시설(바닥면적 300㎡)을 갖춘 잡종지 2,000㎡를 양도. → 기대: 별표5 실내 기준면적 300㎡ × 7배 = 2,100㎡ ≥ 2,000㎡ → 전량 사업용(nonBusinessRatio 0). 실제: 기준면적 300㎡ → 비사업용 1,700㎡ · nonBusinessRatio 0.85 → 양도소득금액의 85%에 +10%p 중과·장특공 배제.

**법령**  소득세법 시행규칙 [별표 5] 비고3·4 verbatim(KoreanLaw get_annexes 실측): 비고3 「실내체육시설의 건축물 바닥면적이 기준면적 이하인 경우에는 당해 건축물 바닥면적을 그 기준면적으로 한다」, 비고4 「종업원용 실내체육시설의 부속토지의 경우에는 실내체육시설의 건축물 바닥면적에 「지방세법 시행령」 제131조의2제2항의 규정에 따른 용도지역별 적용배율을 곱하여 산출한 면적을 기준면적으로 인정한다」(현행 조번호는 지방세법 시행령 §101② — 배율표 전용 조회로 녹지 7배 확인, mst=287223 §101②). 별표3 비고1·3, 별표4 비고1·3도 동일 구조이며 코드는 그쪽만 구현했다.

**처방**  employee 분기에서 `indoor` 항목만 별도 취급 — `min(실내 바닥면적, 표값) × zoneMul`(zoneMul 미확보 시 현행 표값 fallback 유지)로 계산하고 field·court는 그대로 합산한다. 아울러 `indoorFloorArea` 입력을 employee 분기 UI에도 노출해야 비고3이 성립한다(현재 UI 미노출 — 14 동기화 지점 ⑤).

### E5-03 🟠 `plumbing` — 공동소유 지분이 두 개의 비동기 필드로 존재하고, NBL 토지가액 자동조회만 검증 없는 쪽을 곱한다

**위치** `components/calc/transfer/nbl/NblLandAutoFetch.tsx:65` · **세액영향** 위 시나리오에서 §168의11② 판정이 사업용→비사업용으로 뒤집혀 +10%p 중과가 통째로 잘못 부과되고 장기보유특별공제도 배제된다. · **안전망** __tests__/lib/calc/nbl-detailed-cases.test.ts:218-228 ("E2 ownershipRatio<1 — ownerProfile.ownershipRatio 도달 (매퍼 결선)")과 __tests__/tax-engine/non-business-land/integration.test.ts:258 이 `nblOwnershipRa

**결함**  결함은 「범위 밖 입력(≥1 또는 ≤0)에서만」 성립한다 — 정상값 0.5는 엔진·UI 해석이 일치한다. 따라서 정확한 범위는 「`nblOwnershipRatio`에 대한 범위 검증이 ⑧ validate·⑫ Zod 어디에도 없어, 사용자가 힌트(`예: 0.5 (50%)`)와 달리 `50`을 넣으면 UI 자동조회는 verbatim 곱하고 엔진은 조용히 1로 정규화한다」이다. 「지분 필드가 두 개 존재한다」는 부분은 사실이나(ownershipNumerator/Denominator vs nblOwnershipRatio) 그 자체로 세액 오류를 내지는 않으므로 결함의 본체가 아니라 배경이다.

**재현**  사용자가 「공동소유 지분」 칸에 50%를 뜻하는 `50`을 입력(힌트가 0.5를 예시하나 차단은 없음). 주차장운영업(§168의11①2호다목, 기준율 3% — lib/tax-engine/legal-codes/transfer-nbl.ts:116-117 PARKING_OPERATION 0.03), 공시지가 1,000,000원/㎡, 면적 1,000㎡, 당해 수입금액 40,000,000원. 자동조회 버튼은 `Math.floor(1,000,000 × 1,000 × 50)` = 50,000,000,000원을 `nblRevenueCurrentLandValue`에 채운다(정상값 1,000,000,000원). 수입금액비율 = 40,000,000 ÷ 50,000,000,000 = 0.08% < 3% → 비사업용 판정 → +10%p 중과. 정상값이면 4% ≥ 3% → 사업용. 같은 `50`을 엔진(`parseOwnershipRatio`)은 1로 읽어 면적 표시 축소도 하지 않으므로, 한 화면 안에서 두 소비자가 같은 값을 다르게 해석한다.

**법령**  KoreanLaw get_law_text(mst=286211, jo=제168조의11) 본문 확인 — 「②… 토지의 가액에 대한 1년간의 수입금액의 비율 … 1. 당해 과세기간의 연간수입금액을 당해 과세기간의 토지가액으로 나눈 비율」, 「④ … 당해 과세기간의 토지가액이라 함은 당해 과세기간 종료일(과세기간 중에 양도한 경우에는 양도일)의 기준시가를 말한다」. 조문은 분자(수입금액)와 분모(토지가액)를 같은 기준으로 볼 것을 전제하므로 한쪽에만 지분을 곱하면 비율 자체가 왜곡된다.

**처방**  최소 조치: ⑧ validate에 `nblOwnershipRatio`가 비어 있지 않으면 `0 < ratio <= 1`을 강제하는 차단을 추가해 엔진(`parseOwnershipRatio`)과 UI 소비자의 해석이 갈리지 않게 한다. 근본 조치: 별도 필드를 없애고 `getOwnershipRatio(asset)`(ownershipNumerator/Denominator 단일 정본)을 NBL 경로도 그대로 쓰게 하거나, 남긴다면 두 값이 어긋날 때 차단한다.

### E6-05 🟠 `plumbing` — 다건(⑬) 변환에만 `isNonBusinessLand`의 assetKind 게이트가 없다 — 단건과 3중 패턴 불일치

**위치** `lib/calc/multi-transfer-tax-api.ts:186` · **세액영향** 미실증. 도달 경로를 재현하지 못해 구체 금액을 제시하지 않는다. · **안전망** 없음 — 다건 ⑬ 변환의 assetKind 게이트를 검증하는 테스트를 찾지 못했다.

**결함**  다건(⑬) 변환 `multi-transfer-tax-api.ts:186`에 단건과 달리 assetKind 게이트가 없어, Step4를 건너뛰는 단계 점프(사이드바·StepIndicator에 이동 게이트 없음)로 남은 stale `isNonBusinessLand`가 주택 자산에 §104①8호를 붙인다. 실측 영향은 2년 이상 보유 주택 +42,750,000 과대, 1년 미만 주택 −99,500,000 과소(토지 단기 50%가 주택 70%를 대체). UI에는 아무 표시도 뜨지 않는 침묵 오산이다. 브라우저 실조작 재현은 미수행.

**재현**  다건에서 자산을 「토지 + 비사업용 체크」로 만든 뒤 자산종류를 「주택」으로 바꾸고 Step4를 다시 마운트하지 않은 채 계산하면 `isNonBusinessLand: true`가 전송된다. 그러면 `calcTax` T-2가 먼저 잡아 주택에 §104①8호(기본세율 +10%p)를 적용하고, 보유 2년 미만이면 §104① 후단 비교 세율도 주택용 70%/60%가 아니라 토지용 50%/40%(`transfer-tax-rate-calc.ts:369-372` 하드코딩)를 쓴다 — 세율군·§104⑤ 버킷까지 함께 어긋난다.

**법령**  「소득세법」 §104①8호는 「제104조의3에 따른 **비사업용 토지**」만 대상으로 하고, §104의3①은 농지·임야·목장용지·그 밖의 **토지**만 열거한다(법제처 MST 280405 §104·§104의3 본문 실독) — 주택·건물은 대상이 될 수 없다.

**처방**  `lib/calc/multi-transfer-tax-api.ts:186`을 단건과 같은 형태(`primaryKind === "land" ? (primary?.isNonBusinessLand ?? false) : false`)로 맞춘다. 세액 불변(정상 입력에서 no-op).

### A1-02 🟠 `plumbing` — 거주이력·사업용 사용기간 행의 날짜가 비면 매퍼가 그 행을 조용히 버리고 ⑧에도 검증이 없다 — 재촌 0일로 비사업용 확정

**위치** `lib/tax-engine/non-business-land/form-mapper.ts:116` · **세액영향** 총부담세액 359,436,000 vs 282,711,000 — 76,725,000원 과다. 실측 2회(buildNblEngineInput→judgeNonBusinessLand→calculateTransferTax). · **안전망** 없음 — 거주이력을 다루는 __tests__/lib/calc/nbl-residence-sigungu.test.ts:44-46·72-74, nbl-residence-30km-judgment.test.ts는 모두 시작일·종료일을 채운 행만 쓴다. 불완전 행 drop을 고정하는 테스트는 없다.

**결함**  주장 성립하나 범위가 오히려 과소하다. 같은 침묵 drop이 4개 배열에 적용된다 — nblResidenceHistories(form-mapper.ts:113-117) + mapBusinessUsePeriods를 쓰는 nblBusinessUsePeriods(form-mapper.ts:89) · nblPastureLivestockPeriods(form-mapper-helpers.ts:186) · nblVillaUsePeriods(form-mapper-helpers.ts:200). 네 배열 모두 ⑧ 검증 0건이고, 네 UI 모두 빈 날짜 행을 추가한다. 반면 원 failure_scenario의 용도지역은 정정이 필요하다 — general_residential(도시지역)에서는 종료일을 채워도 비사업용이라 차액이 0이고, flip은 agriculture_forest 등 도시지역 밖에서 관측된다.

**재현**  입력(정밀판정 ON·지목 farmland·용도지역 agriculture_forest·면적 1,000㎡·취득 2005-01-01 5억·양도 2026-06-01 15억·자경 ON·토지 시군구 41111·사업용 사용기간 2005-01-01~2026-06-01·거주이력 1건 시군구 41111 시작일 2005-01-01)에서 거주이력의 **종료일만 비워** 두면 → `input.ownerProfile.residenceHistories.length === 0` → isNonBusinessLand=true → 총부담세액 359,436,000. 종료일 2026-06-01을 채우면 rows=1 → isNonBusinessLand=false → 총부담세액 282,711,000. 차액 76,725,000원 과다. 같은 입력으로 validateNblDetailedJudgment(...) 는 null(차단 없음).

**법령**  「소득세법 시행령」 제168조의8 제2항(KoreanLaw MST 286211, 시행 2026-07-01 본문 조회) — "제153조제3항에 따른 농지소재지에 사실상 거주(재촌)하는 자가 「조세특례제한법 시행령」 제66조제13항에 따른 직접 경작(자경)을 하는 농지를 제외한 농지"가 비사업용 농지다. 재촌 구간이 사라지면 이 제외 요건이 성립하지 않아 곧바로 비사업용이 된다.

**처방**  lib/calc/transfer-tax-validate-nbl.ts에 `nblResidenceHistories`·`nblBusinessUsePeriods` 각 행의 시작일·종료일 필수 검증을 추가한다(유예기간 루프 :79-89와 동일한 형태). 매퍼의 drop 자체는 유지하되(엔진에 Invalid Date를 넣지 않기 위함) ⑧이 먼저 막아 「입력했는데 조용히 사라진」 상태를 없앤다.

### U1-03 🟠 `ui-engine-drift` — 주택부수토지 배율 배지·안내가 양도일을 전달하지 않아 2022.1.1. 전 양도분에서 엔진(5배)과 다른 배율(3배)을 표시

**위치** `components/calc/transfer/nbl/HousingLandDetailSection.tsx:39` · **세액영향** 표시only — 엔진 세액은 정확하다. 다만 사용자에게 반대 결론(비사업용 200㎡ 존재)을 안내한다. · **안전망** __tests__/components/nbl-housing-footprint-label.anchor.test.tsx:63-105 — 배지가 엔진 `getHousingMultiplier`와 일치하는지 검증하지만, 기대값도 transferDate 없이 계산하고 컴포넌트에 양도일을 넘길 경로 자체가 없어 연혁 케이스는 덮지 못한다. 엔진 쪽 연혁은 qa-land

**결함**  표시 전용 드리프트로 확정한다(엔진 세액은 정확). 2020.2.11. 대통령령 제30395호 부칙 §1 3호·§39 원문은 이번 세션에서도 MCP로 확인하지 못했다(mst+efYd=20210101 조회는 EXTERNAL_API_ERROR). 다만 이 발견의 성립에는 부칙 해석이 필요 없다 — 부칙 해석이 어느 쪽이든 UI와 엔진이 2022.1.1. 전 양도분에서 서로 다른 배율을 말한다는 사실(dual truth)은 그대로다.

**재현**  주택 부수토지, nblIsMetropolitanArea="yes", nblZoneType="general_residential", nblHousingFootprint="100", acquisitionArea="500", 양도일 2021-06-01. → UI 배지: 「3배 적용 (수도권 주·상·공 3배)」 + 안내문 「수도권: 주거·상업·공업지역 3배…」 ⇒ 사용자는 허용 300㎡·초과 200㎡가 비사업용이라고 읽는다. 엔진: transferDate 2021-06-01 < 2022-01-01 → 5배 → allowedArea 500㎡ ≥ landArea 500㎡ → nonBusinessArea 0, 전량 사업용. 화면 안내와 실제 판정이 정반대다.

**법령**  소득세법 시행령 §168의12 (KoreanLaw MCP mst=286211, 시행 2026-07-01 본문 실측) — 「1. …도시지역 내의 토지: 가. …수도권 내의 토지 중 주거지역ㆍ상업지역 및 공업지역 내의 토지: 3배 / 나. 수도권 내의 토지 중 녹지지역 내의 토지: 5배 / 다. 수도권 밖의 토지: 5배 / 2. 그 밖의 토지: 10배」. 이 3배 세분은 2020.2.11. 대통령령 제30395호 부칙 §1 3호·§39에 따라 2022.1.1. 이후 양도분부터 적용되고 그 전 양도분은 종전 규정(도시지역 일률 5배)에 따른다 — 이 경과규정은 저장소가 urban-area.ts:83-92 및 __tests__/tax-engine/non-business-land/qa-land-type-flow.test.ts:583-607(QA-064b)에서 이미 정본으로 고정하고 있다. 부칙 본문 자체는 이번 MCP 조회에서 직접 확인하지 못했다.

**처방**  NblSectionContainer.tsx:200에서 `transferDate`를 HousingLandDetailSection에 전달하고, 배지 계산과 고정 안내문을 `getHousingMultiplier(zone, isMetro, parsedTransferDate)` 결과 하나로 통일(2022.1.1. 전이면 「도시지역 內 5배 (2022.1.1. 전 양도 — 종전 규정)」 그대로 노출). anchor 테스트에 pre-2022 케이스 1건 추가.

### U1-04 🟠 `legal-accuracy` — 「농지전용 허가·신고 (3년 이내)」의 허가일 입력이 엔진에 도달하지 않고, 「3년 이내」 요건 자체가 §168의8③4호에 없다

**위치** `components/calc/transfer/nbl/FarmlandDetailSection.tsx:64` · **세액영향** 허가일 입력분은 표시only(엔진 미도달). 라벨 오인으로 토글을 켜지 않는 경로에서는 사업용→비사업용 뒤집힘 = §104①8호 +10%p 중과 + 장특공제 배제(과세표준 3억 기준 약 3,000만원 과다). · **안전망** 없음 — `nblFarmlandConversionDate`는 lib/stores/calc-wizard-asset-nbl.ts:288·calc-wizard-asset-factory.ts:274·calc-wizard-asset-nbl-judgment.ts:57(타입 선언)과 Zod에만 등장하고, __tests__·e2e 전수 grep에서 이 필드를 단언하는 테

**결함**  두 갈래로 나눠야 정확하다. (a) **법령 정확성**: 「(3년 이내)」는 §168의8③4호에 없는 요건 — 확정. (b) **배관**: 허가일 DateInput은 FarmlandDeemingInput에 대응 필드가 없어 엔진에 도달하지 않는 dead input — 확정. 다만 (b)로 인한 **세액 오류는 없다**(조문에 기간 요건이 없으므로 날짜를 무시하는 것이 오히려 법문에 부합). 「비사업용 오판으로 3,000만원 과다」는 사용자가 라벨을 믿고 토글을 켜지 않는 경우에만 성립하는 간접·행위 매개 효과이며 코드가 직접 산출하는 오류가 아니다.

**재현**  농지, 농지전용허가일 2012-03-01, 양도 2024-06-01, 재촌·자경 없음, 「농지전용 허가·신고 (3년 이내)」 토글 ON + 허가일 2012-03-01 입력. (a) 표시 측: 사용자가 라벨의 「3년 이내」를 신뢰해 12년 전 허가라는 이유로 토글을 켜지 않으면, 법상 인정되는 §168의8③4호 사용의제를 놓쳐 비사업용으로 판정되고 §104①8호 +10%p 중과가 잘못 적용된다. (b) 배관 측: 토글을 켜면 입력한 허가일은 엔진 input(FarmlandDeemingInput)에 존재하지 않아 완전히 무시된다 — 입력 위젯이 무효(dead input)다. 어느 경우에도 「당해 전용목적으로 사용되는 토지」인지는 묻지도 검증하지도 않는다.

**법령**  소득세법 시행령 §168의8③4호 (KoreanLaw MCP mst=286211, 시행 2026-07-01 본문 실측) — 「「농지법」 제6조제2항제7호에 따른 농지전용허가를 받거나 농지전용신고를 한 자가 소유한 농지 또는 같은 법 제6조제2항제8호에 따른 농지전용협의를 완료한 농지로서 **당해 전용목적으로 사용되는 토지**」. 기간 제한은 없다. 같은 항에서 3년 제한이 붙은 것은 2호(상속개시일부터 3년)와 3호(이농일부터 3년)뿐이다.

**처방**  토글 제목에서 근거 없는 「(3년 이내)」를 제거하고 §168의8③4호 문언대로 「농지전용허가·신고·협의 완료 + 당해 전용목적 사용」으로 바꿀 것. 허가일 DateInput은 (a) 삭제하거나 (b) 유지한다면 FarmlandDeemingInput·form-mapper까지 배선하고 무엇에 쓰이는지 명시할 것. 「당해 전용목적으로 사용되는 토지」 확인 체크박스 신설은 별건으로 판단(14지점 동기화 필요).

### U3-02 🟠 `legal-accuracy` — 결과 카드 「재촌 인정 근거」가 임야(林野) 판정에도 「농지 … §153③」로 표시된다 — 임야 재촌 근거는 「소득세법 시행령」 §168의9②

**위치** `components/calc/NonBusinessLandResultCard.tsx:32` · **세액영향** 표시only — 판정·세액에는 영향 없음(residenceMatch는 echo 필드) · **안전망** __tests__/lib/calc/nbl-result-card-render.test.tsx:41-70 (「재촌 echo: 농지 + 거주지 30km 이내 → 카드에 …직선거리 30km 렌더」 — **농지** 케이스만 고정. 임야 재촌 라벨을 덮는 테스트는 없음)

**결함**  엔진은 농지·임야 **둘 다**에 `residenceMatch`를 채우는데, 카드의 라벨 함수는 세 분기 모두 「농지」와 「§153③」으로 하드코딩되어 있어, 임야 판정 결과에 지목·조문이 모두 틀린 근거가 표시된다.

**재현**  지목=임야, 용도지역=농림, 토지 소재 시·군·구=11680, 동일 시·군·구 거주이력(주민등록 있음) 입력 → 결과 카드 「재촌 인정 근거」에 「농지 소재 시·군·구 내 거주 (§153③1호)」가 표시된다. 실제 적용 조문은 「소득세법 시행령」 §168의9②이며, 같은 카드 ⑦ 적용 법령 칩에는 「소득세법 시행령 §168조의9 ②」가 함께 떠 두 인용이 서로 어긋난다.

**법령**  KoreanLaw MST 286211 본문 확인. 「소득세법 시행령」 §168의8②: "…제153조제3항에 따른 농지소재지에 사실상 거주(이하 \"재촌\"…)" → **농지**만 §153③을 준용. §153③: "1. 농지가 소재하는 시·군·구 안의 지역 2. 제1호의 지역과 연접한 시·군·구 안의 지역 3. 농지로부터 직선거리 30킬로미터 이내에 있는 지역"(제153조 표제는 「농지의 비과세」). 반면 §168의9②는 임야에 대해 **자체 정의**를 둔다: "임야의 소재지와 동일한 시·군·구, 그와 연접한 시·군·구 또는 임야로부터 직선거리 30킬로미터 이내에 있는 지역에 주민등록이 되어 있고 사실상 거주하는 자가 소유하는 임야". 즉 임야 재촌의 근거는 §153③이 아니라 §168의9②다.

**처방**  `residenceMatchLabel`에 지목(landType)을 인자로 받아 농지=「소득세법 시행령」 §153③1~3호(§168의8② 준용), 임야=「소득세법 시행령」 §168의9②로 분기하고, 라벨의 「농지」 표현도 지목에 맞춘다. 인용에는 법령명·법/령 구분을 함께 적는다(현행 「§153③1호」만으로는 법령이 불명).

### E1-04 🟡 `plumbing` — 임야의 「직선거리 (km)」 대체 판정 입력이 엔진에 도달할 수 없다 — 게이트가 되는 `ownerLocation`을 아무도 채우지 않는다

**위치** `lib/tax-engine/non-business-land/forest.ts:100` · **세액영향** 임야 + 거주이력 미입력 + 직선거리 입력 조합에서 재촌기간 0일이 되어 §168조의6 기간기준이 무조건 미충족 → 비사업용(+10%p, 장특공 배제). 위 probe에서 동일 조건 농지는 사업용, 임야는 비사업용으로 갈렸다. · **안전망** 없음 — __tests__/tax-engine/non-business-land/ 전체에서 `farmerResidenceDistance`를 쓰는 케이스는 전부 farmland·pasture 계열이고(qa-land-type-flow.test.ts:51·68·87·123·156, qa-integration.test.ts:309·328 등) 임야 + 직선거리 fa

**결함**  `ownerLocation`이 production에서 한 번도 세팅되지 않아 forest.ts:100 게이트가 도달 불가 dead branch인 것, 그리고 임야에서 「직선거리 (km)」 입력이 경고 없이 무시되는 것은 사실이다. 그러나 (a) 엔진의 임야 결과는 §168조의9②(주민등록 필수)에 **부합**하므로 잘못된 세액이 아니고, (b) ResidenceHistorySection.tsx:115-121의 「주민등록 있음」 토글 + 거주 이력 경로로 임야 재촌을 입증할 수단이 실제로 존재한다. 따라서 이는 「조문이 인정하는 재촌을 주장할 방법이 없다」는 배관 결함이 아니라, **임야(및 목장)에서 효과가 없는 UI 필드를 노출·수용하는 드리프트**에 그친다.

**재현**  임야, 취득 2010-01-01, 양도 2024-01-01, 거주이력 미입력, 직선거리 10km 입력(nblFarmerResidenceDistance=10), 전 기간 사업용 사용기간 입력. 실행(judgeNonBusinessLand probe) 결과 — 지목만 바꾼 동일 입력 비교: farmland → `isNonBusinessLand: false`, warnings `["주거 이력 미입력 — legacy 거리 스냅샷 fallback 사용"]`; forest → `isNonBusinessLand: true`, warnings `[]`, reason `재촌 미충족 + 공익/사업관련/시업중 미해당 → 비사업용`. 사용자가 입력한 10km는 임야에서 아무 경고 없이 버려진다.

**법령**  「소득세법 시행령」 제168조의9 제2항(KoreanLaw MST 286211, 본문 조회 확인) — 「임야의 소재지와 동일한 시·군·구, 그와 연접한 시·군·구 또는 임야로부터 직선거리 30킬로미터 이내에 있는 지역에 **주민등록이 되어 있고 사실상 거주**하는 자가 소유하는 임야」. 주민등록 요건 자체는 코드가 옳으나, 직선거리 경로에 주민등록 사실을 입력할 UI 경로가 아예 없어 조문이 인정하는 「직선거리 30km 이내 + 주민등록」 재촌을 주장할 방법이 없다.

**처방**  둘 중 하나로 정리한다 — (a) 임야에서는 직선거리 fallback을 쓰지 않기로 확정하고 UI에서 임야일 때 그 필드를 숨기거나 「임야는 주민등록 이력이 필요합니다」로 차단(⑧ validate), 또는 (b) 거주이력이 없을 때도 주민등록 여부를 받는 입력을 만들어 form-mapper가 `ownerLocation`을 채우도록 배선한다. 지금처럼 받아서 버리는 상태는 금지된 침묵 무시다.

### E1-05 🟡 `plumbing` — §168조의14② 양도일 의제일이 취득일보다 앞서면 소유일수가 0이 되어 조용히 비사업용으로 확정된다

**위치** `lib/tax-engine/non-business-land/period-criteria.ts:215` · **세액영향** 판정 뒤집힘(사업용 → 비사업용 전량). 다만 발동 조건이 사용자의 날짜 입력 오류라 정상 입력에서는 도달하지 않는다. · **안전망** 없음 — __tests__/tax-engine/non-business-land/deemed-transfer-date.test.ts는 의제일이 취득일·양도일 사이인 정상 케이스만 다룬다(범위 밖 값 케이스 0건).

**결함**  `getPeriodJudgmentDate`가 의제일을 그대로 반환하고 상·하한 검증이 없어, 의제일 < 취득일이면 `totalOwnershipDays === 0` 분기가 발동해 사업용이던 토지가 경고 없이 비사업용으로 확정된다. ⑧ validate는 의제일의 존재만 요구하고 순서를 보지 않는다.

**재현**  농지, 취득 2010-01-01, 양도 2024-01-01, 재촌 fallback 5km, 전 기간 자경. 의제 미설정 → `isNonBusinessLand: false`(사업용, 「도시지역 밖 농지 + 사용기준 충족」). 같은 입력에 `deemedTransferReason: "auction"`, `deemedTransferDate: 2009-06-01`(취득일 이전 오타)만 추가 → `isNonBusinessLand: true`, `totalOwnershipDays: 0`, reason 「사용기준 미충족 (재촌·자경 + 사용의제 모두 미해당)」. 오류 메시지·경고 없이 +10%p 중과가 붙는다.

**법령**  「소득세법 시행령」 제168조의14 제2항(KoreanLaw MST 286211, 본문 조회 확인) — 「해당 각 호에서 규정한 날을 양도일로 보아 제168조의6의 규정을 적용하여」. 제1호 최초의 경매기일·제2호 최초의 공매일은 성질상 취득 이후의 날이므로 취득일 이전 값은 입력 오류이며, 이를 판정 결과(비사업용)로 흡수할 조문상 근거는 없다.

**처방**  lib/calc/transfer-tax-validate-nbl.ts에 `nblDeemedTransferDate`가 취득일 이후·양도일 이전인지 차단을 추가하고(자동 보정 금지 원칙에 따라 fallback이 아니라 차단), 엔진 쪽에서도 의제일이 범위를 벗어나면 warning을 남기도록 할 것.

### E2-06 🟡 `dead-code` — 목장 기준면적 직접입력(pasture.standardArea) 경로가 UI·매퍼에 없다 — UI 안내문은 있다고 말하고, 테스트만 그 경로를 쓴다

**위치** `lib/tax-engine/non-business-land/form-mapper-helpers.ts:177` · **세액영향** 표시only(입력 채널 부재). 자동산출 경로 자체는 정상 동작한다. · **안전망** __tests__/tax-engine/non-business-land/pasture.test.ts:23·43·56·75 — 전부 standardArea 직접입력을 쓴다(=UI 도달 불가 경로를 고정).

**결함**  엔진이 최우선으로 보는 `pasture.standardArea`(직접입력)를 buildPasture가 전혀 매핑하지 않아 프로덕션 경로에서 항상 undefined이고, 그럼에도 UI는 「위 「기준면적」을 직접 입력하면 이 선택은 쓰이지 않습니다」라고 안내한다(그런 입력 필드는 화면에 없다).

**재현**  사용자가 UI 안내를 읽고 「기준면적을 직접 입력하면 시설 선택이 무시된다」고 이해하지만 입력할 필드가 없다. 동시에 pasture.test.ts의 주요 케이스 4건이 프로덕션에서 도달 불가능한 standardArea 경로만 검증하므로, 실제 사용 경로(축종×두수×시설 자동산출)의 회귀 안전망이 실제보다 두꺼워 보인다.

**법령**  「소득세법 시행령」 제168조의10③은 기준면적을 별표 1의3에 따라 계산하도록 정하므로 직접입력 자체가 위법은 아니다(납세자 산정값 입력). 이 발견은 법령 위배가 아니라 배선·안내 불일치다.

**처방**  UI 안내문에서 존재하지 않는 「기준면적 직접입력」 언급을 지우거나, 반대로 nblPastureStandardArea 필드를 14지점(폼·initial·normalize·API변환·UI·validate·Zod·매퍼)에 배선한다. 어느 쪽이든 pasture.test.ts에 자동산출 경로(축종·두수·시설) 기반 케이스를 추가해 안전망을 실제 경로로 옮길 것.

### E2-07 🟡 `ui-engine-drift` — 면적 안분 분기에서 businessUseRatio에 nonBusinessRatio를 넣어 결과 카드가 「사업용 비율」을 역전 표시한다

**위치** `lib/tax-engine/non-business-land/pasture.ts:181` · **세액영향** 표시only — 세액은 surcharge.nonBusinessAreaRatio를 쓰므로 영향 없음. · **안전망** 없음 — __tests__/tax-engine/non-business-land/qa-integration.test.ts:481은 두 실행 간 businessUseRatio 동일성만 비교하고 의미를 고정하지 않는다.

**결함**  표시 전용 드리프트(세액 무영향)이며, 동일 패턴은 5개 모듈 9개 지점이다(other-land.ts:492 mixedUse 분기 포함 — 원 발견은 8개로 셌다).

**재현**  목장용지 15,000㎡ 중 기준면적 10,000㎡ → 결과 카드 「사업용 비율 33.3%」로 표시(실제 사업용 면적 비율 66.7%). 세액에 쓰이는 값은 surcharge.nonBusinessAreaRatio(engine.ts:280)라 세액은 옳다.

**법령**  해당 없음 — 표시 의미 드리프트이며 조문 요건과 무관하다.

**처방**  안분 분기에서 `businessUseRatio: 1 - areaProportioning.nonBusinessRatio`로 바꾸거나(전 분기 일괄), 카드 라벨을 분기별 의미에 맞게 분리한다. 5개 모듈 8개 지점이 같은 패턴이므로 단일 결정 후 일괄 적용할 것.

### E2-08 🟡 `legal-accuracy` — 목장 사육두수 입력에 별표 1의3 제2호의 두수 산정방법(3가지 중 선택)이 안내되지 않는다 — 재산세 sibling은 명시한다

**위치** `components/calc/transfer/nbl/PastureDetailSection.tsx:74` · **세액영향** 두수는 기준면적에 선형으로 곱해지므로 입력 오류가 곧바로 nonBusinessAreaRatio(= 세액 중과 대상 면적비)에 반영된다. 위 시나리오에서 24.875% 면적이 +10%p 중과 대상이 된다. · **안전망** 없음 — pasture 관련 테스트는 두수 값의 법정 산정방법을 다루지 않는다(livestock-standards.test.ts는 1두당 면적표만 고정).

**결함**  별표 1의3 제2호의 법정 두수 산정방법(3가지 중 납세자 선택)이 「사육 두수」 입력에 안내되지 않는다. 엔진 산식·표 값 자체는 법문과 일치하므로 이는 법령 요건 오구현이 아니라 입력 안내 부재이며, 오류 발생 여부는 사용자 입력에 종속된다.

**재현**  한우 사육 30두를 최근 3과세기간 최고두수 평균으로는 30두이나 양도일 현재 두수 10두만 입력 → 기준면적 7,512.5×10 = 75,125㎡ 대신 7,512.5×30 = 225,375㎡가 되어야 할 한도가 3분의 1로 줄고, 토지 100,000㎡ 기준으로 24,875㎡가 비사업용으로 안분된다(원래는 전량 사업용). 잘못된 값이 조용히 통과한다.

**법령**  「소득세법 시행령」 [별표 1의3] 제2호(KoreanLaw get_annexes 본문): 「가축두수는 다음 각 목의 어느 하나의 방법 중 납세자가 선택하는 방법에 따라 산정한다. 가. 양도일 이전 최근 6과세기간… 중 …3과세기간의 최고사육두수를 평균한 것 나. 최근 4과세기간 중 …2과세기간… 다. 축산업을 영위한 기간이 2년 이하인 경우 …과세기간의 최고사육두수를 평균한 것」. 1호 표의 1두당 면적값은 코드와 완전 일치함을 확인했다(7.5/5/0.5ha/0.25ha … 밍크 5수당 7·7).

**처방**  FieldCard hint에 별표 1의3 제2호 3가지 산정방법을 명시하고(3-state 선택을 두거나 최소한 문구로), 자동산출 warning 문자열(pasture.ts:154-158)에도 어떤 산정방법 전제인지 드러낸다. 재산세 sibling의 문구 정책과 동일 층위로 맞출 것.

### E2-09 🟡 `legal-accuracy` — §168의8② 후단이 준용하는 조특령 §66⑭(사업소득+총급여 3,700만원 이상 과세기간은 자경기간에서 제외)이 반영도 안내도 되지 않는다

**위치** `lib/tax-engine/non-business-land/farmland.ts:144` · **세액영향** 자경기간 과대 인정 → §168의6 기간기준 통과 → +10%p 중과·장특공 배제가 적용되지 않을 수 있다. 구체 세액은 산출하지 않았다(입력 채널이 없어 대조군을 만들 수 없다). · **안전망** 없음 — farmland.test.ts·qa-* 어디에도 소득 결격 과세기간 축이 없다.

**결함**  §168의8② 후단이 준용하는 조특령 §66⑭의 결격 과세기간 제외가 1호(3,700만원)·2호(총수입금액) 모두 NBL 자경기간 산정에 반영도 안내도 되지 않는다. 엔진이 스스로 틀리는 결함이 아니라 입력 경로·안내 부재이며, 같은 조문의 §69 자경감면 축은 이미 [D7-10]로 미해소 기록돼 있어 처방을 함께 설계해야 한다.

**재현**  2014-01-01~2024-01-01 자경으로 입력했으나 그중 2019~2023 과세기간에 근로소득 총급여 5,000만원이 있는 소유자 → 법문상 그 5개 과세기간은 자경기간에서 제외되어 §168의6 기간기준(직전 3년 중 1년 초과 등)에서 비사업용으로 기울 수 있으나, 엔진은 10년 전 기간을 자경으로 인정해 사업용으로 판정한다(과소과세 방향).

**법령**  「소득세법 시행령」 제168조의8②(mst=286211) 후단: 「이 경우 자경한 기간의 판정에 관하여는 「조세특례제한법 시행령」 제66조제14항을 준용한다.」 · 「조세특례제한법 시행령」 제66조⑭1호(mst=287181): 「사업소득금액(농업ㆍ임업…제외)과 …총급여액의 합계액이 3천700만원 이상인 과세기간이 있는 경우 그 기간은 …경작한 기간에서 제외한다」(2호는 사업소득 총수입금액 기준).

**처방**  최소 조치로 자경 기간 입력 FieldCard hint에 조특령 §66⑭ 결격 과세기간 제외를 명시하고(사용자가 제외 후 기간을 입력하도록), 나아가 과세기간별 소득 결격 플래그 입력을 추가해 엔진이 해당 구간을 자경기간에서 제외하도록 한다.

### E3-05 🟡 `legal-accuracy` — 임야 도시지역 편입유예 step의 legalBasis가 「소득세법 시행령 §168조의14 ①」로 표시된다 — 그 항은 부득이한 사유 규정이고 임야 편입 3년은 §168의9①2호 단서다

**위치** `lib/tax-engine/legal-codes/transfer-nbl.ts:50` · **세액영향** 표시only · **안전망** 없음 — `URBAN_GRACE` 문자열을 단언하는 테스트는 __tests__ 전수 grep 0건.

**결함**  확정 주장은 「인용 문자열 오류 1건(§168의14① → §168의9①2호 단서)」에 한정된다. suggested_fix 후단의 `checkIncorporationGrace` 2년/3년 연혁 스위치 오적용 의혹은 period-criteria.ts:316-318 주석이 스스로 「§168-8⑥ 농지 / §168-10⑤ 목장 편입유예. 기본 3년. 2015.2.2 이전 양도분은 2년 레거시」로 농지·목장 전용임을 명시하고 임야가 그것을 그대로 재사용한다는 사실까지는 확인했으나, 2015-02-02 이전 시행본 §168의9①2호 단서의 기간(2년/3년)은 과거 시행본 조회 실패로 대조하지 못해 「확인 필요」로 남긴다.

**재현**  임야·도시지역·편입일 입력 후 계산 → 결과 카드 판정 단계 「Step 3-2-1 도시지역 內 편입유예」에 근거 배지가 「소득세법 시행령 §168조의14 ①」로 출력된다. 사용자가 그 조문을 열어보면 편입유예 문언이 없어 근거를 확인할 수 없다(세액은 불변).

**법령**  「소득세법 시행령」 제168조의14 제1항(KoreanLaw mst=286211 본문 실측)은 1호 사용금지·제한, 2호 문화유산/자연유산 보호구역, 3호 그 상속토지, 4호 시행규칙 위임 부득이한 사유만 규정하며 도시지역 편입에 관한 문언이 없다. 임야의 편입 3년 기준은 같은 영 제168조의9 제1항 제2호 단서(「도시지역으로 편입된 날부터 3년이 경과한 임야를 제외한다」)에 있다.

**처방**  `URBAN_GRACE`를 `FOREST_URBAN_GRACE: "「소득세법 시행령」 제168조의9 제1항 제2호 단서"`로 정정하고(농지·목장 상수와 대칭), forest.ts:222·238의 참조를 갱신한다. 아울러 forest.ts:215가 쓰는 `checkIncorporationGrace`는 §168의8⑥·§168의10⑤용 2년/3년 연혁 스위치를 담고 있어(period-criteria.ts:331-337) 임야에도 2015-02-02 이전 양도분에 2년을 적용하는데, 현행 §168의9①2호 단서는 3년 고정이다 — 임야에 별도 연혁이 있었는지 확인한 뒤 필요하면 임야 전용 3년 고정 헬퍼로 분리할 것.

### E4-04 🟡 `plumbing` — §168의11①1호 종목 코드가 표에 없는 값이면 기준면적이 0이 되어 전량 비사업용으로 확정된다

**위치** `lib/tax-engine/non-business-land/other-land.ts:147` · **세액영향** nonBusinessRatio 0(또는 정상 표값 기반 값) → 1.0. 토지 전액이 중과 대상이 된다. · **안전망** 없음 — other-land-area-limit.test.ts에 미등재 종목 코드 케이스 0건.

**결함**  `nblOtherSportsFacilityType`이 Zod에서 `z.string()`으로만 검증되어 별표3/4 표에 없는 문자열이 엔진까지 도달하면, `lookupStd`가 undefined→skip 처리해 기준면적이 0이 되고 토지 전량이 비사업용으로 판정된다(오류가 아니라 조용한 오답).

**재현**  `/api/calc/transfer`에 `nblLandType:"other_land", nblOtherRelatedBusinessType:"sports", nblOtherSportsFacilityType:"xyz"`(오타·구버전 코드·직접 호출)를 담아 전송, 토지 1,000㎡ → 기대: 입력 오류 차단 또는 직접입력 fallback. 실제: 기준면적 0㎡ · nonBusinessRatio 1.0 → 전량 +10%p 중과·장특공 배제.

**법령**  소득세법 시행령 §168조의11①1호 + 시행규칙 §83의4①③(별표3·4) — KoreanLaw 본문 확인. 기준면적 0을 인정할 근거 조항은 없다(별표3·4 어느 행에도 0이 없다).

**처방**  ⑫ Zod에서 `nblOtherSportsFacilityType`을 별표3/4 키 enum(`z.enum([...])`)으로 좁히거나, `resolveAreaLimit`이 `events`가 하나도 lookup되지 않았을 때 0이 아니라 `o.standardAreaLimit`(=미해소)로 떨어지게 한다. 같은 처리를 `sportsExtraEvents`·`employeeFacilityKinds`에도 적용.

### E4-05 🟡 `plumbing` — 예비군훈련장(5호다목) 부대편성인원 코드가 별표6 구간 밖이면 TypeError로 500이 난다

**위치** `lib/tax-engine/non-business-land/other-land.ts:167` · **세액영향** 표시only(세액 산출 없음) — 계산 자체가 500으로 실패한다. · **안전망** 없음 — other-land-area-limit.test.ts의 reserve_forces 케이스는 모두 유효 구간 키만 사용한다.

**결함**  `reserveForcesUnitSize`가 `RESERVE_FORCES_STD`의 4개 키가 아니면 `tier`가 undefined가 되고 `tier[f]`에서 TypeError가 발생한다 — validate는 이 조합을 통과시킨다.

**재현**  `/api/calc/transfer`에 `nblOtherRelatedBusinessType:"reserve_forces", nblOtherReserveUnitSize:"le1200"(오타·구버전 값), nblOtherReserveFacilities:["tactical"]` 전송 → 기대: 입력 오류(400) 또는 직접입력 fallback. 실제: 엔진에서 TypeError → 원인 표시 없는 HTTP 500.

**법령**  소득세법 시행령 §168조의11①5호다목 + 시행규칙 §83의4⑩ [별표 6] 제2호 — KoreanLaw get_annexes 실측으로 부대편성인원 4구간(800명 이하/801~2,400/2,401~5,000/5,001 이상)과 시설별 면적(15,000·3,600·1,650·2,500 등)이 코드의 `RESERVE_FORCES_STD`와 완전 일치함을 확인했다. 구간 밖 값은 별표에 존재하지 않는다.

**처방**  ⑫ Zod에서 `nblOtherReserveUnitSize`를 `z.enum(["le800","le2400","le5000","gt5000"])`로 좁히고, 엔진에도 `const tier = RESERVE_FORCES_STD[size]; if (!tier) return o.standardAreaLimit;` 가드를 둔다(자동 안분 fallback 금지 원칙상 임의값 대입은 금지 — 직접입력으로 떨어뜨리거나 TaxCalculationError로 명시 차단).

### E4-06 🟡 `legal-accuracy` — 공장입지기준면적 별표6 3호바목의 「기준면적의 100분의 10 이내」 한도가 엔진에서 강제되지 않는다

**위치** `lib/tax-engine/factory-standard-area.ts:99` · **세액영향** 위 시나리오에서 nonBusinessRatio 0.56 → 0.4333(비사업용 16,800㎡ → 13,000㎡). 납세자에게 유리한 방향의 과소 산출. · **안전망** 없음 — __tests__/tax-engine/non-business-land/factory-land-standard-area.anchor.test.ts / factory-land-plumbing.anchor.test.ts에 바목 10% 한도를 고정하는 케이스 0건(`additionalRecognizedArea` 상한 검증 grep 0건).

**결함**  주장 유지 + 범위 확장: 같은 무클램프 경로가 재산세 분리과세에도 있다 — lib/tax-engine/separate-taxation.ts:448이 `factoryAdditionalRecognizedArea`를 동일 함수에 그대로 넘기고, lib/validators/property-input.ts:178도 `z.number().nonnegative()`만 건다. 즉 양도세 NBL 단독 결함이 아니라 `computeFactoryStandardArea` 공용 leaf의 결함이다.

**재현**  읍·면지역 공장, 연면적 2,000㎡ · 기준공장면적률 20% → 산출면적 10,000㎡, 제한지역 아님(20% = 2,000㎡), 공장 전체 부속토지 30,000㎡. 「추가 인정면적」에 종업원용 체육시설 명목으로 5,000㎡ 입력 → 기대: 바목 한도 = 기준면적의 10% 수준(≈1,200㎡)으로 제한되어 기준면적 ≈13,200㎡ · 비사업용 ≈16,800㎡. 실제: 기준면적 17,000㎡ · 비사업용 13,000㎡ → 비사업용 면적이 3,800㎡(전체의 12.7%p) 과소 산출된다.

**법령**  지방세법 시행규칙 [별표 6] 3호바 verbatim(KoreanLaw get_annexes 실측, 개정 2025.10.31.): 「공장입지기준면적을 산출할 때 다음 표의 기준면적에 해당하는 종업원용 체육시설용지(**공장입지기준면적의 100분의 10 이내에 해당하는 토지에 한정한다**)는 공장입지기준면적에 포함되는 것으로 한다」 — 나·다·라목에는 이런 비율 상한이 없고 바목에만 있다. 3호가목(10%/20%·3,000㎡)과 1호 산식(연면적 × 100 ÷ 기준공장면적률), 2호다(다업종 합산)는 코드와 일치함을 같은 조회로 확인했다.

**처방**  바목 몫을 나·다·라목과 분리된 입력으로 받고(`employeeSportsFacilityArea`), `Math.min(입력, (baseArea + additionalAllowanceApplied) * 0.1)`로 클램프한다. 분리 전이라면 최소한 validate에서 「추가 인정면적 중 종업원용 체육시설분은 기준면적의 10% 이내」를 확인시키는 차단을 둔다.

### E5-04 🟡 `dead-code` — 임야·목장의 종중 분기가 무조건 의제에 선점당해 도달 불가

**위치** `lib/tax-engine/non-business-land/forest.ts:65` · **세액영향** 표시only (현행 두 경로 결론 동일). · **안전망** __tests__/tax-engine/non-business-land/unconditional-exemption.test.ts:211-223 ("종중 2005.12.31 이전 취득 농지 → 의제")이 무조건 의제 쪽만 고정한다. forest.ts/pasture.ts 종중 분기를 직접 겨냥한 테스트는 __tests__/tax-engine/non-busines

**결함**  「종중 분기가 judgeNonBusinessLand 경로에서 도달 불가」는 실측으로 확인됐다. 그러나 「현행 두 경로 결론 동일」은 정정해야 한다 — 도시지역 시업중·특수산림사업지구 임야에서는 갈리며, 그 corner에서는 선점하는 무조건 의제 쪽이 법령상 옳다(§168의9③8호는 다목 사유라 ①2호 단서의 적용을 받지 않는다). **따라서 원 발견의 suggested_fix(「무조건 의제의 레거시 분기를 농지로 한정하고 임야·목장은 지목별 judge로 되돌린다」)는 채택하면 회귀를 만든다** — 목장 쪽은 더 명확하다(missed 참조). 보고 가치는 「같은 요건이 3곳에 중복 정의되어 개정 시 한 곳만 고치면 조용히 무시된다」로 한정된다.

**재현**  기능적 오답은 아직 없다(두 경로 모두 사업용 판정으로 수렴 — 임야·목장의 §168의9③8호·§168의10②2호 경로는 전체 소유기간을 사업용으로 보아 §168의6 기간기준도 통과한다). 위험은 유지보수다: 예컨대 임야 종중 요건이 개정되어 forest.ts:65-70만 고치면 그 수정은 조용히 무시되고 unconditional-exemption.ts:153-162의 옛 판정이 그대로 나온다. 반대로 무조건 의제 쪽만 고치면 임야·목장에서 §168의6 기간기준을 건너뛰는 현행 구조가 그대로 남는다.

**법령**  KoreanLaw get_law_text(mst=286211) 본문 확인 — 종중 규정은 지목별로 각각 존재한다: §168의8③6호(농지), §168의9③8호(임야), §168의10②2호(목장용지). 셋 모두 「2005년 12월 31일 이전에 취득한 것에 한한다」로 문언이 같아 현재는 결론이 갈리지 않는다.

**처방**  종중 판정을 한 곳으로 모은다. 임야·목장은 §168의14③이 아니라 §168의9③8호·§168의10②2호 소관이므로, 무조건 의제의 레거시 분기를 농지(§168의14③4호가목)로 한정하고 임야·목장은 지목별 judge가 처리하도록 되돌리는 편이 조문 구조와 일치한다.

### E5-05 🟡 `legal-accuracy` — 임야·목장 종중 의제의 legalBasis가 적용되지 않는 조문을 인용한다

**위치** `lib/tax-engine/non-business-land/unconditional-exemption.ts:159` · **세액영향** 표시only · **안전망** 없음 — __tests__/tax-engine/non-business-land/unconditional-exemption.test.ts:211-223은 `reason`만 단언하고 `legalBasis`는 검증하지 않는다.

**결함**  레거시 종중 분기는 농지·임야·목장 전부에 대해 `legalBasis: "시행령 §168조의14 ③ 4호 가목 · §168-8 ③ 6호 등"`을 붙이는데, §168의14③4호가목과 §168의8③6호는 모두 농지 전용 조문이라 임야·목장 판정의 근거가 될 수 없다.

**재현**  landType=forest, isJongjoongOwned=true, jongjoongAcquisitionDate=2003-05-01 → 결과의 `appliedLawArticles`와 판정단계 legalBasis에 「시행령 §168조의14 ③ 4호 가목 · §168-8 ③ 6호 등」이 실린다(probe에서 해당 분기 진입 실측). 임야 판정인데 농지 전용 조문만 인용되어, 신고서·산출근거를 그대로 신뢰한 이용자가 잘못된 근거를 제시하게 된다.

**법령**  KoreanLaw get_law_text(mst=286211) 본문 확인 — §168의14③4호 본문은 「법 제104조의3제1항제1호 나목에 해당하는 **농지**로서…」로 농지에 한정된다. §168의8③6호도 「종중이 소유한 **농지**(2005년 12월 31일 이전에 취득한 것에 한한다)」다. 임야의 근거는 §168의9③8호 「종중이 소유한 **임야**(2005년 12월 31일 이전에 취득한 것에 한한다)」, 목장용지의 근거는 §168의10②2호 「종중이 소유한 **목장용지**(2005년 12월 31일 이전에 취득한 것에 한한다)」다.

**처방**  categoryGroup별로 legalBasis를 분기한다(farmland→§168의14③4호가목, forest→§168의9③8호, pasture→§168의10②2호). 문자열 리터럴 대신 `lib/tax-engine/legal-codes/transfer-nbl.ts`에 상수를 추가해 `verify:legal` 커버리지(manifest/additions-transfer.ts)에도 등록한다.

### E5-06 🟡 `dead-code` — grace-period.ts 전체가 미사용 — 유예기간 합산 로직은 period-criteria로 이관됐다

**위치** `lib/tax-engine/non-business-land/grace-period.ts:21` · **세액영향** 표시only (도달 불가) · **안전망** 없음 — `calculateGraceDaysInWindow`를 직접 호출하는 테스트가 없다. 대체 로직은 __tests__/tax-engine/non-business-land/review-2026-08-f29.test.ts가 덮는다.

**결함**  `calculateGraceDaysInWindow`는 저장소 어디에서도 호출되지 않고 barrel(index.ts)에서도 수출되지 않는다. 유예기간은 현재 `meetsPeriodCriteria` 안에서 사업용 사용기간과의 합집합으로 처리되므로, 이 파일이 구현한 「일수 합산」 방식은 폐기된 모델이다.

**재현**  실행 경로에 없으므로 오답을 내지 않는다. 위험은 재사용이다 — 이름이 「유예기간 일수 계산」이라 후속 작업자가 새 지목·새 판정에서 이 함수를 부르면 §83의5①5호·6호처럼 기산일이 취득일이라 구조적으로 사업용 사용기간과 겹치는 유예구간이 두 번 계산되어 사업용 일수가 과대해진다(period-criteria.ts:148-152가 명시적으로 경고하는 바로 그 회귀).

**법령**  KoreanLaw get_law_text(mst=286211, jo=제168조의14) 본문 확인 — 「①… 해당 각 호에서 규정한 기간동안 법 제104조의3제1항 각 호의 어느 하나에 해당하지 않는 토지로 보아 … 판정한다」. 「그 기간 동안 비사업용에 해당하지 않는 것으로 본다」는 의제이므로 일수 가산이 아니라 합집합이 맞고, 현행 period-criteria 구현이 조문에 부합한다.

**처방**  파일을 삭제하거나, 남긴다면 `@deprecated — §168의14① 유예는 meetsPeriodCriteria의 합집합 경로가 정본. 일수 합산 금지` 주석과 함께 명시한다. (CLAUDE.md Surgical Changes 원칙상 리뷰어는 삭제하지 않고 보고만 한다.)

### E6-02 🟡 `integer-arithmetic` — 비사업용 면적비율 안분에 `applyRate`(double 곱)를 써 ratio 0.7 등에서 1~2원 과소 산출

**위치** `lib/tax-engine/transfer-tax-split-rate.ts:440` · **세액영향** 실측 2원 과소(과세표준 7억·ratio 0.7). 1~수 원 규모. · **안전망** 부분 안분 세액을 고정하는 anchor는 `__tests__/tax-engine/transfer/partial-nbl-104-5.anchor.test.ts`(ratio 0.5·0.2·0.3만, 해당 조합은 double 오차가 발생하지 않는다)와 `__tests__/tax-engine/transfer-tax/nbl-partial-area-surcharge.t

**결함**  면적비율 안분이 `Math.floor(amount × ratio)`(=`applyRate`)라 0.7처럼 이진 표현이 부정확한 비율에서 안분 과세표준이 1원 작아지고, 그만큼 세액이 과소 산출된다.

**재현**  과세표준 700,000,000 · `nonBusinessLandAreaRatio = 0.7`(§168의11⑥1호 복합용도 300/1000 등 실제 산출값) · 토지 · 취득 2013-06-01 · 양도 2024-06-01. 워크트리 mock 세율로 `resolveSplitAwareTax` 실측: nbl 파트 과세표준이 **489,999,999**(정확값 490,000,000), 그 외 파트 210,000,001(정확값 210,000,000)로 갈려 산출세액 **278,919,998** — 정확 안분값 278,920,000 대비 **2원 과소**.

**법령**  「소득세법」 §104⑤ 본문 후단 — 「한 필지의 토지가 제104조의3에 따른 비사업용 토지와 그 외의 토지로 구분되는 경우에는 각각을 별개의 자산으로 보아 양도소득 산출세액을 계산한다」(법제처 MST 280405 실독). 안분 자체는 적법하고, 다투는 것은 절사 방식이다(법정 절사 규정 아님 — 저장소 내부 규약 위반).

**처방**  `applyRate(x, ratio)` 대신 `applyRateFraction`/`applyFairMarketRatio` 계열의 정수 분수연산으로 안분한다(예: ratio를 `Math.round(ratio*1e6)/1e6` 분자·분모로 환산). 회귀 anchor는 ratio 0.7 × 과세표준 700,000,000의 절대값 278,920,000을 고정.

### E6-03 🟡 `dead-code` — `calcLongTermHoldingDeduction`의 `rules` 인자(DB `deduction:long_term_holding`)가 한 번도 읽히지 않는다 — `exclusions`의 `non_business_land`가 실제 동작과 무관

**위치** `lib/tax-engine/transfer-tax-lthd.ts:84` · **세액영향** 표시only(현행 세액 영향 0). 다만 DB 튜닝이 조용히 무효가 되는 운영 리스크. · **안전망** 없음 — `longTermHoldingRules`를 소비 여부로 검증하는 테스트를 찾지 못했다(`grep -rn "longTermHoldingRules" lib app` 결과 소비 지점 0건).

**결함**  장기보유특별공제 규칙(공제율·최소보유연수·`exclusions`)이 DB에서 로드·검증돼 함수 인자로 전달되지만 본문에서 전혀 참조되지 않아, `exclusions: ["non_business_land", ...]` 설정이 비사업용 토지 장특 배제를 시사하는데도 아무 효력이 없다.

**재현**  운영자가 `tax_rates`의 `transfer:deduction:long_term_holding`에서 `exclusions`를 바꾸거나 `general.ratePerYear`/`maxRate`를 조정해도 산출세액은 **한 원도 바뀌지 않는다**(엔진이 그 객체를 읽지 않는다). 예: `maxRate`를 0.30→0.40으로 바꿔 시딩해도 15년 보유 토지의 장특공제율은 30% 그대로다. 반대로 `exclusions`에 `non_business_land`가 들어 있는 것을 보고 「NBL은 장특 배제 중」이라고 판단하면 §95② 해석을 틀리게 된다.

**법령**  「소득세법」 §95② — 장특공제 배제 대상은 「제104조제3항에 따른 미등기양도자산과 같은 조 제7항 각 호에 따른 자산」뿐이고 **비사업용 토지는 배제 대상이 아니다**(법제처 MST 280405, 시행 2026-01-01 본문 실독). 즉 현행 코드 동작(NBL에도 표1 적용)이 맞고, DB 설정 문자열이 법과 어긋난 방향으로 오도한다.

**처방**  둘 중 하나로 정리한다 — (a) `rules` 인자를 제거하고 「LTHD 정본은 `calcLongTermRate` 코드」임을 시그니처로 표현하거나, (b) 시드의 `exclusions`에서 최소한 `non_business_land`를 빼 §95②과 어긋나지 않게 한다. 어느 쪽이든 세액 불변.

### E6-04 🟡 `legal-accuracy` — NBL 판정 결과의 `surcharge.longTermDeductionExcluded`가 현행 §95②과 어긋난 값을 항상 내고 테스트가 그것을 고정한다

**위치** `lib/tax-engine/non-business-land/engine.ts:281` · **세액영향** 표시only (현재 소비자 0 — 세액·표시 어디에도 영향 없음). · **안전망** `__tests__/tax-engine/non-business-land/qa-integration.test.ts:192,211` ("QA-080: 비사업용 → additionalRate 0.10 + longTermDeductionExcluded true")와 `__tests__/tax-engine/non-business-land/engine.test.ts:

**결함**  `surcharge.longTermDeductionExcluded`는 제품 소비자가 0건인 순수 echo이고, 그 값(비사업용이면 true)은 **현행** §95②과 어긋난다. 다만 구 §95²(2016.1.1. 전)의 비사업용 토지 배제 규정을 확인하지 못했으므로 「법적으로 틀렸다」가 아니라 「현행 조문 기준으로 어긋나며 연혁 잔재일 가능성이 있다」로 읽어야 한다. 세액·표시 영향은 0.

**재현**  `judgeNonBusinessLand`로 비사업용 판정을 받은 토지의 판정 객체는 `surcharge.longTermDeductionExcluded === true`를 반환하지만, 같은 자산의 `calculateTransferTax` 결과는 `longTermHoldingDeduction > 0`(§95② 표1 적용)이다. 이 필드를 결과 카드·PDF에 배선하는 순간 화면에 「장기보유특별공제 배제」가 뜨면서 바로 아래 공제액과 모순되고, 현행법과도 어긋난다.

**법령**  「소득세법」 §95② — 「제94조제1항제1호에 따른 자산(**제104조제3항에 따른 미등기양도자산과 같은 조 제7항 각 호에 따른 자산은 제외한다**)으로서 보유기간이 3년 이상인 것 …」. 비사업용 토지(§104①8호)는 이 괄호 제외 목록에 없다 — 법제처 MST 280405, 시행 2026-01-01 본문 실독.

**처방**  필드를 제거하거나(권장 — 소비자 0), 최소한 의미를 「§104①8호 중과 해당」으로 바꾸고 `qa-integration.test.ts:211`·`engine.test.ts:88`의 기대값을 §95② 본문 기준으로 재정렬한다(memory `feedback_anchor_correction_legal_priority` — 법령 정합 우선).

### A1-03 🟡 `ui-engine-drift` — 클라이언트 무조건의제 어댑터가 `transferCause=public_expropriation` 단독 트리거를 세지 않아 서버 매퍼와 판정 기준이 갈린다

**위치** `lib/calc/nbl-unconditional-exemption-status.ts:173` · **세액영향** 표시only — 최종 세액은 서버 판정(사업용)을 따르므로 금액 차이는 실증되지 않았다. · **안전망** 없음 — __tests__/lib/calc/nbl-exemption-jibok-validation.test.ts는 `nblExempt*` 토글 경로만 다루고 `transferCause` 단독 경로를 다루지 않는다.

**결함**  서버 매퍼는 「양도원인=공익수용」만으로도 §168의14③3호 의제 판정을 트리거하도록 명시적으로 설계돼 있는데, 같은 판정을 화면·⑧에 공급하는 클라이언트 어댑터는 nblExempt* 토글 8개만 보고 조기 반환하므로 그 경로에서 두 판정이 어긋난다.

**재현**  정밀판정 ON · 지목 farmland · 양도원인=공익수용 · 사업인정고시일 2015-01-01 · 취득일 2008-01-01(고시일 5년 이전)인 자산에서, 서버는 `unconditionalExemption.isPublicExpropriation=true` + `publicNoticeDate`(expropriationNoticeDate fallback, form-mapper-helpers.ts:128)로 §168의14③3호나목 의제를 성립시켜 사업용으로 판정하는데, 화면의 무조건의제 배너·뱃지와 ⑧은 `evaluateUnconditionalExemption`이 `isExempt=false`를 돌려주므로 「의제 미성립」으로 표시하고 기간기준 상세 입력을 계속 요구한다. 세액은 엔진 판정을 따르므로 금액은 틀리지 않고, 표시와 요구 입력만 어긋난다.

**법령**  「소득세법」 제104조의3 제1항 제4호(KoreanLaw MST 280405 본문 조회) 및 그 위임인 「소득세법 시행령」 제168조의14 제3항 제3호 — 협의매수·수용 토지의 무조건 사업용 의제. 서버 엔진의 요건 구현은 lib/tax-engine/non-business-land/unconditional-exemption.ts:88-111(고시일 2006.12.31 이전 = 가목 / 취득일이 고시일 5년 이전 = 나목). 시행령 §168의14③3호 본문은 이번 리뷰에서 별도 조회하지 않았다.

**처방**  `evaluateUnconditionalExemption`의 조기 반환 조건에 `asset.transferCause === "public_expropriation"`를 더해 서버 `buildUnconditionalExemption`의 `has` 게이트와 같은 집합을 보게 한다(또는 그 게이트 판정을 매퍼 헬퍼에서 export해 양쪽이 한 술어를 쓰게 한다).

### A1-04 🟡 `dead-code` — NBL raw 스키마에 선언된 §164⑨ 8개 필드는 이 페이로드에 실리지도, 매퍼가 읽지도 않는 사문(死文)이며 주석이 다른 스키마의 배선을 설명한다

**위치** `lib/api/transfer-tax-schema-nbl.ts:75` · **세액영향** 표시only — 세액 영향 0(값이 이 페이로드에 실리지 않음을 빌더 코드로 확인). · **안전망** 없음 — __tests__/tax-engine/non-business-land/factory-land-plumbing.anchor.test.ts는 `nonBusinessLandRawSchema.shape`에서 `nblFactory*`·`Factory` 키만 대조하고 이 8개 필드는 다루지 않는다.

**결함**  사실관계는 전부 맞다. 다만 성격을 정정한다 — 「기능이 침묵 무효화된 dead code」가 아니라 「사용되지 않는 선언 + 다른 파일의 배선을 설명하는 부정확한 주석」이다. §164⑨ 특례 자체는 정본 경로(transfer-tax-schema.ts:117-126 대표자산 · transfer-tax-schema-sub.ts:429-438 컴패니언)로 정상 동작하며 세액 영향은 0이다. 실질 위험은 유지보수 오독 1건뿐이다.

**재현**  현재는 세액 영향 0이다(값이 실리지 않으므로 항상 undefined, 엔진 동작 불변). 위험은 유지보수 쪽이다 — §164⑨ 컴패니언 축을 손보는 사람이 이 파일의 주석을 읽고 「NBL raw가 그 필드를 나른다」고 믿으면, 실제 정본(transfer-tax-schema-sub.ts:429-438 / transfer-tax-api-helpers.ts:452-470)을 고치지 않은 채 여기만 고쳐 특례가 조용히 미발동한 채로 남는다.

**법령**  미확인 — 이 항목은 배선 문제이지 법 요건 판정이 아니다(참조 조문은 「소득세법 시행령」 제164조 제9항이나 본문 대조는 이 리뷰에서 하지 않았다).

**처방**  8개 필드를 `nonBusinessLandRawSchema`에서 제거하거나, 남긴다면 주석을 「이 스키마에서는 사용하지 않음 — 정본은 transfer-tax-schema-sub.ts 컴패니언 자산 스키마」로 정정한다.

### A2-02 🟡 `numeric` — 수도권 여부 「미확인」(unknown) 선택이 ⑧ B6 차단을 우회해 §168의12 배율 3배(불리) 기본값이 조용히 적용된다

**위치** `lib/calc/transfer-tax-validate-nbl.ts:44` · **세액영향** 위 시나리오에서 비사업용 면적비율 0.5 → 0.7 (중과 적용 양도차익 40% 증가). 배율이 3배 vs 5배로 갈리는 「도시지역 주·상·공」 주택부수토지 전건에 해당. · **안전망** __tests__/lib/calc/nbl-housing-land-metropolitan-validate-b6.test.ts — B6-1~B6-8까지 `""`·`"yes"`·`"no"`만 다루고 `"unknown"` 케이스가 없다(파일 전체 grep 결과 `unknown` 0건). 즉 이 구멍을 고정하는 테스트도, 막는 테스트도 없다.

**결함**  ⑧ B6 게이트가 "unknown"에 뚫려 §168의12 배율이 불리한 3배로 결정되는 것은 사실이고 세액 영향(비사업용 면적비율 0.5→0.7)도 실측 재현된다. 다만 「조용히」는 입력 화면 한정이다 — 엔진 warning이 NonBusinessLandResultCard.tsx:267-278에 실제로 표시되어 계산 후에는 보수적 기본값 적용 사실이 사용자에게 고지된다. 결함의 본질은 「세액이 침묵으로 틀린다」가 아니라 「자동 fallback 금지·유리-default 정책을 위해 만든 ⑧ 차단을 UI가 제공한 세 번째 선택지가 무력화한다」는 정책 일관성 구멍이다.

**재현**  지목=주택부수토지, 용도지역=일반주거지역(도시 주·상·공), 토지면적 1,000㎡, 주택 정착면적 100㎡, 양도일 2024-05-01, 수도권 여부 = 「미확인」 선택. → ⑧ 통과(=차단 없음) → 매퍼 `isMetropolitanArea = undefined` → 엔진 `isMetropolitan = true` → 배율 3배 → 인정한도 300㎡ → 초과(비사업용) 700㎡, `nonBusinessAreaRatio = 0.7`. 실제가 수도권 밖이라면 §168의12 1호다목 5배 → 한도 500㎡ → 초과 500㎡, ratio 0.5. 즉 +10%p 중과가 걸리는 양도차익 비율이 0.5 → 0.7로 **40% 과다**하게 잡힌다(같은 입력에서 「비수도권」을 고르면 즉시 0.5로 바뀐다).

**법령**  「소득세법 시행령」 §168의12 (KoreanLaw MCP mst=286211, jo=제168조의12 조회 확인): 「1. … 도시지역 내의 토지: 가. …수도권 내의 토지 중 주거지역·상업지역 및 공업지역 내의 토지: 3배 / 나. 수도권 내의 토지 중 녹지지역 내의 토지: 5배 / 다. 수도권 밖의 토지: 5배 / 2. 그 밖의 토지: 10배」. 코드의 3/5/5/10 값은 법문과 일치한다 — 결함은 수치가 아니라 「수도권 여부 미확정 시 불리한 3배를 법 근거 없이 적용하면서 ⑧ 차단은 우회된다」는 점이다.

**처방**  ⑧ 조건을 `!asset.nblIsMetropolitanArea || asset.nblIsMetropolitanArea === "unknown"`로 넓히거나(=B6 원래 의도), 「미확인」 선택지를 도시 주·상·공 용도지역에서 숨긴다. 그대로 둘 거라면 UI에 「미확인 = 수도권(3배)으로 보수 적용」을 명시하는 배지를 띄워 표시↔판정 일관성을 확보해야 한다.

### A2-03 🟡 `ui-engine-drift` — 무조건 의제 UI 어댑터가 transferCause 축을 보지 않아 입력화면 판정과 엔진 판정이 갈린다

**위치** `lib/calc/nbl-unconditional-exemption-status.ts:173` · **세액영향** 표시only — 엔진 결과는 §168의14③3호에 부합해 옳다. 어긋나는 것은 입력화면의 배너·뱃지·지목 섹션 활성 상태와 ⑧의 불필요한 지목 강제. · **안전망** __tests__/lib/calc/nbl-exemption-jibok-validation.test.ts — 8토글 축만 다루고 `transferCause` 단독 축 케이스가 없다(파일 전체에 `transferCause` 0건). e2e/transfer-nbl-unconditional-exemption.spec.ts도 토글 축만 검증한다.

**결함**  `evaluateUnconditionalExemption`(배너·뱃지·⑧validate·④빌더 게이트가 공유하는 단일 어댑터)은 8개 `nblExempt*` 토글만 보는데, 엔진 매퍼 `buildUnconditionalExemption`은 `transferCause === "public_expropriation"`만으로도 §168의14③3호 판정을 켠다 — 두 층의 판정 기준이 다르다.

**재현**  토지 + ②양도정보 「공익수용」 선택(→ `transferCause="public_expropriation"`, 프리필로 `nblExemptPublicExpropriation=true`) 후 사용자가 NBL 무조건 의제 섹션에서 「공익수용」 토글만 다시 OFF, 고시일 2010-01-01(§77 카드에 입력), 취득일 2003-01-01, 지목·용도지역 입력 완료. → 입력화면: `anyToggleOn=false` ⇒ 확정 배너 없음 + 지목별 판정 섹션 활성(`NblSectionContainer.tsx:129-132`의 `exemptionStatus.isExempt ? "opacity-50 pointer-events-none"` 미적용) ⇒ 사용자는 재촌·자경 입력이 결과를 가른다고 믿는다. 반면 서버 매퍼는 `transferCause`로 의제를 켜고 취득일(2003-01-01) ≤ 고시일−5년(2005-01-01)이 성립해 §168의14③3호나목으로 **사업용 확정** — 지목별 입력 전부가 결과에 영향을 주지 않는다. 파생 효과로, 같은 상태에서 지목을 미선택하면 ⑧가 「지목을 선택하세요」로 차단하는데(어댑터가 isExempt=false를 주므로) 엔진은 지목 없이도 사업용으로 판정할 수 있는 상태다 — 불필요한 입력 강제.

**법령**  「소득세법 시행령」 §168의14③ 본문(KoreanLaw MCP mst=286211 확인): 「… 다음 각 호의 어느 하나에 해당하는 토지는 비사업용 토지로 보지 아니한다」 — 강행규정이므로 요건이 갖춰지면 사용자가 토글을 꺼도 적용되는 것이 맞다. 즉 **엔진 쪽이 법령에 부합**하고, 어긋난 것은 입력화면의 판정 표시다.

**처방**  `evaluateUnconditionalExemption`의 `anyToggleOn` 판정에 `asset.transferCause === "public_expropriation"`을 더해 엔진 매퍼(`form-mapper-helpers.ts:103`)와 같은 술어를 쓰게 한다(단일 소스 — 술어 자체를 엔진 헬퍼로 뽑아 양쪽이 import).

### A3-03 🟡 `ui-engine-drift` — 무조건 의제 게이트가 4개 지점에서 동일 기준이 아니다 — transferCause=public_expropriation 단독은 서버만 인정한다

**위치** `lib/calc/nbl-unconditional-exemption-status.ts:173` · **세액영향** 표시only — 방향이 「어댑터가 더 엄격」이라 세액은 어긋나지 않는다(⑧이 먼저 차단하므로 지목 미입력 페이로드가 나가지 않는다). 다만 A3-01로 ⑧이 죽는 carryover_gift 경로에서는 ④의 `undefined` 반환이 그대로 살아 NBL 정밀판정이 통째로 사라진다. · **안전망** 없음 — __tests__/lib/calc/nbl-unconditional-exemption-status.test.ts에 `transferCause` 언급 0건(grep). __tests__/lib/calc/nbl-exemption-jibok-validation.test.ts도 `nblExemptPublicExpropriation` 토글 경로만 다룬다.

**결함**  어댑터는 `TOGGLE_DEFS`(nblExempt* 8토글) 중 하나라도 ON이어야 판정을 시작하고 아니면 즉시 `isExempt:false`를 반환한다. 서버 매퍼가 쓰는 `buildUnconditionalExemption`은 여기에 더해 `transferCause === "public_expropriation"` 단독도 의제 트리거로 인정한다. 그래서 양도원인만 공익수용으로 고른 사용자는 엔진이 사업용으로 확정하는데도 UI 의제 배너·뱃지를 못 보고, ⑧·④가 지목·용도지역·기간기준 입력을 계속 요구한다.

**재현**  토지 자산, 양도원인=공익수용, 사업인정고시일 2005-06-01, 무조건 의제 토글은 하나도 켜지 않음, 「판정 도움 필요」 ON, 지목 미선택.
→ 어댑터 `isExempt=false`(실측) ⇒ UI 의제 배너·뱃지 미표시(NblSectionContainer.tsx:120-130), ⑧이 「비사업용 토지 정밀판정을 선택했습니다. 지목을 선택하세요.」로 차단(transfer-tax-validate-nbl.ts:28-29), ④는 `undefined` 반환.
→ 반면 지목·용도지역을 채워 전송하면 서버는 같은 입력으로 `unconditional_exemption:PASS`를 내고 사업용으로 확정한다(실측). 즉 이미 의제로 확정될 토지에 대해 지목·용도지역·기간기준 상세 입력을 계속 요구한다.

**법령**  소득세법 시행령 §168의14③3호가목 — KoreanLaw MCP get_law_text(mst=286211, jo=제168조의14): 「3. 「공익사업을 위한 토지 등의 취득 및 보상에 관한 법률」 및 그 밖의 법률에 따라 협의매수 또는 수용되는 토지로서 … 가. 사업인정고시일이 2006년 12월 31일 이전인 토지」. 고시일 2005-06-01은 요건 충족이므로 엔진 판정이 법령에 맞고, 어댑터가 그 사실을 반영하지 못하는 쪽이 드리프트다.

**처방**  `evaluateUnconditionalExemption`의 `anyToggleOn` 게이트에 `asset.transferCause === "public_expropriation"`를 더해 `buildUnconditionalExemption`의 `has` 조건과 같은 술어로 만든다(또는 그 `has` 판정을 export해 어댑터가 재사용한다 — 단일 소스).

### U1-05 🟡 `ui-engine-drift` — 목장용지 안내문이 존재하지 않는 「기준면적」 직접입력 필드를 지칭한다

**위치** `components/calc/transfer/nbl/PastureDetailSection.tsx:85` · **세액영향** 표시only — 엔진 산식에 영향 없음. · **안전망** 없음 — PastureDetailSection을 렌더하는 vitest·e2e 스펙이 전수 grep에서 0건. 참고로 `standardArea` 직접입력 위젯 부재 자체는 docs/00-pm/nbl-gaps/gap-3c.plan.md:9·51·64·69에 (E-3) 후속 과제로 **이미 deferred 기록**되어 있으므로, 본 발견은 「미구현 필드」가 아니

**결함**  보유시설 선택 안내가 「위 「기준면적」을 직접 입력하면 이 선택은 쓰이지 않습니다」라고 하지만, PastureDetailSection에도 AssetForm에도 기준면적 직접입력 필드가 존재하지 않아 사용자가 찾을 수 없는 필드를 안내한다.

**재현**  목장용지 선택 → 「보유 시설」 카드에서 안내문을 읽은 사용자가 자동산출을 우회하려고 화면 위쪽에서 「기준면적」 입력란을 찾지만 존재하지 않는다. 결과적으로 축종·두수 기반 자동산출값(pasture.ts:144-159)을 override할 수단이 없고, 화면 안내가 사실과 다르다.

**법령**  소득세법 시행령 §168의10③ 및 별표 1의3(가축별 기준면적). 이번 세션에서 §168의10 본문은 직접 조회하지 않았다 — 「법령 본문 미확인」. 다만 이 발견은 조문 수치 대조가 아니라 UI 안내문과 실재 필드의 불일치에 관한 것이다.

**처방**  (E-3)이 착수되기 전까지는 안내문에서 「위 「기준면적」을 직접 입력하면 이 선택은 쓰이지 않습니다」 문장을 제거하거나 「기준면적은 축종·두수·보유시설로 자동 산출됩니다」로 교체.

### U2-02 🟡 `ui-engine-drift` — 휴양시설(6호) 「기준면적 직접입력」 게이트가 건축물 바닥면적을 빠뜨려, 입력해도 무시되는 칸을 계속 보여준다

**위치** `components/calc/transfer/nbl/OtherLandDetailSection.tsx:304` · **세액영향** 3,000㎡ 사례에서 비사업용 면적 0㎡ → 1,500㎡(비율 0 → 0.5). 해당 면적분에 +10%p 중과·장특공제 배제. · **안전망** 없음 — __tests__/lib/calc/nbl-other-land-section-render.test.tsx:99 은 resort 선택 시 3요소 입력이 노출되는지만 보고, 바닥면적만 입력했을 때 직접입력 칸이 남는지·그 값이 소비되는지는 검증하지 않는다. __tests__/tax-engine/non-business-land/other-land-area

**결함**  resort(6호)에서 「기준면적 직접입력」 칸의 노출 조건(:304)이 `nblOtherResortBuildingFloorArea`를 빠뜨려, **용도지역이 「지방세법 시행령」 §101② 표에 매핑되는 경우**(전용·일반·준주거·상업·공업·녹지·미계획·도시지역 외 — 사실상 `residential` 외 전부) 바닥면적만 입력해도 칸이 계속 노출되고 그 입력값은 엔진이 무시한다. 미매핑 용도지역에서는 fallback이 실제로 동작하므로 노출이 옳다. validate(:28)는 floorArea를 3요소에 포함해 UI 게이트와 반대로 판정한다(UI↔validate 비대칭). 엔진 산출값 자체는 §83의4⑫에 부합하므로 **잘못된 세액이 나오는 결함은 아니고**, 입력이 조용히 무시되는 표시·배관 불일치다.

**재현**  기타토지 3,000㎡·상업지역(§101② 배율 3배)·6호 휴양시설에서 「건축물 바닥면적 500㎡」만 입력하면 UI는 여전히 「기준면적 직접입력」 칸을 띄운다. 사용자가 그 칸에 5,000㎡를 입력하면 엔진 실측(probe)은 `기준면적 초과 — 초과분 1500㎡ 비사업용 / nonBusinessRatio 0.5`, 반대로 바닥면적을 지우고 직접입력 5,000만 남기면 `isBusiness true(전량 사업용)`. 즉 화면에 보이는 5,000㎡ 입력이 반영되지 않아 3,000㎡ 중 1,500㎡가 비사업용(+10%p 중과)으로 판정된다.

**법령**  소득세법 시행규칙 §83의4⑫(KoreanLaw get_law_text mst=286379 본문 확인) — 6호 기준면적 = 1호 옥외 동물방목장·식물원 면적 + 2호 부설주차장 설치기준면적의 2배 이내 + 3호 건축물 바닥면적 × 「지방세법 시행령」 §101② 용도지역별 배율의 합. 엔진 산식은 법문과 일치하며, 결함은 UI 게이트 쪽이다.

**처방**  게이트 조건에 `asset.nblOtherResortBuildingFloorArea`를 추가해 validate(:28)와 동일한 4요소 판정으로 맞추고, 직접입력 칸이 보일 때는 3요소 값이 우선함을 hint로 명시한다(또는 반대로 직접입력이 있으면 3요소 칸을 숨겨 우선순위를 UI에서 드러낸다).

### U2-03 🟡 `ui-engine-drift` — 수입금액 연환산 미리보기가 간주임대료(③1호)·공통수입 안분(③2호)을 빼고 계산해 엔진값과 다른 「연간환산 수입금액」을 표시한다

**위치** `components/calc/transfer/nbl/OtherLandDetailSection.tsx:165` · **세액영향** 표시only — 판정·세액은 엔진값(131,000,000원)으로 정확히 계산된다. 표시 오차는 예시에서 31,000,000원(간주임대료 전액). · **안전망** 없음 — __tests__/tax-engine/non-business-land/revenue-test.test.ts:240-312 이 엔진의 간주임대료·공통수입 합산 후 환산을 고정하지만, UI 미리보기(OtherLandDetailSection의 revenuePreview)를 검증하는 테스트는 __tests__/lib/calc/nbl-other-land-s

**결함**  미리보기는 엔진 헬퍼(computeRevenueTest)를 쓰지만 인자로 당해 수입금액·토지가액만 넘기고 보증금·임대일수·공통수입을 넘기지 않아, 화면의 「연간환산 수입금액」이 실제 판정에 쓰이는 연간수입금액보다 작게 표시된다.

**재현**  주차장운영업·양도일 2024-07-01·취득 2014년(영위 183일)·당해 수입금액 50,000,000원·보증금 1,000,000,000원·임대일수 183일(정기예금이자율 3.1%) 입력 시, 화면은 「연간환산 수입금액 = 100,000,000원」을 표시하지만 엔진이 실제로 쓰는 값은 131,000,000원이다(computeRevenueTest probe 실측: UI 인자 조합 100,000,000 vs 전체 인자 조합 131,000,000). 사용자가 미리보기 숫자로 3% 기준 충족 여부를 가늠하면 판정 결과와 어긋난다.

**법령**  소득세법 시행령 §168의11③(KoreanLaw get_law_text mst=286211 본문 확인) — 1호 전세금·보증금은 「부가가치세법 시행령」 §65① 산식을 준용해 수입금액에 합산, 2호 공통수입은 토지가액 비율로 안분 합산, 3호 1과세기간 미만 영위 시 그 합계를 1년으로 환산. 즉 「연간수입금액」은 1·2호를 더한 뒤 환산한 값이다.

**처방**  미리보기 호출에 보증금·임대일수·간주임대료율(resolveDeemedRentRate)·공통수입 인자를 함께 넘겨 엔진과 동일 입력으로 계산하거나, 라벨을 「직접 수입금액의 연환산액(간주임대료·공통수입 제외)」로 정정한다.

### U2-04 🟡 `dead-code` — 연접 다필지(§168의11⑤) 입력은 호를 선택하지 않으면 엔진이 통째로 무시하는데 UI는 항상 노출하고 validate는 입력을 강제한다

**위치** `components/calc/transfer/nbl/OtherLandParcelSection.tsx:54` · **세액영향** 표시only(세액 무영향) — 다만 입력 강제로 계산 자체가 막히거나, 반영되지 않은 안분을 반영된 것으로 오인하게 한다. · **안전망** 없음(이 조합 한정) — __tests__/lib/calc/nbl-detailed-cases.test.ts:125-148 의 ⑤ 결선 테스트는 `nblOtherRelatedBusinessType: "parking_attached"` + `nblOtherStandardAreaLimit: "1000"`을 함께 넣어 기준면적이 있는 경우만 고정한다. __test

**결함**  ⑤ 필지 입력은 §168의11① 호별 기준면적(areaLimit)이 산출될 때만 소비되는데, UI는 `nblOtherRelatedBusinessType`과 무관하게 섹션을 노출하고 validate는 토글 ON 시 모든 필지의 면적·취득일·바닥면적을 필수로 막는다 — 호가 「해당 없음」·「기타(14호)」면 그 입력은 계산에 전혀 도달하지 않는다.

**재현**  기타토지에서 호를 「해당 없음」으로 둔 채 「연접 다필지로 입력」을 켜면, 필지 2건의 면적·취득일을 모두 채워야 계산 버튼을 통과할 수 있고(validate 차단 메시지 `연접 다필지 — 필지 1의 면적(㎡)을 입력하세요`), 통과 후 엔진은 그 입력을 한 번도 읽지 않는다(위 probe — areaProportioning undefined). 사용자는 필지별 안분이 반영됐다고 오인한다.

**법령**  소득세법 시행령 §168의11⑤(KoreanLaw get_law_text mst=286211 본문 확인) — "…그 총면적이 비사업용 토지 해당여부의 판정기준이 되는 면적(기준면적)을 초과하는 경우"를 전제로 하므로 기준면적이 없는 호(14호 등)에서 ⑤ 안분이 없는 것 자체는 법문에 부합한다. 결함은 그런 상태에서도 UI가 입력을 받고 validate가 이를 강제한다는 점이다.

**처방**  ⑤ 섹션을 기준면적이 산출되는 호(면적기준 있는 호)에서만 노출하거나, 호가 「해당 없음」·「기타(14호)」일 때 "이 호는 기준면적이 없어 ⑤ 안분이 적용되지 않습니다"를 표시하고 validate의 필지 필수 검사도 같은 조건으로 좁힌다(UI 통과 ↔ validate 차단 대칭 유지).

### U3-03 🟡 `ui-engine-drift` — NBL 판정 결과의 `longTermDeductionExcluded`(= 장특공 배제)와 결과 카드의 「장기보유특별공제 표1 적용」이 정반대다

**위치** `lib/tax-engine/non-business-land/engine.ts:281` · **세액영향** 표시only(현재) — 소비처 0. 잠재적으로는 장특공 표1(최대 30%) 전액 누락 위험 · **안전망** __tests__/tax-engine/non-business-land/qa-integration.test.ts:192-211 (QA-080 `expect(r.surcharge.longTermDeductionExcluded).toBe(true)`) · __tests__/tax-engine/non-business-land/engine.test.ts:88 — 현

**결함**  「정반대다·잠재적으로 장특공 30% 누락」이라는 프레이밍은 과하다. 정확히는: 이 필드는 **읽는 코드가 하나도 없는 죽은 echo 필드**이고, 값의 의미(비사업용 = 장특공 배제)는 2015.12.31. 이전 양도분 구법에는 맞지만 현행 §95②에는 맞지 않는다. 현재 어떤 입력으로도 세액·표시가 달라지지 않으므로 활성 결함이 아니라 **오독 위험이 있는 레거시 잔재**다. 테스트(QA-080·engine.test.ts:88)가 이 값을 의도적으로 고정하고 있어 설계 결정일 가능성도 있다.

**재현**  엔진 result를 소비하는 새 표시/계산 코드가 이 필드를 신뢰하면(예: 신고서 장특공 행을 `longTermDeductionExcluded`로 게이팅) 비사업용 토지의 장특공 표1(보유 15년 이상 30%)이 통째로 사라져 과세표준이 과대 산출된다. 현재는 소비처가 0이라 세액 영향은 없다.

**법령**  「소득세법」 §95② 본문 확인(KoreanLaw MST 280405): 장특공 대상에서 제외되는 것은 "제104조제3항에 따른 미등기양도자산과 같은 조 제7항 각 호에 따른 자산"뿐이다. 비사업용 토지는 §104①8호 자산이므로 §95② 표1이 적용된다 ⇒ 「배제」는 현행법과 어긋난다.

**처방**  필드를 제거하거나 값을 `false`로 정정하고(§95②에 비사업용 토지 배제 없음) 그에 맞춰 anchor를 갱신한다. 유지한다면 「2015.12.31. 이전 양도분 레거시」임을 이름·주석에 명시해 현행 판정으로 오독되지 않게 한다.

### U3-05 🟡 `legal-accuracy` — 무조건 사업용 의제 legalBasis 7종이 법령명 없이 「시행령 §168조의14 ③ …」로만 표기되어 결과 카드 칩·단계 배지에 그대로 노출된다

**위치** `lib/tax-engine/non-business-land/unconditional-exemption.ts:55` · **세액영향** 표시only — 판정·세액 무영향 · **안전망** 없음(`grep "시행령 §168조의14" __tests__/` → 이 문자열을 고정하는 테스트 0건)

**결함**  「legal-accuracy(법령 정확성)」로 분류하기보다 **인용 표기 규칙 위반**으로 좁히는 것이 정확하다 — 조문 번호·항·호는 법문과 일치하며 요건·기준·기간의 실질 오류는 없다. 사용자에게 보이는 칩에서 법령이 특정되지 않는다는 표시 결함이다.

**재현**  지목=농지, 상속일 2006-05-01, 양도일 2009-06-01로 「2006.12.31. 이전 상속」 의제가 성립하면 결과 카드 ⑦ 적용 법령에 「시행령 §168조의14 ③ 1호」 칩이 뜬다. 사용자는 이것이 「소득세법 시행령」인지 「지방세법 시행령」인지 화면만으로 알 수 없고, 같은 카드의 다른 칩(「소득세법 시행령 §168조의6」)과 표기 체계가 어긋난다.

**법령**  KoreanLaw MST 286211 「소득세법 시행령」 §168의14③ 본문 확인 — 1호·1의2호·2호·3호 가·나목·4호 가·나목·5호 구성이 코드 인용과 일치한다(조문 번호 자체는 정확). 문제는 법령명·법/령/규칙 구분 누락이며, 저장소 확립 규칙(커밋 7f44d95a 「조문 인용에 법령명·법/령/규칙을 명시」)과 어긋난다.

**처방**  7개 문자열을 「소득세법 시행령」 §168의14③N호 형태로 통일하고(§168-8 하이픈도 §168의8로), 가능하면 `lib/tax-engine/legal-codes/`의 NBL 상수로 이관해 문자열 리터럴 중복을 없앤다.

### U3-06 🟡 `ui-engine-drift` — 결과 카드 금액 표시에 「원」 접미사가 붙어 있다 — 결과 화면 「원」 미표기 정책 위반

**위치** `components/calc/NonBusinessLandResultCard.tsx:108` · **세액영향** 표시only · **안전망** 없음(nbl-result-card-render.test.tsx는 「원」 표기를 단언하지 않는다)

**결함**  사실은 전부 확인됐으나, 이 항목은 이번 리뷰의 보고 대상 6범주(법령 정확성·numeric 결함·배관 결함·UI↔엔진 드리프트·정수연산·실질적 dead code) 어디에도 들어가지 않는 **표시 관례 위반**이다. 판정·세액·배관에 영향이 없으므로 다른 발견과 같은 층위로 다루면 안 된다.

**재현**  기타토지 + 수입금액비율 업종(예: 주차장운영업)에 전세보증금·공통수입을 입력하면 카드에 「당해 간주임대료 1,234,567원」처럼 표기되어, 같은 화면의 다른 결과 카드(숫자만 표기)와 표기 체계가 어긋난다.

**법령**  해당 없음(표시 정책)

**처방**  6곳의 `원` 접미사를 제거하고, 필요하면 좌측 라벨을 「당해 간주임대료 (원)」으로 바꾼다.


---

## 부록 B — 2차 확정 42건

### V2-b 🔴 `plumbing` — `mapBusinessUsePeriods`의 날짜 빈 행 침묵 drop이 목장 축산기간·별장 사용기간에도 적용되고, 공용 UI가 빈 행을 만드는 정상 경로이며, ⑧ 검증이 0건이다

**위치** `lib/tax-engine/non-business-land/form-mapper-helpers.ts:78` · **세액영향** 단일 시나리오(양도가 10억·취득가 3억·2014-01-01 취득·2024-01-01 양도·mock 세율) 기준 **±57,150,000원**. 목장 축산기간 drop은 +57,150,000원(과대·납세자 불리), 별장 사용기간 drop은 −57,150,000원(과소). 두 방향 모두 실측했다. 일반화하면 §104①8호 +10%p × 과세표준 + §95② 장특공제 배제분의 세율 효과.

**결함**  핵심 주장 3요소 모두 성립하고, 판정 반전을 목장·별장 각각 실측했다.

(1) **적용 범위** — `mapBusinessUsePeriods`(form-mapper-helpers.ts:78-90)의 `.filter((p) => p.startDate && p.endDate)`는 호출부 3곳에 걸린다: `form-mapper.ts:90-93`(`nblBusinessUsePeriods`, 농지 자경), `form-mapper-helpers.ts:186`(`nblPastureLivestockPeriods`, 목장 축산기간), `form-mapper-helpers.ts:200`(`nblVillaUsePeriods`, 별장 사용기간). grep 전수로 이 3곳이 전부다.

(2) **빈 행은 정상 UI 경로** — 세 배열 모두 공용 `components/calc/transfer/nbl/shared/BusinessUsePeriodsInput.tsx:17-19`을 쓰고, 그 `addPeriod()`가 `{ startDate: "", endDate: "", usageType: "자경" }`를 추가한다. 배선: `FarmlandDetailSection.tsx:40-41` → `nblBusinessUsePeriods`, `PastureDetailSection.tsx:128-129` → `nblPastureLivestockPeriods`, `VillaLandDetailSection.tsx:32-33` → `nblVillaUsePeriods`.

(3) **⑧ 검증 0건** — `grep -rn "UsePeriods|LivestockPeriods" lib/calc/` = **0**. `transfer-tax-validate-nbl.ts`(92줄) 어디에도 이 3배열 검사가 없다. 반면 **같은 파일 :77-90의 `nblGracePeriods`는 정확히 이 검증을 갖고 있다** — 「§168의14①·§83의5① 유예기간 — 사유별 필수 기산일/종료일 (**자동 안분 fallback 금지**)」 주석과 함께 `if (!g.anchorDate) return … 개시일을 입력하세요.` / `if (!g.endDate) return … 종료일을 입력하세요.`. 즉 sibling 배열은 이미 저장소 정책대로 차단하고 있고 이 3배열만 예외다(feedback_sibling_path_already_implements_rule 패턴).

**원 메모의 수치 정정**: 「4개 배열」이 아니라 `mapBusinessUsePeriods` 기준으로는 **3개**다(메모 본문도 「세 배열의 UI는 모두 공용」이라고 스스로 3으로 적어 자기모순). 다만 form-mapper.ts:113-118의 `nblResidenceHistories` 매핑이 `if (!s || !e) return []`로 **같은 형태의 침묵 drop**을 하고, `ResidenceHistorySection.tsx:29-36`의 `addHistory()`가 역시 전 필드 빈 행을 추가하며, `lib/calc/`에 검증이 없다 ⇒ 「4번째」로 셀 만한 배열이 실재하지만 함수는 다르다.

**인용 정정**: 메모의 `form-mapper.ts:186`·`:200`은 실제로는 **`form-mapper-helpers.ts`:186·:200**이다(내용은 정확히 일치).

**실측**  세 probe 모두 `npx tsx`로 워크트리 루트에서 실행. `mapAssetToNblInput` → `judgeNonBusinessLand` / `calculateTransferTax`(makeMockRates·baseTransferInput) 실호출.

**목장 — 판정 반전** (`v2probe2.ts`, 취득 2010-01-01·양도 2024-01-01·면적 1,000㎡·agriculture_forest·`nblPastureIsLivestockOperator=true`):
```
A) 두 행 완전 (2010~2015, 2015~2024)      isNBL=false | 도시지역 밖 + 축산업 영위 + 기준면적 이내 | livestock=2
B) 둘째 행 종료일 공란 → drop             isNBL=true  | 축산업 미영위 + 사용의제 미해당 → 비사업용 | livestock=1
C) 모든 행 공란 (전량 drop)               isNBL=false | (isLivestockOperator fallback 복구) | livestock=0
```
C가 보여주듯 **전량 drop은 fallback이 구제하고 부분 drop만 터진다** — 오판을 알아채기 더 어려운 형태다.

**목장 — 세액** (`v2probe4.ts`, 양도가 10억·취득가 3억·취득 2014-01-01·양도 2024-01-01, mock 세율):
```
A) 두 행 완전            calculatedTax=204,090,000  surchargeType=undefined
B) 둘째 행 종료일 공란   calculatedTax=261,240,000  surchargeType=non_business_land
차액(B-A) = +57,150,000원  (납세자 불리)
```

**별장 — 판정·세액 반전 (반대 방향)** (`v2probe3.ts`/`v2probe7.ts`, 동일 조건 + `nblHousingFootprint=200`·`nblVill

**법령**  법령 해석 쟁점이 아니라 배관·검증 결함이지만, 반전이 법령 요건에 직결됨을 본문으로 확인했다.

「소득세법」 §104의3①3호 (MST 280405 직접 조회): 가목 「**축산업을 경영하는 자가** 소유하는 목장용지」 / 나목 「**축산업을 경영하지 아니하는 자가** 소유하는 토지」 — 즉 축산 영위기간의 길이가 3호 가/나목 갈림을 직접 결정한다. 그 기간이 §104의3① 각 목 외 부분의 「소유하는 기간 중 대통령령으로 정하는 기간」(시행령 §168의6 기간기준)에 투입되므로, 축산기간 행 1개가 조용히 사라지면 곧바로 나목(비사업용) 판정이 된다 — probe B가 낸 「축산업 미영위 + 사용의제 미해당 → 비사업용」이 그것이다.

같은 항 6호(별장 부수토지) 역시 「상시주거용으로 사용하지 아니하고 휴양·피서·위락 등의 용도로 사용하는 건축물…의 부속토지」로 **사용 실태 기간**이 요건이며, 시행령 §168의13이 읍·면 농어촌주택 예외를 둔다. 별장 사용기간 행의 침묵 drop은 이 사실관계를 임의로 축소한다.

중과 효과: §104①8호 기본세율 +10%p, §95② 장기보유특별공제 배제 — probe에서 `surchargeType=non_business_land`·`additionalRate=0.1`·`longTermDeductionExcluded=true`로 관측됨.

저장소 정책과의 충돌도 명문이다 — CLAUDE.md 「자동 안분 fallback 금지. 미입력은 검증 오류로 차단한다」, 그리고 `transfer-tax-validate-nbl.ts:76`이 유예기간에 대해 같은 문구(「자

**도달성**  **끝까지 열려 있다.**
- ⑤ UI: `BusinessUsePeriodsInput`의 「+ 기간 추가」가 빈 행을 만들고, 시작일만 채우고 종료일을 비운 채 다음 단계로 진행하는 것을 막는 것이 없다(컴포넌트 내부에 필수 표시·차단 없음).
- ⑧ validate: `lib/calc/` 전수 grep 0건 — 차단 없음.
- ⑫ Zod: `lib/api/transfer-tax-schema-nbl.ts:8-14` `nblPeriodRawSchema`는 `startDate: z.string()` / `endDate: z.string()`로 **빈 문자열을 통과시킨다**(`.min(1)` 없음). :125 `nblPastureLivestockPeriods`, :131 `nblVillaUsePeriods`, :238 `nblBusinessUsePeriods` 모두 이 스키마.
- ④ 페이로드: `lib/calc/non-business-land-request.ts:66-68`이 `nbl` prefix 필드를 전량 pick하므로 빈 행이 그대로 서버에 실린다.
- ⑭ 서버: `buildNblEngineInput` → `mapAssetToNblInput` → 여기서 

**처방**  ⑧에 sibling(`nblGracePeriods`, `transfer-tax-validate-nbl.ts:77-90`)과 **동일 형태**의 행 단위 필수 검증을 추가하는 것이 최소·단일 지점 수정이다 — `transfer-tax-validate-nbl.ts`에서 지목별로 `nblBusinessUsePeriods`(농지)·`nblPastureLivestockPeriods`(목장)·`nblVillaUsePeriods`(별장)를 순회해 `startDate`/`endDate` 공란이면 「… 기간 N행 — 시작일/종료일을 입력하세요.」로 차단. 매퍼의 `.filter`는 그대로 두어도 되지만(방어), 차단이 생기면 실질적으로 도달하지 않는다.

권장하지 않는 대안: 매퍼에서 종료일 공란을 양도일로 자동 보정 — 「자동 안분 fallback 금지」 정책 정면 위반이며 목장은 유리·별장은 불리 방향으로 서로 다르게 튄다.

anchor 작성 시 주의: 세액 대조 케이스의 취득일을 **2013-01-01 이후**로 둘 것(2009.3.16.~2012.12.31. 취득분 중과 한시배제 구간에서는 fix 전후 세액이 모두 같아 안전망이 조용히 무의미해진다 — `v2probe6.ts`로 실측).

### V3-c 🔴 `legal-accuracy` — E2-02(양도세 NBL 재촌이 같은 시 안 다른 일반구를 탈락시킴)의 법령 근거 독립 재확인

**위치** `lib/tax-engine/non-business-land/residence.ts:53` · **세액영향** 세액 영향 있음(방향: 납세자 불리). 재촌 기간 0 → §104의3①1호가목 비사업용 판정 → §104①8호 +10%p 중과 + §95② 장특공제 배제. 구체 금액은 본 검증에서 end-to-end로 재현하지 않았다 — 재현한 것은 판정 입력인 재촌 기간이 []로 떨어지는 지점까지다(docs/reviews/transfer-tax-code-review-2026-08.md:1852의 교훈대로 단일 금액 단정은 취득시기 의존이라 하지 않는다).

**결함**  1차 판정이 맞다. lib/tax-engine/non-business-land/residence.ts:50-56이 `history.sigunguCode === landLocation.sigunguCode` 단순 동일성으로 §153③1호를 구현하는데, 이 코드는 lib/korean-law/sigungu-codes.json(5자리계 256건)에서 오고 그 테이블은 일반구를 별개 entry로 담는다(41281 고양시 덕양구 · 41287 고양시 일산서구 · 48125 창원시 마산합포구 · 48129 창원시 진해구 …). §153③1호의 「구」는 「자치구인 구를 말한다」로 한정되므로 일반구는 「구」가 아니고 상위 「시」가 판정 단위다. 상속세 쪽(V3-b)과 달리 이쪽은 **세액에 직접 도달한다** — computeResidencePeriods 소비처가 lib/tax-engine/non-business-land/farmland.ts:119 와 forest.ts:88 의 사업용 기간 산정이다. 재촌 기간이 0이 되면 §104의3①1호가목 비사업용 토지로 판정되어 §104①8호 기본세율+10%p 중과 및 §95② 장기보유특별공제 배제로 이어진다. 1차 보고보다 범위를 넓혀 실측하면 비연접 일반구 쌍은 **5개 시 12쌍**이고, 그중 창원시는 좌표를 넣어도 30km를 넘어(42.56km) 3개 분기 전부 탈락한다 — 「좌표만 채우면 구제된다」는 완화 가정은 성립하지 않는다.

**실측**  npx tsx <scratchpad>/v3-probe.ts — landLocation={sigunguCode:'41287'}(고양 일산서구 농지), 주거이력 sigunguCode='41281'(덕양구, 2010-01-01~2024-01-01, 주민등록 O), adjacentCodes=lookupSigungu('41287').adjacentCodes=['41285','41480','41570'](덕양 41281 미포함):
  computeResidencePeriods → []  (재촌 기간 0)
  computeResidenceMatchSummary → undefined
  대조: 일산동구(41285) 거주 → [{start:2010-01-01, end:2024-01-01}] (연접으로 인정)
npx tsx <scratchpad>/v3-probe2.ts — 창원 마산합포구 진전면 농지(48125, 35.115/128.363) + 진해구 용원동 거주(48129, 35.092/128.830), 좌표까지 모두 주입: haversineKm=42.56km → computeResidencePeriods → []. 같은 창원시 안인데 same·adjacent·30km 셋 다 탈락.
전수 실측(node, lib/korean-law/sigungu-codes.json): 일반구 보유 시 13 · 구 쌍 45 · 비연접 12쌍 — 부천(소사↮오정), 고양(덕양↮일산서), 화성(만세↮병점·만세↮동탄·효행↮동탄), 청주(상당↮흥덕), 창원(의창↮마산합포·의창↮진해·성산↮마산합포·성산↮마산회원·마산합포↮진해·마산회원↮진해).

**법령**  KoreanLaw MCP get_law_text(mst=286211) 직접 조회 2건. ①「소득세법 시행령」 §168의8②: 「법 제104조의3제1항제1호가목 본문에서 "소유자가 농지소재지에 거주하지 아니하거나 자기가 경작하지 아니하는 농지"란 제153조제3항에 따른 농지소재지에 사실상 거주(이하 "재촌"이라 한다)하는 자가 「조세특례제한법 시행령」 제66조제13항에 따른 직접 경작(이하 "자경")을 하는 농지를 제외한 농지를 말한다」 — NBL 재촌이 §153③에 위임됨이 본문으로 확인된다. ②같은 영 §153③: 「…다음 각 호의 어느 하나에 해당하는 지역(경작개시 당시에는 당해 지역에 해당하였으나 행정구역의 개편 등으로 이에 해당하지 아니하게 된 지역을 포함한다)을 말한다. 1. 농지가 소재하는 시(특별자치시와 「제주특별자치도 설치 및 국제자유도시 조성을 위한 특별법」 제10조제2항에 따라 설치된 행정시를 포함한다. 이하 이 항에서 같다)ㆍ군ㆍ구(자치구인 구를 말한다. 이하 이 항에서 같다)안의 지역 2. 제1호의 지역과 연접한 시ㆍ군ㆍ구안의 지역 3. 농지로부터 직선거리 30킬로미터 이내에 있는 지역」. 임야는 §168의9②가 같은 정의에 주민등록 요건을 더한다(코드 requireResidentRegistration).

**도달성**  도달 가능. components/calc/transfer/nbl/shared/SigunguSelect.tsx:5·36-49가 lib/korean-law/sigungu-codes.ts searchSigungu로 목록을 띄우고 선택 코드를 그대로 저장한다 — 목록에 「경기도 고양시 덕양구」·「경상남도 창원시 진해구」가 개별 항목으로 존재하므로 사용자가 일반구를 고르는 것이 정상 경로다. 저장된 코드는 residence.ts로 그대로 흘러 farmland.ts:119 / forest.ts:88의 사업용 기간 산정에 쓰인다. 상류에 시 단위로 접는 정규화 지점은 없다(grep: 「자치구인 구」 0건, 코드 축 일반구 정규화 leaf 0건).

**처방**  V3-b와 **같은 leaf를 공유**해 고칠 것 — 코드 비교 전에 일반구를 상위 시로 접는다. 5자리계는 code[3:5]!=="00"이면 일반구(sigungu-codes.json 실측: 41111~41117 수원, 41281~41287 고양 …), 접은 뒤 시 단위 대표코드로 비교. 연접 매트릭스도 시 단위로 union해야 한다(현재 41287의 인접에 41281이 없는 것은 매트릭스가 구 단위여서다). residence.ts:64 주석의 미러 짝(farming-residence-check.ts)을 반드시 함께 고칠 것 — 한쪽만 고치면 두 세목이 갈린다.

### V7-b 🔴 `legal-accuracy` — judgePasture가 §104의3①3호 단서를 축산업 미영위 경로에서만 적용한다 — 축산 영위 중이면 상속 3년 이내·사회복지법인등 목장이 비사업용으로 떨어진다

**위치** `lib/tax-engine/non-business-land/pasture.ts:95` · **세액영향** 실측 2건. (1) 상속 3년 이내·15,000㎡·기준면적 7.5㎡ 초과·도시지역 밖: 총부담세액 282,711,000 → 359,259,532 (+76,548,532원, 세율 42% → 52%). (2) 사회복지법인등·19년 보유·동일 가액: 총부담세액 185,966,000 → 239,473,025 (+53,507,025원, 세율 40% → 50%). 도시지역 축(기준면적 이내)은 안분비율이 1이 되어 전량 중과되므로 영향이 더 크다.

**결함**  `judgePasture`는 §104의3①3호 단서 판정인 `isRelatedPasture`(pasture.ts:49-69)를 `if (!r1.meets)` 블록(pasture.ts:95-136) 안에서만 호출한다(:97). 따라서 축산업 영위 기간기준을 **충족한**(=r1.meets) 목장은 단서 판정을 통째로 건너뛰고 Step 3-2 기준면적(:138~)·Step 3-3 도시지역(:186~)·Step 3-3-1 편입유예(:203~)로 직행한다. 원 주장은 「기준면적 초과분이 안분된다」만 들었으나 실측 결과 **도시지역 축에서도 동일하게 터진다** — 기준면적 이내여도 도시지역 편입 3년 경과면 전량 비사업용이 된다(가목 후단). 즉 결함 반경은 원 보고보다 넓다. 종중(§168의10②2호)은 `checkUnconditionalExemption`의 레거시 종중 분기(unconditional-exemption.ts:154-165, isAgriLike에 pasture 포함)가 Step 2에서 선점해 가려져 있으나, **1호(상속 3년 이내)와 3호(사회복지법인등)는 무조건 의제에 대응 분기가 없어 그대로 노출된다**(unconditional-exemption.ts 전문 정독 — 해당 분기 0건). 결과는 「축산업을 영위하면 오히려 비사업용, 영위하지 않으면 사업용」이라는 역전이며, 방향은 납세자 불리·과세 과대다.

**실측**  npx tsx /private/tmp/.../scratchpad/v7probe.ts (judgeNonBusinessLand 직접 호출, 목장·landArea 15000㎡·zoneType agriculture_forest·acq 2021-06-01·transfer 2024-01-01·pasture.inheritanceDate 2021-06-01·livestockType hanwoo_breeding·livestockCount 1 → 기준면적 7.5㎡):
A 축산영위 O → isNonBusinessLand = true | ratio 0.9995 | steps: land_category:PASS unconditional_exemption:NOT_APPLICABLE pasture_livestock:PASS pasture_area:FAIL
B 축산영위 X (그 외 완전 동일) → isNonBusinessLand = false | steps: … pasture_livestock:FAIL pasture_related:PASS
C isSpecialOrgUse:true(상속일 없음) + 축산영위 O → isNonBusinessLand = true | ratio 0.9995

도시지역 축 분리 실측(npx tsx …/v7urban.ts — landArea 50㎡ ≤ 기준면적 75㎡(10두), zoneType commercial, urbanIncorporationDate 2010-01-01, inheritanceDate 2021-06-01):
축산영위 O → isNBL = true | steps: … pasture_livestock:PASS pasture_area:PASS pasture_urban_grace:FAIL
축산영위 X → isNBL = false | steps: … pasture_livestock:FAIL pasture_related:PASS

세액 실측(npx tsx …/v7tax.ts — calculateTransferTax + __tests__/tax-engine/

**법령**  「소득세법」 §104의3①3호 각 목 외의 부분 단서(V7-a에서 본문 확인) — 단서는 가목·나목 모두에서 제외한다. 「소득세법 시행령」 §168의10② 1호(상속 3년 미경과)·3호(사회복지법인등·학교등·종교제사단체·정당 직접 사용)가 그 「대통령령으로 정하는 것」이다. 따라서 이들에 해당하는 목장용지는 축산업 영위 여부·기준면적 초과 여부·도시지역 소재 여부와 무관하게 3호에서 제외되어 비사업용 토지가 아니다. 중과 근거는 「소득세법」 §104①8호(기본세율 +10%p).

**도달성**  전 경로 도달 가능(직접 추적·실측). ⑤ UI: components/calc/transfer/nbl/PastureDetailSection.tsx가 `nblPastureIsLivestockOperator`(:52) · `nblPastureLivestockType`(:58, 값 'hanwoo_breeding' 등) · `nblPastureLivestockCount`(:76) · `nblPastureInheritanceDate`(:113) · `nblPastureIsSpecialOrgUse`(:122)를 **상호 게이팅 없이 동시에** 노출한다. ①②③ store: lib/stores/calc-wizard-asset-factory.ts:286-294 · calc-wizard-asset-nbl.ts:300-308에 전 필드 초기값 존재. ④ raw: lib/calc/non-business-land-request.ts:64-66이 `nbl` prefix-pick으로 전건 운반. ⑨⑫ Zod: lib/api/transfer-tax-schema-nbl.ts:119-127에 9개 필드 모두 선언. ⑭ 매퍼: form-mapper-helpers.ts:172-190 `bui

**처방**  `isRelatedPasture(input)` 호출을 `if (!r1.meets)` 블록(pasture.ts:95) **밖·앞**으로 끌어올려 Step 3-1 직후 단독 게이트로 두고, 해당 시 기준면적·도시지역·편입유예를 모두 건너뛰고 사업용으로 확정한다(현재 `!r1.meets` 경로가 하는 `meetsPeriodCriteria(fullPeriod, …)` 확인은 r1.meets 케이스에서는 이미 충족되므로 그대로 재사용 가능). 단, V7-d 때문에 이 수정은 E5-04 처방보다 **먼저** 들어가야 한다. 회귀 안전망으로 「isLivestockOperator: true + inheritanceDate 3년 이내 + landArea > 기준면적 → isBusiness true」와 「isLivestockOperator: true + isSpecialOrgUse + zoneType commercial + 편입 3년 경과 → isBusiness true」 2건을 pasture.test.ts에 추가할 것.

### V9-a 🔴 `plumbing` — 「판정 도움 필요」(정밀판정) 모드가 raw 게이트에서 탈락하면 판정이 사라진 채 사용자 플래그로 +10%p가 붙는다 (조용한 모드 강등)

**위치** `lib/calc/non-business-land-request.ts:62` · **세액영향** 실측 과표 655,500,000원 기준 산출세액 304,920,000 vs 239,370,000 → **+65,550,000원 과대**(= 과표×10%p). 지방소득세 별도. 일반화하면 과표 × 10%p 전액.

**결함**  주장 그대로 성립한다. ④ `buildNonBusinessLandRaw`(lib/calc/non-business-land-request.ts:57-65, 조건 `(!isExempt && (!asset.nblLandType || !asset.nblZoneType))`은 :62)는 지목·용도지역이 비면 undefined를 반환하고, 그때 `nonBusinessLandRaw`가 body에서 빠진다. 반면 `isNonBusinessLand` 플래그는 lib/calc/transfer-tax-api.ts:501에서 assetKind==="land"이면 무조건 실린다. 서버는 `nonBusinessLandDetails: buildNblEngineInput(data.nonBusinessLandRaw)`(app/api/calc/transfer/engine-input.ts:185 · multi/route.ts:215)가 유일한 소스이고, 엔진은 `if (workingInput.nonBusinessLandDetails)`(lib/tax-engine/transfer-tax-judgment-steps.ts:89)일 때만 override하므로 raw가 없으면 사용자 플래그 true가 그대로 살아 §104①8호 +10%p가 붙고, 「비사업용 토지 판정 (엔진 재판정)」 step(:102-109)도 기록되지 않는다. 정밀판정 모드 플래그 `nblUseDetailedJudgment`는 `nonBusinessLandRawSchema` 안에만 있어(lib/api/transfer-tax-schema-nbl.ts:63) raw가 없으면 서버는 「이미 판정 완료」 모드와 구분할 수단 자체가 없다. 평소에는 ⑧ `validateNblDetailedJudgment`(transfer-tax-validate-asset.ts:352)가 「지목을 선택하세요」로 막지만, 그 호출은 carryover_gift 조기 return(:219→:307)·newConstruction 조기 return(:317→:345) 뒤에 있어 두 취득원인에서는 도달하지 않는다.

**실측**  npx tsx (worktree tsconfig) — /private/tmp/.../scratchpad/v9probe.ts · v9probe2.ts · v9probe3.ts.

[입력] assetKind=land, acquisitionCause=carryover_gift, transferCause=public_expropriation, expropriationNoticeDate=2019-01-01, carryover.donorAcquisitionDate=2008-01-01, acquisitionDate(증여일)=2020-06-01, acquisitionArea=1000, isNonBusinessLand=true, nblUseDetailedJudgment=true, nblLandType/nblZoneType 미입력, 양도일 2024-01-01.

[v9probe2 출력]
  [프리필 ON · 지목/용도지역 미입력]  validate=null | 클라 isExempt=false anyToggleOn=true | raw=undefined
  [프리필 ON · 지목/용도지역 입력]    validate=null | raw=defined | 엔진 isNonBusinessLand=false
  [프리필 ON · 일반취득(purchase)]    validate="자산1: 비사업용 토지 정밀판정을 선택했습니다. 지목을 선택하세요." ← 대조군: ⑧이 살아 있으면 막힌다

[v9probe 출력 — 엔진 실측 2건, calculateTransferTax + makeMockRates()]
  양도가 10억 / 취득가 3억 / 취득 2020-06-01 / 양도 2024-01-01 / 과표 655,500,000
  raw소실(플래그 그대로): calculatedTax=304,920,000  surchargeType=non_business_land  surchargeRate=0.1  재판정 step=[]
  raw정상(엔진 재판정)  : calculatedTax=239,370,000

**법령**  「소득세법」 §104①8호 — 「제104조의3에 따른 비사업용 토지」에 기본누진 각 구간 +10%p 표(16/25/34/45/48/50/52/55%). KoreanLaw get_law_text mst=280405 §104 본문 확인. 「소득세법 시행령」 §168의14③3호나목 — 「취득일(상속받은 토지는 피상속인이 해당 토지를 취득한 날을 말하고, 법 제97조의2제1항을 적용받는 경우에는 증여한 배우자 또는 직계존비속이 해당 자산을 취득한 날을 말한다)이 사업인정고시일부터 5년 이전인 토지」는 비사업용 토지로 보지 않는다. KoreanLaw get_law_text mst=286211 §168의14 본문 확인. ⇒ 재현 시나리오(이월과세 증여자 취득 2008-01-01, 고시일 2019-01-01)는 법문상 사업용이 확정인 토지인데 +10%p가 붙는다 — 「법 근거 없이 불리 적용 금지」에 정면 저촉.

**도달성**  정상 UI로 도달한다. ① 취득원인 5종은 assetKind와 무관하게 전부 노출된다(components/calc/transfer/CompanionAcquisitionCauseSection.tsx:27-33 — general_building만 별도 분기). ② 「비사업용 토지 여부 검토」 토글과 「판정 도움 필요」 라디오는 assetKind==="land"이면 취득원인 무관하게 렌더된다(app/calc/transfer-tax/steps/step4-sections/SpecialSituationSection.tsx:131-183). ③ 양도 정보에서 「공익수용」을 고르면 토지 자산에 `nblUseDetailedJudgment:true`가 자동 프리필된다(components/calc/transfer/TransferModeBlock.tsx:92-94) — 사용자가 검토 토글만 켜면 기본이 「판정 도움 필요」다. ④ 그 상태에서 지목·용도지역은 초기값이 빈 문자열이므로 아무것도 안 하면 그대로 비어 있고, 차단 메시지가 없어 다음 단계로 넘어간다. 막는 층은 ⑧ 하나뿐인데 carryover_gift·newConstruction에서는 그 호출에 도달하지 않는다(대조군 

**처방**  1순위(도달 경로 차단): ⑧ `validateNblDetailedJudgment` 호출을 조기 return보다 앞으로 올린다 — `if (!asset.acquisitionDate)` 앞, 늦어도 `if (asset.acquisitionCause === "carryover_gift")`(:219) 앞. NBL 판정은 취득원인·취득모드와 직교하므로 위치 이동만으로 회귀 표면이 작다(현재 주석도 「취득 모드와 직교하므로 모드 분기 이전에 검사」라고 적혀 있는데 실제 위치가 그 취지를 못 지킨다).
2순위(구조): ④에서 `nblUseDetailedJudgment===true`인데 raw가 undefined면 body의 `isNonBusinessLand`도 함께 false로 내리거나(정밀판정 미완 = 중과 미확정), 서버가 모드를 알 수 있도록 `nblUseDetailedJudgment`를 raw 밖 최상위로도 실어 route에서 400으로 거절한다. 지금은 서버가 「판정 도움」과 「판정 완료」를 구분할 정보 자체를 못 받는다.

### V10-a 🔴 `plumbing` — ⑬ buildAssetPayload가 컴패니언 isNonBusinessLand를 싣지 않아 §104①8호 중과가 자산2 이상에서 통째로 누락된다

**위치** `lib/calc/transfer-tax-api-helpers.ts:320` · **세액영향** probe2 실측 총세액 328,541,400 → 332,805,000(+4,263,600). 조합에 따라 훨씬 커진다 — probe4(주 자산도 비사업용) 실측 341,517,000 → 416,178,400(+74,661,400). 반대로 §104⑤ 비교과세가 1호(합산 기본세율)를 채택하는 조합에서는 차이가 0원이 될 수 있다(V10-d).

**결함**  컴패니언 페이로드 빌더 `buildAssetPayload`(lib/calc/transfer-tax-api-helpers.ts:320)는 반환 객체에 키를 명시 열거하는데 `isNonBusinessLand`가 없다(파일 전체 grep 0건). 서버 ⑭ `bundled-split-helpers.ts:388`이 `c.isNonBusinessLand ?? false`로 받으므로 컴패니언은 **항상 false**로 확정된다. 여기에 더해 폼 계층에도 쓰기 지점이 없다 — 체크박스는 `SpecialSituationSection.tsx:132-140` 한 곳뿐이고 대상이 `Step4.tsx:100 primary = form.assets?.[0]`이라 자산2 이상에는 애초에 true가 들어갈 수 없다. 즉 결함은 **두 겹**(UI 입력경로 부재 + ⑬ 미전송)이고, 두 층 모두 정정해야 「소득세법」 §104①8호 중과가 컴패니언에 도달한다. 다만 원 보고의 인과 서술 중 「엔진 분기가 발동하지 않는다」는 층위 오귀속이다 — V10-b 참조.

**실측**  probe1(⑬ 레벨, `npx tsx --tsconfig ./tsconfig.json <scratchpad>/v10-probe3.ts`): AssetForm에 `isNonBusinessLand: true`를 넣고 `buildAssetPayload(asset, "actual", "2024-03-01")` 호출 → 출력 `has isNonBusinessLand key: false / value: undefined / nbl-ish keys: []`. 즉 클라이언트가 그 값을 한 번도 보내지 않는다.
probe2(route 레벨, `<scratchpad>/v10-probe2.ts` — POST /api/calc/transfer 직접 import, 세율은 env 미설정 → loadFallbackTransferRates): primary 사업용 토지 + 컴패니언 토지(양도 1,200,000,000·취득 100,000,000·2009-03-01 취득·2024-03-01 양도), 컴패니언 `isNonBusinessLand`만 토글 →
  false: calculatedTax 298,674,000 / determinedTax 298,674,000 / totalTax 328,541,400 / groups=[progressive 0.4]
  true : calculatedTax 302,550,000 / determinedTax 302,550,000 / totalTax 332,805,000 / groups=[progressive 0.4, non_business_land 0.5(sur 0.1)]
  ⇒ 산출세액 차 +3,876,000원, 총세액 차 +4,263,600원.
인용 검증: SpecialSituationSection.tsx:132(`{primaryKind === "land" && primary && (`)·:134(checked) · Step4.tsx:100(`const primary = form.assets?.[0];`) · transfer-tax-api.ts:76 ·

**법령**  「소득세법」 §104①8호 본문 확인(KoreanLaw get_law_text mst=280405, jo=제104조): 「제104조의3에 따른 비사업용 토지」에 16/25/34/45/48/50/52/55% 표 적용 — §55① 기본세율 각 구간 +10%p와 정확히 일치. 같은 조 ⑤은 「해당 과세기간에 제94조제1항제1호·제2호 및 제4호에서 규정한 자산을 둘 이상 양도하는 경우」 1호(합산 기본세율)와 2호(자산별 산출세액 합계) 중 큰 것을 산출세액으로 한다고 정한다 — 함께양도(둘 이상 자산)에 바로 적용되는 조항이다.

**도달성**  도달 가능. 상류에 차단이 없다 — `lib/calc/transfer-tax-validate.ts:169~` SINGLE_ONLY 목록(부담부증여·겸용주택·재개발·입주권·분양권·일반건물)에 NBL은 없고, `lib/calc/` 전체에서 컴패니언 NBL을 막는 검증도 0건이다. 함께양도에 토지 컴패니언을 넣는 것 자체는 정식 지원 조합이다(`__tests__/api/transfer.route.bundled.test.ts`의 PDF 사례가 농지 컴패니언). 사용자는 화면에 「비사업용 토지 여부 검토」 토글이 자산1에만 있다는 사실을 알 수 없고, 자산2가 비사업용 토지여도 중과가 조용히 빠진다(과소과세 방향).

**처방**  두 층을 함께 연다. (1) ⑬: `buildAssetPayload` 반환 객체에 `isNonBusinessLand: asset.assetKind === "land" ? (asset.isNonBusinessLand ?? false) : undefined`를 추가(⑫ `companionAssetSchema:463`·⑭ `bundled-split-helpers.ts:388`은 이미 있으므로 이 한 줄이면 도달한다 — `isUnregistered` 선례와 동형). (2) ⑤: 컴패니언 자산 카드(`CompanionAssetCard`)의 land 자산에 같은 ToggleCard를 노출하거나, 열지 않기로 한다면 `transfer-tax-validate.ts`의 SINGLE_ONLY와 같은 층위에서 **명시 차단**한다(이 저장소의 확립 패턴 — 「침묵 오산보다 명시 차단」). 어느 쪽이든 지금의 침묵 누락은 선택지가 아니다.

### V10-f 🔴 `numeric` — 지분 분할 일괄양도에서 mergePrimaryBasic이 isNonBusinessLand를 승계하지 않아 같은 필지의 지분 카드끼리 중과 적용이 갈린다

**위치** `lib/calc/transfer-tax-api-helpers.ts:202` · **세액영향** 실측 총세액 341,517,000 → 416,178,400, 과소 74,661,400원(산출세액 기준 67,874,000원). 지분 구성비·과세표준에 따라 달라지며, §104⑤ 상쇄가 걸리면 작아질 수 있다(V10-d).

**결함**  원 보고가 다루지 않은 인접 결함이다. 같은 물건을 지분별로 나눠 취득한 뒤 100%를 함께 양도하는 모드(`isFullFractionalBundle`)에서 ④는 컴패니언에 `mergePrimaryBasic(a, primary)`를 적용해 「같은 물건·같은 양도 사건이라 전 지분 공통인 값」을 승계시킨다(:195-200 주석). 승계 목록은 assetKind·acquisitionArea·transferArea·areaScenario·landNature·transferType·transferCause 7개인데 **`isNonBusinessLand`가 빠져 있다**. 비사업용 토지 여부는 필지 자체의 성질이라 전 지분 공통인 값인데도, 사용자가 Step4에서 토글을 **명시적으로 켠** 상태에서 지분1만 중과되고 지분2 이상은 중과가 빠진다. V10-a와 뿌리는 같지만(⑬ 미전송) 이쪽은 사용자가 입력을 실제로 했는데도 절반만 반영된다는 점에서 더 나쁘고, 도달성도 더 높다.

**실측**  ⑬ 레벨: `mergePrimaryBasic`(transfer-tax-api-helpers.ts:202-213) 본문을 직접 읽어 `isNonBusinessLand` 부재를 확인했고, 그 결과가 `buildAssetPayload`로 들어가도 키가 생기지 않음은 probe3(`v10-probe3.ts`, 출력 `has isNonBusinessLand key: false`)로 실측했다.
route 레벨 세액 비대칭 실측(`<scratchpad>/v10-probe4.ts` — 최상위 `isNonBusinessLand: true`(=primary 지분) + 컴패니언 플래그만 토글):
  컴패니언 false(=현행 동작): calculatedTax 310,470,000 / totalTax 341,517,000 / groups=[non_business_land 0.5, progressive 0.4]
  컴패니언 true(=올바른 동작): calculatedTax 378,344,000 / totalTax 416,178,400 / groups=[non_business_land 0.5 단일]
  ⇒ 산출세액 **67,874,000원**, 총세액 **74,661,400원** 과소.

**법령**  「소득세법」 §104①8호 본문 확인 — 중과 대상은 「제104조의3에 따른 비사업용 토지」로 **자산(필지)의 성질**이지 지분권자의 취득 이력이 아니다. §104의3① 각 호도 토지의 용도·기간 요건으로 규정하며 지분별 구분을 두지 않는다(§104의3 각 호 본문은 이번에 §104 조문 조회 범위 안에서 참조 관계만 확인했고 전문 대조는 하지 않았다). 같은 필지의 지분마다 중과 여부가 갈리는 현행 결과에는 법적 근거가 없다.

**도달성**  도달 가능. `isFullFractionalBundle`(transfer-tax-api-helpers.ts:181-188)은 「자산 2건 이상 + 전 자산이 분수 지분율」만 요구하고 assetKind 제한이 없다. `transfer-tax-validate.ts`의 SINGLE_ONLY도 fullFractional에서 general_building만 제외할 뿐 land는 막지 않는다. UI에서 자산마다 지분율을 입력하고 함께양도를 켜면 이 모드에 들어가며, NBL 토글은 Step4 primary에 정상 노출된다. 다만 브라우저 실조작으로 land fullFractional 번들을 만들어 보지는 않았다.

**처방**  V10-a의 ⑬ 수정과 함께 `mergePrimaryBasic`의 승계 목록에 `isNonBusinessLand: primary.isNonBusinessLand`를 추가한다(같은 물건 공통값이라는 :195-200 주석의 취지에 정확히 부합). 주석의 승계 근거도 「⑬ emit + ⑧ 검사의 합집합」이므로 ⑬가 이 키를 emit하게 되는 순간 목록에 들어와야 정합이 유지된다.

### H-1 🔴 `legal-accuracy` — 「소득세법」 §95② 비사업용 토지 장기보유특별공제 배제 연혁 — 2007.1.1~2015.12.31 배제, 2016.1.1부터 적용(2016년분은 2016.1.1 기산), 2017.1.1부터 취득일 기산

**위치** `lib/tax-engine/transfer-tax-lthd.ts:97` · **세액영향** -

**결함**  1차 리뷰가 미확인으로 남긴 연혁을 KoreanLaw MCP(legal_analysis mode=applicable_law)로 시행일별 본문 대조해 확정했다. 구 「소득세법」 §95②은 비사업용 토지를 장기보유특별공제 대상에서 **배제하고 있었다**. 시행일별 실측: ① 2007.1.1 시행(제08144호) — 「제104조제1항제2호의3 내지 제2호의8의 규정에 의한 세율을 적용받는 자산…을 제외한다」, 같은 법 §104①2호의7 = 「제104조의3의 규정에 의한 비사업용 토지」(60%) ⇒ 배제. ② 2010.4.1 시행(제9897호) — 「제104조제1항제4호부터 제10호까지의 규정에 따른 세율을 적용받는 자산 **및 제104조제6항을 적용받는 자산**은 제외한다」, 비사토 = §104①8호이고 중과유예(§104⑥, 2010.12.31까지 기본세율)를 적용받는 자산도 **명문으로 함께 배제** ⇒ 유예기간에도 배제. ③ 2012.4.15 시행(제11146호, 2012.1.1 개정)·2014.1.1 시행(제12169호)·2015.5.13 시행(제13282호) — 「제104조제3항에 따른 미등기양도자산 **및 제104조의3에 따른 비사업용 토지**는 제외한다」 ⇒ 직접 명시 배제. ④ **2016.1.1 시행(법률 제13558호, 2015.12.15 공포)** — §95② 괄호에서 비사업용 토지 문구가 **삭제**되어 장특공제 대상이 되었고, 동시에 §95④ 단서에 「제104조의3에 따른 비사업용 토지로서 **2016년 1월 1일 이전에 취득**하여 보유하고 있는 자산인 경우에는 **2016년 1월 1일부터 기산**한다」가 신설되었다. ⑤ **2017.1.1 시행(법률 제14389호, 2016.12.20 공포)** — §95④의 위 비사토 기산 단서가 **삭제**되어 취득일 기산으로 환원. ⑥ 현행(2026.1.1 시행본) §95② 괄호는 「제104조제3항에 따른 미등기양도자산과 같은 조 제7항 각 호에 따른 자산」만 제외 ⇒ 비사업용 토지는 장특공제 **적용**. ⇒ 1차 리뷰의 가설(구법이 실제로 배제했다)은 **성립한다**. 또한 이 연혁은 저장소 안에 이미 실측 기록으로 존재한다 — `lib/tax-engine/data/lthd-multi-house-exclusion-era.ts:11-13`의 표가 「~2011.12.31」·「2012.1.1~2015.12.31」 구간의 §95② 괄호에 비사업용 토지가 들어 있었음을 그대로 적고 있다(다만 그 leaf는 다주택 축에만 쓰인다).

**실측**  MCP legal_analysis(mode=applicable_law, lawName=소득세법, jo=제95조) 를 date=2007-06-01 / 2010-06-01 / 2012-06-01 / 2014-06-01 / 2015-06-01 / 2016-01-05 / 2016-06-01 / 2017-01-05 / 2017-06-01 로 9회 호출해 각 시점 시행본 §95②·§95④ 본문을 직접 수령·대조(전건 성공, EXTERNAL_API_ERROR 없음). 보조로 jo=제104조 를 date=2007-06-01 / 2010-06-01 / 2014-06-01 로 호출해 비사업용 토지가 각각 §104①2호의7 / 8호 / 8호임을 확인. 참고: get_law_text(lawId=001565, jo=제95조, efYd=20140101)은 NOT_FOUND로 실패했다 — 과거 시행본은 lawId+efYd가 아니라 **legal_analysis applicable_law**로 뽑아야 한다(1차 리뷰가 막힌 지점).

**법령**  「소득세법」 제95조 제2항·제4항 (시행 2007.1.1 제08144호 / 시행 2010.4.1 제9897호 / 시행 2012.4.15 제11146호 / 시행 2014.1.1 제12169호 / 시행 2015.5.13 제13282호 / 시행 2016.1.1 제13558호 MST 177202 / 시행 2017.1.1 제14389호 MST 188354 / 현행 MST 280405), 같은 법 제104조 제1항(2호의7·8호)·제6항, 제104조의3.

**도달성**  법령 확정 그 자체이므로 코드 도달성과 무관. 코드 반영 여부는 H-2·H-3 항목 참조.

**처방**  `lib/tax-engine/data/lthd-multi-house-exclusion-era.ts`와 같은 층위에 **NBL 축 연혁 leaf**(예: `NBL_LTHD_EXCLUSION_LIFTED = "2016-01-01"`, `NBL_LTHD_ACQ_ANCHOR_SUNSET = "2017-01-01"`)를 신설하고, 다주택 축처럼 「그 시기 §95② 괄호가 무엇을 배제했는가」라는 **사실만** 판정하게 한다.

### H-2 🔴 `legal-accuracy` — 2016.1.1 이전 양도 비사업용 토지에 장기보유특별공제가 그대로 적용된다 — 구 §95② 배제 미구현(과소과세)

**위치** `lib/tax-engine/transfer-tax-lthd.ts:111` · **세액영향** 양도 2014-06-01·취득 2004-01-01·양도차익 400,000,000 기준(실측): 현행 엔진 과세표준 317,500,000 / 산출세액 133,350,000 / 지방소득세 13,335,000 / 총 146,685,000 → 구 §95②대로 LTHD 배제 시 과세표준 397,500,000 / 산출세액 173,350,000 / 지방소득세 17,335,000 / 총 190,685,000. **44,000,000원 과소과세**(국세 40,000,000 + 지방소득세 4,000,000). 공제율이 큰 장기보유일수록 커진다.

**결함**  `calcLongTermHoldingDeduction`의 배제 분기는 L-0 미등기(`:98`)·L-0a 분양권(`:103`)·승계입주권(`:107`)·L-1 다주택 중과(`:111`) 네 가지뿐이고, **비사업용 토지 축은 어디에도 없다**. `LthdExclusionReason` union(`lib/tax-engine/legal-codes/transfer-house.ts:337-341`)에도 `non_business_land`가 없다. L-1이 보는 `isSurcharge`는 `resolveSurchargeApplication`이 낸 **다주택 중과 전용** 값이라(`transfer-tax-surcharge-predicate.ts:145` — `SURCHARGE_SUBJECT_PROPERTY_TYPES` 게이트) 비사업용 토지(propertyType="land")는 애초에 걸리지 않는다. 그 결과 **양도일이 2015.12.31 이전이어도** 비사업용 토지에 표1 공제가 그대로 붙는다 — H-1에서 확정한 구 §95②(2007.1.1~2015.12.31 배제)과 정면으로 어긋나며 방향은 **납세자 유리·과소과세**다. 엔진은 과거 양도일을 **설계상 지원한다** — `lib/tax-engine/data/transfer-rate-seed-historical.ts`가 `effective_date: "1990-01-01"` 행부터 시점별 세율을 싣고 `loadFallbackTransferRates(transferDate)`가 양도일로 행을 고른다. 1차 리뷰의 「양도일 기반 연혁 분기가 0건」은 **부정확**하다 — 같은 파일 `:224`에 `input.transferDate >= LTHD_CONVERSION_95_5_CUTOFF`(§95⑤ 2025.1.1 시행) 게이트가 있고 `transfer-tax-lthd-start.ts:38`은 `isMultiHouseLthdExclusionEra(conversionDate)` 연혁 leaf를 쓴다. 정확한 서술은 「**비사업용 토지 축**의 연혁 분기가 0건」이다.

**실측**  scratchpad/probe2.ts·probe3.ts를 `npx tsx`로 실행(실세율 시드 `loadFallbackTransferRates` 사용, mock 아님). 입력: propertyType="land", isNonBusinessLand=true, 취득 2004-01-01 / 취득가 1억 / 양도가 5억(양도차익 4억), 1세대1주택 아님. 출력(양도일별 LTHD·공제율): 2010-06-01 → 48,000,000(12%) · 2014-06-01 → 80,000,000(20%) · 2015-12-31 → 88,000,000(22%) · 2016-06-01 → 96,000,000(24%) · 2024-06-01 → 120,000,000(30%). 즉 배제가 전혀 걸리지 않는다. 대조군(구법대로 LTHD 배제 시의 과세표준 397,500,000을 같은 엔진으로 재현한 등가 입력)과 비교하면 2014-06-01 총세액 146,685,000 → 190,685,000.

**법령**  「소득세법」 제95조 제2항(시행 2014.1.1 제12169호) 「…제104조제3항에 따른 미등기양도자산 **및 제104조의3에 따른 비사업용 토지는 제외한다**…」 및 시행 2010.4.1 제9897호(「제104조제1항제4호부터 제10호까지의 …세율을 적용받는 자산 및 제104조제6항을 적용받는 자산은 제외한다」) — H-1 참조.

**도달성**  도달 가능. `lib/api/transfer-tax-schema.ts:76`의 `transferDate: z.string().date()`에 하한이 없고, `lib/calc/transfer-tax-validate.ts`도 미래 양도일 경고(`:549`)만 있을 뿐 과거 하한 검증이 없다. 라우트는 `preloadTaxRates(["transfer"], transferDate)` / `loadFallbackTransferRates(transferDate)`로 **양도일 시점 세율**을 고르므로(app/api/calc/transfer/route.ts:120·128) 과거 양도일 계산은 명시적으로 지원되는 경로다. 경정청구·기한후신고 목적의 과거분 계산이 실사용 시나리오다.

**처방**  H-1의 NBL 연혁 leaf를 만들어 `calcLongTermHoldingDeduction`에 L-0b 분기를 추가한다 — `input.isNonBusinessLand && input.transferDate < NBL_LTHD_EXCLUSION_LIFTED(2016-01-01)`이면 `{deduction:0, rate:0, exclusionReason:"non_business_land_pre_2016"}`. `LthdExclusionReason` union과 `LTHD_EXCLUSION_LABEL`(transfer-house.ts:337·347)에도 사유를 추가해야 결과 산식이 「보유 N년×2%」로 오도 표시되지 않는다. 부분 비사토(면적안분) 케이스는 §104⑤ 파트 분리 축과 상호작용하므로 별도 케이스 매트릭스가 필요하다.

### V1-a 🟠 `plumbing` — 지목 전환 후 남은 nblHousingFootprint가 별장 REDIRECT 판정을 좌우한다 (입력화면에는 안 보임)

**위치** `lib/tax-engine/non-business-land/form-mapper.ts:166` · **세액영향** landArea 1,000㎡ · 수도권 밖 도시지역(주거) 기준 실측: stale 없음 → nonBusinessAreaRatio 1.0(중과 실효 +10%p, 장특 배제) / stale 100㎡ → 0.5(중과 실효 +5%p) / stale 300㎡ → 0(중과 0%p, 장특 배제 해제). 과소과세 방향.

**결함**  주장은 골자에서 성립한다. ① form-mapper.ts:166 `housingFootprint: parseNumber(asString(asset.nblHousingFootprint))`는 `nblLandType`과 무관하게 무조건 매핑된다(같은 파일의 villa/pasture/otherLand/forest 블록은 모두 landType 인자로 gate되는 것과 대조). ② 지목 전환 핸들러(NblSectionContainer.tsx:135)는 `{ nblLandType: v }`만 patch하고, 저장소 전체에서 `nblHousingFootprint`에 쓰는 지점은 초기값 ""(calc-wizard-asset-factory.ts:295 · calc-wizard-asset-nbl.ts:309)과 입력 위젯(HousingLandDetailSection.tsx:78) 둘뿐 — 리셋 코드는 0건이다. ③ ④ 빌더는 `Object.entries(asset).filter(([k]) => k.startsWith("nbl"))` prefix-pick이라(non-business-land-request.ts:66-68) 지목과 무관하게 그대로 실려 나가고, Zod(transfer-tax-schema-nbl.ts:129)·⑧ validate(transfer-tax-validate-nbl.ts) 어디에도 차단이 없다. ④ 엔진은 별장 REDIRECT를 내부에서 judgeHousingLand로 자동 재분류하므로(engine.ts:117-123, 2026-04-25 P5-B) 그 stale 값이 §168의12 배율 판정의 정착면적으로 그대로 쓰인다.

다만 원 주장의 표현 두 곳을 정정한다. (a) 「화면 어디에도 보이지 않는」은 과장이다 — 입력화면에서는 보이지 않지만(HousingLandDetailSection은 nblLandType==="housing_site"에서만 렌더, NblSectionContainer.tsx:200), 결과화면 NonBusinessLandResultCard.tsx:256-264의 「판정 과정」 타임라인이 접힘 없이 `housing_multiplier` step을 출력하므로 결과에는 「수도권 밖 도시 5배 → 허용면적 500㎡ (정착면적 100㎡ × 5배)」로 표시된다. 즉 입력↔결과 사이의 표시 비대칭이지 완전 은닉은 아니다. (b) 「§168의12 배율 판정을 받는다」는 맞으나 방향은 항상 **납세자 유리(과소과세)** 쪽이다 — stale 값은 0보다 크므로 허용면적을 늘리기만 하고, 충분히 크면 중과가 통째로 사라진다(실측 참조).

**실측**  npx tsx probe 2건 실행(worktree 격리).
[1] 엔진 직접(judgeNonBusinessLand, landType villa_land · landArea 1000 · zone residential · 수도권 아님 · 취득 2010-01-01 · 양도 2024-01-01 · villa.villaUsePeriods=[]):
  housingFootprint undefined → isNonBusinessLand=true · reason "정착면적 미입력" · areaProportioning undefined
  housingFootprint 0        → 동일
  housingFootprint 100      → isNonBusinessLand=true · reason "배율(5배) 초과 — 초과분 500㎡ 비사업용" · nonBusinessRatio 0.5
[2] ④→⑭ 전 구간(makeDefaultAsset → buildNonBusinessLandRaw → buildNblEngineInput → judgeNonBusinessLand, nblLandType="villa_land"):
  nblHousingFootprint ""    → validate=null · engine input housingFootprint=undefined · isNonBusinessLand=true · surcharge {additionalRate:0.1, nonBusinessAreaRatio:1, longTermDeductionExcluded:true}
  nblHousingFootprint "100" → validate=null · housingFootprint=100 · isNonBusinessLand=true · surcharge {additionalRate:0.1, nonBusinessAreaRatio:0.5, longTermDeductionExcluded:true}
  nblHousingFootprint "300" → validate=null · h

**법령**  「소득세법」 제104조의3제1항제5호(KoreanLaw get_law_text, mst=280405, 시행 2026-01-01 본문 확인): 「「지방세법」 제106조제2항에 따른 주택부속토지 중 **주택이 정착된 면적**에 지역별로 대통령령으로 정하는 배율을 곱하여 산정한 면적을 초과하는 토지」. 같은 항 제6호가 별장 부속토지다. 「소득세법 시행령」 제168조의12(mst=286211, 시행 2026-07-01 본문 확인): 도시지역 內 수도권 주·상·공 3배 / 수도권 녹지 5배 / 수도권 밖 5배 / 그 밖 10배 — probe의 「수도권 밖 도시 5배」와 일치. 정착면적은 법정 요건사실이므로, 현재 지목 입력화면에 존재하지 않는 과거 입력값을 그 요건사실로 쓰는 것은 법령 해석 오류가 아니라 요건사실 배관 결함이다(법 근거 없이 과소 인정 방향).

**도달성**  도달 가능. 정상 UI 조작만으로 재현된다 — 지목=주택부수토지 선택 → 「주택 정착면적」 입력 → 지목을 별장으로 변경(HousingLandDetailSection이 언마운트되어 필드는 사라지지만 store 값은 유지). 상류 차단 없음: ⑧ validateNblDetailedJudgment는 별장 지목에서 정착면적을 보지 않고(실측 null), ④ 빌더는 nbl* prefix-pick이라 필터하지 않으며, Zod는 optional string으로 통과시킨다. 별장 REDIRECT 자체도 기본 상태(별장 사용기간 미입력 → 비사용기간 100%)에서 곧바로 발동한다. IndexedDB 이력 복원·sessionStorage 잔존으로도 같은 상태가 만들어진다.

**처방**  form-mapper.ts:166을 sibling 블록과 같은 패턴으로 gate한다 — 정착면적을 소비하는 경로가 judgeHousingLand뿐이므로 `housingFootprint: landType === "housing_site" ? parseNumber(...) : undefined`. 다만 그렇게 하면 별장 REDIRECT 경로는 항상 「정착면적 미입력」이 되어 1차 발견 E1-02가 전면화되므로, 별장 지목에서도 정착면적을 입력받는 UI(또는 REDIRECT 시 재입력 요구)를 함께 열어야 완결된다 — 배관만 막으면 유리-오류가 불리-오류로 바뀔 뿐이다.

### V4-b 🟠 `legal-accuracy` — §168의14③4호 무조건 의제가 「법 §104의3①1호 나목(도시지역) 농지」 요건을 검사하지 않아 비도시지역 농지도 사업용으로 확정된다

**위치** `lib/tax-engine/non-business-land/unconditional-exemption.ts:115` · **세액영향** 판정 자체가 뒤집힌다(`isNonBusinessLand: true → false`, probe 실측). 세액으로는 §104①8호 기본세율 +10%p와 §95② 장기보유특별공제 배제가 통째로 사라진다 — 과세표준 3억·보유 15년 농지 예시로 중과분만 약 3,000만원 규모다(표 손계산, `calculateTransferTax` 전체 실측은 수행하지 않음).

**결함**  주장은 사실이다. `unconditional-exemption.ts:115-124`는 `if (u.isUrbanFarmlandJongjoongOrInherited && categoryGroup === "farmland")`만 보고 즉시 `isExempt:true`를 반환한다 — 조문이 요구하는 세 가지를 하나도 검사하지 않는다: ⑴ 각 목 외 부분의 「법 제104조의3제1항제1호 **나목**에 해당하는 농지」(= 도시지역, 녹지·개발제한 제외) ⑵ 가목의 「2005년 12월 31일 이전 취득」 ⑶ 나목의 「상속개시일부터 5년 이내 양도」. 원 1차 보고가 ⑵⑶(날짜 2건)만 지적했다면, **⑴ zoneType 요건이 3번째 누락**이라는 이번 주장이 맞다. 특히 ⑴은 가목·나목 공통 요건이라 단일 boolean 설계로도 검사 가능하고(같은 파일 :74가 이미 `isUrbanForFarmland(input.zoneType)`을 §168의14③1의2호 단서에 쓰고 있다), 입력에 `zoneType`이 이미 들어와 있어 추가 필드 없이 즉시 검사 가능하다 — 「가목/나목을 구분할 수 없어 날짜를 못 본다」는 변명이 ⑴에는 통하지 않는다. 다만 엄밀히는 나목이 요구하는 **소재지 축**(특별시·광역시·특별자치시·특별자치도 및 시지역)까지 세면 미검사 요건은 4건이며, 이 축은 NBL 입력에 대응 필드가 없어 zoneType 검사만으로 완전히 닫히지는 않는다.

**실측**  1) `npx tsx` probe(scratchpad/v4b.ts) — `checkUnconditionalExemption`에 zoneType만 바꿔 6회 호출:
  commercial / residential / green / agriculture_forest / management / undesignated → **전부** `{isExempt:true, reason:"jongjoong_or_inherit_urban_farmland", legalBasis:"시행령 §168조의14 ③ 4호"}`.
  ⇒ 녹지지역·농림지역·관리지역·미지정 등 나목 비해당 농지에서도 그대로 의제된다. detail 문자열은 「도시지역 內 농지 …」라고 출력하면서 실제로는 도시지역인지 보지 않는다.
2) 전체 판정 flip 실측(scratchpad/v4b2.ts, `judgeNonBusinessLand`) — 농지·zoneType=agriculture_forest·취득 2010-01-01·양도 2024-01-01·재촌/자경 이력 0건:
  flag=false => isNonBusinessLand: **true**
  flag=true  => isNonBusinessLand: **false**
  ⇒ 법문상 비사업용인 토지가 토글 하나로 사업용 확정된다.
3) 날짜 요건 미검사도 같은 probe에서 확인 — `unconditionalExemption`에 취득일·상속개시일을 아예 넣지 않아도(필드 자체가 없음) isExempt:true.

**법령**  KoreanLaw `get_law_text(mst=286211, jo=제168조의14)` 원문: 「③ … 4. **법 제104조의3제1항제1호 나목에 해당하는 농지**로서 다음 각 목의 어느 하나에 해당하는 농지 가. 종중이 소유한 농지(**2005년 12월 31일 이전에 취득한 것에 한한다**) 나. 상속에 의하여 취득한 농지로서 그 **상속개시일부터 5년 이내에 양도**하는 토지」. `get_law_text(mst=280405, jo=제104조의3)` 원문: 「1호 나목: 특별시·광역시·특별자치시·특별자치도 및 시지역 중 「국토의 계획 및 이용에 관한 법률」에 따른 **도시지역**(대통령령으로 정하는 지역은 제외한다)에 있는 농지」. `get_law_text(mst=286211, jo=제168조의8)` ④항: 「법 제104조의3제1항제1호 나목 본문에서 “대통령령으로 정하는 지역”이란 … **녹지지역 및 개발제한구역**을 말한다」 — 즉 나목 = 도시지역 중 주·상·공, 이는 코드의 기존 leaf `isUrbanForFarmland(zoneType)`(urban-area.ts:31-33)과 정확히 같은 정의다. 또한 §168의8③2호는 비도시지역 농지의 상속 예외를 **3년**으로 두므로(4호나목의 5년과 다름), 「비도시지역 상속 농지를 상속 후 4년째 양도」는 법문상 비사업용인데 현행 코드는 사업용으로 확정한다 — 즉 조문 간 기간 차이를 무너뜨리는 실질 오류다.

**도달성**  **끝까지 열려 있다.** UI 토글 `components/calc/transfer/nbl/UnconditionalExemptionSection.tsx:190-204`(제목 「도시지역 농지 종중·상속 5년 이내 양도 특례」, 하위 입력 필드 없음 — 형제 토글인 종중 소유는 `nblExemptJongjoongAcqDate`, 이농은 `nblExemptInongDate`를 받아 엔진이 실제로 날짜를 검사하는 것과 대비된다) → store 기본값 `calc-wizard-asset-factory.ts:262`·`calc-wizard-asset-nbl.ts:276` → Zod `lib/api/transfer-tax-schema-nbl.ts:232` → 매퍼 `form-mapper-helpers.ts:110`(has 게이트 포함)·`:133`(무조건 매핑) → 엔진 `:115`. `lib/calc/` 전수 grep 결과 이 토글에 용도지역·날짜를 요구하는 ⑧ validate 차단은 **0건**이다(`nbl-unconditional-exemption-status.ts`의 requirementHint도 「지목이 농지여야 확정됩니다」라고만 안내). 방향은 **납세자 유리(

**처방**  `unconditional-exemption.ts:115`의 조건에 이미 같은 파일 :74가 쓰고 있는 leaf를 그대로 재사용해 `&& isUrbanForFarmland(input.zoneType)`를 추가한다(신규 leaf 작성·시그니처 변경 금지 — E2 note 2)의 회귀 경고와 동일 이유). 날짜 요건 ⑵⑶은 별개 항목이며, 이를 닫으려면 UI에 가목/나목 구분과 취득일·상속개시일 입력을 추가해야 하므로(형제 토글의 확립 패턴) zoneType 게이트와 분리해 착수할 것. 회귀 표면 확인 완료: 기존 3개 테스트는 전부 도시지역이라 영향 없다.

### V5-b 🟠 `plumbing` — `nblUrbanIncorporationDate`를 요구하는 ⑧ 검증이 실제로 0건 — 도시지역 선택 + 편입일 공란이 아무 경고 없이 통과한다

**위치** `lib/calc/transfer-tax-validate-nbl.ts:28` · **세액영향** V5-a와 동일 경로(기본세율 +10%p + 장특공 배제). 별도 세액 산출은 하지 않았다.

**결함**  `lib/calc/` 전수 grep에서 `nblUrbanIncorporationDate`는 **3회**만 등장하고 전부 `lib/calc/non-business-land-request.ts:80·81·88`(형식 정규식 + §66 감면 편입일 fallback + 전송)이다. `transfer-tax-validate-nbl.ts`(NBL 정밀판정 필수입력 검증)가 요구하는 것은 `nblLandType`(:28)·`nblZoneType`(:30)·주택부수토지의 `nblIsMetropolitanArea`(:42-44)·`nblDeemedTransferDate`(:50)·기타토지 항목뿐이고 편입일은 없다. `transfer-tax-validate-nbl-other.ts`에도 없다. UI에도 required 표시나 경고가 없다(NblSectionContainer.tsx:208 FieldCard hint는 「편입일은 토지이용계획확인원에서 확인해 입력하세요」 안내문뿐). 즉 「도시지역(주·상·공·녹지) 선택 + 편입일 공란」이 차단 없이 계산되어 비사업용 중과로 확정된다.

**실측**  grep -rn "nblUrbanIncorporationDate" lib/calc/ → 3건(non-business-land-request.ts:80,81,88)뿐. grep -rn "nbl" lib/calc/transfer-tax-validate-nbl.ts → 편입일 관련 검증 0건. 전 저장소 grep(lib/ app/ components/ __tests__/ e2e/)에서도 검증 성격의 참조는 없고 store 초기값(calc-wizard-asset-factory.ts:267·calc-wizard-asset-nbl.ts:281 = "")·타입(calc-wizard-asset-nbl-judgment.ts:48)·Zod optional(lib/api/transfer-tax-schema-nbl.ts:92)·UI 배선(NblSectionContainer.tsx:81,210,211)·매퍼(form-mapper.ts:131)뿐이다.

**법령**  조문 자체가 아니라 이 저장소의 정책 문제다 — CLAUDE.md 「자동 안분 fallback 금지 · 미입력은 검증 오류로 차단」. 관련 조문은 V5-a와 동일(§168의8⑥·§168의9①2호 단서·§168의10⑤, 전부 3년).

**도달성**  도달 가능하며 실제로 아무 상류 게이트도 없다. E3-01(`nblIsMetropolitanArea`)은 validate에 게이트가 **있고**(:42-44) 다만 "unknown" 값을 빠뜨린 것인 반면, 편입일은 게이트 자체가 없다.

**처방**  `validateNblDetailedJudgment`에 「`nblLandType`이 farmland·forest·pasture 이고 `nblZoneType`이 도시지역(주·상·공·녹지)이면 `nblUrbanIncorporationDate`가 YYYY-MM-DD로 필수」 게이트를 추가한다. 도시지역이지만 편입 사건 자체가 없는 토지(당초부터 도시지역)를 위해서는 「해당 없음」 명시 선택지를 두어 「모른다」와 구분하되, 두 값 모두 없으면 차단한다(자동 fallback 금지). 회귀 anchor는 차단 케이스 1건 + 통과 대조군 1건.

### V6-a 🟠 `numeric` — 실내 종목이 둘 이상이면 자산당 단일 필드인 실내 바닥면적이 종목 수만큼 중복 계상된다 (lookupStd)

**위치** `lib/tax-engine/non-business-land/other-land.ts:147` · **세액영향** 기준면적 과대 → 비사업용 면적 과소 → 「소득세법」 §104①8호 +10%p 중과·§95② 장특공제 배제가 적용되는 안분비율이 축소(과소과세). 예시(landArea 8,000㎡·녹지·바닥 500㎡·수영+실내구기): 비사업용 비율 0.5625 → 0.125, 비사업용 면적 4,500㎡ → 1,000㎡. 실내 3종목이면 500㎡ 건물 하나로 10,500㎡가 인정된다.

**결함**  인용 코드·줄번호 정확. `lookupStd`(other-land.ts:147-157)는 실내 종목마다 `Math.min(o.indoorFloorArea, ind) * zoneMul`을 독립 반환하고 `sumSportsEvents`(:158-160)가 그것을 합산한다. `indoorFloorArea`는 자산당 단일 필드(land-usage.types.ts:233, UI 입력칸 1개)이므로, 실내 주종목 + 실내 추가종목 조합에서 **같은 바닥면적이 종목 수만큼 배율을 먹는다**. 결함이 드러나는 것은 바닥면적이 표값보다 작아 min의 cap이 걸리지 않을 때다 — 바닥 500㎡·수영(표값 1,000)+구기(800)·녹지 7배면 코드값 7,000, 별표3 비고1·3 문언대로면 min(500, 1,800)×7 = 3,500. 바닥이 표값 합계보다 크면(예: 2,000) 코드값 12,600 = (1,000+800)×7로 우연히 맞아 떨어져 결함이 가려진다. 방향은 기준면적 과대 → 비사업용 과소(과소과세, 납세자 유리). 원 보고의 실측 7,000 vs 3,500은 그대로 재현됐다. 다만 원 보고가 대조군으로 쓴 3,500(=추가종목 제거)은 「실내 2종목의 올바른 값」과 값이 같을 뿐 같은 시나리오가 아니라는 점을 덧붙인다(바닥 500 < 표값이라 종목 수가 늘어도 정답은 500×7로 불변).

**실측**  npx tsx로 `resolveAreaLimit`·`judgeOtherLand` 직접 호출(스크래치패드 v6probe.ts·v6probe2.ts).
- resolveAreaLimit({sportsCategory:"workplace", sportsFacilityType:"swimming", sportsExtraEvents:["ball_court"], indoorFloorArea:500}, "green") → **7000**
- 같은 입력에서 sportsExtraEvents 제거 → **3500**
- 실내 3종 전부(swimming + ball_court + ice_rink), 바닥 500, green → **10500** (500×7이 3번)
- 바닥 미입력 + 실내 2종 → 1800 (표값 합산, 배율 미적용 fallback)
judgeOtherLand 레벨(landArea 8000·green·종합합산·기간기준 미충족): 추가종목 있음 → businessArea 7000 / nonBusinessArea 1000 / ratio 0.125, 추가종목 없음 → businessArea 3500 / nonBusinessArea 4500 / ratio 0.5625. 비사업용 비율이 0.5625 → 0.125로 뒤집힌다.

**법령**  KoreanLaw get_annexes 원문 조회 성공. 「소득세법 시행규칙」 [별표 3](제83조의4제1항 관련) 비고1: 「실내체육시설의 부속토지의 경우에는 **실내체육시설의 건축물 바닥면적**에 「지방세법 시행령」 제131조의2제2항의 규정에 따른 용도지역별 적용배율을 곱하여 산출한 면적을 기준면적으로 인정한다. 다만, 당해 토지가 … 제131조의2제1항제2호의 규정에 따른 건축물의 부속토지에 해당하는 경우에는 그러하지 아니하다.」 비고3: 「실내운동경기를 할 수 있는 운동경기부를 두고 있는 자가 설치한 실내체육시설의 건축물 바닥면적이 기준면적 이하인 경우에는 당해 건축물 바닥면적에 … 적용배율을 곱하여 산출한 면적을 기준면적으로 인정한다.」 [별표 4](제83조의4제3항 관련) 비고1·3도 문언 동일. 두 비고 모두 **곱셈의 피승수를 「건축물 바닥면적」 하나로 특정**하며, 실내 종목(운동경기부) 수만큼 그 바닥면적을 반복 계상하라는 문언은 없다. 표의 실내 열 머리도 「기준면적(체육시설 바닥면적)」으로, 표값 800/1,000/1,800은 토지면적이 아니라 **바닥면적의 상한**임을 명시한다 ⇒ 단일 바닥면적에 대해 상한을 종목별로 각각 적용한 뒤 합산할 근거가 없다.

**도달성**  정상 UI 경로로 도달한다(store 잔존값 불필요). `OtherLandDetailSection.tsx:342-359`의 추가 보유 종목 칩은 `SPORTS_FACILITY_OPTIONS`(:72-88, 실외 11 + 실내 3 ball_court·swimming·ice_rink)에서 **주종목만 제외하고 전건 노출**하고, 실내 바닥면적 입력칸(:370-374)은 **주종목이 실내일 때** 렌더된다. 따라서 「주종목 수영 → 바닥면적 500 입력 → 추가종목 실내 구기 체크」는 한 화면에서 연속으로 가능하다. 상류 차단 없음: Zod `nblOtherSportsExtraEvents: z.array(z.string()).optional()`(transfer-tax-schema-nbl.ts:175)는 값 제한이 없고, ⑧ `validateNblOtherLand`(transfer-tax-validate-nbl-other.ts:34-47)는 sports에서 「종목 선택 또는 직접입력」만 요구하며 실내 중복을 막지 않는다. form-mapper-helpers.ts:278은 `asArray<string>(...) as OtherLandUsage["sportsExtra

**처방**  실내 종목 부속토지를 종목별 합산에서 분리해 **1회만** 산입한다 — `lookupStd`는 실내 종목에 대해 표값(바닥면적 상한)만 돌려주게 하고, `sumSportsEvents`가 낸 실내 표값 합계 `S`에 대해 최종적으로 `min(indoorFloorArea, S) * zoneMul`을 한 번 적용(바닥·배율 미확보 시 현행대로 표값 fallback). 이 형태는 단일 실내 종목에서 현행과 동일한 값을 주므로 AT-F2B-INDOOR-1/2/3이 그대로 통과한다. 아울러 `sportsExtraEvents` 타입이 실외 전용인 점과 UI가 실내 칩을 노출하는 점의 드리프트를 함께 정리할 것(타입을 실내 포함으로 넓히든, UI에서 실내 칩을 제외하든 한쪽으로 단일화).

### V6-b 🟠 `legal-accuracy` — 별표3 비고5·별표4 비고4 선수가산이 「주종목이 테니스일 때」만 적용된다 — 추가 보유 종목의 테니스에는 붙지 않는다

**위치** `lib/tax-engine/non-business-land/other-land.ts:107` · **세액영향** 기준면적이 floor((선수수−2)/2) × 483㎡(별표3) 또는 × 725㎡(별표4)만큼 과소 산정된다. 실측 예(직장운동경기부·축구장+테니스장·선수 6인·landArea 14,000㎡): 12,616㎡가 인정되어야 하나 11,650㎡만 인정 → 비사업용 면적 1,384㎡ → 2,350㎡(+966㎡), 비사업용 비율 0.0989 → 0.1679. 그만큼의 양도차익에 「소득세법」 §104①8호 +10%p 중과와 §95② 장기보유특별공제 배제가 추가로 적용된다.

**결함**  인용 코드·줄번호 정확. `applySportsNotes`(other-land.ts:98-115)의 선수가산 조건은 `o.sportsFacilityType === "tennis" || o.sportsFacilityType === "soft_tennis"`(:107)로 **주종목 슬롯만** 본다. 반면 종목 합산 `sumSportsEvents`(:158-160)는 `[sportsFacilityType, ...sportsExtraEvents]` 전체를 대상으로 하므로, 테니스를 추가 보유 종목으로 둔 경우 표값 650은 더해지되 비고5 가산은 0이 된다. 별표3·4의 비고에는 주종목/부종목 축이 없으므로 이는 UI 자료구조가 만들어낸 구분이다. 다만 원 보고가 제시한 실측 대조 「1,616 vs 11,650」은 **서로 다른 시설 구성**(테니스 단독 vs 축구+테니스)을 비교한 것이라 가산 누락의 크기를 나타내지 못한다. 같은 사실관계를 주/부만 바꿔 대조하면 축구+테니스·선수 6인에서 주종목=축구 11,650 vs 주종목=테니스 12,616으로 **순서 의존(966㎡ = 2×483 차이)** 이 드러난다 — 이쪽이 정확한 영향 수치다.

**실측**  npx tsx로 `resolveAreaLimit`·`judgeOtherLand` 직접 호출(스크래치패드 v6probe.ts·v6probe2.ts).
- resolveAreaLimit({sportsFacilityType:"tennis", sportsPlayerCount:6}) → **1616** (650 + floor((6−2)/2)×483)
- resolveAreaLimit({sportsFacilityType:"soccer", sportsExtraEvents:["tennis"], sportsPlayerCount:6}) → **11650** (가산 0)
- 같은 입력에서 sportsPlayerCount 제거 → **11650** (동일 ⇒ 잔존값이 있든 없든 결과가 같다 = 값이 조용히 무시된다)
- resolveAreaLimit({sportsFacilityType:"tennis", sportsExtraEvents:["soccer"], sportsPlayerCount:6}) → **12616**
judgeOtherLand 레벨(landArea 14,000·기간기준 미충족): 주종목 축구+부 테니스 → businessArea 11,650 / nonBusinessArea 2,350 / ratio 0.1679, 주종목 테니스+부 축구 → businessArea 12,616 / nonBusinessArea 1,384 / ratio 0.0989. **동일한 시설·선수 구성인데 주/부 지정만 바꾸면 비사업용 면적이 966㎡ 달라진다.**

**법령**  KoreanLaw get_annexes 원문 조회 성공. 「소득세법 시행규칙」 [별표 3] 비고5: 「**테니스장 또는 연식정구장의 경우에는** 선수 2인까지를 기준으로 하며, 선수가 2인을 초과하는 경우에는 2인마다 483제곱미터를 가산하여 기준면적으로 인정한다.」 [별표 4] 비고4: 같은 문언에 725제곱미터. 문언은 **그 종목(테니스장·연식정구장)의 존재**만을 요건으로 하고, 그 시설이 납세자의 주된 종목인지 부수 종목인지를 구분하지 않는다. 비고2가 「축구, 야구, 럭비, 필드하키 또는 미식축구중 2종목 이상의 운동경기부를 두고 있는 경우」로 **복수 종목 보유 상황을 명시적으로 상정**하고 있는 점도, 비고5가 복수 보유 중 테니스장에 적용되지 않는다는 독법을 배제한다. 따라서 코드의 주/부 구분은 법령 근거가 없고, 방향은 기준면적 과소 → 비사업용 과대(납세자 불리)로 「법 근거 없이 불리 적용 금지」에 저촉된다.

**도달성**  「엔진이 값을 무시한다」와 「그 값을 넣을 입력 경로가 없다」가 겹쳐 있다. UI는 선수 수 입력칸을 주종목이 tennis/soft_tennis일 때만 렌더하고(`OtherLandDetailSection.tsx:364-368`), 주종목 변경 시 `onValueChange`(:332)는 `nblOtherSportsFacilityType`만 쓰므로 `nblOtherSportsPlayerCount`·`nblOtherSportsExtraEvents`를 리셋하지 않는다(저장소 전수 grep — 리셋 코드 0건). ⇒ 「테니스를 주종목으로 골라 선수 6인 입력 → 주종목을 축구로 변경 → 테니스를 추가 종목으로 체크」 순서에서 잔존값이 그대로 페이로드에 실린다. 다만 위 probe가 보이듯 **잔존값이 있든 없든 엔진 결과는 11,650으로 동일**하므로 이 결함은 store 잔존값 계열이 아니라 **입력 경로 부재 + 엔진 조건 협소** 계열이다. ⑧ validate·Zod에 차단은 없다(`validateNblOtherLand`는 sports에서 종목 선택 여부만 본다). 사용자가 테니스를 주종목으로 지정하면 정확한 12,616이 나오므로 우회는 가능하나, 화면 어

**처방**  엔진: 선수가산을 「주종목」이 아니라 **보유 종목 집합**에 대해 판정한다 — `applySportsNotes`에 events 배열(또는 테니스·연식정구 포함 여부)을 넘겨 `events.includes("tennis") || events.includes("soft_tennis")`로 조건을 넓힌다. 기존 AT-F2B-5a/5b/5d(주종목 테니스)는 값이 불변이라 그대로 통과한다. UI: 선수 수 입력칸의 노출 조건도 같은 축으로 맞춘다 — `nblOtherSportsFacilityType`이 tennis/soft_tennis이거나 `nblOtherSportsExtraEvents`에 그 둘 중 하나가 포함될 때 렌더. 회귀 방지 anchor는 「주/부를 바꿔도 같은 값」을 고정하는 형태(축구+테니스·6인 → 주종목 어느 쪽이든 12,616)가 적절하다. 부수적으로 주종목 변경 시 무의미해진 `nblOtherSportsPlayerCount` 잔존 문제도 함께 사라진다.

### V7-c 🟠 `plumbing` — E5-04 처방(레거시 종중 의제를 농지로 한정)은 V7-b를 종중 목장에서 새로 활성화한다

**위치** `lib/tax-engine/non-business-land/unconditional-exemption.ts:154` · **세액영향** V7-b와 동일 크기(같은 경로). 실측 픽스처 기준 총부담세액 +5,300만~7,600만원.

**결함**  현재 종중 목장(§168의10②2호)이 V7-b의 결함에 걸리지 않는 이유는 `checkUnconditionalExemption`의 레거시 종중 분기(unconditional-exemption.ts:154-165)가 `isAgriLike`(farmland·forest·pasture)에 걸려 Step 2에서 사업용으로 **선점**하기 때문이다. 이 선점을 제거하고 지목별 judge로 되돌리면(1차 발견 E5-04의 처방 방향), 종중 목장이 `judgePasture`로 들어가 축산 영위 중일 때 곧바로 V7-b 경로에 빠진다. 원 보고자의 부수 결론은 실측으로 확인됐다 — V7-b 수정이 E5-04 수정에 선행해야 한다.

**실측**  npx tsx /private/tmp/.../scratchpad/v7jong.ts — 목장·15,000㎡·agriculture_forest·acq 2000-01-01·transfer 2024-01-01·isLivestockOperator true·hanwoo_breeding 1두·unconditionalExemption{isJongjoongOwned:true, jongjoongAcquisitionDate:2000-01-01}:
전체 엔진(Step2 포함): isNBL = false | steps: land_category:PASS unconditional_exemption:PASS
judgePasture 직접 호출(= Step2 선점 제거 후 도달할 경로): isBusiness = false | ratio = 0.9995 | steps: pasture_livestock:PASS pasture_area:FAIL
→ 선점이 사라지는 순간 사업용 판정이 비사업용으로 뒤집힌다.

**법령**  「소득세법 시행령」 §168의10②2호(종중이 소유한 목장용지 — 2005년 12월 31일 이전에 취득한 것에 한한다) — V7-a에서 본문 확인. 종중 목장은 §104의3①3호 단서로 3호 전체에서 제외되므로 축산 영위·면적 초과 여부와 무관하게 사업용이다. 현행 코드가 결과적으로 옳은 답을 내는 것은 맞으나, 인용하는 근거(unconditional-exemption.ts:163의 legalBasis 「시행령 §168조의14 ③ 4호 가목 · §168-8 ③ 6호 등」)는 목장 조문이 아니라는 별개 문제가 있다.

**도달성**  현행 코드에서는 종중 목장이 Step 2에서 선점되어 이 결함에 도달하지 않는다(실측 확인 — 잠재 결함). 도달은 E5-04 처방 채택 시에만 발생하므로 severity를 medium으로 낮췄다. 다만 종중 소유 여부 입력 경로(`nblUnconditional*` 계열)가 이미 열려 있으므로 처방이 들어가는 즉시 실무상 결함이 된다.

**처방**  E5-04 처방을 착수하기 전에 V7-b(isRelatedPasture 호출부 hoist)를 먼저 반영한다. 순서를 바꾸면 종중 목장에서 회귀가 난다. 두 수정을 한 PR로 묶고 종중 목장 케이스 anchor를 함께 추가할 것.

### V8-a 🟠 `ui-engine-drift` — 일괄양도 properties[] echo가 단건 세율을 그대로 싣고, 실제 그룹 과세는 다른 세율로 계산된다 (E6-01의 표시 측면)

**위치** `lib/tax-engine/transfer-tax-aggregate.ts:591` · **세액영향** 표시 축: 자산별 산출세액(참고)이 283,910,000으로 표시(58%)되나 실제 그 자산에 적용된 그룹 계산은 40%·169,860,000 — 표시 −실제 = +114,050,000 괴리. 세액 축(= E6-01): 중과 +10%p가 통째로 사라져 총세액이 부수토지 판정 유무와 동일(205,557,000). 위 시나리오에서 중과가 정상 반영됐다면 과세표준 489,500,000의 초과면적비율 1/2 × 10%p = 24,475,000 상당이 추가되어야 한다(단건 대조: 170,605,000 vs 169,860,000 = 745,000은 §104⑤ 비교과세·기본공제 차이가 섞인 값이므로 단순 대입 금지).

**결함**  주장은 성립한다. 다만 수치는 시나리오 의존이라 메모의 「0.5·0.1 vs 0.4·0」은 내 재현에서 「0.48·0.1 vs 0.4·0」으로 나왔다(브래킷 차이일 뿐 방향은 동일). 정확한 서술: `transfer-tax-aggregate.ts:591-593`이 `properties[idx].appliedRate/surchargeRate`에 **단건 결과값을 그대로 복사**하는데, 같은 자산의 실제 과세는 `aggregateByGroup`이 `correctedSingleInput`으로 **재계산**한 값(`groupTaxes[].appliedRate/surchargeRate`)이다. 상업용건물 부수토지 초과분(STEP 0.62 `runCommercialAppurtenantLandStep`, transfer-tax-judgment-steps.ts:115-163)은 엔진 **내부 workingInput에만** `isNonBusinessLand:true`·`nonBusinessLandAreaRatio`를 주입하고 결과 객체에 echo하지 않는다. 반면 aggregate의 교정 블록(:244-252)은 `result.nonBusinessLandJudgmentDetail`(정밀 NBL 판정)이 있을 때만 `nblOverride`를 만들므로 CB 경로에서는 교정이 일어나지 않는다. 그 결과 **비대칭**이 생긴다 — `classifyRateGroup`(aggregate-helpers.ts:114-119)은 `result.surchargeType==="non_business_land"`를 읽어 자산을 `non_business_land` 그룹에 넣지만, 같은 그룹의 세액 재계산 `assetTaxOf`(:352-354)는 플래그가 없는 `correctedSingleInput`을 써서 중과를 통째로 잃는다. 따라서 1)은 **독립 결함이 아니라 E6-01(중과 소실)과 뿌리가 같은 표시 측면**이며, 교정 블록에 STEP 0.62 주입을 반영하면 두 증상이 동시에 닫힌다. 표시 경로는 실재한다 — 일괄 결과의 계산결과 상세명세서(`DetailedStatementHelpers.ts:628-634` → `DetailedStatementFormulaBuilders.ts:114-118`)와 합산 신고서 양식 자산별 열(`FilingFormTableAggregateHelpers.ts:251`)이 `p.appliedRate+p.surchargeRate`·`p.refCalculatedTax`를 그대로 그린다.

**실측**  npx tsx (worktree 루트, tsconfig paths alias probe). scratchpad/p3.ts — 상가 1호(양도 12억/취득 6억, 2014-06-01→2024-06-01) + 컴패니언 토지 1억, `commercialAppurtenantLand={totalLandArea:1200, totalBuildingFootprintArea:200, zoneType:"commercial"}`(상업지역 3배 → 기준면적 600㎡, 초과 600㎡ = 1/2)를 `calculateTransferTaxAggregate`에 직접 투입, mock 세율.

출력 (CAL=true):
  groupTaxes[0] = {group:"non_business_land", groupTaxBase:489,500,000, groupCalculatedTax:169,860,000, appliedRate:0.4, surchargeRate:0}
  properties[0] = {rateGroup:"non_business_land", appliedRate:0.48, surchargeRate:0.1, progressiveDeduction:0, taxBaseShare:489,500,000, refCalculatedTax:283,910,000, refCalculatedTaxNote:undefined}
  명세서 per-asset 산출세액 formula(= buildCalculatedTaxFormula 재현) = "489,500,000 × 58% - 0 = 283,910,000"
  totalTax = 205,557,000
출력 (CAL=false, 동일 입력에서 부수토지 판정만 제거):
  groupTaxes = [{group:"progressive", appliedRate:0.4, surchargeRate:0, groupCalculatedTax:186,870,000}]
  properties[0] = {appliedRate:0.4, surchargeRate:undefined, r

**법령**  「소득세법」 §104①8호 — KoreanLaw get_law_text(mst=280405, jo=제104조) 본문 직접 확인. 비사업용 토지 세율표가 16/25/34/45/48/50/52/55%로 §55① 기본세율(6/15/24/35/38/40/42/45%)에 **일률 +10%p**임을 확인했다(저장소 배경규칙과 일치). 같은 조 ⑤ 후단 「한 필지의 토지가 제104조의3에 따른 비사업용 토지와 그 외의 토지로 구분되는 경우에는 각각을 별개의 자산으로 보아 양도소득 산출세액을 계산한다」도 본문 확인 — 부분 비사업용 자산을 파트로 나눠 계산하는 현행 설계의 근거다. 상업용건물 부수토지 초과분의 비사업용 의제 계보(§104의3①4호나목 → 「지방세법」 §106①2호 → 같은 법 시행령 §101①2호)는 이번에 본문을 조회하지 않았다 — 다만 이 발견의 쟁점은 그 판정의 당부가 아니라 「같은 자산에 대해 화면 세율과 과세 세율이 다르다」는 내부 불일치이므로 판정에 영향이 없다.

**도달성**  도달 가능. ① 입력: `CommercialAppurtenantLandSection`이 `asset.assetKind==="commercial_building"`이면 취득방법과 무관하게 항상 마운트된다(`asset-sections/AssetSectionAcquisition.tsx:303-305`), ④ 변환 `buildCommercialAppurtenantLand`(lib/calc/transfer-tax-api-commercial.ts:28-41)가 두 면적이 모두 >0이면 페이로드를 만들고, ⑬ `transfer-tax-api.ts:640`이 body에 spread, ⑫ `transfer-tax-schema.ts:432`가 최상위 optional로 통과, ⑭ `engine-input.ts:373`이 engineInput에 싣는다. ② 일괄 경로: `route.ts:262-271`이 primary 아이템을 `...engineInput`으로 만들어 그대로 aggregate에 넘긴다. ③ 차단 없음: `transfer-tax-validate.ts:128-165` SINGLE_ONLY 목록에 `commercial_building`이 없다(주석 :117이 명시적으로

**처방**  `transfer-tax-aggregate.ts:244-252`의 교정 블록이 STEP 0.62 주입 결과도 반영하게 한다. 최소·단일지점 안: `runCommercialAppurtenantLandStep`이 판정 결과(nonBusinessRatio)를 result echo 필드로 노출하고(예: `commercialAppurtenantExcessDetail`), aggregate가 `nblOverride`와 같은 층위에서 `{isNonBusinessLand:true, nonBusinessLandAreaRatio}`를 `correctedItem`·`correctedSingleInput` 양쪽에 실어 `classifyRateGroup`(이미 result를 보고 있다)과 `assetTaxOf`(input을 본다)의 비대칭을 없앤다. ⛔ `properties[].appliedRate`를 groupTaxes 값으로 바꾸는 방향은 금지 — 비교과세(§104⑤)에서 자산별 참고값과 그룹값이 다른 것은 설계상 정상이라(타입 문서 :167) 진짜 원인을 가린다. 회귀 방어는 `bundled-swallows-special.test.ts`의 CB 케이스에 `commercialAppurtenantLand`를 넣은 대조군을 추가해 「CAL 유무로 일괄 총세액이 달라진다」를 단언하는 것이 판별력이 가장 높다(현재는 두 값이 같다).

### V8-b 🟠 `doc-drift` — transfer-tax-validate.ts:117-120 주석의 「상가는 계산 정상」 근거가 stale하고, 그것을 지키는 테스트도 세율 축을 보지 않는다

**위치** `lib/calc/transfer-tax-validate.ts:117` · **세액영향** 주석·테스트 자체는 세액을 만들지 않는다(영향 0). 그것이 통과시키는 결함의 수치는 V8-a·E6-01 참조 — 재현 시나리오에서 부수토지 초과분 중과가 전액 소실되어 총세액이 판정 유무와 동일(205,557,000).

**결함**  인용 file:line 정확(117-120 그대로). 주장 성립하되 **원인은 「처음부터 잘못된 축」이 아니라 시간적 드리프트**다 — 이 점을 정정해 둔다. 주석과 테스트는 `7a8c1c48`(2026-07-28)에 함께 작성됐고, 당시 문제의식은 「route if-체인이 일괄 분기를 먼저 잡아 특수 분기가 미실행 → 다른 계산이 나온다」였다. 그 실패 모드에서는 양도차익 대조가 타당한 축이었다. 그런데 상업용건물 부수토지 초과분 중과가 `9a6084ec`(2026-08-05, 엔진 STEP 0.62)·`7463f2b0`(같은 날 UI·API)로 **일주일 뒤에** 들어오면서 갈리는 축이 gain이 아니라 **세율**로 바뀌었고, 주석도 테스트도 갱신되지 않았다. 현재 상태 기준으로는 주장 그대로다: (1) :118 「실측 결과 양도차익이 단건과 동일하고 필요경비도 음수가 아니다(**계산 정상**)」는 CAL 입력에서 거짓이다(V8-a 재현 — 중과가 통째로 사라진다). (2) :119 「자산별 상세 카드가 안 실리는 **표시 갭**일 뿐」도 이미 stale하다 — R1-a `pickValuationDetails` 도입 후 지목된 테스트 자신이 `expect(r.inBundled).toBe(true)`로 **반대**를 단언한다(:301). (3) :120이 회귀 방어로 지목한 `__tests__/api/transfer.route.bundled-swallows-special.test.ts`의 상가 케이스는 `commercialAppurtenantLand`가 없는 fixture(:211-223)에 `transferGain` 동일성·`necessaryExpense>=0`만 단언(:296-303)하므로 세율·세액 축 divergence를 **구조적으로** 잡을 수 없다. ⇒ 「차단하지 않는다」는 현행 결정을 떠받치는 근거와 그 근거를 지키는 회귀선이 **둘 다 현재 결함을 볼 수 없는 축에 서 있다**는 메타 결함은 사실이다.

**실측**  코드·이력 직접 확인 + V8-a probe 재사용.
1) `grep -n "" lib/calc/transfer-tax-validate.ts | sed -n '110,128p'` → :117-120 주석 원문이 인용과 일치. SINGLE_ONLY 목록(:128-165)에 commercial_building 없음 확인.
2) `sed -n '205,303p' __tests__/api/transfer.route.bundled-swallows-special.test.ts` → CB fixture에 commercialAppurtenantLand 없음, 단언은 `expect(bp.transferGain).toBe(sb.data.result.transferGain)` + `expect(bp.necessaryExpense).toBeGreaterThanOrEqual(0)` + `expect(r.inBundled).toBe(true)`. 세율/세액 단언 0건.
3) `git log --diff-filter=A --format="%h %ad %s" --date=short -- components/calc/transfer/CommercialAppurtenantLandSection.tsx` → 7463f2b0 2026-08-05 (UI). `git log -1 -S commercialAppurtenantLand -- lib/tax-engine/transfer-tax-judgment-steps.ts` → 9a6084ec 2026-08-05 (엔진 STEP 0.62). `git log -1 -L 117,120:lib/calc/transfer-tax-validate.ts` → 7a8c1c48 2026-07-28 (주석·테스트 생성). ⇒ 주석이 8일 먼저 쓰였고 이후 미갱신.
4) 축이 갈리는 것을 실측: scratchpad/p3.ts에서 CAL=true/false의 `transferGain`은 두 경우 모두 동일 계열이고 `necessaryExpense`도 음수가 아니지만, group

**법령**  이 항목은 법령 해석이 아니라 저장소 내부의 판정 근거·회귀선 정합성 주장이므로 조문 대조 대상이 없다. 배경 조문(「소득세법」 §104①8호 = 기본세율 +10%p)은 V8-a에서 KoreanLaw get_law_text(mst=280405, jo=제104조)로 본문 확인했다.

**도달성**  이 주석은 차단 여부를 가르는 **살아 있는 판정 근거**다 — 상가가 SINGLE_ONLY에 없어 함께양도로 그대로 흘러가고, V8-a에서 확인했듯 그 경로가 실제로 중과를 잃는다. 즉 stale한 근거가 실 결함을 그대로 통과시키고 있다. 후속 작업자가 이 주석을 읽고 「상가는 검증됐다」고 판단할 위험이 재발 축의 핵심이다.

**처방**  (1) :117-120 주석에서 「계산 정상」·「표시 갭일 뿐」 단정을 삭제하고, 2026-08-05 이후 CB 부수토지 초과분 경로에서 세율 축 divergence가 실재함을 기재한다(V8-a 미해소 상태면 「미해소」 명시). (2) 회귀선을 세율·세액 축으로 옮긴다 — 가장 판별력 높은 단언은 `commercialAppurtenantLand` 유무만 다른 두 일괄 요청의 **총세액이 달라야 한다**는 것이다(현재는 같다 → V8-a 수정 전 red / 수정 후 green). gain 동일성 단언은 그대로 두되 그것만으로 「계산 정상」을 결론짓지 않게 주석을 붙인다. (3) 파생 규칙: 엔진에 새 STEP(특히 세율·중과에 개입하는 STEP)을 추가할 때 「일괄 경로에서 그 STEP의 주입이 correctedSingleInput에 반영되는가」를 점검 항목으로 둔다 — 이 결함의 진짜 재발 축이다.

### V9-c 🟠 `plumbing` — newConstruction도 같은 조용한 강등 — 그러나 land에서 ⑧을 건너뛰는 조기 return은 carryover_gift·newConstruction 둘뿐이다

**위치** `lib/calc/transfer-tax-validate-asset.ts:317` · **세액영향** 도달 시 V9-a와 동일 — 과표 × 10%p 과대.

**결함**  「newConstruction 등 다른 조기 return 취득원인도 같다」는 맞다. `validateAssetAcquisition`(:113~:352)의 조기 return을 전수 확인한 결과, ⑧ NBL 검증(:352)에 도달하지 않게 만드는 지점은 8곳이나 그중 assetKind==="land"에서 성립하는 것은 **carryover_gift(:219→:307)와 newConstruction(:317→:345) 둘뿐**이다. 나머지는 assetKind로 이미 배제된다 — commercial_building 상속(:170)·commercial 환산(:182)·general_building(:186)·successor right(:203)·redevelopment_apt/right_to_move_in(:214). `isMixedUseHouse === true`(:312)도 ⑧을 건너뛰지만 겸용주택은 land 자산의 UI 경로가 아니다(실측: land+isMixedUseHouse는 겸용 전용 검증에서 별도 오류로 차단). :123~:161의 6개(conversion·burdened gift·§164 부분입력·§164⑧·E-1·post-deemed)는 오류일 때만 return하므로 침묵 우회가 아니다. 다만 inheritance·gift는 조기 return이 없어 ⑧이 정상 작동한다(실측).

**실측**  npx tsx v9probe3.ts (land + isNonBusinessLand=true + nblUseDetailedJudgment=true + 지목/용도지역 미입력, 취득원인만 교체):
  [purchase (대조군)]  validate="자산1: 비사업용 토지 정밀판정을 선택했습니다. 지목을 선택하세요." | raw=undefined
  [inheritance]        validate="자산1: 상속개시일 평가액(상속세 신고가액)을 입력하세요."        | raw=undefined  ← 조기 return 없음, ⑧ 도달
  [gift]               validate="자산1: 비사업용 토지 정밀판정을 선택했습니다. 지목을 선택하세요." | raw=undefined
  [newConstruction]    validate=**null**                                                        | raw=undefined  ← 침묵 통과
  [isMixedUseHouse]    validate="자산1: 주택 연면적(㎡)을 입력하세요. ..."                       (겸용 전용 검증이 별도 차단)
  [successorRight]     validate="자산1: 조합원입주권 승계취득가액을 입력하세요. ..."             (assetKind≠land)

**법령**  V9-a와 동일(「소득세법」 §104①8호 · 같은 법 시행령 §168의14③). newConstruction 자체에 별도 조문 쟁점은 없다.

**도달성**  UI가 land 자산에도 「신축(자가건축)」 옵션을 그대로 노출하므로 형식적으로는 열려 있다(CompanionAcquisitionCauseSection.tsx:32). 다만 「토지를 신축으로 취득」은 실무상 비정상 입력이라 carryover_gift보다 도달 빈도가 훨씬 낮다 — 그래서 severity를 medium으로 낮춘다. 세액 영향은 도달 시 V9-a와 동일(과표×10%p).

**처방**  V9-a의 1순위 수정(⑧ 호출을 모든 조기 return 앞으로 이동)이 두 취득원인을 함께 닫는다. 취득원인별로 ⑧을 복제하지 말 것 — 새 조기 return이 추가되면 같은 갭이 재발한다.

### V10-e 🟠 `dead-code` — 컴패니언 자산 카드에 NBL 정밀판정 섹션이 렌더되도록 배선돼 있으나 게이트를 켤 입력이 없어 도달 불가(A2-01·U3-01의 뿌리)

**위치** `components/calc/transfer/asset-sections/AssetSectionExtras.tsx:23` · **세액영향** 직접 세액 영향 0원. 단, V10-a를 ⑬만 고쳐 게이트가 열리면 컴패니언 정밀판정 입력이 화면에 뜨면서 엔진에는 도달하지 않아, A3(「판정 도움 모드가 raw 게이트에서 탈락하면 정밀판정이 사라진 채 +10%p만 남는다」)와 같은 형태의 조용한 모드 강등이 컴패니언에서 재현될 수 있다.

**결함**  컴패니언 카드는 NBL 정밀판정 UI를 이미 갖고 있다 — `CompanionAssetCard.tsx:426`이 `AssetSectionExtras`를 렌더하고, `AssetSectionExtras.tsx:23`이 `asset.assetKind === "land" && asset.isNonBusinessLand && asset.nblUseDetailedJudgment`일 때 `NblSectionContainer`를 띄운다. 그런데 `isNonBusinessLand`를 컴패니언에서 true로 만들 수 있는 쓰기 지점이 저장소에 0건이라 이 섹션은 **영원히 렌더되지 않는다**. A2-01·U3-01(공익수용 프리필이 컴패니언에서 복구 불가)이 바로 이 지점의 파생이다 — `TransferModeBlock.tsx:92-94`가 컴패니언 land 자산에 공익수용을 선택하면 `nblUseDetailedJudgment: true`·`nblExemptPublicExpropriation: true`를 프리필하지만, 게이트는 두 플래그의 **AND**라 `isNonBusinessLand`가 false인 한 섹션이 뜨지 않는다 ⇒ 사용자는 프리필된 상태를 화면에서 보지도, 되돌리지도 못한다. 게다가 가정적으로 게이트가 열려 nbl* 필드가 채워지더라도 ④ `buildNonBusinessLandRaw`는 primary 전용 호출뿐이라(transfer-tax-api.ts:76 · multi-transfer-tax-api.ts:36) 그 입력은 다시 조용히 사라진다 — 즉 V10-a를 ⑬ 한 줄로만 고치면 이 dead UI가 활성화되면서 「화면에는 정밀판정 입력이 뜨는데 엔진에는 raw가 안 간다」는 새 드리프트가 생긴다.

**실측**  코드 경로 추적으로 확정(실행 probe 없음 — 게이트가 구조적으로 열리지 않아 재현 대상이 성립하지 않는다). `grep -rn "isNonBusinessLand" app/ components/ lib/stores/ lib/storage/ hooks/` 전수: 쓰기는 `SpecialSituationSection.tsx:137`(primary patch), `Step4.tsx:348`(assetKind 전환 시 index 0만 false로 되돌림), `calc-wizard-migration.ts:140`(primaryAsset), 팩토리 기본값 `false` 2곳뿐. 컴패니언(i>0) 쓰기 0건. `TransferModeBlock.tsx:92-94`는 `nblUseDetailedJudgment`·`nblExemptPublicExpropriation`만 세팅하고 `isNonBusinessLand`는 건드리지 않음(:84-100 정독).

**법령**  해당 없음(UI 도달성 — 법령 쟁점 아님). 프리필이 겨냥하는 무조건 사업용 의제 자체는 「소득세법 시행령」 §168의14③ 계열로 별도 축이며 이번에 본문 재조회는 하지 않았다.

**도달성**  도달 불가(dead). 세액 오류를 직접 만들지는 않으나, 공익수용 컴패니언 토지에서 사용자가 프리필 상태를 인지·수정할 수 없는 상태를 고착시킨다.

**처방**  V10-a의 ⑤ 수정(컴패니언 land 카드에 NBL 토글 노출)과 **같은 PR에서** 처리한다. 정밀판정까지 열 계획이 아니라면 컴패니언 카드에서는 `nblUseDetailedJudgment` 라디오를 숨기고 간편(boolean) 모드만 노출해 ④ raw 미전송과 화면을 일치시킬 것. 열 계획이라면 ④ `buildNonBusinessLandRaw`를 컴패니언에도 호출하고 ⑫에 `nonBusinessLandRaw` 칸을 추가하는 작업이 함께 가야 한다(한 곳만 열면 다시 침묵 소실 — 저장소가 분양권 축에서 이미 겪은 실패).

### COV-1 🟠 `plumbing` — DB/시드로 주입되는 NBL 판정 규칙이 optional 3개 그룹을 통째로 떨어뜨려, 2015.2.2 이전 양도 농·임·목 레거시 임계(0.8)가 프로덕션 경로에서 절대 적용되지 않는다

**위치** `lib/tax-engine/schemas/rate-table.schema.ts:337` · **세액영향** 판정 자체가 사업용↔비사업용으로 뒤집힌다 ⇒ 해당 자산 산출세액에 기본세율 대비 +10%p 전부(과세표준 12.455억 기준 실측 124,550,000원 규모)와 §104⑤ 비교과세 그룹 소속이 함께 바뀐다. 단, 2015.2.2 이전 양도 농·임·목에 한정.

**결함**  `nonBusinessLandJudgmentSchema`(rate-table.schema.ts:337-357)는 `type`·`buildingAreaMultipliers`·`farmlandDistanceKm`·`exemptionPeriods` 4키만 정의한다. 반면 엔진 타입 `NonBusinessLandJudgmentRules`(non-business-land/types.ts:497-549)는 `urbanIncorporationGrace`·`unconditionalExemptionDates`·`periodCriteriaThresholds` 3개 optional 그룹을 더 갖고, `DEFAULT_NON_BUSINESS_LAND_RULES`(types.ts:551-)가 그 값을 채운다. 프로덕션 경로는 `parseRatesFromMap`(transfer-tax-helpers.ts:148-151)이 DB/시드 레코드를 파싱해 `parsedRates.nonBusinessLandJudgmentRules`로 만들고, `runNonBusinessLandStep`(transfer-tax-judgment-steps.ts:92)이 그것을 `judgeNonBusinessLand`에 넘긴다. 값이 `undefined`가 아니라 **객체이되 3그룹이 없는 객체**이므로 engine.ts:40의 기본 인자가 발동하지 않는다. 결과적으로 `getThresholdRatio`(period-criteria.ts:115-116 `const t = rules.periodCriteriaThresholds; if (!t) return 0.6;`)가 항상 0.6을 반환해, 2015.2.2 이전 양도 농·임·목의 레거시 임계 0.8(비사업용 임계 0.2)이 **API 경로에서 도달 불가**하다. `urbanIncorporationGrace`·`unconditionalExemptionDates`는 하드코딩 fallback이 DEFAULT와 동일하거나(period-criteria.ts:331-335) 아예 읽히지 않아 무해하다 — 살아 있는 격차는 `periodCriteriaThresholds` 하나다. 즉 「DB로 임계를 토글한다」는 설계 의도(docs/releases/2026-04-21-non-business-land-v2.md:22)가 스키마 미반영으로 반쪽만 구현됐다.

**실측**  probe1 `npx tsx` — `parseNonBusinessLandJudgment(transferTaxSeeds[…non_business_land_judgment].special_rules)` → keys = ['type','buildingAreaMultipliers','farmlandDistanceKm','exemptionPeriods'], periodCriteriaThresholds=undefined. `getThresholdRatio(new Date('2015-02-01'),'farmland', …)` → DEFAULT 규칙 **0.8** vs DB(시드) 규칙 **0.6**.
probe2 — `meetsPeriodCriteria([{2005-02-01~2012-02-01}], 2005-02-01, 2015-02-01, 'farmland', rules)`:
  DEFAULT → meets=false(**비사업용**), thresholdRatio 0.8, ratio 0.6998
  DB(시드) → meets=true(**사업용**), thresholdRatio 0.6, criteriaUsed='ratio'
⇒ 같은 사실관계에서 판정이 뒤집힌다.
probe3(도달성) — `parseRatesFromMap(loadFallbackTransferRates(new Date('2015-02-01')))` → `nonBusinessLandJudgmentRules` 존재, `periodCriteriaThresholds/urbanIncorporationGrace/unconditionalExemptionDates` 전부 undefined. 즉 Supabase 없이 도는 fallback 경로도 동일.

**법령**  「소득세법 시행령」 §168의6 **현행 본문 확인(KoreanLaw, lawId 003956, 시행 2026-07-01)**: 1호 다목·2호 다목·3호 나목 모두 「토지의 소유기간의 **100분의 40**에 상당하는 기간을 초과하는 기간」 — 지목 구분 없음. ⇒ 현행분(0.6=사업용 60%)은 조문과 일치. **개정 전(2015.2.3. 이전 시행) 본문의 「100분의 20」 여부는 미확인** — KoreanLaw `get_law_text`에 `efYd=20140101`을 lawId·mst 양쪽으로 걸었으나 NOT_FOUND/EXTERNAL_API_ERROR로 과거 시행본을 받지 못했다. 따라서 레거시 0.8이 **법적으로 옳은지**는 미확인이며, 그 판단에 따라 이 결함의 방향(과소과세 vs 무해)이 갈린다. 코드가 스스로 0.8을 옳다고 선언해 놓고(period-criteria.ts:22 주석·types.ts:541-543) 프로덕션에서 못 쓰는 자기모순이라는 점은 법령과 무관하게 성립한다.

**도달성**  도달 가능. `/api/calc/transfer`·`/multi` → `preloadTaxRates` 또는 `loadFallbackTransferRates` → `parseRatesFromMap` → `runNonBusinessLandStep`이 유일한 프로덕션 경로이고 세 경로 모두 시드 레코드 9(transfer-rate-seed.ts:503-530)를 태운다. 양도일은 마법사에서 임의 과거일자 입력이 가능하고 historical seed(2015 이전)도 존재하므로 2015.2.2 이전 양도 + 지목 농지/임야/목장 조합이 UI에서 막히지 않는다. 다만 실무 사용 대부분이 최근 양도분이라 노출 빈도는 낮다.

**처방**  ① `nonBusinessLandJudgmentSchema`에 `urbanIncorporationGrace`·`unconditionalExemptionDates`·`periodCriteriaThresholds`를 `.optional()`로 추가하고 시드 레코드 9에 `DEFAULT_NON_BUSINESS_LAND_RULES`와 동일한 값을 실어 단일 소스를 회복하거나, ② 반대로 `parseRatesFromMap`에서 `{ ...DEFAULT_NON_BUSINESS_LAND_RULES, ...parsed }`로 병합해 DB가 덮지 않은 그룹은 코드 기본값이 살아남게 한다. 어느 쪽이든 **DB-파싱 규칙을 인자로 넘기는 anchor**(2015-02-01 농지)를 먼저 추가할 것. ⚠️ 0.8 적용 여부 자체는 개정 전 §168의6 본문을 확인한 뒤 결정 — 확인 전 numeric 변경 금지.

### COV-2 🟠 `plumbing` — 시드에서 `surcharge.non_business_land`가 사라지면 +10%p가 경고 0으로 조용히 증발하는데, 이를 잡는 테스트가 한 건도 없다 (안전망 0)

**위치** `lib/tax-engine/transfer-tax-rate-calc.ts:352` · **세액영향** 실측 −124,550,000원(과세표준 1,245,500,000 기준, 0.55→0.45). 일반화하면 과세표준 × 10%p 전액 과소과세.

**결함**  중과 게이트는 `if (input.isNonBusinessLand && surchargeRates.non_business_land)`(rate-calc.ts:352)이고, `surchargeRateSchema.non_business_land`는 `.optional()`(rate-table.schema.ts:144-148)이다. 즉 `surcharge:_default` 레코드가 있기만 하면 `non_business_land` 키가 없어도 파싱은 성공하고, 중과 분기 전체가 조용히 건너뛰어진다 — throw도 warning도 step도 남지 않는다. 그런데 이 키의 존재를 실제 시드/fallback 맵에서 단언하는 테스트가 저장소에 없다: 엔진 테스트 전부가 `__tests__/tax-engine/_helpers/mock-rates.ts`(:94, :216)에 키를 하드코딩한 자체 mock을 쓰고, 실제 시드를 태우는 유일한 테스트 `__tests__/db/transfer-rate-fallback.test.ts`는 `parseRatesFromMap`이 throw하지 않는지·progressive bracket·totalTax가 number인지만 본다(:20,:26-29,:51-53). 이번 리뷰가 정독한 파일 목록에 `transfer-rate-seed.ts`·`rate-table.schema.ts`·`transfer-tax-helpers.ts`가 없어 이 축은 통째로 미검사였다.

**실측**  probe9 `npx tsx` — 실제 fallback 맵에서 `surcharge:_default`의 rate_table에서 `non_business_land` 키만 제거한 뮤테이션 맵을 만들어 동일 입력(토지, 양도 2026-02-18, 취득 2015-02-03, 양도가 20억, 취득가 4억, isNonBusinessLand=true)으로 `calculateTransferTax` 실행:
  정상 시드      → calculatedTax 619,085,000 · appliedRate 0.55 · surchargeType 'non_business_land' · warnings 0
  키 제거(뮤테이션) → calculatedTax 494,535,000 · appliedRate 0.45 · surchargeType undefined · **warnings 0**
차액 −124,550,000, 예외·경고·step 흔적 전무.

**법령**  「소득세법」 §104①8호(비사업용 토지 = 기본세율 + 10%p)가 중과의 근거이며, 이 값은 코드가 아니라 DB `tax_rates` jsonb에 산다. 조문 본문 자체는 이번 항목의 쟁점이 아니라 별도 조회하지 않았다 — 쟁점은 「법정 가산율이 데이터에 있고, 그 데이터가 사라져도 아무도 모른다」는 안전망 부재다.

**도달성**  직접 도달은 코드 변경이 아니라 데이터 회귀로 발생한다: (a) `scripts/seed-transfer-tax-rates.ts`가 새 `surcharge:_default` 레코드를 더 늦은 effective_date로 시딩하면서 키를 빠뜨리는 경우, (b) Supabase에서 레코드를 손으로 수정한 경우. `preload_tax_rates()`의 `DISTINCT ON … effective_date DESC` 의미론상 **가장 최근 1건만** 이기므로 한 건만 잘못 들어가도 전량 영향이다. 코드만 보면 재현 불가 = 잠재 결함.

**처방**  `__tests__/db/transfer-rate-fallback.test.ts`에 「실제 fallback 맵의 `parseRatesFromMap(...).surchargeRates.non_business_land.additionalRate === 0.10`」 단언 1줄과, 「isNonBusinessLand=true인 입력이 실제 시드로 `surchargeType === 'non_business_land'`를 낸다」는 통합 anchor 1건을 추가. multi_house_2/3plus·unregistered도 같은 구조라 함께 고정하는 것이 비용 대비 효율적이다.

### COV-3 🟠 `dead-code` — NBL E2E 8건 중 중과세액(+10%p)을 단언하는 spec이 0건 — academy-land spec은 기대값 10줄을 주석에 적어두고 `not.toBe("")` 3건만 단언하는 캡처 하네스다

**위치** `e2e/transfer-nbl-academy-land.spec.ts:194` · **세액영향** 직접 세액 영향 없음. 다만 COV-1·COV-2를 포함한 이번 리뷰 확정 결함들이 E2E에 안 걸린 이유가 바로 이것이다 — E2E는 값을 보지 않는다.

**결함**  NBL E2E 8개 spec(총 1,146줄)을 전수 정독한 결과, **비사업용 판정이 실제 세액에 +10%p로 반영됐는지 단언하는 spec은 하나도 없다**. 파일별 실제 단언 강도: (1) `transfer-nbl-academy-land.spec.ts` — 헤더에 환산취득가액 1,426,172,617·장특공 170,347,479·산출세액 132,050,981 등 10개 기대값을 적어 놓고 전부 `console.log`로만 출력, 실제 `expect`는 :194-196의 `not.toBe("")` 3건뿐이며 사례 자체도 NBL **OFF**(사업용)다. 값이 전부 0으로 바뀌어도 통과한다. (2) `transfer-nbl-factory-land.spec.ts` — `nbl-factory-preview-standard`/`-excess` 등 **UI 미리보기 testid**만 단언(:107-113 등). 미리보기는 `computeFactoryStandardArea` 순수함수를 직접 부르므로, 그 값이 raw→Zod→route→엔진으로 도달하는지는 관측하지 않는다(리뷰 대상 축인 ⑫⑬⑭를 우회). (3) `transfer-nbl-residence-30km-ui.spec.ts`(62줄) — 렌더 가시성 3건. (4) `transfer-nbl-revenue-autofetch.spec.ts`(77줄) — 위젯 노출 8건, 계산 미실행. (5) `transfer-nbl-revenue-deemed-common.spec.ts` — request body 필드 도달을 `toBeTruthy()`/`toContain("365")`로 확인(값 대조 아님) + 결과 카드 문구 2건. (6) `transfer-nbl-unconditional-exemption.spec.ts` — 가장 강함(클래스 토글 + POST 200 + 문구), 그러나 세액 무단언. (7) `transfer-multi-nbl-business-recalc.spec.ts` — 배지 부재(`toHaveCount(0)`)라는 **음성 단언**만. (8) `general-building-nbl-section-in-basic.spec.ts` — 가시성·미리보기 문구 + `res.ok()`. ⇒ 엔진 중과 분기·§104① 후단 비교·면적안분 ratio가 UI→API→엔진 전 구간에서 깨져도 E2E는 전부 초록이다.

**실측**  코드 정독으로 확정(E2E 실행 불필요 — 단언문 자체가 증거). `grep -n "expect(" e2e/transfer-nbl-academy-land.spec.ts` → 194·195·196 세 줄, 모두 `not.toBe("")`. `grep -n "expect(" e2e/general-building-nbl-section-in-basic.spec.ts` → 전부 `toBeVisible`/`toHaveCount`/`res.ok()`. 8개 spec 어디에도 세액 금액 문자열이나 `55%`·`+10%p` 류의 단언이 없다.

**법령**  해당 없음(테스트 커버리지 항목). NBL 중과의 근거인 「소득세법」 §104①8호 자체는 엔진 단위 테스트가 mock 세율로 고정하고 있다.

**도달성**  해당 없음 — 결함이 아니라 검증 부재다. 다만 CLAUDE.md가 기록한 선례(PR#1008이 `toContainText("0")` substring 매칭으로 spec을 조용히 무력화)와 같은 층위의 위험이며, NBL은 그보다 한 단계 약하다(애초에 값을 안 본다).

**처방**  ① `transfer-nbl-academy-land.spec.ts`를 캡처 하네스임을 파일명·주석에 명시하거나(예: `*.capture.spec.ts` + `test.describe.skip` 해제 조건), 헤더 기대값을 `expect(...).toContainText(...)`로 승격. 후자를 택하면 「엔진은 단계별 floor로 최대 1원 작다」는 헤더 문구대로 1원 tolerance 규약을 명시할 것. ② **NBL 중과 세액 단언 spec 1건 신설**: 단순토지 + 정밀판정 비사업용 확정 → 결과 화면 산출세액이 동일 입력의 사업용 대비 정확히 `과세표준 × 10%` 더 큰지 단언. 이 1건이 UI 토글·raw 전송·Zod·route·엔진 게이트(rate-calc.ts:352)를 한 번에 잠근다. ③ factory-land spec에 미리보기 단언 뒤 「계산 실행 → 결과 판정 카드에 초과면적 비율이 그대로 실렸는지」를 덧붙여 미리보기↔엔진 이중진실을 차단.

### H-3 🟠 `legal-accuracy` — 2016.1.1~2016.12.31 양도분 §95④ 단서(2016.1.1 기산) 미구현 — 2016.1.1 이전 취득 비사토에 취득일 기산 공제율이 붙는다

**위치** `lib/tax-engine/transfer-tax-lthd-start.ts:13` · **세액영향** 양도 2016-06-01·취득 2004-01-01·양도차익 400,000,000 기준(실측): 현행 총세액 137,885,000 → 단서 적용 시 190,685,000. **52,800,000원 과소과세**(국세 48,000,000 + 지방소득세 4,800,000). ※ 이 구간의 세율 축(§104①8호 +10%p)은 현행 엔진 그대로 두고 LTHD만 바꿔 잰 값이다.

**결함**  법률 제13558호(2016.1.1 시행)는 비사업용 토지를 §95② 배제에서 풀면서 §95④ 단서에 「제104조의3에 따른 비사업용 토지로서 2016년 1월 1일 이전에 취득하여 보유하고 있는 자산인 경우에는 **2016년 1월 1일부터 기산**한다」를 함께 넣었고, 이 단서는 법률 제14389호(2017.1.1 시행)에서 삭제됐다. 즉 **양도일이 2016.1.1~2016.12.31**인 비사업용 토지는 장특공제 보유기간을 2016.1.1부터 세야 한다(2016년 양도라면 보유 1년 미만 ⇒ 3년 미달 ⇒ 공제율 0). `resolveLTHDStartDate`(`:13-40`)는 ① 승계조합원 신축APT 준공일, ② 주택→상가 용도변경일(다주택 배제기 한정) 두 분기만 두고 나머지는 `input.acquisitionDate`를 그대로 돌려주며, **비사업용 토지·양도연도 축이 없다**. H-2와 별개의 결함이다(H-2를 고쳐도 이 구간은 남는다).

**실측**  scratchpad/probe4.ts를 `npx tsx`로 실행. 입력: land·isNonBusinessLand=true·취득 2004-01-01·양도 2016-06-01·양도차익 400,000,000, 실세율 시드. 출력 `{"lthd":96000000,"rate":0.24,"base":301500000,"calc":125350000,"total":137885000}` — 보유 12년으로 세어 24%를 적용한다. 구 §95④ 단서대로면 기산일 2016-01-01, 보유 5개월 ⇒ 3년 미만 ⇒ 공제율 0·LTHD 0이어야 한다. 같은 엔진으로 과세표준 397,500,000을 재현한 등가 입력의 결과는 `calc 173,350,000 / total 190,685,000`.

**법령**  「소득세법」 제95조 제4항 단서 (시행 2016.1.1, 법률 제13558호, MST 177202) — 「…제104조의3에 따른 비사업용 토지로서 2016년 1월 1일 이전에 취득하여 보유하고 있는 자산인 경우에는 2016년 1월 1일부터 기산한다」. 시행 2017.1.1(법률 제14389호, MST 188354) 본문에서 해당 단서 소멸 — 두 시행본 §95④ 전문을 MCP로 직접 대조했다.

**도달성**  도달 가능. H-2와 같은 경로(양도일 하한 검증 없음 + 양도일 시점 세율 로딩). 다만 창(窓)이 2016년 1년으로 좁아 실무 빈도는 H-2보다 낮다.

**처방**  `resolveLTHDStartDate`에 「양도일이 2016-01-01 이상 2017-01-01 미만이고 `isNonBusinessLand`이며 취득일이 2016-01-01 이전이면 기산일을 2016-01-01로 이동」 분기를 추가한다. 이때 **세율 보유기간(§104②)은 옮기지 않는다** — probe4의 3행이 보여주듯 취득일 자체를 2016-01-01로 바꾸면 단기세율 50%가 잘못 발동한다(197,750,000 → 218,625,000). 기산일 이동은 LTHD 축 전용이어야 한다.

### V1-b 🟡 `doc-drift` — needsRedirect·redirectHint 소비 UI 0건 + 릴리스 문서가 없는 REDIRECT 배너를 산출물로 기재

**위치** `docs/releases/2026-04-21-non-business-land-v2.md:122` · **세액영향** 없음(0원). 문서·dead code 층위.

**결함**  두 사실 모두 확인했고, 실제 상태는 주장보다 한 단계 더 나아가 있다. ① `grep -rn "needsRedirect|redirectHint"` 전수 결과 소비 지점은 lib/tax-engine(생산부)과 __tests__뿐이고 components/·lib/calc/·app/ 은 0건이다. ② docs/releases/2026-04-21-non-business-land-v2.md:122가 「`components/calc/NonBusinessLandResultCard.tsx` REDIRECT 배너」를 Critical Files로 적고 있으나, 그 파일(347줄, 실재함)에 `redirect`·`재입력` 문자열은 없다 — `git log -S"redirect" -- components/calc/NonBusinessLandResultCard.tsx`가 0건이므로 그 배너는 **한 번도 존재한 적이 없다**(stale이 아니라 미구현 산출물 기재). ③ 추가 사실: `needsRedirect`는 소비자가 없는 정도가 아니라 **구조적으로 항상 false**다. REDIRECT를 내는 유일한 지점 villa-land.ts:81이 engine.ts:117-128에서 가로채여 judgeHousingLand 결과로 `catResult`가 통째로 교체되고, 그 결과에는 `action`이 없다 → assemble의 `needsRedirect = categoryResult?.action === "REDIRECT_TO_CATEGORY"`(engine.ts:219)가 항상 false. 실측에서도 3케이스 모두 needsRedirect=false · action=undefined였다. 즉 engine.ts:220의 `isNonBusinessLand = needsRedirect ? false : ...`와 :246 `redirectHint` 전파는 dead code다. ④ 따라서 E1-02의 처방(「REDIRECT 상태로 반환해 UI 재입력을 요구」)은 표시할 화면이 없다는 문제뿐 아니라 2026-04-25 P5-B 설계결정(자동 재분류)을 되돌리는 일이며, 그 결정은 engine.test.ts:111 · qa-land-type-flow.test.ts:343,373 · qa-integration.test.ts:300이 `needsRedirect === false`로 명시 고정하고 있다.

**실측**  grep -rn "needsRedirect\|redirectHint" --include=*.ts --include=*.tsx . (node_modules 제외) → lib/tax-engine/non-business-land/{engine.ts:219,220,244,246,262,263 · villa-land.ts:82 · types.ts:438,440,625}와 __tests__ 4파일만. components/·lib/calc/·app/ 0건.
grep -rn "redirect|재입력|배너" components/calc/NonBusinessLandResultCard.tsx → :50 「① 자연어 요약 배너」 주석 1건뿐(REDIRECT 무관).
git log -S"redirect" -- components/calc/NonBusinessLandResultCard.tsx → 출력 없음(그 파일 이력에 해당 문자열이 등장한 적 없음).
grep -n REDIRECT docs/releases/2026-04-21-non-business-land-v2.md → :32 :45 :47 :69 :89 :122. :122가 문제의 줄.
npx tsx probe(V1-a와 동일 스크립트) → 3케이스 전부 needsRedirect=false · action=undefined · redirectHint=undefined.

**법령**  해당 없음 — 문서·배선 드리프트로 법령 쟁점이 아니다(KoreanLaw 조회 불필요). 관련 실체 조문은 V1-a와 동일한 「소득세법」 제104조의3제1항제5호·제6호 및 같은 법 시행령 제168조의12·제168조의13이며, 이 항목의 판정에는 영향이 없다.

**도달성**  세액 영향 0(표시·문서 층위). 다만 E1-02의 처방 선택지를 좌우한다 — 「REDIRECT를 UI로 노출」 방향은 (a) 결과카드/입력화면에 배너를 신설하고 (b) engine.ts:117의 자동 재분류를 되돌려야 하며 (c) 위 4개 테스트의 needsRedirect=false 단언을 함께 바꿔야 한다. 반면 「별장 지목에서 정착면적을 입력받게 한다」 방향은 그 세 가지를 건드리지 않는다.

**처방**  릴리스 문서 :122의 「REDIRECT 배너」 항목을 삭제하거나 「미구현 — 2026-04-25 P5-B에서 엔진 내부 자동 재분류로 대체」로 정정한다. 코드 쪽은 별건으로, needsRedirect/redirectHint/action(types.ts:425-440,625 · engine.ts:219-220,244-246)이 항상 false/undefined인 dead path임을 명시하거나 제거를 검토한다 — 다만 CLAUDE.md의 Surgical Changes 원칙상 이번 리뷰 범위에서 삭제를 권하지는 않는다.

### V2-a 🟡 `ui-engine-drift` — 목장용지에서 「3. 재촌 판정」 UI 블록(소재지·거주이력·주민등록·직선거리)이 판정에 전혀 쓰이지 않는 입력을 요구한다

**위치** `components/calc/transfer/nbl/NblSectionContainer.tsx:170` · **세액영향** 0원. 재촌 입력 유무 3케이스의 calculatedTax 산출 전 단계인 isNonBusinessLand·businessUseDays·ratio가 모두 동일하므로 세액 차이가 발생할 경로 자체가 없다.

**결함**  주장은 3요소 모두 성립한다. (1) `lib/tax-engine/non-business-land/pasture.ts`(285줄) 전체에 `residence|Residence|landLocation|ownerLocation` 참조 0건 — grep exit 1. (2) `NblSectionContainer.tsx:169-190`이 `nblLandType === "farmland" || "forest" || "pasture"` 게이트로 토지 소재지 `SigunguSelect`(:178-186) + `ResidenceHistorySection`(:189)을 렌더한다. (3) `engine.ts:249-250`의 `residenceMatch` echo는 `farmland || forest`만 대상이라 목장은 요약조차 없다.

엔진 소비 지점 전수(grep `landLocation|residenceHistories|ownerProfile`, 테스트 제외)는 forest.ts:89-90 · farmland.ts:120-121 · engine.ts:251(echo) 3곳뿐이고 목장 경로는 없다. 즉 `nblLandSigunguCode`·`nblResidenceHistories`·직선거리는 목장 자산에서 form-mapper가 `landLocation`/`ownerProfile`로 매핑까지는 하지만 어느 판정 분기에도 도달하지 않는다.

**방향 확인(반대 가능성 배제)**: 법령이 목장에 재촌을 요구했다면 「엔진 누락」이 되지만, 본문 조회 결과 요구하지 않는다 ⇒ **엔진이 법령상 옳고 UI가 과잉**이라는 원 주장의 방향이 맞다. 세액 영향 0.

**추가로 확인한 부수 사실**: 그 소재지 FieldCard의 hint는 「재촌 판정 — 거주지와 동일/연접 시·군·구 또는 직선거리 30km 매칭에 사용됩니다」이고 배지가 `§168의8②·9²`(농지·임야 전용 조문)를 인용한다. 목장 사용자에게는 근거 조문 인용까지 부정확하게 표시된다.

**연혁(결함 아님, 참고)**: `docs/00-pm/nbl-gaps/gap-1.plan.md:159·210`이 「거주 이력 섹션이 농지·임야·목장에서만 노출되므로 토지 소재지도 동일 게이트(농지·임야·목장) 안에 배치」로 이 배치를 명시 결정했다. 다만 그 근거는 기존 거주이력 게이트를 따른 것이고 목장 재촌 요건의 법령 확인은 없다 ⇒ 「법령에도 맞는 설계 결정」(REFUTED 사유)에는 해당하지 않는다.

**실측**  `npx tsx <scratchpad>/v2probe.ts` (cwd=워크트리 루트). `mapAssetToNblInput` + `judgeNonBusinessLand` 실호출. 공통: 취득 2010-01-01·양도 2024-01-01·면적 10,000㎡·용도지역 agriculture_forest·`nblPastureIsLivestockOperator=true`·축산기간 전기간.

```
[M3-목장 재촌입력 없음]                    isNonBusinessLand=false | 도시지역 밖 + 축산업 영위 + 기준면적 이내 | residenceMatch=undefined
[M3-목장 재촌입력 있음(소재지11110+거주이력 전기간)] isNonBusinessLand=false | (동일) | residenceMatch=undefined
[M3-목장 재촌입력 있음(먼 지역 48170 거주·주민등록 없음)] isNonBusinessLand=false | (동일) | residenceMatch=undefined
```
세 케이스의 judgmentReason·businessUseDays(5112)·ratio(1)가 전부 동일 ⇒ 목장에서 재촌 입력은 판정·echo 어디에도 반영되지 않는다.

**대조군(같은 probe, 구별력 확인)** — 농지 `nblFarmingSelf=true`·자경 전기간에서 동일한 재촌 입력을 넣고 뺐을 때:
```
[대조2-농지 재촌 없음] isNonBusinessLand=true  | 사용기준 미충족 … | residenceMatch=undefined
[대조2-농지 재촌 있음] isNonBusinessLand=false | 도시지역 밖 농지 + 사용기준 충족 | residenceMatch={"matchType":"same"}
```
같은 입력이 농지에서는 판정을 뒤집는다 ⇒ probe의 구별력은 0이 아니며, 목장의 불변성은 「측정 실패」가 아니라 실제 미사용이다.

**법령**  「소득세법」 §104의3①3호 (KoreanLaw MST 280405, 시행 2026-01-01 본문 직접 조회): 「3. 목장용지로서 다음 각 목의 어느 하나에 해당하는 것. 다만, … 거주 또는 사업과 직접 관련이 있다고 인정할 만한 상당한 이유가 있는 목장용지로서 대통령령으로 정하는 것은 제외한다. 가. **축산업을 경영하는 자가 소유하는 목장용지**로서 … 기준면적을 초과하거나 … 도시지역에 있는 것 … 나. **축산업을 경영하지 아니하는 자가 소유하는 토지**」 — **소재지 거주(재촌) 문언 없음**.

대조: 같은 항 1호가목은 「소유자가 **농지 소재지에 거주**하지 아니하거나 자기가 경작하지 아니하는 농지」, 2호나목은 「**임야 소재지에 거주**하는 자가 소유한 임야」로 재촌을 명문화한다. 즉 재촌 요건은 농지·임야에만 있다.

「소득세법 시행령」 §168의10 (MST 286211, 시행 2026-07-01, ①~⑤ 전항 직접 조회): ①목장용지 정의(축사·부대시설·초지·사료포), ②단서 위임 4호(1호 상속 3년 이내 / 2호 종중 2005.12.31. 이전 취득 / 3호 지방세특례제한법 §22·§41·§50·§89 사회복지법인등·학교등·종교·정당 직접 사용 / 4호 그 밖에 재정경제부령), ③기준면적=별표 1의3, ④도시지역=녹지지역·개발제한구역 제외, ⑤기간=3년. **어느 항에도 재촌 요건 없음.**

②4호가 위임한 「재정경제부령」에 대응하는 목장용지 조항은 「소득세법 시행규칙」 §83의3(농지)·§83의4(그 밖의 토지) 본문 조회 결과 발견되지 않았다(즉 목장 재촌을 요구하는 

**도달성**  UI 도달 가능: 지목 Select에서 `pasture`를 고르면 `NblSectionContainer.tsx:170` 게이트가 참이 되어 재촌 블록 3종이 그대로 렌더된다(조건부 숨김 없음). 반대로 엔진 도달은 불가 — `landLocation`/`ownerProfile`이 목장 판정 분기 어디에도 읽히지 않는다.

⑧ 검증에는 없다: `lib/calc/transfer-tax-validate-nbl.ts`(92줄) 전체에 `pasture`·`Residence`·`Sigungu` 0건 ⇒ 목장에서 이 입력을 **강제**하지는 않으므로 「미입력 차단」 피해는 없다. 세액 영향 0, 실무 피해는 불필요 입력 요구 + 부정확한 조문 배지 표시에 그친다.

**처방**  `NblSectionContainer.tsx:170`의 게이트에서 `pasture`를 제거해 `farmland || forest`로 좁힌다(엔진 `engine.ts:250` residenceMatch 대상과 동일 축이 되어 단일 소스가 유지된다). 목장 사용자가 이미 입력해 둔 `nblLandSigunguCode`·`nblResidenceHistories`는 판정 무영향이므로 초기화 불필요 — 다만 저장소의 「UI display fallback ↔ API ↔ validate 3중 패턴」상 새 게이트를 도입하는 것이 아니라 표시만 줄이는 변경이라 ④·⑧ 동반 수정은 필요 없다. 소재지 hint의 `§168의8②·9²` 배지는 그대로 두면 된다(농지·임야에만 남으므로 정확해진다).

### V3-b 🟡 `legal-accuracy` — 상속 영농상속공제 재촌 자동검증이 일반구(행정구)를 「구」로 취급해 같은 시 안 거주를 탈락시킨다

**위치** `lib/calc/farming-residence-check.ts:129` · **세액영향** 세액 0원. 영향은 UI 안내 오표시에 한정된다(ResidenceCheckPreviewCard.tsx:79-81 rose 톤 + :111-116 「사용자 명시 통과 / 자동 30km 초과」 경고, FarmingDeductionDetailCard.tsx:86-92 결과 카드 echo).

**결함**  인용 코드는 실재한다(`if (residenceCode === assetCode) return "same_district";` — farming-residence-check.ts:129). 판정 단위로 쓰이는 코드는 일반구(행정구)를 별개 entry로 갖는다 — 유입 경로가 `extractSigunguCodeFromPnu`(lib/geo/pnu-sigungu.ts:28-31, PNU 앞 5자리 + "00000")이고, 인접 매트릭스 lib/geo/administrative-district-adjacency.json 도 256건 중 성남 수정/중원/분당을 4113100000·4113300000·4113500000으로 나눠 담는다(성남시 통합 코드 4113000000은 없다). 그러나 상증령 §16②1호나의 「구」는 괄호로 「자치구를 말한다」로 한정되므로, 일반시 산하 일반구는 「구」가 아니라 상위 「시」가 판정 단위다. 즉 같은 시 안 서로 다른 일반구는 1번 분기(same_district)로 충족되어야 하는데, 코드는 코드 불일치로 떨어뜨린 뒤 연접·30km에 의존한다. 다만 원 보고자가 「E2-02와 같은 결함」이라 한 것 중 **세액 영향은 없다** — 최종 met는 farming-residence-check.ts:238-239에서 사용자 boolean(`farming?.decedentResidenceMet === true`)을 그대로 쓰고, 공제 자격 판정도 inheritance-farming-deduction.ts:105·131이 그 사용자 boolean만 본다. autoMet·matchKind는 ResidenceCheckPreviewCard·FarmingDeductionDetailCard의 안내·echo 전용이다. 결과는 법령상 충족인 납세자에게 rose 톤 「fail」 + 「사용자 명시 통과 / 자동 30km 초과 — …명확화 권장」 경고를 띄우는 오안내다.

**실측**  npx tsx <scratchpad>/v3-probe.ts — 고양시 덕양구 거주(4128100000) + 고양시 일산서구 소재 농지(4128700000), 좌표 없음:
  엔진 경로(adjacency 주입) → { decedentMatchKind: 'fail', decedentAutoMet: false }
  대조 ①같은 일산서구 거주 → 'same_district' / true, ②성남 분당구 거주+수정구 농지(연접 O) → 'adjacent_district' / true.
npx tsx <scratchpad>/v3-probe2.ts — 창원시 마산합포구 진전면 농지(4812500000, 35.115/128.363) + 창원시 진해구 용원동 거주(4812900000, 35.092/128.830): 직선거리 42.56km, 마산합포구 adjacentCodes=['48127','48170','48730','48820'](진해 48129 미포함) → { decedentMatchKind: 'fail', decedentAutoMet: false, decedentMinDistanceKm: 42.56 }. **좌표를 다 넣어도 구제되지 않는다** — 같은 시 안인데 세 분기 모두 탈락.
범위 실측(node로 lib/korean-law/sigungu-codes.json 전수): 일반구 보유 시 13개·구 쌍 45개 중 **비연접 12쌍**(부천 소사↮오정, 고양 덕양↮일산서, 화성 만세↮병점·만세↮동탄·효행↮동탄, 청주 상당↮흥덕, 창원 의창↮마산합포·의창↮진해·성산↮마산합포·성산↮마산회원·마산합포↮진해·마산회원↮진해).

**법령**  KoreanLaw MCP get_law_text(mst=283637, jo="제16조") 직접 조회. §16②1호나: 「농지ㆍ초지ㆍ산림지(이하 이 조에서 "농지등"이라 한다)가 소재하는 시(특별자치시와 「제주특별자치도의 설치 및 국제자유도시 조성을 위한 특별법」 제10조제2항에 따른 행정시를 포함한다. 이하 이 조에서 같다)ㆍ군ㆍ구(자치구를 말한다. 이하 이 조에서 같다), 그와 연접한 시ㆍ군ㆍ구 또는 해당 농지등으로부터 직선거리 30킬로미터 이내(산림지의 경우에는 통상적으로 직접 경영할 수 있는 지역을 포함한다)에 거주하거나 …」. §16③1호나가 상속인에 대해 「제2항제1호나목에서 규정하는 지역에 거주할 것」으로 같은 정의를 준용한다. 「자치구를 말한다」 괄호가 일반구를 「구」에서 배제하므로, 성남시 분당구·고양시 덕양구·창원시 진해구 등 일반시 산하 일반구는 상위 「시」 단위로 판정된다.

**도달성**  도달 가능. 코드 유입 경로 실재 — FarmingEligibilitySection.tsx:616-638 ResidenceAddressField(Vworld 주소검색) → 같은 파일 :45-99 onChange → extractSigunguCodeFromPnu(v.pnu) → decedentResidenceSigunguCode/heirResidenceSigunguCode. 자산 쪽은 EstateBodyRealEstate.tsx:185-201 → EstateBodyHelpers.ts:97-99 estateSigunguCode. 상류 Zod(lib/validators/property-valuation-input.ts:331 · estate-item-schema.ts:124)는 z.string().optional()로 코드 형태를 제한하지 않는다. 다만 **소비처가 안내·echo뿐**이라 세액에는 도달하지 않는다.

**처방**  코드 비교 전에 「자치구인지」를 판정해 일반구는 상위 시 단위로 접어서 비교하는 leaf를 만들고 farming-residence-check.ts:129와 non-business-land/residence.ts:53이 **같은 leaf를 공유**하게 한다(residence.ts:64 주석이 이미 미러 관계를 명시). 판정 데이터는 이미 있다 — lib/geo/sigungu-code-list.ts:33 의 kind="general_district", 또는 계획서 docs/00-pm/inheritance-farming-build-scripts-prefab.plan.md:182·233 의 규칙 「code[5:7] != "00" → 일반구」. 이름 축약은 lib/utils/derive-sigungu.ts:26 resolvePropertyTaxJurisdiction 이 이미 「성남시 수정구 → 성남시」를 하고 있으나 그건 명칭 축이고 코드 축 leaf는 없다. 연접 매트릭스도 함께 시 단위로 접어야 한다(접지 않으면 「고양시와 연접한 시·군·구」가 덕양/일산동/일산서 셋으로 쪼개진 채 남는다).

### V3-d 🟡 `ui-engine-drift` — 영농상속 재촌 미리보기 카드가 연접 매트릭스를 주입받지 못해 결과 카드 echo와 정반대 결론을 낸다

**위치** `components/calc/inheritance/FarmingEligibilitySection.tsx:170` · **세액영향** 세액 0원. 사용자 안내 모순만 발생한다.

**결함**  V3-b를 재현하다 발견했다. 같은 함수를 두 곳이 호출하는데 옵션이 다르다 — 엔진은 lib/tax-engine/deductions/inheritance-farming-deduction.ts:259에서 `{ adjacentSigunguCodes: getAdjacentSigunguCodes }`를 주입하는 반면, UI 미리보기 FarmingEligibilitySection.tsx:170은 `checkFarmingResidenceCompliance(estateItems, farming)`로 **옵션 없이** 부른다. farming-residence-check.ts:218의 기본값 `options.adjacentSigunguCodes ?? (() => [])` 때문에 UI에서는 adjacent_district 분기가 통째로 죽는다. 매트릭스는 이미 채워져 있다(lib/geo/administrative-district-adjacency.ts:52 MATRIX_VERSION="2026-07-31", 256 시·군·구·654 관계). 결과적으로 같은 입력에 대해 입력 화면은 rose 톤 「fail」을, 결과 화면은 「연접 시·군·구」 충족을 표시한다. 덧붙여 ResidenceCheckPreviewCard.tsx:107의 고정 문구 「※ 연접 시·군·구 매트릭스는 Phase 1 데이터 주입 후 활성」도 매트릭스가 채워진 지금은 stale이다.

**실측**  npx tsx <scratchpad>/v3-probe3.ts — 성남시 수정구 소재 농지(estateSigunguCode 4113100000) + 성남시 분당구 거주(4113500000), 좌표 없음:
  UI 미리보기 경로 checkFarmingResidenceCompliance(items, farming)            → matchKind='fail',             autoMet=false
  엔진 echo 경로   checkFarmingResidenceCompliance(items, farming, {adjacent}) → matchKind='adjacent_district', autoMet=true
같은 입력·같은 세션에서 두 화면이 반대 결론.

**법령**  상증령 §16②1호나 「…그와 연접한 시ㆍ군ㆍ구 …에 거주할 것」(KoreanLaw MCP get_law_text(mst=283637, jo="제16조") 직접 조회). 연접 분기는 법령상 실재하는 OR 조건이므로 UI에서 비활성인 것은 법령 반영 누락이다. (다만 성남 수정↔분당은 V3-c의 법리대로라면 애초에 「같은 성남시」로 1호 분기 충족이 정확하다 — 이 항목은 그와 별개로 UI/엔진 옵션 불일치 자체를 지적한다.)

**도달성**  도달 가능. FarmingEligibilitySection은 상속세 마법사 영농상속공제 섹션의 정상 경로이고, ResidenceCheckPreviewCard가 이 결과를 그대로 렌더한다(ResidenceCheckPreviewCard.tsx:59-64·79-81·111-137). 세액에는 도달하지 않는다(met는 사용자 boolean).

**처방**  FarmingEligibilitySection.tsx:170을 엔진과 동일하게 `checkFarmingResidenceCompliance(estateItems, farming, { adjacentSigunguCodes: getAdjacentSigunguCodes })`로 맞춘다(lib/geo/administrative-district-adjacency에서 import). 함께 ResidenceCheckPreviewCard.tsx:107의 「Phase 1 데이터 주입 후 활성」 문구를 정정한다.

### V4-a 🟡 `doc-drift` — livestock-standards.ts 헤더 주석이 폐기된 max 산식을 「현행 정정」으로 서술 — 구현(보유 시설 합산)과 정반대

**위치** `lib/tax-engine/non-business-land/data/livestock-standards.ts:12` · **세액영향** 0원. 주석 전용. (되돌림이 발생할 경우에만: 한우 사육 1두당 기준면적 7,512.5㎡ → 5,012.5㎡, −33.3%. 10두 목장이면 75,125㎡ → 50,125㎡로 25,000㎡가 초과분이 되어 그만큼 비사업용 안분 → 기본세율 +10%p·장특공제 배제.)

**결함**  주장은 사실이다. `lib/tax-engine/non-business-land/data/livestock-standards.ts:12-15` 헤더는 「🔴 2026-08-06 산식 정정 — 「초지 또는 사료포」를 문언대로 max로 읽는다. 종전에는 넷을 모두 합산했다(한우 사육 1두 7,512.5㎡ → 5,012.5㎡)」라고 적혀 있으나, 이 파일은 정본(`lib/tax-engine/livestock-standard-area.ts`)을 **재수출만** 하며 정본 `perUnitStandardArea`(:98-106)는 max가 아니라 **보유한 시설분 합산**이다. 정본 파일의 헤더(:26-37)는 정반대로 「접속사가 산식을 정하는 것이 아니라 실제 보유 여부가 정한다」고 명시한다 — 같은 저장소의 두 헤더가 서로 모순한다. git 이력이 경위를 확정한다: `a5b15073`(max 정정)이 이 주석을 넣었고, 그 뒤 `a194dcda`(「보유한 시설만 더한다 — 고정 산식 2회 오류 정정」)가 산식을 3차 결론으로 바꾸면서 **livestock-standards.ts는 아예 건드리지 않았다**(`git show a194dcda -- <file>` 출력 0바이트). 세액 영향은 0이다(주석만). 다만 이 헤더만 읽고 「정정이 누락됐다」고 판단해 max로 되돌리면 고정 테스트 AT-LIVESTOCK-4(2,512.5)·AT-LIVESTOCK-5(7,512.5)·AT-LIVESTOCK-6(5조합 5값)이 깨지고, 기준면적이 좁아져 목장용지 비사업용 판정이 늘어나는(납세자 불리) 방향으로 회귀한다. 원 보고자의 판단(「max 안이 폐기되고 합산이 3차 결론 — 주석만 stale」)은 계획서·테스트·git 이력 3중으로 확인된다.

**실측**  1) `npx tsx` probe(scratchpad/v4a.ts) — `perUnitStandardArea(LIVESTOCK_STANDARD.hanwoo_breeding, {hasFacility:true,hasGrassland:true,hasFodder:true})` 실행 출력:
  perUnit(ALL) = 7512.5
  max reading   = 5012.5   (= 7.5 + 5 + max(5000,2500))
  compute(1두, ALL) = 7512.5
  ⇒ 구현은 합산(7,512.5), 주석이 「현행」이라 주장하는 값은 5,012.5. 정확히 반대.
2) `git log --oneline -- lib/tax-engine/livestock-standard-area.ts` → a194dcda(보유 시설 합산) > a5b15073(max 정정) 순.
3) `git show a194dcda -- lib/tax-engine/non-business-land/data/livestock-standards.ts` → **빈 출력**(수정 commit이 이 파일을 갱신하지 않았음).
4) `sed -n '30,110p' __tests__/tax-engine/non-business-land/livestock-standards.test.ts` → AT-LIVESTOCK-5가 `toBe(7512.5)`로 합산을 고정하고, :56·:63 주석이 「종전 max 구현은 …를 줬다」로 max를 과거형으로 서술.
5) `docs/02-design/features/livestock-standard-area-limit.plan.md:136-150` 「🔴 정정 이력 — 두 번 틀렸다」 표가 1차=무조건 합산, 2차=max, 현행=보유 기반임을 명시.

**법령**  KoreanLaw `get_annexes({lawName:"소득세법 시행령 별표1의3"})` 원문 조회 성공. **주의: 이 별표는 「소득세법 시행규칙」이 아니라 「소득세법 시행령」 [별표 1의3](제168조의10제3항 관련)이다** — 과제 서술의 법령 tier가 어긋난다(시행규칙 별표 목록 254건에 축산용 토지 기준면적은 없다). 표 헤더는 열 묶음을 「축사 및 부대시설」(축사/부대시설)·「초지 또는 사료포」(초지/사료포)로 나누고, 한우(육우) 사육사업 1두당 축사 7.5㎡·부대시설 5㎡·초지 0.5ha·사료포 0.25ha를 각 열에 둔다. 표 어디에도 「합산한다」·「큰 것으로 한다」는 산식 문언이 없다 — 열은 항목별 인정 한도의 나열이고, 「또는」은 열 묶음의 이름표다. 즉 **max/합산 어느 쪽도 문언이 직접 명하지 않으며**, 실제 보유 여부로 항목을 더하는 현행 구현이 문언에 반한다고 볼 근거는 확인되지 않았다(해석례도 계획서 기재대로 0건). 따라서 이 건은 numeric 결함이 아니라 doc-drift다. 별표 2호(가축두수 = 최근 6과세기간 중 3과세기간 최고사육두수 평균 등)도 원문 확인했고 헤더의 해당 서술은 정확하다.

**도달성**  런타임 도달성 무관 — 주석 텍스트뿐이며 실행 경로에 영향이 없다(세액 영향 0). 위험은 「다음 작업자가 이 헤더를 근거로 max로 되돌린다」는 사람 경로다. 실제로 그 되돌림이 일어나면 `__tests__/tax-engine/non-business-land/livestock-standards.test.ts`(AT-LIVESTOCK-4·5·6)와 `__tests__/tax-engine/property-factory-separate-limit.anchor.test.ts`(PAS-1 75,125 · PAS-3 7,518 · PAS-3b)가 즉시 실패해 게이트가 잡는다 — 안전망은 살아 있다.

**처방**  `lib/tax-engine/non-business-land/data/livestock-standards.ts:12-15`의 「🔴 2026-08-06 산식 정정 — max」 문단을 삭제하거나 정본 헤더(`lib/tax-engine/livestock-standard-area.ts:26-37`)와 같은 서술(「기준면적 = 축사 + 보유한 (부대시설·초지·사료포)」·max 안은 2차 오류로 폐기)로 교체한다. 재수출 전용 파일이므로 산식 서술은 아예 두지 말고 정본 파일을 가리키는 한 줄만 남기는 편이 재드리프트를 막는다.

### V5-a 🟡 `legal-accuracy` — 편입일 미입력 → 편입유예 미적용 → 비사업용: 농지·목장·임야 3지목 모두 같은 방향 (임야만 step detail에서 「미제공」과 「경과」를 합침)

**위치** `lib/tax-engine/non-business-land/period-criteria.ts:323` · **세액영향** 양도소득과세표준 10억원 기준 §104①8호 +10%p 전량 = +100,000,000원 + 장기보유특별공제(§95②) 배제분. 실측한 것은 판정 플립(isBusiness true↔false)까지이며 세액 자체는 이번 probe에서 산출하지 않았다.

**결함**  「urbanIncorporationDate가 undefined면 isApplied:false → buildFail」은 3지목 전부에서 재현된다. 다만 원 주장의 「모른다와 3년이 지났다를 같게 취급」은 **판정 결과(isBusiness=false)** 수준에서만 참이고, **step detail 수준에서는 임야만** 참이다. 농지 real 모드는 checkIncorporationGrace에 닿기 전 farmland.ts:238의 §168의8⑤1호 기산점 게이트에서 「도시지역 편입일 미제공 — 소급 1년 기산점을 세울 수 없어 편입유예 요건 미충족」으로 별도 사유를 표시하고(step id도 region_grace_requirement로 다름), 농지 deemed 모드와 목장은 period-criteria.ts:328의 「도시지역 편입일 미제공」을 그대로 표시한다. 임야만 forest.ts:237이 grace.detail을 버리고 자체 문자열 「편입일 미제공 또는 유예 경과」로 두 사실을 합친다. 또한 엔진 result echo(engine.ts:235)는 `if (input.urbanIncorporationDate)` 게이트가 있어 미입력 시 조작된 graceYears:3·graceEndDate=transferDate가 UI로 새지 않는다.

**실측**  npx tsx <scratchpad>/v5probe.ts (judgeFarmland/judgePasture/judgeForest 직접 호출, zoneType=general_residential 고정). 출력:
A1 농지 real 편입 2022-06-01 → isBusiness=true, region_urban_grace:PASS "편입일 2022-06-01부터 3년 유예 적용"
A2 농지 real 편입 2017-01-01 → isBusiness=false, region_urban_grace:FAIL "...3년 유예 경과"
A3 농지 real 편입일 미제공 → isBusiness=false, region_grace_requirement:FAIL "도시지역 편입일 미제공 — 소급 1년 기산점을 세울 수 없어 편입유예 요건 미충족"
B1/B2/B3 농지 deemed(주말농장) → true / false("3년 유예 경과") / false("도시지역 편입일 미제공")
C1/C2/C3 목장(축산업 영위·기준면적 이내) → true / false("3년 유예 경과") / false("도시지역 편입일 미제공")
D1/D2/D3 임야(hasForestPlan) → true / false("편입일 2017-01-01부터 3년 경과") / false("편입일 미제공 또는 유예 경과")
즉 A1↔A3, B1↔B3, C1↔C3, D1↔D3에서 편입일 유무만으로 사업용↔비사업용이 뒤집힌다(세액: 기본세율 +10%p, 장특공 배제).

**법령**  「소득세법」 §104의3①1호나목(get_law_text mst=280405) 본문=도시지역 농지 비사업용, 단서=「소유자가 농지 소재지에 거주하며 스스로 경작하던 농지로서 …도시지역에 편입된 날부터 대통령령으로 정하는 기간이 지나지 아니한 농지는 제외」. 같은 항 3호가목도 「(도시지역에 편입된 날부터 대통령령으로 정하는 기간이 지나지 아니한 경우는 제외)」로 동일 구조. 「소득세법 시행령」 §168의8⑥·§168의10⑤(mst=286211)=3년. 임야는 §104의3①2호 본문이 「임야」를 비사업용으로 두고 가목→영 §168의9①2호가 「산지 안의 임야로서 …시업 중인 임야/특수산림사업지구 안의 임야. **다만**, …도시지역 안의 임야로서 도시지역으로 편입된 날부터 3년이 경과한 임야를 제외한다」로 규정한다(전부 본문 직접 조회 완료).

**도달성**  도달 가능. 「도시편입일」 필드는 NblSectionContainer.tsx:208의 「5. 공통 지원 필드」에 zoneType과 무관하게 상시 렌더되는 **선택 입력**이고, 비우면 lib/calc/non-business-land-request.ts:88이 `directIncorpDate || selfFarmingIncorpDate || ""` → 빈 문자열을 전송, lib/api/transfer-tax-schema-nbl.ts:92는 `z.string().optional()`, lib/calc/non-business-land-request.ts:40 `parseDate: toOptionalDate` → undefined로 엔진에 도달한다. 막는 것은 아무것도 없다.

**처방**  판정 로직은 그대로 두고(V5-c 참조) forest.ts:229-237만 정리한다: grace.detail을 그대로 쓰거나 `input.urbanIncorporationDate`가 없을 때 「편입일 미제공 — 유예 요건 미확인」으로 문구를 분리해 농지·목장과 표기를 맞춘다. 근본 처방은 V5-b(validate 게이트).

### V5-f 🟡 `legal-accuracy` — 연혁 경계 상수가 2015-02-02 — 실제 시행일은 2015-02-03이고 부칙 적용례가 「시행 이후 최초로 양도하는 분」이라 2015-02-02 양도분이 하루 일찍 신법을 받는다

**위치** `lib/tax-engine/non-business-land/types.ts:576` · **세액영향** 발현 시 편입유예 2년↔3년 및 기간기준 임계 0.8↔0.6이 함께 뒤집힐 수 있어 비사업용 여부 자체가 바뀐다(기본세율 +10%p + 장특공 배제). 다만 대상일이 단 하루라 실무 노출은 극히 작다.

**결함**  `DEFAULT_NON_BUSINESS_LAND_RULES.urbanIncorporationGrace.changeDate = "2015-02-02"`(types.ts:576)와 `periodCriteriaThresholds.oldThresholdDate = "2015-02-02"`(types.ts:588)가 모두 하루 이르다. 대통령령 제26067호는 **2015-02-03 공포·시행**이고 부칙 §2②가 「이 영 시행 **이후** 최초로 양도하는 분부터 적용」이므로 경계는 「양도일 ≥ 2015-02-03 → 신법(3년 / 비사업용 40% 임계)」이다. 코드는 `transferDate < changeDate`(period-criteria.ts:334)·`transferDate < oldDate`(:124) 라는 **strict** 비교라 양도일 2015-02-02가 신법을 받는다. 같은 파일 주석(:316 「2015.2.2 이전 양도분은 2년 레거시」, :108 「2015.2.2 이전 양도분의 농·임·목은 0.8」)과도 어긋난다 — 주석대로면 2015-02-02는 구법이어야 하는데 코드는 신법을 준다. 방향은 납세자 유리이고 영향은 양도일이 정확히 2015-02-02인 건에 한정된다.

**실측**  npx tsx <scratchpad>/v5b.ts (checkIncorporationGrace 직접 호출, 편입일 2012-06-15 고정):
  양도 2015-02-01: graceYears=2 isApplied=false end=2014-06-15
  양도 2015-02-02: graceYears=3 isApplied=true  end=2015-06-15   ← 법령상으로는 2년(=경과)이어야 함
  양도 2015-02-03: graceYears=3 isApplied=true  end=2015-06-15
  양도 2015-02-04: graceYears=3 isApplied=true  end=2015-06-15
같은 경계가 §168의6 임계비율에도 적용된다(법제처 DRF efYd=20150101 JO=016806 → 「100분의 **20**」, efYd=20150203 → 「100분의 **40**」).

**법령**  대통령령 제26067호(2015.2.3.) 부칙(법제처 DRF target=eflaw efYd=20150203 부칙 본문 직접 조회): 「제1조(시행일) 이 영은 공포한 날부터 시행한다. 다만 …」(위 각 조문은 단서 예외에 열거되지 않음) · 「제2조(일반적 적용례) ② 이 영 중 양도소득에 관한 개정규정은 이 영 시행 이후 최초로 양도하는 분부터 적용한다.」 개정 대상 확인: §168의8⑥·§168의9①2호 단서·§168의10⑤·§168의6 전부 2015-01-01 시행본과 2015-02-03 시행본 사이에서만 값이 바뀐다.

**도달성**  양도일이 정확히 2015-02-02인 계산에서만 발현한다. 상류 차단은 없다(양도일은 자유 입력).

**처방**  두 상수를 "2015-02-03"으로 고치고 비교는 strict `<`를 유지한다(양도일 < 2015-02-03 → 구법). 주석 「2015.2.2 이전 양도분」도 「2015.2.2. 이전(=2015.2.3. 전) 양도분」으로 정리한다. 회귀 anchor는 2015-02-02(구법)·2015-02-03(신법) 2건. qa-period-criteria.test.ts:200의 QA-006 기대값 재검토가 동반되어야 한다.

### V5-g 🟡 `ui-engine-drift` — 임야 편입유예 FAIL step이 실제 적용된 유예연수와 무관하게 「3년 경과」로 고정 표기된다

**위치** `lib/tax-engine/non-business-land/forest.ts:236` · **세액영향** 표시 only — 세액·판정 불변.

**결함**  forest.ts:230은 `addYears(input.urbanIncorporationDate, 3)`으로 **3년을 하드코딩**해 문구 분기용 값을 만들고 :236은 「편입일 …부터 **3년** 경과」를 출력한다. 그러나 판정에 실제로 쓰인 값은 :215 `checkIncorporationGrace`가 돌려준 `grace.graceYears`이고, 2015-02-03(코드상 2015-02-02) 전 양도분에서는 **2년**이다. 결과적으로 2년이 적용된 FAIL 케이스에서 근거 표시가 「3년 경과」로 나와 판정과 어긋난다. 판정 자체에는 영향이 없다(`addOneY`는 문구 선택에만 쓰인다). :229 주석도 같은 하드코딩을 반복한다.

**실측**  npx tsx <scratchpad>/v5probe.ts E1: 임야·편입일 2012-06-01·양도 2014-06-15(스위치 前 → graceYears=2, graceEnd 2014-06-01 → 경과) →
  isBusiness=false, forest_urban_grace:FAIL "편입일 2012-06-01부터 **3년** 경과"
같은 입력을 3년으로 판정했다면 graceEnd=2015-06-01이라 경과하지 않는다 — 즉 표시된 「3년」은 실제 판정 근거가 아니다.

**법령**  「소득세법 시행령」 §168의9①2호 단서 — 현행 3년(mst=286211), 2015-02-03 시행 전 2년(DRF target=eflaw efYd=20150101 JO=016809). V5-e 참조.

**도달성**  양도일이 2015-02-02(법령상 2015-02-03) 이전인 임야 도시지역 편입유예 FAIL 경로에서만 발현. 과거 양도분 계산은 UI에서 자유롭게 가능하다.

**처방**  forest.ts:229-237을 `grace.detail`을 그대로 쓰도록 단순화하거나(농지·목장과 동일), 문구가 필요하면 `grace.graceYears`를 보간한다. `addOneY` 지역변수와 :229 주석의 하드코딩 3년은 함께 제거한다. 아울러 :222·:238의 `legalBasis: NBL.URBAN_GRACE`(=「소득세법 시행령 §168조의14 ①」)는 E3-05가 이미 확정한 인용 오류이므로 같은 커밋에서 §168의9①2호 단서로 정정하는 것이 자연스럽다.

### V9-d 🟡 `plumbing` — 「⑧을 살리는 수정만으로 닫힌다」 — 재현된 경로에 한해 맞지만, 서버·구조 층에는 대응 가드가 없다

**위치** `lib/calc/transfer-tax-validate-asset.ts:352` · **세액영향** 잔여 경로에서 도달 시 V9-a와 동일(과표×10%p). ⑧ 복원 후 UI 경로에서는 0.

**결함**  「⑧을 살리면 대부분 닫힌다」는 실측으로 성립한다 — 같은 자산에서 취득원인만 purchase로 바꾸면(=⑧이 도달하면) 「지목을 선택하세요」로 차단되고, 지목·용도지역을 채우면 raw가 생성되어 엔진이 §168의14③3호나목으로 사업용을 확정한다. 다만 「A3-01·A3-02·A3-03의 합류점」이라는 부분은 A3-02·A3-03의 내용을 전달받지 못해 검증할 수 없었다. 또 ⑧은 **클라이언트 전용 방어**이고 서버에는 대응 가드가 없다: `nblUseDetailedJudgment`는 `nonBusinessLandRawSchema` 안에만 선언되어 있어(lib/api/transfer-tax-schema-nbl.ts:63) raw가 통째로 빠지면 route는 「정밀판정을 선택했는데 판정이 없다」는 상태를 인지할 수단이 없고, `isNonBusinessLand=true`만 받아 그대로 중과한다. 따라서 ⑧ 복원은 필요조건이지 충분조건이 아니며, 새 조기 return이 추가되거나 API를 직접 호출하면 같은 형태가 재발한다.

**실측**  npx tsx v9probe2.ts — 동일 자산에서 취득원인만 교체:
  carryover_gift → validate=null (통과, raw=undefined ⇒ 중과)
  purchase       → validate="자산1: 비사업용 토지 정밀판정을 선택했습니다. 지목을 선택하세요." (차단)
서버측 확인: grep -rn 'nonBusinessLandRaw|nonBusinessLandDetails' app/api/calc/transfer/ lib/api/transfer-tax-schema.ts → engine-input.ts:185 · multi/route.ts:215 · schema.ts:159 세 곳뿐, `isNonBusinessLand=true && nonBusinessLandRaw===undefined`를 거절하는 refine·가드는 0건.

**법령**  해당 없음(수정 범위 판정 항목). 근거 조문은 V9-a와 같다.

**도달성**  ⑧ 복원 후 남는 잔여 경로는 (a) 향후 추가되는 조기 return, (b) API 직접 호출 — 둘 다 정상 UI 경로는 아니다. 그래서 severity low.

**처방**  ⑧ 이동과 함께, ④에서 `nblUseDetailedJudgment && !raw`이면 `isNonBusinessLand`를 실어 보내지 않도록 하거나(단일 지점·회귀 표면 최소), Zod 최상위에 `nblUseDetailedJudgment` 사본을 두고 route에서 raw 부재 시 400으로 거절한다. 두 방안 중 하나만 택할 것 — 둘 다 넣으면 판정 주체가 둘로 갈린다.

### V10-d 🟡 `numeric` — §104⑤ 비교과세 때문에 컴패니언 NBL 누락의 세액 차이가 0원이 되는 조합이 있다

**위치** `lib/tax-engine/transfer-tax-aggregate.ts:1` · **세액영향** 0원 ~ +74,661,400원(실측 범위). 대칭 안분 조합 0원 / 비대칭 대형 컴패니언 +4,263,600원 / 주 자산도 NBL인 조합 +74,661,400원.

**결함**  컴패니언 NBL 누락의 numeric 영향은 상수가 아니라 조합 의존이다. 「소득세법」 §104⑤이 1호(합산 기본세율)와 2호(자산별 산출세액 합계) 중 큰 것을 택하므로, 중과(+10%p)가 붙으면서 동시에 자산이 별개 세율군으로 갈려 누진 브래킷이 나뉘는 조합에서는 두 효과가 상쇄돼 **차이가 0원**이 될 수 있다. 따라서 이 결함의 anchor를 쓸 때 시나리오를 잘못 고르면 fix 전후 모두 통과해 안전망이 조용히 무의미해진다(A1-02 시나리오 오기와 같은 함정).

**실측**  probe1(`<scratchpad>/v10-probe.ts`): 총 양도 1,000,000,000을 기준시가 비율(300M:200M)로 안분한 대칭 조합에서 컴패니언 `isNonBusinessLand` false→true 토글 시 — byGroups 145,860,000 → 144,680,000, byGeneral 145,860,000 고정, comparedTaxApplied `none`→`general` ⇒ **calculatedTax·determinedTax·totalTax 전부 145,860,000 / 160,446,000으로 동일(차이 0원)**. 자산별 echo만 62,140,000 → 83,740,000으로 갈린다.
probe2에서 컴패니언 양도가액을 fixedSalePrice 1,200,000,000으로 키우면 comparedTaxApplied가 `groups`로 넘어가 차이가 +4,263,600원으로 드러난다.

**법령**  「소득세법」 §104⑤ 본문 확인(mst=280405): 「제1호(합산 과세표준에 §55① 세율)…제2호(자산별 산출세액 합계) 중 큰 것」. 2호 단서의 「동일한 호의 세율이 적용되고 그 적용세율이 둘 이상인 경우 합산」 규정도 함께 확인했다. 상쇄는 조문의 정상 작동이지 엔진 결함이 아니다.

**도달성**  해당 없음(결함이 아니라 V10-a의 anchor 설계 제약). 다만 이 사실을 모르고 대칭 시나리오로 회귀 테스트를 짜면 그 테스트가 무력해진다.

**처방**  V10-a의 회귀 anchor는 **comparedTaxApplied === "groups"** 가 되는 비대칭 조합으로 작성하고, 단언에 `determinedTax` 차이를 명시할 것(자산별 echo만 보면 §104⑤ 상쇄를 놓친다).

### COV-4 🟡 `legal-accuracy` — 임야 도시지역 편입유예의 근거 상수가 §168의14①로 잘못 붙어 있다 — 실제 근거는 §168의9①2호 단서이고, 같은 파일의 코드 주석도 그렇게 적혀 있다

**위치** `lib/tax-engine/legal-codes/transfer-nbl.ts:50` · **세액영향** 0원. 판정 근거 문자열만 틀린다.

**결함**  `NBL.URBAN_GRACE = "소득세법 시행령 §168조의14 ①"`(transfer-nbl.ts:50)이 `forest.ts:222`·`:238`에서 **임야 도시지역 편입 3년 유예**의 `legalBasis`로 쓰인다. 그러나 §168의14①은 「부득이한 사유가 있어 비사업용 토지로 보지 않는 토지」 — 사용금지·제한(1호), 문화·자연유산 보호구역(2호), 그 상속(3호), 부령 위임(4호) — 이고, 도시지역 편입 유예 규정이 아니다. 임야의 편입유예 근거는 §168의9①2호 **단서**(「도시지역 … 안의 임야로서 도시지역으로 편입된 날부터 **3년이 경과한 임야를 제외**한다」)다. `forest.ts:215`·`:230`의 코드 주석 자체가 「§168-9 ①2호 단서로 제외」라고 적고 있어, 상수와 주석이 같은 파일 안에서 서로 모순된다. 참고로 농지·목장에는 각각 `FARMLAND_URBAN_GRACE`(§168의8⑤⑥, :62)·`PASTURE_URBAN_GRACE`(§168의10⑤, :71) 전용 상수가 이미 있는데 임야만 범용 `URBAN_GRACE`를 쓴다 — 상수 신설 누락으로 보인다.

**실측**  코드 정독 + 법령 본문 대조. `grep -n "URBAN_GRACE:" lib/tax-engine/legal-codes/transfer-nbl.ts` → :50 `URBAN_GRACE: "소득세법 시행령 §168조의14 ①"`. `sed -n 205,245p lib/tax-engine/non-business-land/forest.ts` → :215 주석 「도시지역 內 시업중 임야 — 편입 3년 경과시 §168-9 ①2호 단서로 제외」, :222·:238 `legalBasis: NBL.URBAN_GRACE`. 엔진 실행 시 이 문자열은 `JudgmentStep.legalBasis`로 결과에 실려 NonBusinessLandResultCard 판정 근거로 사용자에게 그대로 노출된다.

**법령**  KoreanLaw 본문 확인(lawId 003956, 시행 2026-07-01). **§168의9①2호**: 「「산지관리법」에 따른 산지 안의 임야로서 … 다만, 「국토의 계획 및 이용에 관한 법률」에 따른 도시지역(… 보전녹지지역을 제외한다 …) 안의 임야로서 **도시지역으로 편입된 날부터 3년이 경과한 임야를 제외한다**.」 — 3년·임야·편입 모두 일치. **§168의14①**: 「… 1. 토지를 취득한 후 법령에 따라 사용이 금지 또는 제한된 토지 : 사용이 금지 또는 제한된 기간 2. … 보호구역 안의 토지 : 보호구역으로 지정된 기간 3. 제1호 및 제2호에 해당되는 토지로서 상속받은 토지 … 4. … 재정경제부령으로 정하는 부득이한 사유 …」 — 도시지역 편입 문구 자체가 없다.

**도달성**  도달 가능. 지목 임야 + 시업중(산림경영계획인가) + 도시지역 內 입력이면 forest.ts:222/:238이 반드시 타며, 그 `legalBasis`가 결과 카드의 판정 단계 근거로 렌더된다(components/calc/transfer/nbl/ 결과 → NonBusinessLandResultCard). 세액에는 영향이 없는 **표시·근거 오류**다.

**처방**  `FOREST_URBAN_GRACE: "소득세법 시행령 §168조의9 ①2호 단서"` 상수를 신설해 forest.ts:222·:238에 붙이고, `NBL.URBAN_GRACE`는 §168의14①이 실제로 근거인 지점(있다면)에만 남기거나 제거. 신설 조문을 인용하므로 `additions-transfer-decree.ts`의 §168의9 엔트리 키워드에 「도시지역으로 편입된 날부터 3년이 경과한 임야를 제외한다」를 추가할 것(현행 키워드 4개에 없음).

### COV-5 🟡 `dead-code` — 폼 초기값의 이중진실 — `NBL_DEFAULTS`(102필드)는 아무도 import하지 않고, `makeDefaultAsset`이 별도로 117필드를 인라인 정의해 이미 15필드가 벌어져 있다

**위치** `lib/stores/calc-wizard-asset-nbl.ts:258` · **세액영향** 0원(현재). 미래 회귀 시 필드별로 상이.

**결함**  `export const NBL_DEFAULTS`(calc-wizard-asset-nbl.ts:258)의 주석은 「makeDefaultAsset에서 spread 사용」이라고 선언하지만, 저장소 전체에서 이 심볼을 참조하는 곳이 **정의 1곳뿐**이다(`grep -rn "NBL_DEFAULTS" lib components --include=*.ts --include=*.tsx` → 1건). 실제 초기값은 `calc-wizard-asset-factory.ts:246~`가 인라인으로 다시 나열한다. 두 목록은 이미 벌어졌다: factory에만 있고 NBL_DEFAULTS에 없는 필드가 15개(`nblOtherMixedUseMode`·`nblOtherMixedUseSpecificFloorArea`·`nblOtherMixedUseTotalFloorArea`·`nblOtherMixedUseSpecificFootprint`·`nblOtherMixedUseTotalFootprint`·`nblOtherUseParcels`·`nblOtherParcels`·`nblFactoryEnabled`·`nblFactoryLocationCategory`·`nblFactoryTotalLandArea`·`nblFactorySegments`·`nblFactoryIsRestrictedZone`·`nblFactoryAdditionalRecognizedArea`·`nblFactoryFootprintArea`·`nblFactoryIsUnregistered`) — 즉 공장·복합용도 클러스터 전체가 상수 쪽에서 누락됐다. 반대 방향 누락은 0건. 이번 리뷰의 정독 목록에 `calc-wizard-asset-nbl*.ts`는 있었으나 `calc-wizard-asset-factory.ts`가 없어 두 목록을 대조할 계기가 없었다.

**실측**  probe8 `npx tsx` — `Object.keys(NBL_DEFAULTS).length` = **102**, `Object.keys(makeDefaultAsset(1)).filter(k=>k.startsWith('nbl')||k==='isNonBusinessLand').length` = **117**. `in NBL_DEFAULTS but NOT in factory: []`, `in factory but NOT in NBL_DEFAULTS: [15개 — 위 목록]`.

**법령**  해당 없음(코드 위생 항목).

**도달성**  현재 사용자 영향 0 — 죽은 상수라 실행되지 않는다. 위험은 미래형이다: 신규 NBL 필드를 「초기값 상수」에 추가했다고 믿고 factory에는 안 넣으면 `undefined`가 폼에 남아 controlled→uncontrolled 경고·validate 우회로 번진다. 반대로 이 죽은 상수를 「정본」으로 오인하고 factory를 여기에 맞추면 15필드가 사라진다.

**처방**  둘 중 하나로 단일화: (a) `makeDefaultAsset`에서 `...NBL_DEFAULTS`를 실제로 spread하고 factory의 인라인 nbl* 블록을 삭제(누락 15필드는 상수 쪽에 추가), 또는 (b) `NBL_DEFAULTS`를 삭제하고 factory를 정본으로 확정. (a)를 택하면 「상수 키 집합 == factory의 nbl* 키 집합」 단위 테스트 1건을 함께 넣어 재이탈을 막을 것. ⚠️ 이 저장소는 「기존 dead code는 요청 없이 제거하지 않는다」는 규칙이 있으므로 삭제 방향은 사용자 승인 후.

### COV-6 🟡 `plumbing` — 이력→마법사 복원의 유일한 정규화 지점(`calc-wizard-asset-migrate.ts`)이 이번 리뷰의 정독 범위 밖이었고, 최신 `nblRevenue*` 18필드에 stale-record 가드가 없다

**위치** `lib/stores/calc-wizard-asset-migrate.ts:141` · **세액영향** 0원(값이 undefined→미입력으로 수렴). 다만 §168의11② 수입금액비율 판정이 필요한 기타토지 이력에서는 사업용↔비사업용 판정이 「판정 불가」 쪽으로 떨어질 수 있다 — 이 경우 세액이 움직이나, 재현하려면 옛 스키마 이력 레코드가 필요해 이번에 실측하지 못했다.

**결함**  이력(IndexedDB)·sessionStorage에서 폼을 되살릴 때 자산 객체가 거치는 유일한 정규화 함수는 `migrateAsset`이다 — persist merge(`calc-wizard-store.ts:533`), 레거시 이관(`calc-wizard-migration.ts:120`), 이력 상세 드로어(`components/history/HistoryDetailDrawer.tsx:141`) 세 경로가 모두 이 함수만 태우고, **`makeDefaultAsset()`과 병합하지 않는다**. 그래서 migrateAsset이 명시적으로 채우지 않은 신규 필드는 복원된 자산에서 `undefined`로 남는다. 실측: `migrateAsset({})`이 채우는 nbl* 필드는 23개뿐이고, factory가 아는 117개 중 94개가 비어 나온다. 그중 **`nblRevenue*` 18필드 전체**(`nblRevenueBusinessType`·`nblRevenueCurrentRevenue`·`nblRevenueCurrentLandValue`·`nblRevenuePriorRevenue`·`nblRevenuePriorLandValue`·`nblRevenueCurrentBusinessStartDate`·`nblRevenuePriorBusinessDays`·`nblRevenueCurrentDeposit`·`nblRevenueCurrentRentDays`·`nblRevenuePriorDeposit`·`nblRevenuePriorRentDays`·`nblRevenueCommonApportion`·`nblRevenueCommonRevenue`·`nblRevenueOtherLandValue`·`nblRevenuePriorCommonRevenue`·`nblRevenuePriorOtherLandValue` 등)와 `nblGracePeriods`가 가드 없이 비어 있다 — 같은 파일이 `nblFactory*` 9필드·`nblOtherMixedUse*` 5필드·`nblVilla*` 4필드에는 `if (a.X === undefined) a.X = …` 가드를 붙여 놓은 것과 대비된다(:143-166). 즉 가드 패턴은 확립돼 있는데 §168의11②·③ 수입금액비율 클러스터만 누락됐다.

**실측**  probe8 `npx tsx` — `Object.keys(migrateAsset({})).filter(k=>k.startsWith('nbl')||k==='isNonBusinessLand').length` = **23**; factory에는 있고 migrate 결과에는 없는 필드 94개 목록에 `nblRevenue*` 18건 + `nblGracePeriods` 포함. `grep -n "nblRevenue" lib/stores/calc-wizard-asset-migrate.ts` → **0건**. 호출부 확인: `grep -rn "migrateAsset"` → store:533 / migration:120 / HistoryDetailDrawer:141 — 어느 곳도 makeDefaultAsset과 병합하지 않는다.

**법령**  해당 없음(배선 항목).

**도달성**  도달 가능하나 파급은 제한적이다. `lib/api/transfer-tax-schema-nbl.ts:203-221`이 `nblRevenue*`를 전부 `.optional()`로 정의하므로 undefined가 실려도 400이 나지 않고 엔진은 「미입력」으로 처리한다. 실제 증상은 (a) 복원 직후 해당 입력칸이 controlled→uncontrolled로 뒤집히는 React 경고, (b) 옛 이력을 되살려 재계산할 때 수입금액비율 입력이 조용히 빈 값으로 재전송되는 것. 세액 자체는 「입력 안 함」과 동일한 결과라 침묵 오답이 아니라 침묵 유실이다.

**처방**  `calc-wizard-asset-migrate.ts`에 `nblRevenue*` 18필드 + `nblGracePeriods` 가드를 :143-166과 같은 형식으로 추가. 근본 해결은 COV-5와 묶어 「migrate는 `{ ...makeDefaultAsset(idx), ...migrated }` 병합」으로 바꾸고, 「factory의 모든 키가 migrateAsset({}) 결과에 존재한다」는 단위 테스트로 고정하는 것이다(그러면 신규 필드마다 두 파일을 손대는 규약 자체가 사라진다).

### COV-7 🟡 `doc-drift` — 세율 시드에 읽히지 않는 NBL 데이터 2건이 남아 있고, 그중 장특공 `exclusions`의 `non_business_land`는 §95②과 정면으로 어긋난다(다행히 죽어 있다)

**위치** `lib/tax-engine/data/transfer-rate-seed.ts:56` · **세액영향** 0원(현재). 배선 시 비사업용 토지 양도차익 × 표1 공제율(최대 30%) 전액이 사라진다 — 이번 probe 사례로 환산하면 과세표준이 12.455억에서 크게 늘어난다.

**결함**  시드에 NBL 관련 죽은 데이터가 둘 있다. ① `deduction:long_term_holding`의 `deduction_rules.exclusions: ["multi_house_surcharge", "non_business_land", "unregistered"]`(:56, historical 시드 :134도 동일). 스키마는 이 배열을 **필수**로 요구하지만(rate-table.schema.ts:64) 엔진에서 `.exclusions`를 읽는 코드가 없다(`grep -rn "\.exclusions" lib/tax-engine/` → house-count의 동명 지역변수뿐). 만약 읽혔다면 비사업용 토지의 장기보유특별공제를 배제하게 되는데, 이는 §95②에 반한다. ② 같은 시드의 `special:non_business_land_judgment.buildingAreaMultipliers`(:512-521, residential 5·commercial 5·industrial 7·green 10·management 10·agriculture_forest 10·natural_env 10·undesignated 7)가 코드의 `DEFAULT_NON_BUSINESS_LAND_RULES.buildingAreaMultipliers`(types.ts:553-566, residential 4·commercial 3·industrial 4·green 7·management 7·agriculture_forest 7·natural_env 7)와 **거의 모든 값이 다르다**. 어느 쪽도 읽히지 않는다 — 저장소 전체에서 `buildingAreaMultipliers`를 참조하는 코드는 시드 정의 자체 1건뿐이며, v2 엔진은 `getHousingMultiplier()`(urban-area.ts)를 쓴다(types.ts:500-505 `@deprecated` 주석이 그렇게 밝힌다). 다만 그 주석은 「v1 엔진(`lib/tax-engine/non-business-land.ts`)에서만 사용된다」고 적었는데 실측상 v1도 읽지 않아 주석도 stale이다.

**실측**  `grep -rn "buildingAreaMultipliers" lib app components --include=*.ts --include=*.tsx | grep -v "types.ts|schema"` → `lib/tax-engine/data/transfer-rate-seed.ts:512` 단 1건. `grep -rn "\.exclusions" lib/tax-engine/ --include=*.ts | grep -v exemption-rules` → house-count/index.ts의 지역변수 6건뿐.
probe5 `npx tsx` — 실제 fallback 시드로 동일 입력을 isNonBusinessLand false/true로 각각 계산: 두 경우 모두 `taxBase` = **1,245,500,000**으로 동일 ⇒ 장특공제가 NBL에서 배제되지 않음을 실측 확인(차이는 appliedRate 0.45↔0.55뿐).

**법령**  「소득세법」 §95② **본문 확인**(KoreanLaw, lawId 001565, 시행 2026-07-01): 「"장기보유 특별공제액"이란 제94조제1항제1호에 따른 자산(**제104조제3항에 따른 미등기양도자산과 같은 조 제7항 각 호에 따른 자산은 제외한다**)으로서 보유기간이 3년 이상인 것 … 표 1에 따른 보유기간별 공제율을 곱하여 계산한 금액을 말한다.」 ⇒ 제외 대상은 미등기(§104③)와 §104⑦ 각 호(다주택 중과 대상 주택)뿐이고, 비사업용 토지(§104①8호)는 제외 열거에 없다 — 표1 장특공제가 **적용**된다. 엔진 동작이 옳고 시드 데이터가 틀렸다.

**도달성**  현재 도달 불가(읽는 코드 없음). 위험은 「장특공 배제 규칙을 DB로 옮기자」는 후속 작업이 이 배열을 정본으로 오인해 배선하는 경우다 — 그 순간 비사업용 토지에 장특공제가 사라져 법 근거 없이 납세자에게 불리하게 적용된다.

**처방**  ① 시드의 `exclusions` 배열에서 `non_business_land`를 제거하고(§95② 제외 열거와 일치시켜 `unregistered`·§104⑦ 대상만 남김), 스키마 필드 자체가 읽히지 않는다면 `.optional()`로 낮추거나 제거를 검토. ② `buildingAreaMultipliers`는 두 값 중 어느 쪽도 사용되지 않으므로, 시드 레코드에서 제거하거나 `DEFAULT_NON_BUSINESS_LAND_RULES`와 값을 일치시켜 「어느 쪽이 정본인가」 질문 자체를 없앨 것. ③ types.ts:500-505의 `@deprecated` 주석에서 「v1 엔진에서만 사용된다」는 문구를 실측(사용처 0건)에 맞게 정정. ⚠️ 셋 다 numeric 무영향이므로 안전하지만, 이 저장소 규칙상 요청 없는 dead code 제거는 승인 후.

### E6-04-V 🟡 `legal-accuracy` — E6-04 독립 확인 — NBL 판정 결과의 `surcharge.longTermDeductionExcluded`가 현행 §95②과 어긋난다(다만 소비처 0 → 세액 영향 없음)

**위치** `lib/tax-engine/non-business-land/engine.ts:281` · **세액영향** 현재 0원(소비처 없음). 배선 시 비사업용 토지 전건에서 장특공제가 통째로 사라져 **과다과세** 방향으로 대규모 오차가 난다.

**결함**  `longTermDeductionExcluded: isNonBusinessLand`(`engine.ts:281` 본 경로, `:314` 레거시 팩토리)는 **양도일과 무관하게** 비사업용이면 항상 true를 낸다. 현행 §95② 괄호는 미등기양도자산(§104③)과 §104⑦ 각 호 자산만 배제하므로 **2016.1.1 이후 양도분 비사업용 토지는 장특공제 대상**이고, 따라서 이 값은 오늘 날짜 기준으로 **거짓**이다. E6-04의 판정은 맞다. 다만 severity는 낮춰야 한다 — 저장소 전체 grep 결과 이 필드의 **소비처가 테스트 5곳뿐**이고 양도세 엔진·UI·저장소·PDF 어디에서도 읽지 않는다(양도세 LTHD는 `calcLongTermHoldingDeduction`이 `isNonBusinessLand`를 아예 참조하지 않는 별도 경로다). 즉 현재 세액 영향은 0이고, 「배선되면 그때 현행법 위반이 되는」 잠재 결함 + 결과 객체의 허위 진술이다. 역설적으로 이 값은 **2015.12.31 이전 양도분에 대해서는 맞다** — H-1의 연혁대로면 필요한 것은 필드 삭제가 아니라 양도일 게이팅이다.

**실측**  `grep -rn "longTermDeductionExcluded" lib components app __tests__ e2e docs` → 산출 2곳(engine.ts:281·314) + 타입 1곳(types.ts:467) + 테스트 5곳(engine.test.ts:57·88, qa-integration.test.ts:211·240·303, qa-land-type-flow.test.ts:59) + 문서. 산출 외 **읽는 코드 0곳**. 또 `grep -n "isNonBusinessLand" lib/tax-engine/transfer-tax-lthd.ts` → 0건으로 LTHD 경로가 이 축을 보지 않음을 확인. probe2 실측에서 2024-06-01 비사토가 LTHD 120,000,000(30%)을 그대로 받는 것도 같은 사실의 반대편 증거다.

**법령**  「소득세법」 제95조 제2항 (현행, MST 280405, 시행 2026.1.1) — 「…제94조제1항제1호에 따른 자산(제104조제3항에 따른 미등기양도자산과 같은 조 제7항 각 호에 따른 자산은 제외한다)…」. 비사업용 토지(§104의3)는 열거되어 있지 않다. 본문 직접 조회로 확인.

**도달성**  세액 경로 도달 불가(소비처 0). 결과 객체는 API 응답·IndexedDB 이력에 실려 나가므로 「표시되지 않는 허위 필드」로는 도달한다.

**처방**  필드를 양도일 기준으로 만든다 — NBL 엔진 입력의 양도일(또는 §168의14② 의제 양도일이 아닌 실제 양도일)을 받아 `isNonBusinessLand && transferDate < 2016-01-01`로 산출하고, 테스트 5곳을 그 기준으로 갱신한다. 배선하지 않을 것이라면 필드와 테스트를 함께 제거하는 편이 허위 진술을 남기지 않는다.

### U3-03-V 🟡 `ui-engine-drift` — U3-03 독립 확인 — 결과 카드의 「장기보유특별공제 표1 적용」이 `longTermDeductionExcluded: true`와 정반대이고, **카드 쪽이 맞다**

**위치** `components/calc/NonBusinessLandResultCard.tsx:61` · **세액영향** 0원(표시 축).

**결함**  `NonBusinessLandResultCard.tsx:61-62`는 비사업용 판정 시 「…(장기보유특별공제 표1 적용).」이라고 표시하고(위기취득 배제 분기 `:61`, 일반 분기 `:62`), 같은 판정 객체의 `surcharge.longTermDeductionExcluded`는 true다 — 모순이 실재한다. 다만 **정정 방향은 카드가 아니라 엔진 필드 쪽**이다: 현행 §95②상 비사업용 토지는 장특공제 대상이고 실제 엔진도 표1을 적용하므로(probe2 실측 2024-06-01 LTHD 30% 적용), 화면 문구가 정확하고 필드가 틀렸다. 엔진 주석도 같은 판단을 명시한다 — `transfer-tax-rate-calc.ts:353` 「부칙 §9270호 §14① … +10%p 중과 배제(→§104①1호 기본누진). **장특은 표1 유지**.」 ⇒ U3-03을 「카드 문구 수정」으로 처리하면 현행법에 어긋나는 방향이 된다.

**실측**  `sed -n '55,65p' components/calc/NonBusinessLandResultCard.tsx`로 문구 확인(`:61` 위기취득 배제 분기 / `:62` 일반 분기, 둘 다 「장기보유특별공제 표1 적용」). probe2 실측에서 양도 2024-06-01·비사토 land가 `lthd 120,000,000 / rate 0.30`을 받아 실제 엔진 동작이 카드 문구와 일치함을 확인.

**법령**  「소득세법」 제95조 제2항 (현행, MST 280405) 표1 — 배제 대상은 미등기양도자산(§104③)과 §104⑦ 각 호 자산뿐. 본문 직접 조회로 확인.

**도달성**  도달 가능(비사업용 판정 결과 화면의 상시 배너). 다만 어긋난 쪽(`longTermDeductionExcluded`)이 화면에 그려지지 않으므로 사용자에게 보이는 값은 옳다.

**처방**  E6-04-V의 수정(양도일 게이팅 또는 필드 제거)으로 모순을 해소한다. 카드 문구는 **건드리지 않는다**. 다만 H-2를 구현하면 2016.1.1 이전 양도분에서는 카드 문구도 「장기보유특별공제 배제(구 §95②)」로 갈라져야 하므로, 그때 두 축을 같은 술어로 묶을 것.

### D-1 🟡 `dead-code` — 세율 시드의 `exclusions` 배열이 엔진에서 전혀 읽히지 않는다(dead) — 게다가 현행(2023-01-01) 행은 비사업용 토지를 배제 대상으로 적고 있어 현행 §95②과 어긋난다

**위치** `lib/tax-engine/data/transfer-rate-seed.ts:56` · **세액영향** 현재 0원. 배선 시 현행 비사토 전건 장특공제 상실 → 과다과세.

**결함**  `calcLongTermHoldingDeduction`은 5번째 인자로 `rules: ParsedRates["longTermHoldingRules"]`(`transfer-tax-lthd.ts:84`)를 받지만 함수 본문 전체에서 `rules`를 **한 번도 참조하지 않는다** — 공제율·상한·최소보유연수·배제사유가 전부 하드코딩(정본 `calcLongTermRate`)이다. 그래서 시드의 `exclusions` 배열은 스키마(`schemas/rate-table.schema.ts:64`)에만 존재하는 dead data다. 그 내용 자체도 축이 뒤섞여 있다 — 역사 행(`transfer-rate-seed-historical.ts:134`, effective_date 1990-01-01)의 `["multi_house_surcharge","non_business_land","unregistered"]`는 **2015.12.31 이전 기준으로는 정확**하지만, 현행 행(`transfer-rate-seed.ts:56`, effective_date 2023-01-01)이 **같은 배열을 그대로 복사**해 비사업용 토지를 여전히 배제 대상으로 선언하고 있다. 현행 §95②에는 근거가 없다. 지금은 읽히지 않아 무해하나, 누군가 `rules.exclusions`를 배선하는 순간 현행 비사토 전건에서 장특공제가 사라지는 **과다과세** 트랩이다(「법 근거 없이 불리 적용 금지」 정면 위반). 참고로 이 파일들과 별개로 `lib/tax-engine/data/lthd-multi-house-exclusion-era.ts`는 같은 연혁을 **정확한 구간표**로 이미 갖고 있다 — 단일 소스로 삼아야 할 쪽은 후자다.

**실측**  `grep -n "\brules\b" lib/tax-engine/transfer-tax-lthd.ts` → 매치 1건(`:84` 파라미터 선언)뿐, 본문 사용 0건. `grep -rn "exclusions" lib/tax-engine/ lib/db/` → LTHD 축 소비처 0건(나머지는 `exemption-rules.ts`·`house-count/exclusions.ts` 등 다른 축). `grep -n "exclusions:" lib/tax-engine/data/transfer-rate-seed.ts lib/tax-engine/data/transfer-rate-seed-historical.ts` → 각 1건, 배열 내용 동일. probe2에서 시드 행의 `exclusions`를 함께 출력해 2024-06-01 양도에서도 `["multi_house_surcharge","non_business_land","unregistered"]`가 실린 채 LTHD 30%가 적용됨을 실측했다(데이터와 동작이 반대).

**법령**  「소득세법」 제95조 제2항 (현행, MST 280405) — 배제 대상에 비사업용 토지 없음. 「소득세법」 제95조 제2항 (시행 2014.1.1 제12169호) — 비사업용 토지 배제 명시. 두 본문 모두 직접 조회.

**도달성**  현재 도달 불가(읽는 코드 없음). 세율 데이터를 Supabase에서 로드하는 경로에서도 마찬가지로 무시된다.

**처방**  두 갈래 중 하나를 택한다. (a) `rules` 파라미터와 `exclusions` 필드를 함께 제거해 「하드코딩이 정본」임을 명시하거나, (b) H-1의 연혁 leaf를 정본으로 두고 시드의 현행 행에서 `"non_business_land"`를 빼 데이터를 법령과 맞춘다. 어느 쪽이든 **역사 행의 `"non_business_land"`는 legally 정확하므로 지우지 말 것** — 지우면 H-2 수정의 근거 데이터가 사라진다.

### D-2 🟡 `doc-drift` — 릴리스 노트가 「비사업용 = 장기보유특별공제 배제」로 적고 있다 — 현행법·현행 엔진 동작 모두와 불일치

**위치** `docs/releases/2026-04-21-non-business-land-v2.md:63` · **세액영향** 0원.

**결함**  「⚠️ 기존에 "사업용"으로 판정되던 일부 경계 케이스가 "비사업용 +10%p 중과세·**장기보유특별공제 배제**"로 전환될 수 있습니다」라고 적혀 있다. 2016.1.1 이후 양도분에서 비사업용 토지는 장특공제 대상이고(H-1), 엔진도 실제로 표1을 적용한다(probe2 — 2024-06-01 LTHD 30%). 사용자 영향 문구가 **실제보다 불리하게** 서술돼 있다. E6-04-V(엔진 필드)·D-1(시드 데이터)과 같은 오해가 문서에까지 복제된 사례로, 「파일이 자기 자신과 모순 = 인용이 전역 복제됨」 패턴에 해당한다.

**실측**  `sed -n '60,66p' docs/releases/2026-04-21-non-business-land-v2.md`로 원문 확인. probe2 실측(2024-06-01 비사토 land → `lthd 120,000,000 / rate 0.30`)으로 엔진 동작이 문서와 반대임을 확인.

**법령**  「소득세법」 제95조 제2항 (현행, MST 280405) — 배제 대상은 미등기양도자산·§104⑦ 각 호 자산뿐. 본문 직접 조회.

**도달성**  문서 축(코드 무영향). 다만 후속 작업자가 이 문장을 근거로 삼으면 D-1의 트랩을 실제로 배선할 위험이 있다.

**처방**  해당 문장에서 「장기보유특별공제 배제」를 삭제하고 「+10%p 중과세(§104①8호)」만 남긴다. 2016.1.1 이전 양도분 배제(H-1)를 언급하려면 양도일 조건을 함께 적을 것.

### V7-a ⚪ `legal-accuracy` — §104의3①3호 단서는 3호 전체(가목 포함)에서 제외한다 — 법령 본문 확인

**위치** `lib/tax-engine/non-business-land/pasture.ts:49` · **세액영향** 해석 자체는 세액 무영향. 코드 반영 갭의 세액 영향은 V7-b 참조.

**결함**  「소득세법」 §104의3①3호는 「목장용지로서 다음 각 목의 어느 하나에 해당하는 것. 다만, 토지의 소유자, 소재지, 이용 상황, 보유기간 및 면적 등을 고려하여 거주 또는 사업과 직접 관련이 있다고 인정할 만한 상당한 이유가 있는 목장용지로서 대통령령으로 정하는 것은 제외한다.」로 되어 있다. 단서는 「각 목 외의 부분」에 붙어 있으므로 가목(축산업 경영자 소유 + 기준면적 초과 또는 도시지역 소재)과 나목(축산업 미경영자 소유) **양쪽 모두**에서 제외한다. 이는 같은 항 2호(임야)가 「임야. 다만, 다음 각 목의 어느 하나에 해당하는 것은 제외한다」로 목(다목)에 거주·사업관련 요건을 두는 구조와 다르다. 「소득세법 시행령」 §168의10②는 문두에서 「법 제104조의3제1항제3호 **각 목 외의 부분 단서**에서 …이란 다음 각 호의 어느 하나에 해당하는 것을 말한다」고 스스로 적용 범위를 명시하며 1호 상속 3년 미경과, 2호 종중(2005.12.31. 이전 취득), 3호 지방세특례제한법 §22·§41·§50·§89 사회복지법인등·학교등·종교제사단체·정당의 직접 사용, 4호 재정경제부령 위임을 든다. 원 주장(「단서는 3호 전체에서 제외한다」)은 법령 본문과 정확히 일치한다.

**실측**  KoreanLaw MCP get_law_text(mst="280405", jo="제104조의3") 및 get_law_text(mst="286211", jo="제168의10") 실행. 반환 본문에서 3호 각 목 외 부분 단서와 §168의10② 문두의 「각 목 외의 부분 단서」 위임 문구를 verbatim 확인. 코드 측은 `sed -n '1,240p' lib/tax-engine/non-business-land/pasture.ts`로 정독.

**법령**  「소득세법」(법률, mst 280405) §104의3①3호 각 목 외의 부분 단서 — 「다만, 토지의 소유자, 소재지, 이용 상황, 보유기간 및 면적 등을 고려하여 거주 또는 사업과 직접 관련이 있다고 인정할 만한 상당한 이유가 있는 목장용지로서 대통령령으로 정하는 것은 제외한다.」 / 「소득세법 시행령」(대통령령, mst 286211) §168의10② 1호(상속받은 목장용지로서 상속개시일부터 3년이 경과하지 아니한 것)·2호(종중 소유, 2005.12.31. 이전 취득)·3호(사회복지법인등·학교등·종교제사단체·정당의 직접 사용)·4호(기타 재정경제부령). §168의10③(기준면적=별표1의3)·④(대통령령으로 정하는 지역=녹지지역·개발제한구역)·⑤(3년).

**도달성**  법령 해석 항목이라 도달성 개념 없음. 코드가 이 단서를 반영하는 지점은 `isRelatedPasture`(pasture.ts:49-69) 하나뿐이며, 그 호출부가 V7-b의 쟁점이다.

**처방**  해석상 정정 불필요 — V7-b의 호출부 수정 시 이 조문 구조를 근거로 삼을 것.

### V9-b ⚪ `doc-drift` — A3-01 evidence 줄번호 오차 — :224/:319는 실제 :219/:307

**위치** `lib/calc/transfer-tax-validate-asset.ts:219` · **세액영향** 없음.

**결함**  반증 메모의 부수 확인이 맞다. 실제 줄번호는 carryover_gift 진입 `if (asset.acquisitionCause === "carryover_gift") {` = **:219**, 그 블록의 `// carryover_gift 검증 완료 — 일반 취득 검증 스킵` 뒤 `return null` = **:307**. 원 보고의 :224/:319는 각각 +5·+12 어긋난다(:319는 ±5 허용 범위를 넘는다). 같은 메모가 정확하다고 한 나머지 인용도 재확인했다 — `const nblErr = validateNblDetailedJudgment(...)` = **:352**(정확), `newConstruction` 진입 = :317, 그 블록 `return null` = :345, `isMixedUseHouse === true` = :312(메모의 :313과 1줄 차).

**실측**  grep -n 'acquisitionCause === "carryover_gift"|acquisitionCause === "newConstruction"|isMixedUseHouse === true|const nblErr' lib/calc/transfer-tax-validate-asset.ts →
219:  if (asset.acquisitionCause === "carryover_gift") {
312:  if (asset.isMixedUseHouse === true) {
317:  if (asset.acquisitionCause === "newConstruction") {
352:  const nblErr = validateNblDetailedJudgment(asset, label, formTransferDate);
sed -n '305,308p' 로 :307이 `    return null;`임을 확인.

**법령**  해당 없음(문서 정확성 항목).

**도달성**  해당 없음.

**처방**  보고서 evidence의 줄번호를 :219 / :307로 정정.


---

## 부록 C — 2차 기각 7건 (재제안 금지)

- **V3-a** — 「상증령 §16과 소령 §153③은 문언이 달라 같은 알고리즘 미러 자체가 결함」이라는 가설
  - 기각 사유: 두 조문의 재촌 단위 문언은 사실상 동일하다. 「소득세법 시행령」 §153③1호 = 「농지가 소재하는 시(특별자치시와 「제주특별자치도 설치 및 국제자유도시 조성을 위한 특별법」 제10조제2항에 따라 설치된 행정시를 포함한다)ㆍ군ㆍ구(자치구인 구를 말한다)안의 지역」, 「상속세 및 증여세법 시행령」 §16②1호나 = 「농지등이 소재하는 시(특별자치시와 …행정시를 포함한다)ㆍ군ㆍ구(자치구를 말한다), 그와 연접한 시ㆍ군ㆍ구 또는 해당 농지등으로부터 직선거리 30킬로미터 이내」. 「구=자치구」·「시에 특별자치시·제주 행정시 포함」·「연접」·「30km」가 모두 일치한다. 따라서 두 세목을 같은 알고리즘으로 미러하는 것 자체는 법령상 정당하며, 미러가 결함이 아니라 미러된 알고리즘의 「구」 해석이 양쪽 모두에서 틀렸다(V3-b·V3-c). 차이는 두 가지뿐이고 이번 판정과 무관하다 — ①소령 §153③은 「경작개시 당시에는 당해 지역에 해당하였으나 행정구역의 개편 등으로 이에 해당하지 아니하

- **V5-c** — 「엔진이 불리한 쪽으로 합쳐 버려 저장소 정책과 정면 충돌한다」는 프레이밍
  - 기각 사유: 이 동작은 실수가 아니라 **명시적으로 채택된 설계 결정**이다. docs/reviews/transfer-tax-code-review-2026-08.md:1866이 F30 처방으로 「편입일이 없으면 ⑤1호 미충족으로 처리(**자동 통과 fallback 금지**) — 실질 영향은 checkIncorporationGrace가 이미 끊으므로 없다」를 적었고, 같은 문서 :1883은 「편입일 미제공 시 reason 문자열이 바뀐다」까지 부수효과로 예고했다. 그 처방이 farmland.ts:236-243으로 구현되어 있고 __tests__/tax-engine/non-business-land/review-2026-08-f30.test.ts:98이 「F30-4: 편입일 미제공 → 기산점 부재로 미충족 (자동 통과 fallback 금지)」로, period-criteria.test.ts:138이 「편입일 미제공 → 미적용」으로 고정한다. 나아가 농지·목장은 조문 구조상 **편입 3년 유예가 납세자가

- **V5-e** — 「2015-02-02 연혁 스위치(2년/3년)를 임야가 재사용하는 것이 부당하다」는 의혹
  - 기각 사유: 임야에도 2년→3년 연혁이 **실재한다**. 「소득세법 시행령」 §168의9①2호 단서는 2015-01-01 시행본에서 「…편입된 날부터 **2년**이 경과한 임야를 제외한다」였고, 대통령령 제26067호(2015.2.3. 공포·시행)로 「**3년**」이 되었다. 농지 §168의8⑥(2년→3년, <개정 2015.2.3>)·목장 §168의10⑤(2년→3년, <개정 2015.2.3>)와 **같은 개정령에서 함께** 바뀌었다. 따라서 `checkIncorporationGrace`의 연혁 스위치를 임야가 공유하는 것은 법령상 타당하고, E3-05가 「확인 필요」로 남긴 의혹은 해소된다. 다만 period-criteria.ts:315 주석은 「§168-8 ⑥ 농지 / §168-10 ⑤ 목장」만 적어 임야(§168의9①2호 단서)를 빠뜨리고 있으므로 주석에 임야를 추가하는 것이 맞다(전용 헬퍼 분리는 불필요).

- **V10-b** — 「서버·엔진이 컴패니언 NBL 중과를 적용할 수 없다 / rate-calc:352가 컴패니언에서 한 번도 발동하지 않는다」는 층위 오귀속
  - 기각 사유: 서버·Zod·엔진은 컴패니언 `isNonBusinessLand`를 **완전히 지원한다**. ⑫ `companionAssetSchema`(lib/api/transfer-tax-schema-sub.ts:463 `isNonBusinessLand: z.boolean().optional()`), ⑭ `bundled-split-helpers.ts:158`(타입)·:388(매핑), 엔진 `transfer-tax-rate-calc.ts:352` 분기 — 전 구간이 배선되어 있고, 페이로드에 값만 실으면 **즉시 발동한다**. 따라서 「어떤 경로로도 적용할 수 없다」는 결론은 맞지만 그 원인을 「엔진 분기가 컴패니언에서 발동하지 않는다」로 적으면 틀린다. 유일한 끊긴 지점은 클라이언트 ⑬(+ UI ⑤)이다. 이 구분은 수정 범위를 가르므로 중요하다 — 서버·엔진을 건드릴 필요가 전혀 없다.

- **V10-c** — 「컴패니언은 NBL 미지원」이라는 의도된 범위 제한일 가능성
  - 기각 사유: 범위 제한이 아니다. 이 저장소는 컴패니언에서 실제로 지원하지 않는 축을 **명시 차단**하는 확립 패턴을 갖고 있다 — `transfer-tax-validate.ts`의 SINGLE_ONLY 목록(부담부증여·겸용주택·재개발 §166·입주권·분양권·일반건물)과 컴패니언 매매사례가액 차단(:203~)이 그것이고, 각 항목에 「침묵 오산보다 명시 차단이 안전하다」는 근거 주석이 붙어 있다. NBL은 그 목록에도, `lib/calc/` 어느 검증에도 없다. 반대로 ⑫·⑭·엔진은 이미 값을 받도록 배선되어 있고(V10-b), 동형 갭(`isUnregistered`)은 「⑫⑭는 있는데 ⑬만 빠졌다」로 **버그 판정 후 수정**된 전례가 anchor 테스트로 남아 있다. 계획 문서들이 「companion 자산은 NBL raw를 전송하지 않음(primary만)」이라 적은 것은 **정밀판정 raw(`nonBusinessLandRaw`)**에 한정된 서술이며, 같은 문장이 「companionAsse

- **COV-8** — 법령검증 매니페스트에 NBL 조문이 빠져 있다는 의심은 반증된다 — §168의6~14 전건 + 시행규칙 §83의4·§83의5가 등록돼 있고 커버리지 테스트가 통과한다
  - 기각 사유: 구멍이 아니다. `additions-transfer-decree.ts:242-325`가 「비사업용 토지 (법 §104의3 위임)」 블록으로 §168의6·§168의7·§168의8·§168의9·§168의10·§168의11·§168의12·§168의13·§168의14를 **9건 전부** 등록하고, :408-421이 복합 인용 뒤쪽 조문인 「소득세법 시행규칙 §83의4」·「§83의5」도 별도 등록한다. 등록 키워드도 조문 본문과 일치한다 — §168의6 엔트리의 「토지의 소유기간의 100분의 40에 상당하는 기간을 초과하는 기간」·「양도일 직전 5년 중 2년을 초과하는 기간」·「양도일 직전 3년 중 1년을 초과하는 기간」과 §168의14 엔트리의 「사용이 금지 또는 제한된 토지」·「보호구역으로 지정된 기간」·「최초의 경매기일」·「최초의 공매일」을 KoreanLaw 본문과 대조해 전부 verbatim 일치를 확인했다. 게이트도 실제로 돈다: `npx vitest run __tests__/lib

- **COV-9** — 다건(multi) 결과 화면이 NBL 판정 근거를 안 싣는다는 의심은 반증된다 — 단건과 같은 공용 컴포넌트를 재사용하고, 별도 렌더러 신설을 막는 소스 동기화 가드까지 있다
  - 기각 사유: 구멍이 아니다. `MultiTransferPropertyBreakdown.tsx:393-411`의 주석이 이 문제가 **이미 발견되어 해소된 이력**임을 밝힌다: 「종전에는 §77·§77의2·§77의3 3종만 인라인 렌더해, 엔진이 `pickReductionDetails`·`pickValuationDetails`로 자산별 breakdown에 실어 보낸 나머지 산출근거(**비사업용 토지 정밀판정**·다주택 중과 상세·§69 자경농지·§155⑳ 등)가 화면에서 버려졌다」. 현재는 단건·일괄과 **같은 공용 컴포넌트**(`ReductionDetailCards`·`ValuationDetailCards`)를 재사용하고, 같은 주석이 「다건 전용 렌더러를 새로 만들지 않는다 — 소스 동기화 가드(`__tests__/api/transfer.route.bundled-swallows-special.test.ts`)가 공용 컴포넌트 파일만 검사하므로, 별도 목록을 두면 같은 침묵 누락이 재발한다」고 


---

## 부록 D — 2차 미확정

### V5-d · ⚪ UNCERTAIN  임야만은 §168의9①2호 「단서」가 과세측 재포섭 구조라, 미입력 시 유예 미적용이 입증책임 배분과 어긋날 소지
- 위치 `lib/tax-engine/non-business-land/forest.ts:215`
- 조문 구조가 3지목에서 동일하지 않다. 농지(§104의3①1호나목)·목장(3호가목)은 「도시지역 소재 = 비사업용(본문)」 + 「편입 3년 미경과 = 제외(납세자 예외)」이므로 편입일 미입증 시 유예 미적용이 자연스럽다. 그러나 임야는 「소득세법 시행령」 §168의9①2호가 **사업용으로 인정하는 요건**(산지 안 시업중 임야)을 규정하고 그 **단서**가 「도시지역 안의 임야로서 도시지역으로 편입된 날부터 3년이 경과한 임야를 제외한다」로 그 인정을 되돌린다. 즉 임야에서는 「편입일부터 3년 경과」가 납세자에게 불리하게 작용하는 **적극적 사실**이고, 그 사실이 미입증인 상태에서 단서를 적용하는 현행 동작은 「법 근거 없이 불리 적용 금지」 원칙과 긴장 관계에 있을 수 있다. 다만 이 판단은 조문 문언만으로는 확정되지 않는다.
- 미확인: 입증책임 배분에 관한 판례·예규를 조회하지 않았다(조문 본문만 대조). search_decisions로 §168의9①2호 단서 관련 심판례를 찾지 못했으므로 UNCERTAIN으로 둔다.

### COV-10 · ⚪ UNCERTAIN  신고서 양식 표에는 「세율」 행 자체가 없어 NBL 중과세율이 서식에 드러나지 않는다 — 상세명세서에는 표시된다
- 위치 `components/calc/results/transfer/FilingFormTableRowDefs.ts:33`
- `buildRowsFromOrder`의 `rowOrder`(FilingFormTableRowDefs.ts:33-66)는 양도일자~지방세 결정세액까지 32행을 정의하는데 **「세율」·「세율코드」·「자산코드」 행이 없다**. 따라서 비사업용 토지의 기본세율+10%p가 신고서 양식 표에 숫자로 드러나지 않고, 산출세액 행에 `singleTaxNotes`(shortTermNote — 「§104①후단: 비사업용 누진세액과 비교한 큰 세액」 등)가 붙을 때만 간접적으로 암시된다(:60, FilingFormTableHelpers.ts:667). 반면 **상세명세서**는 세율을 표시한다: `DetailedStatementHelpers.ts:625`가 `과세표준 × 세율(${formatRatePct(result.appliedRate, result.surchargeRate)})` 형태로 찍는다. 또한 신고서 양식 표에서 NBL을 언급하는 지점은 겸용주택 배율초과 부수토지 파트뿐이고(FilingFormTableHelpers.ts:417·:556-558, FilingFormTableFinancials.ts:17), **단독 비사업용 토지**를 위한 별도 표시는 없다. 장특공 배제 여부는 표시할 것이 없다 — COV-7에서 확인했듯 NBL에도 표1 장특공제가 적용되므로 「장기보유특별공제」 행이 정상 값으로 채워지는 것이 옳다.
- 미확인: 별지 제84호서식 본문 미확보(KoreanLaw `get_annexes` 서식명 매칭 실패). 이 항목은 그 확인 없이는 CONFIRMED/REFUTED 어느 쪽으로도 확정할 수 없어 UNCERTAIN으로 둔다.

