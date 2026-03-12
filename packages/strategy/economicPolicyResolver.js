/**
 * Economic Policy Resolver (V23)
 * Federated Package: @ppos/core-platform
 */

let registryAdapter;
try {
    // Attempt to load from monolith until registry is also federated
    registryAdapter = require('../../../PrintPricePro_Preflight-master/services/registryAdapter');
} catch (err) {
    console.warn('[EconomicPolicyResolver] Registry adapter not found in sibling monolith');
}

class EconomicPolicyResolver {
    constructor() {
        this.profiles = null;
    }

    async loadProfiles() {
        if (!this.profiles) {
            try {
                this.profiles = registryAdapter ? registryAdapter.getEconomicPolicyProfiles() : this._getDefaults();
            } catch (err) {
                console.warn('[EconomicPolicyResolver] Falling back to defaults');
                this.profiles = this._getDefaults();
            }
        }
        return this.profiles;
    }

    async getPolicy(profile = 'eco_standard_balanced') {
        const profiles = await this.loadProfiles();
        return profiles[profile] || profiles['eco_standard_balanced'] || this._getDefaults().eco_standard_balanced;
    }

    _getDefaults() {
        return {
            eco_standard_balanced: {
                optimizationWeights: { cost: 0.3, trust: 0.3, speed: 0.2, utilization: 0.2 },
                pricingCaps: { maxUpwardSignal: 0.20, maxDownwardSignal: 0.10 },
                scarcityThresholds: { high: 0.85, critical: 0.95 }
            }
        };
    }
}

module.exports = new EconomicPolicyResolver();
