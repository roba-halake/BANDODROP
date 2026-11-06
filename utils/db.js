/**
 * ============================================================================
 * @module      utils/db.js
 * @description Supabase Cloud Ledger & Transaction Data Layer
 * ============================================================================
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const cleanEnvVar = (val) => {
    if (!val) return '';
    return val.toString().trim().replace(/^['"]|['"]$/g, '');
};

const supabaseUrl = cleanEnvVar(process.env.SUPABASE_URL);
const supabaseKey = cleanEnvVar(process.env.SUPABASE_KEY);

if (!supabaseUrl || !supabaseKey) {
    console.error("⚠️ [DATABASE WARNING]: SUPABASE_URL or SUPABASE_KEY environment parameters are undefined or empty!");
}

const supabase = createClient(supabaseUrl, supabaseKey);

/**
 * Checks if an M-PESA Transaction ID has already been processed (Idempotency Guard)
 */
async function isTransactionProcessed(mpesaCode) {
    if (!mpesaCode) return false;
    try {
        const { data } = await supabase
            .from('transactions')
            .select('id')
            .eq('supplier_ref', mpesaCode)
            .maybeSingle();
        return !!data;
    } catch (err) {
        return false;
    }
}

/**
 * Persists a completed transaction into the Supabase cloud ledger.
 */
async function logTransaction({ msisdn, firstName, amountPaid, valueDispatched, supplierRef }) {
    try {
        const parsedAmountPaid = parseFloat(amountPaid);
        const parsedValueDispatched = parseFloat(valueDispatched);

        const recordPayload = { 
            msisdn: msisdn ? String(msisdn).trim() : null, 
            first_name: firstName ? String(firstName).trim() : 'Campus Hustler', 
            amount_paid: isNaN(parsedAmountPaid) ? 0 : Math.round(parsedAmountPaid), 
            value_dispatched: isNaN(parsedValueDispatched) ? 0 : Math.round(parsedValueDispatched), 
            supplier_ref: supplierRef ? String(supplierRef).trim() : null 
        };

        const { data, error } = await supabase
            .from('transactions')
            .insert([recordPayload])
            .select();

        if (error) throw error;
        
        console.log(`💾 [DATABASE LOGGED]: Transaction persisted securely. ID: ${data[0]?.id}`);
        return data;
    } catch (error) {
        console.error(`❌ [DATABASE ERROR]: Failed to persist row to ledger:`, error.message);
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

module.exports = { logTransaction, isTransactionProcessed, getAdminMetrics };