const SMS_TEMPLATES = {
    STANDARD: (name, amount, resource) => `BANDODROP: Habari ${name}, KSh ${amount} confirmed! Your account has been credited with ${resource} data. Keep dropping!`,
    FLEXIBLE: (name, amountPaid, calculatedValue) => `BANDODROP: Habari ${name}, KSh ${amountPaid} received. Because this didn't match a standard package, we've dynamically credited your line with KSh ${calculatedValue} of resource value!`
};

/**
 * Calculates optimal value conversions for unmapped transaction inputs
 * @param {number} amountPaid - Unprocessed numeric input from webhook
 * @returns {number} Optimal wholesale purchase capacity
 */
const calculateFlexibleAirtime = (amountPaid) => {
    const safeMultiplier = 1.15; 
    return Math.floor(amountPaid * safeMultiplier);
};

module.exports = {
    SMS_TEMPLATES,
    calculateFlexibleAirtime
};