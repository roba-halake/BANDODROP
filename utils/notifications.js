// utils/notifications.js

const SMS_TEMPLATES = {
    SUCCESS: (name, amountPaid, description) => 
        `BANDODROP: Habari ${name}, KSh ${amountPaid} received! Your pack "${description}" has been credited successfully. Thank you for choosing the Drop! 🚀`,
    
    PRICE_MISMATCH: (name, amountPaid, calculatedAirtime) => 
        `BANDODROP: Habari ${name}, KSh ${amountPaid} received. Because this didn't match a standard package, we've dynamically credited your line with KSh ${calculatedAirtime} of resource value!`,
    
    SYSTEM_DELAY: (name) => 
        `BANDODROP: Habari ${name}, payment verified! We are experiencing a temporary carrier delay. Our system is auto-retrying. Your data value is fully secure.`
};

/**
 * Dynamic Value Adjuster Math
 * If a user sends a weird amount, we maintain our safe wholesale conversion ratio.
 * Average retail-to-wholesale conversion across your catalog is ~1.15x.
 */
const calculateFlexibleAirtime = (amountPaid) => {
    const safeMultiplier = 1.15; 
    const assignedWholesaleValue = Math.floor(amountPaid * safeMultiplier);
    return assignedWholesaleValue;
};

module.exports = {
    SMS_TEMPLATES,
    calculateFlexibleAirtime
};