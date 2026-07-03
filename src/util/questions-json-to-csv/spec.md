# Questions JSON to CSV

**Objective**: Convert a JSON file to a human-friendly CSV file `questions_dict.csv` that maps question and answer IDs to full text.

**Generation input**: this spec
**Generation output**: [`main.py`](./main.py)

**Script input**:

Command line arguments for

- The JSON file path (required) (show usage string if not provided)
- The output file path

  **Script output**: `questions_dict.csv` (via code; in the script's directory)

## CSV Format

- Follow the column order below
- `question` refers to each item in `questions`
- `options[i]` refers to the ith item (answer choice) in `question.options`
- Map values when indicated, otherwise leave as original JSON value
- Option columns are ordered by number and groups (e.g. "Answer 1 ID", "Answer 1 Text", "Answer 2 ID", "Answer 2 Text", etc.)
- If a value doesn't exist (like the 8th answer choice to a question with only 5 choices), leave blank

| JSON Key                                        | CSV Column Name   | Notes                                                         |
| ----------------------------------------------- | ----------------- | ------------------------------------------------------------- |
| `question.questionNumber` + '\_' +`question.id` | Question ID       | E.g. `21_notes2`                                              |
| `question.text`                                 | Question Text     |                                                               |
| `question.required`                             | Required          | `true` -> "TRUE"; `false` -> "FALSE"                          |
| `question.type`                                 | Type              | `"single"` -> "Single-select"; `"multiple"` -> "Multi-select" |
| `options[i].id`                                 | Answer <i+1> ID   |                                                               |
| `options[i].label`                              | Answer <i+1> Text |                                                               |

Total column count: varies, depending on maximum option count

## JSON Example

A question:

```js
{
  "questionNumber": 21,
  "id": "notes2",
  "text": "In the past 30 days, on how many days did you drink more than one alcoholic beverage?",
  "type": "single",
  "required": true,
  "options": [
    {
      "id": "1-2",
      "label": "1–2 days",
      // other fields...
    },
    {
      "id": "3-5",
      "label": "3–5 days",
      // other fields...
    },
    // ...
    {
      "id": "30",
      "label": "All 30 days",
      // other fields...
    }
  ]
  // other fields...
}
```
