// 1. Discard unwanted columns from CSV
export const DISCARD_KEYS = [
    "s3_timestamp",
    "uploaded_to_drive",
    "generated_as_csv",
    "data.surveyTitle",
    "data.surveyVersion",
    // "data.site",
    "drive_timestamp",
    "data.test.status",
    "data.test.type",
    "data.test",
    "data.testType",
    "valid"
];

// 2. Rename columns when flattening. Otherwise, only keep the deepest keys.
export const RENAME_KEYS = {
    "clientInfo.ip": "ip_addr",
    "clientInfo.timezone": "ip_timezone",
    "clientInfo.lat": "ip_lat",
    "clientInfo.lon": "ip_lon",
    "clientInfo.city": "ip_city",
    "clientInfo.region": "ip_region",
    "clientInfo.country": "ip_country",
    "data.gps.supported": "gps_supported",
    "data.gps.status": "gps_status",
    "data.gps.capturedAt": "gps_timestamp",
    "data.gps.coords.latitude": "gps_lat",
    "data.gps.coords.longitude": "gps_lon",
    "data.gps.coords.accuracy": "gps_accuracy",
    "data.gps.error.code": "gps_err_code",
    "data.gps.error.message": "gps_err_msg",
    "data.deviceID": "deviceId",
    "data.metadata.timezone": "metadata_timezone",
    "data.metadata.timezoneOffset": "metadata_timezoneOffset",
    "data.metadata.language": "metadata_lang",
    "data.query.branching": "query_branching",
    "data.query.test": "query_test",
    "data.isBranching": "isBranching",
    "data.isTest": "isTest",
    "data.language": "lang",
};

// 3. Order columns. _start columns will be right after their non-start counterparts. Those not listed here are mostly the survey answers themselves, which are at the end.
export const ORDERED_KEYS = [
    "id",
    "deviceId",
    "sessionId",
    "ip_addr",
    "ip_lat",
    "ip_lon",
    "ip_city",
    "ip_region",
    "ip_country",
    "ip_timezone",
    "gps_timestamp",
    "gps_supported",
    "gps_status",
    "gps_lat",
    "gps_lon",
    "gps_accuracy",
    "gps_err_code",
    "gps_err_msg",
    "userAgent",
    "platform",
    "screenResolution",
    "viewportSize",
    "metadata_timezone",
    "metadata_timezoneOffset",
    "metadata_lang",
    "query_test",
    "query_branching",
    "isTest",
    "isBranching",
    "timestamp",
    "mode",
    "completed",
    "site",
    "site_id",
    "lang"
];

// 4. Merge with completed = false entries with _start columns.
export const START_KEYS = [
    'timestamp',
    'ip_addr', 'ip_city', 'ip_region',
    'ip_country', 'ip_lat', 'ip_lon', 'ip_timezone',
];