// ppos-core-platform/src/orchestration/activities.ts
import { Context } from '@temporalio/activity';
// Note: In production, these would be imported from @ppos/shared-contracts/infra
// For now, we assume a database connection is available.

export enum GlobalJobState {
    INGESTED = 'INGESTED',
    PREFLIGHTING = 'PREFLIGHTING',
    PRICING = 'PRICING',
    MATCHMAKING = 'MATCHMAKING',
    DISPATCHED = 'DISPATCHED',
    NODE_ACCEPTED = 'NODE_ACCEPTED',
    IN_PRODUCTION = 'IN_PRODUCTION',
    SHIPPED = 'SHIPPED',
    FAILED = 'FAILED',
    REFUNDED = 'REFUNDED'
}

export async function updateJobRegistryActivity(
    db: any,
    jobId: string,
    traceId: string,
    newState: GlobalJobState,
    expectedPreviousState: GlobalJobState | null,
    triggerActivity: string,
    payload: any = {}
): Promise<void> {
    const connection = await db.getConnection();
    const context = Context.current();

    try {
        await connection.beginTransaction();

        const workflowId = context.info.workflowId;
        const workflowRunId = context.info.runId;

        if (expectedPreviousState) {
            await connection.execute(
                `UPDATE canonical_job_registry 
                 SET current_stage = ?, updated_at = NOW(3), workflow_id = ?, workflow_run_id = ?
                 WHERE job_id = ? AND current_stage = ?`,
                [newState, workflowId, workflowRunId, jobId, expectedPreviousState]
            );
        } else {
            await connection.execute(
                `INSERT INTO canonical_job_registry (job_id, current_stage, trace_id, workflow_id, workflow_run_id, sla_deadline)
                 VALUES (?, ?, ?, ?, ?, DATE_ADD(NOW(3), INTERVAL 7 DAY))
                 ON DUPLICATE KEY UPDATE current_stage = ?, workflow_id = ?, workflow_run_id = ?`,
                [jobId, newState, traceId, workflowId, workflowRunId, newState, workflowId, workflowRunId]
            );
        }

        await connection.execute(
            `INSERT INTO job_events_ledger (event_id, job_id, previous_stage, new_stage, trigger_activity, trace_id, event_payload)
             VALUES (UUID(), ?, ?, ?, ?, ?, ?)`,
            [jobId, expectedPreviousState, newState, triggerActivity, traceId, JSON.stringify(payload)]
        );

        await connection.commit();
    } catch (err) {
        if (connection) await connection.rollback();
        throw err;
    } finally {
        if (connection) connection.release();
    }
}

import { ShadowPolicyEngine } from '../strategy/ShadowPolicyEngine';
import { ShadowLoggingService } from '../strategy/ShadowLoggingService';

export async function matchmakerActivity(
    db: any, 
    jobId: string, 
    pricing: any, 
    findings: any, 
    matchmakingUtils: any // contains rankAndSelectNodes, getActivePrinterNodes
): Promise<any> {
    const shadowEngine = new ShadowPolicyEngine();
    const shadowLogger = new ShadowLoggingService(db);
    const traceId = Context.current().info.workflowId;

    try {
        const specs = findings.specs || {};
        const costModel = pricing.costModel || { total_manufacturing_cost: 0, total_price: pricing.price || 0 };
        if (!specs.target_country) specs.target_country = 'ES';

        const allActiveNodes = await matchmakingUtils.getActivePrinterNodes();
        const capableNodes = allActiveNodes.filter((node: any) =>
            node.supportedFormats.includes(specs.format || 'A4') &&
            node.supportedBindings.includes(specs.binding || 'perfect')
        );

        if (capableNodes.length === 0) throw new Error('NO_TECHNICAL_CANDIDATES');

        const baselineDecision = await matchmakingUtils.rankAndSelectNodes(specs, costModel, []);
        const primaryNode = baselineDecision.primaryCandidate;
        const baselineDistance = specs.target_country === primaryNode.countryCode ? 150 : 1200;

        let shadowResult;
        let shadowError;
        const shadowStart = Date.now();

        try {
            const [jobRows]: any = await db.execute(
                'SELECT customer_tier FROM canonical_job_registry WHERE job_id = ?',
                [jobId]
            );
            const tier = jobRows[0]?.customer_tier || 'STANDARD';

            shadowResult = await shadowEngine.calculateShadowDecision(specs, costModel, capableNodes, tier as any);
        } catch (err: any) {
            shadowError = err.message || 'UNKNOWN_SHADOW_ERROR';
        }

        const shadowRuntime = Date.now() - shadowStart;

        await shadowLogger.logShadowDecision({
            jobId,
            traceId,
            tier: 'STANDARD', // Mocked or fetched
            candidateCount: capableNodes.length,
            baselineNodeId: primaryNode.nodeId,
            baselineMfgCost: costModel.total_manufacturing_cost,
            baselineDistanceKm: baselineDistance,
            runtimeMs: shadowRuntime,
            errorCode: shadowError
        }, shadowResult);

        return { id: primaryNode.nodeId };

    } catch (err: any) {
        throw err;
    }
}
