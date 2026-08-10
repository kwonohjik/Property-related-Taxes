/**
 * 일반건물 × 지분(%) 분할 — **물건 사건의 지분별 前/後 판정** (무의존 순수 leaf).
 *
 * 계획서: `docs/00-pm/transfer-general-building-fractional-share.plan.md` §3-3
 * 설계:   `docs/02-design/features/transfer-general-building-fractional-share.engine.design.md` D4
 *
 * ## 왜 필요한가
 *
 * 증축·용도변경은 **물건에 일어난 사건**이지 지분에 일어난 사건이 아니다. 그래서 payload에는
 * **전 지분 동일하게** 실려 오지만(Zod superRefine이 동일성을 강제한다), 그 사건이
 * **어느 지분의 취득일 前인지 後인지**에 따라 적용 여부가 갈린다.
 *
 * 취득시기는 지분마다 따로 정해진다 — 「소득세법」 제98조 · 같은 법 시행령 제162조 제1항.
 * 사건 **後**에 취득한 지분은 그 사건을 겪지 않았다:
 *
 * | 사건 | 취득일 < 사건일 | 취득일 ≥ 사건일 |
 * |---|---|---|
 * | 증축 | 3파트(토지·건물1·건물2) | **2파트** — 증축분 포함 건물 전체를 그 날 취득 |
 * | 주택→상가 용도변경 | LTHD 기산일이 변경일로 이동 | **미적용** — 애초에 상가로 취득 |
 *
 * §99-164-10 최초공시는 **판정하지 않는다** — 최초공시「일」 필드가 존재하지 않고
 * (`general-building-converted-housing.ts`의 게이트는 `hasFirstDisclosure` boolean 하나다),
 * 산식 분자의 취득당시 기준시가가 지분-수준이라 **지분마다 다른 환산주택가격이 자동으로 나온다**.
 *
 * ## 실무 확정 (2026-08-10)
 *
 * 「1-a: 40% 지분은 **증축이 완료된 건물 취득**임 / 1-b: 장기보유특별공제 **기산일은 지분 취득일**」
 * — 근거 등급은 실무 판단 + 법령·코드 구조이며 예규는 0건이다(계획서 §8).
 */

/** 사건이 그 지분보다 **뒤**에 일어났을 때만 그 지분에 적용된다. */
function eventAppliesAfter(eventDate: Date | undefined, acquisitionDate: Date): boolean {
  if (!eventDate) return false;
  return eventDate.getTime() > acquisitionDate.getTime();
}

/**
 * 그 지분에 증축 3파트 모델이 성립하는가.
 *
 * 동일자(`===`)는 `false` — 현행 validate가 「증축일은 취득일 **이후**여야 한다」를
 * `<=`로 막고 있어(`lib/calc/transfer-tax-validate-gb.ts`) 규칙을 일치시킨다.
 */
export function extensionAppliesToShare(
  extensionDate: Date | undefined,
  buildingAcquisitionDate: Date,
): boolean {
  return eventAppliesAfter(extensionDate, buildingAcquisitionDate);
}

/** 그 지분에 주택→상가 용도변경(LTHD 기산일 이동)이 성립하는가. */
export function conversionAppliesToShare(
  conversionDate: Date | undefined,
  buildingAcquisitionDate: Date,
): boolean {
  return eventAppliesAfter(conversionDate, buildingAcquisitionDate);
}

/** `gateShareEvents`가 다루는 최소 구조 — `GeneralBuildingInput`이 구조적으로 이를 만족한다. */
export interface ShareEventGateInput {
  transferBuildingStdPrice: number;
  extensionInfo?: {
    extensionDate?: Date;
    transferExtensionBuildingStdPrice?: number;
    [k: string]: unknown;
  };
  houseToCommercialConversion?: boolean;
  conversionDate?: Date;
  wasMultiHouseAtConversion?: boolean;
  [k: string]: unknown;
}

/**
 * 지분 하나에 물건 사건을 게이팅한다.
 *
 * - 증축 미적용 → `extensionInfo` 제거 + **양도측 건물 기준시가 폴딩**(아래 🔴)
 * - 용도변경 미적용 → 용도변경 3필드 제거
 *
 * 🔴 **폴딩은 양도측만 한다.** `extensionInfo`를 떼면 2파트 경로로 가는데 그 경로는
 *    `transferBuildingStdPrice` **하나**만 읽는다. 증축분을 더하지 않으면 §166⑥ 안분 분모에서
 *    증축분이 사라져 **건물 양도가액이 과소 안분**된다.
 *
 *    반대로 **취득측(`acquisitionBuildingStdPrice`)은 더하지 않는다** — 그것은 지분-수준이고,
 *    증축 後에 취득한 지분의 사용자는 이미 **증축이 반영된** 건물 전체 기준시가를 입력한다.
 *    양쪽 다 더하면 환산 분자가 이중 계상된다. 이 **비대칭**을 anchor GBF-09가 지킨다.
 */
export function gateShareEvents<T extends ShareEventGateInput>(
  gbv: T,
  buildingAcquisitionDate: Date,
): T {
  let out: T = gbv;

  if (out.extensionInfo && !extensionAppliesToShare(out.extensionInfo.extensionDate, buildingAcquisitionDate)) {
    const folded =
      out.transferBuildingStdPrice + (out.extensionInfo.transferExtensionBuildingStdPrice ?? 0);
    const { extensionInfo: _dropped, ...rest } = out;
    void _dropped;
    out = { ...(rest as T), transferBuildingStdPrice: folded };
  }

  if (
    out.houseToCommercialConversion &&
    !conversionAppliesToShare(out.conversionDate, buildingAcquisitionDate)
  ) {
    const {
      houseToCommercialConversion: _c,
      conversionDate: _d,
      wasMultiHouseAtConversion: _m,
      ...rest
    } = out;
    void _c;
    void _d;
    void _m;
    out = rest as T;
  }

  return out;
}
