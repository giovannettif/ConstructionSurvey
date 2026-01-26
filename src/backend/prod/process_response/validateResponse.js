// Validates response data
/*
Format Version 1:
{
    "id": 1769174974001,
    "s3_timestamp": "2026-01-23T13:29:34.001Z",
    "uploaded_to_drive": false,
    "valid": false,
    "data": [
      {
        "timestamp": "2026-01-23T13:29:35.592Z",
        "surveyTitle": "Protecting Under the Hard Hat Survey",
        "surveyVersion": "3.0.0",
        "answers": {
          "k10_1": "1",
          "k10_2": "4",
          "k10_3": "5",
          "k10_4": "4",
          "k10_5": "2",
          "k10_6": "1",
          "k10_7": "4",
          "k10_8": "2",
          "k10_9": "4",
          "k10_10": "2",
          "t1": "su_recovery",
          "t2": [
            "none"
          ],
          "t3": [
            "trouble_concentrating",
            "irritability"
          ],
          "t4": [
            "let_it_pass"
          ],
          "t5": [
            "rapid_breathing",
            "muscle_tension"
          ],
          "t6": [
            "let_it_pass"
          ],
          "t7": "no",
          "t8": "monthly",
          "t9": "no",
          "t10": "both",
          "t11": "daily",
          "jama1": "0",
          "notes1": [
            "meditate"
          ],
          "notes2": "6-9",
          "notes_q4": "prescribed",
          "notes_q4_followup": [
            "sleep"
          ]
        }
      }
    ]
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
  if (!Array.isArray(response) || response.length === 0 || typeof response[0] !== 'object') {
    throw Error('Invalid response: an array of objects expected');
  }

  // check valid JSON
  try {
    JSON.parse(JSON.stringify(response));
  } catch (e) {
    throw Error('Invalid JSON: expected valid JSON object');
  }

  // basic type-checking of first-order fields
  const { timestamp, answers, surveyTitle, surveyVersion } = response[0];

  if (typeof timestamp !== 'string' || typeof answers !== 'object' || typeof surveyTitle !== 'string' || typeof surveyVersion !== 'string') {
    throw Error('Invalid types: expected { timestamp: string, answers: object, surveyTitle: string, surveyVersion: string }');
  }

  // more advanced type-checking of first-order fields
  if (isNaN(new Date(timestamp).getTime()) || Array.isArray(answers) || !surveyVersion.match(/[0-9]+\.[0-9]+\.[0-9]+/)) {
    throw Error('Invalid values: expected { timestamp: valid date string, answers: non-array object, surveyVersion: semantic version string }');
  }

  // check all parts of version to check that they are nonnegative integers
  const versionParts = surveyVersion.split('.');
  if (versionParts.length !== 3 || versionParts.some((part) => isNaN(parseInt(part)) || parseInt(part) < 0)) {
    throw Error('Invalid values: expected { surveyVersion: semantic version string }');
  }

  // check if timestamp is after launch date
  if (new Date(timestamp).getTime() < new Date(LAUNCH_DATE).getTime()) {
    throw Error('Invalid timestamp: expected timestamp to be after launch date');
  }

  if (Object.keys(response[0]).length !== 4) {
    throw Error('Invalid response: expected { timestamp: string, answers: object, surveyTitle: string, surveyVersion: string }');
  }

  // send back survey version
  return surveyVersion;
};
