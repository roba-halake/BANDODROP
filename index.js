const express = require('express');
const axios = require('axios'); // Importing our outgoing dialer tool
const app = express();

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
        
        const amountPaid = mpesaNotification.TransAmount;
        const customerPhone = mpesaNotification.MSISDN;
        const customerName = mpesaNotification.FirstName;

        console.log(`\n🔔 [NEW PAYMENT] KSh ${amountPaid} from ${customerName} (${customerPhone})`);

        // Match the incoming payment against our catalog rules
        const matchedPackage = packageCatalog[amountPaid];

        if (matchedPackage) {
            console.log(`🚀 [DISPATCH INITIATED] Processing: "${matchedPackage.description}"`);

            // --- OUTGOING API CALL TO THE WHOLESALER ---
            // We use 'await' because sending an internet request takes a few milliseconds,
            // and we want our code to wait for the supplier's answer before proceeding.
            const supplierUrl = 'https://api.mock-wholesaler.com/v1/dispatch';
            
            const payload = {
                apiKey: "MOCK_SECRET_PARTNER_KEY_10293", // Identifies our account
                recipient: customerPhone,                // Who gets the resource
                amount: matchedPackage.wholesaleAirtime   // Value of resource to send
            };

            console.log(`📡 Sending request to supplier API for KSh ${matchedPackage.wholesaleAirtime}...`);
            
            /* // NOTE: This is where the real connection happens. We comment it out for now
            // so your local test doesn't crash trying to connect to a fake web URL.
            
            const response = await axios.post(supplierUrl, payload);
            console.log(`📡 Supplier Response Status: ${response.status}`);
            */

            console.log(`🎯 [SUCCESS] KSh ${matchedPackage.wholesaleAirtime} successfully deducted from float and sent to ${customerPhone}!`);

        } else {
            console.log(`⚠️ [UNKNOWN AMOUNT] Paid KSh ${amountPaid}. No matching data tier found.`);
        }

        // Instantly acknowledge Safaricom's handshake
        res.status(200).json({ status: "Success", message: "Processed" });

    } catch (error) {
        console.error("❌ [ERROR PROCESSING CALLBACK]:", error.message);
        // Even if our code fails inside, we return a 200 to Safaricom so they stop spamming us
        res.status(200).json({ status: "Error", message: "Internal handling issue" });
    }
});

// Server Initialization (Production Ready)
// Process.env.PORT allows the cloud provider to dynamically inject their own port.
// If it's not found (like when running on your laptop), it defaults to 3000.
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log(`🚀 BANDODROP BACKEND IS LIVE ON PORT ${PORT}`);

});