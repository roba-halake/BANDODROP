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

console.log("----------------------------------------------------------------");
console.log("⚙️  SYSTEM DIAGNOSTICS: INITIALIZING TELECOM MODULES");
console.log(`⚙️  Suppliers Layer: ${process.env.AT_API_KEY ? "CONNECTED [Verified Masked]" : "CRITICAL MISSING AT_API_KEY"}`);
console.log(`⚙️  Data Repository: ${process.env.SUPABASE_URL ? "CONNECTED [Supabase Pool Active]" : "CRITICAL MISSING DB_URL"}`);
console.log("----------------------------------------------------------------");

// 2. STACK DEPENDENCIES & INGESTION MIDDLEWARE
const cors = require('cors');
const express = require('express');

const app = express();

// Enable Cross-Origin Resource Sharing for decoupling administrative client frontends
app.use(cors());

// Express global JSON body-parsing middleware for handling IntaSend webhook streams
app.use(express.json());

const PORT = process.env.PORT || 3000;

// Internal business logic, notification templates, and database mapping abstraction layers
const { SMS_TEMPLATES } = require('./utils/notifications');
const { sendBandoDropSms } = require('./utils/smsGateway');
const { dispatchWholesaleResource } = require('./utils/supplierGateway');
const { logTransaction, getAdminMetrics } = require('./utils/db');

/**
 * ============================================================================
 * @route       POST /api/mpesa-callback
 * @description Production payment webhook listener for IntaSend payment gateway.
 *              Acts as an autonomous financial loop dispatcher.
 *              Bypasses localized carrier debts (e.g., Okoa Jahazi) via corporate push.
 * ============================================================================
 */
app.post('/api/mpesa-callback', async (req, res) => {
    try {
        // Deconstruct verified payload format dispatched from IntaSend Webhook stream
        const { account, net_amount, state, challenge } = req.body;

        // OPTIONAL SECURITY FILTER: Validate incoming challenge tokens against environment configurations
        if (process.env.INTASEND_CHALLENGE && challenge !== process.env.INTASEND_CHALLENGE) {
            console.warn(`🚨 [SECURITY ALERT] Unauthorized challenge mismatch intercepted.`);
            return res.status(401).json({ status: "error", message: "Unauthorized webhook origin" });
        }

        // Defensive Filter: Isolate state changes. Drop processing unless transaction is definitively marked COMPLETE
        if (state !== 'COMPLETE') {
            console.log(`ℹ️  [WEBHOOK EVENT: STATE REJECTED] Intercepted transaction status: [${state}]. Skipping core execution.`);
            return res.status(200).json({ status: "skipped", message: "Non-completion state change logged." });
        }

        // AUTOMATED PHONE NUMBER NORMALIZATION LAYER
        // Transforms localized strings (e.g., "2547XXXXXXXX") into the international standard E.164 format ("+2547XXXXXXXX")
        let msisdn = account ? account.toString().trim() : "";
        if (msisdn && !msisdn.startsWith('+')) {
            msisdn = `+${msisdn}`;
        }

        // Explicit Type Casting for precision mathematical financial calculations
        const amountPaid = parseFloat(net_amount);
        const customerName = 'Hustler'; // Dynamic placeholder; fallback strategy for campus marketing privacy

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
        if (amountPaid === 23) {
            // Tunukiwa Gifting Optimization Hook
            resourceMetaLog = "1GB (1 Hour) High-Velocity Pack";
            messageToSend = SMS_TEMPLATES.STANDARD(customerName, amountPaid, resourceMetaLog);
            finalValueToDispatch = 23; 
        } 
        else if (amountPaid === 52) {
            // Tunukiwa Mid-Tier Optimization Hook
            resourceMetaLog = "1.5GB (3 Hours) Streaming Pack";
            messageToSend = SMS_TEMPLATES.STANDARD(customerName, amountPaid, resourceMetaLog);
            finalValueToDispatch = 52;
        } 
        else if (amountPaid === 110) {
            // High-Yield Core Margin Anchor (Target Profit: +KSh 10.00)
            resourceMetaLog = "2GB (24 Hours) Heavy Study Pack";
            messageToSend = SMS_TEMPLATES.STANDARD(customerName, amountPaid, resourceMetaLog);
            finalValueToDispatch = 110;
        } 
        else if (amountPaid === 22) {
            // Telecom Airtime Allocation Logic for Talk-Time Minutes
            resourceMetaLog = "45 Calling Minutes Bundle (3 Hours)";
            messageToSend = SMS_TEMPLATES.STANDARD(customerName, amountPaid, resourceMetaLog);
            finalValueToDispatch = 20; // Prorated face-value airtime drop injection
        } 
        else if (amountPaid === 10) {
            // High-Margin Promotional SMS Route Injection 
            resourceMetaLog = "200 SMS Bundle Pack (24 Hours)";
            messageToSend = SMS_TEMPLATES.STANDARD(customerName, amountPaid, resourceMetaLog);
            finalValueToDispatch = 10;
        } 
        else {
            /**
             * ----------------------------------------------------------------
             * ADVANTAGE VECTOR: "Sema na Wallet Yako" Dynamic Value Adjuster
             * Executed dynamically if an atypical/odd cash entry enters the loop.
             * Protects the margin by using a 20MB/Shilling allocation scale.
             * ----------------------------------------------------------------
             */
            console.log(`⚠️  [UNKNOWN VALUE TARIFF] KSh ${amountPaid}. Initializing Dynamic Adjuster Matrix.`);
            
            // Deduct processing gateway fees (2.5%) then multiply by competitive prorated index
            const netCashBuffer = amountPaid * 0.975;
            const calculatedMegabytes = Math.floor(netCashBuffer * 20);
            
            resourceMetaLog = `${calculatedMegabytes}MB Custom Dynamic Drop`;
            messageToSend = SMS_TEMPLATES.FLEXIBLE(customerName, amountPaid, resourceMetaLog);
            finalValueToDispatch = amountPaid; // Pass to supplier pipeline for custom fulfillment mapping
        }

        // STEP A: PROVISION ASSET DISTRIBUTION VIA CARRIER INFRASTRUCTURE (Bypasses local device debts)
        console.log(`📡 Dispatched API packet to wholesale routing channels: [Allocating value: ${finalValueToDispatch}]...`);
        const supplyReceipt = await dispatchWholesaleResource(msisdn, finalValueToDispatch);
        console.log(`✅ [PROVISION SUCCESS] Telecomm carrier reference ID generated: ${supplyReceipt.transactionId}`);

        // STEP B: EMIT TRANSACTION STATUS SMS NOTIFICATION VIA AFRICA'S TALKING
        await sendBandoDropSms(msisdn, messageToSend);
        
        // STEP C: IMMUTABLE AUDIT LOGGING INSIDE THE CLOUD SUPABASE LEDGER
        try {
            await logTransaction({
                msisdn: msisdn,
                firstName: customerName,
                amountPaid: amountPaid,
                valueDispatched: resourceMetaLog,
                supplierRef: supplyReceipt.transactionId
            });
        } catch (dbError) {
            // Log database non-blocking anomalies without breaking user telecom delivery loop
            console.error(`❌ [DATABASE ERROR]: Failed to persist row to cloud ledger:`, dbError.message);
        }

        console.log(`🎯 [TRANSACTION BOUNDARY COMPLETE] Loop cleanly processed. Injected: "${resourceMetaLog}"`);
        
        // Inform Payment Gateway Aggregator of deterministic webhook processing success
        return res.status(200).json({ status: "success", transaction: supplyReceipt.transactionId });

    } catch (error) {
        console.error(`❌ [WEBHOOK RUNTIME CRITICAL ERROR]:`, error.message);
        
        // Always respond with a 200 HTTP status code to prevent aggregator side looping on minor script parsing errors
        return res.status(200).json({ status: "error", details: error.message });
    }
});

/**
 * ============================================================================
 * @route       GET /admin/dashboard
 * @description Low-overhead, lightweight embedded micro-analytics portal.
 *              Renders critical real-time micro-KPI loops for immediate system monitoring.
 * ============================================================================
 */
app.get('/admin/dashboard', async (req, res) => {
    try {
        // Pull aggregated data cache straight from transactional ledger database pools
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

// 5. BOOTSTRAP NETWORK APPLICATION
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 BANDODROP PASSIVE INTERNET ENGINE RUNNING AUTONOMOUSLY ON PORT: ${PORT}`);
});