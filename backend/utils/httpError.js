/**
 * An Error carrying the HTTP status the central errorHandler responds with (and any extra fields, e.g. a Plaid
 * error code for the client). Throw it from services for expected failures: bad input (400), not found (404),
 * conflicts (409).
 * @param {string} message
 * @param {number} statusCode
 * @param {object} [extra]
 * @returns {Error}
 */
const fail = (message, statusCode, extra = {}) => Object.assign(new Error(message), { statusCode, ...extra });

module.exports = { fail };
