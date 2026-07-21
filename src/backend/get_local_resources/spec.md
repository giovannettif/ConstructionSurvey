# `get_local_resources` Spec

## Request Schema

```json
{
  "zip_code": "string - Required if max_radius != -1. User ZIP code around which to retrieve local resources.",
  "max_radius": "number - Required. In miles. Only retrieve resources at ZIP codes within a certain radius of given ZIP code. Use -1 to get all resources."
}
```

## Response Schema

Only on success:

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

## ZIP Codes Dataset

- A static CSV dataset of ZIP codes, latitudes, longitudes, city, and state. Each row has a unique ZIP code.
- Stored in the Lambda function directory as `zip-code-data.csv`.

Schema:

| Column      | Type   | Example   | Notes                    |
| ----------- | ------ | --------- | ------------------------ |
| `Zip`       | number | 680       | Not zero-padded.         |
| `Longitude` | number | -67.12655 |                          |
| `Latitude`  | number | 18.205232 |                          |
| `State`     | string | PR        | Two-letter abbreviation. |
| `City`      | string | Mayaguez  |                          |

## Resources Dataset

- A manually-maintained CSV dataset of resources with address, ZIP code, phone number, etc.
- Stored in S3 bucket (`S3_BUCKET_NAME` env var) under name `resources.csv` at root.
- Flexible schema since it can be updated frequently.
- 1st row is always the CSV header.
- Each row afterward is a resource.

## Functionality

### Module

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
{
  [zip]: [
    {
      // resource 1 info (including ZIP code) at this ZIP code
    },
    // ...
    {
      // resource n info (including ZIP code) at this ZIP code
    }
  ]
}
```

### Function

1. Validate input/request.
2. Find the user ZIP code's `lat` and `long` using the loaded dataset.
3. Create an array `distances` of 2-element arrays: 1st element being ZIP code, 2nd element being distance to the ZIP code from the user ZIP code.

- Use the Haversine formula to calculate the distance between a pair of `lat` and `long`.

4. Sort `distances` by the 2nd element (distance) in ascending order. Closest ZIP code (user ZIP code itself) should be at the top.
5. Create an empty array `localResources`.
6. Iterate over `distances`. For each distance and ZIP code, get all resources with that ZIP code, add a `distance` field to each retrieved resource object, and add each object to the `localResources` array.
7. Add other necessary fields as per the response schema, and return the JSON response.

## Status Codes

### `200`

Return a response of the schema above.

### `400`

Conditions:

- Required fields missing:
  - `zip_code` not given when `max_radius != -1`
  - `max_radius` not given
- Type checking:
  - `zip_code` not a string
  - `max_radius` not a non-negative number or -1
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
