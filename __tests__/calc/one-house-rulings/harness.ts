/**
 * 1세대1주택 해석례 평가셋 하네스 — 케이스 JSON → 판정 메뉴 폼 → route POST → 판정 관측.
 *
 * 판정 메뉴 앵커(`one-house-exemption-api.anchor.test.ts`)와 같은 경로를 탄다:
 * 폼 → `buildOneHouseExemptionApiBody`(④) → Zod(⑫) → route(⑭) → 엔진.
 * 본문만 만들어 엔진을 직접 부르지 않는 이유는 그 파일 머리 주석과 같다(침묵 strip).
 *
 * 케이스 파일에는 **해석례 원문의 사실관계·문서번호·기대값만** 둔다(공개 공문서).
 * 기대값의 근거가 된 교재 문장·쪽수는 저장소 밖 비공개 자료에만 있다.
 */
import { vi } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "@/app/api/calc/one-house-exemption/route";
import { buildOneHouseExemptionApiBody } from "@/lib/calc/one-house-exemption-api";
import {
  createInitialOneHouseJudgmentForm,
  type OneHouseJudgmentFormData,
} from "@/lib/stores/one-house-judgment-form.types";
import { migrateAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { HouseEntry } from "@/lib/stores/calc-wizard-asset-nbl";
import type { OneHouseJudgment } from "@/lib/tax-engine/one-house/types";
import { validateAllSteps } from "@/lib/calc/one-house-exemption-validate";
import { RATE_LIMIT_BYPASS_HEADER } from "@/lib/api/rate-limit";
import type { ContestedVerdict, OneHouseContestedIssue } from "@/lib/tax-engine/one-house/contested-issues";

/** 평가 기준 — 원문 당시 법령(`era`) / 교재 현행 규칙(`current`). */
export type RulingBasis = "era" | "current";

/**
 * P1 분류 — `match`만 회귀 단언 대상이다.
 * `dual`: 해석이 갈리고 교재도 현행 입장을 정하지 않은 쟁점 — 엔진이 한쪽으로 단언하면 안 되고
 *         양쪽 입장을 함께 보여 줘야 하는 케이스(관측만 한다). 양론 표시(P4)가 붙은 케이스는 `match`로 옮기고
 *         `expected.contested`로 두 결론을 단언한다.
 */
export type RulingBucket = "match" | "mismatch" | "inexpressible" | "undetermined" | "pending" | "dual";

export type RulingExpected = {
  isExempt: boolean;
  isPartialExempt?: boolean;
  /** 적용돼야 하는 특례 id(`appliedExceptions[].id`) — 부분집합 단언 */
  appliedExceptions?: string[];
  /** 적용되면 안 되는 특례 id — 부정 단언(같은 결론이 다른 경로로 나오는 것을 막는다) */
  notAppliedExceptions?: string[];
  /** 주택 수에서 제외돼야 하는 명부 행 id(`houseCount.excluded[].houseId`) — 부분집합 단언 */
  excludedHouses?: string[];
  /** §155⑳ 장기임대주택 특례 결론(`rentalHousingException.passed`) */
  rentalPassed?: boolean;
  /**
   * 판정 보류 단언 — 배열이면 그 id들이 보류에 있어야 하고(부분집합),
   * `false`면 보류가 **하나도 없어야** 한다(「비과세 + 보류」가 match로 보이는 것을 막는다).
   */
  undetermined?: string[] | false;
  /**
   * 해석이 갈리는 쟁점(P4 `contestedIssues`) 단언 — 배열이면 그 쟁점들이 있고 두 입장의 결론이 같아야 하며(부분집합),
   * `false`면 쟁점이 **하나도 없어야** 한다.
   */
  contested?: { id: string; A: ContestedVerdict; B: ContestedVerdict }[] | false;
};

export type RulingCase = {
  id: string;
  docNo: string;
  docDate: string;
  basis: RulingBasis;
  /** 판정 기준일(오늘) — route가 지난 기한을 빼므로 고정한다 */
  today: string;
  summary: string;
  /** 판정 메뉴 폼 최상위 필드 덮어쓰기. `asset`은 `assets[0]`, `houses`는 명부 행 */
  form?: Partial<Omit<OneHouseJudgmentFormData, "assets" | "houses">> & {
    asset?: Record<string, unknown>;
    houses?: Partial<HouseEntry>[];
  };
  expected?: RulingExpected;
  /**
   * 입력 경로가 없어(`inexpressible`) 회귀 단언은 못 하지만 **가장 가까운 표현**으로 관측해 둘 폼.
   * 관측 모드에서만 돌린다 — 입력 경로가 생기면 `form`으로 옮기고 `match` 여부를 다시 본다.
   */
  referenceForm?: RulingCase["form"];
  bucket: RulingBucket;
  /** 불일치·표현 불가·보류 사유, 또는 단언 범위 메모 */
  note?: string;
};

/** 명부 1행 — UI가 만드는 모양(`HousesListSection` addHouse 인라인 팩토리)과 같은 기본값. */
export function makeHouse(id: string, over: Partial<HouseEntry> = {}): HouseEntry {
  return {
    id,
    region: "capital",
    acquisitionDate: "2018-01-01",
    officialPrice: "300000000",
    isInherited: false,
    isLongTermRental: false,
    isApartment: false,
    isOfficetel: false,
    isUnsoldHousing: false,
    acquisitionPrice: "",
    exclusiveArea: "",
    isUnsoldNewHouse: false,
    completionDate: "",
    isSpouseOwned: false,
    isCoInherited: false,
    decedentSameHouseholdAtInheritance: false,
    isRankingDisqualifiedInheritedHouse: false,
    ...over,
  } as HouseEntry;
}

export function buildCaseForm(
  c: RulingCase,
  which: "form" | "referenceForm" = "form",
): OneHouseJudgmentFormData {
  const base = createInitialOneHouseJudgmentForm();
  const { asset, houses, ...top } = c[which] ?? {};
  return {
    ...base,
    ...top,
    // 사례는 거주 기본값이 직접 입력(개월 수)이던 때 작성됐다 — 그 축을 명시해 사례가 보던 것을 그대로 본다.
    //   구간을 쓰는 사례는 JSON이 `residenceInputMode`·`residencePeriods`를 직접 싣는다(뒤가 우선).
    assets: [migrateAsset({ ...base.assets[0], residenceInputMode: "direct", residencePeriods: [], ...(asset ?? {}) })],
    houses: (houses ?? []).map((h, i) => makeHouse(h.id ?? `h${i + 1}`, h)),
  } as OneHouseJudgmentFormData;
}

export type RulingObservation = {
  status: number;
  isExempt?: boolean;
  isPartialExempt?: boolean;
  appliedExceptions: string[];
  undetermined: string[];
  pending: string[];
  unmetExceptions: string[];
  /** 미충족 사유 — id별 */
  unmetReasons: Record<string, string[]>;
  /** 주택 수에서 제외된 명부 행 id + 근거 */
  excludedHouses: { houseId?: string; legalBasis: string }[];
  rentalPassed?: boolean;
  /** 해석이 갈리는 쟁점 — id와 두 입장의 결론 */
  contested: { id: string; enginePosition: string; A: ContestedVerdict; B: ContestedVerdict }[];
  /**
   * 판정 메뉴 ⑧ 검증 **오류**(경고 제외) — UI라면 결과 단계로 못 가는 폼이다.
   * 비어 있지 않은 관측은 화면에서 재현할 수 없는 시료이므로 `match`로 고정하지 않는다.
   */
  validationErrors: string[];
  error?: string;
};

export async function observeCase(
  c: RulingCase,
  which: "form" | "referenceForm" = "form",
): Promise<RulingObservation> {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(`${c.today}T03:00:00Z`));
  try {
    const form = buildCaseForm(c, which);
    const validationErrors = validateAllSteps(form)
      .filter((e) => e.severity === "error")
      .map((e) => `${e.field}: ${e.message}`);
    const res = await POST(
      new NextRequest("http://localhost/api/calc/one-house-exemption", {
        method: "POST",
        // 케이스가 수백 건이라 30회/분 버킷을 넘는다 — 테스트 전용 우회 헤더(prod에선 무시됨)
        headers: { "content-type": "application/json", [RATE_LIMIT_BYPASS_HEADER]: "1" },
        body: JSON.stringify(buildOneHouseExemptionApiBody(form)),
      }),
    );
    const json = await res.json();
    const j: OneHouseJudgment | undefined = json?.data?.judgment;
    const ids = (xs: { id?: string; kind?: string }[] | undefined) =>
      (xs ?? []).map((x) => x.id ?? x.kind ?? "?");
    return {
      status: res.status,
      isExempt: j?.isExempt,
      isPartialExempt: j?.isPartialExempt,
      appliedExceptions: ids(j?.appliedExceptions),
      undetermined: ids(j?.undetermined as { id?: string }[] | undefined),
      pending: ids(j?.pending),
      unmetExceptions: ids(j?.unmetExceptions as { id?: string }[] | undefined),
      unmetReasons: Object.fromEntries((j?.unmetExceptions ?? []).map((u) => [u.id, u.reasons])),
      excludedHouses: (json?.data?.houseCount?.excluded ?? []).map(
        (x: { houseId?: string; legalBasis: string }) => ({ houseId: x.houseId, legalBasis: x.legalBasis }),
      ),
      rentalPassed: json?.data?.rentalHousingException?.passed,
      contested: ((json?.data?.contestedIssues ?? []) as OneHouseContestedIssue[]).map((c) => ({
        id: c.id,
        enginePosition: c.enginePosition,
        A: c.positions[0].verdict,
        B: c.positions[1].verdict,
      })),
      validationErrors,
      ...(res.status !== 200 ? { error: JSON.stringify(json?.error ?? json).slice(0, 400) } : {}),
    };
  } finally {
    vi.useRealTimers();
  }
}

/** 관측이 기대값과 맞는가 — 목록 단언은 부분집합(긍정)·교집합 없음(부정)으로 본다. */
export function matchesExpected(o: RulingObservation, e: RulingExpected): boolean {
  if (o.status !== 200 || o.validationErrors.length > 0) return false;
  if (o.isExempt !== e.isExempt) return false;
  if (e.isPartialExempt !== undefined && o.isPartialExempt !== e.isPartialExempt) return false;
  if (e.rentalPassed !== undefined && o.rentalPassed !== e.rentalPassed) return false;
  if (!(e.appliedExceptions ?? []).every((id) => o.appliedExceptions.includes(id))) return false;
  if ((e.notAppliedExceptions ?? []).some((id) => o.appliedExceptions.includes(id))) return false;
  if (e.undetermined === false && o.undetermined.length > 0) return false;
  if (Array.isArray(e.undetermined) && !e.undetermined.every((id) => o.undetermined.includes(id)))
    return false;
  if (e.contested === false && o.contested.length > 0) return false;
  if (
    Array.isArray(e.contested) &&
    !e.contested.every((x) => o.contested.some((c) => c.id === x.id && c.A === x.A && c.B === x.B))
  )
    return false;
  const excluded = o.excludedHouses.map((x) => x.houseId);
  return (e.excludedHouses ?? []).every((id) => excluded.includes(id));
}
