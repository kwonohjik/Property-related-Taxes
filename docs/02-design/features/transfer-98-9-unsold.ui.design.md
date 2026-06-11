# §98의9 수도권 밖 준공후미분양주택 — UI 설계

> 선행: `transfer-98-9-unsold.plan.md` · `.engine.design.md`
> 위치: `UnifiedReductionPanel` **unsold_housing 그룹**(sky tone, "미분양주택" §98 시리즈) — 그룹 내 유일 활성 라디오 (나머지 9개 조문은 과거 일몰 stub).

## 1. 사용자 시나리오

1. 종전주택(양도 자산) 입력 → 감면·공제 → "미분양주택" 그룹 펼침 → "§98의9" 라디오 선택 (D-1' 낙관 — 라디오 활성, 시한은 evaluator 판정).
2. 미분양주택 취득일·취득가액·전용면적 + 토글 3종 확인 → 계산.
3. 결과: 비과세(12억 이하) 또는 12억 안분+표2. 종부세 ② 별도 신청 안내.

## 2. Unsold989InputForm (UI 순서 = 엔진 검증 순서)

```
① sky 「준공후미분양주택 취득 정보」
   - DateInput unsoldHouseAcquisitionDate — label "준공후미분양주택 취득일"
     hint: "취득기간 2024.1.10~2026.12.31. 종전주택(양도 주택)을 먼저 취득한 후 취득해야 합니다"
② sky 「가액·면적 요건」
   - CurrencyInput unsoldHouseAcquisitionPrice — label "취득가액"
     hint: "실제 취득가액 — 7억 이하 (령 §98의8①2호. 기준시가 아님)"
   - DecimalInput unsoldHouseExclusiveArea — label "전용면적" unit "㎡"
     hint: "전용면적 85㎡ 이하 (령 §98의8①1호)"   ※ CurrencyInput 금지 — 소수점 면적
③ rose 「소재지·자격 요건」 (토글 3종 — 미확인 시 차단 아닌 엔진 불적용 사유)
   - ToggleCard(rose) isNonCapitalRegion "수도권 밖 소재" — 법 ①1호
   - ToggleCard(violet — 자격) wasOneHouseholdAtAcquisition "취득 당시 1세대 1주택"
     desc: "준공후미분양주택 취득 당시 세대가 1주택만 보유 (법 §98의9① 본문)"
   - ToggleCard(rose) meetsSellerAndContractRequirement "양도자 자격·최초계약·선착순 확인"
     desc: "사업주체·분양사업자·시공자로부터 최초 매매계약 + 사용검사 후 선착순 공급분
           + 시장·군수·구청장 확인 날인 매매계약서 보유 (령 §98의8①3~5호·②)"
emerald 자동 표시 (참고용):
   - "보유 요건 없음 — 미분양주택 의무 보유기간·추징 없음" 안내
   - "종부세 1세대1주택자 특례(②)는 별도 신청 (해당 연도 9.16~9.30, 관할 세무서)" 안내
```

- §99의4와 달리 **보유기간 미리보기·추징 경고 불요** (의무 보유 없음).
- 적격 판정은 엔진 단일 진실 — UI 자체계산 금지.

## 3. 폼 상태 (①②③)

```typescript
| { type: "unsold_98_9";
    unsoldHouseAcquisitionDate: string;     // "" 초기
    unsoldHouseAcquisitionPrice: string;    // "" 초기 (parseAmount)
    unsoldHouseExclusiveArea: string;       // "" 초기 (parseDecimal)
    isNonCapitalRegion: boolean;            // false
    wasOneHouseholdAtAcquisition: boolean;  // false
    meetsSellerAndContractRequirement: boolean }  // false
```
② getReductionDefault 동일 초기값 · ③ migrateAsset stub 방어 보정 (§99의4 블록에 분기 추가).

## 4. ⑧ validate

- 선택 시 `unsoldHouseAcquisitionDate`·`unsoldHouseAcquisitionPrice`·`unsoldHouseExclusiveArea` 3종 미입력 → step 2 차단 ("§98의9 적용: …를 입력하세요").
- 토글 3종 비차단 — 엔진 불적용 사유 (낙관 패턴).

## 5. Unsold989DetailCard (⑦)

```
[eligible — violet 카드]
  제목: "§98의9 — 준공후미분양주택 소유주택 제외"  배지 "주택수 제외"
  본문: "수도권 밖 준공후미분양주택 1채를 소유주택에서 제외하여 1세대 1주택으로 보아
        소득세법 제89조제1항제3호(비과세·고가주택 12억 안분·장기보유특별공제 표2)를 적용합니다"
  [dualExclusionWarning=true → amber 박스]
    "§99의4 농어촌·고향주택 특례와 동시 적격 — §99의4를 우선 적용하여 본 특례의
     주택수 제외는 반영되지 않았습니다 (동시 적용 여부는 세무사 확인 권장)"
  [sky 안내 박스 — comprehensiveTaxNote]
    "종합부동산세 1세대 1주택자 특례(§98의9②)는 본 계산기에 반영되지 않습니다 —
     해당 연도 9월 16일~30일에 관할 세무서장에게 별도 신청 (령 §98의8④)"
  각주: "다주택 중과 판정의 주택 수에는 반영되지 않습니다" (R-D)
[불적용 — rose 카드] 사유 목록 (New994DetailCard 패턴)
```

## 6. E2E (`e2e/transfer-98-9.spec.ts`)

양도일 입력 → "감면·공제" → "미분양주택" 그룹 펼침 → "§98의9 — 수도권 밖 준공후미분양 (주택수 제외)" 라디오 활성·클릭 → 폼 렌더("취득가액"·"7억 이하"·"전용면적" hint) 확인. ⚠️ stale 서버 — :3100 재시작.

## 7. 클라이언트 동기화 (요약 — 상세 engine.design §5)

①②③ §3 · ④ 1분기(parseAmount·parseDecimal·날짜 string) · ⑤ 폼+분기 1개 · ⑥ 영향 없음 · ⑦ §5 · ⑧ §4.
