/**
 * ============================================================================
 * @project     BandoDrop Core Webhook Engine
 * @description Autonomous payment collection and telecommunications provisioning gateway
 * @author      Technical Operations / Lead Engineer
 *              Designed specifically for localized high-velocity campus distribution.
 * ============================================================================
 */

// 1. ENVIRONMENT CONFIGURATION & LIFECYCLE INITIALIZATION
require('dotenv').config();

// Initialize the IntaSend Client SDK
const IntaSend = require('intasend-node');
const intasend = new IntaSend(
    process.env.INTASEND_PUBLISHABLE_KEY,
    process.env.INTASEND_SECRET_KEY,
    true // Set to true for Sandbox / Test Mode, or false for Production
);

console.log("----------------------------------------------------------------");
console.log("⚙️  SYSTEM DIAGNOSTICS: INITIALIZING TELECOM & PAYMENT MODULES");
console.log(`⚙️  Suppliers Layer: ${process.env.AT_API_KEY ? "CONNECTED [Verified Masked]" : "CRITICAL MISSING AT_API_KEY"}`);
console.log(`⚙️  Data Repository: ${process.env.SUPABASE_URL ? "CONNECTED [Supabase Pool Active]" : "CRITICAL MISSING DB_URL"}`);
console.log(`⚙️  IntaSend Gateway: ${process.env.INTASEND_PUBLISHABLE_KEY ? "READY [Keys Detected]" : "CRITICAL MISSING INTASEND KEYS"}`);
console.log("----------------------------------------------------------------");

// 2. STACK DEPENDENCIES & INGESTION MIDDLEWARE
const cors = require('cors');
const express = require('express');

const app = express();

// Enable Cross-Origin Resource Sharing for decoupling administrative client frontends
app.use(cors());

// Express global parsing middlewares for handling payload variations
app.use(express.json());
app.use(express.urlencoded({ extended: true })); // Required to parse Africa's Talking incoming USSD strings

const PORT = process.env.PORT || 3000;

// Internal business logic, notification templates, and database mapping abstraction layers
const { SMS_TEMPLATES } = require('./utils/notifications');
const { sendBandoDropSms } = require('./utils/smsGateway');
const { dispatchWholesaleResource } = require('./utils/supplierGateway');
const { logTransaction, getAdminMetrics } = require('./utils/db');

/**
 * ============================================================================
 * @route        POST /api/ussd
 * @description Offline USSD Gateway entry point via Africa's Talking.
 *              Allows zero-data, zero-SMS campus interactions to drive payment loops.
 * ============================================================================
 */
app.post('/api/ussd', async (req, res) => {
    const { sessionId, serviceCode, phoneNumber, text } = req.body;

    let response = '';

    // Step-by-step text tracking input maps (e.g., "", "1", "2")
    if (text === '') {
        response = `CON Welcome to BandoDrop HQ \n`;
        response += `Select high-velocity campus pack:\n`;
        response += `1. 1GB (1 Hour) - KSh 23\n`;
        response += `2. 1.5GB (3 Hours) - KSh 52\n`;
        response += `3. 2GB (24 Hours) - KSh 110\n`;
        response += `4. 45 Mins Call (3 Hours) - KSh 22\n`;
        response += `5. 200 SMS Pack (24 Hours) - KSh 10`;
    } 
    else if (text === '1') {
        response = `END Processing 1GB Pack. Please check your screen for the M-PESA PIN prompt!`;
        triggerUssdPayment(phoneNumber, 23, '1GB_1Hour');
    } 
    else if (text === '2') {
        response = `END Processing 1.5GB Pack. Please check your screen for the M-PESA PIN prompt!`;
        triggerUssdPayment(phoneNumber, 52, '1.5GB_3Hours');
    } 
    else if (text === '3') {
        response = `END Processing 2GB Pack. Please check your screen for the M-PESA PIN prompt!`;
        triggerUssdPayment(phoneNumber, 110, '2GB_24Hours');
    } 
    else if (text === '4') {
        response = `END Processing 45 Mins Call. Please check your screen for the M-PESA PIN prompt!`;
        triggerUssdPayment(phoneNumber, 22, '45Mins_Call');
    } 
    else if (text === '5') {
        response = `END Processing 200 SMS Pack. Please check your screen for the M-PESA PIN prompt!`;
        triggerUssdPayment(phoneNumber, 10, '200_SMS');
    } 
    else {
        response = `END Invalid selection. Please try dialing the menu code again.`;
    }

    // Africa's Talking gateway demands explicit plain text response headers
    res.set('Content-Type', 'text/plain');
    return res.status(200).send(response);
});

/**
 * ============================================================================
 * @route        POST /api/pay
 * @description Backup endpoint / manual API driver to trigger STK pushes directly.
 *              Formats the input number to international standard (2547XXXXXXXX).
 * ============================================================================
 */
app.post('/api/pay', async (req, res) => {
    const { phoneNumber, amount, packageName } = req.body;

    if (!phoneNumber || !amount) {
        return res.status(400).json({ success: false, message: "Phone number and amount are required." });
    }

    let formattedPhone = normalizePhoneNumber(phoneNumber);
    let assignedPackName = packageName || 'Manual_Payment';

    try {
        console.log(`📡 [INTASEND API] Initiating manual STK Push for KSh ${amount} to ${formattedPhone}`);
        const collection = intasend.collection();
        
        const response = await collection.mpesaStkPush({
            first_name: 'Samuel',
            last_name: 'Halake',
            email: 'samuel@bandodrop.com',
            host: 'https://bandodrop.com',
            amount: Number(amount),
            phone_number: formattedPhone,
            api_ref: `${assignedPackName}_${formattedPhone}_${Date.now()}`,
        });

        return res.status(200).json({
            success: true,
            message: 'STK push successfully triggered. Please enter your M-PESA PIN.',
            data: response
        });
    } catch (error) {
        console.error('❌ [INTASEND STK ERROR]:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to initiate M-PESA payment prompt. Check server logs.'
        });
    }
});

/**
 * ============================================================================
 * @route        POST /api/mpesa-callback
 * @description Production payment webhook listener for IntaSend payment gateway.
 *              Acts as an autonomous financial loop dispatcher.
 * ============================================================================
 */
app.post('/api/mpesa-callback', async (req, res) => {
    try {
        const { account, net_amount, state, challenge, invoice_id, api_ref } = req.body;

        // 1. Intercept security profile overrides / unauthorized origins
        if (process.env.INTASEND_CHALLENGE && challenge && challenge !== process.env.INTASEND_CHALLENGE) {
            console.warn(`🚨 [SECURITY ALERT] Unauthorized challenge mismatch intercepted.`);
            return res.status(401).json({ status: "error", message: "Unauthorized webhook origin" });
        }

        // 2. Handle IntaSend setup verification ping ONLY if no transaction state is attached
        if (challenge && !state) {
            console.log("🔒 [WEBHOOK HANDSHAKE] Challenge verification signature processed cleanly.");
            return res.status(200).json({ challenge });
        }

        console.log(`🔔 Payment Callback Alert! Invoice: ${invoice_id || 'N/A'} | Status: ${state} | Ref: ${api_ref}`);

        // 3. Drop processing routines if the status isn't explicitly COMPLETE
        if (state !== 'COMPLETE') {
            console.log(`ℹ️  [WEBHOOK EVENT: STATE REJECTED] Intercepted transaction status: [${state}]. Skipping core execution.`);
            return res.status(200).json({ status: "skipped", message: "Non-completion state change logged." });
        }

        let msisdn = account ? account.toString().trim() : "";
        if (msisdn && !msisdn.startsWith('+')) {
            msisdn = `+${msisdn}`;
        }

        const amountPaid = parseFloat(net_amount);
        const customerName = 'Hustler'; 

        console.log(`\n🔔 [AUTOMATION TRIGGERED] Processing verified KSh ${amountPaid} loop disbursement for ${msisdn}`);

        let messageToSend = "";
        let finalValueToDispatch = amountPaid; 
        let resourceMetaLog = "";

        /**
         * --------------------------------------------------------------------
         * HIGH-MARGIN CAMPUS TARIFF DISPATCHER MATRIX
         * Maps incoming net liquidity pools to specific technical assets
         * --------------------------------------------------------------------
         */
        if (amountPaid === 23 || (api_ref && api_ref.includes('1GB'))) {
            resourceMetaLog = "1GB (1 Hour) High-Velocity Pack";
            messageToSend = SMS_TEMPLATES.STANDARD(customerName, amountPaid, resourceMetaLog);
            finalValueToDispatch = 23; 
        } 
        else if (amountPaid === 52 || (api_ref && api_ref.includes('1.5GB'))) {
            resourceMetaLog = "1.5GB (3 Hours) Streaming Pack";
            messageToSend = SMS_TEMPLATES.STANDARD(customerName, amountPaid, resourceMetaLog);
            finalValueToDispatch = 52;
        } 
        else if (amountPaid === 110 || (api_ref && api_ref.includes('2GB'))) {
            resourceMetaLog = "2GB (24 Hours) Heavy Study Pack";
            messageToSend = SMS_TEMPLATES.STANDARD(customerName, amountPaid, resourceMetaLog);
            finalValueToDispatch = 110;
        } 
        else if (amountPaid === 22 || (api_ref && api_ref.includes('45Mins'))) {
            resourceMetaLog = "45 Calling Minutes Bundle (3 Hours)";
            messageToSend = SMS_TEMPLATES.STANDARD(customerName, amountPaid, resourceMetaLog);
            finalValueToDispatch = 20; 
        } 
        else if (amountPaid === 10 || (api_ref && api_ref.includes('200_SMS'))) {
            resourceMetaLog = "200 SMS Bundle Pack (24 Hours)";
            messageToSend = SMS_TEMPLATES.STANDARD(customerName, amountPaid, resourceMetaLog);
            finalValueToDispatch = 10;
        } 
        else {
            console.log(`⚠️  [UNKNOWN VALUE TARIFF] KSh ${amountPaid}. Initializing Dynamic Adjuster Matrix.`);
            const netCashBuffer = amountPaid * 0.975;
            const calculatedMegabytes = Math.floor(netCashBuffer * 20);
            
            resourceMetaLog = `${calculatedMegabytes}MB Custom Dynamic Drop`;
            messageToSend = SMS_TEMPLATES.FLEXIBLE(customerName, amountPaid, resourceMetaLog);
            finalValueToDispatch = amountPaid; 
        }

        // STEP A: PROVISION ASSET DISTRIBUTION VIA CARRIER INFRASTRUCTURE
        console.log(`Dispatched API packet to wholesale routing channels: [Allocating value: ${finalValueToDispatch}]...`);
        const supplyReceipt = await dispatchWholesaleResource(msisdn, finalValueToDispatch);
        console.log(`✅ [PROVISION SUCCESS] Telecomm carrier reference ID generated: ${supplyReceipt.transactionId}`);

        // STEP B: EMIT TRANSACTION STATUS SMS NOTIFICATION
        await sendBandoDropSms(msisdn, messageToSend);
        
        // STEP C: IMMUTABLE AUDIT LOGGING INSIDE THE CLOUD SUPABASE LEDGER
        try {
            await logTransaction({
                msisdn: msisdn,
                firstName: customerName,
                amountPaid: amountPaid,
                valueDispatched: finalValueToDispatch,
                supplierRef: supplyReceipt.transactionId,
                invoiceId: invoice_id,
                apiRef: api_ref
            });
        } catch (dbError) {
            console.error(`❌ [DATABASE ERROR]: Failed to persist row to cloud ledger:`, dbError.message);
        }

        console.log(`🎯 [TRANSACTION BOUNDARY COMPLETE] Loop cleanly processed. Injected: "${resourceMetaLog}"`);
        return res.status(200).json({ status: "success", transaction: supplyReceipt.transactionId });

    } catch (error) {
        console.error(`❌ [WEBHOOK RUNTIME CRITICAL ERROR]:`, error.message);
        return res.status(200).json({ status: "error", details: error.message });
    }
});

/**
 * ============================================================================
 * @route        GET /admin/dashboard
 * @description Low-overhead, lightweight embedded micro-analytics portal.
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
            <title>BandoDrop HQ // Analytics Dashboard</title>
            <style>
                body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #0c0f12; color: #f3f4f6; padding: 40px; margin: 0; }
                .container { max-width: 1000px; margin: 0 auto; }
                h1 { font-size: 24px; letter-spacing: -0.5px; color: #4ade80; margin-bottom: 5px; }
                p.subtitle { color: #9ca3af; margin-top: 0; margin-bottom: 30px; font-size: 14px; }
                .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 20px; margin-bottom: 40px; }
                .card { background: #161b22; border: 1px solid #30363d; border-radius: 8px; padding: 24px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.2); }
                .card-title { font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: #8b949e; margin-bottom: 10px; }
                .card-value { font-size: 32px; font-weight: 700; color: #ffffff; font-variant-numeric: tabular-nums; }
                .card-value span { font-size: 16px; color: #8b949e; font-weight: 400; }
                .badge { background: rgba(74, 222, 128, 0.1); border: 1px solid rgba(74, 222, 128, 0.2); color: #4ade80; padding: 4px 8px; border-radius: 4px; font-size: 12px; display: inline-block; margin-top: 15px; }
            </style>
        </head>
        <body>
            <div class="container">
                <h1>BandoDrop Automation Engine</h1>
                <p class="subtitle">Real-time macro-financial telemetry and transactional network integrity</p>
                <div class="grid">
                    <div class="card">
                        <div class="card-title">Gross Revenue Captured</div>
                        <div class="card-value">KSh ${metrics.totalRevenue}</div>
                        <span class="badge">IntaSend Stream Active</span>
                    </div>
                    <div class="card">
                        <div class="card-title">Wholesale Resource Yield</div>
                        <div class="card-value">KSh ${metrics.totalDispatched}</div>
                        <span class="badge">Asset Liquidity Confirmed</span>
                    </div>
                    <div class="card">
                        <div class="card-title">System Micro-Transactions</div>
                        <div class="card-value">${metrics.totalTransactions} <span>Dispatches</span></div>
                        <span class="badge">Loop Integrity 100%</span>
                    </div>
                </div>
            </div>
        </body>
        </html>
        `;
        
        return res.status(200).send(htmlResponse);
    } catch (dashboardError) {
        return res.status(500).send("Fatal Error Generating Administrative View Analytics Panel.");
    }
});

/**
 * ============================================================================
 * INTERNAL UTILITY UTILS & HOOK SUB-FUNCTIONS
 * ============================================================================
 */

// Helper utility to strictly format telephone strings to standard '2547XXXXXXXX' format
function normalizePhoneNumber(phone) {
    let cleaned = phone.toString().trim();
    if (cleaned.startsWith('+')) {
        cleaned = cleaned.replace('+', '');
    } else if (cleaned.startsWith('0')) {
        cleaned = '254' + cleaned.slice(1);
    }
    return cleaned;
}

// Background worker bridging the USSD response text choices cleanly into the IntaSend collection SDK
async function triggerUssdPayment(phone, amount, packageName) {
    const formattedPhone = normalizePhoneNumber(phone);

    try {
        const collection = intasend.collection();
        await collection.mpesaStkPush({
            first_name: 'Campus',
            last_name: 'Comrade',
            email: 'comrade@bandodrop.com',
            amount: Number(amount),
            phone_number: formattedPhone,
            api_ref: `${packageName}_${formattedPhone}_${Date.now()}`,
        });
        console.log(`📡 [USSD AUTOMATION] STK Push dispatched asynchronously via USSD for KSh ${amount} (${packageName}) to ${formattedPhone}`);
    } catch (error) {
        console.error('❌ [USSD AUTO PAYMENT TRIGGER ERROR]:', error.message);
    }
}

// 5. BOOTSTRAP NETWORK APPLICATION
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 BANDODROP PASSIVE INTERNET ENGINE RUNNING AUTONOMOUSLY ON PORT: ${PORT}`);
});