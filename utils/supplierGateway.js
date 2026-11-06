/**
 * ============================================================================
 * @module      utils/supplierGateway.js
 * @description Wholesale Airtime/Data Delivery Dispatcher via Africa's Talking
 * ============================================================================
 */

require('dotenv').config();

const cleanEnvVar = (val) => {
    if (!val) return '';
    return val.toString().trim().replace(/^['"]|['"]$/g, '');
};

const username = cleanEnvVar(process.env.AT_USERNAME) || 'sandbox';
const apiKey = cleanEnvVar(process.env.AT_API_KEY);

const AfricasTalking = require('africastalking')({
    apiKey: apiKey,
    username: username
});

const airtime = AfricasTalking.AIRTIME;

/**
 * Dispatches automated airtime / bundle value to a customer's phone number.
 * 
 * @param {string} phoneNumber Destination MSISDN (e.g., 0712345678, 254712345678, or +254712345678)
 * @param {number} amount Value to dispatch in KES
 * @returns {Promise<{success: boolean, transactionId: string, raw?: object, error?: string}>}
 */
async function dispatchWholesaleResource(phoneNumber, amount) {
    try {
        let formattedPhone = phoneNumber ? phoneNumber.toString().trim() : '';
        
        // Ensure standard +254... E.164 format for Africa's Talking
        if (formattedPhone.startsWith('0')) {
            formattedPhone = `+254${formattedPhone.slice(1)}`;
        } else if (formattedPhone.startsWith('254')) {
            formattedPhone = `+${formattedPhone}`;
        } else if (!formattedPhone.startsWith('+')) {
            formattedPhone = `+${formattedPhone}`;
        }

        const valueToDispatch = Number(amount);
        console.log(`📡 [SUPPLIER GATEWAY]: Initiating Africa's Talking dispatch of KES ${valueToDispatch} to ${formattedPhone}...`);

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

        if (response && response.responses && response.responses.length > 0) {
            const recipientResult = response.responses[0];

            if (recipientResult.status === 'Success') {
                console.log(`✅ [PROVISION SUCCESS] Transaction ID: ${recipientResult.transactionId}`);
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
                    error: recipientResult.errorMessage || recipientResult.status,
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
        return {
            success: false,
            transactionId: `FAIL_LOG_${Date.now()}`,
            error: error.message
        };
    }
}

module.exports = { dispatchWholesaleResource };