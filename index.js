/**
 * ============================================================================
 * @project       BandoDrop Core Webhook Engine
 * @description   Autonomous offline C2B payment collection & telecom provisioning gateway
 * ============================================================================
 */

require('dotenv').config();

const cors = require('cors');
const express = require('express');

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const PORT = process.env.PORT || 3000;

const { SMS_TEMPLATES, calculateFlexibleAirtime } = require('./utils/notifications');
const { sendBandoDropSms } = require('./utils/smsGateway');
const { dispatchWholesaleResource } = require('./utils/supplierGateway');
const { logTransaction, isTransactionProcessed, getAdminMetrics } = require('./utils/db');
const { initiateStkPush, registerC2BUrls } = require('./utils/darajaGateway');

console.log("----------------------------------------------------------------");
console.log("⚙️  SYSTEM DIAGNOSTICS: INITIALIZING DARAJA C2B & TELECOM GATEWAY");
console.log(`⚙️  Suppliers Layer: ${process.env.AT_API_KEY ? "CONNECTED" : "MISSING AT_API_KEY"}`);
console.log(`⚙️  Data Repository: ${process.env.SUPABASE_URL ? "CONNECTED" : "MISSING DB_URL"}`);
console.log(`⚙️  Daraja Gateway: ${process.env.DARAJA_CONSUMER_KEY ? "READY" : "MISSING DARAJA KEYS"}`);
console.log("----------------------------------------------------------------");

/**
 * Helper to normalize phone numbers into 2547XXXXXXXX format
 */
function normalizePhoneNumber(phone) {
    if (!phone) return '';
    let cleaned = phone.toString().trim();
    if (cleaned.startsWith('+')) {
        cleaned = cleaned.replace('+', '');
    } else if (cleaned.startsWith('0')) {
        cleaned = '254' + cleaned.slice(1);
    }
    return cleaned;
}

/**
 * ============================================================================
 * @route         POST /api/ussd
 * @description   Africa's Talking USSD Handler
 * ============================================================================
 */
app.post('/api/ussd', async (req, res) => {
    const { phoneNumber, text } = req.body;
    let response = '';

    if (text === '') {
        response = `CON Welcome to BandoDrop HQ \n`;
        response += `Select campus pack:\n`;
        response += `1. 1GB (1 Hour) - KSh 20\n`;
        response += `2. 250MB (24 Hours) - KSh 25\n`;
        response += `3. 700MB (24 Hours) - KSh 50\n`;
        response += `4. 1.5GB (24 Hours) - KSh 95\n`;
        response += `5. More Options / Pay via Till 3496758`;
    } 
    else if (text === '1') {
        response = `END Processing 1GB Flash Drop (KSh 20). Please check your phone for the M-PESA PIN prompt!`;
        triggerStkPush(phoneNumber, 20, '1GB_1Hour_Flash');
    } 
    else if (text === '2') {
        response = `END Processing 250MB Campus Daily (KSh 25). Please check your phone for the M-PESA PIN prompt!`;
        triggerStkPush(phoneNumber, 25, '250MB_24Hrs');
    } 
    else if (text === '3') {
        response = `END Processing 700MB Streamer (KSh 50). Please check your phone for the M-PESA PIN prompt!`;
        triggerStkPush(phoneNumber, 50, '700MB_24Hrs');
    } 
    else if (text === '4') {
        response = `END Processing 1.5GB Study Pack (KSh 95). Please check your phone for the M-PESA PIN prompt!`;
        triggerStkPush(phoneNumber, 95, '1.5GB_24Hrs');
    } 
    else if (text === '5') {
        response = `END Pay directly via M-PESA Buy Goods Till: 3496758. Data drops automatically!`;
    } 
    else {
        response = `END Invalid selection. Please try again.`;
    }

    res.set('Content-Type', 'text/plain');
    return res.status(200).send(response);
});

async function triggerStkPush(phone, amount, packageName) {
    const formattedPhone = normalizePhoneNumber(phone);
    try {
        await initiateStkPush(formattedPhone, amount, packageName);
        console.log(`📡 [USSD STK SUCCESS]: Triggered KSh ${amount} (${packageName}) to ${formattedPhone}`);
    } catch (error) {
        console.error('❌ [USSD STK ERROR]:', error.message);
    }
}

/**
 * ============================================================================
 * @route         POST /api/v1/mpesa/c2b/validation
 * @description   Safaricom Native C2B Validation Webhook
 * ============================================================================
 */
app.post('/api/v1/mpesa/c2b/validation', (req, res) => {
    console.log('📡 [C2B VALIDATION RECEIVED]:', JSON.stringify(req.body, null, 2));
    return res.json({
        ResultCode: 0,
        ResultDesc: "Accepted"
    });
});

/**
 * ============================================================================
 * @route         POST /api/v1/mpesa/c2b/confirmation
 * @description   Safaricom Native C2B Confirmation Webhook (Offline Buy Goods Flow)
 * ============================================================================
 */
app.post('/api/v1/mpesa/c2b/confirmation', async (req, res) => {
    try {
        const payment = req.body;
        console.log('⚡ [C2B CONFIRMATION RECEIVED]:', JSON.stringify(payment, null, 2));

        const transId = payment.TransID;
        const amountPaid = parseFloat(payment.TransAmount);
        const msisdn = normalizePhoneNumber(payment.MSISDN);
        const firstName = payment.FirstName || 'Campus Hustler';

        if (!transId || !amountPaid || !msisdn) {
            console.warn('⚠️ [C2B WARNING]: Missing critical transaction fields in confirmation payload.');
            return res.status(200).json({ ResultCode: 0, ResultDesc: "Accepted with missing fields" });
        }

        // Idempotency check: Ensure transaction wasn't already processed
        const alreadyProcessed = await isTransactionProcessed(transId);
        if (alreadyProcessed) {
            console.log(`ℹ️ [DUPLICATE TRANSACTION IGNORED]: ${transId} already fulfilled.`);
            return res.status(200).json({ ResultCode: 0, ResultDesc: "Already Processed" });
        }

        console.log(`💰 [C2B PAYMENT VERIFIED] Receipt: ${transId} | KSh ${amountPaid} from ${msisdn} (${firstName})`);

        // Bando Drop Optimized Campus Tariff Matrix
        let finalValueToDispatch = amountPaid;
        let resourceMetaLog = "";

        switch (amountPaid) {
            // Flash & Micro Data Deals
            case 20:
                resourceMetaLog = "1GB (1 Hour) Flash Drop"; 
                finalValueToDispatch = 20;
                break;
            case 25:
                resourceMetaLog = "250MB (24 Hours) Campus Daily";
                finalValueToDispatch = 25;
                break;
            case 50:
                resourceMetaLog = "700MB (24 Hours) Campus Streamer";
                finalValueToDispatch = 50;
                break;
            case 95:
                resourceMetaLog = "1.5GB (24 Hours) Heavy Study Pack";
                finalValueToDispatch = 95;
                break;
            case 110:
                resourceMetaLog = "2GB (24 Hours) Ultra Mega Pack";
                finalValueToDispatch = 110;
                break;

            // Minutes & Calling Bundles
            case 22:
                resourceMetaLog = "45 Mins Call (3 Hours)";
                finalValueToDispatch = 22;
                break;
            case 51:
                resourceMetaLog = "60 Mins Call (Midnight)";
                finalValueToDispatch = 51;
                break;

            // SMS & Quick Communication Add-ons
            case 10:
                resourceMetaLog = "200 SMS (24 Hours)";
                finalValueToDispatch = 10;
                break;
            case 30:
                resourceMetaLog = "1000 SMS (7 Days)";
                finalValueToDispatch = 30;
                break;

            default:
                // Dynamic fallback if a student sends an unlisted amount
                finalValueToDispatch = calculateFlexibleAirtime(amountPaid);
                resourceMetaLog = `Custom Flexible Value (KSh ${finalValueToDispatch})`;
                break;
        }

        // 1. Dispatch Wholesale Resource via Africa's Talking
        const supplyReceipt = await dispatchWholesaleResource(msisdn, finalValueToDispatch);

        // 2. Send SMS Notification to Student
        const messageToSend = SMS_TEMPLATES.STANDARD(firstName, amountPaid, resourceMetaLog);
        await sendBandoDropSms(msisdn, messageToSend);

        // 3. Log into Supabase Ledger
        await logTransaction({
            msisdn: `+${msisdn}`,
            firstName: firstName,
            amountPaid: amountPaid,
            valueDispatched: finalValueToDispatch,
            supplierRef: supplyReceipt.transactionId || transId
        });

        console.log(`🎯 [C2B AUTO-DISPATCH COMPLETE] TransID: ${transId}`);
        return res.status(200).json({ ResultCode: 0, ResultDesc: "Success" });

    } catch (error) {
        console.error(`❌ [C2B WEBHOOK ERROR]:`, error.message);
        return res.status(200).json({ ResultCode: 0, ResultDesc: "Logged with runtime error" });
    }
});

/**
 * ============================================================================
 * @route         POST /api/admin/register-c2b
 * @description   Admin Trigger to Register C2B URLs with Safaricom Daraja
 * ============================================================================
 */
app.post('/api/admin/register-c2b', async (req, res) => {
    try {
        const result = await registerC2BUrls();
        return res.status(200).json({ status: "success", data: result });
    } catch (error) {
        return res.status(500).json({ status: "error", message: error.message });
    }
});

/**
 * ============================================================================
 * @route         GET /api/admin/metrics
 * @description   Metrics API Endpoint
 * ============================================================================
 */
app.get('/api/admin/metrics', async (req, res) => {
    try {
        const metrics = await getAdminMetrics();
        return res.status(200).json({
            status: "success",
            timestamp: new Date().toISOString(),
            data: metrics
        });
    } catch (err) {
        return res.status(500).json({ status: "error", message: err.message });
    }
});

/**
 * ============================================================================
 * @route         GET /admin/dashboard
 * @description   Lightweight Admin Dashboard
 * ============================================================================
 */
app.get('/admin/dashboard', async (req, res) => {
    try {
        const metrics = await getAdminMetrics();
        const htmlResponse = `
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>BandoDrop Analytics</title>
            <style>
                body { font-family: system-ui, sans-serif; background: #0c0f12; color: #f3f4f6; padding: 40px; margin: 0; }
                .container { max-width: 1000px; margin: 0 auto; }
                h1 { color: #4ade80; margin-bottom: 5px; }
                .subtitle { color: #9ca3af; margin-top: 0; margin-bottom: 30px; font-size: 14px; }
                .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 20px; }
                .card { background: #161b22; border: 1px solid #30363d; border-radius: 8px; padding: 24px; }
                .card-title { font-size: 12px; color: #8b949e; text-transform: uppercase; margin-bottom: 10px; }
                .card-value { font-size: 32px; font-weight: 700; color: #fff; }
            </style>
        </head>
        <body>
            <div class="container">
                <h1>BandoDrop Automation Engine</h1>
                <p class="subtitle">Direct Daraja C2B Buy Goods Till 3496758 + Africa's Talking</p>
                <div class="grid">
                    <div class="card">
                        <div class="card-title">Gross Revenue Captured</div>
                        <div class="card-value">KSh ${metrics.totalRevenue}</div>
                    </div>
                    <div class="card">
                        <div class="card-title">Wholesale Resource Yield</div>
                        <div class="card-value">KSh ${metrics.totalDispatched}</div>
                    </div>
                    <div class="card">
                        <div class="card-title">Total Transactions</div>
                        <div class="card-value">${metrics.totalTransactions}</div>
                    </div>
                </div>
            </div>
        </body>
        </html>`;
        return res.status(200).send(htmlResponse);
    } catch (dashboardError) {
        return res.status(500).send("Error loading admin view.");
    }
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 BANDODROP CORE RUNNING ON PORT: ${PORT}`);
});