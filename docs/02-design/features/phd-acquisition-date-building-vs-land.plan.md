# 수정 계획서 — PHD 3시점 취득 기준시점: 토지 취득일 → 건물 취득일 정정

- 세목: 양도소득세 (transfer) · §164⑤ PHD 3시점 환산
- 상태: **Plan (착수 전)** · 작성 2026-07-07
- 관련: [[project_transfer_phd_3point_batch_stdprice]] · [[feedback_standard_price_year_164_3_prior]] · [[feedback_tax_calculation_principle]] · [[project_transfer_phd_3point_batch_stdprice]]

---

## §0 문제 (실사례)

- 입력: **건물 취득일(사용승인일) = 2014-09-14**, 신축연도 = 2014. "토지·건물 취득일 다름" ON → **토지 취득일 = 2013-06-01**.
- 증상: 결과탭 계산서 「양도 취득시 · 주택분」이 **2013년 기준**으로 산출됨. 구조/용도/위치 지수표·잔가율·위치지수용 공시지가(2,360,000) 전부 **2013년**.
- **버그(명백)**: 신축연도가 2014인데 취득시 건물기준시가를 **2013년(신축 이전)**으로 계산 — 존재하지 않던 건물을 평가. 잔가율(취득연도−신축연도)이 음수(2013−2014)가 되어 서식상 잔가⑦=1로 왜곡.

## §1 근본 원인 (실측 file:line)

PHD 3시점 위젯의 **취득 기준시점**이 토지 취득일로 고정됨:
- `components/calc/transfer/PreHousingDisclosureSection.tsx:176` — `acquisitionDate={asset.landAcquisitionDate || asset.acquisitionDate}` (주석 "PHD는 토지 취득일 기준").
- 이 `acquisitionDate` prop이 `ThreePointStandardPriceInput`에서 **두 곳**을 구동:
  - `:273-275` `recommendLandPriceYear(referenceDate=acquisitionDate)` → **취득 공시지가 연도**(2013).
  - `:640` `yearOf(props.acquisitionDate)` → 배치 모달 **취득 building valuationYear**(2013).
- 결과: 건물 std·공시지가·토지기준시가 전부 토지 취득일(2013) 기준.

**유래(git blame)**: 이 변경은 2026-04-27 커밋 *"refactor: simplify and clarify calculation formula displays…"* (표시 리팩터)에 끼어든 것. 원래 `asset.acquisitionDate`(건물 취득일)였음 → PHD 세법 판단이 아닌 **부수적 회귀**로 판단.

## §2 세법 판단

- **§164⑤ 3시점 환산은 「주택(개별주택가격)」 환산**이다. 개별주택가격은 토지+건물 일괄. "취득 당시" = **주택(=건물) 취득 시점 = 사용승인일(건물 취득일, 2014)**. 취득 당시 개별주택가격이 미공시라 최초공시 시점으로 역산하는 것이므로, 3시점의 "취득"은 주택 취득일이다.
- **건물기준시가는 신축연도 이전에 존재할 수 없다.** 취득 building valuationYear는 반드시 ≥ 신축연도 = 건물 취득연도. → 2014.
- **공시지가는 건물 위치지수 입력**이기도 하므로(사용자 지적) 건물 취득일 기준이어야 한다.
- **토지 취득일(2013)은 별개 경로**: §166⑥ 토지·건물 양도차익 분리·토지 취득가액 산정용(`lib/calc/transfer-tax-api.ts:143·403`, 엔진). 이 UI 날짜 변경은 §166⑥ 엔진 입력과 **무관**(엔진은 std price를 숫자로 받음 — PHD 엔진 테스트 영향 0).

### ✅ 확정 (사용자 결정 2026-07-07) — 취득시 **토지기준시가** = 건물 취득일(2014)로 통일
단일 공시지가 필드가 건물 위치지수와 토지기준시가(=공시지가×면적)를 동시에 산정. §164⑤가 주택 환산이므로 취득 당시(=주택취득 2014)의 토지기준시가 = **2014 공시지가**로 건물과 동일 시점 통일. 공시지가 필드 분리 없음 → 참조일 1개(건물 취득일)만 교체하면 됨(구현 단순).

## §3 수정 대상 / KEEP 구분

| 위치 | 현재 | 조치 |
|---|---|---|
| `PreHousingDisclosureSection.tsx:176` (단독, **컴포넌트**) | `landAcquisitionDate \|\| acquisitionDate` → ThreePointStandardPriceInput | **CHANGE → `asset.acquisitionDate`**. 이 컴포넌트가 단독+**companion**(`CompanionAcqPurchaseBlock:523`)+**이월과세**(`CarryoverEstimationSection:145·170`) 전부 렌더 → 한 곳 수정으로 전 경로 커버 |
| `MixedUsePreHousingDisclosureSection.tsx:265` (겸용) | `landAcquisitionDate \|\| acquisitionDate` → ThreePointStandardPriceInput | **CHANGE → `asset.acquisitionDate`** (인라인 식, 변수 분리 불요) |
| `MixedUseStandardPriceInputs.tsx:64` `acqReferenceDate` (→ `:328` 취득 상가 공시지가 LandPriceLookupField) | `landAcquisitionDate \|\| acquisitionDate` | **CHANGE → `asset.acquisitionDate`**. `acqReferenceDate`는 `:328` 단독 소비(F5) — 안전 |
| `MixedUsePreHousingDisclosureSection.tsx:77-78·208` `acqDate` (pre-1990 래치 + Pre1990LandValuationInput) | `landAcquisitionDate \|\| acquisitionDate` | **KEEP(토지일)** — 토지등급 §98 환산은 토지 취득일 기준. **:208은 PHD가 아니라 Pre1990 입력**(F1) |
| `CompanionAcqPurchaseBlock:146` 등 기타 토지 전용 | landAcquisitionDate | **KEEP** — PHD 건물 std와 무관 |

**정정(F1)**: 겸용 CHANGE 사이트는 `:208`이 아니라 `:265`. `:208`은 `Pre1990LandValuationInput`에 `acqDate`(토지일)를 넘기는 **KEEP** 지점. `:265`는 `landAcquisitionDate || acquisitionDate` **인라인**이라 변수 분리 불필요. `acqDate`는 pre-1990 전용으로 전부 유지.

## §3.5 자가검토 결과 (2026-07-07, 실측)

**판정: 계획 유효 — 정정 1건(F1, 잘못된 라인)·정밀화 4건. 실측으로 CHANGE/KEEP 확정.**

| # | 발견 | 조치 |
|---|---|---|
| **F1** ⚠오류 | 겸용 CHANGE 사이트를 `:208`로 적었으나 `:208`은 `Pre1990LandValuationInput`(토지 환산) — **KEEP**. 실제 CHANGE는 `:265`(ThreePointStandardPriceInput 인라인). 잘못 고치면 pre-1990 파손 | §3·§4 정정 |
| **F2** 강점 | `PreHousingDisclosureSection`(컴포넌트)은 단독+companion(`CompanionAcqPurchaseBlock:523`)+이월과세(`CarryoverEstimationSection:145·170`) 전부 렌더 → `:176` 한 곳 수정이 전 경로 커버 | §3 반영 |
| **F3** 나노스 | `recommendLandPriceYear`(≤5월=전년)와 `yearOf`(원년)는 ≤5월 취득 시 정당하게 다름. 본 사례 9.14는 둘 다 2014 | §6 anchor 분리 |
| **F4** 확인 | 엔진 fixture "2013 공시지가" = 숫자 픽스처, UI 날짜→연도 미검증 → 버그 미고정·엔진 무영향 | 회귀 무관 확인 |
| **F5** 확인 | `acqReferenceDate`는 `:64` 정의·`:328`만 소비 → 정의 교체 안전 | §3 반영 |

## §4 수정 내용

**3개 인라인 식 교체** (변수 분리·신규 헬퍼 불요):
1. `PreHousingDisclosureSection.tsx:176` `asset.landAcquisitionDate || asset.acquisitionDate` → `asset.acquisitionDate`.
2. `MixedUsePreHousingDisclosureSection.tsx:265` 동일 교체.
3. `MixedUseStandardPriceInputs.tsx:64` `acqReferenceDate` 정의 동일 교체(→ `:328`만 소비).
4. 각 지점 회귀 방지 주석: "PHD 3시점 취득 시점 = **건물 취득일**(§164⑤ 주택 환산·건물 위치지수·신축연도 이후). 토지 취득일 아님(2026-04 회귀 정정)."
5. **토글 OFF(취득일 동일) 시 무변화**: `landAcquisitionDate` 비면 `landAcquisitionDate || acquisitionDate === acquisitionDate` → 종전과 동일. 변경은 **토지·건물 취득일 다름 ON**일 때만.
6. 저장된 수동 override(`phdLandPriceYearAtAcqIsManual`) 보존 — 참조일 변경 시 자동값만 재추천, 수동 세팅 유지.
7. `acqDate`(MixedUsePreHousingDisclosureSection:77)는 **손대지 않음** — pre-1990 래치·Pre1990 입력 전용(토지일).

## §5 영향·리스크

- **블라스트 반경 최소**: 토지≠건물 취득일(toggle ON) 케이스만 값 변동. 그 외 회귀 0 기대.
- **엔진 무관**: std price를 숫자로 받는 엔진·§166⑥ 분리·PHD 엔진 테스트 불영향.
- **Case A(겸용) 회귀 확인 필수**: 최근 PR#523/#525에서 만든 Case A 4부분·계산서 스냅샷이 취득 연도 변경에 안전한지 anchor/E2E로 확인(기존 fixture는 취득=신축=2010이라 미발현이나 신규 케이스 추가).
- **결과탭 계산서 자동 정정**: 취득 building std가 건물연도로 산출되면 [[project_transfer_phd_3point_batch_stdprice]] PR#525 계산서도 자동으로 건물연도·정상 잔가율 표시.

## §6 검증 계획

> 이 버그는 **UI 배선(참조일 선택)**이라 순수 헬퍼로는 잡히지 않음(`recommendLandPriceYear`/`yearOf` 자체는 정상). 렌더/E2E로 "어느 날짜가 흐르는지"를 검증한다.

- **anchor(컴포넌트 RTL, 신규·RED 우선)**: `PreHousingDisclosureSection`을 `{acquisitionDate:"2014-09-14", landAcquisitionDate:"2013-06-01"}`로 렌더 → 취득 공시지가 연도 자동 = **2014**(2013 아님). 수정 전 RED(2013)→후 GREEN. (겸용 `MixedUsePreHousingDisclosureSection`도 동형 1건.)
- **파생 분리 확인(F3)**: 배치 building valuationYear = `yearOf(건물취득일)`, 공시지가 연도 = `recommendLandPriceYear(건물취득일)`. 본 사례(9.14, 6/1 이후)는 **둘 다 2014**. (≤5월 취득이면 공시지가=전년·valuationYear=당년으로 정당하게 다름 — anchor는 9.14로 고정해 conflate 회피.)
- **E2E**: 단독 PHD + "토지·건물 취득일 다름"(토지 2013·건물 2014) → 일괄 모달 "취득시 (2014년)" + 취득 공시지가 연도=2014 + 결과탭 계산서 「양도 취득시」=2014·잔가율 정상. (기존 `transfer-phd-building-stdprice-calculator.spec.ts` 확장.)
- **회귀**: 토글 OFF(T1~T8) 불변. 겸용 Case A/B(T4~T7, 취득=신축 fixture) 불변. **pre-1990 토지 래치·Pre1990 입력(acqDate) 불변**(F1 KEEP). 엔진 fixture(2013 숫자) 무영향(F4).
- **자기일관성**: 취득 building valuationYear ≥ 신축연도 항상 성립(2013<신축 재발 차단).

## §7 미확정 / 확인 완료

1. ✅ **취득시 토지기준시가 시점 = 건물 취득일(2014) 통일** (사용자 확정 2026-07-07).
2. ✅ `MixedUseStandardPriceInputs.tsx:328`은 Case A "취득시 개별공시지가(상가)" LandPriceLookupField(취득 당시 동일 토지/건물 조회) — 취득 시점 전담 확인. `acqReferenceDate`는 `:328` 단독 소비(자가검토 F5).
3. 남은 확인 없음 — Do 착수 가능.

## §8 Definition of Done

- [ ] 토지≠건물 취득일 시 취득 building std가 **건물 취득연도(≥신축)** 로 산출
- [ ] 취득 공시지가 연도 자동값 = 건물 취득연도
- [ ] pre-1990 토지등급 환산 래치는 토지 취득일 유지(회귀 0)
- [ ] 토글 OFF·겸용 Case A/B 회귀 0
- [ ] anchor(취득 point year=건물연도) + E2E green · tsc 0 · vitest 전체 green
- [ ] 코드 품질 게이트 High/Medium 0
