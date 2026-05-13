# 재개발/재건축 양도소득세 — 엔진 설계

> 계획서: `.claude/plans/users-mynote-downloads-pdf-users-mynote-vivid-lerdorf.md`
> UI 측 명세: `transfer-tax-redevelopment.ui.design.md` (UI 시니어 작성)
> 본 PR 범위: 엔진은 매트릭스 전체(사례 36~46) · UI는 사례 44(APT-환산-납부-주택출자)만

## Context

재개발·재건축 양도소득세는 **관리처분 인가일**(도시정비법 §74)을 분기점으로 양도차익을 3분할(인가전 + 인가후 기존주택분 + 청산금 분)하는 고유 로직이다. 현재 코드는 `propertyType="right_to_move_in"` 타입만 정의되어 있고(주택수 산정 + §95② 원조합원 단서 일부), 관리처분 인가일·권리가액·청산금 입력 필드가 없다.

본 설계는 양도코리아 11개 사례(36~46) + PDF 6페이지(제1~8절) 학습 결과를 바탕으로 매트릭스 전체를 단일 엔진 모듈로 구현한다. UI는 사례 44만 노출하되 엔진 일반화로 후속 PR 확장이 가능하도록 한다.

**이전 한계**:
- 입주권 양도 시 인가전·인가후 양도차익 분리 안 됨
- 청산금 납부/수령 안분 로직 부재
- 환산취득가의 "양도가액 = 권리가액" 의제 미구현
- LTHD 분기별 보유기간 기산 불가

---

## ★ 케이스 인벤토리 (필수 — 11행)

| # | 시나리오 | 법령 근거 | anchor 출처 | 테스트 파일 | 상태 |
|---|---|---|---|---|---|
| 1 | 사례 36 — 입주권 양도 / 실가 / 납부 | **시행령 §166①1호** + 소법 §95②·§166⑤1호, 도정법 §74 | 양도코리아 xlsx `권리-실가-납부` | `__tests__/tax-engine/transfer/redevelopment.spec.ts` | ☐ TODO |
| 2 | 사례 37 — 입주권 양도 / 환산 / 납부 | **시행령 §166①1호·§166③** + §176의2②2호 + §95② 단서 | 양도코리아 xlsx `권리-환산-납부` | 동일 | ☐ TODO |
| 3 | 사례 38 — 입주권 양도 / 실가 / 수령 | **시행령 §166①2호** + §95②·§166⑤1호 | 양도코리아 xlsx `권리-실가-수령` | 동일 | ☐ TODO |
| 4 | 사례 39 — 입주권 양도 / 환산 / 수령 | **시행령 §166①2호·§166③** + §176의2②2호 | 양도코리아 xlsx `권리-환산-수령` | 동일 | ☐ TODO |
| 5 | 사례 40 — 완공 APT 양도 / 토지출자 / 실가 / 납부 | **시행령 §166②1호** + §166⑤2호 | 양도코리아 xlsx `APT-실가-납부` | 동일 | ☐ TODO |
| 6 | 사례 41 — 완공 APT 양도 / 토지출자 / 환산 / 납부 | **시행령 §166②1호·§166③** + §176의2②2호 | 양도코리아 xlsx `APT-환산-납부` | 동일 | ☐ TODO |
| 7 | 사례 42 — 완공 APT 양도 / 토지출자 / 실가 / 수령 | **시행령 §166②2호·§166①2호** | (xlsx "교재 답 상이" — **anchor 보류**) | 동일 (snapshot only) | ☐ HOLD |
| 8 | 사례 43 — 완공 APT 양도 / 토지출자 / 환산 / 수령 | **시행령 §166②2호·§166③** | (xlsx 시트 미존재 — **anchor 보류**) | 동일 (snapshot only) | ☐ HOLD |
| 9 | **사례 44 — 완공 APT 양도 / 주택출자 / 환산 / 납부** ★ UI 구현 대상 | **시행령 §166②1호·§166③·§166⑤2호나목** + §176의2②2호 + §164⑦ 단서 | 양도코리아 xlsx `APT-환산-납부-주택출자` — 산출 56,799,400 / 지방 5,679,940 / 합 62,479,340 | 동일 (필수 9개 toBe anchor) | ☐ TODO |
| 10 | 사례 45 — 완공 APT 양도 / 주택출자 / 실가 / 납부 (1세대1주택 12억 안분 + LTHD 표2) | 소법 §89①3호 단서 (12억 초과 고가주택) + **소법 §95③·시행령 §160** (12억 안분 위임 산식) + §95② 표2 | 양도코리아 xlsx `APT-실가-납부-주택출자` | 동일 | ☐ TODO |
| 11 | 사례 46 — 완공 APT 양도 / 주택출자 / 실가 / 수령 — **본 PR 범위: 과세 산출 anchor만 등록 (§166②2호·①2호 산식 검증)**. 시행령 §154 비과세 미달 자체 적용 로직은 후속 PR | **시행령 §166②2호·§166①2호** + 소법 §95④ + NTS 집행기준 "settlementSaleDate = 소유권이전 고시일 다음날" | 양도코리아 xlsx `APT-실가-수령-주택출자` | 동일 | ☐ TODO |
| 12 | **§164⑦ 단서 분기 (가공 케이스)** — 취득일 < 최초공시일 | 시행령 §164⑦ + §164⑤ 준용 | 가공 — `valuationMeta.method === "estimated_pre_disclosure_decree_§164_7"` | 동일 | ☐ TODO |
| 13 | **§29 슬롯 검증 (타입 단 확장)** — approvalLawBasis="small_housing_§29" 입력 시 §74와 동등 처리 | 소법 §95② + 빈집소규모정비법 §29 | 타입 검증 only (anchor 미등록) | 동일 (type test) | ☐ TODO |

**Cross-cutting 매트릭스** (본 PR 정책 — 후속 PR 분리):

| 항목 | 본 PR | 후속 PR |
|---|---|---|
| §95② 원조합원/승계조합원 단서 | 기존 코드 재사용 ✓ | — |
| 1세대1주택 12억 안분 (사례 45) | anchor만 등록 | 별도 PR — 기존 housing 분기 cross-cutting |
| 보유 2년 미충족 비과세 (사례 46) | **과세 산출 anchor 등록만** (산식 §166②2호·①2호 검증) | 시행령 §154 비과세 미달 자동 판정·1세대1주택 분기 통합은 후속 PR |
| 다주택 중과 배제 (재개발 입주권) | 미적용 | 별도 PR — §104⑦ 단서 |
| 분양권→입주권 전환 LTHD | 미적용 | 별도 PR |
| 권리가액 토지·건물 분리 평가 (PDF 제7절) | 미적용 | 별도 PR |
| 인가일 < 취득일 (승계조합원 인가 후 취득) | validate 차단 | 별도 PR 분기 |
| **§166④2호 분기** — 권리가액(관리처분계획 가격) 부재 시 §176의2③ 적용 (매매사례·감정·기준시가 순차) | **본 PR 미지원** (validate에서 `rightsValue > 0` 강제 — §166④1호 가격 가정) | 별도 PR — 매매사례/감정/기준시가 평가액 산정 분기 |

---

## 법령 근거 (law.go.kr 2026-05-13 확인)

```
★★★ 소득세법 시행령 §166 (양도차익의 산정 등 — **재개발/재건축 핵심 본문**):
  §166①1호 (입주권 + 청산금 납부): 인가후양도차익 + 인가전양도차익
  §166①2호 (입주권 + 청산금 수령): 가목(양도가액 − (평가액−청산금) − 필요경비)
                                 + 나목(인가전양도차익 × (평가액−청산금)/평가액)
  §166②1호 (APT + 청산금 납부) ★ 사례 44 근거:
    "청산금납부분양도차익 = 인가후양도차익 × 납부청산금 / (평가액 + 납부청산금)
     기존건물분양도차익 = [인가후양도차익 × 평가액 / (평가액 + 납부청산금)] + 인가전양도차익"
  §166②2호 (APT + 청산금 수령): §166①2호 산식 준용
  §166③: 기존건물 취득가액 불명 시 환산 산식 (재개발 전용):
    "제1항 및 제2항을 적용할 때 기존건물과 그 부수토지의 취득가액을 확인할 수 없는 경우에는
     다음 산식을 적용하여 계산한 가액에 따른다."
    산식: **(평가액 = 권리가액) × (취득당시 기준시가 / 관리처분 인가일 기준시가)**

    ★ **§166③ vs §176의2②2호 관계 (C-3 명확화)**:
    - §176의2②2호는 **일반 부동산** 환산취득가 산식 (양도가액 × 취득시기준시가 / 양도시기준시가)
    - §166③은 **재개발/재건축 기존건물 전용** 환산 산식 — §176의2②2호와 산술 구조 동일하지만
      "양도가액 → 평가액(권리가액)", "양도시 기준시가 → 관리처분 인가일 기준시가" 로 매핑된
      **재개발 전용 특별 규정**.
    - 본 엔진은 **§166③을 1차 근거**로 인용, §176의2②2호는 산술 구조의 일반 근거로 보조 인용.
    - 단서 분기 (§164⑦): §166③·§176의2②2호 모두 공통으로 §164⑦ 단서 적용 (취득일 < 최초공시일).
  §166④: 평가액 정의 = 관리처분계획에 따라 정하여진 가격(=권리가액) 또는 매매사례·감정·기준시가
  ★ §166⑤: **LTHD 보유기간 분기 — 본 엔진 LTHD 매트릭스의 법령 근거**:
    1호: 인가전양도차익 LTHD 보유기간 = 취득일 ~ 관리처분 인가일 (입주권 양도 시)
    2호가목: APT 청산금**납부분**양도차익 LTHD 보유기간 = 관리처분 인가일 ~ 신축 양도일
    2호나목: APT 기존건물분양도차익 LTHD 보유기간 = 취득일 ~ 신축 양도일 (전체)

  ⚠️ **§166⑤ 누락 케이스 — 청산금 수령분 (사례 38·39·42·43·46)**:
    §166⑤에는 청산금 "수령분" LTHD 보유기간이 직접 명시 안 됨 (가목은 납부분만).
    본 엔진은 다음 조합으로 도출:
    - 본법 §95④: "보유기간은 그 자산의 취득일부터 양도일까지" (일반 규정)
    - NTS 집행기준: "청산금 수령분의 양도시기 = 소유권이전 고시일의 다음날"
    → 청산금 수령분 보유기간 = 취득일 ~ settlementSaleDate (소유권이전 고시일 다음날)
    ※ 사례 46 보유 6년 9월 검증 (취득 2016-05-06 ~ 양도 2023-02-16 ≈ 81개월).

  ※ 사례 44 (APT 양도) 인가전 분이 §166②1호의 "기존건물분양도차익" 안으로 흡수되어
    LTHD 보유기간이 §166⑤2호나목 "취득일~신축 양도일" 전체로 잡힘 (=17년 10월).
    입주권 양도 시는 §166⑤1호로 "취득일~인가일" 짧은 기간 (≠APT 양도).

소득세법 §95② (시행 2026-04-21):
  "양도소득금액은 양도차익에서 장기보유 특별공제액을 공제한 금액으로 한다.
   ... 조합원입주권(조합원으로부터 취득한 것은 제외한다)에 대하여 그 자산의 양도차익
   (조합원입주권을 양도하는 경우에는 「도시 및 주거환경정비법」 제74조에 따른
   관리처분계획 인가 및 「빈집 및 소규모주택 정비에 관한 특례법」 제29조에 따른
   사업시행계획인가 전 토지분 또는 건물분의 양도차익으로 한정한다)에
   다음 표 1에 따른 보유기간별 공제율을 곱하여 계산한 금액을 말한다."
  → 입주권 양도 시 LTHD 대상 양도차익이 인가전 분에 한정.
  → 원조합원만 적용 (조합원으로부터 취득한 것 = 승계조합원 제외).

소득세법 §89①3호 (시행 2026-04-21):
  1세대 1주택 비과세 (12억 초과 고가주택 제외).
  ※ §89②는 "주택+입주권/분양권 보유 시 §89①3호 적용 배제" 규정이며 사례 46의 근거가 아님.

소득세법 §89①4호:
  조합원입주권 비과세 (12억 초과 시 과세).

소득세법 §95③ (고가주택 안분 위임):
  "제89조제1항제3호에 따라 양도소득의 비과세대상에서 제외되는 고가주택(이에 딸린 토지를
   포함한다) ... 자산의 양도차익 및 장기보유 특별공제액은 제1항에도 불구하고 대통령령으로
   정하는 바에 따라 계산한 금액으로 한다."
  → 사례 45 12억 안분의 위임 근거. 산식은 시행령 §160.

소득세법 §95④ (LTHD 보유기간):
  "제2항에서 규정하는 자산의 보유기간은 그 자산의 취득일부터 양도일까지로 한다."
  → 청산금 수령 시 "양도일" 정의 — 소유권이전 고시일 다음날(NTS 집행기준).

소득세법 시행령 §154 (1세대 1주택의 범위 — 보유 2년 요건):
  → 사례 46 "2년 보유요건 미충족" 의 정확 근거.
  ※ §154① "보유기간이 2년 ... 이상인 것" 직접 규정.

소득세법 시행령 §160 (고가주택 양도차익·LTHD 산정 — §95③ 위임):
  "제1항: 양도차익 안분 = 법 §95① 양도차익 × (양도가액 − 12억원) / 양도가액
   제2항: LTHD 안분  = 법 §95② LTHD × (양도가액 − 12억원) / 양도가액"
  → 사례 45 12억 안분의 정확 산식.

소득세법 시행령 §176의2②2호 (시행 2026-04-23):
  "법 제94조제1항제1호 및 제2호가목에 따른 토지·건물 및 부동산을 취득할 수 있는 권리의 경우에는
   다음 계산식에 따른 금액. ... 양도당시의 실지거래가액, 매매사례가액 또는 감정가액
   × (취득당시의 기준시가 / 양도당시의 기준시가)"
  → 재개발 매핑: 인가전 분의 양도 의제 시점이 관리처분 인가일이므로
    "양도당시 기준시가 = 관리처분인가일 기준시가" 로 매핑.
  → 환산취득가 = 권리가액 × (취득시 기준시가 / 관리처분인가일 기준시가)
  ※ 산식만 규정 — **rounding 모드 미규정**. 본 엔진은 **BigInt floor** 채택 (정수 연산 일관성).

소득세법 시행령 §164⑦ (원문 — 사용자 검토 반영 정정):
  "「부동산 가격공시에 관한 법률」에 따른 개별주택가격 및 공동주택가격(이들에 부수되는 토지를
   포함한다)이 공시되기 전에 취득한 주택의 취득당시의 기준시가는 다음 산식에 의하여 계산한
   가액으로 한다. 이 경우 당해 주택에 대하여 국토교통부장관이 최초로 공시한 주택가격 공시당시
   또는 취득당시의 법 제99조제1항제1호 나목의 가액이 없는 경우에는 제5항의 규정을 준용하여
   계산한 가액에 의한다."

  ★ 단서 트리거 정정 (이전 안 폐기):
    - ❌ 이전 안 "취득시 기준시가 ≤ 취득전기 기준시가" (양도코리아 xlsx 운영팁이지 시행령 본문 아님)
    - ✅ 정확 트리거: **취득일 < 개별주택가격/공동주택가격 최초 공시일**
    - 대체 산식: §164⑤ 준용(건물 기준시가 고시 전 산식 — 토지/건물 분리 안분)
    - 본 엔진은 firstDisclosureDate 입력 필드를 받아 acquisitionDate < firstDisclosureDate
      인 경우 단서 분기 발동.

도시 및 주거환경정비법 §74 (시행 2026-01-02):
  관리처분계획의 인가 — 분양대상자별 종전 토지/건축물 명세 및 사업시행계획인가 고시일 기준 가격 확정.

빈집 및 소규모주택 정비에 관한 특례법 §29 (사업시행계획 인가):
  §95② 본법 단서에서 도정법 §74와 **동등하게 인가전·인가후 분기 기준일로 인정**.
  → 가로주택정비사업·소규모재건축·자율주택정비사업 입주권은 §29 인가일이 분기점.
  → 본 PR anchor 미등록이지만 RedevelopmentInfo 에 approvalLawBasis 식별자 슬롯 사전 도입
     (후속 PR 마이그레이션 회피).
```

**legal-codes 상수** (`lib/tax-engine/legal-codes/transfer.ts` 신설):

```ts
// law.go.kr 확인 2026-05-13 (소법 시행 2026-04-21 / 시행령 2026-04-23 / 도시정비법 2026-01-02)
export const INCOME_TAX_§95_2 = "소법 §95②";              // 입주권 양도차익 인가전 한정 + 원조합원 단서
export const INCOME_TAX_§95_3 = "소법 §95③";              // 고가주택 안분 위임 (사례 45)
export const INCOME_TAX_§95_4 = "소법 §95④";              // LTHD 보유기간 정의 (취득일~양도일)
export const INCOME_TAX_§89_1_3 = "소법 §89①3호";          // 1세대1주택 비과세
export const INCOME_TAX_§89_1_4 = "소법 §89①4호";          // 입주권 비과세
export const INCOME_TAX_DECREE_§166 = "소령 §166";          // ★ 재개발/재건축 양도차익 산정 본문 (가장 핵심)
export const INCOME_TAX_DECREE_§166_2_1 = "소령 §166②1호";   // APT + 청산금 납부 산식 (사례 44)
export const INCOME_TAX_DECREE_§166_5 = "소령 §166⑤";       // LTHD 보유기간 분기 법령 근거
export const INCOME_TAX_DECREE_§176_2_2_2 = "소령 §176의2②2호";  // 환산취득가 산식 (§166③ 와 연계)
export const INCOME_TAX_DECREE_§164_7 = "소령 §164⑦";      // 주택가격 최초 공시 전 취득 단서
export const INCOME_TAX_DECREE_§164_5 = "소령 §164⑤";      // §164⑦ 단서 대체 산식 준용 근거
export const INCOME_TAX_DECREE_§160 = "소령 §160";        // 고가주택 12억 안분 산식 (사례 45)
export const INCOME_TAX_DECREE_§154 = "소령 §154";        // 1세대1주택 보유 2년 요건 (사례 46)
export const URBAN_RENOVATION_§74 = "도정법 §74";          // 관리처분계획 인가 (재개발/재건축 본류)
export const SMALL_HOUSING_RENOVATION_§29 = "빈집소규모정비법 §29";  // 사업시행계획 인가 (소규모정비)
```

---

## 엔진 input 타입

```ts
// lib/tax-engine/types/transfer.types.ts

export type PropertyType =
  | "housing" | "land" | "building"
  | "right_to_move_in" | "presale_right"
  | "mixed-use-house"
  | "commercial_building" | "general_building_unit" | "general_building"
  | "redevelopment_apt";  // ★ 신규

export interface RedevelopmentInfo {
  /** 양도 대상 — 입주권 또는 완공 APT */
  subject: "right" | "apt";

  /**
   * 인가일 법령 근거 식별자 — §95② 본법 단서에 등재된 두 가지를 분기.
   * - "urban_renovation_§74": 도정법 §74 관리처분계획 인가 (재개발/재건축 본류)
   * - "small_housing_§29":   빈집소규모정비법 §29 사업시행계획 인가 (소규모정비)
   * 본 PR anchor 는 §74 만 등록. §29 슬롯은 후속 PR 마이그레이션 회피용 사전 도입.
   */
  approvalLawBasis: "urban_renovation_§74" | "small_housing_§29";

  /** 관리처분/사업시행계획 인가일 (approvalLawBasis 에 따라 §74 또는 §29) */
  approvalDate: Date;

  /** 권리가액 (인가전 분 양도가액으로 의제) */
  rightsValue: number;

  /** 청산금 방향 */
  settlementDirection: "pay" | "receive";

  /** 청산금 금액 (절댓값) */
  settlementAmount: number;

  /**
   * 청산금 수령 시 양도일 — 소유권이전 고시일의 다음날 (NTS 집행기준 + 소법 §95④ 보유기간 정의).
   * settlementDirection === "receive" 시 필수.
   * LTHD `settlement.holdingMonths` = monthsBetween(acquisitionDate, settlementSaleDate).
   * settlementDirection === "pay" 시 무시.
   */
  settlementSaleDate?: Date;

  /**
   * 인가전 분 필요경비 (법 §97①2·3호 + 시행령 §163⑥).
   * §166①1호·②1호·①2호가목 산식 본문에 등장. 사례 44 = 2,551,049.
   */
  preApprovalExpenses: number;

  /**
   * 인가후 분 필요경비 (법 §97①2·3호).
   * §166①1호 인가후양도차익 산식: "[양도가액 − (평가액 + 납부청산금) − 필요경비]" 의 필요경비.
   * **자산-수준 `asset.expenses` 와의 매핑 정책**:
   *   - 본 PR 사례 44 = 0 (인가후 분 추가 필요경비 없음)
   *   - 일반화: AssetForm 의 `expenses` 필드 입력값을 그대로 매핑 (자산-수준 필요경비)
   *   - 인가전·인가후 필요경비를 분리 입력할 필요가 있는 케이스는 후속 PR (현재 input 단일값)
   * 본 PR 안전 기본값: 0.
   */
  postApprovalExpenses?: number;

  /** 출자 자산 종류 — subject="apt" 시 필요 */
  originalAssetType?: "land" | "housing";

  // ─ 환산 케이스 (실가 케이스에서는 미사용) ─
  /** 취득시 기준시가 (주택분) */
  acquisitionStdPrice?: number;
  /** 관리처분 인가일 기준시가 (= 양도 의제 시점 기준시가) */
  managementDisposalStdPrice?: number;

  /**
   * 개별주택가격/공동주택가격 최초 공시일 (시행령 §164⑦ 단서 트리거).
   * acquisitionDate < firstDisclosureDate 인 경우 §164⑤ 준용 대체 산식 발동.
   * ★ 정정: 이전 안 "취득시 ≤ 취득전기" 분기는 폐기.
   */
  firstDisclosureDate?: Date;
  /** 최초고시 시점 기준시가 (§164⑦ 단서 발동 시 대체값) */
  firstDisclosureStdPrice?: number;

  /**
   * 환산취득가 rounding 모드 — 시행령 §176의2②2호는 산식만 규정하고 rounding 미규정.
   * 본 엔진 기본값 "floor" (BigInt 정수 연산 일관성). 사례 44 anchor 사전 손계산 필수.
   */
  acquisitionRounding?: "floor" | "round";
}

// TransferTaxInput 확장 (기존 호환 — optional)
export interface TransferTaxInput {
  // ... 기존 필드 ...
  redevelopment?: RedevelopmentInfo;  // ★ 신규 — 기존 자산은 영향 없음
}
```

## 엔진 result 타입

```ts
export interface RedevelopmentResult {
  /** 인가전 분 */
  preApproval: {
    transferPrice: number;          // = 권리가액 (의제)
    acquisitionPrice: number;       // 실가 또는 환산
    expenses: number;
    gain: number;                   // 양도차익 ①
    /**
     * 보유기간 (months 단위 — 기존 LTHD 헬퍼 호환).
     * - subject="apt": 취득일 → 신축양도일 (§166⑤2호나목, 사례 44 = 17년 10월 = 214개월)
     * - subject="right": 취득일 → 관리처분 인가일 (§166⑤1호, 짧은 기간)
     */
    holdingMonths: number;
    lthd: number;                   // 표1/표2 적용 후 (subject="right" 원조합원만 적용, 승계조합원 0)
    lthdRate: number;               // 0~0.8
  };
  /** 인가후 기존주택분 — subject="apt" 만 산출. subject="right" 시 LTHD 대상 자체 부존재 (§95② 단서·§166⑤1호) */
  postApprovalExistingHouse: {
    apportionedTransfer: number;    // = 인가후 양도가액 × 권리가액/분양가
    apportionedAcquisition: number; // = 분양가 × 권리가액/분양가 = 권리가액
    gain: number;                   // 양도차익 ②₁ — subject="right" 시 0 (대상 부존재)
    /**
     * - subject="apt": 취득일 → 신축양도일 (§166⑤2호나목)
     * - subject="right": 0 (LTHD 대상 양도차익 부존재 — 금액 0이 아니라 대상 자체 없음)
     */
    holdingMonths: number;
    lthd: number;                   // subject="right" 시 0
    lthdRate: number;
  };
  /** 청산금 분 */
  settlement: {
    apportionedTransfer: number;
    apportionedAcquisition: number;
    gain: number;                   // 납부: 양도차익 ②₂ / 수령: 단독 양도차익
    /**
     * - subject="apt" + pay: approvalDate → transferDate (§166⑤2호가목)
     * - subject="apt" + receive: acquisitionDate → settlementSaleDate (소유권이전 고시일 다음날, NTS 집행기준)
     * - subject="right": 0 (LTHD 대상 자산 부존재 — 청산금은 §94① LTHD 범위 외)
     */
    holdingMonths: number;
    lthd: number;                   // subject="right" 시 0
    lthdRate: number;
  };
  /** 합계 */
  total: {
    gain: number;
    lthd: number;
    taxableIncome: number;
  };
  /** 환산취득가 산정 메타 (환산 케이스만) */
  valuationMeta?: {
    /**
     * 적용 산식 식별자 (legal-codes 상수와 일치):
     * - "actual": 실가 모드 (환산 미사용)
     * - "estimated_post_disclosure_decree_§176_2_2_2": 일반 환산 산식 (§176의2②2호, 취득일 ≥ 최초공시일)
     * - "estimated_pre_disclosure_decree_§164_7": §164⑦ 단서 발동 (취득일 < 최초공시일, §164⑤ 준용 대체)
     */
    method:
      | "actual"
      | "estimated_post_disclosure_decree_§176_2_2_2"
      | "estimated_pre_disclosure_decree_§164_7";
    numerator: number;     // 사용된 취득시 기준시가 (단서 발동 시 firstDisclosureStdPrice 보정값)
    denominator: number;   // 관리처분인가일 기준시가 (양도당시 기준시가 매핑)
    rationale: string;     // 단서 적용 근거 (예: "취득일 2005-04-09 ≥ 최초공시일 2005-04-30 → §164⑦ 단서 미발동, 일반 §176의2②2호 적용")
  };
}
```

새 Date 필드 **3개** (`approvalDate` · `settlementSaleDate` · `firstDisclosureDate`)는 `lib/api/date-coerce.ts` 헬퍼로 라우트 통합:
```ts
coerceDates(parsed.redevelopment, ["approvalDate", "settlementSaleDate", "firstDisclosureDate"])
```

---

## 계산 알고리즘 (단계별)

### Step 0 — 분기 결정
- `redevelopment.subject` 확인 → "right"(입주권) / "apt"(완공 APT)
- `redevelopment.settlementDirection` → "pay" / "receive"
- `useEstimatedAcquisition` (기존 boolean) → 실가/환산

### Step 1 — 인가전 양도차익 (모든 케이스)
1. 양도가액(의제) = `rightsValue` (권리가액)
2. 취득가액:
   - **실가**: `actualAcquisitionPrice` 입력값
   - **환산**: `redevelopment-valuation.ts` 의 `computeConvertedAcquisitionPrice(input)` 호출
     ```
     기본 산식 (★ 1차 근거: **시행령 §166③** / 산술 구조 일반 근거: §176의2②2호):
       환산취득가 = rightsValue × (acquisitionStdPrice / managementDisposalStdPrice)
       (= 평가액 × 취득당시 기준시가 / 관리처분 인가일 기준시가, §166③ 본문)

     단서 분기 (시행령 §164⑦) — ★ 정정: 트리거가 날짜 비교:
       조건: acquisitionDate < firstDisclosureDate
       → 시행령 §164⑤ 준용 대체 산식 (토지/건물 분리 안분)
       → 대체 산식의 분자: firstDisclosureStdPrice × (시점 보정 비율, §164⑤ 산식)
       ⚠ 본 PR 사례 44 는 단서 미발동 (acquisitionDate ≥ firstDisclosureDate). 단서 대체식
         정확 산식은 §164⑤ 본문 의존 — 별도 anchor 사례에서 정확히 enumerate.

     Rounding (시행령 미규정):
       acquisitionRounding ?? "floor"
       safeMultiplyThenDivide(numerator, denominator) — BigInt 오버플로 방지 + floor

     사전 손계산 검증 (사례 44 — Do 단계 진입 전 anchor 확정):
       219,218,500 × 85,034,988 = 18,641,242,316,118,000
       / 132,000,000 = 141,221,532 (floor)
       ※ xlsx 값 141,221,534 와 2원 차이. 산출세액 anchor (56,799,400) 가 최종 정합.
         환산취득가 anchor 는 ±소수 허용 또는 별도 anchor.
     ```
3. 양도차익 ① = 권리가액 − 취득가액 − preApprovalExpenses

### valuationMeta 반환 (UI 배지 표시용)
- `method`: "actual" | "estimated_pre_disclosure_decree_§164_7" | "estimated_post_disclosure_decree_§176_2_2_2"
- `rationale`: 적용된 시행령 조문 식별자 (legal-codes 상수 참조)

### Step 2 — 인가후 양도차익 (subject="apt" 만) — 시행령 §166②1호 원문 산식
1. 양도가액 = `transferPrice` (완공 APT 실거래가)
2. 분양가:
   - 납부: `rightsValue + settlementAmount` (= 평가액 + 납부청산금)
   - 수령: `rightsValue − settlementAmount`
3. 인가후 총 양도차익(=관리처분계획등인가후양도차익) = 양도가액 − 분양가 − 필요경비(법 §97①2·3호)
4. **§166②1호 원문 안분**:
   - **청산금납부분양도차익** = `인가후양도차익 × 납부청산금 / (평가액 + 납부청산금)`
   - **기존건물분양도차익** = `[인가후양도차익 × 평가액 / (평가액 + 납부청산금)] + 인가전양도차익`
     ※ 인가후 기존건물분 + 인가전 양도차익이 §166②1호에서는 **한 묶음 "기존건물분양도차익"** 으로 합산
5. 정수연산 floor — 1원 잔차는 청산금 분에 흡수
6. ⚠️ 본 엔진 result 타입은 사용자 UX(3분할 카드 표시)를 위해 `preApproval` + `postApprovalExistingHouse` + `settlement` 3개 분기로 분리하지만, **§166②1호 LTHD 보유기간 적용 시 두 항목(preApproval + postApprovalExistingHouse)을 "기존건물분양도차익" 묶음으로 합산하여 §166⑤2호나목 (취득일~신축양도일) 적용**

### Step 3 — 청산금 수령 케이스 (subject="apt" + receive)
- 청산금 수령분 양도차익 = 청산금 수령액 − 안분 취득가액
  - 안분 취득가액 = 종전 취득가액(실가 또는 환산) × (settlementAmount / rightsValue)

### Step 4 — LTHD 분기별 산정 (`redevelopment-lthd.ts`)

| 분기 | subject="right" 입주권 | subject="apt" APT |
|---|---|---|
| 인가전 | **취득일 ~ 관리처분 인가일** (§166⑤1호), 표1(원조합원만, 승계 0) | **취득일 ~ 신축 양도일** (§166⑤2호나목 — 기존건물분 묶음에 흡수), 표1(또는 1세대1주택 시 표2) |
| 인가후 기존주택분 | **LTHD 대상 양도차익 부존재** (§95② 단서·§166⑤1호 — "관리처분 인가 전 토지분 또는 건물분의 양도차익으로 한정". 금액 0이 아니라 **대상 자체가 존재하지 않음**. JSDoc 명시 필수) | **취득일 ~ 신축 양도일** (§166⑤2호나목), 표1(또는 표2) |
| 청산금 분 | **LTHD 대상 자산 부존재** (입주권 양도 시 청산금은 별도 권리 산정, LTHD 대상 자산 §94① 범위 외) | 납부: **관리처분 인가일(approvalDate) ~ 신축 양도일** (§166⑤2호**가목** — 명시 근거) / 수령: **취득일 ~ settlementSaleDate** (★ §166⑤에 직접 명시 없음 — **본법 §95④ "취득일~양도일" 일반 보유기간 정의** + NTS 집행기준 "청산금 수령분의 양도시기 = 소유권이전 고시일의 다음날" 조합으로 도출) |

⚠️ **LTHD 종료일 매핑 주의** (anchor 등록 전 검증 필수):
- 납부 케이스: 양도일 = 실제 완공 APT 양도일
- 수령 케이스: 양도일 = `settlementSaleDate` (소유권이전 고시일 다음날) — **완공 APT 실양도일 아님**
- 사례 38·39·42·43 양도코리아 xlsx 보유기간 종료일 컬럼 매핑 사전 확인 필요

★ **분배법칙 산술 정합 (C-4 명시) — 사례 44 검증**:
§166②1호 LTHD 계산은 **묶음 단위** (기존건물분 = preApproval + postApprovalExistingHouse):
- 묶음 LTHD = (75,445,917 + 149,658,784) × 30% = 225,104,701 × 30% = 67,531,410
- 청산금 분 LTHD = 63,341,216 × 26% = 16,468,716
- **합계 LTHD = 67,531,410 + 16,468,716 = 84,000,126** ✓

본 엔진 UI는 분기별 표시를 위해 **분배법칙**으로 산출:
- preApproval LTHD     = 75,445,917 × 30% = 22,633,775
- postApprovalExistingHouse LTHD = 149,658,784 × 30% = 44,897,635
- settlement LTHD      = 63,341,216 × 26% = 16,468,716
- **합계 = 22,633,775 + 44,897,635 + 16,468,716 = 84,000,126** ✓ (묶음 결과와 동일)

→ **두 방식 산술 동일** (양도차익 × LTHD율은 분배법칙 적용 가능). 본 엔진은 **분기별 산출** 채택 (UI 가독성),
   다만 LTHD율 결정 시 §166⑤ 묶음 단위 적용 — 동일 LTHD율이 묶음 내 두 항목에 모두 적용되어야 함
   (인가전+인가후기존 = §166⑤2호나목 동일 보유기간 → 동일 LTHD율 30%).

### Step 5 — 합산 & finalize emit
- 합계 양도차익 = ① + ②₁ + ②₂
- 합계 LTHD = 3개 분기 합
- 양도소득금액 = 합계 양도차익 − 합계 LTHD
- finalize emit: **LTHD 라인 3줄** (`code === 'LTHD'`) 출력. FilingFormTable 3열과 1:1 매칭.

### Step 6 — 1세대1주택 12억 안분 (사례 45, 본 PR anchor만 — 시행령 §160)
**위임 근거**: 소법 §95③ → 시행령 §160 직접 산식
```
양도차익 안분 = 법 §95① 양도차익 × (양도가액 − 12억원) / 양도가액
LTHD 안분  = 법 §95② LTHD × (양도가액 − 12억원) / 양도가액
```

**★ 안분 적용 단위 결정 (B-4 명시)**:
- 법령 §160은 "양도차익" 및 "LTHD" 전체에 산식 적용. 산술적으로는 **분배법칙**에 따라
  3분할 각 분기에 §160 산식 적용 후 합산하거나, 합계에 1회 적용 후 분기 배분하거나 결과 동일.
- 본 엔진은 **합계 양도차익·합계 LTHD에 §160 산식 1회 적용** 후, UI 결과 카드 표시용으로
  3분할 각 분기에 동일 비율 (`(양도가액 − 12억)/양도가액`) 곱해 분배 표시 (사용자 가독성).
- **§166②1호 묶음 합산** (preApproval + postApprovalExistingHouse = 기존건물분양도차익)
  과는 별개 — §160 12억 안분은 합계 양도차익에 적용하므로 묶음 단위 무관.
- LTHD 표2 적용 (§95② 단서 — 1세대1주택 + 거주요건 충족)
- ⚠️ §95②가 아니라 **§95③·시행령 §160** 가 12억 안분 산식 위임 근거 (사용자 검토 반영)

---

## Silent fallback / 자동 안분 후보 식별

**금지 항목** (validate에서 차단):
- 환산 모드에서 `acquisitionStdPrice` / `managementDisposalStdPrice` 미입력 → 차단 (자동 0 채우기 금지)
- subject="apt" 인데 `originalAssetType` 미입력 → 차단
- 청산금 수령 케이스에서 종전 취득가액 미입력 → 차단
- 관리처분 인가일 < 취득일 → 차단 (승계조합원 인가 후 취득 — 별도 분기 후속 PR)

**허용 default** (CLAUDE.md 예외):
- `firstDisclosureDate` 미입력 → 단서 분기 미발동 (일반 §176의2②2호 적용)
- `firstDisclosureStdPrice` 미입력 + 단서 분기 미발동 시 → 사용 안 함 (안전)
- ★ 폐기 필드: `preAcquisitionStdPrice` (이전 안 "취득시 ≤ 취득전기" 트리거와 함께 폐기, RedevelopmentInfo에서 제거됨)

---

## 테스트 약속

**파일 분할** (800줄 정책 — C-1 선제 분할):
- `__tests__/tax-engine/transfer/redevelopment/right.spec.ts` — 입주권 양도 (사례 36~39, ≤ 250줄)
- `__tests__/tax-engine/transfer/redevelopment/apt-land.spec.ts` — APT 토지출자 (사례 40·41 / 42·43 보류, ≤ 250줄)
- `__tests__/tax-engine/transfer/redevelopment/apt-housing.spec.ts` — APT 주택출자 (사례 44·45·46, ≤ 350줄 — 사례 44 primary anchor 9개 + §164⑦ 단서 cross-cutting 포함)
- `__tests__/tax-engine/transfer/redevelopment/_helpers.ts` — 공통 fixture (양도코리아 xlsx 입력 데이터 표준화)

**필수 anchor 사례 44 (9개 toBe — 정수 일치)**:
```
산출세액      56,799,400  ★
지방소득세      5,679,940  ★
세액합계      62,479,340  ★
인가전 양도차익  75,445,917
인가후 양도차익 213,000,000
분양가        312,000,000
LTHD 합계      84,000,126
양도소득금액  204,445,791
과세표준      201,945,791
```

**환산취득가** (`141,221,534`): xlsx 값과 BigInt floor 결과가 ±2 차이 가능 (`219,218,500 × 85,034,988 / 132,000,000 = 141,221,532`). **anchor 등록은 엔진 산출 후 확정** — 산출세액이 최종 정합 anchor.

**사례 36~41, 45, 46 anchor**: 각 3~5개 (합계 양도차익·합계 LTHD·산출세액·지방세 중심)

**보류 (snapshot only)**: 사례 42·43 — toBe 검증 없이 산출값만 기록, 후속 PR에서 국세청 해석례·집행기준 추가 자료로 확정 후 등록.

**Cross-cutting anchor**:
- 단서 분기 anchor 1건: **"취득일 < 최초공시일"** 가공 케이스 → `valuationMeta.method === "estimated_pre_disclosure_decree_§164_7"` + 산출 일치
- finalize LTHD 3줄 매칭: `expect(emit.lines.filter(l => l.code === 'LTHD').length).toBe(3)`
- §95② 단서 anchor: 입주권 양도 시 인가후 LTHD = 0 검증

**총 anchor 목표**: 40~55개 (사례 42·43 보류로 하향).

---

## 신규/수정 파일 (5파일 분할)

| 파일 | 종류 | 라인 추정 | 책임 |
|---|---|---|---|
| `lib/tax-engine/types/transfer.types.ts` | 수정 | +30 | propertyType enum + RedevelopmentInfo + Result 타입 |
| `lib/tax-engine/redevelopment.ts` | 신규 | ~200 | Orchestrator (분기 라우팅 + finalize 입력 빌더) |
| `lib/tax-engine/redevelopment-split.ts` | 신규 | ~250 | 3분할 양도차익 (Step 1·2·3 안분 산식, JSDoc: 의제 양도가액 vs 실제 양도일 분리) |
| `lib/tax-engine/redevelopment-lthd.ts` | 신규 | ~150 | 분기별 보유기간 + 표1/표2 율 + §95② 단서 분기 |
| `lib/tax-engine/redevelopment-settlement.ts` | 신규 | ~150 | 분양가 산정·청산금 안분·수령 시 취득가 안분 |
| `lib/tax-engine/redevelopment-valuation.ts` | 신규 | **~220** | 환산취득가 (§166③ 기본 산식 + §164⑦ 단서 분기 + §164⑤ 준용 토지/건물 분리 안분 + valuationMeta 산출 + safeMultiplyThenDivide BigInt 정수연산). C-2 재추정: 4시점 비교 + §164⑤ 준용 토지/건물 안분 산식까지 포함 시 200~250줄 예상 |
| `lib/tax-engine/transfer-tax.ts` | 수정 | +50 | redevelopment 분기 라우팅 |
| `lib/tax-engine/transfer-tax-finalize.ts` | 수정 | +30 | LTHD 3줄 분기 emit |
| `lib/tax-engine/legal-codes/transfer.ts` | 수정 | +20 | **15개 상수** 추가 (§95②·③·④ / §89①3호·4호 / §166·§166②1호·§166⑤ / §176의2②2호 / §164⑦·§164⑤ / §160 / §154 / 도정법 §74 / 빈집소규모정비법 §29) + 확인일자 주석 |

**라인 추정 총합** (C-2 재계측): 200(orch) + 250(split) + 150(lthd) + 150(settlement) + **220**(valuation) = **~970줄** (5파일). 각 파일 ≤ 250 안전 마진. `general-building-*.ts` 패턴 그대로 따름.

---

## UI 통합 위임

- UI 측 명세는 `transfer-tax-redevelopment.ui.design.md` (UI 시니어 작성).
- 본 PR UI 범위는 사례 44만 (APT-환산-납부-주택출자).
- 14개 동기화 지점은 UI 시니어 책임 — 엔진 시니어는 input/result 타입만 정의.
- **사이드바**: 권리가액·청산금 미추가 (단일 입력 변수이므로 합계 미산입). 미리보기 카드 + ResultCard 분기별 출력에만 노출.
- **FilingFormTable**: 인가전 / 인가후 기존주택분 / 청산금 분 3열 출력. finalize emit LTHD 3줄과 1:1 매칭 (`code === 'LTHD'` 라인 3개).
- **Store 마이그레이션**: `lib/stores/calc-wizard-migration.ts` version bump + 12개 redev 필드 default 부여 필수.
