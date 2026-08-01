/**
 * ============================================================================
 * @module       utils/supplierGateway.js
 * @description  Wholesale Airtime/Data Delivery Dispatcher via Africa's Talking
 * ============================================================================
 */

const cleanEnvVar = (val) => {
    if (!val) return '';
    return val.toString().trim().replace(/^['"]|['"]$/g, '');
};

const username = cleanEnvVar(process.env.AT_USERNAME) || 'sandbox';
const apiKey = cleanEnvVar(process.env.AT_API_KEY);

// Initialize Africa's Talking SDK instance
const AfricasTalking = require('africastalking')({
    apiKey: apiKey,
    username: username
});

const airtime = AfricasTalking.AIRTIME;

/**
 * Dispatches live automated airtime / value to a customer's phone number.
 * 
 * @param {string} phoneNumber - Destination MSISDN in international format (+2547XXXXXXXX)
 * @param {number} amount - Monetary/Airtime value to dispatch in KES
 * @returns {Promise<{success: boolean, transactionId: string, raw: object}>}
 */
async function dispatchWholesaleResource(phoneNumber, amount) {
    try {
        let formattedPhone = phoneNumber.toString().trim();
        if (!formattedPhone.startsWith('+')) {
            formattedPhone = `+${formattedPhone}`;
        }

        const valueToDispatch = Number(amount);
        console.log(`📡 [SUPPLIER GATEWAY]: Initiating live Africa's Talking Airtime push of KES ${valueToDispatch} to ${formattedPhone}...`);

        const options = {
            recipients: [
                {
                    phoneNumber: formattedPhone,
                    currencyCode: 'KES',
                    amount: valueToDispatch
                }
            ]
        };

        const response = await airtime.send(options);

        // Check if AT returned valid responses
        if (response && response.responses && response.responses.length > 0) {
            const recipientResult = response.responses[0];

            if (recipientResult.status === 'Success') {
                console.log(`✅ [PROVISION SUCCESS] Live transaction ID: ${recipientResult.transactionId}`);
                return {
                    success: true,
                    transactionId: recipientResult.transactionId,
                    raw: response
                };
            } else {
                console.error(`⚠️ [SUPPLIER GATEWAY REJECTED]: ${recipientResult.errorMessage || recipientResult.status}`);
                return {
                    success: false,
                    transactionId: `ERR_${Date.now()}`,
                    raw: response
                };
            }
        }

        return {
            success: true,
            transactionId: `AT_TXN_${Date.now()}`,
            raw: response
        };

    } catch (error) {
        console.error('❌ [SUPPLIER GATEWAY CRITICAL ERROR]: Failed to dispatch resource:', error.message);
        // Return a graceful fallback ID so the database write and SMS notifications do not crash
        return {
            success: false,
            transactionId: `FAIL_LOG_${Date.now()}`,
            error: error.message
        };
    }
}

