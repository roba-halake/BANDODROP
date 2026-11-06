/**
 * ============================================================================
 * @module      utils/darajaGateway.js
 * @description Safaricom Daraja API Gateway (Live & Production C2B / STK)
 * ============================================================================
 */

require('dotenv').config();
const axios = require('axios');

const cleanEnvVar = (val) => {
    if (!val) return '';
    return val.toString().trim().replace(/^['"]|['"]$/g, '');
};

// Fixed check for 'live' or 'production'
const DARAJA_ENV = cleanEnvVar(process.env.DARAJA_ENV) || 'live';
const CONSUMER_KEY = cleanEnvVar(process.env.DARAJA_CONSUMER_KEY);
const CONSUMER_SECRET = cleanEnvVar(process.env.DARAJA_CONSUMER_SECRET);
const PASSKEY = cleanEnvVar(process.env.DARAJA_PASSKEY);
const SHORTCODE = cleanEnvVar(process.env.DARAJA_BUSINESS_SHORTCODE) || '4135910';
const TILL_NUMBER = cleanEnvVar(process.env.DARAJA_TILL_NUMBER) || '3496758';
const CALLBACK_URL = cleanEnvVar(process.env.DARAJA_CALLBACK_URL);

const BASE_URL = (DARAJA_ENV === 'live' || DARAJA_ENV === 'production')
    ? 'https://api.safaricom.co.ke'
    : 'https://sandbox.safaricom.co.ke';

/**
 * Generates OAuth Access Token from Safaricom Daraja
 */
async function getAccessToken() {
    try {
        const auth = Buffer.from(`${CONSUMER_KEY}:${CONSUMER_SECRET}`).toString('base64');
        const response = await axios.get(`${BASE_URL}/oauth/v1/generate?grant_type=client_credentials`, {
            headers: { Authorization: `Basic ${auth}` }
        });
        return response.data.access_token;
    } catch (error) {
        console.error('❌ [DARAJA AUTH ERROR]:', error.response?.data || error.message);
        throw new Error('Failed to generate Daraja OAuth token');
    }
}

/**
 * Registers C2B Validation and Confirmation URLs with Safaricom
 */
async function registerC2BUrls() {
    try {
        const accessToken = await getAccessToken();
        const response = await axios.post(
            `${BASE_URL}/mpesa/c2b/v1/registerurl`,
            {
                ShortCode: SHORTCODE,
                ResponseType: 'Completed',
                ConfirmationURL: CALLBACK_URL,
                ValidationURL: `${CALLBACK_URL.replace('/confirmation', '/validation')}`
            },
            { headers: { Authorization: `Bearer ${accessToken}` } }
        );
        console.log('✅ [C2B URL REGISTRATION SUCCESS]:', response.data);
        return response.data;
    } catch (error) {
        console.error('❌ [C2B REGISTRATION ERROR]:', error.response?.data || error.message);
        throw error;
    }
}

/**
 * Initiates an M-PESA Express (STK Push) - Configured for Buy Goods Till
 */
async function initiateStkPush(phoneNumber, amount, accountReference = 'BandoDrop') {
    try {
        const accessToken = await getAccessToken();

        const date = new Date();
        const timestamp = date.getFullYear() +
            String(date.getMonth() + 1).padStart(2, '0') +
            String(date.getDate()).padStart(2, '0') +
            String(date.getHours()).padStart(2, '0') +
            String(date.getMinutes()).padStart(2, '0') +
            String(date.getSeconds()).padStart(2, '0');

        const password = Buffer.from(`${SHORTCODE}${PASSKEY}${timestamp}`).toString('base64');

        let formattedPhone = phoneNumber.toString().trim().replace('+', '');
        if (formattedPhone.startsWith('0')) {
            formattedPhone = `254${formattedPhone.slice(1)}`;
        }

        const payload = {
            BusinessShortCode: SHORTCODE,
            Password: password,
            Timestamp: timestamp,
            TransactionType: 'CustomerBuyGoodsOnline', // Corrected for Buy Goods Till
            Amount: Math.round(Number(amount)),
            PartyA: formattedPhone,
            PartyB: TILL_NUMBER, // Pass your live Till Number here
            PhoneNumber: formattedPhone,
            CallBackURL: CALLBACK_URL,
            AccountReference: accountReference.slice(0, 12),
            TransactionDesc: 'BandoDrop Data Purchase'
        };

        const response = await axios.post(
            `${BASE_URL}/mpesa/stkpush/v1/processrequest`,
            payload,
            { headers: { Authorization: `Bearer ${accessToken}` } }
        );

        console.log(`📡 [DARAJA STK PUSH DISPATCHED]: ${response.data.CheckoutRequestID}`);
        return response.data;
    } catch (error) {
        console.error('❌ [DARAJA STK ERROR]:', error.response?.data || error.message);
        throw error;
    }
}

module.exports = { initiateStkPush, registerC2BUrls, getAccessToken };