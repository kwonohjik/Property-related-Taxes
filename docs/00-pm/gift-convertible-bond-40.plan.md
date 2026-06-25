# 전환사채등의 주식전환등에 따른 이익의 증여 (§40) — 보완 구현 계획서 (PLAN)

> **출처**: 상속·증여세 실무해설 「제2장 증여재산의 유형별 예시규정 — 3·4. 전환사채 등에 관한 증여세과세」(첨부 이미지 30장, 국세청 2016 실무해설 p.343 등)
> **작성일**: 2026-06-25 / **브랜치**: `feat/gift-convertible-bond-40` / **작업트리**: `.claude/worktrees/gift-cb-40`
> **검증 근거**: KoreanLaw MCP(상증법 §40·§4의2⑥·§47①·§55①3 / 상증령 §30·§53⑧3·§58의2 / 상증칙 §10의2·§18의3, 현행 MST 276123/283637/284609) + 현행 엔진 anchor probe 실측
> **상태**: 계획(Plan) — Do 미착수. Pre-Do anchor(Phase 0) 우선 실행으로 디자인 환류 예정.

---

## 0. 요약 (TL;DR)

현행 `lib/tax-engine/gift-deemed/convertible-bond.ts`는 §40 4개 caseType(`acquisition`/`conversion`/`conversion_reverse`/`transfer`)을 이미 구현. **교재 4개 계산사례를 현행 엔진에 직접 통과(probe)시킨 결과**:

| 사례 | 거래유형 | 기대 증여재산가액 | 현행 엔진 | 판정 |
|---|---|---:|---:|:---:|
| 1 | ① §40①1호가 저가취득 | 120,000,000 | 120,000,000 | ✅ 시가·취득가 input 전제 |
| 2 | ② §40①1호나 신주인수권증권 균등초과 | 700,000,000 | 700,000,000 | ⚠️ 시가·인수가(초과분 70%) 수동 선계산 전제 |
| 3 | ④ §40①2호가 취득후 전환 | 380,983,600 | 380,983,600 | ⚠️ 이자손실분·기과세분 수동 input, theoretical 8,333 일치 |
| 4 | ⑤ §40①2호나 초과인수 전환 | 526,264,550 | A=1,051,264,550 / B=741,864,550 | ❌ **구조적 재현 불가** |

**핵심 결함 (사례4 = ⑤ 주주 초과인수 후 전환)**: `bondConversion`이 단일 `increasedShares`를 ㉡(교부주식가액 가중평균 분모)와 이익승수(교부받은 주식수)에 **동시 사용** → ⑤ 초과인수 전환에서 "전환등 증가주식수(1,000,000)" ≠ "교부받은 초과분 주식수(700,000)"를 분리할 수 없음. (②는 인수·취득, ⑥ 제3자는 교부 전부라 무관)
검증: 두 필드를 분리하면 `(6,750−5,000)×700,000 − 698,735,450 − 0 = 526,264,550` 성립.

**해결 범위**: 갭 6종(구조 1·산식 2·자동화 3) + 부수규정 4종. 시가는 기존 설계 원칙대로 input 유지.

---

## 1. 사례 개요

### 1.1 8개 거래단계별 유형 (상증법 §40① — KoreanLaw 검증완료)

| # | 거래 | 유형 | 증여재산가액 산식 | 기준금액 | 현행 caseType |
|:--:|---|---|---|---|---|
| ① | 인수·취득 | 특수관계인 저가취득 (§40①1호가) | 시가 − 인수·취득가액 | Min(시가30%,1억) | `acquisition` |
| ② | 인수·취득 | 최대주주·특수관계 주주 균등초과 저가인수 (§40①1호나) | (시가 − 인수가)×**초과분** | Min(시가30%,1억) | `acquisition`(초과분 수동) |
| ③ | 인수·취득 | 주주 아닌 제3자(최대주주 특수관계인) 저가인수 (§40①1호다) | 시가 − 인수·취득가액 | Min(시가30%,1억) | `acquisition` |
| ④ | 주식전환 | 특수관계인 취득자 전환 (§40①2호가) | (교부주식가액−전환가액)×교부주식수 − 이자손실분 − 기과세이익 | 1억 | `conversion` |
| ⑤ | 주식전환 | 최대주주·특수관계 주주 균등초과 인수후 전환 (§40①2호나) | 위 ④ × **초과분 주식수** | 1억 | `conversion`(❌결함) |
| ⑥ | 주식전환 | 주주 아닌 제3자(최대주주 특수관계인) 인수후 전환 (§40①2호다) | 위 ④ **교부 전부**(제3자=균등배정 baseline 없음) | 1억 | `conversion`(④와 동일) |
| ⑦ | 주식전환 | 고가전환(교부주식가액<전환가액)으로 기존주주 이익 (§40①2호라) | (전환가액−교부주식가액)×증가주식수×특수관계인 전환전 지분율 | 0원(전부과세) | `conversion_reverse` |
| ⑧ | 양도 | 특수관계인에게 고가 양도 (§40①3호) | 양도가액 − 시가 | Min(시가30%,1억) | `transfer` |

※ §40①2호 **마목은 삭제**(KoreanLaw 검증). 별도 "전환가능기간 중 전환사채 양도" cap(§30①2 단서)은 §5.4 참조.

### 1.2 4개 계산사례 anchor (교재 본문 — 최종 검증값 + 중간값)

#### 사례1 — ① 특수관계인 저가취득 (교재 image 10~11)
```
전환사채 시가 1,030,000,000 (전환불가기간 §58의2②1나: 원금현가 862,610,000 + 이자연금현가 137,390,000 + 취득전일발생이자 30,000,000)
취득가액 910,000,000
증여재산가액 = 1,030,000,000 − 910,000,000 = 120,000,000
기준금액 = Min(1,030,000,000×30%=309,000,000, 1억) = 1억 → 120M ≥ 1억 ∴ 과세
```

#### 사례2 — ② 신주인수권증권 균등초과 저가인수 (교재 image 14)
```
신주인수권증권 시가 = Max(① §58의2②1가 698,735,450, ② §58의2②2다 1,050,000,000) = 1,050,000,000
  ② = 인수가능 주식가액(6,500×700,000) − 배당차액(0) − 신주인수가액(5,000×700,000) = 4,550,000,000 − 3,500,000,000 = 1,050,000,000
인수가액 = 500 × 1,000,000 × 70%(초과분) = 350,000,000
증여재산가액 = 1,050,000,000 − 350,000,000 = 700,000,000
기준금액 = Min(1,050,000,000×30%=315,000,000, 1억) = 1억 → 700M ≥ 1억 ∴ 과세
※ 본인지분 30% 초과분 70%(700,000주) 기준으로 시가·인수가 모두 평가
```

#### 사례3 — ④ 특수관계인 취득후 전환 (교재 image 20~21)
```
교부주식가액 = Min(㉠ 전환일후 2개월 종가평균 9,500, ㉡ 이론주가 8,333) = 8,333
  ㉡ = [(9,000×1,000,000)+(5,000×200,000)] / (1,000,000+200,000) = 8,333
전환가액 5,000 · 교부주식수 200,000
이자손실분 = ㉠(발행이율3% PV 1,000,000,000) − ㉡(적정8% PV 834,383,600) = 165,616,400  [상증칙 §10의2, n=4]
인수시 기과세이익 = 120,000,000 (사례1)
증여재산가액 = (8,333−5,000)×200,000 − 165,616,400 − 120,000,000 = 666,600,000 − 285,616,400 = 380,983,600
기준금액 = 1억 → 과세
```

#### 사례4 — ⑤ 초과인수 주주 전환 (교재 image 23~24)
```
교부주식가액 = Min(㉠ 8,200, ㉡ 6,750) = 6,750
  ㉡ = [(8,500×1,000,000)+(5,000×1,000,000)] / (1,000,000+1,000,000) = 6,750
전환가액 5,000 · 교부받은 주식수 = 1,000,000 중 균등지분(30%) 초과분 700,000(70%)
이자손실분 = (50억 − 적정8% PV 4,001,806,500) × 70% = 998,193,500 × 70% = 698,735,450
인수시 기과세이익 = 0
증여재산가액 = (6,750−5,000)×700,000 − 698,735,450 − 0 = 1,225,000,000 − 698,735,450 = 526,264,550
기준금액 = 1억 → 과세
```

---

## 2. 현행 엔진 실측 (anchor probe — `feedback_pre_anchor_verification` 충족)

`__tests__/tax-engine/gift-deemed/_probe-cb40.test.ts`(throwaway, 삭제됨)로 4개 사례를 현행 엔진에 직접 통과시킨 콘솔 실측:

```
[사례1] { applied: true, value: 120000000, expected: 120000000, ok: true }
[사례2] { applied: true, value: 700000000, expected: 700000000, ok: true }   ← 시가/인수가 초과분 수동 선계산 전제
[사례3] { applied: true, value: 380983600, expected: 380983600, ok: true }   ← theoretical=8333, 이자손실분·기과세 수동 input
[사례4-A increasedShares=1,000,000] { value: 1051264550, theoretical: 6750 }  ← 이익승수 오류(×1,000,000)
[사례4-B increasedShares=700,000]   { value: 741864550,  theoretical: 7058 }  ← ㉡ 오류(분모 700,000)
[사례4] expected=526,264,550, A.ok=false, B.ok=false                          ← 단일 필드로 재현 불가 확정
```

**결론**: 사례1·3은 적정 input으로 정확 재현. 사례2는 초과분 수동 선계산 시 재현. **사례4는 구조 결함으로 어떤 input 조합으로도 재현 불가** — Phase A 필수.

---

## 3. 법령 검증 결과 (KoreanLaw MCP — 위임체인 끝까지 추적)

```
법 §40① 본문/각호/각목/단서
  ├─ 단서 "기준금액"        → 영 §30②  (1호 Min(시가30%,1억)=법①1·3호 / 2호 1억=법①2호 / 3호 0원=라목)
  ├─ ② "이익계산방법"       → 영 §30①  (1호 시가−취득가 / 2호 전환 / 3호 라목 / 4호 양도)
  ├─ ② "교부주식가액"       → 영 §30⑤  (1호 전환시 / 2호 양도시 산식 + 상장 Min·라목 Max 단서)
  └─ 영 §30①2호 "이자손실분" → 칙 §10의2  (PV@사채발행이율 − PV@적정할인율)
                                  └─ 적정할인율 = 영 §58의2②1호가목
                                        └─ "재정경제부령으로 정하는 이자율" = 칙 §18의3 = 연 8%
```

### 3.1 검증 핵심 결과
- **§40①**: 1호(가·나·다목 인수취득), 2호(가·나·다·라목 주식전환, **마목 삭제**), 3호(양도), 단서(기준금액 미만 제외). 코드 4분기 라벨이 법 구조와 정확히 일치.
- **§30②**: 기준금액 — 영§30①1호·4호(=법①1·3호) Min(시가30%,1억) / 영§30①2호(=법①2호) 1억 / 영§30①3호(=법①2호라) 0원. **현행 코드 4분기 매핑 전부 일치**.
- **§30⑤1 단서 (교부주식가액 Min/Max)**: 주권상장법인등은 전환등 후 1주당 평가가액이 가중평균 산식값보다 **적은 경우 그 가액**(Min, 가·나·다목), **높은 경우 그 가액**(Max, 라목). 비상장은 가중평균 이론주가만. → **현행 코드는 ㉡(이론주가)만 계산, Min/Max 단서 미구현** (G2).
- **이자손실분 = 상증칙 §10의2** (PV@사채발행이율 − PV@적정할인율). 단서: 신주인수권증권 전환 시 §58의2②1가 평가액. ⚠️ **§10의3 아님**(§10의3은 초과배당 소득세상당액 — 무관). `types.ts:248` 주석은 이미 §10의2로 정확.
- **적정할인율 8% = 상증칙 §18의3** → 영 §58의2②1가. 교재 적정이자율 연혁: 2010.11.05~ 8% / 2002.11.08~2010.11.04 6.5% / 2002.07.10~2002.11.07 7.0% / 2001.01.01~2002.07.09 7.5%.
- **§58의2 평가**(시가 input 전제이므로 참고): ②1호 가목(신주인수권증권: 발행이율PV − 적정PV, 음수0)·나목(기타: 낮은이율PV + 발생이자). ②2호 가~마목(전환가능기간 Max 평가).
- **할증배제 = 상증령 §53⑧3호** (KoreanLaw 본문 직접조회 확정 — 교재 image 29의 "§53⑥3"은 **구판 항번호**, 현행은 **⑧3호**. §53⑥은 "중소기업 정의"): "제28조·제29조·제29조의2·제29조의3 및 **제30조**에 따른 이익을 계산하는 경우" 최대주주 할증평가(법 §63③) 배제. **§40② 위임 계산조문이 영 §30**이므로 §40 전환이익은 할증배제 대상 **포함**. ⚠️ 상증법 §53(증여재산공제)과 혼동 금지 — 할증배제는 **시행령** §53⑧3호.
- **연대납부 면제 §4의2⑥**: 단서 제외목록에 "**제40조**" 명시 → 증여자 연대납부의무 면제 확정(교재 image 29 일치). ※ §4의2⑤(증여세 면제) 대상은 아님 — ⑥항 연대납부 면제로 구분.
- **최대주주 정의·모집발행 제외**: ②⑤(나목)의 "최대주주"=영 §30③ "최대주주등 중 보유주식수 최다 1인". §40①1호나목은 주권상장법인 유가증권 모집발행(영 §30④=자본시장법 시행령 §11③ 간주모집 제외) 단서 — 시가·초과분 input 범위에선 산식 영향 없으나 UI 안내 권장.

### 3.2 합산배제·과세표준 (KoreanLaw 본문 확정 — 종전 미결 R2 해소)
- **§47① 합산배제증여재산 = §40①2호·3호만** (④⑤⑥⑦⑧): 본문 "…제40조제1항제2호·제3호…의 가액은 제외(합산배제증여재산)". → **§40①1호(①②③ 인수·취득)는 합산배제 비대상** → 일반 10년 합산. **Phase E에서 caseType 분기 필수**(CB-ACQ류는 합산배제 처리 금지).
- **§55①3호 과세표준 "3천만원 공제" 현행 존재 확정**: "합산배제증여재산: 그 증여재산가액에서 **3천만원을 공제**한 금액". 적용대상 = 합산배제증여재산(§40①2·3호)에 **한정**. §40①1호(①②③)는 §55①4호 일반경로(과세가액−§53·§53의2·§54). (교재 image 2 "합산배제−3천만−감정평가수수료" 일치)

---

## 4. GAP 분석

| ID | 영역 | 현행 | 교재 요구 | 영향 사례 | 공수 | Phase |
|---|---|---|---|---|:--:|:--:|
| **G1** | conversion 주식수 분리 | 단일 `increasedShares`(㉡분모+이익승수 겸용) | 전환등 증가주식수 ≠ 교부받은 주식수(초과분) 분리 | ⑤(사례4) ※⑥은 전부라 기본동작 | ★★★ | A |
| **G2** | 교부주식가액 Min/Max | ㉡ 이론주가만 | 상장 Min(㉠시세평균,㉡)·라목 Max (§30⑤1 단서) | ④⑤⑥⑦(사례3·4) | ★★ | A |
| **G3** | 이자손실분 자동계산 | input echo | PV@발행이율 − PV@적정 (§10의2) | ④⑤⑥(사례3·4) | ★★ | B |
| **G4** | 초과분 비율 산정 | input에 baked | 균등지분 초과분 자동(시가·인수가·이자손실분 안분) | ②⑤(사례2·4) ※③⑥ 제3자=전부 | ★★ | D |
| **G5** | 적정할인율 | 없음 | ~~시대표~~ → **현가계수 input에 내재**(Do 단순화, §18의3 8%는 현가계수로 표현) | B 종속 | ★ | B |
| **G6** | 전환사채 양도 cap | 없음 | 전환가능기간 양도 시 Min(전환이익, 양도차익) (§30①2 단서) | (사례 외) | ★★ | E |
| **G7** | 증여세 합산배제·과세표준 | 미연계 | **§40①2·3호(④~⑧)만** 10년 합산배제+3천만 공제 / ①②③은 일반 (§47①·§55①3 확정) | ④~⑧ | ★★ | E |
| **G8** | 연대납부 면제 | 미연계 | §40 연대납부 면제 (§4의2⑥) | 전체 | ★ | E |
| **G9** | 할증배제 | 시가 input이면 N/A | 상증령 §53⑧3호 (자동평가 시만) | (시가 input 유지로 N/A) | — | — |
| **G10** | 이자손실분 lawRef | breakdown lawRef 부재 | "상증칙 §10의2" 상수 부여 | 결과뷰 | ★ | A |

> **시가(전환사채·신주인수권증권 §58의2) 자동평가는 SCOPE OUT** — `types.ts:166` 설계 원칙(자본거래 의제는 시가=§60·§63 평가가액 input 직접 주입)에 따라 시가는 input 유지. 사례1·2는 시가 input으로 재현. 추후 별도 평가 도구(`/tools/`)로 분리 가능.

---

## 5. 산식 명세 (교재 본문 + 법령 발췌)

### 5.1 인수·취득 ①②③ (§40①1호 / 영 §30①1)
```
증여재산가액 = (시가 − 인수·취득가액) × [균등초과분 비율]    ※ ①③은 비율=1, ②는 초과분 비율
기준금액 = Min(시가 × 30%, 100,000,000)
```

### 5.2 주식전환 정방향 ④⑤⑥ (§40①2호 가·나·다 / 영 §30①2)
```
증여재산가액 = (교부주식가액 − 1주당 전환가액) × 교부받은 주식수 − 이자손실분 − 인수시 기과세이익
  교부주식가액 = (상장) Min(㉠ 전환일후 2개월 종가평균, ㉡ 이론주가) / (비상장) ㉡
  ㉡ 이론주가 = [(전환전 1주평가 × 전환전 발행주식총수) + (전환가액 × 전환등 증가주식수)] ÷ (전환전 발행주식총수 + 전환등 증가주식수)
  교부받은 주식수(creditedShares) = (④⑥ 교부 전부 / ⑤ 균등초과분)   ※ ⑥(제3자)은 균등배정 baseline 없어 교부 전부
기준금액 = 100,000,000
※ 전환사채 양도(전환가능기간) 시: Min(위 전환이익식, 양도차익=양도가액−취득가액)  [영 §30①2 단서] (G6, Phase E)
```

### 5.3 주식전환 라목 ⑦ (§40①2호 라 / 영 §30①3)
```
증여재산가액 = (1주당 전환가액 − 교부주식가액) × 전환등 증가주식수 × 특수관계인 전환전 지분율
  교부주식가액 = (상장) Max(㉠, ㉡) / (비상장) ㉡   [라목은 Max — §30⑤1 단서]
기준금액 = 0 (전부과세)
```

### 5.4 양도 ⑧ (§40①3호 / 영 §30①4)
```
증여재산가액 = 양도가액 − 전환사채등 시가
기준금액 = Min(시가 × 30%, 100,000,000)
```

### 5.5 이자손실분 (상증칙 §10의2 — G3)
```
이자손실분 = ㉠ − ㉡   (n = 취득일부터 만기까지 남은 기간)
  ㉠ = 만기상환금액(원금)을 사채발행이율 R로 취득당시 현재가치 할인 = 원금×PV계수(R,n) + 연이자×연금현가계수(R,n)
  ㉡ = 만기상환금액을 적정할인율 r(8%)로 현재가치 할인 = 원금×PV계수(r,n) + 연이자×연금현가계수(r,n)
  ※ 초과인수 전환(⑤만 — ②는 인수·취득이라 이자손실분 없음): 이자손실분(full) × 초과분비율. 이 안분은 **자동계산 헬퍼/변환계층에서만** 수행. 엔진 코어는 최종 interestLoss를 그대로 차감(재안분 금지 — 이중곱 방지).
  ※ 신주인수권증권 전환 시: §58의2②1가 신주인수권증권 가액 (별도 산식)
```
- 사례3 검증: 10억 − 834,383,600 = 165,616,400 (n=4, R=3%, r=8%; ㉠=발행이율 할인 ≈액면 10억 — 표면이율=발행이율이라 근사)
- 사례4 검증: (50억 − 4,001,806,500) × 70% = 998,193,500 × 70% = 698,735,450 (n=5)
- ✅ **현가계수 input → 0원 정확 (Do 확정)**: ㉠=액면(par bond — 발행이율 PV=액면) + ㉡=공시 적정율 현가계수(×1e5 `applyRateFraction` 정수곱). 직접 `(1+r)^-n` 계산은 교재 표 반올림과 사례3 약 300원·사례4 6,500원 차 → **현가계수 input 채택, tolerance 불요**. 사례3·4 `toBe` 통과 확인.

### 5.6 초과분 비율 ②⑤ (G4)
```
균등배정 주식수 = 전환사채 총인수가능주식수(totalSubscribableShares) × 본인 전환전 지분율(ownPreRatio)
초과분 주식수 = 인수(전환) 주식수(subscribedShares) − 균등배정 주식수
초과분 비율 = 초과분 주식수 ÷ 인수(전환) 주식수
  사례2·4: 총인수가능 1,000,000 · 본인지분 30% · 전량 인수 → 초과분 700,000(70%)
```
※ **단일 진실원**: 초과분 자동산정은 자동계산 헬퍼/변환계층에서만 수행 → 엔진 코어에는 도출된 최종값(②=초과분반영 시가/인수가, ⑤=creditedShares·초과분반영 interestLoss)만 전달. 엔진은 초과분 개념을 모름. 직접입력 모드(creditedShares 직접)와 **상호배타**(§7 D-1). ⑥(제3자)·③(제3자)은 균등배정 없음 → 초과분 비율 N/A(교부 전부).

### 5.7 부수규정 (Phase E)
- **할증배제**(상증령 §53⑧3호): 시가 input 전제로 사용자가 할증 미포함 시가 입력 → 엔진 무처리. (자동평가 도입 시만 적용)
- **연대납부 면제**(§4의2⑥): §40은 증여자 연대납부의무 면제 → 증여세 연계 시 플래그.
- **합산배제·과세표준**(§47①·§55①3 확정): **§40①2·3호(④~⑧)만** 합산배제증여재산 → 10년 합산 제외 + 과세표준 3천만 공제. **§40①1호(①②③)는 일반 합산·일반 과세표준(§55①4호)**. 증여세 마법사 연계 시 caseType 분기 필수.

---

## 6. 케이스 매트릭스 (8유형 전수 enumerate — 적용/미적용 경계 포함)

| ID | caseType | 거래유형 | 조건 | 산식 | 기준금액 | 비고 |
|---|---|---|---|---|---|---|
| CB-ACQ-1 | acquisition | ① | 특수관계 저가취득, 이익≥기준 | 시가−취득가 | Min(30%,1억) | 사례1 anchor |
| CB-ACQ-2 | acquisition | ① | 이익<기준 | 0 | Min(30%,1억) | 미적용 경계 |
| CB-ACQ-EXCESS | acquisition | ② | 균등초과(초과분 비율) | (시가−인수가)×초과분 | Min(30%,1억) | 사례2 anchor (D) |
| CB-ACQ-3RD | acquisition | ③ | 제3자 저가인수(전부) | 시가−취득가 | Min(30%,1억) | ①과 동일 산식(균등배정 없음) |
| CB-CONV-1 | conversion | ④ | 취득후 전환, net≥1억 | (교부−전환)×교부수−이자손−기과세 | 1억 | 사례3 anchor |
| CB-CONV-FAIL | conversion | ④ | net<1억 | 0 | 1억 | 미적용 경계 |
| CB-CONV-EXCESS | conversion | ⑤ | 주주 초과인수 후 전환 | 위 × **초과분** 교부수(creditedShares) | 1억 | 사례4 anchor (A+D) |
| CB-CONV-3RD | conversion | ⑥ | 제3자 인수 후 전환(전부) | 위 × **교부 전부** | 1억 | ④와 동일(creditedShares=increasedShares) |
| CB-CONV-MIN | conversion | ④⑤⑥ | 상장 ㉠<㉡ | 교부=Min(㉠,㉡) | 1억 | Min 단서 (G2) |
| CB-CONV-XFER-CAP | conversion | ④ | 전환가능기간 전환사채 양도 | Min(전환이익, 양도차익=양도가−취득가) | 1억 | §30①2 단서 (G6, **Phase E**) |
| CB-REV | conversion_reverse | ⑦ | 고가전환, 기존주주 이익 | (전환−교부)×증가수×지분율 | 0 | 라목 Max 단서 |
| CB-REV-MAX | conversion_reverse | ⑦ | 상장 ㉠>㉡ | 교부=Max(㉠,㉡) | 0 | Max 단서 (G2) |
| CB-TRANSFER | transfer | ⑧ | 고가양도, 이익≥기준 | 양도가−시가 | Min(30%,1억) | |
| CB-TRANSFER-FAIL | transfer | ⑧ | 이익<기준 | 0 | Min(30%,1억) | 미적용 경계 |

---

## 7. 구현 단계 (Phase 분할)

### Phase 0 — Pre-Do anchor (필수 선행)
4개 교재 사례 anchor를 `__tests__/tax-engine/gift-deemed/convertible-bond-textbook-cases.test.ts`에 작성(현재 실패 상태 확보). 사례1·3은 통과, 2·4는 실패 → 설계 환류 기준점. (`feedback_pre_anchor_verification`)

### Phase A — 구조 결함 수정 [필수 / 사례4 차단 해소]
- **A-1 (G1)**: `ConvertibleBondInput`에 `creditedShares?: number`(교부받은 주식수) 추가. `bondConversion` 이익승수를 `creditedShares ?? increasedShares`로 변경. ㉡ 가중평균은 `increasedShares` 유지. **하위호환: ④(특수관계인 취득)·⑥(제3자)은 교부 전부 → creditedShares 미입력=increasedShares. ⑤(주주 초과)만 creditedShares=초과분 명시.** creditedShares는 엔진 이익승수의 **단일 진실원**(Phase D 자동도 최종적으로 이 값을 도출). **3중 패턴**: ⑧ validate에서 creditedShares는 non-required(미입력=increasedShares), ④ API변환·UI display fallback 모두 `?? increasedShares` 미러(`mirror-pattern`).
- **A-2 (G2)**: `listedMarketAvg?: number`(전환일 전후 2개월 종가평균) + `isListed?: boolean` 추가. 상장이면 `conversion`=Min(listedMarketAvg, 이론주가), `conversion_reverse`=Max. 비상장이면 이론주가.
- **A-3 (G10)**: `legal-codes/inheritance-gift.ts`에 `CONVERTIBLE_BOND_INTEREST_LOSS = "상증칙 §10의2"` 상수 추가 → breakdown 이자손실분 row lawRef 부여.
- **검증**: 사례4 = `(6,750−5,000)×700,000 − 698,735,450(input) − 0 = 526,264,550` ✅, 사례3 회귀 유지.

### Phase B — 이자손실분 자동계산 [자동화 확장]
- **B-1 (G5)**: 적정할인율은 **현가계수 input에 내재**(Do 단순화 — `CB_APPROPRIATE_RATE_HISTORY`/`resolveCbAppropriateRate`는 계산 미사용 dead code라 제거). 사용자가 증여일 시대의 공시 현가계수표 값 입력.
- **B-2 (G3)**: 신규 **순수 헬퍼** `presentValue(future, rate, n)` + `bondInterestLoss({maturityAmount, couponRate, appropriateRate, n})`. **명시 모드 플래그 `autoInterestLoss: boolean`**(presence-derive·silent fallback 금지 — `feedback_no_silent_apportion_fallback`): ON이면 raw입력(만기상환금액·사채발행이율·잔여연수) required → 헬퍼가 산출(⑤ 초과분 시 ×초과분비율) → **최종 interestLoss를 엔진에 전달**. OFF면 interestLoss 직접입력 required. **엔진 코어 `bondConversion`은 interestLoss를 재안분하지 않음**(이중곱 방지). 호출 위치: lib/calc 변환계층(권장 — 엔진 최소화) 또는 엔진 dispatcher pre-step 중 택1(Do 결정) — 어느 쪽이든 코어는 최종값만 차감.
- **검증**: 사례3 이자손실분=165,616,400 (현가계수 input → 0원 정확), 사례4 full=998,193,500 → ×70%(헬퍼 안분)=698,735,450.
- **결정사항**: 현가계수 직접계산 vs input — Pre-Do anchor 실측 후.

### Phase D — 초과분 비율 [자동화 확장]
- **D-1 (G4)**: `ownPreRatio?: {numer,denom}`(본인 전환전 지분율) + `subscribedShares?`(인수 주식수) + `totalSubscribableShares?`(총인수가능주식수) 추가. **명시 모드 플래그 `autoExcess: boolean`**: ON이면 헬퍼 `computeExcessRatio({subscribedShares, totalSubscribableShares, ownPreRatio})`가 초과분 비율 산정 → ②는 시가·인수가에, ⑤는 creditedShares(=초과분)·interestLoss 안분에 반영해 **엔진 입력값을 도출**. OFF면 creditedShares·초과분반영 시가/인수가 직접입력. **상호배타(둘 다 입력 금지) — dual-truth 차단**. 엔진 코어는 초과분 개념 없음(도출된 최종값만 수신). ⑥③(제3자)은 균등배정 없음 → autoExcess N/A(교부 전부).
- **검증**: 사례2 = (1,050,000,000−350,000,000) [초과분 70% 반영값], 사례4 초과분 700,000·이자손실분 ×70%.

### Phase E — 부수규정 (증여세 연계) [후속]
- **G6 양도 cap**: §8에 `bondTransferGainForCap?`(양도차익) 추가 → `conversion` 양도 시 Min(전환이익, 양도차익).
- **G7 합산배제·과세표준** (§47①·§55①3 **확정**): §40①2·3호(④~⑧)만 합산배제+3천만 공제, §40①1호(①②③)는 일반 → **caseType 분기 필수**. 증여세 엔진 연계(합산배제 플래그).
- **G8 연대납부 면제** (§4의2⑥): §40 연대납부 면제 플래그.
- 증여세 마법사 prefill 연계 시점.

### Phase F — UI · 14 동기화 지점
신규 필드(`creditedShares`·`isListed`·`listedMarketAvg`·모드토글 `autoInterestLoss`/`autoExcess`·raw입력 `bondMaturityAmount`/`bondCouponRate`/`bondRemainingYears`/`bondAppropriateRate`·`ownPreRatio`/`subscribedShares`/`totalSubscribableShares`·`bondTransferGainForCap`) UI 노출 + 14지점 전수 동기화(§9). 모드토글은 `ToggleCard`(R5), 분수는 % string→{numer,denom} 변환(④).

### Phase G — 테스트 · 통합
4 사례 `toBe()` anchor + 경계값(미적용) + Min/Max 분기 + 회귀(`npx vitest run __tests__/tax-engine/gift-deemed/`).

---

## 8. 타입 설계 (ConvertibleBondInput 확장)

**엔진 코어 입력** — `bondConversion`/`bondAcquisition` 등은 **최종값만** 수신·차감(자동계산·재안분 없음):
```ts
export interface ConvertibleBondInput {
  caseType?: "acquisition" | "conversion" | "conversion_reverse" | "transfer";
  bondMarketValue: number;            // 전환사채등 시가 (§58의2 평가결과 input; ② 초과분반영값)
  // ── 인수·취득 (①②③) ──
  acquisitionPrice?: number;          // ② 초과분반영 인수가
  // ── 양도 (⑧) ──
  transferPrice?: number;
  // ── 주식전환 (④⑤⑥⑦) ──
  preConvPrice?: number;              // 전환등 전 1주당 평가가액
  preConvShares?: number;             // 전환등 전 발행주식총수
  conversionPrice?: number;           // 1주당 전환가액등
  increasedShares?: number;           // 전환등 증가주식수 (㉡ 가중평균 분모/분자)
  creditedShares?: number;            // [신규 A-1] 교부받은 주식수=이익승수 (미입력=increasedShares; ④⑥ 전부 / ⑤ 초과분)
  isListed?: boolean;                 // [신규 A-2] 주권상장법인 여부 (Min/Max 단서)
  listedMarketAvg?: number;           // [신규 A-2] 전환일 전후 2개월 종가평균
  interestLoss?: number;              // 이자손실분 §10의2 (최종값 — 초과분 안분 포함; 엔진 재안분 금지)
  acquisitionGainPrior?: number;      // 인수시 기과세이익 (§30①1)
  bondTransferGainForCap?: number;    // [신규 Phase E/G6] 전환사채 양도차익(양도가−취득가) — Min cap 한도
  // ── 라목 (⑦) ──
  relatedPreRatio?: { numer: number; denom: number };
}
```
**자동계산 raw 입력 + 모드 플래그** — 폼 상태에 보유, **헬퍼/변환계층(lib/calc)에서 소비**해 위 코어 입력(creditedShares·interestLoss·시가/인수가)을 도출. 엔진 코어 미사용:
```ts
// (폼·변환계층 전용 — 엔진 input에 포함하지 않음. lib/calc 또는 dispatcher pre-step에서 처리)
autoInterestLoss?: boolean;          // [Phase B] ON=PV 자동 / OFF=interestLoss 직접입력 (presence-derive 금지)
bondMaturityAmount?: number;         // 만기상환금액(원금)
bondCouponRate?: { numer, denom };   // 사채발행이율 R
bondRemainingYears?: number;         // 취득일~만기 잔여연수 n
bondAppropriateRate?: { numer, denom }; // 적정할인율 r (미입력=시대표 8%)
autoExcess?: boolean;                // [Phase D] ON=초과분 자동 / OFF=creditedShares·초과분값 직접입력 (autoInterestLoss와 독립)
ownPreRatio?: { numer, denom };      // 본인 전환전 지분율
subscribedShares?: number;           // 인수(전환) 주식수
totalSubscribableShares?: number;    // 전환사채 총인수가능주식수 (균등배정 산정)
```
※ 모든 신규 필드 optional + caseType·모드플래그별 게이트. `feedback_three_state_optional_mode_toggle`·`feedback_no_silent_apportion_fallback` 준수(모드 OFF 시 해당 직접입력 required, presence-derive 금지). **autoInterestLoss·autoExcess 상호배타 아님**(독립 토글) — 단 각 토글 내에서 자동/직접은 상호배타.

---

## 9. 14 동기화 지점 (file:line — 실측)

| # | 지점 | 파일:line | 신규필드 작업 |
|:--:|---|---|---|
| ① | 폼 상태 | `components/calc/deemed-gift/shared.tsx:142-153` | `cbCreditedShares`·`cbAutoInterestLoss`(bool)·`cbAutoExcess`(bool)·분수 string(`cbOwnPreRatioPct`·`cbCouponRatePct`·`cbAppropriateRatePct`) 등 추가 |
| ② | initial | `components/calc/deemed-gift/shared.tsx:292-302` | INITIAL_DEEMED 초기값(`""`·`false`) |
| ③ | normalize | **N/A — deemed-gift는 별도 normalize 함수 없음**(실측: shared.tsx에 `DeemedFormState` 타입만, normalize/migrate 부재). 신규 필드는 ①②로 충분(sessionStorage는 누락 키 undefined→initial 머지 시 주의) | — |
| ④ | API 변환 | `lib/calc/gift-deemed-api.ts:167-195` | 🔴 caseType별 return에 신규 필드 명시(침묵 strip). **분수 string→{numer,denom} 변환**(`cbRelatedPreRatioPct` 선례: `Math.round(parseDecimal()*100), denom:10000`). **autoInterestLoss/autoExcess ON 시 헬퍼로 creditedShares·interestLoss 도출 후 전달**. creditedShares는 `?? increasedShares` display fallback 미러 |
| ⑤ | UI 위젯 | `components/calc/deemed-gift/capital-forms.tsx:329-377` ConvertibleBondFields | 조건부 렌더 확장 |
| ⑥ | 사이드바/합계 | `DeemedGiftCalculator.tsx` | 해당 시 |
| ⑦ | 결과 카드 | `components/calc/results/DeemedGiftResultView.tsx:29-65` | breakdown 자동 표시(추가 작업 최소) |
| ⑧ | validation | `lib/calc/gift-deemed-validate.ts:127-138` (convertible_bond 분기 실재) | caseType·모드별 required. **creditedShares는 non-required**(미입력=increasedShares — UI통과↔validate차단 모순 금지). 모드 ON 시 raw입력 required / OFF 시 직접입력 required (3중 패턴) |
| ⑨⑩ | Zod enum | `lib/validators/gift-deemed-input.ts` (convertible_bond literal) | 변경 없음 |
| ⑪ | 자산수준 | N/A (gift-deemed 단건) | — |
| ⑫ | Zod 입력객체 | `lib/validators/gift-deemed-input.ts:206-219` convertibleBondSchema | 🔴 신규 필드 `.optional()` 추가(누락 시 침묵 strip) |
| ⑬ | fetch body | `DeemedGiftCalculator.tsx` (buildDeemedGiftInput 경유) | ④ 통해 자동 |
| ⑭ | Route 매핑 | `app/api/calc/gift-deemed/route.ts:42` | 타입 단언 — Zod 통과분만 도달 |

> 🔴 **침묵 strip 3대 위험**(`feedback_api_zod_schema_sync`): ④ API 변환 누락 → 엔진 undefined / ⑫ Zod 미정의 → safeParse 자동제거 / ⑤ UI 미렌더 → 입력불가. 신규 필드는 ④⑫⑤ grep 자가점검 필수.

---

## 10. 재사용 헬퍼 + 신규 헬퍼

**재사용 (직접)**:
- `computeWeightedPerShare()` (`capital-helpers.ts`) — ㉡ 이론주가 (현행 사용 중)
- `applyRateFraction()`·`safeMultiplyThenDivide()`·`applyRate()` (`tax-utils.ts`) — 분수 정수연산
- `resolveFreeLoanRate()` 패턴 (`data/gift-deemed-rates.ts:19-32`) — 적정이자율 시대표 복제용
- `twoMonthSurroundingAvg()` (`lib/kiwoom/averages.ts`) — 전환일 전후 2개월 종가평균(상장 listedMarketAvg 자동조회 시)

**신규 구현**:
- `presentValue(future, rate:{numer,denom}, n)` — 정수 PV (할인율 가변, `safeMultiplyThenDivide` 기반 또는 BigInt 거듭제곱)
- `bondInterestLoss({maturityAmount, couponRate, appropriateRate, n})` — §10의2 PV 차액
- `bondInterestLoss({maturityAmount, annualCoupon, pvFactorAppropriate, annuityFactorAppropriate})` — ㉠par−㉡현가계수PV (0원 정확). 적정할인율 시대표는 현가계수 input에 내재(별도 미구현)
- `computeExcessRatio({subscribedShares, totalSubscribableShares, ownPreRatio})` + `applyExcessRatio` — 초과분 비율 (Phase D, ②⑤ 한정)

---

## 11. anchor 테스트 목록 (Phase G)

| ID | 입력 | 기댓값 | 의존 Phase |
|---|---|---:|:--:|
| TC-1 | 사례1 (시가 1,030,000,000·취득 910,000,000) | `120,000,000` | 현행 |
| TC-2 | 사례2 (신주인수권증권 초과분: 시가 1,050,000,000·인수 350,000,000) | `700,000,000` | 현행 / D 자동 |
| TC-3 | 사례3 (㉡8,333·전환5,000·교부200,000·이자손실165,616,400·기과세120,000,000) | `380,983,600` | 현행 / B 자동 |
| TC-4 | 사례4 (㉡6,750·전환5,000·증가1,000,000·교부700,000·이자손실 **698,735,450=이미 ×70% 최종값**) | `526,264,550` | **A** / B·D 자동 |
| TC-MIN | 상장 ㉠<㉡ → 교부=Min | (산식) | A-2 |
| TC-REV-MAX | 라목 상장 ㉠>㉡ → 교부=Max | (산식) | A-2 |
| TC-CONV-3RD | ⑥ 제3자 전환(교부 전부, creditedShares 미입력) | (산식) | A-1 |
| TC-CAP | 전환가능기간 양도 cap | Min(전환이익,양도차익) | E |
| TC-FAIL-ACQ/CONV/XFER | 기준 미달 경계 | `0`/미적용 | 현행 |

> ⚠️ TC-4의 interestLoss input(698,735,450)은 **이미 초과분 70% 반영된 최종값** — Phase A(직접입력) 경로에서 엔진은 재안분하지 않음. Phase B/D 자동 경로는 full 998,193,500 → ×70%를 **헬퍼에서** 산출. 두 경로가 동일 526,264,550으로 수렴해야 함(이중곱 회귀 가드).
> 이자손실분 자동(B) anchor는 현가계수 input → 0원 정확(Do 확정). bondInterestLoss·computeExcessRatio·api-auto 통합 테스트 통과.

---

## 12. 리스크 · 미결정

| ID | 항목 | 내용 | 처리 |
|---|---|---|---|
| R1 | ~~이자손실분 현가계수 오차~~ **해소** | 교재 반올림 계수 vs 직접계산 차 | **확정**: ㉠=액면(par) + 적정율 현가계수 input(×1e5 applyRateFraction) → **0원 정확 재현**(사례3·4 toBe 통과). tolerance 불요 |
| R2 | ~~합산배제·3천만~~ **해소** | §47① 합산배제=§40①2·3호만 / §55①3 3천만 공제 현행 존재 — **KoreanLaw 본문 확정**(§3.2) | §40①1호(①②③)는 일반경로 → Phase E caseType 분기 |
| R3 | 초과분/이자손실 자동 vs 직접 | 두 값을 자동·직접 두 경로로 산출 가능 | **상호배타 모드 플래그**(autoExcess·autoInterestLoss) — 양립 금지(dual-truth 차단). 엔진은 최종값만 수신·재안분 금지(이중곱 차단) |
| R4 | 시가 자동평가 범위 | §58의2 SCOPE OUT 유지 여부 | 설계원칙(시가 input) 준수 권고 |
| R5 | UI caseType별 필드 폭증 | 신규 다수 필드 조건부 노출 | ToggleCard "이자손실분 자동계산"/"초과분 자동"(명시 플래그) 접이식. presence-derive 금지 |
| R6 | ⑥/③ 제3자 모델링 | 제3자는 균등배정 baseline 없음 → 교부 전부 | ⑥=④와 동일(creditedShares=increasedShares), ⑤만 초과분. 매트릭스·산식 반영 완료 |

---

## 13. Definition of Done (Phase 공통)

- [ ] 케이스 매트릭스(§6) 전 분기 enumerate — 적용/미적용 경계 포함
- [ ] 4개 교재 사례 `toBe()` anchor 통과 (TC-1~4)
- [ ] 산식 KoreanLaw 본칙 검증 기록 (§3 완료 — §40·§30·§10의2·§18의3·§53⑧3·§4의2⑥·§47①·§55①3 전수 확정)
- [ ] 14 동기화 지점(§9) — ④⑫⑤ grep 자가점검
- [ ] API fallback ↔ validation 동기화 (`feedback_validation_sync_8th_point`)
- [ ] `npx tsc --noEmit` 0건
- [ ] `npx vitest run __tests__/tax-engine/gift-deemed/` 통과 (회귀 0)
- [ ] 브라우저/E2E 확인 (폼→계산→결과, Network request body 신규 필드)

---

## 14. 권장 실행 범위

- **최소 (사례 해결 핵심)**: Phase 0 → **A** → F → G. 시가·이자손실분·초과분은 input. → 4 사례 전부 재현(사례4 차단 해소).
- **권장 (자동화 편의)**: + Phase **B**(이자손실분 자동) + **D**(초과분 자동). → 사례2·3·4 raw 입력만으로 산출.
- **완전 (증여세 연계) — 사용자 선택 ✅**: + Phase **E**(양도cap·합산배제·연대납부). R2(§47①·§55①3) **본문 확정 완료**로 착수 가능 — §40①2·3호(④~⑧)만 합산배제·3천만 공제, ①②③ 일반 caseType 분기.

> 시가(전환사채·신주인수권증권 §58의2) 자동평가는 기존 설계 원칙(시가 input)에 따라 제외 권고. 필요 시 별도 평가도구로 분리.

---

## 15. 검토 반영 이력 (v2 — 13단계 자가검토 루프, 독립검토자 4축)

독립 검토자 4명(anchor 재계산·법령 재검증·file:line 실측·설계 정합) 병렬 검토 → 정정 16건 반영.

| 우선순위 | 정정 |
|---|---|
| Critical | (1) 할증배제 **§53⑥3호 → 상증령 §53⑧3호** (KoreanLaw 본문 직접조회 확정, 교재 §53⑥3은 구판) (2) creditedShares↔Phase D **dual-truth** → 단일 진실원·상호배타 모드 (3) 이자손실분 **이중곱** → 엔진 재안분 금지·최종값만 차감 (4) "미입력 시 자동" **정책위반** → 명시 모드 플래그(autoInterestLoss/autoExcess) |
| High | (5) §8 `totalSubscribableShares`·`bondTransferGainForCap` 누락 추가 (6) **⑥(제3자)=교부 전부**(⑤ 초과분과 구분, ④와 동일) — §1.1·§6·§7·산식 정정 (7) §47① 합산배제=**§40①2·3호만**(①②③ 제외) 확정 (8) §55①3 **3천만 공제 현행 존재** 확정 → R2 해소 |
| Medium | (9) §9③ **normalize 부재**(deemed-gift 실측) N/A (10) creditedShares **3중 패턴**(non-required·display fallback 미러) 명시 (11) 분수객체 폼 string→{numer,denom} 변환 enumerate (12) 최대주주 정의(영§30③)·모집발행 제외(영§30④) 각주 |
| Low | (13) 이자손실분 tolerance **1원→약 300원**(사례3 현가계수 반올림 실측) (14) ㉠ "발행이율 PV=액면" → "≈액면(근사)" (15) twoMonthSurroundingAvg averages.ts:183 실재 확인 (16) §0↔§1.2 사례4 중간표기 정합 |

**검산 확정**: 4개 anchor(120,000,000 / 700,000,000 / 380,983,600 / 526,264,550) 독립 재계산(Python 정수·BigInt floor) **전부 일치**. 법령 인용 전수 현행 본문 대조 완료(검증불가 0). file:line 인용 전수 실측 일치(±5).
