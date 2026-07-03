import argparse
import csv
import json
from pathlib import Path
from typing import Any, List

SCRIPT_DIR = Path(__file__).resolve().parent
DEFAULT_OUTPUT_PATH = SCRIPT_DIR / "questions_dict.csv"
TYPE_MAP = {
    "single": "Single-select",
    "multiple": "Multi-select",
}


def load_questions(input_path: Path) -> List[dict[str, Any]]:
    with input_path.open("r", encoding="utf-8") as handle:
        data = json.load(handle)

    if isinstance(data, dict):
        if "questions" in data:
            data = data["questions"]
        else:
            raise ValueError(
                "Expected a list of questions or an object with a 'questions' field"
            )

    if not isinstance(data, list):
        raise ValueError("Expected the input JSON to contain a list of questions")

    return data


def build_headers(max_options: int) -> List[str]:
    headers = ["Question ID", "Question Text", "Required", "Type"]

    for index in range(1, max_options + 1):
        headers.extend([f"Answer {index} ID", f"Answer {index} Text"])

    return headers


def build_question_id(question: dict[str, Any]) -> str:
    parts = []
    if "questionNumber" in question:
        parts.append(str(question["questionNumber"]))
    if "id" in question:
        parts.append(str(question["id"]))
    return "_".join(parts)


def build_row(question: dict[str, Any], max_options: int) -> List[str]:
    row = [
        build_question_id(question),
        question.get("text", ""),
        (
            "TRUE"
            if question.get("required") is True
            else "FALSE" if question.get("required") is False else ""
        ),
        TYPE_MAP.get(question.get("type"), question.get("type", "")),
    ]

    options = question.get("options", [])
    for index in range(max_options):
        if index < len(options):
            option = options[index]
            row.extend([option.get("id", ""), option.get("label", "")])
        else:
            row.extend(["", ""])

    return row


def write_csv(headers: List[str], rows: List[List[str]], output_path: Path) -> None:
    with output_path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.writer(handle)
        writer.writerow(headers)
        writer.writerows(rows)


def convert_questions(input_path: Path, output_path: Path = DEFAULT_OUTPUT_PATH) -> None:
    questions = load_questions(input_path)
    max_options = max(
        (len(question.get("options", [])) for question in questions), default=0
    )
    headers = build_headers(max_options)
    rows = [build_row(question, max_options) for question in questions]
    write_csv(headers, rows, output_path)
    print(f"Wrote {len(rows)} rows to {output_path}")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Convert questionnaire JSON into a CSV mapping of question and answer IDs to text."
    )
    parser.add_argument("input_path", nargs="?", help="Path to the input questions JSON file")
    parser.add_argument(
        "-o",
        "--output",
        default=str(DEFAULT_OUTPUT_PATH),
        help="Path to the output CSV file (default: %(default)s)",
    )
    return parser.parse_args()


if __name__ == "__main__":
    args = parse_args()
    if not args.input_path:
        raise SystemExit("Usage: python3 main.py <input_path> [-o output_path]")

    convert_questions(Path(args.input_path), Path(args.output))
