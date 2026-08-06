# 의제취득일 전(pre-deemed) 상속·증여 취득가액 정정 — 물가상승률 방식 제거 + max(①,②,③)

작성일: 2026-07-08 · 대상: 양도세 상속·증여 취득가액 `calcPreDeemed` · 성격: **법령 오류 정정(세액 영향)**

> ## ✅ 구현 완료 — 단, **목표 산식은 그 뒤 다시 바뀌었다** (2026-08-06 확인)
>
> | 본 계획의 목표 | 현재 |
> |---|---|
> | 물가상승률(CPI) 분기 제거 | ✅ 완료 — `calcPreDeemed`에 CPI 흔적 없음 |
> | ② §164④~⑦ 후보 추가 | ✅ 완료(**#1080**) — `clauseA`의 `sec164` |
> | **`max(①,②,③)` 3자 max** | 🔴 **대체됨(#1089 `af74d907`)** — `clauseA = max(①,②)` → **0일 때만** ③ |
>
> ⇒ 아래 §1 「현행 결함」은 **2026-07-08 시점 서술**이고, §4.1의 3자 max는 **최종 형태가 아니다**.
> ③을 나목으로 분리한 근거(법 §97①1호 단서·국심2003부0627·0626)는
> [`…clause-a-b-separation.plan.md`](inheritance-pre-deemed-clause-a-b-separation.plan.md) §4.1(b) 참조.

## 1. 문제 (현행 결함 — 2026-07-08 시점)

`lib/tax-engine/inheritance-acquisition-price.ts` `calcPreDeemed`(:76-149)는 pre-deemed(상속개시일 < 1985.1.1) 취득가액을
```
max(③ 환산취득가[converted], 피상속인취득가 × CPI[inflationAdjusted])
```
로 계산한다. **"피상속인취득가 × 물가상승률" 분기(:96-121)는 법령 근거가 없다.**

**삼중 오류**:
1. **기준값**: `decedentActualPrice`(피상속인이 실제 취득한 가액)를 사용. 상속·증여 자산의 취득가액 기준은 상속개시일/증여일 현재 평가액이지 피상속인/증여자의 원취득가가 아니다(소령 §162①5호·§163⑨).
2. **방식 부적용**: 소령 §176조의2④2호의 "취득당시가액 × 생산자물가상승률"은 **취득 당시 실지거래가액이 "확인되는 경우"** 에 한한다. 상속·증여 자산은 실지거래가액이 확인되지 않고 §163⑨로 상속개시 평가액이 의제되므로 **호2 요건 미충족 → 물가상승률 방식 적용 대상 아님**.
3. **지수·기간**: 설령 방식이 맞더라도 코드는 **소비자물가지수(CPI)**(`data/cpi-rates.ts` — 값 자체가 placeholder TODO)를 쓰고, 기간 종점을 **양도연도**로 둔다(:109). 조문은 **생산자물가상승률(PPI)**, 종점은 **의제취득일 직전일(1984.12.31 고정)**.

## 2. 올바른 규정 (이미지 25·26 = 국세청 집행기준 + 국심2003부602[2003.7.25.]·2003서3266[2004.4.29.])

**pre-deemed 상속·증여 취득가액 = max(①, ②, ③)**
- **① 상증법 §60~66 평가액** (상속개시일/증여일 현재)
- **② 소령 §164④~⑦ 가액** (취득당시=상속개시일 기준시가: 토지 §164④, 건물 §164⑤⑥, 주택 §164⑦)
- **③ 의제취득일 현재 매매사례가액·감정가액·환산취득가액** (소령 §176조의2③1~3호·④)

**필요경비 구분**:
- **①·②** = 취득당시 실지거래가액 **의제** → 자본적지출·양도비용 **실제공제**(소령 §163③⑤). 개산공제 없음.
- **③** = 추계결정(소법 §114⑦·소령 §176조의2④) → **개산공제만**(소령 §163⑥, 취득시 기준시가 × 3%).

**post-deemed와의 관계**(오늘 오전 PR#535): post-deemed는 ③ 적용 불가 → **max(①,②)**. pre-deemed는 ③ 추가 → **max(①,②,③)**. 본 정정은 그 대칭 완성 + 물가상승률 오분기 제거.

### 물가상승률 조문(§176조의2④2호) 정합성 판단 (동결)
§176조의2④2호에 "생산자물가상승률" 문언이 **존재**하고 "(상속 또는 증여받은 자산을 포함한다)"도 있으나, 호2는 **"취득 당시 실지거래가액이나 §176조의2③1·2호 가액이 확인되는 경우"** 라는 요건이 붙는다. 상속·증여 자산은 이 요건을 충족하지 못한다(취득 실지거래가액 부존재→§163⑨ 평가액 의제). 따라서 상속·증여에는 호2가 적용되지 않고, 집행기준·심판례가 정한 max(①,②,③)만 적용된다. **본 계획은 이 해석을 확정 전제로 한다**(사용자 확인 완료: "상속·증여받은 자산은 생산자물가상승률로 환산하는 규정은 없어").

## 3. 현행 배선 실측 (file:line)

- `calcPreDeemed`(`inheritance-acquisition-price.ts:76-149`): ③ 환산(`converted`, :81-91) + 호2 CPI(`inflationAdjusted`, :96-121) + max(:126).
- **① 미도달**: `reportedValue`/`publishedValueAtInheritance`는 pre-deemed 본문 **미사용**. API 빌더(`transfer-tax-api-inheritance.ts:42-55`) pre-deemed 분기 **미송신**. Zod pre-deemed 스키마(`transfer-tax-schema-sub.ts:593-623`)·route(`route-inherited-acquisition.ts:17-32`) **부재**.
- **② 미노출**: helpers(`inheritance-acquisition-helpers.ts`)가 §164⑦(주택)·pre1990(§164④ 토지) 결과를 `standardPriceAtDeemedDate`(=③ 환산 분자)로만 주입(:109-117). **독립 max 후보로 노출되지 않음**. (`shouldInjectPostDeemedHouseMax`는 `!isPreDeemed` 게이트라 pre-deemed 비활성.)
- **필요경비 메커니즘 존재**: `applyResultToInput`(`inheritance-acquisition-helpers.ts:131-151`) — ③ 채택 시 `useEstimatedAcquisition=true`+`acquisitionMethod="estimated"`+`standardPriceAtAcquisition` 세팅 → 하류 `calcTransferGain`(:309-330) 개산공제 자동. 호2 채택 시 미세팅 → 실제공제. **①②(실제공제) vs ③(개산공제) 구분 배관이 이미 존재** → 재사용.
- **UI** `PreDeemedInputs.tsx`(370줄): ①의제취득일 기준시가(`standardPriceAtAcq`, :236) · ②양도시 기준시가(:301) · 주택 3시점(`HouseValuationSection`, :207) · 토지 1990(`Pre1990LandValuationInput`, :267) · **피상속인 실가 토글(`hasDecedentActualPrice`, :332-362)** · "물가상승률" 설명(:197,:335). ① 상증법 평가액 직접입력 필드 **없음**.
- **타입** `PreDeemedBreakdown`(`types/inheritance-acquisition.types.ts:129-143`): `convertedAmount`·`inflationAdjustedAmount`·`selectedMethod("converted"|"inflation_adjusted")`·`cpiFromYear/ToYear/Ratio`.
- **결과카드** `InheritedAcquisitionDetailCard.tsx`: "환산취득가액" vs "취득실가 × 물가상승률"(:93), "소비자물가지수" 하드코딩(:106). `METHOD_LABELS.pre_deemed_max`="환산·물가환산 중 큰 금액"(:30).

## 3.9 최종 설계 확정 (사용자 판단, 2026-07-08)
- **기준시점 = 의제취득일(1985.1.1)** (precedent 조심2023서0676·2010서1195). ②·③ 모두 `standardPriceAtDeemedDate`(의제취득일 기준시가) 사용 → R3 시점 혼용 해소(동일 값 기준).
- **산식 = max(①,②,③) 직접비교** (해설서). ① 상증법 평가액·② §164 기준시가·③ 환산.
- **② = 기존 `standardPriceAtDeemedDate` 그대로**(별도 §164 주입 불필요 — 이미 의제취득일 기준시가 총액. code review 확인: pre1990/houseValuation 주입값 = 총액).
- 구현 순서: **Phase 1(엔진 핵심, 이 커밋)** = 물가상승률 제거·max(①,②,③)·타입·결과카드·라우팅·cpi 삭제·anchor. **Phase 2** = ① reportedValue pre-deemed 배관(Zod/API/route)·UI(피상속인 토글 제거·① 신고가액 입력).

## 4. 설계 — 정정

### 4.1 엔진 `calcPreDeemed` 재작성 → max(①,②,③)
- **호2(CPI) 분기 제거**(:96-121). `decedentActualPrice`/`decedentAcquisitionDate`·`data/cpi-rates.ts` 이 경로에서 미사용화(cpi 파일은 다른 소비처 확인 후 정리).
- 후보:
  - ① `reportedValue`(상증법 평가액, 신규 도달).
  - ② §164④~⑦ 값 — helpers가 주입하는 `houseValuationResult.housePriceAtInheritanceUsed`(주택)·`pre1990LandResult.standardPriceAtAcquisition×면적`(토지)을 **독립 후보 필드**(예: `sec164ValueAtInheritance`)로 노출(post-deemed `houseValuationStdPrice` 주입 패턴 차용).
  - ③ `converted`(환산, 유지). 의제취득일 매매·감정가액은 **본 정정 범위 외(후속)** — 환산만 지원, 미지원 명시.
- `acquisitionPrice = max(①,②,③)`. `selectedMethod` = 채택 후보.
- **필요경비 라우팅**: ③(환산) 채택 → `useEstimatedAcquisition=true`(개산공제). ①·② 채택 → 미세팅(실제공제). `applyResultToInput` 분기 확장(기존 converted 분기 + ①② 분기).
- `legalBasis`: 소령 §176조의2④·③ · §163⑨ · 국심2003부602·2003서3266. 상수 `legal-codes/transfer.ts` 추가.

### 4.2 타입 `PreDeemedBreakdown` 정정
- 제거: `inflationAdjustedAmount`·`cpiFromYear`·`cpiToYear`·`cpiRatio`.
- 추가: `reportedAmount`(①)·`sec164Amount`(②)·`convertedAmount`(③, 유지)·`selectedMethod: "reported" | "sec164" | "converted"`.

### 4.3 UI `PreDeemedInputs.tsx`
- **제거**: 피상속인 실가 토글·`decedentAcquisitionPrice` (:332-362), "물가상승률" 설명(:197,:335).
- **추가**: ① 상속세 신고가액(상증법 평가액) 직접입력(post-deemed `publishedValueAtInheritance` 재사용). ② §164④~⑦은 기존 `HouseValuationSection`·`Pre1990LandValuationInput` 유지(취득당시 기준시가 산정).
- 하단 안내를 "max(① 상증법 평가액, ② §164④~⑦, ③ 환산취득가) 중 큰 금액" 으로 정정.

### 4.4 결과카드 `InheritedAcquisitionDetailCard.tsx`
- "취득실가 × 물가상승률"·"소비자물가지수" 표시 제거 → ①②③ 후보 금액 + 채택 표시. `METHOD_LABELS.pre_deemed_max` 문구 정정.

## 5. 14 동기화 지점 (①·② 신규 도달 배관)
- **⑫ Zod pre-deemed 스키마**(`transfer-tax-schema-sub.ts:593-623`): `reportedValue`(①) 입력 추가. ② 주입값은 엔진 내부(houseValuation/pre1990 파생)라 스키마 무관.
- **⑬ API body/변환**(`transfer-tax-api-inheritance.ts:42-55`): pre-deemed 분기에 `reportedValue`(publishedValueAtInheritance) 송신 추가.
- **⑭ Route 매핑**(`route-inherited-acquisition.ts:17-32`): `reportedValue` Date/숫자 매핑.
- ①폼·②initial·③normalize: `publishedValueAtInheritance` 기존 존재(post-deemed 공유) → 재사용. ⑤UI(4.3)·⑦결과(4.4)·⑧validate(선택 입력, 차단 없음).
- 나머지(④사이드바 등): `transfer-per-asset-summary.ts` pre-deemed는 결과 acquisitionPrice 읽음 → 산식 변경 무관, 실측 확인.

## 6. 결정사항 / 리스크
- **Q1(확정)**: 상속·증여 pre-deemed = max(①,②,③), 물가상승률 미적용. (§2 정합성 판단)
- **Q2(확정: a)**: ② §164④~⑦를 독립 후보로 노출하는 방식 = post-deemed `houseValuationStdPrice` 주입 패턴 차용(신규 내부 필드). helpers에서 주택=`housePriceAtInheritanceUsed`, 토지=`pre1990LandResult` 기반 취득당시 기준시가를 별도 후보로 주입.
- **Q3(확정: 환산취득가액만)**: ③은 **환산취득가액만** 지원(현행 `converted` 유지). 의제취득일 현재 매매사례가액·감정가액은 **범위 외(후속)** — UI/엔진에 "미지원, 후속" 명시. 이번 정정은 핵심(물가상승률 제거 + ①② 추가)에 집중.
- **R1**: `cpi-rates.ts`·`decedentActualPrice`·`decedentAcquisitionDate` 제거 시 다른 소비처(하위호환·테스트) 확인 후 정리(orphan 정책).
- **R2**: 세액 영향 정정 — 기존 pre-deemed 계산 이력과 결과가 달라짐. anchor로 신·구 차이 문서화.
- **R3**: ②(취득당시=상속개시일 기준시가)와 ③환산 분자(의제취득일 기준시가)의 시점 구분 — 현행 helpers는 pre1990 취득당시값을 의제취득일 기준시가로 혼용(:115-117). ② 독립 노출 시 이 혼용의 정확성 재검토 필요.

## 7. 검증 계획 (pre-Do anchor 우선)
- anchor: ① 상증법 평가액 > ②③ → ① 채택·실제공제(개산공제 없음). ③ 환산 > ①② → ③ 채택·개산공제. ② §164⑦(미공시 주택) > ①③ → ② 채택. **물가상승률/CPI 분기 완전 제거(decedentActualPrice 입력해도 미반영)**.
- 회귀: 기존 pre-deemed 테스트(신·구 차이 갱신), `__tests__/tax-engine/transfer-tax/inherited-acquisition.test.ts`, 전체 `__tests__/calc`.
- KoreanLaw: §176조의2④③·§164④~⑦·§163⑥⑨·§162①5호 인용 최종 확인.

## 7.5 독립 검토 반영 (2026-07-08, 법령·코드 2트랙)

### 코드 정정 (확정 반영)
- **🔴 BLOCKER — `decedentAcquisitionDate` 제거 범위 한정**: 스토어 `calc-wizard-asset.ts:282`의 `decedentAcquisitionDate`는 **단기보유 통산·겸용건물 공유 필드**(`GeneralBuildingAcquisitionCards.tsx:200`·`transfer-tax-api.ts:452-454`). 스토어/UI 레벨 제거 금지. 제거 대상 = **엔진 입력 타입 `InheritanceAcquisitionInput.decedentAcquisitionDate`(types:107) + Zod pre-deemed 필드**로 한정. `decedentAcquisitionPrice`도 `familyBusinessInheritance.decedentAcquisitionPrice`(가업상속 §97의2)와 동명 → 전역 grep 일괄삭제 금지.
- **🔴 토지 ② 단위**: `pre1990LandResult.standardPriceAtAcquisition`은 **이미 총액**(`pre-1990-land-valuation.ts:275-277`, 단가×면적 반영). §4.1의 "×면적" 삭제 — ② 토지 후보 = `standardPriceAtAcquisition` 그대로.
- **cpi-rates 완전 삭제 가능**: 소비처 calcPreDeemed + 테스트 1건뿐. `data/cpi-rates.ts` 삭제 안전.
- **필요경비 라우팅 키**: `method`("pre_deemed_max")가 아니라 **`preDeemedBreakdown.selectedMethod`**(`applyResultToInput` `helpers:136-137`). ①② 채택=useEstimatedAcquisition 미세팅(실제공제), ③=세팅(개산공제).
- **결과카드 동시 수정 필수**: `InheritedAcquisitionDetailCard.tsx:94-107`이 `inflationAdjustedAmount`·`cpi*` 직접 소비 → 타입 필드 제거 시 TS 하드 오류.
- 깨지는 테스트: `inheritance-acquisition-price.test.ts` A-1/A-2/A-3/A-7/A-8 재작성.

### 🚨 법령 OPEN 쟁점 (Do 진입 전 사용자 확정 필요 — 세액 영향)
독립 법령검토가 **직접 쟁점 재결 조심2023서0676(2023.8.29 기각)**를 발견. 계획의 핵심 전제 3개가 흔들림:

1. **기준시점 ① — 상속개시일 vs 의제취득일**: 계획은 ②/①을 "상속개시일 기준시가"로 단정. 그러나 precedent(**조심2023서0676·조심2010서1195**)는 **의제취득일(1985.1.1) 현재 기준시가**로 산정. 상속개시일 ≠ 의제취득일(예: 1972 상속)이면 세액 차이 큼. → precedent는 **의제취득일** 지지.
2. **산식 구조 — flat max(①,②,③) vs 추계트랙 환산**: 계획(해설서 이미지 25·26)은 max(①,②,③). 그러나 조심2023서0676은 "상속자산은 취득 실지거래가액 확인 불가 → §97①1**나목(매매→감정→환산 순차)** 적용"으로, **①(상증법 평가액)이 독립 후보가 아닐 수 있음**(환산 위주 추계트랙). §163⑨ 의제 실가를 실지거래가액으로 인정하느냐의 doctrinal split.
3. **물가상승률 배제 근거 재프레이밍**: 계획의 "§163⑨ 평가액 의제 → 실지거래가액 확인 안됨" 논리는 조문(§163⑨은 평가액을 "실지거래가액으로 **본다**"=의제)과 **배치**. 2009.2.4 개정으로 호2의 "상속·증여 제외" 문구 삭제 → "규정 없음" 단정 부정확. 반대례 **심사양도2011-172(PPI 인정)** 병존. 방어가능 논리 = "호2 base(취득당시 실제 매매·감정·실가)가 무상취득엔 부존재". 결론(PPI 미적용)은 조심2023서0676이 지지하나 "동결" 아님.

### 인용·범위 보완 필요
- **국심2003부602·2003서3266**(해설서·본 계획 인용) = 법령검토 검색 미확인 → 실존·적합성 재확인. **조심2023서0676**(직접 쟁점) 추가 인용.
- ① 후보 = 신고가액(reportedValue)이 아니라 **§163⑨ "결정·경정가액 우선"**.
- ② 건물(§164⑤⑥ 오피스텔·상가·일반건물)도 §163⑨ 단서 2호 대상 — 주택·토지만 서술한 것 보완.
- 부담부증여 채무액·증여의제(§34~§42의3, §163⑩ 별도)·주식 의제취득일(1986.1.1) 예외 명시.

## 7.9 Phase 1 구현 결과 (2026-07-08) + ② 중대 발견

**구현 완료(엔진 핵심, 미커밋)**: 물가상승률/CPI 분기 완전 제거 → `max(① reportedValue, ③ converted)` at 의제취득일. `cpi-rates.ts` 삭제. `PreDeemedBreakdown` = {reportedAmount, convertedAmount, selectedMethod:"reported"|"converted"}. 결과카드·anchor(A-1~A-7) 갱신. 검증: tsc 0 · eslint 0 · **7,994 tests 통과** · 잔존 참조 0.

**🔴 ② 중대 발견 — max(①,②,③) → max(①,③)로 축소**: ②를 `standardPriceAtDeemedDate`(의제취득일 기준시가)로 직접 후보에 넣자 **사용자 자료의 authoritative Excel/PDF anchor가 깨짐**(E-6b: 환산 109,611,427 선택이 정답인데 ②=153,336,855가 더 커서 채택됨). 즉 **Excel은 의제취득일 기준시가(②)를 환산(③)을 이기는 후보로 취급하지 않음** → ② ≠ `standardPriceAtDeemedDate`(그 값은 ③ 환산의 분자일 뿐).
- 해석: 해설서의 "② §164④~⑦ 가액"은 **환산 분자와 구분되는 "취득당시 기준시가"** 이며, 정상 케이스(양도가 > 양도시기준시가)에선 항상 ③ 환산 < 그 값이 아니라 오히려 ③ ≥ ②가 되어 ②가 거의 채택되지 않음. Excel이 이를 반영.
- **∴ Phase 1은 max(①,③)로 확정**(Excel anchor 보존). ②는 별도 §164 취득당시 기준시가 값·시점을 확정한 뒤 Phase 2에서 재검토.

**Phase 2 (✅완료, 미커밋)**: ① reportedValue **pre-deemed 배관** 완료 — Zod pre-deemed에 `reportedValue` 추가, API 빌더(`transfer-tax-api-inheritance.ts`)가 `publishedValueAtInheritance`→`reportedValue`(지분 × ratio) 송신, route 매핑. UI(`PreDeemedInputs.tsx`) 피상속인 실가 토글 제거 → ① 상속세 신고가액 입력 추가, `DateInput` orphan import 정리. anchor `__tests__/calc/pre-deemed-reported-value-plumbing.test.ts` 3건. 검증: tsc 0·lint 0·2,428 tests. (API에서 decedent 필드 미송신 → 엔진 dead 필드 무해.)

**Phase 3 (미착수)**: ② §164 취득당시 기준시가 후보 재설계(값·시점 확정 필요, 환산 분자와 구분) · `decedentActualPrice`/`decedentAcquisitionDate` 엔진 타입·Zod 완전 제거(스토어 공유필드 `decedentAcquisitionDate` 제외).

## 8. 범위 외
- 의제취득일 현재 매매사례가액·감정가액(③ 나머지) — 후속.
- post-deemed 경로(PR#535 완료) — 무변경.
- `data/cpi-rates.ts`의 타 세목 소비 여부에 따른 완전 삭제 — 별도 확인.

---

**선행 확인**: Q2(② 노출 방식)·Q3(③ 매매/감정 범위) 결정 후 Do. 세액 영향 정정이므로 pre-Do anchor로 신·구 차이 실증 필수.
