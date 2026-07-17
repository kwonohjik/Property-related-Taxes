# 취득세 엔진 코드리뷰 R3 — 확정 결함 (origin/master c081993a)

> 방식: 8차원 발견 → 트리아지 17후보 → 3렌즈(법령·수치·도달가능성) 적대검증 → 완전성 비평 → 종합. 78 에이전트.
> R1/R2 확정·수정 항목 재보고 차단. HIGH 4건 + R3-03 도달경로는 메인루프에서 코드 직접 재실증.

## 요약

취득세 엔진 적대 3렌즈(법령·수치·도달가능성) 검증에서 살아남은 확정 결함 19건(R3-01과 C-4는 동일 결함 — acquisition-tax-rate.ts:306-313 사치성 지방교육세 하드코딩 — 이므로 병합). 심각도 분포: HIGH 4 · MEDIUM 7 · LOW 8. HIGH 4건은 모두 과세방향이 명확한 계산 결함(본세 배선누락 과소 1·본세 과세표준 우회 과대 1·지방교육세 체계적 과대 1·농특세 산식 과소 1). MEDIUM 7건은 본세 세율/감면·부가세 산정 오류. LOW 8건 중 3건(R3-08 크래프트 POST 한정 과소, R3-12 거리요건 과대, R3-14 감면배제)은 실계산 결함이나 발생범위 협소, 5건은 표시-only 드리프트(세액 무영향). 표시-only 드리프트는 프로젝트 규칙에 따라 LOW 고정. 순위는 본세>부가세, 재현 magnitude·breadth, 과세방향 확실성 순으로 확정. 재보고 금지 목록·R1/R2 수정분과 중복 없음(R3-02는 D6/D7 신규 축, R3-03은 오케스트레이터 배선갭, C-1/C-5는 §13의2 중과 수정이 배제로직·§15단서를 놓친 후속 결함으로 재보고 예외에 부합).

## 커버리지



## 확정 결함 (19건)

### #1 [HIGH] R3-03 — 조정지역 3억↑ 주택 증여 §13의2② 12% 중과가 파이프라인 배선누락으로 항상 미발동

- **위치**: lib/tax-engine/acquisition-tax.ts:306 · **과세방향**: 과소
- **내용**: assessGiftSurcharge는 §13의2②(조정대상지역 시가표준액 3억↑ 주택 무상취득 12%)를 완전 구현했으나, 3억 임계 판정값 wholeStdValue가 실입력에서 항상 0으로 읽혀 12% 중과가 절대 발동하지 않는다. 엔진 fallback `wholeHouseStandardValue ?? standardValue ?? 0`(acquisition-surcharge/index.ts:297-299)이 의도됐지만 오케스트레이터 assessSurcharge 호출(acquisition-tax.ts:287-322)이 standardValue를 SurchargeCheckInput에 넣지 않아(타입에 필드 부재) cast fallback이 항상 undefined→0. UI(Step3)는 wholeHouseStandardValue를 다주택 저가배제 토글 내부에서만 노출→단일주택 증여는 필드 미렌더, 다주택 3억↑ 사용자도 공란. 부담부증여 무상분(acquisition-tax-burdened.ts:53)도 동일. 완전구현 엔진이 실파이프라인에서 100% 미발동.
- **법령**: 지방세법 §13의2②(조정대상지역 시가표준액 3억↑ 주택 무상취득=§11①7나 4%+중과기준세율×400%=12%), 시행령 §28의6①(3억 임계=§4 시가표준액; 지분·부속토지는 전체주택 시가표준액). KoreanLaw MST 282559·287223 실측.
- **재현**: propertyType=housing, cause=gift, isRegulatedArea=true, standardValue=5억(marketValue 없음), wholeHouseStandardValue 공란, houseCountAfter=1, giftorRelation=other → assessGiftSurcharge stdValue=0<3억 → 비중과 3.5% → 취득세 17,500,000. 정답(12%)=60,000,000. 본세 42,500,000 과소(+농특세·교육세 차액). 서울 전역이 조정지역이고 대부분 주택이 시가표준액 3억↑이므로 매우 흔한 실사례.
- **수정안**: assessSurcharge 호출에 standardValue: input.standardValue 추가(+SurchargeCheckInput 타입에 필드 추가)로 엔진 fallback 활성화, 부담부증여 경로(acquisition-tax-burdened.ts:53)도 `input.wholeHouseStandardValue ?? input.standardValue ?? 0`로 보강. UI에 증여 시 §13의2② 3억 임계용 전체주택 시가표준액 입력 노출 + API·validate 3중 mirror. (임계 소스는 시가표준액이지 시가인정액 아니므로 taxBase 대입은 부적절.)
- **검증**: law·numeric·reachability 3렌즈 전부 CONFIRMED(HIGH). numeric 렌즈가 probe로 대조군(wholeHouseStandardValue 명시 시 12%/60,000,000 발동) 재현, 후보의 42,500,000 과소 정확 일치. numeric이 지적한 사소한 후보 오류(API 파일경로 lib/tax-engine→lib/calc, standardValue는 실제 body 전송됨)는 결론 불변. 완전구현 로직이 배선갭으로 도메인 내 100% 오산출 → 최우선.

### #2 [HIGH] R3-04 — isRelatedParty 분기가 무상취득보다 먼저 실행 — 상속+특수관계인+시가인정액 시 §10의2②1호 시가표준액 강제 우회

- **위치**: lib/tax-engine/acquisition-tax-base.ts:108 · **과세방향**: 과대
- **내용**: determineTaxBase가 line 108 `if (input.isRelatedParty)`를 line 113-122 무상취득(inheritance/gift/donation) 분기보다 먼저 평가·return(코드 실측 확인). isRelatedParty=true인 상속이 calcRelatedPartyTaxBase(§10의3② 유상 부당행위)로 오라우팅되어, marketValue>0이고 reportedPrice(상속=0)<시가×70%이면 recognized_market=시가인정액(감정가)을 과세표준으로 반환한다. R1/R2가 확정한 '상속 시가표준액 강제'는 calcGratuitousTaxBase(shouldUseStandardPrice)에만 있어 이 교차분기가 우회한다(별개 함수·경로의 미봉 갭 — regression 아님, 재보고 대상 아님).
- **법령**: 지방세법 §10의2②1호(상속 무상취득=§4 시가표준액 강제, 시가인정액 예외), §10의3②(부당행위계산=유상승계취득 전용). KoreanLaw MST 282559 §10의2·§10의3 본문 대조.
- **재현**: 상속 주택, 시가표준액 5억, 감정가(시가인정액) 8억, '특수관계인 간 거래' 토글 ON, reportedPrice=0 → calcRelatedPartyTaxBase marketBase=8억, reportedPrice 0<5.6억 → recognized_market=8억 → 취득세 8억×2.8%=22,400,000. 정답(§10의2②1호)=5억×2.8%=14,000,000. 8,400,000 과대(+부가세). 상속은 본질상 피상속인↔상속인 특수관계이고 상속세 신고용 감정가 보유가 흔해 발동 개연적.
- **수정안**: line 108 isRelatedParty 분기를 유상승계취득으로 한정(`input.isRelatedParty && isOnerousCause(input.acquisitionCause)`). 상속·증여·기부는 calcGratuitousTaxBase로 fall-through시켜 §10의2②1호(상속 시가표준액)·§10의2①(증여 시가인정액) 유지.
- **검증**: law·numeric·reachability 3렌즈 전부 CONFIRMED(HIGH). 분기순서·calcRelatedPartyTaxBase 동작·전 파이프라인 도달(UI 토글이 상속에도 렌더, Zod optional·strip 없음)·수치 8,400,000 과대 모두 실측. 명문(§10의2②1호)이 시가표준액을 강제하는데 우회해 감정가 과세 → 법 근거 없는 불리 적용. 본세 과세표준 결정 자체의 오류라 순위 상위.

### #3 [HIGH] R3-01 — 사치성재산 지방교육세를 1.4%/1.8%로 하드코딩 — §151①1 본문/가목/나목 위반 과다과세 (C-4와 동일 결함)

- **위치**: lib/tax-engine/acquisition-tax-rate.ts:308 · **과세방향**: 과대
- **내용**: calcLocalEducationTax(:306-313)가 surchargeType==='luxury_solo'→과세표준×1.4%, 'luxury_multi'→×1.8%를 하드코딩(주석은 '표준 0.4%+사치성 1.0%', '§151①1가 300% 가산분 반영'으로 근거). 실측 확인. 그러나 §151①1가의 ×300% 열거는 §13②③⑥⑦뿐이고 사치성 단독 §13⑤은 미포함이라 본문(비주택 (표준−2%)×20%=0.4%, §11①8 주택은 해당세율×50%×20%)이 적용된다. 사치성+다주택(luxury_multi)은 §13의2③으로 §13의2 소속→나목(4%−2%)×20%=0.4% 고정. 코드의 1.4%/1.8%는 중과분을 지방교육세 과세표준에 산입한 것으로 법 근거 없음. isLuxuryProperty 입력 시 전 사치성 취득에 항상 도달.
- **법령**: 지방세법 §151①1 본문·가목(§13②③⑥⑦ 한정)·나목(§13의2=0.4%), §13⑤(사치성), §13의2③(사치성+다주택). KoreanLaw MST 282559 실측.
- **재현**: 5억 고급오락장(비주택 4%, luxury_solo)→지방교육세 5억×1.4%=7,000,000. 정당(본문)=5억×(4%−2%)×20%=2,000,000 → 5,000,000 과대. 5억 고급주택+조정 3주택(luxury_multi)→5억×1.8%=9,000,000 vs 나목 0.4%=2,000,000 → 7,000,000 과대. anchor #E6/#E7(phase4-additional-tax.anchor.test.ts:93,106)이 오답 고정. 파일 내 다주택 중과 분기(:327-329)는 이미 0.4%를 올바로 산출해 luxury_multi 1.8%는 파일 내부적으로도 모순.
- **수정안**: luxury_solo=본문 산식((표준−2%)×20%, §11①8 주택은 세율×50%×20%), luxury_multi=나목 0.4%로 교체. 1.4%/1.8% 하드코딩 제거 + anchor #E6/#E7 정답값 정정.
- **검증**: law·numeric·reachability 3렌즈 전부 CONFIRMED(HIGH), 별도 discovery stream C-4도 독립 3렌즈 CONFIRMED(HIGH)로 이중 확증. 코드(:308/:312) 스팟리드로 0.014/0.018 하드코딩 직접 확인. 사치성재산 협소 범주 + 부가세 소액이라 CRITICAL 아닌 HIGH. 과대과세이나 명문 정면 위반·체계적 3.5~4.5배 과다.

### #4 [HIGH] R3-02 — 농어촌특별세를 (적용세율−2%)×과세표준×10%로 산출 — 비중과·표준세율≠4% 취득 전반 과소과세

- **위치**: lib/tax-engine/acquisition-tax-rate.ts:279 · **과세방향**: 과소
- **내용**: calcRuralSpecialTax(:277-282)가 excessRatePoints=ratePoints−2%로 (적용세율−2%)×과세표준×10%를 산출하고 rate≤2%면 :273에서 조기 0 반환(스팟리드 확인). 법정 농특세 과세표준은 '표준세율을 2%로 적용한 취득세액'이므로 표준세율 성분만 2%로 치환해야 한다(=(적용세율−표준세율+2%)×과세표준×10%). 코드 산식은 표준세율이 정확히 4%(토지·상가 매매)와 중과(8/12%, 표준 4% 기반)에서만 우연 일치하고, 표준세율≠4%인 주택유상(1~3%)·상속(2.3/2.8%)·원시(2.8%)·농지(3%)·증여(3.5%) 전반에서 과소. 표준세율≤2% 주택 1%는 조기반환으로 농특세 전액(0.2%) 누락. 주석(:243)이 지방교육세 §151①1(표준−2%) 구조를 잘못 전용한 오기재.
- **법령**: 농어촌특별세법 §5①6호(§11·§12 표준세율을 100분의2로 적용한 취득세액×10%), §5⑤(§15② 간주취득). KoreanLaw MST 285905 §5⑤ 실측(제1항제6호=취득세 조항 확증).
- **재현**: 과세표준 5억: 농지 3%→코드 500,000 vs 정답 1,000,000(−500,000); 원시 2.8% 상가→코드 400,000 vs 1,000,000(−600,000); 주택 유상 1%(85㎡초과)→코드 0(조기반환) vs 1,000,000(전액 누락); 증여 3.5%→코드 750,000 vs 1,000,000(−250,000). 4% 매매·중과 8/12%만 정확. anchor #E11·N-1b·AT-NUM-1a가 오값 고정. 국내 최다빈도 주택매매·상속·증여 전반 계통 영향.
- **수정안**: 표준세율 성분만 2%로 치환: 농특세=floor(floor(taxBase×(적용세율−표준세율+2%))×0.10). rate≤2% 조기 0 반환 제거(비중과 주택도 0.2% 부과). 85㎡(읍면 100㎡) 면제·§15② §5⑤은 유지. 후보 suggestedFix의 'flat 0.2% 일괄'은 중과(8/12%)를 낮춰 새 과소를 만들므로 부정확 — 법령 렌즈 정정 반영. anchor 정답값 동반 정정.
- **검증**: law·numeric·reachability 3렌즈 전부 CONFIRMED(HIGH). D6(산식)·D7(과세표준) 독립 병합. 코드(:277-282, 조기반환 :273) 스팟리드 직접 확인. 같은 파일 calcLocalEducationTax(:331-339)가 (적용세율−2%)×20%를 올바로 구현해 농특세=별개 2%×10% flat 구조임을 반증적으로 뒷받침. 부가세이나 최다빈도 취득 전반 계통 과소라 HIGH.

### #5 [MEDIUM] C-2 — §15①2호 상속특례가 1가구1주택·감면농지 요건 검증 없이 발동 — 게이트 필드가 엔진에서 완전 dead

- **위치**: lib/tax-engine/acquisition-tax.ts:248 · **과세방향**: 과소
- **내용**: 엔진은 §15①2호 세율특례를 specialRateType==='inheritance_one_house' 하나만으로 발동(applySpecialRate→basicRate−2%). 법적 요건인 '1가구1주택'(isOneHouseHousehold)·'자경농지 상속'(isSelfCultivatedFarmlandInheritance)은 폼→API→Zod→엔진 input 타입까지 배선되나 lib/tax-engine 계산경로에서 소비 0건(grep), validate에도 게이트 없음. §15 카드 ON 시 specialRateType이 자동 default되고 두 요건 토글은 기본 OFF·dead이므로 요건 미충족자도 특례 적용. 농지(나목)는 별도 라디오조차 없어 자경농지 토글이 유일 신호인데 dead → 임의 상속농지 0.3% 적용.
- **법령**: 지방세법 §15①2호(가목 1가구1주택 / 나목 지특법 §6① 감면대상 농지에 한해 표준세율−중과기준세율 2%). KoreanLaw MST 282559 실측.
- **재현**: 다주택 상속인이 상속주택(2.8%)에 §15 특례 라디오 선택 + '1가구1주택 충족' 토글 OFF → 엔진이 게이트 무시하고 0.8% 적용(2.8%→0.8%, 71% 감액). 감면대상 아닌 농지 상속도 2.3%→0.3%(87% 감액) 과소적용.
- **수정안**: applySpecialRate 호출부에서 inheritance_one_house일 때 주택은 input.isOneHouseHousehold, 농지는 isSelfCultivatedFarmlandInheritance 미충족 시 특례 미적용 게이트, 또는 validate에서 특례선택+요건미충족 조합 차단.
- **검증**: law·numeric·reachability 3렌즈 전부 CONFIRMED(MEDIUM). 게이트 필드 dead(grep 0)·수치(2.8%→0.8%·2.3%→0.3%)·전 파이프라인 도달 실측. 본세 세율 71~87% 감액이고 상속 흔함·농지 나목은 표현경로 자체 부재라 MEDIUM 상위. 완화요인=라디오 라벨 자기주장 성격.

### #6 [MEDIUM] R3-06 — 고급주택 증여(조정 3억↑)가 §13의2③(20%) 대신 사치성 단독 11.5%만 적용

- **위치**: lib/tax-engine/acquisition-surcharge/index.ts:252 · **과세방향**: 과소
- **내용**: assessSurcharge 5단계(사치성, :234-292)가 6단계(증여중과 §13의2②, :294-336)보다 먼저 실행·early return하여 고급주택 증여를 luxury 분기로 라우팅한다. luxury 분기의 multiHouseRateForLuxury는 assessMultiHouseSurcharge로만 산출되는데 이 함수는 isOnerousAcquisition만 중과→증여(gift)는 항상 undefined→calcLuxurySurchargeRate가 분기1(basicRate 3.5%+8%p=11.5%)만 산출. §13의2③은 §13의2②(12%)+400%(8%p)=20%를 요구. 이 분기는 assessGiftSurcharge를 아예 호출하지 않아 R3-03(배선)과 별개 코드경로 결함(둘 다 수정해야 20% 도출).
- **법령**: 지방세법 §13의2③(제1항 또는 제2항과 §13⑤ 동시적용 시 §16⑤ 배제하고 제2항 세율+중과기준세율×400%=20%), §13의2②(증여 12%), §13⑤(고급주택). KoreanLaw MST 282559 실측.
- **재현**: 조정대상지역 고급주택(시가표준액 3억↑, 과세표준 15억) 증여(isLuxuryProperty=true, gift, isRegulatedArea=true, 단서 미배제) → luxury_solo 11.5% → 취득세 172,500,000. §13의2③ 20% → 300,000,000. 127,500,000 과소. UI 도움말(Step1)이 §13의2③=20%를 명시해 의도된 산식과도 배치.
- **수정안**: luxury 분기에서 주택 무상취득 시 assessGiftSurcharge 결과의 12%(§13의2② 성립)를 multiHouseRateForLuxury에 반영해 calcLuxurySurchargeRate가 12%+8%p=20% 산출, 또는 §13의2③ 결합을 별도 처리.
- **검증**: law·numeric·reachability 3렌즈 전부 CONFIRMED(MEDIUM). 분기순서·isOnerousForMultiHouseCheck('gift')=false·11.5% 재현·법정 20% 문언근거 모두 실측. 대조: 동일 luxury 분기가 유상 다주택(§13의2①+§13⑤)엔 20%를 올바로 산출 → gift 결합만 갭. 발현 시 8.5%p·127.5백만 과소이나 조정+증여+고급주택+3억↑ 교집합이 협소해 MEDIUM.

### #7 [MEDIUM] C-1 — 부담부증여 유상분 §13의2① 다주택 중과가 저가주택·일시적2주택·지정전계약 중과배제를 우회

- **위치**: lib/tax-engine/acquisition-tax-burdened.ts:40 · **과세방향**: 과대
- **내용**: 비-가족 부담부증여(채무>0) 유상분 세액을 computeBurdenedGiftResult가 assessMultiHouseSurcharge 직접 호출로 산정(line 40)한다. 이 경로는 메인 assessSurcharge의 중과배제 로직 — 시가표준액 저가주택 배제(§28의2 1호)·일시적2주택 배제(§28의5)·§13의2④ 지정전계약 보호(resolveRegulatedAreaStatus) — 를 재사용하지 않고 isRegulatedArea도 원값을 쓴다. 오케스트레이터(acquisition-tax.ts:354)가 acquisitionTax를 bgResult로 전면 override하고 assessSurcharge의 올바른 배제 결과(finalRate)는 else-분기에서만 쓰여 사장된다. 순수 gift·일반 유상에서 배제되는 조건이 부담부증여 유상분에선 8%/12% 그대로 부과.
- **법령**: 지방세법 §13의2①·④, 시행령 §28의2 1호(수도권 시가표준액 1억↓/비수도권 2억↓)·§28의5(일시적2주택), §10의3(유상승계취득). KoreanLaw MST 282559·287223 실측.
- **재현**: 수도권 시가표준액 9,000만(≤1억) 주택을 다주택자에게 부담부증여(채무 5,000만, giftRelation='other', isRegulatedArea=true, 3주택). 정상=유상분 5,000만×1%=500,000. 버그=assessMultiHouseSurcharge 12%→6,000,000 → 5,500,000 과대. 일시적2주택(채무 5억·2주택)=4,000만(8%) vs 정상 1,500만(3%) → 25,000,000 과대. anchor(burdened-gift-surcharge)는 wholeHouseStandardValue=10억만 커버해 배제경로 미핀.
- **수정안**: 유상분 중과 판정을 assessMultiHouseSurcharge 직접 호출 대신 메인 assessSurcharge(또는 배제 헬퍼 isExemptFromSurcharge_LowValue·resolveRegulatedAreaStatus·assessTemporaryTwoHouse)를 통과한 유효세율 재사용. (§13의2④ 지정전계약 sub-claim은 증여에 매매계약 부재로 약함 — 저가주택·일시적2주택 두 축만으로 성립.)
- **검증**: law·numeric·reachability 3렌즈 전부 CONFIRMED(MEDIUM). 코드경로·배제로직 부재·전 파이프라인 도달·수치(5.5백만~25백만 과대) 실측. 재보고 금지 '부담부증여 본세 §13의2 중과 적용' 수정이 배제로직 배선을 누락한 후속 결함으로 재보고 예외에 부합. 과대과세·법령 명확이나 트리거 교집합 협소로 MEDIUM.

### #8 [MEDIUM] R3-07 — calcRelatedPartyTaxBase가 신고가>시가 130% 과다신고까지 대칭 하향 조정 — 사실상취득가격 미달 과소

- **위치**: lib/tax-engine/acquisition-tax-base.ts:347 · **과세방향**: 과소
- **내용**: calcRelatedPartyTaxBase가 정상범위를 시가 70~130%로 잡고(:330-331), reportedPrice가 상·하 어느 쪽이든 벗어나면 marketBase(시가인정액/시가표준액)를 반환한다(:347-357). §10의3②의 부당행위계산은 저가취득(신고가<시가)에만 시가인정액 상향이 가능한 재량이며, 130% 초과 과다신고는 조세감소가 아니므로 §10의3① 사실상취득가격이 그대로 과세표준이어야 한다. 코드는 상단 초과분을 시가로 하향시켜 실제 지급액보다 낮게 과세. (R3-04와 동일 함수·다른 근본원인: R3-04=상속 진입, R3-07=유상 특수관계 내부 130% 대칭처리.)
- **법령**: 지방세법 §10의3①(유상승계취득=사실상취득가격 강행), §10의3②(부당행위계산=조세부담 부당감소 저가거래 한정 상향), 시행령 §18의2(저가취득으로서 차액 3억↑ or 시가 5%↑만 유형). KoreanLaw MST 282559·287223 실측.
- **재현**: 특수관계 유상매매, 사실상취득가격 10억, 감정가 7억, 토글 ON. 10억>1.3×7억=9.1억 → 비정상 → recognized_market=7억 → 취득세 (10억−7억)×4%=12,000,000 과소. 감정가가 실거래보다 보수적으로 낮게 산정되는 실무 관행상 정당 거래도 과소과세 가능. marketValue 미입력 시 standardValue 폴백으로 통상 실거래가보다 낮아 130% 초과 흔함.
- **수정안**: 상단(reportedPrice>upperBound)은 reportedPrice 유지(actual_price), 하단(reportedPrice<lowerBound)에서만 marketBase로 상향. 즉 `if (input.reportedPrice < lowerBound)`일 때만 recognized_market 반환. (하단 임계도 엄밀히는 §18의2 '차액 3억 or 5%'이나 별개 이슈로 범위 밖.)
- **검증**: law·numeric·reachability 3렌즈 전부 CONFIRMED(MEDIUM). 상·하 대칭처리·시행령 §18의2 저가한정·12백만 과소 재현 실측. 명문(§10의3①)이 있는 사실상취득가격을 근거 없이 낮춘 과소(반대방향, 명문부재유리 아님). UI가 '70~130% 벗어나면 시가과세'를 명시 광고. 130% 초과 고가신고가 저가 대비 좁아 MEDIUM.

### #9 [MEDIUM] R3-05 — §13②(대도시 법인)·§13⑦(사치성+대도시법인) 비주택 중과 지방교육세 §151①1가 ×300% 미적용

- **위치**: lib/tax-engine/acquisition-tax.ts:372 · **과세방향**: 과소
- **내용**: surchargeTypeForEdu(acquisition-tax.ts:372-382)는 surchargeDecision.isSurcharged=false면 undefined 반환하고 corpSurchargeResult의 §13②·§13⑦(luxury_corp)를 매핑하지 않는다. §13② 비주택 중과는 corpSurchargeResult에서만 isSurcharged=true가 되므로 surchargeType=undefined + isSurcharged=true로 전달 → calcLocalEducationTax(:327-329)가 과세표준×2%×20%=0.4% 나목 분기로 붕괴. §151①1가는 §13②③⑥⑦에 본문 산출액×300%(비주택 4% 기준 1.2%)를 요구. luxury_corp(§13⑦)·headquarters_metro_combined(§13⑥)도 매핑 부재로 동일 0.4% 과소. 작성자도 acquisition-tax.ts:392-393 주석에서 '법인 교육세 정확성은 별건'으로 유예 명시.
- **법령**: 지방세법 §151①1가(§13②③⑥⑦ 해당 시 본문 산출액×300%; 단 §11①8 법인주택은 나목 0.4%). KoreanLaw MST 282559 실측.
- **재현**: 대도시 설립 5년내 법인이 상가 10억 매매(§13② 8%) → 지방교육세 코드=10억×0.4%=4,000,000. 가목 정당액=[10억×(4%−2%)×20%]×300%=12,000,000 → 8,000,000 과소. 사치성+대도시법인(§13⑦ 비주택)도 동일 0.4% 과소. (§13① 본점·공장은 §151①1가 열거 제외라 0.4%가 정답 — corp_housing=§13의2① 법인주택도 나목 0.4% 정답.)
- **수정안**: surchargeTypeForEdu(또는 calcLocalEducationTax)가 corpSurchargeResult의 metro_corp_5yr/headquarters_metro_combined/luxury_corp를 §151①1가 대상으로 인식해 본문액×300% 적용. 법인 §11①8 주택은 나목(0.4%) 유지.
- **검증**: law·numeric·reachability 3렌즈 전부 CONFIRMED(MEDIUM). surchargeTypeForEdu 조기반환·isSurcharged=true 전달·0.4% 붕괴·8백만 과소·전 파이프라인 도달 실측. R3-01/C-4(luxury 과대)와 반대방향·별개 분기. 대도시 법인 5년내 비주택이라는 특정 조합이나 명확한 법령 위반·법정 1/3 부과라 MEDIUM.

### #10 [MEDIUM] R3-09 — 자경농지 §6① 감면 시 농특세법 §4 10호 비과세 미반영 — 농특세 과대

- **위치**: lib/tax-engine/acquisition-tax.ts:400 · **과세방향**: 과대
- **내용**: 농특세법 §4 10호는 지특법 §6①(자경농민 감면) 대상 농지·임야의 취득세를 농특세 비과세로 명시. 그러나 엔진은 calcTaxWithAdditional(:384)에서 농지 세율기준 ruralSpecialTax를 산정해 totalTax(:400)·result(:588)에 포함하고, self-cultivation 감면(:442-459)은 취득세 본세 50%만 차감할 뿐 농특세를 0으로 만들지 않는다. selfCultivResult.isEligible=true여도 additional.ruralSpecialTax 잔존, calcRuralSpecialTax는 자경 여부를 전혀 모른다. §6① 농지 농특세를 0 처리하는 경로가 코드 어디에도 없음. (R3-02 농특세 산식버그와 독립 — 여기서는 §4 비과세 자체 미반영.)
- **법령**: 농어촌특별세법 §4 10호('「지방세특례제한법」 제6조제1항의 적용대상이 되는 농지 및 임야에 대한 취득세'는 농특세 비과세). KoreanLaw MST 285905 §4 10호 본문 실측.
- **재현**: 자경농민(farmingYears≥2, 면적·거리 요건 충족)이 과세표준 5억 농지 3% 유상취득. calcRuralSpecialTax=500,000이 totalTaxAfterReduction에 잔존하나 §4 10호상 0이어야 함 → 500,000 과대(R3-02 산식 정정 후엔 1,000,000이 전액 비과세 대상).
- **수정안**: selfCultivResult.isEligible(또는 §6① 적용대상 농지)이면 additional.ruralSpecialTax=0 처리하고 totalTax·steps·결과필드에서 제외. 면적한도 초과분은 §6① 미적용 논란이 있어 정밀 처리 검토.
- **검증**: law·numeric·reachability 3렌즈 전부 CONFIRMED(MEDIUM). §4 10호 본문 실측·land_farmland 3%에서 500,000 잔존·전 파이프라인 도달 실측. 명문 비과세를 전면 미반영한 과대(법 근거 없는 불리). 자경농민 특정 시나리오이나 엔진이 명시 지원하는 정당 케이스라 MEDIUM.

### #11 [MEDIUM] R3-10 — 주택 6~9억 선형보간 취득세를 §11①8나 4자리 확정세율이 아닌 무한정밀로 산출

- **위치**: lib/tax-engine/acquisition-tax-rate.ts:64 · **과세방향**: 비결정
- **내용**: calcLinearInterpolationTax(:56-66)가 floor(v×(2v−9억)/300억) 즉 반올림하지 않은 정확 세율로 세액을 산출하고, linearInterpolationRate(:34-45)는 10만분율(5자리)로 반올림. §11①8나는 '소수점이하 다섯째자리에서 반올림하여 소수점 넷째자리까지' 확정세율을 요구하며 취득세=과세표준×round4(세율)이어야 한다. 부담부증여 유상분(:429-430)도 동일. 정확세율이 4자리 세율보다 낮을(반올림 up 구간=과소) 수도 높을(down 구간=과대) 수도 있어 방향이 값에 따라 갈림. R1 앵커(numeric-precision-r1:81 onerousTax=11,666,666)가 비법정 정밀값 고정.
- **법령**: 지방세법 §11①8나('다음 계산식에 따라 산출한 세율. 이 경우 소수점이하 다섯째자리에서 반올림하여 소수점 넷째자리까지 계산') + §11① 본문(과세표준×표준세율). KoreanLaw MST 282559 실측.
- **재현**: 과세표준 7억: 법정 round4(0.0166667)=0.0167→11,690,000, 코드 11,666,666 → 23,334 과소. 8억: 법정 0.0233→18,640,000, 코드 18,666,666 → 26,666 과대. 경계(899,250,000) 최대오차 ≈44,963. 부담부증여 유상분도 동일. 서울 아파트 전형 6~9억 매매 전건에 발동하나 오차 상한 ~45,000원 유계.
- **수정안**: 세율을 다섯째자리 반올림→넷째자리로 확정(round4)한 뒤 floor(과세표준×round4Rate)로 세액 산출. linearInterpolationRate 4자리 통일, 부담부증여 유상분(:429-430) 동일 적용. R1 anchor 법정값 정정.
- **검증**: law·numeric·reachability 3렌즈 전부 CONFIRMED(MEDIUM). §11①8나 문언·7억/8억 원단위 재현·경계 45,000·전 파이프라인(최빈 시나리오) 도달 실측. R1 '정합 판정' 영역 재검증 지시대로 오케스트레이터·부담부증여 관점에서 비정합 확인, N-2 BigInt 수정이 4자리 요건을 놓쳐 재보고 예외 부합. 최빈이나 오차 유계·양방향이라 MEDIUM 하위.

### #12 [LOW] R3-08 — 합병·분할 주식취득(isMergerOrSplitShare) 과점주주 간주취득 무조건 면제 — 법 근거 없는 과소(크래프트 POST 한정)

- **위치**: lib/tax-engine/acquisition-deemed.ts:82 · **과세방향**: 과소
- **내용**: assessMajorShareholder가 input.isMergerOrSplitShare===true이면 지분율·자산가치와 무관하게 isSubjectToTax:false, deemedTaxBase:0으로 과점주주 간주취득을 전부 면제한다(:82-95). §7⑤에 합병·분할 주식취득 포괄면제 규정 없음(엔진 주석도 인정). 지특법 §57의2⑤는 7개 특정사유·추징요건·2027.12.31 일몰의 협소 면제. UI(DeemedMajorShareholderSection.tsx:46)는 false 고정, API 변환기(acquisition-tax-api.ts:405-415)는 이 필드를 스프레드하지 않아 정상 클라이언트 경로로는 도달 불가. 그러나 Zod(acquisition-input.ts:126)가 optional boolean 허용 + route가 parsed.data 직전달 → 직접 POST로 true 주입 시 엔진 전액 면제. R2 미해결 잔여로 명시된 조사대상.
- **법령**: 지방세법 §7⑤(합병 포괄면제 부존재), 지특법 §57의2⑤(협소·조건부·일몰 면제). KoreanLaw MST 282559·286607·287223 실측.
- **재현**: 합병으로 과점주주(취득 후 60%) 도달, 법인 부동산 시가표준액 100억, deemedInput.majorShareholder.isMergerOrSplitShare=true로 API POST → 취득세 0. 정답=100억×60%×2%=120,000,000. 전액 과소. 단 정상 UI 사용자는 항상 120,000,000 산출(라이브 버그 아님).
- **수정안**: 최소한 Zod(:126)에서 isMergerOrSplitShare 제거로 API 도달 차단. 포괄 면제 분기 제거하고 합병·분할도 원칙적 과점주주 간주취득 과세, 면제 필요 시 §57의2⑤ 호별 요건+취득일(≤2027.12.31)+추징조건 개별판정.
- **검증**: law·numeric·reachability 3렌즈 CONFIRMED(correctedSeverities LOW·MEDIUM·LOW → 다수 LOW). numeric 렌즈는 세액변경(12번째 sync point) 관점에서 MEDIUM 유지 주장했으나, law·reachability 렌즈가 '제품 UI 완전 격리 + 자해적 크래프트 POST만 트리거·제3 수혜자 없음'을 근거로 LOW 강등 — 최종 LOW. 잠복 dead branch로 향후 UI 오배선 시 침묵 과소 위험.

### #13 [LOW] R3-12 — 자경농지 거리요건의 OR(동일·인접 시군구 거주) 미모델 — 30km 초과 입력 시 감면 부당거부

- **위치**: lib/tax-engine/acquisition-self-cultivation-reduction.ts:126 · **과세방향**: 과대
- **내용**: 지특령 §3①2호는 '시·군·구/인접 시·군·구 거주' 또는 '30km 이내 거주' 중 하나만 충족하면 되는 OR 요건이나, 엔진은 farmlandLocationDistance>30km이면 무조건 ineligible(:126-130→:140-148 reductionAmount=0)로 30km 프롱만 모델링한다. SelfCultivationInput에 시군구 거주 boolean이 없고 UI(Step5)도 거리(km)만 수집(도움말은 OR을 명시하면서). 대형 군 등에서 동일/인접 시군구 거주하나 직선거리 30km 초과 자경농민을 부당거부. distance undefined면 :126 가드로 통과하므로 발생범위 좁음.
- **법령**: 지방세특례제한법 시행령 §3①2호·§3②2호('…시·군·구 또는 잇닿은 시·군·구에 거주하거나 소재지로부터 30km 이내 거주' — 선택적 OR). KoreanLaw MST 287191 실측.
- **재현**: 농지 소재지와 동일 시·군 거주하나 직선거리 35km인 자경농민이 farmlandLocationDistance=35 입력 → 거리초과로 isEligible=false → 취득세 50% 감면 전부 거부. 예: 농지 유상 3%×시가표준 5억=본세 15,000,000 → 7,500,000 감면 부당 거부(과대). 테스트 #C4(distance=40)가 30km-only 오모델 고착.
- **수정안**: 동일/인접 시군구 거주 boolean을 별도 입력으로 받아 OR 판정하거나, 거리요건 미충족만으로 전부 거부하지 않도록 완화(거주요건 별도 확인). anchor #C4 동반 정정.
- **검증**: law·numeric·reachability 3렌즈 전부 CONFIRMED(LOW). §3①2호·§3②2호 OR 본문·전 파이프라인 도달·7,500,000 부당거부 재현 실측. 명문(프롱A)이 부여한 적격을 근거 없이 거부한 과대이나 대형 군 동일/인접 시군구+직선 30km 초과+정직 입력이라는 좁은 지리 조합 필요, distance 미입력 시 통과로 우회 가능 → LOW.

### #14 [LOW] R3-14 — 생애최초 고급주택(9~12억) §36의3 감면 firstHomeReduction 미반환으로 배제 가능

- **위치**: lib/tax-engine/acquisition-surcharge/index.ts:282 · **과세방향**: 과대
- **내용**: 사치성 분기(:234-292)의 return 객체에 firstHomeReduction이 포함되지 않아, 취득가 9~12억 고급주택을 생애최초 유상취득하면 surchargeDecision.firstHomeReduction=undefined→first_home 후보 미push→200만 감면 배제. §36의3① 괄호단서는 §13의2 세율만 배제하고 §13⑤(사치성)엔 침묵하며 고급주택 배제 명문도 없음(배제=미성년자·부담부증여만). 시행령 §28④3호(에스컬레이터/67㎡+수영장 고급주택)는 시가표준액 요건 없어 취득가액≤12억과 중첩 도달 가능.
- **법령**: 지방세특례제한법 §36의3①(취득당시가액 12억 이하 주택 유상취득 감면 — 고급주택 배제 명문 없음, §13의2 세율만 배제). KoreanLaw MST 286607·287223 실측.
- **재현**: 무주택자가 10억(연면적 331㎡ 초과 or 수영장 단독) 고급주택 유상취득(isFirstHome=true, isLuxuryProperty=true) → 취득세 110,000,000, firstHomeReduction 미반환으로 200만 감면 배제. 감면 존속이 맞다면 2,000,000 과대. 무주택자의 첫 주택이 고급주택인 저빈도 케이스.
- **수정안**: §13⑤ 사치성 중과가 §36의3 감면 배제사유인지 유권해석 확정 후, 배제사유가 아니라면 사치성 주택 분기에서도 calcFirstHomeReduction(input, undefined)를 반환(surchargeRate>0.03 가드 우회)하도록 보완.
- **검증**: law·numeric CONFIRMED(LOW), reachability 렌즈는 refuted(NOT_A_BUG) — realVotes 2로 생존. 이견 근거: luxury_housing 세율은 항상 basicRate+8%p(≥9%)>3%라 calcFirstHomeReduction의 surchargeRate>0.03 가드가 어차피 isEligible=false로 귀결 → 세액 영향 0(다른 중과 분기와 결과-동치). §36의3가 §13⑤ 중과 고급주택에 감면 존속한다는 유권해석이 확립되지 않아 200만 과대 확정성 낮음. 저빈도·확정성 미흡으로 LOW 하위(수정 전 유권해석 확인 필요).

### #15 [LOW] C-3 — 지방교육세 결과 단계 표시 산식이 '과세표준 × 0.4%'로 하드코딩되어 실제 산출액과 불일치

- **위치**: lib/tax-engine/acquisition-tax.ts:508 · **과세방향**: 표시오류
- **내용**: 결과 steps의 지방교육세 항목 formula 문자열이 분기와 무관하게 항상 '과세표준 × 표준세율 2% × 20% = 과세표준 × 0.4%'로 고정(line 508). 실제 amount(additional.localEducationTax)는 calcLocalEducationTax의 분기별로 다른 값 — 주택 유상=본세×10%, 사치성=1.4%/1.8%, 상속·증여=(표준−2%)×20%. formula가 암시하는 금액과 표시 amount가 달라 산출근거로서 모순. 하드코딩 0.4%는 4% 일반유상·다주택 중과 나목에서만 우연히 일치. amount 자체는 정확(totalTax 합산은 실제 branch 값)이라 세액 무영향.
- **법령**: 지방세법 §151①1(주택 유상=해당세율×50%×20%, 사치성=가목, 다주택=나목 0.4%). KoreanLaw MST 282559 실측(amount는 법령상 정확, formula만 드리프트).
- **재현**: 5억 주택 1% 유상취득: 지방교육세 amount=본세 500만×10%=500,000인데 표시 산식 '과세표준×0.4%'(=5억×0.4%=2,000,000)로 안내 → 사용자 재계산 시 4배 불일치. 상속 2.8%(실제 800,000 vs 산식 2,000,000)·증여 3.5%(1,500,000 vs 2,000,000)·농지 3%(1,000,000 vs 2,000,000)도 어긋남.
- **수정안**: 지방교육세 step의 formula를 calcLocalEducationTax의 실제 분기(주택유상·사치성·다주택·일반)에 맞춰 동적 생성.
- **검증**: law·numeric·reachability 3렌즈 전부 CONFIRMED(LOW). formula 하드코딩·5억 주택 4배 불일치 재현·결과뷰 렌더 도달 실측. amount(세액)는 정확하고 표시 산식만 드리프트라 프로젝트 규칙(표시-only=LOW)대로 LOW. 흔한 분기 전반 불일치라 표시 결함 중 우선.

### #16 [LOW] R3-13 — 생애최초 감면 산식 표시가 소형주택 300만·정액공제 방식을 무시(200만 하드코딩)

- **위치**: lib/tax-engine/acquisition-tax.ts:523 · **과세방향**: 표시오류
- **내용**: Step8 표시(:523)가 first_home 감면 산식 formula에 FIRST_HOME_MAX_REDUCTION(200만)을 무조건 interpolate하여, isSmallHouseFirstHome로 실제 300만 한도가 적용돼도 표시는 '한도 2,000,000'으로 어긋난다(닫는 괄호 누락). 같은 step의 label(:427)은 '소형주택 300만 한도'로 표기되어 상호 모순. 실제 감면액(bestReduction.amount, :419-422)은 min(취득세, 300만/200만)으로 정확 산정되므로 세액 무영향. 후보의 '×100%가 정액공제 오안내' 2차 주장은 약함(한도 X 주석이 상한 전달, min과 동치).
- **법령**: 지방세특례제한법 §36의3①1호(소형주택 300만 한도)·2호(일반 200만 한도) — 면제 또는 정액공제. KoreanLaw MST 286607 실측(상수·감면액은 정확, 표시 산식만 200만 고정).
- **재현**: 소형주택 생애최초, 산출세액 500만 → 실제 300만 정액공제 정확 적용되나 결과 화면 산식은 '취득세 본세 × 100% (한도 2,000,000'로 표시되어 label(300만)과 상충 오안내.
- **수정안**: isSmallHouseFirstHome에 따라 한도(200/300만) 동적 표기, 닫는 괄호 보완, 산출세액≤한도(면제) vs >한도(정액공제) 구분 문구.
- **검증**: law·numeric·reachability 3렌즈 전부 CONFIRMED(LOW). numeric 렌즈는 감면액 자체 정확(refute 불가한 세액오류 없음)을 확인하되 표시 드리프트는 CONFIRMED. isSmallHouseFirstHome 전 배선 도달·label↔formula 300만/200만 모순 실측. 세액 무영향 표시-only라 LOW.

### #17 [LOW] R3-16 — 과세표준 표시 '천원 미만 절사' 오문구 + acquisition-tax-base.ts 헤더/주석 조문라벨 드리프트

- **위치**: lib/tax-engine/acquisition-tax-base.ts:8 · **과세방향**: 표시오류
- **내용**: (1) 결과 화면 과세표준 formula가 '(천원 미만 절사)'로 출력(acquisition-tax.ts:471-472)되나 취득세 과세표준은 절사 규정이 없어 실제 미절사(코드도 truncateToThousand 미호출, TAX_BASE_TRUNCATION 상수 미사용). 타입주석도 동일 드리프트. (2) acquisition-tax-base.ts 헤더 docblock(:5-9)·섹션주석(:49,54,128)이 §10의4를 '부담부증여', §10의5를 '연부취득'으로 오기(실제 §10의4=원시취득, §10의5=차량·기계장비 특례). 반환 legalBasis 상수는 정확(ORIGINAL_TAX_BASE §10의4, BURDENED_GIFT §10의2⑥)이라 계산·근거표시 무영향, 주석·표시 문구 한정.
- **법령**: 취득세 과세표준 절사 규정 없음(원 단위). §10의4=원시취득, §10의5=차량·기계장비 특례. KoreanLaw MST 282559 실측.
- **재현**: 세액·근거 산출 무오류. 표시 문구가 절사 없는 원 단위 계산을 절사한 것처럼 오안내. 향후 유지보수 시 §10의4를 부담부증여로 오인해 로직 수정하면 §10의2⑥ 산식과 어긋날 위험.
- **수정안**: acquisition-tax.ts:471-472 '(천원 미만 절사)'→'(원 단위)', types 주석 및 acquisition-tax-base.ts 헤더/섹션 조문라벨을 현행 §10의2~§10의6 실제 제목으로 정정.
- **검증**: law·numeric·reachability 3렌즈 전부 CONFIRMED(LOW). truncateToThousand 미호출(무절사)·§10의4/§10의5 조문 오기·반환 상수는 정확 실측. D2·D8 병합. 계산 무관 표시-only + 소스주석 드리프트라 프로젝트 규칙대로 LOW.

### #18 [LOW] R3-15 — additionalTaxDetail 결과 필드를 엔진이 생성하지 않아 '부가세 산출 상세' 카드·PDF 섹션 항상 dead

- **위치**: lib/tax-engine/acquisition-tax.ts:564 · **과세방향**: 표시오류
- **내용**: AcquisitionTaxResult.additionalTaxDetail(types:655)이 선언되고 결과뷰가 소비(AcquisitionTaxResultView.tsx:387 PDF 섹션 등록·542 카드 렌더 가드)하나, 엔진 calcAcquisitionTax 반환(:564-635)·isExempt 반환·부담부증여 헬퍼 어디서도 additionalTaxDetail을 세팅하지 않는다(리포 전역 할당 0건). 따라서 항상 undefined → 부가세 상세 카드는 어떤 입력에서도 미렌더, surtax-detail 인쇄 leaf 미등록. 농특세·지방교육세 금액 자체는 top-level 필드(:588-589)로 메인 명세에 정상 표시되므로 세액 무영향, 표시기능·인쇄항목만 dead.
- **법령**: N/A (표시-only, 세액 무영향). 관련 부가세 근거(지방교육세 §151①1·농특세 §5)는 메인 명세에서 정상 반영.
- **재현**: 읍·면 100㎡ 면제·주택 유상 교육세 케이스에서 사용자가 '부가세 산출 상세' 카드/PDF 섹션을 기대하지만 undefined라 미노출. 세액은 정확하나 산출근거 상세 UI 전부 미표시.
- **수정안**: 엔진 반환 객체에 additionalTaxDetail 구성 추가, 또는 노출 계획이 없다면 결과 타입·결과뷰 카드·PDF 섹션 등록 제거.
- **검증**: law·numeric·reachability 3렌즈 전부 CONFIRMED(LOW). 할당 0건(grep)·항상 undefined·카드/leaf 영구 미렌더·부가세 금액은 top-level로 정상 표시 실측. 세액 무영향 옵셔널 필드 침묵 누락 sync-gap이라 LOW.

### #19 [LOW] R3-17 — 간주취득 과세표준 근거를 §10의6이 아닌 §7(DEEMED_ACQUISITION)로 반환 — 인용 드리프트

- **위치**: lib/tax-engine/acquisition-tax-base.ts:82 · **과세방향**: 표시오류
- **내용**: determineTaxBase 간주취득 분기(:77-83)와 acquisition-deemed.ts 결과가 과세표준 legalBasis로 ACQUISITION.DEEMED_ACQUISITION('지방세법 §7')을 반환한다. 과세표준 근거는 §10의6(지목변경 ①, 개수 ③, 과점주주 ④)이므로 인용 부정확. 계산값은 별도 산정되어 무영향. 다만 도달성 렌즈가 지적: 실제 렌더되는 '과세표준' step은 acquisition-tax.ts:474에서 legalBasis: ACQUISITION.TAX_BASE('§10')를 하드코딩하므로 납세자가 보는 근거는 §7이 아니라 §10 — 후보의 '§7로 표시' 실패 시나리오는 발생하지 않고 §10의6 미열거라는 더 경미한 인용-완전성 흠집만 남음.
- **법령**: 지방세법 §10의6(간주취득 과세표준). §7④⑤는 '취득으로 본다' 납세의무 근거일 뿐. KoreanLaw MST 282559 실측.
- **재현**: 간주취득 결과 aggregate legalBasis 배열에 과세표준 근거로 §7이 push되나 이미 납세의무 근거로 §7④⑤가 존재해 Set dedup으로 소멸. 산출세액 오류 없음. §10의6은 렌더 표면 어디에도 미열거(경미).
- **수정안**: 간주취득 과세표준 step의 legalBasis를 §10의6(지목변경 ①, 개수 ③, 과점주주 ④)로 세분 표기.
- **검증**: law·numeric CONFIRMED(LOW), reachability 렌즈는 refuted(NOT_A_BUG) — realVotes 2로 생존하나 최약. 이견 근거: 렌더되는 과세표준 step이 §10을 하드코딩(§7 아님)해 후보 실패 시나리오가 도달 불가, taxBaseResult.legalBasis(§7)는 dedup으로 소멸. §10의6 미열거라는 경미한 인용-완전성 흠집으로 재규정. 표시-only·세액 무영향이라 LOW 최하위.
