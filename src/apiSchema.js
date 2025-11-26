/** @format */

/**
 * API Schema Configuration
 *
 * This file centralizes all Claude.ai API field mappings in one place.
 * When Claude changes their API structure, update THIS FILE ONLY.
 *
 * Last updated: November 2025
 * API version: Nov 2025 subscription changes
 */

/**
 * Usage API field mappings
 * Maps our internal field names to the API response paths
 *
 * Format: { internalName: { path: 'api.path', type: 'percent|time|raw', default: value } }
 */
const USAGE_API_SCHEMA = {
    // 5-hour session limit (rolling)
    fiveHour: {
        utilization: { path: 'five_hour.utilization', type: 'percent', default: 0 },
        resetsAt: { path: 'five_hour.resets_at', type: 'time', default: null },
    },

    // 7-day overall limit (all models combined)
    sevenDay: {
        utilization: { path: 'seven_day.utilization', type: 'percent', default: 0 },
        resetsAt: { path: 'seven_day.resets_at', type: 'time', default: null },
    },

    // 7-day Sonnet-only limit (added Nov 2025)
    sevenDaySonnet: {
        utilization: { path: 'seven_day_sonnet.utilization', type: 'percent', default: null },
        resetsAt: { path: 'seven_day_sonnet.resets_at', type: 'time', default: null },
    },

    // 7-day Opus limit (Max plans only)
    sevenDayOpus: {
        utilization: { path: 'seven_day_opus.utilization', type: 'percent', default: null },
        resetsAt: { path: 'seven_day_opus.resets_at', type: 'time', default: null },
    },

    // Extra usage field from main API
    extraUsage: {
        value: { path: 'extra_usage', type: 'raw', default: null },
    },
};

/**
 * Overage/Spend Limit API field mappings
 * For the /overage_spend_limit endpoint
 */
const OVERAGE_API_SCHEMA = {
    isEnabled: { path: 'is_enabled', type: 'boolean', default: false },
    monthlyLimit: { path: 'monthly_credit_limit', type: 'cents', default: 0 },  // In cents
    usedCredits: { path: 'used_credits', type: 'cents', default: 0 },           // In cents
    currency: { path: 'currency', type: 'string', default: 'USD' },
    outOfCredits: { path: 'out_of_credits', type: 'boolean', default: false },
};

/**
 * API Endpoints to capture (relative patterns)
 * Add new endpoints here when Claude adds new API routes
 */
const API_ENDPOINTS = {
    usage: {
        pattern: '/api/organizations/',
        contains: '/usage',
        description: 'Main usage metrics endpoint',
    },
    prepaidCredits: {
        pattern: '/api/organizations/',
        contains: '/prepaid/credits',
        description: 'Prepaid credits balance',
    },
    overageSpendLimit: {
        pattern: '/api/organizations/',
        contains: '/overage_spend_limit',
        description: 'Monthly spend limit / extra usage',
    },
};

/**
 * Get a nested value from an object using dot notation path
 * @param {object} obj - The object to query
 * @param {string} path - Dot notation path (e.g., 'five_hour.utilization')
 * @param {*} defaultValue - Default value if path not found
 * @returns {*} The value at path or default
 */
function getNestedValue(obj, path, defaultValue = null) {
    if (!obj || !path) return defaultValue;

    const parts = path.split('.');
    let current = obj;

    for (const part of parts) {
        if (current === null || current === undefined) {
            return defaultValue;
        }
        current = current[part];
    }

    // Use nullish coalescing to preserve 0 and false values
    return current ?? defaultValue;
}

/**
 * Extract all fields from API response using schema
 * @param {object} response - Raw API response
 * @param {object} schema - Schema definition
 * @returns {object} Extracted fields
 */
function extractFromSchema(response, schema) {
    const result = {};

    for (const [groupName, fields] of Object.entries(schema)) {
        if (typeof fields === 'object' && fields.path) {
            // Single field
            result[groupName] = getNestedValue(response, fields.path, fields.default);
        } else {
            // Nested group
            result[groupName] = {};
            for (const [fieldName, config] of Object.entries(fields)) {
                result[groupName][fieldName] = getNestedValue(response, config.path, config.default);
            }
        }
    }

    return result;
}

/**
 * Check if a URL matches an endpoint pattern
 * @param {string} url - URL to check
 * @param {object} endpointConfig - Endpoint configuration
 * @returns {boolean} True if URL matches
 */
function matchesEndpoint(url, endpointConfig) {
    return url.includes(endpointConfig.pattern) && url.includes(endpointConfig.contains);
}

/**
 * Process overage data from API (handles cents to dollars conversion)
 * @param {object} overageData - Raw overage API response
 * @returns {object|null} Processed monthly credits or null
 */
function processOverageData(overageData) {
    if (!overageData) return null;

    const extracted = extractFromSchema(overageData, OVERAGE_API_SCHEMA);

    if (!extracted.isEnabled) return null;

    const usedDollars = extracted.usedCredits / 100;
    const limitDollars = extracted.monthlyLimit / 100;

    return {
        limit: limitDollars,
        used: usedDollars,
        currency: extracted.currency,
        percent: limitDollars > 0 ? Math.round((usedDollars / limitDollars) * 100) : 0,
        outOfCredits: extracted.outOfCredits,
    };
}

/**
 * Get current schema version info for debugging
 * @returns {object} Schema version info
 */
function getSchemaInfo() {
    return {
        version: 'Nov 2025',
        usageFields: Object.keys(USAGE_API_SCHEMA),
        overageFields: Object.keys(OVERAGE_API_SCHEMA),
        endpoints: Object.keys(API_ENDPOINTS),
    };
}

module.exports = {
    USAGE_API_SCHEMA,
    OVERAGE_API_SCHEMA,
    API_ENDPOINTS,
    getNestedValue,
    extractFromSchema,
    matchesEndpoint,
    processOverageData,
    getSchemaInfo,
};
