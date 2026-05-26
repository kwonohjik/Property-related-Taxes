# 비상장주식 등 평가서(별지 제4호 부표3) 2025.07.10 개정본 완전 재현 — 작업계획서

> 작성일: 2026-05-26
> 기준 서식: **평가심의위원회 운영 규정 별지 제4호 서식 부표3 (2025.07.10 개정)** — 사용자 첨부 PDF 8쪽
> 관련 메모리: `project_unlisted_share_conversion_17_3_5` · `feedback_korean_law_82_vs_81_2_drift` · `feedback_numeric_impact_verify_before_bug_claim`
> 적용 스킬: `besshi-form-replica` · `echo-field-pattern` · `pre-do-anchor-verification` · `korean-law-citation-verify` · `pdf-case-replica-workflow`
>
> **✅ 법령 검증 완료 (2026-05-26, KoreanLaw MCP)**: §54④·§54①·§56④·§17의2·§53⑤⑦⑧·§55③·§59②③·**법 §63③** 전수 대조.
> - 정정 1 (계획 본문): "할증율 §53③" → **법 §63③** (시행령 §53③은 코스닥 정의로 무관)
> - 발견 1 (기존 코드): `Page5GoodwillTable` §55③ 호 라벨 오류 → G-10 신설
> - 확인: §54④ 4호삭제·§17의2 ⑮가산/⑯⑰차감·⑱양식차감 근거 모두 타당

---

## 0. 배경 — 양식 버전 이력

| 버전 | 출처 | 본 프로젝트와의 관계 |
|---|---|---|
| 2017.07.01 개정 | 사용자 1차 첨부 | 구판. "다(결손금)·라(§94①4호라목)" 사유 존재 — 현행 시행령에서 삭제·재편됨 |
| 2021.3.4 개정 | 현재 구현(`BesshiForm4Buppyo3PrintView`) 헤더 표기 | 구판 |
| 2024.05.20 | 법제처 행정규칙ID 21044 본칙 공포 | 본문 조문 기준일 |
| **2025.07.10 개정** | **사용자 2차 첨부 (본 계획 기준)** | **최신본. 본 계획의 단일 진실(SSOT)** |

**핵심 정책**: 구판(2017) 기준으로 누락을 판정하면 현행 법령과 어긋난 잘못된 구현을 유발한다(예: 삭제된 4호 부활, 결손금 사유 추가). 본 계획은 **2025.07.10 양식 + 현행 상증령/시행규칙**을 단일 기준으로 삼는다.

---

## 1. 현행 법령 검증 결과 (KoreanLaw MCP, 2026-05-26)

| 조문 | 시행일 | 검증 내용 |
|---|---|---|
| 상증령 §54④ | 2026.02.27 | 순자산만 평가 **5사유**(1호 청산/2호 3년미만/**3호 부동산80%**/5호 주식80%/6호 존속). **4호 삭제됨** |
| 상증령 §54① | 2026.02.27 | 순손익가치:순자산가치 = 3:2 (부동산과다 2:3) 가중평균, **하한 = 순자산 ×80%** |
| 상증령 §56④ | 2026.02.27 | 순손익액 = 각사업연도소득 + 1호(가산 가~마) − 2호(차감 가~마). 외화평가손익 신설 |
| 상증규 §17의2 | 2026.03.20 | 순자산 가감: 1호 지급권리(자산가산)·2호 선급비용(자산차감)·3호 법인세등(부채가산)·**4호 제충당금·제준비금(부채차감)**, **4호 단서 가**: 충당금 중 확정분은 차감 제외(=가산 유지) |
| **할증율 법 §63③** | 2026.01.02 | 최대주주등 주식 평가가액에 **100분의 20 가산**. 중소·중견·결손법인 배제. ⚠️ **계획 v1 "§53③" 오인용 정정** — 시행령 §53③은 "코스닥시장 정의"로 할증율과 무관 |
| 할증 부수 §53⑤⑦⑧ | 2026.02.27 | §53⑧ 할증배제 **9사유**(타입 `UnlistedPremiumExclusionReason` 9개 일치)·§53⑦ 중견기업 매출 5천억 미만·§53⑤ 최대주주 1년내 양도·증여 합산 |
| 상증령 §55③ | 2026.02.27 | 영업권 자산 합산. **배제**: 1호=§54④1호(청산)·**3호(부동산80%)** / 2호=§54④2호(3년미만, 단서 제외) / 3호=결손금 |
| 상증령 §59②③ | 2026.02.27 | 영업권=초과이익×5년 환산(§19 방법). 매입 무체재산권 단서. 3년 가중평균=§56①②준용 |

**§17의2 결론** (제2쪽 부채 ⑮·⑱ 부호 확정):
- **⑮ 충당금 중 확정분 = 부채 가산** (4호 단서 가)
- **⑯ 제준비금·⑰ 제충당금 = 부채 차감** (4호 본문)
- **⑱ 이연법인세대 = §17의2 본칙 미명시** → 양식 ⑲소계 `−⑱`(차감)이 유일 직접 근거. 이연법인세부채는 세무상 확정부채가 아니므로 부채에서 차감(평가상 제외)하는 것이 합리적

**§55③ 영업권 배제 호 매핑** (제5쪽 — 기존 코드 검증 중 오류 발견):

| 배제 사유 | 정확한 §55③ 호 | 기존 코드 라벨 | 판정 |
|---|---|---|---|
| liquidation(청산) | **1호** (§54④1호) | "1호" | ✓ |
| real_estate_80(부동산80%) | **1호** (§54④3호) | "2호 본문" | ❌ → 1호 |
| lt3y(3년미만) | **2호** (§54④2호) | "2호 단서" | ❌ → 2호 본문 |
| continuous_loss_3y(결손) | **3호** | "3호" | ✓ |

→ 배제 **로직**(어떤 사유에서 영업권 0)은 정확하나, `Page5GoodwillTable.excludedReasonLabel`의 **호 번호 라벨이 오류**. G-10으로 정정.

---

## 2. 페이지별 갭 대조 (2025.07.10 양식 ↔ 현재 구현)

| 쪽 | 양식 항목 | 구현 상태 | 갭 분류 |
|---|---|---|---|
| 제1쪽 1 | 법인명·**사업자등록번호**·대표자·①발행·액면·**자본금**·평가일·②부동산과다 | 사업자번호·자본금 칸 누락 | C-양식충실 |
| 제1쪽 2 | 6행(가~바, 다=2018.2.13.삭제 표기) [v] 체크박스 | 선택 1개만 텍스트 | C-양식충실 |
| 제1쪽 3 | ③④⑤⑥(㉮㉯=④×80%)⑦(㉮㉯) | 자체 번호(⑥-㉠㉡·⑦·⑧·⑨·총). 80% 적용은 일치 | C-칸번호 정합 |
| 제2쪽 4 | 자산①~⑧·부채⑨~⑲(⑮가산·⑯⑰⑱차감)·다·라·마 | **⑮**: 엔진·입력UI 가산(OK)·**Page2 차감(버그)** / **⑱**: **엔진·입력UI 가산(버그)**·Page2 차감(양식 일치) | **A-계산/표시 버그** |
| 제3쪽 | (제2쪽 작성방법) | 미렌더(정상) | — |
| 제4쪽 5 | 평가차액 계정과목별 표·①②합계 | ✅ 완료 | — |
| 제5쪽 6 | 영업권 가~자 9행 | ✅ 완료 | — |
| 제6쪽 7 | 가산②~⑦(6)+차감⑧~㉒(15)=**21 세부행**+주당㉓㉔㉕ | 입력UI·엔진 21개 반영. **결과·출력 Page6: 합계 2행만** | **B-양식충실(echo)** |
| 제7·8쪽 | (제6쪽 작성방법) | 미렌더(정상) | — |

**입력·계산은 이미 완비** (FiscalYearAdjustment 21필드 + 입력UI 20필드 + `fiscal-year-net-income.ts` 21개 합산). 갭의 본질은 **결과 노출(echo) + 출력 양식 표시 + 부호 버그 2건**.

---

## 3. 케이스 인벤토리 (작업 단위 — Do 진입 전 행≥1 필수 충족)

| ID | 작업 | 근거 | 분류 | 우선순위 | 영향 |
|---|---|---|---|---|---|
| **G-1** | besshi Page2 **⑮ 부호 차감→가산** 정정 | §17의2 4호 단서 가 | A-표시버그 | ★★★ | 순자산 표시 정확성 |
| **G-2** | **⑱ 이연법인세대 가산→차감** 정정 (엔진 `net-asset-calc` + 입력UI sign + Page2) | 양식 ⑲소계 −⑱ | A-계산버그 | ★★★ | **순자산가액 계산값 변동** |
| **G-3** | 제6쪽 21개 세부 항목 결과 echo + Page6 21행 전개 | §56④·양식 6쪽 | B-양식충실 | ★★ | 표시만(계산 불변) |
| **G-4** | 제6쪽 주당순손익 칸번호 ㉓㉔㉕ + 가산/차감 소계 라벨(가·나) | 양식 6쪽 | B-양식충실 | ★★ | 표시 |
| **G-5** | 제1쪽 2번 **6행**(가·나·**다=삭제**·라·마·바) [v] 체크박스 전체 표시(**`netAssetOnlyReason` undefined여도 상시 6행 렌더**). 활성 5사유 enum: 가=liquidation·나=lt3y·라=real_estate_80·마=stock_holding_80·바=remaining_3y (다=삭제, 회색) | §54④ | C-양식충실 | ★★ | 표시 |
| **G-6** | 제1쪽 1번 사업자등록번호·자본금 칸 추가 | 양식 1쪽 | C-양식충실 | ★ | 입력+표시 |
| **G-7** | 제1쪽 3번 칸번호 정합: ⑥(㉮가중평균·㉯④×80%) + **⑦ 2행 분리** ㉮(⑥×할증율=할증분)·㉯(⑥+㉮=합계) | 양식 1쪽 | C-칸번호 | ★★ | 표시 |
| **G-8** | 라벨 최신화: ⑯ 접대비→**기업업무추진비**, ⑮·⑱ 문구, 헤더 "2021.3.4."→**2025.07.10** | 양식 2025 | D-라벨 | ★ | 표시 |
| **G-9** | 할증율 표(2020.1.1.이후 20%) 작성방법 노출 + companySize **large=20% / small·medium=배제** 재확인 + ②부동산과다 체크박스 형태 | **법 §63③** + 시행령 §53⑦⑧ | D-검증 | ★ | 검증 |
| **G-10** | **Page5GoodwillTable §55③ 호 라벨 정정**: real_estate_80 "2호 본문"→**1호**, lt3y "2호 단서"→**2호 본문** | §55③ | A-인용오류 | ★★ | 표시(법령 정확성) |

---

## 4. Pre-Do anchor 계획 (G-1·G-2 우선 — `pre-do-anchor-verification`)

Do 진입 전 아래 anchor를 먼저 작성·실행하여 현행 동작을 실증한다. "현행 일치 예상" 가정 금지.

| anchor | 입력 | 기대(법령) | 현행 예상 | 용도 |
|---|---|---|---|---|
| **AC-1** | ⑱ deferredTaxAdjustment = 10,000,000, 그 외 부채 0 | 부채 소계에서 −10,000,000 (차감) | 현행 +10,000,000 (가산) → **실패** | G-2 버그 실증 |
| **AC-2** | ⑮ otherProvision = 5,000,000 | 부채 소계 +5,000,000 (가산) | 엔진 통과(가산) / Page2 출력 −표시 | G-1 표시 vs 계산 분리 실증 |
| **AC-3** | PDF 사례 1 통합 (기존 7 anchor) | 회귀 0 (G-2 정정 후 ⑱=0이면 무변동 확인) | — | G-2 정정의 기존 anchor 영향 검증 |
| **AC-4** | 21개 add*/sub* 입력 → 결과 echo | 입력=결과 echo 일치 | 합계만 | G-3 echo |
| **AC-5** | Σ(②~⑦)=addTotal, Σ(⑧~㉒)=subTotal | 자기일관 | — | G-3·G-4 |
| **AC-6** | 5사유 각각 → 해당 행만 [v] | 매핑 정확 | — | G-5 |
| **AC-7** | companySize large→0.20, small·medium→0 | §63③·§53⑧ | — | G-9 |

> 디자인 문서 §7 anchor 명세와 동기화 (AC-1~7).

**AC-1 실패 메시지 확보 후** G-2 정정 → §17의2 본칙 미명시이므로 정정 커밋에 "양식 ⑲소계 −⑱ 단일근거" 주석 + KoreanLaw 인용 동결.

> ⚠️ `feedback_numeric_impact_verify_before_bug_claim`: ⑱·⑮가 0인 PDF 사례에서는 G-1·G-2 정정이 결과 무변동일 수 있다. 트리거 입력(⑱>0) anchor로 부호 버그를 실증한 뒤 심각도를 단정한다.

---

## 5. 작업 분해 (PR 단위 — 엔진→UI 시퀀셜)

### Phase A — 계산 정확성 버그 (G-1·G-2) ★최우선
- **PR-A1**: Pre-Do anchor AC-1·AC-2 작성 → 실패 확보
- **PR-A2** (G-1 ⑮ 표시버그): besshi `Page2NetAssetTable` ⑮ `isSubtract:true`→`false` (차감→가산). **엔진·입력UI는 이미 ⑮ 가산 — 무변경**
- **PR-A2-b** (G-2 ⑱ 계산버그): 엔진 `net-asset-calc.ts:76` `+deferredTaxAdjustment`→`−`. 입력UI `NetAssetCalculationTable` ⑱ sign `+`→`−` (2곳). **besshi `Page2NetAssetTable` ⑱는 이미 `isSubtract:true`(차감) — 무변경**
- **PR-A2′** (G-10, 표시): `Page5GoodwillTable.excludedReasonLabel` §55③ 호 라벨 정정 (real_estate_80→1호, lt3y→2호 본문). testid 무변경, 라벨 텍스트만
- **PR-A3**: AC-3 회귀 + PDF 사례 1 재현 1원 일치 확인

### Phase B — 제6쪽 21개 세부 echo (G-3·G-4) — `echo-field-pattern`
- **PR-B1** (엔진): `FiscalYearBreakdown`에 21개 echo 필드 추가(`add*`/`sub*`). `unlisted-orchestrator.ts`가 `fiscal-year-net-income` 입력값을 결과로 pass-through. **산식 변경 0**
- **PR-B2** (UI): `Page6NetIncomeBreakdown` 합계 2행 → 21행(②~㉒) + 소계 가·나 + 주당 ㉓㉔㉕ 전개. testid `p6-②`~`p6-㉒` 동결
- **PR-B3**: 21개 항목 표시 anchor + 합계 = Σ세부 자기일관성 anchor

### Phase C — 제1쪽 충실 재현 (G-5·G-6·G-7)
- **PR-C1** (엔진/타입): `UnlistedStockValuationInput`에 `businessRegistrationNumber?`·`capital?` optional 추가 (8지점 동기화)
- **PR-C2** (UI): Page1 사업자번호·자본금 칸 + 2번 5사유 [v] 체크박스(삭제 다 회색 표기) + 3번 ⑥/⑦ 칸번호 정합

### Phase D — 라벨·할증 검증 (G-8·G-9)
- **PR-D1**: 라벨 최신화(기업업무추진비 등) + 헤더 2025.07.10 + 할증율 표 노출
- **PR-D2**: companySize large=20% 할증 anchor 재확인

---

## 6. 동기화 지점 매핑 (Definition of Done)

**비상장주식 V2 데이터 경로** (검증 2026-05-26): 입력은 `EstateItem.unlistedStockValuationV2?: UnlistedStockValuationInput`로 임베드 → 상속세 폼 → `lib/calc/inheritance-api.ts` 직렬화 → `/api/calc/inheritance` route → **`route.ts:72` `estateItems as InheritanceTaxInput["estateItems"]` `as` 캐스팅**(Zod 세부 검증 없음) → `calcInheritanceTax` → `evaluateAllEstateItems` → `evaluateUnlistedStockV2`. 별도 besshi 인쇄뷰는 클라이언트에서 `evaluateUnlistedStockV2(input)` 직접 호출.

→ 따라서 **표준 14지점 중 ⑨⑩⑫(Zod enum/객체)는 V2에 해당 없음**(estateItems가 `as` 통과). 대신 **직렬화 strip + Date 변환**이 실질 동기화 지점.

### G-1·G-2 (⑮·⑱ 부호) — 항목별 정정 위치 (`mirror-pattern`)
- **⑮**(otherProvision): 엔진 가산(OK)·입력UI 가산(OK)·besshi Page2 차감(버그) → **Page2 1곳만 정정**
- **⑱**(deferredTaxAdjustment): 엔진 `net-asset-calc.ts:76` 가산(버그)·입력UI `NetAssetCalculationTable` sign 가산(버그) → **엔진·입력UI 2곳 정정**. besshi Page2는 이미 차감 → 무변경
- ⚠️ 3중 패턴 점검은 "3곳 모두 동일 부호" 확인이 목적 — ⑮·⑱ 정정 후 (엔진=입력UI=Page2) 부호 일치 검증 anchor 필수

### G-3 (제6쪽 echo) — 결과 타입 확장 **3지점**
① `FiscalYearBreakdown` 타입에 21개 echo 필드 **optional 추가**(기존 result 생성 코드 호환 보존) → ② `unlisted-orchestrator.ts`가 입력 `FiscalYearAdjustment` 21필드를 결과로 pass-through → ⑦ `Page6NetIncomeBreakdown` 표시. **입력·initial·normalize·API·validate·Zod 전부 무관**(입력 타입에 이미 존재, result는 직렬화 후 표시 안 거침).

### G-6 (사업자번호·자본금) — Input 신규 필드 동기화
① 폼 상태(estateItem 내 V2 입력, `CorporateInfoSection`) → ② initial → ③ normalize → ④ `inheritance-api.ts:71` **`estateItems` 통째 전달**(spread·명시매핑 아님) → 신규 필드 **자동 포함, strip 위험 낮음** → ⑤ UI 위젯(`CorporateInfoSection`) → ⑦ Page1 표시 → ⑧ `inheritance-validate.ts`(표시전용 — 필수검증 불요).
- ✅ `capital`(number)·`businessRegistrationNumber`(string)은 Date 아님 → `coerceDates` 무관.
- ⚠️ Do 단계: `inheritance-api.ts:109 .map`이 prior gifts 경로(estateItems 무관)인지 grep 재확인.

---

## 7. 위험·정책

| 위험 | 대응 |
|---|---|
| ⑱ §17의2 본칙 미명시 → 추정 인용 위험 | 양식 ⑲소계 산식을 단일근거로 명시. 추가로 PDF 사례에서 ⑱ 처리 교차검증. `korean-law-citation-verify` |
| G-2 정정이 기존 PDF 사례 1 anchor(⑱=0) 무영향 → 버그 미검출 | AC-1 트리거 입력(⑱>0) 별도 anchor 필수 |
| 800줄 정책 | Page6 21행 전개 시 `Page6NetIncomeBreakdown` 분할 가능성 — sibling 추출 |
| Tailwind 동적 클래스 | 삭제 다 회색·체크박스 tone 정적 매핑 (`feedback_tailwind_static_tone_mapping`) |
| 라벨 변경이 testid 깨뜨림 | testid는 `p6-②` 등 칸번호 기준 동결, 라벨 텍스트와 분리 |

## 8. 완료 기준

- [ ] AC-1~3 Pre-Do anchor 작성·실패 확보 → 정정 후 통과
- [ ] G-2 정정 후 PDF 사례 1 통합 7 anchor 회귀 0 (⑱=0 무변동 확인)
- [ ] 제6쪽 21개 항목 양식대로 표시 + Σ세부=합계 자기일관 anchor
- [ ] 제1쪽 1·2·3번 양식 칸 1:1 (사업자번호·자본금·5사유 체크박스·⑥⑦ 번호)
- [ ] 헤더 "2025.07.10 개정" + 기업업무추진비 등 라벨 최신화
- [ ] `npx tsc --noEmit` 0건 / `npx vitest run __tests__/.../unlisted*` 통과
- [ ] 브라우저 수동 확인 (입력→계산→besshi 인쇄 미리보기 5쪽)
- [ ] `ui-engine-sync-checker` 호출

---

## 부록 A — 제6쪽 21개 항목 ↔ 엔진 필드 ↔ §56④ 매핑

| 칸 | 항목(2025.07.10) | 엔진 필드 | §56④ |
|---|---|---|---|
| ② | 국세·지방세 과오납 환급금이자 | addRefundInterest | 1호 가 |
| ③ | 수입배당금 익금불산입액 | addLossFromDividend | 1호 나 |
| ④ | 이월된 기부금 손금산입액 | addCarriedDonation | 1호 다 |
| ⑤ | 이월된 업무용승용차 손금산입액 | addCarriedCarPayment | 1호 다 |
| ⑥ | 외화환산이익(미반영분) | addForexValuationGain | 1호 라 |
| ⑦ | 그 밖에 기재부령 금액 | addOtherByOrdinance | 1호 마 |
| ⑧ | 당해 법인세액 | subCorporateTax | 2호 가 |
| ⑨ | 법인세 감면액·농특세·지방소득세 | subAdditionalTaxes | 2호 가 |
| ⑩ | 벌금·과료·과태료·가산금·강제징수비 | subFines | 2호 나 |
| ⑪ | 의무 아닌 공과금 손금불산입 | subCompulsoryPublicCharges | 2호 나 |
| ⑫ | 징벌적 손해배상금 등 | subPunitiveDamages | 2호 나 |
| ⑬ | 징수불이행 납부세액 | subWithholdingPenalty | 2호 나 |
| ⑭ | 과다경비 손금불산입 | subExcessiveExpenses | 2호 다 |
| ⑮ | 기부금 손금불산입 | subDonationExcess | 2호 다 |
| ⑯ | 기업업무추진비 손금불산입 | subEntertainmentExcess | 2호 다 |
| ⑰ | 업무무관 비용 손금불산입 | subNonBusinessExpenses | 2호 나 (§27) |
| ⑱ | 업무용승용차 비용 손금불산입 | subNonBusinessCarExpenses | 2호 다 |
| ⑲ | 지급이자 손금불산입 | subInterestPayment | 2호 다 |
| ⑳ | 감가상각 시인부족 추인분 차감 | subDepreciationShortage | 2호 라 |
| ㉑ | 외화환산손실(미반영분) | subForexValuationLoss | 2호 마 |
| ㉒ | 그 밖에 기재부령 금액 | subOtherByOrdinance | 2호 다·§136 |

> 엔진 입력 타입·계산은 이미 위 21개를 전부 반영. 결과 echo + Page6 표시만 추가하면 양식 완전 재현.
