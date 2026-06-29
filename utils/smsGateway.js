const AfricasTalking = require('africastalking');

// Initialize the SDK with environment variables
const atCredentials = {
    apiKey: process.env.AT_API_KEY,
    username: process.env.AT_USERNAME
};

const atInstance = AfricasTalking(atCredentials);
const smsService = atInstance.SMS;

/**
 * Dispatches an automated SMS message to a client terminal
 * @param {string} recipientPhoneNumber - Target phone number in format +254...
 * @param {string} messageContent - The compiled text string to send
 */
async function sendBandoDropSms(recipientPhoneNumber, messageContent) {
    try {
        const options = {
            to: [recipientPhoneNumber],
            message: messageContent
        };

        // Execute routing via the gateway service
        const response = await smsService.send(options);
        console.log(`✉️ [SMS DELIVERY SUCCESS]:`, JSON.stringify(response.SMSMessageData.Recipients));
        return response;
    } catch (error) {
        console.error(`❌ [SMS ENGINE ENCOUNTERED AN ERROR]: Failed to route message to ${recipientPhoneNumber}:`, error.message);
        throw error;
    }
}

module.exports = { sendBandoDropSms };