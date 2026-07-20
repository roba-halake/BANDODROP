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

/**
 * Persists a completed transaction into the Supabase cloud ledger.
 * Features strict defensive parsing to prevent PostgreSQL type mismatch rejections.
 */
async function logTransaction({ msisdn, firstName, amountPaid, valueDispatched, supplierRef }) {
    try {
        // Defensive Type Sanitization: Prevent Postgres type syntax rejections
        const parsedAmountPaid = parseFloat(amountPaid);
        const parsedValueDispatched = parseFloat(valueDispatched);

        const recordPayload = { 
            msisdn: msisdn ? String(msisdn).trim() : null, 
            first_name: firstName ? String(firstName).trim() : 'Hustler', 
            // Fallback to rounded integer if parseFloat returns NaN, ensuring compatibility
            amount_paid: isNaN(parsedAmountPaid) ? 0 : Math.round(parsedAmountPaid), 
            value_dispatched: isNaN(parsedValueDispatched) ? 0 : Math.round(parsedValueDispatched), 
            supplier_ref: supplierRef ? String(supplierRef).trim() : null 
        };

        const { data, error } = await supabase
            .from('transactions')
            .insert([recordPayload])
            .select();

        if (error) throw error;
        
        console.log(`💾 [DATABASE SYSTEM LOGGED]: Transaction row persisted securely. ID: ${data[0]?.id}`);
        return data;
    } catch (error) {
        console.error(`❌ [DATABASE ERROR]: Failed to persist row to cloud ledger:`, error.message);
        // Non-blocking return allows customer delivery loop to complete cleanly even if DB fails
        return null;
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

        // Defensive sum aggregations handling strings, decimals, and nulls
        const totalRevenue = data.reduce((sum, row) => {
            const val = parseFloat(row.amount_paid);
            return sum + (isNaN(val) ? 0 : val);
        }, 0);
        
        const totalDispatched = data.reduce((sum, row) => {
            const val = parseFloat(row.value_dispatched);
            return sum + (isNaN(val) ? 0 : val);
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