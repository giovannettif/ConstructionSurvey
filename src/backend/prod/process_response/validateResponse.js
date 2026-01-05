// Validates response data
/*
Format Version 1:
{
    "timestamp": "2026-01-04T00:14:51.910Z",
    "answers": {
        "1": 5,
        "2": 4,
        "3": 2,
        "4": 3,
        "5": 2,
        "6": 2,
        "7": 3,
        "8": 3,
        "9": 4,
        "10": 5
    },
    "total": 33
},
*/
const LAUNCH_DATE = process.env.LAUNCH_DATE || '2026-01-01T00:00:00.000Z';

/**
 * Validates response data
 * @param {*} response - The response data to validate.
 * @returns {Object} The format version of the response.
 * @throws {Error} If the response is invalid.
 */
export const validateResponse = (response) => {
    // check response type
    if (typeof response !== 'object' || Array.isArray(response)) {
        throw Error('Invalid response: expected non-array object');
    }

    // check valid JSON
    try {
        JSON.parse(JSON.stringify(response));
    } catch (e) {
        throw Error('Invalid JSON: expected valid JSON object');
    }

    // basic type-checking of first-order fields
    const { timestamp, answers, total } = response;

    if (typeof timestamp !== 'string' || typeof answers !== 'object' || typeof total !== 'number') {
        throw Error('Invalid types: expected { timestamp: string, answers: object, total: number }');
    }

    // more advanced type-checking of first-order fields
    if (isNaN(new Date(timestamp).getTime()) || Array.isArray(answers) || total % 1 !== 0) {
        throw Error('Invalid values: expected { timestamp: valid date string, answers: non-arrayobject, total: integer }');
    }

    // check if timestamp is after launch date
    if (new Date(timestamp).getTime() < new Date(LAUNCH_DATE).getTime()) {
        throw Error('Invalid timestamp: expected timestamp to be after launch date');
    }

    // check if there are extra first-order fields
    if (Object.keys(response).length !== 3) {
        throw Error('Extra first-order fields found: expected only { timestamp, answers, total }');
    }

    // check if all keys of answers are integer strings
    let int;
    for (const key of Object.keys(answers)) {
        int = parseInt(key);
        if (isNaN(int) || int < 1) {
            throw Error('Invalid values: expected answer keys to be positive integer strings');
        }
    }

    let sum = 0;

    for (const ans of Object.values(answers)) {
        // check if all values of answers are integers
        if (ans % 1 !== 0) {
            throw Error('Invalid values: expected answer values to be integers');
        }

        // check if all answers are between 1 and 5
        if (ans < 1 || ans > 5) {
            throw Error('Invalid values: expected answer points to be between 1 and 5, inclusive');
        }

        sum += ans;
    }

    // check if all answers add up to total
    if (sum !== total) {
        throw Error('Invalid values: expected answer points to add up to total');
    }

    // send back format version
    return { version: 1 };
};
