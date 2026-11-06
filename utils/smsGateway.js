/**
 * ============================================================================
 * @module       utils/smsGateway.js
 * @description  Outbound Customer SMS Dispatcher via Africa's Talking
 * ============================================================================
 */

require('dotenv').config();

const cleanEnvVar = (val) => {
    if (!val) return '';
    return val.toString().trim().replace(/^['"]|['"]$/g, '');
};

const apiKey = cleanEnvVar(process.env.AT_API_KEY);
const username = cleanEnvVar(process.env.AT_USERNAME) || 'sandbox';

const AfricasTalking = require('africastalking')({
    apiKey: apiKey,
    username: username
});

const smsService = AfricasTalking.SMS;

/**
 * Dispatches an automated SMS message to a client terminal.
 * 
 * @param {string} recipientPhoneNumber - Target phone number (e.g., 2547XXXXXXXX or +2547XXXXXXXX)
 * @param {string} messageContent - The compiled text string to send
 * @returns {Promise<object|null>}
 */
async function sendBandoDropSms(recipientPhoneNumber, messageContent) {
    try {
        let formattedPhone = recipientPhoneNumber ? recipientPhoneNumber.toString().trim() : '';

        // Auto-fix 07... or 254... into +254... E.164 format
        if (formattedPhone.startsWith('0')) {
            formattedPhone = `+254${formattedPhone.slice(1)}`;
        } else if (formattedPhone.startsWith('254')) {
            formattedPhone = `+${formattedPhone}`;
        } else if (!formattedPhone.startsWith('+')) {
            formattedPhone = `+${formattedPhone}`;
        }

        const options = {
            to: [formattedPhone],
            message: messageContent
        };

        const response = await smsService.send(options);
        
        if (response && response.SMSMessageData && response.SMSMessageData.Recipients) {
            console.log(`✉️ [SMS DELIVERY SUCCESS]:`, JSON.stringify(response.SMSMessageData.Recipients));
        } else {
            console.log(`✉️ [SMS SENT]: Response payload received successfully.`);
        }

        return response;
    } catch (error) {
        console.error(`❌ [SMS ENGINE ERROR]: Failed to route message to ${recipientPhoneNumber}:`, error.message);
        // Non-blocking null return ensures transaction logging and fulfillment completed cleanly
        return null;
    }
}

module.exports = { sendBandoDropSms };