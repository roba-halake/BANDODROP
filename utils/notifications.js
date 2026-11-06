/**
 * ============================================================================
 * @module       utils/notifications.js
 * @description  SMS Templates and Dynamic Airtime Value Calculators
 * ============================================================================
 */

require('dotenv').config();

const SMS_TEMPLATES = {
    STANDARD: (name, amount, resource) => 
        `BANDODROP: Habari ${name}, KSh ${amount} confirmed! Your account has been credited with ${resource} data. Keep dropping!`,
        
    FLEXIBLE: (name, amountPaid, calculatedValue) => 
        `BANDODROP: Habari ${name}, KSh ${amountPaid} received. Because this didn't match a standard package, we've dynamically credited your line with KSh ${calculatedValue} of resource value!`
};

/**
 * Calculates optimal value conversions for unmapped transaction inputs.
 * 
 * @param {number} amountPaid - Unprocessed numeric input from webhook/STK push
 * @returns {number} Optimal wholesale purchase capacity
 */
const calculateFlexibleAirtime = (amountPaid) => {
    const numericAmount = parseFloat(amountPaid);
    if (isNaN(numericAmount) || numericAmount <= 0) return 0;
    
    const safeMultiplier = 1.15; 
    return Math.floor(numericAmount * safeMultiplier);
};

module.exports = {
    SMS_TEMPLATES,
    calculateFlexibleAirtime
};