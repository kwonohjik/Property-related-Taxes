/**
 * BuildingStdPriceForm — 세목 고정(라디오 숨김) + 소재지 prefill 검증.
 *
 * 자산 카드 모달에서 호출 세목(lockedTaxType)을 고정하고 부모 주소를 prefill하여
 * 시점 오선택·소재지 이중입력을 방지. 독립 페이지(미지정)는 라디오 유지(회귀).
 *
 * + 자산 폼 값 자동입력(prefill) 검증 — 연면적·토지면적·취득/양도 연도·일자.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";

afterEach(cleanup);
import { BuildingStdPriceForm } from "@/components/calc/building-std-price/BuildingStdPriceForm";
import { BuildingStdPriceModalButton } from "@/components/calc/building-std-price/BuildingStdPriceModalButton";

const ADDR = {
  road: "서울특별시 서초구 남부순환로297나길 13",
  jibun: "방배동 593-64",
  building: "방배동 아파트",
  detail: "",
  lng: "126.993824",
  lat: "37.475198",
};

describe("BuildingStdPriceForm — 세목 고정 + 소재지 prefill", () => {
  it("lockedTaxType 지정 시 세목 라디오 숨김 + 부모 주소 prefill", () => {
    render(
      <BuildingStdPriceForm
        lockedTaxType="inheritance_gift"
        initialAddress={ADDR}
        onResult={() => {}}
      />,
    );
    // 세목 라디오 숨김
    expect(screen.queryByText("양도(취득·양도 2시점)")).toBeNull();
    expect(screen.queryByText("상속·증여(1시점)")).toBeNull();
    // 소재지 검색창에 부모 주소 자동 채움
    expect(screen.getByDisplayValue(ADDR.road)).toBeTruthy();
  });

  it("lockedTaxType 미지정(독립 페이지) 시 세목 라디오 노출 — 회귀", () => {
    render(<BuildingStdPriceForm onResult={() => {}} />);
    expect(screen.getByText("양도(취득·양도 2시점)")).toBeTruthy();
    expect(screen.getByText("상속·증여(1시점)")).toBeTruthy();
  });

  it("transferSectionLabel(PHD) 시 둘째 시점 섹션 라벨 override + 취득 시점 유지", () => {
    render(
      <BuildingStdPriceForm
        lockedTaxType="transfer"
        transferSectionLabel="최초고시 시점"
        onResult={() => {}}
      />,
    );
    // 취득 시점 + 둘째 시점(최초고시 시점) 2시점 모두 렌더 — "양도 시점" 라벨은 대체
    expect(screen.getByText("취득 시점")).toBeTruthy();
    expect(screen.getByText("최초고시 시점")).toBeTruthy();
    expect(screen.queryByText("양도 시점")).toBeNull();
    // 내부 필드 라벨도 "최초고시"로 override — "양도연도/양도일/양도당시…" 잔존 없음
    expect(screen.getByText("최초고시연도")).toBeTruthy();
    expect(screen.getByText("최초고시일")).toBeTruthy();
    expect(screen.getByText("최초고시당시 구조")).toBeTruthy();
    expect(screen.queryByText("양도연도")).toBeNull();
    expect(screen.queryByText("양도당시 구조")).toBeNull();
    // 공동주택 환산 토글은 PHD 맥락에서 숨김
    expect(screen.queryByText("공동주택 고시 전 취득 (취득당시 기준시가 환산)")).toBeNull();
  });
});

describe("BuildingStdPriceForm — 자산 폼 값 자동입력(prefill)", () => {
  it("initialForm 주입 시 연면적·토지면적·취득연도·양도연도가 폼에 반영", () => {
    render(
      <BuildingStdPriceForm
        lockedTaxType="transfer"
        onResult={() => {}}
        initialForm={{
          floorArea: "283.06",
          landAreaM2: "78.01",
          acquisitionYear: "1997",
          acquisitionEventDate: "1997-07-12",
          transferYear: "2026",
          eventDate: "2026-02-16",
        }}
      />,
    );
    // 연면적·토지면적(DecimalInput) 값 반영
    expect(screen.getByDisplayValue("283.06")).toBeTruthy();
    expect(screen.getByDisplayValue("78.01")).toBeTruthy();
    // 취득·양도 연도(YearSelect trigger에 "YYYY년"으로 표시)
    expect(screen.getByText("1997년")).toBeTruthy();
    expect(screen.getByText("2026년")).toBeTruthy();
  });

  it("결정2 우선순위 — prefill이 restoredForm보다 우선(뒤 spread)", () => {
    // BuildingStdPriceModalButton의 병합 `{ ...restoredForm, ...prefillForm }`을
    // Form 레벨에서 재현: 같은 키를 뒤 spread 값이 이긴다.
    const restoredForm = { floorArea: "100" };
    const prefillForm = { floorArea: "283.06" };
    render(
      <BuildingStdPriceForm
        lockedTaxType="transfer"
        onResult={() => {}}
        initialForm={{ ...restoredForm, ...prefillForm }}
      />,
    );
    expect(screen.getByDisplayValue("283.06")).toBeTruthy();
    expect(screen.queryByDisplayValue("100")).toBeNull();
  });
});

describe("BuildingStdPriceModalButton — prefill 변환·병합 통합", () => {
  it("prefill 지정 시 모달 오픈하면 연면적·토지면적·날짜에서 파생한 연도 반영", async () => {
    render(
      <BuildingStdPriceModalButton
        lockedTaxType="transfer"
        initialAddress={ADDR}
        prefill={{
          floorArea: "283.06",
          landAreaM2: "78.01",
          acquisitionDate: "1997-07-12",
          transferDate: "2026-02-16",
        }}
        onApplyBoth={() => {}}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "건물 기준시가 계산" }));
    // 연면적·토지면적 자동 채움
    expect(await screen.findByDisplayValue("283.06")).toBeTruthy();
    expect(screen.getByDisplayValue("78.01")).toBeTruthy();
    // 날짜에서 파생한 취득연도(1997년)·양도연도(2026년)
    expect(screen.getByText("1997년")).toBeTruthy();
    expect(screen.getByText("2026년")).toBeTruthy();
  });

  it("빈 값(floorArea 미지정)은 미주입 — 필드 비어있음", async () => {
    render(
      <BuildingStdPriceModalButton
        lockedTaxType="transfer"
        initialAddress={ADDR}
        prefill={{ landAreaM2: "78.01", acquisitionDate: "1997-07-12" }}
        onApplyBoth={() => {}}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "건물 기준시가 계산" }));
    expect(await screen.findByDisplayValue("78.01")).toBeTruthy();
    // floorArea 미주입 → "283.06" 같은 값 없음(빈 연면적 필드)
    expect(screen.queryByDisplayValue("283.06")).toBeNull();
  });
});

/**
 * 🔴 **세목이 다른 복원 스냅샷은 통째로 버린다** (2026-08-24 코드 리뷰 Medium).
 *
 * 한 `snapshotKey`에 두 종류가 들어올 수 있다:
 *  · 이 모달이 저장한 **같은 세목** 스냅샷 — 복원해야 정정이 된다
 *  · **다른 세목** 스냅샷 — 세목 라디오가 있던 시절 상증으로 저장된 것,
 *    또는 배치 모달(`MultiPointBuildingStdPriceModal`)이 계산서 재구성용으로 쓴
 *    valuation 모드 스냅샷(`phdBatchToSnapshots` — `val*`만 채우고 `acq*`는 빈 값)
 *
 * 후자를 그대로 얹으면 양도 모드로 열리는데 취득당시 필드가 비어 「복원된 척하지만
 * 계산 불가」가 된다. lock을 앞에 두면(종전) 반대로 잠긴 세목이 무시되어 되돌릴 수
 * 없는 모드에 갇힌다. ⇒ 세목이 어긋나면 복원하지 않는다.
 */
describe("BuildingStdPriceForm — 세목 불일치 복원분", () => {
  const restored = (taxType: "transfer" | "inheritance_gift") => ({
    taxType,
    builtYear: "1998",
    valuationYear: "2005",
    valStructureKey: "rc",
  });

  it("lockedTaxType과 다른 세목의 복원분은 반영하지 않는다", () => {
    render(
      <BuildingStdPriceForm
        lockedTaxType="transfer"
        initialForm={restored("inheritance_gift")}
        onResult={() => {}}
      />,
    );
    // 복원분이 버려졌으므로 신축연도 값이 남지 않는다 — 남으면 필드 트랙이 섞인 것이다
    expect(screen.queryByDisplayValue("1998")).toBeNull();
  });

  it("같은 세목의 복원분은 그대로 반영한다 (정정 경로 보존)", () => {
    render(
      <BuildingStdPriceForm
        lockedTaxType="transfer"
        initialForm={restored("transfer")}
        onResult={() => {}}
      />,
    );
    expect(screen.queryByDisplayValue("1998")).not.toBeNull();
  });

  it("lockedTaxType이 없으면(독립 페이지) 복원분을 그대로 쓴다 — 회귀 방어", () => {
    render(<BuildingStdPriceForm initialForm={restored("inheritance_gift")} onResult={() => {}} />);
    expect(screen.queryByDisplayValue("1998")).not.toBeNull();
  });
});
