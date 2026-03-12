/**
 * FEP Protocol Service
 * Federated Package: @ppos/core-platform
 */

class FepProtocolService {
    async validateMessage(message) {
        const findings = [];
        let isValid = true;

        try {
            if (!message.protocol || !message.message || !message.payload) {
                return this._formatResult(false, [{
                    code: 'FEP_INVALID_ENVELOPE',
                    severity: 'critical',
                    message: 'Missing required top-level envelope sections (protocol, message, payload).'
                }]);
            }

            if (message.protocol.version !== '1.0.0') {
                findings.push({
                    code: 'FEP_VERSION_MISMATCH',
                    severity: 'high',
                    message: `Unsupported protocol version: ${message.protocol.version}. Expected 1.0.0.`
                });
                isValid = false;
            }

            const schemaValid = this._simulateSchemaValidation(message);
            if (!schemaValid.success) {
                findings.push(...schemaValid.findings);
                isValid = false;
            }

            if (this._requiresGovernance(message.message.messageType) && !message.governance) {
                findings.push({
                    code: 'FEP_GOVERNANCE_REQUIRED',
                    severity: 'high',
                    message: `Message type '${message.message.messageType}' requires a governance assertion.`
                });
                isValid = false;
            }

            return this._formatResult(isValid, findings);
        } catch (error) {
            return this._formatResult(false, [{
                code: 'FEP_SYSTEM_ERROR',
                severity: 'critical',
                message: error.message
            }]);
        }
    }

    _requiresGovernance(type) {
        const sensitiveTypes = ['assignment_proposed', 'assignment_accepted', 'production_request_published'];
        return sensitiveTypes.includes(type);
    }

    _simulateSchemaValidation(message) {
        return { success: true, findings: [] };
    }

    _formatResult(isValid, findings) {
        return {
            status: isValid ? 'pass' : 'fail',
            protocolValidity: isValid,
            timestamp: new Date().toISOString(),
            findings: findings,
            telemetry: {
                processedAt: Date.now()
            }
        };
    }
}

module.exports = new FepProtocolService();
