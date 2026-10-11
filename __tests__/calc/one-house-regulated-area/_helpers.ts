/** 판정 메뉴(observeCase ④→⑫→⑭) 관측 헬퍼 — 조정대상지역 데이터·고지 anchor 공용. */
import { observeCase, type RulingCase } from "../one-house-rulings/harness";

export async function judge(o: {
  regionCode: string;
  acq: string;
  transfer: string;
  price?: string;
  residence?: string;
  asset?: Record<string, unknown>;
  top?: Record<string, unknown>;
}) {
  const c: RulingCase = {
    id: "regulated-area-anchor",
    docNo: "-",
    docDate: "-",
    basis: "era",
    today: o.transfer,
    summary: "조정대상지역 데이터·고지 anchor",
    bucket: "match",
    form: {
      isOneHousehold: true,
      transferDate: o.transfer,
      contractTotalPrice: o.price ?? "600000000",
      ...(o.top ?? {}),
      asset: {
        assetKind: "housing",
        acquisitionDate: o.acq,
        regionCode: o.regionCode,
        residenceInputMode: "direct",
        residencePeriodMonthsAsset: o.residence ?? "0",
        ...(o.asset ?? {}),
      },
    } as RulingCase["form"],
  };
  return observeCase(c);
}
