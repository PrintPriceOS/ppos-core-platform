// ppos-core-platform/src/strategy/ShadowPolicyEngine.ts
export interface PrinterNodeCapabilities {
    nodeId: string;
    countryCode: string;
    reputationScore: number;
    supportedFormats: string[];
    supportedBindings: string[];
}

export interface ShadowRoutingResult {
    nodeId: string;
    totalExpectedCost: number;
    mfg: number;
    ship: number;
    risk: number;
    sla: number;
    distanceKm: number;
    policyMode: string;
}

export class ShadowPolicyEngine {
    private readonly weights = {
        premier_risk: 0.005,
        certified_risk: 0.02,
        sandbox_risk: 0.08,
        operational_overhead: 250 // USD
    };

    public async calculateShadowDecision(
        specs: any,
        costModel: any,
        candidates: PrinterNodeCapabilities[],
        tier: 'STANDARD' | 'PREMIUM' | 'ENTERPRISE'
    ): Promise<ShadowRoutingResult> {

        if (candidates.length === 0) {
            throw new Error('SHADOW_ENGINE: No candidates provided for calculation');
        }

        const results: ShadowRoutingResult[] = candidates.map(node => {
            const mfg = costModel.total_manufacturing_cost;
            const distanceKm = this.calculateDistance(specs, node);
            const ship = this.calculateShippingCost(specs, node, distanceKm);

            const riskFactor = node.reputationScore > 95 ? this.weights.premier_risk :
                node.reputationScore > 80 ? this.weights.certified_risk :
                    this.weights.sandbox_risk;
            const risk = (costModel.total_price || 100) * riskFactor;

            const breachProbability = (100 - node.reputationScore) / 100;
            const sla = breachProbability * ((costModel.total_price || 100) + this.weights.operational_overhead);

            const total = mfg + ship + risk + sla;

            return {
                nodeId: node.nodeId,
                totalExpectedCost: total,
                mfg,
                ship,
                risk,
                sla,
                distanceKm,
                policyMode: tier === 'ENTERPRISE' ? 'SAFETY' : tier === 'PREMIUM' ? 'BALANCED' : 'MARGIN'
            };
        });

        if (tier === 'ENTERPRISE') {
            return results.sort((a, b) => (a.risk + a.sla) - (b.risk + b.sla))[0];
        } else {
            return results.sort((a, b) => a.totalExpectedCost - b.totalExpectedCost)[0];
        }
    }

    private calculateDistance(specs: any, node: PrinterNodeCapabilities): number {
        if (specs.target_country === node.countryCode) return 150;
        return 1200;
    }

    private calculateShippingCost(specs: any, node: PrinterNodeCapabilities, distanceKm: number): number {
        const baseRate = 0.05;
        const crossBorderBase = specs.target_country !== node.countryCode ? 35.0 : 0;
        return (distanceKm * baseRate) + crossBorderBase;
    }
}
