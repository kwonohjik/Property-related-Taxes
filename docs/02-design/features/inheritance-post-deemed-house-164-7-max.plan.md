# 개별주택가격 미공시 상속주택 취득가액 — post-deemed §164⑤~⑦ 환산 max 비교 누락 정정

> **상태**: ✅ **구현 완료** (2026-08-05 코드 실측) — **D1~D5 전건 해소**.
> · **P1**(엔진 max(①,②)): `inheritance-acquisition-price.ts:141` `calcPostDeemed` — `max(reportedValue, houseValuationStdPrice)` · ③ 배제 · 개산공제 없음. 주입은 `inheritance-acquisition-helpers.ts:151` `shouldInjectPostDeemedHouseMax`. **상가 §164⑥(`commercialValuationStdPrice`)까지 확장**돼 계획 범위를 넘어섰다.
> · **P2**(D2·D3·D5): `InheritedAcquisitionDeemedSection.tsx:84` `transferDate` 배선 완료 · `PostDeemedInputs.tsx:335` `HouseValuationSection` 렌더가 P1 주입으로 **취득가액에 실제 반영**된다.
> · **P3**(D4): `inheritanceReportedValue`가 **전 코드 0건**(제거) — 하단 입력이 `publishedValueAtInheritance`를 직접 read/write(`PostDeemedInputs.tsx:88·192-193`)해 「엔진 경로로 승격·단일화」(Q2=(a)) 완료.
> 
> ⚠️ **본문의 file:line 인용은 stale이다** — 컴포넌트가 `components/calc/transfer/` → `components/calc/transfer/inheritance/`로 이동했다(`PostDeemedInputs.tsx`·`HouseValuationSection.tsx`). 본문은 착수 당시 기록으로 남긴다.
> 
> 🟠 **별건 — `calcPreDeemed`의 ②는 아직 미구현**: `inheritance-acquisition-price.ts:100` `// max(①,③) 선택 … ②(§164 취득당시 기준시가)는 Phase 2`. **본 계획서(post-deemed §163⑨2호)와 다른 규정**(pre-deemed §176조의2④)이니 혼동하지 말 것.
> ~~종전 표기: Plan (법령 확정 · 엔진 트레이스 실측 · 구현 대기)~~
> 대상: 상속개시일 ≥ 1985-01-01(post-deemed) & 개별주택가격 미공시(< 2005-04-30) 주택
> 근거: 소득세법 시행령 §163⑨2호(max) · §164⑤~⑦ · §176조의2④(pre-deemed 대비)

## 0. 사용자 시나리오 (Image #15)

취득원인 상속 · 상속개시일 **1995-07-01**(post-deemed) · 개별·다세대주택 · 자동(보충적평가액). 개별주택가격 최초공시(2005-04-30) 이전이라 1995년 개별주택가격이 **존재하지 않음**. 화면은 "상속개시일 직전 고시 주택가격(원)"(연도 1995) 입력을 요구하나 그 값은 없음 → **취득가액 산정 경로가 사실상 막힘**.

## 1. 법령 근거 (KoreanLaw + 조세심판원 결정 — 사용자 제공 Image #16·#17 확정)

**프레임워크 (국심 2003부602, 2003.7.25. · 국심 2003서3266, 2004.4.29.)** — 상속·증여받은 부동산의 취득 당시 실지거래가액은 다음 중 **많은 가액**:
- **① 상증법 §60~§66 평가액**
- **② 소득세법 시행령 §164④~⑦의 가액** (④ 1990.8.30 이전 토지 / ⑤ 건물 / ⑥ 오피스텔·상가 / ⑦ 주택)
- **③ 의제취득일 현재 매매사례가액·감정가액·환산취득가액** (§176조의2③, 추계)

**의제취득일(1985.1.1.) 전후 차이**:
- **post-deemed(이후)**: **③ 적용 불가 → 취득가액 = max(①, ②)만**. (소령 §163⑨) → Q1 확정: 양도가 스케일 없는 **취득 시점 값 max**.
- **pre-deemed(이전)**: max(①, ②, ③) 모두 가능. (소령 §176조의2④)

**기타필요경비 처리 차이 (중요)**:
- **①·②** = 취득 당시 **실지거래가액 의제** → 소령 §163③·⑤에 따라 **자본적 지출·양도비용을 실제 지출 기준 공제**.
- **③**(환산취득가 등) = 소령 §176조의2④ **추계 결정** → 실제 필요경비 대신 **§163⑥ 개산공제만**.
- → post-deemed §164⑦(②) 경로는 **개산공제 아님, 실제 필요경비**. (현행 상속주택 환산은 ③ 방식[양도가×비율+개산공제]이라 **필요경비 처리가 다름** — post-deemed에 그대로 쓰면 안 됨.)

**소득세법 시행령 §163⑨2호(원문)**: "상증법 §61①2호~4호 건물 기준시가가 고시되기 전에 상속받은 건물은 상속개시일 현재 §60~§66 평가액과 **§164조제5항 내지 제7항의 가액 중 많은 금액**." (주택 미공시 = §164⑦, ⑤ 준용).

**결론**: post-deemed 미공시 주택 취득가액 = **max(① 상증법 평가액, ② §164⑦ 취득당시 기준시가)**. ② = `houseValuationResult.housePriceAtInheritanceUsed`(취득 시점 개별주택가격 추정, **미스케일·양도가 곱셈 없음**). 필요경비는 **실지거래가액 의제**(개산공제 아님).

## 2. 현행 결함 (엔진 트레이스 실측)

| # | 결함 | 위치(file:line) | 영향 |
|---|---|---|---|
| **D1** | **§164⑦ 환산이 post-deemed에서 무시** — 취득가액 산정에 미반영 | `lib/tax-engine/inheritance-acquisition-helpers.ts:93-94` `shouldInjectHouseValuation = … && isPreDeemed && …` | **세액 오류**: §163⑨2호 max 비교 누락. post-deemed는 `reportedValue`(=publishedValueAtInheritance) 단독 결정(`inheritance-acquisition-price.ts:173-179`) |
| **D2** | **상단 "직전 고시 주택가격"이 미공시 케이스에 입력 불가** — 1995 개별주택가격 부재 | `CompanionAcqInheritanceBlock.tsx:208` (`publishedValueAtInheritance`) | 유효 입력 경로 부재. 이게 post-deemed 엔진 실경로(`transfer-tax-api-inheritance.ts:59`) |
| **D3** | **환산 위젯 출력이 결과 표시만, 취득가액 미반영** — post-deemed에서 HouseValuationSection이 렌더돼도 계산에 안 쓰임 | `PostDeemedInputs.tsx:289`(렌더) vs helpers:93(미주입) | 사용자 혼란(위젯이 있으나 무효) |
| **D4** | **`inheritanceReportedValue`(하단 "상속세 신고가액"+보조계산) = 엔진 미도달 dead 필드** | `PostDeemedInputs.tsx:172` write → 소비처는 사이드바 `transfer-per-asset-summary.ts:187`뿐. 엔진은 `publishedValueAtInheritance`만(`transfer-tax-api-inheritance.ts:59`) | 사이드바 프리뷰 ↔ 엔진 최종값 **다른 필드 → 불일치** |
| **D5** (경미) | **transferDate 미배선** — `InheritedAcquisitionDeemedSection`이 받으면서 PostDeemedInputs에 미전달 | `InheritedAcquisitionDeemedSection.tsx:87`(PreDeemed는 :84에서 전달) | **UI 표시 위생만** — 위젯 양도시 timepoint 연도 undefined(`HouseValuationSection:255`)·LandPriceLookup 기준일 공백(`:348`). ⚠**세액 무관**: 엔진 페이로드 transferDate는 API에서 페이지 양도일로 별도 주입(`transfer-tax-api-inheritance.ts:90`), ②(§164⑦)는 양도 값 미사용 |

**핵심**: D1이 근본. §163⑨2호가 요구하는 max(① 상증법 평가액, ② §164⑦)를 post-deemed에서 수행하지 않아, 미공시 주택은 상단 단일필드(D2)에만 의존 → 입력 불가 → 막힘. D5는 세액 무관 위생 수정(1줄).

## 3. 수정 설계

### P1 — 엔진: post-deemed §164⑦ max 비교 (D1 핵심, 세액 영향)

`inheritance-acquisition-helpers.ts` / `inheritance-acquisition-price.ts`:
- post-deemed & 주택 & 미공시(inheritanceDate < 2005-04-30) & houseValuationResult 존재 시:
  **취득가액 = max(reportedValue[① 상증법 평가액], houseValuationResult.housePriceAtInheritanceUsed[② §164⑦ 취득당시 기준시가])**.
- **② 는 미스케일 취득 시점 값** — `housePriceAtInheritanceUsed`를 **그대로** max에 투입(양도가 곱셈 없음). HouseValuationSection이 산출하는 최종 "환산취득가(③, 양도가×비율)"는 post-deemed에서 **사용 금지**(국심: ③ 적용 불가). → 엔진은 `houseValuationResult`에서 ②값(housePriceAtInheritanceUsed)만 취함.
- **필요경비 = 실지거래가액 의제**(①·②) → 자본적지출·양도비용 실제 공제. **§163⑥ 개산공제 적용 금지**(개산공제는 ③ 전용). ✅확인됨: `calcPostDeemed`(`inheritance-acquisition-price.ts:173-179`)는 reportedValue를 **개산공제 없이** plain `acquisitionPrice`로 반환 → ②도 동일 경로(reportedValue 자리)에 max 값을 넣으면 개산공제 없이 처리됨. 다운스트림에서 상속 취득가에 개산공제가 붙지 않는지만 재확인.
- `reportedValue`가 0/미입력이면 ② 단독(=max와 동일) → 미공시 주택도 환산만으로 취득가액 산정 가능. (② 계산은 P_F·Sum_A·Sum_F **취득·최초공시 입력만** 사용 — 양도 값 불요. 기존 `buildInheritedHouseValuationPayload`가 이 입력을 제공.)
- pre-deemed 경로(§176조의2④, ①②③ max·③은 양도가 스케일+개산공제)는 **불변**. post-deemed 전용 max(①,②) 분기 신설.
- **anchor 우선**: post-deemed 미공시 주택 케이스 실측 anchor 작성 후 구현(세액 불변/변화 명시). 홈택스/Excel 기준값 확보 시 대조. 근거 주석에 국심 2003부602·2003서3266 인용.

### P2 — UI: 환산 진입 명확화 + transferDate 배선 (D2·D3·D5)

- **transferDate 배선(D5, 1단계에 동봉)**: `InheritedAcquisitionDeemedSection.tsx:87` `<PostDeemedInputs … transferDate={transferDate} />` 추가(1줄). PostDeemedInputs는 이미 수신·forward(`:50,:293`). 세액 무관 위생이라 P1과 함께 1단계.
- **환산 진입(D2·D3)**: post-deemed 주택 미공시에서 HouseValuationSection이 취득가액에 반영되도록 P1과 연동. 상단 "상속개시일 직전 고시 주택가격" 라벨/안내를 미공시 케이스에서 조정(§163⑨2호 max 안내, 값 없으면 환산으로 산정).

### P3 — 필드 정합: dead `inheritanceReportedValue` (D4) → **Q2=(a) 채택**

`publishedValueAtInheritance`(상단, 엔진 실경로)와 `inheritanceReportedValue`(하단, dead) 이중 입력을 **(a) 하단 "상속세 신고가액"을 엔진 경로로 승격·단일화**로 해소:
- 하단 PostDeemedInputs의 "상속세 신고가액"(§60 평가방법과 함께)이 실제 취득가액(① 상증법 평가액)이 되도록 엔진 경로에 연결. 상단 `publishedValueAtInheritance`와 **단일 폼 필드로 통합**(같은 의미 양방향 read/write, `useEffect→store` 미러링 금지 — memory `mirror-pattern`).
- API 변환·validation은 fallback 패턴으로 양쪽 인식(⑧ 정책). 사이드바(`transfer-per-asset-summary.ts:187`)도 동일 단일 필드 참조로 정합.
- 결과: 사용자가 어디 입력하든 엔진·사이드바 일치. ①(상증법 평가액)은 하단에서, ②(§164⑦ 환산)는 HouseValuationSection에서 → 엔진이 max.

## 4. 정합성 검토 (자가검토 필요 항목)

- **pre-deemed 회귀 0**: P1 분기는 post-deemed 전용. 기존 pre-deemed anchor(환산취득가·§176조의2④ max) 불변 확인.
- **min[] 공익수용(§164⑨)·다필지와의 상호작용**: post-deemed max가 다른 조정과 충돌 없는지.
- **개산공제(§163⑥) 금지 확인**: post-deemed §164⑦(②)는 실지거래가액 의제 → **개산공제 미적용, 실제 필요경비**. 엔진이 이 경로에 개산공제를 붙이지 않는지 실측(붙으면 제거). pre-deemed ③(환산취득가)만 개산공제.
- **14 동기화 지점**: 엔진 input에 post-deemed houseValuation 참조가 추가되면 ⑨~⑭ 점검. (RESULT 필드 신설 여부에 따라 ⑦도.)

## 5. 결정 사항

**Q1 ✅ 확정 (Image #16·#17, 국심 2003부602·2003서3266)** — post-deemed 미공시 주택 취득가액 = **max(① 상증법 평가액, ② §164④~⑦ 취득당시 기준시가)**. ③(환산취득가/양도가 스케일) **적용 불가**. ①·② = 실지거래가액 의제 → **실제 필요경비**(개산공제 아님).

**Q2 ✅ 확정 = (a)** — 하단 "상속세 신고가액"을 엔진 경로로 승격·상단과 단일 필드 통합. (§3 P3)

**Q3 (잔여) 상단 필드 라벨(D2)** — Q2=(a)로 하단이 ①(상증법 평가액) 입력 주경로가 되면, 상단 "상속개시일 직전 고시 주택가격"의 라벨·중복 처리를 P3 구현 시 함께 정리(미공시 안내 포함). 세부는 Do 단계에서 확정.

## 6. 테스트·회귀

- **anchor(신규, P1 우선)**: post-deemed 미공시 주택 — reportedValue 없이 §164⑦ 환산만으로 취득가액 산정 / reportedValue 있으면 max. 세액 실측.
- pre-deemed 회귀 anchor 불변 확인(`__tests__/tax-engine/transfer-tax/inherited-acquisition.test.ts`).
- UI: HouseValuationSection이 post-deemed에서 취득가액에 반영되는 RTL/E2E.
- `npx tsc --noEmit` 0 · 전체 vitest green · Playwright E2E.

## 7. 리스크·단계

- **세액 영향(P1)**: post-deemed 미공시 주택의 취득가액이 변함(현행: 상단 단일필드 → 개정: max(①,②)). anchor로 방향·수치 검증 후 확정. `feedback_numeric_impact_verify_before_bug_claim`.
- **단계 분리 권장**:
  - **1단계 (P1 엔진 max + D5 transferDate 1줄)** — 핵심 세액 결함 + 위생. 세액 영향 anchor 우선.
  - **2단계 (P2 환산 진입 UI + P3 필드 단일화)** — UX·아키텍처. P3는 별도.
- **P3 범위 주의**: `publishedValueAtInheritance`(상단)는 **주택뿐 아니라 토지(land)·자동모드에서도 공용**(`CompanionAcqInheritanceBlock:170-210`, `StandardPriceInput`). D4 단일화는 **post-deemed 주택 경로로 스코프**하고 land/pre-deemed 경로 회귀 없는지 확인. 이중입력 통합은 mirror-pattern(같은 필드 양방향)로만, `useEffect→store` 미러링 금지.
- **법령 단정**: §163⑨2호 + 국심 2003부602·2003서3266으로 max(①,②)·③배제·필요경비 확정(Q1 사용자 확인). "상증법 평가액"의 실무 구성(시가 우선·보충적평가)은 ①의 입력값 문제로 UI에서 사용자가 결정.
