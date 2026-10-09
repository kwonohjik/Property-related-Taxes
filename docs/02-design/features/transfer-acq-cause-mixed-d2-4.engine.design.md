# 건물 상속·증여 + 토지 매매 (Phase D2-4) — 엔진·법령 설계: 2005.4.30. 전 건물의 ② 가액 max 비교

> 작성 2026-10-09 · 워크트리 `Property-related-Taxes-d24` (브랜치 `feat/transfer-acq-cause-mixed-d2-4`, base `6d0194a9c`)
> 선행: 계획서 `docs/00-pm/transfer-acq-cause-mixed.plan.md` §11(D1-4 토지 max)·§12(D2 건물 상속·증여) / 설계 `…-d2.engine.design.md` §1.3(V-4)·§10 / `…-d1-4.engine.design.md`. **어긋나면 계획서 §12가 우선한다.**
> 짝: UI 설계(transfer-tax-ui-senior 병행). 이 문서는 **엔진 + 법령 + ⑨~⑭ + ④·⑧ 계약**만 다룬다. 소스 수정 없음.
> ⚠️ **사용자 결정 후 달라진 점(계획서 §13 우선)**: 범위는 「주택 일괄」(이 문서 §8 Q-D24-2 권장안)이 아니라 **단독·다가구주택만**이다 — 공동주택·주택 구분 미선택은 새 leaf 분기 **Y4d**로 차단하고, 주택 구분 사실은 **명시 선택만** 싣는다(Check F1). 이 문서의 §2 S1·§3.3 Y4a~c·§8 Q-D24-2는 결정 전 기록이다.
> 검증 규약: 법령은 KoreanLaw MCP(2026-10-09 조회 — 소득세법 MST 280405 시행 2026.1.1. · 시행령 MST 290841 시행 2026.10.1. · 상증법 시행 2025.10.1.), 국세청 해석은 taxlaw.nts.go.kr을 Playwright로 열어 본문을 읽었다. 수치는 실제 `POST /api/calc/transfer` 직접 호출(mock 세율) + 손계산 일치. 읽지 못한 것은 「확인 필요」다.

---

## 0. 결론 요약

| # | 항목 | 결론 |
|---|---|---|
| 1 | ② 산식(주택 건물 파트) | **② = 최초공시 주택가격 P_F × 취득당시 건물 기준시가 B_E ÷ (최초공시 토지 기준시가 L_F + 최초공시 건물 기준시가 B_F)**. 분모에 토지 취득 시점의 토지 기준시가가 **들어가지 않는다** — 영 §164⑦ 환산주택가격의 분자(L_acq+B_acq)와 재산세과-1702의 안분 분모(L_acq+B_acq)가 같은 값이라 **약분**된다. 토지를 상속 전에 샀든 후에 샀든, 1990.8.30. 전에 샀든 결과가 같다 → **pre-1990 토지 환산 입력은 불필요** |
| 2 | 정면 근거 | 단서 2호 본문(max)·영 §164⑦·재산세과-1702(자산별 안분)·집행기준 99-164-9(취득시기가 다른 주택의 안분 사례)는 확보. **「상속·증여받은 건물 + 따로 산 토지」를 단서 2호에서 정면으로 다룬 해석례는 없다 — 확인 필요**(1702·99-164-9는 환산 맥락) |
| 3 | 범위 | **주택(`housing`) 건물 파트만 연다.** 일반건물(`building`)은 §164⑤(국세청 최초 고시 기준시가 × 기준율) 체계가 달라 계속 차단. 공동주택·단독 구분은 이 저장소의 자산 단위 §163⑨ 2호 관행(주택 2종 모두 2005.4.30. 경계, `sec164HouseStatus`)을 그대로 따른다(경계 자체는 확인 필요, U-4) |
| 4 | 엔진 계약 | D1-4 미러: ④가 ② **총액**(`buildingSec164Value`, 지분 스케일 후)을 보내고 엔진 건물 파트 취득가액 산정 한 곳에서 `max(①, ②)`. echo `acquisitionBasis{rule:"sec163_9_2", reported, sec164, adopted}`. 동점 = 평가액 |
| 5 | Y4의 변화 | 「일률 차단」 → 「주택 ∧ 경계일 전 ∧ ② 없음 → 필수 차단(field `buildingSec164Value`)」 + 「일부 양도 차단(D14-5 미러)」 + 「비주택은 종전 차단 유지」 |
| 6 | 실측 | HEAD는 2003-05-01 상속·2002-09-15 증여·1984-06-01 상속 시드 모두 400 Y4(필드 `acquisitionDate`). 2005-04-29 400 / 2005-04-30 200(경계 엄격 `<`). Y4를 우회한 시뮬레이션: 상속 시드 ②(36,000,000) 채택 247,266,000 vs ①(30,000,000)만 249,030,000(−1,764,000), 증여 시드 249,184,737 vs 250,500,000(−1,315,263) |
| 7 | 사용자 결정 | §8 — 핵심은 **Q-D24-1(② 모델 채택 여부 — 정면 근거 없음, 납세자 유리 방향)** |

---

## 1. 법령 확인

### 1.1 조문 (KoreanLaw MCP, verbatim)

- **소득세법 시행령 §163⑨ 단서 2호** (MST 290841): 「「상속세 및 증여세법」 제61조제1항제2호 내지 제4호의 규정에 의한 건물의 기준시가가 고시되기전에 상속 또는 증여받은 건물의 경우에는 상속개시일 또는 증여일 현재 「상속세 및 증여세법」 제60조 내지 제66조의 규정에 의하여 평가한 가액과 제164조제5항 내지 제7항의 규정에 의한 가액중 많은 금액」. 본문은 「상속 또는 증여(… 「상속세 및 증여세법」 제34조부터 … 제42조의3에 따른 증여는 제외한다)받은 자산에 대하여 … 상속개시일 또는 증여일 현재 … 평가한 가액 … 을 취득당시의 실지거래가액으로 본다」.
- **같은 영 §164⑦**: 「「부동산 가격공시에 관한 법률」에 따른 개별주택가격 및 공동주택가격(이들에 부수되는 토지를 포함한다)이 공시되기 전에 취득한 주택의 취득당시의 기준시가는 다음 산식에 의하여 계산한 가액으로 한다. 이 경우 당해 주택에 대하여 국토교통부장관이 최초로 공시한 주택가격 공시당시 또는 취득당시의 법 제99조제1항제1호 나목의 가액이 없는 경우에는 제5항의 규정을 준용하여 계산한 가액에 의한다.」 산식 = **최초로 공시한 주택가격 × 취득당시의 (가목의 가액 + 나목의 가액) ÷ 최초로 공시한 주택가격 공시당시의 (가목의 가액 + 나목의 가액)**.
- **같은 영 §164⑤**: 나목(일반 건물 기준시가)이 고시되기 전 취득 건물 = 「국세청장이 해당 자산에 대하여 최초로 고시한 기준시가 × … 국세청장이 고시한 기준율」. **⑥**: 법 §99①1호 다목 또는 **라목 단서**(국세청장 고시 공동주택가격)가 고시되기 전에 취득한 오피스텔·상업용 건물·**공동주택** = 최초 고시 기준시가 × 취득당시 (가+나) ÷ 최초 고시당시 (가+나).
- **소득세법 §99①1호**: 가목 토지 = 개별공시지가 / 나목 건물(다·라목 제외) = 국세청장이 산정·고시하는 가액 / **라목 주택 = 개별주택가격 및 공동주택가격**(단서: 국세청장이 결정·고시한 공동주택가격이 있으면 그 가격). **§99③2·3·4호**가 「공시 또는 고시되기 전에 취득한 토지 및 주택」·「나목 기준시가가 고시되기 전에 취득한 건물」·「다목 또는 라목 단서 … 공동주택」의 취득 당시 기준시가를 대통령령에 위임한다.
- **상증법 §61①** (시행 2025.10.1.): 2호 건물(국세청 기준시가) / 3호 오피스텔·상업용 / **4호 주택 = 개별주택가격 및 공동주택가격**. 단서 2호가 가리키는 「건물의 기준시가」는 이 2~4호다.

### 1.2 해석례

| 문헌 | 확인 | 핵심 문장(verbatim) |
|---|---|---|
| **재산세과-1702, 2009.8.17.** (ntstDcmId 010000000000130860) | Playwright로 상세 화면 본문 정독(2026-10-09) | 「「부동산가격공시 및 감정평가에 관한 법률」에 의한 개별주택가격(이에 부수되는 토지를 포함)이 공시되기 전에 취득한 주택으로서 **그 부수토지의 취득시기와 건물의 취득시기가 다른 경우** 자산별(토지, 건물) 취득당시의 기준시가는 「소득세법 시행령」 제164조 제7항의 규정에서 정한 방법으로 계산한 당해 주택의 취득당시의 기준시가를 **자산별 취득당시의** 「소득세법」 제99조 제1항 제1호 **가목 및 나목의 가액에 의하여 안분계산한 가액**으로 하는 것입니다(같은 뜻 : 서면5팀-3028, 2007.11.19.).」 (상세내용에 사실관계 없음 — 요지·회신만) |
| **양도소득세 집행기준 99-164-9** (2024.10.31판, `docs/02-design/features/housing-std-split-proportional.authority.md` §2-4 — PDF 원문 정독) | 기존 리서치 재사용(재열람 아님) | 「토지 및 건물 취득당시의 기준시가를 주택가격 최초 공시 당시의 토지 및 건물의 기준시가로 나눈 금액에 최초 공시 주택가격을 곱하여 취득당시의 기준시가를 산정한다.」 사례: 토지 1995 취득(기준시가 50) · 주택 2000 신축(30) · 최초공시 주택가격 150(공시당시 토지 150·건물 50) → 「환산주택가격 60 = 150 × (50+30) ÷ (150+50)」 → 「토지 37.5 = 60 × 50 ÷ 80, 주택 22.5」. **분자의 토지는 토지 자기 취득시, 건물은 건물 자기 취득시 기준시가다** |
| 서면인터넷방문상담4팀-1462, 2007.5.2. (010000000000042617) | 본문 정독 | 공시된 단독주택을 상증법 §61①4호로 평가할 때 「건물과 부수토지의 가액을 구분하여야 하는 경우에는 당해 개별주택가격을 평가기준일 현재 같은조 제1항제2호의 규정에 의하여 평가한 건물가액과 같은항 제1호의 규정에 의한 개별공시지가로 안분」. **공시 후(2005.4.30. 이후) 평가기준일의 ① 입력용**이다 — 경계일 전 건물의 ①(상증법 평가액)은 건물 기준시가(§61①2호)로 평가된 값을 사용자가 신고서에서 가져온다(D2 현행 「평가액 직접 입력 1칸」과 동일) |
| 안분 방식 (A)뺄셈 vs (B)비례 | `housing-std-split-proportional.authority.md` §0·§3 | (B) 비례 안분이 정본, (A) 뺄셈 근거 없음(재산세과-463 사실관계에서 음수). 이 설계는 (B)를 전제한다 |

### 1.3 질문별 판단

**a. ② 산식과 분모의 토지 시점 — 약분 (프로브 확인)**

영 §164⑦의 환산주택가격은 분자에 「취득당시의 가목+나목」을 둔다. 토지와 건물의 취득시기가 다르면 집행기준 99-164-9가 각 자산의 **자기 취득시** 기준시가를 합산한다. 1702는 그 값을 다시 **자산별 취득당시의 가목·나목**으로 안분하라고 한다. 건물 몫은

```
② = [P_F × (L_acq + B_E) ÷ (L_F + B_F)] × B_E ÷ (L_acq + B_E)  =  P_F × B_E ÷ (L_F + B_F)
```

`L_acq`(토지 취득 시점 또는 상속개시일 시점의 토지 기준시가)가 분자와 안분 분모에 **같은 값**으로 두 번 나와 사라진다. 어느 시점을 쓰더라도 결과가 같으므로 「분모에 어느 토지 시점을 쓰는가」라는 질문 자체가 소멸한다.

- **프로브(2026-10-09)**: `calculateInheritanceHouseValuation`(자산 단위 §164⑦ 엔진)에 L_acq를 600,000/300,000/1,000,000원/㎡로 바꿔 넣고(P_F 300,000,000 · L_F 200㎡×1,000,000 · B_F 50,000,000 · B_E 30,000,000) 환산주택가격을 건물 몫(× B_E ÷ 합계)으로 나눈 값 = **3회 모두 36,000,000** (환산주택가격 180,000,000/108,000,000/276,000,000). 증여 시드 2단계(환산주택가격 floor → 안분 floor) vs 1단계 floor는 L_acq=100,000,000·123,456,789 모두 29,473,684로 같다.
- **필요한 입력은 5개**: P_F, L_F(㎡당 최초공시 개별공시지가 × 면적), B_F, B_E, 면적. 양도시 개별공시지가·양도시 주택가격(자산 단위 **환산**용)은 ②(max 비교)에 불필요하다 — 자산 단위 `sec164HouseStatus`를 그대로 재사용하면 불필요한 칸을 요구하는 막다른 길이 된다. 별도 완결 판정이 필요하다.
- **한계(확인 필요 U-10)**: 위 연쇄는 1702·99-164-9(환산 맥락)를 단서 2호(취득가액 max 맥락)에 옮긴 것이다. 두 맥락 모두 「§164⑦로 계산한 당해 주택의 취득당시 기준시가를 자산별로 안분」이고 단서 2호가 「제164조 제5항 내지 제7항의 규정에 의한 가액」을 가리키므로 자연스러운 독법이나 **정면 해석례는 없다**. 검색: 국세청 해석 「상속 주택 기준시가 고시되기 전」·「개별주택가격 공시 전 상속 건물 취득가액」, 조세심판원 「상속 개별주택가격 공시 전 취득가액 많은 금액」 — KoreanLaw 검색 0건(제목 위주 검색이라 모집단 한계).
- **약분 불성립 조건**: 안분을 (A) 뺄셈으로 했다면 약분되지 않고 토지 시점이 중요해진다. (A)는 근거가 없다(위 authority §3).

**b. 비주택(일반건물) — 범위 밖, 계속 차단**

D2 leaf가 받는 자산은 `isLandBuildingSplitable`(`lib/calc/self-owns-scope.ts`: `housing` 또는 `building`)이고 엔진 `calcSplitGain`도 `propertyType housing|building`이다(`transfer-tax-split-gain.ts` 첫 줄). `building`은 영 §164⑤(최초 고시 기준시가 × 기준율) 체계라 ②의 입력이 완전히 다르고(최초 고시일·기준율표), 최초 고시일은 확인 못 했다(U-4). 현행 Y4 경계(2005.4.30.)도 일반건물에는 과도하게 넓다. **D2-4는 주택만 열고 `building`은 종전 Y4 차단(문구 유지)**. 상가·오피스텔(`commercial_building`)은 D2 대상이 아니다(`isLandBuildingSplitable` 밖).

**c. 경계일 2005-04-30**

- 단독주택: 부동산공시법상 개별주택가격 최초 공시일 = 2005.4.30. (저장소 `HOUSE_FIRST_DISCLOSURE` `lib/calc/transfer-163-9-base-date.ts:144`·`sec164-required-fields.ts:25`·엔진 `HOUSE_FIRST_DISCLOSURE_DATE`). 프로브: 2005-04-29 400 / 2005-04-30 200(엄격 `<`, `isSec163_9BuildingProviso` `transfer-split-part-cause.ts:184`).
- 공동주택: 저장소 UI 힌트가 「공동 2006-04-28」(`RedevelopmentValuationSection.tsx:235`, `redev-phd-trigger.ts:44`)로 다르다. 영 §164⑥은 라목 단서(국세청 고시 공동주택가격) 고시 전 취득의 공동주택을 별도로 둔다. **국세청 공동주택 기준시가의 최초 고시일은 확인하지 못했다(U-4)**.
- D2 폼은 단독/공동을 구별하는 입력이 없다(`deriveInheritanceHouseKind`가 동·호 유무로 파생 — 세액 무관 표시축, `transfer-tax-api-asset-basics.ts:30`). ⑫(API)에는 그 사실이 오지 않는다. **자산 단위 §163⑨ 2호 경로가 이미 주택 2종을 2005.4.30.로 함께 처리**(`sec164HouseStatus` `sec164-required-fields.ts:111`)하므로, D2-4도 같은 관행을 따르는 것이 ⑧≡⑫와 단일 진실을 지키는 유일한 길이다. 공동주택을 따로 막으려면 ⑧만 더 엄격해져 ⑧≡⑫ 격자가 깨진다. → 권장: **2005-04-30 전 주택 일괄**, 공동주택 경계는 「확인 필요」로 결과 고지(Q-D24-2).

**d. 1990.8.30. 전 토지 (pre-1990)**

- ②에서 토지 취득시점 기준시가가 약분되므로 **토지 등급환산(`calculatePre1990LandValuation`)이 ②에 들어오지 않는다.** L_F는 2005.4.30. 개별공시지가(㎡당) × 면적으로 1990 이후 값이다. D2-4는 `pre1990*` 5필드를 쓰지 않는다 → Y7(`pre1990Land` 동봉 차단) **그대로 유지**, D3의 `pre1990*` 충돌(D2 설계 §11-5)도 건드리지 않는다.
- 건물 상속·증여일이 1990.8.30. 전이어도 ② 입력은 B_E(건물 기준시가)뿐이라 영향이 없다.
- 토지를 1990.8.30. 전에 **매수**한 경우는 토지 파트 자체의 환산(토지 `estimated` 모드)이 다룬다 — D2-1 기존 동작이며 D2-4 범위 밖.

**e. 증여**

단서 2호·§164⑦ 모두 「상속 **또는 증여**」라 같은 처리다. 차이:

1. 평가기준일 = 증여일, ① = 증여 신고가액(D2 현행 `buildingAcquisitionPrice` 1칸이 정본). echo 라벨은 `SPLIT_CAUSE_VALUE_LABEL.gift`.
2. 경계일 전(< 2005.4.30.) 증여는 현실 거래에서 양도일까지 10년을 넘기므로 §97의2 이월과세(10년) 판정 위험이 없다 — 증여 D2의 알려진 한계(이월과세 대상을 `gift`로 선택, D2 설계 §5)가 경계일 전에서는 사실상 소멸한다(양도일 ≥ 2015.4.30.).
3. 부담부증여는 Y1(구조 차단) 그대로.
4. 피상속인 취득일(세율 통산)은 상속에만 있다 — ②와 무관.

**f. 의제취득일(1985.1.1.) 전 상속·증여 건물**

자산 단위 경로는 ②·③ 시점을 의제취득일로 읽는다(`transfer-163-9-base-date.ts` `sec164AcqTimePointLabel`; 엔진은 시점을 강제하지 못하고 UI 라벨이 통제). D2-4는 **B_E 라벨만 같은 규약**을 쓴다. 엔진 확인: 1984-06-01 상속 시드를 Y4 우회로 돌리면 2003-05-01 시드와 세액이 **완전히 동일**(247,266,000 — 분리 엔진에는 의제취득일 보정이 없고 장특은 실제 기산, 양도 2026년이면 15년 상한 30%가 같다). 현행 Y4가 전부 막아 이 구간은 한 번도 실행된 적이 없으므로 앵커로 고정한다.

---

## 2. 범위 매트릭스

| # | 건물 | 건물 취득일 | 토지 | D2-4 처리 | 근거 |
|---|---|---|---|---|---|
| S1 | 주택 상속 | < 2005-04-30 | 매매(overlay purchase) | **허용: ① 필수 + ② 필수 → max** | §1.3 a |
| S2 | 주택 증여(단순) | < 2005-04-30 | 매매 | 허용 (S1과 동일, 증여일) | §1.3 e |
| S3 | 주택 상속·증여 | < 1985-01-01 | 매매 | 허용 — ② 라벨만 의제취득일 | §1.3 f |
| S4 | 주택 | ≥ 2005-04-30 | 매매 | 불변(① 단독) | 현행 |
| S5 | **일반건물** `building` | < 2005-04-30 | 매매 | **차단 유지**(Y4 문구 유지) | §1.3 b |
| S6 | 주택 상속·증여 | < 2005-04-30 | 매매, 면적 입력 방식 「일부 양도」 | **차단**(D14-5 미러 — field `areaScenario`) | §3.3 |
| S7 | 주택, 부담부증여·PHD·가업상속·소유자 분리 | < 2005-04-30 | — | 차단(Y1 구조 규칙이 먼저) | 불변 |
| S8 | 주택 | < 2005-04-30 | 토지도 상속·증여 | 차단(R-X5, D3) | 불변 |
| S9 | 주택 | < 2005-04-30 | 매매, ② 부재 | **차단**(field `buildingSec164Value`) | 신규 |
| S10 | 주택 | < 2005-04-30 | 매매, ① 부재(② 있음) | 차단(Y9 `buildingAcquisitionPrice` — ②만으로 채우지 않는다 = D1-4 Check 후속과 동일) | 신규 |
| S11 | 주택, 토지 pre-1990 취득 | < 2005-04-30 | 매매(토지 1990.8.30. 전) | 허용 — ②는 토지 시점 무관 | §1.3 d |
| S12 | 지분(공유) 주택 | < 2005-04-30 | 매매 | 허용 — ① ② 같은 스케일(`applyRatio`) | §3.4 |

---

## 3. 엔진 계약

### 3.1 입력과 ④ 브리지 (D1-4 패턴 채택)

**결정: 클라이언트 브리지가 ② 총액을 만들고 엔진은 비교만 한다 (D1-4 미러).** 근거:

1. **지분 스케일을 ④ 한 곳에서 ①과 같이 처리**한다(D1-4 `makeRatioed`, 자산 단위 경로도 `applyRatio(houseValuationStdPrice, ownershipRatio)` — `inheritance-acquisition-helpers.ts` 주입부). 엔진이 원값 5개를 받으면 지분·면적 반올림 규약이 ④와 엔진에 둘로 갈린다.
2. ⑫가 요구하는 단일 사실이 하나(`buildingSec164Value > 0`)라 ⑧≡⑫ 격자가 D1-4(128셀)와 같은 모양으로 닫힌다. 원값 5개를 ⑫ 필수 판정에 넣으면 부분 입력 조합이 폭발한다.
3. echo·표시 leaf(`splitAcqBasisView`)·⑥ 사이드바가 모두 「reported/sec164/adopted」 3값 모양이라 D1-4와 재사용된다.
4. 단점 — 엔진 echo에 P_F·B_E 같은 구성값이 없다. D1-4 토지 ②도 등급 구성값이 echo에 없다. 필요하면 후속으로 산식 문자열만 클라이언트가 표시한다(엔진 변경 없음).

**신규 사실** `buildingSec164Value?: number` — 주택 건물 파트 영 §164⑦ 가액 **총액**(건물 몫, 지분 스케일 후, 양의 정수). `z.number().int().positive().optional()`.

**브리지** (신규 `lib/calc/transfer-building-sec164-bridge.ts`, D1-4 `transfer-pre1990-housing-land-bridge.ts` 미러):

```
buildingSec164Applies(asset)   = effectiveBuildingCauseMix(asset) ∧ asset.assetKind === "housing"
                                  ∧ isSec163_9BuildingProviso(mix, asset.acquisitionDate)
deriveBuildingSec164Total(asset) =
    P_F, perSqm_F, B_F, B_E, area 가 모두 양수일 때만:
    L_F   = multiplyByArea(perSqm_F, area)                       // floor(단가×면적) — 인라인 toFixed 금지
    ②100  = safeMultiplyThenDivide(P_F, B_E, L_F + B_F)           // 단일 floor, BigInt 오버플로 가드
    ②     = ratio < 1 ? applyRatio(②100, ratio) : ②100            // 지분 규약(자산 단위 houseValuationStdPrice와 동일)
    그 밖은 0
```

- 면적은 `resolveAcqAreaForStdPrice` — **일부 양도(`partial`)에서는 양도분 면적을 돌려주므로**(`transfer-tax-api-helpers.ts:299-310`) L_F가 부수토지 전체가 아니게 된다. 그래서 일부 양도는 차단(S6)이고, 그 외에는 취득 면적이다.
- 정수 규약(`lib/tax-engine/CLAUDE.md`): `Math.round` 없음, 곱셈 먼저·나눗셈 나중 단일 floor. 지분 적용은 이 저장소 단일 규약 `applyRatio`(= `floor(amount × ratio)`, `tax-utils.ts:62`)로, 단독 소유면 no-op. 반올림은 총 **2번 floor**(안분 1 + 지분 1)이고 단독이면 1번이다. 대안 `floor(P_F×B_E×지분 ÷ (L_F+B_F))` 단일 floor는 1원 이내로 갈릴 수 있으나 ① 스케일링과 자산 단위 관행을 따르는 쪽을 택한다(Q-D24-5).
- 환산주택가격을 먼저 floor하는 2단계(집행기준 99-164-9 서술 순서)와의 차이는 프로브에서 0원(L_acq 2값)이었으나 이론상 ±1원 가능하다(안분 1회로 정한 이유 — 입력 L_acq가 약분되어 필요 없다).

**`buildLandPartCausePayload`**(`lib/calc/transfer-tax-api-split.ts:272`)의 overlay `purchase` 분기에 `...(buildingSec164Applies(primary) && deriveBuildingSec164Total(primary) > 0 ? { buildingSec164Value } : {})`와 `...(buildingSec164Applies(primary) && isPartialAreaScenario(primary) ? { isPartialAreaTransfer: true } : {})` 추가. 이 함수가 단건(`transfer-tax-api.ts:500`)·다건(`multi-transfer-tax-api.ts:295`)·컴패니언(`transfer-tax-api-companion-payload.ts:206`)이 공유하므로 ④는 한 곳이다.

### 3.2 엔진 해결자

`lib/tax-engine/transfer-tax-split-acq-price.ts`에 `resolveBuildingPartAcquisition(input)` 추가 (`resolveLandPartAcquisition` :318-336 미러):

```
applies = input.landAcquisitionCause === "purchase"            // D2 overlay — 자산 단위 §163⑨ 2호 경로와 겹치지 않게
        ∧ input.propertyType === "housing"
        ∧ isSec163_9BuildingProviso(input.acquisitionCause, dayKey(input.acquisitionDate))
        ∧ sec164 > 0 ∧ reported !== undefined ∧ input.isSeparateAcquisition === true
applies → { price: max(reported, sec164),
            basis: { rule: "sec163_9_2", reported, sec164, adopted: reported >= sec164 ? "reported" : "sec164" } }
else    → { price: reported }                                   // ① 단독 — 별개 취득 아니면 비교·echo 없음
```

- `calcSplitAcquisitionPrice` :445-455의 `partCtx.buildingAcquisitionPrice`를 `buildingPartAcq.price`로, 반환에 `buildingAcquisitionBasis` 추가(:482 미러). `calcSplitGain` 입력/echo: :73-92 사실 공급 + :213 구조분해 + :367 `building: { ...buildingPart, ...echo.building, ...(buildingAcquisitionBasis ? { acquisitionBasis } : {}) }` (:368 현행은 echo만).
- **타입**: `LandAcquisitionBasis.rule`을 `"sec163_9_1" | "sec163_9_2"`로 넓힌다(`transfer-split-gain.types.ts:55`; `SplitPartResult.acquisitionBasis` :70은 건물에도 채워진다 — 타입명 개명은 호출처 1~2곳이라 이번엔 별칭 유지). 입력 타입 `buildingSec164Value?: number` (`transfer.types.ts:1177` 곁).
- **건물은 항상 `actual`**이다(Y3) — 개산공제 0, ①②는 법 §97①1호 가목 실지거래가액 의제(§163⑨). 환산 경로와 겹치지 않는다.
- 동점 = 평가액(D1-4 및 `calcPostDeemed`는 반대로 동점 = ②이지만 값이 같고 표시 라벨만 갈린다 — 분리 경로는 D1-4와 통일).
- 세액 산식·장특·세율·개산공제 변경 **0** (건물 취득가액 입력 한 값만 바뀐다).

### 3.3 leaf `collectSplitPartCauseIssues` — Y4의 변화

`transfer-split-part-cause.ts:228-234`(D2 분기 else 블록) 안, 현행 Y4 한 줄(:229-230)을 다음 순서로 교체한다(순서 = 첫 항목이 엔진 throw·⑧ 표시):

| 규칙 | 조건 | field | 요지 | 해소 |
|---|---|---|---|---|
| **Y4a 비주택** | `isSec163_9BuildingProviso` ∧ `!isHousing` | `acquisitionDate` | 종전 `BUILDING_CAUSE_PRE_DISCLOSURE_MESSAGE` 유지(일반건물은 §164⑤ 체계) | 날짜 정정/토글 끄기 |
| **Y4b 일부 양도** | provis ∧ housing ∧ `isPartialAreaTransfer` | `areaScenario` (⑫ 경로에서는 `isPartialAreaTransfer`로 매핑 — 기존 규약 `required-refines-2a.ts:409`) | 「토지 일부만 양도하면 영 §164⑦ 비교의 기준 면적(최초공시 당시 부수토지 전체)이 미확정이라 지원하지 않습니다 — 자동 안분하지 않습니다」 | 면적 입력 방식 변경 |
| **Y4c ② 필수** | provis ∧ housing ∧ `!((buildingSec164Value ?? 0) > 0)` | `buildingSec164Value` | 「건물 기준시가(개별주택가격)가 고시되기 전에 상속·증여받은 건물의 취득가액은 상속개시일(증여일) 평가액과 영 §164⑦ 가액 중 많은 금액이므로 §164⑦ 가액이 필요합니다 (영 §163⑨ 단서 2호)」 | ② 입력 |

- 신규 사실: `buildingSec164Value?: number`, `isHousing?: boolean`. `isPartialAreaTransfer`는 D1-4 사실을 **재사용**(같은 의미 — 일부 양도 + 단서 구간). 공급: 엔진 `calcSplitGain`(`input.buildingSec164Value`, `input.propertyType === "housing"`) · ⑫ `refineSplitPartCause`(`isSplitable` 인자 옆에 `isHousing` 인자 추가 — 호출 2곳 `transfer-tax-schema.ts:149`(`c.assetKind === "housing"`)·`required-refines-2a.ts:469`(`d.propertyType === "housing"`)) · ⑧ `validateLandPartCause`(④가 보내는 값: `deriveBuildingSec164Total(asset)`, `asset.assetKind === "housing"`).
- `SplitPartCauseField`에 `"buildingSec164Value"` 추가. 해소 레버를 문장으로 안내(⑧ 이동 칸은 §3.5).
- Y3(방식)·Y7(자산 단위 평가 payload 차단)·Y9(① 필수)는 **그대로**. Y7이 자산 단위 `inheritedHouseValuation` 동봉을 계속 막으므로 ②는 **독립 필드**여야 한다(자산 단위 payload 재사용 불가 — V-11 표시 드리프트·`houseValuationStdPrice` 이중 소비 방지).
- 기존 상수 `BUILDING_CAUSE_PRE_DISCLOSURE_MESSAGE`(:161)는 Y4a 전용으로 문구 축소(「일반건물은 …」) 필요 — 이 문구를 단언하는 테스트·UI 문구 `BUILDING_CAUSE_PRE_DISCLOSURE_NOTICE`(`transfer-land-part-cause.ts:170`)·`buildingCauseDateNotices`(:176)는 UI 설계가 「② 입력 안내」로 바꾼다(주택은 더 이상 막는 안내가 아니다).

### 3.4 지분 · 컴패니언 · 다건 · 결과

- **지분**: ①(`ratioed(buildingAcquisitionPrice)`)·② 모두 100% → `applyRatio`. 같은 스케일이므로 엔진은 재스케일하지 않는다(D1-4와 동일).
- **컴패니언·일괄양도**: ④는 `buildAssetPayload`가 같은 leaf 호출 → 자동. ⑫ 컴패니언 스키마는 `splitAcquisitionShape`를 spread(`transfer-tax-schema-companion.ts:71`)하므로 `transfer-tax-schema-split.ts:34`에 필드 추가가 컴패니언을 덮는다. **주 자산 스키마는 별도 정의**(`transfer-tax-schema-base-shape.ts:282`)라 두 곳이다(⑫ ×2 — 한쪽 누락은 Zod가 **조용히 strip**(`schema-base-shape.ts:8` 주석)). 일괄양도 안분의 파트 합 우선(D2-1 실측 7억)이 ② 채택 가액에도 성립하는지는 앵커로 확인(§5 A-13).
- **다건**: `multi/route.ts:200` 매핑 + ④ `multi-transfer-tax-api.ts:295`가 같은 leaf.
- **⑥ 사이드바**: 주택 파트 합계는 경계일 전·D2 유효면 결과 도착 전 pending(D14-7 미러). 결과 도착 후 분기 `transfer-per-asset-summary.ts:444`는 `splitDetail?.land?.acquisitionBasis`만 읽으므로 `|| building?.acquisitionBasis`로 확장 필요(역방향 grep으로 발견 — UI 소관).
- **⑦ 표시**: `splitAcqBasisView`(`transfer-tax-split-display.ts:126`)는 라벨이 토지 전용(`SPLIT_SEC164_VALUE_LABEL` = 「영 §164④ 가액」)이고 `splitAcqBasisFormula`(:145-147)는 「토지 취득가액 =」이 하드코딩이다. 건물은 「영 §164⑦ 가액」·「건물 취득가액 =」 — 파트·rule 인자 필요. 소비처 4뷰(`SplitGainDetailSection`·`split-acq-text`·`FilingFormTableHelpers`·`ResultPdfTransferSections`)는 UI 시니어 소관. 엔진 echo에서 `acquisitionBasis.rule`이 라벨을 결정하도록 하면 호출처 분기가 줄어든다.

### 3.5 ⑧ 계약 (UI 시니어 합의 필요)

- `validateLandPartCause`(`transfer-tax-validate-split.ts:143`) 사실에 `buildingSec164Value: deriveBuildingSec164Total(asset) || undefined`, `isHousing`, `isPartialAreaTransfer` OR 확장 추가. 이슈 필드가 `buildingSec164Value`면 `validateBuildingSec164Inputs`(신규, `validateLandSec164Inputs` :124 미러)가 **첫 미완 칸으로 이동**: 면적 → P_F → ㎡당 최초공시 개별공시지가 → B_F → B_E.
- 완결 판정은 **신규 status 함수**(`sec164BuildingPartStatus`) — `sec164HouseStatus`(양도시 개별공시지가·1990 등급 요구)를 재사용하면 ②에 쓰이지 않는 칸을 요구한다(§1.3 a). 5필드 모두 양수일 때만 ②가 생기고 부분 입력은 ②를 만들지 않는다(= ⑫ 필수 위반 = ⑧ 미완 칸 이동 — D1-4 규약).
- ⑧≡⑫ 격자: 호스트 2(상속·증여) × 날짜 3(경계 전·당일·후) × 입력(②없음/있음/① 없음/일부 양도) 전 셀에서 「⑧ 통과 ⇒ ⑫ 200」.
- 3대 정책 점검: useEffect→store 미러링 없음(파생은 읽는 쪽 함수) · **자동 안분 fallback 없음**(② 미입력은 필수 차단, 면적·기준시가로 건물 몫을 대신 채우지 않는다. 안분은 법정 산식 그 자체이며 사용자 명시 입력 5개로만 성립) · validate 동기화(④·⑧이 같은 `deriveBuildingSec164Total`).

---

## 4. 14지점 동기화

| 지점 | D2-4 변경 | 위치 |
|---|---|---|
| ① 폼 상태 | **0** 권장 — 기존 `inhHouseValHousePriceAtFirst`·`inhHouseValLandPricePerSqmAtFirst`·`inhHouseValBuildingStdPriceAtFirst`·`inhHouseValBuildingStdPriceAtInheritance` + `acquisitionArea` 재사용(자산 단위 §164⑦과 같은 물리량). 새 키가 생기면 ②③ 동반 | `calc-wizard-asset.ts:767-790` |
| ② initial / ③ normalize | 0 (①이 0이면) | — |
| ④ API 변환 | **신규 브리지 + `buildLandPartCausePayload` 확장**(3경로 자동) | `transfer-tax-api-split.ts:272` |
| ⑤ 위젯 | UI 소관 — ② 5칸 카드(D1-4 `LandSec164Card` 미러), 경계일 전 안내 문구 교체 | UI |
| ⑥ 사이드바 | pending + 결과 분기 확장(`building?.acquisitionBasis`) | `transfer-per-asset-summary.ts:444` 등 |
| ⑦ 결과 | echo `rule` 확장 + 건물용 라벨·산식 | `transfer-tax-split-display.ts` |
| ⑧ validate | `validateLandPartCause` 사실 + 신규 status/에러 + (D2 날짜 안내 교체) | `transfer-tax-validate-split.ts`, `transfer-tax-validate-building-cause.ts`, `sec164-required-fields.ts`, `transfer-tax-error-format.ts:48`(필드 라벨 `buildingSec164Value` 추가) |
| ⑨ Zod enum 메인 | 0 | — |
| ⑩ Zod enum 컴패니언 + `addPropertyRefines` | 0 | — |
| ⑪ 자산-수준 `acquisitionDate` fallback | 0 | — |
| ⑫ Zod 입력 객체 | **2곳** 필드 추가 + `refineSplitPartCause` 사실·`Required2aLike` 타입(:73)·`isHousing` 인자 | `schema-base-shape.ts:282`, `schema-split.ts:34`, `required-refines-2a.ts:360-405`, `schema.ts:149` |
| ⑬ callTransferTaxAPI body spread | 자동(`buildLandPartCausePayload` spread 3곳) — grep 확인 | `transfer-tax-api.ts:500` 등 |
| ⑭ Route 엔진 input 매핑 | **3곳** 매핑 | `engine-input.ts:333`, `multi/route.ts:200`, `bundled-split-helpers.ts:390` |
| 엔진 | leaf Y4a~c, 해결자, 반환·echo, 타입 | `transfer-split-part-cause.ts`, `transfer-tax-split-acq-price.ts`, `transfer-tax-split-gain.ts`, `types/transfer*.ts` |

⚠️ ⑫⑬⑭는 TypeScript 미감지: ⑫에서 필드가 빠지면 **침묵 strip**(② 없이 400 Y4c로 보이지만 원인은 필드 누락)이고, ⑭에서 빠지면 엔진에 ②가 없어 Y4c 400이다. 앵커로 3곳 각각 확인(§6).

**PR 분할 권장 (D1-4 미러)**: **D2-4a** 엔진·⑫·⑭·④·브리지 — ⑧은 계속 막음(화면 변화 0, 막다른 길 없음) → **D2-4b** ⑤ 위젯·⑧ 완화·⑥·⑦ 4뷰·E2E. D2-4a 동안 ⑧ 문구는 「이 계산기 화면은 영 §164⑦ 가액 입력을 받지 않아」 같은 화면 사실로 둔다(D1-4a 규약).

---

## 5. 케이스 매트릭스와 기대 수치

공통 시드(D2 predo anchor와 동일 기반): 주택, 양도 12억(토지 7억/건물 5억), 양도일 2026-06-30, 별개 취득, 파트 실가, 비과세 아님, 토지 매매(overlay `purchase`) 취득일 2020-01-10·취득가 3억, mock 세율(`makeMockRates()`).

② 입력 (상속): P_F 300,000,000 · L_F = 1,000,000원/㎡ × 200㎡ = 200,000,000 · B_F 50,000,000 · B_E 30,000,000 → ② = 300,000,000 × 30,000,000 ÷ 250,000,000 = **36,000,000**.
② 입력 (증여): P_F 280,000,000 · L_F = 750,000 × 200 = 150,000,000 · B_F 40,000,000 · B_E 20,000,000 → ② = 5.6×10¹⁵ ÷ 190,000,000 = 29,473,684.2 → **29,473,684**.

공통 손계산: 토지 양도차익 4억, 6년 보유 장특 12% = 48,000,000 → 352,000,000. 건물은 상속개시/증여일부터 23년 → 상한 30%. 기본공제 2,500,000. 과세표준 5억~10억 구간 42% − 35,940,000(mock). 지방소득세 = 결정세액 10% 절사.

| ID | 시드 | HEAD(2026-10-09) | D2-4 후 기대 | 손계산 |
|---|---|---|---|---|
| A-1 | 상속 E=2003-05-01(피상속인 1990-01-01), ①=30,000,000, ② 36,000,000 | 400 Y4 (field `acquisitionDate`) | 200, 건물 취득가 **36,000,000** (② 채택), 결정세액 **247,266,000**, 과세표준 674,300,000, 지방소득세 24,726,600, 합 271,992,600, 건물 양도차익 464,000,000·장특 139,200,000 | 건물 464.0M − 139.2M = 324.8M; 토지 352.0M; 합 676.8M − 2.5M = 674.3M × 42% = 283,206,000 − 35,940,000 = 247,266,000 |
| A-2 | A-1에서 ①=40,000,000 | 400 | 건물 취득가 40,000,000 (① 채택), **246,090,000**, 과세표준 671,500,000 | 460.0M − 138.0M = 322.0M + 352.0M − 2.5M = 671.5M × 42% − 35.94M |
| A-3 | A-1에서 ①=36,000,000(동점) | 400 | echo `adopted: "reported"`, **247,266,000** | A-1과 값 동일 |
| A-4 | A-1에서 ② 없음 | 400 Y4 | **400 Y4c** (field `buildingSec164Value`) | — |
| A-5 | A-1에서 ① 없음·② 있음 | 400 Y4 | **400 Y9** (`buildingAcquisitionPrice`) — ②만으로 채우지 않음 | — |
| A-6 | 증여 E=2002-09-15, ①=25,000,000, ② 29,473,684 | 400 | 건물 취득가 **29,473,684**, 결정세액 **249,184,737**, 과세표준 678,868,422, 건물 장특 141,157,894, 지방소득세 24,918,473 | 건물 470,526,316 − 141,157,894 = 329,368,422 + 352,000,000 − 2,500,000 = 678,868,422 × 42% = 285,124,737 − 35,940,000 |
| A-7 | 증여 ①=25,000,000만 (HEAD 대조군 — Y4 우회로 실측) | — | ②를 안 쓴 값 250,500,000 (A-6과 차이 −1,315,263) | 475.0M − 142.5M = 332.5M … 682.0M × 42% − 35.94M |
| A-8 | 상속 E=1984-06-01 (피상속인 1970-01-01), ①=30M, ② 36M | 400 | A-1과 **동일** 247,266,000 (의제취득일 효과 없음 — 실측) | — |
| A-9 | 경계 E=2005-04-29 / 2005-04-30 | 400 / 200 | 2005-04-29는 ② 필수(Y4c), **2005-04-30은 ② 없이 200**(실측 249,030,000 — ① 30M 시드) | 엄격 `<` |
| A-10 | 일반건물(`propertyType: building`) 경계일 전 | 400 Y4 | **400 Y4a** (종전 문구) | — |
| A-11 | `areaScenario partial` + 주택 경계일 전 | 400 Y4 | **400 Y4b** (`isPartialAreaTransfer`) | — |
| A-12 | 지분 50%: ①(100% 30M → ratioed 15M), ② applyRatio(36M, 0.5)=18M | — | 건물 취득가 18,000,000 (② 채택). 세액은 Do 실측 | 확인 필요(Do에서 고정) |
| A-13 | 컴패니언·일괄양도 주 자산 | 400 | 파트 합 우선 확인(D2-1 7억 동형) | Do 실측 |
| A-14 | 다건 route | 400 | 단건과 동일 세액 | Do 실측 |
| A-15 | Y7: 경계일 전 + `inheritedHouseValuation` 동봉 | 400 Y7 | **400 Y7 유지** | 불변 |

수치 출처: A-1·A-2·A-6·A-7·A-8·A-9는 `collectSplitPartCauseIssues`의 건물 경계 조건만 우회한 **임시 프로브**(삭제함)로 `POST /api/calc/transfer`를 돌려 얻었고 손계산과 모두 일치했다. 엔진이 ②를 직접 고르는 값(A-1)은 `buildingAcquisitionPrice = 36,000,000`을 넣은 세액과 같아야 한다. A-12~A-14는 구현 전 실측 필요(위 표기).

---

## 6. Pre-Do anchor 목록 (구현 전 먼저 작성)

1. **route(`__tests__/api/transfer.route.split-building-cause.d2-4.predo.anchor.test.ts`)**: A-1~A-11 활성 + A-12~A-14 `it.todo`. A-9는 **긍정 짝**(2005-04-30 200)과 **부정형**(2005-04-29 필수)을 짝으로. 현행 D2 predo anchor의 Y4 경계 테스트(2005-04-29 400, 2005-04-30 200)는 **의미가 바뀐다**(2005-04-29는 ② 없을 때만 400) — 전환 근거를 주석으로 남긴다.
2. **leaf 단위(`__tests__/tax-engine/transfer/split-part-cause.d2-4.test.ts`)**: Y4a/b/c 각각 + 순서(구조 → Y2 → Y4a/b/c → Y3 → Y7 → Y9) + `isHousing` 미지정 시 확인하지 않음(엔진 테스트 헬퍼 기본값 회귀 0).
3. **엔진 직접(`resolveBuildingPartAcquisition`)**: 채택 3분기(②/①/동점), ① 부재, 별개 취득 아님(비교·echo 없음), overlay `purchase` 없음(비교 없음 — 자산 단위 경로 침범 금지), `Date`·문자열 날짜 양쪽.
4. **⑫ 스키마 직접**: 필드 strip 방지(두 스키마) · 컴패니언 prefix 경로 · `isHousing` 공급.
5. **⑭ 3곳**: 단건·다건·번들 각각 `buildingSec164Value` 도달(엔진 echo `building.acquisitionBasis.sec164`로 관측). **리프 직접호출 anchor는 ⑫를 거치지 않는다**(memory `feedback_leaf_anchor_skips_zod_layer`) — route 경유로.
6. **브리지(`__tests__/calc/transfer-building-sec164-bridge.test.ts`)**: ② 36,000,000 / 29,473,684 / 지분 18,000,000 / 5필드 중 하나라도 0 → 0 / 단서 구간 밖 → 0 / `partial` → 0 + 사실 전송 / **L_acq 불변성**(자산 단위 `calculateInheritanceHouseValuation` 결과로 약분 교차검증, 위 프로브 3값).
7. **⑧≡⑫ 격자**: 위 §3.5 조합 전수. 「⑧ 통과 ⇒ ⑫ 200」 위반 0, 「⑧ 차단 ⇒ 이동 칸이 화면에 존재」(D1-4b 규약).
8. **표시**: `splitAcqBasisView` 건물 echo(상속·증여 라벨) + 구 echo 없는 이력 종전 문구 + rule 두 값.

---

## 7. mutation 대상

| # | 변형 | 기대 KILLED |
|---|---|---|
| N1 | 해결자 `max` → `reported`만 / `sec164`만 | A-1, A-2 |
| N2 | 동점 `>=` → `>` (동점이 ② 채택) | A-3 echo |
| N3 | overlay `purchase` 조건 삭제 | 자산 단위 §163⑨ 2호 경로 회귀 anchor (이중 적용) |
| N4 | `propertyType === "housing"` 조건 삭제 | A-10 계열 해결자 직접 |
| N5 | Y4c 삭제(② 없어도 통과) | A-4 (leaf·엔진·⑫ 각각 — 겹친 방어가 서로 가리므로 파일 단위 분리) |
| N6 | Y4b 삭제 | A-11 |
| N7 | Y4a를 주택에도 적용(과차단) | A-1 |
| N8 | Y4 경계 `<` → `<=` | A-9 |
| N9 | ⑫ 두 스키마 중 하나에서 필드 삭제 | 주 자산 / 컴패니언 각각 |
| N10 | ⑭ 3곳 중 하나 삭제 | 단건·다건·번들 각각 |
| N11 | 브리지 면적 `resolveAcqAreaForStdPrice` → `acquisitionArea` 직독 | A-11 근처 partial 브리지 |
| N12 | 브리지 분모를 `L_F + B_F` → `L_F` | 브리지 36,000,000 |
| N13 | 지분 `applyRatio` 제거 | A-12 |
| N14 | ⑧ 사실의 `deriveBuildingSec164Total` 대신 raw 필드 유무 | ⑧≡⑫ 격자 |
| N15 | echo `rule` 하드코딩 `sec163_9_1` | echo 단언 |

---

## 8. 사용자 결정이 필요한 항목

| # | 질문 | 권장 | 대안 | 수치 영향 |
|---|---|---|---|---|
| **Q-D24-1** | **② 모델 채택**: 건물 몫 ② = P_F × B_E ÷ (L_F + B_F) (재산세과-1702 + 집행기준 99-164-9 연쇄, 정면 해석례 없음)로 `max(①, ②)`를 계산하고 결과에 「확인 필요」 고지 1줄을 둔다 | **채택 + 고지**. 근거: ① 단서 2호가 max를 **명시**하므로 ②를 안 쓰는 것이 오히려 문언 이탈이고(자산 단위 경로는 이미 적용), ② 안분은 국세청이 자산별 취득당시 기준시가에 대해 낸 일관된 해석(재산세과-1702·서면5팀-3028·법규과-5613·집행기준)이다. D2-Q3(§154⑧3호 적용 + 「확인 필요」)와 같은 처리 | **현행 유지(경계일 전 계속 차단)** — 정면 근거가 없는 데 대한 가장 보수적 선택. 대신 경계일 전 상속·증여 건물을 쓰는 사용자(2005년 전 상속 단독주택 + 자녀 소유 토지)는 이 기능을 못 쓴다 | ② 적용 시 시드 기준 상속 −1,764,000 / 증여 −1,315,263 (②>① 때, 납세자 유리 방향). ②<① 이면 불변 |
| **Q-D24-2** | **범위**: 주택(단독·공동)을 2005-04-30 경계로 일괄 연다. 일반건물은 차단 유지 | **일괄(자산 단위 §163⑨ 관행과 동일)** — ⑧≡⑫를 깨지 않는다. 공동주택 경계(2006.4.28.? 국세청 공동주택 기준시가 최초 고시)는 결과 고지에 「확인 필요」 | (a) 단독만 연다 — ⑫가 단독/공동을 모르므로 ⑧만 엄격해져 ⑧≡⑫ 격자 위반 · (b) 일반건물도 연다 — §164⑤ 입력(최초 고시 기준시가·기준율) 별도 설계, 최초 고시일 미확인 | 열림/닫힘 문제(세액 영향 없음) |
| **Q-D24-3** | 면적 입력 방식 「일부 양도」 + 경계일 전 주택 건물 | **차단**(D14-5 미러 — 자동 안분 금지, 부수토지 전체 면적이 미확정) | 양도분 면적으로 L_F 계산 — 법적 근거 없음, 차단 해제 시 L_F 과소 → ② 과대(납세자 유리 쪽 침묵 오류 위험) | 불허 시 해당 입력은 400 |
| **Q-D24-4** | 의제취득일(1985.1.1.) 전 상속·증여 건물도 같이 연다 | **연다** — 엔진 효과 0(실측 A-8), B_E 라벨만 의제취득일 규약 | 1985 이후만 열기(전은 차단 유지) — 가장 보수적이나 라벨 로직 분기 필요 | 0 |
| **Q-D24-5** | 반올림: 안분 1회 floor + 지분 `applyRatio` 1회 floor | **채택**(자산 단위 `houseValuationStdPrice` 관행과 동일) | 환산주택가격 floor 후 안분 floor(집행기준 서술 순서) 또는 지분까지 단일 floor | ≤ 1원 (프로브 2시드 0원) |
| **Q-D24-6** | PR 분할 D2-4a(엔진·⑫·⑭·④·브리지, ⑧ 계속 막음) → D2-4b(UI) | **D1-4와 같은 2분할** | 1 PR — 규모↑, ⑧ 완화와 엔진이 한꺼번에 들어가 리뷰 부담 | — |
| Q-D24-7 | ② 입력 칸: 기존 `inhHouseVal*` 4필드 + `acquisitionArea` 재사용 | **재사용**(UI 시니어와 합의) — 자산 단위 §164⑦과 같은 물리량이라 D2 토글을 꺼도 값이 의미를 갖는다 | 전용 키 신설 — ①②③⑫ 동기화 지점 증가 | — |

---

## 9. 확인 필요 레지스터

| # | 내용 |
|---|---|
| U-10 | 「상속·증여받은 건물 + 따로 취득한 토지」를 영 §163⑨ 단서 2호에서 정면으로 다룬 해석례·결정례. 1702·99-164-9는 환산 맥락(서면5팀-3028·법규과-5613 같은 뜻) |
| U-4 (D2 설계 승계) | 공동주택(국세청 공동주택 기준시가·공동주택가격 2006.4.28.)과 일반 건물 기준시가의 최초 고시일 — 경계일 2005-04-30의 법적 정확성 |
| U-11 | 최초공시 당시 토지 면적과 현재 면적이 다른 경우(분할·합병)의 L_F — 입력을 `acquisitionArea` 하나로 받는다는 가정 |
| U-12 | B_E가 존재하지 않는 시점(국세청 건물 기준시가 최초 고시 전)의 §164⑦ 후문(§164⑤ 준용) — 사용자가 기준율 환산한 값을 직접 입력한다는 가정, 별도 입력 도우미 없음 |
| U-13 | 단서 2호의 「건물의 기준시가가 고시되기 전」을 단독주택 건물분에 대해 개별주택가격(2005.4.30.)으로 읽는 것 — 그 전에도 국세청 일반 건물 기준시가(§61①2호)는 존재했다. 자산 단위 경로의 기존 독법(2026-08-05)을 따른다 |

---

## 10. 변경 파일 (예상)

| 파일 | 변경 |
|---|---|
| `lib/tax-engine/transfer-split-part-cause.ts` | 사실 2 · Y4a/b/c · 필드 · 상수 문구 (현재 275줄 → 약 330) |
| `lib/tax-engine/transfer-tax-split-acq-price.ts` | `resolveBuildingPartAcquisition` + 반환 (484줄 → 약 520) |
| `lib/tax-engine/transfer-tax-split-gain.ts` | 사실 공급 · echo (+~8줄) |
| `lib/tax-engine/types/transfer.types.ts` · `transfer-split-gain.types.ts` | 필드 · `rule` 유니온 |
| `lib/api/transfer-tax-schema-base-shape.ts` · `-split.ts` · `-required-refines-2a.ts` · `transfer-tax-schema.ts` | ⑫ |
| `app/api/calc/transfer/engine-input.ts` · `multi/route.ts` · `bundled-split-helpers.ts` | ⑭ |
| `lib/calc/transfer-building-sec164-bridge.ts`(신규) · `transfer-tax-api-split.ts` · `sec164-required-fields.ts` · `transfer-tax-validate-split.ts` · `transfer-tax-error-format.ts` | ④ · ⑧ |
| `lib/tax-engine/transfer-tax-split-display.ts` · `transfer-per-asset-summary.ts` · 4뷰 · 위젯 | ⑤⑥⑦ (UI) |
