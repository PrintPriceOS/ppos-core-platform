/**
 * Autonomous Production Orchestrator
 * Federated Package: @ppos/core-platform
 */

const db = require('@ppos/shared-infra').db;
const crypto = require('uuid');

const PIPELINE_STATES = {
    JOB_RECEIVED: 'JOB_RECEIVED',
    FILE_ANALYZED: 'FILE_ANALYZED',
    FILE_AUTOFIXED: 'FILE_AUTOFIXED',
    ROUTING_CANDIDATES_GENERATED: 'ROUTING_CANDIDATES_GENERATED',
    ECONOMIC_ROUTING_COMPLETE: 'ECONOMIC_ROUTING_COMPLETE',
    OFFERS_CREATED: 'OFFERS_CREATED',
    NEGOTIATION_ACTIVE: 'NEGOTIATION_ACTIVE',
    COMMERCIAL_COMMITMENT_CREATED: 'COMMERCIAL_COMMITMENT_CREATED',
    FINANCIAL_TRANSACTION_CREATED: 'FINANCIAL_TRANSACTION_CREATED',
    PRODUCTION_ASSIGNED: 'PRODUCTION_ASSIGNED',
    PRODUCTION_IN_PROGRESS: 'PRODUCTION_IN_PROGRESS',
    PRODUCTION_COMPLETED: 'PRODUCTION_COMPLETED',
    JOB_CLOSED: 'JOB_CLOSED'
};

class AutonomousOrchestrator {
    constructor() {
        this.states = Object.values(PIPELINE_STATES);
    }

    async startPipeline(jobId) {
        const id = crypto.v4();
        await db.query(`
            INSERT INTO autonomous_job_pipelines (id, job_id, pipeline_state, pipeline_status, current_step)
            VALUES (?, ?, 'JOB_RECEIVED', 'RUNNING', 'START')
        `, [id, jobId]);

        await this.logPipelineEvent(id, 'PIPELINE_STARTED', 'START', { jobId });
        setImmediate(() => this.advancePipeline(id));
        return id;
    }

    async advancePipeline(pipelineId) {
        const { rows: [p] } = await db.query('SELECT * FROM autonomous_job_pipelines WHERE id = ?', [pipelineId]);
        if (!p || p.pipeline_status !== 'RUNNING') return;

        const currentIndex = this.states.indexOf(p.pipeline_state);
        if (currentIndex === -1 || currentIndex === this.states.length - 1) return;

        const nextState = this.states[currentIndex + 1];

        try {
            await this.runPipelineStep(pipelineId, nextState);
        } catch (err) {
            await this.handlePipelineFailure(pipelineId, nextState, err.message);
        }
    }

    async runPipelineStep(pipelineId, state) {
        const { rows: [pipeline] } = await db.query('SELECT * FROM autonomous_job_pipelines WHERE id = ?', [pipelineId]);
        const jobId = pipeline.job_id;

        console.log(`[CORE-PLATFORM][ORCHESTRATOR] Entering ${state}...`);

        switch (state) {
            case PIPELINE_STATES.FILE_ANALYZED:
                await this.updatePipelineState(pipelineId, state, 'ANALYZING');
                break;
            case PIPELINE_STATES.PRODUCTION_ASSIGNED:
                await this.updatePipelineState(pipelineId, state, 'DISPATCHING');
                break;
            case PIPELINE_STATES.JOB_CLOSED:
                await this.closePipeline(pipelineId);
                return;
            default:
                await this.updatePipelineState(pipelineId, state, 'AUTO_ADVANCING');
        }

        await this.logPipelineEvent(pipelineId, 'STEP_COMPLETED', state);
        setImmediate(() => this.advancePipeline(pipelineId));
    }

    async updatePipelineState(id, state, step) {
        await db.query(`
            UPDATE autonomous_job_pipelines 
            SET pipeline_state = ?, current_step = ? 
            WHERE id = ?
        `, [state, step, id]);
    }

    async handlePipelineFailure(id, state, reason) {
        await db.query(`
            UPDATE autonomous_job_pipelines 
            SET pipeline_status = 'FAILED', error_reason = ? 
            WHERE id = ?
        `, [reason, id]);
        await this.logPipelineEvent(id, 'STEP_FAILED', state, { error: reason });
    }

    async closePipeline(id) {
        await db.query("UPDATE autonomous_job_pipelines SET pipeline_status = 'COMPLETED', pipeline_state = 'JOB_CLOSED' WHERE id = ?", [id]);
        await this.logPipelineEvent(id, 'PIPELINE_COMPLETED', 'CLOSE');
    }

    async logPipelineEvent(pipelineId, type, step, metadata = {}) {
        await db.query(`
            INSERT INTO pipeline_events (id, pipeline_id, event_type, step_name, metadata_json)
            VALUES (?, ?, ?, ?, ?)
        `, [crypto.v4(), pipelineId, type, step, JSON.stringify(metadata)]);
    }
}

module.exports = new AutonomousOrchestrator();
