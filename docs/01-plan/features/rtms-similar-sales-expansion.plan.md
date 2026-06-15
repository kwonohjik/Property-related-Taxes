# Plan — 매매사례가액 RTMS 자동조회 확대 (버그수정 + 공동주택 계열 + 양도세)

> 작성일: 2026-06-15 · 브랜치: `feat/rtms-similar-sales-expand` (worktree slot 1 · DEV 3001 / E2E 3101)
> 선행 기능: [`inheritance-similar-sales-rtms-lookup.plan.md`](./inheritance-similar-sales-rtms-lookup.plan.md) (PR #183 Phase 1, #189 성공코드 fix)
> 법령 검증: KoreanLaw MCP (소득세법 시행령 §176의2 — 2026-06-15 조회, MST 286211)

---

## 1. 배경 및 목표

### 1.1 현황 (실측 완료)

매매사례가액 RTMS 자동조회는 **상속·증여세의 아파트(`real_estate_apartment`) 전용**으로 이미 구현됨.

- UI 버튼·모달: `components/calc/inheritance/estate-card/variants/EstateBodyRealEstate.tsx:466` (cat === "real_estate_apartment" 게이트), `RtmsSimilarSalesModal.tsx`
- Mediator + 캐시: `lib/calc/rtms-similar-sales-lookup.ts` (Dexie 7일 TTL)
- 순수 필터: `lib/calc/rtms-similar-sales-filter.ts` (`filterSimilarSales`·`normalizeAptName`)
- 프록시 라우트: `app/api/address/apt-trade/route.ts` (RTMS endpoint `RTMSDataSvcAptTradeDev` 하드코딩 `route.ts:65-66`, `MOLIT_RTMS_API_KEY`)
- 원칙(불변): **자동 1건 확정 금지** — 후보 리스트 팝업 → 사용자 선택 → 자동채움 (`RtmsSimilarSalesModal.tsx:519-524`)

### 1.2 목표 (사용자 인터뷰 2026-06-15 확정)

| # | 목표 | 우선순위 |
|---|---|---|
| A | **이미지 버그 수정** — 소재지·동/호 입력했는데 `자동조회` 비활성("소재지를 먼저 입력해주세요") | **P0 (선결)** |
| B | **공동주택 계열 확대** — 아파트 + 연립/다세대 + 오피스텔 | P1 |
| C | **세목 확대** — 양도소득세 취득가액 추계 매매사례가액 | P1 |

**불변 제약 (사용자 명시)**: 매매사례가액은 시스템이 자동 판단·확정하지 않는다. **법정 요건에 맞는 후보 리스트를 별도 팝업으로 노출 → 사용자가 선택하면 입력**. 모든 확대에 동일 적용. (양도세 조사 에이전트가 제안한 `useEffect` 자동조회 트리거는 본 프로젝트 `useEffect→store 미러링 금지` 정책 및 본 제약 위반 → **불채택**.)

### 1.3 법령 근거 (KoreanLaw MCP 검증 완료)

| 세목 | 조문 | 매매사례 인정기간 | 비고 |
|---|---|---|---|
| 상속 | 상증령 §49① | 평가기준일 **전후 6개월** | 기구현 |
| 증여 | 상증령 §49① | **전 6개월 ~ 후 3개월** | 기구현 |
| 양도 | **소득세법 시행령 §176의2③1호** | 양도일·취득일 **전후 각 3개월** | 신규 |

- **§176의2③** (검증 본문): "양도가액 또는 취득가액을 추계결정·경정 시 ①매매사례가액 → ②감정가액 → ③환산취득가액 → ④기준시가 를 **순차 적용**." → 매매사례가액이 취득가액 추계 **1순위**(환산취득가액 §176의2②보다 선순위).
- **§176의2③1호**: "양도일 또는 취득일 **전후 각 3개월 이내**에 해당 자산(주권상장주식 제외)과 **동일성 또는 유사성**이 있는 자산의 매매사례가 있는 경우 그 가액."
- **§176의2③ 단서**: 매매사례가액·감정가액이 **§98① 특수관계인과의 거래**로서 객관적으로 부당하면 적용 배제 → 상속·증여 §49①1호가목과 동일하게 **직거래/특수관계 경고 배너 유지**.
- 공동주택 평가 자체(아파트·연립·다세대·오피스텔)는 상증법 §60~66 동일 적용 — RTMS는 "유사 매매사례 후보 수집" 도구일 뿐, 평가방법 변경 아님. **확인 필요**: 오피스텔이 상증령 §49④ 시행규칙 §15③1호("공동주택")에 포섭되는지 Do 전 KoreanLaw 재검증.

---

## 2. 범위

### 2.1 In-Scope

- **A**: `EstateBodyRealEstate.tsx` 소재지 onChange stale-closure race 수정 (estateAddress 손실 차단)
- **B**: 연립/다세대(`RTMSDataSvcRHTrade`)·오피스텔(`RTMSDataSvcOffiTrade`) RTMS 조회 추가. route를 물건종류 파라미터화. 모달에 "물건 종류" 선택 추가
- **C**: 양도세 취득가액 추계 매매사례가액 모드 신설 — `acquisitionMethod: "salesCase"` + 자산-수준 RTMS 조회 버튼·모달 재사용 + 14 동기화 지점

### 2.2 Out-of-Scope

- 양도세 **양도가액** 추계 매매사례(§176의2③은 양도가액에도 적용되나, 실무 빈도 낮음 → 후속)
- 단독·다가구주택 RTMS (유사재산 판정 까다로움 — 사용자 선택 "공동주택 계열"에서 제외)
- 토지·상가 RTMS (사용자 선택 범위 외)
- Phase 2 공시가격 ±5% 자동필터 (선행 plan의 미완 항목 — 본 작업 무관)
- 키움 주식 자동조회 (별도 도메인)

---

## 3. Part A — 이미지 버그 수정 (P0)

### 3.1 근본 원인 (실측 확정)

`components/calc/inheritance/estate-card/variants/`:
- `EstateBodyHelpers.ts:41-46` — `makePatcher(item, onUpdate)` = `(patch) => onUpdate({ ...item, ...patch })`. **`item`은 호출 시점 스냅샷**(closure 캡처).
- `EstateBodyRealEstate.tsx:128` — `const set = makePatcher(item, onUpdate)` (렌더 시점 item 캡처)
- `EstateBodyRealEstate.tsx:200` — `set({ estateAddress, name, estateLatLng })` ① store 반영됨
- `EstateBodyRealEstate.tsx:205` — `await resolveSigunguCode(...)`
- `EstateBodyRealEstate.tsx:217` — `set({ estateSigunguCode })` ② **stale item 기준** merge

**버그 흐름**:
```
진입 item = { estateAddress: undefined, ... }   // 주소 입력 전 스냅샷
① set({estateAddress: {...}})  → onUpdate({ ...item, estateAddress:{...} })  // 저장 OK
   await resolveSigunguCode()
② set({estateSigunguCode})     → onUpdate({ ...item(stale, estateAddress:undefined), estateSigunguCode })
                                  ⇒ estateAddress 가 undefined 로 덮어써짐 ✗
```
결과: 화면(local `addrValue`)엔 주소 보이나 `item.estateAddress` 소실 → `hasAddress=false`(`EstateBodyRealEstate.tsx:367`) → `자동조회` 비활성 + "소재지를 먼저 입력해주세요"(`:375`). 동시에 `estateSigunguCode`만 채워짐 → **이미지와 정확히 일치**.

### 3.2 수정 방향

await 후 별도 `set` 2차 호출 제거 → **패치 누적 후 단일 set**:
```ts
const patch: Partial<EstateItem> = { estateAddress, ... };
if (auto) patch.name = auto;
if (estateLatLng) { ... patch.estateLatLng / fishingAnchorLatLng ... }
if (v.pnu || estateLatLng) {
  const outcome = await resolveSigunguCode(...);
  if (!isReverseGeocodeError(outcome)) {
    if (fishing) patch.fishingAnchorSigunguCode = outcome.sigunguCode;
    else patch.estateSigunguCode = outcome.sigunguCode;
  }
}
set(patch);   // 단 한 번 — stale 2차 set 제거
```
→ 단일 set이므로 stale merge 없음. estateAddress·name·latLng·sigunguCode 모두 보존.
→ 단, await 동안 사용자가 다른 필드를 편집하면 그 변경이 이 set으로 덮어쓰일 위험(낮음). **대안**: `makePatcher`를 functional updater(`onUpdate(prev => ({...prev, ...patch}))`) 지원으로 바꾸고 2차 set 유지. → onUpdate 시그니처 영향 범위(`EstateItemEditor.tsx:150` 외 호출처) 확인 후 결정. **Plan 잠정: 단일 set 방식**(영향 최소). Do에서 onUpdate 동기/비동기 여부 실측 후 최종 결정.

### 3.3 동/호 선택 경로 (확인 필요)

- `address-search.tsx:324-327` onHoChange → `onChange({...value, detail})` 호출 → EstateBodyRealEstate onChange **재호출**됨(에이전트 "재호출 안 됨" 분석은 부정확 가능성 → Do 실측). detail은 `estateAddress.detail`에 들어가나 `hasAddress` 판정(`:367`)은 jibun/road/pnu만 보므로 무관.
- **확인 필요**: 동/호 선택이 면적(`item.areaSqm`)·공시가격(`item.standardPrice`)을 자동 채우는 경로 존재 여부. 없으면 사용자가 보충평가 토글로 수동 조회해야 `hasArea`·`hasStandardPrice` 충족 → 버튼 활성. 이미지에서 보충평가 토글이 닫혀 있으므로 **A 버그 수정만으로 버튼이 즉시 활성화되지 않을 수 있음**(면적·공시가격 별도 필요). UI 흐름 개선 여부 Do에서 판단.

### 3.4 Pre-Do anchor (착수 전 1건 — 필수)

`__tests__/` 에 onChange 시뮬레이션 단위 테스트: 빈 item → 주소 patch → resolveSigunguCode mock 성공 → **최종 item.estateAddress 보존 + estateSigunguCode 동시 존재** assert. 현재 코드에서 **실패**(estateAddress undefined) 확인 후 수정 → 통과. (memory `feedback_pre_anchor_verification`)

---

## 4. Part B — 공동주택 계열 확대 (아파트 + 연립/다세대 + 오피스텔)

### 4.1 RTMS endpoint (외부 API — Do anchor 실측 필요)

| 물건종류 | endpoint | 단지명 필드 | 상태 |
|---|---|---|---|
| 아파트 | `RTMSDataSvcAptTradeDev/getRTMSDataSvcAptTradeDev` | `aptNm` | ✅ |
| 연립/다세대 | `RTMSDataSvcRHTrade/getRTMSDataSvcRHTrade` | `mhouseNm` | ✅ 실측 확정 (2026-06-15) |
| 오피스텔 | `RTMSDataSvcOffiTrade/getRTMSDataSvcOffiTrade` | `offiNm` | ✅ 실측 확정 (2026-06-15) |

✅ **실측 완료 (2026-06-15, 활용신청 승인 후)**: LAWD_CD=41463/DEAL_YMD=202504 호출 결과 RH=`mhouseNm`(아이린캐슬)·OFFI=`offiNm`(엘리시아2차), 면적 `excluUseAr`·거래금액 `dealAmount`는 3종 동일. `PROPERTY_TYPE_CONFIG.nameField`(route.ts) 실측 일치 확인.

### 4.2 route 파라미터화

`app/api/address/apt-trade/route.ts` (또는 신규 `property-trade/route.ts`):
- query에 `propertyType=apt|rh|offi` 추가 (기본 `apt` — 기존 호출 하위호환)
- endpoint·단지명 필드 추출자(`pickComplexName`)를 `propertyType`별 분기. `parseRtmsXml`·`normalizeRawItem`은 필드명만 주입받아 재사용.
- `RtmsTradeRecord`는 `aptName`(범용 "단지/건물명") 의미 유지 — 타입 변경 없음.
- **기존 route 이름 유지**(apt-trade) — rename은 호출처(`rtms-similar-sales-lookup.ts:113`) 동시 수정 비용. Plan 잠정: **단일 route + propertyType 파라미터**.

### 4.3 카테고리 정책 — enum 신설 안 함

- `AssetCategory`(`lib/tax-engine/types/inheritance-gift.types.ts:69`)에 연립/오피스텔 값 **추가하지 않음**. `real_estate_apartment` 유지(라벨 이미 "주택(아파트·공동·단독)").
- 대신 **RtmsSimilarSalesModal 상단에 "물건 종류" RadioCardGroup**(아파트/연립·다세대/오피스텔) 추가 → 사용자 명시 선택 → 선택값을 mediator→route `propertyType`로 전달. (자동 판단 금지 원칙 일관)
- 캐시 키에 propertyType 포함: `rtms_${propertyType}_${lawdCd}_${baseDate}_${taxType}` (`rtms-similar-sales-lookup.ts:68-74` 수정).

### 4.4 필터 재사용

`filterSimilarSales`·`normalizeAptName`(`rtms-similar-sales-filter.ts`)은 단지/건물명 정규화 매칭이라 3종 공통 재사용. 변경 없음(단지명 필드가 route에서 `aptName`으로 정규화되어 도달).

---

## 5. Part C — 양도세 취득가액 추계 매매사례가액 (§176의2③)

### 5.1 현행 양도세 구조 (실측)

- enum: `acquisitionMethod: "actual" | "estimated" | "appraisal"` (`lib/tax-engine/types/transfer.types.ts:220`)
- 자산 폼(`lib/stores/calc-wizard-asset.ts`): 소재지 `addressRoad/addressJibun/buildingName/longitude/latitude`(`:109-121`), 면적 `acquisitionArea`(`:84`), 취득일 `acquisitionDate`(`:236`), 주소검색 `CompanionAssetCard.tsx:207`. **시군구코드는 NBL 전용(`nblLandSigunguCode`)만 — 범용 없음 → 신설 또는 reverse-geocode 파생 필요**.
- 취득가액 UI: `CompanionAcqPurchaseBlock.tsx` (환산/감정 토글). 매매사례 전용 위젯 없음.
- 엔진 분기: `transfer-tax-helpers.ts:366-387` (estimated/appraisal/actual).

### 5.2 설계

1. **enum 확장**: `acquisitionMethod`에 `"salesCase"` 추가 (취득가액 추계 1순위).
2. **자산 필드 신설**(상속·증여 패턴 모방 — 2필드 최소화): `similarSalesAcqValue?: number` + `similarSalesAcqSource?: "manual" | "rtms_auto"`. (에이전트 제안 5필드 status/count는 과설계 → 모달 내부 상태로 충분.)
3. **시군구코드**: 자산에 `acqSigunguCode?: string` 신설 + `CompanionAssetCard` 주소 onChange에서 `resolveSigunguCode` 파생(상속·증여 패턴, **단 Part A의 단일-set 패턴 적용해 race 사전 차단**).
4. **평가기간**: `buildQueryMonths`(`apt-trade/route.ts:77`)에 `taxType: "transfer"` 분기 — **취득일 전후 각 3개월**(§176의2③1호). 기존 inheritance/gift 시그니처 확장. baseDate=취득일(`acquisitionDate`).
5. **UI**: `CompanionAcqPurchaseBlock`에 "매매사례가액(추계 1순위)" 모드 — 버튼 → `RtmsSimilarSalesModal` 재사용(taxType="transfer", baseDate=취득일). 자동 1건 확정 금지.
6. **엔진 분기**: `transfer-tax-helpers.ts`에 `acquisitionMethod === "salesCase"` → `acquisitionCostBase = similarSalesAcqValue`. 개산공제 적용 여부 **확인 필요**(§163⑥ 개산공제는 환산취득가/기준시가 모드 대상 — 매매사례가액은 실가성격이라 미적용으로 추정, Do 전 §163⑥ KoreanLaw 검증).
7. **14 동기화 지점**(`CLAUDE.md` Definition of Done): ①~⑧ 클라이언트 + ⑨⑩⑪⑫⑬⑭ API/Route. 특히 ⑫Zod 입력객체·⑬body spread·⑭Route 엔진 매핑(TS 미감지) grep 자가점검.

### 5.3 모달 taxType 확장

`RtmsSimilarSalesModalProps.taxType`(`RtmsSimilarSalesModal.tsx:67`)·`fetchRtmsSimilarSales`(`rtms-similar-sales-lookup.ts:90`)·필터(`rtms-similar-sales-filter.ts`)·`buildQueryMonths`의 `taxType` 유니온을 `"inheritance" | "gift" | "transfer"`로 확장. 평가기간·기간 라벨·신고일 절단(§49④은 상속·증여 전용 — transfer는 미적용) 분기.

---

## 6. Phase 계획

| Phase | 내용 | 산출물 |
|---|---|---|
| **A** | 버그 수정 + Pre-Do anchor | EstateBodyRealEstate 단일-set, 단위 테스트 |
| **B0** | RTMS endpoint 실측 anchor (연립/오피스텔 필드명 확정) | throwaway probe → 필드맵 확정 |
| **B1** | route propertyType 파라미터화 + 캐시키 + mediator | route/lookup 수정, anchor |
| **B2** | 모달 "물건 종류" 라디오 + 배선 | RtmsSimilarSalesModal, EstateBodyRealEstate |
| **C0** | §176의2③·§163⑥ KoreanLaw 재검증 + 양도 anchor | 엔진 분기 anchor |
| **C1** | 엔진 salesCase 분기 + 타입/필드 | transfer.types, helpers |
| **C2** | 양도세 UI + 14 동기화 지점 | asset/api/zod/route/UI/validate |
| **Check** | `ui-engine-sync-checker` + `npm test` + E2E(3101) | 회귀 |

각 Phase는 `single-response-do-execution` 규율(TODO.md 체크박스) + Phase별 anchor 우선.

---

## 7. 리스크

| 리스크 | 대응 |
|---|---|
| 연립/오피스텔 RTMS 응답 필드명 추정 오류 | B0 probe로 실측 확정 (Do 전) |
| 양도세 매매사례 §163⑥ 개산공제 적용 여부 | C0 KoreanLaw 검증 |
| 오피스텔이 상증령 §49④ "공동주택" 포섭 여부 | 1.3 확인 필요 — Do 전 검증 |
| Part A 단일-set이 await 중 동시편집 덮어쓰기 | onUpdate functional updater 대안 검토(3.2) |
| taxType 유니온 확장 — 기존 inheritance/gift 호출처 회귀 | 전수 grep + `npm test` |
| 양도세 14 동기화 지점 ⑫⑬⑭ 침묵 strip | grep 자가점검 (memory `feedback_api_zod_schema_sync`) |
| 외부 동시편집(메인 트리 uncommitted 7파일) | 격리 worktree 작업 (이미 적용) |

---

## 8. 열린 질문 — 사용자 결정 완료 (2026-06-15)

1. **동/호 자동채움**: 동/호 선택 시 면적·공시가격을 **자동 채움(기본)** + 보충평가 수동 조회도 유지. → `AddressValue`에 optional `exclusiveArea`·`standardPrice` 추가, `onHoChange`에서 선택 `UnitItem`(`exclusiveArea`·`price`) 전달, EstateBodyRealEstate onChange에서 `areaSqm`·`standardPrice` set. (`address-search.tsx:22-40,324-326` 실측) → **Part A에 포함**.
2. **오피스텔**: "포섭"=오피스텔이 §49④ "공동주택"에 법적으로 해당하는지. **사용자 결정: 오피스텔도 조회 가능하게 포함**. (실무상 오피스텔 유사매매사례 조회는 통용 — Do C0에서 §49④ 적용 한계 주석만 보강, 기능은 제공.)
3. **RTMS 필드명**: 실측 — B0 anchor에서 발급 키로 RHTrade·OffiTrade 1회 호출하여 `mhouseNm`/`offiNm`·면적 필드 확정.
4. **양도세 개산공제**: **적용**. §176의2③ 추계 취득가액(매매사례가액 포함)은 §163⑥ 필요경비 개산공제 대상 → `salesCase` 모드도 `appraisal`/`estimated`와 동일하게 개산공제 적용.

### route rename
- `apt-trade`→`property-trade` rename은 **미적용**(파라미터화로 처리, 호출처 변경 최소화).

---

## 9. Do 진입 게이트

- [ ] Pre-Do anchor A(estateAddress 보존) 작성·실패확인
- [ ] B0 RTMS 연립/오피스텔 endpoint·필드명 실측
- [ ] C0 §176의2③·§163⑥·§49④(오피스텔) KoreanLaw 재검증
- [ ] 열린 질문 4건 해소
- [ ] taxType 유니온 확장 호출처 전수 grep 완료
