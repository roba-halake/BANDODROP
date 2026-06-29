// 1. LOAD ENVIRONMENT VARIABLES FIRST
require('dotenv').config();

console.log("-----------------------------------------");
console.log("⚙️  DIAGNOSTICS: Loaded Key:", process.env.AT_API_KEY ? "FOUND (Starts with " + process.env.AT_API_KEY.substring(0, 8) + ")" : "NOT FOUND");
console.log("⚙️  DIAGNOSTICS: Username:", process.env.AT_USERNAME);
console.log("⚙️  DIAGNOSTICS: Supabase URL:", process.env.SUPABASE_URL ? "FOUND" : "NOT FOUND"); // Added DB sanity check
console.log("-----------------------------------------");

// 2. NOW IMPORT DEPENDENCIES
const cors = require('cors');
const express = require('express');
const app = express();
app.use(cors()); // This tells Express to accept requests from your Flutter web app
const PORT = process.env.PORT || 3000;

// Import local logic modules
const { SMS_TEMPLATES, calculateFlexibleAirtime } = require('./utils/notifications');
const { sendBandoDropSms } = require('./utils/smsGateway');
const { dispatchWholesaleResource } = require('./utils/supplierGateway');
const { logTransaction, getAdminMetrics } = require('./utils/db');

app.use(express.json());

// 3. MPESA CALLBACK WEBHOOK ENDPOINT
app.post('/api/mpesa-callback', async (req, res) => {
    try {
        const { TransAmount, MSISDN, FirstName } = req.body;
        const amount = parseInt(TransAmount);
        const customerName = FirstName || 'Hustler';

        console.log(`\n🔔 [NEW PAYMENT] KSh ${amount} from ${customerName} (${MSISDN})`);

        let messageToSend = "";
        let finalValueToDispatch = amount; // Default to face value for standard options

        // Standard Packages Map vs Flexible Adjuster
        if (amount === 20) {
            messageToSend = SMS_TEMPLATES.STANDARD(customerName, amount, "500MB");
            finalValueToDispatch = 20;
        } else if (amount === 50) {
            messageToSend = SMS_TEMPLATES.STANDARD(customerName, amount, "1.5GB");
            finalValueToDispatch = 50;
        } else {
            // "Sema na Wallet Yako" dynamic route activation
            console.log(`⚠️ [UNKNOWN AMOUNT] Paid KSh ${amount}. Triggering Dynamic Value Adjuster.`);
            finalValueToDispatch = calculateFlexibleAirtime(amount);
            messageToSend = SMS_TEMPLATES.FLEXIBLE(customerName, amount, finalValueToDispatch);
        }

        // STEP A: PROVISION THE ACTUAL WHOLESALE RESOURCE IN REAL-TIME
        console.log(`📡 Sending dispatch request to supplier for KSh ${finalValueToDispatch}...`);
        const supplyReceipt = await dispatchWholesaleResource(MSISDN, finalValueToDispatch);
        console.log(`✅ [SUPPLIER PROVISION SUCCESS]: Order routed successfully. Reference: ${supplyReceipt.transactionId}`);

        // STEP B: TRIGGER SMS DELIVERY VIA AFRICA'S TALKING
        await sendBandoDropSms(MSISDN, messageToSend);
        
        // STEP C: PERSIST TRANSACTION TO THE CLOUD LEDGER
        await logTransaction({
            msisdn: MSISDN,
            firstName: customerName,
            amountPaid: amount,
            valueDispatched: finalValueToDispatch,
            supplierRef: supplyReceipt.transactionId
        });

        console.log(`🎯 [SUCCESS SYSTEM LOOP COMPLETE] Logged SMS: "${messageToSend}"`);
        res.status(200).json({ status: "success", message: "Transaction processed successfully" });

    } catch (error) {
        console.error(`❌ [ERROR PROCESSING CALLBACK]:`, error.message);
        res.status(200).json({ status: "error", message: error.message });
    }
});
// 4. ADMINISTRATIVE PERFORMANCE METRICS DASHBOARD
app.get('/admin/dashboard', async (req, res) => {
    const metrics = await getAdminMetrics();
    
    // Inline rendering a clean dashboard view directly
    const htmlResponse = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>BandoDrop HQ // Analytics</title>
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
            <h1>BandoDrop Metrics Engine</h1>
            <p class="subtitle">Real-time financial status & loop analytics</p>
            
            <div class="grid">
                <div class="card">
                    <div class="card-title">Total Revenue Captured</div>
                    <div class="card-value">KSh ${metrics.totalRevenue}</div>
                    <span class="badge">M-Pesa Webhooks Active</span>
                </div>
                <div class="card">
                    <div class="card-title">Wholesale Assets Dispatched</div>
                    <div class="card-value">KSh ${metrics.totalDispatched}</div>
                    <span class="badge">Value Delivery Stabilized</span>
                </div>
                <div class="card">
                    <div class="card-title">Total Processed Drops</div>
                    <div class="card-value">${metrics.totalTransactions} <span>Transactions</span></div>
                    <span class="badge">100% Core Integrity</span>
                </div>
            </div>
        </div>
    </body>
    </html>
    `;
    
    res.send(htmlResponse);
});
const PORT = process.env.PORT || 3000;
app.listen(PORT,'0.0.0.0',() => {
    console.log("🚀 BANDODROP BACKEND IS LIVE ON PORT " + PORT);
});