# 상가건물 상속 §163⑨2호 (pre-disclosure) max(상증법, §164⑥) — Phase 2 계획서

> Phase 1(PR#715, post-disclosure 상가 상속 §163⑨ 본문) 후속. 사용자 "item 1 완전 구현" 선택(2026-07-20).
> 감사 출처 [[project_transfer_special_engine_inheritance_acquisition_bugs]]. **fork 미사용**(인라인 검토 — 정착 규칙).

## §0 문제

상가 기준시가 최초고시 = **2005-01-01**. 2005-01-01 이전 상속받은 상가는 §163⑨**2호**로 취득가액 = **max(상속개시일 상증법 §60~66 평가액, §164⑥ 취득당시 기준시가)**. Phase 1은 상증법 평가액(publishedValueAtInheritance)만 사용 → §164⑥ P_A가 더 크면 **취득가 과소→과대과세(납세자 불리)**. 주택은 이미 `houseValuationStdPrice`로 max 처리(`inheritance-acquisition-price.ts:144`)하나 상가는 미대응.

## §1 법령 (KoreanLaw get_law_text MST 286211, 시행 20260701)

- **§163⑨2호**: "상증법 §61①**2~4호**의 건물 기준시가 고시 전 상속 건물 → max(상속개시일 상증법 §60~66 평가액, **§164⑤ 내지 ⑦** 가액)". §61①3호=오피스텔·상업용건물 → 포함.
- **§164⑥**: "법 §99①1호**다목**(오피스텔·상업용건물)…기준시가 고시 전 취득 오피스텔·상업용건물의 취득당시 기준시가는 [최초고시 역환산] 산식". → §164⑤~⑦에 **⑥ 포함** → 상가 §163⑨2호 max 항 = §164⑥. (기존 코드 주석 "§164⑧"은 오기 — 실제 현행 §164⑥. 본 PR은 신규코드만 §164⑥ 인용, 기존코드 인용 정정은 범위 밖.)
- **§164⑥ 취득당시 기준시가(P_A)** = INT(최초고시 호별총액 × 취득시 기준시가합 / 최초고시시 기준시가합). = 기존 `calcEstimatedStdPriceAtAcq`(commercial-building-valuation.ts) 산정값(=case-29 estimatedBasisAtAcq 119,607,326).
- **§163⑥ 개산공제**: 환산(나목) 전용 → §163⑨2호(실지거래가액 의제, 가목) 미적용 → 개산공제 0.

## §2 케이스 매트릭스

| # | 상가 취득원인 | 상속개시일 | §164⑥ 입력 | 현행(Phase1) | 정합 |
|---|---|---|---|---|---|
| **P2-1 ★** | 상속 | < 2005-01-01 | 제공 | 상증법 평가액만 | **max(상증법, §164⑥ P_A)** |
| P2-2 | 상속 | < 2005-01-01 | 미제공(opt-out) | 상증법 평가액만 | 상증법 평가액만(불변 — 주택 opt-in 패턴 미러) |
| P1 불변 | 상속 | ≥ 2005-01-01 | — | 상증법 평가액(Phase1) | **불변** |
| B/C 불변 | 매매·증여 | — | — | 환산/실가 | **불변** |

opt-in: §164⑥ 입력(6값+2면적) 제공 시에만 max 계산(주택 `inheritedHouseValuation` opt-in 미러). 미제공은 Phase 1(상증법만) 유지.

## §3 설계 — 주택 §163⑨2호 패턴 미러

### 3.1 엔진
- **신규 타입** `CommercialInheritanceValuationInput`(types/inheritance-acquisition.types.ts): 8필드(exclusiveArea·commonArea·landArea·unitPriceAtFirstDisclosure·landPriceAtAcquisition·landPriceAtFirstDisclosure·buildingStdPriceAtAcquisition·buildingStdPriceAtFirstDisclosure). 양도시 값 불요(P_A는 취득시·최초고시만).
- **신규 필드** `InheritanceAcquisitionInput.commercialValuationStdPrice?: number` — §164⑥ P_A(미스케일, houseValuationStdPrice 병렬).
- **P_A 헬퍼** `computeCommercial164_6StdPrice(input): number` — `calcStdPriceSum`+`calcEstimatedStdPriceAtAcq` 재사용(commercial-building-valuation.ts export).
- **calcPostDeemed**(inheritance-acquisition-price.ts:144): max 분기 일반화 — `sec164 = houseValuationStdPrice ?? commercialValuationStdPrice`; max(reportedValue, sec164). legalBasis/formula는 house/commercial 분기(라벨).
- **TransferTaxInput.commercialInheritanceValuation?** payload 추가.
- **STEP 0.45**(inheritance-acquisition-helpers.ts): `resolveCommercialValuation(rawInput)` — post-deemed(≥1985) & 상속개시일<2005 & payload 존재 시 P_A 계산→`commercialValuationStdPrice` 주입(주택 `shouldInjectPostDeemedHouseMax` 병렬).

### 3.2 API (transfer-tax-api.ts)
- `buildCommercialInheritanceValuationPayload(primary)`: commercial + inheritance + 상속개시일<2005 + cb pre_disclosure 6값 존재 시 cb* 필드 읽어 engine payload 빌드(opt-in). body spread(⑬). (cb* 스토어 필드 재사용 — 신규 스토어 필드 0.)
- **Phase 1 가드 불변**: cbValuation은 여전히 상속 시 미빌드(환산 override 방지). commercialInheritanceValuation은 별도 payload(P_A max 전용, 환산 아님).

### 3.3 Zod (transfer-tax-schema.ts)
- `commercialInheritanceValuationSchema`(8필드 positive) optional 추가(⑫).

### 3.4 UI (⑤)
- commercial + inheritance + 상속개시일<2005 시 "§164⑥ 취득당시 기준시가 (상증법 평가액과 큰 금액 적용)" 섹션 노출 — cb* 필드 바인딩(취득시·최초고시 6값 + 면적). 환산 토글은 Phase 1대로 미노출. amber 톤(취득 정보).
- 위치: 상속 블록(`CompanionAcqInheritanceBlock`) 내 상가 전용 서브섹션 or AssetSectionAcquisition 상가+상속 분기.

### 3.5 Validation (⑧)
- opt-in: §164⑥ 섹션에서 6값 중 일부만 입력 시 나머지 필수(부분입력 차단). 전무하면 통과(Phase 1 상증법만). 주택 `buildInheritedHouseValuationPayload` triggerable(4필드 all-or-nothing) 미러.

### 3.6 결과 카드 (⑦)
- `InheritedAcquisitionDetailCard`: method="supplementary"·formula에 max(상증법, §164⑥) 비교 노출(calcPostDeemed formula 이미 생성 — 상가 라벨 분기).

## §4 14 동기화 지점

신규 엔진 input 타입(`commercialInheritanceValuation` payload + `commercialValuationStdPrice`) → ⑫⑬⑭ 배선 필수.

| 지점 | 변경 |
|---|---|
| ①폼 ②initial ③normalize | cb* 재사용 → **신규 스토어 필드 0** (기존 cb* 유지) |
| ④API | buildCommercialInheritanceValuationPayload + body spread |
| ⑤UI | §164⑥ 섹션(cb* 바인딩) |
| ⑥사이드바 | 취득가액은 결과 후 노출(불변) |
| ⑦결과 | InheritedAcquisitionDetailCard max 라벨 |
| ⑧validation | §164⑥ all-or-nothing |
| ⑫Zod | commercialInheritanceValuationSchema |
| ⑬body spread | ...(payload ? {commercialInheritanceValuation} : {}) |
| ⑭Route | Date 변환 불요(숫자 payload) — schema→engine 매핑 확인 |
| 엔진 | 신규 타입·필드·헬퍼·STEP0.45·calcPostDeemed |

## §5 Anchor (RED→GREEN)

case-29 fixture 재사용(pre-disclosure, P_A=119,607,326):
1. **P2-1a max=P_A**: 상속(2000-12-07)+reportedValue 100M(<P_A)+commercialInheritanceValuation(case-29 6값)→취득가=119,607,326, gain=540M−119,607,326=420,392,674.
2. **P2-1b max=상증법**: reportedValue 150M(>P_A)→취득가=150M, gain=390,000,000.
3. **P2-2 opt-out**: payload 미제공→취득가=reportedValue(상증법만, Phase1 불변).
4. **개산공제 0**: 어느 경우도 개산공제 미적용.
5. **B 불변**: 매매 상가 환산 case-29 원본 불변.

## §6 스코프

- **Phase 2(본 PR)**: P2-1(pre-disclosure 상가 §163⑨2호 max, opt-in). §164⑥ P_A 엔진 산정.
- **불변**: Phase 1(post-disclosure)·B(매매)·C(실가) 전건.
- **후속(Phase 3)**: InheritanceAssetKind "commercial" 정식 라벨(cosmetic). 부담부증여×상속 상가는 **버그 아님**(검증 완료 — §159 안분이 상증법 평가액 사용).
