# 1세대1주택 비과세 판정 자동화 — 구현 계획서 (KoreanTaxCalc 이식판 v2.1)

> 상태: **Plan v2.1** — 🛑 **착수 조건 미충족**. **구조 결정 D-1~D-5 확정(2026-09-18, 사용자 승인)** —
> 1세대1주택 비과세 **판정은 별도 메뉴**, 세액 계산기는 **간이 입력 + 판정 결과 소비**. Q-1·Q-2 해소 · Q-3′(**세대 판정은 사용자가 한다**)·Q-4·Q-5 결정 ·
> Q-6 소멸 · **Q-7 결정(§155⑳·입주권도 P4에서 이관)** · V-1·V-6·V-8·V-12·V-13·V-14·V-15 종결 · V-11 부분 해소 · V-2~V-5·V-7·V-9·V-10 미결.
> 📐 **산출물 게이트 충족**(`plan-design-self-review-loop` — 여러 PR · UI 위젯 5개 이상 신설 · Phase 3개 이상):
> Do 진입 전에 `one-house-exemption-automation.engine.design.md` · `.ui.design.md`를 만든다.
> 원안: `1jutaek-plan-v1.1.pdf`(2026-09-17 외부 작성). 원안은 **신규 SI 구축**(Python FastAPI +
> PostgreSQL + 규칙엔진, 6주 MVP, 예산 8,000만~1.2억)을 전제한다. 이 문서는 같은 목표를
> **이 저장소의 현행 구현 위에** 다시 놓은 것으로, 아키텍처·범위·법령 인용을 전면 재작성했다.
> 세목: 양도소득세(부동산) — 소법 §89①3호·4호·② / 법 §88 6호·소령 §152의3·소칙 §70·소령 §154·§155 계열·§155의2·§155의3·§156의2·§156의3 / 조특법 §99의4
> 작성일: 2026-09-18 · 기준 커밋: **`dd3e0075`**
> ⚠️ 작성 중 다른 세션이 master를 `7cb49031`→`dd3e0075`로 진행시켰다(PR #1680·#1681 — 증여의제·국외전출세).
> **이 계획서가 인용한 12파일과 교집합 0건**으로 대조 확인했으나, 착수 전 file:line을 재확인할 것
> (`feedback_external_concurrent_edit_stale_read` · `feedback_merged_plan_citations_drift`).
> ⚠️ 설계 문서 작성 중 master가 다시 `fbb7943a`(PR #1682 — 증여의제)로 진행됐다. 인용 파일과 **교집합 0건** 대조 확인(2026-09-18).
> 검증 깊이: **L3** — 세액이 바뀐다(원안 오기 그대로 구현하면 비과세 오부여·오배제, §2)
> 법령 실독(법제처 DRF, 2026-09-18): 소득세법 **MST 280405**(시행 2026-01-01) ·
> 소득세법 시행령 **MST 286211**(시행 2026-07-01) · 조세특례제한법 **MST 284389**(시행 2026-09-18) ·
> 종합부동산세법 시행령 **MST 283639**(시행 2026-02-27)
> 코드 실측: 엔진·UI 2축 병렬 조사(2026-09-18). 아래 모든 file:line은 실파일 확인분이다.
> 정책: `feedback_korean_law_citation_verify` · `feedback_unverified_authority_blocks_tax_change` ·
> `feedback_pre_anchor_verification` · `feedback_no_unfavorable_application_without_legal_basis` ·
> `feedback_numeric_impact_verify_before_bug_claim` · `feedback_ui_engine_dual_truth_avoidance`

---

## 0. 한 줄 요약

### 구조 — 2026-09-18 확정 (D-1~D-5 · §5.0)

```
[판정 메뉴 · 신설]  세대 → 보유 주택·권리 명세 → 양도 예정 → 판정 결과(적용 특례 · 조건부·기한 · 근거 조문)
        │  「사실」(세대·명세·특례 사실)을 넘긴다 — prefill(이 결과로 세액 계산) · 이력 불러오기
        ▼
[공유 판정 엔진]  judgeOneHouseExemption(사실, 양도일, 양도가) → 판정 결과 객체      ← 엔진은 한 벌
        ▲
[양도세 계산기]  간이 입력(현행 ①②) 또는 넘겨받은 사실 → 자기 양도일·양도가로 같은 엔진 재판정
               → 12억 안분 · 장특 표2 · 중과 배제 · 겸용/재개발/부담부증여가 결과를 소비
```

| # | 결정 | 한 줄 근거 |
|---|---|---|
| **D-1** | **화면은 나누고 엔진은 하나** | 판정 로직을 두 벌 만들면 반드시 어긋난다 — §155 의제를 비과세·중과가 따로 구현했다 합친 전례(`transfer.types.ts:535`) |
| **D-2** | 계산기는 **판정 결과 객체 전체**를 소비한다 | 「비과세 예/아니오」 한 칸이면 장특 표2·중과 배제가 틀어진다(§5.5 네 축) |
| **D-3** | 넘기는 것은 **결과가 아니라 사실** — 계산기가 **재판정**한다 | 판정은 양도일·양도가에 달렸다. 결과를 복사하면 양도일을 바꾸는 순간 낡는다(G-5는 하루 차이로 비과세가 뒤집힌다) |
| **D-4** | 계산기 **간이 입력 유지** — 새 판정 입력은 계산기에 **추가하지 않는다** | 판정 메뉴를 거치지 않는 사용자도 계산기 단독으로 쓸 수 있어야 한다. Step4(786줄)를 더 키우지 않는다 |
| **D-5** | 순서: 엔진 정비(P0·P1) → 엔진 추출(P2) → 판정 메뉴(P4) → 연결(P5) → 계산기 정리(P6) | 입력 경로를 옮기기 **전에** 새 경로가 있어야 한다(`feedback_ui_gate_removes_sole_input_path`) |

🔴 **실측으로 생긴 제약 1건** — 주택 명부(`HousesListSection`)와 분양권·입주권(`PresaleRightsSection`)은
**다주택 중과 판정의 유일한 입력 경로**다(`Step4.tsx:738` 주석 · `transfer-tax-judgment-steps.ts:36` STEP 0.5).
3주택 이상인 사람은 1세대1주택 판정 메뉴를 쓸 이유가 없으므로, 이 둘을 계산기에서 빼면 **중과 세액이 조용히
달라진다.** ⇒ 두 위젯은 **계산기에 남기고**, 판정 메뉴가 **같은 컴포넌트를 재사용**한다(§5.4).

### 규모 — 먼저 밝힌다

**대형이며 여러 PR에 걸친다(P0~P6).** 확정 작업:
① 인용 정리(P0) ② 고가주택 기준 시점 함수(P1 · G-5 결함) ③ 판정 엔진 추출(P2 · 세액 불변 리팩터)
④ §155의2·§155의3을 공유 엔진에(P3) ⑤ 판정 메뉴 신설(P4) ⑥ 계산기 연결(P5) ⑦ 계산기 정리·이력 마이그레이션(P6).
이 문서가 긴 이유의 절반은 **원안 법령 정정 대장(§2)과 현황 실측 대장(§3)** 이며, 그 둘은 사용자가 요청한 산출물이다.

### 왜 원안을 그대로 쓸 수 없나 — 그리고 원안이 들어갈 자리

원안은 **"11개 특례를 처음부터 만든다"**는 계획이다. 그런데 실측 결과 이 저장소는
**원안 11종 중 10종 + 원안 3B 4종 중 3종 = 15종 중 13종을 이미 구현**하고 있고, 여러 곳에서
원안보다 **정밀**하다 — §155⑥ 국가유산 3법 체계 · §154⑦ 배율 3·5·10 + 2022.1.1 부칙 시점 분기 ·
§89② 예외 16항 **3갈래**(`excluded`/`exception_met`/`undetermined`) 판정 ·
주택 명부 16필드 + ①↔④ 불일치 자동 대조. 미구현은 **§155의2(장기저당담보)와 §155의3(상생임대) 둘**이다.

🔑 다만 원안의 **화면 흐름**(세대 → 주택 명세 → 양도 예정 → 판정·필요조건)은 세액 계산기가 아니라
**판정 도구**의 것이다. D-1로 그 흐름이 **판정 메뉴**라는 제자리를 얻는다 — 판정 **엔진**은 새로 만들지 않고
이미 있는 것을 추출해 재사용한다.

### 갭 — 어디서 닫는가

| # | 내용 | 닫는 곳 | 성격 |
|---|---|---|---|
| **G-2** | **§155의2**(장기저당담보)·**§155의3**(상생임대) 미구현 — 상생임대는 전역 grep **0건**. 충족 세대를 **과세로 돌린다**(과대 과세) | 공유 엔진(P3) + 판정 메뉴 입력(P4). 계산기에는 **넘겨받은 사실로만** 들어간다(D-4) | 확정 미구현 |
| **G-5** | 고가주택 기준 **12억 단일값** — 2021-12-07 이전 양도분 **전액 비과세로 과소 계산**(10억 양도: 현행 **0원** vs 법령 **5,659,500원**). ⚠️ **seed만 고치면 전액 과세로 뒤집힌다**(안분 12억 하드코딩) | 공유 엔진(P1) — 두 화면 모두 이 함수를 쓴다 | **확정 결함** |
| **G-1** | 주택 수가 스칼라(①)·명부(④) **이중 트랙**, 불일치는 경고만 | 판정 메뉴에서 명부가 **정본**이 되고, 사실을 넘겨받은 계산기는 명부로 재판정한다(D-3). 판정 미경유 시 현행 경고 유지 | 채택된 범위 |
| **G-3** | 「언제까지 무엇을 하면 비과세」 **역산 출력** 없음 | **판정 메뉴 결과 화면**. 계산기 결과뷰 4종에는 넣지 않는다 | 채택된 범위 |
| **G-4** | 「1세대」·다가구 구획·오피스텔 주거용이 **자기선언 의존** | **현행 유지 — 사용자가 판정한다**(Q-3′). 판정 메뉴는 1세대 정의 안내(법 §88 6호·영 §152의3)와 법조문 링크로 판단을 **보조**만 한다 | 결함 아님 · 갭 종결 |

그리고 원안에는 **그대로 구현하면 판정이 뒤집히는 법령 오기 9건**과, **원안이 빠뜨린 조문 10건**이
있다(§2). 특히 원안 **3.3절 전체가 종합부동산세 축**이며 양도세 비과세와 무관하다.
⚠️ §2는 **판정을 가르는 항목 위주**이며 원안 전수 감사는 아니다 — 임대 의무기간 연수 등 검증하지 않은 서술이 남아 있다.

---

## 1. 원안을 이 저장소에 맞게 고친 축

### 1.1 아키텍처 — 원안의 기술 선정은 **전부 대체**한다

| 원안(§5.5) | 이 저장소 | 사유 |
|---|---|---|
| Python FastAPI + 규칙엔진 | **Next.js 16 Route Handler + 순수 함수 엔진** | 2-Layer 규약. 세목 6종 + 주식양도세가 이미 이 형태 |
| 선언적 JSON 규칙 레지스트리 | **하드코딩 분기 + DB 파라미터 하이브리드**(현행) | 현행 `checkExemption`은 `E-5→E-3→E-3.7→E-3.8→E-3.5→E-4→E-1/E-2` if-chain이고, **임계값만** `OneHouseSpecialRulesData`(Zod, `tax_rates` jsonb `special:one_house_exemption`)로 주입받는다. 이미 원안이 원한 "파라미터 분리"를 **필요한 만큼만** 하고 있다 |
| PostgreSQL 이력 테이블 | **IndexedDB(Dexie) 로컬 저장**(`lib/storage/`) | 이력 로컬 일원화 확정. 세대·주택 명세는 개인정보라 서버 미보관이 오히려 정답 |
| 조정대상지역 **DB 마스터**(F-05, P0) | **정적 단일 소스** `lib/tax-engine/data/regulated-areas.ts`(+`-data.ts`) | 이미 전환 완료 — `supabase/migrations/20260618000001_drop_regulated_areas.sql`가 테이블을 **삭제**했다. 되돌리면 dual-truth |
| Camunda DMN 노코드 규칙엔진 | 도입하지 않음 | 위와 동일 |
| 판정 테스트 20~30건/특례 | **vitest anchor + Playwright E2E** | 이미 조문별 anchor가 깔려 있다(§3.4) |

### 1.2 원안에서 **삭제**한 장 (이 저장소에 해당 없음)

- §5.5 기술 구성 선정 · §7.2 소요 리소스(M/H) · **§7.3 예산(8,000만~1.2억)** ·
  §8.1 거버넌스 조직표(대표세무사·PM·검수위원회) · 온프레미스/SaaS 배포 선택 ·
  **주민등록번호 취급·개인정보처리방침** — 서버에 세대 정보를 보관하지 않으므로 전제가 성립하지 않는다.
- §7.4 KPI 중 「상담 처리시간 60분→5분」·「특례 발견율」·「기한 미준수 사고 0건」 —
  상담 조직 지표다. 이 저장소의 지표는 **anchor 통과 여부·mutation 검출율**이다.
- §5.6 외부 API 중 **도로명주소·공시가격·건축물대장·토지대장·용도지역은 이미 있다**
  (`lib/address/` · `lib/stdprice/` · `lib/geo/pnu-building-register.ts` · `lib/geo/land-use-zone.ts`).
  조정대상지역 자동판별도 `/api/address/regulated-area`로 마법사에 붙어 있다. 신규 연계 대상이 아니다.
- 나머지 2종은 **범위 밖**으로 둔다(말없이 버리지 않고 사유를 남긴다): **등기 열람**(대법원 인터넷등기소)은
  공개 API가 없고 원안도 「수동」으로 적었다 → 미등기 여부는 **자기선언 유지**(`isUnregistered`).
  **주민등록 등·초본**은 원안조차 「직접 API 불가 · OCR 후 정형화」다 → 서버·OCR이 없는 이 앱에서는
  거주기간을 `ResidencePeriodSection`의 입주·퇴거일 **수기 입력**으로 받는 현행이 정답이다.
- §7.1 「D-day 알림」 — 클라이언트 전용 앱이라 **푸시 주체가 없다**. 기한은 결과 화면에 **날짜로** 표시한다(Q-4 결정 — 잔여일 표시 안 함).

### 1.3 범위 — **판정 메뉴 신설 + 엔진 재사용**으로 재정의

원안 §7 로드맵(Phase 1 MVP 6주에 기본요건 + ①~⑤)의 **판정 로직**은 이 저장소에서 이미 지나간 지점이다(§3).
새로 만드는 것은 **판정 메뉴(화면·출력·이력)** 와 **§155의2·§155의3**이고, 판정 엔진은 **추출해 재사용**한다(D-1).
새 로드맵은 §9.

---

## 2. 법령 정정 대장 — 원안 그대로 구현하면 틀리는 곳

> 전건 법제처 DRF 실독 대조. 「영향」은 원안대로 구현했을 때의 결과다.

### 2.1 🔴 오기 — 판정이 뒤집힌다

| # | 원안 기재 | 실제 조문 | 영향 |
|---|---|---|---|
| **E-1** | §155**④**=혼인합가, §155**⑤**=동거봉양 | **§155④=동거봉양 합가**(60세 이상 직계존속·합친 날부터 10년), **§155⑤=혼인 합가**(혼인한 날부터 10년) — **뒤바뀌어 있다** | 근거 조문 표시가 전부 틀린다. 저장소 `legal-codes/transfer-house.ts:57·62`는 §155⑤를 혼인으로 **바르게** 쓰므로, 원안대로 고치면 오히려 회귀 |
| **E-2** | §155③ 소수지분 = **지분율 40% 이하 또는 지분가액 수도권 6억·비수도권 3억 이하** | §155③에 **그런 기준이 없다**. 공동상속주택은 원칙적으로 주택 수 제외이고 **「상속지분이 가장 큰 상속인」만 예외로 산입**한다(동순위 시 ①거주자 ②최연장자). 원안의 40%·6억·3억은 **종합부동산세법 시행령 §4의2②2호·3호** 기준이다 | 지분 45% 최대지분자를 「소수지분」으로 오판 → **비과세 오부여**. 저장소 양도세 축은 이미 최대지분자 산입 방식이다 — 최대지분자 여부는 **사용자 선언** `isLargestCoInheritedShareholder`를 소비한다(`transfer-inheritance-exclusion.ts:66`). ⚠️ 초판은 `house-count/inheritance.ts:84 assessMainInheritor`를 근거로 들었으나 그것은 **지방세법 시행령 §28의4⑤(취득세)** 모듈이다(설계 검토에서 정정) |
| **E-3** | 특례 ② 상속주택 = **「조건부(기한)」**, "일정 기한 내 양도" | **§155②에 처분기한이 없다**(일반주택 양도 시). 원안이 든 「상속 5년」은 양도세에서는 §167의3①7호 **중과 주택수 배제**, 종부세에서는 **종부세령 §4의2②1호**다 — **어느 쪽도 §155② 비과세 요건이 아니다** | 기한 초과로 **비과세를 잘못 차단**. 저장소도 같은 혼동을 경고로 박제해 뒀다(`docs/02-design/features/transfer-155-2-4-5-exemption-gap.plan.md`) |
| **E-4** | 부수토지 = 정착면적 **5배**(도시지역 밖 10배) | §154⑦ 현행 — 도시지역 내: **수도권 주·상·공 3배 / 수도권 녹지 5배 / 수도권 밖 5배**, 그 밖 **10배**. 원안의 「일률 5배」는 **2022.1.1 전 종전 규정**이다(부칙 §39) | 수도권 도시지역에서 **초과분을 놓쳐 비과세 범위 과대**. 저장소는 두 규정을 양도일로 갈라 이미 구현(`non-business-land/urban-area.ts:106-132`) |
| **E-5** | §154①2호 **나목(해외이주) = 보유 중 1년 이상 거주** / **다목(출국) = 2년 이상 거주, 평생 1회** | 나목·다목 모두 **거주요건이 없다**. 요건은 「**출국일 현재 1주택** + **출국일부터 2년 이내 양도**」 | 거주요건 미충족자를 **잘못 차단**. 반대로 출국 후 2년 경과분을 잘못 통과 |
| **E-6** | §154①1호 = **건설임대주택** | 민간건설임대 + 공공건설임대 + **공공매입임대주택** 포함 | 공공매입임대 임차인 5년 거주분 **오배제** |
| **E-7** | §155① 전입요건 = **신규주택 취득 후 1년 내 세대전원 전입(현행)** | 현행 §155①에 **전입 요건이 없다**(실독 확인). 폐지 시행일은 **미검증 → V-9**. 현행은 「종전주택 취득 1년 경과 후 신규 취득 + 신규 취득일부터 **3년** 이내 종전주택 양도」 단일 | 현행 양도분에 **폐지된 요건을 요구**해 오배제. 과거 양도분 판정에는 필요 → **시점 분기 상수**로 보관(§5.7) |
| **E-8** | §155⑥ = 「문화재보호법」 지정문화재·국가등록문화재 | 「**문화유산의 보존 및 활용에 관한 법률**」 지정문화유산 + 「**근현대문화유산의 보존 및 활용에 관한 법률**」 국가등록문화유산 + 「**자연유산의 보존 및 활용에 관한 법률**」 **천연기념물등** | **천연기념물등 누락**으로 오배제. 저장소는 이미 3법 전부 반영(`transfer.types.ts:581~588`) |
| **E-9** | 조특법 §99의4 = **3년 이상 보유 후** 일반주택 양도 | **④ 3년 보유 요건 충족 전 양도에도 적용**하고, ⑥에서 3년 미달 시 추징한다. 또 ①1호가목에 **기회발전특구** 소재가 포함된다 | 3년 미달 세대를 **잘못 차단**. 저장소 `transfer-reductions/new-99-4.ts` 기준으로는 회귀 |

### 2.2 🟠 원안 11종 밖인데 이 판정에 필요한 조문

| # | 조문 | 내용 | 저장소 |
|---|---|---|---|
| M-1 | **소법 §89①4호** | **조합원입주권 1개 보유 세대의 「입주권 양도」 비과세** — 가목(다른 주택·분양권 없음) / 나목(1주택 취득일부터 3년 내 양도). 12억 초과 시 과세 | 원안 전체에 **없다**. 저장소는 구현됨 — `legal-codes/transfer-house.ts:244 RIGHT_EXEMPT` + `components/calc/transfer/RedevelopmentRightExemptionSection.tsx:134` |
| M-2 | **소령 §155⑦** | **농어촌주택**(수도권 밖 읍·면) — 상속·이농·귀농 3종. 조특법 §99의4와 **별개 특례** | 원안은 조특법만 다룸. 저장소 구현(`transfer.types.ts:557~578` + `qualifiesRuralHouse()`) |
| M-3 | **소령 §155⑯** | 수도권 법인·공공기관 지방이전 시 §155① **"3년"→"5년"**, 1년 경과 요건 배제 | 원안 없음. 저장소 구현(UI `TemporaryTwoHouseSection.tsx:103`) |
| M-4 | **소령 §155⑱** | §89①4호나목 3년 초과 치유 5개 사유(캠코 매각의뢰·법원 경매·공매·현금청산금 소송·수용재결/매도청구) | 원안 없음. 저장소 구현(UI `:168` RadioCardGroup 6옵션) |
| M-5 | **소령 §156의2⑧⑨** | **입주권·분양권 보유 세대**의 동거봉양·혼인 합가 10년(§156의3⑥이 준용) | 원안 3B는 ③④⑤만 다룸. 저장소 구현(`MergedHouseholdRightSection.tsx:108-176` 6갈래) |
| M-6 | **소령 §155의2②** | 장기저당담보주택 보유 직계존속 **동거봉양 합가** 시 먼저 양도 주택 특례 | 원안은 ① 위주. **저장소 미구현**(G-2) |
| M-7 | **소령 §154⑫** | 취득 당시 조정대상지역 **공동상속주택**의 거주기간 = 공동상속인 중 **최장 거주자** 기준 | 원안 없음. 저장소 미확인 → **V-8** |
| M-8 | **소령 §154①5호** | 조정대상지역 **공고일 이전 계약 + 계약금 지급 + 그 시점 무주택** → **거주기간 제한만** 면제 | 원안 11종 표에 없음. 저장소 구현(`resolveExemptionProviso` `pre_designation_contract`) |
| M-9 | **소령 §155의3①2호** | 상생임대 — **직전임대차계약 임대기간 1년 6개월 이상** | 원안 3B.4에 **누락**. 빠지면 특례 오부여 |
| M-10 | **소령 §155⑮** | **다가구주택 = 구획별 각 1주택**, 다만 **하나의 매매단위로 일괄 양도 시 전체를 하나**로 본다 | 원안 3C.1이 다루나 근거 조문을 적지 않았다. **저장소는 §155⑮ 인용 0건** — 다가구 유형 개념은 `house-count/types.ts:21 multi_household`에 있으나 그것은 **한시 신축 소형주택 주택수 제외** 축(`house-count/hansi.ts`)이다. 구획별 1주택 판정은 **입력 경로가 없어 자기신고에 흡수**된다 → G-4 |

### 2.3 🔴 축 혼입 — 원안 3.3절은 **종합부동산세**다

원안 3.3절 「주택 수 산정 제외 특례」의 항목 — **지방 저가주택 4억** · **인구감소(관심)지역** ·
**준공 후 미분양** · **공동명의 1주택자 특례** — 은 전부 **종합부동산세법 §8④·시행령 §4의2** 축이며,
출처로 적힌 국세청 페이지(cntntsId 239014)도 **종부세 1세대1주택자 판단** 안내다.
E-2(40%·6억·3억)도 같은 혼입의 산물이다.

⇒ 이 계획서에서 3.3절은 **삭제**한다. 종부세 축은 별도 세목으로 이미 구현돼 있다
(`lib/tax-engine/comprehensive-exclusion.ts`).

### 2.4 🟡 저장소 내부 인용 오기 1건 (실측)

`lib/tax-engine/multi-house-surcharge-exclusion.ts:289` 주석이
「동거봉양 합가 10년 이내 (**§155 ⑦**)」라 쓴다. **§155⑦은 농어촌주택**이고 동거봉양은 **§155④**다.
같은 파일 `:266`은 혼인을 §155⑤로 바르게 인용한다.

⇒ 주석 인용 결함이며 로직(`input.parentalCareMerge`)은 옳으므로 **세액 영향은 없다.**

**두 번째 오기(2026-09-18 실측)** — `ONE_HOUSEHOLD_DEF`가 `legal-codes/transfer.ts:43`과 `transfer-house.ts:24` **두 곳**에서
「소득세법 시행령 **§152** — 1세대의 범위」로 적혀 있다. 그런데 **영 §152는 「환지등의 정의」** 이고, 1세대의 범위는
**영 §152의3**이다(정의 조항은 법 §88 6호, 소득 범위는 칙 §70 — 법제처 실독). 같은 오기가 두 파일에 복제돼 있다
(`feedback_citation_drift_replicates_across_repo`). 이 계획서의 초판도 그 상수를 따라 「§152」로 적었다가 정정했다.
⇒ P0에서 함께 고친다. P-1 실측대로 이 문자열을 지키는 테스트는 없다.
다만 동거봉양은 `legal-codes`에 **전용 상수 자체가 없어** 인라인 주석이 유일한 근거 표시다 → P0에서 상수화한다.

---

## 3. 현행 구현 실측 — 이미 있는 것

### 3.1 기본 요건 (소법 §89①3호 · 소령 §154)

| 축 | 상태 | 근거 |
|---|---|---|
| 1세대 판정 | 🟡 **자기선언 boolean** | `transfer.types.ts:316 isOneHousehold` · 게이트 `transfer-tax-exemption.ts:92` · UI `Step4.tsx:413-422`. **1세대 판정 알고리즘 없음**(법 §88 6호·영 §152의3·칙 §70) — Q-3′로 **앞으로도 두지 않는다**(사용자 판정). ⚠️ 저장소 상수 `ONE_HOUSEHOLD_DEF`는 이를 「영 §152」로 **오기**했다(§2.4) → **G-4** |
| 보유2년 / 거주2년 | ✅ | `transfer-tax-exemption-requirements.ts:435 meetsOneHouseHoldingResidence` · `:405` · `:359` · `tax-utils.ts:268` |
| 취득 당시 조정대상지역 | ✅ **정적 단일 소스** | `transfer-tax-exemption-requirements.ts:285-292 resolveWasRegulatedAtAcquisition` → `isRegulatedByBjdCode()`(`data/regulated-areas.ts`). UI 자동판별 `/api/address/regulated-area` |
| 고가주택 12억 안분 | ✅ (단 9억 미분기) | `transfer-tax-exemption.ts:285`(E-1)·`:299`(E-2). 임계값은 DB 주입 `rule.maxExemptPrice` → **G-5** |
| §154① 단서 면제 **6종** | ✅ | `transfer-tax-exemption-requirements.ts:219-256 resolveExemptionProviso` — `expropriation`·`overseas_migration`·`overseas_residence`·`unavoidable`·`rental_5yr_residence`·`pre_designation_contract`(거주만 면제). UI는 `ExemptionProvisoSection.tsx`에 「해당 없음」 포함 7선택지 |
| §154⑦ 부수토지 배율 | ✅ **3·5·10 + 2022.1.1 시점 분기** | **정본** `non-business-land/urban-area.ts:106-132 getHousingMultiplier()` · 상수 `:90 HOUSING_MULTIPLIER_SPLIT_EFFECTIVE_DATE` · 법령상수 `legal-codes/transfer.ts:337`. ⚠️ `appurtenant-land-*.ts`는 **지방세법 §101② 비주택 부속토지** 축이라 별개다 |
| §154③④ 겸용주택 안분 | ✅ | `transfer-tax-mixed-use.ts` · `lib/print/mixed-use-print-sections.ts` |
| §91 미등기 비과세배제 · 70% | ✅ | `transfer-tax-exemption.ts:71-91`(§91① 비과세만 배제, §91② 감면은 미적용 — 법 근거 없는 불리적용 회피) · `transfer-tax-rate-calc.ts:166` |

### 3.2 특례 — 원안 11종 + 3B 대조

| 원안 # | 조문 | 상태 | 근거 |
|---|---|---|---|
| ① 일시적 2주택 | §155① | ✅ | `transfer-tax-exemption-requirements.ts:453·513·541` · UI `TemporaryTwoHouseSection.tsx:66-73`(요건 자동판정 카드) |
| ② 상속주택 | §155② | ✅ | `transfer-inheritance-exclusion.ts:1-129` · `legal-codes/transfer-house.ts:89` |
| ③ 공동상속 소수지분 | §155③ | ✅ **최대지분자 산입**(법대로) — 최대지분자 여부는 사용자 선언 | `transfer-inheritance-exclusion.ts:66`(`isLargestCoInheritedShareholder`) · `transfer-house.ts:90` · anchor `inherited-house-155-3-coinherited.anchor.test.ts` |
| ④ 혼인합가 | **§155⑤** | ✅ | `transfer-tax-exemption.ts:266` · UI `MergeDateSection.tsx:33-57` |
| ⑤ 동거봉양 합가 | **§155④** | ✅ (인용 오기 §2.4) | 동상 |
| ⑥ 문화유산주택 | §155⑥ | ✅ **3법 체계** | `transfer-tax-exemption.ts` E-3 계열 · UI `TemporaryTwoHouseSection.tsx:298` |
| ⑦ 농어촌주택(조특법) | 조특법 §99의4 | ✅ | `transfer-reductions/new-99-4.ts:31-78` · `transfer-house.ts:171-172` · manifest `additions-transfer.ts:379` |
| ⑧ 비수도권 부득이 | §155⑧ | ✅ | `transfer-tax-exemption-requirements.ts:97-109` · `transfer-tax-exemption.ts:197` |
| ⑨ 장기저당담보 | §155의2 | ❌ **미구현** | `transfer-tax-exemption-requirements.ts:177-178`이 "손대지 않았다 — 별건 백로그"로 명시 |
| ⑩ 임대주택 거주주택 | §155⑳ | ✅ | `transfer-tax-rental-housing-step.ts`(676줄) · `transfer-house.ts:115·122-149`(§161①~④) · UI `RentalHousingExceptionSection.tsx` |
| ⑪ 1년거주+부득이 | §154①3호 | ✅ | §154① 단서 범위 |
| 3B.1 주택+입주권 | §156의2③④ | ✅ | `transfer-tax-89-2-exclusion.ts` Phase 1~2 |
| 3B.2 대체주택 | §156의2⑤ | ✅ | 동 모듈 `:204` · UI `TemporaryTwoHouseSection.tsx:466` |
| 3B.3 주택+분양권 | §156의3②③ | ✅ | 동 모듈 |
| 3B.4 **상생임대** | §155의3 | ❌ **미구현** | 코드·테스트·문서·e2e **전역 grep 0건** |

### 3.3 원안에 없는데 이 저장소가 더 나간 축

- **소법 §89② 배제** — `transfer-tax-89-2-exclusion.ts`(637줄)가 예외 **16항 전수**를 Phase 1~5로 판정하고
  `excluded` / `exception_met` / **`undetermined`** **3갈래**로 답한다. `undetermined`는 종전 동작 유지 + 경고다
  — 원안 §8이 요구한 「판정 보류 상태」가 **이미 있고 더 엄격**하다.
- **주택 명부 UI** — `step4-sections/HousesListSection.tsx`. 행당 **16필드**(지역·취득일·공시가격·상속·장기임대·
  아파트·오피스텔·미분양·배우자소유·공동상속·동일세대·순위배제 등), 모달 편집, 요약 테이블.
  **①↔④ 불일치 자동 대조** `computeHouseCountDivergence`(`:484-495`, `data-testid="house-count-mismatch"`).
- **이력·백업** — `lib/storage/`(Dexie + 자동저장 + 암호화 export). 원안 F-07 대응.
- **신고서 서식 출력** — `lib/print/transfer-print-sections.ts` 외 10종. 원안 §6.2 리포트 대응.
- **근거 조문 링크** — `components/ui/law-article-modal.tsx` · `law-ref-badges.tsx`.
  원안 §5.2의 `evidence`(조문·유권해석 링크 표출) 요구는 **이미 충족**돼 있다.

### 3.4 기존 anchor·E2E (원안 §7.1 "특례별 20~30건"은 이미 존재)

| 축 | anchor | E2E |
|---|---|---|
| §154① 단서 | `exemption-154-proviso.test.ts` | `transfer-154-proviso-mode.spec.ts` · `transfer-exemption-154-proviso.spec.ts` |
| §154① 거주(조정) | `regulated-area-residence.test.ts` · `mixed-use-154-1-{residence,holding}.anchor.test.ts` | `transfer-regulated-auto.spec.ts` |
| §155① | `temporary-two-house-{one-year-155-1,high-value,proviso-154,155-16-18}.anchor.test.ts` | `transfer-155-temp-two-house-auto-judge.spec.ts` 외 1 |
| §155②③ | `inherited-house-155-2-exemption` · `-2-proviso-ranking` · `-3-coinherited.anchor.test.ts` | `transfer-155-2-inherited-house.spec.ts` · `transfer-155-3-coinherited.spec.ts` |
| §155④⑤ | `merge-155-4-5-exemption.anchor.test.ts` · `multi-house-marriage-154.test.ts` | `transfer-155-merge-exemption.spec.ts` |
| §155⑦⑧ | `rural-and-unavoidable-155-7-8.anchor.test.ts` | `transfer-155-7-rural-location-auto.spec.ts` · `transfer-155-8-outside-capital.spec.ts` |
| §155⑯⑱ | (§155① anchor에 포함) | `transfer-155-16-18-deadline-specials.spec.ts` |
| §155⑳ | `__tests__/tax-engine/rental-housing-exception/` 9건 | `transfer-rental-155-20-active-ui.spec.ts` |
| §156의2·§156의3 | `article-89-2-*.anchor.test.ts` 6건 · `article-156-2-4-before-completion` · `replacement-house-156-2-5` | — |
| §91 미등기 | `unregistered-91-1-exemption-bar.anchor.test.ts` | — |
| 명부 정합성 | — | `transfer-house-count-divergence.spec.ts` |
| **§155⑥ 단독** | 🟡 **전용** anchor 미발견 — `culturalHeritageHouse`는 §89② 2주택 축 anchor **2건**이 간접 커버(`__tests__/calc/two-house-axis-path.anchor.test.tsx` · `__tests__/tax-engine/transfer/article-89-2-two-house-axis.anchor.test.ts`) | — |
| **§155의2·§155의3** | ❌ 0건(미구현과 정합) | — |

### 3.5 법령 인용 인프라 갭 (실측)

| 항목 | 상태 |
|---|---|
| `legal-codes/` 상수 **있음** | §89①(`ONE_HOUSE_EXEMPT` `transfer.ts:41`) · §89①4호(`RIGHT_EXEMPT` `transfer-house.ts:244`) · §152의3 — 단 현 상수는 「§152」로 **오기**(`ONE_HOUSEHOLD_DEF`, §2.4) · §154①단서(`transfer.ts:415`) · §154⑦(`:337`) · §155①(`transfer-house.ts:66`) · §155②③(`:89-90`) · §155⑤(`:62`) · §155⑦(`:70`) · §155⑳(`:115`) · 조특§99의4(`:171-172`) |
| `legal-codes/` 상수 **없음**(인라인 리터럴) | **§89② · §155④(동거봉양) · §155⑥ · §155⑧ · §156의2 · §156의3** — CLAUDE.md 「문자열 리터럴 금지」 위반 상태 |
| manifest **등록됨** | §89①(`verifier-manifest.ts:34`) · §154·§155(**전체 단위**, `manifest/additions-transfer-decree.ts:65·76`) · §159의4·§160 · 조특§99의4(`additions-transfer.ts:379`) |
| manifest **미등록** | **§89② · §156의2 · §156의3** — legal-codes 상수가 없어 커버리지 스캐너 대상에서 **구조적으로 제외**된 상태 |
| 🔴 **항 단위 검증 부재** | §154·§155가 **조문 전체 단위**로만 등록돼 항 번호 오기(④↔⑤↔⑦)는 `verify:legal` 대상이 아니고, 테스트도 근거 문자열을 단언하지 않는다 — **P-1 실측으로 확증**(§8.2). §2.4의 오기가 그래서 살아남았다 |

---

## 4. 갭 상세 — 사실관계 (닫는 곳은 §0 표)

### G-1 🟠 **[판정 메뉴 · D-3]** 주택 수가 이중 트랙이고 단일 소스가 아니다

- **①** `householdHousingCount` — 스칼라(1/2/3+). `Step4.tsx:427-445`. 엔진 비과세 판정의 **실질 입력**.
- **④** `houses[]` 명부 — 16필드 정교한 목록. `HousesListSection.tsx`.
- 둘이 어긋나면 `computeHouseCountDivergence`가 **안내 카드로 경고**할 뿐, 어느 쪽도 정본이 아니다.

`transfer.types.ts:524-528` 주석이 그 사실을 남긴다 — "제공 시 주택 수 산정 엔진을 통해 정밀 계산.
미제공 시 `householdHousingCount` 사용(하위 호환)". 그리고 `:586`은 §155⑥에 대해
"`houses` 목록이 **없는 입력에서도 성립해야** 하므로 세대 단위 선언을 따로 받는다"고 적는다.

🔑 현행은 결함이 아니라 **의도된 하위호환 설계**다(`feedback_deliberate_design_looks_like_the_defect`).
⇒ **D-3으로 해소(Q-1 종결)**: 판정 메뉴에서는 명부가 **정본**이고 주택 수는 명부에서 **도출**한다.
사실을 넘겨받은 계산기는 그 명부로 재판정한다. 판정을 거치지 않은 계산기 사용자에게는 현행
「세대 보유 주택 수」 스칼라와 불일치 경고가 **그대로** 남는다(D-4) — 차단으로 올리지 않는다.

### G-2 🔴 **[확정 미구현 · 공유 엔진 P3 + 판정 메뉴 P4]** §155의2 · §155의3

- **§155의2 장기저당담보** — 요건 3개(60세 이상·10년 이상 계약·만기 일시상환) + ②(동거봉양 합가, M-6)
  + ③(만기 전 양도 시 배제) + ④(신고서). 입력 5~6개. **소규모**.
- **§155의3 상생임대** — 저장소 전역 0건. 계약 **2건**(직전·상생)의 기간·증액률을 받아야 하고,
  **직전 1년 6개월 / 상생 2년** 두 기간 요건이 있다(M-9). 효과는 §154①에 더해
  **§155⑳1호와 §159의4(장특공제 표2) 거주요건까지** 면제 — 조문 본문 명시. **세액 영향 큼**.

### G-3 🟠 **[판정 메뉴 · D-1]** 「조건부 + 기한」 출력이 없다

현행 결과뷰는 **비과세/과세 세액**을 낸다. 전액 비과세는 🎉 카드(`TransferTaxResultView.tsx:376-385`),
부분 비과세는 "1세대1주택 특례 적용 — {exemptReason}"(`:438-448`)까지다.
원안의 핵심 가치인 「**지금은 미충족이지만 YYYY-MM-DD까지 종전주택을 양도하면 비과세**」는 형태가 없다.
`transfer-tax-89-2-exclusion.ts`의 `undetermined` 경고가 가장 가까운 선례다.

⇒ **D-1로 해소(Q-2 종결)**: 상담 성격의 출력이므로 **판정 메뉴 결과 화면**에 둔다. 계산기는 세액에 집중한다.

### G-4 ✅ **[종결 — Q-3′: 사용자가 판정]** 자기선언 의존 — 1세대 판정 · §155⑮ 다가구 · 오피스텔

`isOneHousehold` boolean 자기선언뿐이다. **법 §88 6호**(거주자·배우자·같은 주소·생계의 직계존비속·형제자매)와
**영 §152의3**(배우자 없어도 1세대: 30세 이상·배우자 사망·이혼·소득 40%) · **칙 §70**(소득 범위) 판정이 없다.
원안 F-01(세대원 명부·혼인·합가·분가 이벤트)이 여기에 대응한다.

실측된 세대 관련 필드는 `marriageDate`(라벨 "혼인**합가**일")·`parentalCareMergeDate` **둘뿐**이고,
**세대원 명부·분가일은 없다**(grep 0건). 합가 이력도 각 1건만 담긴다.

⚠️ 취득세 도메인에 `house-count/household.ts` `isSeparateHousehold`(4사유)가 있으나 그것은
**지방세법 시행령 §28의3②**이다. 이름이 같아 보여도 **이식하면 조용히 틀린다**
(`feedback_rename_same_name_two_axes`).

**같은 「자기선언 의존」 축 2건** (원안 3C.1이 다루나 저장소에 판정 경로 없음):
- **다가구 구획별 1주택(§155⑮, M-10)** — 인용 0건. 다가구 유형 개념은 `house-count/types.ts:21`에
  있으나 **한시 신축 소형주택** 축(`house-count/hansi.ts:69-73`)이다. 그 파일이 「다가구 + 호별 구분
  없으면 전체 연면적 기준」으로 구분 축을 이미 인지하고 있다 — 이식 시 참고 선례.
- **오피스텔 주거용 판정** — `isOfficetel`은 `multi-house-surcharge.types.ts:164`(중과 주택수 축)에만
  있다. 비과세 축에는 없고 `householdHousingCount`에 흡수된다.

🔑 셋 다 **사실판단 영역**이라 자기선언이 정답일 수 있다. ⇒ 입력 **위치**는 판정 메뉴로 확정됐고(Q-3 일부 해소),
**Q-3′로 결정됐다(2026-09-18) — 세대 판정은 프로그램이 하지 않고 사용자가 한다.** 현행 `isOneHousehold` 자기선언을
그대로 쓰고, 판정 메뉴는 1세대 정의 안내와 법조문 링크로 **판단을 보조**만 한다. 다가구 구획·오피스텔 주거용도
같은 이유로 사용자 선언이다(사실판단 영역). ⇒ G-4는 결함이 아니므로 **종결**한다.

### G-5 🔴 **[확정 결함 · 공유 엔진 P1]** 고가주택 기준 시점 분기 부재 — 과거 양도분 과소 과세

`maxExemptPrice`는 seed 전체에서 **12억 단일값**이다
(`data/transfer-rate-seed.ts:140` · `transfer-rate-seed-historical.ts:226`, 후자는 `effective_date` 1990-01-01).
`900000000` 매칭은 조특법 §98의3(미분양주택)뿐으로 무관하다.

**법령 연혁 — V-6ⓐ 해소(2026-09-18, 법제처 DRF `target=eflaw` `LM`+`efYd` 직접 조회)**

| 양도일 | 고가주택 기준 | 근거 규정 | 확인한 시행본 |
|---|---|---|---|
| ~ 2008-10-06 | **6억원** 초과 | **소령** §156① (법 §89①3호 「가액이 대통령령으로 정하는 기준」 위임) | 2005-02-19 · 2006-01-01 · 2008-09-22 |
| 2008-10-07 ~ 2021-12-07 | **9억원** 초과 | **소령** §156① (대통령령 제21062호, 2008.10.7 개정) | 2008-10-07 · 2010-02-18 · 2014-02-21 · 2021-07-01 |
| **2021-12-08 ~** | **12억원** 초과 | **법률** §89①3호 괄호에 직접 규정 (법률 제18578호) | 2021-12-08 · 현행 |

- **두 경계 모두 적용 기준은 양도일이다.**
  · 12억: 부칙(법률 제18578호) 제1조 3호가 §89①3호 개정규정의 시행을 「공포한 날」(2021-12-08)로 정하고,
    **제7조④**가 「같은 개정규정의 시행일 이후 **양도하는 주택부터** 적용한다」고 정한다.
  · 9억: 부칙(대통령령 제21062호) 제1조 「공포한 날부터 시행」(2008-10-07), **제2조** 「이 영 시행 후 최초로
    **양도하는 분부터** 적용한다」.
- 🔑 **위임 체인이 바뀌었다.** 2021-12-07까지 법률에는 금액이 **없고** 「대통령령으로 정하는 기준」이라는
  위임 문언만 있었다. 9억은 **시행령**에 있었다(`feedback_korean_law_82_vs_81_2_drift` — 법률만 보면 놓친다).
- 연혁 표의 9억 행은 **샘플이 아니다.** §156①의 개정 이력 태그(<개정 2005.12.31, 2008.2.22, 2008.10.7,
  2010.2.18, 2014.2.21>)에 적힌 **모든 개정 시점을 직접 조회했다** — 그 사이에 금액이 바뀐 개정은 없다.
- ⚠️ 2005-02-19 **이전**은 DRF 시행일 목록 범위 밖이라 **미확인**이다. seed 행은 `effective_date`가 1990-01-01이므로
  이 구간은 여전히 근거 없이 덮이고 있다.
- 📌 부수 관찰: 2022-01-01 시행본 소령 §156①에는 여전히 **「9억원」 문언이 남아 있었다**. 법률이 위임 문언을
  삭제한 뒤라 **위임 근거가 사라진 사문(死文)**이었고, 2022.2.15 개정으로 「일부 양도 시 안분 금액이 12억원 초과」
  규정으로 바뀌었다. 법률이 우선하므로 판정에는 영향이 없다.

**같은 부칙이 조합원입주권도 바꿨다(M-1 축):** §89①4호 단서도 2021-12-07까지는 「대통령령으로 정하는 기준」
위임이었고, 그 값은 **소령 §155⑰ 9억원**(<개정 2017.2.3>)이었다. 부칙 **제7조⑤**가 「시행일 이후 **양도하는
조합원입주권부터**」 12억을 적용한다. ⇒ 입주권 양도 비과세 경로(`transfer-tax-redevelopment-*`)도 같은 질문을
받는다. 2017-02-03 이전 입주권 기준은 **미확인**이다.

**V-6ⓑ 수치 재현 — 해소(2026-09-18, 실제 엔진 `calculateTransferTax` + `loadFallbackTransferRates(양도일)`)**

도달 가능성: 과거 양도일을 막는 곳이 없다 — `transfer-tax-validate.ts`는 **미래** 양도일만 경고하고(`:773`),
Zod·마법사 양도일 입력에도 하한이 없다(grep 0건). 단건 route는 **양도일**로 규칙을 고른다(`route.ts:124`)
→ 2021-12-07 양도는 seed의 `effective_date 1990-01-01` 행(12억)을 받는다.

입력: 1세대1주택, 보유 요건 충족, 비조정지역 취득, 필요경비 0.

| 케이스 | 양도일 · 양도가 | 현행 | seed만 교정 | 법령대로(seed+안분 교정) |
|---|---|---|---|---|
| A | 2021-12-07 · 10억 (취득 5억) | 전액 비과세 · **0** | 과세차익 **5억 전액** · **164,560,000** | 과세차익 **50,000,000** · **5,659,500** |
| B (대조) | 2021-12-08 · 10억 | 전액 비과세 · 0 | — | 전액 비과세 · 0 (현행과 같음) |
| C | 2008-10-06 · 7억 (취득 3억) | 전액 비과세 · **0** | 과세차익 **4억 전액** · **118,800,000** | 과세차익 **57,142,857** · **6,319,500**¹ |
| D (대조) | 2008-10-07 · 7억 | 전액 비과세 · 0 | — | 전액 비과세 · 0 (현행과 같음) |

과세차익은 산식과 정확히 일치한다: 5억 × (10억−9억)/10억 = 50,000,000 · 4억 × (7억−6억)/7억 = 57,142,857.
¹ C의 **세액**은 2008년 시점의 장기보유특별공제·세율 축을 엔진이 정확히 재현한다는 전제에 선다 —
이 probe는 그 축을 검증하지 않았으므로 **과세차익까지만** 법령 기준으로 단정한다.

🔴 **seed만 고치면 더 나빠진다 — 판정과 안분이 다른 값을 본다.**
- 판정(E-1/E-2)은 규칙값 `rule.maxExemptPrice`를 본다(`transfer-tax-exemption.ts:295`).
- 안분은 **12억을 하드코딩**한다 — `calcOneHouseProration`(`transfer-tax-helpers.ts:452`
  `const threshold = 1_200_000_000`): 「9억 초과 → 일부 과세」로 판정해 놓고, 안분에서는
  「12억 이하 → 안분 없음」으로 처리해 **양도차익 전액을 과세**한다(A: 0 → 164,560,000, 법령값의 29배).
- 같은 12억 하드코딩이 **4곳 더** 있다: `transfer-tax-lthd.ts:370`(토지·건물 분리 안분) ·
  `transfer-tax-mixed-use-helpers.ts:504`(겸용주택) · `burdened-gift-eligibility.ts:19`(부담부증여) ·
  `transfer-tax-redevelopment-lthd.ts:25 HIGH_VALUE_THRESHOLD`(재개발·재건축·입주권 — 규칙값을 아예 안 본다).
  **6번째(설계 단계 발견)**: `components/calc/transfer/RedevelopmentRightExemptionSection.tsx:52 HIGH_VALUE_THRESHOLD` — UI 12억 초과 안내용.
  (`feedback_fixed_layer_vs_consumed_layer` · `feedback_enumerate_all_write_sites_before_fixing`)

⇒ **P1 설계 제약**: 기준 금액을 **양도일 → 금액** 순수 함수 하나(예: `resolveHighValueHouseThreshold(transferDate)`,
`HOUSING_MULTIPLIER_SPLIT_EFFECTIVE_DATE` 전례 · §5.7)로 모으고, 판정·안분·위 4곳이 **전부 그것을 호출**하게 한다.
seed 행 교체만으로 끝내지 않는다.
⚠️ **다건 route는 과세기간 말일로 규칙을 고른다**(`app/api/calc/transfer/multi/route.ts:89` `rateDate`) —
2021년 11월 양도도 12-31 기준 행(12억)을 받는다. 그래서 기준은 규칙 행이 아니라 **자산별 양도일**로 풀어야 한다.
⚠️ 입주권 경로(`HIGH_VALUE_THRESHOLD`)는 이번 probe에서 **수치 재현하지 않았다** — 코드상 규칙값을 보지 않으므로
같은 결함이 있을 것으로 보이나, 입주권 입력을 구성한 재현은 P3 착수 시 한다.

---

## 5. 설계

### 5.0 결정 기록 (D-1~D-5 · 2026-09-18 사용자 승인)

§0 표가 요약이다. 여기에는 **무엇이 유지되고 무엇이 바뀌는지**를 남긴다(구현 중 흔들릴 때 되돌아볼 기준).

- **유지**: 판정 로직 자체(`checkExemption`·§155 특례·§89② 16항·주택 수 산정)는 **다시 쓰지 않는다**. 위치만 옮긴다.
- **유지**: 계산기의 ①「세대·주택 현황」·②「1세대1주택 비과세 판정」(조정지역·거주기간·§154① 단서)·
  ⑤「특수 상황」(미등기·비사업용 토지)·중과 판정 섹션·주택 명부·분양권·입주권 위젯.
- **이관**: ③ `TemporaryTwoHouseSection`(§155①⑥⑦⑧⑯⑱ · §156의2⑤ · 혼인·동거봉양 합가) ·
  권리 예외 3섹션(`RightThreeYearExceptionSection`·`InheritedRightExceptionSection`·`MergedHouseholdRightSection`) ·
  상속 2년 내 증여 게이트 → **판정 메뉴**. 계산기에는 넘겨받은 사실의 **읽기 전용 요약**만 남는다.
- **신설**: 판정 메뉴 · 공유 엔진 진입 함수 · §155의2·§155의3 · 조건부·기한 출력 · 이력 타입.
- **이관(Q-7 결정)**: 자산 카드 안의 §155⑳(`RentalHousingExceptionSection`)·1세대1입주권(`RedevelopmentRightExemptionSection`)의
  **판정 사실**도 판정 메뉴로 옮긴다. 한 위젯에 섞인 **세액 산식 입력(§161 안분 기준시가·기간 / §166 3분할)은 계산기에 남긴다**.
  `RentalHousingExceptionSection`은 표시 모드 prop(`facts` / `calc` / `full`)으로 나눠 **한 컴포넌트를 두 화면이 쓴다** — 복제 금지.

### 5.1 공유 판정 엔진 — 추출(P2)

```
lib/tax-engine/one-house/                         (신설 디렉터리 — 기존 파일은 이동 없이 re-export로 시작)
  judge.ts        judgeOneHouseExemption(facts, sale, rates) → OneHouseJudgment
  types.ts        OneHouseFacts · OneHouseJudgment
  threshold.ts    resolveHighValueHouseThreshold(transferDate)   ← G-5 (P1에서 먼저 만든다)
```

- **입력 `OneHouseFacts`** = 세대(1세대 여부·합가·혼인) · 보유 주택 명부(`HouseInfo[]`) · 분양권·입주권(`PresaleRight[]`) ·
  특례 사실(§155 각 항·§155의2·§155의3·§89② 예외) · 양도 대상 주택 식별자.
  **입력 `sale`** = 양도일 · 양도가(지분·부담부증여 분모 포함).
- **출력 `OneHouseJudgment`** = §5.5 네 축이 소비하는 필드 전부 + 판정 메뉴용 `pending[]`(조건부·기한) + `legalBasis[]`.
- 🔴 **세액 불변 리팩터**다 — 추출 전후로 §3.4 anchor 전건 + 전체 테스트가 **같은 값**이어야 한다.
  「불변」은 부정형 단언이므로 mutation으로 확증한다(§8.2 P-4).
- 계산기 route(`app/api/calc/transfer/route.ts`)는 추출 후 **이 함수를 호출**한다. 판정 메뉴 route도 같은 함수를 부른다.

### 5.2 판정 메뉴 — 신설(P4)

| 항목 | 기본값(변경 가능) | 근거 |
|---|---|---|
| 경로 | `app/calc/one-house-exemption/` | 기존 `app/calc/*` 규약 |
| 메뉴명 | 「1세대1주택 비과세 판정」 | — |
| 메뉴 등록 | `app/page.tsx` · `app/history/HistoryClient.tsx` | 실측 — 세목 메뉴가 등록되는 두 곳 |
| API | `app/api/calc/one-house-exemption/route.ts` — rate limit · Zod · `preloadTaxRates(양도일)` → `judgeOneHouseExemption` | 2-Layer 규약. 판정에도 규칙 데이터(`one_house_exemption`·주택 수 산정 규칙)가 필요하다 |
| 이력 타입 | `LocalTaxType`(`lib/storage/types.ts:7`)에 추가 + `backup-validate.ts:22` 허용목록 · `business-key.ts` · `title-generator.ts` | 실측. Supabase `calculations` CHECK는 **코드 사용 0건이라 불필요** |

단계(원안 §6.1을 이 저장소에 맞춘 것):

| 단계 | 입력 | 재사용 |
|---|---|---|
| ① 세대 | **1세대 해당 — 사용자 선언**(Q-3′) + 1세대 정의 안내(법 §88 6호·영 §152의3 요지 · 법조문 링크) · 혼인일 · 동거봉양 합가일 | 「1세대 해당」 `ToggleCard`(`Step4.tsx:413-422`와 같은 의미) · `MergeDateSection` |
| ② 보유 주택·권리 | 명부 · 분양권·입주권 · 특례 사실(§155 각 항 · §155의2 · §155의3 · §89② 예외) | `HousesListSection` · `PresaleRightsSection` · ③ 섹션군 — **컴포넌트 재사용, 복제 금지** |
| ③ 양도 예정 | 양도 주택 · 양도 예정일 · 예상 양도가 · 조정지역(자동판별) · 거주기간 | `ResidencePeriodSection` · `/api/address/regulated-area` |
| ④ 결과 | 판정 배지 · 적용 특례 체크리스트 · **조건부·기한**(G-3) · 근거 조문 링크 · 「이 결과로 세액 계산」 | `law-article-modal` · `ToneCard` |

- 기한 역산은 **엔진이** 한다(`pending[].deadline`). UI가 날짜를 다시 계산하면 dual-truth
  (`feedback_aggregate_display_rederives_engine_value`).
- 판정 보류는 저장소 `undetermined` 3갈래를 그대로 쓴다 — 억측 결론 금지(원안 §8과 같은 철학).
- 기한은 **날짜로** 표시한다(Q-4 — 잔여일·D-day 없음). ❌ 알림·푸시는 범위 밖(§1.2).

### 5.3 사실 전달 — 판정 → 계산기 (P5)

| 통로 | 방식 | 선례 |
|---|---|---|
| 「이 결과로 세액 계산」 | 판정 메뉴가 사실을 store에 쓰고 양도세 계산기로 **이동**(`openTransferWithOneHouseFacts`) | `transfer-resume-entry.ts:124-137`(store 쓰기 + `router.push`) — 같은 SPA라 sessionStorage 불요(UI 설계 §5) |
| 계산기 「판정 불러오기」 | 이력에서 판정 record 선택 → store에 **쓰기만**(`applyOneHouseFactsToTransferForm`, **이동 없음**) | `history-lookup-modal` 스킬. 🔴 이동하는 함수를 부르면 다건 편집 화면(`MultiTransferSteps.tsx:203`)에서 단건 화면으로 튕겨 나간다 |

- 🔴 **진입은 `lib/calc/transfer-resume-entry.ts` 계열 단일 헬퍼를 거친다.** 같은 진입을 카드·드로어에 복제했다가
  **두 번 갈라진** 전례가 그 파일 머리 주석에 남아 있다. 판정 → 계산기 진입도 새로 복제하지 않는다.
- **재판정(D-3)**: 계산기는 받은 사실 + **자기 양도일·양도가**로 공유 엔진을 다시 돌린다. 판정 메뉴 결과를 복사하지 않는다.
- **출처 표시**: 계산기 결과에 「판정 메뉴 결과 기준(판정일 · 사실 해시)」 한 줄. 원본 판정 record가 나중에 수정되면
  해시가 달라지므로 「원본 판정이 바뀌었습니다」를 띄운다(`feedback_snapshot_copy_without_staleness_detection`).
- 계산기 안에서 넘겨받은 **특례 사실**은 읽기 전용이다 — 수정은 「판정 메뉴에서 수정」. 명부·분양권은 중과 축 때문에
  계산기에서도 편집 가능하다(§5.4) — 편집하면 출처 배지를 「판정 이후 명부 수정됨」으로 바꾼다.

### 5.4 계산기 간이 입력 (D-4 · P6)

- **남는 것**: §5.0 「유지」 목록. 판정 미경유 사용자는 현행과 **같은 세액**을 받는다(OH-19).
- **빠지는 것**: §5.0 「이관」 목록. 주택 수 ≥ 2인데 넘겨받은 사실이 없으면 `<ToneCard>`로
  「2주택 이상 특례(일시적 2주택·합가·상속·농어촌 등)는 판정 메뉴에서 판정한 뒤 불러오세요」 + 불러오기 버튼.
  그 상태의 세액은 **특례 없음**으로 계산된다 — 현행에서 ③을 비워 둔 것과 같은 동작이다(OH-20).
- 🔴 **명부·분양권 위젯은 남긴다** — 다주택 중과 STEP 0.5의 **유일한 입력 경로**다(§0 제약).
- 🔴 **기존 이력 보존**: ③·권리 섹션 값을 가진 저장 record를 다시 열면, 그 값을 **넘겨받은 사실로 승격**해 보존한다.
  조용히 버리면 재계산 세액이 바뀐다(OH-21 · `feedback_new_asset_field_stale_sessionstorage_guard` ·
  `feedback_flipping_enum_default_rewrites_absent_records`).
- 🔴 P6은 **P5가 끝난 뒤**에만 착수한다 — 새 경로 없이 입력을 빼면 유일 입력 경로 제거다(`feedback_ui_gate_removes_sole_input_path`).
- 새 판정 입력(§155의2·§155의3 포함)은 계산기에 **추가하지 않는다**. 1주택 상생임대처럼 계산기 사용자가 흔히 필요로 할
  특례도 판정 메뉴를 거친다 — 대신 ② 섹션에 「거주요건 면제 특례(상생임대 등)는 판정 메뉴」 안내를 둔다.

### 5.5 계산기가 판정 결과를 소비하는 네 축 (D-2)

| 축 | 필요한 결과 | 위치 |
|---|---|---|
| 12억 초과 안분 | 비과세·부분과세 여부 + **양도일 기준 금액**(G-5) | `transfer-tax-taxable-gain.ts` → `calcOneHouseProration`(`transfer-tax-helpers.ts:452`) |
| 장특 표2(§159의4) | §155 의제 포함 1세대1주택 여부 · 보유·거주기간 | `transfer-tax-lthd.ts:274 isOneHouseForTable2` |
| 다주택 중과 배제(§167의10①15호) | **어떤 특례로** 1주택이 됐는지 | `multi-house-surcharge-exclusion.ts:249 deemedOneHouseBy155` |
| 겸용·재개발·부담부증여·다건 | 같은 결과 | 각 경로 — 12억 하드코딩 5곳은 P1에서 함수 호출로 전환 |

### 5.6 §155의2 · §155의3 — 공유 엔진 입력(P3)

필드·판정 로직의 정본은 **엔진 설계 문서**(`docs/02-design/features/one-house-exemption-automation.engine.design.md` —
`OneHouseFacts.longTermMortgageHouse`·`winWinRentalHouse`, 「알고리즘 5단계」)다. 여기에 다시 적지 않는다(두 벌이면 한쪽만 고쳐진다).
요점만: 두 조문 모두 **거주요건 면제**다(§155의2①·§155의3) — 1주택 **의제**는 §155의2②뿐이고, 그것도 **중과 배제(영 §167의10①15호)에는
들어가지 않는다**(15호는 「제155조 또는 조특법」만 인정). §155의3의 면제는 §154①·§155⑳1호·§159의4 세 곳에 미친다.

### 5.7 법령 버전 축 — 원안 §4·§5.2의 "파라미터 테이블"

원안은 개정을 DB 파라미터로 다루자고 한다. 이 저장소의 정본은 **역사 상수 + 시점 분기 함수**다
(`feedback_historical_tax_tables` · `feedback_transfer_year_tax_rate`).
전례: `HOUSING_MULTIPLIER_SPLIT_EFFECTIVE_DATE`(`urban-area.ts:90`) ·
`resolveTemporaryTwoHouseDeadlineYears`(`transfer-tax-exemption-requirements.ts:513`, 조정지역 2년/1년 → 2022.5.10 3년 환원).

⇒ G-5(6억→9억→12억)는 `one-house/threshold.ts`의 시점 함수로, E-7(§155① 전입요건)은 과거 양도분 판정을 구현할 때
같은 방식으로 보관한다. DB 파라미터 테이블은 만들지 않는다. **다건 route는 과세기간 말일로 규칙을 고르므로**
(`multi/route.ts:89`) 기준 금액은 규칙 행이 아니라 **자산별 양도일**로 풀어야 한다.

### 5.8 법령 검증 manifest 등록 (강제)

신규 인용 조문은 매니페스트에 **반드시 등록**한다. 미등록 시 `npm run verify:legal` 대상에서
조용히 빠지며, 이 갭은 과거 **두 번 재발**했다. 게이트는
`__tests__/lib/legal-verification-coverage-complete.test.ts`.

- 본법(§89 등) → `lib/legal-verification/verifier-manifest.ts`
- **시행령(§154·§155 등) → `lib/legal-verification/manifest/additions-transfer-decree.ts`**
- 조특법 → `lib/legal-verification/manifest/additions-transfer.ts`

대상: **§89② · §156의2 · §156의3**(현재 구조적 제외) + 신규 **§155의2 · §155의3** + G-5의 **법률 제18578호 부칙**·**소령 §156①**.
⚠️ 상수가 먼저다 — legal-codes에 상수가 없으면 스캐너가 인용 자체를 보지 못한다(§3.5).
키워드는 **KoreanLaw MCP 본문의 verbatim 표현**이어야 한다(강학상 용어 금지).

### 5.9 UI 제약

- 판정 메뉴는 **새 마법사**다 — `components/calc/CLAUDE.md` 규약 전부 적용. 신규 세목 UI 첫 진입이므로
  `docs/02-design/features/_new-tax-ui-kickoff.checklist.md`를 따른다.
- `ToggleCard`/`RadioCardGroup` 강제, native 신규 금지. OFF에도 tone 배경 유지.
- `<ToneCard>` 단일 소스, 동적 `bg-${tone}` 보간 금지.
  tone: amber=취득·분리계산 / rose=지역·지정 / violet=거주·자격 / emerald=긍정 / sky=면적.
- 라벨 크기는 역할별 정본 클래스(`text-[Npx]` 금지 — pre-push 하드블록).
- 선택지 anchor는 **`value` 기준**(`radioValues()`/`checkedRadioValue()`), 라벨 문자열 단언 금지.
- 섹션 재사용 결합도(실측): store 훅을 직접 부르는 섹션은 **없다.** `TemporaryTwoHouseSection`·`HousesListSection`·
  `MergedHouseholdRightSection`·`MergeDateSection`은 `form: TransferFormData` + `onChange(Partial<TransferFormData>)`
  **props 타입**에만 묶여 있고, `PresaleRightsSection`은 `{ rights, onChange }`로 **결합이 없다**.
  ⇒ 판정 메뉴 폼 상태를 `Pick<TransferFormData, …>` 호환 형태로 두면 **수정 없이 재사용**할 수 있다. 호환 필드 목록은 설계 문서에서 확정한다.
- ⚠️ 기존 「세대 보유 주택 수」(`Step4.tsx:427-445`)는 `RadioCardGroup`이 아니라 **커스텀 `<button>` 3개**다.
  판정 메뉴에서 같은 입력을 만들 때 이 패턴을 답습할지 정정할지 **먼저 정한다**.
- 계산기 결과뷰에 붙는 것은 **출처 한 줄**뿐이다. 그래도 결과뷰는 **4종**이다(`feedback_transfer_result_view_is_not_one`):
  ① 출처 표시를 **컴포넌트로 추출**해 4종이 같은 것을 렌더 ② 렌더 조건을 **공용 술어**로 단일화
  (`availablePrintIds` 누락 주의 — `feedback_print_leaf_add_unit_test_sync`) ③ E2E는 **경로별로**.

---

## 6. 케이스 매트릭스 (Phase 착수 시 해당 범위로 확장)

🔑 **OH-01~16은 「현행이 이미 맞는지」를 고정하는 회귀 anchor다.** 원안 정정 9건의 대부분은 저장소가 이미
바르게 구현했으므로(§3) 이 케이스들은 **구현 대상이 아니라 안전망**이고, 판정 엔진 추출(P2)의 **불변 증명**에도 쓰인다.
신규 기능 케이스는 OH-11~13(§155의2·§155의3)과 OH-17~22(판정 메뉴·전달·간이 입력·이력 보존)다.

| Phase | 케이스 |
|---|---|
| **선행 anchor**(§8.1) | OH-07·OH-08(§154⑦ 시점) · (OH-01·OH-02는 기존 anchor가 지킴) |
| **P0** 인용·상수화 회귀 | OH-04 · OH-05·OH-06 · OH-09·OH-10 · OH-14 · OH-15 · OH-16 |
| **P1** G-5 | §8.1 anchor 3번 — 기대값 확정(A 5,659,500 · 과세차익 50,000,000 / C 과세차익 57,142,857) |
| **P2** 엔진 추출 | OH-01~OH-16 전건 **추출 전후 동일값** + OH-22 |
| **P3** §155의2·§155의3 | OH-11(불성립) · OH-12(성립) — **짝** · OH-12b(중과 배제 미적용) · OH-13 · OH-13b · OH-13c |
| (엔진 판정 대상 아님) | OH-03 — 최대지분자 동순위 규칙은 사용자 판단, 판정 메뉴는 안내만 · OH-16b — 1세대 비해당 선언 게이트(현행 회귀) |
| **P4** 판정 메뉴 | OH-17 · OH-18(조건부·기한 출력) |
| **P5** 계산기 연결 | OH-18(양도일 변경 재판정) |
| **P6** 계산기 정리 | OH-19 · OH-20 · OH-21 |

| ID | 케이스 | 입력 | 기대 | 근거 |
|---|---|---|---|---|
| OH-01 | 공동상속주택 — 최대지분자로 선언 | `isLargestCoInheritedShareholder: true` | 주택 수 **산입** → 2주택 과세 | §155③ 단서 — 원안 E-2(40%)라면 지분 45%도 「소수지분」으로 오판 |
| OH-02 | 공동상속주택 — 최대지분자 아님 | `isLargestCoInheritedShareholder: false` | 주택 수 **제외** → 비과세 | §155③ 본문 |
| OH-03 | 동순위 최대지분자 2인 중 거주자·최연장자 | — | **엔진 판정 대상 아님** — 사용자가 최대지분자 여부를 선언한다. 판정 메뉴는 §155③ 단서·각 호를 안내만 한다 | §155③1·3호 |
| OH-04 | 상속주택 + 일반주택, 상속 7년 경과 | 상속일 −7년 | **비과세**(기한 없음) | §155② · E-3 |
| OH-05 | 혼인 합가 9년 후 먼저 양도 | 혼인일 −9년 | 비과세 | **§155⑤** · E-1 |
| OH-06 | 동거봉양 합가 11년 후 양도 | 합가일 −11년 | 과세 | **§155④** · E-1 |
| OH-07 | 수도권 도시 주거지역, 부수토지 4배 | 정착 100㎡ / 토지 400㎡ | 초과 100㎡ **과세** | §154⑦1호가 **3배** · E-4 |
| OH-08 | 같은 조건, 양도일 2021-06-30 | 동상 | **전량 비과세**(종전 일률 5배) | 부칙 §39 · E-4 |
| OH-09 | 해외이주 출국, 거주 0년, 출국 1년 후 양도 | 거주 0 | **비과세** | §154①2호나 · E-5 |
| OH-10 | 해외이주 출국, 출국 2년 6개월 후 양도 | — | 과세 | §154①2호나 단서 |
| OH-11 | 상생임대 — 직전계약 14개월 | 직전 14M / 상생 24M | **불성립**(18개월 미달) | §155의3①2호 · M-9 |
| OH-12 | 상생임대 성립 + 조정지역 취득 거주 0년 | 직전 18M / 상생 24M / 증액 4% | 비과세 + **장특 표2 적용** | §155의3① |
| OH-13 | 장기저당담보, 만기 전 양도 | 계약 10년, 7년차 양도 | **특례 배제** | §155의2③ |
| OH-13b | 장기저당담보 ① 성립 · 1주택 · 조정지역 취득 · 거주 0년 | 보유 2년 이상 | **거주요건 면제로 비과세**(보유 요건은 유지) | §155의2① |
| OH-13c | 장기저당담보 ② 동거봉양 합가 2주택 · 먼저 양도 | 담보주택 보유 직계존속과 합가 | 1주택 의제 · 표2 대상 · **중과 배제 근거 없음** | §155의2② · §159의4 · §167의10①15호(§155의2 불포함) |
| OH-12b | 상생임대 성립 | OH-12와 같음 | **중과 배제 근거가 켜지지 않는다**(의제가 아니라 거주요건 면제) | §155의3① · §167의10①15호 |
| OH-16b | 1세대 **비해당**으로 사용자 선언 | `isOneHousehold: false` | 비과세 판정 대상 아님 — 현행 게이트(`transfer-tax-exemption.ts:92`) 회귀 | 법 §88 6호(안내) · Q-3′ |
| OH-14 | §99의4 농어촌주택 보유 2년차에 일반주택 양도 | 보유 2년 | **적용**(사후 추징 대상) | 조특법 §99의4④⑥ · E-9 |
| OH-15 | 일시적 2주택, 신규 취득 후 2년·미전입 | 전입 없음 | **비과세**(전입요건 없음) | §155① 현행 · E-7 |
| OH-16 | 문화유산 = **천연기념물등** 주택 + 일반주택 | 천연기념물등 | 비과세 | §155⑥1호 · E-8 |
| OH-17 | 판정 메뉴 — 명부 2건(일반주택 + 상속주택 선순위) · 세대 주택 수 스칼라 없음 | 명부만 | 주택 수를 **명부에서 도출**(상속주택 제외 → 1) → **비과세** | G-1 · D-3 · §155② |
| OH-18 | 일시적 2주택 — 판정일에 **기한 내**(판정 결과 「조건부: YYYY-MM-DD까지 종전주택 양도」) → 계산기에서 양도일을 **기한 다음 날**로 입력 | 넘겨받은 사실 + 계산기 양도일 | 판정 메뉴 = 조건부 · 계산기 = **재판정으로 과세** + 「판정 결과와 다름」 안내 | D-3 · §155① |
| OH-19 | 계산기 간이 입력만(판정 미경유) · 1주택 | 현행 ①② | **현행과 같은 세액**(P6 전후 동일) | D-4 |
| OH-20 | 계산기 간이 입력만 · 주택 수 2 · 넘겨받은 사실 없음 | 현행 ①② | **특례 없음으로 과세** + 판정 메뉴 안내 카드 — 현행에서 ③을 비워 둔 것과 같은 세액 | D-4 · §5.4 |
| OH-21 | P6 이전에 저장된 이력(③ 일시적 2주택 값 보유)을 P6 이후 다시 계산 | 저장 record | **저장 당시와 같은 세액** — ③ 값이 넘겨받은 사실로 승격돼 보존 | §5.4 |
| OH-22 | 계산기 route가 `judgeOneHouseExemption`을 호출하도록 바뀐 뒤 §3.4 anchor 전건 | — | **전건 동일값** | D-1 · P2 |

---

## 7. 14 동기화 지점 매핑 — 표면이 둘이다

| # | 지점 | **A. 판정 메뉴**(신설 마법사) | **B. 양도세 계산기**(넘겨받은 사실 · §155의2·3 결과 소비) |
|---|---|---|---|
| ① 폼 상태 | | 판정 메뉴 폼 타입(`Pick<TransferFormData, …>` 호환 — §5.9) | `TransferFormData`에 `importedOneHouseFacts?` · `sourceJudgmentId?` · 사실 해시 |
| ② initial | | 신설 store initial | `lib/stores/calc-wizard-store.ts:72-135` 구간 |
| ③ normalize | | 신설 | 저장 record 로드 시 ③·권리 섹션 값 → 넘겨받은 사실 **승격**(OH-21) |
| ④ API 변환 | | 신설 `lib/calc/one-house-exemption-api.ts` | `lib/calc/transfer-tax-api.ts:419-553` — 넘겨받은 사실을 엔진 입력으로 |
| ⑤ UI 위젯 | | `app/calc/one-house-exemption/` — 기존 섹션 재사용 | 읽기 전용 요약 · 불러오기 버튼 · 안내 카드(P6) |
| ⑥ 사이드바 | | 판정 요약(신설 `compute…Summary` — `useMemo` 필수) | 변경 없음 |
| ⑦ 결과 | | 판정 결과 화면(배지·특례·조건부·기한·근거) | **결과뷰 4종**에 출처 한 줄(§5.9) |
| ⑧ validation | | 신설 `lib/calc/one-house-exemption-validate.ts` | 넘겨받은 사실이 있으면 ③·권리 섹션 validate 우회 — **UI 통과↔validate 차단 모순 금지** |
| ⑨⑩ Zod enum | | 신설 route | `app/api/calc/transfer/route.ts` |
| ⑪ 자산-수준 fallback | | 해당 없음 | 동상 |
| ⑫ Zod 입력 객체 | | 신설 route — **TS 미감지** | 넘겨받은 사실 스키마 — **TS 미감지** |
| ⑬ body spread | | 신설 API 변환 — **TS 미감지** | `transfer-tax-api.ts` — **TS 미감지** |
| ⑭ Route 엔진 매핑 | | `judgeOneHouseExemption` 입력 — **Date 변환**(`date-coerce`) | `engine-input.ts` — **Date 변환** |

⚠️ ⑫⑬⑭ 누락은 TypeScript가 못 잡는다 — **침묵 stripping**으로 엔진에 값이 도달하지 않는다.
완료 보고 전 두 표면 모두 grep 자가 점검 필수. 다건 계산기 경로는 **V-12**로 별도 확인한다.

---

### 7.1 설계 통합 대조 (2026-09-18 · `plan-design-self-review-loop` STEP 10)

엔진 설계(`one-house-exemption-automation.engine.design.md`)와 UI 설계(`.ui.design.md`)를 필드 단위로 대조했다.

| 정합 축 | 결과 |
|---|---|
| 세대 입력 | ✓ 양쪽 모두 `household{isOneHousehold, marriageDate, parentalCareMergeDate, isFirstTransferredInMerge}` — 사용자 선언(Q-3′). 엔진의 최상위 중복 정의(`marriageMerge` 등)는 제거 |
| 특례 사실 | ✓ UI가 넘기는 `specialHouseExclusions`·`generalHouseGiftedFromDecedentWithin2yr`를 엔진 타입에 **추가**. 엔진의 `generalHouseHeldAtInheritance`를 UI 목록에 **추가**(입력 위치 `InheritedRightExceptionSection`) |
| 엔진 전용 필드 | ✓ `residenceTransitionAcquisitionDate`는 이월과세 경로가 채우는 **파생값** — UI 입력 아님(초안 주석 오기 정정) |
| 결과 필드 | ✓ UI가 엔진 확정본 이름으로 통일(`pending[]{id,description,deadline,legalBasis}` · `undetermined[]{id,reason}` · `residenceExemptions[]`). 판정 메뉴는 `deemedForTable2`·`surchargeDeemedBasis`를 표시하지 않는다(계산기 소비 축) |
| 명부 필수 여부 | ✓ 엔진은 명부 선택 + 간이 입력 스칼라, UI 판정 메뉴는 명부만 보낸다 |
| 전달 함수 | ✓ 「적용」(이동 없음)과 「이동」 분리 — 다건 편집 화면 보호 |
| V-13 이관 여부 | ✗ **두 설계가 반대** → **Q-7**(사용자 결정) |
| G-5 하드코딩 지점 | ✓ 양쪽 모두 6번째 지점(`RedevelopmentRightExemptionSection.tsx:52`) 확인 |

## 8. 테스트 계획

### 8.1 Pre-Do anchor (Do 진입 **전에** 작성·실행)

「현행 엔진 일치 예상」 가정 금지(`feedback_pre_anchor_verification`). 최소 4건:

0. **엔진 추출 불변 기준선(P2 착수 전)** — §3.4 anchor 전건과 전체 테스트의 결과를 **추출 전에** 기록해 둔다.
   추출 후 같은 값이 나와야 한다(OH-22). 「불변」은 부정형 단언이라 §8.2 **P-4**로 확증한다.

1. ~~`one-house-155-3-majority-share.anchor.test.ts`~~ — **불요로 종결**(설계 검토). 「현행이 최대지분자 기준인가」는 코드로 답이 나왔고
   (사용자 선언 `isLargestCoInheritedShareholder` — `transfer-inheritance-exclusion.ts:66`) 기존 `inherited-house-155-3-coinherited.anchor.test.ts`가 지킨다.
   현행이 최대지분자 기준인지 **실측**. 원안(40%)과 갈리는 지점이라 여기서 설계 환류가 일어난다.
2. `one-house-154-7-multiplier-zone.anchor.test.ts` — OH-07·OH-08.
   3배와 종전 5배가 **양도일로 갈리는지**.
3. `one-house-high-value-threshold-era.anchor.test.ts` — G-5. 경계값은 V-6ⓐ로 **확정**됐다:
   양도가 **10억**으로 ① 양도일 **2021-12-07** → 9억 초과라 **일부 과세**여야 한다 ② **2021-12-08** → 12억 이하라 **전액 비과세**
   ③ **2008-10-06** 양도가 7억 → 6억 초과 **일부 과세**. 현행 seed(12억 단일)라면 ①③이 **전액 비과세**로 나올 것이다.
   ✅ V-6ⓑ probe로 확인됐다 — 현행은 ①③ 모두 **0원**. 교정 후 기대값: ① 과세차익 **50,000,000** · 총 **5,659,500** /
   ③ 과세차익 **57,142,857**. 🔴 **「seed만 교정」 케이스를 반드시 함께 둔다** — 그것이 164,560,000으로 나오면
   안분 하드코딩이 남은 것이다(부정형 anchor의 긍정 짝, `feedback_negative_anchor_needs_positive_twin`).

### 8.2 mutation probe — **P-1은 이미 실행했다 (2026-09-18)**

| ID | 무력화 | 스코프 | 결과 |
|---|---|---|---|
| **P-1** | `MARRIAGE_MERGE_2HOUSE_BASIS`(§155⑤) · `EXEMPTION_SOLE_BASIS`(§155②) · `EXEMPTION_CO_INHERITED_BASIS`(§155③) 값을 `"MUTATED-A/B/C"`로 치환 | `__tests__/tax-engine/transfer-tax/` + `transfer/` + `__tests__/calc/` | 🔴 **774파일 7,751건 전부 통과 — 안전망 0건** |
| P-2 | `getHousingMultiplier`의 수도권 주·상·공 **3배 → 5배** | 동상 | ⏳ 미실행 |
| P-3 | §155의3 게이트에서 `priorLeaseMonths >= 18` 조건 제거 | 신규 anchor | ⏳ P3 구현 후 |
| P-4 | 추출된 `judgeOneHouseExemption`에서 §155① 분기 1줄 무력화 | §3.4 §155① anchor + OH-22 | ⏳ P2 구현 후 — 계산기·판정 메뉴 **양쪽 경로에서 모두** 실패해야 엔진이 정말 하나다 |

🔴 **P-1이 뒤집은 판정** — §2.4의 인용 오기를 「세액 영향 없음 → 소규모」로만 봤는데,
**재발 방지 장치가 전무하다**는 것이 실측으로 드러났다:

- **테스트**는 `legalBasis` 문자열을 **단언하지 않는다**(정적 grep 0건 → 실행으로 확증).
- **`verify:legal` manifest도 못 잡는다** — §154·§155가 **조문 전체 단위**로 등록돼 있어
  (`additions-transfer-decree.ts:65·76`) **항 번호(④ vs ⑤ vs ⑦) 오기는 검증 대상이 아니다**.

⇒ **항 단위 인용 오기는 현재 어떤 게이트도 잡지 못한다.** P0에서 상수화만 하면 그 상수도 똑같이
무방비다 — **상수화와 anchor를 한 PR에 묶는다**(anchor 없는 상수화는 이름만 바꾼 것이다).

⚠️ **부정형 단언에는 긍정 짝**이 필요하다(`feedback_negative_anchor_needs_positive_twin`) —
OH-11(불성립)에는 OH-12(성립)를 짝으로 둔다.
⚠️ probe는 `git checkout`으로 되돌리지 말 것(`feedback_mutation_probe_git_checkout_destroys_wip`) —
P-1은 워킹트리 사본을 스크래치패드에 떠 두고 `cp`로 복원했다(미커밋 작업 3건 보존).

⚠️ **부정형 단언에는 긍정 짝**이 필요하다(`feedback_negative_anchor_needs_positive_twin`) —
OH-11(불성립)에는 OH-12(성립)를 짝으로 둔다.
⚠️ probe는 `git checkout`으로 되돌리지 말 것(`feedback_mutation_probe_git_checkout_destroys_wip`).

### 8.3 E2E

`e2e/_helpers/tax-flow.ts` 사용. 인쇄 spec은 **「전체 선택」 먼저**.
⚠️ 컴포넌트를 렌더하는 테스트는 `.test.tsx`여야 한다(`.test.ts` = node 환경 → `document is not defined`).
⚠️ `e2e/known-failures.ts`는 **현재 0건**이다 — 새 실패를 추가하는 것은 회귀를 숨기는 것이다.

### 8.4 게이트

`npm run check:pre-pr` · pre-push 범위 자동판정 · CI 3-job(typecheck+lint / vitest 4샤드 / E2E 6샤드).
`lib/tax-engine/**` 변경이므로 pre-push는 **전체 테스트**로 판정된다(≈152초).

---

## 9. 로드맵 — PR 단위 (D-5 순서)

| Phase | 범위 | 선행 | 규모 |
|---|---|---|---|
| **P0** | ✅ **완료(2026-09-20 · §14)** — 상수 9개 신설 + `ONE_HOUSEHOLD_DEF` §152→**§152의3** 단일 소스화 · manifest 3건 등록(커버리지 100%) · §89② 항 문언 동결 · 근거 anchor 12건(뮤테이션 12/12 KILLED — **P-1이 뚫던 2건 포함**) | — | 소 |
| **P1** | ✅ **완료(2026-09-20 · §13)** — `resolveHighValueHouseThreshold(양도일)` 신설 + 판정·안분·LTHD·재개발 안분·표시 문구 전환, seed `maxExemptPrice` 제거. 🛑 **입주권 경로·UI 3곳은 이월**(§13.3 — 근거 미확보·prop drilling) | — | 소~중 |
| **P2** | ✅ **완료(2026-09-20 · §15)** — `one-house/{types,judge}.ts` 신설. 계산기가 `TransferTaxInput → OneHouseFacts → 판정입력` **왕복**을 거쳐 판정한다(사실 충분성을 매 테스트가 증명). 판정 로직 **무변경** · 세액 변동 **0**(2,089 케이스) · anchor 26건 · 뮤테이션 **34/34 KILLED** | P0·P1 | 중 |
| **P3** | ✅ **완료(2026-09-20 · §16)** — §155의2①②③ · §155의3① 판정 + 거주요건 면제 **3조문 전부**(§154①·§155⑳1호·§159의4) 연동 · manifest 2건 등록(라이브 PASS) · anchor 25건 · 뮤테이션 **20/21 KILLED**(1건은 설계상 무효과). 🛑 **겸용 경로 표2 게이트 1곳은 P4로 이월**(별도 입력 타입 — §16.5) | P2 | 중 |
| **P4** | **판정 메뉴 신설** — ⓐ 기본(아래) ⓑ **§155⑳·§89①4호 판정 이관**(Q-7 — 엔진의 판정/산식 분리 + 위젯 표시 모드, 한 PR로 분리 권장) — 4단계 마법사 · route · 이력 타입 · 조건부·기한(**날짜 표시**, Q-4) 출력(G-3) · 명부 정본(G-1) · 1세대 **사용자 선언** + 정의 안내(Q-3′) · §155의2·§155의3 입력 | P3 · 설계 문서 2종 | **대** |
| **P5** | **계산기 연결** — 「이 결과로 세액 계산」 · 「판정 불러오기」 · 재판정 · 출처 표시·staleness | P4 | 중 |
| **P6** | **계산기 정리** — ③·권리 섹션 이관 · 간이 입력 안내 · 이력 승격(OH-21) · E2E 이관(§3.4 spec) | P5 · V-11 | 중~대 |


🔴 **P6이 마지막이다.** 새 입력 경로(P4·P5)가 먼저 있어야 한다. 기존 1세대1주택 E2E(§3.4, 약 15 spec)가 ③ 섹션을
직접 조작하므로 P6에서 **판정 메뉴 경로로 옮겨 쓴다** — 지우지 않는다(`e2e/known-failures.ts` 0건 유지).
📐 P4 착수 전 `one-house-exemption-automation.engine.design.md` · `.ui.design.md`(산출물 게이트).

---

## 10. 미검증 레지스터 (V-n) — **해소 전 해당 항목 착수 금지**

| ID | 내용 | 해소 방법 |
|---|---|---|
| **V-1** | ✅ **종결(검증 불요)** — 원안 §4 「2026 세제개편안」 8개 항목은 **Q-5 결정으로 구현하지 않는다.** 참고: 현행 시행령(MST 286211, 시행 2026-07-01)에는 어느 것도 반영돼 있지 않다 | — |
| **V-2** | §155⑳ 「2025-02-28 이후 양도분 횟수제한 폐지」 — 저장소 문서가 그렇게 적었으나 **부칙 원문 미확인**. 현행 ⑳ 본문에 횟수 제한은 없고 **직전거주주택 기간분 안분**만 있다 | 해당 개정본 MST로 부칙 조회(`feedback_addenda_query_needs_amendment_mst`) |
| **V-3** | 혼인합가 10년(§155⑤) 적용 기준 — **양도일** 기준인가 **혼인일** 기준인가 | 2024-11-12 개정본 부칙 |
| **V-4** | §154①3호·§155⑧ 「부득이한 사유」 위임 규칙 조항 번호 — 원안은 소칙 §72⑦이라 한다 | 소득세법 시행규칙 실독(`feedback_korean_law_82_vs_81_2_drift`) |
| **V-5** | 겸용주택 **고가(12억 초과) 시 주택부분만 주택** 규정의 근거 조문 — §154③ 본문에는 없다 | 소법 §89·소령 §160 계열 확인 |
| **V-6** | ✅ **해소(2026-09-18) — G-5는 확정 결함이다.** ⓐ **법령**: 12억은 **2021-12-08 이후 양도하는 주택부터**(법률 제18578호 부칙 제1조3호·제7조④). 그 직전은 **소령 §156① 9억**(2008-10-07~, 대통령령 제21062호 부칙 제2조 「양도하는 분부터」), 그 전은 **6억**. 입주권은 같은 부칙 제7조⑤, 직전 값 **소령 §155⑰ 9억**. ⓑ **수치**: 과거 양도일 입력 경로가 열려 있고, 현행 엔진이 2021-12-07·2008-10-06 양도를 **전액 비과세(0원)** 로 계산함을 재현했다. 법령대로면 5,659,500원·과세차익 57,142,857원. **seed만 고치면 전액 과세**(164,560,000원)로 뒤집힌다 — §4 G-5 · 잔여 미확인: 2005-02-19 이전 주택 기준 · 2017-02-03 이전 입주권 기준 · 입주권 경로 수치 재현 · 2008년 세액(C)의 다른 시점 축 정확성 | probe는 스크래치 테스트로 실행 후 삭제, `transfer-tax-helpers.ts`는 사본 `cp`로 복원(diff 0 확인) |
| **V-7** | 다건(`MultiTransferTaxResultView.tsx`)·겸용(`MixedUseResultCard.tsx`) 결과뷰의 **현행 1세대1주택 비과세 표시 여부** — "비과세" 리터럴 0건이나 하위 컴포넌트 경유 가능성 미추적. G-3은 판정 메뉴로 갔으므로(D-1) 계산기 결과뷰에 필요한 것은 **출처 한 줄**뿐이지만, 그 한 줄도 4종 전건에 붙어야 한다(§5.9) | 코드 실측 — P5 착수 전 |
| **V-8** | ✅ **종결 — 미구현 확인**(엔진 설계 실측): §154⑫ 인용·구현 0건. §154⑧3호 통산(`consolidateResidenceMonths`, `transfer-tax-exemption-requirements.ts:301`)은 피상속인-상속인 통산이라 **별개**다. `OneHouseFacts`에 상속인별 거주기간 표현이 없어 P3·P4 범위 밖 — **별건 계획서로 분리** | 엔진 설계 V-8 |
| **V-9** | E-7의 **§155① 전입요건 폐지 시행일** — 「현행에 없음」은 실독 확인됐으나 **날짜는 미검증**. 저장소 `regulatedAreaRelaxDate`(2022-05-10)는 **처분기한 완화** 축이고(`transfer-tax-exemption-requirements.ts:525` 주석) 전입요건 폐지와 같은 개정인지 확인 안 됨. **과거 양도분 판정을 구현할 때만** 필요 | 해당 개정본 MST 부칙 조회 |
| **V-10** | **§155⑯ 5년 vs 조정대상지역 단축 기한의 우선순위** — 저장소가 이미 「명문 없음(🔶 계획서 W-4)」으로 남기고 5년이 덮는 것으로 구현했다(`transfer-tax-exemption-requirements.ts:518-521`). 이 계획서가 그 미판정을 **승계**한다 — 새로 발견한 것이 아니다 | 해석례 확인. 미해소면 현행 구현 유지 |
| **V-11** | 🟡 **부분 해소** — UI 설계 §4가 재사용 섹션 10개의 props·조문·렌더 게이트(컴포넌트 단위)와 이관 필드군을 확정했다. **남은 것**: 필드 **하나하나**의 ⓐ 판정 메뉴 입력 위치 ⓑ 전달 payload 포함 ⓒ 이력 승격 규칙(OH-21) 전수표. 컴포넌트 단위 표로는 「한 필드가 빠졌는지」를 못 잡는다 | P6 착수 전 필드 전수표 |
| **V-12** | ✅ **종결**(UI 설계 §8 · 실측): 다건 편집(`MultiTransferSteps.tsx:203` `StepEdit`)이 단건 `<TransferTaxCalculator />`를 그대로 마운트하고, 다건 store의 자산 항목이 `form: TransferFormData`를 통째로 보유한다(`multi-transfer-tax-store.ts:15`). 다건 전용 통합 코드는 필요 없다 — **단 「판정 불러오기」는 이동하지 않는 함수를 불러야 한다**(§5.3) | — |
| **V-13** | ✅ **종결 — Q-7로 분할안 채택**. §155⑳: 판정 사실 `applyException`·`scenario`·`rentalUnits[]` → 판정 메뉴 / §161 안분 입력(B시나리오 `priorResidenceTransferDate`·`standardPriceAtAcquisition`·`standardPriceAtPriorTransfer`·`standardPriceAtTransfer`) → 계산기 잔류(`lib/tax-engine/transfer-tax/rental-housing-exception/types.ts:106-126` 실측). §89①4호: 판정 사실 4필드(`RedevelopmentRightExemptionSection.tsx:156·168·179·191` onChange 실측) → 판정 메뉴 / §166 3분할 → 계산기 잔류. 두 위젯은 `AssetForm`에 묶여 있어(`Props`: `asset: AssetForm`) 판정 메뉴는 양도 대상을 `AssetForm` 호환 객체로 든다 | 설계 문서 2종 |
| **V-14** | ✅ **종결(해당 없음)** — 영 §152의3 3호 「기준 중위소득」 적용 방식은 **1세대 자동 판정을 하지 않기로 해**(Q-3′) 엔진이 쓸 일이 없다. 참고로 남긴다: KoreanLaw MCP 해석례·심판례 검색 4회 0건(2026-09-18) — 조문은 가구원 수·고시 연도·소득 기간을 정하지 않는다 | — |
| **V-15** | ✅ **종결(해당 없음)** — 영 §152의3 3호 단서의 미성년자 예외 사유 위임 규칙. Q-3′로 자동 판정을 하지 않아 불요 | — |

## 11. 사용자 결정 (Q-n)

### 11.1 결정 기록

| ID | 질문 | 결정 | 근거·영향 |
|---|---|---|---|
| **Q-1** | G-1 주택 수 이중 트랙 | ✅ 판정 메뉴에서 명부 정본, 계산기는 넘겨받은 명부로 재판정(D-3). 판정 미경유 계산기는 현행 유지 | 2026-09-18 · 판정 별도 메뉴 제안 + 권장안 승인 |
| **Q-2** | 「조건부 + 기한」 출력 | ✅ 넣는다 — **판정 메뉴에**(D-1). 계산기에는 넣지 않는다 | 동상 |
| **간이 입력** | 판정 미경유 계산기 사용자 | ✅ 간이 입력 유지(D-4) | 동상 |
| **Q-3′** | 세대 판정 깊이 | ✅ **사용자가 판정한다** — 프로그램은 1세대 성립을 판정하지 않는다. 판정 메뉴·계산기 모두 「1세대 해당」 **사용자 선언**을 받고, 판정 메뉴는 1세대 정의 안내(법 §88 6호·영 §152의3 요지)와 법조문 링크로 판단을 보조한다. ⚠️ 이 결정은 같은 날 앞선 「자동 판정 + 수동 수정」 결정을 **대체**한다 | 2026-09-18 사용자 결정. 1세대는 생계 동일·사실상 이혼 여부 등 **사실판단**이 핵심이라 자기선언이 현행과도 일관된다 |
| **Q-4** | 기한 표시 | ✅ **날짜로 표시** — 잔여일(D-day)은 쓰지 않는다 | 2026-09-18 사용자 결정. 결과 화면·인쇄물이 날짜와 무관하게 같은 뜻을 유지한다 |
| **Q-7** | §155⑳·§89①4호 판정을 판정 메뉴로 옮길 것인가 | ✅ **P4에서 함께 옮긴다** — **판정 사실만** 판정 메뉴로(§155⑳: `applyException`·`scenario`·`rentalUnits[]` / §89①4호: `redevExemptionEligibleAtApproval`·`redevPriorHouseHoldingMonths`·`redevPriorHouseResidenceMonths`·`redevOtherHouseAcquisitionDate`). **세액 산식 입력은 계산기에 남긴다**(§161 안분: `priorResidenceTransferDate`·`standardPriceAt*` 3필드 / §166 3분할) | 2026-09-18 사용자 결정(엔진 설계 분할안 채택). 판정 메뉴가 1세대1주택 비과세 판정 **전체**에 답한다(D-1 취지) |
| **Q-5** | 원안 §4 2026 세제개편안 | ✅ **반영하지 않는다** — 현행 시행 법령만 구현 | 2026-09-18 사용자 결정. V-1 검증 불요로 종결 |

### 11.2 잔여 결정 — **없음**

| ID | 질문 | 선택지 | 필요 시점 |
|---|---|---|---|
| **Q-6** | ~~수동 수정(Q-3′)을 다른 자동 판정 항목에도 열 것인가~~ | ✅ **소멸** — Q-3′가 「사용자 판정」으로 바뀌어 수동 수정 메커니즘 자체가 없다. 다른 자동 판정 항목(주택 수 제외·특례 적용)은 **현행 계산기처럼 엔진 판정 그대로** 쓴다. 필요하면 별도로 다시 제기한다 | — |

---

## 12. 원안에서 그대로 가져온 좋은 것

- **판정 도구라는 형태 자체**(원안 §1.2·§6) — 처음 이식판(v2.0)은 이것을 「계산기 안의 갭 해소」로 좁혔다.
  v2.1에서 **판정 메뉴**로 되살렸다(D-1). 원안 §6.1의 4단계 입력 흐름이 판정 메뉴 단계 구성의 원형이다(§5.2).

- **「취득 당시」 기준** 강조(§2.1) — 거주요건은 양도 시점이 아니라 **취득 당시 조정대상지역 지정 여부**로
  갈린다. 저장소가 이미 그렇게 판정하나, 결과 화면에 **그 사실을 명시**하는 것은 개선점.
- **「판정 보류」 하드컷**(§8) — 조문만으로 결론이 나지 않으면 억측하지 않는다.
  저장소 `undetermined` 3갈래와 같은 철학. 신규 조문에도 동일 적용.
- **미등기양도 하드컷**(3C.3) — 판정 **첫 단계**에서 끊는 순서가 옳다(저장소도 그렇다).
  ⚠️ 인용은 역할이 갈린다: **§91**(비과세·감면 배제) · **§104①10호**(70% 세율 — `legal-codes/transfer.ts:71`) ·
  **§104③**(미등기양도자산의 정의 — `legal-codes/transfer-nbl.ts:257`). 원안은 70%의 근거를 §104③으로 적었다.
- **주택 개념 판정 표**(3C.1) — 다가구·다세대·오피스텔·겸용. 원안의 공백은 **근거 조문 미기재**이고,
  이 저장소의 공백은 **§155⑮ 자체의 부재**다(M-10). 「좋은 것」이 아니라 **갭 발견 단서**로 재분류했다.
  오피스텔 주거용 판정은 사실판단 영역이라 자기선언이 정답일 수 있다.
- **케이스 6종 시나리오**(§6.3) — E2E 시드로 재사용 가능(단 B 케이스는 V-1 미해소로 보류).
- **특례 중첩 판정표**(§8 리스크) — 「대체주택 + 분양권」처럼 중첩 시 결론이 갈리는 조합.
  저장소 §89② 모듈이 이미 16항 조합을 다루므로 **그 표를 확장**하는 형태가 맞다.


---

## 13. P1 실행 기록 (2026-09-20)

> 커밋 기준: master `0b19846b`. 계획서 §4 G-5 · 엔진 설계 「계산 알고리즘」 1을 구현한 결과다.
> 아래 수치·file:line은 전부 실측이다(RED 재현 → 구현 → GREEN → 뮤테이션).

### 13.1 법령 재확인 — 경계 두 개를 DRF로 직접 조회

계획서 V-6ⓐ의 연혁을 **법제처 DRF `target=eflaw` 시행일자 목록**으로 다시 확인했다.

| 경계 | 확인 결과 |
|---|---|
| 9억 (소령 §156①) | **대통령령 제21062호 — 공포·시행 모두 2008-10-07** (MST 89130). 직전 시행본은 2008-09-22(제21025호)이고 **2008-10-06에 시행된 개정은 없다** ⇒ 6억은 2008-10-06까지 |
| 12억 (법 §89①3호 괄호) | **법률 제18578호 — 공포·시행 모두 2021-12-08** (MST 237497) |

⇒ 구현: `transferDate >= 2021-12-08 → 12억` · `>= 2008-10-07 → 9억` · 그 전 **6억**
(`lib/tax-engine/one-house/threshold.ts`). 2005-02-19 이전 미확인은 **그대로 남는다**(V-6 잔여).

🔴 **형제 경로의 하루 오차를 발견했다 — 이번 범위 밖, 별건.**
`lib/tax-engine/transfer-reductions/new-99-3.ts:251` `isHighValueHouseUnder993`는 「`baseDate <= 2008-10-05` → 6억」
이라 적어 **2008-10-06을 9억 구간으로** 넣는다(주석도 「2008.10.6~2021.12.7: 9억」). 위 실측과 하루 어긋난다.
다만 그 함수의 기준일은 **양도일이 아니라 계약일·사용승인일**(`resolveNew99BaseDate`)이고 축이 조특법
§99의3이라, 그 축의 적용 부칙을 실독하기 전에는 고치지 않는다. **별도 조사 항목으로 남긴다.**

### 13.2 이번에 옮긴 곳 — 「판정과 그 판정을 소비하는 안분」을 짝으로

계획서 G-5가 열거한 5곳은 **불완전했다**(전수 grep 결과 엔진 7곳 + UI 3곳). 그중 이번에 전환한 것:

| # | 지점 | 성격 |
|---|---|---|
| 1 | `transfer-tax-exemption.ts` `checkExemptionCore` 7곳 | **판정** — `rule.maxExemptPrice` → 시점 함수 |
| 2 | `transfer-tax-helpers.ts` `calcOneHouseProration` | **안분**(주 경로) — `transferDate` 파라미터 신설 |
| 3 | `transfer-tax-lthd.ts:370` | 토지·건물 **분리 소유 LTHD 안분** |
| 4 | `transfer-tax-redevelopment-steps.ts` | 재개발 **고가 판정** + 산출근거 문구 |
| 5 | `transfer-tax-redevelopment-lthd.ts` `applyHighValueAllocation` | 재개발 **안분** — `transferDate` 파라미터 신설 |
| 6 | `transfer-tax-taxable-gain.ts` | **표시** — 「12억」 리터럴 → 실제 쓴 값 |
| 7 | seed 2곳 + `rate-table.schema.ts` | `maxExemptPrice` **제거**(읽는 곳이 0이 됐다) |

🔴 **4·5를 함께 옮겨야 하는 이유(실측)**: 재개발 APT 경로는 고가 판정을 메인 판정에서 받아 오고
(`steps.ts` `isHighValue = aptExemption.isPartialExempt`) 안분은 따로 한다. 판정만 옮기면
`taxableRatio = (10억 − 12억) / 10억 = −0.2` — **과세대상 양도차익이 음수**가 된다.
같은 함정이 부담부증여 축에서 이미 실측돼 있었다(−471,250,000).

🔴 **seed를 지운 이유**: 다건 route는 **과세기간 말일**로 세율 행을 고르므로(`multi/route.ts`)
규칙 행으로는 자산별 양도일을 표현할 수 없다. 값을 남겨 두면 「숫자를 고쳐도 아무 일도 안 일어나는」
함정이 된다.

### 13.3 이번에 **옮기지 않은** 곳 — 이유를 붙여 남긴다

| 지점 | 남긴 이유 |
|---|---|
| `transfer-tax-redevelopment-transforms.ts` `applyOneRightExemption` (입주권 §89①4호) | 2021-12-07까지 금액이 시행령에 위임돼 있었는데 **그 위임 조항의 번호·연혁을 실독하지 못했다**. 근거 없이 낮은 기준을 소급하면 납세자에게 불리한 방향으로 틀린다 ⇒ **P3** |
| 같은 파일 `applySettlementExemption` | 비교 대상이 양도가액이 아니라 **관리처분계획인가일 현재 권리가액**(서면2016-법령해석재산-2705). 기준 시점이 양도일인지 인가일인지 미확정 |
| `transfer-tax/rental-housing-exception/` 2곳 (§155⑳) | 모듈 **내부에서 판정·안분이 자기정합**이고 메인 분기를 대체한다 ⇒ 새 불일치가 생기지 않는다. 전환하려면 4단 전파 + 테스트 호출부 40곳 수정 ⇒ **별도 PR** |
| `burdened-gift-eligibility.ts:19` | `void HIGH_PRICE_THRESHOLD_KRW`로 **비교에 쓰이지 않는 死상수**(F-1에서 차단 해제되며 남은 잔재). 전환해도 계산이 바뀌지 않는다 |
| `transfer-tax-mixed-use-helpers.ts:504` (겸용) | **구별력 0**(뮤테이션 실측). `calcMixedUseTransferTax`가 **2022-01-01 이전 양도를 거부**하므로 이 경로의 양도일은 항상 12억 시대다. 리터럴은 두되 **게이트가 완화되면 함께 바꿔야 한다**는 경고를 코드 주석에 남겼다 |
| UI 3곳 (`RedevelopmentRightExemptionSection.tsx:52` · `RedevelopmentResidenceSplitSection.tsx:35` · `SettlementExemptionGuideCard.tsx:24`) | 전부 **입주권·청산금 안내 문구**이고 세액 미영향. 양도일이 컴포넌트·상위 블록 어디에도 없어 **2계층 prop drilling**이 필요하다 ⇒ 입주권 축(P3)과 함께 |

### 13.4 anchor·뮤테이션

`__tests__/tax-engine/transfer/one-house-high-value-threshold-era.anchor.test.ts` **19건** —
순수 함수 경계 ±1일 3건 · 엔진 A/B/C/D/E 7건 · 표시 축 3건 · 재개발 짝 3건 · 분리 소유 3건.

**뮤테이션 13종 전부 KILLED**(생존 0). 특히:
- 「판정만 낮추고 안분은 12억」 조합 → G5-A2가 죽인다(계획서가 경고한 함정의 긍정 짝)
- 경계 `>=`를 `>`로 → G5-F2·F3이 죽인다
- 재개발 안분에 현재 날짜를 넘김 → G5-R1이 죽인다
- 분리 소유 LTHD만 12억으로 되돌림 → 2008-10-06 **세액 42,706,714 → 0**, G5-S1이 죽인다

### 13.5 세액 영향

| 케이스 | 종전 | 이후 |
|---|---|---|
| 2021-12-07 · 10억 (취득 5억) | 전액 비과세 **0** | 과세차익 50,000,000 |
| 2008-10-06 · 7억 (취득 3억) | 전액 비과세 **0** | 과세차익 57,142,857 |
| 2021-12-08 · 10억 (대조) | 0 | **0 (불변)** |
| 2026-02-16 · 14억 (현행) | 과세차익 128,571,428 | **불변** |

현행(2021-12-08 이후) 양도는 **전 경로에서 값이 바뀌지 않는다** — 전체 vitest 회귀 0건으로 확인.


---

## 14. P0 실행 기록 (2026-09-20)

> 기준 커밋: master `8545d234`(P1 머지 직후). file:line은 전부 실측이다.

### 14.1 계획서 기재 정정 2건

| 계획서 | 실측 |
|---|---|
| §2.4 「`multi-house-surcharge-exclusion.ts:289` 주석이 동거봉양을 **§155⑦**이라 쓴다」 | 🔴 **이미 해소돼 있었다** — `5dbb1480`(D9, 합가 중과배제를 §167의10①15호 2요소로)에서 고쳐졌다. 현재 그 파일에 `§155 ⑦`은 **0건**. 미결로 재기재 금지 |
| §3.5 좌표 (`RIGHT_EXEMPT transfer-house.ts:244` 등 6건) | 전부 드리프트했다 — `:244`→`:298` · §155①`:66`→`:74` · §155②③`:89-90`→`:137-138` · §155⑤`:62`→`:70` · §155⑦`:70`→`:78` · §155⑳`:115`→`:163`. 계획서 좌표를 그대로 쓰면 안 된다 |

### 14.2 법령 재확인 (법제처 DRF 실독)

| 인용 | 조문 제목 | 비고 |
|---|---|---|
| 소득세법 시행령 **§152** | **「환지등의 정의」** | 1세대 범위가 **아니다** ⇒ 종전 상수가 오기였음 확인 |
| 소득세법 시행령 **§152의3** | **「1세대의 범위」** | 정의는 법 §88 6호, 소득 기준은 칙 §70 |
| 소득세법 §89② | 비과세 양도소득 | 「주택과 조합원입주권 또는 분양권을 보유하다가 그 주택을 양도하는 경우 … 제1항에도 불구하고 같은 항 제3호를 적용하지 아니한다」 |
| 영 §155④ / ⑤ / ⑥1호 / ⑦ / ⑧ | 동거봉양 / 혼인 / 국가유산 3법 / **농어촌** / 부득이 수도권 밖 | ⑦이 농어촌임을 확인 — 합가와 무관 |
| 영 §156의2 | 주택과 **조합원입주권**을 소유한 경우 1세대1주택의 특례 | |
| 영 §156의3 | 주택과 **분양권**을 소유한 경우 1세대 1주택의 특례 | 제목의 「1세대 1주택」은 §156의2와 달리 **띄어쓰기가 있다**(법문 그대로) |

### 14.3 한 것

**① 상수 신설·정정** (`legal-codes/transfer.ts` · `transfer-house.ts`)
- 신설 9개: `RIGHT_HOLDING_EXCLUSION`(§89②) · `PARENTAL_CARE_MERGE_EXEMPT`(§155④) ·
  `MARRIAGE_MERGE_EXEMPT`(§155⑤) · `CULTURAL_HERITAGE_HOUSE`(§155⑥1호) ·
  `UNAVOIDABLE_OUTSIDE_CAPITAL`(§155⑧) · `RIGHT_ONE_HOUSE_SPECIAL`(§156의2) ·
  `PRESALE_ONE_HOUSE_SPECIAL`(§156의3) + 동치 비교용 3개(아래 ②)
- `ONE_HOUSEHOLD_DEF`를 §152 → **§152의3**으로 고치고, 두 파일이 각자 들고 있던 것을
  `ONE_HOUSEHOLD_DEF_CITATION` **한 벌**로 묶었다(같은 오기가 두 곳에 복제돼 있었다).
- `shortArticle()` — 라벨이 조문 번호를 리터럴로 다시 적지 않게 상수에서 파생시킨다.

**② 🔴 `===` 문자열 동치로 묶인 셋을 상수로** — 가장 취약한 지점이었다.
`transfer-tax-89-2-exclusion.ts`가 `exception` 값을 **생산**하고 `transfer-tax.ts`가 `===`로
**소비**해 §156의2⑬ 사후관리 경고를 띄우는데, 양쪽이 각자 리터럴을 들고 있어
**항 앞 공백 한 칸만 달라져도 경고가 조용히 사라졌다**. 뮤테이션 N7이 그것을 잡는다.

**③ manifest 등록 3건** — `소득세법 시행령 §152의3` · `§156의2` · `§156의3`.
커버리지 **99.1% → 100%**(미검증 3 → 0). 셋 다 `npm run verify:legal` **PASS**(법제처 실측).
§155④⑥⑧·§89②는 비교 단위가 **조**라 이미 등록된 §155·§89 키에 흡수된다 ⇒ 별도 규칙 불가.

**③′ 부수 — 심볼 목록 가드** `legal-codes-namespace-export.test.ts`가 모듈별 export 심볼을
**전량 고정**하고 있어(`NS-META-2`), 신설한 `shortArticle`·`ONE_HOUSEHOLD_DEF_CITATION` 2개를
표에 반영했다. 전체 테스트에서 이 1건만 빨개졌고 다른 회귀는 없었다.

**④ §89② 항 문언 동결** — 조 단위 커버리지가 항을 못 보므로, §89 규칙의 키워드에
「조합원입주권 또는 분양권을 보유하다가 그 주택을 양도하는 경우」·
「제1항에도 불구하고 같은 항 제3호를 적용하지 아니한다」를 넣고
`legal-verification-coverage-complete.test.ts`의 `REQUIRED` 블록에서 **동결**했다.

### 14.4 anchor — P-1이 뚫던 자리를 막았다

`__tests__/tax-engine/transfer/one-house-citation-basis.anchor.test.ts` **12건**:
상수가 가리키는 조문 고정(6) + 엔진이 그 조문을 실제로 내는지(5) + P-1 대상 4상수 값 고정(1).

**뮤테이션 12종 전부 KILLED**(생존 0):

| ID | 무력화 | 결과 |
|---|---|---|
| N1 | §152의3 → §152 되돌림 | KILLED |
| N2 | 동거봉양 → §155⑦ (**원래 오기 재현**) | KILLED |
| N3 | 동거봉양 ↔ 혼인 항 뒤바꿈 | KILLED |
| N4 | 문화유산 1호 → 2호(삭제된 호) | KILLED |
| N5 | 부득이 → §155⑦ | KILLED |
| N6 | 입주권 ↔ 분양권 조문 뒤바꿈 | KILLED |
| N7 | 동치 비교 상수의 **항 앞 공백 제거** | KILLED |
| N8 | §89② 감시 키워드 1건 제거 | KILLED |
| N9 | §156의2 manifest citation 훼손 | KILLED |
| **N10** | **P-1 재현** — `MARRIAGE_MERGE_2HOUSE_BASIS` → `"MUTATED-A"` | **KILLED** |
| **N11** | **P-1 재현** — `EXEMPTION_SOLE_BASIS` → `"MUTATED-B"` | **KILLED** |
| N12 | 엔진 배선 — 문화유산 라벨을 부득이 상수로 | KILLED |

⇒ §8.2 P-1의 「안전망 0건」은 **해소됐다**. 다만 이 anchor가 덮는 것은 **위 상수들**이지
`legal-codes` 전체가 아니다 — 다른 축의 근거 문자열은 여전히 무방비일 수 있다.

### 14.5 남은 것 (P0 범위 밖)

- §156의2·§156의3의 **항 단위 리터럴이 아직 많다** — `transfer-tax-89-2-exclusion.ts`에만
  15개 이상(③④⑤⑥⑦⑧⑨⑩⑪⑬⑮…). 이번에는 **`===` 비교에 참여하는 3개만** 상수화했다.
  나머지는 생산 1곳·소비 0곳이라 동치 붕괴 위험이 없어 남겼다.
- UI `LawArticleModal`의 `legalBasis` prop 값이 **조문 조회 키**다(4곳) — 문자열 형식을
  바꾸면 모달 조회가 깨진다. 이번 상수화는 형식을 **보존**했다.
- 커버리지 테스트 주석의 모수 숫자가 드리프트해 있었다(323→**336**, 112→**119**) — 실측값으로 갱신.

---

## 15. P2 실행 기록 (2026-09-20)

**PR**: 판정 엔진 추출 — `lib/tax-engine/one-house/`. **세액 불변 리팩터**(판정 로직 무변경).

### 15.1 무엇을 만들었나

| 파일 | 역할 |
|---|---|
| `one-house/types.ts` | `OneHouseJudgeInput`(판정 서브트리가 읽는 필드 **전수**) · `OneHouseFacts` · `OneHouseSale` · `OneHouseJudgment` |
| `one-house/judge.ts` | `judgeOneHouseExemption` (판정 메뉴·계산기 **공통 진입점**) · `toOneHouseJudgeInput` · `extractOneHouseFacts` · `extractOneHouseSale` |
| `transfer-tax.ts` | 호출부 **2곳**(일반 STEP 1 · 재개발 apt 분기)이 어댑터 경유로 전환 |
| `transfer-tax-exemption.ts` | `checkExemption`·`checkExemptionCore` 매개변수를 `OneHouseJudgeInput`으로 **narrowing**(타입 전용) |

### 15.2 read-set은 추측이 아니라 **컴파일러**가 열거했다

설계서는 `OneHouseFacts` 목록을 손으로 적어 두었다. 그 목록이 맞는지 확인하는 방법으로
`checkExemption`의 매개변수를 `Pick<TransferTaxInput, …>`으로 좁히고 `tsc`가 조용해질 때까지
채웠다(기존 `ExemptionReqInput`·`Article89Clause2Input`과 같은 패턴).

🔴 **결과: 설계 초안 목록은 판정에 필요한 필드를 10개 빠뜨리고 있었다.**

`acquisitionDate` · `acquisitionCause` · `isRegulatedArea` · `regionCode` ·
`decedentSameHouseholdBeforeInheritance` · `decedentCohabitationResidenceMonths` ·
`decedentCohabitationHoldingStartDate` · `nonHousingToHousingConversion` ·
`oneHouseUnitRole` · `appurtenantHouseVerdict`.

그대로 P4 판정 메뉴를 만들었다면 **보유기간·거주요건·§155① 조정지역 기한·부수토지 판정이
입력 없이** 돌아 계산기와 다른 답을 냈을 것이다. 세액이 아니라 **판정 자체**가 갈리는 축이다.

또한 `isUnregistered`·`householdHousingCount`·`isRegulatedArea`·`wasRegulatedAtAcquisition`은
엔진에서 **필수**라 사실 타입에서도 필수로 두었다 — optional로 두면 어댑터가 `?? false`·`?? 0`으로
채우게 되고, 그것은 CLAUDE.md가 금지한 **묵시 폴백**이다(판정이 조용히 달라진다).
⇒ P4 판정 메뉴는 주택 수를 **명부에서 직접 도출해** 채워야 한다(G-1 「명부가 정본」의 구체화).

### 15.3 계산기도 **왕복**시켰다 — 이 PR의 핵심 결정

계산기는 이미 `TransferTaxInput`을 들고 있어 `checkExemption`을 그냥 부르면 된다. 그러지 않고
`TransferTaxInput → OneHouseFacts → 판정입력`으로 **분해했다 다시 조립**하게 했다.

그렇게 하지 않으면 「판정 메뉴가 넘기는 **사실만으로** 계산기와 같은 판정이 나오는가」가
**P4에서 처음** 검증된다. 왕복시키면 사실 타입이 무엇을 빠뜨리든 **기존 anchor 8,141건 앞에서**
즉시 깨진다. 비용은 객체 2개, 얻는 것은 D-1(엔진은 하나)의 **상시 증명**이다.

### 15.4 불변 증명

| 계측 | 결과 |
|---|---|
| 조합 스윕 스냅샷(판정·세액·경고) | **2,089 케이스 · 차이 0** — 추출 전(HEAD) ↔ 추출 후 |
| 양도세 관련 테스트 | 806 파일 8,141건 통과 |
| 신규 anchor `one-house-judge-extraction.anchor.test.ts` | **26건** |
| 뮤테이션 | **34/34 KILLED · 생존 0** (신규 anchor **단독**으로 전건 검출) |
| 세액 변동 | **0** |

스냅샷 probe는 **일회용**이라 커밋하지 않았다(2,089건 고정은 유지 비용만 크다). 대신 그것이
잡던 축을 전부 anchor로 옮기고, **anchor 단독으로** 같은 34건을 다시 죽이는지 확인했다.

### 15.5 구별력 0이었던 계측 — 세 번 고쳤다

「차이 0」은 **안전하다는 뜻이 아니라 계측이 죽었다는 뜻일 수 있다**
(`feedback_mutation_zero_discrimination_is_not_proof`). 실제로 세 번 겪었다.

| 생존 | 원인 | 조치 |
|---|---|---|
| 혼인↔동거봉양 뒤바꿈 | 합가 의제는 「2주택 + 합가일 + **선양도**」 조건 **셋**인데 스윕이 2축까지만 교차 | 3축 스윕 + 합가 명시 시나리오 |
| `residenceTransitionAcquisitionDate` · `acquisitionCause` | 「취득시 조정지역 + 거주 부족」이라는 **전제 두 축**이 서야 판정을 가른다 | 거주요건 전용 시나리오 + 음성 짝 |
| §89② 예외 4종 | 예외 사실을 버리면 `excluded`가 아니라 **`undetermined`(종전 동작 유지)** 로 가서 **세액이 안 변한다** | 관측 지점을 세액 → **고지가 가리키는 조문**으로 |

⇒ 마지막 것은 일반화해 둘 만하다: **「종전 동작 유지」로 처리하는 축은 세액으로 관측되지 않는다.**
그 축의 anchor는 반드시 경고·고지 문자열을 봐야 한다.

### 15.6 설계서와 달리 한 것 — `highValueThreshold`를 내보내지 않는다

설계서는 `OneHouseJudgment.highValueThreshold`를 두라고 적었다. 넣어 두고 뮤테이션을 돌리니
**12억으로 고정해도 2,089 케이스 전건이 통과**했다 — 읽는 곳이 없다는 뜻이다. 실제 소비자
(안분·장특 분리안분·재개발)는 전부 P1이 만든 단일 소스 `resolveHighValueHouseThreshold(양도일)`를
**직접** 부른다. 판정 결과로 다시 내보내면 같은 값의 **두 번째 경로**가 생기고, 그 둘이 어긋나도
아무 테스트가 울지 않는다 — P1이 없앤 바로 그 구조다. ⇒ **필드를 제거**했다.

같은 이유로 `pending[]`·`undetermined[]`·`appliedExceptions[]`·`houseCount`도 지금은 두지 않는다.
빈 배열로 내보내면 「없음」과 「아직 안 만듦」이 구별되지 않는다 — P4에서 채운다.

### 15.7 재발 방지 — 컴파일러가 지킨다

| 가드 | 무엇을 막나 |
|---|---|
| `checkExemption(input: OneHouseJudgeInput)` | 판정 서브트리가 **목록에 없는 필드**를 읽으면 `tsc` 실패 |
| `judge.ts` 키 커버리지 (`satisfies` + `Exclude<…> extends never`) | 목록에 필드가 늘었는데 **어댑터가 안 채우면** `tsc` 실패 |
| 같은 가드의 **중첩 전용 항** | `household` 안의 필드 누락(상위 가드는 중첩을 못 본다) |
| anchor의 `JUDGE_INPUT_KEYS` 동결 + 양방향 타입 가드 | 목록이 **늘거나 줄면** 테스트 파일에서 컴파일 실패 — P4 화면까지 함께 손보라는 신호 |

전부 optional 필드라 **타입 주석으로는 못 잡는다** — `satisfies`여야 한다
(`feedback_satisfies_preserves_keys_annotation_kills_guard`). 가드가 실제로 무는지
**필드 3개를 지워 확인**했고, 셋 다 **가드 줄에서** 잡혔다.

### 15.8 남은 것 (P2 범위 밖)

- **판정 로직은 아직 `transfer-tax-exemption.ts`에 있다.** `judge.ts`는 어댑터다 —
  방향 전환(그 파일이 정본이 되고 `checkExemption`이 얇은 래퍼가 되는 것)은 설계서대로 **P4 착수 시점**이다.
- **P-4의 「양쪽 경로에서 모두 실패」는 절반만 실행했다** — 판정 메뉴 경로가 아직 없다.
  §155① 분기 무력화(M10)가 계산기 경로에서 죽는 것은 확인했고, 두 번째 경로는 P4에서 같은 뮤테이션을 다시 돌린다.
- `transfer-tax.ts` **777줄**(+7). 분리 트리거 800 미만이라 손대지 않았다 —
  이 PR은 「세액 불변」이 전부라 diff에 구조 변경을 섞지 않는 편이 검토에 낫다. P3에서 다시 열 때 판단할 것.
- 다건(`multi/route.ts`)·겸용 경로는 단건 엔진을 그대로 호출하므로 자동으로 새 경로를 탄다(전건 통과로 확인).

---

## 16. P3 실행 기록 (2026-09-20)

**PR**: §155의2(장기저당담보) · §155의3(상생임대) — G-2 미구현 2건 해소. 엔진·anchor만(화면은 P4).

### 16.1 법령 실독으로 정정한 것 — 설계서가 틀렸던 3건

법제처 DRF로 두 조문 본문·부칙·구 시행본을 직접 읽었다(MST 286211 외). 설계서 요약을 그대로
구현했다면 셋 다 틀렸다.

| # | 설계서 | 실제 법문 | 영향 |
|---|---|---|---|
| ① | §155의2②면 **장특 표2** | ②가 면제하는 것은 「**제154조제1항**을 적용하되 … 거주기간의 제한」뿐. §159의4는 면제 대상에 **없다** | 거주 2년 미달 의제 주택에 표2를 줬을 것 — **과소 과세** |
| ② | §155의3 = 거주요건 면제 | **2022-08-02 이전 시행본은 「1년간 실제 거주한 것으로 본다」(가산)** 이고 요건도 9억·1주택이 더 있었다 | 시점 분기 필요 여부를 판단할 근거가 없었다 |
| ③ | (언급 없음) | §155의2 적용 개시 = **2005년 과세기간**(대통령령 제18705호 부칙 §11) | 2004년 이전 양도에 특례를 줬을 것 |

②는 **부칙으로 해소**됐다 — 대통령령 제32830호 부칙 제2조가 「제155조의3제1항 … 의 개정규정은
**2021년 12월 20일부터 이 영 시행일 전까지 상생임대차계약을 체결한 주택에 대해서도 적용**한다」고
정해, 개정 전 문언이 규율하는 사건이 **존재하지 않는다**(상생임대차 2년 임대 요건 때문에 가장 이른
충족 시점이 2023년이다). ⇒ **시점 분기를 만들지 않는다**. 추측이 아니라 부칙 실독의 결론이다.

§155의2는 2025-12-30 개정이 붙어 있어 구 시행본(MST 279961)과 대조했다 — **부처명만 바뀌었고**
(기획재정부령→재정경제부령) 60세·10년 요건은 그대로였다. ⇒ 여기도 시점 분기 불요.

### 16.2 면제 대상이 **세 조문**이다 — 하나라도 빠지면 과대 과세

§155의3①의 문언은 「**제154조제1항, 제155조제20항제1호 및 제159조의4**를 적용할 때 … 거주기간의
제한을 받지 않는다」다. 로드맵 줄에는 §159의4만 적혀 있었지만, 둘만 구현하면 **법이 명시적으로
상정한 조합**(장기임대주택 보유 + 임대해 온 거주주택 양도)에서 과대 과세가 된다. 셋 다 배선했다.

| 면제 대상 | 배선 지점 | 관측(anchor) |
|---|---|---|
| §154① | `meetsOneHouseResidenceRequirement` 공통 술어 | 비과세 여부 |
| §159의4 | `meetsTable2ResidenceRequirement` **신설 단일 술어** | 장특 표1(18%) ↔ 표2(36%) |
| §155⑳1호 | `checkEligibility`(rental-housing-exception) | 「거주기간 2년 미충족」 사유 유무 |

🔴 **표2 게이트는 단건 경로만 5곳에 흩어져 있었다**(본체·컴패니언 부수토지·§95⑤ 용도변경·
§98의2 특칙·표시 문구). 한 곳만 고치면 「공제율은 표2인데 문구는 표1」 같은 축 어긋남이 난다
(`feedback_enumerate_all_write_sites_before_fixing`). 전수를 한 술어로 묶었다.

### 16.3 §155의2는 공통 술어에 넣지 않는다 — 경로 한정

§155의3①은 괄호가 「제155조, 제155조의2, 제156조의2, 제156조의3 및 그 밖의 법령에 따라
1세대1주택으로 **보는 경우를 포함**」이라 **의제 1주택 세대에도** 미친다 ⇒ 공통 술어.

반면 §155의2는 ①이 「국내에 **1주택**을 소유한 1세대」, ②가 「**동거봉양** 합가」로 한정돼 있다.
공통 술어에 넣으면 **일시적 2주택(§155①)·혼인 합가(§155⑤)에도 거주면제가 샌다** — 법 근거 없는
유리 적용이다. ⇒ 호출부 **두 곳**(1주택 E-4 · 신설 E-3.9 분기)에서만 주입한다.
누수 자체를 뮤테이션(N18)으로 만들어 anchor가 잡는지 확인했다.

### 16.4 검증

| 계측 | 결과 |
|---|---|
| 법령 | 두 조문 본문·부칙·구 시행본 **DRF 직접 조회**(MCP 아님) |
| manifest | §155의2·§155의3 등록 · `verify:legal` **캐시 무효화 후 370/370 PASS** |
| anchor | 신규 **25건**(요건 경계 ±1 · 긍정·음성 짝 · 경로 누수 3건) |
| 뮤테이션 | **20/21 KILLED**. 생존 1건은 **설계상 무효과** — 전액 비과세 분기의 표2 echo는 상위가 조기 반환해 장특을 계산하지 않는다(부분과세 분기의 같은 필드는 KILLED) |
| 전체 | 2,155 파일 / 22,491건 통과 · lint 0 errors |
| 기존 세액 | **변동 0** — 두 특례는 입력이 있을 때만 발동한다 |

🔴 **관측 지점을 먼저 정한 것이 이 작업의 핵심**이었다. 둘 다 「거주요건 **면제**」라 시료를 잘못
잡으면 요건을 무력화해도 세액이 그대로다. 실제로 초안 anchor 3건이 **구별력 0**이었다:
취득일이 2017-08-03(`prePolicyDate`)보다 앞서면 §154① 경과규정이 **거주요건을 이미 면제**해
특례가 아무것도 바꾸지 못한다. 부칙(2005) 테스트는 그래서 관측 지점을 ②의 **의제** 축으로 옮겼다.

### 16.5 남은 것 (P3 범위 밖)

- 🛑 **겸용주택 경로의 표2 게이트 1곳**(`transfer-tax-mixed-use-helpers.ts`)은 §155의3 면제를
  반영하지 않는다. `MixedUseAsset`이라는 **별도 입력 타입**을 쓰기 때문이다. P3에는 §155의3의
  입력 경로 자체가 없으므로(화면은 P4) 지금 타입만 늘리면 도달하지 않는 배선이 생긴다
  (`feedback_api_trigger_without_input_path_is_noop`). ⇒ **P4에서 전달 경로와 함께 닫는다.**
  코드 해당 줄에 같은 내용을 주석으로 남겼다.
- **14 동기화 지점은 손대지 않았다** — ⑨~⑭ Zod·route·API 변환과 ①~⑧ 화면은 전부 P4·P5다.
  지금 두 필드는 **엔진 입력에만** 있고 계산기 화면에서 도달할 수 없다(의도된 상태).
- §155의3③(임대기간 월력 계산·1개월 미만 절상)·④(임차인 사정 중도해지 시 기간 합산)는
  **엔진이 계산하지 않는다** — 개월 수를 이미 그 규칙을 반영한 값으로 받는다. P4 입력 화면이
  날짜에서 개월을 도출한다면 그 화면이 ③④를 적용해야 한다. 타입 JSDoc에 명시했다.
- §155의2④(특례적용신고서 제출)는 절차 요건이라 판정에 넣지 않았다.

---

## 부록. 원안(v1.1) → 본서(v2.0) 변경 이력

| 구분 | 내용 |
|---|---|
| **정정** | 법령 오기 **9건**(E-1~E-9) — §155④⑤ 뒤바뀜 · §155③ 40% 기준 부존재 · §155② 기한 부존재 · §154⑦ 배율(현행 3·5·10 / 원안은 종전 규정) · §154①2호 거주요건 · 공공매입임대 · §155① 전입요건 폐지 · 국가유산 3법 · §99의4④ |
| **삭제** | 원안 3.3절 **전체**(종합부동산세 축 혼입) · §5.5 기술 선정 · §7.2~7.3 리소스·예산 · §7.4 상담 KPI · §8.1 거버넌스 조직 · 개인정보(주민등록번호) 설계 · §5.6 외부 API 중 이미 구현된 5종(등기·주민등록 2종은 **사유를 남겨** 범위 밖으로) |
| **보완** | 누락 조문 **10건**(M-1~M-10) — §89①4호 · §155⑦ · §155⑯ · §155⑱ · §156의2⑧⑨ · §155의2② · §154⑫ · §154①5호 · §155의3①2호 · **§155⑮ 다가구** |
| **대체** | 아키텍처 전면(§1.1) · JSON 규칙 레지스트리 → 현행 하이브리드(분기 + DB 임계값) · DB 파라미터 → 역사 상수 시점 분기(§5.7) · 조정지역 DB → 정적 단일 소스 |
| **신설** | 현황 실측 표(§3, file:line) · 기존 anchor·E2E 대장(§3.4) · 법령 인용 인프라 갭(§3.5) · 갭 **3계층** 재분류 5항(§4 — 확정 1 / 미검증 1 / 범위 확장 3) · 14 동기화 지점 매핑(§7) · anchor·mutation 계획(§8) · **V-1~V-10** 미검증 레지스터 · Q-1~Q-5 결정 |
| **v2.1 구조 개편**(2026-09-18) | 판정 **별도 메뉴** + 공유 엔진 + 사실 전달·재판정 + 계산기 간이 입력(D-1~D-5) · 명부·분양권 위젯은 **중과 유일 입력 경로라 계산기에 잔류**(실측 제약) · 로드맵 P0~P6 재편(G-5를 P1로 앞당김) · Q-1·Q-2 종결 · **Q-3′ 사용자 판정**(자동 판정안 폐기) · Q-4 날짜 표시 · Q-5 개편안 미반영 · V-11~V-13 신설 · 산출물 게이트 충족 → 설계 문서 2종 필요 |
| **저장소 결함 발견** | 인용 오기 1건(§2.4 §155⑦↔④) · legal-codes 상수 부재 6건 · manifest 구조적 제외 3건 · §155⑮ 인용 0건(M-10) · §155⑥ **전용** anchor 미발견(간접 커버 2건 존재) · **고가주택 기준 시점 분기 부재 — 확정**(V-6: 과거 양도분 0원 과소, 안분 12억 하드코딩 5곳) |
