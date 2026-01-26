const phases = {
    // phase_name_in_snake_case : { start: "timestamp in GMT-5 (EST)", end: "timestamp in GMT-5 (EST)" }
    focus_group_1: { start: "2026-01-24T00:00:00-05:00", end: "2026-01-24T23:59:59-05:00" },
    TEST: { start: "2026-01-25T00:00:00-05:00", end: "2026-01-26T23:59:59-05:00" },
};

console.log(JSON.stringify(phases));