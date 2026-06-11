# P2 — §99의2 + §98의7 하이브리드 감면 UI 설계

> 엔진 설계: `transfer-remaining-p2.engine.design.md` · P1 폼(`Unsold988InputForm`/`New99InputForm`) 패턴 준수

## 1. 폼 컴포넌트 (신규 2건 — 패널은 렌더 분기만, 800줄 정책)

### `Unsold987InputForm.tsx` (~150줄) — §98의7

| 섹션 | tone | 필드 |
|---|---|---|
| ① 최초 매매계약 | sky | `contractDate987` DateInput (hint: 2012.9.24~2012.12.31 + 계약금 납부) |
| ② 취득가액 | sky | `acquisitionPrice987` CurrencyInput (hint: 9억원 이하 — 취득세·부대비용 제외 실거래가) |
| ③ 자격 확인 | rose | ToggleCard 4종: `isUnsoldAtCutoff987`(2012.9.24 현재 미분양·선착순) / `isFirstContract987`(사업주체등 최초계약) / `isNotOccupiedAtContract987`(계약일 현재 입주사실 없음) / `isNotRecontract987`(해제 후 재계약 아님) |
| ④ 기준시가 (5년 후 양도 시) | amber | `standardPriceAtAcquisition987` / `standardPriceAt5Years987` / `standardPriceAtTransfer987` CurrencyInput (양도시는 자산값 fallback hint) |
| 상단 안내 | emerald | "5년 이내 양도 = 양도소득세 100% 감면 + 농어촌특별세 20% / 5년 후 양도 = 5년간 발생 양도소득금액 공제. 내국인 적용 (거주자 한정 아님). 매매계약서 사본 제출 필요" |

### `Unsold992InputForm.tsx` (~210줄) — §99의2

| 섹션 | tone | 필드 |
|---|---|---|
| ① 대상 주택 유형 | sky | `houseType992` RadioCardGroup(`name="unsold992-house-type"`): 신축·미분양(령①) / 자기건설(령①8호) / 1세대1주택자 주택(령③) |
| ② 계약·승인 시기 | sky | new_or_unsold·existing → `contractDate992` DateInput / self_built → `usageApprovalDate992` DateInput (hint: 2013.4.1~2013.12.31) |
| ③ 가액·면적 | sky | `acquisitionPrice992` CurrencyInput + `exclusiveAreaSqm992` DecimalInput (hint: 6억 이하 **이거나** 85㎡ 이하 — 둘 다 초과 시만 제외) |
| ④ 자격 확인 | rose | houseType별 분기: new_or_unsold → `meetsHouseTypeRequirement992` / self_built → `isNotExcludedSelfBuilt992`(조합원 관리처분·멸실 재건축 아님) / existing → `meetsOneHouseSellerRequirement992`(령③ 1세대1주택 양도자) + 공통 `isNotRecontract992` + `hasConfirmationSeal992`(시장·군수·구청장 확인 날인 매매계약서 — 법④ 미보유 시 적용 불가) |
| ⑤ 오피스텔 | violet | `isOfficetel992` ToggleCard — ON 시 children `meetsOfficetelRequirement992`(주민등록 60일 후~양도일 유지 또는 60일 내 임대등록 — 령②4호) |
| ⑥ 기준시가 (5년 후) | amber | 3종 (987과 동형, 접미사 992) |
| 상단 안내 | emerald | "거주자·비거주자 모두 적용. 5년 이내 = 100% 세액감면 + 농특세 / 5년 후 = 5년 발생분 공제" |

## 2. 결과 카드 — `IncomeDeductionDetailCard` 확장

- kind 2종 추가: `"unsold_98_7"`(§98의7 — 9억 이하 미분양 100%) / `"unsold_99_2"`(§99의2 — 신축·미분양·1세대1주택).
- **5년 내(tax_amount) 분기 신설**: 배지 "취득 후 5년 이내 — 100% 세액감면" + 본문 "감면세액 N (산출세액 100%)" + 농특세 sky 박스(감면세액 × 20%). reducible 합계 행은 income_deduction일 때만.
- result 타입에 `effectCategory` 존재(UnsoldHybridResult) — kind narrowing으로 분기.

## 3. 동기화 지점 매핑 (14지점)

| # | 파일 | 내용 |
|---|---|---|
| ① | `calc-wizard-asset-reduction.ts` | unsold_98_7(8필드) · unsold_99_2(13필드) union 멤버 |
| ② | `UnifiedReductionPanel-defaults.ts` | getReductionDefault 2분기 |
| ③ | `calc-wizard-asset-factory.ts` | migrateAsset 방어 보정 2블록 |
| ④ | `transfer-tax-api-reductions.ts` | parseAmount·parseDecimal 변환 2분기 (날짜 string 유지) |
| ⑤ | 신규 폼 2건 + 패널 update987/update992 + 렌더 분기 | |
| ⑥ | — (감면은 사이드바 합계 비반영 — 기존 정책) | |
| ⑦ | `IncomeDeductionDetailCard` 확장 + `ReductionDetailCards` hasAny·렌더 2건 | |
| ⑧ | `transfer-tax-validate-reductions.ts` | 987: 계약일·취득가 필수 / 992: houseType별 일자 + 취득가·면적 필수 (토글은 낙관 — 엔진 사유) |
| ⑨⑩ | reduction discriminatedUnion이 메인·컴패니언 공용 (P1 선례 — 추가 enum 작업 없음 확인) | |
| ⑪ | 해당 없음 (자산 acquisitionDate 기존) | |
| ⑫ | `transfer-tax-schema-sub.ts` | 본 필드 Zod 2블록 |
| ⑬ | reductions 배열 통째 전달 (P1 선례 — body spread 무변경 확인) | |
| ⑭ | `route-reductions-mapper.ts` | contractDate987 / contractDate992·usageApprovalDate992 Date 변환 |

## 4. E2E

`e2e/transfer-p2-hybrid.spec.ts` — 미분양 그룹 펼침 → §98의7 라디오 활성 + 폼 렌더 (9억 hint) / §99의2 라디오 → 폼 렌더 (6억·85㎡ OR hint + 유형 라디오). worktree `E2E_PORT=3100`.

## 5. UI 검토 (13단계 STEP 13)

| # | 발견 | 정정 |
|---|---|---|
| 1 | RadioCardGroup `name` prop 필수 (P1 함정) | `name="unsold992-house-type"` 명시 |
| 2 | CurrencyInput label required — `label=""` + 별도 `<label>` (P1 선례) | 폼 전반 적용 |
| 3 | 면적은 DecimalInput (CurrencyInput 소수점 버그) | exclusiveAreaSqm992 |
| 4 | houseType 라디오 전환 시 비활성 분기 입력 잔존 — API 변환에서 houseType 기준 분기 일자만 전달 | ④에서 houseType별 strip |
| 5 | 오피스텔 토글 OFF 시 meetsOfficetelRequirement992 잔존 — 엔진은 isOfficetel false면 미검증 | 엔진 게이트로 충분 (UI 정리 불요) |
