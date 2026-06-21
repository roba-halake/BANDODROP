// utils/smsGateway.js
const AfricasTalking = require('africastalking');

// These credentials come from your account.africastalking.com dashboard
const atCredentials = {
    apiKey: process.env.AT_API_KEY || 'YOUR_SANDBOX_API_KEY_HERE', 
    username: process.env.AT_USERNAME || 'sandbox' // 'sandbox' is the strict word for testing
};

const AT = AfricasTalking(atCredentials);
const sms = AT.SMS;

/**
 * Fires a live SMS text message directly to a client line
 */
const sendBandoDropSms = async (recipientPhone, messageText) => {
    try {
        // Force Kenyan format (+254...) so the API routes correctly
        let formattedPhone = recipientPhone.trim();
        if (formattedPhone.startsWith('0')) {
            formattedPhone = '+254' + formattedPhone.slice(1);
        } else if (formattedPhone.startsWith('254') && !formattedPhone.startsWith('+')) {
            formattedPhone = '+' + formattedPhone;
        }

        const options = {
            to: [formattedPhone],
            message: messageText
        };

        const result = await sms.send(options);
        console.log(`✉️ [SMS DELIVERY SUCCESS]: Routed to ${formattedPhone}. MessageID: ${result.SMSMessageData.Recipients[0].messageId}`);
        return true;
    } catch (error) {
        console.error(`❌ [SMS ENGINE ENCOUNTERED AN ERROR]: Failed to route message to ${recipientPhone}:`, error.message);
        return false;
    }
};

module.exports = { sendBandoDropSms };