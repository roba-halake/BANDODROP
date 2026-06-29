const axios = require('axios');

/**
 * Automates the outbound wholesale resource provisioning request
 * @param {string} phoneNumber - Recipient in +254... international format
 * @param {number} valueToDispatch - The calculated wholesale value in KSh
 * @returns {Promise<object>} Response status from the partner clearinghouse
 */
async function dispatchWholesaleResource(phoneNumber, valueToDispatch) {
    try {
        const secretKey = process.env.SUPPLIER_API_KEY;
        
        // Safety guard clause to protect backend orchestration
        if (!secretKey || secretKey.includes('MOCK_SECRET')) {
            console.log(`🚧 [SUPPLIER GATEWAY (SANDBOX)]: Simulating successful wholesale airtime/data push of KSh ${valueToDispatch} to ${phoneNumber}.`);
            return { success: true, transactionId: `TXN_${Math.random().toString(36).substr(2, 9).toUpperCase()}` };
        }

        // Production-ready API payload footprint
        const payload = {
            apiKey: secretKey,
            recipient: phoneNumber,
            amount: valueToDispatch,
            productType: "flexible_airtime_bundle"
        };

        // In production, this hits your wholesale provider endpoint (e.g., Africa's Talking Airtime API or similar partner)
        const response = await axios.post('https://api.mocksupplier.com/v1/provision', payload, {
            headers: { 'Content-Type': 'application/json' }
        });

        return response.data;
    } catch (error) {
        console.error(`❌ [SUPPLIER DISPATCH FAILURE]: Failed to provision resource for ${phoneNumber}:`, error.message);
        throw error;
    }
}

module.exports = { dispatchWholesaleResource };