# `get_local_resources` Spec

- AWS Lambda function.
- Written in JavaScript.
- Given a user ZIP code and maximum radius from the frontend, returns a list of resources located within the maximum radius.

## Overview

- All distances are in meters.
- Use `papaparse` to parse the CSV datasets.
- Use `express` for request/response handling.
- Use camel_case for all request/response fields.
- Normalize ZIP codes to left-0-padded 5-digit strings, e.g. "680" or 680 (number) -> "00680".

## Endpoint

`GET /local-resources`

## Request Schema

```json
{
  "zip_code": "string - Required if max_radius != -1. User ZIP code around which to retrieve local resources.",
  "max_radius": "number - Required. In meters. Only retrieve resources at ZIP codes within a certain radius of given ZIP code. Use -1 to get all resources."
}
```

## Response Schema

Only on success and when `"zip_code"` is provided in the request:

```json
{
  "success": true,
  "type": "One of local_resources (max_radius >= 0) or all_resources (max_radius == -1).",
  "message": "string - User-facing message depending on type.",
  "zip_code_info": {
    "zip_code": "string - ZIP code from request.",
    "city": "string - Name of city at ZIP code.",
    "state": "string - Two-letter abbreviation of state of ZIP code."
  },
  "resources": [
    {
      "distance": "number - Distance to this resource's ZIP code from user ZIP code.",
      "other columns": "from resources dataset..."
    },
    {
      "more": "resources..."
    }
  ]
}
```

- If `max_radius == -1`:
  - No `"zip_code_info"` field.
  - No `"distance"` field per resource.
  - No sorting resources.
- If no resources are found, still a success. Simply return an empty array for the `"resources"` field along with the other fields in the schema.

## ZIP Codes Dataset

- A static CSV dataset of ZIP codes, latitudes, longitudes, city, and state. Each row has a unique ZIP code.
- Stored in the Lambda function directory as `zip-code-data.csv`.

Schema:

| Column      | Type   | Example   | Notes                    |
| ----------- | ------ | --------- | ------------------------ |
| `Zip`       | number | 680       | Not zero-padded.         |
| `Latitude`  | number | 18.205232 |                          |
| `Longitude` | number | -67.12655 |                          |
| `State`     | string | PR        | Two-letter abbreviation. |
| `City`      | string | Mayaguez  |                          |

## Resources Dataset

- A manually-maintained CSV dataset of resources with address, ZIP code, phone number, etc.
- Stored in S3 bucket (`S3_BUCKET_NAME` env var) under name `resources.csv` at root.
- Flexible schema since it can be updated frequently.
- 1st row is always the CSV header.
- Each row afterward is a resource.

## Functionality

### Module Scope

1. Load the ZIP codes dataset as an object of the form:

```js
{
  [zip]: {
    lat: 0.000,
    long: 0.000,
    city: "Placeholder"
    state: "XX",
  }
}
```

2. Load the resources dataset as an object of the form:

```js
[
    {/* resource 1 */},
     /*     ...    */ 
    {/* resource n */},
]
```

- Cache the S3 read promise for efficient reuse on warm invocations.
- Delete the cache if the promise fails.
- To avoid stale resources when the function stays warm for a long time, use a TTL of 4 hours.

### Function Scope

Constants:
- `MARGIN=5000` - In meters. Add to `max_radius` to give some leeway against floating point precision errors. 

1. Validate input/request.
2. If `max_radius != 1` (ZIP code given, get local resources):
   2.1. Find the user ZIP code's `lat` and `long` using the ZIP code dataset.
   2.2. Collect all the resources.
   2.3. Create an `nx2` array `resourceDistances` (where `n` is the number of resources). The 2nd element in each pair is a resource object, and the 1st element is the distance to the resource ZIP code from the user ZIP code. Use the Haversine formula to calculate the distance between a pair of `lat` and `long`.
   2.4. Filter out pairs where the distance exceeds `max_radius + MARGIN`.
   2.5. Sort `resourceDistances` by the 1st element (distance) in ascending order. Closest resource should be at the top. No need to handle ties - the original resource dataset order should prevail.
   2.6. Transform the `nx2` `resourceDistances` array into an `nx1` `localResources` array, where each element is a resource object with a `distance` field added.
   2.7. Add other necessary fields as per the response schema, and return the JSON response.
3. If `max_radius == -1` (ZIP code not given, get all resources), return a JSON response with all the resources as they are, adding other necessary fields as per the response schema.

## Status Codes

### `200`

Return a response of the schema above.

### `400`

Conditions:

- Field requirement deviation:
  - `zip_code` not given when `max_radius != -1`
  - `zip_code` given when `max_radius == -1`
  - `max_radius` not given
- Type checking:
  - `zip_code` not a string
  - `max_radius` not a non-negative number or not -1
- Advanced:
  - `zip_code` not of length 5

Response schema:

```json
{
  "success": false,
  "error": "string - Descriptive error message."
}
```

### `404`

Conditions:

- ZIP code not found in dataset

Response schema:

```json
{
  "success": false,
  "error": "string - Descriptive error message."
}
```

### `500`

Conditions:

- Any unhandled error

Response schema:

```json
{
  "success": false,
  "error": "Internal server error."
}
```

## Logging

Log:

- Request info: user ZIP and maximum radius.
- Success response info: type and resource count.
- Any errors caught via try-catch.
- Any non-`200` status code and the descriptive error message.

- Use a simple string message format.
- Log entries should be concise but also readable.

## Coding Conventions

- Code style (in order of most to least preferred):
  - Readable
  - Efficient
  - Compact
- Add docstrings for all key functions, including description, request format, status codes, response format, etc.
- Use comments generously, but each should be concise.
- Use Prettier for formatting.
- Always use camelCase for variable and function names. Convert object keys into camelCase when reading them (e.g. `{ max_radius: maxRadius }`).
- Use `variable == null` or `variable != null` if `variable` can plausibly be either `null` or `undefined`. Do NOT use `variable === null || variable === undefined` (and similarly for the `!==` conditions).