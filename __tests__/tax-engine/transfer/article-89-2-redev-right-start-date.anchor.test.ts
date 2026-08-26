/**
 * anchor — §89②의 **조합원입주권 축 시행일** (R-2 종결)
 *
 * ## 부칙 (사용자 제공 화면 실독 · 2026-08-27)
 *
 * 소득세법 [시행 2006.01.01.] [**법률 제7837호, 2005.12.31.** 일부개정] — §89②이 **신설**된 개정이다.
 *
 * > **부칙 제12조**(조합원입주권과 주택을 보유한 자에 대한 1세대 1주택 양도소득세 비과세의 배제 및
 * > 양도소득세의 세율에 관한 적용례)
 * > ① 제89조제2항 및 제104조제1항의 개정규정은 **2006년 1월 1일 이후 최초로** 「도시 및
 * >   주거환경정비법」에 따른 주택재개발사업 또는 주택재건축사업의 **관리처분계획이 인가된 분부터**
 * >   적용한다.
 * > ② 2006년 1월 1일 **전에** … 관리처분계획이 인가되어 취득된 입주자로 선정된 지위 또는
 * >   「주택건설촉진법」 제33조의 규정에 따라 주택재건축 사업계획승인을 얻어 취득된 입주자로
 * >   선정된 지위를 **2006년 1월 1일 이후에 매매·상속 등으로 인하여 승계취득**하는 자에 대하여는
 * >   그 승계취득한 … 지위를 2006년 1월 1일 이후 … 관리처분계획의 인가로 인하여 취득한
 * >   조합원입주권으로 **보아서** 제89조제2항 … 의 개정규정을 적용한다.
 *
 * ## ⭐ 축이 분양권과 **다르다**
 *
 * | 권리 | 게이트 | 근거 |
 * |---|---|---|
 * | 분양권 | **취득일** ≥ 2021-01-01 | §88 10호 정의 시행일(DB `presaleRightStartDate`) |
 * | 조합원입주권 | **관리처분계획 인가일** ≥ 2006-01-01 | 법률 제7837호 부칙 §12① |
 *
 * 「취득일」로 묶으면 조용히 틀린다 — 부칙 ①의 기준은 **인가일**이고, 취득일은 부칙 ②의
 * **승계취득 의제**에서만 등장한다.
 *
 * ## 🔑 인가일이 2006 이전이면 취득일이 갈래를 가른다
 *
 * · 원조합원 — 종전주택 취득일이든 인가일이든 **둘 다 2006 이전**이라 어느 쪽으로 입력해도
 *   결과가 같다(취득일 라벨의 모호성이 결과를 바꾸지 않는다).
 * · 승계조합원 — 취득일 = 승계취득일. 2006-01-01 이후면 부칙 ②가 **적용 대상으로 의제**한다.
 *
 * ## ⚠️ 미선언은 「적용」이다
 *
 * 2026년 현재 보유 중인 조합원입주권의 인가일이 2006-01-01 **이전**일 경우는 인가 후 20년 넘게
 * 준공되지 않은 사업뿐이라 사실상 예외다. 그래서 인가일 미입력은 **부칙 ① 원칙(적용)** 으로 읽고,
 * 해당 세대가 선언으로 빠져나가게 한다. 「미입력 = 미해당」 규약(신규 필드는 판정 불가)과 방향이
 * 반대인데, 여기서는 **원칙이 적용**이고 예외가 좁기 때문이다.
 */
import { describe, it, expect } from "vitest";
import { calculateTransferTax, type TransferTaxInput } from "@/lib/tax-engine/transfer-tax";
import {
  resolveArticle89Clause2,
  ARTICLE_89_2_REDEV_RIGHT_START_DATE,
} from "@/lib/tax-engine/transfer-tax-89-2-exclusion";
import { makeMockRates, baseTransferInput } from "../_helpers/mock-rates";
import type { PresaleRight } from "@/lib/tax-engine/types/multi-house-surcharge.types";

const mockRates = makeMockRates();
const run = (input: TransferTaxInput) => calculateTransferTax(input, mockRates);
const verdict = (input: TransferTaxInput) => resolveArticle89Clause2(input, undefined);

/**
 * 종전주택 취득(2015-06-01) 4개월 뒤 권리 취득 ⇒ §156의2③의 1년 요건 미충족 ⇒ **배제 확정**.
 * 그래서 이 픽스처의 결과는 **오직 시행일 게이트가 가른다**.
 */
function right(over: Partial<PresaleRight> = {}): PresaleRight {
  return {
    id: "r1",
    type: "redevelopment_right",
    acquisitionDate: new Date("2015-10-01"),
    region: "capital",
    ...over,
  };
}

function houseInput(over: Partial<TransferTaxInput> = {}): TransferTaxInput {
  return baseTransferInput({
    propertyType: "housing",
    isOneHousehold: true,
    householdHousingCount: 1,
    transferPrice: 900_000_000,
    acquisitionPrice: 400_000_000,
    acquisitionDate: new Date("2015-06-01"),
    transferDate: new Date("2024-06-01"),
    residencePeriodMonths: 60,
    presaleRights: [right()],
    ...over,
  });
}

describe("상수", () => {
  it("조합원입주권 축 시행일은 2006-01-01이다 (법률 제7837호 부칙 §12①)", () => {
    expect(ARTICLE_89_2_REDEV_RIGHT_START_DATE.toISOString().slice(0, 10)).toBe("2006-01-01");
  });
});

describe("부칙 §12① — 관리처분계획 인가일이 기준이다", () => {
  it("기준선: 인가일 미입력은 원칙대로 적용된다 (종전 동작 유지)", () => {
    const r = run(houseInput());
    expect(r.isExempt).toBe(false); // §89② 배제 확정
  });

  it("★ 인가일이 2006-01-01 이후 → 적용", () => {
    const v = verdict(
      houseInput({
        presaleRights: [right({ managementDisposalApprovalDate: new Date("2010-05-01") })],
      }),
    );
    expect(v.status).toBe("excluded");
  });

  it("★ 인가일이 2006-01-01 **전** + 원조합원 → §89②이 적용되지 않는다 ⇒ 비과세 유지", () => {
    const r = run(
      houseInput({
        presaleRights: [
          right({
            managementDisposalApprovalDate: new Date("2005-06-01"),
            acquisitionDate: new Date("2005-06-01"), // 원조합원 — 인가로 전환
          }),
        ],
      }),
    );
    expect(r.isExempt).toBe(true);
    expect(r.totalTax).toBe(0);
  });

  it("🔑 경계: 2006-01-01 당일 인가는 「이후」다", () => {
    const onDay = verdict(
      houseInput({
        presaleRights: [right({ managementDisposalApprovalDate: new Date("2006-01-01") })],
      }),
    );
    expect(onDay.status).toBe("excluded");

    const dayBefore = verdict(
      houseInput({
        presaleRights: [
          right({
            managementDisposalApprovalDate: new Date("2005-12-31"),
            acquisitionDate: new Date("2005-12-31"),
          }),
        ],
      }),
    );
    expect(dayBefore.status).toBe("not_applicable"); // 그 권리가 §89②의 대상이 아니다
  });

  it("🔑 원조합원은 취득일을 **종전주택 취득일**로 넣어도 결과가 같다", () => {
    // 취득일 라벨이 모호하지만, 인가일이 2006 이전이면 종전주택 취득일도 그보다 앞이라 갈래가 같다.
    const v = verdict(
      houseInput({
        presaleRights: [
          right({
            managementDisposalApprovalDate: new Date("2005-06-01"),
            acquisitionDate: new Date("1998-03-01"), // 종전주택 취득일
          }),
        ],
      }),
    );
    expect(v.status).toBe("not_applicable");
  });
});

describe("부칙 §12② — 2006-01-01 이후 승계취득은 적용 대상으로 의제한다", () => {
  it("★ 인가 2005 + 승계취득 2007 → 적용된다", () => {
    const v = verdict(
      houseInput({
        presaleRights: [
          right({
            managementDisposalApprovalDate: new Date("2005-06-01"),
            acquisitionDate: new Date("2007-03-01"), // 매매·상속 등 승계취득
          }),
        ],
      }),
    );
    expect(v.status).toBe("excluded");
  });

  it("🔑 승계취득도 2006-01-01 **전**이면 의제되지 않는다", () => {
    const v = verdict(
      houseInput({
        presaleRights: [
          right({
            managementDisposalApprovalDate: new Date("2005-06-01"),
            acquisitionDate: new Date("2005-09-01"),
          }),
        ],
      }),
    );
    expect(v.status).toBe("not_applicable");
  });

  it("🔑 경계: 승계취득 2006-01-01 당일은 「이후」다", () => {
    const v = verdict(
      houseInput({
        presaleRights: [
          right({
            managementDisposalApprovalDate: new Date("2005-06-01"),
            acquisitionDate: new Date("2006-01-01"),
          }),
        ],
      }),
    );
    expect(v.status).toBe("excluded");
  });
});

describe("⭐ 분양권 축과 **섞이지 않는다**", () => {
  it("분양권에는 인가일 게이트가 걸리지 않는다 — 취득일 축 그대로다", () => {
    // 기산일 미제공 ⇒ 분양권은 판정하지 않는다(종전 규약). 인가일을 넣어도 달라지지 않는다.
    const v = verdict(
      houseInput({
        presaleRights: [
          right({
            type: "presale_right",
            managementDisposalApprovalDate: new Date("2010-05-01"),
          }),
        ],
      }),
    );
    expect(v.status).toBe("not_applicable");
  });

  it("🔑 조합원입주권은 분양권 기산일이 없어도 판정된다 (축이 다르다)", () => {
    const v = verdict(
      houseInput({
        presaleRights: [right({ managementDisposalApprovalDate: new Date("2010-05-01") })],
      }),
    );
    expect(v.status).toBe("excluded");
  });
});
