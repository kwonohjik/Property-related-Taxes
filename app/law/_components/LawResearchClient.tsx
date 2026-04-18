"use client";

import { useState } from "react";
import { SimpleTabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/simple-tabs";
import { LawSearchTab } from "./LawSearchTab";
import { DecisionSearchTab } from "./DecisionSearchTab";
import { AnnexTab } from "./AnnexTab";
import { ChainResearchTab } from "./ChainResearchTab";
import { VerifyCitationsTab } from "./VerifyCitationsTab";
import { UnifiedSearchBar } from "./UnifiedSearchBar";
import type { ChainType, DecisionDomain, RouteResult } from "@/lib/korean-law/types";

export function LawResearchClient() {
  const [activeTab, setActiveTab] = useState<string>("law");
  const [routeNonce, setRouteNonce] = useState(0);
  const [routed, setRouted] = useState<RouteResult | null>(null);

  function handleRoute(route: RouteResult) {
    setRouted(route);
    setActiveTab(route.targetTab ?? "law");
    setRouteNonce((n) => n + 1);
  }

  const initialLawQuery = extractQueryParam(routed, "q") ?? extractQueryParam(routed, "lawName");
  const initialArticleNo = extractQueryParam(routed, "articleNo");
  const initialDecisionQuery = extractQueryParam(routed, "q");
  const initialDecisionDomain = extractQueryParam(routed, "domain") as DecisionDomain | undefined;
  const initialChainQuery = extractQueryParam(routed, "query") ?? extractQueryParam(routed, "q");
  const initialChainType = routed?.chainType as ChainType | undefined;

  return (
    <div className="space-y-4">
      <UnifiedSearchBar onRoute={handleRoute} />

      <SimpleTabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="law">법령·조문</TabsTrigger>
          <TabsTrigger value="decision">판례·결정례</TabsTrigger>
          <TabsTrigger value="annex">별표·서식</TabsTrigger>
          <TabsTrigger value="chain">리서치 체인</TabsTrigger>
          <TabsTrigger value="verify">인용 검증</TabsTrigger>
        </TabsList>

        <TabsContent value="law">
          <LawSearchTab
            initialQuery={initialLawQuery}
            initialArticleNo={initialArticleNo}
            autoSearch={routed?.targetTab === "law" ? routeNonce : 0}
          />
        </TabsContent>
        <TabsContent value="decision">
          <DecisionSearchTab
            initialQuery={initialDecisionQuery}
            initialDomain={initialDecisionDomain}
            autoSearch={routed?.targetTab === "decision" ? routeNonce : 0}
          />
        </TabsContent>
        <TabsContent value="annex">
          <AnnexTab />
        </TabsContent>
        <TabsContent value="chain">
          <ChainResearchTab
            initialQuery={initialChainQuery}
            initialType={initialChainType}
            autoRun={routed?.targetTab === "chain" ? routeNonce : 0}
          />
        </TabsContent>
        <TabsContent value="verify">
          <VerifyCitationsTab />
        </TabsContent>
      </SimpleTabs>
    </div>
  );
}

function extractQueryParam(route: RouteResult | null, key: string): string | undefined {
  if (!route) return undefined;
  const v = route.params[key];
  if (v === undefined || v === null) return undefined;
  return String(v);
}
