const phases = [
    // { name: "phase_name_in_snake_case", start: "timestamp in GMT-5 (EST)", end: "timestamp in GMT-5 (EST)" }
    { name: "focus_group_1", start: "2026-01-24T00:00:00-05:00", end: "2026-01-24T23:59:59-05:00" },
    { name: "TEST3", start: "2026-01-26T00:00:00-05:00", end: "2026-01-26T23:59:59-05:00" },
    { name: "TEST4", start: "2026-01-27T00:00:00-05:00", end: "2026-01-27T23:59:59-05:00" },
    { name: "TEST5.3", start: "2026-01-28T00:00:00-05:00", end: "2026-01-28T23:59:59-05:00" },
    { name: "demo_1-30-2026", start: "2026-01-30T09:00:00-05:00", end: "2026-01-30T10:00:00-05:00" },
    { name: "general_testing", start: "2026-01-30T10:00:00-05:00", end: "2026-02-06T23:59:59-05:00" }
];

console.log(JSON.stringify(phases));