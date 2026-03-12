// ppos-core-platform/src/strategy/ShadowLoggingService.ts
import { ShadowRoutingResult } from './ShadowPolicyEngine';

export interface ShadowLogContext {
    jobId: string;
    traceId: string;
    tier: string;
    candidateCount: number;
    baselineNodeId: string;
    baselineMfgCost: number;
    baselineDistanceKm: number;
    runtimeMs: number;
    errorCode?: string;
}

export class ShadowLoggingService {
    // Assuming db is provided via a shared dependency or injection
    private db: any; 

    constructor(dbProvider: any) {
        this.db = dbProvider;
    }

    public async logShadowDecision(
        ctx: ShadowLogContext,
        shadowResult?: ShadowRoutingResult
    ): Promise<void> {
        try {
            const isDivergent = shadowResult ? ctx.baselineNodeId !== shadowResult.nodeId : false;
            const isGeoBetter = shadowResult ? shadowResult.distanceKm < ctx.baselineDistanceKm : false;

            await this.db.query(
                `INSERT INTO shadow_routing_log (
                    global_job_id, trace_id, customer_tier, candidate_count,
                    baseline_node_id, baseline_mfg_cost, baseline_distance_km,
                    shadow_node_id, shadow_total_expected_cost, shadow_mfg_cost, shadow_ship_cost, shadow_risk_cost, shadow_sla_cost, shadow_distance_km,
                    shadow_policy_mode, shadow_runtime_ms, shadow_error_code, is_divergent, is_geo_better
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    ctx.jobId, ctx.traceId, ctx.tier, ctx.candidateCount,
                    ctx.baselineNodeId, ctx.baselineMfgCost, ctx.baselineDistanceKm,
                    shadowResult?.nodeId || null, shadowResult?.totalExpectedCost || null,
                    shadowResult?.mfg || null, shadowResult?.ship || null,
                    shadowResult?.risk || null, shadowResult?.sla || null,
                    shadowResult?.distanceKm || null, shadowResult?.policyMode || null,
                    ctx.runtimeMs, ctx.errorCode || null, isDivergent, isGeoBetter
                ]
            );
        } catch (error) {
            console.error('[ShadowLogging] Fatal: Failed to persist shadow audit:', error);
        }
    }
}
