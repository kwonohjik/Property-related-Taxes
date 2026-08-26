# 건물 기준시가 계산기 · 기준시가 조회/환산 적용 경로 — 코드리뷰 (2026-08-26)

> 대상: 두 축을 묶어 리뷰. ①건물 기준시가 계산 도구(엔진·데이터표·UI·국세청 계산서) ②기준시가 조회 API 및 환산취득가액 적용부.
> 기준 커밋 `05ac8a4d` · 워크트리 `PRT-review-standard-price` · 브랜치 `review-standard-price`.
> 방식: 11축 병렬 탐색 → 발견 건마다 적대적 검증(critical/high는 재현 렌즈 + 반증 렌즈 2중) → 뮤테이션 안전망 실측 → 종합·완결성 비판.
> 규모: 에이전트 91 · 도구호출 3,164 · 소요 약 115분 · 대상 약 12,100 LOC.

## 처리 상태 (2026-08-26 갱신)

**critical 4건 수정 완료** — Pre-Do anchor 선행 후 수정, 전체 회귀 통과.

| # | 결함 | 수정 | anchor |
|---|---|---|---|
| F-01 | 「산」 공백 분리 → 대지구분 미인식 | `route.ts:99` 직전 토큰이 정확히 `"산"`인 경우 추가 (「산성동」·「산북면」 오탐 없음) | `__tests__/api/address-standard-price-pnu-san.anchor.test.ts` 11건 |
| F-02 | §164⑧ 취득전기 용도번호 재사용 | `resolvePrevUsageNo()` 신설 — 동명 항목 매칭(**오산 208건 해소**), 무매칭 시 fallback 유지 + **경고** | `sec164-8-prev-usage-drift.anchor.test.ts` 9건 |
| F-03 | 다필지 시 조정률 직접입력 소실 | `resolveCompositeParts()` **fallback 분기에만** `adjustmentRate` 탑재 (`compositeParts` 경로 불변) | `land-parcels-manual-adjustment.anchor.test.ts` 10건 |
| F-04 | ㎡당 절사 float 오차 | `stdPriceFromExactPerM2()` 신설 — 잔가율(10⁴)·조정률(10¹⁴)을 정수 분수로 되돌려 BigInt 정확 산술 | `per-m2-float-truncation.anchor.test.ts` 11건 |

- 변경 규모: 소스 3파일 **+82 / −4** · anchor 4파일 41건 신규.
- 회귀: `npx tsc --noEmit` 0건 · eslint 0건 · **vitest 전건 1,542파일 16,818건 통과 · 실패 0**.
- 수정 전 anchor 상태: **17건 실패 / 24건 통과**(실패는 전부 의도한 결함 고정, 통과는 사실 고정·대조군·역방향 가드).

### high 배치 (2026-08-26 · 2차)

**9건 중 7건 완료 · 1건 부분 완료 · 1건 착수 불가.**

| # | 결함 | 수정 | anchor |
|---|---|---|---|
| F-05 | VII-37 범위검증 (100배·음수·0원) | `normalUseRatioError` 공용 술어 — 엔진 throw + ⑧ validate 동일 메시지 | `vii37-normal-use-ratio-range` 11건 |
| F-06 | 대수선 잔가율 (10.6배·3000년 입력 146배) | 잔가율 **정의상 상한 `Math.min(…, 1)`** + `remodelYearError` 공용 술어 | `remodel-residual-bounds` 10건 |
| F-07 | 시군구 코드 개편 미정규화 | `expandSigunguAliases` 를 **4지점 + 필지조인**에 배선(매칭된 코드로 파티션 로드) | `commercial-stdprice-sigungu-alias` 5건 |
| F-08 | 가중평균 위치지수 강등 | micro-㎡ 정수 분수 — 몫이 정수면 그 정수 사용 | `weighted-land-price-boundary` 11건 |
| F-10 | 복합 부분 간 II 연면적 불일치 | 조기반환 조건을 **건물 단위**로(`buildingHasAnyFeatures`) | `composite-gross-area-uniformity` 7건 |
| F-11 | 보유월수 TZ 의존 | **UTC 통일** + 로컬 자정 호출부 2곳 + 기존 anchor `D()` 정정 | `std-price-months-tz` 9건 |
| F-12 | 단일시점이 §164⑧ 연도교차 가로챔 | `isSameAdjustmentPeriodConversion` 공용 leaf — **엔진·④변환·⑧검증·UI 네 층** | `single-timepoint-cross-year-164-8` 11건 |
| F-13 | 복합 적용 버튼 가드 부재 | `planApplyButtons` 순수 leaf 추출 — 단건·복합이 같은 축의 가드 | `building-std-apply-buttons` 9건 |
| **F-09** | II 연면적 `{}` 게이트 (±10~20%) | ⛔ **착수 불가 — 고시 원문 필요** | — |

- 회귀: `npx tsc --noEmit` 0건 · `npm run lint` **0 errors**(변경 파일 경고 0) · vitest **1,550파일 16,892건 통과 · 실패 0**.
- 신규 anchor 9파일. F-13 은 수정이 선행돼 **뮤테이션으로 구별력을 실측**했다(가드 제거 시 2건 실패, `showBoth` 축소 시 1건 실패).

#### 실측이 리뷰 서술을 넓힌 것 3건

1. **F-11 은 「엔진이 TZ 의존」보다 넓다** — 호출부 3곳이 서로 다른 날짜 규약을 썼다(엔진 `toDate`=UTC자정 / 사이드바 `T00:00:00`=로컬자정 / lookup `new Date(y,m,d)`=로컬). **같은 자산인데 사이드바와 엔진의 보유월수가 갈릴 수 있었다.** 기존 anchor 28건은 로컬 날짜를 먹여 프로덕션 형태를 한 번도 태우지 않았다(KST 실측: 6→7 · 12→13 · 1→2).
2. **F-08 은 지가가 모든 필지에서 같아도 발생한다** — 66.67㎡ + 12.34㎡ 둘 다 500,000원/㎡ 이면 정확 평균이 당연히 500,000인데 float 가 499999.99999999994 를 내 위치지수가 **98→94(4포인트)** 떨어졌다. 4,096셀 격자 중 59건.
3. **F-06 은 3000년 대수선 입력이 잔가율 14.41(146배)로 통과**했다. 유효 입력만으로도 잔가율 1 초과가 925건.

#### F-12 는 UI 를 함께 열어야 했다

엔진만 고치면 §164⑧ 경로가 요구하는 취득당시 구조·용도·공시지가가 `transferOnly` 로 숨겨져 있어 「취득시: 구조 미선택」 throw 로 바뀌는 **dead-end** 가 된다. `singleActive` 도 같은 leaf 를 쓰게 해 2시점 입력이 함께 복원되도록 했다. 부수적으로 **역순 연도(양도 < 취득)** 하한도 leaf 에 넣었다(F-16 축 일부).

#### 남은 것

- **F-09 착수 불가** — 「특성 미선택 시 II 연면적을 적용하는 것이 옳은가」는 국세청 조정률 고시 적용요령 (2)·(4) 본문이 있어야 판정된다. 어느 방향으로 통일해도 공식 계산사례 anchor 가 깨진다. F-10 은 **방향 무관한 부분**(부분 간 불일치)만 고쳤고 「특성이 아예 없으면 1.0」은 종전 그대로 뒀다.
- **F-07 잔여** — 별칭 테이블이 전남·광주 24건 + 전주 2건뿐이다. 강원(42→51)·전북 나머지는 없다. 배선은 끝났으나 **표 확충이 별건**이며, `/data/stdprice/` 산출물이 워크트리에 없어 실배포 manifest 키는 미확인이다. 필지조인은 시군구 5자리만 정규화했다(읍면동 재부여 여부 미확인).
- **F-41 잔여** — VII-37 의 `Math.round(ratio*100)` 양자화 때문에 0 < ratio < 0.005 는 범위검증을 통과하고도 기준시가 0원이 된다. 양자화 제거는 고시 확인이 선행 조건이라 제외했다(anchor 에 characterization 으로 기록).
- ⚠️ `lib/calc/building-std-price-form.ts` 가 **852줄**로 800줄 정책 초과 상태다. 다만 이번 수정 **전에 이미 837줄**이었고 분리는 별건이다.

### F-02 무매칭 95건 — 설계문서와 다른 방향을 채택했다

설계문서 `engine.design.md:203-204`는 「동명 매칭 실패 시 **검증 오류**」로 정했으나 채택하지 않았다. 실측 근거:

- 무매칭 95건의 상당수가 **번호는 그대로이고 표기만 바뀐 것**이다 — 2010 #3 「다중주택·다가구**주택**…」→「다중주택·다가구…」(지수 100 동일). 검증 오류로 막으면 정상 계산이 대거 차단된다.
- `prevUsageNo` 입력 위젯이 저장소에 없다(writer 0건). 차단하면 사용자가 해소할 수단이 없는 **dead-end**가 된다.
- 실제로 다른 용도인 조합도 섞여 있다(2010 #7 「고시원」 ↔ 2009 #7 「여인숙」, 지수 100↔90) ⇒ 경고로 가시화한다.

⇒ **동명 매칭 + 무매칭 시 경고**. 국세청 고시의 용도 대응표를 확보하면 재판단할 것.

### 전수 실측 — 용도번호 드리프트 (2001~2026, 1,341조합)

| 군 | 건수 | 내용 |
|---|---|---|
| S | 926 | 번호·라벨 동일 — 무영향 |
| A | 351 | 번호는 있으나 라벨 상이 = **지수까지 다름 208** + 지수 동일 48 + 동명무매칭 95 |
| C | 64 | 번호가 전년도 표에 아예 없음 — 현재도 차단(그중 38건은 2001년 = 별건 F-18) |

라벨 정규화(괄호·「등」 제거)는 채택하지 않았다 — 회수되는 건 19건뿐인데 「관광호텔(특1·2등급)」류가 서로 충돌할 위험이 있다.

---

## 판정 요약

| 등급 | 건수 |
|---|---|
| 🔴 critical | 4 |
| 🟠 high | 11 |
| 🟡 medium | 25 |
| ⚪ low | 6 |
| **합계** | **46** |

확증(CONFIRMED) 41 · 판정 갈림(SPLIT) 5 · 완전 반증 1건(목록 제외).

### 관통하는 뿌리 다섯

1. **정수 규약 이탈** — `calcPointBreakdown`이 지수 3개만 정수곱하고 잔가율·조정률·면적·산정기준율은 raw float로 곱해 절사 직전에 값을 떨어뜨린다 (F-04·F-08·F-31·F-32·F-33·F-42). 저장소는 같은 결함을 `applyFairMarketRatio`·`same-adjustment-period-std-price`에서 이미 두 번 진단·정정했는데 이 엔진만 규약 밖이다.
2. **연도축 재사용** — 취득전기 용도번호를 전년도 표에 그대로 조회(F-02), 시군구 코드 개편 미정규화(F-07), 「산」 대지구분 미인식(F-01).
3. **게이트 술어가 층마다 갈림** — 단일시점·연도교차 §164⑧이 UI·④변환·⑧검증·엔진 네 곳에서 서로 다른 조건을 본다 (F-12·F-16·F-24·F-25·F-36).
4. **「특성 객체가 비면 조정률을 끈다」는 조기반환이 자동 항목(II 연면적)까지 함께 끈다** (F-09·F-10).
5. **범위 검증 부재** — VII-37 비율·대수선연도에 상·하한이 ⑧에도 엔진에도 없어 오입력이 100배·10.6배로 증폭된다 (F-05·F-06).

---

## 결함 목록

| # | 등급 | 판정 | 축 | 위치 | 제목 |
|---|---|---|---|---|---|
| 1 | 🔴 critical | CONFIRMED | D9 | `app/api/address/standard-price/route.ts:98` | 주소검색이 주는 「산」 지번을 PNU 대지구분으로 못 읽어 다른 필지의 공시지가·면적이 조용히 반환된다 |
| 2 | 🔴 critical | CONFIRMED | D2·D7 | `lib/tax-engine/building-standard-price.ts:466` | §164⑧ 제1산식이 취득연도 용도번호를 취득전기 표에 그대로 조회 — 입력 위젯이 프로젝트 전체에 없다 |
| 3 | 🔴 critical | CONFIRMED | D1 | `lib/tax-engine/building-standard-price.ts:136` | 다필지 부속토지를 켜면 상증 조정률 직접입력이 통째로 버려진다 |
| 4 | 🔴 critical | CONFIRMED | D1·D4 | `lib/tax-engine/building-standard-price-helpers.ts:162` | ㎡당 금액의 잔가율·조정률 곱이 raw float라 1,000원 절사가 한 칸 내려간다 — 항상 과소 한 방향 |
| 5 | 🟠 high | CONFIRMED | D3 | `lib/tax-engine/building-standard-price-helpers.ts:638` | VII-37 정상사용면적비율에 상·하한 검증이 없어 백분율 오입력이 그대로 배율이 된다 (기준시가 100배) |
| 6 | 🟠 high | CONFIRMED | D3 | `lib/tax-engine/building-standard-price-helpers.ts:98` | 대수선 잔가율 할증에 상한이 없어 정상 범위 입력에서도 잔가율이 1을 넘는다 (기준시가 10.6배) |
| 7 | 🟠 high | CONFIRMED | D9 | `app/api/address/commercial-standard-price/route.ts:88` | 상가·오피스텔 기준시가 라우트가 시군구 코드 개편을 정규화하지 않아 전남·광주·전주가 「미고시 물건」으로 안내된다 |
| 8 | 🟠 high | CONFIRMED | D4 | `lib/tax-engine/building-standard-price-helpers.ts:201` | 다필지 가중평균 공시지가의 float 나눗셈이 위치지수 구간을 한 칸 강등시킨다 — 주석의 「구간 경계 영향 없음」은 반증됐다 |
| 9 | 🟠 high | CONFIRMED | D3 | `lib/tax-engine/building-standard-price.ts:269` | 조정률 「특성」 모드에서 아무것도 고르지 않고 적용하면 II 연면적 조정률이 조용히 붙는다 (화면은 미선택과 동일) |
| 10 | 🟠 high | CONFIRMED | D3 | `lib/tax-engine/building-standard-price-helpers.ts:240` | 복합건물에서 건물 전체 항목인 II 연면적이 「부분 특성이 있는 부분」에만 적용된다 |
| 11 | 🟠 high | CONFIRMED | D5 | `lib/tax-engine/same-adjustment-period-std-price.ts:83` | §164⑧ 보유월수 계산이 TZ 의존 — UTC 자정 인스턴트와 로컬 만료일을 비교해 만월 구간이 1개월 절상된다 |
| 12 | 🟠 high | CONFIRMED | D1·D6 | `lib/tax-engine/building-standard-price.ts:354` | 단일시점(양도) 모드가 연도교차 §164⑧ 창을 가로채 보유월수·취득전기 공시지가가 엔진에 도달하지 않는다 |
| 13 | 🟠 high | CONFIRMED | D6·D7 | `components/calc/building-std-price/BuildingStdPriceModalButton.tsx:334` | 복합구조 결과의 「취득시/양도시 적용」 버튼에 bothMode 가드가 없어 침묵 no-op 또는 반대 시점 필드 오적용이 된다 |
| 14 | 🟠 high | SPLIT | D10 | `lib/tax-engine/transfer-tax-aggregate.ts:511` | 다건 집계 표시가 §164⑨로 낮아진 환산 분모를 반영하지 않아 취득가액·필요경비가 서로 오분류된다 |
| 15 | 🟡 medium | SPLIT | D2 | `components/calc/building-std-price/BuildingStdPriceForm.tsx:195` | 취득연도 Select 옵션이 2025~1986 하드코딩 — 2026 취득과 「1985년 이전」이 선택 불가 |
| 16 | 🟠 high | SPLIT | D5·D7 | `lib/calc/building-std-price-form.ts:567` | crossYearSameAdjust 하한 술어가 UI에만 있고 플래그 정리 지점이 없어, 창을 벗어나면 해소 불가 차단 또는 역순 연도 §164⑧ 침묵 진입이 된다 |
| 17 | 🟡 medium | SPLIT | D8 | `lib/pdf/BuildingStdReportPdfPages.tsx:140` | 서버 PDF에 ※ 산정기준율 환산표가 없어 복합 취득 ≤2000 계산서가 화면과 다른 금액만 인쇄한다 |
| 18 | 🟡 medium | CONFIRMED | D2 | `lib/tax-engine/data/building-standard-price/usage-index.ts:83` | 취득연도 2001 + §164⑧ 제1산식이 항상 차단된다 — 용도지수만 2000년 fallback이 없다 |
| 19 | 🟡 medium | CONFIRMED | D7 | `components/calc/building-std-price/BuildingStdPriceModalButton.tsx:268` | 「공동주택 고시 전 취득 환산」 결과를 필드로 옮길 적용 버튼이 하나도 없다 |
| 20 | 🟡 medium | CONFIRMED | D9 | `app/api/address/standard-price/route.ts:157` | NED 페이지 수집 루프의 빈 catch가 네트워크 실패를 「공시가격 없음」으로 바꾼다 |
| 21 | 🟡 medium | CONFIRMED | D9 | `scripts/build-commercial-stdprice.ts:250` | 빌드 인코딩 자동감지가 4096바이트에서 잘라 UTF-8 원본을 cp949로 오판 → 파트가 통째로 스킵된다 |
| 22 | 🟡 medium | CONFIRMED | D9 | `scripts/build-commercial-stdprice.ts:119` | manifest coverage가 "full"로 하드코딩돼 변환 결손이 「지역 미고시」와 구분되지 않고 직전 연도 값으로 대체된다 |
| 23 | 🟡 medium | CONFIRMED | D10 | `lib/calc/transfer-tax-api-commercial.ts:118` | 상가 호별고시 후 취득(C-02)에서 「환산취득가 토지분」·「개산공제 토지분」이 항상 0원으로 표시된다 |
| 24 | 🟡 medium | CONFIRMED | D6 | `lib/calc/building-std-price-form.ts:530` | 단일시점 모달에 compositeMode가 stale로 남으면 토글도 입력도 사라진 채 validate만 부분 입력을 요구한다 |
| 25 | 🟡 medium | CONFIRMED | D5 | `components/calc/building-std-price/BuildingStdPriceForm.tsx:587` | 정상 연도교차 §164⑧에서도 양도당시 구조·용도·공시지가 입력이 화면에 남지만 폐기되고, 동일연도와 달리 안내가 없다 |
| 26 | 🟡 medium | SPLIT | D1 | `lib/tax-engine/building-standard-price-helpers.ts:336` | 공용 조정률 미지정 부분의 부속시설 면적이 평가에서 빠지는데 설계가 요구한 경고가 구현되지 않았다 |
| 27 | 🟡 medium | CONFIRMED | D8 | `lib/calc/nts-report-adapter.ts:135` | 취득 ≤2000 단독 경로의 계산서 ⑩ 칸에 환산 후 값이 들어가 표 머리 산식 「⑩ = ⑧ × ⑨」가 깨진다 |
| 28 | 🟡 medium | CONFIRMED | D8 | `components/calc/building-std-price/nts-report/ReportEvalTable.tsx:70` | 조정률 항목이 4개 이상이면 화면 계산서가 조용히 3개만 표시해 ⑧을 재현할 수 없고 PDF와도 어긋난다 |
| 29 | 🟡 medium | CONFIRMED | D8 | `components/calc/building-std-price/nts-report/ReportSection6Total.tsx:44` | ※표 (4) 토지가액·(5) 합계가 미구현 — 취득당시 총합계가 계산서 어디에도 없다 |
| 30 | 🟡 medium | CONFIRMED | D6 | `lib/calc/building-std-snapshot-keys.ts:87` | 스냅샷 키 파서 3함수가 `-first`·`-gb-first` 접미를 인식하지 못해 계산서가 「상속」으로 출력되거나 더미 시점이 한 장 더 나온다 |
| 31 | 🟡 medium | CONFIRMED | D1·D4 | `lib/tax-engine/building-standard-price-helpers.ts:111` | ㎡당 금액 × 연면적의 Math.floor가 raw float라 소수 면적의 6.4%에서 기준시가가 1원 적게 나온다 |
| 32 | 🟡 medium | CONFIRMED | D4 | `lib/tax-engine/building-standard-price-helpers.ts:444` | 기계식주차 특수산식이 정수×잔가율을 raw float로 곱해 1원 과소 — 절사 단위가 1,000원이 아니라 보호막이 없다 |
| 33 | 🟡 medium | CONFIRMED | D4 | `lib/tax-engine/building-standard-price-helpers.ts:482` | 산정기준율 적용 시 floor 순서가 단독·복합 경로에서 달라 같은 건물이 화면 모드에 따라 1원 갈린다 |
| 34 | 🟡 medium | CONFIRMED | D1 | `lib/tax-engine/building-standard-price.ts:492` | §164⑧ 환산 결과의 양도 breakdown이 취득 echo를 통째로 물려받아 결과 카드 산식이 자기모순이 된다 |
| 35 | 🟡 medium | CONFIRMED | D3 | `components/calc/building-std-price/BuildingStdValuationSections.tsx:184` | 조정률 요약 칩만 ctx에 structureKey를 넘기지 않아 통나무조 최고층수 제외가 반영되지 않는다 (칩 130% vs 엔진 90%) |
| 36 | 🟡 medium | CONFIRMED | D5 | `components/calc/building-std-price/BuildingStdPriceForm.tsx:485` | 취득연도 2001이 「2000년 이전 취득」 UI 분기에 함께 걸려 적용되지도 않는 §164⑤ 환산 안내를 띄운다 |
| 37 | 🟡 medium | CONFIRMED | D2 | `lib/tax-engine/data/building-standard-price/residual-rate.ts:26` | 잔가율 데이터 주석의 「신공법은 선택 불가 → 실무 영향 없음」이 사실이 아니다 — 미검증 추정 내용연수가 실제 산출에 반영된다 |
| 38 | 🟡 medium | CONFIRMED | D2 | `lib/tax-engine/data/building-standard-price/structure-index.ts:14` | 구조지수 헤더 주석과 2013년 데이터가 불일치 — 「스틸하우스조를 4행(100)에 포함」이라 적었으나 데이터는 90 |
| 39 | 🟡 medium | CONFIRMED | D11 | `lib/legal-verification/coverage-collect.ts:21` | 건물 기준시가 legal-codes 모듈이 verify:legal 커버리지 수집기에서 통째로 빠져 게이트가 100%로 통과한다 |
| 40 | 🟡 medium | CONFIRMED | D11 | `lib/legal-verification/manifest/additions-transfer-decree.ts:165` | 소득세법 시행령 §164 매니페스트 키워드가 제1·2항에서만 뽑혀 이 기능이 의존하는 ③⑤⑧ 개정은 감시되지 않는다 |
| 41 | ⚪ low | CONFIRMED | D3 | `lib/tax-engine/building-standard-price-helpers.ts:638` | VII-37 비율을 Math.round로 정수 퍼센트에 양자화해 조정률이 입력 비율과 ±0.5%p 어긋난다 |
| 42 | ⚪ low | CONFIRMED | D10 | `lib/tax-engine/general-building-converted-housing.ts:127` | 환산주택가격 override가 토지분을 원/㎡로 왕복 절사해 취득당시 기준시가 합계가 환산액보다 작아진다 |
| 43 | ⚪ low | CONFIRMED | D10 | `components/calc/transfer/CommercialBuildingBlock.tsx:414` | 상가·오피스텔 「최초고시시(2005) 건물 기준시가」 칸에만 계산기 런처가 배선돼 있지 않다 |
| 44 | ⚪ low | CONFIRMED | D7 | `components/calc/building-std-price/MultiPointBuildingStdPriceModal.tsx:666` | 일괄 계산 모달 결과 행에만 「원」 접미사가 붙는다 |
| 45 | ⚪ low | CONFIRMED | D8 | `lib/pdf/BuildingStdReportPdfPages.tsx:140` | Ⅵ 절 제목이 화면은 「부속토지」, PDF는 「부수토지」로 다르게 인쇄된다 |
| 46 | ⚪ low | CONFIRMED | D11 | `components/calc/building-std-price/BuildingStdPriceForm.tsx:513` | 취득 ≤2000 공시지가 입력 hint가 2001.1.1 기준일 근거를 소득세법 시행령 §164⑤ 단독으로 제시한다 |

---

## 상세

### F-01 · 🔴 critical · CONFIRMED — 주소검색이 주는 「산」 지번을 PNU 대지구분으로 못 읽어 다른 필지의 공시지가·면적이 조용히 반환된다

- **위치**: `app/api/address/standard-price/route.ts:98` (축 D9)
- **주장**: buildPnu가 지번의 **마지막 토큰만** `startsWith("산")`으로 검사하는데, 앱 자신의 검색 라우트가 주는 Vworld parcel은 「… 부암동 산 2-1」로 「산」이 공백 분리된 별개 토큰이다. landType이 항상 "1"(대지)로 남아 같은 법정동 동일 번호 일반지번을 조회하고, 그 필지가 실재하면 404가 아니라 200 + 다른 필지 값이 나간다.
- **근거**: route.ts:94-98 `const parts = jibun.trim().split(/\s+/); let token = parts[parts.length - 1] ?? ""; … if (token.startsWith("산"))` — 재확인 완료. 토지 조회 호출부 10곳이 pnu 없이 jibun만 보내고(useStandardPriceLookup:80·LandPriceLookupField:113·nbl-land-zone:32 등), address-search.tsx:159가 주석 「jibun이 item.id보다 정확」과 함께 jibun을 우선한다. 두 검증 렌즈 모두 CONFIRMED — 라우트 GET 핸들러 직접 호출로 재현.
- **실패 시나리오**: 「서울 종로구 부암동 산 2-1」 조회 → 42,000원/㎡·10,035㎡ 반환(정답 20,600원/㎡·81,719㎡, 단가 2.04배 과대). 남양주 답내리 산 1은 27,000 vs 3,860(7.0배)에 용도지역도 보전관리↔농림으로 갈린다. 면적이 자동 채워지고(StandardPriceInput:172) 총액까지 자동계산되어 사용자 단서가 없다.
- **법령**: 조회 파라미터 구성 결함(법령 해석 쟁점 아님). 산출값은 소득세법 시행령 제164조 환산취득가액 입력·비사업용 토지 용도지역 판정·재산세/종부세 공시가격 입력으로 흘러간다.
- **제안**: buildPnu에서 마지막 토큰 직전이 "산"인지(`parts[parts.length-2] === "산"`)도 검사하고 기존 `startsWith` 분기는 유지한다(두 표기 모두 실재). 나아가 호출부가 이미 보유한 Vworld item.id(11번째 자리에 산여부 포함)를 pnu로 함께 보내고 라우트가 pnu를 우선하도록 되돌린다.

### F-02 · 🔴 critical · CONFIRMED — §164⑧ 제1산식이 취득연도 용도번호를 취득전기 표에 그대로 조회 — 입력 위젯이 프로젝트 전체에 없다

- **위치**: `lib/tax-engine/building-standard-price.ts:466` (축 D2·D7)
- **주장**: `usageNo: input.prevUsageNo ?? acqPoint.usageNo`로 취득연도 체계 번호를 전년도 용도지수표에서 읽는다. `prevUsageNo`·`prevStructureKey`는 저장소 전체에 writer가 0건(타입 선언 1 + 소비 1)이라 이 fallback이 유일 경로다.
- **근거**: bsp.ts:464-466 재확인. usage-index.ts 헤더가 「★ 시대별로 번호 체계가 다름」을 스스로 경고하고 UI의 `changeYearWithGuard`(Form:208-233)는 연도 변경 시 용도를 무효화하는데 엔진만 재사용한다. 설계문서 engine.design.md:203-204·366은 「동명 항목 매칭, 실패 시 검증 오류」를 명시 — 구현이 설계를 이탈했다. 두 렌즈 CONFIRMED, D2·D7 두 축이 독립 발견.
- **실패 시나리오**: 취득·양도 2014, 용도 #3(관광호텔·지수 140): 2013년표 #3은 「다중주택 등」(지수 100)이라 양도당시 기준시가 227,500,000(정답 201,900,000, +12.7%). 2018 #28도 +23,500,000(+11.85%). 다른 지수를 읽는 (취득연도,용도) 쌍이 12개 연도 225~277조합. 전기 표에 번호가 없으면 반대로 해소 불가능한 검증 오류로 막힌다.
- **법령**: 소득세법 시행령 제164조 제8항 · 소득세법 시행규칙 제80조 제1항 제1호 가목. 용도지수표 자체는 국세청 「건물 기준시가 계산방법」 고시 — 고시 본문 미확인.
- **제안**: 설계대로 `resolveUsageLabel(acqYear, usageNo)` 라벨을 전년도 스킴에서 역매칭하고 실패 시 `BuildingStdPriceError`로 차단한다(라벨 무매칭이 2010년 47중 25건이라 이것만으로는 부족). 스킴 경계 연도에는 「취득전기 용도」 Select를 신설해 ①③④⑧을 함께 배선한다.

### F-03 · 🔴 critical · CONFIRMED — 다필지 부속토지를 켜면 상증 조정률 직접입력이 통째로 버려진다

- **위치**: `lib/tax-engine/building-standard-price.ts:136` (축 D1)
- **주장**: `hasComposite()`가 landParcels만으로 true가 되어 상증 단일 평가가 복합 경로로 빠지는데, 그 경로의 fallback part에는 조정률 사실이 없고 `buildingWideFeatures`도 manual이면 undefined로 꺼진다. resolvePartAdjustment가 adjRate 1.0을 반환하고 결과 echo도 undefined라 화면에 흔적이 없다.
- **근거**: bsp.ts:66 `(input.landParcels?.length ?? 0) > 0` · :136 `input.manualAdjustmentRate == null ? input.specialFeatures : undefined` · :98-105 fallback part는 {label,structureKey,usageNo,floorArea} 4필드뿐 — 재확인. UI 두 토글은 독립이라 동시 활성 가능하고 validate는 음수만 차단한다(form.ts:684). 특성 모드는 같은 다필지 입력에서 정상 적용되므로 대조군이 원인을 「manual 배율만 미전달」로 좁힌다.
- **실패 시나리오**: 상증 2023·cement_brick·용도2·115.16㎡·신축1991·공시지가 2,430,000·조정률 80% → 22,801,680원이어야 할 값이 28,559,680원(조정률 미적용값과 비트 단위 동일), +5,758,000원(+25.3%). 조정률>100%면 반대로 과소.
- **법령**: 상속세 및 증여세법 제61조 제1항 제2호 위임 하의 국세청 「건물 기준시가 계산방법」 고시 개별특성조정률 — 고시 본문 미확인(결함은 「입력이 엔진에 도달하지 않는다」라 해석에 의존하지 않음).
- **제안**: resolveCompositeParts의 **fallback 분기(다필지 전용)에만** `adjustmentRate: input.manualAdjustmentRate`를 실어 compositeParts 실재 시의 부분별 조정률 정본을 보존한다. 차단(validate)은 UI가 독립 토글로 노출하는 정상 입력을 막는 방향이라 권하지 않는다.

### F-04 · 🔴 critical · CONFIRMED — ㎡당 금액의 잔가율·조정률 곱이 raw float라 1,000원 절사가 한 칸 내려간다 — 항상 과소 한 방향

- **위치**: `lib/tax-engine/building-standard-price-helpers.ts:162` (축 D1·D4)
- **주장**: `const raw = perM2Base * residualRate * adjustmentRate;`가 정수 indexProduct에 float를 이어붙인 뒤 곧바로 `truncateToThousand`에 넘긴다. 정확값이 1,000의 배수일 때 IEEE754 결과가 ulp 아래로 떨어져 ㎡당 1,000원이 통째로 사라지고, 면적만큼 배가되어 기준시가에 실린다.
- **근거**: helpers.ts:156-163 재확인 — 바로 위 주석이 「정수곱(부동소수 누적 회피)」인데 회피는 지수 3개까지다. 이 함수는 상증 단일·복합·양도 2시점·§164⑤ 2001 환산·공동주택 환산이 모두 경유하는 단일 지점이며 호출부 7곳 실재. 세 검증 렌즈 모두 존재를 확인했고 severity만 갈렸다(critical 2 : high 1 — 발화가 좁은 조합에 한정된다는 이유).
- **실패 시나리오**: 상증 2001·wood_frame·용도1·공시지가 504,027·신축1980·500㎡ → ㎡당 231,000(정확 232,000), 기준시가 115,500,000(정확 116,000,000, 500,000원 과소). 2025년 rc·용도49도 2,090,000 vs 2,091,000. 조정률 포함 격자 549,315,240 중 4,019건(19개 연도, 2025 포함), 전건 −1,000원 단방향.
- **법령**: 국세청 「건물 기준시가 계산방법」 고시(㎡당 금액 산식·1,000원 미만 절사) — 고시 본문 미확인. 다만 설계문서 engine.design.md:310이 스스로 「부동소수 누적 회피」를 규정했고 CLAUDE.md 정수 연산 규칙(applyRate/safeMultiply)에도 어긋난다.
- **제안**: 잔가율은 이미 소수 4자리로 양자화되어 있으므로 `Math.round(rr*1e4)`를, 조정률은 `calcSpecialAdjustmentRate` 내부의 정수 분자·분모(100^k)를 그대로 받아 절사 직전까지 정수 분수로 계산한다(현 시그니처가 배율 number만 반환하므로 {numer,denom} 노출이 선행). 회귀 안전망은 기존 anchor 235건이 전건 통과하므로 위 격자 스캔을 anchor로 승격해야 한다.

### F-05 · 🟠 high · CONFIRMED — VII-37 정상사용면적비율에 상·하한 검증이 없어 백분율 오입력이 그대로 배율이 된다 (기준시가 100배)

- **위치**: `lib/tax-engine/building-standard-price-helpers.ts:638` (축 D3)
- **주장**: `groupVII.push({ no: 37, rate: Math.round(features.normalUseRatio * 100) })`이 입력을 그대로 지수화하고, 0~1 범위 검증이 엔진에도 `validateBuildingStdPriceForm`에도 없다. 모달 입력은 max 없는 자유 DecimalInput이고 hint에 「0~1」이라고만 적혀 있다.
- **근거**: helpers.ts:637-638 재확인. 같은 파일의 형제 경로 `adjustmentFromNos`(:264)는 도메인 밖 번호를 `BuildingStdPriceError`로 차단하므로 저장소 관행은 「도메인 밖 = 검증 오류」이고 비율 입력형만 예외다. 두 렌즈 모두 CONFIRMED, 단일·복합 부분 경로 양쪽에서 재현.
- **실패 시나리오**: 상증 2025·rc·비주거·500㎡·공시지가 7,500,000에서 0.85 대신 85 입력 시 조정률 76.5, 기준시가 429,500,000 → 42,959,000,000(100.02배). validate는 null(통과), warnings 빈 배열. 음수(-0.5)도 통과해 조정률이 -0.45가 된다.
- **법령**: 국세청 「건물 기준시가 계산방법」 부속 조정률 고시 VII-37(정상 사용 면적비율) — 고시 본문 미확인(전사본 special-adjustment-rate.ts:147 기준). 위임근거는 상속세 및 증여세법 제61조 제1항 제2호.
- **제안**: 0 초과 1 이하 범위 검증을 ⑧과 엔진 양쪽에 **같은 술어**로 두어 UI 통과↔엔진 차단 모순을 막는다(정책상 조용한 clamp가 아니라 오류). `wallessRatio`는 구간 판정이라 포화되므로 같이 묶지 말 것 — 별건의 낮은 등급 이슈다.

### F-06 · 🟠 high · CONFIRMED — 대수선 잔가율 할증에 상한이 없어 정상 범위 입력에서도 잔가율이 1을 넘는다 (기준시가 10.6배)

- **위치**: `lib/tax-engine/building-standard-price-helpers.ts:98` (축 D3)
- **주장**: `calcEffectiveResidualRate`가 하한만 `Math.max(0, remodelYear-builtYear)`로 막고, baseResid가 잔존율 하한에 닿은 뒤에도 할증 `step × 경과연수 × 0.3`을 무제한 가산한다. `remodelYear` 범위 검증은 validate에도 엔진에도 없다(같은 파일이 builtYear는 1900~2026으로 검증한다).
- **근거**: helpers.ts:94-100 재확인 — `Math.min` 없음. `remodelYear ≤ valuationYear`인 정상 입력만으로도 유효 도메인 전수에서 33,956조합이 1을 넘고 최대 1.801, 최소 발생 조건은 신축→대수선 간격 67년이다. 기계식주차 경로는 치환식이라 1.0에서 막히고 양도세는 `isInheritanceGift` 게이트로 무관.
- **실패 시나리오**: 경량철골조·신축1940·대수선2010·평가2015·300㎡·공시지가 3,000,000 → validate null, 잔가율 0.1 → 1.045, 건물 기준시가 15,900,000 → 168,300,000(10.6배). `remodelYear > valuationYear` 오타까지 포함하면 537,944조합(최대 2.8).
- **법령**: 국세청 「건물 기준시가 계산방법」 고시 부록 「연도별 잔가율표」 및 대수선 할증률 — 고시 본문 미확인. 저장소 전사본(residual-rate.ts:99)의 치역은 [잔존율, 1.0]이다.
- **제안**: validate에 `builtYear ≤ remodelYear ≤ valuationYear` 범위 검증을 추가한다. 엔진 상한은 `Math.min(1, ...)`만 얹으면 「하한 도달 후 할증」이라는 근본 오류를 감추므로, 그 구간의 산식 자체는 고시 본문 확인 후 결정할 것.

### F-07 · 🟠 high · CONFIRMED — 상가·오피스텔 기준시가 라우트가 시군구 코드 개편을 정규화하지 않아 전남·광주·전주가 「미고시 물건」으로 안내된다

- **위치**: `app/api/address/commercial-standard-price/route.ts:88` (축 D9)
- **주장**: PNU 앞 5자리를 manifest `notice.sigungus`와 파티션 디렉터리에 그대로 대조한다. 주소검색은 항상 현행 코드(광주 동구 12210·여수 12130·전주 완산 52111)를 주는데 개편 이전 고시분은 구 코드(29110·46130·45111)라 조인이 성립하지 않는다.
- **근거**: route.ts:87-88 및 소비 지점 4곳(:112·:124·:137·:144) 재확인 — 정규화 없음. 저장소에 `expandSigunguAliases`/`hasAnySigunguAlias`가 이미 있고 regulated-areas:78·population-decline-areas:164가 쓰는데 이 라우트만 안 쓴다. 두 렌즈 CONFIRMED(구 코드 파티션 + 현행 PNU → no_notice·units 0·availableDates [], 대조군 11110은 ok).
- **실패 시나리오**: 광주 동구 상가 조회 시 dateStatus 전 시점 no_notice → 모달이 「미고시 물건입니다 — 수기 입력하세요」라는 사실 단정을 띄운다. availableDates가 비어 §164③ 직전 고시분 재계산도 죽는다. 광주 5개 자치구는 2005년분부터 전 구간, 전남 시·군은 2023년 확대분부터.
- **법령**: 「전남광주통합특별시 설치를 위한 특별법」(법령ID 015064) 및 「전북특별자치도 설치 및 글로벌생명경제도시 조성을 위한 특별법」. 조회값은 소득세법 시행령 제164조 제3항(직전 고시분) 판단의 입력이다.
- **제안**: 라우트의 sigungu 소비 4지점에 `expandSigunguAliases`/`hasAnySigunguAlias`를 태운다. 단 별칭 테이블은 통합 27개 중 24건만 담고 있으므로(목포·나주·무안 부재) 함께 확장해야 하고, `u.b === bjdCode` 10자리 매칭은 뒤 5자리 재부여 여부를 원본으로 먼저 확인해야 한다.

### F-08 · 🟠 high · CONFIRMED — 다필지 가중평균 공시지가의 float 나눗셈이 위치지수 구간을 한 칸 강등시킨다 — 주석의 「구간 경계 영향 없음」은 반증됐다

- **위치**: `lib/tax-engine/building-standard-price-helpers.ts:201` (축 D4)
- **주장**: `weightedAvgLandPrice`가 `valueSum / areaSum`을 재양자화 없이 반환하고 `resolveLocationIndex`가 `>= boundaries[i]`로 가른다. 정확값이 경계와 일치하는 조합에서 float가 경계 아래로 떨어지면 지수가 한 칸 내려가고, 오차 방향은 강등 쪽 한 방향뿐이다(위로 뜨는 경우는 `>=`라 무해).
- **근거**: helpers.ts:189-202 재확인 — 주석 :191이 「정수 절사 없이 사용(구간 경계 영향 없음)」이라 단정한다. 정확값이 경계에 떨어지는 9,854조합 중 1,300건(13.19%) 강등. 양도 모드는 다필지를 throw로 막으므로 상속·증여 전용. 두 렌즈 CONFIRMED.
- **실패 시나리오**: 상증 2024·rc·500㎡, 부속토지 (10.56㎡×100,000)+(42.24㎡×225,000) → 정확 200,000원/㎡(지수 92)인데 float 199,999.99999999997로 지수 91 → 310,500,000원(정답 314,000,000, 1.11% 과소). 같은 토지를 1필지로 입력하면 정답이 나온다 — 쪼개 적은 방식이 기준시가를 바꾼다.
- **법령**: 상속세 및 증여세법 제61조 제1항 제2호 위임 하의 국세청 「건물 기준시가 계산방법」 고시 §6⑥(면적가중평균) — 고시 본문 미확인.
- **제안**: 면적을 centi-㎡ 정수 스케일로 올려 정확 산술로 몫을 구한 뒤 구간을 판정한다. 현행 float 위에 `Math.floor`만 얹으면 199,999.99999999997 → 199,999로 오히려 고착되므로 순서를 지킬 것. :191 주석도 함께 정정한다.

### F-09 · 🟠 high · CONFIRMED — 조정률 「특성」 모드에서 아무것도 고르지 않고 적용하면 II 연면적 조정률이 조용히 붙는다 (화면은 미선택과 동일)

- **위치**: `lib/tax-engine/building-standard-price.ts:269` (축 D3)
- **주장**: `computeAdjustmentRate`가 `if (!input.specialFeatures) return 1.0;`으로만 게이트해 빈 객체 `{}`(truthy)를 통과시키고, `selectSpecialAdjustment`의 II 연면적 분기는 사용자가 고른 키와 무관하게 `floorArea`만으로 발동한다. 단일 경로만 `pickFeatures` 정규화를 거치지 않는다(복합 경로는 거친다).
- **근거**: bsp.ts:269 및 helpers.ts:585-587 재확인. 섹션 칩이 `Object.keys(...).length > 0`일 때만 뜨므로 `{}`와 `null`이 화면에서 구별되지 않는데(BuildingStdValuationSections:179), 라디오 선택 시 모달이 자동 오픈되고 「적용」 버튼에 disabled 가드가 없다. 두 렌즈 CONFIRMED — 다만 어느 상태가 법적으로 옳은지는 고시 적용요령에 달려 있다.
- **실패 시나리오**: 상증·rc·비주거·500㎡·신축2020·평가2025·공시지가 7,500,000: null 561,500,000 → {} 505,000,000(−10.06%). 20,000㎡면 반대로 22,460,000,000 → 26,940,000,000(+19.9%). 네 경우 모두 validate 통과.
- **법령**: 국세청 조정률 고시 구분 II 연면적(번호 9~13)·적용요령 (4) — 고시 본문 미확인. 저장소의 2023 공표 계산사례 anchor는 비주거가 다른 특성 없이도 연면적 90을 받는 값으로 고정돼 있다.
- **제안**: II 연면적은 사용자 선택이 아니라 면적 자동도출 항목이므로 「항상 적용」/「선택 시에만 적용」 중 축을 확정하고 단일 엔진·복합 엔진·모달 미리보기 세 지점을 한 술어로 묶는다. 어느 쪽이든 `toEngineInput`(form.ts:487)이 복합처럼 `pickFeatures`를 태워 `{}`와 `null`을 같은 입력으로 정규화하는 것이 선행 조건이다.
- **✅ 축 확정 · 🟠 구현은 선행 조건 2건 대기(2026-08-27 고시 조정률표 + 계산사례 13건 전수 실측)**
  - **「항상 적용」이 옳다.** 제2025-39호 제11조 **구분 II** 적용대상은 「최고층수 / 연면적 / 인텔리전트시스템빌딩」이고 단서는 「지하층·옥탑 제외 / 통나무조 제외 / **주거용건물은 아파트에 한해 최고층수기준만**」뿐 — **용도 제한이 없다**. 계산사례 13건 실측에서 **상속 사례 9건이 예외 없이 구분 II 를 받는다**: 근생(라멘)№41 은 「9. 1천㎡ 이하」**만**으로 0.90, 운동시설№24 는 「10. 1천~5천㎡」**만**으로 1.00 — 다른 특성이 하나도 없다.
  - **종전의 「공식 사례 4건이 반증한다」는 오판이었다.** 직업훈련소№33·노인주거복지№35·자원순환№54 는 계산사례 원문에 **「양도 개시일」·조정률 「-(양도세 계산시 미적용)」**으로 적혀 있다. 판매시설№11 은 라벨이 「상속 개시일」이나 조정률 칸이 「-」이고 계산값 79,000 도 미적용이어야 맞는다(적용 시 71,000) — 사례집 라벨 오기다. ⇒ 4건을 `manualAdj: 100` 으로 **출처와 함께 명시 고정**했다(종전에는 `features` 생략으로 암묵 처리돼 축을 가렸다).
  - 🟠 **그런데 지금 고칠 수 없다 — 게이트를 실제로 풀어 실측한 결과 선행 조건 2건이 드러났다**:
    1. **주거 판정이 조정률 모달에 종속돼 있다.** `isResidentialUse` 는 특성 모달 `onApply` 에서만 설정되고(`BuildingStdPriceForm.tsx:770`) 초기값이 `false` 다(`building-std-price-form.ts:283`). ⇒ 모달을 열지 않은 **단독주택 상증 평가가 비주거로 취급돼 9번 0.90 이 잘못 붙는다**(홈택스 gold anchor `phd-batch-per-timepoint` 가 즉시 잡았다). **usageNo 기반 자동 판정이 선행**이다.
    2. **복합은 부분별 주거 판정이 없다.** 건물 단위 플래그 하나뿐이라 1층 근생 + 2·3층 주택 혼합(작성례(3))에서 **주택 부분에도 II 가 붙어** 공식 작성례 171,500,000 이 160,300,000 으로 깨진다(지상2·3 557,000 → 501,000). 계산사례 마.에서 국세청은 지상2·3 단독주택 조정률 칸을 **빈칸**으로 둔다 — 부분별 판정이 정본이다.
  - ⇒ 둘을 갖추기 전에 게이트를 풀면 **주거용에 −10% 를 잘못 적용하는 새 결함**이 생긴다. 그때까지 `{}` ↔ undefined 의 11.2% 괴리를 characterization anchor 로 고정해 **조용한 변화**를 막는다(`gazette-adjustment-auto-apply.anchor.test.ts` 9건).


### F-10 · 🟠 high · CONFIRMED — 복합건물에서 건물 전체 항목인 II 연면적이 「부분 특성이 있는 부분」에만 적용된다

- **위치**: `lib/tax-engine/building-standard-price-helpers.ts:240` (축 D3)
- **주장**: `resolvePartAdjustment`가 `if (Object.keys(merged).length === 0) return { adjRate: 1.0 }`로 빠져나가는데, II 연면적은 merged의 키가 아니라 `buildingTotalArea` 인자에서 자동 도출된다. 건물전체 특성이 비면 특성을 가진 부분만 연면적 조정을 받아 같은 건물·같은 연면적인데 부분마다 적용 여부가 갈린다.
- **근거**: helpers.ts:239-240 및 :585-587 재확인. 연면적과 무관한 구분 III 특성 하나만 추가해도 나머지 부분이 즉시 연면적을 받는다는 격리 실험으로 원인이 확정된다. 두 렌즈 CONFIRMED — 다만 설계문서 composite-adjustment.engine.design.md:109가 이 조기반환을 그대로 담고 있어 구현 드리프트가 아니라 **설계 자체의 결함**이다.
- **실패 시나리오**: 상증 2025·비주거·rc 2부분 각 400㎡(총 800㎡ → 연면적 지수 90), 건물전체 특성 미입력, P1에만 상가1층: P1 1.08 / P2 미적용 → 합계 726,800,000(P2에 90 적용 시 690,800,000, 차 36,000,000). 각 30,000㎡면 방향이 반전돼 8,070,000,000 과소.
- **법령**: 국세청 조정률 고시 구분 II 연면적·적용요령 (4) 「지하층·옥탑 포함 전체면적 기준」 — 고시 본문 미확인. 어느 독법이든 동일 건물 부분 간 불일치는 성립할 수 없다.
- **제안**: 판정을 `selectSpecialAdjustment` 한 곳에 두고 호출부 조기반환으로 흉내 내지 않는다. 수정 시 설계문서 :109와, 연면적 밴드가 중립(100)이라 구별력이 0인 anchor(composite-adjustment.test.ts:31·34)를 함께 고쳐야 회귀를 다시 놓치지 않는다.

### F-11 · 🟠 high · CONFIRMED — §164⑧ 보유월수 계산이 TZ 의존 — UTC 자정 인스턴트와 로컬 만료일을 비교해 만월 구간이 1개월 절상된다

- **위치**: `lib/tax-engine/same-adjustment-period-std-price.ts:83` (축 D5)
- **주장**: `expiryOf`가 from의 **로컬** 컴포넌트로 만료일을 만드는데 라우트가 넘기는 from·to는 `toDate()`가 만든 **UTC 자정**이다. UTC 오프셋이 0이 아닌 모든 런타임에서 잔여 일수 0인 만월 구간에도 §80⑤ 절상이 발동해 N개월이 N+1로 나온다.
- **근거**: same-adjustment-period-std-price.ts:67-83 재확인. z.string().date()가 문자열을 통과시키고 date-coerce.ts:45 `new Date(value)`가 UTC 자정을 만든다. 저장소는 같은 실패모드를 종부세에서 이미 `fullYearsUTC`로 정정한 선례가 있고, 모듈 자신의 anchor 28건은 전부 로컬 `D()`로 호출해 프로덕션 경로를 태우지 않는다. 두 렌즈 CONFIRMED.
- **실패 시나리오**: KST에서 취득 2005-07-01·양도 2005-12-31(정확히 6개월): 가목은 세액 15,728,979 → 18,885,166(+3,156,187). 나목(조정월수 6)은 보유월수 7이 조정월수를 넘어 §164⑧ 환산이 통째로 사라져 양도차익·세액이 0이 된다. CI(UTC)에서는 재현되지 않아 회귀가 구조적으로 잡히지 않는다.
- **법령**: 소득세법 시행규칙 제80조 제5항 「1월미만의 **일수**는 1월로 한다」 — 절상 대상이 일수이므로 잔여 0인 만월에는 발동할 수 없다. 소득세법 시행령 제164조 제8항 위임.
- **제안**: expiryOf와 비교를 UTC 컴포넌트(getUTC*/Date.UTC)로 통일한다(선례: comprehensive-tax-helpers.ts `fullYearsUTC`). 회귀 anchor는 TZ=Asia/Seoul과 TZ=UTC 양쪽에서 만월 구간을 고정해야 한다.

### F-12 · 🟠 high · CONFIRMED — 단일시점(양도) 모드가 연도교차 §164⑧ 창을 가로채 보유월수·취득전기 공시지가가 엔진에 도달하지 않는다

- **위치**: `lib/tax-engine/building-standard-price.ts:354` (축 D1·D6)
- **주장**: §164⑧ 진입 조건은 `transferYear <= acquisitionYear + 1`로 넓어졌는데(:443) 그 위의 단일시점 우회 가드(:354)와 폼 조기반환(form.ts:505)·validate(:729)는 여전히 「연도 동일」만 예외로 둔다. UI는 `singleActive` 가드 없이 토글·§164⑧ 섹션을 렌더하고 validate도 통과시켜, 사용자가 채운 네 필드가 침묵 폐기된다.
- **근거**: bsp.ts:352-356·:443-444, form.ts:503-509·:563-568 재확인. `applyTimePoint="transfer"` 호출부 4곳이 모두 prefill로 acquisitionDate를 넘겨 창 판정이 성립한다. D1·D6 두 축이 각각 엔진 층과 폼 층에서 독립 발견했고 네 렌즈 전부 CONFIRMED. 연도교차 opt-in 계획서에 `singleTimePoint` 언급이 0건 — 후행 기능이 선행 게이트를 갱신하지 않은 드리프트다.
- **실패 시나리오**: 일반건물 「양도시 건물 기준시가 계산」에서 취득2010·양도2011·보유월수14·조정월수12·취득전기 2,800,000 입력 시 2시점 132,200,000 vs 단일시점 129,000,000(차 3,200,000), `sameYearAdjusted` 소실. validate null·warnings [] — 오류·경고·배지 어느 것도 없다. 자산 수준 §164⑧(STEP 0.47)도 두 값이 달라져 함께 꺼지므로 어느 층에서도 적용되지 않는다.
- **법령**: 소득세법 시행령 제164조 제8항 · 소득세법 시행규칙 제80조 제1항 제1호 본문(「취득일이 속하는 연도의 다음 연도 말일 이전 양도」 — 연도 교차 포섭).
- **제안**: 「동일연도 OR (연도교차 창 AND holdingMonths 존재)」를 공용 술어 leaf로 뽑아 엔진 :354·폼 :505·validate :729가 같은 인자를 넘기게 한다. 그 경로는 취득당시 구조·용도·공시지가가 필수이므로 UI의 `!transferOnly` 가드도 함께 풀어야 하며(안 풀면 「취득시: 구조 미선택」 throw), 안내문 Form:461-466도 정정 대상이다.

### F-13 · 🟠 high · CONFIRMED — 복합구조 결과의 「취득시/양도시 적용」 버튼에 bothMode 가드가 없어 침묵 no-op 또는 반대 시점 필드 오적용이 된다

- **위치**: `components/calc/building-std-price/BuildingStdPriceModalButton.tsx:334` (축 D6·D7)
- **주장**: 단건 버튼(:287·:292)에는 `!bothMode && applyTimePoint !== …` 가드가 있으나 복합 버튼(:313·:334)에는 없다. 양도 복합은 엔진이 `acquisition`/`transfer`를 반환하지 않아 `showBothButton`이 구조적으로 false가 되고, 정상 경로인 「취득·양도 모두 적용」 대신 가드 없는 개별 버튼 2개만 남는다.
- **근거**: 모달 :287·:292(가드 있음) vs :313·:334(조건이 result 존재뿐) 재확인. 영향 호출부는 2곳으로 좁혀진다 — LandBuildingSplitSection(both)과 MixedUseAssetMajorStdPrice이며, transferSectionLabel을 넘기는 PHD·재개발 3곳은 토글이 숨겨져 무관. D6·D7 두 축 독립 발견, 네 렌즈 CONFIRMED.
- **실패 시나리오**: (a) LandBuildingSplitSection의 `onApply`가 `buildingStandardPriceAtAcq`에 고정 배선돼 있어 「양도시 적용」이 양도시 값(217,230,000)을 **취득시 칸**에 쓰고 양도시 칸은 비운다. (b) MixedUseAssetMajorStdPrice는 `onApply` 미배선이라 클릭 시 콜백 0회·다이얼로그만 닫히고 스냅샷은 저장돼 「적용됐다」고 오인된다.
- **법령**: 두 필드 용도가 갈린다 — 취득시 = 소득세법 시행령 제164조 제3항 직전 고시분, 양도시 = 소득세법 제99조 제1항 제1호 나목 환산 분모. 조문 본문은 코드 인용 표기를 따랐고 이번에 재확인하지 않았다.
- **제안**: 복합 버튼에 단건과 같은 축의 가드를 걸고, bothMode에서는 `showBothButton` 판정을 `(acquisition ?? acquisitionComposite)`·`(transfer ?? transferComposite)`로 넓혀 통합 버튼 하나만 노출한다(취득 ≤2000은 현행대로 convertedTotal 우선). 회귀는 mixed-use E2E의 「개별 버튼 0개」 단언을 복합구조 켠 상태로 1건 추가해 잠근다.

### F-14 · 🟠 high · SPLIT — 다건 집계 표시가 §164⑨로 낮아진 환산 분모를 반영하지 않아 취득가액·필요경비가 서로 오분류된다

- **위치**: `lib/tax-engine/transfer-tax-aggregate.ts:511` (축 D10)
- **주장**: 환산 자산의 표시용 취득가액을 원시 `standardPriceAtTransfer`를 분모로 재산식하는데, 엔진은 소득세법 시행령 제164조 제9항이 발동하면 낮아진 `resolveConversionDenominatorAtTransfer().denominator`를 쓴다. 취득가액이 과소, 역산되는 필요경비가 같은 금액만큼 과대 표시된다.
- **근거**: aggregate.ts:506-519 재확인 — `tsfStd = r.singleInput.standardPriceAtTransfer ?? 0`. 컴패니언 자산도 §164⑨ 4필드를 Zod·엔진 매핑까지 실어 보내므로 도달 가능. **SPLIT**: 첫 렌즈는 신고서 replica 금액 칸이라 high, 둘째는 세액 불변이므로 medium으로 갈렸다. 두 렌즈 모두 교차검산 항등식(양도가액−취득가액−필요경비=양도차익)이 성립해 **자기검산이 오류를 가린다**는 점을 지적했다.
- **실패 시나리오**: 컴패니언 수용 토지(양도 14억·취득시 3억·양도시 8억·1,600,000/㎡×500㎡·보상 1,000,000·보상기초 1,100,000 → 분모 5억): 화면 취득가액 525,000,000(엔진 840,000,000)·필요경비 324,000,000(정상 9,000,000), 315,000,000 오분류. 세액·양도차익은 불변.
- **법령**: 소득세법 시행령 제164조 제9항 제1호(협의매수·수용 보상액과 보상기초 기준시가 중 적은 금액)·제2호(공매·경락가액). 환산 산식은 같은 영 제176조의2 제2항 제2호.
- **제안**: 재산식을 폐기하고 단건 엔진이 산출한 `estimatedBase`를 그대로 쓴다(선례: aggregate-carryover-adopted-acquisition-price anchor가 같은 열의 이월과세 축을 이미 그렇게 고쳤다). 다만 그 변경은 §97②2호 swap·salesCase 등 다른 축까지 함께 움직이므로 범위를 `usedEstimatedAcquisition` 전체로 잡을지 §164⑨로 좁힐지 먼저 정하고, expropriation-companion anchor에 두 열 단언을 심어 안전망을 확보할 것.

### F-15 · 🟡 medium · SPLIT — 취득연도 Select 옵션이 2025~1986 하드코딩 — 2026 취득과 「1985년 이전」이 선택 불가

- **위치**: `components/calc/building-std-price/BuildingStdPriceForm.tsx:195` (축 D2)
- **주장**: 양도연도는 `availableYears()`(실측 2026~2001) 파생인데 취득연도만 `for (let y = 2025; y >= 1986; y--)` 하드코딩이라 두 축이 어긋난다. 데이터·validate·엔진은 상·하한 밖 연도를 모두 정상 지원한다.
- **근거**: Form:192-197 재확인. 산정기준율표는 §8① 의제로 「1985년 이전」 버킷을 갖고(acq-base-rate.ts:191) 설계문서 engine.design.md:136이 그 칸을 명시 설계했으며 data.test.ts:228·237이 ≤1985를 정답으로 고정한다. **SPLIT**: 상한(2026)은 계획서가 이미 SCOPE OUT으로 유예한 기지 항목이라 medium, 하한(≤1985)은 설계 미이행이라 high로 갈렸다. 모달 prefill 경로는 Select를 우회하므로 완전 차단은 독립 도구 페이지·수기 정정 시에 한정된다.
- **실패 시나리오**: 1966년 신축·III그룹 건물을 1980년 취득으로 계산하려 해도 하한 1986만 고를 수 있어 산정기준율 1.670 대신 1.656이 적용된다(취득당시 기준시가 9,218,400 → 9,141,120). §164⑧ 동일연도(취득=양도=2026)는 아예 시작할 수 없다.
- **법령**: 소득세법 시행령 제164조 제5항(고시 전 취득 건물) 및 국세청 「건물 기준시가 계산방법」 고시 §8①(1984.12.31 이전 취득 → 1985 의제) — 고시 본문 미확인.
- **제안**: `acqYearOpts`를 `availableYears(false)` 상단 + pre-2001 구간으로 조립해 상한이 자동 추종하게 하고, 하한을 1985까지 내리되 그 1건의 라벨만 「1985년 이전」으로 표기한다(설계문서 :136 표기와 일치).

### F-16 · 🟠 high · SPLIT — crossYearSameAdjust 하한 술어가 UI에만 있고 플래그 정리 지점이 없어, 창을 벗어나면 해소 불가 차단 또는 역순 연도 §164⑧ 침묵 진입이 된다

- **위치**: `lib/calc/building-std-price-form.ts:567` (축 D5·D7)
- **주장**: UI `crossYearWindow`만 `transferYear > acquisitionYear`를 요구하고 ④변환(:567)·⑧검증(:766)·엔진(:443)은 상한만 본다. 상한식은 역순 폭과 무관하게 항상 참이라 취득2020/양도2005도 §164⑧ 경로로 들어간다. 토글의 유일한 writer가 창 안에서만 렌더되므로 창을 벗어나면 끌 수도 없다.
- **근거**: form.ts:764-766 및 Form:269-274 재확인 — 하한 유무가 갈린다. `changeYearWithGuard`는 구조·용도·acqLandPrice만 초기화하고 플래그는 이월한다. D5·D7 두 축이 각각 「하한 부재」와 「stale dead-end」로 발견한 같은 뿌리. **SPLIT**: severity가 medium(비현실 입력)↔high(위젯 없는 차단은 dead-end)로 갈렸다.
- **실패 시나리오**: (a) 보유월수 미입력 상태로 창을 벗어나면 「보유월수를 입력하세요」로 차단되는데 그 칸도 토글도 화면에 없다. (b) 보유월수가 이미 있으면 검증을 통과해 양도(2021) < 취득(2022) 상태로 §164⑧ 환산이 완주한다(양도당시 기준시가 145,300,000, 경고 0건).
- **법령**: 소득세법 시행규칙 제80조 제1항 제1호 본문 「취득일이 속하는 연도의 다음 연도 말일 이전에 양도하는 경우」 — 양도가 취득 뒤라는 사실 전제가 요건에 흡수돼 있고 하한을 정한 명문은 없다.
- **제안**: 토글 렌더 조건을 `(f.crossYearSameAdjust || crossYearWindow)`로 넓혀 켜져 있으면 끌 위젯을 항상 남기고(선례: AssetSectionTransfer:221이 같은 이유로 그렇게 한다), ④·⑧에 `transY > acqY` 하한을 추가해 UI와 술어를 통일한다. 별건으로 `transferYear < acquisitionYear` 자체를 validate에서 차단할 것 — 현재 어느 경로도 연도 순서를 검증하지 않는다.

### F-17 · 🟡 medium · SPLIT — 서버 PDF에 ※ 산정기준율 환산표가 없어 복합 취득 ≤2000 계산서가 화면과 다른 금액만 인쇄한다

- **위치**: `lib/pdf/BuildingStdReportPdfPages.tsx:140` (축 D8)
- **주장**: `InstancePage`가 Ⅱ·Ⅲ·Ⅵ만 렌더하고 `inst.acqBase`를 한 번도 참조하지 않는다(파일 전체 `acqBase` 0건 — 재확인). 복합 취득 ≤2000은 ⑪·총합계가 환산 전 값이므로 산정기준율·환산액이 PDF 어디에도 남지 않는다.
- **근거**: PDF :140 Ⅵ 제목 다음이 곧바로 합계 행이고 `grep -c acqBase` = 0. 화면은 같은 `NtsReportInstance.acqBase`로 ReportSection6Total:39-63에 ※표를 그린다. **SPLIT**: 첫 렌즈는 화면↔PDF 불일치로 high, 둘째는 국세청 작성례상 ⑪이 환산 전 값이 정본이므로 「헤드라인이 틀렸다」가 아니라 「절 누락」이라며 medium으로 갈렸다. 단독(비복합) 경로는 ⑪이 이미 환산 후라 무관.
- **실패 시나리오**: 작성례(2) 유형(복합 3부분·부속 90㎡·토지 130㎡×2,240,000): PDF에 ⑪ 154,960,000·총합계 446,160,000만 찍히고 산정기준율 1.016·환산액 157,439,360은 어디에도 없다. 취득당시 기준시가를 PDF 단독으로 확인할 수 없다.
- **법령**: 소득세법 시행령 제164조 제5항 위임 → 국세청 「건물 기준시가 계산방법」 고시 산정기준율 — 고시 본문 미확인.
- **제안**: `inst.acqBase`가 있을 때 Ⅵ 뒤에 ※표를 추가한다(화면과 같은 인스턴스를 쓰므로 배선 추가 불필요). 칸 구성은 화면(3칸)과 설계(5칸)가 어긋나 있으므로 F-29와 함께 한 번에 맞출 것. 파일 머리 주석의 「Ⅰ~Ⅵ 재현」도 실제 범위로 정정한다.

### F-18 · 🟡 medium · CONFIRMED — 취득연도 2001 + §164⑧ 제1산식이 항상 차단된다 — 용도지수만 2000년 fallback이 없다

- **위치**: `lib/tax-engine/data/building-standard-price/usage-index.ts:83` (축 D2)
- **주장**: 연도 resolver 5종 중 4종은 year < 2001을 2001년 표로 fallback하는데 용도지수만 없다. §164⑧ 제1산식은 `calcPointBreakdown(acquisitionYear - 1, …)`를 호출하므로 취득연도 2001이면 전기 2000에서 undefined가 나와 계산이 통째로 막힌다.
- **근거**: usage-index.ts:69-90 재확인(`schemeForYear`에 하한 fallback 없음). `sameYearFormula` 기본값이 `"prev"`라 취득2001·양도2001 사용자는 기본 상태에서 걸리고, validate는 null을 반환해 폼에서 고칠 여지가 없다. 검증에서 근본 원인이 정정됐다 — fallback 부재가 아니라 **소득세법 시행규칙 제80조 제3항 제2호(전기 기준시가가 없는 경우) 미구현**이며, 그 leaf(`calcPriorStdPriceSubstitute`)는 이미 저장소에 있고 양도세 마법사가 쓰는데 이 엔진만 import하지 않는다.
- **실패 시나리오**: 취득2001·양도2001·rc·용도1·200㎡ 입력 시 「취득전기: 2000년 용도지수표에 용도번호 #1 없음」으로 차단된다 — 존재하지 않는 표를 요구하므로 사용자가 해소할 수 없다. 취득2002는 정상 계산된다.
- **법령**: 소득세법 시행규칙 제80조 제3항 제2호 「전기의 기준시가 = 국세청장이 최초로 고시한 기준시가 × 국세청장이 고시한 기준율」 — 명문 대체산정이 존재한다. 소득세법 시행령 제164조 제8항 위임.
- **제안**: `calcPriorStdPriceSubstitute`(same-adjustment-period-std-price.ts:175)를 배선해 전기가 최초고시 이전이면 지수표 재계산 대신 §80③2호 산식으로 구한다. 이 경로에서는 「취득전기 ㎡당 공시지가」 입력이 불요해지므로 UI·validate도 함께 숨겨야 한다. 2001표 fallback 추가는 기존 테스트(`resolveUsageIndex(2000,1)===undefined`)·silent-fallback 정책과 충돌하므로 채택하지 말 것.

### F-19 · 🟡 medium · CONFIRMED — 「공동주택 고시 전 취득 환산」 결과를 필드로 옮길 적용 버튼이 하나도 없다

- **위치**: `components/calc/building-std-price/BuildingStdPriceModalButton.tsx:268` (축 D7)
- **주장**: 엔진의 환산 경로는 `{ apartmentConversion, warnings, legalBasis }`만 반환하는데 적용 버튼 6종은 valuation·acquisition·transfer·compositeTotal·두 composite만 조건으로 삼는다. 토글은 모달에서 켤 수 있으므로 위젯은 열려 있고 출력 게이트만 항상 닫힌 dead-end다.
- **근거**: 모달 파일 전체 `apartmentConversion` 0건 재확인. 토글이 노출되는 호출부는 7곳(bothMode 2 + 자유 모드 5)이고 applyTimePoint 지정·PHD·상증 호출부는 토글이 렌더되지 않는다. 두 렌즈 모두 high→medium으로 정정 — 런처 옆 CurrencyInput이 살아 있어 손으로 옮겨 적을 수 있고, 계획서가 이 런처를 「공동주택 환산 사용자의 입력 경로 보존」 목적으로 상시 유지하라고 결정했다.
- **실패 시나리오**: 환산 취득당시 기준시가 128,660,408원이 카드에 표시되지만 적용 버튼이 0개다. bothMode에서는 대신 「취득·양도 두 시점 정보를 모두 입력해 계산하면 한 번에 적용됩니다」가 뜨는데, `showBothButton`이 구조적으로 false라 영원히 충족될 수 없는 안내다.
- **법령**: 소득세법 시행령 제164조 제7항(공동주택 고시 전 취득 환산). 산출물은 토지+건물 통합 주택가격(소득세법 제99조 제1항 제1호 라목)이다.
- **제안**: ⚠️ `convertedAcquisitionPrice`를 취득시 건물 기준시가 칸에 넣는 버튼은 만들면 안 된다 — 라목 통합값을 나목 건물 칸에 주입해 토지가액이 이중 계상된다. 마법사 모달 호출부에서는 토글을 숨기고(예 `hideApartmentConversion`) 독립 도구 페이지에만 남기며, 그때 계획서가 이 런처를 상시 유지한 근거도 함께 정정한다.

### F-20 · 🟡 medium · CONFIRMED — NED 페이지 수집 루프의 빈 catch가 네트워크 실패를 「공시가격 없음」으로 바꾼다

- **위치**: `app/api/address/standard-price/route.ts:157` (축 D9)
- **주장**: `} catch { break; }`가 예외를 로그 없이 삼키고 그때까지 모은 배열을 정상 결과처럼 반환한다. 실패 신호가 없어 라우트 바깥 catch(500)도 이 실패를 보지 못한다.
- **근거**: route.ts:157 재확인 — HTTP 비-200만 :137에서 warn하고 throw 경로는 무음이다. 같은 Vworld API를 쓰는 형제 라우트 reverse-geocode:99-104는 동일 실패를 502 `VWORLD_FETCH_FAILED`로 가른다 — standard-price만 예외. 부분 결과가 잘못된 가격을 내지는 않는다(선두 항목 선택 불변).
- **실패 시나리오**: 1페이지 실패 → 404 「공시가격 없음 (PNU: …, 2025년)」이라는 사실 단정. 중간 페이지 실패 → 200 OK인데 units가 8,848 중 4,000으로 잘리고, 사용자 세대가 뒷부분이면 다시 404. 두 경우 모두 로그 0건이라 운영에서도 관측되지 않는다.
- **법령**: 외부 API 오류 처리(법령 쟁점 없음). 반환값은 소득세법 시행령 제164조 기준시가 및 재산세·종부세 공시가격 입력이다.
- **제안**: `{ items, failed }` 반환 또는 예외 전파로 갈라 실패 시 404가 아니라 502 + 「조회 서비스 일시 오류 — 잠시 후 다시 시도하거나 직접 입력하세요」를 반환한다. 최소한 catch에 warn 로그를 추가해 무음 실패를 없앨 것.

### F-21 · 🟡 medium · CONFIRMED — 빌드 인코딩 자동감지가 4096바이트에서 잘라 UTF-8 원본을 cp949로 오판 → 파트가 통째로 스킵된다

- **위치**: `scripts/build-commercial-stdprice.ts:250` (축 D9)
- **주장**: 8192바이트를 모아놓고 `head.subarray(0, 4096)`만 fatal UTF-8 디코더에 넣어, 4096번째가 다중바이트 문자 중간이면 BOM 없는 정상 UTF-8을 cp949로 오판한다. 헤더가 깨져 필수 14개가 전부 누락으로 보고되고 그 파트가 스킵된다.
- **근거**: build 스크립트 :245-255 재확인. 설계문서는 「선두 8KB로 판별」이라 적었는데 구현은 4KB만 디코딩한다(설계 이탈). 저장소 실측 기록상 기존 배포본은 전부 EUC-KR이거나 XLSX라 **아직 발화한 적은 없다** — 이 분기가 방어하려던 케이스에서 틀리는 잠재 결함이다.
- **실패 시나리오**: BOM 없는 UTF-8 CSV 1파트가 스킵되면 그 고시일자의 `manifest.sigungus`가 절반만 채워지는데 coverage는 "full"로 남아(F-22), 조회 계층이 결손 지역을 「그 해 그 지역은 고시가 없었다」로 안내한다. missing=14/14로 실측 재현.
- **법령**: 빌드 파이프라인 결함(법령 쟁점 없음). 결손이 사용자에게 도달하는 지점의 판단 근거는 소득세법 시행령 제164조 제3항이다.
- **제안**: 절단을 없애되 마지막 불완전 UTF-8 시퀀스를 잘라낸 뒤 판정한다(StringDecoder 또는 tail trim). 절단만 제거하면 head 자체가 스트림 청크 경계에서 끝나 문제가 그 지점으로 옮겨갈 뿐이다.

### F-22 · 🟡 medium · CONFIRMED — manifest coverage가 "full"로 하드코딩돼 변환 결손이 「지역 미고시」와 구분되지 않고 직전 연도 값으로 대체된다

- **위치**: `scripts/build-commercial-stdprice.ts:119` (축 D9)
- **주장**: 파트 스킵이 몇 건이든 매 고시일자에 `coverage: "full"`을 적고, 스킵은 `skippedRows`(행 단위)에도 `adopted`에도 기록되지 않는다. 라우트의 `partial_data` 분기는 도달 불가능한 죽은 분기가 된다.
- **근거**: build :119 및 route.ts:112·:160 재확인 — 저장소 전체에서 `"partial"`을 쓰는 생산 코드가 0건이다. 다만 계획서가 「현재 해당 연도 없음, 향후 대비」로 그 분기의 미발화를 명시 결정했으므로, 결함은 「죽은 분기」가 아니라 **결손이 manifest 어디에도 기록되지 않는다**는 쪽으로 좁혀진다. 파트 1개 스킵 빌드에서 coverage full·skippedRows 0·종료코드 0 실측.
- **실패 시나리오**: 2019년 파트 하나가 스킵되면 결손 시군구가 `availableDates`에서 빠지고, 모달의 2단 흐름이 `pickNoticeDate`로 직전 고시분을 자동 선택해 2018년 기준시가(700,000)를 채운다 — §164③ 요건이 성립하지 않는데 그 규정이 적용된 것처럼 동작한다.
- **법령**: 소득세법 시행령 제164조 제3항 「새로운 기준시가가 고시되기 전에 취득 또는 양도하는 경우에는 직전의 기준시가에 의한다」 — 결손은 이 요건이 아니다.
- **제안**: `probePart`가 스킵 사유를 호출부로 돌려주고, 스킵이 1건이라도 있으면 `coverage:"partial"` + 스킵 목록을 manifest에 싣는다. 스킵 발생 시 프로세스 종료코드를 0이 아니게 해 CI가 성공으로 읽지 않도록 할 것.

### F-23 · 🟡 medium · CONFIRMED — 상가 호별고시 후 취득(C-02)에서 「환산취득가 토지분」·「개산공제 토지분」이 항상 0원으로 표시된다

- **위치**: `lib/calc/transfer-tax-api-commercial.ts:118` (축 D10)
- **주장**: post_disclosure 분기가 `{ ...base, landPriceAtAcquisition }`만 반환하고 `buildingStdPriceAtAcquisition`을 절대 싣지 않는데, 엔진의 토지/건물 분리는 두 값이 모두 있어야 돌아간다. 그런데 결과 카드는 두 행을 조건 없이 렌더한다.
- **근거**: api-commercial.ts:115-118 재확인 — base에 건물 기준시가 없음. C-02 입력 UI도 없다(CommercialBuildingBlock의 「③ 건물 기준시가 3시점」 블록 전체가 `isPreDisclosure` 게이트). 설계문서는 이 케이스에 「선택 입력 + validation 경고(에러 아님) + 분리 불가 플래그」를 규정했는데 셋 다 미구현이다. 합계·세액은 정확하다.
- **실패 시나리오**: 2005 이후 취득 오피스텔·전유60+공용40㎡·대지30㎡·양도가 9억: 합계 540,000,000·개산공제 9,000,000은 맞지만 「토지분 0 / 건물분 540,000,000」, 「개산공제 토지분 0」이 뜬다. 취득시 건물 기준시가 150,000,000을 함께 넘기면 180,000,000/360,000,000·3,000,000이 된다. 부수적으로 C-02에서 필수로 강제되는 취득시 개별공시지가가 현재 결과에 아무 영향이 없는 사문 입력이다.
- **법령**: 소득세법 시행령 제176조의2 제2항 제2호(환산취득가액)·제163조 제6항(개산공제). 토지·건물 분리는 소득세법 제99조 제1항 제1호 다목(오피스텔·상업용 건물 일괄 고시)의 구조에서 온다.
- **제안**: 설계대로 C-02에 취득시 건물 기준시가 선택 입력을 열고 ④에서 `buildingStdPriceAtAcquisition`을 싣거나(⑫ Zod는 이미 era 무관 optional이라 스키마 변경 불요), 최소한 분리 근거가 없을 때 두 행과 분리 표를 렌더하지 않고 「분리 불가」를 고지한다.

### F-24 · 🟡 medium · CONFIRMED — 단일시점 모달에 compositeMode가 stale로 남으면 토글도 입력도 사라진 채 validate만 부분 입력을 요구한다

- **위치**: `lib/calc/building-std-price-form.ts:530` (축 D6)
- **주장**: `toEngineInput`의 단일시점 분기가 `!f.compositeMode` 조건을 달아 compositeMode가 켜져 있으면 `singleTimePoint`가 조용히 무시되고 복합 2시점 경로로 간다. validate도 복합 분기(:711)를 단일시점 분기(:729)보다 앞에 두어 화면에 없는 필드를 요구한다.
- **근거**: form.ts:503-509·:711·:729 재확인. 근본 원인은 `singleActive`(Form:286)가 `!apartmentConv`는 포함하면서 `!composite`를 빠뜨린 비대칭이다 — 계획서 C7·C8은 두 모드 모두 「켜지면 2시점 동작 유지, **폼에서도 섹션 복원**」으로 결정했는데 C8만 이행됐다. 세션 내 회복 불가이나 모달을 닫으면 언마운트되므로 영구 차단은 아니다.
- **실패 시나리오**: 취득=양도=2010에서 복합구조를 켠 뒤 양도연도를 2015로 정정하면 토글·복합 부분·취득당시 공시지가가 모두 사라지는데 「복합 부분 1: 구조를 선택하세요」 → 「취득당시 ㎡당 개별공시지가를 입력하세요」로 차단된다. 끄지도 채우지도 못한다.
- **법령**: 폼 상태 정합성(법령 쟁점 없음).
- **제안**: `singleActive`에 `&& !composite`를 추가해 `apartmentConv`와 대칭으로 만든다 — 그러면 복합이 켜진 순간 2시점 섹션과 토글이 함께 복원돼 사용자가 끌 수 있다. 「복합구조 진입 자체를 차단」이나 「엔진에서 compositeMode 무시」는 계획서 C7을 뒤집는 재제안이므로 채택하지 말 것.

### F-25 · 🟡 medium · CONFIRMED — 정상 연도교차 §164⑧에서도 양도당시 구조·용도·공시지가 입력이 화면에 남지만 폐기되고, 동일연도와 달리 안내가 없다

- **위치**: `components/calc/building-std-price/BuildingStdPriceForm.tsx:587` (축 D5)
- **주장**: 동일연도에는 세 입력을 숨기고 rose 안내로 이유를 밝히는데(:587), 연도교차 opt-in에서는 :593·:611의 게이트가 `!sameYear`뿐이라 입력이 계속 노출되고 안내도 없다. 그 값들은 §164⑧ 분기에서 `base.transfer`를 만들지 않아 폐기된다.
- **근거**: Form:587(sameYear 전용 안내)·:593·:611(게이트가 sameYear만 봄) 재확인. validate도 요구하지 않아 「보이는데 필수도 아니고 쓰이지도 않는」 상태다. 토글이 이 입력들보다 아래(:630)에 있어 사용자는 먼저 채운 뒤 토글을 켜게 된다. 검증에서 추가 사실 확인 — `buildNtsReportContext`가 `transLandPrice`를 무조건 읽어 국세청 계산서의 양도당시 토지 칸에 **인쇄까지 한다**.
- **실패 시나리오**: 취득2005→양도2006 토글 ON에서 양도당시 공시지가에 5,000,000을 넣든 9,999,000을 넣든 양도당시 기준시가는 91,000,000으로 동일하다. 계산서에는 그 값이 landPricePerM2·landValue로 찍혀 오인이 굳는다.
- **법령**: 소득세법 시행규칙 제80조 제1항 제1호 가목·나목 — 양도당시 기준시가는 취득당시 기준시가에서 파생하므로 양도시점 구조·용도·공시지가는 산식에 등장하지 않는다(값 무시 자체는 옳다).
- **제안**: :593·:611·:587의 게이트를 :641과 같은 술어(`sameYear || (crossYearWindow && crossYearSameAdjust)`)로 통일하고, 그 술어를 lib/calc의 leaf로 뽑아 ④·⑧·UI·계산서 컨텍스트가 같은 것을 부르게 한다.

### F-26 · 🟡 medium · SPLIT — 공용 조정률 미지정 부분의 부속시설 면적이 평가에서 빠지는데 설계가 요구한 경고가 구현되지 않았다

- **위치**: `lib/tax-engine/building-standard-price-helpers.ts:336` (축 D1)
- **주장**: 상증 복합에서 `receivesAt`가 sharedAdjustment 지정 여부로 부속시설 수령을 게이팅하고 미수령 부분 몫은 어디에도 재배분되지 않는다. 동시에 계산서 Ⅴ의 계(t)는 여전히 전체 면적을 표시해 표가 스스로 인쇄한 `At = ΣAi`를 위반한다.
- **근거**: helpers.ts:334-345 재확인. **SPLIT**: 재현 렌즈는 결함(−10%)으로, 반증 렌즈는 REFUTED로 갈렸다 — 설계문서 nts-report.engine.design.md:225-227이 「미수령 몫은 증발(현행 동작 보존). 이때 Ⅴ표 행 합 < 계(t)가 그대로 노출되며 **warnings 1건 추가**」로 셋 다 명시 결정했기 때문이다. 두 렌즈 모두 그 warning이 미구현임(문구 grep 0건·warnings 빈 배열)에 합의했다.
- **실패 시나리오**: 작성례(3) 구성에서 지상1만 공용 조정률을 지정하면 부속 90㎡ 중 60㎡가 평가에서 빠져 200,540,000 → 180,500,000(−9.99%). 폼 검증은 「1개 이상」만 요구해 통과하고 경고는 0건이다. 계(t)는 90, Σ행은 30을 표시한다.
- **법령**: 국세청 「건물 기준시가 계산방법」 고시 계산서 Ⅴ항(주용도에 의한 부속시설 면적 안분) — 고시 본문 미확인. 게이팅 결정의 근거는 고시 문언 대조가 아니라 「현행 동작 보존」이다.
- **제안**: 설계 :226이 문구까지 규정한 warning(「부속시설 N㎡ 중 M㎡만 귀속 지정 — 미지정 몫은 평가 제외」)을 구현한다(결과 카드가 이미 warnings를 렌더한다). 게이팅 폐지·totalArea 재정의는 결정된 사항의 재제안이므로 제외하되, 고시 Ⅴ항 본문 확인 후 축 자체를 재검토할지는 별도 판단 사항이다.
- **✅ 처리(배치 7)**: 설계 :226 문구 그대로 구현했다 — `calcCompositeForYear`가 `unassignedAncillary: { totalArea, assignedArea }`를 반환하고, 상증 복합 경로가 그것으로 warnings 1건을 낸다. **게이팅·금액은 무변경**(§2 역방향 가드가 「부속 행 1건·areaSum 20·계(t) 40」을 고정한다). anchor `ancillary-unassigned-warning.anchor.test.ts` 6건 — 게이트 조건 뮤테이션(`<` → `<=`)이 잡힌다. 양도(`adjustmentEnabled: false`)는 전 부분 수령이라 대상 밖이다.


### F-27 · 🟡 medium · CONFIRMED — 취득 ≤2000 단독 경로의 계산서 ⑩ 칸에 환산 후 값이 들어가 표 머리 산식 「⑩ = ⑧ × ⑨」가 깨진다

- **위치**: `lib/calc/nts-report-adapter.ts:135` (축 D8)
- **주장**: `toRow`가 `standardPrice: b.standardPrice`를 ⑩에 1:1로 넣는데, 단독 경로의 그 값은 산정기준율을 이미 곱한 값이고 `pricePerM2`(⑧)는 2001 값 그대로다. 복합 경로는 정반대(⑩·⑪ = 환산 전)라 같은 칸이 경로별로 두 의미를 갖는다.
- **근거**: adapter :133-137 재확인 — `acqBaseRate`는 NtsReportRow에 매핑조차 되지 않아 어댑터가 두 경로를 구별할 수단이 없다. 국세청 작성례(2) anchor가 ⑪ = 154,960,000(환산 전) · ※(3) = 157,439,360(환산 후)으로 복합 규약을 정본으로 고정하고 있다. 세액은 불변(적용값은 convertedTotal).
- **실패 시나리오**: gb-acq 스냅샷(rc·327.6㎡·취득1997·공시지가 1,200,000): ⑧ 386,000 · ⑨ 327.6 · ⑩ 122,786,445인데 386,000×327.6 = 126,453,600(차 3,667,155). 같은 장의 ※(1)이 126,453,600을 찍어 「2001.1.1 건물 기준시가」가 한 서식에 두 값으로 나온다.
- **법령**: 소득세법 시행령 제164조 제5항 위임 하의 국세청 「건물 기준시가 계산방법」 고시 산정기준율표 — 고시 본문 미확인.
- **제안**: 복합 규약(⑩·⑪ = 환산 전, 환산은 ※에만)으로 통일한다. 선행 조치로 `NtsReportRow`에 `acqBaseRate`를 echo해 어댑터가 경로를 구별할 수 있게 하고, Ⅵ 총합계가 혼합값이 되지 않는지 원본 서식으로 확인할 것.

### F-28 · 🟡 medium · CONFIRMED — 조정률 항목이 4개 이상이면 화면 계산서가 조용히 3개만 표시해 ⑧을 재현할 수 없고 PDF와도 어긋난다

- **위치**: `components/calc/building-std-price/nts-report/ReportEvalTable.tsx:70` (축 D8)
- **주장**: Ⅲ·Ⅳ 표가 `adjustmentItems?.[0]~[2]`만 렌더하는데 엔진은 고시 7구분을 독립 적용해 최대 7항목을 내고 ⑧에는 전건이 반영된다. 4번째 이후는 경고 없이 사라진다.
- **근거**: EvalTable :70-72 재확인. PDF는 `items.map(...).join(" ")`로 전건을 표시해 같은 계산이 두 채널에서 다른 집합을 보인다. 특성 모드뿐 아니라 번호 직접입력(`adjustmentNos`)·복합 merge 경로도 개수 상한이 없어 동일하게 절단된다.
- **실패 시나리오**: 특성 5구분 발화 시 엔진 items = 15(1.2)·20(1.2)·26(1.1)·30(0.6)·31(0.9), ⑧ 936,000. 화면 3칸으로 표 머리 산식대로 계산하면 1,735,000이 나와 799,000원 어긋나고 번호 30·31은 서식에서 사라진다.
- **법령**: 국세청 조정률 고시 적용요령 (2) 「여러 구분에 중복 해당 시 각 구분 조정률을 곱하여 중복 적용」 — 고시 본문 미확인(전사본 기준).
- **제안**: 3칸 레이아웃은 원본 서식으로 동결됐으므로 4번째 이후를 세 번째 칸에 병합(`0.6(30·31)`)하거나 행 아래 각주로 내리고 절단 사실을 표기한다. 어느 쪽이든 화면과 PDF가 같은 집합을 보여야 한다.

### F-29 · 🟡 medium · CONFIRMED — ※표 (4) 토지가액·(5) 합계가 미구현 — 취득당시 총합계가 계산서 어디에도 없다

- **위치**: `components/calc/building-std-price/nts-report/ReportSection6Total.tsx:44` (축 D8)
- **주장**: 파일 자체 doc 주석과 UI 설계문서는 ※표를 5칸으로 정의하는데 구현은 (1)(2)(3) 3칸뿐이다. 복합 경로에서 Ⅵ 총합계는 환산 전 건물 + 토지이므로 환산 후 「건물+토지」 합계를 담는 칸이 없다.
- **근거**: Sec6 :44-60 재확인 — th 3개·td 3개(`nts-bsp-x-1~3`), 설계가 동결한 testid `-x-4`·`-x-sum`은 DOM에 없고 이를 요구하는 테스트도 0건이다. 계획서 §8 자가점검은 「6 컴포넌트(Ⅰ~Ⅵ+※)」를 완료로 표기해 의도적 축소가 아니라 미완이다.
- **실패 시나리오**: 작성례(2)에서 ⑪ 154,960,000 · ※(3) 157,439,360이 표시되지만 취득당시 총합계 391,439,360은 없고, 서식만 보면 Ⅵ 총합계 446,160,000(환산 전 합계)이 취득당시 합계로 오독된다.
- **법령**: 국세청 「건물 기준시가 계산서」 ※란 — 고시·서식 본문 미확인(근거는 저장소 설계문서·계획서의 작성례 전사).
- **제안**: ⚠️ (4)는 `inst.landValue`가 아니다 — 계획서 작성례상 ※(4) 234,000,000 ≠ Ⅵ⑤ 291,200,000으로, 전자는 취득연도 공시지가 기준 별도 값이다. 취득연도 토지 공시지가라는 신규 입력·컨텍스트 필드가 필요하므로 서식 원본 확인 후 착수할 것.
- **✅ 착수 조건 해소 · 구현은 별도 배치(2026-08-27 서식 원문 실측)**
  - 「건물 기준시가 계산서」 별지 ※표는 **5칸이 맞다**: (1) 2001.1.1현재 건물 기준시가 / (2) 산정기준율 / (3) 취득당시 건물 기준시가 [(1)×(2)] / **(4) 토지가액** / 합계 〔(3)+(4)〕.
  - 작성요령 ※4 「**토지가액은 취득당시 토지가액을 계산하여 기재합니다.**」 ⇒ 리뷰의 「(4)는 `inst.landValue`가 아니다」가 **정확히 맞았다**. 계산사례 실측: ※(4) **234,000,000** = 130㎡ × **1,800,000**(1999.6.30 공시지가 = 취득일 2000.2.1 **직전 고시분**) vs Ⅵ⑤ **291,200,000** = 130㎡ × 2,240,000(2001 기준).
  - ⚠️ **폼에서 파생할 수 없다.** 취득 ≤2000 경로의 공시지가 필드는 라벨 그대로 「취득당시 위치지수용 ㎡당 개별공시지가 (**2001.1.1 기준**)」이라 ※(4)가 요구하는 취득일 직전 고시분이 아니다(`BuildingStdPriceForm.tsx:565`). ⇒ **신규 입력 1개**(취득당시 ㎡당 개별공시지가)가 필요하며 14 동기화 지점 작업이다 — **F-18과 같은 급으로 별도 배치**.
  - 부수 확인: 작성요령 ※2 「2001.1.1현재 기준시가는 … 계산서의 **Ⅵ번 ⑪항목의 건물 기준시가 금액과 일치**합니다」 ⇒ **F-27을 「⑪ = 환산 전」으로 고친 방향이 서식으로 확증**된다. 또한 Ⅴ표에 **「9 제외」 행**이 실재해 F-26의 미귀속 몫 취급이 서식 구조와도 정합한다.


### F-30 · 🟡 medium · CONFIRMED — 스냅샷 키 파서 3함수가 `-first`·`-gb-first` 접미를 인식하지 못해 계산서가 「상속」으로 출력되거나 더미 시점이 한 장 더 나온다

- **위치**: `lib/calc/building-std-snapshot-keys.ts:87` (축 D6)
- **주장**: `snapshotKeyTimepoint`의 두 정규식이 접미를 `acq|transfer`로만 열거하고(:87-88) `phdTimepointLabel`(:159)은 `-phd-*`·`-cb-first`만, `snapshotKindLabel`(:108)은 `-gb-(acq|transfer)`만 인식한다. 같은 파일의 `idOfSnapshotKey`(:30)는 `first`를 포함하므로 id는 환원돼 계산서가 렌더되기는 한다.
- **근거**: 키 파일 :30·:87-88·:108-113·:159 재확인 — 접미 집합이 서로 다르다. D6 축이 `-phd-first`(:87)와 `-gb-first`(:159)를 각각 발견했으나 같은 뿌리다. 화면·PDF가 같은 함수를 공유해 두 채널이 동시에 빠진다.
- **실패 시나리오**: (a) GB 3시점 배치의 최초공시 계산서만 제목이 「상속 건물 기준시가 계산」, Ⅰ.구분이 상속 칸, PDF 부제도 「상속」(3장 중 1장만 어긋남). (b) 최초공시 ≤2000이면 2001 더미 양도 인스턴스가 필터되지 않아 같은 제목 계산서가 두 장 나오고, 그중 한 장의 ⑪(86,411,600)은 폼 어디에도 들어가지 않은 미환산 값이다.
- **법령**: 소득세법 시행령 제164조 제5항(≤2000 환산 준용). 계산서 Ⅰ.구분 표기 규칙은 국세청 「건물 기준시가 계산방법」 고시 — 고시 본문 미확인.
- **제안**: ⚠️ `snapshotKeyTimepoint`에 `first → "acquisition"`을 넣으면 최초공시가 취득시로 오표기돼 「같은 제목 두 장」이라는 새 결함이 생긴다. `phdTimepointLabel` 정규식에 `(?:cb|gb)-(first)`를 넣어 배치 전용 라벨 경로로 태우되 `-gb-acq`/`-gb-transfer`는 계속 null이어야 하고(기존 회귀가 그것을 고정한다), 열거 규율상 `gb`는 `gb-ext`보다 뒤에 놓는다.
- **✅ 종결(2026-08-27) — 결함은 실재하나 대상 키가 달랐다**
  - **`-gb-first` 는 어디서도 생성되지 않는다**(lib·components·app 전 경로 grep). 실제 생성되는 접미 20종 중 `first` 는 **`-phd-first`·`-cb-first`** 둘뿐이다.
  - **진짜 결함은 화면↔PDF 비대칭이었다.** 배치 스냅샷은 계산서를 valuation(`taxType: "inheritance_gift"`) 스냅샷으로 **재구성**하므로 그대로 두면 Ⅰ.구분이 상속 칸에 찍힌다. 화면(`BuildingStdPriceReportSection.tsx:138·172`)은 ①`phdTimepointLabel` ②`snapshotKeyTimepoint` **두 경로**로 교정하는데, `building-std-pdf-data.ts` 는 **②만** 썼다(:49) ⇒ ①에만 걸리는 배치 키(`-phd-{acq|first|transfer}`·`-cb-first`)가 그물을 빠져나가 **PDF 에서만 「상속」으로 찍혔다**. 정작 그 파일 상단 주석이 「한쪽만 고치면 화면↔PDF가 어긋난다 — 단일 출처 규약」을 적고 있었다.
  - ⇒ ① 경로를 PDF 데이터 조립에 이식했다. 리뷰 경고대로 `snapshotKeyTimepoint` 에 `first → "acquisition"` 을 넣는 방식은 **채택하지 않았다** — 취득시와 최초공시일이 같은 칸(취득당시)이라 「같은 부제 두 장」이라는 새 결함이 된다. 구별은 신설 `NtsReportInstance.timepointLabel`(PDF 부제 우선값)이 담당한다.
  - anchor `building-std-pdf-batch-timepoint.anchor.test.ts` 7건 — §1 3건이 수정 전 실패(`inheritance` 그대로)했고 §2 역방향 4건(상증 키·`-gb-acq` ②경로·연도 경계)은 수정 전후 불변이다.


### F-31 · 🟡 medium · CONFIRMED — ㎡당 금액 × 연면적의 Math.floor가 raw float라 소수 면적의 6.4%에서 기준시가가 1원 적게 나온다

- **위치**: `lib/tax-engine/building-standard-price-helpers.ts:111` (축 D1·D4)
- **주장**: `stdPriceFromPerM2`가 1,000원 절사된 정수 단가에 소수 연면적을 float로 곱한 뒤 floor한다. pricePerM2가 항상 1,000의 배수이므로 소수 3자리 이하 면적에서 정확값은 언제나 정수 — floor는 no-op이어야 하고 깎이는 1원은 순수 표현손실이다.
- **근거**: helpers.ts:106-112 재확인. 절사+면적곱의 단일 출처로 `calcPointBreakdown`·§164⑧ 제2산식·※표 total2001이 공유한다. 국세청 공표 계산사례 13건은 각자의 실제 면적에서 전건 일치하므로 현재 anchor는 이 결함을 잡지 못하고 수정으로 깨지지도 않는다. D1·D4 두 축 독립 발견.
- **실패 시나리오**: ㎡당 717,000원 · 연면적 64.07㎡ → 45,938,189원(정확 45,938,190). 50.00~300.00㎡ 격자 25,001건 중 1,593건(6.37%), 면적 규모와 무관하게 균일하며 정수 면적에서는 0건.
- **법령**: 국세청 「건물 기준시가 계산방법」 고시(기준시가 = ㎡당 금액 × 연면적) — 고시 본문 미확인. CLAUDE.md 정수 연산 규칙 및 저장소 자체 선례(applyFairMarketRatio)와 같은 층위다.
- **제안**: ⚠️ `Math.round(floorArea * 100)` 스케일은 3자리 면적을 조용히 반올림하므로(실측 +2,945원) 최소 1000 스케일을 쓴다 — `safeMultiplyThenDivide(pricePerM2, Math.round(floorArea*1000), 1000)`. 4자리 이상 입력은 어느 스케일에서도 반올림되므로 DecimalInput/validate의 자릿수 제약과 함께 확정할 것.

### F-32 · 🟡 medium · CONFIRMED — 기계식주차 특수산식이 정수×잔가율을 raw float로 곱해 1원 과소 — 절사 단위가 1,000원이 아니라 보호막이 없다

- **위치**: `lib/tax-engine/building-standard-price-helpers.ts:444` (축 D4)
- **주장**: `Math.floor(safeMultiply(unitPrice, count) * residualRate)`에서 앞의 정수곱만 보호되고 잔가율 float 곱에는 같은 보호가 없다. 잔가율은 이미 소수 4자리로 양자화돼 정수 분수로 되돌릴 수 있는데도 float를 쓴다.
- **근거**: helpers.ts:442-444 재확인. 일반 경로와 달리 이 경로에는 `truncateToThousand`가 없어 float 오차가 그대로 최종 `standardPrice`에 남는다. 설계문서 :275가 규정한 `floor(정확 곱)`과도 어긋난다. 호출부 3곳(상증·양도 2시점) 실재.
- **실패 시나리오**: 2004 평가·단가 5,000,000·1대·경과 4년(잔가율 0.82) → 4,099,999원(정확 4,100,000). 319,800 격자 중 3,867건이 전부 −1원(과대 0건), 2004~2026 전 연도 분포.
- **법령**: 소득세법 제99조 제1항 제1호 나목 · 상속세 및 증여세법 제61조 제1항 제2호 위임 하의 국세청 고시 기계식주차 특수산식 — 고시 본문 미확인.
- **제안**: `applyRateFraction(safeMultiply(unitPrice, count), Math.round(residualRate*10000), 10000)`으로 치환한다 — 319,800 격자 전건 정확값 일치를 확인했고, 55개 잔가율 전건이 4자리 round-trip 무손실이다.

### F-33 · 🟡 medium · CONFIRMED — 산정기준율 적용 시 floor 순서가 단독·복합 경로에서 달라 같은 건물이 화면 모드에 따라 1원 갈린다

- **위치**: `lib/tax-engine/building-standard-price-helpers.ts:482` (축 D4)
- **주장**: 단독은 `floor(pricePerM2 × floorArea × acqBaseRate)`(한 번만 절사), 복합은 `floor(base2001.total × acqBaseRate)`(먼저 절사 후 곱)이고, ※표 echo의 `total2001`은 또 다른 산식으로 만들어져 표시된 두 값으로 표시된 결과를 재현할 수 없다.
- **근거**: helpers.ts:480-482 재확인. 검증에서 근본 원인이 정정됐다 — 2001 기저가 정확한 정수이면 두 순서는 수학적으로 동일하고, 실제로 값을 가른 것은 F-31의 float 1원 손실이다(※표 불일치 895건 = total2001 1원 손실 895건, 동일 집합). 설계문서 두 곳이 각각 다른 순서를 규정해 미조정 상태다.
- **실패 시나리오**: 동일 건물(rc·용도1·공시지가 1,000,000·신축1990·취득1995·양도2024·64.07㎡)을 일반 양도로 계산하면 20,552,823원, 부분 1개짜리 복합구조로 계산하면 20,552,822원. 연면적 50~200㎡ 격자 15,001건 중 895건(6.0%)에서 ※표 자기재현이 실패한다.
- **법령**: 소득세법 시행령 제164조 제5항. 인쇄 서식 헤더가 스스로 「취득당시 기준시가(3)=(1)×(2)」를 선언한다.
- **제안**: F-31(stdPriceFromPerM2 정수화)을 고치면 두 경로가 자동 일치하므로 그것을 먼저 한다. 그 뒤 표기 정본은 서식 헤더와 NTS 작성례를 따라 총액-우선(복합 순서)으로 통일한다.

### F-34 · 🟡 medium · CONFIRMED — §164⑧ 환산 결과의 양도 breakdown이 취득 echo를 통째로 물려받아 결과 카드 산식이 자기모순이 된다

- **위치**: `lib/tax-engine/building-standard-price.ts:492` (축 D1)
- **주장**: `const transfer = { ...acquisition, standardPrice: transferStd }`로 pricePerM2·acqBaseRate·appliedLandPriceYear·applyNotes가 전부 취득 시점 값인 채 양도 breakdown이 된다. 결과 카드와 국세청 계산서가 그대로 렌더해 양도 행이 산술적으로 성립하지 않는다.
- **근거**: bsp.ts:492 재확인 — standardPrice 외 전 필드가 acquisition과 동일. 표시 경로 2곳(BuildingStdPriceResultCard:79-82·nts-report-adapter:262 fillSingle) 실재. 설계문서 ui.design.md:216이 요구한 「적용 산식(제1/제2)·보유월수·조정월수 fine-print」는 미구현이다.
- **실패 시나리오**: 동일연도 2015·200㎡·제2산식: 양도 카드가 「㎡당 590,000 × 200㎡ = 149,000,000」인데 좌변은 118,000,000. 취득2000·양도2001 교차에서는 취득 전용 산정기준율 1.018이 양도 행에 붙어 좌변 75,128,400 ≠ 우변 77,564,200. 부수로 §164⑧ 모드는 `transLandPrice` 검증이 면제되는데 계산서 컨텍스트는 무조건 읽어 양도 instance의 ㎡당 공시지가가 0으로 인쇄된다.
- **법령**: 소득세법 시행령 제164조 제8항 · 소득세법 시행규칙 제80조 제1항 제1호 — 양도당시 기준시가는 취득당시에서 환산하므로 시점별 산출근거가 양도 행에 붙어서는 안 된다.
- **제안**: 전체 spread 대신 필요한 필드만 실어 pricePerM2·acqBaseRate·appliedLandPriceYear를 빼고, `sameYearAdjusted`로 카드·계산서가 §164⑧ 전용 산식 문장을 그리도록 표시부를 분기시킨다(standardPrice 값은 불변).

### F-35 · 🟡 medium · CONFIRMED — 조정률 요약 칩만 ctx에 structureKey를 넘기지 않아 통나무조 최고층수 제외가 반영되지 않는다 (칩 130% vs 엔진 90%)

- **위치**: `components/calc/building-std-price/BuildingStdValuationSections.tsx:184` (축 D3)
- **주장**: 칩이 `calcSpecialAdjustmentRate(..., { isResidential, isApartment })`로 호출해 `structureKey`가 빠진다. II 최고층수의 통나무조 제외 판정은 `ctx.structureKey !== "solid_wood"`로 이뤄지므로 칩에서만 제외가 적용되지 않는다.
- **근거**: BuildingStdValuationSections:184-189 재확인 — ctx에 structureKey 없음. 같은 화면의 모달 미리보기와 엔진 `computeAdjustmentRate`는 둘 다 넘긴다. 계획서 §5.2가 주입 대상으로 엔진·모달만 열거해 이 칩이 누락된 것이며, `ctx.structureKey` 사용처가 helpers.ts:581 한 줄뿐이라 발화는 solid_wood + maxFloors 조합 한정이다.
- **실패 시나리오**: 상증·통나무조·비주거·100㎡·최고층수 21층만 선택: 모달 미리보기와 엔진은 90.0%(기준시가 84,500,000)인데 모달을 닫으면 섹션 칩이 「조정률 130.0%」로 표시돼 같은 화면에서 40%p 어긋난다. 세액은 엔진값이라 정확하다.
- **법령**: 국세청 조정률 고시 구분 II 최고층수 비고 「건물구조가 통나무조인 것은 적용 제외」 — 고시 본문 미확인(전사본 기준).
- **제안**: 칩 ctx에 `structureKey: f.valStructureKey`를 넣는다(`f`가 이미 prop으로 있다). 세 호출부가 각자 ctx를 조립하는 구조가 재발 원인이므로 ctx 조립을 단일 함수로 뽑아 인자 동일성까지 맞추는 편이 낫다.

### F-36 · 🟡 medium · CONFIRMED — 취득연도 2001이 「2000년 이전 취득」 UI 분기에 함께 걸려 적용되지도 않는 §164⑤ 환산 안내를 띄운다

- **위치**: `components/calc/building-std-price/BuildingStdPriceForm.tsx:485` (축 D5)
- **주장**: `acqIndexYear`가 `y <= 2000 ? 2001 : y`라 취득연도 2001에서도 2001이 되고, violet 안내(:485)와 공시지가 필드(:501)가 `acqIndexYear === 2001`을 조건으로 써 ≤2000과 2001을 구별하지 못한다. 엔진 경계는 `year >= 2001`이라 2001년 취득에는 산정기준율이 적용되지 않는다.
- **근거**: Form:485-489·:513 재확인. 실측: acq2000은 acqBaseRate 1.018·97,728,000, acq2001은 acqBaseConversion undefined·96,000,000. 같은 파일 `changeYearWithGuard`(:227-231)는 올바른 `<= 2000`을 쓰고 계산서 어댑터(:283)도 그렇다 — 화면 안내와 계산서가 정확히 2001에서 엇갈린다.
- **실패 시나리오**: 2001년 취득 건에 「2000년 이전 취득 — … 산정기준율로 환산됩니다」와 「§164⑤」 힌트가 뜨지만 엔진은 일반산식을 쓴다. 계산 근거를 오독하고 ※표가 없는 것을 결함으로 오인해 재작업하게 된다.
- **법령**: 소득세법 시행령 제164조 제5항(고시 전 취득 건물) — 2001년 취득은 「고시 전 취득」이 아니다. 산정기준율표는 국세청 고시 소관으로 본문 미확인.
- **제안**: 안내문·필드 라벨·hint의 조건만 `y <= 2000` 술어로 옮긴다. ⚠️ 2001~2002 취득의 조회 연도 고정(fixedYear=2001)은 계획서 §1.5②(해당연도 1.1 현재 공시지가)가 처방한 것이므로 유지해야 하고, else 분기로 보내면 상반기 취득일에서 2000년 공시지가가 추천돼 회귀가 된다.

### F-37 · 🟡 medium · CONFIRMED — 잔가율 데이터 주석의 「신공법은 선택 불가 → 실무 영향 없음」이 사실이 아니다 — 미검증 추정 내용연수가 실제 산출에 반영된다

- **위치**: `lib/tax-engine/data/building-standard-price/residual-rate.ts:26` (축 D2)
- **주장**: 헤더가 ALC·보강블록·와이어패널·조립식패널을 「해당연도 구조지수표에도 부재해 선택 불가」라 단정하고 era-C −10년 추정을 적용하는데, 구조지수표에 실제로 존재해 드롭다운에 노출되고 추정 내용연수가 잔가율·기준시가에 그대로 곱해진다.
- **근거**: residual-rate.ts:25-28 재확인. 실측 — steel_frame_eps는 2008~2015 8개 연도, alc·reinforced_block·wire_panel·prefab_panel·container는 2013~2015 3개 연도의 구조지수표에 실재하며 `listStructureOptions(2015)`에 전부 나온다. 참인 구간은 2003~2007뿐이다. 같은 파일군의 structure-group-map.ts:67은 steel_frame_eps에 「☐ 확인 필요 … 잠정」을 남겨 서로 모순된다.
- **실패 시나리오**: 2015년 평가·ALC조·경과 10년: era-B 추정이 III(30년)을 골라 잔가율 0.7. 같은 연도 40년 버킷이었다면 0.80으로 −12.5% 차이(prefab_panel은 0.55 vs 0.70, −21.4%). container만 고정값이라 무영향.
- **법령**: 국세청 「건물 기준시가 계산방법」 고시 부록 「연도별 잔가율표」 — 고시 본문 미확인이라 추정값의 정오는 판정하지 않는다. 확증된 것은 「추정이 실제로 발화하며 주석이 그 사실을 부인한다」이다.
- **제안**: 주석의 「선택 불가·실무 영향 없음」을 적용 연도 범위(steel_frame_eps 2008~2015 / 나머지 2013~2015)와 함께 사실대로 정정하고, 해당 연도 잔가율표 헤더를 고시 원본으로 재대조해 `ERA_B_DURABLE_FIXED`에 확정값을 등재한다. 확정 전까지 추정 적용임을 결과 warnings로 노출할지 검토할 것.
- **✅ 종결(2026-08-27 · 고시 원문 실측)**: 사용자가 과거 연도 고시 7건을 제공해 판정했다. **주장은 옳았고(주석이 거짓) 추정값도 옳았다** ⇒ **세액 변화 0**.
  - 「구조지수표에도 부재해 선택 불가·실무 영향 없음」 = **거짓**. 제2013-2호 제7조에 ALC 100·보강블록/와이어패널 90·조립식패널 80·컨테이너 50이 모두 있고, 2010년 고시 5.구조지수 5행(80)에는 「철골조 중 조립식 패널」이 있다.
  - 「era-B 잔가율표 헤더 미수록」 = **부분적으로만 참**. 제2013-2호·2014년 고시 **제10조③**이 III(30년)에 ALC조·보강블록조·와이어패널조를, IV(20년)에 조립식패널조·컨테이너건물을 **명시 열거**한다(제2011-23호에는 5종 전무 — 2013년 신설 확증). era-C −10 추정값과 **전건 일치**.
  - ⇒ 주석을 사실대로 정정하고 5종을 `ERA_B_DURABLE_FIXED`에 **확정 등재**했다. 파생을 사실로 바꾼 이유는 era-C 그룹을 고치는 순간 era-B가 조용히 따라 움직이기 때문이다(뮤테이션 실측: era-C alc II→III 시 era-B 불변 / 확정값 30→40 은 검출).
  - 🟠 **`steel_frame_eps`만 잠정 유지** — 2010·2011·2013·2014 **어느 제10조③에도 열거가 없다**. 2010년 고시 용어의 정의 (15) 「조립식 패널 건물(**철골조를 제외함**)·컨테이너 건물 등은 경량철골조로 분류한다」의 반대해석으로 철골조 계열(III·30년)을 유지한다. 2015년 고시 미확보.


### F-38 · 🟡 medium · CONFIRMED — 구조지수 헤더 주석과 2013년 데이터가 불일치 — 「스틸하우스조를 4행(100)에 포함」이라 적었으나 데이터는 90

- **위치**: `lib/tax-engine/data/building-standard-price/structure-index.ts:14` (축 D2)
- **주장**: 주석이 2013년 4행의 모호 셀을 「석조·스틸하우스조 … 인접연도(2012·2014) 정합으로 4행(100)에 포함」으로 해소했다고 적었으나, 데이터는 stone만 100이고 steel_house는 90이다. 지수 10 차이는 기준시가에 선형으로 10% 직결된다.
- **근거**: structure-index.ts:11-15 및 :179-181 재확인 — 2013 블록의 90행에 `steel_house: 90`이 있다. 「인접연도 정합」 논거는 stone에는 성립하지만(2012·2014 모두 100) steel_house에는 성립하지 않는다(2012=90 ↔ 2014=100). 데이터 쪽은 2001~2013 전 구간 90, 2014~2026 전 구간 100으로 단일 경계를 이루어 이례값은 주석 쪽이다.
- **실패 시나리오**: 2013년 평가·스틸하우스조·200㎡: 지수 90으로 84,800,000원(지수 100이면 94,200,000, 차 9,400,000 ≈ 10%). 2013↔2014 사이에 설명되지 않는 단차가 생긴다. 부수로 지수 90↔100은 상증 「I 지붕재료」 조정률의 적용 여부(`structureIndex < 100` 게이트)까지 뒤집는다.
- **법령**: 국세청 「건물 기준시가 계산방법」 고시 부록 「연도별 구조지수표」 — 2013년 본문 미확인이라 어느 쪽이 옳은지 확정하지 못했다.
- **제안**: 2013년 구조지수표 원본을 재대조해 한쪽으로 일치시키고, 「인접연도 정합」 논거는 석조에만 적용되도록 한정 표기한다. 확정 후 data.test.ts에 2013 steel_house와 2013↔2014 경계를 고정하는 케이스를 추가할 것(현재 0건).
- **✅ 종결(2026-08-27 · 고시 원문 실측)**: **데이터(90)가 옳고 주석이 틀렸다.** 국세청고시 제2013-2호 제7조는 4행(100)에 [철근콘크리트조·석조·PC조·목조·라멘조·ALC조], 5행(90)에 [연와조·시멘트벽돌조·황토조·철골조·**스틸하우스조**·보강콘크리트조·시멘트블록조·보강블록조·와이어패널조]를 둔다. 「인접연도 정합」 논거는 **석조에만** 성립한다. 2014년 고시 제7조는 4행에 스틸하우스조를 **굵게 추가**하고 5행에서 뺐다 — 2013=90 → 2014=100 이동이 원문에 명시돼 있어 데이터의 단일 경계가 정확하다. ⇒ 주석 정정, **세액 변화 0**. 2013 블록은 고시 제7조와 **행 단위로 완전 일치**함도 확인했다(5행 9개 구조 포함). anchor `gazette-era-b-membership.anchor.test.ts` 13건(뮤테이션 2종 검출).


### F-39 · 🟡 medium · CONFIRMED — 건물 기준시가 legal-codes 모듈이 verify:legal 커버리지 수집기에서 통째로 빠져 게이트가 100%로 통과한다

- **위치**: `lib/legal-verification/coverage-collect.ts:21` (축 D11)
- **주장**: `MODULES`가 2026-06-04 이후 8개로 고정된 채 그 뒤 추가된 `building-standard-price`·`surcharge-transition`·`income-tax`·`local-tax` 4개를 담지 못한다. 빠진 조문은 모수에서도 사라져 uncovered에도 뜨지 않으므로 게이트는 초록이다.
- **근거**: coverage-collect.ts:9-31 재확인 — 4개 모듈 import 없음. 배럴은 재수출하지만 수집기가 leaf를 직접 import해 구제되지 않는다. 5개 모듈을 합쳐 재계산하면 total 320 → 323, uncovered = 소득세법 제127조·제129조·지방세법 제103조의13. 유일한 관련 가드 NS-META-1은 `toHaveLength(8)`로 드리프트를 잡는 대신 고정한다.
- **실패 시나리오**: legal-codes에 새 모듈이 생겨도 그 인용 전건이 개정 감시 밖에 남는다. 다만 building-standard-price 자체의 실질 노출은 0이다 — 그 5개 인용의 조 키(소득세법 제99조·시행령 제164조·상증법 제61조)가 이미 모수에 있고 등록돼 있으며, 실제로 모수 밖인 3조문은 소비자가 0건인 상수다.
- **법령**: 인프라(법령 해석 쟁점 없음). 감시 대상은 소득세법 제99조 제1항 제1호 나목 · 소득세법 시행령 제164조 · 상속세 및 증여세법 제61조 제1항 제2호.
- **제안**: MODULES에 4개 모듈을 추가하고 uncovered로 뜨는 3조문을 매니페스트에 verbatim 키워드로 등록하거나(소비자 0건인 두 상수의 존치 여부를 먼저 판단), NS-META-1의 `toHaveLength(8)`을 **legal-codes 디렉터리 열거 ↔ MODULES 대조** 단언으로 교체한다.

### F-40 · 🟡 medium · CONFIRMED — 소득세법 시행령 §164 매니페스트 키워드가 제1·2항에서만 뽑혀 이 기능이 의존하는 ③⑤⑧ 개정은 감시되지 않는다

- **위치**: `lib/legal-verification/manifest/additions-transfer-decree.ts:165` (축 D11)
- **주장**: 키워드 3개(「개별공시지가가 없는 토지」·「비교표에 따라」·「국세청장이 지정한 지역」)가 전부 §164 제1·2항 문장이고 ③⑤⑧을 고정하는 것은 하나도 없다. `verifyRule`이 조 전문에 대해 `includes`만 보므로 ③⑤⑧이 통째로 삭제돼도 PASS가 난다.
- **근거**: 매니페스트 :162-167 재확인. mutation probe로 ③⑤⑧을 삭제한 본문에 실제 rule을 먹여 PASS를 재현했다. 항 단위 미고정은 coverage.ts:7-8이 명시한 설계 속성이나, 그 결정문이 「같은 조의 **핵심 항**을 하나라도 검증하면」이라 요구하는데 이 기능의 핵심 항이 ③⑤⑧이다. 형제 규칙 §165는 「100분의 80을 곱한 금액」으로 앱 의존 항을 정확히 고정하고 있어 관행에서도 이탈이다.
- **실패 시나리오**: §164⑧이 삭제되거나 ⑤가 다른 항으로 옮겨져도 엔진과 결과 배지(「§164⑧ 환산 적용」)가 존재하지 않는 항을 계속 인용하고 verify:legal은 아무 경고도 내지 않는다.
- **법령**: 소득세법 시행령 제164조 제3항·제5항·제8항(현행, 시행 2026-07-01) — KoreanLaw 본문 실측 확인.
- **제안**: 키워드에 ③⑤⑧의 verbatim을 추가한다 — 「직전의 기준시가에 의한다」·「국세청장이 고시한 기준율」·「기준시가의 상승률을 참작하여」. 셋 다 현행 본문 그대로라 `keywordMode:"ALL"` 유지가 가능하며, 추가 후 `npm run verify:legal`로 확인한다.

### F-41 · ⚪ low · CONFIRMED — VII-37 비율을 Math.round로 정수 퍼센트에 양자화해 조정률이 입력 비율과 ±0.5%p 어긋난다

- **위치**: `lib/tax-engine/building-standard-price-helpers.ts:638` (축 D3)
- **주장**: `Math.round(normalUseRatio * 100)`이 연속값을 정수 지수 슬롯에 억지로 끼운다. 표에서 정수가 오는 I~VI과 달리 37번만 연속값이며, 같은 파일의 형제 수동 경로(`ratePercent / 100`)는 소수 퍼센트를 양자화 없이 받는다.
- **근거**: helpers.ts:637-638 재확인. 실측 0.855 → 지수 86(+0.585%), 0.845 → 85(+0.592%), 0.3333 → 33(−0.990%). 방향은 round-half-up이라 양방향이며 기대오차 0이다(제보의 「체계적 절상」은 정정). 상증 실사례에서 기준시가 250,000,000 vs 등가 248,800,000(+0.48%).
- **실패 시나리오**: 0.855 입력 시 조정률 0.86이 적용돼 기준시가가 0.48% 크게 산출된다. 범위 검증이 없는 현 상태(F-05)에서는 0.004 입력이 지수 0 → 기준시가 0원으로 경고 없이 붕괴하기도 한다.
- **법령**: 국세청 조정률 고시 구분 VII 번호 37 — 고시 본문 미확인이라 「raw 비율이 법적 정답」임을 확정할 수 없다. CLAUDE.md의 Math.round 금지는 금액 연산 규칙이라 이 율 연산에는 직접 적용되지 않는다.
- **제안**: F-05(범위 검증)를 선행한 뒤, rate 필드를 실수로 열어 양자화를 없앤다(표시는 `.toFixed(1)` — 형제 수동 경로와 일관). 정수 유지가 필요하면 최소한 절사로 바꿔 불리한 방향의 절상을 없앤다.

### F-42 · ⚪ low · CONFIRMED — 환산주택가격 override가 토지분을 원/㎡로 왕복 절사해 취득당시 기준시가 합계가 환산액보다 작아진다

- **위치**: `lib/tax-engine/general-building-converted-housing.ts:127` (축 D10)
- **주장**: `computeConverted`는 잔액 흡수로 `합계 = converted` 불변식을 지키는데, override가 토지분만 `Math.floor(convertedLand / landArea)`로 되돌리고 하류 4곳이 다시 `floor(perSqm × landArea)`로 복원해 최대 `landArea − 1`원이 소실된다. 건물분은 총액 그대로라 손실이 토지에만 몰린다.
- **근거**: converted-housing.ts:124-129 재확인. 복원 지점 4곳(converted-acquisition:48·general-building-valuation:235·:581·extension:177) 실측. 저장소 정책 `feedback_floor_residual_absorption`(안분 마지막 분기 잔액 흡수)과 어긋나며, 설계는 「변경 최소화」로 원/㎡ 역산을 채택했을 뿐 잔액 처리를 검토한 적이 없다.
- **실패 시나리오**: landArea 317: 환산주택가격 596,527,272인데 엔진이 쓰는 합계는 596,526,956(316원 = landArea−1 소실). 하류 토지 환산취득가액 399원·개산공제 base 316원 과소. 같은 화면에서 안분 카드는 443,799,999를, 상세명세서 산식은 443,799,683을 표시해 자기일관성이 316원 어긋난다.
- **법령**: 양도소득세 집행기준 99-164-10(환산주택가격) — 집행기준 본문 미확인. 안분 구조는 소득세법 시행령 제166조 제6항·제176조의2 제2항을 따른다.
- **제안**: override 결과를 원/㎡로 되돌리지 말고 총액 축으로 전달한다(취득시 토지 기준시가 총액 override 슬롯 신설). 총액 슬롯이 과하면 최소한 잔액을 건물분에 흡수시켜 합계를 보존하되, 그때 audit-fix-converted-housing.test.ts:58-66의 anchor 갱신이 필요하다.

### F-43 · ⚪ low · CONFIRMED — 상가·오피스텔 「최초고시시(2005) 건물 기준시가」 칸에만 계산기 런처가 배선돼 있지 않다

- **위치**: `components/calc/transfer/CommercialBuildingBlock.tsx:414` (축 D10)
- **주장**: §164⑥ 3시점 섹션에서 취득시(:412)·양도시(:442)에는 `BuildingStdPriceModalButton`이 붙어 있는데 최초고시시 칸에는 없다. 배치 모달이 게이트를 통과하면 채워지지만, 배치가 지원하지 않는 경로(기계식주차 — 모달을 열기 전 판정 불가)와 상속 취득 상가 섹션에는 폴백이 없다.
- **근거**: CB:412·414-427·442 재확인 — 최초고시 칸만 CurrencyInput 단독. 상속 취득 상가는 `AssetSectionAcquisition:288`이 CommercialBuildingBlock을 렌더하지 않아 배치도 런처도 없다(실측 런처 1·배치 0). 배치 모달 자신이 「미지원 경로는 범용 폼 런처가 담당 — 호출부는 보조로 유지」라고 계약을 선언하는데 이 칸만 미이행이다.
- **실패 시나리오**: 2005년 이전 취득 기계식주차 오피스텔의 §164⑥ 환산에서 취득시·양도시는 계산기가 있고 최초고시시만 손으로 산정해 넣어야 한다. 미입력은 validate가 차단하므로 조용한 오산은 없다.
- **법령**: 소득세법 시행령 제164조 제6항 — 이 값은 분모(나목 합계)에만 들어간다(승수는 다목 호별 고시 기준시가로 별도 필드·전용 조회 모달 있음).
- **제안**: PHD 선례(`transferSectionLabel` + `onApplyBoth`)를 차용하면 새 `applyTimePoint` 값 없이 배선할 수 있다. 상속 취득 상가 섹션에도 함께 적용할 것.

### F-44 · ⚪ low · CONFIRMED — 일괄 계산 모달 결과 행에만 「원」 접미사가 붙는다

- **위치**: `components/calc/building-std-price/MultiPointBuildingStdPriceModal.tsx:666` (축 D7)
- **주장**: N시점 결과 행 2곳이 `${fmt(...)} 원` 형태로 렌더해 숫자 끝에 「원」을 붙이지 않는 프로젝트 표기 규칙을 위반한다. 라벨에 단위 표기가 없어 순수 숫자 접미사다.
- **근거**: MultiPoint :666·:673 재확인. 같은 디렉터리의 결과 표시 3곳(ResultCard:45·AdvancedResult:57·68)은 bare 숫자이고, 이 기능군 계획서 :225가 「숫자 끝 "원" 금지」를 명문화했다. git blame상 구 PhdBuildingStdPriceModalButton에서 넘어온 미수정 잔존물이며 이 문자열을 단언하는 테스트는 없다.
- **실패 시나리오**: PHD·겸용 3시점 일괄 계산 결과가 다른 결과 화면과 다른 표기로 나와 금액 열 정렬·표기 일관성이 깨진다. 계산값은 정확하다.
- **법령**: 표기 규칙(법령 쟁점 없음).
- **제안**: 두 줄에서 「 원」을 제거하고 단위가 필요하면 좌측 라벨로 옮긴다. 다만 components/ 전역에 같은 패턴이 112건 있어 이 2줄만 고치는 것은 모듈 단위 정리임을 밝혀 둘 것.

### F-45 · ⚪ low · CONFIRMED — Ⅵ 절 제목이 화면은 「부속토지」, PDF는 「부수토지」로 다르게 인쇄된다

- **위치**: `lib/pdf/BuildingStdReportPdfPages.tsx:140` (축 D8)
- **주장**: 같은 서식의 같은 절 제목을 두 채널이 각각 하드코딩하고 있고 낱말이 다르다. 공용 포맷 모듈에는 절 제목 상수가 없다.
- **근거**: PDF :140 「부수토지」 재확인, 화면 ReportSection6Total:19는 「부속토지」. 서식 원본(국세청 교재 p.75~80, 2023.1.1 시행)을 텍스트 추출한 결과 3개 작성례 전부 「부속토지」이고 「부수토지」는 0건 — **정본은 화면 쪽이고 PDF 한 줄만 어긋났다**. 계획서 §2 원본 캡처 동결도 「부속토지」다.
- **실패 시나리오**: 화면 계산서로 서류를 정리한 뒤 PDF를 출력하면 같은 항목 제목이 다른 낱말로 나와 두 출력물의 동일성 대조가 어려워진다.
- **법령**: 국세청 「건물 기준시가 계산서」 서식 문구 — 서식 원본 텍스트로 정본 확인(고시 본문 자체는 미확인).
- **제안**: PDF :140을 「부속토지」로 고치고, 재발 방지가 필요하면 절 제목 상수를 nts-report/format.ts에 두어 두 채널이 공유하게 한다. ⚠️ 저장소의 다른 「부수토지」 용례(상속세 및 증여세법 제61조 제1항 제1호 부수토지 평가액)는 다른 개념이므로 전역 치환 금지.

### F-46 · ⚪ low · CONFIRMED — 취득 ≤2000 공시지가 입력 hint가 2001.1.1 기준일 근거를 소득세법 시행령 §164⑤ 단독으로 제시한다

- **위치**: `components/calc/building-std-price/BuildingStdPriceForm.tsx:513` (축 D11)
- **주장**: `hint="§164⑤ — 2001.1.1 현재 개별공시지가로 위치지수 산정"`이 화면에 그대로 렌더되는데, §164⑤ 본문에는 개별공시지가·위치지수·2001 어느 것도 없다. 11줄 위 주석(:502)은 이미 「(고시 §6①·소령 §164⑤)」로 둘을 병기한다.
- **근거**: Form:513 재확인. KoreanLaw 실측 — §164⑤는 「최초로 고시한 기준시가 × 국세청장이 고시한 기준율」뿐이다. §164⑤이 무관한 조문은 아니고(2001 기준연도를 강제하는 작동 조문) **불완전 인용**이다. 같은 기능의 다른 표시 문구(BuildingStdValuationSections:135)는 「(고시 §6⑥)」로 고시를 적어 내부 불일치다.
- **실패 시나리오**: 사용자가 근거를 따라 소득세법 시행령 제164조 제5항을 열면 2001.1.1 개별공시지가에 관한 내용이 없어 입력값의 근거를 확인할 수 없다. hint를 파싱해 링크를 만드는 코드는 없으므로 오연결은 발생하지 않는다.
- **법령**: 소득세법 시행령 제164조 제5항(현행) 및 국세청 「건물 기준시가 계산방법」 고시 §6① — 고시 본문 미확인.
- **제안**: hint에 고시를 병기해 :502 주석과 정합시킨다(예 「소령 §164⑤ · 고시 §6① — 2001.1.1 현재 개별공시지가로 위치지수 산정」). 법령명 없는 맨 `§` 표기는 저장소 전반 관례라 이 줄만 바꿀 사안이 아니다.

---

## 반증·정정

반증 렌즈가 완전히 기각한 것은 1건이다.

**D7-05 「배치 런처가 뜨면 1시점 런처가 숨는다 — 게이트 모듈의 '1시점 런처 상시 유지' 계약 위반」 → REFUTED.** 네 다리 중 셋이 무너졌다. ① CB(`CommercialBuildingBlock`)는 배치 삼항식이 :371~390에서 닫히고 1시점 런처가 :411·:442로 그 바깥에 있어 **병존**한다 — 계약을 지키는 반례이고 anchor가 그것을 고정한다. ② GB의 숨김은 2026-08-05 커밋 `69d11e07`이 **사용자 요청으로 계약을 명시적으로 뒤집은** 것이며, anchor 주석이 「🔄 의도적으로 뒤집힌 계약」으로 못박고 dead-end 메모리 검토 기록까지 남겼다. ③ PHD가 게이트를 평가하지 않는 것도 계획서 :187-189가 그 호출부를 선례로 지목해 명시 허용했다. 남은 실질은 게이트 모듈 헤더 주석 2곳(`building-std-multipoint-gate.ts:24`·`MultiPointBuildingStdPriceModal.tsx:23`)이 CB에는 맞지만 GB에는 더 이상 맞지 않는 **주석 드리프트**뿐이라 findings에 올리지 않았다.

이 밖에 축 내부에서 **범위가 좁혀지거나 근본 원인이 정정된** 것이 여럿이라 목록에 반영했다: D4-03의 원인이 floor 순서가 아니라 float 손실로(F-33), D8-02의 성격이 「헤드라인 오류」가 아니라 「절 누락」으로(F-17), D9-04의 성격이 「죽은 분기」가 아니라 「결손 미기록」으로(F-22), D7-03의 제안 수정이 「환산값 적용 버튼 신설」에서 「토글 숨김」으로(F-19 — 라목 통합값을 나목 건물 칸에 넣으면 토지 이중계상), D8-03의 (4)가 `landValue`가 아님으로(F-29) 각각 뒤집혔다. 각 항목 suggestedFix에 그 정정을 반영했다.

또한 각 축이 「결함 아님」으로 확인해 제외한 것 중 재조사 낭비가 큰 것: 곱셈 순서·모드별 조정률 게이팅·기계식주차 배타성·개산공제율 분기·§164⑥ 분자·분모 방향·§97②2호 swap 택일·부속시설 잔액 흡수(전 부분 수령 시)·print CSS-only 토글·금액 셀 정렬 클래스·`useEffect → store` 미러링 부재·다중키 patch stale spread 부재·스냅샷 키 접두 충돌 부재.

---

## 테스트 안전망 실측 (뮤테이션)

뮤테이션 11종을 돌려 안전망을 실측했다(baseline: `__tests__/tax-engine/building-standard-price/` + `__tests__/calc/` = 195파일 2,068테스트, 한 리포터로 통일).

**핵심 산식은 두껍다.** 용도지수 제거 49건 · 절사 단위 변경 73건 · 조정률 미적용 36건 · 잔가율 미적용 78건 · 산정기준율 미적용 10건이 반응한다.

**구멍은 전부 경계·게이트·선택적 특성에 몰려 있다 — 실패 0건이 네 건이다.**
- `year >= 2001` → `> 2001`(§164⑤ 경계): 0건. 마스킹이 아님을 반대 방향(`>= 1990` → 16건)으로 배제했고, `acquisitionYear: 2001`을 쓰는 테스트가 0건(2000은 5건)이다.
- `transferYear <= acqY+1` → `<`(§164⑧ 연도교차): 0건. 같은 조건절의 동일연도 축은 3건이 지키므로 **교차연도 축만** 사각지대다. 원인은 anchor 단계 어긋남 — 유일한 교차 테스트가 `toEngineInput`(폼 ④)만 보고 엔진을 호출하지 않는다. **F-12가 이 사각지대 안에 있다.**
- VII-37 무력화: 0건. `normalUseRatio` 문자열이 `__tests__`·`e2e` 전체에 0 hit — 얇은 게 아니라 **부존재**다(F-05·F-41).
- 부속시설 수령 게이트 제거: 0건. 상증 복합+부속 테스트 전건이 **모든 부분에 sharedAdjustment를 지정**해 「부분 지정」 조합이 격자에 없다(F-26).

그 밖에 **조합 부재**로 확인된 것: `landParcels` × `manualAdjustmentRate` 조합 테스트 0건(F-03), `specialFeatures: {}` 테스트 0건(F-09), `prevUsageNo`를 공급하는 테스트 0건(F-02), `-phd-first`·`-gb-first`의 인스턴스 수·markCell 단언 0건(F-30), `nts-bsp-x-4`·`-x-sum` 참조 0건(F-29).

**1,000원 절사 경계는 반대로 위험 신호를 준다.** `truncateToThousand(raw - 1e-9)` 뮤테이션에 6파일 9건이 실패한다 — 현행 anchor 9건이 raw ㎡당 금액이 정확히 1,000의 배수인 지점에 서 있다는 뜻이고, 이것이 F-04의 노출면이 실재함을 뒤집어 증명한다(다만 감지 방향이 반대라 지금은 통과 중).

**수정 시 함께 심어야 할 anchor**: ① 엔진 진입점을 직접 호출하는 연도교차 §164⑧ 2건(교차 + singleTimePoint 동치), ② VII-37 정상값·경계값 2건, ③ 부속 부분 지정 characterization 1건, ④ F-04·F-08의 격자 스캔을 BigInt 정확값 대조 anchor로 승격, ⑤ 취득연도 2000/2001 경계 1쌍, ⑥ 스킴 경계 연도의 `prevUsageNo` 1쌍. 현행 코드에서 F-04·F-08·F-31·F-32는 회귀 신호가 0이므로 고치는 순간 무엇이 바뀌었는지 알 방법이 없다.

---

## 커버리지 갭 — 이번 리뷰가 못 본 것

**1. 국세청 「건물 기준시가 계산방법」 고시 본문을 끝내 확인하지 못했다.** 산식·구조지수·용도지수·위치지수·잔가율·조정률·산정기준율의 실체는 전부 이 고시(첨부 PDF)에 있고 법령 조문이 아니다. 그래서 다음은 **판정하지 않고 남겼다**: F-09(특성 미선택 시 II 연면적을 적용하는 것이 옳은지) · F-26(공용 조정률 미지정 부분에 부속면적을 배분하지 않는 취급이 허용되는지) · F-37(2003~2015 잔가율표에 신공법이 어느 내용연수 열에 있는지) · F-38(2013년 구조지수표의 스틸하우스조 행) · F-29(※표 실제 칸 구성과 (4)의 기준시점) · F-41(VII-37이 정수 퍼센트를 요구하는지) · F-06(대수선 할증에 명시적 상한이나 「하한 도달 시 배제」가 있는지). 이들은 전부 「고시 본문 확인이 선행 조건」이다.

**2. 법령 본문 미확인 2건.** 소득세법 시행령 제164조 제5항·제9항은 법제처 API 500 오류로 원문 대조에 실패했다(각각 F-15·F-36, F-14). 인용은 저장소 legal-codes 상수와 코드 주석 표기를 옮긴 것이다. 「전남광주통합특별시 설치를 위한 특별법」의 시행일도 저장소 주석(2026-07-01)과 법제처 기록(2026-08-20)이 어긋난 채 남아 있다(F-07).

**3. 재현하지 못한 수치 주장.** ① F-33의 「단독/복합 floor 순서 차이가 독립적으로 값을 가른다」는 float 손실을 제거하면 사라지는지 확인하지 못했다. ② §164⑨ 3트랙 중 1호 per-㎡만 재현했고 1호 주택 총액·2호 공매경락 트랙은 미측정이다(F-14). ③ F-19의 실제 클릭 경로(연도·구조·용도 Select 조작 → 계산 → 버튼)를 E2E로 끝까지 밟지 않고 코드+렌더 probe로 합성했다. ④ F-21은 메커니즘만 확증했고 현행 배포본 CSV에 BOM 없는 UTF-8이 실재하는지는 원본 부재로 확인 못 했다.

**4. 원본 데이터가 워크트리에 없다.** `data/raw/stdprice/`·`data/stdprice/`가 둘 다 비어 있어(gitignore) F-07의 「국세청 상가 원본이 구 시군구 코드로 적혀 있다」와 F-22의 「현행 배포본에 결손이 없다」를 직접 확인하지 못했다. 전자는 개편 시점과 현행 PNU 실측으로, 후자는 계획서 기록으로 대체했다.

**5. 돌리지 않은 축·범위.** 뮤테이션 실측은 `__tests__/tax-engine/building-standard-price/` + `__tests__/calc/` 두 디렉터리로 한정했다(동시 실행 중인 다른 세션 때문). `__tests__/components/`·`__tests__/print/`·`e2e/` 전건은 돌리지 않았고, Tailwind 빌드 산출 CSS의 정렬 유틸 우선순위(`TD`의 `text-center` ↔ `AMOUNT_CELL`의 `text-right` 공존)도 확인하지 못했다.

**6. 범위 밖으로 남긴 인접 결함 3건.** ① 부속시설 면적을 넣었는데 어느 부분에도 공용 조정률이 없으면 Ⅳ·Ⅴ 행이 아예 생기지 않고 그 면적이 ⑪에서 통째로 빠진다(warnings 0건 — 엔진 게이팅 축). ② 겸용주택 `transfer-tax-api-mixed-use.ts:99-104`의 PHD 자동 안분이 「전체 건물 기준시가」를 전제하는데 배치는 주택분 소계만 싣는다(§164⑦ 축, 발화 조합 미재현). ③ `calculateGeneralBuildingTransfer`가 §99-164-10 override 이전의 raw 값을 `buildApportionment`에 넘기는데 그 필드를 렌더하는 소비처를 찾지 못했다(호출부 0개로 제외).

**7. 작업 위생 사고.** 리뷰 중 여러 축 에이전트가 공유 디렉터리 `__tests__/__probe__/`를 `rm -rf`로 정리하면서 동시 실행 중인 다른 축의 미추적 probe 파일을 최소 3회 함께 삭제했다(D4·D5·D6·D7·D8·D9 계열). 복구 불가이나 측정은 이미 끝난 뒤였고, 최종 워크트리는 `git status --short` 무출력(추적 파일 변경 0·probe 잔여 0)으로 확인했다.

---

## 완결성 비판 (다음 라운드 필수 항목)

## 완결성 비판 — 다음 라운드 필수 항목

**1. 아무도 열지 않은 파일이 세 덩어리 있다.**
- **E2E 45개 스펙 전부 미독**(11축 filesRead 합집합에 `e2e/` 0건). 하필 `e2e/building-stdprice-apply-timepoint.spec.ts`가 F-13의 정확히 그 축이고, 머리 주석이 「applyTimePoint가 폼까지 단일 시점 모드로 좁힌다(building-std-modal-single-timepoint.plan.md)」를 계약으로 못박고 있다 — F-12(단일시점이 §164⑧을 가로챈다)를 이 스펙과 대조하지 않은 채 high로 올렸다. `cb-building-stdprice-modal-apply.spec.ts`·`general-building-std-price-report.spec.ts`·`transfer-multi-building-std-report.spec.ts`도 같다.
- **엔진 anchor 15개 중 7개 미독**: `single-timepoint.test.ts`(205줄)·`nts-cases.test.ts`·`anchor.test.ts`(202줄)·`transfer-pre2001.test.ts`·`phd-3point-batch.anchor.test.ts` 등. safetyNet의 「교차연도 사각지대」·F-24의 stale compositeMode 주장이 `single-timepoint.test.ts`를 안 읽고 나왔고, F-03의 「landParcels × manualAdjustmentRate 조합 0건」은 두 키가 **함께 들어 있는** `nts-cases.test.ts`(:61 manualAdj, :142 landParcels)를 안 읽고 나온 부정 단언이다.
- **컴포넌트·lib 4개**: `components/calc/building-std-price/LandParcelsSection.tsx`(87줄 — F-03·F-08의 유일한 입력 UI), `BuildingStdSectionCard.tsx`, `BuildingRegisterLookupField.tsx`, `lib/calc/burdened-gift-std-price-launcher.ts`.

**2. 출처 없는 인용.** F-29·F-44·F-45가 「계획서 §8·§2·:225」를, F-19·F-36이 「계획서 §1.5②」를 인용하는데 `docs/00-pm/building-std-price-nts-report.plan.md`(274줄)는 **어느 축의 filesRead에도 없고 D7은 문서를 0건 읽었다**. 규율 1 위반 후보 — 재확인 전엔 그 근거를 쓰면 안 된다.

**3. 두 축의 접점이 한 번도 이어지지 않았다.** 모달 `onApply` → 필드 → ④변환 → Zod ⑫ → route ⑭ → 엔진 환산취득가액 → **세액**까지 관통한 probe가 0건이다. F-04(1,000원)·F-08(지수 한 칸)·F-31(1원)은 전부 기준시가 단계에서 멈췄는데, 이 값은 환산 **분모**라 세액에서 증폭될 수 있다 — critical 등급의 근거가 미측정이다.

**4. 검증 안 된 모달리티**: 브라우저 0회, Vworld·NED·MOLIT 실응답 0회(F-01의 「산 2-1」 토큰 형태를 실응답에서 본 적 없음), 법제처 §164⑤·⑨ 본문 미확보, 원본 CSV 부재(F-21·F-22).

**5. 반증이 얇다.** REFUTED 1건뿐이고, **고시 본문 미확인으로 「옳은 동작을 모르는」 7건(F-06·F-09·F-26·F-29·F-37·F-38·F-41)에 이미 severity가 붙어 있다.** 다음 라운드 1순위는 국세청 고시 원문 확보다 — 없으면 이 7건은 매 라운드 재조사만 반복된다.

---

## 리뷰 이후 직접 재확인한 것 (본 세션)

- **F-01 재확인** — `app/api/address/standard-price/route.ts:94-98` 원문 확인. `parts[parts.length-1]`만 `startsWith("산")`으로 보므로 「… 행현리 산 100」에서 마지막 토큰이 `100`이 되어 `landType`이 `"1"`로 남는다. 지적대로다.
- **F-03 재확인** — `manualAdjustmentRate`를 배율로 바꾸는 지점은 `building-standard-price.ts:268` **단 하나**이며 단일시점 경로 전용이다(전수 grep). `resolveCompositeParts`의 fallback part(`:99-104`)는 `{label, structureKey, usageNo, floorArea}` 4필드뿐이라 조정률이 실릴 자리가 없다. 지적대로다.
- **완결성 비판 §1의 F-03 반박은 기각** — 비판은 `nts-cases.test.ts`의 `manualAdj(:61)`·`landParcels(:142)`가 함께 있으므로 「조합 테스트 0건」이 부정 단언이라 했으나, 두 줄은 서로 다른 `describe`에 있고 `:142` 다필지 케이스는 `compositeParts`에 **부분별 `adjustmentRate`(110/60)** 를 쓴다. F-03이 지적하는 것은 `compositeParts` **없이** `landParcels`만 있을 때의 fallback 경로이므로 그 테스트는 이 조합을 덮지 않는다. **안전망 0건 주장은 유지된다.**
- **보안 분류기 경고 1건** — `verify:refute:D11-01` 에이전트가 플래그됐다. 전 도구호출을 감사한 결과 워크트리 밖 접근·추적 파일 수정·외부 전송은 없었고, 걸린 지점은 probe 테스트에 `sed -i`로 `writeFileSync`를 주입해 로그를 파일로 뽑은 것과 `rm -rf __tests__/__probe__`다. 최종 `git status --short` 무출력(clean) 확인. 다만 그 에이전트의 판정(F-39·F-40 계열)은 다른 건보다 신뢰도를 낮춰 볼 것.

## 착수 조건 — 고시 원문 없이 손대면 안 되는 7건

국세청 「건물 기준시가 계산방법」 고시와 「상속세 및 증여세법상 건물평가시 적용할 조정률」 원문을 **어느 축도 확보하지 못했다**(조정률표가 이미지, 원본 PDF는 저장소 밖). 다음은 「옳은 동작이 무엇인지」가 고시에 달려 있어 판정을 보류했다:

~~**F-06 · F-09 · F-26 · F-29 · F-37 · F-38 · F-41**~~ → **잔여 F-09 · F-29 뿐**(F-06·F-41 = 제2025-39호로 종결 · F-26 = 설계문서로 종결 · **F-37·F-38 = 2026-08-27 과거 연도 고시 7건으로 종결**). 아래 서술은 당시 기록이다. 이 건들은 고시 원문 확보가 착수 조건이었다. 확보 없이 어느 방향으로 고쳐도 국세청 공식 계산사례 anchor가 깨진다.

또한 법제처 API 500 오류로 **소득세법 시행령 제164조 제5항·제9항 본문 대조에 실패**했다(F-14·F-15·F-36 근거). 인용은 저장소 `legal-codes` 상수 표기를 옮긴 것이다.
