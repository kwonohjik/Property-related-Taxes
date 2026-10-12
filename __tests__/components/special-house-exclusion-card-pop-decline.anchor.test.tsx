/**
 * anchor — 감면주택 판정 카드(`SpecialHouseExclusionDetailCard`)의 §71의2 표제·중과 안내 (결정 #42 후속).
 *
 * 엔진은 조특법 §71의2① 인구감소지역주택(명부 도출)을 보유 감면주택과 **같은** `specialHouseExclusionDetail.entries`로 싣고,
 * 15호·13호 확인 목록(`SPECIAL_ACT_15HO_VERIFIED_ARTICLES`)의 제외를 영 §167의10①15호·§167의3①13호 판정에서 뺀다
 * (`population-decline-71-2.anchor.test.ts` C-1 — 다주택 중과 없음, 배제 사유에 「조특법 §71의2①」).
 * 수정 전 카드는 이것을 「조특법 감면주택 보유」로 뭉뚱그리고 「중과세율 판정의 주택 수에는 반영되지 않습니다(§167의3 별개)」만 띄웠다.
 *
 * | # | entries | 표제 | 중과 안내 |
 * |---|---|---|---|
 * | SC-1 | §71의2 적격 | 조특법 인구감소지역주택 | 15호·13호 판정에서 뺀다 |
 * | SC-2 | §98 미분양(조특령 근거 — 확인 목록 밖) 적격 | 조특법 감면주택(종전) | 종전 문구 |
 * | SC-3 | §71의2 + §98 미분양 적격 | 조특법 감면주택·인구감소지역주택 | 15호 안내 + §98 미분양은 빼지 않음(확인 필요) |
 * | SC-4 | §71의2 불성립(모름)만 | 조특법 인구감소지역주택 | 종전 문구 — 뺀 주택이 없다 |
 * | SC-5 | §99의2(확인 목록) 적격 | 조특법 감면주택(종전) | 15호 안내 |
 *
 * 검토 보정 — §71의2 항목이 있으면 「주택 수에는 반영되지 않습니다」를 **이 의제 자체**로 한정하고, 영 §167의3①12호
 * 다·라목(2026.1.1. 이후 취득 인구감소지역주택은 중과 주택 수 불산입 — 같은 항 본문 괄호)을 따로 안내한다.
 * 엔진은 그 주택을 「population_decline_second_home」으로 이미 뺀다(`house-count-era-f11.anchor.test.ts` F11-C3).
 * 종전 문구는 같은 결과 화면의 중과 상세(「주택 수 산정 배제」)와 반대로 읽혔다. SC-2·SC-5(§71의2 없음)는 종전 그대로.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { SpecialHouseExclusionDetailCard } from "@/components/calc/results/transfer/SpecialHouseExclusionDetailCard";
import { resolvePopulationDecline71_2 } from "@/lib/tax-engine/transfer-reductions/population-decline-71-2";
import {
  resolveSpecialHouseExclusions,
  type SpecialHouseExclusionResolution,
} from "@/lib/tax-engine/transfer-reductions/unsold-hybrid-p5";

afterEach(() => cleanup());

const D = (s: string) => new Date(s);
const NOWON = "1135010500";
const PYEONGCHANG = "5176025021";
const TRANSFER = D("2026-06-15");

/** 엔진 평가기 그대로 — 노원 양도 + 평창 인구감소지역주택(2024-03-01 · 2억) */
const pop = (sole: "yes" | "unknown") =>
  resolvePopulationDecline71_2({
    houses: [
      { id: "selling", acquisitionDate: D("2015-03-15"), regionCode: NOWON, isInherited: false },
      {
        id: "p",
        acquisitionDate: D("2024-03-01"),
        regionCode: PYEONGCHANG,
        acquisitionOfficialPrice: 200_000_000,
        isInherited: false,
        popDeclSoleAtAcquisition: sole,
        popDeclAcquiredByGift: "no",
      },
    ],
    sellingHouseId: "selling",
    transferDate: TRANSFER,
    presaleRights: [],
    alreadyExcludedIds: new Set(),
    otherExcludedCount: 0,
    householdHousingCount: 2,
    sellingIsHousing: true,
  });
const declared = (article: "unsold_98" | "unsold_99_2", acq: string) =>
  resolveSpecialHouseExclusions(
    [{ article, houseId: "s", houseAcquisitionDate: D(acq), houseContractDate: D(acq), requirementsConfirmed: true }],
    TRANSFER,
  );
const merge = (...rs: SpecialHouseExclusionResolution[]): SpecialHouseExclusionResolution => ({
  entries: rs.flatMap((r) => r.entries),
  excludedCount: rs.reduce((n, r) => n + r.excludedCount, 0),
});

const OLD_NOTICE = "※ 다주택 중과세율 판정의 주택 수에는 반영되지 않습니다 (소득세법 시행령 §167의3 별개)";
const card = () => screen.getByTestId("special-house-exclusion-card");
const notice15 = () => screen.queryByTestId("special-house-exclusion-surcharge-15ho-notice");
const secondHome = () => screen.queryByTestId("special-house-exclusion-second-home-notice");
const POP_LEAD = "※ 이 주택 수 제외(의제) 자체는 다주택 중과세율 판정의 주택 수를 바꾸지 않습니다";
const PLAIN_LEAD = "※ 다주택 중과세율 판정의 주택 수에는 반영되지 않습니다";

describe("SC 감면주택 판정 카드 — §71의2 표제·중과 안내", () => {
  it("SC-0 전제 — 평가기가 적격·불성립을 그대로 낸다", () => {
    expect(pop("yes").excludedCount).toBe(1);
    expect(pop("unknown").excludedCount).toBe(0);
    expect(declared("unsold_98", "1997-06-01").excludedCount).toBe(1);
    expect(declared("unsold_99_2", "2013-06-01").excludedCount).toBe(1);
  });

  it("SC-1 §71의2 적격 — 인구감소지역주택 표제 + 15호·13호 판정에서 뺀다는 안내", () => {
    render(<SpecialHouseExclusionDetailCard detail={pop("yes")} />);
    expect(card()).toHaveTextContent("조특법 인구감소지역주택 보유 — 주택수 제외");
    expect(card()).toHaveTextContent("보유 중인 조특법 인구감소지역주택을 1세대 1주택 비과세 판정 주택 수에서 제외합니다");
    expect(card()).not.toHaveTextContent("조특법 감면주택");
    expect(notice15()).toHaveTextContent("소득세법 시행령 §167의10①15호·§167의3①13호");
    expect(card()).not.toHaveTextContent("§167의3 별개");
    // 검토 보정 — 의제 자체로 한정 + 12호 다·라목 별도 판정 안내
    expect(notice15()).toHaveTextContent(POP_LEAD);
    expect(card()).not.toHaveTextContent(PLAIN_LEAD);
    expect(secondHome()).toHaveTextContent(
      "인구감소지역주택을 2026년 1월 1일 이후 취득했다면 중과 주택 수는 이 의제와 별개로 소득세법 시행령 §167의3①12 다·라목",
    );
    expect(secondHome()).toHaveTextContent("요건을 갖추면 주택 수에 산입하지 않습니다");
  });

  it("SC-2 §98 미분양(확인 목록 밖) — 종전 표제·종전 안내 그대로", () => {
    render(<SpecialHouseExclusionDetailCard detail={declared("unsold_98", "1997-06-01")} />);
    expect(card()).toHaveTextContent("조특법 감면주택 보유 — 주택수 제외");
    expect(card()).toHaveTextContent(OLD_NOTICE);
    expect(notice15()).toBeNull();
    expect(secondHome()).toBeNull();
  });

  it("SC-3 §71의2 + §98 미분양 — 두 표제를 함께, §98 미분양은 15호 판정에서 빼지 않는다(확인 필요)", () => {
    render(<SpecialHouseExclusionDetailCard detail={merge(declared("unsold_98", "1997-06-01"), pop("yes"))} />);
    expect(card()).toHaveTextContent("조특법 감면주택·인구감소지역주택 보유 — 주택수 제외");
    expect(notice15()).not.toBeNull();
    expect(card()).toHaveTextContent("§98 미분양 국민주택은(는) 위 중과 배제 사유에 드는지 확인되지 않아");
    expect(notice15()).toHaveTextContent(POP_LEAD);
    expect(secondHome()).not.toBeNull();
  });

  it("SC-4 §71의2 불성립(모름)만 — 뺀 주택이 없으니 15호 안내를 띄우지 않는다(12호 다·라목 안내는 남는다)", () => {
    render(<SpecialHouseExclusionDetailCard detail={pop("unknown")} />);
    expect(card()).toHaveTextContent("조특법 인구감소지역주택 보유 — 주택수 제외");
    expect(notice15()).toBeNull();
    expect(card()).toHaveTextContent(`${POP_LEAD} (소득세법 시행령 §167의3 별개)`);
    expect(card()).not.toHaveTextContent(PLAIN_LEAD);
    expect(secondHome()).not.toBeNull();
  });

  it("SC-5 §99의2(확인 목록) — 표제는 종전 그대로, 중과 안내는 15호·13호", () => {
    render(<SpecialHouseExclusionDetailCard detail={declared("unsold_99_2", "2013-06-01")} />);
    expect(card()).toHaveTextContent("조특법 감면주택 보유 — 주택수 제외");
    expect(notice15()).not.toBeNull();
    expect(card()).not.toHaveTextContent("확인되지 않아");
    expect(notice15()).toHaveTextContent(PLAIN_LEAD);
    expect(secondHome()).toBeNull();
  });
});
