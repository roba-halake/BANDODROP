const express = require('express');
const axios = require('axios'); 
const app = express();

// IMPORT THE STRATEGY UTILITIES HERE
const { SMS_TEMPLATES, calculateFlexibleAirtime } = require('./utils/notifications');
const { sendBandoDropSms } = require('./utils/smsGateway');

app.use(express.json());

// Pricing Configuration Dictionary
const packageCatalog = {
    "19": { wholesaleAirtime: 22, description: "1GB - 1 Hour" },
    "20": { wholesaleAirtime: 25, description: "250MB - 24 Hours" },
    "47": { wholesaleAirtime: 55, description: "350MB - 7 Days" },
    "49": { wholesaleAirtime: 60, description: "1.5GB - 3 Hours" },
    "55": { wholesaleAirtime: 65, description: "1.25GB - Till Midnight" },
    "99": { wholesaleAirtime: 115, description: "1GB - 24 Hours" }
};

// Root Endpoint
app.get('/', (req, res) => {
    res.send("<h1>🟢 BANDODROP Vending Engine: Active & Listening 24/7</h1>");
});

// M-PESA Till Webhook Entrypoint
app.post('/api/mpesa-callback', async (req, res) => {
    try {
        const mpesaNotification = req.body; 
        
        // Safaricom Casing Safeguards (handling potential variations)
        const amountPaid = parseInt(mpesaNotification.TransAmount || mpesaNotification.amount);
        const customerPhone = mpesaNotification.MSISDN || mpesaNotification.phoneNumber;
        const customerName = mpesaNotification.FirstName || "Valued Customer";

        console.log(`\n🔔 [NEW PAYMENT] KSh ${amountPaid} from ${customerName} (${customerPhone})`);

        // Match the incoming payment against our catalog rules
        const matchedPackage = packageCatalog[amountPaid.toString()];

        let finalSmsMessage = "";
        let wholesaleValueToDispatch = 0;

        if (matchedPackage) {
            console.log(`🚀 [DISPATCH INITIATED] Processing standard tier: "${matchedPackage.description}"`);
            wholesaleValueToDispatch = matchedPackage.wholesaleAirtime;
            
            // Build the standard success text
            finalSmsMessage = SMS_TEMPLATES.SUCCESS(customerName, amountPaid, matchedPackage.description);

        } else {
            // THE ADAPTIVE STRATEGY TRIGGER: User paid an odd amount
            wholesaleValueToDispatch = calculateFlexibleAirtime(amountPaid);
            
            console.log(`⚠️ [UNKNOWN AMOUNT] Paid KSh ${amountPaid}. Triggering Dynamic Value Adjuster.`);
            console.log(`🎯 [FLEX DISPATCH] Allocated wholesale resource value: KSh ${wholesaleValueToDispatch}`);

            // Build the flexible fallback text
            finalSmsMessage = SMS_TEMPLATES.PRICE_MISMATCH(customerName, amountPaid, wholesaleValueToDispatch);
        }

        // --- OUTGOING API DISPATCH ENGINE ---
        const supplierUrl = 'https://api.mock-wholesaler.com/v1/dispatch';
        const payload = {
            apiKey: "MOCK_SECRET_PARTNER_KEY_10293",
            recipient: customerPhone,
            amount: wholesaleValueToDispatch
        };

        console.log(`📡 Sending dispatch request to supplier for KSh ${wholesaleValueToDispatch}...`);
        
        /* // NOTE: Un-comment this specific block once your live wholesale API endpoint is ready!
        // It will automatically process supplier delivery and fire the real-time notification text.
        
        try {
            await axios.post(supplierUrl, payload);
            console.log(`📡 Supplier response cleared successfully.`);
        } catch (supplierErr) {
            console.error(`❌ Wholesale Supplier API call failed:`, supplierErr.message);
        }
        */

        // 2. Fire the real text instantly to their device screen!
        // This functions perfectly in both Sandbox mode or Live mode depending on your credentials.
        await sendBandoDropSms(customerPhone, finalSmsMessage);

        console.log(`🎯 [SUCCESS SYSTEM LOOP COMPLETE] Logged SMS: "${finalSmsMessage}"`);

        // Instantly acknowledge Safaricom's handshake
        res.status(200).json({ status: "Success", message: "Processed" });

    } catch (error) {
        console.error("❌ [ERROR PROCESSING CALLBACK]:", error.message);
        res.status(200).json({ status: "Error", message: "Internal handling issue" });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 BANDODROP BACKEND IS LIVE ON PORT ${PORT}`);
});