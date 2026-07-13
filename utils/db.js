const { createClient } = require('@supabase/supabase-js');

// Sanitize strings to instantly strip trailing spaces, newlines, or accidental literal quotes
const cleanEnvVar = (val) => {
    if (!val) return '';
    return val.toString().trim().replace(/^['"]|['"]$/g, '');
};

const supabaseUrl = cleanEnvVar(process.env.SUPABASE_URL);
const supabaseKey = cleanEnvVar(process.env.SUPABASE_KEY);

// 📡 DIAGNOSTIC TELEMETRY LAYER: Safely audit environment strings on startup
console.log("----------------------------------------------------------------");
console.log(`📡 [DB INITIALIZATION DEBUG]: Target URL: "${supabaseUrl}"`);
console.log(`📡 [DB INITIALIZATION DEBUG]: Key Signature Length: ${supabaseKey ? supabaseKey.length : 0} characters`);
console.log("----------------------------------------------------------------");

// Guard check to make sure the environment variables are actually leaking correctly into the runtime container
if (!supabaseUrl || !supabaseKey) {
    console.error("⚠️  [DATABASE SYSTEM WARNING]: SUPABASE_URL or SUPABASE_KEY environment parameters are undefined or empty!");
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function logTransaction({ msisdn, firstName, amountPaid, valueDispatched, supplierRef }) {
    try {
        const { data, error } = await supabase
            .from('transactions')
            .insert([
                { 
                    msisdn, 
                    first_name: firstName, 
                    amount_paid: amountPaid, 
                    value_dispatched: valueDispatched, 
                    supplier_ref: supplierRef 
                }
            ])
            .select();

        if (error) throw error;
        
        console.log(`💾 [DATABASE SYSTEM LOGGED]: Transaction row persisted securely. ID: ${data[0].id}`);
        return data;
    } catch (error) {
        console.error(`❌ [DATABASE ERROR]: Failed to persist row to cloud ledger:`, error.message);
    }
}

/**
 * Aggregates financial and distribution metrics from the ledger
 */
async function getAdminMetrics() {
    try {
        const { data, error } = await supabase
            .from('transactions')
            .select('amount_paid, value_dispatched')
            .order('created_at', { ascending: false });

        if (error) throw error;

        const totalTransactions = data.length;
        const totalRevenue = data.reduce((sum, row) => sum + row.amount_paid, 0);
        
        // Handle value_dispatched text strings vs integers cleanly during aggregation
        const totalDispatched = data.reduce((sum, row) => {
            const num = parseFloat(row.value_dispatched);
            return sum + (isNaN(num) ? 0 : num);
        }, 0);

        return {
            totalTransactions,
            totalRevenue,
            totalDispatched,
            recentCount: data.length
        };
    } catch (error) {
        console.error(`❌ [DATABASE ERROR]: Failed to aggregate data indices:`, error.message);
        return { totalTransactions: 0, totalRevenue: 0, totalDispatched: 0, recentCount: 0 };
    }
}

module.exports = { logTransaction, getAdminMetrics };