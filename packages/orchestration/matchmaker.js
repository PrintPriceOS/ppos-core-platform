/**
 * Matchmaker Service
 * Federated Package: @ppos/core-platform
 */

const db = require('@ppos/shared-infra').db;
let capabilitySync, compatibilityEngine, registryAdapter;

try {
    // Delegating back to monolith for industrial runtime facts
    capabilitySync = require('../../../PrintPricePro_Preflight-master/services/capabilitySyncService');
    compatibilityEngine = require('../../../PrintPricePro_Preflight-master/services/compatibilityEngine');
    registryAdapter = require('../../../PrintPricePro_Preflight-master/services/registryAdapter');
} catch (err) {
    console.warn('[MATCHMAKER] Industrial dependencies not found in sibling monolith');
}

class Matchmaker {
    constructor() {
        const weightsConfig = registryAdapter ? registryAdapter.getMatchmakerWeights() : {};
        this.weights = weightsConfig.weights || { physical: 0.45, operative: 0.35, commercial: 0.20 };
        this.thresholds = weightsConfig.score_thresholds || { minimum_overall: 0.6, minimum_physical: 0.8 };
    }

    async match(technicalFacts, productionIntent, productionSpecs) {
        try {
            if (!capabilitySync || !compatibilityEngine) {
                throw new Error('Industrial matching engines not available');
            }

            const printerProfiles = await capabilitySync.getActivePrinterProfiles();

            if (printerProfiles.length === 0) {
                return {
                    status: 'no_printers_available',
                    decision_explanation: 'No active printers found in the registry.'
                };
            }

            const assessments = printerProfiles.map(profile => {
                const assessment = compatibilityEngine.evaluate(technicalFacts, productionIntent, productionSpecs, profile);
                assessment.scores.overall = parseFloat(this.calculateOverallScore(assessment.scores).toFixed(3));
                return assessment;
            });

            const validCandidates = assessments.filter(a => {
                if (a.status === 'incompatible') return false;
                if (a.scores.overall < this.thresholds.minimum_overall) return false;
                if (a.scores.physical < this.thresholds.minimum_physical) return false;
                return true;
            });

            const sortedAssessments = validCandidates.sort((a, b) => b.scores.overall - a.scores.overall);
            const best = sortedAssessments.length > 0 ? sortedAssessments[0] : null;

            return {
                status: best ? 'success' : (validCandidates.length === 0 ? 'no_compatible_printers' : 'threshold_rejection'),
                best_printer_id: best ? best.printerId : null,
                best_machine_id: best ? best.machineId : null,
                decision_explanation: this.generateMatchmakingExplanation(best, assessments),
                candidates: assessments.sort((a, b) => b.scores.overall - a.scores.overall).slice(0, 5),
                metadata: {
                    matchmaker_version: '3.1.0-federated',
                    total_scanned: assessments.length,
                    compatible_count: validCandidates.length
                }
            };
        } catch (err) {
            console.error('[CORE-PLATFORM][MATCHMAKER] Error:', err.message);
            throw err;
        }
    }

    calculateOverallScore(scores) {
        return (scores.physical * this.weights.physical) +
            (scores.operative * this.weights.operative) +
            (scores.commercial * this.weights.commercial);
    }

    generateMatchmakingExplanation(best, all) {
        if (!best) return 'No compatible printer found.';
        return `Selected ${best.printerId} as the best match. ${best.decisionExplanation}`;
    }
}

module.exports = new Matchmaker();
