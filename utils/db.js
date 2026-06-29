const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

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
        // Fetch all transactions to calculate metrics locally (safe for sandbox scale)
        const { data, error } = await supabase
            .from('transactions')
            .select('amount_paid, value_dispatched')
            .order('created_at', { ascending: false });

        if (error) throw error;

        const totalTransactions = data.length;
        const totalRevenue = data.reduce((sum, row) => sum + row.amount_paid, 0);
        const totalDispatched = data.reduce((sum, row) => sum + row.value_dispatched, 0);

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